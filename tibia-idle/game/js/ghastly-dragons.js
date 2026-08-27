/* ghastly-dragons.js — HUNT GHASTLY DRAGONS (hunts level 100-150).
 *
 * Monstros do Canary (Zao):
 *   ghastly-dragon.
 *
 * Mapa: ghastly_dragons.otbm
 *   bounds: {1004,1018,7} .. {1022,1034,7}
 *   centerroom/player spawn: {1013,1026,7}
 *   monster radius spawn: {1011,1022,7} .. {1017,1029,7}
 */
"use strict";

(function registerGhastlyDragons() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["ghastly-dragons"] = {
    name: "Ghastly Dragons",
    level: 100,
    minLevel: 100,
    cat: "guerreiro",
    pack: 4,
    packMin: 4,
    packMax: 7,
    monsters: ["ghastly-dragon"],
    color: "#5a4a6a",
    scene: "cave",
    otbm: "ghastly_dragons",
    otbmFloor: 7,
    otbmFovBounds: { x: 1004, y: 1018, w: 19, h: 17, z: 7 },
    otbmFovWidth: 19,
    otbmFovHeight: 17,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 19,
    otbmSpawn: { x: 1013, y: 1026, z: 7 },
    otbmMobBounds: { x: 1011, y: 1022, w: 7, h: 8, z: 7 },
    avgHp: 7800,
    avgExp: 4600,
    avgDamage: 603,
    avgArmor: 30,
    avgGold: 250,
    respawn: 0.85,
  };
})();
