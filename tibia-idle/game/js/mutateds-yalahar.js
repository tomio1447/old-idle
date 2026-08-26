/* mutateds-yalahar.js — HUNT MUTATEDS YALAHAR (level 1–100, recomendado level 50).
 *
 * Monstros do Canary (Yalahar quarter):
 *   mutated-human, mutated-tiger, mutated-bat, mutated-rat.
 *
 * Mapa: mutateds_yalahar.otbm
 *   bounds: {1018,1039,7} .. {1039,1052,7}
 *   centerroom/player spawn: {1028,1045,7}
 *   monster pawn area: {1023,1041,7} .. {1035,1050,7} (13×10)
 */
"use strict";

(function registerMutatedsYalahar() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["mutateds-yalahar"] = {
    name: "Mutateds Yalahar",
    level: 1,
    minLevel: 50,
    cat: "aventureiro",
    pack: 1,
    packMin: 4,
    packMax: 6,
    monsters: ["mutated-human", "mutated-tiger", "mutated-bat", "mutated-rat"],
    color: "#6a8a5a",
    scene: "cave",
    otbm: "mutateds_yalahar",
    otbmFloor: 7,
    otbmFovBounds: { x: 1018, y: 1039, w: 22, h: 14, z: 7 },
    otbmFovWidth: 22,
    otbmFovHeight: 14,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 15,
    otbmSpawn: { x: 1028, y: 1045, z: 7 },
    otbmMobBounds: { x: 1023, y: 1041, w: 13, h: 10, z: 7 },
    avgHp: 698,
    avgExp: 525,
    avgDamage: 142,
    avgArmor: 22,
    avgGold: 42,
    respawn: 0.85,
  };
})();
