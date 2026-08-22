/* Prova do bug: skill radius ancorada NO ALVO (alvo:1 + range>1) nunca acerta ninguém. */
"use strict";
const engine = require("../server/authoritative_engine");

/* dummy sintético: ÚNICA skill = explosão radius 2 ancorada NO ALVO */
engine.MONSTERS["aoe-dummy"] = {
  name: "AOE Dummy", hp: 50000, exp: 0, damage: 0, armor: 0, defense: 0,
  element: "physical", attackSpeed: 2000, loot: [],
  skills: [{ el: "energy", min: 100, max: 200, int: 1000, ch: 100, radius: 2, range: 7, alvo: 1 }],
};

function mkPlayer(id) {
  return { id, name: "T" + id, voc: "knight", level: 800, exp: engine.expForLevel(800),
    hp: 50_000_000, mp: 1000, skills: { sword: 1, shield: 1 }, ml: 1, equip: {},
    supplies: {}, lootPouch: {}, kills: {}, bosses: {}, config: {} };
}
const W = 30;
const p1 = mkPlayer(1), p2 = mkPlayer(2);
const desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "frozen", bossId: null,
  instanceMode: "non-pvp", activeCharacterId: "1",
  members: [{ id: "1", p: p1 }, { id: "2", p: p2 }],
  state: {
    players: [
      { id: "1", p: p1, cx: 16, cy: 15, x: 16.5 / W, y: 15.5 / W },
      { id: "2", p: p2, cx: 17, cy: 15, x: 17.5 / W, y: 15.5 / W },
    ],
    mobs: [{ id: "m1", slug: "aoe-dummy", cx: 15, cy: 15, x: 15.5 / W, y: 15.5 / W }],
    events: [], gridW: W, gridH: W,
  },
};

let auth = engine.initializeAuthority(desc, "a".repeat(64), 1000);
let clock = 1000, taken = {}, byTarget = {}, areafx = 0;
for (let t = 0; t < 60_000; t += 2000) {
  const res = engine.advanceAuthorityState(JSON.stringify(auth), 2000, clock + 2000);
  auth = JSON.parse(res.state); clock += 2000;
  for (const ev of ((auth.state && auth.state.events) || [])) {
    if (ev.t === "taken") { taken[ev.el] = (taken[ev.el] || 0) + 1; byTarget[ev.targetId] = (byTarget[ev.targetId] || 0) + 1; }
    if (ev.t === "areafx") areafx++;
  }
  for (const it of auth.authority.players) {
    it.p.hp = engine.maxStats(it.p).hp; it.p.mp = engine.maxStats(it.p).mp; it.downUntil = 0;
  }
}
console.log("PRE-FIX — skill radius-alvo (alvo:1, range:7, radius:2), 60s, ch:100:");
console.log("  taken:", JSON.stringify(taken), "| por targetId:", JSON.stringify(byTarget), "| areafx:", areafx);
