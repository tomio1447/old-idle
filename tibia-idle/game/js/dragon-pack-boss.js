/* dragon-pack-boss.js — Boss Dragon Pack (nível 400+).
 *
 * BOSS SIMPLES (sem mecânica — sala de boss igual ao Brainstealer /
 * Mega Magmaoid). Dragon Pack é o nome registrado no Bosstiary do boss
 * final da "20 Years a Cook Quest" (Nimmersatt's Breeding Ground, update
 * 13.30; Archfoe). A mecânica oficial — 7 dragons de levers diferentes
 * que herdam habilidades uns dos outros — NÃO é implementada: aqui é um
 * único boss "dragon-pack" numa sala simples (aproximação, mesmo padrão
 * do mega-magmaoid-boss.js).
 *
 * Ficha oficial (tibia.gg / tibiadb / wiki.br):
 *   hp 50.000, raceId 2466, looktype 1712 — o MESMO outfit do Mega
 *   Dragon, por isso assets/mob/dragon-pack.png é cópia da sheet do
 *   mega-dragon. exp: tibiadb diz 600.000 (usado aqui); a wiki.br lista
 *   0 com o disclaimer de "dados imprecisos" — fica documentado.
 *   Cooldown: 20h (padrão Archfoe — o boss de quest não tem cd oficial).
 *   Resistências oficiais (dano recebido): fire 0% → fire:100 (imune),
 *   earth 75% → earth:25; os demais neutros. Sente invisível, imune a
 *   paralisia → imune:["paralyze","invisible"].
 *
 * Skills: oficial "nenhuma documentada" — kit no molde do mega-dragon
 * do dump, escalado para um boss 400+ de 50k hp (physical alvo
 * ~450-700, fire wave ~700-1100, fire UE ~600-900, death chain
 * ~400-600). damage ~800, mitigation ~2.0, armor/defense ~80.
 *
 * Loot: tabela oficial do Dragon Pack (mesma do Dragon Hoard) — chances
 * por faixa de raridade (comum alta, semi ~4-8%, raro ~0.5-1%,
 * muito raro ~0.05-0.3%), no padrão da distribuição do the-brainstealer.
 *
 * Itens novos registrados (cids/pesos do tools/data/canary-items.xml):
 *   - 3 creature products vendidos ao Yasir: crystallized-blood
 *     (44752, 270k), exalted-seal (44750, 190k), gold-scaled-sentinel
 *     (44751, 380k);
 *   - herald-s-insignia (44753) / herald-s-wings (44754): peças do addon
 *     do outfit Draccoon Herald — sem comprador NPC → sell 0;
 *   - 5 dragon scale armors (44621-44624 / 50264): equipamento real que
 *     já existia no weapondata sem cid e com sell calculado — NPC value
 *     oficial 0 (sem comprador) → cid + sell 0 (PRICE_FIX, mesmo padrão
 *     do set Moonsilver em final-radiant.js).
 *   Obs. peso: o canary-items.xml lista weight=20 (0.20 oz) para os 5
 *   valuables — tools/_items14.json confirma 0.2. O wiki oficial diz
 *   2.00 oz (creature products) e 12.50 oz (herald's) — mantido o dado
 *   do XML/repo.
 *
 * Coordenadas absolutas do RME (sala dragon_pack_room.otbm, 49×38 z=7,
 * bounds 1009..1057 × 1015..1052 — o .otbm já é o recorte da sala):
 *   bossspawn   {1032,1029,7} → local (23,14)
 *   playerspawn {1034,1037,7} → local (25,22)
 *   centermap   {1033,1034,7} → local (24,19) — caminhável mais próxima
 *               do centro geométrico dos bounds (1033, 1033.5)
 * Todas caminháveis e conectadas no componente de 326 sqm.
 */
"use strict";

const DRAGON_PACK_ID = "dragon-pack";

/* Cooldown: 20h — padrão Archfoe (o boss de quest não tem cd oficial). */
const DRAGON_PACK_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const DRAGON_PACK_ROOM = {
  otbm: "dragon_pack_room",
  name: "Dragon Pack's Room",
  center: { x: 1033, y: 1034, z: 7 },
  spawn: { x: 1034, y: 1037, z: 7 },   // playerspawn
  boss:  { x: 1032, y: 1029, z: 7 },   // bossspawn
};

const DRAGON_PACK_STATS = {
  name: "Dragon Pack",
  hp: 50000,
  exp: 600000,
  damage: 800,
  armor: 80,
  defense: 80,
};

/* Dragon Pack — boss oficial (update 13.30) ausente do dump Canary.
 * Looktype 1712 = o mesmo do Mega Dragon (sheet reutilizada, copiada
 * para assets/mob/dragon-pack.png). Loot = tabela oficial do Dragon
 * Pack / Dragon Hoard (TibiaWiki). */
const DRAGON_PACK = {
  name: DRAGON_PACK_STATS.name,
  boss: 1,
  hp: DRAGON_PACK_STATS.hp,
  exp: DRAGON_PACK_STATS.exp,
  speed: 170,
  armor: DRAGON_PACK_STATS.armor,
  defense: DRAGON_PACK_STATS.defense,
  damage: DRAGON_PACK_STATS.damage,
  element: "physical",
  attackSpeed: 2000,
  mitigation: 2,
  /* Oficial (tibia.gg dano recebido): fire 0% → imune fire:100,
   * earth 75% → earth:25; demais elementos neutros. */
  resist: {
    fire: 100,
    earth: 25,
  },
  /* Kit no molde do mega-dragon escalado p/ boss 400+ de 50k hp:
   * physical alvo ~450-700, fire wave ~700-1100, fire UE ~600-900,
   * death chain physical ~400-600. */
  skills: [
    { el: "physical", min: 450, max: 700, int: 2500, ch: 15, range: 2, alvo: 1 },
    { el: "fire", min: 700, max: 1100, int: 2500, ch: 20, length: 8, spread: 4, fx: "explosion-hit" },
    { el: "fire", min: 600, max: 900, int: 2500, ch: 15, range: 7, radius: 4, fx: "fire-area", miss: "fire", alvo: 1 },
    { el: "physical", min: 400, max: 600, int: 2500, ch: 15, n: "death chain", range: 7 },
  ],
  looktype: 1712,
  race: "blood",
  raceId: 2466,
  targetDistance: 1,
  staticAttack: 90,
  imune: ["paralyze", "invisible"],
  /* Tabela oficial do Dragon Pack (= Dragon Hoard). Chances por faixa:
   * comum alta, semi ~4-8%, raro ~0.5-1%, muito raro ~0.05-0.3%. */
  loot: [
    // Comum
    { chance: 100, max: 391, item: "gold-coin" },
    { chance: 100, max: 200, item: "platinum-coin" },
    { chance: 50, max: 3, item: "crystal-coin" },
    { chance: 50, max: 2, item: "blue-gem" },
    { chance: 50, max: 2, item: "ice-cube" },
    { chance: 50, max: 2, item: "life-crystal" },
    { chance: 50, max: 2, item: "yellow-gem" },
    { chance: 50, max: 1, item: "broadsword" },
    { chance: 50, max: 1, item: "demonic-essence" },
    { chance: 50, max: 2, item: "white-gem" },
    // Semi-raro
    { chance: 4, max: 1, item: "divine-plate" },
    { chance: 5, max: 1, item: "dragonbone-staff" },
    { chance: 4.5, max: 1, item: "dragon-scale-mail" },
    { chance: 5, max: 1, item: "dragon-shield" },
    { chance: 5, max: 1, item: "dragon-slayer" },
    { chance: 5, max: 1, item: "drakinata" },
    { chance: 6, max: 1, item: "fire-sword" },
    { chance: 6, max: 1, item: "giant-amethyst" },
    { chance: 6, max: 1, item: "giant-emerald" },
    { chance: 6, max: 1, item: "giant-topaz" },
    { chance: 4, max: 1, item: "guardian-boots" },
    { chance: 5, max: 1, item: "jade-hat" },
    { chance: 4.5, max: 1, item: "royal-helmet" },
    { chance: 6, max: 1, item: "serpent-sword" },
    { chance: 8, max: 1, item: "shard" },
    { chance: 5, max: 1, item: "spellweaver-s-robe" },
    { chance: 6, max: 1, item: "strange-helmet" },
    { chance: 5, max: 1, item: "tower-shield" },
    { chance: 6, max: 1, item: "wand-of-inferno" },
    { chance: 4, max: 1, item: "zaoan-helmet" },
    // Raro
    { chance: 1, max: 1, item: "crystallized-blood" },
    { chance: 0.9, max: 1, item: "exalted-seal" },
    { chance: 0.7, max: 1, item: "gold-scaled-sentinel" },
    // Muito raro
    { chance: 0.15, max: 1, item: "arcane-dragon-robe" },
    { chance: 0.12, max: 1, item: "dauntless-dragon-scale-armor" },
    { chance: 0.1, max: 1, item: "herald-s-insignia" },
    { chance: 0.08, max: 1, item: "herald-s-wings" },
    { chance: 0.2, max: 1, item: "merudri-battle-mail" },
    { chance: 0.15, max: 1, item: "mystical-dragon-robe" },
    { chance: 0.12, max: 1, item: "unerring-dragon-scale-armor" },
  ],
  grupo: "bosses",
};

const DRAGON_PACK_DATA = {
  monsterSlug: DRAGON_PACK_ID,
  monster: DRAGON_PACK,
  registerMonsters(monsters) {
    if (monsters) monsters[DRAGON_PACK_ID] = DRAGON_PACK;
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = DRAGON_PACK_DATA;

(function registerDragonPack() {
  if (typeof GAMEDATA === "undefined") return;

  /* Monstro novo (ausente do dump Canary) — registra nos dois catálogos
   * para o spawn/loot resolverem igual aos demais bosses. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA)
    MONSTERDATA[DRAGON_PACK_ID] = DRAGON_PACK;
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  GAMEDATA.monsters[DRAGON_PACK_ID] = DRAGON_PACK;

  /* Looktype 1712 = a sheet do Mega Dragon (mesmo PNG, copiado). */
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS &&
      !MOBSHEETS[DRAGON_PACK_ID])
    MOBSHEETS[DRAGON_PACK_ID] = { cw: 63, ch: 60, cols: 9, rows: 4 };

  /* Itens novos da tabela de loot — cids/pesos do canary-items.xml.
   * creature products → Yasir; herald's insignia/wings → sem comprador
   * (peças do addon do outfit Draccoon Herald) → sell 0; as 5 dragon
   * scale armors já existem como equipamento real no weapondata com
   * sell calculado — NPC value oficial 0 → fix cid + sell/npcSell 0. */
  if (!GAMEDATA.items) GAMEDATA.items = {};
  const lootItems = {
    "exalted-seal":        { n: "exalted seal",        s: null, t: "loot", cid: 44750, w: 0.20, sell: 190000, npcSell: 190000 },
    "gold-scaled-sentinel":{ n: "gold-scaled sentinel", s: null, t: "loot", cid: 44751, w: 0.20, sell: 380000, npcSell: 380000 },
    "crystallized-blood":  { n: "crystallized blood",  s: null, t: "loot", cid: 44752, w: 0.20, sell: 270000, npcSell: 270000 },
    "herald-s-insignia":   { n: "herald's insignia",   s: null, t: "loot", cid: 44753, w: 0.20, sell: 0, npcSell: 0 },
    "herald-s-wings":      { n: "herald's wings",      s: null, t: "loot", cid: 44754, w: 0.20, sell: 0, npcSell: 0 },
    "dauntless-dragon-scale-armor": { n: "dauntless dragon scale armor", s: "armor", t: "armor", cid: 44621, w: 152, sell: 0, npcSell: 0 },
    "unerring-dragon-scale-armor":  { n: "unerring dragon scale armor",  s: "armor", t: "armor", cid: 44622, w: 135, sell: 0, npcSell: 0 },
    "arcane-dragon-robe":  { n: "arcane dragon robe",  s: "armor", t: "armor", cid: 44623, w: 43, sell: 0, npcSell: 0 },
    "mystical-dragon-robe":{ n: "mystical dragon robe",s: "armor", t: "armor", cid: 44624, w: 38, sell: 0, npcSell: 0 },
    "merudri-battle-mail": { n: "merudri battle mail", s: "armor", t: "armor", cid: 50264, w: 29, sell: 0, npcSell: 0 },
    /* broadsword é item clássico do gamedata sem sell — oficialmente
     * vende ao Nah'bob por 500 gp (H.L. paga 10; usa-se o melhor NPC). */
    "broadsword": { n: "broadsword", s: "weapon", t: "sword", cid: 3301, w: 52.5, sell: 500, npcSell: 500 },
  };
  for (const slug in lootItems) {
    const def = lootItems[slug];
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = def;
    else {
      if (def.sell != null) GAMEDATA.items[slug].sell = def.sell;
      if (def.npcSell != null) GAMEDATA.items[slug].npcSell = def.npcSell;
      if (def.cid != null && GAMEDATA.items[slug].cid == null) GAMEDATA.items[slug].cid = def.cid;
      if (def.w != null && GAMEDATA.items[slug].w == null) GAMEDATA.items[slug].w = def.w;
    }
  }

  /* Hunt técnica invisível: arena da bossroom para o newBossCombat ter
   * colisão/spawn e o boss nascer na célula. */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["dragon-pack-room"] = {
    name: DRAGON_PACK_ROOM.name,
    hidden: true,
    level: 400,
    minLevel: 400,
    monsters: [DRAGON_PACK_ID],
    color: "#8a3a2a",
    scene: "lair",
    otbm: DRAGON_PACK_ROOM.otbm,
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da sala.
    otbmSpawn: DRAGON_PACK_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, DRAGON_PACK_ROOM.boss),
    avgHp: DRAGON_PACK_STATS.hp,
    avgExp: DRAGON_PACK_STATS.exp,
    avgDamage: DRAGON_PACK_STATS.damage,
    avgArmor: DRAGON_PACK_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats diretos (newBossCombat usa hp/exp/damage/armor/defense quando
   * presentes) — skills/resist/loot vêm do monstro base. Sem lista
   * própria de loot: bossLootReal usa a tabela oficial do monstro. */
  BOSS_DEFS[DRAGON_PACK_ID] = {
    id: DRAGON_PACK_ID,
    name: DRAGON_PACK_STATS.name,
    title: "Boss da 20 Years a Cook Quest",
    hunt: "dragon-pack-room",
    sprite: DRAGON_PACK_ID,
    baseMonster: DRAGON_PACK_ID,
    hp: DRAGON_PACK_STATS.hp,
    exp: DRAGON_PACK_STATS.exp,
    damage: DRAGON_PACK_STATS.damage,
    armor: DRAGON_PACK_STATS.armor,
    defense: DRAGON_PACK_STATS.defense,
    speed: 0.00002,
    loot: [],
    requirement: { level: 400, text: "Requer nível 400+ (BOSSES 400+)" },
    cooldown: DRAGON_PACK_COOLDOWN_MS,
  };
})();
