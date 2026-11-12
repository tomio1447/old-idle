/* medusa-tower-ph.js — HUNT Medusa Tower (nível 100+, Port Hope).
 * Mapa: game/maps/medusa_tower.otbm (16×17, z=7 — piso da torre).
 * Criaturas: Behemoth, Medusa e Serpent Spawn (5 a 8 por onda).
 * Coordenadas RME informadas:
 *   centerroom {1032,1032,7}
 *   mobbounds  {1028,1028,7} → {1035,1035,7}
 */
"use strict";

(function registerMedusaTowerPh() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["medusa-tower-ph"] = {
    name: "Medusa Tower",
    level: 100,
    minLevel: 100,
    cat: "mid",
    pack: 6,
    packMin: 5,
    packMax: 8,
    monsters: ["behemoth", "medusa", "serpent-spawn"],
    spawnWeights: { "behemoth": 34, "medusa": 33, "serpent-spawn": 33 },
    color: "#5a7a4e",
    scene: "palace",
    otbm: "medusa_tower",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1032, y: 1032, z: 7 },
    otbmMobBounds: { x: 1028, y: 1028, w: 8, h: 8, z: 7 },
    // Pisos da torre: 499–528 pedra/mármore, 550–561 mosaicos/carpetes.
    walkFloors: [499, 500, 501, 502, 520, 521, 522, 523, 525, 526, 527, 528,
      550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561],
    avgHp: 3800,
    avgExp: 3200,
    avgDamage: 330,
    avgArmor: 38,
    avgGold: 260,
    respawn: 1,
  };
})();
