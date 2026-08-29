"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const game = path.join(__dirname, "..", "game");
const context = { console, BOSS_DEFS: {} };
context.window = context;
vm.createContext(context);
for (const file of ["js/gamedata.js", "js/monsterdata.js", "js/mobsheetdata.js", "js/creatureanchordata.js", "js/monstermovedata.js", "js/brain-head-boss.js"])
  vm.runInContext(fs.readFileSync(path.join(game, file), "utf8"), context, { filename: file });
const hunt = context.GAMEDATA.hunts["brain-head-room"];
assert.ok(hunt);
assert.strictEqual(hunt.otbmFloor, 7);
assert.deepStrictEqual(JSON.parse(JSON.stringify(hunt.otbmSpawn)), { x: 1024, y: 1034, z: 7 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(hunt.otbmMobBounds)), { x: 1024, y: 1028, z: 7, w: 1, h: 1 });
assert.ok(context.BOSS_DEFS["brain-head"]);
assert.strictEqual(context.BOSS_DEFS["brain-head"].hp, 75000);
assert.ok(context.MOBSHEETS["brain-head"]);
assert.ok(context.MOBSHEETS.cerebellum);
assert.ok(context.CREATURE_ANCHORS["brain-head"]);
assert.ok(context.MONSTERMOVES["brain-head"]);
assert.ok(context.MONSTERMOVES.cerebellum);
for (const slug of ["cursed-bone", "death-toll", "ivory-comb", "silver-hand-mirror", "amber-with-a-dragonfly", "phantasmal-axe", "ghost-claw", "giant-amethyst", "spooky-hood", "ring-of-souls"])
  assert.ok(fs.existsSync(path.join(game, "assets", "item", `${slug}.png`)), `${slug}.png`);
assert.ok(fs.existsSync(path.join(game, "assets", "mob", "brain-head.png")));
assert.ok(fs.existsSync(path.join(game, "assets", "mob", "cerebellum.png")));
assert.ok(fs.existsSync(path.join(game, "maps", "brainheadroom.otbm")));

const c = { brainHead: { cerebella: [{ hp: 10, slug: "cerebellum" }] } };
assert.strictEqual(context.brainheadBossCanTakePlayerDamage(c, { boss: true, slug: "brain-head" }), false);
c.brainHead.cerebella[0].hp = 0;
assert.strictEqual(context.brainheadBossCanTakePlayerDamage(c, { boss: true, slug: "brain-head" }), true);
console.log("Brain Head: mapa, spawn, monstros, sprites e mecânica validados.");
