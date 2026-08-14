/* Magic Shield Potion (Canary 35563) + CDs de potion/cura/grupos no motor. */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const accessories = fs.readFileSync(path.join(__dirname, "../game/js/accessories.js"), "utf8");
must(accessories.includes("MAGIC_SHIELD_POTION_COST = 50000"), "custo 50k ausente no helper");
must(accessories.includes("MAGIC_SHIELD_POTION_CD_MS = 15 * 1000"), "CD 15s ausente no helper");
must(accessories.includes("ms-use-potion") && accessories.includes("ms-drink-potion"),
  "aba Escudo Mágico sem a Magic Shield Potion");
must(accessories.includes("tryMagicShieldPotion"), "auto-uso da potion ausente");

const combat = fs.readFileSync(path.join(__dirname, "../game/js/combat.js"), "utf8");
must(combat.includes('entCdSet(c, p, "potionCd", now + 1000)'), "potions de HP/mana não compartilham 1s");
must(combat.includes("healCd"), "cura não tem healCd de 1s");

function player(overrides) {
  return Object.assign({
    id: 1, name: "Mage", voc: "sorcerer", level: 50, exp: engine.expForLevel(50),
    hp: 400, mp: 800, gold: 120000, ml: 40,
    skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 10 },
    equip: { weapon: { item: "wand-of-vortex" } },
    supplies: { "health-potion": 8, "mana-potion": 8 }, lootPouch: {}, kills: {}, bosses: {},
    config: {
      magicShield: { mode: "always", usePotion: true },
      healSpell: "exura", healSpellAt: 90, healItemAt: 40, manaAt: 10,
      spellAttack: false, noHealthPotions: false, noManaPotions: false,
      healSupply: "health-potion", manaSupply: "mana-potion",
    },
  }, overrides || {});
}
function desc(p) {
  const member = { id: String(p.id), p: JSON.parse(JSON.stringify(p)) };
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(p.id), members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: [{ id: "rat-1", slug: "rat", hp: 999999, maxHp: 999999, damage: 0, cx: 12, cy: 10, x: 12.5 / 30, y: 12.5 / 30 }],
      events: [],
    },
  };
}
function silence(auth) {
  for (const mob of auth.authority.mobs || []) {
    mob.damage = 0; mob.attackSpeed = Number.MAX_SAFE_INTEGER; mob.attackAcc = 0;
  }
}

const first = engine.initializeAuthority(desc(player()), "a".repeat(64), 1000);
silence(first);
const afterSpell = JSON.parse(engine.advanceAuthorityState(JSON.stringify(first), 1000, 2000).state);
const sp = afterSpell.authority.players[0].p;
must(sp.magicShieldPool > 0 && sp.magicShieldFrom === "spell", "utamo vita não ativou o shield");
must(sp.gold === 120000, "potion cobrou ouro no cast da magia");
must(sp._spellCd && sp._spellCd["utamo-vita"] > 2000, "CD 14s do utamo vita não começou");
must(!(sp._potionCd > 2000), "utamo vita travou o potionCd de 1s");
const supportLocked = sp._groupCd && Object.keys(sp._groupCd).some((g) => Number(g) === 3 && sp._groupCd[g] > 2000);
must(supportLocked, "utamo vita não travou o grupo Support (2s)");

sp.magicShieldPool = 0; sp.magicShieldUntil = 0; sp.magicShieldFrom = "";
sp.hp = engine.maxStats(sp).hp;
const afterPotion = JSON.parse(engine.advanceAuthorityState(JSON.stringify(afterSpell), 1000, 3000).state);
const pp = afterPotion.authority.players[0].p;
must(sp.gold - pp.gold >= 49980 && sp.gold - pp.gold <= 50020,
  "potion não cobrou 50k (gold " + sp.gold + "->" + pp.gold + ")");
must(pp.magicShieldPool > 0 && pp.magicShieldFrom === "potion", "potion não forçou o shield com o utamo em CD");
must(pp.magicShieldPotionUntil > 3000, "CD 15s da potion não começou");
must(pp._spellCd && pp._spellCd["utamo-vita"] > 3000, "potion resetou o CD do utamo vita");
must(!(pp._potionCd > 3000), "Magic Shield Potion entrou no exhaustion de 1s das potions");
must((pp._groupCd && pp._groupCd["3"] || 0) <= 4000, "potion estendeu o grupo Support");

const goldBefore = pp.gold;
pp.magicShieldPool = 0; pp.magicShieldUntil = 0;
const afterCd = JSON.parse(engine.advanceAuthorityState(JSON.stringify(afterPotion), 1000, 4000).state);
const blocked = afterCd.authority.players[0].p;
must(blocked.gold > goldBefore - 1000, "potion bebeu de novo dentro dos 15s (gold " + goldBefore + "->" + blocked.gold + ")");

const potPlayer = player({ gold: 100000, config: {
  magicShield: { mode: "off", usePotion: false },
  healSpellAt: 10, healItemAt: 90, healSupply: "health-potion", spellAttack: false,
  noHealthPotions: false,
}});
const potAuth = engine.initializeAuthority(desc(potPlayer), "b".repeat(64), 1000);
silence(potAuth);
potAuth.authority.players[0].p.hp = Math.floor(engine.maxStats(potAuth.authority.players[0].p).hp * 0.2);
const afterHp = JSON.parse(engine.advanceAuthorityState(JSON.stringify(potAuth), 1000, 2000).state);
const hpP = afterHp.authority.players[0].p;
must(hpP.supplies["health-potion"] === 7, "health potion não foi bebida (left=" + hpP.supplies["health-potion"] + ")");
must(hpP._potionCd > 2000, "potion de HP não travou o potionCd de 1s");
must(hpP.gold === 100000, "potion de HP cobrou ouro da Magic Shield Potion");

const knight = engine.initializeAuthority(desc(player({ voc: "knight", gold: 100000,
  config: { magicShield: { mode: "always", usePotion: true, forceOnce: true }, spellAttack: false } })),
  "c".repeat(64), 1000);
silence(knight);
const afterK = JSON.parse(engine.advanceAuthorityState(JSON.stringify(knight), 1000, 2000).state);
must(afterK.authority.players[0].p.gold === 100000, "knight bebeu Magic Shield Potion");

console.log("OK: Magic Shield Potion 50k/15s, independente do utamo vita, do grupo Support e do potionCd de 1s.");
