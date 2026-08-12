/*
 * account-client.js — cliente da API de contas do Global-Idle (online).
 *
 * Quando ACCOUNT_API_URL está configurado (no topo ou via
 * localStorage["tibia-idle-api"]), o login/criação de personagem passam
 * pelo servidor (MySQL). Sem URL, o jogo continua 100% local (localStorage)
 * como antes — o modo offline não quebra nada.
 *
 * Funções:
 *   accountApiConfigured()        -> bool
 *   accountRegister(login, pass)  -> {ok, msg}
 *   accountLogin(login, pass)     -> {ok, token, account, characters}
 *   accountCreateCharacter(token, name, voc, data)
 *   accountSaveCharacter(token, charId, p)
 *   accountAddCoins(token, amount)
 */
"use strict";

/* URL da API de contas. Deixe '' para modo local/offline.
 * Ex.: http://127.0.0.1:3333 */
let ACCOUNT_API_URL = "";
const ACCOUNT_SERVER_CONFIG = (typeof window !== "undefined" &&
  window.GLOBAL_IDLE_SERVER_CONFIG) || { online:false, testServer:false, apiUrl:"" };
try {
  ACCOUNT_API_URL = localStorage.getItem("tibia-idle-api") || "";
} catch (e) { ACCOUNT_API_URL = ""; }
// Quando servido pelo test server, jogo e API compartilham a mesma origem.
if (!ACCOUNT_API_URL && ACCOUNT_SERVER_CONFIG.online) {
  ACCOUNT_API_URL = ACCOUNT_SERVER_CONFIG.apiUrl || window.location.origin;
}

function accountApiConfigured() {
  return !!ACCOUNT_API_URL;
}

const ONLINE_CHARACTER_CACHE_KEY="tibia-idle-online-character-cache-v1";
function accountCharacterCacheWrite(characters){
  try{sessionStorage.setItem(ONLINE_CHARACTER_CACHE_KEY,JSON.stringify(characters||[]));}catch(e){}
}
function accountCharacterCacheRead(){
  try{const raw=sessionStorage.getItem(ONLINE_CHARACTER_CACHE_KEY);return raw?JSON.parse(raw):[];}catch(e){return [];}
}
function accountCharacterCacheClear(){
  try{sessionStorage.removeItem(ONLINE_CHARACTER_CACHE_KEY);}catch(e){}
  try{ACCOUNT_SAVE_CONFLICTS.clear();}catch(e){}
}

/* Saves online são serializados nesta aba e usam optimistic concurrency.
 * Ao detectar outra sessão, o personagem fica bloqueado até recarregar; sem
 * isso, o autosave seguinte poderia sobrescrever silenciosamente o vencedor. */
let ACCOUNT_SAVE_QUEUE=Promise.resolve(true);
let ACCOUNT_LAST_SAVE_PROMISE=ACCOUNT_SAVE_QUEUE;
const ACCOUNT_SAVE_CONFLICTS=new Set();
function accountMergeCharacterCache(characters){
  const cache=accountCharacterCacheRead();
  for(const character of characters||[]){
    const index=cache.findIndex((c)=>String(c.id)===String(character.id));
    if(index>=0)cache[index]=Object.assign({},cache[index],character);
    else cache.push(character);
  }
  accountCharacterCacheWrite(cache);return cache;
}
function accountQueueSave(task){
  const run=ACCOUNT_SAVE_QUEUE.catch(()=>false).then(task);
  ACCOUNT_SAVE_QUEUE=run.catch(()=>false);ACCOUNT_LAST_SAVE_PROMISE=run;return run;
}
function accountLastSavePromise(){return ACCOUNT_LAST_SAVE_PROMISE.catch(()=>false);}
function accountSaveConflict(ids,characters,message){
  (ids||[]).forEach((id)=>ACCOUNT_SAVE_CONFLICTS.add(String(id)));
  if(characters&&characters.length)accountMergeCharacterCache(characters);
  try{window.dispatchEvent(new CustomEvent("tibia-idle-save-conflict",{detail:{ids:ids||[]}}));}catch(e){}
  if(typeof toast==="function")toast(message||"Save alterado em outra sessão. Recarregue antes de continuar.","bad");
}
async function accountEnsureVersions(token,ids){
  let cache=accountCharacterCacheRead();
  const missing=(ids||[]).some((id)=>{
    const c=cache.find((row)=>String(row.id)===String(id));
    return !c||!Number.isSafeInteger(Number(c.saveVersion))||Number(c.saveVersion)<1;
  });
  if(missing){const fresh=await accountMe(token);if(fresh.ok){cache=fresh.characters||[];accountCharacterCacheWrite(cache);}}
  return cache;
}
function accountSavePayload(p){
  let maxHp=0,maxMp=0;
  try{if(typeof maxStats==="function"&&p){const m=maxStats(p);maxHp=m.hp||0;maxMp=m.mp||0;}}catch(e){}
  return {voc:p&&p.voc||"none",level:p&&p.level||1,data:JSON.stringify(p||{}),
    hp:p&&p.hp||0,mp:p&&p.mp||0,maxHp,maxMp};
}

const ACCOUNT_LEASE_HOLDER_KEY="tibia-idle-lease-holder-v1";
const ACCOUNT_LEASE_TOKEN_KEY="tibia-idle-lease-token-v1";
const ACCOUNT_LEASE_EXPIRY_KEY="tibia-idle-lease-expiry-v1";
let ACCOUNT_LEASE={active:false,token:"",holder:"",expiresAt:0,sessionToken:"",timer:null,lost:false};
function accountLeaseRandom(){
  try{if(crypto&&typeof crypto.randomUUID==="function")return crypto.randomUUID().replace(/-/g,"");}catch(e){}
  return Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
}
// Novo por documento: reload/aba clonada rotaciona holder no servidor. Mesmo
// que sessionStorage seja copiado, duas páginas nunca renovam o mesmo holder.
const ACCOUNT_LEASE_PAGE_HOLDER=accountLeaseRandom();
let ACCOUNT_LEASE_CHANNEL=null;
function accountLeaseAccountId(){
  try{const raw=sessionStorage.getItem("tibia-idle-account");return raw?String(JSON.parse(raw).id||""):"";}catch(e){return "";}
}
try{
  if(typeof BroadcastChannel!=="undefined"){
    ACCOUNT_LEASE_CHANNEL=new BroadcastChannel("tibia-idle-account-lease-v1");
    ACCOUNT_LEASE_CHANNEL.onmessage=(event)=>{
      const data=event&&event.data||{};
      if(data.type==="acquired"&&data.accountId&&data.accountId===accountLeaseAccountId()&&
         data.holderId!==ACCOUNT_LEASE_PAGE_HOLDER&&ACCOUNT_LEASE.active)
        accountLeaseMarkLost("Outra aba assumiu o controle. A simulação foi pausada.");
    };
  }
}catch(e){ACCOUNT_LEASE_CHANNEL=null;}
function accountLeaseStored(){
  let previousHolder="",token="",expiresAt=0;
  try{
    previousHolder=sessionStorage.getItem(ACCOUNT_LEASE_HOLDER_KEY)||ACCOUNT_LEASE_PAGE_HOLDER;
    token=sessionStorage.getItem(ACCOUNT_LEASE_TOKEN_KEY)||"";
    expiresAt=Number(sessionStorage.getItem(ACCOUNT_LEASE_EXPIRY_KEY)||0);
  }catch(e){previousHolder=ACCOUNT_LEASE_PAGE_HOLDER;}
  return {holder:ACCOUNT_LEASE_PAGE_HOLDER,previousHolder,token,expiresAt};
}
function accountLeaseFields(){
  const stored=accountLeaseStored();
  return {holder_id:ACCOUNT_LEASE.holder||stored.holder,lease_token:ACCOUNT_LEASE.token||stored.token};
}
function accountLeaseApply(token,data){
  const stored=accountLeaseStored();
  ACCOUNT_LEASE.active=true;ACCOUNT_LEASE.lost=false;ACCOUNT_LEASE.sessionToken=token;
  ACCOUNT_LEASE.holder=data.holderId||stored.holder;ACCOUNT_LEASE.token=data.leaseToken;
  ACCOUNT_LEASE.expiresAt=new Date(data.expiresAt).getTime();
  try{
    sessionStorage.setItem(ACCOUNT_LEASE_HOLDER_KEY,ACCOUNT_LEASE.holder);
    sessionStorage.setItem(ACCOUNT_LEASE_TOKEN_KEY,ACCOUNT_LEASE.token);
    sessionStorage.setItem(ACCOUNT_LEASE_EXPIRY_KEY,String(ACCOUNT_LEASE.expiresAt));
  }catch(e){}
  try{if(ACCOUNT_LEASE_CHANNEL)ACCOUNT_LEASE_CHANNEL.postMessage({type:"acquired",
    accountId:accountLeaseAccountId(),holderId:ACCOUNT_LEASE.holder});}catch(e){}
  if(ACCOUNT_LEASE.timer)clearTimeout(ACCOUNT_LEASE.timer);
  ACCOUNT_LEASE.timer=setTimeout(()=>accountRenewLease(token),Math.max(1000,Number(data.renewAfterMs)||30000));
}
function accountLeaseMarkLost(message){
  ACCOUNT_LEASE.active=false;ACCOUNT_LEASE.lost=true;ACCOUNT_LEASE.token="";ACCOUNT_LEASE.expiresAt=0;
  if(ACCOUNT_LEASE.timer){clearTimeout(ACCOUNT_LEASE.timer);ACCOUNT_LEASE.timer=null;}
  try{sessionStorage.removeItem(ACCOUNT_LEASE_TOKEN_KEY);sessionStorage.removeItem(ACCOUNT_LEASE_EXPIRY_KEY);}catch(e){}
  try{window.dispatchEvent(new CustomEvent("tibia-idle-lease-lost"));}catch(e){}
  if(message!==false&&typeof toast==="function")
    toast(message||"Outra aba assumiu o controle. A simulação foi pausada.","bad");
}
function accountLeaseAllowsSimulation(){
  if(!accountApiConfigured())return true;
  return !!(ACCOUNT_LEASE.active&&ACCOUNT_LEASE.token&&Date.now()<ACCOUNT_LEASE.expiresAt);
}
async function accountAcquireLease(token,takeover){
  const stored=accountLeaseStored(),path=takeover?"/api/lease/takeover":"/api/lease/acquire";
  const r=await _api("POST",path,{token,holder_id:stored.holder,
    previous_holder_id:stored.previousHolder,lease_token:stored.token});
  if(r.data.ok){accountLeaseApply(token,r.data);return {ok:true,resumed:!!r.data.resumed};}
  return {ok:false,held:r.code===409&&r.data.error==="LEASE_HELD",expiresAt:r.data.expiresAt,
    msg:r.data.msg||"Não foi possível obter o controle da conta."};
}
async function accountRenewLease(token){
  token=token||ACCOUNT_LEASE.sessionToken;const fields=accountLeaseFields();
  if(!token||!fields.lease_token)return {ok:false};
  const r=await _api("POST","/api/lease/renew",Object.assign({token},fields));
  if(r.data.ok){accountLeaseApply(token,r.data);return {ok:true};}
  if(r.code===0&&Date.now()<ACCOUNT_LEASE.expiresAt){
    if(ACCOUNT_LEASE.timer)clearTimeout(ACCOUNT_LEASE.timer);
    ACCOUNT_LEASE.timer=setTimeout(()=>accountRenewLease(token),5000);return {ok:false,retry:true};
  }
  accountLeaseMarkLost(r.data.msg);return {ok:false,lost:true};
}
async function accountEnsureLease(token){
  if(accountLeaseAllowsSimulation())return {ok:true};
  const acquired=await accountAcquireLease(token,false);
  if(!acquired.ok&&acquired.held)accountLeaseMarkLost(acquired.msg);
  return acquired;
}
async function accountReleaseLease(token){
  const fields=accountLeaseFields();
  if(token&&fields.lease_token)await _api("POST","/api/lease/release",Object.assign({token},fields));
  accountLeaseMarkLost(false);ACCOUNT_LEASE.lost=false;
}

let ACCOUNT_INSTANCE={id:"",version:0,status:null};
let ACCOUNT_INSTANCE_EPOCH=0,ACCOUNT_INSTANCE_CAN_CREATE=false;
let ACCOUNT_INSTANCE_QUEUE=Promise.resolve(true);
let ACCOUNT_INSTANCE_LAST_PROMISE=ACCOUNT_INSTANCE_QUEUE;
function accountQueueInstance(task){
  const run=ACCOUNT_INSTANCE_QUEUE.catch(()=>false).then(task);
  ACCOUNT_INSTANCE_QUEUE=run.catch(()=>false);ACCOUNT_INSTANCE_LAST_PROMISE=run;return run;
}
function accountLastInstancePromise(){return ACCOUNT_INSTANCE_LAST_PROMISE.catch(()=>false);}
function accountInstanceApply(instance){
  if(!instance){ACCOUNT_INSTANCE={id:"",version:0,status:null};ACCOUNT_INSTANCE_CAN_CREATE=false;return;}
  ACCOUNT_INSTANCE={id:String(instance.id||""),version:Number(instance.version)||0,status:instance.status||"active"};
  ACCOUNT_INSTANCE_CAN_CREATE=false;
}
function accountBeginInstance(){ACCOUNT_INSTANCE_EPOCH+=1;ACCOUNT_INSTANCE_CAN_CREATE=true;}
async function accountLoadInstance(token){
  // Consulte antes de tickar: uma conta sem instância ativa deve receber 200
  // com null, não provocar o 410 esperado de /tick no console do navegador.
  let r=await _api("GET","/api/instance",null,token);
  if(!r.data.ok)return {ok:false,msg:r.data.msg||"Falha ao carregar instância"};
  if(!r.data.instance){accountInstanceApply(null);return {ok:true,instance:null,lastStatus:r.data.lastStatus||null};}
  accountInstanceApply(r.data.instance);
  if(accountLeaseAllowsSimulation()){
    const tick=await _api("POST","/api/instance/tick",Object.assign({token,
      expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields()));
    if(tick.data&&tick.data.ok){if(tick.data.characters)accountMergeCharacterCache(tick.data.characters);
      accountInstanceApply(tick.data.instance||null);
      return {ok:true,instance:tick.data.instance&&tick.data.instance.state||null,
        meta:tick.data.instance||null,lastStatus:tick.data.instance?null:"ended"};}
    // Em caso de corrida com worker/SSE, use o snapshot GET já validado; a
    // próxima sincronização reconciliará a versão sem erro destrutivo.
  }
  return {ok:true,instance:r.data.instance.state||null,meta:r.data.instance};
}
function accountNormalizeInstanceMembers(state){
  if(!state||!Array.isArray(state.members)||!state.members.length)return state;
  state.state=state.state&&typeof state.state==="object"?state.state:{};
  const visual=new Map();
  for(const ent of Array.isArray(state.state.players)?state.state.players:[]){
    if(!ent)continue;const id=String(ent.id!==undefined?ent.id:(ent.p&&ent.p.id));
    if(id&&!visual.has(id))visual.set(id,ent);
  }
  state.state.players=state.members.map((member)=>{
    const id=String(member.id),ent=Object.assign({},visual.get(id)||{id});
    ent.id=id;ent.p=member.p;return ent;
  });
  return state;
}
function accountSaveInstance(token,state){
  const epoch=ACCOUNT_INSTANCE_EPOCH;state=accountNormalizeInstanceMembers(state);
  return accountQueueInstance(async()=>{
    if(epoch!==ACCOUNT_INSTANCE_EPOCH||!accountLeaseAllowsSimulation()||!state)return false;
    if(ACCOUNT_INSTANCE.status!=="active"&&!ACCOUNT_INSTANCE_CAN_CREATE)return false;
    const r=await _api("PUT","/api/instance",Object.assign({token,
      instance_id:ACCOUNT_INSTANCE.id||null,expected_version:ACCOUNT_INSTANCE.status==="active"?ACCOUNT_INSTANCE.version:0,
      state},accountLeaseFields()));
    if(r.data.ok){accountInstanceApply(r.data.instance);return true;}
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409){
      accountInstanceApply(r.data.instance||null);
      try{window.dispatchEvent(new CustomEvent("tibia-idle-instance-conflict"));}catch(e){}
      if(typeof toast==="function")toast(r.data.msg||"A instância foi alterada em outra sessão.","bad");
    }else if(typeof console!=="undefined"){
      console.warn("[instance] save recusado",r.code,r.data.error||"",r.data.msg||"");
    }
    return false;
  });
}
function accountTickInstance(token){
  return accountQueueInstance(async()=>{
    if(!accountLeaseAllowsSimulation()||!ACCOUNT_INSTANCE.id||ACCOUNT_INSTANCE.status!=="active")return {ok:false};
    const r=await _api("POST","/api/instance/tick",Object.assign({token,
      expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields()));
    if(r.data.ok){accountInstanceApply(r.data.instance);if(r.data.characters)accountMergeCharacterCache(r.data.characters);
      return {ok:true,state:r.data.instance&&r.data.instance.state,terminalReason:r.data.terminalReason||null,elapsed:r.data.elapsed||0};}
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.data.instance)accountInstanceApply(r.data.instance);
    return {ok:false,error:r.data.error};
  });
}
function accountRefreshInstance(token){
  return accountQueueInstance(async()=>{
    const r=await _api("GET","/api/instance",null,token);
    if(!r.data.ok)return {ok:false};
    if(!r.data.instance){accountInstanceApply(null);return {ok:true,state:null,lastStatus:r.data.lastStatus||null};}
    accountInstanceApply(r.data.instance);return {ok:true,state:r.data.instance.state,meta:r.data.instance};
  });
}
function accountEndInstance(token,reason){
  ACCOUNT_INSTANCE_EPOCH+=1;const endEpoch=ACCOUNT_INSTANCE_EPOCH;ACCOUNT_INSTANCE_CAN_CREATE=false;
  return accountQueueInstance(async()=>{
    if(!ACCOUNT_INSTANCE.id||ACCOUNT_INSTANCE.status!=="active")return true;
    if(!accountLeaseAllowsSimulation())return false;
    const r=await _api("POST","/api/instance/end",Object.assign({token,
      instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version,reason:reason||"finished"},accountLeaseFields()));
    if(r.data.ok){const newerGeneration=ACCOUNT_INSTANCE_EPOCH!==endEpoch;accountInstanceApply(null);
      if(newerGeneration)ACCOUNT_INSTANCE_CAN_CREATE=true;return true;}
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountInstanceApply(r.data.instance||null);
    return false;
  });
}

const ACCOUNT_SYNC_CURSOR_KEY="tibia-idle-sync-cursor-v1";
let ACCOUNT_SYNC={source:null,token:"",errors:0,reconnect:null,poll:null,stopped:true,charRefresh:null};
function accountSyncCursor(value){
  if(value!==undefined){try{sessionStorage.setItem(ACCOUNT_SYNC_CURSOR_KEY,String(value));}catch(e){}return Number(value)||0;}
  try{return Number(sessionStorage.getItem(ACCOUNT_SYNC_CURSOR_KEY)||0);}catch(e){return 0;}
}
function accountSyncDispatch(type,detail){try{window.dispatchEvent(new CustomEvent("tibia-idle-sync-"+type,{detail:detail||{}}));}catch(e){}}
async function accountSyncRefreshCharacters(token){
  if(ACCOUNT_SYNC.charRefresh)return ACCOUNT_SYNC.charRefresh;
  ACCOUNT_SYNC.charRefresh=accountMe(token).then((fresh)=>{
    if(fresh.ok){accountCharacterCacheWrite(fresh.characters||[]);accountSyncDispatch("character",fresh);}
    return fresh;
  }).finally(()=>{ACCOUNT_SYNC.charRefresh=null;});return ACCOUNT_SYNC.charRefresh;
}
function accountSyncFallback(token){
  if(ACCOUNT_SYNC.poll)return;ACCOUNT_SYNC.poll=setInterval(async()=>{
    const state=await _api("GET","/api/sync/state",null,token);
    if(!state.data.ok)return;accountSyncCursor(state.data.cursor);
    await accountSyncRefreshCharacters(token);
    const instance=await accountRefreshInstance(token);if(instance.ok)accountSyncDispatch("instance",instance);
    accountSyncDispatch("party",state.data.party||{});
  },5000);
}
function accountSyncStopFallback(){if(ACCOUNT_SYNC.poll){clearInterval(ACCOUNT_SYNC.poll);ACCOUNT_SYNC.poll=null;}}
async function accountStartSync(token){
  if(!token)return false;if(ACCOUNT_SYNC.source&&ACCOUNT_SYNC.token===token)return true;
  accountStopSync();ACCOUNT_SYNC.stopped=false;ACCOUNT_SYNC.token=token;
  if(typeof EventSource==="undefined"){accountSyncFallback(token);return false;}
  const ticket=await _api("POST","/api/sync/ticket",{token});
  if(!ticket.data.ok){accountSyncFallback(token);ACCOUNT_SYNC.reconnect=setTimeout(()=>accountStartSync(token),5000);return false;}
  const url=ACCOUNT_API_URL+"/api/sync/events?ticket="+encodeURIComponent(ticket.data.ticket)+
    "&lastEventId="+encodeURIComponent(accountSyncCursor());
  const source=new EventSource(url);ACCOUNT_SYNC.source=source;
  const receive=(type,event)=>{
    if(event.lastEventId)accountSyncCursor(event.lastEventId);let data={};try{data=JSON.parse(event.data||"{}");}catch(e){}
    if(type==="lease"){
      if(data.holderId&&data.holderId!==ACCOUNT_LEASE_PAGE_HOLDER&&ACCOUNT_LEASE.active&&data.action!=="release")
        accountLeaseMarkLost("Outra aba ou dispositivo assumiu o controle.");
      accountSyncDispatch("lease",data);return;
    }
    if(type==="instance"){
      // O holder que originou tick/checkpoint já recebe o snapshot na resposta
      // HTTP. Ignorar o eco SSE evita aplicar a mesma versão duas vezes.
      if(data.holderId&&data.holderId===ACCOUNT_LEASE_PAGE_HOLDER)return;
      if(Number(data.version)<=Number(ACCOUNT_INSTANCE.version)&&data.status===ACCOUNT_INSTANCE.status)return;
      accountRefreshInstance(token).then((fresh)=>{if(fresh.ok)accountSyncDispatch("instance",Object.assign({},fresh,{event:data}));});return;
    }
    if(type==="character"){accountSyncRefreshCharacters(token);return;}
    if(type==="party"||type==="party-inbox"){accountSyncDispatch("party",data);return;}
    if(type==="snapshot-required"){
      accountSyncRefreshCharacters(token);accountRefreshInstance(token).then((fresh)=>accountSyncDispatch("instance",fresh));
      accountSyncDispatch("party",data);
    }
  };
  for(const type of ["lease","instance","character","party","party-inbox","snapshot-required"])
    source.addEventListener(type,(event)=>receive(type,event));
  source.addEventListener("ready",(event)=>{if(event.lastEventId)accountSyncCursor(event.lastEventId);ACCOUNT_SYNC.errors=0;accountSyncStopFallback();accountSyncDispatch("connected",{});});
  source.onopen=()=>{ACCOUNT_SYNC.errors=0;accountSyncStopFallback();};
  source.onerror=()=>{if(ACCOUNT_SYNC.stopped)return;ACCOUNT_SYNC.errors++;accountSyncDispatch("disconnected",{attempt:ACCOUNT_SYNC.errors});
    if(ACCOUNT_SYNC.errors>=3){try{source.close();}catch(e){}ACCOUNT_SYNC.source=null;accountSyncFallback(token);
      clearTimeout(ACCOUNT_SYNC.reconnect);ACCOUNT_SYNC.reconnect=setTimeout(()=>accountStartSync(token),Math.min(15000,1000*ACCOUNT_SYNC.errors));}};
  return true;
}
function accountStopSync(){ACCOUNT_SYNC.stopped=true;if(ACCOUNT_SYNC.source){try{ACCOUNT_SYNC.source.close();}catch(e){}}
  ACCOUNT_SYNC.source=null;clearTimeout(ACCOUNT_SYNC.reconnect);ACCOUNT_SYNC.reconnect=null;accountSyncStopFallback();ACCOUNT_SYNC.token="";}

async function _api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  try {
    const r = await fetch(ACCOUNT_API_URL + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch (e) { data = {}; }
    return { code: r.status, data: data };
  } catch (error) {
    return { code: 0, data: { ok:false, error:"NETWORK_ERROR",
      msg:"Servidor indisponível. Verifique se a API está ligada." } };
  }
}

async function accountRegister(login, password) {
  const r = await _api("POST", "/api/register", { login, password });
  if (r.data.ok) return { ok:true, msg:"Conta criada!" };
  if (r.code === 409 || r.data.error === "ACCOUNT_EXISTS")
    return { ok:false, exists:true, msg:"Conta já existe. Use a aba Entrar." };
  return { ok:false, msg:r.data.msg || "Falha ao criar conta" };
}

async function accountLogin(login, password) {
  const r = await _api("POST", "/api/login", { login, password });
  if (!r.data.ok) return { ok: false, msg: r.data.msg || "Falha no login" };
  return {
    ok: true,
    token: r.data.token,
    account: r.data.account,
    characters: r.data.characters || [],
  };
}

async function accountMe(token) {
  const r = await _api("GET", "/api/me", null, token);
  return r.data.ok ? r.data : { ok: false };
}
async function accountLogout(token){
  const r=await _api("POST","/api/logout",{token});return !!r.data.ok;
}

async function accountLoadCharacter(token, charId) {
  const r = await _api("GET", "/api/characters/" + encodeURIComponent(charId), null, token);
  if(r.data.ok){
    const character=r.data.character;let snapshot={};
    try{snapshot=typeof character.data==="string"?JSON.parse(character.data):(character.data||{});}catch(e){}
    accountMergeCharacterCache([{id:character.id,name:character.name,voc:character.voc,
      level:character.level,saveVersion:character.saveVersion,sex:snapshot.sex||"male",
      outfit:snapshot.outfit||null,snapshot}]);
    return {ok:true,character};
  }
  return {ok:false,msg:r.data.msg||"Falha ao carregar personagem"};
}

async function accountCreateCharacter(token, name, voc, data) {
  const r = await _api("POST", "/api/characters", {
    token, name, voc,
    data: typeof data === "string" ? data : JSON.stringify(data || {}),
  });
  return r.data.ok
    ? { ok: true, character: r.data.character }
    : { ok: false, msg: r.data.msg || "Falha ao criar personagem" };
}

async function accountSaveCharacter(token, charId, p) {
  const id=String(charId);
  return accountQueueSave(async()=>{
    if(ACCOUNT_SAVE_CONFLICTS.has(id)||!accountLeaseAllowsSimulation())return false;
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    if(!summary||!Number.isSafeInteger(Number(summary.saveVersion)))return false;
    const body=Object.assign({token,expected_version:Number(summary.saveVersion)},accountLeaseFields(),accountSavePayload(p));
    const r=await _api("PUT","/api/characters/"+encodeURIComponent(id),body);
    if(r.data.ok){accountMergeCharacterCache([r.data.character]);return true;}
    if(r.code===409){
      accountSaveConflict([id],r.data.characters||[],r.data.msg);return false;
    }
    if(r.code===428)accountSaveConflict([id],[],r.data.msg);
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    return false;
  });
}

async function accountSaveParty(token,state,players){
  const ids=(players||[]).filter((ent)=>ent&&ent.p).map((ent)=>String(ent.id));
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation()||!state||!state.id||!Number.isSafeInteger(Number(state.version))||
       ids.some((id)=>ACCOUNT_SAVE_CONFLICTS.has(id)))return false;
    const cache=await accountEnsureVersions(token,ids);
    const entries=[];
    for(const ent of players||[]){
      if(!ent||!ent.p)continue;
      const summary=cache.find((c)=>String(c.id)===String(ent.id));
      if(!summary||!Number.isSafeInteger(Number(summary.saveVersion)))continue;
      entries.push(Object.assign({id:Number(ent.id),expected_version:Number(summary.saveVersion)},accountSavePayload(ent.p)));
    }
    const r=await _api("POST","/api/party/save",Object.assign({
      token,party_id:Number(state.id),party_version:Number(state.version),
      party_order:(state.order||[]).map(Number),characters:entries,
    },accountLeaseFields()));
    if(r.data.ok){accountMergeCharacterCache(r.data.characters||[]);return true;}
    if(r.code===409){
      const conflicts=(r.data.characters||[]).map((c)=>String(c.id));
      accountSaveConflict(conflicts.length?conflicts:ids,r.data.characters||[],r.data.msg);return false;
    }
    if(r.code===428)accountSaveConflict(ids,[],r.data.msg);
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    return false;
  });
}

async function accountRepairCharacter(token,charId,voc,data){
  const max=typeof maxStats==="function"?maxStats(data):{hp:0,mp:0};
  const r=await _api("PUT","/api/characters/"+encodeURIComponent(charId)+"/repair",{
    token,voc,data:JSON.stringify(data||{}),maxHp:max.hp||0,maxMp:max.mp||0,
  });
  if(r.data.ok){accountMergeCharacterCache([r.data.character]);return {ok:true,character:r.data.character};}
  return {ok:false,msg:r.data.msg||"Falha ao reparar personagem"};
}

async function accountAddCoins(token, amount) {
  const r = await _api("POST", "/api/coins", { token, amount });
  return r.data.ok ? { ok: true, coins: r.data.coins } : { ok: false };
}

/* ------------------------------ MARKET P2P ------------------------------ */

/* Cria oferta de venda (item ou Tibia Coins).
 * body: { token, kind, slug?, tier?, data?, qty?, price, price_tc?, days?,
 *        seller_name? } */
async function marketCreateOffer(body) {
  const r = await _api("POST", "/api/market/offers", body);
  return r.data.ok ? { ok: true, offer: r.data.offer } : { ok: false, msg: r.data.msg || "Falha ao criar oferta" };
}

/* Lista ofertas ativas. filtro: { kind?, tier?, slug? } */
async function marketListOffers(filtro) {
  filtro = filtro || {};
  const qs = new URLSearchParams();
  if (filtro.kind) qs.set("kind", filtro.kind);
  if (filtro.tier) qs.set("tier", filtro.tier);
  if (filtro.slug) qs.set("slug", filtro.slug);
  const r = await _api("GET", "/api/market/offers?" + qs.toString());
  return r.data.ok ? { ok: true, offers: r.data.offers } : { ok: false, msg: r.data.msg };
}

/* Minhas ofertas. */
async function marketMineOffers(token) {
  const r = await _api("GET", "/api/market/mine", null, token);
  return r.data.ok ? { ok: true, offers: r.data.offers } : { ok: false, msg: r.data.msg };
}

/* Compra uma oferta. body: { token, offer_id, buyer_name? } */
async function marketBuyOffer(body) {
  const r = await _api("POST", "/api/market/buy", body);
  return r.data.ok ? { ok: true, data: r.data } : { ok: false, msg: r.data.msg || "Falha na compra" };
}

/* Cancela oferta. body: { token } */
async function marketCancelOffer(token, offerId) {
  const r = await _api("DELETE", "/api/market/offers/" + offerId, { token });
  return r.data.ok ? { ok: true, refundCoins: r.data.refundCoins || 0 } : { ok: false, msg: r.data.msg };
}

/* Coleta o gold pendente de vendas do market. */
async function marketClaimGold(token) {
  const r = await _api("POST", "/api/market/claim", { token });
  return r.data.ok ? { ok: true, gold: r.data.gold || 0 } : { ok: false, msg: r.data.msg };
}

/* Deposita gold do personagem no banco do market. */
async function marketDeposit(token, amount) {
  const r = await _api("POST", "/api/market/deposit", { token, amount });
  return r.data.ok ? { ok: true, bank: r.data.bank } : { ok: false, msg: r.data.msg };
}

/* Saca gold do banco do market para o personagem. */
async function marketWithdraw(token, amount) {
  const r = await _api("POST", "/api/market/withdraw", { token, amount });
  return r.data.ok ? { ok: true, bank: r.data.bank, amount: r.data.amount } : { ok: false, msg: r.data.msg };
}

/* Saldo do banco do market. */
async function marketBank(token) {
  const r = await _api("GET", "/api/market/bank", null, token);
  return r.data.ok ? { ok: true, bank: r.data.bank } : { ok: false, msg: r.data.msg };
}

/* ------------------------------ PARTY (multiplayer) ------------------------------
 * Convites assíncronos + follow. API crua (accountParty*) — os wrappers de
 * alto nível vivem em js/party.js (partyOnlineCreate/Invite/Leave etc.).
 * Todas usam o token da sessão (sessionStorage["tibia-idle-token"]) e o
 * char_id do personagem ativo (sessionStorage["tibia-idle-char"]).
 * OBS: os nomes NÃO podem colidir com as funções locais de party.js
 * (partyLeave, partyAddMember...), por isso o prefixo accountParty. */

async function accountPartyCreate(charId) {
  const r = await _api("POST", "/api/party/create", { token: sessionToken(), char_id: charId });
  return r.data.ok ? { ok: true, state: r.data.state } : { ok: false, msg: r.data.msg };
}

async function accountPartyInvite(charId, inviteeName) {
  const r = await _api("POST", "/api/party/invite", { token: sessionToken(), char_id: charId, invitee_name: inviteeName });
  return r.data.ok ? { ok: true, invite: r.data.invite } : { ok: false, msg: r.data.msg };
}

async function accountPartyInbox() {
  const r = await _api("GET", "/api/party/inbox", null, sessionToken());
  return r.data.ok ? { ok: true, invites: r.data.invites || [] } : { ok: false, msg: r.data.msg };
}

async function accountPartyAccept(inviteId) {
  const r = await _api("POST", "/api/party/accept", { token: sessionToken(), invite_id: inviteId });
  return r.data.ok ? { ok: true, msg: r.data.msg } : { ok: false, msg: r.data.msg };
}

async function accountPartyDecline(inviteId) {
  const r = await _api("POST", "/api/party/decline", { token: sessionToken(), invite_id: inviteId });
  return r.data.ok ? { ok: true, msg: r.data.msg } : { ok: false, msg: r.data.msg };
}

async function accountPartyLeave(charId) {
  const r = await _api("POST", "/api/party/leave", { token: sessionToken(), char_id: charId });
  return r.data.ok ? { ok: true, msg: r.data.msg } : { ok: false, msg: r.data.msg };
}

async function accountPartyKick(charId, memberId) {
  const r = await _api("POST", "/api/party/kick", { token: sessionToken(), char_id: charId, member_id: memberId });
  return r.data.ok ? { ok: true, msg: r.data.msg } : { ok: false, msg: r.data.msg };
}

async function accountPartyReorder(charId, expectedVersion, characterIds) {
  const r=await _api("POST","/api/party/reorder",{
    token:sessionToken(),char_id:charId,expected_version:expectedVersion,character_ids:characterIds,
  });
  return r.data.ok?{ok:true,state:r.data.state}:{ok:false,msg:r.data.msg,error:r.data.error};
}

async function accountPartyState(charId) {
  const r = await _api("GET", "/api/party/state?char_id=" + encodeURIComponent(charId), null, sessionToken());
  return r.data.ok ? { ok: true, state: r.data.state } : { ok: false, msg: r.data.msg };
}

let ACCOUNT_PARTY_ZONE_QUEUE=Promise.resolve(true);
async function accountPartyReportZone(charId, zoneInfo) {
  // Retorno à cidade e entrada seguinte podem acontecer no mesmo tick
  // (boss -> hunt, hunt -> boss). Preserve a ordem HTTP para a máquina de
  // estados do servidor nunca receber o destino antes do checkpoint city.
  const body=Object.assign({token:sessionToken(),char_id:charId},zoneInfo||{});
  const run=ACCOUNT_PARTY_ZONE_QUEUE.catch(()=>false).then(async()=>{
    const r=await _api("POST","/api/party/zone",body);
    return r.data.ok?{ok:true,zone:r.data.zone,ignored:!!r.data.ignored}:
      {ok:false,code:r.code,msg:r.data.msg,error:r.data.error};
  });
  ACCOUNT_PARTY_ZONE_QUEUE=run.catch(()=>false);return run;
}

async function accountPartyFollow(charId, nonce) {
  const r = await _api("POST", "/api/party/follow", { token: sessionToken(), char_id: charId, nonce });
  return r.data.ok ? { ok: true, msg: r.data.msg } : { ok: false, msg: r.data.msg };
}
