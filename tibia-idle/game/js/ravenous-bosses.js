/* ravenous-bosses.js — 4 bosses Archfoe do Lion Sanctum (categoria
 * BOSSES 1–250, últimos da lista).
 *
 * Canary 15.x (Lion Sanctum, Darashia): Katex Blood Tongue, Srezz Yellow
 * Eyes, Utua Stone Sting e Yirkas Blue Scales — os 4 Archfoe que dividem
 * a sala. Usam o MONSTERDATA importado do Canary (hp/exp/armor/defense/
 * damage/loot oficial — tabelas batendo com a wiki).
 *
 * Sala: game/maps/lion_sanctum.otbm (mesma sala da hunt Lion Sanctum).
 * Coordenadas absolutas do RME (informadas):
 *   centerroom  {1024,1027,7}
 *   playerspawn {1024,1031,7}
 *   bossspawn   {1023,1024,7}
 */
"use strict";

const RAVENOUS_ROOM = {
  otbm: "lion_sanctum",
  center: { x: 1024, y: 1027, z: 7 },
  spawn: { x: 1024, y: 1031, z: 7 },
  boss: { x: 1023, y: 1024, z: 7 },
};

/* Stats oficiais (MONSTERDATA/canary + wiki). damage/armor/defense já
 * vêm do baseMonster; repetidos aqui só para o card do modal de bosses. */
const RAVENOUS_BOSSES = [
  {
    slug: "katex-blood-tongue",
    name: "Katex Blood Tongue",
    title: "Archfoe do Lion Sanctum (werehyaena)",
    hp: 6300, exp: 5000, damage: 300, armor: 38, defense: 0,
    color: "#a04545",
  },
  {
    slug: "srezz-yellow-eyes",
    name: "Srezz Yellow Eyes",
    title: "Archfoe do Lion Sanctum (draken)",
    hp: 6200, exp: 4800, damage: 200, armor: 35, defense: 35,
    color: "#b8a24a",
  },
  {
    slug: "utua-stone-sting",
    name: "Utua Stone Sting",
    title: "Archfoe do Lion Sanctum (scorpion)",
    hp: 6400, exp: 5100, damage: 300, armor: 42, defense: 0,
    color: "#c07a3a",
  },
  {
    slug: "yirkas-blue-scales",
    name: "Yirkas Blue Scales",
    title: "Archfoe do Lion Sanctum (lizard)",
    hp: 6300, exp: 4900, damage: 100, armor: 78, defense: 78,
    color: "#4a7ab8",
  },
];

/* Itens do loot que ainda não tinham ficha no GAMEDATA.items.
 * sell/npcSell: valor oficial de NPC (TibiaWiki/canary NPCs); 0 = sem
 * comprador oficial (taming items, trophies, quest items). */
const RAVENOUS_ITEMS = {
  "werehyaena-nose":            { n: "werehyaena nose",            s: null, t: "loot", w: 1.0,  cid: 33943, sell: 220,   npcSell: 220 },
  "katex-blood":                { n: "katex' blood",             s: null, t: "loot", w: 0.7,  cid: 34100, sell: 210,   npcSell: 210 },
  "werehyaena-talisman":        { n: "werehyaena talisman",        s: null, t: "loot", w: 0.8,  cid: 33944, sell: 350,   npcSell: 350 },
  "werehyaena-trophy":          { n: "werehyaena trophy",          s: null, t: "loot", w: 5.0,  cid: 34219, sell: 0,     npcSell: 0 },
  "moonlight-crystals":         { n: "moonlight crystals",         s: null, t: "loot", w: 4.0,  cid: 22083, sell: 0,     npcSell: 0 },
  "red-silk-flower":            { n: "red silk flower",            s: null, t: "loot", w: 3.0,  cid: 34258, sell: 0,     npcSell: 0 },
  "raw-watermelon-tourmaline":  { n: "raw watermelon tourmaline",  s: null, t: "loot", w: 1.5,  cid: 33778, sell: 0,     npcSell: 0 },
  "snake-skin":                 { n: "snake skin",                 s: null, t: "loot", w: 1.0,  cid: 9694,  sell: 400,   npcSell: 400 },
  "gemmed-figurine":            { n: "gemmed figurine",            s: null, t: "loot", w: 6.5,  cid: 24392, sell: 3500,  npcSell: 3500 },
  "winged-tail":                { n: "winged tail",                s: null, t: "loot", w: 4.5,  cid: 10313, sell: 800,   npcSell: 800 },
  "srezz-eye":                  { n: "srezz' eye",                 s: null, t: "loot", w: 0.8,  cid: 34103, sell: 300,   npcSell: 300 },
  "coral-brooch":               { n: "coral brooch",               s: null, t: "loot", w: 0.8,  cid: 24391, sell: 750,   npcSell: 750 },
  "utua-s-poison":              { n: "utua's poison",              s: null, t: "loot", w: 0.8,  cid: 34101, sell: 230,   npcSell: 230 },
  "fist-on-a-stick":            { n: "fist on a stick",            s: null, t: "loot", w: 2.0,  cid: 12546, sell: 0,     npcSell: 0 },
  "blue-goanna-scale":          { n: "blue goanna scale",          s: null, t: "loot", w: 0.9,  cid: 31559, sell: 230,   npcSell: 230 },
  "yirkas-egg":                 { n: "yirkas' egg",                s: null, t: "loot", w: 2.5,  cid: 34102, sell: 280,   npcSell: 280 },
  "lizard-heart":               { n: "lizard heart",               s: null, t: "loot", w: 3.5,  cid: 31340, sell: 530,   npcSell: 530 },
  "ring-of-green-plasma": {
    n: "ring of green plasma", s: "ring", t: "accessory",
    magic: 2, hpreg: 1, mpreg: 4,
    w: 0.9, cid: 23531, lvl: 100,
    vocs: ["sorcerer", "druid", "master sorcerer", "elder druid"],
    sell: 8000, npcSell: 8000,
  },
  "warrior-s-axe": {
    n: "warrior's axe", s: "weapon", t: "axe", atk: 42, def: 21,
    w: 88, cid: 14040, lvl: 40,
    sell: 11000, npcSell: 11000,
  },
  "spellweaver-s-robe": {
    n: "spellweaver's robe", s: "armor", t: "armor", arm: 11,
    w: 23.5, cid: 10438, lvl: 60,
    vocs: ["sorcerer", "druid", "master sorcerer", "elder druid"],
    sell: 12000, npcSell: 12000,
  },
};

(function registerRavenousBosses() {
  if (typeof GAMEDATA === "undefined") return;

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  for (const b of RAVENOUS_BOSSES) {
    GAMEDATA.hunts[b.slug + "-room"] = {
      name: b.name + " Room",
      hidden: true,
      level: 150,
      minLevel: 150,
      monsters: [b.slug],
      color: b.color,
      scene: "cave",
      otbm: RAVENOUS_ROOM.otbm,
      otbmFloor: 7,
      // Sem otbmBounds: o .otbm já é o recorte da sala.
      otbmSpawn: RAVENOUS_ROOM.spawn,
      otbmMobBounds: Object.assign({ w: 1, h: 1 }, RAVENOUS_ROOM.boss),
      // Piso da sala: 923/422 = areia, 32981 = trilha do círculo interno
      // (mesma regra da hunt Lion Sanctum).
      walkFloors: [923, 422, 32981],
      avgHp: b.hp,
      avgExp: b.exp,
      avgDamage: b.damage,
      avgArmor: b.armor,
      avgGold: 500,
      respawn: 1,
      pack: 1,
      cat: "boss-room",
    };
  }

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in RAVENOUS_ITEMS) {
    if (!items[slug]) items[slug] = Object.assign({}, RAVENOUS_ITEMS[slug]);
  }

  if (typeof BOSS_DEFS === "undefined") return;
  for (const b of RAVENOUS_BOSSES) {
    BOSS_DEFS[b.slug] = {
      id: b.slug,
      name: b.name,
      title: b.title,
      hunt: b.slug + "-room",
      baseMonster: b.slug,
      sprite: b.slug,
      hp: b.hp,
      exp: b.exp,
      damage: b.damage,
      armor: b.armor,
      defense: b.defense,
      speed: 0.00005,
      requirement: {
        level: 150,
        text: "Requer nível 150+",
      },
      cooldown: typeof BOSS_COOLDOWN !== "undefined" ? BOSS_COOLDOWN : 0,
      // loot: usa o do canary (MONSTERDATA — mesma tabela da wiki).
    };
  }
})();
