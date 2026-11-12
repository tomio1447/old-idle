/* sugar-daddy.js — BOSS Sugar Daddy (BOSSES 1–250).
 * Sala: game/maps/sugar_daddy_room.otbm (37×29, z=7 — câmara de doces de Candia).
 * Stats/loot do canary (MONSTERDATA já traz a tabela — hp 9.500,
 * exp 15.550, looktype 1764). Loot: merge do MONSTERDATA na baseMonster.
 * Spawns calculados sobre as células caminháveis do .otbm: bossspawn no
 * centro geométrico da arena; playerspawn ao sul, dentro do recorte.
 */
"use strict";

(function registerSugarDaddy() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.items = GAMEDATA.items || {};
  window.BOSS_DEFS = window.BOSS_DEFS || {};
  const BOSS_DEFS = window.BOSS_DEFS;

  /* Itens do loot do Sugar Daddy. cids do canary (validados: renderizam
   * ícone 1×1 no .dat convertido). Preços oficiais (Yasir/Toffee para
   * creature products; ourives para gemas): brigadeiro 2.640,
   * churro heart 2.680, pastry dragon 95.000, white gem 12.000,
   * small enchanted sapphire 250.
   * Sem comprador oficial → sell:0: moedas de chocolate (são a moeda do
   * NPC Coco, trocam por equipamento — não se vendem), equipamentos com
   * classification (necklace/ring/shield/spellbooks) e o quiver. */
  const NEW_ITEMS = {
    "brigadeiro":                { n: "brigadeiro",                s: null, t: "loot", w: 0.1,  cid: 48252, sell: 2640,  npcSell: 2640 },
    "dark-chocolate-coin":       { n: "dark chocolate coin",       s: null, t: "loot", w: 0.01, cid: 48250, sell: 0,     npcSell: 0 },
    "milk-chocolate-coin":       { n: "milk chocolate coin",       s: null, t: "loot", w: 0.1,  cid: 48249, sell: 0,     npcSell: 0 },
    "churro-heart":              { n: "churro heart",              s: null, t: "loot", w: 0.15, cid: 48254, sell: 2680,  npcSell: 2680 },
    "pastry-dragon":             { n: "pastry dragon",             s: null, t: "loot", w: 0.25, cid: 48256, sell: 95000, npcSell: 95000 },
    "candy-necklace":            { n: "candy necklace",            s: null, t: "loot", w: 5.1,  cid: 45641, sell: 0,     npcSell: 0 },
    "ring-of-temptation":        { n: "ring of temptation",        s: null, t: "loot", w: 0.8,  cid: 45642, sell: 0,     npcSell: 0 },
    "biscuit-barrier":           { n: "biscuit barrier",           s: null, t: "loot", w: 52,   cid: 45643, sell: 0,     npcSell: 0 },
    "cocoa-grimoire":            { n: "cocoa grimoire",            s: null, t: "loot", w: 15,   cid: 45639, sell: 0,     npcSell: 0 },
    "creamy-grimoire":           { n: "creamy grimoire",           s: null, t: "loot", w: 17,   cid: 45640, sell: 0,     npcSell: 0 },
    "candy-coated-quiver":       { n: "candy-coated quiver",       s: null, t: "loot", w: 18,   cid: 45644, sell: 0,     npcSell: 0 },
    "white-gem":                 { n: "white gem",                 s: null, t: "loot", w: 0.3,  cid: 32769, sell: 12000, npcSell: 12000 },
    "small-enchanted-sapphire":  { n: "small enchanted sapphire",  s: null, t: "loot", w: 0.1,  cid: 675,   sell: 250,   npcSell: 250 },
  };
  for (const slug in NEW_ITEMS) {
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = NEW_ITEMS[slug];
  }

  /* Sala da luta — mesmo esquema das boss-rooms (mitmah-vanguard.js). */
  const ROOM = {
    spawn: { x: 1027, y: 1038, z: 7 },  // playerspawn — sul da arena
    boss: { x: 1027, y: 1029, z: 7 },   // bossspawn — centro da sala
  };
  GAMEDATA.hunts["sugar-daddy-room"] = {
    name: "Sugar Daddy Room",
    level: 150,
    minLevel: 150,
    cat: "boss-room",
    hidden: true,
    pack: 1,
    monsters: ["sugar-daddy"],
    spawnWeights: { "sugar-daddy": 100 },
    color: "#7a4a5a",
    scene: "fey",
    otbm: "sugar_daddy_room",
    otbmFloor: 7,
    otbmSpawn: ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, ROOM.boss),
    // Pisos de doces da sala (1209x, 448xx, 4822x-4823x) — caminháveis.
    walkFloors: [12090, 12091, 12092, 12093, 12095, 44805, 44826,
      48228, 48229, 48230, 48231, 48232, 48233],
    respawn: 0,
  };

  BOSS_DEFS["sugar-daddy"] = {
    id: "sugar-daddy",
    name: "Sugar Daddy",
    title: "Boss de Candia",
    hunt: "sugar-daddy-room",
    baseMonster: "sugar-daddy",
    sprite: "sugar-daddy",
    mult: 1,
    requirement: { level: 150, text: "Requer nível 150+ (BOSSES 1–250)" },
    cooldown: typeof BOSS_COOLDOWN !== "undefined" ? BOSS_COOLDOWN : 16 * 60 * 60 * 1000,
  };
})();
