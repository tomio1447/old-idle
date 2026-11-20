/* court-warlock.js — Court Warlock (level 400+, boss final da The Order
 * of the Stag Quest, update 15.20 / Isle of Ada).
 *
 * Ficha oficial (wikitext Fandom + staticdata do client 15.20):
 *   - race_id 2741, looktype OFICIAL 1903 (decodificado do bestiário
 *     do client), hp OFICIAL 120.000, exp 147.000, Archfoe;
 *     walksthrough Fire/Energy/Poison (campos), para-immune,
 *     sense-invis; maxdmg 1000+; cooldown resetável com Twisted
 *     Marionette (aqui cooldown padrão 20h).
 *   - Loot oficial completo: Stag Set (10 peças lvl 350 "Negotiable"
 *     → sell 0), Twisted Marionette (npcvalue 125.000 → Yasir),
 *     Wooden Spellbook (npcvalue 12.000 → Talila/Valindara),
 *     Spellbook of Mind Control, Terra Hood, Lightning Headband,
 *     Magma Coat, gems, moedas e poções ultimate.
 *
 * Mecânica oficial da luta (Spoiler da quest):
 *   Fase 1 — Raubritters spawnam continuamente NA POSIÇÃO do jogador:
 *     Poisoned (imune earth), Frozen (imune ice), Raging (imune fire),
 *     Energised (lutador à distância, imune energy). Se 4 do MESMO tipo
 *     ficarem vivos ao mesmo tempo → mudam de forma para uma versão
 *     mais forte. Em intervalos, os jogadores são teleportados pela
 *     sala; terreno especial (ground 500 do OTBM — anel central)
 *     causa Death Damage alto a cada passo.
 *   Fase 2 — após algumas waves a sala se enche de Falcon Paladins e
 *     Falcon Knights; o terreno especial some.
 *   Fase 3 — com todos os minions mortos o Court Warlock entra, com
 *     menos HP dependendo de como foi a luta.
 *   Valores não publicados (tamanho/intervalo das waves, bônus dos
 *     enraivecidos, penalidade de HP) são design documentado.
 *
 * Este arquivo também roda no sandbox vm do servidor: lá só itens e
 * monstros executam; o registro no MONSTERS é via module.exports.
 */
"use strict";

const CW_QUEST_TITLE = "The Order of the Stag";
const CW_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/* Sala court_room.otbm (z=7) — coords oficiais informadas. */
const CW_ROOM = {
  otbm: "court_room",
  center: { x: 1021, y: 1025, z: 7 },
  spawn: { x: 1021, y: 1028, z: 7 },
  boss: { x: 1021, y: 1022, z: 7 },
};

/* Terreno especial: as 12 células de ground 500 do OTBM (anel central),
 * em offsets relativos ao bossspawn {1021,1022}. Oficial: "each step
 * deals high Death Damage". */
const CW_HAZARD_OFFSETS = [
  [-3, +3], [-3, +4], [-2, +2], [-2, +5], [-1, +2], [-1, +5],
  [0, +2], [0, +5], [+1, +2], [+1, +5], [+2, +3], [+2, +4],
];
const CW_HAZARD_DMG = [800, 1500];   // death damage por tick de exposição
const CW_HAZARD_MS = 1200;           // intervalo do dano de terreno (design)
const CW_WAVE_MS = 14000;            // intervalo entre waves (design)
const CW_WAVE_SIZE = 3;              // raubritters por wave (design)
const CW_WAVES = 5;                  // "after a few waves" → fase falcons
const CW_TRANSFORM_AT = 4;           // oficial: 4 do mesmo tipo → forma forte
const CW_TELEPORT_MS = 25000;        // "at intervals" (design)
const CW_FALCON_COUNT = 8;           // "fills up with Paladins and Knights"
const CW_BOSS_HP_PER_TRANSFORM = 15000; // hp extra por transform (design)

/* ── Itens novos (cids oficiais do wikitext). Stag Set: "Negotiable"
 * sem comprador NPC → sell 0 (padrão das crypt weapons). ── */
const CW_ITEMS = {
  /* ── Stag Set (lvl 350, upgrade class 4) ── */
  "stag-helmet":    { n: "stag helmet",     s: "helmet", t: "armor", cid: 52348,
                      arm: 8, ml: 2, fireMl: 2, res: { physical: 2, energy: 8 },
                      imbSlots: 2, lvl: 350, vocs: ["sorcerer"], w: 14,
                      drop: 1, sell: 0, npcSell: 0 },
  "stag-robe":      { n: "stag robe",       s: "armor",  t: "armor", cid: 52349,
                      arm: 10, res: { physical: 4 }, imbSlots: 2, lvl: 350,
                      vocs: ["monk"], w: 80, drop: 1, sell: 0, npcSell: 0 },
  "stag-plate":     { n: "stag plate",      s: "armor",  t: "armor", cid: 52350,
                      arm: 17, dist: 3, res: { physical: 3, ice: 8 },
                      imbSlots: 2, lvl: 350, vocs: ["paladin"], w: 130,
                      drop: 1, sell: 0, npcSell: 0 },
  "stag-legs":      { n: "stag legs",       s: "legs",   t: "armor", cid: 52351,
                      arm: 10, sword: 3, club: 3, axe: 3,
                      res: { physical: 7, fire: 7 }, lvl: 350,
                      vocs: ["knight"], w: 11.5, drop: 1, sell: 0, npcSell: 0 },
  "stag-shinguards":{ n: "stag shinguards", s: "boots",  t: "armor", cid: 52352,
                      arm: 2, dist: 1, spd: 10, res: { physical: 2, energy: 5 },
                      imbSlots: 1, lvl: 350, vocs: ["paladin"], w: 17,
                      drop: 1, sell: 0, npcSell: 0 },
  "stag-boots":     { n: "stag boots",      s: "boots",  t: "armor", cid: 52353,
                      arm: 2, ml: 1, res: { energy: 8 }, imbSlots: 1,
                      lvl: 350, vocs: ["druid"], w: 14, drop: 1, sell: 0, npcSell: 0 },
  "stag-footwraps": { n: "stag footwraps",  s: "boots",  t: "armor", cid: 52354,
                      arm: 2, res: { physical: 2, death: 3 }, imbSlots: 1,
                      lvl: 350, vocs: ["monk"], w: 14, drop: 1, sell: 0, npcSell: 0 },
  "stag-spellbook": { n: "stag spellbook",  s: "shield", t: "armor", cid: 52355,
                      def: 34, ml: 5, res: { physical: 2, energy: 6 },
                      imbSlots: 1, lvl: 350, vocs: ["sorcerer"], w: 20,
                      drop: 1, sell: 0, npcSell: 0 },
  "stag-scrolls":   { n: "stag scrolls",    s: "shield", t: "armor", cid: 52356,
                      def: 34, ml: 5, res: { physical: 2, death: 5 },
                      imbSlots: 1, lvl: 350, vocs: ["druid"], w: 20,
                      drop: 1, sell: 0, npcSell: 0 },
  "stag-shield":    { n: "stag shield",     s: "shield", t: "armor", cid: 52357,
                      def: 52, res: { physical: 5, ice: 10 }, imbSlots: 1,
                      lvl: 350, vocs: ["knight"], w: 55,
                      drop: 1, sell: 0, npcSell: 0 },
  /* ── Twisted Marionette: reseta o cooldown do boss (npcvalue 125k) ── */
  "twisted-marionette": { n: "twisted marionette", s: null, t: "loot",
                      cid: 52746, w: 10.01, sell: 125000, npcSell: 125000 },
  /* ── Wooden Spellbook (npcvalue 12.000 → Talila/Valindara) ── */
  "wooden-spellbook":   { n: "wooden spellbook", s: "shield", t: "armor",
                      cid: 25699, def: 26, ml: 2, res: { earth: 5 },
                      imbSlots: 1, lvl: 80, vocs: ["sorcerer", "druid"],
                      w: 12, sell: 12000, npcSell: 12000 },
  /* ── Ultimate Spirit Potion (poção de paladin/monk 130+) ── */
  "ultimate-spirit-potion": { n: "ultimate spirit potion", s: "potion",
                      t: "loot", cid: 23374, sell: 600, w: 3.1 },
};

/* ── Monstros ── */
/* Court Warlock — hp OFICIAL 120.000, exp 147.000, race 2741 lt 1903.
 * Skills estimadas (abilities oficiais ocultas; sons sugerem fogo —
 * "COSY IN HERE!" — e raios de warlock). */
const COURT_WARLOCK = {
  name: "Court Warlock", hp: 120000, exp: 147000,
  speed: 235, armor: 90, defense: 85,
  damage: 1000, element: "energy", attackSpeed: 2000, mitigation: 0,
  resist: { fire: 100, energy: 100, earth: 100 },  // walksthrough oficial
  skills: [
    /* Energy Ball 400-700 (design; maxdmg oficial 1000+). */
    { el: "energy", min: 400, max: 700, int: 4500, ch: 30, radius: 2,
      fx: "energy-area", miss: "energy" },
    /* Fire Wave "COSY IN HERE!" (design). */
    { el: "fire", min: 500, max: 900, int: 6000, ch: 25, range: 6,
      wave: 1, fx: "fire-area", miss: "fire" },
    /* Death strike no alvo (design). */
    { el: "death", min: 450, max: 800, int: 5000, ch: 30, range: 7,
      miss: "mort-area", alvo: 1 },
  ],
  looktype: 1903, raceId: 2741, targetDistance: 3, staticAttack: 90,
  imune: ["paralyze", "invisible"], grupo: "quests",
  voices: { int: 8000, ch: 18, list: [
    { t: "Oh? Maybe it should get a little more COSY IN HERE!" },
    { t: "I welcome you, to witness the spectacular destruction of the outside menace that cost so many of your dear brethren's lives!" },
    { t: "Enough of this! Stop gawking and GET OVER THERE TO FINISH IT!" },
    { t: "DO I REALLY NEED TO DO EVERYTHING... EEEVERYTHIIING MYSELF!" },
    { t: "No, not like this, not without... NOOO!!!" },
    { t: "You're just flies in my bed-chamber." },
    { t: "Your medding with my affairs was a grave mistake!" },
  ] },
  loot: [
    { item: "platinum-coin", chance: 100, max: 50 },
    { item: "crystal-coin", chance: 60, max: 3 },
    { item: "ultimate-health-potion", chance: 70, max: 12 },
    { item: "ultimate-mana-potion", chance: 70, max: 12 },
    { item: "ultimate-spirit-potion", chance: 70, max: 12 },
    { item: "blue-gem", chance: 30, max: 2 },
    { item: "red-gem", chance: 30, max: 2 },
    { item: "lightning-headband", chance: 14, max: 1 },
    { item: "magma-coat", chance: 14, max: 1 },
    { item: "terra-hood", chance: 14, max: 1 },
    { item: "spellbook-of-mind-control", chance: 12, max: 1 },
    { item: "wooden-spellbook", chance: 10, max: 1 },
    { item: "twisted-marionette", chance: 4, max: 1 },
    { item: "crystal-coin", chance: 0.5, max: 500 },   // 500 cc very rare
    { item: "stag-boots", chance: 0.8, max: 1 },
    { item: "stag-footwraps", chance: 0.8, max: 1 },
    { item: "stag-helmet", chance: 0.8, max: 1 },
    { item: "stag-legs", chance: 0.8, max: 1 },
    { item: "stag-plate", chance: 0.8, max: 1 },
    { item: "stag-robe", chance: 0.8, max: 1 },
    { item: "stag-scrolls", chance: 0.8, max: 1 },
    { item: "stag-shinguards", chance: 0.8, max: 1 },
    { item: "stag-shield", chance: 0.8, max: 1 },
    { item: "stag-spellbook", chance: 0.8, max: 1 },
  ],
};

/* Raubritters — hp OFICIAL 35.000, exp 0, imunes ao próprio elemento
 * (dmgMod 0% oficial), walksthrough Fire/Energy/Poison (campos),
 * para-immune + sense-invis. Looktypes estimados do lote livre 15.20. */
const RAUB_BASE = {
  hp: 35000, exp: 0, speed: 220, armor: 60, defense: 60,
  attackSpeed: 2000, mitigation: 0, targetDistance: 1, staticAttack: 90,
  imune: ["paralyze", "invisible"], loot: [], grupo: "quests",
};
function raub(name, looktype, el, skills, extra) {
  const def = Object.assign({}, RAUB_BASE, {
    name, looktype, element: el, damage: 600,
    resist: { fire: 100, energy: 100, earth: 100 },
    skills: skills.slice(), cwRaub: true,
  }, extra || {});
  def.resist[el] = 100;   // oficial: imune ao próprio elemento
  return def;
}
const POISONED_RAUBRITTER = raub("Poisoned Raubritter", 1895, "earth", [
  { el: "earth", min: 350, max: 700, int: 3500, ch: 30, radius: 2,
    fx: "poison-area", miss: "poison" },
]);
const FROZEN_RAUBRITTER = raub("Frozen Raubritter", 1890, "ice", [
  { el: "ice", min: 350, max: 700, int: 3500, ch: 30, radius: 2,
    fx: "ice-attack", miss: "ice" },
]);
const RAGING_RAUBRITTER = raub("Raging Raubritter", 1910, "fire", [
  { el: "fire", min: 350, max: 750, int: 3500, ch: 30, radius: 2,
    fx: "fire-area", miss: "fire" },
]);
/* Energised: distance fighter oficial — mantém distância. */
const ENERGISED_RAUBRITTER = raub("Energised Raubritter", 1909, "energy", [
  { el: "energy", min: 350, max: 700, int: 3000, ch: 35, range: 7,
    miss: "energy", alvo: 1 },
], { targetDistance: 4, ranged: 1 });

/* Formas fortes — oficial: "a stronger version of themselves". Stats
 * estimados (+50% hp, +60% dano — design); looktypes estimados. */
function raubStrong(base, looktype) {
  return Object.assign({}, base, {
    name: "Enraged " + base.name, looktype,
    hp: Math.round(base.hp * 1.5), damage: Math.round(base.damage * 1.6),
    armor: base.armor + 10, defense: base.defense + 10,
    skills: base.skills.map((s) => Object.assign({}, s, {
      min: Math.round(s.min * 1.6), max: Math.round(s.max * 1.6) })),
    cwStrong: true,
  });
}
const STRONG_POISONED  = raubStrong(POISONED_RAUBRITTER, 1888);
const STRONG_FROZEN    = raubStrong(FROZEN_RAUBRITTER, 1885);
const STRONG_RAGING    = raubStrong(RAGING_RAUBRITTER, 1919);
const STRONG_ENERGISED = raubStrong(ENERGISED_RAUBRITTER, 1882);

/* ── Stag Bastion — hunt 400+ (spawn dos Raubritters "normais", não os
 * de boss). Fichas OFICIAIS (wikitext): hp/exp/armor/mitigation/speed,
 * dmgMods (resist = 100−mod), walksthrough Fire/Energy/Poison,
 * para-immune, sense-invis, maxdmg 1000+. Looktypes estimados do lote
 * livre 15.20 (bestiário existe mas o staticdata não mapeia). ── */
const SB_ITEMS = {
  "stag-parchment":       { n: "stag parchment", s: null, t: "loot",
                            cid: 52664, w: 7.5, sell: 3000, npcSell: 3000 },
  "silver-poniard":       { n: "silver poniard", s: null, t: "loot",
                            cid: 52662, w: 7.5, sell: 2000, npcSell: 2000 },
  "cuirass-plate":        { n: "cuirass plate", s: null, t: "loot",
                            cid: 52663, w: 7.5, sell: 1000, npcSell: 1000 },
  /* Sem comprador oficial (npcvalue 0): lager e sturgeon → sell 0. */
  "bottle-of-raubritter-lager": { n: "bottle of raubritter lager",
                            s: null, t: "loot", cid: 52745, w: 5,
                            sell: 0, npcSell: 0 },
  "marinated-sturgeon":   { n: "marinated sturgeon", s: null, t: "loot",
                            cid: 52638, w: 10, sell: 0, npcSell: 0 },
  "crystalline-arrow":    { n: "crystalline arrow", s: "ammo", t: "loot",
                            cid: 15793, w: 0.75, sell: 0, npcSell: 0 },
  "ring-of-green-plasma": { n: "ring of green plasma", s: "ring",
                            t: "armor", cid: 23531, w: 0.9,
                            sell: 8000, npcSell: 8000 },
  "ring-of-orange-plasma":{ n: "ring of orange plasma", s: "ring",
                            t: "armor", cid: 50150, w: 0.9,
                            sell: 8000, npcSell: 8000 },
};
/* Correções de preço oficial (npcvalue do wikitext) em itens já
 * existentes usados nas tabelas de loot da hunt. */
const SB_PRICE_FIX = {
  "magma-monocle": 2500, "wand-of-cosmic-energy": 2000,
  "wand-of-starstorm": 3600, "lightning-robe": 11000,
  "terra-mantle": 11000, "composite-hornbow": 25000,
  "shockwave-amulet": 3000, "magma-amulet": 1500, "gold-ingot": 5000,
};

const HUNT_RAUB_BASE = {
  exp: 0, armor: 90, defense: 85, damage: 600, element: "physical",
  attackSpeed: 2000, targetDistance: 1, staticAttack: 90,
  imune: ["paralyze", "invisible"], loot: [], grupo: "humans",
};
/* Raubritter Skirmisher — melee, hp 11000, exp 8550, armor 100,
 * mitigation 3.92, speed 150→160. */
const RAUB_SKIRMISHER = Object.assign({}, HUNT_RAUB_BASE, {
  name: "Raubritter Skirmisher", hp: 11000, exp: 8550,
  armor: 100, defense: 90, mitigation: 3.92, speed: 160, damage: 700,
  looktype: 1908,
  resist: { physical: -12, earth: -6, fire: -15, death: 0, energy: 9,
            holy: 15, ice: 20 },
  skills: [
    { el: "physical", min: 500, max: 900, int: 2000, ch: 40, range: 1 },
    { el: "physical", min: 400, max: 800, int: 4500, ch: 25, radius: 2,
      fx: "groundshaker", miss: "physical" },
  ],
  voices: { int: 6000, ch: 15, list: [
    { t: "Out... sider, hrngh!" }, { t: "Must... resist!" },
    { t: "Nnnooo... not... yesss, KILL!" } ] },
  loot: [
    { item: "platinum-coin", chance: 80, max: 10 },
    { item: "cuirass-plate", chance: 12, max: 1 },
    { item: "gold-ring", chance: 12, max: 1 },
    { item: "silver-poniard", chance: 12, max: 1 },
    { item: "fur-armor", chance: 12, max: 1 },
    { item: "mercenary-sword", chance: 12, max: 1 },
    { item: "crown-shield", chance: 6, max: 1 },
    { item: "gold-ingot", chance: 6, max: 1 },
    { item: "crown-armor", chance: 6, max: 1 },
    { item: "marinated-sturgeon", chance: 1.5, max: 1 },
    { item: "ring-of-orange-plasma", chance: 1.5, max: 1 },
    { item: "ring-of-red-plasma", chance: 1.5, max: 1 },
  ],
});
/* Raubritter Chastener — conjurador de magias elementais + escudos,
 * hp 10000, exp 9500, armor 80, mitigation 3.68, speed 150. */
const RAUB_CHASTENER = Object.assign({}, HUNT_RAUB_BASE, {
  name: "Raubritter Chastener", hp: 10000, exp: 9500,
  armor: 80, defense: 80, mitigation: 3.68, speed: 150, damage: 550,
  looktype: 1920,
  resist: { physical: -20, earth: -12, fire: -6, death: 0, energy: 15,
            holy: 15, ice: 25 },
  skills: [
    { el: "fire",    min: 400, max: 800, int: 5000, ch: 25, radius: 3,
      fx: "fire-area", miss: "fire" },
    { el: "energy",  min: 400, max: 800, int: 5000, ch: 25, radius: 3,
      fx: "energy-area", miss: "energy" },
    { el: "holy",    min: 350, max: 700, int: 4000, ch: 25, range: 7,
      miss: "holy", alvo: 1 },
  ],
  defSkills: [ { n: "shielding", int: 8000, ch: 20 } ],
  voices: { int: 6000, ch: 15, list: [
    { t: "Purification! Sal... vation! Deliver..." },
    { t: "Bow... to the master..." }, { t: "You... will be cleansed." } ] },
  loot: [
    { item: "platinum-coin", chance: 80, max: 10 },
    { item: "small-amethyst", chance: 40, max: 1 },
    { item: "small-ruby", chance: 40, max: 1 },
    { item: "red-gem", chance: 40, max: 1 },
    { item: "magma-monocle", chance: 12, max: 1 },
    { item: "wand-of-cosmic-energy", chance: 12, max: 1 },
    { item: "stag-parchment", chance: 12, max: 1 },
    { item: "silver-poniard", chance: 12, max: 1 },
    { item: "wand-of-starstorm", chance: 12, max: 1 },
    { item: "wooden-spellbook", chance: 12, max: 1 },
    { item: "violet-gem", chance: 6, max: 1 },
    { item: "lightning-robe", chance: 6, max: 1 },
    { item: "shockwave-amulet", chance: 6, max: 1 },
    { item: "ring-of-green-plasma", chance: 6, max: 1 },
    { item: "magma-amulet", chance: 1.5, max: 1 },
    { item: "bottle-of-raubritter-lager", chance: 1.5, max: 1 },
    { item: "crystal-coin", chance: 1.5, max: 149 },
  ],
});
/* Raubritter Marksman — distance fighter oficial, hp 10500, exp 9025,
 * armor 90, mitigation 3.45, speed 170. */
const RAUB_MARKSMAN = Object.assign({}, HUNT_RAUB_BASE, {
  name: "Raubritter Marksman", hp: 10500, exp: 9025,
  armor: 90, defense: 85, mitigation: 3.45, speed: 170, damage: 650,
  looktype: 1889, targetDistance: 4, ranged: 1,
  resist: { physical: -16, earth: -12, fire: -12, death: 0, energy: 12,
            holy: 15, ice: 15 },
  skills: [
    { el: "physical", min: 450, max: 850, int: 1800, ch: 45, range: 7,
      miss: "physical", alvo: 1 },
    { el: "physical", min: 350, max: 700, int: 4000, ch: 30, range: 7,
      radius: 2, miss: "physical" },
  ],
  voices: { int: 6000, ch: 15, list: [
    { t: "This is ours now!" }, { t: "I'll... hunt you... down!" },
    { t: "Gnnnah!!!" } ] },
  loot: [
    { item: "platinum-coin", chance: 80, max: 12 },
    { item: "cuirass-plate", chance: 40, max: 1 },
    { item: "stag-parchment", chance: 12, max: 2 },
    { item: "blue-crystal-shard", chance: 12, max: 1 },
    { item: "violet-crystal-shard", chance: 12, max: 1 },
    { item: "green-crystal-shard", chance: 12, max: 1 },
    { item: "green-gem", chance: 6, max: 1 },
    { item: "blue-gem", chance: 6, max: 1 },
    { item: "terra-mantle", chance: 6, max: 1 },
    { item: "crystalline-arrow", chance: 1.5, max: 20 },
    { item: "ring-of-blue-plasma", chance: 1.5, max: 1 },
    { item: "composite-hornbow", chance: 1.5, max: 1 },
    { item: "violet-gem", chance: 1.5, max: 1 },
  ],
});

const SB_MONSTERS = {
  "raubritter-skirmisher": RAUB_SKIRMISHER,
  "raubritter-chastener": RAUB_CHASTENER,
  "raubritter-marksman": RAUB_MARKSMAN,
};

/* ── Arean Outskirts — hunt 400+ mista (Raubritters + Night Harpy,
 * Isle of Ada 15.20). ── */
const AO_ITEMS = {
  /* Creature product oficial: npcvalue 5.000 (wikitext). */
  "night-harpy-feathers": { n: "night harpy feathers", s: null, t: "loot",
    cid: 52633, w: 7.5, sell: 5000, npcSell: 5000 },
};
/* Gems gigantes — npcvalue oficial (estavam placeholder sell=1). */
const AO_PRICE_FIX = {
  "giant-emerald": 90000, "giant-amethyst": 60000,
  "giant-sapphire": 50000, "giant-topaz": 80000, "giant-ruby": 70000,
};

/* Night Harpy — ficha OFICIAL: hp 14.000, exp 21.000, armor 90,
 * mitigation 3.92, speed 190, Bird/Hard, "attack in flocks and with
 * swift precision" → melee rápido. dmgMods oficiais → resist. */
const NIGHT_HARPY = Object.assign({}, HUNT_RAUB_BASE, {
  name: "Night Harpy", hp: 14000, exp: 21000,
  armor: 90, defense: 85, mitigation: 3.92, speed: 190, damage: 750,
  looktype: 1901,   // ave negra do lote livre 15.20 (estimado)
  resist: { physical: 0, earth: 40, fire: 30, death: -9, energy: 0,
            holy: -9, ice: -12 },
  skills: [
    { el: "physical", min: 450, max: 900, int: 1500, ch: 45, range: 1 },
    { el: "physical", min: 400, max: 800, int: 3500, ch: 30, radius: 2,
      fx: "physical", miss: "physical" },
    { el: "energy",   min: 400, max: 750, int: 5000, ch: 25, range: 7,
      miss: "energy", alvo: 1 },
  ],
  voices: { int: 5000, ch: 15, list: [ { t: "WHEEE!!! WHEEE!!!" } ] },
  loot: [
    { item: "great-mana-potion", chance: 40, max: 12 },
    { item: "strong-mana-potion", chance: 40, max: 12 },
    { item: "great-spirit-potion", chance: 40, max: 8 },
    { item: "night-harpy-feathers", chance: 6, max: 10 },
    { item: "giant-sapphire", chance: 1, max: 1 },
    { item: "giant-topaz", chance: 1, max: 1 },
    { item: "giant-emerald", chance: 1, max: 1 },
    { item: "crystal-coin", chance: 1, max: 100 },
    { item: "giant-ruby", chance: 1, max: 1 },
    { item: "giant-amethyst", chance: 1, max: 1 },
  ],
});
SB_MONSTERS["night-harpy"] = NIGHT_HARPY;

(function registerAreanOutskirts() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in AO_ITEMS) if (!items[slug]) items[slug] = AO_ITEMS[slug];
  for (const slug in AO_PRICE_FIX) {
    const it = items[slug];
    if (!it) continue;
    if (it.sell == null || it.sell <= 1) it.sell = AO_PRICE_FIX[slug];
    if (it.npcSell == null || it.npcSell <= 1) it.npcSell = AO_PRICE_FIX[slug];
  }
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["arean-outskirts"] = {
    name: "Arean Outskirts",
    level: 400, minLevel: 400, cat: "hard",
    pack: 9, packMin: 8, packMax: 10,
    monsters: ["night-harpy", "raubritter-skirmisher",
               "raubritter-chastener", "raubritter-marksman"],
    spawnWeights: { "night-harpy": 20, "raubritter-skirmisher": 20,
                    "raubritter-chastener": 20,
                    "raubritter-marksman": 20 },
    color: "#2a2a3a", scene: "crypt",
    otbm: "arean_outskirts", otbmFloor: 7,
    otbmSpawn: { x: 1020, y: 1018, z: 7 },            // centerroom
    otbmMobBounds: { x: 1015, y: 1014, w: 9, h: 7, z: 7 },  // spawn rect
    avgHp: 11375, avgExp: 12006, avgDamage: 900, avgArmor: 90,
    avgGold: 500, respawn: 1,
  };
})();

/* ── Registro da hunt Stag Bastion ── */
(function registerStagBastion() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in SB_ITEMS) {
    const def = SB_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }
  for (const slug in SB_PRICE_FIX) {
    const it = items[slug];
    if (!it) continue;
    /* Só corrige placeholders/ausências — nunca sobrescreve um preço
     * oficial já registrado (ex.: mercenary-sword 43000). */
    if (it.sell == null || it.sell <= 1) it.sell = SB_PRICE_FIX[slug];
    if (it.npcSell == null || it.npcSell <= 1) it.npcSell = SB_PRICE_FIX[slug];
  }
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA)
    for (const slug in SB_MONSTERS) MONSTERDATA[slug] = SB_MONSTERS[slug];
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in SB_MONSTERS) GAMEDATA.monsters[slug] = SB_MONSTERS[slug];

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["stag-bastion"] = {
    name: "Stag Bastion",
    level: 400, minLevel: 400, cat: "hard",
    pack: 9, packMin: 8, packMax: 10,    // "respawn de 8 a 10"
    monsters: ["raubritter-skirmisher", "raubritter-chastener",
               "raubritter-marksman"],
    spawnWeights: { "raubritter-skirmisher": 20,
                    "raubritter-chastener": 20,
                    "raubritter-marksman": 20 },
    color: "#5a4030", scene: "crypt",
    otbm: "stag_bastion", otbmFloor: 7,
    otbmSpawn: { x: 1020, y: 1024, z: 7 },           // centerroom
    otbmMobBounds: { x: 1017, y: 1020, w: 9, h: 9, z: 7 }, // spawn radius
    avgHp: 10500, avgExp: 9025, avgDamage: 900, avgArmor: 90,
    avgGold: 500, respawn: 1,
  };
})();

/* Tipo base → slug base/forte (para o check "4 do mesmo tipo"). */
const CW_RAUB_TYPES = {
  earth:   { base: "poisoned-raubritter", strong: "enraged-poisoned-raubritter" },
  ice:     { base: "frozen-raubritter",   strong: "enraged-frozen-raubritter" },
  fire:    { base: "raging-raubritter",   strong: "enraged-raging-raubritter" },
  energy:  { base: "energised-raubritter",strong: "enraged-energised-raubritter" },
};
const CW_RAUB_SLUGS = Object.values(CW_RAUB_TYPES).map((t) => t.base);

const CW_MONSTERS = {
  "court-warlock": COURT_WARLOCK,
  "poisoned-raubritter": POISONED_RAUBRITTER,
  "frozen-raubritter": FROZEN_RAUBRITTER,
  "raging-raubritter": RAGING_RAUBRITTER,
  "energised-raubritter": ENERGISED_RAUBRITTER,
  "enraged-poisoned-raubritter": STRONG_POISONED,
  "enraged-frozen-raubritter": STRONG_FROZEN,
  "enraged-raging-raubritter": STRONG_RAGING,
  "enraged-energised-raubritter": STRONG_ENERGISED,
};

/* ── Mecânica do encontro (cliente; espelho de tickCourtWarlock no
 * authoritative_engine.js) ── */
function courtWarlockFight(c) { return !!(c && c.boss && c.boss.id === "court-warlock"); }
function cwFreeCell(c, cx, cy) { return typeof agFreeCell === "function" ? agFreeCell(c, cx, cy) : null; }
function cwMakeMob(c, slug, cx, cy, flags) {
  const def = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters &&
    GAMEDATA.monsters[slug];
  if (!def) return null;
  const cell = cwFreeCell(c, cx, cy); if (!cell) return null;
  const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
    : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
  const hp = Math.max(1, Number(def.hp) || 1);
  const mob = Object.assign({ slug, def, hp, maxHp: hp,
    atkCd: 400 + Math.random() * 1200,
    id: "cw-" + slug + "-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7),
    cx: cell.x, cy: cell.y, x: pos.x, y: pos.y, sx: pos.x, sy: pos.y,
    dir: "w", moving: false, attackAnim: 0,
    speed: def.speed ? .000055 : 0, spawnAt: Date.now() }, flags || {});
  c.mobs = c.mobs || []; c.mobs.unshift(mob);
  c.events = c.events || [];
  c.events.push({ t: "spawn", slug, x: mob.x, y: mob.y, targetId: mob.id, screen: true });
  return mob;
}
function cwTypeOf(m) {
  if (m.cwType) return m.cwType;
  for (const t in CW_RAUB_TYPES)
    if (m.slug === CW_RAUB_TYPES[t].base || m.slug === CW_RAUB_TYPES[t].strong) return t;
  return null;
}
function cwHazardCells(c) {
  const st = c.bo2 || c.cw; if (!st || !st.hazards) return [];
  return st.hazards;
}
function courtWarlockBossInit(c, player) {
  if (!courtWarlockFight(c)) return c;
  const boss = (c.mobs || []).find((m) => m && m.boss);
  if (!boss) return c;
  c.cw = { pendingBoss: boss, phase: 1, wave: 0, transforms: 0,
    raubsKilled: 0, nextWaveAt: Date.now() + 2500,
    nextTeleportAt: Date.now() + CW_TELEPORT_MS, hzAt: 0, hazards: [] };
  c.mobs = c.mobs.filter((m) => m !== boss);
  const bx = Number(boss.cx) || 0, by = Number(boss.cy) || 0;
  for (const [dx, dy] of CW_HAZARD_OFFSETS)
    c.cw.hazards.push(bx + dx + "," + (by + dy));
  if (typeof addLog === "function")
    addLog("info", "Os <b>Raubritters</b> invadem a sala — cuidado com o <b>terreno marcado</b>!");
  return c;
}
function courtWarlockBossTick(c, now) {
  const st = c && c.cw; if (!st || c.ended) return true;
  const mobs = c.mobs || [];
  const p = (c.player && c.player.p) || c.player;
  /* Terreno especial: morte por exposição (cada CW_HAZARD_MS). */
  if (st.phase === 1 && p && p.hp > 0 && now >= st.hzAt &&
      st.hazards.indexOf((Number(c.player.cx) || 0) + "," + (Number(c.player.cy) || 0)) >= 0) {
    st.hzAt = now + CW_HAZARD_MS;
    const dmg = CW_HAZARD_DMG[0] + Math.random() * (CW_HAZARD_DMG[1] - CW_HAZARD_DMG[0]);
    p.hp = Math.max(0, (p.hp || 0) - Math.round(dmg));
    c.events.push({ t: "taken", dmg: Math.round(dmg), x: c.player.x, y: c.player.y,
      targetId: "player", el: "death", fx: "mort-area", screen: true });
  }
  /* Teleporte periódico (oficial): o jogador some e reaparece na sala. */
  if (st.phase === 1 && now >= st.nextTeleportAt) {
    st.nextTeleportAt = now + CW_TELEPORT_MS;
    const cell = cwFreeCell(c, (Number(c.player.cx) || 0) + 3, (Number(c.player.cy) || 0) - 4);
    if (cell && st.hazards.indexOf(cell.x + "," + cell.y) < 0) {
      const pos = typeof cellToScreen === "function" ? cellToScreen(cell.x, cell.y)
        : { x: (cell.x + .5) / (c.gridW || 30), y: (cell.y + .5) / (c.gridH || 30) };
      c.player.cx = cell.x; c.player.cy = cell.y;
      c.player.x = pos.x; c.player.y = pos.y;
      c.player.sx = pos.x; c.player.sy = pos.y;
      c.events.push({ t: "effect", x: pos.x, y: pos.y, screen: true, fx: "teleport" });
      if (typeof addLog === "function") addLog("death", "O Warlock <b>teleporta você</b> pela sala!");
    }
  }
  if (st.phase === 1) {
    /* Waves: raubritters spawnam NA posição do jogador (oficial). */
    if (now >= st.nextWaveAt) {
      st.nextWaveAt = now + CW_WAVE_MS;
      st.wave++;
      const keys = Object.keys(CW_RAUB_TYPES);
      for (let i = 0; i < CW_WAVE_SIZE; i++) {
        const t = keys[Math.floor(Math.random() * keys.length)];
        const m = cwMakeMob(c, CW_RAUB_TYPES[t].base,
          (Number(c.player.cx) || 0) + (i % 2 ? 1 : -1),
          (Number(c.player.cy) || 0) + (i === 2 ? 1 : 0));
        if (m) m.cwType = t;
      }
    }
    /* 4 do mesmo tipo vivos → transformam nas formas fortes. */
    const alive = {};
    for (const m of mobs) {
      if (!(m.hp > 0)) continue;
      const t = cwTypeOf(m); if (!t || m.cwStrong) continue;
      (alive[t] = alive[t] || []).push(m);
    }
    for (const t in alive) {
      if (alive[t].length < CW_TRANSFORM_AT) continue;
      for (const m of alive[t]) {
        const to = CW_RAUB_TYPES[t].strong;
        const nd = GAMEDATA.monsters[to]; if (!nd) continue;
        m.slug = to; m.def = nd; m.cwStrong = true;
        m.hp = m.maxHp = Math.max(1, Number(nd.hp) || 1);
        c.events.push({ t: "effect", x: m.x, y: m.y, screen: true, fx: "levelup" });
      }
      st.transforms++;
      if (typeof addLog === "function")
        addLog("death", "Os Raubritters <b>mudam de forma</b> — versões enraivecidas!");
    }
    /* Conta kills de raubritters (pra telemetria) e fim da fase 1. */
    if (st.wave >= CW_WAVES) {
      st.phase = 2;
      st.hazards = [];                       // terreno especial some (oficial)
      const bx = Number(c.boss && c.boss.cx) || 0, by = Number(c.boss && c.boss.cy) || 0;
      const falc = ["falcon-knight", "falcon-paladin"];
      for (let i = 0; i < CW_FALCON_COUNT; i++)
        cwMakeMob(c, falc[i % 2], bx - 4 + (i % 4) * 2, by + 2 + Math.floor(i / 4) * 3,
          { cwFalcon: true });
      if (typeof addLog === "function")
        addLog("info", "<b>Falcon Knights e Paladins</b> enchem a sala!");
    }
  } else if (st.phase === 2) {
    if (!mobs.some((m) => m.cwFalcon && m.hp > 0)) {
      st.phase = 3;
      /* Boss entra com hp proporcional aos transforms (design; oficial:
       * "spawns with less HP, depending on how the fight went"). */
      const boss = st.pendingBoss; st.pendingBoss = null;
      const bonus = st.transforms * CW_BOSS_HP_PER_TRANSFORM;
      boss.hp = boss.maxHp = (Number(boss.maxHp) || 120000) + bonus;
      const cell = cwFreeCell(c, Number(boss.cx) || 0, Number(boss.cy) || 0);
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
        addLog("death", "<b>COURT WARLOCK</b> — \"DO I REALLY NEED TO DO EVERYTHING MYSELF!\"");
    }
  }
  return true;
}
function courtWarlockBossCleanup(c) { if (c && c.cw) delete c.cw; }

/* ── Registro (cliente + sandbox do servidor) ── */
(function registerCourtWarlock() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in CW_ITEMS) {
    const def = CW_ITEMS[slug];
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
    for (const slug in CW_MONSTERS) MONSTERDATA[slug] = CW_MONSTERS[slug];
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in CW_MONSTERS) GAMEDATA.monsters[slug] = CW_MONSTERS[slug];

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["court-warlock-room"] = {
    name: "Court Warlock's Room",
    hidden: true, level: 400, minLevel: 400,
    monsters: ["court-warlock"],
    color: "#3a2a4a", scene: "crypt",
    otbm: CW_ROOM.otbm, otbmFloor: 7,
    otbmSpawn: CW_ROOM.spawn,
    otbmMobBounds: { x: CW_ROOM.boss.x, y: CW_ROOM.boss.y, w: 1, h: 1, z: 7 },
    avgHp: COURT_WARLOCK.hp, avgExp: COURT_WARLOCK.exp,
    avgDamage: COURT_WARLOCK.damage, avgArmor: COURT_WARLOCK.armor,
    avgGold: 500, respawn: 1, pack: 1, cat: "boss-room",
  };

  if (typeof BOSS_DEFS !== "undefined") {
    BOSS_DEFS["court-warlock"] = {
      id: "court-warlock", name: "Court Warlock",
      title: CW_QUEST_TITLE + " — Boss final",
      hunt: "court-warlock-room", baseMonster: "court-warlock",
      sprite: "court-warlock",
      hp: COURT_WARLOCK.hp, exp: COURT_WARLOCK.exp,
      damage: COURT_WARLOCK.damage, armor: COURT_WARLOCK.armor,
      defense: COURT_WARLOCK.defense,
      requirement: { level: 400, mission: "arean-outskirts",
        access: "court-warlock", enforced: true,
        text: "Complete a Missão 2 da Order of the Stag (50 Night Harpies nas Arean Outskirts)" },
      cooldown: CW_COOLDOWN_MS,
    };
    if (typeof BOSS_MODAL_SECTIONS !== "undefined") {
      const sect = BOSS_MODAL_SECTIONS.find((s) => s.title === "BOSSES 400+");
      if (sect && sect.ids.indexOf("court-warlock") < 0)
        sect.ids.push("court-warlock");
    }
  }
})();

/* ═══ The Order of the Stag Quest (350+) — 3 missões ═══
 * M1: 500 kills na Stag Bastion → The Mariner's Compass from the
 *     Antoinette (extra slot, arm 3; itemid oficial 52759, npcvalue 0 →
 *     sem comprador → sell 0).
 * M2: 50 Night Harpies (Arean Outskirts) → acesso ao Court Warlock.
 * M3: derrotar o Court Warlock → Royal Bounacean Advisor Outfit
 *     (addons 1+2; looktypes oficiais m=1436/f=1437).
 * O progresso das missões vive no registro genérico de hunts
 * (p.missions[huntId].progress) — o engine incrementa .kills e
 * .progress[slug] em cada kill do hunt ativo. */
const STAG_QUEST_ID = "order-of-the-stag-quest";
const STAG_COMPASS = "mariners-compass-from-the-antoinette";
const STAG_OUTFIT = { base: "royal-bounacean-advisor", addons: 3 };
const STAG_QUEST_ITEMS = {
  [STAG_COMPASS]: { n: "the mariner's compass from the antoinette",
    s: "extra", t: "armor", cid: 52759, w: 30, arm: 3,
    sell: 0, npcSell: 0 },
};
const STAG_MISSION_DEFS = {
  "stag-bastion": {
    title: "Missão: Order of the Stag — Stag Bastion",
    tasks: [{
      counter: "kills", target: 500,
      label: "Eliminar 500 monstros na Stag Bastion",
    }],
    completeReward: { items: [{ slug: STAG_COMPASS, count: 1 }] },
  },
  "arean-outskirts": {
    title: "Missão: Order of the Stag — Night Harpies",
    tasks: [{
      monster: "night-harpy", target: 50,
      label: "Eliminar 50 Night Harpies",
    }],
    completeReward: { bossAccess: "court-warlock", bossName: "Court Warlock" },
  },
};

function stagMissionKills(p, huntId, slug) {
  const st = p && p.missions && p.missions[huntId];
  const prog = (st && st.progress) || {};
  if (slug === "kills" && Number(prog.kills) > 0) return Number(prog.kills);
  if (slug !== "kills" && Number(prog[slug]) > 0) return Number(prog[slug]);
  if (slug !== "kills") return 0;
  let sum = 0;
  for (const v of Object.values(prog)) sum += Number(v) || 0;
  return sum;
}

function stagQuestState(p) {
  const bosses = (p && p.bosses) || {};
  const cwDead = Number(bosses["court-warlock"] && bosses["court-warlock"].kills) > 0;
  const m1k = stagMissionKills(p, "stag-bastion", "kills");
  const m2k = stagMissionKills(p, "arean-outskirts", "night-harpy");
  const done = (p && p.missionsDone) || {};
  const m2done = m2k >= 50 ||
    !!(p && p.bossAccess && p.bossAccess["court-warlock"]) ||
    !!(typeof isMissionComplete === "function" &&
       isMissionComplete(p, "arean-outskirts"));
  return {
    reqLevel: (p && Number(p.level)) >= 350,
    m1: { done: m1k >= 500, kills: Math.min(m1k, 500), target: 500 },
    m2: { done: m2done, kills: Math.min(m2k, 50), target: 50 },
    m3: { done: cwDead, kills: cwDead ? 1 : 0, target: 1 },
    outfitClaimed: !!done["order-of-stag:outfit"],
    complete: cwDead,
  };
}

function stagClaim(p, key, value) {
  p.missionsDone = p.missionsDone || {};
  p.missionsDone["order-of-stag:" + key] = value === undefined ? true : value;
  if (typeof syncMissionsToAccount === "function") syncMissionsToAccount(p);
}

function stagGrantOutfit(p) {
  if (typeof ensureWardrobe === "function") ensureWardrobe(p);
  p.wardrobe = p.wardrobe || {};
  p.wardrobe.outfits = p.wardrobe.outfits || {};
  // 2 = addon 1 + addon 2 (ownedAddonMask: count>=2 → mask 3).
  p.wardrobe.outfits["royal-bounacean-advisor-m"] = 2;
  p.wardrobe.outfits["royal-bounacean-advisor-f"] = 2;
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    if (acc) {
      acc.cosmetics = acc.cosmetics || {};
      acc.cosmetics.outfits = acc.cosmetics.outfits || {};
      acc.cosmetics.outfits["royal-bounacean-advisor"] = 2;
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    }
  } catch (e) { /* offline */ }
}

function renderStagQuestDetail(q, ui) {
  if (typeof mbStopRoulettes === "function") mbStopRoulettes();
  const p = G.p;
  if (typeof pullAccountMissions === "function") pullAccountMissions(p);
  let st = stagQuestState(p);
  /* Missão 3 concluída → Royal Bounacean Advisor (addons 1+2),
   * automaticamente. */
  if (p && st.m3.done && !st.outfitClaimed) {
    stagGrantOutfit(p);
    stagClaim(p, "outfit");
    if (typeof addLog === "function")
      addLog("level", "The Order of the Stag: recebeu a outfit <b>Royal Bounacean Advisor</b> (addon 1+2)!");
    if (typeof toast === "function")
      toast("Recompensa: Royal Bounacean Advisor Outfit!", "level");
  }
  st = stagQuestState(p);
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
  const compass = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[STAG_COMPASS]) || {};
  const compassIcon = typeof mbItemIcon === "function" ? mbItemIcon(STAG_COMPASS, 26) : "";
  const outfitPrev = typeof questOutfitPreviewHtml === "function"
    ? questOutfitPreviewHtml(STAG_OUTFIT, 56) : "";

  ui.body.innerHTML = `<div class="panel-title">${q.name} — Level ${q.level}+<span class="spacer"></span><button class="sm" id="boss-quest-close">Fechar</button></div>
    <div class="panel-body quest-detail-body">
      <p class="tiny dim" style="margin:4px 0 10px">${q.description || ""}</p>
      ${reqRow("Nível 350+", st.reqLevel)}
      ${mission(1, "Stag Bastion", st.m1,
        `${compassIcon} ${compass.n || STAG_COMPASS} — extra slot, arm ${compass.arm || 3}`,
        ["raubritter-skirmisher", "raubritter-chastener", "raubritter-marksman"])}
      ${mission(2, "Night Harpies (Arean Outskirts)", st.m2,
        "Acesso ao boss Court Warlock", ["night-harpy"])}
      ${mission(3, "Court Warlock", st.m3,
        "Royal Bounacean Advisor Outfit (addon 1 + 2)", ["court-warlock"])}
      ${outfitPrev ? `<div class="mb-outfit-granted">${outfitPrev}${st.outfitClaimed ? `<span class="tiny" style="color:#9ce84a">✓ Resgatada — Royal Bounacean Advisor (addon 1+2)</span>` : ""}</div>` : ""}
    </div>`;
  const close = ui.body.querySelector("#boss-quest-close");
  if (close) close.addEventListener("click", () => { if (ui && ui.close) ui.close(); });
}

(function registerStagQuest() {
  if (typeof GAMEDATA !== "undefined") {
    const items = GAMEDATA.items || (GAMEDATA.items = {});
    for (const slug in STAG_QUEST_ITEMS) {
      const def = STAG_QUEST_ITEMS[slug];
      if (!items[slug]) items[slug] = def;
      else {
        if (def.sell != null) items[slug].sell = def.sell;
        if (def.npcSell != null) items[slug].npcSell = def.npcSell;
        if (def.arm != null && items[slug].arm == null) items[slug].arm = def.arm;
        if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
        if (def.w != null && items[slug].w == null) items[slug].w = def.w;
        if (def.n && !items[slug].n) items[slug].n = def.n;
        if (def.s && !items[slug].s) items[slug].s = def.s;
      }
    }
  }
  if (typeof MISSION_DEFS !== "undefined")
    Object.assign(MISSION_DEFS, STAG_MISSION_DEFS);
  if (typeof QUEST_DEFS !== "undefined") {
    QUEST_DEFS[STAG_QUEST_ID] = {
      id: STAG_QUEST_ID,
      name: "The Order of the Stag Quest",
      level: 350,
      questType: "boss",
      worldQuest: true,
      playable: false,
      icon: "small-treasure-chest",
      bossSprite: "court-warlock",
      description: "A quest que coroa a Order of the Stag: prove seu valor na Stag Bastion eliminando 500 Raubritters para receber o Mariner's Compass da Antoinette (extra slot, +3 armadura), cace 50 Night Harpies nas Arean Outskirts para ganhar acesso ao Court Warlock e, ao derrotá-lo, vista-se como Royal Bounacean Advisor (addons 1 e 2).",
      renderDetail: renderStagQuestDetail,
      rewardReady: (pp) => {
        const st = stagQuestState(pp);
        return st.m3.done && !st.outfitClaimed;
      },
    };
  }
})();

const CW_DATA = {
  CW_ROOM, CW_ITEMS, CW_MONSTERS, CW_RAUB_TYPES, CW_RAUB_SLUGS,
  STAG_QUEST_ID, STAG_COMPASS, STAG_OUTFIT, STAG_QUEST_ITEMS,
  STAG_MISSION_DEFS, stagQuestState, stagMissionKills,
  renderStagQuestDetail, stagGrantOutfit, stagClaim,
  CW_HAZARD_OFFSETS, CW_HAZARD_DMG, CW_HAZARD_MS, CW_WAVE_MS,
  CW_WAVE_SIZE, CW_WAVES, CW_TRANSFORM_AT, CW_TELEPORT_MS,
  CW_FALCON_COUNT, CW_BOSS_HP_PER_TRANSFORM,
  SB_ITEMS, SB_PRICE_FIX, SB_MONSTERS,
  monsterSlugs: Object.keys(CW_MONSTERS).concat(Object.keys(SB_MONSTERS)),
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug of Object.keys(CW_MONSTERS))
      monsters[slug] = CW_MONSTERS[slug];
    for (const slug of Object.keys(SB_MONSTERS))
      monsters[slug] = SB_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = CW_DATA;
