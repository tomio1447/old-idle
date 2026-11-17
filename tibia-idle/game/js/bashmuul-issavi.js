/* bashmuul-issavi.js — HUNT Bashmuul - Issavi (nível 250+).
 * Mapa: game/maps/bashmuul_issavi.otbm (25×21, z=7 — único piso; bounds
 * 1009,1015–1033,1035).
 * Criaturas: Bashmu e Juvenile Bashmu (8 a 10 por onda, pedido do jogador)
 * — stats, skills, resistências e loot vêm de canarymonsters.json /
 * MONSTERDATA.
 * Coordenadas RME informadas:
 *   centerroom   {1023,1025,7}
 *   spawnradius  {1018,1022,7} → {1030,1029,7} (13×8)
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa, o que põe
 * os creature products no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* Creature products novos do loot — preços oficiais Yasir (TibiaWiki /
 * Creature Products by NPC Price). Ícones 32×32 em
 * game/assets/item/<slug>.png renderizados por
 * tools/import_bashmuul_assets.py (cids do canary-items.xml). */
const BASHMUUL_LOOT_ITEMS = {
  "bashmu-fang":    { n: "bashmu fang",    s: null, t: "loot", cid: 36820, w: 1.50, sell: 600, npcSell: 600 },
  "bashmu-tongue":  { n: "bashmu tongue",  s: null, t: "loot", cid: 36821, w: 2.50, sell: 400, npcSell: 400 },
  "bashmu-feather": { n: "bashmu feather", s: null, t: "loot", cid: 36823, w: 2.50, sell: 350, npcSell: 350 },
  /* spellweaver's robe já existe no catálogo mas sem cid — o ícone de
   * loot do Juvenile Bashmu precisa do cid para renderizar. Vende por
   * 12.000 na Lailene (Edron) — o merge de weapondata baixava para 6.000. */
  "spellweaver-s-robe": { cid: 10438, sell: 12000, npcSell: 12000 },
};

/* Correções de preço em itens já existentes do catálogo que aparecem no
 * loot: placeholders sell:1 sem comprador real. Poções de cura/espírito
 * não têm comprador NPC (TibiaWiki) → sell 0, o Sell All/autoseller pula.
 * Violet crystal shard vende por 1.500 nas joalherias (mesmo preço dos
 * demais crystal shards, TibiaWiki) — o catálogo tinha só sell:800. */
const BASHMUUL_LOOT_PRICE_FIXES = {
  "great-spirit-potion": 0,
  "ultimate-health-potion": 0,
  "violet-crystal-shard": 1500,
};

(function registerBashmuulIssavi() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in BASHMUUL_LOOT_ITEMS) {
    const def = BASHMUUL_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }
  for (const slug in BASHMUUL_LOOT_PRICE_FIXES) {
    if (!items[slug]) continue;
    items[slug].sell = BASHMUUL_LOOT_PRICE_FIXES[slug];
    items[slug].npcSell = BASHMUUL_LOOT_PRICE_FIXES[slug];
  }

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["bashmuul-issavi"] = {
    name: "Bashmuul - Issavi",
    level: 250,
    minLevel: 250,
    cat: "hard",
    pack: 10,
    packMin: 8,
    packMax: 10,
    monsters: ["bashmu", "juvenile-bashmu"],
    spawnWeights: { "bashmu": 50, "juvenile-bashmu": 50 },
    color: "#8a7040",
    scene: "desert",
    otbm: "bashmuul_issavi",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1023, y: 1025, z: 7 },
    otbmMobBounds: { x: 1018, y: 1022, w: 13, h: 8, z: 7 },
    avgHp: 7850,
    avgExp: 4750,
    avgDamage: 500,
    avgArmor: 73,
    avgGold: 300,
    respawn: 1,
  };
})();
