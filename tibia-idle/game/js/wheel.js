/* =========================================================================
 * wheel.js — logica da Wheel of Destiny (Roda do Destino)
 *
 * Portado do Canary (player_wheel.cpp / io_wheel.cpp). Controla pontos,
 * alocacao nos nos (com prerequisitos e limites por no), computa todos os
 * bonus (stats, skills, leech, mitigation, dano/cura de stage, magias e
 * avatares da wheel) e expoe hooks para o restante do jogo.
 * ========================================================================= */
"use strict";

/* Garante a estrutura de save da wheel num personagem. */
function ensureWheel(p) {
  if (!p) return;
  if (!p.wheel || typeof p.wheel !== "object") p.wheel = {};
  // pontos alocados por no: { SLOT_ID: n }
  if (!p.wheel.slots || typeof p.wheel.slots !== "object") p.wheel.slots = {};
  // promotion scrolls decifrados: { itemId: 1 }
  if (!p.wheel.scrolls || typeof p.wheel.scrolls !== "object") p.wheel.scrolls = {};
  // gift of life: ultimo uso para o revive periodico
  if (!p.wheel.giftOfLifeAt) p.wheel.giftOfLifeAt = 0;
  return p.wheel;
}

/* Pontos totais da wheel: (nivel - 50) * 1 + pontos de scrolls. */
function wheelPoints(p) {
  if (!p || p.level < WHEEL_CONFIG.minLevel) return 0;
  ensureWheel(p);
  var base = Math.max(0, (p.level - WHEEL_CONFIG.minLevel)) * WHEEL_CONFIG.pointsPerLevel;
  var extra = 0;
  for (var i = 0; i < WHEEL_CONFIG.scrolls.length; i++) {
    if (p.wheel.scrolls[WHEEL_CONFIG.scrolls[i].id]) extra += WHEEL_CONFIG.scrolls[i].pontos;
  }
  return base + extra;
}

/* Pontos ja gastos (soma de todos os nos). */
function wheelSpent(p) {
  ensureWheel(p);
  var tot = 0;
  for (var id in WHEEL_SLOTS) tot += (p.wheel.slots[id] || 0);
  return tot;
}

/* Pontos disponiveis para alocar. */
function wheelAvail(p) {
  return Math.max(0, wheelPoints(p) - wheelSpent(p));
}

function wheelSlotPoints(p, slotId) {
  ensureWheel(p);
  return p.wheel.slots[slotId] || 0;
}

/* Pontos de uma cor (soma dos nos daquela cor). */
function wheelColorPoints(p, color) {
  ensureWheel(p);
  var tot = 0;
  for (var id in WHEEL_SLOTS) {
    if (WHEEL_SLOTS[id].color === color) tot += (p.wheel.slots[id] || 0);
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

/* Nos que precisam estar no MAXIMO para liberar um no (prerequisito:
 * pelo menos UM deles deve estar cheio). Montado pela geometria da wheel
 * (espelha o canSelectSlot do canary). */
var WHEEL_PREREQ = (function () {
  var r = {};
  // auxiliares por quadrante
  var quads = { green: "GREEN", red: "RED", blue: "BLUE", purple: "PURPLE" };
  for (var c in quads) {
    var q = quads[c];
    // 50: sempre liberado (com nivel >= 50)
    r[q + "_50"] = [];
    // 75: precisa do 50 do mesmo quadrante
    r[q + "_TOP_75"] = [q + "_50"];
    r[q + "_BOTTOM_75"] = [q + "_50"];
    // 100: precisa de 75 adjacente e/ou 100 vizinho
    r[q + "_TOP_100"] = [q + "_TOP_75", q + "_MIDDLE_100"];
    r[q + "_MIDDLE_100"] = [q + "_TOP_75", q + "_BOTTOM_75", q + "_TOP_100", q + "_BOTTOM_100"];
    r[q + "_BOTTOM_100"] = [q + "_BOTTOM_75", q + "_MIDDLE_100"];
    // 150: precisa de 100 adjacente e/ou 150 vizinho
    r[q + "_TOP_150"] = [q + "_TOP_100", q + "_MIDDLE_100", q + "_BOTTOM_150"];
    r[q + "_BOTTOM_150"] = [q + "_MIDDLE_100", q + "_BOTTOM_100", q + "_TOP_150"];
    // 200: precisa dos dois 150
    r[q + "_200"] = [q + "_TOP_150", q + "_BOTTOM_150"];
  }
  return r;
})();

/* Pode alocar 1 ponto no no? */
function wheelCanAllocate(p, slotId) {
  if (!p || p.level < WHEEL_CONFIG.minLevel) return false;
  var spec = WHEEL_SLOTS[slotId];
  if (!spec) return false;
  if (wheelAvail(p) <= 0) return false;
  if (wheelSlotPoints(p, slotId) >= spec.max) return false;
  // pontos TOTAIS (nivel + scrolls) minimos para comecar este no — como o
  // getWheelPoints() do canary, nao os pontos ja gastos
  if (wheelPoints(p) < spec.min) return false;
  // prerequisito: pelo menos um vizinho cheio (ou no de entrada)
  var req = WHEEL_PREREQ[slotId] || [];
  if (req.length) {
    var ok = false;
    for (var i = 0; i < req.length; i++) {
      if (wheelSlotPoints(p, req[i]) >= (WHEEL_SLOTS[req[i]] || {}).max) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

/* Aloca 1 ponto. Retorna true/false. */
function wheelAllocate(p, slotId) {
  if (!wheelCanAllocate(p, slotId)) return false;
  ensureWheel(p);
  p.wheel.slots[slotId] = (p.wheel.slots[slotId] || 0) + 1;
  return true;
}

/* Remove 1 ponto (deve respeitar os prerequisitos dos vizinhos). */
function wheelRemove(p, slotId) {
  if (!p) return false;
  ensureWheel(p);
  var cur = p.wheel.slots[slotId] || 0;
  if (cur <= 0) return false;
  // nao pode desalocar se algum vizinho depende deste no cheio
  var sp = wheelSpent(p);
  for (var id in WHEEL_PREREQ) {
    var req = WHEEL_PREREQ[id];
    for (var i = 0; i < req.length; i++) {
      if (req[i] === slotId && (p.wheel.slots[id] || 0) > 0) {
        // se este no e o unico prerequisito cheio do vizinho, bloqueia
        var unico = true;
        for (var j = 0; j < req.length; j++) {
          var o = req[j];
          if (o !== slotId && (p.wheel.slots[o] || 0) >= (WHEEL_SLOTS[o] || {}).max) { unico = false; break; }
        }
        if (unico) return false;
      }
    }
  }
  p.wheel.slots[slotId] = cur - 1;
  return true;
}

/* Skills de vocacao afetadas pela wheel (para integrar no effSkill). */
function wheelSkillBonus(p, which) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var targetSkill = WHEEL_SKILL[voc];   // 'melee'|'distance'|'magic'|'fist'
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

/* Magic level extra da wheel (skill 'magic'). */
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

/* Leech (vida/mana) da wheel. */
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
  return { lifeLeech: life, manaLeech: mana };
}

/* Magias da wheel desbloqueadas (por maximizar nos de spell). */
function wheelUnlockedSpells(p) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var out = [];
  var seen = {};
  for (var id in WHEEL_SLOTS) {
    var spec = WHEEL_SLOTS[id];
    if (!spec.spell) continue;
    if ((p.wheel.slots[id] || 0) < spec.max) continue;
    var sp = spec.spell[voc];
    if (sp && !seen[sp]) { seen[sp] = 1; out.push(sp); }
  }
  return out;
}

/* Instants (habilidades instantaneas) desbloqueados. */
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

/* Estagio da wheel por cor (para a UI). */
function wheelStages(p) {
  var colors = ["green", "red", "blue", "purple"];
  var out = {};
  for (var i = 0; i < colors.length; i++) out[colors[i]] = wheelStage(p, colors[i]);
  return out;
}

/* Bonus de damage%/heal% (revelation) somados de todas as cores. */
function wheelRevelation(p) {
  var colors = ["green", "red", "blue", "purple"];
  var dmg = 0, heal = 0;
  for (var i = 0; i < colors.length; i++) {
    var st = wheelStage(p, colors[i]);
    if (st > 0) {
      dmg += WHEEL_CONFIG.revelation[st - 1].damage;
      heal += WHEEL_CONFIG.revelation[st - 1].healing;
    }
  }
  return { damagePct: dmg, healPct: heal };
}

/* Habilidades de ESTAGIO desbloqueadas por cor (por vocacao). */
function wheelStageAbilities(p) {
  var colors = ["green", "red", "blue", "purple"];
  var voc = p.voc || "knight";
  var out = {};
  for (var i = 0; i < colors.length; i++) {
    var c = colors[i];
    var st = wheelStage(p, c);
    if (st > 0) out[c] = WHEEL_STAGE_ABILITY[c][voc] || null;
  }
  return out;
}

/* Nivel de AVATAR da wheel (estagio roxo) por vocacao.
 * Retorna 0..3 (o estagio roxo). */
function wheelAvatarLevel(p) {
  return wheelStage(p, "purple");
}

/* =========================================================================
 * wheelTotals — consolidado de todos os bonus da wheel.
 *   { hp, mp, cap, melee, distance, magic, fist, mitigation (fracao),
 *     lifeLeech, manaLeech, damagePct, healPct, spells[], instants[],
 *     stages{color:n}, stageAbilities{}, avatarLevel }
 * ========================================================================= */
function wheelTotals(p) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var t = { hp: 0, mp: 0, cap: 0, melee: 0, distance: 0, magic: 0, fist: 0,
            mitigation: 0, lifeLeech: 0, manaLeech: 0,
            damagePct: 0, healPct: 0, spells: [], instants: [],
            stages: {}, stageAbilities: {}, avatarLevel: 0 };

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
        if (sk === "melee") t.melee++;
        else if (sk === "distance") t.distance++;
        else if (sk === "magic") t.magic++;
        else if (sk === "fist") t.fist++;
      }
      if (spec.leech) {
        t.lifeLeech += spec.leech === "life" ? WHEEL_LEECH.life : 0;
        t.manaLeech += spec.leech === "mana" ? WHEEL_LEECH.mana : 0;
      }
      if (spec.spell && spec.spell[voc] && spec.spell[voc] !== "__focus__") {
        if (t.spells.indexOf(spec.spell[voc]) === -1) t.spells.push(spec.spell[voc]);
      }
      if (spec.instant && spec.instant[voc]) t.instants.push(spec.instant[voc]);
    }
  }

  var rev = wheelRevelation(p);
  t.damagePct = rev.damagePct;
  t.healPct = rev.healPct;
  t.stages = wheelStages(p);
  t.stageAbilities = wheelStageAbilities(p);
  t.avatarLevel = wheelAvatarLevel(p);
  return t;
}

/* Multiplicador de dano causado pela wheel (1 + dano%/100). */
function wheelDamageMul(p) {
  return 1 + wheelTotals(p).damagePct / 100;
}

/* Multiplicador de cura da wheel. */
function wheelHealMul(p) {
  return 1 + wheelTotals(p).healPct / 100;
}

/* =========================================================================
 * Upgrade de magias da wheel (grades 1/2).
 * Retorna { grade: 0|1|2, bonus: {...} } para uma spell, ou null.
 * `grade` e o numero de nos de spell daquela magia maximizados (0-2).
 * ========================================================================= */
function wheelSpellUpgrade(p, spellId) {
  ensureWheel(p);
  var voc = p.voc || "knight";
  var list = WHEEL_SPELL_UPGRADES[voc];
  if (!list) return null;
  for (var i = 0; i < list.length; i++) {
    var u = list[i];
    if (u.name !== spellId) continue;
    // quantos nos daquela magia estao maximizados
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

function mergeWheelBonus(a, b) {
  var out = {};
  for (var k in a) out[k] = a[k];
  for (var k2 in b) out[k2] = (out[k2] || 0) + b[k2];
  return out;
}

/* Bonus de dano % de uma spell pela wheel (para aplicar no rollSpell). */
function wheelSpellDamagePct(p, spellId) {
  var u = wheelSpellUpgrade(p, spellId);
  return u ? (u.bonus.damage || 0) : 0;
}
/* Bonus de cura % de uma spell pela wheel. */
function wheelSpellHealPct(p, spellId) {
  var u = wheelSpellUpgrade(p, spellId);
  return u ? (u.bonus.heal || 0) : 0;
}
/* Reducao de cooldown (ms) de uma spell pela wheel. */
function wheelSpellCooldownReduction(p, spellId) {
  var u = wheelSpellUpgrade(p, spellId);
  return u ? ((u.bonus.cooldown || 0) * 1000) : 0;
}
/* Reducao de custo de mana (%) de uma spell pela wheel. */
function wheelSpellManaReduction(p, spellId) {
  var u = wheelSpellUpgrade(p, spellId);
  return u ? (u.bonus.manaCost || 0) : 0;
}
/* Leech extra de uma spell pela wheel. */
function wheelSpellLeech(p, spellId) {
  var u = wheelSpellUpgrade(p, spellId);
  if (!u) return { lifeLeech: 0, manaLeech: 0 };
  return { lifeLeech: u.bonus.lifeLeech || 0, manaLeech: u.bonus.manaLeech || 0 };
}
/* Crit extra de uma spell pela wheel. */
function wheelSpellCrit(p, spellId) {
  var u = wheelSpellUpgrade(p, spellId);
  if (!u) return { chance: 0, damage: 0 };
  return { chance: u.bonus.criticalChance || 0, damage: u.bonus.criticalDamage || 0 };
}

/* As spells "focus" do Sorcerer (focus spells) afetadas pela wheel. */
var WHEEL_FOCUS_SPELLS = ["exori-flam", "exori-mort", "exori-frigo", "exori-gran-flam", "exori-gran-mort", "exori-gran-frigo", "exori-vis", "exori-gran-vis", "exevo-flam-hur", "exevo-frigo-hur", "exevo-vis-hur", "exevo-mort-hur", "exevo-gran-flam-hur", "exevo-gran-frigo-hur", "exevo-gran-vis-hur"];

/* Aplica bonus da wheel a uma spell de forma completa (usada no combate). */
function wheelApplySpellBoost(p, spellId) {
  var voc = p.voc || "knight";
  var out = { damagePct: 0, healPct: 0, cooldownMs: 0, manaPct: 0, lifeLeech: 0, manaLeech: 0, critChance: 0, critDamage: 0, extraTarget: 0, area: false };
  // focus spells do sorcerer: pegam o upgrade "__focus__"
  var baseId = spellId;
  if (voc === "sorcerer" && WHEEL_FOCUS_SPELLS.indexOf(spellId) !== -1) baseId = "__focus__";
  var u = wheelSpellUpgrade(p, baseId);
  if (!u) return out;
  var b = u.bonus;
  out.damagePct = b.damage || 0;
  out.healPct = b.heal || 0;
  out.cooldownMs = (b.cooldown || 0) * 1000;
  out.manaPct = b.manaCost || 0;
  out.lifeLeech = b.lifeLeech || 0;
  out.manaLeech = b.manaLeech || 0;
  out.critChance = b.criticalChance || 0;
  out.critDamage = b.criticalDamage || 0;
  out.extraTarget = b.additionalTarget || 0;
  out.area = !!b.area;
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { ensureWheel, wheelPoints, wheelSpent, wheelAvail,
    wheelAllocate, wheelRemove, wheelCanAllocate, wheelTotals, wheelDamageMul,
    wheelHealMul, wheelSpellUpgrade, wheelApplySpellBoost, wheelMagicBonus,
    wheelSkillBonus, wheelLeechTotals, wheelAvatarLevel };
}
