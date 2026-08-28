/* draken-walls.js — HUNT DRAKEN WALLS (hunts level 150-250).
 *
 * Monstros do Canary (Zao):
 *   draken-warmaster, draken-spellweaver.
 *
 * Mapa: drakenwalls.otbm
 *   bounds: {1008,1016,7} .. {1021,1031,7}
 *   centerroom/player spawn: {1014,1024,7}
 *   monster spawn: {1011,1020,7} .. {1019,1029,7}
 */
"use strict";

(function registerDrakenWalls() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["draken-walls"] = {
    name: "Draken Walls",
    level: 180,
    minLevel: 150,
    cat: "guerreiro",
    pack: 7,
    packMin: 7,
    packMax: 9,
    monsters: ["draken-warmaster", "draken-spellweaver"],
    color: "#6a4a3a",
    scene: "cave",
    otbm: "drakenwalls",
    otbmFloor: 7,
    otbmFovBounds: { x: 1008, y: 1016, w: 14, h: 16, z: 7 },
    otbmFovWidth: 14,
    otbmFovHeight: 16,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 19,
    otbmSpawn: { x: 1014, y: 1024, z: 7 },
    otbmMobBounds: { x: 1011, y: 1020, w: 9, h: 10, z: 7 },
    avgHp: 4575,
    avgExp: 2750,
    avgDamage: 276,
    avgArmor: 40,
    avgGold: 150,
    respawn: 0.85,
  };
})();
