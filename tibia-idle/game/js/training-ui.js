/* training-ui.js — Botão TREINO (topbar) + modal com 2 abas:
 *   - TREINO COM DUMMY  : exercise weapons + comprar cargas por TC
 *   - TREINO ONLINE     : Treiner (sistema antigo), sem custo, regen 1:1
 */
"use strict";

const TRAINING_MODAL = { aba: "dummy", sel: "exercise-sword" };

function trainingBtnHtml() {
  return `<button class="sm" id="btn-training"
      title="Sistema de Treino — Exercise Dummy (25 TC por 5000 cargas) ou Treinador Online">
      <img src="${TRAINING_ICON_PATH}skill-trainer-all.gif" alt="" class="training-btn-gif">
      <span>TREINO</span></button>`;
}

function bindTrainingButton() {
  const btn = $("#btn-training");
  if (!btn) return;
  btn.addEventListener("click", () => openTrainingModal());
}

/* ------------------------------------------------------------ modal */

function openTrainingModal() {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  $("#modal-body").innerHTML = `
    <div class="panel-title">Sistema de Treino
      <span style="flex:1"></span>
      <button class="sm" id="training-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row wrap mb8" style="gap:4px">
        <button class="sm ${TRAINING_MODAL.aba === "dummy" ? "primary" : ""}" data-tab="dummy">🎯 Treino com Dummy</button>
        <button class="sm ${TRAINING_MODAL.aba === "online" ? "primary" : ""}" data-tab="online">🧘 Treino Online</button>
      </div>
      <div id="training-content"></div>
    </div>`;
  $("#modal").classList.add("show");
  $("#training-close").addEventListener("click", () => $("#modal").classList.remove("show"));
  $$("#modal-body [data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      TRAINING_MODAL.aba = b.dataset.tab;
      renderTrainingContent();
    }));
  renderTrainingContent();
}

function renderTrainingContent() {
  const el = $("#training-content");
  if (!el) return;
  const p = G.p;
  if (TRAINING_MODAL.aba === "dummy") renderTrainingDummy(p, el);
  else renderTrainingOnline(p, el);
}

/* Aba 1 — Exercise Dummy (custa cargas; regen 3:1) */
function renderTrainingDummy(p, el) {
  ensureTraining(p);
  const coins = (typeof accountCoins === "function") ? accountCoins() : 0;
  const lista = Object.keys(EXERCISE_WEAPONS).map((id) => {
    const w = EXERCISE_WEAPONS[id];
    const cargas = p.exercise[id] || 0;
    const sel = TRAINING_MODAL.sel === id;
    return `<div class="tr-weapon ${sel ? "sel" : ""}" data-weapon="${id}">
        <img src="${TRAINING_ICON_PATH}${w.icon}" alt="" class="tr-w-icon">
        <div style="flex:1;min-width:0">
          <div class="small"><b>${w.name}</b>
            <span class="tiny dim">· ${exerciseSkillName(id)}</span></div>
          <div class="tiny ${cargas > 0 ? "" : "dim"}" style="color:${cargas > 0 ? "#9ce84a" : ""}">
            ${fmtFull(cargas)} cargas</div>
        </div>
        <button class="sm tr-buy" data-buy="${id}" ${coins >= w.tc ? "" : "disabled"}
          title="Comprar ${fmtFull(w.charges)} cargas por ${w.tc} Tibia Coins">
          <img src="${COINS_GIF}" class="coin-gif" alt=""> ${fmtFull(w.charges)}x · ${w.tc} TC
        </button>
      </div>`;
  }).join("");

  el.innerHTML = `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="row small" style="justify-content:space-between">
        <span class="dim">Tibia Coins na conta</span>
        <span><img src="${COINS_GIF}" class="coin-gif" alt="">
          <b class="coin-txt" id="training-coins">${fmtFull(coins)}</b></span>
      </div>
      <div class="row small" style="justify-content:space-between">
        <span class="dim">Stamina</span>
        <span>${fmtTime(p.stamina)} / 42h · <b>sempre cheia</b></span>
      </div>
    </div>
    <div class="tiny dim mb4">Exercise weapons — escolha uma e bata no dummy.
      Cada golpe consome <b>1 carga</b> e dá <b>7 tries</b> (600 mana spent p/ ML)
      na skill da arma + shielding, como no Canary.</div>
    <div class="list" style="max-height:300px">${lista}</div>
    <button class="primary full mt8" id="tr-start" ${(p.exercise[TRAINING_MODAL.sel] || 0) > 0 ? "" : "disabled"}>
      Iniciar treino: <b>${EXERCISE_WEAPONS[TRAINING_MODAL.sel].name}</b>
      (${fmtFull(p.exercise[TRAINING_MODAL.sel] || 0)} cargas)
    </button>
    <div class="tiny dim mt4">Sem cargas? Compre 5000x por 25 Tibia Coins no botão da linha.</div>`;

  // selecionar weapon
  $$("#training-content .tr-weapon").forEach((row) =>
    row.addEventListener("click", () => {
      TRAINING_MODAL.sel = row.dataset.weapon;
      renderTrainingContent();
    }));
  // comprar cargas
  $$("#training-content [data-buy]").forEach((b) =>
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const r = buyExerciseCharges(p, b.dataset.buy);
      toast(r.msg, r.ok ? "level" : "");
      if (r.ok) addLog("sell", r.msg);
      renderTrainingContent();
      renderAll();
    }));
  // iniciar treino no dummy
  const start = $("#tr-start");
  if (start) start.addEventListener("click", () => {
    if ((p.exercise[TRAINING_MODAL.sel] || 0) <= 0) {
      toast("Sem cargas dessa exercise weapon.");
      return;
    }
    $("#modal").classList.remove("show");
    startDummyTraining(p, TRAINING_MODAL.sel);
  });
}

/* Aba 2 — Treino Online (Treiner, sem custo; regen 1:1) */
function renderTrainingOnline(p, el) {
  const st = academyStatus(p);
  const skillTxt = st.skill === "magic" ? "Magic Level (600 mana spent por golpe)"
    : st.skill ? SKILL_NAMES[st.skill] : "aguardando equipamento";
  el.innerHTML = `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Treinador</span><span class="v">Treiner da Academia (Safezone)</span></div>
      <div class="stat-row"><span class="k">Custo</span><span class="v" style="color:#9ce84a">Grátis</span></div>
      <div class="stat-row"><span class="k">Stamina</span><span class="v">${fmtTime(p.stamina)} / 42h · <b>sempre cheia</b></span></div>
      <div class="stat-row"><span class="k">Skill treinada</span><span class="v">${skillTxt}</span></div>
      <div class="stat-row"><span class="k">Por golpe</span><span class="v" style="color:#9ce84a">${EXERCISE_TRIES} tries</span></div>
      <div class="stat-row"><span class="k">Intervalo</span><span class="v">${(exerciseInterval(p) / 1000).toFixed(1)}s</span></div>
      <div class="stat-row"><span class="k">Shielding</span><span class="v">Todos os hits</span></div>
    </div>
    <div class="tiny dim mb8">
      O Treiner da academia treina a skill da arma equipada (sem arma: punho).
      Mages acumulam mana spent sem gastar mana, distance não consome munição,
      e todos ganham shielding. Sem custo de cargas ou Tibia Coins.
    </div>
    <button class="primary full" id="tr-online-start">Ir para a Academia (Treiner)</button>`;
  $("#tr-online-start").addEventListener("click", () => {
    $("#modal").classList.remove("show");
    startOnlineTraining(p);
  });
}
