/* Mage mana helper online: utamo vita NÃO bloqueia potion; auto-buy com gold;
 * noManaPotions respeitado; EK/fallback de mana intacto. */
"use strict";
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

function desc(p, extra) {
  const member = { id: String(p.id), p: clone(p) };
  return Object.assign({
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(p.id), members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: [{
        id: "rat-1", slug: "rat", hp: 999999, maxHp: 999999, damage: 0,
        cx: 12, cy: 10, x: 12.5 / 30, y: 12.5 / 30,
      }],
      events: [],
    },
  }, extra || {});
}
function silence(auth) {
  for (const mob of auth.authority.mobs || []) {
    mob.damage = 0;
    mob.attackSpeed = Number.MAX_SAFE_INTEGER;
    mob.attackAcc = 0;
  }
}
function advance(auth, ms, clock) {
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth), ms, clock).state);
}

const mageMax = engine.maxStats({ voc: "sorcerer", level: 200, equip: {} });
const mageBase = {
  id: 10, name: "SorcMana", voc: "sorcerer", level: 200, exp: engine.expForLevel(200),
  hp: mageMax.hp, mp: Math.floor(mageMax.mp * 0.05), gold: 500000, ml: 80,
  skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 20 },
  equip: { weapon: { item: "wand-of-vortex" } },
  supplies: { "ultimate-mana-potion": 5 }, lootPouch: {}, kills: {}, bosses: {},
  magicShieldUntil: 0, magicShieldPool: 0, magicShieldCap: 0,
  config: {
    spellAttack: false, noHealthPotions: true, noManaPotions: false,
    healItemAt: 10, manaAt: 50, healSupply: "",
    manaSupply: "ultimate-mana-potion",
    magicShield: { mode: "always", useSpell: true, usePotion: false },
  },
};

/* 1) Utamo vita ativo + mana < 50% + cargas → bebe e sobe mana; pool intacta */
{
  const p = clone(mageBase);
  const start = engine.initializeAuthority(desc(p), "a".repeat(64), 1000);
  silence(start);
  const pl = start.authority.players[0].p;
  const now = 1000;
  const cap = 8000;
  pl.magicShieldCap = cap;
  pl.magicShieldPool = cap;
  pl.magicShieldUntil = now + 60000;
  pl.magicShieldFrom = "spell";
  pl.mp = Math.floor(engine.maxStats(pl).mp * 0.05);
  const mpBefore = pl.mp;
  const poolBefore = pl.magicShieldPool;
  const stockBefore = pl.supplies["ultimate-mana-potion"];
  const after = advance(start, 1500, 2500);
  const q = after.authority.players[0].p;
  const stats = after.authority.stats || {};
  must(q.mp > mpBefore, "mage com utamo NÃO bebeu mana potion (mp intacto)");
  must(q.magicShieldPool === poolBefore, "potion alterou a pool do magic shield");
  must((q.supplies["ultimate-mana-potion"] || 0) < stockBefore, "cargas de UMP não baixaram");
  must((stats.supplyUsed && stats.supplyUsed["ultimate-mana-potion"]) >= 1,
    "supplyUsed não registrou UMP");
  console.log("OK: utamo ativo + UMP → bebe, mana sobe, pool intacta");
}

/* 2) Cargas 0 + gold → auto-buy então bebe */
{
  const p = clone(mageBase);
  p.supplies = { "ultimate-mana-potion": 0 };
  p.gold = 200000;
  const start = engine.initializeAuthority(desc(p), "b".repeat(64), 1000);
  silence(start);
  const pl = start.authority.players[0].p;
  pl.mp = Math.floor(engine.maxStats(pl).mp * 0.05);
  const goldBefore = pl.gold;
  const mpBefore = pl.mp;
  const after = advance(start, 1500, 2500);
  const q = after.authority.players[0].p;
  const stats = after.authority.stats || {};
  must(q.mp > mpBefore, "auto-buy não bebeu mana (mp intacto)");
  must(q.gold < goldBefore, "auto-buy não gastou gold");
  must((stats.supplyBought && stats.supplyBought["ultimate-mana-potion"]) >= 1 ||
       (stats.supplyUsed && stats.supplyUsed["ultimate-mana-potion"]) >= 1,
    "auto-buy/uso de UMP não contabilizado");
  console.log("OK: CARGAS 0 + gold → restock e bebe");
}

/* 3) Helper potions OFF → não bebe (regen passiva de vocação pode subir 1–2 mp) */
{
  const p = clone(mageBase);
  p.config = Object.assign({}, p.config, { noManaPotions: true, magicShield: { mode: "off" } });
  const start = engine.initializeAuthority(desc(p), "c".repeat(64), 1000);
  silence(start);
  const pl = start.authority.players[0].p;
  pl.mp = Math.floor(engine.maxStats(pl).mp * 0.05);
  const mpBefore = pl.mp;
  const stockBefore = pl.supplies["ultimate-mana-potion"];
  const after = advance(start, 1500, 2500);
  const q = after.authority.players[0].p;
  const stats = after.authority.stats || {};
  must((q.supplies["ultimate-mana-potion"] || 0) === stockBefore,
    "noManaPotions=true consumiu carga");
  must(!(stats.supplyUsed && stats.supplyUsed["ultimate-mana-potion"]),
    "noManaPotions=true registrou supplyUsed de mana");
  // regen de vocação (~2 mp/2s) pode subir um pouco; potion UMP sobe 425+
  must(q.mp < mpBefore + 50, "noManaPotions=true ainda bebeu potion (mp saltou)");
  console.log("OK: noManaPotions desliga o helper");
}

/* 4) EK com great mana potion (path de knight) ainda funciona */
{
  const ekMax = engine.maxStats({ voc: "knight", level: 200, equip: {} });
  const ek = {
    id: 11, name: "KinaMana", voc: "knight", level: 200, exp: engine.expForLevel(200),
    hp: ekMax.hp, mp: Math.floor(ekMax.mp * 0.1), gold: 80000, ml: 10,
    skills: { sword: 80, axe: 10, club: 10, dist: 10, fist: 10, shield: 70 },
    equip: { weapon: { item: "sword" } },
    supplies: {}, lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: false, noHealthPotions: true, noManaPotions: false,
      healItemAt: 10, manaAt: 80, healSupply: "", manaSupply: "great-mana-potion",
    },
  };
  const start = engine.initializeAuthority(desc(ek), "d".repeat(64), 1000);
  silence(start);
  const after = advance(start, 2000, 3000);
  const stats = after.authority.stats || {};
  must((stats.supplyUsed && stats.supplyUsed["great-mana-potion"]) >= 1,
    "EK não bebeu great mana potion após o fix de mage");
  console.log("OK: EK mana potion path intacto");
}

console.log("OK: test_mage_mana_helper passou");
