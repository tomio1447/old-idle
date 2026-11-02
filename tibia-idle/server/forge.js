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

module.exports = {
  FORGE_FUSION, FORGE_MAX_TIER, FORGE_SLOTS,
  forgeCanFuse, forgeFuseAuth,
};
