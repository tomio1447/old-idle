/*
 * db.js — acesso ao banco.
 *
 * Usa MySQL (mysql2/promise) quando configurado via .env; se MYSQL_HOST
 * estiver vazio, cai num storage JSON local (arquivos em ./data) para
 * rodar/desenvolver sem servidor de banco. A API é a mesma para os dois:
 *   db.query(sql, params) -> rows
 *   db.run(sql, params)    -> result (insertId, affectedRows)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---- configuração via .env (MYSQL_HOST, MYSQL_USER, ...) ----
const MYSQL_HOST = process.env.MYSQL_HOST || "";
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASS = process.env.MYSQL_PASS || "";
const MYSQL_DB   = process.env.MYSQL_DB   || "global_idle";
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || "3306", 10);

let DATA_DIR = process.env.GLOBAL_IDLE_DATA_DIR
  ? path.resolve(process.env.GLOBAL_IDLE_DATA_DIR)
  : path.join(__dirname, "data");

function ensureDataDir() {
  const fallback = path.join(__dirname, "data");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
  } catch (e) {
    console.error("[db] DATA_DIR inacessível:", DATA_DIR, "-", e.message, "→ fallback", fallback);
    DATA_DIR = fallback;
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/* Storage JSON local (fallback sem MySQL): dois arquivos
 * data/accounts.json e data/characters.json */
function JsonStore() {
  ensureDataDir();
  this.accounts = this._load("accounts.json", []);
  this.characters = this._load("characters.json", []);
  // Saves anteriores à versão otimista começam na versão 1.
  for(const c of this.characters){
    if(!Number.isSafeInteger(Number(c.save_version))||Number(c.save_version)<1)c.save_version=1;
  }
  this.sessions = this._load("sessions.json", []);
  this.leases = this._load("leases.json", []);
  this.instances = this._load("instances.json", []);
  // null = parse falhou (arquivo truncado a meio de um _save antigo de 50MB+).
  // Reescreva no boot para não deixar lixo gigante no disco.
  const loadedSnapshots = this._load("snapshots.json", null);
  this.snapshots = Array.isArray(loadedSnapshots) ? loadedSnapshots : [];
  this._snapshotsDirty = !Array.isArray(loadedSnapshots);
  // parties/invites persistem em data/parties.json (convites assíncronos
  // precisam sobreviver a reinícios do servidor)
  const partyData = this._load("parties.json", null);
  if (partyData && Array.isArray(partyData.parties)) {
    this.parties = partyData.parties;
    this.invites = partyData.invites || [];
  } else {
    this.parties = [];
    this.invites = [];
  }
  // Migração transparente do formato antigo: a conta do líder é a dona da
  // party e a ordem dos membros deixa de depender da ordem incidental do JSON.
  // Se um legado tiver duas parties da mesma conta, preserva a mais antiga.
  const ownedParties=new Map(),validParties=[];
  this.parties.slice().sort((a,b)=>Number(a.id)-Number(b.id)).forEach((p)=>{
    const leader=this.characters.find((c)=>Number(c.id)===Number(p.leader_id));
    if(!p.owner_account_id&&leader)p.owner_account_id=Number(leader.account_id);
    const owner=Number(p.owner_account_id)||0;
    if(!owner||ownedParties.has(owner)){
      (this.invites||[]).forEach((i)=>{if(Number(i.party_id)===Number(p.id)&&i.status==="pending")i.status="cancelled";});
      return;
    }
    ownedParties.set(owner,p.id);
    if(!Number.isSafeInteger(Number(p.roster_version))||Number(p.roster_version)<1)p.roster_version=1;
    (p.members||[]).sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0))
      .forEach((m,index)=>{m.position=index+1;});
    validParties.push(p);
  });
  this.parties=validParties;
  // market (ofertas + stats + histórico) persiste em data/market.json
  const marketData = this._load("market.json", null);
  if (marketData && typeof marketData === "object") {
    this.marketStats = marketData.marketStats || {};
    this.marketHistoryArr = Array.isArray(marketData.marketHistoryArr)
      ? marketData.marketHistoryArr : [];
    this.market = Array.isArray(marketData.offers) ? marketData.offers : [];
  } else {
    this.marketStats = {};
    this.marketHistoryArr = [];
    this.market = [];
  }
  this._marketSeq = (this.market || []).reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
  // Cap histórico inchado de runs anteriores antes do primeiro _save do boot.
  const snapBefore = (this.snapshots || []).length;
  this._pruneSnapshots();
  if ((this.snapshots || []).length !== snapBefore) this._snapshotsDirty = true;
  this._save();
  this._partySave();
}
JsonStore.prototype._load = function (file, dft) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  } catch (e) { return dft; }
};
JsonStore.prototype._save = function () {
  fs.writeFileSync(path.join(DATA_DIR, "accounts.json"),
    JSON.stringify(this.accounts, null, 1));
  fs.writeFileSync(path.join(DATA_DIR, "characters.json"),
    JSON.stringify(this.characters, null, 1));
  fs.writeFileSync(path.join(DATA_DIR, "sessions.json"),
    JSON.stringify(this.sessions || [], null, 1));
  fs.writeFileSync(path.join(DATA_DIR, "leases.json"),
    JSON.stringify(this.leases || [], null, 1));
  fs.writeFileSync(path.join(DATA_DIR, "instances.json"),
    JSON.stringify(this.instances || [], null, 1));
  // snapshots.json pode passar de dezenas de MB. NÃO regrave no _save() de
  // login/lease/market — isso bloqueava o event loop e fazia 127.0.0.1 parecer
  // ping 999999. Snapshots só saem em _saveSnapshots() (dirty).
  if (this._snapshotsDirty) this._saveSnapshots();
  fs.writeFileSync(path.join(DATA_DIR, "market.json"),
    JSON.stringify({ offers: this.market || [],
                     marketStats: this.marketStats || {},
                     marketHistoryArr: this.marketHistoryArr || [] }, null, 1));
};
JsonStore.prototype._pruneSnapshots = function () {
  const list = Array.isArray(this.snapshots) ? this.snapshots : [];
  const byAccount = new Map();
  for (const row of list) {
    const key = String(row && row.account_id);
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(row);
  }
  const kept = [];
  for (const rows of byAccount.values()) {
    rows.sort((a, b) => Number(a.id) - Number(b.id));
    kept.push(...rows.slice(-50));
  }
  kept.sort((a, b) => Number(a.id) - Number(b.id));
  this.snapshots = kept;
};
JsonStore.prototype._saveSnapshots = function () {
  this._pruneSnapshots();
  this._snapshotsDirty = false;
  // Compacto: pretty-print de 50MB+ serializa por centenas de ms no Windows.
  fs.writeFileSync(path.join(DATA_DIR, "snapshots.json"),
    JSON.stringify(this.snapshots || []));
};
JsonStore.prototype._saveSessions = function () {
  fs.writeFileSync(path.join(DATA_DIR, "sessions.json"),
    JSON.stringify(this.sessions || [], null, 1));
};
JsonStore.prototype._saveLeases = function () {
  fs.writeFileSync(path.join(DATA_DIR, "leases.json"),
    JSON.stringify(this.leases || [], null, 1));
};
/* O tick autoritativo local acontece várias vezes por segundo. Chamar `_save()`
   nele reserializava accounts, sessions, leases, até 500 snapshots e market mesmo
   sem nenhuma mudança nesses dados. Em disco do Windows isso fazia uma API
   em 127.0.0.1 parecer uma conexão remota de ping altíssimo. Persista apenas
   os dois arquivos realmente alterados, sem pretty-print, e com debounce. */
JsonStore.prototype._flushRuntime = function () {
  if (this._runtimeFlushTimer) {
    clearTimeout(this._runtimeFlushTimer);
    this._runtimeFlushTimer = null;
  }
  if (!this._runtimeDirty) return;
  const withCharacters = !!this._runtimeDirtyChars;
  this._runtimeDirty = false;
  this._runtimeDirtyChars = false;
  this._runtimeSavedAt = Date.now();
  if (withCharacters) fs.writeFileSync(path.join(DATA_DIR, "characters.json"),
    JSON.stringify(this.characters));
  fs.writeFileSync(path.join(DATA_DIR, "instances.json"),
    JSON.stringify(this.instances || []));
};
JsonStore.prototype._saveRuntime = function (withCharacters, immediate) {
  this._runtimeDirty = true;
  if (withCharacters) this._runtimeDirtyChars = true;
  if (immediate) { this._flushRuntime(); return; }
  const now = Date.now();
  const due = (this._runtimeSavedAt || 0) + 800;
  if (now >= due) { this._flushRuntime(); return; }
  if (!this._runtimeFlushTimer) {
    this._runtimeFlushTimer = setTimeout(() => {
      this._runtimeFlushTimer = null;
      this._flushRuntime();
    }, Math.max(16, due - now));
  }
};
JsonStore.prototype._nextId = function (arr) {
  return arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
};
JsonStore.prototype.findAccountByLogin = function (login) {
  return this.accounts.find((a) => a.login === login) || null;
};
JsonStore.prototype.findAccountById = function (id) {
  return this.accounts.find((a) => a.id === Number(id)) || null;
};
JsonStore.prototype.findAccountByToken = function (token) {
  const now=Date.now();
  const session = (this.sessions || []).find((s) => s.token === String(token)&&
    (!s.expires_at||new Date(s.expires_at).getTime()>now));
  return session ? this.findAccountById(session.account_id) : null;
};
JsonStore.prototype.createSession = function (accountId, token, expiresAt) {
  this.sessions = (this.sessions || []).filter((s) => s.account_id !== Number(accountId));
  this.sessions.push({
    id: this._nextId(this.sessions), account_id:Number(accountId), token:String(token),
    created_at:new Date().toISOString(),expires_at:expiresAt?new Date(expiresAt).toISOString():null,
  });
  this._saveSessions();
  return token;
};
JsonStore.prototype.revokeSession = function(token){const before=(this.sessions||[]).length;
  this.sessions=(this.sessions||[]).filter((s)=>s.token!==String(token));if(this.sessions.length!==before)this._saveSessions();return this.sessions.length!==before;};
JsonStore.prototype.pruneExpiredSessions=function(now){const before=(this.sessions||[]).length;
  this.sessions=(this.sessions||[]).filter((s)=>!s.expires_at||new Date(s.expires_at).getTime()>now);if(this.sessions.length!==before)this._saveSessions();return before-this.sessions.length;};
JsonStore.prototype.leaseAcquire = function(accountId,holderId,previousHolderId,presentedHash,newHash,now,expiresAt){
  this.leases=this.leases||[];
  let row=this.leases.find((lease)=>Number(lease.account_id)===Number(accountId));
  const active=row&&new Date(row.expires_at).getTime()>now;
  if(active&&(row.holder_id===holderId||row.holder_id===previousHolderId)&&row.secret_hash===presentedHash){
    row.holder_id=holderId;row.renewed_at=new Date(now).toISOString();
    row.expires_at=new Date(expiresAt).toISOString();this._saveLeases();
    return {ok:true,resumed:true,lease:row};
  }
  if(active)return {ok:false,error:"LEASE_HELD",lease:row};
  if(!row){row={account_id:Number(accountId)};this.leases.push(row);}
  Object.assign(row,{holder_id:holderId,secret_hash:newHash,acquired_at:new Date(now).toISOString(),
    renewed_at:new Date(now).toISOString(),expires_at:new Date(expiresAt).toISOString()});
  this._saveLeases();return {ok:true,resumed:false,lease:row};
};
JsonStore.prototype.leaseTakeover = function(accountId,holderId,newHash,now,expiresAt){
  this.leases=this.leases||[];
  let row=this.leases.find((lease)=>Number(lease.account_id)===Number(accountId));
  if(!row){row={account_id:Number(accountId)};this.leases.push(row);}
  Object.assign(row,{holder_id:holderId,secret_hash:newHash,acquired_at:new Date(now).toISOString(),
    renewed_at:new Date(now).toISOString(),expires_at:new Date(expiresAt).toISOString()});
  this._saveLeases();return {ok:true,lease:row};
};
JsonStore.prototype.leaseRenew = function(accountId,holderId,secretHash,now,expiresAt){
  const row=(this.leases||[]).find((lease)=>Number(lease.account_id)===Number(accountId));
  if(!row||row.holder_id!==holderId||row.secret_hash!==secretHash||new Date(row.expires_at).getTime()<=now)
    return {ok:false,error:"LEASE_LOST",lease:row||null};
  row.renewed_at=new Date(now).toISOString();row.expires_at=new Date(expiresAt).toISOString();this._saveLeases();
  return {ok:true,lease:row};
};
JsonStore.prototype.leaseValidate = function(accountId,holderId,secretHash,now){
  const row=(this.leases||[]).find((lease)=>Number(lease.account_id)===Number(accountId));
  return !!(row&&row.holder_id===holderId&&row.secret_hash===secretHash&&new Date(row.expires_at).getTime()>now);
};
JsonStore.prototype.leaseRelease = function(accountId,holderId,secretHash){
  const before=(this.leases||[]).length;
  this.leases=(this.leases||[]).filter((row)=>!(Number(row.account_id)===Number(accountId)&&
    row.holder_id===holderId&&row.secret_hash===secretHash));
  if(this.leases.length!==before)this._saveLeases();return this.leases.length!==before;
};
JsonStore.prototype.instanceGet = function(accountId){
  return (this.instances||[]).find((row)=>Number(row.account_id)===Number(accountId))||null;
};
JsonStore.prototype.instanceGetByParty = function(partyId){
  return (this.instances||[]).find((row)=>row.status==="active"&&Number(row.party_id)===Number(partyId))||null;
};
JsonStore.prototype.instanceSave = function(accountId,instanceId,expectedVersion,meta,state,lease){
  if(!this.leaseValidate(accountId,lease.holderId,lease.secretHash,lease.now))
    return {ok:false,error:"LEASE_REQUIRED"};
  if(meta.party_id){
    const party=(this.parties||[]).find((p)=>Number(p.id)===Number(meta.party_id));
    const members=party?(party.members||[]).slice().sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)):[];
    const order=party?[Number(party.leader_id)].concat(members.map((m)=>Number(m.character_id))):[];
    if(!party||Number(party.owner_account_id)!==Number(accountId)||
       Number(party.roster_version)!==Number(meta.party_version)||order.length!==meta.member_ids.length||
       order.some((id,index)=>id!==meta.member_ids[index]))return {ok:false,error:"INSTANCE_PARTY_CONFLICT"};
  }
  this.instances=this.instances||[];let row=this.instanceGet(accountId);
  if(row&&row.status==="active"){
    if(Number(row.version)!==Number(expectedVersion)||String(row.instance_id)!==String(instanceId||""))
      return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
    row.version=Number(row.version)+1;
  }else{
    if(Number(expectedVersion)!==0)return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
    if(!row){row={account_id:Number(accountId)};this.instances.push(row);}
    row.instance_id=instanceId;row.version=1;
    row.started_at=meta.started_at||meta.startedAt||meta.saved_at||new Date().toISOString();
    row.worker_total_ms=0;
  }
  Object.assign(row,meta,{state,status:"active",ended_at:null,terminal_reason:null,
    worker_cursor_at:new Date(meta.saved_at).toISOString(),worker_total_ms:Number(row.worker_total_ms)||0,
    updated_at:new Date(lease.now).toISOString()});
  this._saveRuntime(false);return {ok:true,instance:row};
};
JsonStore.prototype.instancePatchState = function(ownerAccountId,requesterAccountId,instanceId,expectedVersion,patchState,lease){
  if(!this.leaseValidate(requesterAccountId,lease.holderId,lease.secretHash,lease.now))
    return {ok:false,error:"LEASE_REQUIRED"};
  const row=this.instanceGet(ownerAccountId);if(!row||row.status!=="active")return {ok:false,error:"INSTANCE_NOT_ACTIVE"};
  if(String(row.instance_id)!==String(instanceId||"")||Number(row.version)!==Number(expectedVersion))
    return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
  const next=patchState(row.state);if(!next)return {ok:false,error:"INSTANCE_PATCH_REJECTED",instance:row};
  row.state=next;row.version=Number(row.version)+1;row.updated_at=new Date(lease.now).toISOString();
  this._saveRuntime(false);return {ok:true,instance:row};
};
JsonStore.prototype.instanceWorkerCandidates = function(limit){
  return (this.instances||[]).filter((row)=>row.status==="active")
    .sort((a,b)=>new Date(a.worker_cursor_at||a.saved_at)-new Date(b.worker_cursor_at||b.saved_at))
    .slice(0,Math.max(1,Number(limit)||50)).map((row)=>Number(row.account_id));
};
JsonStore.prototype.instanceWorkerClaim = function(accountId,now,maxStep,minStep,advanceState){
  const row=this.instanceGet(accountId);if(!row||row.status!=="active")return {ok:false,skipped:"inactive"};
  const lease=(this.leases||[]).find((item)=>Number(item.account_id)===Number(accountId));
  if(lease&&new Date(lease.expires_at).getTime()>now)return {ok:false,skipped:"leased"};
  const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
  const elapsed=Math.min(Math.max(0,now-cursor),Math.max(1,Number(maxStep)||3600000));
  if(elapsed<Math.max(1,Number(minStep)||500))return {ok:false,skipped:"not-due"};
  const checkpoint=cursor+elapsed,advanced=advanceState(row.state,elapsed,checkpoint);
  const next=advanced&&typeof advanced==="object"&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
  row.state=next.state;row.version=Number(row.version)+1;row.saved_at=new Date(checkpoint).toISOString();
  row.worker_cursor_at=row.saved_at;row.worker_total_ms=(Number(row.worker_total_ms)||0)+elapsed;
  if(next.terminalReason){row.status="ended";row.terminal_reason=next.terminalReason;row.ended_at=row.saved_at;}
  for(const projection of next.characters||[]){const c=this.findCharacter(projection.id);
    if(!c)continue;c.data=projection.data;c.level=projection.level;c.voc=projection.voc;
    c.hp=projection.hp;c.mp=projection.mp;c.max_hp=projection.max_hp;c.max_mp=projection.max_mp;
    c.save_version=(Number(c.save_version)||0)+1;c.updated_at=new Date(now).toISOString();}
  if(typeof this.syncAccountGoldFromCharacters==="function")this.syncAccountGoldFromCharacters(next.characters||[]);
  row.updated_at=new Date(now).toISOString();this._saveRuntime(true);
  return {ok:true,accountId:Number(accountId),elapsed,version:Number(row.version),terminalReason:next.terminalReason||null};
};
JsonStore.prototype.instanceAuthorityTick = function(accountId,expectedVersion,now,maxStep,advanceState,lease){
  if(!this.leaseValidate(accountId,lease.holderId,lease.secretHash,lease.now))return {ok:false,error:"LEASE_REQUIRED"};
  const row=this.instanceGet(accountId);if(!row||row.status!=="active")return {ok:false,error:"INSTANCE_NOT_ACTIVE"};
  if(expectedVersion!==null&&expectedVersion!==undefined&&Number(row.version)!==Number(expectedVersion))
    return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
  const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
  const elapsed=Math.min(Math.max(0,now-cursor),Math.max(100,Number(maxStep)||10000));
  if(elapsed<50)return {ok:true,instance:row,characters:[],elapsed:0};
  const advanced=advanceState(row.state,elapsed,now),next=advanced&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
  row.state=next.state;row.version=Number(row.version)+1;row.saved_at=new Date(now).toISOString();row.worker_cursor_at=row.saved_at;
  if(next.terminalReason){row.status="ended";row.terminal_reason=next.terminalReason;row.ended_at=row.saved_at;}
  const changed=[];for(const projection of next.characters||[]){const c=this.findCharacter(projection.id);
    if(!c)continue;c.data=projection.data;c.level=projection.level;c.voc=projection.voc;
    c.hp=projection.hp;c.mp=projection.mp;c.max_hp=projection.max_hp;c.max_mp=projection.max_mp;
    c.save_version=(Number(c.save_version)||0)+1;c.updated_at=row.saved_at;changed.push(c);}
  if(typeof this.syncAccountGoldFromCharacters==="function")this.syncAccountGoldFromCharacters(next.characters||[]);
  row.updated_at=row.saved_at;this._saveRuntime(true);return {ok:true,instance:row,characters:changed,elapsed,
    terminalReason:next.terminalReason||null};
};
JsonStore.prototype.instanceEnd = function(accountId,instanceId,expectedVersion,reason,lease){
  if(!this.leaseValidate(accountId,lease.holderId,lease.secretHash,lease.now))
    return {ok:false,error:"LEASE_REQUIRED"};
  const row=this.instanceGet(accountId);
  if(!row||row.status!=="active")return {ok:true,instance:row||null,alreadyEnded:true};
  if(Number(row.version)!==Number(expectedVersion)||String(row.instance_id)!==String(instanceId||""))
    return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
  row.version=Number(row.version)+1;row.status="ended";row.terminal_reason=reason;
  row.ended_at=new Date(lease.now).toISOString();row.updated_at=row.ended_at;
  this._saveRuntime(false,true);return {ok:true,instance:row};
};
JsonStore.prototype.createAccount = function (login, hash, role, coins) {
  const acc = { id: this._nextId(this.accounts), login, password_hash: hash,
                role: role || "user", coins: coins || 0, gold: 0, gold_migrated: true,
                vip_until: 0, market_gold: 0,
                created_at: new Date().toISOString() };
  this.accounts.push(acc);
  this._save();
  return acc;
};
JsonStore.prototype.updateCoins = function (id, coins) {
  const a = this.findAccountById(id);
  if (a) { a.coins = Math.max(0, coins); this._save(); return a; }
  return null;
};
JsonStore.prototype.accountGold = function (accountId) {
  const a = this.findAccountById(accountId);
  return a ? Math.max(0, Math.floor(Number(a.gold) || 0)) : 0;
};
JsonStore.prototype.setAccountGold = function (accountId, gold) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.gold = Math.max(0, Math.floor(Number(gold) || 0));
  this._save();
  return a;
};
JsonStore.prototype.setAccountVipUntil = function (accountId, vipUntil) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.vip_until = Math.max(0, Math.floor(Number(vipUntil) || 0));
  this._save();
  return a;
};
JsonStore.prototype.setAccountMissions = function (accountId, missions, missionsDone) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.missions = missions && typeof missions === "object" && !Array.isArray(missions) ? missions : {};
  a.missionsDone = missionsDone && typeof missionsDone === "object" && !Array.isArray(missionsDone)
    ? missionsDone : {};
  this._save();
  return a;
};
/* Soma gold dos personagens para a conta uma vez; espelha o saldo nos chars. */
JsonStore.prototype.migrateAccountGold = function (accountId) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  if (a.gold_migrated) {
    a.gold = Math.max(0, Math.floor(Number(a.gold) || 0));
    return a;
  }
  let total = Math.max(0, Math.floor(Number(a.gold) || 0));
  const chars = this.charactersOf(accountId);
  for (const c of chars) {
    let data = {};
    try { data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { data = {}; }
    const g = Number(data.gold);
    if (Number.isFinite(g) && g > 0) total += Math.floor(g);
    data.gold = 0;
    c.data = typeof c.data === "string" ? JSON.stringify(data) : data;
  }
  a.gold = total;
  a.gold_migrated = true;
  for (const c of chars) {
    let data = {};
    try { data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { data = {}; }
    data.gold = a.gold;
    c.data = JSON.stringify(data);
  }
  this._save();
  return a;
};
JsonStore.prototype.syncAccountGoldFromCharacters = function (projections) {
  const byAccount = new Map();
  for (const proj of projections || []) {
    const c = this.findCharacter(proj.id);
    if (!c) continue;
    let data = {};
    try { data = typeof proj.data === "string" ? JSON.parse(proj.data) : (proj.data || {}); } catch (e) { data = {}; }
    const gold = Math.max(0, Math.floor(Number(data.gold) || 0));
    const aid = Number(c.account_id);
    const prev = byAccount.get(aid);
    if (!prev || gold !== prev.gold) byAccount.set(aid, { gold, accountId: aid });
  }
  for (const entry of byAccount.values()) {
    const a = this.findAccountById(entry.accountId);
    if (!a) continue;
    a.gold = entry.gold;
    a.gold_migrated = true;
    for (const c of this.charactersOf(entry.accountId)) {
      let data = {};
      try { data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { data = {}; }
      data.gold = entry.gold;
      c.data = JSON.stringify(data);
    }
  }
  if (byAccount.size) this._save();
};
JsonStore.prototype.charactersOf = function (accountId) {
  return this.characters.filter((c) => c.account_id === Number(accountId));
};
JsonStore.prototype.findCharacterByName = function (name) {
  return this.characters.find((c) => c.name.toLowerCase() === String(name).toLowerCase()) || null;
};
JsonStore.prototype.findCharacter = function (id) {
  return this.characters.find((c) => c.id === Number(id)) || null;
};
JsonStore.prototype.createCharacter = function (accountId, name, voc, level, data) {
  const c = { id: this._nextId(this.characters), account_id: Number(accountId),
              name, voc, level, data, save_version:0, zone: "unknown",
              hp: 0, mp: 0, max_hp: 0, max_mp: 0,
              created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  this.characters.push(c);
  this._save();
  return c;
};
JsonStore.prototype.updateCharacter = function (id, voc, level, data, extra) {
  const c = this.findCharacter(id);
  if (c) {
    c.voc = voc; c.level = level; c.data = data;
    c.save_version=(Number(c.save_version)||0)+1;
    if (extra) {
      if (extra.zone !== undefined) c.zone = extra.zone;
      if (extra.hp !== undefined) c.hp = extra.hp;
      if (extra.mp !== undefined) c.mp = extra.mp;
      if (extra.max_hp !== undefined) c.max_hp = extra.max_hp;
      if (extra.max_mp !== undefined) c.max_mp = extra.max_mp;
    }
    c.updated_at = new Date().toISOString();
    this._save();
  }
  return c;
};
JsonStore.prototype.saveCharactersVersioned = function (accountId, saves, lease) {
  if(lease&&!this.leaseValidate(accountId,lease.holderId,lease.secretHash,lease.now))
    return {ok:false,error:"LEASE_REQUIRED"};
  const rows=saves.map((save)=>this.findCharacter(save.id));
  const missing=saves.filter((save,index)=>!rows[index]||Number(rows[index].account_id)!==Number(accountId));
  if(missing.length)return {ok:false,error:"CHARACTER_NOT_FOUND",ids:missing.map((save)=>Number(save.id))};
  const conflicts=rows.filter((row,index)=>Number(row.save_version)!==Number(saves[index].expectedVersion));
  if(conflicts.length)return {ok:false,error:"SAVE_VERSION_CONFLICT",characters:conflicts};
  rows.forEach((row,index)=>{
    const save=saves[index],extra=save.extra||{};
    row.voc=save.voc;row.level=save.level;row.data=save.data;
    row.save_version=Number(row.save_version)+1;
    if(extra.zone!==undefined)row.zone=extra.zone;
    if(extra.hp!==undefined)row.hp=extra.hp;
    if(extra.mp!==undefined)row.mp=extra.mp;
    if(extra.max_hp!==undefined)row.max_hp=extra.max_hp;
    if(extra.max_mp!==undefined)row.max_mp=extra.max_mp;
    row.updated_at=new Date().toISOString();
  });
  this._save();
  return {ok:true,characters:rows};
};
JsonStore.prototype.savePartyCharactersVersioned = function (accountId, partyId,
    expectedPartyVersion, expectedOrder, saves, lease) {
  if(lease&&!this.leaseValidate(accountId,lease.holderId,lease.secretHash,lease.now))
    return {ok:false,error:"LEASE_REQUIRED"};
  const p=(this.parties||[]).find((party)=>Number(party.id)===Number(partyId));
  if(!p||Number(p.owner_account_id)!==Number(accountId))return {ok:false,error:"PARTY_NOT_OWNER"};
  if(Number(p.roster_version)!==Number(expectedPartyVersion))
    return {ok:false,error:"PARTY_VERSION_CONFLICT",party:p};
  const members=(p.members||[]).slice().sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0));
  const order=[Number(p.leader_id)].concat(members.map((m)=>Number(m.character_id)));
  if(order.length!==expectedOrder.length||order.some((id,index)=>id!==Number(expectedOrder[index])))
    return {ok:false,error:"PARTY_VERSION_CONFLICT",party:p};
  const controlled=order.filter((id)=>{
    const c=this.findCharacter(id);return c&&Number(c.account_id)===Number(accountId);
  });
  if(controlled.length!==saves.length||controlled.some((id)=>!saves.some((save)=>Number(save.id)===id)))
    return {ok:false,error:"PARTY_SAVE_SET_MISMATCH"};
  return this.saveCharactersVersioned(accountId,saves,lease);
};
JsonStore.prototype.setCharacterZone = function (id, zone) {
  const c = this.findCharacter(id);
  if (c) { c.zone = zone; this._save(); return c; }
  return null;
};
JsonStore.prototype._marketSeq = 1;
JsonStore.prototype._nextOfferId = function () {
  this._marketSeq += 1;
  return this._marketSeq;
};
JsonStore.prototype.createMarketOffer = function (offer) {
  offer.id = this._nextOfferId();
  offer.status = "active";
  offer.created_at = new Date().toISOString();
  this.market = this.market || [];
  this.market.push(offer);
  this._save();
  return offer;
};
JsonStore.prototype.marketOffers = function (filter) {
  this.market = this.market || [];
  const now = Date.now();
  return this.market.filter((o) => {
    if (o.status !== "active") return false;
    if (filter.kind && o.kind !== filter.kind) return false;
    if (filter.tier !== undefined && filter.tier !== "" &&
        o.tier !== Number(filter.tier)) return false;
    if (filter.seller && o.seller_id !== Number(filter.seller)) return false;
    if (filter.slug && o.slug !== filter.slug) return false;
    if (o.expires_at && new Date(o.expires_at).getTime() < now) {
      o.status = "expired";
      this._save();
      return false;
    }
    return true;
  }).sort((a, b) => a.price - b.price);
};
JsonStore.prototype.findMarketOffer = function (id) {
  this.market = this.market || [];
  return this.market.find((o) => o.id === Number(id)) || null;
};
JsonStore.prototype.updateMarketOffer = function (id, patch) {
  const o = this.findMarketOffer(id);
  if (o) { Object.assign(o, patch); this._save(); }
  return o;
};
JsonStore.prototype.sellerOffers = function (sellerId) {
  this.market = this.market || [];
  return this.market.filter((o) => o.seller_id === Number(sellerId));
};
JsonStore.prototype.accountMarketGold = function (accountId) {
  const a = this.findAccountById(accountId);
  return a ? (a.market_gold || 0) : 0;
};
JsonStore.prototype.addAccountMarketGold = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (a) { a.market_gold = (a.market_gold || 0) + Math.max(0, amount); this._save(); }
};
JsonStore.prototype.payMarketFee = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (!a || (a.market_gold || 0) < amount) return false;
  a.market_gold = (a.market_gold || 0) - amount;
  this._save();
  return true;
};
JsonStore.prototype.refundMarketFee = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (!a) return;
  a.market_gold = (a.market_gold || 0) + amount;
  this._save();
};
JsonStore.prototype.payMarketGold = function (accountId, amount) {
  return this.payMarketFee(accountId, amount);
};
JsonStore.prototype.claimMarketGold = function (accountId) {
  return 0;
};
JsonStore.prototype.marketTransferGold=function(accountId,charId,expectedVersion,amount,direction,lease){
  if(!this.leaseValidate(accountId,lease.holderId,lease.secretHash,lease.now))return {ok:false,error:"LEASE_REQUIRED"};
  const account=this.migrateAccountGold(accountId),character=this.findCharacter(charId);
  if(!account||!character||Number(character.account_id)!==Number(accountId))return {ok:false,error:"CHARACTER_NOT_FOUND"};
  if(Number(character.save_version)!==Number(expectedVersion))return {ok:false,error:"SAVE_VERSION_CONFLICT",character};
  let data={};try{data=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
  account.gold=Math.max(0,Math.floor(Number(account.gold)||0));account.market_gold=Math.max(0,Number(account.market_gold)||0);
  if(direction==="deposit"){if(account.gold<amount)return {ok:false,error:"CHARACTER_GOLD_LOW"};account.gold-=amount;account.market_gold+=amount;}
  else{if(account.market_gold<amount)return {ok:false,error:"BANK_GOLD_LOW"};account.market_gold-=amount;account.gold+=amount;}
  data.gold=account.gold;
  character.data=JSON.stringify(data);character.save_version=Number(character.save_version)+1;character.updated_at=new Date(lease.now).toISOString();
  for(const sibling of this.charactersOf(accountId)){
    if(Number(sibling.id)===Number(character.id))continue;
    let sd={};try{sd=typeof sibling.data==="string"?JSON.parse(sibling.data):(sibling.data||{});}catch(e){sd={};}
    sd.gold=account.gold;sibling.data=JSON.stringify(sd);
  }
  this._save();return {ok:true,character,bank:account.market_gold,gold:account.gold};
};
JsonStore.prototype.recordSale = function (slug, tier, price) {
  this.marketStats = this.marketStats || {};
  const key = slug + ":" + (tier || 0);
  const s = this.marketStats[key] || { count: 0, total: 0, last_price: 0 };
  s.count += 1;
  s.total += price;
  s.last_price = price;
  this.marketStats[key] = s;
  this._save();
};
JsonStore.prototype.itemStats = function (slug, tier) {
  this.marketStats = this.marketStats || {};
  const s = this.marketStats[slug + ":" + (tier || 0)];
  if (!s) return null;
  return { count: s.count, avg: Math.round(s.total / Math.max(1, s.count)), last: s.last_price };
};
JsonStore.prototype.addMarketHistory = function (rec) {
  this.marketHistoryArr = this.marketHistoryArr || [];
  this.marketHistoryArr.unshift({
    id: this.marketHistoryArr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1,
    seller_id: rec.seller_id, seller_name: rec.seller_name || "",
    buyer_id: rec.buyer_id || null, buyer_name: rec.buyer_name || "",
    kind: rec.kind || "item", slug: rec.slug || null, tier: rec.tier || 0,
    qty: rec.qty || 1, price: rec.price || 0, price_tc: rec.price_tc ? 1 : 0,
    created_at: new Date().toISOString(),
  });
  if (this.marketHistoryArr.length > 600) this.marketHistoryArr.length = 600;
  this._save();
};
JsonStore.prototype.marketHistory = function (limit) {
  this.marketHistoryArr = this.marketHistoryArr || [];
  return this.marketHistoryArr.slice(0, Math.min(600, Math.max(1, Number(limit) || 100)));
};
JsonStore.prototype._rankingMetric = function (c, by) {
  let d = {};
  try { d = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { d = {}; }
  const skills = d.skills || {};
  const level = Math.floor(Number(c.level) || 1);
  if (by === "kills") return Math.floor(Number(d.totalKills) || 0);
  if (by === "magic") return Math.floor(Number(d.ml) || 0);
  if (by === "sword") return Math.floor(Number(skills.sword) || 10);
  if (by === "fist") return Math.floor(Number(skills.fist) || 10);
  if (by === "club") return Math.floor(Number(skills.club) || 10);
  if (by === "axe") return Math.floor(Number(skills.axe) || 10);
  if (by === "distance" || by === "dist") return Math.floor(Number(skills.dist) || 10);
  return level;
};
JsonStore.prototype.rankings = function (by, limit) {
  limit = Math.min(100, Math.max(1, Number(limit) || 50));
  by = String(by || "level").toLowerCase();
  if (by === "dist") by = "distance";
  const chars = Array.isArray(this.characters) ? this.characters
    : Object.keys(this.characters || {}).map((k) => this.characters[k]);
  let rows = chars.map((c) => {
    const value = this._rankingMetric(c, by);
    const row = { id: c.id, name: c.name, voc: c.voc, level: Math.floor(Number(c.level) || 1), value };
    if (by === "kills") row.totalKills = value;
    return row;
  });
  rows.sort((a, b) => (b.value - a.value) || (b.level - a.level) || String(a.name).localeCompare(String(b.name)));
  return rows.slice(0, limit);
};

/* Contagem pública: personagens online (lease ativo) + stub offlineHunting. */
JsonStore.prototype.onlineCount = function () {
  const now = Date.now();
  const offlineHunting = 0; // stub: caçadas em instâncias offline (futuro)
  const leases = (this.leases || []).filter((l) => l && l.expires_at &&
    new Date(l.expires_at).getTime() > now);
  const leasedAccounts = new Set(leases.map((l) => Number(l.account_id)));
  const activeInstances = (this.instances || []).filter((r) => r && r.status === "active");
  const charIds = new Set();
  for (const row of activeInstances) {
    let state = null;
    try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
    const fromAuth = ((state && state.authority && state.authority.players) || [])
      .map((p) => Number(p && p.id));
    const fromMembers = ((state && state.members) || []).map((m) => Number(m && m.id));
    const ids = fromAuth.length ? fromAuth : fromMembers;
    if (!ids.length && row.active_character_id) ids.push(Number(row.active_character_id));
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const c = this.findCharacter(id);
      if (c && leasedAccounts.has(Number(c.account_id))) charIds.add(id);
    }
  }
  const accountsWithChars = new Set();
  for (const id of charIds) {
    const c = this.findCharacter(id);
    if (c) accountsWithChars.add(Number(c.account_id));
  }
  let cityOnline = 0;
  for (const accId of leasedAccounts) {
    if (!accountsWithChars.has(accId)) cityOnline++;
  }
  const onlineChars = charIds.size + cityOnline;
  return {
    onlineChars,
    offlineHunting,
    total: onlineChars + offlineHunting,
    leases: leases.length,
    instances: activeInstances.length,
  };
};

/* --------------------------- SNAPSHOT HISTORY --------------------------- */
JsonStore.prototype.snapshotAdd=function(accountId,entityType,entityId,version,reason,data,force){
  this.snapshots=this.snapshots||[];const now=Date.now(),type=String(entityType),id=String(entityId);
  const recent=[...this.snapshots].reverse().find((s)=>Number(s.account_id)===Number(accountId)&&s.entity_type===type&&s.entity_id===id);
  if(!force&&recent&&now-new Date(recent.created_at).getTime()<60000)return recent;
  const serialized=typeof data==="string"?data:JSON.stringify(data||{}),row={id:this._nextId(this.snapshots),
    account_id:Number(accountId),entity_type:type,entity_id:id,version:Number(version)||0,reason:String(reason||"checkpoint").slice(0,40),
    checksum:crypto.createHash("sha256").update(serialized).digest("hex"),data:serialized,created_at:new Date(now).toISOString()};
  this.snapshots.push(row);
  this._snapshotsDirty=true;
  this._saveSnapshots();
  return row;
};
JsonStore.prototype.snapshotList=function(accountId,limit){return (this.snapshots||[]).filter((s)=>Number(s.account_id)===Number(accountId))
  .sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));};

/* ------------------------------ PARTY ------------------------------ */

/* Storage JSON: parties vivem em memoria + data/parties.json (para os
 * convites sobreviverem a reinicios do servidor durante dev/teste). */
/* IDs de party/convite SEMPRE acima do maior existente — o seq em memória
 * reseta no restart e causaria COLISÃO com ids de parties/invites antigos
 * persistidos em data/parties.json (bug: após reiniciar, uma party nova
 * pegava o id de uma antiga e o state vinha com os membros errados). */
JsonStore.prototype._nextPartyId = function () {
  return (this.parties || []).reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
};
JsonStore.prototype._nextInviteId = function () {
  return (this.invites || []).reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
};
JsonStore.prototype._partySave = function () {
  try {
    fs.writeFileSync(path.join(DATA_DIR, "parties.json"),
      JSON.stringify({ parties: this.parties || [], invites: this.invites || [] }, null, 1));
  } catch (e) { /* não bloqueia o jogo */ }
};
JsonStore.prototype.partyCreate = function (leaderChar) {
  this.parties = this.parties || [];
  this.invites = this.invites || [];
  if(this.partyFindByAccount(leaderChar.account_id)){
    const error=new Error("account already owns a party");error.code="ER_DUP_ENTRY";throw error;
  }
  const p = {
    id: this._nextPartyId(), owner_account_id:Number(leaderChar.account_id),
    roster_version:1,leader_id: leaderChar.id, leader_name: leaderChar.name,
    leader_zone: "unknown", leader_hunt: null, leader_instance: null,
    leader_otbm: null, leader_boss: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    members: [],
  };
  this.parties.push(p);
  this._partySave();
  return p;
};
JsonStore.prototype.partyFindByAccount = function (accountId) {
  this.parties = this.parties || [];
  return this.parties.find((p) => Number(p.owner_account_id)===Number(accountId)) || null;
};
JsonStore.prototype.partyFindByLeader = function (charId) {
  this.parties = this.parties || [];
  return this.parties.find((p) => p.leader_id === Number(charId)) || null;
};
JsonStore.prototype.partyFindByCharacter = function (charId) {
  this.parties = this.parties || [];
  const id = Number(charId);
  return this.parties.find((p) =>
    p.leader_id === id || (p.members || []).some((m) => m.character_id === id)) || null;
};
JsonStore.prototype.partyMembers = function (partyId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return [];
  return (p.members || []).slice().sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0))
    .map((m) => {
      const c = this.findCharacter(m.character_id);
      return {
        id: m.character_id, name: c ? c.name : "?", voc: c ? c.voc : "none",
        level: c ? c.level : 1, account_id: c ? c.account_id : null,
        position:Number(m.position)||1,
        follow_nonce: m.follow_nonce || null, follow_hunt: m.follow_hunt || null,
        follow_instance: m.follow_instance || null, follow_otbm: m.follow_otbm || null,
        follow_boss: m.follow_boss || null,
      };
    });
};
JsonStore.prototype.partyAddMember = function (partyId, charId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return;
  p.members = p.members || [];
  if (!p.members.some((m) => m.character_id === Number(charId))) {
    const position=p.members.reduce((max,m)=>Math.max(max,Number(m.position)||0),0)+1;
    p.members.push({ character_id: Number(charId), position,
      joined_at: new Date().toISOString() });
    p.roster_version=(Number(p.roster_version)||1)+1;
  }
  p.updated_at = new Date().toISOString();
  this._partySave();
};
JsonStore.prototype.partyReorder = function (partyId, expectedVersion, memberIds) {
  const p=(this.parties||[]).find((x)=>x.id===Number(partyId));
  if(!p||Number(p.roster_version)!==Number(expectedVersion))return false;
  const byId=new Map((p.members||[]).map((m)=>[Number(m.character_id),m]));
  if(memberIds.length!==byId.size||memberIds.some((id)=>!byId.has(Number(id))))return false;
  memberIds.forEach((id,index)=>{byId.get(Number(id)).position=index+1;});
  p.roster_version=Number(p.roster_version)+1;
  p.updated_at=new Date().toISOString();this._partySave();return true;
};
JsonStore.prototype.partyRemoveMember = function (partyId, charId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return;
  const before=(p.members||[]).length;
  p.members = (p.members || []).filter((m) => m.character_id !== Number(charId));
  if(p.members.length!==before)p.roster_version=(Number(p.roster_version)||1)+1;
  p.updated_at = new Date().toISOString();
  this._partySave();
};
JsonStore.prototype.partyDelete = function (partyId) {
  const id = Number(partyId);
  this.parties = (this.parties || []).filter((p) => p.id !== id);
  (this.invites || []).forEach((i) => {
    if (i.party_id === id && i.status === "pending") i.status = "cancelled";
  });
  this._partySave();
};
JsonStore.prototype.partySetZone = function (partyId, zone, opts) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return null;
  opts = opts || {};
  p.leader_zone = zone;
  p.leader_hunt = opts.hunt || null;
  p.leader_instance = opts.instance || null;
  p.leader_otbm = opts.otbm || null;
  p.leader_boss = opts.boss || null;
  p.updated_at = new Date().toISOString();
  // follow: o destino + nonce ficam POR MEMBRO (party_members.follow_*).
  // `opts.follows` = [{ character_id, nonce, hunt, instance, otbm, boss }]
  if (Array.isArray(opts.follows) && opts.follows.length) {
    (p.members || []).forEach((m) => {
      const f = opts.follows.find((x) => x.character_id === m.character_id);
      m.follow_nonce = f ? f.nonce : null;
      m.follow_hunt = f ? (f.hunt || null) : null;
      m.follow_instance = f ? (f.instance || null) : null;
      m.follow_otbm = f ? (f.otbm || null) : null;
      m.follow_boss = f ? (f.boss || null) : null;
      m.follow_at = f ? new Date().toISOString() : null;
    });
  } else if (zone === "city" || zone === "training") {
    // voltou para safe zone: limpa follows pendentes dos membros
    (p.members || []).forEach((m) => {
      m.follow_nonce = m.follow_hunt = m.follow_instance = m.follow_otbm =
        m.follow_boss = m.follow_at = null;
    });
  }
  this._partySave();
  return p;
};
JsonStore.prototype.partyFollow = function (partyId, charId) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return null;
  const m = (p.members || []).find((x) => x.character_id === Number(charId));
  if (!m || !m.follow_nonce) return null;
  return {
    nonce: m.follow_nonce, hunt: m.follow_hunt, instance: m.follow_instance,
    otbm: m.follow_otbm, boss: m.follow_boss,
  };
};
JsonStore.prototype.partyConsumeFollow = function (partyId, charId, nonce) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return false;
  const m = (p.members || []).find((x) => x.character_id === Number(charId));
  if (!m || m.follow_nonce !== nonce) return false;
  m.follow_nonce = m.follow_hunt = m.follow_instance = m.follow_otbm =
    m.follow_boss = m.follow_at = null;
  this._partySave();
  return true;
};
JsonStore.prototype.inviteCreate = function (partyId, leaderId, inviteeId, expiresAt) {
  this.invites = this.invites || [];
  const inv = {
    id: this._nextInviteId(), party_id: Number(partyId), leader_id: Number(leaderId),
    invitee_id: Number(inviteeId), status: "pending",
    created_at: new Date().toISOString(), expires_at: expiresAt || null,
  };
  this.invites.push(inv);
  this._partySave();
  return inv;
};
JsonStore.prototype.inviteFind = function (id) {
  this.invites = this.invites || [];
  return this.invites.find((i) => i.id === Number(id)) || null;
};
JsonStore.prototype.inviteUpdate = function (id, patch) {
  const i = this.inviteFind(id);
  if (i) { Object.assign(i, patch); this._partySave(); }
  return i;
};
JsonStore.prototype.pendingInviteFor = function (inviteeId) {
  this.invites = this.invites || [];
  return this.invites.find((i) =>
    i.invitee_id === Number(inviteeId) && i.status === "pending" &&
    (!i.expires_at || new Date(i.expires_at).getTime() > Date.now())) || null;
};
JsonStore.prototype.invitesFor = function (inviteeId, status) {
  this.invites = this.invites || [];
  const now = Date.now();
  return this.invites
    .filter((i) => i.invitee_id === Number(inviteeId) && i.status === status &&
      (!i.expires_at || new Date(i.expires_at).getTime() > now))
    .map((i) => {
      const p = (this.parties || []).find((x) => x.id === i.party_id);
      return Object.assign({}, i, {
        leader_name: p ? p.leader_name : "?",
        leader_zone: p ? p.leader_zone : "unknown",
      });
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

/* Wrapper MySQL (mysql2/promise) — mesma API do JsonStore */
async function MysqlStore() {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASS,
    database: MYSQL_DB, port: MYSQL_PORT,
    waitForConnections: true, connectionLimit: 10,
    charset: "utf8mb4",
  });
  // garante o schema (tabelas) no primeiro uso
  await ensureSchema(pool);

  function hydrateAccount(row) {
    if (!row) return null;
    const out = Object.assign({}, row);
    for (const [col, key] of [["missions", "missions"], ["missions_done", "missionsDone"]]) {
      let v = row[col];
      if (typeof v === "string") {
        try { v = JSON.parse(v); } catch (e) { v = {}; }
      }
      out[key] = v && typeof v === "object" && !Array.isArray(v) ? v : {};
    }
    return out;
  }

  async function lockValidLease(conn,accountId,lease){
    if(!lease)return true;
    const [rows]=await conn.query("SELECT holder_id,secret_hash,expires_at FROM account_leases WHERE account_id=? FOR UPDATE",
      [Number(accountId)]);
    const row=rows[0];
    return !!(row&&row.holder_id===lease.holderId&&row.secret_hash===lease.secretHash&&
      new Date(row.expires_at).getTime()>lease.now);
  }
  async function persistVersionedRows(conn,accountId,saves){
    if(!saves.length)return {ok:true,characters:[]};
    const ids=saves.map((save)=>Number(save.id));
    const placeholders=ids.map(()=>"?").join(",");
    const [rows]=await conn.query(
      `SELECT * FROM characters WHERE account_id=? AND id IN (${placeholders}) FOR UPDATE`,
      [Number(accountId)].concat(ids));
    const byId=new Map(rows.map((row)=>[Number(row.id),row]));
    const missing=ids.filter((id)=>!byId.has(id));
    if(missing.length)return {ok:false,error:"CHARACTER_NOT_FOUND",ids:missing};
    const conflicts=saves.map((save)=>byId.get(Number(save.id)))
      .filter((row,index)=>Number(row.save_version)!==Number(saves[index].expectedVersion));
    if(conflicts.length)return {ok:false,error:"SAVE_VERSION_CONFLICT",characters:conflicts};
    const updated=[];
    for(const save of saves){
      const row=byId.get(Number(save.id)),extra=save.extra||{};
      const next={
        zone:extra.zone!==undefined?extra.zone:row.zone,
        hp:extra.hp!==undefined?extra.hp:row.hp,
        mp:extra.mp!==undefined?extra.mp:row.mp,
        max_hp:extra.max_hp!==undefined?extra.max_hp:row.max_hp,
        max_mp:extra.max_mp!==undefined?extra.max_mp:row.max_mp,
      };
      await conn.query(
        `UPDATE characters SET voc=?, level=?, data=?, save_version=save_version+1,
           zone=?, hp=?, mp=?, max_hp=?, max_mp=? WHERE id=? AND account_id=?`,
        [save.voc,save.level,save.data,next.zone,next.hp,next.mp,next.max_hp,next.max_mp,
         Number(save.id),Number(accountId)]);
      updated.push(Object.assign({},row,save,next,{save_version:Number(row.save_version)+1}));
    }
    return {ok:true,characters:updated};
  }

  const db = {
    async query(sql, params) { const [rows] = await pool.query(sql, params || []); return rows; },
    async run(sql, params) { const [r] = await pool.query(sql, params || []); return r; },
    async end() { await pool.end(); },

    async findAccountByLogin(login) {
      const rows = await this.query("SELECT * FROM accounts WHERE login = ?", [login]);
      return hydrateAccount(rows[0] || null);
    },
    async findAccountById(id) {
      const rows = await this.query("SELECT * FROM accounts WHERE id = ?", [Number(id)]);
      return hydrateAccount(rows[0] || null);
    },
    async createAccount(login, hash, role, coins) {
      const r = await this.run(
        "INSERT INTO accounts (login, password_hash, role, coins, gold, gold_migrated, vip_until, missions, missions_done) VALUES (?, ?, ?, ?, 0, 1, 0, '{}', '{}')",
        [login, hash, role || "user", coins || 0]);
      return { id: r.insertId, login, password_hash: hash, role: role || "user", coins: coins || 0,
        gold: 0, gold_migrated: 1, vip_until: 0, missions: {}, missionsDone: {} };
    },
    async setAccountMissions(accountId, missions, missionsDone) {
      const m = missions && typeof missions === "object" && !Array.isArray(missions) ? missions : {};
      const d = missionsDone && typeof missionsDone === "object" && !Array.isArray(missionsDone) ? missionsDone : {};
      await this.run(
        "UPDATE accounts SET missions = ?, missions_done = ? WHERE id = ?",
        [JSON.stringify(m), JSON.stringify(d), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async updateCoins(id, coins) {
      await this.run("UPDATE accounts SET coins = ? WHERE id = ?", [Math.max(0, coins), Number(id)]);
      return this.findAccountById(id);
    },
    async accountGold(accountId) {
      const rows = await this.query("SELECT gold FROM accounts WHERE id = ?", [Number(accountId)]);
      return rows[0] ? Math.max(0, Math.floor(Number(rows[0].gold) || 0)) : 0;
    },
    async setAccountGold(accountId, gold) {
      await this.run("UPDATE accounts SET gold = ? WHERE id = ?",
        [Math.max(0, Math.floor(Number(gold) || 0)), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async setAccountVipUntil(accountId, vipUntil) {
      await this.run("UPDATE accounts SET vip_until = ? WHERE id = ?",
        [Math.max(0, Math.floor(Number(vipUntil) || 0)), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async migrateAccountGold(accountId) {
      const account = await this.findAccountById(accountId);
      if (!account) return null;
      if (Number(account.gold_migrated)) {
        account.gold = Math.max(0, Math.floor(Number(account.gold) || 0));
        return account;
      }
      const chars = await this.charactersOf(accountId);
      let total = Math.max(0, Math.floor(Number(account.gold) || 0));
      for (const c of chars) {
        let data = {};
        try { data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { data = {}; }
        const g = Number(data.gold);
        if (Number.isFinite(g) && g > 0) total += Math.floor(g);
      }
      await this.run("UPDATE accounts SET gold = ?, gold_migrated = 1 WHERE id = ?", [total, Number(accountId)]);
      for (const c of chars) {
        let data = {};
        try { data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { data = {}; }
        data.gold = total;
        await this.run("UPDATE characters SET data = ? WHERE id = ?", [JSON.stringify(data), Number(c.id)]);
      }
      return this.findAccountById(accountId);
    },
    async syncAccountGoldFromCharacters(projections) {
      const byAccount = new Map();
      for (const proj of projections || []) {
        const c = await this.findCharacter(proj.id);
        if (!c) continue;
        let data = {};
        try { data = typeof proj.data === "string" ? JSON.parse(proj.data) : (proj.data || {}); } catch (e) { data = {}; }
        const gold = Math.max(0, Math.floor(Number(data.gold) || 0));
        byAccount.set(Number(c.account_id), gold);
      }
      for (const [accountId, gold] of byAccount.entries()) {
        await this.run("UPDATE accounts SET gold = ?, gold_migrated = 1 WHERE id = ?", [gold, accountId]);
        const chars = await this.charactersOf(accountId);
        for (const c of chars) {
          let data = {};
          try { data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { data = {}; }
          data.gold = gold;
          await this.run("UPDATE characters SET data = ? WHERE id = ?", [JSON.stringify(data), Number(c.id)]);
        }
      }
    },
    async charactersOf(accountId) {
      return this.query(
        "SELECT id, account_id, name, voc, level, data, save_version, created_at, updated_at FROM characters WHERE account_id = ?",
        [Number(accountId)]);
    },
    async findCharacterByName(name) {
      const rows = await this.query(
        "SELECT * FROM characters WHERE LOWER(name) = LOWER(?)", [String(name)]);
      return rows[0] || null;
    },
    async findCharacter(id) {
      const rows = await this.query("SELECT * FROM characters WHERE id = ?", [Number(id)]);
      return rows[0] || null;
    },
    async createCharacter(accountId, name, voc, level, data) {
      const r = await this.run(
        "INSERT INTO characters (account_id, name, voc, level, data) VALUES (?, ?, ?, ?, ?)",
        [Number(accountId), name, voc, level, data]);
      return { id: r.insertId, account_id: Number(accountId), name, voc, level, data, save_version:0 };
    },
    async updateCharacter(id, voc, level, data, extra) {
      extra = extra || {};
      await this.run(
        `UPDATE characters SET voc = ?, level = ?, data = ?, save_version=save_version+1,
           zone = ?, hp = ?, mp = ?, max_hp = ?, max_mp = ?
         WHERE id = ?`,
        [voc, level, data,
         extra.zone !== undefined ? extra.zone : "unknown",
         extra.hp !== undefined ? extra.hp : 0,
         extra.mp !== undefined ? extra.mp : 0,
         extra.max_hp !== undefined ? extra.max_hp : 0,
         extra.max_mp !== undefined ? extra.max_mp : 0,
         Number(id)]);
      return this.findCharacter(id);
    },
    async saveCharactersVersioned(accountId,saves,lease){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        if(!await lockValidLease(conn,accountId,lease)){
          await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};
        }
        const result=await persistVersionedRows(conn,accountId,saves);
        if(!result.ok){await conn.rollback();return result;}
        await conn.commit();return result;
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}
      finally{conn.release();}
    },
    async savePartyCharactersVersioned(accountId,partyId,expectedPartyVersion,expectedOrder,saves,lease){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        if(!await lockValidLease(conn,accountId,lease)){
          await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};
        }
        const [parties]=await conn.query("SELECT * FROM parties WHERE id=? FOR UPDATE",[Number(partyId)]);
        const p=parties[0];
        if(!p||Number(p.owner_account_id)!==Number(accountId)){
          await conn.rollback();return {ok:false,error:"PARTY_NOT_OWNER"};
        }
        if(Number(p.roster_version)!==Number(expectedPartyVersion)){
          await conn.rollback();return {ok:false,error:"PARTY_VERSION_CONFLICT",party:p};
        }
        const [members]=await conn.query(
          "SELECT character_id FROM party_members WHERE party_id=? ORDER BY position, joined_at, character_id",
          [Number(partyId)]);
        const order=[Number(p.leader_id)].concat(members.map((m)=>Number(m.character_id)));
        if(order.length!==expectedOrder.length||order.some((id,index)=>id!==Number(expectedOrder[index]))){
          await conn.rollback();return {ok:false,error:"PARTY_VERSION_CONFLICT",party:p};
        }
        const placeholders=order.map(()=>"?").join(",");
        const [partyCharacters]=await conn.query(
          `SELECT id,account_id FROM characters WHERE id IN (${placeholders})`,order);
        const controlled=order.filter((id)=>partyCharacters.some((c)=>Number(c.id)===id&&Number(c.account_id)===Number(accountId)));
        if(controlled.length!==saves.length||controlled.some((id)=>!saves.some((save)=>Number(save.id)===id))){
          await conn.rollback();return {ok:false,error:"PARTY_SAVE_SET_MISMATCH"};
        }
        const result=await persistVersionedRows(conn,accountId,saves);
        if(!result.ok){await conn.rollback();return result;}
        await conn.commit();return result;
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}
      finally{conn.release();}
    },
    async setCharacterZone(id, zone) {
      await this.run("UPDATE characters SET zone = ? WHERE id = ?",
        [zone, Number(id)]);
      return this.findCharacter(id);
    },
    async findAccountByToken(token) {
      const rows = await this.query(
        `SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id
         WHERE s.token=? AND (s.expires_at IS NULL OR s.expires_at>NOW())`,[token]);
      return rows[0] || null;
    },
    async createSession(accountId, token, expiresAt) {
      await this.run("DELETE FROM sessions WHERE account_id=?",[Number(accountId)]);
      await this.run("INSERT INTO sessions (account_id,token,expires_at) VALUES (?,?,?)",
        [Number(accountId),token,expiresAt?new Date(expiresAt):null]);
    },
    async revokeSession(token){const result=await this.run("DELETE FROM sessions WHERE token=?",[String(token)]);return result.affectedRows>0;},
    async pruneExpiredSessions(now){const result=await this.run("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at<=?",[new Date(now)]);return result.affectedRows;},
    async leaseAcquire(accountId,holderId,previousHolderId,presentedHash,newHash,now,expiresAt){
      const conn=await pool.getConnection(),lockName="idle-lease-"+Number(accountId);
      try{
        const [locks]=await conn.query("SELECT GET_LOCK(?,5) AS acquired",[lockName]);
        if(!locks[0]||Number(locks[0].acquired)!==1)throw new Error("lease lock timeout");
        await conn.beginTransaction();
        const [rows]=await conn.query("SELECT * FROM account_leases WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        let row=rows[0]||null;const active=row&&new Date(row.expires_at).getTime()>now;
        if(active&&(row.holder_id===holderId||row.holder_id===previousHolderId)&&row.secret_hash===presentedHash){
          await conn.query("UPDATE account_leases SET holder_id=?,renewed_at=?,expires_at=? WHERE account_id=?",
            [holderId,new Date(now),new Date(expiresAt),Number(accountId)]);
          await conn.commit();row.holder_id=holderId;row.renewed_at=new Date(now);row.expires_at=new Date(expiresAt);
          return {ok:true,resumed:true,lease:row};
        }
        if(active){await conn.rollback();return {ok:false,error:"LEASE_HELD",lease:row};}
        await conn.query(
          `INSERT INTO account_leases (account_id,holder_id,secret_hash,acquired_at,renewed_at,expires_at)
           VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE holder_id=VALUES(holder_id),secret_hash=VALUES(secret_hash),
             acquired_at=VALUES(acquired_at),renewed_at=VALUES(renewed_at),expires_at=VALUES(expires_at)`,
          [Number(accountId),holderId,newHash,new Date(now),new Date(now),new Date(expiresAt)]);
        await conn.commit();return {ok:true,resumed:false,lease:{account_id:Number(accountId),holder_id:holderId,
          secret_hash:newHash,acquired_at:new Date(now),renewed_at:new Date(now),expires_at:new Date(expiresAt)}};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{
        try{await conn.query("SELECT RELEASE_LOCK(?)",[lockName]);}catch(e){}conn.release();
      }
    },
    async leaseTakeover(accountId,holderId,newHash,now,expiresAt){
      await this.run(
        `INSERT INTO account_leases (account_id,holder_id,secret_hash,acquired_at,renewed_at,expires_at)
         VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE holder_id=VALUES(holder_id),secret_hash=VALUES(secret_hash),
           acquired_at=VALUES(acquired_at),renewed_at=VALUES(renewed_at),expires_at=VALUES(expires_at)`,
        [Number(accountId),holderId,newHash,new Date(now),new Date(now),new Date(expiresAt)]);
      return {ok:true,lease:{account_id:Number(accountId),holder_id:holderId,secret_hash:newHash,
        acquired_at:new Date(now),renewed_at:new Date(now),expires_at:new Date(expiresAt)}};
    },
    async leaseRenew(accountId,holderId,secretHash,now,expiresAt){
      const result=await this.run(
        `UPDATE account_leases SET renewed_at=?,expires_at=?
         WHERE account_id=? AND holder_id=? AND secret_hash=? AND expires_at>?`,
        [new Date(now),new Date(expiresAt),Number(accountId),holderId,secretHash,new Date(now)]);
      if(!result.affectedRows){
        const rows=await this.query("SELECT * FROM account_leases WHERE account_id=?",[Number(accountId)]);
        return {ok:false,error:"LEASE_LOST",lease:rows[0]||null};
      }
      return {ok:true,lease:{account_id:Number(accountId),holder_id:holderId,secret_hash:secretHash,
        renewed_at:new Date(now),expires_at:new Date(expiresAt)}};
    },
    async leaseValidate(accountId,holderId,secretHash,now){
      const rows=await this.query(
        "SELECT account_id FROM account_leases WHERE account_id=? AND holder_id=? AND secret_hash=? AND expires_at>?",
        [Number(accountId),holderId,secretHash,new Date(now)]);
      return rows.length>0;
    },
    async leaseRelease(accountId,holderId,secretHash){
      const result=await this.run(
        "DELETE FROM account_leases WHERE account_id=? AND holder_id=? AND secret_hash=?",
        [Number(accountId),holderId,secretHash]);
      return result.affectedRows>0;
    },
    async instanceGet(accountId){
      const rows=await this.query("SELECT * FROM account_instances WHERE account_id=?",[Number(accountId)]);
      return rows[0]||null;
    },
    async instanceGetByParty(partyId){
      const rows=await this.query("SELECT * FROM account_instances WHERE party_id=? AND status='active' LIMIT 1",[Number(partyId)]);
      return rows[0]||null;
    },
    async instanceSave(accountId,instanceId,expectedVersion,meta,state,lease){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        if(!await lockValidLease(conn,accountId,lease)){
          await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};
        }
        if(meta.party_id){
          const [parties]=await conn.query(
            "SELECT leader_id,roster_version FROM parties WHERE id=? AND owner_account_id=? FOR UPDATE",
            [Number(meta.party_id),Number(accountId)]);
          const party=parties[0];
          let members=[];
          if(party)[members]=await conn.query(
            `SELECT m.character_id FROM party_members m
             WHERE m.party_id=? ORDER BY m.position,m.joined_at,m.character_id`,
            [Number(meta.party_id)]);
          const order=party?[Number(party.leader_id)].concat(members.map((m)=>Number(m.character_id))):[];
          if(!party||Number(party.roster_version)!==Number(meta.party_version)||
             order.length!==meta.member_ids.length||order.some((id,index)=>id!==meta.member_ids[index])){
            await conn.rollback();return {ok:false,error:"INSTANCE_PARTY_CONFLICT"};
          }
        }
        const [rows]=await conn.query("SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        const current=rows[0]||null;
        if(current&&current.status==="active"){
          if(Number(current.version)!==Number(expectedVersion)||String(current.instance_id)!==String(instanceId||"")){
            await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:current};
          }
          await conn.query(
            `UPDATE account_instances SET version=version+1,kind=?,hunt_id=?,boss_id=?,instance_mode=?,
             party_id=?,party_version=?,active_character_id=?,state=?,saved_at=?,worker_cursor_at=?,status='active',
             ended_at=NULL,terminal_reason=NULL WHERE account_id=?`,
            [meta.kind,meta.hunt_id,meta.boss_id,meta.instance_mode,meta.party_id,meta.party_version,
             meta.active_character_id,state,meta.saved_at,meta.saved_at,Number(accountId)]);
        }else{
          if(Number(expectedVersion)!==0){
            await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:current};
          }
          // Meta usa snake_case (started_at); fallback evita NULL em coluna NOT NULL.
          const startedAt=meta.started_at||meta.startedAt||meta.saved_at||new Date();
          await conn.query(
            `INSERT INTO account_instances
             (account_id,instance_id,version,status,kind,hunt_id,boss_id,instance_mode,party_id,
              party_version,active_character_id,state,saved_at,started_at,worker_cursor_at,worker_total_ms)
             VALUES (?,?,1,'active',?,?,?,?,?,?,?,?,?,?,?,0)
             ON DUPLICATE KEY UPDATE instance_id=VALUES(instance_id),version=1,status='active',kind=VALUES(kind),
              hunt_id=VALUES(hunt_id),boss_id=VALUES(boss_id),instance_mode=VALUES(instance_mode),
              party_id=VALUES(party_id),party_version=VALUES(party_version),
              active_character_id=VALUES(active_character_id),state=VALUES(state),saved_at=VALUES(saved_at),
              started_at=VALUES(started_at),worker_cursor_at=VALUES(worker_cursor_at),worker_total_ms=0,
              ended_at=NULL,terminal_reason=NULL`,
            [Number(accountId),instanceId,meta.kind,meta.hunt_id,meta.boss_id,meta.instance_mode,
             meta.party_id,meta.party_version,meta.active_character_id,state,meta.saved_at,startedAt,meta.saved_at]);
        }
        const [saved]=await conn.query("SELECT * FROM account_instances WHERE account_id=?",[Number(accountId)]);
        await conn.commit();return {ok:true,instance:saved[0]};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },
    async instancePatchState(ownerAccountId,requesterAccountId,instanceId,expectedVersion,patchState,lease){
      const conn=await pool.getConnection();
      try{await conn.beginTransaction();
        if(!await lockValidLease(conn,requesterAccountId,lease)){await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};}
        const [rows]=await conn.query("SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(ownerAccountId)]),row=rows[0];
        if(!row||row.status!=="active"){await conn.rollback();return {ok:false,error:"INSTANCE_NOT_ACTIVE"};}
        if(String(row.instance_id)!==String(instanceId||"")||Number(row.version)!==Number(expectedVersion)){
          await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};}
        const next=patchState(row.state);if(!next){await conn.rollback();return {ok:false,error:"INSTANCE_PATCH_REJECTED",instance:row};}
        await conn.query("UPDATE account_instances SET state=?,version=version+1,updated_at=? WHERE account_id=?",
          [next,new Date(lease.now),Number(ownerAccountId)]);
        const [saved]=await conn.query("SELECT * FROM account_instances WHERE account_id=?",[Number(ownerAccountId)]);
        await conn.commit();return {ok:true,instance:saved[0]};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },
    async instanceWorkerCandidates(limit){
      const rows=await this.query(
        `SELECT account_id FROM account_instances WHERE status='active'
         ORDER BY COALESCE(worker_cursor_at,saved_at) ASC LIMIT ?`,
        [Math.max(1,Math.min(500,Number(limit)||50))]);
      return rows.map((row)=>Number(row.account_id));
    },
    async instanceWorkerClaim(accountId,now,maxStep,minStep,advanceState){
      const conn=await pool.getConnection(),lockName="idle-lease-"+Number(accountId);
      try{
        const [locks]=await conn.query("SELECT GET_LOCK(?,5) AS acquired",[lockName]);
        if(!locks[0]||Number(locks[0].acquired)!==1)return {ok:false,skipped:"lock-timeout"};
        await conn.beginTransaction();
        const [leases]=await conn.query("SELECT expires_at FROM account_leases WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        if(leases[0]&&new Date(leases[0].expires_at).getTime()>now){
          await conn.rollback();return {ok:false,skipped:"leased"};
        }
        const [rows]=await conn.query("SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        const row=rows[0];if(!row||row.status!=="active"){
          await conn.rollback();return {ok:false,skipped:"inactive"};
        }
        const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
        const elapsed=Math.min(Math.max(0,now-cursor),Math.max(1,Number(maxStep)||3600000));
        if(elapsed<Math.max(1,Number(minStep)||500)){
          await conn.rollback();return {ok:false,skipped:"not-due"};
        }
        const checkpoint=cursor+elapsed,advanced=advanceState(row.state,elapsed,checkpoint);
        const next=advanced&&typeof advanced==="object"&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
        for(const projection of next.characters||[])await conn.query(
          `UPDATE characters SET data=?,level=?,voc=?,hp=?,mp=?,max_hp=?,max_mp=?,save_version=save_version+1
           WHERE id=?`,
          [projection.data,projection.level,projection.voc,projection.hp,projection.mp,projection.max_hp,
           projection.max_mp,Number(projection.id)]);
        await conn.query(
          `UPDATE account_instances SET state=?,version=version+1,saved_at=?,worker_cursor_at=?,
             worker_total_ms=worker_total_ms+?,status=?,terminal_reason=?,ended_at=? WHERE account_id=?`,
          [next.state,new Date(checkpoint),new Date(checkpoint),elapsed,next.terminalReason?"ended":"active",
           next.terminalReason||null,next.terminalReason?new Date(checkpoint):null,Number(accountId)]);
        await conn.commit();return {ok:true,accountId:Number(accountId),elapsed,version:Number(row.version)+1,
          terminalReason:next.terminalReason||null};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{
        try{await conn.query("SELECT RELEASE_LOCK(?)",[lockName]);}catch(e){}conn.release();
      }
    },
    async instanceAuthorityTick(accountId,expectedVersion,now,maxStep,advanceState,lease){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        if(!await lockValidLease(conn,accountId,lease)){
          await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};
        }
        const [rows]=await conn.query("SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        const row=rows[0];if(!row||row.status!=="active"){
          await conn.rollback();return {ok:false,error:"INSTANCE_NOT_ACTIVE"};
        }
        if(expectedVersion!==null&&expectedVersion!==undefined&&Number(row.version)!==Number(expectedVersion)){
          await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
        }
        const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
        const elapsed=Math.min(Math.max(0,now-cursor),Math.max(100,Number(maxStep)||10000));
        if(elapsed<50){await conn.commit();return {ok:true,instance:row,characters:[],elapsed:0};}
        const advanced=advanceState(row.state,elapsed,now),next=advanced&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
        for(const projection of next.characters||[])await conn.query(
          `UPDATE characters SET data=?,level=?,voc=?,hp=?,mp=?,max_hp=?,max_mp=?,save_version=save_version+1
           WHERE id=?`,
          [projection.data,projection.level,projection.voc,projection.hp,projection.mp,projection.max_hp,
           projection.max_mp,Number(projection.id)]);
        // Gold é por conta: propaga o saldo autoritativo para accounts.gold.
        const walletByAcc=new Map();
        for(const projection of next.characters||[]){
          const [chars]=await conn.query("SELECT account_id FROM characters WHERE id=?",[Number(projection.id)]);
          if(!chars[0])continue;
          let data={};try{data=typeof projection.data==="string"?JSON.parse(projection.data):(projection.data||{});}catch(e){}
          walletByAcc.set(Number(chars[0].account_id),Math.max(0,Math.floor(Number(data.gold)||0)));
        }
        for(const [aid,gold] of walletByAcc.entries()){
          await conn.query("UPDATE accounts SET gold=?, gold_migrated=1 WHERE id=?",[gold,aid]);
          const [siblings]=await conn.query("SELECT id, data FROM characters WHERE account_id=?",[aid]);
          for(const sib of siblings){
            let sd={};try{sd=typeof sib.data==="string"?JSON.parse(sib.data):(sib.data||{});}catch(e){sd={};}
            sd.gold=gold;
            await conn.query("UPDATE characters SET data=? WHERE id=?",[JSON.stringify(sd),Number(sib.id)]);
          }
        }
        await conn.query(
          `UPDATE account_instances SET state=?,version=version+1,saved_at=?,worker_cursor_at=?,status=?,
             terminal_reason=?,ended_at=? WHERE account_id=?`,
          [next.state,new Date(now),new Date(now),next.terminalReason?"ended":"active",next.terminalReason||null,
           next.terminalReason?new Date(now):null,Number(accountId)]);
        const [saved]=await conn.query("SELECT * FROM account_instances WHERE account_id=?",[Number(accountId)]);
        const ids=(next.characters||[]).map((p)=>Number(p.id));let characters=[];
        if(ids.length){const marks=ids.map(()=>"?").join(",");[characters]=await conn.query(
          `SELECT * FROM characters WHERE id IN (${marks})`,ids);}
        await conn.commit();return {ok:true,instance:saved[0],characters,elapsed,terminalReason:next.terminalReason||null};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },
    async instanceEnd(accountId,instanceId,expectedVersion,reason,lease){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        if(!await lockValidLease(conn,accountId,lease)){
          await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};
        }
        const [rows]=await conn.query("SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        const current=rows[0]||null;
        if(!current||current.status!=="active"){
          await conn.commit();return {ok:true,instance:current,alreadyEnded:true};
        }
        if(Number(current.version)!==Number(expectedVersion)||String(current.instance_id)!==String(instanceId||"")){
          await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:current};
        }
        await conn.query(
          "UPDATE account_instances SET version=version+1,status='ended',terminal_reason=?,ended_at=?,updated_at=? WHERE account_id=?",
          [reason,new Date(lease.now),new Date(lease.now),Number(accountId)]);
        current.version=Number(current.version)+1;current.status="ended";current.terminal_reason=reason;
        current.ended_at=new Date(lease.now);await conn.commit();return {ok:true,instance:current};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },

    // ---- MARKET P2P ----
    async createMarketOffer(offer) {
      const r = await this.run(
        `INSERT INTO market_offers
          (seller_id, seller_name, kind, slug, tier, data, qty, price, price_tc, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [offer.seller_id, offer.seller_name, offer.kind, offer.slug || null,
         offer.tier || 0, offer.data || null, offer.qty || 1,
         offer.price, offer.price_tc ? 1 : 0, offer.expires_at || null]);
      return this.findMarketOffer(r.insertId);
    },
    async marketOffers(filter) {
      filter = filter || {};
      const cond = ["status='active'"];
      const params = [];
      if (filter.kind) { cond.push("kind=?"); params.push(filter.kind); }
      if (filter.tier) { cond.push("tier=?"); params.push(Number(filter.tier)); }
      if (filter.seller) { cond.push("seller_id=?"); params.push(Number(filter.seller)); }
      if (filter.slug) { cond.push("slug=?"); params.push(filter.slug); }
      cond.push("(expires_at IS NULL OR expires_at > NOW())");
      return this.query(
        "SELECT * FROM market_offers WHERE " + cond.join(" AND ") +
        " ORDER BY price ASC, created_at ASC", params);
    },
    async findMarketOffer(id) {
      const rows = await this.query("SELECT * FROM market_offers WHERE id = ?", [Number(id)]);
      return rows[0] || null;
    },
    async updateMarketOffer(id, patch) {
      const set = [], params = [];
      for (const k in patch) { set.push(k + "=?"); params.push(patch[k]); }
      if (!set.length) return this.findMarketOffer(id);
      params.push(Number(id));
      await this.run("UPDATE market_offers SET " + set.join(", ") + " WHERE id = ?", params);
      return this.findMarketOffer(id);
    },
    async sellerOffers(sellerId) {
      return this.query(
        "SELECT * FROM market_offers WHERE seller_id = ? ORDER BY created_at DESC",
        [Number(sellerId)]);
    },
    async accountMarketGold(accountId) {
      const rows = await this.query("SELECT market_gold FROM accounts WHERE id = ?", [Number(accountId)]);
      return rows[0] ? (rows[0].market_gold || 0) : 0;
    },
    async addAccountMarketGold(accountId, amount) {
      await this.run("UPDATE accounts SET market_gold = market_gold + ? WHERE id = ?",
        [Math.max(0, amount), Number(accountId)]);
    },
    async payMarketFee(accountId, amount) {
      // fee sai do market_gold (banco do jogador); retorna false se insuficiente
      const r = await this.run(
        "UPDATE accounts SET market_gold = market_gold - ? WHERE id = ? AND market_gold >= ?",
        [amount, Number(accountId), amount]);
      return r.affectedRows > 0;
    },
    async refundMarketFee(accountId, amount) {
      await this.run("UPDATE accounts SET market_gold = market_gold + ? WHERE id = ?",
        [amount, Number(accountId)]);
    },
    async payMarketGold(accountId, amount) {
      const r = await this.run(
        "UPDATE accounts SET market_gold = market_gold - ? WHERE id = ? AND market_gold >= ?",
        [amount, Number(accountId), amount]);
      return r.affectedRows > 0;
    },
    async claimMarketGold(accountId) { return 0; },
    async marketTransferGold(accountId,charId,expectedVersion,amount,direction,lease){
      const conn=await pool.getConnection();
      try{await conn.beginTransaction();
        if(!await lockValidLease(conn,accountId,lease)){await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};}
        const [accounts]=await conn.query("SELECT * FROM accounts WHERE id=? FOR UPDATE",[Number(accountId)]);
        const [characters]=await conn.query("SELECT * FROM characters WHERE id=? AND account_id=? FOR UPDATE",[Number(charId),Number(accountId)]);
        const account=accounts[0],character=characters[0];if(!account||!character){await conn.rollback();return {ok:false,error:"CHARACTER_NOT_FOUND"};}
        if(Number(character.save_version)!==Number(expectedVersion)){await conn.rollback();return {ok:false,error:"SAVE_VERSION_CONFLICT",character};}
        let pocket=Math.max(0,Math.floor(Number(account.gold)||0));
        if(!Number(account.gold_migrated)){
          const [allChars]=await conn.query("SELECT id, data FROM characters WHERE account_id=? FOR UPDATE",[Number(accountId)]);
          for(const row of allChars){
            let d={};try{d=typeof row.data==="string"?JSON.parse(row.data):(row.data||{});}catch(e){d={};}
            const g=Number(d.gold);if(Number.isFinite(g)&&g>0)pocket+=Math.floor(g);
          }
        }
        let data={};try{data=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
        let bank=Math.max(0,Number(account.market_gold)||0);
        if(direction==="deposit"){if(pocket<amount){await conn.rollback();return {ok:false,error:"CHARACTER_GOLD_LOW"};}pocket-=amount;bank+=amount;}
        else{if(bank<amount){await conn.rollback();return {ok:false,error:"BANK_GOLD_LOW"};}bank-=amount;pocket+=amount;}
        await conn.query("UPDATE accounts SET market_gold=?, gold=?, gold_migrated=1 WHERE id=?",[bank,pocket,Number(accountId)]);
        data.gold=pocket;
        await conn.query("UPDATE characters SET data=?,save_version=save_version+1 WHERE id=? AND account_id=?",
          [JSON.stringify(data),Number(charId),Number(accountId)]);
        const [siblings]=await conn.query("SELECT id, data FROM characters WHERE account_id=? AND id<>?",[Number(accountId),Number(charId)]);
        for(const sib of siblings){
          let sd={};try{sd=typeof sib.data==="string"?JSON.parse(sib.data):(sib.data||{});}catch(e){sd={};}
          sd.gold=pocket;
          await conn.query("UPDATE characters SET data=? WHERE id=?",[JSON.stringify(sd),Number(sib.id)]);
        }
        character.data=JSON.stringify(data);character.save_version=Number(character.save_version)+1;
        await conn.commit();return {ok:true,character,bank,gold:pocket};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },

    // ---- MARKET STATS (preço médio por item/tier) ----
    async recordSale(slug, tier, price) {
      await this.run(
        `INSERT INTO market_stats (slug, tier, count, total, last_price)
         VALUES (?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
           count = count + 1, total = total + ?, last_price = ?`,
        [slug, tier || 0, price, price, price, price]);
    },
    async itemStats(slug, tier) {
      const rows = await this.query(
        "SELECT * FROM market_stats WHERE slug = ? AND tier = ?",
        [slug, tier || 0]);
      if (!rows[0]) return null;
      const s = rows[0];
      return {
        count: s.count,
        avg: Math.round(s.total / Math.max(1, s.count)),
        last: s.last_price,
      };
    },

    // ---- MARKET HISTORY (histórico de trades) ----
    async addMarketHistory(rec) {
      await this.run(
        `INSERT INTO market_history
          (seller_id, seller_name, buyer_id, buyer_name, kind, slug, tier, qty, price, price_tc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rec.seller_id, rec.seller_name || "", rec.buyer_id || null,
         rec.buyer_name || "", rec.kind || "item", rec.slug || null,
         rec.tier || 0, rec.qty || 1, rec.price || 0, rec.price_tc ? 1 : 0]);
    },
    async marketHistory(limit) {
      limit = Math.min(600, Math.max(1, Number(limit) || 100));
      return this.query(
        "SELECT * FROM market_history ORDER BY id DESC LIMIT ?", [limit]);
    },

    // ---- RANKINGS (leaderboard) ----
    /* Top por level, kills, magic (ml) ou skills melee/distance.
     * Retorna id, name, voc, level, value (+ totalKills quando by=kills). */
    async rankings(by, limit) {
      limit = Math.min(100, Math.max(1, Number(limit) || 50));
      by = String(by || "level").toLowerCase();
      if (by === "dist") by = "distance";
      const skillPath = {
        sword: "$.skills.sword",
        fist: "$.skills.fist",
        club: "$.skills.club",
        axe: "$.skills.axe",
        distance: "$.skills.dist",
      };
      if (by === "kills") {
        const rows = await this.query(
          `SELECT id, name, voc, level,
                  FLOOR(COALESCE(JSON_EXTRACT(data, '$.totalKills'), 0)) AS value
           FROM characters ORDER BY value DESC, level DESC, name ASC LIMIT ?`,
          [limit]);
        return rows.map((r) => ({ id: r.id, name: r.name, voc: r.voc, level: r.level,
          value: Number(r.value) || 0, totalKills: Number(r.value) || 0 }));
      }
      if (by === "magic") {
        const rows = await this.query(
          `SELECT id, name, voc, level,
                  FLOOR(COALESCE(JSON_EXTRACT(data, '$.ml'), 0)) AS value
           FROM characters ORDER BY value DESC, level DESC, name ASC LIMIT ?`,
          [limit]);
        return rows.map((r) => ({ id: r.id, name: r.name, voc: r.voc, level: r.level,
          value: Number(r.value) || 0 }));
      }
      if (skillPath[by]) {
        const rows = await this.query(
          `SELECT id, name, voc, level,
                  FLOOR(COALESCE(JSON_EXTRACT(data, '${skillPath[by]}'), 10)) AS value
           FROM characters ORDER BY value DESC, level DESC, name ASC LIMIT ?`,
          [limit]);
        return rows.map((r) => ({ id: r.id, name: r.name, voc: r.voc, level: r.level,
          value: Number(r.value) || 0 }));
      }
      const rows = await this.query(
        `SELECT id, name, voc, level, level AS value
         FROM characters ORDER BY level DESC, updated_at ASC, name ASC LIMIT ?`,
        [limit]);
      return rows.map((r) => ({ id: r.id, name: r.name, voc: r.voc, level: r.level,
        value: Number(r.level) || 1 }));
    },

    /* Contagem pública: leases ativos → personagens online; offlineHunting=0 (stub). */
    async onlineCount() {
      const offlineHunting = 0; // stub: caçadas em instâncias offline (futuro)
      const leases = await this.query(
        "SELECT account_id FROM account_leases WHERE expires_at > ?",
        [new Date()]);
      const leasedAccounts = new Set(leases.map((l) => Number(l.account_id)));
      const activeInstances = await this.query(
        "SELECT account_id, active_character_id, state FROM account_instances WHERE status='active'");
      const charIds = new Set();
      for (const row of activeInstances) {
        let state = null;
        try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
        const fromAuth = ((state && state.authority && state.authority.players) || [])
          .map((p) => Number(p && p.id));
        const fromMembers = ((state && state.members) || []).map((m) => Number(m && m.id));
        const ids = fromAuth.length ? fromAuth : fromMembers;
        if (!ids.length && row.active_character_id) ids.push(Number(row.active_character_id));
        for (const id of ids) {
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          const c = await this.findCharacter(id);
          if (c && leasedAccounts.has(Number(c.account_id))) charIds.add(id);
        }
      }
      const accountsWithChars = new Set();
      for (const id of charIds) {
        const c = await this.findCharacter(id);
        if (c) accountsWithChars.add(Number(c.account_id));
      }
      let cityOnline = 0;
      for (const accId of leasedAccounts) {
        if (!accountsWithChars.has(accId)) cityOnline++;
      }
      const onlineChars = charIds.size + cityOnline;
      return {
        onlineChars,
        offlineHunting,
        total: onlineChars + offlineHunting,
        leases: leases.length,
        instances: activeInstances.length,
      };
    },

    // ---- SNAPSHOT HISTORY ----
    async snapshotAdd(accountId,entityType,entityId,version,reason,data,force){
      const serialized=typeof data==="string"?data:JSON.stringify(data||{});
      if(!force){const recent=await this.query(
        `SELECT id FROM snapshot_history WHERE account_id=? AND entity_type=? AND entity_id=?
         AND created_at>DATE_SUB(NOW(),INTERVAL 60 SECOND) ORDER BY id DESC LIMIT 1`,
        [Number(accountId),String(entityType),String(entityId)]);if(recent[0])return recent[0];}
      const checksum=crypto.createHash("sha256").update(serialized).digest("hex");
      const result=await this.run(
        `INSERT INTO snapshot_history (account_id,entity_type,entity_id,version,reason,checksum,data)
         VALUES (?,?,?,?,?,?,?)`,[Number(accountId),String(entityType),String(entityId),Number(version)||0,
          String(reason||"checkpoint").slice(0,40),checksum,serialized]);
      await this.run(`DELETE FROM snapshot_history WHERE account_id=? AND id NOT IN
        (SELECT id FROM (SELECT id FROM snapshot_history WHERE account_id=? ORDER BY id DESC LIMIT 500) kept)`,
        [Number(accountId),Number(accountId)]);
      return {id:result.insertId,checksum};
    },
    async snapshotList(accountId,limit){return this.query(
      "SELECT * FROM snapshot_history WHERE account_id=? ORDER BY id DESC LIMIT ?",
      [Number(accountId),Math.max(1,Math.min(500,Number(limit)||100))]);
    },

    // ---- PARTY (multiplayer) ----
    async partyCreate(leaderChar) {
      const r = await this.run(
        "INSERT INTO parties (owner_account_id, leader_id, leader_name) VALUES (?, ?, ?)",
        [Number(leaderChar.account_id), Number(leaderChar.id), leaderChar.name]);
      return this.partyFindByLeader(leaderChar.id);
    },
    async partyFindByAccount(accountId) {
      const rows=await this.query("SELECT * FROM parties WHERE owner_account_id = ? LIMIT 1",
        [Number(accountId)]);
      return rows[0]||null;
    },
    async partyFindByLeader(charId) {
      const rows = await this.query("SELECT * FROM parties WHERE leader_id = ?",
        [Number(charId)]);
      return rows[0] || null;
    },
    async partyFindByCharacter(charId) {
      const rows = await this.query(
        `SELECT p.* FROM parties p
         LEFT JOIN party_members m ON m.party_id = p.id
         WHERE p.leader_id = ? OR m.character_id = ?
         LIMIT 1`,
        [Number(charId), Number(charId)]);
      return rows[0] || null;
    },
    async partyMembers(partyId) {
      return this.query(
        `SELECT c.id, c.name, c.voc, c.level, c.account_id, m.position,
                m.follow_nonce, m.follow_hunt, m.follow_instance,
                m.follow_otbm, m.follow_boss
         FROM party_members m
         JOIN characters c ON c.id = m.character_id
         WHERE m.party_id = ?
         ORDER BY m.position ASC, m.joined_at ASC, m.character_id ASC`,
        [Number(partyId)]);
    },
    async partyAddMember(partyId, charId) {
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        await conn.query("SELECT id FROM parties WHERE id=? FOR UPDATE",[Number(partyId)]);
        const [positions]=await conn.query("SELECT COALESCE(MAX(position),0)+1 AS next FROM party_members WHERE party_id=?",
          [Number(partyId)]);
        const [result]=await conn.query(
          "INSERT IGNORE INTO party_members (party_id, character_id, position) VALUES (?, ?, ?)",
          [Number(partyId),Number(charId),Number(positions[0].next)||1]);
        if(result.affectedRows)await conn.query(
          "UPDATE parties SET roster_version=roster_version+1 WHERE id=?",[Number(partyId)]);
        await conn.commit();return result.affectedRows>0;
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}
      finally{conn.release();}
    },
    async partyReorder(partyId, expectedVersion, memberIds) {
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const [parties]=await conn.query("SELECT roster_version FROM parties WHERE id=? FOR UPDATE",[Number(partyId)]);
        if(!parties[0]||Number(parties[0].roster_version)!==Number(expectedVersion)){
          await conn.rollback();return false;
        }
        const [current]=await conn.query("SELECT character_id FROM party_members WHERE party_id=?",
          [Number(partyId)]);
        const wanted=memberIds.map(Number);
        if(current.length!==wanted.length||wanted.some((id)=>!current.some((m)=>Number(m.character_id)===id))){
          await conn.rollback();return false;
        }
        for(let index=0;index<wanted.length;index++)await conn.query(
          "UPDATE party_members SET position=? WHERE party_id=? AND character_id=?",
          [index+1,Number(partyId),wanted[index]]);
        await conn.query("UPDATE parties SET roster_version=roster_version+1 WHERE id=?",[Number(partyId)]);
        await conn.commit();return true;
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}
      finally{conn.release();}
    },
    async partyRemoveMember(partyId, charId) {
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        await conn.query("SELECT id FROM parties WHERE id=? FOR UPDATE",[Number(partyId)]);
        const [result]=await conn.query(
          "DELETE FROM party_members WHERE party_id=? AND character_id=?",
          [Number(partyId),Number(charId)]);
        if(result.affectedRows)await conn.query(
          "UPDATE parties SET roster_version=roster_version+1 WHERE id=?",[Number(partyId)]);
        await conn.commit();return result.affectedRows>0;
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}
      finally{conn.release();}
    },
    async partyDelete(partyId) {
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        await conn.query("SELECT id FROM parties WHERE id=? FOR UPDATE",[Number(partyId)]);
        await conn.query("DELETE FROM party_members WHERE party_id=?",[Number(partyId)]);
        await conn.query(
          "UPDATE party_invites SET status='cancelled' WHERE party_id=? AND status='pending'",
          [Number(partyId)]);
        await conn.query("DELETE FROM parties WHERE id=?",[Number(partyId)]);
        await conn.commit();
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}
      finally{conn.release();}
    },
    async partySetZone(partyId, zone, opts) {
      opts = opts || {};
      await this.run(
        `UPDATE parties SET leader_zone = ?, leader_hunt = ?, leader_instance = ?,
           leader_otbm = ?, leader_boss = ?
         WHERE id = ?`,
        [zone, opts.hunt || null, opts.instance || null,
         opts.otbm || null, opts.boss || null, Number(partyId)]);
      // follows por membro: aplica em cada party_members do party
      const follows = opts.follows || [];
      for (const f of follows) {
        if (f.nonce) {
          await this.run(
            `UPDATE party_members SET
               follow_nonce = ?, follow_hunt = ?, follow_instance = ?,
               follow_otbm = ?, follow_boss = ?, follow_at = NOW()
             WHERE party_id = ? AND character_id = ?`,
            [f.nonce, f.hunt || null, f.instance || null,
             f.otbm || null, f.boss || null, Number(partyId), Number(f.character_id)]);
        }
      }
      if (zone === "city" || zone === "training") {
        // safe zone: limpa follows pendentes dos membros
        await this.run(
          `UPDATE party_members SET follow_nonce = NULL, follow_hunt = NULL,
             follow_instance = NULL, follow_otbm = NULL, follow_boss = NULL,
             follow_at = NULL
           WHERE party_id = ?`,
          [Number(partyId)]);
      }
      return null;   // valor de retorno não usado pelas rotas
    },
    async partyFollow(partyId, charId) {
      const rows = await this.query(
        `SELECT follow_nonce, follow_hunt, follow_instance, follow_otbm, follow_boss
         FROM party_members WHERE party_id = ? AND character_id = ?`,
        [Number(partyId), Number(charId)]);
      const m = rows[0];
      if (!m || !m.follow_nonce) return null;
      return {
        nonce: m.follow_nonce, hunt: m.follow_hunt, instance: m.follow_instance,
        otbm: m.follow_otbm, boss: m.follow_boss,
      };
    },
    async partyConsumeFollow(partyId, charId, nonce) {
      const r = await this.run(
        `UPDATE party_members SET follow_nonce = NULL, follow_hunt = NULL,
           follow_instance = NULL, follow_otbm = NULL, follow_boss = NULL,
           follow_at = NULL
         WHERE party_id = ? AND character_id = ? AND follow_nonce = ?`,
        [Number(partyId), Number(charId), nonce]);
      return r.affectedRows > 0;
    },
    async inviteCreate(partyId, leaderId, inviteeId, expiresAt) {
      const r = await this.run(
        "INSERT INTO party_invites (party_id, leader_id, invitee_id, expires_at) VALUES (?, ?, ?, ?)",
        [Number(partyId), Number(leaderId), Number(inviteeId), expiresAt || null]);
      return this.inviteFind(r.insertId);
    },
    async inviteFind(id) {
      const rows = await this.query("SELECT * FROM party_invites WHERE id = ?", [Number(id)]);
      return rows[0] || null;
    },
    async inviteUpdate(id, patch) {
      const set = [], params = [];
      for (const k in patch) { set.push(k + "=?"); params.push(patch[k]); }
      if (!set.length) return this.inviteFind(id);
      params.push(Number(id));
      await this.run("UPDATE party_invites SET " + set.join(", ") + " WHERE id = ?", params);
      return this.inviteFind(id);
    },
    async pendingInviteFor(inviteeId) {
      const rows = await this.query(
        `SELECT * FROM party_invites
         WHERE invitee_id = ? AND status = 'pending'
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [Number(inviteeId)]);
      return rows[0] || null;
    },
    async invitesFor(inviteeId, status) {
      return this.query(
        `SELECT i.*, p.leader_name, p.leader_zone
         FROM party_invites i
         JOIN parties p ON p.id = i.party_id
         WHERE i.invitee_id = ? AND i.status = ?
           AND (i.expires_at IS NULL OR i.expires_at > NOW())
         ORDER BY i.created_at DESC`,
        [Number(inviteeId), status]);
    },
  };
  return db;
}

async function ensureSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    login VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,
    email VARCHAR(128) DEFAULT NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    coins INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    token CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS account_leases (
    account_id INT UNSIGNED PRIMARY KEY,
    holder_id VARCHAR(80) NOT NULL,
    secret_hash CHAR(64) NOT NULL,
    acquired_at DATETIME(3) NOT NULL,
    renewed_at DATETIME(3) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    INDEX idx_account_leases_expiry (expires_at),
    CONSTRAINT fk_account_leases_account FOREIGN KEY (account_id)
      REFERENCES accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS account_instances (
    account_id INT UNSIGNED PRIMARY KEY,
    instance_id CHAR(64) NOT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    status ENUM('active','ended') NOT NULL DEFAULT 'active',
    kind ENUM('hunt','boss') NOT NULL,
    hunt_id VARCHAR(64) DEFAULT NULL,
    boss_id VARCHAR(64) DEFAULT NULL,
    instance_mode VARCHAR(24) NOT NULL DEFAULT 'non-pvp',
    party_id INT UNSIGNED DEFAULT NULL,
    party_version BIGINT UNSIGNED DEFAULT NULL,
    active_character_id INT UNSIGNED NOT NULL,
    state MEDIUMTEXT NOT NULL,
    saved_at DATETIME(3) NOT NULL,
    started_at DATETIME(3) NOT NULL,
    worker_cursor_at DATETIME(3) DEFAULT NULL,
    worker_total_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ended_at DATETIME(3) DEFAULT NULL,
    terminal_reason VARCHAR(40) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_instances_status (status,saved_at),
    CONSTRAINT fk_instances_account FOREIGN KEY (account_id)
      REFERENCES accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  for(const col of [
    "ADD COLUMN worker_cursor_at DATETIME(3) DEFAULT NULL AFTER started_at",
    "ADD COLUMN worker_total_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER worker_cursor_at",
  ]){try{await pool.query("ALTER TABLE account_instances "+col);}catch(e){/* já existe */}}
  try{await pool.query("UPDATE account_instances SET worker_cursor_at=saved_at WHERE worker_cursor_at IS NULL");}catch(e){}
  await pool.query(`CREATE TABLE IF NOT EXISTS snapshot_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    entity_type VARCHAR(24) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    reason VARCHAR(40) NOT NULL,
    checksum CHAR(64) NOT NULL,
    data MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_snapshot_account (account_id,id),
    INDEX idx_snapshot_entity (account_id,entity_type,entity_id,created_at),
    CONSTRAINT fk_snapshot_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS characters (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    name VARCHAR(32) NOT NULL,
    voc VARCHAR(24) NOT NULL DEFAULT 'none',
    level INT UNSIGNED NOT NULL DEFAULT 1,
    data MEDIUMTEXT NOT NULL,
    save_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    zone VARCHAR(16) NOT NULL DEFAULT 'unknown',
    hp INT UNSIGNED NOT NULL DEFAULT 0,
    mp INT UNSIGNED NOT NULL DEFAULT 0,
    max_hp INT UNSIGNED NOT NULL DEFAULT 0,
    max_mp INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_characters_name (name)
  ) ENGINE=InnoDB`);
  // colunas novas (migração de instalações antigas)
  for (const col of [
    "ADD COLUMN save_version BIGINT UNSIGNED NOT NULL DEFAULT 1",
    "ADD COLUMN zone VARCHAR(16) NOT NULL DEFAULT 'unknown'",
    "ADD COLUMN hp INT UNSIGNED NOT NULL DEFAULT 0",
    "ADD COLUMN mp INT UNSIGNED NOT NULL DEFAULT 0",
    "ADD COLUMN max_hp INT UNSIGNED NOT NULL DEFAULT 0",
    "ADD COLUMN max_mp INT UNSIGNED NOT NULL DEFAULT 0",
  ]) {
    try { await pool.query("ALTER TABLE characters " + col); } catch (e) { /* já existe */ }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS parties (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_account_id INT UNSIGNED NOT NULL,
    roster_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    leader_id INT UNSIGNED NOT NULL,
    leader_name VARCHAR(32) NOT NULL,
    leader_zone ENUM('unknown','city','training','hunt','boss')
      NOT NULL DEFAULT 'unknown',
    leader_hunt VARCHAR(64) DEFAULT NULL,
    leader_instance VARCHAR(24) DEFAULT NULL,
    leader_otbm VARCHAR(64) DEFAULT NULL,
    leader_boss VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_parties_owner (owner_account_id),
    UNIQUE KEY uq_parties_leader (leader_id),
    INDEX idx_parties_zone (leader_zone),
    CONSTRAINT fk_parties_owner FOREIGN KEY (owner_account_id)
      REFERENCES accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS party_members (
    party_id INT UNSIGNED NOT NULL,
    character_id INT UNSIGNED NOT NULL,
    position TINYINT UNSIGNED NOT NULL DEFAULT 1,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    follow_nonce VARCHAR(64) DEFAULT NULL,
    follow_hunt VARCHAR(64) DEFAULT NULL,
    follow_instance VARCHAR(24) DEFAULT NULL,
    follow_otbm VARCHAR(64) DEFAULT NULL,
    follow_boss VARCHAR(64) DEFAULT NULL,
    follow_at TIMESTAMP NULL,
    PRIMARY KEY (party_id, character_id),
    UNIQUE KEY uq_member_character (character_id),
    INDEX idx_members_party (party_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS party_invites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    party_id INT UNSIGNED NOT NULL,
    leader_id INT UNSIGNED NOT NULL,
    invitee_id INT UNSIGNED NOT NULL,
    status ENUM('pending','accepted','declined','expired','cancelled')
      NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    UNIQUE KEY uq_invite_pending (invitee_id, status),
    INDEX idx_invites_party (party_id, status)
  ) ENGINE=InnoDB`);

  // Migração das parties anteriores ao modelo account-owned. A conta do
  // líder vira a dona; em legado inconsistente, mantém-se a party mais antiga.
  try { await pool.query("ALTER TABLE parties ADD COLUMN owner_account_id INT UNSIGNED DEFAULT NULL AFTER id"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE parties ADD COLUMN roster_version BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER owner_account_id"); }
  catch(e) { /* já existe */ }
  const [legacyParties]=await pool.query(
    `SELECT p.id, p.owner_account_id, c.account_id AS leader_account_id
     FROM parties p LEFT JOIN characters c ON c.id = p.leader_id ORDER BY p.id ASC`);
  const ownerParty=new Map();
  for(const p of legacyParties){
    const owner=Number(p.owner_account_id||p.leader_account_id)||0;
    if(!owner||ownerParty.has(owner)){
      await pool.query("DELETE FROM party_members WHERE party_id = ?",[p.id]);
      await pool.query("UPDATE party_invites SET status='cancelled' WHERE party_id=? AND status='pending'",[p.id]);
      await pool.query("DELETE FROM parties WHERE id = ?",[p.id]);
      continue;
    }
    ownerParty.set(owner,p.id);
    if(!p.owner_account_id)await pool.query("UPDATE parties SET owner_account_id=? WHERE id=?",[owner,p.id]);
  }
  try { await pool.query("ALTER TABLE parties MODIFY owner_account_id INT UNSIGNED NOT NULL"); }
  catch(e) { /* instalação incompatível será denunciada ao criar/usar party */ }
  try { await pool.query("ALTER TABLE parties ADD UNIQUE KEY uq_parties_owner (owner_account_id)"); }
  catch(e) { /* já existe */ }
  try { await pool.query(
    "ALTER TABLE parties ADD CONSTRAINT fk_parties_owner FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE CASCADE"); }
  catch(e) { /* já existe ou instalação antiga sem suporte a FK */ }

  let addedPosition=false;
  try {
    await pool.query("ALTER TABLE party_members ADD COLUMN position TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER character_id");
    addedPosition=true;
  } catch(e) { /* já existe */ }
  if(addedPosition){
    const [legacyMembers]=await pool.query(
      "SELECT party_id, character_id FROM party_members ORDER BY party_id, joined_at, character_id");
    const positions=new Map();
    for(const member of legacyMembers){
      const pos=(positions.get(member.party_id)||0)+1;positions.set(member.party_id,pos);
      await pool.query("UPDATE party_members SET position=? WHERE party_id=? AND character_id=?",
        [pos,member.party_id,member.character_id]);
    }
  }
  try { await pool.query("ALTER TABLE party_members ADD INDEX idx_members_order (party_id, position)"); }
  catch(e) { /* já existe */ }

  try { await pool.query("ALTER TABLE accounts ADD COLUMN market_gold INT UNSIGNED NOT NULL DEFAULT 0"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN gold BIGINT UNSIGNED NOT NULL DEFAULT 0"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN gold_migrated TINYINT(1) NOT NULL DEFAULT 0"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN vip_until BIGINT UNSIGNED NOT NULL DEFAULT 0"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN missions MEDIUMTEXT NULL"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN missions_done MEDIUMTEXT NULL"); }
  catch(e) { /* já existe */ }
  await pool.query(`CREATE TABLE IF NOT EXISTS market_offers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seller_id INT UNSIGNED NOT NULL,
    seller_name VARCHAR(32) NOT NULL,
    kind ENUM('item','coins','buy') NOT NULL DEFAULT 'item',
    slug VARCHAR(64) DEFAULT NULL,
    tier INT UNSIGNED NOT NULL DEFAULT 0,
    data MEDIUMTEXT DEFAULT NULL,
    qty INT UNSIGNED NOT NULL DEFAULT 1,
    price INT UNSIGNED NOT NULL,
    price_tc TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    status ENUM('active','sold','cancelled','expired') NOT NULL DEFAULT 'active',
    buyer_id INT UNSIGNED DEFAULT NULL,
    bought_at TIMESTAMP NULL,
    INDEX idx_market_active (status, kind, tier),
    INDEX idx_market_seller (seller_id, status)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS market_stats (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(64) NOT NULL,
    tier INT UNSIGNED NOT NULL DEFAULT 0,
    count INT UNSIGNED NOT NULL DEFAULT 0,
    total BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_price INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_stats_item (slug, tier)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS market_history (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seller_id INT UNSIGNED NOT NULL,
    seller_name VARCHAR(32) NOT NULL,
    buyer_id INT UNSIGNED DEFAULT NULL,
    buyer_name VARCHAR(32) DEFAULT NULL,
    kind ENUM('item','coins','buy') NOT NULL DEFAULT 'item',
    slug VARCHAR(64) DEFAULT NULL,
    tier INT UNSIGNED NOT NULL DEFAULT 0,
    qty INT UNSIGNED NOT NULL DEFAULT 1,
    price INT UNSIGNED NOT NULL,
    price_tc TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_history_created (created_at),
    INDEX idx_history_item (slug, created_at)
  ) ENGINE=InnoDB`);
}

/* Cria a instancia de db conforme o ambiente */
let _db = null;
async function getDb() {
  if (_db) return _db;
  if (MYSQL_HOST) {
    try {
      _db = await MysqlStore();
      console.log("[db] MySQL conectado em", MYSQL_HOST + ":" + MYSQL_PORT + "/" + MYSQL_DB);
      return _db;
    } catch (e) {
      console.warn("[db] falha no MySQL (" + e.message + ") — usando storage JSON local");
    }
  }
  _db = new JsonStore();
  console.log("[db] storage JSON local em", DATA_DIR);
  return _db;
}

module.exports = { getDb, MYSQL_HOST };
