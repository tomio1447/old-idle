"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const OTBM = require("../game/js/otbm.js");
const game = path.join(__dirname, "..", "game");
const context = { window: {}, BOSS_DEFS: {} };
context.window = context;
vm.createContext(context);
for (const file of ["js/gamedata.js", "js/monsterdata.js", "js/dream-courts-bosses.js"])
  vm.runInContext(fs.readFileSync(path.join(game, file), "utf8"), context, { filename: file });
const bosses = {
  alptramun: "alptramun",
  "izcandar-champion-of-summer": "izcandar_the_banished",
  "izcandar-champion-of-winter": "izcandar_the_banished",
  "malofur-mangrinder": "malofur_mangrinder",
  maxxenius: "maxxenius",
};
for (const [id, map] of Object.entries(bosses)) {
  const hunt = context.GAMEDATA.hunts[`${id}-room`];
  assert.ok(context.BOSS_DEFS[id], id);
  assert.ok(hunt, `${id} hunt`);
  assert.strictEqual(hunt.otbm, map);
  assert.strictEqual(hunt.otbmFloor, 14);
  assert.ok(fs.existsSync(path.join(game, "maps", `${map}.otbm`)), `${map}.otbm`);
  assert.ok(fs.existsSync(path.join(game, "assets", "mob", `${id}.png`)), `${id}.png`);
  const buffer = fs.readFileSync(path.join(game, "maps", `${map}.otbm`));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const parsed = OTBM.read(data, { z: 14 });
  assert.deepStrictEqual({ w: parsed.w, h: parsed.h, z: parsed.z }, { w: 21, h: 23, z: 14 });
}
const shared = context.MONSTERDATA["izcandar-the-banished"].loot;
assert.deepStrictEqual(context.BOSS_DEFS["izcandar-champion-of-summer"].loot, shared);
assert.deepStrictEqual(context.BOSS_DEFS["izcandar-champion-of-winter"].loot, shared);
for (const slug of ["alptramun-s-toothbrush", "izcandar-s-snow-globe", "izcandar-s-sundial", "maxxenius-head", "ornate-locket", "purple-tendril-lantern"]) {
  assert.ok(context.GAMEDATA.items[slug], slug);
  assert.ok(fs.existsSync(path.join(game, "assets", "item", `${slug}.png`)), `${slug}.png`);
}
console.log("Dream Courts: bosses, mapas z=14, sprites e loot compartilhado validados.");
