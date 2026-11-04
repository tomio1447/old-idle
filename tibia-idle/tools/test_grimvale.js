"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.join(__dirname, "..");
const game = path.join(root, "game");
const OTBM = require("../game/js/otbm");
const defs = require("../game/js/grimvale");
const engine = require("../server/authoritative_engine");
const canonical = require("../game/data/canarymonsters.json");
global.window = { addEventListener() {} };
const { applyHuntOtbmZones } = require("../game/js/otbmhunt");
const ctx = { console, MISSION_DEFS: {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const name of ["gamedata", "monsterdata", "mobsheetdata", "tileflags", "tilepatterndata", "hunt-sections", "grimvale"])
  vm.runInContext(fs.readFileSync(path.join(game, "js", name + ".js"), "utf8"), ctx);

for (const [id, hunt] of Object.entries(defs.hunts)) {
  test(id + " registers the hunt and mission on the client and hunt on the server", () => {
    assert.equal(JSON.stringify(ctx.GAMEDATA.hunts[id]), JSON.stringify(hunt));
    assert.equal(JSON.stringify(engine.HUNTS[id]), JSON.stringify(hunt));
    assert.ok(ctx.HUNT_MODAL_SECTIONS.some((section) => section.ids.includes(id)));
    const mission = ctx.MISSION_DEFS[id];
    assert.deepEqual(Array.from(mission.tasks, (task) => task.monster), hunt.monsters);
    assert.ok(mission.tasks.every((task) => task.target === (hunt.otbm === "grimvale" ? 250 : 500)));
    assert.equal(mission.completeReward, undefined);
    assert.equal(hunt.minLevel, 0);
    assert.equal(hunt.packMin, 4);
    assert.equal(hunt.packMax, 6);
  });

  test(id + " publishes the exact map, all tiles, safe player spawn and connected monster zone", () => {
    const beta = fs.readFileSync(path.join(game, "beta-maps", hunt.otbm + ".otbm"));
    const bytes = fs.readFileSync(path.join(game, "maps", hunt.otbm + ".otbm"));
    assert.ok(bytes.equals(beta));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const map = OTBM.read(buffer, { z: hunt.otbmFloor });
    assert.equal(map.z, 7);
    const b = map.sourceBounds;
    assert.deepEqual(hunt.otbmFovBounds, { x: b.minX, y: b.minY, w: map.w, h: map.h, z: 7 });
    for (let z = 0; z <= 15; z++) {
      const floor = OTBM.read(buffer, { z });
      if (floor.z === z) assert.equal(z, 7);
    }
    for (const cell of Object.values(map.cells)) for (const tile of [cell.g, ...(cell.items || [])].filter(Boolean)) {
      assert.ok(fs.existsSync(path.join(game, "assets/tiles", tile + ".png")), "missing tile " + tile);
      const pattern = ctx.TILE_PATTERNS[tile];
      if (pattern) assert.ok(fs.existsSync(path.join(game, "assets/tiles", tile + "_pattern.png")));
    }
    map.idleTargetWidth = hunt.otbmRuntimeWidth;
    map.idleTargetHeight = hunt.otbmRuntimeHeight;
    map.idleOffsetY = hunt.otbmOffsetY || 0;
    map.idleFovWidth = hunt.otbmFovWidth;
    map.idleFovHeight = hunt.otbmFovHeight;
    applyHuntOtbmZones(map, hunt);
    const hm = OTBM.huntMapFromOtbm(map, ctx.TILEFLAGS);
    const walk = (x, y) => !!hm.rows[y] && !!hm.rows[y][x] && !hm.leg[hm.rows[y][x]].bloc && !hm.footprintBlocked[x + ":" + y];
    assert.ok(walk(hm.spawn.x, hm.spawn.y), "player spawn blocked");
    assert.equal(hm.spawn.x + 0.5, hm.rows[0].length / 2);
    assert.equal(hm.spawn.y + 0.5, hm.rows.length / 2);
    const reached = new Set([hm.spawn.x + ":" + hm.spawn.y]), queue = [hm.spawn];
    for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = queue[i].x + dx, y = queue[i].y + dy, key = x + ":" + y;
      if (walk(x, y) && !reached.has(key)) { reached.add(key); queue.push({ x, y }); }
    }
    const zone = Object.keys(hm.mobSet).filter((key) => {
      const [x, y] = key.split(":").map(Number);
      return walk(x, y);
    });
    assert.ok(zone.length >= 20);
    assert.ok(zone.every((key) => reached.has(key)), "isolated monster spawn");
    assert.ok(zone.filter((key) => key !== hm.spawn.x + ":" + hm.spawn.y).length >= hunt.packMax);
  });

  test(id + " authoritative respawns stay between four and six and use the complete pool", () => {
    const sizes = new Set(), seen = new Set();
    const auth = { kind: "hunt", huntId: id, ended: false, mobs: [], pendingSpawns: [],
      spawnPool: [], spawnIds: [], pack: 5, wave: 0, gridW: 30, gridH: 30,
      spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
      clock: Date.now(), rngState: 777, fiendishChance: 0, influencedChance: 0 };
    for (let i = 0; i < 100; i++) {
      auth.mobs = []; auth.pendingSpawns = [];
      engine.spawnHuntWave(auth, auth.clock);
      assert.ok(auth.pack >= 4 && auth.pack <= 6);
      sizes.add(auth.pack);
      for (const slug of auth.spawnPool) { assert.ok(hunt.monsters.includes(slug)); seen.add(slug); }
    }
    assert.deepEqual([...sizes].sort(), [4, 5, 6]);
    assert.deepEqual([...seen].sort(), [...hunt.monsters].sort());
  });
}

test("monster stats, loot, sheets and item prices agree with the authoritative catalog", () => {
  const unsellable = new Set(["moonlight-crystals", "rusted-armor"]);
  for (const slug of Object.values(defs.hunts).flatMap((hunt) => hunt.monsters)) {
    const monster = ctx.MONSTERDATA[slug];
    for (const field of ["hp", "exp", "damage", "armor", "speed", "mitigation", "targetDistance"])
      assert.equal(monster[field], canonical[slug][field], slug + "." + field);
    assert.equal(JSON.stringify(monster.loot), JSON.stringify(canonical[slug].loot));
    assert.ok(ctx.MOBSHEETS[slug]);
    assert.ok(fs.existsSync(path.join(game, "assets/mob", slug + ".png")));
    for (const drop of monster.loot) {
      const item = engine.ITEMS[drop.item];
      assert.ok(item, "missing item " + drop.item);
      assert.ok(fs.existsSync(path.join(game, "assets/item", drop.item + ".png")), "missing item sprite " + drop.item);
      assert.ok(Number(item.sell) > 0 || unsellable.has(drop.item), "unpriced loot " + drop.item);
    }
  }
  for (const [slug, item] of Object.entries(defs.items)) {
    assert.equal(engine.ITEMS[slug].sell, item.sell);
    assert.equal(engine.ITEMS[slug].npcSell, item.sell);
    const png = fs.readFileSync(path.join(game, "assets/item", slug + ".png"));
    assert.ok(png.readUInt32BE(16) <= 32 && png.readUInt32BE(20) <= 32, slug + " icon larger than 1x1");
  }
  for (const [slug, price] of Object.entries(defs.prices)) assert.equal(engine.ITEMS[slug].sell, price);
});

test("HUNTS modal renders both floors and their monster portraits", () => {
  const element = { innerHTML: "", querySelectorAll: () => [] };
  ctx.document = { querySelector: () => element, querySelectorAll: () => [] };
  ctx.maxStats = () => ({ hp: 1000 });
  ctx.playerDefense = () => ({ armor: 10, defense: 10, protection: 0 });
  ctx.mobImg = (slug) => `<img src="assets/mob/${slug}.png">`;
  vm.runInContext(fs.readFileSync(path.join(game, "js/ui.js"), "utf8"), ctx);
  ctx.renderHunts({ level: 1 });
  assert.ok(element.innerHTML.includes("Grimvale 1st Floor"));
  assert.ok(element.innerHTML.includes("Grimvale 2nd Floor"));
  for (const slug of Object.values(defs.hunts).flatMap((hunt) => hunt.monsters))
    assert.ok(element.innerHTML.includes("assets/mob/" + slug + ".png"));
});

test("requested first-floor coordinates are preserved", () => {
  const hunt = defs.hunts["grimvale-1st-floor"];
  assert.deepEqual(hunt.otbmSpawn, { x: 1024, y: 1028, z: 7 });
  assert.deepEqual(hunt.otbmMobBounds, { x: 1020, y: 1023, w: 11, h: 10, z: 7 });
});
