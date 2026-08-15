"use strict";
/**
 * test_npc_shops.js — Enpa-Deia (gold buy) + Gnomally (major token barter)
 * + modal NPCS (catálogo Hunt-style) sem atalhos topbar/npc-quick.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const game = path.join(root, "game");

function must(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

const indexHtml = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(indexHtml.includes("js/npc-shops.js?v=enpa-lvl-sort-v1"), "index carrega npc-shops cache-bust");
must(indexHtml.includes("city-ui.js?v=npc-shop-meta-v1"), "city-ui cache-bust");
must(indexHtml.includes("i18n.js?v=npc-shop-meta-v1"), "i18n cache-bust");
must(indexHtml.includes("cyclopedia.js?v=npc-sprites-canary-v1"), "cyclopedia cache-bust");
must(indexHtml.includes("city.js?v=npc-sprites-canary-v1"), "city cache-bust");
must(indexHtml.includes("layout.css?v=npc-shop-meta-v1"), "layout cache-bust");
must(indexHtml.includes('id="btn-npcs"'), "botão NPCS abaixo de Bosses");
must(indexHtml.includes('id="btn-cidade"'), "botão CIDADE entre Bosses e NPCS");
must(
  indexHtml.indexOf('id="btn-bosses"') < indexHtml.indexOf('id="btn-cidade"')
  && indexHtml.indexOf('id="btn-cidade"') < indexHtml.indexOf('id="btn-npcs"'),
  "ordem Bosses → CIDADE → NPCS"
);
must(!indexHtml.includes('id="btn-enpa"') && !indexHtml.includes('id="btn-gnomally"'),
  "topbar sem botões ENPA/GNOMALLY");
must(!indexHtml.includes('id="npc-quick"'), "barra npc-quick removida");

const citySrc = fs.readFileSync(path.join(game, "js/city.js"), "utf8");
must(citySrc.includes('enpa:') && citySrc.includes('type: "npcbuy"'), "NPC Enpa buy-only");
must(citySrc.includes('gnomally:') && citySrc.includes('type: "tokenbarter"'), "NPC Gnomally tokenbarter");
must(citySrc.includes("King Tibianus") && citySrc.includes('type: "promotion"'), "NPC Tibianus promoção");
must(citySrc.includes('sprite: "king-tibianus"') && citySrc.includes("lookType: 332"),
  "Tibianus usa lookType Canary 332");
must(citySrc.includes('sprite: "gnomally"') && citySrc.includes("lookType: 507"),
  "Gnomally usa lookType Canary 507");
must(citySrc.includes('sprite: "enpa-deia-pema"') && citySrc.includes("lookType: 1817"),
  "Enpa usa lookType Canary 1817");
for (const slug of ["king-tibianus", "gnomally", "enpa-deia-pema"]) {
  must(fs.existsSync(path.join(game, "assets/npc", slug + "_s.png")), "sprite NPC " + slug);
}

const uiSrc = fs.readFileSync(path.join(game, "js/city-ui.js"), "utf8");
must(uiSrc.includes("function npcBuyOnly") && uiSrc.includes("function npcTokenBarter"), "UI buy/barter");
must(uiSrc.includes("function npcShopItemTextHtml") && uiSrc.includes("npc-shop-meta"),
  "linhas NPC com meta (vocação/classe/imbuements)");
must(uiSrc.includes("data-npc-buy") && uiSrc.includes("data-npc-barter"), "bind buy/barter");
must(!/npcBuyOnly[\s\S]*data-sell|npcTokenBarter[\s\S]*vender ao npc/i.test(uiSrc), "modais sem sell-to-NPC");
must(uiSrc.includes("function openNpcShop") && uiSrc.includes("function openNpcsModal"),
  "openNpcShop + openNpcsModal");
must(uiSrc.includes("function openCidadeModal") && uiSrc.includes("function openCidadeService"),
  "openCidadeModal + openCidadeService");
must(uiSrc.includes('shop: "tibianus"') && uiSrc.includes('shop: "gnomally"') && uiSrc.includes('shop: "enpa"'),
  "catálogo NPCS com os 3 NPCs");
must(
  uiSrc.includes('action: "market"')
  && uiSrc.includes('action: "reward"')
  && uiSrc.includes('action: "forge"')
  && uiSrc.includes('action: "depot"')
  && uiSrc.includes('action: "imbuements"'),
  "catálogo CIDADE com market/reward/forge/depot/imbuements"
);
must(uiSrc.includes("openCycloCityAction"), "CIDADE reusa openCycloCityAction");
must(uiSrc.includes('tibianus: "priest"'), "tibianus mapeia para priest");
must(uiSrc.includes("function promotionAccountCharacters")
  && uiSrc.includes("accountCharacterCacheRead")
  && /npcPromotion[\s\S]*promotionAccountCharacters/.test(uiSrc)
  && /promoteCharacterById[\s\S]*promotionAccountCharacters/.test(uiSrc),
  "promoção Tibianus só lista chars da conta logada");
must(uiSrc.includes("hunt-cat-title") && /npcBuyOnly[\s\S]*lastLvl/.test(uiSrc),
  "Enpa UI agrupa por nível");

const gameSrc = fs.readFileSync(path.join(game, "js/game.js"), "utf8");
must(gameSrc.includes('("#btn-npcs")') && gameSrc.includes("openNpcsModal"), "game liga btn-npcs");
must(gameSrc.includes('("#btn-cidade")') && gameSrc.includes("openCidadeModal"), "game liga btn-cidade");
must(!gameSrc.includes('("#btn-enpa")') && !gameSrc.includes('("#btn-gnomally")'),
  "game sem handlers ENPA/GNOMALLY topbar");

const cyclo = fs.readFileSync(path.join(game, "js/cyclopedia.js"), "utf8");
must(cyclo.includes('cityAction: "enpa"') && cyclo.includes('cityAction: "gnomally"'), "CIDADE ENPA/GNOMALLY");
must(cyclo.includes('cityAction: "tibianus"'), "CIDADE TIBIANUS");

const cycloUi = fs.readFileSync(path.join(game, "js/cyclopedia-ui.js"), "utf8");
must(cycloUi.includes('openNpcShop("enpa")') && cycloUi.includes('openNpcShop("gnomally")'),
  "openCycloCityAction via openNpcShop");
must(cycloUi.includes('openNpcShop("tibianus")'), "openCycloCityAction tibianus");

const citymap = fs.readFileSync(path.join(game, "js/citymap.js"), "utf8");
const cityRender = fs.readFileSync(path.join(game, "js/city-render.js"), "utf8");
must(citymap.includes("placeTempleServiceNpcs") && citymap.includes("TEMPLE_SERVICE_NPC_OFFSETS"),
  "templo oficial posiciona Enpa/Gnomally");
must(cityRender.includes("CITY.npcs"), "templo oficial desenha NPCs de serviço");

const css = fs.readFileSync(path.join(game, "css/layout.css"), "utf8");
must(css.includes(".npcs-modal-shell") && css.includes("#npcs-modal-list"), "CSS modal NPCS");
must(css.includes(".cidade-modal-shell") && css.includes("#cidade-modal-list"), "CSS modal CIDADE");
must(css.includes(".cidade-btn-icon"), "CSS ícone botão CIDADE");

const i18nSrc = fs.readFileSync(path.join(game, "js/i18n.js"), "utf8");
must(i18nSrc.includes('"btn.cidade": "CIDADE"') && i18nSrc.includes('"title.cidade"'),
  "i18n PT botão CIDADE");
must(i18nSrc.includes('"cidade.desc.market"') && i18nSrc.includes('"cidade.desc.imbuements"'),
  "i18n descrições CIDADE");

for (const slug of ["major-crystalline-token", "iron-loadstone", "glow-wine", "light-jo-staff"]) {
  must(fs.existsSync(path.join(game, "assets/item", slug + ".png")), "sprite " + slug);
}

const sandbox = {
  window: {},
  console,
  GAMEDATA: { items: {} },
  Object, Math, Number, Array, JSON, String
};
sandbox.window = sandbox;

// Minimal stubs
sandbox.buyItem = function (p, slug, price) {
  if (p.gold < price) return { ok: false, msg: "Ouro insuficiente." };
  p.gold -= price;
  p.bag[slug] = (p.bag[slug] || 0) + 1;
  return { ok: true };
};
sandbox.hasBagSpace = () => true;
sandbox.addItem = (p, slug, n) => {
  p.bag[slug] = (p.bag[slug] || 0) + (n || 1);
  return true;
};
sandbox.removeItem = (p, slug, n) => {
  n = n || 1;
  if ((p.bag[slug] || 0) < n) return false;
  p.bag[slug] -= n;
  if (p.bag[slug] <= 0) delete p.bag[slug];
  return true;
};
sandbox.itemName = (s) => (sandbox.GAMEDATA.items[s] && sandbox.GAMEDATA.items[s].n) || s;
sandbox.ensureWardrobe = (p) => {
  p.wardrobe = p.wardrobe || { outfits: {}, mounts: {} };
};
sandbox.ownsOutfit = (p, id) => !!(p.wardrobe && p.wardrobe.outfits && p.wardrobe.outfits[id] !== undefined);

// Seed some items
sandbox.GAMEDATA.items["boots-of-enlightenment"] = { n: "boots of enlightenment", sell: 48, npcSell: 80, s: "boots" };
sandbox.GAMEDATA.items["gill-gugel"] = { n: "gill gugel", s: "helmet", sell: 100 };
sandbox.GAMEDATA.items["simple-jo-staff"] = {
  n: "simple jo staff", s: "weapon", t: "fist", atk: 10, def: 6, sell: 288, npcBuy: 250
};

vm.runInNewContext(
  fs.readFileSync(path.join(game, "js/npc-shops.js"), "utf8"),
  sandbox
);

must(sandbox.GAMEDATA.items["major-crystalline-token"], "major crystalline token adicionado");
must(sandbox.GAMEDATA.items["light-jo-staff"], "light jo staff adicionado");
must(sandbox.GAMEDATA.items["boots-of-enlightenment"].sell >= 80, "seller boots >= npc 80");
must(sandbox.GAMEDATA.items["boots-of-enlightenment"].npcSell === 80, "npcSell boots 80");

const enpa = sandbox.NPC_SHOPS.enpa;
must(enpa.items.length === 11, "Enpa vende 11 itens");
must(enpa.items.every((e) => e.price > 0 && e.slug), "Enpa só compra (preços gold)");
const enpaOrder = enpa.items.map((e) => e.slug);
must(enpaOrder[0] === "light-jo-staff" && enpaOrder[enpaOrder.length - 1] === "robe-of-enlightenment",
  "Enpa ordenado por nível (início→fim)");
must(JSON.stringify(enpaOrder) === JSON.stringify([
  "light-jo-staff", "plain-monk-robe", "jo-staff",
  "boots-of-enlightenment", "harmony-amulet",
  "fists-of-enlightenment", "legs-of-enlightenment",
  "nunchaku-of-enlightenment", "coned-hat-of-enlightenment",
  "sai-of-enlightenment", "robe-of-enlightenment"
]), "Enpa ordem completa por nível");

const gno = sandbox.NPC_SHOPS.gnomally;
must(gno.currency === "major-crystalline-token", "Gnomally usa major token");
must(gno.items.some((e) => e.slug === "gill-gugel" && e.cost === 10), "Gill Gugel 10");
must(gno.items.some((e) => e.slug === "gnomish-cuirass" && e.cost === 100), "Gnomish Cuirass 100");
must(gno.items.some((e) => e.kind === "outfit" && e.outfitBase === "soil-guardian"), "Soil Guardian outfit");

const p = { gold: 2000, bag: { "major-crystalline-token": 25 }, sex: "m", wardrobe: { outfits: {}, mounts: {} } };
sandbox.GAMEDATA.items["harmony-amulet"] = { n: "harmony amulet", s: "amulet", sell: 96 };
const buy2 = sandbox.buyNpcCatalogItem(p, "enpa", "harmony-amulet");
must(buy2.ok && p.gold === 1000 && p.bag["harmony-amulet"] === 1, "Enpa buy debita gold e dá item");

const trade = sandbox.exchangeNpcBarter(p, "gnomally", 0); // gill-gugel 10
must(trade.ok && p.bag["major-crystalline-token"] === 15 && p.bag["gill-gugel"] === 1, "Gnomally troca tokens da bag");

p.bag["major-crystalline-token"] = 5;
const fail = sandbox.exchangeNpcBarter(p, "gnomally", 0);
must(!fail.ok, "bloqueia troca sem tokens suficientes");

// pouch tokens must NOT count — bagTokenCount only reads bag
p.lootPouch = { "major-crystalline-token": 100 };
p.bag["major-crystalline-token"] = 0;
must(sandbox.bagTokenCount(p, "major-crystalline-token") === 0, "tokens só na backpack");

console.log("\nAll npc-shops tests passed.");
