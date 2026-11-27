/* the-void.js — HUNT THE VOID (nível 100–150).
 * Mapa: game/maps/thevoid.otbm.
 * Criaturas: Reality Reaver, Dread Intruder e Breach Brood.
 */
"use strict";

/* Burster (miniboss Nemesis do Otherworld, update 10.94) — ausente do dump
 * Canary: ficha oficial TibiaWiki (10.000 hp, 10.000 exp, melee 0-800+
 * físico + Energy Beam 0-300+, imune a energy). Mesmo looktype 878 do
 * Breach Brood — sheet reusa a arte da espécie. */
const BURSTER = {
  name: "Burster",
  hp: 10000, exp: 10000,
  speed: 135, armor: 0, defense: 0,
  damage: 800, element: "physical", attackSpeed: 2000,
  resist: { energy: 100 },
  skills: [
    { el: "energy", min: 0, max: 300, int: 2000, ch: 30, range: 7,
      miss: "energy", alvo: 1 },
  ],
  looktype: 878, race: "venom", raceId: 1278, targetDistance: 1,
  staticAttack: 90, boss: 1, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 44, item: "gold-coin" },
    { chance: 100, max: 10, item: "platinum-coin" },
    { chance: 100, max: 1, item: "crystallized-anger" },
    { chance: 100, max: 1, item: "curious-matter" },
    { chance: 100, max: 1, item: "plasma-pearls" },
    { chance: 100, max: 1, item: "spark-sphere" },
    { chance: 100, max: 1, item: "volatile-proto-matter" },
    { chance: 57, max: 1, item: "energy-bar" },
    { chance: 52, max: 1, item: "great-health-potion" },
    { chance: 39, max: 1, item: "energy-drink" },
    { chance: 30, max: 1, item: "ring-of-red-plasma" },
    { chance: 26, max: 1, item: "collar-of-red-plasma" },
    { chance: 26, max: 1, item: "ring-of-blue-plasma" },
    { chance: 22, max: 1, item: "collar-of-green-plasma" },
    { chance: 17, max: 1, item: "ring-of-green-plasma" },
    { chance: 17, max: 1, item: "collar-of-blue-plasma" },
    { chance: 17, max: 1, item: "great-mana-potion" },
    { chance: 17, max: 1, item: "cyan-crystal-fragment" },
    { chance: 13, max: 1, item: "blue-crystal-shard" },
    { chance: 9, max: 1, item: "great-spirit-potion" },
    { chance: 9, max: 1, item: "green-crystal-shard" },
    { chance: 9, max: 1, item: "blue-crystal-splinter" },
    { chance: 4, max: 1, item: "collar-of-orange-plasma" },
    { chance: 4, max: 1, item: "ring-of-orange-plasma" },
    { chance: 0.5, max: 1, item: "lightning-legs" },
  ],
  best: { classe: "Cnidarians", toKill: 5, u1: 10, u2: 60, charm: 10,
    stars: 5, ocor: 3, locais: "Otherworld (Dwarf Bridge)." },
  grupo: "extra_dimensional",
};

const VOID_MONSTERS = { "burster": BURSTER };

const VOID_DATA = {
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug in VOID_MONSTERS)
      monsters[slug] = VOID_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports)
  module.exports = VOID_DATA;

(function registerTheVoid() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  const lootItems = {
    "energy-drink": { n: "energy drink", s: null, t: "loot", cid: 23545, sell: 0, npcSell: 0 },
    "energy-bar": { n: "energy bar", s: null, t: "loot", cid: 23535, sell: 0, npcSell: 0 },
    "energy-vein": { n: "energy vein", s: null, t: "loot", cid: 23508, sell: 270, npcSell: 270 },
    "plasmatic-lightning": { n: "plasmatic lightning", s: null, t: "loot", cid: 23520, sell: 270, npcSell: 270 },
    "plasma-pearls": { n: "plasma pearls", s: null, t: "loot", cid: 23506, sell: 250, npcSell: 250 },
    "dangerous-proto-matter": { n: "dangerous proto matter", s: null, t: "loot", cid: 23515, sell: 300, npcSell: 300 },
    "frozen-lightning": { n: "frozen lightning", s: null, t: "loot", cid: 23519, sell: 270, npcSell: 270 },
    "instable-proto-matter": { n: "instable proto matter", s: null, t: "loot", cid: 23516, sell: 300, npcSell: 300 },
    "energy-ball": { n: "energy ball", s: null, t: "loot", cid: 23523, sell: 300, npcSell: 300 },
    "odd-organ": { n: "odd organ", s: null, t: "loot", cid: 23510, sell: 410, npcSell: 410 },
    "crystallized-anger": { n: "crystallized anger", s: null, t: "loot", cid: 23507, sell: 400, npcSell: 400 },
    "curious-matter": { n: "curious matter", s: null, t: "loot", cid: 23511, sell: 430, npcSell: 430 },
    "volatile-proto-matter": { n: "volatile proto matter", s: null, t: "loot", cid: 23514, sell: 300, npcSell: 300 },
    "spark-sphere": { n: "spark sphere", s: null, t: "loot", cid: 23518, sell: 350, npcSell: 350 },
    /* Collars of Plasma: amuletos consumíveis de 30 min (Canary duration
     * 1800 → 600 cargas de 3s). Equipam no slot "amulet"; quebram ao zerar —
     * NÃO são recarregáveis (diferente de colares recarregáveis tipo turtle
     * amulet). Os stats ficam em accessorydata.js (PATCHES/NOVOS). */
    "collar-of-blue-plasma": { n: "collar of blue plasma", s: "amulet", t: "accessory", cid: 23542, sell: 6000, npcSell: 6000, w: 1.5, lvl: 100, charges: 600, chargeMode: "time", durationSec: 1800 },
    "collar-of-green-plasma": { n: "collar of green plasma", s: "amulet", t: "accessory", cid: 23543, sell: 6000, npcSell: 6000, w: 1.5, lvl: 100, charges: 600, chargeMode: "time", durationSec: 1800 },
    "collar-of-orange-plasma": { n: "collar of orange plasma", s: "amulet", t: "accessory", cid: 23545, sell: 6000, npcSell: 6000, w: 1.5, lvl: 100, charges: 600, chargeMode: "time", durationSec: 1800 },
    "collar-of-red-plasma": { n: "collar of red plasma", s: "amulet", t: "accessory", cid: 23544, sell: 6000, npcSell: 6000, w: 1.5, lvl: 100, charges: 600, chargeMode: "time", durationSec: 1800 },
    "ring-of-blue-plasma": { n: "ring of blue plasma", s: "ring", t: "ring", cid: 23529, sell: 8000, npcSell: 8000 },
    "ring-of-green-plasma": { n: "ring of green plasma", s: "ring", t: "ring", cid: 23531, sell: 8000, npcSell: 8000 },
    "ring-of-red-plasma": { n: "ring of red plasma", s: "ring", t: "ring", cid: 23533, sell: 8000, npcSell: 8000 },
    "red-crystal-fragment": { n: "red crystal fragment", s: null, t: "loot", cid: 16126, sell: 800, npcSell: 800 },
    "violet-crystal-shard": { n: "violet crystal shard", s: null, t: "loot", cid: 16121, w: 0.20, sell: 1500, npcSell: 1500 },
    "blue-crystal-shard": { n: "blue crystal shard", s: null, t: "loot", cid: 16119, w: 0.20, sell: 1500, npcSell: 1500 },
    "green-crystal-shard": { n: "green crystal shard", s: null, t: "loot", cid: 16122, w: 0.20, sell: 1500, npcSell: 1500 },
    "cyan-crystal-fragment": { n: "cyan crystal fragment", s: null, t: "loot", cid: 16125, w: 0.10, sell: 800, npcSell: 800 },
    "red-gem": { n: "red gem", s: null, t: "loot", cid: 3034, w: 0.30, sell: 1000, npcSell: 1000 },
    "violet-gem": { n: "violet gem", s: null, t: "loot", cid: 3036, w: 0.30, sell: 10000, npcSell: 10000 },
    "small-ruby": { n: "small ruby", s: null, t: "loot", cid: 3029, w: 0.10, sell: 250, npcSell: 250 },
    "small-sapphire": { n: "small sapphire", s: null, t: "loot", cid: 3026, w: 0.10, sell: 250, npcSell: 250 },
    "small-amethyst": { n: "small amethyst", s: null, t: "loot", cid: 3032, w: 0.10, sell: 200, npcSell: 200 },
    "great-spirit-potion": { n: "great spirit potion", s: null, t: "loot", cid: 2542, w: 3.10, sell: 1, npcSell: 1 },
    "great-mana-potion": { n: "great mana potion", s: null, t: "loot", cid: 238, w: 3.10, sell: 1, npcSell: 1 },
    "great-health-potion": { n: "great health potion", s: null, t: "loot", cid: 239, w: 3.10, sell: 1, npcSell: 1 },
    "ultimate-health-potion": { n: "ultimate health potion", s: null, t: "loot", cid: 837, w: 3.10, sell: 1, npcSell: 1 },
    "lightning-headband": { n: "lightning headband", s: null, t: "loot", cid: 828, w: 1.00, sell: 2500, npcSell: 2500 },
    "gold-coin": { n: "gold coin", s: null, t: "loot", cid: 3031, w: 0.10, sell: 1, npcSell: 1 },
    "platinum-coin": { n: "platinum coin", s: null, t: "loot", cid: 3035, w: 0.10, sell: 100, npcSell: 100 },
  };
  for (const slug in lootItems) {
    const def = lootItems[slug];
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = def;
    else {
      GAMEDATA.items[slug].sell = def.sell;
      GAMEDATA.items[slug].npcSell = def.npcSell;
      if (GAMEDATA.items[slug].cid == null) GAMEDATA.items[slug].cid = def.cid;
    }
  }
  /* Monstro novo (ausente do dump Canary) — registra nos dois catálogos
   * para spawn/loot resolverem igual aos demais. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA) {
    for (const slug in VOID_MONSTERS)
      MONSTERDATA[slug] = VOID_MONSTERS[slug];
  }
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in VOID_MONSTERS)
    GAMEDATA.monsters[slug] = VOID_MONSTERS[slug];

  /* Sheet 9x4 de células 64x64 (mesma arte do Breach Brood, looktype 878). */
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS &&
      !MOBSHEETS["burster"]) {
    MOBSHEETS["burster"] = { ch: 64, cols: 9, cw: 64, rows: 4 };
  }
  if (typeof CREATURE_ANCHORS !== "undefined" && CREATURE_ANCHORS &&
      !CREATURE_ANCHORS["burster"]) {
    CREATURE_ANCHORS["burster"] = { sw: 64, sh: 64, ox: 0, oy: 0 };
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["the-void"] = {
    name: "The Void",
    level: 100,
    minLevel: 100,
    cat: "mid",
    pack: 6,
    packMin: 5,
    packMax: 8,
    monsters: ["reality-reaver", "dread-intruder", "breach-brood"],
    bossMobs: ["burster"],
    spawnWeights: { "reality-reaver": 3334, "dread-intruder": 3333,
      "breach-brood": 3333, "burster": 1 },
    color: "#594b72",
    scene: "palace",
    otbm: "thevoid",
    otbmFloor: 7,
    otbmBounds: { x: 1012, y: 1022, w: 25, h: 13, z: 7 },
    otbmSpawn: { x: 1016, y: 1030, z: 7 },
    otbmMobBounds: { x: 1012, y: 1024, w: 17, h: 9, z: 7 },
    avgHp: 3970,
    avgExp: 2213,
    avgDamage: 451,
    avgArmor: 51,
    avgGold: 100,
    respawn: 1,
  };
})();
