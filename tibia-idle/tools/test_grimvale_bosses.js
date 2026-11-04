"use strict";

const assert = require("node:assert/strict"), test = require("node:test");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, ".."), game = path.join(root, "game");
const defs = require("../game/js/grimvale-bosses"), OTBM = require("../game/js/otbm");
const engine = require("../server/authoritative_engine");
const canonical = require("../game/data/canarymonsters.json");
const complete = () => ({ missions: Object.fromEntries(Object.entries(defs.missions).map(([id, targets]) => [id, { progress: { ...targets } }])) });
const context = { console, GAMEDATA: { items: {}, hunts: {} }, BOSS_DEFS: {}, MISSION_DEFS: {},
  BOSS_COOLDOWN: 16 * 60 * 60 * 1000, BOSS_REQUIREMENTS_ENABLED: false, BOSS_COOLDOWNS_ENABLED: true, MEGA_TEST_BYPASS: false };
context.window = context;
vm.createContext(context);
for (const name of ["monsterdata", "mobsheetdata", "tileflags", "grimvale", "grimvale-bosses"])
  vm.runInContext(fs.readFileSync(path.join(game, "js", name + ".js"), "utf8"), context);

const gameSource = fs.readFileSync(path.join(game, "js/game.js"), "utf8");
const start = gameSource.indexOf("function bossState("), end = gameSource.indexOf("\nfunction openBossesCatalogModal(", start);
assert.ok(start >= 0 && end > start);
vm.runInContext(gameSource.slice(start, end), context);
context.isMissionComplete = (player, id) => Object.entries(defs.missions[id]).every(([slug, target]) => Number(player.missions && player.missions[id] && player.missions[id].progress[slug]) >= target);

test("boss category registers exactly the five named bosses with native Canary stats and independent 16h cooldowns", () => {
  assert.deepEqual(defs.ids, ["black-vixen", "bloodback", "darkfang", "shadowpelt", "sharpclaw"]);
  for (const id of defs.ids) {
    const boss = context.BOSS_DEFS[id], monster = canonical[id];
    assert.ok(boss);
    for (const field of ["hp", "exp", "damage", "armor", "defense"]) assert.equal(boss[field], monster[field], id + "." + field);
    assert.equal(boss.mult, 1);
    assert.equal(boss.cooldown, 16 * 60 * 60 * 1000);
    assert.equal(boss.requirement.enforced, true);
    assert.deepEqual(Array.from(boss.requirement.missions), Object.keys(defs.missions));
    const room = context.GAMEDATA.hunts[boss.hunt];
    assert.equal(room.otbm, "grimvaleboss");
    assert.deepEqual(Array.from(room.monsters), [id]);
    assert.deepEqual(engine.HUNTS[boss.hunt].monsters, [id]);
    assert.ok(context.MOBSHEETS[id]);
    assert.ok(fs.existsSync(path.join(game, "assets/mob", id + ".png")));
    assert.equal(JSON.stringify(boss.loot), JSON.stringify(monster.loot));
    for (const drop of boss.loot) {
      assert.ok(engine.ITEMS[drop.item], "missing loot " + drop.item);
      assert.ok(fs.existsSync(path.join(game, "assets/item", drop.item + ".png")), "missing sprite " + drop.item);
    }
  }
  assert.equal(engine.ITEMS["wolf-trophy"].sell, 3000);
  const trophy = fs.readFileSync(path.join(game, "assets/item/wolf-trophy.png"));
  assert.ok(trophy.readUInt32BE(16) <= 32 && trophy.readUInt32BE(20) <= 32);
});

test("access requires level 100 and both complete mission counters, not just claimed/done flags", () => {
  assert.ok(defs.accessError({}, 100));
  const first = complete(); delete first.missions["grimvale-2nd-floor"];
  assert.ok(defs.accessError(first, 100));
  const partial = complete(); partial.missions["grimvale-2nd-floor"].progress.werebear = 499;
  partial.missionsDone = { "grimvale-1st-floor": true, "grimvale-2nd-floor": true };
  assert.ok(defs.accessError(partial, 100));
  assert.ok(defs.accessError(complete(), 99));
  assert.ok(defs.accessError(complete(), undefined));
  assert.equal(defs.accessError(complete(), 100), null);
  assert.equal(defs.accessError({ missions: JSON.stringify(complete().missions) }, 100), null);
  assert.ok(defs.accessError({ missions: "malformed" }, 100));
});

test("client enforces both missions even with the general requirements flag disabled", () => {
  const boss = context.BOSS_DEFS[defs.ids[0]];
  assert.equal(context.bossReadyInfo({ level: 100, missions: {}, bosses: {} }, boss).ok, false);
  assert.equal(context.bossReadyInfo({ level: 99, ...complete(), bosses: {} }, boss).ok, false);
  const player = { level: 100, ...complete(), bosses: {} };
  assert.equal(context.bossReadyInfo(player, boss).ok, true);
  player.bosses[boss.id] = { lastFight: Date.now() };
  assert.equal(context.bossReadyInfo(player, boss).ok, false);
});

test("party validation uses each member's account and cannot be bypassed by omitting client mission options", async () => {
  const source = fs.readFileSync(path.join(root, "server/party.js"), "utf8");
  const start = source.indexOf("async function bossRequirementsOk("), end = source.indexOf("\n/* POST /api/party/zone", start);
  const c = { require, charPlayerData: (row) => JSON.parse(row.data) };
  vm.createContext(c); vm.runInContext(source.slice(start, end), c);
  const accounts = { 1: complete(), 2: {} };
  const chars = { 11: { id: 11, account_id: 1, level: 100, name: "Leader", data: "{}" },
    22: { id: 22, account_id: 2, level: 100, name: "Member", data: "{}" } };
  const db = { findCharacter: async (id) => chars[id], findAccountById: async (id) => accounts[id],
    partyMembers: async () => [{ id: 22 }] };
  const party = { id: 1, leader_id: 11, leader_name: "Leader" };
  let result = await c.bossRequirementsOk(db, party, { boss: "black-vixen", cooldownMs: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.failName.includes("Member"));
  accounts[2] = complete();
  assert.equal((await c.bossRequirementsOk(db, party, { boss: "black-vixen" })).ok, true);
  chars[22].account_id = 1;
  assert.equal((await c.bossRequirementsOk(db, party, { boss: "black-vixen" })).ok, true);
  const server = fs.readFileSync(path.join(root, "server/server.js"), "utf8");
  assert.ok(server.includes('error:"GRIMVALE_BOSS_REQUIREMENTS"'));
  assert.ok(server.includes("grimvaleBosses.accessError(ownerAcc,c.level)"));
});

test("shared map preserves all floors, tiles and three requested connected walkable coordinates", () => {
  const original = fs.readFileSync(path.join(game, "beta-maps/bossesroom/grimvalebosses.otbm"));
  const bytes = fs.readFileSync(path.join(game, "maps/grimvaleboss.otbm"));
  assert.ok(bytes.equals(original));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  for (let z = 0; z < 16; z++) { const floor = OTBM.read(buffer, { z }); if (floor.z === z) assert.equal(z, 7); }
  const map = OTBM.read(buffer, { z: 7 }), bounds = map.sourceBounds;
  assert.deepEqual(bounds, { minX: 1015, minY: 1016, maxX: 1036, maxY: 1037 });
  for (const cell of Object.values(map.cells)) for (const id of [cell.g, ...cell.items].filter(Boolean))
    assert.ok(fs.existsSync(path.join(game, "assets/tiles", id + ".png")), "missing tile " + id);
  map.idleTargetWidth = defs.room.otbmRuntimeWidth; map.idleTargetHeight = defs.room.otbmRuntimeHeight;
  map.idleOffsetX = defs.room.otbmOffsetX; map.idleOffsetY = defs.room.otbmOffsetY;
  const h = OTBM.huntMapFromOtbm(map, context.TILEFLAGS);
  const px = Math.floor((h.rows[0].length - map.w) / 2) + defs.room.otbmOffsetX;
  const py = Math.floor((h.rows.length - map.h) / 2) + defs.room.otbmOffsetY;
  const points = [[1025, 1026], [1026, 1021], [1023, 1028]].map(([x, y]) => ({ x: x - bounds.minX + px, y: y - bounds.minY + py }));
  const walk = (x, y) => !!h.rows[y] && !!h.rows[y][x] && !h.leg[h.rows[y][x]].bloc && !h.footprintBlocked[x + ":" + y];
  assert.ok(points.every((p) => walk(p.x, p.y)));
  assert.equal(points[0].x + 0.5, h.rows[0].length / 2);
  assert.equal(points[0].y + 0.5, h.rows.length / 2);
  const queue = [points[2]], seen = new Set([points[2].x + ":" + points[2].y]);
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = queue[i].x + dx, y = queue[i].y + dy, key = x + ":" + y;
    if (walk(x, y) && !seen.has(key)) { seen.add(key); queue.push({ x, y }); }
  }
  assert.ok(points.every((p) => seen.has(p.x + ":" + p.y)));
  assert.ok(Math.hypot(points[1].x - points[2].x, points[1].y - points[2].y) >= 7);
});

test("real boss combat places the player and delayed boss at the requested map cells", () => {
  const bytes = fs.readFileSync(path.join(game, "maps/grimvaleboss.otbm"));
  const map = OTBM.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { z: 7 });
  Object.assign(map, { idleTargetWidth: 25, idleTargetHeight: 23, idleOffsetX: 1, idleOffsetY: 1,
    idleFovWidth: 21, idleFovHeight: 17, spawn: { x: 8, y: 12 }, mob: [{ x: 11, y: 5 }] });
  const hm = OTBM.huntMapFromOtbm(map, context.TILEFLAGS);
  context.HUNTMAPS = { "otbm:grimvaleboss": hm };
  context.GAMEDATA.monsters = context.MONSTERDATA;
  context.huntMapBlocked = (h, x, y) => !h.rows[y] || !h.rows[y][x] || !!h.leg[h.rows[y][x]].bloc || !!h.footprintBlocked[x + ":" + y];
  for (const file of ["grid", "combat"]) vm.runInContext(fs.readFileSync(path.join(game, "js", file + ".js"), "utf8"), context);
  for (const id of defs.ids) {
    const boss = context.BOSS_DEFS[id];
    context.GAMEDATA.hunts[boss.hunt].mapa = "otbm:grimvaleboss";
    const combat = context.newBossCombat({ level: 100, voc: "knight", hp: 5000, mp: 500, config: {} }, boss);
    assert.equal(combat.player.cx, hm.spawn.x);
    assert.equal(combat.player.cy, hm.spawn.y);
    const pending = combat.arenaBossSpawn && combat.arenaBossSpawn.pending;
    assert.ok(pending);
    assert.equal(pending.cx, hm.mob[0].x);
    assert.equal(pending.cy, hm.mob[0].y);
    assert.equal(pending.maxHp, canonical[id].hp);
  }
});

test("bosses modal renders the new category, five portraits and both mission checklist entries", () => {
  const element = { innerHTML: "" };
  context.$ = () => element; context.$$ = () => [];
  context.bossMobImg = (id) => `<img src="assets/mob/${id}.png">`;
  context.renderBosses({ level: 100, missions: {}, bosses: {} });
  assert.ok(element.innerHTML.includes("Grimvale Bosses (100+)"));
  assert.ok(element.innerHTML.includes("Grimvale 1st Floor"));
  assert.ok(element.innerHTML.includes("Grimvale 2nd Floor"));
  for (const id of defs.ids) assert.ok(element.innerHTML.includes(`data-boss-info="${id}"`));
});
