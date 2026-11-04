"use strict";

const GRIMVALE_BOSS_IDS = ["black-vixen", "bloodback", "darkfang", "shadowpelt", "sharpclaw"];
const GRIMVALE_BOSS_ITEMS = { "wolf-trophy": { n: "wolf trophy", s: null, t: "loot", w: 5, cid: 7394, sell: 3000, npcSell: 3000 } };
const GRIMVALE_BOSS_MISSIONS = {
  "grimvale-1st-floor": { werefox: 250, werebadger: 250, werewolf: 250 },
  "grimvale-2nd-floor": { wereboar: 500, werebear: 500 },
};
const GRIMVALE_BOSS_ROOM = {
  hidden: true, level: 100, minLevel: 100, pack: 1, packMin: 1, packMax: 1,
  color: "#66533e", scene: "cave", cat: "boss-room", otbm: "grimvaleboss", otbmFloor: 7,
  otbmFovBounds: { x: 1015, y: 1016, w: 22, h: 22, z: 7 },
  otbmRuntimeWidth: 25, otbmRuntimeHeight: 23, otbmOffsetX: 1, otbmOffsetY: 1,
  otbmFovWidth: 21, otbmFovHeight: 17,
  otbmSpawn: { x: 1023, y: 1028, z: 7 },
  otbmMobBounds: { x: 1026, y: 1021, w: 1, h: 1, z: 7 }, respawn: 1,
};

function grimvaleBossAccessError(account, level) {
  if (!(Number(level) >= 100)) return "Requer nível 100+.";
  let missions = account && account.missions;
  if (typeof missions === "string") { try { missions = JSON.parse(missions); } catch (e) { missions = {}; } }
  for (const [id, targets] of Object.entries(GRIMVALE_BOSS_MISSIONS)) {
    const progress = missions && missions[id] && missions[id].progress;
    for (const [monster, target] of Object.entries(targets))
      if (!progress || !(Number(progress[monster]) >= target))
        return "Conclua as duas missões de Grimvale na conta (" + monster + ": " + (Number(progress && progress[monster]) || 0) + "/" + target + ").";
  }
  return null;
}

function grimvaleBossRooms(monsters) {
  const rooms = {};
  for (const id of GRIMVALE_BOSS_IDS) {
    const monster = monsters[id];
    if (!monster) continue;
    rooms["grimvale-" + id + "-room"] = Object.assign({}, GRIMVALE_BOSS_ROOM, {
      name: monster.name + " Room", monsters: [id],
      avgHp: monster.hp, avgExp: monster.exp, avgDamage: monster.damage, avgArmor: monster.armor,
    });
  }
  return rooms;
}

(function registerGrimvaleBosses() {
  if (typeof GAMEDATA === "undefined") return;
  const monsters = typeof MONSTERDATA !== "undefined" ? MONSTERDATA : GAMEDATA.monsters || {};
  Object.assign(GAMEDATA.hunts || (GAMEDATA.hunts = {}), grimvaleBossRooms(monsters));
  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const [slug, def] of Object.entries(GRIMVALE_BOSS_ITEMS))
    items[slug] = Object.assign({}, items[slug] || {}, def);
  if (typeof BOSS_DEFS === "undefined") return;
  for (const id of GRIMVALE_BOSS_IDS) {
    const monster = monsters[id];
    if (!monster) continue;
    BOSS_DEFS[id] = {
      id, name: monster.name, title: "Grimvale Bosses (100+)",
      hunt: "grimvale-" + id + "-room", baseMonster: id, sprite: id, mult: 1,
      hp: monster.hp, exp: monster.exp, damage: monster.damage, armor: monster.armor, defense: monster.defense,
      resist: Object.assign({}, monster.resist), loot: monster.loot,
      cooldown: typeof BOSS_COOLDOWN !== "undefined" ? BOSS_COOLDOWN : 16 * 60 * 60 * 1000,
      requirement: { level: 100, missions: Object.keys(GRIMVALE_BOSS_MISSIONS), enforced: true,
        text: "Requer nível 100+ e as duas missões de Grimvale completas na conta." },
    };
  }
})();

if (typeof module !== "undefined" && module.exports)
  module.exports = { ids: GRIMVALE_BOSS_IDS, items: GRIMVALE_BOSS_ITEMS, missions: GRIMVALE_BOSS_MISSIONS, room: GRIMVALE_BOSS_ROOM,
    createRooms: grimvaleBossRooms, accessError: grimvaleBossAccessError };
