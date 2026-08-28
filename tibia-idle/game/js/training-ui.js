"use strict";

const TRAINING_MODAL = { charId: null, pending: {} };
let TRAINING_PANEL_COLLAPSED = false;

function trainingBtnHtml() {
  return `<button class="sm" id="btn-training" title="Área de Treino"><img src="${TRAINING_ICON_PATH}skill-trainer-all.gif" alt="" class="training-btn-gif"><span>TREINO</span></button>`;
}
function bindTrainingButton() {
  const btn = $("#btn-training");
  if (btn) btn.addEventListener("click", () => G.training ? renderTrainingPanel() : startTrainingArea());
}
function trainingCharacters() {
  return G.training && G.training.members ? G.training.members.map((m) => m.p) : trainingPartyPlayers();
}
function trainingCharacter(id) {
  return trainingCharacters().find((p) => String(p.id) === String(id)) || G.p;
}

function trainingSkillIcon(skill, p) {
  return TRAINING_ICON_PATH + EXERCISE_WEAPONS[trainingWeaponForSkill(skill, p)].icon;
}

function trainingChargesLabel(n) {
  return n === Infinity ? "∞" : fmtFull(n || 0);
}

function openTrainingModal(charId) {
  const p = trainingCharacter(charId);
  if (!p || p.remoteTraining) {
    toast("Este personagem online configura o treino no próprio cliente.");
    return;
  }
  TRAINING_MODAL.charId = String(p.id);
  TRAINING_MODAL.pending = {};
  const state = ensureTraining(p);

  const skillCells = TRAINING_SKILLS.map((skill) => {
    const active = state.skill === skill;
    const label = skill === "magic" ? "Magic Level" : (SKILL_NAMES[skill] || skill);
    const lvl = skill === "magic" ? (p.ml || 0) : ((p.skills && p.skills[skill]) || 10);
    return `<button class="tr-skill-cell ${active ? "sel" : ""}" data-tr-skill="${skill}" type="button">
      <img src="${trainingSkillIcon(skill, p)}" alt="">
      <span class="tr-skill-name">${label}</span>
      <span class="tr-skill-lvl">${fmtFull(lvl)}</span>
    </button>`;
  }).join("");

  const planCards = Object.values(TRAINING_PLANS).map((row) => {
    const active = state.activePlan === row.id;
    const have = row.id === "free" ? Infinity : (state.balances[row.id] || 0);
    const price = row.id === "free" ? "grátis" : (row.gold ? `${fmtFull(row.gold)} gp` : `${row.tc} TC`);
    const charges = row.id === "free" ? "∞" : fmtFull(row.charges);
    return `<button class="tr-plan-card ${active ? "sel" : ""}" data-tr-plan="${row.id}" type="button">
      <span class="tr-plan-title">${row.name}</span>
      <span class="tr-plan-bonus">${Math.round(row.bonus * 100)}% eficácia</span>
      <span class="tr-plan-meta">${trainingChargesLabel(have)} cargas · pacote ${charges}</span>
      <span class="tr-plan-price">${price}</span>
    </button>`;
  }).join("");

  const header = `<div class="panel-title training-modal-title">
    <img src="${trainingSkillIcon(state.skill, p)}" class="tr-title-icon" alt="">
    <span>${p.name}</span>
    <span class="spacer"></span>
    <button class="sm" id="training-close" type="button">✕</button>
  </div>`;
  const body = `<div class="panel-body training-modal-body">
    <div class="tr-section-label">Skill</div>
    <div class="tr-skill-grid">${skillCells}</div>
    <div class="tr-section-label">Modalidade</div>
    <div class="tr-plan-grid">${planCards}</div>
    <button class="primary full mt8" id="training-apply" type="button">Treinar</button>
    <div class="tiny dim mt4 tr-now">Atual: ${TRAINING_PLANS[state.activePlan].name}</div>
  </div>`;

  const modalBody = $("#modal-body");
  modalBody.innerHTML = header + body;
  modalBody.className = "modal panel training-modal-shell";
  $("#modal").classList.add("show");

  $("#training-close").onclick = () => $("#modal").classList.remove("show");

  const updateBtn = () => {
    const selSkill = TRAINING_MODAL.pending.skill || state.skill;
    const selPlanId = TRAINING_MODAL.pending.plan || state.activePlan;
    const selPlan = TRAINING_PLANS[selPlanId];
    const have = selPlanId === "free" ? Infinity : (state.balances[selPlanId] || 0);
    const needBuy = selPlanId !== "free" && have <= 0;
    const same = selSkill === state.skill && selPlanId === state.activePlan;
    const btn = $("#training-apply");
    if (!btn) return;
    if (same && !needBuy) {
      btn.textContent = "Treinar";
      btn.classList.remove("buy");
    } else if (needBuy) {
      btn.textContent = selPlan.gold ? `Comprar (${fmtFull(selPlan.gold)} gp)` : `Comprar (${selPlan.tc} TC)`;
      btn.classList.add("buy");
    } else {
      btn.textContent = "Aplicar e treinar";
      btn.classList.remove("buy");
    }
    const nowEl = $(".tr-now");
    if (nowEl) nowEl.textContent = `Selecionado: ${selPlan.name} · ${trainingChargesLabel(have)} cargas`;
    const titleIcon = $(".tr-title-icon");
    if (titleIcon) titleIcon.src = trainingSkillIcon(selSkill, p);
  };

  $$("#modal-body [data-tr-skill]").forEach((b) => b.onclick = () => {
    TRAINING_MODAL.pending.skill = b.dataset.trSkill;
    $$("#modal-body [data-tr-skill]").forEach((el) => el.classList.toggle("sel", el.dataset.trSkill === b.dataset.trSkill));
    updateBtn();
  });
  $$("#modal-body [data-tr-plan]").forEach((b) => b.onclick = () => {
    TRAINING_MODAL.pending.plan = b.dataset.trPlan;
    $$("#modal-body [data-tr-plan]").forEach((el) => el.classList.toggle("sel", el.dataset.trPlan === b.dataset.trPlan));
    updateBtn();
  });

  $("#training-apply").onclick = async () => {
    const skill = TRAINING_MODAL.pending.skill || state.skill;
    const planId = TRAINING_MODAL.pending.plan || state.activePlan;
    state.skill = skill;
    state.weapon = trainingWeaponForSkill(skill, p);
    state.active = true;

    let result = { ok: true, msg: "Treino atualizado." };
    if (planId === "free") {
      state.activePlan = "free";
    } else if ((state.balances[planId] || 0) > 0) {
      state.activePlan = planId;
    } else {
      result = await buyTrainingPlan(p, planId);
    }
    if (result.trainingExercise) Object.assign(state, result.trainingExercise);
    if (!result.ok) { toast(result.msg); return; }

    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(p);
    const member = G.training && G.training.members.find((m) => String(m.id) === String(p.id));
    if (member) { member.skill = state.skill; member.weapon = state.weapon; }
    toast(result.msg, "level");
    $("#modal").classList.remove("show");
    renderTrainingPanel();
    renderAll();
  };

  updateBtn();
}

function renderTrainingPanel() {
  const box = $("#training-box");
  if (!box) return;
  if (!G.training) { box.style.display = "none"; return; }
  const rows = (G.training.members || []).map((m) => {
    const s = ensureTraining(m.p), plan = trainingPlan(m.p);
    const disabled = m.p.remoteTraining ? "disabled" : "";
    const charges = plan.id === "free" ? "∞" : fmtFull(s.balances[plan.id] || 0);
    const skillLabel = s.skill === "magic" ? "Magic Level" : (SKILL_NAMES[s.skill] || s.skill);
    return `<button class="training-char" data-training-char="${m.id}" ${disabled} type="button">
      <img src="${TRAINING_ICON_PATH + EXERCISE_WEAPONS[s.weapon].icon}" class="tr-char-icon" alt="">
      <span class="tr-char-info"><b>${m.p.name}</b><small>${skillLabel}</small></span>
      <span class="tr-char-plan"><span>${plan.name}</span><small>${charges} cargas</small></span>
    </button>`;
  }).join("");
  box.style.display = "block";
  box.classList.toggle("collapsed", TRAINING_PANEL_COLLAPSED);
  box.innerHTML = `<div class="mission-head" id="training-panel-head"><span>TREINO</span><span class="spacer"></span><span>${TRAINING_PANEL_COLLAPSED ? "▸" : "▾"}</span></div>
    <div class="training-panel-body" style="display:${TRAINING_PANEL_COLLAPSED ? "none" : "block"}">${rows}</div>`;
  $("#training-panel-head").onclick = () => { TRAINING_PANEL_COLLAPSED = !TRAINING_PANEL_COLLAPSED; renderTrainingPanel(); };
  $$("#training-box [data-training-char]").forEach((b) => b.onclick = () => openTrainingModal(b.dataset.trainingChar));
}
