/**
 * test_admin_forge_equip_list.js — admin FORJE lista todos os slots elegíveis.
 * Run: node tools/test_admin_forge_equip_list.js
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

const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
must(html.includes("js/admin.js?v=admin-forge-equip-v1"), "index cache-bust admin.js");
must(html.includes("js/player.js?v=admin-forge-equip-v1"), "index cache-bust player.js");

const sandbox = {
  window: {},
  console,
  Date,
  Math,
  parseInt,
  Number,
  String,
  Array,
  Object,
  JSON,
};
sandbox.window = sandbox;

function load(name) {
  const code = fs.readFileSync(path.join(js, name), "utf8");
  vm.runInNewContext(code, sandbox, { filename: name });
}

load("gamedata.js");
sandbox.GAMEDATA = sandbox.window.GAMEDATA || sandbox.GAMEDATA;
load("weapondata.js");
load("weapons.js");
if (typeof sandbox.fundirWeaponData === "function") sandbox.fundirWeaponData();
load("forgedata.js");
load("player.js");
load("admin.js");

must(typeof sandbox.forgeIsEligibleItem === "function", "forgeIsEligibleItem carregou");
must(typeof sandbox.ensureItemInstances === "function", "ensureItemInstances carregou");
must(typeof sandbox.adminForgeInventoryInstances === "function", "adminForgeInventoryInstances carregou");

must(sandbox.forgeIsEligibleItem("eldritch-wand"), "eldritch wand elegível");
must(sandbox.forgeIsEligibleItem("eldritch-cowl"), "eldritch cowl elegível");
must(sandbox.forgeIsEligibleItem("eldritch-cuirass"), "eldritch cuirass elegível");
must(sandbox.forgeMaxTierForSlug("eldritch-wand") === 10, "eldritch wand máx T10");

// Simula personagem full gear equipado SEM instId (bug do kit admin legado).
const p = {
  bag: {},
  equip: {
    helmet: { item: "eldritch-cowl", count: 1 },
    armor: { item: "eldritch-cuirass", count: 1 },
    weapon: { item: "eldritch-wand", count: 1 },
    legs: { item: "eldritch-breeches", count: 1 },
    boots: { item: "pair-of-soulwalkers", count: 1 },
    backpack: { item: "bag", count: 1 },
  },
  itemInstances: [
    // só a arma tinha instância (fluxo normal) — os outros slots não
    { id: "it-wand-only", slug: "eldritch-wand", loc: "equip:weapon", tier: 0 },
  ],
  _itemInstancesVersion: 2,
  _itemInstSeq: 10,
  forge: {},
  dust: 0,
  dustLimit: 100,
  slivers: 0,
  exaltedCores: 0,
};

p.equip.weapon.instId = "it-wand-only";

const before = (p.itemInstances || []).filter((i) => i && String(i.loc || "").indexOf("equip:") === 0);
must(before.length === 1, "pré-fix: só 1 instância equipada (wand)");

const list = sandbox.adminForgeInventoryInstances(p);
must(list.length >= 3, "lista admin >= 3 (helmet+armor+weapon+…) got " + list.length);
must(list.length >= 5, "lista admin cobre os 5 slots forgeáveis got " + list.length);

const slugs = list.map((e) => e.slug);
must(slugs.indexOf("eldritch-wand") >= 0, "eldritch wand ainda aparece");
must(slugs.indexOf("eldritch-cowl") >= 0, "eldritch cowl aparece");
must(slugs.indexOf("eldritch-cuirass") >= 0, "eldritch cuirass aparece");
must(slugs.indexOf("eldritch-breeches") >= 0, "eldritch breeches aparece");
must(slugs.indexOf("pair-of-soulwalkers") >= 0, "soulwalkers aparece");

must(p.equip.helmet.instId, "helmet recebeu instId na reconciliação");
must(p.equip.armor.instId, "armor recebeu instId na reconciliação");
must(p.equip.weapon.instId === "it-wand-only", "weapon manteve instância original");

const adminSrc = fs.readFileSync(path.join(js, "admin.js"), "utf8");
must(adminSrc.includes('id="adm-forge-eligible-count"'), "contador elegíveis com id próprio");
must(adminSrc.includes(">tier</span>"), "label tier separa o input 0 do texto elegíveis");
must(adminSrc.includes("function adminSetEquipSlot"), "adminSetEquipSlot presente");

console.log("\nAll admin forge equip list checks passed.");
