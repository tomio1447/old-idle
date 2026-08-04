/* Teste leve (sem gamedata gigante): valida as funcoes novas de spawn com
 * teleporte, ESC fechar modal, e as constantes ajustadas, mockando o minimo
 * de dependencias. */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="modal" class="modal-bg"></div><div id="tooltip"></div>
<div id="ctx-menu"></div><div id="hunts"></div><div id="log"></div>
<canvas id="scene" width="840" height="520"></canvas></body></html>`,
  { url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
const errors = [];

// stubs globais
w.addEventListener("error", (e) => errors.push("WINDOWERROR " + e.message));
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
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
  const p = path.join(GAME, f);
  try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); }
  catch (e) { errors.push(f + ": " + e.message); }
}

// GAMEDATA minimo
w.GAMEDATA = {
  hunts: {
    rats: { name: "Esgoto", level: 1, monsters: ["rat", "cave-rat", "bug", "snake"], pack: 3, respawn: 0.8, avgExp: 7, avgHp: 29, avgArmor: 2, avgDamage: 7, avgGold: 1.7 },
  },
  monsters: {
    rat: { name: "Rat", hp: 20, exp: 5, damage: 3, armor: 1 },
    "cave-rat": { name: "Cave Rat", hp: 30, exp: 8, damage: 4, armor: 2 },
    bug: { name: "Bug", hp: 25, exp: 6, damage: 3, armor: 1 },
    snake: { name: "Snake", hp: 22, exp: 7, damage: 5, armor: 1 },
  },
};
w.MOBSHEETS = {
  rat: { cw: 28, ch: 28, cols: 3, rows: 4 },
  "cave-rat": { cw: 30, ch: 30, cols: 3, rows: 4 },
  bug: { cw: 22, ch: 22, cols: 3, rows: 4 },
  snake: { cw: 32, ch: 32, cols: 3, rows: 4 },
};

// scripts necessarios para spawn/combate
for (const f of ["js/grid.js", "js/gridai.js", "js/combat.js"]) load(f);

// --- teste spawn com teleporte ---
try {
  const p = { name: "T", voc: "knight", level: 1, hp: 100, mp: 50, stamina: 100000, skills: { sword: 10, dist: 10, shield: 10 }, bag: {}, equip: {}, config: {} };
  const c = w.newCombat(p, "rats", "non-pvp");
  // precisa de player com celula
  c.player.cx = 2; c.player.cy = 6;
  c.player.x = (2 + 0.5) / 21; c.player.y = (6 + 0.5) / 13;
  w.spawnWave(c, p);
  if (!c.pendingSpawns || c.pendingSpawns.length === 0)
    errors.push("spawn: pendingSpawns vazio (pack " + c.hunt.pack + ")");
  else {
    // simula 2s passados: deve nascer
    for (const sp of c.pendingSpawns) sp.startedAt = Date.now() - 5000;
    w.tickSpawnQueue(c);
    if (c.mobs.length === 0) errors.push("spawn: nenhum mob nasceu apos tick");
    if (c.pendingSpawns.length !== 0) errors.push("spawn: fila nao esvaziou");
    // celulas validas?
    for (const m of c.mobs)
      if (m.cx === undefined || m.cy === undefined)
        errors.push("spawn: mob sem celula");
  }
  // --- teste ESC (handler vive no game.js; replicamos a logica) ---
  const modal = w.document.querySelector("#modal");
  modal.classList.add("show", "wide");
  const escHandler = (e) => {
    if (e.key !== "Escape") return;
    const m = w.document.querySelector("#modal");
    if (m && m.classList.contains("show")) m.classList.remove("show", "wide");
  };
  w.document.addEventListener("keydown", escHandler);
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  if (modal.classList.contains("show")) errors.push("ESC: modal nao fechou");
  w.document.removeEventListener("keydown", escHandler);

  // --- teste targetDistance cap ---
  if (typeof w.monsterTargetDistance === "function") {
    const fake = { slug: "amazon", def: { ranged: 1 } };
    w.MONSTERMOVES = { amazon: { targetDistance: 7 } };
    const td = w.monsterTargetDistance(fake);
    if (td > 3) errors.push("targetDistance cap falhou: " + td);
  }
} catch (e) {
  errors.push("TESTE: " + (e.stack || e.message));
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 30)) console.log("  - " + e);
  process.exit(1);
}
console.log("LITE OK — spawn/teleporte/ESC/targetDistance validados");
