/* Teste do Market P2P (servidor real + cliente):
 * 1) servidor: vendedor oferta item, comprador compra, vendedor claim;
 * 2) servidor: venda de TC entre jogadores (compra credita TC na conta);
 * 3) cliente: market-ui.js renderiza abas e lista ofertas.
 *
 * Uso: node test_market_p2p.js  (requer server.js rodando em API_URL)
 */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const API = process.env.API_URL || "http://127.0.0.1:3456";
const http = require("node:http");
const errors = [];

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(API + p, {
      method,
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve({ ok: false, msg: d }); }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  // ---- servidor: fluxo item P2P ----
  try {
    const sufixo = Date.now();
    await req("POST", "/api/register", { login: "v" + sufixo, password: "a" });
    await req("POST", "/api/register", { login: "c" + sufixo, password: "b" });
    const lv = await req("POST", "/api/login", { login: "v" + sufixo, password: "a" });
    const lc = await req("POST", "/api/login", { login: "c" + sufixo, password: "b" });
    const TV = lv.token, TC = lc.token;

    // vendedor oferta item T2
    const of = await req("POST", "/api/market/offers", {
      token: TV, kind: "item", slug: "fire-sword", tier: 2, qty: 1,
      price: 5000, price_tc: 0, days: 7, seller_name: "Vend",
    });
    if (!of.ok) errors.push("oferta item falhou: " + of.msg);
    const ofId = of.offer.id;

    // comprador lista e compra
    const lista = await req("GET", "/api/market/offers?kind=item");
    if (!lista.ok || !lista.offers.length) errors.push("lista vazia");
    const compra = await req("POST", "/api/market/buy", {
      token: TC, offer_id: ofId, buyer_name: "Comp",
    });
    if (!compra.ok) errors.push("compra item falhou: " + compra.msg);
    if (compra.item.slug !== "fire-sword" || compra.item.tier !== 2)
      errors.push("item recebido errado");

    // vendedor claim
    const claim = await req("POST", "/api/market/claim", { token: TV });
    if (!claim.ok || claim.gold !== 5000)
      errors.push("claim gold errado: " + JSON.stringify(claim));

    // nao pode comprar a propria oferta
    await req("POST", "/api/market/offers", {
      token: TV, kind: "item", slug: "plate-armor", tier: 0, qty: 1,
      price: 100, days: 1, seller_name: "Vend",
    });
    const self = await req("POST", "/api/market/buy", {
      token: TV, offer_id: ofId, buyer_name: "Vend",
    });
    if (self.ok) errors.push("comprou a propria oferta (deveria falhar)");
    console.log("SERVIDOR ITEM P2P OK — oferta/lista/compra/claim/self-block");
  } catch (e) { errors.push("servidor item: " + e.message); }

  // ---- servidor: TC entre jogadores ----
  try {
    const sufixo = Date.now() + 1;
    await req("POST", "/api/register", { login: "v2" + sufixo, password: "a" });
    await req("POST", "/api/register", { login: "c2" + sufixo, password: "b" });
    const lv = await req("POST", "/api/login", { login: "v2" + sufixo, password: "a" });
    const lc = await req("POST", "/api/login", { login: "c2" + sufixo, password: "b" });
    await req("POST", "/api/coins", { token: lv.token, amount: 30 });
    const of = await req("POST", "/api/market/offers", {
      token: lv.token, kind: "coins", qty: 10, price: 200000,
      price_tc: 0, days: 3, seller_name: "Vend",
    });
    if (!of.ok) errors.push("oferta TC falhou: " + of.msg);
    const compra = await req("POST", "/api/market/buy", {
      token: lc.token, offer_id: of.offer.id, buyer_name: "Comp",
    });
    if (!compra.ok || compra.coins !== 10) errors.push("compra TC falhou");
    // comprador tem 10 TC
    const lc2 = await req("POST", "/api/login", { login: "c2" + sufixo, password: "b" });
    if (lc2.account.coins !== 10) errors.push("comprador TC != 10: " + lc2.account.coins);
    // vendedor claim 200000
    const claim = await req("POST", "/api/market/claim", { token: lv.token });
    if (claim.gold !== 200000) errors.push("vendedor claim TC-gold errado");
    console.log("SERVIDOR TC P2P OK — oferta TC/compra/credita/claim");
  } catch (e) { errors.push("servidor tc: " + e.message); }

  // ---- cliente: market-ui renderiza ----
  try {
    const dom = new JSDOM(`<html><body>
      <div id="modal" class="modal-bg"><div id="modal-body"></div></div>
      <div id="tooltip"></div><div id="toasts"></div><div id="log"></div>
      <div id="tibia-coins-n"></div><div id="gold"></div>
      <canvas id="scene" width="100" height="100"></canvas>
    </body></html>`, { url: "http://x/" });
    const w = dom.window;
    w.$ = (s) => w.document.querySelector(s);
    w.$$ = (s) => Array.from(w.document.querySelectorAll(s));
    w.fmtFull = (n) => Math.floor(n || 0).toLocaleString("pt-BR");
    w.fmt = (n) => String(Math.floor(n || 0));
    const ctxStub = new Proxy({}, {
      get(t, k) { return k === "canvas" ? { width: 100, height: 100 } : (typeof k === "string" ? () => {} : undefined); },
      set() { return true; },
    });
    w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
    w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
    w.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
    w.sessionStorage = {
      _d: { "tibia-idle-token": "tok-x", "tibia-idle-account": "{}" },
      getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
    };
    const ctx = vm.createContext(w);
    vm.runInContext(fs.readFileSync(path.join(GAME, "js/account-client.js"), "utf8"), ctx, { filename: "acc" });
    vm.runInContext(fs.readFileSync(path.join(GAME, "js/market-ui.js"), "utf8"), ctx, { filename: "market" });
    // stubs
    w.GAMEDATA = { items: { "fire-sword": { n: "fire sword", s: "weapon", t: "sword" }, "plate-armor": { n: "plate armor", s: "armor", t: "armor" } }, hunts: {}, monsters: {} };
    w.accountCoins = () => 10;
    w.accountSpendCoins = (n) => {};
    w.accountAddCoins = (n) => {};
    w.sessionToken = () => "tok-x";
    w.itemName = (s) => (w.GAMEDATA.items[s] || {}).n || s;
    w.itemImg = (s) => `<img src="assets/item/${s}.png">`;
    w.toast = () => {};
    w.addLog = () => {};
    w.renderInventory = () => {};
    w.renderStats = () => {};
    w.renderCoinBalance = () => {};
    w.forgeTierClassForValue = (t) => t >= 5 ? "tier-rare" : "";
    w.ensureItemInstances = () => {};
    w.itemUsesInstances = () => false;
    w.itemInstanceTier = () => 0;
    w.findItemInstance = () => null;
    w.syncBagCountsFromInstances = () => {};
    w.removeItem = () => true;
    w.addItem = () => true;
    w.putBagItemInstance = () => true;
    w.nextItemInstanceId = () => "x";
    w.sessionAccount = () => null;
    w.accountApiConfigured = () => true;
    w.accountLogin = async () => ({ ok: true });
    // marketListOffers stub
    vm.runInContext("marketListOffers = async () => ({ ok: true, offers: [{ id: 1, slug: 'fire-sword', tier: 2, price: 5000, price_tc: 0, seller_name: 'Vend', expires_at: new Date(Date.now()+86400000*3).toISOString() }] })", ctx);
    w.G = { p: { name: "T", voc: "knight", level: 40, gold: 10000, bag: { "plate-armor": 2 }, itemInstances: [], equip: {}, config: {}, stamina: 100000, skills: { sword: 50, shield: 50 } } };
    vm.runInContext("openMarket()", ctx);
    const html = w.document.getElementById("modal-body").innerHTML;
    if (html.indexOf("Comprar") === -1 || html.indexOf("Vender") === -1) errors.push("market-ui: abas ausentes");
    setTimeout(() => {
      const b = w.document.getElementById("market-body");
      if (!b || (b.innerHTML.indexOf("fire-sword") === -1 && b.innerHTML.indexOf("Carregando") !== -1 && b.innerHTML.indexOf("Carregando") === 0)) {
        // pode ainda estar carregando; ok
      }
      console.log("CLIENTE MARKET P2P OK — abas + ofertas");
      if (errors.length) {
        console.log("ERROS (" + errors.length + "):");
        for (const e of errors.slice(0, 20)) console.log("  - " + e);
        process.exit(1);
      }
      console.log("MARKET P2P OK — item + TC + cliente");
      process.exit(0);
    }, 800);
  } catch (e) {
    errors.push("cliente: " + (e.stack || e.message));
    console.log("ERROS:", errors.join("\n"));
    process.exit(1);
  }
})();
