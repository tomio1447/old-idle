/* norcferatus-fortress.js — HUNT Norcferatus Fortress (nível 400+) +
 * BOSS Vladrukh + Bloody Tusks Quest (update 15.10). Mapa:
 * game/maps/norcferatus_fortress.otbm (25×25, z=7; bounds
 * 1009,1015–1033,1039).
 *
 * Coordenadas RME informadas:
 *   centerroom    {1021,1028,7} — caminhável, vira o spawn do jogador
 *   respawnradius {1015,1024,7} → {1027,1031,7} (13×8; 94 sqm
 *                 caminháveis pós-import das flags, todos conectados)
 *   Sala sul (câmara própria, 80 sqm conectados, local x10–24/y19–24)
 *   vira a bossroom do Vladrukh:
 *     center      {1026,1037,7} (centro geométrico caminhável)
 *     bossspawn   {1027,1036,7} (centro da câmara, com espaço)
 *     playerspawn {1023,1039,7} (canto sudoeste, ~5 sqm do boss)
 *
 * Mecânica própria: respawn das ondas em 8s (hunt.respawnMs) e, a cada
 * onda, 3% de chance de nascer 1 Varg EXTRA além do pack
 * (hunt.extraSpawn) — implementado no cliente (combat.spawnWave) e na
 * autoridade (spawnHuntWave) para manter paridade.
 *
 * As 7 criaturas são todas do update 15.10 e não existem no dump
 * Canary. Fichas oficiais (TibiaWiki BR / Fandom):
 *   Dworc Shadowstalker  — 8.900 hp, 8.930 exp (valor pedido; wiki
 *     rev. atual 7.680), armor 64, mit 2.99, race_id 2667, Undead Hard.
 *   Gloom Maw            — 8.700 hp, 8.770 exp (pedido; wiki 7.550),
 *     armor 68, mit 2.81, speed 190, race_id 2669, Undead Hard.
 *   Norcferatu Heartless — 5.700 hp, 5.900 exp, armor 64, mit 2.44,
 *     race_id 2664, Undead Hard.
 *   Norcferatu Nightweaver — 6.100 hp, 6.370 exp, armor 60, mit 2.81,
 *     race_id 2666, Undead Hard.
 *   Orclops Bloodbreaker — 10.300 hp, 10.250 exp (pedido; wiki 8.820),
 *     armor 68, mit 3.26, speed 130, race_id 2668, Undead Hard;
 *     maxdmg oficial physical 700 / life drain 1.200.
 *   Varg                 — 5.400 hp, 5.630 exp, armor 63, mit 2.67,
 *     race_id 2665, Humanoid Hard; imune a paralisia, vê invisível.
 *   Vladrukh             — Archfoe, 390.000 hp (wiki BR), 450.000 exp,
 *     cooldown 20h. Resistências oficiais não publicadas (infobox
 *     "100%?") — fica neutro.
 *
 * Sprites: 6 looktypes do DAT convertido por pixel-diff/comparação
 * visual contra os GIFs oficiais (nightweaver 1851 e heartless 1852
 * exatos; orclops 1854, varg 1855, vladrukh 1862).
 * dworc-shadowstalker e gloom-maw NÃO existem no DAT convertido —
 * sheets montadas dos GIFs oficiais, 8 quadros replicados nas 4
 * direções (padrão bramble-wyrmling/sir-leonard). O dworc usa
 * looktype 215 (Dworc Fleshhunter — visual quase idêntico) como
 * fallback; o 1850 inicialmente anotado renderiza outra criatura.
 *
 * Bloody Tusks Quest: M1 = 5× Varg (MISSION_DEFS) → acesso ao
 * Vladrukh (requirement.mission enforced). M2 = derrotar o Vladrukh →
 * montaria Gloom Maw. ATENÇÃO: o reward oficial da quest é a
 * Gloom Maw mount — o pedido dizia "montaria do Varg", mas não existe
 * Varg mount; o catálogo já trazia "gloom-maw" (looktype 1866,
 * mountId 236) com requirement "vladrukh" e o servidor já concede a
 * montaria automaticamente em bosses.vladrukh.kills > 0. A quest
 * concede a mesma montaria no claim para o feedback imediato.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa; o
 * registro dos monstros no MONSTERS é via module.exports.
 */
"use strict";

/* Itens novos (cids do appearances.dat 15.x; ícones 32×32 em
 * game/assets/item/). Preços NPC oficiais (TibiaWiki): creature
 * products do update vendem ao Yasir; greater-garlic-necklace vende
 * ao Haroun (10k).
 *   - tiny-bat-coffin: 3.650 gp (pedido do jogador — sem comprador
 *     oficial no wiki; valor fixado aqui).
 *   - greater-proficiency-catalyst: nenhum NPC compra → sell 0.
 *   - war-drum: 1.000 gp (pedido do jogador — sem comprador oficial;
 *     era referenciado em loot antigo do Canary sem definição/ícone —
 *     registrado aqui).
 *   - bast-skirt: já existia no catálogo sem preço — sell 750
 *     (Brengus) via merge abaixo. */
const NORCFERATUS_ITEMS = {
  "blood-amulet":              { n: "blood amulet",              s: null, t: "loot", cid: 51473, w: 0.2,  sell: 1230,   npcSell: 1230 },
  "bone-rattle":               { n: "bone rattle",               s: null, t: "loot", cid: 51478, w: 0.2,  sell: 790,    npcSell: 790 },
  "norcferatu-talisman":       { n: "norcferatu talisman",       s: null, t: "loot", cid: 51714, w: 0.2,  sell: 670,    npcSell: 670 },
  "chain-leash":               { n: "chain leash",               s: null, t: "loot", cid: 51472, w: 0.2,  sell: 970,    npcSell: 970 },
  "piece-of-frozen-night":     { n: "piece of frozen night",     s: null, t: "loot", cid: 51474, w: 0.2,  sell: 680,    npcSell: 680 },
  "tiny-bat-coffin":           { n: "tiny bat coffin",           s: null, t: "loot", cid: 51471, w: 6.3,  sell: 3650,   npcSell: 3650 },
  "heart-amphora":             { n: "heart amphora",             s: null, t: "loot", cid: 51484, w: 0.2,  sell: 930,    npcSell: 930 },
  "pot-of-orcish-warpaint":    { n: "pot of orcish warpaint",    s: null, t: "loot", cid: 51476, w: 0.2,  sell: 1150,   npcSell: 1150 },
  "spiked-gorget":             { n: "spiked gorget",             s: null, t: "loot", cid: 51486, w: 0.2,  sell: 850,    npcSell: 850 },
  "greater-garlic-necklace":   { n: "greater garlic necklace",   s: null, t: "loot", cid: 51275, w: 6.3,  sell: 10000,  npcSell: 10000 },
  "blood-hood":                { n: "blood hood",                s: null, t: "loot", cid: 51480, w: 0.2,  sell: 1550,   npcSell: 1550 },
  "spiked-bracers":            { n: "spiked bracers",            s: null, t: "loot", cid: 51479, w: 0.2,  sell: 1360,   npcSell: 1360 },
  "orcish-toothbrush":         { n: "orcish toothbrush",         s: null, t: "loot", cid: 51477, w: 0.2,  sell: 750,    npcSell: 750 },
  "bone-fibula":               { n: "bone fibula",               s: null, t: "loot", cid: 51485, w: 0.2,  sell: 580,    npcSell: 580 },
  "bloodshot-giant-eye":       { n: "bloodshot giant eye",       s: null, t: "loot", cid: 51482, w: 0.2,  sell: 1820,   npcSell: 1820 },
  "ritual-bone-knife":         { n: "ritual bone knife",         s: null, t: "loot", cid: 51475, w: 0.2,  sell: 820,    npcSell: 820 },
  "greater-proficiency-catalyst": { n: "greater proficiency catalyst", s: null, t: "loot", cid: 51589, w: 7.5,  sell: 0,      npcSell: 0 },
  "blood-sceptre":             { n: "blood sceptre",             s: null, t: "loot", cid: 51481, w: 0.2,  sell: 178000, npcSell: 178000 },
  "blood-crown":               { n: "blood crown",               s: null, t: "loot", cid: 51483, w: 0.2,  sell: 116000, npcSell: 116000 },
  "war-drum":                  { n: "war drum",                  s: null, t: "loot", cid: 2966,  w: 30.0, sell: 1000,   npcSell: 1000 },
  "bone-toothpick":            { n: "bone toothpick",            s: null, t: "loot", cid: 24380, w: 20.0, sell: 150,    npcSell: 150 },
  "bast-skirt":                { n: "bast skirt",                s: "legs", t: "armor", cid: 3560, w: 3.5, sell: 750,   npcSell: 750 },
};

const NORCFERATUS_BEST = { classe: "Undead", toKill: 2500, u1: 100,
  u2: 1000, charm: 50, stars: 4, locais: "Norcferatus Fortress." };

const DWORC_SHADOWSTALKER = {
  name: "Dworc Shadowstalker",
  hp: 8900, exp: 8930,
  speed: 200, armor: 64, defense: 60,
  damage: 560, element: "physical", attackSpeed: 2000, mitigation: 2.99,
  resist: { physical: -5, earth: -5, fire: 5, death: 40, energy: 5, ice: 5 },
  skills: [
    { el: "death", min: 250, max: 420, int: 2500, ch: 30, range: 7,
      miss: "sudden-death", alvo: 1 },
    { el: "physical", min: 200, max: 380, int: 2000, ch: 25, range: 1 },
  ],
  /* Sem looktype oficial no DAT convertido (1850 renderiza outra
   * criatura) — a arte real vem da sheet montada do GIF; 215 é o
   * Dworc Fleshhunter, visual quase idêntico, como fallback. */
  looktype: 215, race: "blood", raceId: 2667, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 23, item: "platinum-coin" },
    { chance: 10, max: 1, item: "blood-amulet" },
    { chance: 5, max: 3, item: "small-emerald" },
    { chance: 5, max: 3, item: "small-sapphire" },
    { chance: 5, max: 3, item: "small-ruby" },
    { chance: 5, max: 1, item: "poison-dagger" },
    { chance: 5, max: 1, item: "vampire-teeth" },
    { chance: 5, max: 1, item: "green-crystal-shard" },
    { chance: 5, max: 1, item: "bone-rattle" },
    { chance: 1.5, max: 1, item: "stone-skin-amulet" },
    { chance: 1.5, max: 1, item: "tribal-mask" },
    { chance: 1.5, max: 1, item: "norcferatu-talisman" },
    { chance: 0.5, max: 1, item: "ripper-lance" },
  ],
  best: Object.assign({}, NORCFERATUS_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const GLOOM_MAW = {
  name: "Gloom Maw",
  hp: 8700, exp: 8770,
  speed: 190, armor: 68, defense: 62,
  damage: 540, element: "physical", attackSpeed: 2000, mitigation: 2.81,
  resist: { earth: 10, fire: 5, death: 25, energy: 10, holy: 5 },
  skills: [
    { el: "earth", min: 220, max: 400, int: 2500, ch: 30, radius: 3,
      fx: "poison-area", miss: "poison" },
    { el: "physical", min: 200, max: 360, int: 2000, ch: 25, range: 1 },
  ],
  /* Sem looktype oficial no DAT convertido — a arte real vem da sheet
   * montada do GIF. */
  looktype: 1866, race: "blood", raceId: 2669, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 26, item: "platinum-coin" },
    { chance: 10, max: 1, item: "black-pearl" },
    { chance: 10, max: 2, item: "onyx-chip" },
    { chance: 10, max: 1, item: "chain-leash" },
    { chance: 10, max: 1, item: "piece-of-frozen-night" },
    { chance: 5, max: 1, item: "red-gem" },
    { chance: 5, max: 1, item: "black-shield" },
    { chance: 5, max: 2, item: "bat-wing" },
    { chance: 1.5, max: 1, item: "stone-skin-amulet" },
    { chance: 1.5, max: 1, item: "batwing-hat" },
    { chance: 1.5, max: 1, item: "tiny-bat-coffin" },
    { chance: 1.5, max: 1, item: "norcferatu-talisman" },
  ],
  best: Object.assign({}, NORCFERATUS_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const NORCFERATU_HEARTLESS = {
  name: "Norcferatu Heartless",
  hp: 5700, exp: 5900,
  speed: 190, armor: 64, defense: 55,
  damage: 430, element: "physical", attackSpeed: 2000, mitigation: 2.44,
  resist: { physical: -10, earth: 10, death: 30, energy: -5, holy: 5 },
  skills: [
    { el: "death", min: 180, max: 340, int: 2500, ch: 30, radius: 3,
      fx: "mort-area", miss: "sudden-death" },
    { el: "physical", min: 150, max: 300, int: 2000, ch: 25, range: 1 },
  ],
  looktype: 1852, race: "blood", raceId: 2664, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 15, item: "platinum-coin" },
    { chance: 10, max: 1, item: "green-crystal-splinter" },
    { chance: 10, max: 1, item: "heart-amphora" },
    { chance: 5, max: 1, item: "vampire-teeth" },
    { chance: 5, max: 1, item: "brown-crystal-splinter" },
    { chance: 5, max: 1, item: "blue-crystal-splinter" },
    { chance: 5, max: 1, item: "pot-of-orcish-warpaint" },
    { chance: 5, max: 1, item: "spiked-gorget" },
    { chance: 1.5, max: 1, item: "war-axe" },
    { chance: 1.5, max: 1, item: "chaos-mace" },
    { chance: 1.5, max: 1, item: "greater-garlic-necklace" },
    { chance: 1.5, max: 1, item: "norcferatu-talisman" },
    { chance: 0.5, max: 1, item: "vampire-shield" },
  ],
  best: Object.assign({}, NORCFERATUS_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const NORCFERATU_NIGHTWEAVER = {
  name: "Norcferatu Nightweaver",
  hp: 6100, exp: 6370,
  speed: 170, armor: 60, defense: 55,
  damage: 470, element: "death", attackSpeed: 2000, mitigation: 2.81,
  resist: { earth: 5, death: 25, energy: -10, holy: -5, ice: 10 },
  skills: [
    { el: "death", min: 200, max: 360, int: 2500, ch: 30, range: 7,
      miss: "sudden-death", alvo: 1 },
    { el: "energy", min: 150, max: 300, int: 3000, ch: 20, range: 7,
      miss: "energy", alvo: 1 },
  ],
  looktype: 1851, race: "blood", raceId: 2666, targetDistance: 5,
  ranged: 1, staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 14, item: "platinum-coin" },
    { chance: 10, max: 2, item: "strong-mana-potion" },
    { chance: 10, max: 1, item: "piece-of-frozen-night" },
    { chance: 10, max: 1, item: "blood-hood" },
    { chance: 5, max: 1, item: "magma-amulet" },
    { chance: 5, max: 2, item: "rainbow-quartz" },
    { chance: 5, max: 1, item: "spiked-bracers" },
    { chance: 1.5, max: 1, item: "death-ring" },
    { chance: 1.5, max: 1, item: "wand-of-defiance" },
    { chance: 1.5, max: 1, item: "greater-garlic-necklace" },
    { chance: 1.5, max: 1, item: "norcferatu-talisman" },
  ],
  best: Object.assign({}, NORCFERATUS_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const ORCLOPS_BLOODBREAKER = {
  name: "Orclops Bloodbreaker",
  hp: 10300, exp: 10250,
  speed: 130, armor: 68, defense: 65,
  damage: 640, element: "physical", attackSpeed: 2000, mitigation: 3.26,
  resist: { physical: -5, fire: 10, death: 30, ice: 5 },
  /* maxdmg oficial: physical 700 / life drain 1.200. */
  skills: [
    { el: "lifedrain", min: 600, max: 1200, int: 4000, ch: 30, range: 1 },
    { el: "physical", min: 400, max: 700, int: 2000, ch: 30, range: 1 },
    { el: "physical", min: 250, max: 450, int: 3000, ch: 20, radius: 2,
      fx: "ground-shaker" },
  ],
  looktype: 1854, race: "blood", raceId: 2668, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 30, item: "platinum-coin" },
    { chance: 10, max: 1, item: "orcish-axe" },
    { chance: 10, max: 1, item: "orcish-toothbrush" },
    { chance: 10, max: 1, item: "bone-fibula" },
    { chance: 5, max: 1, item: "green-gem" },
    { chance: 5, max: 1, item: "vampire-teeth" },
    { chance: 5, max: 1, item: "green-crystal-shard" },
    { chance: 5, max: 1, item: "bone-toothpick" },
    { chance: 5, max: 1, item: "bloodshot-giant-eye" },
    { chance: 1.5, max: 1, item: "war-drum" },
    { chance: 1.5, max: 1, item: "stone-skin-amulet" },
    { chance: 1.5, max: 1, item: "berserk-potion" },
    { chance: 1.5, max: 1, item: "norcferatu-talisman" },
    { chance: 0.5, max: 1, item: "bast-skirt" },
  ],
  best: Object.assign({}, NORCFERATUS_BEST, { ocor: 0 }),
  grupo: "undeads",
};

const VARG = {
  name: "Varg",
  hp: 5400, exp: 5630,
  speed: 190, armor: 63, defense: 55,
  damage: 420, element: "physical", attackSpeed: 2000, mitigation: 2.67,
  resist: { physical: -5, fire: 5, death: 25, energy: -10, holy: -5, ice: 5 },
  skills: [
    { el: "death", min: 150, max: 300, int: 2500, ch: 25, range: 7,
      miss: "sudden-death", alvo: 1 },
    { el: "physical", min: 150, max: 280, int: 2000, ch: 25, range: 1 },
  ],
  looktype: 1855, race: "blood", raceId: 2665, targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 22, item: "platinum-coin" },
    { chance: 10, max: 1, item: "ritual-bone-knife" },
    { chance: 10, max: 3, item: "onyx-arrow" },
    { chance: 10, max: 1, item: "giant-shimmering-pearl" },
    { chance: 10, max: 2, item: "bat-wing" },
    { chance: 10, max: 1, item: "vampire-teeth" },
    { chance: 10, max: 3, item: "onyx-chip" },
    { chance: 1.5, max: 1, item: "norcferatu-talisman" },
    { chance: 1.5, max: 1, item: "batwing-hat" },
  ],
  best: { classe: "Humanoid", toKill: 2500, u1: 100, u2: 1000,
    charm: 50, stars: 4, ocor: 0, locais: "Norcferatus Fortress." },
  grupo: "humanoids",
};

const VLADRUKH = {
  name: "Vladrukh",
  hp: 390000, exp: 450000,
  speed: 200, armor: 100, defense: 100,
  damage: 1150, element: "physical", attackSpeed: 2000, mitigation: 2.5,
  /* Resistências oficiais não publicadas (infobox da wiki marca todas
   * como "100%?") — o boss fica neutro. */
  skills: [
    { el: "physical", min: 800, max: 1400, int: 2000, ch: 40, range: 1 },
    { el: "death", min: 600, max: 1100, int: 4000, ch: 35, radius: 4,
      fx: "mort-area", miss: "sudden-death" },
    { el: "lifedrain", min: 500, max: 900, int: 5000, ch: 30, radius: 3,
      fx: "magic-red" },
    { el: "death", min: 700, max: 1200, int: 6000, ch: 30, range: 7,
      miss: "sudden-death", alvo: 1 },
  ],
  looktype: 1862, race: "blood", targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [
    { chance: 100, max: 3, item: "crystal-coin" },
    { chance: 100, max: 199, item: "platinum-coin" },
    { chance: 10, max: 1, item: "greater-proficiency-catalyst" },
    { chance: 10, max: 1, item: "proficiency-catalyst" },
    { chance: 10, max: 1, item: "blood-preservation" },
    { chance: 10, max: 5, item: "supreme-health-potion" },
    { chance: 10, max: 40, item: "ultimate-mana-potion" },
    { chance: 10, max: 6, item: "great-mana-potion" },
    { chance: 10, max: 20, item: "strong-mana-potion" },
    { chance: 10, max: 7, item: "ultimate-spirit-potion" },
    { chance: 10, max: 15, item: "great-spirit-potion" },
    { chance: 5, max: 1, item: "skull-belt" },
    { chance: 5, max: 2, item: "red-gem" },
    { chance: 5, max: 1, item: "giant-emerald" },
    { chance: 5, max: 2, item: "yellow-gem" },
    { chance: 5, max: 1, item: "stone-skin-amulet" },
    { chance: 1.5, max: 1, item: "skull-helmet" },
    { chance: 1.5, max: 1, item: "epee" },
    { chance: 1.5, max: 1, item: "vampire-teeth" },
    { chance: 1.5, max: 1, item: "skull-staff" },
    { chance: 1.5, max: 1, item: "death-ring" },
    /* Raros oficiais (wiki): Blood Sceptre + Blood Crown. */
    { chance: 1.5, max: 1, item: "blood-sceptre" },
    { chance: 1.5, max: 1, item: "blood-crown" },
    /* Muito raros oficiais: as 10 peças do set Norcferatu (itens de
     * equipamento já catalogados no weapondata, ids 51260-51269). */
    { chance: 0.5, max: 1, item: "norcferatu-bloodhide" },
    { chance: 0.5, max: 1, item: "norcferatu-bloodstrider" },
    { chance: 0.5, max: 1, item: "norcferatu-bonecloak" },
    { chance: 0.5, max: 1, item: "norcferatu-bonehood" },
    { chance: 0.5, max: 1, item: "norcferatu-goretrampers" },
    { chance: 0.5, max: 1, item: "norcferatu-thornwraps" },
    { chance: 0.5, max: 1, item: "norcferatu-tuskplate" },
    { chance: 0.5, max: 1, item: "norcferatu-skullguard" },
    { chance: 0.5, max: 1, item: "norcferatu-fleshguards" },
    { chance: 0.5, max: 1, item: "norcferatu-fangstompers" },
  ],
  voices: {
    int: 5000,
    ch: 10,
    list: [
      { t: "Your blood will feed my brood!" },
      { t: "The night belongs to the Norcferatu!" },
      { t: "I am Vladrukh — the last thing you will ever see!" },
    ],
  },
  grupo: "quests",
};

const NORCFERATUS_MONSTERS = {
  "dworc-shadowstalker": DWORC_SHADOWSTALKER,
  "gloom-maw": GLOOM_MAW,
  "norcferatu-heartless": NORCFERATU_HEARTLESS,
  "norcferatu-nightweaver": NORCFERATU_NIGHTWEAVER,
  "orclops-bloodbreaker": ORCLOPS_BLOODBREAKER,
  "varg": VARG,
  "vladrukh": VLADRUKH,
};

const VLADRUKH_ROOM = {
  otbm: "norcferatus_fortress",
  name: "Vladrukh Room",
  center: { x: 1026, y: 1037, z: 7 },
  spawn:  { x: 1023, y: 1039, z: 7 },   // playerspawn
  boss:   { x: 1027, y: 1036, z: 7 },   // bossspawn
};

const VLADRUKH_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h oficiais

const NORCFERATUS_DATA = {
  monsterSlugs: Object.keys(NORCFERATUS_MONSTERS),
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug of Object.keys(NORCFERATUS_MONSTERS))
      monsters[slug] = NORCFERATUS_MONSTERS[slug];
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = NORCFERATUS_DATA;

/* ── Bloody Tusks Quest ── */

const BLOODY_TUSKS_QUEST_ID = "bloody-tusks-quest";

/* Missão 1: derrotar 5 Vargs (o extra spawn 3% da hunt) → libera o
 * acesso ao Vladrukh (gate requirement.mission). */
const BLOODY_TUSKS_MISSION_DEF = {
  "norcferatus-fortress": {
    title: "Missão: Bloody Tusks — 5 Vargs",
    tasks: [{
      monster: "varg", target: 5,
      label: "Derrotar 5 Vargs na Norcferatus Fortress",
    }],
    completeReward: { bossAccess: "vladrukh", bossName: "Vladrukh" },
  },
};

function bloodyTusksVargKills(p) {
  const st = p && p.missions && p.missions["norcferatus-fortress"];
  return Number((st && st.progress && st.progress.varg) || 0);
}

function bloodyTusksQuestState(p) {
  const vk = bloodyTusksVargKills(p);
  const m1 = vk >= 5 || !!(p && p.missionsDone && p.missionsDone["norcferatus-fortress"]);
  const m2 = typeof accountBossKilled === "function"
    ? accountBossKilled(p, "vladrukh")
    : Number(p && p.bosses && p.bosses["vladrukh"] && p.bosses["vladrukh"].kills) > 0;
  const done = (p && p.missionsDone) || {};
  return {
    reqLevel: (p && Number(p.level)) >= 400,
    m1: { done: m1, kills: Math.min(vk, 5), target: 5 },
    m2: { done: m2, kills: m2 ? 1 : 0, target: 1 },
    claimed: { mount: !!done["bloody-tusks:mount"] },
    complete: m2,
  };
}

function bloodyTusksClaim(p, key, value) {
  p.missionsDone = p.missionsDone || {};
  p.missionsDone["bloody-tusks:" + key] = value === undefined ? true : value;
  if (typeof syncMissionsToAccount === "function") syncMissionsToAccount(p);
}

function renderBloodyTusksQuestDetail(q, ui) {
  const p = G.p;
  if (typeof pullAccountMissions === "function") pullAccountMissions(p);
  const st = bloodyTusksQuestState(p);
  const fmtK = (n) => (typeof fmtFull === "function" ? fmtFull(n) : String(n));
  const row = (label, cur, target, done) =>
    `<div class="shop-row"><span class="info">${label}</span><b style="color:${done ? "#9ce84a" : "#d4af37"}">${done ? "✓ " : ""}${fmtK(cur)}/${fmtK(target)}</b></div>`;
  const reqRow = (label, ok) =>
    `<div class="shop-row"><span class="info">${label}</span><b style="color:${ok ? "#9ce84a" : "#ff9a6a"}">${ok ? "✓" : "✗"}</b></div>`;
  const rewardsUnlocked = st.m2.done;
  const mountPrev = typeof questMountFrameHtml === "function"
    ? questMountFrameHtml("gloom-maw", 56) : "";
  const boxState = st.claimed.mount ? "claimed" : (rewardsUnlocked ? "ready" : "locked");
  const mountBox = `<section class="quest-detail-panel mb-reward-box ${boxState}"><div class="hunt-best-title">MONTARIA — GLOOM MAW</div>
    ${st.claimed.mount
      ? `<div class="mb-outfit-granted">${mountPrev}<span class="tiny" style="color:#9ce84a">✓ Resgatada — Gloom Maw (toda a conta)</span></div>`
      : `<div class="mb-outfit-granted">${mountPrev}<span class="tiny dim">Gloom Maw — montaria de conta</span></div>
         <button type="button" class="sm primary quest-action" id="bt-claim-mount" ${rewardsUnlocked ? "" : "disabled"}>RESGATAR</button>
         ${rewardsUnlocked ? "" : '<div class="mb-reward-state dim">🔒 concluir a Missão 2</div>'}`}
  </section>`;

  ui.body.innerHTML = `<div class="panel-title">${q.name} — Level ${q.level}+<span class="spacer"></span><button class="sm" id="boss-quest-close">Fechar</button></div>
    <div class="panel-body quest-detail-body">
      <div class="quest-detail-desc">${q.description || ""}</div>
      <section class="quest-detail-panel"><div class="hunt-best-title">REQUISITOS</div>
        ${reqRow("Level 400+", st.reqLevel)}
        <div class="tiny dim">A quest é completada apenas 1 vez por conta.</div>
      </section>
      <section class="quest-detail-panel"><div class="hunt-best-title">MISSÕES</div>
        ${row("Missão 1 — Derrotar 5 Vargs", st.m1.kills, st.m1.target, st.m1.done)}
        <div class="tiny dim" style="margin:-4px 0 6px 4px">Recompensa: acesso ao boss Vladrukh</div>
        ${row("Missão 2 — Derrotar o Vladrukh", st.m2.kills, st.m2.target, st.m2.done)}
      </section>
      <section class="quest-detail-panel"><div class="hunt-best-title">REWARD${rewardsUnlocked ? "" : " — complete a Missão 2"}</div>
        <div class="mb-rewards-grid">${mountBox}</div>
      </section>
      <button class="sm" id="boss-quest-back">Voltar</button>
    </div>`;

  $("#boss-quest-close").onclick = () => {
    ui.modal.classList.remove("show");
    ui.body.classList.remove("quest-detail-shell");
  };
  $("#boss-quest-back").onclick = () => { openQuestsModal(); };

  if (!st.claimed.mount) {
    const btn = $("#bt-claim-mount");
    if (btn) btn.onclick = () => {
      if (!rewardsUnlocked) return;
      if (typeof grantMissionReward === "function")
        grantMissionReward(p, { accountMount: "gloom-maw" });
      bloodyTusksClaim(p, "mount");
      if (typeof addLog === "function") addLog("level", "Montaria <b>Gloom Maw</b> desbloqueada para a conta!");
      if (typeof toast === "function") toast("Montaria Gloom Maw desbloqueada!", "level");
      renderBloodyTusksQuestDetail(q, ui);
    };
  }
}

(function registerNorcferatusFortress() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in NORCFERATUS_ITEMS) {
    const def = NORCFERATUS_ITEMS[slug];
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
    for (const slug in NORCFERATUS_MONSTERS)
      MONSTERDATA[slug] = NORCFERATUS_MONSTERS[slug];
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in NORCFERATUS_MONSTERS)
    GAMEDATA.monsters[slug] = NORCFERATUS_MONSTERS[slug];

  /* Sheets 9×4 de células 64×64 (criaturas 2×2). */
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS)
    for (const slug in NORCFERATUS_MONSTERS)
      if (!MOBSHEETS[slug])
        MOBSHEETS[slug] = { ch: 64, cols: 9, cw: 64, rows: 4 };

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["norcferatus-fortress"] = {
    name: "Norcferatus Fortress",
    level: 400,
    minLevel: 400,
    cat: "hard",
    pack: 10,
    packMin: 8,
    packMax: 10,
    monsters: [
      "dworc-shadowstalker",
      "gloom-maw",
      "norcferatu-heartless",
      "norcferatu-nightweaver",
      "orclops-bloodbreaker",
    ],
    /* occurrence oficial: todas Comum → peso igual. */
    spawnWeights: {
      "dworc-shadowstalker": 20,
      "gloom-maw": 20,
      "norcferatu-heartless": 20,
      "norcferatu-nightweaver": 20,
      "orclops-bloodbreaker": 20,
    },
    /* A cada onda de respawn: 3% de chance de 1 Varg EXTRA além do
     * pack (nunca no lugar de um regular — combat.spawnWave e
     * spawnHuntWave implementam). */
    extraSpawn: { slug: "varg", chance: 0.03 },
    /* Respawn de 8 em 8 segundos (pedido). */
    respawnMs: 8000,
    color: "#5a3a6a",
    scene: "palace",
    otbm: "norcferatus_fortress",
    otbmFloor: 7,
    // centermap informado {1021,1028,7} é caminhável → spawn do jogador.
    otbmSpawn: { x: 1021, y: 1028, z: 7 },
    otbmMobBounds: { x: 1015, y: 1024, w: 13, h: 8, z: 7 },
    avgHp: 7940,
    avgExp: 8164,
    avgDamage: 524,
    avgArmor: 65,
    avgGold: 150,
    respawn: 1,
  };

  /* Hunt técnica invisível: câmara sul do mapa para o newBossCombat
   * ter colisão/spawn e o boss nascer na célula. */
  GAMEDATA.hunts["vladrukh-room"] = {
    name: VLADRUKH_ROOM.name,
    hidden: true,
    level: 400,
    minLevel: 400,
    monsters: ["vladrukh"],
    color: "#3a2a4a",
    scene: "palace",
    otbm: VLADRUKH_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: VLADRUKH_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, VLADRUKH_ROOM.boss),
    avgHp: VLADRUKH.hp,
    avgExp: VLADRUKH.exp,
    avgDamage: VLADRUKH.damage,
    avgArmor: VLADRUKH.armor,
    avgGold: 500,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  /* Missão 1 da Bloody Tusks Quest: 5 kills de Varg liberam o acesso
   * ao boss. */
  if (typeof MISSION_DEFS !== "undefined")
    Object.assign(MISSION_DEFS, BLOODY_TUSKS_MISSION_DEF);

  if (typeof QUEST_DEFS !== "undefined") {
    QUEST_DEFS[BLOODY_TUSKS_QUEST_ID] = {
      id: BLOODY_TUSKS_QUEST_ID,
      name: "Bloody Tusks Quest",
      level: 400,
      questType: "boss",
      worldQuest: true,
      playable: false,
      icon: "small-treasure-chest",
      bossSprite: "vladrukh",
      description: "A quest da Norcferatus Fortress: derrote 5 Vargs para abrir a câmara do Vladrukh e, ao vencê-lo, conquiste a montaria Gloom Maw.",
      renderDetail: renderBloodyTusksQuestDetail,
      rewardReady: (pp) => {
        const st = bloodyTusksQuestState(pp);
        return st.m2.done && !st.claimed.mount;
      },
    };
  }

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats diretos (newBossCombat usa hp/exp/damage/armor/defense quando
   * presentes) — skills/resist/loot vêm do monstro base. */
  BOSS_DEFS["vladrukh"] = {
    id: "vladrukh",
    name: "Vladrukh",
    title: "Boss Norcferatus Fortress",
    hunt: "vladrukh-room",
    baseMonster: "vladrukh",
    sprite: "vladrukh",
    hp: VLADRUKH.hp,
    exp: VLADRUKH.exp,
    damage: VLADRUKH.damage,
    armor: VLADRUKH.armor,
    defense: VLADRUKH.defense,
    speed: 0.00007,
    // Bloody Tusks Quest: acesso liberado pela Missão 1 (5 Vargs).
    requirement: {
      level: 400,
      mission: "norcferatus-fortress",
      enforced: true,
      text: "Bloody Tusks Quest — Missão 1: derrotar 5 Vargs na Norcferatus Fortress",
    },
    cooldown: VLADRUKH_COOLDOWN_MS,
  };
})();
