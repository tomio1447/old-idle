/* twitch.js — OAuth Twitch: verificação real de follow para vouchers
 * social-gated (ex.: BUTO__PVP exige seguir @buto_pvp na Twitch).
 *
 * Fluxo: GET /api/twitch/auth?token=<sessão> → 302 pro authorize da Twitch
 * → GET /api/twitch/callback?code&state → troca o code por user token
 * (escopo user:read:follows) → GET /helix/channels/followed confirma se o
 * user_id do jogador segue o canal → grava em accounts.social.twitch.
 *
 * O check usa o token do PRÓPRIO jogador — não precisa de autorização do
 * streamer. O app (client id/secret) pode ser criado em qualquer conta
 * Twitch em https://dev.twitch.tv/console/apps, com OAuth Redirect URL
 * igual a TWITCH_REDIRECT_URI.
 *
 * Config (.env):
 *   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET  — credenciais do app
 *   TWITCH_REDIRECT_URI   — ex.: https://global-idle.com/api/twitch/callback
 *   TWITCH_REQUIRED_CHANNEL — login do canal exigido (default: buto_pvp)
 */
"use strict";

const crypto = require("crypto");

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const HELIX = "https://api.twitch.tv/helix";

const env = (k, d) => String(process.env[k] || d || "").trim();
const clientId = () => env("TWITCH_CLIENT_ID");
const clientSecret = () => env("TWITCH_CLIENT_SECRET");
const redirectUri = () => env("TWITCH_REDIRECT_URI", "https://global-idle.com/api/twitch/callback");
const requiredChannel = () => env("TWITCH_REQUIRED_CHANNEL", "buto_pvp").toLowerCase();
const configured = () => !!(clientId() && clientSecret());

/* state de uso único (TTL 10 min): chave aleatória → session token do jogo.
 * Em memória basta — se o servidor reiniciar no meio do OAuth, o jogador
 * repete o fluxo (state expira/não é encontrado → erro claro). */
const STATES = new Map();
const STATE_TTL = 10 * 60 * 1000;
function newState(sessionToken) {
  for (const [k, v] of STATES) if (Date.now() - v.at > STATE_TTL) STATES.delete(k);
  const s = crypto.randomBytes(18).toString("hex");
  STATES.set(s, { token: String(sessionToken || ""), at: Date.now() });
  return s;
}
function takeState(s) {
  const k = String(s || "");
  const v = STATES.get(k);
  STATES.delete(k);
  return v && Date.now() - v.at <= STATE_TTL ? v.token : null;
}

function authUrl(state) {
  return AUTHORIZE_URL + "?" + new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(),
    response_type: "code", scope: "user:read:follows", state: String(state),
    force_verify: "true",
  }).toString();
}

async function postForm(url, params) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("twitch token failed (" + r.status + ")");
  return j;
}

const exchangeCode = (code) => postForm(TOKEN_URL, {
  client_id: clientId(), client_secret: clientSecret(),
  code: String(code), grant_type: "authorization_code",
  redirect_uri: redirectUri(),
});

async function helix(path, bearer) {
  const r = await fetch(HELIX + path, {
    headers: { "Client-Id": clientId(), "Authorization": "Bearer " + bearer },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("twitch helix " + r.status);
  return j;
}

/* App token (client_credentials) — só para resolver o broadcaster_id do
 * canal exigido; cacheado até perto da expiração. */
let _appToken = null;
async function appToken() {
  if (_appToken && _appToken.expires > Date.now() + 60000) return _appToken.token;
  const j = await postForm(TOKEN_URL, {
    client_id: clientId(), client_secret: clientSecret(),
    grant_type: "client_credentials",
  });
  _appToken = { token: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return _appToken.token;
}

let _channelId = null;
async function channelId() {
  if (_channelId) return _channelId;
  const j = await helix("/users?login=" + encodeURIComponent(requiredChannel()), await appToken());
  const u = j && j.data && j.data[0];
  if (!u || !u.id) throw new Error("canal twitch não encontrado: " + requiredChannel());
  _channelId = String(u.id);
  return _channelId;
}

/* Confirma com o token do jogador se ele segue o canal exigido. */
async function verifyFollow(userToken) {
  const me = await helix("/users", userToken);
  const u = me && me.data && me.data[0];
  if (!u || !u.id) throw new Error("usuário twitch não resolvido");
  const bid = await channelId();
  const chk = await helix(
    "/channels/followed?user_id=" + encodeURIComponent(u.id) +
    "&broadcaster_id=" + encodeURIComponent(bid), userToken);
  return {
    id: String(u.id), login: String(u.login || ""),
    follows: !!(chk && Array.isArray(chk.data) && chk.data.length),
  };
}

/* accounts.social é JSON — sanitiza e expõe helpers pro gate do voucher. */
function socialOf(acc) {
  let s = acc && acc.social;
  if (typeof s === "string") { try { s = JSON.parse(s); } catch (e) { s = null; } }
  return s && typeof s === "object" ? s : {};
}
function linkedLogin(acc) {
  const tw = socialOf(acc).twitch;
  return tw && tw.login ? String(tw.login) : "";
}
function verifiedChannel(acc) {
  const tw = socialOf(acc).twitch;
  return !!(tw && tw.follows && tw.follows[requiredChannel()] === true);
}

/* Página servida no callback: avisa o opener (postMessage) e se fecha. */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pageHtml(title, msg, ok) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#141518;color:#e8dfd0;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.c{max-width:420px;padding:28px;border:1px solid ${ok ? "#4a6b2a" : "#5a4a32"};border-radius:8px;background:#1d1f24;text-align:center}
h1{font-size:18px;color:${ok ? "#9ce84a" : "#d4af37"};margin:0 0 10px}
p{font-size:13px;color:#b8ad90;line-height:1.5;margin:0}</style></head>
<body><div class="c"><h1>${esc(title)}</h1><p>${esc(msg)}</p></div>
<script>try{if(window.opener)window.opener.postMessage({type:"gi-twitch-verified",ok:${ok ? "true" : "false"}},location.origin);}catch(e){}
setTimeout(function(){try{window.close()}catch(e){}},5000);</script></body></html>`;
}

module.exports = {
  configured, requiredChannel, newState, takeState, authUrl,
  exchangeCode, verifyFollow, socialOf, linkedLogin, verifiedChannel, pageHtml,
};
