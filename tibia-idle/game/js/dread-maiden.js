/*
 * dread-maiden.js — The Dread Maiden, primeiro boss da categoria
 * FEAST OF SOULS.
 *
 * Boss simples, sem mecânica: HP/EXP/dano/armor/skills vêm diretos do
 * Canary (monsterdata.js / canarymonsters.json) — hits de death, dread
 * rcircle e heals do monstro base, nada de QTE nem fases. Este patch só:
 *
 *   (1) garante os itens do loot oficial que faltavam no recorte antigo;
 *   (2) registra a hunt técnica invisível da bossroom
 *       (game/maps/thedreadmaidenroom.otbm, publicado a partir de
 *       beta-maps/thedreadmaidenroom.otbm);
 *   (3) adiciona o boss ao BOSS_DEFS com o cooldown oficial de 16h.
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

const DREAD_MAIDEN_ID = "the-dread-maiden";
const DREAD_MAIDEN_COOLDOWN_MS = 16 * 60 * 60 * 1000; // 16 horas (Canary)

(function registerDreadMaiden() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  /* Loot oficial do Canary (ids do items.xml 15.x). Preços de venda =
   * TibiaWiki (NPC que compra); itens sem comprador (quest/addon) ficam
   * com sell 0 e o Sell All / autoseller pulam, como no restante do jogo.
   * Entradas que já existem no jogo (white-gem vem do soulwar.js com
   * sell 0; giant-amethyst do gamedata com sell 1) têm o preço oficial
   * aplicado por cima, igual ao padrão do yasir-prices.js. */
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
  // Potions ultimate-spirit/supreme-health já são injetadas por
  // scarlett-boss.js (sell 1, mesmo valor usado hoje no jogo): nada a fazer.

  /* Hunt técnica invisível: fornece arena/colisão para newBossCombat.
   * Coordenadas absolutas do RME/Canary (z 7); applyHuntOtbmZones converte
   * para o recorte local do OTBM. Centro do mapa = (1051,1015). */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["the-dread-maiden-room"] = {
    name: "The Dread Maiden's Room",
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: [DREAD_MAIDEN_ID],
    color: "#8a5a9a",
    scene: "palace",
    otbm: "thedreadmaidenroom",
    otbmFloor: 7,
    otbmSpawn: { x: 1046, y: 1015, z: 7 },       // spawn do jogador
    otbmMobBounds: { x: 1056, y: 1015, w: 1, h: 1, z: 7 }, // spawn do boss
    avgHp: 300000,
    avgExp: 72000,
    avgDamage: 600,
    avgArmor: 170,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats DIRETOS do Canary (newBossCombat usa hp/exp/damage/armor/defense
   * quando presentes) — skills/resist/loot vêm do monstro base no
   * monsterdata. Sem mechanic própria: boss de hits simples. */
  BOSS_DEFS[DREAD_MAIDEN_ID] = {
    id: DREAD_MAIDEN_ID,
    name: "The Dread Maiden",
    title: "Boss Feast of Souls",
    hunt: "the-dread-maiden-room",
    baseMonster: DREAD_MAIDEN_ID,
    sprite: DREAD_MAIDEN_ID,
    hp: 300000,
    exp: 72000,
    damage: 600,
    armor: 170,
    defense: 170,
    speed: 0.00007,
    requirement: { level: 250, text: "Requer nível 250+ (Feast of Souls)" },
    cooldown: DREAD_MAIDEN_COOLDOWN_MS,
    // Sem lista própria de loot: bossLootReal usa o loot integral do
    // MONSTERDATA (Canary), igual à Timira.
  };
})();
