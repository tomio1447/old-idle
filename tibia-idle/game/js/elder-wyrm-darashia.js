/* elder-wyrm-darashia.js — HUNT ELDER WYRM - DARASHIA (hunts level 100-150).
 *
 * Monstros do Canary:
 *   wyrm, elder-wyrm.
 *
 * Mapa: elder_wyrm_darashia.otbm
 *   bounds: {1015,1016,7} .. {1031,1030,7}
 *   centerroom/player spawn: {1018,1023,7}
 *   monster radius: {1023,1017,7} .. {1016,1029,7}
 */
"use strict";

(function registerElderWyrmDarashia() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["elder-wyrm-darashia"] = {
    name: "Elder Wyrm - Darashia",
    level: 100,
    minLevel: 100,
    cat: "cacador",
    pack: 5,
    packMin: 5,
    packMax: 8,
    monsters: ["wyrm", "elder-wyrm"],
    color: "#6a7a4a",
    scene: "desert",
    otbm: "elder_wyrm_darashia",
    otbmFloor: 7,
    otbmFovBounds: { x: 1015, y: 1016, w: 17, h: 15, z: 7 },
    otbmFovWidth: 17,
    otbmFovHeight: 15,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 15,
    otbmSpawn: { x: 1018, y: 1023, z: 7 },
    otbmMobBounds: { x: 1016, y: 1017, w: 8, h: 13, z: 7 },
    avgHp: 2263,
    avgExp: 2025,
    avgDamage: 298,
    avgArmor: 41,
    avgGold: 150,
    respawn: 0.8,
  };
})();
