/* moonstone-castle.js — HUNT Moonstone Castle (nível 400+).
 * Mapa: game/maps/moonstone_castle.otbm (46×35, z=7; bounds
 * 1004,1012–1049,1046). Componente caminhável principal de 94 sqm.
 * Criaturas: Moonsilver Custodian e Moonstone Miner (6 a 14 por onda).
 * Coordenadas RME informadas:
 *   centeroom     {1026,1032,7} — caminhável, vira o spawn do jogador
 *   respawnradius {1023,1027,7} → {1029,1037,7} (7×11; 70 sqm caminháveis)
 *
 * As duas criaturas são do update 15.30 "Make Believe" (Moonstone
 * Crater, adds da luta do Mimar Haffar) e não existem no dump Canary.
 * Fichas oficiais (TibiaWiki/TibiaRealm):
 *   Moonsilver Custodian — 23.300 hp, exp 0; earth +20, fire +10,
 *     energy −4, demais neutro; ataques Physical + Holy (+ Root);
 *     Loot: nenhum.
 *   Moonstone Miner — 16.500 hp, exp 0; earth imune, death +50,
 *     fire −5, energy −7, demais neutro; ataques Physical + Life
 *     Drain; não empurrável, empurra objetos, imune a paralisia e vê
 *     invisível; Loot: Moonsilver Crystals (quest item, sell 0).
 * São criaturas de quest: exp 0 oficial e fora do bestiário (a hunt
 * rende loot/cristais, não experiência).
 *
 * Sprite do custodian: looktype 1956 (identificado por comparação
 * pixel a pixel contra o GIF oficial do fansite). O sprite oficial do
 * miner NÃO existe no DAT convertido — a sheet foi montada dos 8
 * quadros do GIF oficial (tibiarealm.com), replicados nas 4 direções.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa; o
 * registro dos monstros no MONSTERS é via module.exports (mesmo
 * padrão do true-asuras).
 */
"use strict";

/* Moonsilver Crystals — item de quest 15.30 (cid 54267 no appearances
 * 15.x; ícone 32×32 renderizado por tools/import_moonstone_castle_assets.py).
 * Sem comprador/vendedor NPC (TibiaWiki: "Ninguém.") → sell 0. */
const MOONSTONE_CASTLE_ITEMS = {
  "moonsilver-crystals": { n: "moonsilver crystals", s: null, t: "loot",
    cid: 54267, w: 3.0, sell: 0, npcSell: 0 },
};

const MOONSILVER_CUSTODIAN = {
  name: "Moonsilver Custodian",
  hp: 23300,
  exp: 0,
  speed: 205,
  armor: 85,
  defense: 85,
  damage: 750,
  element: "physical",
  attackSpeed: 2000,
  mitigation: 3.0,
  resist: { earth: 20, fire: 10, energy: -4 },
  skills: [
    { el: "holy", min: 550, max: 900, int: 2000, ch: 25, range: 5,
      fx: "holy-area", miss: "holy", alvo: 1 },
    { el: "physical", min: 0, max: 0, int: 4000, ch: 20, n: "root",
      radius: 3, fx: "hit-area" },
  ],
  defSkills: [
    { n: "healing", min: 150, max: 300, int: 2000, ch: 10 },
  ],
  looktype: 1956,
  race: "blood",
  targetDistance: 1,
  staticAttack: 90,
  imune: ["paralyze", "invisible"],
  /* Loot: nenhum (oficial — criatura de quest). */
  loot: [],
};

const MOONSTONE_MINER = {
  name: "Moonstone Miner",
  hp: 16500,
  exp: 0,
  speed: 190,
  armor: 70,
  defense: 70,
  damage: 550,
  element: "physical",
  attackSpeed: 2000,
  mitigation: 2.5,
  resist: { earth: 100, fire: -5, death: 50, energy: -7 },
  skills: [
    { el: "lifedrain", min: 350, max: 700, int: 2000, ch: 20, range: 4,
      radius: 3, fx: "magic-red", alvo: 1 },
  ],
  /* Sprite oficial ausente do DAT convertido: sheet montada do GIF
   * oficial (8 quadros, direção sul replicada nas 4 linhas). O
   * looktype real não foi publicado; 1291 é só o humanoide mais
   * próximo no catálogo (a arte vem do sheet, não do looktype). */
  looktype: 1291,
  race: "blood",
  targetDistance: 1,
  staticAttack: 90,
  runAt: 0,
  imune: ["paralyze", "invisible"],
  loot: [
    { chance: 60, max: 3, item: "moonsilver-crystals" },
  ],
};

const MOONSTONE_CASTLE_DATA = {
  registerMonsters(monsters) {
    if (!monsters) return;
    monsters["moonsilver-custodian"] = MOONSILVER_CUSTODIAN;
    monsters["moonstone-miner"] = MOONSTONE_MINER;
  },
};
if (typeof module !== "undefined" && module.exports)
  module.exports = MOONSTONE_CASTLE_DATA;

(function registerMoonstoneCastle() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in MOONSTONE_CASTLE_ITEMS) {
    const def = MOONSTONE_CASTLE_ITEMS[slug];
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
    MONSTERDATA["moonsilver-custodian"] = MOONSILVER_CUSTODIAN;
    MONSTERDATA["moonstone-miner"] = MOONSTONE_MINER;
  }
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  GAMEDATA.monsters["moonsilver-custodian"] = MOONSILVER_CUSTODIAN;
  GAMEDATA.monsters["moonstone-miner"] = MOONSTONE_MINER;

  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS) {
    if (!MOBSHEETS["moonsilver-custodian"])
      MOBSHEETS["moonsilver-custodian"] = { ch: 40, cols: 9, cw: 40, rows: 4 };
    if (!MOBSHEETS["moonstone-miner"])
      MOBSHEETS["moonstone-miner"] = { ch: 43, cols: 9, cw: 36, rows: 4 };
  }

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["moonstone-castle"] = {
    name: "Moonstone Castle",
    level: 400,
    minLevel: 400,
    cat: "hard",
    pack: 14,
    packMin: 6,
    packMax: 14,
    monsters: [
      "moonsilver-custodian",
      "moonstone-miner",
    ],
    spawnWeights: {
      "moonsilver-custodian": 50,
      "moonstone-miner": 50,
    },
    color: "#5a7a8a",
    scene: "palace",
    otbm: "moonstone_castle",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    // centeroom informado {1026,1032,7} é caminhável → spawn do jogador.
    otbmSpawn: { x: 1026, y: 1032, z: 7 },
    otbmMobBounds: { x: 1023, y: 1027, w: 7, h: 11, z: 7 },
    avgHp: 19900,
    avgExp: 0,
    avgDamage: 650,
    avgArmor: 78,
    avgGold: 0,
    respawn: 1,
  };

  if (typeof HUNT_MODAL_SECTIONS !== "undefined") {
    const section = HUNT_MODAL_SECTIONS.find((s) =>
      s.title && s.title.indexOf("400+") !== -1 &&
      s.title.indexOf("HUNTS") !== -1
    );
    if (section && section.ids.indexOf("moonstone-castle") === -1) {
      section.ids.push("moonstone-castle");
    }
  }
})();
