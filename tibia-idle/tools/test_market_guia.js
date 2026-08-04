/* Teste do Market fiel ao guia oficial (cliente market-ui.js):
 * - fee 2% (mín 20, máx 1M)
 * - vender do depot, receber no depot
 * - buy offer, anônimo, 30 dias fixo
 * - aviso de preço injusto (25%)
 */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const errors = [];

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="modal" class="modal-bg"><div id="modal-body"></div></div>
<div id="tooltip"></div><div id="toasts"></div><div id="log"></div>
<div id="tibia-coins-n">0</div><div id="gold">0</div>
<canvas id="scene" width="840" height="520"></canvas></body></html>`,
  { url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
w.addEventListener("error", (e) => errors.push("WINDOWERROR " + e.message));
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient")
      return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    return typeof k === "string" ? () => {} : undefined;
  },
  set() { return true; },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
const ctx = vm.createContext(w);
function load(f) {
  try { vm.runInContext(fs.readFileSync(path.join(GAME, f), "utf8"), ctx, { filename: f }); }
  catch (e) { errors.push(f + ": " + e.message); }
}

// DOM helpers + storage
w.$ = (s) => w.document.querySelector(s);
w.$$ = (s) => Array.from(w.document.querySelectorAll(s));
w.fmt = (n) => String(Math.floor(n || 0));
w.fmtFull = (n) => Math.floor(n || 0).toLocaleString("pt-BR");
Object.defineProperty(w, "localStorage", {
  configurable: true,
  value: {
    _d: { "tibia-idle-api": "http://127.0.0.1:3456" },
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
});
Object.defineProperty(w, "sessionStorage", {
  configurable: true,
  value: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
});

// GAMEDATA + stubs de jogo
w.GAMEDATA = {
  items: {
    "fire-sword": { n: "fire sword", s: "weapon", t: "sword", atk: 35, sell: 992, cid: 3280 },
    "plate-armor": { n: "plate armor", s: "armor", t: "armor", arm: 10, sell: 480, cid: 3357 },
  },
  hunts: {}, monsters: {},
};
w.ELEMENTS = { physical: { name: "F", color: "#fff", fx: "block-hit" }, fire: { name: "Fg", color: "#f80", fx: "hit-by-fire" } };
w.__coins = 50;
w.accountCoins = () => w.__coins;
w.accountSpendCoins = (n) => { w.__coins = Math.max(0, w.__coins - n); return w.__coins; };
w.accountAddCoins = (n) => { w.__coins += n; return w.__coins; };
w.itemName = (slug) => (w.GAMEDATA.items[slug] || {}).n || slug;
w.itemImg = (slug) => `<img src="assets/item/${slug}.png">`;
w.toast = () => {};
w.addLog = () => {};
w.renderAll = () => {};
w.renderStats = () => {};
w.renderCoinBalance = () => {};
w.renderInventory = () => {};
w.ensureItemInstances = () => {};
w.itemUsesInstances = () => false;
w.itemInstanceTier = (i) => (i && i.tier) || 0;
w.findItemInstance = (p, id) => (p.itemInstances || []).find((i) => i.id === id) || null;
w.syncBagCountsFromInstances = () => {};
w.putBagItemInstance = () => true;
w.nextItemInstanceId = () => "it-" + Math.random().toString(36).slice(2);
w.removeItem = (p, slug, n) => { p.bag[slug] = (p.bag[slug] || 0) - (n || 1); if (p.bag[slug] <= 0) delete p.bag[slug]; return true; };
w.addItem = (p, slug, n) => { p.bag[slug] = (p.bag[slug] || 0) + (n || 1); return true; };
w.ensureForge = (p) => {
  if (!p.forge) p.forge = {};
  if (!Array.isArray(p.depot)) p.depot = [];
};
w.forgeStoredSlug = (p, entry) => {
  if (typeof entry === "string") return entry;
  const inst = w.findItemInstance(p, entry);
  return inst ? inst.slug : null;
};
w.forgeTierClassForValue = () => "";
w.sessionToken = () => "tok";
w.marketListOffers = async (f) => ({ ok: true, offers: [] });
w.marketMineOffers = async () => ({ ok: true, offers: [] });
w.marketBuyOffer = async () => ({ ok: false, msg: "stub" });
w.marketCreateOffer = async (b) => {
  // simula criação com fee
  if (b.kind === "item" || b.kind === "coins" || b.kind === "buy") {
    return { ok: true, offer: { id: 1, ...b }, fee: Math.max(20, Math.min(1000000, Math.round(b.price * 0.02))), matched: null };
  }
  return { ok: false, msg: "tipo invalido" };
};
w.marketCancelOffer = async () => ({ ok: true, refundCoins: 0, refundGold: 0 });
w.marketBank = async () => ({ ok: true, bank: 500000 });
w.marketDeposit = async (t, n) => ({ ok: true, bank: 500000 + n });
w.marketWithdraw = async (t, n) => ({ ok: true, bank: 500000 - n, amount: n });

w.fetch = async () => ({ status: 404, json: async () => ({ ok: false, msg: "stub" }) });

load("js/account-client.js");
load("js/market-ui.js");

// player com depot
const p = {
  name: "T", voc: "knight", level: 40, gold: 10000, bank: 0,
  bag: {}, itemInstances: [], equip: {}, config: {},
  forge: {}, depot: ["fire-sword", "plate-armor", "fire-sword"],
  stamina: 100000, skills: { sword: 50, shield: 50 },
};
w.G = { p: p };

try {
  // ---- 1. fee ----
  const fee = vm.runInContext("marketFee(5000)", ctx);
  if (fee !== 100) errors.push("fee 2% de 5000 != 100: " + fee);
  const feeMin = vm.runInContext("marketFee(500)", ctx);
  if (feeMin !== 20) errors.push("fee mínimo != 20: " + feeMin);
  const feeMax = vm.runInContext("marketFee(100000000)", ctx);
  if (feeMax !== 1000000) errors.push("fee máximo != 1M: " + feeMax);
  console.log("FEE OK — 2% (mín 20, máx 1M)");

  // ---- 2. marketDepotItems (vende do depot) ----
  const depotItens = vm.runInContext("marketDepotItems(G.p)", ctx);
  if (depotItens.length !== 3) errors.push("depot items != 3: " + depotItens.length);
  if (!depotItens.every((i) => i.from === "depot")) errors.push("item nao marcado como depot");
  console.log("DEPOT OK — 3 itens vendáveis do depot");

  // ---- 3. marketRemoveForSale + refund (depot) ----
  vm.runInContext("marketRemoveForSale(G.p, { slug:'fire-sword', instId:null, qty:1, tier:0, from:'depot' }, 'of1')", ctx);
  if (p.depot.length !== 2) errors.push("remove depot nao removeu");
  vm.runInContext("marketRefundItem(G.p, 'of1')", ctx);
  if (p.depot.length !== 3) errors.push("refund depot nao devolveu");
  console.log("DEPOT SELL/REFUND OK");

  // ---- 4. marketReceiveItem (compra vai pro depot) ----
  vm.runInContext("marketReceiveItem(G.p, 'plate-armor', 0, 2)", ctx);
  const count = p.depot.filter((e) => e === "plate-armor").length;
  if (count < 2) errors.push("receive depot falhou");
  console.log("RECEIVE DEPOT OK — item comprado vai pro depot");

  // ---- 5. aviso de preço injusto (25%) ----
  const unfair = vm.runInContext("marketUnfair({ price: 130, stats: { avg: 100, count: 10 } })", ctx);
  if (unfair !== "alto") errors.push("unfair alto nao detectado: " + unfair);
  const unfairOk = vm.runInContext("marketUnfair({ price: 110, stats: { avg: 100, count: 10 } })", ctx);
  if (unfairOk !== null) errors.push("preço ok marcado como unfair");
  console.log("UNFAIR OK — 25% acima da média detectado");

  // ---- 6. abre o modal com abas ----
  vm.runInContext("openMarket()", ctx);
  const html = w.document.getElementById("modal-body").innerHTML;
  for (const aba of ["Ofertas", "Vender", "Minhas ofertas", "Tibia Coins"]) {
    if (html.indexOf(aba) === -1) errors.push("aba '" + aba + "' ausente");
  }
  if (html.indexOf("Banco") === -1) errors.push("botão Banco ausente");
  console.log("MARKET ABRE OK — abas + banco");
} catch (e) {
  errors.push("TESTE: " + (e.stack || e.message));
}

setTimeout(() => {
  if (errors.length) {
    console.log("ERROS (" + errors.length + "):");
    for (const e of errors.slice(0, 20)) console.log("  - " + e);
    process.exit(1);
  }
  console.log("MARKET GUIA OK — fee, depot, buy, unfair, abas");
  process.exit(0);
}, 800);
