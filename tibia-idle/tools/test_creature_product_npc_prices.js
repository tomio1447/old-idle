/* Creature products: sell/npcSell alinhados à TibiaWiki NPC price. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function must(ok, msg) { if (!ok) throw new Error(msg); }

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
must(html.includes("gamedata.js?v=creature-product-npc-prices-v1"), "cache-bust gamedata");

const sandbox = { window: {}, console };
vm.runInNewContext(
  fs.readFileSync(path.join(root, "game", "js", "gamedata.js"), "utf8"),
  sandbox
);
const items = sandbox.window.GAMEDATA.items;

/* Amostras da wiki Creature Products by NPC Price */
const expect = {
  "wolf-paw": 70,
  "minotaur-leather": 80,
  "behemoth-claw": 2000,
  "demonic-essence": 1000,
  "dragon-s-tail": 100,
  "green-dragon-leather": 100,
  "spider-silk": 100,
  "orc-leather": 30,
  "star-herb": 15,
  "stone-herb": 20,
  "vexclaw-talon": 1100,
};

for (const [slug, price] of Object.entries(expect)) {
  const it = items[slug];
  must(it, "item ausente: " + slug);
  must(Number(it.sell) === price, slug + " sell=" + it.sell + " esperado " + price);
  must(Number(it.npcSell) === price, slug + " npcSell=" + it.npcSell + " esperado " + price);
}

/* Analyser / sell-all usam lootNpcUnitValue → npcSell || sell */
const playerSrc = fs.readFileSync(path.join(root, "game", "js", "player.js"), "utf8");
must(playerSrc.includes("function lootNpcUnitValue"), "lootNpcUnitValue");
must(playerSrc.includes("it.npcSell"), "lootNpcUnitValue lê npcSell");

const engine = require("../server/authoritative_engine");
must(engine.ITEMS["wolf-paw"] && Number(engine.ITEMS["wolf-paw"].sell) === 70,
  "server ITEMS wolf-paw sell wiki");
must(Number(engine.ITEMS["behemoth-claw"].sell) === 2000, "server behemoth-claw");

console.log("OK: creature product NPC prices (wiki) em gamedata + server ITEMS.");
