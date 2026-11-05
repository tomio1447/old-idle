/* rotworm-darashia.js — HUNT Rotworms Darashia (nível 8–100).
 * Mapa: game/maps/rotworm_darashia.otbm.
 * Criaturas: Rotworm e Carrion Worm; Rotworm Queen com 0,5% por spawn.
 */
"use strict";

(function registerRotwormDarashia() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  // Itens de loot da caverna — sprites extraídas do 8.60, preço da Fiona.
  const huntItems = {
    "gland": { n: "gland", s: null, t: "loot", w: 1, cid: 8143, sell: 500, npcSell: 500 },
    "carrion-worm-fang": { n: "carrion worm fang", s: null, t: "loot", w: 1, cid: 10275, sell: 500, npcSell: 500 },
  };
  for (const [slug, def] of Object.entries(huntItems))
    GAMEDATA.items[slug] = Object.assign(GAMEDATA.items[slug] || {}, def);

  GAMEDATA.hunts["rotworm-darashia"] = {
    name: "Rotworms Darashia",
    level: 8,
    minLevel: 8,
    cat: "low",
    pack: 5,
    packMin: 5,
    packMax: 8,
    monsters: ["rotworm", "carrion-worm", "rotworm-queen"],
    spawnWeights: { "rotworm": 49.75, "carrion-worm": 49.75, "rotworm-queen": 0.5 },
    color: "#5a4a2a",
    scene: "cave",
    otbm: "rotworm_darashia",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da caverna; cropar esvaziava o
    // mapa. Coords absolutas — applyHuntOtbmZones converte via sourceBounds.
    otbmSpawn: { x: 1027, y: 1034, z: 7 },
    otbmMobBounds: { x: 1021, y: 1027, w: 14, h: 12, z: 7 },
    // Pisos da caverna; 5711–5726 (paredes rochosas) e 614 (marcador
    // invisível) seguem bloqueando.
    walkFloors: [101, 231, 351, 352, 353, 354, 355, 356, 360, 361, 363, 366,
      367, 7738, 7756, 8770, 10228, 10229, 10230, 10231, 10232, 10233, 10234,
      10235, 10480],
    avgHp: 105,
    avgExp: 55,
    avgDamage: 40,
    avgArmor: 8,
    avgGold: 20,
    respawn: 1,
  };
})();
