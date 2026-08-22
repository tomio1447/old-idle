/* faceless-bane.js — Boss Faceless Bane (Buried Cathedral, nível 250+).
 *
 * Boss simples sem mecânica própria: usa o monstro base do Canary
 * (monsterdata.js) para stats, skills, resistências e loot.
 * Acesso liberado pela missão Buried Cathedral (250 criaturas).
 * Cooldown oficial: 16h (aplicado quando BOSS_COOLDOWNS_ENABLED for ligado).
 */
"use strict";

const FACELESS_BANE_COOLDOWN_MS = 16 * 60 * 60 * 1000;

const FACELESS_BANE_ROOM = {
  otbm: "facelessroom",
  name: "Faceless Bane Room",
  center: { x: 1072, y: 1002, z: 7 },
  spawn: { x: 1072, y: 1007, z: 7 },   // playerspawn
  boss:  { x: 1072, y: 998,  z: 7 },   // bossspawn
};

const FACELESS_BANE_STATS = {
  name: "Faceless Bane",
  hp: 35000,
  exp: 20000,
  damage: 575,
  armor: 10,
  defense: 5,
};

/* Itens do loot do Canary que faltavam no catálogo (usados no boss modal
 * e no Sell All online). Sem NPC comprador no Canary → sell 0. */
const FACELESS_LOOT_ITEMS = {
  "book-backpack":          { n: "book backpack", s: null, t: "loot", cid: 28571, w: 18.00, sell: 0, npcSell: 0 },
  "ectoplasmic-shield":     { n: "ectoplasmic shield", s: null, t: "loot", cid: 29430, w: 58.00, sell: 0, npcSell: 0 },
  "enchanted-pendulet":     { n: "enchanted pendulet", s: null, t: "loot", cid: 30345, w: 6.50, sell: 0, npcSell: 0 },
  "lightning-pendant":      { n: "lightning pendant", s: null, t: "loot", cid: 816, w: 5.00, sell: 0, npcSell: 0 },
  "red-crystal-fragment":   { n: "red crystal fragment", s: null, t: "loot", cid: 16126, w: 0.15, sell: 800, npcSell: 800 },
  "spirit-guide":           { n: "spirit guide", s: null, t: "loot", cid: 29431, w: 18.00, sell: 0, npcSell: 0 },
  // hexagonal-ruby já vem do buried-cathedral.js; mantém o merge se ausente.
  "hexagonal-ruby":         { n: "hexagonal ruby", s: null, t: "loot", cid: 30180, w: 1.25, sell: 30000, npcSell: 30000 },
};

(function registerFacelessBane() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in FACELESS_LOOT_ITEMS) {
    const def = FACELESS_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["faceless-bane-room"] = {
    name: FACELESS_BANE_ROOM.name,
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: ["faceless-bane"],
    color: "#4a3f66",
    scene: "crypt",
    otbm: FACELESS_BANE_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: FACELESS_BANE_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, FACELESS_BANE_ROOM.boss),
    avgHp: FACELESS_BANE_STATS.hp,
    avgExp: FACELESS_BANE_STATS.exp,
    avgDamage: FACELESS_BANE_STATS.damage,
    avgArmor: FACELESS_BANE_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  BOSS_DEFS["faceless-bane"] = {
    id: "faceless-bane",
    name: FACELESS_BANE_STATS.name,
    title: "Boss Buried Cathedral",
    hunt: "faceless-bane-room",
    baseMonster: "faceless-bane",
    sprite: "faceless-bane",
    hp: FACELESS_BANE_STATS.hp,
    exp: FACELESS_BANE_STATS.exp,
    damage: FACELESS_BANE_STATS.damage,
    armor: FACELESS_BANE_STATS.armor,
    defense: FACELESS_BANE_STATS.defense,
    speed: 0.00007,
    requirement: {
      level: 250,
      mission: "buried-cathedral",
      access: "faceless-bane",
      text: "Requer nível 250+ e completar a missão Buried Cathedral",
    },
    cooldown: FACELESS_BANE_COOLDOWN_MS,
    // Loot integral do monstro base no Canary.
  };
})();
