/**
 * test_supply_stash_move_amulets.js — dois amuletos distintos pouch→stash.
 * Run: node tools/test_supply_stash_move_amulets.js
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

const sandbox = { console, window: {}, GAMEDATA: null };
sandbox.window = sandbox;

function load(name) {
  vm.runInNewContext(fs.readFileSync(path.join(js, name), "utf8"), sandbox, { filename: name });
}

const weapons = JSON.parse(fs.readFileSync(path.join(root, "game", "data", "weapons.json"), "utf8"));
sandbox.GAMEDATA = { items: weapons.items || weapons };
load("supply-stash-data.js");
load("supply-stash.js");

sandbox.removeLootPouch = function (p, slug, count) {
  count = count || 1;
  if (!p.lootPouch || !p.lootPouch[slug]) return false;
  p.lootPouch[slug] -= count;
  if (p.lootPouch[slug] <= 0) delete p.lootPouch[slug];
  return true;
};
sandbox.addLootPouch = function (p, slug, count) {
  p.lootPouch = p.lootPouch || {};
  p.lootPouch[slug] = (p.lootPouch[slug] || 0) + (count || 1);
  return true;
};

const {
  moveItemToSupplyStash, supplyStashSlotsUsed, ensureSupplyStash, SUPPLY_STASH_CAP,
} = {
  moveItemToSupplyStash: sandbox.moveItemToSupplyStash,
  supplyStashSlotsUsed: sandbox.supplyStashSlotsUsed,
  ensureSupplyStash: sandbox.ensureSupplyStash,
  SUPPLY_STASH_CAP: sandbox.SUPPLY_STASH_CAP,
};

must(typeof moveItemToSupplyStash === "function", "moveItemToSupplyStash disponível");
must(sandbox.isSupplyStashableItem("stone-skin-amulet"), "SSA stashable");
must(sandbox.isSupplyStashableItem("sacred-tree-amulet"), "sacred-tree stashable");

const p = {
  bag: {},
  lootPouch: { "stone-skin-amulet": 1, "sacred-tree-amulet": 1 },
  supplyStash: {},
  config: {},
  equip: {},
};

must(moveItemToSupplyStash(p, { source: "pouch", slug: "stone-skin-amulet" }),
  "move 1: SSA pouch → stash");
must((p.supplyStash["stone-skin-amulet"] || 0) === 1, "stash tem SSA");
must(!(p.lootPouch["stone-skin-amulet"]), "SSA saiu da pouch");
must((p.lootPouch["sacred-tree-amulet"] || 0) === 1, "sacred ainda na pouch");

must(moveItemToSupplyStash(p, { source: "pouch", slug: "sacred-tree-amulet" }),
  "move 2: sacred-tree pouch → stash");
must((p.supplyStash["stone-skin-amulet"] || 0) === 1, "SSA permanece no stash (não foi substituído)");
must((p.supplyStash["sacred-tree-amulet"] || 0) === 1, "stash tem sacred-tree");
must(!(p.lootPouch["sacred-tree-amulet"]), "sacred saiu da pouch");
must(Object.keys(p.lootPouch || {}).length === 0, "pouch vazia após os dois moves");
must(supplyStashSlotsUsed(p) === 2, "stash usa 2 slots distintos");

// Stash não vira array / não sobrescreve mapa inteiro
ensureSupplyStash(p);
must(!Array.isArray(p.supplyStash), "supplyStash é objeto-mapa");
must(Object.keys(p.supplyStash).sort().join(",") === "sacred-tree-amulet,stone-skin-amulet",
  "chaves do stash são os dois slugs");

// Motor autoritativo espelha o mesmo contrato
const engine = require(path.join(root, "server", "authoritative_engine.js"));
must(typeof engine.moveItemToSupplyStash === "function", "engine exporta moveItemToSupplyStash");
const sp = {
  bag: {},
  lootPouch: { "stone-skin-amulet": 1, "sacred-tree-amulet": 1 },
  supplyStash: {},
  config: {},
};
must(engine.moveItemToSupplyStash(sp, { source: "pouch", slug: "stone-skin-amulet" }),
  "server move 1 SSA");
must(engine.moveItemToSupplyStash(sp, { source: "pouch", slug: "sacred-tree-amulet" }),
  "server move 2 sacred");
must((sp.supplyStash["stone-skin-amulet"] || 0) === 1 &&
  (sp.supplyStash["sacred-tree-amulet"] || 0) === 1,
  "server: dois amuletos no stash");
must(!sp.lootPouch["stone-skin-amulet"] && !sp.lootPouch["sacred-tree-amulet"],
  "server: removidos da pouch");

const bagP = {
  bag: { "might-ring": 200, "sword": 1 },
  lootPouch: {},
  supplyStash: { "might-ring": 100 },
  config: {},
};
must(engine.moveItemToSupplyStash(bagP, { source: "bag", slug: "might-ring" }),
  "server: bag → stash move");
must(!(bagP.bag["might-ring"]), "server: might-ring saiu da bag");
must((bagP.bag.sword || 0) === 1, "server: outros itens da bag permanecem");
must((bagP.supplyStash["might-ring"] || 0) === 300, "server: stash soma as cargas da bag");

// Rotas HTTP documentadas
const serverSrc = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
must(serverSrc.includes("/api/instance/stash-move") && serverSrc.includes("/api/stash/move"),
  "server expõe stash-move");
must(serverSrc.includes("moveItemToSupplyStash"), "server usa moveItemToSupplyStash");
must(/STASH_MOVE_FAILED[\s\S]{0,500}bag:p\.bag\|\|\{\}/.test(serverSrc),
  "stash/move devolve bag no snapshot da cidade");

const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
must(uiSrc.includes("persistMoveToSupplyStash"), "UI persiste move para stash");
must(uiSrc.includes("if (result.bag) p.bag"), "UI aplica bag após move para stash");
must(uiSrc.includes("renderInventory"), "UI redesenha a mochila após move para stash");

const accSrc = fs.readFileSync(path.join(js, "account-client.js"), "utf8");
must(accSrc.includes("if(r.data.bag)G.p.bag=r.data.bag||{}"),
  "account-client aplica bag no /api/stash/move");

const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
must(/js\/supply-stash\.js\?v=/.test(html), "cache-bust supply-stash");
must(html.includes("js/ui.js?v="), "cache-bust ui stash-move");
must(html.includes("js/account-client.js?v="), "cache-bust account-client stash-move");

console.log("\nAll supply stash amulet move tests passed. CAP=", SUPPLY_STASH_CAP || 20);
