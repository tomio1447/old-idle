"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const game = path.join(__dirname, "..", "game");
const context = { console };
context.window = context;
vm.createContext(context);
for (const file of [
  "js/gamedata.js",
  "js/yasir-prices.js",
  "js/tentugly-boss.js",
  "js/pirat-lower.js",
  "js/roshamuul.js",
  "js/buried-cathedral.js",
]) vm.runInContext(fs.readFileSync(path.join(game, file), "utf8"), context, { filename: file });

const expected = {
  "pirate-coin": 110,
  "pirat-s-tail": 180,
  "mouldy-powder": 200,
  "shark-fins": 250,
  "small-treasure-chest": 500,
  "grappling-hook": 150,
  "cheese-cutter": 50,
  "brown-crystal-splinter": 400,
  "frazzle-tongue": 700,
  "frazzle-skin": 400,
  "silencer-claws": 390,
  "silencer-resonating-chamber": 600,
  "assassin-dagger": 20000,
  "haunted-blade": 8000,
  "nightmare-blade": 35000,
  "terra-mantle": 11000,
  "terra-legs": 11000,
  "terra-boots": 2500,
  "magma-boots": 2500,
  "lightning-boots": 2500,
  "ice-rapier": 1000,
  "knight-axe": 2000,
  "crystal-sword": 600,
  "knight-armor": 5000,
  "fire-sword": 4000,
  "wand-of-inferno": 3000,
  "wand-of-starstorm": 3600,
  "wand-of-voodoo": 4400,
  "garlic-necklace": 50,
  "bat-wing": 50,
  "cheesy-key": 0,
  "golden-sea-horse-figurine": 0,
  "plushie-of-tentugly": 0,
  "golden-dustbin": 7000,
  "golden-skull": 9000,
  "golden-cheese-wedge": 6000,
  "tiara": 11000,
  "tentacle-of-tentugly": 27000,
  "tentugly-s-eye": 52000,
  "tentugly-s-jaws": 80000,
};

for (const [slug, price] of Object.entries(expected)) {
  const item = context.GAMEDATA.items[slug];
  assert.ok(item, `${slug} deve existir`);
  assert.strictEqual(item.sell, price, `${slug}.sell`);
  assert.strictEqual(item.npcSell, price, `${slug}.npcSell`);
  if (["cheesy-key", "golden-sea-horse-figurine", "plushie-of-tentugly", "golden-dustbin", "golden-skull", "golden-cheese-wedge", "tiara", "tentacle-of-tentugly", "tentugly-s-eye", "tentugly-s-jaws"].includes(slug)) {
    assert.ok(fs.existsSync(path.join(game, "assets", "item", `${slug}.png`)), `${slug}.png deve existir`);
  }
}
assert.ok(fs.existsSync(path.join(game, "assets", "mob", "tentugly-s-head.png")), "sprite do Tentugly's Head deve existir");
console.log(`${Object.keys(expected).length} preços de loot validados.`);
