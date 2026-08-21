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
 *   GET/POST /api/store/*  catálogo, checkout MP, VIP, ledger, webhook
 *   GET  /api/chat/history + POST /api/chat/send       -> chat global
 *   POST /api/chat/ticket + GET /api/chat/events       -> SSE do chat
 *   GET  /api/online-count                            -> PLAYER ON (leases/instâncias)
 *   GET  /api/rankings?by=&limit=                     -> leaderboard (level/skills)
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
const {
  ChatBus, CHANNELS: CHAT_CHANNELS, MAX_TEXT: CHAT_MAX_TEXT,
  filterHardObscenity, sanitizeText, vocShort, parsePm,
} = require("./chat");
const { initializeAuthority, materializeAuthority, advanceAuthorityState, protectedPlayer, maxStats, ITEMS,
  rewardChestEnsure, rewardChestClaimOne, rewardChestClaimBundle, rewardChestClaimAll,
  sellAuthAllPouch, sellAuthPouchItem, sellAuthAllBag, sellAuthBagItem, destroyAuthPouchItem, openAuthBagYouDesire, setAuthAutoSupplyStash, setAuthLootConfig,
  moveItemToSupplyStash, moveItemFromSupplyStash, equipFromSupplyStash, moveLootPouchToBag,
  equipFromContainerAuth, unequipFromContainerAuth } = require("./authoritative_engine");
const { createWorldBossController, bossIdForWarzone, isWorldBossBossId, WARZONES, WORLD_BOSS_MAX_MEMBERS } = require("./world_boss");
// Inventário DA CONTA (bag/lootPouch/depot/reward chest compartilhados entre
// os personagens). Pure module — db.js persiste accounts.shared_inventory.
let SharedInv = null;
try { SharedInv = require("./shared_inventory"); } catch (e) { SharedInv = null; }
const store = require("./store");
const mailer = require("./mailer");

const PORT = parseInt(process.env.PORT || "3333", 10);
const HOST = process.env.HOST || "0.0.0.0";
const SALT_ROUNDS = 10;
const TEST_SERVER = process.env.TEST_SERVER === "1";
// Verificação de e-mail por código (confirmação de conta).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_VERIFY_REQUIRED = process.env.EMAIL_VERIFY_REQUIRED === "1";
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const LEASE_TTL_MS=Math.max(500,parseInt(process.env.LEASE_TTL_MS||"120000",10)||120000);
const SESSION_TTL_MS=Math.max(1000,parseInt(process.env.SESSION_TTL_MS||"86400000",10)||86400000);
const INSTANCE_WORKER_INTERVAL_MS=Math.max(100,parseInt(process.env.INSTANCE_WORKER_INTERVAL_MS||"1000",10)||1000);
const INSTANCE_WORKER_MAX_STEP_MS=Math.max(100,parseInt(process.env.INSTANCE_WORKER_MAX_STEP_MS||"3600000",10)||3600000);
// Após restart, dê tempo para abas retomarem o lease antes de o worker
// calcular o período offline. Sem essa janela, uma party podia sofrer wipe
// no primeiro tick de boot e ser enviada ao templo durante manutenção.
const INSTANCE_WORKER_STARTUP_GRACE_MS=Math.max(0,parseInt(process.env.INSTANCE_WORKER_STARTUP_GRACE_MS||"5000",10)||0);
// Identidade deste processo — o cliente usa bootId em /api/health para
// detectar restart mesmo quando a porta volta rápido com a mesma URL.
const SERVER_BOOT_ID=crypto.randomBytes(16).toString("hex");
const SERVER_STARTED_AT=Date.now();
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, "..", "game"));
const SYNC_PROTOCOL="sse-v2";
const ALLOWED_ORIGINS=new Set(String(process.env.ALLOWED_ORIGINS||"").split(",").map((x)=>x.trim()).filter(Boolean));
const MAINTENANCE_TOKEN=String(process.env.MAINTENANCE_TOKEN||"").trim();
// Lock persistente de produção (default OFF). Quando 1: UI de manutenção +
// 503 em login/register/lease. Não apaga DB; /api/health e /api/admin seguem.
const MAINTENANCE_MODE=process.env.MAINTENANCE_MODE==="1";
const MAINTENANCE_DISCORD=String(process.env.MAINTENANCE_DISCORD||"https://discord.gg/bnbh3jtvBf").trim()||
  "https://discord.gg/bnbh3jtvBf";
const MAINTENANCE_PUBLIC_MSG="FECHADO PARA MANUTENÇÃO, VOLTAMOS EM BREVE, QUALQUER DUVIDA ACESSE NOSSO DISCORD.";
let MAINTENANCE_UNTIL=0;
let SYNC_BUS=null;
let CHAT_BUS=null;
const RATE_BUCKETS=new Map(),TRUST_PROXY=process.env.TRUST_PROXY==="1",RATE_LIMIT_DISABLED=process.env.RATE_LIMIT_DISABLED==="1";
function publishSync(accountId,type,data){return SYNC_BUS?SYNC_BUS.publish(accountId,type,data):null;}
function getMaintenanceState(now){
  now=now||Date.now();
  const endsAt=Number(MAINTENANCE_UNTIL)||0;
  const remainingMs=Math.max(0,endsAt-now);
  const scheduled=remainingMs>0;
  return {
    active:MAINTENANCE_MODE||scheduled,
    mode:MAINTENANCE_MODE,
    endsAt:scheduled?endsAt:0,
    remainingMs:scheduled?remainingMs:0,
    remainingSec:scheduled?Math.ceil(remainingMs/1000):0,
    message:MAINTENANCE_MODE?MAINTENANCE_PUBLIC_MSG:null,
    discord:MAINTENANCE_MODE?MAINTENANCE_DISCORD:null,
  };
}
function maintenanceAuthReject(){
  return {code:503,body:{ok:false,error:"MAINTENANCE_MODE",msg:MAINTENANCE_PUBLIC_MSG,
    discord:MAINTENANCE_DISCORD}};
}
function maintenanceHtmlPage(){
  const discord=MAINTENANCE_DISCORD.replace(/"/g,"&quot;");
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Global-Idle — Manutenção</title>
<style>
html,body{margin:0;min-height:100%;font-family:Georgia,"Times New Roman",serif;background:
  radial-gradient(ellipse at 50% 20%,#3a2a14 0%,#1a120a 55%,#0a0806 100%);color:#f3e6c8}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.card{max-width:560px;text-align:center;padding:28px 22px;border:2px solid #6b5a2e;
  background:rgba(18,14,10,.88);box-shadow:0 12px 40px rgba(0,0,0,.55)}
h1{margin:0 0 14px;font-size:clamp(1.15rem,3.2vw,1.55rem);letter-spacing:.04em;line-height:1.35;color:#ffe680}
p{margin:0 0 18px;font-size:1rem;line-height:1.5;color:#e8d9b0}
a{color:#7ec8ff;font-weight:bold;word-break:break-all}
.sub{font-size:.85rem;color:#b9a882;margin-top:8px}
</style></head><body><div class="wrap"><div class="card">
<h1>${MAINTENANCE_PUBLIC_MSG}</h1>
<p>Discord: <a href="${discord}" target="_blank" rel="noopener noreferrer">${discord}</a></p>
<p class="sub">Global-Idle — voltamos em breve.</p>
</div></div></body></html>`;
}
function isMaintenanceUiPath(pathname){
  const p=String(pathname||"/");
  if(p==="/"||p==="/index.html"||p==="/game"||p==="/game/"||p==="/game/index.html")return true;
  if(p.endsWith(".html"))return true;
  return false;
}
function scheduleMaintenance(seconds){
  const sec=Math.max(1,Math.min(600,Math.floor(Number(seconds)||30)));
  MAINTENANCE_UNTIL=Date.now()+sec*1000;
  const state=getMaintenanceState();
  if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll==="function")SYNC_BUS.broadcastAll("maintenance",state);
  console.log("[server] maintenance scheduled:", state.remainingSec+"s", "endsAt="+new Date(state.endsAt).toISOString());
  return state;
}
async function authorizeMaintenance(req,body,db){
  const headerToken=String(req.headers["x-maintenance-token"]||"").trim();
  const bodyToken=String((body&&body.token)||"").trim();
  if(MAINTENANCE_TOKEN&&(headerToken===MAINTENANCE_TOKEN||bodyToken===MAINTENANCE_TOKEN))
    return {ok:true,via:"token"};
  const bearer=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  const sessionToken=bearer||String((body&&body.sessionToken)||"").trim();
  if(sessionToken&&db&&db.findAccountByToken){
    const acc=await db.findAccountByToken(sessionToken);
    if(acc&&acc.role==="admin")return {ok:true,via:"admin"};
  }
  // Alpha: se MAINTENANCE_TOKEN não está definido e TEST_SERVER=1, permite
  // schedule local/deploy sem segredo (ainda assim rate-limited).
  if(TEST_SERVER&&!MAINTENANCE_TOKEN)return {ok:true,via:"test-server"};
  return {ok:false};
}
function allowedOrigin(req){const origin=req.headers.origin;if(!origin)return null;
  // ALLOWED_ORIGINS=* permite qualquer origem (deploy Cloudflare/testes)
  if(ALLOWED_ORIGINS.has("*"))return origin;
  if(ALLOWED_ORIGINS.has(origin))return origin;
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
function bearerToken(req){
  const raw=String((req&&req.headers&&req.headers.authorization)||"");
  const match=/^Bearer\s+(.+)$/i.exec(raw);
  return match?String(match[1]||"").trim():"";
}
function bodyWithSessionToken(req,body){
  body=body&&typeof body==="object"?body:{};
  if(!body.token){
    const header=bearerToken(req);
    if(header)body.token=header;
  }
  return body;
}

/* Alpha/test: qualquer conta autenticada pode usar grants Admin nos próprios
 * personagens (ownership é checada nas rotas). Em produção (TEST_SERVER=0)
 * só role admin. Bundles cross-account continuam admin-only. */
function accountCanSelfAdmin(acc){
  return !!(acc&&(acc.role==="admin"||TEST_SERVER));
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
async function updateAccountMissions(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  // Missões são por conta: qualquer personagem pode progredir as mesmas
  // missões. O cliente envia o estado completo (missions + missionsDone).
  const missions=body.missions&&typeof body.missions==="object"?body.missions:{};
  const missionsDone=body.missionsDone&&typeof body.missionsDone==="object"?body.missionsDone:{};
  if(typeof db.setAccountMissions==="function"){
    await db.setAccountMissions(acc.id,missions,missionsDone);
  }else{
    acc.missions=missions;acc.missionsDone=missionsDone;
    if(typeof db._save==="function")db._save();
  }
  return {code:200,body:{ok:true,missions,missionsDone}};
}
async function updateAccountTutorial(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  // Progresso do tutorial de onboarding é por conta (igual às missões):
  // o cliente envia o estado completo a cada mudança de fase.
  const tutorial=body.tutorial&&typeof body.tutorial==="object"&&!Array.isArray(body.tutorial)?body.tutorial:{};
  if(typeof db.setAccountTutorial==="function"){
    await db.setAccountTutorial(acc.id,tutorial);
  }else{
    acc.tutorial=tutorial;
    if(typeof db._save==="function")db._save();
  }
  return {code:200,body:{ok:true,tutorial}};
}
const TUTORIAL_VOCATIONS=["knight","paladin","druid","sorcerer","monk"];
const TUTORIAL_VIP_DAYS=3;
const TUTORIAL_EXERCISE_CHARGES=1500;
/* Recompensa única de conclusão do tutorial: 3 dias de VIP na conta + 1500
 * cargas de cada exercise weapon nos 4 personagens do tutorial. VIP é
 * aplicado aqui (é por conta); as cargas de exercise weapon são creditadas
 * no cliente na próxima vez que cada personagem carregar (dado por
 * personagem), então só devolvemos os charIds para o cliente aplicar. */
async function claimTutorialReward(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  // O cliente envia o tutorial state atual para evitar condicao de corrida
  // com o POST anterior de atualizacao. Se for valido, usa ele.
  const clientTutorial=body.tutorial&&typeof body.tutorial==="object"&&!Array.isArray(body.tutorial)?body.tutorial:null;
  let tutorial=(acc.tutorial&&typeof acc.tutorial==="object"?acc.tutorial:{});
  if(clientTutorial&&clientTutorial.charIds&&clientTutorial.helperDone&&clientTutorial.partyDone&&clientTutorial.huntEntered)
    tutorial=clientTutorial;
  if(tutorial.rewardGranted)
    return {code:200,body:{ok:true,already:true,vipUntil:Math.max(0,Math.floor(Number(acc.vip_until)||0)),
      charIds:Array.isArray(tutorial.charIds)?tutorial.charIds:[]}};
  const charIds=Array.isArray(tutorial.charIds)?tutorial.charIds.map(String):[];
  if(charIds.length<4)
    return {code:400,body:{ok:false,msg:"Tutorial incompleto: faltam personagens."}};
  const helperDone=tutorial.helperDone&&typeof tutorial.helperDone==="object"?tutorial.helperDone:{};
  const allHelperDone=charIds.every((id)=>!!helperDone[id]);
  if(!tutorial.partyDone||!tutorial.huntEntered||!allHelperDone)
    return {code:400,body:{ok:false,msg:"Tutorial incompleto: termine a party/hunt/helper antes."}};
  // Confere no servidor que os personagens realmente existem e cobrem
  // vocações distintas (evita reivindicar com ids inventados).
  let chars=[];
  try{chars=await db.charactersOf(acc.id);}catch(e){chars=[];}
  const byId={};for(const c of chars)byId[String(c.id)]=c;
  const vocsSeen=new Set();
  for(const id of charIds){
    const c=byId[id];
    if(!c||!TUTORIAL_VOCATIONS.includes(c.voc))
      return {code:400,body:{ok:false,msg:"Personagem do tutorial inválido."}};
    vocsSeen.add(c.voc);
  }
  if(vocsSeen.size<4)
    return {code:400,body:{ok:false,msg:"Os personagens do tutorial precisam ter 4 vocações diferentes."}};
  const now=Date.now();
  const cur=Math.max(0,Math.floor(Number(acc.vip_until)||0));
  const vipUntil=Math.max(cur,now)+TUTORIAL_VIP_DAYS*24*3600*1000;
  if(typeof db.setAccountVipUntil==="function")await db.setAccountVipUntil(acc.id,vipUntil);
  else if(typeof db.run==="function")await db.run("UPDATE accounts SET vip_until = ? WHERE id = ?",[vipUntil,Number(acc.id)]);
  const newTutorial=Object.assign({},tutorial,{rewardGranted:true,rewardGrantedAt:now});
  if(typeof db.setAccountTutorial==="function")await db.setAccountTutorial(acc.id,newTutorial);
  else{acc.tutorial=newTutorial;if(typeof db._save==="function")db._save();}
  return {code:200,body:{ok:true,vipUntil,vip:vipUntil>now,charIds,
    exerciseCharges:TUTORIAL_EXERCISE_CHARGES,tutorial:newTutorial}};
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
async function publishPartyForCharacters(db,characterIds,action){
  const parties=new Map();
  for(const rawId of characterIds||[]){const id=Number(rawId);if(!Number.isSafeInteger(id)||id<=0)continue;
    const found=await db.partyFindByCharacter(id);if(found)parties.set(Number(found.id),found);}
  for(const party of parties.values()){
    const members=await db.partyMembers(party.id),ids=[Number(party.leader_id)].concat(members.map((m)=>Number(m.id))),
      summary={id:Number(party.id),version:Number(party.roster_version),order:ids},accounts=new Set();
    for(const id of ids){const character=await db.findCharacter(id);if(character)accounts.add(Number(character.account_id));}
    for(const accountId of accounts)publishSync(accountId,"party",{action,party:summary});
  }
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

function sendChatExpired(res,reason){
  res.writeHead(200,Object.assign(hardenedHeaders(res),{"Content-Type":"text/event-stream; charset=utf-8",
    "Cache-Control":"no-cache, no-transform","Connection":"close","X-Accel-Buffering":"no"}));
  res.end(`event: chat-expired\ndata: ${JSON.stringify({reason:reason||"ticket-invalid"})}\n\n`);
}

async function issueChatTicket(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const charId=Number(body.charId||body.char_id||0);
  let viewerName="";
  if(Number.isSafeInteger(charId)&&charId>0){
    const character=await db.findCharacter(charId);
    if(character&&Number(character.account_id)===Number(acc.id))viewerName=String(character.name||"");
  }
  const issued=CHAT_BUS.issueTicket(acc.id,body.token,viewerName);
  return {code:200,body:{ok:true,ticket:issued.ticket,
    expiresAt:new Date(issued.expiresAt).toISOString(),cursor:CHAT_BUS.cursor(),viewerName}};
}

async function chatHistory(db,token,query){
  const acc=await db.findAccountByToken(token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const channel=String(query.get("channel")||"geral").toLowerCase();
  if(!CHAT_CHANNELS.includes(channel))
    return {code:400,body:{ok:false,error:"BAD_CHANNEL",msg:"Canal inválido"}};
  const charId=Number(query.get("charId")||query.get("char_id")||0);
  let viewerName="";
  if(Number.isSafeInteger(charId)&&charId>0){
    const character=await db.findCharacter(charId);
    if(character&&Number(character.account_id)===Number(acc.id))viewerName=String(character.name||"");
  }
  const sinceId=Number(query.get("since")||0);
  const limit=Number(query.get("limit")||50);
  return {code:200,body:{ok:true,channel,cursor:CHAT_BUS.cursor(),
    messages:CHAT_BUS.history(channel,sinceId,limit,viewerName)}};
}

async function chatSend(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const charId=Number(body.charId||body.char_id||0);
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"CHAR_REQUIRED",msg:"Personagem obrigatório"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"CHAR_DENIED",msg:"Personagem inválido"}};
  let channel=String(body.channel||"geral").toLowerCase();
  if(!CHAT_CHANNELS.includes(channel))
    return {code:400,body:{ok:false,error:"BAD_CHANNEL",msg:"Canal inválido"}};
  if(channel!=="geral")
    return {code:400,body:{ok:false,error:"CHANNEL_LOCKED",msg:"Este canal ainda não está aberto para mensagens."}};
  const rate=CHAT_BUS.checkRate(Number(acc.id));
  if(!rate.ok)return {code:429,body:{ok:false,error:"RATE_LIMITED",msg:"Muitas mensagens. Aguarde um momento.",
    retryAfterMs:rate.retryAfterMs}};
  let raw=sanitizeText(body.text);
  if(!raw)return {code:400,body:{ok:false,error:"EMPTY",msg:"Mensagem vazia"}};
  let type="chat",toName=null,text=raw;
  const pm=parsePm(raw);
  if(pm){
    if(!pm.text)return {code:400,body:{ok:false,error:"EMPTY",msg:"Mensagem privada vazia"}};
    type="pm";toName=pm.toName;text=pm.text;channel="geral";
  }
  // Filtro leve no servidor (somente termos extremos); o toggle do cliente
  // aplica a lista completa na exibição.
  text=filterHardObscenity(text);
  if(text.length>CHAT_MAX_TEXT)text=text.slice(0,CHAT_MAX_TEXT);
  const level=Math.max(1,Math.floor(Number(character.level)||1));
  const voc=String(character.voc||"none");
  const msg=CHAT_BUS.post({
    channel,type,nickname:String(character.name||"?"),voc,vocShort:vocShort(voc),
    level,accountId:Number(acc.id),charId:Number(character.id),text,toName,
  });
  return {code:200,body:{ok:true,message:msg}};
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

function normalizeStaticPath(pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname || "/"); }
  catch (e) { return null; }
  // Aceita /game e /game/... (docs/atalhos antigos) além da raiz /
  if (relative === "/game" || relative === "/game/") relative = "/";
  else if (relative.startsWith("/game/")) relative = relative.slice(5);
  if (relative === "/" || relative === "") relative = "/index.html";
  // Chrome pede /favicon.ico; o jogo usa gold-coin como ícone
  if (relative === "/favicon.ico") relative = "/assets/item/gold-coin.png";
  return relative;
}

function serveStatic(req, res, pathname) {
  if (MAINTENANCE_MODE && isMaintenanceUiPath(pathname)) {
    sendText(res, 503, maintenanceHtmlPage(), "text/html; charset=utf-8");
    return;
  }
  const relative = normalizeStaticPath(pathname);
  if (relative == null) { sendText(res, 400, "URL inválida"); return; }
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

function accountPublicView(acc){
  const vipUntil=Math.max(0,Math.floor(Number(acc&&acc.vip_until)||0));
  return {
    id:acc.id, login:acc.login, role:acc.role, coins:acc.coins||0,
    email:String(acc&&acc.email||""),
    emailVerified:!!(acc&&acc.email_verified),
    gold:Math.max(0,Math.floor(Number(acc.gold)||0)),
    vipUntil, vip:vipUntil>Date.now(),
    missions:acc.missions||{}, missionsDone:acc.missionsDone||{},
    tutorial:acc.tutorial||{},
  };
}
async function ensureAccountWallet(db,acc){
  if(!acc)return acc;
  if(typeof db.migrateAccountGold==="function"){
    const migrated=await db.migrateAccountGold(acc.id);
    if(migrated)Object.assign(acc,migrated);
  }
  return acc;
}

async function ensureTestAccounts(db) {
  if (!TEST_SERVER) return;
  const vipYear=Date.now()+365*24*3600*1000;
  for (const credential of [
    { login:"1", password:"1" },
    { login:"2", password:"2" },
  ]) {
    const hash = bcrypt.hashSync(credential.password, SALT_ROUNDS);
    const existing = await db.findAccountByLogin(credential.login);
    if (!existing) {
      const created=await db.createAccount(credential.login, hash, "admin", 1000);
      if(typeof db.setAccountVipUntil==="function")await db.setAccountVipUntil(created.id,vipYear);
    } else if (typeof db.run === "function") {
      await db.run("UPDATE accounts SET password_hash = ?, role = 'admin' WHERE id = ?", [hash, existing.id]);
      if(typeof db.setAccountVipUntil==="function")await db.setAccountVipUntil(existing.id,vipYear);
      if(typeof db.migrateAccountGold==="function")await db.migrateAccountGold(existing.id);
    } else {
      existing.password_hash = hash;
      existing.role = "admin";
      existing.coins = Math.max(1000, existing.coins || 0);
      existing.vip_until = Math.max(Number(existing.vip_until)||0, vipYear);
      db._save();
      if(typeof db.migrateAccountGold==="function")db.migrateAccountGold(existing.id);
    }
  }
  console.log("[test-server] contas liberadas: 1/1 e 2/2; Admin+VIP habilitado; grants Admin liberados para todas as contas nos próprios chars");
}

/* ------------------------------ rotas ------------------------------ */

async function register(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const email = String(body.email || "").trim().slice(0, 120);
  if (login.length < 1 || login.length > 32) return { code: 400, body: { ok: false, msg: "Login inválido (1-32 caracteres)" } };
  if (password.length < 1) return { code: 400, body: { ok: false, msg: "Senha obrigatória" } };
  if (email && !EMAIL_RE.test(email)) return { code: 400, body: { ok: false, msg: "E-mail inválido" } };
  const exist = await db.findAccountByLogin(login);
  // Duplicidade é erro de formulário, não falha de transporte. Responder
  // 200 evita o falso "Failed to load resource" no console; `ok:false`
  // continua impedindo sobrescrever ou acessar a conta existente.
  if (exist) return { code: 200, body: { ok: false, error: "ACCOUNT_EXISTS",
    msg: "Conta já existe. Use a aba Entrar." } };
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const acc = await db.createAccount(login, hash, "user", 0, email);
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
    wardrobe:data.wardrobe && typeof data.wardrobe === "object" ? data.wardrobe : null,
    identityMismatch:wrongId||wrongName,
    dataOwnerId:wrongId?String(data.id):null,
    dataOwnerName:wrongName?String(data.name):null,
    snapshot:data,
  };
}

async function login(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  let acc = await db.findAccountByLogin(login);
  if (!acc || !bcrypt.compareSync(password, acc.password_hash)) {
    return { code: 401, body: { ok: false, msg: "Login ou senha inválidos" } };
  }
  acc = await ensureAccountWallet(db, acc);
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
      account: accountPublicView(acc),
      characters: characters.map(accountCharacterSummary),
    },
  };
}

async function me(db, token) {
  if (!token) return { code: 401, body: { ok: false, msg: "Sem token" } };
  let acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  acc = await ensureAccountWallet(db, acc);
  const characters = await db.charactersOf(acc.id);
  // Inventário DA CONTA (pouch única etc.): inclui no /api/me para o SSE
  // ("character") e o poll atualizarem o cliente em tempo real.
  let sharedInventory = null;
  try {
    if (SharedInv && typeof db.accountSharedInventory === "function")
      sharedInventory = await db.accountSharedInventory(acc.id);
  } catch (e) { /* opcional */ }
  return {
    code: 200,
    body: {
      ok: true,
      account: accountPublicView(acc),
      characters: characters.map(accountCharacterSummary),
      ...(sharedInventory ? { sharedInventory } : {}),
    },
  };
}

function sanitizeOutfit(raw,sex,voc){
  const o=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const sexo=sex==="female"?"f":"m";
  const colors=Array.isArray(o.colors)&&o.colors.length===4
    ?o.colors.slice(0,4).map((n)=>Math.max(0,Math.min(95,Math.floor(Number(n)||0))))
    :null;
  const SEX_BASE_PAIR={
    noblewoman:"nobleman",nobleman:"noblewoman",
    norsewoman:"norseman",norseman:"norsewoman",
    "retro-noblewoman":"retro-nobleman","retro-nobleman":"retro-noblewoman",
  };
  const CLASSIC={citizen:1,hunter:1,mage:1,knight:1,summoner:1,monk:1};
  const VOC={knight:"knight",paladin:"hunter",druid:"summoner",sorcerer:"mage",monk:"monk"};
  function baseName(id){
    return String(id||"").replace(/-[mf](-\d+)?$/,"").replace(/-\d+$/,"");
  }
  function flipAppearance(id){
    if(!id)return null;
    const flipped=id.replace(/-[mf]$/,"-"+sexo);
    if(flipped!==id)return flipped;
    const base=baseName(id);
    const paired=SEX_BASE_PAIR[base];
    if(paired)return paired+"-"+sexo;
    return null;
  }
  let appearance=typeof o.appearance==="string"?o.appearance.slice(0,80):null;
  if(appearance){
    const base=baseName(appearance);
    const femaleName=/woman$/.test(base);
    if(SEX_BASE_PAIR[base]&&((sexo==="m"&&femaleName)||(sexo==="f"&&!femaleName))){
      appearance=SEX_BASE_PAIR[base]+"-"+sexo;
    }else if(!new RegExp("-"+sexo+"(?:-\\d+)?$").test(appearance)){
      const flipped=flipAppearance(appearance);
      if(flipped)appearance=flipped;
    }
  }
  // type classico nunca carrega slug premium (druid/noblewoman/…)
  let type=typeof o.type==="string"?o.type.replace(/-[mf]$/,"").slice(0,40):null;
  if(!type||!CLASSIC[type])type=VOC[voc]||"citizen";
  if(!CLASSIC[type])type="citizen";
  const mount=typeof o.mount==="string"&&o.mount?o.mount.slice(0,80):null;
  const addons=Math.max(0,Math.min(3,Math.floor(Number(o.addons)||0)));
  return {
    type,appearance,colors,addons,mount,
    lookType:Math.max(0,Math.floor(Number(o.lookType)||0)),
    lookHead:colors?colors[0]:Math.max(0,Math.floor(Number(o.lookHead)||0)),
    lookBody:colors?colors[1]:Math.max(0,Math.floor(Number(o.lookBody)||0)),
    lookLegs:colors?colors[2]:Math.max(0,Math.floor(Number(o.lookLegs)||0)),
    lookFeet:colors?colors[3]:Math.max(0,Math.floor(Number(o.lookFeet)||0)),
    lookAddons:addons,
    lookMount:mount?Math.max(0,Math.floor(Number(o.lookMount)||0)):0,
    mountId:mount?Math.max(0,Math.floor(Number(o.mountId)||0)):0,
    lookMountHead:0,lookMountBody:0,lookMountLegs:0,lookMountFeet:0,
  };
}

function sanitizeWardrobe(raw){
  const w=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const outfits={};
  if(w.outfits&&typeof w.outfits==="object"&&!Array.isArray(w.outfits)){
    for(const id of Object.keys(w.outfits)){
      if(typeof id!=="string"||id.length>80)continue;
      outfits[id]=Math.max(0,Math.min(3,Math.floor(Number(w.outfits[id])||0)));
    }
  }
  const mounts={};
  if(w.mounts&&typeof w.mounts==="object"&&!Array.isArray(w.mounts)){
    for(const id of Object.keys(w.mounts)){
      if(typeof id!=="string"||id.length>80)continue;
      if(w.mounts[id])mounts[id]=true;
    }
  }
  return {outfits,mounts};
}

function sanitizeNewPlayer(payload,voc){
  const sex=payload.sex==="female"?"female":"male";
  const safe={id:payload.id,name:payload.name,voc,sex,
    outfit:sanitizeOutfit(payload.outfit,sex,voc),
    wardrobe:sanitizeWardrobe(payload.wardrobe),
    config:payload.config&&typeof payload.config==="object"?payload.config:{},level:1,exp:0,
    skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:10},
    skillTries:{fist:0,sword:0,axe:0,club:0,dist:0,shield:0},ml:0,manaSpent:0,gold:0,
    kills:{},totalKills:0,bosses:{},missions:{},lootPouch:{},supplyStash:{},rewardChest:{},rewardChestBundles:[],bag:{},ammo:{},
    supplies:{"health-potion":20,"mana-potion":20},equip:{},stamina:42*3600,cap:5000};
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
  if (EMAIL_VERIFY_REQUIRED && !acc.email_verified)
    return { code: 403, body: { ok: false, error: "EMAIL_VERIFY_REQUIRED",
      msg: "Confirme seu e-mail antes de criar um personagem." } };
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
  let acc = await db.findAccountByToken(token);
  if (!acc) return { code:401, body:{ok:false,msg:"Sessão inválida"} };
  acc = await ensureAccountWallet(db, acc);
  const character = await db.findCharacter(id);
  if (!character || Number(character.account_id) !== Number(acc.id))
    return { code:404, body:{ok:false,msg:"Personagem não encontrado"} };
  let data = character.data;
  let sharedInventory = null;
  try {
    const parsed = typeof data === "string" ? JSON.parse(data) : (data || {});
    parsed.gold = Math.max(0, Math.floor(Number(acc.gold) || 0));
    parsed.vipUntil = Math.max(0, Math.floor(Number(acc.vip_until) || 0));
    // Inventário da conta: bag/lootPouch/depot/reward chest são compartilhados
    // por todos os personagens — injeta o shared por cima do save individual.
    if (SharedInv && typeof db.accountSharedInventory === "function") {
      sharedInventory = await db.accountSharedInventory(acc.id);
      SharedInv.applySharedToPlayer(parsed, sharedInventory);
    }
    data = JSON.stringify(parsed);
  } catch (e) {}
  return {
    code:200,
    body:{
      ok:true,
      account:accountPublicView(acc),
      character:{
        id:character.id, name:character.name, voc:character.voc,
        level:character.level, saveVersion:Number(character.save_version)||0,
        data,
      },
      ...(sharedInventory ? { sharedInventory } : {}),
    },
  };
}

function prepareCharacterSave(c,body,opts){
  opts=opts||{};
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
    "bosses","missions","lootPouch","supplyStash","rewardChest","rewardChestBundles","blessed","deathLog"];
  payload=Object.assign({},payload,{id:String(c.id),name:c.name});
  let voc=c.voc,level=Math.max(1,Number(c.level)||1);
  if(opts.adminGrant){
    const allowed=["knight","paladin","druid","sorcerer","monk"];
    voc=allowed.includes(String(payload.voc))?String(payload.voc):c.voc;
    level=Math.max(1,Math.min(2000,Math.floor(Number(payload.level)||Number(body.level)||Number(c.level)||1)));
    payload.voc=voc;payload.level=level;
  }else{
    payload.voc=c.voc;
    for(const key of protectedKeys)if(current[key]!==undefined)payload[key]=cloneJson(current[key]);
    payload.level=level;
  }
  return {save:{
    id:Number(c.id),expectedVersion:Number(body.expected_version),voc,level,
    data:JSON.stringify(payload),extra:{
      hp:Math.max(0,Math.floor(Number.isFinite(Number(body.hp))?Number(body.hp):(Number(payload.hp)||0))),
      mp:Math.max(0,Math.floor(Number.isFinite(Number(body.mp))?Number(body.mp):(Number(payload.mp)||0))),
      max_hp:Math.max(0,Math.floor(Number(body.maxHp)||0)),
      max_mp:Math.max(0,Math.floor(Number(body.maxMp)||0)),
    },
  }};
}

/* Admin grant: injeta o snapshot no authority ativo para o próximo tick não
 * materializar o personagem antigo por cima do MySQL. */
async function applyAdminPlayerToInstance(db,acc,charId,player,lease){
  const resolved=await resolveInstanceRow(db,acc,charId);
  if(resolved.error)return {ok:false,http:resolved.error};
  const row=resolved.row;
  if(!row||row.status!=="active")return {ok:true,instance:null};
  let last=null;
  for(let attempt=0;attempt<4;attempt++){
    const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
    if(!current||current.status!=="active")return {ok:true,instance:null};
    const result=await db.instancePatchState(current.account_id,acc.id,current.instance_id,Number(current.version),(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p)return null;
      const next=cloneJson(player)||{};
      next.id=String(charId);next.name=item.p.name||next.name||"";
      next.voc=String(next.voc||item.p.voc||"knight");
      next.level=Math.max(1,Math.floor(Number(next.level)||1));
      next.gold=Math.max(0,Math.floor(Number(next.gold)||0));
      item.p=next;
      if(Array.isArray(descriptor.members)){
        const member=descriptor.members.find((entry)=>String(entry&&entry.id)===String(charId));
        if(member){member.p=cloneJson(next);member.hp=next.hp;member.mp=next.mp;}
      }
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    last=result;
    if(result.ok){
      await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
        status:result.instance.status,source:"admin-grant",holderId:String(lease&&lease.holderId||"")});
      return {ok:true,instance:result.instance};
    }
    if(result.error==="LEASE_REQUIRED")return {ok:false,error:result.error,instance:result.instance};
    if(result.error!=="INSTANCE_VERSION_CONFLICT")break;
  }
  return {ok:false,error:(last&&last.error)||"INSTANCE_PATCH_FAILED",instance:last&&last.instance};
}

async function enforceAuthoritativeProgress(db,accountId,prepared){
  let row=await db.instanceGet(accountId);
  const party=await db.partyFindByCharacter(prepared.save.id);
  if(party&&typeof db.instanceGetByParty==="function")row=await db.instanceGetByParty(party.id)||row;
  if(!row||row.status!=="active")return prepared;
  let descriptor=null;try{descriptor=typeof row.state==="string"?JSON.parse(row.state):row.state;}catch(e){}
  const player=protectedPlayer(descriptor,prepared.save.id);if(!player)return prepared;
  prepared.save.data=JSON.stringify(player);prepared.save.level=Math.max(1,Number(player.level)||1);
  prepared.save.voc=String(player.voc||prepared.save.voc);prepared.save.extra.hp=Math.max(0,Number(player.hp)||0);
  prepared.save.extra.mp=Math.max(0,Number(player.mp)||0);
  // Snapshot do servidor: containers vêm todos da instância (que foi
  // hidratada do shared) — a extração abaixo é "autoritativa".
  prepared.authoritativeInstance=true;
  return prepared;
}

/* Move os 4 containers do player para o inventário da conta e espelha o
 * shared de volta no save do personagem (mirror). Em save COMUM (cidade),
 * bag/depot/itemInstances vêm do cliente (o PUT é o canal de persistência
 * do depot), mas lootPouch/rewardChest permanecem do shared (server-owned). */
async function splitSharedInventory(db, acc, p, authoritative) {
  if (!SharedInv || typeof db.accountSharedInventory !== "function") return null;
  const shared = await db.accountSharedInventory(acc.id);
  if (authoritative) {
    SharedInv.extractSharedFromPlayer(p, shared);
  } else {
    const keep = {
      lootPouch: Object.assign({}, shared.lootPouch),
      rewardChest: Object.assign({}, shared.rewardChest),
      rewardChestBundles: shared.rewardChestBundles.slice(),
    };
    SharedInv.extractSharedFromPlayer(p, shared);
    shared.lootPouch = keep.lootPouch;
    shared.rewardChest = keep.rewardChest;
    shared.rewardChestBundles = keep.rewardChestBundles;
  }
  if (typeof db.setAccountSharedInventory === "function")
    await db.setAccountSharedInventory(acc.id, shared);
  SharedInv.applySharedToPlayer(p, shared);
  return shared;
}

/* Carrega o player de cidade a partir do mirror do personagem, hidratado com
 * o shared da conta. Toda operação de container em cidade muta este player e
 * persiste via persistClaimedPlayer (extração autoritativa). */
async function loadCityPlayer(db, acc, character) {
  let p = character.data;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { p = {}; } }
  p = p && typeof p === "object" && !Array.isArray(p) ? cloneJson(p) : {};
  if (SharedInv && typeof db.accountSharedInventory === "function") {
    try {
      const shared = await db.accountSharedInventory(acc.id);
      SharedInv.applySharedToPlayer(p, shared);
    } catch (e) { /* shared opcional */ }
  }
  return p;
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
  const adminGrant=!!body.admin_grant;
  if(adminGrant&&!accountCanSelfAdmin(acc))return {code:403,body:{ok:false,error:"ADMIN_ONLY",
    msg:"Grants administrativos exigem conta admin (ou TEST_SERVER)."}};
  let prepared=prepareCharacterSave(c,body,{adminGrant});if(prepared.error)return prepared.error;
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  let patchedInstance=null;
  if(adminGrant){
    let player={};try{player=JSON.parse(prepared.save.data);}catch(e){player={};}
    if(typeof db.setAccountGold==="function"&&player.gold!==undefined){
      const gold=Math.max(0,Math.floor(Number(player.gold)||0));
      await db.setAccountGold(acc.id,gold);player.gold=gold;
      prepared.save.data=JSON.stringify(player);
    }
    // Atualiza a instância ativa ANTES do MySQL do personagem: senão o tick
    // seguinte regrava o snapshot autoritativo antigo e “desfaz” o grant.
    const patched=await applyAdminPlayerToInstance(db,acc,id,player,lease);
    if(patched&&patched.http)return patched.http;
    if(patched&&patched.ok===false){
      if(patched.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:patched.error,
        msg:"Controle transferido durante o grant admin."}};
      return {code:409,body:{ok:false,error:patched.error||"INSTANCE_PATCH_FAILED",
        msg:"Não foi possível aplicar o grant na instância ativa.",
        instance:instanceSummary(patched.instance,true)}};
    }
    patchedInstance=patched&&patched.instance||null;
  }else{
    prepared=await enforceAuthoritativeProgress(db,acc.id,prepared);
  }
  // Inventário da conta: extrai bag/lootPouch/depot/reward chest do save para
  // o shared e espelha o shared no personagem (todos os chars compartilham).
  let sharedInventory=null;
  if(SharedInv&&typeof db.accountSharedInventory==="function"){
    let player={};try{player=JSON.parse(prepared.save.data);}catch(e){player={};}
    sharedInventory=await splitSharedInventory(db,acc,player,!!prepared.authoritativeInstance);
    prepared.save.data=JSON.stringify(player);
  }
  const result=await db.saveCharactersVersioned(acc.id,[prepared.save],lease);
  if(!result.ok)return saveConflictResponse(result);
  const updated=result.characters[0];
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,
    adminGrant?"admin-grant":"save",updated,!!adminGrant);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),
    source:adminGrant?"admin-grant":"save"});
  await publishPartyForCharacters(db,[updated.id],adminGrant?"admin-grant":"character-save");
  const account=await ensureAccountWallet(db,acc);
  return {code:200,body:{ok:true,saveVersion:Number(updated.save_version),
    character:accountCharacterSummary(updated),account:accountPublicView(account),
    instance:patchedInstance?instanceSummary(patchedInstance,false):null,
    ...(sharedInventory?{sharedInventory}:{})}};
}

function applyRewardChestClaim(p,body){
  rewardChestEnsure(p);
  if(body&&body.all)return rewardChestClaimAll(p);
  const bundleId=body&&(body.bundleId||body.bundle_id)||null;
  const slug=body&&body.slug?String(body.slug):"";
  if(bundleId&&slug)return rewardChestClaimOne(p,slug,bundleId)?1:0;
  if(bundleId)return rewardChestClaimBundle(p,bundleId);
  if(slug)return rewardChestClaimOne(p,slug,null)?1:0;
  return 0;
}

async function persistClaimedPlayer(db,acc,character,p,lease){
  // Inventário da conta: operações de cidade mudam o shared (pouch/depot/
  // reward); o save do personagem vira mirror do shared.
  let sharedInventory=null;
  if(SharedInv&&typeof db.accountSharedInventory==="function")
    sharedInventory=await splitSharedInventory(db,acc,p,true);
  const result=await db.saveCharactersVersioned(acc.id,[{
    id:Number(character.id),expectedVersion:Number(character.save_version),voc:character.voc,
    level:Math.max(1,Number(p.level)||Number(character.level)||1),data:JSON.stringify(p),
    extra:{hp:Math.max(0,Number(p.hp)||0),mp:Math.max(0,Number(p.mp)||0)},
  }],lease);
  if(!result.ok)return saveConflictResponse(result);
  const updated=result.characters[0];
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,"reward-claim",updated,false);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),source:"reward-claim"});
  await publishPartyForCharacters(db,[updated.id],"reward-claim");
  rewardChestEnsure(p);
  return {code:200,body:{ok:true,claimed:true,saveVersion:Number(updated.save_version),
    character:accountCharacterSummary(updated),rewardChest:p.rewardChest||{},
    rewardChestBundles:p.rewardChestBundles||[],lootPouch:p.lootPouch||{},supplyStash:p.supplyStash||{},
    ...(sharedInventory?{sharedInventory}:{})}};
}

async function claimRewardChest(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id!==undefined?body.char_id:body.id);
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"INVALID_REWARD_CLAIM",msg:"Personagem inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);
  if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    let last=null;
    for(let attempt=0;attempt<4;attempt++){
      const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
      if(!current||current.status!=="active")break;
      let claimedPlayer=null;
      const result=await db.instancePatchState(current.account_id,acc.id,current.instance_id,Number(current.version),(serialized)=>{
        let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
        const item=descriptor.authority&&descriptor.authority.players&&
          descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
        if(!item||!item.p)return null;
        applyRewardChestClaim(item.p,body);
        claimedPlayer=cloneJson(item.p);
        descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
      },lease);
      last=result;
      if(result.ok){
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
          status:result.instance.status,source:"reward-claim",holderId:String(body.holder_id||"")});
        const fresh=await db.findCharacter(charId);
        return persistClaimedPlayer(db,acc,fresh||character,claimedPlayer,lease);
      }
      if(result.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:result.error,msg:"Controle transferido durante a coleta"}};
      if(result.error!=="INSTANCE_VERSION_CONFLICT")break;
    }
    if(last&&last.error==="INSTANCE_NOT_ACTIVE"){/* cai no save do personagem */}
    else if(last&&!last.ok)
      return {code:409,body:{ok:false,error:last.error,msg:"Não foi possível recolher a recompensa",
        instance:instanceSummary(last.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  applyRewardChestClaim(p,body);
  return persistClaimedPlayer(db,acc,character,p,lease);
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
  const partyMembers=await db.partyMembers(owned.id),currentOrder=[Number(owned.leader_id)].concat(partyMembers.map((m)=>Number(m.id)));
  if(Number(owned.roster_version)!==partyVersion||order.length!==currentOrder.length||
     order.some((id,index)=>id!==currentOrder[index]))
    return {code:409,body:{ok:false,error:"PARTY_VERSION_CONFLICT",msg:"A composição da party mudou.",
      party:{id:Number(owned.id),version:Number(owned.roster_version),order:currentOrder}}};
  const entryIds=entries.map((entry)=>Number(entry&&entry.id));
  if(entryIds.length!==currentOrder.length||entryIds.some((id)=>!currentOrder.includes(id))||new Set(entryIds).size!==entryIds.length)
    return {code:409,body:{ok:false,error:"PARTY_SAVE_SET_MISMATCH",msg:"O save deve conter todos os membros da party."}};
  // Clientes antigos chamavam esta rota ao trocar o personagem controlado no
  // meio da hunt. O tick autoritativo já salva exatamente este conjunto e
  // avança save_version; tratar o checkpoint visual como no-op evita um 409
  // rotineiro sem abrir mão da validação de lease, roster ou propriedade.
  const activeInstance=await db.instanceGet(acc.id);
  if(activeInstance&&activeInstance.status==="active"&&Number(activeInstance.party_id)===partyId){
    const currentCharacters=[];
    for(const id of currentOrder){const character=await db.findCharacter(id);
      if(!character||Number(character.account_id)!==Number(acc.id))return {code:403,body:{ok:false,error:"PARTY_CHARACTER_NOT_OWNED",
        msg:"A party contém um personagem que não pertence à sua conta."}};
      currentCharacters.push(accountCharacterSummary(character));}
    return {code:200,body:{ok:true,partyVersion:Number(owned.roster_version),authoritativeInstance:true,
      characters:currentCharacters}};
  }
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
  await publishPartyForCharacters(db,result.characters.map((c)=>c.id),"party-save");
  return {code:200,body:{ok:true,partyVersion,
    characters:result.characters.map(accountCharacterSummary)}};
}

function instanceSummary(row,includeState){
  if(!row)return null;let state=null;
  if(includeState&&row.state){try{state=typeof row.state==="string"?JSON.parse(row.state):row.state;}catch(e){state=null;}}
  return {id:row.instance_id,version:Number(row.version)||0,status:row.status,ownerAccountId:Number(row.account_id)||null,kind:row.kind,
    huntId:row.hunt_id||null,bossId:row.boss_id||null,instanceMode:row.instance_mode,
    partyId:row.party_id?Number(row.party_id):null,partyVersion:row.party_version?Number(row.party_version):null,
    activeCharacterId:String(row.active_character_id),savedAt:new Date(row.saved_at).getTime(),
    startedAt:new Date(row.started_at).getTime(),workerCursorAt:new Date(row.worker_cursor_at||row.saved_at).getTime(),
    workerTotalMs:Number(row.worker_total_ms)||0,terminalReason:row.terminal_reason||null,state};
}
function instanceMemberIdSet(row){
  if(!row||row.state==null)return null;
  let state=row.state;
  try{if(typeof state==="string")state=JSON.parse(state);}catch(e){return null;}
  if(!state||typeof state!=="object")return null;
  const fromAuth=((state.authority&&state.authority.players)||[]).map((p)=>Number(p&&p.id)).filter((id)=>id>0);
  if(fromAuth.length)return new Set(fromAuth);
  const fromMembers=(state.members||[]).map((m)=>Number(m&&m.id)).filter((id)=>id>0);
  return fromMembers.length?new Set(fromMembers):null;
}
async function resolveInstanceRow(db,acc,charId){
  const id=Number(charId);let character=null,party=null;
  if(Number.isSafeInteger(id)&&id>0){character=await db.findCharacter(id);
    if(!character||Number(character.account_id)!==Number(acc.id))return {error:{code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}}};
    party=await db.partyFindByCharacter(id);
  }
  // World Boss compartilhado tem prioridade sobre party/hunt — JOIN da warzone.
  const wb=typeof global.__WORLD_BOSS!=="undefined"&&global.__WORLD_BOSS
    ?global.__WORLD_BOSS.sharedForAccount(acc.id):null;
  if(wb&&wb.ownerAccountId&&wb.instanceId){
    const shared=await db.instanceGet(wb.ownerAccountId);
    if(shared&&shared.status==="active"&&String(shared.instance_id)===String(wb.instanceId))
      return {row:shared,character,party,shared:Number(shared.account_id)!==Number(acc.id),worldBoss:true};
  }
  if(party&&typeof db.instanceGetByParty==="function"){
    const shared=await db.instanceGetByParty(party.id);if(shared)return {row:shared,character,party,shared:Number(shared.account_id)!==Number(acc.id)};}
  // Lobby Megalomania: convidados compartilham a instância do líder.
  const mega=typeof global.__MEGA_LOBBY!=="undefined"&&global.__MEGA_LOBBY
    ?global.__MEGA_LOBBY.sharedForAccount(acc.id):null;
  if(mega&&mega.ownerAccountId&&Number(mega.ownerAccountId)!==Number(acc.id)){
    const shared=await db.instanceGet(mega.ownerAccountId);
    if(shared&&shared.status==="active")return {row:shared,character,party,shared:true,mega:true};
  }
  return {row:await db.instanceGet(acc.id),character,party,shared:false};
}
async function instanceCharactersForAccount(db,row,accountId){
  let state=null;try{state=typeof row.state==="string"?JSON.parse(row.state):row.state;}catch(e){}
  const ids=((state&&state.authority&&state.authority.players)||[]).map((item)=>Number(item.id)),out=[];
  for(const id of ids){const character=await db.findCharacter(id);
    if(character&&Number(character.account_id)===Number(accountId))out.push(accountCharacterSummary(character));}
  return out;
}
async function publishInstanceForRow(db,row,data){
  const accounts=new Set([Number(row.account_id)]);
  if(row.party_id){const members=await db.partyMembers(row.party_id),ids=[Number(row.active_character_id)].concat(members.map((m)=>Number(m.id)));
    const party=await db.partyFindByCharacter(ids[0]);if(party)ids[0]=Number(party.leader_id);
    for(const id of ids){const character=await db.findCharacter(id);if(character)accounts.add(Number(character.account_id));}}
  // Convidados do lobby Megalomania (sem party). Dono da row pode ter
  // morrido e saído do lobby — achar pelo instanceOwnerAccountId.
  if(typeof global.__MEGA_LOBBY!=="undefined"&&global.__MEGA_LOBBY){
    const lobby=global.__MEGA_LOBBY.getLobbyForAccount(row.account_id)||
      (typeof global.__MEGA_LOBBY.getLobbyByInstanceOwner==="function"
        ?global.__MEGA_LOBBY.getLobbyByInstanceOwner(row.account_id):null);
    if(lobby)for(const s of lobby.slots||[])if(s)accounts.add(Number(s.accountId));
  }
  if(typeof global.__WORLD_BOSS!=="undefined"&&global.__WORLD_BOSS){
    const wbEvent=typeof global.__WORLD_BOSS.getEventByOwner==="function"
      ?global.__WORLD_BOSS.getEventByOwner(row.account_id):null;
    if(wbEvent&&wbEvent.joins)for(const [accountId] of wbEvent.joins)accounts.add(Number(accountId));
  }
  for(const accountId of accounts)publishSync(accountId,"instance",data);
}
async function loadInstance(db,token,charId){
  const acc=await db.findAccountByToken(token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(!row||row.status!=="active")return {code:200,body:{ok:true,instance:null,lastStatus:row?row.status:null,
    terminalReason:row&&row.terminal_reason||null}};
  const summary=instanceSummary(row,true);
  if(!summary.state)return {code:500,body:{ok:false,error:"INSTANCE_STATE_INVALID",msg:"Snapshot da instância está corrompido"}};
  if((resolved.party||resolved.worldBoss)&&resolved.character&&summary.state.members&&
     summary.state.members.some((member)=>String(member.id)===String(resolved.character.id)))
    summary.state.activeCharacterId=String(resolved.character.id);
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
  let mode=["non-pvp","pvp","boss"].includes(String(input.instanceMode))?String(input.instanceMode):
    (kind==="boss"?"boss":"non-pvp");
  // Idle: non-pvp e pvp são instâncias distintas. Após criar, o modo fica
  // travado no registro ativo — não mistura flags no meio da caçada.
  const currentRow=await db.instanceGet(acc.id);
  if(currentRow&&currentRow.status==="active"&&currentRow.instance_mode){
    const locked=String(currentRow.instance_mode);
    if(["non-pvp","pvp","boss"].includes(locked)){
      if(mode!==locked)return {error:{code:409,body:{ok:false,error:"INSTANCE_MODE_MISMATCH",
        msg:"Não é possível misturar instância pvp e non-pvp",instance_mode:locked}}};
      mode=locked;
    }
  }
  let members=Array.isArray(input.members)?input.members:[];
  const requestedActiveId=Number(input.activeCharacterId),requestedActive=await db.findCharacter(requestedActiveId),
    requestedParty=requestedActive&&Number(requestedActive.account_id)===Number(acc.id)?await db.partyFindByCharacter(requestedActiveId):null;
  if(!isWorldBossBossId(bossId)&&requestedParty&&Number(requestedParty.owner_account_id)===Number(acc.id)){
    const roster=await db.partyMembers(requestedParty.id),order=[Number(requestedParty.leader_id)].concat(roster.map((m)=>Number(m.id))),expanded=[];
    for(const id of order){const supplied=members.find((member)=>Number(member&&member.id)===id);
      if(supplied)expanded.push(supplied);else{const row=await db.findCharacter(id);
        // O cliente do líder não possui snapshots de contas convidadas; o
        // servidor os completa. Personagens da própria conta continuam
        // obrigatórios para detectar snapshot parcial/corrompido.
        if(row&&Number(row.account_id)!==Number(acc.id))expanded.push({id:String(id),p:{}});}}
    members=expanded;input.members=members;
  }
  // Lobby Megalomania: líder cria a sala com TODOS os chars do lobby (1–5
  // contas). Sem isso o PUT só leva o líder e o bind pós-fato falhava/atrasava
  // — convidados nunca entravam na mesma autoridade.
  {
    const megaCtrlEarly=typeof global.__MEGA_LOBBY!=="undefined"?global.__MEGA_LOBBY:null;
    const megaLobbyEarly=megaCtrlEarly&&typeof megaCtrlEarly.getLobbyForAccount==="function"
      ?megaCtrlEarly.getLobbyForAccount(acc.id):null;
    if(megaLobbyEarly&&Number(megaLobbyEarly.leaderAccountId)===Number(acc.id)&&
       String(bossId||"")==="goshnar-s-megalomania"&&
       (megaLobbyEarly.status==="open"||megaLobbyEarly.status==="starting"||megaLobbyEarly.status==="fighting")){
      const order=(megaLobbyEarly.slots||[]).filter(Boolean).map((s)=>Number(s.charId));
      if(order.length){
        const expanded=[];
        for(const id of order){
          const supplied=members.find((member)=>Number(member&&member.id)===id);
          if(supplied)expanded.push(supplied);
          else{
            const row=await db.findCharacter(id);
            if(row)expanded.push({id:String(id),p:{}});
          }
        }
        if(expanded.length){members=expanded;input.members=members;}
      }
    }
  }
  // Lobby Pale Worm: líder cria a sala com TODOS os chars do lobby (1–9
  // contas), igual ao fluxo do Megalomania.
  {
    const paleCtrlEarly=typeof global.__PALE_LOBBY!=="undefined"?global.__PALE_LOBBY:null;
    const paleLobbyEarly=paleCtrlEarly&&typeof paleCtrlEarly.getLobbyForAccount==="function"
      ?paleCtrlEarly.getLobbyForAccount(acc.id):null;
    if(paleLobbyEarly&&Number(paleLobbyEarly.leaderAccountId)===Number(acc.id)&&
       String(bossId||"")==="the-pale-worm"&&
       (paleLobbyEarly.status==="open"||paleLobbyEarly.status==="starting"||paleLobbyEarly.status==="fighting")){
      const order=(paleLobbyEarly.slots||[]).filter(Boolean).map((s)=>Number(s.charId));
      if(order.length){
        const expanded=[];
        for(const id of order){
          const supplied=members.find((member)=>Number(member&&member.id)===id);
          if(supplied)expanded.push(supplied);
          else{
            const row=await db.findCharacter(id);
            if(row)expanded.push({id:String(id),p:{}});
          }
        }
        if(expanded.length){members=expanded;input.members=members;}
      }
    }
  }
  {
    const wbCtrlEarly=typeof global.__WORLD_BOSS!=="undefined"?global.__WORLD_BOSS:null;
    if(isWorldBossBossId(bossId)&&wbCtrlEarly&&typeof wbCtrlEarly.joinedCharIds==="function"){
      const order=wbCtrlEarly.joinedCharIds().map(Number).filter((id)=>id>0);
      if(order.length){
        const expanded=[];
        for(const id of order){
          const supplied=members.find((member)=>Number(member&&member.id)===id);
          if(supplied)expanded.push(supplied);
          else{
            const row=await db.findCharacter(id);
            if(row)expanded.push({id:String(id),p:{}});
          }
        }
        if(expanded.length){members=expanded;input.members=members;}
      }
    }
  }
  const maxMembers=isWorldBossBossId(bossId)?WORLD_BOSS_MAX_MEMBERS:
    (String(bossId||"")==="the-pale-worm"?9:5);
  if(!members.length||members.length>maxMembers)return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_MEMBERS",msg:"Membros da instância inválidos"}}};
  let ids=members.map((member)=>Number(member&&member.id));
  if(ids.some((id)=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)
    return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_MEMBERS",msg:"Membros duplicados ou inválidos"}}};
  const activeId=Number(input.activeCharacterId);
  if(!ids.includes(activeId))return {error:{code:400,body:{ok:false,error:"INVALID_ACTIVE_CHARACTER",msg:"Personagem ativo fora da instância"}}};
  // Party/ordem ANTES da hidratação (o rebuild de tolerância abaixo adiciona
  // membros que o checkpoint não trouxe — eles precisam do p canônico do banco).
  const party=await db.partyFindByCharacter(activeId);
  const partyMembers=party?await db.partyMembers(party.id):[];
  const partyOrder=party?[Number(party.leader_id)].concat(partyMembers.map((m)=>Number(m.id))):[];
  if(party&&(partyOrder.length!==ids.length||partyOrder.some((id,index)=>id!==ids[index]))){
    // Tolerância de composição/ordem: o roster da party pode ter mudado depois
    // que a instância foi criada (membro entrou/saiu/reordenou) e o snapshot
    // do cliente pode estar um passo atrás — sem isso o PUT de checkpoint
    // virava 409 infinito ("Composição/ordem da instância difere da party") e
    // a aba nunca mais sincronizava (nem a recriação após restart, quando o
    // líder não tem o snapshot do membro recém-convidado).
    // Regra: o conjunto aceito é a party atual ∪ os membros que já estão na
    // instância ativa (espelho do megaContinueOk do Megalomania). Quem não
    // pertence a nenhum dos dois (char estranho) continua rejeitado.
    const cur=await db.instanceGet(acc.id);
    const curIds=cur&&cur.status==="active"?instanceMemberIdSet(cur):null;
    const accepted=new Set(partyOrder);
    if(curIds)for(const id of curIds)accepted.add(id);
    if(ids.some((id)=>!accepted.has(id)))
      return {error:{code:409,body:{ok:false,error:"INSTANCE_PARTY_MISMATCH",
        msg:"Composição/ordem da instância difere da party"}}};
    // Reconstrói na ordem da party (líder + membros por posição), completando
    // do banco (p:{}) quem o cliente não trouxe — o loop de hidratação abaixo
    // substitui o p canônico de cada membro. Membros da instância que saíram
    // da party permanecem no final enquanto a luta estiver ativa.
    const byId=new Map(members.map((m)=>[Number(m&&m.id),m]));
    const rebuilt=[];
    for(const id of partyOrder)rebuilt.push(byId.get(id)||{id:String(id),p:{}});
    if(curIds)for(const id of curIds)
      if(!partyOrder.includes(id)&&rebuilt.length<maxMembers)
        rebuilt.push(byId.get(id)||{id:String(id),p:{}});
    members=rebuilt;ids=members.map((m)=>Number(m&&m.id));
    input.members=members;
  }
  const rows=[];
  const accountCache=new Map();
  for(let index=0;index<ids.length;index++){
    const id=ids[index],c=await db.findCharacter(id),member=members[index]||{},player=member.p||{};
    if(!c)return {error:{code:404,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_FOUND",
      msg:"A instância contém personagem inexistente"}}};
    if((player.id!==undefined&&String(player.id)!==String(c.id))||
       (player.name&&String(player.name).toLowerCase()!==String(c.name).toLowerCase()))
      return {error:{code:409,body:{ok:false,error:"INSTANCE_IDENTITY_MISMATCH",msg:"Snapshot contém identidade cruzada"}}};
    let ownerAcc=accountCache.get(Number(c.account_id));
    if(!ownerAcc){
      ownerAcc=await db.findAccountById(c.account_id);
      if(typeof db.migrateAccountGold==="function")ownerAcc=await db.migrateAccountGold(c.account_id)||ownerAcc;
      accountCache.set(Number(c.account_id),ownerAcc);
    }
    let canonical={};try{canonical=typeof c.data==="string"?JSON.parse(c.data):(c.data||{});}catch(e){}
    canonical=Object.assign({},canonical,{id:String(c.id),name:c.name,voc:c.voc,level:Number(c.level)||1});
    canonical.gold=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.gold)||0));
    canonical.vipUntil=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.vip_until)||0));
    canonical.accountId=Number(c.account_id);
    if(Number(c.hp)>0)canonical.hp=Number(c.hp);if(Number(c.mp)>=0)canonical.mp=Number(c.mp);
    // Inventário da conta: hidrata bag/lootPouch/depot/reward chest do shared
    // no membro (a instância combate com os containers compartilhados).
    if(SharedInv&&typeof db.accountSharedInventory==="function"){
      try{
        const shared=await db.accountSharedInventory(Number(c.account_id));
        SharedInv.applySharedToPlayer(canonical,shared);
      }catch(e){/* shared opcional */}
    }
    // Preferências de loot do snapshot do cliente: o DB pode estar atrasado
    // (toggle local antes do PUT). Não é progresso econômico — só autoloot.
    const clientP=player&&typeof player==="object"&&!Array.isArray(player)?player:{};
    if(clientP.config&&clientP.config.autoSupplyStash&&typeof clientP.config.autoSupplyStash==="object"&&
       !Array.isArray(clientP.config.autoSupplyStash)){
      canonical.config=canonical.config&&typeof canonical.config==="object"&&!Array.isArray(canonical.config)
        ?canonical.config:{};
      const dbAuto=canonical.config.autoSupplyStash&&typeof canonical.config.autoSupplyStash==="object"&&
        !Array.isArray(canonical.config.autoSupplyStash)?canonical.config.autoSupplyStash:{};
      canonical.config.autoSupplyStash=Object.assign({},dbAuto,clientP.config.autoSupplyStash);
    }
    if(clientP.lootConfig&&typeof clientP.lootConfig==="object"&&!Array.isArray(clientP.lootConfig)){
      const dbLoot=canonical.lootConfig&&typeof canonical.lootConfig==="object"&&!Array.isArray(canonical.lootConfig)
        ?canonical.lootConfig:{noCollect:[],noSell:[]};
      const mergeRules=(a,b)=>{
        const out=[];const seen=new Set();
        for(const list of [Array.isArray(a)?a:[],Array.isArray(b)?b:[]]){
          for(const raw of list){
            const rule=String(raw||"").trim().toLowerCase();
            if(!rule||seen.has(rule))continue;seen.add(rule);out.push(rule);
          }
        }
        return out;
      };
      canonical.lootConfig={
        noCollect:mergeRules(dbLoot.noCollect,clientP.lootConfig.noCollect),
        noSell:mergeRules(dbLoot.noSell,clientP.lootConfig.noSell),
      };
    }
    member.p=canonical;member.hp=canonical.hp;member.mp=canonical.mp;member.accountId=Number(c.account_id);rows.push(c);
  }
  const activeRow=rows[ids.indexOf(activeId)];
  if(!activeRow||Number(activeRow.account_id)!==Number(acc.id))return {error:{code:403,body:{ok:false,error:"INSTANCE_ACTIVE_NOT_OWNED",
    msg:"O personagem ativo não pertence à conta"}}};
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
  const megaCtrl=typeof global.__MEGA_LOBBY!=="undefined"?global.__MEGA_LOBBY:null;
  const megaLobby=megaCtrl&&typeof megaCtrl.getLobbyForAccount==="function"
    ?megaCtrl.getLobbyForAccount(acc.id):null;
  const megaIds=megaLobby
    ?new Set((megaLobby.slots||[]).filter(Boolean).map((s)=>Number(s.charId)))
    :null;
  const megaRosterOk=!!(megaLobby&&megaIds&&ids.every((id)=>megaIds.has(Number(id)))&&
    Number(megaLobby.leaderAccountId)===Number(acc.id)&&
    (megaLobby.status==="open"||megaLobby.status==="starting"||megaLobby.status==="fighting"));
  // Death→save race: leaveFight pode fechar/encolher o lobby ANTES do PUT
  // enfileirado. Se a sala mega já está ativa nesta conta, aceite members que
  // já pertencem ao snapshot (ou ainda estão no lobby do dono da instância).
  let megaContinueOk=false;
  if(!megaRosterOk&&!party&&String(bossId||"")==="goshnar-s-megalomania"&&megaCtrl){
    const cur=await db.instanceGet(acc.id);
    if(cur&&cur.status==="active"&&String(cur.boss_id||"")==="goshnar-s-megalomania"){
      const curIds=instanceMemberIdSet(cur);
      if(curIds&&ids.every((id)=>curIds.has(Number(id))))megaContinueOk=true;
    }
    if(!megaContinueOk){
      const ownedLobby=typeof megaCtrl.getLobbyByInstanceOwner==="function"
        ?megaCtrl.getLobbyByInstanceOwner(acc.id):null;
      if(ownedLobby&&(ownedLobby.status==="fighting"||ownedLobby.status==="starting")){
        const slotIds=new Set((ownedLobby.slots||[]).filter(Boolean).map((s)=>Number(s.charId)));
        const curIds=cur&&cur.status==="active"?instanceMemberIdSet(cur):null;
        if(ids.every((id)=>slotIds.has(Number(id))||(curIds&&curIds.has(Number(id)))))
          megaContinueOk=true;
      }
    }
  }
  const megaOk=megaRosterOk||megaContinueOk;
  // Pale Worm: mesmo modelo de roster do Megalomania (1–9 contas).
  const paleCtrl2=typeof global.__PALE_LOBBY!=="undefined"?global.__PALE_LOBBY:null;
  const paleLobby2=paleCtrl2&&typeof paleCtrl2.getLobbyForAccount==="function"
    ?paleCtrl2.getLobbyForAccount(acc.id):null;
  const paleIds=paleLobby2
    ?new Set((paleLobby2.slots||[]).filter(Boolean).map((s)=>Number(s.charId)))
    :null;
  const paleRosterOk=!!(paleLobby2&&paleIds&&ids.every((id)=>paleIds.has(Number(id)))&&
    Number(paleLobby2.leaderAccountId)===Number(acc.id)&&
    (paleLobby2.status==="open"||paleLobby2.status==="starting"||paleLobby2.status==="fighting"));
  let paleContinueOk=false;
  if(!paleRosterOk&&!party&&String(bossId||"")==="the-pale-worm"&&paleCtrl2){
    const cur=await db.instanceGet(acc.id);
    if(cur&&cur.status==="active"&&String(cur.boss_id||"")==="the-pale-worm"){
      const curIds=instanceMemberIdSet(cur);
      if(curIds&&ids.every((id)=>curIds.has(Number(id))))paleContinueOk=true;
    }
    if(!paleContinueOk){
      const ownedLobby=typeof paleCtrl2.getLobbyByInstanceOwner==="function"
        ?paleCtrl2.getLobbyByInstanceOwner(acc.id):null;
      if(ownedLobby&&(ownedLobby.status==="fighting"||ownedLobby.status==="starting")){
        const slotIds=new Set((ownedLobby.slots||[]).filter(Boolean).map((s)=>Number(s.charId)));
        const curIds=cur&&cur.status==="active"?instanceMemberIdSet(cur):null;
        if(ids.every((id)=>slotIds.has(Number(id))||(curIds&&curIds.has(Number(id)))))
          paleContinueOk=true;
      }
    }
  }
  const paleOk=paleRosterOk||paleContinueOk;
  const wbCtrl=typeof global.__WORLD_BOSS!=="undefined"?global.__WORLD_BOSS:null;
  const wbShare=wbCtrl&&typeof wbCtrl.sharedForAccount==="function"?wbCtrl.sharedForAccount(acc.id):null;
  const wbIds=wbCtrl&&typeof wbCtrl.joinedCharIds==="function"?new Set(wbCtrl.joinedCharIds().map(Number)):null;
  const worldBossOk=!!(isWorldBossBossId(bossId)&&wbShare&&wbIds&&wbIds.size&&
    ids.every((id)=>wbIds.has(Number(id))));
  // A instância pertence ao roster, não à conta individual. Portanto uma
  // party entre contas também precisa enviar líder + todos os membros na
  // mesma ordem; somente o personagem ativo precisa pertencer ao requester.
  // Lobby Megalomania permite 1–5 contas sem Party. Pale Worm 1–9. World Boss até 30.
  if(!party&&!megaOk&&!paleOk&&!worldBossOk&&rows.some((row)=>Number(row.account_id)!==Number(acc.id)))
    return {error:{code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Instância solo contém personagem externo"}}};
  if(ids.length>1||party){
    if(worldBossOk){
      partyId=null;partyVersion=null;
    }else if(party){
      // A tolerância de composição/ordem rodou ANTES da hidratação (bloco
      // acima). Aqui a ordem já está normalizada para a party — só resta
      // vincular o registro. Se ainda houver divergência (criação sem
      // instância ativa, composição estranha), mantém a rejeição estrita.
      if(partyOrder.length!==ids.length||partyOrder.some((id,index)=>id!==ids[index]))
        return {error:{code:409,body:{ok:false,error:"INSTANCE_PARTY_MISMATCH",
          msg:"Composição/ordem da instância difere da party"}}};
      partyId=Number(party.id);partyVersion=Number(party.roster_version);
    }else if(!megaOk&&!paleOk){
      return {error:{code:409,body:{ok:false,error:"INSTANCE_PARTY_REQUIRED",msg:"Party não encontrada"}}};
    }
  }
  const now=Date.now(),state=Object.assign({},input,{v:1,savedAt:now,kind,huntId,bossId,
    instanceMode:mode,activeCharacterId:String(activeId)});
  return {state,meta:{kind,hunt_id:huntId,boss_id:bossId,instance_mode:mode,party_id:partyId,
    party_version:partyVersion,member_ids:ids,active_character_id:activeId,
    saved_at:new Date(now),started_at:new Date(now)}};
}
async function createWorldBossSharedInstance(db,event){
  if(!event||!event.joins||!event.joins.size)return {ok:false,error:"NO_JOINS"};
  const wz=WARZONES.find((w)=>w.id===event.warzoneId)||WARZONES[0];
  const bossId=bossIdForWarzone(wz.id);
  const hostAccountId=Number(event.hostAccountId||[...event.joins.keys()][0]);
  if(!hostAccountId)return {ok:false,error:"NO_HOST"};
  const gridW=40,gridH=40,spawn={x:20,y:28},bossCell={x:20,y:16};
  const members=[],players=[];
  let index=0;
  for(const [accountId,join] of event.joins){
    for(const slot of join.chars||[]){
      const character=await db.findCharacter(slot.id);
      if(!character)continue;
      let data=character.data;
      if(typeof data==="string"){try{data=JSON.parse(data);}catch(e){data={};}}
      data=data&&typeof data==="object"?cloneJson(data):{};
      data.id=String(character.id);
      data.name=character.name||data.name||slot.name;
      data.voc=character.voc||data.voc||slot.voc;
      data.level=Math.max(1,Number(character.level)||Number(data.level)||1);
      const ownerAcc=await db.findAccountById(character.account_id);
      data.gold=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.gold)||0));
      data.accountId=Number(character.account_id);
      const max=maxStats(data);
      data.hp=max.hp;data.mp=max.mp;
      const ox=(index%5)-2,oy=Math.floor(index/5)%3;
      const cx=Math.max(1,Math.min(gridW-2,spawn.x+ox));
      const cy=Math.max(1,Math.min(gridH-2,spawn.y+oy));
      members.push({id:String(character.id),p:data,hp:data.hp,mp:data.mp,accountId:Number(character.account_id)});
      players.push({
        id:String(character.id),p:data,hp:data.hp,mp:data.mp,accountId:Number(character.account_id),
        cx,cy,x:(cx+.5)/gridW,y:(cy+.5)/gridH,dir:"n",
      });
      index++;
    }
  }
  if(!members.length)return {ok:false,error:"NO_MEMBERS"};
  const bossHp=Math.max(1,Number(event.bossMaxHp||wz.bossHp)||2500000);
  const slug=wz.baseMonster||wz.bossSprite||"deathstrike";
  const descriptor={
    v:1,kind:"boss",huntId:null,bossId,instanceMode:"boss",worldBoss:true,
    activeCharacterId:String(members[0].id),members,
    state:{
      worldBoss:true,instanceMode:"boss",gridW,gridH,huntId:null,
      raidEnabled:false,influencedChance:0,fiendishChance:0,players,
      mobs:[{
        slug,boss:true,worldBoss:true,id:"boss-"+bossId,
        hp:bossHp,maxHp:bossHp,cx:bossCell.x,cy:bossCell.y,
        x:(bossCell.x+.5)/gridW,y:(bossCell.y+.5)/gridH,
      }],
      arenaBossSpawn:{at:event.spawnAt||(Date.now()+10000),spawned:false},
    },
  };
  for(const accountId of event.joins.keys()){
    try{if(typeof db.instanceEndForced==="function")await db.instanceEndForced(Number(accountId),"world-boss-prep");}
    catch(e){console.error("[world-boss] end hunt",accountId,e&&e.message);}
  }
  const instanceId=newToken();
  const initialized=initializeAuthority(descriptor,instanceId,Date.now());
  const stamp=new Date();
  const saved=await db.instanceReplaceForced(hostAccountId,instanceId,{
    kind:"boss",hunt_id:null,boss_id:bossId,instance_mode:"boss",
    party_id:null,party_version:null,active_character_id:Number(members[0].id),
    saved_at:stamp,started_at:stamp,
  },JSON.stringify(initialized));
  if(!saved||!saved.ok)return {ok:false,error:(saved&&saved.error)||"SAVE_FAILED"};
  try{
    await publishInstanceForRow(db,saved.instance,{
      id:saved.instance.instance_id,version:Number(saved.instance.version)||1,
      status:"active",source:"world-boss-create",holderId:"",
    });
  }catch(e){/* best-effort */}
  console.log("[world-boss] shared instance",String(instanceId).slice(0,12),"host="+hostAccountId,"chars="+members.length);
  return {ok:true,instanceId,ownerAccountId:hostAccountId,instance:saved.instance};
}
async function syncWorldBossShared(db,event){
  if(!event||!event.hostAccountId||!event.instanceId)return;
  const row=await db.instanceGet(event.hostAccountId);
  if(!row)return;
  let state=row.state;
  try{if(typeof state==="string")state=JSON.parse(state);}catch(e){state=null;}
  const auth=state&&state.authority;
  const boss=auth&&Array.isArray(auth.mobs)?auth.mobs.find((m)=>m&&m.boss):null;
  const pending=auth&&auth.arenaBossSpawn&&auth.arenaBossSpawn.pending;
  if(boss)event.bossHp=Math.max(0,Math.floor(Number(boss.hp)||0));
  else if(pending)event.bossHp=Math.max(0,Math.floor(Number(pending.hp||pending.maxHp)||event.bossHp||0));
  if(row.status!=="active"){
    const reason=String(row.terminal_reason||"");
    const ctrl=global.__WORLD_BOSS;
    if(ctrl&&typeof ctrl.onSharedEnded==="function"){
      const win=reason==="boss-defeated"||event.bossHp<=0;
      await ctrl.onSharedEnded(win?"boss-defeated":(reason||"ended"));
    }
  }
}
function restoreAuthoritativeEntry(state){
  if(!state||!Array.isArray(state.members))return state;
  for(const member of state.members){if(!member||!member.p)continue;const max=maxStats(member.p);
    member.p.hp=max.hp;member.p.mp=max.mp;member.hp=max.hp;member.mp=max.mp;}
  if(state.state&&Array.isArray(state.state.players))for(const ent of state.state.players){
    if(!ent)continue;const member=state.members.find((m)=>String(m.id)===String(ent.id||ent.p&&ent.p.id));
    if(member){ent.p=cloneJson(member.p);ent.hp=member.hp;ent.mp=member.mp;ent.reviveAt=0;ent.downedAt=0;
      ent.permadead=false;ent.deathPos=null;}}
  return state;
}
async function saveInstance(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const expected=Number(body.expected_version);
  if(!Number.isSafeInteger(expected)||expected<0)return {code:428,body:{ok:false,error:"INSTANCE_VERSION_REQUIRED",msg:"Atualize a instância antes de salvar"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const activeId=Number(body.state&&body.state.activeCharacterId),active=await db.findCharacter(activeId);
  if(active&&Number(active.account_id)===Number(acc.id)){
    const party=await db.partyFindByCharacter(activeId),shared=party&&typeof db.instanceGetByParty==="function"?await db.instanceGetByParty(party.id):null;
    if(party&&shared&&(activeId!==Number(party.leader_id)||expected===0||String(body.instance_id||"")!==String(shared.instance_id)))
      return {code:200,body:{ok:true,shared:true,instance:instanceSummary(shared,false)}};
    if(party&&Number(party.leader_id)!==activeId&&!shared)
      return {code:200,body:{ok:true,pending:true,instance:null,msg:"Aguardando a instância do líder"}};
    if(party&&Number(party.owner_account_id)!==Number(acc.id)){
      if(!shared)return {code:200,body:{ok:true,pending:true,instance:null,msg:"Aguardando a instância do líder"}};
      const own=await db.instanceGet(acc.id);
      if(own&&own.status==="active"&&String(own.instance_id)!==String(shared.instance_id))
        await db.instanceEnd(acc.id,own.instance_id,own.version,"joined-shared-party",lease);
      return {code:200,body:{ok:true,shared:true,instance:instanceSummary(shared,false)}};
    }
    // Convidado World Boss: não cria sala própria — espelha a instância da warzone.
    const wbShare=typeof global.__WORLD_BOSS!=="undefined"&&global.__WORLD_BOSS
      ?global.__WORLD_BOSS.sharedForAccount(acc.id):null;
    if(wbShare&&Number(wbShare.ownerAccountId)!==Number(acc.id)){
      const wbShared=await db.instanceGet(wbShare.ownerAccountId);
      if(!wbShared||wbShared.status!=="active")
        return {code:200,body:{ok:true,pending:true,instance:null,msg:"Aguardando a instância do World Boss"}};
      const own=await db.instanceGet(acc.id);
      if(own&&own.status==="active"&&String(own.instance_id)!==String(wbShared.instance_id))
        await db.instanceEnd(acc.id,own.instance_id,own.version,"joined-shared-world-boss",lease);
      return {code:200,body:{ok:true,shared:true,instance:instanceSummary(wbShared,false)}};
    }
    // Convidado Megalomania: não cria sala própria — espelha a do líder.
    const megaShare=typeof global.__MEGA_LOBBY!=="undefined"&&global.__MEGA_LOBBY
      ?global.__MEGA_LOBBY.sharedForAccount(acc.id):null;
    if(megaShare&&Number(megaShare.ownerAccountId)!==Number(acc.id)){
      const megaShared=await db.instanceGet(megaShare.ownerAccountId);
      if(!megaShared||megaShared.status!=="active")
        return {code:200,body:{ok:true,pending:true,instance:null,msg:"Aguardando a instância do líder"}};
      const own=await db.instanceGet(acc.id);
      if(own&&own.status==="active"&&String(own.instance_id)!==String(megaShared.instance_id))
        await db.instanceEnd(acc.id,own.instance_id,own.version,"joined-shared-mega",lease);
      return {code:200,body:{ok:true,shared:true,instance:instanceSummary(megaShared,false)}};
    }
  }
  const prepared=await prepareInstanceState(db,acc,body.state);
  if(prepared.error){
    // Death→save: lobby já fechou e o PUT (checkpoint) ainda carrega convidados.
    // Em vez de 403 “personagem externo”, encerre a sala mega órfã e devolva ok.
    const errBody=prepared.error.body||{};
    const expectedVer=Number(body.expected_version);
    if(errBody.error==="INSTANCE_CHARACTER_NOT_OWNED"&&
       String(body.state&&body.state.bossId||"")==="goshnar-s-megalomania"&&
       Number.isSafeInteger(expectedVer)&&expectedVer>0&&
       typeof db.instanceEndMegaOrphan==="function"){
      try{
        const row=await db.instanceGet(acc.id);
        if(row&&row.status==="active"&&String(row.boss_id||"")==="goshnar-s-megalomania"){
          const ended=await db.instanceEndMegaOrphan(acc.id,row.instance_id,"mega-save-race-cleanup");
          if(ended&&ended.ok){
            try{
              await publishInstanceForRow(db,ended.instance||row,{
                id:(ended.instance||row).instance_id,version:Number((ended.instance||row).version)||1,
                status:"ended",terminalReason:"mega-save-race-cleanup",source:"mega-save-race",
                holderId:String(body.holder_id||"")});
            }catch(e){/* ignore */}
            return {code:200,body:{ok:true,ended:true,reason:"mega-save-race-cleanup",instance:null}};
          }
        }
      }catch(e){console.error("[mega] save-race cleanup:",e&&e.message);}
    }
    return prepared.error;
  }
  let instanceId=String(body.instance_id||"");
  if(expected===0){
    instanceId=newToken();prepared.state=restoreAuthoritativeEntry(prepared.state);
    prepared.state=initializeAuthority(prepared.state,instanceId,Date.now());
  }else{
    if(!/^[a-f0-9]{64}$/.test(instanceId))return {code:400,body:{ok:false,error:"INVALID_INSTANCE_ID",msg:"Instância inválida"}};
    const current=await db.instanceGet(acc.id);let currentState=null;
    try{currentState=current&&current.state?(typeof current.state==="string"?JSON.parse(current.state):current.state):null;}catch(e){}
    if(currentState&&currentState.authority){prepared.state.authority=currentState.authority;prepared.state=materializeAuthority(prepared.state);}
  }
  const result=await db.instanceSave(acc.id,instanceId,expected,prepared.meta,JSON.stringify(prepared.state),lease);
  if(!result.ok){
    if(result.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:result.error,msg:"Controle transferido durante o save"}};
    return {code:409,body:{ok:false,error:result.error,msg:"A instância foi alterada por outra sessão",
      instance:instanceSummary(result.instance,true)}};
  }
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"instance",result.instance.instance_id,
    result.instance.version,expected===0?"created":"checkpoint",result.instance,expected===0);
  await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
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
  const resolved=await resolveInstanceRow(db,acc,body.char_id);if(resolved.error)return resolved.error;
  if(resolved.shared&&resolved.row&&resolved.row.status==="active"&&!resolved.worldBoss){
    const guestLease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()},own=await db.instanceGet(acc.id);
    if(own&&own.status==="active"&&String(own.instance_id)!==String(resolved.row.instance_id))
      await db.instanceEnd(acc.id,own.instance_id,own.version,"joined-shared-party",guestLease);
    // Convidado Megalomania: enfileira QTE pessoal (lease do líder avança no tick dele).
    if(resolved.mega&&body.visual_state&&resolved.character&&
       typeof global.__MEGA_LOBBY!=="undefined"&&global.__MEGA_LOBBY&&
       typeof global.__MEGA_LOBBY.queueIntent==="function"){
      const pid=String(resolved.character.id);
      const pushOne=(intent)=>{
        if(!intent||typeof intent!=="object")return;
        global.__MEGA_LOBBY.queueIntent(Number(resolved.row.account_id),
          Object.assign({},intent,{playerId:pid}));
      };
      if(body.visual_state.megaIntent)pushOne(body.visual_state.megaIntent);
      if(Array.isArray(body.visual_state.megaIntents)){
        for(const intent of body.visual_state.megaIntents)pushOne(intent);
      }
    }
    const summary=instanceSummary(resolved.row,true);
    if(summary.state&&resolved.character)summary.state.activeCharacterId=String(resolved.character.id);
    return {code:200,body:{ok:true,shared:true,elapsed:0,terminalReason:null,instance:summary,
      characters:await instanceCharactersForAccount(db,resolved.row,acc.id)}};
  }
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const ownerId=resolved.row?Number(resolved.row.account_id):Number(acc.id);
  if(resolved.worldBoss&&resolved.shared){
    const own=await db.instanceGet(acc.id);
    if(own&&own.status==="active"&&String(own.instance_id)!==String(resolved.row.instance_id))
      await db.instanceEnd(acc.id,own.instance_id,own.version,"joined-shared-world-boss",lease);
  }
  // A posição visual prevista pelo grid não decide dano/alcance. Ela só é
  // sincronizada no snapshot/eventos para efeitos acompanharem as entidades.
  // Intents de convidados Megalomania entram no tick do líder.
  const advanceWithVisuals=(state,elapsed,checkpointAt)=>{
    let visual=body.visual_state;
    if(typeof global.__MEGA_LOBBY!=="undefined"&&global.__MEGA_LOBBY&&
       typeof global.__MEGA_LOBBY.drainIntents==="function"){
      const queued=global.__MEGA_LOBBY.drainIntents(ownerId);
      if(queued&&queued.length){
        visual=Object.assign({},visual||{});
        const existing=Array.isArray(visual.megaIntents)?visual.megaIntents.slice():[];
        if(visual.megaIntent)existing.push(visual.megaIntent);
        visual.megaIntents=existing.concat(queued);
        delete visual.megaIntent;
      }
    }
    return advanceAuthorityState(state,elapsed,checkpointAt,visual);
  };
  const result=await db.instanceAuthorityTick(ownerId,expected,Date.now(),3600000,advanceWithVisuals,lease,
    resolved.worldBoss&&Number(ownerId)!==Number(acc.id)?{leaseAccountId:acc.id}:undefined);
  if(!result.ok){
    // Tick é idempotente: ausência/terminal entre GET e POST não é falha de
    // transporte e não deve poluir o console com HTTP 410.
    if(result.error==="INSTANCE_NOT_ACTIVE")return {code:200,body:{ok:true,instance:null,
      terminalReason:"inactive",characters:[],elapsed:0}};
    // SSE, checkpoint e troca de personagem podem atualizar a versão entre
    // o último snapshot do browser e este tick. Isso é uma ressincronização
    // normal, não um erro: devolva o estado vencedor sem avançar o relógio.
    // Assim o cliente aplica a versão atual imediatamente e o DevTools não
    // fica emitindo 409 enquanto o jogo aparenta estar congelado.
    if(result.error==="INSTANCE_VERSION_CONFLICT"&&result.instance){
      const current=instanceSummary(result.instance,true);
      if(resolved.party&&resolved.character&&current.state&&current.state.members&&
         current.state.members.some((member)=>String(member.id)===String(resolved.character.id)))
        current.state.activeCharacterId=String(resolved.character.id);
      return {code:200,body:{ok:true,resynced:true,elapsed:0,terminalReason:null,
        instance:current,characters:[]}};
    }
    return {code:result.error==="LEASE_REQUIRED"?423:409,
      body:{ok:false,error:result.error,msg:"Tick autoritativo recusado",instance:instanceSummary(result.instance,true)}};
  }
  if(typeof db.snapshotAdd==="function"&&(result.terminalReason||Number(result.instance.version)%120===0))
    await db.snapshotAdd(acc.id,"instance",result.instance.instance_id,result.instance.version,
      result.terminalReason||"tick",result.instance,!!result.terminalReason);
  await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
    status:result.instance.status,terminalReason:result.terminalReason||null,source:"tick",holderId:String(body.holder_id||""),
    characterVersions:(result.characters||[]).map((c)=>({id:Number(c.id),saveVersion:Number(c.save_version)}))});
  const responseInstance=instanceSummary(result.instance,true);
  if((resolved.party||resolved.worldBoss)&&resolved.character&&responseInstance.state&&responseInstance.state.members&&
    responseInstance.state.members.some((member)=>String(member.id)===String(resolved.character.id)))
    responseInstance.state.activeCharacterId=String(resolved.character.id);
  return {code:200,body:{ok:true,elapsed:result.elapsed||0,terminalReason:result.terminalReason||null,
    instance:responseInstance,account:accountPublicView(await ensureAccountWallet(db,acc)),
    characters:(result.characters||[])
      .filter((character)=>Number(character.account_id)===Number(acc.id)).map(accountCharacterSummary)}};
}

async function selectInstanceAmmo(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),expected=Number(body.expected_version),instanceId=String(body.instance_id||""),slug=String(body.ammo||"");
  if(!Number.isSafeInteger(charId)||charId<=0||!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
    return {code:400,body:{ok:false,error:"INVALID_AMMO_SELECTION",msg:"Seleção de munição inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;if(!row||row.status!=="active"||String(row.instance_id)!==instanceId)
    return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};let rejection=null;
  const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
    let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
    const item=descriptor.authority&&descriptor.authority.players&&
      descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
    if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
    const p=item.p,ammo=ITEMS[slug],shield=p.equip&&p.equip.shield,quiver=shield&&ITEMS[shield.item];
    if(p.voc!=="paladin"){rejection="Somente paladins podem selecionar munição";return null;}
    if(!ammo||(ammo.s!=="ammo"&&ammo.slot!=="ammo"&&ammo.type!=="ammo")){rejection="Munição desconhecida";return null;}
    if((Number(ammo.lvl!==undefined?ammo.lvl:ammo.level)||0)>(Number(p.level)||1)){rejection="Nível insuficiente para esta munição";return null;}
    if(!quiver||(quiver.t!=="quiver"&&quiver.type!=="quiver")){rejection="Equipe um quiver antes de selecionar munição";return null;}
    p.equip=p.equip||{};p.equip.ammo={item:slug,count:null};p.config=p.config||{};p.config.ammoAuto=!!body.ammo_auto;
    // Última munição POR TIPO (bow→arrow, crossbow→bolt): só o tipo usado é
    // atualizado — trocar de bolt não pode apagar a última arrow preferida.
    const bolt=/bolt/.test(slug);
    if(bolt)p.config.refillBolt=slug;else p.config.refillArrow=slug;
    descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
  },lease);
  if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
    body:{ok:false,error:result.error,msg:rejection||"Não foi possível trocar a munição",instance:instanceSummary(result.instance,true)}};
  await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
    status:result.instance.status,source:"ammo",holderId:String(body.holder_id||"")});
  return {code:200,body:{ok:true,ammo:slug,instance:instanceSummary(result.instance,true)}};
}

async function clearInstanceLootPouch(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
  const slug=body.slug!=null&&body.slug!==""?String(body.slug):"";
  if(!Number.isSafeInteger(charId)||charId<=0||!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
    return {code:400,body:{ok:false,error:"INVALID_POUCH_CLEAR",msg:"Limpeza da Loot Pouch inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;if(!row||row.status!=="active"||String(row.instance_id)!==instanceId)
    return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};let rejection=null;let destroyed=0;let synced=null;
  const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
    let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
    const item=descriptor.authority&&descriptor.authority.players&&
      descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
    if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
    const preSnapshot={pouch:Object.assign({},item.p.lootPouch||{}),bag:Object.assign({},item.p.bag||{})};
    if(slug){
      destroyed=destroyAuthPouchItem(item.p,slug);
      if(!destroyed){rejection="Item não encontrado na Loot Pouch";return null;}
    }else{
      item.p.lootPouch={};
      destroyed=-1;
    }
    synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
    descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
  },lease);
  if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
    body:{ok:false,error:result.error,msg:rejection||"Não foi possível limpar a Loot Pouch",instance:instanceSummary(result.instance,true)}};
  let sharedSync=null;
  if(synced){
    await persistSharedPouchSync(db,acc,synced);
    try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
  }
  await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
    status:result.instance.status,source:slug?"pouch-destroy":"pouch-clear",holderId:String(body.holder_id||"")});
  return {code:200,body:{ok:true,destroyed:destroyed,slug:slug||null,instance:instanceSummary(result.instance,true),
    ...(sharedSync?{sharedInventory:sharedSync}:{})}};
}

/** Destroy um item da pouch (ou limpa via slug ausente só em clear). Em combate = instância;
 * na cidade grava o personagem (lootPouch é protected no PUT comum). */

/** Abre a Bag You Desire com persistência autoritativa (instância ou cidade). */
async function openBagYouDesire(db, body) {
  const acc = await db.findAccountByToken(body.token); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const denied = await requireLease(db, acc, body); if (denied) return denied;
  const charId = Number(body.char_id);
  if (!Number.isSafeInteger(charId) || charId <= 0)
    return { code: 400, body: { ok: false, error: "INVALID_BAG_OPEN", msg: "Abertura da Bag You Desire inválida" } };
  const character = await db.findCharacter(charId);
  if (!character || Number(character.account_id) !== Number(acc.id))
    return { code: 403, body: { ok: false, error: "INSTANCE_CHARACTER_NOT_OWNED", msg: "Personagem não pertence à conta" } };
  const lease = { holderId: String(body.holder_id), secretHash: leaseHash(body.lease_token), now: Date.now() };
  const resolved = await resolveInstanceRow(db, acc, charId); if (resolved.error) return resolved.error;
  const row = resolved.row;
  if (row && row.status === "active") {
    const expected = Number(body.expected_version), instanceId = String(body.instance_id || "");
    if (!Number.isSafeInteger(expected) || expected < 1 || !/^[a-f0-9]{64}$/.test(instanceId))
      return { code: 400, body: { ok: false, error: "INVALID_BAG_OPEN", msg: "Instância inválida para abrir a bag" } };
    if (String(row.instance_id) !== instanceId)
      return { code: 409, body: { ok: false, error: "INSTANCE_NOT_ACTIVE", msg: "Instância ativa não encontrada" } };
    let rejection = null, item = null;
    const result = await db.instancePatchState(row.account_id, acc.id, instanceId, expected, (serialized) => {
      let descriptor = null; try { descriptor = typeof serialized === "string" ? JSON.parse(serialized) : cloneJson(serialized); } catch (e) { return null; }
      const entry = descriptor.authority && descriptor.authority.players &&
        descriptor.authority.players.find((en) => String(en.id) === String(charId));
      if (!entry || !entry.p) { rejection = "Personagem não participa desta instância"; return null; }
      const r = openAuthBagYouDesire(entry.p);
      if (!r.ok) { rejection = r.msg; return null; }
      item = r.item;
      descriptor = materializeAuthority(descriptor); return JSON.stringify(descriptor);
    }, lease);
    if (!result.ok) return { code: result.error === "LEASE_REQUIRED" ? 423 : result.error === "INSTANCE_PATCH_REJECTED" ? 400 : 409,
      body: { ok: false, error: result.error, msg: rejection || "Não foi possível abrir a Bag You Desire",
        instance: instanceSummary(result.instance, true) } };
    await publishInstanceForRow(db, result.instance, { id: result.instance.instance_id, version: Number(result.instance.version),
      status: result.instance.status, source: "bag-you-desire", holderId: String(body.holder_id || "") });
    return { code: 200, body: { ok: true, item: item, instance: instanceSummary(result.instance, true) } };
  }
  let p = character.data; if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { p = {}; } }
  p = p && typeof p === "object" && !Array.isArray(p) ? cloneJson(p) : {};
  const r = openAuthBagYouDesire(p);
  if (!r.ok) return { code: 400, body: { ok: false, error: "BAG_OPEN_FAILED", msg: r.msg } };
  const persisted = await persistClaimedPlayer(db, acc, character, p, lease);
  if (persisted.code !== 200) return persisted;
  return { code: 200, body: Object.assign({}, persisted.body, { ok: true, item: r.item,
    lootPouch: p.lootPouch || {}, depot: p.depot || [] }) };
}

async function destroyLootPouchItem(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||"");
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_POUCH_DESTROY",msg:"Destruição da Loot Pouch inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_POUCH_DESTROY",msg:"Instância inválida para destruir item"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null,destroyed=0,synced=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      const preSnapshot={pouch:Object.assign({},item.p.lootPouch||{}),bag:Object.assign({},item.p.bag||{})};
      destroyed=destroyAuthPouchItem(item.p,slug);
      if(!destroyed){rejection="Item não encontrado na Loot Pouch";return null;}
      synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível destruir o item",
        instance:instanceSummary(result.instance,true)}};
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"pouch-destroy",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,destroyed,slug,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
  }
  let p=await loadCityPlayer(db,acc,character);
  const destroyed=destroyAuthPouchItem(p,slug);
  if(!destroyed)
    return {code:400,body:{ok:false,error:"POUCH_ITEM_MISSING",msg:"Item não encontrado na Loot Pouch"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,destroyed,slug,
    lootPouch:p.lootPouch||{},supplyStash:p.supplyStash||{}})};
}

/** Persiste Auto Supply Stash (preferência por item) na instância ou no personagem. */
async function setAutoSupplyStashPreference(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||""),on=!!body.on;
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_STASH_AUTO",msg:"Preferência Auto Supply Stash inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_STASH_AUTO",msg:"Instância inválida para Auto Supply Stash"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      if(!setAuthAutoSupplyStash(item.p,slug,on)){rejection="Item não pode usar Auto Supply Stash";return null;}
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível salvar Auto Supply Stash",
        instance:instanceSummary(result.instance,true)}};
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"stash-auto",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,slug,on,instance:instanceSummary(result.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  if(!setAuthAutoSupplyStash(p,slug,on))
    return {code:400,body:{ok:false,error:"STASH_AUTO_FAILED",msg:"Item não pode usar Auto Supply Stash"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,slug,on,
    autoSupplyStash:(p.config&&p.config.autoSupplyStash)||{}})};
}

/** Persiste lootConfig (NÃO COLETAR / NÃO VENDER) na instância ou no personagem. */
async function setLootConfigPreference(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id);
  const lootConfig=body.lootConfig&&typeof body.lootConfig==="object"&&!Array.isArray(body.lootConfig)
    ?body.lootConfig:{noCollect:[],noSell:[]};
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"INVALID_LOOT_CONFIG",msg:"Preferência de loot inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_LOOT_CONFIG",msg:"Instância inválida para loot config"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      if(!setAuthLootConfig(item.p,lootConfig)){rejection="Não foi possível salvar loot config";return null;}
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível salvar loot config",
        instance:instanceSummary(result.instance,true)}};
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"loot-config",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,lootConfig,instance:instanceSummary(result.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  if(!setAuthLootConfig(p,lootConfig))
    return {code:400,body:{ok:false,error:"LOOT_CONFIG_FAILED",msg:"Não foi possível salvar loot config"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,lootConfig:p.lootConfig||{noCollect:[],noSell:[]}})};
}

/* Depois de uma mutação de Loot Pouch/backpack feita por um membro DENTRO da
 * instância (vender, limpar, destruir, mover p/ mochila), sincroniza o
 * inventário compartilhado da conta do executor:
 * - aplica o delta da mutação na cópia do LÍDER quando ele for da mesma conta
 *   (todos os drops da instância caem na pouch do líder — sem isso a extração
 *   terminal pegava a cópia do líder ainda cheia e "ressuscitava" os itens
 *   vendidos);
 * - espelha pouch/bag/instâncias (não equipadas) finais em TODAS as cópias
 *   dos membros da mesma conta — a pouch é DA CONTA, então trocar de
 *   personagem no meio da instância não pode mostrar os itens vendidos;
 * - devolve {pouch,bag,instances} finais para gravar no shared da conta.
 * preSnapshot: {pouch:{slug:qtd}, bag:{slug:qtd}} da cópia do executor ANTES
 * da mutação. Roda dentro do patch da instância (síncrono). */
function syncInstancePouchCopies(players,charId,preSnapshot){
  const seller=Array.isArray(players)?players.find((e)=>e&&String(e.id)===String(charId)):null;
  if(!seller||!seller.p)return null;
  const sellerAcc=Number(seller.accountId||(seller.p&&seller.p.accountId)||0);
  if(!sellerAcc)return null;
  const deltaOf=(pre,post)=>{
    const out={};
    for(const slug of Object.keys(pre||{})){
      const d=(Number(post&&post[slug])||0)-(Number(pre[slug])||0);
      if(d)out[slug]=d;
    }
    return out;
  };
  const applyDelta=(container,deltas)=>{
    container=container||{};
    for(const slug of Object.keys(deltas)){
      const n=Math.max(0,(Number(container[slug])||0)+deltas[slug]);
      if(n>0)container[slug]=n;else delete container[slug];
    }
    return container;
  };
  const pouchDelta=deltaOf(preSnapshot.pouch,seller.p.lootPouch);
  const bagDelta=deltaOf(preSnapshot.bag,seller.p.bag);
  const leader=Array.isArray(players)?players[0]:null;
  let live=seller;
  if(leader&&leader.p&&leader!==seller&&
     Number(leader.accountId||(leader.p&&leader.p.accountId)||0)===sellerAcc){
    live=leader;
    leader.p.lootPouch=applyDelta(leader.p.lootPouch||{},pouchDelta);
    leader.p.bag=applyDelta(leader.p.bag||{},bagDelta);
  }
  const finalPouch=Object.assign({},live.p.lootPouch||{});
  const finalBag=Object.assign({},live.p.bag||{});
  // Instâncias compartilhadas (bag/depot): a fonte da mutação é a cópia do
  // executor (pode ter ganho instâncias novas ao mover para a mochila).
  const finalInsts=(Array.isArray(seller.p.itemInstances)?seller.p.itemInstances:[])
    .filter((i)=>i&&i.loc&&String(i.loc).indexOf("equip:")!==0)
    .map((i)=>Object.assign({},i));
  for(const entry of players){
    if(!entry||!entry.p)continue;
    if(Number(entry.accountId||(entry.p&&entry.p.accountId)||0)!==sellerAcc)continue;
    entry.p.lootPouch=Object.assign({},finalPouch);
    entry.p.bag=Object.assign({},finalBag);
    const ownEquip=(Array.isArray(entry.p.itemInstances)?entry.p.itemInstances:[])
      .filter((i)=>i&&i.loc&&String(i.loc).indexOf("equip:")===0);
    entry.p.itemInstances=finalInsts.map((i)=>Object.assign({},i)).concat(ownEquip);
  }
  return {pouch:finalPouch,bag:finalBag,instances:finalInsts};
}

/* Grava o resultado sincronizado de uma mutação de pouch no shared da conta
 * (accounts.shared_inventory) — roda DEPOIS do patch da instância. Publica um
 * evento "character" para o SSE avisar as OUTRAS abas/dispositivos da conta
 * (o cliente re-busca /api/me, que agora traz o sharedInventory, e aplica em
 * tempo real). */
async function persistSharedPouchSync(db,acc,synced){
  if(!synced||!SharedInv||typeof db.accountSharedInventory!=="function")return;
  try{
    const shared=await db.accountSharedInventory(acc.id);
    shared.lootPouch=Object.assign({},synced.pouch||{});
    if(synced.bag)shared.bag=Object.assign({},synced.bag||{});
    if(Array.isArray(synced.instances))
      shared.itemInstances=synced.instances.map((i)=>Object.assign({},i));
    await db.setAccountSharedInventory(acc.id,shared);
    try{publishSync(acc.id,"character",{id:null,saveVersion:0,source:"pouch-shared"});}catch(e){}
  }catch(e){console.warn("[pouch] falha ao sincronizar shared:",e&&e.message);}
}

async function sellInstanceLootPouch(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id);
  const slug=body.slug!=null&&body.slug!==""?String(body.slug):"";
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"INVALID_POUCH_SELL",msg:"Venda da Loot Pouch inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_POUCH_SELL",msg:"Instância inválida para vender a Loot Pouch"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null,soldGold=0,synced=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      const preSnapshot={
        pouch:Object.assign({},item.p.lootPouch||{}),
        bag:Object.assign({},item.p.bag||{}),
      };
      soldGold=slug?sellAuthPouchItem(item.p,slug):sellAuthAllPouch(item.p);
      // A pouch é DA CONTA: espelha o resultado em todas as cópias da mesma
      // conta + aplica o delta na cópia do líder (fonte viva do loot).
      synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível vender a Loot Pouch",instance:instanceSummary(result.instance,true)}};
    // Grava a pouch vazia no shared da conta IMEDIATAMENTE (troca de
    // personagem/reload não pode "ressuscitar" os itens vendidos).
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{
        sharedSync=await db.accountSharedInventory(acc.id);
      }catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"pouch-sell",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,gold:soldGold,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
  }
  // Cidade: a pouch é server-owned (protected no PUT comum) — vende no
  // player hidratado e persiste via persistClaimedPlayer (extração
  // autoritativa atualiza o shared + mirror no save do personagem).
  let p=await loadCityPlayer(db,acc,character);
  const gold=slug?sellAuthPouchItem(p,slug):sellAuthAllPouch(p);
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,gold,
    lootPouch:p.lootPouch||{},bag:p.bag||{},itemInstances:p.itemInstances||[]})};
}

/**
 * Vende itens da mochila (autoritativo). Em combate usa a instância;
 * na cidade grava o personagem (gold é protected no PUT comum — venda só
 * no cliente some e o tick/save restaura bag/gold).
 * body.slug opcional (null = vender tudo); body.inst_id opcional.
 */
async function sellBagItems(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id);
  const slug=body.slug!=null&&body.slug!==""?String(body.slug):"";
  const instId=body.inst_id!=null&&body.inst_id!==""?String(body.inst_id):"";
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"INVALID_BAG_SELL",msg:"Venda da mochila inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_BAG_SELL",msg:"Instância inválida para venda da mochila"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null,soldGold=0;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      soldGold=slug?sellAuthBagItem(item.p,slug,instId||null):sellAuthAllBag(item.p);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível vender a mochila",
        instance:instanceSummary(result.instance,true)}};
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"bag-sell",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,gold:soldGold,instance:instanceSummary(result.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  const soldGold=slug?sellAuthBagItem(p,slug,instId||null):sellAuthAllBag(p);
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,gold:soldGold,
    bag:p.bag||{},itemInstances:p.itemInstances||[],goldBalance:p.gold})};
}

/** Move bag/pouch → Supply Stash (autoritativo). Em combate usa a instância;
 * fora dela grava o personagem (lootPouch/supplyStash são protected no PUT comum). */
async function moveToSupplyStash(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||""),source=String(body.source||"pouch");
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_STASH_MOVE",msg:"Movimento para Supply Stash inválido"}};
  if(source!=="pouch"&&source!=="bag")
    return {code:400,body:{ok:false,error:"INVALID_STASH_SOURCE",msg:"Origem inválida (use pouch ou bag)"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_STASH_MOVE",msg:"Instância inválida para o movimento"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      if(!moveItemToSupplyStash(item.p,{source,slug})){rejection="Não foi possível mover o item (stash cheia ou item ausente)";return null;}
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível mover para a Supply Stash",
        instance:instanceSummary(result.instance,true)}};
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"stash-move",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  if(!moveItemToSupplyStash(p,{source,slug}))
    return {code:400,body:{ok:false,error:"STASH_MOVE_FAILED",msg:"Não foi possível mover o item (stash cheia ou item ausente)"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    supplyStash:p.supplyStash||{},lootPouch:p.lootPouch||{},bag:p.bag||{},
    itemInstances:p.itemInstances||[]})};
}

/**
 * Retira da Supply Stash (bag / pouch / destroy). supplyStash é protected no PUT —
 * sem API o cliente decrementa e o tick/save restaura o contador.
 */
async function withdrawFromSupplyStash(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||""),dest=String(body.dest||"bag");
  const qty=body.qty!=null?Number(body.qty):null;
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_STASH_WITHDRAW",msg:"Retirada da Supply Stash inválida"}};
  if(dest!=="bag"&&dest!=="pouch"&&dest!=="destroy")
    return {code:400,body:{ok:false,error:"INVALID_STASH_DEST",msg:"Destino inválido (use bag, pouch ou destroy)"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  const payload={slug,dest,qty:qty!=null&&Number.isFinite(qty)?qty:null};
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_STASH_WITHDRAW",msg:"Instância inválida para a retirada"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      if(!moveItemFromSupplyStash(item.p,payload)){rejection="Não foi possível retirar o item (ausente ou mochila cheia)";return null;}
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível retirar da Supply Stash",
        instance:instanceSummary(result.instance,true)}};
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"stash-withdraw",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  if(!moveItemFromSupplyStash(p,payload))
    return {code:400,body:{ok:false,error:"STASH_WITHDRAW_FAILED",msg:"Não foi possível retirar o item (ausente ou mochila cheia)"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    supplyStash:p.supplyStash||{},lootPouch:p.lootPouch||{},bag:p.bag||{},
    itemInstances:p.itemInstances||[]})};
}

/** Equipa 1 item da Supply Stash (autoritativo). supplyStash/equip protegidos no PUT. */
async function equipSupplyStashItem(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||""),slot=body.slot!=null?String(body.slot):"";
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_STASH_EQUIP",msg:"Equipar da Supply Stash inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_STASH_EQUIP",msg:"Instância inválida para equipar"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      if(!equipFromSupplyStash(item.p,slug,slot||undefined)){rejection="Não foi possível equipar (stash vazia, vocação ou nível)";return null;}
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível equipar da Supply Stash",
        instance:instanceSummary(result.instance,true)}};
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"stash-equip",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  if(!equipFromSupplyStash(p,slug,slot||undefined))
    return {code:400,body:{ok:false,error:"STASH_EQUIP_FAILED",msg:"Não foi possível equipar (stash vazia, vocação ou nível)"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    supplyStash:p.supplyStash||{},equip:p.equip||{},bag:p.bag||{},
    itemInstances:p.itemInstances||[]})};
}

/** Equipa/desequipa um item da bag ou Loot Pouch (autoritativo). Sem isso a
 * troca de equipamento durante o combate online era sobrescrita pelo tick
 * seguinte (snapshot do servidor) e a arma "voltava" sozinha. */
async function equipInstanceItem(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id);
  const unequip=!!body.unequip;
  const slug=unequip?String(body.slot||""):String(body.slug||"");
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_EQUIP",msg:"Equipamento inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_EQUIP",msg:"Instância inválida para equipar"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      let r;
      if(unequip)r=unequipFromContainerAuth(item.p,String(body.slot||""),String(body.dest||"bag"));
      else r=equipFromContainerAuth(item.p,String(body.slug||""),String(body.source||"bag"),
        {instId:body.inst_id?String(body.inst_id):null});
      if(!r||!r.ok){rejection=(r&&r.msg)||"Não foi possível equipar";return null;}
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível equipar",
        instance:instanceSummary(result.instance,true)}};
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"equip",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,equipped:unequip?null:String(body.slug||""),
      slot:unequip?String(body.slot||""):null,instance:instanceSummary(result.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  let r;
  if(unequip)r=unequipFromContainerAuth(p,String(body.slot||""),String(body.dest||"bag"));
  else r=equipFromContainerAuth(p,String(body.slug||""),String(body.source||"bag"),
    {instId:body.inst_id?String(body.inst_id):null});
  if(!r||!r.ok)
    return {code:400,body:{ok:false,error:"EQUIP_FAILED",msg:(r&&r.msg)||"Não foi possível equipar"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    equip:p.equip||{},bag:p.bag||{},lootPouch:p.lootPouch||{},itemInstances:p.itemInstances||[]})};
}

/* Remove 1 unidade do item compartilhado das cópias dos membros da
 * instância (bag/pouch). Os membros carregam cópias do shared desde o
 * início da instância; sem remover, a extração terminal "ressuscitaria" o
 * item no inventário da conta depois do equip em outro personagem. */
function removeSharedItemFromMember(p,slug,instId,source){
  if(!p||!slug)return;
  const tryRemove=(key)=>{
    const n=Number(p[key]&&p[key][slug])||0;
    if(n>0){p[key][slug]=n-1;if(p[key][slug]<=0)delete p[key][slug];return true;}
    return false;
  };
  const orders=source==="pouch"?["lootPouch","bag"]:["bag","lootPouch"];
  for(const key of orders)if(tryRemove(key))break;
  if(instId&&Array.isArray(p.itemInstances)){
    const idx=p.itemInstances.findIndex((i)=>i&&String(i.id)===String(instId)&&String(i.loc)==="bag");
    if(idx>=0)p.itemInstances.splice(idx,1);
  }
}

/* Equipa 1 item da conta (backpack/Loot Pouch compartilhados) em OUTRO
 * personagem da conta (autoritativo). Sem esta rota o "Equipar em <char>"
 * online só mexia no estado local: o toast dizia "equipado" mas o item não
 * ia para o inventário do alvo (e sumia do shared no próximo save). */
async function equipOtherCharacterItem(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const sourceId=Number(body.char_id),targetId=Number(body.target_id);
  const slug=String(body.slug||"");
  const source=String(body.source||"bag")==="pouch"?"pouch":"bag";
  const instId=body.inst_id?String(body.inst_id):null;
  if(!Number.isSafeInteger(sourceId)||sourceId<=0||!Number.isSafeInteger(targetId)||targetId<=0||
     targetId===sourceId||!slug)
    return {code:400,body:{ok:false,error:"INVALID_EQUIP_OTHER",msg:"Equipar em outro personagem inválido"}};
  const sourceChar=await db.findCharacter(sourceId);
  if(!sourceChar||Number(sourceChar.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const targetChar=await db.findCharacter(targetId);
  if(!targetChar||Number(targetChar.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"TARGET_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,sourceId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const state=typeof row.state==="string"?(()=>{try{return JSON.parse(row.state);}catch(e){return null;}})():row.state;
    const players=(state&&state.authority&&state.authority.players)||[];
    const targetInInstance=players.some((item)=>String(item&&item.id)===String(targetId));
    if(!targetInInstance)
      return {code:409,body:{ok:false,error:"TARGET_IN_ACTIVE_INSTANCE",
        msg:"O personagem alvo está em uma caçada ativa — finalize a caçada (ou equipe por ele diretamente) antes de equipar itens nele."}};
    // Alvo participa da instância: equipa na própria autoridade (a cópia do
    // shared fica no state; a extração terminal reconcilia o shared).
    let rejection=null;
    let last=null;
    for(let attempt=0;attempt<4;attempt++){
      const current=attempt===0?row:await db.instanceGet(Number(row.account_id));
      if(!current||current.status!=="active")
        return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
      const result=await db.instancePatchState(Number(current.account_id),acc.id,String(current.instance_id),
        Number(current.version),(serialized)=>{
          let descriptor=null;
          try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
          const entries=(descriptor.authority&&descriptor.authority.players)||[];
          const targetEntry=entries.find((item)=>String(item&&item.id)===String(targetId));
          if(!targetEntry||!targetEntry.p){rejection="O personagem alvo não participa desta instância";return null;}
          const _r=equipFromContainerAuth(targetEntry.p,slug,source,{instId});
          if(!_r||!_r.ok){
            rejection=(last&&last.msg)||"Não foi possível equipar (item não está na mochila/pouch, vocação ou nível)";
            return null;
          }
          // Remove o item das cópias dos demais membros para a extração
          // terminal não devolver o item ao shared (duplicação).
          for(const entry of entries){
            if(entry===targetEntry||!entry||!entry.p)continue;
            removeSharedItemFromMember(entry.p,slug,instId,source);
          }
          descriptor=materializeAuthority(descriptor);
          return JSON.stringify(descriptor);
        },lease);
      if(result.ok){
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,
          version:Number(result.instance.version),status:result.instance.status,source:"equip-other",
          holderId:String(body.holder_id||"")});
        return {code:200,body:{ok:true,equipped:slug,slot:null,instance:instanceSummary(result.instance,true)}};
      }
      if(result.error==="LEASE_REQUIRED")
        return {code:423,body:{ok:false,error:"LEASE_REQUIRED",msg:"O controle desta conta foi transferido antes do equip terminar."}};
      if(result.error!=="INSTANCE_VERSION_CONFLICT")
        return {code:400,body:{ok:false,error:result.error,msg:rejection||"Não foi possível equipar",
          instance:instanceSummary(result.instance,true)}};
      last=result;
    }
    return {code:409,body:{ok:false,error:"INSTANCE_VERSION_CONFLICT",msg:"A instância foi alterada por outra sessão.",
      instance:last&&instanceSummary(last.instance,true)}};
  }
  // Caminho de cidade: hidrata o alvo com o shared, equipa e persiste
  // (o shared é extraído de volta + mirror no save do alvo).
  let p=await loadCityPlayer(db,acc,targetChar);
  const r=equipFromContainerAuth(p,slug,source,{instId});
  if(!r||!r.ok)
    return {code:400,body:{ok:false,error:"EQUIP_FAILED",msg:(r&&r.msg)||"Não foi possível equipar"}};
  const persisted=await persistClaimedPlayer(db,acc,targetChar,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    equip:p.equip||{},bag:p.bag||{},lootPouch:p.lootPouch||{},itemInstances:p.itemInstances||[]})};
}

/** Move Loot Pouch → backpack (autoritativo). lootPouch é protected no PUT. */
async function movePouchToBag(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||"");
  const qty=body.qty!=null?Number(body.qty):null;
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_POUCH_TO_BAG",msg:"Movimento Loot Pouch → backpack inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_POUCH_TO_BAG",msg:"Instância inválida para o movimento"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null,synced=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      const preSnapshot={
        pouch:Object.assign({},item.p.lootPouch||{}),
        bag:Object.assign({},item.p.bag||{}),
      };
      if(!moveLootPouchToBag(item.p,slug,qty)){
        rejection="Não foi possível mover (mochila cheia, CAP ou item ausente na pouch)";
        return null;
      }
      synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível mover para a backpack",
        instance:instanceSummary(result.instance,true)}};
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"pouch-to-bag",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
  }
  let p=await loadCityPlayer(db,acc,character);
  if(!moveLootPouchToBag(p,slug,qty))
    return {code:400,body:{ok:false,error:"POUCH_TO_BAG_FAILED",msg:"Não foi possível mover (mochila cheia, CAP ou item ausente)"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    lootPouch:p.lootPouch||{},bag:p.bag||{},itemInstances:p.itemInstances||[]})};
}

async function endInstance(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const id=String(body.instance_id||"");
  let expected=Number(body.expected_version);
  if(!/^[a-f0-9]{64}$/.test(id)||!Number.isSafeInteger(expected)||expected<1)
    return {code:400,body:{ok:false,error:"INVALID_INSTANCE_END",msg:"Instância inválida"}};
  const reason=String(body.reason||"finished").replace(/[^a-z0-9_-]/gi,"").slice(0,40)||"finished";
  const resolved=await resolveInstanceRow(db,acc,body.char_id);if(resolved.error)return resolved.error;
  const leaseEarly={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  if(typeof global.__WORLD_BOSS!=="undefined"&&global.__WORLD_BOSS){
    const wbShare=global.__WORLD_BOSS.sharedForAccount(acc.id);
    if(wbShare){
      const own=await db.instanceGet(acc.id);
      if(own&&own.status==="active"&&String(own.instance_id)!==String(wbShare.instanceId))
        await db.instanceEnd(acc.id,own.instance_id,own.version,reason||"world-boss-prep",leaseEarly);
      if(Number(wbShare.ownerAccountId)!==Number(acc.id))
        return {code:200,body:{ok:true,sharedDetached:true,worldBoss:true,instance:null}};
      if(/^world-boss/.test(reason))
        return {code:200,body:{ok:true,sharedDetached:true,worldBoss:true,instance:null}};
    }
  }
  if(resolved.row&&String(resolved.row.instance_id)===id&&resolved.party&&resolved.character&&
     Number(resolved.character.id)!==Number(resolved.party.leader_id))
    return {code:200,body:{ok:true,sharedDetached:true,instance:null}};
  // Convidado Megalomania (ou dono que morreu com outros lutando): não
  // encerra a sala compartilhada — só se desprende.
  if(typeof global.__MEGA_LOBBY!=="undefined"&&global.__MEGA_LOBBY){
    const megaCtrl=global.__MEGA_LOBBY;
    const share=typeof megaCtrl.sharedForAccount==="function"
      ?megaCtrl.sharedForAccount(acc.id):null;
    const lobby=typeof megaCtrl.getLobbyForAccount==="function"
      ?megaCtrl.getLobbyForAccount(acc.id):null;
    const ownedLobby=typeof megaCtrl.getLobbyByInstanceOwner==="function"
      ?megaCtrl.getLobbyByInstanceOwner(acc.id):null;
    if(share||lobby){
      let remaining=0;
      if(typeof megaCtrl.leaveFight==="function"){
        try{
          const lr=await megaCtrl.leaveFight(db,acc);
          remaining=lr&&lr.body?Number(lr.body.remaining)||0:0;
        }catch(e){/* best-effort */}
      }
      if(remaining>0)
        return {code:200,body:{ok:true,sharedDetached:true,megaLeft:true,remaining,instance:null}};
    }else if(ownedLobby&&(ownedLobby.status==="fighting"||ownedLobby.status==="starting")&&
             (ownedLobby.slots||[]).some(Boolean)){
      // Já saiu do lobby via leave-fight; instância ainda tem lutadores.
      return {code:200,body:{ok:true,sharedDetached:true,megaLeft:true,instance:null}};
    }
  }
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const ownerId=resolved.row?Number(resolved.row.account_id):Number(acc.id);
  // Tick final: avança o estado autoritativo até agora e salva os
  // personagens (HP/MP/loot/exp) antes de encerrar a instância. Sem isto,
  // o último segundo de combate é perdido — o tick anterior pode ter
  // capturado o estado antes da última kill/loot.
  let endedCharacters=[];
  if(resolved.row&&resolved.row.status==="active"){
    try{
      // Tick final: além de avançar o estado, um encerramento NORMAL (sem
      // terminalReason da autoridade — ex.: "returned-city") precisa extrair
      // os containers finais (loot da Loot Pouch, bag etc.) para o shared da
      // conta. Sem isso o loot ficava só no save do personagem e o shared
      // antigo o "mascarava" ao trocar de personagem/reload (e a venda da
      // pouch parecia nunca acontecer).
      const finalizeEndState=(serialized,elapsed,checkpointAt)=>{
        const out=advanceAuthorityState(serialized,elapsed,checkpointAt);
        if(out&&!out.terminalReason){
          try{
            let descriptor=typeof out.state==="string"?JSON.parse(out.state):out.state;
            const auth=descriptor&&descriptor.authority;
            if(auth&&!auth.ended){
              auth.ended=true;
              auth.terminalReason="finished";
              descriptor=materializeAuthority(descriptor);
              out.state=JSON.stringify(descriptor);
              out.terminalReason="finished";
            }
          }catch(e){/* sem extração final é aceitável (end continua) */}
        }
        return out;
      };
      const tickResult=await db.instanceAuthorityTick(ownerId,expected,Date.now(),3600000,finalizeEndState,lease);
      if(tickResult.ok&&tickResult.instance){
        // Atualiza expected version para o end usar a versão pós-tick
        const ticked=await db.instanceGet(ownerId);
        if(ticked)expected=Number(ticked.version);
        endedCharacters=Array.isArray(tickResult.characters)?tickResult.characters:[];
        // Tick final no-op (elapsed<50 entre o último tick e o end): o
        // instanceAuthorityTick volta sem characters e a extração terminal
        // (loot da pouch → shared) não roda. Force um segundo avanço com o
        // relógio +100ms — 0 steps de simulação, mas o fluxo de extração
        // executa (terminalReason "finished" via finalizeEndState).
        if(!endedCharacters.length){
          const retry=await db.instanceAuthorityTick(ownerId,expected,Date.now()+100,3600000,finalizeEndState,lease);
          if(retry.ok&&retry.instance){
            const ticked2=await db.instanceGet(ownerId);
            if(ticked2)expected=Number(ticked2.version);
            endedCharacters=Array.isArray(retry.characters)?retry.characters:[];
          }
        }
      }
    }catch(e){/* tick final é best-effort; o end ainda roda */}
  }
  const result=await db.instanceEnd(ownerId,id,expected,reason,lease);
  if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:409,body:{ok:false,error:result.error,
    msg:result.error==="LEASE_REQUIRED"?"Controle transferido durante o encerramento":"A instância foi alterada",
    instance:instanceSummary(result.instance,true)}};
  if(typeof db.snapshotAdd==="function"&&result.instance)await db.snapshotAdd(acc.id,"instance",
    result.instance.instance_id,result.instance.version,"ended-"+reason,result.instance,true);
  if(result.instance)await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id||id,
    version:Number(result.instance.version)||expected,status:"ended",terminalReason:reason,source:"end",
    holderId:String(body.holder_id||""),
    characterVersions:endedCharacters.map((c)=>({id:Number(c.id),saveVersion:Number(c.save_version)}))});
  // Devolve save_versions pós-tick para o cliente não disparar PUT 409 no
  // checkpoint do templo com expected_version obsoleto.
  return {code:200,body:{ok:true,instance:instanceSummary(result.instance,false),
    characters:endedCharacters.filter((character)=>Number(character.account_id)===Number(acc.id))
      .map(accountCharacterSummary)}};
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
  const privileged=accountCanSelfAdmin(acc);
  if(!privileged&&!identityMismatch)return {code:403,body:{ok:false,error:"REPAIR_NOT_ALLOWED",
    msg:"Reparo permitido apenas para identidade corrompida ou administrador."}};
  const allowed=["knight","paladin","druid","sorcerer","monk"];
  const voc=allowed.includes(String(body.voc))?String(body.voc):null;
  if(!voc)return {code:400,body:{ok:false,msg:"Vocação inválida"}};
  let payload=body.data;
  if(typeof payload==="string"){try{payload=JSON.parse(payload);}catch(e){payload={};}}
  payload=payload&&typeof payload==="object"?payload:{};
  payload.id=String(c.id);payload.name=c.name;payload.voc=voc;
  // Admin repair/vocação também deve aceitar level/exp do payload; caso
  // contrário um grant de nível + troca de vocação perdia o level.
  const level=privileged
    ?Math.max(1,Math.min(2000,Math.floor(Number(payload.level)||Number(c.level)||1)))
    :Math.max(1,Number(c.level)||1);
  payload.level=level;
  if(privileged&&typeof db.setAccountGold==="function"&&payload.gold!==undefined){
    const gold=Math.max(0,Math.floor(Number(payload.gold)||0));
    await db.setAccountGold(acc.id,gold);payload.gold=gold;
  }
  await db.updateCharacter(id,voc,level,JSON.stringify(payload),{
    hp:Math.max(0,Math.floor(Number(payload.hp)||0)),mp:Math.max(0,Math.floor(Number(payload.mp)||0)),
    max_hp:Math.max(0,Math.floor(Number(body.maxHp)||0)),max_mp:Math.max(0,Math.floor(Number(body.maxMp)||0)),
  });
  const updated=await db.findCharacter(id);
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,"repair",updated,true);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),action:"repair"});
  await publishPartyForCharacters(db,[updated.id],"character-repair");
  return {code:200,body:{ok:true,character:accountCharacterSummary(updated)}};
}

async function coins(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if(!accountCanSelfAdmin(acc))return {code:403,body:{ok:false,error:"ADMIN_ONLY",
    msg:"Alteração direta de Tibia Coins é exclusiva do administrador (ou TEST_SERVER)."}};
  const amount = Math.max(-999999, Math.min(999999, Math.floor(Number(body.amount) || 0)));
  const novo = (acc.coins || 0) + amount;
  await db.updateCoins(acc.id, novo);
  if (typeof store.recordGrant === "function")
    await store.recordGrant(db, acc, amount, novo);
  return { code: 200, body: { ok: true, coins: novo } };
}

async function setVip(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if (!accountCanSelfAdmin(acc)) return { code: 403, body: { ok: false, error: "ADMIN_ONLY",
    msg: "Alteração direta de VIP é exclusiva do administrador (ou TEST_SERVER)." } };
  const clear = !!body.clear || body.days === 0 || body.days === "0";
  const days = Math.max(0, Math.min(3650, Math.floor(Number(body.days) || 0)));
  const now = Date.now();
  let until = 0;
  if (!clear && days > 0) {
    const cur = Math.max(0, Math.floor(Number(acc.vip_until) || 0));
    until = Math.max(cur, now) + days * 24 * 3600 * 1000;
  }
  if (typeof db.setAccountVipUntil === "function") await db.setAccountVipUntil(acc.id, until);
  else if (typeof db.run === "function")
    await db.run("UPDATE accounts SET vip_until = ? WHERE id = ?", [until, Number(acc.id)]);
  return { code: 200, body: { ok: true, vipUntil: until, vip: until > now } };
}

/* ------------------------- verificação de e-mail -------------------------
 * O jogador cadastra o e-mail, recebe um código de 6 dígitos (10 min) e o
 * confirma para autenticar a conta. `EMAIL_VERIFY_REQUIRED=1` passa a exigir
 * e-mail confirmado antes de criar personagem. Em TEST_SERVER o código é
 * devolvido como `devCode` (o mailer não envia de verdade). */
async function requestEmailCode(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if (acc.email_verified) return { code: 200, body: { ok: true, alreadyVerified: true, emailVerified: true } };
  const email = String(body.email || acc.email || "").trim().slice(0, 120);
  if (!EMAIL_RE.test(email)) return { code: 400, body: { ok: false, msg: "Informe um e-mail válido." } };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + EMAIL_CODE_TTL_MS;
  if (typeof db.setAccountEmail === "function") await db.setAccountEmail(acc.id, email);
  if (typeof db.setAccountEmailCode === "function") await db.setAccountEmailCode(acc.id, code, expiresAt);
  const sent = await mailer.sendVerificationCode(email, code, acc.login);
  return { code: 200, body: {
    ok: true,
    emailSent: !!sent.ok,
    mock: !!sent.mock,
    msg: sent.ok ? "Código enviado para " + email + "." : "Falha ao enviar o e-mail. Configure o SMTP no servidor.",
    ...(TEST_SERVER ? { devCode: code } : {}),
  } };
}
async function verifyEmailCode(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if (acc.email_verified) return { code: 200, body: { ok: true, alreadyVerified: true, emailVerified: true } };
  const code = String(body.code || "").trim();
  if (!/^\d{6}$/.test(code)) return { code: 400, body: { ok: false, msg: "Código inválido." } };
  const stored = String(acc.email_code || "");
  const expiresAt = Number(acc.email_code_expires) || 0;
  if (!stored || expiresAt < Date.now()) return { code: 400, body: { ok: false, msg: "Código expirado. Solicite um novo." } };
  if (code !== stored) return { code: 400, body: { ok: false, msg: "Código incorreto." } };
  if (typeof db.setAccountEmailVerified === "function") await db.setAccountEmailVerified(acc.id, true);
  if (typeof db.setAccountEmailCode === "function") await db.setAccountEmailCode(acc.id, "", 0);
  return { code: 200, body: { ok: true, emailVerified: true } };
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
  const criterion = String(by || "level").toLowerCase() === "dist" ? "distance"
    : String(by || "level").toLowerCase();
  const rows = await db.rankings(criterion, limit);
  return { code: 200, body: { ok: true, by: criterion, limit: Math.min(100, Math.max(1, Number(limit) || 50)),
    rankings: rows } };
}
async function onlineCountPayload(db) {
  if (typeof db.onlineCount === "function") {
    const count = await db.onlineCount();
    return count && typeof count === "object" ? count : { onlineChars: 0, offlineHunting: 0, total: 0 };
  }
  return { onlineChars: 0, offlineHunting: 0, total: 0, leases: 0, instances: 0 };
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
  const amount=Math.max(0,Math.floor(Number(body.amount)||0)),charId=Number(body.char_id),expected=Number(body.expected_version);
  let active=await db.instanceGet(acc.id);const party=await db.partyFindByCharacter(charId);
  if(party&&typeof db.instanceGetByParty==="function")active=await db.instanceGetByParty(party.id)||active;
  if(active&&active.status==="active")
    return {code:409,body:{ok:false,error:"MARKET_IN_INSTANCE",msg:"Banco do Market só pode ser usado no templo"}};
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

  // Limpeza de BOOT: o processo anterior morreu — os holders de lease e as
  // instâncias ativas não existem mais.
  // 1) Expira leases persistidos: sem isso o acquire da aba retornava 409
  //    (LEASE_HELD) por até LEASE_TTL_MS após o restart (o registro antigo
  //    continuava "ativo" no disco com holder/segredo do processo morto) e a
  //    sessão não reconectava.
  // 2) Encerra instâncias ativas órfãs (padrão; END_INSTANCES_ON_BOOT=0
  //    mantém o comportamento antigo de retomar a caçada após o restart).
  if(typeof db.expireAllLeases==="function"){
    try{
      const expired=await db.expireAllLeases();
      if(expired>0)console.log("[boot] leases expirados do processo anterior:",expired);
    }catch(e){console.warn("[boot] falha ao expirar leases:",e&&e.message);}
  }
  if(process.env.END_INSTANCES_ON_BOOT!=="0"&&typeof db.endAllInstances==="function"){
    try{
      const ended=await db.endAllInstances("server-restart");
      if(ended>0)console.log("[boot] instâncias ativas encerradas (server-restart):",ended);
    }catch(e){console.warn("[boot] falha ao encerrar instâncias do restart:",e&&e.message);}
  }

  SYNC_BUS=new SyncBus({historyLimit:256,ticketTtlMs:10*60*1000});
  CHAT_BUS=new ChatBus({historyLimit:200,ticketTtlMs:10*60*1000,sendLimit:8,sendWindowMs:10000});
  CHAT_BUS.post({
    channel:"geral",type:"system",nickname:"Sistema",voc:"none",vocShort:"SYS",
    level:0,accountId:0,charId:0,text:"Chat global ativo. Digite /pm nick texto para mensagem privada.",
  });
  const instanceWorker=startInstanceWorker(db,{
    intervalMs:INSTANCE_WORKER_INTERVAL_MS,maxStepMs:INSTANCE_WORKER_MAX_STEP_MS,
    startupGraceMs:INSTANCE_WORKER_STARTUP_GRACE_MS,
    minStepMs:Math.min(500,INSTANCE_WORKER_INTERVAL_MS),
    onClaim:async(claim)=>{if(typeof db.snapshotAdd==="function"&&(claim.terminalReason||claim.version%60===0)){
        const row=await db.instanceGet(claim.accountId);if(row)await db.snapshotAdd(claim.accountId,"instance",
          row.instance_id,row.version,claim.terminalReason||"worker",row,!!claim.terminalReason);}
      const current=await db.instanceGet(claim.accountId);
      if(current)await publishInstanceForRow(db,current,{id:current.instance_id,version:claim.version,status:current.status,
        terminalReason:claim.terminalReason||null,source:"worker"});},
  });

  const WORLD_BOSS=createWorldBossController({
    testServer:TEST_SERVER,
    getDb:()=>db,
    publishAll:(type,data)=>{if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll==="function")SYNC_BUS.broadcastAll(type,data);},
    publishAccount:(accountId,type,data)=>publishSync(accountId,type,data),
    createSharedInstance:(event)=>createWorldBossSharedInstance(db,event),
    syncSharedBoss:(event)=>syncWorldBossShared(db,event),
    endSharedInstance:async(host,instanceId,reason)=>{
      if(host&&typeof db.instanceEndForced==="function")
        await db.instanceEndForced(Number(host),reason||"world-boss-end");
    },
  });
  global.__WORLD_BOSS=WORLD_BOSS;
  WORLD_BOSS.start();

  const { createMegalomaniaLobbyController }=require("./megalomania_lobby");
  const MEGA_LOBBY=createMegalomaniaLobbyController({
    getDb:()=>db,
    publishAccount:(accountId,type,data)=>publishSync(accountId,type,data),
    publishInstance:async(accountId,row)=>{
      if(!row)return;
      try{
        await publishInstanceForRow(db,row,{
          id:row.instance_id,version:Number(row.version)||1,status:row.status||"active",
          source:"mega-takeover",holderId:""});
      }catch(e){console.error("[mega-lobby] publish takeover:",e&&e.message);}
    },
  });
  global.__MEGA_LOBBY=MEGA_LOBBY;

  const { createPaleWormLobbyController }=require("./pale_worm_lobby");
  const PALE_LOBBY=createPaleWormLobbyController({
    getDb:()=>db,
    publishAccount:(accountId,type,data)=>publishSync(accountId,type,data),
    publishInstance:async(accountId,row)=>{
      if(!row)return;
      try{
        await publishInstanceForRow(db,row,{
          id:row.instance_id,version:Number(row.version)||1,status:row.status||"active",
          source:"pale-takeover",holderId:""});
      }catch(e){console.error("[pale-lobby] publish takeover:",e&&e.message);}
    },
  });
  global.__PALE_LOBBY=PALE_LOBBY;

  const maintenance=setInterval(()=>{Promise.resolve(db.pruneExpiredSessions&&db.pruneExpiredSessions(Date.now())).catch(()=>{});
    if(SYNC_BUS)SYNC_BUS.cleanup(Date.now());
    if(CHAT_BUS)CHAT_BUS.cleanup(Date.now());},3600000);if(maintenance.unref)maintenance.unref();

  const server = http.createServer(async (req, res) => {
    const url=req.url.split("?")[0],cors=allowedOrigin(req);
    if(cors===false&&url.startsWith("/api/"))return send(res,403,{ok:false,error:"ORIGIN_DENIED",msg:"Origem não autorizada"});
    if(cors)res._corsOrigin=cors;
    if (req.method === "OPTIONS") { send(res, 204, {}); return; }

    try {
      // Estáticos ANTES das rotas /api: GET / deve abrir o jogo (index.html),
      // nunca cair no 404 JSON "Rota não encontrada".
      if ((req.method === "GET" || req.method === "HEAD") && !url.startsWith("/api/")) {
        if (url === "/js/server-config.js") {
          const config = `window.GLOBAL_IDLE_SERVER_CONFIG={online:true,testServer:${
            TEST_SERVER ? "true" : "false"},maintenanceMode:${MAINTENANCE_MODE?"true":"false"
            },apiUrl:window.location.origin,syncProtocol:"${SYNC_PROTOCOL}"};\n`;
          return sendText(res, 200, config, "text/javascript; charset=utf-8");
        }
        return serveStatic(req, res, url);
      }
      // Form POST acidental em / (method=post sem preventDefault / scripts
      // ainda carregando) não deve substituir o documento por JSON de API.
      // 303 → GET / devolve o HTML do jogo.
      if (!url.startsWith("/api/")) {
        res.writeHead(303, Object.assign(hardenedHeaders(res), {
          Location: "/", "Cache-Control": "no-store",
        }));
        res.end();
        return;
      }
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
        const playersOnline = await onlineCountPayload(db);
        return send(res, 200, { ok:true, testServer:TEST_SERVER,
          bootId:SERVER_BOOT_ID,startedAt:SERVER_STARTED_AT,
          serverPower:"on",
          maintenance:getMaintenanceState(),
          playersOnline,
          worker:instanceWorker.stats(),sync:{protocol:SYNC_PROTOCOL,cursor:SYNC_BUS.cursor(),clients:SYNC_BUS.clientCount()},
          chat:{cursor:CHAT_BUS.cursor(),clients:CHAT_BUS.clientCount(),channels:CHAT_CHANNELS},
          accounts:TEST_SERVER ? ["1/1","2/2"] : [] });
      }
      if (req.method === "GET" && url === "/api/online-count") {
        const playersOnline = await onlineCountPayload(db);
        return send(res, 200, { ok: true, ...playersOnline });
      }
      if(req.method==="POST"&&url==="/api/maintenance/schedule"){
        const limited=rateLimit(req,"maintenance-schedule",10,60000);if(limited)return send(res,limited.code,limited.body);
        let body={};
        try{body=await readBody(req);}catch(e){return send(res,400,{ok:false,error:"BAD_JSON",msg:"JSON inválido"});}
        const auth=await authorizeMaintenance(req,body,db);
        if(!auth.ok)return send(res,403,{ok:false,error:"FORBIDDEN",msg:"Token de manutenção ou admin necessário"});
        const seconds=body.seconds!=null?body.seconds:30;
        const state=scheduleMaintenance(seconds);
        return send(res,200,{ok:true,maintenance:state,via:auth.via});
      }
      if(req.method==="GET"&&url==="/api/maintenance"){
        return send(res,200,{ok:true,maintenance:getMaintenanceState(),serverPower:"on"});
      }
      if(req.method==="POST"&&url==="/api/chat/ticket"){
        const limited=rateLimit(req,"chat-ticket",60,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await issueChatTicket(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="GET"&&url==="/api/chat/events"){
        const q=new URL(req.url,"http://x").searchParams,ticket=CHAT_BUS.consumeTicket(q.get("ticket"));
        if(!ticket)return sendChatExpired(res,"ticket-invalid");
        res.writeHead(200,Object.assign(hardenedHeaders(res),{"Content-Type":"text/event-stream; charset=utf-8",
          "Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}));
        res.write("retry: 1500\n\n");
        CHAT_BUS.subscribe(res,req.headers["last-event-id"]||q.get("lastEventId"),{
          accountId:ticket.accountId,sessionToken:ticket.sessionToken,viewerName:ticket.viewerName||"",
          expiresAt:ticket.expiresAt,
        });return;
      }
      if(req.method==="GET"&&url==="/api/chat/history"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const q=new URL(req.url,"http://x").searchParams;
        const r=await chatHistory(db,token,q);return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/chat/send"){
        const limited=rateLimit(req,"chat-send",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await chatSend(db,await readBody(req));return send(res,r.code,r.body);
      }
      if (req.method === "POST" && url === "/api/register") {
        if(MAINTENANCE_MODE){const m=maintenanceAuthReject();return send(res,m.code,m.body);}
        const limited=rateLimit(req,"register",10,3600000);if(limited)return send(res,limited.code,limited.body);
        const body = await readBody(req);
        const r = await register(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/login") {
        if(MAINTENANCE_MODE){const m=maintenanceAuthReject();return send(res,m.code,m.body);}
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
        if(MAINTENANCE_MODE){const m=maintenanceAuthReject();return send(res,m.code,m.body);}
        const r=await acquireLease(db,bodyWithSessionToken(req,await readBody(req)),false);return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/lease/takeover"){
        if(MAINTENANCE_MODE){const m=maintenanceAuthReject();return send(res,m.code,m.body);}
        const limited=rateLimit(req,"lease-takeover",10,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await acquireLease(db,bodyWithSessionToken(req,await readBody(req)),true);return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/lease/renew"){
        if(MAINTENANCE_MODE){const m=maintenanceAuthReject();return send(res,m.code,m.body);}
        const r=await renewLease(db,bodyWithSessionToken(req,await readBody(req)));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/lease/release"){
        if(MAINTENANCE_MODE){const m=maintenanceAuthReject();return send(res,m.code,m.body);}
        const r=await releaseLease(db,bodyWithSessionToken(req,await readBody(req)));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/account/missions"){
        const r=await updateAccountMissions(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/account/tutorial"){
        const r=await updateAccountTutorial(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/account/tutorial/claim"){
        const r=await claimTutorialReward(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/account/email/send"){
        const limited=rateLimit(req,"email-send",10,600000);if(limited)return send(res,limited.code,limited.body);
        const r=await requestEmailCode(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/account/email/verify"){
        const limited=rateLimit(req,"email-verify",20,600000);if(limited)return send(res,limited.code,limited.body);
        const r=await verifyEmailCode(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="GET"&&url==="/api/instance"){
        const token=(req.headers.authorization||"").replace("Bearer ",""),q=new URL(req.url,"http://x").searchParams;
        const r=await loadInstance(db,token,q.get("char_id"));return send(res,r.code,r.body);
      }
      if(req.method==="PUT"&&url==="/api/instance"){
        const r=await saveInstance(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/tick"){
        const r=await tickInstance(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/ammo"){
        const r=await selectInstanceAmmo(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/equip"){
        const r=await equipInstanceItem(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/pouch-clear"){
        const r=await clearInstanceLootPouch(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/pouch-destroy")||
         (req.method==="POST"&&url==="/api/pouch/destroy")){
        const r=await destroyLootPouchItem(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/open-bag-you-desire")||
         (req.method==="POST"&&url==="/api/pouch/open-bag-you-desire")){
        const r=await openBagYouDesire(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/pouch-sell")||
         (req.method==="POST"&&url==="/api/pouch/sell")){
        const r=await sellInstanceLootPouch(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/bag-sell")||
         (req.method==="POST"&&url==="/api/bag/sell")){
        const r=await sellBagItems(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/stash-move")||
         (req.method==="POST"&&url==="/api/stash/move")){
        const r=await moveToSupplyStash(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/stash-withdraw")||
         (req.method==="POST"&&url==="/api/stash/withdraw")){
        const r=await withdrawFromSupplyStash(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/stash-equip")||
         (req.method==="POST"&&url==="/api/stash/equip")){
        const r=await equipSupplyStashItem(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/pouch-to-bag")||
         (req.method==="POST"&&url==="/api/pouch/to-bag")){
        const r=await movePouchToBag(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/stash-auto")||
         (req.method==="POST"&&url==="/api/stash/auto")){
        const r=await setAutoSupplyStashPreference(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/loot-config")||
         (req.method==="POST"&&url==="/api/loot/config")){
        const r=await setLootConfigPreference(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/end"){
        const r=await endInstance(db,await readBody(req));return send(res,r.code,r.body);
      }
      if (req.method === "POST" && url === "/api/characters") {
        const body = await readBody(req);
        const r = await createCharacter(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/characters/equip-other") {
        const r = await equipOtherCharacterItem(db, await readBody(req));
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
      if (req.method === "POST" && url === "/api/reward/claim") {
        const r = await claimRewardChest(db, await readBody(req));return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/coins") {
        const body = await readBody(req);
        const r = await coins(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/vip") {
        const body = await readBody(req);
        const r = await setVip(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/store/catalog") {
        return send(res, 200, store.catalog());
      }
      if (req.method === "POST" && url === "/api/store/checkout") {
        const body = await readBody(req);
        const r = await store.checkout(db, body, req, { testServer: TEST_SERVER });
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url.startsWith("/api/store/orders/")) {
        const id = url.split("/").pop();
        const q = new URL(req.url, "http://x").searchParams;
        const token = q.get("token") || (req.headers.authorization || "").replace("Bearer ", "");
        const r = await store.orderStatus(db, token, id);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/store/simulate") {
        const body = await readBody(req);
        const r = await store.simulatePay(db, body, { testServer: TEST_SERVER });
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/store/vip") {
        const body = await readBody(req);
        const r = await store.buyVip(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/store/history") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await store.myHistory(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/store/admin") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await store.adminSummary(db, token, { testServer: TEST_SERVER });
        return send(res, r.code, r.body);
      }
      if ((req.method === "POST" || req.method === "GET") && url === "/api/store/mp/webhook") {
        let body = {};
        if (req.method === "POST") {
          try { body = await readBody(req); } catch (e) { body = {}; }
        }
        const q = new URL(req.url, "http://x").searchParams;
        const r = await store.webhook(db, body, q);
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
        if(r.body&&r.body.ok&&r.body.added&&r.body.member){
          const leader=await db.findCharacter(Number(body.char_id));
          const guest=await db.findCharacter(Number(r.body.member.id));
          if(leader)await publishPartyState(db,leader.account_id,"add");
          if(guest&&(!leader||guest.account_id!==leader.account_id))
            await publishPartyState(db,guest.account_id,"add");
        }
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
        if(r.body&&r.body.ok)await publishPartyForCharacters(db,[body.char_id],"zone");
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/party/follow") {
        const body = await readBody(req);
        const r = await party.partyFollow(db, body);
        return send(res, r.code, r.body);
      }
      // ---- WORLD BOSS / WARZONE ----
      if(req.method==="GET"&&url==="/api/world-boss/state"){
        const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
        const q=new URL(req.url,"http://x").searchParams;
        const r=await WORLD_BOSS.stateFor(db,token||q.get("token")||"");
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/join"){
        const limited=rateLimit(req,"wb-join",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await WORLD_BOSS.join(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/leave"){
        const r=await WORLD_BOSS.leave(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/loaded"){
        const r=await WORLD_BOSS.markLoaded(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/report"){
        const r=await WORLD_BOSS.reportCombat(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/admin/force-open"){
        const limited=rateLimit(req,"wb-force",20,60000);if(limited)return send(res,limited.code,limited.body);
        let body={};
        try{body=await readBody(req);}catch(e){return send(res,400,{ok:false,error:"BAD_JSON"});}
        const auth=await authorizeMaintenance(req,body,db);
        const r=await WORLD_BOSS.forceOpen(db,body,auth.ok);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/admin/force-close"){
        const limited=rateLimit(req,"wb-force",20,60000);if(limited)return send(res,limited.code,limited.body);
        let body={};
        try{body=await readBody(req);}catch(e){return send(res,400,{ok:false,error:"BAD_JSON"});}
        const auth=await authorizeMaintenance(req,body,db);
        const r=await WORLD_BOSS.forceClose(db,body,auth.ok);
        return send(res,r.code,r.body);
      }

      /* -------- Megalomania lobby (1–5 jogadores, 1 char cada) -------- */
      if(req.method==="GET"&&url==="/api/mega-lobby/state"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const acc=await db.findAccountByToken(token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        return send(res,200,MEGA_LOBBY.stateFor(acc.id));
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/create"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const character=await db.findCharacter(Number(body.char_id));
        if(!character||Number(character.account_id)!==Number(acc.id))
          return send(res,403,{ok:false,msg:"Personagem inválido"});
        const r=await MEGA_LOBBY.createLobby(db,acc,character,{
          inTemple:!!body.inTemple,playerName:body.playerName||character.name});
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/invite"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await MEGA_LOBBY.invite(db,acc,body.invitee_name||body.name);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/accept"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const character=await db.findCharacter(Number(body.char_id));
        if(!character||Number(character.account_id)!==Number(acc.id))
          return send(res,403,{ok:false,msg:"Personagem inválido"});
        const r=await MEGA_LOBBY.acceptInvite(db,acc,body.invite_id,character,{
          inTemple:!!body.inTemple,playerName:body.playerName||character.name});
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/decline"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await MEGA_LOBBY.declineInvite(db,acc,body.invite_id);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/leave"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await MEGA_LOBBY.leave(db,acc);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/leave-fight"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        let r;
        try{r=await MEGA_LOBBY.leaveFight(db,acc);}
        catch(e){
          console.error("[mega-lobby] leave-fight:",e&&e.message);
          return send(res,500,{ok:false,msg:"Falha ao sair da luta."});
        }
        // Último lutador saiu (morte/wipe): encerra a instância no servidor.
        // Sem isto o row mega multi-conta fica órfão e o PUT seguinte responde
        // 403 INSTANCE_CHARACTER_NOT_OWNED ("personagem externo").
        if(r&&r.body&&r.body.shouldEndInstance&&typeof db.instanceEndMegaOrphan==="function"){
          try{
            const ownerId=Number(r.body.ownerAccountId)||Number(acc.id);
            const ended=await db.instanceEndMegaOrphan(ownerId,r.body.instanceId||null,"mega-lobby-empty");
            if(ended&&ended.ok&&ended.instance){
              r.body.instanceEnded=true;
              try{
                await publishInstanceForRow(db,ended.instance,{
                  id:ended.instance.instance_id,version:Number(ended.instance.version)||1,
                  status:"ended",terminalReason:"mega-lobby-empty",source:"mega-leave-fight",
                  holderId:String(body.holder_id||"")});
              }catch(pubErr){/* best-effort sync */}
            }
          }catch(e){
            console.error("[mega-lobby] leave-fight end instance:",e&&e.message);
          }
        }
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/kick"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await MEGA_LOBBY.kick(db,acc,body.target_account_id);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/start"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await MEGA_LOBBY.start(db,acc);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/mega-lobby/bind"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const denied=await requireLease(db,acc,body);if(denied)return send(res,denied.code,denied.body);
        const lobby=MEGA_LOBBY.getLobbyForAccount(acc.id);
        if(!lobby||Number(lobby.leaderAccountId)!==Number(acc.id))
          return send(res,403,{ok:false,msg:"Só o líder vincula a instância"});
        if(!body.instance_id)return send(res,400,{ok:false,msg:"instance_id obrigatório"});
        const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
        // Expande membros ANTES do bindShare — convidados que carregam a
        // instância compartilhada já precisam estar em authority.players.
        try{
          const row=await db.instanceGet(acc.id);
          if(row&&row.state&&String(row.instance_id)===String(body.instance_id)){
            let state=typeof row.state==="string"?JSON.parse(row.state):row.state;
            if(state&&state.authority){
              const auth=state.authority;
              auth.players=auth.players||[];
              const have=new Set(auth.players.map((p)=>Number(p.id)));
              const memberIds=[];
              for(const m of MEGA_LOBBY.membersForStart(lobby)){
                memberIds.push(Number(m.charId));
                if(have.has(Number(m.charId)))continue;
                const character=await db.findCharacter(m.charId);if(!character)continue;
                let data={};try{data=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
                data=Object.assign({},data,{id:String(character.id),name:character.name,voc:character.voc,level:Number(character.level)||1});
                const ownerAcc=await db.findAccountById(character.account_id);
                data.gold=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.gold)||0));
                data.vipUntil=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.vip_until)||0));
                data.accountId=Number(character.account_id);
                if(Number(character.hp)>0)data.hp=Number(character.hp);
                if(Number(character.mp)>=0)data.mp=Number(character.mp);
                const leader=auth.players[0]||{};
                auth.players.push({
                  id:String(character.id),p:data,hp:data.hp,mp:data.mp,
                  accountId:Number(character.account_id),
                  x:Number(leader.x)||.5,y:Number(leader.y)||.6,
                  cx:Number(leader.cx)||15,cy:Number(leader.cy)||16,dir:leader.dir||"n"
                });
                have.add(Number(m.charId));
              }
              if(auth.mega&&typeof auth.mega.personal==="object"){
                for(const p of auth.players){
                  const id=String(p.id);
                  if(!auth.mega.personal[id])auth.mega.personal[id]={
                    nextAt:(Number(auth.mega.bossSpawnAt)||auth.clock||Date.now())+10000+Math.floor(Math.random()*15000),
                    active:null
                  };
                }
              }
              state.members=auth.players.map((p)=>({id:p.id,p:p.p,hp:p.hp,mp:p.mp,accountId:p.accountId||(p.p&&p.p.accountId)}));
              state=materializeAuthority(state);
              const saved=await db.instanceSave(acc.id,row.instance_id,row.version,{
                kind:row.kind,hunt_id:row.hunt_id,boss_id:row.boss_id,instance_mode:row.instance_mode,
                party_id:row.party_id,party_version:row.party_version,
                member_ids:memberIds.length?memberIds:auth.players.map((p)=>Number(p.id)),
                active_character_id:Number(row.active_character_id)||Number(auth.players[0]&&auth.players[0].id),
                saved_at:new Date(),started_at:row.started_at||new Date()
              },JSON.stringify(state),lease);
              if(saved&&saved.ok&&saved.instance){
                await publishInstanceForRow(db,saved.instance,{
                  id:saved.instance.instance_id,version:Number(saved.instance.version),
                  status:saved.instance.status,source:"mega-bind",holderId:String(body.holder_id||"")
                });
              }else if(saved&&!saved.ok){
                console.error("[mega-lobby] expand save failed:",saved.error);
                return send(res,409,{ok:false,msg:"Falha ao expandir o roster da sala. Tente de novo.",
                  error:saved.error});
              }
            }
          }
        }catch(e){
          console.error("[mega-lobby] expand players:",e.message);
          return send(res,500,{ok:false,msg:"Erro ao preparar a sala compartilhada."});
        }
        MEGA_LOBBY.bindShare(lobby,String(body.instance_id),acc.id);
        await MEGA_LOBBY.markCharsUsed(db,MEGA_LOBBY.membersForStart(lobby));
        return send(res,200,{ok:true,lobby:MEGA_LOBBY.stateFor(acc.id).lobby});
      }

      /* -------- Pale Worm lobby (1–9 jogadores, 1 char cada) -------- */
      if(req.method==="GET"&&url==="/api/pale-lobby/state"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const acc=await db.findAccountByToken(token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        return send(res,200,PALE_LOBBY.stateFor(acc.id));
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/create"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const character=await db.findCharacter(Number(body.char_id));
        if(!character||Number(character.account_id)!==Number(acc.id))
          return send(res,403,{ok:false,msg:"Personagem inválido"});
        const r=await PALE_LOBBY.createLobby(db,acc,character,{
          inTemple:!!body.inTemple,playerName:body.playerName||character.name});
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/invite"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PALE_LOBBY.invite(db,acc,body.invitee_name||body.name);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/accept"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const character=await db.findCharacter(Number(body.char_id));
        if(!character||Number(character.account_id)!==Number(acc.id))
          return send(res,403,{ok:false,msg:"Personagem inválido"});
        const r=await PALE_LOBBY.acceptInvite(db,acc,body.invite_id,character,{
          inTemple:!!body.inTemple,playerName:body.playerName||character.name});
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/decline"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PALE_LOBBY.declineInvite(db,acc,body.invite_id);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/leave"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PALE_LOBBY.leave(db,acc);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/leave-fight"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        let r;
        try{r=await PALE_LOBBY.leaveFight(db,acc);}
        catch(e){
          console.error("[pale-lobby] leave-fight:",e&&e.message);
          return send(res,500,{ok:false,msg:"Falha ao sair da luta."});
        }
        // Último lutador saiu (morte/wipe): encerra a instância no servidor.
        if(r&&r.body&&r.body.shouldEndInstance&&typeof db.instanceEndMegaOrphan==="function"){
          try{
            const ownerId=Number(r.body.ownerAccountId)||Number(acc.id);
            const ended=await db.instanceEndMegaOrphan(ownerId,r.body.instanceId||null,"pale-lobby-empty");
            if(ended&&ended.ok&&ended.instance){
              r.body.instanceEnded=true;
              try{
                await publishInstanceForRow(db,ended.instance,{
                  id:ended.instance.instance_id,version:Number(ended.instance.version)||1,
                  status:"ended",terminalReason:"pale-lobby-empty",source:"pale-leave-fight",
                  holderId:String(body.holder_id||"")});
              }catch(pubErr){/* best-effort sync */}
            }
          }catch(e){
            console.error("[pale-lobby] leave-fight end instance:",e&&e.message);
          }
        }
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/kick"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PALE_LOBBY.kick(db,acc,body.target_account_id);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/start"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PALE_LOBBY.start(db,acc);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pale-lobby/bind"){
        const body=await readBody(req);const acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const denied=await requireLease(db,acc,body);if(denied)return send(res,denied.code,denied.body);
        const lobby=PALE_LOBBY.getLobbyForAccount(acc.id);
        if(!lobby||Number(lobby.leaderAccountId)!==Number(acc.id))
          return send(res,403,{ok:false,msg:"Só o líder vincula a instância"});
        if(!body.instance_id)return send(res,400,{ok:false,msg:"instance_id obrigatório"});
        const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
        // Expande membros ANTES do bindShare — convidados que carregam a
        // instância compartilhada já precisam estar em authority.players.
        try{
          const row=await db.instanceGet(acc.id);
          if(row&&row.state&&String(row.instance_id)===String(body.instance_id)){
            let state=typeof row.state==="string"?JSON.parse(row.state):row.state;
            if(state&&state.authority){
              const auth=state.authority;
              auth.players=auth.players||[];
              const have=new Set(auth.players.map((p)=>Number(p.id)));
              const memberIds=[];
              for(const m of PALE_LOBBY.membersForStart(lobby)){
                memberIds.push(Number(m.charId));
                if(have.has(Number(m.charId)))continue;
                const character=await db.findCharacter(m.charId);if(!character)continue;
                let data={};try{data=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
                data=Object.assign({},data,{id:String(character.id),name:character.name,voc:character.voc,level:Number(character.level)||1});
                const ownerAcc=await db.findAccountById(character.account_id);
                data.gold=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.gold)||0));
                data.vipUntil=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.vip_until)||0));
                data.accountId=Number(character.account_id);
                if(Number(character.hp)>0)data.hp=Number(character.hp);
                if(Number(character.mp)>=0)data.mp=Number(character.mp);
                const leader=auth.players[0]||{};
                auth.players.push({
                  id:String(character.id),p:data,hp:data.hp,mp:data.mp,
                  accountId:Number(character.account_id),
                  x:Number(leader.x)||.5,y:Number(leader.y)||.6,
                  cx:Number(leader.cx)||15,cy:Number(leader.cy)||16,dir:leader.dir||"n"
                });
                have.add(Number(m.charId));
              }
              state.members=auth.players.map((p)=>({id:p.id,p:p.p,hp:p.hp,mp:p.mp,accountId:p.accountId||(p.p&&p.p.accountId)}));
              state=materializeAuthority(state);
              const saved=await db.instanceSave(acc.id,row.instance_id,row.version,{
                kind:row.kind,hunt_id:row.hunt_id,boss_id:row.boss_id,instance_mode:row.instance_mode,
                party_id:row.party_id,party_version:row.party_version,
                member_ids:memberIds.length?memberIds:auth.players.map((p)=>Number(p.id)),
                active_character_id:Number(row.active_character_id)||Number(auth.players[0]&&auth.players[0].id),
                saved_at:new Date(),started_at:row.started_at||new Date()
              },JSON.stringify(state),lease);
              if(saved&&saved.ok&&saved.instance){
                await publishInstanceForRow(db,saved.instance,{
                  id:saved.instance.instance_id,version:Number(saved.instance.version),
                  status:saved.instance.status,source:"pale-bind",holderId:String(body.holder_id||"")
                });
              }else if(saved&&!saved.ok){
                console.error("[pale-lobby] expand save failed:",saved.error);
                return send(res,409,{ok:false,msg:"Falha ao expandir o roster da sala. Tente de novo.",
                  error:saved.error});
              }
            }
          }
        }catch(e){
          console.error("[pale-lobby] expand players:",e.message);
          return send(res,500,{ok:false,msg:"Erro ao preparar a sala compartilhada."});
        }
        PALE_LOBBY.bindShare(lobby,String(body.instance_id),acc.id);
        return send(res,200,{ok:true,lobby:PALE_LOBBY.stateFor(acc.id).lobby});
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
    console.log("[server] bootId:", SERVER_BOOT_ID, "startedAt:", new Date(SERVER_STARTED_AT).toISOString());
    console.log("[server] registre/login: POST /api/register e /api/login");
    if (TEST_SERVER) console.log("[server] TEST SERVER ativo — Admin liberado para testers");
    if (MAINTENANCE_MODE) console.log("[server] MAINTENANCE_MODE=1 — UI bloqueada + login/register/lease 503");
    console.log("[server] world-boss timers:", WORLD_BOSS.timers);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
