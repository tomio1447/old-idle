/* putrefactory.js — HUNT Putrefactory (BLOOD ROTTEN 600+).
 * Mapa: game/maps/putrefactory.otbm (38×31, z=7 — único piso; bounds
 * 1009,1016–1046,1046).
 * Criaturas: Meandering Mushroom, Oozing Carcass, Rotten Man-Maggot e
 * Sopping Carcass (8 a 12 por onda) — stats vêm de canarymonsters.json /
 * MONSTERDATA.
 * Coordenadas RME informadas:
 *   centerroom {1028,1031,7}
 *   mobbounds  {1022,1027,7} → {1034,1035,7}
 *
 * Loot:
 *   - 4 produtos de criatura novos (lichen gobbler, worm sponge, decayed
 *     finger bone, blooded worm) com cids reais do client 15.x e preços
 *     oficiais de NPC (TibiaWiki). Lichen Gobbler é item de quest sem
 *     comprador NPC (some em 10 min) → sell 0, igual aos ectoplasms.
 *   - O Canary oficial ainda publica o Sopping Carcass com
 *     `monster.loot = {}` — a tabela abaixo usa as chances reais medidas
 *     (loot rate 1×) e cobre exatamente os drops da TibiaWiki.
 *   - Patch de mar/2025 no oficial: +Assassin Dagger (raro) no Meandering
 *     Mushroom e +Stone Skin Amulet (muito raro) em Oozing/Sopping Carcass —
 *     ausentes do dump Canary, adicionados na mesma banda de chance.
 *
 * `data.registerLoot(monsters)` aplica a mesma correção no catálogo do
 * servidor (authoritative_engine chama com MONSTERS — bloodrotten.js usa o
 * mesmo padrão para a Bag You Covet). */
"use strict";

const PUTREFACTORY = (() => {
  const items = {
    "lichen-gobbler":      { n: "lichen gobbler", s: null, t: "loot", cid: 43782, w: 1.00, sell: 0, npcSell: 0 },
    "decayed-finger-bone": { n: "decayed finger bone", s: null, t: "loot", cid: 43846, w: 1.00, sell: 5100, npcSell: 5100 },
    "worm-sponge":         { n: "worm sponge", s: null, t: "loot", cid: 43848, w: 1.00, sell: 4200, npcSell: 4200 },
    "blooded-worm":        { n: "blooded worm", s: null, t: "loot", cid: 43857, w: 1.00, sell: 4700, npcSell: 4700 },
  };

  /* Tabela completa do Sopping Carcass (oficial tem loot vazio) e drops
   * adicionais dos outros dois monstros. */
  const replace = {
    "sopping-carcass": [
      { chance: 50.6, max: 1, item: "crystal-coin" },
      { chance: 16, max: 3, item: "soul-orb" },
      { chance: 8.58, max: 1, item: "decayed-finger-bone" },
      { chance: 8.28, max: 1, item: "lichen-gobbler" },
      { chance: 5.33, max: 1, item: "rotten-roots" },
      { chance: 5.33, max: 1, item: "yellow-gem" },
      { chance: 4.73, max: 1, item: "red-gem" },
      { chance: 4.14, max: 3, item: "ultimate-mana-potion" },
      { chance: 2.96, max: 1, item: "underworld-rod" },
      { chance: 2.37, max: 1, item: "skull-helmet" },
      { chance: 2.07, max: 1, item: "ripper-lance" },
      { chance: 0.5, max: 1, item: "stone-skin-amulet" },
    ],
  };
  const append = {
    "meandering-mushroom": [{ chance: 1.5, max: 1, item: "assassin-dagger" }],
    "oozing-carcass": [{ chance: 0.5, max: 1, item: "stone-skin-amulet" }],
  };

  const data = {
    items,
    monsters: ["meandering-mushroom", "oozing-carcass", "rotten-man-maggot",
      "sopping-carcass"],
    registerLoot(monsters) {
      if (!monsters) return;
      for (const slug in replace) if (monsters[slug])
        monsters[slug].loot = replace[slug].slice();
      for (const slug in append) if (monsters[slug]) {
        const monster = monsters[slug];
        const seen = new Set((monster.loot || []).map((l) => l.item));
        monster.loot = (monster.loot || [])
          .concat(append[slug].filter((l) => !seen.has(l.item)));
      }
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = data;
  if (typeof window === "undefined") return data;
  window.PUTREFACTORY = data;

  (function registerPutrefactory() {
    if (typeof GAMEDATA === "undefined") return;
    const catalog = GAMEDATA.items;
    for (const slug in items) {
      const def = items[slug];
      if (!catalog[slug]) catalog[slug] = def;
      else {
        catalog[slug].sell = def.sell;
        catalog[slug].npcSell = def.npcSell;
        if (def.cid != null && catalog[slug].cid == null) catalog[slug].cid = def.cid;
        if (def.w != null && catalog[slug].w == null) catalog[slug].w = def.w;
      }
    }

    // Tabelas de loot: copia os defs do MONSTERDATA para GAMEDATA.monsters
    // (mesmo padrão do bloodrotten.js) e aplica as correções oficiais.
    GAMEDATA.monsters = GAMEDATA.monsters || {};
    for (const slug of data.monsters)
      if (!GAMEDATA.monsters[slug] && typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug])
        GAMEDATA.monsters[slug] = MONSTERDATA[slug];
    data.registerLoot(GAMEDATA.monsters);

    GAMEDATA.hunts = GAMEDATA.hunts || {};
    GAMEDATA.hunts["putrefactory"] = {
      name: "Putrefactory",
      level: 600,
      minLevel: 600,
      cat: "hardcore",
      pack: 12,
      packMin: 8,
      packMax: 12,
      monsters: data.monsters.slice(),
      spawnWeights: { "meandering-mushroom": 25, "oozing-carcass": 25,
        "rotten-man-maggot": 25, "sopping-carcass": 25 },
      color: "#6e6232",
      scene: "cave",
      otbm: "putrefactory",
      otbmFloor: 7,
      // Sem otbmBounds: o .otbm já é o recorte da área.
      otbmSpawn: { x: 1028, y: 1031, z: 7 },
      otbmMobBounds: { x: 1022, y: 1027, w: 13, h: 9, z: 7 },
      avgHp: 30100,
      avgExp: 22253,
      avgDamage: 938,
      avgArmor: 109,
      avgGold: 400,
      respawn: 1,
    };
  })();

  return data;
})();
