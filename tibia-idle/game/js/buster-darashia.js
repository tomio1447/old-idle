/* buster-darashia.js — HUNT Buster Spectre - Darashia (nível 150+).
 * Mapa: game/maps/buster_darashia.otbm (37×26, z=7 — único piso; bounds
 * 1007,1014–1043,1039).
 * Criatura: Burster Spectre (5 a 8 por onda) — stats e loot vêm de
 * canarymonsters.json / MONSTERDATA; itens de loot já registrados por
 * buried-cathedral.js (mesma tabela de drops do espectro).
 * Coordenadas RME informadas:
 *   centerroom {1024,1026,7}
 *   mobbounds  {1019,1023,7} → {1030,1030,7}
 */
"use strict";

(function registerBusterDarashia() {
  if (typeof GAMEDATA === "undefined") return;

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["buster-darashia"] = {
    name: "Buster Spectre - Darashia",
    level: 150,
    minLevel: 150,
    cat: "mid",
    pack: 8,
    packMin: 5,
    packMax: 8,
    monsters: ["burster-spectre"],
    color: "#55617e",
    scene: "crypt",
    otbm: "buster_darashia",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1024, y: 1026, z: 7 },
    otbmMobBounds: { x: 1019, y: 1023, w: 12, h: 8, z: 7 },
    avgHp: 6500,
    avgExp: 6000,
    avgDamage: 400,
    avgArmor: 70,
    avgGold: 300,
    respawn: 1,
  };
})();
