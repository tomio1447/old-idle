"use strict";

const TRAINING_ICON_PATH = "assets/ui/training/";
const TRAINING_MAP_OTBM = "exercisearea";
const TRAINING_DUMMY_ITEM_ID = 30616;
const TRAINING_DUMMY_ABS = { x: 1013, y: 1022, z: 7 };
const TRAINING_QUEUE_ABS = [1011, 1012, 1013, 1014].map((x) => ({ x, y: 1021, z: 7 }));
const TRAINING_SKILLS = ["sword", "axe", "club", "dist", "magic", "shield", "fist"];
const TRAINING_PLANS = {
  free: { id: "free", name: "Training Exercise Weapon", charges: Infinity, bonus: 1, gold: 0, tc: 0 },
  exercise: { id: "exercise", name: "Exercise Weapon", charges: 14470, bonus: 1.25, gold: 10000000, tc: 0 },
  lasting: { id: "lasting", name: "Lasting Exercise Weapon", charges: 20000, bonus: 1.5, gold: 0, tc: 150 },
};
const EXERCISE_WEAPONS = {
  "exercise-sword": { name: "Exercise Sword", skill: "sword", icon: "exercise-sword.gif" },
  "exercise-axe": { name: "Exercise Axe", skill: "axe", icon: "exercise-axe.gif" },
  "exercise-club": { name: "Exercise Club", skill: "club", icon: "exercise-club.gif" },
  "exercise-bow": { name: "Exercise Bow", skill: "dist", icon: "exercise-bow.gif" },
  "exercise-rod": { name: "Exercise Rod", skill: "magic", icon: "exercise-rod.gif" },
  "exercise-wand": { name: "Exercise Wand", skill: "magic", icon: "exercise-wand.gif" },
  "exercise-shield": { name: "Exercise Shield", skill: "shield", icon: "exercise-shield.gif" },
  "exercise-wraps": { name: "Exercise Wraps", skill: "fist", icon: "exercise-wraps.gif" },
};

function trainingWeaponForSkill(skill, p) {
  if (skill === "magic") return p && p.voc === "druid" ? "exercise-rod" : "exercise-wand";
  return { sword:"exercise-sword", axe:"exercise-axe", club:"exercise-club", dist:"exercise-bow",
    shield:"exercise-shield", fist:"exercise-wraps" }[skill] || "exercise-sword";
}

function ensureTraining(p) {
  if (!p.trainingExercise || typeof p.trainingExercise !== "object") p.trainingExercise = {};
  const s = p.trainingExercise;
  if (TRAINING_SKILLS.indexOf(s.skill) < 0) s.skill = "sword";
  if (!TRAINING_PLANS[s.activePlan]) s.activePlan = TRAINING_PLANS[s.plan] ? s.plan : "free";
  if (!s.balances || typeof s.balances !== "object") s.balances = {};
  if (s.plan && s.plan !== "free" && s.charges != null && s.balances[s.plan] == null)
    s.balances[s.plan] = s.charges;
  s.balances.exercise = Math.max(0, Math.floor(Number(s.balances.exercise) || 0));
  s.balances.lasting = Math.max(0, Math.floor(Number(s.balances.lasting) || 0));
  delete s.plan;
  delete s.charges;
  s.weapon = trainingWeaponForSkill(s.skill, p);
  s.active = s.active !== false;
  if (p.exercise) delete p.exercise;
  return s;
}

function exerciseCharges(p) {
  const s = ensureTraining(p);
  return s.activePlan === "free" ? Infinity : s.balances[s.activePlan];
}
function exerciseSkillName(id) {
  const w = EXERCISE_WEAPONS[id];
  return w ? (w.skill === "magic" ? "Magic Level" : (SKILL_NAMES[w.skill] || w.skill)) : "";
}
function trainingPlan(p) { return TRAINING_PLANS[ensureTraining(p).activePlan] || TRAINING_PLANS.free; }

async function buyTrainingPlan(p, planId) {
  const plan = TRAINING_PLANS[planId];
  if (!plan || plan.id === "free") return { ok:false, msg:"Modalidade inválida." };
  if (typeof partyOnlineMode === "function" && partyOnlineMode() && typeof accountBuyTrainingPlan === "function") {
    return accountBuyTrainingPlan(sessionToken(), p.id, planId);
  }
  if (plan.gold && (Number(p.gold) || 0) < plan.gold) return { ok:false, msg:"Gold insuficiente." };
  if (plan.tc && (typeof accountCoins !== "function" || accountCoins() < plan.tc)) return { ok:false, msg:"Tibia Coins insuficientes." };
  if (plan.gold) p.gold = Math.max(0, Number(p.gold) - plan.gold);
  if (plan.tc) accountSpendCoins(plan.tc);
  const s = ensureTraining(p); s.activePlan = planId; s.balances[planId] += plan.charges; s.active = true;
  if (typeof save === "function") save();
  return { ok:true, msg:`${plan.name}: +${fmtFull(plan.charges)} cargas.`, trainingExercise:s };
}

function trainingPartyPlayers() {
  const byId = new Map();
  const add = (p) => { if (p && p.id != null && !byId.has(String(p.id))) { ensureTraining(p); byId.set(String(p.id), p); } };
  add(G.p);
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) {
    const st = G.p && G.p._partyOnline;
    for (const row of [st && st.leader].concat((st && st.members) || [])) {
      if (!row) continue;
      const local = typeof getCharacters === "function" ? getCharacters().find((p) => String(p.id) === String(row.id)) : null;
      add(local || Object.assign({ skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:10}, skillTries:{}, ml:0,
        manaSpent:0, config:{}, stamina:42*3600, remoteTraining:true }, row));
    }
  } else if (typeof partyLocalData === "function") {
    const d = partyLocalData();
    const ids = typeof partyLocalMemberIds === "function" ? partyLocalMemberIds(d) : [];
    for (const p of (typeof getCharacters === "function" ? getCharacters() : [])) if (ids.indexOf(String(p.id)) >= 0) add(p);
  }
  return Array.from(byId.values()).slice(0, 4);
}

function trainingLocalPoint(map, abs) {
  // bounds oficiais da exercisearea: x=1000..1023, y=1014..1031
  const DEFAULT_BOUNDS = { minX: 1000, minY: 1014, maxX: 1023, maxY: 1031 };
  const b = (map && map.sourceBounds) || DEFAULT_BOUNDS;
  const ox = Number(b.x !== undefined ? b.x : b.minX) || DEFAULT_BOUNDS.minX;
  const oy = Number(b.y !== undefined ? b.y : b.minY) || DEFAULT_BOUNDS.minY;
  // dimensões reais do mapa; fallback = bounds oficiais (24×18)
  let w = Number(map && map.w);
  let h = Number(map && map.h);
  if (!Number.isFinite(w) || w <= 0) w = DEFAULT_BOUNDS.maxX - DEFAULT_BOUNDS.minX + 1;
  if (!Number.isFinite(h) || h <= 0) h = DEFAULT_BOUNDS.maxY - DEFAULT_BOUNDS.minY + 1;
  return { x: (abs.x - ox + 0.5) / w, y: (abs.y - oy + 0.5) / h };
}
function buildTrainingMember(p, index, map) {
  const s = ensureTraining(p), pos = trainingLocalPoint(map, TRAINING_QUEUE_ABS[index]);
  const isLocal = !!(typeof G !== "undefined" && G && G.p && String(G.p.id) === String(p.id));
  return { id:String(p.id), p, isLocal, playerPos:pos, facing:"s", skill:s.skill, weapon:s.weapon,
    hitCd:500 + index * 120, proj:null, lungeT:0, stats:{hits:0,skillUps:0,shieldUps:0,manaSpent:0}, events:[] };
}

function showTrainingLoading() {
  let el = document.getElementById("training-loading");
  if (!el) { el=document.createElement("div"); el.id="training-loading"; el.style.cssText="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font:bold 16px Verdana;color:#ffe680"; document.body.appendChild(el); }
  el.style.display="flex"; el.textContent="Carregando área de treino...";
}
function hideTrainingLoading(){const el=document.getElementById("training-loading");if(el)el.style.display="none";}

function startTrainingArea() {
  if (!G.p) return {ok:false,msg:"Crie um personagem primeiro."};
  if (G.combat) stopHunt(true);
  if (G.training) return {ok:true,msg:""};
  showTrainingLoading();
  const enter = (map) => {
    hideTrainingLoading();
    if (typeof setGridForMap === "function") setGridForMap(map);
    const players=trainingPartyPlayers();
    G.training={training:true,mode:"exercise",huntMap:map,members:players.map((p,i)=>buildTrainingMember(p,i,map)),
      dummyItemId:TRAINING_DUMMY_ITEM_ID,dummyPos:trainingLocalPoint(map,TRAINING_DUMMY_ABS),events:[]};
    G.inCity=false;G.p.hunt=null;G.combat=null;G.walkKeys={};
    if (typeof partyReportZone === "function") partyReportZone({zone:"training",training:"exercise"});
    addLog("info", `A party entrou na <b>Área de Treino</b> (${players.length} personagem(ns)).`);
    renderAll();
  };
  if (typeof huntMapFromOtbmAsync === "function") huntMapFromOtbmAsync({otbm:TRAINING_MAP_OTBM},()=>enter(HUNTMAPS["otbm:"+TRAINING_MAP_OTBM]||null));
  else enter(null);
  return {ok:true,msg:""};
}
function startDummyTraining(){return startTrainingArea();}
