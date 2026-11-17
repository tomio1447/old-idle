/* true-asuras.js — HUNT True Asuras - Thalassara (nível 400+).
 * Mapa: game/maps/true_asuras_thalassara.otbm (26×22, z=7 — único piso;
 * bounds 1009,1015–1034,1036). Componente caminhável principal de 181 sqm.
 * Criaturas: True Dawnfire, True Midnight, True Frost Flower e True
 * Feverbloom Asura (8 a 10 por onda).
 * Coordenadas RME informadas:
 *   centermap      {1022,1026,7} — célula bloqueada (decoração 53507);
 *                  spawn usa a caminhável mais próxima {1023,1026,7}
 *   respawnradius  {1015,1024,7} → {1027,1031,7} (13×8)
 *
 * A True Feverbloom Asura é do update Forbidden Gardens (15.30, jul/2026)
 * — não existe no dump Canary. Stats do tibia.com/TibiaWiki (8.600 hp,
 * 8.600 exp, armor 90, mitigation 3.45%, speed 175; toma 110% ice/death,
 * 105% holy/energy, 85% earth, neutra em physical e CURADA por fire) com
 * dano/skills balanceados sobre as outras True Asuras, como pedido.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa; o registro
 * do monstro no MONSTERS do servidor é via module.exports (require
 * direto, mesmo padrão do bloodrotten).
 */
"use strict";

/* Creature products novos do loot — preços oficiais Yasir/Asphota/Tarun
 * (TibiaWiki). Ícones 32×32 em game/assets/item/<slug>.png renderizados
 * por tools/import_true_asuras_assets.py (cids do canary-items.xml /
 * client 15.x). */
const TRUE_ASURAS_LOOT_ITEMS = {
  "peacock-feather-fan":  { n: "peacock feather fan",  s: null, t: "loot", cid: 21975, w: 2,   sell: 350, npcSell: 350 },
  "golden-lotus-brooch":  { n: "golden lotus brooch",  s: null, t: "loot", cid: 21974, w: 1,   sell: 270, npcSell: 270 },
  "wild-flowers":         { n: "wild flowers",         s: null, t: "loot", cid: 25691, w: 1.5, sell: 120, npcSell: 120 },
  "pyrophyte-seed-pod":   { n: "pyrophyte seed pod",   s: null, t: "loot", cid: 54639, w: 3.2, sell: 720, npcSell: 720 },
  /* oriental-shoes já existe mas sem preço — Rashid paga 15.000. */
  "oriental-shoes":       { sell: 15000, npcSell: 15000 },
};

/* True Feverbloom Asura — sheet = o mesmo PNG das outras True Asuras
 * (looktype 1068; as 3 variantes já compartilham a arte). Verde/roxo da
 * aparência oficial não é reproduzido hoje nem nas outras. */
const TRUE_FEVERBLOOM_ASURA = {
  name: "True Feverbloom Asura",
  hp: 8600,
  exp: 8600,
  speed: 175,
  armor: 90,
  defense: 55,
  damage: 620,
  element: "earth",
  attackSpeed: 2000,
  meleeCond: { tipo: "poison", dano: 100, total: 400 },
  mitigation: 3.45,
  resist: {
    physical: 0, earth: 15, fire: 100,
    energy: -5, holy: -5, ice: -10, death: -10,
  },
  skills: [
    { el: "manadrain", min: 75, max: 300, int: 2000, ch: 10, range: 7 },
    { el: "earth", min: 480, max: 760, int: 1000, ch: 15, length: 8, spread: 0, fx: "poison" },
    { el: "earth", min: 380, max: 640, int: 2000, ch: 15, radius: 4, fx: "poison" },
    { el: "lifedrain", min: 120, max: 300, int: 2000, ch: 10, length: 8, spread: 0, fx: "purple-energy" },
    { el: "physical", min: 0, max: 0, int: 2000, ch: 15, n: "speed", radius: 1, fx: "magic-red", alvo: 1 },
  ],
  defSkills: [
    { n: "healing", min: 50, max: 100, int: 2000, ch: 15 },
    { n: "speed", int: 2000, ch: 15 },
    { n: "invisible", int: 2000, ch: 20 },
  ],
  looktype: 1068,
  race: "blood",
  targetDistance: 1,
  staticAttack: 80,
  imune: ["paralyze", "invisible"],
  loot: [
    { chance: 87, max: 15, item: "platinum-coin" },
    { chance: 20, max: 1, item: "peacock-feather-fan" },
    { chance: 19, max: 1, item: "flask-of-demonic-blood" },
    { chance: 19, max: 1, item: "golden-lotus-brooch" },
    { chance: 15, max: 1, item: "demonic-essence" },
    { chance: 9, max: 1, item: "pyrophyte-seed-pod" },
    { chance: 7, max: 1, item: "seeds" },
    { chance: 7, max: 1, item: "wild-flowers" },
    { chance: 6, max: 1, item: "crystal-coin" },
    { chance: 2, max: 1, item: "oriental-shoes" },
    { chance: 1, max: 1, item: "muck-rod" },
  ],
  best: {
    classe: "Demon", toKill: 2500, u1: 100, u2: 1000, charm: 50,
    stars: 4, ocor: 0, locais: "Forbidden Gardens, Thalassara.",
  },
  grupo: "demons",
};

const TRUE_ASURAS_DATA = {
  monsterSlug: "true-feverbloom-asura",
  monster: TRUE_FEVERBLOOM_ASURA,
  registerMonsters(monsters) {
    if (monsters) monsters["true-feverbloom-asura"] = TRUE_FEVERBLOOM_ASURA;
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = TRUE_ASURAS_DATA;

(function registerTrueAsuras() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in TRUE_ASURAS_LOOT_ITEMS) {
    const def = TRUE_ASURAS_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }

  /* Monstro novo (ausente do dump Canary) — registra nos dois catálogos
   * para o spawn/loot resolverem igual às outras asuras. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA)
    MONSTERDATA["true-feverbloom-asura"] = TRUE_FEVERBLOOM_ASURA;
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  GAMEDATA.monsters["true-feverbloom-asura"] = TRUE_FEVERBLOOM_ASURA;

  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS &&
      !MOBSHEETS["true-feverbloom-asura"])
    MOBSHEETS["true-feverbloom-asura"] = { ch: 46, cols: 9, cw: 46, rows: 4 };

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["true-asuras"] = {
    name: "True Asuras - Thalassara",
    level: 400,
    minLevel: 400,
    cat: "hard",
    pack: 10,
    packMin: 8,
    packMax: 10,
    monsters: [
      "true-dawnfire-asura",
      "true-midnight-asura",
      "true-frost-flower-asura",
      "true-feverbloom-asura",
    ],
    spawnWeights: {
      "true-dawnfire-asura": 25,
      "true-midnight-asura": 25,
      "true-frost-flower-asura": 25,
      "true-feverbloom-asura": 25,
    },
    color: "#4a7a5a",
    scene: "palace",
    otbm: "true_asuras_thalassara",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    // centermap informado {1022,1026,7} cai em decoração bloqueante;
    // usa a caminhável adjacente {1023,1026,7}.
    otbmSpawn: { x: 1023, y: 1026, z: 7 },
    otbmMobBounds: { x: 1015, y: 1024, w: 13, h: 8, z: 7 },
    avgHp: 7525,
    avgExp: 7614,
    avgDamage: 600,
    avgArmor: 78,
    avgGold: 400,
    respawn: 1,
  };

  if (typeof HUNT_MODAL_SECTIONS !== "undefined") {
    const section = HUNT_MODAL_SECTIONS.find((s) =>
      s.title && s.title.indexOf("400+") !== -1 &&
      s.title.indexOf("HUNTS") !== -1
    );
    if (section && section.ids.indexOf("true-asuras") === -1) {
      section.ids.push("true-asuras");
    }
  }
})();
