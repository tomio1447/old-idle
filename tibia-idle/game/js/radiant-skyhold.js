/* radiant-skyhold.js — HUNT Radiant Skyhold (nível 800+).
 * Mapa: game/maps/radiant_skyhold.otbm (38×29, z=7; bounds
 * 1008,1016–1045,1044). Componente caminhável principal de 331 sqm.
 * Criaturas: as 6 Radiant do update 15.30 "Make Believe" — 8 a 10 por
 * onda. Coordenadas RME informadas:
 *   centermap     {1026,1030,7} — caminhável, vira o spawn do jogador
 *   respawnradius {1016,1024,7} → {1034,1036,7} (19×13; 242 sqm
 *                 caminháveis, todos conectados)
 *
 * As 6 criaturas não existem no dump Canary. Fichas oficiais
 * (TibiaWiki BR / TibiaRealm):
 *   Radiant Acolyte  — 34.600 hp, 32.960 exp; fraco a earth/energy,
 *     resiste fire/death; ataques Holy + Energy à distância.
 *   Radiant Paragon  — 36.000 hp, 34.780 exp; fraco a earth/energy;
 *     arqueira: ataques Physical + Holy à distância.
 *   Radiant Warden   — 38.500 hp, 35.540 exp; fraco a earth/energy/
 *     holy; corpo a corpo Physical + Holy.
 *   Devoted Radiant Acolyte/Paragon/Warden — versões ascendentes
 *     (39.790/41.400/44.275 hp; 47.820/50.560/51.280 exp) com todas as
 *     resistências neutras e skills reforçadas.
 * Todas: bestiário Humanos, 100 charm, desafiador; não empurráveis,
 * empurram objetos, imunes a paralisia, atravessam Fire/Poison/Energy
 * (não modelado no engine), occurrence Comum (base) / Incomum
 * (devoted). Oficialmente as devoted podem surgir ao usar um Gilded
 * Bell na área — aqui são ondas normais com menor peso.
 *
 * Sprites: base = looktypes do DAT convertido (acolyte 1969, paragon
 * 1966, warden 1964; match pixel a pixel contra os GIFs oficiais do
 * fansite). As devoted NÃO existem no DAT convertido — sheets montadas
 * dos GIFs oficiais (tibiarealm.com), 8 quadros replicados nas 4
 * direções (mesmo padrão do moonstone-miner).
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa; o
 * registro dos monstros no MONSTERS é via module.exports (mesmo
 * padrão do moonstone-castle).
 */
"use strict";

/* Itens novos do update 15.30 (cids do appearances.dat 15.x; ícones
 * 32×32 renderizados por tools/import_radiant_skyhold_assets.py).
 * Nenhum tem comprador/vendedor NPC oficial → sell 0:
 *   - book-of-faith / cloud-familiar / gilded-bell / tatty-robe /
 *     broken-arrow: creature products sem trade NPC registrado.
 *   - lunar-ascension-orb: consome no Weapon Proficiency (upgrade de
 *     perks); só tem valor de mercado.
 *   - blank-imbuement-scroll: NPC Albinius VENDE por 25k; ninguém
 *     compra do jogador.
 *   - blue-quiver: NPCs vendem por 400; nenhum compra do jogador.
 *     Registrada aqui como loot para o drop resolver (o quiver real
 *     continua em quiverdata.js).
 * crimson-sword já existe como arma real (weapondata) — permanece só
 * como drop, sem redefinição (sell 0 já aplicado por jade-roots.js). */
const RADIANT_SKYHOLD_ITEMS = {
  "book-of-faith":          { n: "book of faith",          s: null, t: "loot", cid: 54357, w: 2.7,  sell: 0, npcSell: 0 },
  "cloud-familiar":         { n: "cloud familiar",         s: null, t: "loot", cid: 54361, w: 0.5,  sell: 0, npcSell: 0 },
  "lunar-ascension-orb":    { n: "lunar ascension orb",    s: null, t: "loot", cid: 53695, w: 10.0, sell: 0, npcSell: 0 },
  "blank-imbuement-scroll": { n: "blank imbuement scroll", s: null, t: "loot", cid: 51442, w: 2.5,  sell: 0, npcSell: 0 },
  "gilded-bell":            { n: "gilded bell",            s: null, t: "loot", cid: 54362, w: 0.8,  sell: 0, npcSell: 0 },
  "broken-arrow":           { n: "broken arrow",           s: null, t: "loot", cid: 54356, w: 0.9,  sell: 0, npcSell: 0 },
  "tatty-robe":             { n: "tatty robe",             s: null, t: "loot", cid: 54355, w: 2.3,  sell: 0, npcSell: 0 },
  "blue-quiver":            { n: "blue quiver",            s: null, t: "loot", cid: 35848, w: 17.0, sell: 0, npcSell: 0 },
};

const RADIANT_BEST = { classe: "Human", toKill: 5000, u1: 200, u2: 2000,
  charm: 100, stars: 5, locais: "Radiant Skyhold, Marapur." };

const RADIANT_ACOLYTE = {
  name: "Radiant Acolyte",
  hp: 34600, exp: 32960,
  speed: 215, armor: 125, defense: 125,
  damage: 1300, element: "holy", attackSpeed: 2000, mitigation: 3.2,
  resist: { physical: 5, earth: -5, fire: 40, death: 30, energy: -5,
    holy: 5, ice: 10 },
  skills: [
    { el: "holy", min: 800, max: 1400, int: 2000, ch: 30, range: 7,
      fx: "holy-area", miss: "holy", alvo: 1 },
    { el: "energy", min: 700, max: 1200, int: 3000, ch: 20, range: 7,
      radius: 3, fx: "energy-area", miss: "energy" },
  ],
  defSkills: [
    { n: "healing", min: 400, max: 700, int: 2000, ch: 10 },
  ],
  looktype: 1969, race: "blood", targetDistance: 5, ranged: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 3.0, max: 1, item: "book-of-faith" },
    { chance: 1.0, max: 1, item: "blank-imbuement-scroll" },
    { chance: 0.4, max: 1, item: "gilded-bell" },
  ],
  best: Object.assign({}, RADIANT_BEST, { ocor: 0 }),
};

const RADIANT_PARAGON = {
  name: "Radiant Paragon",
  hp: 36000, exp: 34780,
  speed: 230, armor: 122, defense: 122,
  damage: 1400, element: "physical", attackSpeed: 2000, mitigation: 3.1,
  resist: { physical: 10, earth: -15, fire: 30, death: 20, energy: -10,
    ice: 5 },
  skills: [
    { el: "physical", min: 900, max: 1500, int: 2000, ch: 30, range: 8,
      alvo: 1 },
    { el: "holy", min: 700, max: 1200, int: 3000, ch: 20, range: 8,
      fx: "holy-area", miss: "holy", alvo: 1 },
  ],
  looktype: 1966, race: "blood", targetDistance: 4, ranged: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 3.0, max: 1, item: "blue-quiver" },
    { chance: 4.0, max: 1, item: "broken-arrow" },
    { chance: 0.4, max: 1, item: "gilded-bell" },
  ],
  best: Object.assign({}, RADIANT_BEST, { ocor: 0 }),
};

const RADIANT_WARDEN = {
  name: "Radiant Warden",
  hp: 38500, exp: 35540,
  speed: 200, armor: 135, defense: 135,
  damage: 1600, element: "physical", attackSpeed: 2000, mitigation: 3.4,
  resist: { physical: 10, earth: -5, fire: 30, death: 20, energy: -10,
    holy: -10, ice: 10 },
  skills: [
    { el: "holy", min: 800, max: 1400, int: 2500, ch: 25, range: 1,
      radius: 3, fx: "holy-area", miss: "holy" },
    { el: "physical", min: 900, max: 1600, int: 2000, ch: 25, range: 1,
      alvo: 1 },
  ],
  defSkills: [
    { n: "healing", min: 300, max: 600, int: 2000, ch: 10 },
  ],
  looktype: 1964, race: "blood", targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 2.0, max: 1, item: "crimson-sword" },
    { chance: 3.0, max: 1, item: "tatty-robe" },
    { chance: 0.4, max: 1, item: "gilded-bell" },
  ],
  best: Object.assign({}, RADIANT_BEST, { ocor: 0 }),
};

/* Devoted Radiant — formas ascendentes, resistências 100% neutras
 * (oficial). Mesmos arquétipos de skill, dano ~30% maior. */
const DEVOTED_ACOLYTE = Object.assign({}, RADIANT_ACOLYTE, {
  name: "Devoted Radiant Acolyte",
  hp: 39790, exp: 47820, damage: 1700,
  resist: {},
  skills: [
    { el: "holy", min: 1050, max: 1800, int: 2000, ch: 30, range: 7,
      fx: "holy-area", miss: "holy", alvo: 1 },
    { el: "energy", min: 900, max: 1550, int: 3000, ch: 20, range: 7,
      radius: 3, fx: "energy-area", miss: "energy" },
  ],
  loot: [
    { chance: 3.0, max: 1, item: "book-of-faith" },
    { chance: 1.5, max: 1, item: "cloud-familiar" },
    { chance: 0.4, max: 1, item: "lunar-ascension-orb" },
  ],
  best: Object.assign({}, RADIANT_BEST, { ocor: 1 }),
});

const DEVOTED_PARAGON = Object.assign({}, RADIANT_PARAGON, {
  name: "Devoted Radiant Paragon",
  hp: 41400, exp: 50560, damage: 1800,
  resist: {},
  skills: [
    { el: "physical", min: 1150, max: 1950, int: 2000, ch: 30, range: 8,
      alvo: 1 },
    { el: "holy", min: 900, max: 1550, int: 3000, ch: 20, range: 8,
      fx: "holy-area", miss: "holy", alvo: 1 },
  ],
  loot: [
    { chance: 1.5, max: 1, item: "cloud-familiar" },
    { chance: 0.4, max: 1, item: "lunar-ascension-orb" },
  ],
  best: Object.assign({}, RADIANT_BEST, { ocor: 1 }),
});

const DEVOTED_WARDEN = Object.assign({}, RADIANT_WARDEN, {
  name: "Devoted Radiant Warden",
  hp: 44275, exp: 51280, damage: 2100,
  resist: {},
  skills: [
    { el: "holy", min: 1050, max: 1800, int: 2500, ch: 25, range: 1,
      radius: 3, fx: "holy-area", miss: "holy" },
    { el: "physical", min: 1200, max: 2100, int: 2000, ch: 25, range: 1,
      alvo: 1 },
  ],
  loot: [
    { chance: 1.5, max: 1, item: "cloud-familiar" },
    { chance: 0.4, max: 1, item: "lunar-ascension-orb" },
  ],
  best: Object.assign({}, RADIANT_BEST, { ocor: 1 }),
});

const RADIANT_SKYHOLD_MONSTERS = {
  "radiant-acolyte": RADIANT_ACOLYTE,
  "radiant-paragon": RADIANT_PARAGON,
  "radiant-warden": RADIANT_WARDEN,
  "devoted-radiant-acolyte": DEVOTED_ACOLYTE,
  "devoted-radiant-paragon": DEVOTED_PARAGON,
  "devoted-radiant-warden": DEVOTED_WARDEN,
};

const RADIANT_SKYHOLD_DATA = {
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug in RADIANT_SKYHOLD_MONSTERS)
      monsters[slug] = RADIANT_SKYHOLD_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports)
  module.exports = RADIANT_SKYHOLD_DATA;

(function registerRadiantSkyhold() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in RADIANT_SKYHOLD_ITEMS) {
    const def = RADIANT_SKYHOLD_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }

  /* Monstros novos (ausentes do dump Canary) — registra nos dois
   * catálogos para spawn/loot resolverem igual aos demais. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA) {
    for (const slug in RADIANT_SKYHOLD_MONSTERS)
      MONSTERDATA[slug] = RADIANT_SKYHOLD_MONSTERS[slug];
  }
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in RADIANT_SKYHOLD_MONSTERS)
    GAMEDATA.monsters[slug] = RADIANT_SKYHOLD_MONSTERS[slug];

  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS) {
    if (!MOBSHEETS["radiant-acolyte"])
      MOBSHEETS["radiant-acolyte"] = { ch: 64, cols: 9, cw: 64, rows: 4 };
    if (!MOBSHEETS["radiant-paragon"])
      MOBSHEETS["radiant-paragon"] = { ch: 64, cols: 9, cw: 64, rows: 4 };
    if (!MOBSHEETS["radiant-warden"])
      MOBSHEETS["radiant-warden"] = { ch: 64, cols: 9, cw: 64, rows: 4 };
    if (!MOBSHEETS["devoted-radiant-acolyte"])
      MOBSHEETS["devoted-radiant-acolyte"] = { ch: 39, cols: 9, cw: 49, rows: 4 };
    if (!MOBSHEETS["devoted-radiant-paragon"])
      MOBSHEETS["devoted-radiant-paragon"] = { ch: 44, cols: 9, cw: 46, rows: 4 };
    if (!MOBSHEETS["devoted-radiant-warden"])
      MOBSHEETS["devoted-radiant-warden"] = { ch: 36, cols: 9, cw: 42, rows: 4 };
  }

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["radiant-skyhold"] = {
    name: "Radiant Skyhold",
    level: 800,
    minLevel: 800,
    cat: "hard",
    pack: 10,
    packMin: 8,
    packMax: 10,
    monsters: [
      "radiant-acolyte",
      "radiant-paragon",
      "radiant-warden",
      "devoted-radiant-acolyte",
      "devoted-radiant-paragon",
      "devoted-radiant-warden",
    ],
    /* occurrence oficial: base = Comum, devoted = Incomum. */
    spawnWeights: {
      "radiant-acolyte": 20,
      "radiant-paragon": 20,
      "radiant-warden": 20,
      "devoted-radiant-acolyte": 13,
      "devoted-radiant-paragon": 13,
      "devoted-radiant-warden": 14,
    },
    color: "#d8b84a",
    scene: "palace",
    otbm: "radiant_skyhold",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    // centermap informado {1026,1030,7} é caminhável → spawn do jogador.
    otbmSpawn: { x: 1026, y: 1030, z: 7 },
    otbmMobBounds: { x: 1016, y: 1024, w: 19, h: 13, z: 7 },
    avgHp: 39094,
    avgExp: 42153,
    avgDamage: 1650,
    avgArmor: 128,
    avgGold: 0,
    respawn: 1,
  };

  if (typeof HUNT_MODAL_SECTIONS !== "undefined") {
    let section = HUNT_MODAL_SECTIONS.find((s) =>
      s.title && s.title.indexOf("HUNTS 800+") !== -1
    );
    if (!section) {
      section = { title: "HUNTS 800+", ids: [] };
      HUNT_MODAL_SECTIONS.push(section);
    }
    if (section.ids.indexOf("radiant-skyhold") === -1) {
      section.ids.push("radiant-skyhold");
    }
  }
})();
