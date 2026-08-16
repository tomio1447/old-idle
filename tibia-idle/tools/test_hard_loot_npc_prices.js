/* Preços NPC dos loot HARD/MOTA + sell pouch não trava sem preço. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function must(ok, msg) { if (!ok) throw new Error(msg); }

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
must(html.includes("hard-hunts.js?v=loot-npc-prices-v1"), "cache-bust hard-hunts");
must(html.includes("ui.js?v=pouch-destroy-stash-v1"), "cache-bust ui");

const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), sandbox);
sandbox.GAMEDATA = sandbox.window.GAMEDATA;
vm.runInNewContext(fs.readFileSync(path.join(js, "hard-hunts.js"), "utf8"), sandbox);
const items = sandbox.GAMEDATA.items;

const expect = {
  "jalapeno-pepper": 0,
  "cobra-crest": 650,
  "small-enchanted-ruby": 250,
  "opal": 500,
  "sample-of-monster-blood": 250,
  "cheesy-figurine": 150,
  "red-crystal-fragment": 800,
  "goosebump-leather": 650,
  "pool-of-chitinous-glue": 480,
  "gemmed-figurine": 3500,
  "broken-dream": 0,
  "onyx-chip": 500,
};

for (const [slug, price] of Object.entries(expect)) {
  const it = items[slug];
  must(it, "item ausente: " + slug);
  must(Number(it.sell) === price, slug + " sell=" + it.sell + " esperado " + price);
  must(Number(it.npcSell) === price, slug + " npcSell=" + it.npcSell + " esperado " + price);
}

const engine = require("../server/authoritative_engine");
must(engine.ITEMS["cobra-crest"] && Number(engine.ITEMS["cobra-crest"].sell) === 650,
  "server ITEMS cobra-crest");
must(Number(engine.ITEMS["gemmed-figurine"].sell) === 3500, "server gemmed-figurine");
must(Number(engine.ITEMS["jalapeno-pepper"].sell) === 0, "server jalapeno unsellable");
must(Number(engine.ITEMS["broken-dream"].sell) === 0, "server broken-dream unsellable");

const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
must(uiSrc.includes("function pouchUnitSellPrice"), "pouchUnitSellPrice no client");
must(uiSrc.includes("Number.isFinite(value)"), "sellPouchItem guarda NaN");

console.log("OK: HARD/MOTA NPC sell prices + pouch sell safe.");
