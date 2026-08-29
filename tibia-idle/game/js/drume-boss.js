/* Drume — boss "The Order of the Lion" (nível 250+).
 * Sala: game/maps/drumeroom.otbm.
 * Mecânica: invoca até 7 Usurper Archers, Knights ou Warlocks. */
"use strict";

(function registerDrume() {
  if (typeof GAMEDATA === "undefined") return;
  if (typeof BOSS_DEFS === "undefined") return;
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  const DRUME_ID = "drume";
  const DRUME_ROOM = {
    otbm: "drumeroom",
    bounds: { x: 1008, y: 1015, w: 26, h: 24, z: 7 },
    spawn: { x: 1021, y: 1032, z: 7 },
    boss: { x: 1021, y: 1027, w: 1, h: 1, z: 7 },
  };

  GAMEDATA.hunts["drume-room"] = {
    name: "Drume's Room", hidden: true, level: 250, minLevel: 250,
    monsters: [DRUME_ID], color: "#5a4a3a", scene: "fortress",
    otbm: DRUME_ROOM.otbm, otbmFloor: 7, otbmBounds: DRUME_ROOM.bounds,
    otbmSpawn: DRUME_ROOM.spawn, otbmMobBounds: DRUME_ROOM.boss,
    avgHp: 80000, avgExp: 25000, avgDamage: 1100,
    avgArmor: 82, avgGold: 100, respawn: 1, pack: 1, cat: "boss-room",
  };

  BOSS_DEFS[DRUME_ID] = {
    id: DRUME_ID, name: "Drume", title: "Order of the Lion",
    hunt: "drume-room", sprite: DRUME_ID, baseMonster: DRUME_ID,
    hp: 80000, exp: 25000, damage: 1100, armor: 82, defense: 60,
    speed: 0.000055, loot: [],
    requirement: { level: 250, text: "Requer nível 250+" },
    cooldown: 16 * 60 * 60 * 1000,
  };

  const summonSkill = {
    n: "drume summon", ch: 100, int: 10000,
    summonSlugs: ["usurper-archer", "usurper-knight", "usurper-warlock"],
    summonCount: 1, summonMax: 7,
  };

  const drumeDef = (GAMEDATA.monsters && GAMEDATA.monsters[DRUME_ID]) ||
                   (typeof MONSTERDATA !== "undefined" && MONSTERDATA[DRUME_ID]) ||
                   null;
  if (drumeDef && Array.isArray(drumeDef.skills)) {
    drumeDef.skills.push(summonSkill);
    // Se GAMEDATA.monsters for uma cópia distinta, reflete também.
    if (GAMEDATA.monsters && GAMEDATA.monsters[DRUME_ID] &&
        GAMEDATA.monsters[DRUME_ID] !== drumeDef &&
        Array.isArray(GAMEDATA.monsters[DRUME_ID].skills)) {
      GAMEDATA.monsters[DRUME_ID].skills.push(summonSkill);
    }
  }
})();
