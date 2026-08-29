/* nightmare-isle.js — HUNT Nightmare Isle (nível 250+).
 * Mapa: game/maps/nightmareisland.otbm.
 * Criaturas: Retching Horror e Choking Fear (sempre 8 simultâneos).
 */
"use strict";

(function registerNightmareIsle() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["nightmare-isle"] = {
    name: "Nightmare Isle",
    level: 250,
    minLevel: 250,
    cat: "hard",
    pack: 8,
    packMin: 8,
    packMax: 8,
    monsters: ["retching-horror", "choking-fear"],
    spawnWeights: { "retching-horror": 50, "choking-fear": 50 },
    color: "#4a3a5a",
    scene: "palace",
    otbm: "nightmareisland",
    otbmFloor: 7,
    otbmBounds: { x: 1009, y: 1016, w: 21, h: 14, z: 7 },
    otbmSpawn: { x: 1021, y: 1023, z: 7 },
    otbmMobBounds: { x: 1009, y: 1016, w: 21, h: 14, z: 7 },
    avgHp: 5550,
    avgExp: 4400,
    avgDamage: 450,
    avgArmor: 48,
    avgGold: 100,
    respawn: 1,
  };
})();
