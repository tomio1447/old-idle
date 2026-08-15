/* Canary parity: monstro troca de alvo quando o atual é inalcançável.
 * Execute: node tibia-idle/tools/test_monster_retarget.js */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const now = 100000;
function player(id, cx, cy, name) {
  return {
    id: String(id),
    cx, cy,
    x: (cx + 0.5) / 30,
    y: (cy + 0.5) / 30,
    p: {
      id: Number(id), name: name || ("P" + id), voc: "knight", level: 50,
      hp: 500, mp: 100, gold: 0,
      skills: { sword: 50, axe: 10, club: 10, dist: 10, fist: 10, shield: 40 },
      equip: {}, supplies: {}, lootPouch: {}, kills: {}, bosses: {},
      config: { autoWalk: true }
    }
  };
}
function desc(players, mobs, blocked) {
  return {
    v: 1, savedAt: now, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(players[0].id),
    members: players.map((pl) => ({ id: String(pl.id), p: JSON.parse(JSON.stringify(pl.p)) })),
    state: {
      players: players.map((pl) => Object.assign({}, pl, { p: JSON.parse(JSON.stringify(pl.p)) })),
      mobs: (mobs || []).map((m) => Object.assign({
        slug: "rat", hp: 100, maxHp: 100,
        def: { targetDistance: 1, speed: 120, damage: 10, attackSpeed: 2000 }
      }, m)),
      events: [],
      blockedCells: blocked || undefined
    }
  };
}

/* Parede vertical separa A (esquerda) de B (direita). Mob à direita de B. */
const wall = {};
for (let y = 0; y < 30; y++) wall["10:" + y] = true;

const A = player(1, 5, 10, "Trapped");
const B = player(2, 14, 10, "Reachable");
const mob = { id: "m1", cx: 16, cy: 10, targetId: "1" };

const live = engine.initializeAuthority(desc([A, B], [mob], wall), "r".repeat(64), now);
live.authority.blockedCells = wall;
live.authority.gridW = 30;
live.authority.gridH = 30;
const m = live.authority.mobs[0];
m.cx = 16; m.cy = 10; m.targetId = "1";
m.def = Object.assign({}, m.def, { targetDistance: 1 });
const pA = live.authority.players.find((p) => String(p.id) === "1");
const pB = live.authority.players.find((p) => String(p.id) === "2");
pA.cx = 5; pA.cy = 10;
pB.cx = 14; pB.cy = 10;

must(!engine.authorityMobHasFollowPath(live.authority, m, pA),
  "A deveria ser inalcançável atrás da parede");
must(engine.authorityMobHasFollowPath(live.authority, m, pB),
  "B deveria ser alcançável");

/* 1º tick: conta pathFail; 2º tick (clock diferente): retarget */
live.authority.clock = now;
let t1 = engine.authorityMobTarget(live.authority, m);
must(String(t1.id) === "1", "1º tick ainda gruda em A (anti-flicker): " + t1.id);
live.authority.clock = now + 200;
let t2 = engine.authorityMobTarget(live.authority, m);
must(String(t2.id) === "2", "2º tick deve trocar para B alcançável: " + (t2 && t2.id));
must(String(m.targetId) === "2", "targetId persistido em B");

/* Sticky: com B alcançável não volta para A só porque A está "mais perto" em linha reta */
live.authority.clock = now + 400;
m._reachKey = null;
const sticky = engine.authorityMobTarget(live.authority, m);
must(String(sticky.id) === "2", "não deve flicker de volta para A: " + sticky.id);

/* Caso feliz: A alcançável permanece em A */
const open = engine.initializeAuthority(desc([
  player(1, 12, 10, "Near"),
  player(2, 18, 10, "Far")
], [{ id: "m2", cx: 10, cy: 10, targetId: "1" }], null), "o".repeat(64), now);
const m2 = open.authority.mobs[0];
m2.cx = 10; m2.cy = 10; m2.targetId = "1";
m2.def = Object.assign({}, m2.def, { targetDistance: 1 });
open.authority.players[0].cx = 12; open.authority.players[0].cy = 10;
open.authority.players[1].cx = 18; open.authority.players[1].cy = 10;
open.authority.clock = now;
const keep1 = engine.authorityMobTarget(open.authority, m2);
open.authority.clock = now + 200;
const keep2 = engine.authorityMobTarget(open.authority, m2);
must(String(keep1.id) === "1" && String(keep2.id) === "1",
  "alvo alcançável deve permanecer: " + keep1.id + "/" + keep2.id);

/* Cliente: monsterReachableTarget ainda existe e usa findPathGrid */
const grid = fs.readFileSync(path.join(__dirname, "..", "game", "js", "gridai.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "game", "index.html"), "utf8");
must(/function monsterReachableTarget/.test(grid), "gridai sem monsterReachableTarget");
must(/findPathGrid\(mob, ent\.cx, ent\.cy, occ\)/.test(grid), "gridai sem A* de alcance");
must(/authoritativeTarget\|\|monsterReachableTarget/.test(grid), "parity online/offline");
must(html.includes("js/gridai.js?v=mob-retarget-v1"), "cache-bust gridai");

console.log("OK: monstro retargeta de A inalcançável para B; sticky em alcançável.");
