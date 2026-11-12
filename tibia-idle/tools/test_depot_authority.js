"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../server/authoritative_engine");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
function syncCopies() {
  const source = fs.readFileSync(path.join(__dirname, "../server/server.js"), "utf8");
  const start = source.indexOf("function syncInstancePouchCopies(");
  const end = source.indexOf("\n/* Grava o resultado sincronizado", start);
  return vm.runInNewContext(source.slice(start, end) + "\nsyncInstancePouchCopies;");
}
test("a new bag slug on a non-leader propagates to all copies instead of disappearing", () => {
  const members = [
    { id: "1", accountId: 9, p: { bag: {}, lootPouch: {}, supplyStash: {}, itemInstances: [] } },
    { id: "2", accountId: 9, p: { bag: { "demon-armor": 1 }, lootPouch: {}, supplyStash: {},
      itemInstances: [{ id: "a", slug: "demon-armor", loc: "bag" }] } },
    { id: "3", accountId: 10, p: { bag: {}, lootPouch: {}, itemInstances: [] } }
  ];
  const synced = syncCopies()(members, "2", { bag: {}, pouch: {} });
  assert.equal(synced.bag["demon-armor"], 1);
  assert.equal(members[0].p.bag["demon-armor"], 1);
  assert.equal(members[1].p.bag["demon-armor"], 1);
  assert.equal(members[2].p.bag["demon-armor"], undefined);
});
test("depot mutations propagate removals to party copies and the shared persistence result", () => {
  const members = [
    { id: "1", accountId: 9, p: { bag: {}, depot: ["a"], lootPouch: {}, supplyStash: {}, itemInstances: [] } },
    { id: "2", accountId: 9, p: { bag: {}, depot: [], lootPouch: {}, supplyStash: {}, itemInstances: [] } }
  ];
  const synced = syncCopies()(members, "2", { bag: {}, pouch: {}, depot: ["a"] });
  assert.equal(synced.depot.length, 0);
  assert.equal(members[0].p.depot.length, 0);
});
test("city depot API persists the withdrawal through shared hydration and rejects other owners or leases", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/server.js"), "utf8");
  const start = source.indexOf("async function equipInstanceItem(");
  const end = source.indexOf("\n/* Remove 1 unidade", start);
  const S = require("../server/shared_inventory");
  const clone = (v) => JSON.parse(JSON.stringify(v));
  let stored = { id: 1, account_id: 9, voc: "knight", level: 600, save_version: 1, data: JSON.stringify(player()) };
  let shared = S.emptySharedInventory(); S.extractSharedFromPlayer(player(), shared);
  let allowed = true;
  const context = {
    depotActionAuth: E.depotActionAuth, equipFromContainerAuth: E.equipFromContainerAuth,
    unequipFromContainerAuth: E.unequipFromContainerAuth,
    requireLease: async () => allowed ? null : { code: 423, body: { ok: false } },
    leaseHash: () => "test", resolveInstanceRow: async () => ({ row: null }),
    loadCityPlayer: async (db, acc, character) => { const p = JSON.parse(character.data); S.applySharedToPlayer(p, shared); return p; },
    persistClaimedPlayer: async (db, acc, character, p) => {
      assert.equal(character.save_version, stored.save_version);
      stored = { ...stored, data: JSON.stringify(p), save_version: stored.save_version + 1 };
      S.extractSharedFromPlayer(p, shared);
      return { code: 200, body: { ok: true, sharedInventory: clone(shared) } };
    }
  };
  const api = vm.runInNewContext(source.slice(start, end) + "\nequipInstanceItem;", context);
  const db = { findAccountByToken: async () => ({ id: 9 }), findCharacter: async () => clone(stored) };
  const request = { token: "test", char_id: 1, depot_action: "retrieve", ref: "depot-a" };
  const result = await api(db, request);
  assert.equal(result.code, 200); assert.equal(result.body.depot.length, 0);
  const reconnected = JSON.parse(stored.data); S.applySharedToPlayer(reconnected, shared);
  assert.equal(reconnected.bag["demon-armor"], 1);
  assert.equal(reconnected.depot.length, 0);
  assert.equal(reconnected.itemInstances.find((i) => i.id === "depot-a").tier, 2);
  assert.equal((await api(db, request)).code, 400);
  allowed = false; assert.equal((await api(db, request)).code, 423);
  allowed = true; stored.account_id = 10;
  assert.equal((await api(db, request)).code, 403);
});

function player() {
  return { id: "1", voc: "knight", level: 600, cap: 5000, bag: {}, lootPouch: {},
    depot: ["depot-a"], equip: { armor: { item: "plate-armor", instId: "equipped-b", count: 1 } },
    itemInstances: [{ id: "depot-a", slug: "demon-armor", tier: 2, loc: "depot", charges: 150 },
      { id: "equipped-b", slug: "plate-armor", tier: 1, loc: "equip:armor" }] };
}
test("authoritative depot withdrawal preserves identity, tier and charges without duplicating", () => {
  const p = player();
  assert.equal(typeof E.depotActionAuth, "function");
  assert.equal(E.depotActionAuth(p, { action: "retrieve", ref: "depot-a" }).ok, true);
  assert.deepEqual(p.depot, []);
  const inst = p.itemInstances.find((i) => i.id === "depot-a");
  assert.equal(inst.loc, "bag"); assert.equal(inst.tier, 2); assert.equal(inst.charges, 150);
  assert.equal(p.itemInstances.length, 2);
  assert.equal(E.depotActionAuth(p, { action: "retrieve", ref: "depot-a" }).ok, false);
});
test("depot equip swaps the old item into depot and persists both instance locations", () => {
  const p = player();
  assert.equal(typeof E.depotActionAuth, "function");
  assert.equal(E.depotActionAuth(p, { action: "equip", ref: "depot-a" }).ok, true);
  assert.equal(p.equip.armor.item, "demon-armor");
  assert.equal(p.equip.armor.instId, "depot-a");
  assert.deepEqual(p.depot, ["equipped-b"]);
  assert.equal(p.itemInstances.find((i) => i.id === "depot-a").loc, "equip:armor");
  assert.equal(p.itemInstances.find((i) => i.id === "equipped-b").loc, "depot");
});
test("a partial charged accessory keeps its charges and never consumes another full stack", () => {
  const p = player(); p.equip = {}; p.bag = { "might-ring": 4 }; p.depot = ["partial"];
  p.itemInstances = [{ id: "partial", slug: "might-ring", loc: "depot", tier: 0, charges: 3, _chargeAcc: 400 }];
  assert.equal(E.depotActionAuth(p, { action: "equip", ref: "partial" }).ok, true);
  assert.equal(p.equip.ring.charges, 3); assert.equal(p.bag["might-ring"], 4);
  assert.equal(E.depotActionAuth(p, { action: "store", ref: "partial", source: "equip", slot: "ring" }).ok, true);
  assert.equal(p.itemInstances[0].charges, 3); assert.equal(p.itemInstances[0]._chargeAcc, 400);
  assert.equal(p.itemInstances[0].loc, "depot"); assert.equal(p.bag["might-ring"], 4);
});

test("depot store persists equipment removal and rejects unknown refs without mutation", () => {
  const p = player();
  assert.equal(typeof E.depotActionAuth, "function");
  assert.equal(E.depotActionAuth(p, { action: "store", ref: "equipped-b" }).ok, true);
  assert.ok(!p.equip.armor);
  assert.deepEqual(p.depot, ["depot-a", "equipped-b"]);
  const before = JSON.stringify(p);
  assert.equal(E.depotActionAuth(p, { action: "retrieve", ref: "forged" }).ok, false);
  assert.equal(JSON.stringify(p), before);
});
