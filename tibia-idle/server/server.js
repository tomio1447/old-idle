/*
 * server.js — API de contas do Global-Idle (login/register/save).
 *
 * Rotas:
 *   POST /api/register   { login, password, [email] }  -> cria conta
 *   POST /api/login      { login, password }           -> { token, account }
 *   GET  /api/me         (Authorization: Bearer token) -> { account, characters }
 *   GET  /api/admin/backup + snapshots                 -> recovery/auditoria
 *   GET  /api/sync/events (ticket SSE)                 -> eventos/replay
 *   POST /api/lease/*    { token, holder_id, ... }     -> controle exclusivo
 *   GET/PUT /api/instance                              -> instância persistente
 *   worker + /api/instance/tick                       -> combate autoritativo
 *   POST /api/characters { token, name, voc, data }    -> cria personagem
 *   PUT  /api/characters/:id { token, expected_version, data } -> save versionado
 *   POST /api/party/save { token, party_version, characters } -> save transacional
 *   POST /api/coins      { token, amount }             -> Admin altera Tibia Coins
 *
 * Uso:
 *   cd tibia-idle/server
 *   npm install
 *   node server.js            (usa .env ou defaults; sem MySQL usa JSON local)
 *   node seed.js              (cria a conta admin 1/1)
 */
"use strict";

require("dotenv").config();
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");
const party = require("./party");   // lógica de PARTY multiplayer
const { startInstanceWorker } = require("./instance_worker");
const { SyncBus } = require("./sync_bus");
const { initializeAuthority, materializeAuthority, advanceAuthorityState, protectedPlayer, maxStats } = require("./authoritative_engine");

const PORT = parseInt(process.env.PORT || "3333", 10);
const HOST = process.env.HOST || "0.0.0.0";
const SALT_ROUNDS = 10;
const TEST_SERVER = process.env.TEST_SERVER === "1";
const LEASE_TTL_MS=Math.max(500,parseInt(process.env.LEASE_TTL_MS||"120000",10)||120000);
const SESSION_TTL_MS=Math.max(1000,parseInt(process.env.SESSION_TTL_MS||"86400000",10)||86400000);
const INSTANCE_WORKER_INTERVAL_MS=Math.max(100,parseInt(process.env.INSTANCE_WORKER_INTERVAL_MS||"1000",10)||1000);
const INSTANCE_WORKER_MAX_STEP_MS=Math.max(100,parseInt(process.env.INSTANCE_WORKER_MAX_STEP_MS||"3600000",10)||3600000);
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, "..", "game"));
const SYNC_PROTOCOL="sse-v2";
const ALLOWED_ORIGINS=new Set(String(process.env.ALLOWED_ORIGINS||"").split(",").map((x)=>x.trim()).filter(Boolean));
let SYNC_BUS=null;
const RATE_BUCKETS=new Map(),TRUST_PROXY=process.env.TRUST_PROXY==="1",RATE_LIMIT_DISABLED=process.env.RATE_LIMIT_DISABLED==="1";
function publishSync(accountId,type,data){return SYNC_BUS?SYNC_BUS.publish(accountId,type,data):null;}
function allowedOrigin(req){const origin=req.headers.origin;if(!origin)return null;if(ALLOWED_ORIGINS.has(origin))return origin;
  try{if(new URL(origin).host===String(req.headers.host||""))return origin;}catch(e){}return false;}
function rateLimit(req,scope,max,windowMs){if(RATE_LIMIT_DISABLED)return null;const forwarded=TRUST_PROXY&&req.headers["x-forwarded-for"];
  const ip=String(forwarded||req.socket.remoteAddress||"unknown").split(",")[0].trim(),key=scope+":"+ip,now=Date.now();
  let row=RATE_BUCKETS.get(key);if(!row||row.resetAt<=now)row={count:0,resetAt:now+windowMs};row.count++;RATE_BUCKETS.set(key,row);
  if(RATE_BUCKETS.size>5000)for(const [k,v] of RATE_BUCKETS)if(v.resetAt<=now)RATE_BUCKETS.delete(k);
  return row.count>max?{code:429,body:{ok:false,error:"RATE_LIMITED",msg:"Muitas tentativas. Tente novamente mais tarde.",retryAfterMs:row.resetAt-now}}:null;}

/* ------------------------------- helpers ------------------------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function hardenedHeaders(res){const headers={
  "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://arena.ai https://*.arena.ai",
};if(res._corsOrigin){headers["Access-Control-Allow-Origin"]=res._corsOrigin;headers.Vary="Origin";}return headers;}
function sendSyncExpired(res,reason){
  res.writeHead(200,Object.assign(hardenedHeaders(res),{"Content-Type":"text/event-stream; charset=utf-8",
    "Cache-Control":"no-cache, no-transform","Connection":"close","X-Accel-Buffering":"no"}));
  res.end(`event: sync-expired\ndata: ${JSON.stringify({reason:reason||"ticket-invalid"})}\n\n`);
}
function send(res, code, obj) {
  const body = JSON.stringify(obj),headers=Object.assign(hardenedHeaders(res),{
    "Content-Type": "application/json; charset=utf-8","Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Headers": "Content-Type, Authorization","Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  res.writeHead(code,headers);res.end(body);
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}
function cloneJson(value){return JSON.parse(JSON.stringify(value||{}));}
function leaseHash(secret){return crypto.createHash("sha256").update(String(secret||"")).digest("hex");}
function validLeaseHolder(holder){return /^[A-Za-z0-9_-]{8,80}$/.test(String(holder||""));}
function leaseBody(secret,row,resumed){
  const expiresAt=new Date(row.expires_at).toISOString();
  return {ok:true,leaseToken:secret,holderId:row.holder_id,expiresAt,
    ttlMs:LEASE_TTL_MS,renewAfterMs:Math.min(5000,Math.max(1000,Math.floor(LEASE_TTL_MS/4))),resumed:!!resumed};
}
async function acquireLease(db,body,takeover){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const holder=String(body.holder_id||"");
  if(!validLeaseHolder(holder))return {code:400,body:{ok:false,error:"INVALID_LEASE_HOLDER",msg:"Identificador do navegador inválido"}};
  const now=Date.now(),expires=now+LEASE_TTL_MS,newSecret=newToken();
  if(takeover){
    const result=await db.leaseTakeover(acc.id,holder,leaseHash(newSecret),now,expires);
    publishSync(acc.id,"lease",{action:"takeover",holderId:holder,expiresAt:new Date(expires).toISOString()});
    return {code:200,body:leaseBody(newSecret,result.lease,false)};
  }
  const presented=String(body.lease_token||"");
  const previousHolder=validLeaseHolder(body.previous_holder_id)?String(body.previous_holder_id):"";
  const result=await db.leaseAcquire(acc.id,holder,previousHolder,presented?leaseHash(presented):"",
    leaseHash(newSecret),now,expires);
  if(!result.ok)return {code:409,body:{ok:false,error:"LEASE_HELD",
    msg:"Esta conta já está ativa em outra aba ou dispositivo.",
    expiresAt:result.lease&&new Date(result.lease.expires_at).toISOString()}};
  publishSync(acc.id,"lease",{action:result.resumed?"resume":"acquire",holderId:holder,
    expiresAt:new Date(expires).toISOString()});
  return {code:200,body:leaseBody(result.resumed?presented:newSecret,result.lease,result.resumed)};
}
async function renewLease(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const holder=String(body.holder_id||""),secret=String(body.lease_token||"");
  if(!validLeaseHolder(holder)||secret.length!==64)return {code:400,body:{ok:false,error:"INVALID_LEASE",msg:"Lease inválido"}};
  const now=Date.now(),result=await db.leaseRenew(acc.id,holder,leaseHash(secret),now,now+LEASE_TTL_MS);
  if(!result.ok)return {code:409,body:{ok:false,error:"LEASE_LOST",msg:"O controle desta conta foi transferido."}};
  return {code:200,body:leaseBody(secret,result.lease,true)};
}
async function releaseLease(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const holder=String(body.holder_id||""),secret=String(body.lease_token||"");
  let released=false;
  if(validLeaseHolder(holder)&&secret.length===64)released=await db.leaseRelease(acc.id,holder,leaseHash(secret));
  if(released)publishSync(acc.id,"lease",{action:"release",holderId:holder});
  return {code:200,body:{ok:true}};
}
async function requireLease(db,acc,body){
  const holder=String(body.holder_id||""),secret=String(body.lease_token||"");
  const valid=validLeaseHolder(holder)&&secret.length===64&&
    await db.leaseValidate(acc.id,holder,leaseHash(secret),Date.now());
  return valid?null:{code:423,body:{ok:false,error:"LEASE_REQUIRED",
    msg:"Esta aba não possui o controle ativo da conta."}};
}
async function issueSyncTicket(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const issued=SYNC_BUS.issueTicket(acc.id,body.token);
  return {code:200,body:{ok:true,ticket:issued.ticket,expiresAt:new Date(issued.expiresAt).toISOString(),cursor:SYNC_BUS.cursor()}};
}
async function publishPartyState(db,accountId,action){
  const party=await db.partyFindByAccount(accountId),members=party?await db.partyMembers(party.id):[];
  const summary=party?{id:Number(party.id),version:Number(party.roster_version),
    order:[Number(party.leader_id)].concat(members.map((m)=>Number(m.id)))}:null;
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(accountId,"party",party?party.id:"none",
    party?party.roster_version:0,action,{party,members},true);
  publishSync(accountId,"party",{action,party:summary});
}
async function syncState(db,token){
  const acc=await db.findAccountByToken(token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const chars=await db.charactersOf(acc.id),party=await db.partyFindByAccount(acc.id),instance=await db.instanceGet(acc.id);
  const members=party?await db.partyMembers(party.id):[];
  return {code:200,body:{ok:true,cursor:SYNC_BUS.cursor(),
    characters:chars.map((c)=>({id:Number(c.id),saveVersion:Number(c.save_version)||0})),
    party:party?{id:Number(party.id),version:Number(party.roster_version),
      order:[Number(party.leader_id)].concat(members.map((m)=>Number(m.id)))}:null,
    instance:instance?instanceSummary(instance,false):null}};
}

const MIME = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".png":"image/png", ".gif":"image/gif", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".webp":"image/webp", ".svg":"image/svg+xml",
  ".otbm":"application/octet-stream", ".ogg":"audio/ogg", ".mp3":"audio/mpeg",
};

function sendText(res, code, body, type) {
  body = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(code,Object.assign(hardenedHeaders(res),{
    "Content-Type": type || "text/plain; charset=utf-8",
    "Content-Length": body.length,"Cache-Control":"no-cache",
  }));
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname || "/"); }
  catch (e) { sendText(res, 400, "URL inválida"); return; }
  if (relative === "/") relative = "/index.html";
  const file = path.resolve(STATIC_DIR, relative.replace(/^\/+/, ""));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + path.sep)) {
    sendText(res, 403, "Acesso negado"); return;
  }
  fs.stat(file, (statErr, stat) => {
    const target = !statErr && stat.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(target, (error, data) => {
      if (error) { sendText(res, 404, "Arquivo não encontrado"); return; }
      const type = MIME[path.extname(target).toLowerCase()] || "application/octet-stream";
      if (req.method === "HEAD") {
        res.writeHead(200,Object.assign(hardenedHeaders(res),{ "Content-Type":type, "Content-Length":data.length, "Cache-Control":"no-cache" }));
        res.end();
      } else sendText(res, 200, data, type);
    });
  });
}

async function ensureTestAccounts(db) {
  if (!TEST_SERVER) return;
  for (const credential of [
    { login:"1", password:"1" },
    { login:"2", password:"2" },
  ]) {
    const hash = bcrypt.hashSync(credential.password, SALT_ROUNDS);
    const existing = await db.findAccountByLogin(credential.login);
    if (!existing) {
      await db.createAccount(credential.login, hash, "admin", 1000);
    } else if (typeof db.run === "function") {
      await db.run("UPDATE accounts SET password_hash = ?, role = 'admin' WHERE id = ?", [hash, existing.id]);
    } else {
      existing.password_hash = hash;
      existing.role = "admin";
      existing.coins = Math.max(1000, existing.coins || 0);
      db._save();
    }
  }
  console.log("[test-server] contas liberadas: 1/1 e 2/2; Admin habilitado");
}

/* ------------------------------ rotas ------------------------------ */

async function register(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  if (login.length < 1 || login.length > 32) return { code: 400, body: { ok: false, msg: "Login inválido (1-32 caracteres)" } };
  if (password.length < 1) return { code: 400, body: { ok: false, msg: "Senha obrigatória" } };
  const exist = await db.findAccountByLogin(login);
  // Duplicidade é erro de formulário, não falha de transporte. Responder
  // 200 evita o falso "Failed to load resource" no console; `ok:false`
  // continua impedindo sobrescrever ou acessar a conta existente.
  if (exist) return { code: 200, body: { ok: false, error: "ACCOUNT_EXISTS",
    msg: "Conta já existe. Use a aba Entrar." } };
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const acc = await db.createAccount(login, hash, "user", 0);
  return { code: 201, body: { ok: true, id: acc.id, login: acc.login, role: acc.role } };
}

function accountCharacterSummary(character) {
  let data = character && character.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (e) { data = {}; }
  }
  data = data && typeof data === "object" ? data : {};
  const wrongId=data.id!==undefined&&String(data.id)!==String(character.id);
  const wrongName=!!(data.name&&String(data.name).toLowerCase()!==String(character.name).toLowerCase());
  return {
    id:character.id, name:character.name, voc:character.voc,
    level:character.level, saveVersion:Number(character.save_version)||0,
    sex:data.sex || "male", promoted:!!data.promoted,
    outfit:data.outfit && typeof data.outfit === "object" ? data.outfit : null,
    identityMismatch:wrongId||wrongName,
    dataOwnerId:wrongId?String(data.id):null,
    dataOwnerName:wrongName?String(data.name):null,
    snapshot:data,
  };
}

async function login(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const acc = await db.findAccountByLogin(login);
  if (!acc || !bcrypt.compareSync(password, acc.password_hash)) {
    return { code: 401, body: { ok: false, msg: "Login ou senha inválidos" } };
  }
  const token = newToken();
  // Novo login transfere a sessão e encerra streams/tickets anteriores antes
  // de persistir o token substituto.
  if(SYNC_BUS)SYNC_BUS.revokeAccount(acc.id);
  if (typeof db.createSession === "function") await db.createSession(acc.id,token,Date.now()+SESSION_TTL_MS);
  const characters = await db.charactersOf(acc.id);
  return {
    code: 200,
    body: {
      ok: true,
      token,
      account: { id: acc.id, login: acc.login, role: acc.role, coins: acc.coins || 0 },
      characters: characters.map(accountCharacterSummary),
    },
  };
}

async function me(db, token) {
  if (!token) return { code: 401, body: { ok: false, msg: "Sem token" } };
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const characters = await db.charactersOf(acc.id);
  return {
    code: 200,
    body: {
      ok: true,
      account: { id: acc.id, login: acc.login, role: acc.role, coins: acc.coins || 0 },
      characters: characters.map(accountCharacterSummary),
    },
  };
}

function sanitizeNewPlayer(payload,voc){
  const safe={id:payload.id,name:payload.name,voc,sex:payload.sex==="female"?"female":"male",
    outfit:payload.outfit&&typeof payload.outfit==="object"?payload.outfit:null,
    config:payload.config&&typeof payload.config==="object"?payload.config:{},level:1,exp:0,
    skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:10},
    skillTries:{fist:0,sword:0,axe:0,club:0,dist:0,shield:0},ml:0,manaSpent:0,gold:0,
    kills:{},totalKills:0,bosses:{},missions:{},lootPouch:{},rewardChest:[],bag:{},ammo:{},
    supplies:{"health-potion":20,"mana-potion":20},equip:{},stamina:42*3600};
  if(voc==="knight")safe.equip={weapon:{item:"sword",count:1},shield:{item:"wooden-shield",count:1}};
  else if(voc==="paladin")safe.equip={weapon:{item:"bow",count:1},shield:{item:"quiver",count:1},ammo:{item:"simple-arrow",count:1}};
  else if(voc==="monk")safe.equip={weapon:{item:"simple-jo-staff",count:1}};
  const stats=maxStats(safe);safe.hp=stats.hp;safe.mp=stats.mp;return safe;
}

async function logout(db,body){
  const token=String(body.token||"");if(!token)return {code:400,body:{ok:false,msg:"Token obrigatório"}};
  if(SYNC_BUS)SYNC_BUS.revokeSession(token);
  if(typeof db.revokeSession==="function")await db.revokeSession(token);
  return {code:200,body:{ok:true}};
}

async function createCharacter(db, body) {
  const token = body.token;
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 20) return { code: 400, body: { ok: false, msg: "Nome inválido" } };
  if (await db.findCharacterByName(name)) return { code: 409, body: { ok: false, msg: "Nome já em uso" } };
  const voc = String(body.voc || "none");
  let payload=body.data;if(typeof payload==="string"){try{payload=JSON.parse(payload);}catch(e){payload={};}}
  payload=payload&&typeof payload==="object"?payload:{};
  payload=sanitizeNewPlayer(Object.assign({},payload,{name}),voc);
  const existingCharacters=await db.charactersOf(acc.id);
  const c = await db.createCharacter(acc.id, name, voc, 1, JSON.stringify(payload));
  payload.id=String(c.id);payload.name=c.name;payload.voc=voc;payload.level=1;
  const data=JSON.stringify(payload);
  const normalized=await db.updateCharacter(c.id,voc,1,data);
  // Bônus inicial é concedido pelo servidor uma única vez, no primeiro char.
  // O cliente nunca recebe permissão para fabricar saldo premium.
  if(!existingCharacters.length)await db.updateCoins(acc.id,(acc.coins||0)+25);
  const updatedAccount=await db.findAccountById(acc.id);
  const createdCharacter=normalized||Object.assign({},c,{data,save_version:1});
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",createdCharacter.id,
    createdCharacter.save_version,"created",createdCharacter,true);
  publishSync(acc.id,"character",{id:Number(createdCharacter.id),saveVersion:Number(createdCharacter.save_version),action:"created"});
  return { code: 201, body: { ok: true,
    character: accountCharacterSummary(createdCharacter),
    coins:updatedAccount ? updatedAccount.coins||0 : acc.coins||0 } };
}

async function loadCharacter(db, token, id) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code:401, body:{ok:false,msg:"Sessão inválida"} };
  const character = await db.findCharacter(id);
  if (!character || Number(character.account_id) !== Number(acc.id))
    return { code:404, body:{ok:false,msg:"Personagem não encontrado"} };
  return {
    code:200,
    body:{
      ok:true,
      character:{
        id:character.id, name:character.name, voc:character.voc,
        level:character.level, saveVersion:Number(character.save_version)||0,
        data:character.data,
      },
    },
  };
}

function prepareCharacterSave(c,body){
  let payload=body.data;
  if(typeof payload==="string"){
    try{payload=JSON.parse(payload);}catch(e){return {error:{code:400,body:{ok:false,error:"INVALID_SAVE_JSON",msg:"Save JSON inválido"}}};}
  }
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    return {error:{code:400,body:{ok:false,error:"INVALID_SAVE_DATA",msg:"Save inválido"}}};
  const wrongId=payload.id!==undefined&&String(payload.id)!==String(c.id);
  const wrongName=!!(payload.name&&String(payload.name).toLowerCase()!==String(c.name).toLowerCase());
  if(wrongId||wrongName)return {error:{code:409,body:{ok:false,error:"CHARACTER_IDENTITY_MISMATCH",
    msg:"Save bloqueado: os dados pertencem a outro personagem."}}};
  // Identidade e progressão são server-owned. Saves comuns só persistem
  // preferências/visual; XP, skills, gold, kills, bless e cooldowns vêm das
  // transações autoritativas (ou das ferramentas Admin explícitas).
  let current={};try{current=typeof c.data==="string"?JSON.parse(c.data):(c.data||{});}catch(e){}
  const protectedKeys=["exp","skills","skillTries","ml","manaSpent","gold","kills","totalKills",
    "bosses","missions","lootPouch","rewardChest","blessed","deathLog"];
  payload=Object.assign({},payload,{id:String(c.id),name:c.name,voc:c.voc});
  for(const key of protectedKeys)if(current[key]!==undefined)payload[key]=cloneJson(current[key]);
  const level=Math.max(1,Number(c.level)||1);payload.level=level;
  return {save:{
    id:Number(c.id),expectedVersion:Number(body.expected_version),voc:c.voc,level,
    data:JSON.stringify(payload),extra:{
      hp:Math.max(0,Math.floor(Number.isFinite(Number(body.hp))?Number(body.hp):(Number(payload.hp)||0))),
      mp:Math.max(0,Math.floor(Number.isFinite(Number(body.mp))?Number(body.mp):(Number(payload.mp)||0))),
      max_hp:Math.max(0,Math.floor(Number(body.maxHp)||0)),
      max_mp:Math.max(0,Math.floor(Number(body.maxMp)||0)),
    },
  }};
}

async function enforceAuthoritativeProgress(db,accountId,prepared){
  const row=await db.instanceGet(accountId);if(!row||row.status!=="active")return prepared;
  let descriptor=null;try{descriptor=typeof row.state==="string"?JSON.parse(row.state):row.state;}catch(e){}
  const player=protectedPlayer(descriptor,prepared.save.id);if(!player)return prepared;
  prepared.save.data=JSON.stringify(player);prepared.save.level=Math.max(1,Number(player.level)||1);
  prepared.save.voc=String(player.voc||prepared.save.voc);prepared.save.extra.hp=Math.max(0,Number(player.hp)||0);
  prepared.save.extra.mp=Math.max(0,Number(player.mp)||0);return prepared;
}

function saveConflictResponse(result){
  if(result.error==="SAVE_VERSION_CONFLICT")return {code:409,body:{ok:false,error:result.error,
    msg:"O save foi alterado por outra sessão.",characters:(result.characters||[]).map(accountCharacterSummary)}};
  if(result.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:result.error,
    msg:"O controle desta conta foi transferido antes do save terminar."}};
  return {code:result.error==="CHARACTER_NOT_FOUND"?404:409,body:{ok:false,error:result.error,
    msg:"Não foi possível salvar o estado solicitado."}};
}

async function saveCharacter(db, body, id) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const expected=Number(body.expected_version);
  if(!Number.isSafeInteger(expected)||expected<0)return {code:428,body:{ok:false,error:"SAVE_VERSION_REQUIRED",
    msg:"Atualize o personagem antes de salvar."}};
  const c = await db.findCharacter(id);
  if (!c || Number(c.account_id) !== Number(acc.id)) return { code: 404, body: { ok: false, msg: "Personagem não encontrado" } };
  let prepared=prepareCharacterSave(c,body);if(prepared.error)return prepared.error;
  prepared=await enforceAuthoritativeProgress(db,acc.id,prepared);
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const result=await db.saveCharactersVersioned(acc.id,[prepared.save],lease);
  if(!result.ok)return saveConflictResponse(result);
  const updated=result.characters[0];
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,"save",updated,false);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),source:"save"});
  return {code:200,body:{ok:true,saveVersion:Number(updated.save_version),character:accountCharacterSummary(updated)}};
}

async function savePartyCharacters(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const partyId=Number(body.party_id),partyVersion=Number(body.party_version);
  const order=Array.isArray(body.party_order)?body.party_order.map(Number):[];
  const entries=Array.isArray(body.characters)?body.characters:[];
  if(!Number.isSafeInteger(partyId)||partyId<=0||!Number.isSafeInteger(partyVersion)||partyVersion<1)
    return {code:428,body:{ok:false,error:"PARTY_VERSION_REQUIRED",msg:"Atualize a party antes de salvar."}};
  if(!order.length||order.some((id)=>!Number.isSafeInteger(id)||id<=0)||new Set(order).size!==order.length||
     !entries.length||entries.length>5)
    return {code:400,body:{ok:false,error:"INVALID_PARTY_SAVE",msg:"Save da party inválido."}};
  const owned=await db.partyFindByAccount(acc.id);
  if(!owned||Number(owned.id)!==partyId)return {code:403,body:{ok:false,error:"PARTY_NOT_OWNER",
    msg:"A party não pertence à sua conta."}};
  const saves=[];
  for(const entry of entries){
    const expected=Number(entry.expected_version);
    if(!Number.isSafeInteger(expected)||expected<0)return {code:428,body:{ok:false,error:"SAVE_VERSION_REQUIRED",
      msg:"Atualize todos os personagens antes de salvar a party."}};
    const c=await db.findCharacter(Number(entry.id));
    if(!c||Number(c.account_id)!==Number(acc.id))return {code:403,body:{ok:false,error:"PARTY_CHARACTER_NOT_OWNED",
      msg:"A party contém um personagem que não pertence à sua conta."}};
    let prepared=prepareCharacterSave(c,entry);if(prepared.error)return prepared.error;
    prepared=await enforceAuthoritativeProgress(db,acc.id,prepared);saves.push(prepared.save);
  }
  if(new Set(saves.map((save)=>save.id)).size!==saves.length)
    return {code:400,body:{ok:false,error:"INVALID_PARTY_SAVE",msg:"Personagem duplicado no save da party."}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const result=await db.savePartyCharactersVersioned(acc.id,partyId,partyVersion,order,saves,lease);
  if(!result.ok){
    if(result.error==="PARTY_VERSION_CONFLICT"){
      const current=await db.partyFindByAccount(acc.id),members=current?await db.partyMembers(current.id):[];
      return {code:409,body:{ok:false,error:result.error,msg:"A composição da party mudou.",
        party:current?{id:Number(current.id),version:Number(current.roster_version),
          order:[Number(current.leader_id)].concat(members.map((m)=>Number(m.id)))}:null}};
    }
    return saveConflictResponse(result);
  }
  if(typeof db.snapshotAdd==="function")for(const character of result.characters)
    await db.snapshotAdd(acc.id,"character",character.id,character.save_version,"party-save",character,false);
  publishSync(acc.id,"character",{ids:result.characters.map((c)=>Number(c.id)),
    saveVersions:result.characters.map((c)=>Number(c.save_version)),source:"party-save"});
  return {code:200,body:{ok:true,partyVersion,
    characters:result.characters.map(accountCharacterSummary)}};
}

function instanceSummary(row,includeState){
  if(!row)return null;let state=null;
  if(includeState&&row.state){try{state=typeof row.state==="string"?JSON.parse(row.state):row.state;}catch(e){state=null;}}
  return {id:row.instance_id,version:Number(row.version)||0,status:row.status,kind:row.kind,
    huntId:row.hunt_id||null,bossId:row.boss_id||null,instanceMode:row.instance_mode,
    partyId:row.party_id?Number(row.party_id):null,partyVersion:row.party_version?Number(row.party_version):null,
    activeCharacterId:String(row.active_character_id),savedAt:new Date(row.saved_at).getTime(),
    startedAt:new Date(row.started_at).getTime(),workerCursorAt:new Date(row.worker_cursor_at||row.saved_at).getTime(),
    workerTotalMs:Number(row.worker_total_ms)||0,terminalReason:row.terminal_reason||null,state};
}
async function loadInstance(db,token){
  const acc=await db.findAccountByToken(token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const row=await db.instanceGet(acc.id);
  if(!row||row.status!=="active")return {code:200,body:{ok:true,instance:null,lastStatus:row?row.status:null,
    terminalReason:row&&row.terminal_reason||null}};
  const summary=instanceSummary(row,true);
  if(!summary.state)return {code:500,body:{ok:false,error:"INSTANCE_STATE_INVALID",msg:"Snapshot da instância está corrompido"}};
  return {code:200,body:{ok:true,instance:summary}};
}
async function prepareInstanceState(db,acc,input){
  if(!input||typeof input!=="object"||Array.isArray(input))
    return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_STATE",msg:"Snapshot da instância inválido"}}};
  const kind=input.kind==="boss"?"boss":input.kind==="hunt"?"hunt":null;
  const idPattern=/^[a-z0-9][a-z0-9_-]{0,63}$/;
  const huntId=input.huntId?String(input.huntId):null,bossId=input.bossId?String(input.bossId):null;
  if(!kind||(kind==="hunt"&&!idPattern.test(huntId||""))||(kind==="boss"&&!idPattern.test(bossId||"")))
    return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_KIND",msg:"Hunt/boss inválido"}}};
  const mode=["non-pvp","pvp","boss"].includes(String(input.instanceMode))?String(input.instanceMode):
    (kind==="boss"?"boss":"non-pvp");
  const members=Array.isArray(input.members)?input.members:[];
  if(!members.length||members.length>5)return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_MEMBERS",msg:"Membros da instância inválidos"}}};
  const ids=members.map((member)=>Number(member&&member.id));
  if(ids.some((id)=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)
    return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_MEMBERS",msg:"Membros duplicados ou inválidos"}}};
  const rows=[];
  for(let index=0;index<ids.length;index++){
    const id=ids[index],c=await db.findCharacter(id),member=members[index]||{},player=member.p||{};
    if(!c||Number(c.account_id)!==Number(acc.id))return {error:{code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",
      msg:"A instância contém personagem de outra conta"}}};
    if((player.id!==undefined&&String(player.id)!==String(c.id))||
       (player.name&&String(player.name).toLowerCase()!==String(c.name).toLowerCase()))
      return {error:{code:409,body:{ok:false,error:"INSTANCE_IDENTITY_MISMATCH",msg:"Snapshot contém identidade cruzada"}}};
    let canonical={};try{canonical=typeof c.data==="string"?JSON.parse(c.data):(c.data||{});}catch(e){}
    canonical=Object.assign({},canonical,{id:String(c.id),name:c.name,voc:c.voc,level:Number(c.level)||1});
    if(Number(c.hp)>0)canonical.hp=Number(c.hp);if(Number(c.mp)>=0)canonical.mp=Number(c.mp);
    member.p=canonical;member.hp=canonical.hp;member.mp=canonical.mp;rows.push(c);
  }
  const activeId=Number(input.activeCharacterId);
  if(!ids.includes(activeId))return {error:{code:400,body:{ok:false,error:"INVALID_ACTIVE_CHARACTER",msg:"Personagem ativo fora da instância"}}};
  if(input.state&&Array.isArray(input.state.players)){
    // Ordem visual e referências compartilhadas não são autoridade. Rejeite
    // somente entidades estrangeiras/duplicadas e reconstrua ausentes na
    // ordem validada de `members` (snapshots antigos podiam conter null).
    const visualById=new Map();
    for(const ent of input.state.players){
      if(!ent)continue;const visualId=Number(ent.id!==undefined?ent.id:(ent.p&&ent.p.id));
      if(!ids.includes(visualId))return {error:{code:400,body:{ok:false,error:"INSTANCE_STATE_MEMBERS_MISMATCH",
        msg:"Entidade não pertence aos membros da instância"}}};
      if(visualById.has(visualId))return {error:{code:400,body:{ok:false,error:"INSTANCE_STATE_MEMBERS_MISMATCH",
        msg:"Entidade duplicada na instância"}}};
      visualById.set(visualId,ent);
    }
    input.state.players=ids.map((id,index)=>{
      const ent=Object.assign({},visualById.get(id)||{id:String(id)});
      ent.id=String(id);ent.p=cloneJson(members[index].p);return ent;
    });
  }
  let partyId=null,partyVersion=null;
  const party=await db.partyFindByAccount(acc.id),partyMembers=party?await db.partyMembers(party.id):[];
  const controlled=[];
  if(party){
    const order=[Number(party.leader_id)].concat(partyMembers.map((m)=>Number(m.id)));
    for(const id of order){const c=await db.findCharacter(id);if(c&&Number(c.account_id)===Number(acc.id))controlled.push(id);}
  }
  // Se o personagem ativo participa da party controlada, nenhum snapshot
  // pode deixá-la parcialmente para trás. Chars da conta fora do roster ainda
  // podem possuir instância solo própria.
  if(ids.length>1||(party&&controlled.includes(activeId))){
    if(!party)return {error:{code:409,body:{ok:false,error:"INSTANCE_PARTY_REQUIRED",msg:"Party não encontrada"}}};
    if(controlled.length!==ids.length||controlled.some((id,index)=>id!==ids[index]))
      return {error:{code:409,body:{ok:false,error:"INSTANCE_PARTY_MISMATCH",msg:"Composição/ordem da instância difere da party"}}};
    partyId=Number(party.id);partyVersion=Number(party.roster_version);
  }
  const now=Date.now(),state=Object.assign({},input,{v:1,savedAt:now,kind,huntId,bossId,
    instanceMode:mode,activeCharacterId:String(activeId)});
  return {state,meta:{kind,hunt_id:huntId,boss_id:bossId,instance_mode:mode,party_id:partyId,
    party_version:partyVersion,member_ids:ids,active_character_id:activeId,
    saved_at:new Date(now),startedAt:new Date(now).toISOString()}};
}
async function saveInstance(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const expected=Number(body.expected_version);
  if(!Number.isSafeInteger(expected)||expected<0)return {code:428,body:{ok:false,error:"INSTANCE_VERSION_REQUIRED",msg:"Atualize a instância antes de salvar"}};
  const prepared=await prepareInstanceState(db,acc,body.state);if(prepared.error)return prepared.error;
  let instanceId=String(body.instance_id||"");
  if(expected===0){
    instanceId=newToken();prepared.state=initializeAuthority(prepared.state,instanceId,Date.now());
  }else{
    if(!/^[a-f0-9]{64}$/.test(instanceId))return {code:400,body:{ok:false,error:"INVALID_INSTANCE_ID",msg:"Instância inválida"}};
    const current=await db.instanceGet(acc.id);let currentState=null;
    try{currentState=current&&current.state?(typeof current.state==="string"?JSON.parse(current.state):current.state):null;}catch(e){}
    if(currentState&&currentState.authority){prepared.state.authority=currentState.authority;prepared.state=materializeAuthority(prepared.state);}
  }
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const result=await db.instanceSave(acc.id,instanceId,expected,prepared.meta,JSON.stringify(prepared.state),lease);
  if(!result.ok){
    if(result.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:result.error,msg:"Controle transferido durante o save"}};
    return {code:409,body:{ok:false,error:result.error,msg:"A instância foi alterada por outra sessão",
      instance:instanceSummary(result.instance,true)}};
  }
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"instance",result.instance.instance_id,
    result.instance.version,expected===0?"created":"checkpoint",result.instance,expected===0);
  publishSync(acc.id,"instance",{id:result.instance.instance_id,version:Number(result.instance.version),
    status:result.instance.status,source:expected===0?"created":"checkpoint",holderId:String(body.holder_id||"")});
  return {code:200,body:{ok:true,instance:instanceSummary(result.instance,false)}};
}
async function tickInstance(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const expected=body.expected_version===undefined||body.expected_version===null?null:Number(body.expected_version);
  if(expected!==null&&(!Number.isSafeInteger(expected)||expected<1))
    return {code:400,body:{ok:false,error:"INVALID_INSTANCE_VERSION",msg:"Versão inválida"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const result=await db.instanceAuthorityTick(acc.id,expected,Date.now(),3600000,advanceAuthorityState,lease);
  if(!result.ok){
    // Tick é idempotente: ausência/terminal entre GET e POST não é falha de
    // transporte e não deve poluir o console com HTTP 410.
    if(result.error==="INSTANCE_NOT_ACTIVE")return {code:200,body:{ok:true,instance:null,
      terminalReason:"inactive",characters:[],elapsed:0}};
    return {code:result.error==="LEASE_REQUIRED"?423:409,
      body:{ok:false,error:result.error,msg:"Tick autoritativo recusado",instance:instanceSummary(result.instance,true)}};
  }
  if(typeof db.snapshotAdd==="function"&&(result.terminalReason||Number(result.instance.version)%120===0))
    await db.snapshotAdd(acc.id,"instance",result.instance.instance_id,result.instance.version,
      result.terminalReason||"tick",result.instance,!!result.terminalReason);
  publishSync(acc.id,"instance",{id:result.instance.instance_id,version:Number(result.instance.version),
    status:result.instance.status,terminalReason:result.terminalReason||null,source:"tick",holderId:String(body.holder_id||""),
    characterVersions:(result.characters||[]).map((c)=>({id:Number(c.id),saveVersion:Number(c.save_version)}))});
  return {code:200,body:{ok:true,elapsed:result.elapsed||0,terminalReason:result.terminalReason||null,
    instance:instanceSummary(result.instance,true),characters:(result.characters||[]).map(accountCharacterSummary)}};
}

async function endInstance(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const id=String(body.instance_id||""),expected=Number(body.expected_version);
  if(!/^[a-f0-9]{64}$/.test(id)||!Number.isSafeInteger(expected)||expected<1)
    return {code:400,body:{ok:false,error:"INVALID_INSTANCE_END",msg:"Instância inválida"}};
  const reason=String(body.reason||"finished").replace(/[^a-z0-9_-]/gi,"").slice(0,40)||"finished";
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const result=await db.instanceEnd(acc.id,id,expected,reason,lease);
  if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:409,body:{ok:false,error:result.error,
    msg:result.error==="LEASE_REQUIRED"?"Controle transferido durante o encerramento":"A instância foi alterada",
    instance:instanceSummary(result.instance,true)}};
  if(typeof db.snapshotAdd==="function"&&result.instance)await db.snapshotAdd(acc.id,"instance",
    result.instance.instance_id,result.instance.version,"ended-"+reason,result.instance,true);
  publishSync(acc.id,"instance",{id:result.instance&&result.instance.instance_id||id,
    version:Number(result.instance&&result.instance.version)||expected,status:"ended",terminalReason:reason,source:"end",
    holderId:String(body.holder_id||"")});
  return {code:200,body:{ok:true,instance:instanceSummary(result.instance,false)}};
}

/* Recuperação explícita para saves cruzados por versões antigas. Recria os
 * dados enviados pelo dono, mas mantém id/nome/level da linha correta. */
async function repairCharacterIdentity(db,body,id){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const c=await db.findCharacter(id);
  if(!c||Number(c.account_id)!==Number(acc.id))return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  let current=c.data;if(typeof current==="string"){try{current=JSON.parse(current);}catch(e){current={};}}
  current=current&&typeof current==="object"?current:{};
  const identityMismatch=(current.id!==undefined&&String(current.id)!==String(c.id))||
    !!(current.name&&String(current.name).toLowerCase()!==String(c.name).toLowerCase());
  const privileged=acc.role==="admin";
  if(!privileged&&!identityMismatch)return {code:403,body:{ok:false,error:"REPAIR_NOT_ALLOWED",
    msg:"Reparo permitido apenas para identidade corrompida ou administrador."}};
  const allowed=["knight","paladin","druid","sorcerer","monk"];
  const voc=allowed.includes(String(body.voc))?String(body.voc):null;
  if(!voc)return {code:400,body:{ok:false,msg:"Vocação inválida"}};
  let payload=body.data;
  if(typeof payload==="string"){try{payload=JSON.parse(payload);}catch(e){payload={};}}
  payload=payload&&typeof payload==="object"?payload:{};
  payload.id=String(c.id);payload.name=c.name;payload.voc=voc;payload.level=c.level;
  await db.updateCharacter(id,voc,c.level,JSON.stringify(payload),{
    hp:Math.max(0,Math.floor(Number(payload.hp)||0)),mp:Math.max(0,Math.floor(Number(payload.mp)||0)),
    max_hp:Math.max(0,Math.floor(Number(body.maxHp)||0)),max_mp:Math.max(0,Math.floor(Number(body.maxMp)||0)),
  });
  const updated=await db.findCharacter(id);
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,"repair",updated,true);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),action:"repair"});
  return {code:200,body:{ok:true,character:accountCharacterSummary(updated)}};
}

async function coins(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if(acc.role!=="admin")return {code:403,body:{ok:false,error:"ADMIN_ONLY",
    msg:"Alteração direta de Tibia Coins é exclusiva do administrador."}};
  const amount = Math.max(-999999, Math.min(999999, Math.floor(Number(body.amount) || 0)));
  const novo = (acc.coins || 0) + amount;
  await db.updateCoins(acc.id, novo);
  return { code: 200, body: { ok: true, coins: novo } };
}

/* ------------------------------ MARKET P2P ------------------------------ */

/* ====================== REGRAS OFICIAIS DO MARKET ======================
 * (manual do Tibia, secao 4.3.3 The Market)
 *  - fee de 2% ao criar oferta (mín 20 gp, máx 1.000.000), pago do banco;
 *  - ofertas duram 30 dias (item volta pro depot/inbox, dinheiro pro banco);
 *  - vendedor usa itens do DEPOT; comprador recebe no depot/inbox;
 *  - buy offers: quem quer comprar deixa oferta com o preço que paga;
 *  - MATCH AUTOMATICO: ao criar oferta, se existir contra-oferta compativel
 *    (sell <= buy) a venda acontece na hora;
 *  - preco medio por item (market_stats) p/ avisar oferta injusta (25%).
 * ====================================================================== */

async function marketBalances(db,accountId){const account=await db.findAccountById(accountId),bank=await db.accountMarketGold(accountId);
  return {coinBalance:account?Number(account.coins)||0:0,bank:Number(bank)||0};}

/* Fee de 2% (mín 20, máx 1.000.000) */
function marketFee(price) {
  return Math.max(20, Math.min(1000000, Math.round(price * 0.02)));
}

/* Cria uma oferta (venda de item/TC, ou COMPRA de item). */
async function marketCreate(db, body, charName) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const kind = body.kind === "coins" ? "coins" : body.kind === "buy" ? "buy" : "item";
  const price = Math.floor(Number(body.price) || 0);
  if (price <= 0) return { code: 400, body: { ok: false, msg: "Preço inválido" } };
  if (price > 999999999999) return { code: 400, body: { ok: false, msg: "Preço acima do máximo" } };
  const fee = marketFee(price);
  const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
  if (qty > 64000) return { code: 400, body: { ok: false, msg: "Máximo 64.000 itens por oferta" } };
  // limite de 100 ofertas ativas por personagem
  const minhas = await db.sellerOffers(acc.id);
  const ativas = minhas.filter((o) => o.status === "active").length;
  if (ativas >= 100) return { code: 400, body: { ok: false, msg: "Máximo de 100 ofertas ativas" } };

  // ---- fee (2%) pago do banco (market_gold) ----
  const feePago = await db.payMarketFee(acc.id, fee);
  if (!feePago) return { code: 400, body: { ok: false, msg: "Ouro insuficiente no banco para a taxa (2%)" } };

  // ---- pagamentos/travas conforme o tipo ----
  if (kind === "coins") {
    if (qty > (acc.coins || 0)) {
      await db.refundMarketFee(acc.id, fee);
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    }
    await db.updateCoins(acc.id, (acc.coins || 0) - qty);
  } else if (kind === "buy") {
    // oferta de COMPRA: trava o dinheiro (preco x qtd) no banco
    const total = price * qty;
    const ok = await db.payMarketGold(acc.id, total);
    if (!ok) {
      await db.refundMarketFee(acc.id, fee);
      return { code: 400, body: { ok: false, msg: "Ouro insuficiente no banco para a oferta" } };
    }
    if (!body.slug) return { code: 400, body: { ok: false, msg: "Item inválido" } };
  } else {
    if (!body.slug) return { code: 400, body: { ok: false, msg: "Item inválido" } };
  }

  // duração fixa: 30 dias (regra oficial)
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  const offer = await db.createMarketOffer({
    seller_id: acc.id,
    seller_name: charName || acc.login,
    kind,
    slug: (kind === "item" || kind === "buy") ? body.slug : null,
    tier: Math.max(0, Math.floor(Number(body.tier) || 0)),
    data: (kind === "item" || kind === "buy") ? (body.data || null) : null,
    qty,
    price,
    price_tc: body.price_tc ? 1 : 0,
    expires_at: expires,
  });

  // ---- MATCH AUTOMATICO: casa com contra-oferta existente ----
  const matched = await marketTryMatch(db, offer, acc, charName),balances=await marketBalances(db,acc.id);
  return { code: 201, body: Object.assign({ ok: true, offer, fee, matched },balances) };
}

/* Tenta casar uma oferta nova com contra-ofertas ativas.
 * sell (preço P) casa com buy (preço >= P); buy casa com sell (preço <= P). */
async function marketTryMatch(db, nova, acc, charName) {
  const slug = nova.slug, tier = nova.tier || 0;
  if (!slug) return null;   // TC nao casa automatico por enquanto
  const isSell = nova.kind === "item";
  const alvos = await db.marketOffers({ slug, tier });
  const contra = alvos.filter((o) =>
    o.id !== nova.id && o.seller_id !== acc.id &&
    (isSell ? o.kind === "buy" && o.price >= nova.price
            : o.kind === "item" && o.price <= nova.price));
  if (!contra.length) return null;
  const melhor = contra.sort((a, b) => (isSell ? b.price - a.price : a.price - b.price))[0];
  // executa a venda: qtd = min(qtds)
  const q = Math.min(melhor.qty, nova.qty);
  const valor = melhor.price * q;
  await db.updateMarketOffer(melhor.id, { status: "sold", buyer_id: acc.id, bought_at: new Date().toISOString() });
  await db.updateMarketOffer(nova.id, { status: "sold", qty: nova.qty - q, bought_at: new Date().toISOString() });
  // registra a venda nas stats
  await db.recordSale(slug, tier, melhor.price);
  if (isSell) {
    // vendedor (nova) recebe no banco; comprador (melhor) recebe o item
    await db.addAccountMarketGold(acc.id, valor);
    return { mode: "sell-matched", qty: q, price: melhor.price, against: melhor.seller_name || melhor.seller_id, fee: marketFee(nova.price) };
  } else {
    // comprador (nova) recebe o item; vendedor (melhor) recebe no banco
    await db.addAccountMarketGold(melhor.seller_id, valor);
    return { mode: "buy-matched", qty: q, price: melhor.price, against: melhor.seller_name || melhor.seller_id, fee: marketFee(nova.price) };
  }
}

/* Lista ofertas ativas (market P2P). */
async function marketList(db, q) {
  const filter = {};
  if (q.get("kind")) filter.kind = q.get("kind");
  if (q.get("tier")) filter.tier = q.get("tier");
  if (q.get("seller")) filter.seller = q.get("seller");
  if (q.get("slug")) filter.slug = q.get("slug");
  const offers = await db.marketOffers(filter);
  // inclui o preço médio de cada item (stats) para o cliente avisar
  // ofertas 25% acima/abaixo da média
  const withStats = [];
  for (const o of offers) {
    if (o.kind === "item" || o.kind === "buy") {
      const st = await db.itemStats(o.slug, o.tier || 0);
      if (st) o.stats = st;
    }
    withStats.push(o);
  }
  return { code: 200, body: { ok: true, offers: withStats } };
}

/* Minhas ofertas. */
async function marketMine(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offers = await db.sellerOffers(acc.id);
  return { code: 200, body: { ok: true, offers } };
}

/* Compra/aceita uma oferta (P2P).
 * - oferta kind=item: o comprador paga e recebe o item;
 * - oferta kind=buy: o comprador é quem QUER comprar — quem aceita vende
 *   (vendedor entrega item e recebe o dinheiro da oferta);
 * - oferta kind=coins: compra de TC por gold.
 */
const MARKET_OFFER_LOCKS=new Map();
async function withMarketOfferLock(id,work){const key=String(id),previous=MARKET_OFFER_LOCKS.get(key)||Promise.resolve();
  const run=previous.catch(()=>{}).then(work);MARKET_OFFER_LOCKS.set(key,run);
  try{return await run;}finally{if(MARKET_OFFER_LOCKS.get(key)===run)MARKET_OFFER_LOCKS.delete(key);}}
async function marketBuy(db,body,actorName){return withMarketOfferLock(body.offer_id,()=>marketBuyUnlocked(db,body,actorName));}
async function marketBuyUnlocked(db, body, actorName) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offer = await db.findMarketOffer(Number(body.offer_id));
  if (!offer || offer.status !== "active")
    return { code: 404, body: { ok: false, msg: "Oferta não encontrada ou expirada" } };
  if (offer.seller_id === acc.id)
    return { code: 400, body: { ok: false, msg: "Não pode negociar a própria oferta" } };
  if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now())
    return { code: 410, body: { ok: false, msg: "Oferta expirada" } };

  const qty = Math.min(offer.qty, Math.max(1, Math.floor(Number(body.qty) || offer.qty)));
  const valor = offer.price * qty;

  if (offer.kind === "buy") {
    // -------- ACEITAR OFERTA DE COMPRA: quem aceita VENDE -------
    // o dinheiro da oferta já está travado no banco do comprador (seller_id)
    // -> credita ao vendedor (actor) e "entrega" o item
    await db.addAccountMarketGold(acc.id, valor);
    await db.recordSale(offer.slug, offer.tier || 0, offer.price);
    // histórico de trade (v36: DB expandida)
    await db.addMarketHistory({
      seller_id: acc.id, seller_name: actorName,
      buyer_id: offer.seller_id, buyer_name: offer.seller_name,
      kind: "item", slug: offer.slug, tier: offer.tier || 0,
      qty, price: valor, price_tc: 0,
    });
    const remaining=Math.max(0,offer.qty-qty);
    await db.updateMarketOffer(offer.id, {
      status: remaining>0?"active":"sold", qty: remaining,
      buyer_id: acc.id, bought_at: new Date().toISOString(),
    });
    const balances=await marketBalances(db,acc.id);
    return {
      code: 200,
      body: Object.assign({
        ok: true,
        action: "sell-to-buyoffer",
        item: { slug: offer.slug, tier: offer.tier, data: offer.data, qty },
        price: offer.price,
        total: valor,
        buyer_name: offer.seller_name,
      },balances),
    };
  }

  // -------- COMPRA NORMAL (sell offer / TC) -------
  if (offer.price_tc) {
    if ((acc.coins || 0) < valor)
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    await db.updateCoins(acc.id, (acc.coins || 0) - valor);
    const seller = await db.findAccountById(offer.seller_id);
    if (seller) await db.updateCoins(seller.id, (seller.coins || 0) + valor);
  } else {
    // gold: usa o banco (market_gold) do comprador
    const ok = await db.payMarketGold(acc.id, valor);
    if (!ok) return { code: 400, body: { ok: false, msg: "Ouro insuficiente no banco" } };
    await db.addAccountMarketGold(offer.seller_id, valor);
    if (offer.kind === "coins" && qty > 0) {
      await db.updateCoins(acc.id, (acc.coins || 0) + qty);
    }
    if (offer.kind === "item") await db.recordSale(offer.slug, offer.tier || 0, offer.price);
  }

  const remaining=Math.max(0,offer.qty-qty);
  await db.updateMarketOffer(offer.id, {
    status: remaining>0?"active":"sold", qty: remaining,
    buyer_id: acc.id, bought_at: new Date().toISOString(),
  });
  // histórico de trade (v36: DB expandida)
  await db.addMarketHistory({
    seller_id: offer.seller_id, seller_name: offer.seller_name,
    buyer_id: acc.id, buyer_name: actorName,
    kind: offer.kind, slug: offer.slug, tier: offer.tier || 0,
    qty, price: valor, price_tc: !!offer.price_tc,
  });
  const balances=await marketBalances(db,acc.id);
  return {
    code: 200,
    body: Object.assign({
      ok: true,
      item: offer.kind === "item"
        ? { slug: offer.slug, tier: offer.tier, data: offer.data, qty }
        : null,
      coins: offer.kind === "coins" ? qty : 0,
      seller_name: offer.seller_name,
      price: offer.price,
      total: valor,
      price_tc: !!offer.price_tc,
    },balances),
  };
}

/* Histórico de trades (últimos 600). */
async function marketHistory(db, token, limit) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const rows = await db.marketHistory(limit);
  return { code: 200, body: { ok: true, history: rows } };
}

/* Rankings (top personagens por nível ou kills). */
async function rankings(db, by, limit) {
  const rows = await db.rankings(by, limit);
  return { code: 200, body: { ok: true, rankings: rows } };
}
async function adminAccountBundle(db,token,accountId,limit){
  const admin=await db.findAccountByToken(token);if(!admin)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  if(admin.role!=="admin")return {code:403,body:{ok:false,error:"ADMIN_ONLY",msg:"Acesso administrativo"}};
  const account=await db.findAccountById(accountId);if(!account)return {code:404,body:{ok:false,msg:"Conta não encontrada"}};
  const characters=await db.charactersOf(account.id),party=await db.partyFindByAccount(account.id),
    members=party?await db.partyMembers(party.id):[],instance=await db.instanceGet(account.id),
    snapshots=typeof db.snapshotList==="function"?await db.snapshotList(account.id,limit||100):[];
  const payload={schema:1,generatedAt:new Date().toISOString(),account:{id:Number(account.id),login:account.login,
    role:account.role,coins:Number(account.coins)||0},characters,party:party?{row:party,members}:null,instance,snapshots};
  const serialized=JSON.stringify(payload),checksum=crypto.createHash("sha256").update(serialized).digest("hex");
  return {code:200,body:{ok:true,checksum,payload}};
}

/* Cancela uma oferta (só o dono); devolve item/TC. */
async function marketCancel(db,body,id){return withMarketOfferLock(id,()=>marketCancelUnlocked(db,body,id));}
async function marketCancelUnlocked(db, body, id) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const offer = await db.findMarketOffer(Number(id));
  if (!offer || offer.seller_id !== acc.id)
    return { code: 404, body: { ok: false, msg: "Oferta não encontrada" } };
  if (offer.status !== "active")
    return { code: 400, body: { ok: false, msg: "Oferta já finalizada" } };
  await db.updateMarketOffer(offer.id, { status: "cancelled" });
  // devolve o que estava travado:
  //  - oferta de venda de TC: TC de volta pra conta
  //  - oferta de COMPRA (buy): dinheiro de volta pro banco (market_gold)
  if (offer.kind === "coins") {
    await db.updateCoins(acc.id, (acc.coins || 0) + offer.qty);
  } else if (offer.kind === "buy") {
    await db.addAccountMarketGold(acc.id, offer.price * offer.qty);
  }
  const balances=await marketBalances(db,acc.id);
  return {
    code: 200,
    body: Object.assign({
      ok: true,
      refundCoins: offer.kind === "coins" ? offer.qty : 0,
      refundGold: offer.kind === "buy" ? offer.price * offer.qty : 0,
    },balances),
  };
}

/* Coleta o gold pendente de vendas do market (ao entrar no jogo). */
async function marketClaim(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const gold = await db.claimMarketGold(acc.id);
  return { code: 200, body: { ok: true, gold } };
}

async function marketGoldTransfer(db,body,direction){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const active=await db.instanceGet(acc.id);if(active&&active.status==="active")
    return {code:409,body:{ok:false,error:"MARKET_IN_INSTANCE",msg:"Banco do Market só pode ser usado no templo"}};
  const amount=Math.max(0,Math.floor(Number(body.amount)||0)),charId=Number(body.char_id),expected=Number(body.expected_version);
  if(amount<=0||!Number.isSafeInteger(charId)||charId<=0||!Number.isSafeInteger(expected)||expected<1)
    return {code:400,body:{ok:false,error:"INVALID_MARKET_TRANSFER",msg:"Transferência inválida"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const result=await db.marketTransferGold(acc.id,charId,expected,amount,direction,lease);
  if(!result.ok){const messages={CHARACTER_GOLD_LOW:"Gold insuficiente no personagem",BANK_GOLD_LOW:"Saldo insuficiente no banco",
      SAVE_VERSION_CONFLICT:"Personagem atualizado em outra sessão",LEASE_REQUIRED:"Controle da conta foi transferido"};
    return {code:result.error==="LEASE_REQUIRED"?423:result.error==="SAVE_VERSION_CONFLICT"?409:400,
      body:{ok:false,error:result.error,msg:messages[result.error]||"Transferência recusada",
        character:result.character?accountCharacterSummary(result.character):null}};}
  const balances=await marketBalances(db,acc.id),character=accountCharacterSummary(result.character);
  publishSync(acc.id,"character",{id:charId,saveVersion:character.saveVersion,source:"market-bank"});
  return {code:200,body:Object.assign({ok:true,amount,character},balances)};
}
async function marketDeposit(db,body){return marketGoldTransfer(db,body,"deposit");}
async function marketWithdraw(db,body){return marketGoldTransfer(db,body,"withdraw");}

/* Saldo do banco do market. */
async function marketBank(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const balances=await marketBalances(db,acc.id);
  return { code: 200, body: Object.assign({ok:true},balances) };
}

/* ------------------------- storage (sessions) -------------------------
 * O JsonStore nao tem tabela de sessao: guarda token no proprio account.
 * O MysqlStore implementa createSession/findAccountByToken. */

/* ------------------------------ servidor ------------------------------ */

async function main() {
  const db = await getDb();

  // garante metodos de sessao no JsonStore
  if (!db.findAccountByToken) {
    db.findAccountByToken = async function (token) {
      return this.accounts.find((a) => a.token === token) || null;
    };
    db.createSession = async function (accountId, token) {
      const a = this.findAccountById(accountId);
      if (a) { a.token = token; this._save(); }
    };
    db.updateCoins = async function (id, coins) {
      const a = this.findAccountById(id);
      if (a) { a.coins = Math.max(0, coins); this._save(); return a; }
      return null;
    };
  }
  // garante metodos de sessao no MysqlStore
  if (typeof db.findAccountByToken !== "function" || !db.findAccountByToken) {
    db.findAccountByToken = async function (token) {
      const rows = await this.query(
        "SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id WHERE s.token = ?",
        [token]);
      return rows[0] || null;
    };
    db.createSession = async function (accountId, token) {
      await this.run("INSERT INTO sessions (account_id, token) VALUES (?, ?)",
        [accountId, token]);
    };
    db.updateCoins = async function (id, coins) {
      await this.run("UPDATE accounts SET coins = ? WHERE id = ?", [coins, id]);
      return this.findAccountById(id);
    };
    db.findAccountById = async function (id) {
      const rows = await this.query("SELECT * FROM accounts WHERE id = ?", [id]);
      return rows[0] || null;
    };
  }

  await ensureTestAccounts(db);
  SYNC_BUS=new SyncBus({historyLimit:256,ticketTtlMs:10*60*1000});
  const instanceWorker=startInstanceWorker(db,{
    intervalMs:INSTANCE_WORKER_INTERVAL_MS,maxStepMs:INSTANCE_WORKER_MAX_STEP_MS,
    minStepMs:Math.min(500,INSTANCE_WORKER_INTERVAL_MS),
    onClaim:async(claim)=>{if(typeof db.snapshotAdd==="function"&&(claim.terminalReason||claim.version%60===0)){
        const row=await db.instanceGet(claim.accountId);if(row)await db.snapshotAdd(claim.accountId,"instance",
          row.instance_id,row.version,claim.terminalReason||"worker",row,!!claim.terminalReason);}
      publishSync(claim.accountId,"instance",{version:claim.version,
        terminalReason:claim.terminalReason||null,source:"worker"});},
  });

  const maintenance=setInterval(()=>{Promise.resolve(db.pruneExpiredSessions&&db.pruneExpiredSessions(Date.now())).catch(()=>{});
    if(SYNC_BUS)SYNC_BUS.cleanup(Date.now());},3600000);if(maintenance.unref)maintenance.unref();

  const server = http.createServer(async (req, res) => {
    const url=req.url.split("?")[0],cors=allowedOrigin(req);
    if(cors===false&&url.startsWith("/api/"))return send(res,403,{ok:false,error:"ORIGIN_DENIED",msg:"Origem não autorizada"});
    if(cors)res._corsOrigin=cors;
    if (req.method === "OPTIONS") { send(res, 204, {}); return; }

    try {
      if(req.method==="GET"&&url==="/api/sync/events"){
        const q=new URL(req.url,"http://x").searchParams,ticket=SYNC_BUS.consumeTicket(q.get("ticket"));
        // Ticket expirado/restart é um evento SSE normal, não HTTP 401. O
        // cliente renova imediatamente sem poluir o console do navegador.
        if(!ticket)return sendSyncExpired(res,"ticket-invalid");
        res.writeHead(200,Object.assign(hardenedHeaders(res),{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform",
          "Connection":"keep-alive","X-Accel-Buffering":"no"}));
        res.write("retry: 1500\n\n");
        SYNC_BUS.subscribe(ticket.accountId,res,req.headers["last-event-id"]||q.get("lastEventId"),ticket.expiresAt,ticket.sessionToken);return;
      }
      if(req.method==="POST"&&url==="/api/sync/ticket"){
        const limited=rateLimit(req,"sync-ticket",60,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await issueSyncTicket(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="GET"&&url==="/api/sync/state"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await syncState(db,token);return send(res,r.code,r.body);
      }
      if (req.method === "GET" && url === "/api/health") {
        return send(res, 200, { ok:true, testServer:TEST_SERVER,
          worker:instanceWorker.stats(),sync:{protocol:SYNC_PROTOCOL,cursor:SYNC_BUS.cursor(),clients:SYNC_BUS.clientCount()},
          accounts:TEST_SERVER ? ["1/1","2/2"] : [] });
      }
      if (req.method === "GET" && url === "/js/server-config.js") {
        const config = `window.GLOBAL_IDLE_SERVER_CONFIG={online:true,testServer:${
          TEST_SERVER ? "true" : "false"},apiUrl:window.location.origin,syncProtocol:"${SYNC_PROTOCOL}"};\n`;
        return sendText(res, 200, config, "text/javascript; charset=utf-8");
      }
      if (req.method === "POST" && url === "/api/register") {
        const limited=rateLimit(req,"register",10,3600000);if(limited)return send(res,limited.code,limited.body);
        const body = await readBody(req);
        const r = await register(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/login") {
        const limited=rateLimit(req,"login",20,60000);if(limited)return send(res,limited.code,limited.body);
        const body = await readBody(req);
        const r = await login(db, body);
        return send(res, r.code, r.body);
      }
      if(req.method==="POST"&&url==="/api/logout"){
        const r=await logout(db,await readBody(req));return send(res,r.code,r.body);
      }
      if (req.method === "GET" && url === "/api/me") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await me(db, token);
        return send(res, r.code, r.body);
      }
      if(req.method==="POST"&&url==="/api/lease/acquire"){
        const r=await acquireLease(db,await readBody(req),false);return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/lease/takeover"){
        const limited=rateLimit(req,"lease-takeover",10,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await acquireLease(db,await readBody(req),true);return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/lease/renew"){
        const r=await renewLease(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/lease/release"){
        const r=await releaseLease(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="GET"&&url==="/api/instance"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await loadInstance(db,token);return send(res,r.code,r.body);
      }
      if(req.method==="PUT"&&url==="/api/instance"){
        const r=await saveInstance(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/tick"){
        const r=await tickInstance(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/end"){
        const r=await endInstance(db,await readBody(req));return send(res,r.code,r.body);
      }
      if (req.method === "POST" && url === "/api/characters") {
        const body = await readBody(req);
        const r = await createCharacter(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url.startsWith("/api/characters/")) {
        const id = Number(url.split("/").pop());
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await loadCharacter(db, token, id);
        return send(res, r.code, r.body);
      }
      if (req.method === "PUT" && /^\/api\/characters\/\d+\/repair$/.test(url)) {
        const id=Number(url.split("/")[3]);
        const body=await readBody(req);
        const r=await repairCharacterIdentity(db,body,id);
        return send(res,r.code,r.body);
      }
      if (req.method === "PUT" && /^\/api\/characters\/\d+$/.test(url)) {
        const id = Number(url.split("/").pop());
        const body = await readBody(req);
        const r = await saveCharacter(db, body, id);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/coins") {
        const body = await readBody(req);
        const r = await coins(db, body);
        return send(res, r.code, r.body);
      }
      // ---- MARKET P2P ----
      if (req.method === "POST" && url === "/api/market/offers") {
        const body = await readBody(req);
        // seller_name: vem do cliente (personagem que vende)
        const r = await marketCreate(db, body, body.seller_name || body.sellerName);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/offers") {
        const q = new URL(req.url, "http://x").searchParams;
        const r = await marketList(db, q);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/mine") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await marketMine(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/buy") {
        const body = await readBody(req);
        const r = await marketBuy(db, body, body.buyer_name || body.buyerName);
        return send(res, r.code, r.body);
      }
      if (req.method === "DELETE" && url.startsWith("/api/market/offers/")) {
        const id = Number(url.split("/").pop());
        const body = await readBody(req);
        const r = await marketCancel(db, body, id);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/claim") {
        const body = await readBody(req);
        const r = await marketClaim(db, body.token);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/deposit") {
        const body = await readBody(req);
        const r = await marketDeposit(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/market/withdraw") {
        const body = await readBody(req);
        const r = await marketWithdraw(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/bank") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await marketBank(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/market/history") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const q = new URL(req.url, "http://x").searchParams;
        const r = await marketHistory(db, token, Number(q.get("limit")) || 100);
        return send(res, r.code, r.body);
      }
      if(req.method==="GET"&&(url==="/api/admin/backup"||url==="/api/admin/snapshots")){
        const token=(req.headers.authorization||"").replace("Bearer ",""),q=new URL(req.url,"http://x").searchParams;
        const bundle=await adminAccountBundle(db,token,Number(q.get("account_id")),Number(q.get("limit"))||100);
        if(url==="/api/admin/snapshots"&&bundle.body.ok)return send(res,200,{ok:true,
          checksum:bundle.body.checksum,snapshots:bundle.body.payload.snapshots});
        return send(res,bundle.code,bundle.body);
      }
      // ---- RANKINGS (DB expandida) ----
      if (req.method === "GET" && url === "/api/rankings") {
        const q = new URL(req.url, "http://x").searchParams;
        const r = await rankings(db, q.get("by") || "level", Number(q.get("limit")) || 50);
        return send(res, r.code, r.body);
      }
      // ---- PARTY (multiplayer: convites assíncronos + follow) ----
      if (req.method === "POST" && url === "/api/party/save") {
        const body=await readBody(req);
        const r=await savePartyCharacters(db,body);
        return send(res,r.code,r.body);
      }
      if (req.method === "POST" && url === "/api/party/create") {
        const body = await readBody(req);
        const r = await party.partyCreate(db, body);
        if(r.body&&r.body.ok){const acc=await db.findAccountByToken(body.token);if(acc)await publishPartyState(db,acc.id,"create");}
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/invite") {
        const body = await readBody(req);
        const r = await party.partyInvite(db, body);
        if(r.body&&r.body.ok&&r.body.invite){const invited=await db.findCharacter(r.body.invite.invitee_id);
          if(invited)publishSync(invited.account_id,"party-inbox",{action:"invite",inviteId:r.body.invite.id});}
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/party/inbox") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await party.partyInbox(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/accept") {
        const body = await readBody(req),invite=await db.inviteFind(Number(body.invite_id));
        const r = await party.partyAccept(db, body);
        if(r.body&&r.body.ok&&invite){const leader=await db.findCharacter(invite.leader_id),guest=await db.findCharacter(invite.invitee_id);
          if(leader)await publishPartyState(db,leader.account_id,"accept");if(guest&&(!leader||guest.account_id!==leader.account_id))await publishPartyState(db,guest.account_id,"accept");}
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/decline") {
        const body = await readBody(req);
        const r = await party.partyDecline(db, body);
        if(r.body&&r.body.ok){const acc=await db.findAccountByToken(body.token);if(acc)publishSync(acc.id,"party-inbox",{action:"decline"});}
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/leave") {
        const body = await readBody(req),actor=await db.findCharacter(Number(body.char_id));
        const current=actor?await db.partyFindByCharacter(actor.id):null,affected=new Set();
        if(current){const leader=await db.findCharacter(current.leader_id);if(leader)affected.add(Number(leader.account_id));
          for(const member of await db.partyMembers(current.id))affected.add(Number(member.account_id));}
        const r = await party.partyLeave(db, body);
        if(r.body&&r.body.ok){if(actor)affected.add(Number(actor.account_id));for(const accountId of affected)await publishPartyState(db,accountId,"leave");}
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/kick") {
        const body = await readBody(req),removed=await db.findCharacter(Number(body.member_id));
        const r = await party.partyKick(db, body);
        if(r.body&&r.body.ok){const acc=await db.findAccountByToken(body.token);if(acc)await publishPartyState(db,acc.id,"kick");
          if(removed&&(!acc||Number(removed.account_id)!==Number(acc.id)))await publishPartyState(db,removed.account_id,"kick");}
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/reorder") {
        const body = await readBody(req);
        const r = await party.partyReorder(db, body);
        if(r.body&&r.body.ok){const acc=await db.findAccountByToken(body.token);if(acc)await publishPartyState(db,acc.id,"reorder");}
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/party/state") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const q = new URL(req.url, "http://x").searchParams;
        const r = await party.partyState(db, token, q.get("char_id"));
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/zone") {
        const body = await readBody(req);
        const r = await party.partyReportZone(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/follow") {
        const body = await readBody(req);
        const r = await party.partyFollow(db, body);
        return send(res, r.code, r.body);
      }
      if ((req.method === "GET" || req.method === "HEAD") && !url.startsWith("/api/")) {
        return serveStatic(req, res, url);
      }
      send(res, 404, { ok: false, msg: "Rota não encontrada" });
    } catch (e) {
      console.error("[server] erro:", e);
      send(res, 500, { ok: false, msg: "Erro interno: " + e.message });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log("[server] Global-Idle em http://" + HOST + ":" + PORT);
    console.log("[server] estáticos:", STATIC_DIR);
    console.log("[server] registre/login: POST /api/register e /api/login");
    if (TEST_SERVER) console.log("[server] TEST SERVER ativo — Admin liberado para testers");
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
