"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const context = { console, BOSS_DEFS: {} };
context.window = context;
vm.createContext(context);
for (const file of ["js/gamedata.js", "js/dream-courts-bosses.js"])
  vm.runInContext(fs.readFileSync(path.join(game, file), "utf8"), context, { filename: file });
const hunt = context.GAMEDATA.hunts["plagueroot-room"];
assert.ok(hunt);
assert.strictEqual(hunt.otbmFloor, 14);
assert.deepStrictEqual(JSON.parse(JSON.stringify(hunt.otbmSpawn)), { x: 32208, y: 32054, z: 14 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(hunt.otbmMobBounds)), { x: 32208, y: 32045, z: 14, w: 1, h: 1 });
assert.ok(context.BOSS_DEFS.plagueroot);
assert.strictEqual(context.BOSS_DEFS.plagueroot.hp, 320000);
for (const [slug, price] of Object.entries({ "huge-chunk-of-crude-iron": 15000, "crunor-idol": 30000, "plagueroot-offshoot": 280000, "soul-stone": 6000 })) {
  assert.strictEqual(context.GAMEDATA.items[slug].npcSell, price);
  assert.ok(fs.existsSync(path.join(game, "assets", "item", `${slug}.png`)), `${slug}.png`);
}
assert.ok(fs.existsSync(path.join(game, "maps", "plagueroot.otbm")));
console.log("Plagueroot: mapa, posições, boss e loot validados.");
