/* Regressão: polls de lobby (mega/pale) não podem spammar 401 no console.
 *
 * Antes, os dois lobbies chamavam /api/*-lobby/state a cada 4s SEM conferir
 * a sessão: com token ausente/expirado (caso clássico da VM), cada tick
 * virava um "Failed to load resource: 401" no console.
 *
 * Agora o refresh tem gate de sessão (sem token = sem request) e backoff de
 * 30s em 401 (volta a tentar depois — cobre relogin sem reload da página).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const megaSrc = fs.readFileSync(path.join(js, "megalomania-lobby.js"), "utf8");
const paleSrc = fs.readFileSync(path.join(js, "pale-worm-lobby.js"), "utf8");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");

/* ---------------- estático: os dois lobbies têm o gate ---------------- */
for (const [src, name] of [[megaSrc, "mega"], [paleSrc, "pale"]]) {
  must(src.includes("authBackoffUntil"), name + "-lobby sem authBackoffUntil");
  must(src.includes("r.status === 401"), name + "-lobby sem tratamento de 401");
  must(src.includes('const token = typeof sessionToken === "function" ? sessionToken() : "";'),
    name + "-lobby sem gate de token no refresh");
}
must(html.includes("megalomania-lobby.js?v=mega-auth-backoff-v1") &&
     html.includes("pale-worm-lobby.js?v=paleworm-auth-backoff-v1"),
  "cache-busts do fix de auth ausentes no index");

/* ---------------- lógica real do megaLobbyRefresh em vm ---------------- */
function extractFn(src, name) {
  const i = src.indexOf("async function " + name);
  must(i >= 0, name + " não encontrada");
  let depth = 0, start = src.indexOf("{", i), end = -1;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) { end = k + 1; break; }
  }
  must(end > start, name + " sem fim");
  return src.slice(i, end);
}

const calls = [];
let tokenMode = null;      // null = sem sessionToken, "" = vazio, "tok" = válido
let statusMode = 200;      // status da resposta do /state
const ctx = {
  window: {}, document: undefined, console, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  sessionToken: () => tokenMode,
  megaLobbyApi: async (method, path) => {
    calls.push({ path });
    return { status: statusMode, data: statusMode === 200 ? { ok: true, lobby: null, inbox: [] } : { ok: false } };
  },
};
vm.createContext(ctx);
// megaLobbyRefresh depende de MEGA_LOBBY_UI e megaLobbyNotifyInvites etc.
vm.runInContext(
  "const MEGA_LOBBY_UI={unsupported:false,authBackoffUntil:0,poll:null,lobby:null,inbox:[]};" +
  "function megaLobbyNotifyInvites(){};function megaLobbyRenderPanel(){};function megaLobbyMaybeFollowFromState(){};" +
  extractFn(megaSrc, "megaLobbyRefresh"), ctx, { filename: "megaLobbyRefresh" });

(async () => {
  // 1) sem função de token / token vazio: NENHUMA chamada
  tokenMode = "";
  await vm.runInContext("megaLobbyRefresh()", ctx);
  must(calls.length === 0, "sem token o refresh não pode chamar /state");

  // 2) com token e 200: chama e processa
  tokenMode = "tok"; statusMode = 200;
  await vm.runInContext("megaLobbyRefresh()", ctx);
  must(calls.length === 1, "com token válido o refresh deveria chamar /state");

  // 3) 401: marca backoff e NÃO chama de novo dentro da janela
  statusMode = 401;
  await vm.runInContext("megaLobbyRefresh()", ctx);
  must(calls.length === 2 && vm.runInContext("MEGA_LOBBY_UI.authBackoffUntil > Date.now()", ctx),
    "401 não ativou o backoff");
  await vm.runInContext("megaLobbyRefresh()", ctx);
  await vm.runInContext("megaLobbyRefresh()", ctx);
  must(calls.length === 2, "backoff ativo: refresh continuou batendo no servidor");

  // 4) backoff expirado: volta a tentar (relogin sem reload)
  vm.runInContext("MEGA_LOBBY_UI.authBackoffUntil = Date.now() - 1;", ctx);
  statusMode = 200;
  await vm.runInContext("megaLobbyRefresh()", ctx);
  must(calls.length === 3, "refresh não voltou após o backoff expirar");

  console.log("ok: polls de lobby com gate de sessão e backoff de 401 (sem spam no console)");
})().catch((e) => { console.error(e && e.message); process.exit(1); });
