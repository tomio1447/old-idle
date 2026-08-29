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
  "js/brainstealer-boss.js",
]) vm.runInContext(fs.readFileSync(path.join(game, file), "utf8"), context, { filename: file });

const expected = {
  "violet-gem": 1000,
  "white-gem": 12000,
  "moonstone": 13000,
  "brainstealer-s-tissue": 240000,
  "brainstealer-s-brain": 300000,
  "brainstealer-s-brainwave": 440000,
  "eldritch-shield": 0,
  "gilded-eldritch-wand": 0,
};

for (const [slug, price] of Object.entries(expected)) {
  const item = context.GAMEDATA.items[slug];
  assert.ok(item, `${slug} deve existir`);
  assert.strictEqual(item.npcSell, price, `${slug}.npcSell`);
  assert.ok(fs.existsSync(path.join(game, "assets", "item", `${slug}.png`)), `${slug}.png deve existir`);
}
assert.ok(context.GAMEDATA.hunts["brainstealer-room"], "hunt brainstealer-room deve existir");
console.log("Brainstealer: items, loot e boss registrados.");
