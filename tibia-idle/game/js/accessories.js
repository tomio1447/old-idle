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
const MAGIC_SHIELD_DURATION_MS = 200 * 1000; // 3m20s, duração clássica do utamo vita

const HELPER_EQUIP_UI = { slot: "amulet" };

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
 * - `chargeMode: "time"`  -> 1 carga a cada 3s ENQUANTO EQUIPADO (o time
 *   ring de 200 cargas dura 10 min; anéis de 30 min têm 600, etc.);
 * - `chargeMode: "hits"`  -> 1 carga POR GOLPE recebido (o might ring de
 *   20 cargas absorve 20 golpes);
 * - carga zera -> o item QUEBRA (some do slot, não volta para a mochila).
 * O saldo parcial fica no personagem (p.ringCharges[slug]) para a troca
 * normal/emergencial do Helper não "recarregar" o anel de graça.
 * ---------------------------------------------------------------------- */

function accessoryChargesLedger(p) {
  if (!p.ringCharges || typeof p.ringCharges !== "object") p.ringCharges = {};
  return p.ringCharges;
}

function accessoryDef(p, slug) {
  return (typeof GAMEDATA !== "undefined" && GAMEDATA.items) ? GAMEDATA.items[slug] : null;
}

/* Cargas iniciais ao equipar: o saldo da última instância daquele slug
 * (p.ringCharges) ou a carga cheia do item. */
function accessoryChargesOnEquip(p, slug) {
  const it = accessoryDef(p, slug);
  if (!it || !it.charges) return null;
  const ledger = accessoryChargesLedger(p);
  const resto = parseInt(ledger[slug], 10);
  return (resto > 0) ? Math.min(resto, it.charges) : it.charges;
}

/* Guarda o saldo ao desequipar (troca do Helper/unequip manual). */
function rememberAccessoryCharges(p, slug, charges) {
  if (!slug || charges === undefined || charges === null) return;
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

/* Desconta uma carga do item equipado no slot. Devolve true se consumiu. */
function accessoryConsumeCharge(p, slot) {
  const e = p.equip && p.equip[slot];
  if (!e || !e.item) return false;
  const it = accessoryDef(p, e.item);
  if (!it || !it.charges) return false;
  if (e.charges === undefined) e.charges = it.charges;
  if (e.maxCharges === undefined) e.maxCharges = it.charges;
  e.charges = Math.max(0, parseInt(e.charges, 10) - 1);
  if (e.charges <= 0) {
    accessoryBreak(p, slot);
    return true;
  }
  return true;
}

/* O item quebrou (cargas zeraram): sai do slot e some. */
function accessoryBreak(p, slot) {
  const e = p.equip && p.equip[slot];
  if (!e || !e.item) return;
  const it = accessoryDef(p, e.item);
  const nome = it && it.n ? it.n : e.item;
  const ledger = accessoryChargesLedger(p);
  delete ledger[e.item];
  delete p.equip[slot];
  if (typeof addLog === "function") {
    addLog("info", `<b style="color:#ff9090">${nome[0].toUpperCase() + nome.slice(1)} quebrou!</b> (cargas esgotadas)`);
  }
  if (typeof toast === "function") toast(`${nome[0].toUpperCase() + nome.slice(1)} quebrou — cargas esgotadas.`, "bad");
  // o Helper de equipamento tenta repor o item configurado na hora
  if (typeof tryAccessoryHelper === "function") {
    try { tryAccessoryHelper(null, p, Date.now()); } catch (err) { /* segue */ }
  }
  if (typeof save === "function") save();
}

/* Tick de cargas por TEMPO (chamado do loop principal e do bg tick):
 * 1 carga a cada 3s para cada anel/amuleto equipado com cargas. */
function tickAccessoryCharges(p, dt) {
  if (!p || !p.equip || !dt) return;
  for (const slot of ["ring", "amulet"]) {
    const e = p.equip[slot];
    if (!e || !e.item) continue;
    const it = accessoryDef(p, e.item);
    if (!it || !it.charges || it.chargeMode !== "time") continue;
    if (e.charges === undefined) e.charges = it.charges;
    if (e.maxCharges === undefined) e.maxCharges = it.charges;
    e._chargeAcc = (e._chargeAcc || 0) + dt;
    const CHG_MS = 3000;   // 1 carga / 3s -> 200 cargas = 10 min (time ring)
    while (e._chargeAcc >= CHG_MS) {
      e._chargeAcc -= CHG_MS;
      e.charges = Math.max(0, parseInt(e.charges, 10) - 1);
      if (e.charges <= 0) {
        accessoryBreak(p, slot);
        break;
      }
    }
  }
}

/* Cargas atuais do item equipado (para a UI). */
function accessoryChargesNow(p, slot) {
  const e = p.equip && p.equip[slot];
  if (!e || !e.item) return null;
  const it = accessoryDef(p, e.item);
  if (!it || !it.charges) return null;
  return {
    now: e.charges === undefined ? it.charges : e.charges,
    max: e.maxCharges || it.charges,
    mode: it.chargeMode || "time",
    slug: e.item,
  };
}

function ensureAccessoryConfig(p) {
  if (!p.config) p.config = {};
  if (!p.config.equipHelper) p.config.equipHelper = {};
  ["amulet", "ring"].forEach((slot) => {
    const c = p.config.equipHelper[slot] || {};
    p.config.equipHelper[slot] = {
      enabled: c.enabled !== undefined ? !!c.enabled : true,
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
  p.config.magicShield = {
    enabled: !!ms.enabled,
    useSpell: ms.useSpell !== undefined ? !!ms.useSpell : true,
    hpBelow: Math.max(1, Math.min(99, parseInt(ms.hpBelow, 10) || 45)),
    mpAbove: Math.max(0, Math.min(100, parseInt(ms.mpAbove, 10) || 15)),
    recastBelow: Math.max(1, Math.min(99, parseInt(ms.recastBelow, 10) || 70)),
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
  // sistema de cargas: guarda o saldo antes de devolver o item à mochila
  if (entry.charges !== undefined) {
    rememberAccessoryCharges(p, entry.item, entry.charges);
  }
  if (entry.instId && typeof takeEquippedItemInstance === "function") {
    const slot = (entry._slot || entry.slot || entry.s || "");
    const inst = slot ? takeEquippedItemInstance(p, slot) : null;
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
  if (preferred === "bag" && typeof addItem === "function" && addItem(p, entry.item, 1)) return true;
  if (typeof addLootPouch === "function") return addLootPouch(p, entry.item, 1);
  return typeof addItem === "function" ? addItem(p, entry.item, 1) : false;
}

function equipItemFromContainer(p, slug, source, targetSlot, instId) {
  const chk = canEquipItem(p, slug, targetSlot);
  if (!chk.ok) { if (typeof toast === "function") toast(chk.msg, "bad"); return false; }
  const it = GAMEDATA.items[slug];
  const slot = chk.slot;

  if (slot === "ammo") {
    if (typeof setActiveAmmo === "function") setActiveAmmo(p, slug);
    if (typeof toast === "function") toast(`Munição no quiver: <b>${it.n}</b>`);
    return true;
  }

  let takenInst = null;
  if (source === "bag") {
    if (typeof itemUsesInstances === "function" && itemUsesInstances(slug)) {
      takenInst = takeBagItemInstance(p, slug, { instId: instId, highestTier: true });
      if (!takenInst) return false;
    } else if (!removeItem(p, slug, 1)) return false;
  } else if (source === "pouch") {
    if (!removeLootPouch(p, slug, 1)) return false;
  } else if (source === "equip") {
    return true;
  }

  const old = p.equip[slot];
  let oldInst = null;
  if (old && old.item !== slug) {
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

  if (takenInst) equipEntryInstance(p, slot, takenInst);
  else p.equip[slot] = { item: slug, count: 1 };

  // sistema de cargas: anel/amuleto equipa com o saldo da última instância
  // (ou cheio) e o contador passa a drenar por tempo/golpe. Vale também
  // para itens que usam instância (o equipEntryInstance não carrega cargas).
  const cc = accessoryChargesOnEquip(p, p.equip[slot].item);
  if (cc !== null && p.equip[slot].charges === undefined) {
    p.equip[slot].charges = cc;
    p.equip[slot].maxCharges = it.charges || cc;
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
  if (slot === "backpack") { if (typeof toast === "function") toast("A bag padrão não pode ser removida."); return false; }
  if (slot === "ammo") { if (typeof setActiveAmmo === "function") setActiveAmmo(p, null); return true; }
  const e = p.equip[slot];
  // sistema de cargas: guarda o saldo antes de devolver o item à mochila
  if (e.charges !== undefined) rememberAccessoryCharges(p, e.item, e.charges);
  let ok = false;
  if (e.instId && typeof takeEquippedItemInstance === "function") {
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
    if (dest === "bag") ok = addItem(p, e.item, 1);
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
  if (payload.source === "pouch") {
    const count = p.lootPouch && p.lootPouch[payload.slug] ? p.lootPouch[payload.slug] : 0;
    if (count <= 0) return false;
    if (!addItem(p, payload.slug, count)) { if (typeof toast === "function") toast("Mochila cheia."); return false; }
    removeLootPouch(p, payload.slug, count);
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
  for (const slug in (p.lootPouch || {})) {
    const it = GAMEDATA.items[slug];
    if (it && it.s === slot && (p.lootPouch[slug] || 0) > 0) out[slug] = (out[slug] || 0) + p.lootPouch[slug];
  }
  if (p.equip && p.equip[slot]) out[p.equip[slot].item] = (out[p.equip[slot].item] || 0) + 1;
  return out;
}

function accessoryItemList(p, slot, include) {
  const counts = accessoryAvailableCounts(p, slot);
  if (include) counts[include] = counts[include] || 0;
  return Object.keys(counts).filter((slug) => GAMEDATA.items[slug])
    .sort((a, b) => (GAMEDATA.items[a].lvl || 0) - (GAMEDATA.items[b].lvl || 0) ||
                    GAMEDATA.items[a].n.localeCompare(GAMEDATA.items[b].n));
}

function accessorySelectHtml(p, slot, value, id) {
  const list = accessoryItemList(p, slot, value);
  return `<select id="${id}" style="width:100%;padding:6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
    <option value="" ${!value ? "selected" : ""}>Nenhum</option>
    ${list.map((slug) => `<option value="${slug}" ${value === slug ? "selected" : ""}>${GAMEDATA.items[slug].n}</option>`).join("")}
  </select>`;
}

function accessoryEquipConfigured(p, slot, slug) {
  const cur = p.equip && p.equip[slot] ? p.equip[slot].item : "";
  if (cur === slug) return true;
  if (!slug) {
    if (p.equip && p.equip[slot]) return unequipToContainer(p, slot, "pouch");
    return true;
  }
  if (p.bag && p.bag[slug] > 0) return equipItemFromContainer(p, slug, "bag", slot);
  if (p.lootPouch && p.lootPouch[slug] > 0) return equipItemFromContainer(p, slug, "pouch", slot);
  if (typeof toast === "function") toast(`${itemName(slug)} não está na mochila nem na Loot Pouch.`, "bad");
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

function renderEquipmentHelper(p) {
  ensureAccessoryConfig(p);
  const slot = HELPER_EQUIP_UI.slot || "amulet";
  const cfg = p.config.equipHelper[slot];
  const counts = accessoryAvailableCounts(p, slot);
  const pouchIcons = Object.keys(counts).slice(0, 12).map((slug) =>
    `<div class="inv-item ${itemClsBorder(slug)}" style="width:34px;height:34px;cursor:default" title="${itemName(slug)} · ${counts[slug]}x">
      ${itemImg(slug)}${counts[slug] > 1 ? `<span class="cnt">${counts[slug]}</span>` : ""}</div>`).join("");

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
          return `<div class="tiny mb4">Equipado: <b>${eqNome}</b>
            · <span class="charge-highlight" style="color:#ffe680">⚡ ${cg.now}/${cg.max} cargas</span>
            <span class="dim">(${modo})</span></div>`;
        }
        return eqNome ? `<div class="tiny mb4">Equipado: <b>${eqNome}</b></div>` : "";
      })()}
      <div class="row" style="gap:12px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="tiny" style="color:#ff9090;font-weight:bold">EMERGENCIAL</div>
          ${accessorySelectHtml(p, slot, cfg.emergency, "helper-equip-emergency")}
          <label class="small dim mt8">Equipar com vida abaixo de (%)</label>
          <input id="helper-equip-below" type="number" min="1" max="99" value="${cfg.equipBelow}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
        <div style="flex:1;min-width:0">
          <div class="tiny" style="color:#7ae87a;font-weight:bold">PADRÃO</div>
          ${accessorySelectHtml(p, slot, cfg.normal, "helper-equip-normal")}
          <label class="small dim mt8">Restaurar com vida acima de (%)</label>
          <input id="helper-equip-above" type="number" min="1" max="99" value="${cfg.restoreAbove}"
            style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        </div>
      </div>
      <div class="small dim mt10 mb4">Na mochila / Loot Pouch</div>
      <div class="row wrap" style="gap:5px">${pouchIcons || `<div class="tiny dim">Nenhum ${slot === "amulet" ? "amuleto" : "anel"} disponível.</div>`}</div>
      <div class="tiny dim mt8">Veste o item emergencial quando a vida cai e devolve o padrão quando recupera. Os itens precisam estar na mochila ou na Loot Pouch.</div>
    </div>`;
}

function bindEquipmentHelper(p) {
  ensureAccessoryConfig(p);
  const rer = () => { const el = document.getElementById("helper-equipment"); if (el) { el.innerHTML = renderEquipmentHelper(p); bindEquipmentHelper(p); } };
  document.querySelectorAll("#helper-equipment [data-helper-equip-slot]").forEach((b) =>
    b.addEventListener("click", () => { HELPER_EQUIP_UI.slot = b.dataset.helperEquipSlot; rer(); }));
  const slot = HELPER_EQUIP_UI.slot || "amulet";
  const cfg = p.config.equipHelper[slot];
  const enabled = document.getElementById("helper-equip-enabled");
  if (enabled) enabled.addEventListener("change", () => { cfg.enabled = enabled.checked; if (typeof save === "function") save(); rer(); });
  const em = document.getElementById("helper-equip-emergency");
  if (em) em.addEventListener("change", () => { cfg.emergency = em.value; if (typeof save === "function") save(); rer(); });
  const no = document.getElementById("helper-equip-normal");
  if (no) no.addEventListener("change", () => { cfg.normal = no.value; if (typeof save === "function") save(); rer(); });
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
  return energyRingEquipped(p) || ((p.magicShieldUntil || 0) > now);
}

function magicShieldSource(p, now) {
  if (energyRingEquipped(p)) return "Energy Ring";
  if ((p.magicShieldUntil || 0) > (now || Date.now())) return "Magic Shield";
  return "";
}

function magicShieldSpellAllowed(p) {
  const s = typeof SPELLS !== "undefined" ? SPELLS[MAGIC_SHIELD_SPELL_ID] : null;
  if (!s) return false;
  return !s.vocs || s.vocs.indexOf(p.voc) !== -1;
}

function tryMagicShield(c, p, now) {
  ensureAccessoryConfig(p);
  const cfg = p.config.magicShield;
  if (!cfg.enabled || !cfg.useSpell) return false;
  if (isMagicShieldActive(p, now)) return false;
  const s = SPELLS[MAGIC_SHIELD_SPELL_ID];
  if (!s || !magicShieldSpellAllowed(p)) return false;
  const max = maxStats(p);
  const hpPct = max.hp ? (p.hp / max.hp) * 100 : 100;
  const mpPct = max.mp ? (p.mp / max.mp) * 100 : 0;
  if (hpPct > cfg.hpBelow || mpPct < cfg.mpAbove) return false;
  if (p.level < (s.lvl || 1) || p.mp < s.mana) return false;
  if (typeof cdReady === "function" && !cdReady(p, MAGIC_SHIELD_SPELL_ID, now)) return false;
  p.mp -= s.mana;
  if (typeof addManaSpent === "function") addManaSpent(p, combatManaSkillGain(c, s.mana));
  if (typeof cdStart === "function") cdStart(p, MAGIC_SHIELD_SPELL_ID, s, now);
  p.magicShieldUntil = now + MAGIC_SHIELD_DURATION_MS;
  if (typeof entCdSet === "function") entCdSet(c, p, "magicShieldCd", now + 1000);
  else c.magicShieldCd = now + 1000;
  if (c.events) {
    c.events.push({ t: "say", text: s.words || "utamo vita" });
    c.events.push({ t: "magic-shield-on", x: c.player ? c.player.x : 0.13, y: c.player ? c.player.y : 0.6, screen: true });
  }
  return true;
}

function applyMagicShieldAbsorb(c, p, raw, meta) {
  raw = Math.max(0, Math.floor(raw || 0));
  if (raw <= 0 || !isMagicShieldActive(p, Date.now())) return raw;
  const mana = Math.min(Math.max(0, Math.floor(p.mp || 0)), raw);
  if (mana <= 0) return raw;
  p.mp -= mana;
  const rest = raw - mana;
  if (c && c.stats) c.stats.magicShieldAbsorbed = (c.stats.magicShieldAbsorbed || 0) + mana;
  if (c && c.events) {
    c.events.push({ t: "magic-shield", mana: mana, rest: rest,
      x: meta && meta.x, y: meta && meta.y, sx: meta && meta.sx, sy: meta && meta.sy,
      el: meta && meta.el, screen: true, source: magicShieldSource(p) });
  }
  if (p.mp <= 0 && p.magicShieldUntil) p.magicShieldUntil = 0;
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
        <label class="toggle tiny"><input type="checkbox" id="ms-enabled" ${cfg.enabled ? "" : "checked"}> INATIVO</label>
      </div>
      <div class="stat-row mt8"><span class="k">Estado</span><span class="v" style="color:${active ? "#7ec8ff" : "#888"}">${active ? "ATIVO · " + src : "inativo"}</span></div>
      ${active && !energyRingEquipped(p) ? `<div class="stat-row"><span class="k">Tempo</span><span class="v">${fmtTime(((p.magicShieldUntil || now) - now) / 1000)}</span></div>` : ""}
      ${spellOk ? `<label class="toggle mt8"><input type="checkbox" id="ms-use-spell" ${cfg.useSpell ? "checked" : ""}>
        Usar spell <b>${s ? s.words : "utamo vita"}</b></label>` : ""}
      <div class="row" style="gap:12px;align-items:flex-start;margin-top:8px">
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
  const en = document.getElementById("ms-enabled");
  if (en) en.addEventListener("change", () => { cfg.enabled = !en.checked; if (typeof save === "function") save(); rer(); });
  const us = document.getElementById("ms-use-spell");
  if (us) us.addEventListener("change", () => { cfg.useSpell = us.checked; if (typeof save === "function") save(); rer(); });
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
    if (typeof toast === "function") toast("Energy Ring definido como anel emergencial.");
    if (typeof save === "function") save();
    rer();
  });
}
