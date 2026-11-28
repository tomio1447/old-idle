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

// ---------- dedup por id (bug real da conta 1/1) ----------
// Cenário DB: mesmo id 2× loc bag + contagem 2 → "2 bows na bp".
const p4 = {
  bag: { "falcon-bow": 2 },
  itemInstances: [
    { id: "it-dup", slug: "falcon-bow", loc: "bag", tier: 0 },
    { id: "it-dup", slug: "falcon-bow", loc: "bag", tier: 0 },
  ],
  equip: {}, _itemInstancesVersion: 2, _itemInstSeq: 0, forge: {},
};
sandbox.ensureItemInstances(p4);
must(p4.itemInstances.filter((i) => i && i.id === "it-dup").length === 1, "cliente: mesmo id 2× na bag vira 1");
must(p4.bag["falcon-bow"] === 1, "cliente: contagem recalcula para 1 após dedup");

// Cenário DB: mesmo id ×3 em equip:weapon com o equip referenciando → fica 1.
const sharedRef = { id: "it-dup", slug: "falcon-bow", loc: "equip:weapon", tier: 0 };
const p5 = {
  bag: {},
  itemInstances: [sharedRef, sharedRef, sharedRef],
  equip: { weapon: { item: "falcon-bow", count: 1, instId: "it-dup" } },
  _itemInstancesVersion: 2, _itemInstSeq: 0, forge: {},
};
sandbox.ensureItemInstances(p5);
must(p5.itemInstances.filter((i) => i && i.id === "it-dup").length === 1, "cliente: mesmo OBJETO ×3 no equip vira 1");
must(p5.itemInstances[0].loc === "equip:weapon", "cliente: entrada equipada preservada");
must(p5.equip.weapon.instId === "it-dup", "cliente: vínculo do equip mantido");

// Cenário merge: cópia bag (stale) + ref equipada, mesmo id → fica a equipada.
const p6 = {
  bag: {},
  itemInstances: [
    { id: "it-dup", slug: "falcon-bow", loc: "bag", tier: 0 },
    { id: "it-dup", slug: "falcon-bow", loc: "equip:weapon", tier: 0 },
  ],
  equip: { weapon: { item: "falcon-bow", count: 1, instId: "it-dup" } },
  _itemInstancesVersion: 2, _itemInstSeq: 0, forge: {},
};
sandbox.ensureItemInstances(p6);
must(p6.itemInstances.length === 1 && p6.itemInstances[0].loc === "equip:weapon",
  "cliente: dup bag+equip mesmo id → prefere a equipada");

// Servidor: mesma dedup na hidratação.
const q3 = {
  bag: { "falcon-bow": 2 },
  itemInstances: [
    { id: "srv-dup", slug: "falcon-bow", loc: "bag", tier: 0 },
    { id: "srv-dup", slug: "falcon-bow", loc: "bag", tier: 0 },
  ],
  equip: {},
};
engine.authReconcileOrphanBagCounts(q3);
engine.authSyncBagCountsFromInstances(q3);
must(q3.itemInstances.filter((i) => i && i.id === "srv-dup").length === 1, "server: mesmo id 2× na bag vira 1");
must(q3.bag["falcon-bow"] === 1, "server: contagem recalcula para 1 após dedup");

const q4 = {
  bag: {},
  itemInstances: [
    { id: "srv-dup", slug: "falcon-bow", loc: "bag", tier: 0 },
    { id: "srv-dup", slug: "falcon-bow", loc: "equip:weapon", tier: 0 },
  ],
  equip: { weapon: { item: "falcon-bow", count: 1, instId: "srv-dup" } },
};
engine.authReconcileOrphanBagCounts(q4);
must(q4.itemInstances.length === 1 && q4.itemInstances[0].loc === "equip:weapon",
  "server: dup bag+equip mesmo id → prefere a equipada");

// stashEquippedAuth não deixa mais contagem órfã (era inst.loc=bag + bag++).
const q5 = {
  bag: {}, itemInstances: [{ id: "srv-x", slug: "falcon-bow", loc: "equip:weapon", tier: 0 }],
  equip: { weapon: { item: "falcon-bow", count: 1, instId: "srv-x" } },
};
must(engine.stashEquippedAuth(q5, "weapon", "bag") === true, "server: desequipar instância ok");
must(q5.itemInstances[0].loc === "bag", "server: instância voltou pra bag");
must(q5.bag["falcon-bow"] === 1, "server: contagem derivada do sync (não órfã)");
engine.authReconcileOrphanBagCounts(q5);
must(q5.itemInstances.length === 1, "server: reconcile não materializa fantasma pós-unequip");

// applySharedToPlayer: cópia stale do shared com id da equipada é descartada.
const sharedInv = require("../server/shared_inventory.js");
const sp2 = { equip: { weapon: { item: "falcon-bow", count: 1, instId: "it-eq" } },
  itemInstances: [{ id: "it-eq", slug: "falcon-bow", loc: "equip:weapon", tier: 0 }] };
const shared = { bag: {}, lootPouch: {}, supplyStash: {}, depot: [], rewardChest: {}, rewardChestBundles: [],
  itemInstances: [{ id: "it-eq", slug: "falcon-bow", loc: "bag", tier: 0 }], seq: 0,
  dust: 0, dustLimit: 100, slivers: 0, exaltedCores: 0 };
sharedInv.applySharedToPlayer(sp2, shared);
must(sp2.itemInstances.length === 1 && sp2.itemInstances[0].loc === "equip:weapon",
  "shared merge: cópia bag stale do mesmo id é descartada (fica a equipada)");

/* ── Dupe relatado (lag): reward equipada durante lag — a cópia do char A
 * gravou equip:weapon + instId, mas a cópia atrasada do char B (mesma
 * conta) ainda tinha a instância em bag e bag[slug]=1. O merge terminal
 * por conta NÃO pode deixar o instId equipado entrar no shared nem a
 * contagem fantasma sobreviver — senão a hidratação materializava o item
 * de novo (equipado E na mochila). ── */
sharedInv.setSharedItemLookup((slug) => ({
  "falcon-bow": { s: "weapon", t: "distance", imbSlots: 2 },   // instanciado
  "time-ring": { s: "ring", charges: 200 },                    // chargeable, não instanciado
  "mana-potion": { s: "supply" },                              // stackable authored
}[slug] || null));
const accCopyB_stale = {  // char B, espelho de ANTES do equip
  bag: { "falcon-bow": 1 }, lootPouch: {}, supplyStash: {},
  itemInstances: [{ id: "it-x", slug: "falcon-bow", loc: "bag", tier: 0 }],
  equip: {},
};
const accCopyA = {  // char A, estado fresco pós-equip
  bag: {}, lootPouch: {}, supplyStash: {},
  itemInstances: [{ id: "it-x", slug: "falcon-bow", loc: "equip:weapon", tier: 0 }],
  equip: { weapon: { item: "falcon-bow", count: 1, instId: "it-x" } },
};
const eqAll = sharedInv.equippedIdsAndSlugs(accCopyA);
const shared2 = sharedInv.emptySharedInventory();
// Ordem adversa: a cópia STALE mergea primeiro (era o vetor do dupe).
sharedInv.mergeSharedFromPlayer(accCopyB_stale, shared2,
  { equippedIds: eqAll.ids, equippedSlugs: eqAll.slugs });
sharedInv.mergeSharedFromPlayer(accCopyA, shared2,
  { equippedIds: eqAll.ids, equippedSlugs: eqAll.slugs });
must(!shared2.itemInstances.some((i) => i && i.id === "it-x"),
  "dupe: instId equipado nunca entra no shared (cópia stale filtrada)");
must(!(shared2.bag["falcon-bow"] > 0),
  "dupe: contagem fantasma de bag morre no merge (clamped a 0)");
// Hidratação do shared resultante: nada de item novo na mochila.
const hyd = { itemInstances: [], equip: {} };
sharedInv.applySharedToPlayer(hyd, shared2);
must(!hyd.itemInstances.some((i) => i && i.id === "it-x") && !(hyd.bag["falcon-bow"] > 0),
  "dupe: hidratação não materializa o item equipado");

// extractSharedFromPlayer (save de cidade) também filtra id equipado.
const pCity = {
  bag: { "falcon-bow": 1 },
  itemInstances: [
    { id: "it-y", slug: "falcon-bow", loc: "bag", tier: 0 },       // espelho stale
    { id: "it-y", slug: "falcon-bow", loc: "equip:weapon", tier: 0 },
  ],
  equip: { weapon: { item: "falcon-bow", count: 1, instId: "it-y" } },
};
const shared3 = sharedInv.emptySharedInventory();
sharedInv.extractSharedFromPlayer(pCity, shared3);
must(!shared3.itemInstances.some((i) => i && i.id === "it-y") && !(shared3.bag["falcon-bow"] > 0),
  "dupe: extract de cidade descarta inst equipada + count órfã");

// Grant legítimo (bag[slug] sem instância e sem equip) NÃO é clamped —
// a materialização de órfãos repara depois.
const shared4 = sharedInv.emptySharedInventory();
sharedInv.mergeSharedFromPlayer({ bag: { "falcon-bow": 2 }, itemInstances: [] }, shared4);
must(shared4.bag["falcon-bow"] === 2,
  "grant sem instância/equip mantém a contagem (órfão reparável)");

// Chargeable NÃO instanciado: anéis full vivem como contagem authored sem
// instância — o reconcile não clampa, mesmo com inst parcial presente.
const shared5 = sharedInv.emptySharedInventory();
sharedInv.mergeSharedFromPlayer({
  bag: { "time-ring": 1 },
  itemInstances: [{ id: "tr-1", slug: "time-ring", loc: "bag", charges: 120 }],
}, shared5);
must(shared5.bag["time-ring"] === 1,
  "chargeable não instanciado: contagem authored preservada (sem clamp)");
must(shared5.itemInstances.some((i) => i && i.id === "tr-1"),
  "inst parcial de chargeable preservada no shared");
// Stackable authored: contagem sem instância também não é clampada.
const shared6 = sharedInv.emptySharedInventory();
sharedInv.mergeSharedFromPlayer({ bag: { "mana-potion": 5 }, itemInstances: [] }, shared6);
must(shared6.bag["mana-potion"] === 5, "stackable authored: contagem preservada");
sharedInv.setSharedItemLookup(null);

console.log("\nAll orphan bag instance checks passed.");
