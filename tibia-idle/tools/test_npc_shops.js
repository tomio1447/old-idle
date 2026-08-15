"use strict";
/**
 * test_npc_shops.js — Enpa-Deia (gold buy) + Gnomally (major token barter)
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
must(indexHtml.includes("js/npc-shops.js?v=npc-shops-v1"), "index carrega npc-shops cache-bust");
must(indexHtml.includes("city-ui.js?v=npc-shops-v1"), "city-ui cache-bust");
must(indexHtml.includes("cyclopedia.js?v=npc-shops-v1"), "cyclopedia cache-bust");

const citySrc = fs.readFileSync(path.join(game, "js/city.js"), "utf8");
must(citySrc.includes('enpa:') && citySrc.includes('type: "npcbuy"'), "NPC Enpa buy-only");
must(citySrc.includes('gnomally:') && citySrc.includes('type: "tokenbarter"'), "NPC Gnomally tokenbarter");

const uiSrc = fs.readFileSync(path.join(game, "js/city-ui.js"), "utf8");
must(uiSrc.includes("function npcBuyOnly") && uiSrc.includes("function npcTokenBarter"), "UI buy/barter");
must(uiSrc.includes("data-npc-buy") && uiSrc.includes("data-npc-barter"), "bind buy/barter");
must(!/npcBuyOnly[\s\S]*data-sell|npcTokenBarter[\s\S]*vender ao npc/i.test(uiSrc), "modais sem sell-to-NPC");

const cyclo = fs.readFileSync(path.join(game, "js/cyclopedia.js"), "utf8");
must(cyclo.includes('cityAction: "enpa"') && cyclo.includes('cityAction: "gnomally"'), "CIDADE ENPA/GNOMALLY");

const cycloUi = fs.readFileSync(path.join(game, "js/cyclopedia-ui.js"), "utf8");
must(cycloUi.includes('action === "enpa"') && cycloUi.includes('action === "gnomally"'), "openCycloCityAction NPCs");

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
