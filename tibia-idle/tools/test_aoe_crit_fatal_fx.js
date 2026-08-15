/* Crit/Fatal FX: um sprite por monstro atingido (não só o primário). */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");
function must(ok, msg) { if (!ok) throw Error(msg); }

function probeSpellFx(spellId, voc, weaponSlug) {
  const p = {
    id: 1, name: "AoEFx", voc, level: 200, ml: 100, hp: 99999, mp: 99999,
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
  for (let i = 0; i < 1200; i++) {
    const seed = (spellId + "-fx-" + i + "x".repeat(64)).slice(0, 64);
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
    if (!hits.some((h) => h.crit) && !hits.some((h) => h.fatal)) continue;

    const byTarget = new Map();
    for (const h of hits) {
      const id = String(h.targetId || h.mobId);
      if (!byTarget.has(id)) byTarget.set(id, { crit: false, fatal: false, pos: new Set() });
      const row = byTarget.get(id);
      if (h.crit) row.crit = true;
      if (h.fatal) row.fatal = true;
      row.pos.add(Math.round((Number(h.x) || 0) * 1000) + ":" + Math.round((Number(h.y) || 0) * 1000));
    }
    must(byTarget.size >= 2, spellId + ": esperava 2+ alvos com hit");
    const critTargets = [...byTarget.values()].filter((r) => r.crit);
    const fatalTargets = [...byTarget.values()].filter((r) => r.fatal);
    if (critTargets.length) {
      must(critTargets.length === byTarget.size,
        spellId + ": crit FX incompleto (" + critTargets.length + "/" + byTarget.size + ")");
      const posCount = new Set();
      for (const [id, row] of byTarget) if (row.crit) for (const p of row.pos) posCount.add(id + "@" + p);
      must(posCount.size >= byTarget.size, spellId + ": posições de crit colapsaram num só tile");
    }
    if (fatalTargets.length) {
      must(fatalTargets.length === byTarget.size,
        spellId + ": fatal FX incompleto (" + fatalTargets.length + "/" + byTarget.size + ")");
    }
    // Parte dual não deve reemitir crit/fatal (um sprite por monstro).
    const dualCrit = hits.filter((h) => h.dual && (h.crit || h.fatal));
    must(dualCrit.length === 0, spellId + ": hit dual ainda carrega crit/fatal");
    return { spellId, targets: byTarget.size, crit: !!critTargets.length, fatal: !!fatalTargets.length };
  }
  throw Error(spellId + ": nenhum cast multi-alvo com crit/fatal em 1200 tentativas");
}

const results = [
  probeSpellFx("exevo-vis-hur", "sorcerer", "wand-of-darkness"),
  probeSpellFx("exevo-mas-san", "paladin", "royal-crossbow"),
  probeSpellFx("exori-gran", "knight", "magic-sword"),
];

const gameSrc = fs.readFileSync(path.join(__dirname, "../game/js/game.js"), "utf8");
must(gameSrc.includes("critFxShown") && gameSrc.includes("fatalFxShown"),
  "drainEvents sem dedupe por monstro de crit/fatal");
must(gameSrc.includes("critFxKey"), "critFxKey ausente em drainEvents");

const renderSrc = fs.readFileSync(path.join(__dirname, "../game/js/render.js"), "utf8");
must(renderSrc.includes("critical-hit-effect") && renderSrc.includes("fatal-text") &&
  renderSrc.includes("FX_CAP"),
  "addEffect não protege Crit/Fatal do teto de efeitos");

const combatSrc = fs.readFileSync(path.join(__dirname, "../game/js/combat.js"), "utf8");
must(combatSrc.includes("crit: critou, fatal: fatalou") &&
  combatSrc.includes("Crit/Fatal do swing principal valem para toda a explosao"),
  "splash de munição deve herdar crit/fatal do swing");
must(combatSrc.includes("crit: runeCastCrit, fatal: runeCastFatal"),
  "runas em área devem marcar crit/fatal por alvo");

console.log("OK: AoE crit/fatal FX per target",
  results.map((r) => r.spellId + "(" + r.targets + ")").join(", "));
