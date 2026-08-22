/* Teste client-side (offline): mobCastSkill causa dano AOE?
 * Carrega gamedata/monsterdata/monsters/combat num VM e roda o cast direto. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const js = path.join(__dirname, "..", "game", "js");

const ctx = vm.createContext({ window: {}, console, Math, Date, JSON, Object, Array, Number, String, Set, Map,
  setTimeout, clearTimeout, performance: { now: () => Date.now() } });
ctx.window = ctx;
for (const f of ["gamedata.js", "monsterdata.js", "monsters.js", "core.js", "player.js", "combat.js"]) {
  try { vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f }); }
  catch (e) { console.log("load " + f + " FALHOU: " + e.message); }
}
if (typeof ctx.mobCastSkill !== "function") { console.log("mobCastSkill indisponivel"); process.exit(1); }

const MON = ctx.GAMEDATA.monsters || ctx.MONSTERDATA;
const def = MON["makara"];
console.log("makara def skills:", JSON.stringify((def && def.skills || []).slice(0, 3)));

/* grid 30x30, mob (15,15) e player adjacente (16,15) */
const W = 30;
const pp = { id: "p1", hp: 10_000_000, mp: 5000, level: 400, voc: "knight",
  skills: { sword: 100, shield: 80 }, equip: {}, maxHp: 10_000_000 };
const playerEnt = { id: "p1", p: pp, cx: 16, cy: 15, x: 16.5 / W, y: 15.5 / W };
const mob = { id: "m1", slug: "makara", def, hp: def.hp, maxHp: def.hp,
  cx: 15, cy: 15, x: 15.5 / W, y: 15.5 / W, skillCds: {}, target: playerEnt, def2: 0 };
const c = { events: [], players: [playerEnt], player: playerEnt, mobs: [mob],
  gridW: W, gridH: W, buffs: {}, stats: { taken: 0 }, pendingSpawns: [] };

let now = 0, taken = {}, areafx = 0;
for (let i = 0; i < 4000; i++) {
  c.events.length = 0;
  ctx.mobCastSkill(c, pp, mob, now);
  for (const ev of c.events) {
    if (ev.t === "taken") taken[ev.el || "?"] = (taken[ev.el || "?"] || 0) + 1;
    else if (ev.t === "areafx") areafx++;
  }
  now += 100;
}
console.log("=== CLIENT mobCastSkill (4000 casts, makara) ===");
console.log("taken por elemento:", JSON.stringify(taken));
console.log("areafx:", areafx, "| HP final player:", pp.hp);

/* ---- Party: AOE multi-vítima (espelho do servidor) ---- */
const ppB = { id: "p2", hp: 10_000_000, mp: 5000, level: 400, voc: "druid",
  skills: { magic: 50 }, equip: {}, maxHp: 10_000_000 };
const entB = { id: "p2", p: ppB, cx: 14, cy: 15, x: 14.5 / W, y: 15.5 / W };   // adjacente ao mob
const ppC = { id: "p3", hp: 10_000_000, mp: 5000, level: 400, voc: "sorcerer",
  skills: { magic: 50 }, equip: {}, maxHp: 10_000_000 };
const entC = { id: "p3", p: ppC, cx: 25, cy: 25, x: 25.5 / W, y: 25.5 / W };   // longe
c.players = [playerEnt, entB, entC];
mob.skillCds = {}; mob.cx = 15; mob.cy = 15; mob.target = playerEnt;
const dmgA = pp.hp, dmgB = ppB.hp, dmgC = ppC.hp;
let hitsB = 0, hitsFar = 0;
for (let i = 0; i < 4000; i++) {
  c.events.length = 0;
  ctx.mobCastSkill(c, playerEnt.p, mob, now);
  for (const ev of c.events) {
    if (ev.t === "taken" && ev.targetId === "p2") hitsB++;
    if (ev.t === "taken" && ev.targetId === "p3") hitsFar++;
  }
  now += 100;
}
console.log("=== CLIENT party (mob radius 3/5 centrado nele; p2 adjacente, p3 longe) ===");
console.log("hits p2 (adjacente, DEVE levar):", hitsB);
console.log("hits p3 (longe, NAO deve levar):", hitsFar);
console.log("dano: p1", (dmgA - pp.hp), "| p2", (dmgB - ppB.hp), "| p3", (dmgC - ppC.hp));
