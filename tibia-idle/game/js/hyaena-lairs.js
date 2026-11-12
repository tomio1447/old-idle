/* hyaena-lairs.js — HUNT Hyaena Lairs (nível 100+, Darashia).
 * Mapa: game/maps/werehyena.otbm (40×30, z=7).
 * Criaturas: Werehyaena e Werehyaena Shaman (5 a 9 por onda).
 * Coordenadas RME informadas:
 *   centerroom {1026,1030,7}
 *   mobbounds  {1021,1025,7} → {1034,1035,7}
 */
"use strict";

(function registerHyaenaLairs() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["hyaena-lairs"] = {
    name: "Hyaena Lairs",
    level: 100,
    minLevel: 100,
    cat: "mid",
    pack: 7,
    packMin: 5,
    packMax: 9,
    monsters: ["werehyaena", "werehyaena-shaman"],
    spawnWeights: { "werehyaena": 60, "werehyaena-shaman": 40 },
    color: "#b8a24a",
    scene: "rock",
    otbm: "werehyena",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1026, y: 1030, z: 7 },
    otbmMobBounds: { x: 1021, y: 1025, w: 14, h: 11, z: 7 },
    // Pisos caminháveis do mapa (dirt/terra + lairs 1927x).
    walkFloors: [231, 4427, 101, 19271, 19272, 19273, 19274, 19275, 19276, 19277, 19278],
    avgHp: 2600,
    avgExp: 2200,
    avgDamage: 280,
    avgArmor: 37,
    avgGold: 200,
    respawn: 1,
  };
})();
