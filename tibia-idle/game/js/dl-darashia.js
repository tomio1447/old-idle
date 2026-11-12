/* dl-darashia.js — HUNT Dragon Lord Lair (nível 50+, Darashia).
 * Mapa: game/maps/dl_darashia.otbm (37×27, z=7).
 * Criaturas: Dragon Lord 80%, Dragon 10%, Dragon Lord Hatchling 10%
 * (4 a 6 por onda).
 * Coordenadas RME informadas:
 *   centerroom {1026,1028,7}
 *   mobbounds  {1020,1024,7} → {1029,1032,7}
 */
"use strict";

(function registerDlDarashia() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["dl-darashia"] = {
    name: "Dragon Lord",
    level: 50,
    minLevel: 50,
    cat: "low",
    pack: 5,
    packMin: 4,
    packMax: 6,
    monsters: ["dragon-lord", "dragon", "dragon-lord-hatchling"],
    spawnWeights: { "dragon-lord": 80, "dragon": 10, "dragon-lord-hatchling": 10 },
    color: "#9a4a2e",
    scene: "rock",
    otbm: "dl_darashia",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1026, y: 1028, z: 7 },
    otbmMobBounds: { x: 1020, y: 1024, w: 10, h: 9, z: 7 },
    // Pisos do mapa: 231/4427 = terra, 7062–7066 = chão vulcânico.
    walkFloors: [231, 4427, 7062, 7063, 7064, 7065, 7066],
    avgHp: 1500,
    avgExp: 1500,
    avgDamage: 230,
    avgArmor: 30,
    avgGold: 120,
    respawn: 1,
  };
})();
