/* Regressão: cliques (claim de reward / equip / syncs de container) não
 * podem travar o servidor nem perder itens.
 *
 * Causas cobertas:
 *  - shared_inventory: todo read-modify-write roda dentro de
 *    accountSharedInventoryMutate (SELECT FOR UPDATE + UPDATE na mesma tx)
 *    — o write solto era last-writer-wins contra o tick (reward "voltava",
 *    item equipado "sumia").
 *  - instancePatchState: caminho quente (descritor em memória + mutex) para
 *    world boss/PvP — o patch não parseia/serializa ~5MB segurando row lock
 *    enquanto ~15 contas tickam a mesma row.
 *  - claim dentro de instância: chestRemoval aplica o delta de remoção no
 *    shared vivo + refs de chest unificadas (nada ressuscita o baú).
 *  - equip: retry de INSTANCE_VERSION_CONFLICT no servidor (4x) e no
 *    cliente (1x) — o preview otimista não reverte por um tick alheio.
 */
"use strict";
const fs = require("fs"), path = require("path");
const dbSource = fs.readFileSync(path.join(__dirname, "..", "server", "db.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
const storeSource = fs.readFileSync(path.join(__dirname, "..", "server", "store.js"), "utf8");
const wbSource = fs.readFileSync(path.join(__dirname, "..", "server", "world_boss.js"), "utf8");
const clientSource = fs.readFileSync(path.join(__dirname, "..", "game", "js", "account-client.js"), "utf8");
const os = require("os");
// JsonStore real via getDb() com DATA_DIR em temp (sem MySQL, sem disco real).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gi-atomic-"));
process.env.GLOBAL_IDLE_DATA_DIR = tmp;
delete process.env.MYSQL_HOST;
const SharedInv = require("../server/shared_inventory");
const { getDb } = require("../server/db");
const engine = require("../server/authoritative_engine");
function must(ok, msg) { if (!ok) throw Error(msg); }

// ---------------------------------------------------------------- estrutura
must(/async accountSharedInventoryMutate[\s\S]*?FOR UPDATE/.test(dbSource),
  "accountSharedInventoryMutate MySQL sem SELECT FOR UPDATE");
must(/UPDATE accounts SET shared_inventory/.test(dbSource.slice(
  dbSource.indexOf("async accountSharedInventoryMutate"))),
  "accountSharedInventoryMutate não grava o shared na mesma tx");
must(dbSource.includes("JsonStore.prototype.accountSharedInventoryMutate"),
  "JsonStore sem accountSharedInventoryMutate");
must(/instancePatchState[\s\S]*?hotApi\.peek\(row\)/.test(dbSource),
  "instancePatchState sem gate peek (hunt normal entraria no caminho quente e o patch se perderia)");
must(/instancePatchState[\s\S]*?lockValidLease/.test(dbSource),
  "caminho quente do patch sem validação de lease");
must(serverSource.includes("peek:(row)=>pvpAuthCacheGet"),
  "instanceHotAuthApi sem peek");
must(serverSource.includes("db.instanceHotAuthApi=instanceHotAuthApi") ||
     serverSource.includes("db.instanceHotAuthApi = instanceHotAuthApi"),
  "provider hotAuth não injetado no db");
must(/instanceAuthorityTick[\s\S]*?SELECT shared_inventory FROM accounts WHERE id=\? FOR UPDATE/.test(dbSource),
  "tick sem FOR UPDATE na row de accounts");
must(dbSource.includes('SELECT vip_until FROM accounts WHERE id=? FOR UPDATE'),
  "trainingCheckpoint sem FOR UPDATE na row de accounts");

// splitSharedInventory: chest server-owned + remoção atômica + caminho atômico
const splitBody = serverSource.slice(
  serverSource.indexOf("async function splitSharedInventory"),
  serverSource.indexOf("/* Carrega o player de cidade"));
must(/shared\.rewardChest\s*=\s*keep\.rewardChest/.test(splitBody) &&
     /shared\.rewardChestBundles\s*=\s*keep\.rewardChestBundles/.test(splitBody),
  "splitSharedInventory não preserva o chest do shared vivo");
must(/chestRemovalApply\(shared,\s*removal\)/.test(splitBody),
  "splitSharedInventory não aplica o chestRemoval");
must(/db\.accountSharedInventoryMutate\(acc\.id,\s*doSplit\)/.test(splitBody),
  "splitSharedInventory fora da tx atômica");

// claim: diff de remoção + unificação de refs + propagação pro split
must(serverSource.includes("chestRemovalDiff(preChest,preBundles"),
  "claim sem diff pré→pós do chest");
must(serverSource.includes("persistClaimedPlayer(db,acc,fresh||character,claimedPlayer,lease,claimedCount,{chestRemoval:removal})"),
  "claim não passa o chestRemoval pro split");
must(serverSource.includes("entry.p.rewardChest=item.p.rewardChest") &&
     serverSource.includes("entry.p.rewardChestBundles=item.p.rewardChestBundles"),
  "claim não re-unifica refs de chest entre entries da mesma conta");

// syncs soltos convertidos para o Mutate
must(serverSource.includes("async function persistSharedPouchSync") &&
     /persistSharedPouchSync[\s\S]*?accountSharedInventoryMutate/.test(serverSource),
  "persistSharedPouchSync sem caminho atômico");
must(/marketDeliverToDepot[\s\S]*?accountSharedInventoryMutate/.test(serverSource),
  "marketDeliverToDepot sem caminho atômico");
must(storeSource.includes("accountSharedInventoryMutate"),
  "voucher da store gravando shared solto");
must(wbSource.includes("accountSharedInventoryMutate"),
  "world boss top-up de bundle gravando shared solto");

// equip: retry de conflito no servidor e no cliente
const equipBody = serverSource.slice(
  serverSource.indexOf("async function equipInstanceItem"),
  serverSource.indexOf("function removeSharedItemFromMember"));
must(equipBody.includes("attempt<4") && equipBody.includes("Number(current.version)"),
  "equipInstanceItem sem retry com version fresca");
must(clientSource.includes("INSTANCE_VERSION_CONFLICT") && /accountEquipItem[\s\S]*?attempt<2/.test(clientSource),
  "cliente sem retry único de INSTANCE_VERSION_CONFLICT no equip");
// End de instância: abandonar no 1º 409 deixava a row 'active' — todo create
// seguinte apanhava 409 até o watchdog de 45s ("servidor não confirmou").
must(/accountEndInstance[\s\S]*?attempt<4/.test(clientSource),
  "accountEndInstance sem retry de INSTANCE_VERSION_CONFLICT");
must(clientSource.includes('"replaced-stale"'),
  "create não encerra a row stale ativa que bloqueia novas instâncias");

// ------------------------------------------------------------- funcionais
async function main() {
const store = await getDb();
// 1) JsonStore.accountSharedInventoryMutate: aplica e aborta
{
  store.accounts = [{ id: 9, token: "t", shared_inventory: null }];
  const s1 = store.accountSharedInventoryMutate(9, (s) => { s.bag.rope = 3; });
  must(s1 && s1.bag.rope === 3, "Mutate JsonStore não aplicou a mutação");
  const before = JSON.stringify(store.accountSharedInventory(9));
  const aborted = store.accountSharedInventoryMutate(9, (s) => { s.bag.rope = 99; return false; });
  must(aborted === null && JSON.stringify(store.accountSharedInventory(9)) === before,
    "Mutate JsonStore gravou mesmo com retorno false");
}

// 2) pouchDelta: remoção dentro da instância não ressuscita; mudança externa preservada
{
  const base = { sword: 5, rope: 2 };
  const p = { lootPouch: { rope: 2 }, _pouchBase: Object.assign({}, base) }; // vendeu sword
  const out = SharedInv.pouchDelta({ sword: 5, rope: 2 }, p);
  must(out && !out.sword && out.rope === 2, "item vendido na instância ressurgiu na pouch");
  // Mudança externa no shared (ex.: claim creditou pouch) sobrevive ao merge.
  const p2 = { lootPouch: { sword: 5, rope: 2 }, _pouchBase: Object.assign({}, base) };
  const out2 = SharedInv.pouchDelta({ sword: 5, rope: 2, wand: 1 }, p2);
  must(out2 && out2.wand === 1 && out2.sword === 5, "delta da pouch apagou escrita externa do shared");
}

// 3) extractSharedFromPlayer + keep: espelho velho do char não ressuscita o chest
{
  const shared = { v: 1, seq: 0, bag: {}, lootPouch: {}, supplyStash: {}, depot: [],
    itemInstances: [], rewardChest: {}, rewardChestBundles: [] }; // baú já coletado
  const p = { bag: { rope: 1 }, rewardChest: { "gold-coin": 10 }, // espelho PRÉ-claim
    rewardChestBundles: [{ id: "b1", items: { "gold-coin": 10 } }] };
  const keep = {
    rewardChest: Object.assign({}, shared.rewardChest),
    rewardChestBundles: shared.rewardChestBundles.slice(),
  };
  SharedInv.extractSharedFromPlayer(p, shared);
  shared.rewardChest = keep.rewardChest;
  shared.rewardChestBundles = keep.rewardChestBundles;
  must(!shared.rewardChest["gold-coin"] && !shared.rewardChestBundles.length,
    "espelho velho ressuscitou o baú coletado");
  must(shared.bag.rope === 1, "extract perdeu a bag");
}

// 4) Claim em REF compartilhada (shareInstanceContainers): drena a mesma ref
//    — sem reatribuir (reatribuir quebraria a ref e ressuscitaria nos outros).
{
  const a = {}, b = {};
  engine.rewardChestAdd(a, "gold-coin", 10, { bundleId: "b1", bossId: "x", name: "X" });
  b.rewardChest = a.rewardChest; b.rewardChestBundles = a.rewardChestBundles; b.lootPouch = {};
  const ref = a.rewardChestBundles;
  must(engine.rewardChestClaimAll(b) === 10 && ref.length === 0 &&
       a.rewardChestBundles === ref && !a.rewardChest["gold-coin"],
    "claim por ref compartilhada falhou/re-atribuiu a ref");
}

// 5) Instance patch na JsonStore: aplica mutação no descritor (semântica do claim)
{
  store.accounts = [{ id: 5, token: "t" }];
  store.leases = [{ account_id: 5, holder_id: "h", secret_hash: "x", expires_at: new Date(Date.now() + 60000).toISOString() }];
  const descriptor = { v: 1, kind: "boss", authority: { players: [{ id: "7", accountId: 5,
    p: { rewardChest: { "gold-coin": 4 }, rewardChestBundles: [{ id: "b1", items: { "gold-coin": 4 } }], lootPouch: {} } }] },
    state: { events: [] } };
  store.instances = [{ account_id: 5, instance_id: "i".repeat(64), version: 3, status: "active",
    kind: "boss", state: JSON.stringify(descriptor) }];
  const r = store.instancePatchState(5, 5, "i".repeat(64), 3, (ser) => {
    const d = JSON.parse(ser);
    const item = d.authority.players[0].p;
    engine.rewardChestClaimAll(item);
    return JSON.stringify(d);
  }, { holderId: "h", secretHash: "x", now: Date.now() });
  must(r.ok && Number(r.instance.version) === 4, "instancePatchState JsonStore falhou");
  const saved = JSON.parse(store.instances[0].state);
  must(!saved.authority.players[0].p.rewardChest["gold-coin"] &&
       saved.authority.players[0].p.lootPouch["gold-coin"] === 4,
    "patch do claim não persistiu no descritor");
  // Conflito de versão detectado (cliente desatualizado)
  const stale = store.instancePatchState(5, 5, "i".repeat(64), 3, () => "{}", null);
  must(!stale.ok && stale.error === "INSTANCE_VERSION_CONFLICT",
    "versão stale não gerou INSTANCE_VERSION_CONFLICT");
}
console.log("OK: shared_inventory atômico (FOR UPDATE), caminho quente do patch gated por peek, " +
  "chestRemoval no claim, syncs convertidos, retry de equip server+client, pouchDelta e refs de chest.");
}
main().catch((e) => { console.error(e); process.exit(1); });
