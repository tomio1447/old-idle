/* ============================================================
 * SOCIAL — friendlist por conta.
 * Botão no topbar abre modal com amigos ONLINE / OFFLINE (último
 * login relativo), busca por nome para adicionar e menu de ações:
 * PM, convidar para lobby (se eu liderar um aberto), entrar no
 * lobby aberto do amigo, mutar/desmutar (silencia no chat) e remover.
 * Autoridade: /api/social/* no servidor (acc.friends).
 * ============================================================ */
const SOCIAL_UI = {
  friends: [], myLobby: null, menu: null,
  pollTimer: null, searchTimer: null, open: false,
};
const SOCIAL_MUTED = new Set(); // nicknames minúsculos silenciados (chat filtra)

function isSocialMuted(name) {
  return SOCIAL_MUTED.has(String(name || "").toLowerCase());
}

async function socialApi(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (token) headers.Authorization = "Bearer " + token;
  const opts = { method, headers, cache: "no-store" };
  if (body) opts.body = JSON.stringify(Object.assign({ token }, body));
  const base = typeof accountApiUrl === "function" ? accountApiUrl() : window.location.origin;
  try {
    const r = await fetch(base + path, opts);
    let data = {};
    try { data = await r.json(); } catch (e) { data = {}; }
    return { status: r.status, data: data || {} };
  } catch (e) {
    return { status: 0, data: { ok: false, msg: "Sem conexão com o servidor." } };
  }
}

function socialEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function socialAgo(ts) {
  const t = typeof ts === "string" ? Date.parse(ts) : Number(ts || 0);
  if (!t) return "há muito tempo";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function socialRenderShell() {
  const body = $("#modal-body");
  if (!body) return;
  body.innerHTML = `
    <div class="panel-title">👥 SOCIAL
      <button class="sm" id="social-close" type="button">✕</button></div>
    <div class="panel-body social-body">
      <div class="social-search">
        <input id="social-search-input" type="text" maxlength="32"
               placeholder="Buscar personagem para adicionar..." autocomplete="off" />
        <div id="social-search-results" class="social-search-results" hidden></div>
      </div>
      <div class="social-lists" id="social-lists"></div>
      <div class="tiny dim social-foot">Atualiza a cada 10s enquanto aberto.</div>
    </div>`;
  $("#social-close").onclick = socialClose;
  const input = $("#social-search-input");
  input.addEventListener("input", () => {
    clearTimeout(SOCIAL_UI.searchTimer);
    const q = input.value.trim();
    if (q.length < 3) { socialHideSearchResults(); return; }
    SOCIAL_UI.searchTimer = setTimeout(() => socialSearch(q), 250);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); socialSearch(input.value.trim(), true); }
    ev.stopPropagation();
  });
  input.addEventListener("keyup", (ev) => ev.stopPropagation());
  input.addEventListener("blur", () => setTimeout(socialHideSearchResults, 200));
}

async function socialSearch(q, exact) {
  const r = await socialApi("POST", "/api/social/search", { query: q });
  if (!SOCIAL_UI.open) return;
  const box = document.getElementById("social-search-results");
  if (!box) return;
  if (!r.data || !r.data.ok) {
    box.innerHTML = `<div class="social-search-row dim">${socialEsc((r.data && r.data.msg) || "Busca falhou.")}</div>`;
    box.hidden = false;
    return;
  }
  const rows = r.data.results || [];
  if (!rows.length) {
    box.innerHTML = `<div class="social-search-row dim">Nenhum personagem encontrado.</div>`;
    box.hidden = false;
    return;
  }
  box.innerHTML = rows.map((c) => `
    <div class="social-search-row" data-char="${Number(c.charId)}" data-name="${socialEsc(c.name)}">
      <span class="social-row-name">${socialEsc(c.name)}</span>
      <span class="tiny dim">${socialEsc(c.voc)} · nv ${Number(c.level) || 1}</span>
      <button class="sm social-add-btn" type="button" ${c.isFriend ? "disabled" : ""}>
        ${c.isFriend ? "Amigo ✓" : "+ Amigo"}
      </button>
    </div>`).join("");
  box.hidden = false;
  box.querySelectorAll(".social-add-btn:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const row = ev.target.closest(".social-search-row");
      if (row) socialAddFriend(row.getAttribute("data-name"));
    });
  });
  if (exact) socialHideSearchResults();
}

function socialHideSearchResults() {
  const box = document.getElementById("social-search-results");
  if (box) box.hidden = true;
}

async function socialAddFriend(name) {
  const r = await socialApi("POST", "/api/social/friend/add", { name });
  if (!r.data || !r.data.ok) {
    if (typeof toast === "function") toast((r.data && r.data.msg) || "Não foi possível adicionar.", "bad");
    return;
  }
  const input = document.getElementById("social-search-input");
  if (input) input.value = "";
  socialHideSearchResults();
  if (typeof toast === "function") toast(`${name} adicionado aos amigos.`, "level");
  socialRefresh();
}

async function socialRefresh() {
  const r = await socialApi("POST", "/api/social/friends", {});
  if (!SOCIAL_UI.open) return;
  if (!r.data || !r.data.ok) {
    if (r.status === 401 && typeof toast === "function") toast("Sessão expirada.", "bad");
    return;
  }
  SOCIAL_UI.friends = r.data.friends || [];
  SOCIAL_UI.myLobby = r.data.myLobby || null;
  SOCIAL_MUTED.clear();
  for (const f of SOCIAL_UI.friends) if (f.muted) SOCIAL_MUTED.add(String(f.name).toLowerCase());
  if (typeof window.chatApplyMuteFilter === "function") window.chatApplyMuteFilter();
  socialRenderLists();
}

function socialRenderLists() {
  const root = document.getElementById("social-lists");
  if (!root) return;
  const online = SOCIAL_UI.friends.filter((f) => f.online);
  const offline = SOCIAL_UI.friends.filter((f) => !f.online);
  const rowHtml = (f) => {
    const tags = [];
    if (f.inInstance) tags.push(`<span class="social-tag social-tag-hunt">em caçada</span>`);
    if (f.lobby) tags.push(`<span class="social-tag social-tag-lobby">lobby ${socialEsc(f.lobby)}</span>`);
    if (f.muted) tags.push(`<span class="social-tag social-tag-muted">mutado</span>`);
    const sub = f.online
      ? `${socialEsc(f.voc)} · nv ${Number(f.level) || 1}`
      : `${socialEsc(f.voc)} · nv ${Number(f.level) || 1} · ${socialAgo(f.lastSeen)}`;
    return `
      <div class="social-row" data-char="${Number(f.charId)}">
        <span class="social-dot ${f.online ? "on" : "off"}"></span>
        <span class="social-row-main">
          <span class="social-row-name">${socialEsc(f.name)}</span>
          <span class="tiny dim">${sub}</span>
        </span>
        ${tags.join("")}
      </div>`;
  };
  const section = (title, cls, rows, emptyTxt) => `
    <div class="social-section">
      <div class="social-section-head ${cls}">${title} <span class="tiny dim">(${rows.length})</span></div>
      ${rows.length ? rows.map(rowHtml).join("") : `<div class="social-empty tiny dim">${emptyTxt}</div>`}
    </div>`;
  root.innerHTML =
    section("ONLINE", "social-head-on", online, "Nenhum amigo online.") +
    section("OFFLINE", "social-head-off", offline, "Nenhum amigo offline.") +
    (SOCIAL_UI.friends.length ? "" :
      `<div class="social-empty tiny dim">Sua lista está vazia — busque um personagem acima.</div>`);
  root.querySelectorAll(".social-row").forEach((row) => {
    row.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const f = SOCIAL_UI.friends.find((x) => Number(x.charId) === Number(row.getAttribute("data-char")));
      if (f) socialOpenMenu(f, ev.clientX, ev.clientY);
    });
  });
}

function socialCloseMenu() {
  if (SOCIAL_UI.menu) { SOCIAL_UI.menu.remove(); SOCIAL_UI.menu = null; }
}

function socialOpenMenu(f, x, y) {
  socialCloseMenu();
  const menu = document.createElement("div");
  menu.className = "social-menu";
  const items = [];
  items.push(`<button type="button" data-act="pm">💬 Mensagem privada</button>`);
  if (SOCIAL_UI.myLobby && SOCIAL_UI.myLobby.leader)
    items.push(`<button type="button" data-act="invite">⚔ Convidar para boss</button>`);
  if (f.lobby)
    items.push(`<button type="button" data-act="join">🚪 Entrar em lobby</button>`);
  items.push(`<button type="button" data-act="mute">${f.muted ? "🔊 Desmutar" : "🔇 Mutar"}</button>`);
  items.push(`<button type="button" data-act="remove" class="social-menu-danger">✖ Remover amigo</button>`);
  menu.innerHTML = items.join("");
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.min(x, window.innerWidth - mw - 8) + "px";
  menu.style.top = Math.min(y, window.innerHeight - mh - 8) + "px";
  SOCIAL_UI.menu = menu;
  const closeLater = (ev) => {
    if (!menu.contains(ev.target)) {
      socialCloseMenu();
      document.removeEventListener("click", closeLater, true);
    }
  };
  document.addEventListener("click", closeLater, true);
  menu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      socialCloseMenu();
      socialAction(act, f);
    });
  });
}

async function socialAction(act, f) {
  if (act === "pm") {
    const input = document.getElementById("global-chat-input");
    if (input) {
      input.value = `/pm ${f.name} `;
      input.focus();
    }
    if (typeof toast === "function") toast(`Escrevendo PM para ${f.name}...`, "");
    return;
  }
  if (act === "invite") {
    const r = await socialApi("POST", "/api/social/lobby-invite", { name: f.name });
    if (typeof toast === "function")
      toast(r.data && r.data.ok ? `Convite enviado para ${f.name}.`
        : ((r.data && r.data.msg) || "Falha ao convidar."),
        r.data && r.data.ok ? "level" : "bad");
    return;
  }
  if (act === "mute") {
    const r = await socialApi("POST", "/api/social/friend/mute", { friendCharId: f.charId, muted: !f.muted });
    if (r.data && r.data.ok) {
      if (typeof toast === "function") toast(r.data.muted ? `${f.name} mutado no chat.` : `${f.name} desmutado.`, "");
      socialRefresh();
    }
    return;
  }
  if (act === "remove") {
    const r = await socialApi("POST", "/api/social/friend/remove", { friendCharId: f.charId });
    if (r.data && r.data.ok) {
      if (typeof toast === "function") toast(`${f.name} removido dos amigos.`, "");
      socialRefresh();
    }
    return;
  }
  if (act === "join") socialJoinLobby(f);
}

/* Entrar no lobby aberto do amigo — mesmas checagens dos aceites dos
 * lobbies (templo + escolha do personagem). */
async function socialJoinLobby(f) {
  const isPale = f.lobby === "pale";
  const inTemple = isPale
    ? (typeof paleLobbyInTemple === "function" ? paleLobbyInTemple() : false)
    : (typeof megaTestBypass === "function" && megaTestBypass()) ||
      (typeof megaLobbyInTemple === "function" ? megaLobbyInTemple() : false);
  if (!inTemple) {
    if (typeof toast === "function") toast("Vá ao templo para entrar no lobby.", "bad");
    return;
  }
  const picker = isPale
    ? (typeof paleLobbyConfirmCharModal === "function" ? paleLobbyConfirmCharModal : null)
    : (typeof megaLobbyConfirmCharModal === "function" ? megaLobbyConfirmCharModal : null);
  if (!picker) {
    if (typeof toast === "function") toast("Módulo de lobby não carregado.", "bad");
    return;
  }
  const picked = await picker(
    typeof sessionCharId === "function" ? sessionCharId() : null,
    `Entrar no lobby de ${f.name}`);
  if (!picked) return;
  const r = await socialApi("POST", "/api/social/lobby-join", {
    charId: Number(picked.charId || picked.id),
    friendCharId: Number(f.charId),
    inTemple: true,
    playerName: picked.name,
  });
  if (!r.data || !r.data.ok) {
    if (typeof toast === "function") toast((r.data && r.data.msg) || "Não foi possível entrar no lobby.", "bad");
    return;
  }
  if (typeof toast === "function") toast(`Você entrou no lobby de ${f.name}!`, "level");
  socialClose();
}

function socialOpen() {
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (!token) {
    if (typeof toast === "function") toast("Social requer login online.", "bad");
    return;
  }
  socialRenderShell();
  SOCIAL_UI.open = true;
  $("#modal").classList.add("show");
  socialRefresh();
  clearInterval(SOCIAL_UI.pollTimer);
  SOCIAL_UI.pollTimer = setInterval(socialRefresh, 10000);
}

function socialClose() {
  SOCIAL_UI.open = false;
  clearInterval(SOCIAL_UI.pollTimer);
  SOCIAL_UI.pollTimer = null;
  socialCloseMenu();
  const modal = document.getElementById("modal");
  if (modal) modal.classList.remove("show");
}

/* O mute precisa valer mesmo sem abrir o modal: carrega a lista uma vez
 * no boot (se logado) só para preencher SOCIAL_MUTED. */
async function socialLoadMuted() {
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (!token) return;
  const r = await socialApi("POST", "/api/social/friends", {});
  if (!r.data || !r.data.ok || !Array.isArray(r.data.friends)) return;
  SOCIAL_MUTED.clear();
  for (const f of r.data.friends) if (f.muted) SOCIAL_MUTED.add(String(f.name).toLowerCase());
  if (typeof window.chatApplyMuteFilter === "function") window.chatApplyMuteFilter();
}

function socialInitButton() {
  const btn = document.getElementById("btn-social");
  if (btn && !btn._socialBound) {
    btn._socialBound = true;
    btn.addEventListener("click", socialOpen);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { socialInitButton(); socialLoadMuted(); });
} else {
  socialInitButton();
  socialLoadMuted();
}
// Login acontece na mesma página após o boot — recarrega o mute na 1ª vez
// que um personagem sincronizar.
let SOCIAL_MUTED_INIT = false;
window.addEventListener("tibia-idle-sync-character", () => {
  if (SOCIAL_MUTED_INIT) return;
  SOCIAL_MUTED_INIT = true;
  socialLoadMuted();
});
