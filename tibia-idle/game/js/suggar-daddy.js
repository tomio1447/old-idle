/* suggar-daddy.js — BOSS Sugar Daddy (BOSSES 1–250).
 * Sala: game/maps/suggar_room.otbm (37×29, z=7 — sala de doces/Candia).
 * Stats do canary (MONSTERDATA): hp 9.500 / exp 15.550 / looktype 1764.
 * Loot: série de doces/joias + equipamentos — cids do items.xml canary.
 */
"use strict";

(function registerSuggarDaddy() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.items = GAMEDATA.items || {};
  window.BOSS_DEFS = window.BOSS_DEFS || {};
  const BOSS_DEFS = window.BOSS_DEFS;

  const LOOT_ITEMS = {
    "small-enchanted-sapphire": { n: "small enchanted sapphire", s: null, t: "loot", w: 0, cid: 675,   sell: 0, npcSell: 0 },
    "white-gem":                { n: "white gem",                s: null, t: "loot", w: 0, cid: 32769, sell: 0, npcSell: 0 },
    "biscuit-barrier":          { n: "biscuit barrier",          s: null, t: "loot", w: 0, cid: 45643, sell: 0, npcSell: 0 },
    "candy-coated-quiver":      { n: "candy-coated quiver",      s: null, t: "loot", w: 0, cid: 45644, sell: 0, npcSell: 0 },
    "cocoa-grimoire":           { n: "cocoa grimoire",           s: null, t: "loot", w: 0, cid: 45639, sell: 0, npcSell: 0 },
    "creamy-grimoire":          { n: "creamy grimoire",          s: null, t: "loot", w: 0, cid: 45640, sell: 0, npcSell: 0 },
    "candy-necklace":           { n: "candy necklace",           s: null, t: "loot", w: 0, cid: 45641, sell: 0, npcSell: 0 },
    "ring-of-temptation":       { n: "ring of temptation",       s: null, t: "loot", w: 0, cid: 45642, sell: 0, npcSell: 0 },
    "churro-heart":             { n: "churro heart",             s: null, t: "loot", w: 0, cid: 48254, sell: 0, npcSell: 0 },
    "dark-chocolate-coin":      { n: "dark chocolate coin",      s: null, t: "loot", w: 0, cid: 48250, sell: 0, npcSell: 0 },
    "brigadeiro":               { n: "brigadeiro",               s: null, t: "loot", w: 0, cid: 48252, sell: 0, npcSell: 0 },
    "milk-chocolate-coin":      { n: "milk chocolate coin",      s: null, t: "loot", w: 0, cid: 48249, sell: 0, npcSell: 0 },
    "pastry-dragon":            { n: "pastry dragon",            s: null, t: "loot", w: 0, cid: 48256, sell: 0, npcSell: 0 },
  };
  Object.assign(GAMEDATA.items, LOOT_ITEMS);

  GAMEDATA.hunts["suggar-daddy-room"] = {
    name: "Sugar Daddy Room",
    level: 150,
    minLevel: 1,
    cat: "boss-room",
    hidden: true,
    pack: 1,
    monsters: ["sugar-daddy"],
    spawnWeights: { "sugar-daddy": 100 },
    color: "#d66fa0",
    scene: "candy",
    otbm: "suggar_room",
    otbmFloor: 7,
    otbmSpawn: { x: 1026, y: 1034, z: 7 },              // playerspawn
    otbmMobBounds: { x: 1025, y: 1024, w: 1, h: 1, z: 7 }, // bossspawn
    walkFloors: [1128, 44805, 44826, 45196, 48121, 48228, 48229,
      48230, 48231, 48232, 48233, 12090, 12091, 12092, 12093, 12095],
    respawn: 0,
  };

  BOSS_DEFS["sugar-daddy"] = {
    id: "sugar-daddy",
    name: "Sugar Daddy",
    title: "Rei das guloseimas de Candia",
    hunt: "suggar-daddy-room",
    baseMonster: "sugar-daddy",
    sprite: "sugar-daddy",
    mult: 1,
    requirement: { level: 1 },
  };
})();
