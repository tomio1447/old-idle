/* Teste do Market P2P (cliente market-ui.js):
 * - abas Comprar/Vender/Minhas ofertas/Tibia Coins presentes
 * - vendável: itens da bag com tier aparecem
 * - marketOnline() respeita accountApiConfigured
 * O fluxo de servidor (oferta/compra/claim) é coberto pelo test_market_p2p.js.
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

// helpers DOM
w.$ = (s) => w.document.querySelector(s);
w.$$ = (s) => Array.from(w.document.querySelectorAll(s));
w.fmt = (n) => Math.floor(n || 0) >= 1e6 ? (Math.floor(n || 0) / 1e6).toFixed(2) + "M" : String(Math.floor(n || 0));
w.fmtFull = (n) => Math.floor(n || 0).toLocaleString("pt-BR");

// GAMEDATA + stubs
w.GAMEDATA = {
  items: {
    "fire-sword": { n: "fire sword", s: "weapon", t: "sword", atk: 35, sell: 992, cid: 3280 },
    "plate-armor": { n: "plate armor", s: "armor", t: "armor", arm: 10, sell: 480, cid: 3357 },
  },
  hunts: {},
  monsters: {},
};
w.MOBSHEETS = {};
w.ELEMENTS = { physical: { name: "F", color: "#fff", fx: "block-hit" }, fire: { name: "Fg", color: "#f80", fx: "hit-by-fire" } };
w.__coins = 50;
w.accountCoins = () => w.__coins;
w.accountSpendCoins = (n) => { w.__coins = Math.max(0, w.__coins - n); return w.__coins; };
w.accountAddCoins = (n) => { w.__coins += n; return w.__coins; };
w.spendGold = (p, amt) => { if (p.gold < amt) return false; p.gold -= amt; return true; };
w.buyItem = (p, slug, price) => {
  if (p.gold < price) return { ok: false, msg: "Ouro insuficiente." };
  p.gold -= price; p.bag[slug] = (p.bag[slug] || 0) + 1;
  return { ok: true };
};
w.hasBagSpace = () => true;
w.addItem = (p, slug, n) => { p.bag[slug] = (p.bag[slug] || 0) + n; };
w.removeItem = (p, slug, n) => { if (!p.bag[slug]) return false; p.bag[slug] -= n || 1; if (p.bag[slug] <= 0) delete p.bag[slug]; return true; };
w.itemName = (slug) => (w.GAMEDATA.items[slug] || {}).n || slug;
w.itemImg = (slug) => `<img src="assets/item/${slug}.png">`;
w.spellIcon = () => "";
w.toast = () => {};
w.addLog = () => {};
w.renderInventory = () => {};
w.renderStats = () => {};
w.renderCoinBalance = () => {};
w.forgeTierClassForValue = () => "";
w.ensureItemInstances = () => {};
w.itemUsesInstances = () => false;
w.itemInstanceTier = (i) => (i && i.tier) || 0;
w.findItemInstance = () => null;
w.syncBagCountsFromInstances = () => {};
w.putBagItemInstance = () => true;
w.nextItemInstanceId = () => "x";
// localStorage com a API configurada (lida pelo account-client.js no load).
// O jsdom define localStorage como getter — usa defineProperty para trocar.
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
w.accountApiConfigured = () => true;
w.sessionToken = () => "tok";
w.marketListOffers = async () => ({ ok: true, offers: [] });
w.marketMineOffers = async () => ({ ok: true, offers: [] });
w.marketBuyOffer = async () => ({ ok: false, msg: "stub" });

// fetch stub (account-client usa fetch; market-ui stubs sobrescrevem as
// funcoes do market antes de chamar)
w.fetch = async () => ({ status: 404, json: async () => ({ ok: false, msg: "stub" }) });
load("js/account-client.js");
load("js/market-ui.js");

const p = { name: "T", voc: "knight", level: 40, gold: 10000, bag: { "plate-armor": 2 }, itemInstances: [], equip: {}, config: {}, stamina: 100000, skills: { sword: 50, shield: 50 } };
w.G = { p: p };

try {
  w.openMarket();
  const modal = w.document.getElementById("modal");
  if (!modal.classList.contains("show")) errors.push("market: modal nao abriu");
  const html = w.document.getElementById("modal-body").innerHTML;
  if (html.indexOf("Comprar") === -1) errors.push("market: aba Comprar ausente");
  if (html.indexOf("Vender") === -1) errors.push("market: aba Vender ausente");
  if (html.indexOf("Minhas ofertas") === -1) errors.push("market: aba Minhas ofertas ausente");
  if (html.indexOf("Tibia Coins") === -1) errors.push("market: aba Tibia Coins ausente");
  console.log("MARKET ABRE OK — abas P2P (Comprar/Vender/Minhas/TC)");

  // mercado bag items: plate-armor stackável aparece
  const itens = vm.runInContext("marketBagItems(G.p)", ctx);
  if (!itens.some((i) => i.slug === "plate-armor")) errors.push("market: plate-armor nao listado na bag");
  console.log("MARKET BAG OK — itens vendáveis listados");

  // marketRemoveForSale + refund
  const sel = { slug: "plate-armor", instId: null, qty: 1, tier: 0 };
  vm.runInContext("marketRemoveForSale(G.p, " + JSON.stringify(sel) + ", 'oferta1')", ctx);
  if (p.bag["plate-armor"] !== 1) errors.push("market: removeForSale nao removeu");
  vm.runInContext("marketRefundItem(G.p, 'oferta1')", ctx);
  if (p.bag["plate-armor"] !== 2) errors.push("market: refund nao devolveu");
  console.log("MARKET SELL/REFUND OK — item sai e volta da bag");
} catch (e) {
  errors.push("TESTE: " + (e.stack || e.message));
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 20)) console.log("  - " + e);
  process.exit(1);
}
console.log("MARKET P2P CLIENTE OK — abas, bag, sell/refund");
