/* mimar-haffar.js — Boss Mimar Haffar (Moonstone Crater, nível 400+).
 *
 * BOSS SIMPLES (sem mecânica): apenas a forma final — hp 460.000 e exp
 * 3.500.000 oficiais (tibia.gg / TibiaWiki; boss do update 15.30,
 * "Make Believe", Archfoe, cooldown 20h). O monstro não existe no dump
 * Canary nem no crystalserver disponível — a ficha é oficial: todas as
 * resistências 100% (neutro), sees invisible, looktype 1953.
 *
 * Skills balanceadas sobre o molde djinn do Canary (efreet/marid) nos
 * elementos oficiais da luta (fire, life drain, holy, energy) —
 * fireball/onda de fogo, beam de lifedrain, explosão holy, electrify,
 * debuff de speed, drunk, mudança de outfit e cura alta de boss 400+.
 *
 * Coordenadas absolutas do RME (arena atualizada p/ minis radiant):
 *   centermap   {1023,1030,7}
 *   bossspawn   {1023,1026,7}
 *   playerspawn {1023,1034,7}
 * Sala: game/maps/minis_radiant.otbm (publicada a partir de
 * beta-maps/bossesroom/"minis radiant.otbm" — 29×26 em z=7, bounds
 * 1009..1037 × 1015..1040; os três pontos são caminháveis e conectados
 * no componente de 147 sqm). Compartilhada com o Maior Domus.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa
 * (BOSS_DEFS não existe no vm); o registro do monstro no MONSTERS do
 * servidor é via module.exports (require direto, mesmo padrão do
 * true-asuras.js / bloodrotten.js).
 */
"use strict";

/* Cooldown oficial: 20h (tibia.gg) — aplicado enquanto
 * BOSS_COOLDOWNS_ENABLED estiver ligado. */
const MIMAR_HAFFAR_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/* Arena atualizada a pedido: Mimar Haffar e Maior Domus dividem a sala
 * minis_radiant.otbm (29×26 z=7, bounds 1009..1037 × 1015..1040). */
const MIMAR_HAFFAR_ROOM = {
  otbm: "minis_radiant",
  name: "Mimar Haffar Room",
  center: { x: 1023, y: 1030, z: 7 },
  spawn: { x: 1023, y: 1034, z: 7 },   // playerspawn
  boss:  { x: 1023, y: 1026, z: 7 },   // bossspawn
};

const MIMAR_HAFFAR_STATS = {
  name: "Mimar Haffar",
  hp: 460000,
  exp: 3500000,
  damage: 1600,
  armor: 0,
  defense: 80,
};

/* Itens do loot oficial que faltavam no catálogo (ícones 32×32 em
 * game/assets/item/<slug>.png renderizados por
 * tools/import_mimar_haffar_assets.py — cids do appearances.dat 15.x /
 * canary-items.xml). Preços oficiais (TibiaWiki): Figurine of Mimar
 * Haffar = Yasir 2.800.000; dragon figurine = joalheria 45.000;
 * moonstone = joalheria 13.000. Equipamentos novos nível 800 (moonsilver
 * battle visor / spirit mask), wooden spellbook (quest item), scraps of
 * a radiant attire (material de outfit da Make Believe), cloud in a
 * bottle (recompensa de quest) e as poções supreme health / ultimate
 * spirit — nenhum NPC compra → sell 0. */
const MIMAR_HAFFAR_LOOT_ITEMS = {
  "moonsilver-battle-visor": { n: "moonsilver battle visor", s: "helmet", t: "armor", arm: 14, sword: 4, axe: 4, club: 4, ml: 1, res: { physical: 8, fire: 10 }, imbSlots: 2, w: 14.5, cid: 53229, lvl: 800, vocs: ["elite knight", "knight"], sell: 0, npcSell: 0 },
  "moonsilver-spirit-mask":  { n: "moonsilver spirit mask",  s: "helmet", t: "armor", arm: 10, ml: 4, res: { physical: 3, energy: 8 }, imbSlots: 2, w: 38, cid: 53232, lvl: 800, vocs: ["druid", "elder druid"], sell: 0, npcSell: 0 },
  "figurine-of-mimar-haffar": { n: "figurine of Mimar Haffar", s: null, t: "loot", w: 0.65, cid: 54268, sell: 2800000, npcSell: 2800000 },
  "scraps-of-a-radiant-attire": { n: "scraps of a radiant attire", s: null, t: "loot", w: 0.3, cid: 54640, sell: 0, npcSell: 0 },
  "cloud-in-a-bottle":       { n: "cloud in a bottle", s: null, t: "loot", w: 0.45, cid: 54651, sell: 0, npcSell: 0 },
  "moonstone":               { n: "moonstone", s: null, t: "loot", w: 0.1, cid: 32771, sell: 13000, npcSell: 13000 },
  "dragon-figurine":         { n: "dragon figurine", s: null, t: "loot", w: 6.5, cid: 30053, sell: 45000, npcSell: 45000 },
  "supreme-health-potion":   { n: "supreme health potion", s: null, t: "loot", w: 3.5, cid: 23375, sell: 0, npcSell: 0 },
  "ultimate-spirit-potion":  { n: "ultimate spirit potion", s: null, t: "loot", w: 3.1, cid: 23374, sell: 0, npcSell: 0 },
  /* wooden-spellbook já existe como equipamento real (spellbook/shield,
   * weapondata.js — npcSell 12000); não registrar como loot genérico. */
};

/* Correções de preço em itens já existentes do catálogo que aparecem
 * no loot do boss. Poções não têm comprador NPC (TibiaWiki: o valor é o
 * preço cobrado PELO NPC, não pago) → sell 0, mesmo padrão de
 * great-spirit / ultimate-health. Equipamentos e gemas com placeholder:
 * gold ring 8.000 (Rashid), wand of defiance 6.500 (Rashid), spellbook
 * of mind control 13.000 (Alexander/Khanna). */
const MIMAR_HAFFAR_LOOT_PRICE_FIXES = {
  "strong-mana-potion": 0,
  "great-mana-potion": 0,
  "ultimate-mana-potion": 0,
  "gold-ring": 8000,
  "wand-of-defiance": 6500,
  "spellbook-of-mind-control": 13000,
};

/* Mimar Haffar — monstro novo (update 15.30, ausente do dump Canary e
 * do crystalserver disponível). Ficha oficial: 460.000 hp / 3.500.000
 * exp, todas as resistências 100% (neutro), sees invisible, looktype
 * 1953 (djinn 2×2, sheet 9 colunas em game/assets/mob/mimar-haffar.png).
 * Skills no molde efreet/marid escalado para boss 400+ nos elementos
 * oficiais (fire, life drain, holy, energy). */
const MIMAR_HAFFAR = {
  name: "Mimar Haffar",
  boss: 1,
  hp: MIMAR_HAFFAR_STATS.hp,
  exp: MIMAR_HAFFAR_STATS.exp,
  speed: 215,
  armor: MIMAR_HAFFAR_STATS.armor,
  defense: MIMAR_HAFFAR_STATS.defense,
  damage: MIMAR_HAFFAR_STATS.damage,
  element: "fire",
  attackSpeed: 2000,
  mitigation: 0,
  looktype: 1953,
  race: "blood",
  raceId: 2812,
  targetDistance: 1,
  staticAttack: 90,
  imune: ["paralyze", "invisible"],
  skills: [
    { el: "fire", min: 650, max: 1100, int: 2000, ch: 15, range: 7, miss: "fire" },
    { el: "fire", min: 800, max: 1400, int: 2000, ch: 15, length: 8, spread: 3, fx: "fire-area" },
    { el: "lifedrain", min: 500, max: 900, int: 2000, ch: 15, length: 8, spread: 0, fx: "purple-energy" },
    { el: "holy", min: 450, max: 850, int: 2000, ch: 12, radius: 4, fx: "holy" },
    { el: "energy", min: 400, max: 750, int: 2000, ch: 15, radius: 5, fx: "energy-hit" },
    { el: "physical", min: 0, max: 0, int: 2000, ch: 15, n: "speed", range: 7, fx: "magic-red" },
    { el: "physical", min: 0, max: 0, int: 2000, ch: 10, n: "drunk", range: 7, miss: "energy" },
    { el: "physical", min: 0, max: 0, int: 2000, ch: 2, n: "outfit", range: 7, fx: "magic-blue" },
  ],
  defSkills: [
    { n: "healing", min: 1500, max: 3500, int: 2000, ch: 15 },
    { n: "invisible", int: 2000, ch: 10 },
  ],
  loot: [
    { chance: 100, max: 38, item: "crystal-coin" },
    { chance: 100, max: 88, item: "platinum-coin" },
    { chance: 60, max: 15, item: "bullseye-potion" },
    { chance: 60, max: 1, item: "emerald-bangle" },
    { chance: 60, max: 23, item: "strong-mana-potion" },
    { chance: 50, max: 28, item: "great-mana-potion" },
    { chance: 40, max: 1, item: "amber-with-a-bug" },
    { chance: 40, max: 1, item: "giant-emerald" },
    { chance: 30, max: 1, item: "blue-gem" },
    { chance: 30, max: 30, item: "great-spirit-potion" },
    { chance: 30, max: 1, item: "red-gem" },
    { chance: 30, max: 32, item: "ultimate-mana-potion" },
    { chance: 30, max: 1, item: "wand-of-defiance" },
    { chance: 20, max: 1, item: "amber-with-a-dragonfly" },
    { chance: 20, max: 13, item: "berserk-potion" },
    { chance: 20, max: 1, item: "gold-ring" },
    { chance: 20, max: 1, item: "green-gem" },
    { chance: 20, max: 14, item: "mastermind-potion" },
    { chance: 20, max: 1, item: "moonstone" },
    { chance: 20, max: 5, item: "supreme-health-potion" },
    { chance: 20, max: 19, item: "ultimate-health-potion" },
    { chance: 20, max: 19, item: "ultimate-spirit-potion" },
    { chance: 20, max: 1, item: "wooden-spellbook" },
    { chance: 20, max: 2, item: "yellow-gem" },
    { chance: 15, max: 1, item: "dirty-turban" },
    { chance: 10, max: 1, item: "dragon-figurine" },
    { chance: 10, max: 20, item: "scraps-of-a-radiant-attire" },
    { chance: 10, max: 1, item: "spellbook-of-mind-control" },
    { chance: 5, max: 1, item: "moonsilver-battle-visor" },
    { chance: 5, max: 1, item: "moonsilver-spirit-mask" },
    { chance: 3, max: 1, item: "cloud-in-a-bottle" },
    { chance: 3, max: 1, item: "figurine-of-mimar-haffar" },
  ],
  voices: {
    int: 5000,
    ch: 10,
    list: [
      { t: "Your wish is my command!" },
      { t: "Be careful what you wish for!" },
      { t: "You shall not leave this crater!" },
    ],
  },
  grupo: "quests",
};

const MIMAR_HAFFAR_DATA = {
  monsterSlug: "mimar-haffar",
  monster: MIMAR_HAFFAR,
  registerMonsters(monsters) {
    if (monsters) monsters["mimar-haffar"] = MIMAR_HAFFAR;
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = MIMAR_HAFFAR_DATA;

(function registerMimarHaffar() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in MIMAR_HAFFAR_LOOT_ITEMS) {
    const def = MIMAR_HAFFAR_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }
  for (const slug in MIMAR_HAFFAR_LOOT_PRICE_FIXES) {
    if (!items[slug]) continue;
    items[slug].sell = MIMAR_HAFFAR_LOOT_PRICE_FIXES[slug];
    items[slug].npcSell = MIMAR_HAFFAR_LOOT_PRICE_FIXES[slug];
  }

  /* Monstro novo (ausente do dump Canary) — registra nos dois catálogos
   * para o spawn/loot resolverem igual aos demais bosses. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA)
    MONSTERDATA["mimar-haffar"] = MIMAR_HAFFAR;
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  GAMEDATA.monsters["mimar-haffar"] = MIMAR_HAFFAR;

  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS &&
      !MOBSHEETS["mimar-haffar"])
    MOBSHEETS["mimar-haffar"] = { ch: 64, cols: 9, cw: 64, rows: 4 };

  /* Hunt técnica invisível: arena da bossroom para o newBossCombat ter
   * colisão/spawn e o boss nascer na célula. */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["mimar-haffar-room"] = {
    name: MIMAR_HAFFAR_ROOM.name,
    hidden: true,
    level: 400,
    minLevel: 400,
    monsters: ["mimar-haffar"],
    color: "#8a6a2a",
    scene: "palace",
    otbm: MIMAR_HAFFAR_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: MIMAR_HAFFAR_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, MIMAR_HAFFAR_ROOM.boss),
    avgHp: MIMAR_HAFFAR_STATS.hp,
    avgExp: MIMAR_HAFFAR_STATS.exp,
    avgDamage: MIMAR_HAFFAR_STATS.damage,
    avgArmor: MIMAR_HAFFAR_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats diretos (newBossCombat usa hp/exp/damage/armor/defense quando
   * presentes) — skills/resist/loot vêm do monstro base. Sem lista
   * própria de loot: bossLootReal usa a tabela oficial do monstro. */
  BOSS_DEFS["mimar-haffar"] = {
    id: "mimar-haffar",
    name: MIMAR_HAFFAR_STATS.name,
    title: "Boss Moonstone Crater",
    hunt: "mimar-haffar-room",
    baseMonster: "mimar-haffar",
    sprite: "mimar-haffar",
    hp: MIMAR_HAFFAR_STATS.hp,
    exp: MIMAR_HAFFAR_STATS.exp,
    damage: MIMAR_HAFFAR_STATS.damage,
    armor: MIMAR_HAFFAR_STATS.armor,
    defense: MIMAR_HAFFAR_STATS.defense,
    speed: 0.00007,
    // Make Believe Quest: acesso liberado pela Missão 1 (2500 kills em
    // Moonstone Castle) + requisitos da quest (Doctor Marrow, level 800+).
    requirement: {
      level: 800,
      killsRequired: ["doctor-marrow"],
      mission: "moonstone-castle",
      enforced: true,
      text: "Make Believe Quest — Missão 1: eliminar 2500 criaturas em Moonstone Castle (requer Doctor Marrow + nível 800)",
    },
    cooldown: MIMAR_HAFFAR_COOLDOWN_MS,
  };
})();
