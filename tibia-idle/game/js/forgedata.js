/*
 * forgedata.js — dados da Exaltation Forge (alinhado ao global atual)
 *
 * Regras consideradas:
 *   - classificação 1->1, 2->2, 3->3, 4->10
 *   - slots válidos: armor, helmet, weapon, legs, boots
 *   - efeitos:
 *       armor  -> Ruse
 *       helmet -> Momentum
 *       weapon -> Onslaught
 *       legs   -> Transcendence
 *       boots  -> Amplification
 *   - recursos: Dust, Slivers e Exalted Cores
 *   - operações base: Fusion e Transfer
 *
 * Observação importante de arquitetura:
 * o inventário do Idle ainda não é totalmente "instance based"; por isso a
 * lógica da Forge trabalha por slug e impõe travas em alguns cenários.
 */
"use strict";

window.FORGE_MAX_TIER = { 1: 1, 2: 2, 3: 3, 4: 10 };
window.FORGE_SLOTS = ["armor", "helmet", "weapon", "legs", "boots"];

window.FORGE_PROC_CHANCES = {
  armor: {
    1: 0.50, 2: 1.03, 3: 1.62, 4: 2.28, 5: 3.00,
    6: 3.78, 7: 4.62, 8: 5.52, 9: 6.48, 10: 7.51,
  },
  helmet: {
    1: 2.00, 2: 4.05, 3: 6.20, 4: 8.45, 5: 10.80,
    6: 13.25, 7: 15.80, 8: 18.45, 9: 21.20, 10: 24.05,
  },
  weapon: {
    1: 0.50, 2: 1.05, 3: 1.70, 4: 2.45, 5: 3.30,
    6: 4.25, 7: 5.30, 8: 6.45, 9: 7.70, 10: 9.05,
  },
  legs: {
    1: 0.13, 2: 0.27, 3: 0.44, 4: 0.64, 5: 0.86,
    6: 1.11, 7: 1.38, 8: 1.68, 9: 2.00, 10: 2.35,
  },
};

window.FORGE_AMPLIFICATION = {
  1: 2.50, 2: 5.40, 3: 9.10, 4: 13.60, 5: 18.90,
  6: 25.00, 7: 31.90, 8: 39.60, 9: 48.10, 10: 57.40,
};

window.FORGE_EFFECTS = {
  armor: {
    id: "ruse",
    name: "Ruse",
    desc: "Chance de evitar completamente um ataque recebido.",
    effectDesc: "Quando ativa, o golpe é totalmente evitado.",
    procChance: function(tier) { return FORGE_PROC_CHANCES.armor[tier] || 0; },
    fmt: function(chance, amplifiedBy) {
      return (amplifiedBy ? "Amplified " : "") + chance.toFixed(2) + "% de chance de ativar Ruse";
    },
  },
  helmet: {
    id: "momentum",
    name: "Momentum",
    desc: "A cada 2 segundos, se houver ação em combate, pode reduzir cooldowns em 2s.",
    effectDesc: "Quando ativa, reduz 2 segundos do cooldown individual e do grupo secundário.",
    procChance: function(tier) { return FORGE_PROC_CHANCES.helmet[tier] || 0; },
    fmt: function(chance, amplifiedBy) {
      return (amplifiedBy ? "Amplified " : "") + chance.toFixed(2) + "% de chance de ativar Momentum";
    },
  },
  weapon: {
    id: "onslaught",
    name: "Onslaught",
    desc: "Ao atacar, pode adicionar 60% de dano extra, somando com crítico.",
    effectDesc: "Quando ativa, o ataque recebe +60% de dano extra.",
    procChance: function(tier) { return FORGE_PROC_CHANCES.weapon[tier] || 0; },
    fmt: function(chance, amplifiedBy) {
      return (amplifiedBy ? "Amplified " : "") + chance.toFixed(2) + "% de chance de ativar Onslaught";
    },
  },
  legs: {
    id: "transcendence",
    name: "Transcendence",
    desc: "Pode ativar o Avatar Stage 3 por 7s ao usar arma, runa ofensiva ou spell ofensiva.",
    effectDesc: "Durante o avatar: -15% dano recebido e todos os ataques são críticos com +15% de extra damage.",
    procChance: function(tier) { return FORGE_PROC_CHANCES.legs[tier] || 0; },
    fmt: function(chance, amplifiedBy) {
      return (amplifiedBy ? "Amplified " : "") + chance.toFixed(2) + "% de chance de ativar Transcendence";
    },
  },
  boots: {
    id: "amplification",
    name: "Amplification",
    desc: "Aumenta a chance de ativação dos outros itens tierados equipados.",
    effectDesc: "Bônus passivo que amplifica os efeitos de armor, helmet, weapon e legs.",
    procChance: function(tier) { return FORGE_AMPLIFICATION[tier] || 0; },
    fmt: function(value) {
      return "+" + value.toFixed(2) + "% de amplificação nos outros efeitos tierados";
    },
  },
};

window.FORGE_RESOURCES = {
  dust: { id: "dust", name: "Dust" },
  slivers: { id: "slivers", name: "Slivers" },
  exaltedCore: { id: "exalted-core", name: "Exalted Core" },
};

window.FORGE_CONVERGENCE = {
  dustToSlivers: { dust: 60, slivers: 3 },
  sliversToCore: { slivers: 50, cores: 1 },
};

window.FORGE_FUSION = {
  dustCost: 100,
  successPct: 50,
  successPctCore: 65,
  failPenaltyProtectPct: 50,
};

window.FORGE_TRANSFER = {
  dustCost: 100,
  coreCost: 1,
};

window.FORGE_FUSION_COST = {
  1: { 0: 25000 },
  2: { 0: 750000, 1: 5000000 },
  3: { 0: 4000000, 1: 10000000, 2: 20000000 },
  4: {
    0: 8000000,
    1: 20000000,
    2: 40000000,
    3: 65000000,
    4: 100000000,
    5: 250000000,
    6: 750000000,
    7: 2500000000,
    8: 8000000000,
    9: 15000000000,
  },
};

window.FORGE_TRANSFER_COST = {
  2: { 2: 5000000 },
  3: { 2: 10000000, 3: 20000000 },
  4: {
    2: 20000000,
    3: 40000000,
    4: 65000000,
    5: 100000000,
    6: 250000000,
    7: 750000000,
    8: 2500000000,
    9: 8000000000,
    10: 15000000000,
  },
};

function forgeBaseChanceForSlotTier(slot, tier) {
  if (slot === "boots") return FORGE_AMPLIFICATION[tier] || 0;
  return (FORGE_PROC_CHANCES[slot] && FORGE_PROC_CHANCES[slot][tier]) || 0;
}

function forgeAmplificationImpactForTier(tier) {
  return FORGE_AMPLIFICATION[tier] || 0;
}

function forgeAmplifiedChance(baseChance, amplificationPct) {
  return baseChance * (1 + (amplificationPct || 0) / 100);
}

function forgeEffectForSlot(slot, tier, p) {
  var ef = FORGE_EFFECTS[slot];
  if (!ef || !tier) return null;
  var base = forgeBaseChanceForSlotTier(slot, tier);
  var amplifiedBy = 0;
  var value = base;
  if (slot !== "boots" && p && typeof forgeBootAmplificationPct === "function") {
    amplifiedBy = forgeBootAmplificationPct(p);
    if (amplifiedBy > 0) value = forgeAmplifiedChance(base, amplifiedBy);
  }
  return {
    id: ef.id,
    name: ef.name,
    base: base,
    chance: value,
    amplifiedBy: amplifiedBy,
    text: ef.fmt(value, amplifiedBy),
    desc: ef.effectDesc,
  };
}

function forgeItemClass(slug) {
  var it = GAMEDATA.items[slug];
  return it ? (it.cls || 0) : 0;
}

function forgeItemSlot(slug) {
  var it = GAMEDATA.items[slug];
  return it ? (it.s || null) : null;
}

function forgeIsEligibleItem(slug) {
  var it = GAMEDATA.items[slug];
  if (!it) return false;
  if (!it.cls || !FORGE_MAX_TIER[it.cls]) return false;
  return FORGE_SLOTS.indexOf(it.s) >= 0;
}

function forgeMaxTierForSlug(slug) {
  var cls = forgeItemClass(slug);
  return FORGE_MAX_TIER[cls] || 0;
}

function forgeFusionGoldCost(slug, currentTier) {
  var cls = forgeItemClass(slug);
  var row = FORGE_FUSION_COST[cls] || null;
  return row && row[currentTier] ? row[currentTier] : 0;
}

function forgeTransferGoldCost(slug, donorTier) {
  var cls = forgeItemClass(slug);
  var row = FORGE_TRANSFER_COST[cls] || null;
  return row && row[donorTier] ? row[donorTier] : 0;
}

function forgeBagItems(p) {
  var out = [];
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  var insts = p && p.itemInstances ? p.itemInstances : [];
  for (var i = 0; i < insts.length; i++) {
    var inst = insts[i];
    if (!inst || inst.loc !== "bag" || !forgeIsEligibleItem(inst.slug)) continue;
    var it = GAMEDATA.items[inst.slug];
    out.push({
      ref: inst.id,
      instanceId: inst.id,
      slug: inst.slug,
      item: inst.slug,
      count: 1,
      cls: it.cls || 0,
      slot: it.s,
      maxTier: forgeMaxTierForSlug(inst.slug),
      currentTier: inst.tier || 0,
      it: it,
    });
  }
  out.sort(function(a, b) {
    if (a.cls !== b.cls) return a.cls - b.cls;
    if (a.slot !== b.slot) return a.slot < b.slot ? -1 : 1;
    if (a.currentTier !== b.currentTier) return b.currentTier - a.currentTier;
    return a.it.n < b.it.n ? -1 : 1;
  });
  return out;
}

window.FORGE_UI = {
  mode: "fusion",
  slug: null,
  targetSlug: null,
  useCore: false,
};
window.DEPOT_UI = { tab: "depot" };

/* ------------------------------------------------------------------ *
 * Equipamento de BOSS (classificação 4 do Canary) — tier máximo T10.
 *
 * Gerado de tools/data (weapons.json, campo cls=4 do items.xml do
 * Canary). São os itens que os BOSSES irão dropar futuramente: o registro
 * existe para a forja já reconhecê-los (slot + classificação) e para a
 * documentação; o loot de bosses ainda não os solta no jogo.
 */
window.FORGE_BOSS_ITEMS = {
 "alchemist-s-boots": {
  "n": "alchemist's boots",
  "slot": "boots"
 },
 "alicorn-headguard": {
  "n": "alicorn headguard",
  "slot": "helmet"
 },
 "amazon-armor": {
  "n": "amazon armor",
  "slot": "armor"
 },
 "amazon-helmet": {
  "n": "amazon helmet",
  "slot": "helmet"
 },
 "amber-axe": {
  "n": "amber axe",
  "slot": "weapon"
 },
 "amber-bludgeon": {
  "n": "amber bludgeon",
  "slot": "weapon"
 },
 "amber-bow": {
  "n": "amber bow",
  "slot": "weapon"
 },
 "amber-crossbow": {
  "n": "amber crossbow",
  "slot": "weapon"
 },
 "amber-cudgel": {
  "n": "amber cudgel",
  "slot": "weapon"
 },
 "amber-greataxe": {
  "n": "amber greataxe",
  "slot": "weapon"
 },
 "amber-kusarigama": {
  "n": "amber kusarigama",
  "slot": "weapon"
 },
 "amber-rod": {
  "n": "amber rod",
  "slot": "weapon"
 },
 "amber-sabre": {
  "n": "amber sabre",
  "slot": "weapon"
 },
 "amber-slayer": {
  "n": "amber slayer",
  "slot": "weapon"
 },
 "amber-wand": {
  "n": "amber wand",
  "slot": "weapon"
 },
 "antler-horn-helmet": {
  "n": "antler-horn helmet",
  "slot": "helmet"
 },
 "arboreal-crown": {
  "n": "arboreal crown",
  "slot": "helmet"
 },
 "arcane-dragon-robe": {
  "n": "arcane dragon robe",
  "slot": "armor"
 },
 "arcanomancer-regalia": {
  "n": "arcanomancer regalia",
  "slot": "helmet"
 },
 "bambus-jo": {
  "n": "bambus jo",
  "slot": "weapon"
 },
 "bast-legs": {
  "n": "bast legs",
  "slot": "legs"
 },
 "boots-of-waterwalking": {
  "n": "boots of waterwalking",
  "slot": "boots"
 },
 "bunnyslippers": {
  "n": "bunnyslippers",
  "slot": "boots"
 },
 "ceremonial-mask": {
  "n": "ceremonial mask",
  "slot": "helmet"
 },
 "chain-bolter": {
  "n": "chain bolter",
  "slot": "weapon"
 },
 "cobra-axe": {
  "n": "cobra axe",
  "slot": "weapon"
 },
 "cobra-bo": {
  "n": "cobra bo",
  "slot": "weapon"
 },
 "cobra-boots": {
  "n": "cobra boots",
  "slot": "boots"
 },
 "cobra-club": {
  "n": "cobra club",
  "slot": "weapon"
 },
 "cobra-crossbow": {
  "n": "cobra crossbow",
  "slot": "weapon"
 },
 "cobra-hood": {
  "n": "cobra hood",
  "slot": "helmet"
 },
 "cobra-rod": {
  "n": "cobra rod",
  "slot": "weapon"
 },
 "cobra-sword": {
  "n": "cobra sword",
  "slot": "weapon"
 },
 "cobra-wand": {
  "n": "cobra wand",
  "slot": "weapon"
 },
 "crystal-boots": {
  "n": "crystal boots",
  "slot": "boots"
 },
 "daramian-axe": {
  "n": "daramian axe",
  "slot": "weapon"
 },
 "dark-lord-s-cape": {
  "n": "dark lord's cape",
  "slot": "armor"
 },
 "dark-trinity-mace": {
  "n": "dark trinity mace",
  "slot": "weapon"
 },
 "dauntless-dragon-scale-armor": {
  "n": "dauntless dragon scale armor",
  "slot": "armor"
 },
 "dawnfire-pantaloons": {
  "n": "dawnfire pantaloons",
  "slot": "legs"
 },
 "dawnfire-sherwani": {
  "n": "dawnfire sherwani",
  "slot": "armor"
 },
 "demon-legs": {
  "n": "demon legs",
  "slot": "legs"
 },
 "demon-mengu": {
  "n": "demon mengu",
  "slot": "helmet"
 },
 "demonfang-mask": {
  "n": "demonfang mask",
  "slot": "helmet"
 },
 "depth-claws": {
  "n": "depth claws",
  "slot": "weapon"
 },
 "devileye": {
  "n": "devileye",
  "slot": "weapon"
 },
 "dragon-scale-boots": {
  "n": "dragon scale boots",
  "slot": "boots"
 },
 "dragon-scale-legs": {
  "n": "dragon scale legs",
  "slot": "legs"
 },
 "draining-inferniarch-arbalest": {
  "n": "draining inferniarch arbalest",
  "slot": "weapon"
 },
 "draining-inferniarch-battleaxe": {
  "n": "draining inferniarch battleaxe",
  "slot": "weapon"
 },
 "draining-inferniarch-blade": {
  "n": "draining inferniarch blade",
  "slot": "weapon"
 },
 "draining-inferniarch-bow": {
  "n": "draining inferniarch bow",
  "slot": "weapon"
 },
 "draining-inferniarch-claws": {
  "n": "draining inferniarch claws",
  "slot": "weapon"
 },
 "draining-inferniarch-flail": {
  "n": "draining inferniarch flail",
  "slot": "weapon"
 },
 "draining-inferniarch-greataxe": {
  "n": "draining inferniarch greataxe",
  "slot": "weapon"
 },
 "draining-inferniarch-rod": {
  "n": "draining inferniarch rod",
  "slot": "weapon"
 },
 "draining-inferniarch-slayer": {
  "n": "draining inferniarch slayer",
  "slot": "weapon"
 },
 "draining-inferniarch-wand": {
  "n": "draining inferniarch wand",
  "slot": "weapon"
 },
 "draining-inferniarch-warhammer": {
  "n": "draining inferniarch warhammer",
  "slot": "weapon"
 },
 "dreadfire-headpiece": {
  "n": "dreadfire headpiece",
  "slot": "helmet"
 },
 "earthborn-titan-armor": {
  "n": "earthborn titan armor",
  "slot": "armor"
 },
 "eldritch-bow": {
  "n": "eldritch bow",
  "slot": "weapon"
 },
 "eldritch-breeches": {
  "n": "eldritch breeches",
  "slot": "legs"
 },
 "eldritch-claymore": {
  "n": "eldritch claymore",
  "slot": "weapon"
 },
 "eldritch-cowl": {
  "n": "eldritch cowl",
  "slot": "helmet"
 },
 "eldritch-crescent-moon-spade": {
  "n": "eldritch crescent moon spade",
  "slot": "weapon"
 },
 "eldritch-cuirass": {
  "n": "eldritch cuirass",
  "slot": "armor"
 },
 "eldritch-greataxe": {
  "n": "eldritch greataxe",
  "slot": "weapon"
 },
 "eldritch-hood": {
  "n": "eldritch hood",
  "slot": "helmet"
 },
 "eldritch-monk-boots": {
  "n": "eldritch monk boots",
  "slot": "boots"
 },
 "eldritch-rod": {
  "n": "eldritch rod",
  "slot": "weapon"
 },
 "eldritch-wand": {
  "n": "eldritch wand",
  "slot": "weapon"
 },
 "eldritch-warmace": {
  "n": "eldritch warmace",
  "slot": "weapon"
 },
 "elethriel-s-elemental-bow": {
  "n": "Elethriel's elemental bow",
  "slot": "weapon"
 },
 "epiphany": {
  "n": "epiphany",
  "slot": "weapon"
 },
 "ethereal-coned-hat": {
  "n": "ethereal coned hat",
  "slot": "helmet"
 },
 "exotic-legs": {
  "n": "exotic legs",
  "slot": "legs"
 },
 "falcon-battleaxe": {
  "n": "falcon battleaxe",
  "slot": "weapon"
 },
 "falcon-bow": {
  "n": "falcon bow",
  "slot": "weapon"
 },
 "falcon-circlet": {
  "n": "falcon circlet",
  "slot": "helmet"
 },
 "falcon-coif": {
  "n": "falcon coif",
  "slot": "helmet"
 },
 "falcon-greaves": {
  "n": "falcon greaves",
  "slot": "legs"
 },
 "falcon-longsword": {
  "n": "falcon longsword",
  "slot": "weapon"
 },
 "falcon-mace": {
  "n": "falcon mace",
  "slot": "weapon"
 },
 "falcon-plate": {
  "n": "falcon plate",
  "slot": "armor"
 },
 "falcon-rod": {
  "n": "falcon rod",
  "slot": "weapon"
 },
 "falcon-sai": {
  "n": "falcon sai",
  "slot": "weapon"
 },
 "falcon-wand": {
  "n": "falcon wand",
  "slot": "weapon"
 },
 "ferumbras-hat": {
  "n": "Ferumbras' hat",
  "slot": "helmet"
 },
 "feverbloom-boots": {
  "n": "feverbloom boots",
  "slot": "boots"
 },
 "frostflower-boots": {
  "n": "frostflower boots",
  "slot": "boots"
 },
 "furious-frock": {
  "n": "furious frock",
  "slot": "armor"
 },
 "ghazbaran-oyoroi": {
  "n": "ghazbaran oyoroi",
  "slot": "armor"
 },
 "gilded-eldritch-bow": {
  "n": "gilded eldritch bow",
  "slot": "weapon"
 },
 "gilded-eldritch-claymore": {
  "n": "gilded eldritch claymore",
  "slot": "weapon"
 },
 "gilded-eldritch-crescent-moon-spade": {
  "n": "gilded eldritch crescent moon spade",
  "slot": "weapon"
 },
 "gilded-eldritch-greataxe": {
  "n": "gilded eldritch greataxe",
  "slot": "weapon"
 },
 "gilded-eldritch-rod": {
  "n": "gilded eldritch rod",
  "slot": "weapon"
 },
 "gilded-eldritch-wand": {
  "n": "gilded eldritch wand",
  "slot": "weapon"
 },
 "gilded-eldritch-warmace": {
  "n": "gilded eldritch warmace",
  "slot": "weapon"
 },
 "golden-helmet": {
  "n": "golden helmet",
  "slot": "helmet"
 },
 "grand-sanguine-battleaxe": {
  "n": "grand sanguine battleaxe",
  "slot": "weapon"
 },
 "grand-sanguine-blade": {
  "n": "grand sanguine blade",
  "slot": "weapon"
 },
 "grand-sanguine-bludgeon": {
  "n": "grand sanguine bludgeon",
  "slot": "weapon"
 },
 "grand-sanguine-bow": {
  "n": "grand sanguine bow",
  "slot": "weapon"
 },
 "grand-sanguine-claws": {
  "n": "grand sanguine claws",
  "slot": "weapon"
 },
 "grand-sanguine-coil": {
  "n": "grand sanguine coil",
  "slot": "weapon"
 },
 "grand-sanguine-crossbow": {
  "n": "grand sanguine crossbow",
  "slot": "weapon"
 },
 "grand-sanguine-cudgel": {
  "n": "grand sanguine cudgel",
  "slot": "weapon"
 },
 "grand-sanguine-hatchet": {
  "n": "grand sanguine hatchet",
  "slot": "weapon"
 },
 "grand-sanguine-razor": {
  "n": "grand sanguine razor",
  "slot": "weapon"
 },
 "grand-sanguine-rod": {
  "n": "grand sanguine rod",
  "slot": "weapon"
 },
 "green-demon-armor": {
  "n": "green demon armor",
  "slot": "armor"
 },
 "green-demon-helmet": {
  "n": "green demon helmet",
  "slot": "helmet"
 },
 "green-demon-legs": {
  "n": "green demon legs",
  "slot": "legs"
 },
 "green-demon-slippers": {
  "n": "green demon slippers",
  "slot": "boots"
 },
 "hammer-of-prophecy": {
  "n": "hammer of prophecy",
  "slot": "weapon"
 },
 "hellstalker-visor": {
  "n": "hellstalker visor",
  "slot": "helmet"
 },
 "horned-helmet": {
  "n": "horned helmet",
  "slot": "helmet"
 },
 "icy-culottes": {
  "n": "icy culottes",
  "slot": "legs"
 },
 "iks-footwraps": {
  "n": "iks footwraps",
  "slot": "boots"
 },
 "impaler-of-the-igniter": {
  "n": "impaler of the igniter",
  "slot": "weapon"
 },
 "inferniarch-arbalest": {
  "n": "inferniarch arbalest",
  "slot": "weapon"
 },
 "inferniarch-battleaxe": {
  "n": "inferniarch battleaxe",
  "slot": "weapon"
 },
 "inferniarch-blade": {
  "n": "inferniarch blade",
  "slot": "weapon"
 },
 "inferniarch-bow": {
  "n": "inferniarch bow",
  "slot": "weapon"
 },
 "inferniarch-claws": {
  "n": "inferniarch claws",
  "slot": "weapon"
 },
 "inferniarch-flail": {
  "n": "inferniarch flail",
  "slot": "weapon"
 },
 "inferniarch-greataxe": {
  "n": "inferniarch greataxe",
  "slot": "weapon"
 },
 "inferniarch-rod": {
  "n": "inferniarch rod",
  "slot": "weapon"
 },
 "inferniarch-slayer": {
  "n": "inferniarch slayer",
  "slot": "weapon"
 },
 "inferniarch-wand": {
  "n": "inferniarch wand",
  "slot": "weapon"
 },
 "inferniarch-warhammer": {
  "n": "inferniarch warhammer",
  "slot": "weapon"
 },
 "jungle-bow": {
  "n": "jungle bow",
  "slot": "weapon"
 },
 "jungle-flail": {
  "n": "jungle flail",
  "slot": "weapon"
 },
 "jungle-rod": {
  "n": "jungle rod",
  "slot": "weapon"
 },
 "jungle-survivor-legs": {
  "n": "jungle survivor legs",
  "slot": "legs"
 },
 "jungle-wand": {
  "n": "jungle wand",
  "slot": "weapon"
 },
 "lich-staff": {
  "n": "lich staff",
  "slot": "weapon"
 },
 "light-mace": {
  "n": "light mace",
  "slot": "weapon"
 },
 "lion-axe": {
  "n": "lion axe",
  "slot": "weapon"
 },
 "lion-claws": {
  "n": "lion claws",
  "slot": "weapon"
 },
 "lion-hammer": {
  "n": "lion hammer",
  "slot": "weapon"
 },
 "lion-longbow": {
  "n": "lion longbow",
  "slot": "weapon"
 },
 "lion-longsword": {
  "n": "lion longsword",
  "slot": "weapon"
 },
 "lion-plate": {
  "n": "lion plate",
  "slot": "armor"
 },
 "lion-rod": {
  "n": "lion rod",
  "slot": "weapon"
 },
 "lion-spangenhelm": {
  "n": "lion spangenhelm",
  "slot": "helmet"
 },
 "lion-wand": {
  "n": "lion wand",
  "slot": "weapon"
 },
 "mage-s-cap": {
  "n": "mage's cap",
  "slot": "helmet"
 },
 "magic-longsword": {
  "n": "magic longsword",
  "slot": "weapon"
 },
 "make-do-boots": {
  "n": "make-do boots",
  "slot": "boots"
 },
 "makeshift-boots": {
  "n": "makeshift boots",
  "slot": "boots"
 },
 "maliceforged-helmet": {
  "n": "maliceforged helmet",
  "slot": "helmet"
 },
 "merudri-battle-mail": {
  "n": "merudri battle mail",
  "slot": "armor"
 },
 "midnight-sarong": {
  "n": "midnight sarong",
  "slot": "legs"
 },
 "midnight-tunic": {
  "n": "midnight tunic",
  "slot": "armor"
 },
 "molten-plate": {
  "n": "molten plate",
  "slot": "armor"
 },
 "mutant-bone-boots": {
  "n": "mutant bone boots",
  "slot": "boots"
 },
 "mutant-bone-kilt": {
  "n": "mutant bone kilt",
  "slot": "legs"
 },
 "mutant-hide-trousers": {
  "n": "mutant hide trousers",
  "slot": "legs"
 },
 "mutated-skin-armor": {
  "n": "mutated skin armor",
  "slot": "armor"
 },
 "mutated-skin-legs": {
  "n": "mutated skin legs",
  "slot": "legs"
 },
 "mystical-dragon-robe": {
  "n": "mystical dragon robe",
  "slot": "armor"
 },
 "mythril-axe": {
  "n": "mythril axe",
  "slot": "weapon"
 },
 "naga-axe": {
  "n": "naga axe",
  "slot": "weapon"
 },
 "naga-club": {
  "n": "naga club",
  "slot": "weapon"
 },
 "naga-crossbow": {
  "n": "naga crossbow",
  "slot": "weapon"
 },
 "naga-katar": {
  "n": "naga katar",
  "slot": "weapon"
 },
 "naga-rod": {
  "n": "naga rod",
  "slot": "weapon"
 },
 "naga-sword": {
  "n": "naga sword",
  "slot": "weapon"
 },
 "naga-tanko": {
  "n": "naga tanko",
  "slot": "armor"
 },
 "naga-wand": {
  "n": "naga wand",
  "slot": "weapon"
 },
 "native-armor": {
  "n": "native armor",
  "slot": "armor"
 },
 "norcferatu-bloodhide": {
  "n": "norcferatu bloodhide",
  "slot": "armor"
 },
 "norcferatu-bloodstrider": {
  "n": "norcferatu bloodstrider",
  "slot": "legs"
 },
 "norcferatu-bonecloak": {
  "n": "norcferatu bonecloak",
  "slot": "armor"
 },
 "norcferatu-bonehood": {
  "n": "norcferatu bonehood",
  "slot": "helmet"
 },
 "norcferatu-fangstompers": {
  "n": "norcferatu fangstompers",
  "slot": "boots"
 },
 "norcferatu-fleshguards": {
  "n": "norcferatu fleshguards",
  "slot": "legs"
 },
 "norcferatu-goretrampers": {
  "n": "norcferatu goretrampers",
  "slot": "boots"
 },
 "norcferatu-skullguard": {
  "n": "norcferatu skullguard",
  "slot": "helmet"
 },
 "norcferatu-thornwraps": {
  "n": "norcferatu thornwraps",
  "slot": "legs"
 },
 "norcferatu-tuskplate": {
  "n": "norcferatu tuskplate",
  "slot": "armor"
 },
 "oceanborn-leviathan-armor": {
  "n": "oceanborn leviathan armor",
  "slot": "armor"
 },
 "one-hit-wonder": {
  "n": "one hit wonder",
  "slot": "weapon"
 },
 "pair-of-soulstalkers": {
  "n": "pair of soulstalkers",
  "slot": "boots"
 },
 "pair-of-soulwalkers": {
  "n": "pair of soulwalkers",
  "slot": "boots"
 },
 "patched-boots": {
  "n": "patched boots",
  "slot": "boots"
 },
 "plague-bite": {
  "n": "plague bite",
  "slot": "weapon"
 },
 "ravenwing": {
  "n": "ravenwing",
  "slot": "weapon"
 },
 "rending-inferniarch-arbalest": {
  "n": "rending inferniarch arbalest",
  "slot": "weapon"
 },
 "rending-inferniarch-battleaxe": {
  "n": "rending inferniarch battleaxe",
  "slot": "weapon"
 },
 "rending-inferniarch-blade": {
  "n": "rending inferniarch blade",
  "slot": "weapon"
 },
 "rending-inferniarch-bow": {
  "n": "rending inferniarch bow",
  "slot": "weapon"
 },
 "rending-inferniarch-claws": {
  "n": "rending inferniarch claws",
  "slot": "weapon"
 },
 "rending-inferniarch-flail": {
  "n": "rending inferniarch flail",
  "slot": "weapon"
 },
 "rending-inferniarch-greataxe": {
  "n": "rending inferniarch greataxe",
  "slot": "weapon"
 },
 "rending-inferniarch-rod": {
  "n": "rending inferniarch rod",
  "slot": "weapon"
 },
 "rending-inferniarch-slayer": {
  "n": "rending inferniarch slayer",
  "slot": "weapon"
 },
 "rending-inferniarch-wand": {
  "n": "rending inferniarch wand",
  "slot": "weapon"
 },
 "rending-inferniarch-warhammer": {
  "n": "rending inferniarch warhammer",
  "slot": "weapon"
 },
 "robe-of-the-ice-queen": {
  "n": "robe of the ice queen",
  "slot": "armor"
 },
 "sanguine-battleaxe": {
  "n": "sanguine battleaxe",
  "slot": "weapon"
 },
 "sanguine-blade": {
  "n": "sanguine blade",
  "slot": "weapon"
 },
 "sanguine-bludgeon": {
  "n": "sanguine bludgeon",
  "slot": "weapon"
 },
 "sanguine-boots": {
  "n": "sanguine boots",
  "slot": "boots"
 },
 "sanguine-bow": {
  "n": "sanguine bow",
  "slot": "weapon"
 },
 "sanguine-claws": {
  "n": "sanguine claws",
  "slot": "weapon"
 },
 "sanguine-coil": {
  "n": "sanguine coil",
  "slot": "weapon"
 },
 "sanguine-crossbow": {
  "n": "sanguine crossbow",
  "slot": "weapon"
 },
 "sanguine-cudgel": {
  "n": "sanguine cudgel",
  "slot": "weapon"
 },
 "sanguine-galoshes": {
  "n": "sanguine galoshes",
  "slot": "boots"
 },
 "sanguine-greaves": {
  "n": "sanguine greaves",
  "slot": "legs"
 },
 "sanguine-hatchet": {
  "n": "sanguine hatchet",
  "slot": "weapon"
 },
 "sanguine-legs": {
  "n": "sanguine legs",
  "slot": "legs"
 },
 "sanguine-razor": {
  "n": "sanguine razor",
  "slot": "weapon"
 },
 "sanguine-rod": {
  "n": "sanguine rod",
  "slot": "weapon"
 },
 "sanguine-trousers": {
  "n": "sanguine trousers",
  "slot": "legs"
 },
 "shroud-of-despair": {
  "n": "shroud of despair",
  "slot": "helmet"
 },
 "siphoning-inferniarch-arbalest": {
  "n": "siphoning inferniarch arbalest",
  "slot": "weapon"
 },
 "siphoning-inferniarch-battleaxe": {
  "n": "siphoning inferniarch battleaxe",
  "slot": "weapon"
 },
 "siphoning-inferniarch-blade": {
  "n": "siphoning inferniarch blade",
  "slot": "weapon"
 },
 "siphoning-inferniarch-bow": {
  "n": "siphoning inferniarch bow",
  "slot": "weapon"
 },
 "siphoning-inferniarch-claws": {
  "n": "siphoning inferniarch claws",
  "slot": "weapon"
 },
 "siphoning-inferniarch-flail": {
  "n": "siphoning inferniarch flail",
  "slot": "weapon"
 },
 "siphoning-inferniarch-greataxe": {
  "n": "siphoning inferniarch greataxe",
  "slot": "weapon"
 },
 "siphoning-inferniarch-rod": {
  "n": "siphoning inferniarch rod",
  "slot": "weapon"
 },
 "siphoning-inferniarch-slayer": {
  "n": "siphoning inferniarch slayer",
  "slot": "weapon"
 },
 "siphoning-inferniarch-wand": {
  "n": "siphoning inferniarch wand",
  "slot": "weapon"
 },
 "siphoning-inferniarch-warhammer": {
  "n": "siphoning inferniarch warhammer",
  "slot": "weapon"
 },
 "solar-axe": {
  "n": "solar axe",
  "slot": "weapon"
 },
 "soulbiter": {
  "n": "soulbiter",
  "slot": "weapon"
 },
 "soulbleeder": {
  "n": "soulbleeder",
  "slot": "weapon"
 },
 "soulcrusher": {
  "n": "soulcrusher",
  "slot": "weapon"
 },
 "soulcutter": {
  "n": "soulcutter",
  "slot": "weapon"
 },
 "souleater": {
  "n": "souleater",
  "slot": "weapon"
 },
 "soulgarb": {
  "n": "soulgarb",
  "slot": "armor"
 },
 "soulhexer": {
  "n": "soulhexer",
  "slot": "weapon"
 },
 "soulkamas": {
  "n": "soulkamas",
  "slot": "weapon"
 },
 "soulmaimer": {
  "n": "soulmaimer",
  "slot": "weapon"
 },
 "soulmantle": {
  "n": "soulmantle",
  "slot": "armor"
 },
 "soulpiercer": {
  "n": "soulpiercer",
  "slot": "weapon"
 },
 "soulshanks": {
  "n": "soulshanks",
  "slot": "legs"
 },
 "soulshell": {
  "n": "soulshell",
  "slot": "armor"
 },
 "soulshredder": {
  "n": "soulshredder",
  "slot": "weapon"
 },
 "soulshroud": {
  "n": "soulshroud",
  "slot": "armor"
 },
 "soulsoles": {
  "n": "soulsoles",
  "slot": "boots"
 },
 "soulstrider": {
  "n": "soulstrider",
  "slot": "legs"
 },
 "soultainter": {
  "n": "soultainter",
  "slot": "weapon"
 },
 "spiritthorn-armor": {
  "n": "spiritthorn armor",
  "slot": "armor"
 },
 "spiritthorn-helmet": {
  "n": "spiritthorn helmet",
  "slot": "helmet"
 },
 "stitched-mutant-hide-legs": {
  "n": "stitched mutant hide legs",
  "slot": "legs"
 },
 "stoic-iks-boots": {
  "n": "stoic iks boots",
  "slot": "boots"
 },
 "stoic-iks-casque": {
  "n": "stoic iks casque",
  "slot": "boots"
 },
 "stoic-iks-chestplate": {
  "n": "stoic iks chestplate",
  "slot": "armor"
 },
 "stoic-iks-cuirass": {
  "n": "stoic iks cuirass",
  "slot": "armor"
 },
 "stoic-iks-culet": {
  "n": "stoic iks culet",
  "slot": "legs"
 },
 "stoic-iks-faulds": {
  "n": "stoic iks faulds",
  "slot": "legs"
 },
 "stoic-iks-headpiece": {
  "n": "stoic iks headpiece",
  "slot": "helmet"
 },
 "stoic-iks-robe": {
  "n": "stoic iks robe",
  "slot": "armor"
 },
 "stoic-iks-sandals": {
  "n": "stoic iks sandals",
  "slot": "boots"
 },
 "throwing-axe": {
  "n": "throwing axe",
  "slot": "weapon"
 },
 "thunder-hammer": {
  "n": "thunder hammer",
  "slot": "weapon"
 },
 "treader-of-torment": {
  "n": "treader of torment",
  "slot": "boots"
 },
 "triple-bolt-crossbow": {
  "n": "triple bolt crossbow",
  "slot": "weapon"
 },
 "umbral-master-axe": {
  "n": "umbral master axe",
  "slot": "weapon"
 },
 "umbral-master-bow": {
  "n": "umbral master bow",
  "slot": "weapon"
 },
 "umbral-master-chopper": {
  "n": "umbral master chopper",
  "slot": "weapon"
 },
 "umbral-master-crossbow": {
  "n": "umbral master crossbow",
  "slot": "weapon"
 },
 "umbral-master-hammer": {
  "n": "umbral master hammer",
  "slot": "weapon"
 },
 "umbral-master-katar": {
  "n": "umbral master katar",
  "slot": "weapon"
 },
 "umbral-master-mace": {
  "n": "umbral master mace",
  "slot": "weapon"
 },
 "umbral-master-slayer": {
  "n": "umbral master slayer",
  "slot": "weapon"
 },
 "umbral-masterblade": {
  "n": "umbral masterblade",
  "slot": "weapon"
 },
 "unerring-dragon-scale-armor": {
  "n": "unerring dragon scale armor",
  "slot": "armor"
 },
 "vampire-silk-slippers": {
  "n": "vampire silk slippers",
  "slot": "boots"
 },
 "visage-of-the-end-days": {
  "n": "visage of the end days",
  "slot": "helmet"
 },
 "wand-of-dimensions": {
  "n": "wand of dimensions",
  "slot": "weapon"
 },
 "warlord-sword": {
  "n": "warlord sword",
  "slot": "weapon"
 },
 "winged-helmet": {
  "n": "winged helmet",
  "slot": "helmet"
 },
 "yol-s-bow": {
  "n": "Yol's bow",
  "slot": "weapon"
 }
};

/* Total de itens boss-grade registrados (debug/UI). */
window.FORGE_BOSS_COUNT = Object.keys(window.FORGE_BOSS_ITEMS).length;

/* true se o slug é um item de boss (classificação 4) da forja. */
function forgeIsBossItem(slug) {
  return !!(typeof window.FORGE_BOSS_ITEMS !== "undefined" &&
            window.FORGE_BOSS_ITEMS[slug]);
}
