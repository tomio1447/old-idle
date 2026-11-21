/* stonerefiner.js — HUNT STONEREFINER (categoria 1–100, Corym Mines).
 *
 * Uma criatura direta do Canary (data-otservbr-global/monster/reptiles):
 * Stonerefiner. Combate, loot, HP/XP/dano/armor, poisons e spells vêm de
 * canarymonsters.json / MONSTERDATA — esta ficha só registra a hunt e
 * os itens de loot que faltavam no catálogo (TibiaWiki / items.xml).
 *
 * Coordenadas absolutas do RME:
 *   centermap     {1063,1005,7}
 *   playerspawn   {1059,1007,7}
 *   monsterradius {1057,1004,7}..{1070,1010,7}
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (MISSION_DEFS não existe no vm).
 */
"use strict";

const STONEREFINER = {
  otbm: "stonerefiner",
  name: "Stonerefiner",
  center: { x: 1063, y: 1005, z: 7 },  // centermap
  spawn: { x: 1059, y: 1007, z: 7 },  // playerspawn
  mob: { x: 1057, y: 1004, w: 14, h: 7, z: 7 }, // monsterradius 1057,1004..1070,1010
};

/* Itens de loot do Canary que faltavam no catálogo (TibiaWiki / items.xml).
 * Preços = npcvalue oficial (Yasir/Malunga). */
const STONEREFINER_LOOT_ITEMS = {
  "rare-earth":            { n: "rare earth", s: null, t: "loot", cid: 27301, w: 2.50, sell: 80, npcSell: 80 },
  "glob-of-acid-slime":    { n: "glob of acid slime", s: null, t: "loot", cid: 9054, w: 0.10, sell: 25, npcSell: 25 },
  "stonerefiner-s-skull":  { n: "stonerefiner's skull", s: null, t: "loot", cid: 27606, w: 3.00, sell: 100, npcSell: 100 },
  "poisonous-slime":       { n: "poisonous slime", s: null, t: "loot", cid: 9640, w: 0.80, sell: 50, npcSell: 50 },
  "half-digested-stones":  { n: "half-digested stones", s: null, t: "loot", cid: 27369, w: 2.00, sell: 60, npcSell: 60 },
};

/* Médias da criatura (Canary: 800 hp, 500 exp, 100 dano, 20 armor).
 * gold ~metade do Canary: o loot foi reduzido em 50% (ver registerLoot). */
const STONEREFINER_AVG = { hp: 800, exp: 500, damage: 100, armor: 20, gold: 101.25 };

/* Loot reduzido em 50% (pedido do jogador): a chance de cada entrada da
 * tabela do Canary é dividida por 2 — o min/max de cada drop não muda
 * (mesma regra do engine: chance é multiplicada, quantidade nunca).
 * `registerLoot` segue o padrão do putrefactory.js: o cliente aplica em
 * GAMEDATA.monsters/MONSTERDATA e a autoridade chama com MONSTERS no boot.
 * O marker evita dupla aplicação quando os catálogos dividem o objeto. */
const STONEREFINER_LOOT_MUL = 0.5;

const STONEREFINER_PATCH = {
  registerLoot(monsters) {
    const def = monsters && monsters["stonerefiner"];
    if (!def || !Array.isArray(def.loot)) return;
    if (def._stoneLootMul === STONEREFINER_LOOT_MUL) return;
    def.loot = def.loot.map((l) =>
      l && typeof l.chance === "number"
        ? Object.assign({}, l, { chance: l.chance * STONEREFINER_LOOT_MUL })
        : l);
    def._stoneLootMul = STONEREFINER_LOOT_MUL;
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = STONEREFINER_PATCH;

(function registerStonerefiner() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in STONEREFINER_LOOT_ITEMS) {
    const def = STONEREFINER_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = Object.assign({}, def);
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.buy != null) items[slug].buy = def.buy;
      if (def.s != null) items[slug].s = def.s;
      if (def.t != null) items[slug].t = def.t;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  // Ficha no catálogo + loot -50%. MONSTERDATA também é patchado porque
  // o combate usa `GAMEDATA.monsters[slug] || MONSTERDATA[slug]`.
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  if (!GAMEDATA.monsters["stonerefiner"] && typeof MONSTERDATA !== "undefined" && MONSTERDATA["stonerefiner"])
    GAMEDATA.monsters["stonerefiner"] = MONSTERDATA["stonerefiner"];
  STONEREFINER_PATCH.registerLoot(GAMEDATA.monsters);
  if (typeof MONSTERDATA !== "undefined") STONEREFINER_PATCH.registerLoot(MONSTERDATA);

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["stonerefiner"] = {
    name: STONEREFINER.name,
    level: 35,
    minLevel: 35,
    cat: "aventureiro",
    pack: 5,
    monsters: ["stonerefiner"],
    color: "#7a6a5a",
    scene: "cave",
    otbm: STONEREFINER.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1056, y: 1000, w: 19, h: 15, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: STONEREFINER.spawn,
    otbmMobBounds: STONEREFINER.mob,
    avgHp: STONEREFINER_AVG.hp,
    avgExp: STONEREFINER_AVG.exp,
    avgDamage: STONEREFINER_AVG.damage,
    avgArmor: STONEREFINER_AVG.armor,
    avgGold: STONEREFINER_AVG.gold,
    respawn: 0.8,
  };
})();
