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
 *   GET/POST /api/store/*  catálogo, checkout MP, VIP, voucher, cosmetics, ledger, webhook
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
const vm = require("vm");
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");
const { YANA_CATALOG, applyYanaPurchase } = require("./yana_catalog");
const party = require("./party");   // lógica de PARTY multiplayer
const guild = require("./guild");   // lógica de GUILDS (por conta)
const { startInstanceWorker } = require("./instance_worker");
const { SyncBus } = require("./sync_bus");
const {
  ChatBus, CHANNELS: CHAT_CHANNELS, MAX_TEXT: CHAT_MAX_TEXT,
  filterHardObscenity, sanitizeText, vocShort, parsePm,
} = require("./chat");
const { initializeAuthority, materializeAuthority, advanceAuthorityState, protectedPlayer, maxStats, ITEMS,
  sanitizeHelperPresets, sanitizeWheelState, sanitizeImbuementState, advanceTrainingPlayer, staminaRegenPlayer,
  rewardChestEnsure, rewardChestClaimOne, rewardChestClaimBundle, rewardChestClaimAll,
  sellAuthAllPouch, sellAuthPouchItem, sellAuthAllBag, sellAuthBagItem, destroyAuthPouchItem, openAuthBagYouDesire, openAuthPrimalBag, claimAnnihilatorReward, annihilatorRewardOffer, claimAnnihilatorCart, setAuthAutoSupplyStash, setAuthLootConfig,
  moveItemToSupplyStash, moveItemFromSupplyStash, equipFromSupplyStash, moveLootPouchToBag, moveBagToPouchAuth,
  destroyAuthBagItem, authItemNeedsBagInstance, authSyncBagCountsFromInstances, authAddItemToBag,
  equipFromContainerAuth, unequipFromContainerAuth, depotActionAuth,
  assignCharm: authAssignCharm, clearCharm: authClearCharm,
  buyCharm: authBuyCharm, upgradeCharm: authUpgradeCharm } = require("./authoritative_engine");
const { forgeCanFuse, forgeFuseAuth } = require("./forge");
/* Catalisadores de Weapon Proficiency — tabela + lógica compartilhada com
 * o cliente. O require interno de proficiency.js resolve os globals que o
 * engine acabou de ligar (window.PROFDATA, GAMEDATA.items, itemLiberado). */
const PROF_CATALYSTS_MOD = (() => {
  try { return require("../game/js/proficiency-catalysts.js"); }
  catch (e) { return null; }
})();
const { createWorldBossController, bossIdForWarzone, isWorldBossBossId, WARZONES, WORLD_BOSS_MAX_MEMBERS } = require("./world_boss");
const { createPvpController, PVP_MAPS, pvpMapLocal, pvpRectCenter, pvpApplyBattlePreset,
  pvpFilterVisualState, pvpResumeLiveOnBoot, pvpAuthCacheGet, pvpAuthCacheSet,
  pvpAuthCacheDrop, pvpAuthSerialize, PVP_AUTH_PERSIST_MS,
  pvpAuthMarkAllDirty } = require("./pvp");
const { createQuestController, QUEST_DEFS } = require("./quest_controller");
// Inventário DA CONTA (bag/lootPouch/depot/reward chest compartilhados entre
// os personagens). Pure module — db.js persiste accounts.shared_inventory.
let SharedInv = null;
try { SharedInv = require("./shared_inventory"); } catch (e) { SharedInv = null; }
const store = require("./store");
const rmt = require("./rmt");
const twitch = require("./twitch");
const oauth = require("./oauth");
const partners = require("./partners");
const mailer = require("./mailer");

const PORT = parseInt(process.env.PORT || "8001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const SALT_ROUNDS = 10;
const TEST_SERVER = process.env.TEST_SERVER === "1";
// Verificação de e-mail por código (confirmação de conta).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_VERIFY_REQUIRED = process.env.EMAIL_VERIFY_REQUIRED === "1";
const ACCOUNT_MAX_CHARS = 4;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const LEASE_TTL_MS=Math.max(500,parseInt(process.env.LEASE_TTL_MS||"120000",10)||120000);
const SESSION_TTL_MS=Math.max(1000,parseInt(process.env.SESSION_TTL_MS||"86400000",10)||86400000);
const INSTANCE_WORKER_INTERVAL_MS=Math.max(100,parseInt(process.env.INSTANCE_WORKER_INTERVAL_MS||"1000",10)||1000);
const INSTANCE_WORKER_MAX_STEP_MS=Math.max(100,parseInt(process.env.INSTANCE_WORKER_MAX_STEP_MS||"3600000",10)||3600000);
// Após restart, dê tempo para abas retomarem o lease antes de o worker
// calcular o período offline. Sem essa janela, uma party podia sofrer wipe
// no primeiro tick de boot e ser enviada ao templo durante manutenção.
const INSTANCE_WORKER_STARTUP_GRACE_MS=Math.max(0,parseInt(process.env.INSTANCE_WORKER_STARTUP_GRACE_MS||"5000",10)||0);
// Simulação síncrona máxima por tick/claim: o catchup inteiro dentro do
// handler (até 250k steps ≈ 14h simuladas) congelava o event loop — o
// servidor "travava" justo no last hit do boss. O restante vira dívida
// em carryMs no estado e drena nas chamadas seguintes.
const AUTH_TICK_STEP_BUDGET_MS=Math.max(50,parseInt(process.env.AUTH_TICK_STEP_BUDGET_MS||"150",10)||150);
const AUTH_WORKER_STEP_BUDGET_MS=Math.max(50,parseInt(process.env.AUTH_WORKER_STEP_BUDGET_MS||"400",10)||400);
const AUTH_END_STEP_BUDGET_MS=Math.max(100,parseInt(process.env.AUTH_END_STEP_BUDGET_MS||"2000",10)||2000);
// Identidade deste processo — o cliente usa bootId em /api/health para
// detectar restart mesmo quando a porta volta rápido com a mesma URL.
const SERVER_BOOT_ID=crypto.randomBytes(16).toString("hex");
const SERVER_STARTED_AT=Date.now();
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, "..", "game"));
const STATIC_IMAGES_DIR = path.resolve(process.env.STATIC_IMAGES_DIR || path.join(__dirname, "..", "imagens"));
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
/* Anúncio global com popup: state leve devolvido em /api/health (TTL)
 * e empurrado por SSE — o cliente mostra o modal uma vez por anúncio. */
const ANNOUNCE_STATE={current:null};
function getAnnounceState(){
  const a=ANNOUNCE_STATE.current;
  if(!a)return null;
  if(a.until&&Date.now()>Number(a.until)){ANNOUNCE_STATE.current=null;return null;}
  return a;
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

/* ---------------------------------------------------------- server save
 * Todo dia às 00:00 no fuso SERVER_SAVE_TZ o processo executa o savestate
 * global: libera a recompensa diária de exercise weapon, marca o cache
 * quente de PvP como sujo (próximo tick commita o blob inteiro) e flusha o
 * runtime do JsonStore. Jogadores NÃO desconectam — não há mais restart
 * nem countdown de manutenção. SERVER_SAVE_EXIT=1 restaura o restart
 * legado pós-save (deploy/manual ops apenas). */
const SERVER_SAVE_TZ=String(process.env.SERVER_SAVE_TZ||"America/Sao_Paulo").trim()||"America/Sao_Paulo";
const DAILY_EXERCISE_CHARGES=Math.max(1,parseInt(process.env.DAILY_EXERCISE_CHARGES||"3000",10)||3000);
const SERVER_META_FILE=path.join(
  process.env.GLOBAL_IDLE_DATA_DIR?path.resolve(process.env.GLOBAL_IDLE_DATA_DIR):path.join(__dirname,"data"),
  "server-meta.json");
function loadServerMeta(){try{return JSON.parse(fs.readFileSync(SERVER_META_FILE,"utf8"))||{};}catch(e){return{};}}
function saveServerMeta(meta){try{fs.mkdirSync(path.dirname(SERVER_META_FILE),{recursive:true});
  fs.writeFileSync(SERVER_META_FILE,JSON.stringify(meta));}catch(e){console.error("[server-save] meta:",e&&e.message);}}
const SERVER_META=loadServerMeta();
// Dia (yyyy-mm-dd no fuso do save) em que a recompensa diária foi liberada
// pela última vez. Persistido: reinícios fora do horário não renovam bônus.
let DAILY_REWARD_DAY=String(SERVER_META.rewardDay||"");
function serverSaveWall(date){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:SERVER_SAVE_TZ,hour12:false,
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})
    .formatToParts(date).filter((p)=>p.type!=="literal")
    .reduce((o,p)=>(o[p.type]=p.value,o),{});
  return {day:`${parts.year}-${parts.month}-${parts.day}`,
    seconds:((+parts.hour)%24)*3600+(+parts.minute)*60+(+parts.second)};
}
/* Savestate global: persiste tudo o que ainda estiver volátil SEM derrubar
 * jogadores. JsonStore descarrega o runtime; o cache quente de PvP é
 * marcado sujo para o próximo tick commitar o blob; o resto (contas,
 * personagens, instâncias de hunt) já é durável via saves/checkpoints
 * versionados. */
async function runGlobalSavestate(db){
  let flushed=false;
  try{if(db&&typeof db._flushRuntime==="function"){db._flushRuntime();flushed=true;}}
  catch(e){console.error("[savestate] runtime flush:",e&&e.message);}
  try{if(typeof pvpAuthMarkAllDirty==="function")pvpAuthMarkAllDirty();}
  catch(e){console.error("[savestate] pvp dirty:",e&&e.message);}
  SERVER_META.lastSavestateAt=new Date().toISOString();saveServerMeta(SERVER_META);
  console.log("[savestate] global concluído (runtimeFlush="+flushed+") — jogadores permanecem conectados");
}
async function runServerSave(db,day){
  DAILY_REWARD_DAY=day;SERVER_META.rewardDay=day;SERVER_META.lastSaveAt=new Date().toISOString();
  saveServerMeta(SERVER_META);
  console.log("[server-save] 00:00 "+SERVER_SAVE_TZ+" — savestate global + recompensa diária ("+day+")");
  await runGlobalSavestate(db).catch((e)=>console.error("[savestate]",e&&e.message));
  try{if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll==="function")SYNC_BUS.broadcastAll("server-save",{day,charges:DAILY_EXERCISE_CHARGES});}catch(e){}
  if(process.env.SERVER_SAVE_EXIT==="1"){
    // Opt-in legado (deploy/ops): restart supervisionado após o save.
    setTimeout(()=>{console.log("[server-save] SERVER_SAVE_EXIT=1 — reiniciando processo");process.exit(0);},2500);
  }
}
function startServerSaveScheduler(db){
  // Primeiro boot da feature: libera a recompensa já no deploy para todos
  // poderem coletar. Saves seguintes só no 00:00 do fuso.
  if(!DAILY_REWARD_DAY){DAILY_REWARD_DAY=serverSaveWall(new Date()).day;
    SERVER_META.rewardDay=DAILY_REWARD_DAY;saveServerMeta(SERVER_META);}
  let lastDay=serverSaveWall(new Date()).day;
  const timer=setInterval(()=>{
    const now=new Date(),wall=serverSaveWall(now);
    if(wall.day!==lastDay){lastDay=wall.day;runServerSave(db,wall.day);}
  },5000);
  if(timer.unref)timer.unref();
  console.log("[server-save] agendado — 00:00 "+SERVER_SAVE_TZ+" savestate global, sem desconexão (rewardDay="+DAILY_REWARD_DAY+")");
}
const EXERCISE_REWARD_WEAPONS={"exercise-sword":"sword","exercise-axe":"axe","exercise-club":"club",
  "exercise-bow":"dist","exercise-rod":"magic","exercise-wand":"magic","exercise-shield":"shield",
  "exercise-wraps":"fist"};
function dailyRewardInfo(p){
  const claimedDay=String(p&&p.dailyRewardDay||"");
  return {rewardDay:DAILY_REWARD_DAY,claimedDay,charges:DAILY_EXERCISE_CHARGES,
    available:!!DAILY_REWARD_DAY&&claimedDay<DAILY_REWARD_DAY};
}
function applyDailyExerciseReward(p,weaponId){
  const skill=EXERCISE_REWARD_WEAPONS[String(weaponId||"")];
  if(!skill)return {error:{code:400,body:{ok:false,error:"INVALID_EXERCISE_WEAPON",msg:"Arma de treino inválida."}}};
  const info=dailyRewardInfo(p);
  if(!info.available)return {error:{code:409,body:{ok:false,error:"DAILY_REWARD_ALREADY_CLAIMED",
    msg:"Recompensa já coletada neste ciclo.",dailyReward:info}}};
  const prior=p.trainingExercise&&typeof p.trainingExercise==="object"?p.trainingExercise:{};
  const balances=prior.balances&&typeof prior.balances==="object"?prior.balances:{};
  if(prior.plan&&prior.plan!=="free"&&prior.charges!=null&&balances[prior.plan]==null)balances[prior.plan]=prior.charges;
  balances.exercise=Math.max(0,Math.floor(Number(balances.exercise)||0));
  // O bônus cai no pool Lasting — acumula com as cargas compradas na store.
  balances.lasting=Math.max(0,Math.floor(Number(balances.lasting)||0))+DAILY_EXERCISE_CHARGES;
  p.trainingExercise={skill,weapon:String(weaponId),activePlan:"lasting",balances,active:true};
  p.dailyRewardDay=info.rewardDay;
  return {charges:DAILY_EXERCISE_CHARGES,trainingExercise:p.trainingExercise};
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
/* Body bruto para uploads multipart (comprovante RMT) — limite de ~6MB. */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size > 6e6) { req.destroy(); return; } chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
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

/* Grants Admin só para contas com role=admin — mesmo em TEST_SERVER, onde só
 * a conta "1" é promovida no seed. Ownership do personagem é checada nas rotas.
 * Bundles cross-account continuam admin-only. */
function accountCanSelfAdmin(acc){
  return !!(acc&&acc.role==="admin");
}

function hardenedHeaders(res){const headers={
  "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":"default-src 'self'; img-src 'self' data: blob: https://static-cdn.jtvnw.net; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://arena.ai https://*.arena.ai",
};if(res._corsOrigin){headers["Access-Control-Allow-Origin"]=res._corsOrigin;headers.Vary="Origin";}return headers;}
function sendSyncExpired(res,reason){
  res.writeHead(200,Object.assign(hardenedHeaders(res),{"Content-Type":"text/event-stream; charset=utf-8",
    "Cache-Control":"no-cache, no-transform","Connection":"close","X-Accel-Buffering":"no"}));
  res.end(`event: sync-expired\ndata: ${JSON.stringify({reason:reason||"ticket-invalid"})}\n\n`);
}
function send(res, code, obj) {
  const body = (obj&&typeof obj.__raw==="string")?obj.__raw:JSON.stringify(obj),headers=Object.assign(hardenedHeaders(res),{
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
  // Missões são por conta: qualquer personagem progride as mesmas missões.
  // Merge (não overwrite): um char com espelho velho não pode apagar
  // progresso/claims feitos por outro char da mesma conta.
  const missions=body.missions&&typeof body.missions==="object"?body.missions:{};
  const missionsDone=body.missionsDone&&typeof body.missionsDone==="object"?body.missionsDone:{};
  const mergedMissions=SharedInv?SharedInv.mergeMissionMaps(acc.missions,missions):missions;
  const mergedDone=SharedInv?SharedInv.mergeFlagMap(acc.missionsDone,missionsDone):missionsDone;
  if(typeof db.setAccountMissions==="function"){
    await db.setAccountMissions(acc.id,mergedMissions,mergedDone);
  }else{
    acc.missions=mergedMissions;acc.missionsDone=mergedDone;
    if(typeof db._save==="function")db._save();
  }
  /* Recompensas cosméticas por CONTA de quests (Make Believe): o claim
   * persiste só a flag; wardrobe.migrate deriva o cosmético da whitelist.
   * Roda accountWardrobe aqui apenas quando falta o grant — persiste já e
   * devolve cosmetics para a sessão espelhar (o cliente só tinha escrito
   * sessionStorage, que o próximo accountMe sobrescrevia). */
  let cosmetics=null;
  if(typeof db.accountWardrobe==="function"){
    const needOutfit=!!mergedDone["make-believe:outfit"],needMount=!!mergedDone["make-believe:mount"];
    if(needOutfit||needMount){
      const cos=typeof acc.cosmetics==="string"?(function(){try{return JSON.parse(acc.cosmetics);}catch(e){return{};}}()):(acc.cosmetics||{});
      const missing=(needOutfit&&!(cos.outfits&&cos.outfits["illuminated-warrior"]!==undefined))
        ||(needMount&&!(cos.mounts&&cos.mounts["radiant-nimbus"]));
      if(missing){try{const w=await db.accountWardrobe(acc.id);cosmetics=(w&&w.cosmetics)||null;}catch(e){/* não-fatal */}}
    }
  }
  return {code:200,body:{ok:true,missions:mergedMissions,missionsDone:mergedDone,cosmetics:cosmetics||undefined}};
}
/* Hazard level (Gnomprona, por CONTA): espelhado em
 * accounts.cosmetics.hazard = {kills, level, sel}. Merge: kills/level
 * sobem por max (desbloqueio via kill do The Primal Menace); sel = a
 * escolha do cliente travada ao nível desbloqueado (cap 12). */
async function updateAccountHazard(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const inc=body.hazard&&typeof body.hazard==="object"?body.hazard:{};
  const prior=(()=>{try{
    const cos=typeof acc.cosmetics==="string"?JSON.parse(acc.cosmetics):(acc.cosmetics||{});
    const h=cos&&cos.hazard&&typeof cos.hazard==="object"?cos.hazard:{};
    return {kills:Math.max(0,Math.floor(Number(h.kills)||0)),
      level:Math.max(0,Math.floor(Number(h.level)||0)),
      sel:Math.max(0,Math.floor(Number(h.sel)||0))};
  }catch(e){return {kills:0,level:0,sel:0};}})();
  const kills=Math.min(9999,Math.max(prior.kills,
    Math.floor(Number(inc.kills)||0),Math.floor(Number(inc.killsDelta)||0)+prior.kills));
  // Todas as contas começam com hazard 1 desbloqueado.
  const level=Math.max(1,Math.min(12,Math.max(prior.level,
    Math.floor(Number(inc.level)||0))));
  const sel=Math.max(1,Math.min(level,inc.sel!==undefined
    ?Math.floor(Number(inc.sel)||0):Math.max(1,prior.sel)));
  const hazard={kills,level,sel};
  if(typeof db.setAccountHazard==="function")await db.setAccountHazard(acc.id,hazard);
  else{try{
    const cos=typeof acc.cosmetics==="string"?JSON.parse(acc.cosmetics):(acc.cosmetics||{});
    cos.hazard=hazard;acc.cosmetics=cos;
    if(typeof db.setAccountCosmetics==="function")await db.setAccountCosmetics(acc.id,cos);
    else if(typeof db._save==="function")db._save();
  }catch(e){}}
  return {code:200,body:{ok:true,hazard}};
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
/* ------------------------- SOCIAL (friendlist) -------------------------
 * Amigos ficam na conta (acc.friends = [{charId,name,muted}]) — mesmo
 * padrão de missions/tutorial. Presença via db.socialPresence: lease válida
 * ou personagem em instância ativa. Ações de lobby reutilizam os
 * controllers mega/pale (convite = fluxo normal de invite; entrar = joinOpen
 * direto no lobby aberto do amigo). */
function socialLobbyControllers(){
  const out=[];
  if(global.__MEGA_LOBBY)out.push(["mega",global.__MEGA_LOBBY]);
  if(global.__PALE_LOBBY)out.push(["pale",global.__PALE_LOBBY]);
  return out;
}
function socialFriendsArray(acc){
  return Array.isArray(acc.friends)?acc.friends.filter((f)=>f&&Number(f.charId)>0):[];
}
async function socialList(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const friends=socialFriendsArray(acc);
  const resolved=[],stale=new Set();
  for(const f of friends){
    const c=await db.findCharacter(f.charId);
    if(!c){stale.add(Number(f.charId));continue;}
    resolved.push({f,c});
  }
  if(stale.size){
    await db.setAccountFriends(acc.id,friends.filter((f)=>!stale.has(Number(f.charId))));
  }
  const accIds=[...new Set(resolved.map((x)=>Number(x.c.account_id)))];
  const presence=(typeof db.socialPresence==="function")?await db.socialPresence(accIds):{};
  const ctrls=socialLobbyControllers();
  const out=resolved.map(({f,c})=>{
    const p=presence[Number(c.account_id)]||{online:false,inInstance:false};
    let lobbyType=null;
    for(const [key,ctrl] of ctrls){
      const lob=ctrl.getLobbyForAccount(Number(c.account_id));
      if(lob&&lob.status==="open"){lobbyType=key;break;}
    }
    return {charId:Number(c.id),name:String(c.name),voc:String(c.voc||"none"),
      level:Math.max(1,Number(c.level)||1),accountId:Number(c.account_id),
      muted:!!f.muted,online:!!p.online,inInstance:!!p.inInstance,
      lastSeen:c.updated_at||null,lobby:lobbyType};
  });
  out.sort((a,b)=>((b.online?1:0)-(a.online?1:0))||a.name.localeCompare(b.name));
  let myLobby=null;
  for(const [key,ctrl] of ctrls){
    const lob=ctrl.getLobbyForAccount(Number(acc.id));
    if(lob&&lob.status==="open"){
      myLobby={type:key,leader:Number(lob.leaderAccountId)===Number(acc.id)};
      break;
    }
  }
  return {code:200,body:{ok:true,friends:out,myLobby}};
}
async function socialSearch(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const q=String(body.query||body.q||"").trim();
  if(q.length<3)return {code:400,body:{ok:false,msg:"Digite ao menos 3 letras"}};
  const rows=(typeof db.adminSearchCharacters==="function")?await db.adminSearchCharacters(q,12):[];
  const friends=socialFriendsArray(acc);
  const results=rows.filter((c)=>Number(c.account_id)!==Number(acc.id)).map((c)=>({
    charId:Number(c.id),name:String(c.name),voc:String(c.voc||"none"),
    level:Math.max(1,Number(c.level)||1),
    isFriend:friends.some((f)=>Number(f.charId)===Number(c.id)),
  }));
  return {code:200,body:{ok:true,results}};
}
async function socialFriendAdd(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const name=String(body.name||"").trim();
  if(!name)return {code:400,body:{ok:false,msg:"Nome obrigatório"}};
  const target=await db.findCharacterByName(name);
  if(!target)return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  if(Number(target.account_id)===Number(acc.id))
    return {code:400,body:{ok:false,msg:"Este personagem já é da sua conta"}};
  const friends=socialFriendsArray(acc);
  if(friends.some((f)=>Number(f.charId)===Number(target.id)))
    return {code:409,body:{ok:false,msg:"Já está na sua lista de amigos"}};
  friends.push({charId:Number(target.id),name:String(target.name),muted:false});
  await db.setAccountFriends(acc.id,friends);
  return {code:200,body:{ok:true}};
}
async function socialFriendRemove(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const charId=Number(body.friendCharId||body.friend_char_id||body.charId||0);
  const friends=socialFriendsArray(acc);
  const next=friends.filter((f)=>Number(f.charId)!==charId);
  if(next.length===friends.length)return {code:404,body:{ok:false,msg:"Amigo não encontrado"}};
  await db.setAccountFriends(acc.id,next);
  return {code:200,body:{ok:true}};
}
async function socialFriendMute(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const charId=Number(body.friendCharId||body.friend_char_id||body.charId||0);
  const friends=socialFriendsArray(acc);
  const entry=friends.find((f)=>Number(f.charId)===charId);
  if(!entry)return {code:404,body:{ok:false,msg:"Amigo não encontrado"}};
  entry.muted=body.muted===undefined?true:!!body.muted;
  await db.setAccountFriends(acc.id,friends);
  return {code:200,body:{ok:true,muted:entry.muted}};
}
/* Convite para o MEU lobby aberto (eu preciso ser o líder — regra já
 * existente nos controllers). */
async function socialLobbyInvite(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const name=String(body.name||"").trim();
  if(!name)return {code:400,body:{ok:false,msg:"Nome obrigatório"}};
  for(const [,ctrl] of socialLobbyControllers()){
    const lob=ctrl.getLobbyForAccount(Number(acc.id));
    if(lob&&lob.status==="open")return ctrl.invite(db,acc,name);
  }
  return {code:404,body:{ok:false,msg:"Você não está em um lobby aberto"}};
}
/* Entrar no lobby aberto do amigo (joinOpen — sem convite). */
async function socialLobbyJoin(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const charId=Number(body.charId||body.char_id||0);
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,msg:"Personagem inválido"}};
  const friendCharId=Number(body.friendCharId||body.friend_char_id||0);
  const friends=socialFriendsArray(acc);
  if(!friends.some((f)=>Number(f.charId)===friendCharId))
    return {code:403,body:{ok:false,msg:"Só é possível entrar no lobby de amigos"}};
  const friendChar=await db.findCharacter(friendCharId);
  if(!friendChar)return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  const hostAcc=Number(friendChar.account_id);
  for(const [,ctrl] of socialLobbyControllers()){
    const lob=ctrl.getLobbyForAccount(hostAcc);
    if(lob&&lob.status==="open")
      return ctrl.joinOpen(db,acc,hostAcc,character,{inTemple:!!body.inTemple,playerName:body.playerName});
  }
  return {code:404,body:{ok:false,msg:"Nenhum lobby aberto para este jogador"}};
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
  const member=await db.guildMemberByAccount(acc.id);
  const issued=CHAT_BUS.issueTicket(acc.id,body.token,viewerName,
    member?Number(member.guild_id):0);
  return {code:200,body:{ok:true,ticket:issued.ticket,
    expiresAt:new Date(issued.expiresAt).toISOString(),cursor:CHAT_BUS.cursor(),viewerName}};
}

async function chatHistory(db,token,query){
  const acc=await db.findAccountByToken(token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const channel=String(query.get("channel")||"geral").toLowerCase();
  let viewerGuildId=0;
  const gm=channel.match(/^guild:(\d+)$/);
  if(gm){
    const member=await db.guildMemberByAccount(acc.id);
    if(!member||Number(member.guild_id)!==Number(gm[1]))
      return {code:403,body:{ok:false,error:"NOT_GUILD_MEMBER",msg:"Este chat é exclusivo para membros da guild."}};
    viewerGuildId=Number(member.guild_id);
  }else if(!CHAT_CHANNELS.includes(channel))
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
    messages:CHAT_BUS.history(channel,sinceId,limit,viewerName,viewerGuildId),
    deleted:CHAT_BUS.deletedIds||[]}};
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
  /* Canal de guild "guild:<id>" — exclusivo a membros daquela guild;
   * líder/vice/membro recebem o rank na mensagem para o cliente colorir. */
  let guildMember=null,guildRow=null;
  const gm=channel.match(/^guild:(\d+)$/);
  if(gm){
    guildMember=await db.guildMemberByAccount(acc.id);
    if(!guildMember||Number(guildMember.guild_id)!==Number(gm[1]))
      return {code:403,body:{ok:false,error:"NOT_GUILD_MEMBER",msg:"Este chat é exclusivo para membros da guild."}};
    guildRow=await db.guildById(guildMember.guild_id);
    if(!guildRow)return {code:404,body:{ok:false,error:"GUILD_GONE",msg:"Guild não encontrada."}};
  }else{
    if(!CHAT_CHANNELS.includes(channel))
      return {code:400,body:{ok:false,error:"BAD_CHANNEL",msg:"Canal inválido"}};
    if(channel!=="geral")
      return {code:400,body:{ok:false,error:"CHANNEL_LOCKED",msg:"Este canal ainda não está aberto para mensagens."}};
  }
  const mute=CHAT_BUS.muteStatus(Number(acc.id));
  if(mute){
    const mins=Math.max(1,Math.ceil((mute.until-Date.now())/60000));
    return {code:403,body:{ok:false,error:"MUTED",
      msg:`Você está silenciado por mais ${mins} min.${mute.reason?" Motivo: "+mute.reason:""}`}};
  }
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
  const level=Math.max(1,Math.floor(Number(acc.level||character.level)||1));
  const voc=String(character.voc||"none");
  const msg=CHAT_BUS.post({
    channel,type,nickname:String(acc.display_name||character.name||"?"),voc,vocShort:vocShort(voc),
    level,accountId:Number(acc.id),charId:Number(character.id),text,toName,
    guildId:guildMember?Number(guildMember.guild_id):0,
    guildRank:guildMember?String(guildMember.rank||"member"):null,
    guildName:guildRow?String(guildRow.name||""):null,
    admin:acc.role==="admin",
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
  // Assets compartilhados do pacote (fora do diretório público do jogo).
  // URL /imagens/... é mapeada apenas para STATIC_IMAGES_DIR — o resto do
  // servidor continua restrito a STATIC_DIR.
  const imagePrefix = "/imagens/";
  const isSharedImage = relative.startsWith(imagePrefix);
  const staticRoot = isSharedImage ? STATIC_IMAGES_DIR : STATIC_DIR;
  const staticRelative = isSharedImage
    ? relative.slice(imagePrefix.length)
    : relative.replace(/^\/+/, "");
  const file = path.resolve(staticRoot, staticRelative);
  if (file !== staticRoot && !file.startsWith(staticRoot + path.sep)) {
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
    coinsNt:Math.max(0,Math.floor(Number(acc.coins_nt)||0)),
    displayName:String(acc.display_name||acc.login||""),
    level:Math.max(1,Math.floor(Number(acc.level)||1)),
    email:String(acc&&acc.email||""),
    emailVerified:!!(acc&&acc.email_verified),
    gold:Math.max(0,Math.floor(Number(acc.gold)||0)),
    vipUntil, vip:vipUntil>Date.now(),
    missions:acc.missions||{}, missionsDone:acc.missionsDone||{},
    tutorial:acc.tutorial||{},
    cosmetics:(acc.cosmetics&&typeof acc.cosmetics==="object"&&!Array.isArray(acc.cosmetics))?acc.cosmetics:{},
    /* Party automática: ordem dos chars da conta (1º = líder). */
    partyOrder:(()=>{const raw=acc&&acc.party_order;
      const arr=typeof raw==="string"?(function(){try{return JSON.parse(raw);}catch(e){return null;}})():raw;
      return Array.isArray(arr)?arr.map(Number).filter((n)=>n>0):[];})(),
  };
}
const ACCOUNT_WALLET_SYNC_TTL_MS=30000;
const accountWalletSyncAt=new Map();
async function ensureAccountWallet(db,acc){
  if(!acc)return acc;
  /* Guerra PvP: migrateAccountGold + accountWardrobe abrem transação FOR
   * UPDATE na row da conta a CADA request de tick (~200/s no roster) —
   * serializava o combate inteiro. São migrações one-time: roda no máximo
   * 1×/30s por conta; os campos que o tick precisa (gold/vip) já vêm na
   * leitura do token. */
  const last=Number(accountWalletSyncAt.get(acc.id))||0;
  if(Date.now()-last<ACCOUNT_WALLET_SYNC_TTL_MS)return acc;
  accountWalletSyncAt.set(acc.id,Date.now());
  if(accountWalletSyncAt.size>2048)accountWalletSyncAt.clear();
  if(typeof db.migrateAccountGold==="function"){
    const migrated=await db.migrateAccountGold(acc.id);
    if(migrated)Object.assign(acc,migrated);
  }
  if(typeof db.accountWardrobe==="function"){
    const wardrobe=await db.accountWardrobe(acc.id);
    if(wardrobe.ok)acc.cosmetics=wardrobe.cosmetics;
  }
  return acc;
}

async function ensureTestAccounts(db) {
  if (!TEST_SERVER) return;
  const vipYear=Date.now()+365*24*3600*1000;
  for (const credential of [
    { login:"1", password:"1", role:"admin" },
    { login:"2", password:"2", role:"user" },
  ]) {
    const hash = bcrypt.hashSync(credential.password, SALT_ROUNDS);
    const existing = await db.findAccountByLogin(credential.login);
    if (!existing) {
      const created=await db.createAccount(credential.login, hash, credential.role, 1000);
      if(typeof db.setAccountVipUntil==="function")await db.setAccountVipUntil(created.id,vipYear);
    } else if (typeof db.run === "function") {
      await db.run("UPDATE accounts SET password_hash = ?, role = ? WHERE id = ?", [hash, credential.role, existing.id]);
      if(typeof db.setAccountVipUntil==="function")await db.setAccountVipUntil(existing.id,vipYear);
      if(typeof db.migrateAccountGold==="function")await db.migrateAccountGold(existing.id);
    } else {
      existing.password_hash = hash;
      existing.role = credential.role;
      existing.coins = Math.max(1000, existing.coins || 0);
      existing.vip_until = Math.max(Number(existing.vip_until)||0, vipYear);
      db._save();
      if(typeof db.migrateAccountGold==="function")db.migrateAccountGold(existing.id);
    }
  }
  console.log("[test-server] contas liberadas: 1/1 (admin+VIP) e 2/2 (user+VIP); painel Admin só na conta 1");
}

/* ------------------------------ rotas ------------------------------ */

const DISPLAY_NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{2,23}$/;
async function register(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const email = String(body.email || "").trim().slice(0, 120);
  const displayName = String(body.displayName || body.name || "").trim().slice(0, 24);
  if (login.length < 1 || login.length > 32) return { code: 400, body: { ok: false, msg: "Login inválido (1-32 caracteres)" } };
  if (password.length < 1) return { code: 400, body: { ok: false, msg: "Senha obrigatória" } };
  if (email && !EMAIL_RE.test(email)) return { code: 400, body: { ok: false, msg: "E-mail inválido" } };
  // Nome público da conta (chat/ranking/perfil) — único e obrigatório.
  if (!DISPLAY_NAME_RE.test(displayName))
    return { code: 400, body: { ok: false, error: "BAD_DISPLAY_NAME",
      msg: "Nome da conta inválido (3-24 caracteres; comece com letra)" } };
  const exist = await db.findAccountByLogin(login);
  // Duplicidade é erro de formulário, não falha de transporte. Responder
  // 200 evita o falso "Failed to load resource" no console; `ok:false`
  // continua impedindo sobrescrever ou acessar a conta existente.
  if (exist) return { code: 200, body: { ok: false, error: "ACCOUNT_EXISTS",
    msg: "Conta já existe. Use a aba Entrar." } };
  if (typeof db.findAccountByDisplayName === "function") {
    const nameTaken = await db.findAccountByDisplayName(displayName);
    if (nameTaken) return { code: 200, body: { ok: false, error: "NAME_TAKEN",
      msg: "Nome da conta já está em uso." } };
  }
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const acc = await db.createAccount(login, hash, "user", 0, email, displayName);
  return { code: 201, body: { ok: true, id: acc.id, login: acc.login,
    displayName: acc.display_name, role: acc.role } };
}

function accountCharacterSummary(character, accGold) {
  let data = character && character.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (e) { data = {}; }
  }
  data = data && typeof data === "object" ? data : {};
  // O gold pertence à CONTA, não ao personagem individual. Quando o gold
  // da conta é fornecido, injeta no snapshot para evitar que saves antigos
  // (com gold individual pré-migração) sobrescrevam o saldo correto.
  if (accGold !== undefined && accGold !== null) {
    data.gold = Math.max(0, Math.floor(Number(accGold) || 0));
  }
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
/* Helper: retorna uma função de mapeamento de personagens que injeta
 * o gold da conta no snapshot (evita divergência individual vs conta). */
function charSummaryWithGold(acc) {
  const gold = Math.max(0, Math.floor(Number(acc && acc.gold) || 0));
  return (character) => accountCharacterSummary(character, gold);
}

async function login(db, body) {
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  let acc = await db.findAccountByLogin(login);
  if (!acc || !bcrypt.compareSync(password, acc.password_hash)) {
    return { code: 401, body: { ok: false, msg: "Login ou senha inválidos" } };
  }
  // Ban ativo bloqueia o login (until=null = suspensão por tempo indeterminado).
  if (typeof db.banActiveForAccount === "function") {
    const ban = await db.banActiveForAccount(acc.id);
    if (ban) return { code: 403, body: { ok: false, error: "ACCOUNT_BANNED",
      msg: "Conta suspensa" + (ban.until ? " até " + new Date(ban.until).toLocaleDateString("pt-BR")
        : " por tempo indeterminado") + (ban.reason ? ". Motivo: " + ban.reason : ""),
      ban: { until: ban.until, reason: ban.reason } } };
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
      characters: characters.map(charSummaryWithGold(acc)),
    },
  };
}

/* ---- LOGIN SOCIAL (OAuth) -------------------------------------------
 * oauthFinish: entrada única pós-callback — state diz o provider e se é
 * um vínculo em conta logada (?token= no /api/auth/*). Prioridade:
 *   1) conta logada (vínculo) → grava a identidade social nela
 *   2) conta já ligada a esta identidade (google.sub / twitch.id)
 *   3) Google com e-mail verificado que já existe como conta → vincula
 *      (Twitch NÃO vincula por e-mail — verificação não comprovada)
 *   4) nada encontrado → cria conta nova (senha aleatória — pode definir
 *      uma depois pela tela de recuperação se quiser login por senha)
 * Sempre grava o nó social, aplica a mesma regra de ban do login por
 * senha e devolve uma sessão nova do jogo. */
function oauthGenLogin(base) {
  const s = String(base || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 28);
  return s.length ? s : "player";
}
function oauthGenDisplay(base) {
  let s = String(base || "").replace(/[^A-Za-zÀ-ÿ0-9 .'-]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!/^[A-Za-zÀ-ÿ]/.test(s)) s = "Player " + s;
  if (s.length < 3) s = "Player " + (100 + Math.floor(Math.random() * 900));
  return s.slice(0, 24).trim();
}
async function oauthUniqueLogin(db, base) {
  const cand = oauthGenLogin(base);
  for (let i = 0; i < 50; i++) {
    const name = i ? (cand + i).slice(0, 32) : cand;
    if (!(await db.findAccountByLogin(name))) return name;
  }
  return (cand + Date.now().toString(36)).slice(0, 32);
}
async function oauthUniqueDisplay(db, base) {
  const cand = oauthGenDisplay(base);
  for (let i = 0; i < 50; i++) {
    const name = i ? (cand + " " + (i + 1)).slice(0, 24).trim() : cand;
    if (typeof db.findAccountByDisplayName !== "function" ||
        !(await db.findAccountByDisplayName(name))) return name;
  }
  return (cand.slice(0, 20) + " " + Math.floor(Math.random() * 90 + 10)).trim();
}
async function oauthFinish(db, st, provider, p) {
  let acc = null, linked = false, created = false;
  if (st && st.token) {
    acc = await db.findAccountByToken(st.token);
    if (acc) linked = true;
  }
  if (!acc && typeof db.findAccountBySocial === "function")
    acc = await db.findAccountBySocial(provider, p.key);
  if (!acc && provider === "google" && p.emailVerified && p.email &&
      typeof db.findAccountByEmail === "function")
    acc = await db.findAccountByEmail(p.email);
  if (!acc) {
    const seed = p.login || String(p.email || "").split("@")[0] || p.name || "player";
    const login = await oauthUniqueLogin(db, seed);
    const display = await oauthUniqueDisplay(db, p.name || seed);
    const hash = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), SALT_ROUNDS);
    acc = await db.createAccount(login, hash, "user", 0, p.email || "", display);
    created = true;
    if (p.emailVerified && typeof db.setAccountEmailVerified === "function")
      await db.setAccountEmailVerified(acc.id, true);
  }
  const social = twitch.socialOf(acc);
  if (provider === "google") {
    social.google = { sub: p.key, email: String(p.email || ""), at: Date.now() };
  } else if (provider === "twitch") {
    const prevFollows = social.twitch && social.twitch.follows;
    social.twitch = { id: p.key, login: String(p.login || ""),
      follows: Object.assign({}, prevFollows || {}), at: Date.now() };
    if (p.follows === true || p.follows === false)
      social.twitch.follows[twitch.requiredChannel()] = p.follows;
  }
  if (typeof db.setAccountSocial === "function") await db.setAccountSocial(acc.id, social);
  if (typeof db.banActiveForAccount === "function") {
    const ban = await db.banActiveForAccount(acc.id);
    if (ban) return { ban };
  }
  acc = await ensureAccountWallet(db, acc);
  const token = newToken();
  if (SYNC_BUS) SYNC_BUS.revokeAccount(acc.id);
  if (typeof db.createSession === "function")
    await db.createSession(acc.id, token, Date.now() + SESSION_TTL_MS);
  return { token, account: acc, created, linked };
}

async function me(db, token) {
  if (!token) return { code: 401, body: { ok: false, msg: "Sem token" } };
  let acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if (typeof db.banActiveForAccount === "function") {
    const ban = await db.banActiveForAccount(acc.id);
    if (ban) return { code: 403, body: { ok: false, error: "ACCOUNT_BANNED",
      msg: "Conta suspensa" + (ban.until ? " até " + new Date(ban.until).toLocaleDateString("pt-BR")
        : " por tempo indeterminado") + (ban.reason ? ". Motivo: " + ban.reason : ""),
      ban: { until: ban.until, reason: ban.reason } } };
  }
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
      characters: characters.map(charSummaryWithGold(acc)),
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
    wardrobe:{outfits:{},mounts:{}},
    config:payload.config&&typeof payload.config==="object"?payload.config:{},level:1,exp:0,
    skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:10},
    skillTries:{fist:0,sword:0,axe:0,club:0,dist:0,shield:0},ml:0,manaSpent:0,gold:0,
    kills:{},totalKills:0,bosses:{},missions:{},lootPouch:{},supplyStash:{},rewardChest:{},rewardChestBundles:[],bag:{},ammo:{},
    supplies:{"health-potion":20,"mana-potion":20},equip:{},stamina:15*3600,cap:5000};
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
  if (existingCharacters.length >= ACCOUNT_MAX_CHARS)
    return { code: 400, body: { ok: false, msg: `Limite de ${ACCOUNT_MAX_CHARS} personagens por conta.` } };
  const c = await db.createCharacter(acc.id, name, voc, 1, JSON.stringify(payload));
  payload.id=String(c.id);payload.name=c.name;payload.voc=voc;payload.level=1;
  const data=JSON.stringify(payload);
  const normalized=await db.updateCharacter(c.id,voc,1,data);
  // Bônus inicial é concedido pelo servidor uma única vez, no primeiro char.
  // O cliente nunca recebe permissão para fabricar saldo premium.
  if(!existingCharacters.length)await db.updateCoins(acc.id,(acc.coins||0)+25);
  /* PARTY AUTOMÁTICA — o sync normaliza a ordem (o novo char entra no
   * fim de accounts.party_order) e cria/converge a party da conta;
   * o 1º da ordem é o líder. */
  try{
    if(typeof party.partySyncAccount==="function")await party.partySyncAccount(db,acc.id);
  }catch(e){console.warn("[party] auto-sync pós-criação falhou:",e&&e.message);}
  const updatedAccount=await db.findAccountById(acc.id);
  const createdCharacter=normalized||Object.assign({},c,{data,save_version:1});
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",createdCharacter.id,
    createdCharacter.save_version,"created",createdCharacter,true);
  publishSync(acc.id,"character",{id:Number(createdCharacter.id),saveVersion:Number(createdCharacter.save_version),action:"created"});
  return { code: 201, body: { ok: true,
    character: accountCharacterSummary(createdCharacter, acc.gold),
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
    // Stamina é DA CONTA: materializa o tempo ocioso (0,5s/s) no pool e
    // persiste; o apply espelha o pool no personagem (todos compartilham).
    if (SharedInv && typeof db.accountSharedInventory === "function") {
      if (typeof db.accountSharedInventoryMutate === "function") {
        sharedInventory = await db.accountSharedInventoryMutate(acc.id, (s) => {
          SharedInv.regenSharedStamina(s, Date.now(), 0.5, parsed.stamina);
        });
      }
      if (!sharedInventory) {
        sharedInventory = await db.accountSharedInventory(acc.id);
        SharedInv.regenSharedStamina(sharedInventory, Date.now(), 0.5, parsed.stamina);
        if (typeof db.setAccountSharedInventory === "function")
          await db.setAccountSharedInventory(acc.id, sharedInventory);
      }
      SharedInv.applySharedToPlayer(parsed, sharedInventory);
      SharedInv.applyAccountMissionsToPlayer(parsed, acc);
      require("./wardrobe").applyToPlayer(parsed, acc);
    } else {
      // Fallback sem shared: stamina individual (legado).
      staminaRegenPlayer(parsed, Date.now(), 0.5);
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

// Identidade e progressão são server-owned. Saves comuns só persistem
// preferências/visual; XP, skills, gold, kills, bless e cooldowns vêm das
// transações autoritativas (ou das ferramentas Admin explícitas).
const PROTECTED_SAVE_KEYS=["exp","skills","skillTries","ml","manaSpent","gold","kills","totalKills",
  "bosses","missions","wardrobe","_accountCosmetics","lootPouch","supplyStash","rewardChest","rewardChestBundles","blessed","deathLog","trainingExercise","trainingClock","dailyRewardDay","quests","_pouchBase","_walletSynced"];
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
  if(wrongId||wrongName)return {code:409,body:{ok:false,error:"CHARACTER_IDENTITY_MISMATCH",
    msg:"Save bloqueado: os dados pertencem a outro personagem."}};
  let current={};try{current=typeof c.data==="string"?JSON.parse(c.data):(c.data||{});}catch(e){}
  const protectedKeys=PROTECTED_SAVE_KEYS;
  payload=Object.assign({},payload,{id:String(c.id),name:c.name});
  delete payload.trainingClock;
  let voc=c.voc,level=Math.max(1,Number(c.level)||1);
  if(opts.adminGrant){
    const allowed=["knight","paladin","druid","sorcerer","monk"];
    voc=allowed.includes(String(payload.voc))?String(payload.voc):c.voc;
    level=Math.max(1,Math.min(2000,Math.floor(Number(payload.level)||Number(body.level)||Number(c.level)||1)));
    payload.voc=voc;payload.level=level;
    /* Grant com payload parcial não pode apagar progresso: chave protegida
     * ausente mantém o valor do banco (o grant só sobrescreve o que envia). */
    for(const key of protectedKeys)
      if(payload[key]===undefined&&current[key]!==undefined)
        payload[key]=cloneJson(current[key]);
    for(const numKey of ["exp","ml","manaSpent","gold","totalKills","stamina"])
      if(payload[numKey]!==undefined)
        payload[numKey]=Math.max(0,Math.floor(Number(payload[numKey])||0));
  }else{
    payload.voc=c.voc;
    for(const key of protectedKeys){
      if(current[key]!==undefined)payload[key]=cloneJson(current[key]);
      else delete payload[key];
    }
    payload.level=level;
    // Escalares são SEMPRE número — blobs legados com valor {} (objeto)
    // sanitizam pra 0 em vez de propagar o tipo errado no data salvo.
    // ("kills" fica fora: é mapa slug→count legítimo.)
    for(const numKey of ["exp","ml","manaSpent","gold","totalKills","stamina"])
      if(payload[numKey]!==undefined)
        payload[numKey]=Math.max(0,Math.floor(Number(payload[numKey])||0));
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
async function applyAdminPlayerToInstance(db,acc,charId,player,lease,requesterAccountId){
  const resolved=await resolveInstanceRow(db,acc,charId);
  if(resolved.error)return {ok:false,http:resolved.error};
  const row=resolved.row;
  if(!row||row.status!=="active")return {ok:true,instance:null};
  const requester=Number(requesterAccountId)||acc.id;
  let last=null;
  for(let attempt=0;attempt<4;attempt++){
    const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
    if(!current||current.status!=="active")return {ok:true,instance:null};
    let synced=null;
    const result=await db.instancePatchState(current.account_id,requester,current.instance_id,Number(current.version),(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p)return null;
      const next=cloneJson(player)||{};
      next.id=String(charId);next.name=item.p.name||next.name||"";
      next.voc=String(next.voc||item.p.voc||"knight");
      next.level=Math.max(1,Math.floor(Number(next.level)||1));
      next.gold=Math.max(0,Math.floor(Number(next.gold)||0));
      /* Bag/itemInstances são DA CONTA: o grant troca só o item.p do alvo e
       * as cópias dos demais personagens ficam sem as instâncias novas. Na
       * próxima mutação de bag de OUTRO membro, syncInstancePouchCopies
       * tratava a cópia do executor como canônica e destruía as instâncias
       * concedidas — o item "sumia" da bag sem equipar (count órfão). O
       * alvo vira a fonte canônica já no patch: o delta propaga na hora. */
      const preGrant={pouch:Object.assign({},item.p.lootPouch||{}),
        bag:Object.assign({},item.p.bag||{})};
      item.p=next;
      synced=typeof syncInstancePouchCopies==="function"
        ?syncInstancePouchCopies(descriptor.authority.players,charId,preGrant):null;
      if(Array.isArray(descriptor.members)){
        const member=descriptor.members.find((entry)=>String(entry&&entry.id)===String(charId));
        if(member){member.p=cloneJson(next);member.hp=next.hp;member.mp=next.mp;}
      }
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    last=result;
    if(result.ok){
      if(synced){try{await persistSharedPouchSync(db,acc,synced);}catch(e){}}
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
  // Presets do Helper são preferências do cliente: a autoridade só os recebe
  // via tick. Um save entre a criação do preset e o próximo tick regravaria a
  // lista antiga do snapshot — preserva a versão enviada no payload.
  let sentPrefs=null;try{sentPrefs=JSON.parse(prepared.save.data);}catch(e){sentPrefs=null;}
  if(sentPrefs&&typeof sentPrefs==="object"&&!Array.isArray(sentPrefs)){
    if(sentPrefs.helperPresets!==undefined)player.helperPresets=sanitizeHelperPresets(sentPrefs.helperPresets);
    if(sentPrefs.helperActivePreset!==undefined)
      player.helperActivePreset=sentPrefs.helperActivePreset?String(sentPrefs.helperActivePreset).slice(0,64):null;
    /* Wheel: preferência do cliente — preserva a versão enviada (sanitizada
     * no engine) para o snapshot da instância não apagar a roda nova. */
    if(sentPrefs.wheel!==undefined&&typeof sanitizeWheelState==="function"){
      const w=sanitizeWheelState(sentPrefs.wheel,player);if(w)player.wheel=w;
    }
    /* Imbuements idem: o apply é client-side — sem preservar a versão
     * enviada, um save antes do próximo tick regrava a lista antiga. */
    if(sentPrefs.imbuements!==undefined&&typeof sanitizeImbuementState==="function"){
      const im=sanitizeImbuementState(sentPrefs.imbuements);if(im)player.imbuements=im;
    }
    /* p da instância pode estar intermediário (grant parcial, snapshot
     * legado): chave protegida ausente no player mantém o valor que o save
     * trouxe (restaurado do banco no prepare). Nunca remove progresso. */
    for(const key of PROTECTED_SAVE_KEYS)
      if(player[key]===undefined&&sentPrefs[key]!==undefined)
        player[key]=cloneJson(sentPrefs[key]);
  }
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
/* Remove do shared VIVO só o que um claim tirou do chest (nunca sobrescreve
 * o baú com a cópia do personagem: um bundle entregue por outra extração
 * concorrente não pode ser derrubado). removeBundleIds = pacotes que o
 * claim esvaziou e eliminou no descritor. */
function chestRemovalApply(shared, removal) {
  if (!shared || !removal) return;
  shared.rewardChest = shared.rewardChest && typeof shared.rewardChest === "object" &&
    !Array.isArray(shared.rewardChest) ? shared.rewardChest : {};
  for (const slug of Object.keys(removal.items || {})) {
    const n = Math.max(0, (Number(shared.rewardChest[slug]) || 0) - (Number(removal.items[slug]) || 0));
    if (n > 0) shared.rewardChest[slug] = n; else delete shared.rewardChest[slug];
  }
  const bundles = Array.isArray(shared.rewardChestBundles) ? shared.rewardChestBundles : [];
  for (const b of bundles) {
    const rid = b && (b.id || b.bundleId);
    const items = rid != null && removal.bundles ? removal.bundles[String(rid)] : null;
    if (!items || !b.items) continue;
    for (const slug of Object.keys(items)) {
      const n = Math.max(0, (Number(b.items[slug]) || 0) - (Number(items[slug]) || 0));
      if (n > 0) b.items[slug] = n; else delete b.items[slug];
    }
  }
  const dropIds = new Set((removal.removeBundleIds || []).map(String));
  for (let i = bundles.length - 1; i >= 0; i--) {
    const b = bundles[i], rid = b && (b.id || b.bundleId);
    if (rid != null && dropIds.has(String(rid))) bundles.splice(i, 1);
  }
  shared.rewardChestBundles = bundles;
}

/* Diff do chest pré→pós-claim (itens removidos por slug e por bundle +
 * ids de pacotes eliminados) — aplicado no shared VIVO pela tx atômica. */
function chestRemovalDiff(preChest, preBundles, postChest, postBundles) {
  const items = {}, bundles = {}, removeBundleIds = [];
  for (const slug of Object.keys(preChest || {})) {
    const removed = (Number(preChest[slug]) || 0) - (Number((postChest || {})[slug]) || 0);
    if (removed > 0) items[slug] = removed;
  }
  const postIds = new Set((postBundles || []).map((b) => String(b && (b.id || b.bundleId))));
  for (const pb of preBundles || []) {
    const rid = pb && (pb.id || pb.bundleId); if (rid == null) continue;
    const post = (postBundles || []).find((b) => String(b && (b.id || b.bundleId)) === String(rid));
    if (!post) { removeBundleIds.push(String(rid)); continue; }
    const bitems = {};
    for (const slug of Object.keys(pb.items || {})) {
      const removed = (Number(pb.items[slug]) || 0) - (Number((post.items || {})[slug]) || 0);
      if (removed > 0) bitems[slug] = removed;
    }
    if (Object.keys(bitems).length) bundles[String(rid)] = bitems;
  }
  return { items, bundles, removeBundleIds };
}

async function splitSharedInventory(db, acc, p, authoritative, opts) {
  if (!SharedInv || typeof db.accountSharedInventory !== "function") return null;
  const removal = opts && opts.chestRemoval || null;
  const doSplit = (shared) => {
    /* rewardChest é SEMPRE server-owned (muda só via /api/reward/claim e o
     * merge terminal): preserva o do shared VIVO nos DOIS caminhos — a cópia
     * do personagem pode estar atrasada e "ressuscitar" o baú coletado. */
    const keep = {
      lootPouch: Object.assign({}, shared.lootPouch),
      supplyStash: Object.assign({}, shared.supplyStash),
      rewardChest: Object.assign({}, shared.rewardChest),
      rewardChestBundles: shared.rewardChestBundles.slice(),
    };
    const mergedPouch = authoritative && SharedInv.pouchDelta
      ? SharedInv.pouchDelta(keep.lootPouch, p) : null;
    SharedInv.extractSharedFromPlayer(p, shared);
    shared.lootPouch = authoritative && mergedPouch ? mergedPouch
      : authoritative ? shared.lootPouch : keep.lootPouch;
    if (!authoritative) shared.supplyStash = keep.supplyStash;
    shared.rewardChest = keep.rewardChest;
    shared.rewardChestBundles = keep.rewardChestBundles;
    if (removal) chestRemovalApply(shared, removal);
    // Stamina da conta: a extração gravou o espelho (com guarda de carimbo);
    // materializa a cauda ociosa até agora e espelha o pool de volta no save.
    SharedInv.regenSharedStamina(shared, Date.now(), 0.5, p.stamina);
  };
  /* A mutação roda dentro de SELECT FOR UPDATE + UPDATE na mesma tx —
   * sem isso o read-modify-write solto era last-writer-wins contra o write
   * do tick: o blob velho sobrescrevia o claim (reward "voltava") ou o
   * sync do equip (item sumia). */
  let shared = null;
  if (typeof db.accountSharedInventoryMutate === "function") {
    shared = await db.accountSharedInventoryMutate(acc.id, doSplit);
    if (!shared) return null;
  } else {
    shared = await db.accountSharedInventory(acc.id);
    doSplit(shared);
    if (typeof db.setAccountSharedInventory === "function")
      await db.setAccountSharedInventory(acc.id, shared);
  }
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
  /* Gold é WALLET da conta: hidrata com acc.gold e marca _walletSynced —
   * persistClaimedPlayer grava o saldo resultante em accounts.gold. Sem
   * isto a venda na cidade creditava só o espelho data.gold e o dinheiro
   * sumia no próximo load (que reinjeta acc.gold). */
  p.gold = Math.max(0, Math.floor(Number(acc.gold) || 0));
  p._walletSynced = 1;
  if (SharedInv && typeof db.accountSharedInventory === "function") {
    try {
      // Stamina da conta: tempo ocioso (0,5s/s) materializado no pool; o
      // apply espelha — todos os personagens veem o mesmo saldo. A gravação
      // é atômica (FOR UPDATE) — o write solto do blob inteiro clobberava
      // claims/equips concorrentes (reward "voltava", item sumia).
      let shared = null;
      if (typeof db.accountSharedInventoryMutate === "function") {
        shared = await db.accountSharedInventoryMutate(acc.id, (s) => {
          SharedInv.regenSharedStamina(s, Date.now(), 0.5, p.stamina);
        });
      }
      if (!shared) {
        shared = await db.accountSharedInventory(acc.id);
        SharedInv.regenSharedStamina(shared, Date.now(), 0.5, p.stamina);
        if (typeof db.setAccountSharedInventory === "function")
          await db.setAccountSharedInventory(acc.id, shared);
      }
      SharedInv.applySharedToPlayer(p, shared);
      SharedInv.applyAccountMissionsToPlayer(p, acc);
      require("./wardrobe").applyToPlayer(p, acc);
    } catch (e) { /* shared opcional */ }
  } else {
    // Fallback sem shared: stamina individual (legado).
    staminaRegenPlayer(p, Date.now(), 0.5);
  }
  return p;
}

function saveConflictResponse(result,acc){
  if(result.error==="SAVE_VERSION_CONFLICT")return {code:409,body:{ok:false,error:result.error,
    msg:"O save foi alterado por outra sessão.",characters:(result.characters||[]).map(acc?charSummaryWithGold(acc):accountCharacterSummary)}};
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
  // Stamina compartilhada: a reconciliação (espelho do save → pool, com
  // guarda de carimbo e cauda ociosa 0,5s/s) acontece em
  // splitSharedInventory. Sem shared, cai no regen individual legado.
  try{if(!(SharedInv&&typeof db.accountSharedInventory==="function")){
    const _st=JSON.parse(prepared.save.data);staminaRegenPlayer(_st,Date.now(),0.5);prepared.save.data=JSON.stringify(_st);}}catch(e){}
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
  if(!result.ok)return saveConflictResponse(result,acc);
  const updated=result.characters[0];
  // Level/exp da CONTA: o save do char atualiza o progresso compartilhado
  // (só avança — um save de char mais novo nunca regride a conta).
  try{
    if(typeof db.setAccountLevelExp==="function"){
      const d=typeof updated.data==="string"?JSON.parse(updated.data):(updated.data||{});
      await db.setAccountLevelExp(acc.id,updated.level,d.exp);
    }
  }catch(e){}
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,
    adminGrant?"admin-grant":"save",updated,!!adminGrant);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),
    source:adminGrant?"admin-grant":"save"});
  await publishPartyForCharacters(db,[updated.id],adminGrant?"admin-grant":"character-save");
  const account=await ensureAccountWallet(db,acc);
  return {code:200,body:{ok:true,saveVersion:Number(updated.save_version),
    character:accountCharacterSummary(updated,account.gold),account:accountPublicView(account),
    instance:patchedInstance?instanceSummary(patchedInstance,false):null,
    ...(sharedInventory?{sharedInventory}:{})}};
}

/* Cache quente compartilhado (PvP/World Boss): o descritor vivo em memória
 * é a autoridade — usado por instanceAuthorityTick (avanço) e pelo caminho
 * quente de instancePatchState (mutações sem blob/row-lock). */
function instanceHotAuthApi(){
  return {persistMs:PVP_AUTH_PERSIST_MS,drop:pvpAuthCacheDrop,
    // Peek sem semear: instancePatchState só usa o caminho quente quando a
    // instância JÁ é quente (world boss/pvp são semeados no create/1º tick).
    peek:(row)=>pvpAuthCacheGet(row&&row.instance_id),
    get:async(row,conn)=>{
      let hot=pvpAuthCacheGet(row.instance_id);
      if(hot&&Number(hot.rowVersion)===Number(row.version))return hot;
      // Miss ou drift (escrita externa — patch/encerramento): recarrega.
      const [s]=await conn.query("SELECT state FROM account_instances WHERE account_id=?",[Number(row.account_id)]);
      const ser=s[0]?s[0].state:null;
      if(ser==null)return hot;
      let descriptor=typeof ser==="string"?JSON.parse(ser):ser;
      // Blob thin (persist sem members[].p/state.players[].p): reconstrói
      // os derivados a partir de authority.players antes de servir.
      if(pvpDescriptorThin(descriptor))descriptor=materializeAuthority(descriptor);
      hot={descriptor,rowVersion:Number(row.version),savedAt:Date.now()};
      pvpAuthCacheSet(row.instance_id,hot);
      return hot;
    }};
}
/* Blob persistido thin (ver persist quente em db.js): authority.players
 * tem o p canônico; members[].p e state.players[].p vêm null e são
 * regenerados por materializeAuthority. */
function pvpDescriptorThin(d){
  return !!(d&&typeof d==="object"&&d.authority&&d.authority.pvpBattle&&
    Array.isArray(d.members)&&d.members.some((m)=>m&&!m.p));
}
function instancePatchHotOpts(resolved){
  return (resolved&&(resolved.pvp||resolved.worldBoss))?{hotAuth:instanceHotAuthApi()}:null;
}

const TRAINING_STORE={exercise:{charges:14470,gold:10000000,tc:0,bonus:1.25},lasting:{charges:20000,gold:0,tc:150,bonus:1.5}};
async function buyTrainingPlan(db,body){
  let acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const plan=TRAINING_STORE[String(body.plan||"")];if(!plan)return {code:400,body:{ok:false,msg:"Modalidade inválida"}};
  const character=await db.findCharacter(Number(body.char_id));if(!character||Number(character.account_id)!==Number(acc.id))return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  const expected=Number(body.expected_version);if(!Number.isSafeInteger(expected)||expected<0)return {code:428,body:{ok:false,msg:"Atualize o personagem antes da compra"}};
  acc=await ensureAccountWallet(db,acc);const gold=Math.max(0,Math.floor(Number(acc.gold)||0)),coins=Math.max(0,Math.floor(Number(acc.coins)||0));
  if(plan.gold&&gold<plan.gold)return {code:409,body:{ok:false,msg:"Gold insuficiente"}};
  if(plan.tc&&coins<plan.tc)return {code:409,body:{ok:false,msg:"Tibia Coins insuficientes"}};
  let p={};try{p=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
  const prior=p.trainingExercise&&typeof p.trainingExercise==="object"?p.trainingExercise:{};
  const balances=prior.balances&&typeof prior.balances==="object"?prior.balances:{};
  if(prior.plan&&prior.plan!=="free"&&prior.charges!=null&&balances[prior.plan]==null)balances[prior.plan]=prior.charges;
  balances.exercise=Math.max(0,Math.floor(Number(balances.exercise)||0));
  balances.lasting=Math.max(0,Math.floor(Number(balances.lasting)||0));
  balances[String(body.plan)]+=plan.charges;
  p.trainingExercise={skill:["sword","axe","club","dist","magic","shield","fist"].includes(prior.skill)?prior.skill:"sword",activePlan:String(body.plan),balances,active:true};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const result=await db.saveCharactersVersioned(acc.id,[{id:Number(character.id),expectedVersion:expected,voc:character.voc,level:Math.max(1,Number(character.level)||1),data:JSON.stringify(p),extra:{hp:Number(p.hp)||0,mp:Number(p.mp)||0}}],lease);
  if(!result.ok)return saveConflictResponse(result,acc);
  if(plan.gold&&typeof db.setAccountGold==="function")await db.setAccountGold(acc.id,gold-plan.gold);
  if(plan.tc)await db.updateCoins(acc.id,coins-plan.tc);
  const updated=result.characters[0],fresh=await ensureAccountWallet(db,await db.findAccountById(acc.id));
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),source:"training-purchase"});
  return {code:200,body:{ok:true,msg:`${plan.charges} cargas adquiridas.`,trainingExercise:p.trainingExercise,character:accountCharacterSummary(updated,fresh.gold),account:accountPublicView(fresh)}};
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

async function buyYanaPackage(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),expected=Number(body.expected_version);
  if(!Number.isSafeInteger(charId)||charId<=0||!Number.isSafeInteger(expected)||expected<1||typeof body.offer_id!=="string")
    return {code:400,body:{ok:false,error:"YANA_INVALID_PURCHASE",msg:"Compra inválida."}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  if(Number(character.save_version)!==expected)
    return {code:409,body:{ok:false,error:"SAVE_CONFLICT",msg:"Save alterado em outra sessão.",characters:[accountCharacterSummary(character,acc.gold)]}};
  const active=await resolveInstanceRow(db,acc,charId);
  if(active.error)return active.error;
  if(active.row&&active.row.status==="active")
    return {code:409,body:{ok:false,error:"YANA_IN_INSTANCE",msg:"Yana só atende no templo."}};
  const p=await loadCityPlayer(db,acc,character);
  const purchase=applyYanaPurchase(p,body.offer_id);
  if(!purchase.ok)return {code:400,body:purchase};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,offerId:purchase.offer.id,
    goldTokens:purchase.goldTokens,lootPouch:p.lootPouch||{},bag:p.bag||{}})};
}

/* Fusão da Exaltation Forge — autoritativa no SERVIDOR. O client antigo
 * fundia no espelho local e salvava assíncrono: um sync do shared_inventory
 * chegando no intervalo sobrescrevia p.itemInstances com a cópia velha — o
 * tier sumia do item, o parceiro voltava e o consumo (gold/Dust/Core)
 * revertia. Só na cidade (mesmo padrão da Yana): a cópia de instância
 * diverge do shared até o merge do fim da luta. */
async function forgeFuseApi(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),expected=Number(body.expected_version);
  const instId=String(body.inst_id||"");
  if(!Number.isSafeInteger(charId)||charId<=0||!Number.isSafeInteger(expected)||expected<1||!instId)
    return {code:400,body:{ok:false,error:"FORGE_INVALID_FUSION",msg:"Fusão inválida."}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  if(Number(character.save_version)!==expected)
    return {code:409,body:{ok:false,error:"SAVE_CONFLICT",msg:"Save alterado em outra sessão.",characters:[accountCharacterSummary(character,acc.gold)]}};
  const active=await resolveInstanceRow(db,acc,charId);
  if(active.error)return active.error;
  if(active.row&&active.row.status==="active")
    return {code:409,body:{ok:false,error:"FORGE_IN_INSTANCE",msg:"A Exaltation Forge só funciona na cidade."}};
  const p=await loadCityPlayer(db,acc,character);
  const result=forgeFuseAuth(p,instId,!!body.use_core,ITEMS);
  if(!result.ok)return {code:400,body:Object.assign({error:"FORGE_FUSION_DENIED"},result)};
  /* O parceiro saiu do itemInstances sem recalcular o espelho — recria o
   * invariante bag[slug] = nº de instâncias (mesmo padrão do pouch move). */
  authSyncBagCountsFromInstances(p);
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    success:!!result.success,tier:result.tier,slug:result.slug,msg:result.msg,
    gold:p.gold,dust:p.dust,slivers:p.slivers,exaltedCores:p.exaltedCores,
    bag:p.bag||{},itemInstances:p.itemInstances||[]})};
}

/* Wallet da conta: quando o player veio de loadCityPlayer (flag
 * _walletSynced), o p.gold final É o saldo da conta — grava antes de
 * persistir. Players vindos da instância não carregam a flag: o wallet
 * deles já é propagado pelo tick (wallets→accounts.gold). */
async function syncCityWallet(db,acc,p){
  if(!p||p._walletSynced!==1)return;
  delete p._walletSynced;
  if(typeof db.setAccountGold==="function")
    await db.setAccountGold(acc.id,Math.max(0,Math.floor(Number(p.gold)||0)));
}
async function persistClaimedPlayer(db,acc,character,p,lease,claimedCount,sharedOps){
  await syncCityWallet(db,acc,p);

  const result=await db.saveCharactersVersioned(acc.id,[{
    id:Number(character.id),expectedVersion:Number(character.save_version),voc:character.voc,
    level:Math.max(1,Number(p.level)||Number(character.level)||1),data:JSON.stringify(p),
    extra:{hp:Math.max(0,Number(p.hp)||0),mp:Math.max(0,Number(p.mp)||0)},
  }],lease);
  if(!result.ok)return saveConflictResponse(result,acc);
  let sharedInventory=null;
  if(SharedInv&&typeof db.accountSharedInventory==="function")
    sharedInventory=await splitSharedInventory(db,acc,p,true,sharedOps);
  const updated=result.characters[0];
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,"reward-claim",updated,false);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),source:"reward-claim"});
  await publishPartyForCharacters(db,[updated.id],"reward-claim");
  rewardChestEnsure(p);
  return {code:200,body:{ok:true,claimed:true,claimedCount:Number(claimedCount)||0,saveVersion:Number(updated.save_version),
    character:accountCharacterSummary(updated,acc.gold),rewardChest:p.rewardChest||{},
    rewardChestBundles:p.rewardChestBundles||[],lootPouch:p.lootPouch||{},supplyStash:p.supplyStash||{},
    ...(sharedInventory?{sharedInventory}:{})}};
}

/* Promoção do King Tibianus — autoritativa no SERVIDOR. O client antigo só
 * mutava o objeto local (promoted=true): para personagem não-ativo a flag
 * sumia no próximo refresh do cache, e para o ativo o tick da instância
 * sobrescrevia com promoted=false — a promoção "não pegava" e o botão
 * voltava habilitado (dava para pagar de novo). */
const PROMOTION_PRICE=20000,PROMOTION_LEVEL=20;
function applyCharacterPromotion(p,goldSource){
  if(!p||typeof p!=="object")return {ok:false,code:400,error:"PROMOTION_INVALID",msg:"Personagem inválido"};
  if(p.promoted)return {ok:false,code:409,error:"ALREADY_PROMOTED",msg:"Personagem já promovido"};
  if((Number(p.level)||0)<PROMOTION_LEVEL)
    return {ok:false,code:400,error:"PROMOTION_LEVEL",msg:"Requer nível "+PROMOTION_LEVEL};
  /* Gold é o WALLET DA CONTA: na cidade a fonte é acc.gold (o gold do save
   * do char é só espelho — ver loadCharacter); na instância item.p.gold já
   * é o getter do wallet. Sem isso a promoção cobrava do espelho stale e o
   * jogador pagava com gold que não existe (ou era bloqueado à toa). */
  const gold=arguments.length>1?Math.max(0,Math.floor(Number(goldSource)||0))
    :Math.max(0,Math.floor(Number(p.gold)||0));
  if(gold<PROMOTION_PRICE)
    return {ok:false,code:400,error:"PROMOTION_GOLD",msg:"Requer "+PROMOTION_PRICE+" gp"};
  p.gold=gold-PROMOTION_PRICE;
  p.promoted=true;
  p.promotedAt=Date.now();
  return {ok:true};
}
async function persistPromotedPlayer(db,acc,character,p,lease){
  await syncCityWallet(db,acc,p);
  let sharedInventory=null;
  if(SharedInv&&typeof db.accountSharedInventory==="function")
    sharedInventory=await splitSharedInventory(db,acc,p,true);
  const result=await db.saveCharactersVersioned(acc.id,[{
    id:Number(character.id),expectedVersion:Number(character.save_version),voc:character.voc,
    level:Math.max(1,Number(p.level)||Number(character.level)||1),data:JSON.stringify(p),
    extra:{hp:Math.max(0,Number(p.hp)||0),mp:Math.max(0,Number(p.mp)||0)},
  }],lease);
  if(!result.ok)return saveConflictResponse(result,acc);
  const updated=result.characters[0];
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(acc.id,"character",updated.id,updated.save_version,"promote",updated,false);
  publishSync(acc.id,"character",{id:Number(updated.id),saveVersion:Number(updated.save_version),source:"promote"});
  await publishPartyForCharacters(db,[updated.id],"promote");
  return {code:200,body:{ok:true,promoted:true,saveVersion:Number(updated.save_version),
    character:accountCharacterSummary(updated,acc.gold),
    ...(sharedInventory?{sharedInventory}:{})}};
}
async function promoteCharacterApi(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id!==undefined?body.char_id:body.id);
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"INVALID_PROMOTION",msg:"Personagem inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);
  if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    // Personagem em instância ativa: promove DENTRO do snapshot autoritativo
    // (senão o próximo tick sobrescreve com promoted=false).
    let last=null;
    for(let attempt=0;attempt<4;attempt++){
      const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
      if(!current||current.status!=="active")break;
      let check=null,promotedPlayer=null;
      const result=await db.instancePatchState(current.account_id,acc.id,current.instance_id,Number(current.version),(serialized)=>{
        let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
        const item=descriptor.authority&&descriptor.authority.players&&
          descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
        if(!item||!item.p)return null;
        const r=applyCharacterPromotion(item.p);
        if(!r.ok){check=r;return null;}
        promotedPlayer=cloneJson(item.p);
        descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
      },lease);
      last=result;
      if(check)return {code:check.code,body:{ok:false,error:check.error,msg:check.msg}};
      if(result.ok){
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
          status:result.instance.status,source:"promote",holderId:String(body.holder_id||"")});
        const fresh=await db.findCharacter(charId);
        return persistPromotedPlayer(db,acc,fresh||character,promotedPlayer,lease);
      }
      if(result.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:result.error,msg:"Controle transferido durante a promoção"}};
      if(result.error!=="INSTANCE_VERSION_CONFLICT")break;
    }
    if(last&&last.error==="INSTANCE_NOT_ACTIVE"){/* cai no save do personagem */}
    else if(last&&!last.ok)
      return {code:409,body:{ok:false,error:last.error,msg:"Não foi possível promover",
        instance:instanceSummary(last.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  const walletGold=Math.max(0,Math.floor(Number(acc.gold)||0));
  const applied=applyCharacterPromotion(p,walletGold);
  if(!applied.ok)return {code:applied.code,body:{ok:false,error:applied.error,msg:applied.msg}};
  /* Cidade: debita o WALLET da conta direto (o sync do gold só roda no tick
   * de instância — sem isso o espelho do save não voltava pra acc.gold). */
  if(typeof db.setAccountGold==="function")
    await db.setAccountGold(acc.id,Math.max(0,walletGold-PROMOTION_PRICE));
  return persistPromotedPlayer(db,acc,character,p,lease);
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
  let claimedCount=0,chestRemoval=null;
  if(row&&row.status==="active"){
    const hotOpts=instancePatchHotOpts(resolved);
    let last=null;
    for(let attempt=0;attempt<4;attempt++){
      const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
      if(!current||current.status!=="active")break;
      let claimedPlayer=null,removal=null;
      const result=await db.instancePatchState(current.account_id,acc.id,current.instance_id,Number(current.version),(serialized)=>{
        let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
        const item=descriptor.authority&&descriptor.authority.players&&
          descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
        if(!item||!item.p)return null;
        rewardChestEnsure(item.p);
        const preChest=Object.assign({},item.p.rewardChest);
        const preBundles=(item.p.rewardChestBundles||[]).map((b)=>({id:b&&(b.id||b.bundleId),items:Object.assign({},(b&&b.items)||{})}));
        claimedCount=applyRewardChestClaim(item.p,body);
        claimedPlayer=cloneJson(item.p);
        removal=chestRemovalDiff(preChest,preBundles,item.p.rewardChest,item.p.rewardChestBundles);
        /* Rebase da pouch no descriptor: o delta do claim já é extraído por
         * persistClaimedPlayer (clone acima, com a baseline antiga). Sem o
         * rebase, o split terminal/dirty via pouchDelta somava o MESMO delta
         * de novo — cada claim dentro de instância duplicava os itens. A
         * pouch é ref compartilhada entre membros da conta
         * (shareInstanceContainers): rebaseia todos que apontam para ela.
         * rewardChest/bundles também são refs por conta: re-unifica com a
         * cópia CANÔNICA clameada — uma cópia divergente ressuscitava o baú
         * no shareInstanceContainers (merge por máximo). */
        for(const entry of (descriptor.authority&&descriptor.authority.players)||[]){
          if(!entry||!entry.p)continue;
          if(Number(entry.accountId||(entry.p&&entry.p.accountId)||0)===Number(acc.id)&&entry!==item){
            entry.p.rewardChest=item.p.rewardChest;
            entry.p.rewardChestBundles=item.p.rewardChestBundles;
          }
          if(entry.p.lootPouch===item.p.lootPouch)
            entry.p._pouchBase=Object.assign({},entry.p.lootPouch||{});
        }
        descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
      },lease,hotOpts);
      last=result;
      if(result.ok){
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
          status:result.instance.status,source:"reward-claim",holderId:String(body.holder_id||"")});
        const fresh=await db.findCharacter(charId);
        return persistClaimedPlayer(db,acc,fresh||character,claimedPlayer,lease,claimedCount,{chestRemoval:removal});
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
  rewardChestEnsure(p);
  const cityPreChest=Object.assign({},p.rewardChest);
  const cityPreBundles=(p.rewardChestBundles||[]).map((b)=>({id:b&&(b.id||b.bundleId),items:Object.assign({},(b&&b.items)||{})}));
  claimedCount=applyRewardChestClaim(p,body);
  chestRemoval=chestRemovalDiff(cityPreChest,cityPreBundles,p.rewardChest,p.rewardChestBundles);
  return persistClaimedPlayer(db,acc,character,p,lease,claimedCount,{chestRemoval});
}

async function getDailyReward(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const charId=Number(body.char_id);
  if(!Number.isSafeInteger(charId)||charId<=0)return {code:400,body:{ok:false,msg:"Personagem inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  let p={};try{p=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
  return {code:200,body:Object.assign({ok:true},dailyRewardInfo(p))};
}

/* Server save diário: coleta das 3000 cargas de Exercise Weapon. Segue o
 * fluxo do reward chest — instância ativa recebe patch autoritativo; char
 * no templo persiste direto. Não acumula: claimedDay vs rewardDay. */
async function claimDailyExerciseReward(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id!==undefined?body.char_id:body.id);
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"INVALID_REWARD_CLAIM",msg:"Personagem inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const weaponId=String(body.weapon||"");
  if(!EXERCISE_REWARD_WEAPONS[weaponId])
    return {code:400,body:{ok:false,error:"INVALID_EXERCISE_WEAPON",msg:"Arma de treino inválida."}};
  let preData={};try{preData=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
  const preInfo=dailyRewardInfo(preData);
  if(!preInfo.available)return {code:409,body:{ok:false,error:"DAILY_REWARD_ALREADY_CLAIMED",
    msg:"Recompensa já coletada neste ciclo.",dailyReward:preInfo}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);
  if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    let last=null;
    for(let attempt=0;attempt<4;attempt++){
      const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
      if(!current||current.status!=="active")break;
      let claimedPlayer=null,applied=null;
      const result=await db.instancePatchState(current.account_id,acc.id,current.instance_id,Number(current.version),(serialized)=>{
        let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
        const item=descriptor.authority&&descriptor.authority.players&&
          descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
        if(!item||!item.p)return null;
        applied=applyDailyExerciseReward(item.p,weaponId);
        if(applied.error)return null;
        claimedPlayer=cloneJson(item.p);
        descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
      },lease);
      last=result;
      if(applied&&applied.error)return applied.error;
      if(result.ok){
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
          status:result.instance.status,source:"daily-reward",holderId:String(body.holder_id||"")});
        const fresh=await db.findCharacter(charId);
        const persisted=await persistClaimedPlayer(db,acc,fresh||character,claimedPlayer,lease);
        if(persisted.code!==200)return persisted;
        persisted.body.trainingExercise=claimedPlayer.trainingExercise;
        persisted.body.dailyReward=dailyRewardInfo(claimedPlayer);
        persisted.body.msg=`+${DAILY_EXERCISE_CHARGES} cargas de Lasting Exercise Weapon coletadas.`;
        return persisted;
      }
      if(result.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:result.error,msg:"Controle transferido durante a coleta"}};
      if(result.error!=="INSTANCE_VERSION_CONFLICT")break;
    }
    if(last&&last.error==="INSTANCE_NOT_ACTIVE"){/* cai no save do personagem */}
    else if(last&&!last.ok)
      return {code:409,body:{ok:false,error:last.error,msg:"Não foi possível coletar a recompensa",
        instance:instanceSummary(last.instance,true)}};
  }
  let p=await loadCityPlayer(db,acc,character);
  const applied=applyDailyExerciseReward(p,weaponId);
  if(applied.error)return applied.error;
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  persisted.body.trainingExercise=p.trainingExercise;
  persisted.body.dailyReward=dailyRewardInfo(p);
  persisted.body.msg=`+${DAILY_EXERCISE_CHARGES} cargas de Lasting Exercise Weapon coletadas.`;
  return persisted;
}

/* Configuração de treino por personagem — skill + modalidade de qualquer
 * char da conta sem trocar o ativo. Mesma autoridade do buyTrainingPlan:
 * lease + expected_version; instância ativa recebe patch no snapshot. */
const TRAINING_CONFIG_SKILLS=["sword","axe","club","dist","magic","shield","fist"];
function applyTrainingConfig(p,skill,planId){
  if(TRAINING_CONFIG_SKILLS.indexOf(skill)<0)
    return {code:400,body:{ok:false,error:"TRAINING_INVALID_SKILL",msg:"Skill de treino inválido."}};
  if(planId!=="free"&&!TRAINING_STORE[planId])
    return {code:400,body:{ok:false,error:"TRAINING_INVALID_PLAN",msg:"Modalidade inválida."}};
  const prior=p.trainingExercise&&typeof p.trainingExercise==="object"?p.trainingExercise:{};
  const balances=prior.balances&&typeof prior.balances==="object"?prior.balances:{};
  if(prior.plan&&prior.plan!=="free"&&prior.charges!=null&&balances[prior.plan]==null)balances[prior.plan]=prior.charges;
  balances.exercise=Math.max(0,Math.floor(Number(balances.exercise)||0));
  balances.lasting=Math.max(0,Math.floor(Number(balances.lasting)||0));
  if(planId!=="free"&&(balances[planId]||0)<=0)
    return {code:409,body:{ok:false,error:"TRAINING_NO_CHARGES",msg:"Sem cargas desta modalidade — compre um pacote."}};
  const weapon=skill==="magic"?(/druid/i.test(String(p.voc||""))?"exercise-rod":"exercise-wand")
    :({"sword":"exercise-sword","axe":"exercise-axe","club":"exercise-club","dist":"exercise-bow",
      "shield":"exercise-shield","fist":"exercise-wraps"})[skill]||"exercise-sword";
  p.trainingExercise={skill,weapon,activePlan:planId,balances,active:true};
  return {ok:true,trainingExercise:p.trainingExercise};
}
async function checkpointTraining(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const denied = await requireLease(db, acc, body); if (denied) return denied;
  const ids = Array.isArray(body.char_ids) ? body.char_ids.map(Number) : [];
  const sessionId = String(body.session_id || "");
  if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(sessionId))
    return { code: 400, body: { ok: false, msg: "Sessão de treino inválida" } };
  for (const id of ids) {
    const resolved = await resolveInstanceRow(db, acc, id);
    if (resolved.error) return resolved.error;
    // Conta na arena PvP: o treino fica pausado (o último checkpoint da
    // transição para a batalha não é um conflito).
    if (resolved.pvp)
      return { code: 200, body: { ok: true, pvp: true, paused: true, characters: [], advances: [] } };
    if (resolved.row && resolved.row.status === "active")
      return { code: 409, body: { ok: false, msg: "Encerre a hunt antes de treinar." } };
  }
  const now = Date.now();
  const lease = { holderId: String(body.holder_id), secretHash: leaseHash(body.lease_token), now };
  const result = await db.trainingCheckpoint(acc.id, ids.sort((a, b) => a - b), sessionId, now, lease, advanceTrainingPlayer, body.stop === true);
  if (!result.ok) return { code: result.error === "LEASE_REQUIRED" ? 423 : 409,
    body: { ok: false, error: result.error, msg: "Treino não confirmado. Atualize a sessão antes de continuar." } };
  if (result.advances.length)
    publishSync(acc.id, "character", { ids: result.characters.map((row) => Number(row.id)), source: "training-checkpoint" });
  return { code: 200, body: { ok: true, characters: result.characters.map((row) => accountCharacterSummary(row, acc.gold)), advances: result.advances } };
}
async function setTrainingConfig(db,body){
  const acc=await db.findAccountByToken(body.token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id!==undefined?body.char_id:body.id);
  if(!Number.isSafeInteger(charId)||charId<=0)
    return {code:400,body:{ok:false,error:"TRAINING_INVALID",msg:"Personagem inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const skill=String(body.skill||""),planId=String(body.plan||"free");
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);
  if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    let last=null;
    for(let attempt=0;attempt<4;attempt++){
      const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
      if(!current||current.status!=="active")break;
      let applied=null,patchedPlayer=null;
      const result=await db.instancePatchState(current.account_id,acc.id,current.instance_id,Number(current.version),(serialized)=>{
        let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
        const item=descriptor.authority&&descriptor.authority.players&&
          descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
        if(!item||!item.p)return null;
        applied=applyTrainingConfig(item.p,skill,planId);
        if(!applied.ok)return null;
        patchedPlayer=cloneJson(item.p);
        descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
      },lease);
      last=result;
      if(applied&&!applied.ok)return {code:applied.code,body:applied.body};
      if(result.ok){
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
          status:result.instance.status,source:"training-config",holderId:String(body.holder_id||"")});
        const fresh=await db.findCharacter(charId);
        const persisted=await persistClaimedPlayer(db,acc,fresh||character,patchedPlayer,lease);
        if(persisted.code!==200)return persisted;
        persisted.body.trainingExercise=patchedPlayer.trainingExercise;
        persisted.body.msg="Treino atualizado.";
        return persisted;
      }
      if(result.error==="LEASE_REQUIRED")return {code:423,body:{ok:false,error:result.error,msg:"Controle transferido durante a configuração"}};
      if(result.error!=="INSTANCE_VERSION_CONFLICT")break;
    }
    if(last&&last.error==="INSTANCE_NOT_ACTIVE"){/* cai no save do personagem */}
    else if(last&&!last.ok)
      return {code:409,body:{ok:false,error:last.error,msg:"Não foi possível configurar o treino",
        instance:instanceSummary(last.instance,true)}};
  }
  const p=await loadCityPlayer(db,acc,character);
  const applied=applyTrainingConfig(p,skill,planId);
  if(!applied.ok)return {code:applied.code,body:applied.body};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  persisted.body.trainingExercise=p.trainingExercise;
  persisted.body.msg="Treino atualizado.";
  return persisted;
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
      currentCharacters.push(accountCharacterSummary(character,acc.gold));}
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
    return saveConflictResponse(result,acc);
  }
  if(typeof db.snapshotAdd==="function")for(const character of result.characters)
    await db.snapshotAdd(acc.id,"character",character.id,character.save_version,"party-save",character,false);
  publishSync(acc.id,"character",{ids:result.characters.map((c)=>Number(c.id)),
    saveVersions:result.characters.map((c)=>Number(c.save_version)),source:"party-save"});
  await publishPartyForCharacters(db,result.characters.map((c)=>c.id),"party-save");
  return {code:200,body:{ok:true,partyVersion,
    characters:result.characters.map(charSummaryWithGold(acc))}};
}

/* Batalha PvP: o snapshot tem 40 chars completos (×3: authority, members e
 * state.players ≈ 5MB). Para o browser: a autoridade vira um stub (só o que
 * o cliente lê) e chars de OUTRAS contas perdem dados que não aparecem em
 * combate. A cópia gravada no banco continua íntegra. */
const PVP_CLIENT_HEAVY_KEYS=["missions","missionsDone","charmsPagos","bestiary","bosstiary","kills","_guildKillsMark",
  "deathLog","bosses","_partyOnline","_partyInvites","log","achievements","depot","rewardChest","rewardChestBundles",
  "wardrobe","forgeHistory","quests","helperPresets","itemInstances","bag","lootPouch","lootConfig","supplyStash",
  "depotNotification","exaltationBox","dummies","prey","hazardKills","playtime","_sharedInv","_accountCosmetics",
  "trainingExercise","soulWarTaints","forge","_forgeMeta","_forgeBase","_pouchBase"];
/* Whitelist do `p` de chars de OUTRAS contas na arena: só o que o cliente
 * usa pra renderizar/status (nome, voc, hp/mp, outfit, emblemas,
 * condições). ~55KB → ~1.5KB por rival — a resposta do tick caía de ~1MB
 * pra ~150KB. Os chars do próprio viewer continuam completos. */
const PVP_RIVAL_P_KEYS=["id","accountId","name","voc","level","hp","mp","maxHp","maxMp",
  "outfit","mount","mountOutfit","conditions","emote","skull","war","shield","guildEmblem",
  "emblem","partyEmblem","guild","guildName","guildId","speed","dir","invisible","sneak",
  "dead","downedAt","reviveAt","permadead","summons","summonedBy","magicShieldPool",
  "magicShieldCap","soul","cap","pvpTeam","team","pvpSlim"];
function pvpRivalSlimP(p){
  const out={};for(const k of PVP_RIVAL_P_KEYS)if(p[k]!==undefined)out[k]=p[k];
  out.pvpSlim=true;return out;
}
function pvpSlimClientState(state,viewerAccountId,shared){
  if(!state||typeof state!=="object")return state;
  // NÃO muta `state`: com o descritor quente em memória (hotAuth), o objeto
  // recebido É a autoridade viva — trocar `state.authority` pelo stub ou
  // enxugar members[].p in-place destruiria a simulação e os demais viewers.
  const out=Object.assign({},state);
  const auth=state.authority;
  if(auth&&typeof auth==="object")out.authority={ended:!!auth.ended,terminalReason:auth.terminalReason||null,
    clock:Number(auth.clock)||0,pvpSlim:true};
  /* Tick (shared != null): os chars da PRÓPRIA conta também perdem as heavy
   * keys — o merge do cliente é Object.assign (campos ausentes sobrevivem
   * do save local) e guarda missions/wheel/imbuements/config explicitamente.
   * No GET/resume (shared == null) o próprio p fica completo porque o
   * cliente reconstrói G.p a partir do snapshot. ~55KB → ~10KB por char. */
  const tickMode=!!shared;
  const slimOwnP=(p)=>{
    const out=Object.assign({},p);for(const k of PVP_CLIENT_HEAVY_KEYS)delete out[k];
    return out;
  };
  // members[].p rival: só filtro por conta no cliente (pvpIsOwnEnt) — id/nome
  // bastam. O char próprio continua completo (resume usa member.p → G.p).
  const slimMember=(ent)=>{
    if(!ent||!ent.p)return ent;
    if(Number(ent.p.accountId)===Number(viewerAccountId))
      return tickMode?Object.assign({},ent,{p:slimOwnP(ent.p)}):ent;
    return Object.assign({},ent,{p:{id:ent.p.id,accountId:ent.p.accountId,name:ent.p.name,
      hp:ent.p.hp,mp:ent.p.mp,pvpSlim:true}});
  };
  if(Array.isArray(state.members))out.members=state.members.map(slimMember);
  if(state.state&&Array.isArray(state.state.players)){
    const src=state.state.players;
    /* Rivais slimados são idênticos pra TODOS os viewers: a versão slimada
     * é compartilhada por step de sim (rev = authClock) — cada request só
     * recoloca os chars da própria conta em vez de re-slimar 40× por tick. */
    const rev=String(state.state.authClock||state.savedAt||"");
    let slimPlayers;
    if(shared&&shared.rev===rev&&Array.isArray(shared.players))slimPlayers=shared.players;
    else{
      slimPlayers=src.map((ent)=>ent&&ent.p?Object.assign({},ent,{p:pvpRivalSlimP(ent.p)}):ent);
      if(shared){shared.rev=rev;shared.players=slimPlayers;}
    }
    out.state=Object.assign({},state.state,{players:Number(viewerAccountId)
      ?src.map((ent,i)=>ent&&ent.p&&Number(ent.p.accountId)===Number(viewerAccountId)
          ?(tickMode?Object.assign({},ent,{p:slimOwnP(ent.p)}):ent):slimPlayers[i])
      :slimPlayers});
    /* blockedCells é estático por mapa (~22KB): sai só no GET/resume; no tick
     * o merge do cliente preserva a cópia recebida no join. */
    if(tickMode)delete out.state.blockedCells;
  }
  return out;
}
function instanceSummary(row,includeState,viewerAccountId,sharedSlim){
  if(!row)return null;let state=null;
  if(includeState&&row.state){try{state=typeof row.state==="string"?JSON.parse(row.state):row.state;}catch(e){state=null;}}
  if(state&&String(row.kind||"")==="pvp"&&pvpDescriptorThin(state))
    state=materializeAuthority(state);
  if(state&&viewerAccountId&&String(row.kind||"")==="pvp")state=pvpSlimClientState(state,viewerAccountId,sharedSlim);
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
  // Batalha PvP compartilhada tem prioridade máxima — participantes da guerra
  // montam a instância-âncora do host enquanto ela estiver ativa.
  const pvpCtrl=typeof global.__PVP!=="undefined"?global.__PVP:null;
  const pvpShared=pvpCtrl&&typeof pvpCtrl.sharedForAccount==="function"
    ?pvpCtrl.sharedForAccount(acc.id):null;
  if(pvpShared&&pvpShared.instanceId){
    // Cabeçalho sem o blob (~5MB): a guerra resolve a rota por metadados —
    // o estado vem do descritor quente no tick, não do row.
    const sharedRow=await (db.instanceGetHead||db.instanceGet).call(db,pvpShared.ownerAccountId);
    if(sharedRow&&["active","checkpointed"].includes(sharedRow.status)
      &&String(sharedRow.instance_id)===String(pvpShared.instanceId))
      return {row:sharedRow,character,party,shared:Number(sharedRow.account_id)!==Number(acc.id),pvp:true};
    // instância sumiu: o tick do controlador aborta a batalha (reembolso) —
    // não limpar liveByBattle aqui ou o abort nunca roda.
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
  const ownerAcc=await db.findAccountById(accountId);
  const accGold=ownerAcc?Math.max(0,Math.floor(Number(ownerAcc.gold)||0)):undefined;
  for(const id of ids){const character=await db.findCharacter(id);
    if(character&&Number(character.account_id)===Number(accountId))out.push(accountCharacterSummary(character,accGold));}
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
  // Roster de batalha PvP: todas as contas sorteadas recebem o estado.
  if(typeof global.__PVP!=="undefined"&&global.__PVP){
    const pvpBattle=typeof global.__PVP.battleForAccount==="function"
      ?await global.__PVP.battleForAccount(db,row.account_id):null;
    if(pvpBattle&&typeof db.pvpRosterGet==="function"){
      const pvpRoster=await db.pvpRosterGet(pvpBattle.id);
      for(const r of pvpRoster||[])accounts.add(Number(r.account_id));
    }
  }
  for(const accountId of accounts)publishSync(accountId,"instance",data);
}
async function loadInstance(db,token,charId){
  const acc=await db.findAccountByToken(token);
  if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  // Guerra: a rota usa cabeçalho sem blob — o estado vem do descritor quente
  // (ou do blob completo quando ainda não há cache, ex.: pré-primeiro tick).
  if(row&&resolved.pvp&&row.state===undefined){
    const hot=pvpAuthCacheGet(row.instance_id);
    if(hot)row.state=hot.descriptor;
    else{const full=await db.instanceGet(row.account_id);if(full){
      let st=full.state;try{st=typeof st==="string"?JSON.parse(st):st;}catch(_e){}
      row.state=pvpDescriptorThin(st)?materializeAuthority(st):st;}}
  }
  if(!row||row.status!=="active")return {code:200,body:{ok:true,instance:null,lastStatus:row?row.status:null,
    terminalReason:row&&row.terminal_reason||null}};
  const summary=instanceSummary(row,true,acc.id);
  if(!summary.state)return {code:500,body:{ok:false,error:"INSTANCE_STATE_INVALID",msg:"Snapshot da instância está corrompido"}};
  if((resolved.party||resolved.worldBoss||resolved.pvp)&&resolved.character&&summary.state.members&&
     summary.state.members.some((member)=>String(member.id)===String(resolved.character.id)))
    summary.state.activeCharacterId=String(resolved.character.id);
  return {code:200,body:{ok:true,instance:summary}};
}
async function prepareInstanceState(db,acc,input){
  if(!input||typeof input!=="object"||Array.isArray(input))
    return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_STATE",msg:"Snapshot da instância inválido"}}};
  const kind=input.kind==="boss"?"boss":input.kind==="hunt"?"hunt":input.kind==="quest"?"quest":null;
  const idPattern=/^[a-z0-9][a-z0-9_-]{0,63}$/;
  const huntId=input.huntId?String(input.huntId):null,bossId=input.bossId?String(input.bossId):null;
  // Lock de preparo PvP: contas sorteadas para a guerra ficam na área de
  // treino e não abrem hunts, bosses nem quests até a batalha acabar.
  if(typeof global.__PVP!=="undefined"&&global.__PVP&&typeof global.__PVP.lockedAccount==="function"){
    try{const pvpLock=await global.__PVP.lockedAccount(db,acc.id);
      if(pvpLock)return {error:{code:409,body:{ok:false,error:"PVP_LOCKED",
        msg:"Personagem em preparo de batalha PvP — aguarde na área de treino.",battleId:pvpLock.battleId}}};
    }catch(e){/* lock é best-effort */}
  }
  if(!kind||(kind==="hunt"&&!idPattern.test(huntId||""))||(kind==="boss"&&!idPattern.test(bossId||""))
    ||(kind==="quest"&&!idPattern.test(bossId||"")))
    return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_KIND",msg:"Hunt/boss inválido"}}};
  const bloodrottenBosses=require("../game/js/bloodrotten").bosses;
  const bloodrottenBossId=bossId&&bloodrottenBosses.includes(bossId)?bossId:
    (huntId&&bloodrottenBosses.includes(String(huntId).replace(/-room$/,""))?String(huntId).replace(/-room$/,""):null);
  if(bloodrottenBossId&&(kind!=="boss"||bossId!==bloodrottenBossId))
    return {error:{code:400,body:{ok:false,error:"INVALID_BLOODROTTEN_INSTANCE",msg:"Bosses da Bloodrotten devem ser enfrentados em sua instância de boss."}}};
  let mode=["non-pvp","pvp","boss","quest"].includes(String(input.instanceMode))?String(input.instanceMode):
    (kind==="boss"?"boss":kind==="quest"?"quest":"non-pvp");
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
  const maxMembers=/^world-boss-wz[1-6]$/.test(String(bossId||""))?WORLD_BOSS_MAX_MEMBERS:5;
  if(!members.length||members.length>maxMembers)return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_MEMBERS",msg:"Membros da instância inválidos"}}};
  let ids=members.map((member)=>Number(member&&member.id));
  if(ids.some((id)=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)
    return {error:{code:400,body:{ok:false,error:"INVALID_INSTANCE_MEMBERS",msg:"Membros duplicados ou inválidos"}}};
  /* Bakragore é exclusivo do lobby de World Boss (Rotten Blood): um PUT
   * direto de instância boss fora do roster compartilhado não cria a sala. */
  if(bossId==="bakragore"){
    const wbCtrlB=typeof global.__WORLD_BOSS!=="undefined"?global.__WORLD_BOSS:null;
    const wbShareB=wbCtrlB&&typeof wbCtrlB.sharedForAccount==="function"?wbCtrlB.sharedForAccount(acc.id):null;
    const wbIdsB=wbCtrlB&&typeof wbCtrlB.joinedCharIds==="function"?new Set(wbCtrlB.joinedCharIds().map(Number)):null;
    const bakragoreOk=!!(wbShareB&&wbIdsB&&wbIdsB.size&&ids.every((id)=>wbIdsB.has(Number(id))));
    if(!bakragoreOk)return {error:{code:403,body:{ok:false,error:"WORLD_BOSS_LOBBY_REQUIRED",
      msg:"Bakragore só pode ser enfrentado pelo lobby de World Boss."}}};
  }
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
    const bloodrottenReason=require("../game/js/bloodrotten").accessError(bloodrottenBossId||bossId,c.level);
    if(bloodrottenReason)return {error:{code:403,body:{ok:false,error:"BLOODROTTEN_LEVEL_REQUIRED",msg:c.name+": "+bloodrottenReason}}};
    const grimvaleBosses=require("../game/js/grimvale-bosses");
    if(grimvaleBosses.ids.some((slug)=>bossId===slug||huntId==="grimvale-"+slug+"-room")){
      const reason=grimvaleBosses.accessError(ownerAcc,c.level);
      if(reason)return {error:{code:403,body:{ok:false,error:"GRIMVALE_BOSS_REQUIREMENTS",msg:c.name+": "+reason}}};
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
        // Stamina da conta: materializa o gap ocioso (0,5s/s) no pool antes
        // de espelhar — o tick da instância drena o pool por conta.
        let shared=null;
        if(typeof db.accountSharedInventoryMutate==="function"){
          shared=await db.accountSharedInventoryMutate(Number(c.account_id),(s)=>{
            SharedInv.regenSharedStamina(s,Date.now(),0.5,canonical.stamina);
          });
        }
        if(!shared){
          shared=await db.accountSharedInventory(Number(c.account_id));
          SharedInv.regenSharedStamina(shared,Date.now(),0.5,canonical.stamina);
          if(typeof db.setAccountSharedInventory==="function")
            await db.setAccountSharedInventory(Number(c.account_id),shared);
        }
        SharedInv.applySharedToPlayer(canonical,shared);
        if(typeof db.findAccountById==="function"){
          try{
            const owner=await ensureAccountWallet(db,await db.findAccountById(Number(c.account_id)));
            SharedInv.applyAccountMissionsToPlayer(canonical,owner);
            require("./wardrobe").applyToPlayer(canonical,owner);
          }catch(e){}
        }
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
/* Colisão OTBM para warzones com sala real (Bakragore). Mesma lógica do
 * questMapBlockedCells: crop nos bounds e `x:y` local → true quando o tile
 * bloqueia (paredes/deco) ou o footprint está proibido. */
let _wbTileFlags=null;
function worldBossMapBlockedCells(wz){
  try{
    if(!_wbTileFlags){
      const sandbox={window:{}};sandbox.window=sandbox;vm.createContext(sandbox);
      vm.runInContext(fs.readFileSync(path.join(STATIC_DIR,"js","tileflags.js"),"utf8"),sandbox);
      _wbTileFlags=sandbox.TILEFLAGS||{};
    }
    const OTBM=require(path.join(STATIC_DIR,"js","otbm.js"));
    const bytes=fs.readFileSync(path.join(STATIC_DIR,"maps",wz.otbm+".otbm"));
    let parsed=OTBM.read(bytes,{z:wz.otbmFloor});
    const crop=wz.otbmFovBounds||wz.otbmBounds;
    if(crop)parsed=OTBM.crop(parsed,crop);
    const map=OTBM.huntMapFromOtbm(parsed,_wbTileFlags),blocked={};
    for(let y=0;y<map.rows.length;y++)for(let x=0;x<map.rows[y].length;x++){
      const legend=map.leg[map.rows[y][x]];
      if(!legend||legend.bloc||map.footprintBlocked&&map.footprintBlocked[x+":"+y])blocked[x+":"+y]=true;
    }
    return blocked;
  }catch(error){console.error("[world-boss] map collision",error&&error.message);return null;}
}
async function createWorldBossSharedInstance(db,event){
  if(!event||!event.joins||!event.joins.size)return {ok:false,error:"NO_JOINS"};
  const wz=WARZONES.find((w)=>w.id===event.warzoneId)||WARZONES[0];
  const bossId=bossIdForWarzone(wz.id);
  const hostAccountId=Number(event.hostAccountId||[...event.joins.keys()][0]);
  if(!hostAccountId)return {ok:false,error:"NO_HOST"};
  const gridW=Math.max(1,Number(wz.gridW)||40),gridH=Math.max(1,Number(wz.gridH)||40);
  const spawn=wz.playerSpawn||{x:20,y:28},bossCell=wz.bossSpawn||{x:20,y:16};
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
  const blockedCells=wz.otbm?worldBossMapBlockedCells(wz):null;
  const descriptor={
    v:1,kind:"boss",huntId:null,bossId,instanceMode:"boss",worldBoss:true,
    activeCharacterId:String(members[0].id),members,
    state:{
      worldBoss:true,instanceMode:"boss",gridW,gridH,huntId:null,
      rewardBundleId:"world-boss-"+event.id,
      blockedCells:blockedCells||undefined,
      /* Bakragore's Burden: soma das taints contribuídas pelos membros.
       * initializeAuthority copia para auth.bakragoreBurden e o tick
       * Bloodrotten escala summons/HP. */
      bakragoreBurden:Math.max(0,Math.floor(Number(event.burdenTotal)||0)),
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
  // Semeia o descritor quente (mesmo caminho do PvP): a warzone tem M
  // contas tickando a mesma row do host — sem o cache quente cada tick
  // re-parseava o blob sob FOR UPDATE e o pool afogava no last hit.
  pvpAuthCacheSet(instanceId,{descriptor:initialized,
    rowVersion:Number(saved.instance&&saved.instance.version)||1,savedAt:Date.now()});
  try{
    await publishInstanceForRow(db,saved.instance,{
      id:saved.instance.instance_id,version:Number(saved.instance.version)||1,
      status:"active",source:"world-boss-create",holderId:"",
    });
  }catch(e){/* best-effort */}
  console.log("[world-boss] shared instance",String(instanceId).slice(0,12),"host="+hostAccountId,"chars="+members.length);
  return {ok:true,instanceId,ownerAccountId:hostAccountId,instance:saved.instance};
}
/* Instância compartilhada de batalha PvP guild-vs-guild: todos os chars das
 * parties sorteadas entram na mesma autoridade, cada um em sua safezone. */
function pvpMapBlockedCells(map){
  try{
    if(!_wbTileFlags){
      const sandbox={window:{}};sandbox.window=sandbox;vm.createContext(sandbox);
      vm.runInContext(fs.readFileSync(path.join(STATIC_DIR,"js","tileflags.js"),"utf8"),sandbox);
      _wbTileFlags=sandbox.TILEFLAGS||{};
    }
    const OTBM=require(path.join(STATIC_DIR,"js","otbm.js"));
    const bytes=fs.readFileSync(path.join(STATIC_DIR,"maps",map.otbm+".otbm"));
    let parsed=OTBM.read(bytes,{z:map.otbmFloor});
    const mapData=OTBM.huntMapFromOtbm(parsed,_wbTileFlags),blocked={};
    for(let y=0;y<mapData.rows.length;y++)for(let x=0;x<mapData.rows[y].length;x++){
      const legend=mapData.leg[mapData.rows[y][x]];
      if(!legend||legend.bloc||mapData.footprintBlocked&&mapData.footprintBlocked[x+":"+y])
        blocked[x+":"+y]=true;
    }
    return blocked;
  }catch(error){console.error("[pvp] map collision",error&&error.message);return null;}
}
async function createPvpSharedInstance(db,battle,roster){
  const map=PVP_MAPS[String(battle.map)];
  if(!map)return {ok:false,error:"PVP_MAP"};
  const g1=typeof db.guildById==="function"?await db.guildById(battle.challenger_guild_id):null;
  const g2=typeof db.guildById==="function"?await db.guildById(battle.challenged_guild_id):null;
  const local=pvpMapLocal(map),gridW=local.gridW,gridH=local.gridH;
  const szByTeam={1:local.sz1,2:local.sz2};
  const blockedCells=pvpMapBlockedCells(map);
  const blocked=(cx,cy)=>!!(blockedCells&&blockedCells[cx+":"+cy]);
  const cellInRect=(cx,cy,r)=>cx>=r.x1&&cx<=r.x2&&cy>=r.y1&&cy<=r.y2;
  const freeIn=(rect,taken)=>{
    for(let x=rect.x1;x<=rect.x2;x++)for(let y=rect.y1;y<=rect.y2;y++){
      if(!blocked(x,y)&&!taken.has(x+":"+y))return {cx:x,cy:y};
    }
    return null;
  };
  const members=[],players=[],taken=new Set(),stats={};
  const hostAccountId=Number(
    (roster.find((r)=>Number(r.account_id)===Number(battle.created_by))||roster[0]).account_id);
  for(const r of roster){
    const team=Number(r.team)===2?2:1,rect=szByTeam[team];
    for(const cid of r.char_ids||[]){
      const character=await db.findCharacter(cid);
      if(!character)continue;
      let data=character.data;
      if(typeof data==="string"){try{data=JSON.parse(data);}catch(e){data={};}}
      data=data&&typeof data==="object"?cloneJson(data):{};
      data.id=String(character.id);
      data.name=character.name||data.name;
      data.voc=character.voc||data.voc;
      data.level=Math.max(1,Number(character.level)||Number(data.level)||1);
      const ownerAcc=await db.findAccountById(character.account_id);
      data.gold=Math.max(0,Math.floor(Number(ownerAcc&&ownerAcc.gold)||0));
      data.accountId=Number(character.account_id);
      pvpApplyBattlePreset(data);
      // Servidor de teste: mages entram na guerra com ML 80 — os clones
      // tinham ML baixo p/ boa parte do combo e ficavam sem castar.
      if(TEST_SERVER&&/(sorcerer|druid)/i.test(String(data.voc||"")))data.ml=80;
      const max=maxStats(data);
      data.hp=max.hp;data.mp=max.mp;
      let cell=freeIn(rect,taken);
      if(!cell){ // sz cheia: expande em anel ao redor do centro
        const cx=Math.round((rect.x1+rect.x2)/2),cy=Math.round((rect.y1+rect.y2)/2);
        outer:for(let d=1;d<12;d++)for(let ox=-d;ox<=d;ox++)for(let oy=-d;oy<=d;oy++){
          if(Math.max(Math.abs(ox),Math.abs(oy))!==d)continue;
          const x=cx+ox,y=cy+oy;
          if(x>=0&&y>=0&&x<gridW&&y<gridH&&!blocked(x,y)&&!taken.has(x+":"+y)){cell={cx:x,cy:y};break outer;}
        }
      }
      if(!cell)cell=pvpRectCenter(rect);
      taken.add(cell.cx+":"+cell.cy);
      members.push({id:String(character.id),p:data,hp:data.hp,mp:data.mp,
        accountId:Number(character.account_id),pvpTeam:team,team:team,
        partyKey:"pvpb:"+battle.id+":"+team});
      players.push({
        id:String(character.id),p:data,hp:data.hp,mp:data.mp,accountId:Number(character.account_id),
        pvpTeam:team,team:team,partyKey:"pvpb:"+battle.id+":"+team,
        cx:cell.cx,cy:cell.cy,x:(cell.cx+.5)/gridW,y:(cell.cy+.5)/gridH,dir:"n",
      });
      stats[String(character.id)]={name:data.name||"Player",team,
        accountId:Number(character.account_id),kills:0,deaths:0,damage:0};
    }
  }
  if(!members.length)return {ok:false,error:"NO_MEMBERS"};
  /* Quem designa o alvo do time: o LÍDER da guild (rank "leader") se sorteado
   * — a IA nunca designa. Sem líder no roster, cai no membro marcado como
   * "leader" do sorteio (criador do desafio); se nem esse, ninguém designa. */
  const leaderAccOf=async(team,guildId)=>{
    const rows=roster.filter((r)=>(Number(r.team)===2?2:1)===team);
    if(typeof db.guildMembers==="function"){
      const mems=await db.guildMembers(guildId);
      const lead=mems.find((m)=>String(m.rank)==="leader"&&
        rows.some((r)=>Number(r.account_id)===Number(m.account_id)));
      if(lead)return Number(lead.account_id);
    }
    const flagged=rows.find((r)=>!!r.leader);
    return flagged?Number(flagged.account_id):0;
  };
  const endsAt=Date.now()+10*60*1000;
  const descriptor={
    v:1,kind:"pvp",huntId:null,bossId:null,instanceMode:"pvp",
    activeCharacterId:String(members[0].id),members,
    state:{
      instanceMode:"pvp",gridW,gridH,
      blockedCells:blockedCells||undefined,
      raidEnabled:false,influencedChance:0,fiendishChance:0,players,
      mobs:[],
      pvpBattle:{
        battleId:Number(battle.id),mapId:map.id,mode:map.mode,pz:!!map.pz,
        fragTarget:Number(map.fragTarget)||0,
        safezones:{1:szByTeam[1],2:szByTeam[2]},
        controlZone:local.control||null,dominationMs:{1:0,2:0},
        teams:{1:{guildId:Number(battle.challenger_guild_id),name:String((g1&&g1.name)||"Desafiante"),targetId:null,
                  leaderAccountId:await leaderAccOf(1,battle.challenger_guild_id)},
               2:{guildId:Number(battle.challenged_guild_id),name:String((g2&&g2.name)||"Desafiada"),targetId:null,
                  leaderAccountId:await leaderAccOf(2,battle.challenged_guild_id)}},
        scores:{1:0,2:0},
        endsAt,overtime:0,stats,finished:null,
      },
    },
  };
  for(const r of roster){
    try{if(typeof db.instanceEndForced==="function")await db.instanceEndForced(Number(r.account_id),"pvp-start");}
    catch(e){console.error("[pvp] end hunt",r.account_id,e&&e.message);}
  }
  const instanceId=newToken();
  const initialized=initializeAuthority(descriptor,instanceId,Date.now());
  const stamp=new Date();
  const saved=await db.instanceReplaceForced(hostAccountId,instanceId,{
    kind:"pvp",hunt_id:null,boss_id:null,instance_mode:"pvp",
    party_id:null,party_version:null,active_character_id:Number(members[0].id),
    saved_at:stamp,started_at:stamp,
  },JSON.stringify(initialized));
  if(!saved||!saved.ok)return {ok:false,error:(saved&&saved.error)||"SAVE_FAILED"};
  // Semeia o descritor quente: o objeto já está em memória — o primeiro
  // tick/load não paga o parse de ~5MB.
  pvpAuthCacheSet(instanceId,{descriptor:initialized,
    rowVersion:Number(saved.instance&&saved.instance.version)||1,savedAt:Date.now()});
  try{
    await publishInstanceForRow(db,saved.instance,{
      id:saved.instance.instance_id,version:Number(saved.instance.version)||1,
      status:"active",source:"pvp-battle-create",holderId:"",
    });
  }catch(e){/* best-effort */}
  console.log("[pvp] shared instance",String(instanceId).slice(0,12),
    "host="+hostAccountId,"chars="+members.length,"map="+map.id);
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
  const activeId=Number(body.state&&body.state.activeCharacterId);
  // Sem early-return: findCharacter(NaN) gera `WHERE id = NaN` → 500
  // (mysql2 serializa NaN como identificador, não como NULL).
  if(!Number.isSafeInteger(activeId)||activeId<=0)
    return {code:400,body:{ok:false,error:"INVALID_ACTIVE_CHARACTER",msg:"Personagem ativo inválido"}};
  const active=await db.findCharacter(activeId);
  // Batalha PvP: a autoridade da instância compartilhada é a fonte de verdade
  // (tick/worker). Checkpoint do browser só espelha — host e convidados.
  const pvpShareSave=typeof global.__PVP!=="undefined"&&global.__PVP
    ?global.__PVP.sharedForAccount(acc.id):null;
  if(pvpShareSave&&pvpShareSave.instanceId){
    const pvpRow=await db.instanceGet(pvpShareSave.ownerAccountId);
    if(pvpRow&&pvpRow.status==="active"&&String(pvpRow.instance_id)===String(pvpShareSave.instanceId))
      return {code:200,body:{ok:true,shared:true,instance:instanceSummary(pvpRow,false)}};
  }
  if(active&&Number(active.account_id)===Number(acc.id)){
    const party=await db.partyFindByCharacter(activeId),shared=party&&typeof db.instanceGetByParty==="function"?await db.instanceGetByParty(party.id):null;
    // Boss novo (create, não checkpoint): arena própria, nunca "espelha" a
    // hunt do líder nem fica pending — senão o membro/líder abria a sala e o
    // boss nunca nascia (instância nunca criada). A shared ativa é encerrada
    // com extração terminal mais abaixo, no branch do create.
    const bossCreate=expected===0&&String(body.state&&body.state.kind||"")==="boss";
    if(party&&shared&&!bossCreate&&(activeId!==Number(party.leader_id)||expected===0||String(body.instance_id||"")!==String(shared.instance_id)))
      return {code:200,body:{ok:true,shared:true,instance:instanceSummary(shared,false)}};
    /* Qualquer char da CONTA DONA da party pode abrir a instância
     * compartilhada (o líder é só a ordem do roster — o save da conta é
     * único). Membro de party de OUTRA conta continua pending: a sala é
     * da conta do líder e ele entra via follow/shared mirror. */
    if(party&&Number(party.leader_id)!==activeId&&!shared&&!bossCreate&&
       Number(party.owner_account_id)!==Number(acc.id))
      return {code:200,body:{ok:true,pending:true,instance:null,msg:"Aguardando a instância do líder"}};
    if(party&&Number(party.owner_account_id)!==Number(acc.id)){
      // Create de boss de convidado de party estrangeira: `pending` nunca se
      // resolve (a sala é da conta líder) — a arena ficava órfã até o
      // watchdog de 45s. Recuse já com o motivo real.
      if(!shared&&bossCreate)return {code:403,body:{ok:false,error:"BOSS_REQUIRES_OWN_PARTY",
        msg:"Saia da party de outra conta para enfrentar um boss."}};
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
  // Create de boss: a sala substitui uma HUNT ativa da conta (a do líder da
  // party ou sobra de luta anterior). Tem que encerrar ANTES do prepare —
  // a trava de instance_mode do prepare rejeitaria boss sobre hunt ativa.
  // Tick terminal extrai pouch/chest para não perder loot — sem isto o
  // instanceSave esbarrava no INSTANCE_VERSION_CONFLICT do slot ocupado e o
  // boss nunca nascia. Se a linha viva já é boss (PUT duplicado/corrido),
  // deixa o conflito de versão amarrar o cliente na sala existente em vez de
  // destruir uma luta em andamento.
  if(expected===0&&String(body.state&&body.state.kind||"")==="boss"){
    const live=await db.instanceGet(acc.id);
    if(live&&live.status==="active"&&String(live.kind||"")!=="boss")
      await endOwnActiveInstance(db,acc.id,"boss-entry",lease);
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
    instanceId=newToken();
    prepared.state=restoreAuthoritativeEntry(prepared.state);
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
  // Batalha PvP: convidados (contas que não hospedam a instância) também
  // avançam a autoridade com o próprio lease — sem isso o movimento e o
  // target manual do time rival eram ignorados (snapshot somente leitura).
  if(resolved.shared&&resolved.row&&resolved.row.status==="active"&&!resolved.worldBoss&&!resolved.pvp){
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
    const summary=instanceSummary(resolved.row,true,acc.id);
    if(summary.state&&resolved.character)summary.state.activeCharacterId=String(resolved.character.id);
    return {code:200,body:{ok:true,shared:true,elapsed:0,terminalReason:null,instance:summary,
      characters:await instanceCharactersForAccount(db,resolved.row,acc.id)}};
  }
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const ownerId=resolved.row?Number(resolved.row.account_id):Number(acc.id);
  if((resolved.worldBoss||resolved.pvp)&&resolved.shared){
    const own=await db.instanceGet(acc.id);
    if(own&&own.status==="active"&&String(own.instance_id)!==String(resolved.row.instance_id))
      await db.instanceEnd(acc.id,own.instance_id,own.version,
        resolved.pvp?"joined-pvp-battle":"joined-shared-world-boss",lease);
  }
  // A posição visual prevista pelo grid não decide dano/alcance. Ela só é
  // sincronizada no snapshot/eventos para efeitos acompanharem as entidades.
  // Intents de convidados Megalomania entram no tick do líder.
  const advanceWithVisuals=(state,elapsed,checkpointAt,hot)=>{
    let visual=body.visual_state;
    if(visual&&Array.isArray(visual.players)&&visual.players.length){
      let pvpAuth=null;
      // Caminho quente: `state` já é o descritor vivo — sem parse de ~5MB.
      if(typeof state==="string"){if(state.indexOf('"pvpBattle"')>=0){try{pvpAuth=JSON.parse(state).authority;}catch(_e){}}}
      else pvpAuth=state&&state.authority;
      visual=pvpFilterVisualState(pvpAuth,visual,acc.id);
    }
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
    // Instâncias de quest salvas antes de `walkFloors` carregam blockedCells
    // obsoletos (sala inteira bloqueada). Recalcula ao avançar a autoridade.
    try{
      const auth=state&&state.authority;
      const quest=auth&&auth.questId&&QUEST_DEFS?QUEST_DEFS[auth.questId]:null;
      if(auth&&quest&&Array.isArray(quest.walkFloors)){
        const fresh=questMapBlockedCells(quest);
        if(fresh){auth.blockedCells=fresh;if(state.state)state.state.blockedCells=fresh;}
      }
    }catch(_e){}
    return advanceAuthorityState(state,elapsed,checkpointAt,visual,
      Object.assign(hot?{inPlace:true,rawState:true}:{},{stepBudgetMs:AUTH_TICK_STEP_BUDGET_MS}));
  };
  const tickOpts={};
  if((resolved.worldBoss||resolved.pvp)&&Number(ownerId)!==Number(acc.id))tickOpts.leaseAccountId=acc.id;
  // Batalha PvP e World Boss: descritor quente em memória (ver hotAuth em
  // instanceAuthorityTick). A warzone tem M contas tickando a MESMA row do
  // host — exatamente o cenário que o FOR UPDATE afogava (o servidor
  // "travava" justo no last hit, quando o tick terminal encadeava a
  // extração de N contas sob a lock).
  if(resolved.pvp||resolved.worldBoss)tickOpts.hotAuth=instanceHotAuthApi();
  const runTick=()=>db.instanceAuthorityTick(ownerId,expected,Date.now(),3600000,advanceWithVisuals,lease,
    Object.keys(tickOpts).length?tickOpts:undefined);
  /* Batalha: serialização in-process (mutex por conta-dono), NÃO pela lock
   * FOR UPDATE da row — ~35 req/s enfileiradas na mesma row esgotavam o
   * pool de conexões e o servidor inteiro morria em "Carregando". */
  const result=tickOpts.hotAuth?await pvpAuthSerialize(ownerId,runTick):await runTick();
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
      const current=instanceSummary(result.instance,true,acc.id);
      if(resolved.party&&resolved.character&&current.state&&current.state.members&&
         current.state.members.some((member)=>String(member.id)===String(resolved.character.id)))
        current.state.activeCharacterId=String(resolved.character.id);
      return {code:200,body:{ok:true,resynced:true,elapsed:0,terminalReason:null,
        instance:current,characters:[]}};
    }
    return {code:result.error==="LEASE_REQUIRED"?423:409,
      body:{ok:false,error:result.error,msg:"Tick autoritativo recusado",instance:instanceSummary(result.instance,true,acc.id)}};
  }
  if(typeof db.snapshotAdd==="function"&&(result.terminalReason||Number(result.instance.version)%120===0))
    await db.snapshotAdd(acc.id,"instance",result.instance.instance_id,result.instance.version,
      result.terminalReason||"tick",result.instance,!!result.terminalReason);
  // Guerra: publish por tick é desperdício — clientes em batalha ignoram
  // eventos source:"tick" (o próprio tick já devolve o estado) e o roster
  // fora da arena usa o canal pvp. Cada publish custa battleForAccount +
  // pvpRosterGet + SSE por conta. Só o término notifica.
  if(!(resolved.pvp&&!result.terminalReason))
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,terminalReason:result.terminalReason||null,source:"tick",holderId:String(body.holder_id||""),
      characterVersions:(result.characters||[]).map((c)=>({id:Number(c.id),saveVersion:Number(c.save_version)}))});
  // Terminal de boss fight: publica "character" para TODAS as abas/personagens
  // da conta re-buscarem /api/me — o shared (rewardChest do boss derrotado)
  // é aplicado e o badge "!" do Reward Chest aparece para todos, e o loot do
  // reward é o mesmo (compartilhado pela conta).
  if(result.terminalReason){
    try{publishSync(acc.id,"character",{id:null,saveVersion:0,source:"instance-terminal"});}catch(e){/* opcional */}
  }
  /* Guerra: ~35 req/s de N viewers reconstruíam instanceSummary (~0.5MB
   * slim) + stringify a cada request — a thread saturava e os menus
   * ficavam lentos. A resposta por viewer só muda quando o descriptor
   * avança; requests dentro de ~150ms recebem os mesmos bytes (o cliente
   * ticka a cada 200ms — a defasagem é menor que um passo de sim). */
  let pvpRespCache=null,pvpRespKey=null,hotShared=null;
  if(resolved.pvp){
    const hot=pvpAuthCacheGet(result.instance.instance_id);
    if(hot){
      pvpRespCache=hot.respCache||(hot.respCache=new Map());
      pvpRespKey=String(acc.id);
      const hitEnt=pvpRespCache.get(pvpRespKey);
      if(hitEnt&&Date.now()-hitEnt.at<150)return {code:200,body:{__raw:hitEnt.raw}};
      hotShared=hot.slimShared||(hot.slimShared={});
    }
  }
  const responseInstance=instanceSummary(result.instance,true,acc.id,hotShared);
  if((resolved.party||resolved.worldBoss||resolved.pvp)&&resolved.character&&responseInstance.state&&responseInstance.state.members&&
    responseInstance.state.members.some((member)=>String(member.id)===String(resolved.character.id)))
    responseInstance.state.activeCharacterId=String(resolved.character.id);
  const responseBody={ok:true,elapsed:result.elapsed||0,terminalReason:result.terminalReason||null,
    instance:responseInstance,account:accountPublicView(await ensureAccountWallet(db,acc)),
    characters:(result.characters||[])
      .filter((character)=>Number(character.account_id)===Number(acc.id)).map(charSummaryWithGold(acc))};
  if(pvpRespCache){
    const raw=JSON.stringify(responseBody);
    pvpRespCache.set(pvpRespKey,{at:Date.now(),raw});
    if(pvpRespCache.size>64)pvpRespCache.clear();
    return {code:200,body:{__raw:raw}};
  }
  return {code:200,body:responseBody};
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

/* Charm assign/clear dentro de instância ativa: o assign (p.charmRace) é por
 * personagem e vive dentro do p autoritativo — patch dedicado igual ammo,
 * senão a extração terminal regravaria o mapa antigo e a associação sumia. */
async function charmInstanceOp(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),expected=Number(body.expected_version),instanceId=String(body.instance_id||""),
    op=String(body.op||""),charmId=String(body.charm||""),race=String(body.race||"");
  if(!Number.isSafeInteger(charId)||charId<=0||!Number.isSafeInteger(expected)||expected<1||
     !/^[a-f0-9]{64}$/.test(instanceId)||(op!=="assign"&&op!=="clear"&&op!=="buy"&&op!=="upgrade"))
    return {code:400,body:{ok:false,error:"INVALID_CHARM_OP",msg:"Operação de charm inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;if(!row||row.status!=="active"||String(row.instance_id)!==instanceId)
    return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  let rejection=null,applied=null;
  const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
    let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
    const item=descriptor.authority&&descriptor.authority.players&&
      descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
    if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
    const r=op==="clear"?authClearCharm(item.p,charmId)
      :op==="assign"?authAssignCharm(item.p,charmId,race)
      :op==="buy"?authBuyCharm(item.p,charmId)
      :authUpgradeCharm(item.p,charmId);
    if(!r||!r.ok){rejection=(r&&r.erro)||"Operação de charm recusada";return null;}
    applied=r;
    /* Unlock/tier é pool da CONTA: espelha o novo estágio nos demais
     * membros da mesma conta na instância (o débito de pontos fica só no
     * p do target — a extração aplica o delta uma única vez). */
    if(op==="buy"||op==="upgrade"){
      const accId=Number(item.p&&item.p.accountId)||0;
      for(const entry of descriptor.authority.players||[]){
        if(!entry||!entry.p||entry===item)continue;
        if(accId&&Number(entry.p.accountId)!==accId)continue;
        if(!accId&&String(entry.id)!==String(charId))continue;
        entry.p.charms=Object.assign({},entry.p.charms,{[r.id]:item.p.charms[r.id]});
      }
    }
    descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
  },lease);
  if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
    body:{ok:false,error:result.error,msg:rejection||"Não foi possível aplicar o charm",instance:instanceSummary(result.instance,true)}};
  await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
    status:result.instance.status,source:"charm",holderId:String(body.holder_id||"")});
  return {code:200,body:{ok:true,op,charm:(applied&&applied.id)||charmId,race,instance:instanceSummary(result.instance,true)}};
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
async function openBagYouDesire(db, body, opts) {
  opts=opts||{};
  const bagSlug=String(opts.slug||"bag-you-desire");
  const openFn=typeof opts.openFn==="function"?opts.openFn:openAuthBagYouDesire;
  const bagName=String(opts.name||"Bag You Desire");
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
      const r = openFn(entry.p);
      if (!r.ok) { rejection = r.msg; return null; }
      item = r.item;
      descriptor = materializeAuthority(descriptor); return JSON.stringify(descriptor);
    }, lease);
    if (!result.ok) return { code: result.error === "LEASE_REQUIRED" ? 423 : result.error === "INSTANCE_PATCH_REJECTED" ? 400 : 409,
      body: { ok: false, error: result.error, msg: rejection || ("Não foi possível abrir a "+bagName),
        instance: instanceSummary(result.instance, true) } };
    await publishInstanceForRow(db, result.instance, { id: result.instance.instance_id, version: Number(result.instance.version),
      status: result.instance.status, source: bagSlug, holderId: String(body.holder_id || "") });
    return { code: 200, body: { ok: true, item: item, instance: instanceSummary(result.instance, true) } };
  }
  let p = character.data; if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { p = {}; } }
  p = p && typeof p === "object" && !Array.isArray(p) ? cloneJson(p) : {};
  const r = openFn(p);
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
 * - unifica a Supply Stash (também DA CONTA) por referência, unindo por
 *   máximo stashes legadas divergentes — nunca descarta itens de outra cópia;
 * - devolve {pouch,bag,supplyStash,instances} finais para gravar no shared.
 * preSnapshot: {pouch:{slug:qtd}, bag:{slug:qtd}} da cópia do executor ANTES
 * da mutação. Roda dentro do patch da instância (síncrono). */
function syncInstancePouchCopies(players,charId,preSnapshot){
  const seller=Array.isArray(players)?players.find((e)=>e&&String(e.id)===String(charId)):null;
  if(!seller||!seller.p)return null;
  const sellerAcc=Number(seller.accountId||(seller.p&&seller.p.accountId)||0);
  if(!sellerAcc)return null;
  const deltaOf=(pre,post)=>{
    const out={};
    for(const slug of new Set([...Object.keys(pre||{}),...Object.keys(post||{})])){
      const d=(Number(post&&post[slug])||0)-(Number(pre&&pre[slug])||0);
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
    /* Containers compartilhados por REFERÊNCIA (shareInstanceContainers): a
     * mutação do executor já atingiu a cópia do líder — aplicar o delta de
     * novo cobraria o item duas vezes (ex.: vender 5 descontaria 10). */
    if(leader.p.lootPouch!==seller.p.lootPouch)
      leader.p.lootPouch=applyDelta(leader.p.lootPouch||{},pouchDelta);
    if(leader.p.bag!==seller.p.bag)
      leader.p.bag=applyDelta(leader.p.bag||{},bagDelta);
  }
  const finalPouch=Object.assign({},live.p.lootPouch||{});
  const finalBag=Object.assign({},live.p.bag||{});
  const finalDepot=Array.isArray(preSnapshot.depot)?(seller.p.depot||[]).slice():null;
  // Instâncias compartilhadas (bag/depot): a fonte da mutação é a cópia do
  // executor (pode ter ganho instâncias novas ao mover para a mochila).
  const finalInsts=(Array.isArray(seller.p.itemInstances)?seller.p.itemInstances:[])
    .filter((i)=>i&&i.loc&&String(i.loc).indexOf("equip:")!==0)
    .map((i)=>Object.assign({},i));
  for(const entry of players){
    if(!entry||!entry.p)continue;
    if(Number(entry.accountId||(entry.p&&entry.p.accountId)||0)!==sellerAcc)continue;
    /* Mantém a referência ÚNICA por conta (shareInstanceContainers): clones
     * separados por membro voltariam a divergir na próxima mutação. */
    live.p.lootPouch=live.p.lootPouch||{};
    live.p.bag=live.p.bag||{};
    live.p.supplyStash=live.p.supplyStash||{};
    entry.p.lootPouch=live.p.lootPouch;
    entry.p.bag=live.p.bag;
    if(finalDepot)entry.p.depot=finalDepot;
    if(entry.p.supplyStash!==live.p.supplyStash){
      // Stashes legadas por personagem podem divergir: une por máximo antes
      // de unificar a referência (mesma regra do shareInstanceContainers).
      const b=entry.p.supplyStash;
      if(b)for(const slug of Object.keys(b)){
        const n=Math.max(0,Math.floor(Number(b[slug])||0));
        if(n>(Number(live.p.supplyStash[slug])||0))live.p.supplyStash[slug]=n;
      }
      entry.p.supplyStash=live.p.supplyStash;
    }
    const ownEquip=(Array.isArray(entry.p.itemInstances)?entry.p.itemInstances:[])
      .filter((i)=>i&&i.loc&&String(i.loc).indexOf("equip:")===0);
    entry.p.itemInstances=finalInsts.map((i)=>Object.assign({},i)).concat(ownEquip);
    /* Baseline da pouch acompanha o estado sincronizado: a extração
     * terminal só aplica o delta POSTERIOR a este sync (loot novo), sem
     * descontar de novo o que já foi gravado no shared. */
    entry.p._pouchBase=Object.assign({},finalPouch);
  }
  return {pouch:finalPouch,bag:finalBag,supplyStash:Object.assign({},live.p.supplyStash||{}),instances:finalInsts,
    ...(finalDepot?{depot:finalDepot}:{})};
}

/* Grava o resultado sincronizado de uma mutação de pouch no shared da conta
 * (accounts.shared_inventory) — roda DEPOIS do patch da instância. Publica um
 * evento "character" para o SSE avisar as OUTRAS abas/dispositivos da conta
 * (o cliente re-busca /api/me, que agora traz o sharedInventory, e aplica em
 * tempo real). */
async function persistSharedPouchSync(db,acc,synced){
  if(!synced||!SharedInv||typeof db.accountSharedInventory!=="function")return;
  try{
    const apply=(shared)=>{
      shared.lootPouch=Object.assign({},synced.pouch||{});
      if(synced.bag)shared.bag=Object.assign({},synced.bag||{});
      if(Array.isArray(synced.depot))shared.depot=synced.depot.slice();
      if(synced.supplyStash)shared.supplyStash=Object.assign({},synced.supplyStash);
      if(Array.isArray(synced.instances))
        shared.itemInstances=synced.instances.map((i)=>Object.assign({},i));
    };
    /* Mesma tx FOR UPDATE do split: sem isso o read-modify-write solto era
     * last-writer-wins contra o claim — o blob velho sobrescrevia o baú
     * coletado (reward "voltava") ou o sync do equip (item sumia). */
    if(typeof db.accountSharedInventoryMutate==="function")
      await db.accountSharedInventoryMutate(acc.id,apply);
    else{
      const shared=await db.accountSharedInventory(acc.id);
      apply(shared);
      await db.setAccountSharedInventory(acc.id,shared);
    }
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
/* Alavanca da Annihilator: marca p.annihilatorLever nos players da
 * instância; o tick consome o flag e dispara teleporte + 6 demons (o
 * visual_state do checkpoint não carrega campos arbitrários). */
async function annihilatorLeverPull(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
  if(!Number.isSafeInteger(charId)||charId<=0||!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
    return {code:400,body:{ok:false,error:"INVALID_ANNIHILATOR_LEVER",msg:"Alavanca inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))return {code:403,body:{ok:false,msg:"Personagem não pertence à conta"}};
  const previousClaims=[];
  if(body.reward||body.preview||body.quantities!==undefined)for(const c of await db.charactersOf(acc.id)){
    let p=c.data;try{if(typeof p==="string")p=JSON.parse(p);}catch(e){p=null;}
    if(p?.quests?.annihilator?.completed)previousClaims.push(String(c.id));
  }
  let rejection=null,claimed=null;
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(!row||row.status!=="active"||String(row.instance_id)!==instanceId)
    return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
  if(body.preview===true){
    let descriptor;try{descriptor=typeof row.state==="string"?JSON.parse(row.state):cloneJson(row.state);}catch(e){return {code:400,body:{ok:false,msg:"Instância inválida"}};}
    const offer=annihilatorRewardOffer(descriptor.authority,charId,previousClaims);
    return {code:offer.ok?200:409,body:{...offer,instance:instanceSummary(row,true)}};
  }
  const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
    let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
    if(descriptor.authority?.questId!=="annihilator"||!descriptor.authority.players?.some((p)=>String(p.id)===String(charId)))return null;
    if(body.quantities!==undefined||body.reward){
      claimed=body.quantities!==undefined?claimAnnihilatorCart(descriptor.authority,charId,body.quantities,previousClaims):
        claimAnnihilatorReward(descriptor.authority,charId,String(body.reward),previousClaims);
      if(!claimed.ok){rejection=claimed.msg;return null;}
    }else for(const pl of descriptor.authority.players)if(pl&&pl.p)pl.p.annihilatorLever=true;
    descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
  },lease);
  if(!result.ok)return {code:409,body:{ok:false,error:result.error,msg:rejection||"Não foi possível interagir com a Annihilator",instance:instanceSummary(result.instance,true)}};
  await publishInstanceForRow(db,result.instance,{id:instanceId,version:Number(result.instance.version),status:result.instance.status,source:"annihilator-chest",holderId:String(body.holder_id||"")});
  return {code:200,body:{ok:true,...(claimed||{}),instance:instanceSummary(result.instance,true)}};
}

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
      if(!moveItemToSupplyStash(item.p,{source,slug})){rejection="Não foi possível mover o item (stash cheia ou item ausente)";return null;}
      synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível mover para a Supply Stash",
        instance:instanceSummary(result.instance,true)}};
    // Espelha pouch/bag/stash no shared da conta IMEDIATAMENTE — sem isso o
    // item movido "ressuscitava" na Loot Pouch no próximo load (a pouch
    // compartilhada ainda o tinha).
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"stash-move",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
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
      if(!moveItemFromSupplyStash(item.p,payload)){rejection="Não foi possível retirar o item (ausente ou mochila cheia)";return null;}
      synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível retirar da Supply Stash",
        instance:instanceSummary(result.instance,true)}};
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"stash-withdraw",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
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
      if(!equipFromSupplyStash(item.p,slug,slot||undefined)){rejection="Não foi possível equipar (stash vazia, vocação ou nível)";return null;}
      synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível equipar da Supply Stash",
        instance:instanceSummary(result.instance,true)}};
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"stash-equip",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
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
  const unequip=!!body.unequip,depotAction=String(body.depot_action||"");
  const slug=depotAction?String(body.ref||""):unequip?String(body.slot||""):String(body.slug||"");
  if(!Number.isSafeInteger(charId)||charId<=0||!slug||
    (depotAction&&!["store","retrieve","equip"].includes(depotAction)))
    return {code:400,body:{ok:false,error:"INVALID_EQUIP",msg:"Equipamento inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected0=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected0)||expected0<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_EQUIP",msg:"Instância inválida para equipar"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null,synced=null,last=null;
    /* Retry no conflito de versão: um tick (ou outro clique) bumpa a version
     * entre o resolve e o patch — sem retry o equip falhava e o preview
     * otimista do cliente revertia: o item "sumia" na UI até o próximo
     * tick. Na retentativa usa a version FRESCA da row (a mutação valida
     * contra o estado real — item já movido é rejeitado com segurança). */
    for(let attempt=0;attempt<4;attempt++){
      const current=attempt===0?row:await resolveInstanceRow(db,acc,charId).then((r)=>r.row);
      if(!current||current.status!=="active"||String(current.instance_id)!==instanceId){last={ok:false,error:"INSTANCE_NOT_ACTIVE",instance:current};break;}
      const expected=attempt===0?expected0:Number(current.version);
      rejection=null;
      const result=await db.instancePatchState(current.account_id,acc.id,instanceId,expected,(serialized)=>{
        let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
        const item=descriptor.authority&&descriptor.authority.players&&
          descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
        if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
        // A bag é DA CONTA: guarda o estado antes da mutação para propagar o
        // delta às cópias dos demais personagens e gravar no shared — sem
        // isto, desequipar em um personagem não aparecia na bag de outro e o
        // tick terminal sobrescrevia o shared com a última cópia (itens
        // sumiam ao final da boss fight).
        const preSnapshot={
          pouch:Object.assign({},item.p.lootPouch||{}),
          bag:Object.assign({},item.p.bag||{}),
          ...(depotAction?{depot:(item.p.depot||[]).slice()}:{})
        };
        let r;
        if(depotAction)r=depotActionAuth(item.p,{action:depotAction,ref:slug,source:body.source,slot:body.slot,qty:body.qty});
        else if(unequip)r=unequipFromContainerAuth(item.p,String(body.slot||""),String(body.dest||"bag"));
        else r=equipFromContainerAuth(item.p,String(body.slug||""),String(body.source||"bag"),
          {instId:body.inst_id?String(body.inst_id):null});
        if(!r||!r.ok){rejection=(r&&r.msg)||"Não foi possível equipar";return null;}
        synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
        descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
      },lease);
      last=result;
      if(result.error!=="INSTANCE_VERSION_CONFLICT")break;
      synced=null; // mutação não commitou — descarta o sync desta tentativa
    }
    const result=last||{ok:false,error:"INSTANCE_VERSION_CONFLICT"};
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível equipar",
        instance:instanceSummary(result.instance,true)}};
    // Grava a bag sincronizada no shared IMEDIATAMENTE (troca de personagem
    // durante a boss fight não pode perder o item desequipado).
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"equip",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,equipped:unequip?null:String(body.slug||""),
      slot:unequip?String(body.slot||""):null,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
  }
  let p=await loadCityPlayer(db,acc,character);
  let r;
  if(depotAction)r=depotActionAuth(p,{action:depotAction,ref:slug,source:body.source,slot:body.slot,qty:body.qty});
  else if(unequip)r=unequipFromContainerAuth(p,String(body.slot||""),String(body.dest||"bag"));
  else r=equipFromContainerAuth(p,String(body.slug||""),String(body.source||"bag"),
    {instId:body.inst_id?String(body.inst_id):null});
  if(!r||!r.ok)
    return {code:400,body:{ok:false,error:"EQUIP_FAILED",msg:(r&&r.msg)||"Não foi possível equipar"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,msg:r.msg||"",
    equip:p.equip||{},bag:p.bag||{},depot:p.depot||[],lootPouch:p.lootPouch||{},itemInstances:p.itemInstances||[]})};
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
    let synced=null;
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
          const preSnapshot={
            pouch:Object.assign({},targetEntry.p.lootPouch||{}),
            bag:Object.assign({},targetEntry.p.bag||{}),
          };
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
          // Sincroniza as cópias + shared: o item saiu da bag da conta.
          synced=syncInstancePouchCopies(entries,targetId,preSnapshot);
          descriptor=materializeAuthority(descriptor);
          return JSON.stringify(descriptor);
        },lease);
      if(result.ok){
        let sharedSync=null;
        if(synced){
          await persistSharedPouchSync(db,acc,synced);
          try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
        }
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,
          version:Number(result.instance.version),status:result.instance.status,source:"equip-other",
          holderId:String(body.holder_id||"")});
        return {code:200,body:{ok:true,equipped:slug,slot:null,instance:instanceSummary(result.instance,true),
          ...(sharedSync?{sharedInventory:sharedSync}:{})}};
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

/* "Usar em <char>" dos catalisadores de proficiência (Lesser/Proficiency/
 * Greater): consome 1 unidade da mochila COMPARTILHADA da conta e credita
 * o XP oficial na proficiência da arma que o alvo empunha. Regras: */
async function useProficiencyCatalyst(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const sourceId=Number(body.char_id),targetId=Number(body.target_id);
  const slug=String(body.slug||"");
  const xpAmt=PROF_CATALYSTS_MOD?PROF_CATALYSTS_MOD.proficiencyCatalystXp(slug):0;
  if(!Number.isSafeInteger(sourceId)||sourceId<=0||!Number.isSafeInteger(targetId)||targetId<=0||!xpAmt)
    return {code:400,body:{ok:false,error:"INVALID_CATALYST_USE",msg:"Uso de catalisador inválido"}};
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
        msg:"O personagem alvo está fora da caçada ativa — a mochila compartilhada está dentro da instância."}};
    let rejection=null;
    let last=null;
    let synced=null;
    let out=null;
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
          const tp=targetEntry.p;
          /* A bag é REF COMPARTILHADA entre os membros da conta
           * (shareInstanceContainers) — debitar nela vale para todos. */
          if((Number(tp.bag&&tp.bag[slug])||0)<1){
            rejection="O catalisador não está na mochila da conta";return null;}
          const r=PROF_CATALYSTS_MOD.proficiencyCatalystUse(tp,slug);
          if(!r||!r.ok){rejection=(r&&r.msg)||"O alvo não empunha arma com proficiência";return null;}
          const preSnapshot={bag:Object.assign({},tp.bag||{}),pouch:Object.assign({},tp.lootPouch||{})};
          tp.bag[slug]-=1;if(tp.bag[slug]<=0)delete tp.bag[slug];
          synced=syncInstancePouchCopies(entries,targetId,preSnapshot);
          out={weapon:r.weapon,gained:r.gained,xp:r.xp,levelUp:r.levelUp,prof:tp.prof||null};
          descriptor=materializeAuthority(descriptor);
          return JSON.stringify(descriptor);
        },lease);
      if(result.ok){
        let sharedSync=null;
        if(synced){
          await persistSharedPouchSync(db,acc,synced);
          try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
        }
        await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,
          version:Number(result.instance.version),status:result.instance.status,source:"use-catalyst",
          holderId:String(body.holder_id||"")});
        return {code:200,body:Object.assign({ok:true,instance:instanceSummary(result.instance,true),
          ...(sharedSync?{sharedInventory:sharedSync}:{})},out||{})};
      }
      if(result.error==="LEASE_REQUIRED")
        return {code:423,body:{ok:false,error:"LEASE_REQUIRED",msg:"O controle desta conta foi transferido antes do uso terminar."}};
      if(result.error!=="INSTANCE_VERSION_CONFLICT")
        return {code:400,body:{ok:false,error:result.error,msg:rejection||"Não foi possível usar o catalisador",
          instance:instanceSummary(result.instance,true)}};
      last=result;
    }
    return {code:409,body:{ok:false,error:"INSTANCE_VERSION_CONFLICT",msg:"A instância foi alterada por outra sessão.",
      instance:last&&instanceSummary(last.instance,true)}};
  }
  // Cidade: a mochila compartilhada vem hidratada no blob do alvo; consome
  // + aplica XP e o persistClaimedPlayer reconcilia shared + save mirror.
  let p=await loadCityPlayer(db,acc,targetChar);
  if((Number(p.bag&&p.bag[slug])||0)<1)
    return {code:400,body:{ok:false,error:"NO_ITEM",msg:"O catalisador não está na mochila da conta"}};
  const r=PROF_CATALYSTS_MOD.proficiencyCatalystUse(p,slug);
  if(!r||!r.ok)
    return {code:400,body:{ok:false,error:"USE_FAILED",msg:(r&&r.msg)||"O alvo não empunha arma com proficiência"}};
  p.bag[slug]-=1;if(p.bag[slug]<=0)delete p.bag[slug];
  const persisted=await persistClaimedPlayer(db,acc,targetChar,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    bag:p.bag||{},prof:p.prof||{},
    weapon:r.weapon,gained:r.gained,xp:r.xp,levelUp:r.levelUp})};
}

/** Move Loot Pouch → backpack (autoritativo). lootPouch é protected no PUT. */
/** Move backpack → Loot Pouch (autoritativo). A bag é compartilhada e, no
 * PUT comum, o movimento local "voltava" (o servidor restaura a bag da
 * instância/tick e o shared). Espelho do movePouchToBag (instância + cidade). */
async function moveBagToPouch(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||"");
  const qty=body.qty!=null?Number(body.qty):null;
  const instId=body.inst_id?String(body.inst_id):null;
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_BAG_TO_POUCH",msg:"Movimento backpack → Loot Pouch inválido"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_BAG_TO_POUCH",msg:"Instância inválida para o movimento"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null,synced=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      const preSnapshot={pouch:Object.assign({},item.p.lootPouch||{}),bag:Object.assign({},item.p.bag||{})};
      if(!moveBagToPouchAuth(item.p,slug,qty,instId)){
        rejection="Não foi possível mover (item ausente na mochila ou item tierado)";
        return null;
      }
      synced=syncInstancePouchCopies(descriptor.authority.players,charId,preSnapshot);
      descriptor=materializeAuthority(descriptor);return JSON.stringify(descriptor);
    },lease);
    if(!result.ok)return {code:result.error==="LEASE_REQUIRED"?423:result.error==="INSTANCE_PATCH_REJECTED"?400:409,
      body:{ok:false,error:result.error,msg:rejection||"Não foi possível mover para a Loot Pouch",
        instance:instanceSummary(result.instance,true)}};
    let sharedSync=null;
    if(synced){
      await persistSharedPouchSync(db,acc,synced);
      try{sharedSync=await db.accountSharedInventory(acc.id);}catch(e){/* opcional */}
    }
    await publishInstanceForRow(db,result.instance,{id:result.instance.instance_id,version:Number(result.instance.version),
      status:result.instance.status,source:"bag-to-pouch",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
  }
  let p=await loadCityPlayer(db,acc,character);
  if(!moveBagToPouchAuth(p,slug,qty,instId))
    return {code:400,body:{ok:false,error:"BAG_TO_POUCH_FAILED",msg:"Não foi possível mover (item ausente na mochila ou item tierado)"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,
    lootPouch:p.lootPouch||{},bag:p.bag||{},itemInstances:p.itemInstances||[]})};
}

/** Destrói um item da mochila (autoritativo). A bag é compartilhada e o PUT
 * comum não persiste a destruição (em combate o tick restaura; na cidade o
 * shared volta) — o item "voltava" para a backpack. Espelho do pouch-destroy. */
async function destroyBagItem(db,body){
  const acc=await db.findAccountByToken(body.token);if(!acc)return {code:401,body:{ok:false,msg:"Sessão inválida"}};
  const denied=await requireLease(db,acc,body);if(denied)return denied;
  const charId=Number(body.char_id),slug=String(body.slug||"");
  const instId=body.inst_id?String(body.inst_id):null;
  if(!Number.isSafeInteger(charId)||charId<=0||!slug)
    return {code:400,body:{ok:false,error:"INVALID_BAG_DESTROY",msg:"Destruição da mochila inválida"}};
  const character=await db.findCharacter(charId);
  if(!character||Number(character.account_id)!==Number(acc.id))
    return {code:403,body:{ok:false,error:"INSTANCE_CHARACTER_NOT_OWNED",msg:"Personagem não pertence à conta"}};
  const lease={holderId:String(body.holder_id),secretHash:leaseHash(body.lease_token),now:Date.now()};
  const resolved=await resolveInstanceRow(db,acc,charId);if(resolved.error)return resolved.error;
  const row=resolved.row;
  if(row&&row.status==="active"){
    const expected=Number(body.expected_version),instanceId=String(body.instance_id||"");
    if(!Number.isSafeInteger(expected)||expected<1||!/^[a-f0-9]{64}$/.test(instanceId))
      return {code:400,body:{ok:false,error:"INVALID_BAG_DESTROY",msg:"Instância inválida para destruir item"}};
    if(String(row.instance_id)!==instanceId)
      return {code:409,body:{ok:false,error:"INSTANCE_NOT_ACTIVE",msg:"Instância ativa não encontrada"}};
    let rejection=null,destroyed=0,synced=null;
    const result=await db.instancePatchState(row.account_id,acc.id,instanceId,expected,(serialized)=>{
      let descriptor=null;try{descriptor=typeof serialized==="string"?JSON.parse(serialized):cloneJson(serialized);}catch(e){return null;}
      const item=descriptor.authority&&descriptor.authority.players&&
        descriptor.authority.players.find((entry)=>String(entry.id)===String(charId));
      if(!item||!item.p){rejection="Personagem não participa desta instância";return null;}
      const preSnapshot={pouch:Object.assign({},item.p.lootPouch||{}),bag:Object.assign({},item.p.bag||{})};
      destroyed=destroyAuthBagItem(item.p,slug,instId);
      if(!destroyed){rejection="Item não encontrado na mochila";return null;}
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
      status:result.instance.status,source:"bag-destroy",holderId:String(body.holder_id||"")});
    return {code:200,body:{ok:true,destroyed,slug,instance:instanceSummary(result.instance,true),
      ...(sharedSync?{sharedInventory:sharedSync}:{})}};
  }
  let p=await loadCityPlayer(db,acc,character);
  const destroyed=destroyAuthBagItem(p,slug,instId);
  if(!destroyed)
    return {code:400,body:{ok:false,error:"BAG_ITEM_MISSING",msg:"Item não encontrado na mochila"}};
  const persisted=await persistClaimedPlayer(db,acc,character,p,lease);
  if(persisted.code!==200)return persisted;
  return {code:200,body:Object.assign({},persisted.body,{ok:true,destroyed,slug,
    bag:p.bag||{},itemInstances:p.itemInstances||[]})};
}

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

/* Encerramento NORMAL (sem terminalReason da autoridade — ex.: "returned-city"
 * ou substituição por boss novo) precisa extrair os containers finais (loot
 * da Loot Pouch, bag etc.) para o shared da conta. Sem isso o loot ficava só
 * no save do personagem e o shared antigo o "mascarava" ao trocar de
 * personagem/reload (e a venda da pouch parecia nunca acontecer). */
function finalizeEndStateTick(serialized,elapsed,checkpointAt){
  const out=advanceAuthorityState(serialized,elapsed,checkpointAt,null,
    {stepBudgetMs:AUTH_END_STEP_BUDGET_MS});
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
}
/* Encerra a linha ativa da conta com o tick terminal (extrai pouch/chest →
 * shared da conta) para liberar o slot antes de um create novo. */
async function endOwnActiveInstance(db,accountId,reason,lease){
  const live=await db.instanceGet(accountId);
  if(!live||live.status!=="active")return null;
  try{
    const tick=await db.instanceAuthorityTick(accountId,Number(live.version),Date.now(),3600000,finalizeEndStateTick,lease);
    if(tick&&tick.ok&&tick.instance&&Number(tick.instance.version)!==Number(live.version))live.version=Number(tick.instance.version);
  }catch(e){/* tick final best-effort */}
  try{return await db.instanceEnd(accountId,live.instance_id,live.version,reason||"replaced",lease);}
  catch(e){return null;}
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
  // Participante de batalha PvP: "sair" só desprende — a guerra continua
  // para os demais e só termina pelo placar/tempo no controlador.
  if(typeof global.__PVP!=="undefined"&&global.__PVP){
    const pvpShare=global.__PVP.sharedForAccount(acc.id);
    if(pvpShare)
      return {code:200,body:{ok:true,sharedDetached:true,pvp:true,instance:null}};
  }
  /* "Sair" só desprende quando a sala é de OUTRA conta (convidado de party
   * estrangeira). Membro da conta dona encerra de verdade — a instância
   * compartilhada pertence à conta dele; o líder é só a ordem do roster. */
  if(resolved.row&&String(resolved.row.instance_id)===id&&resolved.party&&resolved.character&&
     Number(resolved.character.id)!==Number(resolved.party.leader_id)&&resolved.shared)
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
      const tickResult=await db.instanceAuthorityTick(ownerId,expected,Date.now(),3600000,finalizeEndStateTick,lease);
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
          const retry=await db.instanceAuthorityTick(ownerId,expected,Date.now()+100,3600000,finalizeEndStateTick,lease);
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
      .map(charSummaryWithGold(acc))}};
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
  return {code:200,body:{ok:true,character:accountCharacterSummary(updated,acc.gold)}};
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

/* ------------------------- recuperação de senha -------------------------
 * Fluxo em 2 passos, sem token (o jogador não está logado):
 *   POST /api/account/recover         {login|email}  → código por e-mail
 *   POST /api/account/recover/confirm {login, code, password} → troca senha
 * A resposta do passo 1 é sempre genérica para não vazar quais logins/e-mails
 * existem. O código reusa o formato do e-mail (6 dígitos, 10 min) mas em
 * colunas próprias para não colidir com uma verificação pendente. Trocar a
 * senha revoga TODAS as sessões da conta. */
const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000;
async function requestPasswordRecovery(db, body) {
  const ident = String(body.login || body.email || "").trim().slice(0, 120);
  const generic = { code: 200, body: { ok: true,
    msg: "Se a conta existir, enviamos um código para o e-mail cadastrado." } };
  if (!ident) return generic;
  let acc = await db.findAccountByLogin(ident);
  if (!acc && EMAIL_RE.test(ident) && typeof db.findAccountByEmail === "function")
    acc = await db.findAccountByEmail(ident);
  if (!acc || !EMAIL_RE.test(String(acc.email || ""))) return generic;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  if (typeof db.setAccountRecoveryCode === "function")
    await db.setAccountRecoveryCode(acc.id, code, Date.now() + RECOVERY_CODE_TTL_MS);
  const sent = await mailer.sendRecoveryCode(acc.email, code, acc.login);
  return { code: 200, body: { ok: true,
    msg: "Se a conta existir, enviamos um código para o e-mail cadastrado.",
    emailSent: !!sent.ok,
    ...(TEST_SERVER ? { devCode: code } : {}) } };
}
async function confirmPasswordRecovery(db, body) {
  const login = String(body.login || "").trim().slice(0, 32);
  const code = String(body.code || "").trim();
  const password = String(body.password || "");
  if (!login) return { code: 400, body: { ok: false, msg: "Informe o login da conta." } };
  if (!/^\d{6}$/.test(code)) return { code: 400, body: { ok: false, msg: "Código inválido." } };
  if (password.length < 1) return { code: 400, body: { ok: false, msg: "Informe a nova senha." } };
  let acc = await db.findAccountByLogin(login);
  if (!acc && EMAIL_RE.test(login) && typeof db.findAccountByEmail === "function")
    acc = await db.findAccountByEmail(login);
  if (!acc) return { code: 400, body: { ok: false, msg: "Código incorreto ou expirado." } };
  const stored = String(acc.recovery_code || "");
  const expiresAt = Number(acc.recovery_code_expires) || 0;
  if (!stored || expiresAt < Date.now() || code !== stored)
    return { code: 400, body: { ok: false, msg: "Código incorreto ou expirado." } };
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  if (typeof db.setAccountPassword === "function") await db.setAccountPassword(acc.id, hash);
  else if (typeof db.run === "function")
    await db.run("UPDATE accounts SET password_hash = ? WHERE id = ?", [hash, Number(acc.id)]);
  if (typeof db.setAccountRecoveryCode === "function")
    await db.setAccountRecoveryCode(acc.id, "", 0);
  /* Troca de senha = revoga todas as sessões (inclui a sessão do invasor,
   * se o código vazou depois de uso legítimo). */
  if (typeof db.revokeAccountSessions === "function") await db.revokeAccountSessions(acc.id);
  return { code: 200, body: { ok: true, msg: "Senha alterada. Faça login novamente." } };
}

/* ------------------------------ MARKET P2P ------------------------------ */

/* ====================== REGRAS OFICIAIS DO MARKET ======================
 * (manual do Tibia, secao 4.3.3 The Market)
 *  - fee de 2% ao criar oferta (mín 20 gp, máx 1.000.000), pago do banco;
 *  - ofertas duram 30 dias (item volta para a mochila, dinheiro pro banco);
 *  - vendedor usa itens da MOCHILA (escrow autoritativo); comprador recebe
 *    no depot compartilhado da conta (mesmo offline);
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

/* Slug pseudo-item para Tibia Coin: circula como item normal no market, mas
 * o "escrow/entrega" acontece no saldo de coins da conta — nunca na mochila. */
const MARKET_COIN_SLUG = "tibia-coin";
function marketIsCoinSlug(slug) { return String(slug || "") === MARKET_COIN_SLUG; }

/* ---- escrow do item na MOCHILA de quem cria a oferta ----
 * A oferta de venda sai da backpack do personagem (verificação autoritativa):
 * instâncias (equips com tier/imb) removem 1 instId; stacks removem `qty`.
 * Retorna {qty, tier} realmente removido, ou {error} quando não há na mochila. */
function marketTakeFromBag(p, slug, instId, qty) {
  if (!p || !slug) return { error: "Item inválido" };
  p.bag = p.bag || {};
  p.itemInstances = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  if (authItemNeedsBagInstance(slug)) {
    const want = instId ? String(instId) : null;
    const inst = p.itemInstances.find((i) => i && i.loc === "bag" &&
      String(i.slug) === String(slug) && (!want || String(i.id) === want));
    if (!inst) return { error: "Item não encontrado na mochila do personagem" };
    const tier = Math.max(0, Math.floor(Number(inst.tier) || 0));
    p.itemInstances = p.itemInstances.filter((i) => i !== inst);
    p.bag[slug] = Math.max(0, (Number(p.bag[slug]) || 0) - 1);
    if (!p.bag[slug]) delete p.bag[slug];
    return { qty: 1, tier };
  }
  const have = Math.max(0, Math.floor(Number(p.bag[slug]) || 0));
  const take = Math.min(have, Math.max(1, Math.floor(Number(qty) || 1)));
  if (take <= 0) return { error: "Item não encontrado na mochila do personagem" };
  p.bag[slug] -= take;
  if (p.bag[slug] <= 0) delete p.bag[slug];
  return { qty: take, tier: 0 };
}

/* Devolve o item à mochila (cancelamento de oferta). Instâncias voltam com o
 * tier guardado na oferta; stacks usam a regra normal de capacidade. */
function marketPutBackBagItem(p, slug, qty, tier) {
  if (!p || !slug) return { error: "Item inválido" };
  qty = Math.max(1, Math.floor(Number(qty) || 1));
  p.bag = p.bag || {};
  p.itemInstances = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  if (authItemNeedsBagInstance(slug)) {
    for (let i = 0; i < qty; i++) {
      p.itemInstances.push({
        id: "srv-" + Date.now().toString(36) + "-" +
          Math.floor(Math.random() * 1e6).toString(36) + "-" + i,
        slug, loc: "bag", tier: Math.max(0, Math.floor(Number(tier) || 0)),
      });
      p.bag[slug] = (Number(p.bag[slug]) || 0) + 1;
    }
    return { qty };
  }
  if (!authAddItemToBag(p, slug, qty))
    return { error: "Mochila sem espaço para devolver o item" };
  return { qty };
}

/* Muta a mochila do personagem pelo caminho autoritativo (mesmo de bag-sell):
 * instância ativa → instancePatchState; cidade → loadCityPlayer+persist. */
async function marketMutateBag(db, acc, character, body, mutate, source) {
  const lease = { holderId: String(body.holder_id), secretHash: leaseHash(body.lease_token), now: Date.now() };
  const resolved = await resolveInstanceRow(db, acc, character.id);
  if (resolved.error) return resolved.error;
  const row = resolved.row;
  if (row && row.status === "active") {
    const expected = Number(body.expected_version), instanceId = String(body.instance_id || "");
    if (!Number.isSafeInteger(expected) || expected < 1 || !/^[a-f0-9]{64}$/.test(instanceId))
      return { code: 400, body: { ok: false, error: "INVALID_MARKET_SELL",
        msg: "Instância inválida para operação do market" } };
    if (String(row.instance_id) !== instanceId)
      return { code: 409, body: { ok: false, error: "INSTANCE_NOT_ACTIVE",
        msg: "Instância ativa não encontrada" } };
    let rejection = null, output = null;
    const result = await db.instancePatchState(row.account_id, acc.id, instanceId, expected, (serialized) => {
      let descriptor = null;
      try { descriptor = typeof serialized === "string" ? JSON.parse(serialized) : cloneJson(serialized); }
      catch (e) { return null; }
      const item = descriptor.authority && descriptor.authority.players &&
        descriptor.authority.players.find((e) => String(e.id) === String(character.id));
      if (!item || !item.p) { rejection = "Personagem não participa desta instância"; return null; }
      const r = mutate(item.p);
      if (!r || r.error) { rejection = (r && r.error) || "Item não encontrado na mochila"; return null; }
      output = r;
      descriptor = materializeAuthority(descriptor);
      return JSON.stringify(descriptor);
    }, lease);
    if (!result.ok)
      return { code: result.error === "LEASE_REQUIRED" ? 423 : result.error === "INSTANCE_PATCH_REJECTED" ? 400 : 409,
        body: { ok: false, error: result.error, msg: rejection || "Não foi possível atualizar a mochila",
          instance: instanceSummary(result.instance, true) } };
    await publishInstanceForRow(db, result.instance, { id: result.instance.instance_id,
      version: Number(result.instance.version), status: result.instance.status,
      source: source || "market-bag", holderId: String(body.holder_id || "") });
    return { ok: true, output, extra: { instance: instanceSummary(result.instance, true) } };
  }
  let p = await loadCityPlayer(db, acc, character);
  const r = mutate(p);
  if (!r || r.error)
    return { code: 400, body: { ok: false, error: "MARKET_BAG",
      msg: (r && r.error) || "Item não encontrado na mochila" } };
  const persisted = await persistClaimedPlayer(db, acc, character, p, lease);
  if (persisted.code !== 200) return persisted;
  return { ok: true, output: r, extra: { bag: p.bag || {},
    itemInstances: p.itemInstances || [], saveVersion: persisted.body.saveVersion,
    character: persisted.body.character } };
}

/* Entrega um item comprado no DEPOT compartilhado da conta do comprador —
 * funciona com o comprador offline (o cliente do próprio comprador aplica o
 * item via `marketReceiveItem` quando ele mesmo compra; isto cobre o caso em
 * que a contra-parte da oferta não é quem disparou a request). */
async function marketDeliverToDepot(db, accountId, slug, tier, qty) {
  if (!slug || !SharedInv || typeof db.accountSharedInventory !== "function") return false;
  qty = Math.max(1, Math.floor(Number(qty) || 1));
  /* Entrega no depot compartilhado dentro da tx atômica — o write solto do
   * blob clobberava mutations concorrentes (claim de reward/equip do tick). */
  const deliver = (shared) => {
    shared.depot = Array.isArray(shared.depot) ? shared.depot : [];
    shared.itemInstances = Array.isArray(shared.itemInstances) ? shared.itemInstances : [];
    if (authItemNeedsBagInstance(slug)) {
      for (let i = 0; i < qty; i++) {
        shared.seq = (Number(shared.seq) || 0) + 1;
        const inst = { id: "mk-" + shared.seq.toString(36) + "-" + i,
          slug, loc: "depot", tier: Math.max(0, Math.floor(Number(tier) || 0)) };
        shared.itemInstances.push(inst);
        shared.depot.push(inst.id);
      }
    } else {
      for (let i = 0; i < qty; i++) shared.depot.push(slug);
    }
  };
  if (typeof db.accountSharedInventoryMutate === "function") {
    const s = await db.accountSharedInventoryMutate(accountId, deliver);
    if (!s) return false;
  } else {
    if (typeof db.setAccountSharedInventory !== "function") return false;
    const shared = await db.accountSharedInventory(accountId);
    deliver(shared);
    await db.setAccountSharedInventory(accountId, shared);
  }
  publishSync(accountId, "character", { action: "market-delivery", slug, qty });
  return true;
}

/* Valida token + lease + posse do personagem para operações de mochila. */
async function marketBagActor(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { error: { code: 401, body: { ok: false, msg: "Sessão inválida" } } };
  const denied = await requireLease(db, acc, body);
  if (denied) return { error: denied };
  const charId = Number(body.char_id);
  if (!Number.isSafeInteger(charId) || charId <= 0)
    return { error: { code: 400, body: { ok: false, error: "MARKET_CHAR",
      msg: "Personagem inválido para o market" } } };
  const character = await db.findCharacter(charId);
  if (!character || Number(character.account_id) !== Number(acc.id))
    return { error: { code: 403, body: { ok: false, error: "MARKET_CHAR_NOT_OWNED",
      msg: "Personagem não pertence à conta" } } };
  return { acc, character };
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

  // ---- fee (2%) pago do gold da conta (sem banco separado) ----
  const feePago = await db.payMarketFee(acc.id, fee);
  if (!feePago) return { code: 400, body: { ok: false, msg: "Ouro insuficiente na conta para a taxa (2%)" } };

  // ---- pagamentos/travas conforme o tipo ----
  let escrow = null; // estado extra p/ o cliente reconciliar (instância/bag)
  let offerQty = qty, offerTier = Math.max(0, Math.floor(Number(body.tier) || 0));
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
      return { code: 400, body: { ok: false, msg: "Ouro insuficiente na conta para a oferta" } };
    }
    if (!body.slug) return { code: 400, body: { ok: false, msg: "Item inválido" } };
  } else if (marketIsCoinSlug(body.slug)) {
    // ---- escrow: Tibia Coin sai do SALDO DE COINS da conta ----
    if (body.price_tc) {
      await db.refundMarketFee(acc.id, fee);
      return { code: 400, body: { ok: false, msg: "Tibia Coin não pode ser vendida por TC" } };
    }
    if (qty > (acc.coins || 0)) {
      await db.refundMarketFee(acc.id, fee);
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    }
    await db.updateCoins(acc.id, (acc.coins || 0) - qty);
    offerQty = qty; offerTier = 0;
  } else {
    if (!body.slug) {
      await db.refundMarketFee(acc.id, fee);
      return { code: 400, body: { ok: false, msg: "Item inválido" } };
    }
    // ---- escrow: o item sai da MOCHILA do personagem que cria a oferta ----
    const actor = await marketBagActor(db, body);
    if (actor.error) { await db.refundMarketFee(acc.id, fee); return actor.error; }
    const debit = await marketMutateBag(db, acc, actor.character, body,
      (p) => marketTakeFromBag(p, String(body.slug), body.inst_id ? String(body.inst_id) : null, qty),
      "market-sell");
    if (debit.code) { await db.refundMarketFee(acc.id, fee); return debit; }
    offerQty = debit.output.qty;
    offerTier = debit.output.tier;
    escrow = debit.extra || null;
  }

  // duração fixa: 30 dias (regra oficial)
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  const offer = await db.createMarketOffer({
    seller_id: acc.id,
    seller_name: charName || acc.login,
    kind,
    slug: (kind === "item" || kind === "buy") ? body.slug : null,
    tier: offerTier,
    data: (kind === "item" || kind === "buy") ? (body.data || null) : null,
    qty: offerQty,
    price,
    price_tc: body.price_tc ? 1 : 0,
    expires_at: expires,
  });

  // ---- MATCH AUTOMATICO: casa com contra-oferta existente ----
  const matched = await marketTryMatch(db, offer, acc, charName),balances=await marketBalances(db,acc.id);
  return { code: 201, body: Object.assign({ ok: true, offer, fee, matched },balances,escrow||{}) };
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
    // vendedor (nova) recebe no banco; comprador (melhor) recebe o item —
    // entrega server-side no depot compartilhado (pode estar offline).
    // Tibia Coin credita o saldo de coins da conta do comprador.
    await db.addAccountMarketGold(acc.id, valor);
    if (marketIsCoinSlug(slug)) {
      const buyer = await db.findAccountById(melhor.seller_id);
      if (buyer) await db.updateCoins(buyer.id, (buyer.coins || 0) + q);
    } else await marketDeliverToDepot(db, melhor.seller_id, slug, tier, q);
    return { mode: "sell-matched", qty: q, price: melhor.price, tier, coins: marketIsCoinSlug(slug) ? q : 0,
      against: melhor.seller_name || melhor.seller_id, fee: marketFee(nova.price) };
  } else {
    // comprador (nova) recebe o item; vendedor (melhor) recebe no banco
    await db.addAccountMarketGold(melhor.seller_id, valor);
    if (marketIsCoinSlug(slug)) await db.updateCoins(acc.id, (acc.coins || 0) + q);
    return { mode: "buy-matched", qty: q, price: melhor.price, tier: melhor.tier || 0, coins: marketIsCoinSlug(slug) ? q : 0,
      against: melhor.seller_name || melhor.seller_id, fee: marketFee(nova.price) };
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

  let qty = Math.min(offer.qty, Math.max(1, Math.floor(Number(body.qty) || offer.qty)));

  if (offer.kind === "buy") {
    // -------- ACEITAR OFERTA DE COMPRA: quem aceita VENDE -------
    // o item sai da MOCHILA de quem aceita (mesmo escrow da venda);
    // o dinheiro da oferta já está travado no banco do comprador (seller_id)
    // -> credita ao vendedor (actor) e "entrega" o item
    let escrow = null;
    if (marketIsCoinSlug(offer.slug)) {
      // Tibia Coin: debita o saldo de coins de quem aceita e credita o
      // saldo do dono da ordem — sem mochila nem depot.
      qty = Math.min(qty, Math.max(0, Math.floor(Number(acc.coins) || 0)));
      if (qty <= 0)
        return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
      await db.updateCoins(acc.id, (acc.coins || 0) - qty);
    } else {
      const actor = await marketBagActor(db, body);
      if (actor.error) return actor.error;
      const debit = await marketMutateBag(db, acc, actor.character, body,
        (p) => marketTakeFromBag(p, offer.slug, body.inst_id ? String(body.inst_id) : null, qty),
        "market-accept-buy");
      if (debit.code) return debit;
      qty = debit.output.qty; // instâncias saem 1 por vez
      escrow = debit.extra || null;
    }
    const valor = offer.price * qty;
    await db.addAccountMarketGold(acc.id, valor);
    if (marketIsCoinSlug(offer.slug)) {
      const buyer = await db.findAccountById(offer.seller_id);
      if (buyer) await db.updateCoins(buyer.id, (buyer.coins || 0) + qty);
    } else {
      // o item vai para o depot do dono da ordem de compra (pode estar offline)
      await marketDeliverToDepot(db, offer.seller_id, offer.slug, offer.tier || 0, qty);
    }
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
      },balances,escrow||{}),
    };
  }

  // -------- COMPRA NORMAL (sell offer / TC) -------
  const valor = offer.price * qty;
  if (offer.price_tc) {
    if ((acc.coins || 0) < valor)
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
    await db.updateCoins(acc.id, (acc.coins || 0) - valor);
    const seller = await db.findAccountById(offer.seller_id);
    if (seller) await db.updateCoins(seller.id, (seller.coins || 0) + valor);
  } else {
    // gold: usa o gold compartilhado da conta
    const ok = await db.payMarketGold(acc.id, valor);
    if (!ok) return { code: 400, body: { ok: false, msg: "Ouro insuficiente na conta" } };
    await db.addAccountMarketGold(offer.seller_id, valor);
    if ((offer.kind === "coins" || marketIsCoinSlug(offer.slug)) && qty > 0) {
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
      item: (offer.kind === "item" && !marketIsCoinSlug(offer.slug))
        ? { slug: offer.slug, tier: offer.tier, data: offer.data, qty }
        : null,
      coins: (offer.kind === "coins" || marketIsCoinSlug(offer.slug)) ? qty : 0,
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
/* ------------------------------------------------- painel admin (GM) ---
 * Ferramentas cross-account da conta @admin (role=admin). Tudo exige sessão
 * admin; edição de terceiros grava direto no char alvo e, se ele estiver em
 * combate, injeta o snapshot na instância (o tick autoritativo não desfaz). */
async function adminSession(db,token){
  const acc=await db.findAccountByToken(String(token||""));
  if(!acc)return {error:{code:401,body:{ok:false,msg:"Sessão inválida"}}};
  if(acc.role!=="admin")return {error:{code:403,body:{ok:false,error:"ADMIN_ONLY",msg:"Acesso administrativo"}}};
  return {acc};
}

async function adminSearchChars(db,token,query){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  if(typeof db.adminSearchCharacters!=="function")
    return {code:500,body:{ok:false,msg:"Backend sem busca de personagens"}};
  const chars=await db.adminSearchCharacters(query,25);
  return {code:200,body:{ok:true,characters:chars}};
}

async function adminGetCharacter(db,token,charId){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  const c=await db.findCharacter(Number(charId));
  if(!c)return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  const owner=await db.findAccountById(c.account_id);
  let data={};try{data=typeof c.data==="string"?JSON.parse(c.data):(c.data||{});}catch(e){}
  return {code:200,body:{ok:true,character:{
    id:c.id,name:c.name,voc:c.voc,level:c.level,save_version:Number(c.save_version)||0,
    account_id:Number(c.account_id),account_login:owner?owner.login:"",
    data}}};
}

/* Grant em personagem de terceiros: mesma máquina do admin_grant (sanitiza,
 * wallet da CONTA do dono, patch na instância) mas sem exigir ownership —
 * a autoridade é o role=admin da sessão, não a posse do char. */
async function adminGrantCharacter(db,body,charId){
  const auth=await adminSession(db,body.token);if(auth.error)return auth.error;
  const c=await db.findCharacter(Number(charId));
  if(!c)return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  const targetAcc=await db.findAccountById(c.account_id);
  if(!targetAcc)return {code:404,body:{ok:false,msg:"Conta do personagem não encontrada"}};
  const prepared=prepareCharacterSave(c,Object.assign({},body,{expected_version:Number(c.save_version)||0}),{adminGrant:true});
  if(prepared.error)return prepared.error;
  let player={};try{player=JSON.parse(prepared.save.data);}catch(e){player={};}
  if(typeof db.setAccountGold==="function"&&player.gold!==undefined){
    const gold=Math.max(0,Math.floor(Number(player.gold)||0));
    await db.setAccountGold(targetAcc.id,gold);player.gold=gold;
    prepared.save.data=JSON.stringify(player);
  }
  // Inventário da conta ANTES do patch na instância: extrai bag/pouch/depot/
  // reward chest do grant para o shared e espelha de volta — assim a instância
  // ativa e o MySQL recebem o MESMO player canônico (sem o split, itens do
  // grant ficavam só no char e o próximo save do dono os apagava com o shared
  // antigo).
  if(SharedInv&&typeof db.accountSharedInventory==="function"){
    try{await splitSharedInventory(db,targetAcc,player,false);
      prepared.save.data=JSON.stringify(player);}catch(e){}
  }
  // Injeta no authority ANTES do MySQL — senão o próximo tick sobrescreve.
  // O lease validado é o da SESSÃO ADMIN (requester), não o do dono.
  const adminLease={holderId:String(body.holder_id||"admin"),secretHash:leaseHash(String(body.lease_token||"")),now:Date.now()};
  const patched=await applyAdminPlayerToInstance(db,targetAcc,Number(charId),player,
    body.lease_token?adminLease:null,auth.acc.id);
  if(patched&&patched.error&&patched.error!=="INSTANCE_NOT_ACTIVE")
    return {code:409,body:{ok:false,error:patched.error||"INSTANCE_PATCH_FAILED",
      msg:"Não foi possível aplicar o grant na instância ativa."}};
  const updated=await db.updateCharacter(c.id,prepared.save.voc,prepared.save.level,
    prepared.save.data,Object.assign({},prepared.save.extra,{zone:c.zone}));
  if(typeof db.snapshotAdd==="function")await db.snapshotAdd(targetAcc.id,"character",
    updated.id,updated.save_version,"admin-grant-gm",updated,true);
  publishSync(targetAcc.id,"character",{id:Number(updated.id),
    saveVersion:Number(updated.save_version),source:"admin-grant-gm"});
  await publishPartyForCharacters(db,[updated.id],"admin-grant-gm");
  return {code:200,body:{ok:true,saveVersion:Number(updated.save_version),
    character:{id:updated.id,name:updated.name,saveVersion:Number(updated.save_version)}}};
}

/* ------------------------------------------------------------ bans --- */
async function adminBanCreate(db,body){
  const auth=await adminSession(db,body.token);if(auth.error)return auth.error;
  const name=String(body.char_name||body.name||"").trim();
  const c=name?await db.findCharacterByName(name):await db.findCharacter(Number(body.char_id));
  if(!c)return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  // Conta admin nunca pode ser banida — evita o GM se trancar para fora.
  const targetAcc=await db.findAccountById(c.account_id);
  if(targetAcc&&String(targetAcc.role)==="admin")
    return {code:403,body:{ok:false,error:"CANNOT_BAN_ADMIN",msg:"Não é possível banir uma conta administradora"}};
  const days=Number(body.days);
  // days<=0 ou ausente => tempo indeterminado (until=null)
  const until=Number.isFinite(days)&&days>0?new Date(Date.now()+days*86400000).toISOString():null;
  const already=typeof db.banActiveForAccount==="function"
    ?await db.banActiveForAccount(c.account_id):null;
  if(already)return {code:409,body:{ok:false,error:"ALREADY_BANNED",
    msg:c.name+" já está banido ("+(already.until?"até "+already.until:"permanente")+")",ban:already}};
  const ban=await db.banCreate({accountId:c.account_id,characterId:c.id,charName:c.name,
    reason:String(body.reason||"").slice(0,300)||"Sem motivo informado",
    until,by:String(body.by||auth.acc.login||"admin")});
  // Derruba a sessão/lease na hora: o próximo request do banido já nega.
  try{if(SYNC_BUS)SYNC_BUS.revokeAccount(c.account_id);}catch(e){}
  try{if(typeof db.revokeAccountSessions==="function")await db.revokeAccountSessions(c.account_id);}catch(e){}
  return {code:200,body:{ok:true,ban}};
}
async function adminBanLift(db,body){
  const auth=await adminSession(db,body.token);if(auth.error)return auth.error;
  const ban=await db.banLift(Number(body.ban_id),String(body.by||auth.acc.login||"admin"));
  if(!ban)return {code:404,body:{ok:false,msg:"Ban não encontrado ou já levantado"}};
  return {code:200,body:{ok:true,ban}};
}
async function adminBanList(db,token){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  const bans=typeof db.banList==="function"?await db.banList():[];
  return {code:200,body:{ok:true,bans}};
}

/* ------------------------------ VOUCHERS (GM) -----------------------------
 * Lista/estado dos códigos de brinde definidos em store.VOUCHERS. Pause e
 * delete são overlay em voucher_state — a definição fica intacta. */
function voucherRewardSummary(def){
  const parts=[];
  if(def.vipDays)parts.push("VIP "+Math.floor(Number(def.vipDays))+"d");
  if(def.mount)parts.push("montaria "+String(def.mount));
  if(def.coins)parts.push(Math.floor(Number(def.coins))+" TC");
  if(def.coinsNt)parts.push(Math.floor(Number(def.coinsNt))+" NT TC");
  if(def.items&&def.items.length)parts.push(def.items.length+" item(ns)");
  return parts;
}
async function adminVoucherList(db,token){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  const states=typeof db.voucherStateList==="function"?await db.voucherStateList():{};
  const counts=typeof db.voucherClaimCounts==="function"?await db.voucherClaimCounts():{};
  const vouchers=Object.keys(store.VOUCHERS||{}).map((code)=>{
    const def=store.VOUCHERS[code]||{},st=states[code]||{};
    return {code,label:def.label||"",rewards:voucherRewardSummary(def),
      hasModal:!!(def.modal),claims:Number(counts[code])||0,
      paused:!!st.paused,deleted:!!st.deleted,
      updatedAt:st.updatedAt||null,updatedBy:st.updatedBy||""};
  });
  return {code:200,body:{ok:true,vouchers}};
}
async function adminVoucherDetail(db,token,code){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  code=String(code||"").toUpperCase().slice(0,40);
  const def=store.VOUCHERS&&store.VOUCHERS[code];
  if(!def)return {code:404,body:{ok:false,msg:"Voucher não encontrado"}};
  const st=typeof db.voucherStateGet==="function"?(await db.voucherStateGet(code))||{}:{};
  const claims=typeof db.voucherClaims==="function"?await db.voucherClaims(code):[];
  return {code:200,body:{ok:true,voucher:{
    code,label:def.label||"",rewards:voucherRewardSummary(def),
    paused:!!st.paused,deleted:!!st.deleted,
    updatedAt:st.updatedAt||null,updatedBy:st.updatedBy||"",claims}}};
}
async function adminVoucherSetState(db,body){
  body=body&&typeof body==="object"?body:{};
  const auth=await adminSession(db,String(body.token||""));if(auth.error)return auth.error;
  const code=String(body.code||"").toUpperCase().slice(0,40);
  if(!store.VOUCHERS||!store.VOUCHERS[code])
    return {code:404,body:{ok:false,msg:"Voucher não encontrado"}};
  if(typeof db.voucherStateSet!=="function")
    return {code:500,body:{ok:false,msg:"Backend sem estado de voucher"}};
  const action=String(body.action||"");
  const patch={pause:{paused:true},resume:{paused:false},
    delete:{deleted:true},restore:{deleted:false}}[action];
  if(!patch)return {code:400,body:{ok:false,msg:"Ação inválida"}};
  const st=await db.voucherStateSet(code,patch,String(auth.acc.login||"admin"));
  return {code:200,body:{ok:true,code,state:st}};
}

/* --------------------------------------------------- server actions --- */
/* Server save manual: flusha runtime/characters no JsonStore e avisa os
 * clientes pelo mesmo evento do save diário (broadcast "server-save"). */
async function adminServerSave(db,token){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  let flushed=false;
  try{if(typeof db._flushRuntime==="function"){db._flushRuntime();flushed=true;}}catch(e){}
  try{if(typeof pvpAuthMarkAllDirty==="function")pvpAuthMarkAllDirty();}catch(e){}
  try{if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll==="function")
    SYNC_BUS.broadcastAll("server-save",{day:new Date().toISOString().slice(0,10),manual:true});}catch(e){}
  return {code:200,body:{ok:true,flushed}};
}

/* TEMPLO: encerra a instância da party do personagem — a PT inteira volta
 * pro templo (o cliente detecta instance.ended e sai do combate). */
async function adminTeleportTemple(db,body){
  const auth=await adminSession(db,body.token);if(auth.error)return auth.error;
  const c=await db.findCharacterByName(String(body.char_name||body.name||"").trim());
  if(!c)return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
  const party=await db.partyFindByCharacter(c.id);
  let instance=null;
  if(party&&typeof db.instanceGetByParty==="function")instance=await db.instanceGetByParty(party.id);
  if(!instance)instance=await db.instanceGet(c.account_id);
  // World boss compartilhado: a sala vive na conta DONA, não na do alvo.
  if(!instance){
    const wb=global.__WORLD_BOSS&&global.__WORLD_BOSS.sharedForAccount
      ?global.__WORLD_BOSS.sharedForAccount(c.account_id):null;
    if(wb&&wb.ownerAccountId)instance=await db.instanceGet(wb.ownerAccountId);
  }
  if(!instance||instance.status!=="active")
    return {code:404,body:{ok:false,msg:c.name+" não está em combate"}};
  const ended=await db.instanceEndForced(Number(instance.account_id),"gm-temple-teleport");
  try{publishSync(Number(instance.account_id),"instance",{status:"ended",
    terminalReason:"gm-temple-teleport"});}catch(e){}
  let memberCount=0;
  try{const st=typeof instance.state==="string"?JSON.parse(instance.state):(instance.state||{});
    memberCount=Array.isArray(st.members)?st.members.length:0;}catch(e){}
  return {code:200,body:{ok:true,instance:instanceSummary(ended&&ended.instance||instance,false),
    teleported:memberCount}};
}

async function adminInstancesList(db,token){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  const list=typeof db.instanceListActive==="function"?await db.instanceListActive():[];
  return {code:200,body:{ok:true,instances:list}};
}

/* Calendário global — GET público; escrita exige role=admin.
 * action: "add" (day/title/body/kind), "update" (id + campos), "delete" (id). */
async function adminCalendarWrite(db,body){
  const auth=await adminSession(db,body.token);if(auth.error)return auth.error;
  const action=String(body.action||"");
  if(action==="add"){
    const day=String(body.day||"");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return {code:400,body:{ok:false,msg:"Dia inválido"}};
    if(!String(body.title||"").trim())return {code:400,body:{ok:false,msg:"Título obrigatório"}};
    const ev=await db.calendarAdd({day,title:body.title,body:body.body,
      kind:body.kind,created_by:auth.acc.login});
    return {code:200,body:{ok:true,event:ev}};
  }
  if(action==="update"){
    const ev=await db.calendarUpdate(Number(body.id),{day:body.day,title:body.title,
      body:body.body,kind:body.kind});
    if(!ev)return {code:404,body:{ok:false,msg:"Evento não encontrado"}};
    return {code:200,body:{ok:true}};
  }
  if(action==="delete"){
    await db.calendarDelete(Number(body.id));
    return {code:200,body:{ok:true}};
  }
  return {code:400,body:{ok:false,msg:"Ação inválida"}};
}

/* Lista de quem está online — mesma regra do contador "PLAYER ON" da
 * topbar (lease válida + instância/treino/cidade), com nome e status. */
async function adminOnlineList(db,token){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  const list=typeof db.onlineList==="function"?await db.onlineList():{players:[],total:0};
  return {code:200,body:{ok:true,players:list.players||[],total:list.total||0}};
}

/* Espectador: devolve o estado vivo da instância do personagem para o GM
 * assistir (players+mobs+grid). O GM nunca entra no estado — não ataca,
 * não é alvo e não bloqueia porque não existe para o servidor. */
async function adminSpectate(db,token,charName,instanceId){
  const auth=await adminSession(db,token);if(auth.error)return auth.error;
  let row=null,target=null;
  if(charName){
    target=await db.findCharacterByName(String(charName).trim());
    if(!target)return {code:404,body:{ok:false,msg:"Personagem não encontrado"}};
    const party=await db.partyFindByCharacter(target.id);
    if(party&&typeof db.instanceGetByParty==="function")row=await db.instanceGetByParty(party.id);
    if(!row)row=await db.instanceGet(target.account_id);
    // World boss compartilhado: a sala vive na conta dona.
    if(!row){
      const wb=global.__WORLD_BOSS&&global.__WORLD_BOSS.sharedForAccount
        ?global.__WORLD_BOSS.sharedForAccount(target.account_id):null;
      if(wb&&wb.ownerAccountId)row=await db.instanceGet(wb.ownerAccountId);
    }
  }else if(instanceId){
    const all=typeof db.instanceListActive==="function"?await db.instanceListActive():[];
    const found=all.find((r)=>String(r.instance_id)===String(instanceId));
    if(found)row=await db.instanceGet(found.account_id);
  }
  if(!row||row.status!=="active")
    return {code:404,body:{ok:false,msg:"Nenhum combate ativo para assistir"}};
  return {code:200,body:{ok:true,instance:instanceSummary(row,true),
    target:target?{id:target.id,name:target.name}:null}};
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
  // devolve o que estava travado:
  //  - oferta de venda de ITEM: item volta à mochila do dono (quando o cliente
  //    informa char_id; o escrow foi tirado dela na criação)
  //  - oferta de venda de TC: TC de volta pra conta
  //  - oferta de COMPRA (buy): dinheiro de volta ao gold da conta
  let escrow = null;
  const refundCoinsQty = offer.kind === "coins"
    ? offer.qty
    : (offer.kind === "item" && marketIsCoinSlug(offer.slug) ? offer.qty : 0);
  if (offer.kind === "item" && !refundCoinsQty && body.char_id) {
    const actor = await marketBagActor(db, body);
    if (actor.error) return actor.error;
    const back = await marketMutateBag(db, acc, actor.character, body,
      (p) => marketPutBackBagItem(p, offer.slug, offer.qty, offer.tier || 0),
      "market-cancel");
    if (back.code) return back; // mochila cheia etc. — oferta segue ativa
    escrow = back.extra || null;
  }
  await db.updateMarketOffer(offer.id, { status: "cancelled" });
  if (refundCoinsQty) {
    await db.updateCoins(acc.id, (acc.coins || 0) + refundCoinsQty);
  } else if (offer.kind === "buy") {
    await db.addAccountMarketGold(acc.id, offer.price * offer.qty);
  }
  const balances=await marketBalances(db,acc.id);
  return {
    code: 200,
    body: Object.assign({
      ok: true,
      refunded: !!escrow || !!refundCoinsQty,
      refundCoins: refundCoinsQty,
      refundGold: offer.kind === "buy" ? offer.price * offer.qty : 0,
    },balances,escrow||{}),
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
        character:result.character?accountCharacterSummary(result.character,acc.gold):null}};}
  const balances=await marketBalances(db,acc.id),character=accountCharacterSummary(result.character,acc.gold);
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

  // Caminho quente (PvP/world boss) para instancePatchState: descritor vivo
  // em memória + mutex por conta-dono — instancePatchState usa estes
  // providers quando a instância é quente (os ~24 call sites ganham de
  // graça, sem passar opts).
  db.instanceHotAuthApi = instanceHotAuthApi;
  db.instanceAuthSerialize = pvpAuthSerialize;

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
      // Batalhas PvP ao vivo sobrevivem ao restart (timer estendido pelo downtime).
      let keepPvp=[];
      try{keepPvp=await pvpResumeLiveOnBoot(db,Date.now());
        if(keepPvp.length)console.log("[boot] batalhas PvP retomadas:",keepPvp.length);}
      catch(e){console.warn("[boot] falha ao retomar PvP:",e&&e.message);}
      const ended=await db.endAllInstances("server-restart",keepPvp);
      if(ended>0)console.log("[boot] instâncias ativas encerradas (server-restart):",ended);
    }catch(e){console.warn("[boot] falha ao encerrar instâncias do restart:",e&&e.message);}
  }

  SYNC_BUS=new SyncBus({historyLimit:256,ticketTtlMs:10*60*1000});
  CHAT_BUS=new ChatBus({historyLimit:200,ticketTtlMs:10*60*1000,sendLimit:8,sendWindowMs:10000});
  // Mutes de chat persistem no DB — hidrata no boot (restart não limpa mais).
  try{
    const persisted=(typeof db.chatMuteList==="function")?await db.chatMuteList():[];
    if(persisted.length)CHAT_BUS.hydrateMutes(persisted);
  }catch(e){console.warn("[chat] hydrate mutes falhou:",e&&e.message);}
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
        terminalReason:claim.terminalReason||null,source:"worker"});
      // Notify quest controller when a quest instance ends
      if(claim.terminalReason&&global.__QUEST_CTRL&&current){
        const questCtrl=global.__QUEST_CTRL;
        const lobby=typeof questCtrl.findLobbyByInstance==="function"?questCtrl.findLobbyByInstance(current.instance_id):null;
        if(lobby)questCtrl.onSharedEnded(lobby.id,claim.terminalReason).catch((e)=>console.error("[quest] onClaim notify",e&&e.message));
      }
      // Batalha PvP encerrada pelo engine (placar/tempo): força um tick do
      // controlador — syncLive lê o resultado e acerta as recompensas.
      if(claim.terminalReason==="pvp-battle-end"&&global.__PVP)
        global.__PVP.tick().catch((e)=>console.error("[pvp] settle",e&&e.message));
      },
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

  /* ---- Guild PvP controller ---- */
  const PVP=createPvpController({
    testServer:TEST_SERVER,
    getDb:()=>db,
    publishAll:(type,data)=>{if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll==="function")SYNC_BUS.broadcastAll(type,data);},
    publishAccount:(accountId,type,data)=>publishSync(accountId,type,data),
    isOnline:(accountId)=>!!(SYNC_BUS&&SYNC_BUS.clients&&SYNC_BUS.clients.has(Number(accountId))),
    createSharedInstance:(battle,roster)=>createPvpSharedInstance(db,battle,roster),
    endSharedInstance:async(host,instanceId,reason)=>{
      if(host&&typeof db.instanceEndForced==="function")
        await db.instanceEndForced(Number(host),reason||"pvp-end");
    },
    endAccountInstance:async(accountId,reason)=>{
      const live=await db.instanceGet(Number(accountId));
      if(!live||live.status!=="active"||typeof db.instanceEndForced!=="function")return;
      const ended=await db.instanceEndForced(Number(accountId),reason||"pvp-prep");
      const row=(ended&&ended.instance)||await db.instanceGet(Number(accountId));
      if(row)await publishInstanceForRow(db,row,{id:row.instance_id,version:Number(row.version)||1,
        status:"ended",terminalReason:reason||"pvp-prep",source:"pvp-prep",holderId:""});
    },
  });
  global.__PVP=PVP;
  PVP.start();

  /* ---- Quest controller ---- */
  let questTileFlags=null;
  function questMapBlockedCells(quest){
    try{
      if(!questTileFlags){
        const sandbox={window:{}};sandbox.window=sandbox;vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(path.join(STATIC_DIR,"js","tileflags.js"),"utf8"),sandbox);
        questTileFlags=sandbox.TILEFLAGS||{};
      }
      const OTBM=require(path.join(STATIC_DIR,"js","otbm.js"));
      const bytes=fs.readFileSync(path.join(STATIC_DIR,"maps",quest.otbm+".otbm"));
      let parsed=OTBM.read(bytes,{z:quest.otbmFloor});
      if(quest.flow==="annihilator")require("../game/js/annihilator-data").prepareMap(parsed);
      if(quest.otbmFovBounds)parsed=OTBM.crop(parsed,quest.otbmFovBounds);
      const map=OTBM.huntMapFromOtbm(parsed,questTileFlags),blocked={};
      for(let y=0;y<map.rows.length;y++)for(let x=0;x<map.rows[y].length;x++){
        const legend=map.leg[map.rows[y][x]];
        if(!legend||legend.bloc||map.footprintBlocked&&map.footprintBlocked[x+":"+y])blocked[x+":"+y]=true;
      }
      // Pisos funcionais por quest: certos .otbm usam ids de chão marcados como
      // bloqueio no .dat (piso de pedra 101, lava 377/381 da Annihilator) —
      // `quest.walkFloors` libera células cujo chão é um desses ids e cujos
      // itens não bloqueiam por si só (paredes/deco continuam bloqueando).
      if(Array.isArray(quest.walkFloors)){
        const floors=new Set(quest.walkFloors.map(Number));
        for(let y=0;y<map.rows.length;y++)for(let x=0;x<map.rows[y].length;x++){
          const key=x+":"+y;if(!blocked[key])continue;
          const legend=map.leg[map.rows[y][x]];
          if(!legend||!(legend.v||[]).some((id)=>floors.has(id)))continue;
          const hardItem=(legend.g||[]).some((id)=>questTileFlags[id]&&questTileFlags[id][1]);
          if(!hardItem)delete blocked[key];
        }
      }
      return blocked;
    }catch(error){console.error("[quest] map collision",error&&error.message);return null;}
  }
  async function createQuestSharedInstance(lobby,quest){
    if(!lobby||!lobby.joins||!lobby.joins.size)return {ok:false,error:"NO_JOINS"};
    const hostAccountId=Number(lobby.hostAccountId||[...lobby.joins.keys()][0]);
    if(!hostAccountId)return {ok:false,error:"NO_HOST"};
    const playerCount=lobby.joins.size;
    const totalWaves=quest.baseWaves+Math.floor(playerCount/quest.wavesPerPlayers);
    const monstersPerWave=quest.baseMonstersPerWave+Math.floor(playerCount/quest.monstersPerPlayers);
    // Grid — dimensões compatíveis com o mapa OTBM (34x32 para yalahar)
    const gridW=Math.max(1,Number(quest.otbmRuntimeWidth)||34);
    const gridH=Math.max(1,Number(quest.otbmRuntimeHeight)||32);
    const sr=quest.spawnRange||{minX:10,maxX:20,minY:10,maxY:20};
    // spawnRange já contém coordenadas locais (relativas ao mapa)
    const spawnMinX=Math.max(0,Math.min(gridW-1,sr.minX));
    const spawnMaxX=Math.max(spawnMinX,Math.min(gridW-1,sr.maxX));
    const spawnMinY=Math.max(0,Math.min(gridH-1,sr.minY));
    const spawnMaxY=Math.max(spawnMinY,Math.min(gridH-1,sr.maxY));
    const blockedSpawn=new Set((quest.spawnBlocked||[]).map((cell)=>Number(cell[0])+":"+Number(cell[1])));
    const blockedCells=questMapBlockedCells(quest);
    let spawnCells=[];
    for(let y=spawnMinY;y<=spawnMaxY;y++)for(let x=spawnMinX;x<=spawnMaxX;x++)
      if(!blockedSpawn.has(x+":"+y)&&!(blockedCells&&blockedCells[x+":"+y]))spawnCells.push({x,y});
    // Fallback: células marcadas como bloqueadas no OTBM mas jogáveis por
    // design (SQMs de preparo da Annihilator) — sem elas a quest nem nasce.
    if(!spawnCells.length)
      for(let y=spawnMinY;y<=spawnMaxY;y++)for(let x=spawnMinX;x<=spawnMaxX;x++)
        if(!blockedSpawn.has(x+":"+y))spawnCells.push({x,y});
    if(!spawnCells.length)return {ok:false,error:"NO_QUEST_SPAWN_CELLS"};
    const spawnOffset=Math.floor(Math.random()*spawnCells.length);
    const members=[],players=[];
    let index=0;
    for(const [accountId,join] of lobby.joins){
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
        // Spawn aleatório no range
        const spawnCell=spawnCells[(spawnOffset+index)%spawnCells.length];
        const cx=spawnCell.x,cy=spawnCell.y;
        members.push({id:String(character.id),p:data,hp:data.hp,mp:data.mp,accountId:Number(character.account_id)});
        players.push({
          id:String(character.id),p:data,hp:data.hp,mp:data.mp,accountId:Number(character.account_id),
          cx,cy,x:(cx+.5)/gridW,y:(cy+.5)/gridH,dir:"s",
        });
        index++;
      }
    }
    if(!members.length)return {ok:false,error:"NO_MEMBERS"};
    const customFlow=quest.flow==="annihilator";
    const descriptor={
      v:1,kind:"quest",huntId:null,bossId:customFlow?null:quest.boss,instanceMode:"quest",
      questId:quest.id,activeCharacterId:String(members[0].id),members,
      state:{
        questId:quest.id,instanceMode:"quest",gridW,gridH,huntId:null,blockedCells,
        raidEnabled:false,influencedChance:0,fiendishChance:0,players,
        mobs:[],pendingSpawns:[],
        questWaves:customFlow?null:{
          total:totalWaves,current:0,monstersPerWave,
          monsterPool:quest.waveMonsters||[],
          bossSlug:quest.boss,bossSpawned:false,
          spawnCells,
          kickOnDeath:!!quest.kickOnDeath,
          countdownUntil:Date.now()+(quest.countdownSec||30)*1000,
        },
      },
    };
    for(const accountId of lobby.joins.keys()){
      try{if(typeof db.instanceEndForced==="function")await db.instanceEndForced(Number(accountId),"quest-prep");}
      catch(e){console.error("[quest] end hunt",accountId,e&&e.message);}
    }
    const instanceId=newToken();
    const initialized=initializeAuthority(descriptor,instanceId,Date.now());
    const stamp=new Date();
    const saved=await db.instanceReplaceForced(hostAccountId,instanceId,{
      kind:"quest",hunt_id:null,boss_id:quest.boss,instance_mode:"quest",
      party_id:null,party_version:null,active_character_id:Number(members[0].id),
      saved_at:stamp,started_at:stamp,
    },JSON.stringify(initialized));
    if(!saved||!saved.ok)return {ok:false,error:(saved&&saved.error)||"SAVE_FAILED"};
    try{
      await publishInstanceForRow(db,saved.instance,{
        id:saved.instance.instance_id,version:Number(saved.instance.version)||1,
        status:"active",source:"quest-create",holderId:"",
      });
    }catch(e){/* best-effort */}
    console.log("[quest] shared instance",String(instanceId).slice(0,12),"host="+hostAccountId,"chars="+members.length);
    return {ok:true,instanceId,ownerAccountId:hostAccountId,instance:saved.instance};
  }
  const QUEST_CTRL=createQuestController({
    getDb:()=>db,
    publishAll:(type,data)=>{if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll==="function")SYNC_BUS.broadcastAll(type,data);},
    publishAccount:(accountId,type,data)=>publishSync(accountId,type,data),
    createQuestInstance:(lobby,quest)=>createQuestSharedInstance(lobby,quest),
    endSharedInstance:async(host,instanceId,reason)=>{
      if(host&&typeof db.instanceEndForced==="function")
        await db.instanceEndForced(Number(host),reason||"quest-end");
    },
  });
  global.__QUEST_CTRL=QUEST_CTRL;
  QUEST_CTRL.start();

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

  startServerSaveScheduler(db);

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
          announce:getAnnounceState(),
          playersOnline,
          worker:instanceWorker.stats(),sync:{protocol:SYNC_PROTOCOL,cursor:SYNC_BUS.cursor(),clients:SYNC_BUS.clientCount()},
          chat:{cursor:CHAT_BUS.cursor(),clients:CHAT_BUS.clientCount(),channels:CHAT_CHANNELS},
          accounts:TEST_SERVER ? ["1/1","2/2"] : [] });
      }
      if (req.method === "GET" && url === "/api/online-count") {
        const playersOnline = await onlineCountPayload(db);
        return send(res, 200, { ok: true, ...playersOnline });
      }
      /* Daily Monster (+15–35% EXP) e Daily Boss (+15–35% loot) — escolha
       * e percentuais determinísticos por data (Brasília), viram nas 00h. */
      if (req.method === "GET" && url === "/api/daily-boost") {
        const daily = require("./dailyboost").dailyBoost();
        return send(res, 200, { ok: true, ...daily });
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
      /* POST /api/admin/announce — popup global (SSE + health/TTL).
       * Auth igual à manutenção: X-Maintenance-Token ou sessão admin. */
      if(req.method==="POST"&&url==="/api/admin/announce"){
        const limited=rateLimit(req,"admin-announce",10,60000);if(limited)return send(res,limited.code,limited.body);
        let body={};
        try{body=await readBody(req);}catch(e){return send(res,400,{ok:false,error:"BAD_JSON",msg:"JSON inválido"});}
        const auth=await authorizeMaintenance(req,body,db);
        if(!auth.ok)return send(res,403,{ok:false,error:"FORBIDDEN",msg:"Token de manutenção ou admin necessário"});
        const title=String(body.title||"Aviso").slice(0,80);
        const message=String(body.message||"").slice(0,2000);
        if(!message.trim())return send(res,400,{ok:false,error:"EMPTY",msg:"Mensagem vazia"});
        const ttlSec=Math.max(30,Math.min(86400,Math.floor(Number(body.ttlSec)||900)));
        const button=String(body.button||"OK").slice(0,30)||"OK";
        ANNOUNCE_STATE.current={id:String(Date.now()),title,message,button,
          from:String(body.from||"").slice(0,60)||null,
          at:Date.now(),until:Date.now()+ttlSec*1000};
        try{if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll==="function")SYNC_BUS.broadcastAll("announce",ANNOUNCE_STATE.current);}catch(e){}
        console.log("[announce] publicado:",JSON.stringify(title),"ttl="+ttlSec+"s","via="+auth.via);
        return send(res,200,{ok:true,announce:ANNOUNCE_STATE.current});
      }
      if(req.method==="POST"&&url==="/api/admin/announce/clear"){
        const limited=rateLimit(req,"admin-announce",10,60000);if(limited)return send(res,limited.code,limited.body);
        let body={};
        try{body=await readBody(req);}catch(e){body={};}
        const auth=await authorizeMaintenance(req,body,db);
        if(!auth.ok)return send(res,403,{ok:false,error:"FORBIDDEN",msg:"Token de manutenção ou admin necessário"});
        ANNOUNCE_STATE.current=null;
        return send(res,200,{ok:true});
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
          guildId:ticket.guildId||0,
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
      if(req.method==="POST"&&url==="/api/social/friends"){
        const r=await socialList(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/social/search"){
        const r=await socialSearch(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/social/friend/add"){
        const r=await socialFriendAdd(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/social/friend/remove"){
        const r=await socialFriendRemove(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/social/friend/mute"){
        const r=await socialFriendMute(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/social/lobby-invite"){
        const r=await socialLobbyInvite(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/social/lobby-join"){
        const r=await socialLobbyJoin(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/account/hazard"){
        const r=await updateAccountHazard(db,await readBody(req));return send(res,r.code,r.body);
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
      if(req.method==="POST"&&url==="/api/account/recover"){
        const limited=rateLimit(req,"acc-recover",5,600000);if(limited)return send(res,limited.code,limited.body);
        const r=await requestPasswordRecovery(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/account/recover/confirm"){
        const limited=rateLimit(req,"acc-recover-confirm",10,600000);if(limited)return send(res,limited.code,limited.body);
        const r=await confirmPasswordRecovery(db,await readBody(req));return send(res,r.code,r.body);
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
      if(req.method==="POST"&&url==="/api/instance/charm"){
        const r=await charmInstanceOp(db,await readBody(req));return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/annihilator-rewards"){
        const body=await readBody(req);
        if(body.preview!==true&&body.quantities===undefined)return send(res,400,{ok:false,msg:"Carrinho inválido"});
        const r=await annihilatorLeverPull(db,body);return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/instance/annihilator-chest"){
        const body=await readBody(req);
        if(typeof body.reward!=="string"||!body.reward)return send(res,400,{ok:false,msg:"Baú inválido"});
        const r=await annihilatorLeverPull(db,body);return send(res,r.code,r.body);
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
      if((req.method==="POST"&&url==="/api/instance/open-primal-bag")||
         (req.method==="POST"&&url==="/api/pouch/open-primal-bag")){
        const r=await openBagYouDesire(db,await readBody(req),
          {slug:"primal-bag",openFn:openAuthPrimalBag,name:"Primal Bag"});
        return send(res,r.code,r.body);
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
      if((req.method==="POST"&&url==="/api/instance/bag-to-pouch")||
         (req.method==="POST"&&url==="/api/pouch/from-bag")){
        const r=await moveBagToPouch(db,await readBody(req));return send(res,r.code,r.body);
      }
      if((req.method==="POST"&&url==="/api/instance/bag-destroy")||
         (req.method==="POST"&&url==="/api/bag/destroy")){
        const r=await destroyBagItem(db,await readBody(req));return send(res,r.code,r.body);
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
      if (req.method === "POST" && url === "/api/characters/use-catalyst") {
        const r = await useProficiencyCatalyst(db, await readBody(req));
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
      if (req.method === "POST" && url === "/api/character/promote") {
        const r = await promoteCharacterApi(db, await readBody(req));return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/forge/fuse") {
        const r = await forgeFuseApi(db, await readBody(req));return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/training/buy") {
        const r = await buyTrainingPlan(db, await readBody(req));return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/training/checkpoint") {
        const limited = rateLimit(req, "training-checkpoint", 120, 60000); if (limited) return send(res, limited.code, limited.body);
        const r = await checkpointTraining(db, await readBody(req)); return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/training/config") {
        const r = await setTrainingConfig(db, await readBody(req));return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/training/daily-reward") {
        const q=new URL(req.url,"http://x").searchParams;
        const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim()||q.get("token")||"";
        const r=await getDailyReward(db,{token,char_id:q.get("char_id")});
        return send(res,r.code,r.body);
      }
      if (req.method === "POST" && url === "/api/training/daily-claim") {
        const limited=rateLimit(req,"daily-claim",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r = await claimDailyExerciseReward(db, await readBody(req));return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/account/wardrobe") {
        const limited=rateLimit(req,"wardrobe",60,60000);if(limited)return send(res,limited.code,limited.body);
        const body=await readBody(req),acc=await db.findAccountByToken(body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const recipe=typeof body.recipe==="string"?body.recipe:null;
        const alternative=Number.isSafeInteger(body.alternative)&&body.alternative>=0?body.alternative:0;
        const result=await db.accountWardrobe(acc.id,recipe,alternative);
        return send(res,result.ok?200:400,result);
      }
      if (req.method === "GET" && url === "/api/npcs/yana/catalog") {
        return send(res,200,{ok:true,offers:YANA_CATALOG});
      }
      if (req.method === "POST" && url === "/api/npcs/yana/buy") {
        const r=await buyYanaPackage(db,await readBody(req));return send(res,r.code,r.body);
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
      if (req.method === "POST" && url === "/api/store/cosmetic") {
        const body = await readBody(req);
        const r = await store.buyCosmetic(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && (url === "/api/store/preys" || url === "/api/prey/card")) {
        const body = await readBody(req);
        const r = await store.changePreys(db, body, url === "/api/prey/card");
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/store/prey-slot") {
        const body = await readBody(req);
        const r = await store.buyPreySlot(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/store/bless") {
        const body = await readBody(req);
        const r = await store.buyBless(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/store/imbuement") {
        const body = await readBody(req);
        const r = await store.buyImbuement(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/store/voucher") {
        const body = await readBody(req);
        const r = await store.redeemVoucher(db, body);
        return send(res, r.code, r.body);
      }
      /* ---- TWITCH OAUTH (gate social de vouchers, ex.: BUTO__PVP) ----
       * /api/twitch/auth: popup do cliente → 302 pro authorize da Twitch.
       * /api/twitch/callback: confirma o follow e grava accounts.social.
       * /api/twitch/status: o cliente faz poll até `verified` ficar true. */
      if (req.method === "GET" && url === "/api/twitch/auth") {
        const q = new URL(req.url, "http://x").searchParams;
        const token = String(q.get("token") || "");
        const acc = await db.findAccountByToken(token);
        if (!acc) return sendText(res, 401, "Sessão inválida — faça login no jogo.", "text/plain; charset=utf-8");
        if (!twitch.configured())
          return sendText(res, 503, twitch.pageHtml("Verificação indisponível",
            "O servidor ainda não tem credenciais do app Twitch (TWITCH_CLIENT_ID/SECRET). Avise a administração.", false),
            "text/html; charset=utf-8");
        /* ?channel= — follow-gate de um parceiro específico; só canais
         * cadastrados (parceiros ou o canal exigido) são aceitos. */
        let chan = String(q.get("channel") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (chan && chan !== twitch.requiredChannel() &&
            !partners.channels().includes(chan)) chan = "";
        /* Follow-gate usa o callback unificado /api/oauth/callback quando
         * OAUTH_REDIRECT_URI está configurada — assim UMA Redirect URL
         * registrada no app Twitch atende login social E gate de voucher.
         * /api/twitch/callback continua funcional (compat/local). */
        const cb = (typeof oauth.redirectUri === "function" && oauth.redirectUri())
          || undefined;
        res.writeHead(302, Object.assign(hardenedHeaders(res), {
          Location: twitch.authUrl(twitch.newState(token, chan), cb) }));
        return res.end();
      }
      if (req.method === "GET" && url === "/api/twitch/callback") {
        const q = new URL(req.url, "http://x").searchParams;
        const st = twitch.takeState(q.get("state") || "");
        const acc = st && st.token ? await db.findAccountByToken(st.token) : null;
        const html = (code, t, m, ok) => sendText(res, code, twitch.pageHtml(t, m, ok), "text/html; charset=utf-8");
        if (!acc) return html(400, "Sessão expirada", "Refaça o login no jogo e conecte a Twitch de novo.", false);
        if (q.get("error") || !q.get("code"))
          return html(200, "Conexão cancelada", "Você cancelou ou a Twitch recusou a conexão. Pode fechar esta janela.", false);
        try {
          const tok = await twitch.exchangeCode(q.get("code"));
          const chan = st.channel || twitch.requiredChannel();
          const v = await twitch.verifyFollow(tok.access_token, chan);
          const social = twitch.socialOf(acc);
          social.twitch = {
            id: v.id, login: v.login,
            follows: Object.assign({}, social.twitch && social.twitch.follows, { [chan]: v.follows }),
            at: Date.now(),
          };
          if (typeof db.setAccountSocial === "function") await db.setAccountSocial(acc.id, social);
          return html(200, "Twitch conectada",
            v.follows
              ? "@" + v.login + " segue @" + chan + " — a verificação foi registrada. Pode fechar esta janela."
              : "@" + v.login + " ainda não segue @" + chan + ". Siga na Twitch e tente de novo.", v.follows);
        } catch (e) {
          return html(502, "Falha na verificação", "Não foi possível confirmar com a Twitch agora. Tente novamente.", false);
        }
      }
      if (req.method === "GET" && url === "/api/twitch/status") {
        const q = new URL(req.url, "http://x").searchParams;
        const acc = await db.findAccountByToken(String(q.get("token") || ""));
        if (!acc) return send(res, 401, { ok: false, msg: "Sessão inválida" });
        const chan = String(q.get("channel") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
        const st = { ok: true,
          configured: twitch.configured(), channel: twitch.requiredChannel(),
          linked: !!twitch.linkedLogin(acc), login: twitch.linkedLogin(acc),
          verified: twitch.verifiedChannel(acc) };
        if (chan) {
          st.channel = chan;
          st.verified = twitch.followsChannel(acc, chan);
        }
        return send(res, 200, st);
      }
      /* ---- PARCEIROS: lista de streamers + status de live + voucher
       * (mascarado até o jogador seguir o canal — server/partners.js). */
      if (req.method === "GET" && url === "/api/partners") {
        const q = new URL(req.url, "http://x").searchParams;
        const acc = await db.findAccountByToken(String(q.get("token") || ""));
        if (!acc) return send(res, 401, { ok: false, msg: "Sessão inválida" });
        const list = await partners.partnersList(acc);
        return send(res, 200, { ok: true, configured: twitch.configured(), partners: list });
      }
      /* ---- LOGIN SOCIAL (Google + Twitch) ----
       * /api/auth/providers: o cliente só exibe botões dos provedores
       *   configurados no .env.
       * /api/auth/{provider}: 302 pro authorize do provedor.
       * /api/oauth/callback: URI compartilhada — o state carrega o provider.
       *   ?token= no início vincula o provedor à conta logada. */
      if (req.method === "GET" && url === "/api/auth/providers") {
        return send(res, 200, { ok: true,
          google: oauth.googleConfigured(), twitch: oauth.twitchConfigured() });
      }
      if (req.method === "GET" && (url === "/api/auth/google" || url === "/api/auth/twitch")) {
        const provider = url.endsWith("google") ? "google" : "twitch";
        const conf = provider === "google" ? oauth.googleConfigured() : oauth.twitchConfigured();
        if (!conf)
          return sendText(res, 503, twitch.pageHtml("Login indisponível",
            "O login com " + provider + " ainda não está configurado no servidor.", false),
            "text/html; charset=utf-8");
        const q = new URL(req.url, "http://x").searchParams;
        const st = oauth.newLoginState(provider, String(q.get("token") || ""));
        res.writeHead(302, Object.assign(hardenedHeaders(res), {
          Location: provider === "google" ? oauth.googleAuthUrl(st) : oauth.twitchAuthUrl(st) }));
        return res.end();
      }
      if (req.method === "GET" && url === "/api/oauth/callback") {
        const q = new URL(req.url, "http://x").searchParams;
        const page = (code, t, m, ok) =>
          sendText(res, code, twitch.pageHtml(t, m, ok), "text/html; charset=utf-8");
        let st = oauth.takeLoginState(q.get("state") || "");
        /* State não é de login? Pode ser do FOLLOW-GATE de voucher/parceiro
         * (twitch.newState) — o authorize usou esta mesma URI unificada. */
        if (!st) {
          const fst = twitch.takeState(q.get("state") || "");
          const facc = fst && fst.token ? await db.findAccountByToken(fst.token) : null;
          if (!facc) return page(400, "Sessão de login expirada", "Volte ao jogo e tente entrar de novo.", false);
          if (q.get("error") || !q.get("code"))
            return page(200, "Conexão cancelada", "Você cancelou ou a Twitch recusou a conexão. Pode fechar esta janela.", false);
          try {
            const tok = await twitch.exchangeCode(q.get("code"), oauth.redirectUri());
            const chan = fst.channel || twitch.requiredChannel();
            const v = await twitch.verifyFollow(tok.access_token, chan);
            const social = twitch.socialOf(facc);
            social.twitch = {
              id: v.id, login: v.login,
              follows: Object.assign({}, social.twitch && social.twitch.follows, { [chan]: v.follows }),
              at: Date.now(),
            };
            if (typeof db.setAccountSocial === "function") await db.setAccountSocial(facc.id, social);
            return page(200, "Twitch conectada",
              v.follows
                ? "@" + v.login + " segue @" + chan + " — a verificação foi registrada. Pode fechar esta janela."
                : "@" + v.login + " ainda não segue @" + chan + ". Siga na Twitch e tente de novo.", v.follows);
          } catch (e) {
            return page(502, "Falha na verificação", "Não foi possível confirmar com a Twitch agora. Tente novamente.", false);
          }
        }
        if (q.get("error") || !q.get("code"))
          return page(200, "Login cancelado", "Você cancelou a autorização. Pode fechar esta janela.", false);
        try {
          let profile = null;
          if (st.provider === "google") {
            const tok = await oauth.googleExchange(q.get("code"));
            profile = await oauth.googleProfile(tok.access_token);
          } else if (st.provider === "twitch") {
            const tok = await oauth.twitchExchange(q.get("code"));
            profile = await oauth.twitchLoginProfile(tok.access_token);
          }
          if (!profile) return page(400, "Provedor inválido", "Fluxo de login desconhecido.", false);
          const r = await oauthFinish(db, st, st.provider, profile);
          if (r.ban) {
            const b = r.ban;
            return page(403, "Conta suspensa", "Esta conta está suspensa" +
              (b.until ? " até " + new Date(b.until).toLocaleDateString("pt-BR") : " por tempo indeterminado") +
              (b.reason ? ". Motivo: " + b.reason : ""), false);
          }
          res.writeHead(302, Object.assign(hardenedHeaders(res), {
            Location: "/?sso=" + encodeURIComponent(r.token) + "&provider=" + st.provider }));
          return res.end();
        } catch (e) {
          console.log("[oauth] callback falhou:", e && e.message);
          return page(502, "Falha no login", "Não foi possível concluir com o provedor. Tente de novo.", false);
        }
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

      /* -------- RMT — recompra oficial de TC via PIX (server/rmt.js) -------- */
      const rmtCtx = { publishSync, ip: String((TRUST_PROXY && req.headers["x-forwarded-for"]) || req.socket.remoteAddress || "").split(",")[0].trim() };
      if (req.method === "GET" && url === "/api/rmt/dashboard") {
        const r = await rmt.playerDashboard(db, { token: bearerToken(req) });
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/rmt/rate") {
        const body = await readBody(req);
        const r = await rmt.playerRate(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/rmt/history") {
        const r = await rmt.playerHistory(db, { token: bearerToken(req) });
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/rmt/payment-profile") {
        const r = await rmt.playerProfileGet(db, { token: bearerToken(req) });
        return send(res, r.code, r.body);
      }
      if (req.method === "PUT" && url === "/api/rmt/payment-profile") {
        const limited = rateLimit(req, "rmt-profile", 10, 60000); if (limited) return send(res, limited.code, limited.body);
        const body = bodyWithSessionToken(req, await readBody(req));
        const r = await rmt.playerProfilePut(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/rmt/requests") {
        const limited = rateLimit(req, "rmt-create", 10, 60000); if (limited) return send(res, limited.code, limited.body);
        const body = bodyWithSessionToken(req, await readBody(req));
        const r = await rmt.playerCreate(db, body, rmtCtx);
        return send(res, r.code, r.body);
      }
      const rmtReqMatch = url.match(/^\/api\/rmt\/requests\/(\d+)(\/cancel)?$/);
      if (rmtReqMatch && req.method === "GET" && !rmtReqMatch[2]) {
        const r = await rmt.playerRequestGet(db, { token: bearerToken(req) }, Number(rmtReqMatch[1]));
        return send(res, r.code, r.body);
      }
      if (rmtReqMatch && req.method === "POST" && rmtReqMatch[2]) {
        const body = bodyWithSessionToken(req, await readBody(req));
        const r = await rmt.playerCancel(db, body, Number(rmtReqMatch[1]), rmtCtx);
        return send(res, r.code, r.body);
      }
      /* -------- RMT admin -------- */
      if (req.method === "GET" && url === "/api/admin/rmt/dashboard") {
        const r = await rmt.adminDashboard(db, bearerToken(req));
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/admin/rmt/requests") {
        const q = Object.fromEntries(new URL(req.url, "http://x").searchParams);
        const r = await rmt.adminList(db, bearerToken(req), q);
        return send(res, r.code, r.body);
      }
      const rmtAdmMatch = url.match(/^\/api\/admin\/rmt\/requests\/(\d+)(?:\/(review|approve|reject|payment|confirm-payment|receipt))?$/);
      if (rmtAdmMatch && req.method === "GET" && !rmtAdmMatch[2]) {
        const r = await rmt.adminGet(db, bearerToken(req), Number(rmtAdmMatch[1]));
        return send(res, r.code, r.body);
      }
      if (rmtAdmMatch && req.method === "POST" && rmtAdmMatch[2] && rmtAdmMatch[2] !== "receipt") {
        const limited = rateLimit(req, "rmt-admin", 30, 60000); if (limited) return send(res, limited.code, limited.body);
        const body = await readBody(req);
        const r = await rmt.adminTransition(db, bearerToken(req), Number(rmtAdmMatch[1]), rmtAdmMatch[2], body || {}, rmtCtx);
        return send(res, r.code, r.body);
      }
      if (rmtAdmMatch && req.method === "POST" && rmtAdmMatch[2] === "receipt") {
        const raw = await readRawBody(req);
        const r = await rmt.adminReceiptUpload(db, bearerToken(req), Number(rmtAdmMatch[1]), req, raw, rmtCtx);
        return send(res, r.code, r.body);
      }
      const rmtRcptMatch = url.match(/^\/api\/admin\/rmt\/receipts\/(\d+)$/);
      if (rmtRcptMatch && req.method === "GET") {
        // window.open não envia Authorization — aceita ?token= para o download.
        const rcptTok = bearerToken(req) || String(new URL(req.url, "http://x").searchParams.get("token") || "");
        const r = await rmt.adminReceiptGet(db, rcptTok, Number(rmtRcptMatch[1]), res);
        if (r.file) {
          const fs = require("fs");
          res.writeHead(200, Object.assign(hardenedHeaders(res), {
            "Content-Type": r.mime, "Content-Length": fs.statSync(r.file).size,
            "Content-Disposition": "inline; filename=\"receipt" + rmtRcptMatch[1] + "\"",
          }));
          return fs.createReadStream(r.file).pipe(res);
        }
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/admin/rmt/settings") {
        const r = await rmt.adminSettingsGet(db, bearerToken(req));
        return send(res, r.code, r.body);
      }
      if (req.method === "PUT" && url === "/api/admin/rmt/settings") {
        const body = await readBody(req);
        const r = await rmt.adminSettingsPut(db, bearerToken(req), body, rmtCtx);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/admin/rmt/audit") {
        const q = Object.fromEntries(new URL(req.url, "http://x").searchParams);
        const r = await rmt.adminAudit(db, bearerToken(req), q);
        return send(res, r.code, r.body);
      }
      if(req.method==="GET"&&(url==="/api/admin/backup"||url==="/api/admin/snapshots")){
        const token=(req.headers.authorization||"").replace("Bearer ",""),q=new URL(req.url,"http://x").searchParams;
        const bundle=await adminAccountBundle(db,token,Number(q.get("account_id")),Number(q.get("limit"))||100);
        if(url==="/api/admin/snapshots"&&bundle.body.ok)return send(res,200,{ok:true,
          checksum:bundle.body.checksum,snapshots:bundle.body.payload.snapshots});
        return send(res,bundle.code,bundle.body);
      }
      /* -------- painel GM (@admin): edição/punição cross-account -------- */
      if(req.method==="GET"&&url==="/api/admin/characters"){
        const token=(req.headers.authorization||"").replace("Bearer ",""),q=new URL(req.url,"http://x").searchParams;
        const r=await adminSearchChars(db,token,q.get("search")||q.get("q")||"");
        return send(res,r.code,r.body);
      }
      const adminCharMatch=url.match(/^\/api\/admin\/character\/(\d+)$/);
      if(adminCharMatch&&req.method==="GET"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await adminGetCharacter(db,token,adminCharMatch[1]);
        return send(res,r.code,r.body);
      }
      if(adminCharMatch&&req.method==="PUT"){
        const r=await adminGrantCharacter(db,await readBody(req),adminCharMatch[1]);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/admin/ban"){
        const r=await adminBanCreate(db,await readBody(req));return send(res,r.code,r.body);}
      if(req.method==="POST"&&url==="/api/admin/unban"){
        const r=await adminBanLift(db,await readBody(req));return send(res,r.code,r.body);}
      if(req.method==="GET"&&url==="/api/admin/bans"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await adminBanList(db,token);return send(res,r.code,r.body);}
      /* -------- VOUCHERS (aba GM): lista, detalhe de resgates, pause/delete -------- */
      if(req.method==="GET"&&url==="/api/admin/vouchers"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await adminVoucherList(db,token);return send(res,r.code,r.body);}
      if(req.method==="POST"&&url==="/api/admin/vouchers/state"){
        const r=await adminVoucherSetState(db,await readBody(req));return send(res,r.code,r.body);}
      const adminVoucherMatch=url.match(/^\/api\/admin\/vouchers\/([A-Za-z0-9_\-]{1,40})$/);
      if(adminVoucherMatch&&req.method==="GET"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await adminVoucherDetail(db,token,adminVoucherMatch[1]);
        return send(res,r.code,r.body);}
      if(req.method==="POST"&&url==="/api/admin/chat-delete"){
        const body=await readBody(req);
        const auth=await adminSession(db,String(body.token||""));if(auth.error)return send(res,auth.error.code,auth.error.body);
        const mid=Number(body.id||body.message_id||0);
        const msg=CHAT_BUS.remove(mid);
        if(!msg)return send(res,404,{ok:false,msg:"Mensagem não encontrada (expirada?)"});
        return send(res,200,{ok:true,id:mid});}
      if(req.method==="POST"&&url==="/api/admin/chat-mute"){
        const body=await readBody(req);
        const auth=await adminSession(db,String(body.token||""));if(auth.error)return send(res,auth.error.code,auth.error.body);
        const name=String(body.char_name||"").trim();
        const minutes=Math.max(1,Math.min(10080,Math.floor(Number(body.minutes)||0)));
        if(!name)return send(res,400,{ok:false,msg:"Nome do jogador obrigatório"});
        const found=await db.findCharacterByName(name);
        if(!found)return send(res,404,{ok:false,msg:"Personagem não encontrado"});
        const owner=await db.findAccountById(found.account_id);
        if(owner&&owner.role==="admin")return send(res,400,{ok:false,error:"CANNOT_MUTE_ADMIN",msg:"Não é possível silenciar um administrador"});
        const m=CHAT_BUS.mute(found.account_id,{until:Date.now()+minutes*60000,
          by:String(auth.acc.login||"admin"),reason:String(body.reason||""),charName:String(found.name||name)});
        if(typeof db.chatMuteSet==="function")await db.chatMuteSet(m);
        return send(res,200,{ok:true,mute:{account_id:m.accountId,char_name:m.charName,until:m.until,reason:m.reason}});}
      if(req.method==="POST"&&url==="/api/admin/chat-unmute"){
        const body=await readBody(req);
        const auth=await adminSession(db,String(body.token||""));if(auth.error)return send(res,auth.error.code,auth.error.body);
        const name=String(body.char_name||"").trim();
        const found=name?await db.findCharacterByName(name):null;
        if(!found)return send(res,404,{ok:false,msg:"Personagem não encontrado"});
        CHAT_BUS.unmute(found.account_id);
        if(typeof db.chatMuteDelete==="function")await db.chatMuteDelete(found.account_id);
        return send(res,200,{ok:true});}
      if(req.method==="GET"&&url==="/api/admin/chat-mutes"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const auth=await adminSession(db,token);if(auth.error)return send(res,auth.error.code,auth.error.body);
        return send(res,200,{ok:true,mutes:CHAT_BUS.listMutes()});}
      if(req.method==="POST"&&url==="/api/admin/server-save"){
        const token=(req.headers.authorization||"").replace("Bearer ","")||String((await readBody(req)).token||"");
        const r=await adminServerSave(db,token);return send(res,r.code,r.body);}
      if(req.method==="POST"&&url==="/api/admin/teleport-temple"){
        const r=await adminTeleportTemple(db,await readBody(req));return send(res,r.code,r.body);}
      if(req.method==="GET"&&url==="/api/admin/instances"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await adminInstancesList(db,token);return send(res,r.code,r.body);}
      if(req.method==="GET"&&url==="/api/admin/online"){
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const r=await adminOnlineList(db,token);return send(res,r.code,r.body);}
      if(req.method==="POST"&&url==="/api/admin/calendar"){
        const body=await readBody(req);
        const r=await adminCalendarWrite(db,body);return send(res,r.code,r.body);}
      if(req.method==="GET"&&url==="/api/admin/spectate"){
        const token=(req.headers.authorization||"").replace("Bearer ",""),q=new URL(req.url,"http://x").searchParams;
        const r=await adminSpectate(db,token,q.get("char"),q.get("instance"));
        return send(res,r.code,r.body);}
      // ---- CALENDÁRIO (leitura pública; escrita em /api/admin/calendar) ----
      if (req.method === "GET" && url === "/api/calendar") {
        const rows = typeof db.calendarList === "function" ? await db.calendarList() : [];
        return send(res, 200, { ok: true, events: rows });
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
        /* Compat: o reorder antigo (character_ids dos membros) agora
         * converte para a ordem completa da conta. */
        if(!Array.isArray(body.order)&&Array.isArray(body.character_ids))
          body.order=body.character_ids;
        const r = await party.partyOrderSet(db, body);
        if(r.body&&r.body.ok){const acc=await db.findAccountByToken(body.token);if(acc)await publishPartyState(db,acc.id,"reorder");}
        return send(res, r.code, r.body);
      }
      /* PARTY AUTOMÁTICA — ordenação por arraste na seleção de personagem.
       * O 1º da lista vira líder da party da conta. */
      if (req.method === "POST" && url === "/api/party/order") {
        const body = await readBody(req);
        const r = await party.partyOrderSet(db, body);
        if(r.body&&r.body.ok){const acc=await db.findAccountByToken(body.token);if(acc)await publishPartyState(db,acc.id,"order");}
        return send(res, r.code, r.body);
      }
      /* GET /api/character/profile?char_id — perfil público do personagem
       * (nome/voc/level, skills, equipamento e a PT dele). Sessão válida. */
      if (req.method === "GET" && url === "/api/character/profile") {
        const token=(req.headers.authorization||"").replace("Bearer ","");
        const acc=token?await db.findAccountByToken(token):null;
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const q=new URL(req.url,"http://x").searchParams;
        const c=await db.findCharacter(Number(q.get("char_id")));
        if(!c)return send(res,404,{ok:false,msg:"Personagem não encontrado"});
        let d={};try{d=typeof c.data==="string"?JSON.parse(c.data):(c.data||{});}catch(e){d={};}
        const sk=(d.skills&&typeof d.skills==="object")?d.skills:{};
        /* Equipamento equipado — mesmos slots do renderEquip do cliente. */
        const eq=(d.equip&&typeof d.equip==="object")?d.equip:{};
        const equipment={};
        for(const s of ["amulet","helmet","backpack","weapon","armor","shield",
                        "ring","legs","extra","boots","ammo"]){
          const e=eq[s];
          if(e&&e.item)equipment[s]={item:String(e.item),count:Number(e.count)||1};
        }
        const p=await db.partyFindByCharacter(c.id);
        let partyInfo=null;
        if(p){
          const members=await db.partyMembers(p.id);
          const lc=await db.findCharacter(p.leader_id);
          partyInfo={id:Number(p.id),members:[{
            id:Number(p.leader_id),name:lc?lc.name:(p.leader_name||"?"),
            voc:lc?lc.voc:"none",level:lc?Number(lc.level)||1:1,leader:true}]
            .concat(members.map((m)=>({id:Number(m.id),name:m.name,
              voc:m.voc,level:Number(m.level)||1,leader:false})))};
        }
        return send(res,200,{ok:true,profile:{
          id:Number(c.id),name:c.name,voc:c.voc,level:Number(c.level)||1,
          skills:{fist:sk.fist||10,sword:sk.sword||10,axe:sk.axe||10,
            club:sk.club||10,dist:sk.dist||10,shield:sk.shield||10},
          magicLevel:Number(d.ml)||0,
          equipment,
          party:partyInfo}});
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
      // ---- GUILD ----
      if (req.method === "GET" && url === "/api/guilds") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const r = await guild.guildList(db, token);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/guild/state") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const q = new URL(req.url, "http://x").searchParams;
        const r = await guild.guildState(db, token, q.get("char_id"));
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/guild/detail") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const q = new URL(req.url, "http://x").searchParams;
        const r = await guild.guildDetail(db, token, q.get("id"), q.get("char_id"));
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/create") {
        const body = await readBody(req);
        const r = await guild.guildCreate(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/invite") {
        const body = await readBody(req);
        const r = await guild.guildInvite(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/accept") {
        const body = await readBody(req);
        const r = await guild.guildAccept(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/decline") {
        const body = await readBody(req);
        const r = await guild.guildDecline(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/leave") {
        const body = await readBody(req);
        const r = await guild.guildLeave(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/kick") {
        const body = await readBody(req);
        const r = await guild.guildKick(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/promote") {
        const body = await readBody(req);
        const r = await guild.guildPromote(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/demote") {
        const body = await readBody(req);
        const r = await guild.guildDemote(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/donate") {
        const body = await readBody(req);
        const r = await guild.guildDonate(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/buy") {
        const body = await readBody(req);
        const r = await guild.guildBuyBonus(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/buy-temp") {
        const body = await readBody(req);
        const r = await guild.guildBuyTempBonus(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/request-join") {
        const body = await readBody(req);
        const r = await guild.guildRequestJoin(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/request-cancel") {
        const body = await readBody(req);
        const r = await guild.guildRequestCancel(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/request-respond") {
        const body = await readBody(req);
        const r = await guild.guildRequestRespond(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/donate-coins") {
        const body = await readBody(req);
        const r = await guild.guildDonateCoins(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/rename") {
        const body = await readBody(req);
        const r = await guild.guildRename(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "POST" && url === "/api/guild/icon") {
        const body = await readBody(req);
        const r = await guild.guildSetIcon(db, body);
        return send(res, r.code, r.body);
      }
      if (req.method === "GET" && url === "/api/guild/log") {
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        const q = new URL(req.url, "http://x").searchParams;
        const r = await guild.guildLog(db, token, q.get("char_id"), q.get("category"));
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
      if(req.method==="POST"&&url==="/api/world-boss/create"){
        const limited=rateLimit(req,"wb-create",10,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await WORLD_BOSS.createLobby(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/auto-join"){
        const limited=rateLimit(req,"wb-join",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await WORLD_BOSS.autoJoin(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/invite"){
        const limited=rateLimit(req,"wb-invite",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await WORLD_BOSS.invite(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/start"){
        const limited=rateLimit(req,"wb-start",10,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await WORLD_BOSS.startFight(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/toggle-invite"){
        const limited=rateLimit(req,"wb-toggle",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await WORLD_BOSS.toggleInvite(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/world-boss/burden"){
        const limited=rateLimit(req,"wb-burden",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await WORLD_BOSS.setBurden(db,bodyWithSessionToken(req,await readBody(req)));
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

      /* -------- Guild PvP battles -------- */
      if(req.method==="GET"&&url==="/api/pvp/state"){
        const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
        const q=new URL(req.url,"http://x").searchParams;
        const acc=await db.findAccountByToken(token||q.get("token")||"");
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        return send(res,200,await PVP.stateFor(db,acc));
      }
      if(req.method==="GET"&&url==="/api/pvp/battle"){
        const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
        const q=new URL(req.url,"http://x").searchParams;
        const acc=await db.findAccountByToken(token||q.get("token")||"");
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PVP.battleDetail(db,acc,Number(q.get("id"))||0);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pvp/lobby"){
        const limited=rateLimit(req,"pvp-lobby",10,60000);if(limited)return send(res,limited.code,limited.body);
        const body=await readBody(req);
        const acc=await db.findAccountByToken(body&&body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PVP.createLobby(db,acc,body||{});
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pvp/respond"){
        const limited=rateLimit(req,"pvp-respond",30,60000);if(limited)return send(res,limited.code,limited.body);
        const body=await readBody(req);
        const acc=await db.findAccountByToken(body&&body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PVP.respond(db,acc,body||{});
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/pvp/cancel"){
        const limited=rateLimit(req,"pvp-cancel",30,60000);if(limited)return send(res,limited.code,limited.body);
        const body=await readBody(req);
        const acc=await db.findAccountByToken(body&&body.token);
        if(!acc)return send(res,401,{ok:false,msg:"Sessão inválida"});
        const r=await PVP.cancel(db,acc,body||{});
        return send(res,r.code,r.body);
      }

      /* -------- Quests (lobby + instância compartilhada) -------- */
      if(req.method==="GET"&&url==="/api/quest/list"){
        return send(res,200,{ok:true,quests:QUEST_CTRL.listQuests()});
      }
      if(req.method==="GET"&&url.startsWith("/api/quest/state")){
        const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
        const q=new URL(req.url,"http://x").searchParams;
        const questId=q.get("questId")||"";
        const r=await QUEST_CTRL.stateFor(db,token||q.get("token")||"",questId);
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/create"){
        const limited=rateLimit(req,"quest-create",10,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await QUEST_CTRL.apiCreateLobby(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/join"){
        const limited=rateLimit(req,"quest-join",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await QUEST_CTRL.join(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/leave"){
        const r=await QUEST_CTRL.leave(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/start"){
        const limited=rateLimit(req,"quest-start",10,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await QUEST_CTRL.startFight(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/loaded"){
        const r=await QUEST_CTRL.markLoaded(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/report"){
        const r=await QUEST_CTRL.reportCombat(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/auto-join"){
        const limited=rateLimit(req,"quest-join",30,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await QUEST_CTRL.autoJoin(db,bodyWithSessionToken(req,await readBody(req)));
        return send(res,r.code,r.body);
      }
      if(req.method==="POST"&&url==="/api/quest/choose-reward"){
        const limited=rateLimit(req,"quest-reward",10,60000);if(limited)return send(res,limited.code,limited.body);
        const r=await QUEST_CTRL.chooseReward(db,bodyWithSessionToken(req,await readBody(req)));
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
    console.log("[server] imagens (/imagens):", STATIC_IMAGES_DIR);
    console.log("[server] bootId:", SERVER_BOOT_ID, "startedAt:", new Date(SERVER_STARTED_AT).toISOString());
    console.log("[server] registre/login: POST /api/register e /api/login");
    if (TEST_SERVER) console.log("[server] TEST SERVER ativo — Admin liberado para testers");
    if (MAINTENANCE_MODE) console.log("[server] MAINTENANCE_MODE=1 — UI bloqueada + login/register/lease 503");
    console.log("[server] world-boss timers:", WORLD_BOSS.timers);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
