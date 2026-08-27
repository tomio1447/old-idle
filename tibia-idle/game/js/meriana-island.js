/* meriana-island.js — HUNT MERIANA ISLAND (level 1–100, recomendado level 30).
 *
 * Monstros do Canary (Shattered Isles / Meriana):
 *   tortoise, thornback-tortoise, blood-crab.
 *
 * Mapa: meriana_island.otbm
 *   bounds: {1008,1012,7} .. {1041,1039,7}
 *   centerroom/player spawn: {1025,1025,7}
 *   monster pawn area: {1020,1021,7} .. {1031,1030,7} (12×10)
 */
"use strict";

(function registerMerianaIsland() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["meriana-island"] = {
    name: "Meriana Island",
    level: 1,
    minLevel: 30,
    cat: "aventureiro",
    pack: 1,
    packMin: 4,
    packMax: 6,
    monsters: ["tortoise", "thornback-tortoise", "blood-crab"],
    color: "#4a8a9a",
    scene: "forest",
    otbm: "meriana_island",
    otbmFloor: 7,
    otbmFovBounds: { x: 1015, y: 1019, w: 20, h: 12, z: 7 },
    otbmFovWidth: 20,
    otbmFovHeight: 12,
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: { x: 1025, y: 1025, z: 7 },
    otbmMobBounds: { x: 1020, y: 1021, w: 12, h: 10, z: 7 },
    avgHp: 258,
    avgExp: 133,
    avgDamage: 90,
    avgArmor: 25,
    avgGold: 13,
    respawn: 0.85,
  };
})();
