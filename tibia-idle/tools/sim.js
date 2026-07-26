/*
 * sim.js — harness de simulacao offline para balancear o jogo.
 * Uso: node tools/sim.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const GAME = path.join(__dirname, "..", "game");

const ctx = { window: {}, console, Math, Date, JSON,
              performance: { now: Date.now } };
vm.createContext(ctx);
for (const f of ["js/gamedata.js", "js/core.js", "js/player.js", "js/combat.js"]) {
  vm.runInContext(fs.readFileSync(path.join(GAME, f), "utf8"), ctx,
                  { filename: f });
}

/* Todo o codigo de simulacao roda DENTRO do contexto para enxergar os `const`. */
const SIM = `
var GAMEDATA = window.GAMEDATA;

function makeChar(voc, level, gear) {
  var p = newPlayer("Sim", voc, "male");
  p.level = level;
  p.exp = expForLevel(level);
  var sk = Math.min(120, 10 + Math.floor(level * 0.62));
  var shield = Math.min(120, 10 + Math.floor(level * 0.5));
  ["sword","axe","club","dist","fist"].forEach(function(k){ p.skills[k] = sk; });
  p.skills.shield = shield;
  p.ml = (voc === "sorcerer" || voc === "druid")
    ? Math.min(110, Math.floor(level * 0.55)) : Math.floor(level * 0.12);
  (gear || []).forEach(function(slug){
    addItem(p, slug, slug === "arrow" ? 999 : 1);
  });
  autoEquip(p);
  var m = maxStats(p);
  p.hp = m.hp; p.mp = m.mp;
  return p;
}

function run(p, huntId, hours, supplies) {
  var c = newCombat(p, huntId);
  spawnWave(c, p);
  if (supplies) for (var k in supplies) p.supplies[k] = supplies[k];
  var ticks = Math.floor((hours * 3600 * 1000) / TICK);
  var t = Date.now();
  var startExp = p.exp, startLevel = p.level, startGold = p.gold;
  for (var i = 0; i < ticks; i++) {
    combatTick(c, p, TICK, t);
    t += TICK;
    c.events.length = 0;
    if (i % 600 === 0) { autoSell(p); autoRestock(p); }
  }
  autoSell(p);
  return { exp: p.exp - startExp, levels: p.level - startLevel,
    gold: p.gold - startGold, kills: c.stats.kills, deaths: c.stats.deaths,
    taken: c.stats.taken, supplyCost: c.stats.supplyCost,
    finalLevel: p.level };
}

function estimate(p, hu) {
  var d = playerDamage(p);
  var dps = ((d.min + d.max) / 2) / 2.0;
  var ttk = Math.max(0.6, (hu.avgHp + hu.avgArmor * 3) / Math.max(1, dps));
  return (3600 / (ttk + 0.8)) * hu.avgExp;
}

var GEAR = {
  start: ["sword","brass-armor","brass-helmet","wooden-shield","leather-legs","leather-boots"],
  mid: ["knight-axe","plate-armor","steel-helmet","battle-shield","plate-legs","leather-boots","dragon-necklace","power-ring"],
  high: ["fire-sword","dragon-scale-mail","royal-helmet","dragon-shield","knight-legs","boots-of-haste","platinum-amulet","might-ring"],
  top: ["magic-longsword","magic-plate-armor","demon-helmet","demon-shield","golden-legs","golden-boots","demonbone-amulet","ring-of-healing"],
  magestart: ["wooden-wand","leather-armor","leather-helmet","leather-legs","leather-boots"],
  magemid: ["ritual-wand","blue-robe","mystic-turban","spellbook","plate-legs","leather-boots","elven-amulet","crystal-ring"],
  magetop: ["arcane-staff","magic-plate-armor","hat-of-the-mad","spellbook","golden-legs","boots-of-haste","starlight-amulet","ring-of-the-sky"],
  paladin: ["bow","arrow","plate-armor","steel-helmet","plate-legs","boots-of-haste","dragon-necklace","power-ring"]
};

var SCENARIOS = [
  ["knight",8,"start","rats"], ["knight",15,"start","trolls"],
  ["knight",25,"mid","orcs"], ["knight",40,"mid","minotaurs"],
  ["knight",60,"high","cyclops"], ["knight",90,"high","undead"],
  ["knight",130,"top","giant-spiders"], ["knight",200,"top","heroes"],
  ["knight",300,"top","dragonlords"], ["knight",450,"top","inferno"],
  ["sorcerer",15,"magestart","trolls"], ["sorcerer",40,"magemid","minotaurs"],
  ["sorcerer",90,"magemid","undead"], ["sorcerer",200,"magetop","heroes"],
  ["sorcerer",450,"magetop","inferno"],
  ["druid",90,"magemid","undead"],
  ["paladin",90,"paladin","undead"], ["paladin",200,"paladin","heroes"]
];

function pad(s,n){ s=String(s); while(s.length<n) s=" "+s; return s; }
function padr(s,n){ s=String(s); while(s.length<n) s=s+" "; return s; }

console.log("voc       nv   hunt              XP/h    gold liq/h  kills/h  mortes  supply/h");
console.log(new Array(90).join("-"));
SCENARIOS.forEach(function(sc){
  var p = makeChar(sc[0], sc[1], GEAR[sc[2]]);
  p.gold = 50000;
  var sup = { "intense-healing-rune": 50, "ultimate-healing-rune": 30 };
  var r = run(p, sc[3], 1, sup);
  console.log(padr(sc[0],9), pad(sc[1],3), " " + padr(sc[3],16),
    pad(Math.round(r.exp),9), pad(Math.round(r.gold),9),
    pad(r.kills,7), pad(r.deaths,6), pad(Math.round(r.supplyCost),9));
});

console.log("");
console.log("== Progressão do nível 8 em diante (sempre na melhor hunt) ==");
["knight","sorcerer","paladin"].forEach(function(voc){
  var gearKey = voc === "sorcerer" ? "magestart" : voc === "paladin" ? "paladin" : "start";
  var p = makeChar(voc, 8, GEAR[gearKey]);
  var hoursTotal = 0;
  var marks = [20,40,60,80,100,150,200];
  var mi = 0;
  var out = [];
  for (var h = 0; h < 400 && mi < marks.length; h++) {
    var best = null, bestExp = -1;
    for (var id in GAMEDATA.hunts) {
      var hu = GAMEDATA.hunts[id];
      if (p.level < hu.level) continue;
      var e = estimate(p, hu);
      if (e > bestExp) { bestExp = e; best = id; }
    }
    p.stamina = 42*3600;
    run(p, best, 1, null);
    // simula upgrade de gear conforme sobe
    if (p.level >= 30) (GEAR[voc==="sorcerer"?"magemid":voc==="paladin"?"paladin":"mid"]).forEach(function(s){ if(!p.bag[s]) addItem(p,s,1); });
    if (p.level >= 80) (GEAR[voc==="sorcerer"?"magetop":voc==="paladin"?"paladin":"high"]).forEach(function(s){ if(!p.bag[s]) addItem(p,s,1); });
    autoEquip(p);
    hoursTotal++;
    while (mi < marks.length && p.level >= marks[mi]) {
      out.push("nv " + marks[mi] + ": " + hoursTotal + "h");
      mi++;
    }
  }
  if (mi < marks.length) out.push("parou no nv " + p.level + " após " + hoursTotal + "h");
  console.log(padr(voc,10), out.join("  ·  "));
});
`;

vm.runInContext(SIM, ctx, { filename: "sim" });
