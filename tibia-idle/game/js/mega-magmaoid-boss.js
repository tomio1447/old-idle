/* mega-magmaoid-boss.js — Boss The Mega Magmaoid (nível 250+).
 *
 * BOSS SIMPLES (sem mecânica — sala de boss igual ao Brainstealer):
 * ficha oficial (tibia.gg / TibiaWiki; boss Archfoe do update 12.70,
 * "Too Hot to Handle", Dwelling of the Forgotten, cooldown 20h):
 * hp 104.000, exp 80.000, raceId 2060, looktype 1413 — o MESMO outfit
 * do Magma Bubble, por isso assets/mob/the-mega-magmaoid.png é cópia da
 * sheet do magma-bubble. Ausente do dump Canary: o monstro é registrado
 * aqui (cliente) e via module.exports.registerMonsters (servidor —
 * mesmo padrão do true-asuras.js / mimar-haffar.js). A entrada em
 * game/data/canarymonsters.json existe pro filtro MONSTERS[slug].boss
 * do DAILY_BOSS_POOL.
 *
 * Resistências oficiais (dano recebido): earth 0% (imune → earth:100),
 * fire −600% (CURA — o motor não suporta cura por elemento; aproximado
 * como imune fire:100), energy 90% (→ energy:10), death 110%
 * (→ death:-10); physical/ice/holy neutros. Atravessa campos de
 * fire/energy/earth, sente invisível, imune a paralisia.
 *
 * Skills no molde do kit do magma-bubble do dump, escalado para um boss
 * 250+ de 104k hp (fire alvo ~500-800 r8, wave ~800-1400, UE ~600-1100,
 * cura ~300-800). Oficialmente ele ainda solta uma explosão "DOOM" de
 * fire compartilhada (≤5k) e uma explosão de morte — NÃO implementados:
 * é um boss-room simples como o Brainstealer.
 *
 * Loot: tabela oficial do The Mega Magmaoid — idêntica à do The
 * Brainstealer (35 entradas do dump, chances/max inclusos). Todos os
 * itens já existem no catálogo via brainstealer-boss.js — nenhum item
 * novo é registrado.
 *
 * Coordenadas absolutas do RME (sala mega_magmaoid.otbm, 31×29 z=7,
 * bounds 1012..1042 × 1017..1045 — o .otbm já é o recorte da sala):
 *   bossspawn   {1025,1027,7} → local (13,10)
 *   playerspawn {1026,1032,7} → local (14,15)
 * Ambas caminháveis e conectadas no componente de 240 sqm.
 */
"use strict";

const MEGA_MAGMAOID_ID = "the-mega-magmaoid";

/* Cooldown oficial: 20h (tibia.gg) — NÃO é o 16h custom do Brainstealer. */
const MEGA_MAGMAOID_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const MEGA_MAGMAOID_ROOM = {
  otbm: "mega_magmaoid",
  name: "The Mega Magmaoid's Room",
  center: { x: 1027, y: 1031, z: 7 },
  spawn: { x: 1026, y: 1032, z: 7 },   // playerspawn
  boss:  { x: 1025, y: 1027, z: 7 },   // bossspawn
};

const MEGA_MAGMAOID_STATS = {
  name: "The Mega Magmaoid",
  hp: 104000,
  exp: 80000,
  damage: 800,
  armor: 60,
  defense: 60,
};

/* The Mega Magmaoid — boss oficial (update 12.70) ausente do dump
 * Canary. Looktype 1413 = o mesmo do Magma Bubble (sheet reutilizada,
 * copiada para assets/mob/the-mega-magmaoid.png). Loot = a tabela do
 * The Brainstealer do dump — drops oficiais idênticos (TibiaWiki). */
const MEGA_MAGMAOID = {
  name: MEGA_MAGMAOID_STATS.name,
  boss: 1,
  hp: MEGA_MAGMAOID_STATS.hp,
  exp: MEGA_MAGMAOID_STATS.exp,
  speed: 100,
  armor: MEGA_MAGMAOID_STATS.armor,
  defense: MEGA_MAGMAOID_STATS.defense,
  damage: MEGA_MAGMAOID_STATS.damage,
  element: "fire",
  attackSpeed: 2000,
  mitigation: 2,
  /* Oficial: fire CURA (−600% de dano recebido). Como o motor não tem
   * cura-por-elemento, fica imune (fire:100). earth 0% → 100,
   * energy 90% → 10, death 110% → -10. */
  resist: {
    earth: 100,
    fire: 100,
    energy: 10,
    death: -10,
  },
  skills: [
    { el: "fire", min: 500, max: 800, int: 2000, ch: 75, range: 8, radius: 3, fx: "hit-by-fire", miss: "fire", alvo: 1 },
    { el: "fire", min: 800, max: 1400, int: 3700, ch: 37, length: 8, spread: 3, fx: "magic-red" },
    { el: "fire", min: 600, max: 1100, int: 3100, ch: 27, range: 8, fx: "fire-area", miss: "fire", alvo: 1 },
  ],
  defSkills: [
    { n: "healing", min: 300, max: 800, int: 3000, ch: 35 },
    { n: "speed", int: 2000, ch: 15 },
  ],
  looktype: 1413,
  race: "undead",
  raceId: 2060,
  targetDistance: 1,
  staticAttack: 90,
  imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 1, item: "platinum-coin" },
    { chance: 100, max: 1, item: "crystal-coin" },
    { chance: 50, max: 1, item: "violet-gem" },
    { chance: 50, max: 1, item: "mastermind-potion" },
    { chance: 50, max: 1, item: "transcendence-potion" },
    { chance: 50, max: 1, item: "moonstone" },
    { chance: 50, max: 1, item: "ultimate-spirit-potion" },
    { chance: 50, max: 1, item: "white-gem" },
    { chance: 6, max: 1, item: "brainstealer-s-tissue" },
    { chance: 5, max: 1, item: "brainstealer-s-brain" },
    { chance: 2.5, max: 1, item: "brainstealer-s-brainwave" },
    { chance: 0.18, max: 1, item: "eldritch-breeches" },
    { chance: 0.18, max: 1, item: "eldritch-monk-boots" },
    { chance: 0.24, max: 1, item: "eldritch-cowl" },
    { chance: 0.225, max: 1, item: "eldritch-hood" },
    { chance: 0.21, max: 1, item: "eldritch-bow" },
    { chance: 0.25, max: 1, item: "eldritch-quiver" },
    { chance: 0.13, max: 1, item: "eldritch-claymore" },
    { chance: 0.11, max: 1, item: "eldritch-greataxe" },
    { chance: 0.32, max: 1, item: "eldritch-warmace" },
    { chance: 0.15, max: 1, item: "eldritch-crescent-moon-spade" },
    { chance: 0.18, max: 1, item: "eldritch-shield" },
    { chance: 0.16, max: 1, item: "eldritch-cuirass" },
    { chance: 0.17, max: 1, item: "eldritch-folio" },
    { chance: 0.19, max: 1, item: "eldritch-tome" },
    { chance: 0.2, max: 1, item: "eldritch-rod" },
    { chance: 0.18, max: 1, item: "eldritch-wand" },
    { chance: 0.14, max: 1, item: "gilded-eldritch-claymore" },
    { chance: 0.12, max: 1, item: "gilded-eldritch-greataxe" },
    { chance: 0.1, max: 1, item: "gilded-eldritch-warmace" },
    { chance: 0.08, max: 1, item: "gilded-eldritch-wand" },
    { chance: 0.06, max: 1, item: "gilded-eldritch-rod" },
    { chance: 0.05, max: 1, item: "gilded-eldritch-bow" },
    { chance: 0.06, max: 1, item: "gilded-eldritch-crescent-moon-spade" },
    { chance: 0.03, max: 1, item: "eldritch-crystal" },
  ],
  grupo: "bosses",
};

const MEGA_MAGMAOID_DATA = {
  monsterSlug: MEGA_MAGMAOID_ID,
  monster: MEGA_MAGMAOID,
  registerMonsters(monsters) {
    if (monsters) monsters[MEGA_MAGMAOID_ID] = MEGA_MAGMAOID;
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = MEGA_MAGMAOID_DATA;

(function registerMegaMagmaoid() {
  if (typeof GAMEDATA === "undefined") return;

  /* Monstro novo (ausente do dump Canary) — registra nos dois catálogos
   * para o spawn/loot resolverem igual aos demais bosses. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA)
    MONSTERDATA[MEGA_MAGMAOID_ID] = MEGA_MAGMAOID;
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  GAMEDATA.monsters[MEGA_MAGMAOID_ID] = MEGA_MAGMAOID;

  /* Looktype 1413 = a sheet do Magma Bubble (mesmo PNG, copiado). */
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS &&
      !MOBSHEETS[MEGA_MAGMAOID_ID])
    MOBSHEETS[MEGA_MAGMAOID_ID] = { cw: 57, ch: 57, cols: 9, rows: 4 };

  /* Hunt técnica invisível: arena da bossroom para o newBossCombat ter
   * colisão/spawn e o boss nascer na célula. */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["mega-magmaoid-room"] = {
    name: MEGA_MAGMAOID_ROOM.name,
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: [MEGA_MAGMAOID_ID],
    color: "#b03917",
    scene: "hell",
    otbm: MEGA_MAGMAOID_ROOM.otbm,
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da sala.
    otbmSpawn: MEGA_MAGMAOID_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, MEGA_MAGMAOID_ROOM.boss),
    avgHp: MEGA_MAGMAOID_STATS.hp,
    avgExp: MEGA_MAGMAOID_STATS.exp,
    avgDamage: MEGA_MAGMAOID_STATS.damage,
    avgArmor: MEGA_MAGMAOID_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats diretos (newBossCombat usa hp/exp/damage/armor/defense quando
   * presentes) — skills/resist/loot vêm do monstro base. Sem lista
   * própria de loot: bossLootReal usa a tabela oficial do monstro. */
  BOSS_DEFS[MEGA_MAGMAOID_ID] = {
    id: MEGA_MAGMAOID_ID,
    name: MEGA_MAGMAOID_STATS.name,
    title: "Boss da Dwelling of the Forgotten",
    hunt: "mega-magmaoid-room",
    sprite: MEGA_MAGMAOID_ID,
    baseMonster: MEGA_MAGMAOID_ID,
    hp: MEGA_MAGMAOID_STATS.hp,
    exp: MEGA_MAGMAOID_STATS.exp,
    damage: MEGA_MAGMAOID_STATS.damage,
    armor: MEGA_MAGMAOID_STATS.armor,
    defense: MEGA_MAGMAOID_STATS.defense,
    speed: 0.00002,
    loot: [],
    requirement: { level: 250, text: "Requer nível 250+ (BOSSES 250+)" },
    cooldown: MEGA_MAGMAOID_COOLDOWN_MS,
  };
})();
