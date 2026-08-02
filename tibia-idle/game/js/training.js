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
 * das exercise weapons também são os oficiais (64x64 animadas, 5 frames cada, upscaling nearest-neighbor da TibiaWiki).
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

/* Nome do mapa .otbm da sala de exercise weapons (commit 0553abd). */
const TRAINING_MAP_OTBM = "sala de exercise weapons";

/* Overlay de loading curto ao entrar na sala (some quando o mapa chega). */
function showTrainingLoading() {
  let el = document.getElementById("training-loading");
  if (!el) {
    el = document.createElement("div");
    el.id = "training-loading";
    el.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.72);" +
      "font:bold 16px Verdana;color:#ffe680;letter-spacing:.05em;";
    document.body.appendChild(el);
  }
  el.style.display = "flex";
  el.innerHTML = "⏳ Carregando sala de exercise weapons...";
}

function hideTrainingLoading() {
  const el = document.getElementById("training-loading");
  if (el) el.style.display = "none";
}

/* Inicia o treino com exercise weapon no Ferumbras Exercise Dummy.
 * Consome 1 carga por golpe; sem cargas, o treino para.
 * O mapa .otbm da sala é carregado de forma assíncrona (loading curto);
 * se falhar, cai no cenário procedural (comportamento anterior). */
function startDummyTraining(p, weaponId) {
  if (!EXERCISE_WEAPONS[weaponId]) return { ok: false, msg: "Escolha uma exercise weapon." };
  ensureTraining(p);
  if ((p.exercise[weaponId] || 0) <= 0) {
    return { ok: false, msg: "Sem cargas. Compre 5000x por 25 Tibia Coins." };
  }
  if (G.combat) stopHunt();
  if (G.training) stopAcademy(false);
  showTrainingLoading();
  const w = EXERCISE_WEAPONS[weaponId];

  const entrar = (huntMap) => {
    hideTrainingLoading();
    G.training = newAcademyTraining(p, "dummy", weaponId, huntMap || null);
    G.inCity = false;
    G.p.hunt = null;
    G.combat = null;
    addLog("info", `Treino com <b>${w.name}</b> no Ferumbras Exercise Dummy (regen de stamina 3:1).`);
    toast(`Ferumbras Dummy: <b>${w.name}</b> ativa`, "level");
    renderAll();
  };

  // carrega o mapa .otbm da sala (fetch + cache) com loading curto
  const pseudo = { otbm: TRAINING_MAP_OTBM };
  if (typeof huntMapFromOtbmAsync === "function") {
    let pronto = false;
    const t0 = Date.now();
    const fallback = setTimeout(() => { if (!pronto) entrar(null); }, 4000);
    huntMapFromOtbmAsync(pseudo, () => {
      pronto = true;
      clearTimeout(fallback);
      const key = "otbm:" + TRAINING_MAP_OTBM;
      const hm = (typeof HUNTMAPS !== "undefined" && HUNTMAPS[key]) ? HUNTMAPS[key] : null;
      entrar(hm);
    });
  } else {
    entrar(null);
  }
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
