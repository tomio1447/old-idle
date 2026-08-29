"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const context = { console };
context.window = context;
vm.createContext(context);
for (const file of ["js/gamedata.js", "js/the-void.js"])
  vm.runInContext(fs.readFileSync(path.join(game, file), "utf8"), context, { filename: file });
const hunt = context.GAMEDATA.hunts["the-void"];
assert.ok(hunt);
assert.deepStrictEqual(Array.from(hunt.monsters), ["reality-reaver", "dread-intruder", "breach-brood"]);
assert.strictEqual(hunt.packMin, 5);
assert.strictEqual(hunt.packMax, 8);
assert.deepStrictEqual(JSON.parse(JSON.stringify(hunt.otbmSpawn)), { x: 1016, y: 1030, z: 7 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(hunt.otbmMobBounds)), { x: 1012, y: 1024, w: 17, h: 9, z: 7 });
assert.ok(fs.existsSync(path.join(game, "maps", "thevoid.otbm")));
for (const slug of ["energy-drink", "plasmatic-lightning", "plasma-pearls", "dangerous-proto-matter", "frozen-lightning", "instable-proto-matter", "odd-organ", "curious-matter", "volatile-proto-matter", "spark-sphere"])
  assert.ok(fs.existsSync(path.join(game, "assets", "item", `${slug}.png`)), `${slug}.png`);
console.log("The Void: mapa, spawn, monstros e loot validados.");
