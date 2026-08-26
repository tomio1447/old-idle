/* ankrahmun-tombs.js — HUNT ANKRAHMUN TOMBS (categoria 1-100, recomendado level 25).
 *
 * Quatro criaturas diretas do Canary (data-otservbr-global/monster/undeads):
 * Mummy, Ghoul, Demon Skeleton, Vampire.
 * Combate, loot, HP/XP/dano/armor, poisons e spells vêm de
 * canarymonsters.json / MONSTERDATA — esta ficha só registra a hunt.
 *
 * Mapa: ankrahmun_tombs.otbm
 *   bounds: {1014,1017,7} .. {1026,1031,7}
 *   center/spawn: {1020,1024,7}
 *   mob zone: {1017,1019,7} .. {1023,1029,7} (7×11)
 */
"use strict";

(function registerAnkrahmunTombs() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["ankrahmun-tombs"] = {
    name: "Ankrahmun Tombs",
    level: 1,
    minLevel: 25,
    cat: "aventureiro",
    pack: 3,
    packMin: 3,
    packMax: 5,
    monsters: ["mummy", "ghoul", "demon-skeleton", "vampire"],
    color: "#8a7a5a",
    scene: "cave",
    otbm: "ankrahmun_tombs",
    otbmFloor: 7,
    otbmFovBounds: { x: 1014, y: 1017, w: 13, h: 15, z: 7 },
    otbmFovWidth: 13,
    otbmFovHeight: 15,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 15,
    otbmSpawn: { x: 1020, y: 1024, z: 7 },
    otbmMobBounds: { x: 1017, y: 1019, w: 7, h: 11, z: 7 },
    avgHp: 304,
    avgExp: 195,
    avgDamage: 123,
    avgArmor: 19,
    avgGold: 22,
    respawn: 0.8,
  };
})();
