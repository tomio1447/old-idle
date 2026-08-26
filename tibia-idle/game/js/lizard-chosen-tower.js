/* lizard-chosen-tower.js — HUNT LIZARD CHOSEN TOWER (hunts level 100-150).
 *
 * Monstros do Canary (Zao):
 *   lizard-chosen, lizard-dragon-priest,
 *   lizard-high-guard, lizard-legionnaire, lizard-zaogun.
 *
 * Mapa: lizardchosen.otbm
 *   bounds: {1008,1015,7} .. {1028,1033,7}
 *   centerroom/player spawn: {1019,1025,7}
 *   monster pawn area: {1016,1019,7} .. {1025,1031,7}
 */
"use strict";

(function registerLizardChosenTower() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["lizard-chosen-tower"] = {
    name: "Lizard Chosen Tower",
    level: 100,
    minLevel: 100,
    cat: "guerreiro",
    pack: 5,
    packMin: 5,
    packMax: 8,
    monsters: ["lizard-chosen", "lizard-dragon-priest",
               "lizard-high-guard", "lizard-legionnaire", "lizard-zaogun"],
    color: "#4a6a3a",
    scene: "cave",
    otbm: "lizardchosen",
    otbmFloor: 7,
    otbmFovBounds: { x: 1008, y: 1015, w: 21, h: 19, z: 7 },
    otbmFovWidth: 21,
    otbmFovHeight: 19,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 19,
    otbmSpawn: { x: 1019, y: 1025, z: 7 },
    otbmMobBounds: { x: 1016, y: 1019, w: 10, h: 13, z: 7 },
    avgHp: 2131,
    avgExp: 1554,
    avgDamage: 249,
    avgArmor: 32,
    avgGold: 120,
    respawn: 0.85,
  };
})();
