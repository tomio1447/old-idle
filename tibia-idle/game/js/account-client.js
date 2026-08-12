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
    if(ACCOUNT_SAVE_CONFLICTS.has(id))return false;
    const cache=await accountEnsureVersions(token,[id]);
    const summary=cache.find((c)=>String(c.id)===id);
    if(!summary||!Number.isSafeInteger(Number(summary.saveVersion)))return false;
    const body=Object.assign({token,expected_version:Number(summary.saveVersion)},accountSavePayload(p));
    const r=await _api("PUT","/api/characters/"+encodeURIComponent(id),body);
    if(r.data.ok){accountMergeCharacterCache([r.data.character]);return true;}
    if(r.code===409){
      accountSaveConflict([id],r.data.characters||[],r.data.msg);return false;
    }
    if(r.code===428)accountSaveConflict([id],[],r.data.msg);
    return false;
  });
}

async function accountSaveParty(token,state,players){
  const ids=(players||[]).filter((ent)=>ent&&ent.p).map((ent)=>String(ent.id));
  return accountQueueSave(async()=>{
    if(!state||!state.id||!Number.isSafeInteger(Number(state.version))||ids.some((id)=>ACCOUNT_SAVE_CONFLICTS.has(id)))return false;
    const cache=await accountEnsureVersions(token,ids);
    const entries=[];
    for(const ent of players||[]){
      if(!ent||!ent.p)continue;
      const summary=cache.find((c)=>String(c.id)===String(ent.id));
      if(!summary||!Number.isSafeInteger(Number(summary.saveVersion)))continue;
      entries.push(Object.assign({id:Number(ent.id),expected_version:Number(summary.saveVersion)},accountSavePayload(ent.p)));
    }
    const r=await _api("POST","/api/party/save",{
      token,party_id:Number(state.id),party_version:Number(state.version),
      party_order:(state.order||[]).map(Number),characters:entries,
    });
    if(r.data.ok){accountMergeCharacterCache(r.data.characters||[]);return true;}
    if(r.code===409){
      const conflicts=(r.data.characters||[]).map((c)=>String(c.id));
      accountSaveConflict(conflicts.length?conflicts:ids,r.data.characters||[],r.data.msg);return false;
    }
    if(r.code===428)accountSaveConflict(ids,[],r.data.msg);
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

async function accountPartyReportZone(charId, zoneInfo) {
  const r = await _api("POST", "/api/party/zone", Object.assign({ token: sessionToken(), char_id: charId }, zoneInfo));
  return r.data.ok ? { ok: true } : { ok: false, msg: r.data.msg };
}

async function accountPartyFollow(charId, nonce) {
  const r = await _api("POST", "/api/party/follow", { token: sessionToken(), char_id: charId, nonce });
  return r.data.ok ? { ok: true, msg: r.data.msg } : { ok: false, msg: r.data.msg };
}
