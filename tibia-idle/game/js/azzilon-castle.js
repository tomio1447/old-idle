/* azzilon-castle.js — HUNT 250+ Azzilon Castle (Inferniarchs).
 * Sala: game/maps/azzilon_castle.otbm (44×29, z=7 — castelo inferniarch).
 * Stats dos 3 mobs do canary (MONSTERDATA já trazia): broodrider 9600/7400,
 * gorger 9450/7180, sineater 9150/6750. Itens novos do loot registrados abaixo
 * (cids do items.xml canary + Fandom para os da update 13.30).
 */
"use strict";

(function registerAzzilonCastle() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.items = GAMEDATA.items || {};

  /* Itens de loot novos (sem comprador oficial confirmado → sell:0). */
  const NEW_ITEMS = {
    "drill-bolt":              { n: "drill bolt",              s: null, t: "loot", w: 0, cid: 16142, sell: 0, npcSell: 0 },
    "broodrider-saddle":       { n: "broodrider saddle",       s: null, t: "loot", w: 0, cid: 50058, sell: 2800, npcSell: 2800 },
    "onyx-chip":               { n: "onyx chip",               s: null, t: "loot", w: 0, cid: 22193, sell: 0, npcSell: 0 },
    "gorger-antlers":          { n: "gorger antlers",          s: null, t: "loot", w: 0, cid: 50059, sell: 2250, npcSell: 2250 },
    "sineater-wing":           { n: "sineater wing",           s: null, t: "loot", w: 0, cid: 50057, sell: 2100, npcSell: 2100 },
    "demonic-core-essence":    { n: "demonic core essence",    s: null, t: "loot", w: 0, cid: 49909, sell: 2100, npcSell: 2100 },
    "demonic-matter":          { n: "demonic matter",          s: null, t: "loot", w: 0, cid: 49894, sell: 1, npcSell: 1 },
    "mummified-demon-finger":  { n: "mummified demon finger",  s: null, t: "loot", w: 0, cid: 49908, sell: 800, npcSell: 800 },
  };
  Object.assign(GAMEDATA.items, NEW_ITEMS);

  GAMEDATA.hunts["azzilon-castle"] = {
    name: "Azzilon Castle",
    level: 250,
    minLevel: 250,
    pack: 12,
    packMin: 10,
    packMax: 15,
    monsters: ["broodrider-inferniarch", "gorger-inferniarch", "sineater-inferniarch"],
    spawnWeights: {
      "broodrider-inferniarch": 34,
      "gorger-inferniarch": 33,
      "sineater-inferniarch": 33,
    },
    color: "#8a2a1a",
    scene: "hell",
    otbm: "azzilon_castle",
    otbmFloor: 7,
    otbmSpawn: { x: 1035, y: 1035, z: 7 },       // playerspawn
    otbmMobBounds: { x: 1026, y: 1026, w: 15, h: 12, z: 7 }, // radiusspawn 1026-1040 × 1026-1037
    // Pisos da sala: 49334 mármore infernal (main), 49850, 10605, 1128 terra,
    // 4394-4409/4599 decorativos. O fov é só câmera (noFovBound vem do hunt).
    walkFloors: [101, 1128, 410, 4394, 4396, 4397, 4398, 4399, 4405, 4406,
      4407, 4408, 4409, 4599, 10605, 49334, 49339, 49850],
  };
})();
