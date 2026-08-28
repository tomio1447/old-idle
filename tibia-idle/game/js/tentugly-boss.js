/* tentugly-boss.js — Boss Tentugly (nível 150+).
 * Sala: game/maps/tentuglyroom.otbm (origem beta-maps/bossesroom/).
 * Recompensa da vitória: montaria Krakoloss para toda a conta.
 */
"use strict";

const TENTUGLY_ID = "tentugly-s-head";
const TENTUGLY_ROOM = {
  otbm: "tentuglyroom",
  name: "Tentugly's Room",
  center: { x: 1028, y: 1023, z: 7 },
  spawn: { x: 1031, y: 1026, z: 7 },
  boss: { x: 1028, y: 1023, z: 7 },
};

(function registerTentugly() {
  if (typeof GAMEDATA === "undefined") return;

  if (typeof MOBSHEETS !== "undefined" && !MOBSHEETS[TENTUGLY_ID]) {
    MOBSHEETS[TENTUGLY_ID] = { cw: 64, ch: 64, cols: 1, rows: 1 };
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["tentugly-room"] = {
    name: "Tentugly's Room",
    hidden: true,
    level: 150,
    minLevel: 150,
    monsters: [TENTUGLY_ID],
    color: "#2e4e6a",
    scene: "palace",
    otbm: TENTUGLY_ROOM.otbm,
    otbmFloor: 7,
    otbmBounds: { x: 1020, y: 1019, w: 21, h: 13, z: 7 },
    otbmSpawn: TENTUGLY_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, TENTUGLY_ROOM.boss),
    avgHp: 75000,
    avgExp: 40000,
    avgDamage: 2000,
    avgArmor: 60,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;
  BOSS_DEFS[TENTUGLY_ID] = {
    id: TENTUGLY_ID,
    name: "Tentugly's Head",
    title: "Boss do Kraken",
    hunt: "tentugly-room",
    sprite: TENTUGLY_ID,
    baseMonster: TENTUGLY_ID,
    hp: 75000,
    exp: 40000,
    damage: 2000,
    armor: 60,
    defense: 60,
    speed: 0.00006,
    loot: [],
    requirement: { level: 150, text: "Requer nível 150+ (A Pirate's Tail)" },
    cooldown: 16 * 60 * 60 * 1000,
    accountMount: "krakoloss",
  };
})();
