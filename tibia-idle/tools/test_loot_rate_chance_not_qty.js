/* Rate/Prey/PvP aumentam chance de loot — nunca a quantidade (qty).
 * Regressão do bug Timira/Reward Chest: count*lootMult gerava 14*2.5=35. */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const serverSrc = fs.readFileSync(
  path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
const combatSrc = fs.readFileSync(
  path.join(__dirname, "..", "game", "js", "combat.js"), "utf8");

must(!/finalCount\s*=\s*Math\.max\(1,\s*Math\.floor\(count\s*\*\s*loot/.test(serverSrc),
  "servidor ainda multiplica quantidade (finalCount=count*loot…)");
must(!/const boosted = count \* lootRate/.test(combatSrc),
  "cliente ainda multiplica quantidade com lootRate");
must(/chanceMult\s*=\s*lootRate/.test(serverSrc) &&
  /Math\.min\(100,\s*\(Number\(entry\.chance\)\|\|0\)\s*\*\s*chanceMult\)/.test(serverSrc),
  "servidor deve aplicar lootRate/prey/lootMul só na chance");

function player(overrides) {
  return Object.assign({
    id: 1, name: "LootRate", voc: "knight", level: 800,
    exp: engine.expForLevel(800), hp: 500000, mp: 20000, gold: 0,
    skills: { sword: 120, axe: 10, club: 10, dist: 10, fist: 10, shield: 100 },
    ml: 20, equip: { weapon: { item: "sword" } }, supplies: {},
    lootPouch: {}, kills: {}, bosses: {}, config: {},
    rewardChest: {}, rewardChestBundles: [],
  }, overrides || {});
}

function bossDesc(p, seedLoot) {
  const member = { id: String(p.id), p: JSON.parse(JSON.stringify(p)) };
  return {
    v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "timira-the-many-headed", instanceMode: "boss",
    activeCharacterId: String(p.id), members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: [{
        id: "boss-1", slug: "timira-the-many-headed", boss: true,
        cx: 12, cy: 10, x: 12.5 / 30, y: 10.5 / 30,
      }],
      events: [],
      // força lootMul PVP 1.25 no caminho de chance (não qty)
      lootMul: 1.25,
    },
  };
}

function silence(auth) {
  for (const mob of auth.authority.mobs || []) {
    mob.damage = 0;
    mob.attackSpeed = Number.MAX_SAFE_INTEGER;
    mob.attackAcc = 0;
  }
  for (const item of auth.authority.players || []) {
    item.p.hp = engine.maxStats(item.p).hp;
    item.p.conditions = {};
  }
}

function killWithLoot(loot, lootMul) {
  const desc = bossDesc(player());
  if (lootMul !== undefined) desc.state.lootMul = lootMul;
  const auth = engine.initializeAuthority(desc, "f".repeat(64), 1000);
  silence(auth);
  if (lootMul !== undefined) auth.authority.lootMul = lootMul;
  const boss = auth.authority.mobs.find((m) => m.boss);
  must(boss, "boss Timira ausente");
  boss.def = Object.assign({}, boss.def, { loot: loot });
  boss.hp = 1;
  const after = JSON.parse(
    engine.advanceAuthorityState(JSON.stringify(auth), 2000, 3000).state);
  return after.authority.players[0].p;
}

/* Raro max:1 com rate 2.5 + lootMul 1.25 → chance alta, qty continua 1. */
const rare = killWithLoot([
  { item: "giant-ruby", chance: 100, min: 1, max: 1 },
  { item: "piece-of-timira-s-sensors", chance: 40, min: 1, max: 1 },
], 1.25);
must((rare.rewardChest["giant-ruby"] || 0) === 1,
  "unique/rare não pode virar qty*rate (giant-ruby)");
must((rare.rewardChest["piece-of-timira-s-sensors"] || 0) <= 1,
  "semi-raro max:1 não pode empilhar por rate");

/* Stackable commons: qty ∈ [min,max], nunca max*2.5 (ex.: 14*2.5=35). */
const stack = killWithLoot([
  { item: "ultimate-mana-potion", chance: 100, min: 1, max: 14 },
  { item: "crystal-coin", chance: 100, min: 1, max: 6 },
], 1);
const ump = Number(stack.rewardChest["ultimate-mana-potion"]) || 0;
const coins = Number(stack.rewardChest["crystal-coin"]) || 0;
must(ump >= 1 && ump <= 14,
  "ultimate-mana-potion qty fora do range Canary/wiki (got " + ump + ")");
must(ump < 35, "regressão Timira: 14*2.5=35 ainda presente");
must(coins >= 1 && coins <= 6,
  "crystal-coin deve respeitar min-max, não *lootRate (got " + coins + ")");

/* Chance sobe com rate: item 20% × 2.5 deve dropar bem mais que ~20%. */
let hits = 0;
const trials = 40;
for (let i = 0; i < trials; i++) {
  const p = killWithLoot(
    [{ item: "giant-amethyst", chance: 20, min: 1, max: 1 }], 1);
  if ((p.rewardChest["giant-amethyst"] || 0) > 0) hits++;
}
must(hits >= 20,
  "rate 2.5x deveria elevar chance ~20%→50% (hits=" + hits + "/" + trials + ")");

/* Timira oficial: nenhum drop max:1 pode ultrapassar 1 por kill. */
const timiraLoot = (engine.MONSTERS["timira-the-many-headed"] || {}).loot || [];
must(timiraLoot.length >= 20, "loot Timira ausente no MONSTERS do motor");
const official = killWithLoot(timiraLoot, 1);
for (const entry of timiraLoot) {
  const max = Math.max(1, Number(entry.max) || 1);
  const got = Number(official.rewardChest[entry.item]) || 0;
  if (!got) continue;
  must(got <= max,
    "Timira " + entry.item + " qty " + got + " > max " + max + " (rate em quantidade?)");
}

console.log("OK: loot rate/prey/PvP elevam chance; qty respeita min-max (Timira-safe).");
