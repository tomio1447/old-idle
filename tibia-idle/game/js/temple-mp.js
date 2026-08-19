/* temple-mp.js — presença multijogador no Templo Oficial (cidade).
 *
 * O templo continua exatamente onde está (mapa templo.otbm, mesmo spawn
 * para onde os jogadores vão ao morrer). Este módulo só adiciona a camada
 * multijogador: cada jogador na cidade reporta posição/direção num
 * heartbeat para o servidor (/api/temple/presence), o servidor publica
 * snapshots via SSE ("temple") e todo mundo se vê andando pelo templo.
 *
 * Interação ao clicar em outro jogador:
 *   - Convidar para o lobby (Megalomania / Pale Worm) — só se você for o
 *     líder de um lobby aberto;
 *   - Mensagem private — pré-preenche o chat com "/pm Nome ".
 */
"use strict";

const TEMPLE_MP = {
  players: new Map(),   // charId -> entrada de presença (com fx/fy p/ lerp)
  inTemple: false,
  lastHbAt: 0,
  lastSig: "",
  timer: null,
  menu: null,
  errorBackoffUntil: 0, // até quando NÃO tentar novo heartbeat (401/403)
  errorCharId: "",
  errorLogged: false,
};

const TEMPLE_MP_HB_MS = 1200;        // throttle do heartbeat por conta
const TEMPLE_MP_KEEPALIVE_MS = 4000; // parado, reenvia só para manter vivo
const TEMPLE_MP_STALE_MS = 8000;     // sem snapshot -> some do mapa (TTL servidor)
const TEMPLE_MP_LERP_MS = 380;       // suavização do passo remoto
const TEMPLE_MP_MISS_LIMIT = 2;      // snapshots sem o jogador antes de remover
const TEMPLE_MP_ERROR_BACKOFF_MS = 30000; // 401/403: 30s entre tentativas

function templeMpApi(method, path, body) {
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  const base = typeof accountApiUrl === "function" ? accountApiUrl() : (window.location.origin || "");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return fetch(base + path, {
    method: method,
    headers: headers,
    cache: "no-store",
    // As rotas do templo autenticam pelo token no corpo (padrão dos lobbies).
    body: JSON.stringify(Object.assign({ token }, body || {})),
  }).then((r) => r.json()).catch(() => null);
}

function templeMpInTemple() {
  return !!(typeof G !== "undefined" && G && G.inCity && !G.combat && !G.training &&
    G.p && G.walker && typeof CITY !== "undefined" && CITY);
}

function templeMpTile() {
  const T = typeof TILE === "number" && TILE > 0 ? TILE : 32;
  const px = G.walker.px / T, py = G.walker.py / T;
  return {
    x: Math.max(0, Math.min(127, Math.floor(px))),
    y: Math.max(0, Math.min(127, Math.floor(py))),
  };
}

function templeMpSignature() {
  const t = templeMpTile();
  return [t.x, t.y, G.walker.dir, G.walker.moving ? 1 : 0].join(",");
}

function templeMpVocName(voc) {
  const v = String(voc || "").toLowerCase();
  if (v.includes("knight")) return "Knight";
  if (v.includes("paladin")) return "Paladin";
  if (v.includes("sorcerer")) return "Sorcerer";
  if (v.includes("druid")) return "Druid";
  if (v.includes("monk")) return "Monk";
  return String(voc || "?");
}

function templeMpEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Aplica um snapshot de presença vindo do servidor (SSE ou heartbeat). */
function templeMpApply(list) {
  const now = Date.now();
  const myChar = typeof sessionCharId === "function" ? String(sessionCharId()) : "";
  const seen = new Set();
  for (const pl of Array.isArray(list) ? list : []) {
    if (!pl || !pl.charId) continue;
    const id = String(pl.charId);
    if (myChar && id === myChar) continue;
    seen.add(id);
    const prev = TEMPLE_MP.players.get(id);
    const moved = !prev || prev.tx !== pl.x || prev.ty !== pl.y ||
      prev.dir !== pl.dir || prev.moving !== pl.moving;
    const fx = prev ? prev.fx : (typeof pl.x === "number" ? pl.x : 0);
    const fy = prev ? prev.fy : (typeof pl.y === "number" ? pl.y : 0);
    TEMPLE_MP.players.set(id, Object.assign({}, pl, {
      tx: pl.x, ty: pl.y, fx, fy, moveAt: moved ? now : (prev && prev.moveAt) || now,
      seenAt: now, misses: 0,
    }));
  }
  for (const [id, pl] of TEMPLE_MP.players) {
    if (seen.has(id)) continue;
    pl.misses = (pl.misses || 0) + 1;
    if (pl.misses >= TEMPLE_MP_MISS_LIMIT) TEMPLE_MP.players.delete(id);
  }
}

/* Posição suavizada para o frame atual (interpola o passo remoto). */
function templeMpLerp(pl, now) {
  const t = pl && pl.moveAt ? Math.min(1, Math.max(0, (now - pl.moveAt) / TEMPLE_MP_LERP_MS)) : 1;
  const x = (pl.fx + (pl.tx - pl.fx) * t) || 0;
  const y = (pl.fy + (pl.ty - pl.fy) * t) || 0;
  return { x, y, moving: t < 1 ? true : !!pl.moving };
}

function templeMpCharId() {
  // Prioridade = personagem ativo da sessão online (só é gravado numa
  // entrada bem-sucedida); fallback = personagem carregado (G.p). Em
  // auto-resume/troca bloqueada a sessão pode estar vazia E o G.p ser um
  // save legado — nesse caso o servidor resolve pela conta (temple.js).
  if (typeof sessionCharId === "function") {
    const s = sessionCharId();
    if (s && String(s) !== "") return s;
  }
  const gid = typeof G !== "undefined" && G && G.p && G.p.id;
  if (gid !== undefined && gid !== null && String(gid) !== "") return gid;
  return "";
}

/* char_id validado contra a conta logada. Contra o servidor NOVO o id é
 * só uma dica (ele resolve pela conta); mas contra um servidor ANTIGO
 * (deploy desatualizado na VM) um id fora da conta gera 403 "Personagem
 * inválido". Aqui, se o cache de personagens da conta existir, garantimos
 * um id que pertence a ela — mesmo quando o personagem carregado é um
 * save legado que não existe mais no banco. */
function templeMpCharIdSafe() {
  const raw = templeMpCharId();
  let chars = null;
  if (typeof accountCharacterCacheRead === "function") {
    try { chars = accountCharacterCacheRead(); } catch (e) { chars = []; }
  }
  if (!Array.isArray(chars) || !chars.length) return raw; // sem cache: servidor resolve
  if (raw && chars.some((c) => String(c && c.id) === String(raw))) return String(raw);
  // id fora da conta (save legado): usa personagem válido da conta, com a
  // mesma preferência do servidor novo (zona cidade > primeiro).
  const city = chars.find((c) => String((c && c.zone) || "").toLowerCase() === "city");
  const fallback = city || chars[0];
  return fallback && fallback.id != null ? String(fallback.id) : raw;
}

async function templeMpHeartbeat(force) {
  if (!templeMpInTemple()) return;
  const now = Date.now();
  const sig = templeMpSignature();
  const keepalive = now - TEMPLE_MP.lastHbAt >= TEMPLE_MP_KEEPALIVE_MS;
  if (!force && !keepalive && sig === TEMPLE_MP.lastSig) return; // parado
  if (!force && now - TEMPLE_MP.lastHbAt < TEMPLE_MP_HB_MS) return;
  // Sem token de sessão ou personagem, não bate no servidor (evita 401/403).
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (!force && String(token) === "") return;
  const cid = templeMpCharIdSafe();
  if (String(cid) === "" && !force) return;
  // Erro de auth/personagem recente: espera antes de tentar de novo
  // (o navegador logaria cada 403; com o backoff fica 1 por 30s no máximo).
  if (!force && TEMPLE_MP.errorBackoffUntil > now) return;
  if (String(cid) !== String(TEMPLE_MP.errorCharId)) {
    TEMPLE_MP.errorBackoffUntil = 0;
    TEMPLE_MP.errorCharId = String(cid);
  }
  TEMPLE_MP.lastHbAt = now;
  TEMPLE_MP.lastSig = sig;
  const t = templeMpTile();
  const r = await templeMpApi("POST", "/api/temple/presence", {
    char_id: cid,
    x: t.x, y: t.y, dir: G.walker.dir || "s", moving: !!G.walker.moving,
  });
  if (r && r.ok && Array.isArray(r.players)) {
    TEMPLE_MP.errorBackoffUntil = 0;
    templeMpApply(r.players);
  } else if (r && !r.ok) {
    TEMPLE_MP.errorBackoffUntil = now + TEMPLE_MP_ERROR_BACKOFF_MS;
    if (!TEMPLE_MP.errorLogged) {
      TEMPLE_MP.errorLogged = true;
      console.warn("[temple-mp] presença recusada:", r.msg || r.error || r.code, "— nova tentativa em", Math.round(TEMPLE_MP_ERROR_BACKOFF_MS / 1000) + "s");
    }
  }
}

/* Loop 1x/s: heartbeat quando está no templo, /leave quando saiu, prune. */
function templeMpTick() {
  if (typeof G === "undefined" || !G) return;
  if (templeMpInTemple()) {
    if (!TEMPLE_MP.inTemple) {
      TEMPLE_MP.inTemple = true;
      TEMPLE_MP.lastSig = "";
      TEMPLE_MP.errorLogged = false;
    }
    templeMpHeartbeat().catch(() => {});
  } else if (TEMPLE_MP.inTemple) {
    TEMPLE_MP.inTemple = false;
    TEMPLE_MP.players.clear();
    templeMpApi("POST", "/api/temple/leave", {}).catch(() => {});
  }
  const now = Date.now();
  for (const [id, pl] of TEMPLE_MP.players)
    if (now - pl.seenAt > TEMPLE_MP_STALE_MS) TEMPLE_MP.players.delete(id);
}

/* -------- menu de interação ao clicar em outro jogador -------- */
function templeMpCloseMenu() {
  const menu = TEMPLE_MP.menu;
  if (!menu) return;
  document.removeEventListener("click", templeMpCloseMenu, true);
  document.removeEventListener("keydown", templeMpMenuKey, true);
  if (menu.el && menu.el.parentNode) menu.el.parentNode.removeChild(menu.el);
  TEMPLE_MP.menu = null;
}

function templeMpMenuKey(ev) {
  if (ev && ev.key === "Escape") templeMpCloseMenu();
}

function templeMpPrivateMessage(name) {
  const chat = document.getElementById("global-chat");
  const input = document.getElementById("global-chat-input");
  if (input) {
    if (chat && chat.classList.contains("collapsed")) {
      chat.classList.remove("collapsed");
      const toggle = document.getElementById("global-chat-toggle");
      if (toggle) toggle.textContent = "▾";
    }
    input.value = "/pm " + name + " ";
    input.focus();
  }
}

function templeMpOpenMenu(pid, clientX, clientY) {
  const rp = TEMPLE_MP.players.get(String(pid));
  if (!rp) return;
  templeMpCloseMenu();
  const el = document.createElement("div");
  el.className = "temple-player-menu";
  el.id = "temple-player-menu";
  const mega = typeof MEGA_LOBBY_UI !== "undefined" && MEGA_LOBBY_UI &&
    MEGA_LOBBY_UI.lobby && MEGA_LOBBY_UI.lobby.status === "open" &&
    MEGA_LOBBY_UI.lobby.youAreLeader;
  const pale = typeof PALE_LOBBY_UI !== "undefined" && PALE_LOBBY_UI &&
    PALE_LOBBY_UI.lobby && PALE_LOBBY_UI.lobby.status === "open" &&
    PALE_LOBBY_UI.lobby.youAreLeader;
  let html = `<div class="temple-player-menu-head">${templeMpEscape(rp.name)}
    <span class="temple-player-menu-meta">${templeMpEscape(templeMpVocName(rp.voc))} ${templeMpEscape(rp.level)}</span></div>`;
  if (mega) html += `<button type="button" class="temple-player-menu-item" id="temple-menu-invite-mega">Convidar para o lobby (Megalomania)</button>`;
  if (pale) html += `<button type="button" class="temple-player-menu-item" id="temple-menu-invite-pale">Convidar para o lobby (Pale Worm)</button>`;
  html += `<button type="button" class="temple-player-menu-item" id="temple-menu-pm">Mensagem private</button>
    <button type="button" class="temple-player-menu-item" id="temple-menu-close">Fechar</button>`;
  el.innerHTML = html;
  document.body.appendChild(el);
  const bw = el.offsetWidth || 180, bh = el.offsetHeight || 120;
  el.style.left = Math.max(4, Math.min((window.innerWidth || 800) - bw - 4, clientX)) + "px";
  el.style.top = Math.max(4, Math.min((window.innerHeight || 600) - bh - 4, clientY)) + "px";
  TEMPLE_MP.menu = { el, name: rp.name };
  const inviteMega = document.getElementById("temple-menu-invite-mega");
  if (inviteMega) inviteMega.addEventListener("click", () => {
    templeMpCloseMenu();
    if (typeof megaLobbyInvite === "function") megaLobbyInvite(TEMPLE_MP.menuName());
    else if (typeof toast === "function") toast("Convite Megalomania indisponível. Recarregue a página.", "bad");
  });
  const invitePale = document.getElementById("temple-menu-invite-pale");
  if (invitePale) invitePale.addEventListener("click", () => {
    templeMpCloseMenu();
    if (typeof paleLobbyInvite === "function") paleLobbyInvite(TEMPLE_MP.menuName());
    else if (typeof toast === "function") toast("Convite Pale Worm indisponível. Recarregue a página.", "bad");
  });
  const pm = document.getElementById("temple-menu-pm");
  if (pm) pm.addEventListener("click", () => {
    const name = TEMPLE_MP.menuName();
    templeMpCloseMenu();
    templeMpPrivateMessage(name);
  });
  const close = document.getElementById("temple-menu-close");
  if (close) close.addEventListener("click", () => templeMpCloseMenu());
  // Fecha ao clicar fora (capture, após o clique atual terminar).
  setTimeout(() => {
    document.addEventListener("click", templeMpCloseMenu, true);
    document.addEventListener("keydown", templeMpMenuKey, true);
  }, 0);
}

TEMPLE_MP.menuName = function () {
  return TEMPLE_MP.menu ? TEMPLE_MP.menu.name : "";
};

/* -------- boot -------- */
(function templeMpBoot() {
  if (typeof window === "undefined") return;
  window.addEventListener("tibia-idle-sync-temple", (ev) => {
    const d = (ev && ev.detail) || {};
    if (Array.isArray(d.players)) templeMpApply(d.players);
  });
  if (typeof G !== "undefined" && G) G.templePlayers = TEMPLE_MP.players;
  if (!TEMPLE_MP.timer)
    TEMPLE_MP.timer = setInterval(templeMpTick, 1000);
})();
