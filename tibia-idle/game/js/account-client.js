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
 *   accountAdminSaveCharacter(token, charId, p)  // grant admin completo
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
// Test/prod server injeta a origem correta. Nunca deixe um tibia-idle-api
// antigo (outra porta/processo) autenticar numa API e tickar noutra — isso
// produz lease/acquire 401 com a UI ainda "logada".
if (ACCOUNT_SERVER_CONFIG.online) {
  ACCOUNT_API_URL = ACCOUNT_SERVER_CONFIG.apiUrl ||
    (typeof window !== "undefined" && window.location && window.location.origin) ||
    ACCOUNT_API_URL;
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

/* Uma sessão inválida é terminal para TODOS os transportes desta aba.
 * Antes cada 401 era tratado isoladamente: SSE abria fallback, party seguia
 * no poll, lease tentava reacquire e o game pedia recovery, produzindo dezenas
 * de requests por minuto com o mesmo token morto. Centralize e execute uma
 * única vez, mas ignore respostas atrasadas de um token anterior após login. */
let ACCOUNT_UNAUTHORIZED_TOKEN="",ACCOUNT_UNAUTHORIZED_RELOAD=null;
function accountInvalidateSession(token,data){
  const presented=String(token||"");if(!presented)return false;
  if(ACCOUNT_UNAUTHORIZED_TOKEN===presented)return true;
  let current="";try{current=sessionStorage.getItem("tibia-idle-token")||"";}catch(e){}
  if(!current||current!==presented)return false;
  ACCOUNT_UNAUTHORIZED_TOKEN=presented;
  if(typeof accountStopSync==="function")accountStopSync();
  if(typeof accountLeaseMarkLost==="function")accountLeaseMarkLost(false);
  ACCOUNT_LEASE.sessionToken="";
  if(typeof partyStopPolling==="function")partyStopPolling();
  accountCharacterCacheClear();
  try{
    sessionStorage.removeItem("tibia-idle-token");
    sessionStorage.removeItem("tibia-idle-account");
    sessionStorage.removeItem("tibia-idle-char");
    sessionStorage.removeItem("tibia-idle-online-autoload");
    sessionStorage.setItem("tibia-idle-session-expired","1");
  }catch(e){}
  const detail={reason:data&&data.error||"UNAUTHORIZED",msg:data&&data.msg||"Sessão expirada"};
  try{window.dispatchEvent(new CustomEvent("tibia-idle-session-invalid",{detail}));}catch(e){}
  if(typeof toast==="function")toast("Sessão online expirada. Entre novamente para retomar a instância.","bad");
  // Reload encerra também callbacks antigos já enfileirados. O checkpoint e a
  // instância autoritativa ficam persistidos; após o login, o runtime retoma.
  if(!ACCOUNT_UNAUTHORIZED_RELOAD&&typeof setTimeout==="function")
    ACCOUNT_UNAUTHORIZED_RELOAD=setTimeout(()=>{
      try{if(typeof location!=="undefined"&&location&&typeof location.reload==="function")location.reload();}catch(e){}
    },250);
  return true;
}

/* Saves online são serializados nesta aba e usam optimistic concurrency.
 * Ao detectar outra sessão, o personagem fica bloqueado até recarregar; sem
 * isso, o autosave seguinte poderia sobrescrever silenciosamente o vencedor. */
let ACCOUNT_SAVE_QUEUE=Promise.resolve(true);
let ACCOUNT_LAST_SAVE_PROMISE=ACCOUNT_SAVE_QUEUE;
const ACCOUNT_SAVE_CONFLICTS=new Set();
function accountMergeCharacterCache(characters){
  const cache=accountCharacterCacheRead();
  let sharedGold=null;
  for(const character of characters||[]){
    const index=cache.findIndex((c)=>String(c.id)===String(character.id));
    if(index>=0)cache[index]=Object.assign({},cache[index],character);
    else cache.push(character);
    const snap=character.snapshot||(()=>{try{return typeof character.data==="string"?JSON.parse(character.data):character.data;}catch(e){return null;}})();
    if(snap&&snap.gold!==undefined)sharedGold=Math.max(0,Math.floor(Number(snap.gold)||0));
  }
  if(sharedGold!==null&&typeof accountSetGold==="function")accountSetGold(sharedGold);
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
let ACCOUNT_LEASE={active:false,token:"",holder:"",expiresAt:0,heldUntil:0,sessionToken:"",
  timer:null,lost:false,authFailUntil:0};
let ACCOUNT_LEASE_INFLIGHT=null;
function accountSessionToken(preferred){
  const presented=String(preferred||"");
  if(presented)return presented;
  try{const stored=sessionStorage.getItem("tibia-idle-token")||"";if(stored)return stored;}catch(e){}
  return String(ACCOUNT_LEASE.sessionToken||"");
}
function accountLeaseMarkUnauthorized(message){
  ACCOUNT_LEASE.authFailUntil=Date.now()+60000;
  ACCOUNT_LEASE.active=false;ACCOUNT_LEASE.lost=true;ACCOUNT_LEASE.expiresAt=0;ACCOUNT_LEASE.heldUntil=0;
  if(ACCOUNT_LEASE.timer){clearTimeout(ACCOUNT_LEASE.timer);ACCOUNT_LEASE.timer=null;}
  accountLeaseClearSecret();
  try{window.dispatchEvent(new CustomEvent("tibia-idle-lease-lost"));}catch(e){}
  return {ok:false,unauthorized:true,lost:true,
    msg:message||"Sessão online expirada. Entre novamente."};
}
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
  ACCOUNT_LEASE.active=true;ACCOUNT_LEASE.lost=false;ACCOUNT_LEASE.heldUntil=0;ACCOUNT_LEASE.authFailUntil=0;
  ACCOUNT_LEASE.sessionToken=token;
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
function accountLeaseClearSecret(){
  ACCOUNT_LEASE.token="";
  try{sessionStorage.removeItem(ACCOUNT_LEASE_TOKEN_KEY);sessionStorage.removeItem(ACCOUNT_LEASE_EXPIRY_KEY);}catch(e){}
}
function accountLeaseMarkLost(message,options){
  ACCOUNT_LEASE.active=false;ACCOUNT_LEASE.lost=true;ACCOUNT_LEASE.expiresAt=0;ACCOUNT_LEASE.heldUntil=0;
  if(ACCOUNT_LEASE.timer){clearTimeout(ACCOUNT_LEASE.timer);ACCOUNT_LEASE.timer=null;}
  if(!(options&&options.keepSecret))accountLeaseClearSecret();
  try{window.dispatchEvent(new CustomEvent("tibia-idle-lease-lost"));}catch(e){}
  if(message!==false&&typeof toast==="function")
    toast(message||"Outra aba assumiu o controle. A simulação foi pausada.","bad");
}
function accountLeasePauseHeld(expiresAt,message,silent){
  const until=Math.max(Date.now()+2000,new Date(expiresAt||0).getTime()||Date.now()+10000);
  ACCOUNT_LEASE.active=false;ACCOUNT_LEASE.lost=true;ACCOUNT_LEASE.heldUntil=until;
  if(ACCOUNT_LEASE.timer){clearTimeout(ACCOUNT_LEASE.timer);ACCOUNT_LEASE.timer=null;}
  try{window.dispatchEvent(new CustomEvent("tibia-idle-lease-lost"));}catch(e){}
  if(!silent&&message!==false&&typeof toast==="function")
    toast(message||"Esta conta já está ativa em outra aba ou dispositivo.","bad");
}
function accountLeaseAllowsSimulation(){
  if(!accountApiConfigured())return true;
  return !!(ACCOUNT_LEASE.active&&ACCOUNT_LEASE.token&&Date.now()<ACCOUNT_LEASE.expiresAt);
}
async function accountAcquireLeaseRequest(token,takeover){
  token=accountSessionToken(token);
  if(!token)return accountLeaseMarkUnauthorized("Sessão online ausente. Entre novamente.");
  const stored=accountLeaseStored(),path=takeover?"/api/lease/takeover":"/api/lease/acquire";
  const r=await _api("POST",path,{token,holder_id:stored.holder,
    previous_holder_id:stored.previousHolder,lease_token:stored.token});
  if(r.data.ok){accountLeaseApply(token,r.data);return {ok:true,resumed:!!r.data.resumed};}
  // `_api` encerra globalmente sync/poll/lease em 401. Marque o backoff local
  // para o loop de recovery não martelar /acquire enquanto o reload sobe.
  if(r.code===401)return accountLeaseMarkUnauthorized(r.data.msg);
  return {ok:false,held:r.code===409&&r.data.error==="LEASE_HELD",expiresAt:r.data.expiresAt,
    msg:r.data.msg||"Não foi possível obter o controle da conta.",unauthorized:false};
}
async function accountAcquireLease(token,takeover){
  token=accountSessionToken(token);
  if(takeover){
    ACCOUNT_LEASE.heldUntil=0;ACCOUNT_LEASE.authFailUntil=0;
    return accountAcquireLeaseRequest(token,true);
  }
  if(accountLeaseAllowsSimulation())return {ok:true,resumed:true};
  if(ACCOUNT_LEASE.authFailUntil&&Date.now()<ACCOUNT_LEASE.authFailUntil)
    return {ok:false,unauthorized:true,lost:true,msg:"Sessão online expirada. Entre novamente."};
  if(ACCOUNT_LEASE.heldUntil&&Date.now()<ACCOUNT_LEASE.heldUntil)
    return {ok:false,held:true,expiresAt:new Date(ACCOUNT_LEASE.heldUntil).toISOString(),
      msg:"Esta conta já está ativa em outra aba ou dispositivo."};
  if(!token)return accountLeaseMarkUnauthorized("Sessão online ausente. Entre novamente.");
  if(ACCOUNT_LEASE_INFLIGHT)return ACCOUNT_LEASE_INFLIGHT;
  ACCOUNT_LEASE_INFLIGHT=(async()=>{
    try{
      const result=await accountAcquireLeaseRequest(token,false);
      if(result.ok||accountLeaseAllowsSimulation()){ACCOUNT_LEASE.heldUntil=0;return result.ok?result:{ok:true};}
      if(result.held){
        const until=new Date(result.expiresAt||0).getTime();
        ACCOUNT_LEASE.heldUntil=Math.max(Date.now()+2000,until||Date.now()+10000);
      }
      return result;
    }finally{ACCOUNT_LEASE_INFLIGHT=null;}
  })();
  return ACCOUNT_LEASE_INFLIGHT;
}
async function accountRenewLease(token){
  // Soft-pause / SERVIDOR OFF: nunca rearmar o heartbeat. Um fetch em voo
  // que falhava com rede (code 0) antes reprogramava o timer e gerava storm
  // de /lease/renew (401) depois do restart com sessão/lease mortos.
  if(typeof accountServerForcedOffline==="function"&&accountServerForcedOffline())
    return {ok:false,offline:true};
  if(ACCOUNT_LEASE.lost&&!ACCOUNT_LEASE.active)return {ok:false,lost:true};
  token=accountSessionToken(token||ACCOUNT_LEASE.sessionToken);const fields=accountLeaseFields();
  if(!token||!fields.lease_token)return {ok:false};
  // skipInvalidate: 401 de renew após restart não deve apagar a sessão e
  // disparar reload automático — alinha com o banner Reconnect. Acquire no
  // reconnect (ou outro endpoint autenticado) ainda invalida se a sessão
  // estiver de fato morta.
  const r=await _api("POST","/api/lease/renew",Object.assign({token},fields),null,{skipInvalidate:true});
  if(r.data.ok){
    if(typeof accountServerForcedOffline==="function"&&accountServerForcedOffline())
      return {ok:false,offline:true};
    accountLeaseApply(token,r.data);return {ok:true};
  }
  if(r.code===0){
    if((typeof accountServerForcedOffline==="function"&&accountServerForcedOffline())||
       ACCOUNT_LEASE.lost||!ACCOUNT_LEASE.active)return {ok:false,offline:true};
    if(Date.now()<ACCOUNT_LEASE.expiresAt){
      if(ACCOUNT_LEASE.timer)clearTimeout(ACCOUNT_LEASE.timer);
      ACCOUNT_LEASE.timer=setTimeout(()=>accountRenewLease(token),5000);return {ok:false,retry:true};
    }
  }
  if(r.code===401){
    // Não use authFailUntil aqui: o banner Reconnect precisa reassumir o
    // lease imediatamente. Sessão realmente morta cai no acquire→invalidate.
    ACCOUNT_LEASE.active=false;ACCOUNT_LEASE.lost=true;ACCOUNT_LEASE.expiresAt=0;ACCOUNT_LEASE.heldUntil=0;
    if(ACCOUNT_LEASE.timer){clearTimeout(ACCOUNT_LEASE.timer);ACCOUNT_LEASE.timer=null;}
    accountLeaseClearSecret();
    try{window.dispatchEvent(new CustomEvent("tibia-idle-lease-lost"));}catch(e){}
    if(typeof accountForceServerDisconnect==="function")
      accountForceServerDisconnect("session");
    if(typeof toast==="function")
      toast(r.data.msg||"Controle online expirado. Use Reconnect.","bad");
    return {ok:false,unauthorized:true,lost:true,msg:r.data.msg||"Sessão online expirada. Entre novamente."};
  }
  accountLeaseMarkLost(r.data.msg);return {ok:false,lost:true};
}
async function accountEnsureLease(token,options){
  if(accountLeaseAllowsSimulation())return {ok:true};
  const acquired=await accountAcquireLease(token,false);
  if(acquired.ok||accountLeaseAllowsSimulation())return {ok:true,resumed:!!(acquired&&acquired.resumed)};
  // A recuperação automática roda periodicamente. Se outra aba é a dona
  // legítima, mantenha esta pausada sem apagar o segredo nem repetir o toast.
  if(acquired.held&&!ACCOUNT_LEASE.lost)
    accountLeasePauseHeld(acquired.expiresAt,acquired.msg,options&&options.silent);
  return acquired;
}
async function accountReleaseLease(token){
  const fields=accountLeaseFields();
  if(token&&fields.lease_token)await _api("POST","/api/lease/release",Object.assign({token},fields));
  accountLeaseMarkLost(false);ACCOUNT_LEASE.lost=false;ACCOUNT_LEASE.heldUntil=0;
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
function accountInstanceActive(){return !!(ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active");}
/* True enquanto a aba acabou de pedir uma instância nova e o PUT ainda não
 * confirmou id/status=active. Recovery/SSE "ended" não podem derrubar a arena. */
function accountInstanceCreating(){
  return !!(ACCOUNT_INSTANCE_CAN_CREATE&&!accountInstanceActive());
}
function accountInstanceApply(instance){
  if(!instance){ACCOUNT_INSTANCE={id:"",version:0,status:null};ACCOUNT_INSTANCE_CAN_CREATE=false;return;}
  ACCOUNT_INSTANCE={id:String(instance.id||""),version:Number(instance.version)||0,status:instance.status||"active"};
  ACCOUNT_INSTANCE_CAN_CREATE=false;
}
function accountBeginInstance(){ACCOUNT_INSTANCE_EPOCH+=1;ACCOUNT_INSTANCE_CAN_CREATE=true;}
async function accountLoadInstance(token){
  // Consulte antes de tickar: uma conta sem instância ativa deve receber 200
  // com null, não provocar o 410 esperado de /tick no console do navegador.
  const activeChar=typeof sessionCharId==="function"?sessionCharId():"";
  let r=await _api("GET","/api/instance?char_id="+encodeURIComponent(activeChar||""),null,token);
  if(!r.data.ok)return {ok:false,msg:r.data.msg||"Falha ao carregar instância"};
  if(!r.data.instance){accountInstanceApply(null);return {ok:true,instance:null,lastStatus:r.data.lastStatus||null};}
  accountInstanceApply(r.data.instance);
  const viewerMember=!!(r.data.instance.state&&Array.isArray(r.data.instance.state.members)&&
    r.data.instance.state.members.some((member)=>String(member.id)===String(activeChar)));
  if(accountLeaseAllowsSimulation()&&viewerMember){
    const tick=await _api("POST","/api/instance/tick",Object.assign({token,char_id:activeChar||null,
      expected_version:ACCOUNT_INSTANCE.version,visual_state:accountAuthorityVisualState()},accountLeaseFields()));
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
    // Grants admin (e outros PUTs) podem estar na fila de save: espere para
    // prepareInstanceState ler o snapshot MySQL já atualizado.
    if(typeof accountLastSavePromise==="function")await accountLastSavePromise();
    if(epoch!==ACCOUNT_INSTANCE_EPOCH||!accountLeaseAllowsSimulation()||!state)return false;
    if(ACCOUNT_INSTANCE.status!=="active"&&!ACCOUNT_INSTANCE_CAN_CREATE)return false;
    const r=await _api("PUT","/api/instance",Object.assign({token,char_id:state.activeCharacterId||
      (typeof sessionCharId==="function"?sessionCharId():null),instance_id:ACCOUNT_INSTANCE.id||null,
      expected_version:ACCOUNT_INSTANCE.status==="active"?ACCOUNT_INSTANCE.version:0,state},accountLeaseFields()));
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
/* Posições são apenas apresentação/predição: HP, alcance e dano continuam
 * autoritativos. Enviá-las no tick mantém projéteis, efeitos e floaters junto
 * das entidades que o grid local está animando, sem persistir o combate todo. */
function accountAuthorityVisualState(){
  const combat=typeof G!=="undefined"&&G&&G.combat;if(!combat)return null;
  const gw=Number(combat.gridW)||(typeof GRID_W!=="undefined"?GRID_W:30);
  const gh=Number(combat.gridH)||(typeof GRID_H!=="undefined"?GRID_H:30);
  const collect=(list,limit,kind)=>{
    const out=[];
    for(const ent of Array.isArray(list)?list:[]){
      if(!ent||out.length>=limit)break;
      const liveP=ent.p||(typeof G!=="undefined"&&G&&G.combat&&G.combat.player===ent&&G.p)||null;
      const id=String(ent.id!==undefined&&ent.id!==null&&ent.id!==""?ent.id:
        (liveP&&liveP.id)||(typeof G!=="undefined"&&G&&G.p&&G.p.id)||"");
      if(ent.x===null||ent.x===undefined||ent.y===null||ent.y===undefined)continue;
      const x=Number(ent.x),y=Number(ent.y);if(!id||!Number.isFinite(x)||!Number.isFinite(y))continue;
      const visual={id,x,y},cx=ent.cx===null||ent.cx===undefined?NaN:Number(ent.cx),
        cy=ent.cy===null||ent.cy===undefined?NaN:Number(ent.cy);
      if(Number.isFinite(cx))visual.cx=Math.round(cx);if(Number.isFinite(cy))visual.cy=Math.round(cy);
      // Servidor só aceita SQM. Nunca mandar x/y interpolados (micro-passo).
      if(Number.isFinite(visual.cx)&&gw>0)visual.x=(visual.cx+.5)/gw;
      if(Number.isFinite(visual.cy)&&gh>0)visual.y=(visual.cy+.5)/gh;
      const activeId=typeof sessionCharId==="function"?String(sessionCharId()||""):"";
      const isSelf=kind==="player"&&(!activeId||id===activeId||
        (typeof G!=="undefined"&&G&&G.p&&String(G.p.id)===id));
      const cfgSrc=isSelf&&liveP&&liveP.config?liveP:(isSelf&&typeof G!=="undefined"&&G&&G.p&&G.p.config?G.p:null);
      if(isSelf&&cfgSrc&&cfgSrc.config&&Array.isArray(cfgSrc.config.combo))visual.combo=cfgSrc.config.combo;
      if(isSelf&&cfgSrc&&cfgSrc.stances&&typeof cfgSrc.stances==="object")visual.stances=cfgSrc.stances;
      /* Envia as demais configurações do Helper a cada tick para que mudanças
       * durante o combate online passem a valer na autoridade sem precisar
       * sair para o templo. Campos já transmitidos por combo/stances/challenge
       * são omitidos para evitar conflito/sanitização duplicada. */
      if(isSelf&&cfgSrc&&cfgSrc.config&&typeof HELPER_PRESET_CONFIG_FIELDS!=="undefined"&&
         typeof helperPresetClone==="function"){
        const cfg={},skip={combo:1,stances:1,autoWalk:1,attackMode:1,kiteDistance:1,
          exetaRes:1,exetaAmpRes:1};
        for(const k of HELPER_PRESET_CONFIG_FIELDS){
          if(skip[k])continue;
          if(cfgSrc.config[k]!==undefined)cfg[k]=helperPresetClone(cfgSrc.config[k]);
        }
        if(Object.keys(cfg).length)visual.cfg=cfg;
      }
      if(cfgSrc&&cfgSrc.config){
        const mode=cfgSrc.config.attackMode||(combat&&combat.huntMode)||"kiting";
        visual.autoWalk=typeof playerAutoWalkOn==="function"?playerAutoWalkOn(cfgSrc):cfgSrc.config.autoWalk!==false;
        if(typeof vipManualControlAllowed==="function"&&!vipManualControlAllowed()){
          visual.autoWalk=true;
        }
        let dir=typeof combatKeyDir==="function"?combatKeyDir((typeof G!=="undefined"&&G.walkKeys)||{}):null;
        // Clique no chão: transforma walkGoal em 1 passo para a autoridade.
        if(!visual.autoWalk&&isSelf&&!dir&&ent.walkGoal&&Number.isFinite(ent.walkGoal.cx)&&Number.isFinite(ent.walkGoal.cy)
          &&Number.isFinite(Number(ent.cx))&&Number.isFinite(Number(ent.cy))){
          if(ent.cx===ent.walkGoal.cx&&ent.cy===ent.walkGoal.cy)ent.walkGoal=null;
          else{
            const dx=Math.max(-1,Math.min(1,Math.sign(ent.walkGoal.cx-ent.cx)));
            const dy=Math.max(-1,Math.min(1,Math.sign(ent.walkGoal.cy-ent.cy)));
            if(dx||dy)dir={dx,dy};
          }
        }
        if(!visual.autoWalk&&isSelf&&dir)visual.walkIntent={dx:dir.dx,dy:dir.dy};
        visual.challenge={
          res:!!cfgSrc.config.exetaRes,amp:!!cfgSrc.config.exetaAmpRes,
          box:mode==="box",
          huntMode:mode==="box"||mode==="safe"||mode==="kiting"?mode:"kiting",
          kiteDistance:Math.max(1,Math.min(5,Number(cfgSrc.config.kiteDistance)||3))};
      }
      out.push(visual);
    }
    return out;
  };
  const players=Array.isArray(combat.players)&&combat.players.length?combat.players:(combat.player?[combat.player]:[]);
  const out={players:collect(players,8,"player"),mobs:collect(combat.mobs,64,"mob")};
  if(combat._scarlettPendingDir){
    const intent={dir:String(combat._scarlettPendingDir)};
    const pressAuth=Number(combat._scarlettPendingPressAuth);
    if(Number.isFinite(pressAuth))intent.pressAuth=pressAuth;
    out.scarlettIntent=intent;
    combat._scarlettPendingDir=null;
    combat._scarlettPendingAt=0;
    combat._scarlettPendingPressAuth=null;
  }
  if(combat._spitePendingBubble!==undefined&&combat._spitePendingBubble!==null||combat._spitePendingStomp){
    out.spiteIntent={};
    if(combat._spitePendingStomp)out.spiteIntent.stomp=true;
    if(combat._spitePendingBubble!==undefined&&combat._spitePendingBubble!==null)
      out.spiteIntent.bubble=Number(combat._spitePendingBubble);
    combat._spitePendingBubble=null;combat._spitePendingBubbleAt=0;
    combat._spitePendingStomp=false;combat._spitePendingStompAt=0;
  }
  if(combat._malicePendingMoves&&Array.isArray(combat._malicePendingMoves)&&combat._malicePendingMoves.length){
    const moves=combat._malicePendingMoves.splice(0,Math.min(16,combat._malicePendingMoves.length))
      .map((m)=>({x:Math.floor(Number(m&&m.x)),y:Math.floor(Number(m&&m.y))}))
      .filter((m)=>Number.isFinite(m.x)&&Number.isFinite(m.y));
    if(moves.length)out.maliceIntent={moves:moves};
    if(!combat._malicePendingMoves.length)combat._malicePendingMoveAt=0;
  }else if(combat._malicePendingMove&&typeof combat._malicePendingMove==="object"){
    out.maliceIntent={x:Number(combat._malicePendingMove.x),y:Number(combat._malicePendingMove.y)};
    combat._malicePendingMove=null;combat._malicePendingMoveAt=0;
  }
  if(combat._megaPendingIntents&&Array.isArray(combat._megaPendingIntents)&&combat._megaPendingIntents.length){
    const queued=combat._megaPendingIntents.splice(0,Math.min(16,combat._megaPendingIntents.length))
      .map((intent)=>Object.assign({},intent))
      .filter((intent)=>intent&&intent.kind);
    for(const intent of queued){
      if(!intent.playerId&&typeof sessionCharId==="function")
        intent.playerId=String(sessionCharId()||"");
    }
    if(queued.length===1)out.megaIntent=queued[0];
    else if(queued.length>1){out.megaIntent=queued[0];out.megaIntents=queued.slice(1);}
    combat._megaPendingIntent=null;
  }else if(combat._megaPendingIntent&&typeof combat._megaPendingIntent==="object"){
    out.megaIntent=Object.assign({},combat._megaPendingIntent);
    if(!out.megaIntent.playerId&&typeof sessionCharId==="function")
      out.megaIntent.playerId=String(sessionCharId()||"");
    combat._megaPendingIntent=null;
  }else if(combat._megaPendingMove&&typeof combat._megaPendingMove==="object"){
    out.megaIntent={x:Number(combat._megaPendingMove.x),y:Number(combat._megaPendingMove.y)};
    combat._megaPendingMove=null;combat._megaPendingMoveAt=0;
  }
  return out;
}
function accountTickInstance(token){
  return accountQueueInstance(async()=>{
    if(!accountLeaseAllowsSimulation()||!ACCOUNT_INSTANCE.id||ACCOUNT_INSTANCE.status!=="active")return {ok:false};
    const r=await _api("POST","/api/instance/tick",Object.assign({token,
      char_id:typeof sessionCharId==="function"?sessionCharId():null,
      expected_version:ACCOUNT_INSTANCE.version,visual_state:accountAuthorityVisualState()},accountLeaseFields()));
    if(r.data.ok){accountInstanceApply(r.data.instance);if(r.data.characters)accountMergeCharacterCache(r.data.characters);
      return {ok:true,state:r.data.instance&&r.data.instance.state,terminalReason:r.data.terminalReason||null,
        elapsed:r.data.elapsed||0,version:ACCOUNT_INSTANCE.version,instanceId:ACCOUNT_INSTANCE.id};}
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.data.instance)accountInstanceApply(r.data.instance);
    return {ok:false,error:r.data.error};
  });
}
function accountClaimRewardChest(token,charId,opts){
  opts=opts||{};
  return accountQueueSave(async()=>{
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),
      expected_version:Number(summary&&summary.saveVersion)||0,
      bundleId:opts.bundleId||null,slug:opts.slug||null,all:!!opts.all,
    },accountLeaseFields());
    const r=await _api("POST","/api/reward/claim",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      return {ok:true,rewardChest:r.data.rewardChest||{},rewardChestBundles:r.data.rewardChestBundles||[],
        lootPouch:r.data.lootPouch||{},supplyStash:r.data.supplyStash||{},saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível recolher",code:r.code,error:r.data.error};
  });
}
function accountSelectInstanceAmmo(token,charId,slug,automatic){
  return accountQueueInstance(async()=>{
    if(!accountLeaseAllowsSimulation()||!ACCOUNT_INSTANCE.id||ACCOUNT_INSTANCE.status!=="active")return {ok:false};
    const r=await _api("POST","/api/instance/ammo",Object.assign({token,char_id:Number(charId),ammo:String(slug||""),
      ammo_auto:!!automatic,instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields()));
    if(r.data.ok){accountInstanceApply(r.data.instance);return {ok:true,state:r.data.instance&&r.data.instance.state};}
    if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
    return {ok:false,msg:r.data.msg||"Não foi possível trocar a munição"};
  });
}
/* Equipa/desequipa um item da bag ou Loot Pouch na instância ativa. Sem isso
 * o tick autoritativo (200ms) restaura o equipamento anterior — o falcon bow
 * "voltava" depois de equipar o crossbow. */
function accountEquipInstanceItem(token,charId,opts){
  opts=opts||{};
  return accountQueueInstance(async()=>{
    if(!accountLeaseAllowsSimulation()||!ACCOUNT_INSTANCE.id||ACCOUNT_INSTANCE.status!=="active")return {ok:false};
    const r=await _api("POST","/api/instance/equip",Object.assign({
      token,char_id:Number(charId),
      unequip:!!opts.unequip,
      slug:String(opts.slug||""),
      slot:String(opts.slot||""),
      source:String(opts.source||"bag"),
      dest:String(opts.dest||"bag"),
      inst_id:opts.instId?String(opts.instId):null,
      instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields()));
    if(r.data.ok){
      accountInstanceApply(r.data.instance);
      return {ok:true,state:r.data.instance&&r.data.instance.state,
        version:r.data.instance&&r.data.instance.version};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
    return {ok:false,msg:r.data.msg||"Não foi possível equipar"};
  });
}
function accountClearInstanceLootPouch(token,charId){
  return accountQueueInstance(async()=>{
    if(!accountLeaseAllowsSimulation()||!ACCOUNT_INSTANCE.id||ACCOUNT_INSTANCE.status!=="active")return {ok:false};
    const r=await _api("POST","/api/instance/pouch-clear",Object.assign({token,char_id:Number(charId),
      instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields()));
    if(r.data.ok){
      accountInstanceApply(r.data.instance);
      return {ok:true,state:r.data.instance&&r.data.instance.state,version:r.data.instance&&r.data.instance.version};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
    return {ok:false,msg:r.data.msg||"Não foi possível limpar a Loot Pouch"};
  });
}
/** Destrói um stack da loot pouch (online: instância ou personagem na cidade). */
function accountDestroyLootPouchItem(token,charId,slug){
  slug=String(slug||"");
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),slug,
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      const r=await _api("POST","/api/instance/pouch-destroy",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,destroyed:Number(r.data.destroyed)||0,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível destruir o item"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),slug,
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    const r=await _api("POST","/api/pouch/destroy",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(r.data.lootPouch&&typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        G.p.lootPouch=r.data.lootPouch||{};
        if(r.data.supplyStash)G.p.supplyStash=r.data.supplyStash||{};
      }
      return {ok:true,destroyed:Number(r.data.destroyed)||0,lootPouch:r.data.lootPouch,
        saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível destruir o item",code:r.code};
  });
}
/** Abre a Bag You Desire (online): remove 1 da pouch e sorteia 1 item Soul War
 * para o Depot — a pouch é protected no PUT comum, sem API a bag "voltava". */
function accountOpenBagYouDesire(token, charId) {
  const onlineCombat = typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat();
  if (onlineCombat && ACCOUNT_INSTANCE.id && ACCOUNT_INSTANCE.status === "active") {
    return accountQueueInstance(async () => {
      if (!accountLeaseAllowsSimulation()) return { ok: false };
      const body = Object.assign({ token, char_id: Number(charId),
        instance_id: ACCOUNT_INSTANCE.id, expected_version: ACCOUNT_INSTANCE.version }, accountLeaseFields());
      const r = await _api("POST", "/api/instance/open-bag-you-desire", body);
      if (r.data.ok) {
        accountInstanceApply(r.data.instance);
        return { ok: true, item: r.data.item, state: r.data.instance && r.data.instance.state,
          version: r.data.instance && r.data.instance.version };
      }
      if (r.code === 423) accountLeaseMarkLost(r.data.msg); if (r.data.instance) accountInstanceApply(r.data.instance);
      return { ok: false, msg: r.data.msg || "Não foi possível abrir a Bag You Desire" };
    });
  }
  return accountQueueSave(async () => {
    if (!accountLeaseAllowsSimulation()) return { ok: false };
    const id = String(charId || "");
    const cache = await accountEnsureVersions(token, [id]);
    const summary = cache.find((c) => String(c.id) === id);
    const body = Object.assign({
      token, char_id: Number(charId),
      expected_version: Number(summary && summary.saveVersion) || 0,
    }, accountLeaseFields());
    const r = await _api("POST", "/api/pouch/open-bag-you-desire", body);
    if (r.data.ok) {
      if (r.data.character) accountMergeCharacterCache([r.data.character]);
      if (typeof G !== "undefined" && G.p && String(G.p.id) === id) {
        if (r.data.lootPouch) G.p.lootPouch = r.data.lootPouch || {};
        if (r.data.depot) G.p.depot = r.data.depot || [];
      }
      return { ok: true, item: r.data.item, lootPouch: r.data.lootPouch, depot: r.data.depot,
        saveVersion: r.data.saveVersion };
    }
    if (r.code === 423) accountLeaseMarkLost(r.data.msg);
    if (r.code === 409) accountSaveConflict([id], r.data.characters || [], r.data.msg);
    return { ok: false, msg: r.data.msg || "Não foi possível abrir a Bag You Desire", code: r.code };
  });
}
function accountSellInstanceLootPouch(token,charId,slug){
  return accountQueueInstance(async()=>{
    if(!accountLeaseAllowsSimulation()||!ACCOUNT_INSTANCE.id||ACCOUNT_INSTANCE.status!=="active")return {ok:false};
    const body=Object.assign({token,char_id:Number(charId),instance_id:ACCOUNT_INSTANCE.id,
      expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
    if(slug)body.slug=String(slug);
    const r=await _api("POST","/api/instance/pouch-sell",body);
    if(r.data.ok){
      accountInstanceApply(r.data.instance);
      return {ok:true,gold:Number(r.data.gold)||0,state:r.data.instance&&r.data.instance.state,
        version:r.data.instance&&r.data.instance.version};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
    return {ok:false,msg:r.data.msg||"Não foi possível vender a Loot Pouch"};
  });
}
/** Vende mochila (sell all ou slug/inst). gold/bag autoritativos — PUT comum não credita gold. */
function accountSellBag(token,charId,opts){
  opts=opts||{};
  const slug=opts.slug!=null&&opts.slug!==""?String(opts.slug):"";
  const instId=opts.instId!=null&&opts.instId!==""?String(opts.instId):"";
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      if(slug)body.slug=slug;
      if(instId)body.inst_id=instId;
      const r=await _api("POST","/api/instance/bag-sell",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,gold:Number(r.data.gold)||0,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível vender a mochila"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    if(slug)body.slug=slug;
    if(instId)body.inst_id=instId;
    const r=await _api("POST","/api/bag/sell",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        if(r.data.bag)G.p.bag=r.data.bag||{};
        if(r.data.itemInstances)G.p.itemInstances=r.data.itemInstances||[];
        if(r.data.goldBalance!=null)G.p.gold=Math.max(0,Math.floor(Number(r.data.goldBalance)||0));
        else if(r.data.character&&r.data.character.data&&r.data.character.data.gold!=null)
          G.p.gold=Math.max(0,Math.floor(Number(r.data.character.data.gold)||0));
      }
      return {ok:true,gold:Number(r.data.gold)||0,bag:r.data.bag,itemInstances:r.data.itemInstances,
        saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível vender a mochila",code:r.code};
  });
}
/** Move pouch/bag → Supply Stash com persistência (instância ou personagem na cidade). */
function accountMoveToSupplyStash(token,charId,opts){
  opts=opts||{};
  const slug=String(opts.slug||"");
  const source=String(opts.source||"pouch");
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),slug,source,
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      const r=await _api("POST","/api/instance/stash-move",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível mover para a Supply Stash"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),slug,source,
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    const r=await _api("POST","/api/stash/move",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        if(r.data.lootPouch)G.p.lootPouch=r.data.lootPouch||{};
        if(r.data.supplyStash)G.p.supplyStash=r.data.supplyStash||{};
        if(r.data.bag)G.p.bag=r.data.bag||{};
        if(r.data.itemInstances)G.p.itemInstances=r.data.itemInstances||[];
      }
      return {ok:true,lootPouch:r.data.lootPouch,supplyStash:r.data.supplyStash,
        bag:r.data.bag,itemInstances:r.data.itemInstances,saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível mover para a Supply Stash",code:r.code};
  });
}
/** Retira da Supply Stash (bag/pouch/destroy). supplyStash é protected no PUT. */
function accountWithdrawFromSupplyStash(token,charId,opts){
  opts=opts||{};
  const slug=String(opts.slug||"");
  const dest=String(opts.dest||"bag");
  const qty=opts.qty!=null?Number(opts.qty):null;
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),slug,dest,
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      if(qty!=null&&Number.isFinite(qty))body.qty=qty;
      const r=await _api("POST","/api/instance/stash-withdraw",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível retirar da Supply Stash"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),slug,dest,
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    if(qty!=null&&Number.isFinite(qty))body.qty=qty;
    const r=await _api("POST","/api/stash/withdraw",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        if(r.data.supplyStash)G.p.supplyStash=r.data.supplyStash||{};
        if(r.data.lootPouch)G.p.lootPouch=r.data.lootPouch||{};
        if(r.data.bag)G.p.bag=r.data.bag||{};
        if(r.data.itemInstances)G.p.itemInstances=r.data.itemInstances||[];
      }
      return {ok:true,supplyStash:r.data.supplyStash,lootPouch:r.data.lootPouch,
        bag:r.data.bag,itemInstances:r.data.itemInstances,saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível retirar da Supply Stash",code:r.code};
  });
}
/** Equipa 1 item da Supply Stash (supplyStash protected no PUT). */
function accountEquipFromSupplyStash(token,charId,opts){
  opts=opts||{};
  const slug=String(opts.slug||"");
  const slot=opts.slot!=null?String(opts.slot):"";
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),slug,
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      if(slot)body.slot=slot;
      const r=await _api("POST","/api/instance/stash-equip",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível equipar da Supply Stash"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),slug,
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    if(slot)body.slot=slot;
    const r=await _api("POST","/api/stash/equip",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        if(r.data.supplyStash)G.p.supplyStash=r.data.supplyStash||{};
        if(r.data.equip)G.p.equip=r.data.equip||{};
        if(r.data.bag)G.p.bag=r.data.bag||{};
        if(r.data.itemInstances)G.p.itemInstances=r.data.itemInstances||[];
      }
      return {ok:true,supplyStash:r.data.supplyStash,equip:r.data.equip,
        bag:r.data.bag,itemInstances:r.data.itemInstances,saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível equipar da Supply Stash",code:r.code};
  });
}
/** Move Loot Pouch → backpack com persistência (lootPouch é protected no PUT). */
function accountMovePouchToBag(token,charId,opts){
  opts=opts||{};
  const slug=String(opts.slug||"");
  const qty=opts.qty!=null?Number(opts.qty):null;
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),slug,
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      if(qty!=null&&Number.isFinite(qty))body.qty=qty;
      const r=await _api("POST","/api/instance/pouch-to-bag",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível mover para a backpack"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),slug,
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    if(qty!=null&&Number.isFinite(qty))body.qty=qty;
    const r=await _api("POST","/api/pouch/to-bag",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        if(r.data.lootPouch)G.p.lootPouch=r.data.lootPouch||{};
        if(r.data.bag)G.p.bag=r.data.bag||{};
        if(r.data.itemInstances)G.p.itemInstances=r.data.itemInstances||[];
      }
      return {ok:true,lootPouch:r.data.lootPouch,bag:r.data.bag,
        itemInstances:r.data.itemInstances,saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível mover para a backpack",code:r.code};
  });
}
/** Persiste Auto Supply Stash (online: instância em combate ou personagem na cidade). */
function accountSetAutoSupplyStash(token,charId,slug,on){
  slug=String(slug||"");
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),slug,on:!!on,
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      const r=await _api("POST","/api/instance/stash-auto",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,slug,on:!!on,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível salvar Auto Supply Stash"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),slug,on:!!on,
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    const r=await _api("POST","/api/stash/auto",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(r.data.autoSupplyStash&&typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        G.p.config=G.p.config||{};
        G.p.config.autoSupplyStash=r.data.autoSupplyStash||{};
      }
      return {ok:true,slug,on:!!on,autoSupplyStash:r.data.autoSupplyStash,saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível salvar Auto Supply Stash",code:r.code};
  });
}
/** Persiste lootConfig (NÃO COLETAR / NÃO VENDER) online. */
function accountSetLootConfig(token,charId,lootConfig){
  lootConfig=lootConfig&&typeof lootConfig==="object"&&!Array.isArray(lootConfig)
    ?lootConfig:{noCollect:[],noSell:[]};
  const onlineCombat=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
  if(onlineCombat&&ACCOUNT_INSTANCE.id&&ACCOUNT_INSTANCE.status==="active"){
    return accountQueueInstance(async()=>{
      if(!accountLeaseAllowsSimulation())return {ok:false};
      const body=Object.assign({token,char_id:Number(charId),lootConfig,
        instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version},accountLeaseFields());
      const r=await _api("POST","/api/instance/loot-config",body);
      if(r.data.ok){
        accountInstanceApply(r.data.instance);
        return {ok:true,lootConfig:r.data.lootConfig||lootConfig,state:r.data.instance&&r.data.instance.state,
          version:r.data.instance&&r.data.instance.version};
      }
      if(r.code===423)accountLeaseMarkLost(r.data.msg);if(r.data.instance)accountInstanceApply(r.data.instance);
      return {ok:false,msg:r.data.msg||"Não foi possível salvar loot config"};
    });
  }
  return accountQueueSave(async()=>{
    if(!accountLeaseAllowsSimulation())return {ok:false};
    const id=String(charId||"");
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    const body=Object.assign({
      token,char_id:Number(charId),lootConfig,
      expected_version:Number(summary&&summary.saveVersion)||0,
    },accountLeaseFields());
    const r=await _api("POST","/api/loot/config",body);
    if(r.data.ok){
      if(r.data.character)accountMergeCharacterCache([r.data.character]);
      if(r.data.lootConfig&&typeof G!=="undefined"&&G.p&&String(G.p.id)===id){
        G.p.lootConfig=r.data.lootConfig||{noCollect:[],noSell:[]};
      }
      return {ok:true,lootConfig:r.data.lootConfig,saveVersion:r.data.saveVersion};
    }
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountSaveConflict([id],r.data.characters||[],r.data.msg);
    return {ok:false,msg:r.data.msg||"Não foi possível salvar loot config",code:r.code};
  });
}
function accountRefreshInstance(token){
  return accountQueueInstance(async()=>{
    const charId=typeof sessionCharId==="function"?sessionCharId():"";
    const r=await _api("GET","/api/instance?char_id="+encodeURIComponent(charId||""),null,token);
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
      char_id:typeof sessionCharId==="function"?sessionCharId():null,
      instance_id:ACCOUNT_INSTANCE.id,expected_version:ACCOUNT_INSTANCE.version,reason:reason||"finished"},accountLeaseFields()));
    if(r.data.ok){
      // O tick final do end avança save_version; sem este merge o PUT seguinte
      // sai com expected_version obsoleto e gera 409 rotineiro no templo.
      if(r.data.characters&&r.data.characters.length)accountMergeCharacterCache(r.data.characters);
      const newerGeneration=ACCOUNT_INSTANCE_EPOCH!==endEpoch;accountInstanceApply(null);
      if(newerGeneration)ACCOUNT_INSTANCE_CAN_CREATE=true;return true;}
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    if(r.code===409)accountInstanceApply(r.data.instance||null);
    return false;
  });
}

const ACCOUNT_SYNC_CURSOR_KEY="tibia-idle-sync-cursor-v1";
let ACCOUNT_SYNC={source:null,token:"",errors:0,totalFailures:0,reconnect:null,poll:null,
  stopped:true,charRefresh:null,starting:null,generation:0,disabled:false};
function accountSyncProtocolSupported(){return ACCOUNT_SERVER_CONFIG.syncProtocol==="sse-v2";}
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
function accountStartSync(token){
  if(!token)return Promise.resolve(false);
  // Servidor anterior ao protocolo sse-v2 devolve 401 para tickets expirados.
  // Não abra EventSource nesse caso: party polling e ticks HTTP continuam.
  if(!accountSyncProtocolSupported()){ACCOUNT_SYNC.disabled=true;return Promise.resolve(false);}
  if(ACCOUNT_SYNC.disabled)return Promise.resolve(false);
  if(ACCOUNT_SYNC.source&&ACCOUNT_SYNC.token===token)return Promise.resolve(true);
  if(ACCOUNT_SYNC.starting&&ACCOUNT_SYNC.token===token)return ACCOUNT_SYNC.starting;
  ACCOUNT_SYNC.generation++;const generation=ACCOUNT_SYNC.generation;
  if(ACCOUNT_SYNC.source){try{ACCOUNT_SYNC.source.close();}catch(e){}}
  ACCOUNT_SYNC.source=null;clearTimeout(ACCOUNT_SYNC.reconnect);ACCOUNT_SYNC.reconnect=null;accountSyncStopFallback();
  ACCOUNT_SYNC.stopped=false;ACCOUNT_SYNC.token=token;
  const run=accountStartSyncNow(token,generation).finally(()=>{
    if(ACCOUNT_SYNC.generation===generation)ACCOUNT_SYNC.starting=null;
  });
  ACCOUNT_SYNC.starting=run;return run;
}
async function accountStartSyncNow(token,generation){
  if(typeof EventSource==="undefined"){accountSyncFallback(token);return false;}
  const ticket=await _api("POST","/api/sync/ticket",{token});
  if(ACCOUNT_SYNC.stopped||ACCOUNT_SYNC.generation!==generation)return false;
  if(!ticket.data.ok){ACCOUNT_SYNC.totalFailures++;accountSyncFallback(token);
    if(ACCOUNT_SYNC.totalFailures<5)ACCOUNT_SYNC.reconnect=setTimeout(()=>accountStartSync(token),5000);
    else ACCOUNT_SYNC.disabled=true;return false;}
  const url=ACCOUNT_API_URL+"/api/sync/events?ticket="+encodeURIComponent(ticket.data.ticket)+
    "&lastEventId="+encodeURIComponent(accountSyncCursor());
  const source=new EventSource(url);ACCOUNT_SYNC.source=source;
  const renewTicket=()=>{if(ACCOUNT_SYNC.stopped||source!==ACCOUNT_SYNC.source)return;
    try{source.close();}catch(e){}ACCOUNT_SYNC.source=null;accountSyncFallback(token);
    clearTimeout(ACCOUNT_SYNC.reconnect);ACCOUNT_SYNC.reconnect=setTimeout(()=>accountStartSync(token),250);};
  const receive=(type,event)=>{
    if(event.lastEventId)accountSyncCursor(event.lastEventId);let data={};try{data=JSON.parse(event.data||"{}");}catch(e){}
    if(type==="sync-expired"){accountSyncDispatch("disconnected",{reason:data.reason||"ticket-expired"});renewTicket();return;}
    if(type==="lease"){
      if(data.holderId&&data.holderId!==ACCOUNT_LEASE_PAGE_HOLDER&&ACCOUNT_LEASE.active&&data.action!=="release")
        accountLeaseMarkLost("Outra aba ou dispositivo assumiu o controle.");
      accountSyncDispatch("lease",data);return;
    }
    if(type==="instance"){
      if(data.holderId&&data.holderId===ACCOUNT_LEASE_PAGE_HOLDER)return;
      if(Number(data.version)<=Number(ACCOUNT_INSTANCE.version)&&data.status===ACCOUNT_INSTANCE.status)return;
      const matchesCurrent=!!(data.id&&String(data.id)===String(ACCOUNT_INSTANCE.id));
      accountRefreshInstance(token).then((fresh)=>{if(fresh.ok)accountSyncDispatch("instance",Object.assign({},fresh,
        {event:Object.assign({},data,{matchesCurrent})}));});return;
    }
    if(type==="character"){accountSyncRefreshCharacters(token);return;}
    if(type==="party"||type==="party-inbox"){accountSyncDispatch("party",data);return;}
    if(type==="mega-lobby"){accountSyncDispatch("mega-lobby",data);return;}
    if(type==="pale-lobby"){accountSyncDispatch("pale-lobby",data);return;}
    if(type==="snapshot-required"){
      accountSyncRefreshCharacters(token);accountRefreshInstance(token).then((fresh)=>accountSyncDispatch("instance",fresh));
      accountSyncDispatch("party",data);
    }
    if(type==="maintenance"){
      accountNotifyMaintenance({
        active:!!data.active,
        endsAt:Number(data.endsAt)||0,
        remainingMs:Math.max(0,Number(data.remainingMs)||0),
        remainingSec:Math.max(0,Number(data.remainingSec)||0),
      });
    }
    if(type==="world-boss"){accountSyncDispatch("world-boss",data);return;}
  };
  for(const type of ["lease","instance","character","party","party-inbox","mega-lobby","pale-lobby","snapshot-required","sync-expired","maintenance","world-boss"])
    source.addEventListener(type,(event)=>receive(type,event));
  const connected=(event)=>{if(event&&event.lastEventId)accountSyncCursor(event.lastEventId);
    ACCOUNT_SYNC.errors=0;ACCOUNT_SYNC.totalFailures=0;accountSyncStopFallback();accountSyncDispatch("connected",{});};
  source.addEventListener("ready",connected);source.onopen=()=>connected(null);
  source.onerror=()=>{if(ACCOUNT_SYNC.stopped||source!==ACCOUNT_SYNC.source)return;
    ACCOUNT_SYNC.errors++;ACCOUNT_SYNC.totalFailures++;accountSyncDispatch("disconnected",{attempt:ACCOUNT_SYNC.totalFailures});
    if(ACCOUNT_SYNC.totalFailures>=5){try{source.close();}catch(e){}ACCOUNT_SYNC.source=null;
      ACCOUNT_SYNC.disabled=true;accountSyncFallback(token);return;}
    if(ACCOUNT_SYNC.errors>=3){try{source.close();}catch(e){}ACCOUNT_SYNC.source=null;accountSyncFallback(token);
      clearTimeout(ACCOUNT_SYNC.reconnect);ACCOUNT_SYNC.reconnect=setTimeout(()=>accountStartSync(token),Math.min(15000,1000*ACCOUNT_SYNC.totalFailures));}};
  return true;
}
function accountStopSync(){ACCOUNT_SYNC.stopped=true;ACCOUNT_SYNC.generation++;
  if(ACCOUNT_SYNC.source){try{ACCOUNT_SYNC.source.close();}catch(e){}}
  ACCOUNT_SYNC.source=null;ACCOUNT_SYNC.starting=null;clearTimeout(ACCOUNT_SYNC.reconnect);ACCOUNT_SYNC.reconnect=null;
  accountSyncStopFallback();ACCOUNT_SYNC.token="";ACCOUNT_SYNC.errors=0;ACCOUNT_SYNC.totalFailures=0;ACCOUNT_SYNC.disabled=false;}

async function _api(method, path, body, token, options) {
  const headers = { "Content-Type": "application/json" },requestToken=String(token||(body&&body.token)||"");
  if(requestToken&&ACCOUNT_UNAUTHORIZED_TOKEN===requestToken)
    return {code:401,data:{ok:false,error:"SESSION_INVALID",msg:"Sessão expirada"}};
  // Lease/renew/tick mandam token no body; Bearer espelha o mesmo segredo para
  // endpoints que só leem Authorization e para proxies que exigem o header.
  if (requestToken) headers["Authorization"] = "Bearer " + requestToken;
  try {
    const r = await fetch(ACCOUNT_API_URL + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch (e) { data = {}; }
    // APIs antigas misturam Bearer e `token` no body. Considere ambos para
    // desligar todos os loops ao primeiro 401 autenticado; login inválido não
    // traz token e portanto nunca passa por esta invalidação.
    // skipInvalidate: renew pós-restart usa o caminho SERVIDOR/Reconnect sem
    // apagar a sessão local (acquire/tick ainda invalidam se o token morreu).
    if(r.status===401&&requestToken&&!(options&&options.skipInvalidate))
      accountInvalidateSession(requestToken,data);
    if(r.status>0)accountNotifyServerReachable(true);
    return { code: r.status, data: data };
  } catch (error) {
    accountNotifyServerReachable(false);
    return { code: 0, data: { ok:false, error:"NETWORK_ERROR",
      msg:"Servidor indisponível. Verifique se a API está ligada." } };
  }
}
/* Monitor de /api/health: detecta queda (rede) e restart (bootId novo) sem
 * auto-reconnect agressivo. O botão Reconnect é obrigatório para retomar. */
const ACCOUNT_SERVER_FAIL_NEED=2;
const ACCOUNT_SERVER_HEALTH_ONLINE_MS=10000;
const ACCOUNT_SERVER_HEALTH_OFFLINE_MS=5000;
let ACCOUNT_SERVER_REACHABLE=true;
let ACCOUNT_SERVER_FORCED_OFFLINE=false;
let ACCOUNT_SERVER_FAIL_STREAK=0;
let ACCOUNT_SERVER_BOOT_ID="";
let ACCOUNT_SERVER_STARTED_AT=0;
let ACCOUNT_SERVER_LAST_REASON="";
let ACCOUNT_SERVER_HEALTH_TIMER=null;
let ACCOUNT_SERVER_HEALTH_INFLIGHT=null;

function accountServerForcedOffline(){return !!ACCOUNT_SERVER_FORCED_OFFLINE;}
function accountServerReachable(){return !!ACCOUNT_SERVER_REACHABLE;}
function accountServerBootId(){return ACCOUNT_SERVER_BOOT_ID;}
function accountServerDisconnectReason(){return ACCOUNT_SERVER_LAST_REASON||"";}

function accountNotifyServerPower(on){
  try{window.dispatchEvent(new CustomEvent("tibia-idle-server-power",{detail:{on:!!on}}));}catch(e){}
}

function applyPlayersOnlineCount(payload){
  const box=document.getElementById("players-online");
  const countEl=document.getElementById("players-online-count");
  if(!box||!countEl)return;
  const online=payload&&typeof payload==="object"?payload:null;
  const total=online&&online.total!=null?Number(online.total)
    :(online&&online.onlineChars!=null?Number(online.onlineChars)+Number(online.offlineHunting||0):NaN);
  if(!Number.isFinite(total)){
    box.hidden=true;
    return;
  }
  countEl.textContent=String(Math.max(0,Math.floor(total)));
  box.hidden=false;
  const title=typeof t==="function"?t("players.onTitle"):"Personagens online ou em caçada offline";
  box.title=title;
  try{window.dispatchEvent(new CustomEvent("tibia-idle-players-online",{detail:online}));}catch(e){}
}

async function accountFetchOnlineCount(){
  if(!accountApiConfigured())return null;
  try{
    const response=await fetch(ACCOUNT_API_URL+"/api/online-count",{method:"GET",cache:"no-store"});
    let data={};
    try{data=await response.json();}catch(e){data={};}
    if(!response.ok||!data||!data.ok)return null;
    applyPlayersOnlineCount(data);
    return data;
  }catch(e){return null;}
}
function accountNotifyMaintenance(state){
  try{window.dispatchEvent(new CustomEvent("tibia-idle-maintenance",{detail:state||{}}));}catch(e){}
}
function accountApplyMaintenanceFromHealth(data){
  const m=data&&data.maintenance;
  if(!m||typeof m!=="object")return;
  const active=!!m.active&&Number(m.endsAt)>Date.now();
  accountNotifyMaintenance({
    active,
    endsAt:Number(m.endsAt)||0,
    remainingMs:Math.max(0,Number(m.remainingMs)||0),
    remainingSec:Math.max(0,Number(m.remainingSec)||0),
  });
}
function accountNotifyServerReachable(online){
  if(online){
    ACCOUNT_SERVER_FAIL_STREAK=0;
    // Disconnect forçado só sai pelo botão Reconnect (accountClearServerForcedOffline).
    if(ACCOUNT_SERVER_FORCED_OFFLINE){
      ACCOUNT_SERVER_REACHABLE=true;
      accountNotifyServerPower(true);
      return;
    }
    if(!ACCOUNT_SERVER_REACHABLE){
      ACCOUNT_SERVER_REACHABLE=true;
      accountNotifyServerPower(true);
      try{window.dispatchEvent(new CustomEvent("tibia-idle-server-online"));}catch(e){}
    }else{
      ACCOUNT_SERVER_REACHABLE=true;
      accountNotifyServerPower(true);
    }
    return;
  }
  ACCOUNT_SERVER_FAIL_STREAK++;
  if(ACCOUNT_SERVER_FAIL_STREAK<ACCOUNT_SERVER_FAIL_NEED)return;
  accountNotifyServerPower(false);
  accountForceServerDisconnect("network");
}

function accountLeaseSoftPause(){
  // Pausa simulação sem limpar o segredo — após o restart o renew/acquire
  // pode retomar o mesmo holder se o lease ainda existir no storage.
  ACCOUNT_LEASE.active=false;ACCOUNT_LEASE.lost=true;ACCOUNT_LEASE.heldUntil=0;
  if(ACCOUNT_LEASE.timer){clearTimeout(ACCOUNT_LEASE.timer);ACCOUNT_LEASE.timer=null;}
  try{window.dispatchEvent(new CustomEvent("tibia-idle-lease-lost"));}catch(e){}
}

function accountForceServerDisconnect(reason){
  const next=String(reason||"network");
  const already=ACCOUNT_SERVER_FORCED_OFFLINE;
  ACCOUNT_SERVER_FORCED_OFFLINE=true;
  ACCOUNT_SERVER_REACHABLE=false;
  ACCOUNT_SERVER_LAST_REASON=next;
  if(next!=="restart")accountNotifyServerPower(false);
  if(ACCOUNT_LEASE.active||ACCOUNT_LEASE.token)accountLeaseSoftPause();
  if(typeof accountStopSync==="function")accountStopSync();
  if(!already||next==="restart"||next==="maintenance"){
    try{window.dispatchEvent(new CustomEvent("tibia-idle-server-offline",{detail:{reason:next}}));}catch(e){}
  }
}

function accountClearServerForcedOffline(){
  ACCOUNT_SERVER_FORCED_OFFLINE=false;
  ACCOUNT_SERVER_REACHABLE=true;
  ACCOUNT_SERVER_FAIL_STREAK=0;
  ACCOUNT_SERVER_LAST_REASON="";
  ACCOUNT_LEASE.authFailUntil=0;
  try{window.dispatchEvent(new CustomEvent("tibia-idle-server-online"));}catch(e){}
}

async function accountCheckServerHealth(){
  if(!accountApiConfigured())return {ok:false,skipped:true};
  if(ACCOUNT_SERVER_HEALTH_INFLIGHT)return ACCOUNT_SERVER_HEALTH_INFLIGHT;
  ACCOUNT_SERVER_HEALTH_INFLIGHT=(async()=>{
    try{
      const response=await fetch(ACCOUNT_API_URL+"/api/health",{method:"GET",cache:"no-store"});
      let data={};
      try{data=await response.json();}catch(e){data={};}
      if(!response.ok||!data||!data.ok){
        accountNotifyServerReachable(false);
        return {ok:false};
      }
      accountApplyMaintenanceFromHealth(data);
      if(data.playersOnline)applyPlayersOnlineCount(data.playersOnline);
      else accountFetchOnlineCount();
      const bootId=String(data.bootId||"");
      const startedAt=Number(data.startedAt)||0;
      if(ACCOUNT_SERVER_BOOT_ID&&bootId&&bootId!==ACCOUNT_SERVER_BOOT_ID){
        ACCOUNT_SERVER_BOOT_ID=bootId;
        ACCOUNT_SERVER_STARTED_AT=startedAt;
        accountForceServerDisconnect("restart");
        accountNotifyServerPower(true);
        return {ok:true,restarted:true,bootId,startedAt,maintenance:data.maintenance||null};
      }
      if(bootId&&!ACCOUNT_SERVER_BOOT_ID){
        ACCOUNT_SERVER_BOOT_ID=bootId;
        ACCOUNT_SERVER_STARTED_AT=startedAt;
      }else if(bootId){
        ACCOUNT_SERVER_BOOT_ID=bootId;
        if(startedAt)ACCOUNT_SERVER_STARTED_AT=startedAt;
      }
      ACCOUNT_SERVER_FAIL_STREAK=0;
      if(!ACCOUNT_SERVER_FORCED_OFFLINE)accountNotifyServerReachable(true);
      else{
        ACCOUNT_SERVER_REACHABLE=true;
        accountNotifyServerPower(true);
        try{window.dispatchEvent(new CustomEvent("tibia-idle-server-ready",{
          detail:{bootId:ACCOUNT_SERVER_BOOT_ID,startedAt:ACCOUNT_SERVER_STARTED_AT}}));}catch(e){}
      }
      return {ok:true,bootId:ACCOUNT_SERVER_BOOT_ID,startedAt:ACCOUNT_SERVER_STARTED_AT,
        forcedOffline:ACCOUNT_SERVER_FORCED_OFFLINE,maintenance:data.maintenance||null,
        serverPower:data.serverPower||"on"};
    }catch(error){
      accountNotifyServerReachable(false);
      return {ok:false,error:"NETWORK_ERROR"};
    }finally{ACCOUNT_SERVER_HEALTH_INFLIGHT=null;}
  })();
  return ACCOUNT_SERVER_HEALTH_INFLIGHT;
}

function accountStartServerHealthMonitor(){
  if(!accountApiConfigured()||ACCOUNT_SERVER_HEALTH_TIMER)return;
  const tick=()=>{
    accountCheckServerHealth().finally(()=>{
      let ms=ACCOUNT_SERVER_FORCED_OFFLINE?ACCOUNT_SERVER_HEALTH_OFFLINE_MS:ACCOUNT_SERVER_HEALTH_ONLINE_MS;
      // Durante countdown de manutenção, poll mais rápido.
      try{
        const el=document.getElementById("maintenance-countdown");
        if(el&&!el.hidden)ms=Math.min(ms,2000);
      }catch(e){}
      ACCOUNT_SERVER_HEALTH_TIMER=setTimeout(tick,ms);
    });
  };
  ACCOUNT_SERVER_HEALTH_TIMER=setTimeout(tick,1500);
}

function accountStopServerHealthMonitor(){
  if(ACCOUNT_SERVER_HEALTH_TIMER){clearTimeout(ACCOUNT_SERVER_HEALTH_TIMER);ACCOUNT_SERVER_HEALTH_TIMER=null;}
}

async function accountRegister(login, password, email) {
  const r = await _api("POST", "/api/register", { login, password, email: email || "" });
  if (r.data.ok) return { ok:true, msg:"Conta criada!" };
  if (r.code === 409 || r.data.error === "ACCOUNT_EXISTS")
    return { ok:false, exists:true, msg:"Conta já existe. Use a aba Entrar." };
  return { ok:false, msg:r.data.msg || "Falha ao criar conta" };
}

/* Solicita o envio do código de verificação de e-mail (6 dígitos). */
async function accountEmailSendCode(token, email) {
  const r = await _api("POST", "/api/account/email/send", { token, email: email || "" });
  return r.data || { ok: false, msg: "Falha ao enviar o código" };
}

/* Confirma o código de verificação e marca o e-mail como confirmado. */
async function accountEmailVerify(token, code) {
  const r = await _api("POST", "/api/account/email/verify", { token, code: code || "" });
  return r.data || { ok: false, msg: "Falha ao confirmar o código" };
}

async function accountLogin(login, password) {
  const r = await _api("POST", "/api/login", { login, password });
  if (!r.data.ok) return { ok: false, msg: r.data.msg || "Falha no login" };
  ACCOUNT_UNAUTHORIZED_TOKEN="";
  ACCOUNT_LEASE.authFailUntil=0;
  if(ACCOUNT_UNAUTHORIZED_RELOAD){clearTimeout(ACCOUNT_UNAUTHORIZED_RELOAD);ACCOUNT_UNAUTHORIZED_RELOAD=null;}
  try{sessionStorage.removeItem("tibia-idle-session-expired");}catch(e){}
  try{window.dispatchEvent(new CustomEvent("tibia-idle-session-restored"));}catch(e){}
  if(r.data.account){
    if(typeof syncVipFromAccount==="function")syncVipFromAccount(r.data.account);
    if(typeof accountSetGold==="function"&&r.data.account.gold!==undefined)
      accountSetGold(Math.max(0,Number(r.data.account.gold)||0));
    if(typeof accountSetCoins==="function"&&r.data.account.coins!==undefined)
      accountSetCoins(Math.max(0,Number(r.data.account.coins)||0));
  }
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
    // Mesma regra do party-save: tick/end autoritativo materializa o char e
    // avança save_version. Esperar a fila da instância evita PUT com versão
    // stale logo após stopHunt (end + save em filas distintas).
    if(typeof accountLastInstancePromise==="function")await accountLastInstancePromise();
    if(ACCOUNT_INSTANCE&&ACCOUNT_INSTANCE.status==="active")return true;
    let cache=await accountEnsureVersions(token,[id]);
    let summary=cache.find((c)=>String(c.id)===id);
    if(!summary||!Number.isSafeInteger(Number(summary.saveVersion)))return false;
    const putOnce=(expected)=>_api("PUT","/api/characters/"+encodeURIComponent(id),
      Object.assign({token,expected_version:Number(expected)},accountLeaseFields(),accountSavePayload(p)));
    let r=await putOnce(summary.saveVersion);
    if(r.data.ok){accountMergeCharacterCache([r.data.character]);return true;}
    // Corrida benigna (tick final, market, claim): atualize a revisão e tente
    // uma vez. Só bloqueie a aba se o retry também perder — aí há sessão
    // concorrente de verdade. Gold/inventário protegidos no servidor.
    if(r.code===409&&r.data.error==="SAVE_VERSION_CONFLICT"){
      if(r.data.characters&&r.data.characters.length)accountMergeCharacterCache(r.data.characters);
      else{await accountSyncRefreshCharacters(token);}
      cache=accountCharacterCacheRead();
      summary=cache.find((c)=>String(c.id)===id);
      if(summary&&Number.isSafeInteger(Number(summary.saveVersion))){
        r=await putOnce(summary.saveVersion);
        if(r.data.ok){accountMergeCharacterCache([r.data.character]);return true;}
      }
    }
    if(r.code===409){
      accountSaveConflict([id],r.data.characters||[],r.data.msg);return false;
    }
    if(r.code===428)accountSaveConflict([id],[],r.data.msg);
    if(r.code===423)accountLeaseMarkLost(r.data.msg);
    return false;
  });
}

/* Painel Admin: grava snapshot completo (level/exp/skills/gold/bag/…) e, se
 * houver instância ativa, atualiza o authority antes do MySQL do personagem.
 * Diferente do autosave comum — que ignora progressão protegida e no-op em
 * combate online. */
let ACCOUNT_ADMIN_GRANT_LAST_ERROR="";
function accountAdminGrantLastError(){return ACCOUNT_ADMIN_GRANT_LAST_ERROR||"";}
async function accountAdminSaveCharacter(token, charId, p) {
  const id=String(charId);
  ACCOUNT_ADMIN_GRANT_LAST_ERROR="";
  return accountQueueSave(async()=>{
    if(ACCOUNT_SAVE_CONFLICTS.has(id)||!accountLeaseAllowsSimulation()){
      ACCOUNT_ADMIN_GRANT_LAST_ERROR="Sessão sem controle (lease) para gravar o grant.";
      return false;
    }
    if(typeof accountLastInstancePromise==="function")await accountLastInstancePromise();
    let cache=await accountEnsureVersions(token,[id]);
    let summary=cache.find((c)=>String(c.id)===id);
    if(!summary||!Number.isSafeInteger(Number(summary.saveVersion))){
      ACCOUNT_ADMIN_GRANT_LAST_ERROR="Versão do personagem desconhecida. Recarregue.";
      return false;
    }
    const putOnce=(expected)=>_api("PUT","/api/characters/"+encodeURIComponent(id),
      Object.assign({token,expected_version:Number(expected),admin_grant:true},
        accountLeaseFields(),accountSavePayload(p)));
    let r=await putOnce(summary.saveVersion);
    const applyOk=(data)=>{
      if(data.character)accountMergeCharacterCache([data.character]);
      if(data.instance)accountInstanceApply(data.instance);
      if(data.account){
        try{
          const raw=sessionStorage.getItem("tibia-idle-account"),acc=raw?JSON.parse(raw):null;
          if(acc){
            if(data.account.coins!==undefined)acc.coins=Math.max(0,Number(data.account.coins)||0);
            if(data.account.gold!==undefined)acc.gold=Math.max(0,Number(data.account.gold)||0);
            if(data.account.vipUntil!==undefined)acc.vipUntil=data.account.vipUntil;
            sessionStorage.setItem("tibia-idle-account",JSON.stringify(acc));
          }
        }catch(e){}
        if(typeof syncVipFromAccount==="function")syncVipFromAccount(data.account);
        if(typeof accountSetCoins==="function"&&data.account.coins!==undefined)
          accountSetCoins(Math.max(0,Number(data.account.coins)||0));
        if(typeof accountSetGold==="function"&&data.account.gold!==undefined)
          accountSetGold(Math.max(0,Number(data.account.gold)||0));
      }
      return true;
    };
    if(r.data.ok)return applyOk(r.data);
    if(r.code===409&&r.data.error==="SAVE_VERSION_CONFLICT"){
      if(r.data.characters&&r.data.characters.length)accountMergeCharacterCache(r.data.characters);
      else{await accountSyncRefreshCharacters(token);}
      cache=accountCharacterCacheRead();
      summary=cache.find((c)=>String(c.id)===id);
      if(summary&&Number.isSafeInteger(Number(summary.saveVersion))){
        r=await putOnce(summary.saveVersion);
        if(r.data.ok)return applyOk(r.data);
      }
    }
    ACCOUNT_ADMIN_GRANT_LAST_ERROR=String((r.data&&(r.data.msg||r.data.error))||
      ("HTTP "+r.code+" ao gravar grant admin"));
    if(r.code===409){
      if(r.data.instance)accountInstanceApply(r.data.instance);
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
    // O tick da instância já materializa todos os membros atomicamente e
    // incrementa seus save_versions. Espera qualquer tick/end já enfileirado:
    // durante combate o party-save seria redundante (e disputaria a versão);
    // após stopHunt, o end conclui primeiro e o checkpoint curado é salvo.
    if(typeof accountLastInstancePromise==="function")await accountLastInstancePromise();
    if(ACCOUNT_INSTANCE&&ACCOUNT_INSTANCE.status==="active")return true;
    let account=null;try{account=typeof sessionAccount==="function"?sessionAccount():null;}catch(e){}
    if(state.ownedByAccount&&account&&Number(state.ownedByAccount)!==Number(account.id))return true;
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
      // Alteração do roster não significa conflito de save dos personagens.
      // Atualize a party, mas não deixe todos os chars bloqueados até reload.
      if(r.data.error==="PARTY_VERSION_CONFLICT"||r.data.error==="PARTY_SAVE_SET_MISMATCH"){
        accountSyncDispatch("party",r.data.party||{});return false;
      }
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
  if(!r.data.ok)return { ok: false, msg:r.data.msg||r.data.error||"Falha ao alterar Tibia Coins" };
  const coins=Math.max(0,Number(r.data.coins)||0);
  try{
    const raw=sessionStorage.getItem("tibia-idle-account"),acc=raw?JSON.parse(raw):null;
    if(acc){acc.coins=coins;sessionStorage.setItem("tibia-idle-account",JSON.stringify(acc));}
  }catch(e){}
  if(typeof accountSetCoins==="function")accountSetCoins(coins);
  if(typeof renderCoinBalance==="function")renderCoinBalance();
  return { ok: true, coins };
}

/* Admin/test: adiciona dias de VIP na conta (ou clear=true remove). */
async function accountAddVipDays(token, days, clear) {
  const r = await _api("POST", "/api/vip", {
    token, days: clear ? 0 : Math.max(0, Math.floor(Number(days) || 0)), clear: !!clear,
  });
  if (!r.data.ok) return { ok: false, msg: r.data.msg || r.data.error || "Falha ao alterar VIP" };
  const vipUntil = Math.max(0, Math.floor(Number(r.data.vipUntil) || 0));
  if (typeof syncVipFromAccount === "function") syncVipFromAccount({ vipUntil, vip: vipUntil > Date.now() });
  try {
    if (typeof G !== "undefined" && G && G.p) G.p.vipUntil = vipUntil;
  } catch (e) {}
  return { ok: true, vipUntil, vip: !!r.data.vip };
}
async function accountUpdateMissions(token, missions, missionsDone) {
  const r = await _api("POST", "/api/account/missions", { token, missions, missionsDone });
  return r.data.ok ? { ok: true, missions: r.data.missions, missionsDone: r.data.missionsDone } : { ok: false };
}

function accountApplyServerBalances(data){
  data=data||{};
  if(data.character){accountMergeCharacterCache([data.character]);
    try{if(typeof G!=="undefined"&&G&&G.p&&String(G.p.id)===String(data.character.id)&&data.character.snapshot){
      const g=Math.max(0,Number(data.character.snapshot.gold)||0);
      if(typeof accountSetGold==="function")accountSetGold(g);
      else G.p.gold=g;
    }}catch(e){}}
  if(data.account&&typeof syncVipFromAccount==="function")syncVipFromAccount(data.account);
  const gold=Number(data.gold!==undefined?data.gold:(data.account&&data.account.gold));
  if(Number.isFinite(gold)&&typeof accountSetGold==="function")accountSetGold(Math.max(0,gold));
  const coins=Number(data.coinBalance);
  if(Number.isFinite(coins)){
    try{const raw=sessionStorage.getItem("tibia-idle-account"),account=raw?JSON.parse(raw):null;
      if(account){account.coins=Math.max(0,coins);sessionStorage.setItem("tibia-idle-account",JSON.stringify(account));}}catch(e){}
    if(typeof accountSetCoins==="function")accountSetCoins(Math.max(0,coins));
    if(typeof renderCoinBalance==="function")renderCoinBalance();
  }
  return data;
}

/* ------------------------------ MARKET P2P ------------------------------ */

/* Cria oferta de venda (item ou Tibia Coins).
 * body: { token, kind, slug?, tier?, data?, qty?, price, price_tc?, days?,
 *        seller_name? } */
async function marketCreateOffer(body) {
  const r = await _api("POST", "/api/market/offers", body);
  if(r.data.ok){accountApplyServerBalances(r.data);return {ok:true,offer:r.data.offer,matched:r.data.matched,
    bank:r.data.bank,coinBalance:r.data.coinBalance};}
  return {ok:false,msg:r.data.msg||"Falha ao criar oferta"};
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
  if(r.data.ok){accountApplyServerBalances(r.data);return {ok:true,data:r.data};}
  return {ok:false,msg:r.data.msg||"Falha na compra"};
}

/* Cancela oferta. body: { token } */
async function marketCancelOffer(token, offerId) {
  const r = await _api("DELETE", "/api/market/offers/" + offerId, { token });
  if(r.data.ok){accountApplyServerBalances(r.data);return {ok:true,refundCoins:r.data.refundCoins||0,
    refundGold:r.data.refundGold||0,bank:r.data.bank,coinBalance:r.data.coinBalance};}
  return {ok:false,msg:r.data.msg};
}

/* Coleta o gold pendente de vendas do market. */
async function marketClaimGold(token) {
  const r = await _api("POST", "/api/market/claim", { token });
  return r.data.ok ? { ok: true, gold: r.data.gold || 0 } : { ok: false, msg: r.data.msg };
}

function marketGoldTransferBody(token,amount,p){
  p=p||(typeof G!=="undefined"&&G&&G.p);const id=p&&p.id,cache=accountCharacterCacheRead();
  const summary=cache.find((c)=>String(c.id)===String(id));
  return Object.assign({token,amount,char_id:Number(id),expected_version:summary?Number(summary.saveVersion):0},accountLeaseFields());
}
/* Deposita gold do personagem no banco do market. */
async function marketDeposit(token, amount, p) {
  const r = await _api("POST", "/api/market/deposit", marketGoldTransferBody(token,amount,p));
  if(r.data.ok){accountApplyServerBalances(r.data);return {ok:true,bank:r.data.bank,coinBalance:r.data.coinBalance};}
  return {ok:false,msg:r.data.msg};
}

/* Saca gold do banco do market para o personagem. */
async function marketWithdraw(token, amount, p) {
  const r = await _api("POST", "/api/market/withdraw", marketGoldTransferBody(token,amount,p));
  if(r.data.ok){accountApplyServerBalances(r.data);return {ok:true,bank:r.data.bank,amount:r.data.amount,
    coinBalance:r.data.coinBalance};}
  return {ok:false,msg:r.data.msg};
}

/* Saldo do banco do market. */
async function marketBank(token) {
  const r = await _api("GET", "/api/market/bank", null, token);
  if(r.data.ok){accountApplyServerBalances(r.data);return {ok:true,bank:r.data.bank,coinBalance:r.data.coinBalance};}
  return {ok:false,msg:r.data.msg};
}

function storeApplyCoins(coins) {
  const n = Math.max(0, Math.floor(Number(coins) || 0));
  try {
    const raw = sessionStorage.getItem("tibia-idle-account");
    const acc = raw ? JSON.parse(raw) : null;
    if (acc) {
      acc.coins = n;
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    }
  } catch (e) {}
  if (typeof accountSetCoins === "function") accountSetCoins(n);
  if (typeof renderCoinBalance === "function") renderCoinBalance();
  return n;
}

async function storeCatalog() {
  const r = await _api("GET", "/api/store/catalog");
  return r.data && r.data.ok ? r.data : { ok: false, msg: (r.data && r.data.msg) || "Falha ao carregar a loja" };
}
async function storeCheckout(token, packId, method, email) {
  const r = await _api("POST", "/api/store/checkout", { token, packId, method, email });
  return r.data || { ok: false, msg: "Falha no checkout" };
}
async function storeOrderStatus(token, orderId) {
  const r = await _api("GET", "/api/store/orders/" + encodeURIComponent(orderId), null, token);
  if (r.data && r.data.ok && r.data.coins != null) storeApplyCoins(r.data.coins);
  return r.data || { ok: false, msg: "Pedido não encontrado" };
}
async function storeSimulatePay(token, orderId) {
  const r = await _api("POST", "/api/store/simulate", { token, orderId });
  if (r.data && r.data.ok && r.data.coins != null) storeApplyCoins(r.data.coins);
  return r.data || { ok: false, msg: "Falha ao simular" };
}
async function storeBuyVip(token, packId) {
  const r = await _api("POST", "/api/store/vip", { token, packId });
  if (r.data && r.data.ok) {
    if (r.data.coins != null) storeApplyCoins(r.data.coins);
    if (typeof syncVipFromAccount === "function")
      syncVipFromAccount({ vipUntil: r.data.vipUntil, vip: r.data.vip });
    try { if (typeof G !== "undefined" && G && G.p) G.p.vipUntil = r.data.vipUntil; } catch (e) {}
  }
  return r.data || { ok: false, msg: "Falha ao comprar VIP" };
}
async function storeHistory(token) {
  const r = await _api("GET", "/api/store/history", null, token);
  if (r.data && r.data.ok && r.data.coins != null) storeApplyCoins(r.data.coins);
  return r.data || { ok: false, msg: "Falha ao carregar histórico" };
}
async function storeAdminSummary(token) {
  const r = await _api("GET", "/api/store/admin", null, token);
  return r.data || { ok: false, msg: "Falha ao carregar o faturamento" };
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
  if (r.data.ok) {
    return {
      ok: true,
      added: !!r.data.added,
      member: r.data.member || null,
      msg: r.data.msg || "Membro adicionado.",
      invite: r.data.invite || null,
    };
  }
  return { ok: false, msg: r.data.msg };
}

async function accountPartyInbox() {
  const r = await _api("GET", "/api/party/inbox", null, sessionToken());
  return r.data.ok ? { ok: true, invites: r.data.invites || [] } : { ok: false, msg: r.data.msg };
}

async function accountPartyAccept(inviteId) {
  const r = await _api("POST", "/api/party/accept", {
    token:sessionToken(),char_id:Number(sessionCharId()),invite_id:inviteId,
  });
  if (r.data.ok) return { ok: true, msg: r.data.msg };
  return { ok: false, msg: partyInviteClientMsg(r.data.msg) };
}

async function accountPartyDecline(inviteId) {
  const r = await _api("POST", "/api/party/decline", {
    token:sessionToken(),char_id:Number(sessionCharId()),invite_id:inviteId,
  });
  if (r.data.ok) return { ok: true, msg: r.data.msg };
  return { ok: false, msg: partyInviteClientMsg(r.data.msg) };
}

function partyInviteClientMsg(raw) {
  const msg = String(raw || "");
  if (/Duplicate entry/i.test(msg) &&
      (/uq_invite_pending/i.test(msg) || /'\d+-(accepted|declined|expired|cancelled|pending)'/i.test(msg))) {
    return "Este convite já foi processado. Atualize a party.";
  }
  if (/Erro interno:/i.test(msg) && /Duplicate entry/i.test(msg)) {
    return "Este convite já foi processado. Atualize a party.";
  }
  return msg || "Falha";
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
