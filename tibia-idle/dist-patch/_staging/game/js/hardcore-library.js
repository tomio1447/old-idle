/*
 * hardcore-library.js — Secret Library como categoria de alto risco.
 *
 * Combate/HP/XP vêm do Canary (MONSTERDATA / canarymonsters.json), o mesmo
 * dataset do motor online. Este patch só: (1) garante itens de loot da
 * library; (2) cadastra fallbacks se o monstro ainda não existir no dump;
 * (3) registra as hunts hardcore. Não sobrescreve dano Canary existente —
 * overrides inventados (ex.: Energetic Book damage 1000 vs 200) deixavam
 * offline/local e o modal desalinhados do servidor.
 */
"use strict";

(function addHardcoreLibrary() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items;
  const mobs = GAMEDATA.monsters;

  // Materiais característicos das bibliotecas. Mantidos como itens de loot
  // comercializáveis mesmo quando o dump antigo não trazia sua entrada.
  const materials = {
    "book-page":       { n: "book page", s: "misc", t: "loot", sell: 180, w: 1 },
    "glowing-rune":   { n: "glowing rune", s: "misc", t: "loot", sell: 420, w: 1 },
    "silken-bookmark":{ n: "silken bookmark", s: "misc", t: "loot", sell: 950, w: 1 },
    "frosty-heart":   { n: "frosty heart", s: "misc", t: "loot", sell: 2100, w: 3 },
    "energy-ball":    { n: "energy ball", s: "misc", t: "loot", sell: 1800, w: 2 },
    "quill":           { n: "quill", s: "misc", t: "loot", sell: 240, w: 1 },
    "lightning-pendant": { n: "lightning pendant", s: "amulet", t: "amulet", sell: 3200, w: 5 },
    "leviathan-s-amulet": { n: "leviathan's amulet", s: "amulet", t: "amulet", arm: 1, sell: 5400, w: 5 },
  };
  Object.keys(materials).forEach((id) => { if (!items[id]) items[id] = materials[id]; });

  const commonLoot = [
    { chance: 100, max: 28, item: "platinum-coin" },
    { chance: 42, max: 5, item: "book-page" },
    { chance: 32, max: 4, item: "glowing-rune" },
    { chance: 14, max: 2, item: "ultimate-health-potion" },
    { chance: 14, max: 2, item: "ultimate-mana-potion" },
    { chance: 11, max: 1, item: "silken-bookmark" },
  ];
  const withLoot = (extra) => commonLoot.concat(extra || []);
  const book = (name, hp, exp, damage, armor, element, skills, loot, resist) => ({
    name, hp, exp, damage, armor, defense: armor, element, attackSpeed: 2000,
    mitigation: 2.4, resist: Object.assign({ physical: 0, earth: 0, fire: 0, ice: 0, energy: 0, holy: 0, death: 0 }, resist || {}),
    skills, loot,
  });

  // Fallbacks apenas se o monstro não veio do Canary. Strings de loot Canary
  // (rage-squid / squid-warden) permanecem no arquivo para regressão de loot.
  const fallbacks = {
    "burning-book": book("Burning Book", 18000, 13200, 700, 82, "fire", [
      { el: "fire", min: 800, max: 1100, int: 2000, ch: 30, range: 6, fx: "fire-attack", miss: "fire" },
      { el: "fire", min: 700, max: 950, int: 2500, ch: 22, radius: 2, fx: "fire-area" },
      { el: "fire", min: 750, max: 950, int: 3000, ch: 16, length: 4, spread: 2, fx: "fire-wave" },
    ], withLoot([{ chance: 18, max: 2, item: "flask-of-demonic-blood" }, { chance: 7, max: 1, item: "red-gem" }, { chance: 1.5, max: 1, item: "fire-sword" }]), { fire: 100, ice: -10, earth: 20 }),

    // Loot oficial Canary: rage_squid.lua (chance 100000 = 100%). Itens sem
    // cadastro local ficam fora até serem importados, sem substituir drops.
    "rage-squid": book("Rage Squid", 17000, 16300, 500, 78, "fire", [
      { el: "fire", min: 600, max: 750, int: 2000, ch: 28, range: 6, fx: "fire-attack", miss: "fire" },
      { el: "fire", min: 850, max: 1200, int: 3000, ch: 20, radius: 2, fx: "fire-area" },
      { el: "fire", min: 400, max: 500, int: 2500, ch: 18, length: 5, range: 2, fx: "fire-wave" },
    ], [{ chance:10,max:3,item:"great-spirit-potion"},{chance:10,max:6,item:"fire-mushroom"},{chance:90,max:5,item:"small-amethyst"},{chance:100,max:6,item:"platinum-coin"},{chance:10,max:3,item:"ultimate-health-potion"},{chance:90,max:5,item:"small-topaz"},{chance:90,max:5,item:"small-emerald"},{chance:9.8,max:5,item:"red-gem"},{chance:66,max:5,item:"orb"},{chance:6.333,max:1,item:"purple-tome"},{chance:10,max:3,item:"great-mana-potion"},{chance:4.3,max:1,item:"demonic-essence"},{chance:90,max:5,item:"small-ruby"},{chance:8.99,max:1,item:"talon"},{chance:4.99,max:1,item:"might-ring"},{chance:6.99,max:1,item:"devil-helmet"},{chance:.4,max:1,item:"demonrage-sword"},{chance:.25,max:1,item:"giant-sword"},{chance:.25,max:1,item:"demon-shield"},{chance:.15,max:1,item:"magic-plate-armor"},{chance:.35,max:1,item:"platinum-amulet"},{chance:.3,max:1,item:"wand-of-everblazing"},{chance:.5,max:1,item:"fire-axe"}], { fire: 100, ice: -15 }),

    "energetic-book": book("Energetic Book", 18500, 12034, 200, 82, "energy", [
      { el: "energy", min: 660, max: 800, int: 2000, ch: 28, range: 6, fx: "energy-hit", miss: "energy" },
      { el: "energy", min: 800, max: 1100, int: 2600, ch: 24, radius: 2, fx: "energy-area" },
      { el: "holy", min: 650, max: 800, int: 3100, ch: 16, length: 5, range: 1, fx: "holy-damage" },
    ], withLoot([{ chance: 9, max: 1, item: "energy-ball" }, { chance: 5, max: 1, item: "lightning-pendant" }, { chance: 3, max: 1, item: "lightning-boots" }, { chance: 1.5, max: 1, item: "wand-of-defiance" }]), { energy: 100, earth: -10, death: 15 }),

    "icecold-book": book("Icecold Book", 21000, 12750, 200, 82, "ice", [
      { el: "ice", min: 700, max: 900, int: 2100, ch: 26, radius: 2, fx: "ice-area" },
      { el: "ice", min: 700, max: 850, int: 2600, ch: 24, range: 6, fx: "ice-attack", miss: "ice" },
      { el: "ice", min: 800, max: 1350, int: 3200, ch: 16, length: 5, range: 1, fx: "ice-wave" },
    ], withLoot([{ chance: 22, max: 5, item: "small-sapphire" }, { chance: 5, max: 1, item: "frosty-heart" }, { chance: 4, max: 1, item: "ice-rapier" }, { chance: 2, max: 1, item: "leviathan-s-amulet" }, { chance: 5, max: 1, item: "quill" }]), { ice: 100, fire: -10, energy: -10 }),

    "cursed-book": book("Cursed Book", 20000, 13345, 200, 82, "earth", [
      { el: "earth", min: 600, max: 800, int: 2000, ch: 30, range: 6, fx: "hit-by-poison", miss: "poison" },
      { el: "earth", min: 700, max: 1100, int: 2600, ch: 22, radius: 2, fx: "poison-area" },
      { el: "earth", min: 650, max: 850, int: 3000, ch: 16, length: 5, range: 1, fx: "hit-by-poison" },
    ], withLoot([{ chance: 18, max: 3, item: "small-emerald" }, { chance: 8, max: 1, item: "small-amethyst" }, { chance: 6, max: 1, item: "ruby-necklace" }, { chance: 3, max: 1, item: "energy-ring" }]), { earth: 100, fire: -10, ice: 15 }),

    "biting-book": book("Biting Book", 6500, 9350, 1055, 76, "physical", [
      { el: "physical", min: 0, max: 1210, int: 1000, ch: 12, radius: 3, fx: "hit-area" },
      { el: "physical", min: 0, max: 1210, int: 1000, ch: 14, range: 5, fx: "hit-area" },
    ], withLoot([{ chance: 34, max: 5, item: "meat" }, { chance: 10, max: 1, item: "big-bone" }, { chance: 7, max: 1, item: "ruby-necklace" }, { chance: 4, max: 1, item: "spellbook-of-warding" }]), { fire: 10, energy: 10, earth: 10 }),

    // Loot oficial Canary: squid_warden.lua; maxCount preservado sem rate em quantidade.
    "squid-warden": book("Squid Warden", 16500, 15300, 300, 78, "ice", [
      { el: "ice", min: 600, max: 850, int: 2000, ch: 28, radius: 2, fx: "ice-area" },
      { el: "ice", min: 800, max: 1100, int: 2600, ch: 22, radius: 2, fx: "ice-area" },
      { el: "ice", min: 700, max: 900, int: 2400, ch: 20, range: 6, fx: "ice-attack", miss: "ice" },
    ], [{chance:11,max:57,item:"platinum-coin"},{chance:.8,max:4,item:"small-sapphire"},{chance:20,max:1,item:"ice-cube"},{chance:20,max:1,item:"inkwell"},{chance:10.003,max:4,item:"ultimate-health-potion"},{chance:10.003,max:4,item:"ultimate-mana-potion"},{chance:.5,max:1,item:"ice-rapier"},{chance:.4,max:1,item:"glacier-mask"},{chance:.3,max:1,item:"crystal-sword"},{chance:.15,max:1,item:"glacier-robe"},{chance:.15,max:1,item:"glacier-kilt"}], { ice: 100, fire: -15 }),
  };

  Object.keys(fallbacks).forEach((slug) => {
    if (!mobs[slug]) mobs[slug] = fallbacks[slug];
  });

  // Médias Canary (mesmo canarymonsters.json do servidor).
  const hunt = (name, level, monsters, color, avgHp, avgExp, avgDamage, avgArmor, avgGold) => ({
    name, level, minLevel: level, monsters, color, scene: "library",
    avgHp, avgExp, avgDamage, avgArmor, avgGold, respawn: 0.65,
    // Cada respawn sorteia uma box inteira de 10, 11 ou 12 criaturas.
    pack: 12, packMin: 10, packMax: 12,
    // Hardcore dobra as chances-base de Influenced e Fiendish.
    influencedMul: 2, fiendishMul: 2, cat: "hardcore",
  });
  Object.assign(GAMEDATA.hunts, {
    // Recorte editável salvo em beta-maps/livraria_fire.otbm e copiado para
    // maps/ no build. O loader OTBM normaliza o andar Z=2 para a arena idle.
    "library-fire": Object.assign(hunt("Secret Library — Fire Section", 400, ["burning-book", "rage-squid", "biting-book"], "#b64425", 13833, 12950, 752, 79, 95), { otbm: "livraria_fire2", otbmOffsetX: -1 }),
    "library-energy": hunt("Secret Library — Energy Section", 425, ["energetic-book", "biting-book"], "#7353d0", 12500, 10692, 628, 79, 92),
    // Usa o mapa completo (24×16). A instância agora adota dimensões OTBM
    // dinâmicas, portanto não é mais necessário cortar a primeira linha.
    "library-ice": Object.assign(hunt("Secret Library — Ice Section", 450, ["icecold-book", "squid-warden", "ink-blob"], "#3c9ec4", 15667, 14167, 360, 77, 98), { otbm: "livraria_ice" }),
    "library-earth": hunt("Secret Library — Earth Section", 475, ["cursed-book", "biting-book"], "#4c9b52", 13250, 11348, 628, 79, 88),
  });
})();
