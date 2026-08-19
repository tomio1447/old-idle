/* Regressão: Hunt Session lateral — XP raw, loot/supply/profit, mortes/bless. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
const analyserSource = fs.readFileSync(path.join(js, "analyzers.js"), "utf8");
const combatSource = fs.readFileSync(path.join(js, "combat.js"), "utf8");
const gameSource = fs.readFileSync(path.join(js, "game.js"), "utf8");
function must(ok, msg) { if (!ok) throw Error(msg); }

must(!html.includes('id="hunt-info"') && !html.includes("Caçada atual") &&
  html.includes('id="otc-analyser-content"') && html.includes('role="tablist"') &&
  /js\/analyzers\.js\?v=/.test(html) && /js\/combat\.js\?v=/.test(html),
  "Caçada atual não foi substituída/cache-bustada pelos analytics laterais");
must(html.includes("otc-live-badge") && html.includes("data-otc-session-reset"),
  "header LIVE + reset sessão");
must(html.includes("js/analyzers.js?v=hunt-analyser-death-v1") &&
  html.includes("css/layout.css?v=hunt-analyser-death-v1") &&
  html.includes("js/combat.js?v=") &&
  html.includes("js/game.js?v="),
  "cache-bust hunt analyser death/loot");
must(!/getElementById\(["']modal["']\)|classList\.add\(["']show["']\)/.test(analyserSource) &&
  analyserSource.includes('activeOtcAnalyser = "hunting"') &&
  gameSource.includes('if (typeof renderOtcAnalyser === "function") renderOtcAnalyser()'),
  "analyser ainda abre modal ou não atualiza em tempo real");
must(analyserSource.includes("Best session damage") && analyserSource.includes("otc-loot-econ"),
  "não clobber Damage best hit / loot econ");

const document = { readyState: "loading", addEventListener() {}, getElementById() { return null; } };
const analyserCtx = {
  console, document, Date, Math, Number, String, Object, Array,
  GAMEDATA: { hunts: { rats: { name: "Rats" } }, items: {
    "demon-shield": { n: "Demon Shield", npcSell: 30000, s: "shield" },
    "gold-coin": { n: "gold coin", sell: 1 },
  } },
  fmtFull(n) { return String(Math.round(n)); },
};
vm.createContext(analyserCtx);
vm.runInContext(analyserSource, analyserCtx, { filename: "analyzers.js" });

const body = analyserCtx.otcAnalyserBody("hunting", {
  huntId: "rats", hunt: { name: "Rats" }, instanceMode: "non-pvp",
  players: [
    { id: "1", name: "Alice", p: { id: "1", name: "Alice", voc: "knight" } },
    { id: "2", name: "Bob", p: { id: "2", name: "Bob", voc: "druid" } },
  ],
  stats: {
    time: 3600000, kills: 2, exp: 300, rawExp: 100, rawHp: 200, gold: 20,
    supplyCost: 135,
    loot: { "gold-coin": 10, "demon-shield": 1 },
    blessCost: 110000,
    deathTrack: {
      startedAt: 1,
      byPlayer: {
        "1": { id: "1", name: "Alice", voc: "knight", deaths: 2, blessGold: 50000 },
        "2": { id: "2", name: "Bob", voc: "druid", deaths: 1, blessGold: 60000 },
      },
    },
    monsters: { rat: { name: "Rat", kills: 2, rawExp: 100, rawHp: 200 } },
  },
});
must(body.includes("Raw XP/h") && body.includes("Raw XP/HP") && body.includes("100") && body.includes("300") &&
  body.includes("stage, PvP, Prey, VIP, Soul War ou bônus de party"),
  "Hunt Session não separa XP obtida de Raw XP/h");
must(body.includes("Valor do loot") && body.includes("Supply gasto") && body.includes("Profit"),
  "Hunt Session sem loot/supply/profit");
must(body.includes("30010") || body.includes("30.010"), "loot value NPC+gold ausente");
must(body.includes("135"), "supply gasto ausente");
const profit = 30010 - 135;
must(body.includes(String(profit)) || body.includes("29.875"), "profit ausente");
must(body.includes("Mortes / Bless") && body.includes("Alice") && body.includes("Bob") &&
  body.includes("2×") && body.includes("1×") && body.includes("Total gasto em bless") &&
  (body.includes("110000") || body.includes("110.000")),
  "seção de mortes/bless incorreta");

/* Reset limpa mortes/bless da sessão */
const combat = {
  stats: {
    deaths: 3, blessCost: 110000,
    deathTrack: { startedAt: 1, byPlayer: { "1": { id: "1", deaths: 2, blessGold: 50000 } } },
    damageTrack: { startedAt: 1, byPlayer: {} },
    takenTrack: { startedAt: 1, byPlayer: {} },
  },
};
analyserCtx.G = { combat };
analyserCtx.activeOtcAnalyser = "hunting";
analyserCtx.otcAnalyserResetSession();
must(combat.stats.deaths === 0 && combat.stats.blessCost === 0 &&
  combat.stats.deathTrack && Object.keys(combat.stats.deathTrack.byPlayer || {}).length === 0,
  "reset não limpou mortes/bless");

/* Contadores locais de morte/bless */
const combatCtx = { expForLevel: () => 0, Math, Number, String, Object, Array, Date };
vm.createContext(combatCtx);
let a = combatSource.indexOf("function combatDeathCause");
let b = combatSource.indexOf("function partyTickAllies", a);
must(a >= 0 && b > a, "helpers de morte/sessão não encontrados");
vm.runInContext(combatSource.slice(a, b), combatCtx);
const cLocal = { stats: { deaths: 0, blessCost: 0, deathTrack: { startedAt: 1, byPlayer: {} } },
  players: [{ id: "1", p: { id: "1", name: "Alice", voc: "knight", level: 100 } }] };
const pAlice = { id: "1", name: "Alice", voc: "knight", level: 100, blessed: true, deaths: 0, exp: 100000 };
const loss = combatCtx.applyCharacterDeathConsequences(cLocal, pAlice);
must(loss.exp === 0 && !pAlice.blessed && pAlice.deaths === 1 && cLocal.stats.deaths === 1 &&
  cLocal.stats.deathTrack.byPlayer["1"].deaths === 1,
  "morte local não incrementou deathTrack por jogador");
combatCtx.recordCombatSessionBless(cLocal, { "1": 50000 });
must(cLocal.stats.blessCost === 50000 && cLocal.stats.deathTrack.byPlayer["1"].blessGold === 50000,
  "bless local não acumulou por jogador");

const start = combatSource.indexOf("function displayMonsterName");
const end = combatSource.indexOf("\nfunction applyBossMultiplier", start);
must(start >= 0 && end > start, "coletor Raw XP não encontrado");
const rawCtx = { GAMEDATA: { monsters: { rat: { name: "Rat", exp: 50, hp: 100 } } }, Math, Number, String };
vm.createContext(rawCtx);
vm.runInContext(combatSource.slice(start, end), rawCtx);
const combatRaw = { stats: {} };
rawCtx.recordRawMonsterStats(combatRaw, { slug: "rat", def: { name: "Influenced Rat", exp: 999, hp: 999 }, maxHp: 999 });
must(combatRaw.stats.rawExp === 50 && combatRaw.stats.rawHp === 100 && combatRaw.stats.monsters.rat.kills === 1,
  "Raw XP/HP usou bônus da criatura em vez dos valores originais");

/* Online: deathTrack + bless no authority stats */
const engine = require("../server/authoritative_engine");
const player = {
  id: "1", name: "Analytics", voc: "knight", level: 100, exp: 999999999,
  hp: 999999, mp: 999999, gold: 500000, skills: { sword: 200 },
  equip: { weapon: { item: "magic-sword" } }, supplies: {}, lootPouch: {}, kills: {}, bosses: {},
};
const member = { id: "1", p: player };
const descriptor = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
  activeCharacterId: "1", members: [member],
  state: { players: [member], mobs: [{ id: "rat", slug: "rat" }], events: [] },
};
const online = engine.initializeAuthority(descriptor, "a".repeat(64), 1000);
must(online.authority.stats.deathTrack && online.authority.stats.blessCost === 0,
  "authority sem deathTrack/blessCost iniciais");
engine.recordAuthSessionDeath(online.authority, online.authority.players[0]);
must(online.authority.stats.deaths === 1 &&
  online.authority.stats.deathTrack.byPlayer["1"].deaths === 1,
  "recordAuthSessionDeath falhou");
engine.recordAuthSessionBless(online.authority, { "1": engine.blessingPrice(100) });
must(online.authority.stats.blessCost === 50000 &&
  online.authority.stats.deathTrack.byPlayer["1"].blessGold === 50000,
  "recordAuthSessionBless falhou");

for (const mob of online.authority.mobs) mob.damage = 0;
const advanced = JSON.parse(engine.advanceAuthorityState(JSON.stringify(online), 5000, 6000).state);
must(advanced.authority.stats.time === 5000 && advanced.authority.stats.rawExp > 0 &&
  advanced.authority.stats.rawHp > 0 && advanced.authority.stats.monsters.rat.kills > 0,
  "combate online não materializou tempo e Raw XP/HP no analyser");

console.log("OK: Hunt Session loot/supply/profit, mortes/bless, reset e Raw XP.");
