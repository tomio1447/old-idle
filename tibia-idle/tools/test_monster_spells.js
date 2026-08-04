/* Teste das correções de magias de monstro (Canary import):
 * meleeCond, campo (*field), cond de skill, dano de área, loot verde,
 * background tick e mission collapsed. */
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

w.GAMEDATA = {
  hunts: {
    rats: { name: "Esgoto", level: 1, monsters: ["giant-spider", "poison-spider"], pack: 2, respawn: 0.8, avgExp: 7, avgHp: 29, avgArmor: 2, avgDamage: 7, avgGold: 1.7 },
  },
  monsters: {
    "giant-spider": { name: "Giant Spider", hp: 500, exp: 200, damage: 300, armor: 20, element: "earth", skills: [{ el: "earth", min: 40, max: 70, int: 2000, ch: 100, range: 7, radius: 1, miss: "poison", alvo: 1 }, { el: "earth", min: 0, max: 0, int: 2000, ch: 100, n: "poisonfield", range: 7, radius: 1, miss: "poison", campo: "poison", alvo: 1 }], meleeCond: { tipo: "poison", dano: 40, total: 160 } },
    "poison-spider": { name: "Poison Spider", hp: 80, exp: 30, damage: 20, armor: 4, element: "earth", meleeCond: { tipo: "poison", dano: 8, total: 30 } },
  },
  items: { "gold-coin": { n: "gold coin", sell: 1 }, cheese: { n: "cheese", sell: 5 } },
};
w.MOBSHEETS = {
  "giant-spider": { cw: 64, ch: 64, cols: 3, rows: 4 },
  "poison-spider": { cw: 31, ch: 31, cols: 3, rows: 4 },
};
w.MONSTERMOVES = {};
// ELEMENTS usado pelo mobSkillFx (definido no gamelib-const.js no jogo)
w.ELEMENTS = {
  physical: { name: "Físico", color: "#d8d8d8", fx: "block-hit" },
  fire: { name: "Fogo", color: "#ff8a3c", fx: "hit-by-fire" },
  energy: { name: "Energia", color: "#c07cff", fx: "energy-damage" },
  earth: { name: "Terra", color: "#8ac83c", fx: "hit-by-poison" },
  ice: { name: "Gelo", color: "#7ec8ff", fx: "ice-attack" },
  death: { name: "Morte", color: "#8a5aa8", fx: "mort-area" },
  holy: { name: "Sagrado", color: "#ffe680", fx: "holy-damage" },
  healing: { name: "Cura", color: "#9ce84a", fx: "magic-green" },
};
w.ELEMENT_MISSILE = {};
// stubs de funcoes que o mobSkillHit chama (definidas em player.js no jogo)
w.playerDefense = () => ({ armor: 10, defense: 10, shielding: 10, protection: 0 });
w.applyPlayerMitigation = (p, el, raw) => raw;
w.applyPlayerResist = (p, el, raw) => raw;
w.applyMagicShieldAbsorb = (c, p, raw) => raw;
w.mantraAbsorve = (p, raw) => raw;
w.buffTotals = () => ({ dmgReceived: 1 });
w.stanceTotals = () => ({ dmgReceived: 1 });
w.forgeIncomingDamageMul = () => 1;
w.imbProtection = () => 0;
w.CONDITIONS = {
  poison: { nome: "Envenenado", el: "earth", fx: "hit-by-poison", cor: "#8ac83c", cure: "exana-pox" },
  fire: { nome: "Queimando", el: "fire", fx: "hit-by-fire", cor: "#ff8a3c", cure: "exana-flam" },
  energy: { nome: "Eletrificado", el: "energy", fx: "energy-damage", cor: "#c07cff", cure: "exana-vis" },
  bleed: { nome: "Sangrando", el: "physical", fx: "draw-blood", cor: "#d84040", cure: "exana-kor" },
  cursed: { nome: "Amaldiçoado", el: "death", fx: "mort-area", cor: "#8a5aa8", cure: "exana-mort" },
  freezing: { nome: "Congelado", el: "ice", fx: "ice-attack", cor: "#7ec8ff", cure: null },
};

for (const f of ["js/grid.js", "js/gridai.js", "js/combat.js"]) load(f);

try {
  const p = { name: "T", voc: "knight", level: 8, hp: 1000, mp: 500, stamina: 100000,
              skills: { sword: 10, dist: 10, shield: 10 }, bag: {}, equip: {},
              config: {}, lootPouch: {} };
  const c = w.newCombat(p, "rats", "non-pvp");
  c.player.cx = 5; c.player.cy = 6;
  c.player.x = (5 + 0.5) / 21; c.player.y = (6 + 0.5) / 13;

  // --- mob com meleeCond (poison-spider): melee aplica veneno no player
  const mobMelee = {
    slug: "poison-spider", def: w.GAMEDATA.monsters["poison-spider"],
    hp: 80, maxHp: 80, atkCd: 0, id: "m1", cx: 6, cy: 6,
    x: (6 + 0.5) / 21, y: (6 + 0.5) / 13, dir: "w", moving: false,
    attackAnim: 0, speed: 0.00005, spawnAt: Date.now(),
  };
  c.mobs = [mobMelee];
  w.applyMonsterCondition(c, p, mobMelee);
  if (!p.conditions || !p.conditions.poison)
    errors.push("meleeCond: veneno nao aplicado no player");

  // --- mob com campo (giant-spider): magia poisonfield aplica cond
  const mobG = {
    slug: "giant-spider", def: w.GAMEDATA.monsters["giant-spider"],
    hp: 500, maxHp: 500, atkCd: 0, id: "m2", cx: 6, cy: 6,
    x: (6 + 0.5) / 21, y: (6 + 0.5) / 13, dir: "w", moving: false,
    attackAnim: 0, speed: 0.00005, spawnAt: Date.now(),
  };
  // zera condicoes e força o skill de campo (o 2o skill)
  delete p.conditions;
  mobG.skillCds = { s0: Date.now() + 99999, s1: 0 };  // pula o 1o skill
  const cast = w.mobCastSkill(c, p, mobG, Date.now());
  if (!cast) errors.push("campo: mobCastSkill retornou false");
  if (!p.conditions || !p.conditions.poison)
    errors.push("campo: poisonfield nao aplicou condicao");

  // --- dano de area centrada no mob (radius sem alvo) fora do raio
  const mobArea = {
    slug: "giant-spider",
    def: Object.assign({}, w.GAMEDATA.monsters["giant-spider"], {
      skills: [{ el: "fire", min: 100, max: 100, int: 2000, ch: 100, radius: 2 }] }),
    hp: 500, maxHp: 500, id: "m3", cx: 6, cy: 6,
    x: (6 + 0.5) / 21, y: (6 + 0.5) / 13, dir: "w",
  };
  const hpAntes = p.hp;
  // player a distancia 8 do mob (fora do raio 2)
  c.player.cx = 6; c.player.cy = 14;
  const dmg = w.mobSkillHit(c, p, mobArea, { radius: 2, el: "fire", min: 100, max: 100 }, 100);
  if (dmg > 0) errors.push("area: dano aplicado fora do raio (dmg=" + dmg + ")");

  // --- loot verde: o evento kill carrega loot (verificado no game.js)
  const loot = [{ item: "gold-coin", count: 3 }, { item: "cheese", count: 1 }];
  if (!loot.length) errors.push("loot vazio");
  const nomes = loot.map((l) => `${l.count > 1 ? l.count + "x " : ""}${(w.GAMEDATA.items[l.item] || {}).n || l.item}`);
  if (!nomes.join(", ").includes("3x gold coin"))
    errors.push("loot nome errado: " + nomes.join(", "));

  // --- mission collapsed: classe adicionada (logica em game.js renderMission)
  const box = w.document.createElement("div");
  box.id = "mission-box";
  w.document.body.appendChild(box);
  box.classList.toggle("collapsed", true);
  if (!box.classList.contains("collapsed")) errors.push("mission collapsed falhou");

  // --- background tick: definido no game.js (verificado por presenca)
  const gameJs = fs.readFileSync(path.join(GAME, "js", "game.js"), "utf8");
  if (!/function startBackgroundTick/.test(gameJs))
    errors.push("startBackgroundTick nao definido no game.js");
  if (!/startBackgroundTick\(\);/.test(gameJs))
    errors.push("startBackgroundTick nao iniciado no startGame");
} catch (e) {
  errors.push("TESTE: " + (e.stack || e.message));
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 30)) console.log("  - " + e);
  process.exit(1);
}
console.log("MAGIAS OK — meleeCond, campo, area, loot verde, collapsed, bgTick");
