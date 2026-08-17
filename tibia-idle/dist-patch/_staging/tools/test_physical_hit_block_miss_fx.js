/* Physical hit / block / miss combat FX (offline drainEvents + online engine). */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const root = path.join(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(root, "game/js/game.js"), "utf8");
const combatSrc = fs.readFileSync(path.join(root, "game/js/combat.js"), "utf8");
const renderSrc = fs.readFileSync(path.join(root, "game/js/render.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "game/index.html"), "utf8");
const engineSrc = fs.readFileSync(path.join(root, "server/authoritative_engine.js"), "utf8");

must(gameSrc.includes('r.addEffect(mx, ey(e), e.fx || "poff")'),
  "drainEvents miss deve spawnar poff");
must(gameSrc.includes('r.addEffect(bx, by, e.fx || "block-hit")'),
  "drainEvents block deve spawnar block-hit");
must(gameSrc.includes("takenDmg <= 0 && !e.condition"),
  "taken dmg=0 deve cair no visual de block");
must(gameSrc.includes('hitFx || "draw-blood"'),
  "hit fisico deve sempre ter fallback de impacto");
must(combatSrc.includes('fx: "block-hit"') && combatSrc.includes('fx: "poff"'),
  "combat.js offline deve marcar fx em block/miss");
must(renderSrc.includes('nm === "draw-blood"') && renderSrc.includes('nm === "block-hit"'),
  "FX_CAP deve priorizar impactos fisicos");
must(engineSrc.includes('keep=new Set([') && engineSrc.includes('"miss"') && engineSrc.includes('"block"'),
  "MAX_AUTH_EVENTS deve preservar miss/block");
must(engineSrc.includes('t:"block"') && engineSrc.includes('fx:"block-hit"'),
  "melee mitigado a 0 deve emitir block+block-hit");
must(indexSrc.includes("phys-hit-combo-v1") || indexSrc.includes("phys-hit-fx-v1") ||
  indexSrc.includes("js/game.js?v="), "cache-bust phys-hit-combo-v1");

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function descriptor(p, mobs) {
  const member = { id: String(p.id), p: clone(p) };
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(p.id), members: [member],
    state: {
      gridW: 30, gridH: 30,
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: mobs || [{ id: "rat-one", slug: "rat", cx: 11, cy: 10, x: 11.5 / 30, y: 10.5 / 30, hp: 999999, maxHp: 999999 }],
      events: [],
    },
  };
}

const tank = {
  id: 1, name: "EK", voc: "knight", level: 300, exp: engine.expForLevel(300),
  hp: 50000, mp: 500, gold: 0, ml: 10,
  skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 10, shield: 200 },
  equip: {
    weapon: { item: "magic-sword" },
    shield: { item: "demon-shield" },
    armor: { item: "magic-plate-armor" },
    legs: { item: "golden-legs" },
    helmet: { item: "demon-helmet" },
  },
  supplies: {}, lootPouch: {}, kills: {}, bosses: {},
  config: { spellAttack: false, combo: [] },
};

let sawBlock = false;
for (let i = 0; i < 80; i++) {
  const live = engine.initializeAuthority(descriptor(tank), ("blk" + i + "x".repeat(64)).slice(0, 64), 1000);
  for (const mob of live.authority.mobs || []) {
    mob.hp = 999999; mob.maxHp = 999999; mob.damage = 40; mob.attackAcc = 8000;
    mob.def = Object.assign({}, mob.def, { skills: [], attackSpeed: 500 });
  }
  live.authority.players[0].attackAcc = -1e9;
  const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 1000, 2000).state);
  const blocks = (after.state.events || []).filter((e) => e.t === "block" && e.fx === "block-hit");
  const zeroTaken = (after.state.events || []).filter((e) => e.t === "taken" && !(Number(e.dmg) > 0));
  if (blocks.length) {
    sawBlock = true;
    must(zeroTaken.length === 0, "block nao pode vir acompanhado de taken dmg=0");
    break;
  }
}
must(sawBlock, "knight tank nao emitiu block+block-hit em 80 swings de rat");

// Miss determinístico: bow sem munição.
const archer = {
  id: 1, name: "RP", voc: "paladin", level: 20, exp: engine.expForLevel(20),
  hp: 500, mp: 200, gold: 0, ml: 10,
  skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 40, shield: 20 },
  equip: { weapon: { item: "bow" }, shield: { item: "quiver" } },
  supplies: {}, lootPouch: {}, kills: {}, bosses: {},
  config: { spellAttack: false, combo: [] },
};
{
  const live = engine.initializeAuthority(descriptor(archer), "b".repeat(64), 1000);
  for (const mob of live.authority.mobs || []) {
    mob.hp = 999999; mob.maxHp = 999999; mob.damage = 0; mob.attackAcc = -1e9;
    mob.def = Object.assign({}, mob.def, { skills: [] });
  }
  live.authority.players[0].attackAcc = 8000;
  const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 1000, 2000).state);
  const ammoMiss = (after.state.events || []).filter((e) => e.t === "miss" && e.reason === "ammo");
  must(ammoMiss.length >= 1 && ammoMiss.every((e) => e.fx === "poff"),
    "miss por ammo deve carregar fx poff: " + JSON.stringify(ammoMiss[0] || null));
}

const hits = (function () {
  const p = {
    id: 1, name: "EK", voc: "knight", level: 80, exp: engine.expForLevel(80),
    hp: 2000, mp: 200, gold: 0, ml: 10,
    skills: { fist: 10, sword: 70, axe: 10, club: 10, dist: 10, shield: 40 },
    equip: { weapon: { item: "magic-sword" } },
    supplies: {}, lootPouch: {}, kills: {}, bosses: {},
    config: { spellAttack: false, combo: [] },
  };
  const live = engine.initializeAuthority(descriptor(p), "a".repeat(64), 1000);
  for (const mob of live.authority.mobs || []) {
    mob.hp = 999999; mob.maxHp = 999999; mob.damage = 0; mob.attackAcc = -1e9;
    mob.def = Object.assign({}, mob.def, { skills: [], race: "blood" });
  }
  live.authority.players[0].attackAcc = 8000;
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 1000, 2000).state);
})();
const phys = (hits.state.events || []).filter((e) => e.t === "hit" && e.el === "physical");
must(phys.length >= 1 && phys.every((e) => e.fx === "draw-blood" || e.fx === engine.physicalHitFx("blood")),
  "hit fisico basico deve carregar FX da raca");

console.log("OK: physical hit / block / miss FX");
