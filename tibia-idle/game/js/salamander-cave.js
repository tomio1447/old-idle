/* salamander-cave.js — HUNT SALAMANDER'S CAVE (categoria 0–100, Venore).
 *
 * Quatro criaturas diretas do Canary (data-otservbr-global/monster/amphibians
 * e vermins): Emerald Damselfly, Marsh Stalker, Swampling e Salamander.
 * Combate, loot, HP/XP/dano/armor, poisons e spells vêm de
 * canarymonsters.json / MONSTERDATA — esta ficha só registra a hunt e
 * os itens de loot que faltavam no catálogo (TibiaWiki / items.xml).
 *
 * Coordenadas absolutas do RME: centerroom {1065,1003,7},
 * playerspawn {1063,1007,7}, monsterspawnradius {1063,998,7}..{1067,1008,7}.
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (MISSION_DEFS não existe no vm).
 */
"use strict";

const SALAMANDER_CAVE = {
  otbm: "salamandercave",
  name: "Salamander's Cave",
  center: { x: 1065, y: 1003, z: 7 },  // centerroom
  spawn: { x: 1063, y: 1007, z: 7 },  // playerspawn
  mob: { x: 1063, y: 998, w: 5, h: 11, z: 7 }, // monsterspawnradius 1063,998..1067,1008
};

/* Itens de loot do Canary que faltavam no catálogo (TibiaWiki / items.xml).
 * Preços = npcvalue oficial (Yasir/Inigo/Malunga etc.). */
const SALAMANDER_CAVE_LOOT_ITEMS = {
  "swampling-moss":            { n: "swampling moss", s: null, t: "loot", cid: 17822, w: 2.70, sell: 20, npcSell: 20 },
  "piece-of-swampling-wood":   { n: "piece of swampling wood", s: null, t: "loot", cid: 17823, w: 3.50, sell: 30, npcSell: 30 },
  "swampling-club":            { n: "swampling club", s: "weapon", t: "club", cid: 17824, w: 31.00, sell: 40, npcSell: 40, atk: 17, def: 12 },
  "damselfly-wing":            { n: "damselfly wing", s: null, t: "loot", cid: 17458, w: 1.20, sell: 20, npcSell: 20 },
  "damselfly-eye":             { n: "damselfly eye", s: null, t: "loot", cid: 17463, w: 1.50, sell: 25, npcSell: 25 },
  "marsh-stalker-feather":     { n: "marsh stalker feather", s: null, t: "loot", cid: 17462, w: 0.30, sell: 50, npcSell: 50 },
  "marsh-stalker-beak":        { n: "marsh stalker beak", s: null, t: "loot", cid: 17461, w: 1.10, sell: 65, npcSell: 65 },
  "simple-jo-staff":           { n: "simple jo staff", s: "weapon", t: "club", cid: 50166, w: 18.00, sell: 0, npcSell: 0, buy: 10, atk: 12, def: 8, th: true, vocs: ["monk", "exalted monk"] },
};

/* Médias simples das 4 criaturas (Canary: hp/exp/dano/armor). Gold médio =
 * esperança dos drops de gold-coin (2 entradas no salamander). */
const SALAMANDER_CAVE_AVG = { hp: 85, exp: 38.75, damage: 38.5, armor: 4, gold: 15.7 };

(function registerSalamanderCave() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in SALAMANDER_CAVE_LOOT_ITEMS) {
    const def = SALAMANDER_CAVE_LOOT_ITEMS[slug];
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
  GAMEDATA.hunts["salamander-cave"] = {
    name: SALAMANDER_CAVE.name,
    level: 15,
    minLevel: 15,
    cat: "aventureiro",
    pack: 4,
    monsters: ["emerald-damselfly", "marsh-stalker", "swampling", "salamander"],
    color: "#5a7a4a",
    scene: "cave",
    otbm: SALAMANDER_CAVE.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1053, y: 994, w: 26, h: 19, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: SALAMANDER_CAVE.spawn,
    otbmMobBounds: SALAMANDER_CAVE.mob,
    avgHp: SALAMANDER_CAVE_AVG.hp,
    avgExp: SALAMANDER_CAVE_AVG.exp,
    avgDamage: SALAMANDER_CAVE_AVG.damage,
    avgArmor: SALAMANDER_CAVE_AVG.armor,
    avgGold: SALAMANDER_CAVE_AVG.gold,
    respawn: 0.8,
  };
})();
