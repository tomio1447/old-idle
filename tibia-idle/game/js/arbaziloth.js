/* arbaziloth.js — BOSS Arbaziloth (BOSSES 250+).
 * Sala: game/maps/arbaziloth_room.otbm (31×27, z=7). Stats do canary
 * (MONSTERDATA): hp 360.000 / exp 500.000 / looktype 1802.
 * Gate: 500 kills de cada Inferniarch do Azzilon Castle (requirement.azKills).
 * Modos: o modal oferece FÁCIL (mult 0.6) ou DIFÍCIL (mult 1.0) — escolha
 * aplica boss.mult antes do startBoss.
 */
"use strict";

(function registerArbaziloth() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  window.BOSS_DEFS = window.BOSS_DEFS || {};
  const BOSS_DEFS = window.BOSS_DEFS;

  const ROOM = {
    spawn: { x: 1024, y: 1036, z: 7 },  // playerspawn
    boss: { x: 1027, y: 1028, z: 7 },   // bossspawn
  };
    /* Loot do Arbaziloth — cids do canary (armas/armaduras da série
   * Inferniarch/Soul War, update 13.20+). Sem comprador oficial → sell:0. */
  const ARBA_ITEMS = {
    "supreme-health-potion":      { n:"supreme health potion",      s:null, t:"loot", w:0, cid:23375, sell:0, npcSell:0 },
    "ultimate-spirit-potion":     { n:"ultimate spirit potion",     s:null, t:"loot", w:0, cid:23374, sell:0, npcSell:0 },
    "arbaziloth-shoulder-piece":  { n:"Arbaziloth shoulder piece",  s:null, t:"loot", w:0, cid:50067, sell:0, npcSell:0 },
    "demon-claws":                { n:"demon claws",                s:null, t:"loot", w:0, cid:50060, sell:0, npcSell:0 },
    "demon-skull":                { n:"demon skull",                s:null, t:"loot", w:0, cid:31212, sell:0, npcSell:0 },
    "demon-in-a-green-box":       { n:"demon in a green box",       s:null, t:"loot", w:0, cid:50064, sell:0, npcSell:0 },
    "inferniarch-arbalest":       { n:"inferniarch arbalest",       s:null, t:"loot", w:0, cid:49522, sell:0, npcSell:0 },
    "inferniarch-battleaxe":      { n:"inferniarch battleaxe",      s:null, t:"loot", w:0, cid:49523, sell:0, npcSell:0 },
    "inferniarch-blade":          { n:"inferniarch blade",          s:null, t:"loot", w:0, cid:49527, sell:0, npcSell:0 },
    "inferniarch-bow":            { n:"inferniarch bow",            s:null, t:"loot", w:0, cid:49520, sell:0, npcSell:0 },
    "inferniarch-claws":          { n:"inferniarch claws",          s:null, t:"loot", w:0, cid:50250, sell:0, npcSell:0 },
    "inferniarch-flail":          { n:"inferniarch flail",          s:null, t:"loot", w:0, cid:49525, sell:0, npcSell:0 },
    "inferniarch-greataxe":       { n:"inferniarch greataxe",       s:null, t:"loot", w:0, cid:49524, sell:0, npcSell:0 },
    "inferniarch-rod":            { n:"inferniarch rod",            s:null, t:"loot", w:0, cid:49529, sell:0, npcSell:0 },
    "inferniarch-slayer":         { n:"inferniarch slayer",         s:null, t:"loot", w:0, cid:49530, sell:0, npcSell:0 },
    "inferniarch-wand":           { n:"inferniarch wand",           s:null, t:"loot", w:0, cid:49528, sell:0, npcSell:0 },
    "inferniarch-warhammer":      { n:"inferniarch warhammer",      s:null, t:"loot", w:0, cid:49526, sell:0, npcSell:0 },
    "maliceforged-helmet":        { n:"maliceforged helmet",        s:null, t:"loot", w:0, cid:49531, sell:0, npcSell:0 },
    "hellstalker-visor":          { n:"hellstalker visor",          s:null, t:"loot", w:0, cid:49532, sell:0, npcSell:0 },
    "dreadfire-headpiece":        { n:"dreadfire headpiece",        s:null, t:"loot", w:0, cid:49533, sell:0, npcSell:0 },
    "demonfang-mask":             { n:"demonfang mask",             s:null, t:"loot", w:0, cid:49534, sell:0, npcSell:0 },
    "demon-mengu":                { n:"demon mengu",                s:null, t:"loot", w:0, cid:50189, sell:0, npcSell:0 },
  };
  Object.assign(GAMEDATA.items, ARBA_ITEMS);

  GAMEDATA.hunts["arbaziloth-room"] = {
    name: "Arbaziloth Room",
    level: 400,
    minLevel: 400,
    cat: "boss-room",
    hidden: true,
    pack: 1,
    monsters: ["arbaziloth"],
    spawnWeights: { "arbaziloth": 100 },
    color: "#5a1a0a",
    scene: "hell",
    otbm: "arbaziloth_room",
    otbmFloor: 7,
    otbmSpawn: ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, ROOM.boss),
    walkFloors: [1128, 7062, 7063, 7064, 7065, 7066],
    respawn: 0,
  };

  BOSS_DEFS["arbaziloth"] = {
    id: "arbaziloth",
    name: "Arbaziloth",
    title: "Senhor dos Inferniarchs (Azzilon)",
    hunt: "arbaziloth-room",
    baseMonster: "arbaziloth",
    sprite: "arbaziloth",
    mult: 1,
    modes: { facil: { mult: 0.6 }, hard: { mult: 1 } },
    /* TESTE: acesso liberado — requisito desligado. Para produção,
     * reativar: requirement: { level:250, mission:"azzilon-castle",
     * enforced:true, text:"Elimine 500× cada Inferniarch..." } */
    requirement: { level: 400, enforced: false },
  };
})();
