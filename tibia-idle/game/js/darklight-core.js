/* darklight-core.js — HUNT Darklight Core (BLOOD ROTTEN 600+).
 * Mapa: game/maps/dark_light.otbm (31×26, z=7 — único piso; bounds
 * 1009,1011–1039,1036).
 * Criaturas: Darklight Matter, Darklight Source, Darklight Striker e
 * Walking Pillar (8 a 12 por onda) — stats vêm de canarymonsters.json /
 * MONSTERDATA.
 * Coordenadas RME informadas:
 *   centerroom {1024,1025,7}
 *   mobbounds  {1017,1018,7} → {1029,1030,7}
 *
 * Loot:
 *   - 7 produtos de criatura/itens novos com cids reais do client 15.x e
 *     preços oficiais de NPC (TibiaWiki). Unstable e Yellow Darklight
 *     Matter são itens de quest sem comprador NPC → sell 0, igual aos
 *     ectoplasms/lichen gobbler.
 *   - Drops "muito raro" ausentes do dump Canary (patch oficial):
 *     +Crystalline Armor no Darklight Source, +White Gem no Darklight
 *     Striker e +Dwarven Ring no Walking Pillar — mesma banda de chance
 *     dos demais very-rare (~0.5%).
 *
 * `data.registerLoot(monsters)` aplica a mesma correção no catálogo do
 * servidor (authoritative_engine chama com MONSTERS — padrão
 * bloodrotten.js/registerBagLoot). */
"use strict";

const DARKLIGHT_CORE = (() => {
  const items = {
    "unstable-darklight-matter": { n: "unstable darklight matter", s: null, t: "loot", cid: 43779, w: 1.00, sell: 0, npcSell: 0 },
    "yellow-darklight-matter":   { n: "yellow darklight matter", s: null, t: "loot", cid: 43780, w: 1.00, sell: 0, npcSell: 0 },
    "dark-obsidian-splinter":    { n: "dark obsidian splinter", s: null, t: "loot", cid: 43850, w: 1.00, sell: 4400, npcSell: 4400 },
    "darklight-matter":          { n: "darklight matter", s: null, t: "loot", cid: 43851, w: 1.00, sell: 5500, npcSell: 5500 },
    "darklight-basalt-chunk":    { n: "darklight basalt chunk", s: null, t: "loot", cid: 43852, w: 1.00, sell: 3800, npcSell: 3800 },
    "darklight-core":            { n: "darklight core", s: null, t: "loot", cid: 43853, w: 1.00, sell: 4100, npcSell: 4100 },
    "magma-clump":               { n: "magma clump", s: null, t: "loot", cid: 16130, w: 3.10, sell: 570, npcSell: 570 },
  };

  /* Apenas appends — as tabelas Canary dos quatro monstros já cobrem o
   * restante da lista oficial; faltam só os drops muito raros. */
  const append = {
    "darklight-source": [{ chance: 0.5, max: 1, item: "crystalline-armor" }],
    "darklight-striker": [{ chance: 0.5, max: 1, item: "white-gem" }],
    "walking-pillar": [{ chance: 0.5, max: 1, item: "dwarven-ring" }],
  };

  const data = {
    items,
    monsters: ["darklight-matter", "darklight-source", "darklight-striker",
      "walking-pillar"],
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
  window.DARKLIGHT_CORE = data;

  (function registerDarklightCore() {
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
    GAMEDATA.hunts["darklight-core"] = {
      name: "Darklight Core",
      level: 600,
      minLevel: 600,
      cat: "hardcore",
      pack: 12,
      packMin: 8,
      packMax: 12,
      monsters: data.monsters.slice(),
      spawnWeights: { "darklight-matter": 25, "darklight-source": 25,
        "darklight-striker": 25, "walking-pillar": 25 },
      color: "#3f2d52",
      scene: "cave",
      otbm: "dark_light",
      otbmFloor: 7,
      // Sem otbmBounds: o .otbm já é o recorte da área.
      otbmSpawn: { x: 1024, y: 1025, z: 7 },
      otbmMobBounds: { x: 1017, y: 1018, w: 13, h: 13, z: 7 },
      avgHp: 32350,
      avgExp: 22804,
      avgDamage: 1225,
      avgArmor: 111,
      avgGold: 400,
      respawn: 1,
    };
  })();

  return data;
})();
