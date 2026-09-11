"use strict";

const WARZONES = [
  { id: "wz1", name: "The Deathstrike", title: "Warzone 1", sprite: "deathstrike", hp: 2500000 },
  { id: "wz2", name: "Gnomevil", title: "Warzone 2", sprite: "gnomevil", hp: 4000000 },
  { id: "wz3", name: "The Abyssador", title: "Warzone 3", sprite: "abyssador", hp: 6000000 },
  { id: "wz4", name: "The Baron from Below", title: "Warzone 4", sprite: "the-baron-from-below", hp: 8000000 },
  { id: "wz5", name: "The Count of the Core", title: "Warzone 5", sprite: "the-count-of-the-core", hp: 10000000 },
  { id: "wz6", name: "The Duke of the Depths", title: "Warzone 6", sprite: "the-duke-of-the-depths", hp: 12000000 },
];

let WORLD_BOSS_MODAL_BUSY = false;
let WORLD_BOSS_LOBBY_POLL = null;

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
    ? (GAMEDATA.monsters[wz.sprite] || {}) : {};
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
    <span class="risk low">Warzone</span>
  </div>`;
}

function worldBossPrepareModal(shell) {
  const modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return null;
  body.classList.remove("hunts-modal-shell", "boss-modal-shell", "bosses-modal-shell", "reward-modal-shell", "npcs-modal-shell", "cidade-modal-shell", "ranking-modal-shell", "mega-lobby-char-shell");
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
  const monster = worldBossMonster(wz);
  ui.body.innerHTML = `<div class="panel-title">${worldBossPortrait(wz.sprite, 24)} ${wz.name} — <span class="dim" style="font-weight:normal">${wz.title}</span>
    <span style="flex:1"></span><button class="sm" id="wb-detail-close">✕</button></div>
    <div class="panel-body boss-detail-body">
      <div class="boss-detail-summary"><span>Lobby: <b style="color:#9ce84a">1–20 personagens</b></span><span>Cooldown: <b>16 horas por personagem</b></span></div>
      <div class="hunt-best-card boss-best-card">
        <div class="hunt-best-sprite boss-best-sprite">${worldBossPortrait(wz.sprite, 76)}</div>
        <div class="hunt-best-name">${wz.name}</div>
        <div class="hunt-best-stat"><span>HP</span><b>${wz.hp.toLocaleString("pt-BR")}</b></div>
        <div class="hunt-best-stat"><span>Exp</span><b>${Math.floor(Number(monster.exp) || 0).toLocaleString("pt-BR")}</b></div>
        <div class="hunt-best-title">RESISTÊNCIAS</div><div class="hunt-best-resists boss-best-resists">${worldBossResistsHtml(wz)}</div>
        <div class="hunt-best-title">LOOT</div><div class="hunt-best-loot boss-best-loot">${worldBossLootHtml(wz)}</div>
      </div>
      <div class="row mt8" style="gap:6px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="sm" id="wb-detail-back">← Voltar</button>
        <select class="sm" id="wb-detail-lobby-type"><option value="open">LOBBY OPEN</option><option value="closed">LOBBY CLOSED</option></select>
        <button type="button" class="sm primary wb-action" id="wb-detail-auto">AUTO JOIN</button>
        <button type="button" class="danger sm wb-action" id="wb-detail-create">CREATE LOBBY</button>
      </div>
    </div>`;
  $("#wb-detail-close").onclick = () => { ui.modal.classList.remove("show"); ui.body.classList.remove("boss-modal-shell"); };
  $("#wb-detail-back").onclick = openWorldBossesModal;
  $("#wb-detail-auto").onclick = () => worldBossAutoJoin(wz.id);
  $("#wb-detail-create").onclick = () => worldBossCreateLobby(wz.id);
}

async function worldBossState() {
  const result = await wbFetch("GET", "/api/world-boss/state");
  return result.status === 200 ? result.data : null;
}

async function worldBossAutoJoin(warzoneId) {
  if (WORLD_BOSS_MODAL_BUSY) return;
  const charId = worldBossActiveChar();
  if (!charId) return worldBossToast("Selecione um personagem ativo primeiro.");
  worldBossSetBusy(true);
  try {
    const r = await wbFetch("POST", "/api/world-boss/auto-join", { warzoneId, characterIds: [charId] });
    if (r.status !== 200 || !r.data || !r.data.ok) return worldBossToast((r.data && r.data.msg) || "Não foi possível entrar no lobby.");
    if (typeof wbRefresh === "function") await wbRefresh();
    openWorldBossLobby(r.data);
  } catch (error) {
    worldBossToast("Falha de conexão ao entrar no lobby.");
  } finally {
    worldBossSetBusy(false);
  }
}

async function worldBossCreateLobby(warzoneId) {
  if (WORLD_BOSS_MODAL_BUSY) return;
  const charId = worldBossActiveChar();
  if (!charId) return worldBossToast("Selecione um personagem ativo primeiro.");
  const select = $("#wb-detail-lobby-type");
  const lobbyType = select ? select.value : "open";
  worldBossSetBusy(true);
  try {
    const created = await wbFetch("POST", "/api/world-boss/create", { warzoneId, lobbyType });
    if (created.status !== 200 || !created.data || !created.data.ok) return worldBossToast((created.data && created.data.msg) || "Não foi possível criar o lobby.");
    const joined = await wbFetch("POST", "/api/world-boss/auto-join", { warzoneId, characterIds: [charId] });
    if (joined.status !== 200 || !joined.data || !joined.data.ok) return worldBossToast((joined.data && joined.data.msg) || "Lobby criado, mas não foi possível adicionar seu personagem.");
    if (typeof wbRefresh === "function") await wbRefresh();
    openWorldBossLobby(joined.data);
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
  renderWorldBossLobby(initialState);
  WORLD_BOSS_LOBBY_POLL = setInterval(async () => {
    try {
      const state = await worldBossState();
      if (state) renderWorldBossLobby(state);
    } catch (error) {}
  }, 2500);
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
