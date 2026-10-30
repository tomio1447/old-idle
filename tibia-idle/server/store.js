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

const PREY_PACKS = [
  { id: "prey25", cards: 25, coins: 35 },
  { id: "prey50", cards: 50, coins: 60 },
  { id: "prey100", cards: 100, coins: 100 },
];

async function changePreys(db, body, consume) {
  const acc = await db.findAccountByToken(body && body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const pack = consume ? null : PREY_PACKS.find((p) => p.id === String(body.packId || ""));
  if (!consume && !pack) return { code: 400, body: { ok: false, msg: "Pacote inválido" } };
  if (!await db.changePreyCards(acc.id, consume ? -1 : pack.cards, consume ? 0 : pack.coins))
    return { code: 409, body: { ok: false, msg: consume ? "Sem Prey Cards na conta." : "Tibia Coins insuficientes." } };
  const fresh = await db.findAccountById(acc.id);
  if (!consume) await addLedger(db, { accountId: acc.id, login: acc.login, kind: "purchase",
    delta: -pack.coins, coinsAfter: fresh.coins, brlCents: 0, ref: "preys:" + pack.id,
    note: pack.cards + " Prey Cards" });
  return { code: 200, body: { ok: true, coins: fresh.coins, cosmetics: fresh.cosmetics,
    msg: consume ? "Prey Card utilizado." : pack.cards + " Prey Cards adicionados à conta!" } };
}

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
    preys: PREY_PACKS.map((p) => Object.assign({}, p)),
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
      // O Mercado Pago exige um e-mail válido no payer do Pix. Nunca fabricar
      // `login@dominio.local` — isso era recusado com 400 "payer.email must be
      // a valid email" e o QR nunca era gerado. Prefere o e-mail enviado pelo
      // cliente (coletado na STORE) e valida antes de chamar a API.
      const email = String(body.email || acc.email || "").trim().slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        await db.storeOrderUpdate(order.id, { status: "error", note: "payer.email ausente ou inválido" });
        return { code: 400, body: { ok: false, orderId: order.id,
          msg: "Informe um e-mail válido para receber o comprovante do Pix." } };
      }
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
  if (acc.role !== "admin")
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

/* ------------------------------- VOUCHERS -------------------------------
 * Códigos de brinde resgatados na aba VOUCHERS da STORE. Cada voucher é
 * limitado a 1 uso por conta (voucher_redemptions garante o unique). A
 * recompensa pode ser coins (creditados na conta) e/ou itens entregues no
 * DEPOT da conta (shared_inventory). */
const VOUCHERS = {
  FREETC: { coins: 1500, label: "1500 Tibia Coins" },
  // futuros: { items: [{ slug: "x", qty: 1, instanced: false, tier: 0 }], label: "..." }
};

async function redeemVoucher(db, body) {
  const acc = await db.findAccountByToken(body && body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const code = String((body && body.code) || "").trim().toUpperCase().slice(0, 40);
  const v = code && VOUCHERS[code];
  if (!v) return { code: 400, body: { ok: false, msg: "Voucher inválido" } };

  // Reserva o resgate ANTES de creditar: o UNIQUE (code, account_id) decide
  // corridas entre requisições simultâneas — só um ganha.
  if (typeof db.voucherClaim === "function") {
    const claimed = await db.voucherClaim(acc.id, code);
    if (!claimed) return { code: 400, body: { ok: false, msg: "Voucher já resgatado nesta conta" } };
  }

  let coins = Math.max(0, Number(acc.coins) || 0);
  if (v.coins) {
    coins += Math.floor(Number(v.coins));
    await db.updateCoins(acc.id, coins);
    await addLedger(db, {
      accountId: acc.id, login: acc.login, kind: "grant",
      delta: v.coins, coinsAfter: coins, brlCents: 0,
      ref: "voucher:" + code, note: "Voucher " + code + " — " + (v.label || "brinde"),
    });
  }

  // Itens do voucher vão para o DEPOT da conta (shared_inventory), no mesmo
  // formato que o market usa: instanciados viram itemInstances loc "depot" +
  // id na lista; stackáveis entram como slug por unidade. Cap de 30 slots.
  const entregues = [];
  if (Array.isArray(v.items) && v.items.length &&
      typeof db.accountSharedInventory === "function" &&
      typeof db.setAccountSharedInventory === "function") {
    const shared = await db.accountSharedInventory(acc.id);
    shared.seq = Math.max(0, Math.floor(Number(shared.seq) || 0));
    shared.itemInstances = Array.isArray(shared.itemInstances) ? shared.itemInstances : [];
    shared.depot = Array.isArray(shared.depot) ? shared.depot : [];
    const usedIds = new Set(shared.itemInstances.map((i) => String(i && i.id)));
    const nextId = () => {
      let id;
      do { id = "ai-" + (++shared.seq).toString(36); } while (usedIds.has(id));
      usedIds.add(id);
      return id;
    };
    for (const it of v.items) {
      const slug = String((it && it.slug) || "");
      const qty = Math.max(1, Math.floor(Number(it && it.qty) || 1));
      if (!slug) continue;
      for (let k = 0; k < qty && shared.depot.length < 30; k++) {
        if (it.instanced) {
          const id = nextId();
          shared.itemInstances.push({ id, slug, loc: "depot", tier: Math.max(0, Number(it.tier) || 0) });
          shared.depot.push(id);
        } else {
          shared.depot.push(slug);
        }
        entregues.push(slug);
      }
    }
    if (entregues.length) await db.setAccountSharedInventory(acc.id, shared);
  }

  return { code: 200, body: {
    ok: true, code, coins,
    label: v.label || "brinde",
    items: entregues,
    msg: (v.label || "Brinde") + " resgatado!",
  } };
}

/* --------------------------- COSMETICS (wardrobe) -----------------------
 * Outfits e mounts comprados por TC ficam na CONTA (accounts.cosmetics) e
 * valem para todos os personagens — modelo account-wide da Store real.
 * O catálogo é o mesmo do cliente (appearancedata.js): outfits por id base
 * (sem sufixo -m/-f, pares de nome distinto viram uma entrada só — ex.
 * Noblewoman/Nobleman). */
const COSMETIC_PRICE = 125;
const COS_SEX_BASE_PAIR = {
  noblewoman: "nobleman", nobleman: "noblewoman",
  norsewoman: "norseman", norseman: "norsewoman",
  "retro-noblewoman": "retro-nobleman", "retro-nobleman": "retro-noblewoman",
};
function cosmeticBaseName(id) {
  return String(id || "").replace(/-[mf](-\d+)?$/, "").replace(/-\d+$/, "");
}
function cosmeticCanonical(id) {
  const base = cosmeticBaseName(id);
  const pair = COS_SEX_BASE_PAIR[base];
  return pair && pair < base ? pair : base;
}
let _cosmeticCatalog = null;
function cosmeticCatalog() {
  if (_cosmeticCatalog) return _cosmeticCatalog;
  _cosmeticCatalog = { outfits: {}, mounts: {} };
  try {
    const fs = require("fs"), path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "game", "js", "appearancedata.js"), "utf8");
    const window = {};
    new Function("window", src)(window);
    const A = window.APPEARANCES || {};
    for (const o of A.outfits || []) {
      if (!o || o.sexo === "avatar") continue;
      const key = cosmeticCanonical(o.id);
      if (!key) continue;
      const cur = _cosmeticCatalog.outfits[key];
      if (!cur) _cosmeticCatalog.outfits[key] = { nome: o.nome, premium: !!o.premium };
      else if (o.premium) cur.premium = true;
    }
    for (const m of A.mounts || []) {
      if (!m || !m.id) continue;
      _cosmeticCatalog.mounts[String(m.id)] = { nome: m.nome, premium: !!m.premium };
    }
  } catch (e) {
    console.warn("[store] falha ao carregar catálogo de cosméticos:", e.message);
  }
  return _cosmeticCatalog;
}
function sanitizeCosmetics(raw) {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const outfits = {}, mounts = {};
  if (c.outfits && typeof c.outfits === "object" && !Array.isArray(c.outfits))
    for (const k of Object.keys(c.outfits))
      outfits[String(k).slice(0, 80)] = Math.max(0, Math.min(3, Math.floor(Number(c.outfits[k]) || 0)));
  if (c.mounts && typeof c.mounts === "object" && !Array.isArray(c.mounts))
    for (const k of Object.keys(c.mounts))
      if (c.mounts[k]) mounts[String(k).slice(0, 80)] = true;
  // bless: cargas de proteção de wipe compradas na store (TC). Consumidas
  // pelo motor autoritativo quando a PT inteira morre (sem perda de XP/gold).
  const bless = Math.max(0, Math.min(999, Math.floor(Number(c.bless) || 0)));
  return { outfits, mounts, bless, preyCards: Math.max(0, Math.floor(Number(c.preyCards) || 0)) };
}

async function buyCosmetic(db, body) {
  const acc = await db.findAccountByToken(body && body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const kind = String((body && body.kind) || "");
  const id = String((body && body.id) || "").slice(0, 80);
  const cat = cosmeticCatalog();
  const table = kind === "outfit" ? cat.outfits : kind === "mount" ? cat.mounts : null;
  const entry = table && table[id];
  if (!entry) return { code: 400, body: { ok: false, msg: "Item cosmético inválido" } };

  const cosmetics = sanitizeCosmetics(acc.cosmetics);
  const owned = kind === "outfit" ? cosmetics.outfits[id] !== undefined : !!cosmetics.mounts[id];
  if (owned) return { code: 400, body: { ok: false, msg: "Você já possui esse item", cosmetics } };

  const coins = Math.max(0, Number(acc.coins) || 0);
  if (coins < COSMETIC_PRICE)
    return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes", coins } };

  const novo = coins - COSMETIC_PRICE;
  await db.updateCoins(acc.id, novo);
  if (kind === "outfit") cosmetics.outfits[id] = 0;
  else cosmetics.mounts[id] = true;
  if (typeof db.setAccountCosmetics === "function")
    await db.setAccountCosmetics(acc.id, cosmetics);
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "cosmetic",
    delta: -COSMETIC_PRICE, coinsAfter: novo, brlCents: 0,
    ref: "cosmetic:" + kind + ":" + id,
    note: "Store " + kind + ": " + (entry.nome || id),
  });
  return { code: 200, body: {
    ok: true, kind, id, nome: entry.nome, coins: novo, cosmetics,
    msg: (entry.nome || id) + " desbloqueado para todos os personagens da conta!",
  } };
}

const BLESS_PRICE = 150;

async function buyBless(db, body) {
  const acc = await db.findAccountByToken(body && body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

  const cosmetics = sanitizeCosmetics(acc.cosmetics);
  const coins = Math.max(0, Number(acc.coins) || 0);
  if (coins < BLESS_PRICE)
    return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes", coins, cosmetics } };

  // Débito atômico + incremento atômico de bless: sem read-modify-write para
  // não correr com o checkpoint das instâncias (que aplica blessSpent).
  if (typeof db.debitCoins === "function") {
    if (!await db.debitCoins(acc.id, BLESS_PRICE))
      return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes", coins, cosmetics } };
  } else {
    await db.updateCoins(acc.id, coins - BLESS_PRICE);
  }
  if (typeof db.bumpAccountBless === "function")
    cosmetics.bless = await db.bumpAccountBless(acc.id, 1);
  else {
    cosmetics.bless = (cosmetics.bless || 0) + 1;
    if (typeof db.setAccountCosmetics === "function")
      await db.setAccountCosmetics(acc.id, cosmetics);
  }
  const fresh = typeof db.findAccountById === "function" ? await db.findAccountById(acc.id) : null;
  const novo = fresh ? Math.max(0, Number(fresh.coins) || 0) : Math.max(0, coins - BLESS_PRICE);
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "bless",
    delta: -BLESS_PRICE, coinsAfter: novo, brlCents: 0,
    ref: "cosmetic:bless", note: "Store bless: proteção de party wipe",
  });
  return { code: 200, body: {
    ok: true, coins: novo, cosmetics, bless: cosmetics.bless,
    msg: "Bless ativa! Ela será consumida automaticamente quando a party toda morrer — sem perda de XP ou gold.",
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
  recordGrant, redeemVoucher, buyCosmetic, cosmeticCatalog, mpConfigured, buyBless, changePreys, PREY_PACKS,
  COIN_PACKS, VIP_PACKS, VOUCHERS, COSMETIC_PRICE, BLESS_PRICE,
};
