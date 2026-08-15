/**
 * test_supply_stash.js — Supply Stash (Auto Supply Stash, equip, charges, voc).
 * Run: node tools/test_supply_stash.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");

function must(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

const sandbox = {
  window: {},
  console,
  GAMEDATA: null,
};
sandbox.window = sandbox;

function load(name) {
  const code = fs.readFileSync(path.join(js, name), "utf8");
  vm.runInNewContext(code, sandbox, { filename: name });
}

load("gamedata.js");
sandbox.GAMEDATA = sandbox.window.GAMEDATA || sandbox.GAMEDATA;
load("accessorydata.js");
load("supply-stash-data.js");
load("supply-stash.js");

// accessories charge helpers (minimal globals)
sandbox.ITEMS = sandbox.GAMEDATA.items;
global.GAMEDATA = sandbox.GAMEDATA;
global.ITEMS = sandbox.GAMEDATA.items;

// Re-bind stash fns onto this scope
const {
  ensureSupplyStash, isSupplyStashableItem, isAutoSupplyStash, setAutoSupplyStash,
  addSupplyStash, removeSupplyStash, routeLootItem, accessoryDisplaySlug,
} = (() => {
  // supply-stash.js defined functions on sandbox
  return {
    ensureSupplyStash: sandbox.ensureSupplyStash,
    isSupplyStashableItem: sandbox.isSupplyStashableItem,
    isAutoSupplyStash: sandbox.isAutoSupplyStash,
    setAutoSupplyStash: sandbox.setAutoSupplyStash,
    addSupplyStash: sandbox.addSupplyStash,
    removeSupplyStash: sandbox.removeSupplyStash,
    routeLootItem: sandbox.routeLootItem,
    accessoryDisplaySlug: sandbox.accessoryDisplaySlug,
  };
})();

must(typeof ensureSupplyStash === "function", "supply-stash.js carregou");
must(isSupplyStashableItem("life-ring"), "life-ring é stashable");
must(isSupplyStashableItem("might-ring"), "might-ring é stashable");
must(isSupplyStashableItem("stone-skin-amulet"), "SSA é stashable");
must(!isSupplyStashableItem("sword"), "sword não é stashable");

const life = sandbox.GAMEDATA.items["life-ring"];
must(life && life.chargeMode === "time" && life.charges >= 300, "life-ring time charges Canary");
const might = sandbox.GAMEDATA.items["might-ring"];
must(might && might.chargeMode === "hits" && might.charges === 20, "might-ring hits 20");
const ssa = sandbox.GAMEDATA.items["stone-skin-amulet"];
must(ssa && ssa.chargeMode === "hits" && ssa.charges === 5, "SSA hits 5");
const terra = sandbox.GAMEDATA.items["terra-amulet"];
must(terra && terra.chargeMode === "hits", "terra-amulet hits (não time)");

// Auto Supply Stash routes loot
const p = {
  bag: {}, lootPouch: {}, supplyStash: {}, config: {}, equip: {},
  voc: "knight", level: 50, ringCharges: {},
};
ensureSupplyStash(p);
setAutoSupplyStash(p, "life-ring", true);
must(isAutoSupplyStash(p, "life-ring"), "auto ON");

// Fake addLootPouch
sandbox.addLootPouch = function (pl, slug, count) {
  pl.lootPouch = pl.lootPouch || {};
  pl.lootPouch[slug] = (pl.lootPouch[slug] || 0) + count;
  return true;
};
global.addLootPouch = sandbox.addLootPouch;

routeLootItem(p, "life-ring", 3);
must((p.supplyStash["life-ring"] || 0) === 3, "loot auto → supply stash");
must(!(p.lootPouch["life-ring"]), "não foi para loot pouch");

routeLootItem(p, "sword", 1);
must((p.lootPouch["sword"] || 0) === 1, "item sem auto vai para pouch");

// Equip from stash
load("accessories.js");
const canEquip = sandbox.canEquipItem;
const equipFrom = sandbox.equipItemFromContainer;
must(typeof equipFrom === "function", "equipItemFromContainer disponível");

const ek = {
  bag: {}, lootPouch: {}, supplyStash: { "time-ring": 2 }, config: {},
  equip: {}, voc: "elite knight", level: 20, ringCharges: {},
};
must(equipFrom(ek, "time-ring", "stash", "ring"), "equipou time-ring da stash");
must(ek.equip.ring && ek.equip.ring.item === "time-ring", "anel no slot");
must((ek.supplyStash["time-ring"] || 0) === 1, "consumiu 1 da stash");
must(ek.equip.ring.charges > 0, "cargas iniciais no equip");

// Time deplete + break
const tick = sandbox.tickAccessoryCharges;
ek.equip.ring.charges = 2;
ek.equip.ring._chargeAcc = 0;
tick(ek, 3000);
must(ek.equip.ring && ek.equip.ring.charges === 1, "time: -1 carga em 3s");
tick(ek, 3000);
must(!ek.equip.ring, "time: quebrou e removeu do slot");

// Hit deplete
const hitP = {
  bag: {}, lootPouch: {}, supplyStash: {}, config: {},
  equip: { ring: { item: "might-ring", charges: 2, maxCharges: 20 } },
  voc: "knight", level: 30, ringCharges: {},
};
sandbox.consumeAccessoryHitCharge(hitP);
must(hitP.equip.ring && hitP.equip.ring.charges === 1, "hit: -1 carga");
sandbox.consumeAccessoryHitCharge(hitP);
must(!hitP.equip.ring, "hit: quebrou no 0");

// Vocation gate — energy ring (monk/rp only by owner rule)
const knightTry = {
  bag: { "energy-ring": 1 }, lootPouch: {}, supplyStash: {}, config: {},
  equip: {}, voc: "knight", level: 50, ringCharges: {},
};
sandbox.toast = () => {};
sandbox.removeItem = function (pl, slug, n) {
  n = n || 1;
  if (!pl.bag || (pl.bag[slug] || 0) < n) return false;
  pl.bag[slug] -= n;
  if (pl.bag[slug] <= 0) delete pl.bag[slug];
  return true;
};
sandbox.addItem = function () { return true; };
must(!equipFrom(knightTry, "energy-ring", "bag", "ring"), "knight bloqueado no energy-ring");
must(!knightTry.equip.ring, "knight não equipou energy-ring");

const monkTry = {
  bag: { "energy-ring": 1 }, lootPouch: {}, supplyStash: {}, config: {},
  equip: {}, voc: "monk", level: 50, ringCharges: {},
};
must(equipFrom(monkTry, "energy-ring", "bag", "ring"), "monk pode equipar energy-ring");

// Bonus while equipped
const bonusIt = sandbox.GAMEDATA.items["time-ring"];
must(bonusIt.spd === 30, "time-ring bônus spd +30");
must(sandbox.GAMEDATA.items["might-ring"].res.physical === 20, "might-ring +20% physical");

// Transform display slug
must(accessoryDisplaySlug("spiritthorn-ring", true) === "charged-spiritthorn-ring",
  "transformEquipSlug spiritthorn");
must(accessoryDisplaySlug("life-ring", true) === "life-ring",
  "life-ring sem sprite charged separado");

// Yellow glow CSS removed from layout
const css = fs.readFileSync(path.join(root, "game", "css", "layout.css"), "utf8");
must(css.includes("legado desativado") || css.includes("acc-active"),
  "CSS: glow amarelo neutralizado / acc-active");
must(!/acc-glow-pulse[\s\S]*255,\s*214,\s*90/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")),
  "CSS layout: sem animação dourada ativa no acc-glow");

// Server creditHuntLoot
const engine = require(path.join(root, "server", "authoritative_engine.js"));
must(typeof engine.creditHuntLoot === "function", "engine exporta creditHuntLoot");
must(typeof engine.isAutoSupplyStash === "function", "engine exporta isAutoSupplyStash");

const sp = {
  gold: 0, supplies: {}, ammo: {}, lootPouch: {}, supplyStash: {},
  config: { autoSupplyStash: { "might-ring": true } },
};
engine.creditHuntLoot(sp, "might-ring", 2);
must((sp.supplyStash["might-ring"] || 0) === 2, "server: auto stash no creditHuntLoot");
must(!(sp.lootPouch["might-ring"]), "server: não foi para pouch");

engine.creditHuntLoot(sp, "club", 1);
must((sp.lootPouch["club"] || 0) === 1, "server: loot normal → pouch");

console.log("\nAll supply stash tests passed.");
