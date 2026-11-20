/* Charms por CONTA + assign por PERSONAGEM + Analyzer de procs.
 *
 * Cobre a migração do pool (shared_inventory + accessor da conta),
 * assigns independentes entre chars na mesma raça, novos campos dos
 * totals no engine e a ingestão de eventos t:"charm"/dodge mitigado.
 *   node tools/test_account_charms.js
 */
"use strict";
const path = require("path"), fs = require("fs"), vm = require("vm");
const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
function must(v, m) { if (!v) throw new Error(m); }

/* ── 1. Pool da conta no shared_inventory (server) ── */
const SI = require(path.join(root, "server", "shared_inventory.js"));
const chars = [
  { data: { charms: { wound: true, dodge: true }, charmPoints: 500, charmRace: { wound: "rat" } } },
  { data: { charms: { freeze: true }, charmPoints: 800, charmRace: { freeze: "rotworm" } } },
];
let s = SI.seedSharedCharms(SI.normalizeSharedInventory({}), chars);
s.charmsSharedDone = 1;
must(s.charms.wound && s.charms.freeze && s.charms.dodge, "migração: união dos unlocks");
must(s.charmPoints === 1300, "migração: soma dos pontos");
const pa = {};
SI.applySharedToPlayer(pa, s);
must(pa.charms.freeze === true && pa.charmPoints === 1300, "apply espelha pool no char");
must(pa._charmPointsBase === 1300, "baseline de delta gravada");
pa.charmPoints -= 240; pa.charms.zap = true;
SI.mergeSharedFromPlayer(pa, s);
must(s.charmPoints === 1060 && s.charms.zap, "merge delta: compra debita o pool 1x");
const pb = {}; SI.applySharedToPlayer(pb, s);
pb.charmPoints += 25;
SI.mergeSharedFromPlayer(pb, s);
must(s.charmPoints === 1085, "merge delta: ganho de bestiário soma no pool");
must(!("charmRace" in s) || !s.charmRace, "charmRace NÃO migra pro shared (é por char)");

/* ── 2. Assign independente por personagem (cyclopedia.js via vm) ── */
const GAMEDATA = {
  monsters: {
    rat: { name: "Rat", hp: 20, exp: 5, best: { toKill: 5, u1: 2, u2: 3, charm: 5 }, jogavel: true },
    rotworm: { name: "Rotworm", hp: 65, exp: 40, best: { toKill: 10, u1: 5, u2: 7, charm: 10 }, jogavel: true },
  },
  hunts: {},
};
const cycCtx = { GAMEDATA, console, module: { exports: {} }, exports: {} };
vm.createContext(cycCtx);
vm.runInContext(fs.readFileSync(path.join(js, "cyclopedia.js"), "utf8"), cycCtx);
const C = cycCtx.module.exports;
const mkChar = (name, finished) => ({
  id: "char-" + name, name,
  bestiary: Object.fromEntries(finished.map((sl) => [sl, 99999])),
  charms: {}, charmRace: {}, charmsPagos: {}, charmPoints: 0,
});
const kina = mkChar("Kina", ["rat"]), sorc = mkChar("Sorc", ["rat"]);
kina.charms.wound = true; sorc.charms.freeze = true;
must(C.assignCharm(kina, "wound", "rat").ok, "Kina assigna wound no rat");
must(C.assignCharm(sorc, "freeze", "rat").ok, "Sorc assigna freeze no MESMO rat");
must(C.charmAssignedRace(kina, "wound") === "rat", "assign de Kina intacto");
must(C.charmAssignedRace(sorc, "freeze") === "rat", "assign de Sorc intacto");
must(C.charmAssignedRace(kina, "freeze") === null, "assign não vaza entre chars");
const tKina = C.charmTotals(kina, "rat"), tSorc = C.charmTotals(sorc, "rat");
must(tKina.esquiva === 0 && tSorc.esquiva === 0, "totals por char separados");

/* ── 3. Accessor da conta (tibiacoin.js + roster shim) ── */
const store = {};
const shim = {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  readRoster: () => ({
    "char-kina": { p: { charms: { wound: true }, charmPoints: 500 } },
    "char-sorc": { p: { charms: { freeze: true }, charmPoints: 800 } },
  }),
  console, module: { exports: {} }, exports: {},
};
vm.createContext(shim);
vm.runInContext(fs.readFileSync(path.join(js, "tibiacoin.js"), "utf8"), shim);
const c1 = {}, c2 = {};
shim.bindAccountCharms(c1); shim.bindAccountCharms(c2);
must(c1.charms.wound && c1.charms.freeze, "accessor: migração une unlocks");
must(c1.charmPoints === 1300, "accessor: migração soma pontos");
c2.charms = Object.assign({}, c2.charms, { dodge: true });
must(c1.charms.dodge === true, "unlock via c2 visível em c1 (mesma conta)");
c1.charmPoints = c1.charmPoints - 240;
must(c2.charmPoints === 1060, "gasto via c1 reflete no pool de c2");
// charmRace continua por char
c1.charmRace = { wound: "rat" }; c2.charmRace = { freeze: "rat" };
must(c1.charmRace.wound === "rat" && !c1.charmRace.freeze, "assigns não vazam (roster local)");

/* ── 4. Engine: totals por raça + novos campos ── */
const E = require(path.join(root, "server", "authoritative_engine.js"));
const pe = { id: "c1", name: "Kina", level: 100, hp: 1000, mp: 500,
  charms: { freeze: true, dodge: true, vampiric: true, voidcall: true, parry: true, numb: true },
  charmRace: { freeze: "rat", dodge: "rat", vampiric: "rat", voidcall: "rat", parry: "rat", numb: "rat" },
  charmPoints: 0, buffs: {}, conditions: {} };
const te = E.charmTotals(pe, "rat");
must(te.reflete === 5 && te.esquiva === 5 && te.vampirismo > 0 && te.manaLeech > 0 && te.numb === 6,
  "engine totals: reflete/esquiva/leech/numb");
const teOther = E.charmTotals(pe, "rotworm");
must(teOther.esquiva === 0 && teOther.reflete === 0, "engine totals: outra raça = zero");

/* ── 5. Analyzer: ingest de procs + dodge mitigado ── */
const anCtx = { console, module: { exports: {} }, exports: {}, CHARMS: cycCtx.module.exports.CHARMS };
anCtx.G = { combat: null };
vm.createContext(anCtx);
vm.runInContext(fs.readFileSync(path.join(js, "analyzers.js"), "utf8"), anCtx);
const A = anCtx.module.exports;
const combat = {
  player: { id: "c1", p: { name: "Kina", voc: "knight" } },
  players: [
    { id: "c1", p: { name: "Kina", voc: "knight" } },
    { id: "c2", p: { name: "Sorc", voc: "sorcerer" } },
  ],
  stats: { startedAt: Date.now(), loot: {}, monsters: {} },
};
A.otcAnalyserIngestEvents([
  { t: "charm", id: "freeze", dmg: 420, whoId: "c1" },
  { t: "charm", id: "vampiric", heal: 55, whoId: "c1" },
  { t: "charm", id: "voidcall", mana: 30, whoId: "c2" },
  { t: "miss", charm: "dodge", mitigated: 180, targetId: "c1" },
  { t: "charm", id: "parry", dmg: 12, whoId: "c1" },
  { t: "charm", id: "gut", extra: 1, whoId: "c1" },
], combat);
const rows = combat.stats.charmTrack.byPlayer;
must(rows.c1.charms.freeze.dmg === 420, "analyzer: freeze dmg por char");
must(rows.c1.charms.vampiric.heal === 55, "analyzer: leech curado");
must(rows.c2.charms.voidcall.mana === 30, "analyzer: voidcall mana por outro char");
must(rows.c1.charms.dodge.mitigated === 180 && rows.c1.charms.dodge.procs === 1,
  "analyzer: dodge procs + mitigado");
must(rows.c1.charms.parry.dmg === 12 && rows.c1.charms.gut.extra === 1,
  "analyzer: parry reflect + gut extra");
must(A.OTC_ANALYSERS.some((a) => a.id === "charms"), "aba Charms registrada");
// dano de charm conta no Damage Analyser
must(combat.stats.damageTrack.byPlayer.c1.total === 432, "charm dmg entra no damageTrack");

/* ── 6. Forge Bonus no Analyzer ── */
A.otcAnalyserIngestEvents([
  { t: "buff", nome: "Momentum", whoId: "c1" },
  { t: "buff", nome: "Momentum", whoId: "c1" },
  { t: "buff", nome: "Transcendence", whoId: "c2" },
  { t: "forge", nome: "onslaught", whoId: "c1" },
  { t: "miss", ruse: true, targetId: "c2" },
  { t: "buff", nome: "Strong Haste" },   // buff comum — não conta
], combat);
const frows = combat.stats.forgeTrack.byPlayer;
must(frows.c1.momentum === 2 && frows.c1.onslaught === 1, "forge: momentum×2 + onslaught do c1");
must(frows.c2.transcendence === 1 && frows.c2.ruse === 1, "forge: transcendence+ruse do c2");
must(frows.c1.total === 3 && frows.c2.total === 2, "forge: totais por char");
must(A.OTC_ANALYSERS.some((a) => a.id === "forge"), "aba Forge registrada");

console.log("OK: pool de charms por conta (seed/apply/merge), assigns por char,",
  "accessor offline, totals do engine e Charms no Analyzer.");
