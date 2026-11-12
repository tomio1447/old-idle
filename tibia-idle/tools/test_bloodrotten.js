"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "../game"), js = path.join(game, "js");
const B = require(path.join(js, "bloodrotten.js"));
const E = require("../server/authoritative_engine.js");
const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "tileflags.js", "mobsheetdata.js", "bloodrotten.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
const O = require(path.join(js, "otbm.js"));
const ROOM_MAPS = { vemiath: "vemiath_room", chagorz: "chagorz_room", murcion: "murcion_room", ichgahal: "ichgahal_room",
  bakragore: "bakragore_room" };
const OTBM = {};
for (const [bossId, name] of Object.entries(ROOM_MAPS)) {
  const bytes = fs.readFileSync(path.join(game, "maps/" + name + ".otbm"));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const raw = O.read(buffer, { z: 7 });
  OTBM[bossId] = { buffer, raw, map: O.huntMapFromOtbm(raw, ctx.TILEFLAGS) };
}
function walk(bossId, x, y) {
  const { raw, map } = OTBM[bossId];
  const cx = x - raw.sourceBounds.minX, cy = y - raw.sourceBounds.minY;
  const cell = map.leg[map.rows[cy]?.[cx]];
  return !!cell && !cell.bloc && !map.footprintBlocked?.[cx + ":" + cy];
}
function fixture(bossId = "vemiath") {
  return { bossId, kind: "boss", gridW: 31, gridH: 30, nextMobId: 1, events: [],
    mobs: [{ id: "boss", slug: bossId, boss: true, hp: 350000, cx: 15, cy: 8 }],
    players: [{ id: "1", cx: 15, cy: 19, p: { hp: 10000, mp: 1000, level: 600, voc: "knight", equipment: {}, config: {} } }] };
}
function hooks(c, log) {
  return { blocked: () => false,
    random: () => 0.5,
    spawn: (slug, cell) => { const m = { slug, id: "summon-" + c.nextMobId++, ...cell, hp: slug === "pillar-of-dark-energy" ? B.pillar.hp : 86000, def: {} }; c.mobs.push(m); return m; },
    warn: (m, cells, duration, now) => log.push({ type: "warn", id: m.id, cells, duration, now }),
    explode: (m, cells, damage, now) => log.push({ type: "explode", id: m.id, cells, damage, now }) };
}

test("Bloodrotten maps use the full playable floor, user positions and connected arena", () => {
  const expected = {
    vemiath: { minX: 1009, minY: 1015, maxX: 1039, maxY: 1041 },
    chagorz: { minX: 1010, minY: 1015, maxX: 1034, maxY: 1037 },
    murcion: { minX: 1011, minY: 1017, maxX: 1035, maxY: 1038 },
    ichgahal: { minX: 1010, minY: 1017, maxX: 1036, maxY: 1038 },
    bakragore: { minX: 1009, minY: 1016, maxX: 1031, maxY: 1039 },
  };
  for (const [bossId, sourceBounds] of Object.entries(expected)) {
    const room = B.rooms[bossId], { buffer, raw } = OTBM[bossId];
    const floors = [];
    for (let z = 0; z < 16; z++) if (O.read(buffer, { z }).z === z) floors.push(z);
    assert.deepEqual(floors, [7], bossId);
    assert.deepEqual(raw.sourceBounds, sourceBounds, bossId);
    for (const point of [room.center, room.boss, room.player]) assert.ok(walk(bossId, point.x, point.y), bossId + " " + JSON.stringify(point));
    const b = room.area, seen = new Set([room.player.x + ":" + room.player.y]), queue = [room.player];
    for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = queue[i].x + dx, y = queue[i].y + dy, key = x + ":" + y;
      if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h && walk(bossId, x, y) && !seen.has(key)) {
        seen.add(key); queue.push({ x, y });
      }
    }
    assert.ok(seen.has(room.boss.x + ":" + room.boss.y), bossId);
    assert.ok(seen.has(room.center.x + ":" + room.center.y), bossId);
    assert.ok(queue.length >= 80, bossId + " walkable=" + queue.length);
    const mid = { x: b.x + (b.w - 1) / 2, y: b.y + (b.h - 1) / 2 };
    const distance = (p) => (p.x - mid.x) ** 2 + (p.y - mid.y) ** 2;
    assert.equal(distance(room.center), Math.min(...queue.map(distance)), bossId);
    for (const point of [room.boss, room.player]) assert.ok(Math.abs(point.y - room.center.y) <= 8, bossId);
    const tileIds = new Set();
    for (const cell of Object.values(raw.cells)) for (const id of [cell.g, ...(cell.items || [])]) if (id) tileIds.add(id);
    for (const id of tileIds) assert.ok(fs.existsSync(path.join(game, "assets/tiles/" + id + ".png")), bossId + " tile ausente: " + id);
  }
});

test("bosses, all loot prices and native sprite layouts are registered on client and server", () => {
  assert.equal(ctx.BOSS_DEFS.vemiath.requirement.level, 600);
  assert.equal(ctx.BOSS_DEFS.vemiath.hunt, "vemiath-room");
  assert.equal(ctx.GAMEDATA.hunts["vemiath-room"].otbm, "vemiath_room");
  assert.equal(ctx.BOSS_DEFS.chagorz.requirement.level, 600);
  assert.equal(ctx.BOSS_DEFS.chagorz.hunt, "chagorz-room");
  assert.equal(ctx.GAMEDATA.hunts["chagorz-room"].otbm, "chagorz_room");
  assert.equal(ctx.BOSS_DEFS.murcion.requirement.level, 600);
  assert.equal(ctx.BOSS_DEFS.murcion.hunt, "murcion-room");
  assert.equal(ctx.GAMEDATA.hunts["murcion-room"].otbm, "murcion_room");
  assert.equal(ctx.BOSS_DEFS.ichgahal.requirement.level, 600);
  assert.equal(ctx.BOSS_DEFS.ichgahal.hunt, "ichgahal-room");
  assert.equal(ctx.GAMEDATA.hunts["ichgahal-room"].otbm, "ichgahal_room");
  for (const bossId of ["vemiath", "chagorz", "murcion", "ichgahal"]) {
    assert.equal(E.MONSTERS[bossId].hp, 350000, bossId);
    assert.equal(E.MONSTERS[bossId].exp, 3250000, bossId);
    assert.equal(ctx.GAMEDATA.monsters[bossId].hp, 350000, bossId);
  }
  assert.equal(E.MONSTERS.vemiath.looktype, 1668);
  assert.equal(E.MONSTERS.chagorz.looktype, 1666);
  assert.equal(E.MONSTERS.murcion.looktype, 1664);
  assert.equal(E.MONSTERS.ichgahal.looktype, 1665);
  /* Bakragore — world boss Rotten Blood: stats nativas diferentes dos
   * filhos (660k hp / 15M exp / looktype 1671). */
  assert.equal(E.MONSTERS.bakragore.hp, 660000);
  assert.equal(E.MONSTERS.bakragore.exp, 15000000);
  assert.equal(E.MONSTERS.bakragore.looktype, 1671);
  assert.equal(ctx.GAMEDATA.monsters.bakragore.hp, 660000);
  assert.equal(E.MONSTERS["elder-bloodjaw"].hp, 86000);
  assert.equal(E.MONSTERS["echo-of-chagorz"].hp, 90000);
  assert.equal(E.MONSTERS["echo-of-murcion"].hp, 90000);
  assert.equal(E.MONSTERS["echo-of-ichgahal"].hp, 90000);
  assert.equal(E.MONSTERS["pillar-of-dark-energy"].hp, 37500);
  assert.equal(B.explosion.interval, 9000);
  for (const bossId of ["vemiath", "chagorz", "murcion", "ichgahal"]) for (const { item } of E.MONSTERS[bossId].loot) {
    assert.ok(ctx.GAMEDATA.items[item], item);
    assert.equal(ctx.GAMEDATA.items[item].npcSell, B.prices[item], item);
    assert.equal(E.ITEMS[item].npcSell, B.prices[item], item);
    const png = fs.readFileSync(path.join(game, "assets/item/" + item + ".png"));
    assert.ok(png.readUInt32BE(16) <= 32 && png.readUInt32BE(20) <= 32, item);
  }
  /* Loot do Bakragore: todo item registrado no cliente com ícone; os que
   * têm preço Bloodrotten usam B.prices; os demais mantêm o valor da
   * tabela base do jogo (poções/gems tabeladas em gamedata). */
  for (const { item } of E.MONSTERS.bakragore.loot) {
    assert.ok(ctx.GAMEDATA.items[item], item);
    if (item in B.prices) assert.equal(ctx.GAMEDATA.items[item].npcSell, B.prices[item], item);
    const png = fs.readFileSync(path.join(game, "assets/item/" + item + ".png"));
    assert.ok(png.readUInt32BE(16) <= 32 && png.readUInt32BE(20) <= 32, item);
  }
  assert.equal(E.ITEMS["vemiath-s-infused-basalt"].cid, 43967);
  assert.equal(E.ITEMS["vemiath-s-infused-basalt"].npcSell, 1000000);
  assert.equal(E.ITEMS["giant-sapphire"].cid, 30061);
  assert.equal(E.ITEMS["giant-sapphire"].npcSell, 50000);
  assert.equal(E.ITEMS["white-gem"].cid, 32769);
  assert.equal(E.ITEMS["white-gem"].npcSell, 12000);
  assert.equal(E.ITEMS["amber-with-a-bug"].cid, 32624);
  assert.equal(E.ITEMS["amber-with-a-bug"].npcSell, 41000);
  assert.equal(E.ITEMS["amber-with-a-dragonfly"].cid, 32625);
  assert.equal(E.ITEMS["amber-with-a-dragonfly"].npcSell, 56000);
  assert.equal(E.ITEMS["putrefactive-figurine"].cid, 43962);
  assert.equal(E.ITEMS["putrefactive-figurine"].npcSell, 3200000);
  assert.equal(E.ITEMS["ichgahal-s-fungal-infestation"].cid, 43964);
  assert.equal(E.ITEMS["ichgahal-s-fungal-infestation"].npcSell, 900000);
  assert.equal(E.ITEMS["giant-ruby"].cid, 30059);
  assert.equal(E.ITEMS["giant-ruby"].npcSell, 70000);
  assert.equal(E.ITEMS["figurine-of-bakragore"].cid, 43963);
  assert.equal(E.ITEMS["figurine-of-bakragore"].npcSell, 5400000);
  assert.equal(E.ITEMS["bakragore-s-amalgamation"].cid, 43968);
  assert.equal(E.ITEMS["bakragore-s-amalgamation"].npcSell, 2000000);
  /* Spiritual Horseshoe: sem comprador NPC oficial — npcSell 0, não inventa preço. */
  assert.equal(E.ITEMS["spiritual-horseshoe"].cid, 44048);
  assert.equal(E.ITEMS["spiritual-horseshoe"].npcSell, 0);
  for (const slug of ["vemiath", "chagorz", "murcion", "ichgahal", "bakragore", "elder-bloodjaw",
    "echo-of-chagorz", "echo-of-murcion", "echo-of-ichgahal", "pillar-of-dark-energy"]) {
    const png = fs.readFileSync(path.join(game, "assets/mob/" + slug + ".png")), meta = ctx.MOBSHEETS[slug];
    assert.ok(meta, slug);
    assert.equal(png.readUInt32BE(16), meta.cw * meta.cols, slug);
    assert.equal(png.readUInt32BE(20), meta.ch * meta.rows, slug);
  }
  assert.equal(ctx.MOBSHEETS["pillar-of-dark-energy"].cols, 1);
  assert.equal(ctx.MOBSHEETS["pillar-of-dark-energy"].rows, 1);
});

test("all five Bloodrotten bosses have exactly one 10 percent Bag You Covet drop", () => {
  for (const slug of B.bosses) for (const monsters of [ctx.GAMEDATA.monsters, E.MONSTERS]) {
    const drops = monsters[slug].loot.filter((entry) => entry.item === "bag-you-covet");
    assert.equal(drops.length, 1); assert.equal(drops[0].chance, 10); assert.equal(drops[0].max, 1);
  }
  assert.equal(E.ITEMS["bag-you-covet"].cid, 43895);
  assert.equal(E.ITEMS["bag-you-covet"].npcSell, 0);
  B.registerBagLoot(E.MONSTERS);
  assert.equal(E.MONSTERS.vemiath.loot.filter((d) => d.item === "bag-you-covet").length, 1);
});

test("Bloodrotten cameras are zoomed to 21x15 without shrinking the walkable runtime", async () => {
  const expected = { "vemiath-room": [31, 30], "chagorz-room": [25, 23], "murcion-room": [25, 22], "ichgahal-room": [27, 22],
    "bakragore-room": [24, 24] };
  for (const [huntId, [w, h]] of Object.entries(expected)) {
    const local = { console, setTimeout, clearTimeout, OTBM: O, HUNTMAPS: {}, TILEFLAGS: ctx.TILEFLAGS,
      fetch: async (url) => ({ ok: true,
        arrayBuffer: async () => OTBM[huntId.replace(/-room$/, "")].buffer }), addEventListener() {} };
    local.window = local; vm.createContext(local);
    vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), local);
    const hunt = JSON.parse(JSON.stringify(ctx.GAMEDATA.hunts[huntId]));
    await new Promise((resolve) => local.huntMapFromOtbmAsync(hunt, resolve));
    const loaded = local.HUNTMAPS[hunt.mapa];
    assert.ok(loaded, huntId);
    assert.equal(loaded.fovWidth, 21, huntId); assert.equal(loaded.fovHeight, 15, huntId);
    assert.equal(loaded.noFovBound, true, huntId);
    assert.equal(loaded.rows.length, h, huntId); assert.equal(loaded.rows[0].length, w, huntId);
  }
});

test("the native boss catalog displays Bloodrotten and gates Vemiath at level 600", () => {
  const source = fs.readFileSync(path.join(js, "game.js"), "utf8"), list = { innerHTML: "" };
  const start = source.indexOf("const BOSS_MODAL_SECTIONS = [");
  vm.runInContext(source.slice(start, source.indexOf("\n];", start) + 3), ctx);
  ctx.$ = () => list; ctx.$$ = () => [];
  ctx.mobImg = (slug) => '<img src="assets/mob/' + slug + '.png">';
  ctx.bossReadyInfo = (p, b) => ({ ok: !B.accessError(b.id, p.level) });
  ctx.bossAccessChecklist = () => [];
  vm.runInContext(source.slice(source.indexOf("function renderBosses("), source.indexOf("function openBossesCatalogModal(")), ctx);
  for (const level of [599, 600]) {
    ctx.renderBosses({ level });
    const section = list.innerHTML.split("<section").find((part) => part.includes("BLOODROTTEN 600+"));
    assert.ok(section?.includes('data-boss-info="vemiath"'));
    assert.ok(section?.includes('data-boss-info="chagorz"'));
    assert.ok(section?.includes('data-boss-info="murcion"'));
    assert.ok(section?.includes('data-boss-info="ichgahal"'));
    assert.equal(section.includes("boss-section-locked"), level < 600);
    assert.equal(section.includes("Disponível"), level >= 600);
  }
});

test("the encounter caps summons at four per type and respawns a dead slot only after 15s", () => {
  for (const [bossId, summon] of [["vemiath", "elder-bloodjaw"], ["chagorz", "echo-of-chagorz"],
    ["murcion", "echo-of-murcion"], ["ichgahal", "echo-of-ichgahal"]]) {
    const c = fixture(bossId), log = [], h = hooks(c, log);
    B.tick(c, 0, h); B.tick(c, 100, h);
    assert.equal(c.mobs.filter((m) => m.slug === summon).length, 4, bossId);
    assert.equal(c.mobs.filter((m) => m.slug === "pillar-of-dark-energy").length, 4, bossId);
    assert.equal(new Set(c.mobs.map((m) => m.cx + ":" + m.cy)).size, 9, bossId);
    const lost = c.bloodrotten.slots[0].id;
    c.mobs = c.mobs.filter((m) => m.id !== lost);
    B.tick(c, 1000, h); B.tick(c, 15999, h);
    assert.equal(c.mobs.filter((m) => m.slug === summon).length, 3, bossId);
    B.tick(c, 16000, h);
    assert.equal(c.mobs.filter((m) => m.slug === summon).length, 4, bossId);
    const lostPillar = c.bloodrotten.slots[4].id;
    c.mobs = c.mobs.filter((m) => m.id !== lostPillar);
    B.tick(c, 17000, h); B.tick(c, 31999, h);
    assert.equal(c.mobs.filter((m) => m.slug === "pillar-of-dark-energy").length, 3, bossId);
    B.tick(c, 32000, h);
    assert.equal(c.mobs.filter((m) => m.slug === "pillar-of-dark-energy").length, 4, bossId);
    for (const m of c.mobs.filter((m) => m.bloodrottenSummon)) {
      assert.equal(m.def.exp, 0); assert.deepEqual(m.def.loot, []);
      assert.ok(m.cx >= c.bloodrotten.bounds.x && m.cx < c.bloodrotten.bounds.x + c.bloodrotten.bounds.w);
    }
  }
});

test("pillars warn for two seconds, persist schedules on reconnect, and stop on death", () => {
  let c = fixture(); const log = [];
  B.tick(c, 0, hooks(c, log)); B.tick(c, 7000, hooks(c, log));
  assert.equal(log.filter((e) => e.type === "warn").length, 4);
  assert.equal(log.filter((e) => e.type === "explode").length, 0);
  c = JSON.parse(JSON.stringify(c));
  const killed = c.bloodrotten.slots[4].id;
  c.mobs = c.mobs.filter((m) => m.id !== killed);
  B.tick(c, 8000, hooks(c, log)); B.tick(c, 8999, hooks(c, log));
  assert.equal(log.filter((e) => e.type === "explode").length, 0);
  B.tick(c, 9000, hooks(c, log));
  const blasts = log.filter((e) => e.type === "explode");
  assert.equal(blasts.length, 3);
  assert.ok(blasts.every((e) => e.damage === 1240 && e.id !== killed));
  c.mobs.find((m) => m.boss).hp = 0;
  B.tick(c, 10000, hooks(c, log)); B.tick(c, 30000, hooks(c, log));
  assert.equal(c.bloodrotten, null);
  assert.equal(c.mobs.filter((m) => m.bloodrottenSummon).length, 0);
  assert.equal(log.filter((e) => e.type === "explode").length, 3);
});

test("summons wait for the boss spawn and are cleaned on a wipe", () => {
  const c = fixture(), boss = c.mobs[0], log = [], h = hooks(c, log);
  c.mobs = []; B.tick(c, 0, h);
  assert.equal(c.bloodrotten, undefined);
  c.mobs = [boss]; B.tick(c, 5000, h);
  assert.equal(c.mobs.length, 9);
  c.dead = true; B.tick(c, 6000, h);
  assert.equal(c.mobs.length, 1);
  assert.equal(c.bloodrotten, null);
});

test("all Bloodrotten bosses enforce level 600 and the API rejects a forged client level", async () => {
  for (const slug of B.bosses) {
    assert.ok(B.accessError(slug, 599)); assert.equal(B.accessError(slug, 600), null);
  }
  assert.equal(B.accessError("magma-bubble", 400), null);
  const serverPath = path.join(__dirname, "../server/server.js"), source = fs.readFileSync(serverPath, "utf8");
  const sandbox = vm.createContext({ global: {}, isWorldBossBossId: () => false,
    require: require("module").createRequire(serverPath) });
  vm.runInContext(source.slice(source.indexOf("async function prepareInstanceState("), source.indexOf("async function prepareInstanceState(") + source.slice(source.indexOf("async function prepareInstanceState(")).indexOf("    let canonical={};")) + "}}", sandbox);
  const row = { id: 1, account_id: 9, name: "Test", level: 599 };
  const db = { instanceGet: async () => null, findCharacter: async () => row,
    partyFindByCharacter: async () => null, findAccountById: async () => ({ id: 9 }) };
  const r = await sandbox.prepareInstanceState(db, { id: 9 }, { kind: "boss", bossId: "vemiath", huntId: "vemiath-room",
    instanceMode: "boss", activeCharacterId: 1, members: [{ id: "1", p: { id: "1", name: "Test", level: 9999 } }] });
  assert.equal(r.error.code, 403); assert.equal(r.error.body.error, "BLOODROTTEN_LEVEL_REQUIRED");
  for (const huntId of ["vemiath-room", "chagorz-room", "murcion-room", "ichgahal-room", "bakragore-room"]) {
    const invalid = await sandbox.prepareInstanceState(db, { id: 9 }, { kind: "hunt", huntId });
    assert.equal(invalid.error.body.error, "INVALID_BLOODROTTEN_INSTANCE", huntId);
  }
  /* Bakragore: instância boss direta (fora do roster do world boss) é
   * rejeitada — entrada exclusiva pelo lobby compartilhado. */
  const direct = await sandbox.prepareInstanceState(db, { id: 9 }, { kind: "boss", bossId: "bakragore",
    huntId: "bakragore-room", instanceMode: "boss", activeCharacterId: 1,
    members: [{ id: "1", p: { id: "1", name: "Test", level: 9999 } }] });
  assert.equal(direct.error.code, 403);
  assert.equal(direct.error.body.error, "WORLD_BOSS_LOBBY_REQUIRED");
  for (const bossId of ["chagorz", "murcion", "ichgahal"]) {
    const forged = await sandbox.prepareInstanceState(db, { id: 9 }, { kind: "boss", bossId, huntId: bossId + "-room",
      instanceMode: "boss", activeCharacterId: 1, members: [{ id: "1", p: { id: "1", name: "Test", level: 9999 } }] });
    assert.equal(forged.error.code, 403, bossId); assert.equal(forged.error.body.error, "BLOODROTTEN_LEVEL_REQUIRED", bossId);
  }
});

test("authority uses native Vemiath stats and keeps summons through the real checkpoint pipeline", () => {
  const c = fixture(), p = { ...c.players[0].p, id: "1", accountId: 9, vipUntil: Date.now() + 1000000,
    stamina: 151200, bosses: {}, kills: {}, skills: {}, config: { autoWalk: false } };
  const descriptor = { kind: "boss", bossId: "vemiath", huntId: "vemiath-room", instanceMode: "boss",
    activeCharacterId: "1", members: [{ id: "1", accountId: 9, p }],
    state: { gridW: 31, gridH: 30, players: [{ ...c.players[0], p }], mobs: [
      { id: "fake", slug: "rat", boss: true, hp: 1 }, { ...c.mobs[0], boss: false, hp: 1,
        def: { hp: 1, exp: 999999, loot: [{ item: "gold-coin", chance: 100, max: 100000 }] } }] } };
  const initialized = E.initializeAuthority(descriptor, "vemiath-test", 100000);
  const pending = initialized.authority.arenaBossSpawn.pending;
  assert.equal(pending.maxHp, 350000); assert.equal(pending.hp, 350000);
  assert.equal(pending.def.exp, 3250000);
  const advanced = E.advanceAuthorityState(JSON.stringify(initialized), 6000, 106000);
  const saved = JSON.parse(advanced.state);
  assert.equal(saved.authority.bloodrotten.slots.length, 8);
  assert.equal(saved.authority.mobs.filter((m) => m.bloodrottenSummon).length, 8);
  const positions = saved.authority.mobs.filter((m) => m.noMove).map((m) => [m.id, m.cx, m.cy]);
  const resumed = JSON.parse(E.advanceAuthorityState(advanced.state, 1000, 107000).state);
  assert.deepEqual(resumed.authority.mobs.filter((m) => m.noMove).map((m) => [m.id, m.cx, m.cy]), positions);
  resumed.authority.mobs.find((m) => m.boss).hp = 0;
  const victory = JSON.parse(E.advanceAuthorityState(JSON.stringify(resumed), 1000, 108000).state).authority;
  assert.equal(victory.bossDefeated, true); assert.equal(victory.terminalReason, "boss-defeated");
  assert.equal(victory.players[0].p.bosses.vemiath.kills, 1);
  assert.equal(victory.mobs.filter((m) => m.bloodrottenSummon).length, 0);
  assert.equal(victory.bloodrotten, null);
});

test("authority Chagorz, Murcion and Ichgahal keep native stats and spawn their Echoes", () => {
  for (const bossId of ["chagorz", "murcion", "ichgahal"]) {
    const summon = B.rooms[bossId].summon, room = B.rooms[bossId];
    const c = fixture(bossId), p = { ...c.players[0].p, id: "1", accountId: 9, vipUntil: Date.now() + 1000000,
      stamina: 151200, bosses: {}, kills: {}, skills: {}, config: { autoWalk: false } };
    const descriptor = { kind: "boss", bossId, huntId: bossId + "-room", instanceMode: "boss",
      activeCharacterId: "1", members: [{ id: "1", accountId: 9, p }],
      state: { gridW: room.bounds.w, gridH: room.bounds.h, players: [{ ...c.players[0], p }], mobs: [c.mobs[0]] } };
    const initialized = E.initializeAuthority(descriptor, bossId + "-test", 100000);
    const pending = initialized.authority.arenaBossSpawn.pending;
    assert.equal(pending.maxHp, 350000, bossId); assert.equal(pending.def.exp, 3250000, bossId);
    const saved = JSON.parse(E.advanceAuthorityState(JSON.stringify(initialized), 6000, 106000).state);
    assert.equal(saved.authority.bloodrotten.slots.length, 8, bossId);
    assert.equal(saved.authority.mobs.filter((m) => m.slug === summon).length, 4, bossId);
    assert.equal(saved.authority.mobs.filter((m) => m.slug === "pillar-of-dark-energy").length, 4, bossId);
    assert.equal(saved.authority.mobs.filter((m) => m.slug === "elder-bloodjaw").length, 0, bossId);
    saved.authority.mobs.find((m) => m.boss).hp = 0;
    const victory = JSON.parse(E.advanceAuthorityState(JSON.stringify(saved), 1000, 107000).state).authority;
    assert.equal(victory.bossDefeated, true, bossId);
    assert.equal(victory.players[0].p.bosses[bossId].kills, 1, bossId);
    assert.equal(victory.mobs.filter((m) => m.bloodrottenSummon).length, 0, bossId);
    assert.equal(victory.bloodrotten, null, bossId);
  }
});

test("authoritative pillars deal Energy damage only to players in the warned area", () => {
  assert.equal(typeof E.bloodrottenTick, "function");
  const c = fixture(); c.clock = 0; c.rng = 42; c.stats = {};
  E.bloodrottenTick(c, 0);
  const pillar = c.mobs.find((m) => m.slug === "pillar-of-dark-energy");
  assert.ok(pillar.noMove);
  c.players[0].cx = pillar.cx + 1; c.players[0].cy = pillar.cy;
  c.players[0].x = (c.players[0].cx + 0.5) / c.gridW; c.players[0].y = (c.players[0].cy + 0.5) / c.gridH;
  E.bloodrottenTick(c, 7000); E.bloodrottenTick(c, 9000);
  assert.ok(c.players[0].p.hp < 10000 && c.players[0].p.hp >= 8620);
  assert.ok(c.events.some((e) => e.t === "taken" && e.el === "energy"));
  assert.ok(c.events.some((e) => e.t === "areafx" && e.duration === 2000));
});

test("Bakragore's Burden adds Elder Bloodjaws and scales boss HP (base is two)", () => {
  for (const [taints, want, hpMul] of [[0, 2, 1], [3, 5, 1.15], [7, 8, 1.35]]) {
    const c = fixture("bakragore"), h = hooks(c, []);
    c.mobs[0].hp = 660000; c.mobs[0].maxHp = 660000;
    c.bakragoreBurden = taints;
    B.tick(c, 0, h); B.tick(c, 100, h);
    assert.equal(c.mobs.filter((m) => m.slug === "elder-bloodjaw").length, want, "taints=" + taints);
    assert.equal(c.mobs.filter((m) => m.slug === "pillar-of-dark-energy").length, 0, "taints=" + taints);
    assert.equal(c.mobs[0].maxHp, Math.floor(660000 * hpMul), "taints=" + taints);
    assert.equal(c.bloodrotten.taints, taints);
    for (const m of c.mobs.filter((m) => m.bloodrottenSummon)) {
      assert.equal(m.def.exp, 0); assert.deepEqual(m.def.loot, []);
    }
  }
});

test("authority Bakragore carries the burden into the arena and serializes it", () => {
  const c = fixture("bakragore"), p = { ...c.players[0].p, id: "1", accountId: 9, vipUntil: Date.now() + 1000000,
    stamina: 151200, bosses: {}, kills: {}, skills: {}, config: { autoWalk: false } };
  const descriptor = { kind: "boss", bossId: "bakragore", huntId: "bakragore-room", instanceMode: "boss", worldBoss: true,
    activeCharacterId: "1", members: [{ id: "1", accountId: 9, p }],
    state: { gridW: 24, gridH: 24, worldBoss: true, bakragoreBurden: 3,
      players: [{ ...c.players[0], p, cx: 11, cy: 15 }],
      mobs: [{ slug: "bakragore", boss: true, id: "boss-bakragore", hp: 660000, maxHp: 660000,
        cx: 11, cy: 5, x: 11.5 / 24, y: 5.5 / 24 }],
      arenaBossSpawn: { at: 105000, spawned: false } } };
  const initialized = E.initializeAuthority(descriptor, "bakragore-test", 100000);
  const pending = initialized.authority.arenaBossSpawn.pending;
  assert.equal(pending.slug, "bakragore");
  assert.equal(pending.maxHp, 660000);
  const saved = JSON.parse(E.advanceAuthorityState(JSON.stringify(initialized), 6000, 106000).state);
  const boss = saved.authority.mobs.find((m) => m.boss);
  assert.equal(boss.slug, "bakragore");
  assert.equal(boss.maxHp, Math.floor(660000 * 1.15));
  assert.equal(saved.authority.mobs.filter((m) => m.slug === "elder-bloodjaw").length, 5);
  assert.equal(saved.authority.mobs.filter((m) => m.slug === "pillar-of-dark-energy").length, 0);
  assert.equal(saved.authority.bakragoreBurden, 3);
  assert.equal(saved.state.bakragoreBurden, 3);
  saved.authority.mobs.find((m) => m.boss).hp = 0;
  const victory = JSON.parse(E.advanceAuthorityState(JSON.stringify(saved), 1000, 107000).state).authority;
  assert.equal(victory.bossDefeated, true);
  assert.equal(victory.terminalReason, "boss-defeated");
  assert.equal(victory.players[0].p.bosses.bakragore.kills, 1);
  assert.equal(victory.mobs.filter((m) => m.bloodrottenSummon).length, 0);
  assert.equal(victory.bloodrotten, null);
});

test("Bakragore world boss lobby validates taints, seats five and rewards once per character", async () => {
  process.env.WB_COUNTDOWN_MS = "1";
  const WB = require("../server/world_boss.js");
  const wz = WB.WARZONES.find((w) => w.id === "bakragore");
  assert.ok(wz);
  assert.equal(wz.maxChars, 5);
  assert.equal(wz.minLevel, 600);
  assert.equal(wz.burden, true);
  assert.equal(wz.gridW, 24); assert.equal(wz.gridH, 24);
  assert.deepEqual(wz.playerSpawn, { x: 11, y: 15 });
  assert.deepEqual(wz.bossSpawn, { x: 11, y: 5 });
  assert.equal(wz.otbm, "bakragore_room");
  assert.equal(wz.otbmFloor, 7);
  assert.equal(WB.bossIdForWarzone("bakragore"), "bakragore");
  assert.equal(WB.warzoneIdFromBossId("bakragore"), "bakragore");
  assert.ok(WB.isWorldBossBossId("bakragore"));
  assert.deepEqual(WB.BAKRAGORE_TAINT_BOSSES, ["murcion", "vemiath", "chagorz", "ichgahal"]);

  const accounts = new Map(), chars = new Map(), savedChars = new Map();
  const mkAccount = (id) => { const a = { id, token: "token-" + id }; accounts.set(id, a); return a; };
  const mkChar = (id, accountId, level, kills, extra) => {
    const data = Object.assign({ id, name: "Char" + id, level, voc: "knight", bosses: {}, quests: {} }, extra || {});
    data.bosses = Object.assign({}, (extra && extra.bosses) || {});
    for (const slug of kills || []) data.bosses[slug] = { kills: 1, lastFight: 1 };
    const row = { id, account_id: accountId, name: data.name, level, voc: "knight", data: JSON.stringify(data) };
    chars.set(id, row); return row;
  };
  const db = {
    findAccountByToken: async (token) => [...accounts.values()].find((a) => a.token === token) || null,
    findAccountById: async (id) => accounts.get(Number(id)) || null,
    findCharacter: async (id) => chars.get(Number(id)) || null,
    findCharacterByName: async (name) => [...chars.values()].find((c) => c.name === name) || null,
    updateCharacter: async (id, voc, level, p) => { savedChars.set(Number(id), p); return { ok: true }; },
    accountSharedInventory: async () => null,
    setAccountSharedInventory: async () => ({}),
  };
  let shared = null;
  const ctrl = WB.createWorldBossController({ testServer: true, getDb: () => db,
    createSharedInstance: async (event) => { shared = { id: event.id, burdenTotal: event.burdenTotal, joins: event.joins.size };
      return { ok: true, instanceId: "shared-bak", ownerAccountId: event.hostAccountId }; },
    endSharedInstance: async () => ({ ok: true }) });

  mkAccount(1); mkChar(11, 1, 599, ["murcion", "vemiath"]);
  let r = await ctrl.createLobby(db, { token: "token-1", warzoneId: "bakragore", characterIds: [11] });
  assert.equal(r.body.error, "LEVEL_REQUIRED");
  const row11 = chars.get(11); row11.level = 600;
  const d11 = JSON.parse(row11.data); d11.level = 600; row11.data = JSON.stringify(d11);
  r = await ctrl.createLobby(db, { token: "token-1", warzoneId: "bakragore", characterIds: [11] });
  assert.equal(r.code, 200);
  assert.ok(r.body.event.burden && r.body.event.burden.enabled);

  r = await ctrl.setBurden(db, { token: "token-1", taints: ["murcion", "chagorz"] });
  assert.equal(r.body.error, "TAINT_NOT_EARNED");
  r = await ctrl.setBurden(db, { token: "token-1", taints: ["murcion", "vemiath"] });
  assert.equal(r.code, 200);
  assert.equal(r.body.event.burden.total, 2);
  assert.equal(r.body.you.earnedTaints.length, 2);

  mkAccount(2);
  mkChar(12, 2, 600, ["ichgahal"], { quests: { "bloodrotten-quest": { completed: true, rewardClaimed: true } } });
  r = await ctrl.join(db, { token: "token-2", characterIds: [12] });
  assert.equal(r.code, 200);
  r = await ctrl.setBurden(db, { token: "token-2", taints: ["ichgahal"] });
  assert.equal(r.code, 200);
  assert.equal(r.body.event.burden.total, 3);

  for (const [acc, cid] of [[3, 13], [4, 14], [5, 15]]) {
    mkAccount(acc); mkChar(cid, acc, 600);
    const j = await ctrl.join(db, { token: "token-" + acc, characterIds: [cid] });
    assert.equal(j.code, 200, "acc" + acc);
  }
  mkAccount(6); mkChar(16, 6, 600);
  r = await ctrl.join(db, { token: "token-6", characterIds: [16] });
  assert.equal(r.body.error, "LOBBY_FULL");

  r = await ctrl.startFight(db, { token: "token-1" });
  assert.equal(r.code, 200);
  await new Promise((resolve) => setTimeout(resolve, 30));
  ctrl.tick(db);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(shared, "shared instance not created");
  assert.equal(shared.burdenTotal, 3);
  assert.equal(shared.joins, 5);

  await ctrl.onSharedEnded("boss-defeated");
  const p11 = savedChars.get(11), p12 = savedChars.get(12);
  assert.ok(p11 && p12);
  assert.equal(p11.bosses.bakragore.kills, 1);
  assert.equal(p11.bloodrotten.finalTaint, true);
  assert.equal(p11.quests["bloodrotten-quest"].completed, true);
  assert.equal(p11.rewardChest["figurine-of-bakragore"], 1);
  assert.equal(p11.rewardChest["bag-you-covet"], 1);
  assert.equal(p12.bosses.bakragore.kills, 1);
  assert.equal(p12.bloodrotten.finalTaint, true);
  assert.equal(p12.rewardChest && p12.rewardChest["figurine-of-bakragore"], undefined);
  assert.equal(p12.rewardChest && p12.rewardChest["bag-you-covet"], undefined);
  for (const cid of [13, 14, 15]) {
    const p = savedChars.get(cid); assert.ok(p, "char " + cid);
    assert.equal(p.bosses.bakragore.kills, 1);
    assert.equal(p.quests["bloodrotten-quest"].completed, true);
    assert.equal(p.rewardChest["figurine-of-bakragore"], 1);
  }
  await ctrl.onSharedEnded("boss-defeated");
});

test("Bloodrotten quest is listed in Bosses Quests and Bakragore is a playable world boss", () => {
  const questSource = fs.readFileSync(path.join(js, "questdata.js"), "utf8");
  const modalSource = fs.readFileSync(path.join(js, "world-bosses-modal.js"), "utf8");
  const gameSource = fs.readFileSync(path.join(js, "game.js"), "utf8");
  assert.ok(/"bloodrotten-quest":\s*\{[^}]*questType:\s*"boss"/s.test(questSource));
  assert.ok(/"bloodrotten-quest":\s*\{[^}]*boss:\s*"bakragore"/s.test(questSource));
  assert.ok(/"bloodrotten-quest":\s*\{[^}]*objectives:\s*\[[^\]]*"bakragore"/s.test(questSource));
  assert.ok(/"bakragore"[^}]*maxChars:\s*5/s.test(modalSource));
  assert.ok(/"bakragore":\s*\{[^}]*worldBoss:\s*true/s.test(gameSource));
  assert.ok(/"bakragore":\s*\{[^}]*hunt:\s*"bakragore-room"/s.test(gameSource));
  assert.ok(ctx.GAMEDATA.hunts["bakragore-room"], "hunt registrada");
  assert.equal(ctx.GAMEDATA.hunts["bakragore-room"].otbm, "bakragore_room");
  assert.equal(ctx.GAMEDATA.hunts["bakragore-room"].otbmFloor, 7);
  assert.equal(ctx.GAMEDATA.hunts["bakragore-room"].worldBoss, true);
});
