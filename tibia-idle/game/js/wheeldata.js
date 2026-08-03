/* =========================================================================
 * wheeldata.js — dados da Wheel of Destiny (Roda do Destino)
 *
 * Portado fielmente do Canary (src/io/io_wheel.cpp, wheel_definitions.hpp,
 * player_wheel.cpp). A wheel tem 36 nos em 4 cores (verde, vermelho, azul,
 * roxo). Cada no tem um custo maximo em pontos (50/75/100/150/200), um minimo
 * de pontos totais para liberar e bonus por vocacao.
 *
 * Pontos: (nivel - 50) * 1 ponto por nivel + pontos de promotion scrolls.
 * Stages: cada cor soma os pontos dos nos dela; nos limiares 250/500/1000
 * concede o estagio 1/2/3 (revelation: +dano% e +cura% de {4,4}/{9,9}/{20,20})
 * e a habilidade de estagio da vocacao.
 * ========================================================================= */
"use strict";

/* Bonus de STAT por ponto, constante por vocacao (io_wheel.cpp):
 * health/mana/capacity por slot usam estes multiplicadores. */
const WHEEL_HP =  { knight: 3, paladin: 2, sorcerer: 1, druid: 1, monk: 2 };
const WHEEL_MP =  { knight: 1, paladin: 3, sorcerer: 6, druid: 6, monk: 2 };
const WHEEL_CAP = { knight: 5, paladin: 4, sorcerer: 2, druid: 2, monk: 5 };
// skill concedida (+1) ao MAXIMIZAR um no de skill (por vocacao)
const WHEEL_SKILL = { knight: "melee", paladin: "distance", sorcerer: "magic", druid: "magic", monk: "fist" };
// leech concedido ao MAXIMIZAR um no de leech
const WHEEL_LEECH = { life: 0.75, mana: 0.25 };
// mitigation por ponto (MITIGATION_INCREASE do io_wheel.cpp)
const WHEEL_MIT_PER_POINT = 0.03;

/* Configuracao de pontos (player_wheel.cpp / configmanager) */
const WHEEL_CONFIG = {
  minLevel: 50,                 // nivel minimo para desbloquear a wheel
  pointsPerLevel: 1,            // 1 ponto por nivel acima de 50
  minTotalBySlotCost: { 50: 50, 75: 50, 100: 125, 150: 225, 200: 375 },
  // promotion scrolls (wheel_scrolls.lua): { itemId, nome, pontos }
  scrolls: [
    { id: 43946, nome: "Abridged", pontos: 3, item: "abridged promotion scroll" },
    { id: 43947, nome: "Basic",    pontos: 5, item: "basic promotion scroll" },
    { id: 43948, nome: "Revised",  pontos: 9, item: "revised promotion scroll" },
    { id: 43949, nome: "Extended", pontos: 13, item: "extended promotion scroll" },
    { id: 43950, nome: "Advanced", pontos: 20, item: "advanced promotion scroll" },
  ],
  stageThresholds: [250, 500, 1000],   // pontos por cor para estagio 1/2/3
  revelation: [                       // {dano%, cura%} por estagio (io_wheel.hpp)
    { damage: 4, healing: 4 },
    { damage: 9, healing: 9 },
    { damage: 20, healing: 20 },
  ],
};

/* ------------------------------------------------------------------
 * Os 36 nos.
 * Campos:
 *   hp/mana/cap/mit  -> bonus por ponto (usa as tabelas de vocacao);
 *   skill:true       -> ao MAXIMIZAR, +1 na skill da vocacao (WHEEL_SKILL);
 *   leech:'life'|'mana' -> ao MAXIMIZAR, concede leech (WHEEL_LEECH);
 *   spell:{voc:id}   -> ao MAXIMIZAR, desbloqueia a magia da wheel;
 *   instant:{voc:nm} -> ao MAXIMIZAR, desbloqueia a habilidade instantanea.
 *   min              -> pontos totais minimos para comecar a alocar no no.
 * ------------------------------------------------------------------ */
const WHEEL_SLOTS = {
  // ============================= VERDE =============================
  GREEN_200: { color: "green", max: 200, min: 375, hp: true, mana: true,
    instant: { knight: "Battle Instinct", paladin: "Positional Tactics", sorcerer: "Runic Mastery", druid: "Healing Link", monk: "Guiding Presence" } },
  GREEN_TOP_150: { color: "green", max: 150, min: 225, mit: true, leech: "mana" },
  GREEN_TOP_100: { color: "green", max: 100, min: 125, hp: true },
  GREEN_MIDDLE_100: { color: "green", max: 100, min: 125, hp: true,
    spell: { knight: "exori-mas", paladin: "exori-gran-con", sorcerer: "utamo-vita", druid: "exura-gran-mas-res", monk: "exura-mas-nia" } },
  GREEN_BOTTOM_100: { color: "green", max: 100, min: 125, hp: true,
    spell: { knight: "exura-gran-ico", paladin: "utamo-tempo-san", sorcerer: "exevo-vis-hur", druid: "exevo-tera-hur", monk: "exori-med-pug" } },
  GREEN_BOTTOM_150: { color: "green", max: 150, min: 225, mit: true },
  GREEN_TOP_75: { color: "green", max: 75, min: 50, mana: true, leech: "life" },
  GREEN_BOTTOM_75: { color: "green", max: 75, min: 50, mana: true, skill: true },
  GREEN_50: { color: "green", max: 50, min: 0, cap: true },
  // ============================= VERMELHO =============================
  RED_200: { color: "red", max: 200, min: 375, hp: true, mana: true,
    spell: { knight: "exori-min", paladin: "utito-tempo-san", sorcerer: "__focus__", druid: "exevo-gran-frigo-hur", monk: "exori-mas-nia" } },
  RED_TOP_150: { color: "red", max: 150, min: 225, hp: true },
  RED_TOP_100: { color: "red", max: 100, min: 125, mana: true, skill: true },
  RED_MIDDLE_100: { color: "red", max: 100, min: 125, mana: true,
    spell: { knight: "exeta-amp-res", paladin: "exana-amp-res", sorcerer: "exori-kor", druid: "exura-gran-sio", monk: "exori-amp-pug" } },
  RED_BOTTOM_100: { color: "red", max: 100, min: 125, mana: true },
  RED_BOTTOM_150: { color: "red", max: 150, min: 225, hp: true, leech: "mana" },
  RED_TOP_75: { color: "red", max: 75, min: 50, cap: true },
  RED_BOTTOM_75: { color: "red", max: 75, min: 50, cap: true, leech: "life" },
  RED_50: { color: "red", max: 50, min: 0, mit: true,
    spell: { knight: "exori-gran", paladin: "exevo-mas-san", sorcerer: "exevo-gran-flam-hur", druid: "exura-sio", monk: "exori-mas-pug" } },
  // ============================= AZUL =============================
  BLUE_200: { color: "blue", max: 200, min: 375, hp: true, mana: true,
    spell: { knight: "exori-gran", paladin: "exevo-mas-san", sorcerer: "exevo-gran-flam-hur", druid: "exura-sio", monk: "exori-mas-pug" } },
  BLUE_TOP_150: { color: "blue", max: 150, min: 225, cap: true, leech: "life" },
  BLUE_TOP_100: { color: "blue", max: 100, min: 125, mit: true },
  BLUE_MIDDLE_100: { color: "blue", max: 100, min: 125, mit: true,
    spell: { knight: "exeta-amp-res", paladin: "exana-amp-res", sorcerer: "exori-kor", druid: "exura-gran-sio", monk: "exori-amp-pug" } },
  BLUE_BOTTOM_100: { color: "blue", max: 100, min: 125, mit: true, skill: true },
  BLUE_BOTTOM_150: { color: "blue", max: 150, min: 225, cap: true },
  BLUE_TOP_75: { color: "blue", max: 75, min: 50, hp: true, leech: "mana" },
  BLUE_BOTTOM_75: { color: "blue", max: 75, min: 50, hp: true },
  BLUE_50: { color: "blue", max: 50, min: 0, mana: true,
    spell: { knight: "exori-min", paladin: "utito-tempo-san", sorcerer: "__focus__", druid: "exevo-gran-frigo-hur", monk: "exori-mas-nia" } },
  // ============================= ROXO =============================
  PURPLE_200: { color: "purple", max: 200, min: 375, hp: true, mana: true,
    instant: { knight: "Battle Healing", paladin: "Ballistic Mastery", sorcerer: "Focus Mastery", druid: "Runic Mastery", monk: "Sanctuary" } },
  PURPLE_TOP_150: { color: "purple", max: 150, min: 225, mana: true },
  PURPLE_TOP_100: { color: "purple", max: 100, min: 125, cap: true,
    spell: { knight: "exori-mas", paladin: "exori-gran-con", sorcerer: "utamo-vita", druid: "exura-gran-mas-res", monk: "exura-mas-nia" } },
  PURPLE_MIDDLE_100: { color: "purple", max: 100, min: 125, cap: true,
    spell: { knight: "exura-gran-ico", paladin: "utamo-tempo-san", sorcerer: "exevo-vis-hur", druid: "exevo-tera-hur", monk: "exori-med-pug" } },
  PURPLE_BOTTOM_100: { color: "purple", max: 100, min: 125, cap: true },
  PURPLE_BOTTOM_150: { color: "purple", max: 150, min: 225, mana: true, leech: "life" },
  PURPLE_TOP_75: { color: "purple", max: 75, min: 50, mit: true, skill: true },
  PURPLE_BOTTOM_75: { color: "purple", max: 75, min: 50, mit: true, leech: "mana" },
  PURPLE_50: { color: "purple", max: 50, min: 0, hp: true },
};

/* Cores: ordem e rotulo para o UI */
const WHEEL_COLORS = {
  green:  { nome: "Verde",  cls: "green" },
  red:    { nome: "Vermelho", cls: "red" },
  blue:   { nome: "Azul",   cls: "blue" },
  purple: { nome: "Roxo",   cls: "purple" },
};

/* Habilidade de ESTAGIO por cor e vocacao (apply*StageBonus do canary) */
const WHEEL_STAGE_ABILITY = {
  green:  { knight: "Gift of Life", paladin: "Gift of Life", sorcerer: "Gift of Life", druid: "Gift of Life", monk: "Gift of Life" },
  red:    { knight: "Executioner's Throw", paladin: "Divine Grenade", sorcerer: "Beam Mastery", druid: "Blessing of the Grove", monk: "Spiritual Outburst" },
  purple: { knight: "Avatar of Steel", paladin: "Avatar of Light", sorcerer: "Avatar of Storm", druid: "Avatar of Nature", monk: "Avatar of Balance" },
  blue:   { knight: "Combat Mastery", paladin: "Divine Empowerment", sorcerer: "Drain Body", druid: "Twin Burst", monk: "Ascetic" },
};

/* =========================================================================
 * Upgrade de magias da wheel (grades 1 e 2) — portado de io_wheel.cpp.
 * Cada vocacao tem 5 magias "da wheel"; ao MAXIMIZAR o no de spell daquela
 * magia voce ganha o grade 1 (ou 2) com estes bonus.
 * ========================================================================= */
const WHEEL_SPELL_UPGRADES = {
  knight: [
    { name: "exori-min",  spell: "Front Sweep",              g1: { lifeLeech: 5 },                         g2: { damage: 14 } },
    { name: "exori-mas",  spell: "Groundshaker",             g1: { damage: 13 },                          g2: { cooldown: 2 } },
    { name: "exeta-amp-res", spell: "Chivalrous Challenge",  g1: { manaCost: 20 },                        g2: { additionalTarget: 1 } },
    { name: "exura-gran-ico", spell: "Intense Wound Cleansing", g1: { heal: 125 },                       g2: { cooldown: 300 } },
    { name: "exori-gran", spell: "Fierce Berserk",           g1: { manaCost: 30 },                        g2: { damage: 10 } },
  ],
  paladin: [
    { name: "utito-tempo-san", spell: "Sharpshooter",        g1: { secondaryGroupCooldown: 8 },          g2: { cooldown: 6 } },
    { name: "exori-gran-con", spell: "Strong Ethereal Spear",g1: { cooldown: 2 },                         g2: { damage: 380 } },
    { name: "exana-amp-res", spell: "Divine Dazzle",         g1: { additionalTarget: 1 },                 g2: { duration: 4, cooldown: 4 } },
    { name: "utamo-tempo-san", spell: "Swift Foot",          g1: { secondaryGroupCooldown: 8 },           g2: { cooldown: 6 } },
    { name: "exevo-mas-san", spell: "Divine Caldera",        g1: { manaCost: 20 },                        g2: { damage: 9 } },
  ],
  sorcerer: [
    { name: "utamo-vita", spell: "Magic Shield",             g1: {},                                      g2: { cooldown: 6 } },
    { name: "exori-kor", spell: "Sap Strength",              g1: { area: true },                          g2: { damageReduction: 1 } },
    { name: "exevo-vis-hur", spell: "Energy Wave",           g1: { damage: 5 },                           g2: { area: true } },
    { name: "exevo-gran-flam-hur", spell: "Great Fire Wave", g1: { criticalDamage: 15, criticalChance: 10 }, g2: { damage: 5 } },
    { name: "__focus__", spell: "Focus Mage Spells",         g1: { damage: 5 },                           g2: { cooldown: 4, secondaryGroupCooldown: 4 } },
  ],
  druid: [
    { name: "exevo-gran-frigo-hur", spell: "Strong Ice Wave",g1: { manaLeech: 3 },                        g2: { damage: 10 } },
    { name: "exura-gran-mas-res", spell: "Mass Healing",     g1: { heal: 4 },                             g2: { area: true } },
    { name: "exura-gran-sio", spell: "Nature's Embrace",     g1: { heal: 11 },                            g2: { cooldown: 10 } },
    { name: "exevo-tera-hur", spell: "Terra Wave",           g1: { damage: 7 },                           g2: { lifeLeech: 5 } },
    { name: "exura-sio", spell: "Heal Friend",               g1: { manaCost: 10 },                        g2: { heal: 6 } },
  ],
  monk: [
    { name: "exura-mas-nia", spell: "Mass Spirit Mend",      g1: { heal: 8 },                             g2: { area: true } },
    { name: "exori-amp-pug", spell: "Mystic Repulse",        g1: { cooldown: 4 },                         g2: { damage: 40 } },
    { name: "exori-med-pug", spell: "Chained Penance",       g1: { additionalTarget: 1 },                 g2: { additionalTarget: 2 } },
    { name: "exori-mas-pug", spell: "Flurry of Blows",       g1: { lifeLeech: 5 },                        g2: { damage: 12 } },
    { name: "exori-mas-nia", spell: "Sweeping Takedown",     g1: { manaLeech: 3 },                        g2: { criticalDamage: 25, criticalChance: 10 } },
  ],
};

if (typeof module !== "undefined") {
  module.exports = { WHEEL_SLOTS, WHEEL_CONFIG, WHEEL_HP, WHEEL_MP, WHEEL_CAP,
    WHEEL_SKILL, WHEEL_LEECH, WHEEL_MIT_PER_POINT, WHEEL_COLORS,
    WHEEL_STAGE_ABILITY, WHEEL_SPELL_UPGRADES };
}
