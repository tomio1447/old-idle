/* Crit/Fatal em AoE: um roll por cast — se proc, vale para TODOS os alvos. */
"use strict";
const engine = require("../server/authoritative_engine");
function must(ok, msg) { if (!ok) throw Error(msg); }

function probeSpell(spellId, voc, weaponSlug) {
  const p = {
    id: 1, name: "AoECrit", voc, level: 200, ml: 100, hp: 99999, mp: 99999,
    skills: { sword: 100, axe: 100, club: 100, dist: 100, fist: 100, shield: 100 },
    equip: { weapon: { item: weaponSlug, instId: "w1" } },
    itemInstances: [{ id: "w1", slug: weaponSlug, loc: "equip:weapon", tier: 10 }],
    config: { spellAttack: true, combo: [{ id: spellId }] },
    supplies: {},
  };
  const desc = {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: "1", members: [{ id: "1", p }],
    state: {
      players: [{ id: "1", p, cx: 10, cy: 10, x: 0.5, y: 0.5 }],
      mobs: [
        { id: "m1", slug: "dragon", cx: 11, cy: 10 },
        { id: "m2", slug: "dragon", cx: 12, cy: 10 },
        { id: "m3", slug: "dragon", cx: 10, cy: 11 },
        { id: "m4", slug: "dragon", cx: 25, cy: 25 },
      ],
      events: [],
    },
  };
  let sawMulti = false, sawCrit = false, sawFatal = false;
  for (let i = 0; i < 1200; i++) {
    const seed = (spellId + "-" + i + "x".repeat(64)).slice(0, 64);
    const auth = engine.initializeAuthority(desc, seed, 1000);
    for (const m of auth.authority.mobs) {
      m.hp = 999999; m.maxHp = 999999; m.damage = 0; m.walkAcc = -1e9;
    }
    const item = auth.authority.players[0];
    item.attackAcc = 99999;
    item.p.mp = 99999;
    item.p._spellCd = {};
    item.p._groupCd = {};
    item.p._offensiveCd = 0;
    const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth), 2000, 2500).state);
    const hits = after.state.events.filter((e) => e.t === "hit" && e.spellId === spellId);
    if (hits.length < 2) continue;
    sawMulti = true;
    const crits = hits.filter((h) => h.crit).length;
    const fatals = hits.filter((h) => h.fatal).length;
    must(!(crits > 0 && crits < hits.length),
      spellId + ": crit parcial (got " + crits + "/" + hits.length + ")");
    must(!(fatals > 0 && fatals < hits.length),
      spellId + ": fatal parcial (got " + fatals + "/" + hits.length + ")");
    if (crits === hits.length) sawCrit = true;
    if (fatals === hits.length) sawFatal = true;
    if (sawCrit && sawFatal) break;
  }
  must(sawMulti, spellId + ": nenhuma conjuração com 2+ alvos");
  must(sawCrit || sawFatal, spellId + ": nenhum crit/fatal compartilhado em 1200 casts");
  return { spellId, sawCrit, sawFatal };
}

const results = [
  probeSpell("exevo-vis-hur", "sorcerer", "wand-of-darkness"),
  probeSpell("exevo-mas-san", "paladin", "royal-crossbow"),
  probeSpell("exori-gran", "knight", "magic-sword"),
];

/* Contrato no fonte: roll fora do loop de alvos da spell. */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../server/authoritative_engine.js"), "utf8");
must(src.includes("Crit/Fatal: UM roll por cast"), "comentario de contrato AoE ausente");
must(/const isFatal=forgeRollOnslaught\(auth,p\);[\s\S]*?for\(let ti=0;ti<targets\.length;ti\+\+\)/.test(src),
  "forgeRollOnslaught deve rolar antes do loop de alvos da spell");

console.log("OK: AoE crit/fatal shared", results.map((r) => r.spellId).join(", "));
