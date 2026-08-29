/* brainstealer-boss.js — Boss The Brainstealer (nível 250+).
 * Sala: game/maps/brainstealer.otbm
 * centeroom {x: 1023, y: 1026, z: 7}
 * bossspawn {x: 1020, y: 1021, z: 7}
 * playerspawn {x: 1026, y: 1029, z: 7}
 */
"use strict";

const BRAINSTEALER_ID = "the-brainstealer";
const BRAINSTEALER_ROOM = {
  otbm: "brainstealer",
  name: "The Brainstealer's Room",
  center: { x: 1023, y: 1026, z: 7 },
  spawn: { x: 1026, y: 1029, z: 7 },
  boss: { x: 1020, y: 1021, z: 7 },
};

(function registerBrainstealer() {
  if (typeof GAMEDATA === "undefined") return;

  if (typeof MOBSHEETS !== "undefined" && !MOBSHEETS[BRAINSTEALER_ID]) {
    MOBSHEETS[BRAINSTEALER_ID] = { cw: 63, ch: 63, cols: 9, rows: 4 };
  }

  if (!GAMEDATA.items) GAMEDATA.items = {};
  const lootItems = {
    "violet-gem": { n: "violet gem", s: null, t: "loot", cid: 3036, w: 0.30, sell: 1000, npcSell: 1000 },
    "white-gem": { n: "white gem", s: null, t: "loot", cid: 32769, w: 0.30, sell: 12000, npcSell: 12000 },
    "moonstone": { n: "moonstone", s: null, t: "loot", cid: 32771, w: 0.10, sell: 13000, npcSell: 13000 },
    "ultimate-spirit-potion": { n: "ultimate spirit potion", s: null, t: "loot", cid: 23374, w: 3.10, sell: 0, npcSell: 0 },
    "brainstealer-s-tissue": { n: "brainstealer's tissue", s: null, t: "loot", cid: 36794, w: 1.30, sell: 240000, npcSell: 240000 },
    "brainstealer-s-brain": { n: "brainstealer's brain", s: null, t: "loot", cid: 36795, w: 2.00, sell: 300000, npcSell: 300000 },
    "brainstealer-s-brainwave": { n: "brainstealer's brainwave", s: null, t: "loot", cid: 36796, w: 2.00, sell: 440000, npcSell: 440000 },
    "eldritch-shield": { n: "eldritch shield", s: "shield", t: "shield", cid: 36656, w: 69.00, sell: 0, npcSell: 0, def: 22, arm: 0 },
    "eldritch-claymore": { n: "eldritch claymore", s: "weapon", t: "sword", cid: 36657, w: 85.00, sell: 0, npcSell: 0, atk: 52, def: 25 },
    "gilded-eldritch-claymore": { n: "gilded eldritch claymore", s: "weapon", t: "sword", cid: 36658, w: 86.00, sell: 0, npcSell: 0, atk: 54, def: 25 },
    "eldritch-warmace": { n: "eldritch warmace", s: "weapon", t: "club", cid: 36659, w: 82.00, sell: 0, npcSell: 0, atk: 50, def: 26 },
    "gilded-eldritch-warmace": { n: "gilded eldritch warmace", s: "weapon", t: "club", cid: 36660, w: 83.00, sell: 0, npcSell: 0, atk: 52, def: 26 },
    "eldritch-greataxe": { n: "eldritch greataxe", s: "weapon", t: "axe", cid: 36661, w: 65.00, sell: 0, npcSell: 0, atk: 52, def: 23 },
    "gilded-eldritch-greataxe": { n: "gilded eldritch greataxe", s: "weapon", t: "axe", cid: 36662, w: 66.00, sell: 0, npcSell: 0, atk: 54, def: 23 },
    "eldritch-cuirass": { n: "eldritch cuirass", s: "armor", t: "armor", cid: 36663, w: 110.00, sell: 0, npcSell: 0, arm: 18 },
    "eldritch-bow": { n: "eldritch bow", s: "weapon", t: "distance", cid: 36664, w: 58.00, sell: 0, npcSell: 0, atk: 6, hit: 3 },
    "eldritch-quiver": { n: "eldritch quiver", s: "ammo", t: "quiver", cid: 36666, w: 22.00, sell: 0, npcSell: 0 },
    "eldritch-breeches": { n: "eldritch breeches", s: "legs", t: "legs", cid: 36667, w: 69.00, sell: 0, npcSell: 0, arm: 9 },
    "eldritch-wand": { n: "eldritch wand", s: "weapon", t: "wand", cid: 36668, w: 36.00, sell: 0, npcSell: 0, mdmg: 100 },
    "gilded-eldritch-wand": { n: "gilded eldritch wand", s: "weapon", t: "wand", cid: 36669, w: 37.00, sell: 0, npcSell: 0, mdmg: 105 },
    "eldritch-cowl": { n: "eldritch cowl", s: "helmet", t: "helmet", cid: 36670, w: 26.00, sell: 0, npcSell: 0, arm: 7 },
    "eldritch-hood": { n: "eldritch hood", s: "helmet", t: "helmet", cid: 36671, w: 27.00, sell: 0, npcSell: 0, arm: 6 },
    "eldritch-folio": { n: "eldritch folio", s: "weapon", t: "shield", cid: 36672, w: 28.00, sell: 0, npcSell: 0, def: 20, arm: 0 },
    "eldritch-tome": { n: "eldritch tome", s: "weapon", t: "shield", cid: 36673, w: 26.00, sell: 0, npcSell: 0, def: 22, arm: 0 },
    "eldritch-rod": { n: "eldritch rod", s: "weapon", t: "rod", cid: 36674, w: 35.00, sell: 0, npcSell: 0, mdmg: 100 },
    "gilded-eldritch-rod": { n: "gilded eldritch rod", s: "weapon", t: "rod", cid: 36675, w: 36.00, sell: 0, npcSell: 0, mdmg: 105 },
    "eldritch-crescent-moon-spade": { n: "eldritch crescent moon spade", s: "weapon", t: "sword", cid: 50169, w: 88.00, sell: 0, npcSell: 0, atk: 50, def: 24 },
    "eldritch-monk-boots": { n: "eldritch monk boots", s: "boots", t: "boots", cid: 50266, w: 13.00, sell: 0, npcSell: 0, arm: 3 },
    "eldritch-crystal": { n: "eldritch crystal", s: null, t: "loot", cid: 36835, w: 0.30, sell: 48000, npcSell: 48000 },
  };
  for (const slug in lootItems) {
    const def = lootItems[slug];
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = def;
    else {
      if (def.sell != null) GAMEDATA.items[slug].sell = def.sell;
      if (def.npcSell != null) GAMEDATA.items[slug].npcSell = def.npcSell;
      if (def.cid != null && GAMEDATA.items[slug].cid == null) GAMEDATA.items[slug].cid = def.cid;
      if (def.w != null && GAMEDATA.items[slug].w == null) GAMEDATA.items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["brainstealer-room"] = {
    name: "The Brainstealer's Room",
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: [BRAINSTEALER_ID],
    color: "#4a3a5c",
    scene: "palace",
    otbm: BRAINSTEALER_ROOM.otbm,
    otbmFloor: 7,
    otbmBounds: { x: 1013, y: 1020, w: 21, h: 13, z: 7 },
    otbmSpawn: BRAINSTEALER_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, BRAINSTEALER_ROOM.boss),
    avgHp: 300000,
    avgExp: 72000,
    avgDamage: 2500,
    avgArmor: 85,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;
  BOSS_DEFS[BRAINSTEALER_ID] = {
    id: BRAINSTEALER_ID,
    name: "The Brainstealer",
    title: "Boss do Kazordoon",
    hunt: "brainstealer-room",
    sprite: BRAINSTEALER_ID,
    baseMonster: BRAINSTEALER_ID,
    hp: 300000,
    exp: 72000,
    damage: 2500,
    armor: 85,
    defense: 85,
    speed: 0.00002,
    loot: [],
    requirement: { level: 250, text: "Requer nível 250+" },
    cooldown: 16 * 60 * 60 * 1000,
  };
})();
