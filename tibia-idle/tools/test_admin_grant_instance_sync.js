"use strict";
/* test_admin_grant_instance_sync.js — grant admin num personagem DENTRO de
 * instância multi-char da mesma conta deve propagar as instâncias novas às
 * cópias compartilhadas dos demais membros.
 *
 * Bug real (soulpiercer no Pally): applyAdminPlayerToInstance trocava só o
 * item.p do alvo. O itemInstances dos outros membros da conta ficava sem a
 * instância nova; na próxima mutação de bag de OUTRO membro,
 * syncInstancePouchCopies tratava a cópia do executor como canônica e
 * DESTRUÍA a instância do alvo — a bag count ficava órfã (equip falhava
 * com "Item não está na mochila") até authSyncBagCountsFromInstances
 * limpar a contagem: o item sumia sem equipar.
 *
 * Run: node tools/test_admin_grant_instance_sync.js
 */
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../server/authoritative_engine");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");

function loadApply() {
  const source = fs.readFileSync(path.join(__dirname, "../server/server.js"), "utf8");
  const start = source.indexOf("async function applyAdminPlayerToInstance(");
  const end = source.indexOf("\nasync function splitSharedInventory", start);
  assert.ok(start >= 0 && end > start, "applyAdminPlayerToInstance não encontrado no server.js");
  let patched = null;
  const s = source.indexOf("function syncInstancePouchCopies(");
  const e = source.indexOf("\n/* Grava o resultado sincronizado", s);
  const syncCopies = vm.runInNewContext(source.slice(s, e) + "\nsyncInstancePouchCopies;");
  const ctx = {
    syncInstancePouchCopies: syncCopies,
    cloneJson: (v) => JSON.parse(JSON.stringify(v)),
    materializeAuthority: (d) => d,
    resolveInstanceRow: async () => ({ row: { account_id: 9, instance_id: "inst", status: "active", version: 5 } }),
    publishInstanceForRow: async () => {},
    instanceSummary: () => ({}),
    persistSharedPouchSync: async () => {},
    leaseHash: () => "x",
  };
  const fn = vm.runInNewContext(source.slice(start, end) +
    "\napplyAdminPlayerToInstance;", ctx);
  const db = {
    instancePatchState: async (accId, reqId, instId, version, mut, lease) => {
      const serialized = JSON.stringify(patched);
      const out = mut(serialized);
      if (out == null) return { ok: false, error: "INSTANCE_PATCH_REJECTED" };
      patched = JSON.parse(out);
      return { ok: true, instance: { instance_id: instId, version: version + 1, status: "active" } };
    },
  };
  return { fn, db, getPatched: () => patched, setPatched: (d) => { patched = d; } };
}

function members() {
  return [
    { id: "1", accountId: 9, p: { id: "1", name: "Kina", accountId: 9,
      bag: { "health-potion": 5 }, lootPouch: {}, supplyStash: {}, itemInstances: [], equip: {} } },
    { id: "2", accountId: 9, p: { id: "2", name: "Pally", accountId: 9,
      bag: { "health-potion": 5 }, lootPouch: {}, supplyStash: {}, itemInstances: [],
      equip: { weapon: { item: "falcon-bow", count: 1 } } } },
  ];
}

test("grant admin em char de instância propaga a instância nova às cópias da conta", async () => {
  const { fn, db, getPatched, setPatched } = loadApply();
  setPatched({ authority: { players: members() }, members: [] });
  const grant = { id: "2", name: "Pally", voc: "paladin", level: 1000, accountId: 9,
    bag: { "health-potion": 5, "soulpiercer": 1 }, lootPouch: {}, supplyStash: {},
    itemInstances: [{ id: "it-grant", slug: "soulpiercer", loc: "bag", tier: 0 }],
    equip: { weapon: { item: "falcon-bow", count: 1 } } };
  const acc = { id: 9 };
  const r = await fn(db, acc, 2, grant, null, 9);
  assert.equal(r.ok, true);
  const players = getPatched().authority.players;
  const kina = players.find((e) => e.id === "1"), pally = players.find((e) => e.id === "2");
  assert.ok(pally.p.itemInstances.some((i) => i.slug === "soulpiercer" && i.loc === "bag"),
    "alvo perdeu a instância do grant");
  assert.ok(kina.p.itemInstances.some((i) => i.slug === "soulpiercer" && i.loc === "bag"),
    "cópia do outro membro não recebeu a instância do grant");
  assert.equal(kina.p.bag["soulpiercer"], 1, "delta da bag não propagou ao líder");
});

test("após o grant propagado, mutação de outro membro não destrói a instância", async () => {
  const { fn, db, getPatched, setPatched } = loadApply();
  setPatched({ authority: { players: members() }, members: [] });
  const grant = { id: "2", name: "Pally", voc: "paladin", level: 1000, accountId: 9,
    bag: { "health-potion": 5, "soulpiercer": 1 }, lootPouch: {}, supplyStash: {},
    itemInstances: [{ id: "it-grant", slug: "soulpiercer", loc: "bag", tier: 0 }], equip: {} };
  const r = await fn(db, { id: 9 }, 2, grant, null, 9);
  assert.equal(r.ok, true);
  // Segunda mutação: o líder move vende/move um item qualquer — o sync
  // trata a cópia do executor como canônica. A instância concedida ao
  // Pally precisa estar nela agora (foi propagada no grant).
  const src = fs.readFileSync(path.join(__dirname, "../server/server.js"), "utf8");
  const s = src.indexOf("function syncInstancePouchCopies(");
  const e = src.indexOf("\n/* Grava o resultado sincronizado", s);
  const sync = vm.runInNewContext(src.slice(s, e) + "\nsyncInstancePouchCopies;");
  const players = getPatched().authority.players;
  players[0].p.bag["health-potion"] = 4; // consumiu 1
  sync(players, "1", { bag: { "health-potion": 5, "soulpiercer": 1 }, pouch: {} });
  const pally = players.find((x) => x.id === "2");
  assert.ok(pally.p.itemInstances.some((i) => i.slug === "soulpiercer" && i.loc === "bag"),
    "mutação posterior do líder destruiu a instância concedida");
  // E o equip real da autoridade encontra a instância e equipa.
  const eq = E.equipFromContainerAuth(pally.p, "soulpiercer", "bag", { instId: "it-grant" });
  assert.equal(eq.ok, true, "equip na autoridade falhou: " + (eq && eq.msg));
  assert.equal(pally.p.equip.weapon.item, "soulpiercer");
});
