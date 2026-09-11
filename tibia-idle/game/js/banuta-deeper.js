/* banuta-deeper.js — HUNT Banuta Deeper (nível 100–250).
 * Mapa: game/maps/banutadeeper.otbm.
 * Criaturas: Hydra, Medusa e Serpent Spawn (5 a 8 por onda).
 */
"use strict";

(function registerBanutaDeeper() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["banuta-deeper"] = {
    name: "Banuta Deeper",
    level: 100,
    minLevel: 100,
    cat: "mid",
    pack: 6,
    packMin: 5,
    packMax: 8,
    monsters: ["hydra", "medusa", "serpent-spawn"],
    spawnWeights: { hydra: 34, medusa: 33, "serpent-spawn": 33 },
    color: "#3a5a3a",
    scene: "cave",
    otbm: "banutadeeper",
    otbmFloor: 7,
    otbmBounds: { x: 1014, y: 1016, w: 17, h: 16, z: 7 },
    otbmSpawn: { x: 1023, y: 1024, z: 7 },
    otbmMobBounds: { x: 1014, y: 1016, w: 17, h: 16, z: 7 },
    avgHp: 3280,
    avgExp: 3067,
    avgDamage: 324,
    avgArmor: 36,
    avgGold: 100,
    respawn: 1,
  };
})();
