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
assert.deepStrictEqual(JSON.parse(JSON.stringify(hunt.otbmMobBounds)), { x: 1024, y: 1027, z: 7, w: 1, h: 1 });
assert.strictEqual(context.MONSTERMOVES.cerebellum.speed, 0);
assert.strictEqual(context.MONSTERMOVES["brain-head"].speed, 0);
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

/* ---------- mecânica no engine autoritativo ----------
 * Boss estático; 8 Cerebellum estáticos doam vida — dano no boss é curado
 * na hora enquanto houver Cerebellum vivo. */
const engine = require("../server/authoritative_engine");
const PLAYER = { id: "1", name: "Tank", voc: "knight", level: 900, exp: engine.expForLevel(900),
  hp: 13600, mp: 5000, skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 10, shield: 80 },
  equip: {}, supplies: {}, lootPouch: {}, kills: {}, bosses: {}, config: {} };
const member = { id: "1", p: JSON.parse(JSON.stringify(PLAYER)) };
const desc = engine.initializeAuthority({
  v: 1, savedAt: 1000, kind: "boss", bossId: "brain-head",
  huntId: "brain-head-room", instanceMode: "boss", activeCharacterId: "1",
  members: [member],
  state: { gridW: 30, gridH: 30,
    players: [{ id: "1", p: member.p, cx: 15, cy: 20, x: 15.5 / 30, y: 20.5 / 30 }],
    mobs: [{ id: "b", slug: "brain-head", boss: true, hp: 75000, maxHp: 75000,
      cx: 15, cy: 15, x: 15.5 / 30, y: 15.5 / 30 }],
    events: [] },
}, "b".repeat(64), 1000);

// Silencia dano mob→player para isolar a mecânica.
function silenceAll(a) {
  for (const m of a.mobs || []) { m.damage = 0; m.attackAcc = -1e9;
    if (m.def) m.def = Object.assign({}, m.def, { skills: [] }); }
  for (const p of a.players || []) p.attackAcc = -1e9;
}
function advance(cur, dt) {
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(cur), dt,
    (cur.authority.clock || 0) + dt).state);
}
const bossOf = (a) => (a.mobs || []).find((m) => m && m.boss) || null;
const cerebella = (a) => (a.mobs || []).filter((m) => m && m.brainHeadAdd && m.hp > 0);

let cur = JSON.parse(JSON.stringify(desc));
silenceAll(cur.authority);
for (let i = 0; i < 12; i++) { cur = advance(cur, 1000); silenceAll(cur.authority); }
const a = cur.authority;
assert.ok(a.bh, "auth.bh não foi criado");
assert.strictEqual(cerebella(a).length, 8, "esperava 8 cerebellums");
assert.ok(cerebella(a).every((m) => m.noMove && m.speed === 0), "cerebellum não está estático");
const boss = bossOf(a);
assert.ok(boss && boss.noMove && boss.speed === 0, "boss não está estático");
// Cerebellums nas posições relativas ao boss (adjacentes + cantos).
const rel = new Set(cerebella(a).map((m) => (m.cx - boss.cx) + "," + (m.cy - boss.cy)));
for (const k of ["-1,-1", "1,-1", "1,1", "-1,1", "-8,-5", "7,-5", "-7,8", "7,6"])
  assert.ok(rel.has(k), "cerebellum faltando no offset " + k);

// Dano no boss com cerebellum vivo → cura de volta (hp não desce).
assert.strictEqual(boss.brainHeal, true, "flag brainHeal não sincronizada");
const hp0 = boss.hp;
const healed = engine.applyOutgoingDamage(boss, "physical", 5000, a.clock, 0);
assert.ok(healed > 0, "dano não foi computado");
boss.hp -= healed; // o caller aplica o dano normalmente...
assert.strictEqual(boss.hp, hp0, "cura do cerebellum não anulou o dano");
cur = advance(cur, 1000);
assert.ok((cur.state.events || []).some((e) => e.t === "mobheal" && e.brainHeadHeal),
  "evento mobheal do brainHead não emitido");

// Matou todos os cerebellums → o boss passa a perder vida.
for (const m of cur.authority.mobs || []) if (m.brainHeadAdd) m.hp = 0;
cur = advance(cur, 500);
assert.strictEqual(cerebella(cur.authority).length, 0);
const boss2 = bossOf(cur.authority);
assert.strictEqual(boss2.brainHeal, false, "flag brainHeal deveria ter sido limpa");
const hp1 = boss2.hp;
const dmg2 = engine.applyOutgoingDamage(boss2, "physical", 5000, cur.authority.clock, 0);
boss2.hp -= dmg2;
assert.strictEqual(boss2.hp, hp1 - dmg2, "boss deveria perder vida sem cerebellum vivo");

console.log("Brain Head: mapa, spawn, monstros, sprites e mecânica (cliente + engine) validados.");
