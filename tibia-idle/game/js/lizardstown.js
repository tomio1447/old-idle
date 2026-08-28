/* lizardstown.js — HUNT LIZARDS TOWN (hunts level 1-100).
 *
 * Monstros do Canary (Zao):
 *   lizard-high-guard, lizard-zaogun, lizard-legionnaire, lizard-dragon-priest.
 *
 * Mapa: lizardstowm.otbm
 *   bounds: {1008,1018,7} .. {1020,1028,7}
 *   centerroom/player spawn: {1014,1023,7}
 *   monster spawn: {1011,1020,7} .. {1017,1027,7}
 */
"use strict";

(function registerLizardstown() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["lizardstown"] = {
    name: "Lizards Town",
    level: 60,
    minLevel: 1,
    cat: "guerreiro",
    pack: 3,
    packMin: 3,
    packMax: 5,
    monsters: ["lizard-high-guard", "lizard-zaogun", "lizard-legionnaire", "lizard-dragon-priest"],
    color: "#4a6a3a",
    scene: "cave",
    otbm: "lizardstowm",
    otbmFloor: 7,
    otbmFovBounds: { x: 1008, y: 1018, w: 13, h: 11, z: 7 },
    otbmFovWidth: 13,
    otbmFovHeight: 11,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 19,
    otbmSpawn: { x: 1014, y: 1023, z: 7 },
    otbmMobBounds: { x: 1011, y: 1020, w: 7, h: 8, z: 7 },
    avgHp: 1901,
    avgExp: 1393,
    avgDamage: 221,
    avgArmor: 34,
    avgGold: 80,
    respawn: 0.85,
  };
})();
