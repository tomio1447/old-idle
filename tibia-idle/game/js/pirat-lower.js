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
    otbmFovBounds: { x: 1018, y: 1017, w: 21, h: 13, z: 7 },
    otbmFovWidth: 21,
    otbmFovHeight: 13,
    otbmRuntimeWidth: 21,
    otbmRuntimeHeight: 15,
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
