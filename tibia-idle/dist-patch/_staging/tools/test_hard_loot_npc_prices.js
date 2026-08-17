/* Preços NPC dos loot HARD/MOTA + Yasir (Goshnar) + sell pouch seguro. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function must(ok, msg) { if (!ok) throw new Error(msg); }

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
must(html.includes("hard-hunts.js?v=loot-npc-prices-v1"), "cache-bust hard-hunts");
must(html.includes("yasir-prices.js?v=goshnar-yasir-v1"), "cache-bust yasir-prices");
must(html.includes("soulwar.js?v=yasir-loot-meta-v1"), "cache-bust soulwar");

const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), sandbox);
sandbox.GAMEDATA = sandbox.window.GAMEDATA;
vm.runInNewContext(fs.readFileSync(path.join(js, "hard-hunts.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(js, "soulwar.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(js, "yasir-prices.js"), "utf8"), sandbox);
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
  /* Yasir / Soul War boss loot (TibiaWiki) */
  "greed-s-arm": 950000,
  "greeds-arm": 950000,
  "figurine-of-greed": 2900000,
  "vial-of-hatred": 737000,
  "figurine-of-hatred": 2700000,
  "spite-s-spirit": 840000,
  "spites-spirit": 840000,
  "figurine-of-spite": 3000000,
  "malice-s-spine": 850000,
  "malices-spine": 850000,
  "malice-s-horn": 620000,
  "malices-horn": 620000,
  "figurine-of-malice": 2800000,
  "cruelty-s-claw": 640000,
  "cruelty-s-chest": 720000,
  "figurine-of-cruelty": 3100000,
  "figurine-of-megalomania": 5000000,
  "megalomania-s-skull": 1500000,
  "megalomania-s-essence": 1900000,
  "crawler-s-essence": 3700,
  "roots": 1200,
  "mould-heart": 2100,
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
must(engine.ITEMS["greed-s-arm"] && Number(engine.ITEMS["greed-s-arm"].sell) === 950000,
  "server greed-s-arm Yasir 950000");
must(Number(engine.ITEMS["greed-s-arm"].npcSell) === 950000, "server greed-s-arm npcSell");
must(Number(engine.ITEMS["figurine-of-greed"].sell) === 2900000, "server figurine-of-greed");
must(Number(engine.ITEMS["malice-s-horn"].sell) === 620000, "server malice-s-horn");
must(Number(engine.ITEMS["spite-s-spirit"].sell) === 840000, "server spite-s-spirit");
must(Number(engine.ITEMS["figurine-of-megalomania"].sell) === 5000000, "server figurine-of-megalomania");

const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
must(uiSrc.includes("function pouchUnitSellPrice"), "pouchUnitSellPrice no client");
must(uiSrc.includes("Number.isFinite(value)"), "sellPouchItem guarda NaN");

/* Sell All deve reconhecer Greed's arm via pouchUnitSellPrice. */
const pouchUnit = (it) => {
  if (!it) return 0;
  const npc = Number(it.npcSell);
  if (Number.isFinite(npc) && npc > 0) return Math.floor(npc);
  const sell = Number(it.sell);
  if (Number.isFinite(sell) && sell > 0) return Math.floor(sell);
  return 0;
};
must(pouchUnit(items["greed-s-arm"]) === 950000, "Sell All unit price greed-s-arm");
must(pouchUnit(engine.ITEMS["greed-s-arm"]) === 950000, "Sell All server unit greed-s-arm");

console.log("OK: HARD/MOTA + Yasir Goshnar NPC sell prices + pouch sell safe.");
