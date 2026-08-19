/* prison.js — THE PRISON (categoria 250+, 3 andares de Roshamuul Prison).
 *
 * Três hunts distintas no MESMO mapa (prisonroshamuul.otbm, piso z=7) —
 * muda apenas a composição de monstros por andar, igual ao Canary:
 *
 *   Andar 1: lost soul, plaguesmith, demon outcast, betrayed wraith,
 *            dark torturer
 *   Andar 2: + hellhound, blightwalker
 *   Andar 3: + juggernaut
 *
 * Criaturas diretas do Canary (data-otservbr-global/monster/undeads e
 * /demons): stats, spells e loot de canarymonsters.json/MONSTERDATA.
 *
 * Coordenadas absolutas do RME: playerspawn {1069,1002,7},
 * spawnradius {1070,997,7}..{1078,1007,7}, centermap {1074,1002,7}.
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (MISSION_DEFS não existe no vm).
 */
"use strict";

/* Geometria compartilhada dos 3 andares (mesmo OTBM/coordenadas). */
const PRISON = {
  otbm: "prisonroshamuul",
  spawn: { x: 1069, y: 1002, z: 7 },        // playerspawn
  mob: { x: 1070, y: 997, w: 9, h: 11, z: 7 }, // spawnradius
  center: { x: 1074, y: 1002, z: 7 },       // centermap
};

/* Composições por andar (Canary Roshamuul Prison). */
const PRISON_FLOORS = [
  { id: "prison-1", name: "The Prison (Floor 1)",
    monsters: ["lost-soul", "plaguesmith", "demon-outcast", "betrayed-wraith", "dark-torturer"],
    color: "#4a4460" },
  { id: "prison-2", name: "The Prison (Floor 2)",
    monsters: ["lost-soul", "hellhound", "demon-outcast", "betrayed-wraith", "dark-torturer", "blightwalker"],
    color: "#40485e" },
  { id: "prison-3", name: "The Prison (Floor 3)",
    monsters: ["lost-soul", "hellhound", "demon-outcast", "betrayed-wraith", "dark-torturer", "blightwalker", "plaguesmith", "juggernaut"],
    color: "#5a423f" },
];

/* Itens de loot do Canary que faltavam no catálogo. Pesos/valores oficiais
 * (TibiaWiki): silver goblet (decoração, sem comprador), dirty cape (lixo),
 * slightly rusted armor (enferrujada, sem NPC) e bunch of wheat (comida,
 * sem NPC comprador) ficam sell 0 — Sell All/autoseller pulam. */
const PRISON_LOOT_ITEMS = {
  "silver-goblet":               { n: "silver goblet", s: null, t: "loot", cid: 5806, w: 15.00, sell: 0, npcSell: 0 },
  "skeleton-decoration":         { n: "skeleton decoration", s: null, t: "loot", cid: 6525, w: 10.00, sell: 3000, npcSell: 3000 },
  "slightly-rusted-armor":       { n: "slightly rusted armor", s: null, t: "loot", cid: 8896, w: 120.00, sell: 0, npcSell: 0 },
  "unholy-bone":                 { n: "unholy bone", s: null, t: "loot", cid: 10316, w: 1.25, sell: 480, npcSell: 480 },
  "dirty-cape":                  { n: "dirty cape", s: null, t: "loot", cid: 3122, w: 29.50, sell: 0, npcSell: 0 },
  "piece-of-royal-steel":        { n: "piece of royal steel", s: null, t: "loot", cid: 5887, w: 5.00, sell: 10000, npcSell: 10000 },
  "piece-of-hell-steel":         { n: "piece of hell steel", s: null, t: "loot", cid: 5888, w: 5.00, sell: 500, npcSell: 500 },
  "piece-of-draconian-steel":    { n: "piece of draconian steel", s: null, t: "loot", cid: 5889, w: 5.00, sell: 3000, npcSell: 3000 },
  "demon-dust":                  { n: "demon dust", s: null, t: "loot", cid: 5526, w: 1.00, sell: 300, npcSell: 300 },
  "golden-figurine":             { n: "golden figurine", s: null, t: "loot", cid: 5799, w: 15.00, sell: 3000, npcSell: 3000 },
  "bunch-of-wheat":              { n: "bunch of wheat", s: null, t: "loot", cid: 3605, w: 12.50, sell: 0, npcSell: 0 },
  "bundle-of-cursed-straw":      { n: "bundle of cursed straw", s: null, t: "loot", cid: 9688, w: 2.27, sell: 800, npcSell: 800 },
  "closed-trap":                 { n: "closed trap", s: null, t: "loot", cid: 3481, w: 21.00, sell: 75, npcSell: 75 },
};

/* Médias Canary por andar (hp/exp/dano/armor — média aritmética). */
const PRISON_AVG = {
  "prison-1": { hp: 6500, exp: 4430, damage: 462, armor: 39, gold: 100 },
  "prison-2": { hp: 6871, exp: 4856, damage: 474, armor: 45, gold: 100 },
  "prison-3": { hp: 8263, exp: 5649, damage: 599, armor: 48, gold: 100 },
};

(function registerPrison() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in PRISON_LOOT_ITEMS) {
    const def = PRISON_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  for (const floor of PRISON_FLOORS) {
    const avg = PRISON_AVG[floor.id];
    GAMEDATA.hunts[floor.id] = {
      name: floor.name,
      level: 250,
      minLevel: 250,
      cat: "hard",
      pack: 10,
      packMin: 6,
      packMax: 10,
      monsters: floor.monsters.slice(),
      color: floor.color,
      scene: "crypt",
      otbm: PRISON.otbm,
      otbmFloor: 7,
      otbmFovBounds: { x: 1063, y: 992, w: 22, h: 20, z: 7 },
      otbmRuntimeWidth: 30,
      otbmRuntimeHeight: 30,
      otbmSpawn: PRISON.spawn,
      otbmMobBounds: PRISON.mob,
      avgHp: avg.hp,
      avgExp: avg.exp,
      avgDamage: avg.damage,
      avgArmor: avg.armor,
      avgGold: avg.gold,
      respawn: 1,
    };
  }
})();
