/**
 * test_market_tier.js — tier no market P2P.
 *
 * Bugs corrigidos:
 *  1. Oferta com tier anunciava sem mostrar o tier na linha (marketOfferRowHTML
 *     calculava `tier` e nunca renderizava).
 *  2. Filtro de tier do browse filtrava `it.tier` do CATÁLOGO (sempre 0) —
 *     "T1+" não exibia nada. Agora filtra pelo tier das OFERTAS ativas via
 *     índice slug→tiers (GET /api/market/offers?tiers=1).
 *
 * Run: node tools/test_market_tier.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");

function must(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

async function main() {
  // ---------- cliente ----------
  const sandbox = {
    window: {}, console, Date, Math, parseInt, Number, String, Array, Object, JSON, Set, Map, Promise,
    document: { readyState: "complete", addEventListener() {}, getElementById() { return null; } },
    $: () => null, $$: () => [],
    toast() {}, addLog() {},
    fmtFull: (n) => String(n),
    accountCoins: () => 0,
    sessionToken: () => "tok",
    marketOfferTiersIndex: async () => ({ ok: true, tiers: { "falcon-plate": [2], "sword": [0] } }),
  };
  sandbox.window = sandbox;

  for (const name of ["gamedata.js", "weapondata.js", "weapons.js", "forgedata.js", "player.js", "marketdata.js", "market-ui.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(js, name), "utf8"), sandbox, { filename: name });
  }
  if (typeof sandbox.fundirWeaponData === "function") sandbox.fundirWeaponData();
  const ctx = sandbox;

  // 1) Linha da oferta mostra o tier
  const rowHtml = vm.runInContext(
    `marketOfferRowHTML({id:1,kind:"item",slug:"falcon-plate",tier:3,qty:1,price:1000,seller_name:"Sorc",expires_at:new Date(Date.now()+86400000).toISOString()}, "sell")`, ctx);
  must(/T3/.test(rowHtml), "linha da oferta renderiza o badge T3");
  const row0 = vm.runInContext(
    `marketOfferRowHTML({id:2,kind:"item",slug:"falcon-plate",tier:0,qty:1,price:1000,seller_name:"Sorc",expires_at:new Date(Date.now()+86400000).toISOString()}, "sell")`, ctx);
  must(!/T0/.test(row0), "oferta T0 não exibe badge");

  // 2) Filtro de tier usa o índice de OFERTAS (não o catálogo)
  const catalog = vm.runInContext("marketBuildCatalog()", ctx);
  must(catalog.length > 0, "catálogo monta");

  vm.runInContext(`_mOfferTierIdx = {"falcon-plate": new Set([2]), "sword": new Set([0])};
    _mTier = "1"; _mQ = ""; _mBrowseCat = "all"; _mBrowseVoc = ""; _mBrowseLvl = "";`, ctx);
  const t1 = vm.runInContext("marketFilteredItems(marketBuildCatalog()).map((i)=>i.slug)", ctx);
  must(t1.indexOf("falcon-plate") >= 0, "T1+ exibe item com oferta T2");
  must(t1.indexOf("sword") === -1 && t1.indexOf("axe") === -1, "T1+ esconde itens sem oferta com tier");

  vm.runInContext(`_mTier = "0"`, ctx);
  const t0 = vm.runInContext("marketFilteredItems(marketBuildCatalog()).map((i)=>i.slug)", ctx);
  must(t0.indexOf("sword") >= 0, "T0 exibe item com oferta T0");
  must(t0.indexOf("falcon-plate") === -1, "T0 esconde item que só tem oferta com tier");

  // sem índice carregado ainda → não esconde nada (re-render ao chegar)
  vm.runInContext(`_mOfferTierIdx = null; _mTier = "1"`, ctx);
  const noIdx = vm.runInContext("marketFilteredItems(marketBuildCatalog()).length", ctx);
  must(noIdx === catalog.length, "índice não carregado não filtra (evita piscar)");

  // 3) Filtro de tier também recorta as ofertas exibidas no detalhe
  vm.runInContext(`_mBrowseItem = "falcon-plate";
    _mBrowseOffers = [
      {id:1,kind:"item",slug:"falcon-plate",tier:0,qty:1,price:100,seller_name:"A"},
      {id:2,kind:"item",slug:"falcon-plate",tier:5,qty:1,price:200,seller_name:"B"},
    ];`, ctx);
  vm.runInContext(`_mTier = "1"`, ctx);
  const list1 = vm.runInContext("marketOfferListHTML()", ctx);
  must(/T5/.test(list1), "T1+ mostra a oferta T5");
  must(!/>A</.test(list1), "T1+ esconde a oferta T0");
  vm.runInContext(`_mTier = ""`, ctx);
  const listAll = vm.runInContext("marketOfferListHTML()", ctx);
  must(/T5/.test(listAll) && />A</.test(listAll), "sem filtro mostra todas (T0 e T5)");

  // 4) marketEnsureTierIdx popula o índice a partir do fetcher
  vm.runInContext(`_mOfferTierIdx = null; _mTierIdxLoading = false; _mTier = "";`, ctx);
  vm.runInContext("marketEnsureTierIdx(null, null)", ctx);
  await new Promise((r) => setTimeout(r, 20));
  const idxLoaded = vm.runInContext("_mOfferTierIdx && _mOfferTierIdx['falcon-plate'] && _mOfferTierIdx['falcon-plate'].has(2)", ctx);
  must(!!idxLoaded, "ensureTierIdx popula slug→Set de tiers");

  // ---------- estrutural ----------
  const uiSrc = fs.readFileSync(path.join(js, "market-ui.js"), "utf8");
  must(uiSrc.includes("marketOfferTiersIndex"), "browse usa o índice de tiers das ofertas");

  const accSrc = fs.readFileSync(path.join(js, "account-client.js"), "utf8");
  must(accSrc.includes("marketOfferTiersIndex") && accSrc.includes("offers?tiers=1"), "account-client expõe marketOfferTiersIndex");

  const localSrc = fs.readFileSync(path.join(js, "market-local.js"), "utf8");
  must(localSrc.includes("window.marketOfferTiersIndex"), "modo local instala o índice de tiers");

  const srvSrc = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  must(srvSrc.includes('q.get("tiers")'), "endpoint /api/market/offers?tiers=1 existe");

  // ---------- servidor: branch ?tiers=1 (função real extraída do server.js) ----------
  const srvList = srvSrc.match(/async function marketList\(db, q\) \{[\s\S]*?\n\}/);
  must(!!srvList, "marketList localizado");
  const fakeOffers = [
    { slug: "falcon-plate", tier: 2, status: "active" },
    { slug: "falcon-plate", tier: 2, status: "active" },
    { slug: "sword", tier: 0, status: "active" },
  ];
  const db = { marketOffers: async () => fakeOffers, itemStats: async () => null };
  const marketListFn = vm.runInNewContext(`(${srvList[0]})`, {});
  const r = await marketListFn(db, { get: (k) => k === "tiers" ? "1" : null });
  must(r.body.ok && r.body.tiers["falcon-plate"].length === 1 && r.body.tiers["falcon-plate"][0] === 2,
    "?tiers=1 retorna falcon-plate:[2] (dedup)");
  must(r.body.tiers["sword"][0] === 0, "?tiers=1 inclui T0");

  console.log("\nAll market tier checks passed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
