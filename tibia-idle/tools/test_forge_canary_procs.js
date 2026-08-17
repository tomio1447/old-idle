/* Canary forge: Ruse/Momentum/Transcendence usam tier+amp, não config.forge*. */
"use strict";
const engine = require("../server/authoritative_engine");
function must(ok, msg) { if (!ok) throw Error(msg); }

function geared(tiers) {
  const itemInstances = [];
  const equip = {};
  function put(slot, slug, tier) {
    if (!tier) return;
    const id = "it-" + slot;
    itemInstances.push({ id, slug, loc: "equip:" + slot, tier });
    equip[slot] = { item: slug, count: 1, instId: id };
  }
  put("weapon", "magic-sword", tiers.weapon);
  put("armor", "magic-plate-armor", tiers.armor);
  put("helmet", "golden-helmet", tiers.helmet);
  put("legs", "golden-legs", tiers.legs);
  put("boots", "pair-of-soft-boots", tiers.boots);
  return {
    id: 1, name: "ForgeProcs", voc: "knight", level: 100,
    equip, itemInstances, forge: {}, config: {},
    _spellCd: { "exori": Date.now() + 8000 },
    _groupCd: { "1": Date.now() + 8000 },
  };
}

must(engine.forgeProcChanceForEquipped(geared({ armor: 10 }), "armor") > 0, "ruse T10 > 0");
must(engine.forgeProcChanceForEquipped(geared({ helmet: 10 }), "helmet") > 0, "momentum T10 > 0");
must(engine.forgeProcChanceForEquipped(geared({ legs: 10 }), "legs") > 0, "transcendence T10 > 0");
must(engine.forgeBootAmplificationPct(geared({ boots: 10 })) === 57.40, "T10 boots amp 57.40");

const baseRuse = engine.forgeProcChanceForEquipped(geared({ armor: 10 }), "armor");
const ampRuse = engine.forgeProcChanceForEquipped(geared({ armor: 10, boots: 10 }), "armor");
must(Math.abs(ampRuse - baseRuse * (1 + 57.40 / 100)) < 1e-9, "amp aplica em ruse");

const auth = { rngState: 1, events: [], clock: Date.now() };
const p0 = geared({});
must(!engine.forgeTryRuse(auth, p0), "sem armor tier → ruse false");
must(!engine.forgeTryMomentum(auth, p0, Date.now()), "sem helmet → momentum false");
must(!engine.forgeTryTranscendence(auth, p0, Date.now()), "sem legs → trans false");

const pCfg = geared({ helmet: 10, legs: 10, armor: 10 });
pCfg.config = { forgeMomentum: false, forgeTranscendence: false };
must(engine.forgeProcChanceForEquipped(pCfg, "helmet") > 0, "não depende de config.forge*");

const pM = geared({ helmet: 10 });
const now = Date.now();
pM._spellCd.exori = now + 5000;
let mom = 0;
for (let t = 0; t < 40000; t += 2000) {
  if (engine.forgeTryMomentum(auth, pM, now + t)) mom++;
}
must(mom > 0, "momentum T10 deve proc em ~20 rolls, got " + mom);

const pT = geared({ legs: 10 });
engine.forgeNoteCombatAction(auth, { id: 1 }, pT, now, { offensive: true });
must(pT._forgeMeta && pT._forgeMeta.lastOffensiveActionAt === now, "offensive action registrada");

const src = require("fs").readFileSync(require("path").join(__dirname, "../server/authoritative_engine.js"), "utf8");
must(!/config\.forgeMomentum/.test(src), "legacy config.forgeMomentum removido");
must(src.includes("forgeTryRuse(auth,p)"), "ruse no absorb incoming");

console.log("OK: forge canary procs (ruse/momentum/transcendence + amp).");
