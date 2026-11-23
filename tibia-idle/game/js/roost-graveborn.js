/* roost-graveborn.js — The Roost of the Graveborn Quest (level 450+,
 * update 15.20).
 *
 * Progressão (conforme pedido):
 *   Missão 1 — derrotar 500 monstros da Unhallowed Crypt
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
  /* Entidade final do encontro (oficial): o Fatal Bug só aparece depois
   * que os 5 aventureiros e seus avatares caem. O nome do BOSS (UI) fica
   * em ROOST_BOSS_META; aqui vai o nome real da criatura. */
  name: "Fatal Bug",
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
  /* Sprite oficial: o Fatal Bug usa a mesma sprite do Ancient Scarab
   * (looktype 79 — confirmado ingame; a ficha de "relíquia" lookItem
   * 52836 renderizava um troféu estático errado). */
  looktype: 79, raceId: 2773, targetDistance: 1,
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

/* ── Adventurer Group — encontro oficial multi-membro ─────────────────
 * Oficial (tibiawiki): a sala tem 5 criaturas, uma por vocação. Quando
 * QUALQUER uma chega à vida vermelha (~30%), ela se transforma no avatar
 * da sua vocação: todos os ataques viram críticos e ela sofre menos dano.
 * A Bright Crystal estática explode em Mana Drain AoE ao ser atingida até
 * a morte. Só depois dos 5 (membros+avatares) mortos surge o Fatal Bug.
 * race_ids oficiais: yorik 2712, percy 2713, grendel 2714, fiona 2715,
 * nigel 2716. HP só é público para Nigel (155.000) — os demais usam o
 * mesmo patamar (estimado). exp 0 oficial: o XP do encontro (750.000)
 * vem todo do Fatal Bug. looktypes dos avatares = outfits oficiais das
 * vocações (Steel 1593, Light 1594, Storm 1595, Nature 1596, Balance 1823).
 * looktypes dos membros: staticdata do client 15.20
 * (yorik 268, percy 137, grendel 144, fiona 1681, nigel 1837). ATENÇÃO:
 * os atlases de sprite desses outfits NÃO estão no cache de refs — o
 * DAT convertido renderiza placeholders (cavaleiro cinza) para eles.
 * Os PNGs em assets/mob/ foram montados dos GIFs oficiais da wiki. */
const AG_TRANSFORM_PCT = 0.30;
const AG_MEMBER_BASE = {
  hp: 155000, exp: 0, speed: 210, armor: 90, defense: 80,
  damage: 800, attackSpeed: 2000, mitigation: 2.0, targetDistance: 1,
  imune: ["paralyze", "invisible"], loot: [], grupo: "quests",
};
function agMember(name, raceId, looktype, avatar, skills, extra) {
  return Object.assign({}, AG_MEMBER_BASE, {
    name, raceId, looktype, agTransform: avatar,
    skills: skills.slice(),
  }, extra || {});
}
function agAvatar(name, looktype, skills, extra) {
  return Object.assign({}, AG_MEMBER_BASE, {
    name, looktype,
    /* Avatar oficial: crítico em todos os ataques + sofre menos dano. */
    damageTakenMul: 0.70,
    skills: skills.slice(),
  }, extra || {});
}
const YORIK_YOUNGBOOK = agMember("Yorik Youngbook", 2712, 268, "avatar-of-steel", [
  { el: "physical", min: 800, max: 1400, int: 2000, ch: 45, range: 1 },
  { el: "physical", min: 700, max: 1200, int: 5000, ch: 30, radius: 2,
    fx: "groundshaker" },
]);
const PERCY_PEACETINKER = agMember("Percy Peacetinker", 2713, 137, "avatar-of-light", [
  { el: "physical", min: 700, max: 1200, int: 2000, ch: 45, range: 7,
    miss: "holy", alvo: 1 },
  { el: "holy",     min: 600, max: 1100, int: 4500, ch: 30, radius: 3,
    fx: "holy-area", miss: "holy" },
]);
const GRENDEL_GREENLUNCH = agMember("Grendel Greenlunch", 2714, 144, "avatar-of-nature", [
  { el: "earth",    min: 700, max: 1200, int: 3000, ch: 40, radius: 3,
    fx: "poison-area", miss: "poison" },
  { el: "ice",      min: 600, max: 1000, int: 5000, ch: 30, range: 7,
    miss: "ice", alvo: 1 },
]);
const FIONA_FIRSTDREAM = agMember("Fiona Firstdream", 2715, 1681, "avatar-of-storm", [
  { el: "fire",     min: 700, max: 1300, int: 3000, ch: 40, radius: 3,
    fx: "fire-area", miss: "fire" },
  { el: "energy",   min: 800, max: 1400, int: 5000, ch: 30, range: 7,
    miss: "energy", alvo: 1 },
]);
const NIGEL_NEVERGUESS = agMember("Nigel Neverguess", 2716, 1837, "avatar-of-balance", [
  { el: "physical", min: 800, max: 1400, int: 2000, ch: 45, range: 1 },
  { el: "energy",   min: 600, max: 1000, int: 4500, ch: 30, radius: 2,
    fx: "energy-area", miss: "energy" },
]);
const AVATAR_OF_STEEL  = agAvatar("Avatar of Steel",  1593, YORIK_YOUNGBOOK.skills,
  { raceId: 2712 });
const AVATAR_OF_LIGHT  = agAvatar("Avatar of Light",  1594, PERCY_PEACETINKER.skills,
  { raceId: 2713 });
const AVATAR_OF_NATURE = agAvatar("Avatar of Nature", 1596, GRENDEL_GREENLUNCH.skills,
  { raceId: 2714 });
const AVATAR_OF_STORM  = agAvatar("Avatar of Storm",  1595, FIONA_FIRSTDREAM.skills,
  { raceId: 2715 });
const AVATAR_OF_BALANCE= agAvatar("Avatar of Balance",1823, NIGEL_NEVERGUESS.skills,
  { raceId: 2716 });
/* Bright Crystal: objeto hostil estático da sala. Não ataca nem anda;
 * quando recebe dano suficiente explode em Mana Drain AoE (raio 2) —
 * tratado em tickAdventurerGroup. looktype estimado 1902 (sprite estático
 * do lote 15.20). */
const BRIGHT_CRYSTAL = {
  name: "Bright Crystal", hp: 30000, exp: 0,
  speed: 0, armor: 0, defense: 0, damage: 0, attackSpeed: 2000,
  targetDistance: 1, noAttack: true, looktype: 1902,
  loot: [], grupo: "quests", imune: ["paralyze", "invisible"],
};
/* Slots fixos dos membros ao redor do bossspawn oficial {1030,1027} —
 * vira cx/cy relativos no init (o spawn absoluto depende do room). */
const AG_MEMBER_SPAWNS = [
  { slug: "yorik-youngbook",    dx: 0,  dy: 0  },
  { slug: "fiona-firstdream",   dx: 2,  dy: 0  },
  { slug: "grendel-greenlunch", dx: -2, dy: 0  },
  { slug: "percy-peacetinker",  dx: 1,  dy: 2  },
  { slug: "nigel-neverguess",   dx: -1, dy: 2  },
];
const AG_CRYSTAL_OFFSET = { dx: -1, dy: 6 }; // {1029,1033} — ao lado do player spawn

/* ── Eldritch Dragon Lord — vulcões oficiais ──────────────────────────
 * Oficial (tibiawiki): 4 Pulsating Lavas espalhados pela sala; a cada
 * turno acumulam vida e evoluem Pulsating Lava → Eruption → Flame Totem.
 * Com 3+ Flame Totems vivos simultâneos o boss fica IMORTAL (sem dano).
 * Os vulcões são OBJETOS (lookItem): Eruption objectID 51952 e Flame
 * Totem objectID 51953 oficiais no wikitext; o Pulsating Lava não tem
 * objectID público → aproximação: lava vent 391 (documentado).
 * Spawns oficiais (enunciado): {1017,1024} {1026,1024} {1016,1034}
 * {1026,1033} → offsets vs bossspawn {1021,1024}. exp 0/loot vazio —
 * são hazards do encontro, não recompensa. */
const ELD_STAGE_MS = 18000;      // ~"a cada turno" — 18s por estágio
const ELD_RESPAWN_MS = 30000;    // vent destruído volta como lava
const ELD_TOTEM_IMMUNE = 3;      // 3+ totens → boss imortal
const ELD_VENT_BASE = {
  speed: 0, armor: 0, defense: 0, damage: 0, attackSpeed: 2000,
  targetDistance: 1, exp: 0, loot: [], grupo: "quests",
  imune: ["paralyze", "invisible"], staticAttack: 0,
};
const PULSATING_LAVA = Object.assign({}, ELD_VENT_BASE, {
  name: "Pulsating Lava", hp: 15000, noAttack: true,
  lookItem: 391, eldStage: { next: "eruption" },
});
const ERUPTION = Object.assign({}, ELD_VENT_BASE, {
  name: "Eruption", hp: 20000, noAttack: true,
  lookItem: 51952, eldStage: { next: "flame-totem" },
});
/* Flame Totem oficial: ATACA (nova de fogo) — o totem é o perigo real. */
const FLAME_TOTEM = Object.assign({}, ELD_VENT_BASE, {
  name: "Flame Totem", hp: 25000,
  lookItem: 51953,
  skills: [{ el: "fire", min: 500, max: 800, int: 3000, ch: 35,
    radius: 2, fx: "fire-area", miss: "fire" }],
});
const ELD_VENT_SPAWNS = [       // offsets vs bossspawn oficial {1021,1024}
  { dx: -4, dy: 0 }, { dx: +5, dy: 0 }, { dx: -5, dy: +10 }, { dx: +5, dy: +9 },
];
const AG_CRYSTAL_MANA_DRAIN_PCT = 35;   // % da mana máxima drenada
const AG_CRYSTAL_RADIUS = 2;

/* ── Ice Horror — Ice Crawlers invocados ──────────────────────────────
 * Oficial (tibiawiki): "Ele invoca Ice Crawlers para a batalha" e a ficha
 * do Ice Crawler diz "looks the same as a Crystal Spider" → a sprite é a
 * da crystal-spider clássica (png copiada p/ ice-crawler.png, mesma
 * âncora). Stats oficiais ocultos (monstro do encontro, hp/exp "?") →
 * estimados para um add de boss 450+; cap/intervalo de invocação não são
 * publicados → IH_CRAWLER_MAX/IH_SUMMON_MS documentados como design. */
const IH_CRAWLER_MAX = 3;        // máx. crawlers vivos simultâneos
const IH_SUMMON_MS = 12000;      // intervalo entre invocações
const ICE_CRAWLER = {
  name: "Ice Crawler",
  hp: 25000, exp: 0,
  speed: 115, armor: 43, defense: 0,
  damage: 800, element: "ice", attackSpeed: 2000, mitigation: 0,
  resist: { ice: 100 },
  skills: [
    { el: "ice", min: 400, max: 700, int: 3500, ch: 30, radius: 2,
      fx: "ice-area", miss: "ice" },
  ],
  targetDistance: 1, staticAttack: 90,
  imune: ["paralyze", "invisible"],
  voices: { int: 5000, ch: 10, list: [{ t: "Chrrrk!" }] },
  loot: [], grupo: "quests",
};

/* ── The Gravedigger — Bonelord Totems invocados ──────────────────────
 * Oficial (wikitext): {{Summon|Bonelord Totem|amount=2}} — o boss invoca
 * até 2 totens. A ficha do Bonelord Totem lista objectID 51192 e TODOS
 * os damage mods a 0% → objeto-hazard INVULNERÁVEL (damageTakenMul 0 no
 * funnel; o jogador não o destrói — esquiva). A "área de morte" é o seu
 * ataque documentado; dano/intervalo não são publicados → estimados. */
const GD_TOTEM_MAX = 2;          // oficial: Summon amount=2
const GD_SUMMON_MS = 15000;      // intervalo não publicado → design
const BONELORD_TOTEM = {
  name: "Bonelord Totem",
  hp: 20000, exp: 0,
  speed: 0, armor: 0, defense: 0,
  damage: 0, element: "death", attackSpeed: 2000, mitigation: 0,
  damageTakenMul: 0,             // oficial: todos os dmg mods 0%
  skills: [
    { el: "death", min: 500, max: 900, int: 4000, ch: 40, radius: 3,
      fx: "mort-area", miss: "sudden-death" },
  ],
  lookItem: 51192, targetDistance: 1, staticAttack: 90,
  imune: ["paralyze", "invisible"],
  loot: [], grupo: "quests",
};

/* ── Bone Overlord / Bonelord's Phylactery — encontro oficial ─────────
 * Fonte: wikitext da quest (Spoiler). A sala abre com 4 Soulcages
 * (objectID oficial 52546) ligadas a 4 dragon Spirits; as cages têm HP
 * pool COMPARTILHADO (dano em qualquer uma drena o pool; espírito perto
 * da sua cage cura +5000/turno e teleporta à cage quando o pool baixa).
 * Spirits são IMUNES (damageTakenMul 0) e aplicam a condição da sua cage.
 * Pool zerado → Bonelord's Phylactery (o boss) + 4 Enthralled Dragons
 * spawnam ao sul. Durante TODA a luta o Bone Overlord aplica "gazes":
 * Eye (explode 30% maxHP), Wraithfire (15% hp atual), Mana Drain
 * (5% maxMP/2s x5), Curse (explode a cada 4s x4), Bone Barrier
 * (barreiras 10k hp — oficialmente teleporta p/ sala lateral; aqui
 * barreiras cercam o jogador e devem ser quebradas, simplificação
 * documentada).
 * Looktypes: nenhum publicado p/ summons → estimados do lote livre
 * 15.20 (1883=dragão espectral, 1886/1903/1904/1905=bestas espectrais).
 * An Eye: hp oficial 0, dmg mods 0%, some em 5s; sprite ≈ bonelord-eye
 * item 5898. Bone Barrier objectID oficial 6972, hp 10.000. Wraithfire
 * itemid oficial 52441 (campo de chão). */
const BO_CAGE_POOL = 120000;     // Elyrax's Soulcage hp oficial 120k (pool compartilhado)
const BO_GAZE_MS = 20000;        // intervalo entre gazes do overlord
const BO_EYE_FUSE_MS = 5000;     // oficial: "After 5 seconds, it disappears"
const BO_EYE_RADIUS = 2;         // 3sqm ball → raio ~2
const BO_EYE_PCT = 30;           // 20-30% max HP → usamos 30 (teto oficial)
const BO_WRAITH_PCT = 15;        // 15% hp atual
const BO_MANA_TICKS = 5, BO_MANA_PCT = 5, BO_MANA_MS = 2000;
const BO_CURSE_TICKS = 4, BO_CURSE_MS = 4000;
const BO_CAGE_HEAL = 5000;       // "up to 5,000+ per turn"
const BO_SPIRIT_LINK_RADIUS = 2; // espírito perto da cage → cura
const BO_TELEPORT_PCT = 0.5;     // pool <50% → spirit teleporta à cage

const SOULCAGE_BASE = {
  speed: 0, armor: 0, defense: 0, damage: 0, attackSpeed: 2000,
  targetDistance: 1, exp: 0, loot: [], grupo: "quests", noAttack: true,
  imune: ["paralyze", "invisible"], staticAttack: 0,
  lookItem: 52546, boCage: true,
};
const ZHARVORINS_SOULCAGE = Object.assign({}, SOULCAGE_BASE, {
  name: "Zharvorin's Soulcage", hp: BO_CAGE_POOL,
  resist: { death: -50, physical: -50 },           // oficial: weak Death+Physical
  boCond: "rooted", boCorner: "ne",
});
const MYZARETHS_SOULCAGE = Object.assign({}, SOULCAGE_BASE, {
  name: "Myzareth's Soulcage", hp: BO_CAGE_POOL,
  resist: { energy: -50 },                          // oficial: weak Energy
  boCond: "feared", boCorner: "nw",
});
const SCARITHS_SOULCAGE = Object.assign({}, SOULCAGE_BASE, {
  name: "Scarith's Soulcage", hp: BO_CAGE_POOL, mitigation: 3.45, // oficial
  resist: { ice: -50, earth: 75, fire: 50 },        // oficial: weak Ice; earth 25%/fire 50%
  boCond: "drunk", boCorner: "sw",
});
const ELYRAXS_SOULCAGE = Object.assign({}, SOULCAGE_BASE, {
  name: "Elyrax's Soulcage", hp: BO_CAGE_POOL,      // hp oficial 120.000
  resist: { death: -50, holy: -50 },                // oficial: weak Death+Holy
  boCond: "slowed", boCorner: "se",
  skills: [{ el: "holy", min: 1600, max: 2200, int: 6000, ch: 25,
    range: 7, miss: "holy", alvo: 1 }],             // Holy Chain 1600+ oficial
  noAttack: false,
});

const SPIRIT_BASE = {
  speed: 200, armor: 0, defense: 0, damage: 500,
  element: "death", attackSpeed: 2000, mitigation: 0,
  damageTakenMul: 0,   // oficial: "dragon Spirits are immune to all damage"
  targetDistance: 1, staticAttack: 90, exp: 0, loot: [], grupo: "quests",
  imune: ["paralyze", "invisible"], boSpirit: true,
  skills: [
    /* Energy Missile 450+ oficial (3sqm strike). */
    { el: "energy", min: 450, max: 700, int: 5000, ch: 30, range: 7,
      miss: "energy", alvo: 1 },
    /* Bleed Explosion 800+ oficial (3sqm ball self). */
    { el: "physical", min: 800, max: 1100, int: 8000, ch: 25, radius: 2,
      fx: "draw-blood", cond: "bleed" },
  ],
};
const ZHARVORINS_SPIRIT = Object.assign({}, SPIRIT_BASE, {
  name: "Zharvorin's Spirit", looktype: 1884, boCond: "rooted", boCageSlug: "zharvorins-soulcage",
  skills: SPIRIT_BASE.skills.concat([
    { el: "earth", min: 0, max: 0, int: 15000, ch: 40, range: 7, n: "root" }]),
});
const MYZARETHS_SPIRIT = Object.assign({}, SPIRIT_BASE, {
  name: "Myzareth's Spirit", looktype: 1886, boCond: "feared", boCageSlug: "myzareths-soulcage",
  skills: SPIRIT_BASE.skills.concat([
    { el: "death", min: 0, max: 0, int: 15000, ch: 40, range: 7, n: "fear", miss: "death", fx: "mort-area" }]),
});
const SCARITHS_SPIRIT = Object.assign({}, SPIRIT_BASE, {
  name: "Scarith's Spirit", looktype: 1905, boCond: "drunk", boCageSlug: "scariths-soulcage",
  skills: SPIRIT_BASE.skills.concat([
    { el: "ice", min: 0, max: 0, int: 15000, ch: 40, range: 7, n: "drunk", miss: "ice", fx: "ice-attack" }]),
});
const ELYRAXS_SPIRIT = Object.assign({}, SPIRIT_BASE, {
  name: "Elyrax's Spirit", looktype: 1904, boCond: "slowed", boCageSlug: "elyraxs-soulcage",
  skills: SPIRIT_BASE.skills.concat([
    { el: "holy", min: 0, max: 0, int: 15000, ch: 40, range: 7, n: "slowed", miss: "holy" }]),
});

const ENTHRALLED_DRAGON = {
  name: "Enthralled Dragon",
  hp: 45000, exp: 0,                          // hp oculto oficialmente → estimado
  speed: 210, armor: 60, defense: 55,
  damage: 900, element: "physical", attackSpeed: 2000, mitigation: 0,
  resist: { fire: 100, energy: 100, earth: 100 }, // oficial: walksthrough Fire/Energy/Poison
  skills: [
    /* "vital to equip life drain protection" (wiki) → melee + dreno. */
    { el: "lifedrain", min: 600, max: 1000, int: 4000, ch: 35, range: 1,
      fx: "magic-red" },
    { el: "fire", min: 400, max: 700, int: 6000, ch: 25, radius: 2,
      fx: "fire-area", miss: "fire" },
  ],
  looktype: 1883, targetDistance: 1, staticAttack: 90,
  imune: ["paralyze", "invisible"],
  loot: [], grupo: "quests", boDragon: true,
};
const AN_EYE = {
  name: "An Eye", hp: 1, exp: 0,
  speed: 0, armor: 0, defense: 0, damage: 0, attackSpeed: 2000,
  damageTakenMul: 0,                          // oficial: dmg mods 0%
  targetDistance: 1, staticAttack: 0, noAttack: true,
  lookItem: 5898, boEye: true,               // ≈ bonelord eye 5898
  imune: ["paralyze", "invisible"], loot: [], grupo: "quests",
};
const BONE_BARRIER = {
  name: "Bone Barrier", hp: 10000, exp: 0,    // hp oficial 10.000
  speed: 0, armor: 0, defense: 0, damage: 0, attackSpeed: 2000,
  targetDistance: 1, staticAttack: 0, noAttack: true,
  lookItem: 6972, boBarrier: true,           // objectID oficial 6972
  imune: ["paralyze", "invisible"], loot: [], grupo: "quests",
};
const WRAITHFIRE = {
  name: "Wraithfire", hp: 1, exp: 0,
  speed: 0, armor: 0, defense: 0, damage: 0, attackSpeed: 2000,
  damageTakenMul: 0, targetDistance: 1, staticAttack: 0, noAttack: true,
  lookItem: 52441, boField: true,            // itemid oficial 52441
  imune: ["paralyze", "invisible"], loot: [], grupo: "quests",
};

/* Offsets das 4 cages vs bossspawn {1026,1025} — cantos da sala
 * (oficial: NE/NW/SW/SE). */
const BO_CAGE_SPAWNS = [
  { slug: "zharvorins-soulcage", spirit: "zharvorins-spirit", dx: +8, dy: -5 },
  { slug: "myzareths-soulcage", spirit: "myzareths-spirit", dx: -12, dy: -5 },
  { slug: "scariths-soulcage", spirit: "scariths-spirit", dx: -12, dy: +12 },
  { slug: "elyraxs-soulcage", spirit: "elyraxs-spirit", dx: +8, dy: +12 },
];
const BO_DRAGON_SPAWNS = [           // "spawn south of the room"
  { dx: 0, dy: +12 }, { dx: +2, dy: +12 }, { dx: -2, dy: +12 }, { dx: +4, dy: +12 },
];

const ROOST_MONSTERS = {
  "adventurer-group": ADVENTURER_GROUP,
  "fiona-firstdream": FIONA_FIRSTDREAM,
  "grendel-greenlunch": GRENDEL_GREENLUNCH,
  "nigel-neverguess": NIGEL_NEVERGUESS,
  "percy-peacetinker": PERCY_PEACETINKER,
  "yorik-youngbook": YORIK_YOUNGBOOK,
  "avatar-of-steel": AVATAR_OF_STEEL,
  "avatar-of-light": AVATAR_OF_LIGHT,
  "avatar-of-nature": AVATAR_OF_NATURE,
  "avatar-of-storm": AVATAR_OF_STORM,
  "avatar-of-balance": AVATAR_OF_BALANCE,
  "bright-crystal": BRIGHT_CRYSTAL,
  "pulsating-lava": PULSATING_LAVA,
  "eruption": ERUPTION,
  "flame-totem": FLAME_TOTEM,
  "eldritch-dragon-lord": ELDRITCH_DRAGON_LORD,
  "ice-horror": ICE_HORROR,
  "ice-crawler": ICE_CRAWLER,
  "the-gravedigger": THE_GRAVEDIGGER,
  "bonelord-totem": BONELORD_TOTEM,
  "zharvorins-soulcage": ZHARVORINS_SOULCAGE,
  "myzareths-soulcage": MYZARETHS_SOULCAGE,
  "scariths-soulcage": SCARITHS_SOULCAGE,
  "elyraxs-soulcage": ELYRAXS_SOULCAGE,
  "zharvorins-spirit": ZHARVORINS_SPIRIT,
  "myzareths-spirit": MYZARETHS_SPIRIT,
  "scariths-spirit": SCARITHS_SPIRIT,
  "elyraxs-spirit": ELYRAXS_SPIRIT,
  "enthralled-dragon": ENTHRALLED_DRAGON,
  "an-eye": AN_EYE,
  "bone-barrier": BONE_BARRIER,
  "wraithfire": WRAITHFIRE,
  "bonelords-phylactery": BONELORDS_PHYLACTERY,
};

/* ── Boss rooms (OTBMs oficiais z=7; spawn/boss validados por
 * caminhabilidade — ver tools/test_roost_graveborn.js) ── */
const ROOST_ROOMS = {
  "adventurer-group": { otbm: "first_dragon",
    spawn: { x: 1029, y: 1034, z: 7 }, boss: { x: 1030, y: 1027, z: 7 } },
  "eldritch-dragon-lord": { otbm: "eldritch_dl",
    spawn: { x: 1021, y: 1030, z: 7 }, boss: { x: 1021, y: 1024, z: 7 } },
  "ice-horror": { otbm: "ice_horror",
    spawn: { x: 1030, y: 1031, z: 7 }, boss: { x: 1030, y: 1025, z: 7 } },
  "the-gravedigger": { otbm: "gravedigger",
    spawn: { x: 1023, y: 1035, z: 7 }, boss: { x: 1023, y: 1029, z: 7 } },
  "bonelords-phylactery": { otbm: "bonelords_phylactery",
    spawn: { x: 1026, y: 1035, z: 7 }, boss: { x: 1026, y: 1025, z: 7 } },
};

const ROOST_BOSS_META = [
  { id: "adventurer-group", name: "Adventurer Group",
    title: "The First Dragon — Roost of the Graveborn",
    text: "Roost Quest — Missão 1: derrotar 500 monstros na Unhallowed Crypt" },
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

/* Missão 1: 500 kills na Unhallowed Crypt → libera Adventurer Group. */
const ROOST_MISSION_DEFS = {
  "unhallowed-crypt": {
    title: "Missão: Roost of the Graveborn — Unhallowed Crypt",
    tasks: [{
      counter: "kills", target: 500,
      label: "Eliminar 500 monstros na Unhallowed Crypt",
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
  const killed = (slug) =>
    typeof accountBossKilled === "function"
      ? accountBossKilled(p, slug)
      : Number(p && p.bosses && p.bosses[slug] && p.bosses[slug].kills) > 0;
  const m1k = roostMissionKills(p, "unhallowed-crypt");
  const m1 = m1k >= 500 || !!(p && p.missionsDone && p.missionsDone["unhallowed-crypt"]);
  const chainKills = ROOST_CHAIN.filter(killed).length;
  const m2 = chainKills === 4;
  const m3 = killed("bonelords-phylactery");
  const done = (p && p.missionsDone) || {};
  return {
    reqLevel: (p && Number(p.level)) >= 450,
    m1: { done: m1, kills: Math.min(m1k, 500), target: 500 },
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
        <section class="quest-detail-panel" style="margin-top:8px"><div class="hunt-best-title">MECÂNICAS DA CADEIA</div>
          <div class="tiny dim" style="line-height:1.5">
            <b>Adventurer Group</b> — 5 aventureiros por vocação; em vida vermelha viram avatares que criticam e resistem. Bright Crystal explode em Mana Drain. Depois, o Fatal Bug.<br>
            <b>Eldritch Dragon Lord</b> — vulcões acumulam vida e viram Flame Totems; <b>3+ totens vivos = boss imortal</b>.<br>
            <b>Ice Horror</b> — invoca Ice Crawlers (até 3) durante a luta.<br>
            <b>The Gravedigger</b> — invoca até 2 Bonelord Totems <b>invulneráveis</b> (área de morte).<br>
            <b>Bonelord's Phylactery</b> — F1: 4 Soulcages de HP compartilhado + 4 dragon spirits invulneráveis (afaste-os das cages ou curam o pool). F2: Phylactery + 4 Enthralled Dragons, sob os gazes (An Eye, Wraithfire, Mana Drain, Curse, Bone Barrier).
          </div>
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
  const npc = (typeof NPCS !== "undefined" && NPCS["dragon-ancestor-spirit"]) || {};
  const slots = roostRuneCounts(p).map((r) => {
    const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[r.slug]) || {};
    const ok = r.have > 0;
    return `<div class="gi-rune-slot${ok ? " is-owned" : ""}">
          <span class="gi-rune-count">${r.have}x</span>
          <div class="gi-rune-icon-box">${typeof mbItemIcon === "function" ? mbItemIcon(r.slug, 36) : ""}</div>
          <span class="gi-rune-name">${it.n || r.slug}</span>
        </div>`;
  }).join("\n        ");
  const can = roostCanExchange(p);
  return `<div class="gi-crypt-modal" role="dialog" aria-modal="true" aria-labelledby="cryptModalTitle">
    <header class="gi-crypt-header">
      <div class="gi-crypt-npc">
        <div class="gi-crypt-npc-icon">
          <img src="assets/npc/dragon-ancestor-spirit_s.png" alt="Dragon Ancestor Spirit" />
        </div>
        <div class="gi-crypt-npc-titles">
          <h2 id="cryptModalTitle">Dragon Ancestor Spirit</h2>
          <span>${npc.role || "Troca Crypt Runes"}</span>
        </div>
      </div>
      <button type="button" class="gi-crypt-close" id="gi-crypt-close">Fechar</button>
    </header>
    <blockquote class="gi-crypt-quote">
      "${npc.greet || "Mortals' greed split my kin. Bring me the five crypt runes and I shall forge them into a weapon worthy of a dragon's heir."}"
    </blockquote>
    <section class="gi-crypt-body">
      <h3 class="gi-crypt-section-title">TROCAR CRYPT RUNES</h3>
      <div class="gi-rune-grid">
        ${slots}
      </div>
      <p class="gi-crypt-instruction">
        Traga 1 de cada runa e eu a transformo numa arma Crypt.
      </p>
      <div class="gi-crypt-reward">
        <div class="gi-reward-box"><span class="gi-reward-placeholder" id="roost-exchange-icon">???</span></div>
        <span class="gi-reward-label" id="roost-exchange-name">Arma Crypt</span>
      </div>
      <div class="gi-crypt-actions">
        <button type="button" class="gi-crypt-btn${can ? " is-ready" : ""}" id="roost-exchange-btn" ${can ? "" : "disabled"}>TROCAR</button>
        ${can ? "" : `<p class="gi-crypt-status"><span aria-hidden="true">🔒</span> faltam runas (derrote os bosses da Roost Quest)</p>`}
      </div>
    </section>
  </div>`;
}

/* Wiring do botão — chamado pelo bindNpc("crypt-exchange"). */
function roostBindExchange() {
  const p = G.p;
  const slugs = CRYPT_WEAPONS.map((w) => w.slug);
  if (typeof mbStopRoulettes === "function") mbStopRoulettes();
  if (typeof mbStartPreview === "function") mbStartPreview("roost-exchange", slugs);
  const close = $("#gi-crypt-close");
  if (close && typeof closeNpc === "function") close.onclick = closeNpc;
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

  /* Geometria real dos sheets (célula = PNG/cols×4). Sem registro o
   * monsterPlayable() reprova o slug — boss invisível no modal e no
   * canvas. Humanoides clássicos têm 3 colunas (2 frames de walk no
   * DAT); avatares e criaturas 15.x têm 9. */
  const ROOST_MOB_SHEETS = {
    /* Fatal Bug = mesma sprite do Ancient Scarab (58x58, 3x4 do DAT). */
    "adventurer-group":     { cw: 58, ch: 58, cols: 3, rows: 4 },
    "eldritch-dragon-lord": { cw: 64, ch: 64, cols: 9, rows: 4 },
    "ice-horror":           { cw: 64, ch: 64, cols: 9, rows: 4 },
    "the-gravedigger":      { cw: 64, ch: 64, cols: 9, rows: 4 },
    "bonelords-phylactery": { cw: 64, ch: 64, cols: 9, rows: 4 },
    /* Os 5 membros NÃO têm sprite nos refs do client (os looktypes do
     * staticdata renderizam placeholders — os atlases lzma desses outfits
     * não estavam no cache). Sheets 9x4 de 64x64 montadas dos GIFs
     * oficiais da TibiaWiki — padrão sir-leonard/moonstone-miner: a
     * direção do GIF é replicada nas 4 linhas, col 0 = idle. */
    "yorik-youngbook":      { cw: 64, ch: 64, cols: 9, rows: 4 },
    "percy-peacetinker":    { cw: 64, ch: 64, cols: 9, rows: 4 },
    "grendel-greenlunch":   { cw: 64, ch: 64, cols: 9, rows: 4 },
    "fiona-firstdream":     { cw: 64, ch: 64, cols: 9, rows: 4 },
    "nigel-neverguess":     { cw: 64, ch: 64, cols: 9, rows: 4 },
    "avatar-of-steel":      { cw: 64, ch: 64, cols: 9, rows: 4 },
    "avatar-of-light":      { cw: 64, ch: 64, cols: 9, rows: 4 },
    "avatar-of-nature":     { cw: 64, ch: 64, cols: 9, rows: 4 },
    "avatar-of-storm":      { cw: 64, ch: 64, cols: 9, rows: 4 },
    "avatar-of-balance":    { cw: 64, ch: 64, cols: 9, rows: 4 },
    "bright-crystal":       { cw: 40, ch: 40, cols: 9, rows: 4 },
    "ice-crawler":          { cw: 49, ch: 49, cols: 3, rows: 4 },
    "bonelord-totem":       { cw: 64, ch: 64, cols: 9, rows: 4 },
    "zharvorins-soulcage":  { cw: 64, ch: 64, cols: 9, rows: 4 },
    "myzareths-soulcage":   { cw: 64, ch: 64, cols: 9, rows: 4 },
    "scariths-soulcage":    { cw: 64, ch: 64, cols: 9, rows: 4 },
    "elyraxs-soulcage":     { cw: 64, ch: 64, cols: 9, rows: 4 },
    "zharvorins-spirit":    { cw: 51, ch: 51, cols: 9, rows: 4 },
    "myzareths-spirit":     { cw: 64, ch: 64, cols: 9, rows: 4 },
    "scariths-spirit":      { cw: 64, ch: 64, cols: 9, rows: 4 },
    "elyraxs-spirit":       { cw: 64, ch: 64, cols: 9, rows: 4 },
    "enthralled-dragon":    { cw: 64, ch: 64, cols: 9, rows: 4 },
    "an-eye":               { cw: 64, ch: 64, cols: 9, rows: 4 },
    "bone-barrier":         { cw: 64, ch: 64, cols: 9, rows: 4 },
    "wraithfire":           { cw: 64, ch: 64, cols: 9, rows: 4 },
    "pulsating-lava":       { cw: 64, ch: 64, cols: 9, rows: 4 },
    "eruption":             { cw: 64, ch: 64, cols: 9, rows: 4 },
    "flame-totem":          { cw: 64, ch: 64, cols: 9, rows: 4 },
  };
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS)
    for (const slug in ROOST_MOB_SHEETS)
      if (!MOBSHEETS[slug]) MOBSHEETS[slug] = ROOST_MOB_SHEETS[slug];

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
      description: "A quest do update 15.20: uma horda de dragões sob o controle do Necromancer. Missão 1 — elimine 500 monstros na Unhallowed Crypt para liberar a cadeia sequencial de 4 bosses: Adventurer Group (5 aventureiros por vocação que viram avatares em vida vermelha + Bright Crystal e Fatal Bug), Eldritch Dragon Lord (vulcões que evoluem até Flame Totems — 3+ totens vivos o deixam IMORTAL), Ice Horror (invoca Ice Crawlers) e The Gravedigger (invoca até 2 Bonelord Totems invulneráveis, área de morte). O boss final, Bonelord's Phylactery, luta em 2 fases: F1 com 4 Soulcages de HP compartilhado guardadas por 4 dragon spirits invulneráveis (afaste-os ou eles curam o pool), F2 com a Phylactery + 4 Enthralled Dragons sob os gazes do Bone Overlord (An Eye, Wraithfire, Mana Drain, Curse, Bone Barrier). A vitória rende 1 de cada Crypt Rune; o Dragon Ancestor Spirit troca um set completo por uma arma Crypt aleatória.",
      renderDetail: renderRoostQuestDetail,
      rewardReady: (pp) => {
        const st = roostState(pp);
        return st.m3.done && !st.runesClaimed;
      },
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
    if (typeof BOSS_MODAL_SECTIONS !== "undefined") {
      const sect = {
        title: "ROOST OF THE GRAVEBORN 450+",
        minLevel: 450,
        ids: ROOST_BOSS_META.map((m) => m.id),
      };
      /* Ordem por nível no modal: 450+ fica logo abaixo de SOULWAR 400+
       * (antes de BLOODROTTEN 600+ / BOSSES 800+). */
      const after = BOSS_MODAL_SECTIONS.findIndex((s) => /SOULWAR/.test(s.title));
      if (after >= 0) BOSS_MODAL_SECTIONS.splice(after + 1, 0, sect);
      else BOSS_MODAL_SECTIONS.push(sect);
    }
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

/* ── Mecânica do encontro (cliente — espelho do tickAdventurerGroup do
 * servidor em authoritative_engine.js) ── */
function agBossFight(c) { return !!(c && c.boss && c.boss.id === "adventurer-group"); }
function agFreeCell(c, wantX, wantY) {
  const taken = new Set((c.mobs || []).filter((m) => m && m.hp > 0)
    .map((m) => m.cx + ":" + m.cy));
  const occ = typeof buildOccupancy === "function" ? buildOccupancy(c, null) : null;
  const walk = (x, y) => {
    if (x < 0 || y < 0 || x >= (c.gridW || 30) || y >= (c.gridH || 30)) return false;
    if (taken.has(x + ":" + y) || (occ && occ.has && occ.has(x + ":" + y))) return false;
    if (c.huntMap && typeof huntMapBlocked === "function" &&
        huntMapBlocked(c.huntMap, x, y)) return false;
    return true;
  };
  if (walk(wantX, wantY)) return { x: wantX, y: wantY };
  for (let r = 1; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walk(wantX + dx, wantY + dy)) return { x: wantX + dx, y: wantY + dy };
      }
  return null;
}
function agMakeMob(c, slug, cx, cy) {
  const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
    GAMEDATA.monsters[slug];
  if (!def) return null;
  const cell = agFreeCell(c, cx, cy); if (!cell) return null;
  const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
    : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
  const hp = Math.max(1, Number(def.hp) || 1);
  const mob = { slug, def, hp, maxHp: hp, agMember: slug !== "bright-crystal",
    agCrystal: slug === "bright-crystal",
    atkCd: 400 + Math.random() * 1200,
    id: "ag-" + slug + "-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7),
    cx: cell.x, cy: cell.y, x: pos.x, y: pos.y, sx: pos.x, sy: pos.y,
    dir: "w", moving: false, attackAnim: 0, speed: .000055,
    spawnAt: Date.now() };
  c.mobs = c.mobs || []; c.mobs.unshift(mob);
  c.events = c.events || [];
  c.events.push({ t: "spawn", slug, x: mob.x, y: mob.y, targetId: mob.id, screen: true });
  return mob;
}
function adventurerGroupBossInit(c, player) {
  if (!agBossFight(c)) return c;
  const boss = (c.mobs || []).find((m) => m && m.boss);
  if (!boss) return c;
  c.ag = { pendingBoss: boss };
  c.mobs = c.mobs.filter((m) => m !== boss);
  const bx = Number(boss.cx) || 0, by = Number(boss.cy) || 0;
  for (const s of AG_MEMBER_SPAWNS) agMakeMob(c, s.slug, bx + s.dx, by + s.dy);
  agMakeMob(c, "bright-crystal", bx + AG_CRYSTAL_OFFSET.dx, by + AG_CRYSTAL_OFFSET.dy);
  if (typeof resolveSQMOccupancy === "function") resolveSQMOccupancy(c);
  if (typeof addLog === "function")
    addLog("info", "Derrote os 5 membros do <b>Adventurer Group</b> — em vida vermelha eles viram avatares!");
  return c;
}
function adventurerGroupBossTick(c, now) {
  const st = c && c.ag; if (!st || c.ended) return true;
  const mobs = c.mobs || [];
  for (const m of mobs) {
    if (!m.agMember || !(m.hp > 0) || m.agTransformed) continue;
    const to = m.def && m.def.agTransform; if (!to) continue;
    if (m.hp / m.maxHp <= AG_TRANSFORM_PCT) {
      const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
        GAMEDATA.monsters[to];
      m.agTransformed = true;
      if (def) { m.slug = to; m.def = def; }
      m.critAll = true;
      c.events.push({ t: "effect", x: m.x, y: m.y, screen: true, fx: "magic-yellow" });
      if (typeof addLog === "function")
        addLog("death", `${m.def.name}: transformação em <b>${to}</b> — críticos em todos os ataques!`);
    }
  }
  const cry = mobs.find((m) => m.agCrystal && !m.agExploded);
  if (cry && cry.hp <= 0) {
    cry.agExploded = true;
    c.events.push({ t: "effect", x: cry.x, y: cry.y, screen: true, fx: "magic-blue" });
    const p = (c.player && c.player.p) || c.player;
    const dist = p && cry ? Math.max(Math.abs((p.cx || 0) - cry.cx), Math.abs((p.cy || 0) - cry.cy)) : 99;
    if (p && dist <= AG_CRYSTAL_RADIUS) {
      const max = (typeof maxStats === "function" && maxStats(p).mp) || p.maxMp || p.mp || 0;
      const drain = Math.min(Math.max(0, p.mp || 0), Math.round(max * AG_CRYSTAL_MANA_DRAIN_PCT / 100) || 500);
      p.mp = Math.max(0, (p.mp || 0) - drain);
      c.events.push({ t: "taken", dmg: drain, x: c.player.x, y: c.player.y,
        targetId: "player", sx: cry.x, sy: cry.y, el: "mana", fx: "magic-blue", screen: true });
      if (typeof addLog === "function")
        addLog("death", `O <b>Bright Crystal</b> explodiu — Mana Drain de ${drain}!`);
    }
  }
  if (st.pendingBoss && !mobs.some((m) => m.agMember && m.hp > 0)) {
    const boss = st.pendingBoss; st.pendingBoss = null;
    const cell = agFreeCell(c, Number(boss.cx) || 0, Number(boss.cy) || 0);
    if (cell) {
      const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
        : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
      boss.cx = cell.x; boss.cy = cell.y;
      boss.x = pos.x; boss.y = pos.y; boss.sx = pos.x; boss.sy = pos.y;
    }
    mobs.unshift(boss);
    c.events.push({ t: "spawn", slug: boss.slug, x: boss.x, y: boss.y,
      targetId: boss.id, screen: true });
    if (typeof addLog === "function")
      addLog("death", "<b>Fatal Bug</b> surgiu na sala!");
    if (typeof resolveSQMOccupancy === "function") resolveSQMOccupancy(c);
  }
  return true;
}
function adventurerGroupBossCleanup(c) { if (c && c.ag) delete c.ag; }

/* ── Eldritch Dragon Lord — vulcões (cliente; espelho de tickEldritch
 * no authoritative_engine.js) ── */
function eldritchBossFight(c) { return !!(c && c.boss && c.boss.id === "eldritch-dragon-lord"); }
function eldSpawnAt(c, slug, cx, cy, ventId) {
  const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
    GAMEDATA.monsters[slug];
  if (!def) return null;
  const cell = agFreeCell(c, cx, cy); if (!cell) return null;
  const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
    : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
  const hp = Math.max(1, Number(def.hp) || 1);
  const mob = { slug, def, hp, maxHp: hp, eldVent: true, _ventId: ventId,
    atkCd: 400 + Math.random() * 1200, eldStageAt: Date.now(),
    id: "eld-" + slug + "-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7),
    cx: cell.x, cy: cell.y, x: pos.x, y: pos.y, sx: pos.x, sy: pos.y,
    dir: "w", moving: false, attackAnim: 0, speed: 0, spawnAt: Date.now() };
  c.mobs = c.mobs || []; c.mobs.unshift(mob);
  c.events = c.events || [];
  c.events.push({ t: "spawn", slug, x: mob.x, y: mob.y, targetId: mob.id, screen: true });
  return mob;
}
function eldritchBossInit(c, player) {
  if (!eldritchBossFight(c)) return c;
  const boss = (c.mobs || []).find((m) => m && m.boss);
  if (!boss) return c;
  c.eld = { vents: [] };
  const bx = Number(boss.cx) || 0, by = Number(boss.cy) || 0;
  ELD_VENT_SPAWNS.forEach((s, i) => {
    const cell = agFreeCell(c, bx + s.dx, by + s.dy); if (!cell) return;
    if (eldSpawnAt(c, "pulsating-lava", cell.x, cell.y, i))
      c.eld.vents.push({ cx: cell.x, cy: cell.y, respawnAt: 0 });
  });
  if (typeof addLog === "function")
    addLog("info", "Os vulcões evoluem — mantenha menos de <b>3 Flame Totems</b> ou o Eldritch é imortal!");
  return c;
}
function eldritchBossTick(c, now) {
  const st = c && c.eld; if (!st || c.ended) return true;
  const boss = (c.mobs || []).find((m) => m && m.boss);
  const mobs = c.mobs || [];
  for (const m of mobs) {
    if (!m.eldVent || !(m.hp > 0)) continue;
    const nx = m.def && m.def.eldStage && m.def.eldStage.next;
    if (nx && now - (m.eldStageAt || m.spawnAt || 0) >= ELD_STAGE_MS) {
      const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
        GAMEDATA.monsters[nx];
      m.eldStageAt = now;
      if (def) { m.slug = nx; m.def = def; m.hp = m.maxHp = def.hp; }
      c.events.push({ t: "effect", x: m.x, y: m.y, screen: true, fx: "fire-area" });
    }
  }
  const alive = new Set(mobs.filter((m) => m.eldVent && m.hp > 0)
    .map((m) => m._ventId));
  st.vents.forEach((v, i) => {
    if (alive.has(i)) { v.respawnAt = 0; return; }
    v.respawnAt = v.respawnAt || now + ELD_RESPAWN_MS;
    if (now >= v.respawnAt) {
      if (eldSpawnAt(c, "pulsating-lava", v.cx, v.cy, i)) v.respawnAt = 0;
    }
  });
  const totems = mobs.filter((m) => m.eldVent && m.hp > 0 &&
    m.slug === "flame-totem").length;
  if (boss) {
    boss.eldritchImmune = totems >= ELD_TOTEM_IMMUNE;
    if (boss.eldritchImmune && !st._warned) {
      st._warned = 1;
      if (typeof addLog === "function")
        addLog("death", "<b>3+ Flame Totems</b> ativos — o Eldritch Dragon Lord está IMORTAL!");
    } else if (!boss.eldritchImmune) st._warned = 0;
  }
  return true;
}
function eldritchBossCleanup(c) { if (c && c.eld) delete c.eld; }

/* ── Ice Horror — invocação de Ice Crawlers (cliente; espelho de
 * tickIceHorror no authoritative_engine.js) ── */
function iceHorrorBossFight(c) { return !!(c && c.boss && c.boss.id === "ice-horror"); }
function ihSpawnCrawler(c, cx, cy) {
  const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
    GAMEDATA.monsters["ice-crawler"];
  if (!def) return null;
  const cell = agFreeCell(c, cx, cy); if (!cell) return null;
  const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
    : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
  const hp = Math.max(1, Number(def.hp) || 1);
  const mob = { slug: "ice-crawler", def, hp, maxHp: hp, iceCrawler: true,
    atkCd: 400 + Math.random() * 1200,
    id: "ih-ice-crawler-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7),
    cx: cell.x, cy: cell.y, x: pos.x, y: pos.y, sx: pos.x, sy: pos.y,
    dir: "w", moving: false, attackAnim: 0, speed: .000055,
    spawnAt: Date.now() };
  c.mobs = c.mobs || []; c.mobs.unshift(mob);
  c.events = c.events || [];
  c.events.push({ t: "spawn", slug: "ice-crawler", x: mob.x, y: mob.y,
    targetId: mob.id, screen: true });
  return mob;
}
function iceHorrorBossInit(c, player) {
  if (!iceHorrorBossFight(c)) return c;
  if (!(c.mobs || []).some((m) => m && m.boss)) return c;
  c.iceH = { nextAt: Date.now() + 6000 };
  if (typeof addLog === "function")
    addLog("info", "O <b>Ice Horror</b> invoca <b>Ice Crawlers</b> durante a batalha!");
  return c;
}
function iceHorrorBossTick(c, now) {
  const st = c && c.iceH; if (!st || c.ended) return true;
  const boss = (c.mobs || []).find((m) => m && m.boss && m.hp > 0);
  if (!boss) return true;
  const alive = (c.mobs || []).filter((m) => m.iceCrawler && m.hp > 0).length;
  if (alive < IH_CRAWLER_MAX && now >= (st.nextAt || 0)) {
    if (ihSpawnCrawler(c, Number(boss.cx) || 0, Number(boss.cy) || 0))
      st.nextAt = now + IH_SUMMON_MS;
    else st.nextAt = now + 2000; // sala cheia — re-tenta em breve
  }
  return true;
}
function iceHorrorBossCleanup(c) { if (c && c.iceH) delete c.iceH; }

/* ── The Gravedigger — invocação de Bonelord Totems (cliente; espelho de
 * tickGravedigger no authoritative_engine.js) ── */
function gravediggerBossFight(c) { return !!(c && c.boss && c.boss.id === "the-gravedigger"); }
function gdSpawnTotem(c, cx, cy) {
  const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
    GAMEDATA.monsters["bonelord-totem"];
  if (!def) return null;
  const cell = agFreeCell(c, cx, cy); if (!cell) return null;
  const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
    : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
  const hp = Math.max(1, Number(def.hp) || 1);
  const mob = { slug: "bonelord-totem", def, hp, maxHp: hp, gdTotem: true,
    atkCd: 400 + Math.random() * 1200,
    id: "gd-bonelord-totem-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7),
    cx: cell.x, cy: cell.y, x: pos.x, y: pos.y, sx: pos.x, sy: pos.y,
    dir: "w", moving: false, attackAnim: 0, speed: 0,
    spawnAt: Date.now() };
  c.mobs = c.mobs || []; c.mobs.unshift(mob);
  c.events = c.events || [];
  c.events.push({ t: "spawn", slug: "bonelord-totem", x: mob.x, y: mob.y,
    targetId: mob.id, screen: true });
  return mob;
}
function gravediggerBossInit(c, player) {
  if (!gravediggerBossFight(c)) return c;
  if (!(c.mobs || []).some((m) => m && m.boss)) return c;
  c.gd = { nextAt: Date.now() + 8000 };
  if (typeof addLog === "function")
    addLog("info", "O <b>Gravedigger</b> invoca <b>Bonelord Totems</b> imortais — fique longe da área de morte!");
  return c;
}
function gravediggerBossTick(c, now) {
  const st = c && c.gd; if (!st || c.ended) return true;
  const boss = (c.mobs || []).find((m) => m && m.boss && m.hp > 0);
  if (!boss) return true;
  const alive = (c.mobs || []).filter((m) => m.gdTotem && m.hp > 0).length;
  if (alive < GD_TOTEM_MAX && now >= (st.nextAt || 0)) {
    if (gdSpawnTotem(c, Number(boss.cx) || 0, Number(boss.cy) || 0))
      st.nextAt = now + GD_SUMMON_MS;
    else st.nextAt = now + 2000;
  }
  return true;
}
function gravediggerBossCleanup(c) { if (c && c.gd) delete c.gd; }

/* ── Bone Overlord / Bonelord's Phylactery — encontro em 2 fases
 * (cliente; espelho de tickBoneOverlord no authoritative_engine.js) ── */
function boneOverlordFight(c) { return !!(c && c.boss && c.boss.id === "bonelords-phylactery"); }
function boMakeMob(c, slug, cx, cy, flags) {
  const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
    GAMEDATA.monsters[slug];
  if (!def) return null;
  const cell = agFreeCell(c, cx, cy); if (!cell) return null;
  const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
    : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
  const hp = Math.max(1, Number(def.hp) || 1);
  const mob = Object.assign({ slug, def, hp, maxHp: hp,
    atkCd: 400 + Math.random() * 1200,
    id: "bo-" + slug + "-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7),
    cx: cell.x, cy: cell.y, x: pos.x, y: pos.y, sx: pos.x, sy: pos.y,
    dir: "w", moving: false, attackAnim: 0,
    speed: def.speed ? .000055 : 0, spawnAt: Date.now() }, flags || {});
  c.mobs = c.mobs || []; c.mobs.unshift(mob);
  c.events = c.events || [];
  c.events.push({ t: "spawn", slug, x: mob.x, y: mob.y, targetId: mob.id, screen: true });
  return mob;
}
function boDamagePlayer(c, p, dmg, el, sx, sy, fx) {
  const hit = Math.max(1, Math.round(dmg));
  p.hp = Math.max(0, (p.hp || 0) - hit);
  c.events.push({ t: "taken", dmg: hit, x: c.player.x, y: c.player.y,
    targetId: "player", sx: sx, sy: sy, el: el || "agony", fx: fx || "draw-blood",
    screen: true });
}
function boneOverlordBossInit(c, player) {
  if (!boneOverlordFight(c)) return c;
  const boss = (c.mobs || []).find((m) => m && m.boss);
  if (!boss) return c;
  c.bo = { pendingBoss: boss, cagePool: BO_CAGE_POOL, eyes: [],
    manaDrain: null, curse: null, gazeAt: Date.now() + BO_GAZE_MS, teleported: {} };
  c.mobs = c.mobs.filter((m) => m !== boss);
  const bx = Number(boss.cx) || 0, by = Number(boss.cy) || 0;
  for (const s of BO_CAGE_SPAWNS) {
    const cage = boMakeMob(c, s.slug, bx + s.dx, by + s.dy, { boCage: s.slug });
    if (cage) boMakeMob(c, s.spirit, bx + s.dx + 1, by + s.dy + 1,
      { boSpirit: s.slug, boCageSlug: s.slug });
  }
  if (typeof addLog === "function")
    addLog("info", "Destrua as 4 <b>Soulcages</b> (pool compartilhado) — afaste os Spirits das cages ou elas curam!");
  return c;
}
function boneOverlordBossTick(c, now) {
  const st = c && c.bo; if (!st || c.ended) return true;
  const mobs = c.mobs || [];
  const p = (c.player && c.player.p) || c.player;
  /* Pool compartilhado AUTORITATIVO: dano em qualquer cage drena o
   * pool (delta desde o último sync — min() das vivas ressuscitaria o
   * pool quando uma cage morre isolada). Espelho do servidor. */
  const cages = mobs.filter((m) => m.boCage);
  const live = cages.filter((m) => m.hp > 0);
  if (live.length) {
    for (const m of live) {
      const prev = Number(m._boSyncHp);
      if (Number.isFinite(prev) && prev > m.hp)
        st.cagePool = Math.max(0, st.cagePool - (prev - m.hp));
    }
    for (const m of live) { m.hp = st.cagePool; m.maxHp = BO_CAGE_POOL;
      m._boSyncHp = st.cagePool; }
    if (st.cagePool <= 0) {
      for (const m of cages) m.hp = 0;
      for (const s of mobs) if (s.boSpirit) { s.hp = 0; s._boGone = 1; }
    } else for (const s of mobs) {
      /* Espírito perto da sua cage → cura o pool (pool morto não cura). */
      if (!s.boSpirit || !(s.hp > 0)) continue;
      const cage = live.find((m) => m.boCage === s.boCageSlug);
      if (!cage) continue;
      const d = Math.max(Math.abs(s.cx - cage.cx), Math.abs(s.cy - cage.cy));
      if (d <= BO_SPIRIT_LINK_RADIUS && st.cagePool < BO_CAGE_POOL) {
        st.cagePool = Math.min(BO_CAGE_POOL, st.cagePool + BO_CAGE_HEAL / 10);
        for (const m of live) { m.hp = st.cagePool; m._boSyncHp = st.cagePool; }
      }
      /* Pool baixo → espírito teleporta à sua cage. */
      if (st.cagePool < BO_CAGE_POOL * BO_TELEPORT_PCT &&
          now - (s._boTpAt || 0) > 30000) {
        const tc = agFreeCell(c, cage.cx + 1, cage.cy);
        if (tc && d > 2) {
          s._boTpAt = now;
          const pos = typeof cellToScreen === "function" ? cellToScreen(tc.x, tc.y)
            : { x: (tc.x + .5) / (c.gridW || 30), y: (tc.y + .5) / (c.gridH || 30) };
          s.cx = tc.x; s.cy = tc.y; s.x = pos.x; s.y = pos.y; s.sx = pos.x; s.sy = pos.y;
          c.events.push({ t: "effect", x: pos.x, y: pos.y, screen: true, fx: "teleport" });
        }
      }
    }
  }
  /* Fase 2: cages destruídas → Phylactery + 4 Enthralled Dragons ao sul. */
  if (st.pendingBoss && st.cagePool <= 0) {
    const boss = st.pendingBoss; st.pendingBoss = null;
    const cell = agFreeCell(c, Number(boss.cx) || 0, Number(boss.cy) || 0);
    if (cell) {
      const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
        : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
      boss.cx = cell.x; boss.cy = cell.y;
      boss.x = pos.x; boss.y = pos.y; boss.sx = pos.x; boss.sy = pos.y;
    }
    mobs.unshift(boss);
    c.events.push({ t: "spawn", slug: boss.slug, x: boss.x, y: boss.y,
      targetId: boss.id, screen: true });
    const bx = Number(boss.cx) || 0, by = Number(boss.cy) || 0;
    for (const d of BO_DRAGON_SPAWNS)
      boMakeMob(c, "enthralled-dragon", bx + d.dx, by + d.dy, { boDragon: true });
    if (typeof addLog === "function")
      addLog("death", "A <b>Phylactery</b> apareceu — e os <b>4 Enthralled Dragons</b> também!");
  }
  /* ── Gazes do Bone Overlord (durante toda a luta) ── */
  if (p && p.hp > 0 && now >= st.gazeAt && (live.length || (mobs.some((m) => m.boss && m.hp > 0)))) {
    st.gazeAt = now + BO_GAZE_MS;
    const pick = ["eye", "wraithfire", "manadrain", "curse", "barrier"][
      Math.floor(Math.random() * 5)];
    const bx = Number(boss && boss.cx) || 0, by = Number(boss && boss.cy) || 0;
    if (pick === "eye") {
      const eye = boMakeMob(c, "an-eye", Number(p.cx) || 0, Number(p.cy) || 0,
        { boEye: true });
      if (eye) st.eyes.push({ id: eye.id, explodeAt: now + BO_EYE_FUSE_MS });
      if (typeof addLog === "function") addLog("death", "<b>AN EYE IS CAST ON YOU!</b>");
    } else if (pick === "wraithfire") {
      const max = (typeof maxStats === "function" && maxStats(p).hp) || p.maxHp || p.hp;
      boDamagePlayer(c, p, (p.hp || 0) * BO_WRAITH_PCT / 100, "agony", null, null, "fire-area");
      boMakeMob(c, "wraithfire", Number(p.cx) || 0, Number(p.cy) || 0, { boField: true });
      if (typeof addLog === "function") addLog("death", "<b>THE BONELORD CASTS WRAITHFIRE AT YOU!</b>");
    } else if (pick === "manadrain") {
      st.manaDrain = { left: BO_MANA_TICKS, nextAt: now + BO_MANA_MS };
      if (typeof addLog === "function") addLog("death", "<b>THE BONELORD DRAINS YOU!</b>");
    } else if (pick === "curse") {
      st.curse = { left: BO_CURSE_TICKS, nextAt: now + BO_CURSE_MS };
      if (typeof addLog === "function") addLog("death", "<b>THE BONELORD CURSES YOU!</b>");
    } else {
      /* Bone Barrier: cerca o jogador com 4 barreiras (oficialmente
       * teleporta p/ sala lateral — simplificação documentada). */
      const px = Number(p.cx) || 0, py = Number(p.cy) || 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        boMakeMob(c, "bone-barrier", px + dx, py + dy, { boBarrier: true });
      if (typeof addLog === "function") addLog("death", "<b>THE BONELORD DISPLACES YOU!</b> — quebre as Bone Barriers!");
    }
  }
  /* Eye fuse → explode (30% maxHP agony, raio 2). */
  for (const e of st.eyes) {
    if (e.done || now < e.explodeAt) continue;
    e.done = true;
    const eye = mobs.find((m) => m.id === e.id);
    if (eye) eye.hp = 0;
    if (p && p.hp > 0 && eye &&
        Math.max(Math.abs((p.cx || 0) - eye.cx), Math.abs((p.cy || 0) - eye.cy)) <= BO_EYE_RADIUS) {
      const max = (typeof maxStats === "function" && maxStats(p).hp) || p.maxHp || p.hp;
      boDamagePlayer(c, p, max * BO_EYE_PCT / 100, "agony", eye.x, eye.y, "mist");
    }
  }
  /* Mana Drain DoT: 5% maxMP a cada 2s x5. */
  if (st.manaDrain && now >= st.manaDrain.nextAt) {
    const max = (typeof maxStats === "function" && maxStats(p).mp) || p.maxMp || p.mp || 0;
    const drain = Math.min(Math.max(0, p.mp || 0), Math.round(max * BO_MANA_PCT / 100));
    p.mp = Math.max(0, (p.mp || 0) - drain);
    c.events.push({ t: "taken", dmg: drain, x: c.player.x, y: c.player.y,
      targetId: "player", el: "manadrain", fx: "magic-blue", screen: true });
    if (--st.manaDrain.left <= 0) st.manaDrain = null;
    else st.manaDrain.nextAt = now + BO_MANA_MS;
  }
  /* Curse: explode a cada 4s x4 (físico, pequeno raio). */
  if (st.curse && now >= st.curse.nextAt) {
    if (p && p.hp > 0) boDamagePlayer(c, p, 550, "physical", null, null, "explosion");
    if (--st.curse.left <= 0) st.curse = null;
    else st.curse.nextAt = now + BO_CURSE_MS;
  }
  /* Campos (wraithfire) expiram em ~5s. */
  for (const m of mobs)
    if (m.boField && now - (m.spawnAt || 0) > 5000) m.hp = 0;
  return true;
}
function boneOverlordBossCleanup(c) { if (c && c.bo) delete c.bo; }

const ROOST_DATA = {
  CRYPT_RUNES, CRYPT_WEAPONS, ROOST_ITEMS, ROOST_MONSTERS,
  ROOST_ROOMS, ROOST_MISSION_DEFS, ROOST_QUEST_ID,
  AG_MEMBER_SPAWNS, AG_CRYSTAL_OFFSET, AG_TRANSFORM_PCT,
  AG_CRYSTAL_MANA_DRAIN_PCT, AG_CRYSTAL_RADIUS,
  ELD_VENT_SPAWNS, ELD_STAGE_MS, ELD_RESPAWN_MS, ELD_TOTEM_IMMUNE,
  IH_CRAWLER_MAX, IH_SUMMON_MS,
  GD_TOTEM_MAX, GD_SUMMON_MS,
  BO_CAGE_POOL, BO_CAGE_SPAWNS, BO_DRAGON_SPAWNS, BO_GAZE_MS,
  BO_EYE_FUSE_MS, BO_EYE_RADIUS, BO_EYE_PCT, BO_WRAITH_PCT,
  BO_MANA_TICKS, BO_MANA_PCT, BO_MANA_MS, BO_CURSE_TICKS, BO_CURSE_MS,
  BO_CAGE_HEAL, BO_SPIRIT_LINK_RADIUS, BO_TELEPORT_PCT,
  monsterSlugs: Object.keys(ROOST_MONSTERS),
  roostRollWeapon, roostCanExchange, roostState,
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug of Object.keys(ROOST_MONSTERS))
      monsters[slug] = ROOST_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = ROOST_DATA;
