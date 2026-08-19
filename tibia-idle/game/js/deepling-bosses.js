/* deepling-bosses.js — categoria DEEPLING WORLD (nível 150+).
 *
 * 4 bosses do Deeplings World Change, na MESMA sala (deeplinsroom.otbm):
 * Jaul, Obujos, Tanjis e Brokul. Composições DIRETAS do Canary
 * (monsterdata.js / canarymonsters.json): hp/exp/dano/armor/defense,
 * skills, resistências e loot oficial de cada chefe — sem mecânica
 * própria (bosses de hits simples), como a categoria Feast of Souls.
 *
 * Este patch só:
 *   (1) garante os itens de loot que faltavam no catálogo (broccoli e
 *       the true book of death — vendáveis? NÃO: nenhum NPC compra, então
 *       sell 0 e o Sell All / autoseller pulam, padrão do jogo);
 *   (2) registra as hunts técnicas invisíveis da bossroom compartilhada
 *       (game/maps/deeplinsroom.otbm, publicada a partir de beta-maps/);
 *   (3) adiciona os bosses ao BOSS_DEFS com o cooldown oficial de 16h.
 *
 * Cooldown: valor de 16h registrado no def, mas a APLICAÇÃO continua
 * dependendo do switch global BOSS_COOLDOWNS_ENABLED (game.js), hoje
 * desligado — mesmo comportamento dos outros bosses.
 * Nível: seção DEEPLING WORLD no modal = 150+, requisito no def para
 * quando BOSS_REQUIREMENTS_ENABLED for religado.
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (BOSS_DEFS não existe no vm), o que
 * põe os itens do loot no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* 16 horas (Canary) — todos os bosses da categoria. */
const DEEPLING_BOSS_COOLDOWN_MS = 16 * 60 * 60 * 1000;

/* Sala única dos 4 chefes (Deeplings World Change). Coordenadas absolutas
 * do RME/Canary — applyHuntOtbmZones converte para o recorte local. */
const DEEPLING_ROOM = {
  otbm: "deeplinsroom",
  name: "Deepling World",
  center: { x: 1047, y: 1003, z: 7 },
  spawn: { x: 1046, y: 1008, z: 7 },   // playerspawn
  boss: { x: 1047, y: 998, z: 7 },     // bossspawn
};

/* Composições dos 4 chefes — diretas do Canary (monsterdata importado). */
const DEEPLING_BOSSES = {
  "jaul":    { name: "Jaul",    hp: 90000, exp: 30000, damage: 2000, armor: 40, defense: 40 },
  "obujos":  { name: "Obujos",  hp: 35000, exp: 20000, damage: 1200, armor: 40, defense: 40 },
  "tanjis":  { name: "Tanjis",  hp: 30000, exp: 15000, damage: 600,  armor: 40, defense: 40 },
  "brokul":  { name: "Brokul",  hp: 50000, exp: 23000, damage: 500,  armor: 86, defense: 60 },
};

(function registerDeeplingBosses() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  /* Itens de loot do Canary que faltavam no catálogo. TibiaWiki:
   * broccoli (3.00 oz) e the true book of death (13.00 oz) — nenhum NPC
   * compra, então sell 0 (Sell All/autoseller pulam, padrão do jogo). */
  const lootItems = {
    "broccoli":           { n: "broccoli", s: "misc", t: "loot", sell: 0, npcSell: 0, w: 3 },
    "true-book-of-death": { n: "the true book of death", s: "misc", t: "loot", sell: 0, npcSell: 0, w: 13 },
  };
  for (const slug in lootItems) {
    const def = lootItems[slug];
    if (!items[slug]) items[slug] = def;
    else {
      items[slug].sell = def.sell;
      items[slug].npcSell = def.npcSell;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  /* Hunts técnicas invisíveis: uma por chefe (mesma arena compartilhada),
   * para o newBossCombat ter colisão/spawn e o boss nascer na célula. */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  for (const id in DEEPLING_BOSSES) {
    const stats = DEEPLING_BOSSES[id];
    GAMEDATA.hunts[id + "-room"] = {
      name: DEEPLING_ROOM.name + " — " + stats.name,
      hidden: true,
      level: 150,
      minLevel: 150,
      monsters: [id],
      color: "#3f6a9a",
      scene: "palace",
      otbm: DEEPLING_ROOM.otbm,
      otbmFloor: 7,
      otbmSpawn: DEEPLING_ROOM.spawn,
      otbmMobBounds: Object.assign({ w: 1, h: 1 }, DEEPLING_ROOM.boss),
      avgHp: stats.hp,
      avgExp: stats.exp,
      avgDamage: stats.damage,
      avgArmor: stats.armor,
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
  for (const id in DEEPLING_BOSSES) {
    const stats = DEEPLING_BOSSES[id];
    BOSS_DEFS[id] = {
      id: id,
      name: stats.name,
      title: "Boss Deeplings World Change",
      hunt: id + "-room",
      baseMonster: id,
      sprite: id,
      hp: stats.hp,
      exp: stats.exp,
      damage: stats.damage,
      armor: stats.armor,
      defense: stats.defense,
      speed: 0.00007,
      requirement: { level: 150, text: "Requer nível 150+ (Deeplings World Change)" },
      cooldown: DEEPLING_BOSS_COOLDOWN_MS,
      // Sem lista própria de loot: bossLootReal usa o loot integral do
      // MONSTERDATA (Canary), igual à Timira e aos bosses do Feast.
    };
  }
})();
