/*
 * forgedata.js — Sistema de Exaltation Forge (Canary).
 *
 * Dados oficiais portados do protocolo do opentibiabr/canary:
 *   - classificacao (cls 1-4) determina o tier maximo
 *   - custos em gold, dust e exalted core por tier
 *   - chance de sucesso por tier
 *   - efeitos de forja por slot (Onslaught, Dodge, Momentum,
 *     Transcendence, Amplification)
 *   - sistema de dusts: fusao, conversao para exalted core
 *   - influencer / fiendish (substitui o influenced antigo)
 */
"use strict";

/* ---------- Mapa de tier maximo por classificacao ----------
 * Regra do Canary:
 *   cls 1 -> tier 3
 *   cls 2 -> tier 5
 *   cls 3 -> tier 7
 *   cls 4 -> tier 10  */
window.FORGE_MAX_TIER = { 1: 3, 2: 5, 3: 7, 4: 10 };

/* Tier do item (0 = nao forjado, 1-10 = forjado).
 * Guardado como p.forge[slug] = tier (1-10). */

/* ---------- Dusts (pos da forja) ----------
 * 4 tipos, do mais comum ao mais raro.
 * Dusts dropam de monstros fiendish/influenced. */
window.FORGE_DUSTS = {
  "dust-basic": {
    id: "dust-basic", name: "Basic Dust", tier: 1,
    sprite: "dust-basic", sell: 50,
    desc: "Po basico da forja. Dropa de criaturas influenced."
  },
  "dust-refined": {
    id: "dust-refined", name: "Refined Dust", tier: 2,
    sprite: "dust-refined", sell: 200,
    desc: "Po refinado. 10 basic dust = 1 refined."
  },
  "dust-pristine": {
    id: "dust-pristine", name: "Pristine Dust", tier: 3,
    sprite: "dust-pristine", sell: 1000,
    desc: "Po imaculado. 10 refined dust = 1 pristine."
  },
  "dust-exalted": {
    id: "dust-exalted", name: "Exalted Dust", tier: 4,
    sprite: "dust-exalted", sell: 5000,
    desc: "Po exaltado. 10 pristine dust = 1 exalted."
  },
};

/* Fusao: N dusts de um tier produzem 1 do tier seguinte */
window.FORGE_FUSION = {
  "dust-basic":    { from: "dust-basic",    to: "dust-refined",  need: 10, cost: 0 },
  "dust-refined":  { from: "dust-refined",  to: "dust-pristine", need: 10, cost: 0 },
  "dust-pristine": { from: "dust-pristine", to: "dust-exalted",  need: 10, cost: 0 },
};

/* ---------- Exalted Core ----------
 * 1 Exalted Core = 10 Exalted Dust (conversao apenas no sentido dust->core).
 * Cores sao usados nos tiers 7+ da forja junto com dust. */
window.EXALTED_CORE = {
  id: "exalted-core", name: "Exalted Core",
  sprite: "exalted-core", sell: 50000,
  costDust: 10,  // 10 exalted dust = 1 core
  desc: "Nucleo exaltado. 10 Exalted Dust = 1 Core. Usado em tiers altos da forja."
};

/* ---------- Custos da forja por tier (Canary) ---------- */
window.FORGE_COSTS = {
  1:  { gold: 50000,   dust: [{ type: "dust-basic",    qty: 5 }],   cores: 0, pct: 95, downgrade: false, break: false },
  2:  { gold: 100000,  dust: [{ type: "dust-basic",    qty: 10 }],  cores: 0, pct: 90, downgrade: false, break: false },
  3:  { gold: 200000,  dust: [{ type: "dust-refined",  qty: 5 }],   cores: 0, pct: 85, downgrade: false, break: false },
  4:  { gold: 400000,  dust: [{ type: "dust-refined",  qty: 10 }],  cores: 0, pct: 80, downgrade: true,  break: false },
  5:  { gold: 800000,  dust: [{ type: "dust-pristine", qty: 5 }],   cores: 0, pct: 75, downgrade: true,  break: false },
  6:  { gold: 1500000, dust: [{ type: "dust-pristine", qty: 10 }],  cores: 0, pct: 70, downgrade: true,  break: false },
  7:  { gold: 3000000, dust: [{ type: "dust-exalted",  qty: 5 }],   cores: 1, pct: 65, downgrade: true,  break: false },
  8:  { gold: 5000000, dust: [{ type: "dust-exalted",  qty: 10 }],  cores: 2, pct: 55, downgrade: true,  break: false },
  9:  { gold: 8000000, dust: [{ type: "dust-exalted",  qty: 15 }],  cores: 3, pct: 45, downgrade: true,  break: true },
  10: { gold: 12000000,dust: [{ type: "dust-exalted",  qty: 20 }],  cores: 5, pct: 35, downgrade: true,  break: true },
};

/* ---------- Efeitos da forja por slot (Exaltation Forge) ---------- */
window.FORGE_EFFECTS = {
  helmet: {
    id: "onslaught", name: "Onslaught",
    desc: "Aumenta o dano critico extra em {pct}%.",
    perTier: function(tier) { return tier * 2; },
    fmt: function(v) { return "+" + v + "% dano critico extra"; }
  },
  armor: {
    id: "dodge", name: "Dodge",
    desc: "Chance de {pct}% de esquivar completamente de um ataque.",
    perTier: function(tier) { return Math.round(tier * 0.8 * 10) / 10; },
    fmt: function(v) { return v.toFixed(1) + "% de esquiva"; }
  },
  legs: {
    id: "momentum", name: "Momentum",
    desc: "Reduz o cooldown das magias em {pct}%.",
    perTier: function(tier) { return tier; },
    fmt: function(v) { return "-" + v + "% cooldown de magias"; }
  },
  weapon: {
    id: "transcendence", name: "Transcendence",
    desc: "Avatar: ao ativar, transforma-se em um avatar supremo por 15s. " +
          "Durante o avatar: +{pct}% dano, +{pct2}% velocidade e imunidade a CC. " +
          "Cooldown: 180s.",
    perTier: function(tier) { return tier * 3; },
    perTier2: function(tier) { return tier * 5; },
    fmt: function(v) { return "Avatar: +" + v + "% dano, +" + (v * 5 / 3).toFixed(0) + "% vel (15s, cd 180s)"; }
  },
  boots: {
    id: "amplification", name: "Amplification",
    desc: "Aumenta a cura recebida em {pct}%.",
    perTier: function(tier) { return Math.round(tier * 1.5 * 10) / 10; },
    fmt: function(v) { return "+" + v.toFixed(1) + "% cura recebida"; }
  },
};

/* ---------- Slots que podem ser forjados ---------- */
window.FORGE_SLOTS = ["helmet", "armor", "legs", "weapon", "boots"];

/* Retorna o efeito de forja para um slot */
function forgeEffectForSlot(slot, tier) {
  const ef = FORGE_EFFECTS[slot];
  if (!ef || !tier) return null;
  return { id: ef.id, name: ef.name,
           text: ef.fmt(ef.perTier(tier)),
           pct: ef.perTier(tier) };
}

/* Slots que podem receber forja */
function forgeEquipables(p) {
  const out = [];
  for (const slot of FORGE_SLOTS) {
    const e = p.equip[slot];
    if (!e) continue;
    const it = GAMEDATA.items[e.item];
    if (!it) continue;
    const cls = it.cls || 0;
    if (cls < 1) continue;
    const maxTier = FORGE_MAX_TIER[cls] || 3;
    const currentTier = (p.forge && p.forge[e.item]) || 0;
    out.push({ slot, item: e.item, cls, maxTier, currentTier, it });
  }
  return out;
}

window.FORGE_UI = { slot: null, targetTier: 1 };
window.DEPOT_UI = { tab: "depot" };
