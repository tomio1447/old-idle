/* Teste: magias AOE de monstros estão causando dano? (pipeline autoritativo real) */
"use strict";
const engine = require("../server/authoritative_engine");

function player(overrides) {
  return Object.assign({
    id: 1, name: "AoeTester", voc: "knight", level: 800, exp: engine.expForLevel(800),
    hp: 50_000_000, mp: 20000, gold: 100000,
    skills: { sword: 120, axe: 10, club: 10, dist: 10, fist: 10, shield: 100 },
    ml: 20, equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {},
  }, overrides || {});
}

function huntDesc(p, huntId, mobSlugs) {
  const member = { id: String(p.id), p: JSON.parse(JSON.stringify(p)) };
  const W = 30;
  const mobs = mobSlugs.map((slug, i) => ({
    id: "mob-" + i, slug, boss: false,
    cx: 14 + (i % 3), cy: 12 + Math.floor(i / 3),
    x: (14 + (i % 3) + .5) / W, y: (12 + Math.floor(i / 3) + .5) / W,
  }));
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId, bossId: null,
    instanceMode: "non-pvp", activeCharacterId: String(p.id),
    members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 15, cy: 15, x: 15.5 / W, y: 15.5 / W }],
      mobs, events: [], gridW: W, gridH: W,
    },
  };
}

/* ---- cenário: hunt selecionável via argv ---- */
const huntId = process.argv[2] || "marapur-nagas";
const mobList = process.argv[3] ? process.argv[3].split(",") : ["makara", "makara", "naga-warrior", "naga-warrior"];
const p = player();
let auth = engine.initializeAuthority(huntDesc(p, huntId, mobList), "a".repeat(64), 1000);

const stats = { taken: {}, areafx: 0, effect: 0, mobheal: 0, takenCount: {} };
const collect = (descriptor) => {
  for (const ev of ((descriptor.state && descriptor.state.events) || [])) {
    if (ev.t === "taken") {
      stats.taken[ev.el || "?"] = (stats.taken[ev.el || "?"] || 0) + (Number(ev.dmg) || 0);
      stats.takenCount[ev.el || "?"] = (stats.takenCount[ev.el || "?"] || 0) + 1;
    } else if (ev.t === "areafx") stats.areafx++;
    else if (ev.t === "effect") stats.effect++;
    else if (ev.t === "mobheal") stats.mobheal++;
  }
};

let clock = 1000, SIM_MS = 180_000, CHUNK = 2000;
for (let t = 0; t < SIM_MS; t += CHUNK) {
  const res = engine.advanceAuthorityState(JSON.stringify(auth), CHUNK, clock + CHUNK);
  auth = JSON.parse(res.state);
  collect(auth);
  clock += CHUNK;
  if (res.terminalReason) { console.log("terminal:", res.terminalReason); break; }
  /* healer ficticio: player full a cada chunk para aguentar os 180s */
  const it = auth.authority.players[0];
  it.p.hp = engine.maxStats(it.p).hp;
  it.p.mp = engine.maxStats(it.p).mp;
  it.downUntil = 0; it.permadead = false;
  if (it.p.hp <= 0) it.p.hp = engine.maxStats(it.p).hp;
}
const hpNow = auth.authority.players[0].p.hp;
console.log("=== RESULTADO (180s de combate) ===");
console.log("dano por elemento:", JSON.stringify(stats.taken));
console.log("hits por elemento:", JSON.stringify(stats.takenCount));
console.log("areafx (FX de AOE):", stats.areafx, "| effect:", stats.effect, "| mobheal:", stats.mobheal);
console.log("mobs vivos:", auth.authority.mobs.filter(m => m.hp > 0).length,
  "| kills:", auth.authority.stats.kills, "| wave:", auth.authority.wave);
