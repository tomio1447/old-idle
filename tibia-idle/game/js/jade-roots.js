/* jade-roots.js — HUNT Jade Roots (nível 600+, BLOOD ROTTEN).
 * Mapa: game/maps/jade_roots.otbm (33×23, z=7 — único piso; bounds
 * 1011,1017–1043,1039).
 * Criaturas: Bloated Man-Maggot, Mycobiontic Beetle e Sopping Corpus
 * (8 a 12 por onda) — stats e loot vêm de canarymonsters.json / MONSTERDATA.
 * Coordenadas RME informadas:
 *   centerroom {1027,1028,7} — célula ocupada por objeto 2×2 (16405);
 *     spawn validado na caminhável mais próxima, {1027,1027,7}.
 *   mobbounds  {1020,1023,7} → {1034,1032,7}
 */
"use strict";

(function registerJadeRoots() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items;

  /* Creature products de Jaded Roots vendem ao Yasir (TibiaWiki). O
   * Organic Acid é item de quest usável sem comprador NPC — sell=0, não
   * inventar valor. */
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

  const jadedLootItems = {
    "organic-acid":         { n: "organic acid", cid: 43778, w: 1, sell: 0 },
    "rotten-vermin-ichor":  { n: "rotten vermin ichor", cid: 43847, w: 1, sell: 4500 },
    "rotten-roots":         { n: "rotten roots", cid: 43849, w: 1, sell: 3800 },
    "bloated-maggot":       { n: "bloated maggot", cid: 43856, w: 1, sell: 5200 },
  };
  Object.keys(jadedLootItems).forEach((slug) => registerLootItem(slug, jadedLootItems[slug]));

  /* Preços NPC oficiais (TibiaWiki) para loot já registrado sem sell.
   * Crimson Sword: só é vendida POR NPCs (610 gp) — sem comprador, sell=0. */
  const jadedPriceFixes = {
    "terra-rod":     { sell: 2000 },  // Rashid
    "glacier-mask":  { sell: 2500 },  // Rashid
    "buckle":        { sell: 7000 },  // Rashid
    "crimson-sword": { sell: 0 },     // sem comprador NPC
  };
  Object.keys(jadedPriceFixes).forEach((slug) => {
    registerLootItem(slug, jadedPriceFixes[slug]);
  });

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["jade-roots"] = {
    name: "Jade Roots",
    level: 600,
    minLevel: 600,
    cat: "hardcore",
    pack: 12,
    packMin: 8,
    packMax: 12,
    monsters: ["bloated-man-maggot", "mycobiontic-beetle", "sopping-corpus"],
    spawnWeights: { "bloated-man-maggot": 25, "mycobiontic-beetle": 50, "sopping-corpus": 25 },
    color: "#4a5c2e",
    scene: "cave",
    otbm: "jade_roots",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1027, y: 1027, z: 7 },
    otbmMobBounds: { x: 1020, y: 1023, w: 15, h: 10, z: 7 },
    // Fungo/musgo caminhável de Jaded Roots (42997 não é piso andável).
    walkFloors: [42973, 42974, 42975, 42976, 42977, 42978, 42979, 42980,
      42981, 42982, 42983],
    avgHp: 31800,
    avgExp: 21700,
    avgDamage: 1560,
    avgArmor: 111,
    avgGold: 400,
    respawn: 1,
  };
})();
