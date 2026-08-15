/* Último monstro da wave: kill não monta spawnWave no mesmo passo; a próxima
 * onda espera WAVE_CLEAR_RESPAWN_MS (6s) e só então entra em pendingSpawns/blink. */
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
const engineSrc = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");

must(/const WAVE_CLEAR_RESPAWN_MS = 6000/.test(combatSrc) &&
  combatSrc.includes("c._nextWaveAt = (c._tickNow || now || Date.now()) + WAVE_CLEAR_RESPAWN_MS") &&
  combatSrc.includes("if (c._nextWaveAt && now < c._nextWaveAt)") &&
  combatSrc.includes("Occupancy uma vez por wave"),
  "cliente não agenda 6s / spawnWave no wave-clear");
must(engineSrc.includes("AUTH_WAVE_CLEAR_RESPAWN_MS=6000") &&
  engineSrc.includes("auth._nextWaveAt=stepTs+AUTH_WAVE_CLEAR_RESPAWN_MS") &&
  engineSrc.includes("if(stepTs>=auth._nextWaveAt){auth._nextWaveAt=0;spawnHuntWave(auth,stepTs);}"),
  "servidor não adia spawnHuntWave em 6s após o último kill");
must(gameSrc.includes("function syncAuthorityPendingSpawns") &&
  gameSrc.includes("syncAuthorityPendingSpawns(previous,incoming.pendingSpawns") &&
  gameSrc.includes("!incomingHasKill&&!hasPendingPreview"),
  "snapshot online não sincroniza pendingSpawns / limpa fantasmas no kill");
must(gameSrc.includes('key!=="pendingSpawns"'),
  "Object.assign escalar ainda não exclui pendingSpawns (evita replace acidental)");

/* --- local: após limpar a onda, spawnWave só após WAVE_CLEAR_RESPAWN_MS --- */
const GRID_W = 30, GRID_H = 13;
const walls = [];
for (let y = 0; y < GRID_H; y++)
  for (let x = 0; x < GRID_W; x++)
    if (x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1) walls.push(x + ":" + y);

let spawnWaveCalls = 0;
const ctx = {
  G: { huntMapReady: true },
  GRID_W, GRID_H,
  GAMEDATA: {
    monsters: {
      rat: {
        name: "Rat", hp: 20, exp: 5, damage: 1, armor: 0,
        loot: [{ item: "gold-coin", chance: 0, min: 1, max: 1 }],
      },
    },
  },
  FIENDISH_BASE_CHANCE: 0, INFLUENCED_BASE_CHANCE: 0,
  buildOccupancy(c) {
    const occ = new Map();
    for (const k of walls) occ.set(k, true);
    for (const m of c.mobs || []) if (m && m.hp > 0) occ.set(m.cx + ":" + m.cy, m);
    return occ;
  },
  cellFree(occ, cx, cy) { return !occ.has(cx + ":" + cy); },
  placeFree(ent, occ, cx, cy) {
    if (ctx.cellFree(occ, cx, cy)) { ent.cx = cx; ent.cy = cy; return true; }
    for (let r = 1; r < 8; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx > 0 && ny > 0 && nx < GRID_W - 1 && ny < GRID_H - 1 && ctx.cellFree(occ, nx, ny)) {
            ent.cx = nx; ent.cy = ny; return true;
          }
        }
    return false;
  },
  ensureCell() {},
  cellToScreen(cx, cy) { return { x: (cx + 0.5) / GRID_W, y: (cy + 0.5) / GRID_H }; },
  displayMonsterName(n) { return n; },
  console, Date, Math, Number, String, Array, Object, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(combatSrc, ctx);
const WAVE_CLEAR_RESPAWN_MS = 6000;
const realSpawnWave = ctx.spawnWave;
ctx.spawnWave = function (c, p) {
  spawnWaveCalls++;
  return realSpawnWave(c, p);
};
/* Espelha o gate de spawn do combatTick (sem o restante do tick). */
function runSpawnGate(c, p, now) {
  if (!c.mobs.length && !(c.pendingSpawns && c.pendingSpawns.length)) {
    if (c.boss) return;
    if (c._nextWaveAt && now < c._nextWaveAt) {
      /* waiting */
    } else if (!ctx.huntMapSpawnBlocked()) {
      c._nextWaveAt = 0;
      ctx.spawnWave(c, p);
    }
  } else if (c.mobs.length || (c.pendingSpawns && c.pendingSpawns.length)) {
    c._nextWaveAt = 0;
  }
}

const player = { id: 1, name: "Lag", voc: "knight", level: 20 };
const t0 = 10000;
const combat = {
  hunt: { monsters: ["rat"], pack: 3, cat: "easy", level: 1 },
  player: { id: 1, p: player, cx: 10, cy: 6 },
  players: [{ id: 1, p: player, cx: 10, cy: 6 }],
  mobs: [],
  pendingSpawns: [],
  events: [],
  fiendishChance: 0, influencedChance: 0,
  gridW: GRID_W, gridH: GRID_H, wave: 1,
};
combat.player = combat.players[0];

// Simula fim do tick do kill: arena vazia + próximo spawn em t0+6s.
combat._nextWaveAt = t0 + WAVE_CLEAR_RESPAWN_MS;
spawnWaveCalls = 0;
runSpawnGate(combat, player, t0);
must(spawnWaveCalls === 0, "spawnWave rodou no tick imediato após o kill");
must(combat._nextWaveAt === t0 + 6000, "agenda de 6s não se manteve");
must(!(combat.pendingSpawns && combat.pendingSpawns.length),
  "pendingSpawns preenchido no frame do kill");

spawnWaveCalls = 0;
runSpawnGate(combat, player, t0 + 5999);
must(spawnWaveCalls === 0, "spawnWave rodou antes dos 6s");

spawnWaveCalls = 0;
runSpawnGate(combat, player, t0 + 6000);
must(spawnWaveCalls === 1, "spawnWave não rodou após os 6s");
must(combat._nextWaveAt === 0, "flag de agenda não limpou");
must(combat.pendingSpawns.length > 0, "próxima wave não entrou em pendingSpawns");
must(combat.mobs.length === 0, "mobs nasceram sem blink Canary");

/* --- servidor: kill do último mob não monta pendingSpawns no mesmo advance --- */
const basePlayer = {
  id: 1, name: "Srv", voc: "knight", level: 50, exp: 100000, hp: 800, mp: 200, gold: 5000,
  skills: { sword: 60, axe: 10, club: 10, dist: 10, fist: 10, shield: 40 },
  skillTries: {}, equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {},
  kills: {}, bosses: {}, ammo: {}, conditions: {}, config: { attackMode: "balanced" },
  stamina: 42 * 3600, dust: 0, dustLimit: 100, slivers: 0, missions: {},
};
const member = { id: String(basePlayer.id), p: JSON.parse(JSON.stringify(basePlayer)) };
const desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
  activeCharacterId: String(basePlayer.id), members: [member],
  state: {
    players: [{ id: String(basePlayer.id), p: member.p, cx: 10, cy: 6 }],
    mobs: [{
      id: "solo-rat", slug: "rat", hp: 1, maxHp: 20, boss: false,
      cx: 14, cy: 6, x: 0.5, y: 0.5,
    }],
    events: [], pendingSpawns: [],
    gridW: 30, gridH: 13,
  },
};
const auth0 = engine.initializeAuthority(desc, "b".repeat(64), 1000);
must(auth0.authority.mobs.length >= 1, "hunt de teste sem mob inicial");
auth0.authority.mobs.forEach((m) => { m.hp = 0; });
auth0.authority.pack = 3;
auth0.authority.spawnPool = ["rat"];
// Um único AUTH_STEP (200ms): processa mortes e agenda 6s — sem spawnHuntWave.
const killAdvance = JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth0), 200, 1200).state);
must(killAdvance.authority.mobs.length === 0, "servidor não removeu o último mob");
must(killAdvance.authority._nextWaveAt === 1200 + 6000,
  "servidor não agenda spawn em +6s no kill");
must(!(killAdvance.authority.pendingSpawns && killAdvance.authority.pendingSpawns.length),
  "spawnHuntWave rodou no mesmo step do último kill");
must(!(killAdvance.state.pendingSpawns && killAdvance.state.pendingSpawns.length),
  "snapshot do kill já trouxe pendingSpawns");

// Ainda dentro da janela de 6s: não enfileira.
const midAdvance = JSON.parse(engine.advanceAuthorityState(JSON.stringify(killAdvance), 5800, 7000).state);
must(!(midAdvance.authority.pendingSpawns && midAdvance.authority.pendingSpawns.length) &&
  !(midAdvance.authority.mobs && midAdvance.authority.mobs.length),
  "spawnHuntWave rodou antes dos 6s");
must(midAdvance.authority._nextWaveAt === 7200,
  "agenda de 6s não persistiu no catchup");

// Após completar os 6s: enfileira pendingSpawns/blink.
const nextAdvance = JSON.parse(engine.advanceAuthorityState(JSON.stringify(midAdvance), 200, 7400).state);
must((nextAdvance.authority.pendingSpawns && nextAdvance.authority.pendingSpawns.length) ||
  (nextAdvance.authority.mobs && nextAdvance.authority.mobs.length),
  "após 6s não enfileirou a wave via pendingSpawns/blink");
must(!nextAdvance.authority._nextWaveAt,
  "flag de agenda ficou presa após o spawn");

/* --- applyOnlineAuthorityState: pending sync + sem replace integral --- */
const syncStart = gameSrc.indexOf("function syncAuthorityPendingSpawns");
const applyStart = gameSrc.indexOf("function applyOnlineAuthorityState");
const applyEnd = gameSrc.indexOf("\nfunction requestOnlineAuthorityTick", applyStart);
must(syncStart >= 0 && applyStart >= 0 && applyEnd > applyStart,
  "syncAuthorityPendingSpawns/applyOnlineAuthorityState ausente");
const applyCtx = {
  G: {
    combat: {
      players: [{ id: "10", p: { id: 10, level: 20, exp: 1, skills: {}, config: {} },
        cx: 5, cy: 5, x: 0.2, y: 0.4, hp: 100 }],
      player: null,
      mobs: [{ id: "ghost", slug: "rat", hp: 5, cx: 8, cy: 6, x: 0.4, y: 0.5,
        def: { name: "Rat" } }],
      events: [], pendingSpawns: [], stats: {}, gridW: 30, gridH: 13,
    },
    p: null, huntMapReady: true,
  },
  ONLINE_AUTH_APPLIED_VERSION: 0,
  ONLINE_AUTH_APPLIED_INSTANCE: "",
  GAMEDATA: { monsters: { rat: { name: "Rat", hp: 20 } } },
  Date, Math, Number, String, Array, Object, Map, Set, console,
};
applyCtx.G.combat.player = applyCtx.G.combat.players[0];
applyCtx.G.p = applyCtx.G.combat.player.p;
vm.createContext(applyCtx);
vm.runInContext(gameSrc.slice(syncStart, applyEnd), applyCtx);
const beforeCombat = applyCtx.G.combat;
must(applyCtx.applyOnlineAuthorityState({
  version: 2, activeCharacterId: "10",
  state: {
    gridW: 30, gridH: 13, players: applyCtx.G.combat.players,
    mobs: [], events: [{ t: "kill", mob: "rat", name: "Rat", exp: 5, loot: [], ts: Date.now() }],
    pendingSpawns: [], stats: { kills: 1 },
  },
}, null, 2), "snapshot de kill final não aplicou");
must(applyCtx.G.combat === beforeCombat, "applyOnlineAuthorityState substituiu G.combat");
must(applyCtx.G.combat.mobs.length === 0,
  "fantasma do último mob não foi limpo no kill");

must(applyCtx.applyOnlineAuthorityState({
  version: 3, activeCharacterId: "10",
  state: {
    gridW: 30, gridH: 13, players: applyCtx.G.combat.players,
    mobs: [], events: [],
    pendingSpawns: [{
      mob: { id: "next-1", slug: "rat", hp: 20, maxHp: 20 },
      cx: 12, cy: 6, startedAt: Date.now(), blink: 0,
    }],
    stats: { kills: 1 },
  },
}, null, 3), "snapshot com pendingSpawns não aplicou");
must(applyCtx.G.combat.pendingSpawns.length === 1 &&
  applyCtx.G.combat.pendingSpawns[0].mob.id === "next-1",
  "pendingSpawns do servidor não sincronizaram no cliente");
must(applyCtx.G.combat.mobs.length === 0,
  "pendingSpawns promoveu mobs visíveis cedo demais");

console.log("OK: último kill adia spawnWave/spawnHuntWave em 6s; pendingSpawns/blink depois.");
