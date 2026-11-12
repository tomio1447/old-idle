/* sugar-mommy.js — BOSS Sugar Mommy (BOSSES 1–250).
 * Sala: game/maps/sugar_mommy_room.otbm (37×29, z=7 — câmara de doces de
 * Candia, mesmo layout da sala do Sugar Daddy).
 * Stats do canary (MONSTERDATA): hp 6.000 / exp 6.800. Drops: a pedido do
 * jogador, a Mommy entrega a MESMA tabela do Sugar Daddy — o loot é
 * clonado do MONSTERDATA["sugar-daddy"] e declarado em BOSS_DEFS.loot,
 * que tem prioridade sobre o loot do monstro base (server/cliente).
 * Spawns: mesmas células caminháveis do layout compartilhado.
 */
"use strict";

(function registerSugarMommy() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.items = GAMEDATA.items || {};
  window.BOSS_DEFS = window.BOSS_DEFS || {};
  const BOSS_DEFS = window.BOSS_DEFS;

  /* Clone da tabela de loot do Sugar Daddy (itens já registrados por
   * sugar-daddy.js — manter a ordem de carga dos <script>). */
  const daddyLoot = (typeof MONSTERDATA !== "undefined" &&
    MONSTERDATA["sugar-daddy"] && MONSTERDATA["sugar-daddy"].loot) || [];
  const loot = daddyLoot.map((e) => Object.assign({}, e));

  const ROOM = {
    spawn: { x: 1027, y: 1038, z: 7 },  // playerspawn — sul da arena
    boss: { x: 1027, y: 1029, z: 7 },   // bossspawn — centro da sala
  };
  GAMEDATA.hunts["sugar-mommy-room"] = {
    name: "Sugar Mommy Room",
    level: 150,
    minLevel: 150,
    cat: "boss-room",
    hidden: true,
    pack: 1,
    monsters: ["sugar-mommy"],
    spawnWeights: { "sugar-mommy": 100 },
    color: "#8a5a8a",
    scene: "fey",
    otbm: "sugar_mommy_room",
    otbmFloor: 7,
    otbmSpawn: ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, ROOM.boss),
    // Pisos de doces da sala (1209x, 448xx, 4822x-4823x) — caminháveis.
    walkFloors: [12090, 12091, 12092, 12093, 12095, 44805, 44826,
      48228, 48229, 48230, 48231, 48232, 48233],
    respawn: 0,
  };

  BOSS_DEFS["sugar-mommy"] = {
    id: "sugar-mommy",
    name: "Sugar Mommy",
    title: "Boss de Candia",
    hunt: "sugar-mommy-room",
    baseMonster: "sugar-mommy",
    sprite: "sugar-mommy",
    mult: 1,
    loot: loot,
    requirement: { level: 150, text: "Requer nível 150+ (BOSSES 1–250)" },
    cooldown: typeof BOSS_COOLDOWN !== "undefined" ? BOSS_COOLDOWN : 16 * 60 * 60 * 1000,
  };
})();
