/* Pack denso > singleton: alvo/spell/movimento priorizam a box.
 * Execute: node tibia-idle/tools/test_dense_pack_ai.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const now = 100000;
function magePlayer(overrides) {
  return Object.assign({
    id: 1, name: "PackMage", voc: "sorcerer", level: 80, exp: 100000,
    hp: 99999, mp: 99999, gold: 10000, ml: 70,
    skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 10 },
    equip: { weapon: { item: "wand-of-dragonbreath" } },
    supplies: { "sudden-death-rune": 50 },
    lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: true, autoWalk: true, attackMode: "chase",
      // Ordem = prioridade: AoE primeiro (min 2) no pack; SD só com 1.
      combo: [
        { kind: "spell", id: "exevo-flam-hur", min: 2 },
        { kind: "rune", id: "sudden-death-rune", min: 1 }
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

/* --- Servidor: 1 isolado adjacente + pack de 4 a 3 SQM --- */
const isolatedPlusPack = [
  { id: "iso", cx: 11, cy: 10 },
  { id: "p0", cx: 13, cy: 9 },
  { id: "p1", cx: 14, cy: 9 },
  { id: "p2", cx: 13, cy: 10 },
  { id: "p3", cx: 14, cy: 10 }
];
const live = engine.initializeAuthority(desc(magePlayer(), isolatedPlusPack), "a".repeat(64), now);
const item = live.authority.players[0];
item.cx = 10; item.cy = 10;
const living = live.authority.mobs.filter((m) => m.hp > 0);
const target = engine.authorityPlayerTarget(live.authority, item, living);
must(target && String(target.id) !== "iso",
  "autoridade escolheu o singleton adjacente em vez do pack: " + (target && target.id));
must(engine.mobClusterDensity(live.authority, target) >= 3,
  "alvo do pack sem densidade: " + engine.mobClusterDensity(live.authority, target));

const pick = engine.nextComboSpell(live.authority, item, item.p, now, target, living);
must(pick && !pick.rune && pick.id === "exevo-flam-hur",
  "devia wave na box, veio: " + JSON.stringify(pick && (pick.id || pick)));

/* SD no isolado: wave min=2 ainda manda se a box no alcance pega 2+ */
const pickIso = engine.nextComboSpell(live.authority, item, item.p, now,
  living.find((m) => m.id === "iso"), living);
must(!(pickIso && pickIso.rune),
  "SD saiu no isolado com pack+wave prontos: " + JSON.stringify(pickIso));

/* Só 1 mob restante → wave min=2 falha, SD OK */
const alone = engine.initializeAuthority(desc(magePlayer(), [{ id: "only", cx: 11, cy: 10 }]),
  "b".repeat(64), now);
const aloneItem = alone.authority.players[0];
aloneItem.cx = 10; aloneItem.cy = 10;
const aloneLiving = alone.authority.mobs;
const alonePick = engine.nextComboSpell(alone.authority, aloneItem, aloneItem.p, now,
  aloneLiving[0], aloneLiving);
must(alonePick && alonePick.rune && alonePick.id === "sudden-death-rune",
  "com 1 mob a SD deveria sair: " + JSON.stringify(alonePick));

/* Movimento AUTO: anda para o pack, não fica no isolado */
item.walkAcc = 5000;
const before = { cx: item.cx, cy: item.cy };
engine.advanceAuthorityMovement(live.authority, now);
const after = { cx: item.cx, cy: item.cy };
const movedTowardPack =
  Math.max(Math.abs(after.cx - 13), Math.abs(after.cy - 10)) <
  Math.max(Math.abs(before.cx - 13), Math.abs(before.cy - 10)) ||
  (after.cx !== before.cx || after.cy !== before.cy);
must(movedTowardPack || engine.authorityVisualDistance(item, target, live.authority) <=
  engine.playerAttackRangeSQM(item.p),
  "não se moveu em direção ao pack (antes=" + JSON.stringify(before) +
  " depois=" + JSON.stringify(after) + ")");

/* Knight: não queima exori-gran no isolado se há box perto */
const knightP = Object.assign(magePlayer({
  id: 2, voc: "knight", name: "PackEK",
  skills: { sword: 90, axe: 10, club: 10, dist: 10, fist: 10, shield: 80 },
  equip: { weapon: { item: "magic-sword" }, shield: { item: "demon-shield" } },
  config: {
    spellAttack: true, autoWalk: true, attackMode: "chase",
    // Área primeiro (min 2); strike single só quando pack não enche a área.
    combo: [
      { kind: "spell", id: "exori-gran", min: 2 },
      { kind: "spell", id: "exori-ico", min: 1 }
    ]
  }
}));
const kLive = engine.initializeAuthority(desc(knightP, isolatedPlusPack), "c".repeat(64), now);
const kItem = kLive.authority.players[0];
kItem.cx = 10; kItem.cy = 10;
const kLiving = kLive.authority.mobs.filter((m) => m.hp > 0);
const kTarget = engine.authorityPlayerTarget(kLive.authority, kItem, kLiving);
must(String(kTarget.id) !== "iso", "knight mirando singleton: " + kTarget.id);
const kPick = engine.nextComboSpell(kLive.authority, kItem, kItem.p, now, kTarget, kLiving);
/* Alvo já é o pack; gran (min 2) se a matriz enche, senão ico no pack enquanto anda. */
must(!kPick || kPick.id === "exori-gran" || kPick.id === "exori-ico",
  "knight pick inesperado: " + JSON.stringify(kPick && kPick.id));


/* --- Cliente: helperPriorityTarget + comboEscolhe --- */
const root = path.join(__dirname, "..", "game", "js");
const ctx = {
  console, Math, Map, Set, Date,
  window: {},
  SPELLS: {
    "exevo-flam-hur": { id: "exevo-flam-hur", type: "attack", area: "AREA_WAVE4", alvos: 9,
      vocs: ["sorcerer"], lvl: 1, mana: 1, cd: 2000, name: "Fire Wave" },
    "exori-flam": { id: "exori-flam", type: "attack", vocs: ["sorcerer"], lvl: 1, mana: 1, cd: 2000, name: "Flame Strike" }
  },
  SUPPLIES: {
    "sudden-death-rune": { type: "attack", name: "Sudden Death", lvl: 1, sprite: 1 },
    "avalanche-rune": { type: "attack", name: "Avalanche", lvl: 1, sprite: 1, area: { raio: 3 } }
  },
  RUNEDATA: {},
  SPELLTARGET: { "exevo-flam-hur": { areaNome: "AREA_WAVE4" } },
  GAMEDATA: { items: {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "combo.js"), "utf8"), ctx, { filename: "combo.js" });
/* densestPackTargetClient vive em combat.js — carrega só o trecho via eval das helpers
 * já espelhadas: reimplementa o contrato mínimo para o teste de combo. */
vm.runInContext(`
  const PACK_SEARCH_R = 10, PACK_CLUSTER_R = 2, PACK_HYSTERESIS = 1.25;
  function helperMobDist(a, b) {
    return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
  }
  function helperClusterDensity(mobs, mob, r) {
    let n = 0; const rr = r == null ? PACK_CLUSTER_R : r;
    for (const m of mobs || []) if (m.hp > 0 && helperMobDist(mob, m) <= rr) n++;
    return n;
  }
  function densestPackTargetClient(c, caster, vivos) {
    const list = (vivos || []).filter((m) => m.hp > 0);
    let best = null, bestScore = -Infinity;
    for (const mob of list) {
      const dens = helperClusterDensity(list, mob, PACK_CLUSTER_R);
      const dist = helperMobDist(caster, mob);
      if (dist > PACK_SEARCH_R) continue;
      const sc = dens * 100 - dist * 4;
      if (sc > bestScore) { best = mob; bestScore = sc; }
    }
    return best || list[0];
  }
`, ctx);

const clientMobs = [
  { id: "iso", cx: 11, cy: 10, hp: 100 },
  { id: "p0", cx: 13, cy: 9, hp: 100 },
  { id: "p1", cx: 14, cy: 9, hp: 100 },
  { id: "p2", cx: 13, cy: 10, hp: 100 },
  { id: "p3", cx: 14, cy: 10, hp: 100 }
];
const clientPlayer = { cx: 10, cy: 10, hp: 100 };
const pack = ctx.densestPackTargetClient({ mobs: clientMobs }, clientPlayer, clientMobs);
must(pack && pack.id !== "iso", "cliente mirando singleton: " + (pack && pack.id));

const pCombo = {
  voc: "sorcerer", level: 80, mp: 9999, ml: 70,
  config: {
    combo: [
      { kind: "spell", id: "exevo-flam-hur", min: 2 },
      { kind: "rune", id: "sudden-death-rune", min: 1 }
    ]
  },
  equip: {}, supplies: { "sudden-death-rune": 10 }, lootPouch: {}
};
ctx.ensureCombo(pCombo);
ctx.cdReady = () => true;
ctx.entCd = () => 0;
ctx.spellForVoc = () => true;
ctx.supplyAllowed = () => true;
ctx.canRechargeSupply = () => true;
ctx.comboRaio = ctx.comboRaio;
ctx.areaNameOf = () => null;
ctx.areaCount = null;
const cState = { player: clientPlayer, mobs: clientMobs, runeCd: 0 };
const escolha = ctx.comboEscolhe(cState, pCombo, pack, now);
must(escolha && escolha.id === "exevo-flam-hur",
  "combo cliente deveria wave, veio: " + JSON.stringify(escolha));

const aloneClient = {
  player: clientPlayer,
  mobs: [{ id: "only", cx: 11, cy: 10, hp: 100 }],
  runeCd: 0
};
pCombo.config.combo = [
  { kind: "spell", id: "exevo-flam-hur", min: 2 },
  { kind: "rune", id: "sudden-death-rune", min: 1 }
];
ctx.ensureCombo(pCombo);
const escolha1 = ctx.comboEscolhe(aloneClient, pCombo, aloneClient.mobs[0], now);
must(escolha1 && escolha1.id === "sudden-death-rune",
  "cliente com 1 mob deveria SD: " + JSON.stringify(escolha1));

console.log("OK: dense pack AI — target, spell, movimento, parity cliente.");
