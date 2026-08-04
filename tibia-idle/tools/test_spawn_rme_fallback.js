/* Teste das correções de spawn designado (RME) e fallback de sprites:
 * 1) spawnWave nasce EXATAMENTE nas células G marcadas no RME;
 * 2) tilemap: id com TILE_ANIM mas SEM strip _anim.png cai na sprite
 *    estática (o tile NUNCA some do mapa);
 * 3) rme-anim: não quebra quando TILE_ANIM é undefined (RME sem data). */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="modal"></div><div id="tooltip"></div><div id="ctx-menu"></div>
<div id="hunts"></div><div id="log"></div>
<canvas id="scene" width="840" height="520"></canvas>
<div id="cv"><canvas id="cv" width="100" height="100"></canvas></div>
<div id="pal-list"><div class="pal-row" data-id="105"><div class="pal-icon"></div></div></div>
</body></html>`, { url: "http://localhost/", pretendToBeVisual: true });
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

// ============ TESTE 3: rme-anim sem TILE_ANIM (não pode quebrar) =========
try {
  w.__rmeState = { cells: {}, cellPx: () => 64 };
  w.__rmeCellPx = () => 64;
  w.__rmePadPx = () => 64;
  w.__rmeAfterRender = function () {};
  // SEM window.TILE_ANIM definido (RME sem tileanimdata)
  load("rme/rme-anim.js");
} catch (e) { errors.push("rme-anim sem TILE_ANIM: " + e.message); }

// ============ TESTE 2: tilemap fallback =========
// TILE_ANIM com um id que NÃO tem strip no repo (ex: 10026)
w.TILE_ANIM = { "10026": { af: 3, aw: 30, ah: 30 } };
w.ASSET_VERSION = "1";
load("js/tilemap.js");
try {
  // Image stub: simula 404 para _anim.png e sucesso para .png
  const origImage = w.Image;
  w.Image = class {
    constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
    set src(v) {
      this._src = v;
      // _anim.png (nao existe) -> onerror; .png -> onload com 32x32
      setTimeout(() => {
        if (v.indexOf("_anim.png") !== -1) {
          this.naturalWidth = 0;
          if (this.onerror) this.onerror();
        } else {
          this.complete = true;
          this.naturalWidth = 32;
          this.naturalHeight = 32;
          if (this.onload) this.onload();
        }
      }, 0);
    }
    get src() { return this._src; }
  };
  // TileSprites e `const` no escopo do tilemap.js -> acessa via eval
  const ts = vm.runInContext("TileSprites", ctx);
  // 1o get com anim (strip 404) -> deve trocar para estatica
  const img = ts.get(10026, 0);
  // espera o onerror (setTimeout 0)
  setTimeout(() => {
    try {
      // _anim deve estar marcado como broken -> _anim() retorna null
      const a = ts._anim(10026);
      if (a !== null) { errors.push("tilemap: id nao marcado como broken"); }
      // draw deve desenhar a estatica (retorna true)
      const ok = ts.draw(ctxStub, 10026, 0, 0, 32);
      if (!ok) errors.push("tilemap: draw retornou false (tile sumiu)");
      else console.log("TILEMAP FALLBACK OK — id sem strip usa estatica");
    } catch (e) { errors.push("tilemap fallback: " + e.message); }
  }, 20);
} catch (e) { errors.push("teste tilemap: " + e.message); }

// ============ TESTE 1: spawn nas posições designadas do RME =========
w.GAMEDATA = {
  hunts: {
    nagas: { name: "Nagas", level: 320, monsters: ["naga-warrior", "naga-archer", "makara"], pack: 3, respawn: 0.8, avgExp: 3000, avgHp: 3200, avgArmor: 50, avgDamage: 270, avgGold: 18 },
  },
  monsters: {
    "naga-warrior": { name: "Naga Warrior", hp: 3400, exp: 1700, damage: 340, armor: 36, element: "physical", attackSpeed: 2000 },
    "naga-archer": { name: "Naga Archer", hp: 3000, exp: 3000, damage: 280, armor: 40, element: "energy", attackSpeed: 2000 },
    makara: { name: "Makara", hp: 5050, exp: 5720, damage: 455, armor: 74, element: "physical", attackSpeed: 2000 },
  },
  items: {},
};
w.MOBSHEETS = {
  "naga-warrior": { cw: 54, ch: 54, cols: 3, rows: 4 },
  "naga-archer": { cw: 48, ch: 48, cols: 3, rows: 4 },
  makara: { cw: 63, ch: 63, cols: 9, rows: 4 },
};
w.MONSTERMOVES = {};
w.ELEMENTS = { physical: { name: "F", color: "#fff", fx: "block-hit" }, fire: { name: "Fg", color: "#f80", fx: "hit-by-fire" }, energy: { name: "E", color: "#c0f", fx: "energy-damage" }, earth: { name: "T", color: "#8c8", fx: "hit-by-poison" }, ice: { name: "G", color: "#7ef", fx: "ice-attack" }, death: { name: "M", color: "#a5a", fx: "mort-area" }, holy: { name: "S", color: "#fe8", fx: "holy-damage" } };
w.ELEMENT_MISSILE = {};
w.CONDITIONS = { poison: { el: "earth", fx: "x" }, fire: { el: "fire", fx: "x" }, energy: { el: "energy", fx: "x" }, bleed: { el: "physical", fx: "x" }, cursed: { el: "death", fx: "x" }, freezing: { el: "ice", fx: "x" } };
w.playerDefense = () => ({ armor: 10, defense: 10, shielding: 10, protection: 0 });
w.applyPlayerMitigation = (p, el, r) => r;
w.applyPlayerResist = (p, el, r) => r;
w.applyMagicShieldAbsorb = (c, p, r) => r;
w.mantraAbsorve = (p, r) => r;
w.buffTotals = () => ({ dmgReceived: 1 });
w.stanceTotals = () => ({ dmgReceived: 1 });
w.forgeIncomingDamageMul = () => 1;
w.imbProtection = () => 0;

for (const f of ["js/grid.js", "js/gridai.js", "js/combat.js"]) load(f);

try {
  const p = { name: "T", voc: "knight", level: 320, hp: 50000, mp: 500, stamina: 100000,
              skills: { sword: 80, dist: 80, shield: 80, club: 80, axe: 80, fist: 80, magic: 50 },
              bag: {}, equip: {}, config: {}, lootPouch: {} };
  const c = w.newCombat(p, "nagas", "non-pvp");
  c.player.cx = 10; c.player.cy = 12;   // spawn do mapa marapur_nagas
  c.player.x = (10.5) / 21; c.player.y = (12.5) / 13;
  // zona G designada no RME (exemplo: 3 celulas)
  c.huntMap = { mob: [{ x: 8, y: 8 }, { x: 10, y: 8 }, { x: 12, y: 8 }, { x: 9, y: 9 }, { x: 11, y: 9 }] };
  w.spawnWave(c, p);
  // aguarda o tick da fila (nascem todos)
  for (const sp of c.pendingSpawns) sp.startedAt = Date.now() - 5000;
  w.tickSpawnQueue(c);
  const pos = c.mobs.map((m) => m.cx + ":" + m.cy).sort();
  const zona = new Set(c.huntMap.mob.map((z) => z.x + ":" + z.y));
  console.log("spawns:", pos.join(", "));
  if (c.mobs.length !== 3) errors.push("spawn: esperava 3 mobs, tem " + c.mobs.length);
  for (const k of pos) {
    if (!zona.has(k)) errors.push("spawn: " + k + " fora da zona G designada");
  }
  // cada mob numa célula distinta
  if (new Set(pos).size !== pos.length) errors.push("spawn: dois mobs na mesma célula");
  if (errors.length === 0) console.log("SPAWN RME OK — nasceu exatamente nas células G designadas");
} catch (e) { errors.push("teste spawn: " + (e.stack || e.message)); }

setTimeout(() => {
  if (errors.length) {
    console.log("ERROS (" + errors.length + "):");
    for (const e of errors.slice(0, 20)) console.log("  - " + e);
    process.exit(1);
  }
  console.log("TUDO OK — fallback de sprites + respawn nas posicoes do RME");
  process.exit(0);
}, 60);
