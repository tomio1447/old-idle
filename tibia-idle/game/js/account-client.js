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
try {
  ACCOUNT_API_URL = localStorage.getItem("tibia-idle-api") || "";
} catch (e) { ACCOUNT_API_URL = ""; }

/* Para ligar o modo online, rode no console:
 *   localStorage.setItem("tibia-idle-api", "http://127.0.0.1:3333"); location.reload();
 * ou defina a URL aqui embaixo. */
if (!ACCOUNT_API_URL) {
  // ACCOUNT_API_URL = "http://127.0.0.1:3333";   // <- descomente p/ online
}

function accountApiConfigured() {
  return !!ACCOUNT_API_URL;
}

async function _api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(ACCOUNT_API_URL + path, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch (e) { data = {}; }
  return { code: r.status, data: data };
}

async function accountRegister(login, password) {
  const r = await _api("POST", "/api/register", { login, password });
  return r.data.ok
    ? { ok: true, msg: "Conta criada!" }
    : { ok: false, msg: r.data.msg || "Falha ao criar conta" };
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
  const data = JSON.stringify(p || {});
  const r = await _api("PUT", "/api/characters/" + charId, {
    token,
    voc: p.voc || "none",
    level: p.level || 1,
    data,
  });
  return r.data.ok;
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
