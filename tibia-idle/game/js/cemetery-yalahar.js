/* cemetery-yalahar.js — HUNT Cemetery Yalahar (nível 50–100).
 * Mapa: game/maps/cemetery_yalahar.otbm.
 * Criaturas: Banshee, Braindeath, Nightstalker e Vampire (4 a 6 por onda).
 */
"use strict";

(function registerCemeteryYalahar() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["cemetery-yalahar"] = {
    name: "Cemetery Yalahar",
    level: 50,
    minLevel: 50,
    cat: "low",
    pack: 5,
    packMin: 4,
    packMax: 6,
    monsters: ["banshee", "braindeath", "nightstalker", "vampire"],
    spawnWeights: { banshee: 25, braindeath: 25, nightstalker: 25, vampire: 25 },
    color: "#5a4a6a",
    scene: "cemetery",
    otbm: "cemetery_yalahar",
    otbmFloor: 7,
    otbmBounds: { x: 1015, y: 1016, w: 13, h: 15, z: 7 },
    otbmSpawn: { x: 1022, y: 1023, z: 7 },
    otbmMobBounds: { x: 1015, y: 1016, w: 13, h: 15, z: 7 },
    avgHp: 850,
    avgExp: 673,
    avgDamage: 110,
    avgArmor: 26,
    avgGold: 45,
    respawn: 1,
  };
})();
