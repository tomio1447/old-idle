"use strict";

const WARZONES = [
  { id: "wz1", name: "The Deathstrike", title: "Warzone 1", sprite: "deathstrike", hp: 2500000 },
  { id: "wz2", name: "Gnomevil", title: "Warzone 2", sprite: "gnomevil", hp: 4000000 },
  { id: "wz3", name: "The Abyssador", title: "Warzone 3", sprite: "abyssador", hp: 6000000 },
  { id: "wz4", name: "The Baron from Below", title: "Warzone 4", sprite: "the-baron-from-below", hp: 8000000 },
  { id: "wz5", name: "The Count of the Core", title: "Warzone 5", sprite: "the-count-of-the-core", hp: 10000000 },
  { id: "wz6", name: "The Duke of the Depths", title: "Warzone 6", sprite: "the-duke-of-the-depths", hp: 12000000 },
  { id: "devourer", name: "The World Devourer", title: "Heart of Destruction", sprite: "world-devourer", hp: 25000, maxChars: 5 },
  { id: "pale-worm", name: "The Pale Worm", title: "Feast of Souls", sprite: "the-pale-worm", hp: 420000, maxChars: 5 },
  { id: "megalomania", name: "Goshnar's Megalomania", title: "Soul War", sprite: "goshnar-s-megalomania-purple", dataMonster: "goshnar-s-megalomania-green", hp: 620000, maxChars: 5 },
];

let WORLD_BOSS_MODAL_BUSY = false;
let WORLD_BOSS_LOBBY_POLL = null;
let WORLD_BOSS_WAITING = null;

function worldBossActiveChar() {
  const active = window.G && window.G.p;
  return active && active.id ? Number(active.id) : null;
}

function worldBossToast(msg, type) {
  if (typeof toast === "function") toast(msg, type || "bad");
  else console.warn("[world-bosses]", msg);
}

function worldBossStopLobbyPoll() {
  if (WORLD_BOSS_LOBBY_POLL) clearInterval(WORLD_BOSS_LOBBY_POLL);
  WORLD_BOSS_LOBBY_POLL = null;
  WORLD_BOSS_WAITING = null;
}

function worldBossSetBusy(busy) {
  WORLD_BOSS_MODAL_BUSY = !!busy;
  $$("#modal-body .wb-action").forEach((btn) => { btn.disabled = !!busy; });
}

function worldBossVocShort(voc) {
  const v = String(voc || "").toLowerCase();
  if (v.includes("knight")) return "EK";
  if (v.includes("paladin")) return "RP";
  if (v.includes("sorcerer")) return "MS";
  if (v.includes("druid")) return "ED";
  if (v.includes("monk")) return "EM";
  return "?";
}

function worldBossPortrait(slug, size) {
  const portrait = typeof bossMobImg === "function" ? bossMobImg : mobImg;
  return typeof portrait === "function" ? portrait(slug, size) : "";
}

function worldBossMonster(wz) {
  return typeof GAMEDATA !== "undefined" && GAMEDATA.monsters
    ? (GAMEDATA.monsters[wz.dataMonster || wz.sprite] || {}) : {};
}

function worldBossLootHtml(wz) {
  const monster = worldBossMonster(wz);
  return (monster.loot || []).map((drop) => {
    const item = GAMEDATA.items[drop.item];
    const name = item ? item.n : drop.item;
    const chance = Number(drop.chance) || 0;
    const title = `${name} · ${chance}% de chance${drop.max > 1 ? ` · até ${drop.max}x` : ""}`;
    return `<div class="hunt-loot-slot loot-with-chance" data-wb-drop="${drop.item}" title="${title}">
      ${typeof itemImg === "function" ? itemImg(drop.item, 28) : ""}<span class="loot-chance">${chance}%</span></div>`;
  }).join("") || `<span class="tiny dim">Sem loot registrado.</span>`;
}

function worldBossResistsHtml(wz) {
  const monster = worldBossMonster(wz);
  return ["physical", "earth", "energy", "fire", "ice", "holy", "death"]
    .map((element) => typeof resistRowHtml === "function"
      ? resistRowHtml(element, (monster.resist && monster.resist[element]) || 0) : "").join("");
}

function worldBossesCard(wz) {
  return `<div class="hunt-card hunt-modal-card hunt-canary-card boss-modal-card" data-warzone="${wz.id}">
    <button type="button" class="mobs wb-boss-open" data-warzone="${wz.id}" title="Ver ${wz.name}" aria-label="Ver ${wz.name}">
      ${worldBossPortrait(wz.sprite, 48)}
    </button>
    <span class="info"><span class="nm">${wz.name}</span><span class="meta">${wz.title}</span>
      <span class="tiny dim">HP ${wz.hp.toLocaleString("pt-BR")}</span></span>
    <span class="risk low">${wz.maxChars === 5 ? "Raid 5" : "Warzone"}</span>
  </div>`;
}

function worldBossPrepareModal(shell) {
  const modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return null;
  body.classList.remove("hunts-modal-shell", "boss-modal-shell", "bosses-modal-shell", "reward-modal-shell", "npcs-modal-shell", "cidade-modal-shell", "ranking-modal-shell", "mega-lobby-char-shell", "world-boss-detail-shell");
  body.classList.add(shell);
  modal.classList.add("show");
  return { modal, body };
}

function openWorldBossesModal() {
  if (!G.p) return;
  worldBossStopLobbyPoll();
  const ui = worldBossPrepareModal("bosses-modal-shell");
  if (!ui) return;
  ui.body.innerHTML = `<div class="panel-title bosses-modal-title"><span class="world-bosses-icon" aria-hidden="true"></span>
    <span>WORLD BOSSES</span><button class="sm" id="world-bosses-modal-close">Fechar</button></div>
    <div class="panel-body" id="world-bosses-modal-list" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;">
      ${WARZONES.map(worldBossesCard).join("")}</div>`;
  $("#world-bosses-modal-close").onclick = () => {
    ui.modal.classList.remove("show");
    ui.body.classList.remove("bosses-modal-shell");
  };
  $$("#world-bosses-modal-list .wb-boss-open").forEach((btn) => {
    btn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openWorldBossDetail(btn.dataset.warzone);
    };
  });
}

function openWorldBossDetail(warzoneId) {
  worldBossStopLobbyPoll();
  const wz = WARZONES.find((item) => item.id === warzoneId);
  if (!wz) return;
  const ui = worldBossPrepareModal("boss-modal-shell");
  if (!ui) return;
  ui.body.classList.add("world-boss-detail-shell");
  const monster = worldBossMonster(wz);
  ui.body.innerHTML = `<div class="panel-title">${worldBossPortrait(wz.sprite, 24)} ${wz.name} — <span class="dim" style="font-weight:normal">${wz.title}</span>
    <span style="flex:1"></span><button class="sm" id="wb-detail-close">✕</button></div>
    <div class="panel-body boss-detail-body wb-detail-body">
      <div class="boss-detail-summary"><span>Lobby: <b style="color:#9ce84a">1–${wz.maxChars || 20} personagens</b></span><span>Cooldown: <b>16 horas por personagem</b></span></div>
      <div class="wb-detail-grid">
        <section class="wb-detail-identity">
          <div class="hunt-best-sprite boss-best-sprite">${worldBossPortrait(wz.sprite, 84)}</div>
          <div class="hunt-best-name">${wz.name}</div>
          <div class="hunt-best-stat"><span>HP</span><b>${wz.hp.toLocaleString("pt-BR")}</b></div>
          <div class="hunt-best-stat"><span>Exp</span><b>${Math.floor(Number(monster.exp) || 0).toLocaleString("pt-BR")}</b></div>
        </section>
        <section class="wb-detail-panel"><div class="hunt-best-title">RESISTÊNCIAS</div><div class="hunt-best-resists wb-detail-resists">${worldBossResistsHtml(wz)}</div></section>
        <section class="wb-detail-panel wb-detail-loot-panel"><div class="hunt-best-title">LOOT</div><div class="hunt-best-loot boss-best-loot wb-detail-loot">${worldBossLootHtml(wz)}</div></section>
      </div>
      <div class="wb-detail-actions">
        <button type="button" class="sm" id="wb-detail-back">← Voltar</button>
        <select class="sm" id="wb-detail-lobby-type"><option value="open">LOBBY OPEN</option><option value="closed">LOBBY CLOSED</option></select>
        <button type="button" class="sm primary wb-action" id="wb-detail-auto">AUTO JOIN</button>
        <button type="button" class="danger sm wb-action" id="wb-detail-create">CREATE LOBBY</button>
      </div>
    </div>`;
  $("#wb-detail-close").onclick = () => { ui.modal.classList.remove("show"); ui.body.classList.remove("boss-modal-shell", "world-boss-detail-shell"); };
  $("#wb-detail-back").onclick = openWorldBossesModal;
  $("#wb-detail-auto").onclick = () => worldBossAutoJoin(wz.id);
  $("#wb-detail-create").onclick = () => worldBossCreateLobby(wz.id);
}

async function worldBossState() {
  const result = await wbFetch("GET", "/api/world-boss/state");
  return result.status === 200 ? result.data : null;
}

async function worldBossPickCharacter(warzoneId, action) {
  const wz = WARZONES.find((item) => item.id === warzoneId);
  if (!wz) return null;
  if (typeof megaLobbyConfirmCharModal !== "function") {
    worldBossToast("Seletor de personagens indisponível. Recarregue a página.");
    return null;
  }
  const selected = await megaLobbyConfirmCharModal(worldBossActiveChar(), `${action} — ${wz.name}`, "Escolha um personagem da sua conta. O cooldown de 16 horas é individual por personagem.");
  if (!selected) openWorldBossDetail(warzoneId);
  return selected;
}

function worldBossWaitElapsed() {
  const elapsed = Math.max(0, Math.floor((Date.now() - WORLD_BOSS_WAITING.startedAt) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  return (hours ? String(hours).padStart(2, "0") + ":" : "") + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function renderWorldBossWaiting(foundState) {
  if (!WORLD_BOSS_WAITING) return;
  const wait = WORLD_BOSS_WAITING;
  const wz = WARZONES.find((item) => item.id === wait.warzoneId);
  if (!wz) return;
  const ui = worldBossPrepareModal("mega-lobby-char-shell");
  if (!ui) return;
  const found = foundState && foundState.event;
  ui.body.innerHTML = `<div class="panel-title">${worldBossPortrait(wz.sprite, 24)} AUTO JOIN — ${wz.name}
    <span style="flex:1"></span><button type="button" class="sm" id="wb-wait-close">✕</button></div>
    <div class="panel-body wb-wait-body">
      ${found ? `<div class="wb-lobby-found"><b>LOBBY FOUND</b><span>${found.bossName} · ${found.charCount}/${found.maxChars} participantes</span></div>
        <div class="wb-wait-actions"><button type="button" class="sm" id="wb-wait-decline">DECLINE</button><button type="button" class="primary sm wb-action" id="wb-wait-join">JOIN</button></div>`
      : `<div class="wb-wait-spinner"></div><b>Aguardando um lobby disponível...</b><span class="tiny dim">Personagem: ${wait.character.name || "Selecionado"}</span>
        <div class="wb-wait-time" id="wb-wait-time">${worldBossWaitElapsed()}</div><button type="button" class="sm" id="wb-wait-decline">Cancelar espera</button>`}
    </div>`;
  const decline = $("#wb-wait-decline");
  if (decline) decline.onclick = () => { worldBossStopLobbyPoll(); openWorldBossDetail(wait.warzoneId); };
  $("#wb-wait-close").onclick = () => { worldBossStopLobbyPoll(); ui.modal.classList.remove("show"); ui.body.classList.remove("mega-lobby-char-shell"); };
  const join = $("#wb-wait-join");
  if (join) join.onclick = () => worldBossJoinSelected(wait.warzoneId, wait.character, false);
}

function openWorldBossWaiting(warzoneId, character) {
  worldBossStopLobbyPoll();
  WORLD_BOSS_WAITING = { warzoneId, character, startedAt: Date.now(), ticks: 0, found: false };
  renderWorldBossWaiting(null);
  WORLD_BOSS_LOBBY_POLL = setInterval(async () => {
    if (!WORLD_BOSS_WAITING) return;
    const timer = $("#wb-wait-time");
    if (timer) timer.textContent = worldBossWaitElapsed();
    WORLD_BOSS_WAITING.ticks++;
    if (WORLD_BOSS_WAITING.ticks % 3) return;
    try {
      const state = await worldBossState();
      const event = state && state.event;
      if (event && event.phase === "lobby" && event.lobbyType === "open" && event.warzoneId === warzoneId && event.charCount < event.maxChars) {
        WORLD_BOSS_WAITING.found = true;
        renderWorldBossWaiting(state);
      }
    } catch (error) {}
  }, 1000);
}

async function worldBossJoinSelected(warzoneId, selected, waitIfMissing) {
  if (WORLD_BOSS_MODAL_BUSY) return;
  worldBossSetBusy(true);
  try {
    const r = await wbFetch("POST", "/api/world-boss/auto-join", { warzoneId, characterIds: [selected.charId] });
    if (r.status !== 200 || !r.data || !r.data.ok) {
      if (waitIfMissing && r.data && r.data.error === "NO_OPEN_LOBBY") {
        openWorldBossWaiting(warzoneId, selected);
        return;
      }
      openWorldBossDetail(warzoneId);
      return worldBossToast((r.data && r.data.msg) || "Não foi possível entrar no lobby.");
    }
    worldBossStopLobbyPoll();
    if (typeof wbRefresh === "function") await wbRefresh();
    openWorldBossLobby(r.data);
  } catch (error) {
    if (waitIfMissing) openWorldBossWaiting(warzoneId, selected);
    else worldBossToast("Falha de conexão ao entrar no lobby.");
  } finally {
    worldBossSetBusy(false);
  }
}

async function worldBossAutoJoin(warzoneId) {
  if (WORLD_BOSS_MODAL_BUSY) return;
  const selected = await worldBossPickCharacter(warzoneId, "Entrar no lobby");
  if (!selected) return;
  await worldBossJoinSelected(warzoneId, selected, true);
}

async function worldBossCreateLobby(warzoneId) {
  if (WORLD_BOSS_MODAL_BUSY) return;
  const select = $("#wb-detail-lobby-type");
  const lobbyType = select ? select.value : "open";
  const selected = await worldBossPickCharacter(warzoneId, "Criar lobby");
  if (!selected) return;
  worldBossSetBusy(true);
  try {
    const created = await wbFetch("POST", "/api/world-boss/create", { warzoneId, lobbyType, characterIds: [selected.charId] });
    if (created.status !== 200 || !created.data || !created.data.ok) {
      openWorldBossDetail(warzoneId);
      return worldBossToast((created.data && created.data.msg) || "Não foi possível criar o lobby.");
    }
    if (typeof wbRefresh === "function") await wbRefresh();
    openWorldBossLobby(created.data);
  } catch (error) {
    worldBossToast("Falha de conexão ao criar o lobby.");
  } finally {
    worldBossSetBusy(false);
  }
}

function worldBossLobbySlot(participant, index) {
  if (!participant) return `<div class="mega-lobby-slot empty"><span class="mega-lobby-slot-n">#${index + 1}</span><span class="dim">Vaga livre</span></div>`;
  return `<div class="mega-lobby-slot ${participant.host ? "leader" : ""}"><span class="mega-lobby-slot-n">${participant.host ? "LÍDER" : "#" + (index + 1)}</span>
    <div class="mega-lobby-slot-body"><b>${participant.name}</b><span class="dim">${worldBossVocShort(participant.voc)} · lvl ${participant.level || 1}</span></div></div>`;
}

function renderWorldBossLobby(state) {
  const event = state && state.event;
  if (!event) {
    worldBossStopLobbyPoll();
    worldBossToast("O lobby foi encerrado.");
    openWorldBossesModal();
    return;
  }
  const ui = worldBossPrepareModal("mega-lobby-char-shell");
  if (!ui) return;
  const participants = event.participants || [];
  let slots = "";
  for (let i = 0; i < (event.maxChars || 20); i++) slots += worldBossLobbySlot(participants[i], i);
  const endAt = event.phase === "lobby" ? event.lobbyEndsAt : event.countdownEndsAt;
  const seconds = Math.max(0, Math.ceil((Number(endAt) - Date.now()) / 1000));
  ui.body.innerHTML = `<div class="panel-title">${worldBossPortrait(event.bossSprite, 24)} ${event.bossName} — LOBBY
    <span style="flex:1"></span><button type="button" class="sm" id="wb-lobby-close">✕</button></div>
    <div class="panel-body"><div class="mega-lobby-sub">${event.warzoneName} · <b>${participants.length}/${event.maxChars || 20}</b> · ${event.lobbyType === "closed" ? "Fechado" : "Aberto"} · ${event.phase === "countdown" ? "Iniciando" : "Tempo"}: <b>${seconds}s</b></div>
      <div class="mega-lobby-slots wb-lobby-slots">${slots}</div>
      <div class="row mt8" style="gap:6px;justify-content:flex-end">
        ${state.you && state.you.joined && event.phase === "lobby" ? `<button type="button" class="sm wb-action" id="wb-lobby-leave">Sair do lobby</button>` : ""}
        <button type="button" class="sm" id="wb-lobby-back">Voltar aos bosses</button>
      </div>
    </div>`;
  $("#wb-lobby-close").onclick = () => { worldBossStopLobbyPoll(); ui.modal.classList.remove("show"); ui.body.classList.remove("mega-lobby-char-shell"); };
  $("#wb-lobby-back").onclick = openWorldBossesModal;
  const leave = $("#wb-lobby-leave");
  if (leave) leave.onclick = async () => {
    if (WORLD_BOSS_MODAL_BUSY) return;
    worldBossSetBusy(true);
    try {
      const r = await wbFetch("POST", "/api/world-boss/leave", {});
      if (r.status !== 200 || !r.data || !r.data.ok) return worldBossToast((r.data && r.data.msg) || "Não foi possível sair.");
      worldBossStopLobbyPoll();
      openWorldBossDetail(event.warzoneId);
    } finally { worldBossSetBusy(false); }
  };
}

function openWorldBossLobby(initialState) {
  worldBossStopLobbyPoll();
  // O lobby agora é exibido pelo painel lateral do world-boss-ui.js,
  // não por um modal central. Fecha o detalhe e dispara refresh.
  const modal = $("#modal"), body = $("#modal-body");
  if (modal) modal.classList.remove("show");
  if (body) body.classList.remove("boss-modal-shell", "world-boss-detail-shell", "mega-lobby-char-shell");
  if (typeof wbRefresh === "function") wbRefresh();
}

function worldBossesAttach() {
  const btn = $("#btn-world-bosses");
  if (btn && !btn.dataset.wbAttached) {
    btn.dataset.wbAttached = "1";
    btn.addEventListener("click", openWorldBossesModal);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", worldBossesAttach);
else worldBossesAttach();
