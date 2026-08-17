/* store.js — Gamestore: pacotes de TC, VIP, Mercado Pago e ledger.
 *
 * Pagamento automático: Checkout Pro (cartão) + Payments Pix.
 * O crédito de coins só acontece depois que o Mercado Pago confirma
 * `approved` (webhook ou poll). Nunca confie no cliente.
 */
"use strict";

const crypto = require("crypto");
const https = require("https");

const MP_ACCESS_TOKEN = String(process.env.MP_ACCESS_TOKEN || "").trim();
const MP_PUBLIC_KEY = String(process.env.MP_PUBLIC_KEY || "").trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const CARD_SURCHARGE = 1.10;

const COIN_PACKS = [
  { id: "tc100", coins: 100, bonus: 0, brl: 10, label: "100 Coins" },
  { id: "tc250", coins: 250, bonus: 0, brl: 25, label: "250 Coins" },
  { id: "tc500", coins: 500, bonus: 25, brl: 50, label: "500 Coins" },
  { id: "tc1000", coins: 1000, bonus: 100, brl: 100, label: "1.000 Coins" },
  { id: "tc2500", coins: 2500, bonus: 375, brl: 250, label: "2.500 Coins" },
  { id: "tc5000", coins: 5000, bonus: 1000, brl: 500, label: "5.000 Coins" },
  { id: "tc10000", coins: 10000, bonus: 2500, brl: 1000, label: "10.000 Coins", best: true },
];
const VIP_PACKS = [
  { id: "vip1", days: 1, coins: 25, label: "VIP 1 dia" },
  { id: "vip7", days: 7, coins: 75, label: "VIP 7 dias" },
  { id: "vip30", days: 30, coins: 150, label: "VIP 30 dias" },
];

function mpConfigured() { return !!MP_ACCESS_TOKEN; }
function packById(id) { return COIN_PACKS.find((p) => p.id === String(id || "")) || null; }
function vipById(id) { return VIP_PACKS.find((p) => p.id === String(id || "")) || null; }
function packTotalCoins(pack) { return (Number(pack.coins) || 0) + (Number(pack.bonus) || 0); }

function catalog() {
  return {
    ok: true,
    mpConfigured: mpConfigured(),
    publicKey: MP_PUBLIC_KEY || null,
    cardSurcharge: CARD_SURCHARGE,
    packs: COIN_PACKS.map((p) => Object.assign({}, p, { total: packTotalCoins(p) })),
    vip: VIP_PACKS.slice(),
  };
}

function httpsJson(method, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = https.request({
      hostname: "api.mercadopago.com",
      path: urlPath,
      method,
      headers: Object.assign({
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + MP_ACCESS_TOKEN,
      }, headers || {}, payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = { raw }; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function notifyUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL + "/api/store/mp/webhook";
  const proto = (req && req.headers["x-forwarded-proto"]) || "https";
  const host = req && (req.headers["x-forwarded-host"] || req.headers.host);
  if (!host) return "";
  return proto + "://" + host + "/api/store/mp/webhook";
}

function backUrl(req, path) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL + path;
  const proto = (req && req.headers["x-forwarded-proto"]) || "https";
  const host = req && (req.headers["x-forwarded-host"] || req.headers.host);
  if (!host) return "";
  return proto + "://" + host + path;
}

async function addLedger(db, row) {
  if (typeof db.coinLedgerAdd !== "function") return null;
  return db.coinLedgerAdd({
    accountId: Number(row.accountId),
    login: String(row.login || ""),
    kind: String(row.kind || "other"),
    delta: Math.floor(Number(row.delta) || 0),
    coinsAfter: Math.max(0, Math.floor(Number(row.coinsAfter) || 0)),
    brlCents: Math.max(0, Math.floor(Number(row.brlCents) || 0)),
    ref: String(row.ref || ""),
    note: String(row.note || "").slice(0, 180),
    createdAt: row.createdAt || new Date().toISOString(),
  });
}

async function creditOrder(db, order) {
  if (!order || order.status === "paid") return order;
  const pack = packById(order.packId);
  const coins = pack ? packTotalCoins(pack) : Math.max(0, Number(order.coins) || 0);
  if (!coins) return order;
  const acc = await db.findAccountById(order.accountId);
  if (!acc) return order;
  const novo = (Number(acc.coins) || 0) + coins;
  await db.updateCoins(acc.id, novo);
  const paid = await db.storeOrderUpdate(order.id, {
    status: "paid",
    paidAt: new Date().toISOString(),
    coins,
  });
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "purchase",
    delta: coins, coinsAfter: novo,
    brlCents: Math.round(Number(order.brl) * 100) || 0,
    ref: "order:" + order.id,
    note: "Pacote " + (pack ? pack.label : order.packId) + " via " + (order.method || "mp"),
  });
  return paid || order;
}

async function checkout(db, body, req, opts) {
  opts = opts || {};
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const pack = packById(body.packId);
  if (!pack) return { code: 400, body: { ok: false, msg: "Pacote inválido" } };
  const method = String(body.method || "pix").toLowerCase() === "card" ? "card" : "pix";
  const brl = method === "card" ? Math.round(pack.brl * CARD_SURCHARGE * 100) / 100 : pack.brl;
  const coins = packTotalCoins(pack);
  const order = await db.storeOrderInsert({
    accountId: acc.id,
    login: acc.login,
    packId: pack.id,
    method,
    brl,
    coins,
    status: "pending",
    mpId: "",
    pixQr: "",
    pixCopy: "",
    checkoutUrl: "",
    createdAt: new Date().toISOString(),
  });
  if (!mpConfigured()) {
    if (opts.testServer) {
      return { code: 200, body: { ok: true, order, mpConfigured: false,
        msg: "Mercado Pago ainda não está ligado. No TEST_SERVER o admin pode simular o pagamento." } };
    }
    return { code: 503, body: { ok: false, orderId: order && order.id,
      msg: "Pagamento automático indisponível: configure MP_ACCESS_TOKEN no servidor." } };
  }
  const notify = notifyUrl(req);
  try {
    if (method === "pix") {
      const email = String(body.email || acc.login + "@global-idle.local").slice(0, 120);
      const r = await httpsJson("POST", "/v1/payments", {
        transaction_amount: brl,
        description: pack.label + " — Global-Idle",
        payment_method_id: "pix",
        payer: { email },
        external_reference: String(order.id),
        notification_url: notify || undefined,
      }, { "X-Idempotency-Key": "store-order-" + order.id });
      if (r.status >= 300 || !r.data || !r.data.id) {
        await db.storeOrderUpdate(order.id, { status: "error", note: JSON.stringify(r.data || {}).slice(0, 400) });
        return { code: 502, body: { ok: false, msg: "Mercado Pago recusou o Pix. Tente de novo." } };
      }
      const tx = r.data.point_of_interaction && r.data.point_of_interaction.transaction_data || {};
      const updated = await db.storeOrderUpdate(order.id, {
        mpId: String(r.data.id),
        pixQr: String(tx.qr_code_base64 || ""),
        pixCopy: String(tx.qr_code || ""),
        status: "pending",
      });
      return { code: 200, body: { ok: true, order: updated, mpConfigured: true } };
    }
    const pref = await httpsJson("POST", "/checkout/preferences", {
      items: [{
        title: pack.label + " — Global-Idle",
        quantity: 1,
        currency_id: "BRL",
        unit_price: brl,
      }],
      external_reference: String(order.id),
      notification_url: notify || undefined,
      back_urls: {
        success: backUrl(req, "/?store=paid"),
        failure: backUrl(req, "/?store=fail"),
        pending: backUrl(req, "/?store=pending"),
      },
      auto_return: "approved",
      statement_descriptor: "GLOBALIDLE",
    }, { "X-Idempotency-Key": "store-pref-" + order.id });
    if (pref.status >= 300 || !pref.data || !pref.data.init_point) {
      await db.storeOrderUpdate(order.id, { status: "error", note: JSON.stringify(pref.data || {}).slice(0, 400) });
      return { code: 502, body: { ok: false, msg: "Mercado Pago recusou o checkout. Tente de novo." } };
    }
    const updated = await db.storeOrderUpdate(order.id, {
      mpId: String(pref.data.id || ""),
      checkoutUrl: String(pref.data.init_point),
      status: "pending",
    });
    return { code: 200, body: { ok: true, order: updated, mpConfigured: true } };
  } catch (e) {
    return { code: 502, body: { ok: false, msg: "Falha ao falar com o Mercado Pago: " + (e && e.message) } };
  }
}

async function orderStatus(db, token, orderId) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const order = await db.storeOrderGet(orderId);
  if (!order || Number(order.accountId) !== Number(acc.id))
    return { code: 404, body: { ok: false, msg: "Pedido não encontrado" } };
  if (order.status !== "paid" && mpConfigured()) {
    try {
      let approved = null;
      if (order.method === "pix" && order.mpId) {
        const r = await httpsJson("GET", "/v1/payments/" + encodeURIComponent(order.mpId));
        if (r.data && r.data.status === "approved") approved = r.data;
      } else if (order.method === "card") {
        const r = await httpsJson("GET",
          "/v1/payments/search?external_reference=" + encodeURIComponent(order.id) + "&sort=date_created&criteria=desc");
        const results = (r.data && r.data.results) || [];
        approved = results.find((p) => p && p.status === "approved") || null;
      }
      if (approved) {
        await db.storeOrderUpdate(order.id, { mpId: String(approved.id || order.mpId || "") });
        const paid = await creditOrder(db, await db.storeOrderGet(order.id));
        return { code: 200, body: { ok: true, order: paid, coins: (await db.findAccountById(acc.id)).coins } };
      }
    } catch (e) { /* poll silencioso */ }
  }
  const fresh = await db.storeOrderGet(orderId);
  const live = await db.findAccountById(acc.id);
  return { code: 200, body: { ok: true, order: fresh, coins: live && live.coins } };
}

async function webhook(db, body, query) {
  const paymentId = (body && (body.data && body.data.id || body.id)) ||
    (query && (query.get("data.id") || query.get("id")));
  const topic = (body && (body.type || body.topic)) || (query && (query.get("topic") || query.get("type"))) || "";
  if (!paymentId) return { code: 200, body: { ok: true, ignored: true } };
  if (String(topic).indexOf("payment") === -1 && body && body.action && String(body.action).indexOf("payment") === -1) {
    /* Checkout Pro também manda merchant_order — ainda assim tentamos o id. */
  }
  if (!mpConfigured()) return { code: 200, body: { ok: true, skipped: "no-token" } };
  let payment = null;
  try {
    const r = await httpsJson("GET", "/v1/payments/" + encodeURIComponent(paymentId));
    payment = r.data;
  } catch (e) {
    return { code: 200, body: { ok: false, msg: "mp-fetch-failed" } };
  }
  if (!payment || payment.status !== "approved") return { code: 200, body: { ok: true, status: payment && payment.status } };
  const ref = String(payment.external_reference || "");
  const order = await db.storeOrderGet(ref);
  if (!order) return { code: 200, body: { ok: true, missingOrder: true } };
  if (order.status === "paid") return { code: 200, body: { ok: true, already: true } };
  await db.storeOrderUpdate(order.id, { mpId: String(payment.id || order.mpId || "") });
  await creditOrder(db, await db.storeOrderGet(order.id));
  return { code: 200, body: { ok: true, credited: true, orderId: order.id } };
}

async function simulatePay(db, body, opts) {
  opts = opts || {};
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if (!(opts.testServer || acc.role === "admin"))
    return { code: 403, body: { ok: false, msg: "Simular pagamento é só no TEST_SERVER ou admin." } };
  const order = await db.storeOrderGet(body.orderId);
  if (!order || Number(order.accountId) !== Number(acc.id) && acc.role !== "admin")
    return { code: 404, body: { ok: false, msg: "Pedido não encontrado" } };
  const paid = await creditOrder(db, order);
  const live = await db.findAccountById(order.accountId);
  return { code: 200, body: { ok: true, order: paid, coins: live && live.coins } };
}

async function buyVip(db, body) {
  const acc = await db.findAccountByToken(body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const pack = vipById(body.packId);
  if (!pack) return { code: 400, body: { ok: false, msg: "Pacote VIP inválido" } };
  const have = Number(acc.coins) || 0;
  if (have < pack.coins)
    return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
  const novo = have - pack.coins;
  await db.updateCoins(acc.id, novo);
  const now = Date.now();
  const cur = Math.max(0, Math.floor(Number(acc.vip_until) || 0));
  const until = Math.max(cur, now) + pack.days * 24 * 3600 * 1000;
  if (typeof db.setAccountVipUntil === "function") await db.setAccountVipUntil(acc.id, until);
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "spend",
    delta: -pack.coins, coinsAfter: novo, brlCents: 0,
    ref: "vip:" + pack.id, note: pack.label,
  });
  return { code: 200, body: { ok: true, coins: novo, vipUntil: until, vip: until > now, pack } };
}

async function myHistory(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const ledger = typeof db.coinLedgerList === "function"
    ? await db.coinLedgerList({ accountId: acc.id, limit: 80 }) : [];
  const orders = typeof db.storeOrdersByAccount === "function"
    ? await db.storeOrdersByAccount(acc.id, 40) : [];
  return { code: 200, body: { ok: true, coins: acc.coins || 0, vipUntil: acc.vip_until || 0, ledger, orders } };
}

async function adminSummary(db, token, opts) {
  opts = opts || {};
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  if (acc.role !== "admin" && !opts.testServer)
    return { code: 403, body: { ok: false, msg: "Só o administrador vê o faturamento." } };
  const ledger = typeof db.coinLedgerList === "function" ? await db.coinLedgerList({ limit: 200 }) : [];
  const orders = typeof db.storeOrderList === "function" ? await db.storeOrderList(200) : [];
  const accounts = typeof db.listAccountCoinSummaries === "function"
    ? await db.listAccountCoinSummaries() : [];
  let revenueCents = 0, coinsSold = 0, coinsSpent = 0, coinsGranted = 0;
  for (const row of ledger) {
    if (row.kind === "purchase") { coinsSold += row.delta; revenueCents += Number(row.brlCents) || 0; }
    else if (row.kind === "spend") coinsSpent += Math.abs(row.delta);
    else if (row.kind === "grant") coinsGranted += row.delta;
  }
  return { code: 200, body: {
    ok: true,
    mpConfigured: mpConfigured(),
    totals: {
      revenueBrl: revenueCents / 100,
      coinsSold, coinsSpent, coinsGranted,
      accounts: accounts.length,
      pendingOrders: orders.filter((o) => o.status === "pending").length,
    },
    accounts, ledger, orders,
  } };
}

async function recordGrant(db, acc, amount, after) {
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: amount >= 0 ? "grant" : "grant",
    delta: amount, coinsAfter: after, brlCents: 0,
    ref: "admin-grant", note: "Ajuste admin de Tibia Coins",
  });
}

module.exports = {
  catalog, checkout, orderStatus, webhook, simulatePay, buyVip, myHistory, adminSummary,
  recordGrant, mpConfigured, COIN_PACKS, VIP_PACKS,
};
