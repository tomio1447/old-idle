/* training.js — Sistema de Treino (Skill Trainer da TibiaWiki).
 *
 * Dois modos de treino:
 *   - DUMMY  (Exercise Dummy): consome cargas de exercise weapons
 *     compradas por Tibia Coins (25 TC = 5000 cargas). Golpes com a mesma
 *     fórmula de skill tick do Canary (7 tries / 600 mana spent por golpe)
 *     e regen de stamina 3:1.
 *   - ONLINE (Skill Trainer / Treiner): o treino antigo da academia, sem
 *     custo, com regen de stamina 1:1.
 *
 * O GIF do botão é o oficial do Skill Trainer (All) da TibiaWiki; os GIFs
 * das exercise weapons também são os oficiais (32x32).
 */
"use strict";

const TRAINING_ICON_PATH = "assets/ui/training/";

/* As 8 exercise weapons oficiais. `skill` é a skill treinada no dummy:
 * sword/axe/club -> melee, bow -> distance, rod/wand -> magic level
 * (mana spent), shield -> shielding, wraps -> fist (monk). Preço/cargas
 * seguem o pedido: 25 Tibia Coins = 5000 cargas. */
const EXERCISE_WEAPONS = {
  "exercise-sword": { name: "Exercise Sword", skill: "sword",
                      tc: 25, charges: 5000, icon: "exercise-sword.gif" },
  "exercise-axe":   { name: "Exercise Axe",   skill: "axe",
                      tc: 25, charges: 5000, icon: "exercise-axe.gif" },
  "exercise-club":  { name: "Exercise Club",  skill: "club",
                      tc: 25, charges: 5000, icon: "exercise-club.gif" },
  "exercise-bow":   { name: "Exercise Bow",   skill: "dist",
                      tc: 25, charges: 5000, icon: "exercise-bow.gif" },
  "exercise-rod":   { name: "Exercise Rod",   skill: "magic",
                      tc: 25, charges: 5000, icon: "exercise-rod.gif" },
  "exercise-wand":  { name: "Exercise Wand",  skill: "magic",
                      tc: 25, charges: 5000, icon: "exercise-wand.gif" },
  "exercise-shield": { name: "Exercise Shield", skill: "shield",
                      tc: 25, charges: 5000, icon: "exercise-shield.gif" },
  "exercise-wraps": { name: "Exercise Wraps", skill: "fist",
                      tc: 25, charges: 5000, icon: "exercise-wraps.gif" },
};

/* Garante o estado das exercise weapons no save: p.exercise[id] = cargas */
function ensureTraining(p) {
  if (!p.exercise || typeof p.exercise !== "object") p.exercise = {};
  for (const id in EXERCISE_WEAPONS) {
    const n = Math.floor(p.exercise[id] || 0);
    p.exercise[id] = Math.max(0, n);
  }
  return p.exercise;
}

/* Cargas atuais de uma exercise weapon. */
function exerciseCharges(p, id) {
  ensureTraining(p);
  return p.exercise[id] || 0;
}

/* Custo total de TC para comprar o pacote de uma weapon. */
function exerciseTcPrice(id) {
  const w = EXERCISE_WEAPONS[id];
  return w ? w.tc : 25;
}

/* Compra 5000x cargas de uma exercise weapon por 25 Tibia Coins.
 * Retorna { ok, msg, charges }. */
function buyExerciseCharges(p, id) {
  const w = EXERCISE_WEAPONS[id];
  if (!w) return { ok: false, msg: "Exercise weapon desconhecida." };
  const price = w.tc;
  if (typeof accountCoins !== "function" || accountCoins() < price) {
    return { ok: false, msg: `Faltam ${price} Tibia Coins. Compre no painel Admin → Coins.` };
  }
  accountSpendCoins(price);
  ensureTraining(p);
  p.exercise[id] += w.charges;
  return { ok: true, msg: `+${fmtFull(w.charges)} cargas de ${w.name} (-${price} TC).`,
           charges: p.exercise[id] };
}

/* Taxa de regen de stamina por modo (em segundos de stamina por segundo
 * real): dummy 3:1 (1/3), online 1:1 (1.0). */
function trainingStaminaRate(t) {
  return (t && t.mode === "dummy") ? (1 / 3) : 1.0;
}

/* Inicia o treino com exercise weapon num Exercise Dummy.
 * Consome 1 carga por golpe; sem cargas, o treino para. */
function startDummyTraining(p, weaponId) {
  if (!EXERCISE_WEAPONS[weaponId]) return { ok: false, msg: "Escolha uma exercise weapon." };
  ensureTraining(p);
  if ((p.exercise[weaponId] || 0) <= 0) {
    return { ok: false, msg: "Sem cargas. Compre 5000x por 25 Tibia Coins." };
  }
  if (G.combat) stopHunt();
  if (G.training) stopAcademy(false);
  G.training = newAcademyTraining(p, "dummy", weaponId);
  G.inCity = false;
  G.p.hunt = null;
  G.combat = null;
  const w = EXERCISE_WEAPONS[weaponId];
  addLog("info", `Treino com <b>${w.name}</b> no Exercise Dummy (regen de stamina 3:1).`);
  toast(`Exercise Dummy: <b>${w.name}</b> ativa`, "level");
  renderAll();
  return { ok: true, msg: "" };
}

/* Inicia o treino online com o Treiner (sem custo, regen 1:1). */
function startOnlineTraining(p) {
  if (typeof startAcademy !== "function") return { ok: false, msg: "" };
  startAcademy();
  return { ok: true, msg: "" };
}

/* Nome amigável da skill treinada por uma exercise weapon. */
function exerciseSkillName(id) {
  const w = EXERCISE_WEAPONS[id];
  if (!w) return "";
  return w.skill === "magic" ? "Magic Level"
    : (SKILL_NAMES[w.skill] || w.skill);
}
