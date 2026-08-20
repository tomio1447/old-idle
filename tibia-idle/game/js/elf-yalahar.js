/* elf-yalahar.js — Hunt de Elfs em Yalahar (nível 1-100). */
"use strict";

const ELF_YALAHAR = {
  otbm: "elfyalahar",
  name: "Elf Yalahar",
  center: { x: 1058, y: 996, z: 7 },
  spawn: { x: 1055, y: 996, z: 7 },
  mob: { x: 1052, y: 992, w: 11, h: 9, z: 7 },
};

/* Médias dos 3 elfs (Elf, Elf Scout, Elf Arcanist). */
const ELF_YALAHAR_AVG = { hp: 160, exp: 97, damage: 27, armor: 9, gold: 30 };

(function registerElfYalahar() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["elf-yalahar"] = {
    name: ELF_YALAHAR.name,
    level: 1,
    minLevel: 1,
    monsters: ["elf", "elf-scout", "elf-arcanist"],
    color: "#5a7a4a",
    scene: "forest",
    otbm: ELF_YALAHAR.otbm,
    otbmFloor: 7,
    otbmSpawn: ELF_YALAHAR.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, ELF_YALAHAR.mob),
    avgHp: ELF_YALAHAR_AVG.hp,
    avgExp: ELF_YALAHAR_AVG.exp,
    avgDamage: ELF_YALAHAR_AVG.damage,
    avgArmor: ELF_YALAHAR_AVG.armor,
    avgGold: ELF_YALAHAR_AVG.gold,
    respawn: 1,
    pack: 4,
    cat: "hunt",
    party: true,
  };
})();
