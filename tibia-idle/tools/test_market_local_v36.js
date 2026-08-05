/* Teste da v36 — Market P2P OFFLINE (sem API).
 *
 * 1) renderMarket NÃO mostra mais a mensagem bloqueadora (abre sempre);
 * 2) market-local: depositar no banco, criar oferta de venda, listar,
 *    comprar com OUTRO personagem do save, e o item vai para o depot do
 *    comprador;
 * 3) cancelar oferta devolve o gold (buy offer).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const html = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const dom = new JSDOM(html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, ""), {
  url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only",
});
const w = dom.window;
const errors = [];
w.addEventListener("error", (e) => errors.push("WINDOWERROR: " + (e.message || e.error)));
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? () => {} : undefined;
  },
  set() { return true; },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const vctx = vm.createContext(w);
for (const s of scripts) {
  try { vm.runInContext(fs.readFileSync(path.join(GAME, s), "utf8"), vctx, { filename: s }); }
  catch (e) { errors.push(s + ": " + e.message); }
}

setTimeout(() => {
  try {
    vm.runInContext(`
      (async () => {
      const ok = [];
      const fail = (m) => { throw new Error(m); };

      // marketOnline() deve ser true SEMPRE (local ou API)
      if (!marketOnline()) fail("marketOnline deveria ser true (modo local)");

      // ---------- 1) renderMarket abre sem a mensagem bloqueadora ----------
      const p = createCharacter("MKLocal", "knight", "male");
      p.gold = 50000;
      G.p = p;
      document.body.innerHTML = '<div id="modal" class="modal-bg"><div class="modal panel" id="modal-body"></div></div>';
      openMarket();
      let html = document.getElementById("modal-body").innerHTML;
      if (/precisa do\\s*servidor de contas/.test(html)) fail("mensagem bloqueadora ainda aparece");
      if (html.indexOf("Market") === -1) fail("market não abriu");
      ok.push("market abre sem a mensagem bloqueadora (modo local)");

      // ---------- 2) banco + oferta de venda + listar ----------
      const r1 = await marketDeposit("tok", 10000);
      if (!r1.ok || r1.bank !== 10000) fail("depósito local falhou: " + JSON.stringify(r1));
      ok.push("depósito no banco local (10000)");

      // dá um item no depot e vende
      p.depot = p.depot || [];
      p.depot.push("great-health-potion");
      const r2 = await marketCreateOffer({
        token: "tok", kind: "item", slug: "great-health-potion", tier: 0, qty: 1,
        price: 5000, price_tc: 0, seller_name: p.name,
      });
      if (!r2.ok || !r2.offer || !r2.offer.id) fail("criar oferta de venda falhou: " + JSON.stringify(r2));
      const offerId = r2.offer.id;
      // simula o market-ui removendo o item do depot (marketRemoveForSale)
      _mPendingRefund[offerId] = { slug: "great-health-potion", inst: null, qty: 1, to: "depot" };
      p.depot = [];
      ok.push("oferta de venda criada (id " + offerId + ")");

      const r3 = await marketListOffers({ kind: "" });
      if (!r3.ok || !r3.offers.length) fail("listar ofertas falhou");
      const venda = r3.offers.find((o) => o.id === offerId);
      if (!venda || venda.kind !== "item" || venda.price !== 5000) fail("oferta listada incorreta");
      ok.push("oferta listada (great-health-potion 5000 gp)");

      // ---------- 3) OUTRO personagem compra ----------
      const p2 = createCharacter("MKCompra", "paladin", "male");
      p2.gold = 50000;
      // troca para o comprador
      const saveAtual = G.p;
      G.p = p2;
      await marketDeposit("tok2", 10000);
      const r4 = await marketBuyOffer({ token: "tok2", offer_id: offerId, buyer_name: p2.name });
      if (!r4.ok || !r4.data || !r4.data.item) fail("compra falhou: " + JSON.stringify(r4));
      // o market-ui chama marketReceiveItem com r.data.item
      marketReceiveItem(p2, r4.data.item.slug, r4.data.item.tier, r4.data.item.qty);
      if ((p2.depot || []).indexOf("great-health-potion") === -1)
        fail("item não foi para o depot do comprador: " + JSON.stringify(p2.depot));
      ok.push("outro personagem comprou — item foi para o depot dele");
      G.p = saveAtual;

      // ---------- 4) cancelar buy offer devolve o gold ----------
      const r5 = await marketCreateOffer({
        token: "tok", kind: "buy", slug: "sword", tier: 0, qty: 2,
        price: 300, price_tc: 0, seller_name: p.name,
      });
      if (!r5.ok) fail("criar buy offer falhou");
      const r6 = await marketCancelOffer("tok", r5.offer.id);
      if (!r6.ok || !r6.refundGold || r6.refundGold !== 600)
        fail("cancelar buy offer deveria devolver 600 gp, veio " + JSON.stringify(r6));
      ok.push("cancelar buy offer devolve o gold (600)");

      // ---------- 5) histórico de trades ----------
      const rawH = localStorage.getItem("tibia-idle-market-local-v1") || "{}";
      const dH = JSON.parse(rawH);
      console.log("debug: history len =", (dH.history||[]).length, "| offers =", (dH.offers||[]).length);
      const rh = await marketHistoryFetcher(200);
      if (!rh.ok || !rh.history.length) fail("histórico local deveria ter trades");
      ok.push("histórico de trades registrado (" + rh.history.length + ")");
      // a aba renderiza (espera o .then)
      _mTab = "history";
      document.body.innerHTML = '<div id="market-body"></div>';
      renderMarketHistory($("#market-body"), p);
      await new Promise((r) => setTimeout(r, 60));
      const hh = $("#market-body").innerHTML;
      if (hh.indexOf("great health potion") === -1 && hh.indexOf("Tibia Coins") === -1)
        fail("aba histórico não renderizou os trades");

      console.log("  - " + ok.join("\\n  - "));
      })();
    `, vctx);
    // dá tempo da async IIFE terminar
    setTimeout(() => {
      if (errors.length) throw new Error(errors.join(" | "));
      console.log("V36 OK — market P2P offline (sem API) validado: abre, vende, compra e cancela");
      process.exit(0);
    }, 200);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 1200);
