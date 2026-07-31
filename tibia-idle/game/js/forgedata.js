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
