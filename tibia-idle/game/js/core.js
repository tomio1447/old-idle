/*
 * core.js — regras do Tibia Idle (formulas de XP, vocacao, combate e loot)
 * Baseado nas formulas reais do Tibia 7.4.
 */
"use strict";

const VOCATIONS = {
  none: {
    name: "Sem vocação", hpGain: 5, mpGain: 5, capGain: 10,
    weapon: "melee", magicFactor: 3.0, mpRegen: 6, hpRegen: 6,
    desc: "Rookgaard. Escolha uma vocação ao chegar no nível 8.",
  },
  knight: {
    name: "Knight", hpGain: 15, mpGain: 5, capGain: 25,
    weapon: "melee", magicFactor: 3.0, mpRegen: 6, hpRegen: 3,
    skillFactor: 1.1, defFactor: 1.0, atkFactor: 1.0,
    desc: "Tanque puro. Muita vida, skills de melee sobem rápido.",
  },
  paladin: {
    name: "Paladin", hpGain: 10, mpGain: 15, capGain: 20,
    weapon: "distance", magicFactor: 1.4, mpRegen: 4, hpRegen: 4,
    skillFactor: 1.2, defFactor: 1.1, atkFactor: 1.0,
    desc: "Distância. Equilíbrio entre dano, vida e mana.",
  },
  druid: {
    name: "Druid", hpGain: 5, mpGain: 30, capGain: 10,
    weapon: "magic", magicFactor: 1.1, mpRegen: 3, hpRegen: 6,
    skillFactor: 1.8, defFactor: 1.0, atkFactor: 1.0,
    desc: "Magia de gelo/terra e cura forte. Muita mana.",
  },
  sorcerer: {
    name: "Sorcerer", hpGain: 5, mpGain: 30, capGain: 10,
    weapon: "magic", magicFactor: 1.1, mpRegen: 3, hpRegen: 6,
    skillFactor: 1.8, defFactor: 1.0, atkFactor: 1.0,
    desc: "Magia de fogo/energia. O maior dano mágico do jogo.",
  },
};

/* Constantes de skill do Tibia real: [const, factor] por vocacao */
const SKILL_CONST = {
  knight:   { melee: 1.1, dist: 1.4, shield: 1.1, magic: 3.0, fist: 1.1 },
  paladin:  { melee: 1.2, dist: 1.1, shield: 1.1, magic: 1.4, fist: 1.2 },
  druid:    { melee: 1.8, dist: 1.8, shield: 1.5, magic: 1.1, fist: 1.5 },
  sorcerer: { melee: 2.0, dist: 2.0, shield: 1.5, magic: 1.1, fist: 1.5 },
  none:     { melee: 1.5, dist: 2.0, shield: 1.5, magic: 3.0, fist: 1.5 },
};

/* XP total necessaria para atingir um nivel (formula oficial do Tibia) */
function expForLevel(lvl) {
  return Math.floor((50 / 3) * (lvl * lvl * lvl - 6 * lvl * lvl + 17 * lvl - 12));
}

/* Stages de experiencia (estilo servidor Baiak): multiplica a XP por nivel.
 * Alto no comeco para tirar o char de Rookgaard rapido, suave depois. */
const EXP_STAGES = [
  { max: 8, mul: 6 },
  { max: 20, mul: 4 },
  { max: 50, mul: 3 },
  { max: 100, mul: 2.2 },
  { max: 200, mul: 1.7 },
  { max: 350, mul: 1.4 },
  { max: Infinity, mul: 1.2 },
];

function expStage(level) {
  for (const s of EXP_STAGES) if (level <= s.max) return s.mul;
  return 25;
}

/* Multiplicador de ouro conforme o nivel da area (economia escalada).
 * Precisa acompanhar o custo dos supplies, que tambem escala com o nivel. */
function goldStage(huntLevel) {
  return 1 + huntLevel * 0.55;
}

/* Pontos de skill necessarios para subir de um nivel de skill */
function skillCost(level, base, factor) {
  return Math.floor(base * Math.pow(factor, level - 10));
}

/* Pontos totais para chegar num nivel de skill a partir do minimo */
function skillTotalCost(target, minLevel, base, factor) {
  let sum = 0;
  for (let i = minLevel; i < target; i++) sum += skillCost(i, base, factor);
  return sum;
}

/* Mana necessaria para subir 1 magic level */
function mlCost(level, factor) {
  return Math.floor(1600 * Math.pow(factor, level));
}

/* --------------------------------------------------------- combate */

/* Dano de arma melee do Tibia: skill e attack do item */
function meleeDamage(skill, attack, factor) {
  const max = Math.floor((skill + 4) * attack * 0.085 * factor);
  return { min: 0, max: Math.max(1, max) };
}

/* Dano de arma de distancia */
function distanceDamage(skill, attack, factor) {
  const max = Math.floor((skill + 4) * attack * 0.085 * factor);
  return { min: 0, max: Math.max(1, max) };
}

/* Dano magico (strike) — escala com magic level e nivel */
function magicDamage(level, ml, base) {
  const max = Math.floor((level / 5 + ml * 2.0) * (base / 20) + base / 2);
  return { min: Math.floor(max * 0.55), max: Math.max(1, max) };
}

/* Reducao de dano por armadura + defesa (aproximacao do Tibia) */
function mitigate(raw, armor, defense, shielding) {
  // armadura reduz um valor plano aleatorio entre armor/2 e armor
  const armorRed = armor * 0.5 + Math.random() * armor * 0.5;
  // bloqueio por defesa+shielding: chance de reduzir bastante
  const blockPower = defense * (1 + shielding / 100);
  let dmg = raw - armorRed;
  if (Math.random() * 100 < Math.min(65, blockPower * 0.6)) {
    dmg -= blockPower * (0.4 + Math.random() * 0.6);
  }
  return Math.max(0, dmg);
}

/* Chance de acerto de arma de distancia por skill */
function hitChance(skill) {
  return Math.min(0.95, 0.35 + skill * 0.006);
}

/* Regeneracao de HP/MP por tick (segundos entre pontos) */
function regenRate(voc, hasLifeRing) {
  const v = VOCATIONS[voc];
  return {
    hp: hasLifeRing ? Math.max(2, v.hpRegen - 3) : v.hpRegen,
    mp: hasLifeRing ? Math.max(1, v.mpRegen - 2) : v.mpRegen,
  };
}

/* Stats maximos derivados do nivel */
function baseStats(voc, level) {
  const v = VOCATIONS[voc];
  // rookgaard: 5/5/10 por nivel ate o 8
  const rookLvls = Math.min(level - 1, 7);
  const vocLvls = Math.max(0, level - 1 - rookLvls);
  return {
    hp: 150 + rookLvls * 5 + vocLvls * v.hpGain,
    mp: 0 + rookLvls * 5 + vocLvls * v.mpGain,
    cap: 400 + rookLvls * 10 + vocLvls * v.capGain,
  };
}

/* Velocidade de ataque em ms segundo a arma */
const ATTACK_SPEED = { melee: 2000, distance: 2000, magic: 2000 };

/* Elementos e seus icones/cores */
const ELEMENTS = {
  physical: { name: "Físico", color: "#d8d8d8", fx: "draw-blood" },
  fire:     { name: "Fogo",   color: "#ff8a3c", fx: "hit-by-fire" },
  ice:      { name: "Gelo",   color: "#7ec8ff", fx: "magic-blue" },
  energy:   { name: "Energia",color: "#c07cff", fx: "energy-damage" },
  earth:    { name: "Terra",  color: "#8ac83c", fx: "hit-by-poison" },
  death:    { name: "Morte",  color: "#8a5aa8", fx: "mort-area" },
  holy:     { name: "Sagrado",color: "#ffe680", fx: "yellow-rings" },
};

/* Spells por vocacao: dano/cura, custo de mana, cooldown */
const SPELLS = {
  "exura":        { name: "Exura", type: "heal", mana: 20, cd: 1000, lvl: 8,
                    vocs: ["druid", "sorcerer", "paladin", "knight"],
                    power: 1.0, label: "Cura leve" },
  "exura-gran":   { name: "Exura Gran", type: "heal", mana: 70, cd: 1000, lvl: 20,
                    vocs: ["druid", "sorcerer"], power: 2.4, label: "Cura média" },
  "exura-vita":   { name: "Exura Vita", type: "heal", mana: 160, cd: 1000, lvl: 30,
                    vocs: ["druid", "sorcerer"], power: 5.0, label: "Cura forte" },
  "exura-ico":    { name: "Exura Ico", type: "heal", mana: 40, cd: 1000, lvl: 8,
                    vocs: ["knight"], power: 1.6, label: "Cura de knight" },
  "exura-san":    { name: "Exura San", type: "heal", mana: 100, cd: 1000, lvl: 35,
                    vocs: ["paladin"], power: 3.0, label: "Cura de paladin" },
  "exori":        { name: "Exori", type: "attack", mana: 115, cd: 4000, lvl: 35,
                    vocs: ["knight"], power: 1.0, element: "physical",
                    area: true, label: "Golpe em área (melee)" },
  "exori-gran":   { name: "Exori Gran", type: "attack", mana: 340, cd: 6000, lvl: 90,
                    vocs: ["knight"], power: 2.2, element: "physical",
                    label: "Golpe crítico pesado" },
  "exori-con":    { name: "Exori Con", type: "attack", mana: 25, cd: 2000, lvl: 23,
                    vocs: ["paladin"], power: 1.4, element: "physical",
                    label: "Tiro certeiro" },
  "exevo-mas-san":{ name: "Exevo Mas San", type: "attack", mana: 160, cd: 8000, lvl: 50,
                    vocs: ["paladin"], power: 2.0, element: "holy",
                    area: true, label: "Chuva sagrada" },
  "exori-flam":   { name: "Exori Flam", type: "attack", mana: 20, cd: 2000, lvl: 12,
                    vocs: ["sorcerer"], power: 0.7, element: "fire",
                    label: "Chama" },
  "exori-vis":    { name: "Exori Vis", type: "attack", mana: 20, cd: 2000, lvl: 12,
                    vocs: ["sorcerer"], power: 0.8, element: "energy",
                    label: "Raio de energia" },
  "exevo-flam-hur":{name: "Exevo Flam Hur", type: "attack", mana: 45, cd: 4000, lvl: 18,
                    vocs: ["sorcerer"], power: 1.2, element: "fire",
                    area: true, label: "Onda de fogo" },
  "exevo-vis-hur":{ name: "Exevo Vis Hur", type: "attack", mana: 170, cd: 6000, lvl: 38,
                    vocs: ["sorcerer"], power: 1.8, element: "energy",
                    area: true, label: "Onda de energia" },
  "exevo-gran-mas-vis": { name: "Exevo Gran Mas Vis", type: "attack", mana: 1050,
                    cd: 40000, lvl: 60, vocs: ["sorcerer"], power: 5.0,
                    element: "energy", area: true, label: "Ultimate energy" },
  "exori-frigo":  { name: "Exori Frigo", type: "attack", mana: 20, cd: 2000, lvl: 12,
                    vocs: ["druid"], power: 0.8, element: "ice",
                    label: "Estilhaço de gelo" },
  "exori-tera":   { name: "Exori Tera", type: "attack", mana: 20, cd: 2000, lvl: 12,
                    vocs: ["druid"], power: 0.7, element: "earth",
                    label: "Espinho de terra" },
  "exevo-frigo-hur": { name: "Exevo Frigo Hur", type: "attack", mana: 170, cd: 6000,
                    lvl: 38, vocs: ["druid"], power: 1.8, element: "ice",
                    area: true, label: "Onda de gelo" },
  "exevo-gran-mas-frigo": { name: "Exevo Gran Mas Frigo", type: "attack", mana: 1050,
                    cd: 40000, lvl: 60, vocs: ["druid"], power: 5.0,
                    element: "ice", area: true, label: "Ultimate ice" },
  "utani-hur":    { name: "Utani Hur", type: "buff", mana: 60, cd: 2000, lvl: 14,
                    vocs: ["knight", "paladin", "druid", "sorcerer"],
                    duration: 60000, label: "Haste (+velocidade de ataque)" },
  "utamo-vita":   { name: "Utamo Vita", type: "buff", mana: 50, cd: 2000, lvl: 14,
                    vocs: ["knight", "paladin", "druid", "sorcerer"],
                    duration: 60000, label: "Escudo mágico (absorve dano)" },
};

/* Supplies por carga. `scale` faz a cura/dano acompanhar o nivel do char;
 * o gold só é descontado quando uma carga selecionada está 0 e precisa ser usada. */
const SUPPLIES = {
  "intense-healing-rune": { name: "Intense Healing Rune", price: 95,
    heal: [95, 175], scale: 0.9, type: "heal", tier: 1, lvl: 1,
    sprite: "intense-healing-rune" },
  "ultimate-healing-rune": { name: "Ultimate Healing Rune", price: 175,
    heal: [250, 350], scale: 2.2, type: "heal", tier: 2, lvl: 24,
    sprite: "ultimate-healing-rune" },
  "heavy-magic-missile-rune": { name: "Heavy Magic Missile", price: 25,
    damage: [20, 45], scale: 0.6, type: "attack", element: "energy",
    tier: 1, lvl: 25, sprite: "heavy-magic-missile-rune" },
  "explosion-rune": { name: "Explosion Rune", price: 55,
    damage: [50, 100], scale: 1.1, type: "attack", element: "physical",
    tier: 2, lvl: 31, sprite: "explosion-rune" },
  "great-fireball-rune": { name: "Great Fireball Rune", price: 65,
    damage: [60, 120], scale: 1.4, type: "attack", element: "fire",
    tier: 3, lvl: 30, sprite: "great-fireball-rune" },
  "sudden-death-rune": { name: "Sudden Death Rune", price: 155,
    damage: [150, 250], scale: 2.6, type: "attack", element: "death",
    tier: 4, lvl: 45, sprite: "sudden-death-rune" },
  "brown-mushroom": { name: "Brown Mushroom", price: 50, mana: [50, 100],
    scale: 1.2, type: "mana", tier: 1, lvl: 1, sprite: "brown-mushroom" },
  "dragon-ham": { name: "Dragon Ham", price: 30, food: 360, type: "food",
    tier: 1, lvl: 1, sprite: "dragon-ham" },
};

if (typeof GAMEDATA !== "undefined" && GAMEDATA.items && !GAMEDATA.items["mystic-dust"]) {
  GAMEDATA.items["mystic-dust"] = {
    n: "poeira mistica", s: null, t: "loot", sell: 0, w: 0.1,
  };
}

/* Cura/dano efetivo de um supply para um dado nivel */
function supplyPower(s, level) {
  const arr = s.heal || s.damage || s.mana;
  if (!arr) return [0, 0];
  const bonus = (s.scale || 0) * level;
  return [Math.floor(arr[0] + bonus), Math.floor(arr[1] + bonus * 1.35)];
}

/* Preco de compra escala com o nivel (supply que cura mais custa mais) */
function supplyPrice(s, level) {
  return Math.floor(s.price * (1 + (s.scale || 0) * level * 0.012));
}

if (typeof module !== "undefined") {
  module.exports = { VOCATIONS, SKILL_CONST, expForLevel, skillCost,
    skillTotalCost, mlCost, meleeDamage, distanceDamage, magicDamage,
    mitigate, hitChance, regenRate, baseStats, ATTACK_SPEED, ELEMENTS,
    SPELLS, SUPPLIES };
}
