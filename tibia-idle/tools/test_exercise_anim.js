/* Teste do sistema de animação das exercise weapons no dummy:
 * 1) playerPos/dummyPos sempre preenchidos (mapa .otbm OU fallback);
 * 2) a cada golpe o personagem encara o dummy (facing) e o projétil é
 *    criado com a arma certa (kind/missile/fx/lunge por weapon);
 * 3) consome 1 carga por golpe; sem cargas o treino não cria projétil.
 */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="modal"></div><div id="tooltip"></div><div id="ctx-menu"></div>
<div id="hunts"></div><div id="log"></div>
<canvas id="scene" width="840" height="520"></canvas></body></html>`,
  { url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
const errors = [];
w.addEventListener("error", (e) => errors.push("WINDOWERROR " + e.message));
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient")
      return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    return typeof k === "string" ? () => {} : undefined;
  },
  set() { return true; },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
const ctx = vm.createContext(w);
function load(f) {
  try { vm.runInContext(fs.readFileSync(path.join(GAME, f), "utf8"), ctx, { filename: f }); }
  catch (e) { errors.push(f + ": " + e.message); }
}

load("js/training.js");
load("js/city.js");

// stubs minimos (funcoes que vivem em arquivos nao carregados aqui).
// Precisam ser setados DEPOIS de carregar city.js (o arquivo redefine as
// proprias funcoes quando e avaliado).
w.cellCenter = (cell) => ({ x: (cell.x + 0.5) / 21, y: (cell.y + 0.5) / 13 });
w.SKILL_NAMES = { sword: "Sword", axe: "Axe", club: "Club", dist: "Distance",
                  shield: "Shielding", fist: "Fist", magic: "Magic Level" };
w.academyStatus = () => ({ ok: true, skill: "sword" });
w.dummyRate = () => 1;
w.addSkillTries = () => false;
w.addManaSpent = () => false;
w.playerDamage = () => ({ min: 10, max: 20 });
w.stopAcademy = () => {};
w.academyAttackDelay = () => 2000;
w.missileDir = (sx, sy, tx, ty) => {
  const ang = Math.atan2(ty - sy, tx - sx);
  const dirs = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
  const i = Math.round(ang / (Math.PI / 4));
  return dirs[((i % 8) + 8) % 8];
};

const p = {
  voc: "knight", level: 50, ml: 10, mp: 1000, stamina: 42 * 3600,
  config: {},
  exercise: {},
  skills: { sword: 10, axe: 10, club: 10, dist: 10, shield: 10, fist: 10 },
};
w.ensureTraining(p);
for (const id in w.EXERCISE_WEAPONS) p.exercise[id] = 5000;

// ---- TESTE 1: posicoes com mapa .otbm (spawn + mob) ----
const t1 = w.newAcademyTraining(p, "dummy", "exercise-bow",
  { spawn: { x: 8, y: 5 }, mob: [{ x: 10, y: 5 }] });
if (!t1.playerPos || !t1.dummyPos)
  errors.push("T1: playerPos/dummyPos ausentes com mapa");
else {
  if (Math.abs(t1.playerPos.x - (8.5 / 21)) > 1e-9)
    errors.push("T1: playerPos.x errado " + t1.playerPos.x);
  if (Math.abs(t1.dummyPos.x - (10.5 / 21)) > 1e-9)
    errors.push("T1: dummyPos.x errado " + t1.dummyPos.x);
}

// ---- TESTE 2: fallback sem mapa -> posicoes fixas ----
const t2 = w.newAcademyTraining(p, "dummy", "exercise-sword", null);
if (!t2.playerPos || !t2.dummyPos)
  errors.push("T2: fallback sem posicoes");
else {
  if (Math.abs(t2.playerPos.x - 0.28) > 1e-9 || Math.abs(t2.dummyPos.x - 0.70) > 1e-9)
    errors.push("T2: posicoes de fallback erradas");
}

// ---- TESTE 3: dirFromDelta ----
const dirTests = [
  [1, 0, "e"], [-1, 0, "w"], [0, 1, "s"], [0, -1, "n"],
  [0.5, 0.5, "e"], [-0.5, 0.5, "s"], [0.5, -0.5, "e"], [-0.5, -0.5, "n"],
];
for (const [dx, dy, want] of dirTests) {
  const got = w.dirFromDelta(dx, dy);
  if (got !== want) errors.push(`T3: dirFromDelta(${dx},${dy}) = ${got}, esperava ${want}`);
}

// ---- TESTE 4: projétil por weapon (golpe no dummy) ----
const esperado = {
  "exercise-sword": { kind: "melee",  missile: "whirlwind-sword", fx: "hit-area",      lunge: 1.0 },
  "exercise-axe":   { kind: "melee",  missile: "whirlwind-axe",   fx: "hit-area",      lunge: 1.0 },
  "exercise-club":  { kind: "melee",  missile: "whirlwind-club",  fx: "hit-area",      lunge: 1.0 },
  "exercise-bow":   { kind: "ranged", missile: "arrow",           fx: "hit-area",      lunge: 0.25 },
  "exercise-rod":   { kind: "cast",   missile: "small-ice",       fx: "ice-attack",    lunge: 0.25 },
  "exercise-wand":  { kind: "cast",   missile: "energy",          fx: "energy-hit",    lunge: 0.25 },
  "exercise-shield":{ kind: "shield", missile: null,              fx: "bash-shield",   lunge: 0.55 },
  "exercise-wraps": { kind: "fist",   missile: null,              fx: "fist-thousand", lunge: 1.35 },
};
for (const id of Object.keys(esperado)) {
  p.exercise[id] = 5000;
  const t = w.newAcademyTraining(p, "dummy", id,
    { spawn: { x: 8, y: 5 }, mob: [{ x: 10, y: 5 }] });
  t.hitCd = 0;
  const antes = p.exercise[id];
  w.academyTrainingTick(t, p, 100, Date.now());
  const e = esperado[id];
  if (p.exercise[id] !== antes - 1)
    errors.push(`T4 ${id}: nao consumiu 1 carga (${antes} -> ${p.exercise[id]})`);
  if (t.facing !== "e")
    errors.push(`T4 ${id}: facing = ${t.facing}, esperava "e"`);
  if (!t.proj)
    errors.push(`T4 ${id}: proj nao criado`);
  else {
    if (t.proj.kind !== e.kind) errors.push(`T4 ${id}: kind ${t.proj.kind} != ${e.kind}`);
    if (t.proj.missile !== e.missile) errors.push(`T4 ${id}: missile ${t.proj.missile} != ${e.missile}`);
    if (t.proj.fx !== e.fx) errors.push(`T4 ${id}: fx ${t.proj.fx} != ${e.fx}`);
    if (t.proj.lunge !== e.lunge) errors.push(`T4 ${id}: lunge ${t.proj.lunge} != ${e.lunge}`);
    if (t.proj.dir !== "e") errors.push(`T4 ${id}: dir do proj ${t.proj.dir} != "e"`);
    if (t.proj.dur <= 0) errors.push(`T4 ${id}: dur invalida`);
  }
  if (t.lungeT <= 0) errors.push(`T4 ${id}: lungeT nao setado`);
}

// ---- TESTE 5: sem cargas -> nao cria projétil nem consome ----
const t5 = w.newAcademyTraining(p, "dummy", "exercise-sword",
  { spawn: { x: 8, y: 5 }, mob: [{ x: 10, y: 5 }] });
p.exercise["exercise-sword"] = 0;
t5.hitCd = 0;
w.academyTrainingTick(t5, p, 100, Date.now());
if (t5.proj) errors.push("T5: criou proj com 0 cargas");
if (p.exercise["exercise-sword"] < 0) errors.push("T5: cargas negativas");

// ---- TESTE 6: golpe consome e segue o ciclo (2 golpes) ----
p.exercise["exercise-club"] = 2;
const t6 = w.newAcademyTraining(p, "dummy", "exercise-club",
  { spawn: { x: 8, y: 5 }, mob: [{ x: 10, y: 5 }] });
t6.hitCd = 0;
w.academyTrainingTick(t6, p, 100, Date.now());
const restantes = p.exercise["exercise-club"];
t6.hitCd = 0;
t6.proj = null;
w.academyTrainingTick(t6, p, 100, Date.now());
if (p.exercise["exercise-club"] !== restantes - 1)
  errors.push(`T6: 2o golpe nao consumiu (${restantes} -> ${p.exercise["exercise-club"]})`);

// ---- TESTE 7: drawAcademy não quebra com projétil de cada weapon ----
load("js/render.js");
// `const Sprites` vive no escopo léxico do contexto (não vira window.*):
// muta as propriedades de dentro do próprio contexto.
vm.runInContext(`
  Sprites.ground = () => null;
  Sprites.missile = () => null;   // cai no fallback de risco luminoso
  Sprites.get = () => null;
  Sprites.fx = () => null;
  Sprites.walk = () => null;
  Sprites.outfit = () => null;
  Sprites.mob = () => null;
`, ctx);
w.OutfitRenderer = { forPlayer: () => null, preview: () => null, frameCount: () => 2 };
w.spriteReady = () => false;
w.spriteW = () => 0;
w.spriteH = () => 0;
w.drawPlayerStatus = () => {};
w.drawTileCharMap = () => {};
w.fmtFull = (n) => String(n);
w.renderAll = () => {};
const canvasEl = w.document.createElement("canvas");
canvasEl.width = 840; canvasEl.height = 520;
const renderer = new w.Renderer(canvasEl);
renderer.ctx = ctxStub;
renderer.drawSpeech = () => {};
for (const id of Object.keys(esperado)) {
  const t = w.newAcademyTraining(p, "dummy", id,
    { spawn: { x: 8, y: 5 }, mob: [{ x: 10, y: 5 }] });
  t.hitCd = 0;
  w.academyTrainingTick(t, p, 100, Date.now());
  try {
    renderer.drawAcademy(t, p, 16);
    // sem mapa (fallback procedural) também não pode quebrar
    const tFb = w.newAcademyTraining(p, "dummy", id, null);
    tFb.hitCd = 0;
    w.academyTrainingTick(tFb, p, 100, Date.now());
    renderer.drawAcademy(tFb, p, 16);
  } catch (e) {
    errors.push(`T7 drawAcademy ${id}: ${e.message}`);
  }
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 40)) console.log("  - " + e);
  process.exit(1);
}
console.log("EXERCISE ANIM OK — facing, projétil por weapon, cargas e posicoes validados");
process.exit(0);
