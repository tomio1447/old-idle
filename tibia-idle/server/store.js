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
/* 3º slot de prey permanente, por CONTA — pago com Prey Cards. */
const PREY_SLOT_CARDS = 50;

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
    note: pack.cards + " Prey Cards" + (Math.min(Math.max(0, Number(acc.coins_nt) || 0), pack.coins) > 0
      ? " (NT " + Math.min(Math.max(0, Number(acc.coins_nt) || 0), pack.coins) + ")" : "") });
  return { code: 200, body: { ok: true, coins: fresh.coins, coinsNt: fresh.coins_nt || 0, cosmetics: fresh.cosmetics,
    msg: consume ? "Prey Card utilizado." : pack.cards + " Prey Cards adicionados à conta!" } };
}

/* 3º slot de prey permanente (conta inteira): débito atômico de cards +
 * grant no mesmo UPDATE via db.buyPreySlot — sem janela entre consumir
 * o card e marcar a posse. */
async function buyPreySlot(db, body) {
  const acc = await db.findAccountByToken(body && body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const cos = typeof acc.cosmetics === "string"
    ? (function () { try { return JSON.parse(acc.cosmetics); } catch (e) { return {}; } })()
    : (acc.cosmetics || {});
  if (cos.preySlot) return { code: 409, body: { ok: false, msg: "3º slot de prey já desbloqueado." } };
  if (typeof db.buyPreySlot !== "function")
    return { code: 500, body: { ok: false, msg: "Indisponível neste storage." } };
  if (!await db.buyPreySlot(acc.id, PREY_SLOT_CARDS))
    return { code: 409, body: { ok: false, msg: "Prey Cards insuficientes (precisa de " + PREY_SLOT_CARDS + ")." } };
  const fresh = await db.findAccountById(acc.id);
  await addLedger(db, { accountId: acc.id, login: acc.login, kind: "purchase",
    delta: 0, coinsAfter: fresh.coins, brlCents: 0, ref: "prey-slot",
    note: "3º Prey Slot permanente (" + PREY_SLOT_CARDS + " cards)" });
  return { code: 200, body: { ok: true, coins: fresh.coins, cosmetics: fresh.cosmetics,
    msg: "3º slot de prey desbloqueado para toda a conta!" } };
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
    preySlotCards: PREY_SLOT_CARDS,
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

/* ---------------- NON-TRANSFERABLE COINS (coins_nt) -------------------
 * Pool separado de Tibia Coins que SÓ pode ser gasto na STORE — o market
 * e o RMT nunca enxergam `coins_nt` (operam exclusivamente em `coins`).
 * Toda compra de store debita coins_nt primeiro e completa com coins.
 * Usa db.spendStoreCoins (atômico); em stores sem o método cai para o
 * read-modify-write clássico. Retorna { ok, coins, coinsNt, ntSpent }. */
async function spendStoreCoins(db, acc, amount) {
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  const haveNt = Math.max(0, Number(acc.coins_nt) || 0);
  const have = Math.max(0, Number(acc.coins) || 0);
  if (haveNt + have < cost) return { ok: false, coins: have, coinsNt: haveNt };
  if (typeof db.spendStoreCoins === "function") {
    const r = await db.spendStoreCoins(acc.id, cost);
    if (!r) return { ok: false };
    return {
      ok: true,
      coins: Math.max(0, Number(r.coins) || 0),
      coinsNt: Math.max(0, Number(r.coinsNt) || 0),
      ntSpent: Math.min(haveNt, cost),
    };
  }
  const ntSpent = Math.min(haveNt, cost);
  if (ntSpent && typeof db.updateCoinsNt === "function")
    await db.updateCoinsNt(acc.id, haveNt - ntSpent);
  await db.updateCoins(acc.id, have - (cost - ntSpent));
  const fresh = await db.findAccountById(acc.id);
  return {
    ok: true, ntSpent,
    coins: Math.max(0, Number(fresh && fresh.coins) || 0),
    coinsNt: Math.max(0, Number(fresh && fresh.coins_nt) || 0),
  };
}
/* Sufixo do ledger/UX quando parte do pagamento saiu do pool NT. */
function ntNote(spend) {
  return spend && spend.ntSpent > 0 ? ` (NT ${spend.ntSpent})` : "";
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
  /* Compra de STORE: debita coins_nt primeiro, completa com coins. */
  const spend = await spendStoreCoins(db, acc, pack.coins);
  if (!spend.ok)
    return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes" } };
  const novo = spend.coins;
  const now = Date.now();
  const cur = Math.max(0, Math.floor(Number(acc.vip_until) || 0));
  const until = Math.max(cur, now) + pack.days * 24 * 3600 * 1000;
  if (typeof db.setAccountVipUntil === "function") await db.setAccountVipUntil(acc.id, until);
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "spend",
    delta: -pack.coins, coinsAfter: novo, brlCents: 0,
    ref: "vip:" + pack.id, note: pack.label + ntNote(spend),
  });
  return { code: 200, body: { ok: true, coins: novo, coinsNt: spend.coinsNt, vipUntil: until, vip: until > now, pack } };
}

async function myHistory(db, token) {
  const acc = await db.findAccountByToken(token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const ledger = typeof db.coinLedgerList === "function"
    ? await db.coinLedgerList({ accountId: acc.id, limit: 80 }) : [];
  const orders = typeof db.storeOrdersByAccount === "function"
    ? await db.storeOrdersByAccount(acc.id, 40) : [];
  return { code: 200, body: { ok: true, coins: acc.coins || 0, coinsNt: acc.coins_nt || 0, vipUntil: acc.vip_until || 0, ledger, orders } };
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
  const vouchers = typeof db.voucherRedemptionList === "function"
    ? await db.voucherRedemptionList(200) : [];
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
      vouchersUsed: vouchers.length,
    },
    accounts, ledger, orders, vouchers,
  } };
}

/* ------------------------------- VOUCHERS -------------------------------
 * Códigos de brinde resgatados na aba VOUCHERS da STORE. Cada voucher é
 * limitado a 1 uso por conta (voucher_redemptions garante o unique). A
 * recompensa pode ser coins (creditados na conta) e/ou itens entregues no
 * DEPOT da conta (shared_inventory). */
const VOUCHERS = {
  FREETC: { coins: 1500, label: "1500 Tibia Coins" },
  /* Voucher de lançamento: VIP + montaria + coins NÃO transferíveis
   * (só gastáveis na STORE — não podem ir para o market nem para o RMT). */
  DRUWELL: { coinsNt: 250, vipDays: 3, mount: "roaring-lion",
    label: "3 dias de VIP + montaria Roaring Lion + 250 NT Tibia Coins" },
  /* Cupom de divulgação do streamer buto__pvp — além das recompensas,
   * `modal` instrui o cliente a abrir o pop-up de agradecimento com os
   * links sociais do criador (render em store-ui.js). */
  BUTO__PVP: { coinsNt: 250, vipDays: 3, mount: "shock-head",
    label: "3 dias de VIP + montaria Shock Head + 250 NT Tibia Coins",
    modal: {
      title: "Obrigado por apoiar nosso streamer!",
      intro: "Você recebeu as seguintes recompensas:",
      social: {
        label: "Apoie o streamer siga nas plataformas:",
        links: [
          { name: "Instagram", handle: "@buto__pvp", url: "https://www.instagram.com/buto__pvp" },
          { name: "Twitch", handle: "@buto_pvp", url: "https://www.twitch.tv/buto_pvp" },
        ],
      },
    } },
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

  /* Coins NÃO transferíveis: pool coins_nt, só gastável na STORE. */
  let coinsNt = Math.max(0, Number(acc.coins_nt) || 0);
  if (v.coinsNt) {
    coinsNt += Math.floor(Number(v.coinsNt));
    if (typeof db.updateCoinsNt === "function")
      await db.updateCoinsNt(acc.id, coinsNt);
    await addLedger(db, {
      accountId: acc.id, login: acc.login, kind: "grant",
      delta: 0, coinsAfter: coins, brlCents: 0,
      ref: "voucher:" + code, note: "Voucher " + code + " — +" + v.coinsNt + " NT Coins (só STORE)",
    });
  }

  /* VIP em dias: empilha sobre o vip_until vigente (mesma regra do
   * pacote VIP da store). */
  let vipUntil = Math.max(0, Math.floor(Number(acc.vip_until) || 0));
  if (v.vipDays) {
    const now = Date.now();
    vipUntil = Math.max(vipUntil, now) + Math.floor(Number(v.vipDays)) * 24 * 3600 * 1000;
    if (typeof db.setAccountVipUntil === "function")
      await db.setAccountVipUntil(acc.id, vipUntil);
  }

  /* Montaria de voucher vai para a CONTA (accounts.cosmetics.mounts) —
   * mesma chave usada pelo catálogo de cosméticos da store. */
  let cosmetics = null;
  if (v.mount && typeof db.setAccountCosmetics === "function") {
    cosmetics = sanitizeCosmetics(acc.cosmetics);
    cosmetics.mounts[String(v.mount)] = true;
    await db.setAccountCosmetics(acc.id, cosmetics);
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

  /* Lista estruturada de recompensas: o modal do cliente renderiza com
   * ícone próprio por `kind` (vip/mount/coinsNt/coins/items). O nome da
   * montaria vem do catálogo de cosméticos (appearancedata). */
  const mountNome = v.mount && cosmeticCatalog().mounts[String(v.mount)]
    ? cosmeticCatalog().mounts[String(v.mount)].nome : String(v.mount || "");
  const rewards = [];
  if (v.vipDays) rewards.push({ kind: "vip", label: "+" + Math.floor(Number(v.vipDays)) + " dias de VIP" });
  if (v.mount) rewards.push({ kind: "mount", mount: String(v.mount), label: "Montaria " + mountNome });
  if (v.coinsNt) rewards.push({ kind: "coinsNt", label: "+" + Math.floor(Number(v.coinsNt)) + " NT Tibia Coins" });
  if (v.coins) rewards.push({ kind: "coins", label: "+" + Math.floor(Number(v.coins)) + " Tibia Coins" });
  if (entregues.length) rewards.push({ kind: "items", label: entregues.length + " item(ns) no depot da conta" });

  return { code: 200, body: {
    ok: true, code, coins, coinsNt, vipUntil, vip: vipUntil > Date.now(),
    cosmetics,
    label: v.label || "brinde",
    items: entregues,
    rewards,
    modal: v.modal || null,
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
  return { outfits, mounts, addonBits: Object.assign({}, c.addonBits || {}), bless, preyCards: Math.max(0, Math.floor(Number(c.preyCards) || 0)) };
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
  const owned = kind === "outfit" ? Number(cosmetics.outfits[id]) >= 3 : !!cosmetics.mounts[id];
  if (owned) return { code: 400, body: { ok: false, msg: "Você já possui esse item", cosmetics } };

  /* Compra de STORE: debita coins_nt primeiro, completa com coins. */
  const spend = await spendStoreCoins(db, acc, COSMETIC_PRICE);
  if (!spend.ok)
    return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes", coins: spend.coins, coinsNt: spend.coinsNt } };

  const novo = spend.coins;
  if (kind === "outfit") cosmetics.outfits[id] = 3;
  else cosmetics.mounts[id] = true;
  if (typeof db.setAccountCosmetics === "function")
    await db.setAccountCosmetics(acc.id, cosmetics);
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "cosmetic",
    delta: -COSMETIC_PRICE, coinsAfter: novo, brlCents: 0,
    ref: "cosmetic:" + kind + ":" + id,
    note: "Store " + kind + ": " + (entry.nome || id) + ntNote(spend),
  });
  return { code: 200, body: {
    ok: true, kind, id, nome: entry.nome, coins: novo, coinsNt: spend.coinsNt, cosmetics,
    msg: (entry.nome || id) + " desbloqueado para todos os personagens da conta!",
  } };
}

const BLESS_PRICE = 150;

async function buyBless(db, body) {
  const acc = await db.findAccountByToken(body && body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };

  const cosmetics = sanitizeCosmetics(acc.cosmetics);
  /* Compra de STORE: NT-first (débito atômico via spendStoreCoins) +
   * incremento atômico de bless — sem read-modify-write para não correr
   * com o checkpoint das instâncias (que aplica blessSpent). */
  const spend = await spendStoreCoins(db, acc, BLESS_PRICE);
  if (!spend.ok)
    return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes", coins: spend.coins, coinsNt: spend.coinsNt, cosmetics } };
  if (typeof db.bumpAccountBless === "function")
    cosmetics.bless = await db.bumpAccountBless(acc.id, 1);
  else {
    cosmetics.bless = (cosmetics.bless || 0) + 1;
    if (typeof db.setAccountCosmetics === "function")
      await db.setAccountCosmetics(acc.id, cosmetics);
  }
  const novo = spend.coins;
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "bless",
    delta: -BLESS_PRICE, coinsAfter: novo, brlCents: 0,
    ref: "cosmetic:bless", note: "Store bless: proteção de party wipe" + ntNote(spend),
  });
  return { code: 200, body: {
    ok: true, coins: novo, coinsNt: spend.coinsNt, cosmetics, bless: cosmetics.bless,
    msg: "Bless ativa! Ela será consumida automaticamente quando a party toda morrer — sem perda de XP ou gold.",
  } };
}

/* Imbuement via Tibia Coins: dispensa materiais e gold — o cliente aplica o
 * imbue com sucesso garantido depois do débito confirmado. */
const IMBUEMENT_TIER_COINS = { 1: 30, 2: 60, 3: 90 };
const IMBUEMENT_TIER_NAME = { 1: "Basic", 2: "Intricate", 3: "Powerful" };

async function buyImbuement(db, body) {
  const acc = await db.findAccountByToken(body && body.token);
  if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const tier = Math.floor(Number(body && body.tier));
  const price = IMBUEMENT_TIER_COINS[tier];
  if (!price) return { code: 400, body: { ok: false, msg: "Tier de imbuement inválido" } };

  /* Compra por Tibia Coins: NT-first (só sai de coins se o pool NT
   * não cobrir). */
  const spend = await spendStoreCoins(db, acc, price);
  if (!spend.ok)
    return { code: 400, body: { ok: false, msg: "Tibia Coins insuficientes", coins: spend.coins, coinsNt: spend.coinsNt } };
  const novo = spend.coins;
  await addLedger(db, {
    accountId: acc.id, login: acc.login, kind: "spend",
    delta: -price, coinsAfter: novo, brlCents: 0,
    ref: "imbuement:tier" + tier,
    note: "Imbuement " + IMBUEMENT_TIER_NAME[tier] + " via Tibia Coins" + ntNote(spend),
  });
  return { code: 200, body: {
    ok: true, coins: novo, coinsNt: spend.coinsNt, tier, price,
    msg: "Imbuement " + IMBUEMENT_TIER_NAME[tier] + " adquirido por " + price + " TC.",
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
  recordGrant, redeemVoucher, buyCosmetic, cosmeticCatalog, mpConfigured, buyBless, changePreys, buyPreySlot, PREY_PACKS, PREY_SLOT_CARDS,
  COIN_PACKS, VIP_PACKS, VOUCHERS, COSMETIC_PRICE, BLESS_PRICE,
  buyImbuement, IMBUEMENT_TIER_COINS,
};
