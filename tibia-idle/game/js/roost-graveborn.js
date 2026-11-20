/* roost-graveborn.js — The Roost of the Graveborn Quest (level 450+,
 * update 15.20).
 *
 * Progressão (conforme pedido):
 *   Missão 1 — derrotar 5.000 monstros da Unhallowed Crypt
 *     → libera o boss Adventurer Group ("The First Dragon").
 *   Missão 2 — derrotar os 4 bosses em sequência:
 *     1º Adventurer Group  (encounter "The First Dragon")
 *     2º Eldritch Dragon Lord (encounter "Under Fire")
 *     3º Ice Horror        (encounter "The Frozen Hoard")
 *     4º The Gravedigger   (encounter "The Last Dragon Soul")
 *     → libera o boss final Bonelord's Phylactery.
 *   Missão 3 — derrotar Bonelord's Phylactery
 *     → recompensa automática: 1 de cada Crypt Rune (5 itens).
 *
 * NPC Dragon Ancestor Spirit (Draconia, Ab'Dendriel): troca 1 de cada
 * Crypt Rune por 1 arma Crypt aleatória — a caixa cicla os ícones como
 * um gif e a roleta desacelera até o item sorteado (mesmo modelo do
 * Make Believe).
 *
 * Dados oficiais (wikitext TibiaWiki/Fandom + tibia.gg):
 *   - Eldritch Dragon Lord: race_id 2739, exp 750.000, cooldown 20h,
 *     loot oficial completo; resists oficiais "100%?" (neutro) —
 *     fire imune (ele se cura com fogo oficialmente → aproximamos com
 *     imunidade).
 *   - Ice Horror: race_id 2733, hp 542.700, exp 259.000, ice 0%,
 *     heal 0%; abilities oficiais: melee 400+, Death Ring 950+,
 *     Great Energy Wave 1300+, Small Bluish Explosion.
 *   - The Gravedigger: race_id 2721, exp 750.000, cooldown 20h;
 *     abilities: melee, Fire Ball 600–800+, summon 2 Bonelord Totem
 *     (aproximado por skill de área — o motor não invoca adds aqui).
 *   - Adventurer Group: race_id 2773 (encounter de 5 aventureiros —
 *     modelado como 1 boss único). O loot oficial fica no Fatal Bug:
 *     Ancient Crypt Rune + Worn Guide Book (rare). HP/XP ocultos.
 *   - Bonelord's Phylactery: entidade que carrega o loot do Bone
 *     Overlord (race_id 2771, exp 1.000.000, batalha máx. 900s);
 *     earth 110% → resist earth -10; demais neutro.
 *   - Crypt weapons: 7 armas lvl 450 class 4, sem valor NPC
 *     ("Negotiable") → sell 0. Runas: npcvalue 0 → sell 0.
 *
 * Sprites: sheets 9×4 reais do DAT (looktypes 1879/1880/1881) +
 * sheets estáticos dos lookItems 52836/52831, gerados por
 * tools/import_roost_graveborn_assets.py. NPC usa looktype 1899
 * (dragão espírito).
 *
 * Este arquivo também roda no sandbox vm do servidor: lá só a parte
 * de itens/monstros executa; o registro no MONSTERS é via
 * module.exports.
 */
"use strict";

const ROOST_QUEST_ID = "roost-of-the-graveborn-quest";

/* Ordem da roleta (quantidades/percentuais oficiais Crypt Runes/Statistics). */
const CRYPT_WEAPONS = [
  { slug: "crypt-spine",    qty: 82, pct: 15.8 },
  { slug: "crypt-slicer",   qty: 79, pct: 15.3 },
  { slug: "crypt-bile",     qty: 76, pct: 14.7 },
  { slug: "crypt-strike",   qty: 75, pct: 14.5 },
  { slug: "crypt-splitter", qty: 73, pct: 14.1 },
  { slug: "crypt-breaker",  qty: 69, pct: 13.3 },
  { slug: "crypt-jaw",      qty: 64, pct: 12.4 },
];
const CRYPT_RUNES = [
  "fiery-crypt-rune", "icy-crypt-rune", "deathly-crypt-rune",
  "ancient-crypt-rune", "necromantic-crypt-rune",
];

/* Itens novos (cids oficiais 15.20, do wikitext do Fandom).
 * Crypt weapons: "Negotiable" (sem comprador NPC) → sell 0.
 * Crypt Runes: npcvalue 0 → sell 0.
 * Creature products novos: todos vendidos ao Yasir (npcvalue oficial). */
const ROOST_ITEMS = {
  /* ── crypt weapons (lvl 450, class 4) ── */
  "crypt-spine":    { n: "crypt spine",    s: "weapon", t: "distance", cat: "distance",
                      atk: 8, dist: 3, hit: 5, range: 6, res: { ice: 5 },
                      th: 1, id: 52332, imbSlots: 3, cls: 4, lvl: 450,
                      vocs: ["paladin"], w: 44, drop: 1, sell: 0, npcSell: 0 },
  "crypt-splitter": { n: "crypt splitter", s: "weapon", t: "axe", cat: "axe",
                      atk: 58, def: 33, axe: 4, th: 1, id: 52333, imbSlots: 3,
                      cls: 4, lvl: 450, vocs: ["knight"], w: 80, drop: 1, sell: 0, npcSell: 0 },
  "crypt-breaker":  { n: "crypt breaker",  s: "weapon", t: "club", cat: "club",
                      atk: 58, def: 33, club: 4, th: 1, id: 52334, imbSlots: 3,
                      cls: 4, lvl: 450, vocs: ["knight"], w: 85, drop: 1, sell: 0, npcSell: 0 },
  "crypt-strike":   { n: "crypt strike",   s: "weapon", t: "fist", cat: "fist",
                      atk: 45, def: 20, fist: 4, mag: 1, th: 1, id: 52335,
                      imbSlots: 3, cls: 4, lvl: 450, vocs: ["monk"], w: 68,
                      drop: 1, sell: 0, npcSell: 0 },
  "crypt-bile":     { n: "crypt bile",     s: "weapon", t: "magic", cat: "wand",
                      dmgMin: 85, dmgMax: 135, mdmg: 110, el: "physical",
                      range: 7, manaCost: 10, mag: 4, res: { fire: 6 },
                      af: 3, ah: 32, aw: 32, id: 52336, imbSlots: 2, cls: 4,
                      lvl: 450, vocs: ["sorcerer"], w: 20, drop: 1, sell: 0, npcSell: 0 },
  "crypt-jaw":      { n: "crypt jaw",      s: "weapon", t: "magic", cat: "wand",
                      dmgMin: 85, dmgMax: 135, mdmg: 110, el: "physical",
                      range: 5, manaCost: 10, mag: 4, res: { energy: 6 },
                      af: 3, ah: 32, aw: 32, id: 52337, imbSlots: 2, cls: 4,
                      lvl: 450, vocs: ["druid"], w: 20, drop: 1, sell: 0, npcSell: 0 },
  "crypt-slicer":   { n: "crypt slicer",   s: "weapon", t: "sword", cat: "sword",
                      atk: 58, def: 33, sword: 4, th: 1, id: 52338, imbSlots: 3,
                      cls: 4, lvl: 450, vocs: ["knight"], w: 80, drop: 1, sell: 0, npcSell: 0 },
  /* ── crypt runes (quest items, npcvalue 0) ── */
  "fiery-crypt-rune":       { n: "fiery crypt rune",       s: null, t: "loot", cid: 52657, w: 5, sell: 0, npcSell: 0 },
  "icy-crypt-rune":         { n: "icy crypt rune",         s: null, t: "loot", cid: 52658, w: 5, sell: 0, npcSell: 0 },
  "deathly-crypt-rune":     { n: "deathly crypt rune",     s: null, t: "loot", cid: 52659, w: 5, sell: 0, npcSell: 0 },
  "ancient-crypt-rune":     { n: "ancient crypt rune",     s: null, t: "loot", cid: 52660, w: 5, sell: 0, npcSell: 0 },
  "necromantic-crypt-rune": { n: "necromantic crypt rune", s: null, t: "loot", cid: 52661, w: 5, sell: 0, npcSell: 0 },
  /* ── creature products novos (npcvalue oficial → Yasir) ── */
  "worn-guide-book":  { n: "worn guide book",  s: null, t: "loot", cid: 52710, w: 10, sell: 250000,  npcSell: 250000 },
  "golden-claw":      { n: "golden claw",      s: null, t: "loot", cid: 52711, w: 10, sell: 250000,  npcSell: 250000 },
  "shrunken-head":    { n: "shrunken head",    s: null, t: "loot", cid: 52712, w: 10, sell: 250000,  npcSell: 250000 },
  "ancient-scales":   { n: "ancient scales",   s: null, t: "loot", cid: 52713, w: 10, sell: 400000,  npcSell: 400000 },
  "soul-trap":        { n: "soul trap",        s: null, t: "loot", cid: 52714, w: 10, sell: 250000,  npcSell: 250000 },
  "skull-tendril":    { n: "skull tendril",    s: null, t: "loot", cid: 52715, w: 10, sell: 650000,  npcSell: 650000 },
  "bone-spikes":      { n: "bone spikes",      s: null, t: "loot", cid: 52717, w: 10, sell: 1500000, npcSell: 1500000 },
  "icy-scales":       { n: "icy scales",       s: null, t: "loot", cid: 52726, w: 10, sell: 250000,  npcSell: 250000 },
  "icy-horns":        { n: "icy horns",        s: null, t: "loot", cid: 52727, w: 10, sell: 250000,  npcSell: 250000 },
  "frozen-crapace":   { n: "frozen crapace",   s: null, t: "loot", cid: 52728, w: 10, sell: 500000,  npcSell: 500000 },
  "dragon-tongue":    { n: "dragon tongue",    s: null, t: "loot", cid: 24938, w: 5.5, sell: 550,    npcSell: 550 },
  /* shard: item antigo (id 7290) que faltava no catálogo — npcvalue
   * oficial 2.000 (drop do Ice Horror). */
  "shard":            { n: "shard",            s: null, t: "loot", cid: 7290,  w: 19,  sell: 2000,   npcSell: 2000 },
};

const ROOST_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h oficiais

/* ── Monstros ── */

/* Encounter "The First Dragon" — grupo de 5 aventureiros (knight/monk/
 * paladin/sorcerer/druid) lutando junto; modelado como boss único. O
 * loot oficial fica no Fatal Bug: Ancient Crypt Rune + Worn Guide Book.
 * HP/XP ocultos oficialmente — estimados pela progressão da cadeia
 * (abaixo do Eldritch DL). */
const ADVENTURER_GROUP = {
  name: "Adventurer Group",
  hp: 520000, exp: 750000,
  speed: 250, armor: 150, defense: 140,
  damage: 1250, element: "physical", attackSpeed: 2000, mitigation: 3.0,
  resist: {},
  /* 5 vocações no grupo → saraivada multi-elemento. */
  skills: [
    { el: "physical", min: 900, max: 1500, int: 2000, ch: 40, range: 1 },
    { el: "energy",   min: 700, max: 1200, int: 3500, ch: 30, range: 7,
      miss: "energy", alvo: 1 },
    { el: "earth",    min: 650, max: 1100, int: 4000, ch: 30, radius: 3,
      fx: "poison-area", miss: "poison" },
    { el: "fire",     min: 600, max: 1000, int: 4500, ch: 25, range: 7,
      miss: "fire", alvo: 1 },
    { el: "holy",     min: 500, max: 900, int: 5000, ch: 20, radius: 2,
      fx: "holy-area", miss: "holy" },
  ],
  lookItem: 52836, raceId: 2773, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    /* Loot oficial do Fatal Bug (a entidade que o carrega). */
    { chance: 8,  max: 1, item: "ancient-crypt-rune" },
    { chance: 6,  max: 1, item: "worn-guide-book" },
    /* Mesa genérica de boss Archfoe — consumíveis/gemas da faixa
     * oficial de um Archfoe 450+ (os drops raros acima são os únicos
     * listados na wiki; o restante é aproximação documentada). */
    { chance: 100, max: 48, item: "crystal-coin" },
    { chance: 30, max: 24, item: "supreme-health-potion" },
    { chance: 30, max: 20, item: "ultimate-mana-potion" },
    { chance: 30, max: 20, item: "ultimate-spirit-potion" },
    { chance: 25, max: 8,  item: "red-gem" },
    { chance: 25, max: 8,  item: "yellow-gem" },
    { chance: 15, max: 2,  item: "giant-amethyst" },
  ],
  voices: { int: 6000, ch: 10, list: [
    { t: "BRRRRMM" }, { t: "SHRIIIIIIIEK" }, { t: "I'm bugged!" } ] },
  grupo: "quests",
};

/* Encounter "Under Fire" — Eldritch Dragon Lord (Pits of Inferno).
 * race_id 2739, exp oficial 750.000, cooldown 20h. Resists oficiais
 * "100%?" (neutro) exceto fogo — oficialmente ele se cura com fogo →
 * modelado como imune (resist 100). */
const ELDRITCH_DRAGON_LORD = {
  name: "Eldritch Dragon Lord",
  hp: 680000, exp: 750000,
  speed: 280, armor: 160, defense: 150,
  damage: 1400, element: "fire", attackSpeed: 2000, mitigation: 3.5,
  resist: { fire: 100 },
  skills: [
    { el: "physical", min: 950, max: 1600, int: 2000, ch: 40, range: 1 },
    { el: "fire",     min: 800, max: 1400, int: 3500, ch: 35, range: 7,
      miss: "fire", alvo: 1 },
    { el: "fire",     min: 700, max: 1300, int: 5000, ch: 30, radius: 4,
      fx: "fire-area", miss: "fire" },
    { el: "energy",   min: 600, max: 1100, int: 6000, ch: 25, range: 7,
      miss: "energy", alvo: 1 },
  ],
  looktype: 1879, raceId: 2739, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 60, item: "crystal-coin" },
    { chance: 60,  max: 24, item: "ultimate-spirit-potion" },
    { chance: 60,  max: 38, item: "ultimate-health-potion" },
    { chance: 50,  max: 2,  item: "dragon-tongue" },
    { chance: 45,  max: 2,  item: "wand-of-inferno" },
    { chance: 60,  max: 70, item: "great-mana-potion" },
    { chance: 40,  max: 10, item: "red-gem" },
    { chance: 60,  max: 92, item: "strong-mana-potion" },
    { chance: 40,  max: 10, item: "yellow-gem" },
    { chance: 20,  max: 3,  item: "blue-gem" },
    { chance: 15,  max: 4,  item: "dragon-ham" },
    { chance: 15,  max: 1,  item: "dragonbone-staff" },
    { chance: 15,  max: 1,  item: "dragon-shield" },
    { chance: 15,  max: 1,  item: "fire-sword" },
    { chance: 20,  max: 14, item: "supreme-health-potion" },
    { chance: 20,  max: 24, item: "ultimate-mana-potion" },
    { chance: 15,  max: 3,  item: "giant-amethyst" },
    { chance: 40,  max: 54, item: "great-spirit-potion" },
    { chance: 15,  max: 1,  item: "dragon-slayer" },
    { chance: 4,   max: 1,  item: "golden-claw" },
    { chance: 4,   max: 1,  item: "fiery-crypt-rune" },
  ],
  grupo: "quests",
};

/* Encounter "The Frozen Hoard" — Ice Horror (Okolnir).
 * race_id 2733, hp oficial 542.700, exp 259.000. ice 0% taken →
 * resist ice 100; healMod 0. Abilities oficiais: melee 400+,
 * Death Ring 950+, Great Energy Wave 1300+, Small Bluish Explosion. */
const ICE_HORROR = {
  name: "Ice Horror",
  hp: 542700, exp: 259000,
  speed: 230, armor: 150, defense: 140,
  damage: 1200, element: "ice", attackSpeed: 2000, mitigation: 3.0,
  resist: { ice: 100 },
  skills: [
    { el: "physical", min: 400,  max: 800,  int: 2000, ch: 40, range: 1 },
    { el: "ice",      min: 600,  max: 1000, int: 3500, ch: 30, radius: 3,
      fx: "ice-area", miss: "ice" },
    { el: "death",    min: 950,  max: 1400, int: 5000, ch: 30, radius: 4,
      fx: "mort-area", miss: "sudden-death" },
    { el: "energy",   min: 1300, max: 1900, int: 7000, ch: 25, range: 7,
      miss: "energy", alvo: 1 },
  ],
  looktype: 1881, raceId: 2733, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 49, item: "crystal-coin" },
    { chance: 70,  max: 58, item: "great-spirit-potion" },
    { chance: 40,  max: 1,  item: "ice-rapier" },
    { chance: 50,  max: 17, item: "supreme-health-potion" },
    { chance: 60,  max: 67, item: "great-mana-potion" },
    { chance: 40,  max: 10, item: "red-gem" },
    { chance: 60,  max: 36, item: "ultimate-health-potion" },
    { chance: 40,  max: 1,  item: "frosty-heart" },
    { chance: 20,  max: 1,  item: "crystal-ring" },
    { chance: 20,  max: 2,  item: "pair-of-earmuffs" },
    { chance: 20,  max: 25, item: "ultimate-mana-potion" },
    { chance: 20,  max: 3,  item: "blue-gem" },
    { chance: 60,  max: 90, item: "strong-mana-potion" },
    { chance: 20,  max: 24, item: "ultimate-spirit-potion" },
    { chance: 20,  max: 10, item: "yellow-gem" },
    { chance: 15,  max: 1,  item: "glacier-amulet" },
    { chance: 15,  max: 1,  item: "crystal-mace" },
    { chance: 15,  max: 2,  item: "giant-emerald" },
    { chance: 15,  max: 2,  item: "giant-sapphire" },
    { chance: 6,   max: 1,  item: "frozen-crapace" },
    { chance: 6,   max: 2,  item: "giant-ruby" },
    { chance: 6,   max: 1,  item: "ice-cube" },
    { chance: 6,   max: 1,  item: "icy-horns" },
    { chance: 6,   max: 1,  item: "icy-scales" },
    { chance: 6,   max: 1,  item: "shard" },
    { chance: 4,   max: 1,  item: "icy-crypt-rune" },
  ],
  grupo: "quests",
};

/* Encounter "The Last Dragon Soul" — The Gravedigger (Kha'zeel).
 * race_id 2721, looktype 1880, exp oficial 750.000, cooldown 20h.
 * Abilities: melee, Fire Ball 600–800+, summon 2 Bonelord Totem
 * (o motor não invoca adds — aproximado por área de morte). */
const THE_GRAVEDIGGER = {
  name: "The Gravedigger",
  hp: 720000, exp: 750000,
  speed: 240, armor: 170, defense: 150,
  damage: 1300, element: "physical", attackSpeed: 2000, mitigation: 3.2,
  resist: {},
  skills: [
    { el: "physical", min: 900, max: 1500, int: 2000, ch: 40, range: 1 },
    /* Fire Ball oficial 600–800+. */
    { el: "fire",     min: 600, max: 800,  int: 3500, ch: 35, range: 7,
      miss: "fire", alvo: 1 },
    /* Bonelord Totem → área de morte. */
    { el: "death",    min: 700, max: 1200, int: 6000, ch: 30, radius: 4,
      fx: "mort-area", miss: "sudden-death" },
    { el: "lifedrain", min: 500, max: 900, int: 5000, ch: 25, radius: 3,
      fx: "magic-red" },
  ],
  looktype: 1880, raceId: 2721, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 58, item: "crystal-coin" },
    { chance: 70,  max: 58, item: "great-spirit-potion" },
    { chance: 45,  max: 2,  item: "bonelord-eye" },
    { chance: 40,  max: 1,  item: "necrotic-rod" },
    { chance: 50,  max: 17, item: "supreme-health-potion" },
    { chance: 60,  max: 38, item: "ultimate-health-potion" },
    { chance: 50,  max: 25, item: "ultimate-mana-potion" },
    { chance: 40,  max: 10, item: "yellow-gem" },
    { chance: 40,  max: 26, item: "assassin-star" },
    { chance: 60,  max: 63, item: "great-mana-potion" },
    { chance: 35,  max: 9,  item: "red-gem" },
    { chance: 60,  max: 93, item: "strong-mana-potion" },
    { chance: 40,  max: 1,  item: "terra-rod" },
    { chance: 20,  max: 23, item: "ultimate-spirit-potion" },
    { chance: 15,  max: 2,  item: "bonelord-shield" },
    { chance: 15,  max: 1,  item: "assassin-dagger" },
    { chance: 15,  max: 2,  item: "blue-gem" },
    { chance: 15,  max: 2,  item: "giant-sapphire" },
    { chance: 15,  max: 1,  item: "grave-flower" },
    { chance: 15,  max: 2,  item: "giant-amethyst" },
    { chance: 15,  max: 1,  item: "giant-ruby" },
    { chance: 15,  max: 1,  item: "shrunken-head" },
    { chance: 15,  max: 1,  item: "small-flask-of-eyedrops" },
    { chance: 4,   max: 1,  item: "deathly-crypt-rune" },
  ],
  grupo: "quests",
};

/* Boss final — Bonelord's Phylactery (o loot é oficialmente desta
 * entidade; o Bone Overlord não é criatura real). exp oficial
 * 1.000.000, batalha máx. 900s; earth 110% taken → resist earth -10. */
const BONELORDS_PHYLACTERY = {
  name: "Bonelord's Phylactery",
  hp: 850000, exp: 1000000,
  speed: 0, armor: 180, defense: 160,
  damage: 1400, element: "death", attackSpeed: 2000, mitigation: 3.5,
  resist: { earth: -10 },
  skills: [
    { el: "death",    min: 900, max: 1600, int: 2500, ch: 40, radius: 4,
      fx: "mort-area", miss: "sudden-death" },
    { el: "lifedrain", min: 800, max: 1400, int: 4000, ch: 35, radius: 3,
      fx: "magic-red" },
    { el: "earth",    min: 700, max: 1300, int: 5000, ch: 30, range: 7,
      miss: "poison", alvo: 1 },
    { el: "mana",     min: 300, max: 600,  int: 7000, ch: 25, radius: 4,
      fx: "blue-sparkles" },
  ],
  lookItem: 52831, raceId: 2771, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 60, item: "crystal-coin" },
    { chance: 50,  max: 1,  item: "death-ring" },
    { chance: 45,  max: 2,  item: "bonelord-eye" },
    { chance: 30,  max: 1,  item: "haunted-blade" },
    { chance: 20,  max: 2,  item: "giant-sapphire" },
    { chance: 20,  max: 1,  item: "giant-ruby" },
    { chance: 40,  max: 20, item: "supreme-health-potion" },
    { chance: 20,  max: 2,  item: "blue-gem" },
    { chance: 20,  max: 2,  item: "red-gem" },
    { chance: 20,  max: 2,  item: "yellow-gem" },
    { chance: 25,  max: 1,  item: "unholy-bone" },
    { chance: 20,  max: 1,  item: "skull-tendril" },
    { chance: 20,  max: 1,  item: "soul-trap" },
    { chance: 40,  max: 38, item: "ultimate-health-potion" },
    { chance: 60,  max: 70, item: "great-mana-potion" },
    { chance: 30,  max: 24, item: "ultimate-spirit-potion" },
    { chance: 60,  max: 92, item: "strong-mana-potion" },
    { chance: 40,  max: 54, item: "great-spirit-potion" },
    { chance: 15,  max: 1,  item: "small-flask-of-eyedrops" },
    { chance: 40,  max: 24, item: "ultimate-mana-potion" },
    { chance: 15,  max: 2,  item: "bonelord-shield" },
    { chance: 10,  max: 1,  item: "skull-staff" },
    { chance: 8,   max: 1,  item: "skullcracker-armor" },
    { chance: 8,   max: 1,  item: "spellweavers-robe" },
    { chance: 15,  max: 1,  item: "ancient-scales" },
    { chance: 10,  max: 1,  item: "bone-spikes" },
    { chance: 15,  max: 1,  item: "giant-amethyst" },
    { chance: 15,  max: 2,  item: "giant-emerald" },
    { chance: 8,   max: 1,  item: "skull-helmet" },
    { chance: 4,   max: 1,  item: "necromantic-crypt-rune" },
  ],
  voices: { int: 6000, ch: 12, list: [
    { t: "MY RULE OVER LIFE AND DEATH WILL BE UNCHALLENGED!" },
    { t: "BEHOLD THE LAST OF THE TRUE BONELORDS!" },
    { t: "ALL DRAGON SOULS BELONG TO ME!" },
    { t: "DEATH AWAITS THOSE WHO DEFY ME!" } ] },
  grupo: "quests",
};

const ROOST_MONSTERS = {
  "adventurer-group": ADVENTURER_GROUP,
  "eldritch-dragon-lord": ELDRITCH_DRAGON_LORD,
  "ice-horror": ICE_HORROR,
  "the-gravedigger": THE_GRAVEDIGGER,
  "bonelords-phylactery": BONELORDS_PHYLACTERY,
};

/* ── Boss rooms (OTBMs oficiais z=7; spawn/boss validados por
 * caminhabilidade — ver tools/test_roost_graveborn.js) ── */
const ROOST_ROOMS = {
  "adventurer-group": { otbm: "first_dragon",
    spawn: { x: 1027, y: 1037, z: 7 }, boss: { x: 1028, y: 1031, z: 7 } },
  "eldritch-dragon-lord": { otbm: "eldritch_dl",
    spawn: { x: 1017, y: 1036, z: 7 }, boss: { x: 1021, y: 1028, z: 7 } },
  "ice-horror": { otbm: "ice_horror",
    spawn: { x: 1028, y: 1033, z: 7 }, boss: { x: 1030, y: 1029, z: 7 } },
  "the-gravedigger": { otbm: "gravedigger",
    spawn: { x: 1024, y: 1040, z: 7 }, boss: { x: 1023, y: 1032, z: 7 } },
  "bonelords-phylactery": { otbm: "bonelords_phylactery",
    spawn: { x: 1023, y: 1037, z: 7 }, boss: { x: 1025, y: 1033, z: 7 } },
};

const ROOST_BOSS_META = [
  { id: "adventurer-group", name: "Adventurer Group",
    title: "The First Dragon — Roost of the Graveborn",
    text: "Roost Quest — Missão 1: derrotar 5.000 monstros na Unhallowed Crypt" },
  { id: "eldritch-dragon-lord", name: "Eldritch Dragon Lord",
    title: "Under Fire — Roost of the Graveborn",
    text: "Roost Quest — derrotar o Adventurer Group" },
  { id: "ice-horror", name: "Ice Horror",
    title: "The Frozen Hoard — Roost of the Graveborn",
    text: "Roost Quest — derrotar o Eldritch Dragon Lord" },
  { id: "the-gravedigger", name: "The Gravedigger",
    title: "The Last Dragon Soul — Roost of the Graveborn",
    text: "Roost Quest — derrotar o Ice Horror" },
  { id: "bonelords-phylactery", name: "Bonelord's Phylactery",
    title: "Boss final — Roost of the Graveborn",
    text: "Roost Quest — derrotar os 4 bosses da cadeia" },
];

/* Missão 1: 5.000 kills na Unhallowed Crypt → libera Adventurer Group. */
const ROOST_MISSION_DEFS = {
  "unhallowed-crypt": {
    title: "Missão: Roost of the Graveborn — Unhallowed Crypt",
    tasks: [{
      counter: "kills", target: 5000,
      label: "Eliminar 5000 monstros na Unhallowed Crypt",
    }],
    completeReward: { bossAccess: "adventurer-group", bossName: "Adventurer Group" },
  },
};

/* ── Estado derivado da quest ── */
function roostMissionKills(p, huntId) {
  const st = p && p.missions && p.missions[huntId];
  const prog = (st && st.progress) || {};
  if (Number(prog.kills) > 0) return Number(prog.kills) || 0;
  let sum = 0;
  for (const v of Object.values(prog)) sum += Number(v) || 0;
  return sum;
}

const ROOST_CHAIN = ["adventurer-group", "eldritch-dragon-lord", "ice-horror", "the-gravedigger"];

function roostState(p) {
  const bosses = (p && p.bosses) || {};
  const killed = (slug) => Number(bosses[slug] && bosses[slug].kills) > 0;
  const m1k = roostMissionKills(p, "unhallowed-crypt");
  const m1 = m1k >= 5000 || !!(p && p.missionsDone && p.missionsDone["unhallowed-crypt"]);
  const chainKills = ROOST_CHAIN.filter(killed).length;
  const m2 = chainKills === 4;
  const m3 = killed("bonelords-phylactery");
  const done = (p && p.missionsDone) || {};
  return {
    reqLevel: (p && Number(p.level)) >= 450,
    m1: { done: m1, kills: Math.min(m1k, 5000), target: 5000 },
    m2: { done: m2, kills: chainKills, target: 4 },
    m3: { done: m3, kills: m3 ? 1 : 0, target: 1 },
    chainDone: Object.fromEntries(ROOST_CHAIN.map((id) => [id, killed(id)])),
    runesClaimed: !!done["roost-graveborn:runes"],
    complete: m3,
  };
}

function roostClaim(p, key, value) {
  p.missionsDone = p.missionsDone || {};
  p.missionsDone["roost-graveborn:" + key] = value === undefined ? true : value;
  if (typeof syncMissionsToAccount === "function") syncMissionsToAccount(p);
}

/* Recompensa final: 1 de cada Crypt Rune — auto-resgata ao abrir a
 * quest quando a Phylactery foi derrotada. */
function roostGrantRunes(p) {
  for (const slug of CRYPT_RUNES)
    if (typeof addLootPouch === "function") addLootPouch(p, slug, 1);
}

/* ── UI: detail renderer ── */
function renderRoostQuestDetail(q, ui) {
  if (typeof mbStopRoulettes === "function") mbStopRoulettes();
  const p = G.p;
  if (typeof pullAccountMissions === "function") pullAccountMissions(p);
  let st = roostState(p);
  /* Missão 3 concluída → 1 de cada runa, automaticamente. */
  if (p && st.m3.done && !st.runesClaimed) {
    roostGrantRunes(p);
    roostClaim(p, "runes");
    if (typeof addLog === "function")
      addLog("level", "Roost of the Graveborn: recebeu <b>1 de cada Crypt Rune</b>!");
    if (typeof toast === "function")
      toast("Recompensa: 1 de cada Crypt Rune!", "level");
  }
  st = roostState(p);
  const fmtK = (n) => (typeof fmtFull === "function" ? fmtFull(n) : String(n));
  const reqRow = (label, ok) =>
    `<div class="shop-row"><span class="info">${label}</span><b style="color:${ok ? "#9ce84a" : "#ff9a6a"}">${ok ? "✓" : "✗"}</b></div>`;
  const mobThumbs = (slugs) => `<span class="mb-mission-mobs">` +
    (slugs || []).map((s) => typeof mobImg === "function" ? mobImg(s, 30) : "").join("") + `</span>`;
  const mission = (num, label, m, reward, mobs) =>
    `<div class="mb-mission${m.done ? " done" : ""}">
      <div class="mb-mission-head"><span class="mb-mission-title">${mobThumbs(mobs)}<span class="info">Missão ${num} — ${label}</span></span>
        <b class="mb-mission-prog">${m.done ? "✓ " : ""}${fmtK(m.kills)}/${fmtK(m.target)}</b></div>
      <div class="mb-mission-bar"><div class="mb-mission-fill" style="width:${Math.min(100, Math.round(100 * m.kills / m.target))}%"></div></div>
      <div class="mb-mission-reward">Recompensa: ${reward}</div>
    </div>`;
  const lp = (p && p.lootPouch) || {};
  const runeRow = CRYPT_RUNES.map((slug) => {
    const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
    const n = lp[slug] || 0;
    return `<div class="shop-row"><span class="info">${typeof mbItemIcon === "function" ? mbItemIcon(slug, 24) : ""} ${it.n || slug}</span><b>${n}x</b></div>`;
  }).join("");
  const chainMobs = ROOST_CHAIN;

  ui.body.innerHTML = `<div class="panel-title">${q.name} — Level ${q.level}+<span class="spacer"></span><button class="sm" id="boss-quest-close">Fechar</button></div>
    <div class="panel-body quest-detail-body">
      <div class="quest-detail-desc">${q.description || ""}</div>
      <div class="mb-detail-cols">
        <div>
          <section class="quest-detail-panel"><div class="hunt-best-title">REQUISITOS</div>
            ${reqRow("Level 450+", st.reqLevel)}
            <div class="tiny dim">A cadeia de bosses é sequencial: cada um libera o próximo.</div>
          </section>
          <section class="quest-detail-panel" style="margin-top:8px"><div class="hunt-best-title">MISSÕES</div>
            ${mission(1, "Eliminar monstros na Unhallowed Crypt", st.m1, "acesso ao boss Adventurer Group", ["creepy-crawler", "crypt-construct", "crypt-fiend"])}
            ${mission(2, "Derrotar a cadeia de 4 bosses em sequência", st.m2, "acesso ao boss Bonelord's Phylactery", chainMobs)}
            ${mission(3, "Derrotar o Bonelord's Phylactery", st.m3, "1 de cada Crypt Rune (5 runas)", ["bonelords-phylactery"])}
          </section>
        </div>
        <section class="quest-detail-panel"><div class="hunt-best-title">CRYPT RUNES — leve ao Dragon Ancestor Spirit</div>
          ${runeRow}
          <div class="tiny dim" style="margin-top:6px">Com 1 de cada runa, o NPC <b>Dragon Ancestor Spirit</b> (aba NPCs) troca por <b>1 arma Crypt aleatória</b> — Crypt Spine, Slicer, Bile, Strike, Splitter, Breaker ou Jaw.</div>
        </section>
      </div>
      <button class="sm" id="boss-quest-back">Voltar</button>
    </div>`;

  $("#boss-quest-close").onclick = () => {
    if (typeof mbStopRoulettes === "function") mbStopRoulettes();
    ui.modal.classList.remove("show");
    ui.body.classList.remove("quest-detail-shell");
  };
  $("#boss-quest-back").onclick = () => {
    if (typeof mbStopRoulettes === "function") mbStopRoulettes();
    if (typeof openQuestsModal === "function") openQuestsModal();
  };
}

/* ── NPC Dragon Ancestor Spirit — troca 1 de cada runa por 1 arma ── */
function roostRuneCounts(p) {
  const lp = (p && p.lootPouch) || {};
  return CRYPT_RUNES.map((slug) => ({ slug, have: lp[slug] || 0 }));
}

function roostCanExchange(p) {
  return roostRuneCounts(p).every((r) => r.have > 0);
}

/* Sorteio ponderado pelas quantidades oficiais (82/79/76/75/73/69/64). */
function roostRollWeapon() {
  const total = CRYPT_WEAPONS.reduce((s, w) => s + w.qty, 0);
  let roll = Math.random() * total;
  for (const w of CRYPT_WEAPONS) { roll -= w.qty; if (roll <= 0) return w.slug; }
  return CRYPT_WEAPONS[CRYPT_WEAPONS.length - 1].slug;
}

function npcCryptExchangeHtml(p) {
  const rows = roostRuneCounts(p).map((r) => {
    const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[r.slug]) || {};
    const ok = r.have > 0;
    return `<div class="shop-row" style="opacity:${ok ? 1 : .5}">
      <span class="info">${typeof mbItemIcon === "function" ? mbItemIcon(r.slug, 26) : ""} ${it.n || r.slug}</span>
      <b style="color:${ok ? "#9ce84a" : "#ff9a6a"}">${r.have}x</b></div>`;
  }).join("");
  const can = roostCanExchange(p);
  return `<section class="quest-detail-panel mb-reward-box">
    <div class="hunt-best-title">TROCAR CRYPT RUNES</div>
    ${rows}
    <div class="tiny dim mb8">Traga 1 de cada runa e eu a transformo numa arma Crypt.</div>
    <div class="mb-roulette-frame"><span class="mb-roulette-icon" id="roost-exchange-icon">${typeof mbItemIcon === "function" ? mbItemIcon(CRYPT_WEAPONS[0].slug, 52) : ""}</span></div>
    <div class="mb-roulette-name tiny" id="roost-exchange-name">???</div>
    <button type="button" class="sm primary quest-action" id="roost-exchange-btn" ${can ? "" : "disabled"}>TROCAR</button>
    ${can ? "" : `<div class="mb-reward-state dim">🔒 faltam runas (derrote os bosses da Roost Quest)</div>`}
  </section>`;
}

/* Wiring do botão — chamado pelo bindNpc("crypt-exchange"). */
function roostBindExchange() {
  const p = G.p;
  const slugs = CRYPT_WEAPONS.map((w) => w.slug);
  if (typeof mbStopRoulettes === "function") mbStopRoulettes();
  if (typeof mbStartPreview === "function") mbStartPreview("roost-exchange", slugs);
  const btn = $("#roost-exchange-btn");
  if (!btn) return;
  btn.onclick = () => {
    if (btn.disabled || !roostCanExchange(p)) return;
    btn.disabled = true;
    /* Debita ANTES do giro (persiste a troca mesmo se fechar). */
    for (const slug of CRYPT_RUNES)
      if (typeof removeLootPouch === "function") removeLootPouch(p, slug, 1);
    const win = roostRollWeapon();
    if (typeof addLootPouch === "function") addLootPouch(p, win, 1);
    if (typeof syncMissionsToAccount === "function") syncMissionsToAccount(p);
    if (typeof mbStopRoulettes === "function") mbStopRoulettes();
    if (typeof mbSpinTo === "function") {
      mbSpinTo("roost-exchange", slugs, win, () => {
        const name = win.replace(/-/g, " ");
        if (typeof addLog === "function")
          addLog("level", `Dragon Ancestor Spirit: a roleta parou em <b>${name}</b>!`);
        if (typeof toast === "function") toast(`Recompensa: <b>${name}</b>`, "level");
        /* Re-renderiza o painel do NPC (runas já debitadas). */
        const content = $("#npc-content");
        if (content) content.innerHTML = npcCryptExchangeHtml(p);
        roostBindExchange();
      });
    }
  };
}

/* ── Registro ── */
(function registerRoostGraveborn() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in ROOST_ITEMS) {
    const def = ROOST_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }

  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA)
    for (const slug in ROOST_MONSTERS)
      MONSTERDATA[slug] = ROOST_MONSTERS[slug];
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in ROOST_MONSTERS)
    GAMEDATA.monsters[slug] = ROOST_MONSTERS[slug];

  /* Hunts técnicas invisíveis — câmaras dos 5 bossrooms. */
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  for (const bossId in ROOST_ROOMS) {
    const room = ROOST_ROOMS[bossId];
    const mon = ROOST_MONSTERS[bossId];
    GAMEDATA.hunts[bossId + "-room"] = {
      name: mon.name + " Room",
      hidden: true,
      level: 450, minLevel: 450,
      monsters: [bossId],
      color: "#3a2a4a",
      scene: "crypt",
      otbm: room.otbm,
      otbmFloor: 7,
      otbmSpawn: room.spawn,
      otbmMobBounds: { x: room.boss.x, y: room.boss.y, w: 1, h: 1, z: 7 },
      avgHp: mon.hp, avgExp: mon.exp, avgDamage: mon.damage, avgArmor: mon.armor,
      avgGold: 500, respawn: 1, pack: 1, cat: "boss-room",
    };
  }

  if (typeof MISSION_DEFS !== "undefined")
    Object.assign(MISSION_DEFS, ROOST_MISSION_DEFS);

  if (typeof QUEST_DEFS !== "undefined") {
    QUEST_DEFS[ROOST_QUEST_ID] = {
      id: ROOST_QUEST_ID,
      name: "The Roost of the Graveborn Quest",
      level: 450,
      questType: "boss",
      worldQuest: true,
      playable: false,
      icon: "small-treasure-chest",
      bossSprite: "bonelords-phylactery",
      description: "A quest do update 15.20: uma horda de dragões sob o controle do Necromancer. Elimine 5.000 monstros na Unhallowed Crypt, derrote a cadeia de 4 bosses — Adventurer Group (The First Dragon), Eldritch Dragon Lord (Under Fire), Ice Horror (The Frozen Hoard) e The Gravedigger (The Last Dragon Soul) — para abrir a câmara do Bonelord's Phylactery. A vitória rende 1 de cada Crypt Rune; o Dragon Ancestor Spirit troca um set completo por uma arma Crypt aleatória.",
      renderDetail: renderRoostQuestDetail,
    };
  }

  if (typeof BOSS_DEFS !== "undefined") {
    const reqs = {
      "adventurer-group": { level: 450, mission: "unhallowed-crypt",
        access: "adventurer-group", enforced: true, text: ROOST_BOSS_META[0].text },
      "eldritch-dragon-lord": { level: 450, killsRequired: ["adventurer-group"],
        enforced: true, text: ROOST_BOSS_META[1].text },
      "ice-horror": { level: 450, killsRequired: ["eldritch-dragon-lord"],
        enforced: true, text: ROOST_BOSS_META[2].text },
      "the-gravedigger": { level: 450, killsRequired: ["ice-horror"],
        enforced: true, text: ROOST_BOSS_META[3].text },
      "bonelords-phylactery": { level: 450,
        killsRequired: ["adventurer-group", "eldritch-dragon-lord", "ice-horror", "the-gravedigger"],
        enforced: true, text: ROOST_BOSS_META[4].text },
    };
    for (const meta of ROOST_BOSS_META) {
      const mon = ROOST_MONSTERS[meta.id];
      BOSS_DEFS[meta.id] = {
        id: meta.id,
        name: meta.name,
        title: meta.title,
        hunt: meta.id + "-room",
        baseMonster: meta.id,
        sprite: meta.id,
        hp: mon.hp, exp: mon.exp, damage: mon.damage,
        armor: mon.armor, defense: mon.defense,
        requirement: reqs[meta.id],
        cooldown: ROOST_COOLDOWN_MS,
      };
    }
    if (typeof BOSS_MODAL_SECTIONS !== "undefined")
      BOSS_MODAL_SECTIONS.push({
        title: "ROOST OF THE GRAVEBORN 450+",
        minLevel: 450,
        ids: ROOST_BOSS_META.map((m) => m.id),
      });
  }

  /* NPC Dragon Ancestor Spirit — troca runas por arma Crypt. */
  if (typeof NPCS !== "undefined") {
    NPCS["dragon-ancestor-spirit"] = {
      name: "Dragon Ancestor Spirit",
      role: "Troca Crypt Runes",
      sprite: "dragon-ancestor-spirit",
      greet: "Mortals' greed split my kin. Bring me the five crypt runes and I shall forge them into a weapon worthy of a dragon's heir.",
      type: "crypt-exchange",
    };
  }
  if (typeof NPC_MODAL_CATALOG !== "undefined" &&
      !NPC_MODAL_CATALOG.some((e) => e.shop === "dragon-ancestor-spirit")) {
    NPC_MODAL_CATALOG.push({
      shop: "dragon-ancestor-spirit",
      name: "Dragon Ancestor Spirit",
      role: "Troca Crypt Runes",
      sprite: "dragon-ancestor-spirit",
      desc: "Troca 1 de cada Crypt Rune por uma arma Crypt aleatória.",
    });
  }
})();

const ROOST_DATA = {
  CRYPT_RUNES, CRYPT_WEAPONS, ROOST_ITEMS, ROOST_MONSTERS,
  ROOST_ROOMS, ROOST_MISSION_DEFS, ROOST_QUEST_ID,
  monsterSlugs: Object.keys(ROOST_MONSTERS),
  roostRollWeapon, roostCanExchange, roostState,
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug of Object.keys(ROOST_MONSTERS))
      monsters[slug] = ROOST_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = ROOST_DATA;
