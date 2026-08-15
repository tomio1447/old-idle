/* Regressão: regras idle PVP/non-PVP no núcleo autoritativo online.
 * Execute: node tibia-idle/tools/test_pvp_instance_rules.js */
"use strict";
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const now = 50_000;
function basePlayer(id, extra) {
  return Object.assign({
    id, name: "P" + id, voc: "knight", level: 100, exp: engine.expForLevel(100),
    hp: 2000, mp: 500, gold: 999999, ml: 10,
    skills: { fist: 10, sword: 80, axe: 10, club: 10, dist: 10, shield: 40 },
    equip: { weapon: { item: "magic-sword" } }, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: { autoWalk: false, spellAttack: true, combo: [] },
    buffs: {}, conditions: {}, charms: {}, bestiary: {},
  }, extra || {});
}

function desc(mode, players) {
  const members = players.map((p) => ({ id: String(p.id), p: JSON.parse(JSON.stringify(p)) }));
  return {
    v: 1, savedAt: now, kind: "hunt", huntId: "rats", instanceMode: mode,
    activeCharacterId: String(players[0].id), members,
    state: {
      players: members.map((m, i) => ({
        id: String(m.id), p: m.p, cx: 8 + i, cy: 6, x: 0.3, y: 0.5,
      })),
      mobs: [], events: [],
    },
  };
}

function live(mode, players) {
  return engine.initializeAuthority(desc(mode, players), "c".repeat(64), now);
}

function tick(descriptor, ms) {
  const out = engine.advanceAuthorityState(descriptor, ms, now + ms);
  must(out && out.state, "advanceAuthorityState sem state");
  return JSON.parse(out.state);
}

function farDummy(auth) {
  // Mantém a hunt sem respawn imediato e longe o bastante para o hostil
  // (mesma célula do attacker) ser o primaryTarget.
  auth.mobs = [{
    id: "dummy-rat", slug: "rat", hp: 999999, maxHp: 999999, cx: 0, cy: 0,
    x: 0.05, y: 0.05, damage: 0, attackAcc: 0, attackSpeed: 999999,
    def: { name: "rat", race: "blood", resist: {}, skills: [] },
  }];
}

/* --- Multiplicadores idle (combat.js newCombat) --- */
{
  const non = live("non-pvp", [basePlayer(1)]);
  must(non.authority.expMul === 1 && non.authority.lootMul === 1 && non.authority.skillMul === 1,
    "non-pvp deve ter mul 1");
  must(!non.authority.pvp, "non-pvp não marca pvp");
  const pvp = live("pvp", [basePlayer(1)]);
  must(pvp.authority.expMul === 1.25 && pvp.authority.lootMul === 1.25 && pvp.authority.skillMul === 1.25,
    "pvp deve ter mul 1.25");
  must(pvp.authority.pvp === true, "pvp marca auth.pvp");
  must(pvp.authority.influencedChance > non.authority.influencedChance,
    "pvp aumenta chance Influenced");
}

/* --- EXP final com mul PVP --- */
{
  const p = basePlayer(1, { level: 8, exp: engine.expForLevel(8) });
  const base = engine.finalExp(p, 1000, "rat", 1);
  const boosted = engine.finalExp(p, 1000, "rat", 1.25);
  must(boosted === Math.floor(base * 1.25) || boosted > base, "expMul PVP deve aumentar EXP");
}

/* --- Dano jogador→jogador --- */
{
  const a = basePlayer(1), b = basePlayer(2, { hp: 500 });
  const non = live("non-pvp", [a, b]);
  const A = non.authority.players[0], B = non.authority.players[1];
  B.raidHostile = true;
  must(!engine.canPlayerDamagePlayer(non.authority, A, B),
    "non-pvp: não pode ferir outro jogador");
  must(engine.applyPlayerPvpDamage(non.authority, A, B, 200, "physical", now) === 0,
    "non-pvp: applyPlayerPvpDamage deve ser 0");
  must(B.p.hp === 500, "non-pvp: HP do alvo intacto");
}

{
  const a = basePlayer(1), b = basePlayer(2, { hp: 800 });
  const pvp = live("pvp", [a, b]);
  const A = pvp.authority.players[0], B = pvp.authority.players[1];
  B.raidHostile = true;
  A.cx = 8; A.cy = 6; B.cx = 9; B.cy = 6;
  must(engine.canPlayerDamagePlayer(pvp.authority, A, B),
    "pvp: pode ferir jogador não-aliado");
  const dealt = engine.applyPlayerPvpDamage(pvp.authority, A, B, 250, "physical", now);
  must(dealt > 0 && B.p.hp < 800, "pvp: melee/API deve reduzir HP do hostil");
  must(pvp.authority.lastDamageSource === "player-raid", "fonte player-raid após hit PVP");
}

/* --- Party FF bloqueado mesmo em PVP --- */
{
  const a = basePlayer(1), b = basePlayer(2, { hp: 800 });
  const pvp = live("pvp", [a, b]);
  const A = pvp.authority.players[0], B = pvp.authority.players[1];
  must(!engine.canPlayerDamagePlayer(pvp.authority, A, B),
    "pvp: aliados de party não FF");
  must(engine.applyPlayerPvpDamage(pvp.authority, A, B, 999, "physical", now) === 0,
    "pvp: apply em aliado deve ser 0");
  must(B.p.hp === 800, "pvp: HP do aliado intacto");
}

/* --- Step autoritativo: melee/área em PVP vs bloqueio em non-pvp --- */
{
  const a = basePlayer(1, {
    voc: "knight", level: 100, mp: 2000,
    config: {
      autoWalk: false, spellAttack: true, useRunes: false,
      combo: [{ kind: "spell", id: "exori", min: 1 }],
    },
  });
  const b = basePlayer(2, { hp: 1500 });
  const livePvp = live("pvp", [a, b]);
  const auth = livePvp.authority;
  farDummy(auth);
  auth.players[1].raidHostile = true;
  auth.players[0].cx = 10; auth.players[0].cy = 10;
  auth.players[1].cx = 10; auth.players[1].cy = 10;
  auth.players[0].attackAcc = 99999;
  auth.players[0].p.mp = 2000;
  auth.players[0].p._spellCd = {};
  auth.players[0].p._groupCd = {};
  auth.players[0].p._offensiveCd = 0;
  const before = auth.players[1].p.hp;
  const stepped = tick(livePvp, 200);
  const victim = stepped.authority.players.find((x) => String(x.id) === "2");
  must(victim && victim.p.hp < before, "pvp: step deve ferir hostil (melee/área)");
}

{
  const a = basePlayer(1, {
    voc: "knight", level: 100, mp: 2000,
    config: {
      autoWalk: false, spellAttack: true, useRunes: false,
      combo: [{ kind: "spell", id: "exori", min: 1 }],
    },
  });
  const b = basePlayer(2, { hp: 1500 });
  const liveNon = live("non-pvp", [a, b]);
  const auth = liveNon.authority;
  farDummy(auth);
  auth.players[1].raidHostile = true;
  auth.players[0].cx = 10; auth.players[0].cy = 10;
  auth.players[1].cx = 10; auth.players[1].cy = 10;
  auth.players[0].attackAcc = 99999;
  auth.players[0].p.mp = 2000;
  auth.players[0].p._spellCd = {};
  auth.players[0].p._groupCd = {};
  auth.players[0].p._offensiveCd = 0;
  const before = auth.players[1].p.hp;
  const stepped = tick(liveNon, 200);
  const victim = stepped.authority.players.find((x) => String(x.id) === "2");
  must(victim && victim.p.hp === before, "non-pvp: step não pode ferir outro jogador");
}

/* --- spellAreaTargets inclui proxy hostil --- */
{
  const a = basePlayer(1), b = basePlayer(2);
  const pvp = live("pvp", [a, b]);
  const auth = pvp.authority;
  auth.players[1].raidHostile = true;
  auth.players[0].cx = 5; auth.players[0].cy = 5;
  auth.players[1].cx = 5; auth.players[1].cy = 5;
  const living = engine.combatLivingFor(auth, auth.players[0]);
  must(living.some((t) => t._playerEnt && String(t.id) === "2"),
    "combatLivingFor PVP deve listar hostil");
  const s = engine.ALL_SPELLS.exori;
  must(s, "exori ausente");
  const primary = living.find((t) => t._playerEnt);
  const targets = engine.spellAreaTargets(auth, s, auth.players[0], primary, living);
  must(targets.some((t) => t._playerEnt && String(t.id) === "2"),
    "área deve incluir jogador hostil em PVP");
}

{
  const a = basePlayer(1), b = basePlayer(2);
  const non = live("non-pvp", [a, b]);
  non.authority.players[1].raidHostile = true;
  const living = engine.combatLivingFor(non.authority, non.authority.players[0]);
  must(!living.some((t) => t._playerEnt),
    "combatLivingFor non-pvp não lista jogadores");
}

/* --- Modo de instância --- */
{
  must(engine.isPvpInstance({ instanceMode: "pvp" }) === true, "isPvpInstance pvp");
  must(engine.isPvpInstance({ instanceMode: "non-pvp" }) === false, "isPvpInstance non-pvp");
  must(engine.instanceRewardMul({ instanceMode: "pvp" }) === 1.25, "reward mul pvp");
  must(engine.instanceRewardMul({ instanceMode: "non-pvp" }) === 1, "reward mul non-pvp");
}

/* PZ/templo: idle de hunt não tem PZ de combate — cidade/treino ficam fora do authority. */
must(typeof engine.canPlayerDamagePlayer === "function", "API PVP exportada");

console.log("OK: regras PVP/non-PVP (mul, FF, hostil, área, modo) validadas.");
