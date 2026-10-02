/*
 * quest-ui.js — modal de quests, lobby e escolha de reward.
 *
 * Segue o padrão da forja / world boss. Modais usam #modal + #modal-body
 * com shell classes para estilo.
 */
"use strict";

let QUEST_MODAL_BUSY = false;
let QUEST_LOBBY_POLL = null;
let QUEST_ACTIVE_LOBBY = null; // { lobbyId, questId }

/* ---- helpers ---- */

function questApiUrl() {
  if (typeof accountApiUrl === "function") return accountApiUrl();
  if (window.GLOBAL_IDLE_SERVER_CONFIG && window.GLOBAL_IDLE_SERVER_CONFIG.apiUrl)
    return window.GLOBAL_IDLE_SERVER_CONFIG.apiUrl;
  return window.location.origin;
}

async function questFetch(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (token) headers.Authorization = "Bearer " + token;
  const opts = { method, headers, cache: "no-store" };
  if (body) opts.body = JSON.stringify(Object.assign({ token }, body));
  const r = await fetch(questApiUrl() + path, opts);
  let data = null;
  try { data = await r.json(); } catch (e) { data = {}; }
  return { status: r.status, data: data || {} };
}

function questToast(msg, type) {
  if (typeof toast === "function") toast(msg, type || "bad");
  else console.warn("[quest-ui]", msg);
}

function questSetBusy(busy) {
  QUEST_MODAL_BUSY = !!busy;
  $$("#modal-body .quest-action").forEach((btn) => { btn.disabled = !!busy; });
}

function questStopPoll() {
  if (QUEST_LOBBY_POLL) clearInterval(QUEST_LOBBY_POLL);
  QUEST_LOBBY_POLL = null;
}

function questActiveChar() {
  const active = window.G && window.G.p;
  return active && active.id ? Number(active.id) : null;
}

function questPrepareModal(shell) {
  const modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return null;
  body.classList.remove("hunts-modal-shell", "boss-modal-shell", "bosses-modal-shell",
    "reward-modal-shell", "npcs-modal-shell", "cidade-modal-shell", "ranking-modal-shell",
    "mega-lobby-char-shell", "world-boss-detail-shell", "quests-modal-shell", "quest-detail-shell",
    "quest-lobby-shell", "quest-reward-shell", "forge-modal-shell");
  body.classList.add(shell);
  modal.classList.add("show");
  return { modal, body };
}

function questVocShort(voc) {
  const v = String(voc || "").toLowerCase();
  if (v.includes("knight")) return "EK";
  if (v.includes("paladin")) return "RP";
  if (v.includes("sorcerer")) return "MS";
  if (v.includes("druid")) return "ED";
  if (v.includes("monk")) return "EM";
  return "?";
}

/* ---- reward images ---- */

function questRewardImg(slug, size) {
  if (typeof itemImg === "function") return itemImg(slug, size || 36);
  return "";
}

function questBossImg(slug, size) {
  const portrait = typeof bossMobImg === "function" ? bossMobImg : (typeof mobImg === "function" ? mobImg : null);
  return portrait ? portrait(slug, size || 48) : "";
}

function questOutfitImgSrc(base, sexo) {
  const s = sexo || ((window.G && window.G.p && window.G.p.sex === "female") ? "f" : "m");
  return "assets/appearance/outfit/" + base + "-" + s + ".base.png";
}

/* Outfit spritesheets: 3 cols x 4 rows. Row 2 = south. Col 1 = idle pose.
 * Renderiza via background-image + background-position para clipar 1 frame. */
function questOutfitFrameHtml(base, sexo, size) {
  const src = questOutfitImgSrc(base, sexo);
  const sz = size || 48;
  // Appearance data: cw/ch = frame size. Sheet = 3 cols x 4 rows.
  // South idle = col 1, row 2 → bgX = -1*cw, bgY = -2*ch
  // We scale: sheet is 3*cw wide, 4*ch tall → bgSize = 3*sz wide, 4*sz tall
  const bgW = sz * 3;
  const bgH = sz * 4;
  const bgX = -1 * sz;
  const bgY = -2 * sz;
  return `<div class="quest-outfit-frame" style="width:${sz}px;height:${sz}px;background:url('${src}') ${bgX}px ${bgY}px / ${bgW}px ${bgH}px no-repeat;image-rendering:pixelated" title="${base}-${sexo}"></div>`;
}

function questOutfitPreviewHtml(outfitReward, size) {
  if (!outfitReward || !outfitReward.base) return "";
  const sz = size || 48;
  const name = (outfitReward.base || "").replace(/-/g, " ");
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  const addonsLabel = outfitReward.addons === 3 ? "addon 1 + 2" : outfitReward.addons === 2 ? "addon 2" : outfitReward.addons === 1 ? "addon 1" : "";
  return `<div class="quest-outfit-preview">
    ${questOutfitFrameHtml(outfitReward.base, "m", sz)}
    ${questOutfitFrameHtml(outfitReward.base, "f", sz)}
    <div class="quest-outfit-info"><b>${capName} Outfit</b>${addonsLabel ? `<span class="tiny dim">${addonsLabel}</span>` : ""}</div>
  </div>`;
}

/* ---- Quest card (lista principal) ---- */

function questCard(q) {
  const rewardsHtml = (q.rewards || []).map((slug) =>
    `<div class="quest-reward-thumb" title="${slug.replace(/-/g, ' ')}">${questRewardImg(slug, 28)}</div>`
  ).join("");
  return `<div class="hunt-card hunt-modal-card hunt-canary-card quest-modal-card" data-quest="${q.id}">
    <button type="button" class="mobs quest-open" data-quest="${q.id}" title="Ver ${q.name}" aria-label="Ver ${q.name}">
      ${questBossImg(q.bossSprite || q.boss, 48)}
    </button>
    <span class="info"><span class="nm">${q.name}</span><span class="meta">Level ${q.level}+</span>
      <span class="tiny dim">Lobby: até ${q.maxPlayers} jogadores</span></span>
    <span class="quest-card-rewards">${rewardsHtml}</span>
  </div>`;
}

/* ---- Quest list modal ---- */

function openQuestsModal() {
  if (!G.p) return;
  questStopPoll();
  const ui = questPrepareModal("quests-modal-shell");
  if (!ui) return;
  const quests = typeof QUEST_DEFS !== "undefined" ? QUEST_DEFS : {};
  const cards = Object.values(quests).map(questCard).join("");
  ui.body.innerHTML = `<div class="panel-title quest-modal-title">
    <img src="assets/item/small-treasure-chest.png" width="20" height="20" style="vertical-align:middle;margin-right:6px" alt="">
    <span>QUESTS</span><button class="sm" id="quests-modal-close">Fechar</button></div>
    <div class="panel-body" id="quests-modal-list" style="display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:10px 14px;">
      ${cards || '<span class="dim">Nenhuma quest disponível.</span>'}</div>`;
  $("#quests-modal-close").onclick = () => {
    ui.modal.classList.remove("show");
    ui.body.classList.remove("quests-modal-shell");
  };
  $$("#quests-modal-list .quest-open").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      openQuestDetail(btn.dataset.quest);
    };
  });
}

/* ---- Quest detail modal ---- */

function questRewardDetailHtml(q) {
  return (q.rewards || []).map((slug) => {
    const it = typeof GAMEDATA !== "undefined" && GAMEDATA.items ? GAMEDATA.items[slug] : null;
    const name = it ? it.n : slug.replace(/-/g, " ");
    let stats = "";
    if (it) {
      const parts = [];
      if (it.arm) parts.push("Arm: " + it.arm);
      if (it.def) parts.push("Def: " + it.def);
      if (it.attack) parts.push("Atk: " + it.attack);
      if (it.level) parts.push("Lvl " + it.level + "+");
      stats = parts.join(" · ");
    }
    return `<div class="quest-reward-detail-card" data-slug="${slug}">
      ${questRewardImg(slug, 28)}
      <span class="quest-reward-name">${name}</span>
      ${stats ? `<span class="quest-reward-stats tiny dim">${stats}</span>` : ""}
    </div>`;
  }).join("");
}

function questMonsterListHtml(q) {
  const monsters = q.waveMonsters || [];
  return monsters.map((slug) => {
    const m = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters ? GAMEDATA.monsters[slug] : null;
    const name = m ? m.name : slug.replace(/-/g, " ");
    return `<div class="quest-monster-thumb" title="${name}">
      ${typeof mobImg === "function" ? mobImg(slug, 28) : ""}
      <span class="tiny">${name}</span></div>`;
  }).join("");
}

function openQuestDetail(questId) {
  questStopPoll();
  const q = typeof QUEST_DEFS !== "undefined" ? QUEST_DEFS[questId] : null;
  if (!q) return;
  const ui = questPrepareModal("quest-detail-shell");
  if (!ui) return;
  ui.body.innerHTML = `<div class="panel-title">${questBossImg(q.bossSprite || q.boss, 24)} ${q.name} — <span class="dim" style="font-weight:normal">Level ${q.level}+</span>
    <span style="flex:1"></span><button class="sm" id="quest-detail-close">✕</button></div>
    <div class="panel-body quest-detail-body">
      <div class="quest-detail-desc">${q.description || ""}</div>
      <div class="quest-detail-summary">
        <span>Lobby: <b style="color:#9ce84a">1–${q.maxPlayers} jogadores</b></span>
        <span>Conclusão: <b>1x por personagem</b></span>
        <span>Waves: <b>${q.baseWaves}+ (dinâmico)</b></span>
      </div>
      <div class="quest-detail-row">
        <section class="quest-detail-panel quest-boss-col">
          <div class="hunt-best-title">BOSS</div>
          <div class="quest-boss-preview">
            ${questBossImg(q.bossSprite || q.boss, 36)}
            <span>${(q.boss || "").replace(/-/g, " ")}</span>
          </div>
        </section>
        <section class="quest-detail-panel quest-monsters-col">
          <div class="hunt-best-title">WAVES</div>
          <div class="quest-monsters-list">${questMonsterListHtml(q)}</div>
        </section>
      </div>
      <section class="quest-detail-panel quest-rewards-section">
        <div class="hunt-best-title">REWARDS (escolha 1 item)</div>
        <div class="quest-rewards-grid">${questRewardDetailHtml(q)}</div>
      </section>
      ${q.outfitReward ? `<section class="quest-detail-panel quest-outfit-section">
        <div class="hunt-best-title">OUTFIT (desbloqueada automaticamente)</div>
        ${questOutfitPreviewHtml(q.outfitReward, 28)}
      </section>` : ""}
      <div class="quest-detail-actions">
        <button type="button" class="sm" id="quest-detail-back">← Voltar</button>
        <button type="button" class="sm primary quest-action" id="quest-detail-auto">AUTO JOIN</button>
        <button type="button" class="danger sm quest-action" id="quest-detail-create">CREATE LOBBY</button>
      </div>
    </div>`;
  // Bind item tooltips
  if (typeof bindFullItemTooltip === "function") {
    $$("#modal-body .quest-reward-detail-card").forEach((card) => {
      bindFullItemTooltip(card, card.dataset.slug);
    });
  }
  $("#quest-detail-close").onclick = () => {
    ui.modal.classList.remove("show");
    ui.body.classList.remove("quest-detail-shell");
  };
  $("#quest-detail-back").onclick = openQuestsModal;
  $("#quest-detail-auto").onclick = () => questAutoJoin(questId);
  $("#quest-detail-create").onclick = () => questCreateLobby(questId);
}

/* ---- Character picker (reuse megaLobbyConfirmCharModal) ---- */

async function questPickCharacter(questId, action) {
  const q = typeof QUEST_DEFS !== "undefined" ? QUEST_DEFS[questId] : null;
  if (!q) return null;
  if (typeof megaLobbyConfirmCharModal !== "function") {
    questToast("Seletor de personagens indisponível. Recarregue a página.");
    return null;
  }
  const selected = await megaLobbyConfirmCharModal(
    questActiveChar(),
    action + " — " + q.name,
    "Escolha um personagem (lvl " + q.level + "+). Cada personagem só pode completar a quest 1 vez."
  );
  if (!selected) openQuestDetail(questId);
  return selected;
}

/* ---- Create lobby ---- */

async function questCreateLobby(questId) {
  if (QUEST_MODAL_BUSY) return;
  const selected = await questPickCharacter(questId, "Criar lobby");
  if (!selected) return;
  questSetBusy(true);
  try {
    const r = await questFetch("POST", "/api/quest/create", {
      questId, characterIds: [selected.charId],
    });
    if (r.status !== 200 || !r.data || !r.data.ok) {
      openQuestDetail(questId);
      return questToast((r.data && r.data.msg) || "Não foi possível criar o lobby.");
    }
    QUEST_ACTIVE_LOBBY = { lobbyId: r.data.lobbyId, questId };
    openQuestLobby(r.data);
  } catch (e) {
    questToast("Falha de conexão ao criar o lobby.");
  } finally {
    questSetBusy(false);
  }
}

/* ---- Auto join ---- */

async function questAutoJoin(questId) {
  if (QUEST_MODAL_BUSY) return;
  const selected = await questPickCharacter(questId, "Entrar no lobby");
  if (!selected) return;
  questSetBusy(true);
  try {
    const r = await questFetch("POST", "/api/quest/auto-join", {
      questId, characterIds: [selected.charId],
    });
    if (r.status !== 200 || !r.data || !r.data.ok) {
      if (r.data && r.data.error === "NO_OPEN_LOBBY") {
        questToast("Nenhum lobby aberto. Crie um novo lobby.", "info");
        openQuestDetail(questId);
        return;
      }
      openQuestDetail(questId);
      return questToast((r.data && r.data.msg) || "Não foi possível entrar.");
    }
    QUEST_ACTIVE_LOBBY = { lobbyId: r.data.lobbyId, questId };
    openQuestLobby(r.data);
  } catch (e) {
    questToast("Falha de conexão.");
  } finally {
    questSetBusy(false);
  }
}

/* ---- Lobby side panel ---- */

let QUEST_LOBBY_COLLAPSED = false;

function questLobbySlot(participant, index) {
  if (!participant) return `<div class="mega-lobby-slot empty"><span class="mega-lobby-slot-n">#${index + 1}</span><span class="dim">Vaga livre</span></div>`;
  return `<div class="mega-lobby-slot ${participant.host ? "leader" : ""}"><span class="mega-lobby-slot-n">${participant.host ? "LÍDER" : "#" + (index + 1)}</span>
    <div class="mega-lobby-slot-body"><b>${participant.name}</b><span class="dim">${questVocShort(participant.voc)} · lvl ${participant.level || 1}</span></div></div>`;
}

function questCloseLobbyPanel() {
  questStopPoll();
  QUEST_ACTIVE_LOBBY = null;
  const box = document.getElementById("quest-lobby-box");
  if (box) { box.style.display = "none"; box.innerHTML = ""; }
  document.body.classList.remove("quest-lobby-open");
}

function renderQuestLobby(state) {
  if (!state || !state.lobbyId) {
    questCloseLobbyPanel();
    questToast("O lobby foi encerrado.");
    return;
  }
  const box = document.getElementById("quest-lobby-box");
  if (!box) return;

  // Close the quests modal if open
  const modal = $("#modal"), body = $("#modal-body");
  if (modal && modal.classList.contains("show") && body &&
    (body.classList.contains("quests-modal-shell") || body.classList.contains("quest-detail-shell") || body.classList.contains("quest-lobby-shell"))) {
    modal.classList.remove("show");
    body.classList.remove("quests-modal-shell", "quest-detail-shell", "quest-lobby-shell");
  }

  // Block hunts/quests/bosses
  document.body.classList.add("quest-lobby-open");

  const participants = state.participants || [];
  const maxPlayers = state.maxPlayers || 30;
  const showCount = Math.min(maxPlayers, Math.max(participants.length + 2, 6));
  let slots = "";
  for (let i = 0; i < showCount; i++) slots += questLobbySlot(participants[i], i);
  const phase = state.phase || "lobby";
  const endAt = phase === "countdown" ? state.countdownEndsAt : 0;
  const seconds = endAt ? Math.max(0, Math.ceil((Number(endAt) - Date.now()) / 1000)) : 0;
  const isHost = state.you && state.you.isHost;

  box.style.display = "";
  box.innerHTML = `<div class="ql-card">
    <div class="ql-header" id="ql-header">
      <span class="ql-title">${state.questName || "Quest"} — LOBBY</span>
      <span style="flex:1"></span>
      <button type="button" class="sm" id="ql-min-btn" title="Minimizar">${QUEST_LOBBY_COLLAPSED ? "▸" : "▾"}</button>
      <button type="button" class="sm" id="ql-close-btn" title="Sair do lobby">✕</button>
    </div>
    <div class="ql-body" id="ql-body" style="${QUEST_LOBBY_COLLAPSED ? "display:none" : ""}">
      <div class="ql-sub">${participants.length}/${maxPlayers} jogadores · ${phase === "countdown" ? "Iniciando em " + seconds + "s..." : "Aguardando líder..."}</div>
      <div class="ql-slots">${slots}</div>
      <div class="ql-actions">
        ${state.you && state.you.joined && phase === "lobby" ? `<button type="button" class="sm quest-action" id="ql-leave">SAIR</button>` : ""}
        ${isHost && phase === "lobby" ? `<button type="button" class="danger sm quest-action" id="ql-start">INICIAR</button>` : ""}
      </div>
    </div>
  </div>`;

  const minBtn = document.getElementById("ql-min-btn");
  if (minBtn) minBtn.onclick = (e) => { e.stopPropagation(); QUEST_LOBBY_COLLAPSED = !QUEST_LOBBY_COLLAPSED; renderQuestLobby(state); };
  const headerEl = document.getElementById("ql-header");
  if (headerEl) headerEl.onclick = () => { QUEST_LOBBY_COLLAPSED = !QUEST_LOBBY_COLLAPSED; renderQuestLobby(state); };

  const closeBtn = document.getElementById("ql-close-btn");
  if (closeBtn) closeBtn.onclick = async (e) => {
    e.stopPropagation();
    if (QUEST_MODAL_BUSY) return;
    if (state.you && state.you.joined && phase === "lobby") {
      questSetBusy(true);
      try {
        await questFetch("POST", "/api/quest/leave", { lobbyId: state.lobbyId });
      } finally { questSetBusy(false); }
    }
    questCloseLobbyPanel();
  };

  const leaveBtn = document.getElementById("ql-leave");
  if (leaveBtn) leaveBtn.onclick = async () => {
    if (QUEST_MODAL_BUSY) return;
    questSetBusy(true);
    try {
      const r = await questFetch("POST", "/api/quest/leave", { lobbyId: state.lobbyId });
      if (r.status !== 200 || !r.data || !r.data.ok) return questToast((r.data && r.data.msg) || "Erro.");
      questCloseLobbyPanel();
    } finally { questSetBusy(false); }
  };

  const startBtn = document.getElementById("ql-start");
  if (startBtn) startBtn.onclick = async () => {
    if (QUEST_MODAL_BUSY) return;
    questSetBusy(true);
    try {
      const r = await questFetch("POST", "/api/quest/start", { lobbyId: state.lobbyId });
      if (r.status !== 200 || !r.data || !r.data.ok) return questToast((r.data && r.data.msg) || "Erro.");
      renderQuestLobby(r.data);
    } finally { questSetBusy(false); }
  };
}

function questReturnToTemple() {
  try {
    if (typeof G !== "undefined" && G.combat && typeof stopHunt === "function") {
      stopHunt(true);
    } else if (typeof goToCity === "function") {
      goToCity();
    }
  } catch (e) { /* ignore */ }
}

let QUEST_ENTERING = false;
async function questEnterSharedCombat(ev) {
  if (QUEST_ENTERING) return;
  QUEST_ENTERING = true;
  try {
    // Parar hunt/training atual
    questReturnToTemple();

    // Selecionar o charId correto
    const chars = (ev && Array.isArray(ev.chars)) ? ev.chars : [];
    const cur = typeof sessionCharId === "function" ? Number(sessionCharId()) : 0;
    const match = chars.find((c) => Number(c.id) === cur);
    const charId = Number((match || chars[0] || {}).id) || cur || 0;

    if (charId) {
      try {
        sessionStorage.setItem("tibia-idle-char", String(charId));
        if (typeof ACTIVE_CHARACTER_KEY !== "undefined")
          localStorage.setItem(ACTIVE_CHARACTER_KEY, String(charId));
        sessionStorage.setItem("tibia-idle-online-autoload", String(charId));
      } catch (e) { /* ignore */ }
    }

    // Polling para a instância ficar disponível
    const token = typeof sessionToken === "function" ? sessionToken() : "";
    let remote = null;
    for (let i = 0; i < 80; i++) {
      if (!token || typeof accountLoadInstance !== "function") break;
      remote = await accountLoadInstance(token);
      const inst = remote && remote.instance;
      const belongs = !!(inst && typeof instanceIncludesCharacter === "function" &&
        instanceIncludesCharacter(inst, charId || (typeof G !== "undefined" && G.p && G.p.id)));
      if (belongs) break;
      remote = null;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!remote || !remote.instance) {
      if (typeof toast === "function") toast("Timeout aguardando a instância da quest.", "bad");
      return;
    }
    const session = Object.assign({}, remote.instance, {
      activeCharacterId: String(charId || remote.instance.activeCharacterId || ""),
    });
    try {
      localStorage.setItem("tibia-idle-active-instance-v1", JSON.stringify(session));
    } catch (e) { /* ignore */ }
    if (typeof resumeIdleInstance === "function") await resumeIdleInstance(session);
    questFetch("POST", "/api/quest/loaded", { lobbyId: ev && ev.lobbyId }).catch(() => {});
    if (typeof toast === "function") toast("Você entrou na instância da quest!", "death");
    if (typeof renderAll === "function") renderAll();
  } finally {
    QUEST_ENTERING = false;
  }
}

function openQuestLobby(initialState) {
  questStopPoll();
  QUEST_LOBBY_COLLAPSED = false;
  if (initialState && initialState.lobbyId) {
    QUEST_ACTIVE_LOBBY = { lobbyId: initialState.lobbyId, questId: initialState.questId };
  }
  // Voltar ao templo ao entrar no lobby
  questReturnToTemple();
  renderQuestLobby(initialState);
  // Poll para atualizar lobby
  QUEST_LOBBY_POLL = setInterval(async () => {
    if (!QUEST_ACTIVE_LOBBY) return questStopPoll();
    try {
      const r = await questFetch("GET", "/api/quest/state?questId=" + encodeURIComponent(QUEST_ACTIVE_LOBBY.questId));
      if (r.status !== 200 || !r.data) return;
      const lobbys = r.data.lobbys || [];
      const mine = lobbys.find((l) => l.lobbyId === QUEST_ACTIVE_LOBBY.lobbyId);
      if (!mine) {
        questCloseLobbyPanel();
        return;
      }
      if (mine.phase === "combat") {
        questStopPoll();
        questCloseLobbyPanel();
        return;
      }
      renderQuestLobby(mine);
    } catch (e) { /* silently retry */ }
  }, 2000);
}

/* ---- Reward choice modal ---- */

function openQuestRewardChoice(data) {
  const q = typeof QUEST_DEFS !== "undefined" ? QUEST_DEFS[data.questId] : null;
  if (!q) return;
  const rewards = data.rewards || q.rewards || [];
  const ui = questPrepareModal("quest-reward-shell");
  if (!ui) return;
  const cardsHtml = rewards.map((slug) => {
    const it = typeof GAMEDATA !== "undefined" && GAMEDATA.items ? GAMEDATA.items[slug] : null;
    const name = it ? it.n : slug.replace(/-/g, " ");
    let stats = "";
    if (it) {
      const parts = [];
      if (it.arm) parts.push("Arm: " + it.arm);
      if (it.def) parts.push("Def: " + it.def);
      if (it.attack) parts.push("Atk: " + it.attack);
      if (it.level) parts.push("Lvl " + it.level + "+");
      if (it.voc) parts.push(String(it.voc));
      stats = parts.join(" · ");
    }
    return `<div class="quest-reward-choice-card" data-slug="${slug}">
      ${questRewardImg(slug, 48)}
      <div class="quest-reward-choice-info">
        <b>${name}</b>
        ${stats ? `<span class="tiny dim">${stats}</span>` : ""}
      </div>
    </div>`;
  }).join("");
  ui.body.innerHTML = `<div class="panel-title">${questBossImg(q.bossSprite || q.boss, 24)} ${q.name} — ESCOLHA SUA REWARD
    <span style="flex:1"></span></div>
    <div class="panel-body quest-reward-body">
      ${(data.outfitReward || q.outfitReward) ? `<div class="quest-outfit-granted">${questOutfitPreviewHtml(data.outfitReward || q.outfitReward, 42)}<span class="tiny" style="color:#9ce84a">Desbloqueada automaticamente ao confirmar!</span></div>` : ""}
      <div class="quest-reward-info">Escolha <b>1</b> dos itens abaixo como sua recompensa:</div>
      <div class="quest-reward-grid">${cardsHtml}</div>
      <div id="quest-reward-confirm-area" style="display:none;">
        <div class="quest-reward-selected-preview" id="quest-reward-preview"></div>
        <div class="row mt8" style="gap:8px;justify-content:center;">
          <button type="button" class="sm" id="quest-reward-back">← Voltar</button>
          <button type="button" class="danger sm quest-action" id="quest-reward-confirm">CONFIRMAR</button>
        </div>
      </div>
    </div>`;
  // Bind item tooltips on reward choice cards
  if (typeof bindFullItemTooltip === "function") {
    $$("#modal-body .quest-reward-choice-card").forEach((card) => {
      bindFullItemTooltip(card, card.dataset.slug);
    });
  }
  let selectedSlug = null;
  $$("#modal-body .quest-reward-choice-card").forEach((card) => {
    card.onclick = () => {
      selectedSlug = card.dataset.slug;
      const it = typeof GAMEDATA !== "undefined" && GAMEDATA.items ? GAMEDATA.items[selectedSlug] : null;
      const name = it ? it.n : selectedSlug.replace(/-/g, " ");
      const preview = $("#quest-reward-preview");
      if (preview) {
        let detailHtml = questRewardImg(selectedSlug, 48) + `<b>${name}</b>`;
        if (it) {
          const lines = [];
          if (it.arm) lines.push("Armor: " + it.arm);
          if (it.def) lines.push("Defense: " + it.def);
          if (it.attack) lines.push("Attack: " + it.attack);
          if (it.level) lines.push("Level: " + it.level + "+");
          if (it.voc) lines.push("Vocação: " + it.voc);
          if (it.w) lines.push("Peso: " + it.w + " oz");
          detailHtml += `<div class="quest-reward-item-details">${lines.map((l) => `<span>${l}</span>`).join("")}</div>`;
        }
        preview.innerHTML = detailHtml;
      }
      const area = $("#quest-reward-confirm-area");
      if (area) area.style.display = "";
      // Highlight selected card
      $$("#modal-body .quest-reward-choice-card").forEach((c) => c.classList.toggle("selected", c === card));
    };
  });
  const backBtn = $("#quest-reward-back");
  if (backBtn) backBtn.onclick = () => {
    selectedSlug = null;
    const area = $("#quest-reward-confirm-area");
    if (area) area.style.display = "none";
    $$("#modal-body .quest-reward-choice-card").forEach((c) => c.classList.remove("selected"));
  };
  const confirmBtn = $("#quest-reward-confirm");
  if (confirmBtn) confirmBtn.onclick = async () => {
    if (!selectedSlug || QUEST_MODAL_BUSY) return;
    questSetBusy(true);
    try {
      const r = await questFetch("POST", "/api/quest/choose-reward", {
        questId: data.questId, reward: selectedSlug, charId: data.charId,
      });
      if (r.status !== 200 || !r.data || !r.data.ok) {
        return questToast((r.data && r.data.msg) || "Erro ao escolher a reward.");
      }
      questToast("Reward escolhida! Verifique seu Reward Chest.", "ok");
      const modal = $("#modal");
      if (modal) modal.classList.remove("show");
    } catch (e) {
      questToast("Falha de conexão.");
    } finally {
      questSetBusy(false);
    }
  };
}

/* ---- Event handler (called from game.js sync) ---- */

function handleQuestEvent(data) {
  if (!data || !data.action) return;
  switch (data.action) {
    case "countdown":
      questToast(data.message || "A quest vai começar!", "ok");
      break;
    case "teleport":
      questCloseLobbyPanel();
      questEnterSharedCombat(data);
      break;
    case "kicked":
      questCloseLobbyPanel();
      questToast("Você morreu e foi removido da quest.", "bad");
      break;
    case "success":
      questCloseLobbyPanel();
      if (typeof toast === "function") toast("Quest concluída com sucesso!", "ok");
      break;
    case "fail":
      questCloseLobbyPanel();
      questToast("A quest falhou. Todos foram derrotados.", "bad");
      break;
    case "reward-choice":
      openQuestRewardChoice(data);
      break;
    case "reward-collected":
      if (typeof toast === "function") toast("Reward da quest coletada!", "ok");
      break;
    case "cancelled":
      questCloseLobbyPanel();
      questToast("O lobby foi cancelado.", "bad");
      break;
  }
}

/* ---- Attach button ---- */

function questsAttach() {
  const btn = $("#btn-quests");
  if (btn && !btn.dataset.questAttached) {
    btn.dataset.questAttached = "1";
    btn.addEventListener("click", openQuestsModal);
  }
}

function questStart() {
  questsAttach();
  window.addEventListener("tibia-idle-sync-quest", (ev) => {
    if (typeof handleQuestEvent === "function") handleQuestEvent(ev.detail);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", questStart);
else questStart();
