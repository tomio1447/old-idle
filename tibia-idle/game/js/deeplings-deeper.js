/* deeplings-deeper.js — HUNT DEEPLINGS DEEPER (categoria 100–250).
 *
 * Três criaturas diretas do Canary (data-otservbr-global/monster/deeplings):
 * Deepling Guard, Deepling Warrior e Deepling Tyrant. Combate, loot, HP/XP/
 * dano/armor, poisons e spells vêm de canarymonsters.json / MONSTERDATA —
 * esta ficha só registra a hunt e os itens de loot que faltavam no catálogo
 * (TibiaWiki / items.xml).
 *
 * Reutiliza o mapa deathlingsunkentemple.otbm com as mesmas coordenadas da
 * hunt Deathlings - Sunken Temple.
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

const DEEPLINGS_DEEPER = {
  otbm: "deathlingsunkentemple",
  name: "Deeplings Deeper",
  center: { x: 1061, y: 1001, z: 7 },
  spawn: { x: 1069, y: 1003, z: 7 },
  mob: { x: 1055, y: 998, w: 12, h: 9, z: 7 },
};

/* Itens de loot do Canary que faltavam no catálogo (TibiaWiki / items.xml).
 * Preços = npcvalue oficial (Yasir/Inigo/Malunga). */
const DEEPLINGS_DEEPER_LOOT_ITEMS = {
  "deepling-breaktime-snack":   { n: "deepling breaktime snack", s: null, t: "loot", cid: 14011, w: 1.60, sell: 80, npcSell: 80 },
  "deepling-guard-belt-buckle": { n: "deepling guard belt buckle", s: null, t: "loot", cid: 14010, w: 1.00, sell: 40, npcSell: 40 },
  "deepling-claw":              { n: "deepling claw", s: null, t: "loot", cid: 14044, w: 1.40, sell: 60, npcSell: 60 },
  "deepling-backpack":          { n: "deepling backpack", s: "container", t: "container", cid: 14248, w: 18.00, sell: 0, npcSell: 0 },
  "foxtail":                    { n: "foxtail", s: null, t: "loot", cid: 14142, w: 0.40, sell: 40, npcSell: 40 },
};

/* Médias das 3 criaturas (Canary: hp/exp/dano/armor). */
const DEEPLINGS_DEEPER_AVG = { hp: 2667, exp: 2600, damage: 400, armor: 49, gold: 150 };

(function registerDeeplingsDeeper() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in DEEPLINGS_DEEPER_LOOT_ITEMS) {
    const def = DEEPLINGS_DEEPER_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = Object.assign({}, def);
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.buy != null) items[slug].buy = def.buy;
      if (def.s != null) items[slug].s = def.s;
      if (def.t != null) items[slug].t = def.t;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["deeplings-deeper"] = {
    name: DEEPLINGS_DEEPER.name,
    level: 150,
    minLevel: 150,
    cat: "aventureiro",
    pack: 7,
    monsters: ["deepling-guard", "deepling-warrior", "deepling-tyrant"],
    color: "#3a5a6a",
    scene: "cave",
    otbm: DEEPLINGS_DEEPER.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1053, y: 995, w: 20, h: 15, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: DEEPLINGS_DEEPER.spawn,
    otbmMobBounds: DEEPLINGS_DEEPER.mob,
    avgHp: DEEPLINGS_DEEPER_AVG.hp,
    avgExp: DEEPLINGS_DEEPER_AVG.exp,
    avgDamage: DEEPLINGS_DEEPER_AVG.damage,
    avgArmor: DEEPLINGS_DEEPER_AVG.armor,
    avgGold: DEEPLINGS_DEEPER_AVG.gold,
    respawn: 0.8,
  };
})();
