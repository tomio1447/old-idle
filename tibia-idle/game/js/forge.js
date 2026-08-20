/*
 * forge.js — Exaltation Forge + Depot (refactor)
 *
 * Refeito para separar responsabilidades:
 *   - Forge cuida de fusion/transfer e dos efeitos oficiais.
 *   - Depot cuida apenas de armazenar/retirar/equipar itens.
 *   - Exaltation Box antiga vira apenas compatibilidade de saves legados.
 *
 * Limitação assumida explicitamente:
 * o inventário base do Idle ainda agrupa itens por slug na mochila. Para não
 * corromper tiers quando houver várias cópias do mesmo item, a Forge bloqueia
 * alguns cenários que exigiriam inventário totalmente instanciado.
 */
"use strict";

function ensureForge(p) {
  p.forge = p.forge || {};
  p.depot = Array.isArray(p.depot) ? p.depot : [];
  p.exaltationBox = Array.isArray(p.exaltationBox) ? p.exaltationBox : [];
  p.depotNotification = Number(p.depotNotification || 0);
  p.exaltedCores = Number(p.exaltedCores || 0);
  p.slivers = Number(p.slivers || 0);
  if (typeof p.dust !== "number") p.dust = forgeMigrateLegacyDust(p);
  p.dustLimit = Number(p.dustLimit || 100);
  if (p.dustLimit < 100) p.dustLimit = 100;
  if (p.dustLimit > 325) p.dustLimit = 325;
  if (p.dust > p.dustLimit) p.dust = p.dustLimit;
  if (!p._forgeMeta) p._forgeMeta = { lastMomentumRollAt: 0 };
}

function forgeMigrateLegacyDust(p) {
  var dust = 0;
  var old = p && p.dusts ? p.dusts : null;
  if (!old) return 0;
  /*
   * Migração conservadora do sistema antigo por camadas de dust.
   * 1 refined ~= 10 basic, 1 pristine ~= 100 basic, 1 exalted ~= 1000 basic.
   */
  dust += Number(old["dust-basic"] || 0);
  dust += Number(old["dust-refined"] || 0) * 10;
  dust += Number(old["dust-pristine"] || 0) * 100;
  dust += Number(old["dust-exalted"] || 0) * 1000;
  return dust;
}

function forgeResolveRef(p, ref) {
  ensureForge(p);
  if (!ref) return { slug: null, inst: null, ref: null };
  var inst = (typeof findItemInstance === "function") ? findItemInstance(p, ref) : null;
  if (inst) return { slug: inst.slug, inst: inst, ref: inst.id };
  if (typeof ref === "object") {
    var slugObj = ref.slug || ref.item || null;
    return { slug: slugObj, inst: null, ref: slugObj };
  }
  return { slug: ref, inst: null, ref: ref };
}

function forgeItemTier(p, ref) {
  ensureForge(p);
  var r = forgeResolveRef(p, ref);
  if (r.inst) return itemInstanceTier(r.inst);
  return p.forge[r.slug] || 0;
}

function forgeSetItemTier(p, ref, tier) {
  ensureForge(p);
  tier = Number(tier || 0);
  var r = forgeResolveRef(p, ref);
  if (r.inst) {
    r.inst.tier = tier;
    return;
  }
  if (tier > 0) p.forge[r.slug] = tier;
  else delete p.forge[r.slug];
}

function forgeBagCount(p, slug) {
  ensureForge(p);
  return p && p.bag && p.bag[slug] ? p.bag[slug] : 0;
}

function forgeBagInstanceRefs(p, slug, tier) {
  ensureForge(p);
  if (typeof bagItemInstances !== "function") return [];
  return bagItemInstances(p, slug)
    .filter(function(inst) { return tier === undefined || itemInstanceTier(inst) === tier; })
    .map(function(inst) { return inst.id; });
}

function forgeDepotCount(p, slug) {
  ensureForge(p);
  var n = 0;
  for (var i = 0; i < p.depot.length; i++) {
    if (forgeStoredSlug(p, p.depot[i]) === slug) n++;
  }
  return n;
}

function forgeExaCount(p, slug) {
  ensureForge(p);
  var n = 0;
  for (var i = 0; i < p.exaltationBox.length; i++) {
    if (forgeStoredSlug(p, p.exaltationBox[i]) === slug) n++;
  }
  return n;
}

function forgeStoredSlug(p, entry) {
  if (!entry) return null;
  var r = forgeResolveRef(p, entry);
  return r.slug;
}

function forgeEntryLabel(slug) {
  return (typeof itemName === "function") ? itemName(slug) : ((GAMEDATA.items[slug] && GAMEDATA.items[slug].n) || slug);
}

function forgeHasImbuementOnEquippedRef(p, ref) {
  if (!p || !p.equip || !p.imbuements) return false;
  var resolved = forgeResolveRef(p, ref);
  for (var i = 0; i < SLOTS.length; i++) {
    var slot = SLOTS[i];
    var eq = p.equip[slot];
    if (!eq) continue;
    if (resolved.inst && eq.instId !== resolved.inst.id) continue;
    if (!resolved.inst && eq.item !== resolved.slug) continue;
    var instId = eq.instId || null;
    var key = instId ? "inst:" + instId : "equip:" + slot;
    if (p.imbuements[key] && p.imbuements[key].length) return true;
  }
  return false;
}

function forgeItemSummary(p, ref) {
  ensureForge(p);
  var resolved = forgeResolveRef(p, ref);
  var slug = resolved.slug;
  var it = GAMEDATA.items[slug];
  if (!it || !forgeIsEligibleItem(slug)) return null;
  var tier = forgeItemTier(p, resolved.ref);
  return {
    ref: resolved.ref,
    instanceId: resolved.inst ? resolved.inst.id : null,
    inst: resolved.inst,
    slug: slug,
    item: slug,
    name: forgeEntryLabel(slug),
    cls: it.cls || 0,
    slot: it.s,
    maxTier: forgeMaxTierForSlug(slug),
    tier: tier,
    bagCount: forgeBagCount(p, slug),
    bagSameTierRefs: forgeBagInstanceRefs(p, slug, tier),
    depotCount: forgeDepotCount(p, slug),
    exaltationCount: forgeExaCount(p, slug),
    hasImbue: forgeHasImbuementOnEquippedRef(p, resolved.ref),
    inBag: !!(resolved.inst && resolved.inst.loc === "bag"),
  };
}

function forgeCanUpgrade(p, slug) {
  /* Compat legado: hoje o "upgrade" é a FUSION. */
  return forgeCanFuse(p, slug, false);
}

function forgeFindFusionPartner(p, ref) {
  var info = forgeItemSummary(p, ref);
  if (!info || !info.instanceId) return null;
  var peers = forgeBagInstanceRefs(p, info.slug, info.tier).filter(function(id) { return id !== info.instanceId; });
  return peers.length ? peers[0] : null;
}

function forgeCanFuse(p, ref, useCore) {
  ensureForge(p);
  var info = forgeItemSummary(p, ref);
  if (!info) return { ok: false, msg: "Item não pode ser usado na Exaltation Forge." };
  if (!info.inBag || !info.instanceId) return { ok: false, msg: "Selecione um item físico da mochila para fundir." };
  if (info.hasImbue) return { ok: false, msg: "Remova os imbuements do item equipado antes de forjar." };
  var partnerId = forgeFindFusionPartner(p, info.ref);
  if (!partnerId) return { ok: false, msg: "A fusão precisa de 2 itens iguais e com o mesmo tier na mochila." };
  if (info.tier >= info.maxTier) return { ok: false, msg: "Tier máximo (T" + info.maxTier + ") atingido." };

  var gold = forgeFusionGoldCost(info.slug, info.tier);
  if (!gold) return { ok: false, msg: "Custo de fusão não definido para este tier/classificação." };
  if (p.gold < gold) return { ok: false, msg: "Faltam " + fmtFull(gold - p.gold) + " gp." };
  if ((p.dust || 0) < FORGE_FUSION.dustCost) return { ok: false, msg: "Faltam " + (FORGE_FUSION.dustCost - (p.dust || 0)) + " Dust." };
  if (useCore && (p.exaltedCores || 0) < 1) return { ok: false, msg: "Falta 1 Exalted Core." };

  return {
    ok: true,
    info: info,
    partnerId: partnerId,
    current: info.tier,
    next: info.tier + 1,
    gold: gold,
    dust: FORGE_FUSION.dustCost,
    useCore: !!useCore,
    successPct: useCore ? FORGE_FUSION.successPctCore : FORGE_FUSION.successPct,
  };
}

function forgeFuse(p, ref, useCore) {
  var chk = forgeCanFuse(p, ref, useCore);
  if (!chk.ok) return chk;

  p.gold -= chk.gold;
  p.dust -= chk.dust;
  if (chk.useCore) p.exaltedCores -= 1;

  var target = findItemInstance(p, chk.info.instanceId);
  var partner = findItemInstance(p, chk.partnerId);
  if (!target || !partner) return { ok: false, msg: "Os itens selecionados não estão mais disponíveis." };

  var roll = Math.random() * 100;
  var success = roll < chk.successPct;
  if (success) {
    target.tier = chk.next;
    deleteItemInstance(p, partner.id);
    return {
      ok: true,
      success: true,
      tier: chk.next,
      msg: "Fusão bem-sucedida! " + forgeEntryLabel(chk.info.slug) + " agora é T" + chk.next + ". (" + chk.successPct + "% / roll " + Math.round(roll) + ")",
    };
  }

  if (chk.current <= 0) {
    var saved = chk.useCore && Math.random() < (FORGE_FUSION.failPenaltyProtectPct / 100);
    if (!saved) deleteItemInstance(p, partner.id);
    return {
      ok: true,
      success: false,
      tier: chk.current,
      msg: saved
        ? "A fusão falhou, mas o Exalted Core protegeu a perda do segundo item."
        : "A fusão falhou e o segundo item foi perdido.",
    };
  }

  var protectedTier = chk.useCore && Math.random() < (FORGE_FUSION.failPenaltyProtectPct / 100);
  if (!protectedTier) partner.tier = Math.max(0, chk.current - 1);
  return {
    ok: true,
    success: false,
    tier: chk.current,
    msg: protectedTier
      ? "A fusão falhou, mas o Exalted Core evitou a perda de tier do segundo item."
      : (forgeEntryLabel(chk.info.slug) + " falhou; o segundo item caiu para T" + Math.max(0, chk.current - 1) + "."),
  };
}

function forgeAttempt(p, ref) {
  return forgeFuse(p, ref, false);
}

function forgeTransferTargets(p, donorRef) {
  ensureForge(p);
  var donor = forgeItemSummary(p, donorRef);
  if (!donor || donor.tier < 2) return [];
  return forgeBagItems(p).filter(function(e) {
    return e.instanceId && e.instanceId !== donor.instanceId && e.cls === donor.cls && e.currentTier <= 0;
  });
}

function forgeCanTransfer(p, donorRef, targetRef) {
  ensureForge(p);
  var donor = forgeItemSummary(p, donorRef);
  var target = forgeItemSummary(p, targetRef);
  if (!donor || !target) return { ok: false, msg: "Selecione um item doador e um alvo válidos." };
  if (!donor.instanceId || !target.instanceId || !donor.inBag || !target.inBag) return { ok: false, msg: "Doador e alvo precisam estar fisicamente na mochila." };
  if (donor.hasImbue || target.hasImbue) return { ok: false, msg: "Itens equipados com imbuement não podem participar da transferência." };
  if (donor.instanceId === target.instanceId) return { ok: false, msg: "A transferência precisa de dois itens distintos." };
  if (donor.cls !== target.cls) return { ok: false, msg: "Os itens precisam ter a mesma classificação." };
  if (donor.tier < 2) return { ok: false, msg: "O item doador precisa ser no mínimo T2." };
  if (target.tier > 0) return { ok: false, msg: "O item alvo precisa estar sem tier." };

  var gold = forgeTransferGoldCost(donor.slug, donor.tier);
  if (!gold) return { ok: false, msg: "Custo de transferência não definido para este item." };
  if (p.gold < gold) return { ok: false, msg: "Faltam " + fmtFull(gold - p.gold) + " gp." };
  if ((p.dust || 0) < FORGE_TRANSFER.dustCost) return { ok: false, msg: "Faltam " + (FORGE_TRANSFER.dustCost - (p.dust || 0)) + " Dust." };
  if ((p.exaltedCores || 0) < FORGE_TRANSFER.coreCost) return { ok: false, msg: "Falta 1 Exalted Core." };

  return {
    ok: true,
    donor: donor,
    target: target,
    resultTier: donor.tier - 1,
    gold: gold,
    dust: FORGE_TRANSFER.dustCost,
    cores: FORGE_TRANSFER.coreCost,
  };
}

function forgeTransfer(p, donorRef, targetRef) {
  var chk = forgeCanTransfer(p, donorRef, targetRef);
  if (!chk.ok) return chk;

  p.gold -= chk.gold;
  p.dust -= chk.dust;
  p.exaltedCores -= chk.cores;
  var donorInst = findItemInstance(p, chk.donor.instanceId);
  var targetInst = findItemInstance(p, chk.target.instanceId);
  if (!donorInst || !targetInst) return { ok: false, msg: "Os itens selecionados não estão mais disponíveis." };
  targetInst.tier = chk.resultTier;
  deleteItemInstance(p, donorInst.id);

  return {
    ok: true,
    tier: chk.resultTier,
    msg: "Transferência concluída! " + forgeEntryLabel(chk.target.slug) + " recebeu T" + chk.resultTier + ".",
  };
}

function forgeConvergenceDustToSlivers(p) {
  ensureForge(p);
  if ((p.dust || 0) < FORGE_CONVERGENCE.dustToSlivers.dust) {
    return { ok: false, msg: "Precisa de " + FORGE_CONVERGENCE.dustToSlivers.dust + " Dust." };
  }
  p.dust -= FORGE_CONVERGENCE.dustToSlivers.dust;
  p.slivers += FORGE_CONVERGENCE.dustToSlivers.slivers;
  return { ok: true, msg: "+" + FORGE_CONVERGENCE.dustToSlivers.slivers + " Slivers criados." };
}

function forgeConvergenceSliversToCore(p) {
  ensureForge(p);
  if ((p.slivers || 0) < FORGE_CONVERGENCE.sliversToCore.slivers) {
    return { ok: false, msg: "Precisa de " + FORGE_CONVERGENCE.sliversToCore.slivers + " Slivers." };
  }
  p.slivers -= FORGE_CONVERGENCE.sliversToCore.slivers;
  p.exaltedCores += FORGE_CONVERGENCE.sliversToCore.cores;
  return { ok: true, msg: "+1 Exalted Core criado." };
}

function forgeDustLimitCost(p) {
  ensureForge(p);
  if ((p.dustLimit || 100) >= 325) return 0;
  return Math.max(1, p.dustLimit - 75);
}

function forgeIncreaseDustLimit(p) {
  ensureForge(p);
  if (p.dustLimit >= 325) return { ok: false, msg: "Dust limit já está no máximo (325)." };
  var cost = forgeDustLimitCost(p);
  if (p.dust < cost) return { ok: false, msg: "Precisa de " + cost + " Dust para aumentar o limite." };
  p.dust -= cost;
  p.dustLimit += 1;
  return { ok: true, msg: "Dust limit aumentado para " + p.dustLimit + "." };
}

function forgeGainDust(p, amount) {
  ensureForge(p);
  amount = Math.max(0, Math.floor(amount || 0));
  if (!amount) return { gained: 0, overflow: 0, total: p.dust };
  var cap = Math.max(0, p.dustLimit - p.dust);
  var gained = Math.min(cap, amount);
  var overflow = Math.max(0, amount - gained);
  p.dust += gained;
  return { gained: gained, overflow: overflow, total: p.dust };
}

/* Compat com o sistema antigo. */
function dustFuse(p) {
  return forgeConvergenceDustToSlivers(p);
}

function dustToCore(p) {
  return forgeConvergenceSliversToCore(p);
}

/* ---------- Depot ---------- */

function forgeFindContainerIndex(p, arr, ref) {
  var idx = arr.indexOf(ref);
  if (idx >= 0) return idx;
  var slug = forgeStoredSlug(p, ref);
  for (var i = 0; i < arr.length; i++) if (forgeStoredSlug(p, arr[i]) === slug) return i;
  return -1;
}

function depotStore(p, ref) {
  ensureForge(p);
  if (p.depot.length >= 30) return { ok: false, msg: "Depot cheio (30 slots)." };
  var resolved = forgeResolveRef(p, ref);
  var slug = resolved.slug;
  if (!slug) return { ok: false, msg: "Item não encontrado." };

  if (resolved.inst && resolved.inst.loc === "bag") {
    resolved.inst.loc = "depot";
    p.depot.push(resolved.inst.id);
    if (typeof syncBagCountsFromInstances === "function") syncBagCountsFromInstances(p);
    return { ok: true, msg: forgeEntryLabel(slug) + " guardado no Depot." };
  }
  if (forgeBagCount(p, slug) > 0) {
    removeItem(p, slug, 1);
    p.depot.push(slug);
    return { ok: true, msg: forgeEntryLabel(slug) + " guardado no Depot." };
  }

  for (var i = 0; i < SLOTS.length; i++) {
    var slot = SLOTS[i];
    if (!p.equip[slot] || p.equip[slot].item !== slug) continue;
    if (p.equip[slot].instId && typeof takeEquippedItemInstance === "function") {
      var inst = takeEquippedItemInstance(p, slot);
      inst.loc = "depot";
      p.depot.push(inst.id);
    } else {
      delete p.equip[slot];
      p.depot.push(slug);
    }
    return { ok: true, msg: forgeEntryLabel(slug) + " guardado no Depot." };
  }

  return { ok: false, msg: "Item não encontrado na mochila nem equipado." };
}

function depotRetrieve(p, ref) {
  ensureForge(p);
  var idx = forgeFindContainerIndex(p, p.depot, ref);
  if (idx < 0) return { ok: false, msg: "Item não está no depot." };
  var entry = p.depot[idx];
  var resolved = forgeResolveRef(p, entry);
  if (resolved.inst) {
    if (!putBagItemInstance(p, resolved.inst)) return { ok: false, msg: "Mochila cheia." };
  } else if (!addItem(p, resolved.slug, 1)) return { ok: false, msg: "Mochila cheia." };
  p.depot.splice(idx, 1);
  return { ok: true, msg: forgeEntryLabel(resolved.slug) + " retirado do Depot." };
}

function depotEquip(p, ref) {
  ensureForge(p);
  var idx = forgeFindContainerIndex(p, p.depot, ref);
  if (idx < 0) return { ok: false, msg: "Item não está no depot." };
  var entry = p.depot[idx];
  var resolved = forgeResolveRef(p, entry);
  var slug = resolved.slug;
  var it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Item não pode ser equipado." };
  if (typeof canEquipItem === "function") {
    var chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) return { ok: false, msg: chk.msg };
  }

  p.depot.splice(idx, 1);
  var old = p.equip[it.s];
  if (old) {
    if (p.depot.length >= 30) {
      p.depot.splice(idx, 0, entry);
      return { ok: false, msg: "Depot cheio para guardar o item antigo." };
    }
    if (old.instId && typeof takeEquippedItemInstance === "function") {
      var oldInst = takeEquippedItemInstance(p, it.s);
      oldInst.loc = "depot";
      p.depot.push(oldInst.id);
    } else {
      p.depot.push(old.item);
    }
  }

  if (resolved.inst) {
    resolved.inst.loc = "equip:" + it.s;
    p.equip[it.s] = { item: slug, count: 1, instId: resolved.inst.id };
  } else {
    p.equip[it.s] = { item: slug, count: 1 };
  }
  if (typeof syncBagCountsFromInstances === "function") syncBagCountsFromInstances(p);

  if (it.th && p.equip.shield) {
    var shield = p.equip.shield;
    if ((GAMEDATA.items[shield.item] || {}).t !== "quiver") {
      if (p.depot.length >= 30) return { ok: false, msg: "Depot cheio para guardar o escudo removido." };
      if (shield.instId && typeof takeEquippedItemInstance === "function") {
        var shInst = takeEquippedItemInstance(p, "shield");
        shInst.loc = "depot";
        p.depot.push(shInst.id);
      } else {
        p.depot.push(shield.item);
        delete p.equip.shield;
      }
    }
  }

  return { ok: true, msg: forgeEntryLabel(slug) + " equipado." };
}

/* ---------- Exaltation Box legada ---------- */

function exaltationRetrieve(p, ref) {
  ensureForge(p);
  var idx = forgeFindContainerIndex(p, p.exaltationBox, ref);
  if (idx < 0) return { ok: false, msg: "Item não está na Exaltation Box legada." };
  var entry = p.exaltationBox[idx];
  var resolved = forgeResolveRef(p, entry);
  if (resolved.inst) {
    if (!putBagItemInstance(p, resolved.inst)) return { ok: false, msg: "Mochila cheia." };
  } else if (!addItem(p, resolved.slug, 1)) return { ok: false, msg: "Mochila cheia." };
  p.exaltationBox.splice(idx, 1);
  return { ok: true, msg: forgeEntryLabel(resolved.slug) + " retirado da Exaltation Box legada." };
}

function exaltationEquip(p, ref) {
  ensureForge(p);
  var idx = forgeFindContainerIndex(p, p.exaltationBox, ref);
  if (idx < 0) return { ok: false, msg: "Item não está na Exaltation Box legada." };
  var entry = p.exaltationBox[idx];
  var resolved = forgeResolveRef(p, entry);
  var slug = resolved.slug;
  var it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Item não pode ser equipado." };
  if (typeof canEquipItem === "function") {
    var chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) return { ok: false, msg: chk.msg };
  }
  p.exaltationBox.splice(idx, 1);
  var old = p.equip[it.s];
  if (old) {
    if (old.instId && typeof takeEquippedItemInstance === "function") {
      var oldInst = takeEquippedItemInstance(p, it.s);
      if (!putBagItemInstance(p, oldInst)) {
        p.exaltationBox.splice(idx, 0, entry);
        return { ok: false, msg: "Mochila cheia para receber o item antigo." };
      }
    } else if (!addItem(p, old.item, 1)) {
      p.exaltationBox.splice(idx, 0, entry);
      return { ok: false, msg: "Mochila cheia para receber o item antigo." };
    }
  }
  if (resolved.inst) {
    resolved.inst.loc = "equip:" + it.s;
    p.equip[it.s] = { item: slug, count: 1, instId: resolved.inst.id };
  } else {
    p.equip[it.s] = { item: slug, count: 1 };
  }
  if (it.th && p.equip.shield) {
    if (p.equip.shield.instId && typeof takeEquippedItemInstance === "function") {
      var shInst = takeEquippedItemInstance(p, "shield");
      if (!putBagItemInstance(p, shInst)) {
        p.equip[it.s] = old || undefined;
        p.exaltationBox.splice(idx, 0, entry);
        return { ok: false, msg: "Mochila cheia para receber o escudo antigo." };
      }
    } else if (!addItem(p, p.equip.shield.item, 1)) {
      p.equip[it.s] = old || undefined;
      p.exaltationBox.splice(idx, 0, entry);
      return { ok: false, msg: "Mochila cheia para receber o escudo antigo." };
    } else {
      delete p.equip.shield;
    }
  }
  return { ok: true, msg: forgeEntryLabel(slug) + " equipado da Exaltation Box legada." };
}

/* ---------- Efeitos oficiais ---------- */

function forgeBootAmplificationPct(p) {
  ensureForge(p);
  var eq = p.equip && p.equip.boots;
  if (!eq) return 0;
  var tier = forgeItemTier(p, eq.instId || eq.item);
  return tier ? forgeAmplificationImpactForTier(tier) : 0;
}

function forgeProcChanceForEquipped(p, slot) {
  ensureForge(p);
  var eq = p.equip && p.equip[slot];
  if (!eq) return 0;
  // Procs só leem o tier da INSTÂNCIA equipada. Isso bloqueia tiers
  // legados por slug (p.forge) de vazarem para outro item/personagem.
  if (!eq.instId) return 0;
  var tier = forgeItemTier(p, eq.instId);
  if (!tier) return 0;
  var base = forgeBaseChanceForSlotTier(slot, tier);
  if (!base) return 0;
  if (slot === "boots") return base;
  return forgeAmplifiedChance(base, forgeBootAmplificationPct(p));
}

function forgeTryRuse(p) {
  var chance = forgeProcChanceForEquipped(p, "armor");
  if (!chance) return null;
  if (Math.random() * 100 >= chance) return null;
  return { ok: true, chance: chance };
}

function forgeTryOnslaught(p) {
  var chance = forgeProcChanceForEquipped(p, "weapon");
  if (!chance) return null;
  if (Math.random() * 100 >= chance) return null;
  return { ok: true, chance: chance, bonusPct: 60 };
}

function forgeReduceMomentumCooldowns(p, amountMs, now) {
  now = now || Date.now();
  if (typeof cdInit === "function") cdInit(p);
  if (p.cd) {
    for (var id in p.cd) {
      if (!p.cd[id] || !p.cd[id].ate) continue;
      p.cd[id].ate = Math.max(now, p.cd[id].ate - amountMs);
    }
  }
  /* Tibia global: Momentum reduz o cooldown individual e o grupo secundário,
   * mas não reduz o primary group cooldown. No nosso modelo, 1/2/3 são os
   * grupos secundários clássicos (attack/healing/support). */
  if (p.gcd) {
    ["1", "2", "3"].forEach(function(g) {
      if (!p.gcd[g] || !p.gcd[g].ate) return;
      p.gcd[g].ate = Math.max(now, p.gcd[g].ate - amountMs);
    });
  }
}

function forgeTryMomentum(p, now) {
  ensureForge(p);
  now = now || Date.now();
  var chance = forgeProcChanceForEquipped(p, "helmet");
  if (!chance) return null;
  var meta = p._forgeMeta || (p._forgeMeta = {});
  if (now - (meta.lastMomentumRollAt || 0) < 2000) return null;
  meta.lastMomentumRollAt = now;
  if (Math.random() * 100 >= chance) return null;
  forgeReduceMomentumCooldowns(p, 2000, now);
  return { ok: true, chance: chance, reduced: 2000 };
}

function ensureAvatar(p) {
  p._avatar = p._avatar || {
    active: false,
    started: 0,
    duration: 7000,
    damageTakenMul: 0.85,
    critBonusPct: 15,
  };
  return p._avatar;
}

function avatarTick(p, now) {
  var av = ensureAvatar(p);
  now = now || Date.now();
  if (av.active && now - av.started >= av.duration) {
    av.active = false;
  }
}

function avatarActive(p, now) {
  avatarTick(p, now || Date.now());
  return !!(p && p._avatar && p._avatar.active);
}

function avatarActivate(p, now) {
  var av = ensureAvatar(p);
  now = now || Date.now();
  av.active = true;
  av.started = now;
  return {
    ok: true,
    msg: "Transcendence ativou o Avatar Stage 3 por 7s!",
    reducedDamagePct: 15,
    critBonusPct: av.critBonusPct,
  };
}

function avatarDmgBonus(p) {
  return avatarActive(p) ? 15 : 0;
}

function avatarSpdBonus() {
  return 0;
}

function forgeRegisterOffensiveAction(p, now) {
  ensureForge(p);
  now = now || Date.now();
  p._forgeMeta.lastOffensiveActionAt = now;
}

function forgeTryTranscendence(p, now) {
  ensureForge(p);
  now = now || Date.now();
  var chance = forgeProcChanceForEquipped(p, "legs");
  if (!chance) return null;
  var meta = p._forgeMeta || (p._forgeMeta = {});
  avatarTick(p, now);
  if (avatarActive(p, now)) return null;
  if (now - (meta.lastTransCheckAt || 0) < 2000) return null;
  if (!meta.lastOffensiveActionAt || meta.lastOffensiveActionAt <= (meta.lastTransCheckAt || 0)) return null;
  meta.lastTransCheckAt = now;
  if (Math.random() * 100 >= chance) return null;
  var act = avatarActivate(p, now);
  act.chance = chance;
  return act;
}

function forgeTranscendenceDamagePct(p, now) {
  return avatarActive(p, now) ? (ensureAvatar(p).critBonusPct || 15) : 0;
}

function forgeIncomingDamageMul(p, now) {
  return avatarActive(p, now) ? (ensureAvatar(p).damageTakenMul || 0.85) : 1;
}

function forgeTotals(p) {
  ensureForge(p);
  return {
    ruse: forgeProcChanceForEquipped(p, "armor"),
    momentum: forgeProcChanceForEquipped(p, "helmet"),
    onslaught: forgeProcChanceForEquipped(p, "weapon"),
    transcendence: forgeProcChanceForEquipped(p, "legs"),
    amplification: forgeBootAmplificationPct(p),
    avatarActive: avatarActive(p),
  };
}

function forgeTierClassForValue(tier) {
  if (tier >= 9) return "tier-legendary";
  if (tier >= 7) return "tier-epic";
  if (tier >= 5) return "tier-rare";
  if (tier >= 1) return "tier-forged";
  return "";
}

function forgeTierTextForInstance(instId) {
  if (!G.p) return "";
  var tier = forgeItemTier(G.p, instId);
  return tier > 0 ? ("T" + tier) : "";
}

function forgeTierTextForEntry(entry) {
  if (!entry) return "";
  return entry.instId ? forgeTierTextForInstance(entry.instId) : forgeTierText(entry.item);
}

function forgeTierText(slug) {
  if (!G.p) return "";
  var tier = forgeItemTier(G.p, slug) || 0;
  return tier > 0 ? ("T" + tier) : "";
}

function forgeTierClassForEntry(entry) {
  if (!entry) return "";
  var tier = entry.instId ? forgeItemTier(G.p, entry.instId) : forgeItemTier(G.p, entry.item);
  return forgeTierClassForValue(tier || 0);
}

function forgeTierClass(slug) {
  if (!G.p) return "";
  return forgeTierClassForValue(forgeItemTier(G.p, slug) || 0);
}

/* Exposto para render.js mostrar o glow do Avatar Stage 3 (Transcendence) */
if (typeof window !== "undefined") {
  window.avatarActive = avatarActive;
}
