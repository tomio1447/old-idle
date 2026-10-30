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
/* Todos os personagens da conta — membros da área de treino primeiro
 * (objetos vivos da sessão), depois os demais do roster/cache online.
 * Permite configurar o treino de qualquer char sem trocar o ativo. */
function trainingAccountCharacters() {
  const byId = new Map();
  const add = (p) => {
    if (!p || p.id == null || byId.has(String(p.id))) return;
    if (typeof ensurePlayerEquip === "function") ensurePlayerEquip(p);
    ensureTraining(p);
    byId.set(String(p.id), p);
  };
  for (const m of (G.training && G.training.members) || []) add(m.p);
  const all = typeof promotionAccountCharacters === "function"
    ? promotionAccountCharacters()
    : (typeof getCharacters === "function" ? getCharacters() : []);
  for (const p of all) add(p);
  return Array.from(byId.values());
}
function trainingCharacter(id) {
  return trainingAccountCharacters().find((p) => String(p.id) === String(id)) || G.p;
}
/* saveCharacterToRoster marca o char como ativo no storage — restaura o
 * ativo da sessão quando o alvo editado é outro personagem. */
function saveTrainingRosterChar(p) {
  if (!p || typeof saveCharacterToRoster !== "function") return;
  let active = null;
  try { active = localStorage.getItem(typeof ACTIVE_CHARACTER_KEY !== "undefined" ? ACTIVE_CHARACTER_KEY : "tibia-idle-active-character-v1"); } catch (e) {}
  saveCharacterToRoster(p);
  try { if (active) localStorage.setItem(typeof ACTIVE_CHARACTER_KEY !== "undefined" ? ACTIVE_CHARACTER_KEY : "tibia-idle-active-character-v1", active); } catch (e) {}
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

  const lastingCount = Math.max(0, Math.floor(Number(state.balances.lasting) || 0));
  const skillCells = TRAINING_SKILLS.map((skill) => {
    const active = state.skill === skill;
    const label = skill === "magic" ? "Magic Level" : (SKILL_NAMES[skill] || skill);
    const lvl = skill === "magic" ? (p.ml || 0) : ((p.skills && p.skills[skill]) || 10);
    return `<button class="tr-skill-cell ${active ? "sel" : ""}" data-tr-skill="${skill}" type="button">
      <span class="tr-icon-wrap"><img src="${trainingSkillIcon(skill, p)}" alt="">
        <span class="tr-charge-badge" title="Cargas de Lasting Exercise Weapon">${fmtFull(lastingCount)}</span></span>
      <span class="tr-skill-name">${label}</span>
      <span class="tr-skill-lvl">${fmtFull(lvl)}</span>
    </button>`;
  }).join("");

  const planCards = Object.values(TRAINING_PLANS).map((row) => {
    const active = state.activePlan === row.id;
    const have = row.id === "free" ? Infinity : (state.balances[row.id] || 0);
    const price = row.id === "free" ? "grátis" : (row.gold ? `${fmtFull(row.gold)} gp` : `${row.tc} TC`);
    const charges = row.id === "free" ? "∞" : fmtFull(row.charges);
    const icon = trainingPlanIcon(p, row.id);
    return `<button class="tr-plan-card ${active ? "sel" : ""}" data-tr-plan="${row.id}" type="button">
      <img src="${icon}" class="tr-plan-icon" alt="">
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

  const skillLabel = (skill) => skill === "magic" ? "Magic Level" : (SKILL_NAMES[skill] || skill);

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
    if (nowEl) nowEl.textContent = `Selecionado: ${skillLabel(selSkill)} · ${selPlan.name} · ${trainingChargesLabel(have)} cargas`;
    const titleIcon = $(".tr-title-icon");
    if (titleIcon) titleIcon.src = trainingSkillIcon(selSkill, p);

    /* Atualiza os ícones dos planos abaixo para refletir a arma do skill escolhido. */
    $$("#modal-body [data-tr-plan] .tr-plan-icon").forEach((img) => {
      const card = img.closest("[data-tr-plan]");
      const planId = card && card.dataset.trPlan;
      if (planId) img.src = trainingPlanIcon(p, planId, selSkill);
    });
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
    const online = typeof partyOnlineMode === "function" && partyOnlineMode()
      && typeof accountSetTrainingConfig === "function" && typeof sessionToken === "function" && sessionToken();

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

    state.skill = skill;
    state.weapon = trainingWeaponForSkill(skill, p);
    state.active = true;

    /* Online: a config de treino é autoritativa no servidor — vale para
     * qualquer char da conta, inclusive fora da party/instância. */
    if (online) {
      const r = await accountSetTrainingConfig(sessionToken(), p.id, skill, state.activePlan);
      if (r && r.trainingExercise) Object.assign(state, r.trainingExercise);
      if (r && !r.ok) { toast(r.msg || "Treino salvo apenas localmente.", "bad"); return; }
    }

    saveTrainingRosterChar(p);
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
  const memberIds = new Set((G.training.members || []).map((m) => String(m.id)));
  const rows = trainingAccountCharacters().map((p) => {
    const s = ensureTraining(p), plan = trainingPlan(p);
    const disabled = p.remoteTraining ? "disabled" : "";
    const inArea = memberIds.has(String(p.id));
    const charges = plan.id === "free" ? "∞" : fmtFull(s.balances[plan.id] || 0);
    const lasting = Math.max(0, Math.floor(Number(s.balances.lasting) || 0));
    const skillLabel = s.skill === "magic" ? "Magic Level" : (SKILL_NAMES[s.skill] || s.skill);
    const eta = (inArea && typeof trainingSkillEtaText === "function") ? trainingSkillEtaText(p) : "";
    return `<button class="training-char ${inArea ? "" : "outside"}" data-training-char="${p.id}" ${disabled}
        title="${p.remoteTraining ? "Configurado no cliente do jogador" : (inArea ? "" : "Fora da área de treino — clique para configurar")}" type="button">
      <span class="tr-icon-wrap"><img src="${TRAINING_ICON_PATH + EXERCISE_WEAPONS[s.weapon].icon}" class="tr-char-icon" alt="">
        <span class="tr-charge-badge" title="Cargas de Lasting Exercise Weapon">${fmtFull(lasting)}</span></span>
      <span class="tr-char-info"><b>${p.name}</b><small>${skillLabel}</small></span>
      <span class="tr-char-plan"><span>${plan.name}</span><small>${charges} cargas</small>${eta ? `<small class="tr-eta" title="Tempo estimado até o próximo nível de ${skillLabel}">⏱ ${eta}</small>` : ""}</span>
    </button>`;
  }).join("");
  box.style.display = "block";
  box.classList.toggle("collapsed", TRAINING_PANEL_COLLAPSED);
  box.innerHTML = `<div class="mission-head" id="training-panel-head"><span>TREINO</span><span class="spacer"></span><span>${TRAINING_PANEL_COLLAPSED ? "▸" : "▾"}</span></div>
    <div class="training-panel-body" style="display:${TRAINING_PANEL_COLLAPSED ? "none" : "block"}">${rows}</div>`;
  $("#training-panel-head").onclick = () => { TRAINING_PANEL_COLLAPSED = !TRAINING_PANEL_COLLAPSED; renderTrainingPanel(); };
  $$("#training-box [data-training-char]").forEach((b) => b.onclick = () => openTrainingModal(b.dataset.trainingChar));
}
