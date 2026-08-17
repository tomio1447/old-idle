/*
 * world-boss-ui.js — lobby JOIN/LEAVE, countdown overlay, shared instance enter.
 * Depende de account-client (API) e game.js (G, temple, helper).
 */
"use strict";

const WB_POLL_MS = 2500;
const WB_REVIVE_MS = 30000;
let WB = {
  state: null,
  poll: null,
  timerTick: null,
  overlay: null,
  chip: null,
  panel: null,
  combat: null,
  lastReportAt: 0,
  pendingDmg: 0,
  pendingHeal: 0,
  pendingTaken: 0,
  deadUntil: {},
  /** Minimizado só durante o evento atual (warzoneId + janela do lobby). */
  overlayMinimized: false,
  overlayMinKey: null,
  /** Fechado (Cancelar) — some overlay/chip até o próximo evento. */
  overlayDismissed: false,
  overlayDismissKey: null,
  /** Painel JOIN fechado sem sair do evento. */
  panelDismissed: false,
  panelDismissKey: null,
};

function wbT(key, fallback) {
  if (typeof t === "function") {
    const v = t(key);
    if (v && v !== key) return v;
  }
  return fallback;
}

function wbApiUrl() {
  if (typeof accountApiUrl === "function") return accountApiUrl();
  if (window.GLOBAL_IDLE_SERVER_CONFIG && window.GLOBAL_IDLE_SERVER_CONFIG.apiUrl)
    return window.GLOBAL_IDLE_SERVER_CONFIG.apiUrl;
  return window.location.origin;
}

async function wbFetch(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (token) headers.Authorization = "Bearer " + token;
  const opts = { method, headers, cache: "no-store" };
  if (body) opts.body = JSON.stringify(Object.assign({ token }, body));
  const r = await fetch(wbApiUrl() + path, opts);
  let data = null;
  try { data = await r.json(); } catch (e) { data = {}; }
  return { status: r.status, data: data || {} };
}

function wbEnsureDom() {
  if (WB.panel) return;
  const host = document.getElementById("world-boss-box") || document.getElementById("mission-box")?.parentElement;
  const panel = document.createElement("div");
  panel.id = "world-boss-box";
  panel.className = "world-boss-box";
  panel.style.display = "none";
  if (host && host.id === "world-boss-box") {
    WB.panel = host;
  } else if (host) {
    host.appendChild(panel);
    WB.panel = panel;
  } else {
    document.body.appendChild(panel);
    WB.panel = panel;
  }

  const overlay = document.createElement("div");
  overlay.id = "world-boss-overlay";
  overlay.className = "world-boss-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="world-boss-overlay-card" role="dialog" aria-labelledby="world-boss-overlay-msg">
      <div class="world-boss-overlay-head">
        <span class="world-boss-overlay-title">${wbT("wb.warnTitle", "WORLD BOSS")}</span>
        <button type="button" class="world-boss-overlay-min" id="wb-overlay-min"
          title="${wbT("wb.minimize", "Minimizar")}" aria-label="${wbT("wb.minimize", "Minimizar")}">&minus;</button>
        <button type="button" class="world-boss-overlay-close" id="wb-overlay-close"
          title="${wbT("wb.cancel", "Cancelar")}" aria-label="${wbT("wb.cancel", "Cancelar")}">&times;</button>
      </div>
      <div class="world-boss-overlay-msg" id="world-boss-overlay-msg"></div>
      <div class="world-boss-overlay-actions">
        <button type="button" class="sm" id="wb-overlay-cancel">${wbT("wb.cancel", "Cancelar")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  WB.overlay = overlay;

  const chip = document.createElement("button");
  chip.type = "button";
  chip.id = "world-boss-overlay-chip";
  chip.className = "world-boss-overlay-chip";
  chip.style.display = "none";
  chip.title = wbT("wb.restore", "Restaurar aviso do World Boss");
  document.body.appendChild(chip);
  WB.chip = chip;

  const minBtn = document.getElementById("wb-overlay-min");
  if (minBtn) minBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); wbMinimizeOverlay(); };
  const closeBtn = document.getElementById("wb-overlay-close");
  if (closeBtn) closeBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); wbDismissOverlay(); };
  const cancelBtn = document.getElementById("wb-overlay-cancel");
  if (cancelBtn) cancelBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); wbDismissOverlay(); };
  chip.onclick = (e) => { e.preventDefault(); e.stopPropagation(); wbRestoreOverlay(); };
}

function wbOverlayEventKey(ev) {
  if (!ev) return null;
  /* Uma chave por evento/warzone — persiste lobby→countdown→spawn. */
  return String(ev.warzoneId || ev.bossName || "wb");
}

function wbSyncMinimizeKey(ev) {
  const key = wbOverlayEventKey(ev);
  if (!key) {
    WB.overlayMinimized = false;
    WB.overlayMinKey = null;
    WB.overlayDismissed = false;
    WB.overlayDismissKey = null;
    WB.panelDismissed = false;
    WB.panelDismissKey = null;
    return;
  }
  if (WB.overlayMinKey !== key) {
    WB.overlayMinKey = key;
    WB.overlayMinimized = false;
  }
  if (WB.overlayDismissKey !== key) {
    WB.overlayDismissKey = key;
    WB.overlayDismissed = false;
  }
  if (WB.panelDismissKey !== key) {
    WB.panelDismissKey = key;
    WB.panelDismissed = false;
  }
}

function wbMinimizeOverlay() {
  const st = WB.state;
  const ev = st && st.event;
  wbSyncMinimizeKey(ev);
  if (!ev) return;
  WB.overlayMinimized = true;
  WB.overlayDismissed = false;
  wbRenderOverlay();
}

function wbDismissOverlay() {
  const st = WB.state;
  const ev = st && st.event;
  wbSyncMinimizeKey(ev);
  if (!ev) return;
  WB.overlayDismissed = true;
  WB.overlayMinimized = false;
  wbHideOverlayUi();
}

function wbDismissPanel() {
  const st = WB.state;
  const ev = st && st.event;
  wbSyncMinimizeKey(ev);
  if (!ev) return;
  WB.panelDismissed = true;
  if (WB.panel) WB.panel.style.display = "none";
}

function wbRestoreOverlay() {
  WB.overlayMinimized = false;
  WB.overlayDismissed = false;
  wbRenderOverlay();
}

function wbHideOverlayUi() {
  if (WB.overlay) WB.overlay.style.display = "none";
  if (WB.chip) WB.chip.style.display = "none";
}

function wbShowOverlayExpanded(msg) {
  wbHideOverlayUi();
  if (!WB.overlay) return;
  const msgEl = document.getElementById("world-boss-overlay-msg");
  if (msgEl) msgEl.textContent = msg;
  WB.overlay.style.display = "flex";
}

function wbShowOverlayChip(msg) {
  wbHideOverlayUi();
  if (!WB.chip) return;
  const short = String(msg || "").replace(/\s+/g, " ").trim();
  WB.chip.textContent = short.length > 64 ? short.slice(0, 61) + "…" : short;
  WB.chip.style.display = "block";
}

function wbVocLabel(v) {
  const map = { knight: "EK", paladin: "RP", sorcerer: "MS", druid: "ED", monk: "EM", other: "?" };
  return map[v] || v;
}

function wbWarzoneNumber(ev) {
  if (ev && ev.warzoneNumber != null && Number(ev.warzoneNumber) > 0) return String(ev.warzoneNumber);
  const n = String((ev && ev.warzoneId) || "").replace(/^wz/i, "");
  return n || "?";
}

function wbWarzoneTitle(ev) {
  return wbT("wb.open", "WARZONE {n} OPEN — JOIN").replace(/\{n\}/gi, wbWarzoneNumber(ev));
}

function wbBossSpriteSlug(ev) {
  return (ev && (ev.bossSprite || ev.baseMonster)) || "dragon";
}

function wbBossSpriteHtml(ev, size) {
  const slug = wbBossSpriteSlug(ev);
  const px = size || 48;
  if (typeof bossMobImg === "function") return bossMobImg(slug, px);
  if (typeof mobImg === "function") return mobImg(slug, px, "", { walkAnim: true });
  const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
  return `<img class="world-boss-sprite-img" src="assets/mob/${slug}.png?v=${v}" alt="" width="${px}" height="${px}" style="image-rendering:pixelated;object-fit:contain">`;
}

const WB_MAX_PER_ACCOUNT = 2;

function wbEnsurePanelShell() {
  wbEnsureDom();
  if (!WB.panel) return;
  if (WB.panel.querySelector(".world-boss-head") && WB.panel.querySelector("#wb-boss-sprite")) return;
  WB.panel.innerHTML = `
    <div class="world-boss-head" id="wb-head">
      <div class="world-boss-sprite" id="wb-boss-sprite" aria-hidden="true"></div>
      <div class="world-boss-head-text" id="wb-head-text"></div>
    </div>
    <div class="world-boss-body">
      <div id="wb-lobby-line"><b id="wb-wz-name"></b> — <span id="wb-boss-name"></span> · <span id="wb-counts"></span></div>
      <div class="dim" id="wb-voc-line"></div>
      <div class="dim" id="wb-timer-line"></div>
      <div class="ok" id="wb-joined-line" style="display:none"></div>
      <div class="world-boss-actions">
        <button type="button" class="sm primary" id="wb-join-btn" style="display:none">${wbT("wb.join", "JOIN")}</button>
        <button type="button" class="sm" id="wb-leave-btn" style="display:none">${wbT("wb.leave", "LEAVE")}</button>
        <button type="button" class="sm" id="wb-close-btn">${wbT("wb.cancel", "Cancelar")}</button>
      </div>
      <div id="wb-join-picker" class="world-boss-picker" style="display:none"></div>
      <div class="tiny dim" id="wb-status"></div>
    </div>`;
  const joinBtn = document.getElementById("wb-join-btn");
  if (joinBtn) joinBtn.onclick = () => wbShowJoinPicker();
  const leaveBtn = document.getElementById("wb-leave-btn");
  if (leaveBtn) leaveBtn.onclick = () => wbLeave();
  const closeBtn = document.getElementById("wb-close-btn");
  if (closeBtn) closeBtn.onclick = () => wbDismissPanel();
}

function wbRenderPanel() {
  wbEnsurePanelShell();
  const st = WB.state;
  const ev = st && st.event;
  if (!ev || (ev.phase !== "lobby" && ev.phase !== "countdown")) {
    WB.panelDismissed = false;
    WB.panelDismissKey = null;
    if (WB.panel) WB.panel.style.display = "none";
    return;
  }
  wbSyncMinimizeKey(ev);
  if (WB.panelDismissed) {
    if (WB.panel) WB.panel.style.display = "none";
    return;
  }
  const you = st.you;
  const joined = !!(you && you.joined);
  const voc = ev.vocations || {};
  const vocLine = ["knight", "paladin", "sorcerer", "druid", "monk"]
    .map((k) => (voc[k] ? wbVocLabel(k) + " " + voc[k] : null))
    .filter(Boolean).join(" · ") || "—";
  const endsAt = ev.phase === "lobby" ? ev.lobbyEndsAt : ev.countdownEndsAt;
  const leftSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const title = ev.phase === "lobby"
    ? wbWarzoneTitle(ev)
    : wbT("wb.countdownTitle", "WORLD BOSS — COUNTDOWN");

  WB.panel.style.display = "block";

  const headText = document.getElementById("wb-head-text");
  const spriteEl = document.getElementById("wb-boss-sprite");
  const wzName = document.getElementById("wb-wz-name");
  const bossNameEl = document.getElementById("wb-boss-name");
  const counts = document.getElementById("wb-counts");
  const vocEl = document.getElementById("wb-voc-line");
  const timerEl = document.getElementById("wb-timer-line");
  const joinedEl = document.getElementById("wb-joined-line");
  const joinBtn = document.getElementById("wb-join-btn");
  const leaveBtn = document.getElementById("wb-leave-btn");
  const picker = document.getElementById("wb-join-picker");

  if (headText) headText.textContent = title;
  if (spriteEl) {
    const slug = wbBossSpriteSlug(ev);
    if (spriteEl.dataset.slug !== slug) {
      spriteEl.dataset.slug = slug;
      spriteEl.innerHTML = wbBossSpriteHtml(ev, 48);
    }
  }
  if (wzName) wzName.textContent = ev.warzoneName || ("Warzone " + wbWarzoneNumber(ev));
  if (bossNameEl) bossNameEl.textContent = ev.bossName || "";
  if (counts) counts.textContent = (ev.charCount || 0) + "/" + (ev.maxChars || 30);
  if (vocEl) vocEl.textContent = wbT("wb.vocations", "Vocações") + ": " + vocLine;
  if (timerEl) timerEl.textContent = wbT("wb.timer", "Tempo") + ": " + leftSec + "s";

  if (joinedEl) {
    if (joined) {
      joinedEl.style.display = "";
      joinedEl.textContent = wbT("wb.joined", "Você entrou") + ": "
        + ((you.chars || []).map((c) => c.name).join(", ") || "—");
    } else {
      joinedEl.style.display = "none";
      joinedEl.textContent = "";
    }
  }

  const showJoin = !joined && ev.phase === "lobby";
  const showLeave = joined && ev.phase === "lobby";
  if (joinBtn) joinBtn.style.display = showJoin ? "" : "none";
  if (leaveBtn) leaveBtn.style.display = showLeave ? "" : "none";
  if (picker && (!showJoin || joined)) {
    picker.style.display = "none";
    picker.innerHTML = "";
  }
}

/* Online: mesma fonte do party modal (cache /api/me). Offline: roster local. */
function wbAccountChars() {
  const online = typeof accountApiConfigured === "function" && accountApiConfigured()
    && typeof sessionToken === "function" && !!sessionToken()
    && typeof accountCharacterCacheRead === "function";
  if (online) {
    const cache = accountCharacterCacheRead() || [];
    if (cache.length) return cache;
    return G && G.p ? [G.p] : [];
  }
  if (typeof getCharacters === "function") return getCharacters() || [];
  return G && G.p ? [G.p] : [];
}

function wbSyncJoinPickerLimit(box) {
  if (!box) return;
  const checks = Array.from(box.querySelectorAll('input[type="checkbox"]'));
  const selected = checks.filter((el) => el.checked);
  const atMax = selected.length >= WB_MAX_PER_ACCOUNT;
  for (const el of checks) {
    if (!el.checked) el.disabled = atMax;
  }
  const hint = document.getElementById("wb-pick-hint");
  if (hint) {
    hint.textContent = wbT("wb.pickLimit", "Máx. {n} personagens").replace(/\{n\}/gi, String(WB_MAX_PER_ACCOUNT))
      + " (" + selected.length + "/" + WB_MAX_PER_ACCOUNT + ")";
  }
}

function wbShowJoinPicker() {
  const box = document.getElementById("wb-join-picker");
  const status = document.getElementById("wb-status");
  if (!box) return;
  const chars = wbAccountChars();
  if (!chars.length) {
    if (status) status.textContent = wbT("wb.noChars", "Nenhum personagem na conta.");
    return;
  }
  box.style.display = "block";
  box.innerHTML = `<div class="tiny dim" id="wb-pick-hint"></div>`
    + chars.slice(0, 12).map((c) => {
      const id = c.id || c.charId;
      const name = c.name || "?";
      const voc = c.voc || "";
      return `<label class="world-boss-pick"><input type="checkbox" value="${id}"> ${name} <span class="dim">(${voc})</span></label>`;
    }).join("")
    + `<button type="button" class="sm primary full mt4" id="wb-join-confirm">${wbT("wb.confirmJoin", "Confirmar JOIN")}</button>`;
  for (const el of box.querySelectorAll('input[type="checkbox"]')) {
    el.addEventListener("change", () => {
      const checked = box.querySelectorAll('input[type="checkbox"]:checked');
      if (checked.length > WB_MAX_PER_ACCOUNT) {
        el.checked = false;
      }
      wbSyncJoinPickerLimit(box);
    });
  }
  wbSyncJoinPickerLimit(box);
  const conf = document.getElementById("wb-join-confirm");
  if (conf) conf.onclick = () => {
    const ids = Array.from(box.querySelectorAll('input[type="checkbox"]:checked'))
      .map((el) => Number(el.value)).filter((n) => n > 0);
    if (ids.length > WB_MAX_PER_ACCOUNT) {
      if (status) status.textContent = wbT("wb.pickChars", "Selecione até 2 personagens.");
      return;
    }
    wbJoin(ids);
  };
}

async function wbJoin(ids) {
  const status = document.getElementById("wb-status");
  if (!ids || !ids.length) {
    if (status) status.textContent = wbT("wb.pickChars", "Selecione até 2 personagens.");
    return;
  }
  if (ids.length > WB_MAX_PER_ACCOUNT) {
    if (status) status.textContent = wbT("wb.pickChars", "Selecione até 2 personagens.");
    return;
  }
  const r = await wbFetch("POST", "/api/world-boss/join", { characterIds: ids });
  if (!r.data.ok && r.status >= 400) {
    if (status) status.textContent = r.data.msg || r.data.error || "JOIN falhou";
    if (typeof toast === "function") toast(r.data.msg || "JOIN falhou", "bad");
    return;
  }
  WB.state = r.data;
  wbRenderPanel();
  wbRenderOverlay();
  if (typeof toast === "function") toast(wbT("wb.joinedToast", "Entrou no World Boss lobby"), "ok");
}

async function wbLeave() {
  const r = await wbFetch("POST", "/api/world-boss/leave", {});
  if (!r.data.ok && r.status >= 400) {
    if (typeof toast === "function") toast(r.data.msg || "LEAVE falhou", "bad");
    return;
  }
  WB.state = r.data;
  wbRenderPanel();
  wbRenderOverlay();
}

function wbRenderOverlay() {
  wbEnsureDom();
  const st = WB.state;
  const ev = st && st.event;
  const you = st && st.you;
  if (!ev || !you || !you.joined) {
    WB.overlayMinimized = false;
    WB.overlayMinKey = null;
    WB.overlayDismissed = false;
    WB.overlayDismissKey = null;
    wbHideOverlayUi();
    return;
  }
  wbSyncMinimizeKey(ev);
  if (WB.overlayDismissed) {
    wbHideOverlayUi();
    return;
  }

  if (ev.phase === "lobby") {
    const left = Math.max(0, Math.ceil(((ev.lobbyEndsAt || 0) - Date.now()) / 1000));
    const msg = (ev.message || wbWarzoneTitle(ev))
      + (left > 0 ? " (" + left + "s)" : "");
    if (WB.overlayMinimized) wbShowOverlayChip(msg);
    else wbShowOverlayExpanded(msg);
    return;
  }
  if (ev.phase === "countdown") {
    const left = Math.max(0, Math.ceil((ev.countdownEndsAt - Date.now()) / 1000));
    const msg = (ev.message || wbT("wb.prepMsg",
      "EM BREVE VOCÊ IRÁ PARTICIPAR DE UM WORLD BOSS, VERIFIQUE SEU HELPER E AJUSTE PARA A BATALHA!"))
      + " (" + left + "s)";
    if (WB.overlayMinimized) wbShowOverlayChip(msg);
    else wbShowOverlayExpanded(msg);
    return;
  }
  if (ev.phase === "combat") {
    const now = Date.now();
    if (ev.spawnAt && now < ev.spawnAt) {
      const left = Math.max(0, Math.ceil((ev.spawnAt - now) / 1000));
      const msg = wbT("wb.spawnSoon", "Boss spawna em") + " " + left + "s";
      if (WB.overlayMinimized) wbShowOverlayChip(msg);
      else wbShowOverlayExpanded(msg);
      return;
    }
    WB.overlayMinimized = false;
    WB.overlayMinKey = null;
    WB.overlayDismissed = false;
    WB.overlayDismissKey = null;
    wbHideOverlayUi();
    if (!WB.combat) wbEnterSharedCombat(ev);
    return;
  }
  WB.overlayMinimized = false;
  WB.overlayMinKey = null;
  WB.overlayDismissed = false;
  WB.overlayDismissKey = null;
  wbHideOverlayUi();
}

function wbFollowCharId(ev) {
  const fromYou = (WB.state && WB.state.you && WB.state.you.chars) || [];
  const fromEv = (ev && Array.isArray(ev.chars) ? ev.chars : []) || [];
  const chars = fromYou.length ? fromYou : fromEv;
  const cur = typeof sessionCharId === "function" ? Number(sessionCharId()) : 0;
  const match = chars.find((c) => Number(c.id) === cur);
  return Number((match || chars[0] || {}).id) || cur || 0;
}

/* Templo + fim da instância online ANTES da arena WB (evita fusão hunt↔boss). */
async function wbPrepTempleFromHunt() {
  try {
    if (G.training && typeof stopAcademy === "function") stopAcademy(false);
  } catch (e) { /* ignore */ }

  // Invalida callbacks OTBM da hunt anterior (ex.: Cobra Bastion).
  G.huntEntryToken = (G.huntEntryToken || 0) + 1;
  G.huntEntryPendingToken = null;
  G.huntMapReady = true;
  try {
    if (typeof clearCombatVisualOverlays === "function") clearCombatVisualOverlays(G.combat);
  } catch (e) { /* ignore */ }

  if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("world boss templo");
  if (G.p) {
    const m = typeof maxStats === "function" ? maxStats(G.p) : null;
    if (m) { G.p.hp = m.hp; G.p.mp = m.mp; }
    G.p.hunt = null;
    G.p.instanceMode = null;
  }

  G.combat = null;
  if (typeof ONLINE_AUTH_APPLIED_VERSION !== "undefined") {
    try { ONLINE_AUTH_APPLIED_VERSION = 0; ONLINE_AUTH_APPLIED_INSTANCE = ""; } catch (e) { /* ignore */ }
  }

  // Encerra lease de hunt/boss no servidor e ESPERA — senão o tick online
  // reaplica cobras em cima da arena WB.
  try {
    if (typeof accountEndInstance === "function" && typeof sessionToken === "function" && sessionToken()) {
      await accountEndInstance(sessionToken(), "world-boss-prep");
    } else if (typeof clearInstanceSession === "function") {
      clearInstanceSession("world-boss-prep");
    }
  } catch (e) {
    try { if (typeof clearInstanceSession === "function") clearInstanceSession("world-boss-prep"); } catch (e2) { /* ignore */ }
  }

  G.inCity = true;
  if (typeof resetGridSize === "function") resetGridSize();
  if (typeof resetTemplePlayerPosition === "function") resetTemplePlayerPosition();
  if (typeof partyReportZone === "function") {
    try { await Promise.resolve(partyReportZone({ zone: "city" })); } catch (e) { /* ignore */ }
  }
  if (typeof addLog === "function") {
    addLog("info", "World Boss: party no <b style='color:#ffe680'>Templo</b> — limpando hunt anterior.");
  }
  // Deixa follow/SSE de cidade assentar antes de montar a arena.
  await new Promise((r) => setTimeout(r, 300));
}

async function wbEnterSharedCombat(ev) {
  if (WB.combat || WB._entering) return;
  WB._entering = true;
  WB.combat = {
    active: true,
    warzoneId: ev && ev.warzoneId,
    bossName: ev && ev.bossName,
    startedAt: Date.now(),
    exiting: false,
    shared: true,
  };
  WB._lastBossHp = null;
  try {
    try {
      await wbPrepTempleFromHunt();
    } catch (e) {
      console.warn("[world-boss] prep templo falhou", e);
    }
    const charId = wbFollowCharId(ev);
    if (charId) {
      try {
        sessionStorage.setItem("tibia-idle-char", String(charId));
        if (typeof ACTIVE_CHARACTER_KEY !== "undefined")
          localStorage.setItem(ACTIVE_CHARACTER_KEY, String(charId));
        sessionStorage.setItem("tibia-idle-online-autoload", String(charId));
      } catch (e) { /* ignore */ }
    }
    const token = typeof sessionToken === "function" ? sessionToken() : "";
    let remote = null;
    for (let i = 0; i < 80; i++) {
      if (!token || typeof accountLoadInstance !== "function") break;
      remote = await accountLoadInstance(token);
      const inst = remote && remote.instance;
      const belongs = !!(inst && typeof instanceIncludesCharacter === "function" &&
        instanceIncludesCharacter(inst, charId || (G.p && G.p.id)));
      if (belongs) break;
      remote = null;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!remote || !remote.instance) {
      WB.combat = null;
      if (typeof toast === "function")
        toast(wbT("wb.timeout", "Timeout aguardando a instância do World Boss."), "bad");
      return;
    }
    const session = Object.assign({}, remote.instance, {
      activeCharacterId: String(charId || remote.instance.activeCharacterId || ""),
    });
    try {
      localStorage.setItem("tibia-idle-active-instance-v1", JSON.stringify(session));
    } catch (e) { /* ignore */ }
    if (typeof resumeIdleInstance === "function") await resumeIdleInstance(session);
    wbFetch("POST", "/api/world-boss/loaded", {}).catch(() => {});
    if (typeof toast === "function")
      toast(wbT("wb.entered", "Você entrou na arena do World Boss"), "death");
    if (typeof addLog === "function") {
      addLog("death", "World Boss: <b>" + ((ev && (ev.bossName || ev.warzoneId)) || "warzone") +
        "</b> (instância compartilhada)");
    }
    if (typeof renderAll === "function") renderAll();
  } finally {
    WB._entering = false;
  }
}

function wbExitCombat(reason) {
  if (WB.combat && WB.combat.exiting) return;
  if (WB.combat) WB.combat.exiting = true;
  const hadCombat = !!WB.combat;
  WB.combat = null;
  WB.pendingDmg = 0;
  WB.pendingHeal = 0;
  WB.pendingTaken = 0;
  WB._lastBossHp = null;
  try {
    if (G.combat && (G.combat.worldBoss || (G.combat.boss && G.combat.boss.worldBoss))) {
      G.combat = null;
      if (G.p) { G.p.hunt = null; G.p.instanceMode = null; }
      G.inCity = true;
      if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("world boss fim");
      if (typeof resetTemplePlayerPosition === "function") resetTemplePlayerPosition();
      if (typeof partyReportZone === "function") partyReportZone({ zone: "city" });
      if (typeof resetGridSize === "function") resetGridSize();
      if (typeof renderAll === "function") renderAll();
    } else if (G.combat && typeof stopHunt === "function") {
      stopHunt(true);
    } else if (typeof goToCity === "function") {
      goToCity();
    }
  } catch (e) { /* ignore */ }
  if (hadCombat && typeof toast === "function") {
    if (reason === "success") toast(wbT("wb.success", "World Boss derrotado! Recompensas no Reward Chest."), "ok");
    else if (reason === "fail") toast(wbT("wb.fail", "World Boss falhou."), "bad");
    else if (reason === "account-failed") toast(wbT("wb.accountFail", "Seus personagens morreram — removido do evento."), "bad");
  }
}

async function wbFlushReport() {
  if (!WB.combat || !WB.state || !WB.state.you || !WB.state.you.joined) return;
  // Estima dano pelo HP do boss local se o combate stub estiver ativo.
  try {
    if (G && G.combat && G.combat.boss && G.combat.boss.hp != null) {
      const hp = Math.max(0, Math.floor(Number(G.combat.boss.hp) || 0));
      if (WB._lastBossHp == null) WB._lastBossHp = hp;
      const delta = Math.max(0, WB._lastBossHp - hp);
      if (delta > 0) WB.pendingDmg += delta;
      WB._lastBossHp = hp;
      if (hp <= 0) WB.pendingDmg += 1; // garante kill report
    }
  } catch (e) { /* ignore */ }
  const dmg = WB.pendingDmg, heal = WB.pendingHeal, taken = WB.pendingTaken;
  if (!dmg && !heal && !taken) return;
  WB.pendingDmg = 0; WB.pendingHeal = 0; WB.pendingTaken = 0;
  const deadCharIds = [];
  if (G && G.p && (G.p.hp <= 0 || G.p.dead)) deadCharIds.push(Number(G.p.id) || 0);
  const r = await wbFetch("POST", "/api/world-boss/report", {
    damageDealt: dmg, heal, damageTaken: taken, deadCharIds: deadCharIds.filter(Boolean),
  });
  if (r.data && r.data.ok) WB.state = r.data;
}

function wbOnDamage(dealt, taken, heal) {
  if (!WB.combat) return;
  WB.pendingDmg += Math.max(0, Math.floor(Number(dealt) || 0));
  WB.pendingTaken += Math.max(0, Math.floor(Number(taken) || 0));
  WB.pendingHeal += Math.max(0, Math.floor(Number(heal) || 0));
}

async function wbRefresh() {
  try {
    const r = await wbFetch("GET", "/api/world-boss/state");
    if (r.data && (r.data.ok || r.data.phase)) {
      const prev = WB.state && WB.state.event && WB.state.event.phase;
      WB.state = r.data;
      const phase = r.data.event && r.data.event.phase;
      if (WB.combat && (!r.data.you || !r.data.you.joined || !phase || phase === "idle")) {
        const result = r.data.event && r.data.event.result;
        wbExitCombat(result && result.status === "success" ? "success" : "fail");
      }
      if (r.data.you && r.data.you.failed && WB.combat) wbExitCombat("account-failed");
      if (prev === "countdown" && phase === "combat") wbRenderOverlay();
    }
  } catch (e) { /* offline */ }
  wbRenderPanel();
  wbRenderOverlay();
  if (WB.combat) await wbFlushReport();
}

function wbOnSync(detail) {
  if (!detail) return;
  if (detail.action === "teleport") {
    wbRefresh();
    wbEnterSharedCombat(detail);
    return;
  }
  if (detail.action === "countdown") {
    wbRefresh();
    return;
  }
  if (detail.action === "success") { wbExitCombat("success"); wbRefresh(); return; }
  if (detail.action === "fail" || detail.action === "cancelled") { wbExitCombat("fail"); wbRefresh(); return; }
  if (detail.action === "account-failed") { wbExitCombat("account-failed"); wbRefresh(); return; }
  if (detail.action === "reward" && typeof toast === "function") {
    toast(wbT("wb.rewardToast", "World Boss: tokens no Reward Chest"), "ok");
  }
  wbRefresh();
}

function wbTickLocalTimers() {
  if (!WB.state || !WB.state.event) return;
  const ev = WB.state.event;
  if (ev.phase === "lobby" || ev.phase === "countdown") {
    const endsAt = ev.phase === "lobby" ? ev.lobbyEndsAt : ev.countdownEndsAt;
    const leftSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    const timerEl = document.getElementById("wb-timer-line");
    if (timerEl) timerEl.textContent = wbT("wb.timer", "Tempo") + ": " + leftSec + "s";
  }
  wbRenderOverlay();
}

function wbStart() {
  wbEnsureDom();
  if (WB.poll) return;
  wbRefresh();
  WB.poll = setInterval(wbRefresh, WB_POLL_MS);
  WB.timerTick = setInterval(wbTickLocalTimers, 1000);
  window.addEventListener("tibia-idle-sync-world-boss", (ev) => wbOnSync(ev.detail));
  // Hook leve: combate reporta dano se a UI existir
  window.worldBossReportDamage = wbOnDamage;
}

function wbStop() {
  if (WB.poll) clearInterval(WB.poll);
  WB.poll = null;
  if (WB.timerTick) clearInterval(WB.timerTick);
  WB.timerTick = null;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wbStart);
} else {
  wbStart();
}
