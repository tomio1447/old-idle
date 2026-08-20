/* deathlings-sunken-temple.js — HUNT DEATHLINGS - SUNKEN TEMPLE
 * (categoria 250+, Quirefang/Oramond costa leste).
 *
 * Duas criaturas diretas do Canary (data-otservbr-global/monster/deeplings):
 * Deathling Spellsinger e Deathling Scout. Combate, loot, HP/XP/dano/armor,
 * poisons e spells vêm de canarymonsters.json / MONSTERDATA — esta ficha só
 * registra a hunt e os itens de loot que faltavam no catálogo (TibiaWiki /
 * items.xml).
 *
 * Coordenadas absolutas do RME:
 *   centeroom  {1061,1001,7}
 *   playerspawn {1069,1003,7}
 *   monsterradius {1055,998,7}..{1066,1006,7}
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (MISSION_DEFS não existe no vm).
 */
"use strict";

const DEATHLINGS_SUNKEN_TEMPLE = {
  otbm: "deeplingstairs",
  name: "Deathlings - Sunken Temple",
  center: { x: 1058, y: 1000, z: 7 },
  spawn: { x: 1058, y: 1001, z: 7 },
  mob: { x: 1052, y: 1000, w: 12, h: 6, z: 7 },
};

/* Itens de loot do Canary que faltavam no catálogo (TibiaWiki / items.xml).
 * Preços = npcvalue oficial (Yasir/Inigo/Malunga). Equipamentos (warrior's
 * axe/shield) usam sell 0 porque têm valor de uso maior que o NPC. */
const DEATHLINGS_LOOT_ITEMS = {
  "crystalline-arrow":          { n: "crystalline arrow", s: "ammo", t: "ammo", cid: 15793, w: 0.90, sell: 0, npcSell: 0 },
  "deepling-filet":             { n: "deepling filet", s: null, t: "loot", cid: 14085, w: 1.00, sell: 60, npcSell: 60 },
  "deeptags":                   { n: "deeptags", s: null, t: "loot", cid: 14013, w: 0.80, sell: 80, npcSell: 80 },
  "deepling-ridge":             { n: "deepling ridge", s: null, t: "loot", cid: 14041, w: 1.20, sell: 50, npcSell: 50 },
  "deepling-warts":             { n: "deepling warts", s: null, t: "loot", cid: 14012, w: 0.80, sell: 35, npcSell: 35 },
  "vortex-bolt":                { n: "vortex bolt", s: "ammo", t: "ammo", cid: 14252, w: 0.90, sell: 0, npcSell: 0 },
  "eye-of-a-deepling":          { n: "eye of a deepling", s: null, t: "loot", cid: 12730, w: 0.24, sell: 80, npcSell: 80 },
  "warrior-s-axe":              { n: "warrior's axe", s: "weapon", t: "axe", cid: 14040, w: 18.00, sell: 0, npcSell: 0, atk: 42, def: 18, lvl: 60 },
  "warrior-s-shield":           { n: "warrior's shield", s: "shield", t: "shield", cid: 14042, w: 24.00, sell: 0, npcSell: 0, def: 33, lvl: 40 },
  "small-enchanted-sapphire":   { n: "small enchanted sapphire", s: null, t: "loot", cid: 675, w: 0.10, sell: 250, npcSell: 250 },
  "necklace-of-the-deep":       { n: "necklace of the deep", s: "necklace", t: "necklace", cid: 13990, w: 5.00, sell: 0, npcSell: 0 },
};

/* Médias das 2 criaturas (Canary: hp/exp/dano/armor). Gold médio = esperança
 * dos drops de platinum-coin (só no Spellsinger). */
const DEATHLINGS_AVG = { hp: 7200, exp: 6350, damage: 300, armor: 72, gold: 45 };

(function registerDeathlingsSunkenTemple() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in DEATHLINGS_LOOT_ITEMS) {
    const def = DEATHLINGS_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = Object.assign({}, def);
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.buy != null) items[slug].buy = def.buy;
      if (def.atk != null) items[slug].atk = def.atk;
      if (def.def != null) items[slug].def = def.def;
      if (def.th != null) items[slug].th = def.th;
      if (def.vocs) items[slug].vocs = def.vocs.slice();
      if (def.s != null) items[slug].s = def.s;
      if (def.t != null) items[slug].t = def.t;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["deathlings-sunken-temple"] = {
    name: DEATHLINGS_SUNKEN_TEMPLE.name,
    level: 250,
    minLevel: 250,
    cat: "aventureiro",
    pack: 8,
    monsters: ["deathling-spellsinger", "deathling-scout"],
    color: "#3a6a7a",
    scene: "cave",
    otbm: DEATHLINGS_SUNKEN_TEMPLE.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1050, y: 997, w: 18, h: 13, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: DEATHLINGS_SUNKEN_TEMPLE.spawn,
    otbmMobBounds: DEATHLINGS_SUNKEN_TEMPLE.mob,
    avgHp: DEATHLINGS_AVG.hp,
    avgExp: DEATHLINGS_AVG.exp,
    avgDamage: DEATHLINGS_AVG.damage,
    avgArmor: DEATHLINGS_AVG.armor,
    avgGold: DEATHLINGS_AVG.gold,
    respawn: 0.8,
  };
})();
