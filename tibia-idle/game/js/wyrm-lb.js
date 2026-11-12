/* wyrm-lb.js — HUNT Wyrms (nível 50+, Liberty Bay).
 * Mapa: game/maps/wyrm_lb.otbm (30×24, z=7).
 * Criaturas: apenas Wyrms (4 a 6 por onda).
 * Coordenadas RME informadas:
 *   centerroom {1019,1024,7}
 *   mobbounds  {1015,1021,7} → {1023,1028,7}
 */
"use strict";

(function registerWyrmLb() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["wyrm-lb"] = {
    name: "Wyrms",
    level: 50,
    minLevel: 50,
    cat: "low",
    pack: 5,
    packMin: 4,
    packMax: 6,
    monsters: ["wyrm"],
    spawnWeights: { "wyrm": 100 },
    color: "#4e6b3a",
    scene: "rock",
    otbm: "wyrm_lb",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1019, y: 1024, z: 7 },
    otbmMobBounds: { x: 1015, y: 1021, w: 9, h: 8, z: 7 },
    // Pisos do mapa: 1128/439x = terra/relva, 10553/2147x = margens/água rasa.
    walkFloors: [1128, 4394, 4396, 4397, 4398, 4399, 4400, 4401, 4402,
      4403, 4404, 4405, 4406, 4407, 4408, 4409, 4410, 10553, 21477, 21481, 21482],
    avgHp: 1825,
    avgExp: 1550,
    avgDamage: 250,
    avgArmor: 34,
    avgGold: 150,
    respawn: 1,
  };
})();
