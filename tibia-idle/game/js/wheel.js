/* =========================================================================
 * wheel.js — logica da Wheel of Destiny (Roda do Destino)
 *
 * Portado do Canary (player_wheel.cpp / io_wheel.cpp) para bonus e pontos, e
 * do otclient (wheelnode.lua `canReachRootNodeFromNode`) para a regra de
 * desbloqueio por adjacencia: um no so recebe pontos se existir um CAMINHO
 * dele ate uma raiz (_50) passando por nos totalmente maximizados.
 * ========================================================================= */
"use strict";

if (typeof WHEEL_SLOTS === "undefined" && typeof require === "function") {
  var _wd = require("./wheeldata.js");
  var WHEEL_SLOTS = _wd.WHEEL_SLOTS, WHEEL_POS = _wd.WHEEL_POS, WHEEL_CONNECTED = _wd.WHEEL_CONNECTED;
  var WHEEL_ROOTS = _wd.WHEEL_ROOTS, WHEEL_CONFIG = _wd.WHEEL_CONFIG, WHEEL_HP = _wd.WHEEL_HP;
  var WHEEL_MP = _wd.WHEEL_MP, WHEEL_CAP = _wd.WHEEL_CAP, WHEEL_SKILL = _wd.WHEEL_SKILL;
  var WHEEL_LEECH = _wd.WHEEL_LEECH, WHEEL_MIT_PER_POINT = _wd.WHEEL_MIT_PER_POINT;
  var WHEEL_STAGE_ABILITY = _wd.WHEEL_STAGE_ABILITY, WHEEL_SPELL_UPGRADES = _wd.WHEEL_SPELL_UPGRADES;
}
if (typeof ensureWheelGems === "undefined" && typeof require === "function") {
  var _wg = require("./wheel-gems.js");
  var ensureWheelGems = _wg.ensureWheelGems;
  var wheelGemBonus = _wg.wheelGemBonus;
  var wheelGradeIvPoints = _wg.wheelGradeIvPoints;
  var wheelGemSpellId = _wg.wheelGemSpellId;
  var wheelFindGem = _wg.wheelFindGem;
  var wheelVesselResonance = _wg.wheelVesselResonance;
}

function ensureWheel(p) {
  if (!p) return;
  if (!p.wheel || typeof p.wheel !== "object") p.wheel = {};
  if (!p.wheel.slots || typeof p.wheel.slots !== "object") p.wheel.slots = {};
  if (!p.wheel.scrolls || typeof p.wheel.scrolls !== "object") p.wheel.scrolls = {};
  if (!p.wheel.giftOfLifeAt) p.wheel.giftOfLifeAt = 0;
  if (typeof ensureWheelGems === "function") ensureWheelGems(p);
  return p.wheel;
}

function wheelPoints(p) {
  if (!p || p.level < WHEEL_CONFIG.minLevel) return 0;
  ensureWheel(p);
  var base = Math.max(0, (p.level - WHEEL_CONFIG.minLevel)) * WHEEL_CONFIG.pointsPerLevel;
  var extra = 0;
  for (var i = 0; i < WHEEL_CONFIG.scrolls.length; i++) {
    if (p.wheel.scrolls[WHEEL_CONFIG.scrolls[i].id]) extra += WHEEL_CONFIG.scrolls[i].pontos;
  }
  if (typeof wheelGradeIvPoints === "function") extra += wheelGradeIvPoints(p);
  return base + extra;
}

function wheelSpent(p) {
  ensureWheel(p);
  var tot = 0;
  for (var id in WHEEL_SLOTS) tot += (p.wheel.slots[id] || 0);
  return tot;
}

function wheelAvail(p) {
  return Math.max(0, wheelPoints(p) - wheelSpent(p));
}

function wheelSlotPoints(p, slotId) {
  ensureWheel(p);
  return p.wheel.slots[slotId] || 0;
}

function wheelIsFull(p, slotId) {
  var spec = WHEEL_SLOTS[slotId];
  return (p.wheel.slots[slotId] || 0) >= (spec ? spec.max : Infinity);
}

/* Um no pode receber pontos? Regra do cliente (canReachRootNodeFromNode):
 * - raizes (_50) sempre;
 * - senao, existe um caminho do no ate uma raiz onde cada no do caminho
 *   (exceto o proprio) esta totalmente maximizado. */
function wheelCanAllocate(p, slotId) {
  if (!p || p.level < WHEEL_CONFIG.minLevel) return false;
  var spec = WHEEL_SLOTS[slotId];
  if (!spec) return false;
  if (wheelAvail(p) <= 0) return false;
  if (wheelSlotPoints(p, slotId) >= spec.max) return false;
  // pontos TOTAIS minimos (nivel + scrolls) para comecar este no
  if (wheelPoints(p) < spec.min) return false;
  // adjacencia / alcancabilidade
  if (WHEEL_ROOTS.indexOf(slotId) !== -1) return true;
  return wheelReachesRoot(p, slotId);
}

/* BFS: o no alcanca uma raiz passando por nos maximizados. */
function wheelReachesRoot(p, slotId, ignoreNode) {
  var queue = [slotId];
  var visited = {};
  while (queue.length) {
    var cur = queue.shift();
    if (visited[cur]) continue;
    visited[cur] = true;
    if (WHEEL_ROOTS.indexOf(cur) !== -1) return true;
    var connected = WHEEL_CONNECTED[cur] || [];
    for (var i = 0; i < connected.length; i++) {
      var n = connected[i];
      if (n === ignoreNode) continue;
      if (visited[n]) continue;
      if (wheelIsFull(p, n)) queue.push(n);
    }
  }
  return false;
}

function wheelAllocate(p, slotId) {
  if (!wheelCanAllocate(p, slotId)) return false;
  ensureWheel(p);
  p.wheel.slots[slotId] = (p.wheel.slots[slotId] || 0) + 1;
  return true;
}

/* Remove 1 ponto, sem quebrar o desbloqueio dos vizinhos que ainda tem pontos. */
function wheelRemove(p, slotId) {
  if (!p) return false;
  ensureWheel(p);
  var cur = p.wheel.slots[slotId] || 0;
  if (cur <= 0) return false;
  p.wheel.slots[slotId] = cur - 1;
  // verifica se algum vizinho com pontos ficou sem caminho ate a raiz
  var connected = WHEEL_CONNECTED[slotId] || [];
  for (var i = 0; i < connected.length; i++) {
    var n = connected[i];
    if (WHEEL_ROOTS.indexOf(n) !== -1) continue;
    if ((p.wheel.slots[n] || 0) > 0 && !wheelReachesRoot(p, n)) {
      // reverte e bloqueia
      p.wheel.slots[slotId] = cur;
      return false;
    }
  }
  return true;
}

/* Pontos de uma cor. */
function wheelColorPoints(p, color) {
  ensureWheel(p);
  var tot = 0;
  for (var id in WHEEL_SLOTS) {
    if (WHEEL_SLOTS[id].color === color) tot += (p.wheel.slots[id] || 0);
  }
  if (typeof wheelGemBonus === "function") {
    var gb = wheelGemBonus(p);
    tot += Math.floor((gb.revelation && gb.revelation[color]) || 0);
  }
  return tot;
}

/* Estagio de uma cor: 0/1/2/3 conforme os limiares. */
function wheelStage(p, color) {
  var pts = wheelColorPoints(p, color);
  if (pts >= WHEEL_CONFIG.stageThresholds[2]) return 3;
  if (pts >= WHEEL_CONFIG.stageThresholds[1]) return 2;
  if (pts >= WHEEL_CONFIG.stageThresholds[0]) return 1;
  return 0;
}

function wheelStages(p) {
  var out = {};
  ["green", "red", "blue", "purple"].forEach(function (c) { out[c] = wheelStage(p, c); });
  return out;
}

/* Bonus de skill da wheel. */
function wheelSkillBonus(p, which) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var targetSkill = WHEEL_SKILL[voc];
  var bonus = 0;
  for (var id in WHEEL_SLOTS) {
    var spec = WHEEL_SLOTS[id];
    if (!spec.skill) continue;
    if ((p.wheel.slots[id] || 0) < spec.max) continue;
    if (targetSkill === "melee") {
      if (which === "sword" || which === "axe" || which === "club" || which === "fist") bonus++;
    } else if (targetSkill === "distance" && which === "dist") bonus++;
    else if (targetSkill === "fist" && which === "fist") bonus++;
  }
  return bonus;
}

function wheelMagicBonus(p) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  if (WHEEL_SKILL[voc] !== "magic") return 0;
  var bonus = 0;
  for (var id in WHEEL_SLOTS) {
    var spec = WHEEL_SLOTS[id];
    if (spec.skill && (p.wheel.slots[id] || 0) >= spec.max) bonus++;
  }
  return bonus;
}

function wheelLeechTotals(p) {
  ensureWheel(p);
  var life = 0, mana = 0;
  for (var id in WHEEL_SLOTS) {
    var spec = WHEEL_SLOTS[id];
    if (!spec.leech) continue;
    if ((p.wheel.slots[id] || 0) < spec.max) continue;
    life += spec.leech === "life" ? WHEEL_LEECH.life : 0;
    mana += spec.leech === "mana" ? WHEEL_LEECH.mana : 0;
  }
  if (typeof wheelGemBonus === "function") {
    var gb = wheelGemBonus(p);
    life += gb.lifeLeech || 0;
    mana += gb.manaLeech || 0;
  }
  return { lifeLeech: life, manaLeech: mana };
}

function wheelUnlockedSpells(p) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var out = [], seen = {};
  for (var id in WHEEL_SLOTS) {
    var spec = WHEEL_SLOTS[id];
    if (!spec.spell) continue;
    if ((p.wheel.slots[id] || 0) < spec.max) continue;
    var sp = spec.spell[voc];
    if (sp && sp !== "__focus__" && !seen[sp]) { seen[sp] = 1; out.push(sp); }
  }
  return out;
}

function wheelInstants(p) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var out = [];
  for (var id in WHEEL_SLOTS) {
    var spec = WHEEL_SLOTS[id];
    if (!spec.instant) continue;
    if ((p.wheel.slots[id] || 0) < spec.max) continue;
    var nm = spec.instant[voc];
    if (nm) out.push(nm);
  }
  return out;
}

function wheelRevelation(p) {
  var dmg = 0, heal = 0;
  ["green", "red", "blue", "purple"].forEach(function (c) {
    var st = wheelStage(p, c);
    if (st > 0) { dmg += WHEEL_CONFIG.revelation[st - 1].damage; heal += WHEEL_CONFIG.revelation[st - 1].healing; }
  });
  return { damagePct: dmg, healPct: heal };
}

function wheelStageAbilities(p) {
  var voc = p.voc || "knight", out = {};
  ["green", "red", "blue", "purple"].forEach(function (c) {
    if (wheelStage(p, c) > 0) out[c] = WHEEL_STAGE_ABILITY[c][voc] || null;
  });
  return out;
}

function wheelAvatarLevel(p) {
  return wheelStage(p, "purple");
}

/* Consolidated totals. */
function wheelTotals(p) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var t = { hp: 0, mp: 0, cap: 0, melee: 0, distance: 0, magic: 0, fist: 0,
            mitigation: 0, gemMitigation: 0, dodge: 0, resist: {}, critDamage: 0, momentum: 0,
            lifeLeech: 0, manaLeech: 0, damagePct: 0, healPct: 0,
            spells: [], instants: [], stages: {}, stageAbilities: {}, avatarLevel: 0, gemSpells: {} };
  for (var id in WHEEL_SLOTS) {
    var spec = WHEEL_SLOTS[id];
    var pts = p.wheel.slots[id] || 0;
    if (pts <= 0) continue;
    if (spec.hp) t.hp += WHEEL_HP[voc] * pts;
    if (spec.mana) t.mp += WHEEL_MP[voc] * pts;
    if (spec.cap) t.cap += WHEEL_CAP[voc] * pts;
    if (spec.mit) t.mitigation += WHEEL_MIT_PER_POINT * pts;
    if (pts >= spec.max) {
      if (spec.skill) {
        var sk = WHEEL_SKILL[voc];
        if (sk === "melee") t.melee++; else if (sk === "distance") t.distance++;
        else if (sk === "magic") t.magic++; else if (sk === "fist") t.fist++;
      }
      if (spec.leech) { t.lifeLeech += spec.leech === "life" ? WHEEL_LEECH.life : 0; t.manaLeech += spec.leech === "mana" ? WHEEL_LEECH.mana : 0; }
      if (spec.spell && spec.spell[voc] && spec.spell[voc] !== "__focus__" && t.spells.indexOf(spec.spell[voc]) === -1) t.spells.push(spec.spell[voc]);
      if (spec.instant && spec.instant[voc]) t.instants.push(spec.instant[voc]);
    }
  }
  var rev = wheelRevelation(p);
  t.damagePct = rev.damagePct; t.healPct = rev.healPct;
  t.stages = wheelStages(p); t.stageAbilities = wheelStageAbilities(p);
  t.avatarLevel = wheelAvatarLevel(p);
  if (typeof wheelGemBonus === "function") {
    var gb = wheelGemBonus(p);
    t.hp += gb.hp || 0; t.mp += gb.mp || 0; t.cap += gb.cap || 0;
    t.gemMitigation += gb.mitigationPct || 0;
    t.dodge += gb.dodge || 0;
    t.critDamage += gb.critDamage || 0;
    t.momentum += gb.momentum || 0;
    t.lifeLeech += gb.lifeLeech || 0; t.manaLeech += gb.manaLeech || 0;
    t.resist = gb.resist || {};
    t.gemSpells = gb.spells || {};
  }
  return t;
}

function wheelDamageMul(p) { return 1 + wheelTotals(p).damagePct / 100; }
function wheelHealMul(p) { return 1 + wheelTotals(p).healPct / 100; }

function mergeWheelBonus(a, b) {
  var out = {};
  for (var k in a) out[k] = a[k];
  for (var k2 in b) out[k2] = (out[k2] || 0) + b[k2];
  return out;
}

function wheelSpellUpgrade(p, spellId) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var list = WHEEL_SPELL_UPGRADES[voc];
  if (!list) return null;
  for (var i = 0; i < list.length; i++) {
    var u = list[i];
    if (u.name !== spellId) continue;
    var grade = 0;
    for (var id in WHEEL_SLOTS) {
      var spec = WHEEL_SLOTS[id];
      if (!spec.spell || spec.spell[voc] !== spellId) continue;
      if ((p.wheel.slots[id] || 0) >= spec.max) grade++;
    }
    var bonus = {};
    if (grade >= 1) bonus = mergeWheelBonus(bonus, u.g1);
    if (grade >= 2) bonus = mergeWheelBonus(bonus, u.g2);
    return { grade: Math.min(2, grade), bonus: bonus };
  }
  return null;
}

var WHEEL_FOCUS_SPELLS = ["exori-flam","exori-mort","exori-frigo","exori-gran-flam","exori-gran-mort","exori-gran-frigo","exori-vis","exori-gran-vis","exevo-flam-hur","exevo-frigo-hur","exevo-vis-hur","exevo-mort-hur","exevo-gran-flam-hur","exevo-gran-frigo-hur","exevo-gran-vis-hur"];

function wheelApplySpellBoost(p, spellId) {
  var voc = p.voc || "knight";
  var out = { damagePct: 0, healPct: 0, cooldownMs: 0, manaPct: 0, lifeLeech: 0, manaLeech: 0, critChance: 0, critDamage: 0, extraTarget: 0, area: false };
  var baseId = spellId;
  if (voc === "sorcerer" && WHEEL_FOCUS_SPELLS.indexOf(spellId) !== -1) baseId = "__focus__";
  var u = wheelSpellUpgrade(p, baseId);
  if (u) {
    var b = u.bonus;
    out.damagePct = b.damage || 0; out.healPct = b.heal || 0;
    out.cooldownMs = (b.cooldown || 0) * 1000; out.manaPct = b.manaCost || 0;
    out.lifeLeech = b.lifeLeech || 0; out.manaLeech = b.manaLeech || 0;
    out.critChance = b.criticalChance || 0; out.critDamage = b.criticalDamage || 0;
    out.extraTarget = b.additionalTarget || 0; out.area = !!b.area;
  }
  if (typeof wheelGemBonus === "function" && spellId) {
    var gb = wheelGemBonus(p);
    var gs = gb.spells && (gb.spells[spellId] || gb.spells[baseId]);
    if (!gs && typeof wheelGemSpellId === "function") {
      var alt = wheelGemSpellId(spellId);
      gs = gb.spells && gb.spells[alt];
    }
    if (gs) {
      out.damagePct += gs.damagePct || 0;
      out.healPct += gs.healPct || 0;
      out.cooldownMs += gs.cooldownMs || 0;
      out.critChance += gs.critChance || 0;
      out.critDamage += gs.critDamage || 0;
    }
  }
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { ensureWheel, wheelPoints, wheelSpent, wheelAvail,
    wheelAllocate, wheelRemove, wheelCanAllocate, wheelReachesRoot, wheelTotals,
    wheelDamageMul, wheelHealMul, wheelSpellUpgrade, wheelApplySpellBoost,
    wheelMagicBonus, wheelSkillBonus, wheelLeechTotals, wheelAvatarLevel,
    wheelColorPoints, wheelStage, wheelStages };
}
