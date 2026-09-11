/* feyrist-nightmare.js — HUNT Feyrist Nightmare (nível 50–100).
 * Mapa: game/maps/feyrist_nightmare.otbm.
 * Criaturas: Weakened Frazzlemaw e Enfeebled Silencer (4 a 6 por onda).
 */
"use strict";

(function registerFeyristNightmare() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["feyrist-nightmare"] = {
    name: "Feyrist Nightmare",
    level: 50,
    minLevel: 50,
    cat: "low",
    pack: 5,
    packMin: 4,
    packMax: 6,
    monsters: ["weakened-frazzlemaw", "enfeebled-silencer"],
    spawnWeights: { "weakened-frazzlemaw": 50, "enfeebled-silencer": 50 },
    color: "#8a4a9a",
    scene: "fey",
    otbm: "feyrist_nightmare",
    otbmFloor: 7,
    otbmBounds: { x: 1014, y: 1016, w: 19, h: 16, z: 7 },
    otbmSpawn: { x: 1024, y: 1024, z: 7 },
    otbmMobBounds: { x: 1014, y: 1016, w: 19, h: 16, z: 7 },
    avgHp: 1150,
    avgExp: 1050,
    avgDamage: 145,
    avgArmor: 45,
    avgGold: 50,
    respawn: 1,
  };
})();
