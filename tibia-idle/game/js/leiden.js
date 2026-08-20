/* leiden.js — Boss Leiden (categoria BOSSES 1–250).
 *
 * Boss simples sem mecânica própria: usa o monstro base do Canary
 * (monsterdata.js) para skills, resistências e loot. Stats customizados
 * para o range 150+ (HP reduzido, exp ajustada).
 *
 * Coordenadas absolutas do RME:
 *   centerroom  {1060,1003,7}
 *   playerspawn {1060,1007,7}
 *   bossspawn   {1061,998,7}
 */
"use strict";

const LEIDEN_ROOM = {
  otbm: "leidenroom",
  name: "Leiden Room",
  center: { x: 1060, y: 1003, z: 7 },
  spawn: { x: 1060, y: 1007, z: 7 },
  boss:  { x: 1061, y: 998, z: 7 },
};

/* Stats ajustados para um boss de entrada (150+). Base Canary: 30.000 HP,
 * 0 exp, 400 dano, 35 armor, 50 defense. Aqui reduzimos HP e dano para o
 * range 1–250 e damos exp compatível com o risco. */
const LEIDEN_STATS = {
  name: "Leiden",
  hp: 30000,
  exp: 15000,
  damage: 350,
  armor: 30,
  defense: 45,
};

/* Loot básico do boss (Canary original não tem loot na forma Leiden;
 * adicionamos recompensa em moedas para o range 150+). */
const LEIDEN_LOOT = [
  { item: "platinum-coin", chance: 80, max: 10 },
  { item: "gold-coin", chance: 60, max: 50 },
];

(function registerLeiden() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["leiden-room"] = {
    name: LEIDEN_ROOM.name,
    hidden: true,
    level: 150,
    minLevel: 150,
    monsters: ["leiden"],
    color: "#5a4a3a",
    scene: "cave",
    otbm: LEIDEN_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: LEIDEN_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, LEIDEN_ROOM.boss),
    avgHp: LEIDEN_STATS.hp,
    avgExp: LEIDEN_STATS.exp,
    avgDamage: LEIDEN_STATS.damage,
    avgArmor: LEIDEN_STATS.armor,
    avgGold: 500,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  BOSS_DEFS["leiden"] = {
    id: "leiden",
    name: LEIDEN_STATS.name,
    title: "Boss da Sede Voraz",
    hunt: "leiden-room",
    baseMonster: "leiden",
    sprite: "leiden",
    hp: LEIDEN_STATS.hp,
    exp: LEIDEN_STATS.exp,
    damage: LEIDEN_STATS.damage,
    armor: LEIDEN_STATS.armor,
    defense: LEIDEN_STATS.defense,
    speed: 0.00005,
    requirement: {
      level: 150,
      text: "Requer nível 150+",
    },
    cooldown: 0,
    loot: LEIDEN_LOOT,
  };
})();
