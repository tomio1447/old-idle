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

/* guild.js é usado para dia de server save, defs das tasks e nível.
 * Lazy: ele não require db.js de volta, então não há ciclo. */
let _guildMod = null;
function guildModule() {
  if (_guildMod === null) {
    try { _guildMod = require("./guild"); } catch (e) { _guildMod = false; }
  }
  return _guildMod || null;
}

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
  this.sessions = Array.isArray(this._load("sessions.json", [])) ? this._load("sessions.json", []) : [];
  this.leases = Array.isArray(this._load("leases.json", [])) ? this._load("leases.json", []) : [];
  this.instances = Array.isArray(this._load("instances.json", [])) ? this._load("instances.json", []) : [];
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
  // guilds persistem em data/guilds.json (convites/tasks precisam
  // sobreviver a reinícios do servidor)
  const guildData = this._load("guilds.json", null);
  this.guilds = Array.isArray(guildData && guildData.guilds) ? guildData.guilds : [];
  this.guildMembers = Array.isArray(guildData && guildData.members) ? guildData.members : [];
  this.guildInvites = Array.isArray(guildData && guildData.invites) ? guildData.invites : [];
  this.guildTasks = Array.isArray(guildData && guildData.tasks) ? guildData.tasks : [];
  this.guildLog = Array.isArray(guildData && guildData.log) ? guildData.log : [];
  this.guildRequests = Array.isArray(guildData && guildData.requests) ? guildData.requests : [];
  // PvP guild-vs-guild: batalhas agendadas + roster sorteado (mesmo arquivo)
  this.pvpBattles = Array.isArray(guildData && guildData.pvpBattles) ? guildData.pvpBattles : [];
  this.pvpBattleRoster = Array.isArray(guildData && guildData.pvpRoster) ? guildData.pvpRoster : [];
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
  const storeData = this._load("store.json", null);
  this.storeOrders = Array.isArray(storeData && storeData.orders) ? storeData.orders : [];
  this.coinLedger = Array.isArray(storeData && storeData.ledger) ? storeData.ledger : [];
  this.vouchers = Array.isArray(storeData && storeData.vouchers) ? storeData.vouchers : [];
  // Estado administrável por código (paused/deleted) — a aba VOUCHERS do
  // painel admin controla isso sem mexer no VOUCHERS fixo do store.js.
  this.voucherState = (storeData && storeData.voucherState && typeof storeData.voucherState === "object")
    ? storeData.voucherState : {};
  // Punições administrativas persistem em data/bans.json
  this.bans = Array.isArray(this._load("bans.json", [])) ? this._load("bans.json", []) : [];
  // Silenciamentos de chat persistem em data/chat_mutes.json (restarts não limpam)
  this.chatMutes = Array.isArray(this._load("chat_mutes.json", [])) ? this._load("chat_mutes.json", []) : [];
  // Eventos do calendário global em data/calendar_events.json
  this.calendarEvents = Array.isArray(this._load("calendar_events.json", [])) ? this._load("calendar_events.json", []) : [];
  this._storeOrderSeq = this.storeOrders.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
  this._coinLedgerSeq = this.coinLedger.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
  // Backfill do progresso da CONTA (display_name + level/exp do maior char).
  this._backfillAccountProgress();
  // Cap histórico inchado de runs anteriores antes do primeiro _save do boot.
  const snapBefore = (this.snapshots || []).length;
  this._pruneSnapshots();
  if ((this.snapshots || []).length !== snapBefore) this._snapshotsDirty = true;
  this._save();
  this._partySave();
  this._guildSave();
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
  this._saveStore();
};
JsonStore.prototype._saveStore = function () {
  fs.writeFileSync(path.join(DATA_DIR, "store.json"),
    JSON.stringify({ orders: this.storeOrders || [], ledger: this.coinLedger || [],
                     vouchers: this.vouchers || [], voucherState: this.voucherState || {} }, null, 1));
};
JsonStore.prototype._saveBans = function () {
  fs.writeFileSync(path.join(DATA_DIR, "bans.json"),
    JSON.stringify(this.bans || [], null, 1));
};
JsonStore.prototype._saveChatMutes = function () {
  fs.writeFileSync(path.join(DATA_DIR, "chat_mutes.json"),
    JSON.stringify(this.chatMutes || [], null, 1));
};
/* Mutes de chat persistidos — o CHAT_BUS hidrata no boot e grava a cada
 * mute/unmute. until é ms epoch (0/vencido = removido na listagem). */
JsonStore.prototype.chatMuteList = function () {
  const now = Date.now();
  const keep = (this.chatMutes || []).filter((m) => !m.until || Number(m.until) > now);
  if (keep.length !== (this.chatMutes || []).length) {
    this.chatMutes = keep; this._saveChatMutes();
  }
  return keep.slice();
};
JsonStore.prototype.chatMuteSet = function (m) {
  this.chatMutes = (this.chatMutes || []).filter((x) => Number(x.accountId) !== Number(m.accountId));
  this.chatMutes.push({ accountId: Number(m.accountId), until: Number(m.until) || 0,
    by: String(m.by || "admin"), reason: String(m.reason || ""),
    charName: String(m.charName || ""), at: Number(m.at) || Date.now() });
  this._saveChatMutes();
  return m;
};
JsonStore.prototype.chatMuteDelete = function (accountId) {
  const before = (this.chatMutes || []).length;
  this.chatMutes = (this.chatMutes || []).filter((x) => Number(x.accountId) !== Number(accountId));
  if (this.chatMutes.length !== before) this._saveChatMutes();
  return before - this.chatMutes.length;
};

/* ------------------------- CALENDÁRIO GLOBAL (eventos/metas) -----------
 * day = "YYYY-MM-DD". kind: "evento" | "meta". Escrita só via admin. */
JsonStore.prototype._saveCalendar = function () {
  fs.writeFileSync(path.join(DATA_DIR, "calendar_events.json"),
    JSON.stringify(this.calendarEvents || [], null, 1));
};
JsonStore.prototype.calendarList = function () {
  return (this.calendarEvents || []).slice()
    .sort((a, b) => String(a.day).localeCompare(String(b.day)) || Number(a.id) - Number(b.id));
};
JsonStore.prototype.calendarAdd = function (ev) {
  const row = { id: this._nextId(this.calendarEvents),
    day: String(ev.day || "").slice(0, 10), title: String(ev.title || "").slice(0, 80),
    body: String(ev.body || "").slice(0, 500), kind: ev.kind === "meta" ? "meta" : "evento",
    created_by: String(ev.created_by || "admin"), created_at: Date.now() };
  this.calendarEvents.push(row); this._saveCalendar(); return row;
};
JsonStore.prototype.calendarUpdate = function (id, ev) {
  const row = (this.calendarEvents || []).find((x) => Number(x.id) === Number(id));
  if (!row) return null;
  if (ev.day != null) row.day = String(ev.day).slice(0, 10);
  if (ev.title != null) row.title = String(ev.title).slice(0, 80);
  if (ev.body != null) row.body = String(ev.body).slice(0, 500);
  if (ev.kind != null) row.kind = ev.kind === "meta" ? "meta" : "evento";
  this._saveCalendar(); return row;
};
JsonStore.prototype.calendarDelete = function (id) {
  const before = (this.calendarEvents || []).length;
  this.calendarEvents = (this.calendarEvents || []).filter((x) => Number(x.id) !== Number(id));
  if (this.calendarEvents.length !== before) this._saveCalendar();
  return before - this.calendarEvents.length;
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
JsonStore.prototype.findAccountByEmail = function (email) {
  const em = String(email || "").toLowerCase();
  return (this.accounts || []).find((a) => String(a.email || "").toLowerCase() === em && em) || null;
};
/* Login social: localiza a conta pela identidade do provedor —
 * google.sub / twitch.id dentro de accounts.social (JSON). */
JsonStore.prototype.findAccountBySocial = function (provider, key) {
  const prov = String(provider || ""), k = String(key || "");
  if (!k || (prov !== "google" && prov !== "twitch")) return null;
  return (this.accounts || []).find((a) => {
    let s = a.social;
    if (typeof s === "string") { try { s = JSON.parse(s); } catch (e) { s = null; } }
    const node = s && typeof s === "object" ? s[prov] : null;
    return node && String(node.sub || node.id || "") === k;
  }) || null;
};
JsonStore.prototype.setAccountEmailVerified = function (accountId, ok) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.email_verified = ok ? 1 : 0;
  this._save();
  return a;
};
JsonStore.prototype.setAccountRecoveryCode = function (accountId, code, expiresAt) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.recovery_code = String(code || "");
  a.recovery_code_expires = Math.max(0, Math.floor(Number(expiresAt) || 0));
  this._save();
  return a;
};
JsonStore.prototype.setAccountPassword = function (accountId, hash) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.password_hash = String(hash || "");
  this._save();
  return a;
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
  if(typeof this._syncBlessWallets==="function")state=this._syncBlessWallets(state);
  Object.assign(row,meta,{state,status:"active",ended_at:null,terminal_reason:null,
    worker_cursor_at:new Date(meta.saved_at).toISOString(),worker_total_ms:Number(row.worker_total_ms)||0,
    updated_at:new Date(lease.now).toISOString()});
  this._saveRuntime(false);return {ok:true,instance:row};
};
JsonStore.prototype.instancePatchState = function(ownerAccountId,requesterAccountId,instanceId,expectedVersion,patchState,lease){
  // lease=null = bypass administrativo (grants GM em chars de terceiros).
  if(lease&&!this.leaseValidate(requesterAccountId,lease.holderId,lease.secretHash,lease.now))
    return {ok:false,error:"LEASE_REQUIRED"};
  const row=this.instanceGet(ownerAccountId);if(!row||row.status!=="active")return {ok:false,error:"INSTANCE_NOT_ACTIVE"};
  if(String(row.instance_id)!==String(instanceId||"")||Number(row.version)!==Number(expectedVersion))
    return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
  const next=patchState(row.state);if(!next)return {ok:false,error:"INSTANCE_PATCH_REJECTED",instance:row};
  row.state=next;row.version=Number(row.version)+1;row.updated_at=new Date(lease?lease.now:Date.now()).toISOString();
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
  if(/^(world-boss-wz[1-6]|world-devourer|the-pale-worm|goshnar-s-megalomania)$/.test(String(row.boss_id||""))){
    const wb=typeof global.__WORLD_BOSS!=="undefined"?global.__WORLD_BOSS:null;
    const ids=wb&&typeof wb.joinedAccountIds==="function"?wb.joinedAccountIds():[];
    const memberLeased=ids.some((id)=>{
      const item=(this.leases||[]).find((entry)=>Number(entry.account_id)===Number(id));
      return item&&new Date(item.expires_at).getTime()>now;
    });
    if(memberLeased)return {ok:false,skipped:"wb-member-leased"};
  }
  const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
  const elapsed=Math.min(Math.max(0,now-cursor),Math.max(1,Number(maxStep)||3600000));
  if(elapsed<Math.max(1,Number(minStep)||500))return {ok:false,skipped:"not-due"};
  const checkpoint=cursor+elapsed,advanced=advanceState(row.state,elapsed,checkpoint);
  const next=advanced&&typeof advanced==="object"&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
  if(typeof this._syncBlessWallets==="function")next.state=this._syncBlessWallets(next.state);
  const dirty=SharedInv?pouchDirtyScan(next):{pouch:new Set(),forge:new Set()};
  row.state=next.state;row.version=Number(row.version)+1;row.saved_at=new Date(checkpoint).toISOString();
  row.worker_cursor_at=row.saved_at;row.worker_total_ms=(Number(row.worker_total_ms)||0)+elapsed;
  if(next.terminalReason){row.status="ended";row.terminal_reason=next.terminalReason;row.ended_at=row.saved_at;}
  // Inventário da conta: tick terminal extrai containers para o shared.
  const sharedByAcc=new Map(),sharedMirror=new Map();
  if((next.terminalReason||dirty.pouch.size||dirty.forge.size)&&SharedInv&&(next.characters||[]).length){
    const tickInstanceId=String(row.instance_id||"");
    for(const projection of next.characters||[]){
      const c=this.findCharacter(projection.id);if(!c)continue;
      const aid=Number(c.account_id);if(!aid)continue;
      if(aid!==Number(accountId)){
        const ownInst=this.instanceGet(aid);
        if(ownInst&&ownInst.status==="active"&&String(ownInst.instance_id)!==tickInstanceId)continue;
      }
      let shared=sharedByAcc.get(aid);
      const firstAcc=!shared;
      if(!shared){
        const a=this.findAccountById(aid);
        let s=a&&a.shared_inventory;
        if(typeof s==="string"){try{s=JSON.parse(s);}catch(e){s=null;}}
        shared=s&&s.v===1?s:SharedInv.emptySharedInventory();
        if(a)a.shared_inventory=shared;
        sharedByAcc.set(aid,shared);
      }
      if(next.terminalReason)
        sharedMirror.set(Number(projection.id),sharedInvExtractMirror(shared,projection.data,true,firstAcc));
      else{
        if(dirty.pouch.has(Number(projection.id)))sharedInvPouchDirtyFlush(shared,projection.data);
        if(dirty.forge.has(Number(projection.id)))sharedInvForgeDirtyFlush(shared,projection.data);
      }
    }
  }
  for(const projection of next.characters||[]){const c=this.findCharacter(projection.id);
    if(!c)continue;c.data=sharedMirror.get(Number(projection.id))||projection.data;c.level=projection.level;c.voc=projection.voc;
    c.hp=projection.hp;c.mp=projection.mp;c.max_hp=projection.max_hp;c.max_mp=projection.max_mp;
    c.save_version=(Number(c.save_version)||0)+1;c.updated_at=new Date(now).toISOString();}
  // Guild tasks: idem ao tick — instância ociosa também credita kills.
  for(const projection of next.characters||[]){
    const tk=projection&&projection.taskKills;
    if(!tk||typeof tk!=="object")continue;
    const c=this.findCharacter(projection.id);if(!c)continue;
    try{this.guildCreditKills(Number(c.account_id),tk);}catch(e){console.error("[guild] credit kills:",e&&e.message);}
  }
  if(typeof this.syncAccountGoldFromCharacters==="function")this.syncAccountGoldFromCharacters(next.characters||[]);
  row.updated_at=new Date(now).toISOString();this._saveRuntime(true);
  return {ok:true,accountId:Number(accountId),elapsed,version:Number(row.version),terminalReason:next.terminalReason||null};
};
JsonStore.prototype.instanceAuthorityTick = function(accountId,expectedVersion,now,maxStep,advanceState,lease,opts){
  const leaseAcc=(opts&&opts.leaseAccountId!=null)?opts.leaseAccountId:accountId;
  if(!this.leaseValidate(leaseAcc,lease.holderId,lease.secretHash,lease.now))return {ok:false,error:"LEASE_REQUIRED"};
  const row=this.instanceGet(accountId);if(!row||row.status!=="active")return {ok:false,error:"INSTANCE_NOT_ACTIVE"};
  if(expectedVersion!==null&&expectedVersion!==undefined&&Number(row.version)!==Number(expectedVersion))
    return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
  const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
  const elapsed=Math.min(Math.max(0,now-cursor),Math.max(100,Number(maxStep)||10000));
  if(elapsed<50)return {ok:true,instance:row,characters:[],elapsed:0};
  const advanced=advanceState(row.state,elapsed,now),next=advanced&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
  if(typeof this._syncBlessWallets==="function")next.state=this._syncBlessWallets(next.state);
  const dirty=SharedInv?pouchDirtyScan(next):{pouch:new Set(),forge:new Set()};
  row.state=next.state;row.version=Number(row.version)+1;row.saved_at=new Date(now).toISOString();row.worker_cursor_at=row.saved_at;
  if(next.terminalReason){row.status="ended";row.terminal_reason=next.terminalReason;row.ended_at=row.saved_at;}
  // Inventário da conta: tick terminal extrai containers para o shared.
  const sharedByAcc=new Map(),sharedMirror=new Map();
  if((next.terminalReason||dirty.pouch.size||dirty.forge.size)&&SharedInv&&(next.characters||[]).length){
    const tickInstanceId=String(row.instance_id||"");
    for(const projection of next.characters||[]){
      const c=this.findCharacter(projection.id);if(!c)continue;
      const aid=Number(c.account_id);if(!aid)continue;
      if(aid!==Number(accountId)){
        const ownInst=this.instanceGet(aid);
        if(ownInst&&ownInst.status==="active"&&String(ownInst.instance_id)!==tickInstanceId)continue;
      }
      let shared=sharedByAcc.get(aid);
      const firstAcc=!shared;
      if(!shared){
        const a=this.findAccountById(aid);
        let s=a&&a.shared_inventory;
        if(typeof s==="string"){try{s=JSON.parse(s);}catch(e){s=null;}}
        shared=s&&s.v===1?s:SharedInv.emptySharedInventory();
        if(a)a.shared_inventory=shared;
        sharedByAcc.set(aid,shared);
      }
      if(next.terminalReason)
        sharedMirror.set(Number(projection.id),sharedInvExtractMirror(shared,projection.data,true,firstAcc));
      else{
        if(dirty.pouch.has(Number(projection.id)))sharedInvPouchDirtyFlush(shared,projection.data);
        if(dirty.forge.has(Number(projection.id)))sharedInvForgeDirtyFlush(shared,projection.data);
      }
    }
  }
  const changed=[];for(const projection of next.characters||[]){const c=this.findCharacter(projection.id);
    if(!c)continue;c.data=sharedMirror.get(Number(projection.id))||projection.data;c.level=projection.level;c.voc=projection.voc;
    c.hp=projection.hp;c.mp=projection.mp;c.max_hp=projection.max_hp;c.max_mp=projection.max_mp;
    c.save_version=(Number(c.save_version)||0)+1;c.updated_at=row.saved_at;changed.push(c);}
  // Guild tasks: o engine emite taskKills por projeção (delta da janela) —
  // credita nas tasks do dia da conta junto com o checkpoint.
  for(const projection of next.characters||[]){
    const tk=projection&&projection.taskKills;
    if(!tk||typeof tk!=="object")continue;
    const c=this.findCharacter(projection.id);if(!c)continue;
    try{this.guildCreditKills(Number(c.account_id),tk);}catch(e){console.error("[guild] credit kills:",e&&e.message);}
  }
  if(typeof this.syncAccountGoldFromCharacters==="function")this.syncAccountGoldFromCharacters(next.characters||[]);
  row.updated_at=row.saved_at;this._saveRuntime(true);return {ok:true,instance:row,characters:changed,elapsed,
    terminalReason:next.terminalReason||null};
};
JsonStore.prototype.instanceTransferOwner = function(fromAccountId, toAccountId) {
  const fromId = Number(fromAccountId), toId = Number(toAccountId);
  if (!fromId || !toId || fromId === toId) return { ok: false, error: "INVALID_TRANSFER" };
  const from = this.instanceGet(fromId);
  if (!from || from.status !== "active") return { ok: false, error: "NO_INSTANCE" };
  let to = this.instanceGet(toId);
  if (to && to.status === "active") {
    to.status = "ended";
    to.terminal_reason = "mega-replaced-by-transfer";
    to.ended_at = new Date().toISOString();
    to.updated_at = to.ended_at;
  }
  if (!to) {
    to = { account_id: toId };
    this.instances = this.instances || [];
    this.instances.push(to);
  }
  const keep = ["instance_id", "version", "kind", "hunt_id", "boss_id", "instance_mode",
    "party_id", "party_version", "active_character_id", "state", "saved_at", "started_at",
    "worker_cursor_at", "worker_total_ms"];
  for (const key of keep) if (from[key] !== undefined) to[key] = from[key];
  to.account_id = toId;
  to.status = "active";
  to.terminal_reason = null;
  to.ended_at = null;
  to.updated_at = new Date().toISOString();
  from.status = "ended";
  from.terminal_reason = "mega-ownership-transferred";
  from.ended_at = to.updated_at;
  from.updated_at = to.updated_at;
  this._saveRuntime(true);
  return { ok: true, instance: to, fromAccountId: fromId, toAccountId: toId };
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
/* Encerra sala Megalomania sem lease: lobby já vazio após leaveFight.
 * Evita row ativo multi-conta órfão → INSTANCE_CHARACTER_NOT_OWNED no PUT. */
JsonStore.prototype.instanceEndMegaOrphan = function(accountId,instanceId,reason){
  const row=this.instanceGet(accountId);
  if(!row||row.status!=="active")return {ok:true,instance:row||null,alreadyEnded:true};
  if(String(row.boss_id||"")!=="goshnar-s-megalomania")
    return {ok:false,error:"NOT_MEGA_INSTANCE"};
  if(instanceId&&String(row.instance_id)!==String(instanceId))
    return {ok:false,error:"INSTANCE_ID_MISMATCH",instance:row};
  const now=new Date().toISOString();
  row.version=Number(row.version)+1;row.status="ended";
  row.terminal_reason=reason||"mega-lobby-empty";
  row.ended_at=now;row.updated_at=now;
  this._saveRuntime(false,true);return {ok:true,instance:row};
};
/* World Boss / prep: encerra a row sem lease (hunts dos JOIN + sala WB). */
JsonStore.prototype.instanceEndForced = function(accountId,reason){
  const row=this.instanceGet(accountId);
  if(!row||row.status!=="active")return {ok:true,instance:row||null,alreadyEnded:true};
  const now=new Date().toISOString();
  row.version=Number(row.version)+1;row.status="ended";
  row.terminal_reason=reason||"forced-end";
  row.ended_at=now;row.updated_at=now;
  this._saveRuntime(false,true);return {ok:true,instance:row};
};
JsonStore.prototype.instanceReplaceForced = function(accountId,instanceId,meta,state){
  this.instances=this.instances||[];
  let row=this.instanceGet(accountId);
  const nowIso=new Date().toISOString();
  const savedAt=meta.saved_at||nowIso;
  const startedAt=meta.started_at||meta.startedAt||savedAt||nowIso;
  if(!row){row={account_id:Number(accountId)};this.instances.push(row);}
  Object.assign(row,meta,{
    instance_id:instanceId,version:1,state,status:"active",ended_at:null,terminal_reason:null,
    worker_cursor_at:savedAt,worker_total_ms:0,updated_at:nowIso,saved_at:savedAt,started_at:startedAt,
  });
  this._saveRuntime(false,true);return {ok:true,instance:row};
};
/* Limpeza de BOOT: o processo anterior morreu — todos os holders de lease
 * morreram com ele. Sem expirar os registros persistidos, o acquire da aba
 * retornava 409 (LEASE_HELD) por até LEASE_TTL_MS após um restart, porque o
 * registro antigo ainda estava "ativo" no disco com holder/segredo antigos. */
JsonStore.prototype.expireAllLeases = function () {
  const before=(this.leases||[]).length;
  if(before){this.leases=[];this._saveLeases();}
  return before;
};
/* Limpeza de BOOT: encerra todas as instâncias ainda marcadas como ativas.
 * O estado autoritativo do processo anterior não existe mais; os personagens
 * já foram persistidos no último tick/checkpoint, então não há perda além do
 * progresso do downtime (que ninguém jogou). O cliente vê status "ended" +
 * terminalReason no próximo GET e volta ao templo sem travar. */
JsonStore.prototype.endAllInstances = function (reason, keepInstanceIds) {
  const nowIso=new Date().toISOString();
  const clean=String(reason||"server-restart").replace(/[^a-z0-9_-]/gi,"").slice(0,40)||"server-restart";
  const keep=new Set((keepInstanceIds||[]).map(String));
  let count=0;
  for(const row of this.instances||[]){
    if(row.status!=="active"||keep.has(String(row.instance_id)))continue;
    row.version=Number(row.version)+1;
    row.status="ended";
    row.terminal_reason=clean;
    row.ended_at=nowIso;
    row.updated_at=nowIso;
    row.worker_cursor_at=nowIso;
    count++;
  }
  if(count)this._saveRuntime(false,true);
  return count;
};
/* Retomada de batalha PvP após restart: grava o estado ajustado e reinicia o
 * cursor do worker em `now` (o downtime não é simulado). */
JsonStore.prototype.instancePvpResume = function (accountId, instanceId, state, now) {
  const row=(this.instances||[]).find((r)=>Number(r.account_id)===Number(accountId));
  if(!row||row.status!=="active"||String(row.instance_id)!==String(instanceId))return {ok:false,error:"INSTANCE_NOT_ACTIVE"};
  const iso=new Date(Number(now)||Date.now()).toISOString();
  row.state=state;row.version=Number(row.version)+1;row.saved_at=iso;row.worker_cursor_at=iso;row.updated_at=iso;
  this._saveRuntime(false,true);return {ok:true};
};
JsonStore.prototype.createAccount = function (login, hash, role, coins, email, displayName) {
  const acc = { id: this._nextId(this.accounts), login, password_hash: hash,
                email: String(email || "").slice(0, 120),
                display_name: String(displayName || login).slice(0, 24),
                email_verified: 0, email_code: "", email_code_expires: 0,
                role: role || "user", coins: coins || 0, gold: 0, gold_migrated: true,
                level: 1, exp: 0,
                vip_until: 0, market_gold: 0, cosmetics: {},
                created_at: new Date().toISOString() };
  this.accounts.push(acc);
  this._save();
  return acc;
};
JsonStore.prototype.findAccountByDisplayName = function (name) {
  const dn = String(name || "").toLowerCase();
  return (this.accounts || []).find((a) => String(a.display_name || "").toLowerCase() === dn) || null;
};
JsonStore.prototype.setAccountLevelExp = function (accountId, level, exp) {
  const a = this.findAccountById(accountId); if (!a) return null;
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  if (lvl >= (Number(a.level) || 1)) {
    a.level = lvl; a.exp = Math.max(0, Math.floor(Number(exp) || 0)); this._save();
  }
  return a;
};
/* Level/exp da CONTA injetados no snapshot do char — paridade com o
 * _applyAccountLevel do MySQL. */
JsonStore.prototype._applyAccountLevel = function (row, acc) {
  if (!row || !acc) return row;
  let data = row.data, parsed = null;
  if (typeof data === "string") { try { parsed = JSON.parse(data); } catch (e) {} }
  else if (data && typeof data === "object") parsed = data;
  /* Nunca injeta MENOS que o progresso gravado no próprio char: uma conta
   * atrasada (backfill que falhou) rebaixava o level na leitura e o save
   * seguinte gravava o rebaixamento — destruindo o progresso real. O max
   * também auto-cura a conta no próximo setAccountLevelExp. */
  const level = Math.max(1, Math.floor(Number(acc.level) || 1),
    Math.floor(Number(row.level) || 1), parsed ? Math.floor(Number(parsed.level) || 1) : 1);
  const exp = Math.max(Math.floor(Number(acc.exp) || 0), parsed ? Math.floor(Number(parsed.exp) || 0) : 0);
  row.level = level;
  if (parsed) { parsed.level = level; parsed.exp = exp; row.data = typeof data === "string" ? JSON.stringify(parsed) : parsed; }
  return row;
};
/* Backfill único: display_name = login; level/exp = maior char da conta. */
JsonStore.prototype._backfillAccountProgress = function () {
  let changed = false;
  for (const a of this.accounts || []) {
    if (!a.display_name) { a.display_name = a.login; changed = true; }
    if (a.level === undefined || a.exp === undefined) {
      const chars = (this.characters || []).filter((c) => Number(c.account_id) === Number(a.id));
      let lvl = 1, exp = 0;
      for (const c of chars) {
        const cl = Math.max(1, Math.floor(Number(c.level) || 1));
        if (cl >= lvl) {
          lvl = cl;
          let d = c.data; if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = {}; } }
          exp = Math.max(0, Math.floor(Number(d && d.exp) || 0));
        }
      }
      a.level = lvl; a.exp = exp; changed = true;
    }
  }
  if (changed) this._save();
};
JsonStore.prototype.updateCoins = function (id, coins) {
  const a = this.findAccountById(id);
  if (a) { a.coins = Math.max(0, coins); this._save(); return a; }
  return null;
};
/* NON-TRANSFERABLE TIBIA COINS (coins_nt): créditos promocionais que só
 * podem ser gastos na STORE — nunca passam pelo market nem pelo RMT
 * (esses caminhos só leem/gravam `coins`). Todo gasto de store debita
 * coins_nt primeiro e completa com coins via spendStoreCoins. */
JsonStore.prototype.updateCoinsNt = function (id, coinsNt) {
  const a = this.findAccountById(id);
  if (a) { a.coins_nt = Math.max(0, Math.floor(Number(coinsNt) || 0)); this._save(); return a; }
  return null;
};
JsonStore.prototype.creditCoinsNt = function (id, amount) {
  const a = this.findAccountById(id);
  if (!a) return null;
  a.coins_nt = Math.max(0, Math.floor(Number(a.coins_nt) || 0)) +
    Math.max(0, Math.floor(Number(amount) || 0));
  this._save();
  return a;
};
/* Débito NT-first atômico para compras de store: retorna { ntSpent,
 * tSpent, coins, coinsNt } ou null quando o total não cobre o custo. */
JsonStore.prototype.spendStoreCoins = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (!a) return null;
  const nt = Math.max(0, Number(a.coins_nt) || 0), c = Math.max(0, Number(a.coins) || 0);
  if (nt + c < cost) return null;
  const ntSpent = Math.min(nt, cost);
  a.coins_nt = nt - ntSpent;
  a.coins = c - (cost - ntSpent);
  this._save();
  return { ntSpent, tSpent: cost - ntSpent, coins: a.coins, coinsNt: a.coins_nt };
};
JsonStore.prototype.storeOrderInsert = function (row) {
  const order = Object.assign({ id: ++this._storeOrderSeq }, row || {});
  this.storeOrders = this.storeOrders || [];
  this.storeOrders.push(order);
  this._saveStore();
  return order;
};
JsonStore.prototype.storeOrderGet = function (id) {
  return (this.storeOrders || []).find((o) => String(o.id) === String(id)) || null;
};
JsonStore.prototype.storeOrderUpdate = function (id, patch) {
  const order = this.storeOrderGet(id);
  if (!order) return null;
  Object.assign(order, patch || {});
  this._saveStore();
  return order;
};
JsonStore.prototype.storeOrderList = function (limit) {
  const n = Math.max(1, Math.min(500, Number(limit) || 100));
  return (this.storeOrders || []).slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, n);
};
JsonStore.prototype.storeOrdersByAccount = function (accountId, limit) {
  const n = Math.max(1, Math.min(200, Number(limit) || 40));
  return (this.storeOrders || []).filter((o) => Number(o.accountId) === Number(accountId))
    .sort((a, b) => Number(b.id) - Number(a.id)).slice(0, n);
};
JsonStore.prototype.accountWardrobe = function (accountId, recipeId, alternative) {
  const W = require("./wardrobe"), account = this.findAccountById(accountId);
  if (!account) return { ok: false, msg: "Conta não encontrada." };
  const characters = this.charactersOf(accountId);
  const shared = this.accountSharedInventory(accountId);
  W.migrate(account, characters);
  let result = { ok: true };
  if (recipeId) {
    const active = (this.instances || []).some((i) => Number(i.account_id) === Number(accountId) && i.status === "active");
    if (active || characters.some((c) => ["hunt", "boss"].includes(c.zone)))
      return { ok: false, msg: "Saia do combate antes de realizar a troca." };
    result = W.exchange(account, characters, shared, recipeId, alternative);
    if (result.ok) this.setAccountSharedInventory(accountId, shared);
  }
  this._save();
  return Object.assign(result, { cosmetics: account.cosmetics, catalog: W.catalog(account, characters, shared), sharedInventory: shared });
};
/* Verificação social (OAuth Twitch) — JSON simples por conta. */
JsonStore.prototype.setAccountSocial = function (accountId, social) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.social = social && typeof social === "object" ? social : {};
  this._save();
  return a;
};
JsonStore.prototype.setAccountCosmetics = function (accountId, cosmetics) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  const prior = typeof a.cosmetics === "string" ? JSON.parse(a.cosmetics) : (a.cosmetics || {});
  a.cosmetics = Object.assign(require("./wardrobe").mergeCosmetics(prior, cosmetics),
    { preyCards: Math.max(0, Math.floor(Number(prior.preyCards) || 0)) });
  this._save();
  return a;
};
/* Hazard level (Gnomprona, por CONTA): grava cosmetics.hazard já
 * mergeado pelo endpoint (kills/level/sel) dentro do JSON de cosmetics. */
JsonStore.prototype.setAccountHazard = function (accountId, hazard) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  let cos = a.cosmetics;
  if (typeof cos === "string") { try { cos = JSON.parse(cos); } catch (e) { cos = null; } }
  cos = cos && typeof cos === "object" && !Array.isArray(cos) ? cos : {};
  cos.hazard = {
    kills: Math.max(0, Math.floor(Number(hazard && hazard.kills) || 0)),
    level: Math.max(0, Math.min(12, Math.floor(Number(hazard && hazard.level) || 0))),
    sel: Math.max(0, Math.min(12, Math.floor(Number(hazard && hazard.sel) || 0))),
  };
  a.cosmetics = cos;
  this._save();
  return a;
};
JsonStore.prototype.changePreyCards = function (accountId, delta, cost) {
  const a = this.findAccountById(accountId);
  if (!a || !Number.isSafeInteger(delta) || !Number.isSafeInteger(cost) || cost < 0) return false;
  let cos = a.cosmetics;
  if (typeof cos === "string") cos = JSON.parse(cos);
  cos = cos && typeof cos === "object" ? cos : {};
  const cards = Math.max(0, Math.floor(Number(cos.preyCards) || 0));
  /* Custo é compra de store → debita coins_nt primeiro, completa com coins. */
  const nt = Math.max(0, Number(a.coins_nt) || 0), c = Math.max(0, Number(a.coins) || 0);
  if (nt + c < cost || cards + delta < 0) return false;
  const ntSpent = Math.min(nt, cost);
  a.coins_nt = nt - ntSpent;
  a.coins = c - (cost - ntSpent);
  a.cosmetics = Object.assign({}, cos, { preyCards: cards + delta });
  this._save();
  return true;
};
JsonStore.prototype.debitCoins = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (!a || (Number(a.coins) || 0) < cost) return false;
  a.coins = Math.max(0, (Number(a.coins) || 0) - cost);
  this._save();
  return true;
};
/* 3º slot de prey por conta: débito de cards + grant atômicos (não
 * consome card se a checagem de posse falhar entre as duas escritas). */
JsonStore.prototype.buyPreySlot = function (accountId, cardCost) {
  const a = this.findAccountById(accountId);
  const cost = Math.max(0, Math.floor(Number(cardCost) || 0));
  if (!a) return false;
  let cos = a.cosmetics;
  if (typeof cos === "string") cos = JSON.parse(cos);
  cos = cos && typeof cos === "object" ? cos : {};
  const cards = Math.max(0, Math.floor(Number(cos.preyCards) || 0));
  if (cos.preySlot || cards < cost) return false;
  a.cosmetics = Object.assign({}, cos, { preyCards: cards - cost, preySlot: 1 });
  this._save();
  return true;
};
JsonStore.prototype.bumpAccountBless = function (accountId, delta) {
  const a = this.findAccountById(accountId);
  if (!a) return 0;
  let cos = a.cosmetics;
  if (typeof cos === "string") { try { cos = JSON.parse(cos); } catch (e) { cos = null; } }
  cos = cos && typeof cos === "object" && !Array.isArray(cos) ? cos : {};
  cos.bless = Math.max(0, (Math.floor(Number(cos.bless) || 0)) + Math.floor(Number(delta) || 0));
  a.cosmetics = cos;
  this._save();
  return cos.bless;
};
/* Store BLESS: sincroniza state.authority.wallets[].bless com
 * accounts.cosmetics.bless. Cada wallet acumula blessSpent quando o motor
 * consome uma carga no wipe; aqui o gasto é descontado da conta e o
 * saldo do wallet é re-semeado (cobre compras feitas durante a instância).
 * Recebe/devolve o state serializado (string) da instância. */
JsonStore.prototype._syncBlessWallets = function (stateJson) {
  let st;
  try { st = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson; }
  catch (e) { return stateJson; }
  const wallets = st && st.authority && st.authority.wallets;
  if (!wallets || typeof wallets !== "object") return stateJson;
  let dirty = false;
  for (const key of Object.keys(wallets)) {
    const w = wallets[key];
    const aid = Number(key);
    if (!w || !aid) continue;
    let cos = null;
    const a = this.findAccountById(aid);
    if (a) {
      cos = a.cosmetics;
      if (typeof cos === "string") { try { cos = JSON.parse(cos); } catch (e) { cos = null; } }
      cos = cos && typeof cos === "object" && !Array.isArray(cos) ? cos : {};
    }
    let have = cos ? Math.max(0, Math.floor(Number(cos.bless) || 0)) : 0;
    const spent = Math.max(0, Math.floor(Number(w.blessSpent) || 0));
    if (spent && a) {
      have = Math.max(0, have - spent);
      cos.bless = have;
      a.cosmetics = cos;
      this._save();
    }
    if (Number(w.bless) !== have || spent) { w.bless = have; w.blessSpent = 0; dirty = true; }
  }
  if (!dirty) return stateJson;
  return JSON.stringify(st);
};
JsonStore.prototype.voucherClaim = function (accountId, code) {
  const key = Number(accountId) + ":" + String(code || "").toUpperCase();
  this.vouchers = this.vouchers || [];
  if (this.vouchers.indexOf(key) !== -1) return false;
  this.vouchers.push(key);
  this._saveStore();
  return true;
};
/* Vouchers resgatados — o JsonStore guarda só "accountId:CODE" (sem data),
 * então o createdAt vem do ledger "voucher:CODE" quando existir. */
JsonStore.prototype.voucherRedemptionList = function (limit) {
  const n = Math.max(1, Math.min(500, Number(limit) || 200));
  const ledgerAt = {};
  for (const row of this.coinLedger || []) {
    const ref = String(row && row.ref || "");
    if (ref.indexOf("voucher:") === 0 && row.accountId != null)
      ledgerAt[Number(row.accountId) + ":" + ref.slice(8).toUpperCase()] =
        row.at || row.createdAt || null;
  }
  const loginOf = {};
  for (const acc of this.accounts || []) loginOf[Number(acc.id)] = acc.login || "";
  return (this.vouchers || []).map((key) => {
    const i = String(key).indexOf(":");
    const accountId = Number(String(key).slice(0, i)) || 0;
    const code = String(key).slice(i + 1);
    return { accountId, login: loginOf[accountId] || "", code,
      createdAt: ledgerAt[accountId + ":" + code] || null };
  }).slice(-n).reverse();
};
/* Estado administrável do voucher: paused bloqueia resgates novos,
 * deleted esconde/inutiliza o código. Independe da definição em store.js. */
JsonStore.prototype.voucherStateList = function () {
  return Object.assign({}, this.voucherState || {});
};
JsonStore.prototype.voucherStateGet = function (code) {
  return (this.voucherState || {})[String(code || "").toUpperCase()] || null;
};
JsonStore.prototype.voucherStateSet = function (code, patch, by) {
  code = String(code || "").toUpperCase().slice(0, 40);
  if (!code) return null;
  patch = patch || {};
  this.voucherState = this.voucherState || {};
  const cur = this.voucherState[code] || {};
  const next = {
    paused: patch.paused != null ? !!patch.paused : !!cur.paused,
    deleted: patch.deleted != null ? !!patch.deleted : !!cur.deleted,
    updatedAt: Date.now(), updatedBy: String(by || ""),
  };
  this.voucherState[code] = next;
  this._saveStore();
  return next;
};
JsonStore.prototype.voucherClaimCounts = function () {
  const counts = {};
  for (const key of this.vouchers || []) {
    const i = String(key).indexOf(":");
    const c = String(key).slice(i + 1).toUpperCase();
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
};
JsonStore.prototype.voucherClaims = function (code) {
  const c = String(code || "").toUpperCase();
  return this.voucherRedemptionList(500).filter((r) => String(r.code || "").toUpperCase() === c);
};
JsonStore.prototype.coinLedgerAdd = function (row) {
  const entry = Object.assign({ id: ++this._coinLedgerSeq }, row || {});
  this.coinLedger = this.coinLedger || [];
  this.coinLedger.push(entry);
  if (this.coinLedger.length > 5000) this.coinLedger = this.coinLedger.slice(-4000);
  this._saveStore();
  return entry;
};
JsonStore.prototype.coinLedgerList = function (opts) {
  opts = opts || {};
  let list = this.coinLedger || [];
  if (opts.accountId != null) list = list.filter((r) => Number(r.accountId) === Number(opts.accountId));
  const n = Math.max(1, Math.min(500, Number(opts.limit) || 100));
  return list.slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, n);
};
JsonStore.prototype.listAccountCoinSummaries = function () {
  return (this.accounts || []).map((a) => ({
    id: a.id, login: a.login, coins: Number(a.coins) || 0,
    coinsNt: Number(a.coins_nt) || 0,
    vipUntil: Number(a.vip_until) || 0, role: a.role || "user",
  })).sort((a, b) => b.coins - a.coins);
};
JsonStore.prototype.accountGold = function (accountId) {
  const a = this.findAccountById(accountId);
  return a ? Math.max(0, Math.floor(Number(a.gold) || 0)) : 0;
};

/* ---- inventário compartilhado da conta (bag/pouch/depot/reward chest) ---- */
const SharedInv = (() => {
  try { return require("./shared_inventory"); } catch (e) { return null; }
})();
function sharedInvMergeChars(store, accountId) {
  if (!SharedInv) return SharedInv.emptySharedInventory();
  let chars = [];
  try { chars = store.charactersOf(accountId); } catch (e) { chars = []; }
  const s = SharedInv.mergeCharContainers(SharedInv.emptySharedInventory(), chars);
  s.legacyPouchDone = 1;
  s.stashSharedDone = 1;
  return s;
}
/* Consolida lootPouches legadas de personagens ANTIGOS na pouch ÚNICA da
 * conta (a pouch é compartilhada entre todos os personagens). Saves antigos
 * (pré-inventário compartilhado, ou contas cujo shared foi criado antes da
 * pouch entrar no shared) podem ter itens presos no data de cada personagem.
 * Regra idempotente: se o data do char é ESPELHO do shared (igual), pula —
 * não duplica. Senão soma o excesso do char no shared. Após a primeira
 * consolidação os saves passam a espelhar o shared e o merge não roda mais
 * (flag legacyPouchDone no próprio shared). Retorna true se mudou algo. */
function mergeLegacyCharPouches(shared, chars) {
  if (!SharedInv || !shared || typeof shared !== "object") return false;
  shared.lootPouch = shared.lootPouch && typeof shared.lootPouch === "object" && !Array.isArray(shared.lootPouch)
    ? shared.lootPouch : {};
  const pouchEq = (a, b) => {
    const ka = Object.keys(a || {}).filter((k) => (Number(a[k]) || 0) > 0).sort();
    const kb = Object.keys(b || {}).filter((k) => (Number(b[k]) || 0) > 0).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Number(a[k]) === Number(b[k]));
  };
  let changed = false;
  for (const c of Array.isArray(chars) ? chars : []) {
    let d = null;
    try { d = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { d = null; }
    if (!d || typeof d !== "object" || Array.isArray(d)) continue;
    const pouch = d.lootPouch;
    if (!pouch || typeof pouch !== "object" || Array.isArray(pouch)) continue;
    if (pouchEq(pouch, shared.lootPouch)) continue; // espelho — nada a fazer
    for (const slug of Object.keys(pouch)) {
      const n = Math.max(0, Math.floor(Number(pouch[slug]) || 0));
      if (!n) continue;
      shared.lootPouch[slug] = (Number(shared.lootPouch[slug]) || 0) + n;
      changed = true;
    }
  }
  return changed;
}
/* Consolida as Supply Stashes legadas por personagem na stash ÚNICA da conta
 * (mesma regra do merge de pouches: espelho pula, resto soma — flag
 * stashSharedDone no shared torna idempotente). */
function mergeLegacyCharStashes(shared, chars) {
  if (!SharedInv || !shared || typeof shared !== "object") return false;
  shared.supplyStash = shared.supplyStash && typeof shared.supplyStash === "object" && !Array.isArray(shared.supplyStash)
    ? shared.supplyStash : {};
  const stashEq = (a, b) => {
    const ka = Object.keys(a || {}).filter((k) => (Number(a[k]) || 0) > 0).sort();
    const kb = Object.keys(b || {}).filter((k) => (Number(b[k]) || 0) > 0).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Number(a[k]) === Number(b[k]));
  };
  let changed = false;
  for (const c of Array.isArray(chars) ? chars : []) {
    let d = null;
    try { d = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { d = null; }
    if (!d || typeof d !== "object" || Array.isArray(d)) continue;
    const stash = d.supplyStash;
    if (!stash || typeof stash !== "object" || Array.isArray(stash)) continue;
    if (stashEq(stash, shared.supplyStash)) continue; // espelho — nada a fazer
    for (const slug of Object.keys(stash)) {
      const n = Math.max(0, Math.floor(Number(stash[slug]) || 0));
      if (!n) continue;
      shared.supplyStash[slug] = (Number(shared.supplyStash[slug]) || 0) + n;
      changed = true;
    }
  }
  return changed;
}
/* Une drops reais de boss no shared. Só conta numérica + pacotes com itens —
 * ignora lixo stale (ex.: { fake:"stale" }) de projections de cidade.
 * O p da instância já nasce ESPELHADO no chest da conta e cada projeção da
 * mesma party carrega o mesmo espelho — somar (+=) duplicaria o baú inteiro
 * a cada luta e multiplicaria por membro. O merge por max é idempotente:
 * cobre o delta da luta tanto se a cópia veio espelhada (chest velho+novo)
 * quanto se veio limpa (só o delta, ex.: cópia temporária de world boss). */
function mergeTerminalRewardChest(shared, fromPlayer) {
  if (!shared || !fromPlayer) return;
  shared.rewardChest = shared.rewardChest && typeof shared.rewardChest === "object" && !Array.isArray(shared.rewardChest)
    ? shared.rewardChest : {};
  shared.rewardChestBundles = Array.isArray(shared.rewardChestBundles) ? shared.rewardChestBundles : [];
  const chest = fromPlayer.rewardChest;
  if (chest && typeof chest === "object" && !Array.isArray(chest)) {
    for (const slug of Object.keys(chest)) {
      const n = Math.max(0, Math.floor(Number(chest[slug]) || 0));
      if (!n) continue;
      shared.rewardChest[slug] = Math.max(Number(shared.rewardChest[slug]) || 0, n);
    }
  }
  for (const bundle of Array.isArray(fromPlayer.rewardChestBundles) ? fromPlayer.rewardChestBundles : []) {
    if (!bundle || typeof bundle !== "object") continue;
    const items = bundle.items && typeof bundle.items === "object" && !Array.isArray(bundle.items) ? bundle.items : {};
    const live = {};
    for (const slug of Object.keys(items)) {
      const n = Math.max(0, Math.floor(Number(items[slug]) || 0));
      if (n) live[slug] = n;
    }
    const id = String(bundle.id || bundle.bundleId || "");
    // Bundle vazio também entra: é o marcador "boss derrotado sem drops" que
    // a autoridade cria de propósito — o jogador precisa vê-lo no baú.
    if (!id) continue;
    const existing = shared.rewardChestBundles.find((b) => b && String(b.id) === id);
    if (existing) {
      existing.items = existing.items && typeof existing.items === "object" ? existing.items : {};
      for (const slug of Object.keys(live))
        existing.items[slug] = Math.max(Number(existing.items[slug]) || 0, live[slug]);
    } else {
      shared.rewardChestBundles.push(Object.assign({}, bundle, { items: Object.assign({}, live) }));
    }
  }
}
/* Extrai os containers do data de um personagem para o shared da conta e
 * devolve o data com o mirror aplicado (o data salvo sempre espelha o shared).
 * rewardChest é sempre server-owned (muda só via /api/reward/claim), então é
 * preservado do shared. lootPouch é autoritativo no tick terminal da instância
 * (loot do combate) e preservado nos saves de cidade (muda via APIs de pouch). */
/* Flush de pouch "suja" fora do terminal: mutações internas da instância
 * (autoseller) marcam p._pouchDirty no state. O tick detecta, aplica o
 * delta no shared e remove a marca + rebasa _pouchBase no state — roda
 * uma única vez por mutação (a extração terminal vê só o delta posterior). */
function pouchDirtyScan(next) {
  const pouchIds = new Set(), forgeIds = new Set();
  for (const projection of (next && next.characters) || []) {
    let d = projection && projection.data;
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = null; } }
    if (!d) continue;
    if (d._pouchDirty) pouchIds.add(Number(projection.id));
    if (d._forgeDirty) forgeIds.add(Number(projection.id));
  }
  if (pouchIds.size || forgeIds.size) {
    let st = null;
    try { st = typeof next.state === "string" ? JSON.parse(next.state) : next.state; } catch (e) { st = null; }
    const players = st && st.authority && st.authority.players;
    if (Array.isArray(players)) {
      let changed = false;
      for (const entry of players) {
        if (!entry || !entry.p) continue;
        if (entry.p._pouchDirty) {
          delete entry.p._pouchDirty;
          entry.p._pouchBase = Object.assign({}, entry.p.lootPouch || {});
          changed = true;
        }
        if (entry.p._forgeDirty) {
          delete entry.p._forgeDirty;
          entry.p._forgeBase = {
            dust: Math.max(0, Math.floor(Number(entry.p.dust) || 0)),
            dustLimit: Math.max(100, Math.min(325, Math.floor(Number(entry.p.dustLimit) || 100))),
            slivers: Math.max(0, Math.floor(Number(entry.p.slivers) || 0)),
            exaltedCores: Math.max(0, Math.floor(Number(entry.p.exaltedCores) || 0)),
          };
          changed = true;
        }
      }
      if (changed) next.state = typeof next.state === "string" ? JSON.stringify(st) : st;
    }
  }
  return { pouch: pouchIds, forge: forgeIds };
}
/* Aplica só o delta da pouch (fora do terminal — sem tocar nos demais
 * containers, que continuam pertencendo à instância até o fim). */
function sharedInvPouchDirtyFlush(shared, data) {
  let p = typeof data === "string" ? (() => { try { return JSON.parse(data); } catch (e) { return null; } })() : data;
  if (!p || typeof p !== "object" || Array.isArray(p)) return;
  const merged = SharedInv.pouchDelta(shared.lootPouch, p);
  shared.lootPouch = merged || Object.assign({}, p.lootPouch || {});
}
/* Flush dos recursos da forja "sujos" fora do terminal: o kill de mob
 * influenced/fiendish marca p._forgeDirty na cópia da instância. O tick
 * aplica o DELTA (espelho − _forgeBase) no shared da conta e o scan rebasa
 * _forgeBase no state — o dust entra na conta em tempo real e o merge
 * terminal vê só o delta posterior (sem contar duas vezes). */
function sharedInvForgeDirtyFlush(shared, data) {
  let p = typeof data === "string" ? (() => { try { return JSON.parse(data); } catch (e) { return null; } })() : data;
  if (!p || typeof p !== "object" || Array.isArray(p)) return;
  SharedInv.forgeResourcesDelta(shared, p, true);
}
function sharedInvExtractMirror(shared, data, terminal, mergePouch) {
  if (!SharedInv) return data;
  const p = typeof data === "string"
    ? (() => { try { return JSON.parse(data); } catch (e) { return null; } })()
    : data;
  if (!p || typeof p !== "object" || Array.isArray(p)) return data;
  const keep = {
    lootPouch: Object.assign({}, shared.lootPouch),
    rewardChest: Object.assign({}, shared.rewardChest),
    rewardChestBundles: Array.isArray(shared.rewardChestBundles) ? shared.rewardChestBundles.slice() : [],
  };
  const fromPlayer = {
    rewardChest: (p.rewardChest && typeof p.rewardChest === "object" && !Array.isArray(p.rewardChest))
      ? Object.assign({}, p.rewardChest) : {},
    rewardChestBundles: Array.isArray(p.rewardChestBundles)
      ? p.rewardChestBundles.map((b) => Object.assign({}, b, {
          items: b && b.items && typeof b.items === "object" ? Object.assign({}, b.items) : {},
        })) : [],
  };
  if (terminal) {
    // Terminal de instância com múltiplos personagens da conta: cada cópia
    // pode ter divergido da outra durante a luta (desequipar/equipar em
    // personagens diferentes). O extractSharedFromPlayer SOBRESCREVIA o
    // shared com a bag do ÚLTIMO personagem processado — itens adicionados
    // em outras cópias (ex.: item desequipado) SUMIAM ao final da boss
    // fight. O merge preserva o maior valor por slug e une instâncias por
    // id; o loot do combate (lootPouch da cópia) é somado ao que já havia.
    /* Loot Pouch: merge por delta só na PRIMEIRA projeção da conta —
     * as cópias compartilham referência; repetir dobraria o delta. */
    SharedInv.mergeSharedFromPlayer(p, shared, { pouchDelta: mergePouch !== false });
  } else {
    SharedInv.extractSharedFromPlayer(p, shared);
    shared.lootPouch = keep.lootPouch;
  }
  shared.rewardChest = keep.rewardChest;
  shared.rewardChestBundles = keep.rewardChestBundles;
  if (terminal) mergeTerminalRewardChest(shared, fromPlayer);
  SharedInv.applySharedToPlayer(p, shared);
  return typeof data === "string" ? JSON.stringify(p) : p;
}
JsonStore.prototype.accountSharedInventory = function (accountId) {
  const a = this.findAccountById(accountId);
  if (!a) return SharedInv ? SharedInv.emptySharedInventory() : {};
  let s = a.shared_inventory;
  if (typeof s === "string") { try { s = JSON.parse(s); } catch (e) { s = null; } }
  if (!SharedInv || !SharedInv.isSharedInventory(s)) {
    s = sharedInvMergeChars(this, accountId);
    a.shared_inventory = s;
    this._save();
  } else if (!s.legacyPouchDone) {
    // Conta antiga: une pouches legadas dos personagens na pouch única da
    // conta (idempotente — espelhos não são somados). Persiste o flag para
    // não refazer a varredura a cada request.
    let chars = [];
    try { chars = this.charactersOf(accountId); } catch (e) { chars = []; }
    mergeLegacyCharPouches(s, chars);
    s.legacyPouchDone = 1;
    a.shared_inventory = s;
    this._save();
  }
  if (!s.forgeResourcesDone) {
    let chars = [];
    try { chars = this.charactersOf(accountId); } catch (e) { chars = []; }
    SharedInv.mergeCharForgeResources(s, chars);
    a.shared_inventory = s;
    this._save();
  }
  if (!s.stashSharedDone) {
    // Supply Stash entrou no shared depois: une as stashes por personagem.
    let chars = [];
    try { chars = this.charactersOf(accountId); } catch (e) { chars = []; }
    mergeLegacyCharStashes(s, chars);
    s.stashSharedDone = 1;
    a.shared_inventory = s;
    this._save();
  }
  if (!s.staminaSharedDone) {
    // Stamina era por personagem: o pool da conta nasce do MAIOR espelho
    // entre os personagens (não soma — não multiplica regen por char).
    let chars = [];
    try { chars = this.charactersOf(accountId); } catch (e) { chars = []; }
    if (SharedInv) SharedInv.seedSharedStamina(s, chars);
    s.staminaSharedDone = 1;
    a.shared_inventory = s;
    this._save();
  }
  if (!s.charmsSharedDone) {
    // Charms eram por personagem: pool da conta = união dos unlocks +
    // soma dos charm points não gastos de todos os personagens.
    let chars = [];
    try { chars = this.charactersOf(accountId); } catch (e) { chars = []; }
    if (SharedInv && SharedInv.seedSharedCharms) SharedInv.seedSharedCharms(s, chars);
    s.charmsSharedDone = 1;
    a.shared_inventory = s;
    this._save();
  }
  return SharedInv.normalizeSharedInventory(s);
};
JsonStore.prototype.setAccountSharedInventory = function (accountId, s) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.shared_inventory = SharedInv ? SharedInv.normalizeSharedInventory(s) : s;
  this._save();
  return a;
};
/* read-modify-write atômico do shared (paridade com o MySQL: lá é um
 * SELECT FOR UPDATE + UPDATE na mesma tx). No JsonStore tudo é síncrono —
 * o mutator roda direto no objeto vivo e persiste uma vez. Retorna o
 * shared resultante (ou null se o mutator abortar com false). */
JsonStore.prototype.accountSharedInventoryMutate = function (accountId, mutator) {
  const s = this.accountSharedInventory(accountId);
  if (!s) return null;
  /* Mesmo contrato do MySQL: muta uma CÓPIA — retornar false aborta sem
   * efeito (sem clone, o mutator alteraria a referência viva da conta). */
  const work = JSON.parse(JSON.stringify(s));
  const out = mutator(work);
  if (out === false) return null;
  this.setAccountSharedInventory(accountId, work);
  return work;
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
JsonStore.prototype.setAccountEmail = function (accountId, email) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.email = String(email || "").slice(0, 120);
  this._save();
  return a;
};
JsonStore.prototype.setAccountEmailCode = function (accountId, code, expiresAt) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.email_code = String(code || "");
  a.email_code_expires = Math.max(0, Math.floor(Number(expiresAt) || 0));
  this._save();
  return a;
};
JsonStore.prototype.setAccountEmailVerified = function (accountId, verified) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.email_verified = verified ? 1 : 0;
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
/* Estado do tutorial de onboarding (por conta): vocações escolhidas,
 * personagens do tutorial (charIds), party/hunt/helper concluídos e se a
 * recompensa final já foi entregue. Mesmo padrão do missions/missionsDone
 * — o cliente envia o estado completo. */
JsonStore.prototype.setAccountTutorial = function (accountId, tutorial) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.tutorial = tutorial && typeof tutorial === "object" && !Array.isArray(tutorial) ? tutorial : {};
  this._save();
  return a;
};
/* Friendlist SOCIAL por conta: [{charId, name, muted}] — mesmo padrão de
 * missions/tutorial, o servidor é autoridade (endpoints /api/social/*). */
JsonStore.prototype.setAccountFriends = function (accountId, friends) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  a.friends = Array.isArray(friends) ? friends : [];
  this._save();
  return a;
};
/* Presença por conta para a friendlist: {accId:{online,inInstance}}.
 * online = lease válida (navegador aberto) OU personagem da conta em
 * instância ativa (caçada continua sem navegador). */
JsonStore.prototype.socialPresence = function (accountIds) {
  const ids = new Set((accountIds || []).map(Number).filter((n) => n > 0));
  const out = {};
  for (const id of ids) out[id] = { online: false, inInstance: false };
  if (!ids.size) return out;
  const now = Date.now();
  for (const l of this.leases || []) {
    const accId = Number(l.account_id);
    if (!ids.has(accId)) continue;
    const exp = Date.parse(l.expires_at || "") || 0;
    if (exp > now) out[accId].online = true;
  }
  const owner = new Map();
  for (const c of this.characters || []) {
    if (ids.has(Number(c.account_id))) owner.set(Number(c.id), Number(c.account_id));
  }
  for (const row of this.instances || []) {
    if (row.status !== "active") continue;
    let st = null;
    try { st = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { st = null; }
    const members = (st && st.members) || [];
    for (const m of members) {
      const accId = owner.get(Number(m && m.id));
      if (accId) { out[accId].inInstance = true; out[accId].online = true; }
    }
  }
  return out;
};
/* Soma gold dos personagens para a conta uma vez; espelha o saldo nos chars.
 * Quando já migrado, verifica se todos os personagens espelham o gold da
 * conta corretamente — corrige divergências de saves antigos ou contas
 * excluídas que deixaram data.gold desatualizado. */
JsonStore.prototype.migrateAccountGold = function (accountId) {
  const a = this.findAccountById(accountId);
  if (!a) return null;
  if (a.gold_migrated) {
    a.gold = Math.max(0, Math.floor(Number(a.gold) || 0));
    // Garante que todos os personagens espelham o gold correto da conta.
    const chars = this.charactersOf(accountId);
    let dirty = false;
    for (const c of chars) {
      let data = {};
      try { data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { data = {}; }
      if (Math.floor(Number(data.gold) || 0) !== a.gold) {
        data.gold = a.gold;
        c.data = JSON.stringify(data);
        dirty = true;
      }
    }
    if (dirty) this._save();
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
    // Usa o MÁXIMO entre todos os personagens da mesma conta e o saldo
    // atual da conta. Evita que um personagem com data.gold antigo
    // (pré-migração ou snapshot desatualizado) zere o saldo real.
    if (!prev) {
      const a = this.findAccountById(aid);
      const currentGold = a ? Math.max(0, Math.floor(Number(a.gold) || 0)) : 0;
      byAccount.set(aid, { gold: Math.max(gold, currentGold), accountId: aid });
    } else {
      prev.gold = Math.max(prev.gold, gold);
    }
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
  const acc = this.findAccountById(accountId);
  return this.characters.filter((c) => c.account_id === Number(accountId))
    .map((c) => this._applyAccountLevel(c, acc));
};
JsonStore.prototype.findCharacterByName = function (name) {
  return this.characters.find((c) => c.name.toLowerCase() === String(name).toLowerCase()) || null;
};
JsonStore.prototype.findCharacter = function (id) {
  const c = this.characters.find((c) => c.id === Number(id)) || null;
  return c ? this._applyAccountLevel(c, this.findAccountById(c.account_id)) : null;
};

/* ------------------------------------------------------- admin (bans) --- */
/* Busca cross-account: o painel admin escolhe QUALQUER personagem pelo nome
 * para inspeção/edição. */
JsonStore.prototype.adminSearchCharacters = function (query, limit) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const byAcc = new Map(this.accounts.map((a) => [Number(a.id), a]));
  return this.characters
    .filter((c) => String(c.name).toLowerCase().indexOf(q) !== -1)
    .sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 25)))
    .map((c) => ({ id: c.id, name: c.name, voc: c.voc, level: c.level,
      account_id: Number(c.account_id),
      login: (byAcc.get(Number(c.account_id)) || {}).login || "" }));
};

JsonStore.prototype.banList = function () {
  return (this.bans || []).slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 200);
};
/* Ban ativo = não levantado e (sem prazo = permanente OU until futuro). */
JsonStore.prototype.banActiveForAccount = function (accountId, now) {
  now = now || Date.now();
  return (this.bans || []).find((b) => Number(b.account_id) === Number(accountId)
    && !b.lifted_at && (!b.until || new Date(b.until).getTime() > now)) || null;
};
JsonStore.prototype.banCreate = function (entry) {
  this.bans = this.bans || [];
  const ban = { id: this._nextId(this.bans),
    account_id: Number(entry.accountId),
    character_id: entry.characterId ? Number(entry.characterId) : null,
    char_name: String(entry.charName || "").slice(0, 40),
    reason: String(entry.reason || "").slice(0, 300),
    until: entry.until || null,             // null = tempo indeterminado
    banned_by: String(entry.by || "admin").slice(0, 80),
    created_at: new Date().toISOString(), lifted_at: null, lifted_by: null };
  this.bans.push(ban);
  this._saveBans();
  return ban;
};
JsonStore.prototype.banLift = function (banId, by) {
  const ban = (this.bans || []).find((b) => Number(b.id) === Number(banId) && !b.lifted_at);
  if (!ban) return null;
  ban.lifted_at = new Date().toISOString();
  ban.lifted_by = String(by || "admin");
  this._saveBans();
  return ban;
};
JsonStore.prototype.revokeAccountSessions = function (accountId) {
  const before = (this.sessions || []).length;
  this.sessions = (this.sessions || []).filter((s) => Number(s.account_id) !== Number(accountId));
  if (this.sessions.length !== before) this._saveSessions();
  return before - this.sessions.length;
};

/* Lista as instâncias ativas (hunts, bosses, world bosses) com os membros —
 * alimenta a aba RAID do painel admin. */
JsonStore.prototype.instanceListActive = function () {
  const chars = new Map(this.characters.map((c) => [Number(c.id), c]));
  const accs = new Map(this.accounts.map((a) => [Number(a.id), a]));
  return (this.instances || []).filter((row) => row.status === "active").map((row) => {
    let state = null;
    try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
    const members = (((state || {}).members) || []).map((m) => {
      const ch = chars.get(Number(m && m.id));
      return { id: Number(m && m.id) || null,
        name: (m && m.p && m.p.name) || (ch && ch.name) || "#" + m.id,
        level: Number((m && m.p && m.p.level) || (ch && ch.level)) || 0,
        hp: Number(m && m.hp) || 0 };
    });
    return { instance_id: row.instance_id, account_id: Number(row.account_id),
      kind: row.kind, hunt_id: row.hunt_id || null, boss_id: row.boss_id || null,
      party_id: row.party_id ? Number(row.party_id) : null,
      started_at: row.started_at, saved_at: row.saved_at,
      version: Number(row.version) || 0,
      login: (accs.get(Number(row.account_id)) || {}).login || "",
      members };
  });
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
JsonStore.prototype.trainingCheckpoint = function (accountId, ids, sessionId, now, lease, advance, stop) {
  if (!lease || !this.leaseValidate(accountId, lease.holderId, lease.secretHash, lease.now))
    return { ok: false, error: "LEASE_REQUIRED" };
  const instance = this.instanceGet(accountId);
  if (instance && instance.status === "active") return { ok: false, error: "TRAINING_IN_COMBAT" };
  const rows = ids.map((id) => this.findCharacter(id));
  if (rows.some((row) => !row || Number(row.account_id) !== Number(accountId)))
    return { ok: false, error: "CHARACTER_NOT_FOUND" };
  if (rows.some((row) => ["hunt", "boss"].includes(row.zone))) return { ok: false, error: "TRAINING_IN_COMBAT" };
  const account = this.findAccountById(accountId);
  /* Stamina da CONTA: o pool (shared.stamina) entra em cada p ANTES do
   * advance — o regen interno (1s/s treinando, 0,5 ocioso) materializa a
   * janela no pool e a extração devolve com guarda de carimbo. Como cada p
   * recebe o pool já materializado pelo anterior, a janela não dobra. */
  const shared = SharedInv ? this.accountSharedInventory(accountId) : null;
  if (shared && !shared.stamina) {
    const seedRow = rows.map((r) => SharedInv.charDataOf(r))
      .find((d) => d && Number.isFinite(Number(d.stamina)));
    if (seedRow) SharedInv.regenSharedStamina(shared, Number(seedRow.staminaAt) || now, 0, seedRow.stamina);
  }
  const staged = rows.map((row) => {
    const p = typeof row.data === "string" ? JSON.parse(row.data) : JSON.parse(JSON.stringify(row.data || {}));
    p.voc = row.voc;
    if (shared && shared.stamina) SharedInv.applySharedStamina(p, shared);
    const result = advance(p, now, sessionId, Number(account.vip_until) > now, lease.holderId, stop);
    if (shared) SharedInv.extractSharedStamina(p, shared);
    return { row, p, result };
  });
  if (shared) this.setAccountSharedInventory(accountId, shared);
  for (const item of staged) {
    item.row.data = JSON.stringify(item.p);
    item.row.save_version = Number(item.row.save_version || 0) + 1;
    item.row.updated_at = new Date(now).toISOString();
  }
  this._save();
  return { ok: true, characters: rows, advances: staged.flatMap((item) => item.result.advances.map((a) => Object.assign({ id: item.row.id }, a))) };
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
    // Level/exp da CONTA: o char salvo carrega o progresso compartilhado.
    const acc=this.findAccountById(accountId);
    if(acc){
      const lvl=Math.max(1,Math.floor(Number(save.level)||1));
      let exp=0;try{const d=JSON.parse(save.data);exp=Math.max(0,Math.floor(Number(d.exp)||0));}catch(e){}
      if(lvl>=(Number(acc.level)||1)){acc.level=lvl;acc.exp=exp;}
    }
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
  if (c) {
    c.zone = zone;
    // Templo/treino: personagem recupera todo o HP e mana ao entrar.
    if (zone === "city" || zone === "training") {
      const maxHp = Number(c.max_hp) || Number(c.hp) || 0;
      const maxMp = Number(c.max_mp) || Number(c.mp) || 0;
      if (maxHp > 0) c.hp = maxHp;
      if (maxMp > 0) c.mp = maxMp;
      try {
        let data = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {});
        if (data && typeof data === "object") {
          const dMax = Number(data.maxHp) || Number(data.max_hp) || maxHp;
          const mMax = Number(data.maxMp) || Number(data.max_mp) || maxMp;
          if (dMax > 0) data.hp = dMax;
          if (mMax > 0) data.mp = mMax;
          c.data = data;
        }
      } catch (e) { /* data opcional */ }
    }
    this._save();
    return c;
  }
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
  return a ? (a.gold || 0) : 0;
};
JsonStore.prototype.addAccountMarketGold = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (a) { a.gold = (a.gold || 0) + Math.max(0, amount); this._save(); }
};
JsonStore.prototype.payMarketFee = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (!a || (a.gold || 0) < amount) return false;
  a.gold = (a.gold || 0) - amount;
  this._save();
  return true;
};
JsonStore.prototype.refundMarketFee = function (accountId, amount) {
  const a = this.findAccountById(accountId);
  if (!a) return;
  a.gold = (a.gold || 0) + amount;
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
  account.gold=Math.max(0,Math.floor(Number(account.gold)||0));
  // O market nao usa mais banco separado: o saldo e o account.gold compartilhado.
  // Deposit/withdraw sao no-ops, apenas sinaliza ok para compatibilidade com UI antiga.
  let data={};try{data=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
  data.gold=account.gold;
  character.data=JSON.stringify(data);character.save_version=Number(character.save_version)+1;character.updated_at=new Date(lease.now).toISOString();
  for(const sibling of this.charactersOf(accountId)){
    if(Number(sibling.id)===Number(character.id))continue;
    let sd={};try{sd=typeof sibling.data==="string"?JSON.parse(sibling.data):(sibling.data||{});}catch(e){sd={};}
    sd.gold=account.gold;sibling.data=JSON.stringify(sd);
  }
  this._save();return {ok:true,character,bank:account.gold,gold:account.gold};
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
  /* Ranking por CONTA: 1 linha por jogador (display_name); métrica = melhor
   * char (level = accounts.level); `chars` detalha o roster no clique. */
  const byAcc = new Map();
  for (const c of chars) {
    const accId = Number(c.account_id);
    const acc = this.findAccountById(accId);
    if (!acc) continue;
    let entry = byAcc.get(accId);
    if (!entry) {
      entry = { id: accId, accountId: accId,
        name: String(acc.display_name || acc.login || "?"),
        level: Math.max(1, Math.floor(Number(acc.level) || 1)), value: 0, chars: [] };
      byAcc.set(accId, entry);
    }
    entry.chars.push({ id: c.id, name: c.name, voc: c.voc, level: Math.floor(Number(c.level) || 1) });
    const v = by === "level" ? entry.level : this._rankingMetric(c, by);
    if (v > entry.value) entry.value = v;
    if (by === "level") entry.value = entry.level;
  }
  let rows = Array.from(byAcc.values());
  rows.sort((a, b) => (b.value - a.value) || (b.level - a.level) || String(a.name).localeCompare(String(b.name)));
  rows = rows.slice(0, limit);
  if (by === "kills") rows.forEach((r) => { r.totalKills = r.value; });
  return rows;
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
  /* Contas com char dentro de alguma instância ativa — VIVO ou morto.
   * Serve para não contar "morto esperando revive" como idle na cidade. */
  const accountsInInstances = new Set();
  for (const row of activeInstances) {
    let state = null;
    try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
    const authPlayers = (state && state.authority && state.authority.players) || [];
    /* Mortos (ressurreição) NÃO contam como online: hp<=0, downUntil no
     * futuro (aguardando revive) ou permadead (boss). */
    const fromAuth = authPlayers
      .filter((item) => {
        if (!item || !item.p) return false;
        if (item.permadead) return false;
        if (Number(item.p.hp) <= 0) return false;
        if (Number(item.downUntil) > now) return false;
        return true;
      })
      .map((p) => Number(p && p.id));
    const fromMembers = ((state && state.members) || []).map((m) => Number(m && m.id));
    /* Sem authority.players → fallback nos members (sem info de HP).
     * Com authority mas todos mortos → ninguém conta, mas a presença
     * na instância segue registrada. */
    const ids = authPlayers.length ? fromAuth : fromMembers;
    const presence = authPlayers.length
      ? authPlayers.map((p) => Number(p && p.id)) : fromMembers.slice();
    if (!presence.length && row.active_character_id)
      presence.push(Number(row.active_character_id));
    for (const id of presence) {
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const c = this.findCharacter(id);
      if (c) accountsInInstances.add(Number(c.account_id));
    }
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const c = this.findCharacter(id);
      if (c && leasedAccounts.has(Number(c.account_id))) charIds.add(id);
    }
  }
  // Personagens na área de treino também contam como online — um a um.
  // O trainingClock.at renova a cada checkpoint (~1s) e a conta precisa
  // de lease ativa, mesma regra dos personagens em instância.
  const trainingCutoff = now - 15000;
  for (const c of this.characters || []) {
    const id = Number(c && c.id);
    if (!Number.isSafeInteger(id) || id <= 0 || charIds.has(id)) continue;
    if (!leasedAccounts.has(Number(c.account_id))) continue;
    let d = null;
    try { d = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { d = null; }
    const clockAt = d && d.trainingClock && Number(d.trainingClock.at);
    if (clockAt && clockAt > trainingCutoff) charIds.add(id);
  }
  const accountsWithChars = new Set();
  for (const id of charIds) {
    const c = this.findCharacter(id);
    if (c) accountsWithChars.add(Number(c.account_id));
  }
  let cityOnline = 0;
  for (const accId of leasedAccounts) {
    /* Com char em instância (vivo ou morto) não é "idle na cidade". */
    if (!accountsWithChars.has(accId) && !accountsInInstances.has(accId)) cityOnline++;
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

/* Lista detalhada para o painel admin — mesma regra do onlineCount, mas
 * devolve um item por personagem/conta online com status e local. */
JsonStore.prototype.onlineList = function () {
  const now = Date.now();
  const leases = (this.leases || []).filter((l) => l && l.expires_at &&
    new Date(l.expires_at).getTime() > now);
  const leasedAccounts = new Set(leases.map((l) => Number(l.account_id)));
  const activeInstances = (this.instances || []).filter((r) => r && r.status === "active");
  const tagged = new Map(); // charId -> {status, where}
  const accountsInInstances = new Set();
  for (const row of activeInstances) {
    let state = null;
    try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
    const authPlayers = (state && state.authority && state.authority.players) || [];
    const alive = authPlayers
      .filter((item) => {
        if (!item || !item.p) return false;
        if (item.permadead) return false;
        if (Number(item.p.hp) <= 0) return false;
        if (Number(item.downUntil) > now) return false;
        return true;
      })
      .map((p) => Number(p && p.id));
    const fromMembers = ((state && state.members) || []).map((m) => Number(m && m.id));
    const ids = authPlayers.length ? alive : fromMembers;
    const presence = authPlayers.length ? authPlayers.map((p) => Number(p && p.id)) : fromMembers.slice();
    if (!presence.length && row.active_character_id)
      presence.push(Number(row.active_character_id));
    const where = row.boss_id ? "boss:" + row.boss_id : (row.hunt_id || row.kind || "");
    for (const id of presence) {
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const c = this.findCharacter(id);
      if (c) accountsInInstances.add(Number(c.account_id));
    }
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const c = this.findCharacter(id);
      if (c && leasedAccounts.has(Number(c.account_id))) tagged.set(id, { status: "hunt", where });
    }
  }
  const trainingCutoff = now - 15000;
  for (const c of this.characters || []) {
    const id = Number(c && c.id);
    if (!Number.isSafeInteger(id) || id <= 0 || tagged.has(id)) continue;
    if (!leasedAccounts.has(Number(c.account_id))) continue;
    let d = null;
    try { d = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { d = null; }
    const clockAt = d && d.trainingClock && Number(d.trainingClock.at);
    if (clockAt && clockAt > trainingCutoff) tagged.set(id, { status: "training", where: "" });
  }
  const accountsWithChars = new Set();
  const players = [];
  for (const [id, tag] of tagged) {
    const c = this.findCharacter(id);
    if (!c) continue;
    accountsWithChars.add(Number(c.account_id));
    const acc = this.findAccountById(c.account_id);
    players.push({ id: c.id, name: c.name, voc: c.voc, level: c.level,
      account_id: Number(c.account_id), account_login: acc ? acc.login : "",
      status: tag.status, where: tag.where });
  }
  for (const accId of leasedAccounts) {
    if (accountsWithChars.has(accId) || accountsInInstances.has(accId)) continue;
    const acc = this.findAccountById(accId);
    const order = acc && acc.party_order;
    let rep = (Array.isArray(order) && order.length) ? this.findCharacter(Number(order[0])) : null;
    if (!rep) rep = (this.characters || [])
      .filter((c) => Number(c.account_id) === accId)
      .sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
    players.push({ id: rep ? rep.id : 0, name: rep ? rep.name : (acc ? acc.login : "conta " + accId),
      voc: rep ? rep.voc : "", level: rep ? rep.level : 0,
      account_id: accId, account_login: acc ? acc.login : "", status: "city", where: "" });
  }
  players.sort((a, b) => Number(b.level) - Number(a.level) || String(a.name).localeCompare(String(b.name)));
  return { players, total: players.length };
};
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
/* PARTY AUTOMÁTICA — ordem dos chars da conta (espelha o MySQL). */
JsonStore.prototype.accountPartyOrderGet = function (accountId) {
  const acc = (this.accounts || []).find((a) => Number(a.id) === Number(accountId));
  const arr = acc && acc.party_order;
  return Array.isArray(arr) ? arr.map(Number).filter((n) => n > 0) : [];
};
JsonStore.prototype.accountPartyOrderSet = function (accountId, ids) {
  const acc = (this.accounts || []).find((a) => Number(a.id) === Number(accountId));
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0);
  if (acc) { acc.party_order = list; this._save(); }
  return list;
};
JsonStore.prototype.partySyncRoster = function (partyId, leaderChar, memberIds, ownCharIds) {
  const p = (this.parties || []).find((x) => x.id === Number(partyId));
  if (!p) return false;
  if (leaderChar) { p.leader_id = Number(leaderChar.id); p.leader_name = String(leaderChar.name); }
  const own = new Set((ownCharIds || []).map(Number));
  const wanted = (memberIds || []).map(Number);
  p.members = p.members || [];
  p.members = p.members.filter((m) => !own.has(Number(m.character_id)) || wanted.includes(Number(m.character_id)));
  const curIds = p.members.map((m) => Number(m.character_id));
  const allOrder = wanted.concat(curIds.filter((id) => !wanted.includes(id)));
  const next = [];
  allOrder.forEach((id, i) => {
    const ex = p.members.find((m) => Number(m.character_id) === id);
    next.push(ex ? Object.assign(ex, { position: i + 1 })
      : { character_id: id, position: i + 1, joined_at: new Date().toISOString() });
  });
  p.members = next;
  p.roster_version = (Number(p.roster_version) || 1) + 1;
  p.updated_at = new Date().toISOString();
  this._partySave();
  return true;
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

/* ------------------------------- GUILDS --------------------------------
 * Guild é por CONTA: guild_members.account_id é único (1 personagem
 * representa a conta inteira — bônus valem para a conta toda). */
JsonStore.prototype._guildSave = function () {
  try {
    fs.writeFileSync(path.join(DATA_DIR, "guilds.json"),
      JSON.stringify({
        guilds: this.guilds || [], members: this.guildMembers || [],
        invites: this.guildInvites || [], tasks: this.guildTasks || [],
        log: this.guildLog || [], requests: this.guildRequests || [],
        pvpBattles: this.pvpBattles || [], pvpRoster: this.pvpBattleRoster || [],
      }, null, 1));
  } catch (e) { /* não bloqueia o jogo */ }
};
JsonStore.prototype._nextGuildId = function () {
  return (this.guilds || []).reduce((m, g) => Math.max(m, Number(g.id) || 0), 0) + 1;
};
JsonStore.prototype._nextGuildInviteId = function () {
  return (this.guildInvites || []).reduce((m, i) => Math.max(m, Number(i.id) || 0), 0) + 1;
};
JsonStore.prototype._nextGuildTaskId = function () {
  return (this.guildTasks || []).reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
};
JsonStore.prototype._nextGuildLogId = function () {
  return (this.guildLog || []).reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
};
JsonStore.prototype.guildList = function () {
  return (this.guilds || []).map((g) => Object.assign({}, g, {
    members: (this.guildMembers || []).filter((m) => Number(m.guild_id) === Number(g.id)).length,
  })).sort((a, b) => (Number(b.level) - Number(a.level)) || (Number(b.exp) - Number(a.exp)) ||
    (Number(a.id) - Number(b.id)));
};
JsonStore.prototype.guildById = function (id) {
  return (this.guilds || []).find((g) => Number(g.id) === Number(id)) || null;
};
JsonStore.prototype.guildByName = function (name) {
  const n = String(name || "").toLowerCase();
  return (this.guilds || []).find((g) => String(g.name || "").toLowerCase() === n) || null;
};
JsonStore.prototype.guildMemberByAccount = function (accountId) {
  return (this.guildMembers || []).find((m) => Number(m.account_id) === Number(accountId)) || null;
};
JsonStore.prototype.guildMemberByChar = function (charId) {
  return (this.guildMembers || []).find((m) => Number(m.character_id) === Number(charId)) || null;
};
JsonStore.prototype.guildMembers = function (guildId) {
  const rankOrder = { leader: 0, vice: 1, member: 2 };
  return (this.guildMembers || [])
    .filter((m) => Number(m.guild_id) === Number(guildId))
    .map((m) => {
      const c = this.findCharacter(m.character_id);
      return Object.assign({}, m, {
        name: c ? c.name : "?", voc: c ? c.voc : "none", level: c ? c.level : 1,
      });
    })
    .sort((a, b) => (rankOrder[a.rank] !== undefined ? rankOrder[a.rank] : 3) -
      (rankOrder[b.rank] !== undefined ? rankOrder[b.rank] : 3) ||
      new Date(a.joined_at) - new Date(b.joined_at));
};
JsonStore.prototype.guildCreate = function (opts) {
  if (this.guildByName(opts.name)) return { ok: false, error: "GUILD_NAME_TAKEN" };
  const account = (this.accounts || []).find((a) => Number(a.id) === Number(opts.leader_account_id));
  const cost = Math.max(0, Number(opts.cost_gold) || 0);
  if (!account || Number(account.gold) < cost) return { ok: false, error: "GUILD_GOLD_LOW" };
  if (this.guildMemberByAccount(opts.leader_account_id))
    return { ok: false, error: "GUILD_ALREADY_MEMBER" };
  account.gold = Number(account.gold) - cost;
  const now = new Date().toISOString();
  const guild = { id: this._nextGuildId(), name: opts.name, level: 1, exp: 0,
    points: 0, balance: 0, bonuses: {}, temp_bonuses: {},
    icon: Math.max(1, Math.floor(Number(opts.icon) || 1)), icon_at: 0,
    coins: 0, created_at: now };
  this.guilds.push(guild);
  this.guildMembers.push({ guild_id: guild.id, account_id: Number(opts.leader_account_id),
    character_id: Number(opts.leader_character_id), rank: "leader",
    contribution: 0, joined_at: now });
  // espelha o novo saldo no data.gold dos chars (mesma regra do wallet sync)
  for (const c of this.charactersOf(account.id)) {
    let d = {}; try { d = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { d = {}; }
    d.gold = account.gold; c.data = JSON.stringify(d);
  }
  this._save(); this._guildSave();
  return { ok: true, id: guild.id };
};
JsonStore.prototype.guildInviteAdd = function (guildId, inviterCharId, inviteeCharId) {
  const pending = (this.guildInvites || []).find((i) =>
    Number(i.invitee_character_id) === Number(inviteeCharId) && i.status === "pending");
  if (pending) return { ok: false, error: "GUILD_INVITE_PENDING" };
  const inv = { id: this._nextGuildInviteId(), guild_id: Number(guildId),
    inviter_character_id: Number(inviterCharId), invitee_character_id: Number(inviteeCharId),
    status: "pending", created_at: new Date().toISOString() };
  this.guildInvites.push(inv);
  this._guildSave();
  return { ok: true, id: inv.id };
};
JsonStore.prototype.guildInviteFind = function (id) {
  return (this.guildInvites || []).find((i) => Number(i.id) === Number(id)) || null;
};
JsonStore.prototype.guildInviteSetStatus = function (id, status) {
  const inv = this.guildInviteFind(id);
  if (inv) { inv.status = String(status); this._guildSave(); }
};
JsonStore.prototype.guildInvitesForAccount = function (accountId) {
  return (this.guildInvites || [])
    .filter((i) => {
      if (i.status !== "pending") return false;
      const c = this.findCharacter(i.invitee_character_id);
      return c && Number(c.account_id) === Number(accountId);
    })
    .map((i) => {
      const g = this.guildById(i.guild_id);
      const inv = this.findCharacter(i.inviter_character_id);
      return Object.assign({}, i, {
        guild_name: g ? g.name : "?", inviter_name: inv ? inv.name : "?",
      });
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};
JsonStore.prototype.guildMemberAdd = function (guildId, accountId, charId, rank) {
  this.guildMembers.push({ guild_id: Number(guildId), account_id: Number(accountId),
    character_id: Number(charId), rank: String(rank || "member"),
    contribution: 0, joined_at: new Date().toISOString() });
  this._guildSave();
};
/* Remove membro. Líder sai → vice assume; sem vice, o mais antigo; sem
 * ninguém → guild dissolvida. */
JsonStore.prototype.guildMemberRemove = function (guildId, accountId) {
  const id = Number(guildId), aid = Number(accountId);
  const me = (this.guildMembers || []).find((m) =>
    Number(m.guild_id) === id && Number(m.account_id) === aid);
  if (!me) return { ok: false, error: "NOT_MEMBER" };
  const rest = (this.guildMembers || []).filter((m) =>
    Number(m.guild_id) === id && Number(m.account_id) !== aid);
  let disbanded = false, guildName = null;
  if (!rest.length) {
    const g = this.guildById(id); guildName = g ? g.name : null;
    this.guildInvites = (this.guildInvites || []).filter((i) => Number(i.guild_id) !== id);
    this.guildTasks = (this.guildTasks || []).filter((t) => Number(t.guild_id) !== id);
    this.guildLog = (this.guildLog || []).filter((t) => Number(t.guild_id) !== id);
    this.guildMembers = rest;
    this.guilds = (this.guilds || []).filter((g) => Number(g.id) !== id);
    // dissolveu → limpa data.guildBonus da conta do último membro
    for (const c of this.charactersOf(aid)) this._charSetGuildBonus(c, null);
    disbanded = true;
  } else {
    this.guildMembers = (this.guildMembers || []).filter((m) =>
      !(Number(m.guild_id) === id && Number(m.account_id) === aid));
    for (const c of this.charactersOf(aid)) this._charSetGuildBonus(c, null);
    if (me.rank === "leader") {
      const remainingLeaders = rest.filter((m) => m.rank === "leader");
      if (!remainingLeaders.length) {
        const successor = rest.find((m) => m.rank === "vice") ||
          rest.slice().sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))[0];
        this.guildMembers.forEach((m) => {
          if (Number(m.guild_id) === id && Number(m.account_id) === Number(successor.account_id))
            m.rank = "leader";
        });
      }
    }
  }
  this._save(); this._guildSave();
  return { ok: true, disbanded, guildName };
};
/* Grava/limpa data.guildBonus + data.guildTempBonus num char. */
JsonStore.prototype._charSetGuildBonus = function (char, bonuses, tempBonuses) {
  if (!char) return;
  let d = {}; try { d = typeof char.data === "string" ? JSON.parse(char.data) : (char.data || {}); } catch (e) { d = {}; }
  if (bonuses && typeof bonuses === "object") d.guildBonus = bonuses;
  else delete d.guildBonus;
  if (tempBonuses && typeof tempBonuses === "object") d.guildTempBonus = tempBonuses;
  else delete d.guildTempBonus;
  char.data = JSON.stringify(d);
};
JsonStore.prototype.guildMemberSetRank = function (guildId, accountId, rank) {
  const id = Number(guildId);
  const m = (this.guildMembers || []).find((x) =>
    Number(x.guild_id) === id && Number(x.account_id) === Number(accountId));
  if (m) { m.rank = String(rank); this._guildSave(); }
};
JsonStore.prototype.guildTasksEnsure = function (guildId, accountId, day, defs) {
  let dirty = false;
  for (const def of defs || []) {
    const exists = (this.guildTasks || []).some((t) =>
      Number(t.guild_id) === Number(guildId) && Number(t.account_id) === Number(accountId) &&
      String(t.day) === String(day) && Number(t.slot) === Number(def.slot));
    if (exists) continue;
    this.guildTasks.push({ id: this._nextGuildTaskId(), guild_id: Number(guildId),
      account_id: Number(accountId), day: String(day), slot: Number(def.slot),
      monster_slug: String(def.monster_slug), target: Number(def.target),
      progress: 0, done: 0, completed_at: null });
    dirty = true;
  }
  if (dirty) this._guildSave();
};
JsonStore.prototype.guildTasksFor = function (guildId, accountId, day) {
  return (this.guildTasks || [])
    .filter((t) => Number(t.guild_id) === Number(guildId) &&
      Number(t.account_id) === Number(accountId) && String(t.day) === String(day))
    .sort((a, b) => Number(a.slot) - Number(b.slot));
};
/* Chamado pelo tick da instância com os kills da janela: soma progresso
 * nas tasks abertas do membro (por conta) e fecha task ao bater o alvo —
 * cada task completada dá +1 EXP à guild e +1 contribuição ao membro. */
JsonStore.prototype.guildCreditKills = function (accountId, kills) {
  const member = this.guildMemberByAccount(accountId);
  if (!member || !kills || typeof kills !== "object") return { credited: 0 };
  const Guild = guildModule();
  if (!Guild) return { credited: 0 };
  const day = Guild.guildTaskDay();
  this.guildTasksEnsure(member.guild_id, accountId, day,
    Guild.guildDailyTaskDefs(member.guild_id, day));
  let credited = 0, completed = 0;
  for (const t of this.guildTasksFor(member.guild_id, accountId, day)) {
    if (Number(t.done)) continue;
    const n = Math.max(0, Math.floor(Number(kills[t.monster_slug]) || 0));
    if (!n) continue;
    t.progress = Math.min(Number(t.target), Number(t.progress) + n);
    credited += n;
    if (t.progress >= t.target && !Number(t.done)) {
      t.done = 1; t.completed_at = new Date().toISOString();
      member.contribution = (Number(member.contribution) || 0) + 1;
      const guild = this.guildById(t.guild_id);
      if (guild) {
        guild.exp = (Number(guild.exp) || 0) + 1;
        guild.points = (Number(guild.points) || 0) + 1;
        guild.level = Guild.guildLevelForExp(guild.exp);
      }
      completed++;
    }
  }
  if (credited || completed) this._guildSave();
  return { credited, completed };
};

// ---- GUILD POINTS / SHOP / CAIXA / HISTÓRICO (JSON) ----
JsonStore.prototype.guildLogAdd = function (_exec, entry) {
  const rec = { id: this._nextGuildLogId(), guild_id: Number(entry.guild_id),
    account_id: Number(entry.account_id), char_name: String(entry.char_name || ""),
    category: String(entry.category), detail: String(entry.detail || ""),
    gold_delta: Number(entry.gold_delta) || 0, points_delta: Number(entry.points_delta) || 0,
    coins_delta: Number(entry.coins_delta) || 0,
    created_at: new Date().toISOString() };
  (this.guildLog = this.guildLog || []).push(rec);
  this._guildSave();
  return rec;
};
JsonStore.prototype.guildLogList = function (guildId, category, limit) {
  return (this.guildLog || [])
    .filter((r) => Number(r.guild_id) === Number(guildId) &&
      (!category || r.category === category))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
};
JsonStore.prototype.guildLogTotals = function (guildId) {
  const out = { donated: 0, coinsDonated: 0, spentGold: 0, spentPoints: 0,
    spentCoins: 0, donations: 0, purchases: 0 };
  for (const r of this.guildLog || []) {
    if (Number(r.guild_id) !== Number(guildId)) continue;
    if (r.category === "donation") {
      out.donated += Math.max(0, Number(r.gold_delta) || 0);
      out.coinsDonated += Math.max(0, Number(r.coins_delta) || 0);
      out.donations++;
    }
    if (r.category === "purchase") {
      out.spentGold += Math.abs(Number(r.gold_delta) || 0);
      out.spentPoints += Math.abs(Number(r.points_delta) || 0);
      out.spentCoins += Math.abs(Number(r.coins_delta) || 0);
      out.purchases++;
    }
  }
  return out;
};
JsonStore.prototype.guildDonate = function (guildId, accountId, charName, amount) {
  const guild = this.guildById(guildId);
  const account = (this.accounts || []).find((a) => Number(a.id) === Number(accountId));
  const amt = Math.max(1, Math.floor(Number(amount) || 0));
  if (!guild || !account || Number(account.gold) < amt) return { ok: false, error: "GOLD_LOW" };
  account.gold = Number(account.gold) - amt;
  guild.balance = (Number(guild.balance) || 0) + amt;
  this.guildLogAdd(null, { guild_id: guildId, account_id: accountId, char_name: charName,
    category: "donation", detail: "Doação ao caixa", gold_delta: amt, points_delta: 0 });
  for (const c of this.charactersOf(accountId)) {
    let d = {}; try { d = typeof c.data === "string" ? JSON.parse(c.data) : (c.data || {}); } catch (e) { d = {}; }
    d.gold = account.gold; c.data = JSON.stringify(d);
  }
  this._save(); this._guildSave();
  return { ok: true, balance: guild.balance, gold: account.gold };
};
JsonStore.prototype.guildBonusBuy = function (guildId, accountId, charName, bonusId, newLevel, cost) {
  const guild = this.guildById(guildId);
  const Guild = guildModule();
  const lvl = Math.max(1, Math.min(10, Math.floor(Number(newLevel) || 1)));
  const pts = Math.max(0, Math.floor(Number(cost && cost.points) || 0));
  const gold = Math.max(0, Math.floor(Number(cost && cost.gold) || 0));
  if (!guild) return { ok: false, error: "NOT_FOUND" };
  if (Number(guild.points) < pts || Number(guild.balance) < gold)
    return { ok: false, error: "POINTS_OR_BALANCE_LOW" };
  guild.points = Number(guild.points) - pts;
  guild.balance = Number(guild.balance) - gold;
  guild.bonuses = guild.bonuses && typeof guild.bonuses === "object" ? guild.bonuses : {};
  guild.bonuses[bonusId] = lvl;
  this.guildLogAdd(null, { guild_id: guildId, account_id: accountId, char_name: charName,
    category: "purchase",
    detail: `${(Guild && Guild.guildBonusDef(bonusId) || {}).label || bonusId} Nv ${lvl}`,
    gold_delta: -gold, points_delta: -pts });
  this.guildApplyBonuses(guildId);
  this._save(); this._guildSave();
  return { ok: true, points: guild.points, balance: guild.balance,
    bonuses: Guild ? Guild.guildBonusLevels(guild.bonuses) : guild.bonuses };
};
JsonStore.prototype.guildApplyBonuses = function (guildId) {
  const guild = this.guildById(guildId);
  const Guild = guildModule();
  const bonuses = Guild ? Guild.guildBonusLevels(guild && guild.bonuses)
    : (guild && guild.bonuses) || {};
  const tempBonuses = Guild ? Guild.guildTempBonusUntil(guild && guild.temp_bonuses)
    : (guild && guild.temp_bonuses) || {};
  for (const m of this.guildMembers || []) {
    if (Number(m.guild_id) !== Number(guildId)) continue;
    for (const c of this.charactersOf(m.account_id))
      this._charSetGuildBonus(c, bonuses, tempBonuses);
  }
  this._save();
};
/* Bônus TEMPORÁRIO (24h): caixa + insígnia PvP da conta. */
JsonStore.prototype.guildTempBonusBuy = function (guildId, accountId, charName, bonusId, until, cost) {
  const guild = this.guildById(guildId);
  const account = (this.accounts || []).find((a) => Number(a.id) === Number(accountId));
  const gold = Math.max(0, Math.floor(Number(cost && cost.gold) || 0));
  const ins = Math.max(0, Math.floor(Number(cost && cost.insignias) || 0));
  if (!guild || !account) return { ok: false, error: "NOT_FOUND" };
  if (Number(account.pvp_insignias) < ins) return { ok: false, error: "INSIGNIA_LOW" };
  if (Number(guild.balance) < gold) return { ok: false, error: "BALANCE_LOW" };
  const Guild = guildModule();
  account.pvp_insignias = Number(account.pvp_insignias) - ins;
  guild.balance = Number(guild.balance) - gold;
  guild.temp_bonuses = guild.temp_bonuses && typeof guild.temp_bonuses === "object"
    ? guild.temp_bonuses : {};
  guild.temp_bonuses[bonusId] = Number(until);
  this.guildLogAdd(null, { guild_id: guildId, account_id: accountId, char_name: charName,
    category: "purchase",
    detail: `${(Guild && Guild.guildTempBonusDef(bonusId) || {}).label || bonusId} (24h)`,
    gold_delta: -gold, points_delta: 0 });
  this.guildApplyBonuses(guildId);
  this._save(); this._guildSave();
  return { ok: true, balance: guild.balance,
    tempBonuses: Guild ? Guild.guildTempBonusUntil(guild.temp_bonuses) : guild.temp_bonuses };
};
JsonStore.prototype.guildClearBonusForAccount = function (accountId) {
  for (const c of this.charactersOf(accountId)) this._charSetGuildBonus(c, null);
  this._save();
};
JsonStore.prototype.guildDonateCoins = function (guildId, accountId, charName, amount) {
  const guild = this.guildById(guildId);
  const account = (this.accounts || []).find((a) => Number(a.id) === Number(accountId));
  const amt = Math.max(1, Math.floor(Number(amount) || 0));
  if (!guild || !account || Number(account.coins) < amt) return { ok: false, error: "COINS_LOW" };
  account.coins = Number(account.coins) - amt;
  guild.coins = (Number(guild.coins) || 0) + amt;
  this.guildLogAdd(null, { guild_id: guildId, account_id: accountId, char_name: charName,
    category: "donation", detail: "Doação de Tibia Coins",
    gold_delta: 0, points_delta: 0, coins_delta: amt });
  this._save(); this._guildSave();
  return { ok: true, coins: guild.coins, accountCoins: account.coins };
};
JsonStore.prototype.guildRename = function (guildId, accountId, charName, newName, costCoins) {
  const guild = this.guildById(guildId);
  const cost = Math.max(0, Math.floor(Number(costCoins) || 0));
  if (!guild) return { ok: false, error: "NOT_FOUND" };
  const dup = (this.guilds || []).find((g) =>
    Number(g.id) !== Number(guildId) && String(g.name || "").toLowerCase() === String(newName).toLowerCase());
  if (dup) return { ok: false, error: "GUILD_NAME_TAKEN" };
  if (Number(guild.coins) < cost) return { ok: false, error: "COINS_LOW" };
  guild.coins = Number(guild.coins) - cost;
  guild.name = String(newName);
  this.guildLogAdd(null, { guild_id: guildId, account_id: accountId, char_name: charName,
    category: "purchase", detail: `Guild renomeada para "${String(newName).slice(0, 120)}"`,
    gold_delta: 0, points_delta: 0, coins_delta: -cost });
  this._guildSave();
  return { ok: true };
};
JsonStore.prototype.guildSetIcon = function (guildId, icon, now, logEntry) {
  const guild = this.guildById(guildId);
  if (!guild) return;
  guild.icon = Math.max(1, Math.floor(Number(icon) || 1));
  guild.icon_at = Number(now) || Date.now();
  if (logEntry) this.guildLogAdd(null, { ...logEntry, guild_id: guildId });
  this._guildSave();
};
/* Solicitações de entrada (jogador → guild) — espelha o MySQL. */
JsonStore.prototype.guildRequestAdd = function (guildId, accountId, characterId) {
  this.guildRequests = this.guildRequests || [];
  if (this.guildRequests.find((r) => Number(r.guild_id) === Number(guildId) &&
    Number(r.account_id) === Number(accountId))) return { ok: false, error: "REQUEST_PENDING" };
  const id = this.guildRequests.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  this.guildRequests.push({ id, guild_id: Number(guildId), account_id: Number(accountId),
    character_id: Number(characterId), created_at: new Date().toISOString() });
  this._guildSave();
  return { ok: true };
};
JsonStore.prototype.guildRequestFind = function (id) {
  return (this.guildRequests || []).find((r) => Number(r.id) === Number(id)) || null;
};
JsonStore.prototype.guildRequestByAccount = function (accountId, guildId) {
  return (this.guildRequests || []).find((r) => Number(r.account_id) === Number(accountId) &&
    Number(r.guild_id) === Number(guildId)) || null;
};
JsonStore.prototype.guildRequests = function (guildId) {
  return (this.guildRequests || [])
    .filter((r) => Number(r.guild_id) === Number(guildId))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => {
      const c = (this.characters || []).find((x) => Number(x.id) === Number(r.character_id)) || {};
      return { id: r.id, account_id: r.account_id, character_id: r.character_id,
        created_at: r.created_at, name: c.name, voc: c.voc, level: c.level };
    });
};
JsonStore.prototype.guildRequestDelete = function (id) {
  this.guildRequests = (this.guildRequests || []).filter((r) => Number(r.id) !== Number(id));
  this._guildSave();
};
JsonStore.prototype.guildRequestsClearAccount = function (accountId) {
  this.guildRequests = (this.guildRequests || []).filter((r) =>
    Number(r.account_id) !== Number(accountId));
  this._guildSave();
};

/* ------------------- PvP guild-vs-guild (JsonStore) ------------------- */
const PVP_ACTIVE_STATUSES = new Set(["pending", "accepted", "prep", "live"]);
JsonStore.prototype._pvpStakeCol = function (type) { return type === "coins" ? "coins" : "balance"; };
JsonStore.prototype.pvpBattleGet = function (id) {
  return (this.pvpBattles || []).find((b) => Number(b.id) === Number(id)) || null;
};
JsonStore.prototype.pvpBattlesActive = function () {
  return (this.pvpBattles || []).filter((b) => PVP_ACTIVE_STATUSES.has(String(b.status)));
};
JsonStore.prototype.pvpBattlesForGuild = function (guildId, limit) {
  const list = (this.pvpBattles || [])
    .filter((b) => Number(b.challenger_guild_id) === Number(guildId) ||
                  Number(b.challenged_guild_id) === Number(guildId))
    .sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
  return limit ? list.slice(0, limit) : list;
};
/* Histórico individual: batalhas encerradas em que a conta foi sorteada
 * (independe da guild atual). */
JsonStore.prototype.pvpBattlesForAccount = function (accountId, limit) {
  const ids = new Set((this.pvpBattleRoster || [])
    .filter((r) => Number(r.account_id) === Number(accountId)).map((r) => Number(r.battle_id)));
  const list = (this.pvpBattles || []).filter((b) => ids.has(Number(b.id)) && String(b.status) === "finished")
    .sort((a, b) => Number(b.id) - Number(a.id));
  return limit ? list.slice(0, limit) : list;
};
JsonStore.prototype.pvpBattleLastCreate = function (guildId) {
  return (this.pvpBattles || [])
    .filter((b) => Number(b.challenger_guild_id) === Number(guildId))
    .reduce((m, b) => Math.max(m, Number(b.created_at) || 0), 0);
};
JsonStore.prototype._pvpGuildBusy = function (guildId, excludeId) {
  return (this.pvpBattles || []).find((b) =>
    Number(b.id) !== Number(excludeId) && PVP_ACTIVE_STATUSES.has(String(b.status)) &&
    (Number(b.challenger_guild_id) === Number(guildId) ||
     Number(b.challenged_guild_id) === Number(guildId))) || null;
};
JsonStore.prototype.pvpLobbyCreate = function (opts) {
  const o = opts || {}, g1 = this.guildById(o.challengerGuildId), g2 = this.guildById(o.challengedGuildId);
  if (!g1 || !g2) return { ok: false, error: "GUILD_NOT_FOUND" };
  if (this._pvpGuildBusy(g1.id) || this._pvpGuildBusy(g2.id)) return { ok: false, error: "PVP_GUILD_BUSY" };
  const col = this._pvpStakeCol(o.stakeType), amt = Math.max(0, Math.floor(Number(o.stakeAmount) || 0));
  if (Number(g1[col]) < amt) return { ok: false, error: "STAKE_LOW" };
  g1[col] = Number(g1[col]) - amt;
  const id = (this.pvpBattles || []).reduce((m, b) => Math.max(m, Number(b.id) || 0), 0) + 1;
  const rec = { id, challenger_guild_id: Number(g1.id), challenged_guild_id: Number(g2.id),
    created_by: Number(o.createdBy), map: String(o.map), team_size: Number(o.teamSize),
    stake_type: col === "coins" ? "coins" : "gold", stake_amount: amt, status: "pending",
    scheduled_at: Number(o.scheduledAt), prepared_at: 0, started_at: 0, finished_at: 0,
    winner_guild_id: null, draw: 0, overtime: 0, scores: null, result: null,
    host_account_id: null, instance_id: null, created_at: Date.now(), quick: o.quick ? 1 : 0 };
  (this.pvpBattles = this.pvpBattles || []).push(rec);
  this.guildLogAdd(null, { guild_id: g1.id, account_id: Number(o.createdBy), char_name: o.charName || "",
    category: "pvp", detail: `Desafio PvP #${id} vs ${g2.name} (${amt} ${rec.stake_type})`,
    gold_delta: col === "balance" ? -amt : 0, points_delta: 0, coins_delta: col === "coins" ? -amt : 0 });
  this._guildSave();
  return { ok: true, id };
};
JsonStore.prototype.pvpBattleUpdate = function (id, fields) {
  const b = this.pvpBattleGet(id); if (!b) return { ok: false, error: "NOT_FOUND" };
  Object.assign(b, fields || {}); this._guildSave(); return { ok: true };
};
JsonStore.prototype._pvpStakeMove = function (guildId, col, delta) {
  const g = this.guildById(guildId); if (!g) return false;
  if (delta < 0 && Number(g[col]) < -delta) return false;
  g[col] = Number(g[col]) + delta; return true;
};
JsonStore.prototype.pvpBattleAccept = function (battleId, guildId, charName) {
  const b = this.pvpBattleGet(battleId);
  if (!b || String(b.status) !== "pending" || Number(b.challenged_guild_id) !== Number(guildId))
    return { ok: false, error: "INVALID_STATE" };
  const col = this._pvpStakeCol(b.stake_type);
  if (!this._pvpStakeMove(guildId, col, -Number(b.stake_amount))) return { ok: false, error: "STAKE_LOW" };
  b.status = "accepted";
  this.guildLogAdd(null, { guild_id: Number(guildId), account_id: 0, char_name: charName || "",
    category: "pvp", detail: `Desafio PvP #${b.id} aceito (${b.stake_amount} ${b.stake_type})`,
    gold_delta: col === "balance" ? -b.stake_amount : 0, points_delta: 0,
    coins_delta: col === "coins" ? -b.stake_amount : 0 });
  this._guildSave(); return { ok: true };
};
JsonStore.prototype._pvpRefund = function (b, team) {
  const col = this._pvpStakeCol(b.stake_type);
  const gid = team === "challenged" ? b.challenged_guild_id : b.challenger_guild_id;
  this._pvpStakeMove(gid, col, Number(b.stake_amount));
};
JsonStore.prototype.pvpBattleDecline = function (battleId, guildId) {
  const b = this.pvpBattleGet(battleId);
  if (!b || String(b.status) !== "pending" || Number(b.challenged_guild_id) !== Number(guildId))
    return { ok: false, error: "INVALID_STATE" };
  this._pvpRefund(b, "challenger"); b.status = "declined"; b.finished_at = Date.now();
  this._guildSave(); return { ok: true };
};
JsonStore.prototype.pvpBattleCancel = function (battleId) {
  const b = this.pvpBattleGet(battleId);
  if (!b || !["pending", "accepted"].includes(String(b.status))) return { ok: false, error: "INVALID_STATE" };
  this._pvpRefund(b, "challenger");
  if (String(b.status) === "accepted") this._pvpRefund(b, "challenged");
  b.status = "cancelled"; b.finished_at = Date.now(); this._guildSave(); return { ok: true };
};
JsonStore.prototype.pvpBattleForfeit = function (battleId, loserGuildId, charName) {
  const b = this.pvpBattleGet(battleId);
  if (!b || !["accepted", "prep", "live"].includes(String(b.status))) return { ok: false, error: "INVALID_STATE" };
  const winner = Number(b.challenger_guild_id) === Number(loserGuildId) ? b.challenged_guild_id : b.challenger_guild_id;
  this._pvpRefund(b, "challenger"); this._pvpRefund(b, "challenged");
  const col = this._pvpStakeCol(b.stake_type), pot = Number(b.stake_amount) * 2;
  const fee = Math.floor(pot * 0.10), net = pot - fee;
  this._pvpStakeMove(winner, col, net);
  b.status = "finished"; b.winner_guild_id = winner; b.finished_at = Date.now();
  b.result = JSON.stringify({ forfeit: Number(loserGuildId), rewards: { winnerGuild: winner, net, fee } });
  this.guildLogAdd(null, { guild_id: Number(winner), account_id: 0, char_name: charName || "",
    category: "pvp", detail: `Vitória PvP #${b.id} por desistência (pote ${net})`,
    gold_delta: col === "balance" ? net : 0, points_delta: 0, coins_delta: col === "coins" ? net : 0 });
  this._guildSave(); return { ok: true, winner };
};
JsonStore.prototype.pvpRosterReplace = function (battleId, rows) {
  this.pvpBattleRoster = (this.pvpBattleRoster || []).filter((r) => Number(r.battle_id) !== Number(battleId));
  for (const r of rows || []) this.pvpBattleRoster.push({ battle_id: Number(battleId),
    team: Number(r.team), account_id: Number(r.account_id), char_ids: JSON.stringify(r.char_ids || r.charIds || []),
    leader: r.leader ? 1 : 0, online: r.online ? 1 : 0, kills: 0, deaths: 0, damage: 0 });
  this._guildSave(); return { ok: true };
};
JsonStore.prototype.pvpRosterGet = function (battleId) {
  return (this.pvpBattleRoster || []).filter((r) => Number(r.battle_id) === Number(battleId)).map((r) => {
    let ids = r.char_ids; if (typeof ids === "string") { try { ids = JSON.parse(ids); } catch (e) { ids = []; } }
    return { battle_id: Number(r.battle_id), team: Number(r.team), account_id: Number(r.account_id),
      char_ids: Array.isArray(ids) ? ids : [], leader: !!r.leader, online: !!r.online,
      kills: Number(r.kills) || 0, deaths: Number(r.deaths) || 0, damage: Number(r.damage) || 0 };
  });
};
/* Lock de preparo/batalha por conta: 1 consulta em vez de N+1 rosters —
 * o caminho anterior iterava TODAS as batalhas ativas por request. */
JsonStore.prototype.pvpLockedBattleForAccount = function (accountId) {
  const aid = Number(accountId);
  const battles = (this.pvpBattles || []).filter((b) =>
    ["prep", "live"].includes(String(b.status)));
  for (const b of battles) {
    const hit = (this.pvpBattleRoster || []).some((r) =>
      Number(r.battle_id) === Number(b.id) && Number(r.account_id) === aid);
    if (hit) return { battle_id: Number(b.id), status: String(b.status) };
  }
  return null;
};
JsonStore.prototype.accountAddInsignias = function (accountId, n) {
  const acc = (this.accounts || []).find((a) => Number(a.id) === Number(accountId));
  if (!acc) return false;
  acc.pvp_insignias = Math.max(0, (Number(acc.pvp_insignias) || 0) + Math.floor(Number(n) || 0));
  return true;
};
JsonStore.prototype.pvpStakeCredit = function (guildId, type, amount) {
  const g = this.guildById(guildId); if (!g) return { ok: false, error: "NOT_FOUND" };
  const col = this._pvpStakeCol(type), amt = Math.max(0, Math.floor(Number(amount) || 0));
  g[col] = (Number(g[col]) || 0) + amt;
  this._guildSave();
  return { ok: true, value: g[col] };
};

/* Wrapper MySQL (mysql2/promise) — mesma API do JsonStore */
async function MysqlStore() {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASS,
    database: MYSQL_DB, port: MYSQL_PORT,
    waitForConnections: true,
    /* Múltiplas guerras PvP: cada tick da batalha segura uma conexão durante
     * a transação (inclui o avanço da autoridade). Com N batalhas × ~35
     * req/s o pool de 10 voltava a afogar — 25 por padrão, configurável. */
    connectionLimit: Math.max(10, Number(process.env.MYSQL_POOL_LIMIT) || 25),
    charset: "utf8mb4",
  });
  // garante o schema (tabelas) no primeiro uso
  await ensureSchema(pool);

  function hydrateAccount(row) {
    if (!row) return null;
    const out = Object.assign({}, row);
    for (const [col, key] of [["missions", "missions"], ["missions_done", "missionsDone"], ["tutorial", "tutorial"], ["cosmetics", "cosmetics"], ["social", "social"]]) {
      let v = row[col];
      if (typeof v === "string") {
        try { v = JSON.parse(v); } catch (e) { v = {}; }
      }
      out[key] = v && typeof v === "object" && !Array.isArray(v) ? v : {};
    }
    // friends é lista [{charId,name,muted}] — fica fora do loop de objetos.
    let f = row.friends;
    if (typeof f === "string") { try { f = JSON.parse(f); } catch (e) { f = []; } }
    out.friends = Array.isArray(f) ? f : [];
    return out;
  }
  function hydrateStoreOrder(row) {
    if (!row) return null;
    return {
      id: row.id, accountId: row.account_id, login: row.login, packId: row.pack_id,
      method: row.method, brl: Number(row.brl) || 0, coins: Number(row.coins) || 0,
      status: row.status, mpId: row.mp_id || "", pixQr: row.pix_qr || "", pixCopy: row.pix_copy || "",
      checkoutUrl: row.checkout_url || "", note: row.note || "",
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : "",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    };
  }
  function hydrateLedger(row) {
    if (!row) return null;
    return {
      id: row.id, accountId: row.account_id, login: row.login, kind: row.kind,
      delta: Number(row.delta) || 0, coinsAfter: Number(row.coins_after) || 0,
      brlCents: Number(row.brl_cents) || 0, ref: row.ref || "", note: row.note || "",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    };
  }

  async function lockValidLease(conn,accountId,lease){
    if(!lease)return true;
    const [rows]=await conn.query("SELECT holder_id,secret_hash,expires_at FROM account_leases WHERE account_id=? FOR UPDATE",
      [Number(accountId)]);
    const row=rows[0];
    return !!(row&&row.holder_id===lease.holderId&&row.secret_hash===lease.secretHash&&
      new Date(row.expires_at).getTime()>lease.now);
  }
  /* Propaga guilds.bonuses → data.guildBonus de todos os chars das contas
   * membro. Feito em JS porque o MariaDB não tem CAST(... AS JSON) —
   * JSON_SET com string gravaria o objeto como texto. */
  async function guildBonusToChars(exec, guildId) {
    const [grows] = await exec.query("SELECT bonuses, temp_bonuses FROM guilds WHERE id=?",
      [Number(guildId)]);
    const Guild = guildModule();
    const bonuses = Guild ? Guild.guildBonusLevels(grows[0] && grows[0].bonuses)
      : (grows[0] && grows[0].bonuses) || {};
    const tempBonuses = Guild ? Guild.guildTempBonusUntil(grows[0] && grows[0].temp_bonuses)
      : (grows[0] && grows[0].temp_bonuses) || {};
    const [chars] = await exec.query(
      `SELECT c.id, c.data FROM characters c
       JOIN guild_members m ON m.account_id=c.account_id WHERE m.guild_id=?`,
      [Number(guildId)]);
    for (const ch of chars) {
      let d = {}; try { d = typeof ch.data === "string" ? JSON.parse(ch.data) : (ch.data || {}); } catch (e) { d = {}; }
      d.guildBonus = bonuses;
      d.guildTempBonus = tempBonuses;
      await exec.query("UPDATE characters SET data=? WHERE id=?", [JSON.stringify(d), Number(ch.id)]);
    }
  }
  /* Store BLESS: state.authority.wallets[].bless espelha
   * accounts.cosmetics.bless. O motor consome uma carga no party wipe e
   * marca blessSpent; aqui o gasto é descontado da conta (dentro da mesma
   * transação do checkpoint) e o wallet é re-semeado — cobrindo compras
   * feitas no meio da instância. Recebe/devolve o state serializado. */
  async function syncBlessWallets(conn,stateJson){
    let st;
    try{st=typeof stateJson==="string"?JSON.parse(stateJson):stateJson;}
    catch(e){return stateJson;}
    const wallets=st&&st.authority&&st.authority.wallets;
    if(!wallets||typeof wallets!=="object")return stateJson;
    let dirty=false;
    for(const key of Object.keys(wallets)){
      const w=wallets[key],aid=Number(key);
      if(!w||!aid)continue;
      const spent=Math.max(0,Math.floor(Number(w.blessSpent)||0));
      if(spent)await conn.query(
        `UPDATE accounts SET cosmetics = JSON_SET(
           CASE WHEN JSON_VALID(cosmetics) THEN cosmetics ELSE '{}' END,
           '$.bless',
           GREATEST(0, COALESCE(CASE WHEN JSON_VALID(cosmetics)
             THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(cosmetics, '$.bless')) AS SIGNED)
             ELSE 0 END, 0) - ?))
         WHERE id = ?`,
        [spent,aid]);
      const [rows]=await conn.query("SELECT cosmetics FROM accounts WHERE id=? FOR UPDATE",[aid]);
      let cos=null;
      if(rows[0]&&rows[0].cosmetics){
        try{cos=typeof rows[0].cosmetics==="string"?JSON.parse(rows[0].cosmetics):rows[0].cosmetics;}catch(e){cos=null;}
      }
      const have=Math.max(0,Math.floor(Number(cos&&cos.bless)||0));
      if(Number(w.bless)!==have||spent){w.bless=have;w.blessSpent=0;dirty=true;}
    }
    return dirty?JSON.stringify(st):stateJson;
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
      // Level/exp da CONTA: o char salvo carrega o progresso compartilhado.
      let exp=0;try{const d=JSON.parse(save.data);exp=Math.max(0,Math.floor(Number(d.exp)||0));}catch(e){}
      await conn.query(
        "UPDATE accounts SET level=?, exp=? WHERE id=? AND ? >= level",
        [Math.max(1,Math.floor(Number(save.level)||1)),exp,Number(accountId),
         Math.max(1,Math.floor(Number(save.level)||1))]);
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
    async createAccount(login, hash, role, coins, email, displayName) {
      const em = String(email || "").slice(0, 120);
      const dn = String(displayName || login).slice(0, 24);
      const r = await this.run(
        "INSERT INTO accounts (login, password_hash, email, display_name, role, coins, gold, gold_migrated, vip_until, missions, missions_done, tutorial, cosmetics) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, '{}', '{}', '{}', '{}')",
        [login, hash, em, dn, role || "user", coins || 0]);
      return { id: r.insertId, login, password_hash: hash, email: em, display_name: dn,
        email_verified: 0, email_code: "", email_code_expires: 0,
        role: role || "user", coins: coins || 0, level: 1, exp: 0,
        gold: 0, gold_migrated: 1, vip_until: 0, missions: {}, missionsDone: {}, tutorial: {}, cosmetics: {} };
    },
    async findAccountByDisplayName(name) {
      const rows = await this.query("SELECT * FROM accounts WHERE display_name = ?", [String(name || "").slice(0, 24)]);
      return hydrateAccount(rows[0] || null);
    },
    /* EXP/level da CONTA: todo save de personagem grava o progresso na conta;
     * a leitura (findCharacter/charactersOf) injeta os valores da conta no
     * snapshot do char — todos os personagens compartilham o mesmo nível. */
    async setAccountLevelExp(accountId, level, exp) {
      // Só avança: um save de char mais novo que o da conta nunca regride.
      await this.run("UPDATE accounts SET level = ?, exp = ? WHERE id = ? AND ? >= level",
        [Math.max(1, Math.floor(Number(level) || 1)), Math.max(0, Math.floor(Number(exp) || 0)),
         Number(accountId), Math.max(1, Math.floor(Number(level) || 1))]);
    },
    async accountWardrobe(accountId, recipeId, alternative) {
      const W = require("./wardrobe");
      await this.accountSharedInventory(accountId);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [accounts] = await conn.query("SELECT * FROM accounts WHERE id=? FOR UPDATE", [Number(accountId)]);
        const account = accounts[0];
        if (!account) { await conn.rollback(); return { ok: false, msg: "Conta não encontrada." }; }
        const [characters] = await conn.query("SELECT * FROM characters WHERE account_id=? ORDER BY id", [Number(accountId)]);
        const shared = W.object(account.shared_inventory);
        W.migrate(account, characters);
        let result = { ok: true };
        if (recipeId) {
          const [instances] = await conn.query("SELECT status FROM account_instances WHERE account_id=?", [Number(accountId)]);
          if (instances.some((i) => i.status === "active") || characters.some((c) => ["hunt", "boss"].includes(c.zone))) {
            await conn.rollback(); return { ok: false, msg: "Saia do combate antes de realizar a troca." };
          }
          result = W.exchange(account, characters, shared, recipeId, alternative);
        }
        if (recipeId && result.ok) {
          await conn.query("UPDATE accounts SET cosmetics=?,shared_inventory=? WHERE id=?",
            [JSON.stringify(account.cosmetics), JSON.stringify(shared), Number(accountId)]);
        } else {
          await conn.query("UPDATE accounts SET cosmetics=? WHERE id=?", [JSON.stringify(account.cosmetics), Number(accountId)]);
        }
        await conn.commit();
        return Object.assign(result, { cosmetics: account.cosmetics, catalog: W.catalog(account, characters, shared), sharedInventory: shared });
      } catch (error) { await conn.rollback(); throw error; }
      finally { conn.release(); }
    },
    async setAccountSocial(accountId, social) {
      await this.run("UPDATE accounts SET social=? WHERE id=?",
        [JSON.stringify(social && typeof social === "object" ? social : {}), Number(accountId)]);
    },
    async setAccountCosmetics(accountId, cosmetics) {
      const conn = await pool.getConnection(), W = require("./wardrobe");
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query("SELECT cosmetics FROM accounts WHERE id=? FOR UPDATE", [Number(accountId)]);
        const prior = W.object(rows[0] && rows[0].cosmetics);
        const merged = W.mergeCosmetics(prior, cosmetics);
        merged.preyCards = Math.max(0, Math.floor(Number(prior.preyCards) || 0));
        await conn.query("UPDATE accounts SET cosmetics=? WHERE id=?", [JSON.stringify(merged), Number(accountId)]);
        await conn.commit();
      } catch (error) { await conn.rollback(); throw error; }
      finally { conn.release(); }
      return this.findAccountById(accountId);
    },
    /* Hazard level (Gnomprona, por CONTA): cosmetics.hazard já mergeado
     * pelo endpoint — JSON_SET no campo cosmetics (mesma coluna do bless). */
    async setAccountHazard(accountId, hazard) {
      const h = {
        kills: Math.max(0, Math.floor(Number(hazard && hazard.kills) || 0)),
        level: Math.max(0, Math.min(12, Math.floor(Number(hazard && hazard.level) || 0))),
        sel: Math.max(0, Math.min(12, Math.floor(Number(hazard && hazard.sel) || 0))),
      };
      await this.run(
        `UPDATE accounts SET cosmetics = JSON_SET(
           CASE WHEN JSON_VALID(cosmetics) THEN cosmetics ELSE '{}' END,
           '$.hazard', JSON_EXTRACT(?, '$')) WHERE id = ?`,
        [JSON.stringify(h), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async setAccountMissions(accountId, missions, missionsDone) {
      const m = missions && typeof missions === "object" && !Array.isArray(missions) ? missions : {};
      const d = missionsDone && typeof missionsDone === "object" && !Array.isArray(missionsDone) ? missionsDone : {};
      await this.run(
        "UPDATE accounts SET missions = ?, missions_done = ? WHERE id = ?",
        [JSON.stringify(m), JSON.stringify(d), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async setAccountTutorial(accountId, tutorial) {
      const t = tutorial && typeof tutorial === "object" && !Array.isArray(tutorial) ? tutorial : {};
      await this.run("UPDATE accounts SET tutorial = ? WHERE id = ?",
        [JSON.stringify(t), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    /* Friendlist SOCIAL por conta: [{charId, name, muted}] — endpoints /api/social/*. */
    async setAccountFriends(accountId, friends) {
      const f = Array.isArray(friends) ? friends : [];
      await this.run("UPDATE accounts SET friends = ? WHERE id = ?",
        [JSON.stringify(f), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    /* Presença por conta para a friendlist: {accId:{online,inInstance}}.
     * online = lease válida (navegador aberto) OU personagem da conta em
     * instância ativa (caçada continua sem navegador). */
    async socialPresence(accountIds) {
      const ids = [...new Set((accountIds || []).map(Number).filter((n) => n > 0))];
      const out = {};
      for (const id of ids) out[id] = { online: false, inInstance: false };
      if (!ids.length) return out;
      const ph = ids.map(() => "?").join(",");
      const leases = await this.query(
        `SELECT account_id, expires_at FROM account_leases WHERE account_id IN (${ph})`, ids);
      const now = new Date();
      for (const l of leases) {
        if (l.expires_at && new Date(l.expires_at) > now)
          out[Number(l.account_id)].online = true;
      }
      const chars = await this.query(
        `SELECT id, account_id FROM characters WHERE account_id IN (${ph})`, ids);
      const owner = new Map(chars.map((c) => [Number(c.id), Number(c.account_id)]));
      const insts = await this.query(
        "SELECT state FROM account_instances WHERE status = 'active'");
      for (const row of insts) {
        let st = null;
        try { st = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { st = null; }
        const members = (st && st.members) || [];
        for (const m of members) {
          const accId = owner.get(Number(m && m.id));
          if (accId) { out[accId].inInstance = true; out[accId].online = true; }
        }
      }
      return out;
    },
    /* ---- inventário compartilhado da conta (bag/pouch/depot/reward) ---- */
    async accountSharedInventory(accountId) {
      const rows = await this.query("SELECT shared_inventory FROM accounts WHERE id = ?", [Number(accountId)]);
      let s = rows[0] ? rows[0].shared_inventory : null;
      if (typeof s === "string") { try { s = JSON.parse(s); } catch (e) { s = null; } }
      if (!s || s.v !== 1) {
        let chars = [];
        try { chars = await this.charactersOf(Number(accountId)); } catch (e) { chars = []; }
        s = SharedInv ? SharedInv.mergeCharContainers(SharedInv.emptySharedInventory(), chars)
          : { v: 1, seq: 0, bag: {}, lootPouch: {}, depot: [], itemInstances: [], rewardChest: {}, rewardChestBundles: [] };
        s.legacyPouchDone = 1;
        s.stashSharedDone = 1;
        await this.setAccountSharedInventory(Number(accountId), s);
      } else if (!s.legacyPouchDone) {
        // Conta antiga: une pouches legadas dos personagens na pouch única da
        // conta (idempotente — espelhos não são somados).
        let chars = [];
        try { chars = await this.charactersOf(Number(accountId)); } catch (e) { chars = []; }
        mergeLegacyCharPouches(s, chars);
        s.legacyPouchDone = 1;
        await this.setAccountSharedInventory(Number(accountId), s);
      }
      if (!s.forgeResourcesDone && SharedInv) {
        let chars = [];
        try { chars = await this.charactersOf(Number(accountId)); } catch (e) { chars = []; }
        SharedInv.mergeCharForgeResources(s, chars);
        await this.setAccountSharedInventory(Number(accountId), s);
      }
      if (!s.stashSharedDone) {
        // Supply Stash entrou no shared depois: une as stashes por personagem.
        let chars = [];
        try { chars = await this.charactersOf(Number(accountId)); } catch (e) { chars = []; }
        mergeLegacyCharStashes(s, chars);
        s.stashSharedDone = 1;
        await this.setAccountSharedInventory(Number(accountId), s);
      }
      if (!s.staminaSharedDone && SharedInv) {
        // Stamina era por personagem: o pool da conta nasce do MAIOR espelho.
        let chars = [];
        try { chars = await this.charactersOf(Number(accountId)); } catch (e) { chars = []; }
        SharedInv.seedSharedStamina(s, chars);
        s.staminaSharedDone = 1;
        await this.setAccountSharedInventory(Number(accountId), s);
      }
      if (!s.charmsSharedDone && SharedInv && SharedInv.seedSharedCharms) {
        // Charms eram por personagem: pool da conta = união dos unlocks +
        // soma dos charm points não gastos de todos os personagens.
        let chars = [];
        try { chars = await this.charactersOf(Number(accountId)); } catch (e) { chars = []; }
        SharedInv.seedSharedCharms(s, chars);
        s.charmsSharedDone = 1;
        await this.setAccountSharedInventory(Number(accountId), s);
      }
      return SharedInv ? SharedInv.normalizeSharedInventory(s) : s;
    },
    async setAccountSharedInventory(accountId, s) {
      const empty = { v: 1, seq: 0, bag: {}, lootPouch: {}, depot: [], itemInstances: [], rewardChest: {}, rewardChestBundles: [] };
      await this.run("UPDATE accounts SET shared_inventory = ? WHERE id = ?",
        [JSON.stringify(s || empty), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    /* read-modify-write ATÔMICO do shared_inventory: SELECT FOR UPDATE +
     * UPDATE na mesma tx. O padrão antigo (accountSharedInventory → muta →
     * setAccountSharedInventory solto) era last-writer-wins contra o write
     * do tick da instância — o blob velho sobrescrevia claim/equip (reward
     * "voltava" para o baú, item equipado sumia). O mutator recebe o shared
     * VIVO e aplica só o delta dele; retornar false aborta sem gravar. */
    async accountSharedInventoryMutate(accountId, mutator) {
      for (;;) {
        const conn = await pool.getConnection();
        let retry = false;
        try {
          await conn.beginTransaction();
          const [rows] = await conn.query(
            "SELECT shared_inventory FROM accounts WHERE id = ? FOR UPDATE", [Number(accountId)]);
          let s = rows[0] ? rows[0].shared_inventory : null;
          if (typeof s === "string") { try { s = JSON.parse(s); } catch (e) { s = null; } }
          const needsBootstrap = !s || s.v !== 1 || !s.legacyPouchDone || !s.forgeResourcesDone ||
            !s.stashSharedDone || !s.staminaSharedDone || !s.charmsSharedDone;
          if (needsBootstrap) {
            // Migrações lazy vivem em accountSharedInventory — roda fora da
            // tx e tenta de novo (caminho executado uma única vez por conta).
            await conn.rollback(); retry = true;
          } else {
            s = SharedInv ? SharedInv.normalizeSharedInventory(s) : s;
            const out = await mutator(s);
            if (out === false) { await conn.rollback(); return null; }
            await conn.query("UPDATE accounts SET shared_inventory = ? WHERE id = ?",
              [JSON.stringify(s), Number(accountId)]);
            await conn.commit();
            return s;
          }
        } catch (error) {
          try { await conn.rollback(); } catch (e) {}
          throw error;
        } finally { conn.release(); }
        if (!retry) return null;
        await this.accountSharedInventory(accountId);
      }
    },
    async updateCoins(id, coins) {
      await this.run("UPDATE accounts SET coins = ? WHERE id = ?", [Math.max(0, coins), Number(id)]);
      return this.findAccountById(id);
    },
    /* NON-TRANSFERABLE TIBIA COINS (coins_nt): só gastáveis na STORE —
     * market e RMT só mexem em `coins`. Débito de store é NT-first.
     * ATENÇÃO à ordem do SET: MySQL/MariaDB avalia as atribuições da
     * esquerda para a direita; `coins` usa o coins_nt ANTIGO e `coins_nt`
     * é atualizado depois — não reordenar. */
    async updateCoinsNt(id, coinsNt) {
      await this.run("UPDATE accounts SET coins_nt = ? WHERE id = ?",
        [Math.max(0, Math.floor(Number(coinsNt) || 0)), Number(id)]);
      return this.findAccountById(id);
    },
    async creditCoinsNt(id, amount) {
      const add = Math.max(0, Math.floor(Number(amount) || 0));
      if (!add) return this.findAccountById(id);
      await this.run("UPDATE accounts SET coins_nt = coins_nt + ? WHERE id = ?", [add, Number(id)]);
      return this.findAccountById(id);
    },
    async spendStoreCoins(id, amount) {
      const cost = Math.max(0, Math.floor(Number(amount) || 0));
      const r = await this.run(
        `UPDATE accounts SET
           coins = coins - (? - LEAST(coins_nt, ?)),
           coins_nt = coins_nt - LEAST(coins_nt, ?)
         WHERE id = ? AND coins + coins_nt >= ?`,
        [cost, cost, cost, Number(id), cost]);
      if (!(r && r.affectedRows > 0)) return null;
      const fresh = await this.findAccountById(id);
      return {
        coins: Math.max(0, Number(fresh && fresh.coins) || 0),
        coinsNt: Math.max(0, Number(fresh && fresh.coins_nt) || 0),
      };
    },
    async changePreyCards(id, delta, cost) {
      if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(cost) || cost < 0) return false;
      const json = "CASE WHEN JSON_VALID(cosmetics) THEN cosmetics ELSE '{}' END";
      const count = `GREATEST(0, COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${json}, '$.preyCards')) AS SIGNED), 0))`;
      /* Custo é compra de store → NT-first (mesma ordem do SET acima). */
      const r = await this.run(
        `UPDATE accounts SET
           coins = coins - (? - LEAST(coins_nt, ?)),
           coins_nt = coins_nt - LEAST(coins_nt, ?),
           cosmetics = JSON_SET(${json}, '$.preyCards', ${count} + ?)
         WHERE id = ? AND coins + coins_nt >= ? AND ${count} + ? >= 0`,
        [cost, cost, cost, delta, Number(id), cost, delta]);
      return !!(r && r.affectedRows > 0);
    },
    /* 3º slot de prey por conta: um único UPDATE atômico — debita os
     * cards e marca preySlot só se ainda não tiver e houver saldo. */
    async buyPreySlot(id, cardCost) {
      const cost = Math.max(0, Math.floor(Number(cardCost) || 0));
      const json = "CASE WHEN JSON_VALID(cosmetics) THEN cosmetics ELSE '{}' END";
      const count = `GREATEST(0, COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${json}, '$.preyCards')) AS SIGNED), 0))`;
      const r = await this.run(
        `UPDATE accounts SET cosmetics = JSON_SET(${json}, '$.preyCards', ${count} - ?, '$.preySlot', 1)
         WHERE id = ? AND ${count} >= ? AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${json}, '$.preySlot')), '0') IN ('0','false','null')`,
        [cost, Number(id), cost]);
      return !!(r && r.affectedRows > 0);
    },
    async debitCoins(id, amount) {
      const cost = Math.max(0, Math.floor(Number(amount) || 0));
      const r = await this.run(
        "UPDATE accounts SET coins = coins - ? WHERE id = ? AND coins >= ?",
        [cost, Number(id), cost]);
      return !!(r && r.affectedRows > 0);
    },
    async bumpAccountBless(id, delta) {
      // Incremento atômico em accounts.cosmetics.bless (JSON em MEDIUMTEXT).
      await this.run(
        `UPDATE accounts SET cosmetics = JSON_SET(
           CASE WHEN JSON_VALID(cosmetics) THEN cosmetics ELSE '{}' END,
           '$.bless',
           GREATEST(0, COALESCE(CASE WHEN JSON_VALID(cosmetics)
             THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(cosmetics, '$.bless')) AS SIGNED)
             ELSE 0 END, 0) + ?))
         WHERE id = ?`,
        [Math.floor(Number(delta) || 0), Number(id)]);
      const rows = await this.query("SELECT cosmetics FROM accounts WHERE id = ?", [Number(id)]);
      const row = rows && rows[0];
      let cos = null;
      if (row && row.cosmetics) {
        try { cos = typeof row.cosmetics === "string" ? JSON.parse(row.cosmetics) : row.cosmetics; } catch (e) { cos = null; }
      }
      return Math.max(0, Math.floor(Number(cos && cos.bless) || 0));
    },
    async storeOrderInsert(row) {
      const r = await this.run(
        `INSERT INTO store_orders (account_id, login, pack_id, method, brl, coins, status, mp_id, pix_qr, pix_copy, checkout_url, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [Number(row.accountId), String(row.login || ""), String(row.packId || ""), String(row.method || "pix"),
         Number(row.brl) || 0, Number(row.coins) || 0, String(row.status || "pending"), String(row.mpId || ""),
         String(row.pixQr || ""), String(row.pixCopy || ""), String(row.checkoutUrl || ""), String(row.note || "")]);
      return this.storeOrderGet(r.insertId);
    },
    async storeOrderGet(id) {
      const rows = await this.query("SELECT * FROM store_orders WHERE id = ?", [Number(id)]);
      return rows[0] ? hydrateStoreOrder(rows[0]) : null;
    },
    async storeOrderUpdate(id, patch) {
      const cur = await this.storeOrderGet(id);
      if (!cur) return null;
      const next = Object.assign({}, cur, patch || {});
      await this.run(
        `UPDATE store_orders SET status=?, mp_id=?, pix_qr=?, pix_copy=?, checkout_url=?, coins=?, note=?, paid_at=? WHERE id=?`,
        [next.status || cur.status, String(next.mpId || ""), String(next.pixQr || ""), String(next.pixCopy || ""),
         String(next.checkoutUrl || ""), Number(next.coins) || 0, String(next.note || ""),
         next.paidAt ? new Date(next.paidAt) : null, Number(id)]);
      return this.storeOrderGet(id);
    },
    async storeOrderList(limit) {
      const n = Math.max(1, Math.min(500, Number(limit) || 100));
      const rows = await this.query("SELECT * FROM store_orders ORDER BY id DESC LIMIT ?", [n]);
      return rows.map(hydrateStoreOrder);
    },
    async storeOrdersByAccount(accountId, limit) {
      const n = Math.max(1, Math.min(200, Number(limit) || 40));
      const rows = await this.query("SELECT * FROM store_orders WHERE account_id=? ORDER BY id DESC LIMIT ?",
        [Number(accountId), n]);
      return rows.map(hydrateStoreOrder);
    },
    async voucherClaim(accountId, code) {
      try {
        await this.run("INSERT INTO voucher_redemptions (account_id, code) VALUES (?, ?)",
          [Number(accountId), String(code || "")]);
        return true;
      } catch (e) {
        if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) return false;
        throw e;
      }
    },
    async voucherRedemptionList(limit) {
      const n = Math.max(1, Math.min(500, Number(limit) || 200));
      return await this.query(
        `SELECT v.account_id AS accountId, a.login AS login, v.code AS code,
                v.created_at AS createdAt
         FROM voucher_redemptions v LEFT JOIN accounts a ON a.id=v.account_id
         ORDER BY v.id DESC LIMIT ?`, [n]);
    },
    /* Estado administrável por código (paused/deleted) — aba VOUCHERS do
     * painel admin; não altera a definição fixa em store.js. */
    async voucherStateList() {
      const rows = await this.query(
        "SELECT code, paused, deleted, updated_at AS updatedAt, updated_by AS updatedBy FROM voucher_state");
      const out = {};
      for (const r of rows || [])
        out[String(r.code || "").toUpperCase()] = {
          paused: !!Number(r.paused), deleted: !!Number(r.deleted),
          updatedAt: r.updatedAt, updatedBy: r.updatedBy };
      return out;
    },
    async voucherStateGet(code) {
      const rows = await this.query(
        "SELECT code, paused, deleted, updated_at AS updatedAt, updated_by AS updatedBy FROM voucher_state WHERE code=?",
        [String(code || "").toUpperCase().slice(0, 40)]);
      const r = rows && rows[0];
      return r ? { paused: !!Number(r.paused), deleted: !!Number(r.deleted),
        updatedAt: r.updatedAt, updatedBy: r.updatedBy } : null;
    },
    async voucherStateSet(code, patch, by) {
      code = String(code || "").toUpperCase().slice(0, 40);
      if (!code) return null;
      patch = patch || {};
      const cur = (await this.voucherStateGet(code)) || {};
      const paused = patch.paused != null ? !!patch.paused : !!cur.paused;
      const deleted = patch.deleted != null ? !!patch.deleted : !!cur.deleted;
      await this.run(
        `INSERT INTO voucher_state (code, paused, deleted, updated_by) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE paused=VALUES(paused), deleted=VALUES(deleted), updated_by=VALUES(updated_by)`,
        [code, paused ? 1 : 0, deleted ? 1 : 0, String(by || "").slice(0, 60)]);
      return { paused, deleted, updatedBy: String(by || "") };
    },
    async voucherClaimCounts() {
      const rows = await this.query(
        "SELECT code, COUNT(*) AS n FROM voucher_redemptions GROUP BY code");
      const out = {};
      for (const r of rows || []) out[String(r.code || "").toUpperCase()] = Number(r.n) || 0;
      return out;
    },
    async voucherClaims(code) {
      return await this.query(
        `SELECT v.account_id AS accountId, a.login AS login, v.created_at AS createdAt
         FROM voucher_redemptions v LEFT JOIN accounts a ON a.id=v.account_id
         WHERE v.code=? ORDER BY v.id DESC LIMIT 500`,
        [String(code || "").toUpperCase().slice(0, 40)]);
    },
    async coinLedgerAdd(row) {
      const r = await this.run(
        `INSERT INTO coin_ledger (account_id, login, kind, delta, coins_after, brl_cents, ref, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [Number(row.accountId), String(row.login || ""), String(row.kind || "other"),
         Math.floor(Number(row.delta) || 0), Math.max(0, Math.floor(Number(row.coinsAfter) || 0)),
         Math.max(0, Math.floor(Number(row.brlCents) || 0)), String(row.ref || ""), String(row.note || "").slice(0, 180)]);
      return { id: r.insertId };
    },
    async coinLedgerList(opts) {
      opts = opts || {};
      const n = Math.max(1, Math.min(500, Number(opts.limit) || 100));
      const rows = opts.accountId != null
        ? await this.query("SELECT * FROM coin_ledger WHERE account_id=? ORDER BY id DESC LIMIT ?", [Number(opts.accountId), n])
        : await this.query("SELECT * FROM coin_ledger ORDER BY id DESC LIMIT ?", [n]);
      return rows.map(hydrateLedger);
    },
    async listAccountCoinSummaries() {
      const rows = await this.query("SELECT id, login, coins, coins_nt, vip_until, role FROM accounts ORDER BY coins DESC LIMIT 500");
      return rows.map((a) => ({
        id: a.id, login: a.login, coins: Number(a.coins) || 0,
        coinsNt: Number(a.coins_nt) || 0,
        vipUntil: Number(a.vip_until) || 0, role: a.role || "user",
      }));
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
    async setAccountEmail(accountId, email) {
      await this.run("UPDATE accounts SET email = ? WHERE id = ?",
        [String(email || "").slice(0, 120), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async setAccountEmailCode(accountId, code, expiresAt) {
      await this.run("UPDATE accounts SET email_code = ?, email_code_expires = ? WHERE id = ?",
        [String(code || ""), Math.max(0, Math.floor(Number(expiresAt) || 0)), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async setAccountEmailVerified(accountId, verified) {
      await this.run("UPDATE accounts SET email_verified = ? WHERE id = ?",
        [verified ? 1 : 0, Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async findAccountByEmail(email) {
      const rows = await this.query("SELECT * FROM accounts WHERE email = ? AND email != ''",
        [String(email || "").slice(0, 120)]);
      return hydrateAccount(rows[0] || null);
    },
    async findAccountBySocial(provider, key) {
      const prov = String(provider || ""), k = String(key || "");
      if (!k || (prov !== "google" && prov !== "twitch")) return null;
      const path = prov === "google" ? "$.google.sub" : "$.twitch.id";
      const rows = await this.query(
        "SELECT a.* FROM accounts a WHERE JSON_UNQUOTE(JSON_EXTRACT(a.social, ?)) = ?",
        [path, k]);
      return hydrateAccount(rows[0] || null);
    },
    async setAccountEmailVerified(accountId, ok) {
      await this.run("UPDATE accounts SET email_verified = ? WHERE id = ?",
        [ok ? 1 : 0, Number(accountId)]);
    },
    async setAccountRecoveryCode(accountId, code, expiresAt) {
      await this.run("UPDATE accounts SET recovery_code = ?, recovery_code_expires = ? WHERE id = ?",
        [String(code || ""), Math.max(0, Math.floor(Number(expiresAt) || 0)), Number(accountId)]);
      return this.findAccountById(accountId);
    },
    async setAccountPassword(accountId, hash) {
      await this.run("UPDATE accounts SET password_hash = ? WHERE id = ?",
        [String(hash || ""), Number(accountId)]);
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
      const rows = await this.query(
        "SELECT id, account_id, name, voc, level, data, save_version, created_at, updated_at FROM characters WHERE account_id = ?",
        [Number(accountId)]);
      const acc = await this.findAccountById(accountId);
      return rows.map((row) => this._applyAccountLevel(row, acc));
    },
    /* Level/exp da CONTA sobre o snapshot do char: level column + data.level/
     * data.exp passam a refletir accounts.level/exp — todos os chars da conta
     * compartilham o mesmo progresso. */
    _applyAccountLevel(row, acc) {
      if (!row || !acc) return row;
      let data = row.data;
      let parsed = null;
      if (typeof data === "string") { try { parsed = JSON.parse(data); } catch (e) {} }
      else if (data && typeof data === "object") parsed = data;
      /* Nunca injeta MENOS que o progresso gravado no próprio char — ver
       * comentário no JsonStore._applyAccountLevel. */
      const level = Math.max(1, Math.floor(Number(acc.level) || 1),
        Math.floor(Number(row.level) || 1), parsed ? Math.floor(Number(parsed.level) || 1) : 1);
      const exp = Math.max(Math.floor(Number(acc.exp) || 0), parsed ? Math.floor(Number(parsed.exp) || 0) : 0);
      row.level = level;
      if (parsed) { parsed.level = level; parsed.exp = exp; row.data = typeof data === "string" ? JSON.stringify(parsed) : parsed; }
      return row;
    },
    async findCharacter(id) {
      const rows = await this.query(
        `SELECT c.*, a.level AS acc_level, a.exp AS acc_exp
           FROM characters c LEFT JOIN accounts a ON a.id = c.account_id WHERE c.id = ?`, [Number(id)]);
      const row = rows[0] || null;
      if (!row) return null;
      const accLevel = Math.max(1, Math.floor(Number(row.acc_level) || 1));
      const accExp = Math.max(0, Math.floor(Number(row.acc_exp) || 0));
      delete row.acc_level; delete row.acc_exp;
      let data = row.data;
      let parsed = null;
      if (typeof data === "string") { try { parsed = JSON.parse(data); } catch (e) {} }
      else if (data && typeof data === "object") parsed = data;
      const level = Math.max(accLevel, Math.floor(Number(row.level) || 1),
        parsed ? Math.floor(Number(parsed.level) || 1) : 1);
      const exp = Math.max(accExp, parsed ? Math.floor(Number(parsed.exp) || 0) : 0);
      row.level = level;
      if (parsed) { parsed.level = level; parsed.exp = exp; row.data = typeof data === "string" ? JSON.stringify(parsed) : parsed; }
      return row;
    },
    /* Nome é único cross-account (checagem do /api/characters). */
    async findCharacterByName(name) {
      const rows = await this.query(
        "SELECT id FROM characters WHERE LOWER(name) = LOWER(?) LIMIT 1",
        [String(name || "")]);
      return rows[0] || null;
    },
    /* Busca cross-account para o painel admin (edição de terceiros). */
    async adminSearchCharacters(query, limit) {
      return this.query(
        `SELECT c.id, c.name, c.voc, c.level, c.account_id, a.login
           FROM characters c JOIN accounts a ON a.id = c.account_id
          WHERE LOWER(c.name) LIKE LOWER(?)
          ORDER BY c.level DESC LIMIT ?`,
        ["%" + String(query || "") + "%", Math.max(1, Math.min(50, Number(limit) || 25))]);
    },
    async banList() {
      return this.query("SELECT * FROM bans ORDER BY id DESC LIMIT 200");
    },
    async banActiveForAccount(accountId, now) {
      const rows = await this.query(
        `SELECT * FROM bans WHERE account_id=? AND lifted_at IS NULL
           AND (until IS NULL OR until > ?) ORDER BY id DESC LIMIT 1`,
        [Number(accountId), new Date(now || Date.now())]);
      return rows[0] || null;
    },
    async banCreate(entry) {
      const r = await this.run(
        `INSERT INTO bans (account_id, character_id, char_name, reason, until, banned_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [Number(entry.accountId), entry.characterId ? Number(entry.characterId) : null,
         String(entry.charName || "").slice(0, 40), String(entry.reason || "").slice(0, 300),
         entry.until ? new Date(entry.until) : null,
         String(entry.by || "admin").slice(0, 80)]);
      const rows = await this.query("SELECT * FROM bans WHERE id=?", [r.insertId]);
      return rows[0] || null;
    },
    async banLift(banId, by) {
      await this.run("UPDATE bans SET lifted_at=NOW(3), lifted_by=? WHERE id=? AND lifted_at IS NULL",
        [String(by || "admin").slice(0, 80), Number(banId)]);
      const rows = await this.query("SELECT * FROM bans WHERE id=?", [Number(banId)]);
      return rows[0] || null;
    },
    async revokeAccountSessions(accountId) {
      const result = await this.run("DELETE FROM sessions WHERE account_id=?", [Number(accountId)]);
      return result.affectedRows || 0;
    },
    /* Mutes de chat persistidos — CHAT_BUS hidrata no boot e grava a cada
     * mute/unmute. `until` é BIGINT ms epoch (mesmo formato do CHAT_BUS). */
    async chatMuteList() {
      const rows = await this.query(
        "SELECT account_id AS accountId, until, `by`, reason, char_name AS charName, at FROM chat_mutes WHERE `until` > ?", [Date.now()]);
      return rows;
    },
    async chatMuteSet(m) {
      await this.run(
        `INSERT INTO chat_mutes (account_id, \`until\`, \`by\`, reason, char_name, at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE \`until\`=VALUES(\`until\`), \`by\`=VALUES(\`by\`),
           reason=VALUES(reason), char_name=VALUES(char_name), at=VALUES(at)`,
        [Number(m.accountId), Number(m.until) || 0, String(m.by || "admin"),
         String(m.reason || ""), String(m.charName || ""), Number(m.at) || Date.now()]);
      return m;
    },
    async chatMuteDelete(accountId) {
      const result = await this.run("DELETE FROM chat_mutes WHERE account_id=?", [Number(accountId)]);
      return result.affectedRows || 0;
    },
    /* Calendário global — um evento por linha, escrita só via admin. */
    async calendarList() {
      return this.query(
        "SELECT id, DATE_FORMAT(day,'%Y-%m-%d') AS day, title, body, kind, created_by, created_at FROM calendar_events ORDER BY day ASC, id ASC");
    },
    async calendarAdd(ev) {
      const result = await this.run(
        "INSERT INTO calendar_events (day,title,body,kind,created_by,created_at) VALUES (?,?,?,?,?,?)",
        [String(ev.day || "").slice(0, 10), String(ev.title || "").slice(0, 80),
         String(ev.body || "").slice(0, 500), ev.kind === "meta" ? "meta" : "evento",
         String(ev.created_by || "admin"), Date.now()]);
      return { id: result.insertId, day: String(ev.day || "").slice(0, 10),
        title: String(ev.title || ""), body: String(ev.body || ""),
        kind: ev.kind === "meta" ? "meta" : "evento" };
    },
    async calendarUpdate(id, ev) {
      const sets = [], vals = [];
      if (ev.day != null) { sets.push("day=?"); vals.push(String(ev.day).slice(0, 10)); }
      if (ev.title != null) { sets.push("title=?"); vals.push(String(ev.title).slice(0, 80)); }
      if (ev.body != null) { sets.push("body=?"); vals.push(String(ev.body).slice(0, 500)); }
      if (ev.kind != null) { sets.push("kind=?"); vals.push(ev.kind === "meta" ? "meta" : "evento"); }
      if (!sets.length) return null;
      vals.push(Number(id));
      const result = await this.run(`UPDATE calendar_events SET ${sets.join(",")} WHERE id=?`, vals);
      return result.affectedRows ? { id: Number(id) } : null;
    },
    async calendarDelete(id) {
      const result = await this.run("DELETE FROM calendar_events WHERE id=?", [Number(id)]);
      return result.affectedRows || 0;
    },
    /* Instâncias ativas com nomes de membros — alimenta a aba RAID do admin. */
    async instanceListActive() {
      const rows = await this.query(
        "SELECT * FROM account_instances WHERE status='active' ORDER BY started_at DESC LIMIT 200");
      const out = [];
      for (const row of rows) {
        let state = null;
        try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
        const memberIds = (((state || {}).members) || []).map((m) => Number(m && m.id)).filter((id) => id > 0);
        let members = [];
        if (memberIds.length) {
          const marks = memberIds.map(() => "?").join(",");
          const chars = await this.query(
            `SELECT id, name, level FROM characters WHERE id IN (${marks})`, memberIds);
          const byId = new Map(chars.map((c) => [Number(c.id), c]));
          members = ((state || {}).members || []).map((m) => {
            const ch = byId.get(Number(m && m.id));
            return { id: Number(m && m.id) || null,
              name: (m && m.p && m.p.name) || (ch && ch.name) || "#" + m.id,
              level: Number((m && m.p && m.p.level) || (ch && ch.level)) || 0,
              hp: Number(m && m.hp) || 0 };
          });
        }
        const [accRows] = [await this.query("SELECT login FROM accounts WHERE id=?", [Number(row.account_id)])];
        out.push({ instance_id: row.instance_id, account_id: Number(row.account_id),
          kind: row.kind, hunt_id: row.hunt_id || null, boss_id: row.boss_id || null,
          party_id: row.party_id ? Number(row.party_id) : null,
          started_at: row.started_at, saved_at: row.saved_at,
          version: Number(row.version) || 0,
          login: (accRows[0] || {}).login || "", members });
      }
      return out;
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
    async trainingCheckpoint(accountId, ids, sessionId, now, lease, advance, stop) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (!lease || !await lockValidLease(conn, accountId, lease)) {
          await conn.rollback(); return { ok: false, error: "LEASE_REQUIRED" };
        }
        const [instances] = await conn.query("SELECT status FROM account_instances WHERE account_id=? FOR UPDATE", [Number(accountId)]);
        if (instances.some((row) => row.status === "active")) {
          await conn.rollback(); return { ok: false, error: "TRAINING_IN_COMBAT" };
        }
        const marks = ids.map(() => "?").join(",");
        const [rows] = await conn.query(`SELECT * FROM characters WHERE account_id=? AND id IN (${marks}) ORDER BY id FOR UPDATE`, [Number(accountId), ...ids]);
        if (rows.length !== ids.length) { await conn.rollback(); return { ok: false, error: "CHARACTER_NOT_FOUND" }; }
        if (rows.some((row) => ["hunt", "boss"].includes(row.zone))) {
          await conn.rollback(); return { ok: false, error: "TRAINING_IN_COMBAT" };
        }
        /* FOR UPDATE na row da conta: a tx escreve shared_inventory no fim —
         * sem o lock, um accountSharedInventoryMutate concorrente (claim de
         * reward/equip) entre o read e o write era sobrescrito pelo blob
         * velho (reward "voltava", item sumia). */
        const [accounts] = await conn.query("SELECT vip_until FROM accounts WHERE id=? FOR UPDATE", [Number(accountId)]);
        /* Stamina da CONTA: pool (shared.stamina) espelhado em cada p antes
         * do advance — o regen interno materializa a janela uma única vez
         * (1s/s ativo, 0,5 ocioso) e a extração devolve com carimbo. */
        const shared = SharedInv ? await this.accountSharedInventory(Number(accountId)) : null;
        if (shared && !shared.stamina) {
          const seedRow = rows.map((r) => SharedInv.charDataOf(r))
            .find((d) => d && Number.isFinite(Number(d.stamina)));
          if (seedRow) SharedInv.regenSharedStamina(shared, Number(seedRow.staminaAt) || now, 0, seedRow.stamina);
        }
        const advances = [];
        for (const row of rows) {
          const p = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
          p.voc = row.voc;
          if (shared && shared.stamina) SharedInv.applySharedStamina(p, shared);
          const result = advance(p, now, sessionId, Number(accounts[0].vip_until) > now, lease.holderId, stop);
          if (shared) SharedInv.extractSharedStamina(p, shared);
          row.data = JSON.stringify(p);
          row.save_version = Number(row.save_version || 0) + 1;
          await conn.query("UPDATE characters SET data=?,save_version=save_version+1 WHERE id=? AND account_id=?",
            [row.data, Number(row.id), Number(accountId)]);
          advances.push(...result.advances.map((a) => Object.assign({ id: row.id }, a)));
        }
        if (shared)
          await conn.query("UPDATE accounts SET shared_inventory=? WHERE id=?",
            [JSON.stringify(SharedInv.normalizeSharedInventory(shared)), Number(accountId)]);
        await conn.commit();
        return { ok: true, characters: rows, advances };
      } catch (error) { try { await conn.rollback(); } catch (e) {} throw error; }
      finally { conn.release(); }
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
      return hydrateAccount(rows[0] || null);
    },
    async createSession(accountId, token, expiresAt) {
      await this.run("DELETE FROM sessions WHERE account_id=?",[Number(accountId)]);
      await this.run("INSERT INTO sessions (account_id,token,expires_at) VALUES (?,?,?)",
        [Number(accountId),token,expiresAt?new Date(expiresAt):null]);
    },
    async revokeSession(token){const result=await this.run("DELETE FROM sessions WHERE token=?",[String(token)]);return result.affectedRows>0;},
    async pruneExpiredSessions(now){const result=await this.run("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at<=?",[new Date(now)]);return result.affectedRows;},
    /* Limpeza de BOOT (ver JsonStore.expireAllLeases/endAllInstances). */
    async expireAllLeases(){
      const result=await this.run("DELETE FROM account_leases");
      return result.affectedRows||0;
    },
    async endAllInstances(reason,keepInstanceIds){
      const clean=String(reason||"server-restart").replace(/[^a-z0-9_-]/gi,"").slice(0,40)||"server-restart";
      const keep=(keepInstanceIds||[]).map(String);
      const result=await this.run(
        "UPDATE account_instances SET status='ended', terminal_reason=?, ended_at=NOW(), "+
        "worker_cursor_at=NOW(), version=version+1, updated_at=NOW() WHERE status='active'"+
        (keep.length?" AND instance_id NOT IN ("+keep.map(()=>"?").join(",")+")":""),[clean].concat(keep));
      return result.affectedRows||0;
    },
    async instancePvpResume(accountId,instanceId,state,now){
      const at=new Date(Number(now)||Date.now());
      const result=await this.run(
        "UPDATE account_instances SET state=?, version=version+1, saved_at=?, worker_cursor_at=?, updated_at=? "+
        "WHERE account_id=? AND instance_id=? AND status='active'",
        [state,at,at,at,Number(accountId),String(instanceId)]);
      return {ok:(result.affectedRows||0)>0};
    },
    /* Worker/tick de instância compartilhada (PvP/World Boss) segura gap
     * locks em account_leases: o INSERT do lease de outra conta pode cair em
     * deadlock (40001). A transação é idempotente — repete até 3x. */
    async leaseAcquire(...args){
      for(let attempt=0;;attempt++){
        try{return await this._leaseAcquireOnce(...args);}
        catch(error){if(!(error&&error.code==="ER_LOCK_DEADLOCK")||attempt>=2)throw error;
          await new Promise((r)=>setTimeout(r,25+Math.floor(Math.random()*50)));}
      }
    },
    async _leaseAcquireOnce(accountId,holderId,previousHolderId,presentedHash,newHash,now,expiresAt){
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
    // Mesma linha sem o blob `state` (pode ter ~5MB em batalhas PvP) —
    // para checagens de rota que só precisam de metadados.
    async instanceGetHead(accountId){
      const rows=await this.query(
        `SELECT account_id,instance_id,version,status,kind,hunt_id,boss_id,instance_mode,party_id,party_version,
           active_character_id,saved_at,started_at,worker_cursor_at,worker_total_ms,ended_at,terminal_reason
           FROM account_instances WHERE account_id=?`,[Number(accountId)]);
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
        state=await syncBlessWallets(conn,state);
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
    async instancePatchState(ownerAccountId,requesterAccountId,instanceId,expectedVersion,patchState,lease,opts){
      /* Caminho quente (batalha PvP / world boss): o descritor vivo está em
       * memória — o provider (instanceHotAuthApi, injetado pelo server.js)
       * o entrega e o mutex por conta-dono serializa com os ticks. Sem isso
       * o patch parseava+serializava ~5MB segurando a row lock enquanto ~15
       * contas tickavam a mesma row — collect/equip ficavam atrás na fila
       * ("servidor trava"). A checagem de versão não se aplica no hit: o
       * descritor vivo É a autoridade atual — quem valida é a própria
       * mutação contra o estado real. */
      const hotApi=opts&&"hotAuth"in opts?opts.hotAuth
        :(typeof this.instanceHotAuthApi==="function"?this.instanceHotAuthApi():null);
      const serialize=(opts&&opts.serialize)||this.instanceAuthSerialize||((key,fn)=>fn());
      const runPatch=async()=>{
        const conn=await pool.getConnection();
        try{await conn.beginTransaction();
          if(!await lockValidLease(conn,requesterAccountId,lease)){await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};}
          if(hotApi){
            const [rows]=await conn.query(
              "SELECT account_id,instance_id,version,status,kind,hunt_id,boss_id,instance_mode,party_id,party_version,active_character_id,saved_at,started_at,worker_cursor_at,worker_total_ms,ended_at,terminal_reason FROM account_instances WHERE account_id=?",
              [Number(ownerAccountId)]),row=rows[0];
            if(!row||row.status!=="active"){await conn.rollback();return {ok:false,error:"INSTANCE_NOT_ACTIVE"};}
            if(String(row.instance_id)!==String(instanceId||"")){
              await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};}
            /* Gate: só entra no caminho quente se a instância JÁ está no
             * cache (world boss/pvp são semeados no create/1º tick). Sem o
             * peek, hotApi.get SEMEARIA uma hunt/boss normal — o patch
             * ficaria só em memória, sem tick para persistir = perda. */
            if(typeof hotApi.peek!=="function"||hotApi.peek(row)){
              const hot=await hotApi.get(row,conn);
              if(hot){
                const next=patchState(hot.descriptor);
                if(!next){await conn.rollback();return {ok:false,error:"INSTANCE_PATCH_REJECTED",instance:Object.assign({},row,{state:hot.descriptor})};}
                hot.descriptor=typeof next==="string"?JSON.parse(next):next;
                hot.dirty=true;hot.savedAt=0;
                await conn.commit();
                return {ok:true,instance:Object.assign({},row,{state:hot.descriptor})};
              }
            }
            // Sem cache vivo (hunt/boss normal): caminho da row.
          }
          const [rows]=await conn.query("SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(ownerAccountId)]),row=rows[0];
          if(!row||row.status!=="active"){await conn.rollback();return {ok:false,error:"INSTANCE_NOT_ACTIVE"};}
          if(String(row.instance_id)!==String(instanceId||"")||Number(row.version)!==Number(expectedVersion)){
            await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};}
          const next=patchState(row.state);if(!next){await conn.rollback();return {ok:false,error:"INSTANCE_PATCH_REJECTED",instance:row};}
          await conn.query("UPDATE account_instances SET state=?,version=version+1,updated_at=? WHERE account_id=?",
            [next,new Date(lease?lease.now:Date.now()),Number(ownerAccountId)]);
          const [saved]=await conn.query("SELECT * FROM account_instances WHERE account_id=?",[Number(ownerAccountId)]);
          await conn.commit();return {ok:true,instance:saved[0]};
        }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
      };
      return hotApi?serialize(Number(ownerAccountId),runPatch):runPatch();
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
        if(/^(world-boss-wz[1-6]|world-devourer|the-pale-worm|goshnar-s-megalomania)$/.test(String(row.boss_id||""))){
          const wb=typeof global.__WORLD_BOSS!=="undefined"?global.__WORLD_BOSS:null;
          const ids=wb&&typeof wb.joinedAccountIds==="function"?wb.joinedAccountIds().map(Number).filter((id)=>id>0):[];
          if(ids.length){
            const marks=ids.map(()=>"?").join(",");
            const [live]=await conn.query(
              `SELECT account_id FROM account_leases WHERE account_id IN (${marks}) AND expires_at>? LIMIT 1`,
              ids.concat([new Date(now)]));
            if(live&&live.length){
              await conn.rollback();return {ok:false,skipped:"wb-member-leased"};
            }
          }
        }
        const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
        const elapsed=Math.min(Math.max(0,now-cursor),Math.max(1,Number(maxStep)||3600000));
        if(elapsed<Math.max(1,Number(minStep)||500)){
          await conn.rollback();return {ok:false,skipped:"not-due"};
        }
        const checkpoint=cursor+elapsed,advanced=advanceState(row.state,elapsed,checkpoint);
        const next=advanced&&typeof advanced==="object"&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
        next.state=await syncBlessWallets(conn,next.state);
        const dirty=SharedInv?pouchDirtyScan(next):{pouch:new Set(),forge:new Set()};
        // Inventário da conta: tick terminal extrai containers para o shared
        // (o worker só roda sem lease; instância própria concorrente é rara,
        // mas contas de convidados com instância ativa são preservadas).
        const sharedByAcc=new Map(),sharedMirror=new Map();
        if((next.terminalReason||dirty.pouch.size||dirty.forge.size)&&SharedInv&&(next.characters||[]).length){
          const tickInstanceId=String(row.instance_id||"");
          for(const projection of next.characters||[]){
            const [acctRows]=await conn.query("SELECT account_id FROM characters WHERE id=?",[Number(projection.id)]);
            const aid=acctRows[0]?Number(acctRows[0].account_id):null;if(!aid)continue;
            if(aid!==Number(accountId)){
              const [instRows]=await conn.query(
                "SELECT instance_id FROM account_instances WHERE account_id=? AND status='active' LIMIT 1",[aid]);
              if(instRows.length&&String(instRows[0].instance_id)!==tickInstanceId)continue;
            }
            let shared=sharedByAcc.get(aid);
            const firstAcc=!shared;
            if(!shared){
              let s=null;
              const [srows]=await conn.query("SELECT shared_inventory FROM accounts WHERE id=? FOR UPDATE",[aid]);
              if(srows[0]&&srows[0].shared_inventory){try{s=JSON.parse(srows[0].shared_inventory);}catch(e){}}
              shared=s&&s.v===1?s:SharedInv.emptySharedInventory();
              sharedByAcc.set(aid,shared);
            }
            if(next.terminalReason)
              sharedMirror.set(Number(projection.id),sharedInvExtractMirror(shared,projection.data,true,firstAcc));
            else{
              if(dirty.pouch.has(Number(projection.id)))sharedInvPouchDirtyFlush(shared,projection.data);
              if(dirty.forge.has(Number(projection.id)))sharedInvForgeDirtyFlush(shared,projection.data);
            }
          }
        }
        for(const projection of next.characters||[])await conn.query(
          `UPDATE characters SET data=?,level=?,voc=?,hp=?,mp=?,max_hp=?,max_mp=?,save_version=save_version+1
           WHERE id=?`,
          [sharedMirror.get(Number(projection.id))||projection.data,projection.level,projection.voc,projection.hp,
           projection.mp,projection.max_hp,projection.max_mp,Number(projection.id)]);
        // Guild tasks: instância ociosa também credita kills (mesma txn).
        for(const projection of next.characters||[]){
          const tk=projection&&projection.taskKills;
          if(!tk||typeof tk!=="object")continue;
          try{
            const [accRows]=await conn.query("SELECT account_id FROM characters WHERE id=?",[Number(projection.id)]);
            const aid=accRows[0]&&Number(accRows[0].account_id);
            if(aid)await this.guildCreditKills(aid,tk,conn);
          }catch(e){console.error("[guild] credit kills:",e&&e.message);}
        }
        for(const [aid,shared] of sharedByAcc.entries())
          await conn.query("UPDATE accounts SET shared_inventory=? WHERE id=?",[JSON.stringify(shared),aid]);
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
    async instanceAuthorityTick(accountId,expectedVersion,now,maxStep,advanceState,lease,opts){
      const conn=await pool.getConnection();
      const leaseAcc=(opts&&opts.leaseAccountId!=null)?opts.leaseAccountId:accountId;
      // Batalha PvP compartilhada: `opts.hotAuth` mantém o descritor vivo em
      // memória. Cada request deixa de ler/gravar ~5MB — SELECT leve sem o
      // blob, avanço in-place e persist do blob só a cada PVP_AUTH_PERSIST_MS
      // (ou no fim). `version` só sobe nas escritas reais: drift de versão
      // sinaliza escrita externa (patch/checkpoint) e força recarga.
      const hotApi=opts&&opts.hotAuth;
      try{
        await conn.beginTransaction();
        if(!await lockValidLease(conn,leaseAcc,lease)){
          await conn.rollback();return {ok:false,error:"LEASE_REQUIRED"};
        }
        /* Caminho quente: SEM FOR UPDATE — a serialização já é o mutex
         * in-process do caller (a lock segurada durante o avanço afogava
         * o pool com ~35 req/s na mesma row). Drift externo segue por
         * `version` (recarga) + CAS no persist. */
        const [rows]=await conn.query(hotApi
          ?`SELECT account_id,instance_id,version,status,kind,hunt_id,boss_id,instance_mode,party_id,party_version,active_character_id,saved_at,started_at,worker_cursor_at,worker_total_ms,ended_at,terminal_reason FROM account_instances WHERE account_id=?`
          :"SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        const row=rows[0];if(!row||row.status!=="active"){
          await conn.rollback();return {ok:false,error:"INSTANCE_NOT_ACTIVE"};
        }
        if(expectedVersion!==null&&expectedVersion!==undefined&&Number(row.version)!==Number(expectedVersion)){
          // Resposta de resync precisa do estado — busca quente ou blob.
          if(hotApi){const h=await hotApi.get(row,conn);row.state=h?h.descriptor:null;}
          await conn.rollback();return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
        }
        const cursor=new Date(row.worker_cursor_at||row.saved_at).getTime()||now;
        const elapsed=Math.min(Math.max(0,now-cursor),Math.max(100,Number(maxStep)||10000));
        const hot=hotApi?await hotApi.get(row,conn):null;
        if(elapsed<50){await conn.commit();return {ok:true,
          instance:hot?Object.assign({},row,{state:hot.descriptor}):row,characters:[],elapsed:0};}
        const advanced=advanceState(hot?hot.descriptor:row.state,elapsed,now,hot||undefined),next=advanced&&advanced.state!==undefined?advanced:{state:advanced,characters:[]};
        const dirty=SharedInv?pouchDirtyScan(next):{pouch:new Set(),forge:new Set()};
        /* Caminho quente: a cauda pesada (locks FOR UPDATE em characters/
         * accounts + writes por projeção) roda SÓ quando há o que persistir
         * — terminal, pouch/forge sujos, ou o checkpoint do blob a cada
         * persistMs. World boss: ~15 contas tickando a MESMA row antes
         * seguravam ~60 locks por ~300ms cada — todo clique (claim/equip/
         * save) esperava na fila ("servidor trava"). Entre persists o tick
         * só avança o descritor vivo + move o cursor. taskKills das janelas
         * puladas acumulam no `hot` e entram no próximo persist. */
        const persistMs=Number(hotApi&&hotApi.persistMs)||4000;
        const heavy=!hot||!!next.terminalReason||dirty.pouch.size>0||dirty.forge.size>0||
          (now-(Number(hot.savedAt)||0))>=persistMs||hot.dirty===true;
        if(hot){
          if(hot.taskKills===undefined)hot.taskKills=null;
          if(!heavy){
            for(const projection of next.characters||[]){
              const tk=projection&&projection.taskKills;
              if(!tk||typeof tk!=="object")continue;
              const acc=hot.taskKills||(hot.taskKills=new Map());
              const cur=acc.get(Number(projection.id))||{};
              for(const k of Object.keys(tk))cur[k]=(Number(cur[k])||0)+(Number(tk[k])||0);
              acc.set(Number(projection.id),cur);
            }
          }else if(hot.taskKills){
            for(const projection of next.characters||[]){
              const acc=hot.taskKills.get(Number(projection.id));
              if(!acc)continue;
              const tk=projection.taskKills&&typeof projection.taskKills==="object"?projection.taskKills:{};
              for(const k of Object.keys(acc))tk[k]=(Number(tk[k])||0)+(Number(acc[k])||0);
              projection.taskKills=tk;
            }
            hot.taskKills=null;
          }
        }
        if(heavy)next.state=await syncBlessWallets(conn,next.state);
        // Inventário da conta: no tick TERMINAL, extrai bag/lootPouch/depot dos
        // personagens para accounts.shared_inventory e espelha o shared no data
        // salvo de cada um (containers são da conta, não do personagem).
        const sharedByAcc=new Map(),sharedMirror=new Map();
        if(heavy&&(next.terminalReason||dirty.pouch.size||dirty.forge.size)&&SharedInv&&(next.characters||[]).length){
          const tickInstanceId=String(row.instance_id||"");
          for(const projection of next.characters||[]){
            const [acctRows]=await conn.query("SELECT account_id FROM characters WHERE id=?",[Number(projection.id)]);
            const aid=acctRows[0]?Number(acctRows[0].account_id):null;if(!aid)continue;
            if(aid!==Number(accountId)){
              // Convidado: preserva se a conta tiver OUTRA instância ativa
              // (corrida rara: 2 chars da mesma conta em instâncias distintas).
              const [instRows]=await conn.query(
                "SELECT instance_id FROM account_instances WHERE account_id=? AND status='active' LIMIT 1",[aid]);
              if(instRows.length&&String(instRows[0].instance_id)!==tickInstanceId)continue;
            }
            let shared=sharedByAcc.get(aid);
            const firstAcc=!shared;
            if(!shared){
              let s=null;
              const [srows]=await conn.query("SELECT shared_inventory FROM accounts WHERE id=? FOR UPDATE",[aid]);
              if(srows[0]&&srows[0].shared_inventory){try{s=JSON.parse(srows[0].shared_inventory);}catch(e){}}
              shared=s&&s.v===1?s:SharedInv.emptySharedInventory();
              sharedByAcc.set(aid,shared);
            }
            if(next.terminalReason)
              sharedMirror.set(Number(projection.id),sharedInvExtractMirror(shared,projection.data,true,firstAcc));
            else{
              if(dirty.pouch.has(Number(projection.id)))sharedInvPouchDirtyFlush(shared,projection.data);
              if(dirty.forge.has(Number(projection.id)))sharedInvForgeDirtyFlush(shared,projection.data);
            }
          }
        }
        if(heavy)for(const projection of next.characters||[])await conn.query(
          `UPDATE characters SET data=?,level=?,voc=?,hp=?,mp=?,max_hp=?,max_mp=?,save_version=save_version+1
           WHERE id=?`,
          [sharedMirror.get(Number(projection.id))||projection.data,projection.level,projection.voc,projection.hp,projection.mp,
           projection.max_hp,projection.max_mp,Number(projection.id)]);
        // Guild tasks: o engine emite taskKills por projeção (delta da
        // janela) — credita nas tasks do dia da conta, mesma transação.
        if(heavy)for(const projection of next.characters||[]){
          const tk=projection&&projection.taskKills;
          if(!tk||typeof tk!=="object")continue;
          try{
            const [accRows]=await conn.query("SELECT account_id FROM characters WHERE id=?",[Number(projection.id)]);
            const aid=accRows[0]&&Number(accRows[0].account_id);
            if(aid)await this.guildCreditKills(aid,tk,conn);
          }catch(e){console.error("[guild] credit kills:",e&&e.message);}
        }
        for(const [aid,shared] of sharedByAcc.entries())
          await conn.query("UPDATE accounts SET shared_inventory=? WHERE id=?",[JSON.stringify(shared),aid]);
        // Gold é por conta: propaga o saldo autoritativo para accounts.gold.
        const walletByAcc=new Map();
        if(heavy)for(const projection of next.characters||[]){
          const [chars]=await conn.query("SELECT account_id FROM characters WHERE id=?",[Number(projection.id)]);
          if(!chars[0])continue;
          let data={};try{data=typeof projection.data==="string"?JSON.parse(projection.data):(projection.data||{});}catch(e){}
          walletByAcc.set(Number(chars[0].account_id),Math.max(0,Math.floor(Number(data.gold)||0)));
        }
        for(const [aid,gold] of walletByAcc.entries()){
          await conn.query("UPDATE accounts SET gold=?, gold_migrated=1 WHERE id=?",[gold,aid]);
          const [siblings]=await conn.query("SELECT id, data FROM characters WHERE account_id=? FOR UPDATE",[aid]);
          for(const sib of siblings){
            let sd={};try{sd=typeof sib.data==="string"?JSON.parse(sib.data):(sib.data||{});}catch(e){sd={};}
            sd.gold=gold;
            await conn.query("UPDATE characters SET data=? WHERE id=?",[JSON.stringify(sd),Number(sib.id)]);
          }
        }
        if(hot){
          /* Caminho quente: grava o blob só a cada hotApi.persistMs (ou no
           * fim) — os ~5MB deixam de circular a cada tick de cada cliente.
           * Entre persists só o cursor avança (sem bump de version: o cliente
           * deixa de tomar VERSION_CONFLICT a cada tick alheio). */
          const persist=!!next.terminalReason||(now-(Number(hot.savedAt)||0))>=persistMs||hot.dirty===true;
          if(persist){
            hot.dirty=false;
            const str=typeof next.state==="string"?next.state:JSON.stringify(next.state);
            /* CAS por version: sem FOR UPDATE, uma escrita externa (checkpoint,
             * patch) podia commitar entre a leitura da head e este UPDATE.
             * Se alguém bumpou a versão, devolvemos conflito — o tick seguinte
             * recarrega o descritor pelo drift detect. */
            const [upd]=await conn.query(
              `UPDATE account_instances SET state=?,version=version+1,saved_at=?,worker_cursor_at=?,status=?,
                 terminal_reason=?,ended_at=? WHERE account_id=? AND version=?`,
              [str,new Date(now),new Date(now),next.terminalReason?"ended":"active",next.terminalReason||null,
               next.terminalReason?new Date(now):null,Number(accountId),Number(row.version)]);
            if(!upd.affectedRows){
              if(typeof hotApi.drop==="function")hotApi.drop(row.instance_id);
              await conn.rollback();
              return {ok:false,error:"INSTANCE_VERSION_CONFLICT",instance:row};
            }
            hot.rowVersion=Number(row.version)+1;hot.savedAt=now;
          }else{
            await conn.query("UPDATE account_instances SET worker_cursor_at=? WHERE account_id=?",
              [new Date(now),Number(accountId)]);
          }
          if(next.terminalReason&&typeof hotApi.drop==="function")hotApi.drop(row.instance_id);
          const saved=Object.assign({},row,{version:persist?Number(row.version)+1:Number(row.version),
            status:next.terminalReason?"ended":"active",terminal_reason:next.terminalReason||null,
            worker_cursor_at:new Date(now),saved_at:new Date(Number(hot.savedAt)||now),
            ended_at:next.terminalReason?new Date(now):row.ended_at,
            state:hot.descriptor});
          const ids=(next.characters||[]).map((p)=>Number(p.id));let characters=[];
          if(heavy&&ids.length){const marks=ids.map(()=>"?").join(",");[characters]=await conn.query(
            `SELECT * FROM characters WHERE id IN (${marks})`,ids);}
          await conn.commit();return {ok:true,instance:saved,characters,elapsed,terminalReason:next.terminalReason||null};
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
    async instanceEndMegaOrphan(accountId,instanceId,reason){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const [rows]=await conn.query(
          "SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        const current=rows[0]||null;
        if(!current||current.status!=="active"){
          await conn.commit();return {ok:true,instance:current,alreadyEnded:true};
        }
        if(String(current.boss_id||"")!=="goshnar-s-megalomania"){
          await conn.rollback();return {ok:false,error:"NOT_MEGA_INSTANCE",instance:current};
        }
        if(instanceId&&String(current.instance_id)!==String(instanceId)){
          await conn.rollback();return {ok:false,error:"INSTANCE_ID_MISMATCH",instance:current};
        }
        const now=new Date();
        await conn.query(
          "UPDATE account_instances SET version=version+1,status='ended',terminal_reason=?,ended_at=?,updated_at=? WHERE account_id=?",
          [reason||"mega-lobby-empty",now,now,Number(accountId)]);
        current.version=Number(current.version)+1;current.status="ended";
        current.terminal_reason=reason||"mega-lobby-empty";current.ended_at=now;
        await conn.commit();return {ok:true,instance:current};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },
    async instanceEndForced(accountId,reason){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const [rows]=await conn.query(
          "SELECT * FROM account_instances WHERE account_id=? FOR UPDATE",[Number(accountId)]);
        const current=rows[0]||null;
        if(!current||current.status!=="active"){
          await conn.commit();return {ok:true,instance:current,alreadyEnded:true};
        }
        const now=new Date();
        await conn.query(
          "UPDATE account_instances SET version=version+1,status='ended',terminal_reason=?,ended_at=?,updated_at=? WHERE account_id=?",
          [reason||"forced-end",now,now,Number(accountId)]);
        current.version=Number(current.version)+1;current.status="ended";
        current.terminal_reason=reason||"forced-end";current.ended_at=now;
        await conn.commit();return {ok:true,instance:current};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },
    async instanceReplaceForced(accountId,instanceId,meta,state){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const savedAt=meta.saved_at||new Date();
        const startedAt=meta.started_at||meta.startedAt||savedAt||new Date();
        await conn.query(
          `INSERT INTO account_instances
           (account_id,instance_id,version,status,kind,hunt_id,boss_id,instance_mode,party_id,
            party_version,active_character_id,state,saved_at,started_at,worker_cursor_at,worker_total_ms)
           VALUES (?,?,1,'active',?,?,?,?,?,?,?,?,?,?,?,0)
           ON DUPLICATE KEY UPDATE instance_id=VALUES(instance_id),version=1,status='active',kind=VALUES(kind),
            hunt_id=VALUES(hunt_id),boss_id=VALUES(boss_id),instance_mode=VALUES(instance_mode),
            party_id=NULL,party_version=NULL,
            active_character_id=VALUES(active_character_id),state=VALUES(state),saved_at=VALUES(saved_at),
            started_at=VALUES(started_at),worker_cursor_at=VALUES(worker_cursor_at),worker_total_ms=0,
            ended_at=NULL,terminal_reason=NULL`,
          [Number(accountId),instanceId,meta.kind,meta.hunt_id||null,meta.boss_id,meta.instance_mode,
           null,null,meta.active_character_id,state,savedAt,startedAt,savedAt]);
        const [saved]=await conn.query("SELECT * FROM account_instances WHERE account_id=?",[Number(accountId)]);
        await conn.commit();return {ok:true,instance:saved[0]};
      }catch(error){try{await conn.rollback();}catch(e){}throw error;}finally{conn.release();}
    },
    async instanceTransferOwner(fromAccountId, toAccountId) {
      const fromId = Number(fromAccountId), toId = Number(toAccountId);
      if (!fromId || !toId || fromId === toId) return { ok: false, error: "INVALID_TRANSFER" };
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [fromRows] = await conn.query(
          "SELECT * FROM account_instances WHERE account_id=? FOR UPDATE", [fromId]);
        const from = fromRows[0];
        if (!from || from.status !== "active") {
          await conn.rollback();
          return { ok: false, error: "NO_INSTANCE" };
        }
        const [toRows] = await conn.query(
          "SELECT * FROM account_instances WHERE account_id=? FOR UPDATE", [toId]);
        const existing = toRows[0];
        if (existing && existing.status === "active") {
          await conn.query(
            "UPDATE account_instances SET version=version+1,status='ended',terminal_reason=?,ended_at=?,updated_at=? WHERE account_id=?",
            ["mega-replaced-by-transfer", new Date(), new Date(), toId]);
        }
        await conn.query(
          `INSERT INTO account_instances
            (account_id,instance_id,version,status,kind,hunt_id,boss_id,instance_mode,party_id,
             party_version,active_character_id,state,saved_at,started_at,worker_cursor_at,worker_total_ms)
           VALUES (?,?,?, 'active',?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE instance_id=VALUES(instance_id),version=VALUES(version),status='active',
             kind=VALUES(kind),hunt_id=VALUES(hunt_id),boss_id=VALUES(boss_id),
             instance_mode=VALUES(instance_mode),party_id=VALUES(party_id),
             party_version=VALUES(party_version),active_character_id=VALUES(active_character_id),
             state=VALUES(state),saved_at=VALUES(saved_at),started_at=VALUES(started_at),
             worker_cursor_at=VALUES(worker_cursor_at),worker_total_ms=VALUES(worker_total_ms),
             ended_at=NULL,terminal_reason=NULL`,
          [toId, from.instance_id, from.version, from.kind, from.hunt_id, from.boss_id,
           from.instance_mode, from.party_id, from.party_version, from.active_character_id,
           from.state, from.saved_at, from.started_at, from.worker_cursor_at,
           Number(from.worker_total_ms) || 0]);
        await conn.query(
          "UPDATE account_instances SET version=version+1,status='ended',terminal_reason=?,ended_at=?,updated_at=? WHERE account_id=?",
          ["mega-ownership-transferred", new Date(), new Date(), fromId]);
        const [saved] = await conn.query("SELECT * FROM account_instances WHERE account_id=?", [toId]);
        await conn.commit();
        return { ok: true, instance: saved[0], fromAccountId: fromId, toAccountId: toId };
      } catch (error) {
        try { await conn.rollback(); } catch (e) {}
        throw error;
      } finally {
        conn.release();
      }
    },

    // ---- MARKET P2P ----
    async createMarketOffer(offer) {
      const r = await this.run(
        `INSERT INTO market_offers
          (seller_id, seller_name, kind, slug, tier, data, qty, price, price_tc, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [offer.seller_id, offer.seller_name, offer.kind, offer.slug || null,
         offer.tier || 0, offer.data || null, offer.qty || 1,
         offer.price, offer.price_tc ? 1 : 0,
         offer.expires_at ? new Date(offer.expires_at) : null]);
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
      for (const k in patch) {
        set.push(k + "=?");
        const v = patch[k];
        // Colunas TIMESTAMP/DATETIME rejeitam ISO-8601 (MySQL strict):
        // converte para Date, que o driver serializa corretamente.
        params.push(/_at$/.test(k) && typeof v === "string" ? new Date(v) : v);
      }
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
      const rows = await this.query("SELECT gold FROM accounts WHERE id = ?", [Number(accountId)]);
      return rows[0] ? (rows[0].gold || 0) : 0;
    },
    async addAccountMarketGold(accountId, amount) {
      await this.run("UPDATE accounts SET gold = gold + ? WHERE id = ?",
        [Math.max(0, amount), Number(accountId)]);
    },
    async payMarketFee(accountId, amount) {
      // fee e reservas de market saem do gold compartilhado da conta (sem banco separado)
      const r = await this.run(
        "UPDATE accounts SET gold = gold - ? WHERE id = ? AND gold >= ?",
        [amount, Number(accountId), amount]);
      return r.affectedRows > 0;
    },
    async refundMarketFee(accountId, amount) {
      await this.run("UPDATE accounts SET gold = gold + ? WHERE id = ?",
        [amount, Number(accountId)]);
    },
    async payMarketGold(accountId, amount) {
      const r = await this.run(
        "UPDATE accounts SET gold = gold - ? WHERE id = ? AND gold >= ?",
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
        // O market nao usa mais banco separado; deposit/withdraw sao compatibilidade.
        const bank=pocket;
        data.gold=pocket;
        await conn.query("UPDATE accounts SET gold=?, gold_migrated=1 WHERE id=?",[pocket,Number(accountId)]);
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
      /* Ranking por CONTA: 1 linha por jogador (display_name); o valor da
       * métrica é o melhor char da conta; `chars` detalha o roster para o
       * clique do cliente. */
      const metric = by === "kills"
        ? "FLOOR(COALESCE(JSON_EXTRACT(c.data, '$.totalKills'), 0))"
        : by === "magic"
          ? "FLOOR(COALESCE(JSON_EXTRACT(c.data, '$.ml'), 0))"
          : skillPath[by]
            ? `FLOOR(COALESCE(JSON_EXTRACT(c.data, '${skillPath[by]}'), 10))`
            : null;
      let rows;
      if (metric) {
        rows = await this.query(
          `SELECT a.id AS accountId, COALESCE(a.display_name, a.login) AS name,
                  MAX(${metric}) AS value
           FROM characters c JOIN accounts a ON a.id = c.account_id
           GROUP BY a.id, name ORDER BY value DESC, a.id ASC LIMIT ?`, [limit]);
      } else {
        rows = await this.query(
          `SELECT a.id AS accountId, COALESCE(a.display_name, a.login) AS name,
                  a.level AS value
           FROM accounts a
           WHERE EXISTS (SELECT 1 FROM characters c WHERE c.account_id = a.id)
           ORDER BY a.level DESC, a.id ASC LIMIT ?`, [limit]);
      }
      const accIds = rows.map((r) => Number(r.accountId));
      let chars = [];
      if (accIds.length) {
        const ph = accIds.map(() => "?").join(",");
        chars = await this.query(
          `SELECT id, account_id, name, voc, level FROM characters WHERE account_id IN (${ph}) ORDER BY level DESC, name ASC`,
          accIds);
      }
      const byAcc = new Map();
      for (const ch of chars) {
        const list = byAcc.get(Number(ch.account_id)) || [];
        list.push({ id: ch.id, name: ch.name, voc: ch.voc, level: Number(ch.level) || 1 });
        byAcc.set(Number(ch.account_id), list);
      }
      return rows.map((r) => ({
        id: Number(r.accountId), accountId: Number(r.accountId), name: r.name,
        level: metric ? Math.max(...(byAcc.get(Number(r.accountId)) || [{ level: 1 }]).map((c) => c.level), 1) : Number(r.value) || 1,
        value: Number(r.value) || (metric ? 0 : 1),
        totalKills: by === "kills" ? Number(r.value) || 0 : undefined,
        chars: byAcc.get(Number(r.accountId)) || [],
      }));
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
      /* Contas com char dentro de alguma instância ativa — VIVO ou morto. */
      const accountsInInstances = new Set();
      const nowMs = Date.now();
      for (const row of activeInstances) {
        let state = null;
        try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
        const authPlayers = (state && state.authority && state.authority.players) || [];
        /* Mortos (ressurreição) NÃO contam como online: hp<=0, downUntil
         * no futuro (aguardando revive) ou permadead (boss). */
        const fromAuth = authPlayers
          .filter((item) => {
            if (!item || !item.p) return false;
            if (item.permadead) return false;
            if (Number(item.p.hp) <= 0) return false;
            if (Number(item.downUntil) > nowMs) return false;
            return true;
          })
          .map((p) => Number(p && p.id));
        const fromMembers = ((state && state.members) || []).map((m) => Number(m && m.id));
        const ids = authPlayers.length ? fromAuth : fromMembers;
        const presence = authPlayers.length
          ? authPlayers.map((p) => Number(p && p.id)) : fromMembers.slice();
        if (!presence.length && row.active_character_id)
          presence.push(Number(row.active_character_id));
        for (const id of presence) {
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          const c = await this.findCharacter(id);
          if (c) accountsInInstances.add(Number(c.account_id));
        }
        for (const id of ids) {
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          const c = await this.findCharacter(id);
          if (c && leasedAccounts.has(Number(c.account_id))) charIds.add(id);
        }
      }
      // Personagens na área de treino também contam como online — um a um.
      // O trainingClock.at renova a cada checkpoint (~1s) e a conta precisa
      // de lease ativa, mesma regra dos personagens em instância.
      const trainingRows = await this.query(
        `SELECT id, account_id FROM characters
         WHERE data LIKE '%"trainingClock"%'
           AND CAST(JSON_EXTRACT(data,'$.trainingClock.at') AS DECIMAL(20,4)) > ?`,
        [Date.now() - 15000]);
      for (const row of trainingRows) {
        const id = Number(row && row.id);
        if (!Number.isSafeInteger(id) || id <= 0 || charIds.has(id)) continue;
        if (leasedAccounts.has(Number(row.account_id))) charIds.add(id);
      }
      const accountsWithChars = new Set();
      for (const id of charIds) {
        const c = await this.findCharacter(id);
        if (c) accountsWithChars.add(Number(c.account_id));
      }
      let cityOnline = 0;
      for (const accId of leasedAccounts) {
        /* Com char em instância (vivo ou morto) não é "idle na cidade". */
        if (!accountsWithChars.has(accId) && !accountsInInstances.has(accId)) cityOnline++;
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

    /* Lista detalhada para o painel admin — mesma regra do onlineCount, mas
     * devolve um item por personagem/conta online com status e local. */
    async onlineList() {
      const leases = await this.query(
        "SELECT account_id FROM account_leases WHERE expires_at > ?",
        [new Date()]);
      const leasedAccounts = new Set(leases.map((l) => Number(l.account_id)));
      const activeInstances = await this.query(
        "SELECT account_id, active_character_id, kind, hunt_id, boss_id, state FROM account_instances WHERE status='active'");
      const tagged = new Map(); // charId -> {status, where}
      const accountsInInstances = new Set();
      const nowMs = Date.now();
      for (const row of activeInstances) {
        let state = null;
        try { state = typeof row.state === "string" ? JSON.parse(row.state) : row.state; } catch (e) { state = null; }
        const authPlayers = (state && state.authority && state.authority.players) || [];
        const alive = authPlayers
          .filter((item) => {
            if (!item || !item.p) return false;
            if (item.permadead) return false;
            if (Number(item.p.hp) <= 0) return false;
            if (Number(item.downUntil) > nowMs) return false;
            return true;
          })
          .map((p) => Number(p && p.id));
        const fromMembers = ((state && state.members) || []).map((m) => Number(m && m.id));
        const ids = authPlayers.length ? alive : fromMembers;
        const presence = authPlayers.length
          ? authPlayers.map((p) => Number(p && p.id)) : fromMembers.slice();
        if (!presence.length && row.active_character_id)
          presence.push(Number(row.active_character_id));
        const where = row.boss_id ? "boss:" + row.boss_id : (row.hunt_id || row.kind || "");
        for (const id of presence) {
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          const c = await this.findCharacter(id);
          if (c) accountsInInstances.add(Number(c.account_id));
        }
        for (const id of ids) {
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          const c = await this.findCharacter(id);
          if (c && leasedAccounts.has(Number(c.account_id))) tagged.set(id, { status: "hunt", where });
        }
      }
      const trainingRows = await this.query(
        `SELECT id, account_id FROM characters
         WHERE data LIKE '%"trainingClock"%'
           AND CAST(JSON_EXTRACT(data,'$.trainingClock.at') AS DECIMAL(20,4)) > ?`,
        [Date.now() - 15000]);
      for (const row of trainingRows) {
        const id = Number(row && row.id);
        if (!Number.isSafeInteger(id) || id <= 0 || tagged.has(id)) continue;
        if (leasedAccounts.has(Number(row.account_id))) tagged.set(id, { status: "training", where: "" });
      }
      const accountsWithChars = new Set();
      const players = [];
      for (const [id, tag] of tagged) {
        const c = await this.findCharacter(id);
        if (!c) continue;
        accountsWithChars.add(Number(c.account_id));
        const acc = await this.findAccountById(c.account_id);
        players.push({ id: c.id, name: c.name, voc: c.voc, level: c.level,
          account_id: Number(c.account_id), account_login: acc ? acc.login : "",
          status: tag.status, where: tag.where });
      }
      for (const accId of leasedAccounts) {
        if (accountsWithChars.has(accId) || accountsInInstances.has(accId)) continue;
        const acc = await this.findAccountById(accId);
        let rep = null;
        try {
          const order = acc && acc.party_order;
          const list = typeof order === "string" ? JSON.parse(order) : order;
          if (Array.isArray(list) && list.length) rep = await this.findCharacter(Number(list[0]));
        } catch (e) {}
        if (!rep) {
          const rows = await this.query(
            "SELECT id, name, voc, level FROM characters WHERE account_id=? ORDER BY updated_at DESC LIMIT 1",
            [accId]);
          rep = rows[0] || null;
        }
        players.push({ id: rep ? rep.id : 0, name: rep ? rep.name : (acc ? acc.login : "conta " + accId),
          voc: rep ? rep.voc : "", level: rep ? rep.level : 0,
          account_id: accId, account_login: acc ? acc.login : "", status: "city", where: "" });
      }
      players.sort((a, b) => Number(b.level) - Number(a.level) || String(a.name).localeCompare(String(b.name)));
      return { players, total: players.length };
    },

    // ---- GUILDS ----
    async guildList() {
      return this.query(
        `SELECT g.*, (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id=g.id) members
         FROM guilds g ORDER BY g.level DESC, g.exp DESC, g.id ASC`);
    },
    async guildById(id) {
      const rows = await this.query("SELECT * FROM guilds WHERE id=?", [Number(id)]);
      return rows[0] || null;
    },
    async guildByName(name) {
      const rows = await this.query("SELECT * FROM guilds WHERE LOWER(name)=LOWER(?)", [String(name)]);
      return rows[0] || null;
    },
    async guildMemberByAccount(accountId) {
      const rows = await this.query("SELECT * FROM guild_members WHERE account_id=?", [Number(accountId)]);
      return rows[0] || null;
    },
    async guildMembers(guildId) {
      return this.query(
        `SELECT m.*, c.name, c.voc, c.level
         FROM guild_members m LEFT JOIN characters c ON c.id=m.character_id
         WHERE m.guild_id=?
         ORDER BY FIELD(m.rank,'leader','vice','member'), m.joined_at ASC`, [Number(guildId)]);
    },
    async guildCreate(opts) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [dup] = await conn.query("SELECT id FROM guilds WHERE LOWER(name)=LOWER(?)", [opts.name]);
        if (dup.length) { await conn.rollback(); return { ok: false, error: "GUILD_NAME_TAKEN" }; }
        const [member] = await conn.query("SELECT account_id FROM guild_members WHERE account_id=?",
          [Number(opts.leader_account_id)]);
        if (member.length) { await conn.rollback(); return { ok: false, error: "GUILD_ALREADY_MEMBER" }; }
        const cost = Math.max(0, Number(opts.cost_gold) || 0);
        const [g] = await conn.query("UPDATE accounts SET gold=gold-? WHERE id=? AND gold>=?",
          [cost, Number(opts.leader_account_id), cost]);
        if (!g.affectedRows) { await conn.rollback(); return { ok: false, error: "GUILD_GOLD_LOW" }; }
        const [ins] = await conn.query(
          "INSERT INTO guilds (name,level,exp,icon) VALUES (?,1,0,?)",
          [opts.name, Math.max(1, Math.floor(Number(opts.icon) || 1))]);
        await conn.query(
          "INSERT INTO guild_members (guild_id,account_id,character_id,rank) VALUES (?,?,?,'leader')",
          [ins.insertId, Number(opts.leader_account_id), Number(opts.leader_character_id)]);
        // espelha o novo saldo no data.gold dos chars (mesma regra do wallet sync)
        const [acc] = await conn.query("SELECT gold FROM accounts WHERE id=?", [Number(opts.leader_account_id)]);
        const newGold = acc[0] ? Math.max(0, Number(acc[0].gold) || 0) : 0;
        const [chars] = await conn.query("SELECT id, data FROM characters WHERE account_id=? FOR UPDATE",
          [Number(opts.leader_account_id)]);
        for (const ch of chars) {
          let d = {}; try { d = typeof ch.data === "string" ? JSON.parse(ch.data) : (ch.data || {}); } catch (e) { d = {}; }
          d.gold = newGold;
          await conn.query("UPDATE characters SET data=? WHERE id=?", [JSON.stringify(d), Number(ch.id)]);
        }
        await conn.commit();
        return { ok: true, id: ins.insertId };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async guildInviteAdd(guildId, inviterCharId, inviteeCharId) {
      try {
        const r = await this.run(
          `INSERT INTO guild_invites (guild_id,inviter_character_id,invitee_character_id,status)
           VALUES (?,?,?,'pending')`,
          [Number(guildId), Number(inviterCharId), Number(inviteeCharId)]);
        return { ok: true, id: r.insertId };
      } catch (e) {
        if (String(e && e.code) === "ER_DUP_ENTRY") return { ok: false, error: "GUILD_INVITE_PENDING" };
        throw e;
      }
    },
    async guildInviteFind(id) {
      const rows = await this.query("SELECT * FROM guild_invites WHERE id=?", [Number(id)]);
      return rows[0] || null;
    },
    async guildInviteSetStatus(id, status) {
      await this.run("UPDATE guild_invites SET status=? WHERE id=?", [String(status), Number(id)]);
    },
    async guildInvitesForAccount(accountId) {
      return this.query(
        `SELECT i.*, g.name guild_name, ic2.name inviter_name
         FROM guild_invites i
         JOIN guilds g ON g.id=i.guild_id
         JOIN characters ic ON ic.id=i.invitee_character_id
         LEFT JOIN characters ic2 ON ic2.id=i.inviter_character_id
         WHERE ic.account_id=? AND i.status='pending'
         ORDER BY i.created_at DESC`, [Number(accountId)]);
    },
    async guildMemberAdd(guildId, accountId, charId, rank) {
      await this.run(
        "INSERT INTO guild_members (guild_id,account_id,character_id,rank) VALUES (?,?,?,?)",
        [Number(guildId), Number(accountId), Number(charId), String(rank || "member")]);
    },
    /* Remove membro. Líder sai → vice assume; sem vice, o mais antigo; sem
     * ninguém → guild dissolvida. */
    async guildMemberRemove(guildId, accountId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query("SELECT * FROM guild_members WHERE guild_id=? FOR UPDATE",
          [Number(guildId)]);
        const me = rows.find((m) => Number(m.account_id) === Number(accountId));
        if (!me) { await conn.rollback(); return { ok: false, error: "NOT_MEMBER" }; }
        const rest = rows.filter((m) => Number(m.account_id) !== Number(accountId));
        let disbanded = false, guildName = null;
        if (!rest.length) {
          const [g] = await conn.query("SELECT name FROM guilds WHERE id=?", [Number(guildId)]);
          guildName = g[0] ? g[0].name : null;
          await conn.query("DELETE FROM guild_invites WHERE guild_id=?", [Number(guildId)]);
          await conn.query("DELETE FROM guild_tasks WHERE guild_id=?", [Number(guildId)]);
          await conn.query("DELETE FROM guild_log WHERE guild_id=?", [Number(guildId)]);
          await conn.query("DELETE FROM guild_members WHERE guild_id=?", [Number(guildId)]);
          await conn.query("DELETE FROM guilds WHERE id=?", [Number(guildId)]);
          // dissolveu → limpa data.guildBonus de TODOS os ex-membros
          for (const m of rows)
            await conn.query("UPDATE characters SET data=JSON_REMOVE(data,'$.guildBonus','$.guildTempBonus') WHERE account_id=?",
              [Number(m.account_id)]);
          disbanded = true;
        } else {
          await conn.query("DELETE FROM guild_members WHERE guild_id=? AND account_id=?",
            [Number(guildId), Number(accountId)]);
          await conn.query("UPDATE characters SET data=JSON_REMOVE(data,'$.guildBonus','$.guildTempBonus') WHERE account_id=?",
            [Number(accountId)]);
          if (String(me.rank) === "leader") {
            const remainingLeaders = rest.filter((m) => m.rank === "leader");
            if (!remainingLeaders.length) {
              // nenhum líder sobrou → vice mais antigo (senão membro mais antigo) assume
              const successor = rest.find((m) => m.rank === "vice") || rest[0];
              await conn.query("UPDATE guild_members SET rank='leader' WHERE guild_id=? AND account_id=?",
                [Number(guildId), Number(successor.account_id)]);
            }
          }
        }
        await conn.commit();
        return { ok: true, disbanded, guildName };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async guildMemberSetRank(guildId, accountId, rank) {
      await this.run("UPDATE guild_members SET rank=? WHERE guild_id=? AND account_id=?",
        [String(rank), Number(guildId), Number(accountId)]);
    },
    async guildTasksEnsure(guildId, accountId, day, defs) {
      for (const def of defs || []) {
        await this.run(
          `INSERT IGNORE INTO guild_tasks (guild_id,account_id,day,slot,monster_slug,target)
           VALUES (?,?,?,?,?,?)`,
          [Number(guildId), Number(accountId), String(day), Number(def.slot),
           String(def.monster_slug), Number(def.target)]);
      }
    },
    async guildTasksFor(guildId, accountId, day) {
      return this.query(
        "SELECT * FROM guild_tasks WHERE guild_id=? AND account_id=? AND day=? ORDER BY slot ASC",
        [Number(guildId), Number(accountId), String(day)]);
    },
    /* Chamado pelo tick da instância com os kills da janela: soma progresso
     * nas tasks abertas do membro (por conta) e fecha task ao bater o alvo —
     * cada task completada dá +1 EXP à guild e +1 contribuição ao membro.
     * `exec` permite rodar dentro da transação do tick (conn) — sem ele cai
     * no pool (rotas). */
    async guildCreditKills(accountId, kills, exec) {
      if (!kills || typeof kills !== "object") return { credited: 0 };
      exec = exec || pool;
      const [members] = await exec.query(
        "SELECT guild_id, contribution FROM guild_members WHERE account_id=?", [Number(accountId)]);
      const member = members[0];
      if (!member) return { credited: 0 };
      const Guild = guildModule();
      if (!Guild) return { credited: 0 };
      const day = Guild.guildTaskDay();
      for (const def of Guild.guildDailyTaskDefs(member.guild_id, day)) {
        await exec.query(
          `INSERT IGNORE INTO guild_tasks (guild_id,account_id,day,slot,monster_slug,target)
           VALUES (?,?,?,?,?,?)`,
          [Number(member.guild_id), Number(accountId), String(day), Number(def.slot),
           String(def.monster_slug), Number(def.target)]);
      }
      const [tasks] = await exec.query(
        "SELECT * FROM guild_tasks WHERE guild_id=? AND account_id=? AND day=? AND done=0",
        [Number(member.guild_id), Number(accountId), String(day)]);
      let credited = 0, completed = 0;
      for (const t of tasks) {
        const n = Math.max(0, Math.floor(Number(kills[t.monster_slug]) || 0));
        if (!n) continue;
        const newProgress = Math.min(Number(t.target), Number(t.progress) + n);
        const done = newProgress >= Number(t.target) ? 1 : 0;
        await exec.query("UPDATE guild_tasks SET progress=?, done=?, completed_at=? WHERE id=?",
          [newProgress, done, done ? new Date() : null, Number(t.id)]);
        credited += n;
        if (done) {
          await exec.query(
            "UPDATE guild_members SET contribution=contribution+1 WHERE account_id=?",
            [Number(accountId)]);
          await exec.query("UPDATE guilds SET exp=exp+1, points=points+1 WHERE id=?",
            [Number(t.guild_id)]);
          const [g] = await exec.query("SELECT exp FROM guilds WHERE id=?", [Number(t.guild_id)]);
          if (g[0]) await exec.query("UPDATE guilds SET level=? WHERE id=?",
            [Guild.guildLevelForExp(g[0].exp), Number(t.guild_id)]);
          completed++;
        }
      }
      return { credited, completed };
    },

    // ---- GUILD POINTS / SHOP / CAIXA / HISTÓRICO ----
    async guildLogAdd(exec, entry) {
      // Controllers chamam guildLogAdd(null, entry) — mesmo padrão do
      // JsonStore. Sem o fallback, exec.query em null quebrava o settle PvP.
      exec = exec || this;
      await exec.query(
        `INSERT INTO guild_log (guild_id,account_id,char_name,category,detail,gold_delta,points_delta,coins_delta)
         VALUES (?,?,?,?,?,?,?,?)`,
        [Number(entry.guild_id), Number(entry.account_id), String(entry.char_name || "").slice(0, 48),
         String(entry.category), String(entry.detail || "").slice(0, 200),
         Number(entry.gold_delta) || 0, Number(entry.points_delta) || 0,
         Number(entry.coins_delta) || 0]);
    },
    async guildLogList(guildId, category, limit) {
      const cat = ["donation", "purchase"].includes(String(category)) ? String(category) : null;
      const rows = await this.query(
        `SELECT * FROM guild_log WHERE guild_id=? ${cat ? "AND category=?" : ""}
         ORDER BY id DESC LIMIT ?`,
        cat ? [Number(guildId), cat, Math.max(1, Math.min(500, Number(limit) || 200))]
            : [Number(guildId), Math.max(1, Math.min(500, Number(limit) || 200))]);
      return rows;
    },
    async guildLogTotals(guildId) {
      const rows = await this.query(
        `SELECT category, SUM(gold_delta) gold, SUM(points_delta) points,
           SUM(coins_delta) coins, COUNT(*) n
         FROM guild_log WHERE guild_id=? GROUP BY category`, [Number(guildId)]);
      const out = { donated: 0, coinsDonated: 0, spentGold: 0, spentPoints: 0,
        spentCoins: 0, donations: 0, purchases: 0 };
      for (const r of rows) {
        if (r.category === "donation") {
          out.donated = Math.max(0, Number(r.gold) || 0);
          out.coinsDonated = Math.max(0, Number(r.coins) || 0);
          out.donations = Number(r.n) || 0;
        }
        if (r.category === "purchase") {
          out.spentGold = Math.abs(Number(r.gold) || 0);
          out.spentPoints = Math.abs(Number(r.points) || 0);
          out.spentCoins = Math.abs(Number(r.coins) || 0);
          out.purchases = Number(r.n) || 0;
        }
      }
      return out;
    },
    /* Doação: debita gold da conta, credita no caixa e loga — tudo na
     * mesma transação; espelha data.gold dos chars (wallet sync). */
    async guildDonate(guildId, accountId, charName, amount) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const amt = Math.max(1, Math.floor(Number(amount) || 0));
        const [g] = await conn.query("UPDATE accounts SET gold=gold-? WHERE id=? AND gold>=?",
          [amt, Number(accountId), amt]);
        if (!g.affectedRows) { await conn.rollback(); return { ok: false, error: "GOLD_LOW" }; }
        await conn.query("UPDATE guilds SET balance=balance+? WHERE id=?",
          [amt, Number(guildId)]);
        await this.guildLogAdd(conn, { guild_id: guildId, account_id: accountId,
          char_name: charName, category: "donation", detail: "Doação ao caixa",
          gold_delta: amt, points_delta: 0 });
        const [acc] = await conn.query("SELECT gold FROM accounts WHERE id=?", [Number(accountId)]);
        const newGold = acc[0] ? Math.max(0, Number(acc[0].gold) || 0) : 0;
        const [chars] = await conn.query("SELECT id, data FROM characters WHERE account_id=? FOR UPDATE",
          [Number(accountId)]);
        for (const ch of chars) {
          let d = {}; try { d = typeof ch.data === "string" ? JSON.parse(ch.data) : (ch.data || {}); } catch (e) { d = {}; }
          d.gold = newGold;
          await conn.query("UPDATE characters SET data=? WHERE id=?", [JSON.stringify(d), Number(ch.id)]);
        }
        const [bal] = await conn.query("SELECT balance FROM guilds WHERE id=?", [Number(guildId)]);
        await conn.commit();
        return { ok: true, balance: bal[0] ? Number(bal[0].balance) : 0, gold: newGold };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    /* Compra de bônus: debita pontos + caixa atomicamente, grava o nível
     * no JSON bonuses, loga e aplica aos chars de todas as contas. */
    async guildBonusBuy(guildId, accountId, charName, bonusId, newLevel, cost) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const key = "$." + String(bonusId).replace(/[^a-zA-Z]/g, "");
        const lvl = Math.max(1, Math.min(10, Math.floor(Number(newLevel) || 1)));
        const pts = Math.max(0, Math.floor(Number(cost && cost.points) || 0));
        const gold = Math.max(0, Math.floor(Number(cost && cost.gold) || 0));
        const [u] = await conn.query(
          `UPDATE guilds SET points=points-?, balance=balance-?,
             bonuses=JSON_SET(COALESCE(bonuses,JSON_OBJECT()), ?, ?)
           WHERE id=? AND points>=? AND balance>=?`,
          [pts, gold, key, lvl, Number(guildId), pts, gold]);
        if (!u.affectedRows) { await conn.rollback(); return { ok: false, error: "POINTS_OR_BALANCE_LOW" }; }
        const Guild = guildModule();
        await this.guildLogAdd(conn, { guild_id: guildId, account_id: accountId,
          char_name: charName, category: "purchase",
          detail: `${(Guild && Guild.guildBonusDef(bonusId) || {}).label || bonusId} Nv ${lvl}`,
          gold_delta: -gold, points_delta: -pts });
        await guildBonusToChars(conn, guildId);
        const [rows] = await conn.query("SELECT points,balance,bonuses FROM guilds WHERE id=?", [Number(guildId)]);
        await conn.commit();
        const r = rows[0] || {};
        return { ok: true, points: Number(r.points) || 0, balance: Number(r.balance) || 0,
          bonuses: Guild ? Guild.guildBonusLevels(r.bonuses) : r.bonuses };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    /* Bônus TEMPORÁRIO (24h): debita gold do caixa + insígnia PvP da
     * conta, ativa/prorroga o bônus no JSON temp_bonuses e propaga. */
    async guildTempBonusBuy(guildId, accountId, charName, bonusId, until, cost) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const key = "$." + String(bonusId).replace(/[^a-zA-Z]/g, "");
        const gold = Math.max(0, Math.floor(Number(cost && cost.gold) || 0));
        const ins = Math.max(0, Math.floor(Number(cost && cost.insignias) || 0));
        const [a] = await conn.query(
          "UPDATE accounts SET pvp_insignias=pvp_insignias-? WHERE id=? AND pvp_insignias>=?",
          [ins, Number(accountId), ins]);
        if (!a.affectedRows) { await conn.rollback(); return { ok: false, error: "INSIGNIA_LOW" }; }
        const [u] = await conn.query(
          `UPDATE guilds SET balance=balance-?,
             temp_bonuses=JSON_SET(COALESCE(temp_bonuses,JSON_OBJECT()), ?, ?)
           WHERE id=? AND balance>=?`,
          [gold, key, Number(until), Number(guildId), gold]);
        if (!u.affectedRows) { await conn.rollback(); return { ok: false, error: "BALANCE_LOW" }; }
        const Guild = guildModule();
        await this.guildLogAdd(conn, { guild_id: guildId, account_id: accountId,
          char_name: charName, category: "purchase",
          detail: `${(Guild && Guild.guildTempBonusDef(bonusId) || {}).label || bonusId} (24h)`,
          gold_delta: -gold, points_delta: 0 });
        await guildBonusToChars(conn, guildId);
        const [rows] = await conn.query(
          "SELECT balance,temp_bonuses FROM guilds WHERE id=?", [Number(guildId)]);
        await conn.commit();
        const r = rows[0] || {};
        return { ok: true, balance: Number(r.balance) || 0,
          tempBonuses: Guild ? Guild.guildTempBonusUntil(r.temp_bonuses) : r.temp_bonuses };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    /* Doação de Tibia Coins: debita coins da conta, credita no caixa de
     * coins da guild (reservado a futuras batalhas PvP) e loga. */
    async guildDonateCoins(guildId, accountId, charName, amount) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const amt = Math.max(1, Math.floor(Number(amount) || 0));
        const [a] = await conn.query(
          "UPDATE accounts SET coins=coins-? WHERE id=? AND coins>=?",
          [amt, Number(accountId), amt]);
        if (!a.affectedRows) { await conn.rollback(); return { ok: false, error: "COINS_LOW" }; }
        await conn.query("UPDATE guilds SET coins=coins+? WHERE id=?", [amt, Number(guildId)]);
        await this.guildLogAdd(conn, { guild_id: guildId, account_id: accountId,
          char_name: charName, category: "donation", detail: "Doação de Tibia Coins",
          gold_delta: 0, points_delta: 0, coins_delta: amt });
        const [rows] = await conn.query(
          "SELECT (SELECT coins FROM guilds WHERE id=?) gc, (SELECT coins FROM accounts WHERE id=?) ac",
          [Number(guildId), Number(accountId)]);
        await conn.commit();
        const r = rows[0] || {};
        return { ok: true, coins: Number(r.gc) || 0, accountCoins: Number(r.ac) || 0 };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    /* Renomear guild: 250 Tibia Coins do caixa de coins (só líder). */
    async guildRename(guildId, accountId, charName, newName, costCoins) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [dup] = await conn.query(
          "SELECT id FROM guilds WHERE LOWER(name)=LOWER(?) AND id<>?", [newName, Number(guildId)]);
        if (dup.length) { await conn.rollback(); return { ok: false, error: "GUILD_NAME_TAKEN" }; }
        const cost = Math.max(0, Math.floor(Number(costCoins) || 0));
        const [u] = await conn.query(
          "UPDATE guilds SET coins=coins-?, name=? WHERE id=? AND coins>=?",
          [cost, String(newName), Number(guildId), cost]);
        if (!u.affectedRows) { await conn.rollback(); return { ok: false, error: "COINS_LOW" }; }
        await this.guildLogAdd(conn, { guild_id: guildId, account_id: accountId,
          char_name: charName, category: "purchase",
          detail: `Guild renomeada para "${String(newName).slice(0, 120)}"`,
          gold_delta: 0, points_delta: 0, coins_delta: -cost });
        await conn.commit();
        return { ok: true };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async guildSetIcon(guildId, icon, now, logEntry) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("UPDATE guilds SET icon=?, icon_at=? WHERE id=?",
          [Math.max(1, Math.floor(Number(icon) || 1)), Number(now) || Date.now(), Number(guildId)]);
        if (logEntry) await this.guildLogAdd(conn, { ...logEntry, guild_id: Number(guildId) });
        await conn.commit();
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    /* Solicitações de entrada (jogador → guild). Uma pendente por guild/
     * conta; ao entrar em qualquer guild as demais são limpas. */
    async guildRequestAdd(guildId, accountId, characterId) {
      try {
        await this.run(
          "INSERT INTO guild_requests (guild_id,account_id,character_id) VALUES (?,?,?)",
          [Number(guildId), Number(accountId), Number(characterId)]);
        return { ok: true };
      } catch (e) {
        if (String(e && e.code) === "ER_DUP_ENTRY") return { ok: false, error: "REQUEST_PENDING" };
        throw e;
      }
    },
    async guildRequestFind(id) {
      const rows = await this.query("SELECT * FROM guild_requests WHERE id=?", [Number(id)]);
      return rows[0] || null;
    },
    async guildRequestByAccount(accountId, guildId) {
      const rows = await this.query(
        "SELECT * FROM guild_requests WHERE account_id=? AND guild_id=?",
        [Number(accountId), Number(guildId)]);
      return rows[0] || null;
    },
    async guildRequests(guildId) {
      const rows = await this.query(
        `SELECT r.id, r.account_id, r.character_id, r.created_at,
           c.name, c.voc, c.level
         FROM guild_requests r JOIN characters c ON c.id=r.character_id
         WHERE r.guild_id=? ORDER BY r.created_at ASC`, [Number(guildId)]);
      return rows;
    },
    async guildRequestDelete(id) {
      await this.run("DELETE FROM guild_requests WHERE id=?", [Number(id)]);
    },
    async guildRequestsClearAccount(accountId) {
      await this.run("DELETE FROM guild_requests WHERE account_id=?", [Number(accountId)]);
    },
    /* Propaga data.guildBonus da guild para todos os chars das contas
     * membro (usado ao entrar membro e após compra de bônus). */
    async guildApplyBonuses(guildId) {
      await guildBonusToChars(pool, guildId);
    },
    /* ------------------- PvP guild-vs-guild (MySQL) ------------------- */
    async pvpBattleGet(id) {
      const rows = await this.query("SELECT * FROM pvp_battles WHERE id=?", [Number(id)]);
      return rows[0] || null;
    },
    async pvpBattlesActive() {
      return this.query(
        "SELECT * FROM pvp_battles WHERE status IN ('pending','accepted','prep','live')");
    },
    async pvpBattlesForGuild(guildId, limit) {
      const lim = Math.max(1, Math.min(500, Number(limit) || 100));
      return this.query(
        `SELECT * FROM pvp_battles WHERE challenger_guild_id=? OR challenged_guild_id=?
         ORDER BY id DESC LIMIT ${lim}`, [Number(guildId), Number(guildId)]);
    },
    async pvpBattlesForAccount(accountId, limit) {
      const lim = Math.max(1, Math.min(500, Number(limit) || 100));
      return this.query(
        `SELECT b.* FROM pvp_battles b JOIN pvp_battle_roster r ON r.battle_id=b.id
         WHERE r.account_id=? AND b.status='finished' ORDER BY b.id DESC LIMIT ${lim}`, [Number(accountId)]);
    },
    async pvpBattleLastCreate(guildId) {
      const rows = await this.query(
        "SELECT UNIX_TIMESTAMP(MAX(created_at))*1000 ts FROM pvp_battles WHERE challenger_guild_id=?",
        [Number(guildId)]);
      return Number(rows[0] && rows[0].ts) || 0;
    },
    async pvpLobbyCreate(opts) {
      const o = opts || {}, conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [busy] = await conn.query(
          `SELECT id FROM pvp_battles
           WHERE status IN ('pending','accepted','prep','live')
             AND (challenger_guild_id IN (?,?) OR challenged_guild_id IN (?,?)) LIMIT 1`,
          [o.challengerGuildId, o.challengedGuildId, o.challengerGuildId, o.challengedGuildId]);
        if (busy.length) { await conn.rollback(); return { ok: false, error: "PVP_GUILD_BUSY" }; }
        const col = o.stakeType === "coins" ? "coins" : "balance";
        const amt = Math.max(0, Math.floor(Number(o.stakeAmount) || 0));
        const [u] = await conn.query(
          `UPDATE guilds SET ${col}=${col}-? WHERE id=? AND ${col}>=?`,
          [amt, Number(o.challengerGuildId), amt]);
        if (!u.affectedRows) { await conn.rollback(); return { ok: false, error: "STAKE_LOW" }; }
        const [ins] = await conn.query(
          `INSERT INTO pvp_battles (challenger_guild_id,challenged_guild_id,created_by,map,team_size,
             stake_type,stake_amount,status,scheduled_at,quick)
           VALUES (?,?,?,?,?,?,?,'pending',?,?)`,
          [Number(o.challengerGuildId), Number(o.challengedGuildId), Number(o.createdBy),
           String(o.map), Number(o.teamSize), col === "coins" ? "coins" : "gold", amt,
           Number(o.scheduledAt), o.quick ? 1 : 0]);
        await this.guildLogAdd(conn, { guild_id: Number(o.challengerGuildId),
          account_id: Number(o.createdBy), char_name: o.charName || "", category: "pvp",
          detail: `Desafio PvP #${ins.insertId} (${amt} ${col === "coins" ? "coins" : "gold"})`,
          gold_delta: col === "balance" ? -amt : 0, points_delta: 0,
          coins_delta: col === "coins" ? -amt : 0 });
        await conn.commit();
        return { ok: true, id: ins.insertId };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async pvpBattleUpdate(id, fields) {
      const f = fields || {}, cols = [], vals = [];
      for (const k of ["status", "scheduled_at", "prepared_at", "started_at", "finished_at", "winner_guild_id",
        "draw", "overtime", "scores", "result", "host_account_id", "instance_id"]) {
        if (f[k] !== undefined) { cols.push(k + "=?"); vals.push(f[k]); }
      }
      if (!cols.length) return { ok: false, error: "NO_FIELDS" };
      vals.push(Number(id));
      await this.run(`UPDATE pvp_battles SET ${cols.join(",")} WHERE id=?`, vals);
      return { ok: true };
    },
    async pvpBattleAccept(battleId, guildId, charName) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          "SELECT * FROM pvp_battles WHERE id=? FOR UPDATE", [Number(battleId)]);
        const b = rows[0];
        if (!b || String(b.status) !== "pending" || Number(b.challenged_guild_id) !== Number(guildId)) {
          await conn.rollback(); return { ok: false, error: "INVALID_STATE" };
        }
        const col = b.stake_type === "coins" ? "coins" : "balance";
        const [u] = await conn.query(
          `UPDATE guilds SET ${col}=${col}-? WHERE id=? AND ${col}>=?`,
          [Number(b.stake_amount), Number(guildId), Number(b.stake_amount)]);
        if (!u.affectedRows) { await conn.rollback(); return { ok: false, error: "STAKE_LOW" }; }
        await conn.query("UPDATE pvp_battles SET status='accepted' WHERE id=?", [Number(battleId)]);
        await this.guildLogAdd(conn, { guild_id: Number(guildId), account_id: 0,
          char_name: charName || "", category: "pvp",
          detail: `Desafio PvP #${battleId} aceito (${b.stake_amount} ${b.stake_type})`,
          gold_delta: col === "balance" ? -Number(b.stake_amount) : 0, points_delta: 0,
          coins_delta: col === "coins" ? -Number(b.stake_amount) : 0 });
        await conn.commit();
        return { ok: true };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async pvpBattleDecline(battleId, guildId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          "SELECT * FROM pvp_battles WHERE id=? FOR UPDATE", [Number(battleId)]);
        const b = rows[0];
        if (!b || String(b.status) !== "pending" || Number(b.challenged_guild_id) !== Number(guildId)) {
          await conn.rollback(); return { ok: false, error: "INVALID_STATE" };
        }
        const col = b.stake_type === "coins" ? "coins" : "balance";
        await conn.query(`UPDATE guilds SET ${col}=${col}+? WHERE id=?`,
          [Number(b.stake_amount), Number(b.challenger_guild_id)]);
        await conn.query(
          "UPDATE pvp_battles SET status='declined', finished_at=? WHERE id=?",
          [Date.now(), Number(battleId)]);
        await conn.commit();
        return { ok: true };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async pvpBattleCancel(battleId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          "SELECT * FROM pvp_battles WHERE id=? FOR UPDATE", [Number(battleId)]);
        const b = rows[0];
        if (!b || !["pending", "accepted"].includes(String(b.status))) {
          await conn.rollback(); return { ok: false, error: "INVALID_STATE" };
        }
        const col = b.stake_type === "coins" ? "coins" : "balance";
        await conn.query(`UPDATE guilds SET ${col}=${col}+? WHERE id=?`,
          [Number(b.stake_amount), Number(b.challenger_guild_id)]);
        if (String(b.status) === "accepted") {
          await conn.query(`UPDATE guilds SET ${col}=${col}+? WHERE id=?`,
            [Number(b.stake_amount), Number(b.challenged_guild_id)]);
        }
        await conn.query(
          "UPDATE pvp_battles SET status='cancelled', finished_at=? WHERE id=?",
          [Date.now(), Number(battleId)]);
        await conn.commit();
        return { ok: true };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async pvpBattleForfeit(battleId, loserGuildId, charName) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          "SELECT * FROM pvp_battles WHERE id=? FOR UPDATE", [Number(battleId)]);
        const b = rows[0];
        if (!b || !["accepted", "prep", "live"].includes(String(b.status))) {
          await conn.rollback(); return { ok: false, error: "INVALID_STATE" };
        }
        const winner = Number(b.challenger_guild_id) === Number(loserGuildId)
          ? Number(b.challenged_guild_id) : Number(b.challenger_guild_id);
        const col = b.stake_type === "coins" ? "coins" : "balance";
        const pot = Number(b.stake_amount) * 2, fee = Math.floor(pot * 0.10), net = pot - fee;
        await conn.query(`UPDATE guilds SET ${col}=${col}+? WHERE id=?`, [net, winner]);
        await conn.query(
          `UPDATE pvp_battles SET status='finished', winner_guild_id=?, finished_at=?,
             result=? WHERE id=?`,
          [winner, Date.now(),
           JSON.stringify({ forfeit: Number(loserGuildId), rewards: { winnerGuild: winner, net, fee } }),
           Number(battleId)]);
        await this.guildLogAdd(conn, { guild_id: winner, account_id: 0, char_name: charName || "",
          category: "pvp", detail: `Vitória PvP #${battleId} por desistência (pote ${net})`,
          gold_delta: col === "balance" ? net : 0, points_delta: 0,
          coins_delta: col === "coins" ? net : 0 });
        await conn.commit();
        return { ok: true, winner };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async pvpRosterReplace(battleId, rows) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM pvp_battle_roster WHERE battle_id=?", [Number(battleId)]);
        for (const r of rows || []) {
          await conn.query(
            `INSERT INTO pvp_battle_roster (battle_id,team,account_id,char_ids,leader,online)
             VALUES (?,?,?,?,?,?)`,
            [Number(battleId), Number(r.team), Number(r.account_id),
             JSON.stringify(r.char_ids || r.charIds || []), r.leader ? 1 : 0, r.online ? 1 : 0]);
        }
        await conn.commit();
        return { ok: true };
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
    },
    async pvpRosterGet(battleId) {
      const rows = await this.query("SELECT * FROM pvp_battle_roster WHERE battle_id=?",
        [Number(battleId)]);
      return rows.map((r) => {
        let ids = r.char_ids; if (typeof ids === "string") { try { ids = JSON.parse(ids); } catch (e) { ids = []; } }
        return { battle_id: Number(r.battle_id), team: Number(r.team), account_id: Number(r.account_id),
          char_ids: Array.isArray(ids) ? ids : [], leader: !!r.leader, online: !!r.online,
          kills: Number(r.kills) || 0, deaths: Number(r.deaths) || 0, damage: Number(r.damage) || 0 };
      });
    },
    /* Lock de preparo/batalha por conta: JOIN único — com múltiplas guerras
     * simultâneas o caminho iterativo custava 1+N queries por request. */
    async pvpLockedBattleForAccount(accountId) {
      const rows = await this.query(
        `SELECT b.id AS battle_id, b.status FROM pvp_battles b
           JOIN pvp_battle_roster r ON r.battle_id=b.id
           WHERE r.account_id=? AND b.status IN ('prep','live') LIMIT 1`,
        [Number(accountId)]);
      return rows[0] || null;
    },
    async accountAddInsignias(accountId, n) {
      await this.run("UPDATE accounts SET pvp_insignias=GREATEST(0,pvp_insignias+?) WHERE id=?",
        [Math.floor(Number(n) || 0), Number(accountId)]);
      return true;
    },
    async pvpStakeCredit(guildId, type, amount) {
      const col = type === "coins" ? "coins" : "balance";
      const amt = Math.max(0, Math.floor(Number(amount) || 0));
      await this.run(`UPDATE guilds SET ${col}=${col}+? WHERE id=?`, [amt, Number(guildId)]);
      const rows = await this.query(`SELECT ${col} v FROM guilds WHERE id=?`, [Number(guildId)]);
      return { ok: true, value: rows[0] ? Number(rows[0].v) : 0 };
    },

    async guildClearBonusForAccount(accountId) {
      await this.query("UPDATE characters SET data=JSON_REMOVE(data,'$.guildBonus','$.guildTempBonus') WHERE account_id=?",
        [Number(accountId)]);
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
    /* PARTY AUTOMÁTICA — ordem dos chars da conta (party_order JSON).
     * O 1º da lista é sempre o líder da party. */
    async accountPartyOrderGet(accountId) {
      const rows = await this.query(
        "SELECT party_order FROM accounts WHERE id=?", [Number(accountId)]);
      const raw = rows[0] && rows[0].party_order;
      let arr = raw;
      if (typeof raw === "string") { try { arr = JSON.parse(raw); } catch (e) { arr = null; } }
      return Array.isArray(arr) ? arr.map(Number).filter((n) => n > 0) : [];
    },
    async accountPartyOrderSet(accountId, ids) {
      const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0);
      await this.run("UPDATE accounts SET party_order=? WHERE id=?",
        [JSON.stringify(list), Number(accountId)]);
      return list;
    },
    /* Converge parties/party_members ao roster desejado, numa transação:
     * líder=leaderChar, membros próprios=memberIds (na ordem), membros de
     * outras contas são preservados. ownCharIds = ids de chars da conta. */
    async partySyncRoster(partyId, leaderChar, memberIds, ownCharIds) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("SELECT id FROM parties WHERE id=? FOR UPDATE", [Number(partyId)]);
        if (leaderChar) {
          await conn.query("UPDATE parties SET leader_id=?, leader_name=? WHERE id=?",
            [Number(leaderChar.id), String(leaderChar.name), Number(partyId)]);
        }
        const own = new Set((ownCharIds || []).map(Number));
        const wanted = (memberIds || []).map(Number);
        const [current] = await conn.query(
          "SELECT character_id FROM party_members WHERE party_id=?", [Number(partyId)]);
        const curIds = current.map((r) => Number(r.character_id));
        const toRemove = curIds.filter((id) => own.has(id) && !wanted.includes(id));
        const toAdd = wanted.filter((id) => !curIds.includes(id));
        for (const id of toRemove) {
          await conn.query("DELETE FROM party_members WHERE party_id=? AND character_id=?",
            [Number(partyId), id]);
        }
        let pos = 0;
        const allOrder = wanted.concat(
          curIds.filter((id) => !wanted.includes(id) && !toRemove.includes(id)));
        for (const id of allOrder) {
          pos += 1;
          if (toAdd.includes(id)) {
            await conn.query(
              "INSERT IGNORE INTO party_members (party_id,character_id,position) VALUES (?,?,?)",
              [Number(partyId), id, pos]);
          } else if (curIds.includes(id)) {
            await conn.query(
              "UPDATE party_members SET position=? WHERE party_id=? AND character_id=?",
              [pos, Number(partyId), id]);
          }
        }
        await conn.query("UPDATE parties SET roster_version=roster_version+1 WHERE id=?",
          [Number(partyId)]);
        await conn.commit();
        return true;
      } catch (e) { try { await conn.rollback(); } catch (e2) {} throw e; }
      finally { conn.release(); }
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

    /* ---------------- RMT (Real Money Trading) ----------------
     * Todas as mutações de saldo acontecem DENTRO de rmtTransact com a linha da
     * conta travada (FOR UPDATE) — nunca confie em leitura fora da transação. */
    async rmtTransact(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.query("BEGIN");
        const out = await fn(conn);
        await conn.query("COMMIT");
        return out;
      } catch (e) {
        try { await conn.query("ROLLBACK"); } catch (_) { }
        throw e;
      } finally {
        conn.release();
      }
    },
    async rmtSettingsGet() {
      const rows = await this.query("SELECT k, v FROM rmt_settings");
      const out = {}; for (const r of rows) out[r.k] = r.v;
      return out;
    },
    async rmtSettingsSet(k, v, by) {
      const old = await this.query("SELECT v FROM rmt_settings WHERE k=?", [String(k)]);
      await this.run("INSERT INTO rmt_settings (k, v, updated_by) VALUES (?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE v=VALUES(v), updated_by=VALUES(updated_by)",
        [String(k), String(v), String(by || "")]);
      await this.run("INSERT INTO rmt_settings_history (k, old_v, new_v, changed_by) VALUES (?, ?, ?, ?)",
        [String(k), old[0] ? String(old[0].v) : "", String(v), String(by || "")]);
      return true;
    },
    async rmtProfileGet(accountId) {
      const rows = await this.query("SELECT * FROM rmt_payment_profiles WHERE account_id=?", [Number(accountId)]);
      return rows[0] || null;
    },
    async rmtProfileUpsert(accountId, f) {
      await this.run(
        `INSERT INTO rmt_payment_profiles (account_id, holder_name, holder_document_enc, pix_key_type, pix_key_enc, verification_status)
         VALUES (?, ?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE holder_name=VALUES(holder_name), holder_document_enc=VALUES(holder_document_enc),
           pix_key_type=VALUES(pix_key_type), pix_key_enc=VALUES(pix_key_enc), verification_status='pending', verified_at=NULL`,
        [Number(accountId), String(f.holder_name || ""), f.holder_document_enc || null,
         f.pix_key_type || null, f.pix_key_enc || null]);
      return this.rmtProfileGet(accountId);
    },
    /* Reserva atômica: trava a conta, debita coins, insere request + ledger.
     * Retorna {error} ou {request}. Tudo dentro de rmtTransact (chamado por rmt.js). */
    async rmtRequestCreate(conn, req) {
      const acc = (await conn.query("SELECT id, coins FROM accounts WHERE id=? FOR UPDATE", [req.account_id]))[0][0];
      if (!acc) return { error: "ACCOUNT_NOT_FOUND" };
      const [upd] = await conn.query("UPDATE accounts SET coins=coins-? WHERE id=? AND coins>=?",
        [req.tc_amount, req.account_id, req.tc_amount]);
      if (!upd.affectedRows) return { error: "INSUFFICIENT_COINS" };
      const ins = await conn.query(
        `INSERT INTO rmt_requests (ticket_number, client_nonce, account_id, character_id, character_name,
           tc_amount, rate_unit_tc, rate_value_cents, gross_amount_cents, fee_amount_cents, net_amount_cents,
           holder_name, holder_document_enc, pix_key_type, pix_key_enc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.ticket_number, req.client_nonce, req.account_id, req.character_id || null,
         req.character_name || "", req.tc_amount, req.rate_unit_tc, req.rate_value_cents,
         req.gross_amount_cents, req.fee_amount_cents, req.net_amount_cents,
         req.holder_name || "", req.holder_document_enc || null,
         req.pix_key_type || "", req.pix_key_enc || null]);
      const coinsAfter = acc.coins - req.tc_amount;
      await conn.query(
        "INSERT INTO coin_ledger (account_id, login, kind, delta, coins_after, brl_cents, ref, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [req.account_id, req.login || "", "rmt_reserve", -req.tc_amount, coinsAfter, req.net_amount_cents,
         req.ticket_number, "Reserva RMT " + req.tc_amount + " TC"]);
      const rows = (await conn.query("SELECT * FROM rmt_requests WHERE id=?", [ins[0].insertId]))[0];
      return { request: rows[0], coins_after: coinsAfter };
    },
    async rmtRequestGet(id) {
      const rows = await this.query("SELECT * FROM rmt_requests WHERE id=?", [Number(id)]);
      return rows[0] || null;
    },
    async rmtRequestByNonce(nonce) {
      const rows = await this.query("SELECT * FROM rmt_requests WHERE client_nonce=?", [String(nonce)]);
      return rows[0] || null;
    },
    async rmtRequestList(f) {
      const w = [], p = [];
      if (f.accountId) { w.push("account_id=?"); p.push(Number(f.accountId)); }
      if (f.status) { w.push("status=?"); p.push(String(f.status)); }
      if (f.statusIn && f.statusIn.length) { w.push("status IN (" + f.statusIn.map(() => "?").join(",") + ")"); f.statusIn.forEach(s => p.push(s)); }
      if (f.from) { w.push("created_at>=?"); p.push(f.from); }
      if (f.to) { w.push("created_at<=?"); p.push(f.to); }
      const lim = Math.min(500, Math.max(1, Number(f.limit) || 100));
      return this.query(
        "SELECT * FROM rmt_requests" + (w.length ? " WHERE " + w.join(" AND ") : "") +
        " ORDER BY created_at DESC LIMIT " + lim, p);
    },
    /* Transição de estado atômica: UPDATE ... WHERE id=? AND status=?
     * Retorna o request atualizado ou {error:"BAD_STATE"} quando a fila mudou. */
    async rmtRequestTransition(conn, id, fromStates, patch) {
      const rows = (await conn.query("SELECT * FROM rmt_requests WHERE id=? FOR UPDATE", [Number(id)]))[0];
      const cur = rows[0];
      if (!cur) return { error: "NOT_FOUND" };
      if (fromStates && fromStates.length && !fromStates.includes(cur.status))
        return { error: "BAD_STATE", current: cur.status };
      const set = [], params = [];
      for (const k in patch) { set.push(k + "=?"); params.push(patch[k]); }
      if (set.length) {
        params.push(Number(id));
        await conn.query("UPDATE rmt_requests SET " + set.join(", ") + " WHERE id=?", params);
      }
      return { request: Object.assign({}, cur, patch), previous: cur };
    },
    /* Devolve as TC reservadas — somente uma vez por request (idem_released). */
    async rmtReleaseReserved(conn, requestId, accountId, tcAmount, ticket, login) {
      const rel = await conn.query("UPDATE rmt_requests SET idem_released=1 WHERE id=? AND idem_released=0", [requestId]);
      if (!rel[0].affectedRows) return { released: false };
      const acc = (await conn.query("SELECT coins FROM accounts WHERE id=? FOR UPDATE", [accountId]))[0][0];
      await conn.query("UPDATE accounts SET coins=coins+? WHERE id=?", [tcAmount, accountId]);
      await conn.query(
        "INSERT INTO coin_ledger (account_id, login, kind, delta, coins_after, brl_cents, ref, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [accountId, login || "", "rmt_release", tcAmount, (acc ? acc.coins : 0) + tcAmount, 0,
         ticket || "", "Devolução reserva RMT"]);
      return { released: true };
    },
    async rmtAdminLog(conn, row) {
      await (conn || pool).query(
        "INSERT INTO rmt_admin_logs (admin_id, admin_login, request_id, action, old_status, new_status, description, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [row.admin_id || null, row.admin_login || "", row.request_id || null,
         row.action || "", row.old_status || "", row.new_status || "",
         String(row.description || "").slice(0, 400), row.ip || ""]);
    },
    async rmtAdminLogs(opts) {
      const w = [], p = [];
      if (opts && opts.requestId) { w.push("request_id=?"); p.push(Number(opts.requestId)); }
      if (opts && opts.adminId) { w.push("admin_id=?"); p.push(Number(opts.adminId)); }
      const lim = Math.min(500, Math.max(1, Number(opts && opts.limit) || 200));
      return this.query("SELECT * FROM rmt_admin_logs" + (w.length ? " WHERE " + w.join(" AND ") : "") +
        " ORDER BY created_at DESC LIMIT " + lim, p);
    },
    async rmtReceiptAdd(row) {
      const r = await this.run(
        "INSERT INTO rmt_receipts (request_id, stored_name, original_name, sha256, size_bytes, mime, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [Number(row.request_id), row.stored_name || "", String(row.original_name || "").slice(0, 160),
         row.sha256 || "", Number(row.size_bytes) || 0, row.mime || "", row.uploaded_by || ""]);
      await this.run("UPDATE rmt_requests SET receipt_id=? WHERE id=?", [r.insertId, Number(row.request_id)]);
      return r.insertId;
    },
    async rmtReceipts(requestId) {
      return this.query("SELECT * FROM rmt_receipts WHERE request_id=? ORDER BY created_at", [Number(requestId)]);
    },
    async rmtAccountSummary(accountId) {
      const rows = await this.query(
        `SELECT status, COUNT(*) n, COALESCE(SUM(tc_amount),0) tc, COALESCE(SUM(net_amount_cents),0) cents
         FROM rmt_requests WHERE account_id=? GROUP BY status`, [Number(accountId)]);
      const out = { reservedTc: 0, pendingCents: 0, paidTc: 0, paidCents: 0, openTickets: 0 };
      for (const r of rows) {
        if (["pending", "under_review", "approved", "payment_processing"].includes(r.status)) {
          out.reservedTc += Number(r.tc); out.openTickets += Number(r.n);
        }
        if (["approved", "payment_processing"].includes(r.status)) out.pendingCents += Number(r.cents);
        if (r.status === "paid") { out.paidTc += Number(r.tc); out.paidCents += Number(r.cents); }
      }
      return out;
    },
    async rmtTreasury() {
      const rows = await this.query(
        `SELECT status, COUNT(*) n, COALESCE(SUM(tc_amount),0) tc, COALESCE(SUM(net_amount_cents),0) cents
         FROM rmt_requests GROUP BY status`);
      const out = { soldTc: 0, reservedTc: 0, monthTc: 0, paidCents: 0, committedCents: 0, pendingTickets: 0, reviewTickets: 0 };
      for (const r of rows) {
        if (r.status === "paid") { out.soldTc += Number(r.tc); out.paidCents += Number(r.cents); }
        if (["pending", "under_review", "approved", "payment_processing"].includes(r.status)) out.reservedTc += Number(r.tc);
        if (["approved", "payment_processing"].includes(r.status)) out.committedCents += Number(r.cents);
        if (r.status === "pending") out.pendingTickets += Number(r.n);
        if (r.status === "under_review") out.reviewTickets += Number(r.n);
      }
      const m = await this.query(
        "SELECT COALESCE(SUM(tc_amount),0) tc FROM rmt_requests WHERE status='paid' AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
      out.monthTc = Number(m[0] && m[0].tc) || 0;
      return out;
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
  // Verificação de e-mail (confirmação de conta): colunas adicionais migradas
  // em instalações já existentes sem recriar a tabela.
  for (const col of [
    "ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0",
    "ADD COLUMN email_code CHAR(6) DEFAULT NULL",
    "ADD COLUMN email_code_expires BIGINT UNSIGNED NOT NULL DEFAULT 0",
    /* Recuperação de senha por e-mail (código de 6 dígitos, 10 min). */
    "ADD COLUMN recovery_code CHAR(6) DEFAULT NULL",
    "ADD COLUMN recovery_code_expires BIGINT UNSIGNED NOT NULL DEFAULT 0",
    /* Identidade pública (chat/ranking/perfil) + progresso da CONTA. */
    "ADD COLUMN display_name VARCHAR(24) DEFAULT NULL",
    "ADD COLUMN level INT UNSIGNED NOT NULL DEFAULT 1",
    "ADD COLUMN exp BIGINT UNSIGNED NOT NULL DEFAULT 0",
    /* Verificação social (OAuth Twitch: id/login/follows por canal) —
     * gate do voucher do streamer; ver server/twitch.js. */
    "ADD COLUMN social MEDIUMTEXT NULL",
  ]) { try { await pool.query("ALTER TABLE accounts " + col); } catch (e) { /* já existe */ } }
  try { await pool.query("ALTER TABLE accounts ADD UNIQUE KEY uq_accounts_display_name (display_name)"); }
  catch (e) { /* já existe */ }
  // Backfill (uma vez): display_name = login; level/exp = maior char da conta.
  try {
    await pool.query("UPDATE accounts SET display_name = login WHERE display_name IS NULL");
    /* Backfill idempotente em JS: a versão em SQL morria inteira quando um
     * data blob não era JSON válido (JSON_EXTRACT aborta o UPDATE) e o
     * catch escondia — todas as contas ficaram level=1/exp=0. Agora roda
     * por conta, tolera data inválido e só SOBE o progresso da conta. */
    const [accRows] = await pool.query("SELECT id, level FROM accounts");
    for (const acc of accRows) {
      const [chars] = await pool.query(
        "SELECT level, data FROM characters WHERE account_id=?", [acc.id]);
      let lvl = 1, exp = 0;
      for (const c of chars) {
        let d = null;
        if (typeof c.data === "string") { try { d = JSON.parse(c.data); } catch (e) {} }
        else if (c.data && typeof c.data === "object") d = c.data;
        const cl = Math.max(1, Math.floor(Number(c.level) || 1),
          Math.floor(Number(d && d.level) || 1));
        const ce = Math.max(0, Math.floor(Number(d && d.exp) || 0));
        if (cl > lvl) { lvl = cl; exp = ce; }
        else if (cl === lvl && ce > exp) exp = ce;
      }
      if (lvl > Math.max(1, Math.floor(Number(acc.level) || 1)))
        await pool.query("UPDATE accounts SET level=?, exp=? WHERE id=?",
          [lvl, exp, acc.id]);
    }
  } catch (e) { console.error("[db] backfill level/exp da conta:", e && e.message); }
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    token CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    code VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_voucher_account (account_id, code)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS voucher_state (
    code VARCHAR(40) NOT NULL PRIMARY KEY,
    paused TINYINT(1) NOT NULL DEFAULT 0,
    deleted TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(60) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bans (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    character_id INT UNSIGNED DEFAULT NULL,
    char_name VARCHAR(40) NOT NULL DEFAULT '',
    reason VARCHAR(300) NOT NULL DEFAULT '',
    until DATETIME(3) DEFAULT NULL,
    banned_by VARCHAR(80) NOT NULL DEFAULT 'admin',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lifted_at DATETIME(3) DEFAULT NULL,
    lifted_by VARCHAR(80) DEFAULT NULL,
    INDEX idx_bans_account (account_id, lifted_at, until)
  ) ENGINE=InnoDB`);
  /* Silenciamentos de chat — persistem entre restarts (CHAT_BUS hidrata). */
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_mutes (
    account_id INT UNSIGNED PRIMARY KEY,
    \`until\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    \`by\` VARCHAR(80) NOT NULL DEFAULT 'admin',
    reason VARCHAR(300) NOT NULL DEFAULT '',
    char_name VARCHAR(40) NOT NULL DEFAULT '',
    at BIGINT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB`);
  /* Calendário global — eventos/metas por dia, editáveis por admin. */
  await pool.query(`CREATE TABLE IF NOT EXISTS calendar_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    day DATE NOT NULL,
    title VARCHAR(80) NOT NULL DEFAULT '',
    body VARCHAR(500) NOT NULL DEFAULT '',
    kind ENUM('evento','meta') NOT NULL DEFAULT 'evento',
    created_by VARCHAR(80) NOT NULL DEFAULT 'admin',
    created_at BIGINT UNSIGNED NOT NULL DEFAULT 0,
    INDEX idx_calendar_day (day)
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
    kind ENUM('hunt','boss','quest','pvp') NOT NULL,
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
  // kind: 'quest' entrou depois do schema inicial — alarga o enum nas VMs antigas.
  try{await pool.query("ALTER TABLE account_instances MODIFY kind ENUM('hunt','boss','quest','pvp') NOT NULL");}catch(e){}
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
    pending_invitee_id INT UNSIGNED
      GENERATED ALWAYS AS (IF(status = 'pending', invitee_id, NULL)) STORED,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    UNIQUE KEY uq_invite_pending (pending_invitee_id),
    INDEX idx_invites_party (party_id, status)
  ) ENGINE=InnoDB`);

  // uq_invite_pending antigo era (invitee_id, status): só 1 linha 'accepted'
  // (e 1 'declined'/etc) por personagem. Re-aceitar após sair da party
  // falhava com Duplicate entry 'N-accepted' depois do INSERT do membro.
  // Índice parcial via coluna gerada: UNIQUE só enquanto status='pending'.
  try {
    const [idxCols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'party_invites'
         AND INDEX_NAME = 'uq_invite_pending'
       ORDER BY SEQ_IN_INDEX`);
    const cols = (idxCols || []).map((r) => r.COLUMN_NAME);
    if (cols.length && !(cols.length === 1 && cols[0] === "pending_invitee_id")) {
      await pool.query("ALTER TABLE party_invites DROP INDEX uq_invite_pending");
    }
  } catch (e) { /* sem índice / sem permissão de schema */ }
  try {
    await pool.query(
      `ALTER TABLE party_invites
         ADD COLUMN pending_invitee_id INT UNSIGNED
           GENERATED ALWAYS AS (IF(status = 'pending', invitee_id, NULL)) STORED`);
  } catch (e) { /* já existe */ }
  try {
    await pool.query(
      "ALTER TABLE party_invites ADD UNIQUE KEY uq_invite_pending (pending_invitee_id)");
  } catch (e) { /* já existe */ }

  // ---- GUILDS ----
  // Guild é por CONTA: account_id é PK em guild_members (1 char representa
  // a conta inteira; bônus valem para a conta toda).
  await pool.query(`CREATE TABLE IF NOT EXISTS guilds (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(48) NOT NULL,
    level TINYINT UNSIGNED NOT NULL DEFAULT 1,
    exp INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_guilds_name (name)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_members (
    guild_id INT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    character_id INT UNSIGNED NOT NULL,
    rank ENUM('leader','vice','member') NOT NULL DEFAULT 'member',
    contribution INT UNSIGNED NOT NULL DEFAULT 0,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id),
    UNIQUE KEY uq_gmember_character (character_id),
    INDEX idx_gmembers_guild (guild_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_invites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id INT UNSIGNED NOT NULL,
    inviter_character_id INT UNSIGNED NOT NULL,
    invitee_character_id INT UNSIGNED NOT NULL,
    status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
    pending_invitee_id INT UNSIGNED
      GENERATED ALWAYS AS (IF(status = 'pending', invitee_character_id, NULL)) STORED,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ginv_pending (pending_invitee_id),
    INDEX idx_ginv_guild (guild_id, status)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id INT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    day CHAR(10) NOT NULL,
    slot TINYINT UNSIGNED NOT NULL,
    monster_slug VARCHAR(80) NOT NULL,
    target INT UNSIGNED NOT NULL,
    progress INT UNSIGNED NOT NULL DEFAULT 0,
    done TINYINT(1) NOT NULL DEFAULT 0,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_gtask (guild_id, account_id, day, slot),
    INDEX idx_gtask_member (account_id, day)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id INT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    character_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_greq (guild_id, account_id),
    INDEX idx_greq_account (account_id)
  ) ENGINE=InnoDB`);
  // GUILD POINTS + caixa + bônus comprados (níveis por chave)
  for (const col of [
    "ADD COLUMN points INT UNSIGNED NOT NULL DEFAULT 0",
    "ADD COLUMN balance BIGINT UNSIGNED NOT NULL DEFAULT 0",
    "ADD COLUMN bonuses JSON NULL",
    "ADD COLUMN temp_bonuses JSON NULL",
    "ADD COLUMN icon TINYINT UNSIGNED NOT NULL DEFAULT 1",
    "ADD COLUMN icon_at BIGINT UNSIGNED NOT NULL DEFAULT 0",
    "ADD COLUMN coins BIGINT UNSIGNED NOT NULL DEFAULT 0",
  ]) { try { await pool.query("ALTER TABLE guilds " + col); } catch (e) { /* já existe */ } }
  // Insígnia PvP (moeda de conta — o sistema PvP credita aqui no futuro)
  try { await pool.query("ALTER TABLE accounts ADD COLUMN pvp_insignias INT UNSIGNED NOT NULL DEFAULT 0"); }
  catch (e) { /* já existe */ }
  // Ordem da party da conta (party automática: o 1º char é o líder)
  try { await pool.query("ALTER TABLE accounts ADD COLUMN party_order JSON NULL"); }
  catch (e) { /* já existe */ }
  await pool.query(`CREATE TABLE IF NOT EXISTS guild_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id INT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    char_name VARCHAR(48) NOT NULL DEFAULT '',
    category ENUM('donation','purchase') NOT NULL,
    detail VARCHAR(200) NOT NULL DEFAULT '',
    gold_delta BIGINT NOT NULL DEFAULT 0,
    points_delta INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_glog_guild (guild_id, created_at),
    INDEX idx_glog_cat (guild_id, category)
  ) ENGINE=InnoDB`);
  try { await pool.query("ALTER TABLE guild_log ADD COLUMN coins_delta BIGINT NOT NULL DEFAULT 0"); }
  catch (e) { /* já existe */ }
  try { await pool.query("ALTER TABLE guild_log MODIFY COLUMN category ENUM('donation','purchase','pvp') NOT NULL"); }
  catch (e) { /* já existe */ }
  // Única migração do enum: inclui 'quest' (a versão antiga sem 'quest'
  // rodava depois e truncava instâncias de quest para '').
  try { await pool.query("ALTER TABLE account_instances MODIFY COLUMN kind ENUM('hunt','boss','quest','pvp') NOT NULL"); }
  catch (e) { /* já existe */ }

  // PvP guild-vs-guild: lobbies agendados, convites, rosters e histórico.
  await pool.query(`CREATE TABLE IF NOT EXISTS pvp_battles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    challenger_guild_id INT UNSIGNED NOT NULL,
    challenged_guild_id INT UNSIGNED NOT NULL,
    created_by INT UNSIGNED NOT NULL,
    map VARCHAR(24) NOT NULL,
    team_size TINYINT UNSIGNED NOT NULL,
    stake_type ENUM('gold','coins') NOT NULL DEFAULT 'gold',
    stake_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('pending','accepted','declined','cancelled','prep','live','finished') NOT NULL DEFAULT 'pending',
    scheduled_at BIGINT UNSIGNED NOT NULL,
    prepared_at BIGINT UNSIGNED NULL,
    started_at BIGINT UNSIGNED NULL,
    finished_at BIGINT UNSIGNED NULL,
    winner_guild_id INT UNSIGNED NULL,
    draw TINYINT(1) NOT NULL DEFAULT 0,
    overtime TINYINT UNSIGNED NOT NULL DEFAULT 0,
    scores VARCHAR(64) NULL,
    result MEDIUMTEXT NULL,
    host_account_id INT UNSIGNED NULL,
    instance_id VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pvp_status (status, scheduled_at),
    INDEX idx_pvp_guilds (challenger_guild_id, challenged_guild_id)
  ) ENGINE=InnoDB`);
  // Início rápido (test server): batalha começa 1 min após o aceite.
  try { await pool.query("ALTER TABLE pvp_battles ADD COLUMN quick TINYINT(1) NOT NULL DEFAULT 0"); }
  catch (e) { /* já existe */ }
  await pool.query(`CREATE TABLE IF NOT EXISTS pvp_battle_roster (
    battle_id INT UNSIGNED NOT NULL,
    team TINYINT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    char_ids VARCHAR(400) NOT NULL DEFAULT '[]',
    leader TINYINT(1) NOT NULL DEFAULT 0,
    online TINYINT(1) NOT NULL DEFAULT 0,
    kills INT UNSIGNED NOT NULL DEFAULT 0,
    deaths INT UNSIGNED NOT NULL DEFAULT 0,
    damage BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (battle_id, account_id),
    INDEX idx_pvp_roster_acc (account_id)
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
  try { await pool.query("ALTER TABLE accounts ADD COLUMN admin_perms MEDIUMTEXT NULL"); } catch (e) { }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN shared_inventory MEDIUMTEXT NULL"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN tutorial MEDIUMTEXT NULL"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN cosmetics MEDIUMTEXT NULL"); }
  catch(e) { /* já existe */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN friends MEDIUMTEXT NULL"); }
  catch(e) { /* já existe */ }
  /* Non-transferable Tibia Coins: pool separado, só gastável na STORE. */
  try { await pool.query("ALTER TABLE accounts ADD COLUMN coins_nt INT UNSIGNED NOT NULL DEFAULT 0"); }
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
  await pool.query(`CREATE TABLE IF NOT EXISTS store_orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    login VARCHAR(64) NOT NULL DEFAULT '',
    pack_id VARCHAR(32) NOT NULL,
    method VARCHAR(16) NOT NULL DEFAULT 'pix',
    brl DECIMAL(10,2) NOT NULL DEFAULT 0,
    coins INT UNSIGNED NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    mp_id VARCHAR(64) NOT NULL DEFAULT '',
    pix_qr MEDIUMTEXT,
    pix_copy TEXT,
    checkout_url TEXT,
    note VARCHAR(400) DEFAULT '',
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_store_acc (account_id, created_at),
    INDEX idx_store_status (status, created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS coin_ledger (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL,
    login VARCHAR(64) NOT NULL DEFAULT '',
    kind VARCHAR(16) NOT NULL DEFAULT 'other',
    delta INT NOT NULL DEFAULT 0,
    coins_after INT UNSIGNED NOT NULL DEFAULT 0,
    brl_cents INT UNSIGNED NOT NULL DEFAULT 0,
    ref VARCHAR(64) NOT NULL DEFAULT '',
    note VARCHAR(180) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ledger_acc (account_id, created_at),
    INDEX idx_ledger_kind (kind, created_at)
  ) ENGINE=InnoDB`);

  /* ---------- RMT (Real Money Trading) — recompra oficial de TC via PIX ----------
   * Ledger financeiro de coins reusa `coin_ledger` (kinds rmt_reserve/release/
   * purchase). Valores monetarios SEMPRE em centavos inteiros — nunca float.
   * PIX/CPF viajam criptografados (AES-256-GCM, helpers em server/rmt.js) e a
   * request guarda SNAPSHOT imutavel dos dados de recebimento. */
  await pool.query(`CREATE TABLE IF NOT EXISTS rmt_payment_profiles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id INT UNSIGNED NOT NULL UNIQUE,
    holder_name VARCHAR(120) NOT NULL DEFAULT '',
    holder_document_enc TEXT,
    pix_key_type ENUM('cpf','cnpj','email','phone','random') DEFAULT NULL,
    pix_key_enc TEXT,
    verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_rmt_profile_acc (account_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rmt_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_number VARCHAR(24) NOT NULL UNIQUE,
    client_nonce VARCHAR(64) NOT NULL UNIQUE,
    account_id INT UNSIGNED NOT NULL,
    character_id INT UNSIGNED DEFAULT NULL,
    character_name VARCHAR(32) NOT NULL DEFAULT '',
    tc_amount BIGINT UNSIGNED NOT NULL,
    rate_unit_tc BIGINT UNSIGNED NOT NULL,
    rate_value_cents BIGINT UNSIGNED NOT NULL,
    gross_amount_cents BIGINT UNSIGNED NOT NULL,
    fee_amount_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
    net_amount_cents BIGINT UNSIGNED NOT NULL,
    status ENUM('pending','under_review','approved','payment_processing','paid','rejected','cancelled') NOT NULL DEFAULT 'pending',
    holder_name VARCHAR(120) NOT NULL DEFAULT '',
    holder_document_enc TEXT,
    pix_key_type VARCHAR(16) NOT NULL DEFAULT '',
    pix_key_enc TEXT,
    admin_id INT UNSIGNED DEFAULT NULL,
    admin_login VARCHAR(64) NOT NULL DEFAULT '',
    rejection_reason TEXT,
    admin_note TEXT,
    idem_released TINYINT(1) NOT NULL DEFAULT 0,
    receipt_id INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    paid_at TIMESTAMP NULL,
    INDEX idx_rmt_acc (account_id, created_at),
    INDEX idx_rmt_status (status, created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rmt_admin_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_id INT UNSIGNED DEFAULT NULL,
    admin_login VARCHAR(64) NOT NULL DEFAULT '',
    request_id INT UNSIGNED DEFAULT NULL,
    action VARCHAR(32) NOT NULL,
    old_status VARCHAR(24) NOT NULL DEFAULT '',
    new_status VARCHAR(24) NOT NULL DEFAULT '',
    description VARCHAR(400) NOT NULL DEFAULT '',
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rmt_log_req (request_id, created_at),
    INDEX idx_rmt_log_admin (admin_id, created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rmt_settings (
    k VARCHAR(48) NOT NULL PRIMARY KEY,
    v VARCHAR(256) NOT NULL DEFAULT '',
    updated_by VARCHAR(64) NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rmt_settings_history (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    k VARCHAR(48) NOT NULL,
    old_v VARCHAR(256) NOT NULL DEFAULT '',
    new_v VARCHAR(256) NOT NULL DEFAULT '',
    changed_by VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rmt_set_hist (k, created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rmt_receipts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id INT UNSIGNED NOT NULL,
    stored_name VARCHAR(128) NOT NULL DEFAULT '',
    original_name VARCHAR(160) NOT NULL DEFAULT '',
    sha256 VARCHAR(64) NOT NULL DEFAULT '',
    size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
    mime VARCHAR(64) NOT NULL DEFAULT '',
    uploaded_by VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rmt_rcpt_req (request_id)
  ) ENGINE=InnoDB`);
}

/* Cria a instancia de db conforme o ambiente */
let _db = null;
async function getDb() {
  if (_db) return _db;
  if (MYSQL_HOST) {
    /* MYSQL_HOST configurado = backend fixo MySQL. O fallback silencioso
     * para o JsonStore fazia o servidor subir com OUTRO dataset (conta 1/1
     * aparecia com personagens diferentes conforme o MySQL local estava de
     * pé). Tenta por ~30s (cobre o XAMPP subindo junto no boot) e falha de
     * forma explícita em vez de trocar de banco sem avisar. */
    const attempts = Math.max(1, Number(process.env.DB_CONNECT_ATTEMPTS) || 12);
    let lastErr = null;
    for (let i = 1; i <= attempts; i++) {
      try {
        _db = await MysqlStore();
        console.log("[db] MySQL conectado em", MYSQL_HOST + ":" + MYSQL_PORT + "/" + MYSQL_DB);
        return _db;
      } catch (e) {
        lastErr = e;
        console.warn("[db] MySQL indisponível (" + e.message + ") — tentativa " + i + "/" + attempts);
        if (i < attempts) await new Promise((r) => setTimeout(r, 2500));
      }
    }
    throw new Error(
      "[db] MySQL configurado (" + MYSQL_HOST + ":" + MYSQL_PORT + "/" + MYSQL_DB +
      ") mas inacessível: " + (lastErr && lastErr.message) +
      ". Inicie o MySQL local (XAMPP) ou remova MYSQL_* do .env para usar o storage JSON.");
  }
  _db = new JsonStore();
  console.log("[db] storage JSON local em", DATA_DIR);
  /* Sem MYSQL_HOST o servidor serve o dataset de teste do JsonStore —
   * as contas/chars reais ficam no MySQL (server/.env). Aviso alto para
   * o caso clássico de subir `node server/server.js` da raiz (dotenv não
   * acha server/.env e cai aqui silenciosamente). */
  if (process.env.NODE_ENV !== "test" && !process.env.ALLOW_JSON_DB) {
    console.warn("[db] ATENÇÃO: rodando SEM MYSQL_HOST — dataset JSON local" +
      " (chars de teste). Para a DB principal inicie a partir de server/" +
      " (cd server && node server.js) ou use start-idle.bat.");
  }
  return _db;
}

module.exports = { getDb, MYSQL_HOST };
