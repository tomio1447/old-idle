/* yasir-prices.js — preços que Yasir (TibiaWiki) compra de creature products.
 *
 * Sell All / autoseller usam sell; analyser prefere npcSell. Mantém sell =
 * npcSell. Inclui aliases de slug (greed-s-arm / greeds-arm) para o mesmo CID.
 * Fonte: TibiaWiki Yasir / Creature Products by NPC Price. */
"use strict";

(function applyYasirNpcPrices(global) {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  const items = GAMEDATA.items;

  const registerLootItem = (slug, def) => {
    const sell = Math.max(0, Math.floor(Number(def.sell) || 0));
    const npcSell = def.npcSell != null
      ? Math.max(0, Math.floor(Number(def.npcSell) || 0))
      : sell;
    const base = Object.assign({ s: null, t: "loot" }, def, { sell, npcSell });
    if (!items[slug]) items[slug] = base;
    else {
      items[slug].sell = sell;
      items[slug].npcSell = npcSell;
      if (def.n && !items[slug].n) items[slug].n = def.n;
      if (def.cid && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  };

  /* Soul War / Goshnar boss loot — preços oficiais Yasir (gp). */
  const YASIR_SOULWAR_LOOT = {
    "greed-s-arm": { n: "Greed's arm", cid: 33924, w: 1.25, sell: 950000 },
    "greeds-arm": { n: "Greed's arm", cid: 33924, w: 1.25, sell: 950000 },
    "figurine-of-greed": { n: "figurine of Greed", cid: 34021, w: 0.44, sell: 2900000 },

    "vial-of-hatred": { n: "vial of Hatred", cid: 33927, w: 1.1, sell: 737000 },
    "figurine-of-hatred": { n: "figurine of hatred", cid: 34020, w: 0.44, sell: 2700000 },

    "spite-s-spirit": { n: "Spite's spirit", cid: 33926, w: 0.8, sell: 840000 },
    "spites-spirit": { n: "Spite's spirit", cid: 33926, w: 0.8, sell: 840000 },
    "figurine-of-spite": { n: "figurine of Spite", cid: 33952, w: 0.44, sell: 3000000 },

    "malice-s-spine": { n: "Malice's spine", cid: 33921, w: 1.2, sell: 850000 },
    "malices-spine": { n: "Malice's spine", cid: 33921, w: 1.2, sell: 850000 },
    "malice-s-horn": { n: "Malice's horn", cid: 33920, w: 1.1, sell: 620000 },
    "malices-horn": { n: "Malice's horn", cid: 33920, w: 1.1, sell: 620000 },
    "figurine-of-malice": { n: "figurine of Malice", cid: 34018, w: 0.44, sell: 2800000 },

    "cruelty-s-claw": { n: "Cruelty's claw", cid: 33922, w: 1.1, sell: 640000 },
    "crueltys-claw": { n: "Cruelty's claw", cid: 33922, w: 1.1, sell: 640000 },
    "cruelty-s-chest": { n: "Cruelty's chest", cid: 33923, w: 1.4, sell: 720000 },
    "crueltys-chest": { n: "Cruelty's chest", cid: 33923, w: 1.4, sell: 720000 },
    "figurine-of-cruelty": { n: "figurine of Cruelty", cid: 34019, w: 0.44, sell: 3100000 },

    "figurine-of-megalomania": { n: "figurine of Megalomania", cid: 33953, w: 0.44, sell: 5000000 },
    "megalomania-s-skull": { n: "Megalomania's skull", cid: 33925, w: 1.1, sell: 1500000 },
    "megalomanias-skull": { n: "Megalomania's skull", cid: 33925, w: 1.1, sell: 1500000 },
    "megalomania-s-essence": { n: "Megalomania's essence", cid: 33928, w: 0.8, sell: 1900000 },
    "megalomanias-essence": { n: "Megalomania's essence", cid: 33928, w: 0.8, sell: 1900000 },

    /* Soul War trash / zone creature products Yasir also buys. */
    "crawler-s-essence": { n: "crawler's essence", cid: 33982, w: 0.45, sell: 3700 },
    "crawlers-essence": { n: "crawler's essence", cid: 33982, w: 0.45, sell: 3700 },
    "roots": { n: "roots", cid: 33938, w: 0.9, sell: 1200 },
    "mould-heart": { n: "mould heart", cid: 34141, w: 0.75, sell: 2100 },
    // Claustrophobic Inferno (brachiodemon / infernal phantom).
    "hand": { n: "hand", cid: 33936, w: 1.2, sell: 1450 },
    "head": { n: "head", cid: 33937, w: 1.5, sell: 3500 },
    "infernal-heart": { n: "infernal heart", cid: 34139, w: 0.75, sell: 2100 },
    "diabolic-skull": { n: "diabolic skull", cid: 34025, w: 2.1, sell: 19000 },
    "infernal-robe": { n: "infernal robe", cid: 34146, w: 1.8, sell: 1200 },
  };

  const NPC_LOOT_PRICES = {
    "assassin-dagger": { sell: 20000 },
    "haunted-blade": { sell: 8000 },
    "nightmare-blade": { sell: 35000 },
    "stealth-ring": { sell: 200 },
    "boots-of-haste": { sell: 30000 },
    "diamond-sceptre": { sell: 3000 },
    "titan-axe": { sell: 4000 },
    "shadow-sceptre": { sell: 10000 },
    "glorious-axe": { sell: 3000 },
    "terra-mantle": { sell: 11000 },
    "terra-legs": { sell: 11000 },
    "terra-boots": { sell: 2500 },
    "magma-boots": { sell: 2500 },
    "lightning-boots": { sell: 2500 },
    "ice-rapier": { sell: 1000 },
    "knight-axe": { sell: 2000 },
    "crystal-sword": { sell: 600 },
    "knight-armor": { sell: 5000 },
    "fire-sword": { sell: 4000 },
    "wand-of-inferno": { sell: 3000 },
    "wand-of-starstorm": { sell: 3600 },
    "wand-of-voodoo": { sell: 4400 },
    "garlic-necklace": { sell: 50 },
    "bat-wing": { sell: 50 },
  };

  const HUNT_LOOT_PRICES = {
    "bamboo-leaves": { n: "bamboo leaves", cid: 12549, w: 2, sell: 150 },
    "blue-crystal-shard": { n: "blue crystal shard", cid: 16119, w: 0.2, sell: 1500 },
    "bone-shoulderplate": { n: "bone shoulderplate", cid: 10404, w: 2.2, sell: 350 },
    "cheese-cutter": { n: "cheese cutter", cid: 17817, w: 0.45, sell: 50 },
    "cheesy-figurine": { n: "cheesy figurine", cid: 17818, w: 1, sell: 150 },
    "collar-of-blue-plasma": { n: "collar of blue plasma", cid: 23542, sell: 6000 },
    "collar-of-green-plasma": { n: "collar of green plasma", cid: 23543, sell: 6000 },
    "collar-of-red-plasma": { n: "collar of red plasma", cid: 23544, sell: 6000 },
    "crowbar": { n: "crowbar", cid: 3304, w: 21, sell: 50 },
    "crystal-sword": { n: "crystal sword", cid: 7449, w: 69, sell: 600 },
    "crystallized-anger": { n: "crystallized anger", cid: 23507, sell: 400 },
    "curious-matter": { n: "curious matter", cid: 23511, sell: 430 },
    "cyan-crystal-fragment": { n: "cyan crystal fragment", cid: 16125, w: 0.5, sell: 800 },
    "dangerous-proto-matter": { n: "dangerous proto matter", cid: 23515, sell: 300 },
    "draken-sulphur": { n: "draken sulphur", cid: 11658, w: 0.68, sell: 200 },
    "drakinata": { n: "drakinata", cid: 10388, w: 54, sell: 10000 },
    "energy-ball": { n: "energy ball", cid: 23523, sell: 300 },
    "energy-vein": { n: "energy vein", cid: 23508, sell: 270 },
    "fire-sword": { n: "fire sword", cid: 3280, w: 23, sell: 4000 },
    "focus-cape": { n: "focus cape", cid: 8043, w: 21, sell: 6000 },
    "frozen-lightning": { n: "frozen lightning", cid: 23519, sell: 270 },
    "gold-coin": { n: "gold coin", cid: 3031, w: 0.1, sell: 1 },
    "grappling-hook": { n: "grappling hook", cid: 5800, w: 6.2, sell: 150 },
    "great-health-potion": { n: "great health potion", cid: 239, w: 3.1, sell: 1 },
    "great-mana-potion": { n: "great mana potion", cid: 238, w: 3.1, sell: 1 },
    "great-spirit-potion": { n: "great spirit potion", cid: 7642, w: 3.1, sell: 1 },
    "green-crystal-shard": { n: "green crystal shard", cid: 16121, w: 0.4, sell: 1500 },
    "green-gem": { n: "green gem", cid: 3038, w: 1.5, sell: 5000 },
    "harness": { n: "harness", cid: 12307, w: 2, sell: 500 },
    "ice-rapier": { n: "ice rapier", cid: 3284, w: 15, sell: 1000 },
    "instable-proto-matter": { n: "instable proto matter", cid: 23516, sell: 300 },
    "knight-armor": { n: "knight armor", cid: 3370, w: 120, sell: 5000 },
    "knight-axe": { n: "knight axe", cid: 3318, w: 59, sell: 2000 },
    "life-preserver": { n: "life preserver", cid: 17813, w: 46, sell: 300 },
    "lightning-boots": { n: "lightning boots", cid: 820, w: 7.5, sell: 2500 },
    "lightning-headband": { n: "lightning headband", cid: 828, w: 10, sell: 2500 },
    "luminous-orb": { n: "luminous orb", cid: 11454, w: 0.94, sell: 1000 },
    "magma-boots": { n: "magma boots", cid: 818, w: 7.5, sell: 2500 },
    "meat": { n: "meat", cid: 3577, w: 13, sell: 5 },
    "mouldy-powder": { n: "mouldy powder", cid: 35596, w: 1.7, sell: 200 },
    "odd-organ": { n: "odd organ", cid: 23510, sell: 410 },
    "onyx-chip": { n: "onyx chip", cid: 22193, w: 1, sell: 500 },
    "pirat-s-tail": { n: "pirat's tail", cid: 35573, w: 1.9, sell: 180 },
    "pirate-coin": { n: "pirate coin", cid: 35572, w: 0.4, sell: 110 },
    "plasma-pearls": { n: "plasma pearls", cid: 23506, sell: 250 },
    "plasmatic-lightning": { n: "plasmatic lightning", cid: 23520, sell: 270 },
    "platinum-coin": { n: "platinum coin", cid: 3035, w: 0.1, sell: 100 },
    "ratana": { n: "ratana", cid: 17812, w: 33, sell: 500 },
    "red-crystal-fragment": { n: "red crystal fragment", cid: 16126, sell: 800 },
    "red-gem": { n: "red gem", cid: 3039, w: 0.3, sell: 1000 },
    "ring-of-blue-plasma": { n: "ring of blue plasma", cid: 23530, w: 0.9, sell: 8000 },
    "ring-of-green-plasma": { n: "ring of green plasma", cid: 23531, sell: 8000 },
    "ring-of-red-plasma": { n: "ring of red plasma", cid: 23533, sell: 8000 },
    "ring-of-the-sky": { n: "ring of the sky", cid: 3006, w: 0.4, sell: 1568 },
    "shark-fins": { n: "shark fins", cid: 35574, w: 6.2, sell: 250 },
    "small-amethyst": { n: "small amethyst", cid: 3033, w: 0.1, sell: 200 },
    "small-diamond": { n: "small diamond", cid: 3028, w: 0.1, sell: 300 },
    "small-emerald": { n: "small emerald", cid: 3032, w: 0.1, sell: 250 },
    "small-ruby": { n: "small ruby", cid: 3030, w: 0.1, sell: 250 },
    "small-sapphire": { n: "small sapphire", cid: 3029, w: 0.1, sell: 250 },
    "small-treasure-chest": { n: "small treasure chest", cid: 35571, w: 8, sell: 500 },
    "spark-sphere": { n: "spark sphere", cid: 23518, sell: 350 },
    "spellweaver-s-robe": { n: "spellweaver's robe", cid: 10438, w: 23.5, sell: 6000 },
    "springsprout-rod": { n: "springsprout rod", cid: 8084, w: 27, sell: 3600 },
    "terra-boots": { n: "terra boots", cid: 813, w: 7.5, sell: 2500 },
    "tower-shield": { n: "tower shield", cid: 3428, w: 82, sell: 512 },
    "ultimate-health-potion": { n: "ultimate health potion", cid: 7643, w: 3.1, sell: 1 },
    "violet-crystal-shard": { n: "violet crystal shard", cid: 16120, w: 0.2, sell: 1500 },
    "violet-gem": { n: "violet gem", cid: 3036, w: 0.3, sell: 10000 },
    "volatile-proto-matter": { n: "volatile proto matter", cid: 23514, sell: 300 },
    "wand-of-inferno": { n: "wand of inferno", cid: 3071, w: 27, sell: 3000 },
    "wand-of-starstorm": { n: "wand of starstorm", cid: 8092, w: 25.5, sell: 3600 },
    "wand-of-voodoo": { n: "wand of voodoo", cid: 8094, w: 28.5, sell: 4400 },
    "warmaster-s-wristguards": { n: "warmaster's wristguards", cid: 10405, w: 1.2, sell: 300 },
    "weaver-s-wandtip": { n: "weaver's wandtip", cid: 10397, w: 1.7, sell: 300 },
    "wood-cape": { n: "wood cape", cid: 3575, w: 11, sell: 5000 },
    "yellow-gem": { n: "yellow gem", cid: 3037, w: 0.3, sell: 1000 },
    "zaoan-armor": { n: "zaoan armor", cid: 10384, w: 95.5, sell: 12000 },
    "zaoan-legs": { n: "zaoan legs", cid: 10387, w: 66, sell: 10000 },
    "zaoan-robe": { n: "zaoan robe", cid: 10439, w: 24.5, sell: 6000 },
    "zaoan-shoes": { n: "zaoan shoes", cid: 10386, w: 7, sell: 6000 },
  };

  const applyPrices = () => {
    Object.keys(YASIR_SOULWAR_LOOT).forEach((slug) => {
      registerLootItem(slug, YASIR_SOULWAR_LOOT[slug]);
    });
    Object.keys(NPC_LOOT_PRICES).forEach((slug) => {
      registerLootItem(slug, NPC_LOOT_PRICES[slug]);
    });
    Object.keys(HUNT_LOOT_PRICES).forEach((slug) => {
      registerLootItem(slug, HUNT_LOOT_PRICES[slug]);
    });
  };
  applyPrices();

  if (global) {
    global.YASIR_SOULWAR_LOOT = YASIR_SOULWAR_LOOT;
    global.NPC_LOOT_PRICES = NPC_LOOT_PRICES;
    global.applyYasirNpcPrices = applyPrices;
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : null));
