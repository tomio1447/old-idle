/* the-void.js — HUNT THE VOID (nível 100–150).
 * Mapa: game/maps/thevoid.otbm.
 * Criaturas: Reality Reaver, Dread Intruder e Breach Brood.
 */
"use strict";

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
    "collar-of-blue-plasma": { n: "collar of blue plasma", s: "neck", t: "amulet", cid: 23542, sell: 6000, npcSell: 6000 },
    "collar-of-green-plasma": { n: "collar of green plasma", s: "neck", t: "amulet", cid: 23543, sell: 6000, npcSell: 6000 },
    "collar-of-red-plasma": { n: "collar of red plasma", s: "neck", t: "amulet", cid: 23544, sell: 6000, npcSell: 6000 },
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
    spawnWeights: { "reality-reaver": 34, "dread-intruder": 33, "breach-brood": 33 },
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
