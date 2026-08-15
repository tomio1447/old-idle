/* Onslaught/Fatal: só com tier de forge na arma (não flat em crítico). */
"use strict";
const engine = require("../server/authoritative_engine");
function must(ok, msg) { if (!ok) throw Error(msg); }

function weaponPlayer(tier, bootsTier) {
  const instId = "it-weapon-test";
  const bootsId = "it-boots-test";
  const itemInstances = [
    { id: instId, slug: "magic-sword", loc: "equip:weapon", tier: tier || 0 },
  ];
  const equip = { weapon: { item: "magic-sword", count: 1, instId } };
  if (bootsTier > 0) {
    itemInstances.push({ id: bootsId, slug: "pair-of-soft-boots", loc: "equip:boots", tier: bootsTier });
    equip.boots = { item: "pair-of-soft-boots", count: 1, instId: bootsId };
  }
  return {
    id: 1, name: "ForgeFatal", voc: "knight", level: 100,
    equip, itemInstances, forge: {}, config: {},
  };
}

/* --- chance === 0 sem tier / T0 / sem instância --- */
must(engine.forgeOnslaughtChancePct({}) === 0, "sem equip → chance 0");
must(engine.forgeOnslaughtChancePct({ equip: { weapon: { item: "magic-sword" } } }) === 0,
  "arma sem instId → chance 0 (não vaza p.forge)");
must(engine.forgeOnslaughtChancePct(weaponPlayer(0)) === 0, "T0 → chance 0");
must(engine.forgeOnslaughtChancePct({
  equip: { weapon: { item: "magic-sword", instId: "missing" } },
  itemInstances: [],
  forge: { "magic-sword": 10 },
}) === 0, "instância ausente + forge legado → chance 0");

/* --- com tier → chance da tabela Canary --- */
const t1 = engine.forgeOnslaughtChancePct(weaponPlayer(1));
must(Math.abs(t1 - 0.50) < 1e-9, "T1 weapon = 0.50% got " + t1);
const t5 = engine.forgeOnslaughtChancePct(weaponPlayer(5));
must(Math.abs(t5 - 3.30) < 1e-9, "T5 weapon = 3.30% got " + t5);
const t10 = engine.forgeOnslaughtChancePct(weaponPlayer(10));
must(Math.abs(t10 - 9.05) < 1e-9, "T10 weapon = 9.05% got " + t10);
must(t10 > 0 && t5 > t1, "tiers sobem a chance");

/* Amplification das boots */
const amp = engine.forgeOnslaughtChancePct(weaponPlayer(5, 5));
const expectAmp = 3.30 * (1 + 18.90 / 100);
must(Math.abs(amp - expectAmp) < 1e-9, "T5 arma + T5 boots amplifica got " + amp);

/* --- simulação: T0 nunca Fatal em N rolls --- */
const auth = { rngState: 1 };
let fatalT0 = 0;
const p0 = weaponPlayer(0);
for (let i = 0; i < 5000; i++) {
  if (engine.forgeRollOnslaught(auth, p0)) fatalT0++;
}
must(fatalT0 === 0, "T0: 0 fatal em 5000 rolls, got " + fatalT0);

/* --- T10: chance > 0 (algum fatal em muitos rolls) --- */
let fatalT10 = 0;
const p10 = weaponPlayer(10);
for (let i = 0; i < 5000; i++) {
  if (engine.forgeRollOnslaught(auth, p10)) fatalT10++;
}
must(fatalT10 > 0, "T10: esperava algum fatal em 5000 rolls");
/* ~9.05% → ~452; faixa larga para RNG do motor */
must(fatalT10 > 200 && fatalT10 < 800, "T10 taxa ~9% got " + fatalT10 + "/5000");

/* Código autoritativo não usa mais flat 5% em crítico */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../server/authoritative_engine.js"), "utf8");
must(!/isFatal\s*=\s*isCrit\s*&&\s*random\(auth\)\s*<\s*0\.05/.test(src),
  "flat 5% fatal-on-crit ainda presente");
must(src.includes("forgeRollOnslaught"), "forgeRollOnslaught usado no motor");
must(src.includes("FORGE_ONSLAUGHT_BONUS_PCT"), "bônus +60% Canary exportado");

console.log("OK: forge onslaught/fatal exige tier (T0=0, T-tier>0, amp boots).");
