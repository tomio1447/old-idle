/* pirat-lower.js — HUNT PIRAT LOWER (nível 100–150).
 *
 * Monstros do Canary:
 *   pirat-bombardier, pirat-cutthroat, pirat-mate, pirat-scoundrel, elite-pirat.
 *
 * Mapa: piratlower.otbm
 *   bounds: {1018,1016,7} .. {1038,1030,7}
 *   centeroom/player spawn: {1028,1022,7}
 *   monster spawn: {1020,1017,7} .. {1034,1027,7}
 *
 * Missão: coletar 5.000.000 em loot.
 * Recompensa da missão: acesso ao boss Ratmiral Blackwhiskers.
 */
"use strict";

(function registerPiratLower() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.items) GAMEDATA.items = {};
  const piratItems = {
    "grappling-hook":          { n: "grappling hook",          s: null, t: "loot", w: 6.20, cid: 5800,  sell: 150, npcSell: 150 },
    "cheese-cutter":           { n: "cheese cutter",           s: null, t: "loot", w: 0.45, cid: 17817, sell: 50, npcSell: 50 },
    "soft-cheese":             { n: "soft cheese",             s: null, t: "loot", w: 5.00, cid: 17820, sell: 0, npcSell: 0 },
    "rat-cheese":              { n: "rat cheese",              s: null, t: "loot", w: 3.00, cid: 17821, sell: 0, npcSell: 0 },
    "small-treasure-chest":    { n: "small treasure chest",    s: null, t: "loot", w: 8.00, cid: 35571, sell: 500, npcSell: 500 },
    "pirate-coin":             { n: "pirate coin",             s: null, t: "loot", w: 0.40, cid: 35572, sell: 110, npcSell: 110 },
    "pirat-s-tail":            { n: "pirat's tail",            s: null, t: "loot", w: 1.90, cid: 35573, sell: 180, npcSell: 180 },
    "shark-fins":              { n: "shark fins",              s: null, t: "loot", w: 6.20, cid: 35574, sell: 250, npcSell: 250 },
    "mouldy-powder":           { n: "mouldy powder",           s: null, t: "loot", w: 1.70, cid: 35596, sell: 200, npcSell: 200 },
  };
  const allPiratItems = Object.assign({}, piratItems, {
    "ice-rapier": { n: "ice rapier", s: "weapon", t: "sword", cid: 3282, w: 15.00, sell: 1000, npcSell: 1000 },
    "knight-axe": { n: "knight axe", s: "weapon", t: "axe", cid: 3318, w: 59.00, sell: 2000, npcSell: 2000 },
    "crystal-sword": { n: "crystal sword", s: "weapon", t: "sword", cid: 7449, w: 69.00, sell: 600, npcSell: 600 },
    "crowbar": { n: "crowbar", s: "weapon", t: "club", cid: 3309, w: 21.00, sell: 50, npcSell: 50 },
    "knight-armor": { n: "knight armor", s: "armor", t: "armor", cid: 3370, w: 120.00, sell: 5000, npcSell: 5000 },
    "focus-cape": { n: "focus cape", s: "armor", t: "armor", cid: 8045, w: 21.00, sell: 6000, npcSell: 6000 },
    "terra-boots": { n: "terra boots", s: "boots", t: "boots", cid: 813, w: 7.50, sell: 2500, npcSell: 2500 },
    "magma-boots": { n: "magma boots", s: "boots", t: "boots", cid: 818, w: 7.50, sell: 2500, npcSell: 2500 },
    "lightning-boots": { n: "lightning boots", s: "boots", t: "boots", cid: 820, w: 7.50, sell: 2500, npcSell: 2500 },
    "wood-cape": { n: "wood cape", s: "armor", t: "armor", cid: 3575, w: 11.00, sell: 5000, npcSell: 5000 },
    "small-diamond": { n: "small diamond", s: null, t: "loot", cid: 3027, w: 0.10, sell: 300, npcSell: 300 },
    "fire-sword": { n: "fire sword", s: "weapon", t: "sword", cid: 3280, w: 52.00, sell: 4000, npcSell: 4000 },
    "small-emerald": { n: "small emerald", s: null, t: "loot", cid: 3028, w: 0.10, sell: 250, npcSell: 250 },
    "onyx-chip": { n: "onyx chip", s: null, t: "loot", cid: 22193, w: 1.00, sell: 500, npcSell: 500 },
    "yellow-gem": { n: "yellow gem", s: null, t: "loot", cid: 3030, w: 0.30, sell: 1000, npcSell: 1000 },
    "wand-of-inferno": { n: "wand of inferno", s: "weapon", t: "wand", cid: 3071, w: 27.00, sell: 3000, npcSell: 3000 },
    "springsprout-rod": { n: "springsprout rod", s: "weapon", t: "rod", cid: 8082, w: 27.00, sell: 3600, npcSell: 3600 },
    "wand-of-starstorm": { n: "wand of starstorm", s: "weapon", t: "wand", cid: 8092, w: 25.50, sell: 3600, npcSell: 3600 },
    "wand-of-voodoo": { n: "wand of voodoo", s: "weapon", t: "wand", cid: 8094, w: 28.50, sell: 4400, npcSell: 4400 },
    "ratana": { n: "ratana", s: "weapon", t: "sword", cid: 17812, w: 15.00, sell: 500, npcSell: 500 },
    "life-preserver": { n: "life preserver", s: "weapon", t: "club", cid: 17813, w: 35.00, sell: 300, npcSell: 300 },
    "cheesy-figurine": { n: "cheesy figurine", s: null, t: "loot", cid: 17818, w: 1.00, sell: 150, npcSell: 150 },
    "great-mana-potion": { n: "great mana potion", s: null, t: "loot", cid: 238, w: 3.10, sell: 1, npcSell: 1 },
    "great-health-potion": { n: "great health potion", s: null, t: "loot", cid: 239, w: 3.10, sell: 1, npcSell: 1 },
    "great-spirit-potion": { n: "great spirit potion", s: null, t: "loot", cid: 2542, w: 3.10, sell: 1, npcSell: 1 },
    "gold-coin": { n: "gold coin", s: null, t: "loot", cid: 3031, w: 0.10, sell: 1, npcSell: 1 },
    "platinum-coin": { n: "platinum coin", s: null, t: "loot", cid: 3035, w: 0.10, sell: 100, npcSell: 100 },
  });
  for (const slug in allPiratItems) {
    const def = allPiratItems[slug];
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = def;
    else {
      if (def.sell != null) GAMEDATA.items[slug].sell = def.sell;
      if (def.npcSell != null) GAMEDATA.items[slug].npcSell = def.npcSell;
      if (GAMEDATA.items[slug].cid == null) GAMEDATA.items[slug].cid = def.cid;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["pirat-lower"] = {
    name: "Pirat Lower",
    level: 100,
    minLevel: 100,
    cat: "cave",
    pack: 6,
    packMin: 5,
    packMax: 8,
    monsters: ["pirat-bombardier", "pirat-cutthroat", "pirat-mate", "pirat-scoundrel", "elite-pirat"],
    color: "#4a5a6a",
    scene: "cave",
    otbm: "piratlower",
    otbmFloor: 7,
    otbmFovBounds: { x: 1018, y: 1016, w: 19, h: 13, z: 7 },
    otbmFovWidth: 19,
    otbmFovHeight: 13,
    otbmRuntimeWidth: 19,
    otbmRuntimeHeight: 13,
    otbmSpawn: { x: 1028, y: 1022, z: 7 },
    otbmMobBounds: { x: 1020, y: 1017, w: 15, h: 10, z: 7 },
    avgHp: 6060,
    avgExp: 5100,
    avgDamage: 360,
    avgArmor: 60,
    avgGold: 120,
    respawn: 0.9,
  };

  if (typeof MISSION_DEFS !== "undefined") {
    MISSION_DEFS["pirat-lower"] = {
      title: "Missão: Pirat Lower",
      compact: true,
      tasks: [
        { counter: "gold", target: 5000000, label: "Coletar 5.000.000 em loot" }
      ],
      completeReward: { bossAccess: "pirat-lower", bossName: "Ratmiral Blackwhiskers" },
    };
  }

  if (typeof BOSS_DEFS !== "undefined" && BOSS_DEFS["ratmiral-blackwhiskers"]) {
    BOSS_DEFS["ratmiral-blackwhiskers"].requirement = {
      level: 250,
      access: "pirat-lower",
      text: "Requer nível 250+ e a missão Pirat Lower concluída",
    };
  }
})();
