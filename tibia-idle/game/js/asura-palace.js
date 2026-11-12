/* asura-palace.js — HUNT Asura Palace (nível 250+).
 * Mapa: game/maps/asura_palace.otbm (12×11, z=7 — sala do palácio).
 * Criaturas: Dawnfire Asura 40%, Midnight Asura 40%, Frost Flower
 * Asura 20% — sempre 8 monstros por onda (respawn fixo).
 * Coordenadas RME informadas:
 *   centerroom {1019,1024,7}
 *   mobbounds  {1015,1020,7} → {1023,1028,7}
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
    otbmSpawn: { x: 1019, y: 1024, z: 7 },
    otbmMobBounds: { x: 1015, y: 1020, w: 9, h: 9, z: 7 },
    // Pisos do mapa: 8230 mármore do palácio, 925/927/928 areia.
    walkFloors: [8230, 925, 927, 928],
    avgHp: 3100,
    avgExp: 4130,
    avgDamage: 380,
    avgArmor: 44,
    avgGold: 400,
    respawn: 1,
  };
})();
