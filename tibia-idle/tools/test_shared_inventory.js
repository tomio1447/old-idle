/* Regressão: containers POR CONTA (bag, lootPouch, depot, reward chest).
 *
 * Depois da mudança, os 4 containers deixam de ser por personagem: todos os
 * personagens da conta veem o MESMO estado (alterar em um reflete nos demais).
 * Storage: accounts.shared_inventory (v1) + mirror no data de cada personagem.
 *
 * 1. shared_inventory.js (módulo puro): apply/extract/merge com regras da conta
 *    (instâncias equipadas ficam por personagem; depot cap 30; ids ai-<seq>).
 * 2. JsonStore: migração lazy do shared a partir dos chars, persistência em
 *    accounts.shared_inventory e extração no TICK TERMINAL da instância
 *    (instanceAuthorityTick/instanceWorkerClaim) com mirror no data do char.
 * 3. Fios de integração: server.js (loadCharacter aplica shared, saves de
 *    cidade extraem/hidratam, prepareInstanceState hidrata membros) e cliente
 *    (accountApplySharedInventory nas respostas das APIs de container).
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
function must(v, m) { if (!v) throw Error("FALHOU: " + m); }
const root = path.join(__dirname, "..");

/* ---------------- 0. módulo puro ---------------- */
const Shared = require(path.join(root, "server", "shared_inventory"));

const s0 = Shared.emptySharedInventory();
must(s0.v === 1 && Array.isArray(s0.depot) && Array.isArray(s0.itemInstances), "formato v1 do shared");

/* apply → extract round-trip (instância equipada permanece no personagem) */
{
  const shared = Shared.emptySharedInventory();
  const p = {
    bag: { "health-potion": 12 },
    lootPouch: { "gold-coin": 300 },
    depot: ["ai-1", "ai-2"],
    rewardChest: { x: 1 },
    rewardChestBundles: [{ bundleId: "b1" }],
    itemInstances: [
      { id: "i-9", slug: "fire-sword", loc: "equip:weapon", tier: 0 },
      { id: "ai-1", slug: "fire-sword", loc: "depot", tier: 1 },
      { id: "ai-2", slug: "steel-helmet", loc: "depot", tier: 0 },
      { id: "i-7", slug: "health-potion", loc: "bag", tier: 0 },
    ],
    _itemInstSeq: 42,
  };
  Shared.applySharedToPlayer(p, shared);
  must(p.bag["health-potion"] === undefined && p.lootPouch["gold-coin"] === undefined,
    "apply do shared vazio zera os containers do player");
  must(!p.itemInstances.some((i) => i.loc === "bag" || i.loc === "depot"), "apply remove instâncias bag/depot do player");
  must(p.itemInstances.some((i) => i.loc === "equip:weapon"), "apply preserva instância equipada");
  // agora bota coisa no shared e extrai do player
  const shared2 = Shared.emptySharedInventory();
  const p2 = {
    bag: { "mana-potion": 5, "steel-helmet": 2 },
    lootPouch: { "gold-coin": 77 },
    depot: [],
    rewardChest: { a: 1 },
    rewardChestBundles: [],
    itemInstances: [
      { id: "i-1", slug: "steel-helmet", loc: "bag", tier: 0 },
      { id: "i-2", slug: "fire-sword", loc: "equip:weapon", tier: 0 },
      { id: "i-3", slug: "mana-potion", loc: "bag", tier: 0 },
    ],
    _itemInstSeq: 7,
  };
  Shared.extractSharedFromPlayer(p2, shared2);
  must(shared2.bag["mana-potion"] === 5 && shared2.bag["steel-helmet"] === 2, "extract copia bag para o shared");
  must(shared2.lootPouch["gold-coin"] === 77, "extract copia lootPouch");
  must(shared2.itemInstances.length === 2, "extract só leva instâncias não-equipadas");
  must(p2.itemInstances.length === 1 && p2.itemInstances[0].loc === "equip:weapon", "extract deixa equipada no char");
  must(shared2.seq >= 7, "extract herda o seq do player");
  Shared.applySharedToPlayer(p2, shared2);
  must(p2.bag["mana-potion"] === 5 && p2.itemInstances.length === 3, "apply espelha o shared de volta");
}

/* merge de chars (migração lazy) */
{
  const shared = Shared.emptySharedInventory();
  const chars = [
    { data: JSON.stringify({
        bag: { "health-potion": 10, "sword": 1 },
        lootPouch: { "gold-coin": 50 },
        depot: ["i-a1"],
        itemInstances: [{ id: "i-a1", slug: "sword", loc: "depot" }, { id: "i-e1", slug: "axe", loc: "equip:weapon" }],
      }) },
    { data: JSON.stringify({
        bag: { "health-potion": 4, "rope": 1 },
        lootPouch: { "gold-coin": 25 },
        depot: ["i-b1"],
        itemInstances: [{ id: "i-b1", slug: "rope", loc: "depot" }],
      }) },
  ];
  Shared.mergeCharContainers(shared, chars);
  must(shared.bag["health-potion"] === 14 && shared.bag["rope"] === 1 && shared.bag["sword"] === 1, "merge soma bag");
  must(shared.lootPouch["gold-coin"] === 75, "merge soma lootPouch");
  must(shared.depot.length === 2, "merge concatena depot");
  must(shared.itemInstances.length === 2, "merge só leva bag/depot (equipada fica no char)");
  must(shared.itemInstances.every((i) => /^ai-/.test(String(i.id || ""))), "merge re-numera instâncias no escopo da conta");
  must(new Set(shared.itemInstances.map((i) => i.id)).size === 2, "ids do shared são únicos");
  // cap de 30 slots do depot
  const many = Array.from({ length: 40 }, (_, k) => ({ data: JSON.stringify({ depot: ["slot-" + k] }) }));
  const s2 = Shared.emptySharedInventory();
  Shared.mergeCharContainers(s2, many);
  must(s2.depot.length === 30, "depot respeita cap de 30 slots");
}

/* ---------------- 1. JsonStore (db.js sem MySQL) ---------------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shared-inv-"));
process.env.GLOBAL_IDLE_DATA_DIR = tmp;
process.env.MYSQL_HOST = "";
const { getDb } = require(path.join(root, "server", "db"));

(async () => {
const db = await getDb();

must(typeof db.accountSharedInventory === "function" && typeof db.setAccountSharedInventory === "function",
  "db tem accountSharedInventory/setAccountSharedInventory");

const acc = db.createAccount("conta-shared", "hash", "user", 0);
const c1 = db.createCharacter(acc.id, "Char Um", "knight", 100, JSON.stringify({
  gold: 0, bag: { "health-potion": 3 }, lootPouch: {}, depot: [], itemInstances: [],
}));
const c2 = db.createCharacter(acc.id, "Char Dois", "paladin", 80, JSON.stringify({
  gold: 0, bag: { "health-potion": 7, "arrow": 20 }, lootPouch: { "gold-coin": 9 }, depot: [], itemInstances: [],
}));

/* migração lazy: primeiro acesso junta os containers dos dois chars */
const shared = db.accountSharedInventory(acc.id);
must(shared.bag["health-potion"] === 10 && shared.bag["arrow"] === 20, "migração lazy soma a bag dos chars");
must(shared.lootPouch["gold-coin"] === 9, "migração lazy soma a pouch dos chars");

/* persistência: um novo JsonStore (mesmo diretório) relê o shared gravado */
db.setAccountSharedInventory(acc.id, Object.assign({}, shared, { bag: Object.assign({}, shared.bag, { "health-potion": 42 }) }));
const dbPath = require.resolve(path.join(root, "server", "db"));
delete require.cache[dbPath];
const db2 = await require(dbPath).getDb();
must(db2.accountSharedInventory(acc.id).bag["health-potion"] === 42, "shared persiste em accounts.shared_inventory");

/* tick terminal da instância extrai os containers do projection p/ o shared */
{
  const now = Date.now();
  const lease = db.leaseAcquire(acc.id, "h1", null, "x", "secret-1", now, now + 60000);
  must(lease.ok, "lease adquirida");
  const state = JSON.stringify({ authority: { players: [{ id: String(c1.id), p: { id: c1.id, name: "Char Um" } }] } });
  const save = db.instanceSave(acc.id, "a".repeat(64), 0, { saved_at: new Date(now).toISOString(), kind: "hunt", hunt_id: "x" }, state, { holderId: "h1", secretHash: "secret-1", now });
  must(save.ok, "instância criada");
  const row = db.instanceGet(acc.id);
  const projection = {
    id: Number(c1.id), data: JSON.stringify({
      gold: 0, level: 100, voc: "knight",
      bag: { "health-potion": 4, "loot-item": 2 },
      lootPouch: { "gold-coin": 123 },
      depot: [],
      rewardChest: { fake: "stale" }, rewardChestBundles: [],
      itemInstances: [
        { id: "i-1", slug: "loot-item", loc: "bag", tier: 0 },
        { id: "i-2", slug: "axe", loc: "equip:weapon", tier: 0 },
      ],
      _itemInstSeq: 5,
    }),
    level: 100, voc: "knight", hp: 500, mp: 100, max_hp: 500, max_mp: 100,
  };
  const advance = (serialized, elapsed, checkpoint) => ({
    state: serialized, characters: [projection], terminalReason: "test-end",
  });
  const ticked = db.instanceAuthorityTick(acc.id, Number(row.version), now + 1000, 3600000, advance,
    { holderId: "h1", secretHash: "secret-1", now: now + 1000 });
  must(ticked.ok && ticked.terminalReason === "test-end", "tick terminal ok");
  const after = db.accountSharedInventory(acc.id);
  must(after.bag["loot-item"] === 2 && after.bag["health-potion"] === 4, "tick terminal extrai a bag pro shared");
  must(after.lootPouch["gold-coin"] === 123, "tick terminal extrai a pouch pro shared");
  must(after.itemInstances.length === 1 && after.itemInstances[0].slug === "loot-item", "tick terminal leva instâncias bag");
  must(!after.itemInstances.some((i) => i.loc === "equip:weapon"), "equipada não vai pro shared no tick");
  const mirror = db.findCharacter(c1.id);
  const mirrorData = typeof mirror.data === "string" ? JSON.parse(mirror.data) : mirror.data;
  must(mirrorData.bag["loot-item"] === 2 && mirrorData.lootPouch["gold-coin"] === 123, "mirror do char espelha o shared");
  must(mirrorData.itemInstances.some((i) => i.loc === "equip:weapon"), "equipada continua no data do char");
  // rewardChest é server-owned: o valor fake/stale do projection NÃO vaza
  must(!after.rewardChest || !after.rewardChest.fake, "rewardChest do shared é preservado no tick");
}

/* convidado com OUTRA instância ativa não tem o shared sobrescrito no tick */
{
  const accB = db.createAccount("conta-b", "hash", "user", 0);
  const cB = db.createCharacter(accB.id, "Char B", "druid", 50, JSON.stringify({
    gold: 0, bag: { "rope": 1 }, lootPouch: {}, depot: [], itemInstances: [],
  }));
  const now = Date.now();
  db.leaseAcquire(accB.id, "hb", null, "x", "secret-b", now, now + 60000);
  const ownState = JSON.stringify({ authority: { players: [{ id: String(cB.id), p: {} }] } });
  const own = db.instanceSave(accB.id, "b".repeat(64), 0, { saved_at: new Date(now).toISOString(), kind: "hunt", hunt_id: "y" }, ownState,
    { holderId: "hb", secretHash: "secret-b", now });
  must(own.ok, "instância própria da conta B ativa");
  const sharedB0 = db.accountSharedInventory(accB.id);
  // conta A termina um party cujo projection inclui o char da conta B (stale)
  const rowA = db.instanceGet(acc.id);
  if (rowA && rowA.status === "active") {
    const projection = {
      id: Number(cB.id), data: JSON.stringify({
        gold: 0, bag: { "rope": 1, "party-loot": 9 }, lootPouch: {}, depot: [], itemInstances: [],
      }),
      level: 50, voc: "druid", hp: 100, mp: 50, max_hp: 100, max_mp: 50,
    };
    const advance = (serialized) => ({ state: serialized, characters: [projection], terminalReason: "test-party-end" });
    db.instanceAuthorityTick(acc.id, Number(rowA.version), now + 2000, 3600000, advance,
      { holderId: "h1", secretHash: "secret-1", now: now + 2000 });
  }
  const sharedB1 = db.accountSharedInventory(accB.id);
  must(sharedB1.bag["rope"] === sharedB0.bag["rope"] && sharedB1.bag["party-loot"] === sharedB0.bag["party-loot"],
    "tick terminal não sobrescreve o shared de conta com instância própria ativa");
}

/* worker claim terminal também extrai */
{
  const accW = db.createAccount("conta-w", "hash", "user", 0);
  const cW = db.createCharacter(accW.id, "Char W", "sorcerer", 60, JSON.stringify({
    gold: 0, bag: {}, lootPouch: {}, depot: [], itemInstances: [],
  }));
  const now = Date.now();
  const state = JSON.stringify({ authority: { players: [{ id: String(cW.id), p: {} }] } });
  db.leaseAcquire(accW.id, "hw", null, "x", "secret-w", now, now + 60000);
  const save = db.instanceSave(accW.id, "c".repeat(64), 0, { saved_at: new Date(now).toISOString(), kind: "hunt", hunt_id: "z" }, state,
    { holderId: "hw", secretHash: "secret-w", now });
  must(save.ok, "instância W criada");
  // worker só roda sem lease ativo
  db.leaseRelease(accW.id, "hw", "secret-w");
  const projection = {
    id: Number(cW.id), data: JSON.stringify({
      gold: 0, bag: { "torch": 2 }, lootPouch: { "gold-coin": 5 }, depot: [], itemInstances: [],
    }),
    level: 60, voc: "sorcerer", hp: 100, mp: 100, max_hp: 100, max_mp: 100,
  };
  const advance = (serialized) => ({ state: serialized, characters: [projection], terminalReason: "test-timeout" });
  const claimed = db.instanceWorkerClaim(accW.id, now + 5000, 3600000, 500, advance);
  must(claimed.ok && claimed.terminalReason === "test-timeout", "worker claim terminal ok");
  const sharedW = db.accountSharedInventory(accW.id);
  must(sharedW.bag["torch"] === 2 && sharedW.lootPouch["gold-coin"] === 5, "worker terminal extrai pro shared");
}

/* ---------------- 2. fios de integração (estático) ---------------- */
{
  const serverSrc = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  const dbSrc = fs.readFileSync(path.join(root, "server", "db.js"), "utf8");
  const clientSrc = fs.readFileSync(path.join(root, "game", "js", "account-client.js"), "utf8");
  must(serverSrc.includes('SharedInv.applySharedToPlayer(parsed, sharedInventory)'), "loadCharacter aplica o shared");
  must(serverSrc.includes("async function loadCityPlayer(db, acc, character)"), "server hidrata player de cidade");
  must(serverSrc.includes("loadCityPlayer(db,acc,character)"), "rotas de cidade usam o player hidratado");
  must(serverSrc.includes("SharedInv.applySharedToPlayer(canonical,shared)"), "prepareInstanceState hidrata membros");
  must(dbSrc.includes('ALTER TABLE accounts ADD COLUMN shared_inventory MEDIUMTEXT NULL'), "ALTER shared_inventory no schema");
  must(dbSrc.includes("sharedInvExtractMirror"), "db.js tem extração com mirror");
  must(clientSrc.includes("function accountApplySharedInventory"), "cliente aplica sharedInventory");
  must(clientSrc.includes("accountMaybeApplyShared(r.data)"), "cliente aplica shared nas respostas das APIs");
}

/* ---------------- 3. round-trip de cidade (lógica do split) ---------------- */
{
  // Simula o fluxo do saveCharacter comum: bag/depot vêm do cliente,
  // pouch/reward ficam do shared.
  const shared = Shared.emptySharedInventory();
  const p = {
    bag: { "a": 1 }, lootPouch: { "stale": 1 }, depot: [], itemInstances: [],
    rewardChest: { "stale": true }, rewardChestBundles: [],
  };
  Shared.extractSharedFromPlayer(p, shared);           // extrai do cliente
  shared.lootPouch = { "server-owned": 5 };            // preserved (split comum)
  shared.rewardChest = { "server-owned": true };
  Shared.applySharedToPlayer(p, shared);               // mirror
  must(p.lootPouch["server-owned"] === 5 && p.lootPouch["stale"] === undefined, "pouch do shared preservada no save comum");
  must(p.rewardChest["server-owned"] === true && p.rewardChest["stale"] === undefined, "reward chest do shared preservado");
  must(p.bag["a"] === 1, "bag do cliente entra no shared");
}

console.log("ok: shared inventory (containers por conta)");
})().catch((e) => { console.error(e.message); process.exit(1); });
