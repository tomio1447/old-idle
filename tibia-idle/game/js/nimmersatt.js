/* nimmersatt.js — HUNT Nimmersatt's Breeding Ground (nível 400+).
 * Mapa: game/maps/nimmersatt_breeding_ground.otbm (46×32, z=7 — único
 * piso; bounds 1010,1016–1055,1047). Componente caminhável principal de
 * 299 sqm.
 * Criaturas: Dragolisk, Mega Dragon e Wardragon (8 a 10 por onda) —
 * stats, skills, resistências e loot vêm de canarymonsters.json /
 * MONSTERDATA (o dump prevalece sobre o wiki: exp 5050/7810/5810).
 * Coordenadas RME informadas:
 *   playerspawn   {1030,1030,7}
 *   respawnradius {1023,1024,7} → {1037,1037,7} (15×14 = 210 sqm, todas
 *                 caminháveis e conectadas)
 *
 * Tabela de loot: dump Canary (canarymonsters.json). Creature products
 * novos com preços oficiais Yasir (TibiaWiki / Creature Products by NPC
 * Price); cids/pesos do canary-items.xml (client 13.30). Ícones 32×32 em
 * game/assets/item/<slug>.png renderizados por
 * tools/import_nimmersatt_assets.py.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa, o que põe
 * os creature products no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* Creature products novos do loot — preços oficiais Yasir (TibiaWiki).
 * Já existiam no catálogo e NÃO são redeclarados: prismatic-quartz
 * (24962, joalheria 450), dragon-tongue (24938, Yasir 550) e white-gem
 * (32769, joalheria 12.000 — via brainstealer-boss.js/sir-leonard.js). */
const NIMMERSATT_LOOT_ITEMS = {
  "nimmersatt-s-seal":      { n: "Nimmersatt's seal",      s: null, t: "loot", cid: 44743, w: 2.00, sell: 520,  npcSell: 520 },
  "molten-dragon-essence":  { n: "molten dragon essence",  s: null, t: "loot", cid: 44744, w: 2.00, sell: 840,  npcSell: 840 },
  "mega-dragon-heart":      { n: "mega dragon heart",      s: null, t: "loot", cid: 44745, w: 2.00, sell: 1100, npcSell: 1100 },
  "dragolisk-eye":          { n: "dragolisk eye",          s: null, t: "loot", cid: 44746, w: 2.00, sell: 690,  npcSell: 690 },
  "dragolisk-poison-gland": { n: "dragolisk poison gland", s: null, t: "loot", cid: 44747, w: 2.00, sell: 475,  npcSell: 475 },
  "wardragon-claw":         { n: "wardragon claw",         s: null, t: "loot", cid: 44748, w: 2.00, sell: 550,  npcSell: 550 },
  "wardragon-tooth":        { n: "wardragon tooth",        s: null, t: "loot", cid: 44749, w: 2.00, sell: 730,  npcSell: 730 },
};

(function registerNimmersatt() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in NIMMERSATT_LOOT_ITEMS) {
    const def = NIMMERSATT_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["nimmersatt-breeding-ground"] = {
    name: "Nimmersatt's Breeding Ground",
    level: 400,
    minLevel: 400,
    cat: "hard",
    pack: 10,
    packMin: 8,
    packMax: 10,
    monsters: ["dragolisk", "mega-dragon", "wardragon"],
    spawnWeights: {
      "dragolisk": 34,
      "mega-dragon": 33,
      "wardragon": 33,
    },
    // Cena de covil de dragões — mesma das hunts "dragons"/"dragonlords".
    color: "#8a3a2a",
    scene: "lair",
    otbm: "nimmersatt_breeding_ground",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1030, y: 1030, z: 7 },
    otbmMobBounds: { x: 1023, y: 1024, w: 15, h: 14, z: 7 },
    // Médias ponderadas pelos spawnWeights (dump Canary):
    //   hp  6180/7920/6960 → 7012 · exp 5050/7810/5810 → 6212
    //   dmg 200/450/450 → 365    · armor 86/76/80 → 81
    avgHp: 7012,
    avgExp: 6212,
    avgDamage: 365,
    avgArmor: 81,
    avgGold: 800,
    respawn: 1,
  };
})();
