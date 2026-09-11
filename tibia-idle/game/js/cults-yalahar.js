/* cults-yalahar.js — HUNT Cults Yalahar (nível 50–100).
 * Mapa: game/maps/cultsyalahar.otbm.
 * Criaturas: Acolyte of the Cult, Adept of the Cult e Enlightened of the Cult (4 a 6 por onda).
 */
"use strict";

(function registerCultsYalahar() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["cults-yalahar"] = {
    name: "Cults Yalahar",
    level: 50,
    minLevel: 50,
    cat: "low",
    pack: 5,
    packMin: 4,
    packMax: 6,
    monsters: ["acolyte-of-the-cult", "adept-of-the-cult", "enlightened-of-the-cult"],
    spawnWeights: { "acolyte-of-the-cult": 34, "adept-of-the-cult": 33, "enlightened-of-the-cult": 33 },
    color: "#6a5a4a",
    scene: "cave",
    otbm: "cultsyalahar",
    otbmFloor: 7,
    otbmBounds: { x: 1015, y: 1018, w: 12, h: 12, z: 7 },
    otbmSpawn: { x: 1021, y: 1024, z: 7 },
    otbmMobBounds: { x: 1015, y: 1018, w: 12, h: 12, z: 7 },
    avgHp: 507,
    avgExp: 400,
    avgDamage: 97,
    avgArmor: 34,
    avgGold: 40,
    respawn: 1,
  };
})();
