/* Strong Ethereal Spear + Ethereal Spear (#1/#2 single-target) must fire
 * even in a dense pack. Regression: preferPack used to skip all non-AoE
 * slots; min>1 on ST also made isMulti artificial so hits=1 never passed.
 * Execute: node tibia-idle/tools/test_gran_con_combo_priority.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const now = 100000;

function rpPlayer(combo) {
  return {
    id: 1, name: "Pally", voc: "paladin", level: 574, exp: 1e12,
    hp: 99999, mp: 99999, gold: 10000, ml: 40,
    skills: { sword: 10, axe: 10, club: 10, dist: 120, fist: 10, shield: 10 },
    equip: { weapon: { item: "umbral-master-crossbow" }, shield: { item: "quiver" },
      ammo: { item: "diamond-arrow" } },
    supplies: {}, lootPouch: {}, kills: {}, bosses: {},
    config: {
      spellAttack: true, autoWalk: true, attackMode: "chase",
      combo: combo || [
        { kind: "spell", id: "exori-gran-con", min: 1 },
        { kind: "spell", id: "exevo-mas-san", min: 1 },
        { kind: "spell", id: "exevo-dir-moe", min: 1 },
        { kind: "spell", id: "exevo-dir-san", min: 1 }
      ]
    }
  };
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

const pack = [
  { id: "gb0", cx: 11, cy: 10 },
  { id: "gb1", cx: 12, cy: 10 },
  { id: "gb2", cx: 11, cy: 11 },
  { id: "gb3", cx: 12, cy: 11 }
];

/* --- Missile: diamond arrow + ethereal spear strips --- */
must(engine.playerWeaponProfile({
  equip: { weapon: { item: "bow" }, shield: { item: "quiver" }, ammo: { item: "diamond-arrow" } }
}).missile === "diamond-arrow", "diamond arrow profile missile");
must(engine.spellVisual(engine.ALL_SPELLS["exori-con"]).missile === "ethereal-spear",
  "exori con deve usar ethereal-spear, nao spear de madeira");
must(engine.spellVisual(engine.ALL_SPELLS["exori-gran-con"]).missile === "ethereal-spear",
  "exori gran con deve usar ethereal-spear");

/* Servidor: pack de 4 — #1 gran con deve sair (não só AoE). */
const live = engine.initializeAuthority(desc(rpPlayer(), pack), "a".repeat(64), now);
const item = live.authority.players[0];
item.cx = 10; item.cy = 10;
const living = live.authority.mobs.filter((m) => m.hp > 0);
const target = engine.authorityPlayerTarget(live.authority, item, living);
must(target && target.hp > 0, "sem alvo no pack");
const pick = engine.nextComboSpell(live.authority, item, item.p, now, target, living);
must(pick && !pick.rune && pick.id === "exori-gran-con",
  "servidor deveria lançar #1 gran con no pack, veio: " + JSON.stringify(pick && (pick.id || pick)));

/* AoE em CD / indisponível: gran con continua #1 */
item.p._spellCd = {
  "exevo-mas-san": now + 99999,
  "exevo-dir-moe": now + 99999,
  "exevo-dir-san": now + 99999
};
const pick2 = engine.nextComboSpell(live.authority, item, item.p, now, target, living);
must(pick2 && pick2.id === "exori-gran-con",
  "com AoE em CD ainda deveria gran con: " + JSON.stringify(pick2 && pick2.id));

/* exori-con #1 no pack (2+ monstros) */
const liveCon = engine.initializeAuthority(desc(rpPlayer([
  { kind: "spell", id: "exori-con", min: 1 },
  { kind: "spell", id: "exevo-mas-san", min: 1 },
  { kind: "spell", id: "exevo-dir-moe", min: 1 }
]), pack), "b".repeat(64), now);
const itemCon = liveCon.authority.players[0];
itemCon.cx = 10; itemCon.cy = 10;
const livingCon = liveCon.authority.mobs.filter((m) => m.hp > 0);
const targetCon = engine.authorityPlayerTarget(liveCon.authority, itemCon, livingCon);
const pickCon = engine.nextComboSpell(liveCon.authority, itemCon, itemCon.p, now, targetCon, livingCon);
must(pickCon && pickCon.id === "exori-con",
  "exori-con #1 no pack: " + JSON.stringify(pickCon && pickCon.id));

/* gran-con #1, exori-con #2: apos gran em CD, exori-con preenche (nao so AoE) */
const liveFill = engine.initializeAuthority(desc(rpPlayer([
  { kind: "spell", id: "exori-gran-con", min: 1 },
  { kind: "spell", id: "exori-con", min: 1 },
  { kind: "spell", id: "exevo-mas-san", min: 1 },
  { kind: "spell", id: "exevo-dir-moe", min: 1 }
]), pack), "c".repeat(64), now);
const itemFill = liveFill.authority.players[0];
itemFill.cx = 10; itemFill.cy = 10;
itemFill.p._spellCd = { "exori-gran-con": now + 99999 };
const livingFill = liveFill.authority.mobs.filter((m) => m.hp > 0);
const targetFill = engine.authorityPlayerTarget(liveFill.authority, itemFill, livingFill);
const pickFill = engine.nextComboSpell(liveFill.authority, itemFill, itemFill.p, now, targetFill, livingFill);
must(pickFill && pickFill.id === "exori-con",
  "filler exori-con com gran em CD: " + JSON.stringify(pickFill && pickFill.id));

/* ST com min=2 legado NAO pode sumir (hits ST=1); sanitize/clamp */
const liveMin = engine.initializeAuthority(desc(rpPlayer([
  { kind: "spell", id: "exori-con", min: 2 },
  { kind: "spell", id: "exevo-mas-san", min: 1 }
]), pack), "d".repeat(64), now);
const itemMin = liveMin.authority.players[0];
itemMin.cx = 10; itemMin.cy = 10;
itemMin.p.config.combo = engine.sanitizeCombo(itemMin.p.config.combo, "paladin");
must(itemMin.p.config.combo[0] && itemMin.p.config.combo[0].min === 1,
  "sanitizeCombo deve forçar min=1 em ST");
const livingMin = liveMin.authority.mobs.filter((m) => m.hp > 0);
const targetMin = engine.authorityPlayerTarget(liveMin.authority, itemMin, livingMin);
const pickMin = engine.nextComboSpell(liveMin.authority, itemMin, itemMin.p, now, targetMin, livingMin);
must(pickMin && pickMin.id === "exori-con",
  "exori-con com min legado 2 ainda deve sair apos sanitize: " +
  JSON.stringify(pickMin && pickMin.id));

/* Knight ST (exori-ico) no pack tambem */
const kLive = engine.initializeAuthority(desc(Object.assign(rpPlayer([
  { kind: "spell", id: "exori-ico", min: 1 },
  { kind: "spell", id: "exori-gran", min: 2 }
]), {
  voc: "knight", name: "EK",
  skills: { sword: 90, axe: 10, club: 10, dist: 10, fist: 10, shield: 80 },
  equip: { weapon: { item: "magic-sword" }, shield: { item: "demon-shield" } }
}), pack), "e".repeat(64), now);
const kItem = kLive.authority.players[0];
kItem.cx = 10; kItem.cy = 10;
const kLiving = kLive.authority.mobs.filter((m) => m.hp > 0);
const kTarget = engine.authorityPlayerTarget(kLive.authority, kItem, kLiving);
const kPick = engine.nextComboSpell(kLive.authority, kItem, kItem.p, now, kTarget, kLiving);
must(kPick && kPick.id === "exori-ico",
  "knight ST #1 no pack: " + JSON.stringify(kPick && kPick.id));

/* Cliente: comboEscolhe com a mesma rotação */
const root = path.join(__dirname, "..", "game", "js");
const ctx = {
  console, Math, Map, Set, Date,
  window: {},
  SPELLS: {
    "exori-con": {
      id: "exori-con", type: "attack", vocs: ["paladin"], lvl: 23, mana: 25,
      cd: 2000, name: "Ethereal Spear", range: 7, needTarget: true
    },
    "exori-gran-con": {
      id: "exori-gran-con", type: "attack", vocs: ["paladin"], lvl: 90, mana: 55,
      cd: 8000, name: "Strong Ethereal Spear", range: 7, needTarget: true
    },
    "exevo-mas-san": {
      id: "exevo-mas-san", type: "attack", area: true, alvos: 13, vocs: ["paladin"],
      lvl: 50, mana: 160, cd: 4000, name: "Divine Caldera"
    },
    "exevo-dir-moe": {
      id: "exevo-dir-moe", type: "attack", area: true, alvos: 9, vocs: ["paladin"],
      lvl: 60, mana: 140, cd: 4000, name: "Ethereal Barrage"
    },
    "exevo-dir-san": {
      id: "exevo-dir-san", type: "attack", area: true, alvos: 9, vocs: ["paladin"],
      lvl: 70, mana: 160, cd: 4000, name: "Divine Barrage"
    }
  },
  SUPPLIES: {}, RUNEDATA: {}, SPELLTARGET: {}, GAMEDATA: { items: {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "combo.js"), "utf8"), ctx, { filename: "combo.js" });
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

const clientMobs = pack.map((m) => Object.assign({ hp: 100 }, m));
const clientPlayer = { cx: 10, cy: 10, hp: 100 };
const pCombo = {
  voc: "paladin", level: 574, mp: 9999, ml: 40,
  config: {
    combo: [
      { kind: "spell", id: "exori-gran-con", min: 1 },
      { kind: "spell", id: "exevo-mas-san", min: 1 },
      { kind: "spell", id: "exevo-dir-moe", min: 1 },
      { kind: "spell", id: "exevo-dir-san", min: 1 }
    ]
  },
  equip: { weapon: { item: "umbral-master-crossbow" } }, supplies: {}, lootPouch: {}
};
ctx.ensureCombo(pCombo);
ctx.cdReady = () => true;
ctx.entCd = () => 0;
ctx.spellForVoc = () => true;
ctx.areaNameOf = () => null;
ctx.areaCount = null;
const packTarget = ctx.densestPackTargetClient({ mobs: clientMobs }, clientPlayer, clientMobs);
const escolha = ctx.comboEscolhe(
  { player: clientPlayer, mobs: clientMobs, runeCd: 0 },
  pCombo, packTarget, now);
must(escolha && escolha.id === "exori-gran-con",
  "cliente deveria #1 gran con no pack, veio: " + JSON.stringify(escolha));

/* Cliente: exori-con #1 */
pCombo.config.combo = [
  { kind: "spell", id: "exori-con", min: 1 },
  { kind: "spell", id: "exevo-mas-san", min: 1 }
];
ctx.ensureCombo(pCombo);
const escolhaCon = ctx.comboEscolhe(
  { player: clientPlayer, mobs: clientMobs, runeCd: 0 },
  pCombo, packTarget, now);
must(escolhaCon && escolhaCon.id === "exori-con",
  "cliente exori-con #1 no pack: " + JSON.stringify(escolhaCon));

/* Cliente: min legado 2 em ST e clampado para 1 */
pCombo.config.combo = [
  { kind: "spell", id: "exori-con", min: 2 },
  { kind: "spell", id: "exevo-mas-san", min: 1 }
];
ctx.ensureCombo(pCombo);
must(pCombo.config.combo[0].min === 1, "ensureCombo clampa ST min para 1");
const escolhaMin = ctx.comboEscolhe(
  { player: clientPlayer, mobs: clientMobs, runeCd: 0 },
  pCombo, packTarget, now);
must(escolhaMin && escolhaMin.id === "exori-con",
  "cliente ST com min legado ainda sai: " + JSON.stringify(escolhaMin));

console.log("OK: gran/exori con combo priority — server + client + missiles.");
