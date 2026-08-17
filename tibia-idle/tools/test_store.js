/* Regressão: STORE — catálogo, VIP, ledger, rotas e UI. */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const store = require(path.join(root, "server", "store.js"));

function must(ok, msg) { if (!ok) throw new Error(msg); }

function mockDb(opts) {
  opts = opts || {};
  const accounts = [{
    id: 1, login: "player", coins: 100, role: opts.role || "user", vip_until: 0,
  }];
  const orders = [];
  const ledger = [];
  let oid = 0;
  return {
    accounts, orders, ledger,
    findAccountByToken: async (t) => t === "tok" ? accounts[0] : null,
    findAccountById: async (id) => accounts.find((a) => Number(a.id) === Number(id)) || null,
    updateCoins: async (id, coins) => {
      const a = accounts.find((x) => Number(x.id) === Number(id));
      if (a) a.coins = Math.max(0, coins);
      return a;
    },
    setAccountVipUntil: async (id, until) => {
      const a = accounts.find((x) => Number(x.id) === Number(id));
      if (a) a.vip_until = until;
      return a;
    },
    storeOrderInsert: async (row) => {
      const order = Object.assign({ id: ++oid }, row);
      orders.push(order);
      return order;
    },
    storeOrderGet: async (id) => orders.find((o) => String(o.id) === String(id)) || null,
    storeOrderUpdate: async (id, patch) => {
      const order = orders.find((o) => String(o.id) === String(id));
      if (!order) return null;
      Object.assign(order, patch || {});
      return order;
    },
    storeOrderList: async () => orders.slice().reverse(),
    storeOrdersByAccount: async (accountId) =>
      orders.filter((o) => Number(o.accountId) === Number(accountId)),
    coinLedgerAdd: async (row) => { ledger.push(Object.assign({ id: ledger.length + 1 }, row)); return row; },
    coinLedgerList: async (q) => {
      let list = ledger.slice();
      if (q && q.accountId != null)
        list = list.filter((r) => Number(r.accountId) === Number(q.accountId));
      return list.slice().reverse();
    },
    listAccountCoinSummaries: async () => accounts.map((a) => ({
      id: a.id, login: a.login, coins: a.coins, vipUntil: a.vip_until, role: a.role,
    })),
  };
}

must(store.COIN_PACKS.length === 7, "catálogo deve ter 7 pacotes de TC");
must(store.VIP_PACKS.length === 3, "VIP 1/7/30 dias");
must(store.COIN_PACKS.some((p) => p.best && p.id === "tc10000"), "pacote 10k é o melhor valor");
const cat = store.catalog();
must(cat.ok && cat.packs[0].total === 100, "catalog() expõe total de coins");
must(cat.cardSurcharge === 1.1, "cartão +10%");

(async () => {
  const db = mockDb();
  const checkout = await store.checkout(db, { token: "tok", packId: "tc100", method: "pix" }, {}, { testServer: true });
  must(checkout.code === 200 && checkout.body.ok && checkout.body.order, "checkout TEST_SERVER sem MP");
  must(checkout.body.order.status === "pending", "pedido começa pending");
  must(db.accounts[0].coins === 100, "não credita antes do pagamento");

  const paid = await store.simulatePay(db, { token: "tok", orderId: checkout.body.order.id }, { testServer: true });
  must(paid.code === 200 && paid.body.ok, "simulatePay no TEST_SERVER");
  must(db.accounts[0].coins === 200, "tc100 credita 100 coins");
  must(paid.body.order.status === "paid", "pedido marcado paid");
  must(db.ledger.some((l) => l.kind === "purchase" && l.delta === 100), "ledger de compra");

  const again = await store.simulatePay(db, { token: "tok", orderId: checkout.body.order.id }, { testServer: true });
  must(db.accounts[0].coins === 200, "simulatePay é idempotente");
  must(again.body.order.status === "paid", "segundo simulate não reabre pedido");

  const vip = await store.buyVip(db, { token: "tok", packId: "vip1" });
  must(vip.code === 200 && vip.body.ok, "compra VIP");
  must(db.accounts[0].coins === 175, "VIP 1 dia custa 25 TC");
  must(db.accounts[0].vip_until > Date.now(), "vip_until no futuro");
  must(db.ledger.some((l) => l.kind === "spend" && l.delta === -25), "ledger de gasto VIP");

  const denied = await store.adminSummary(db, "tok");
  must(denied.code === 403, "jogador comum não vê faturamento");
  const adminOk = await store.adminSummary(db, "tok", { testServer: true });
  must(adminOk.code === 200 && adminOk.body.totals.revenueBrl === 10, "faturamento R$ 10 do pacote 100");
  must(adminOk.body.totals.coinsSold === 100 && adminOk.body.totals.coinsSpent === 25, "totais sold/spent");

  const hook = await store.webhook(db, {}, { get: () => null });
  must(hook.code === 200 && hook.body.ignored, "webhook sem id é ignorado");

  const noTok = await store.checkout(db, { token: "nope", packId: "tc100" }, {}, { testServer: true });
  must(noTok.code === 401, "checkout exige sessão");

  const server = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  const dbjs = fs.readFileSync(path.join(root, "server", "db.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(root, "game", "js", "store-ui.js"), "utf8");
  const client = fs.readFileSync(path.join(root, "game", "js", "account-client.js"), "utf8");
  const env = fs.readFileSync(path.join(root, "server", ".env.example"), "utf8");
  for (const route of [
    "/api/store/catalog", "/api/store/checkout", "/api/store/orders/",
    "/api/store/simulate", "/api/store/vip", "/api/store/history",
    "/api/store/admin", "/api/store/mp/webhook",
  ]) must(server.includes(route), "servidor sem rota " + route);
  must(server.includes('require("./store")'), "server.js não carrega store.js");
  must(server.includes("store.recordGrant"), "grant admin não entra no ledger");
  must(dbjs.includes("CREATE TABLE IF NOT EXISTS store_orders") &&
    dbjs.includes("CREATE TABLE IF NOT EXISTS coin_ledger"), "schema MySQL da STORE ausente");
  must(html.includes('id="btn-store"') && html.includes("store-ui.js"), "botão/script STORE ausente");
  must(ui.includes('id: "sell"') && ui.includes("BETA") && ui.includes("openStoreModal"),
    "UI sem aba vender coins / beta");
  must(client.includes("/api/store/checkout") && client.includes("storeAdminSummary"),
    "account-client sem wrappers da STORE");
  must(env.includes("MP_ACCESS_TOKEN") && env.includes("PUBLIC_BASE_URL"),
    ".env.example sem variáveis do Mercado Pago");
  console.log("OK: STORE (pacotes, VIP, ledger, rotas, UI) está ligada.");
})().catch((e) => { console.error(e); process.exit(1); });
