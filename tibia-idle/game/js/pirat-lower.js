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
    "grappling-hook":          { n: "grappling hook",          s: null, t: "loot", w: 6.20, cid: 5800,  sell: 0, npcSell: 0 },
    "cheese-cutter":           { n: "cheese cutter",           s: null, t: "loot", w: 0.45, cid: 17817, sell: 0, npcSell: 0 },
    "soft-cheese":             { n: "soft cheese",             s: null, t: "loot", w: 5.00, cid: 17820, sell: 0, npcSell: 0 },
    "rat-cheese":              { n: "rat cheese",              s: null, t: "loot", w: 3.00, cid: 17821, sell: 0, npcSell: 0 },
    "small-treasure-chest":    { n: "small treasure chest",    s: null, t: "loot", w: 8.00, cid: 35571, sell: 0, npcSell: 0 },
    "pirate-coin":             { n: "pirate coin",             s: null, t: "loot", w: 0.40, cid: 35572, sell: 0, npcSell: 0 },
    "pirat-s-tail":            { n: "pirat's tail",            s: null, t: "loot", w: 1.90, cid: 35573, sell: 0, npcSell: 0 },
    "shark-fins":              { n: "shark fins",              s: null, t: "loot", w: 6.20, cid: 35574, sell: 0, npcSell: 0 },
    "mouldy-powder":           { n: "mouldy powder",           s: null, t: "loot", w: 1.70, cid: 35596, sell: 0, npcSell: 0 },
  };
  for (const slug in piratItems) {
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = piratItems[slug];
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
