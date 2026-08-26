/* cave-cave-edron.js — HUNT CAVE CAVE - EDRON (categoria 1-100, recomendado level 80).
 *
 * Três criaturas diretas do Canary (data-otservbr-global/monster/humans):
 * Hero, Vicious Squire, Vile Grandmaster.
 * Combate, loot, HP/XP/dano/armor, poisons e spells vêm de
 * canarymonsters.json / MONSTERDATA — esta ficha só registra a hunt.
 */
"use strict";

(function registerCaveCaveEdron() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["cave-cave-edron"] = {
    name: "Cave Cave - Edron",
    level: 1,
    minLevel: 80,
    cat: "aventureiro",
    pack: 4,
    packMin: 4,
    packMax: 6,
    monsters: ["hero", "vicious-squire", "vile-grandmaster", "renegade-knight"],
    color: "#6a7a8a",
    scene: "cave",
    otbm: "herocave_edron",
    otbmFloor: 7,
    otbmFovBounds: { x: 1052, y: 990, w: 15, h: 15, z: 7 },
    otbmFovWidth: 15,
    otbmFovHeight: 15,
    otbmRuntimeWidth: 24,
    otbmRuntimeHeight: 23,
    otbmSpawn: { x: 1059, y: 997, z: 7 },
    otbmMobBounds: { x: 1055, y: 991, w: 10, h: 12, z: 7 },
    avgHp: 1388,
    avgExp: 1200,
    avgDamage: 213,
    avgArmor: 36,
    avgGold: 54,
    respawn: 0.8,
  };
})();
