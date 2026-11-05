/* lions-rock-darashia.js — HUNT Lion's Rock Darashia (nível 8–100).
 * Mapa: game/maps/roaring_lion_darashia.otbm.
 * Criatura: Roaring Lion (3 a 6 por onda). Drop raro: roaring lion soul
 * core (0,05%) — item da montaria.
 */
"use strict";

(function registerLionsRockDarashia() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.items["roaring-lion-soul-core"] = Object.assign(
    GAMEDATA.items["roaring-lion-soul-core"] || {},
    { n: "roaring lion soul core", s: null, t: "loot", w: 1, cid: 47771, sell: 0, npcSell: 0 });

  const monsters = typeof MONSTERDATA !== "undefined" ? MONSTERDATA : GAMEDATA.monsters || {};
  const lion = monsters["roaring-lion"];
  if (lion) {
    lion.loot = (lion.loot || []).concat({ chance: 0.05, max: 1, item: "roaring-lion-soul-core" });
  }

  GAMEDATA.hunts["lions-rock-darashia"] = {
    name: "Lion's Rock Darashia",
    level: 50,
    minLevel: 50,
    cat: "low",
    pack: 4,
    packMin: 3,
    packMax: 6,
    monsters: ["roaring-lion"],
    spawnWeights: { "roaring-lion": 100 },
    color: "#a8842a",
    scene: "rock",
    otbm: "roaring_lion_darashia",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte; cropar esvaziava o mapa.
    otbmSpawn: { x: 1022, y: 1026, z: 7 },
    otbmMobBounds: { x: 1015, y: 1021, w: 16, h: 11, z: 7 },
    // Piso da área de leões: 499 = chão principal + variações de chão;
    // 16866 (montanha) segue bloqueando como parede.
    walkFloors: [499, 543, 521, 523, 525, 527, 19272],
    avgHp: 800,
    avgExp: 800,
    avgDamage: 150,
    avgArmor: 30,
    avgGold: 100,
    respawn: 1,
  };
})();
