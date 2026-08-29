"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const root = path.join(__dirname, "..", "game", "js");
const context = { GAMEDATA: { hunts: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "huntmapdata.js"), "utf8"), context);
const map = {
  rows: Array.from({ length: 20 }, () => ".".repeat(30)),
  leg: { ".": { v: [100] } },
  fovWidth: 21,
  fovHeight: 13,
};
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.huntMapFovBounds(map))), { x: 4, y: 3, maxX: 24, maxY: 15 });
assert.strictEqual(context.huntMapBlocked(map, 4, 3), false);
assert.strictEqual(context.huntMapBlocked(map, 24, 15), false);
assert.strictEqual(context.huntMapBlocked(map, 3, 3), true);
assert.strictEqual(context.huntMapBlocked(map, 25, 15), true);
assert.strictEqual(context.huntMapBlocked(map, 4, 2), true);
assert.strictEqual(context.huntMapBlocked(map, 24, 16), true);
const render = fs.readFileSync(path.join(root, "render.js"), "utf8");
const match = render.match(/function bossSpawnCountdownSeconds\(combat, now\) \{[\s\S]*?\n\}/);
assert.ok(match);
vm.runInContext(match[0], context);
assert.strictEqual(context.bossSpawnCountdownSeconds({ arenaBossSpawn: { at: 15000, pending: {}, spawned: false } }, 10500), 5);
assert.strictEqual(context.bossSpawnCountdownSeconds({ arenaBossSpawn: { at: 10000, pending: {}, spawned: false } }, 10500), 0);
assert.strictEqual(context.bossSpawnCountdownSeconds({ arenaBossSpawn: { at: 15000, pending: null, spawned: true } }, 10500), null);
console.log("FOV global e contador de spawn do boss validados.");
