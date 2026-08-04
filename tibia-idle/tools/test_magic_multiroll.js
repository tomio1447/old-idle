/* Teste da correção principal das magias: o Canary rola a chance de TODAS
 * as attackSpells no mesmo turno (sem parar na primeira). Verifica que um
 * monstro com basic_attack ch=100 + magias especiais (ch 30-35) USA as
 * magias especiais ao longo de vários turnos — antes ficava só no basic. */
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
  try { vm.runInContext(fs.readFileSync(path.join(GAME, f), "utf8"), ctx, { filename: f }); }
  catch (e) { errors.push(f + ": " + e.message); }
}

// GAMEDATA minimo
w.GAMEDATA = {
  hunts: { nagas: { name: "Nagas", level: 1, monsters: ["naga-warrior"], pack: 1, respawn: 0.8, avgExp: 1700, avgHp: 2150, avgArmor: 36, avgDamage: 188, avgGold: 95 } },
  monsters: {
    "naga-warrior": {
      name: "Naga Warrior", hp: 3400, exp: 1700, damage: 340, armor: 36,
      element: "physical", attackSpeed: 2000,
      skills: [
        { el: "physical", min: 120, max: 340, int: 2000, ch: 100 },                    // basic_attack
        { el: "physical", min: 320, max: 430, int: 2500, ch: 30, range: 3 },           // eruption_strike
        { el: "physical", min: 360, max: 415, int: 3000, ch: 35, n: "nagadeathattack" }, // death_strike
        { el: "death", min: 360, max: 386, int: 3500, ch: 35, radius: 4, fx: "draw-blood" }, // great_blood_ball
      ],
    },
  },
  items: {},
};
w.MOBSHEETS = { "naga-warrior": { cw: 54, ch: 54, cols: 3, rows: 4 } };
w.MONSTERMOVES = {};
w.ELEMENTS = {
  physical: { name: "Físico", color: "#d8d8d8", fx: "block-hit" },
  fire: { name: "Fogo", color: "#ff8a3c", fx: "hit-by-fire" },
  energy: { name: "Energia", color: "#c07cff", fx: "energy-damage" },
  earth: { name: "Terra", color: "#8ac83c", fx: "hit-by-poison" },
  ice: { name: "Gelo", color: "#7ec8ff", fx: "ice-attack" },
  death: { name: "Morte", color: "#8a5aa8", fx: "mort-area" },
  holy: { name: "Sagrado", color: "#ffe680", fx: "holy-damage" },
};
w.ELEMENT_MISSILE = {};
w.CONDITIONS = {
  poison: { nome: "Envenenado", el: "earth", fx: "hit-by-poison", cor: "#8ac83c", cure: "exana-pox" },
  fire: { nome: "Queimando", el: "fire", fx: "hit-by-fire", cor: "#ff8a3c", cure: "exana-flam" },
  energy: { nome: "Eletrificado", el: "energy", fx: "energy-damage", cor: "#c07cff", cure: "exana-vis" },
  bleed: { nome: "Sangrando", el: "physical", fx: "draw-blood", cor: "#d84040", cure: "exana-kor" },
  cursed: { nome: "Amaldiçoado", el: "death", fx: "mort-area", cor: "#8a5aa8", cure: "exana-mort" },
  freezing: { nome: "Congelado", el: "ice", fx: "ice-attack", cor: "#7ec8ff", cure: null },
};
w.playerDefense = () => ({ armor: 10, defense: 10, shielding: 10, protection: 0 });
w.applyPlayerMitigation = (p, el, raw) => raw;
w.applyPlayerResist = (p, el, raw) => raw;
w.applyMagicShieldAbsorb = (c, p, raw) => raw;
w.mantraAbsorve = (p, raw) => raw;
w.buffTotals = () => ({ dmgReceived: 1 });
w.stanceTotals = () => ({ dmgReceived: 1 });
w.forgeIncomingDamageMul = () => 1;
w.imbProtection = () => 0;

for (const f of ["js/grid.js", "js/gridai.js", "js/combat.js"]) load(f);

try {
  const p = { name: "T", voc: "knight", level: 320, hp: 500000, mp: 500000, stamina: 100000,
              skills: { sword: 80, dist: 80, shield: 80, club: 80, axe: 80, fist: 80, magic: 50 },
              bag: {}, equip: {}, config: {}, lootPouch: {} };
  const c = w.newCombat(p, "nagas", "non-pvp");
  c.player.cx = 5; c.player.cy = 6;
  c.player.x = (5 + 0.5) / 21; c.player.y = (6 + 0.5) / 13;

  // mob naga-warrior a distancia 2 (dentro do range 3 da eruption_strike)
  const mob = {
    slug: "naga-warrior", def: w.GAMEDATA.monsters["naga-warrior"],
    hp: 3400, maxHp: 3400, atkCd: 0, id: "naga",
    cx: 7, cy: 6, x: (7 + 0.5) / 21, y: (6 + 0.5) / 13,
    dir: "w", moving: false, attackAnim: 0, speed: 0.00005, spawnAt: Date.now(),
  };
  c.mobs = [mob];

  // simula 2000 turnos (cooldowns limpos entre turnos; hp regenerado a cada
  // turno para o player nunca morrer no meio do teste)
  const usos = { s0: 0, s1: 0, s2: 0, s3: 0 };
  let t = Date.now();
  for (let turno = 0; turno < 2000; turno++) {
    p.hp = 500000;   // regen: o teste mede chance de uso, nao sobrevivencia
    mob.skillCds = {};
    w.mobCastSkill(c, p, mob, t + turno * 2000);
    for (const k of Object.keys(mob.skillCds)) usos[k] = (usos[k] || 0) + 1;
  }

  console.log("usos (2000 turnos):", JSON.stringify(usos));
  // s0 (ch=100) sempre passa -> ~2000. s1 (ch=30) ~600. s2/s3 (ch=35) ~700.
  // Tolerancia ampla (metade do esperado) para nao dar falso negativo.
  if (usos.s0 < 1500) errors.push("basic_attack pouco usado: " + usos.s0 + " (esperado ~2000)");
  if (usos.s1 < 300) errors.push("eruption_strike pouco usada: " + usos.s1 + " (esperado ~600)");
  if (usos.s2 < 300) errors.push("death_strike pouco usada: " + usos.s2 + " (esperado ~700)");
  if (usos.s3 < 300) errors.push("blood_ball pouco usada: " + usos.s3 + " (esperado ~700)");
} catch (e) {
  errors.push("TESTE: " + (e.stack || e.message));
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 20)) console.log("  - " + e);
  process.exit(1);
}
console.log("MAGIAS MULTI-ROLL OK — naga-warrior usa basic + especiais no mesmo turno");
