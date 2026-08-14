/* Mapa 100% pronto antes do spawn + teleporte Canary 3× (1/s). */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../server/authoritative_engine");

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
function must(ok, msg) { if (!ok) throw Error(msg); }

const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const preloadSrc = fs.readFileSync(path.join(js, "preload.js"), "utf8");
const engineSrc = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");

must(/const SPAWN_BLINK_MS = 1000/.test(combatSrc) && /const SPAWN_BLINKS = 3/.test(combatSrc),
  "SPAWN_BLINK_MS/SPAWN_BLINKS não estão em 1000ms × 3");
must(combatSrc.includes("function huntMapSpawnBlocked") &&
  combatSrc.includes("G.huntMapReady === false") &&
  combatSrc.includes("if (huntMapSpawnBlocked()) return"),
  "fila de spawn não respeita o gate do mapa");
must(gameSrc.includes("G.huntMapReady = false") &&
  gameSrc.includes("markHuntMapReady") &&
  gameSrc.includes("releaseHeldAuthoritySpawns") &&
  gameSrc.includes('key!=="pendingSpawns"') &&
  gameSrc.includes("tickSpawnQueue(G.combat,Date.now())"),
  "entrada da hunt / snapshot online não prendem o spawn visual");
must(preloadSrc.includes("function markHuntMapReady") &&
  preloadSrc.includes("warmHuntTileSprites") &&
  preloadSrc.includes("waitForImages"),
  "preload da hunt não aquece os tiles antes do spawn");
must(engineSrc.includes('keep=new Set([') && engineSrc.includes('"spawn-blink"') &&
  engineSrc.includes("function tickAuthSpawnQueue") &&
  engineSrc.includes("AUTH_SPAWN_BLINK_MS=1000"),
  "keep-set/spawn-blink ou fila autoritativa ausentes");

const ctx = {
  G: { huntMapReady: false },
  GRID_W: 30, GRID_H: 13,
  console, Date, Math, Number, String, Array, Object,
};
vm.createContext(ctx);
vm.runInContext(combatSrc, ctx);

const c = { pendingSpawns: [], mobs: [], events: [], gridW: 30, gridH: 13 };
c.pendingSpawns.push({
  mob: { id: "rat-1", slug: "rat" },
  cx: 8, cy: 6, startedAt: 1000, blink: 0, done: false,
});
ctx.tickSpawnQueue(c, 1000);
must(c.mobs.length === 0 && c.events.length === 0 && c.pendingSpawns.length === 1,
  "spawn andou enquanto o mapa ainda carregava");

ctx.G.huntMapReady = true;
ctx.tickSpawnQueue(c, 1000);
must(c.events.filter((e) => e.t === "spawn-blink").length === 1 &&
  c.events[0].blink === 1 && c.mobs.length === 0,
  "primeira piscada não ocorreu em t=0");
ctx.tickSpawnQueue(c, 2000);
must(c.events.filter((e) => e.t === "spawn-blink").length === 2 && c.mobs.length === 0,
  "segunda piscada não ocorreu em t=1000ms");
ctx.tickSpawnQueue(c, 3000);
must(c.events.filter((e) => e.t === "spawn-blink").length === 3 && c.mobs.length === 0,
  "terceira piscada não ocorreu em t=2000ms ou o mob nasceu cedo");
const spacing = [];
for (let t = 1000; t <= 3000; t += 1000) {
  const ev = c.events.filter((e) => e.t === "spawn-blink" && e.blink === (t - 1000) / 1000 + 1);
  must(ev.length === 1, "piscada fora do intervalo de 1s: t=" + t);
  spacing.push(t);
}
must(spacing[1] - spacing[0] === 1000 && spacing[2] - spacing[1] === 1000,
  "intervalo entre piscadas não é 1000ms");
ctx.tickSpawnQueue(c, 4000);
must(c.mobs.length === 1 && c.pendingSpawns.length === 0 &&
  c.events.some((e) => e.t === "spawn") && c.mobs[0].id === "rat-1",
  "monstro não nasceu após as 3 piscadas de 1s");

const basePlayer = {
  id: 1, name: "Blink", voc: "knight", level: 20, exp: 1000, hp: 300, mp: 50, gold: 5000,
  skills: { sword: 40, axe: 10, club: 10, dist: 10, fist: 10, shield: 30 },
  equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {}, kills: {}, bosses: {},
};
const member = { id: String(basePlayer.id), p: JSON.parse(JSON.stringify(basePlayer)) };
const desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
  activeCharacterId: String(basePlayer.id), members: [member],
  state: {
    players: [{ id: String(basePlayer.id), p: member.p }],
    mobs: [], events: [],
    pendingSpawns: [{ mob: { id: "pending-rat", slug: "rat" }, cx: 8, cy: 6, startedAt: 1000 }],
  },
};
const pendingAuth = engine.initializeAuthority(desc, "a".repeat(64), 1000);
must(pendingAuth.authority.mobs.length === 0 && pendingAuth.authority.pendingSpawns.length === 1 &&
  pendingAuth.state.events.some((event) => event.t === "spawn-blink") &&
  pendingAuth.state.mobs.length === 0,
  "servidor promoveu pendingSpawns a mobs visíveis antes do blink");
const mid = JSON.parse(engine.advanceAuthorityState(JSON.stringify(pendingAuth), 2000, 3000).state);
must(mid.authority.mobs.length === 0 &&
  mid.state.events.filter((event) => event.t === "spawn-blink").length >= 1,
  "servidor nasceu o mob antes da 3ª piscada");
const live = JSON.parse(engine.advanceAuthorityState(JSON.stringify(mid), 1000, 4000).state);
must(live.authority.mobs.length === 1 && live.authority.mobs[0].cx === 8 &&
  live.state.events.some((event) => event.t === "spawn"),
  "servidor não concluiu o spawn após 3s de teleporte");

console.log("OK: mapa-ready segura o spawn e o teleporte pisca 3× a 1s antes do monstro nascer.");
