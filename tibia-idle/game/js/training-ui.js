"use strict";

const TRAINING_MODAL = { charId:null };
let TRAINING_PANEL_COLLAPSED = false;

function trainingBtnHtml() {
  return `<button class="sm" id="btn-training" title="Área de Treino"><img src="${TRAINING_ICON_PATH}skill-trainer-all.gif" alt="" class="training-btn-gif"><span>TREINO</span></button>`;
}
function bindTrainingButton(){const btn=$("#btn-training");if(btn)btn.addEventListener("click",()=>G.training?renderTrainingPanel():startTrainingArea());}
function trainingCharacters(){return G.training&&G.training.members?G.training.members.map((m)=>m.p):trainingPartyPlayers();}
function trainingCharacter(id){return trainingCharacters().find((p)=>String(p.id)===String(id))||G.p;}

function openTrainingModal(charId) {
  const p=trainingCharacter(charId);if(!p||p.remoteTraining){toast("Este personagem online configura o treino no próprio cliente.");return;}
  TRAINING_MODAL.charId=String(p.id);const state=ensureTraining(p),plan=trainingPlan(p);
  const skills=TRAINING_SKILLS.map((skill)=>`<option value="${skill}" ${state.skill===skill?"selected":""}>${skill==="magic"?"Magic Level":(SKILL_NAMES[skill]||skill)}</option>`).join("");
  const plans=Object.values(TRAINING_PLANS).map((row)=>{const balance=row.id==="free"?Infinity:state.balances[row.id];return `<label class="tr-plan ${state.activePlan===row.id?"sel":""}"><input type="radio" name="training-plan" value="${row.id}" ${state.activePlan===row.id?"checked":""}><b>${row.name}</b><span>${row.id==="free"?"grátis · infinita · 100%":`${fmtFull(balance)} disponíveis · pacote ${fmtFull(row.charges)} por ${row.gold?fmtFull(row.gold)+" gp":row.tc+" TC"} · ${Math.round(row.bonus*100)}%`}</span></label>`;}).join("");
  $("#modal-body").innerHTML=`<div class="panel-title">Treino — ${p.name}<span style="flex:1"></span><button class="sm" id="training-close">✕</button></div><div class="panel-body"><label class="small">Skill explícita</label><select id="training-skill" class="full mb8">${skills}</select><div class="training-plans">${plans}</div><div class="tiny dim mt8">Escolha e cargas são exclusivas e persistentes deste personagem. Comprar um pacote soma cargas ao saldo existente.</div><button class="primary full mt8" id="training-apply">Aplicar e treinar</button><div class="tiny dim mt4">Atual: ${plan.name} · ${plan.id==="free"?"∞":fmtFull(state.balances[plan.id])} cargas</div></div>`;
  $("#modal").classList.add("show");$("#training-close").onclick=()=>$("#modal").classList.remove("show");
  $("#training-apply").onclick=async()=>{const skill=$("#training-skill").value,planId=($("#modal-body input[name=training-plan]:checked")||{}).value||"free";state.skill=skill;state.weapon=trainingWeaponForSkill(skill,p);state.active=true;
    let result={ok:true,msg:"Treino atualizado."};if(planId==="free")state.activePlan="free";else if(state.balances[planId]>0)state.activePlan=planId;else result=await buyTrainingPlan(p,planId);
    if(result.trainingExercise)Object.assign(state,result.trainingExercise);if(!result.ok){toast(result.msg);return;}if(typeof saveCharacterToRoster==="function")saveCharacterToRoster(p);const member=G.training&&G.training.members.find((m)=>String(m.id)===String(p.id));if(member){member.skill=state.skill;member.weapon=state.weapon;}
    toast(result.msg,"level");$("#modal").classList.remove("show");renderTrainingPanel();renderAll();};
}

function renderTrainingPanel(){const box=$("#training-box");if(!box)return;if(!G.training){box.style.display="none";return;}const rows=(G.training.members||[]).map((m)=>{const s=ensureTraining(m.p),plan=trainingPlan(m.p);return `<button class="training-char" data-training-char="${m.id}" ${m.p.remoteTraining?"disabled":""}><span><b>${m.p.name}</b><small>${s.skill==="magic"?"Magic Level":(SKILL_NAMES[s.skill]||s.skill)}</small></span><span>${plan.name}<small>${plan.id==="free"?"∞":fmtFull(s.balances[plan.id])} cargas · ${Math.round(plan.bonus*100)}%</small></span></button>`;}).join("");box.style.display="block";box.classList.toggle("collapsed",TRAINING_PANEL_COLLAPSED);box.innerHTML=`<div class="mission-head" id="training-panel-head"><span>TREINO</span><span class="spacer"></span><span>${TRAINING_PANEL_COLLAPSED?"▸":"▾"}</span></div><div class="training-panel-body" style="display:${TRAINING_PANEL_COLLAPSED?"none":"block"}">${rows}</div>`;$("#training-panel-head").onclick=()=>{TRAINING_PANEL_COLLAPSED=!TRAINING_PANEL_COLLAPSED;renderTrainingPanel();};$$("#training-box [data-training-char]").forEach((b)=>b.onclick=()=>openTrainingModal(b.dataset.trainingChar));}
