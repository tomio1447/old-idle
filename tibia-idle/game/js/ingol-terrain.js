/* ingol-terrain.js — HUNT INGOL TERRAIN (categoria 250+, zona Ingol).
 *
 * Primeiro mapa da hunt Ingol. Cinco criaturas diretas do Canary —
 * Harpy, Crape Man, Liodile, Boar Man e Carnivostrich (looktypes
 * 1604/1601/1602/1603/1605). Combate, loot, HP/XP/dano/armor vêm do
 * canarymonsters.json / MONSTERDATA.
 *
 * Este patch:
 *   (1) garante no catálogo os 5 creature products que faltavam, com
 *       preço NPC e peso oficiais da TibiaWiki;
 *   (2) registra a hunt técnica do piso z=7 (game/maps/ingolterrain.otbm,
 *       publicada a partir de beta-maps/);
 *   (3) registra a missão: eliminar 250 criaturas (50 de cada).
 *
 * Coordenadas absolutas do RME: centerroom {1073,1002,7},
 * playerspawn {1068,1002,7}, spawnradius {1069,998,7}..{1079,1008,7}.
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (MISSION_DEFS não existe no vm), o que
 * põe os itens do loot no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* Geometria do mapa (coordenadas absolutas do RME). */
const INGOL_TERRAIN = {
  otbm: "ingolterrain",
  name: "Ingol Terrain",
  center: { x: 1073, y: 1002, z: 7 },   // centerroom
  spawn: { x: 1068, y: 1002, z: 7 },    // playerspawn
  mob: { x: 1069, y: 998, w: 11, h: 11, z: 7 }, // spawnradius
};

/* Creature products do Canary que faltavam no catálogo. */
const INGOL_LOOT_ITEMS = {
  "harpy-feathers":          { n: "harpy feathers", s: null, t: "loot", cid: 40585, w: 3.90, sell: 730, npcSell: 730 },
  "crab-man-claws":          { n: "crab man claws", s: null, t: "loot", cid: 40582, w: 2.30, sell: 550, npcSell: 550 },
  "liodile-fang":            { n: "liodile fang", s: null, t: "loot", cid: 40583, w: 1.70, sell: 480, npcSell: 480 },
  "boar-man-hoof":           { n: "boar man hoof", s: null, t: "loot", cid: 40584, w: 2.10, sell: 600, npcSell: 600 },
  "carnivostrich-feather":   { n: "carnivostrich feather", s: null, t: "loot", cid: 40586, w: 1.20, sell: 630, npcSell: 630 },
};

/* Médias das 5 criaturas (Canary: hp/exp/dano/armor). */
const INGOL_AVG = { hp: 8580, exp: 6526, damage: 468, armor: 69, gold: 120 };

(function registerIngolTerrain() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in INGOL_LOOT_ITEMS) {
    const def = INGOL_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      items[slug].sell = def.sell;
      items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["ingol-terrain"] = {
    name: INGOL_TERRAIN.name,
    level: 250,
    minLevel: 250,
    cat: "hard",
    pack: 10,
    packMin: 6,
    packMax: 10,
    monsters: ["harpy", "crape-man", "liodile", "boar-man", "carnivostrich"],
    color: "#9a7a45",
    scene: "desert",
    otbm: INGOL_TERRAIN.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1061, y: 991, w: 25, h: 21, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: INGOL_TERRAIN.spawn,
    otbmMobBounds: INGOL_TERRAIN.mob,
    avgHp: INGOL_AVG.hp,
    avgExp: INGOL_AVG.exp,
    avgDamage: INGOL_AVG.damage,
    avgArmor: INGOL_AVG.armor,
    avgGold: INGOL_AVG.gold,
    respawn: 1,
  };

  if (typeof MISSION_DEFS !== "undefined") {
    MISSION_DEFS["ingol-terrain"] = {
      title: "Missão: Ingol Terrain",
      tasks: [
        { monster: "harpy", target: 50,
          reward: { supplies: [{ slug: "ultimate-health-potion", count: 3 }] } },
        { monster: "crape-man", target: 50,
          reward: { supplies: [{ slug: "ultimate-mana-potion", count: 3 }] } },
        { monster: "liodile", target: 50,
          reward: { supplies: [{ slug: "ultimate-spirit-potion", count: 3 }] } },
        { monster: "boar-man", target: 50,
          reward: { supplies: [{ slug: "ultimate-health-potion", count: 3 }] } },
        { monster: "carnivostrich", target: 50,
          reward: { supplies: [{ slug: "ultimate-mana-potion", count: 3 }] } },
      ],
      completeReward: { supplies: [{ slug: "ultimate-health-potion", count: 10 }], gold: 5000 },
    };
  }
})();
