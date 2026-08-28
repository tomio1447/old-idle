/* drakens-castle.js — HUNT DRAKENS CASTLE (hunts level 100-250).
 *
 * Monstros do Canary (Zao):
 *   draken-elite, draken-abomination, draken-spellweaver.
 *
 * Mapa: drakenscastle.otbm
 *   bounds: {1005,1017,7} .. {1021,1028,7}
 *   centerroom/player spawn: {1013,1023,7}
 *   monster radius: {1008,1020,7} .. {1019,1026,7}
 */
"use strict";

(function registerDrakensCastle() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["drakens-castle"] = {
    name: "Drakens Castle",
    level: 150,
    minLevel: 100,
    cat: "guerreiro",
    pack: 5,
    packMin: 5,
    packMax: 9,
    monsters: ["draken-elite", "draken-abomination", "draken-spellweaver"],
    color: "#6a4a3a",
    scene: "cave",
    otbm: "drakenscastle",
    otbmFloor: 7,
    otbmFovBounds: { x: 1005, y: 1017, w: 17, h: 12, z: 7 },
    otbmFovWidth: 17,
    otbmFovHeight: 12,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 19,
    otbmSpawn: { x: 1013, y: 1023, z: 7 },
    otbmMobBounds: { x: 1008, y: 1020, w: 12, h: 7, z: 7 },
    avgHp: 5600,
    avgExp: 4117,
    avgDamage: 342,
    avgArmor: 43,
    avgGold: 180,
    respawn: 0.85,
  };
})();
