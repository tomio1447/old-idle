/* unhallowed-crypt.js — HUNT Unhallowed Crypt (nível 400+, update
 * 15.20). Mapa: game/maps/unhallowed_crypt.otbm (34×27, z=7; bounds
 * 1009,1016–1042,1042).
 *
 * Coordenadas informadas:
 *   centermap     {1027,1030,7} — caminhável, vira o spawn do jogador
 *   spawn radius  {1021,1028,7} → {1030,1034,7} (10×7; 60 sqm
 *                 caminháveis pós-import das flags, todos conectados)
 *   respawn       8 a 12 monstros por onda (pack 8–12)
 *
 * As 3 criaturas são do update 15.20 e não existem no dump Canary.
 * Fichas oficiais (TibiaWiki BR / Fandom / tibia.gg):
 *   Creepy Crawler   — 27.000 hp, 22.380 exp, armor 100, mit 6.60,
 *     speed 260, race_id 2763, looktype 1890, Skeletons Challenging
 *     (200/2.000/5.000, 100 charms). Ability oficial: Fear (2s) —
 *     mesmo modelo do Soul War: a condição feared existe no cliente
 *     (mobCastSkill → applySoulwarFear via /^fear$/); no servidor a
 *     skill sem dano emite só o fx (paridade aceita já existente).
 *   Crypt Construct  — 25.000 hp, 19.730 exp, armor 100, mit 5.36,
 *     speed 240, race_id 2760, looktype 1887. Area Healing oficial
 *     10.000–13.250 (uncommon) → defSkills {n:"healing"} com paridade
 *     cliente+servidor (self-heal; o jogo não tem cura em área de
 *     monstros aliados).
 *   Crypt Fiend      — 30.000 hp, 19.070 exp, armor 140, mit 4.39,
 *     speed 240, race_id 2758, looktype 1885. Som oficial: "Uhhh!".
 *   Todas: melee, andam por fogo/energia/terra, veem invisível,
 *   imunes a paralisia.
 *
 * Sprites: looktypes 1885/1887/1890 existem no DAT convertido — sheets
 * 9×4 reais (4 direções) renderizadas por import_unhallowed_crypt_assets.py
 * (crypt-fiend/crypt-construct 64×64; creepy-crawler 57×57, bounding
 * oficial menor).
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa; o
 * registro dos monstros no MONSTERS é via module.exports.
 */
"use strict";

/* Itens novos (cids oficiais do update 15.20; ícones 32×32 em
 * game/assets/item/). Preços NPC oficiais (TibiaWiki):
 *   - amber: 20.000 gp (vários NPCs compram).
 *   - necromantic-core / giant-tusk / crystallized-death /
 *     cluster-of-crystallized-death / toe-nails: vendem ao Yasir.
 *   - fetid-heart: NENHUM NPC compra (item de quest — 5 Ancestral
 *     Charges) → sell 0, mesmo tratamento do unstable-darklight-matter
 *     e do greater-proficiency-catalyst. */
const UNHALLOWED_ITEMS = {
  "amber":                        { n: "amber",                         s: null, t: "loot", cid: 32626, w: 0.5,  sell: 20000, npcSell: 20000 },
  "necromantic-core":             { n: "necromantic core",              s: null, t: "loot", cid: 52705, w: 1.0,  sell: 10000, npcSell: 10000 },
  "toe-nails":                    { n: "toe nails",                     s: null, t: "loot", cid: 52706, w: 1.0,  sell: 4500,  npcSell: 4500 },
  "giant-tusk":                   { n: "giant tusk",                    s: null, t: "loot", cid: 52707, w: 1.0,  sell: 6000,  npcSell: 6000 },
  "fetid-heart":                  { n: "fetid heart",                   s: null, t: "loot", cid: 52708, w: 1.0,  sell: 0,     npcSell: 0 },
  "crystallized-death":           { n: "crystallized death",            s: null, t: "loot", cid: 52719, w: 1.0,  sell: 3000,  npcSell: 3000 },
  "cluster-of-crystallized-death": { n: "cluster of crystallized death", s: null, t: "loot", cid: 52720, w: 1.0,  sell: 9000,  npcSell: 9000 },
};

const UNHALLOWED_BEST = { classe: "Undead", toKill: 5000, u1: 200,
  u2: 2000, charm: 100, stars: 5, locais: "Unhallowed Crypt." };

const CREEPY_CRAWLER = {
  name: "Creepy Crawler",
  hp: 27000, exp: 22380,
  speed: 260, armor: 100, defense: 90,
  damage: 900, element: "physical", attackSpeed: 2000, mitigation: 6.60,
  /* Damage taken oficial → resist = 100 − taken%:
   * phys 94 / earth 112 / fire 112 / death 97 / energy 88 / holy 106 / ice 94 */
  resist: { physical: 6, earth: -12, fire: -12, death: 3, energy: 12, holy: -6, ice: 6 },
  skills: [
    { el: "physical", min: 700, max: 1000, int: 2000, ch: 25, range: 1 },
    { el: "death", min: 550, max: 900, int: 3000, ch: 20, range: 7,
      miss: "sudden-death", alvo: 1 },
    /* Fear oficial (2s): condição feared no cliente; servidor emite fx. */
    { n: "fear", el: "death", min: 0, max: 0, int: 8000, ch: 20, range: 7,
      alvo: 1, fx: "mort-area" },
  ],
  looktype: 1890, race: "blood", raceId: 2763, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 39, max: 1, item: "crystal-coin" },
    { chance: 5, max: 1, item: "cyan-crystal-fragment" },
    { chance: 5, max: 1, item: "giant-tusk" },
    { chance: 4, max: 1, item: "crystallized-death" },
    { chance: 3, max: 1, item: "blue-crystal-shard" },
    { chance: 3, max: 1, item: "amber" },
    { chance: 2, max: 1, item: "necromantic-core" },
    { chance: 1, max: 1, item: "cluster-of-crystallized-death" },
    { chance: 1, max: 1, item: "blue-gem" },
    { chance: 1, max: 1, item: "amber-with-a-bug" },
    { chance: 1, max: 1, item: "amber-with-a-dragonfly" },
  ],
  best: Object.assign({}, UNHALLOWED_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const CRYPT_CONSTRUCT = {
  name: "Crypt Construct",
  hp: 25000, exp: 19730,
  speed: 240, armor: 100, defense: 90,
  damage: 950, element: "physical", attackSpeed: 2000, mitigation: 5.36,
  /* phys 106 / earth 109 / fire 106 / death 92 / energy 82 / holy 92 / ice 88 */
  resist: { physical: -6, earth: -9, fire: -6, death: 8, energy: 18, holy: 8, ice: 12 },
  skills: [
    { el: "physical", min: 750, max: 1050, int: 2000, ch: 25, range: 1 },
    { el: "earth", min: 550, max: 900, int: 3000, ch: 20, radius: 3,
      fx: "poison-area", miss: "poison" },
    { el: "physical", min: 500, max: 850, int: 2500, ch: 15, radius: 2,
      fx: "ground-shaker" },
  ],
  /* Area Healing oficial (uncommon): 10.000–13.250. No modelo do jogo a
   * cura é em si mesmo (paridade mobCastSkill/runMobSkills). */
  defSkills: [
    { n: "healing", min: 10000, max: 13250, int: 8000, ch: 25 },
  ],
  looktype: 1887, race: "blood", raceId: 2760, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 43, max: 1, item: "crystal-coin" },
    { chance: 7, max: 1, item: "cyan-crystal-fragment" },
    { chance: 6, max: 1, item: "blue-crystal-shard" },
    { chance: 5, max: 1, item: "small-sapphire" },
    { chance: 4, max: 1, item: "crystallized-death" },
    { chance: 3, max: 1, item: "toe-nails" },
    { chance: 2, max: 1, item: "cluster-of-crystallized-death" },
    { chance: 1, max: 1, item: "amber-staff" },
    { chance: 1, max: 1, item: "blue-gem" },
    { chance: 1, max: 1, item: "amber" },
    { chance: 0.5, max: 1, item: "amber-with-a-bug" },
    { chance: 0.5, max: 1, item: "amber-with-a-dragonfly" },
    { chance: 0.5, max: 1, item: "fetid-heart" },
  ],
  best: Object.assign({}, UNHALLOWED_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const CRYPT_FIEND = {
  name: "Crypt Fiend",
  hp: 30000, exp: 19070,
  speed: 240, armor: 140, defense: 110,
  damage: 1100, element: "physical", attackSpeed: 2000, mitigation: 4.39,
  /* phys 106 / earth 112 / fire 109 / death 100 / energy 85 / holy 103 / ice 91 */
  resist: { physical: -6, earth: -12, fire: -9, death: 0, energy: 15, holy: -3, ice: 9 },
  skills: [
    { el: "physical", min: 850, max: 1100, int: 2000, ch: 25, range: 1 },
    { el: "lifedrain", min: 500, max: 850, int: 4000, ch: 20, range: 1 },
    { el: "physical", min: 650, max: 1000, int: 3000, ch: 15, radius: 2,
      fx: "ground-shaker" },
  ],
  looktype: 1885, race: "blood", raceId: 2758, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 33, max: 1, item: "crystal-coin" },
    { chance: 5, max: 1, item: "small-sapphire" },
    { chance: 5, max: 1, item: "cyan-crystal-fragment" },
    { chance: 5, max: 1, item: "giant-tusk" },
    { chance: 2, max: 1, item: "blue-crystal-shard" },
    { chance: 2, max: 1, item: "amber" },
    { chance: 2, max: 1, item: "necromantic-core" },
    { chance: 2, max: 1, item: "crystallized-death" },
    { chance: 1, max: 1, item: "blue-gem" },
    { chance: 1, max: 1, item: "amber-with-a-bug" },
    { chance: 1, max: 1, item: "cluster-of-crystallized-death" },
    { chance: 0.5, max: 1, item: "amber-with-a-dragonfly" },
  ],
  /* Som oficial da criatura (TibiaWiki): "Uhhh!" */
  voices: {
    int: 6000,
    ch: 8,
    list: [
      { t: "Uhhh!" },
    ],
  },
  best: Object.assign({}, UNHALLOWED_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const UNHALLOWED_MONSTERS = {
  "creepy-crawler": CREEPY_CRAWLER,
  "crypt-construct": CRYPT_CONSTRUCT,
  "crypt-fiend": CRYPT_FIEND,
};

const UNHALLOWED_DATA = {
  monsterSlugs: Object.keys(UNHALLOWED_MONSTERS),
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug of Object.keys(UNHALLOWED_MONSTERS))
      monsters[slug] = UNHALLOWED_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = UNHALLOWED_DATA;

(function registerUnhallowedCrypt() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in UNHALLOWED_ITEMS) {
    const def = UNHALLOWED_ITEMS[slug];
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
    for (const slug in UNHALLOWED_MONSTERS)
      MONSTERDATA[slug] = UNHALLOWED_MONSTERS[slug];
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in UNHALLOWED_MONSTERS)
    GAMEDATA.monsters[slug] = UNHALLOWED_MONSTERS[slug];

  /* Sheets reais do DAT (crypt-fiend/construct 64×64, crawler 57×57).
   * Só fallback se o MOBSHEETS não trouxer a entrada importada. */
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS)
    for (const slug in UNHALLOWED_MONSTERS)
      if (!MOBSHEETS[slug])
        MOBSHEETS[slug] = { ch: 64, cols: 9, cw: 64, rows: 4 };

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["unhallowed-crypt"] = {
    name: "Unhallowed Crypt",
    level: 400,
    minLevel: 400,
    cat: "hard",
    /* Respawn informado: 8 a 12 monstros por onda. */
    pack: 10,
    packMin: 8,
    packMax: 12,
    monsters: [
      "creepy-crawler",
      "crypt-construct",
      "crypt-fiend",
    ],
    /* occurrence oficial: todas Regular → peso igual. */
    spawnWeights: {
      "creepy-crawler": 20,
      "crypt-construct": 20,
      "crypt-fiend": 20,
    },
    color: "#4a3a52",
    scene: "crypt",
    otbm: "unhallowed_crypt",
    otbmFloor: 7,
    // centermap informado {1027,1030,7} é caminhável → spawn do jogador.
    otbmSpawn: { x: 1027, y: 1030, z: 7 },
    otbmMobBounds: { x: 1021, y: 1028, w: 10, h: 7, z: 7 },
    avgHp: 27333,
    avgExp: 20393,
    avgDamage: 983,
    avgArmor: 113,
    avgGold: 500,
    respawn: 1,
  };
})();
