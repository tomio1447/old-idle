/* Auditoria de potions: valores Canary, CD compartilhado 1s, spirit, utamo+mana. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* ---- tabela Canary (potions.lua main) + 15.25 distilled ---- */
const CANARY_AMOUNTS = {
  "small-health-potion": { hp: [60, 90] },
  "health-potion": { hp: [125, 175] },
  "strong-health-potion": { hp: [250, 350] },
  "great-health-potion": { hp: [425, 575] },
  "ultimate-health-potion": { hp: [650, 850] },
  "supreme-health-potion": { hp: [875, 1125] },
  "mana-potion": { mp: [75, 125] },
  "strong-mana-potion": { mp: [115, 185] },
  "great-mana-potion": { mp: [150, 250] },
  "superior-mana-potion": { mp: [240, 360], lvl: 100 },
  "ultimate-mana-potion": { mp: [425, 575] },
  "distilled-superior-mana-potion": { mp: [240, 360], lvl: 130 },
  "distilled-ultimate-mana-potion": { mp: [425, 575], lvl: 200 },
  "great-spirit-potion": { hp: [250, 350], mp: [100, 200] },
  "ultimate-spirit-potion": { hp: [420, 580], mp: [250, 350] },
};

const supplyCtx = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../game/js/supplydata.js"), "utf8"),
  supplyCtx
);
const raw = supplyCtx.window.SUPPLYDATA.potions;
for (const [slug, expect] of Object.entries(CANARY_AMOUNTS)) {
  const pot = raw[slug] || (slug.indexOf("distilled") === 0 || slug === "superior-mana-potion"
    ? null : null);
  // supplydata + patches do engine: conferir via drink real abaixo para 15.25
  if (raw[slug]) {
    if (expect.hp) must(raw[slug].hp[0] === expect.hp[0] && raw[slug].hp[1] === expect.hp[1],
      slug + " HP Canary mismatch " + JSON.stringify(raw[slug].hp));
    if (expect.mp && raw[slug].mp) must(raw[slug].mp[0] === expect.mp[0] && raw[slug].mp[1] === expect.mp[1],
      slug + " MP Canary mismatch " + JSON.stringify(raw[slug].mp));
  }
}
console.log("OK: supplydata Canary amounts (HP/mana/spirit)");

const suppliesSrc = fs.readFileSync(path.join(__dirname, "../game/js/supplies.js"), "utf8");
must(suppliesSrc.includes('lvl: 130') && suppliesSrc.includes("distilled-superior-mana-potion"),
  "distilled superior sem lvl 130 no client");
must(fs.readFileSync(path.join(__dirname, "../server/authoritative_engine.js"), "utf8")
  .includes("POTION_CD_MS=1000"), "POTION_CD_MS ausente no engine");

function desc(p) {
  const member = { id: String(p.id), p: clone(p) };
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(p.id), members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: [{ id: "rat-1", slug: "rat", hp: 999999, maxHp: 999999, damage: 0,
        cx: 12, cy: 10, x: 12.5 / 30, y: 12.5 / 30 }],
      events: [],
    },
  };
}
function silence(auth) {
  for (const mob of auth.authority.mobs || []) {
    mob.damage = 0; mob.attackSpeed = Number.MAX_SAFE_INTEGER; mob.attackAcc = 0;
  }
}
function advance(auth, ms, clock) {
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth), ms, clock).state);
}

/* 1) CD compartilhado: HP bloqueia mana no mesmo segundo */
{
  const max = engine.maxStats({ voc: "knight", level: 200, equip: {} });
  const p = {
    id: 1, name: "K", voc: "knight", level: 200, exp: engine.expForLevel(200),
    hp: Math.floor(max.hp * 0.2), mp: Math.floor(max.mp * 0.1), gold: 1e6, ml: 10,
    skills: { sword: 80, axe: 10, club: 10, dist: 10, fist: 10, shield: 70 },
    equip: { weapon: { item: "sword" } },
    supplies: { "supreme-health-potion": 5, "great-mana-potion": 5 },
    lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: false, noHealthPotions: false, noManaPotions: false,
      healItemAt: 90, manaAt: 90, healSpellAt: 5,
      healSupply: "supreme-health-potion", manaSupply: "great-mana-potion",
    },
  };
  const start = engine.initializeAuthority(desc(p), "a".repeat(64), 1000);
  silence(start);
  const afterHp = advance(start, 200, 1200);
  const q = afterHp.authority.players[0].p;
  must(q.supplies["supreme-health-potion"] === 4, "HP potion não bebeu");
  must(q.supplies["great-mana-potion"] === 5, "mana bebeu durante CD de HP");
  must(q._potionCd > 1200, "potionCd 1s não setado");

  // HP acima do limiar → mana pode beber após CD
  q.hp = engine.maxStats(q).hp;
  q.config.noHealthPotions = true;
  const afterMana = advance(afterHp, 1200, 2400);
  const r = afterMana.authority.players[0].p;
  must(r.supplies["great-mana-potion"] === 4, "mana não bebeu após CD");
  console.log("OK: CD compartilhado 1s (HP bloqueia mana; após CD mana bebe)");
}

/* 2) Spirit restaura HP + MP no mesmo gole */
{
  const max = engine.maxStats({ voc: "paladin", level: 130, equip: {} });
  const p = {
    id: 2, name: "RP", voc: "paladin", level: 130, exp: engine.expForLevel(130),
    hp: Math.floor(max.hp * 0.3), mp: Math.floor(max.mp * 0.3), gold: 1e6, ml: 40,
    skills: { sword: 10, axe: 10, club: 10, dist: 80, fist: 10, shield: 40 },
    equip: { weapon: { item: "bow" } },
    supplies: { "ultimate-spirit-potion": 3 }, lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: false, noHealthPotions: false, noManaPotions: true,
      healItemAt: 90, manaAt: 10, healSpellAt: 5,
      healSupply: "ultimate-spirit-potion", manaSupply: "",
    },
  };
  const start = engine.initializeAuthority(desc(p), "b".repeat(64), 1000);
  silence(start);
  const pl = start.authority.players[0].p;
  const hp0 = pl.hp, mp0 = pl.mp;
  const after = advance(start, 500, 1500);
  const q = after.authority.players[0].p;
  must(q.supplies["ultimate-spirit-potion"] === 2, "spirit não consumiu carga");
  must(q.hp > hp0, "spirit não curou HP");
  must(q.mp > mp0, "spirit não restaurou MP");
  const dHp = q.hp - hp0, dMp = q.mp - mp0;
  must(dHp >= 420 && dHp <= 580, "spirit HP fora da faixa Canary: " + dHp);
  must(dMp >= 250 && dMp <= 350, "spirit MP fora da faixa Canary: " + dMp);
  console.log("OK: ultimate spirit restaura HP+MP (faixas Canary)");
}

/* 3) Magic shield NÃO bloqueia mana potion */
{
  const max = engine.maxStats({ voc: "sorcerer", level: 200, equip: {} });
  const p = {
    id: 3, name: "MS", voc: "sorcerer", level: 200, exp: engine.expForLevel(200),
    hp: max.hp, mp: Math.floor(max.mp * 0.05), gold: 5e5, ml: 80,
    skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 20 },
    equip: { weapon: { item: "wand-of-vortex" } },
    supplies: { "ultimate-mana-potion": 4 }, lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: false, noHealthPotions: true, noManaPotions: false,
      healItemAt: 10, manaAt: 50, manaSupply: "ultimate-mana-potion",
      magicShield: { mode: "always", useSpell: true, usePotion: false },
    },
  };
  const start = engine.initializeAuthority(desc(p), "c".repeat(64), 1000);
  silence(start);
  const pl = start.authority.players[0].p;
  pl.magicShieldCap = 8000; pl.magicShieldPool = 8000;
  pl.magicShieldUntil = 1000 + 60000; pl.magicShieldFrom = "spell";
  pl.mp = Math.floor(engine.maxStats(pl).mp * 0.05);
  const mp0 = pl.mp, pool0 = pl.magicShieldPool, stock0 = pl.supplies["ultimate-mana-potion"];
  const after = advance(start, 1500, 2500);
  const q = after.authority.players[0].p;
  must(q.mp > mp0, "utamo bloqueou mana potion");
  must(q.magicShieldPool === pool0, "mana potion alterou pool do shield");
  must(q.supplies["ultimate-mana-potion"] < stock0, "UMP não baixou carga");
  console.log("OK: magic shield + mana potion (mana sobe, pool intacta)");
}

/* 4) Distilled superior exige nv 130 (knight 120 não bebe; 130 bebe) */
{
  function ek(level) {
    const max = engine.maxStats({ voc: "knight", level, equip: {} });
    return {
      id: level, name: "EK" + level, voc: "knight", level, exp: engine.expForLevel(level),
      hp: max.hp, mp: Math.floor(max.mp * 0.05), gold: 1e6, ml: 10,
      skills: { sword: 80, axe: 10, club: 10, dist: 10, fist: 10, shield: 70 },
      equip: { weapon: { item: "sword" } },
      supplies: { "distilled-superior-mana-potion": 3 }, lootPouch: {}, kills: {}, bosses: {},
      config: {
        spellAttack: false, noHealthPotions: true, noManaPotions: false,
        healItemAt: 10, manaAt: 90, manaSupply: "distilled-superior-mana-potion",
      },
    };
  }
  const low = engine.initializeAuthority(desc(ek(120)), "d".repeat(64), 1000);
  silence(low);
  const afterLow = advance(low, 500, 1500);
  must(afterLow.authority.players[0].p.supplies["distilled-superior-mana-potion"] === 3,
    "EK 120 bebeu distilled superior (deveria exigir 130)");
  const hi = engine.initializeAuthority(desc(ek(130)), "e".repeat(64), 1000);
  silence(hi);
  const afterHi = advance(hi, 500, 1500);
  must(afterHi.authority.players[0].p.supplies["distilled-superior-mana-potion"] === 2,
    "EK 130 não bebeu distilled superior");
  console.log("OK: distilled superior lvl 130");
}

/* 5) Morto não bebe potion */
{
  const max = engine.maxStats({ voc: "knight", level: 80, equip: {} });
  const p = {
    id: 5, name: "Dead", voc: "knight", level: 80, exp: engine.expForLevel(80),
    hp: 0, mp: 10, gold: 1e6, ml: 10,
    skills: { sword: 50, axe: 10, club: 10, dist: 10, fist: 10, shield: 40 },
    equip: { weapon: { item: "sword" } },
    supplies: { "great-health-potion": 5, "great-mana-potion": 5 },
    lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: false, healItemAt: 99, manaAt: 99,
      healSupply: "great-health-potion", manaSupply: "great-mana-potion",
    },
  };
  const start = engine.initializeAuthority(desc(p), "f".repeat(64), 1000);
  silence(start);
  start.authority.players[0].p.hp = 0;
  start.authority.players[0].downUntil = 1000 + 30000;
  const after = advance(start, 500, 1500);
  const q = after.authority.players[0].p;
  must(q.supplies["great-health-potion"] === 5, "morto bebeu HP potion");
  must(q.supplies["great-mana-potion"] === 5, "morto bebeu mana potion");
  console.log("OK: morto/down não consome potion");
}

/* 6) Soft boots / energy ring NÃO usam potionCd (regressão estrutural) */
{
  const combat = fs.readFileSync(path.join(__dirname, "../game/js/combat.js"), "utf8");
  const acc = fs.readFileSync(path.join(__dirname, "../game/js/accessories.js"), "utf8");
  must(!/soft-boots[\s\S]{0,200}potionCd/.test(combat + acc),
    "soft boots amarrados a potionCd");
  must(acc.includes("MAGIC_SHIELD_POTION_CD_MS"), "magic shield potion sem CD próprio");
  console.log("OK: soft boots/rings ≠ potions; MS potion CD próprio");
}

console.log("OK: test_potions passou");
