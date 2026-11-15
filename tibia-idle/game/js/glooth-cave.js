/* glooth-cave.js — HUNT Glooth Cave (nível 150+, Oramond).
 * Mapa: game/maps/glooths_cave.otbm (38×29, z=7 — único piso; bounds
 * 1008,1016–1045,1044).
 * Criaturas: Glooth Bandit e Glooth Brigand (6 a 12 por onda) — stats e
 * loot vêm de canarymonsters.json / MONSTERDATA.
 * Coordenadas RME informadas:
 *   centerroom {1025,1030,7}
 *   mobbounds  {1019,1025,7} → {1035,1033,7}
 */
"use strict";

(function registerGloothCave() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items;

  /* Loot novo + preços NPC oficiais (TibiaWiki): glooth set vende ao Flint
   * (Rathleton), terra set/armas ao Rashid/Alesar/Nah'bob.
   * Sem comprador NPC (sell=0, não inventar valor): glooth-bag,
   * glooth-capsule, tainted-glooth-capsule, glooth-sandwich, glooth-steak
   * e glooth-spear. */
  const registerLootItem = (slug, def) => {
    const sell = Math.max(0, Math.floor(Number(def.sell) || 0));
    const npcSell = def.npcSell != null
      ? Math.max(0, Math.floor(Number(def.npcSell) || 0))
      : sell;
    const base = Object.assign({ s: null, t: "loot" }, def, { sell, npcSell });
    if (!items[slug]) items[slug] = base;
    else {
      items[slug].sell = sell;
      items[slug].npcSell = npcSell;
      if (def.n && !items[slug].n) items[slug].n = def.n;
      if (def.cid && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  };

  /* Itens novos (sprites extraídos para game/assets/item/). Os dois
   * amuletos carregam os atributos canônicos de accessorydata.js — este
   * arquivo roda depois do PATCHES, então os dados ficam completos aqui. */
  const gloothLootItems = {
    "glooth-bag":              { n: "glooth bag", cid: 21203, w: 30, sell: 0 },
    "glooth-capsule":          { n: "glooth capsule", cid: 21814, w: 1.5, sell: 0 },
    "tainted-glooth-capsule":  { n: "tainted glooth capsule", cid: 21816, w: 1.5, sell: 0 },
    "glooth-sandwich":         { n: "glooth sandwich", cid: 21143, w: 8, sell: 0 },
    "glooth-steak":            { n: "glooth steak", cid: 21146, w: 12, sell: 0 },
    "glooth-amulet":           { n: "glooth amulet", cid: 21183, w: 2.2,
                                 s: "amulet", t: "accessory", sell: 2000,
                                 desc: "Amuleto glooth (proteção +10% em todos os elementos). 20 cargas.",
                                 charges: 20, lvl: 200,
                                 res: { physical: 10, fire: 10, earth: 10, energy: 10, ice: 10,
                                        holy: 10, death: 10 } },
    "terra-amulet":            { n: "terra amulet", cid: 814, w: 5,
                                 s: "amulet", t: "accessory", sell: 1500,
                                 desc: "Amuleto de terra (proteção terra +20%, fogo -10%). 200 cargas.",
                                 charges: 200, lvl: 60,
                                 res: { earth: 20, fire: -10 } },
  };
  Object.keys(gloothLootItems).forEach((slug) => registerLootItem(slug, gloothLootItems[slug]));

  /* Correções de preço NPC (TibiaWiki) para loot já registrado sem sell
   * ou com valor divergente do oficial. */
  const gloothPriceFixes = {
    "glooth-blade":           { sell: 1500 },  // Flint
    "glooth-club":            { sell: 1500 },  // Flint
    "glooth-axe":             { sell: 1500 },  // Flint
    "glooth-cape":            { sell: 7000 },  // Flint
    "heat-core":              { sell: 10000 }, // Flint
    "glooth-spear":           { sell: 0 },     // sem comprador NPC
    "terra-hood":             { sell: 2500 },  // Rashid
    "beastslayer-axe":        { sell: 1500 },  // Rashid
    "dreaded-cleaver":        { sell: 15000 }, // Alesar
    "butcher-s-axe":          { sell: 18000 }, // Nah'bob
    "war-axe":                { sell: 12000 }, // Rashid
    "skull-staff":            { sell: 6000 },  // Alesar
    "giant-shimmering-pearl": { sell: 3000 },  // joalherias
    "small-topaz":            { sell: 200 },   // joalherias
  };
  Object.keys(gloothPriceFixes).forEach((slug) => {
    registerLootItem(slug, gloothPriceFixes[slug]);
  });

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["glooth-cave"] = {
    name: "Glooth Cave - Oramond",
    level: 150,
    minLevel: 150,
    cat: "mid",
    pack: 12,
    packMin: 6,
    packMax: 12,
    monsters: ["glooth-bandit", "glooth-brigand"],
    spawnWeights: { "glooth-bandit": 50, "glooth-brigand": 50 },
    color: "#5f8a4a",
    scene: "cave",
    otbm: "glooths_cave",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1025, y: 1030, z: 7 },
    otbmMobBounds: { x: 1019, y: 1025, w: 17, h: 9, z: 7 },
    // Pisos caminháveis da caverna (terra glooth + piso claro).
    walkFloors: [10605, 12355],
    avgHp: 2500,
    avgExp: 1950,
    avgDamage: 200,
    avgArmor: 49,
    avgGold: 150,
    respawn: 1,
  };
})();
