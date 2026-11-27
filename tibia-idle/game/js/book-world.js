/* book-world.js — HUNT Book World (nível 150+, quest area do update
 * 15.10). Mapa: game/maps/book_world.otbm (31×29, z=7; bounds
 * 1010,1014–1040,1042).
 * Criaturas: os 6 Inkborn do Book World — 6 a 8 por onda, todos de
 * ocorrência Comum (peso igual). Coordenadas RME informadas:
 *   centermap     {1024,1029,7} — caminhável, vira o spawn do jogador
 *   respawnradius {1020,1023,7} → {1029,1035,7} (10×13; 127 sqm
 *                 caminháveis, todos conectados — 3 tiles bloqueados
 *                 em (10,13), (11,18), (18,16) locais)
 *
 * As 6 criaturas não existem no dump Canary. Fichas oficiais
 * (TibiaWiki BR / TibiaData):
 *   Bluebeak         — 2.430 hp, 2.330 exp; fraco a fire/energy,
 *     resiste holy.
 *   Bramble Wyrmling — 2.350 hp, 2.350 exp; resiste physical/earth/
 *     holy, fraco a fire/death; maxdmg oficial earth 500/phys 300.
 *   Crusader         — 3.400 hp, 3.300 exp; resiste physical/fire/
 *     energy/holy, fraco a earth/ice; 75% physical + 25% death.
 *   Hawk Hopper      — 2.180 hp, 2.250 exp; resiste earth/energy,
 *     fraco a physical/fire/death. Bestiário Medium (25 charm).
 *   Headwalker       — 2.460 hp, 2.250 exp; resiste energy, fraco a
 *     earth/ice/holy/death; habilidade Drunkenness.
 *   Lion Hydra       — 2.760 hp, 2.600 exp; fraco a earth/holy/death.
 * Todos: bestiário Inkborn, 50 charm (Hawk Hopper 25), imunes a
 * paralisia, veem invisível, empurram objetos, atravessam
 * Fire/Energy/Poison (não modelado no engine).
 *
 * Sprites: 5 looktypes do DAT convertido, identificados por pixel-diff
 * contra os GIFs oficiais da TibiaWiki (bluebeak 1849, crusader 1847,
 * hawk-hopper 1858, headwalker 1880, lion-hydra 1859). O bramble
 * wyrmling NÃO existe no DAT convertido — sheet montada do GIF
 * oficial, 8 quadros replicados nas 4 direções (padrão moonstone-
 * miner); 1862 é só o mais próximo visual para o campo looktype.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa; o
 * registro dos monstros no MONSTERS é via module.exports (mesmo
 * padrão do radiant-skyhold).
 */
"use strict";

/* Itens novos do Book World (cids do appearances.dat 15.x; ícones
 * 32×32 renderizados em game/assets/item/). Preços NPC oficiais
 * (TibiaWiki): creature products do update vendem ao Yasir; hydra-head
 * também ao Grizzly Adams.
 *   - grape(s): comida comum, nenhum NPC compra → sell 0.
 *   - etcher: NPC Albinius vende por 30k; vende-se por 30k (pedido).
 *   - cookbook do Book World é um creature product (cid 51424, vende
 *     ao Yasir por 870) — o slug `cookbook` já era o item de quest
 *     cid 3234, então usa-se `cookbook-creature-product`.
 * Demais itens já existiam no catálogo com preço correto. */
const BOOK_WORLD_ITEMS = {
  "paper-boat":               { n: "paper boat",               s: null, t: "loot", cid: 51420, w: 0.5,  sell: 800,  npcSell: 800 },
  "star-ink":                 { n: "star ink",                 s: null, t: "loot", cid: 51422, w: 1.0,  sell: 1250, npcSell: 1250 },
  "grape":                    { n: "grape",                    s: null, t: "loot", cid: 3592,  w: 2.5,  sell: 0,    npcSell: 0 },
  "book-with-a-dragon":       { n: "book with a dragon",       s: null, t: "loot", cid: 51423, w: 13.0, sell: 1800, npcSell: 1800 },
  "torn-page":                { n: "torn page",                s: null, t: "loot", cid: 51427, w: 0.5,  sell: 340,  npcSell: 340 },
  "pressed-flower":           { n: "pressed flower",           s: null, t: "loot", cid: 51428, w: 0.2,  sell: 570,  npcSell: 570 },
  "cookbook-creature-product":{ n: "cookbook",                 s: null, t: "loot", cid: 51424, w: 13.0, sell: 870,  npcSell: 870 },
  "book-with-an-hourglass":   { n: "book with an hourglass",   s: null, t: "loot", cid: 51425, w: 13.0, sell: 1450, npcSell: 1450 },
  "sealing-wax":              { n: "sealing wax",              s: null, t: "loot", cid: 51426, w: 0.5,  sell: 620,  npcSell: 620 },
  "etcher":                   { n: "etcher",                   s: null, t: "loot", cid: 51443, w: 3.0,  sell: 30000, npcSell: 30000 },
  "colourful-quill":          { n: "colourful quill",          s: null, t: "loot", cid: 51421, w: 0.6,  sell: 110000, npcSell: 110000 },
  "hydra-head":               { n: "hydra head",               s: null, t: "loot", cid: 10282, w: 13.0, sell: 600,  npcSell: 600 },
};

const BOOK_WORLD_BEST = { classe: "Inkborn", toKill: 2500, u1: 100,
  u2: 1000, charm: 50, stars: 4, locais: "Book World." };
const BOOK_WORLD_BEST_MEDIUM = Object.assign({}, BOOK_WORLD_BEST, {
  toKill: 1000, u1: 50, u2: 500, charm: 25, stars: 3 });

const BLUEBEAK = {
  name: "Bluebeak",
  hp: 2430, exp: 2330,
  speed: 150, armor: 50, defense: 42,
  damage: 230, element: "energy", attackSpeed: 2000, mitigation: 1.6,
  resist: { fire: -5, energy: -5, holy: 10 },
  skills: [
    { el: "energy", min: 120, max: 260, int: 2500, ch: 30, range: 7,
      miss: "energy", alvo: 1 },
    { el: "physical", min: 80, max: 200, int: 2000, ch: 25, range: 1 },
  ],
  looktype: 1849, race: "blood", targetDistance: 4, ranged: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 100, item: "gold-coin" },
    { chance: 100, max: 11, item: "platinum-coin" },
    { chance: 10, max: 2, item: "small-sapphire" },
    { chance: 10, max: 1, item: "paper-boat" },
    { chance: 10, max: 1, item: "star-ink" },
    { chance: 5, max: 1, item: "hailstorm-rod" },
    { chance: 5, max: 3, item: "grape" },
    { chance: 5, max: 1, item: "blue-crystal-splinter" },
    { chance: 1.5, max: 1, item: "glacier-amulet" },
    { chance: 1.5, max: 1, item: "glacier-shoes" },
    { chance: 1.5, max: 1, item: "blue-crystal-shard" },
    { chance: 1.5, max: 1, item: "etcher" },
    { chance: 0.5, max: 1, item: "blue-gem" },
  ],
  best: Object.assign({}, BOOK_WORLD_BEST, { ocor: 0 }),
};

const BRAMBLE_WYRMLING = {
  name: "Bramble Wyrmling",
  hp: 2350, exp: 2350,
  speed: 140, armor: 55, defense: 45,
  damage: 250, element: "earth", attackSpeed: 2000, mitigation: 1.55,
  resist: { physical: 5, earth: 20, fire: -5, holy: 5, death: -10 },
  skills: [
    /* maxdmg oficial earth 500 — o golpe de terra é o assinatura. */
    { el: "earth", min: 150, max: 300, int: 2500, ch: 30, range: 7,
      radius: 3, fx: "earth-area", miss: "earth" },
    { el: "physical", min: 100, max: 250, int: 2000, ch: 25, range: 1 },
  ],
  /* Sem looktype oficial no DAT convertido; 1862 é o mais próximo —
   * a arte real vem da sheet montada do GIF. */
  looktype: 1862, race: "blood", targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 100, item: "gold-coin" },
    { chance: 100, max: 12, item: "platinum-coin" },
    { chance: 10, max: 3, item: "small-emerald" },
    { chance: 10, max: 2, item: "green-crystal-fragment" },
    { chance: 5, max: 1, item: "book-with-a-dragon" },
    { chance: 1.5, max: 1, item: "terra-hood" },
    { chance: 0.5, max: 1, item: "terra-mantle" },
    { chance: 0.5, max: 1, item: "green-gem" },
    { chance: 0.5, max: 1, item: "dragon-shield" },
    { chance: 0.5, max: 1, item: "dragonbone-staff" },
  ],
  best: Object.assign({}, BOOK_WORLD_BEST, { ocor: 0 }),
};

const CRUSADER = {
  name: "Crusader",
  hp: 3400, exp: 3300,
  speed: 145, armor: 65, defense: 55,
  damage: 280, element: "physical", attackSpeed: 2000, mitigation: 1.9,
  resist: { physical: 10, earth: -5, fire: 5, energy: 10, ice: -10,
    holy: 10 },
  /* Oficial: Physical ~75% > Death ~25%, maxdmg 575/475. */
  skills: [
    { el: "death", min: 150, max: 380, int: 2800, ch: 20, range: 1,
      miss: "sudden-death" },
    { el: "physical", min: 120, max: 320, int: 2000, ch: 30, range: 1 },
  ],
  looktype: 1847, race: "blood", targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 100, item: "gold-coin" },
    { chance: 100, max: 12, item: "platinum-coin" },
    { chance: 10, max: 3, item: "small-topaz" },
    { chance: 10, max: 1, item: "torn-page" },
    { chance: 5, max: 1, item: "great-health-potion" },
    { chance: 5, max: 1, item: "giant-shimmering-pearl" },
    { chance: 5, max: 1, item: "knight-axe" },
    { chance: 5, max: 1, item: "ancient-shield" },
    { chance: 5, max: 1, item: "cookbook-creature-product" },
    { chance: 0.5, max: 1, item: "warrior-helmet" },
    { chance: 0.5, max: 1, item: "onyx-chip" },
  ],
  best: Object.assign({}, BOOK_WORLD_BEST, { ocor: 0 }),
};

const HAWK_HOPPER = {
  name: "Hawk Hopper",
  hp: 2180, exp: 2250,
  speed: 170, armor: 42, defense: 38,
  damage: 220, element: "physical", attackSpeed: 2000, mitigation: 1.45,
  resist: { physical: -5, earth: 15, fire: -10, energy: 10, death: -5 },
  skills: [
    { el: "physical", min: 110, max: 240, int: 2200, ch: 35, range: 6,
      miss: "arrow", alvo: 1 },
  ],
  looktype: 1858, race: "blood", targetDistance: 5, ranged: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 100, item: "gold-coin" },
    { chance: 100, max: 12, item: "platinum-coin" },
    { chance: 10, max: 25, item: "earth-arrow" },
    { chance: 10, max: 3, item: "small-topaz" },
    { chance: 10, max: 2, item: "rainbow-quartz" },
    { chance: 10, max: 1, item: "pressed-flower" },
    { chance: 5, max: 2, item: "fish" },
    { chance: 5, max: 2, item: "carrot" },
    { chance: 5, max: 1, item: "opal" },
    { chance: 5, max: 1, item: "royal-star" },
    { chance: 1.5, max: 1, item: "butterfly-ring" },
    { chance: 1.5, max: 1, item: "etcher" },
    { chance: 0.5, max: 1, item: "elvish-bow" },
  ],
  best: Object.assign({}, BOOK_WORLD_BEST_MEDIUM, { ocor: 0 }),
};

const HEADWALKER = {
  name: "Headwalker",
  hp: 2460, exp: 2250,
  speed: 135, armor: 52, defense: 44,
  damage: 230, element: "physical", attackSpeed: 2000, mitigation: 1.6,
  resist: { earth: -5, energy: 15, ice: -5, holy: -5, death: -10 },
  skills: [
    { el: "physical", min: 90, max: 230, int: 2000, ch: 30, range: 1 },
    /* Drunkenness oficial (efeito avião de papel): emulada como
     * rajada de energia de baixo dano em área. */
    { el: "energy", min: 40, max: 90, int: 3000, ch: 15, range: 4,
      radius: 3, fx: "energy-area" },
  ],
  looktype: 1880, race: "blood", targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 100, item: "gold-coin" },
    { chance: 100, max: 12, item: "platinum-coin" },
    { chance: 10, max: 1, item: "torn-page" },
    { chance: 5, max: 1, item: "great-health-potion" },
    { chance: 5, max: 1, item: "giant-shimmering-pearl" },
    { chance: 5, max: 1, item: "white-pearl" },
    { chance: 5, max: 1, item: "black-pearl" },
    { chance: 5, max: 1, item: "protection-amulet" },
    { chance: 5, max: 1, item: "book-with-an-hourglass" },
    { chance: 1.5, max: 1, item: "blank-imbuement-scroll" },
    { chance: 0.5, max: 1, item: "life-ring" },
  ],
  best: Object.assign({}, BOOK_WORLD_BEST, { ocor: 0 }),
};

const LION_HYDRA = {
  name: "Lion Hydra",
  hp: 2760, exp: 2600,
  speed: 140, armor: 58, defense: 50,
  damage: 260, element: "earth", attackSpeed: 2000, mitigation: 1.7,
  resist: { earth: -5, holy: -5, death: -10 },
  skills: [
    { el: "earth", min: 130, max: 280, int: 2500, ch: 28, length: 5,
      spread: 0, fx: "yellow-energy" },
    { el: "physical", min: 100, max: 260, int: 2000, ch: 25, range: 1 },
  ],
  looktype: 1859, race: "blood", targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 100, item: "gold-coin" },
    { chance: 100, max: 12, item: "platinum-coin" },
    { chance: 10, max: 1, item: "sealing-wax" },
    { chance: 5, max: 1, item: "silver-brooch" },
    { chance: 5, max: 2, item: "small-diamond" },
    { chance: 5, max: 3, item: "ham" },
    { chance: 5, max: 1, item: "hydra-head" },
    { chance: 5, max: 1, item: "onyx-chip" },
    { chance: 1.5, max: 1, item: "titan-axe" },
    { chance: 1.5, max: 1, item: "sacred-tree-amulet" },
    { chance: 0.5, max: 1, item: "medusa-shield" },
    { chance: 0.5, max: 1, item: "gold-ingot" },
  ],
  best: Object.assign({}, BOOK_WORLD_BEST, { ocor: 0 }),
};

/* Sir Leopold (miniboss Nemesis da Book World, update 15.10) — ausente do
 * dump Canary: ficha oficial TibiaWiki (81.000 hp, 26.000 exp, self-heal
 * 0-325, senses invisible). Mesmo looktype 1847 do Crusader/Sir Leonard,
 * addons 3 e cores oficiais [78,19,94,95]. */
const SIR_LEOPOLD = {
  name: "Sir Leopold",
  hp: 81000, exp: 26000,
  speed: 150, armor: 15, defense: 25,
  damage: 500, element: "physical", attackSpeed: 2000,
  skills: [
    { el: "ice", min: 100, max: 350, int: 2500, ch: 15, range: 7,
      miss: "ice", alvo: 1 },
    { el: "holy", min: 100, max: 250, int: 2500, ch: 10, range: 7,
      miss: "holy", alvo: 1 },
  ],
  defSkills: [
    { n: "healing", min: 0, max: 325, int: 5000, ch: 20 },
  ],
  looktype: 1847, race: "blood", raceId: 2694, targetDistance: 1,
  staticAttack: 90, boss: 1, imune: ["invisible"],
  loot: [
    { chance: 100, max: 74, item: "platinum-coin" },
    { chance: 100, max: 1, item: "etcher" },
    { chance: 100, max: 1, item: "blank-imbuement-scroll" },
    { chance: 100, max: 1, item: "proficiency-catalyst" },
    { chance: 73, max: 2, item: "blue-gem" },
    { chance: 38, max: 2, item: "white-gem" },
    { chance: 36, max: 1, item: "colourful-quill" },
    { chance: 29, max: 1, item: "silver-amulet" },
    { chance: 29, max: 1, item: "protection-amulet" },
    { chance: 20, max: 1, item: "bronze-amulet" },
    { chance: 11, max: 1, item: "knight-axe" },
    { chance: 11, max: 1, item: "knight-legs" },
    { chance: 9, max: 1, item: "time-ring" },
    { chance: 7, max: 1, item: "death-ring" },
    { chance: 4, max: 1, item: "axe-ring" },
    { chance: 4, max: 1, item: "warrior-helmet" },
    { chance: 4, max: 1, item: "knight-armor" },
    { chance: 2, max: 1, item: "ancient-shield" },
    { chance: 2, max: 1, item: "stone-skin-amulet" },
  ],
};

const BOOK_WORLD_MONSTERS = {
  "bluebeak": BLUEBEAK,
  "bramble-wyrmling": BRAMBLE_WYRMLING,
  "crusader": CRUSADER,
  "hawk-hopper": HAWK_HOPPER,
  "headwalker": HEADWALKER,
  "lion-hydra": LION_HYDRA,
  "sir-leopold": SIR_LEOPOLD,
};

const BOOK_WORLD_DATA = {
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug in BOOK_WORLD_MONSTERS)
      monsters[slug] = BOOK_WORLD_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports)
  module.exports = BOOK_WORLD_DATA;

(function registerBookWorld() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in BOOK_WORLD_ITEMS) {
    const def = BOOK_WORLD_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }

  /* Monstros novos (ausentes do dump Canary) — registra nos dois
   * catálogos para spawn/loot resolverem igual aos demais. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA) {
    for (const slug in BOOK_WORLD_MONSTERS)
      MONSTERDATA[slug] = BOOK_WORLD_MONSTERS[slug];
  }
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in BOOK_WORLD_MONSTERS)
    GAMEDATA.monsters[slug] = BOOK_WORLD_MONSTERS[slug];

  /* Sheets 9×4 de células 64×64 (criaturas 2×2). */
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS) {
    for (const slug in BOOK_WORLD_MONSTERS) {
      if (!MOBSHEETS[slug])
        MOBSHEETS[slug] = { ch: 64, cols: 9, cw: 64, rows: 4 };
    }
  }

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["book-world"] = {
    name: "Book World",
    level: 150,
    minLevel: 150,
    cat: "mid",
    pack: 8,
    packMin: 6,
    packMax: 8,
    monsters: [
      "bluebeak",
      "bramble-wyrmling",
      "crusader",
      "hawk-hopper",
      "headwalker",
      "lion-hydra",
    ],
    bossMobs: ["sir-leopold"],
    /* occurrence oficial das regulares: todas Comum → 16/17 reescalado
     * para 10000; Sir Leopold entra como miniboss 1/10001 ≈ 0,01%. */
    spawnWeights: {
      "bluebeak": 1600,
      "bramble-wyrmling": 1700,
      "crusader": 1700,
      "hawk-hopper": 1700,
      "headwalker": 1700,
      "lion-hydra": 1600,
      "sir-leopold": 1,
    },
    color: "#4a7a8a",
    scene: "palace",
    otbm: "book_world",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    // centermap informado {1024,1029,7} é caminhável → spawn do jogador.
    otbmSpawn: { x: 1024, y: 1029, z: 7 },
    otbmMobBounds: { x: 1020, y: 1023, w: 10, h: 13, z: 7 },
    avgHp: 2597,
    avgExp: 2513,
    avgDamage: 245,
    avgArmor: 53,
    avgGold: 120,
    respawn: 1,
  };

  if (typeof HUNT_MODAL_SECTIONS !== "undefined") {
    let section = HUNT_MODAL_SECTIONS.find((s) =>
      s.title && s.title.indexOf("HUNTS 100") !== -1
    );
    if (!section) {
      section = { title: "HUNTS 100–250", ids: [] };
      HUNT_MODAL_SECTIONS.splice(3, 0, section);
    }
    if (section.ids.indexOf("book-world") === -1) {
      section.ids.push("book-world");
    }
  }
})();
