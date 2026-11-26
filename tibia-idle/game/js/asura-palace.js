/* asura-palace.js — HUNT Asura Palace (nível 250+).
 * Mapa: game/maps/asura_palace.otbm (63×41, z=7 — palácio completo).
 * Criaturas: Dawnfire Asura 40%, Midnight Asura 40%, Frost Flower
 * Asura 20% — 8 aleatórios + 5 fixos por onda (respawn fixo).
 * Coordenadas RME:
 *   centerroom {1044,1034,7}
 *   mobbounds  {1040,1030,7} → {1049,1040,7} (10×11)
 *   fixos      {1030,1041} {1030,1034} {1030,1028} {1036,1041} {1054,1042}
 */
"use strict";

(function registerAsuraPalace() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["asura-palace"] = {
    name: "Asura Palace",
    level: 250,
    minLevel: 250,
    cat: "high",
    pack: 8,
    packMin: 8,
    packMax: 8,
    monsters: ["dawnfire-asura", "midnight-asura", "frost-flower-asura"],
    spawnWeights: { "dawnfire-asura": 40, "midnight-asura": 40, "frost-flower-asura": 20 },
    color: "#7a4a8a",
    scene: "palace",
    otbm: "asura_palace",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1044, y: 1034, z: 7 },
    otbmMobBounds: { x: 1040, y: 1030, w: 10, h: 11, z: 7 },
    // Pontos fixos: cada célula mantém 1 monstro extra (slug via spawnWeights).
    otbmFixedSpawns: [
      { x: 1030, y: 1041, z: 7 },
      { x: 1030, y: 1034, z: 7 },
      { x: 1030, y: 1028, z: 7 },
      { x: 1036, y: 1041, z: 7 },
      { x: 1054, y: 1042, z: 7 },
    ],
    avgHp: 3100,
    avgExp: 4130,
    avgDamage: 380,
    avgArmor: 44,
    avgGold: 400,
    respawn: 1,
  };
})();
