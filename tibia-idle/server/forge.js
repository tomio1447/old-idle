/*
 * forge.js — Exaltation Forge autoritativa (servidor)
 *
 * Espelho das regras do cliente (game/js/forgedata.js + game/js/forge.js):
 * a Fusion era 100% client-side e mutava o espelho local de bag/dust/gold —
 * qualquer sync do shared_inventory chegando entre a fusão e o save
 * sobrescrevia p.itemInstances com a cópia antiga: o tier "não ficava" no
 * item, o parceiro ressuscitava e o consumo sumia. Movida para endpoint
 * autoritativo (mesmo padrão loadCityPlayer → persistClaimedPlayer das
 * operações de cidade).
 *
 * Pure module: recebe o player já hidratado com o shared (bag é o shared,
 * gold é o wallet da conta) e ITEMS (GAMEDATA.items do servidor).
 */
"use strict";

const FORGE_MAX_TIER = { 1: 1, 2: 2, 3: 3, 4: 10 };
const FORGE_SLOTS = ["armor", "helmet", "weapon", "legs", "boots"];
const EQUIP_SLOTS = ["helmet", "amulet", "backpack", "armor", "weapon", "shield",
                     "legs", "boots", "ring", "extra", "ammo"];

const FORGE_FUSION = {
  dustCost: 100,
  successPct: 50,
  successPctCore: 65,
  failPenaltyProtectPct: 50,
};

const FORGE_FUSION_COST = {
  1: { 0: 25000 },
  2: { 0: 750000, 1: 5000000 },
  3: { 0: 4000000, 1: 10000000, 2: 20000000 },
  4: {
    0: 8000000, 1: 20000000, 2: 40000000, 3: 65000000, 4: 100000000,
    5: 250000000, 6: 750000000, 7: 2500000000, 8: 8000000000, 9: 15000000000,
  },
};

const FORGE_TRANSFER = { dustCost: 100, coreCost: 1 };
const FORGE_TRANSFER_COST = {
  2: { 2: 5000000 },
  3: { 2: 10000000, 3: 20000000 },
  4: {
    2: 20000000, 3: 40000000, 4: 65000000, 5: 100000000, 6: 250000000,
    7: 750000000, 8: 2500000000, 9: 8000000000, 10: 15000000000,
  },
};

/* Convergence of Dust and Slivers — espelho das constantes do cliente
 * (game/js/forgedata.js FORGE_CONVERGENCE + forge.js forgeDustLimitCost).
 * Recursos são DA CONTA (shared_inventory) — a aba Conversion era só
 * client-side e o sync do shared revertia o gasto no próximo /api/me. */
const FORGE_CONVERGENCE = {
  dustToSlivers: { dust: 60, slivers: 3 },
  sliversToCore: { slivers: 50, cores: 1 },
};
const FORGE_DUST_LIMIT = { min: 100, max: 325 };

function forgeConversionAuth(p, action) {
  if (!p || typeof p !== "object") return { ok: false, msg: "Conversão inválida." };
  p.dust = Math.max(0, Math.floor(Number(p.dust) || 0));
  p.slivers = Math.max(0, Math.floor(Number(p.slivers) || 0));
  p.exaltedCores = Math.max(0, Math.floor(Number(p.exaltedCores) || 0));
  p.dustLimit = Math.max(FORGE_DUST_LIMIT.min,
    Math.min(FORGE_DUST_LIMIT.max, Math.floor(Number(p.dustLimit) || FORGE_DUST_LIMIT.min)));
  if (action === "cap") {
    if (p.dustLimit >= FORGE_DUST_LIMIT.max)
      return { ok: false, msg: "Dust limit já está no máximo (" + FORGE_DUST_LIMIT.max + ")." };
    const cost = Math.max(1, p.dustLimit - 75);
    if (p.dust < cost) return { ok: false, msg: "Precisa de " + cost + " Dust para aumentar o limite." };
    p.dust -= cost;
    p.dustLimit += 1;
    return { ok: true, msg: "Dust limit aumentado para " + p.dustLimit + "." };
  }
  if (action === "dust-to-slivers") {
    const c = FORGE_CONVERGENCE.dustToSlivers;
    if (p.dust < c.dust) return { ok: false, msg: "Precisa de " + c.dust + " Dust." };
    p.dust -= c.dust;
    p.slivers += c.slivers;
    return { ok: true, msg: "+" + c.slivers + " Slivers criados." };
  }
  if (action === "slivers-to-core") {
    const c = FORGE_CONVERGENCE.sliversToCore;
    if (p.slivers < c.slivers) return { ok: false, msg: "Precisa de " + c.slivers + " Slivers." };
    p.slivers -= c.slivers;
    p.exaltedCores += c.cores;
    return { ok: true, msg: "+1 Exalted Core criado." };
  }
  return { ok: false, msg: "Conversão inválida." };
}

/* Convergence (WU23): exclusivo de classificação 4 — espelho das tabelas
 * oficiais do crystalserver (item_tiers.lua, addTier). */
const FORGE_CONVERGENCE_FUSION = { dustCost: 130 };
const FORGE_CONVERGENCE_TRANSFER = { dustCost: 160, coreCost: 1 };
const FORGE_CONVERGENCE_FUSION_COST = {
  4: {
    1: 55000000, 2: 110000000, 3: 170000000, 4: 300000000, 5: 875000000,
    6: 2350000000, 7: 6950000000, 8: 21250000000, 9: 50000000000,
    10: 125000000000,
  },
};
const FORGE_CONVERGENCE_TRANSFER_COST = {
  4: {
    1: 65000000, 2: 165000000, 3: 375000000, 4: 800000000, 5: 2000000000,
    6: 5250000000, 7: 14500000000, 8: 42500000000, 9: 100000000000,
    10: 300000000000,
  },
};

function instTier(inst) {
  return Math.max(0, Math.floor(Number(inst && inst.tier) || 0));
}

function findInst(p, id) {
  for (const inst of (p && p.itemInstances) || [])
    if (inst && String(inst.id) === String(id)) return inst;
  return null;
}

function forgeIsEligibleItem(it) {
  return !!(it && it.cls && FORGE_MAX_TIER[it.cls] && FORGE_SLOTS.indexOf(it.s) >= 0);
}

function forgeFusionGoldCost(it, currentTier) {
  const row = FORGE_FUSION_COST[it && it.cls] || null;
  return row && row[currentTier] ? row[currentTier] : 0;
}

function itemLabel(it, slug) {
  return (it && it.n) || slug;
}

/* Espelho do forgeHasImbuementOnEquippedRef do cliente: um item equipado com
 * imbuement não pode participar da fusão. */
function forgeHasImbuement(p, instId, slug) {
  if (!p || !p.equip || !p.imbuements) return false;
  for (const slot of EQUIP_SLOTS) {
    const eq = p.equip[slot];
    if (!eq) continue;
    if (instId && eq.instId !== instId) continue;
    if (!instId && eq.item !== slug) continue;
    const key = eq.instId ? "inst:" + eq.instId : "equip:" + slot;
    if (p.imbuements[key] && p.imbuements[key].length) return true;
  }
  return false;
}

/* Validação da fusão — espelho do forgeCanFuse do cliente. O item precisa
 * estar fisicamente na mochila (loc "bag") com um parceiro igual e mesmo
 * tier; gold é o wallet hidratado por loadCityPlayer. */
function forgeCanFuse(p, instId, useCore, ITEMS) {
  const inst = findInst(p, instId);
  if (!inst || inst.loc !== "bag")
    return { ok: false, msg: "Selecione um item físico da mochila para fundir." };
  const it = ITEMS && ITEMS[inst.slug];
  if (!forgeIsEligibleItem(it))
    return { ok: false, msg: "Item não pode ser usado na Exaltation Forge." };
  if (forgeHasImbuement(p, inst.id, inst.slug))
    return { ok: false, msg: "Remova os imbuements do item equipado antes de forjar." };
  const tier = instTier(inst), maxTier = FORGE_MAX_TIER[it.cls] || 0;
  const partner = (p.itemInstances || []).find((other) =>
    other && other.id !== inst.id && other.loc === "bag" &&
    other.slug === inst.slug && instTier(other) === tier);
  if (!partner)
    return { ok: false, msg: "A fusão precisa de 2 itens iguais e com o mesmo tier na mochila." };
  if (tier >= maxTier)
    return { ok: false, msg: "Tier máximo (T" + maxTier + ") atingido." };

  const gold = forgeFusionGoldCost(it, tier);
  if (!gold) return { ok: false, msg: "Custo de fusão não definido para este tier/classificação." };
  const haveGold = Math.max(0, Math.floor(Number(p.gold) || 0));
  if (haveGold < gold) return { ok: false, msg: "Faltam " + (gold - haveGold) + " gp." };
  if ((Number(p.dust) || 0) < FORGE_FUSION.dustCost)
    return { ok: false, msg: "Faltam " + (FORGE_FUSION.dustCost - (Number(p.dust) || 0)) + " Dust." };
  if (useCore && (Number(p.exaltedCores) || 0) < 1)
    return { ok: false, msg: "Falta 1 Exalted Core." };

  return {
    ok: true, inst, partner, name: itemLabel(it, inst.slug),
    current: tier, next: tier + 1, gold, dust: FORGE_FUSION.dustCost,
    useCore: !!useCore,
    successPct: useCore ? FORGE_FUSION.successPctCore : FORGE_FUSION.successPct,
  };
}

/* Espelho do forgeFuse do cliente: cobra gold/Dust/Core ANTES do roll; em
 * sucesso o alvo sobe de tier e o parceiro some; em falha o parceiro é
 * perdido (T0) ou perde um tier (T1+), com o Exalted Core protegendo 50%. */
function forgeFuseAuth(p, instId, useCore, ITEMS, rng) {
  const chk = forgeCanFuse(p, instId, useCore, ITEMS);
  if (!chk.ok) return chk;
  rng = typeof rng === "function" ? rng : Math.random;

  p.gold = Math.max(0, Math.floor(Number(p.gold) || 0) - chk.gold);
  p.dust = Math.max(0, Math.floor(Number(p.dust) || 0) - chk.dust);
  if (chk.useCore) p.exaltedCores = Math.max(0, Math.floor(Number(p.exaltedCores) || 0) - 1);

  const roll = rng() * 100;
  const success = roll < chk.successPct;
  if (success) {
    chk.inst.tier = chk.next;
    p.itemInstances = (p.itemInstances || []).filter((i) => i && i.id !== chk.partner.id);
    return {
      ok: true, success: true, tier: chk.next, slug: chk.inst.slug,
      msg: "Fusão bem-sucedida! " + chk.name + " agora é T" + chk.next +
           ". (" + chk.successPct + "% / roll " + Math.round(roll) + ")",
    };
  }

  if (chk.current <= 0) {
    const saved = chk.useCore && rng() < (FORGE_FUSION.failPenaltyProtectPct / 100);
    if (!saved) p.itemInstances = (p.itemInstances || []).filter((i) => i && i.id !== chk.partner.id);
    return {
      ok: true, success: false, tier: chk.current, slug: chk.inst.slug,
      partnerLost: !saved,
      msg: saved
        ? "A fusão falhou, mas o Exalted Core protegeu a perda do segundo item."
        : "A fusão falhou e o segundo item foi perdido.",
    };
  }

  const protectedTier = chk.useCore && rng() < (FORGE_FUSION.failPenaltyProtectPct / 100);
  if (!protectedTier) chk.partner.tier = Math.max(0, chk.current - 1);
  return {
    ok: true, success: false, tier: chk.current, slug: chk.inst.slug,
    msg: protectedTier
      ? "A fusão falhou, mas o Exalted Core evitou a perda de tier do segundo item."
      : (chk.name + " falhou; o segundo item caiu para T" + Math.max(0, chk.current - 1) + "."),
  };
}

/* ---------- Convergence (espelho do forge.js do cliente) ---------- */

/* Parceiro válido da Convergence Fusion: outro item classificação 4 do
 * MESMO slot e mesmo tier — pode ser um item diferente (oficial). */
function forgeConvergenceFusionPartner(p, inst, partnerInstId, tier, ITEMS) {
  const it = ITEMS[inst.slug];
  for (const other of (p.itemInstances || [])) {
    if (!other || other.id === inst.id || other.loc !== "bag") continue;
    if (partnerInstId && String(other.id) !== String(partnerInstId)) continue;
    const oit = ITEMS[other.slug];
    if (!oit || oit.cls !== 4 || oit.s !== it.s) continue;
    if (instTier(other) !== tier) continue;
    if (forgeHasImbuement(p, other.id, other.slug)) continue;
    return other;
  }
  return null;
}

function forgeCanConvergeFuse(p, instId, partnerInstId, ITEMS) {
  const inst = findInst(p, instId);
  if (!inst || inst.loc !== "bag")
    return { ok: false, msg: "Selecione um item físico da mochila para fundir." };
  const it = ITEMS && ITEMS[inst.slug];
  if (!forgeIsEligibleItem(it))
    return { ok: false, msg: "Item não pode ser usado na Exaltation Forge." };
  if (it.cls !== 4)
    return { ok: false, msg: "Convergence é exclusiva de itens classificação 4." };
  if (forgeHasImbuement(p, inst.id, inst.slug))
    return { ok: false, msg: "Remova os imbuements do item equipado antes de forjar." };
  const tier = instTier(inst), maxTier = FORGE_MAX_TIER[it.cls] || 0;
  if (tier >= maxTier)
    return { ok: false, msg: "Tier máximo (T" + maxTier + ") atingido." };

  const anyPartner = forgeConvergenceFusionPartner(p, inst, null, tier, ITEMS);
  if (!anyPartner)
    return { ok: false, msg: "A Convergence Fusion precisa de outro item classificação 4 do mesmo slot e mesmo tier na mochila." };
  const partner = partnerInstId
    ? forgeConvergenceFusionPartner(p, inst, partnerInstId, tier, ITEMS)
    : anyPartner;
  if (!partner)
    return { ok: false, msg: "Selecione um item parceiro válido (mesmo slot e mesmo tier)." };

  const gold = (FORGE_CONVERGENCE_FUSION_COST[it.cls] || {})[tier + 1] || 0;
  if (!gold) return { ok: false, msg: "Custo de Convergence Fusion não definido para este tier." };
  const haveGold = Math.max(0, Math.floor(Number(p.gold) || 0));
  if (haveGold < gold) return { ok: false, msg: "Faltam " + (gold - haveGold) + " gp." };
  if ((Number(p.dust) || 0) < FORGE_CONVERGENCE_FUSION.dustCost)
    return { ok: false, msg: "Faltam " + (FORGE_CONVERGENCE_FUSION.dustCost - (Number(p.dust) || 0)) + " Dust." };

  return {
    ok: true, inst, partner, name: itemLabel(it, inst.slug),
    current: tier, next: tier + 1, gold,
    dust: FORGE_CONVERGENCE_FUSION.dustCost,
  };
}

/* Convergence Fusion: resultado GARANTIDO — sem roll, sem cores, sem
 * bonus. O item alvo sobe de tier e o parceiro é consumido inteiro. */
function forgeConvergeFuseAuth(p, instId, partnerInstId, ITEMS) {
  const chk = forgeCanConvergeFuse(p, instId, partnerInstId, ITEMS);
  if (!chk.ok) return chk;

  p.gold = Math.max(0, Math.floor(Number(p.gold) || 0) - chk.gold);
  p.dust = Math.max(0, Math.floor(Number(p.dust) || 0) - chk.dust);

  chk.inst.tier = chk.next;
  p.itemInstances = (p.itemInstances || []).filter((i) => i && i.id !== chk.partner.id);
  return {
    ok: true, success: true, tier: chk.next, slug: chk.inst.slug,
    msg: "Convergence Fusion concluída! " + chk.name +
      " agora é T" + chk.next + " (resultado garantido).",
  };
}

/* Transfer — regular (tier - 1) e convergence (mesmo tier, class 4). */
function forgeCanTransfer(p, donorId, targetId, convergence, ITEMS) {
  const donor = findInst(p, donorId), target = findInst(p, targetId);
  if (!donor || !target || donor.loc !== "bag" || target.loc !== "bag")
    return { ok: false, msg: "Doador e alvo precisam estar fisicamente na mochila." };
  const dit = ITEMS && ITEMS[donor.slug], tit = ITEMS && ITEMS[target.slug];
  if (!forgeIsEligibleItem(dit) || !forgeIsEligibleItem(tit))
    return { ok: false, msg: "Selecione um item doador e um alvo válidos." };
  if (forgeHasImbuement(p, donor.id, donor.slug) || forgeHasImbuement(p, target.id, target.slug))
    return { ok: false, msg: "Itens equipados com imbuement não podem participar da transferência." };
  if (donor.id === target.id)
    return { ok: false, msg: "A transferência precisa de dois itens distintos." };
  if (dit.cls !== tit.cls)
    return { ok: false, msg: "Os itens precisam ter a mesma classificação." };
  const donorTier = instTier(donor);
  if (convergence) {
    if (dit.cls !== 4)
      return { ok: false, msg: "Convergence é exclusiva de itens classificação 4." };
    if (donorTier < 1)
      return { ok: false, msg: "O item doador precisa ter tier." };
  } else if (donorTier < 2) {
    return { ok: false, msg: "O item doador precisa ser no mínimo T2." };
  }
  if (instTier(target) > 0)
    return { ok: false, msg: "O item alvo precisa estar sem tier." };

  const gold = convergence
    ? ((FORGE_CONVERGENCE_TRANSFER_COST[dit.cls] || {})[donorTier] || 0)
    : ((FORGE_TRANSFER_COST[dit.cls] || {})[donorTier] || 0);
  if (!gold) return { ok: false, msg: "Custo de transferência não definido para este item." };
  const haveGold = Math.max(0, Math.floor(Number(p.gold) || 0));
  if (haveGold < gold) return { ok: false, msg: "Faltam " + (gold - haveGold) + " gp." };
  const dustCost = convergence ? FORGE_CONVERGENCE_TRANSFER.dustCost : FORGE_TRANSFER.dustCost;
  if ((Number(p.dust) || 0) < dustCost)
    return { ok: false, msg: "Faltam " + (dustCost - (Number(p.dust) || 0)) + " Dust." };
  const coreCost = convergence ? FORGE_CONVERGENCE_TRANSFER.coreCost : FORGE_TRANSFER.coreCost;
  if ((Number(p.exaltedCores) || 0) < coreCost)
    return { ok: false, msg: "Falta 1 Exalted Core." };

  return {
    ok: true, donor, target, donorName: itemLabel(dit, donor.slug),
    targetName: itemLabel(tit, target.slug),
    resultTier: convergence ? donorTier : donorTier - 1,
    gold, dust: dustCost, cores: coreCost, convergence: !!convergence,
  };
}

function forgeTransferAuth(p, donorId, targetId, convergence, ITEMS) {
  const chk = forgeCanTransfer(p, donorId, targetId, convergence, ITEMS);
  if (!chk.ok) return chk;

  p.gold = Math.max(0, Math.floor(Number(p.gold) || 0) - chk.gold);
  p.dust = Math.max(0, Math.floor(Number(p.dust) || 0) - chk.dust);
  p.exaltedCores = Math.max(0, Math.floor(Number(p.exaltedCores) || 0) - chk.cores);

  chk.target.tier = chk.resultTier;
  p.itemInstances = (p.itemInstances || []).filter((i) => i && i.id !== chk.donor.id);
  return {
    ok: true, success: true, tier: chk.resultTier, slug: chk.target.slug,
    msg: (chk.convergence
      ? "Convergence Transfer concluída! " + chk.targetName + " recebeu T" + chk.resultTier + " (sem perda de tier)."
      : "Transferência concluída! " + chk.targetName + " recebeu T" + chk.resultTier + "."),
  };
}

module.exports = {
  FORGE_FUSION, FORGE_MAX_TIER, FORGE_SLOTS,
  FORGE_CONVERGENCE, FORGE_DUST_LIMIT,
  forgeCanFuse, forgeFuseAuth,
  forgeCanConvergeFuse, forgeConvergeFuseAuth,
  forgeCanTransfer, forgeTransferAuth,
  forgeConversionAuth,
};
