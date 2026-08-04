/* Teste das correções: tier badge no topo, overlay de login escondido no
 * jogo, e tryHaste respeitando p.config.hasteSpell. */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="client-version-label"></div>
<div id="app"></div><div id="modal"></div><div id="tooltip"></div>
<div id="ctx-menu"></div><div id="hunts"></div><div id="log"></div>
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

// ============ TESTE 1: overlay de login some no hide() =========
try {
  load("js/client-background.js");
  const BG = vm.runInContext("BG", ctx);
  // garante o init (o auto-init pode nao rodar no jsdom dependendo do
  // readyState); _buildDOM cria os elementos se nao existirem
  BG.init();
  // simula game start (o listener e registrado em window, como no game.js)
  w.dispatchEvent(new w.Event("bg-game-start"));
  const overlay = w.document.getElementById("login-overlay");
  const bg = w.document.getElementById("login-bg");
  const grid = w.document.querySelector(".bg-grid");
  const particles = w.document.getElementById("bg-particles");
  if (overlay && overlay.style.display !== "none") errors.push("overlay de login visivel no jogo (filtro escuro)");
  if (bg && bg.style.display !== "none") errors.push("login-bg visivel no jogo");
  if (grid && grid.style.display !== "none") errors.push("bg-grid visivel no jogo");
  if (particles && particles.style.display !== "none") errors.push("bg-particles visivel no jogo");
  console.log("BG HIDE OK — overlay/grid escondidos no jogo");
} catch (e) { errors.push("teste bg: " + e.message); }

// ============ TESTE 2: tier-badge no topo (CSS) =========
try {
  const css = fs.readFileSync(path.join(GAME, "css/layout.css"), "utf8");
  const m = css.match(/\.tier-badge \{\s*position: absolute;\s*(bottom|top): 0; right: 0;/);
  if (!m) errors.push("tier-badge: posicao nao encontrada no CSS");
  else if (m[1] !== "top") errors.push("tier-badge: ainda usa bottom (deveria ser top: 0; right: 0)");
  else console.log("TIER BADGE OK — top: 0; right: 0 (esquina sup. direita)");

  // badge da FORJA: .forge-client-tier-badge precisa ser top:0; right:0
  const f = css.match(/\.forge-client-tier-badge \{\s*position: absolute;\s*(bottom|top): [^;]+; right: [^;]+;/);
  if (!f) errors.push("forge tier-badge: nao encontrado");
  else if (f[1] !== "top") errors.push("forge tier-badge: ainda usa bottom (deveria ser top:0; right:0)");
  else console.log("FORGE TIER BADGE OK — top: 0; right: 0");

  // slot da forja SEM filtro escuro (grayscale/brightness)
  if (/forge-client-equip-slot \{[\s\S]*?filter: grayscale\(\.6\) brightness\(\.7\)/.test(css))
    errors.push("forge equip-slot ainda com filtro escuro");
  else console.log("FORGE SLOT OK — sem filtro grayscale/brightness escuro");
} catch (e) { errors.push("teste css: " + e.message); }

// ============ TESTE 3: tryHaste respeita hasteSpell =========
w.GAMEDATA = { hunts: {}, monsters: {}, items: {} };
w.MONSTERMOVES = {};
w.HASTEDATA = {
  "utani-hur": { cd: 2000, dur: 30000, lvl: 14, mana: 60, nome: "Haste", vocs: ["paladin"], words: "utani hur" },
  "utamo-tempo-san": { cd: 4000, dur: 10000, lvl: 55, mana: 400, nome: "Swift Foot", vocs: ["paladin"], words: "utamo tempo san" },
};
w.HASTEDATA_MAP = w.HASTEDATA;
w.SPELLS = {
  "utani-hur": { id: "utani-hur", name: "Haste", words: "utani hur", lvl: 14, mana: 60, cd: 2000, vocs: ["paladin"] },
  "utamo-tempo-san": { id: "utamo-tempo-san", name: "Swift Foot", words: "utamo tempo san", lvl: 55, mana: 400, cd: 4000, vocs: ["paladin"] },
};
w.ELEMENTS = { physical: { name: "F", color: "#fff", fx: "block-hit" } };
w.ELEMENT_MISSILE = {};
w.CONDITIONS = {};
w.hasteDelta = (p, id) => ({ "utani-hur": 23, "utamo-tempo-san": 30 }[id] || 0);
w.hasteAtiva = () => null;
w.hastesDisponiveis = () => ["utani-hur", "utamo-tempo-san"];
w.cdReady = () => true;
w.cdStart = () => {};
w.spellWords = (id) => w.SPELLS[id].words;
w.addManaSpent = () => {};
w.combatManaSkillGain = () => 0;

for (const f of ["js/grid.js", "js/gridai.js", "js/combat.js"]) load(f);

try {
  const p = { name: "RP", voc: "paladin", level: 100, mp: 1000, stamina: 100000,
              skills: { sword: 50, dist: 50, shield: 50, club: 50, axe: 50, fist: 50, magic: 30 },
              bag: {}, equip: {}, config: {} };   // SEM hasteSpell configurado
  const c = { buffs: {}, events: [], player: { cx: 5, cy: 6, x: 0.5, y: 0.5 } };
  const agora = Date.now();
  const usou = w.tryHaste(c, p, agora);
  if (usou) errors.push("tryHaste usou haste SEM configuracao (hasteSpell vazio)");
  else console.log("TRYHASTE OK — sem hasteSpell, nao lanca nada");

  // com hasteSpell configurado, lanca
  p.config.hasteSpell = "utamo-tempo-san";
  const usou2 = w.tryHaste(c, p, agora + 100);
  if (!usou2) errors.push("tryHaste nao lancou a haste escolhida");
  else if (!p.buffs || !p.buffs["utamo-tempo-san"]) errors.push("buff da haste nao aplicado");
  else console.log("TRYHASTE OK — lanca a magia escolhida no helper");
} catch (e) { errors.push("teste haste: " + (e.stack || e.message)); }

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 20)) console.log("  - " + e);
  process.exit(1);
}
console.log("TUDO OK — tier badge topo, filtro escuro removido, haste so com config");
