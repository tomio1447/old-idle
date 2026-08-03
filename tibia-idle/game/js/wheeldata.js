/* =========================================================================
 * wheeldata.js — dados da Wheel of Destiny (Roda do Destino)
 *
 * Portado fielmente do Canary (io_wheel.cpp / wheel_definitions.hpp) para a
 * LOGICA e do otclient oficial (buttons.lua / wheelnode.lua / geometry.lua)
 * para o LAYOUT VISUAL e as CONEXOES dos 36 nos.
 *
 * Layout: 4 quadrantes de cores (verde=superior-esq, vermelho=superior-dir,
 * azul=inferior-esq, roxo=inferior-dir). Cada no tem posicao pixel exata na
 * roda de 522x522 (centro 261,261), calculada com a MESMA formula do cliente:
 *   ang = (slice + 0.5) * 360 / totalSlice
 *   x   = 261 + radius * cos(ang)   |   y = 261 + radius * sin(ang)
 * com raios 261/215/160/106/53.
 * ========================================================================= */
"use strict";

/* Bonus de STAT por ponto, constante por vocacao (io_wheel.cpp) */
const WHEEL_HP =  { knight: 3, paladin: 2, sorcerer: 1, druid: 1, monk: 2 };
const WHEEL_MP =  { knight: 1, paladin: 3, sorcerer: 6, druid: 6, monk: 2 };
const WHEEL_CAP = { knight: 5, paladin: 4, sorcerer: 2, druid: 2, monk: 5 };
const WHEEL_SKILL = { knight: "melee", paladin: "distance", sorcerer: "magic", druid: "magic", monk: "fist" };
const WHEEL_LEECH = { life: 0.75, mana: 0.25 };
const WHEEL_MIT_PER_POINT = 0.03;

/* Configuracao de pontos (player_wheel.cpp / configmanager) */
const WHEEL_CONFIG = {
  minLevel: 50,
  pointsPerLevel: 1,
  // pontos TOTAIS minimos para comecar um no (canary canSelectSlot)
  minTotalBySlotCost: { 50: 0, 75: 50, 100: 125, 150: 225, 200: 375 },
  scrolls: [
    { id: 43946, nome: "Abridged", pontos: 3, item: "Abridged promotion scroll" },
    { id: 43947, nome: "Basic",    pontos: 5, item: "Basic promotion scroll" },
    { id: 43948, nome: "Revised",  pontos: 9, item: "Revised promotion scroll" },
    { id: 43949, nome: "Extended", pontos: 13, item: "Extended promotion scroll" },
    { id: 43950, nome: "Advanced", pontos: 20, item: "Advanced promotion scroll" },
  ],
  stageThresholds: [250, 500, 1000],
  revelation: [
    { damage: 4, healing: 4 },
    { damage: 9, healing: 9 },
    { damage: 20, healing: 20 },
  ],
};

/* Cores: rotulo e CSS */
const WHEEL_COLORS = {
  green:  { nome: "Verde",  cls: "green" },
  red:    { nome: "Vermelho", cls: "red" },
  blue:   { nome: "Azul",   cls: "blue" },
  purple: { nome: "Roxo",   cls: "purple" },
};

/* Posicao pixel exata de cada no na roda 522x522 (centro 261,261) */
const WHEEL_POS = {
  "GREEN_200":[76.4,76.4],"GREEN_TOP_150":[178.7,62.4],"GREEN_TOP_100":[219.6,106.5],
  "GREEN_BOTTOM_150":[62.4,178.7],"GREEN_MIDDLE_100":[147.9,147.9],"GREEN_TOP_75":[220.4,163.1],
  "GREEN_BOTTOM_100":[106.5,219.6],"GREEN_BOTTOM_75":[163.1,220.4],"GREEN_50":[223.5,223.5],
  "RED_TOP_100":[302.4,106.5],"RED_TOP_150":[343.3,62.4],"RED_200":[445.6,76.4],
  "RED_TOP_75":[301.6,163.1],"RED_MIDDLE_100":[374.1,147.9],"RED_BOTTOM_150":[459.6,178.7],
  "RED_50":[298.5,223.5],"RED_BOTTOM_75":[358.9,220.4],"RED_BOTTOM_100":[415.5,219.6],
  "BLUE_TOP_100":[106.5,302.4],"BLUE_TOP_75":[163.1,301.6],"BLUE_50":[223.5,298.5],
  "BLUE_TOP_150":[62.4,343.3],"BLUE_MIDDLE_100":[147.9,374.1],"BLUE_BOTTOM_75":[220.4,358.9],
  "BLUE_200":[76.4,445.6],"BLUE_BOTTOM_150":[178.7,459.6],"BLUE_BOTTOM_100":[219.6,415.5],
  "PURPLE_50":[298.5,298.5],"PURPLE_TOP_75":[358.9,301.6],"PURPLE_BOTTOM_75":[301.6,358.9],
  "PURPLE_TOP_100":[415.5,302.4],
  "PURPLE_MIDDLE_100":[374.1,374.1],"PURPLE_TOP_150":[459.6,343.3],"PURPLE_BOTTOM_100":[302.4,415.5],
  "PURPLE_BOTTOM_150":[343.3,459.6],"PURPLE_200":[445.6,445.6],
};

/* Conexoes de ADJACENCIA do cliente (wheelnode.lua `connecteds`): para cada
 * no, os vizinhos que podem destrava-lo. A regra do cliente: um no so pode
 * receber pontos se existir um CAMINHO dele ate uma raiz (no _50) passando
 * por nos totalmente maximizados. */
const WHEEL_CONNECTED = {
  // raizes (50): sempre selecionaveis
  "GREEN_50": [], "RED_50": [], "BLUE_50": [], "PURPLE_50": [],
  // verde
  "GREEN_TOP_75": ["GREEN_BOTTOM_75","GREEN_50","RED_TOP_75","GREEN_TOP_100","GREEN_MIDDLE_100"],
  "GREEN_BOTTOM_75": ["GREEN_TOP_75","GREEN_50","BLUE_TOP_75","GREEN_MIDDLE_100","GREEN_BOTTOM_100"],
  "GREEN_TOP_100": ["GREEN_MIDDLE_100","GREEN_TOP_75","RED_TOP_100","GREEN_TOP_150"],
  "GREEN_MIDDLE_100": ["GREEN_BOTTOM_75","GREEN_TOP_75","GREEN_BOTTOM_100","GREEN_TOP_100","GREEN_BOTTOM_150","GREEN_TOP_150"],
  "GREEN_BOTTOM_100": ["GREEN_MIDDLE_100","GREEN_BOTTOM_75","BLUE_TOP_100","GREEN_BOTTOM_150"],
  "GREEN_TOP_150": ["GREEN_TOP_100","GREEN_MIDDLE_100","GREEN_BOTTOM_150","GREEN_200"],
  "GREEN_BOTTOM_150": ["GREEN_MIDDLE_100","GREEN_BOTTOM_100","GREEN_TOP_150","GREEN_200"],
  "GREEN_200": ["GREEN_TOP_150","GREEN_BOTTOM_150"],
  // vermelho
  "RED_TOP_75": ["GREEN_TOP_75","RED_50","RED_BOTTOM_75","RED_TOP_100","RED_MIDDLE_100"],
  "RED_BOTTOM_75": ["RED_TOP_75","RED_50","PURPLE_TOP_75","RED_MIDDLE_100","RED_BOTTOM_100"],
  "RED_TOP_100": ["GREEN_TOP_100","RED_TOP_75","RED_MIDDLE_100","RED_TOP_150"],
  "RED_MIDDLE_100": ["RED_TOP_75","RED_BOTTOM_75","RED_TOP_100","RED_BOTTOM_100","RED_TOP_150","RED_BOTTOM_150"],
  "RED_BOTTOM_100": ["RED_BOTTOM_75","RED_MIDDLE_100","PURPLE_TOP_100","RED_BOTTOM_150"],
  "RED_TOP_150": ["RED_TOP_100","RED_MIDDLE_100","RED_BOTTOM_150","RED_200"],
  "RED_BOTTOM_150": ["RED_MIDDLE_100","RED_BOTTOM_100","RED_TOP_150","RED_200"],
  "RED_200": ["RED_TOP_150","RED_BOTTOM_150"],
  // azul
  "BLUE_TOP_75": ["BLUE_50","GREEN_BOTTOM_75","BLUE_BOTTOM_75","BLUE_TOP_100","BLUE_MIDDLE_100"],
  "BLUE_BOTTOM_75": ["BLUE_50","PURPLE_BOTTOM_75","BLUE_TOP_75","BLUE_MIDDLE_100","BLUE_BOTTOM_100"],
  "BLUE_TOP_100": ["GREEN_BOTTOM_100","BLUE_TOP_75","BLUE_MIDDLE_100","BLUE_TOP_150"],
  "BLUE_MIDDLE_100": ["BLUE_BOTTOM_75","BLUE_TOP_75","BLUE_TOP_100","BLUE_BOTTOM_100","BLUE_TOP_150","BLUE_BOTTOM_150"],
  "BLUE_BOTTOM_100": ["BLUE_BOTTOM_75","PURPLE_BOTTOM_100","BLUE_MIDDLE_100","BLUE_BOTTOM_150"],
  "BLUE_TOP_150": ["BLUE_TOP_100","BLUE_MIDDLE_100","BLUE_BOTTOM_150","BLUE_200"],
  "BLUE_BOTTOM_150": ["BLUE_MIDDLE_100","BLUE_BOTTOM_100","BLUE_TOP_150","BLUE_200"],
  "BLUE_200": ["BLUE_TOP_150","BLUE_BOTTOM_150"],
  // roxo
  "PURPLE_TOP_75": ["PURPLE_50","PURPLE_BOTTOM_75","RED_BOTTOM_75","PURPLE_TOP_100","PURPLE_MIDDLE_100"],
  "PURPLE_BOTTOM_75": ["PURPLE_50","PURPLE_TOP_75","BLUE_BOTTOM_75","PURPLE_MIDDLE_100","PURPLE_BOTTOM_100"],
  "PURPLE_TOP_100": ["PURPLE_TOP_75","RED_BOTTOM_100","PURPLE_MIDDLE_100","PURPLE_TOP_150"],
  "PURPLE_MIDDLE_100": ["PURPLE_TOP_75","PURPLE_BOTTOM_75","PURPLE_TOP_100","PURPLE_BOTTOM_100","PURPLE_TOP_150","PURPLE_BOTTOM_150"],
  "PURPLE_BOTTOM_100": ["PURPLE_BOTTOM_75","BLUE_BOTTOM_100","PURPLE_MIDDLE_100","PURPLE_BOTTOM_150"],
  "PURPLE_TOP_150": ["PURPLE_TOP_100","PURPLE_MIDDLE_100","PURPLE_BOTTOM_150","PURPLE_200"],
  "PURPLE_BOTTOM_150": ["PURPLE_MIDDLE_100","PURPLE_BOTTOM_100","PURPLE_TOP_150","PURPLE_200"],
  "PURPLE_200": ["PURPLE_TOP_150","PURPLE_BOTTOM_150"],
};

/* ------------------------------------------------------------------
 * Os 36 nos. Campos:
 *   color, max (custo max em pontos), pos (WHEEL_POS)
 *   hp/mana/cap/mit -> bonus por ponto
 *   skill:true      -> ao MAXIMIZAR, +1 na skill da vocacao
 *   leech           -> ao MAXIMIZAR, concede leech
 *   spell:{voc:id}  -> ao MAXIMIZAR, desbloqueia a magia da wheel
 *   instant:{voc:nm}-> ao MAXIMIZAR, desbloqueia habilidade instantanea
 *   border          -> imagem de borda do cliente (assets/wheel/border/...)
 * ------------------------------------------------------------------ */
const WHEEL_SLOTS = {
  // ============================= VERDE =============================
  "GREEN_50":      { color:"green", max:50, min:0,   cap:true,
                     border:["top_left",1] },
  "GREEN_TOP_75":  { color:"green", max:75, min:50,  mana:true, leech:"life",
                     border:["top_left",3] },
  "GREEN_BOTTOM_75":{ color:"green", max:75, min:50, mana:true, skill:true,
                     border:["top_left",2] },
  "GREEN_TOP_100": { color:"green", max:100, min:125, hp:true,
                     border:["top_left",6] },
  "GREEN_MIDDLE_100":{ color:"green", max:100, min:125, hp:true,
                     spell:{ knight:"exori-mas", paladin:"exori-gran-con", sorcerer:"utamo-vita", druid:"exura-gran-mas-res", monk:"exura-mas-nia" },
                     border:["top_left",5] },
  "GREEN_BOTTOM_100":{ color:"green", max:100, min:125, hp:true,
                     spell:{ knight:"exura-gran-ico", paladin:"utamo-tempo-san", sorcerer:"exevo-vis-hur", druid:"exevo-tera-hur", monk:"exori-med-pug" },
                     border:["top_left",4] },
  "GREEN_TOP_150": { color:"green", max:150, min:225, mit:true, leech:"mana",
                     border:["top_left",8] },
  "GREEN_BOTTOM_150":{ color:"green", max:150, min:225, mit:true,
                     border:["top_left",7] },
  "GREEN_200":     { color:"green", max:200, min:375, hp:true, mana:true,
                     instant:{ knight:"Battle Instinct", paladin:"Positional Tactics", sorcerer:"Runic Mastery", druid:"Healing Link", monk:"Guiding Presence" },
                     border:["top_left",9] },
  // ============================= VERMELHO =============================
  "RED_50":        { color:"red", max:50, min:0,   mit:true,
                     spell:{ knight:"exori-gran", paladin:"exevo-mas-san", sorcerer:"exevo-gran-flam-hur", druid:"exura-sio", monk:"exori-mas-pug" },
                     border:["top_right",1] },
  "RED_TOP_75":    { color:"red", max:75, min:50,  cap:true,
                     border:["top_right",3] },
  "RED_BOTTOM_75": { color:"red", max:75, min:50,  cap:true, leech:"life",
                     border:["top_right",2] },
  "RED_TOP_100":   { color:"red", max:100, min:125, mana:true, skill:true,
                     border:["top_right",6] },
  "RED_MIDDLE_100":{ color:"red", max:100, min:125, mana:true,
                     spell:{ knight:"exeta-amp-res", paladin:"exana-amp-res", sorcerer:"exori-kor", druid:"exura-gran-sio", monk:"exori-amp-pug" },
                     border:["top_right",5] },
  "RED_BOTTOM_100":{ color:"red", max:100, min:125, mana:true,
                     border:["top_right",4] },
  "RED_TOP_150":   { color:"red", max:150, min:225, hp:true,
                     border:["top_right",8] },
  "RED_BOTTOM_150":{ color:"red", max:150, min:225, hp:true, leech:"mana",
                     border:["top_right",7] },
  "RED_200":       { color:"red", max:200, min:375, hp:true, mana:true,
                     spell:{ knight:"exori-min", paladin:"utito-tempo-san", sorcerer:"__focus__", druid:"exevo-gran-frigo-hur", monk:"exori-mas-nia" },
                     border:["top_right",9] },
  // ============================= AZUL =============================
  "BLUE_50":       { color:"blue", max:50, min:0,   mana:true,
                     spell:{ knight:"exori-min", paladin:"utito-tempo-san", sorcerer:"__focus__", druid:"exevo-gran-frigo-hur", monk:"exori-mas-nia" },
                     border:["bottom_left",1] },
  "BLUE_TOP_75":   { color:"blue", max:75, min:50,  hp:true, leech:"mana",
                     border:["bottom_left",2] },
  "BLUE_BOTTOM_75":{ color:"blue", max:75, min:50,  hp:true,
                     border:["bottom_left",3] },
  "BLUE_TOP_100":  { color:"blue", max:100, min:125, mit:true,
                     border:["bottom_left",4] },
  "BLUE_MIDDLE_100":{ color:"blue", max:100, min:125, mit:true,
                     spell:{ knight:"exeta-amp-res", paladin:"exana-amp-res", sorcerer:"exori-kor", druid:"exura-gran-sio", monk:"exori-amp-pug" },
                     border:["bottom_left",5] },
  "BLUE_BOTTOM_100":{ color:"blue", max:100, min:125, mit:true, skill:true,
                     border:["bottom_left",6] },
  "BLUE_TOP_150":  { color:"blue", max:150, min:225, cap:true, leech:"life",
                     border:["bottom_left",8] },
  "BLUE_BOTTOM_150":{ color:"blue", max:150, min:225, cap:true,
                     border:["bottom_left",7] },
  "BLUE_200":      { color:"blue", max:200, min:375, hp:true, mana:true,
                     spell:{ knight:"exori-gran", paladin:"exevo-mas-san", sorcerer:"exevo-gran-flam-hur", druid:"exura-sio", monk:"exori-mas-pug" },
                     border:["bottom_left",9] },
  // ============================= ROXO =============================
  "PURPLE_50":     { color:"purple", max:50, min:0,   hp:true,
                     border:["bottom_right",1] },
  "PURPLE_TOP_75": { color:"purple", max:75, min:50,  mit:true, skill:true,
                     border:["bottom_right",3] },
  "PURPLE_BOTTOM_75":{ color:"purple", max:75, min:50, mit:true, leech:"mana",
                     border:["bottom_right",2] },
  "PURPLE_TOP_100":{ color:"purple", max:100, min:125, cap:true,
                     spell:{ knight:"exori-mas", paladin:"exori-gran-con", sorcerer:"utamo-vita", druid:"exura-gran-mas-res", monk:"exura-mas-nia" },
                     border:["bottom_right",6] },
  "PURPLE_MIDDLE_100":{ color:"purple", max:100, min:125, cap:true,
                     spell:{ knight:"exura-gran-ico", paladin:"utamo-tempo-san", sorcerer:"exevo-vis-hur", druid:"exevo-tera-hur", monk:"exori-med-pug" },
                     border:["bottom_right",5] },
  "PURPLE_BOTTOM_100":{ color:"purple", max:100, min:125, cap:true,
                     border:["bottom_right",4] },
  "PURPLE_TOP_150":{ color:"purple", max:150, min:225, mana:true,
                     border:["bottom_right",8] },
  "PURPLE_BOTTOM_150":{ color:"purple", max:150, min:225, mana:true, leech:"life",
                     border:["bottom_right",7] },
  "PURPLE_200":    { color:"purple", max:200, min:375, hp:true, mana:true,
                     instant:{ knight:"Battle Healing", paladin:"Ballistic Mastery", sorcerer:"Focus Mastery", druid:"Runic Mastery", monk:"Sanctuary" },
                     border:["bottom_right",9] },
};

/* Upgrade de magias da wheel (grades 1 e 2) — portado de io_wheel.cpp */
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

/* Habilidade de ESTAGIO por cor e vocacao */
const WHEEL_STAGE_ABILITY = {
  green:  { knight: "Gift of Life", paladin: "Gift of Life", sorcerer: "Gift of Life", druid: "Gift of Life", monk: "Gift of Life" },
  red:    { knight: "Executioner's Throw", paladin: "Divine Grenade", sorcerer: "Beam Mastery", druid: "Blessing of the Grove", monk: "Spiritual Outburst" },
  purple: { knight: "Avatar of Steel", paladin: "Avatar of Light", sorcerer: "Avatar of Storm", druid: "Avatar of Nature", monk: "Avatar of Balance" },
  blue:   { knight: "Combat Mastery", paladin: "Divine Empowerment", sorcerer: "Drain Body", druid: "Twin Burst", monk: "Ascetic" },
};

/* Raizes (nos de entrada) */
const WHEEL_ROOTS = ["GREEN_50", "RED_50", "BLUE_50", "PURPLE_50"];

if (typeof module !== "undefined") {
  module.exports = { WHEEL_SLOTS, WHEEL_POS, WHEEL_CONNECTED, WHEEL_ROOTS,
    WHEEL_CONFIG, WHEEL_HP, WHEEL_MP, WHEEL_CAP, WHEEL_SKILL, WHEEL_LEECH,
    WHEEL_MIT_PER_POINT, WHEEL_COLORS, WHEEL_STAGE_ABILITY, WHEEL_SPELL_UPGRADES };
}
