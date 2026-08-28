/* exotic-cave.js — HUNT EXOTIC CAVE (nível 100–150).
 *
 * Monstros do Canary:
 *   exotic-bat, exotic-cave-spider.
 *
 * Mapa: exotic-cave.otbm
 *   bounds: {1016,1016,7} .. {1038,1029,7}
 *   centeroom/player spawn: {1026,1022,7}
 *   monster spawn: {1021,1017,7} .. {1031,1027,7}
 */
"use strict";

(function registerExoticCave() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["exotic-cave"] = {
    name: "Exotic Cave",
    level: 100,
    minLevel: 100,
    cat: "cave",
    pack: 5,
    packMin: 5,
    packMax: 6,
    monsters: ["exotic-bat", "exotic-cave-spider"],
    color: "#5a4a3a",
    scene: "cave",
    otbm: "exotic-cave",
    otbmFloor: 7,
    otbmFovBounds: { x: 1017, y: 1016, w: 21, h: 13, z: 7 },
    otbmFovWidth: 21,
    otbmFovHeight: 13,
    otbmRuntimeWidth: 23,
    otbmRuntimeHeight: 14,
    otbmSpawn: { x: 1026, y: 1022, z: 7 },
    otbmMobBounds: { x: 1021, y: 1017, w: 11, h: 11, z: 7 },
    avgHp: 1700,
    avgExp: 1300,
    avgDamage: 290,
    avgArmor: 40,
    avgGold: 80,
    respawn: 0.9,
  };
})();
