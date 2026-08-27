/*
 * accessories.js — helper de rings/amulets, drag & drop de itens e magic shield.
 *
 * Regras implementadas para aproximar o painel do Baiak Idle:
 *  - Amuleto e anel possuem item PADRÃO e EMERGENCIAL.
 *  - Quando o HP cai abaixo do limite, equipa o emergencial.
 *  - Quando o HP recupera acima do limite, devolve para o padrão.
 *  - Os itens podem estar na mochila ou na Loot Pouch.
 *  - Energy Ring aplica Magic Shield global: dano entra na mana antes da vida.
 */
"use strict";

const ITEM_DRAG_TYPE = "application/x-tibia-idle-item";
const MAGIC_SHIELD_SPELL_ID = "utamo-vita";
/* Time-chargeables: 1 carga a cada 3s (Canary duration(s) → charges). */
const ACCESSORY_CHARGE_MS = 3000;
const ACCESSORY_TIME_SLOTS = ["ring", "amulet", "boots"];
// Duração oficial (Update 12.55): 60s (antes era 200s). O shield moderno
// absorve uma CAPACIDADE limitada de dano baseada em level/magic level.
const MAGIC_SHIELD_DURATION_MS = 60 * 1000;
// Canary: Magic Shield Potion (id 35563) aplica o mesmo CONDITION_MANASHIELD
// do utamo vita, NÃO gasta o CD da magia e NÃO entra no exhaustion de 1s
// das potions de HP/mana (PR #3393). No idle o custo é 50k gp e o CD
// próprio é 15s — emergência cara, não substituto do utamo vita.
const MAGIC_SHIELD_POTION_COST = 50000;
const MAGIC_SHIELD_POTION_CD_MS = 15 * 1000;
const MAGIC_SHIELD_POTION_LVL = 14;

const HELPER_EQUIP_UI = { slot: "amulet" };
/* Modal picker (Baiak-style): kind = "emergency" | "normal". */
const HELPER_EQUIP_PICKER = { kind: null, busca: "" };
const ACCESSORY_CLS_LABEL = {
  2: { text: "incomum", color: "#6a8ad8" },
  3: { text: "raro", color: "#b870d8" },
  4: { text: "boss", color: "#d4af37" },
};

/* --------------------------------------------------------- dados/patches */
function patchAccessoryItems() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  const er = GAMEDATA.items["energy-ring"];
  if (er) {
    er.manaShield = 1;
    er.magicShield = 1;
    delete er.shield;
    // Regra do dono: KNIGHT NÃO pode equipar energy ring — só Monk e RP
    // (royal paladin). A restrição vive no accessorydata (vocs); aqui só
    // garante que o item não fique sem ela (saves/patches antigos).
    er.vocs = ["monk", "exalted monk", "paladin", "royal paladin"];
    if (!er.charges) er.charges = 200;
    if (!er.chargeMode) er.chargeMode = "time";
    if (!er.desc) er.desc = "Magic Shield: dano recebido consome mana antes da vida.";
  }
}
patchAccessoryItems();

/* ----------------------------------------------------------------------
 * SISTEMA DE CARGAS de anéis/amuletos (pedido do dono)
 * ----------------------------------------------------------------------
 * - `chargeMode: "time"`  -> 1 carga a cada 3s ENQUANTO EQUIPADO
 * - `chargeMode: "hits"`  -> 1 carga POR GOLPE recebido
 * - carga zera -> DESTROI só o item equipado (não as cópias na bag/stash)
 * - CHEIOS empilham; PARCIAIS são instâncias isoladas (sem ledger por slug)
 * - `p.ringCharges[slug]` é legado: consumido UMA vez no próximo equip e limpo
 * ---------------------------------------------------------------------- */

function accessoryChargesLedger(p) {
  if (!p.ringCharges || typeof p.ringCharges !== "object") p.ringCharges = {};
  return p.ringCharges;
}

function accessoryDef(p, slug) {
  return (typeof GAMEDATA !== "undefined" && GAMEDATA.items) ? GAMEDATA.items[slug] : null;
}

/* Cargas ao equipar: prioridade instância > legado ringCharges (1×) > cheio. */
function accessoryChargesOnEquip(p, slug, fromInst) {
  const it = accessoryDef(p, slug);
  if (!it || !it.charges) return null;
  if (fromInst && fromInst.charges !== undefined && fromInst.charges !== null) {
    return Math.min(it.charges, Math.max(0, Math.floor(Number(fromInst.charges) || 0)));
  }
  const ledger = accessoryChargesLedger(p);
  const resto = parseInt(ledger[slug], 10);
  if (resto > 0) {
    // Consome o saldo legado UMA vez — não aplica às outras cópias.
    delete ledger[slug];
    return Math.min(resto, it.charges);
  }
  return it.charges;
}

/* Legado: só grava se ainda não migrámos para instâncias parciais. */
function rememberAccessoryCharges(p, slug, charges) {
  if (!slug || charges === undefined || charges === null) return;
  // Chargeables stackáveis: NÃO usam ledger compartilhado (evita conflito).
  if (typeof isChargeStackableAccessory === "function" && isChargeStackableAccessory(slug)) return;
  const ledger = accessoryChargesLedger(p);
  if (parseInt(charges, 10) > 0) ledger[slug] = parseInt(charges, 10);
  else delete ledger[slug];
}

/* Drena 1 carga por golpe recebido (might ring). Chamado do applyPlayerResist. */
function consumeAccessoryHitCharge(p) {
  if (!p || !p.equip) return;
  for (const slot of ["ring", "amulet"]) {
    const e = p.equip[slot];
    if (!e || !e.item) continue;
    const it = accessoryDef(p, e.item);
    if (!it || it.chargeMode !== "hits" || !it.charges) continue;
    if (accessoryConsumeCharge(p, slot)) break;
  }
}

/* Normaliza cargas do slot para inteiro >= 0 (evita NaN preso em 1). */
function accessoryNormalizeCharges(e, it) {
  let n = Math.floor(Number(e.charges));
  if (!Number.isFinite(n)) n = Math.floor(Number(it && it.charges) || 0);
  if (n < 0) n = 0;
  e.charges = n;
  return n;
}

/* Desconta uma carga do item equipado no slot. Devolve true se consumiu. */
function accessoryConsumeCharge(p, slot) {
  const e = p.equip && p.equip[slot];
  if (!e || !e.item) return false;
  const it = accessoryDef(p, e.item);
  if (!it || !it.charges) return false;
  if (e.charges === undefined) e.charges = it.charges;
  if (e.maxCharges === undefined) e.maxCharges = it.charges;
  let n = accessoryNormalizeCharges(e, it);
  n -= 1;
  if (n <= 0) {
    e.charges = 0;
    accessoryBreak(p, slot);
    return true;
  }
  e.charges = n;
  return true;
}

/* O item quebrou (cargas zeraram): DESTROI só esta cópia (equip + instância).
 * Cópias na bag/stash/pouch NÃO são tocadas. Soft boots → worn no slot. */
function accessoryBreak(p, slot) {
  const e = p.equip && p.equip[slot];
  if (!e || !e.item) return;
  const it = accessoryDef(p, e.item);
  const nome = it && it.n ? it.n : e.item;
  const pretty = nome[0].toUpperCase() + nome.slice(1);
  const slug = e.item;
  const instId = e.instId || null;
  const decay = it && (it.decayToSlug || (typeof it.decayTo === "string" ? it.decayTo : ""));
  if (decay && typeof GAMEDATA !== "undefined" && GAMEDATA.items && GAMEDATA.items[decay]) {
    if (instId && typeof deleteItemInstance === "function") deleteItemInstance(p, instId);
    p.equip[slot] = { item: decay, count: 1 };
    if (typeof addLog === "function") {
      addLog("info", `<b style="color:#ff9090">${pretty} se desgastou!</b>`);
    }
    if (typeof toast === "function") toast(`${pretty} se desgastou.`, "bad");
  } else {
    delete p.equip[slot];
    // Remove APENAS a instância equipada — nunca bag[slug]/supplyStash[slug].
    if (instId && typeof deleteItemInstance === "function") deleteItemInstance(p, instId);
    if (typeof addLog === "function") {
      addLog("info", `<b style="color:#ff9090">${pretty} quebrou!</b> (cargas esgotadas)`);
    }
    if (typeof toast === "function") toast(`${pretty} quebrou — cargas esgotadas.`, "bad");
  }
  // Legado: limpa saldo compartilhado deste slug (já não grava parciais novos).
  const ledger = accessoryChargesLedger(p);
  delete ledger[slug];
  if (typeof tryAccessoryHelper === "function") {
    try { tryAccessoryHelper(null, p, Date.now()); } catch (err) { /* segue */ }
  }
  if (typeof save === "function") save();
  if (typeof renderEquip === "function") {
    try { renderEquip(p); } catch (err) { /* UI opcional */ }
  }
  if (typeof renderInventory === "function") {
    try { renderInventory(p); } catch (err) { /* UI opcional */ }
  }
  if (typeof renderSupplyStash === "function") {
    try { renderSupplyStash(p); } catch (err) { /* UI opcional */ }
  }
  if (typeof refreshEquipChargeOverlays === "function") {
    try { refreshEquipChargeOverlays(p); } catch (err) { /* UI opcional */ }
  }
}

/* Tick de cargas por TEMPO (chamado do loop principal e do bg tick):
 * 1 carga a cada 3s. A última carga (1→0) DEVE destruir o item. */
function tickAccessoryCharges(p, dt) {
  if (!p || !p.equip || !(dt > 0)) return;
  for (const slot of ACCESSORY_TIME_SLOTS) {
    const e = p.equip[slot];
    if (!e || !e.item) continue;
    const it = accessoryDef(p, e.item);
    if (!it || !it.charges || it.chargeMode !== "time") continue;
    if (e.charges === undefined) e.charges = it.charges;
    if (e.maxCharges === undefined) e.maxCharges = it.charges;
    let n = accessoryNormalizeCharges(e, it);
    if (n <= 0) {
      accessoryBreak(p, slot);
      continue;
    }
    e._chargeAcc = Math.max(0, Number(e._chargeAcc) || 0) + dt;
    // n > 0: permite entrar com n===1 e sair com n===0 (não trava em 1).
    while (n > 0 && e._chargeAcc >= ACCESSORY_CHARGE_MS) {
      e._chargeAcc -= ACCESSORY_CHARGE_MS;
      n -= 1;
    }
    e.charges = n;
    // Segurança: tempo esgotado (float / acc) também destrói.
    if (n <= 0 || (n * ACCESSORY_CHARGE_MS - e._chargeAcc) <= 0) {
      e.charges = 0;
      e._chargeAcc = 0;
      accessoryBreak(p, slot);
    }
  }
}

/* Tempo restante em ms (time mode): charges*3s menos o acumulador parcial. */
function accessoryRemainingMs(p, slot) {
  const e = p.equip && p.equip[slot];
  if (!e || !e.item) return 0;
  const it = accessoryDef(p, e.item);
  if (!it || !it.charges || it.chargeMode === "hits") return 0;
  const now = e.charges === undefined ? it.charges : Math.max(0, parseInt(e.charges, 10) || 0);
  const acc = Math.max(0, Number(e._chargeAcc) || 0);
  return Math.max(0, now * ACCESSORY_CHARGE_MS - acc);
}

/* Cargas atuais do item equipado (para a UI). */
function accessoryChargesNow(p, slot) {
  const e = p.equip && p.equip[slot];
  if (!e || !e.item) return null;
  const it = accessoryDef(p, e.item);
  if (!it || !it.charges) return null;
  const now = e.charges === undefined ? it.charges : e.charges;
  const max = e.maxCharges || it.charges;
  const mode = it.chargeMode || "time";
  const remMs = mode === "hits" ? 0 : accessoryRemainingMs(p, slot);
  return {
    now: now,
    max: max,
    mode: mode,
    slug: e.item,
    remMs: remMs,
    remSec: Math.max(0, Math.ceil(remMs / 1000)),
  };
}

function ensureAccessoryConfig(p) {
  if (!p.config) p.config = {};
  if (!p.config.equipHelper) p.config.equipHelper = {};
  ["amulet", "ring"].forEach((slot) => {
    const c = p.config.equipHelper[slot] || {};
    p.config.equipHelper[slot] = {
      enabled: c.enabled !== undefined ? !!c.enabled : false,
      emergency: c.emergency || "",
      normal: c.normal || "",
      equipBelow: Math.max(1, Math.min(99, parseInt(c.equipBelow, 10) || 50)),
      restoreAbove: Math.max(1, Math.min(99, parseInt(c.restoreAbove, 10) || 80)),
    };
    if (p.config.equipHelper[slot].restoreAbove < p.config.equipHelper[slot].equipBelow) {
      p.config.equipHelper[slot].restoreAbove = p.config.equipHelper[slot].equipBelow;
    }
  });
  const ms = p.config.magicShield || {};
  const mode = ms.mode || (ms.enabled ? "hp" : "off");
  p.config.magicShield = {
    mode: ["off", "always", "hp"].includes(mode) ? mode : "off",
    enabled: mode !== "off",
    useSpell: true, // modos novos sempre usam a spell; legado não bloqueia o Helper
    hpBelow: Math.max(1, Math.min(99, parseInt(ms.hpBelow, 10) || 45)),
    mpAbove: Math.max(0, Math.min(100, parseInt(ms.mpAbove, 10) || 15)),
    recastBelow: Math.max(1, Math.min(99, parseInt(ms.recastBelow, 10) || 70)),
    usePotion: !!ms.usePotion,
  };
  return p.config;
}

/* ------------------------------------------------------- requisitos item */
function normVocName(v) {
  return String(v || "").toLowerCase().replace(/[^a-z]/g, "");
}

function itemVocationAllowed(p, it) {
  if (!it || !it.vocs || !it.vocs.length) return true;
  const mine = new Set([normVocName(p.voc)]);
  if (typeof vocationName === "function") mine.add(normVocName(vocationName(p)));
  if (p.promoted && typeof PROMOTION_NAMES !== "undefined" && PROMOTION_NAMES[p.voc]) {
    mine.add(normVocName(PROMOTION_NAMES[p.voc]));
  }
  return it.vocs.some((v) => mine.has(normVocName(v)));
}

function canEquipItem(p, slug, targetSlot) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Esse item não é equipável." };
  const slot = it.s;
  if (targetSlot && targetSlot !== slot) {
    return { ok: false, msg: `Esse item equipa em ${slot}, não em ${targetSlot}.` };
  }
  if (it.lvl && p.level < it.lvl) return { ok: false, msg: `Requer nível ${it.lvl}.` };
  if (!itemVocationAllowed(p, it)) return { ok: false, msg: "Vocação incompatível." };
  if (it.t === "quiver" && typeof canUseQuiver === "function" && !canUseQuiver(p)) {
    return { ok: false, msg: "Somente paladins podem equipar quiver." };
  }
  if (slot === "shield" && it.t !== "quiver") {
    const w = p.equip && p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
    if (w && w.th) return { ok: false, msg: "Arma de duas mãos impede escudo/spellbook." };
  }
  if (slot === "ammo") {
    if (typeof equippedQuiver === "function" && !equippedQuiver(p)) {
      return { ok: false, msg: "Equipe um quiver antes de selecionar munição." };
    }
  }
  return { ok: true, slot: slot };
}

function stashEquippedItem(p, entry, preferred) {
  if (!entry || !entry.item) return true;
  const it = GAMEDATA.items[entry.item];
  const full = it && it.charges ? it.charges : 0;
  const ch = entry.charges;
  const partial = full && ch !== undefined && Math.floor(Number(ch)) > 0 && Math.floor(Number(ch)) < full;
  const destBag = preferred === "bag";

  // Parcial: volta como INSTÂNCIA com charges (nunca stack / nunca ledger).
  if (partial && typeof isChargeStackableAccessory === "function" && isChargeStackableAccessory(entry.item)) {
    if (!destBag) {
      // Pouch/stash só aceitam cheios — força bag.
      if (typeof toast === "function") toast("Item com cargas parciais vai para a mochila (não empilha).", "bad");
    }
    if (entry.instId && typeof findItemInstance === "function") {
      const inst = findItemInstance(p, entry.instId);
      if (inst) {
        inst.charges = Math.floor(Number(ch));
        inst.maxCharges = full;
        delete p.equip[entry._slot || entry.slot];
        return putBagItemInstance(p, inst);
      }
    }
    delete p.equip[entry._slot || entry.slot];
    return addItem(p, entry.item, 1, { charges: Math.floor(Number(ch)) });
  }

  // Cheio / sem cargas: stack normal. Não grava ledger compartilhado.
  if (entry.instId && typeof takeEquippedItemInstance === "function") {
    const slot = (entry._slot || entry.slot || entry.s || "");
    // Charge stackable sem itemUsesInstances: takeEquipped pode falhar — fallback abaixo.
    if (slot && typeof itemUsesInstances === "function" && itemUsesInstances(entry.item)) {
      const inst = takeEquippedItemInstance(p, slot);
      if (inst) {
        if (preferred === "bag") return putBagItemInstance(p, inst);
        if (inst.tier > 0) {
          if (typeof toast === "function") toast("Itens tierados não podem ir para a Loot Pouch.");
          return false;
        }
        deleteItemInstance(p, inst.id);
        return typeof addLootPouch === "function" ? addLootPouch(p, inst.slug, 1) : false;
      }
    }
  }
  if (entry.instId && typeof deleteItemInstance === "function") {
    // Chargeable full com instância órfã: remove inst e empilha.
    deleteItemInstance(p, entry.instId);
  } else if (entry._slot && Array.isArray(p.itemInstances)) {
    const loc = "equip:" + entry._slot;
    for (const inst of p.itemInstances.slice()) {
      if (inst && inst.loc === loc && inst.slug === entry.item) {
        deleteItemInstance(p, inst.id);
      }
    }
  }
  if (destBag && typeof addItem === "function" && addItem(p, entry.item, 1)) return true;
  if (typeof addLootPouch === "function") return addLootPouch(p, entry.item, 1);
  return typeof addItem === "function" ? addItem(p, entry.item, 1) : false;
}

function equipItemFromContainer(p, slug, source, targetSlot, instId) {
  const chk = canEquipItem(p, slug, targetSlot);
  if (!chk.ok) { if (typeof toast === "function") toast(chk.msg, "bad"); return false; }
  const it = GAMEDATA.items[slug];
  const slot = chk.slot;

  if (slot === "ammo") {
    if (typeof setActiveAmmo === "function") setActiveAmmo(p, slug, true);
    if (typeof toast === "function") toast(`Munição no quiver: <b>${it.n}</b>`);
    return true;
  }

  let takenInst = null;
  if (source === "bag") {
    if (instId && typeof takeBagItemInstance === "function") {
      takenInst = takeBagItemInstance(p, slug, { instId: instId, highestTier: false });
      if (!takenInst) return false;
    } else if (typeof isChargeStackableAccessory === "function" && isChargeStackableAccessory(slug)) {
      // Preferir stack CHEIA; senão uma instância parcial.
      if ((p.bag[slug] || 0) > 0) {
        if (!removeItem(p, slug, 1)) return false;
      } else {
        takenInst = takeBagItemInstance(p, slug, { highestTier: false });
        if (!takenInst) return false;
      }
    } else if (typeof itemUsesInstances === "function" && itemUsesInstances(slug)) {
      takenInst = takeBagItemInstance(p, slug, { instId: instId, highestTier: true });
      if (!takenInst) return false;
    } else if (!removeItem(p, slug, 1)) return false;
  } else if (source === "pouch") {
    if (typeof toast === "function") toast("Mova o item para a mochila antes de equipar.", "bad");
    return false;
  } else if (source === "stash") {
    if (typeof removeSupplyStash !== "function" || !removeSupplyStash(p, slug, 1)) return false;
  } else if (source === "equip") {
    return true;
  }

  const old = p.equip[slot];
  const oldIsDefaultBackpack = slot === "backpack" && old && old.item === "bag";
  let oldInst = null;
  if (old && old.item !== slug && !oldIsDefaultBackpack) {
    if (old.instId && typeof takeEquippedItemInstance === "function") {
      oldInst = takeEquippedItemInstance(p, slot);
      if (source === "bag") {
        if (!putBagItemInstance(p, oldInst)) {
          if (takenInst) putBagItemInstance(p, takenInst); else if (source === "bag") addItem(p, slug, 1);
          equipEntryInstance(p, slot, oldInst);
          return false;
        }
      } else {
        if (oldInst.tier > 0) {
          if (takenInst) putBagItemInstance(p, takenInst); else if (source === "bag") addItem(p, slug, 1);
          equipEntryInstance(p, slot, oldInst);
          if (typeof toast === "function") toast("Itens tierados não podem ir para a Loot Pouch.");
          return false;
        }
        deleteItemInstance(p, oldInst.id);
        addLootPouch(p, oldInst.slug, 1);
      }
    } else if (!stashEquippedItem(p, Object.assign({ _slot: slot }, old), source === "bag" ? "bag" : "pouch")) {
      if (takenInst) putBagItemInstance(p, takenInst); else if (source === "bag") addItem(p, slug, 1);
      return false;
    }
  }

  if (takenInst) {
    if (typeof itemUsesInstances === "function" && itemUsesInstances(slug)) {
      equipEntryInstance(p, slot, takenInst);
      if (takenInst.charges !== undefined) {
        p.equip[slot].charges = takenInst.charges;
        p.equip[slot].maxCharges = takenInst.maxCharges || it.charges || takenInst.charges;
      }
    } else {
      // Parcial chargeable: equipa com charges da instância e remove a inst.
      p.equip[slot] = { item: slug, count: 1 };
      if (takenInst.charges !== undefined) {
        p.equip[slot].charges = takenInst.charges;
        p.equip[slot].maxCharges = takenInst.maxCharges || it.charges || takenInst.charges;
      }
      if (typeof deleteItemInstance === "function") deleteItemInstance(p, takenInst.id);
    }
  } else {
    p.equip[slot] = { item: slug, count: 1 };
  }

  // Cargas: instância parcial já aplicada; senão full (ou legado 1×).
  if (p.equip[slot].charges === undefined) {
    const cc = accessoryChargesOnEquip(p, p.equip[slot].item, null);
    if (cc !== null) {
      p.equip[slot].charges = cc;
      p.equip[slot].maxCharges = it.charges || cc;
    }
  }

  // Arma de duas mãos remove escudo/spellbook, mas mantém quiver (Tibia global).
  if (slot === "weapon" && it.th && p.equip.shield) {
    const sh = GAMEDATA.items[p.equip.shield.item];
    if (sh && sh.t !== "quiver") {
      const shEntry = Object.assign({ _slot: "shield" }, p.equip.shield);
      if (!stashEquippedItem(p, shEntry, source === "bag" ? "bag" : "pouch")) return false;
      delete p.equip.shield;
    }
  }
  return true;
}

function unequipToContainer(p, slot, dest) {
  if (!p.equip || !p.equip[slot]) return false;
  if (slot === "backpack") {
    const e = p.equip[slot];
    if (!e || e.item === "bag") { if (typeof toast === "function") toast("A bag padrão não pode ser removida."); return false; }
    // Troca a backpack especial pela bag padrão; a antiga volta para a mochila.
    if (typeof addItem === "function" && !addItem(p, e.item, 1)) {
      if (typeof toast === "function") toast("Mochila cheia — não cabe a backpack antiga.");
      return false;
    }
    p.equip[slot] = { item: "bag", count: 1 };
    return true;
  }
  if (slot === "ammo") { if (typeof setActiveAmmo === "function") setActiveAmmo(p, null); return true; }
  const e = p.equip[slot];
  const it = GAMEDATA.items[e.item];
  const full = it && it.charges ? it.charges : 0;
  const ch = e.charges;
  const partial = full && ch !== undefined && Math.floor(Number(ch)) > 0 && Math.floor(Number(ch)) < full;
  const chargeable = typeof isChargeStackableAccessory === "function" && isChargeStackableAccessory(e.item);

  // Parcial chargeable → sempre bag como instância isolada (nunca pouch/stash stack).
  if (chargeable && partial) {
    if (dest !== "bag" && typeof toast === "function") {
      toast("Cargas parciais não empilham — item voltou para a mochila.", "bad");
    }
    const ok = addItem(p, e.item, 1, { charges: Math.floor(Number(ch)) });
    if (!ok) { if (typeof toast === "function") toast("Mochila cheia.", "bad"); return false; }
    if (e.instId && typeof deleteItemInstance === "function") deleteItemInstance(p, e.instId);
    delete p.equip[slot];
    return true;
  }

  // Cheio / sem sistema de cargas: empilha. Sem ledger compartilhado.
  let ok = false;
  if (e.instId && typeof itemUsesInstances === "function" && itemUsesInstances(e.item) &&
      typeof takeEquippedItemInstance === "function") {
    const inst = takeEquippedItemInstance(p, slot);
    if (!inst) return false;
    if (dest === "bag") ok = putBagItemInstance(p, inst);
    else {
      if (inst.tier > 0) {
        if (typeof toast === "function") toast("Itens tierados não podem ir para a Loot Pouch.");
        equipEntryInstance(p, slot, inst);
        return false;
      }
      deleteItemInstance(p, inst.id);
      ok = addLootPouch(p, inst.slug, 1);
    }
    if (!ok) {
      if (dest === "bag") equipEntryInstance(p, slot, inst);
      else { p.itemInstances.push(inst); equipEntryInstance(p, slot, inst); }
      if (typeof toast === "function") toast("Mochila cheia.", "bad");
      return false;
    }
  } else {
    if (e.instId && typeof deleteItemInstance === "function") deleteItemInstance(p, e.instId);
    if (dest === "bag") ok = addItem(p, e.item, 1);
    else if (dest === "stash" && typeof addSupplyStash === "function") ok = addSupplyStash(p, e.item, 1);
    else ok = addLootPouch(p, e.item, 1);
    if (!ok) { if (typeof toast === "function") toast("Mochila cheia.", "bad"); return false; }
    delete p.equip[slot];
  }
  if (slot === "shield" && (GAMEDATA.items[e.item] || {}).t === "quiver") {
    if (typeof setActiveAmmo === "function") setActiveAmmo(p, null);
  }
  return true;
}

function moveItemToBag(p, payload) {
  if (!payload) return false;
  if (payload.source === "depot") {
    if (typeof depotRetrieve !== "function") return false;
    const r = depotRetrieve(p, payload.ref);
    if (!r || !r.ok) {
      if (r && r.msg && typeof toast === "function") toast(r.msg, "bad");
      return false;
    }
    return true;
  }
  if (payload.source === "pouch") {
    const count = p.lootPouch && p.lootPouch[payload.slug] ? p.lootPouch[payload.slug] : 0;
    if (count <= 0) return false;
    if (!addItem(p, payload.slug, count)) { if (typeof toast === "function") toast("Mochila cheia."); return false; }
    removeLootPouch(p, payload.slug, count);
    return true;
  }
  if (payload.source === "stash") {
    const count = p.supplyStash && p.supplyStash[payload.slug] ? p.supplyStash[payload.slug] : 0;
    if (count <= 0) return false;
    if (!addItem(p, payload.slug, count)) { if (typeof toast === "function") toast("Mochila cheia."); return false; }
    removeSupplyStash(p, payload.slug, count);
    return true;
  }
  if (payload.source === "equip") return unequipToContainer(p, payload.slot, "bag");
  return false;
}

function moveItemToPouch(p, payload) {
  if (!payload) return false;
  if (payload.source === "bag") {
    if (payload.instId && typeof itemUsesInstances === "function" && itemUsesInstances(payload.slug)) {
      const inst = takeBagItemInstance(p, payload.slug, { instId: payload.instId, highestTier: false });
      if (!inst) return false;
      if (inst.tier > 0) {
        putBagItemInstance(p, inst);
        if (typeof toast === "function") toast("Itens tierados não podem ir para a Loot Pouch.");
        return false;
      }
      deleteItemInstance(p, inst.id);
      addLootPouch(p, payload.slug, 1);
      return true;
    }
    const count = p.bag && p.bag[payload.slug] ? p.bag[payload.slug] : 0;
    if (count <= 0) return false;
    addLootPouch(p, payload.slug, count);
    delete p.bag[payload.slug];
    return true;
  }
  if (payload.source === "equip") return unequipToContainer(p, payload.slot, "pouch");
  return false;
}

function moveItemToEquip(p, payload, slot) {
  if (!payload) return false;
  if (payload.source === "equip") return false;
  if (payload.source === "depot") {
    if (typeof depotEquip !== "function") return false;
    const r = depotEquip(p, payload.ref);
    if (!r || !r.ok) {
      if (r && r.msg && typeof toast === "function") toast(r.msg, "bad");
      return false;
    }
    return true;
  }
  return equipItemFromContainer(p, payload.slug, payload.source, slot, payload.instId);
}

/* ------------------------------------------------------------- drag/drop */
function bindItemDrag(el, payload) {
  if (!el || !payload) return;
  el.setAttribute("draggable", "true");
  el.addEventListener("dragstart", (e) => {
    if (!e.dataTransfer) return;
    if (typeof hideContextMenu === "function") hideContextMenu();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", payload.slug || "");
    if (payload.source === "pouch") e.dataTransfer.setData("text/loot-pouch", payload.slug || "");
    if (typeof hideTip === "function") hideTip();
  });
}

function dragHasItem(e) {
  if (!e.dataTransfer) return false;
  const types = Array.from(e.dataTransfer.types || []);
  return types.indexOf(ITEM_DRAG_TYPE) !== -1 || types.indexOf("text/loot-pouch") !== -1;
}

function dragPayload(e) {
  if (!e.dataTransfer) return null;
  const raw = e.dataTransfer.getData(ITEM_DRAG_TYPE);
  if (raw) {
    try { return JSON.parse(raw); } catch (err) {}
  }
  const pouch = e.dataTransfer.getData("text/loot-pouch");
  if (pouch) return { source: "pouch", slug: pouch };
  return null;
}

function bindDrop(el, handler) {
  if (!el) return;
  el.addEventListener("dragover", (e) => {
    if (!dragHasItem(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  });
  el.addEventListener("drop", (e) => {
    const pld = dragPayload(e);
    if (!pld) return;
    e.preventDefault();
    if (handler(pld)) {
      if (typeof save === "function") save();
      if (typeof hideTip === "function") hideTip();
      if (typeof renderAll === "function") renderAll();
    }
  });
}

/* ---------------------------------------------------------- helper equip */
function accessoryAvailableCounts(p, slot) {
  const out = {};
  for (const slug in (p.bag || {})) {
    const it = GAMEDATA.items[slug];
    if (it && it.s === slot && (p.bag[slug] || 0) > 0) out[slug] = (out[slug] || 0) + p.bag[slug];
  }
  // Parciais chargeable ficam só em itemInstances (não entram em p.bag).
  if (Array.isArray(p.itemInstances)) {
    for (const inst of p.itemInstances) {
      if (!inst || inst.loc !== "bag") continue;
      const it = GAMEDATA.items[inst.slug];
      if (it && it.s === slot) out[inst.slug] = (out[inst.slug] || 0) + 1;
    }
  }
  for (const slug in (p.lootPouch || {})) {
    const it = GAMEDATA.items[slug];
    if (it && it.s === slot && (p.lootPouch[slug] || 0) > 0) out[slug] = (out[slug] || 0) + p.lootPouch[slug];
  }
  if (typeof ensureSupplyStash === "function") ensureSupplyStash(p);
  for (const slug in (p.supplyStash || {})) {
    const it = GAMEDATA.items[slug];
    if (it && it.s === slot && (p.supplyStash[slug] || 0) > 0) {
      out[slug] = (out[slug] || 0) + p.supplyStash[slug];
    }
  }
  if (p.equip && p.equip[slot]) out[p.equip[slot].item] = (out[p.equip[slot].item] || 0) + 1;
  return out;
}

/* Helper: quanto resta do recurso (cargas OU tempo). Ambos usam `charges`;
 * time ≈ charges×3s fora do slot. Menor fração = mais perto de esgotar. */
function accessoryHelperRemainRatio(slug, charges) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items && GAMEDATA.items[slug]) || null;
  const full = it && it.charges ? Math.floor(Number(it.charges)) : 0;
  if (!full) return 1;
  let n = (charges === undefined || charges === null)
    ? full
    : Math.floor(Number(charges));
  if (!Number.isFinite(n) || n < 0) n = 0;
  return Math.min(1, n / full);
}

/* Escolhe a cópia do slug com MENOS recurso restante (parcial antes de cheio).
 * Empate: bag > pouch > stash. */
function accessoryHelperPickSource(p, slug) {
  if (!p || !slug) return null;
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items && GAMEDATA.items[slug]) || null;
  const full = it && it.charges ? Math.floor(Number(it.charges)) : 0;
  const cands = [];
  if (Array.isArray(p.itemInstances)) {
    for (const inst of p.itemInstances) {
      if (!inst || inst.loc !== "bag" || inst.slug !== slug) continue;
      const ch = inst.charges !== undefined ? Math.floor(Number(inst.charges)) : full;
      if (full && (!Number.isFinite(ch) || ch <= 0)) continue;
      cands.push({
        source: "bag",
        instId: inst.id,
        charges: Number.isFinite(ch) ? ch : full,
        ratio: accessoryHelperRemainRatio(slug, ch),
        locPri: 0,
      });
    }
  }
  if ((Number(p.bag && p.bag[slug]) || 0) > 0) {
    cands.push({
      source: "bag",
      charges: full || null,
      ratio: accessoryHelperRemainRatio(slug, full || null),
      locPri: 0,
    });
  }
  if ((Number(p.lootPouch && p.lootPouch[slug]) || 0) > 0) {
    cands.push({
      source: "pouch",
      charges: full || null,
      ratio: accessoryHelperRemainRatio(slug, full || null),
      locPri: 1,
    });
  }
  if ((Number(p.supplyStash && p.supplyStash[slug]) || 0) > 0) {
    cands.push({
      source: "stash",
      charges: full || null,
      ratio: accessoryHelperRemainRatio(slug, full || null),
      locPri: 2,
    });
  }
  if (!cands.length) return null;
  cands.sort((a, b) =>
    a.ratio - b.ratio ||
    (Math.floor(Number(a.charges) || 0) - Math.floor(Number(b.charges) || 0)) ||
    a.locPri - b.locPri);
  return cands[0];
}

function accessoryItemList(p, slot, include) {
  const counts = accessoryAvailableCounts(p, slot);
  if (include) counts[include] = counts[include] || 0;
  return Object.keys(counts).filter((slug) => GAMEDATA.items[slug])
    .sort((a, b) => (GAMEDATA.items[a].lvl || 0) - (GAMEDATA.items[b].lvl || 0) ||
                    GAMEDATA.items[a].n.localeCompare(GAMEDATA.items[b].n));
}

function accessoryClsLabelHtml(slug) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items && GAMEDATA.items[slug]) || null;
  const lab = it && ACCESSORY_CLS_LABEL[it.cls];
  if (!lab) return "";
  return `<span style="color:${lab.color}">${lab.text}</span>`;
}

function accessoryPickerTriggerHtml(p, slot, value, kind) {
  const counts = accessoryAvailableCounts(p, slot);
  let icon, nome, meta;
  if (value && GAMEDATA.items[value]) {
    icon = typeof itemImg === "function" ? itemImg(value, 28) : "";
    nome = typeof itemName === "function" ? itemName(value) : (GAMEDATA.items[value].n || value);
    const q = counts[value] || 0;
    const rar = accessoryClsLabelHtml(value);
    meta = `${q}x` + (rar ? ` · ${rar}` : "");
  } else {
    icon = `<div class="helper-equip-empty-icon" aria-hidden="true">—</div>`;
    nome = "Nenhum";
    meta = "clique para escolher";
  }
  return `<button type="button" class="helper-equip-pick-btn" data-helper-equip-pick="${kind}"
      title="Escolher ${kind === "emergency" ? "emergencial" : "padrão"}">
    <span class="helper-equip-pick-icon">${icon}</span>
    <span class="helper-equip-pick-text">
      <span class="small">${nome}</span>
      <span class="tiny dim">${meta}</span>
    </span>
    <span class="tiny dim helper-equip-pick-caret">▾</span>
  </button>`;
}

function accessoryPickerKindLabel(kind) {
  return kind === "emergency" ? "Emergencial" : "Padrão";
}

function accessoryPickerSlotLabel(slot) {
  return slot === "ring" ? "Anel" : "Amuleto";
}

function openAccessoryHelperPicker(kind) {
  const p = typeof G !== "undefined" ? G.p : null;
  if (!p || (kind !== "emergency" && kind !== "normal")) return;
  HELPER_EQUIP_PICKER.kind = kind;
  HELPER_EQUIP_PICKER.busca = "";
  desenhaAccessoryHelperPicker();
  const modal = document.getElementById("modal");
  if (modal) modal.classList.add("show");
}

function desenhaAccessoryHelperPicker() {
  const p = typeof G !== "undefined" ? G.p : null;
  const body = document.getElementById("modal-body");
  if (!p || !body || !HELPER_EQUIP_PICKER.kind) return;
  ensureAccessoryConfig(p);
  const slot = HELPER_EQUIP_UI.slot || "amulet";
  const cfg = p.config.equipHelper[slot];
  const kind = HELPER_EQUIP_PICKER.kind;
  const atual = kind === "emergency" ? (cfg.emergency || "") : (cfg.normal || "");
  const busca = (HELPER_EQUIP_PICKER.busca || "").trim().toLowerCase();
  const counts = accessoryAvailableCounts(p, slot);
  let list = accessoryItemList(p, slot, atual);
  if (busca) {
    list = list.filter((slug) => {
      const it = GAMEDATA.items[slug];
      if (!it) return false;
      const nome = (it.n || "").toLowerCase();
      const idStr = String(it.id || "");
      return nome.indexOf(busca) !== -1 ||
        slug.indexOf(busca) !== -1 ||
        idStr.indexOf(busca) !== -1;
    });
  }
  const titulo = `${accessoryPickerSlotLabel(slot)} - ${accessoryPickerKindLabel(kind)}`;
  const linhaNenhum = (() => {
    const usando = !atual;
    const btn = usando ? "Em uso" : "Remover";
    return `<div class="shop-row helper-equip-pick-row ${usando ? "selected" : ""}">
      <div class="helper-equip-empty-icon" aria-hidden="true">—</div>
      <div style="flex:1;min-width:0">
        <div class="small">Nenhum</div>
        <div class="tiny dim">${usando ? "slot sem item configurado" : "limpar seleção"}</div>
      </div>
      <button type="button" class="sm ${usando ? "primary" : ""}" data-helper-equip-choose="">${btn}</button>
    </div>`;
  })();
  const linhas = list.map((slug) => {
    const it = GAMEDATA.items[slug];
    const usando = atual === slug;
    const q = counts[slug] || 0;
    const rar = accessoryClsLabelHtml(slug);
    const lvl = it.lvl ? `lvl ${it.lvl}` : "";
    const meta = [q ? `${q}x` : "0x", lvl, rar].filter(Boolean).join(" · ");
    return `<div class="shop-row helper-equip-pick-row ${usando ? "selected" : ""}">
      ${typeof itemImg === "function" ? itemImg(slug, 30) : ""}
      <div style="flex:1;min-width:0">
        <div class="small">${typeof itemName === "function" ? itemName(slug) : it.n}</div>
        <div class="tiny dim">${meta || "disponível"}</div>
      </div>
      <button type="button" class="sm ${usando ? "primary" : ""}" data-helper-equip-choose="${slug}">${
        usando ? "Em uso" : "Usar"}</button>
    </div>`;
  }).join("");

  body.innerHTML = `
    <div class="panel-title">${titulo}
      <span style="flex:1"></span>
      <button type="button" class="sm" id="helper-equip-pick-x">✕</button>
    </div>
    <div class="panel-body">
      <div class="row mb8" style="gap:6px;align-items:center">
        <input id="helper-equip-pick-busca" placeholder="Buscar por nome ou id..."
          value="${(HELPER_EQUIP_PICKER.busca || "").replace(/"/g, "&quot;")}"
          style="flex:1;padding:6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="list helper-equip-pick-list" style="max-height:46vh">
        ${linhaNenhum}${linhas || (busca
          ? `<div class="dim tiny" style="padding:10px">Nada com esse filtro.</div>` : "")}
      </div>
      <div class="row mt8" style="gap:6px;align-items:center">
        <span class="tiny dim">${cfg.enabled
          ? "Ativo: Usar aplica o item agora conforme a vida."
          : "Ativo desligado: só configura — marque Ativo para vestir."}</span>
        <span style="flex:1"></span>
        <button type="button" class="sm primary" id="helper-equip-pick-fechar">Fechar</button>
      </div>
    </div>`;

  const fechar = () => {
    const modal = document.getElementById("modal");
    if (modal) modal.classList.remove("show");
    HELPER_EQUIP_PICKER.kind = null;
  };
  const xBtn = document.getElementById("helper-equip-pick-x");
  if (xBtn) xBtn.addEventListener("click", fechar);
  const closeBtn = document.getElementById("helper-equip-pick-fechar");
  if (closeBtn) closeBtn.addEventListener("click", fechar);
  const inp = document.getElementById("helper-equip-pick-busca");
  if (inp) {
    inp.addEventListener("input", () => {
      HELPER_EQUIP_PICKER.busca = inp.value;
      desenhaAccessoryHelperPicker();
      const n = document.getElementById("helper-equip-pick-busca");
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    });
  }
  body.querySelectorAll("[data-helper-equip-choose]").forEach((b) => {
    b.addEventListener("click", () => {
      const slug = b.getAttribute("data-helper-equip-choose") || "";
      if (kind === "emergency") cfg.emergency = slug;
      else cfg.normal = slug;
      if (cfg.enabled) applyAccessoryHelperSlotNow(p, slot);
      if (typeof save === "function") save();
      refreshAccessoryHelperVisuals(p);
      desenhaAccessoryHelperPicker();
      const el = document.getElementById("helper-equipment");
      if (el && typeof renderEquipmentHelper === "function") {
        el.innerHTML = renderEquipmentHelper(p);
        if (typeof bindEquipmentHelper === "function") bindEquipmentHelper(p);
      }
    });
  });
}

function accessoryEquipConfigured(p, slot, slug) {
  const cur = p.equip && p.equip[slot] ? p.equip[slot].item : "";
  if (cur === slug) return true;
  if (!slug) {
    if (p.equip && p.equip[slot]) return unequipToContainer(p, slot, "pouch");
    return true;
  }
  // Helper: gasta primeiro a cópia com menos cargas / menos tempo restante.
  const pick = accessoryHelperPickSource(p, slug);
  if (pick) {
    return equipItemFromContainer(p, slug, pick.source, slot, pick.instId || undefined);
  }
  if (typeof toast === "function") {
    toast(`${itemName(slug)} não está na mochila, Loot Pouch nem Supply Stash.`, "bad");
  }
  return false;
}

function tryAccessoryHelper(c, p, now) {
  ensureAccessoryConfig(p);
  const max = maxStats(p);
  const hpPct = max.hp ? (p.hp / max.hp) * 100 : 100;
  for (const slot of ["amulet", "ring"]) {
    const cfg = p.config.equipHelper[slot];
    if (!cfg || !cfg.enabled) continue;
    if (hpPct <= cfg.equipBelow && cfg.emergency) {
      accessoryEquipConfigured(p, slot, cfg.emergency);
    } else if (hpPct >= cfg.restoreAbove) {
      const cur = p.equip && p.equip[slot] ? p.equip[slot].item : "";
      if (cfg.normal || cur === cfg.emergency) accessoryEquipConfigured(p, slot, cfg.normal);
    }
  }
}

/* Aplica imediatamente o item certo do helper (toggle Ativo ON / picker).
 * Regra do toggle: HP baixo → emergencial; caso contrário → padrão. */
function applyAccessoryHelperSlotNow(p, slot) {
  ensureAccessoryConfig(p);
  const cfg = p.config.equipHelper[slot];
  if (!cfg || !cfg.enabled) return false;
  const max = typeof maxStats === "function" ? maxStats(p) : { hp: p.maxHp || 1 };
  const hpPct = max.hp ? (p.hp / max.hp) * 100 : 100;
  if (hpPct <= cfg.equipBelow && cfg.emergency) {
    return accessoryEquipConfigured(p, slot, cfg.emergency);
  }
  if (cfg.normal) return accessoryEquipConfigured(p, slot, cfg.normal);
  return false;
}

/* Ao desligar Ativo: se o emergencial estiver vestido, devolve o padrão
 * (ou desequipa se não houver padrão). Não mexe em itens que o jogador
 * equipou manualmente fora do helper. */
function releaseAccessoryHelperSlot(p, slot) {
  ensureAccessoryConfig(p);
  const cfg = p.config.equipHelper[slot];
  if (!cfg) return false;
  const cur = p.equip && p.equip[slot] ? p.equip[slot].item : "";
  if (cfg.emergency && cur === cfg.emergency) {
    return accessoryEquipConfigured(p, slot, cfg.normal || "");
  }
  return false;
}

function refreshAccessoryHelperVisuals(p) {
  if (!p) return;
  if (typeof renderEquip === "function") {
    try { renderEquip(p); } catch (e) { /* UI opcional */ }
  }
  if (typeof renderBag === "function") {
    try { renderBag(p); } catch (e) { /* UI opcional */ }
  }
  if (typeof renderLootPouch === "function") {
    try { renderLootPouch(p); } catch (e) { /* UI opcional */ }
  }
  if (typeof renderSupplyStash === "function") {
    try { renderSupplyStash(p); } catch (e) { /* UI opcional */ }
  }
}

function renderEquipmentHelper(p) {
  ensureAccessoryConfig(p);
  const slot = HELPER_EQUIP_UI.slot || "amulet";
  const cfg = p.config.equipHelper[slot];
  const counts = accessoryAvailableCounts(p, slot);
  const pouchIcons = Object.keys(counts).slice(0, 12).map((slug) =>
    `<div class="inv-item ${itemClsBorder(slug)}" style="width:34px;height:34px;cursor:default" title="${itemName(slug)} · ${counts[slug]}x">
      ${itemImg(slug, 0, null, counts[slug])}${counts[slug] > 1 ? `<span class="cnt">${counts[slug]}</span>` : ""}</div>`).join("");

  return `
    <div class="row mb8" style="gap:6px">
      ${[["amulet", "Amuleto"], ["ring", "Anel"]].map(([id, nome]) =>
        `<button class="sm ${slot === id ? "primary" : ""}" data-helper-equip-slot="${id}">${nome}</button>`).join("")}
      <span style="flex:1"></span>
      <label class="toggle tiny"><input type="checkbox" id="helper-equip-enabled" ${cfg.enabled ? "checked" : ""}> Ativo</label>
    </div>
    <div class="panel-inset" style="padding:10px">
      <div class="small" style="color:#d4af37;font-weight:bold;margin-bottom:8px">${slot === "amulet" ? "Amuleto" : "Anel"}</div>
      ${(() => {
        const cg = accessoryChargesNow(p, slot);
        const eqNome = p.equip && p.equip[slot] && p.equip[slot].item
          ? itemName(p.equip[slot].item) : "";
        if (cg) {
          const modo = cg.mode === "hits" ? "por golpe recebido" : "por tempo (1 a cada 3s)";
          if (cg.mode === "hits") {
            return `<div class="tiny mb4">Equipado: <b>${eqNome}</b>
            · <span class="charge-highlight" style="color:#ffe680">⚡ ${cg.now}/${cg.max} cargas</span>
            <span class="dim">(${modo})</span></div>`;
          }
          const t = typeof fmtShortDuration === "function"
            ? fmtShortDuration(cg.remSec) : (cg.remSec + "s");
          return `<div class="tiny mb4">Equipado: <b>${eqNome}</b>
            · <span class="charge-highlight" style="color:#ffe680">⏱ ${t}</span>
            <span class="dim">(${cg.now}/${cg.max} · ${modo})</span></div>`;
        }
        return eqNome ? `<div class="tiny mb4">Equipado: <b>${eqNome}</b></div>` : "";
      })()}
      <div class="row" style="gap:12px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="tiny" style="color:#ff9090;font-weight:bold">EMERGENCIAL</div>
          ${accessoryPickerTriggerHtml(p, slot, cfg.emergency, "emergency")}
          <label class="small dim mt8">Equipar com vida abaixo de (%)</label>
          <input id="helper-equip-below" type="number" min="1" max="99" value="${cfg.equipBelow}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
        <div style="flex:1;min-width:0">
          <div class="tiny" style="color:#7ae87a;font-weight:bold">PADRÃO</div>
          ${accessoryPickerTriggerHtml(p, slot, cfg.normal, "normal")}
          <label class="small dim mt8">Restaurar com vida acima de (%)</label>
          <input id="helper-equip-above" type="number" min="1" max="99" value="${cfg.restoreAbove}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
      </div>
      <div class="small dim mt10 mb4">Na mochila / Loot Pouch / Supply Stash</div>
      <div class="row wrap" style="gap:5px">${pouchIcons || `<div class="tiny dim">Nenhum ${slot === "amulet" ? "amuleto" : "anel"} disponível.</div>`}</div>
      <div class="tiny dim mt8">Veste o item emergencial quando a vida cai e devolve o padrão quando recupera. Os itens podem estar na mochila, Loot Pouch ou Supply Stash.</div>
    </div>`;
}

function bindEquipmentHelper(p) {
  ensureAccessoryConfig(p);
  const rer = () => { const el = document.getElementById("helper-equipment"); if (el) { el.innerHTML = renderEquipmentHelper(p); bindEquipmentHelper(p); } };
  document.querySelectorAll("#helper-equipment [data-helper-equip-slot]").forEach((b) =>
    b.addEventListener("click", () => { HELPER_EQUIP_UI.slot = b.dataset.helperEquipSlot; rer(); }));
  document.querySelectorAll("#helper-equipment [data-helper-equip-pick]").forEach((b) =>
    b.addEventListener("click", () => openAccessoryHelperPicker(b.dataset.helperEquipPick)));
  const slot = HELPER_EQUIP_UI.slot || "amulet";
  const cfg = p.config.equipHelper[slot];
  const enabled = document.getElementById("helper-equip-enabled");
  if (enabled) enabled.addEventListener("change", () => {
    cfg.enabled = enabled.checked;
    if (cfg.enabled) applyAccessoryHelperSlotNow(p, slot);
    else releaseAccessoryHelperSlot(p, slot);
    if (typeof save === "function") save();
    refreshAccessoryHelperVisuals(p);
    rer();
  });
  const below = document.getElementById("helper-equip-below");
  if (below) below.addEventListener("change", () => {
    cfg.equipBelow = Math.max(1, Math.min(99, parseInt(below.value, 10) || 50));
    below.value = cfg.equipBelow;
    if (cfg.restoreAbove < cfg.equipBelow) cfg.restoreAbove = cfg.equipBelow;
    if (typeof save === "function") save(); rer();
  });
  const above = document.getElementById("helper-equip-above");
  if (above) above.addEventListener("change", () => {
    cfg.restoreAbove = Math.max(1, Math.min(99, parseInt(above.value, 10) || 80));
    if (cfg.restoreAbove < cfg.equipBelow) cfg.restoreAbove = cfg.equipBelow;
    above.value = cfg.restoreAbove;
    if (typeof save === "function") save(); rer();
  });
}

/* --------------------------------------------------------- magic shield */
/* Regra do dono: só Monk e Royal Paladin (RP) podem usar energy ring. */
function energyRingAllowed(p) {
  if (!p) return false;
  return ["monk", "exalted monk", "paladin", "royal paladin"].indexOf(p.voc) !== -1;
}

function energyRingEquipped(p) {
  return !!(p && energyRingAllowed(p) && p.equip && p.equip.ring &&
            p.equip.ring.item === "energy-ring");
}

function isMagicShieldActive(p, now) {
  now = now || Date.now();
  if (energyRingEquipped(p)) return true;
  // utamo vita (12.55+): ativo enquanto durar E a capacidade do shield não
  // esgotou — quando a pool zera, o shield QUEBRA (mesmo com mana cheia)
  return ((p.magicShieldUntil || 0) > now) && (p.magicShieldPool || 0) > 0;
}

function magicShieldSource(p, now) {
  if (energyRingEquipped(p)) return "Energy Ring";
  if ((p.magicShieldUntil || 0) > (now || Date.now()) && (p.magicShieldPool || 0) > 0)
    return p.magicShieldFrom === "potion" ? "Magic Shield Potion" : "Magic Shield";
  return "";
}

/* Capacidade do Magic Shield (Update 12.55, TibiaWiki):
 *   Cap = 7*M + 7.6*L + max(300, 0.4*L)
 * onde L = level e M = magic level (equipamentos e boosts inclusos). Este é
 * o "bônus de defesa que o mage ganha na mana": o shield absorve até esse
 * total de dano antes de quebrar, independente da mana do personagem. */
function magicShieldCapacity(p) {
  const L = Math.max(1, p.level || 1);
  const M = (typeof effMagic === "function")
    ? Math.max(0, effMagic(p) || 0)
    : Math.max(0, p.ml || 0);
  return Math.max(1, Math.floor(7 * M + 7.6 * L + Math.max(300, 0.4 * L)));
}

function magicShieldSpellAllowed(p) {
  const s = typeof SPELLS !== "undefined" ? SPELLS[MAGIC_SHIELD_SPELL_ID] : null;
  if (!s) return false;
  if (!s.vocs) return true;
  // Aceita todos os nomes/promotions de Sorcerer e Druid usados em saves.
  // O Canary registra só as vocações-base na spell, mas o idle pode guardar
  // master sorcerer, sorcerer, elder druid ou druid.
  const voc = String(p.voc || "").toLowerCase();
  if (/sorcerer|druid/.test(voc)) return true;
  return s.vocs.indexOf(p.voc) !== -1;
}

function applyMagicShieldPool(p, now, source) {
  p.magicShieldCap = magicShieldCapacity(p);
  p.magicShieldPool = p.magicShieldCap;
  p.magicShieldUntil = now + MAGIC_SHIELD_DURATION_MS;
  p.magicShieldFrom = source || "spell";
}

function magicShieldNeedsRefresh(p, now) {
  if (!isMagicShieldActive(p, now)) return true;
  const cap = p.magicShieldCap || magicShieldCapacity(p);
  return (p.magicShieldPool || 0) < cap * 0.5;
}

function magicShieldPotionReady(p, now) {
  return !(Number(p.magicShieldPotionUntil) > now);
}

function magicShieldPotionAllowed(p) {
  return magicShieldSpellAllowed(p) && Number(p.level || 1) >= MAGIC_SHIELD_POTION_LVL;
}

function emitMagicShieldOn(c, p, source) {
  if (!c || !c.events) return;
  c.events.push({ t: "magic-shield-on", cap: p.magicShieldCap, source: source || "Magic Shield",
    x: c.player ? c.player.x : 0.13, y: c.player ? c.player.y : 0.6, screen: true });
}

/* Canary: a potion força o mesmo manashield do utamo vita sem travar a
 * magia, o grupo Support nem o potionCd de 1s. Custa 50k e tem CD 15s. */
function tryMagicShieldPotion(c, p, now, force) {
  if (typeof playerIsFeared === "function" && playerIsFeared(p)) return false;
  now = now || Date.now();
  if (!magicShieldPotionAllowed(p)) return false;
  if (!magicShieldPotionReady(p, now)) return false;
  if ((Number(p.gold) || 0) < MAGIC_SHIELD_POTION_COST) return false;
  if (typeof spendGold === "function") {
    if (!spendGold(p, MAGIC_SHIELD_POTION_COST)) return false;
  } else {
    p.gold = Math.max(0, (Number(p.gold) || 0) - MAGIC_SHIELD_POTION_COST);
  }
  p.magicShieldPotionUntil = now + MAGIC_SHIELD_POTION_CD_MS;
  applyMagicShieldPool(p, now, "potion");
  if (c && c.stats) c.stats.supplyCost = (c.stats.supplyCost || 0) + MAGIC_SHIELD_POTION_COST;
  if (c && c.events) {
    c.events.push({ t: "say", text: "Aaaah..." });
    emitMagicShieldOn(c, p, "Magic Shield Potion");
  }
  return true;
}

function tryMagicShield(c, p, now) {
  if (typeof playerIsFeared === "function" && playerIsFeared(p)) return false;
  ensureAccessoryConfig(p);
  const cfg = p.config.magicShield;
  const forceOnce = !!cfg.forceOnce;
  if (forceOnce) cfg.forceOnce = false;
  const mode = cfg.mode || (cfg.enabled ? "hp" : "off");
  if (mode === "off" && !forceOnce) return false;
  if (!magicShieldSpellAllowed(p)) return false;
  const max = maxStats(p);
  const hpPct = max.hp ? (p.hp / max.hp) * 100 : 100;
  const mpPct = max.mp ? (p.mp / max.mp) * 100 : 0;
  // Sempre ativo só exige mana para o próprio cast. A porcentagem de mana
  // é um gatilho adicional exclusivo do modo por HP.
  if (!forceOnce && mode === "hp" && (mpPct < cfg.mpAbove || hpPct > cfg.hpBelow)) return false;
  if (!forceOnce && !magicShieldNeedsRefresh(p, now)) return false;

  if (forceOnce) return tryMagicShieldPotion(c, p, now, true);

  const s = typeof SPELLS !== "undefined" ? SPELLS[MAGIC_SHIELD_SPELL_ID] : null;
  const spellReady = s && p.level >= (s.lvl || 1) && p.mp >= s.mana &&
    !(typeof cdReady === "function" && !cdReady(p, MAGIC_SHIELD_SPELL_ID, now));
  if (spellReady) {
    p.mp -= s.mana;
    if (typeof addManaSpent === "function") addManaSpent(p, combatManaSkillGain(c, s.mana));
    if (typeof cdStart === "function") cdStart(p, MAGIC_SHIELD_SPELL_ID, s, now);
    applyMagicShieldPool(p, now, "spell");
    if (c && typeof entCdSet === "function") entCdSet(c, p, "magicShieldCd", now + 1000);
    else if (c) c.magicShieldCd = now + 1000;
    if (c && c.events) {
      c.events.push({ t: "say", text: s.words || "utamo vita" });
      emitMagicShieldOn(c, p, "Magic Shield");
    }
    return true;
  }
  // Emergência Canary: potion quando o utamo vita está em CD ou sem mana.
  if (cfg.usePotion) return tryMagicShieldPotion(c, p, now, true);
  return false;
}

function applyMagicShieldAbsorb(c, p, raw, meta) {
  raw = Math.max(0, Math.floor(raw || 0));
  if (raw <= 0 || !isMagicShieldActive(p, Date.now())) return raw;
  // Energy Ring (Monk/RP): mana shield CLÁSSICO — o dano drena a mana do
  // personagem até ela zerar.
  if (energyRingEquipped(p)) {
    const mana = Math.min(Math.max(0, Math.floor(p.mp || 0)), raw);
    if (mana <= 0) return raw;
    p.mp -= mana;
    const rest = raw - mana;
    if (c && c.stats) c.stats.magicShieldAbsorbed = (c.stats.magicShieldAbsorbed || 0) + mana;
    if (c && c.events) {
      c.events.push({ t: "magic-shield", mana: mana, rest: rest,
        x: meta && meta.x, y: meta && meta.y, sx: meta && meta.sx, sy: meta && meta.sy,
        el: meta && meta.el, screen: true, source: "Energy Ring" });
    }
    if (p.mp <= 0 && p.magicShieldUntil) p.magicShieldUntil = 0;
    return rest;
  }
  // utamo vita (12.55+): o dano drena a POOL do shield (capacidade por
  // level/ml). A mana do personagem NÃO é consumida — o shield quebra
  // quando a pool esgota (oficial).
  const pool = Math.max(0, Math.floor(p.magicShieldPool || 0));
  if (pool <= 0) return raw;
  const absorvido = Math.min(pool, raw);
  p.magicShieldPool = pool - absorvido;
  const rest = raw - absorvido;
  if (c && c.stats) c.stats.magicShieldAbsorbed = (c.stats.magicShieldAbsorbed || 0) + absorvido;
  if (c && c.events) {
    c.events.push({ t: "magic-shield", mana: absorvido, rest: rest,
      pool: p.magicShieldPool, cap: p.magicShieldCap || 0,
      x: meta && meta.x, y: meta && meta.y, sx: meta && meta.sx, sy: meta && meta.sy,
      el: meta && meta.el, screen: true, source: "Magic Shield" });
  }
  // pool zerou: o shield QUEBRA (mesmo com mana cheia e tempo restante)
  if (p.magicShieldPool <= 0) p.magicShieldUntil = 0;
  return rest;
}

function renderMagicShieldHelper(p) {
  // Knight (e elite knight) NÃO têm a aba de Escudo Mágico: não podem
  // equipar energy ring (só Monk/RP) nem conjurar utamo vita.
  if (p.voc === "knight" || p.voc === "elite knight") {
    return `<div class="dim small center" style="padding:10px">
      Knights não usam Magic Shield — energy ring é exclusivo de Monk e Royal Paladin.</div>`;
  }
  ensureAccessoryConfig(p);
  const cfg = p.config.magicShield;
  const now = Date.now();
  const active = isMagicShieldActive(p, now);
  const src = magicShieldSource(p, now);
  const spellOk = magicShieldSpellAllowed(p);
  const s = SPELLS[MAGIC_SHIELD_SPELL_ID];
  const podeEnergy = energyRingAllowed(p);
  const hasEnergy = podeEnergy && ((p.bag && p.bag["energy-ring"]) ||
                     (p.lootPouch && p.lootPouch["energy-ring"]) || energyRingEquipped(p));
  const eq = p.equip && p.equip.ring && p.equip.ring.item === "energy-ring"
    ? accessoryChargesNow(p, "ring") : null;
  return `
    <div class="panel-inset" style="padding:10px">
      <div class="row" style="gap:8px;align-items:center">
        <div style="flex:1">
          <div class="small" style="color:#7ec8ff;font-weight:bold">Magic Shield</div>
          <div class="tiny dim">Dano recebido consome mana antes da vida enquanto ativo.</div>
        </div>
        <span class="tiny dim">${cfg.mode === "always" ? "sempre ativo" : cfg.mode === "hp" ? "por HP" : "não usar"}</span>
      </div>
      <div class="stat-row mt8"><span class="k">Estado</span><span class="v" style="color:${active ? "#7ec8ff" : "#888"}">${active ? "ATIVO · " + src : "inativo"}</span></div>
      ${active && !energyRingEquipped(p) ? `<div class="stat-row"><span class="k">Tempo</span><span class="v">${fmtTime(((p.magicShieldUntil || now) - now) / 1000)}</span></div>
        <div class="stat-row"><span class="k">Escudo</span><span class="v" style="color:#7ec8ff">⚡ ${fmtFull(p.magicShieldPool || 0)} / ${fmtFull(p.magicShieldCap || 0)}</span></div>
        <div class="tiny dim">Capacidade = 7×ML + 7,6×nível + bônus (oficial 12.55). Quebra quando zera — potions de mana não recarregam o escudo.</div>` : ""}
      ${spellOk ? `<div class="row wrap mt8" style="gap:6px"><button class="sm ${cfg.mode === "off" ? "primary" : ""}" data-ms-mode="off">NÃO USAR</button>
        <button class="sm ${cfg.mode === "always" ? "primary" : ""}" data-ms-mode="always">SEMPRE ATIVO</button>
        <button class="sm ${cfg.mode === "hp" ? "primary" : ""}" data-ms-mode="hp">USAR COM % DE HP</button></div>` : ""}
      <div class="row" style="gap:12px;align-items:flex-start;margin-top:8px;${cfg.mode === "hp" ? "" : "opacity:.45;pointer-events:none"}">
        <div style="flex:1">
          <label class="small dim">Ativar com HP abaixo de (%)</label>
          <input id="ms-hp" type="number" min="1" max="99" value="${cfg.hpBelow}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
        <div style="flex:1">
          <label class="small dim">Só se mana acima de (%)</label>
          <input id="ms-mp" type="number" min="0" max="100" value="${cfg.mpAbove}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
      </div>
      ${spellOk ? (() => {
        const cdLeft = Math.max(0, (p.magicShieldPotionUntil || 0) - now);
        const goldOk = (Number(p.gold) || 0) >= MAGIC_SHIELD_POTION_COST;
        const lvlOk = Number(p.level || 1) >= MAGIC_SHIELD_POTION_LVL;
        const using = !!cfg.usePotion;
        return `
      <div class="small dim mt10 mb4">Magic Shield Potion
        ${cdLeft > 0 ? `<span style="color:#ffb347">· CD ${typeof fmtTime === "function" ? fmtTime(cdLeft / 1000) : Math.ceil(cdLeft / 1000) + "s"}</span>` : ""}</div>
      <div class="shop-row ${using ? "selected" : ""}" style="opacity:${lvlOk ? 1 : .55}">
        <img class="item-sprite" src="assets/item/magic-shield-potion.webp" alt="Magic Shield Potion"
          onerror="this.onerror=null;this.src='assets/item/mana-potion.png'"
          style="max-width:32px;max-height:32px;width:auto;height:auto">
        <div style="flex:1;min-width:0">
          <div class="small">Magic Shield Potion ${using ? "· emergência" : ""}</div>
          <div class="tiny dim">Força o mesmo escudo do <b>utamo vita</b> (Canary id 35563). Não gasta o CD da magia nem o de 1s das potions de HP/mana. Custa <span class="gold-txt">${typeof fmtFull === "function" ? fmtFull(MAGIC_SHIELD_POTION_COST) : MAGIC_SHIELD_POTION_COST} gp</span> · CD 15s · nv ${MAGIC_SHIELD_POTION_LVL}+.</div>
          <div class="tiny ${goldOk ? "dim" : "txt-red"}">${goldOk ? "Ouro suficiente." : "Sem ouro suficiente."}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <button class="sm ${using ? "primary" : ""}" id="ms-use-potion" ${lvlOk ? "" : "disabled"}>${using ? "USANDO" : "USAR"}</button>
          <button class="sm" id="ms-drink-potion" ${lvlOk && goldOk && cdLeft <= 0 ? "" : "disabled"}>Beber agora</button>
        </div>
      </div>`;
      })() : ""}
      ${podeEnergy ? `
      <div class="small dim mt10 mb4">Energy Ring ${eq ? `<span style="color:#7ec8ff">· ⚡ ${eq.now}/${eq.max} cargas</span>` : ""}</div>
      <div class="shop-row ${energyRingEquipped(p) ? "selected" : ""}" style="opacity:${hasEnergy ? 1 : .55}">
        ${itemImg("energy-ring")}
        <div style="flex:1;min-width:0">
          <div class="small">Energy Ring ${energyRingEquipped(p) ? "· equipado" : ""}</div>
          <div class="tiny dim">Monk e Royal Paladin: dano vai para mana. Consome 1 carga a cada 3s (10 min no total).</div>
          <div class="tiny ${hasEnergy ? "dim" : "txt-red"}">${hasEnergy ? "Disponível na mochila/pouch ou equipado." : "Você ainda não possui energy ring."}</div>
        </div>
        <button class="sm" id="ms-set-energy" ${hasEnergy ? "" : "disabled"}>Usar como emergencial</button>
      </div>
      <div class="tiny dim mt8">Dica: para ring automático, configure o Energy Ring como emergencial na aba <b>Equipamento</b> e escolha um anel padrão para restaurar.</div>` : `
      <div class="tiny dim mt10">Sua vocação não pode equipar <b>Energy Ring</b> (exclusivo de Monk e Royal Paladin).</div>`}
    </div>`;
}

function bindMagicShieldHelper(p) {
  ensureAccessoryConfig(p);
  const cfg = p.config.magicShield;
  const rer = () => { const el = document.getElementById("helper-magic-shield"); if (el) { el.innerHTML = renderMagicShieldHelper(p); bindMagicShieldHelper(p); } };
  document.querySelectorAll('#helper-magic-shield [data-ms-mode]').forEach((el) => el.addEventListener("click", () => {
    cfg.mode = el.dataset.msMode; cfg.enabled = cfg.mode !== "off";
    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(p); rer();
  }));
  const hp = document.getElementById("ms-hp");
  if (hp) hp.addEventListener("change", () => { cfg.hpBelow = Math.max(1, Math.min(99, parseInt(hp.value, 10) || 45)); if (typeof save === "function") save(); rer(); });
  const mp = document.getElementById("ms-mp");
  if (mp) mp.addEventListener("change", () => { cfg.mpAbove = Math.max(0, Math.min(100, parseInt(mp.value, 10) || 0)); if (typeof save === "function") save(); rer(); });
  const er = document.getElementById("ms-set-energy");
  if (er) er.addEventListener("click", () => {
    const rh = p.config.equipHelper.ring;
    rh.enabled = true;
    rh.emergency = "energy-ring";
    rh.equipBelow = cfg.hpBelow || 50;
    applyAccessoryHelperSlotNow(p, "ring");
    if (typeof toast === "function") toast("Energy Ring definido como anel emergencial.");
    if (typeof save === "function") save();
    refreshAccessoryHelperVisuals(p);
    rer();
  });
  const usePot = document.getElementById("ms-use-potion");
  if (usePot) usePot.addEventListener("click", () => {
    cfg.usePotion = !cfg.usePotion;
    if (typeof toast === "function") toast(cfg.usePotion
      ? "Magic Shield Potion: emergência quando o utamo vita estiver em CD."
      : "Magic Shield Potion desativada.");
    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(p);
    else if (typeof save === "function") save();
    rer();
  });
  const drinkPot = document.getElementById("ms-drink-potion");
  if (drinkPot) drinkPot.addEventListener("click", () => {
    const combat = (typeof G !== "undefined" && G.combat) ? G.combat : null;
    const online = typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat();
    if (online) {
      cfg.forceOnce = true;
      if (typeof toast === "function") toast("Potion será usada no próximo segundo de combate.");
      rer();
      return;
    }
    if (tryMagicShieldPotion(combat, p, Date.now(), true)) {
      if (typeof toast === "function") toast("Magic Shield forçado pela potion.");
      if (typeof renderStats === "function") renderStats(p);
      if (typeof save === "function") save();
    } else if (typeof toast === "function") {
      toast("Não foi possível beber a potion (ouro, nível ou cooldown).");
    }
    rer();
  });
}
