/* asura-palace.js — HUNT Asura Palace (nível 100–250).
 * Mapa: game/maps/asurapalace.otbm.
 * Criaturas: Dawnfire Asura, Midnight Asura, Frost Flower Asura e Hellspawn.
 */
"use strict";

(function registerAsuraPalace() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["asura-palace"] = {
    name: "Asura Palace",
    level: 100,
    minLevel: 100,
    cat: "mid",
    pack: 7,
    packMin: 6,
    packMax: 9,
    monsters: ["dawnfire-asura", "midnight-asura", "frost-flower-asura", "hellspawn"],
    spawnWeights: {
      "dawnfire-asura": 40,
      "midnight-asura": 40,
      "frost-flower-asura": 15,
      "hellspawn": 5,
    },
    color: "#7a2a3a",
    scene: "palace",
    otbm: "asurapalace",
    otbmFloor: 7,
    otbmBounds: { x: 1013, y: 1018, w: 12, h: 11, z: 7 },
    otbmSpawn: { x: 1019, y: 1024, z: 7 },
    otbmMobBounds: { x: 1013, y: 1018, w: 12, h: 11, z: 7 },
    avgHp: 3100,
    avgExp: 4038,
    avgDamage: 346,
    avgArmor: 52,
    avgGold: 100,
    respawn: 1,
  };
})();
