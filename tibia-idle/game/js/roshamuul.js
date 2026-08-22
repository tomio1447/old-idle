/* roshamuul.js — HUNT ROSHAMUUL (categoria 250+, Guzzlemaw Valley).
 *
 * Três criaturas diretas do Canary (data-otservbr-global/monster/magicals):
 *   Guzzlemaw lookType 584, Frazzlemaw 594, Silencer 585
 *   (lookHead/Body/Legs/Feet/Addons = 0). Combate, loot, HP/XP/dano/armor
 *   e spells (waves de life drain, pedra, bleed, mana drain, silencer
 *   skill reducer) vêm de canarymonsters.json / MONSTERDATA.
 *
 * Chances de spawn: Guzzlemaw 40%, Frazzlemaw 40%, Silencer 20%.
 *
 * Coordenadas absolutas do RME: centerroom {1073,1001,7},
 * playerspawn {1069,1004,7}, spawnradius {1069,998,7}..{1079,1005,7}.
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (MISSION_DEFS não existe no vm).
 */
"use strict";

const ROSHAMUUL = {
  otbm: "roshamuul",
  name: "Roshamuul",
  center: { x: 1073, y: 1001, z: 7 },
  spawn: { x: 1069, y: 1004, z: 7 },
  mob: { x: 1069, y: 998, w: 11, h: 8, z: 7 },
};

/* Itens de loot do Canary que faltavam no catálogo (TibiaWiki / items.xml). */
const ROSHAMUUL_LOOT_ITEMS = {
  "banana-skin":                   { n: "banana skin", s: null, t: "loot", cid: 3104, w: 0.30, sell: 1, npcSell: 1 },
  "piece-of-iron":                 { n: "piece of iron", s: null, t: "loot", cid: 3110, w: 0.20, sell: 10, npcSell: 10 },
  "traditional-sai":               { n: "traditional sai", s: "weapon", t: "sword", cid: 10389, w: 50.00, sell: 0, npcSell: 0, atk: 28, def: 15, th: true },
  "brown-crystal-splinter":        { n: "brown crystal splinter", s: null, t: "loot", cid: 16123, w: 0.10, sell: 800, npcSell: 800 },
  "red-crystal-fragment":          { n: "red crystal fragment", s: null, t: "loot", cid: 16126, w: 0.15, sell: 800, npcSell: 800 },
  "crystal-rubbish":               { n: "crystal rubbish", s: null, t: "loot", cid: 16279, w: 9.80, sell: 0, npcSell: 0 },
  "cluster-of-solace":             { n: "cluster of solace", s: null, t: "loot", cid: 20062, w: 2.80, sell: 0, npcSell: 0 },
  "frazzle-tongue":                { n: "frazzle tongue", s: null, t: "loot", cid: 20198, w: 6.80, sell: 700, npcSell: 700 },
  "frazzle-skin":                  { n: "frazzle skin", s: null, t: "loot", cid: 20199, w: 1.90, sell: 400, npcSell: 400 },
  "silencer-claws":                { n: "silencer claws", s: null, t: "loot", cid: 20200, w: 4.20, sell: 390, npcSell: 390 },
  "silencer-resonating-chamber":   { n: "silencer resonating chamber", s: null, t: "loot", cid: 20201, w: 3.50, sell: 600, npcSell: 600 },
};

/* Médias ponderadas 40/40/20 (Canary: hp/exp/dano/armor). */
const ROSHAMUUL_AVG = { hp: 5280, exp: 4936, damage: 423, armor: 73, gold: 120 };

(function registerRoshamuul() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in ROSHAMUUL_LOOT_ITEMS) {
    const def = ROSHAMUUL_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts.roshamuul = {
    name: ROSHAMUUL.name,
    level: 250,
    minLevel: 250,
    cat: "hard",
    pack: 10,
    packMin: 6,
    packMax: 10,
    monsters: ["guzzlemaw", "frazzlemaw", "silencer"],
    spawnWeights: { guzzlemaw: 40, frazzlemaw: 40, silencer: 20 },
    color: "#6a4458",
    scene: "desert",
    otbm: ROSHAMUUL.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1064, y: 992, w: 21, h: 20, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: ROSHAMUUL.spawn,
    otbmMobBounds: ROSHAMUUL.mob,
    avgHp: ROSHAMUUL_AVG.hp,
    avgExp: ROSHAMUUL_AVG.exp,
    avgDamage: ROSHAMUUL_AVG.damage,
    avgArmor: ROSHAMUUL_AVG.armor,
    avgGold: ROSHAMUUL_AVG.gold,
    respawn: 1,
  };

  if (typeof MISSION_DEFS !== "undefined") {
    MISSION_DEFS.roshamuul = {
      title: "Missão: Roshamuul",
      tasks: [
        { monster: "guzzlemaw", target: 100,
          reward: { supplies: [{ slug: "ultimate-health-potion", count: 3 }] } },
        { monster: "frazzlemaw", target: 100,
          reward: { supplies: [{ slug: "ultimate-mana-potion", count: 3 }] } },
        { monster: "silencer", target: 50,
          reward: { supplies: [{ slug: "ultimate-spirit-potion", count: 3 }] } },
      ],
      completeReward: { supplies: [{ slug: "ultimate-health-potion", count: 10 }], gold: 5000 },
    };
  }
})();
