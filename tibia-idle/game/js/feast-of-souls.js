/*
 * feast-of-souls.js — categoria FEAST OF SOULS (nível 250+).
 *
 * Bosses simples, sem mecânica: HP/EXP/dano/armor/skills vêm diretos do
 * Canary (monsterdata.js / canarymonsters.json) — nada de QTE nem fases.
 * Este patch só:
 *
 *   (1) garante os itens do loot oficial que faltavam no recorte antigo;
 *   (2) registra as hunts técnicas invisíveis das bossrooms
 *       (game/maps/<room>.otbm, publicados a partir de beta-maps/);
 *   (3) adiciona os bosses ao BOSS_DEFS com o cooldown oficial de 16h.
 *
 * Cooldown: o valor de 16h fica registrado no def (cooldownMs), mas a
 * APLICAÇÃO continua dependendo do switch global BOSS_COOLDOWNS_ENABLED
 * (game.js), hoje desligado — mesmo comportamento dos outros bosses.
 * Nível: seção FEAST OF SOULS no modal = 250+, requisito no def para
 * quando BOSS_REQUIREMENTS_ENABLED for religado.
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (BOSS_DEFS não existe no vm), o que
 * põe os preços do loot no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* 16 horas (Canary) — todos os bosses da categoria. */
const FEAST_OF_SOULS_COOLDOWN_MS = 16 * 60 * 60 * 1000;

/* Salas: arquivo OTBM publicado + coordenadas absolutas do RME/Canary
 * (applyHuntOtbmZones converte para o recorte local no runtime). */
const FEAST_OF_SOULS_ROOMS = {
  "the-dread-maiden": {
    otbm: "thedreadmaidenroom",
    name: "The Dread Maiden's Room",
    spawn: { x: 1046, y: 1015, z: 7 },
    boss: { x: 1056, y: 1015, z: 7 },
  },
  "the-fear-feaster": {
    otbm: "thefearfaster",
    name: "The Fear Feaster's Room",
    spawn: { x: 1045, y: 1013, z: 7 },
    boss: { x: 1053, y: 1013, z: 7 },
  },
  "the-unwelcome": {
    otbm: "theunwelcomeroom",
    name: "The Unwelcome's Room",
    spawn: { x: 1044, y: 1011, z: 7 },
    boss: { x: 1054, y: 1011, z: 7 },
  },
};

(function registerFeastOfSouls() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  /* Loot oficial do Canary (ids do items.xml 15.x). Preços de venda =
   * TibiaWiki (NPC que compra); itens sem comprador (quest/addon) ficam
   * com sell 0 e o Sell All / autoseller pulam, como no restante do jogo.
   * Entradas que já existem no jogo (white-gem vem do soulwar.js com
   * sell 0; giant-amethyst do gamedata com sell 1) têm o preço oficial
   * aplicado por cima, igual ao padrão do yasir-prices.js. Equipamentos
   * reais (ghost-chestplate, fabulous-legs, soulful-legs, spooky-hood,
   * pair-of-nightmare-boots) já vêm do WEAPONDATA — nunca são rebaixados
   * a loot aqui. */
  const lootItems = {
    "diamond":            { n: "diamond", s: null, t: "loot", cid: 32770, sell: 15000, npcSell: 15000, w: 0.1 },
    "moonstone":          { n: "moonstone", s: null, t: "loot", cid: 32771, sell: 13000, npcSell: 13000, w: 0.1 },
    "white-gem":          { n: "white gem", s: null, t: "loot", cid: 32769, sell: 12000, npcSell: 12000, w: 0.3 },
    "silver-hand-mirror": { n: "silver hand mirror", s: null, t: "loot", cid: 32772, sell: 10000, npcSell: 10000, w: 6.5 },
    "ivory-comb":         { n: "ivory comb", s: null, t: "loot", cid: 32773, sell: 8000, npcSell: 8000, w: 6.5 },
    "amber":              { n: "amber", s: null, t: "loot", cid: 32626, sell: 20000, npcSell: 20000, w: 1 },
    "death-toll":         { n: "death toll", s: null, t: "loot", cid: 32703, sell: 0, npcSell: 0, w: 0.04 },
    "angel-figurine":     { n: "angel figurine", s: null, t: "loot", cid: 32589, sell: 36000, npcSell: 36000, w: 6.5 },
    "cursed-bone":        { n: "cursed bone", s: null, t: "loot", cid: 32774, sell: 6000, npcSell: 6000, w: 6.5 },
    "dark-bell":          { n: "dark bell", s: null, t: "loot", cid: 32596, sell: 250, npcSell: 250, w: 2.2 },
    "jagged-sickle":      { n: "jagged sickle", s: null, t: "loot", cid: 32595, sell: 150000, npcSell: 150000, w: 0.8 },
    "soulforged-lantern": { n: "soulforged lantern", s: null, t: "loot", cid: 32591, sell: 0, npcSell: 0, w: 30 },
    "ghost-claw":         { n: "ghost claw", s: null, t: "loot", cid: 32631, sell: 0, npcSell: 0, w: 7.3 },
    "giant-amethyst":     { n: "giant amethyst", s: null, t: "loot", cid: 32622, sell: 60000, npcSell: 60000, w: 1.7 },
    // Fear Feaster / Unwelcome (compartilham a base do loot da categoria)
    "grimace":               { n: "grimace", s: null, t: "loot", cid: 32593, sell: 120000, npcSell: 120000, w: 0.6 },
    "amber-with-a-dragonfly":{ n: "amber with a dragonfly", s: null, t: "loot", cid: 32625, sell: 56000, npcSell: 56000, w: 1 },
    "bloody-tears":          { n: "bloody tears", s: null, t: "loot", cid: 32594, sell: 70000, npcSell: 70000, w: 0.2 },
  };
  for (const slug in lootItems) {
    const def = lootItems[slug];
    if (!items[slug]) items[slug] = def;
    else {
      // preço oficial por cima de entradas antigas (white-gem, giant-amethyst)
      items[slug].sell = def.sell;
      items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  /* Hunts técnicas invisíveis: fornecem arena/colisão para newBossCombat. */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  for (const id in FEAST_OF_SOULS_ROOMS) {
    const room = FEAST_OF_SOULS_ROOMS[id];
    GAMEDATA.hunts[id + "-room"] = {
      name: room.name,
      hidden: true,
      level: 250,
      minLevel: 250,
      monsters: [id],
      color: "#8a5a9a",
      scene: "palace",
      otbm: room.otbm,
      otbmFloor: 7,
      otbmSpawn: room.spawn,                          // spawn do jogador
      otbmMobBounds: Object.assign({ w: 1, h: 1 }, room.boss), // spawn do boss
      avgHp: 300000,
      avgExp: 30000,
      avgDamage: 1050,
      avgArmor: 160,
      avgGold: 100,
      respawn: 1,
      pack: 1,
      cat: "boss-room",
    };
  }

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats DIRETOS do Canary (newBossCombat usa hp/exp/damage/armor/defense
   * quando presentes) — skills/resist/loot vêm do monstro base no
   * monsterdata. Sem mechanic própria: bosses de hits simples. */
  BOSS_DEFS["the-dread-maiden"] = {
    id: "the-dread-maiden",
    name: "The Dread Maiden",
    title: "Boss Feast of Souls",
    hunt: "the-dread-maiden-room",
    baseMonster: "the-dread-maiden",
    sprite: "the-dread-maiden",
    hp: 300000,
    exp: 72000,
    damage: 600,
    armor: 170,
    defense: 170,
    speed: 0.00007,
    requirement: { level: 250, text: "Requer nível 250+ (Feast of Souls)" },
    cooldown: FEAST_OF_SOULS_COOLDOWN_MS,
    // Sem lista própria de loot: bossLootReal usa o loot integral do
    // MONSTERDATA (Canary), igual à Timira.
  };

  BOSS_DEFS["the-fear-feaster"] = {
    id: "the-fear-feaster",
    name: "The Fear Feaster",
    title: "Boss Feast of Souls",
    hunt: "the-fear-feaster-room",
    baseMonster: "the-fear-feaster",
    sprite: "the-fear-feaster",
    hp: 300000,
    exp: 30000,
    damage: 1050,
    armor: 160,
    defense: 170,
    speed: 0.00007,
    requirement: { level: 250, text: "Requer nível 250+ (Feast of Souls)" },
    cooldown: FEAST_OF_SOULS_COOLDOWN_MS,
  };

  BOSS_DEFS["the-unwelcome"] = {
    id: "the-unwelcome",
    name: "The Unwelcome",
    title: "Boss Feast of Souls",
    hunt: "the-unwelcome-room",
    baseMonster: "the-unwelcome",
    sprite: "the-unwelcome",
    hp: 300000,
    exp: 30000,
    damage: 1050,
    armor: 10,
    defense: 15,
    speed: 0.00007,
    requirement: { level: 250, text: "Requer nível 250+ (Feast of Souls)" },
    cooldown: FEAST_OF_SOULS_COOLDOWN_MS,
  };
})();
