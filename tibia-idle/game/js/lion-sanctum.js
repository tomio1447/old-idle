/* lion-sanctum.js — HUNT Lion Sanctum (nível 250+).
 * Mapa: game/maps/lion_sanctum.otbm.
 * Criaturas: Werelion e White Lion (7 a 10 por onda).
 */
"use strict";

(function registerLionSanctum() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  // Itens de loot do santuário — sprites extraídas do 8.60, preço de
  // creature product (Fiona/TibiaWiki).
  const huntItems = {
    "lion-figurine": { n: "lion figurine", s: null, t: "loot", w: 1, cid: 33781, sell: 10000, npcSell: 10000 },
    "ivory-carving": { n: "ivory carving", s: null, t: "loot", w: 1, cid: 33945, sell: 300, npcSell: 300 },
    "white-silk-flower": { n: "white silk flower", s: null, t: "loot", w: 1, cid: 34008, sell: 9000, npcSell: 9000 },
  };
  for (const [slug, def] of Object.entries(huntItems))
    GAMEDATA.items[slug] = Object.assign(GAMEDATA.items[slug] || {}, def);

  GAMEDATA.hunts["lion-sanctum"] = {
    name: "Lion Sanctum",
    level: 250,
    minLevel: 250,
    cat: "high",
    pack: 8,
    packMin: 7,
    packMax: 10,
    monsters: ["werelion", "white-lion", "werelioness"],
    spawnWeights: { "werelion": 40, "werelioness": 40, "white-lion": 20 },
    color: "#c8a848",
    scene: "rock",
    otbm: "lion_sanctum",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da sala; cropar esvaziava o
    // mapa. Spawn em SQM de areia (o centro exato é decoração bloqueada).
    otbmSpawn: { x: 1019, y: 1025, z: 7 },
    otbmMobBounds: { x: 1016, y: 1022, w: 14, h: 12, z: 7 },
    // Piso da sala: 923/422 = areia, 32981 = trilha do círculo interno;
    // 16866 (swamp clay mountain) segue bloqueando como parede.
    walkFloors: [923, 422, 32981],
    avgHp: 2400,
    avgExp: 2200,
    avgDamage: 450,
    avgArmor: 60,
    avgGold: 300,
    respawn: 1,
  };
})();
