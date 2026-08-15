/* Diamond arrow +15% e exevo mas san +30% — motor autoritativo + FX. */
"use strict";
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function descriptor(p, mobs) {
  const member = { id: String(p.id), p: clone(p) };
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(p.id), members: [member],
    state: {
      gridW: 30, gridH: 30,
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: mobs || [{ id: "rat-one", slug: "rat", cx: 11, cy: 10, x: 11.5 / 30, y: 10.5 / 30, hp: 999999, maxHp: 999999 }],
      events: [],
    },
  };
}
function silence(auth) {
  for (const mob of auth.mobs || []) {
    mob.damage = 0; mob.attackAcc = -100000;
    mob.def = Object.assign({}, mob.def, { skills: [] });
  }
}

const diamond = engine.ITEMS["diamond-arrow"];
must(diamond && diamond.areaMatrix && diamond.noMiss && diamond.atk === 37,
  "diamond arrow: atk Canary 37, noMiss, matriz");
must(Number(diamond.dmgMul) === 1.15, "diamond arrow dmgMul idle = 1.15");
must(diamond.areaFx === "blue-electricity", "diamond areaFx continua blue-electricity");
const cells = diamond.areaMatrix.reduce((n, row) => n + row.filter(Boolean).length, 0);
must(cells === 21, "diamond arrow 5x5 sem cantos = 21 SQM");

const bow = engine.ITEMS.bow;
const skill = 90, level = 200;
const atk = Math.floor(((Number(bow.atk) || 0) + diamond.atk) * 1.2);
const base = engine.distanceDamage(skill, atk, 1, level, false);
const boostedMax = Math.floor(base.max * diamond.dmgMul);
must(boostedMax === Math.floor(base.max * 1.15), "diamond: max com dmgMul = floor(baseline*1.15)");
must(boostedMax > base.max, "diamond: max apos +15% maior que baseline");
must(boostedMax / base.max > 1.14 && boostedMax / base.max < 1.16,
  "diamond: razao max ~1.15 (got " + (boostedMax / base.max).toFixed(4) + ")");

const pBase = {
  id: 1, name: "RP", voc: "paladin", level: 200, exp: engine.expForLevel(200),
  hp: 2000, mp: 800, gold: 50000, ml: 20,
  skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 90, shield: 40 },
  equip: { weapon: { item: "bow" }, shield: { item: "quiver" }, ammo: { item: "diamond-arrow" } },
  supplies: {}, lootPouch: {}, kills: {}, bosses: {},
  config: { spellAttack: false, combo: [] },
};
let sumMul = 0, sumBase = 0, n = 120;
const savedMul = diamond.dmgMul;
for (let i = 0; i < n; i++) {
  const authTmp = { rngState: (i + 1) * 9973 };
  sumMul += engine.playerDamage(authTmp, pBase, { slug: "rat" });
}
diamond.dmgMul = 1;
for (let i = 0; i < n; i++) {
  const authTmp = { rngState: (i + 1) * 9973 };
  sumBase += engine.playerDamage(authTmp, pBase, { slug: "rat" });
}
diamond.dmgMul = savedMul;
const ratio = sumMul / sumBase;
must(ratio > 1.12 && ratio < 1.18,
  "diamond playerDamage medio ~+15% (got " + ratio.toFixed(4) + ")");

const caldera = engine.ALL_SPELLS["exevo-mas-san"];
must(caldera && caldera.words === "exevo mas san" && caldera.f,
  "exevo-mas-san / Divine Caldera presente");
const expectMin = 4 * (160 / 140) * 1.30;
const expectMax = 6 * (160 / 140) * 1.30;
must(Math.abs(caldera.f.mlMin - expectMin) < 1e-9,
  "exevo-mas-san mlMin = Canary*160/140*1.30");
must(Math.abs(caldera.f.mlMax - expectMax) < 1e-9,
  "exevo-mas-san mlMax = Canary*160/140*1.30");
must(caldera.f.mlMin / (4 * 160 / 140) - 1 > 0.299,
  "exevo-mas-san +30% sobre o patch 15.25");

const live = engine.initializeAuthority(descriptor(pBase, [
  { id: "center", slug: "rat", cx: 11, cy: 10, hp: 99999, maxHp: 99999 },
  { id: "arm", slug: "rat", cx: 12, cy: 10, hp: 99999, maxHp: 99999 },
]), "a".repeat(64), 1000);
silence(live.authority);
live.authority.players[0].attackAcc = 8000;
const state = JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 1000, 2000).state);
const hits = (state.state.events || []).filter((e) => e.t === "hit" && !e.spellId);
must(hits.some((e) => e.missile === "diamond-arrow" && e.projectile),
  "diamond mantem missile diamond-arrow");
must(hits.every((e) => e.fx === "blue-electricity"),
  "diamond hits usam Blue Electricity");
const area = (state.state.events || []).find((e) => e.t === "areafx");
must(area && area.fx === "blue-electricity" && area.cells.length === 21,
  "areafx 21 SQM blue-electricity intacto");

console.log("OK: diamond +15% dmg, exevo mas san +30%, FX/area ok");
