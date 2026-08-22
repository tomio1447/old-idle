/* doctor-marrow.js — Boss Doctor Marrow (Cradle of Monsters, nível 250+).
 *
 * Boss simples (sem mecânica própria), ficha da TibiaWiki:
 *   - Físico: corpo a corpo (0–2900)
 *   - Energy: Energy Chain (400–1500)
 * A sala foi mapeada em doctormarrow_room.otbm.
 * Outfit Canary looktype 1611: lookHead 57, lookBody 0, lookLegs 0, lookFeet 95
 * (cabelo cinza, jaleco branco, sapatos escuros — aplicados no sheet).
 * O loot é importado do The Monster (criatura final da luta).
 * Cooldown oficial: 16h (aplicado quando BOSS_COOLDOWNS_ENABLED for ligado).
 */
"use strict";

const DOCTOR_MARROW_COOLDOWN_MS = 16 * 60 * 60 * 1000;

const DOCTOR_MARROW_ROOM = {
  otbm: "doctormarrow_room",
  name: "Doctor Marrow Room",
  center: { x: 1074, y: 1001, z: 7 },
  spawn: { x: 1069, y: 1001, z: 7 },   // playerspawn
  boss:  { x: 1078, y: 1001, z: 7 },   // bossspawn
};

const DOCTOR_MARROW_STATS = {
  name: "Doctor Marrow",
  hp: 120000,
  exp: 30000,
  damage: 2900,
  armor: 59,
  defense: 54,
};

/* Itens do loot do The Monster que faltavam no catálogo do jogo
 * (usados no boss modal e no Sell All online). */
const DOCTOR_MARROW_LOOT_ITEMS = {
  "ultimate-spirit-potion":    { n: "ultimate spirit potion", s: null, t: "loot", cid: 23374, w: 3.10, sell: 0, npcSell: 0 },
  "raw-watermelon-tourmaline": { n: "raw watermelon tourmaline", s: null, t: "loot", cid: 33778, w: 1.50, sell: 0, npcSell: 0 },
  "alchemist-s-notepad":       { n: "alchemist's notepad", s: "shield", t: "shield", cid: 40594, w: 1.30, def: 20, sell: 0, npcSell: 0 },
  "antler-horn-helmet":        { n: "antler-horn helmet", s: "helmet", t: "armor", cid: 40588, w: 22.00, arm: 9, sell: 0, npcSell: 0 },
  "mutant-bone-kilt":          { n: "mutant bone kilt", s: "legs", t: "armor", cid: 40595, w: 35.00, arm: 8, sell: 0, npcSell: 0 },
  "mutated-skin-armor":        { n: "mutated skin armor", s: "armor", t: "armor", cid: 40591, w: 63.00, arm: 17, sell: 0, npcSell: 0 },
  "mutated-skin-legs":         { n: "mutated skin legs", s: "legs", t: "armor", cid: 40590, w: 52.00, arm: 9, sell: 0, npcSell: 0 },
  "stitched-mutant-hide-legs": { n: "stitched mutant hide legs", s: "legs", t: "armor", cid: 40589, w: 34.00, arm: 9, sell: 0, npcSell: 0 },
  "alchemist-s-boots":         { n: "alchemist's boots", s: "feet", t: "armor", cid: 40592, w: 16.00, arm: 2, sell: 0, npcSell: 0 },
  "mutant-bone-boots":         { n: "mutant bone boots", s: "feet", t: "armor", cid: 40593, w: 11.00, arm: 2, sell: 0, npcSell: 0 },
  "mutant-hide-trousers":      { n: "mutant hide trousers", s: "legs", t: "armor", cid: 50184, w: 33.00, arm: 6, sell: 0, npcSell: 0 },
};

(function registerDoctorMarrow() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in DOCTOR_MARROW_LOOT_ITEMS) {
    const def = DOCTOR_MARROW_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.s != null && items[slug].s == null) items[slug].s = def.s;
      if (def.t != null && items[slug].t == null) items[slug].t = def.t;
      if (def.arm != null && items[slug].arm == null) items[slug].arm = def.arm;
      if (def.def != null && items[slug].def == null) items[slug].def = def.def;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["doctor-marrow-room"] = {
    name: DOCTOR_MARROW_ROOM.name,
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: ["doctor-marrow"],
    color: "#5d4037",
    scene: "crypt",
    otbm: DOCTOR_MARROW_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: DOCTOR_MARROW_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, DOCTOR_MARROW_ROOM.boss),
    avgHp: DOCTOR_MARROW_STATS.hp,
    avgExp: DOCTOR_MARROW_STATS.exp,
    avgDamage: DOCTOR_MARROW_STATS.damage,
    avgArmor: DOCTOR_MARROW_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  BOSS_DEFS["doctor-marrow"] = {
    id: "doctor-marrow",
    name: DOCTOR_MARROW_STATS.name,
    title: "Boss Cradle of Monsters",
    hunt: "doctor-marrow-room",
    baseMonster: "doctor-marrow",
    sprite: "doctor-marrow",
    hp: DOCTOR_MARROW_STATS.hp,
    exp: DOCTOR_MARROW_STATS.exp,
    damage: DOCTOR_MARROW_STATS.damage,
    armor: DOCTOR_MARROW_STATS.armor,
    defense: DOCTOR_MARROW_STATS.defense,
    speed: 0.00007,
    requirement: {
      level: 250,
      text: "Requer nível 250+",
    },
    cooldown: DOCTOR_MARROW_COOLDOWN_MS,
    // Loot importado do The Monster (recompensa oficial da luta).
    loot: [
      { item: "platinum-coin", chance: 100, max: 1 },
      { item: "red-gem", chance: 35.542, max: 2 },
      { item: "ultimate-health-potion", chance: 27, max: 1 },
      { item: "ultimate-mana-potion", chance: 24.3, max: 1 },
      { item: "ultimate-spirit-potion", chance: 25.75, max: 1 },
      { item: "mastermind-potion", chance: 23.2, max: 1 },
      { item: "transcendence-potion", chance: 23.2, max: 1 },
      { item: "berserk-potion", chance: 24.8, max: 1 },
      { item: "bullseye-potion", chance: 23.5, max: 1 },
      { item: "yellow-gem", chance: 26.2, max: 1 },
      { item: "blue-gem", chance: 25.1, max: 1 },
      { item: "green-gem", chance: 24.6, max: 1 },
      { item: "violet-gem", chance: 25.35, max: 1 },
      { item: "giant-amethyst", chance: 4.3, max: 1 },
      { item: "giant-topaz", chance: 4.6, max: 1 },
      { item: "giant-emerald", chance: 4.5, max: 1 },
      { item: "raw-watermelon-tourmaline", chance: 0.9, max: 1 },
      { item: "alchemist-s-notepad", chance: 0.42, max: 1 },
      { item: "antler-horn-helmet", chance: 0.39, max: 1 },
      { item: "mutant-bone-kilt", chance: 0.45, max: 1 },
      { item: "mutated-skin-armor", chance: 0.43, max: 1 },
      { item: "mutated-skin-legs", chance: 0.41, max: 1 },
      { item: "stitched-mutant-hide-legs", chance: 0.44, max: 1 },
      { item: "alchemist-s-boots", chance: 0.46, max: 1 },
      { item: "mutant-bone-boots", chance: 0.4, max: 1 },
      { item: "mutant-hide-trousers", chance: 0.4, max: 1 },
    ],
  };
})();
