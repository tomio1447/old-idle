/* bog-yalahar.js — HUNT Bogs Yalahar (nível 50–100).
 * Mapa: game/maps/bog_yalahar.otbm.
 * Criaturas: Bog Raider e Mutated Tiger (5 a 8 por onda).
 */
"use strict";

(function registerBogsYalahar() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["bog-yalahar"] = {
    name: "Bogs Yalahar",
    level: 50,
    minLevel: 50,
    cat: "low",
    pack: 5,
    packMin: 5,
    packMax: 8,
    monsters: ["bog-raider", "mutated-tiger"],
    spawnWeights: { "bog-raider": 50, "mutated-tiger": 50 },
    color: "#4a6a3a",
    scene: "bog",
    otbm: "bog_yalahar",
    otbmFloor: 7,
    otbmBounds: { x: 1015, y: 1019, w: 15, h: 12, z: 7 },
    otbmSpawn: { x: 1022, y: 1025, z: 7 },
    otbmMobBounds: { x: 1015, y: 1019, w: 15, h: 12, z: 7 },
    avgHp: 1200,
    avgExp: 775,
    avgDamage: 167,
    avgArmor: 23,
    avgGold: 50,
    respawn: 1,
  };
})();
