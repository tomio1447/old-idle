/* falcon-bastion.js — HUNT FALCON BASTION (categoria 250+).
 *
 * Criaturas diretas do Canary:
 *   - Falcon Knight / Falcon Paladin (looktype 1071)
 *   - Mini bosses raros (0.1% por slot de spawn):
 *       Grand Commander Soeren, Preceptor Lazare,
 *       Grand Chaplain Gaunder, Grand Canon Dominus
 *
 * Loot dos mini bosses NÃO vai para a Loot Pouch: eles são marcados como
 * boss (hunt.bossMobs) e o jogo encaminha o drop para o Reward Chest.
 *
 * Coordenadas absolutas do RME:
 *   centeroom  {1057,998,7}
 *   playerspawn {1055,1000,7}
 *   monsterradius {1053,993,7}..{1061,1000,7}
 */
"use strict";

const FALCON_BASTION = {
  otbm: "falconbastion",
  name: "Falcon Bastion",
  center: { x: 1057, y: 998, z: 7 },
  spawn: { x: 1055, y: 1000, z: 7 },
  mob: { x: 1053, y: 993, w: 9, h: 8, z: 7 },
};

/* Itens de loot do Canary que faltavam no catálogo. Equipamentos Falcon usam
 * os atributos principais (atk/def/arm/lvl/vocs) do items.xml. */
const FALCON_BASTION_ITEMS = {
  "falcon-crest":             { n: "falcon crest", s: null, t: "loot", cid: 28823, w: 0.50, sell: 120, npcSell: 120 },
  "damaged-armor-plates":     { n: "damaged armor plates", s: null, t: "loot", cid: 28822, w: 2.00, sell: 80, npcSell: 80 },
  "small-enchanted-amethyst": { n: "small enchanted amethyst", s: null, t: "loot", cid: 678, w: 0.10, sell: 250, npcSell: 250 },
  "patch-of-fine-cloth":      { n: "patch of fine cloth", s: null, t: "loot", cid: 28821, w: 1.80, sell: 0, npcSell: 0 },
  "falcon-coif":              { n: "falcon coif", s: "helmet", t: "helmet", cid: 28715, w: 2.80, sell: 0, npcSell: 0, arm: 10, lvl: 300, vocs: ["knight", "elite knight", "paladin", "royal paladin"], imbSlots: 2 },
  "falcon-bow":               { n: "falcon bow", s: "distance", t: "distance", cid: 28718, w: 3.50, sell: 0, npcSell: 0, atk: 7, range: 6, hitchance: 5, lvl: 300, vocs: ["paladin", "royal paladin"], th: true, imbSlots: 3 },
  "falcon-rod":               { n: "falcon rod", s: "rod", t: "rod", cid: 28716, w: 3.70, sell: 0, npcSell: 0, mdmg: 94, range: 5, ml: 3, lvl: 300, vocs: ["druid", "elder druid"], imbSlots: 2 },
  "falcon-greaves":           { n: "falcon greaves", s: "legs", t: "legs", cid: 28720, w: 3.60, sell: 0, npcSell: 0, arm: 10, lvl: 300, vocs: ["knight", "elite knight", "paladin", "royal paladin"], imbSlots: 2 },
  "falcon-battleaxe":         { n: "falcon battleaxe", s: "axe", t: "axe", cid: 28724, w: 9.50, sell: 0, npcSell: 0, atk: 10, def: 33, lvl: 300, vocs: ["knight", "elite knight"], th: true, imbSlots: 2 },
  "falcon-longsword":         { n: "falcon longsword", s: "sword", t: "sword", cid: 28723, w: 8.20, sell: 0, npcSell: 0, atk: 56, def: 34, lvl: 300, vocs: ["knight", "elite knight"], th: true, imbSlots: 2 },
  "falcon-mace":              { n: "falcon mace", s: "club", t: "club", cid: 28725, w: 6.80, sell: 0, npcSell: 0, atk: 11, def: 33, lvl: 300, vocs: ["knight", "elite knight"], imbSlots: 2 },
  "falcon-plate":             { n: "falcon plate", s: "armor", t: "armor", cid: 28719, w: 18.80, sell: 0, npcSell: 0, arm: 18, lvl: 300, vocs: ["knight", "elite knight"], imbSlots: 2 },
  "falcon-shield":            { n: "falcon shield", s: "shield", t: "shield", cid: 28721, w: 5.70, sell: 0, npcSell: 0, def: 39, lvl: 300, vocs: ["knight", "elite knight", "paladin", "royal paladin"], imbSlots: 1 },
  "falcon-wand":              { n: "falcon wand", s: "wand", t: "wand", cid: 28717, w: 3.30, sell: 0, npcSell: 0, mdmg: 94, range: 5, ml: 3, lvl: 300, vocs: ["sorcerer", "master sorcerer"], imbSlots: 2 },
};

/* Médias das 2 criaturas normais. */
const FALCON_BASTION_AVG = { hp: 8750, exp: 6600, damage: 325, armor: 57, gold: 120 };

(function registerFalconBastion() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in FALCON_BASTION_ITEMS) {
    const def = FALCON_BASTION_ITEMS[slug];
    if (!items[slug]) items[slug] = Object.assign({}, def);
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.buy != null) items[slug].buy = def.buy;
      if (def.s != null) items[slug].s = def.s;
      if (def.t != null) items[slug].t = def.t;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.atk != null) items[slug].atk = def.atk;
      if (def.def != null) items[slug].def = def.def;
      if (def.arm != null) items[slug].arm = def.arm;
      if (def.mdmg != null) items[slug].mdmg = def.mdmg;
      if (def.range != null) items[slug].range = def.range;
      if (def.hitchance != null) items[slug].hitchance = def.hitchance;
      if (def.ml != null) items[slug].ml = def.ml;
      if (def.lvl != null) items[slug].lvl = def.lvl;
      if (def.vocs) items[slug].vocs = def.vocs.slice();
      if (def.th != null) items[slug].th = def.th;
      if (def.imbSlots != null) items[slug].imbSlots = def.imbSlots;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["falcon-bastion"] = {
    name: FALCON_BASTION.name,
    level: 250,
    minLevel: 250,
    cat: "aventureiro",
    pack: 7,
    packMin: 6,
    packMax: 8,
    monsters: ["falcon-knight", "falcon-paladin"],
    bossMobs: [
      "grand-commander-soeren",
      "preceptor-lazare",
      "grand-chaplain-gaunder",
      "grand-canon-dominus",
    ],
    spawnWeights: {
      "falcon-knight": 49.95,
      "falcon-paladin": 49.95,
      "grand-commander-soeren": 0.025,
      "preceptor-lazare": 0.025,
      "grand-chaplain-gaunder": 0.025,
      "grand-canon-dominus": 0.025,
    },
    color: "#6a6a7a",
    scene: "cave",
    otbm: FALCON_BASTION.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1051, y: 991, w: 14, h: 12, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: FALCON_BASTION.spawn,
    otbmMobBounds: FALCON_BASTION.mob,
    avgHp: FALCON_BASTION_AVG.hp,
    avgExp: FALCON_BASTION_AVG.exp,
    avgDamage: FALCON_BASTION_AVG.damage,
    avgArmor: FALCON_BASTION_AVG.armor,
    avgGold: FALCON_BASTION_AVG.gold,
    respawn: 0.9,
  };
})();
