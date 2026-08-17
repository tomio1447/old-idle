/**
 * Charge/time rings & amulets: destroy only the depleted instance;
 * stack only when at full charges (partials stay as separate instances).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = {
  window: {},
  console,
  Date,
  Math,
  parseInt,
  Number,
  String,
  Object,
  Array,
  JSON,
  parseFloat,
  isFinite: Number.isFinite,
};
sandbox.window = sandbox;
sandbox.global = sandbox;

function load(rel) {
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
}

load("game/js/gamedata.js");
load("game/js/weapondata.js");
load("game/js/weapons.js");
load("game/js/accessorydata.js");
load("game/js/supply-stash-data.js");
load("game/js/player.js");
load("game/js/accessories.js");
// Minimal stubs so equip checks that call vocationName do not throw.
if (typeof sandbox.VOCATIONS === "undefined") {
  sandbox.VOCATIONS = {
    knight: { name: "Knight" },
    paladin: { name: "Paladin" },
    sorcerer: { name: "Sorcerer" },
    druid: { name: "Druid" },
    monk: { name: "Monk" },
  };
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mkPlayer() {
  const p = {
    bag: {},
    itemInstances: [],
    equip: {},
    ringCharges: {},
    config: {},
    lootPouch: {},
    supplyStash: {},
    level: 100,
    voc: "knight",
    _itemInstancesVersion: 2,
  };
  sandbox.ensureItemInstances(p);
  return p;
}

const ok = [];

// 1) SSA: break destroys only equipped copy
{
  const p = mkPlayer();
  must(sandbox.addItem(p, "stone-skin-amulet", 3), "add 3 SSA");
  must((p.bag["stone-skin-amulet"] || 0) === 3, "SSA stack 3");
  must(p.itemInstances.filter((i) => i.slug === "stone-skin-amulet").length === 0, "no SSA instances when full");
  must(sandbox.equipItemFromContainer(p, "stone-skin-amulet", "bag", "amulet"), "equip SSA");
  must((p.bag["stone-skin-amulet"] || 0) === 2, "bag left 2");
  p.equip.amulet.charges = 1;
  sandbox.accessoryConsumeCharge(p, "amulet");
  must(!p.equip.amulet, "SSA slot cleared after break");
  must((p.bag["stone-skin-amulet"] || 0) === 2, "other SSA copies untouched");
  ok.push("SSA break destroys only depleted instance");
}

// 2) Partials do not stack; fulls do
{
  const p = mkPlayer();
  must(sandbox.addItem(p, "might-ring", 1, { charges: 7 }), "add partial might");
  must((p.bag["might-ring"] || 0) === 0, "partial not in bag stack");
  must(p.itemInstances.filter((i) => i.slug === "might-ring" && i.charges === 7).length === 1, "partial is instance");
  must(sandbox.addItem(p, "might-ring", 2), "add 2 full might");
  must((p.bag["might-ring"] || 0) === 2, "full might stack 2");
  must(p.itemInstances.filter((i) => i.slug === "might-ring").length === 1, "still one partial");
  ok.push("full-only stacking (might ring)");
}

// 3) Unequip mid-charges → partial instance; bag full stack intact
{
  const p = mkPlayer();
  sandbox.addItem(p, "stone-skin-amulet", 2);
  sandbox.equipItemFromContainer(p, "stone-skin-amulet", "bag", "amulet");
  p.equip.amulet.charges = 3;
  const entry = Object.assign({}, p.equip.amulet, { _slot: "amulet", slot: "amulet" });
  must(sandbox.stashEquippedItem(p, entry, "bag"), "unequip partial SSA");
  must(!p.equip.amulet, "amulet slot empty");
  must((p.bag["stone-skin-amulet"] || 0) === 1, "remaining full still stacked");
  const parts = p.itemInstances.filter((i) => i.slug === "stone-skin-amulet" && i.loc === "bag");
  must(parts.length === 1 && parts[0].charges === 3, "unequipped partial is instance @3");
  ok.push("unequip partial → isolated instance");
}

// 4) Soft boots: decay to worn; other copies safe
{
  const p = mkPlayer();
  must(sandbox.addItem(p, "pair-of-soft-boots", 2), "add 2 soft boots");
  must(sandbox.equipItemFromContainer(p, "pair-of-soft-boots", "bag", "boots"), "equip soft boots");
  p.equip.boots.charges = 1;
  p.equip.boots._chargeAcc = 0;
  sandbox.tickAccessoryCharges(p, 3000);
  must(p.equip.boots && p.equip.boots.item === "worn-soft-boots", "soft → worn-soft-boots");
  must((p.bag["pair-of-soft-boots"] || 0) === 1, "other soft boots safe");
  ok.push("soft boots decay only equipped copy");
}

// 5) Plasma ring time-break leaves bag stack (direct equip — skip voc gate)
{
  const p = mkPlayer();
  const slug = "ring-of-blue-plasma";
  const it = sandbox.GAMEDATA.items[slug];
  must(it && it.charges, "plasma ring in catalog");
  sandbox.addItem(p, slug, 3);
  must(sandbox.removeItem(p, slug, 1), "take one plasma from bag");
  p.equip.ring = { item: slug, charges: 1, maxCharges: it.charges, _chargeAcc: 0 };
  sandbox.tickAccessoryCharges(p, 3000);
  must(!p.equip.ring, "plasma ring broke");
  must((p.bag[slug] || 0) === 2, "other plasma copies safe");
  ok.push("plasma ring break destroys one");
}

// 6) sync merges full chargeable instances into bag stack
{
  const p = mkPlayer();
  p.itemInstances.push({ id: "x1", slug: "might-ring", loc: "bag", tier: 0, charges: 20, maxCharges: 20 });
  p.itemInstances.push({ id: "x2", slug: "might-ring", loc: "bag", tier: 0, charges: 7, maxCharges: 20 });
  sandbox.syncBagCountsFromInstances(p);
  must((p.bag["might-ring"] || 0) === 1, "full instance merged to bag");
  must(p.itemInstances.filter((i) => i.slug === "might-ring").length === 1, "partial kept as instance");
  must(p.itemInstances[0].charges === 7, "kept partial has 7 charges");
  ok.push("syncBagCountsFromInstances full-merge");
}

// 7) Charge→0 via time tick (last charge)
{
  const p = mkPlayer();
  const slug = "time-ring";
  const full = sandbox.accessoryCatalogCharges(slug);
  must(full > 0, "time-ring has charges");
  sandbox.addItem(p, slug, 2);
  must(sandbox.removeItem(p, slug, 1), "take one time-ring");
  p.equip.ring = { item: slug, charges: 1, maxCharges: full, _chargeAcc: 0 };
  sandbox.tickAccessoryCharges(p, 3000);
  must(!p.equip.ring, "time-ring destroyed at 0");
  must((p.bag[slug] || 0) === 1, "other time-ring safe");
  ok.push("time tick reaches 0 then destroy one");
}

console.log("OK — charge stack/destroy:");
for (const line of ok) console.log("  ·", line);
console.log("ALL PASSED (" + ok.length + ")");
