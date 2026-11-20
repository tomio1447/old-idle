/* gloom-pillars.js — HUNT Gloom Pillars (BLOOD ROTTEN 600+).
 * Mapa: game/maps/gloom_pillars.otbm (26×21, z=7 — único piso; bounds
 * 1012,1016–1037,1036).
 * Criaturas: Converter, Darklight Construct, Darklight Emitter e
 * Wandering Pillar (8 a 12 por onda) — stats vêm de canarymonsters.json /
 * MONSTERDATA.
 * Coordenadas RME informadas:
 *   centerroom {1025,1025,7}
 *   mobbounds  {1021,1019,7} → {1029,1030,7}
 *
 * Loot:
 *   - 3 itens novos com cids reais do client 15.x: darklight obsidian
 *     axe (43781, item de quest da Rotten Blood — npcvalue
 *     confirmado 8000), basalt crumbs (43858, Yasir 3000) e basalt core (43859,
 *     Yasir 5800).
 *   - Correção de paridade: zaoan armor/shoes tinham no catálogo do
 *     cliente valores antigos do yasir-prices.js (12000/6000); os
 *     preços oficiais (Esrik) são 14000/5000 — mesmos do servidor.
 *   - Drops oficiais ausentes do dump Canary (verificado no upstream):
 *     +might-ring e +ultimate-mana-potion (semi-raro) e +lightning-legs
 *     (raro) no Converter; +green-gem (raro) no Construct e no Emitter.
 *
 * `data.registerLoot(monsters)` aplica a mesma correção no catálogo do
 * servidor (authoritative_engine chama com MONSTERS — padrão
 * bloodrotten.js/registerBagLoot). */
"use strict";

const GLOOM_PILLARS = (() => {
  const items = {
    "darklight-obsidian-axe": { n: "darklight obsidian axe", s: null, t: "loot", cid: 43781, w: 1.00, sell: 8000, npcSell: 8000 },
    "basalt-crumbs":          { n: "basalt crumbs", s: null, t: "loot", cid: 43858, w: 1.00, sell: 3000, npcSell: 3000 },
    "basalt-core":            { n: "basalt core", s: null, t: "loot", cid: 43859, w: 1.00, sell: 5800, npcSell: 5800 },
    // Paridade de preço oficial (Esrik): o cliente trazia valores antigos.
    "zaoan-armor":            { n: "zaoan armor", s: null, t: "loot", cid: 10384, w: 95.5, sell: 14000, npcSell: 14000 },
    "zaoan-shoes":            { n: "zaoan shoes", s: null, t: "loot", cid: 10386, w: 7, sell: 5000, npcSell: 5000 },
  };

  /* Apenas appends — as tabelas Canary dos quatro monstros já cobrem o
   * restante da lista oficial; o wandering-pillar está completo. */
  const append = {
    "converter": [
      { chance: 4, max: 1, item: "might-ring" },
      { chance: 4, max: 2, item: "ultimate-mana-potion" },
      { chance: 1.5, max: 1, item: "lightning-legs" },
    ],
    "darklight-construct": [{ chance: 1.5, max: 1, item: "green-gem" }],
    "darklight-emitter": [{ chance: 1.5, max: 1, item: "green-gem" }],
  };

  const data = {
    items,
    monsters: ["converter", "darklight-construct", "darklight-emitter",
      "wandering-pillar"],
    registerLoot(monsters) {
      if (!monsters) return;
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
  window.GLOOM_PILLARS = data;

  (function registerGloomPillars() {
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
    // (mesmo padrão do bloodrotten.js) e aplica os drops que faltam.
    GAMEDATA.monsters = GAMEDATA.monsters || {};
    for (const slug of data.monsters)
      if (!GAMEDATA.monsters[slug] && typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug])
        GAMEDATA.monsters[slug] = MONSTERDATA[slug];
    data.registerLoot(GAMEDATA.monsters);

    GAMEDATA.hunts = GAMEDATA.hunts || {};
    GAMEDATA.hunts["gloom-pillars"] = {
      name: "Gloom Pillars",
      level: 600,
      minLevel: 600,
      cat: "hardcore",
      pack: 12,
      packMin: 8,
      packMax: 12,
      monsters: data.monsters.slice(),
      spawnWeights: { "converter": 25, "darklight-construct": 25,
        "darklight-emitter": 25, "wandering-pillar": 25 },
      color: "#3a3f4d",
      scene: "cave",
      otbm: "gloom_pillars",
      otbmFloor: 7,
      // Sem otbmBounds: o .otbm já é o recorte da área.
      otbmSpawn: { x: 1025, y: 1025, z: 7 },
      otbmMobBounds: { x: 1021, y: 1019, w: 9, h: 12, z: 7 },
      avgHp: 31575,
      avgExp: 21819,
      avgDamage: 1050,
      avgArmor: 114,
      avgGold: 400,
      respawn: 1,
    };
  })();

  return data;
})();
