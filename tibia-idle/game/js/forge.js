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

function forgeItemTier(p, slug) {
  ensureForge(p);
  return p.forge[slug] || 0;
}

function forgeSetItemTier(p, slug, tier) {
  ensureForge(p);
  tier = Number(tier || 0);
  if (tier > 0) p.forge[slug] = tier;
  else delete p.forge[slug];
}

function forgeBagCount(p, slug) {
  return p && p.bag && p.bag[slug] ? p.bag[slug] : 0;
}

function forgeDepotCount(p, slug) {
  ensureForge(p);
  var n = 0;
  for (var i = 0; i < p.depot.length; i++) {
    if (forgeStoredSlug(p.depot[i]) === slug) n++;
  }
  return n;
}

function forgeExaCount(p, slug) {
  ensureForge(p);
  var n = 0;
  for (var i = 0; i < p.exaltationBox.length; i++) {
    if (forgeStoredSlug(p.exaltationBox[i]) === slug) n++;
  }
  return n;
}

function forgeStoredSlug(entry) {
  if (!entry) return null;
  return typeof entry === "string" ? entry : (entry.slug || entry.item || null);
}

function forgeEntryLabel(slug) {
  return (typeof itemName === "function") ? itemName(slug) : ((GAMEDATA.items[slug] && GAMEDATA.items[slug].n) || slug);
}

function forgeHasImbuementOnEquippedSlug(p, slug) {
  if (!p || !p.equip || !p.imbuements) return false;
  for (var i = 0; i < SLOTS.length; i++) {
    var slot = SLOTS[i];
    var eq = p.equip[slot];
    if (!eq || eq.item !== slug) continue;
    var key = "equip:" + slot;
    if (p.imbuements[key] && p.imbuements[key].length) return true;
  }
  return false;
}

function forgeItemSummary(p, slug) {
  ensureForge(p);
  var it = GAMEDATA.items[slug];
  if (!it || !forgeIsEligibleItem(slug)) return null;
  return {
    slug: slug,
    item: slug,
    name: forgeEntryLabel(slug),
    cls: it.cls || 0,
    slot: it.s,
    maxTier: forgeMaxTierForSlug(slug),
    tier: forgeItemTier(p, slug),
    bagCount: forgeBagCount(p, slug),
    depotCount: forgeDepotCount(p, slug),
    exaltationCount: forgeExaCount(p, slug),
    hasImbue: forgeHasImbuementOnEquippedSlug(p, slug),
  };
}

function forgeCanUpgrade(p, slug) {
  /* Compat legado: hoje o "upgrade" é a FUSION. */
  return forgeCanFuse(p, slug, false);
}

function forgeCanFuse(p, slug, useCore) {
  ensureForge(p);
  var info = forgeItemSummary(p, slug);
  if (!info) return { ok: false, msg: "Item não pode ser usado na Exaltation Forge." };
  if (info.hasImbue) return { ok: false, msg: "Remova os imbuements do item equipado antes de forjar." };
  if (info.bagCount < 2) return { ok: false, msg: "A fusão precisa de 2 itens iguais na mochila." };
  if (info.bagCount > 2) return { ok: false, msg: "Refactor de item instanciado ainda pendente: deixe exatamente 2 cópias na mochila para fundir este item." };
  if (info.tier >= info.maxTier) return { ok: false, msg: "Tier máximo (T" + info.maxTier + ") atingido." };

  var gold = forgeFusionGoldCost(slug, info.tier);
  if (!gold) return { ok: false, msg: "Custo de fusão não definido para este tier/classificação." };
  if (p.gold < gold) return { ok: false, msg: "Faltam " + fmtFull(gold - p.gold) + " gp." };
  if ((p.dust || 0) < FORGE_FUSION.dustCost) return { ok: false, msg: "Faltam " + (FORGE_FUSION.dustCost - (p.dust || 0)) + " Dust." };
  if (useCore && (p.exaltedCores || 0) < 1) return { ok: false, msg: "Falta 1 Exalted Core." };

  return {
    ok: true,
    info: info,
    current: info.tier,
    next: info.tier + 1,
    gold: gold,
    dust: FORGE_FUSION.dustCost,
    useCore: !!useCore,
    successPct: useCore ? FORGE_FUSION.successPctCore : FORGE_FUSION.successPct,
  };
}

function forgeFuse(p, slug, useCore) {
  var chk = forgeCanFuse(p, slug, useCore);
  if (!chk.ok) return chk;

  p.gold -= chk.gold;
  p.dust -= chk.dust;
  if (chk.useCore) p.exaltedCores -= 1;

  /* Consome o item sacrificado. O outro continua na mochila e recebe o resultado. */
  removeItem(p, slug, 1);

  var roll = Math.random() * 100;
  var success = roll < chk.successPct;
  if (success) {
    forgeSetItemTier(p, slug, chk.next);
    return {
      ok: true,
      success: true,
      tier: chk.next,
      msg: "Fusão bem-sucedida! " + forgeEntryLabel(slug) + " agora é T" + chk.next + ". (" + chk.successPct + "% / roll " + Math.round(roll) + ")",
    };
  }

  /* Falha oficial:
   * - em T0, um item quebra; com core a perda cai para 50%;
   * - em T1+, o item restante pode perder 1 tier; com core a perda cai para 50%.
   */
  if (chk.current <= 0) {
    var saved = chk.useCore && Math.random() < (FORGE_FUSION.failPenaltyProtectPct / 100);
    if (saved) addItem(p, slug, 1);
    return {
      ok: true,
      success: false,
      tier: 0,
      msg: saved
        ? "A fusão falhou, mas o Exalted Core protegeu a perda do segundo item."
        : "A fusão falhou e o item sacrificado foi perdido.",
    };
  }

  var protectedTier = chk.useCore && Math.random() < (FORGE_FUSION.failPenaltyProtectPct / 100);
  if (!protectedTier) forgeSetItemTier(p, slug, chk.current - 1);
  return {
    ok: true,
    success: false,
    tier: protectedTier ? chk.current : Math.max(0, chk.current - 1),
    msg: protectedTier
      ? "A fusão falhou, mas o Exalted Core evitou a perda de tier."
      : (forgeEntryLabel(slug) + " perdeu 1 tier e agora está em T" + Math.max(0, chk.current - 1) + "."),
  };
}

function forgeAttempt(p, slug) {
  /* Compat legado para chamadas antigas da UI. */
  return forgeFuse(p, slug, false);
}

function forgeTransferTargets(p, donorSlug) {
  ensureForge(p);
  var donor = forgeItemSummary(p, donorSlug);
  if (!donor || donor.tier < 2) return [];
  var out = [];
  var bag = forgeBagItems(p);
  for (var i = 0; i < bag.length; i++) {
    var e = bag[i];
    if (e.slug === donorSlug) continue;
    if (e.cls !== donor.cls) continue;
    if (e.currentTier > 0) continue;
    if (e.count !== 1) continue;
    out.push(e);
  }
  return out;
}

function forgeCanTransfer(p, donorSlug, targetSlug) {
  ensureForge(p);
  var donor = forgeItemSummary(p, donorSlug);
  var target = forgeItemSummary(p, targetSlug);
  if (!donor || !target) return { ok: false, msg: "Selecione um item doador e um alvo válidos." };
  if (donor.hasImbue || target.hasImbue) return { ok: false, msg: "Itens equipados com imbuement não podem participar da transferência." };
  if (donor.slug === target.slug) return { ok: false, msg: "A transferência precisa de dois itens diferentes." };
  if (donor.cls !== target.cls) return { ok: false, msg: "Os itens precisam ter a mesma classificação." };
  if (donor.tier < 2) return { ok: false, msg: "O item doador precisa ser no mínimo T2." };
  if (target.tier > 0) return { ok: false, msg: "O item alvo precisa estar sem tier." };
  if (donor.bagCount !== 1) return { ok: false, msg: "Deixe exatamente 1 cópia do item doador na mochila." };
  if (target.bagCount !== 1) return { ok: false, msg: "Deixe exatamente 1 cópia do item alvo na mochila." };

  var gold = forgeTransferGoldCost(donorSlug, donor.tier);
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

function forgeTransfer(p, donorSlug, targetSlug) {
  var chk = forgeCanTransfer(p, donorSlug, targetSlug);
  if (!chk.ok) return chk;

  p.gold -= chk.gold;
  p.dust -= chk.dust;
  p.exaltedCores -= chk.cores;
  removeItem(p, donorSlug, 1);
  forgeSetItemTier(p, donorSlug, 0);
  forgeSetItemTier(p, targetSlug, chk.resultTier);

  return {
    ok: true,
    tier: chk.resultTier,
    msg: "Transferência concluída! " + forgeEntryLabel(targetSlug) + " recebeu T" + chk.resultTier + ".",
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

/* Compat com o sistema antigo. */
function dustFuse(p) {
  return forgeConvergenceDustToSlivers(p);
}

function dustToCore(p) {
  return forgeConvergenceSliversToCore(p);
}

/* ---------- Depot ---------- */

function depotStore(p, slug) {
  ensureForge(p);
  if (p.depot.length >= 30) return { ok: false, msg: "Depot cheio (30 slots)." };

  if (forgeBagCount(p, slug) > 0) {
    removeItem(p, slug, 1);
    p.depot.push(slug);
    return { ok: true, msg: forgeEntryLabel(slug) + " guardado no Depot." };
  }

  for (var i = 0; i < SLOTS.length; i++) {
    var slot = SLOTS[i];
    if (p.equip[slot] && p.equip[slot].item === slug) {
      delete p.equip[slot];
      p.depot.push(slug);
      return { ok: true, msg: forgeEntryLabel(slug) + " guardado no Depot." };
    }
  }

  return { ok: false, msg: "Item não encontrado na mochila nem equipado." };
}

function depotRetrieve(p, slug) {
  ensureForge(p);
  var idx = p.depot.indexOf(slug);
  if (idx < 0) return { ok: false, msg: "Item não está no depot." };
  if (!addItem(p, slug, 1)) return { ok: false, msg: "Mochila cheia." };
  p.depot.splice(idx, 1);
  return { ok: true, msg: forgeEntryLabel(slug) + " retirado do Depot." };
}

function depotEquip(p, slug) {
  ensureForge(p);
  var it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Item não pode ser equipado." };
  if (typeof canEquipItem === "function") {
    var chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) return { ok: false, msg: chk.msg };
  }

  var idx = p.depot.indexOf(slug);
  if (idx < 0) return { ok: false, msg: "Item não está no depot." };
  p.depot.splice(idx, 1);

  var old = p.equip[it.s];
  if (old) {
    if (p.depot.length >= 30) {
      p.depot.splice(idx, 0, slug);
      return { ok: false, msg: "Depot cheio para guardar o item antigo." };
    }
    p.depot.push(old.item);
  }

  p.equip[it.s] = { item: slug, count: 1 };
  if (it.th && p.equip.shield) {
    if (p.depot.length >= 30) {
      delete p.equip[it.s];
      p.equip[it.s] = old;
      p.depot.splice(p.depot.indexOf(old.item), 1);
      p.depot.splice(idx, 0, slug);
      return { ok: false, msg: "Depot cheio para guardar o escudo removido." };
    }
    p.depot.push(p.equip.shield.item);
    delete p.equip.shield;
  }

  return { ok: true, msg: forgeEntryLabel(slug) + " equipado." };
}

/* ---------- Exaltation Box legada ---------- */

function exaltationRetrieve(p, slug) {
  ensureForge(p);
  var idx = -1;
  for (var i = 0; i < p.exaltationBox.length; i++) {
    if (forgeStoredSlug(p.exaltationBox[i]) === slug) { idx = i; break; }
  }
  if (idx < 0) return { ok: false, msg: "Item não está na Exaltation Box legada." };
  if (!addItem(p, slug, 1)) return { ok: false, msg: "Mochila cheia." };
  p.exaltationBox.splice(idx, 1);
  return { ok: true, msg: forgeEntryLabel(slug) + " retirado da Exaltation Box legada." };
}

function exaltationEquip(p, slug) {
  ensureForge(p);
  var it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Item não pode ser equipado." };
  if (typeof canEquipItem === "function") {
    var chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) return { ok: false, msg: chk.msg };
  }
  var idx = -1;
  for (var i = 0; i < p.exaltationBox.length; i++) {
    if (forgeStoredSlug(p.exaltationBox[i]) === slug) { idx = i; break; }
  }
  if (idx < 0) return { ok: false, msg: "Item não está na Exaltation Box legada." };
  p.exaltationBox.splice(idx, 1);
  var old = p.equip[it.s];
  if (old) {
    if (!addItem(p, old.item, 1)) {
      p.exaltationBox.splice(idx, 0, slug);
      return { ok: false, msg: "Mochila cheia para receber o item antigo." };
    }
  }
  p.equip[it.s] = { item: slug, count: 1 };
  if (it.th && p.equip.shield) {
    if (!addItem(p, p.equip.shield.item, 1)) {
      p.equip[it.s] = old || undefined;
      p.exaltationBox.splice(idx, 0, slug);
      return { ok: false, msg: "Mochila cheia para receber o escudo antigo." };
    }
    delete p.equip.shield;
  }
  return { ok: true, msg: forgeEntryLabel(slug) + " equipado da Exaltation Box legada." };
}

/* ---------- Efeitos oficiais ---------- */

function forgeProcChanceForEquipped(p, slot) {
  ensureForge(p);
  var eq = p.equip && p.equip[slot];
  if (!eq) return 0;
  var tier = forgeItemTier(p, eq.item);
  if (!tier) return 0;
  var ef = FORGE_EFFECTS[slot];
  return ef ? ef.procChance(tier) : 0;
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
  return { ok: true, chance: chance, multiplier: 1.6 };
}

function forgeReduceAllCooldowns(p, amountMs, now) {
  now = now || Date.now();
  if (typeof cdInit === "function") cdInit(p);
  if (p.cd) {
    for (var id in p.cd) {
      if (!p.cd[id] || !p.cd[id].ate) continue;
      p.cd[id].ate = Math.max(now, p.cd[id].ate - amountMs);
    }
  }
  if (p.gcd) {
    for (var g in p.gcd) {
      if (!p.gcd[g] || !p.gcd[g].ate) continue;
      p.gcd[g].ate = Math.max(now, p.gcd[g].ate - amountMs);
    }
  }
}

function forgeTryMomentum(p, now) {
  ensureForge(p);
  now = now || Date.now();
  var chance = forgeProcChanceForEquipped(p, "helmet");
  if (!chance) return null;
  var meta = p._forgeMeta || (p._forgeMeta = { lastMomentumRollAt: 0 });
  if (now - (meta.lastMomentumRollAt || 0) < 2000) return null;
  meta.lastMomentumRollAt = now;
  if (Math.random() * 100 >= chance) return null;
  forgeReduceAllCooldowns(p, 2000, now);
  return { ok: true, chance: chance, reduced: 2000 };
}

function forgeTotals(p) {
  ensureForge(p);
  return {
    ruse: forgeProcChanceForEquipped(p, "armor"),
    momentum: forgeProcChanceForEquipped(p, "helmet"),
    onslaught: forgeProcChanceForEquipped(p, "weapon"),
  };
}

function forgeTierText(slug) {
  if (!G.p || !G.p.forge) return "";
  var tier = G.p.forge[slug] || 0;
  return tier > 0 ? ("T" + tier) : "";
}

function forgeTierClass(slug) {
  if (!G.p || !G.p.forge) return "";
  var tier = G.p.forge[slug] || 0;
  if (tier >= 9) return "tier-legendary";
  if (tier >= 7) return "tier-epic";
  if (tier >= 5) return "tier-rare";
  if (tier >= 1) return "tier-forged";
  return "";
}

/* ---------- Avatar legado (mantido como no-op/compat) ---------- */
function ensureAvatar(p) { return p; }
function avatarActivate() { return { ok: false, msg: "Avatar/Transcendence foi removido da Forge oficial." }; }
function avatarTick() {}
function avatarDmgBonus() { return 0; }
function avatarSpdBonus() { return 0; }
function avatarActive() { return false; }
