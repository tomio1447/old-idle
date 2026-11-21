/* Final Radiant — Maior Domus + Phosphorus (bosses 800+, update 15.30
 * "Make Believe", ausentes do dump Canary). Fichas oficiais
 * TibiaWiki/TibiaRealm; sprites renderizados do DAT convertido
 * (tools/tibia_assets_860.py), looktypes identificados por pixel-diff
 * contra os GIFs oficiais: Maior Domus = 1959, Phosphorus = 1963 —
 * ambos 2×2, sheets 9 colunas × 4 direções em
 * game/assets/mob/{maior-domus,phosphorus}.png.
 *
 * HP de TESTE a pedido do usuário: 10.000 para os dois (os demais world
 * bosses voltaram aos valores oficiais do dump Canary nesta mudança).
 *
 * Maior Domus — mini boss do modal BOSSES 800+, mesma arena do
 * Mimar Haffar (minis_radiant.otbm, mesmo spawn/boss). Cooldown 20h.
 * Phosphorus — world boss exclusivo do lobby (warzoneId "phosphorus",
 * sala final_radiant.otbm 39×27 z=7, origem local 0,0 — os pontos
 * absolutos do beta {1028,1023}/{1028,1031} caem em 20,8 / 20,16).
 * Gate oficial: exige kills de Maior Domus + Mimar Haffar
 * (requiresBossKills no WARZONES — validado no join do servidor).
 *
 * O monstro no MONSTERS do servidor é via module.exports
 * (require direto, mesmo padrão do mimar-haffar). */

const MAIOR_DOMUS_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/* Arena atualizada a pedido: Maior Domus e Mimar Haffar dividem a sala
 * minis_radiant.otbm (29×26 z=7, bounds 1009..1037 × 1015..1040). */
const MAIOR_DOMUS_ROOM = {
  otbm: "minis_radiant",
  name: "Maior Domus Room",
  spawn: { x: 1023, y: 1034, z: 7 },   // playerspawn
  boss:  { x: 1023, y: 1026, z: 7 },   // bossspawn
};

/* HP oficial (Boss Difficulty 1 — Calmera Wiki/TibiaWiki): Maior Domus
 * 460.000 como o Mimar Haffar; Phosphorus forma final 1.500.000. */
const MAIOR_DOMUS_STATS = {
  name: "Maior Domus",
  hp: 460000,
  exp: 3500000,
  damage: 2000,
  armor: 0,
  defense: 130,
};
const PHOSPHORUS_STATS = {
  name: "Phosphorus",
  hp: 1500000,
  exp: 16000000,
  damage: 2600,
  armor: 0,
  defense: 150,
};

/* Itens do loot oficial que faltavam no catálogo (ícones 32×32 em
 * game/assets/item/<slug>.png — cids do appearances.dat 15.x).
 * Preços oficiais (TibiaWiki): Figurine of Phosphorus = Yasir
 * 5.700.000; Figurine of Maior Domus = Yasir 3.400.000; Holy Ash =
 * Fiona/Yasir 160. Auric Moon Sigil e todo o set Moonsilver (armas
 * nível 1000 + capacetes nível 800) não têm comprador NPC → sell 0.
 * Spellbook of Dark Mysteries é equipamento real (Def 26, ml +3,
 * lvl 80 sors/druids, vocations update 2026) sem comprador → sell 0. */
const FINAL_RADIANT_LOOT_ITEMS = {
  "figurine-of-phosphorus":   { n: "figurine of Phosphorus", s: null, t: "loot", w: 1, cid: 54270, sell: 5700000, npcSell: 5700000 },
  "figurine-of-maior-domus":  { n: "figurine of Maior Domus", s: null, t: "loot", w: 0.8, cid: 54269, sell: 3400000, npcSell: 3400000 },
  "auric-moon-sigil":         { n: "auric moon sigil", s: null, t: "loot", w: 0.5, cid: 54480, sell: 0, npcSell: 0 },
  "holy-ash":                 { n: "holy ash", s: null, t: "loot", w: 1.9, cid: 17850, sell: 160, npcSell: 160 },
  /* O set Moonsilver inteiro (armas lvl 1000 / capacetes lvl 800) e o
   * spellbook-of-dark-mysteries já existem como equipamento real no
   * catálogo (stats oficiais com pierce/aug/bond) — não redefinir, só
   * corrigir preço abaixo. */
};

/* Correções de preço em itens já existentes que aparecem no loot dos
 * dois bosses — valores oficiais (TibiaWiki/tibiadb):
 * wand of starstorm 3.600 (Haroun), warrior helmet 5.000 (Alesar),
 * golden legs 30.000 (Rashid), club ring 100, giant emerald 90.000 e
 * giant ruby 70.000 (joalheria). Set Moonsilver completo e spellbook of
 * dark mysteries: NPC value 0 — nenhum NPC compra → sell 0 (o catálogo
 * tinha fallback calculado 40–50k). */
const FINAL_RADIANT_PRICE_FIXES = {
  "wand-of-starstorm": 3600,
  "warrior-helmet": 5000,
  "golden-legs": 30000,
  "club-ring": 100,
  "giant-emerald": 90000,
  "giant-ruby": 70000,
  "spellbook-of-dark-mysteries": 0,
  "moonsilver-nimbus-hat": 0,
  "moonsilver-strike-helm": 0,
  "moonsilver-trail-hood": 0,
  "moonsilver-epee": 0,
  "moonsilver-claymore": 0,
  "moonsilver-axe": 0,
  "moonsilver-chopper": 0,
  "moonsilver-crusher": 0,
  "moonsilver-mace": 0,
  "moonsilver-katar": 0,
  "moonsilver-bow": 0,
  "moonsilver-crossbow": 0,
  "moonsilver-channeler": 0,
  "moonsilver-sceptre": 0,
};

/* Maior Domus — "Pit Fighter" da Moonstone Crater (update 15.30).
 * Oficial: melee pesado + mecânica "Gerar Cargas" (acumula e descarrega
 * hits de energy). Resistências: earth 60% / fire 70% / energy 87%,
 * demais neutras; mitigation 2.53; sees invisible. */
const MAIOR_DOMUS = {
  name: "Maior Domus",
  boss: 1,
  hp: MAIOR_DOMUS_STATS.hp,
  exp: MAIOR_DOMUS_STATS.exp,
  speed: 230,
  armor: MAIOR_DOMUS_STATS.armor,
  defense: MAIOR_DOMUS_STATS.defense,
  damage: MAIOR_DOMUS_STATS.damage,
  element: "physical",
  attackSpeed: 2000,
  mitigation: 2.53,
  resist: { physical: 0, earth: 40, fire: 30, death: 0, energy: 13, holy: 0, ice: 0 },
  looktype: 1959,
  race: "blood",
  targetDistance: 1,
  staticAttack: 90,
  imune: ["paralyze", "invisible"],
  skills: [
    { el: "physical", min: 700, max: 1200, int: 2000, ch: 18, range: 1, miss: "small-stone" },
    { el: "energy", min: 600, max: 1050, int: 2000, ch: 15, radius: 4, fx: "energy-hit" },
    /* Gerar Cargas: rajada dupla de energy descarregada no alvo. */
    { el: "energy", min: 800, max: 1400, int: 2000, ch: 10, length: 7, spread: 0, fx: "purple-energy" },
    { el: "physical", min: 0, max: 0, int: 2000, ch: 12, n: "speed", range: 7, fx: "magic-red" },
  ],
  defSkills: [
    { n: "healing", min: 1200, max: 2600, int: 2000, ch: 12 },
    { n: "haste", int: 2000, ch: 10 },
  ],
  loot: [
    { chance: 100, max: 33, item: "crystal-coin" },
    { chance: 100, max: 86, item: "platinum-coin" },
    { chance: 60, max: 12, item: "bullseye-potion" },
    { chance: 50, max: 28, item: "great-mana-potion" },
    { chance: 50, max: 5, item: "mastermind-potion" },
    { chance: 40, max: 1, item: "amber-with-a-bug" },
    { chance: 40, max: 1, item: "giant-emerald" },
    { chance: 30, max: 1, item: "blue-gem" },
    { chance: 30, max: 1, item: "piece-of-hell-steel" },
    { chance: 30, max: 1, item: "yellow-gem" },
    { chance: 20, max: 1, item: "club-ring" },
    { chance: 20, max: 1, item: "golden-legs" },
    { chance: 20, max: 8, item: "supreme-health-potion" },
    { chance: 20, max: 10, item: "ultimate-health-potion" },
    { chance: 20, max: 1, item: "warrior-helmet" },
    { chance: 10, max: 20, item: "scraps-of-a-radiant-attire" },
    { chance: 5, max: 1, item: "moonsilver-battle-visor" },
    { chance: 5, max: 1, item: "moonsilver-nimbus-hat" },
    { chance: 5, max: 1, item: "moonsilver-spirit-mask" },
    { chance: 5, max: 1, item: "moonsilver-strike-helm" },
    { chance: 5, max: 1, item: "moonsilver-trail-hood" },
    { chance: 3, max: 1, item: "cloud-in-a-bottle" },
    { chance: 3, max: 1, item: "figurine-of-maior-domus" },
  ],
  grupo: "quests",
};

/* Phosphorus — world boss final da Make Believe (update 15.30).
 * Oficial: melee + área holy/energy; resistências earth 80% / fire 90%
 * / energy 95%; sees invisible. */
const PHOSPHORUS = {
  name: "Phosphorus",
  boss: 1,
  hp: PHOSPHORUS_STATS.hp,
  exp: PHOSPHORUS_STATS.exp,
  speed: 240,
  armor: PHOSPHORUS_STATS.armor,
  defense: PHOSPHORUS_STATS.defense,
  damage: PHOSPHORUS_STATS.damage,
  element: "holy",
  attackSpeed: 2000,
  mitigation: 2.5,
  resist: { physical: 0, earth: 20, fire: 10, death: 0, energy: 5, holy: 0, ice: 0 },
  looktype: 1963,
  race: "blood",
  targetDistance: 1,
  staticAttack: 90,
  imune: ["paralyze", "invisible"],
  skills: [
    { el: "physical", min: 900, max: 1500, int: 2000, ch: 18, range: 1, miss: "small-stone" },
    { el: "holy", min: 700, max: 1200, int: 2000, ch: 15, radius: 5, fx: "holy" },
    /* Agony em área (true damage): 3000–5000, 20% a cada 8s, raio 5.
     * chLock = a rolagem acontece uma vez por intervalo, não a cada ataque. */
    { el: "agony", min: 3000, max: 5000, int: 8000, ch: 20, chLock: true, radius: 5, fx: "draw-blood" },
    { el: "holy", min: 800, max: 1400, int: 2000, ch: 12, length: 8, spread: 3, fx: "holy-area" },
    { el: "energy", min: 600, max: 1100, int: 2000, ch: 15, range: 7, miss: "energy" },
    { el: "physical", min: 0, max: 0, int: 2000, ch: 12, n: "speed", range: 7, fx: "magic-red" },
  ],
  defSkills: [
    { n: "healing", min: 1500, max: 3200, int: 2000, ch: 12 },
  ],
  loot: [
    { chance: 100, max: 102, item: "crystal-coin" },
    { chance: 100, max: 92, item: "platinum-coin" },
    { chance: 60, max: 8, item: "blue-gem" },
    { chance: 50, max: 25, item: "great-mana-potion" },
    { chance: 50, max: 10, item: "mastermind-potion" },
    { chance: 50, max: 22, item: "strong-mana-potion" },
    { chance: 40, max: 29, item: "ultimate-mana-potion" },
    { chance: 40, max: 1, item: "red-gem" },
    { chance: 40, max: 1, item: "wand-of-starstorm" },
    { chance: 30, max: 1, item: "giant-ruby" },
    { chance: 30, max: 20, item: "great-spirit-potion" },
    { chance: 30, max: 1, item: "holy-ash" },
    { chance: 30, max: 1, item: "spellbook-of-dark-mysteries" },
    { chance: 20, max: 12, item: "bullseye-potion" },
    { chance: 20, max: 10, item: "scraps-of-a-radiant-attire" },
    { chance: 20, max: 8, item: "supreme-health-potion" },
    { chance: 5, max: 1, item: "moonsilver-axe" },
    { chance: 5, max: 1, item: "moonsilver-bow" },
    { chance: 5, max: 1, item: "moonsilver-channeler" },
    { chance: 5, max: 1, item: "moonsilver-chopper" },
    { chance: 5, max: 1, item: "moonsilver-claymore" },
    { chance: 5, max: 1, item: "moonsilver-crossbow" },
    { chance: 5, max: 1, item: "moonsilver-crusher" },
    { chance: 5, max: 1, item: "moonsilver-epee" },
    { chance: 5, max: 1, item: "moonsilver-katar" },
    { chance: 5, max: 1, item: "moonsilver-mace" },
    { chance: 5, max: 1, item: "moonsilver-sceptre" },
    { chance: 3, max: 1, item: "auric-moon-sigil" },
    { chance: 3, max: 1, item: "cloud-in-a-bottle" },
    { chance: 3, max: 1, item: "figurine-of-phosphorus" },
  ],
  grupo: "quests",
};

const FINAL_RADIANT_DATA = {
  monsterSlug: "maior-domus",
  monster: MAIOR_DOMUS,
  registerMonsters(monsters) {
    if (!monsters) return;
    monsters["maior-domus"] = MAIOR_DOMUS;
    monsters["phosphorus"] = PHOSPHORUS;
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = FINAL_RADIANT_DATA;

(function registerFinalRadiant() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in FINAL_RADIANT_LOOT_ITEMS) {
    const def = FINAL_RADIANT_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }
  for (const slug in FINAL_RADIANT_PRICE_FIXES) {
    if (!items[slug]) continue;
    items[slug].sell = FINAL_RADIANT_PRICE_FIXES[slug];
    items[slug].npcSell = FINAL_RADIANT_PRICE_FIXES[slug];
  }

  for (const slug of ["maior-domus", "phosphorus"]) {
    const mon = slug === "maior-domus" ? MAIOR_DOMUS : PHOSPHORUS;
    if (typeof MONSTERDATA !== "undefined" && MONSTERDATA)
      MONSTERDATA[slug] = mon;
    GAMEDATA.monsters = GAMEDATA.monsters || {};
    GAMEDATA.monsters[slug] = mon;
    if (typeof MOBSHEETS !== "undefined" && MOBSHEETS && !MOBSHEETS[slug])
      MOBSHEETS[slug] = { ch: 64, cols: 9, cw: 64, rows: 4 };
  }

  /* Hunt técnica invisível: Maior Domus usa a mesma arena do Mimar
   * Haffar (mesmo OTBM e mesmos pontos de spawn/boss). */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["maior-domus-room"] = {
    name: MAIOR_DOMUS_ROOM.name,
    hidden: true,
    level: 800,
    minLevel: 800,
    monsters: ["maior-domus"],
    color: "#8a6a2a",
    scene: "palace",
    otbm: MAIOR_DOMUS_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: MAIOR_DOMUS_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, MAIOR_DOMUS_ROOM.boss),
    avgHp: MAIOR_DOMUS_STATS.hp,
    avgExp: MAIOR_DOMUS_STATS.exp,
    avgDamage: MAIOR_DOMUS_STATS.damage,
    avgArmor: MAIOR_DOMUS_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  /* Arena do Phosphorus (World Boss): final_radiant.otbm inteiro, z=7,
   * bounds absolutos 1008..1046 × 1015..1041 → local 39×27. Spawn do
   * jogador 1028,1031 (local 20,16) e do boss 1028,1023 (local 20,8). */
  GAMEDATA.hunts["phosphorus-room"] = {
    name: "Phosphorus — Final Radiant",
    hidden: true,
    level: 800,
    minLevel: 800,
    monsters: ["phosphorus"],
    color: "#8a6a2a",
    scene: "palace",
    otbm: "final_radiant",
    otbmFloor: 7,
    otbmBounds: { x: 1008, y: 1015, w: 39, h: 27, z: 7 },
    otbmRuntimeWidth: 39,
    otbmRuntimeHeight: 27,
    noFovBound: true,
    otbmSpawn: { x: 1028, y: 1031, z: 7 },
    otbmMobBounds: { x: 1028, y: 1023, w: 1, h: 1, z: 7 },
    worldBoss: true,
    respawn: 0,
    pack: 1,
    cat: "boss",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  BOSS_DEFS["maior-domus"] = {
    id: "maior-domus",
    name: MAIOR_DOMUS_STATS.name,
    title: "Boss Moonstone Crater",
    hunt: "maior-domus-room",
    baseMonster: "maior-domus",
    sprite: "maior-domus",
    hp: MAIOR_DOMUS_STATS.hp,
    exp: MAIOR_DOMUS_STATS.exp,
    damage: MAIOR_DOMUS_STATS.damage,
    armor: MAIOR_DOMUS_STATS.armor,
    defense: MAIOR_DOMUS_STATS.defense,
    speed: 0.00007,
    // Make Believe Quest: acesso liberado pela Missão 1 (2500 kills em
    // Moonstone Castle) + requisitos da quest (Doctor Marrow, level 800+).
    requirement: {
      level: 800,
      killsRequired: ["doctor-marrow"],
      mission: "moonstone-castle",
      enforced: true,
      text: "Make Believe Quest — Missão 1: eliminar 2500 criaturas em Moonstone Castle (requer Doctor Marrow + nível 800)",
    },
    cooldown: MAIOR_DOMUS_COOLDOWN_MS,
  };

  /* Phosphorus — world boss exclusivo do lobby (warzoneId "phosphorus").
   * Substitui o placeholder "EM BREVE" do BOSS_DEFS: com hunt apontando a
   * arena real, newBossCombat deixa de cair no mapa placeholder 40×40 e
   * carrega o final_radiant.otbm (39×27, igual ao grid do servidor). */
  BOSS_DEFS["phosphorus"] = {
    id: "phosphorus",
    name: "Phosphorus",
    title: "World Boss — Final Radiant",
    hunt: "phosphorus-room",
    worldBoss: true,
    baseMonster: "phosphorus",
    sprite: "phosphorus",
    hp: PHOSPHORUS_STATS.hp,
    exp: PHOSPHORUS_STATS.exp,
    damage: PHOSPHORUS_STATS.damage,
    armor: PHOSPHORUS_STATS.armor,
    defense: PHOSPHORUS_STATS.defense,
    portraitImage: "assets/mob/phosphorus-preview.gif",
    requirement: { level: 800, text: "Entra pelo lobby do World Boss (nível 800+)" },
    loot: PHOSPHORUS.loot,
  };
})();
