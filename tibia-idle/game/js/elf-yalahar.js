/* elf-yalahar.js — HUNT ELF YALAHAR (aventureiro, nível 1–100).
 *
 * RECONSTRUIDA DO ZERO no padrão do pipeline 15.x (referência:
 * deathlings-sunken-temple.js). A versão anterior registrava a hunt sem
 * otbmFovBounds/otbmRuntime* e o mapa foi publicado com PNGs importados do
 * client 7.4 — sprites erradas em toda a sala e nenhuma animação.
 *
 * Reimportação dos assets 15.x: docs/RECRIACAO_ELF_YALAHAR.md
 * (Tibia.dat/Tibia.spr do 15.x-with-8.60 via tools/import_otbm_sprites.py;
 * validação automática em tools/test_canary_otbm.js).
 *
 * Criaturas diretas do Canary (elf / elf scout / elf arcanist) — combate,
 * loot e skills vêm de canarymonsters.json / MONSTERDATA. Nenhum item de
 * loot faltava no catálogo (verificado contra GAMEDATA.items).
 *
 * Coordenadas absolutas do RME (mapa elfyalahar.otbm, Canary RME 4, z=7):
 *   sourceBounds {1048,988}..{1069,1004}  (22×17)
 *   playerspawn  {1055,996,7}
 *   monsterradius {1052,992,7}..{1062,1000,7}
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte da hunt executa (GAMEDATA sempre existe; MISSION_DEFS não).
 */
"use strict";

const ELF_YALAHAR = {
  otbm: "elfyalahar",
  name: "Elf Yalahar",
  center: { x: 1058, y: 996, z: 7 },
  spawn: { x: 1055, y: 996, z: 7 },
  mob: { x: 1052, y: 992, w: 11, h: 9, z: 7 },
};

/* Médias das 3 criaturas do Canary: elf (100hp/42exp), elf scout (160/75),
 * elf arcanist (220/175). Gold médio ~ platinum/coins do loot comum. */
const ELF_YALAHAR_AVG = { hp: 160, exp: 97, damage: 27, armor: 9, gold: 30 };

(function registerElfYalahar() {
  if (typeof GAMEDATA === "undefined") return;
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};

  GAMEDATA.hunts["elf-yalahar"] = {
    name: ELF_YALAHAR.name,
    level: 1,
    minLevel: 1,
    cat: "aventureiro",
    pack: 4,
    monsters: ["elf", "elf-scout", "elf-arcanist"],
    color: "#5a7a4a",
    scene: "forest",
    otbm: ELF_YALAHAR.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1048, y: 988, w: 22, h: 17, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: ELF_YALAHAR.spawn,
    otbmMobBounds: ELF_YALAHAR.mob,
    avgHp: ELF_YALAHAR_AVG.hp,
    avgExp: ELF_YALAHAR_AVG.exp,
    avgDamage: ELF_YALAHAR_AVG.damage,
    avgArmor: ELF_YALAHAR_AVG.armor,
    avgGold: ELF_YALAHAR_AVG.gold,
    respawn: 1,
  };
})();
