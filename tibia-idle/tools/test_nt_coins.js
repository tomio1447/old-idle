/* test_nt_coins.js — NON-TRANSFERABLE TIBIA COINS + voucher DRUWELL.
 *
 * Cobre (JsonStore):
 *  - spendStoreCoins: débito NT-first (coins_nt antes, coins completa),
 *    insuficiência e gasto 100% NT;
 *  - changePreyCards: custo de store também NT-first;
 *  - debitCoins (caminho do market/RMT): NUNCA toca coins_nt — prova de
 *    que o pool não transferível não vaza para canais de troca;
 *  - voucher DRUWELL: +3 dias VIP + montaria roaring-lion + 250 coins_nt,
 *    sem mexer em coins; resgate único por conta;
 *  - montaria roaring-lion registrada no catálogo + sprite presente.
 *
 * Uso: node tools/test_nt_coins.js
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "idle-ntcoins-"));
const prevDir = process.env.GLOBAL_IDLE_DATA_DIR, prevHost = process.env.MYSQL_HOST;
process.env.GLOBAL_IDLE_DATA_DIR = tmp;
process.env.MYSQL_HOST = "";

let db, store;
async function boot() {
  delete require.cache[require.resolve("../server/db.js")];
  delete require.cache[require.resolve("../server/store.js")];
  db = await require("../server/db").getDb();
  store = require("../server/store.js");
}
function seedAccount() {
  db.accounts = [{
    id: 1, login: "ntuser", coins: 100, coins_nt: 250,
    vip_until: 0, cosmetics: {}, shared_inventory: { v: 1, seq: 0, depot: [], itemInstances: [] },
  }];
  db.sessions = [{ account_id: 1, token: "tok-nt" }];
}
process.on("exit", () => {
  if (prevDir === undefined) delete process.env.GLOBAL_IDLE_DATA_DIR; else process.env.GLOBAL_IDLE_DATA_DIR = prevDir;
  if (prevHost === undefined) delete process.env.MYSQL_HOST; else process.env.MYSQL_HOST = prevHost;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("spendStoreCoins debita NT primeiro e completa com coins", async () => {
  await boot(); seedAccount();
  const r = db.spendStoreCoins(1, 300);
  assert.equal(r.ntSpent, 250, "gastou todo o pool NT primeiro");
  assert.equal(r.tSpent, 50, "completou com coins normais");
  assert.equal(r.coins, 50);
  assert.equal(r.coinsNt, 0);
  const a = db.findAccountById(1);
  assert.equal(a.coins, 50);
  assert.equal(a.coins_nt, 0);
});

test("spendStoreCoins 100% NT não toca coins; total insuficiente falha", async () => {
  await boot(); seedAccount();
  const r = db.spendStoreCoins(1, 200);
  assert.equal(r.ntSpent, 200);
  assert.equal(r.coins, 100, "coins normais intocados");
  assert.equal(r.coinsNt, 50);
  assert.equal(db.spendStoreCoins(1, 1000), null, "total insuficiente não debita");
  const a = db.findAccountById(1);
  assert.equal(a.coins, 100);
  assert.equal(a.coins_nt, 50);
});

test("changePreyCards debita custo NT-first", async () => {
  await boot(); seedAccount();
  assert.equal(db.changePreyCards(1, 25, 260), true);
  const a = db.findAccountById(1);
  assert.equal(a.coins_nt, 0);
  assert.equal(a.coins, 90, "10 saíram de coins após esgotar 250 NT");
  assert.equal(a.cosmetics.preyCards, 25);
});

test("debitCoins (market/RMT) nunca toca coins_nt", async () => {
  await boot(); seedAccount();
  assert.equal(db.debitCoins(1, 100), true);
  const a = db.findAccountById(1);
  assert.equal(a.coins, 0);
  assert.equal(a.coins_nt, 250, "pool NT intacto — market/RMT não alcança");
  assert.equal(db.debitCoins(1, 1), false, "sem coins normais, NT não cobre market");
});

test("voucher DRUWELL: +3 dias VIP + roaring-lion + 250 NT, coins intactas, 1x/conta", async () => {
  await boot(); seedAccount();
  const before = Date.now();
  const r = await store.redeemVoucher(db, { token: "tok-nt", code: "druwell" });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const b = r.body;
  assert.equal(b.ok, true);
  assert.equal(b.coins, 100, "coins normais não mudam");
  assert.equal(b.coinsNt, 500, "+250 NT somados ao pool");
  assert.equal(b.cosmetics.mounts["roaring-lion"], true, "montaria na conta");
  const esperado = before + 3 * 24 * 3600 * 1000;
  assert.ok(Math.abs(b.vipUntil - esperado) < 60 * 1000, "3 dias de VIP");
  const a = db.findAccountById(1);
  assert.equal(a.coins_nt, 500);
  assert.equal(a.vip_until, b.vipUntil);
  const cos = typeof a.cosmetics === "string" ? JSON.parse(a.cosmetics) : a.cosmetics;
  assert.equal(cos.mounts["roaring-lion"], true);
  /* Segundo resgate na mesma conta é recusado (voucherClaim único). */
  const r2 = await store.redeemVoucher(db, { token: "tok-nt", code: "DRUWELL" });
  assert.equal(r2.code, 400);
  assert.match(r2.body.msg, /resgatado/i);
  /* VIP empilha sobre vip vigente quando já ativo. */
  const a2 = db.findAccountById(1);
  assert.equal(a2.coins, 100);
});

test("roaring-lion no catálogo de montarias + sprite presente", async () => {
  const A = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../game/data/appearances.json"), "utf8"));
  const m = A.mounts.find((x) => x.id === "roaring-lion");
  assert.ok(m, "mount registrado");
  assert.ok(m.mountId > 0 && m.looktype > 0);
  assert.ok(fs.existsSync(path.join(__dirname,
    "../game/assets/appearance/mount/roaring-lion.base.png")), "sprite base");
  /* O catálogo de cosméticos da store inclui a montaria nova. */
  const cat = store.cosmeticCatalog();
  assert.ok(cat.mounts["roaring-lion"], "cosmeticCatalog reconhece");
});
