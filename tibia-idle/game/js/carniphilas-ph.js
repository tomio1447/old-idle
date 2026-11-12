/* carniphilas-ph.js — HUNT Carniphilas (nível 40+, Port Hope/Tiquanda).
 * Mapa: game/maps/carniphilas_ph.otbm (34×32, z=7).
 * Criaturas: apenas Carniphilas (4 a 6 por onda).
 * Missão: completar o bestiário (1000 kills) concede 1 Mandrake
 * (item do addon do Shaman).
 * Coordenadas RME informadas:
 *   centerroom {1026,1025,7}
 *   mobbounds  {1020,1023,7} → {1033,1031,7}
 */
"use strict";

(function registerCarniphilasPh() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["carniphilas-ph"] = {
    name: "Carniphilas",
    level: 40,
    minLevel: 40,
    cat: "low",
    pack: 5,
    packMin: 4,
    packMax: 6,
    monsters: ["carniphila"],
    spawnWeights: { "carniphila": 100 },
    color: "#3f7a3a",
    scene: "cave",
    otbm: "carniphilas_ph",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1026, y: 1025, z: 7 },
    otbmMobBounds: { x: 1020, y: 1023, w: 14, h: 9, z: 7 },
    // Pisos do mapa: 1019/1020/1021 terra de selva, 4427 terra, 1128 cascalho,
    // 101 água rasa, 9246 terra escura.
    walkFloors: [101, 1019, 1020, 1021, 1128, 4427, 9246],
    avgHp: 255,
    avgExp: 150,
    avgDamage: 60,
    avgArmor: 15,
    avgGold: 40,
    respawn: 1,
  };
})();
