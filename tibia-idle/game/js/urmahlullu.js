/* urmahlullu.js — Boss Urmahlullu the Weakened (Kilmaresh, nível 150+).
 *
 * BOSS SIMPLES (sem transformações): o jogador pediu apenas o 1º estágio
 * da luta oficial — sem Urmahlullu the Tamed/Immaculate, sem Wildness e
 * sem Wisdom of Urmahlullu. Matar o Weakened com 500.000 HP já entrega o
 * loot completo do monstro base (MONSTERDATA, tabela oficial do Canary).
 *
 * Stats: hp 500.000 a pedido do jogador (Canary/Wiki: 100–150k); o resto
 * (exp 55000, dano 1100, armor/defense 84, skills de fogo e o golpe
 * "urmahlulluring") vem direto do monsterdata importado do Canary.
 *
 * Coordenadas absolutas do RME:
 *   centerroom  {1024,1026,7}
 *   bossspawn   {1024,1022,7}
 *   playerspawn {1024,1029,7}
 * Sala: game/maps/urmahlullu_room.otbm (publicada a partir de
 * beta-maps/bossesroom/"Urmahlullu the Weakened.otbm").
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa
 * (BOSS_DEFS não existe no vm), o que põe os itens do loot no catálogo
 * ITEMS para o Sell All online precificar/pular corretamente.
 */
"use strict";

/* Cooldown oficial: 20h (tibia.gg) — aplicado enquanto
 * BOSS_COOLDOWNS_ENABLED estiver ligado. */
const URMAHLULLU_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const URMAHLULLU_ROOM = {
  otbm: "urmahlullu_room",
  name: "Urmahlullu the Weakened Room",
  center: { x: 1024, y: 1026, z: 7 },
  spawn: { x: 1024, y: 1029, z: 7 },   // playerspawn
  boss:  { x: 1024, y: 1022, z: 7 },   // bossspawn
};

const URMAHLULLU_STATS = {
  name: "Urmahlullu the Weakened",
  hp: 500000,
  exp: 55000,
  damage: 1100,
  armor: 84,
  defense: 84,
};

/* Itens do loot oficial que faltavam no catálogo do jogo (ícones em
 * game/assets/item/<slug>.png extraídos por import_urmahlullu_assets.py).
 * Preços oficiais: creature products são comprados por Yasir
 * (TibiaWiki); sun medal / sunray emblem / golden bijou são partes da
 * Regalia of Suon — nenhum NPC compra (quest items), então sell 0 e o
 * Sell All / autoseller pulam, padrão do jogo. Também registramos os
 * demais drops sem catálogo próprio: tagralt blade, winged boots,
 * enchanted theurgic amulet e rainbow necklace não têm comprador NPC
 * (TibiaWiki: "No NPC buys this item") → sell 0, idem para energy bar,
 * flash arrow (só vendida por NPCs, ninguém a compra) e o quest item
 * ring of secret thoughts (Kilmaresh Quest). */
const URMAHLULLU_LOOT_ITEMS = {
  "urmahlullu-s-mane": { n: "Urmahlullu's mane", s: null, t: "loot", cid: 31623, w: 0.76, sell: 490000, npcSell: 490000 },
  "urmahlullu-s-paw":  { n: "urmahlullu's paw",  s: null, t: "loot", cid: 31624, w: 0.76, sell: 245000, npcSell: 245000 },
  "urmahlullu-s-tail": { n: "Urmahlullu's tail", s: null, t: "loot", cid: 31622, w: 0.76, sell: 210000, npcSell: 210000 },
  "sun-medal":         { n: "sun medal",         s: null, t: "loot", cid: 31573, w: 8.50, sell: 0, npcSell: 0 },
  "sunray-emblem":     { n: "sunray emblem",     s: null, t: "loot", cid: 31574, w: 8.50, sell: 0, npcSell: 0 },
  "golden-bijou":      { n: "golden bijou",      s: null, t: "loot", cid: 31575, w: 8.50, sell: 0, npcSell: 0 },
  "energy-bar":        { n: "energy bar",        s: null, t: "loot", cid: 23535, w: 7.50, sell: 0, npcSell: 0 },
  "flash-arrow":       { n: "flash arrow",       s: "ammo", t: "ammo", atk: 14, el: "energy", elDmg: 14, w: 0.7, cid: 761, lvl: 20, sell: 0, npcSell: 0 },
  "tagralt-blade":     { n: "tagralt blade",     s: "weapon", t: "sword", atk: 7, el: "earth", elDmg: 49, def: 32, th: true, sword: 3, imbSlots: 2, w: 81, cid: 31614, lvl: 250, vocs: ["elite knight", "knight"], sell: 0, npcSell: 0 },
  "ring-of-secret-thoughts": { n: "ring of secret thoughts", s: "ring", t: "accessory", w: 0.9, cid: 31263, sell: 0, npcSell: 0 },
  "winged-boots":      { n: "winged boots",      s: "boots", t: "armor", arm: 2, spd: 15, dist: 1, res: { earth: 7 }, imbSlots: 1, w: 12, cid: 31617, lvl: 220, vocs: ["paladin", "royal paladin"], sell: 0, npcSell: 0 },
  "enchanted-theurgic-amulet": { n: "enchanted theurgic amulet", s: "amulet", t: "armor", arm: 2, ml: 3, mag: 3, res: { physical: 3, earth: 14 }, w: 5, cid: 30402, lvl: 220, vocs: ["druid", "elder druid", "master sorcerer", "sorcerer"], sell: 0, npcSell: 0 },
  "rainbow-necklace":  { n: "rainbow necklace",  s: "amulet", t: "armor", arm: 2, res: { physical: 3, fire: 6, ice: -5 }, w: 4.9, cid: 30323, lvl: 220, sell: 0, npcSell: 0 },
};

/* Correções de preço em itens já existentes do catálogo que aparecem no
 * loot do boss: placeholders sell:1/0 sem comprador real ou com valor
 * errado. Fontes oficiais (TibiaWiki): Rashid compra magma amulet 1.500,
 * magma monocle 2.500 e lightning pendant 1.500; Fiona compra berserk /
 * bullseye / mastermind potion por 500 cada; as joalherias (Hanna, Iwan,
 * Gail, Chantalle...) compram gold ingot 5.000, giant sapphire 50.000,
 * giant ruby 70.000 e giant emerald 90.000. Silver token é moeda do
 * Cledwyn e royal star não tem comprador NPC → sell 0. */
const URMAHLULLU_LOOT_PRICE_FIXES = {
  "lightning-pendant": 1500,
  "magma-amulet": 1500,
  "magma-monocle": 2500,
  "berserk-potion": 500,
  "bullseye-potion": 500,
  "mastermind-potion": 500,
  "gold-ingot": 5000,
  "giant-sapphire": 50000,
  "giant-ruby": 70000,
  "giant-emerald": 90000,
  "silver-token": 0,
  "royal-star": 0,
};

(function registerUrmahlullu() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in URMAHLULLU_LOOT_ITEMS) {
    const def = URMAHLULLU_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }
  for (const slug in URMAHLULLU_LOOT_PRICE_FIXES) {
    if (!items[slug]) continue;
    items[slug].sell = URMAHLULLU_LOOT_PRICE_FIXES[slug];
    items[slug].npcSell = URMAHLULLU_LOOT_PRICE_FIXES[slug];
  }

  /* Hunt técnica invisível: arena da bossroom para o newBossCombat ter
   * colisão/spawn e o boss nascer na célula. */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["urmahlullu-the-weakened-room"] = {
    name: URMAHLULLU_ROOM.name,
    hidden: true,
    level: 150,
    minLevel: 150,
    monsters: ["urmahlullu-the-weakened"],
    color: "#8a4a2a",
    scene: "palace",
    otbm: URMAHLULLU_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: URMAHLULLU_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, URMAHLULLU_ROOM.boss),
    avgHp: URMAHLULLU_STATS.hp,
    avgExp: URMAHLULLU_STATS.exp,
    avgDamage: URMAHLULLU_STATS.damage,
    avgArmor: URMAHLULLU_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats diretos (newBossCombat usa hp/exp/damage/armor/defense quando
   * presentes) — skills/resist/loot vêm do monstro base no monsterdata.
   * Sem lista própria de loot: bossLootReal usa a tabela oficial do
   * MONSTERDATA (Canary), igual aos bosses do Feast/Deeplings. */
  BOSS_DEFS["urmahlullu-the-weakened"] = {
    id: "urmahlullu-the-weakened",
    name: URMAHLULLU_STATS.name,
    title: "Boss Kilmaresh",
    hunt: "urmahlullu-the-weakened-room",
    baseMonster: "urmahlullu-the-weakened",
    sprite: "urmahlullu-the-weakened",
    hp: URMAHLULLU_STATS.hp,
    exp: URMAHLULLU_STATS.exp,
    damage: URMAHLULLU_STATS.damage,
    armor: URMAHLULLU_STATS.armor,
    defense: URMAHLULLU_STATS.defense,
    speed: 0.00007,
    requirement: {
      level: 150,
      text: "Requer nível 150+",
    },
    cooldown: URMAHLULLU_COOLDOWN_MS,
  };
})();
