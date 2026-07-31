/*
 * forgedata.js — dados da Exaltation Forge
 *
 * Referência principal: Exaltation System / Tibia Duality (link enviado pelo
 * usuário). Este arquivo foi refeito para seguir a regra oficial do sistema:
 *   - apenas helmet, armor e weapon podem receber tier;
 *   - classificação 1->1, 2->2, 3->3, 4->10;
 *   - efeitos oficiais: Ruse, Momentum e Onslaught;
 *   - recursos oficiais: Dust, Slivers e Exalted Cores;
 *   - operações oficiais: Fusion e Transfer.
 *
 * Observação importante de arquitetura:
 * o inventário atual do Idle ainda não é totalmente "instance based"; por isso
 * a lógica da Forge trabalha por slug e impõe algumas travas para evitar corromper
 * tiers quando houver cópias excedentes do mesmo item.
 */
"use strict";

window.FORGE_MAX_TIER = { 1: 1, 2: 2, 3: 3, 4: 10 };
window.FORGE_SLOTS = ["armor", "helmet", "weapon"];

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
};

window.FORGE_EFFECTS = {
  armor: {
    id: "ruse",
    name: "Ruse",
    desc: "Chance de suavizar totalmente um ataque recebido.",
    effectDesc: "Ao ativar, evita o golpe recebido.",
    procChance: function(tier) { return FORGE_PROC_CHANCES.armor[tier] || 0; },
    fmt: function(tier) {
      return (FORGE_PROC_CHANCES.armor[tier] || 0).toFixed(2) + "% de chance de ativar Ruse";
    },
  },
  helmet: {
    id: "momentum",
    name: "Momentum",
    desc: "Ao usar spell/potion em combate, pode reduzir todos os cooldowns em 2s.",
    effectDesc: "Quando ativa, reduz todos os cooldowns de magia em 2 segundos.",
    procChance: function(tier) { return FORGE_PROC_CHANCES.helmet[tier] || 0; },
    fmt: function(tier) {
      return (FORGE_PROC_CHANCES.helmet[tier] || 0).toFixed(2) + "% de chance de ativar Momentum";
    },
  },
  weapon: {
    id: "onslaught",
    name: "Onslaught",
    desc: "Ao atacar, pode causar 60% de dano extra, independente do crítico.",
    effectDesc: "Quando ativa, o ataque causa +60% de dano.",
    procChance: function(tier) { return FORGE_PROC_CHANCES.weapon[tier] || 0; },
    fmt: function(tier) {
      return (FORGE_PROC_CHANCES.weapon[tier] || 0).toFixed(2) + "% de chance de ativar Onslaught";
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

/*
 * Custos em gold por classificação e tier atual.
 * Ex.: FUSION_COST[class][0] = custo para 0 -> 1.
 */
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

/*
 * Custos da transferência por tier do item doador.
 * Ex.: TRANSFER_COST[class][2] = custo para transferir um T2 e gerar T1.
 */
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

function forgeEffectForSlot(slot, tier) {
  var ef = FORGE_EFFECTS[slot];
  if (!ef || !tier) return null;
  return {
    id: ef.id,
    name: ef.name,
    chance: ef.procChance(tier),
    text: ef.fmt(tier),
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

/*
 * Itens aptos na mochila.
 * O sistema oficial da Forge trabalha com os itens na backpack; o depot fica
 * separado e sem acoplamento.
 */
function forgeBagItems(p) {
  var out = [];
  var bag = p && p.bag ? p.bag : {};
  for (var slug in bag) {
    if (!bag[slug] || !forgeIsEligibleItem(slug)) continue;
    var it = GAMEDATA.items[slug];
    out.push({
      slug: slug,
      item: slug,
      count: bag[slug],
      cls: it.cls || 0,
      slot: it.s,
      maxTier: forgeMaxTierForSlug(slug),
      currentTier: p && p.forge ? (p.forge[slug] || 0) : 0,
      it: it,
    });
  }
  out.sort(function(a, b) {
    if (a.cls !== b.cls) return a.cls - b.cls;
    if (a.slot !== b.slot) return a.slot < b.slot ? -1 : 1;
    return a.it.n < b.it.n ? -1 : 1;
  });
  return out;
}

window.FORGE_UI = { mode: "fusion", slug: null, targetSlug: null, useCore: false };
window.DEPOT_UI = { tab: "depot" };
