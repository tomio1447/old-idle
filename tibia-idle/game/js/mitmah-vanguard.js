/* mitmah-vanguard.js — BOSS Mitmah Vanguard (BOSSES 250+).
 * Sala: game/maps/mitmah_room.otbm (36×31, z=7 — câmara do Mitmah em
 * Iksupan). Stats/loot do canary (MONSTERDATA já trazia a tabela).
 * Itens novos do loot registrados abaixo (cids do items.xml canary +
 * dois itens da update 13.30 que faltavam no canary — 44727/44728).
 */
"use strict";

(function registerMitmahVanguard() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.items = GAMEDATA.items || {};
  window.BOSS_DEFS = window.BOSS_DEFS || {};
  const BOSS_DEFS = window.BOSS_DEFS;

  /* Itens do loot do Mitmah Vanguard. Preços oficiais Yasir (wiki):
   * chestplate 85k, splintered-gem 225k, crystal 280, necklace 210. */
  const NEW_ITEMS = {
    "broken-mitmah-necklace":   { n: "broken mitmah necklace",   s: null, t: "loot", w: 1.0,  cid: 44438, sell: 210, npcSell: 210 },
    "crystal-of-the-mitmah":    { n: "crystal of the mitmah",    s: null, t: "loot", w: 1.5,  cid: 44439, sell: 280, npcSell: 280 },
    "white-gem":                { n: "white gem",                s: null, t: "loot", w: 0.3,  cid: 32769, sell: 0,      npcSell: 0 },
    "broken-mitmah-chestplate": { n: "broken mitmah chestplate", s: null, t: "loot", w: 2.5,  cid: 44727, sell: 85000,  npcSell: 85000 },
    "splintered-mitmah-gem":    { n: "splintered mitmah gem",    s: null, t: "loot", w: 1.0,  cid: 44728, sell: 225000, npcSell: 225000 },
    "amber-with-a-bug":         { n: "amber with a bug",         s: null, t: "loot", w: 1.0,  cid: 32624, sell: 41000, npcSell: 41000 },
    "amber":                    { n: "amber",                    s: null, t: "loot", w: 1.0,  cid: 32626, sell: 20000, npcSell: 20000 },
    "stoic-iks-boots":          { n: "stoic iks boots",          s: null, t: "loot", w: 0,    cid: 44648, sell: 0,      npcSell: 0 },
    "stoic-iks-casque":         { n: "stoic iks casque",         s: null, t: "loot", w: 0,    cid: 44636, sell: 0,      npcSell: 0 },
    "stoic-iks-chestplate":     { n: "stoic iks chestplate",     s: null, t: "loot", w: 0,    cid: 44620, sell: 0,      npcSell: 0 },
    "stoic-iks-robe":           { n: "stoic iks robe",           s: null, t: "loot", w: 0,    cid: 50255, sell: 0,      npcSell: 0 },
    "stoic-iks-culet":          { n: "stoic iks culet",          s: null, t: "loot", w: 0,    cid: 44642, sell: 0,      npcSell: 0 },
    "stoic-iks-faulds":         { n: "stoic iks faulds",         s: null, t: "loot", w: 0,    cid: 44643, sell: 0,      npcSell: 0 },
    "stoic-iks-headpiece":      { n: "stoic iks headpiece",      s: null, t: "loot", w: 0,    cid: 44637, sell: 0,      npcSell: 0 },
    "stoic-iks-sandals":        { n: "stoic iks sandals",        s: null, t: "loot", w: 0,    cid: 44649, sell: 0,      npcSell: 0 },
    "stoic-iks-cuirass":        { n: "stoic iks cuirass",        s: null, t: "loot", w: 0,    cid: 44619, sell: 0,      npcSell: 0 },
    "golden-lotus-brooch":      { n: "golden lotus brooch",      s: null, t: "loot", w: 0,    cid: 21974, sell: 279, npcSell: 279 },
  };
  Object.assign(GAMEDATA.items, NEW_ITEMS);

  /* Sala da luta — mesmo esquema das boss-rooms (ravenous-bosses.js). */
  const ROOM = {
    spawn: { x: 1026, y: 1034, z: 7 },  // playerspawn
    boss: { x: 1026, y: 1026, z: 7 },   // bossspawn
  };
  GAMEDATA.hunts["mitmah-vanguard-room"] = {
    name: "Mitmah Vanguard Room",
    level: 250,
    minLevel: 250,
    cat: "boss-room",
    hidden: true,
    pack: 1,
    monsters: ["mitmah-vanguard"],
    spawnWeights: { "mitmah-vanguard": 100 },
    color: "#6b5a2a",
    scene: "palace",
    otbm: "mitmah_room",
    otbmFloor: 7,
    otbmSpawn: ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, ROOM.boss),
    // Pisos da sala: 1128 terra, 8276-8290 ornamentados, 2053x mármore Iksupan.
    walkFloors: [1128, 8276, 8279, 8282, 8290, 20533, 20534, 20535, 20536,
      20537, 20538, 20539, 20540, 20541, 20542, 20544, 20545],
    respawn: 0,
  };

  BOSS_DEFS["mitmah-vanguard"] = {
    id: "mitmah-vanguard",
    name: "Mitmah Vanguard",
    title: "Guardião de Iksupan (archfoe)",
    hunt: "mitmah-vanguard-room",
    baseMonster: "mitmah-vanguard",
    sprite: "mitmah-vanguard",
    mult: 1,
    requirement: { level: 250 },
  };
})();
