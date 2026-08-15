/*
 * rates.js — Sistema de rates do servidor (estágios por nível/skill/magic).
 *
 * Rates do servidor old-idle:
 *   - Experience: stages por level (50x até 8, 80x até 50, etc.)
 *   - Skill: stages por skill level (10x até 80, 7x até 100, etc.)
 *   - Magic: stages por magic level (10x até 80, 7x até 100, etc.)
 *   - Loot: 2.5x
 *   - Bestiário: 2x
 *
 * Os rates são aplicados como DIVISORES de custo: rate 10x significa que
 * o custo de XP/skill/mana é DIVIDIDO por 10 (progressa 10x mais rápido).
 * Para loot, o rate multiplica SOMENTE a chance de cada entrada (cap 100%);
 * a quantidade fica no min–max Canary/wiki — nunca count*SERVER_LOOT_RATE.
 * Para bestiário, o rate multiplica o número de kills contados.
 */
"use strict";

/* ── Experience Stages ──
 * Do Level | Até Level | Multiplicador
 *    1       8           50x
 *    9       50          80x
 *    51      100         60x
 *    101     150         40x
 *    151     200         30x
 *    201     300         15x
 *    301     400         12x
 *    401     500         10x
 *    501     600         7x
 *    601     700         6x
 *    701     800         5x
 *    801     900         4x
 *    901     1000        3x
 *   1001     1200        2x
 *   1201     1400        1.5x
 *   1401     ∞           1.2x
 */
const SERVER_EXP_STAGES = [
  { min: 1,    max: 8,    rate: 50 },
  { min: 9,    max: 50,   rate: 80 },
  { min: 51,   max: 100,  rate: 60 },
  { min: 101,  max: 150,  rate: 40 },
  { min: 151,  max: 200,  rate: 30 },
  { min: 201,  max: 300,  rate: 15 },
  { min: 301,  max: 400,  rate: 12 },
  { min: 401,  max: 500,  rate: 10 },
  { min: 501,  max: 600,  rate: 7 },
  { min: 601,  max: 700,  rate: 6 },
  { min: 701,  max: 800,  rate: 5 },
  { min: 801,  max: 900,  rate: 4 },
  { min: 901,  max: 1000, rate: 3 },
  { min: 1001, max: 1200, rate: 2 },
  { min: 1201, max: 1400, rate: 1.5 },
  { min: 1401, max: Infinity, rate: 1.2 },
];

/* ── Skill Stages ──
 * Do Skill | Até Skill | Multiplicador
 *    1       80          10x
 *   81       100         7x
 *   101      120         4x
 *   121      ∞           2x
 */
const SERVER_SKILL_STAGES = [
  { min: 1,   max: 80,  rate: 10 },
  { min: 81,  max: 100, rate: 7 },
  { min: 101, max: 120, rate: 4 },
  { min: 121, max: Infinity, rate: 2 },
];

/* ── Magic Stages ──
 * Do Magic | Até Magic | Multiplicador
 *    0       80          10x
 *   81       100         7x
 *   101      120         4x
 *   121      130         3x
 *   131      ∞           2x
 */
const SERVER_MAGIC_STAGES = [
  { min: 0,   max: 80,  rate: 10 },
  { min: 81,  max: 100, rate: 7 },
  { min: 101, max: 120, rate: 4 },
  { min: 121, max: 130, rate: 3 },
  { min: 131, max: Infinity, rate: 2 },
];

/* Loot rate global */
const SERVER_LOOT_RATE = 2.5;

/* Bestiário rate global (kills contam 2x) */
const SERVER_BESTIARY_RATE = 2;

/* ── Funções de lookup ── */

function serverExpRate(level) {
  for (const s of SERVER_EXP_STAGES) {
    if (level >= s.min && level <= s.max) return s.rate;
  }
  return 1.2;
}

function serverSkillRate(skillLevel) {
  for (const s of SERVER_SKILL_STAGES) {
    if (skillLevel >= s.min && skillLevel <= s.max) return s.rate;
  }
  return 2;
}

function serverMagicRate(magicLevel) {
  for (const s of SERVER_MAGIC_STAGES) {
    if (magicLevel >= s.min && magicLevel <= s.max) return s.rate;
  }
  return 2;
}
