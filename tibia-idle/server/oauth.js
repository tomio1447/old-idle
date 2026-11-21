/* oauth.js — Login/registro social: Google + Twitch.
 *
 * Fluxo único: GET /api/auth/{google|twitch} → 302 pro authorize do
 * provedor → GET /api/oauth/callback?code&state (URI compartilhada —
 * o state carrega o provider) → troca code por token → perfil do usuário
 * → oauthFinish (server.js): vincula, encontra ou cria a conta e devolve
 * uma sessão do jogo (redirect /?sso=<token>).
 *
 * UMA URI de callback serve para os DOIS provedores — registrar a mesma
 * URL no app Google e no app Twitch:
 *   OAUTH_REDIRECT_URI — default https://global-idle.com/api/oauth/callback
 *
 * Config (.env):
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — OAuth client "Web" no
 *     Google Cloud Console (scopes openid+email+profile, não-sensíveis)
 *   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET — MESMO app do gate de
 *     voucher (adicionar a OAUTH_REDIRECT_URI nas Redirect URLs dele)
 *   OAUTH_REDIRECT_URI — URI compartilhada registrada nos dois apps
 */
"use strict";

const crypto = require("crypto");
const twitch = require("./twitch");

const env = (k, d) => String(process.env[k] || d || "").trim();
const redirectUri = () => env("OAUTH_REDIRECT_URI", "https://global-idle.com/api/oauth/callback");
const googleConfigured = () => !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
/* Login Twitch usa o MESMO app do gate de voucher — basta registrar a
 * OAUTH_REDIRECT_URI como Redirect URL adicional no app. */
const twitchConfigured = () => twitch.configured();

/* States de login (TTL 10 min): chave → {provider, token(opcional p/ vínculo), at} */
const STATES = new Map();
const STATE_TTL = 10 * 60 * 1000;
function newLoginState(provider, sessionToken) {
  for (const [k, v] of STATES) if (Date.now() - v.at > STATE_TTL) STATES.delete(k);
  const s = crypto.randomBytes(18).toString("hex");
  STATES.set(s, { provider: String(provider || ""), token: String(sessionToken || ""), at: Date.now() });
  return s;
}
function takeLoginState(s) {
  const k = String(s || "");
  const v = STATES.get(k);
  STATES.delete(k);
  return v && Date.now() - v.at <= STATE_TTL ? v : null;
}

/* ------------------------------- GOOGLE ------------------------------- */
function googleAuthUrl(state) {
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri(),
    response_type: "code", scope: "openid email profile", state: String(state),
    prompt: "select_account",
  }).toString();
}
const googleExchange = (code) => twitch.postForm("https://oauth2.googleapis.com/token", {
  client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
  code: String(code), grant_type: "authorization_code", redirect_uri: redirectUri(),
});
async function googleProfile(accessToken) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: "Bearer " + accessToken } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.sub) throw new Error("google userinfo failed");
  return {
    key: String(j.sub), email: String(j.email || "").toLowerCase(),
    emailVerified: j.email_verified === true || j.email_verified === "true",
    name: String(j.given_name || j.name || j.email || "").split("@")[0],
  };
}

/* ------------------------------- TWITCH ------------------------------- */
function twitchAuthUrl(state) {
  return "https://id.twitch.tv/oauth2/authorize?" + new URLSearchParams({
    client_id: env("TWITCH_CLIENT_ID"), redirect_uri: redirectUri(),
    /* user:read:follows no login — quem já segue o canal sai do OAuth com o
     * gate do voucher BUTO__PVP resolvido de graça. */
    scope: "user:read:email user:read:follows",
    response_type: "code", state: String(state),
  }).toString();
}
const twitchExchange = (code) => twitch.exchangeCode(code, redirectUri());
async function twitchLoginProfile(accessToken) {
  const me = await twitch.helix("/users", accessToken);
  const u = me && me.data && me.data[0];
  if (!u || !u.id) throw new Error("twitch user failed");
  /* Check do canal do voucher aproveita o mesmo token — falha não bloqueia
   * o login (follows fica null e o social.twitch.follows não é tocado). */
  let follows = null;
  try { follows = (await twitch.verifyFollow(accessToken)).follows; } catch (e) {}
  return {
    key: String(u.id), login: String(u.login || ""),
    name: String(u.display_name || u.login || ""),
    email: String(u.email || "").toLowerCase(),
    /* E-mail do Twitch NÃO é comprovadamente verificado — não vincula
     * contas por e-mail (só o Google verificado tem esse privilégio). */
    emailVerified: false, follows,
  };
}

module.exports = {
  redirectUri, googleConfigured, twitchConfigured,
  newLoginState, takeLoginState,
  googleAuthUrl, googleExchange, googleProfile,
  twitchAuthUrl, twitchExchange, twitchLoginProfile,
};
