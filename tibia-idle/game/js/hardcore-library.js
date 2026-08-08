/*
 * hardcore-library.js — Secret Library como categoria de alto risco.
 *
 * Os dados de criaturas da biblioteca não entraram no recorte inicial do
 * GAMEDATA, embora as sprites oficiais já existam no cliente. Este patch os
 * cadastra depois da fusão do MONSTERDATA e mantém loot/atributos próprios.
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

  mobs["burning-book"] = book("Burning Book", 18000, 13200, 700, 82, "fire", [
    { el: "fire", min: 800, max: 1100, int: 2000, ch: 30, range: 6, fx: "fire-attack", miss: "fire" },
    { el: "fire", min: 700, max: 950, int: 2500, ch: 22, radius: 2, fx: "fire-area" },
    { el: "fire", min: 750, max: 950, int: 3000, ch: 16, length: 4, spread: 2, fx: "fire-wave" },
  ], withLoot([{ chance: 18, max: 2, item: "flask-of-demonic-blood" }, { chance: 7, max: 1, item: "red-gem" }, { chance: 1.5, max: 1, item: "fire-sword" }]), { fire: 100, ice: -10, earth: 20 });

  mobs["rage-squid"] = book("Rage Squid", 17000, 16300, 650, 78, "fire", [
    { el: "fire", min: 600, max: 750, int: 2000, ch: 28, range: 6, fx: "fire-attack", miss: "fire" },
    { el: "fire", min: 850, max: 1200, int: 3000, ch: 20, radius: 2, fx: "fire-area" },
    { el: "fire", min: 400, max: 500, int: 2500, ch: 18, length: 5, spread: 2, fx: "fire-wave" },
  ], withLoot([{ chance: 24, max: 3, item: "ultimate-health-potion" }, { chance: 8, max: 1, item: "small-ruby" }, { chance: 2, max: 1, item: "wand-of-inferno" }]), { fire: 100, ice: -5, earth: 20 });

  mobs["energetic-book"] = book("Energetic Book", 18500, 12034, 1000, 80, "energy", [
    { el: "energy", min: 660, max: 800, int: 2000, ch: 28, range: 6, fx: "energy-hit", miss: "energy" },
    { el: "energy", min: 800, max: 1100, int: 2600, ch: 24, radius: 2, fx: "energy-area" },
    { el: "holy", min: 650, max: 800, int: 3100, ch: 16, length: 5, spread: 1, fx: "holy-damage" },
  ], withLoot([{ chance: 9, max: 1, item: "energy-ball" }, { chance: 5, max: 1, item: "lightning-pendant" }, { chance: 3, max: 1, item: "lightning-boots" }, { chance: 1.5, max: 1, item: "wand-of-defiance" }]), { energy: 100, earth: -10, death: 15 });

  mobs["icecold-book"] = book("Icecold Book", 21000, 15500, 700, 84, "ice", [
    { el: "ice", min: 700, max: 900, int: 2100, ch: 26, radius: 2, fx: "ice-area" },
    { el: "ice", min: 700, max: 850, int: 2600, ch: 24, range: 6, fx: "ice-attack", miss: "ice" },
    { el: "ice", min: 800, max: 1350, int: 3200, ch: 16, length: 5, spread: 1, fx: "ice-wave" },
  ], withLoot([{ chance: 22, max: 5, item: "small-sapphire" }, { chance: 5, max: 1, item: "frosty-heart" }, { chance: 4, max: 1, item: "ice-rapier" }, { chance: 2, max: 1, item: "leviathan-s-amulet" }, { chance: 5, max: 1, item: "quill" }]), { ice: 100, fire: -10, energy: 15 });

  mobs["cursed-book"] = book("Cursed Book", 19500, 14500, 600, 80, "earth", [
    { el: "earth", min: 600, max: 800, int: 2000, ch: 30, range: 6, fx: "hit-by-poison", miss: "poison" },
    { el: "earth", min: 700, max: 1100, int: 2600, ch: 22, radius: 2, fx: "poison-area" },
    { el: "earth", min: 650, max: 850, int: 3000, ch: 16, length: 5, spread: 1, fx: "hit-by-poison" },
  ], withLoot([{ chance: 18, max: 3, item: "small-emerald" }, { chance: 8, max: 1, item: "small-amethyst" }, { chance: 6, max: 1, item: "ruby-necklace" }, { chance: 3, max: 1, item: "energy-ring" }]), { earth: 100, fire: -10, ice: 15 });

  mobs["biting-book"] = book("Biting Book", 6500, 8200, 650, 66, "physical", [
    { el: "physical", min: 1045, max: 1185, int: 2600, ch: 20, radius: 3, fx: "hit-area" },
    { el: "physical", min: 1075, max: 1250, int: 2400, ch: 22, range: 5, fx: "hit-area" },
    { el: "physical", min: 995, max: 1180, int: 3200, ch: 15, length: 4, spread: 2, fx: "hit-area" },
  ], withLoot([{ chance: 34, max: 5, item: "meat" }, { chance: 10, max: 1, item: "big-bone" }, { chance: 7, max: 1, item: "ruby-necklace" }, { chance: 4, max: 1, item: "spellbook-of-warding" }]), { fire: 10, energy: 10, earth: 10 });

  mobs["squid-warden"] = book("Squid Warden", 16500, 14800, 800, 80, "ice", [
    { el: "ice", min: 600, max: 850, int: 2000, ch: 28, radius: 2, fx: "ice-area" },
    { el: "ice", min: 800, max: 1100, int: 2600, ch: 22, radius: 2, fx: "ice-area" },
    { el: "ice", min: 700, max: 900, int: 2400, ch: 20, range: 6, fx: "ice-attack", miss: "ice" },
  ], withLoot([{ chance: 26, max: 5, item: "small-sapphire" }, { chance: 8, max: 1, item: "glacier-mask" }, { chance: 5, max: 1, item: "diamond-sceptre" }, { chance: 3, max: 1, item: "ice-rapier" }]), { ice: 100, fire: -10, energy: 10 });

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
    "library-fire": Object.assign(hunt("Secret Library — Fire Section", 400, ["burning-book", "rage-squid", "biting-book"], "#b64425", 15167, 12567, 783, 75, 95), { otbm: "livraria_fire2", otbmOffsetX: -1 }),
    "library-energy": hunt("Secret Library — Energy Section", 425, ["energetic-book", "biting-book"], "#7353d0", 14500, 11000, 825, 73, 92),
    "library-ice": Object.assign(hunt("Secret Library — Ice Section", 450, ["icecold-book", "squid-warden", "biting-book"], "#3c9ec4", 14667, 12833, 717, 77, 98), { otbm: "livraria_ice" }),
    "library-earth": hunt("Secret Library — Earth Section", 475, ["cursed-book", "biting-book"], "#4c9b52", 13000, 11350, 625, 73, 88),
  });
})();
