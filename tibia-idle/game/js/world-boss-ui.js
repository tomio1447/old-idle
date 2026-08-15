/*
 * world-boss-ui.js — lobby JOIN/LEAVE, countdown overlay, combate stub.
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
  panel: null,
  combat: null,
  lastReportAt: 0,
  pendingDmg: 0,
  pendingHeal: 0,
  pendingTaken: 0,
  deadUntil: {},
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
  overlay.innerHTML = `<div class="world-boss-overlay-msg" id="world-boss-overlay-msg"></div>`;
  document.body.appendChild(overlay);
  WB.overlay = overlay;
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
  if (typeof mobImg === "function") return mobImg(slug, px);
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
      </div>
      <div id="wb-join-picker" class="world-boss-picker" style="display:none"></div>
      <div class="tiny dim" id="wb-status"></div>
    </div>`;
  const joinBtn = document.getElementById("wb-join-btn");
  if (joinBtn) joinBtn.onclick = () => wbShowJoinPicker();
  const leaveBtn = document.getElementById("wb-leave-btn");
  if (leaveBtn) leaveBtn.onclick = () => wbLeave();
}

function wbRenderPanel() {
  wbEnsurePanelShell();
  const st = WB.state;
  const ev = st && st.event;
  if (!ev || (ev.phase !== "lobby" && ev.phase !== "countdown")) {
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
  const msgEl = document.getElementById("world-boss-overlay-msg");
  if (!ev || !you || !you.joined) {
    WB.overlay.style.display = "none";
    return;
  }
  if (ev.phase === "countdown") {
    WB.overlay.style.display = "flex";
    const left = Math.max(0, Math.ceil((ev.countdownEndsAt - Date.now()) / 1000));
    msgEl.textContent = (ev.message || wbT("wb.prepMsg",
      "EM BREVE VOCÊ IRÁ PARTICIPAR DE UM WORLD BOSS, VERIFIQUE SEU HELPER E AJUSTE PARA A BATALHA!"))
      + " (" + left + "s)";
    return;
  }
  if (ev.phase === "combat") {
    const now = Date.now();
    if (ev.spawnAt && now < ev.spawnAt) {
      WB.overlay.style.display = "flex";
      const left = Math.max(0, Math.ceil((ev.spawnAt - now) / 1000));
      msgEl.textContent = wbT("wb.spawnSoon", "Boss spawna em") + " " + left + "s";
      return;
    }
    WB.overlay.style.display = "none";
    if (!WB.combat) wbEnterCombatStub(ev);
    return;
  }
  WB.overlay.style.display = "none";
}

function wbPlaceholderMap() {
  const w = 40, h = 40;
  const cells = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push({ ground: 100, items: [] });
    cells.push(row);
  }
  return {
    w, h, z: 7,
    name: "World Boss Arena (placeholder)",
    spawn: { x: 20, y: 28 },
    boss: { x: 20, y: 16 },
    cells,
  };
}

function wbEnterCombatStub(ev) {
  if (WB.combat) return;
  WB.combat = { active: true, warzoneId: ev.warzoneId, bossName: ev.bossName, startedAt: Date.now() };
  // Sai de hunt/boss atual (perde esse boss) e vai ao stub.
  try {
    if (G.training && typeof stopAcademy === "function") stopAcademy(false);
    if (G.combat && typeof stopHunt === "function") stopHunt(true);
  } catch (e) { /* ignore */ }

  const map = wbPlaceholderMap();
  const bossId = "world-boss-" + (ev.warzoneId || "wz1");
  const sprite = wbBossSpriteSlug(ev);
  if (!window.BOSS_DEFS) window.BOSS_DEFS = {};
  if (typeof BOSS_DEFS === "object") {
    BOSS_DEFS[bossId] = {
      id: bossId,
      name: ev.bossName || "World Boss",
      title: ev.warzoneName || ("Warzone " + wbWarzoneNumber(ev)),
      hunt: null,
      baseMonster: ev.baseMonster || sprite,
      sprite,
      mult: 50,
      requirement: null,
      cooldown: 0,
      loot: [],
      worldBoss: true,
      arena: map,
    };
  }

  // Full HP/MP nos chars da party local
  try {
    if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("world boss");
    else if (G.p) {
      const max = typeof maxStats === "function" ? maxStats(G.p) : null;
      if (max) { G.p.hp = max.hp; G.p.mp = max.mp; }
      else { G.p.hp = G.p.maxHp || G.p.hp; G.p.mp = G.p.maxMp || G.p.mp; }
    }
  } catch (e) { /* ignore */ }

  G.inCity = false;
  G.p.instanceMode = "world-boss";
  G.p.hunt = null;

  // Mapa placeholder: se startBoss existir e BOSS_DEFS ok, usa; senão combate mínimo.
  if (typeof startBoss === "function" && BOSS_DEFS[bossId]) {
    try {
      startBoss(bossId, true, true);
    } catch (e) {
      console.warn("[world-boss] startBoss stub falhou", e);
    }
  }

  wbFetch("POST", "/api/world-boss/loaded", {}).catch(() => {});
  if (typeof toast === "function") toast(wbT("wb.entered", "Você entrou na arena do World Boss"), "death");
  if (typeof addLog === "function") addLog("death", "World Boss: <b>" + (ev.bossName || bossId) + "</b>");
}

function wbExitCombat(reason) {
  WB.combat = null;
  WB.pendingDmg = 0;
  WB.pendingHeal = 0;
  WB.pendingTaken = 0;
  try {
    if (G.combat && typeof stopHunt === "function") stopHunt(true);
    if (typeof returnToTemple === "function") returnToTemple();
    else if (typeof goCity === "function") goCity();
  } catch (e) { /* ignore */ }
  if (typeof toast === "function") {
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
  if (detail.action === "teleport" || detail.action === "countdown") {
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
