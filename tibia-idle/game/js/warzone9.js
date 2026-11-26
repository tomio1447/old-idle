/* warzone9.js — HUNT Warzone 9 (nível 400+).
 * Mapa: game/maps/warzone_9.otbm (32×25, z=7 — único piso; bounds
 * 1011,1017–1042,1041). Componente caminhável principal de 149 sqm.
 * Criaturas: Cave Chimera, Tremendous Tyrant e Varnished Diremaw
 * (8 a 10 por onda) — stats, skills, resistências e loot vêm de
 * canarymonsters.json / MONSTERDATA.
 * Coordenadas RME informadas:
 *   playerspawn   {1027,1029,7} (centro geométrico da arena, caminhável)
 *   respawnradius {1022,1024,7} → {1028,1033,7} (7×10 = 70 sqm, todas
 *                 caminháveis e conectadas)
 *
 * Tabela de loot: dump Canary (canarymonsters.json). Creature products
 * novos com preços oficiais Yasir (TibiaWiki / Creature Products by NPC
 * Price); cids/pesos do canary-items.xml (client 15.x). Ícones 32×32 em
 * game/assets/item/<slug>.png renderizados por
 * tools/import_warzone9_assets.py.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa, o que põe
 * os creature products no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* Creature products novos do loot — preços oficiais Yasir (TibiaWiki).
 * brown-crystal-splinter já existia (roshamuul/buried-cathedral,
 * joalheria 400) — não é redeclarado. */
const WARZONE9_LOOT_ITEMS = {
  "cave-chimera-leg":           { n: "cave chimera leg",           s: null, t: "loot", cid: 36788, w: 1.10, sell: 650,  npcSell: 650 },
  "cave-chimera-head":          { n: "cave chimera head",          s: null, t: "loot", cid: 36787, w: 1.90, sell: 1200, npcSell: 1200 },
  "tremendous-tyrant-shell":    { n: "tremendous tyrant shell",    s: null, t: "loot", cid: 36784, w: 2.50, sell: 740,  npcSell: 740 },
  "tremendous-tyrant-head":     { n: "tremendous tyrant head",     s: null, t: "loot", cid: 36783, w: 1.80, sell: 930,  npcSell: 930 },
  "varnished-diremaw-brainpan": { n: "varnished diremaw brainpan", s: null, t: "loot", cid: 36781, w: 1.50, sell: 750,  npcSell: 750 },
  "varnished-diremaw-legs":     { n: "varnished diremaw legs",     s: null, t: "loot", cid: 36782, w: 2.29, sell: 670,  npcSell: 670 },
};

/* Correções de preço em itens já existentes do catálogo que aparecem no
 * loot: warrior's shield tem comprador oficial — Rock in a Hard Place
 * (Gray Beach) paga 9.000 (TibiaWiki / weapondata npcSell 9000). O patch
 * de deathlings-sunken-temple zerava o preço no cliente ("valor de uso
 * maior que o NPC"), mas o servidor continuou pagando 9.000 — divergência
 * client×engine. Restaura o oficial nos dois lados. Este arquivo precisa
 * carregar DEPOIS de deathlings-sunken-temple.js no index.html. */
const WARZONE9_LOOT_PRICE_FIXES = {
  "warrior-s-shield": 9000,
};

(function registerWarzone9() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in WARZONE9_LOOT_ITEMS) {
    const def = WARZONE9_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }
  for (const slug in WARZONE9_LOOT_PRICE_FIXES) {
    if (!items[slug]) continue;
    items[slug].sell = WARZONE9_LOOT_PRICE_FIXES[slug];
    items[slug].npcSell = WARZONE9_LOOT_PRICE_FIXES[slug];
  }

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["warzone-9"] = {
    name: "Warzone 9",
    level: 400,
    minLevel: 400,
    cat: "hard",
    pack: 10,
    packMin: 8,
    packMax: 10,
    monsters: ["cave-chimera", "tremendous-tyrant", "varnished-diremaw"],
    spawnWeights: {
      "cave-chimera": 34,
      "tremendous-tyrant": 33,
      "varnished-diremaw": 33,
    },
    color: "#7a5a35",
    scene: "cave",
    otbm: "warzone_9",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1027, y: 1029, z: 7 },
    otbmMobBounds: { x: 1022, y: 1024, w: 7, h: 10, z: 7 },
    // Médias ponderadas pelos spawnWeights (dump Canary):
    //   hp  8000/11500/9000 → 9485 · exp 6800/6100/5900 → 6272
    //   dmg 600/400/400 → 468    · armor 60/71/50 → 60
    avgHp: 9485,
    avgExp: 6272,
    avgDamage: 470,
    avgArmor: 60,
    avgGold: 800,
    respawn: 1,
  };
})();
