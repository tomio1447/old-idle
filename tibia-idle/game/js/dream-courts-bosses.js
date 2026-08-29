"use strict";

const PLAGUEROOT_ID = "plagueroot";
const PLAGUEROOT_ROOM = {
  otbm: "plagueroot",
  center: { x: 32208, y: 32048, z: 14 },
  boss: { x: 32208, y: 32045, z: 14 },
  spawn: { x: 32208, y: 32054, z: 14 },
};

(function registerPlagueroot() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.items) GAMEDATA.items = {};
  const lootItems = {
    "huge-chunk-of-crude-iron": { n: "huge chunk of crude iron", s: null, t: "loot", cid: 5892, sell: 15000, npcSell: 15000 },
    "crunor-idol": { n: "crunor idol", s: null, t: "loot", cid: 30055, sell: 30000, npcSell: 30000 },
    "plagueroot-offshoot": { n: "plagueroot offshoot", s: null, t: "loot", cid: 30087, sell: 280000, npcSell: 280000 },
    "soul-stone": { n: "soul stone", s: null, t: "loot", cid: 5809, sell: 6000, npcSell: 6000 },
    "pomegranate": { n: "pomegranate", s: null, t: "loot", cid: 30169, sell: 0, npcSell: 0 },
    "turquoise-tendril-lantern": { n: "turquoise tendril lantern", s: null, t: "loot", cid: 30170, sell: 0, npcSell: 0 },
    "living-vine-bow": { sell: 0, npcSell: 0 },
    "living-armor": { sell: 0, npcSell: 0 },
    "magic-sulphur": { sell: 8000, npcSell: 8000 },
    "chaos-mace": { sell: 9000, npcSell: 9000 },
    "ring-of-the-sky": { sell: 30000, npcSell: 30000 },
    "abyss-hammer": { sell: 20000, npcSell: 20000 },
    "arcane-staff": { sell: 42000, npcSell: 42000 },
    "alptramun-s-toothbrush": { n: "Alptramun's toothbrush", s: null, t: "loot", cid: 29943, sell: 270000, npcSell: 270000 },
    "izcandar-s-snow-globe": { n: "Izcandar's snow globe", s: null, t: "loot", cid: 29944, sell: 180000, npcSell: 180000 },
    "izcandar-s-sundial": { n: "Izcandar's sundial", s: null, t: "loot", cid: 29945, sell: 225000, npcSell: 225000 },
    "maxxenius-head": { n: "Maxxenius head", s: null, t: "loot", cid: 29942, sell: 500000, npcSell: 500000 },
    "ornate-locket": { n: "ornate locket", s: "amulet", t: "amulet", cid: 30056, sell: 18000, npcSell: 18000 },
    "purple-tendril-lantern": { n: "purple tendril lantern", s: null, t: "loot", cid: 30171, sell: 0, npcSell: 0 },
    "summerblade": { n: "summerblade", s: "weapon", t: "sword", cid: 29421, w: 43.00, sell: 0, npcSell: 0, atk: 10, def: 20, lvl: 200, imbSlots: 2 },
    "winterblade": { n: "winterblade", s: "weapon", t: "sword", cid: 29422, w: 43.00, sell: 0, npcSell: 0, atk: 10, def: 22, lvl: 200, imbSlots: 2 },
  };
  for (const slug in lootItems) {
    const def = lootItems[slug];
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = Object.assign({ s: null, t: "loot" }, def);
    else {
      GAMEDATA.items[slug].sell = def.sell;
      GAMEDATA.items[slug].npcSell = def.npcSell;
      if (def.cid != null && GAMEDATA.items[slug].cid == null) GAMEDATA.items[slug].cid = def.cid;
    }
  }
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["plagueroot-room"] = {
    name: "Plagueroot's Room", hidden: true, level: 200, minLevel: 200,
    monsters: [PLAGUEROOT_ID], color: "#405b39", scene: "forest",
    otbm: PLAGUEROOT_ROOM.otbm, otbmFloor: 14,
    otbmBounds: { x: 32198, y: 32042, w: 21, h: 13, z: 14 },
    otbmSpawn: PLAGUEROOT_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, PLAGUEROOT_ROOM.boss),
    avgHp: 320000, avgExp: 55000, avgDamage: 1050,
    avgArmor: 60, avgGold: 100, respawn: 1, pack: 1, cat: "boss-room",
  };
  if (typeof BOSS_DEFS === "undefined") return;
  BOSS_DEFS[PLAGUEROOT_ID] = {
    id: PLAGUEROOT_ID, name: "Plagueroot", title: "Dream Courts",
    hunt: "plagueroot-room", sprite: PLAGUEROOT_ID, baseMonster: PLAGUEROOT_ID,
    hp: 320000, exp: 55000, damage: 1050, armor: 60, defense: 60,
    speed: 0.000055, loot: [],
    requirement: { level: 200, text: "Requer nível 200+" },
    cooldown: 16 * 60 * 60 * 1000,
  };

  const banishedLoot = (GAMEDATA.monsters && GAMEDATA.monsters["izcandar-the-banished"] &&
    GAMEDATA.monsters["izcandar-the-banished"].loot) ||
    (typeof MONSTERDATA !== "undefined" && MONSTERDATA["izcandar-the-banished"] &&
      MONSTERDATA["izcandar-the-banished"].loot) || [];
  const summerLoot = banishedLoot.filter((l) => l.item !== "winterblade");
  const winterLoot = banishedLoot.filter((l) => l.item !== "summerblade");
  const bosses = {
    alptramun: { name: "Alptramun", map: "alptramun", hp: 320000, exp: 55000, damage: 1000, armor: 60, defense: 60 },
    "izcandar-champion-of-summer": { name: "Izcandar Champion of Summer", map: "izcandar_the_banished", hp: 130000, exp: 6900, damage: 750, armor: 76, defense: 76, loot: summerLoot },
    "izcandar-champion-of-winter": { name: "Izcandar Champion of Winter", map: "izcandar_the_banished", hp: 130000, exp: 6900, damage: 750, armor: 76, defense: 76, loot: winterLoot },
    "malofur-mangrinder": { name: "Malofur Mangrinder", map: "malofur_mangrinder", hp: 320000, exp: 55000, damage: 5500, armor: 60, defense: 60 },
    maxxenius: { name: "Maxxenius", map: "maxxenius", hp: 320000, exp: 55000, damage: 1000, armor: 60, defense: 60 },
  };
  const room = {
    bounds: { x: 32197, y: 32037, w: 21, h: 23, z: 14 },
    boss: { x: 32207, y: 32045, w: 1, h: 1, z: 14 },
    spawn: { x: 32207, y: 32054, z: 14 },
  };
  for (const id in bosses) {
    const def = bosses[id];
    const huntId = `${id}-room`;
    if (def.loot && GAMEDATA.monsters && GAMEDATA.monsters[id]) GAMEDATA.monsters[id].loot = def.loot.slice();
    GAMEDATA.hunts[huntId] = {
      name: `${def.name}'s Room`, hidden: true, level: 200, minLevel: 200,
      monsters: [id], color: "#405b39", scene: "forest",
      otbm: def.map, otbmFloor: 14, otbmBounds: room.bounds,
      otbmSpawn: room.spawn, otbmMobBounds: room.boss,
      avgHp: def.hp, avgExp: def.exp, avgDamage: def.damage,
      avgArmor: def.armor, avgGold: 100, respawn: 1, pack: 1, cat: "boss-room",
    };
    BOSS_DEFS[id] = {
      id, name: def.name, title: "Dream Courts", hunt: huntId,
      sprite: id, baseMonster: id, hp: def.hp, exp: def.exp,
      damage: def.damage, armor: def.armor, defense: def.defense,
      speed: 0.000055, loot: def.loot ? def.loot.slice() : [],
      requirement: { level: 200, text: "Requer nível 200+" },
      cooldown: 16 * 60 * 60 * 1000,
    };
  }
})();
