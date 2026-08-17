/**
 * test_pouch_destroy_auto_stash.js — destroy de unsellable + auto stash routing.
 * Run: node tools/test_pouch_destroy_auto_stash.js
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

const engine = require(path.join(root, "server", "authoritative_engine.js"));
const serverSrc = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
const clientSrc = fs.readFileSync(path.join(root, "game", "js", "account-client.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "game", "js", "ui.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(root, "game", "js", "game.js"), "utf8");
const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");

/* ---- A) Destroy unsellable (engine) ---- */
must(typeof engine.destroyAuthPouchItem === "function", "engine exporta destroyAuthPouchItem");
must(Number(engine.ITEMS["jalapeno-pepper"] && engine.ITEMS["jalapeno-pepper"].sell) === 0,
  "jalapeno-pepper sell=0");
must(Number(engine.ITEMS["broken-dream"] && engine.ITEMS["broken-dream"].sell) === 0,
  "broken-dream sell=0");

const pouchP = {
  gold: 10,
  lootPouch: { "jalapeno-pepper": 3, "broken-dream": 2, "meat": 5 },
  config: {},
};
must(engine.destroyAuthPouchItem(pouchP, "jalapeno-pepper") === 3, "destroy remove 3 jalapeno");
must(!(pouchP.lootPouch["jalapeno-pepper"]), "jalapeno sumiu da pouch");
must((pouchP.lootPouch["broken-dream"] || 0) === 2, "broken-dream permanece");
must(engine.destroyAuthPouchItem(pouchP, "broken-dream") === 2, "destroy broken-dream");
must(!(pouchP.lootPouch["broken-dream"]), "broken-dream sumiu");
must((pouchP.lootPouch["meat"] || 0) === 5, "meat intacto");
must(engine.destroyAuthPouchItem(pouchP, "missing") === 0, "destroy missing = 0");

/* Sell All não remove unsellable; destroy é o caminho. */
const sellP = {
  gold: 0,
  lootPouch: { "jalapeno-pepper": 1, meat: 2 },
  config: {},
};
// meat may not exist in ITEMS with sell; use a known sellable if available
const sellable = Object.keys(engine.ITEMS).find((s) => {
  const it = engine.ITEMS[s];
  return it && (Number(it.sell) > 0 || Number(it.npcSell) > 0) && Number(it.cls || 0) < 3;
});
if (sellable) {
  sellP.lootPouch[sellable] = 1;
  sellP.lootPouch["jalapeno-pepper"] = 4;
  const gained = engine.sellAuthAllPouch(sellP);
  must(gained > 0, "sell all vende algo");
  must((sellP.lootPouch["jalapeno-pepper"] || 0) === 4, "sell all deixa jalapeno (sell 0)");
  engine.destroyAuthPouchItem(sellP, "jalapeno-pepper");
  must(!(sellP.lootPouch["jalapeno-pepper"]), "destroy limpa o que sell all não vende");
}

/* ---- B) Auto stash routing (creditHuntLoot + client routeLootItem) ---- */
must(typeof engine.setAuthAutoSupplyStash === "function", "engine exporta setAuthAutoSupplyStash");
must(engine.isSupplyStashableItem("life-ring"), "life-ring stashable no server");
must(engine.isSupplyStashableItem("might-ring"), "might-ring stashable no server");

const huntP = {
  gold: 0, supplies: {}, ammo: {}, lootPouch: {}, supplyStash: {},
  config: { autoSupplyStash: {} },
  capacity: 10000, equip: {},
};
// freeCapacity stub path: creditHuntLoot uses freeCapacity from engine
engine.ensureSupplyStash(huntP);
must(engine.setAuthAutoSupplyStash(huntP, "might-ring", true), "liga auto might-ring");
must(engine.isAutoSupplyStash(huntP, "might-ring"), "auto ON no server");

const stashLoot = engine.creditHuntLoot(huntP, "might-ring", 2);
must(stashLoot && stashLoot.ok && stashLoot.stash, "creditHuntLoot marca stash");
must((huntP.supplyStash["might-ring"] || 0) === 2, "auto loot → supply stash");
must(!(huntP.lootPouch["might-ring"]), "não foi para pouch com auto ON");

const pouchLoot = engine.creditHuntLoot(huntP, "club", 1);
must(pouchLoot && pouchLoot.ok && !pouchLoot.stash, "loot sem auto → pouch");
must((huntP.lootPouch["club"] || 0) === 1, "club na pouch");

/* Client routeLootItem */
const sandbox = { window: {}, console, GAMEDATA: null };
sandbox.window = sandbox;
function load(name) {
  vm.runInNewContext(fs.readFileSync(path.join(js, name), "utf8"), sandbox, { filename: name });
}
load("gamedata.js");
sandbox.GAMEDATA = sandbox.window.GAMEDATA || sandbox.GAMEDATA;
load("accessorydata.js");
load("supply-stash-data.js");
load("supply-stash.js");
sandbox.addLootPouch = function (pl, slug, count) {
  pl.lootPouch = pl.lootPouch || {};
  pl.lootPouch[slug] = (pl.lootPouch[slug] || 0) + count;
  return true;
};
const cp = { bag: {}, lootPouch: {}, supplyStash: {}, config: {}, equip: {} };
sandbox.ensureSupplyStash(cp);
sandbox.setAutoSupplyStash(cp, "life-ring", true);
sandbox.routeLootItem(cp, "life-ring", 2);
must((cp.supplyStash["life-ring"] || 0) === 2, "client routeLootItem → stash");
must(!(cp.lootPouch["life-ring"]), "client não manda life-ring pra pouch");

/* ---- B2) NÃO COLETAR (creditHuntLoot + routeLootItem) ---- */
must(typeof engine.isAuthNoCollect === "function", "engine exporta isAuthNoCollect");
must(typeof engine.setAuthLootConfig === "function", "engine exporta setAuthLootConfig");

const skipP = {
  gold: 0, supplies: {}, ammo: {}, lootPouch: {}, supplyStash: {},
  config: { autoSupplyStash: {} },
  lootConfig: { noCollect: ["meat", "might-ring"], noSell: ["club"] },
  capacity: 10000, equip: {},
};
const skipped = engine.creditHuntLoot(skipP, "meat", 5);
must(skipped && skipped.ok && skipped.skipped && skipped.noCollect, "creditHuntLoot skip noCollect");
must(!(skipP.lootPouch["meat"]), "meat NÃO COLETAR não entra na pouch");
must((skipP.gold || 0) === 0, "meat skip não vira gold");

engine.setAuthAutoSupplyStash(skipP, "might-ring", true);
const skipStash = engine.creditHuntLoot(skipP, "might-ring", 1);
must(skipStash && skipStash.skipped, "noCollect vence auto stash");
must(!(skipP.supplyStash["might-ring"]), "might-ring noCollect não vai pro stash");
must(!(skipP.lootPouch["might-ring"]), "might-ring noCollect não vai pra pouch");

const sellSkip = {
  gold: 0,
  lootPouch: { club: 2, meat: 1 },
  lootConfig: { noCollect: [], noSell: ["club"] },
  config: {},
};
const clubSell = engine.sellAuthPouchItem(sellSkip, "club");
must(clubSell === 0, "sellAuth respeita noSell lootConfig");
must((sellSkip.lootPouch["club"] || 0) === 2, "club noSell permanece na pouch");

sandbox.isNoCollect = function (pl, slug) {
  const list = (pl.lootConfig && pl.lootConfig.noCollect) || [];
  return list.some((r) => String(slug).indexOf(r) !== -1 || String(r) === slug);
};
const cp2 = { bag: {}, lootPouch: {}, supplyStash: {}, config: {}, equip: {},
  lootConfig: { noCollect: ["life-ring"], noSell: [] } };
sandbox.ensureSupplyStash(cp2);
sandbox.setAutoSupplyStash(cp2, "life-ring", true);
must(sandbox.routeLootItem(cp2, "life-ring", 1) === false, "client routeLootItem skip noCollect");
must(!(cp2.supplyStash["life-ring"]) && !(cp2.lootPouch["life-ring"]),
  "client noCollect não credita stash/pouch");

/* ---- C) API / UI wiring ---- */
must(serverSrc.includes("/api/instance/pouch-destroy") && serverSrc.includes("/api/pouch/destroy"),
  "server expõe pouch-destroy");
must(serverSrc.includes("/api/instance/stash-auto") && serverSrc.includes("/api/stash/auto"),
  "server expõe stash-auto");
must(serverSrc.includes("/api/instance/loot-config") && serverSrc.includes("/api/loot/config"),
  "server expõe loot-config");
must(serverSrc.includes("destroyLootPouchItem") && serverSrc.includes("setAutoSupplyStashPreference"),
  "server handlers destroy + stash-auto");
must(serverSrc.includes("setLootConfigPreference"), "server handler loot-config");
must(clientSrc.includes("accountDestroyLootPouchItem") && clientSrc.includes("accountSetAutoSupplyStash"),
  "client account helpers");
must(clientSrc.includes("accountSetLootConfig"), "client accountSetLootConfig");
must(uiSrc.includes("persistLootPouchDestroy") && uiSrc.includes("persistAutoSupplyStash"),
  "UI persist destroy + auto stash");
must(uiSrc.includes("persistLootConfig"), "UI persistLootConfig");
must(uiSrc.includes("Sem valor de venda") && uiSrc.includes("NPC não compra"),
  "UI hint para itens sell=0");
must(gameSrc.includes("autoSupplyStash=Object.assign") ||
  gameSrc.includes("autoSupplyStash = Object.assign") ||
  gameSrc.includes("playerRef.config.autoSupplyStash=Object.assign"),
  "merge profundo de autoSupplyStash no tick online");
must(gameSrc.includes("localLootConfig") && gameSrc.includes("mergeLootRules"),
  "merge de lootConfig no tick online");
must(html.includes("loot-rules-v1"), "cache-bust loot-rules-v1");

console.log("\nAll pouch destroy + auto stash + noCollect tests passed.");
