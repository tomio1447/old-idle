/**
 * test_stash_equip_persist.js — Supply Stash equip/withdraw autoritativo.
 * Run: node tools/test_stash_equip_persist.js
 */
"use strict";

const assert = require("assert");
const engine = require("../server/authoritative_engine");

function must(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

must(typeof engine.equipFromSupplyStash === "function", "export equipFromSupplyStash");
must(typeof engine.moveItemFromSupplyStash === "function", "export moveItemFromSupplyStash");

const p = {
  id: 1, voc: "knight", level: 50, bag: {}, lootPouch: {},
  supplyStash: { "might-ring": 3, "life-ring": 2 },
  equip: {}, itemInstances: [], config: {},
};

must(engine.equipFromSupplyStash(p, "might-ring", "ring"), "equip might-ring da stash");
must(p.equip.ring && p.equip.ring.item === "might-ring", "anel no slot");
must((p.supplyStash["might-ring"] || 0) === 2, "stash decrementou 1");
must(p.equip.ring.charges > 0, "cargas ao equipar");

must(engine.moveItemFromSupplyStash(p, { slug: "life-ring", dest: "bag", qty: 1 }), "stash → bag 1");
must((p.supplyStash["life-ring"] || 0) === 1, "life-ring stash restou 1");
must((p.bag["life-ring"] || 0) === 1, "life-ring na bag");

must(engine.moveItemFromSupplyStash(p, { slug: "might-ring", dest: "destroy" }), "destroy stack restante");
must(!(p.supplyStash["might-ring"]), "might-ring sumiu da stash");

// Equip troca: antigo vai pra bag, stash -1
p.supplyStash["time-ring"] = 2;
must(engine.equipFromSupplyStash(p, "time-ring", "ring"), "troca para time-ring");
must(p.equip.ring.item === "time-ring", "time-ring no slot");
must((p.bag["might-ring"] || 0) === 1, "might-ring anterior foi pra bag");
must((p.supplyStash["time-ring"] || 0) === 1, "time-ring stash -1");

console.log("\nAll stash equip persist tests passed.");
