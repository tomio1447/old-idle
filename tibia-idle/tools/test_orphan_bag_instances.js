/**
 * test_orphan_bag_instances.js — reconciliação de contagens órfãs na bag.
 *
 * Bug: grants SQL/admin que gravam só bag[slug] (sem itemInstances) de
 * itens instanciados (ex.: falcon-bow com imbSlots) tinham a contagem
 * descartada por syncBagCountsFromInstances/authSyncBagCountsFromInstances
 * — o item sumia e nunca aparecia na forja.
 *
 * Fix: ensureItemInstances (cliente) e authReconcileOrphanBagCounts via
 * canonicalPlayer/loadCityPlayer (servidor) materializam as instâncias
 * faltantes na hidratação, ANTES de qualquer sync rodar.
 *
 * Run: node tools/test_orphan_bag_instances.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");

function must(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

// ---------- cliente (player.js) ----------
const sandbox = { window: {}, console, Date, Math, parseInt, Number, String, Array, Object, JSON };
sandbox.window = sandbox;
for (const name of ["gamedata.js", "weapondata.js", "weapons.js", "forgedata.js", "player.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(js, name), "utf8"), sandbox, { filename: name });
}
if (typeof sandbox.fundirWeaponData === "function") sandbox.fundirWeaponData();

must(sandbox.itemUsesInstances("falcon-bow"), "falcon-bow usa instância (imbSlots)");
must(sandbox.itemUsesInstances("naga-crossbow"), "naga-crossbow usa instância");

// Cenário do bug: grant SQL gravou só a contagem — v2, sem instância.
const p = {
  bag: { "falcon-bow": 1, "naga-crossbow": 1, "gold-coin": 300 },
  itemInstances: [],
  equip: {},
  _itemInstancesVersion: 2,
  _itemInstSeq: 0,
  forge: {},
};
sandbox.ensureItemInstances(p);
const falcon = p.itemInstances.filter((i) => i && i.slug === "falcon-bow" && i.loc === "bag");
const naga = p.itemInstances.filter((i) => i && i.slug === "naga-crossbow" && i.loc === "bag");
must(falcon.length === 1, "orphan falcon-bow virou 1 instância de bag");
must(naga.length === 1, "orphan naga-crossbow virou 1 instância de bag");
must(falcon[0].id && String(falcon[0].id).indexOf("it-") === 0, "instância órfã com id it-*");
must(p.bag["falcon-bow"] === 1 && p.bag["naga-crossbow"] === 1, "contagens preservadas após sync");
must(p.bag["gold-coin"] === 300, "itens não-instanciados intocados");

// Segunda carga: não duplica.
sandbox.ensureItemInstances(p);
must(p.itemInstances.filter((i) => i && i.slug === "falcon-bow").length === 1, "re-ensure não duplica instância");

// Parcial: bag=2, 1 instância existente → cria só a que falta.
const p2 = {
  bag: { "falcon-bow": 2 },
  itemInstances: [{ id: "it-old", slug: "falcon-bow", loc: "bag", tier: 4 }],
  equip: {}, _itemInstancesVersion: 2, _itemInstSeq: 5, forge: {},
};
sandbox.ensureItemInstances(p2);
const f2 = p2.itemInstances.filter((i) => i && i.slug === "falcon-bow" && i.loc === "bag");
must(f2.length === 2, "bag=2 com 1 instância → cria só a faltante");
must(f2.some((i) => i.id === "it-old" && i.tier === 4), "instância antiga preservada (id+tier)");

// Tier de p.forge migra para a 1ª órfã (grant tiered).
const p3 = {
  bag: { "falcon-bow": 2 },
  itemInstances: [],
  equip: {}, _itemInstancesVersion: 2, _itemInstSeq: 0,
  forge: { "falcon-bow": 5 },
};
sandbox.ensureItemInstances(p3);
const f3 = p3.itemInstances.filter((i) => i && i.slug === "falcon-bow");
must(f3.length === 2, "grant tiered: 2 instâncias");
must(f3.filter((i) => i.tier === 5).length === 1, "só a 1ª órfã recebe o tier do forge");
must(f3.filter((i) => i.tier === 0).length === 1, "demais órfãs nascem T0");

// ---------- servidor (authoritative_engine) ----------
const engine = require("../server/authoritative_engine.js");
must(typeof engine.authReconcileOrphanBagCounts === "function", "authReconcileOrphanBagCounts exportada");

// canonicalPlayer (hidratação de instância) reconcilia antes de qualquer tick.
const sp = engine.canonicalPlayer ? null : null; // não exportada — testa via reconcile direto
const q = {
  id: "c1",
  bag: { "falcon-bow": 1, "gold-coin": 50 },
  itemInstances: [],
  equip: {},
  forge: { "falcon-bow": 3 },
};
engine.authReconcileOrphanBagCounts(q);
const qf = q.itemInstances.filter((i) => i && i.slug === "falcon-bow" && i.loc === "bag");
must(qf.length === 1, "server: orphan falcon-bow materializado");
must(qf[0].tier === 3, "server: tier do forge aplicado na órfã");
must(String(qf[0].id).indexOf("srv-") === 0, "server: id srv-*");

// Depois do reconcile o sync NÃO apaga mais (era o bug).
engine.authSyncBagCountsFromInstances(q);
must(q.bag["falcon-bow"] === 1, "server: contagem sobrevive ao sync pós-reconcile");
must(q.itemInstances.filter((i) => i && i.slug === "falcon-bow").length === 1, "server: instância sobrevive ao sync");
must(q.bag["gold-coin"] === 50, "server: moeda intocada");

// Idempotente.
engine.authReconcileOrphanBagCounts(q);
must(q.itemInstances.filter((i) => i && i.slug === "falcon-bow").length === 1, "server: reconcile idempotente");

// Contagem menor que instâncias (ex.: vendeu 1 mas a contagem ficou) → não cria.
const q2 = { bag: { "falcon-bow": 1 }, itemInstances: [{ id: "srv-a", slug: "falcon-bow", loc: "bag", tier: 0 }] };
engine.authReconcileOrphanBagCounts(q2);
must(q2.itemInstances.length === 1, "server: instâncias >= contagem não cria extra");

console.log("\nAll orphan bag instance checks passed.");
