/* Exevo mas san (Divine Caldera): self AREA_CIRCLE3X3 — só castar com
 * monstro(s) dentro do círculo do caster. Longe (5+ SQM) → não seleciona.
 * Execute: node tibia-idle/tools/test_mas_san_self_range.js */
"use strict";
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const now = 200000;
function rpPlayer(overrides) {
  return Object.assign({
    id: 1, name: "RangeRP", voc: "paladin", level: 80, exp: 100000,
    hp: 99999, mp: 99999, gold: 10000, ml: 70,
    skills: { sword: 10, axe: 10, club: 10, dist: 90, fist: 10, shield: 10 },
    equip: {
      weapon: { item: "royal-crossbow" },
      shield: { item: "quiver" }
    },
    supplies: { "sudden-death-rune": 50, "diamond-arrow": 200 },
    lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: true, autoWalk: true, attackMode: "chase",
      attackSpells: ["exevo-mas-san", "exori-san"],
      combo: [
        { kind: "spell", id: "exevo-mas-san", min: 1 },
        { kind: "spell", id: "exori-san", min: 1 }
      ]
    }
  }, overrides || {});
}

function desc(p, mobs) {
  const member = { id: String(p.id), p: JSON.parse(JSON.stringify(p)) };
  return {
    v: 1, savedAt: now, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(p.id), members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: (mobs || []).map((m) => Object.assign({
        slug: "rat", hp: 5000, maxHp: 5000
      }, m)),
      events: []
    }
  };
}

const caldera = engine.ALL_SPELLS["exevo-mas-san"];
must(caldera, "exevo-mas-san ausente");
must(engine.SPELL_TARGET["exevo-mas-san"] && engine.SPELL_TARGET["exevo-mas-san"].self,
  "SPELLTARGET self:1 para mas san");
must(engine.SPELL_TARGET["exevo-mas-san"].areaNome === "AREA_CIRCLE3X3",
  "mas san AREA_CIRCLE3X3");

/* --- Alvo a 5+ SQM: mas san NÃO selecionada --- */
const farLive = engine.initializeAuthority(desc(rpPlayer(), [
  { id: "far", cx: 16, cy: 10 }
]), "c".repeat(64), now);
const farItem = farLive.authority.players[0];
farItem.cx = 10; farItem.cy = 10;
const farLiving = farLive.authority.mobs.filter((m) => m.hp > 0);
const farHits = engine.spellAreaTargets(farLive.authority, caldera, farItem,
  farLiving[0], farLiving);
must(farHits.length === 0, "alvo a 6 SQM nao pode estar na caldera, hits=" + farHits.length);

const farPick = engine.nextComboSpell(farLive.authority, farItem, farItem.p, now,
  farLiving[0], farLiving);
must(!(farPick && farPick.id === "exevo-mas-san"),
  "mas san selecionada com alvo fora: " + JSON.stringify(farPick && (farPick.id || farPick)));
must(farPick && farPick.id === "exori-san",
  "devia cair em divine missile / exori san, veio: " + JSON.stringify(farPick && (farPick.id || farPick)));

/* attackSpells sem combo: mesma regra */
const noComboP = rpPlayer({ config: {
  spellAttack: true, attackSpells: ["exevo-mas-san", "exori-san"], combo: []
}});
const far2 = engine.initializeAuthority(desc(noComboP, [{ id: "far2", cx: 17, cy: 10 }]),
  "d".repeat(64), now);
const far2Item = far2.authority.players[0];
far2Item.cx = 10; far2Item.cy = 10;
const far2Living = far2.authority.mobs;
const far2Pick = engine.nextComboSpell(far2.authority, far2Item, far2Item.p, now,
  far2Living[0], far2Living);
must(!(far2Pick && far2Pick.id === "exevo-mas-san"),
  "attackSpells: mas san fora de range: " + JSON.stringify(far2Pick && far2Pick.id));

/* --- 2+ mobs DENTRO do CIRCLE do caster: mas san OK --- */
const nearLive = engine.initializeAuthority(desc(rpPlayer(), [
  { id: "n0", cx: 11, cy: 10 },
  { id: "n1", cx: 10, cy: 11 },
  { id: "n2", cx: 9, cy: 10 }
]), "e".repeat(64), now);
const nearItem = nearLive.authority.players[0];
nearItem.cx = 10; nearItem.cy = 10;
const nearLiving = nearLive.authority.mobs.filter((m) => m.hp > 0);
const nearHits = engine.spellAreaTargets(nearLive.authority, caldera, nearItem,
  nearLiving[0], nearLiving);
must(nearHits.length >= 2,
  "caldera com pack adjacente deveria pegar 2+, pegou " + nearHits.length);

const nearPick = engine.nextComboSpell(nearLive.authority, nearItem, nearItem.p, now,
  nearLiving[0], nearLiving);
must(nearPick && nearPick.id === "exevo-mas-san",
  "pack no circulo: mas san permitida, veio: " + JSON.stringify(nearPick && (nearPick.id || nearPick)));

/* Pack denso longe: caminha / nao mas san ate o pack entrar no circulo */
const packFar = engine.initializeAuthority(desc(rpPlayer(), [
  { id: "p0", cx: 16, cy: 9 },
  { id: "p1", cx: 17, cy: 9 },
  { id: "p2", cx: 16, cy: 10 },
  { id: "p3", cx: 17, cy: 10 }
]), "f".repeat(64), now);
const packItem = packFar.authority.players[0];
packItem.cx = 10; packItem.cy = 10;
const packLiving = packFar.authority.mobs.filter((m) => m.hp > 0);
const packTarget = engine.authorityPlayerTarget(packFar.authority, packItem, packLiving);
const packHits = engine.spellAreaTargets(packFar.authority, caldera, packItem,
  packTarget, packLiving);
must(packHits.length === 0, "pack a 6+ SQM fora da caldera");
const packPick = engine.nextComboSpell(packFar.authority, packItem, packItem.p, now,
  packTarget, packLiving);
must(!(packPick && packPick.id === "exevo-mas-san"),
  "pack longe nao autoriza mas san: " + JSON.stringify(packPick && packPick.id));

/* Sibling self-AoE (Rage of the Skies) mesma regra */
const ue = engine.ALL_SPELLS["exevo-gran-mas-vis"];
must(ue && engine.SPELL_TARGET["exevo-gran-mas-vis"].self, "UE self");
const mage = Object.assign(rpPlayer({
  voc: "sorcerer",
  equip: { weapon: { item: "wand-of-dragonbreath" } },
  config: {
    spellAttack: true,
    attackSpells: ["exevo-gran-mas-vis", "exori-vis"],
    combo: [
      { kind: "spell", id: "exevo-gran-mas-vis", min: 1 },
      { kind: "spell", id: "exori-vis", min: 1 }
    ]
  }
}));
const ueFar = engine.initializeAuthority(desc(mage, [{ id: "uf", cx: 20, cy: 10 }]),
  "g".repeat(64), now);
const ueItem = ueFar.authority.players[0];
ueItem.cx = 10; ueItem.cy = 10;
const ueLiving = ueFar.authority.mobs;
const uePick = engine.nextComboSpell(ueFar.authority, ueItem, ueItem.p, now,
  ueLiving[0], ueLiving);
must(!(uePick && uePick.id === "exevo-gran-mas-vis"),
  "UE longe nao selecionada: " + JSON.stringify(uePick && uePick.id));

console.log("OK: mas san self-range gate (cliente/servidor alinhados via nextComboSpell)");
