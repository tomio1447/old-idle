/* leiden.js — Boss Leiden (categoria BOSSES 1–250).
 *
 * BOSS SIMPLES (mecânica removida a pedido do jogador): usa o monstro base
 * do Canary (monsterdata.js / canarymonsters.json) apenas para stats
 * (hp/exp/dano/armor/defense) — sem skills, sem absorbs, sem summon.
 * Loot: o Canary não tem loot registrado para o Leiden (wiki sem dados);
 * mantemos só moedas (platinum/gold) como recompensa do range 150+.
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

/* Loot do Leiden = mesmo do Ravenous Hunger (canarymonsters.json). */
const LEIDEN_LOOT = [
  { item: "bed-of-nails", chance: 67, max: 1 },
  { item: "small-sapphire", chance: 21, max: 10 },
  { item: "great-spirit-potion", chance: 33.23, max: 5 },
  { item: "yellow-gem", chance: 12, max: 1 },
  { item: "giant-shimmering-pearl", chance: 5, max: 1 },
  { item: "platinum-coin", chance: 68.299, max: 30 },
  { item: "lightning-legs", chance: 18, max: 1 },
  { item: "sacred-tree-amulet", chance: 15, max: 1 },
  { item: "wood-cape", chance: 9, max: 1 },
  { item: "gold-token", chance: 1.532, max: 1 },
  { item: "gold-coin", chance: 100, max: 200 },
  { item: "small-emerald", chance: 19, max: 10 },
  { item: "great-mana-potion", chance: 31.23, max: 5 },
  { item: "red-gem", chance: 12, max: 1 },
  { item: "oriental-shoes", chance: 11, max: 1 },
  { item: "torn-shirt", chance: 42, max: 1 },
  { item: "fig-leaf", chance: 32, max: 1 },
  { item: "luminous-orb", chance: 35, max: 1 },
  { item: "wooden-spellbook", chance: 4.5, max: 1 },
  { item: "elven-legs", chance: 16, max: 1 },
  { item: "small-diamond", chance: 21, max: 10 },
  { item: "ultimate-health-potion", chance: 28.23, max: 5 },
  { item: "energy-bar", chance: 53, max: 5 },
  { item: "green-gem", chance: 12, max: 1 },
  { item: "broken-key-ring", chance: 4, max: 1 },
  { item: "muck-rod", chance: 10, max: 1 },
  { item: "mysterious-remains", chance: 100, max: 1 },
  { item: "cobra-crown", chance: 0.4, max: 1 },
  { item: "silver-token", chance: 2.5, max: 1 },
  { item: "elven-mail", chance: 3, max: 1 },
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

  /* Registra nomes/pesos dos itens novos do Ravenous Hunger que ainda não
   * possuem sprite, para que tooltips e Loot Pouch funcionem corretamente. */
  const items = GAMEDATA.items || (GAMEDATA.items = {});
  const LEIDEN_ITEMS = {
    "bed-of-nails":        { n: "Bed of Nails",        w: 2.50 },
    "gold-token":            { n: "Gold Token",          w: 0.20 },
    "torn-shirt":            { n: "Torn Shirt",          w: 1.10 },
    "fig-leaf":              { n: "Fig Leaf",            w: 0.90 },
    "luminous-orb":          { n: "Luminous Orb",        w: 0.94 },
    "broken-key-ring":       { n: "Broken Key Ring",     w: 0.80 },
    "mysterious-remains":    { n: "Mysterious Remains",  w: 30.00 },
  };
  for (const slug in LEIDEN_ITEMS) {
    if (!items[slug]) items[slug] = Object.assign({}, LEIDEN_ITEMS[slug]);
  }
})();
