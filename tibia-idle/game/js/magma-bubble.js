/* magma-bubble.js — BOSS Magma Bubble (BOSSES 400+).
 * Sala: game/maps/magma_room.otbm (25×19, z=7). Stats do canary
 * (MONSTERDATA): hp 450.000 / exp 80.000 / looktype 1413 / melee ~750.
 * Loot da série 13.20+ (arcanomancer/arboreal/spiritthorn/alicorn/ethereal
 * charged rings + fiery tear etc.) registrado abaixo — sem comprador oficial.
 */
"use strict";

(function registerMagmaBubble() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.items = GAMEDATA.items || {};
  window.BOSS_DEFS = window.BOSS_DEFS || {};
  const BOSS_DEFS = window.BOSS_DEFS;

  const LOOT_ITEMS = {
    "fiery-tear":                  { n: "fiery tear",                  s: null, t: "loot", w: 0, cid: 39040, sell: 0, npcSell: 0 },
    "arboreal-tome":               { n: "arboreal tome",               s: null, t: "loot", w: 0, cid: 39154, sell: 0, npcSell: 0 },
    "arboreal-crown":              { n: "arboreal crown",              s: null, t: "loot", w: 0, cid: 39153, sell: 0, npcSell: 0 },
    "spiritthorn-armor":           { n: "spiritthorn armor",           s: null, t: "loot", w: 0, cid: 39147, sell: 0, npcSell: 0 },
    "spiritthorn-helmet":          { n: "spiritthorn helmet",          s: null, t: "loot", w: 0, cid: 39148, sell: 0, npcSell: 0 },
    "ethereal-coned-hat":          { n: "ethereal coned hat",          s: null, t: "loot", w: 0, cid: 50188, sell: 0, npcSell: 0 },
    "alicorn-headguard":           { n: "alicorn headguard",           s: null, t: "loot", w: 0, cid: 39149, sell: 0, npcSell: 0 },
    "alicorn-quiver":              { n: "alicorn quiver",              s: null, t: "loot", w: 0, cid: 39150, sell: 0, npcSell: 0 },
    "arcanomancer-regalia":        { n: "arcanomancer regalia",        s: null, t: "loot", w: 0, cid: 39151, sell: 0, npcSell: 0 },
    "arcanomancer-folio":          { n: "arcanomancer folio",          s: null, t: "loot", w: 0, cid: 39152, sell: 0, npcSell: 0 },
    "charged-arcanomancer-sigil":  { n: "charged arcanomancer sigil",  s: null, t: "loot", w: 0, cid: 39183, sell: 0, npcSell: 0 },
    "charged-arboreal-ring":       { n: "charged arboreal ring",       s: null, t: "loot", w: 0, cid: 39186, sell: 0, npcSell: 0 },
    "charged-alicorn-ring":        { n: "charged alicorn ring",        s: null, t: "loot", w: 0, cid: 39180, sell: 0, npcSell: 0 },
    "charged-spiritthorn-ring":    { n: "charged spiritthorn ring",    s: null, t: "loot", w: 0, cid: 39177, sell: 0, npcSell: 0 },
    "charged-ethereal-ring":       { n: "charged ethereal ring",       s: null, t: "loot", w: 0, cid: 50147, sell: 0, npcSell: 0 },
    "portable-flame":              { n: "portable flame",              s: null, t: "loot", w: 0, cid: 39545, sell: 0, npcSell: 0 },
    "firefighting-axe":            { n: "firefighting axe",            s: null, t: "loot", w: 0, cid: 39544, sell: 0, npcSell: 0 },
  };
  for (const slug in LOOT_ITEMS) {
    if (!GAMEDATA.items[slug] || !GAMEDATA.items[slug].s)
      GAMEDATA.items[slug] = LOOT_ITEMS[slug];
  }

  GAMEDATA.hunts["magma-bubble-room"] = {
    name: "Magma Bubble Room",
    level: 400,
    minLevel: 400,
    cat: "boss-room",
    hidden: true,
    pack: 1,
    monsters: ["magma-bubble"],
    spawnWeights: { "magma-bubble": 100 },
    color: "#b03917",
    scene: "hell",
    otbm: "magma_room",
    otbmFloor: 7,
    otbmSpawn: { x: 1025, y: 1026, z: 7 },        // playerspawn
    otbmMobBounds: { x: 1020, y: 1023, w: 1, h: 1, z: 7 }, // bossspawn
    /* 21477-21492 = a formação de rocha onde o boss fica — incluída no
     * walkFloors senão a célula do boss e a rocha ficam intransitáveis. */
    walkFloors: [729, 730, 1128, 21477, 21478, 21479, 21480, 21481, 21482,
      21489, 21490, 21492, 39195, 39196, 39197, 39198, 39199, 39200],
    respawn: 0,
  };

  BOSS_DEFS["magma-bubble"] = {
    id: "magma-bubble",
    name: "Magma Bubble",
    title: "O colosso de magma",
    hunt: "magma-bubble-room",
    baseMonster: "magma-bubble",
    sprite: "magma-bubble",
    mult: 1,
    requirement: { level: 400, text: "Requer nível 400+ (BOSSES 400+)" },
  };
})();
