/* supply-stash.js — Supply Stash (Baiak SUPPLY POUCH / Canary supply stash).
 *
 * Guarda rings/amulets com cargas usados como supply. Preferência por item
 * (Auto Supply Stash) desvia loot da loot pouch para cá. Equip helper e
 * menus puxam de bag + loot pouch + supply stash.
 *
 * Contêiner: mapa slug → quantidade (vários tipos distintos, até CAP slots).
 */
"use strict";

const SUPPLY_STASH_CAP =
  (typeof SUPPLY_STASH_MAX_SLOTS !== "undefined" ? SUPPLY_STASH_MAX_SLOTS : 20);

function ensureSupplyStash(p) {
  if (!p) return {};
  // Array / null / primitivo: normaliza para mapa plano (evita “1 slot” fantasma).
  if (!p.supplyStash || typeof p.supplyStash !== "object" || Array.isArray(p.supplyStash)) {
    p.supplyStash = {};
  }
  if (!p.config) p.config = {};
  if (!p.config.autoSupplyStash || typeof p.config.autoSupplyStash !== "object" ||
      Array.isArray(p.config.autoSupplyStash)) {
    p.config.autoSupplyStash = {};
  }
  return p.supplyStash;
}

function isSupplyStashableItem(slug) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items)
    ? GAMEDATA.items[slug]
    : (typeof ITEMS !== "undefined" ? ITEMS[slug] : null);
  if (!it) return false;
  if (it.supplyStashable) return true;
  return !!(it.charges && (it.s === "ring" || it.s === "amulet" ||
    it.slot === "ring" || it.slot === "necklace"));
}

function isAutoSupplyStash(p, slug) {
  if (!p || !slug || !isSupplyStashableItem(slug)) return false;
  ensureSupplyStash(p);
  return !!p.config.autoSupplyStash[slug];
}

function setAutoSupplyStash(p, slug, on) {
  if (!p || !slug || !isSupplyStashableItem(slug)) return false;
  ensureSupplyStash(p);
  if (on) p.config.autoSupplyStash[slug] = true;
  else delete p.config.autoSupplyStash[slug];
  return true;
}

function supplyStashSlotsUsed(p) {
  ensureSupplyStash(p);
  let n = 0;
  for (const slug of Object.keys(p.supplyStash)) {
    if ((p.supplyStash[slug] || 0) > 0) n++;
  }
  return n;
}

/** Adiciona ao stash. opts.allowPouchOverflow (default true) só para loot auto. */
function addSupplyStash(p, slug, count, opts) {
  if (!p || !slug || !isSupplyStashableItem(slug)) return false;
  count = Math.max(1, Math.floor(Number(count) || 1));
  const allowOverflow = !(opts && opts.allowPouchOverflow === false);
  ensureSupplyStash(p);
  const had = (p.supplyStash[slug] || 0) > 0;
  if (!had && supplyStashSlotsUsed(p) >= SUPPLY_STASH_CAP) {
    // Overflow de loot: cai na pouch. Move manual nunca deve “copiar” de volta.
    if (allowOverflow && typeof addLootPouch === "function") return addLootPouch(p, slug, count);
    return false;
  }
  p.supplyStash[slug] = (p.supplyStash[slug] || 0) + count;
  return true;
}

function removeSupplyStash(p, slug, count) {
  count = count || 1;
  ensureSupplyStash(p);
  if ((p.supplyStash[slug] || 0) < count) return false;
  p.supplyStash[slug] -= count;
  if (p.supplyStash[slug] <= 0) delete p.supplyStash[slug];
  return true;
}

/** Loot de hunt: skip NÃO COLETAR; moedas → gold; auto-stash → supply stash; senão pouch. */
function routeLootItem(p, slug, count) {
  count = Math.max(1, Math.floor(Number(count) || 1));
  if (typeof isNoCollect === "function" && isNoCollect(p, slug)) return false;
  if (typeof currencyValue === "function" && currencyValue(slug)) {
    if (typeof creditCurrency === "function") creditCurrency(p, slug, count);
    return true;
  }
  const weight = (typeof itemUnitWeight === "function" ? itemUnitWeight(slug) : 0.1) * count;
  if (typeof freeCapacity === "function" && weight > freeCapacity(p) + 1e-9) {
    if (typeof addLog === "function") {
      addLog("death", typeof capacityMessage === "function" ? capacityMessage() : "You cannot carry more.");
    }
    return false;
  }
  if (isAutoSupplyStash(p, slug)) return addSupplyStash(p, slug, count);
  if (typeof addLootPouch === "function") return addLootPouch(p, slug, count);
  return false;
}

function accessoryDisplaySlug(slug, equipped) {
  if (!equipped || !slug) return slug;
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items)
    ? GAMEDATA.items[slug] : null;
  if (it && it.transformEquipSlug) return it.transformEquipSlug;
  return slug;
}

/**
 * Move bag/pouch/equip → supply stash.
 * Remove da origem ANTES de adicionar (evita cópia + item duplicado na pouch).
 * Stash cheio: falha (não devolve para a pouch).
 */
function moveItemToSupplyStash(p, payload) {
  if (!p || !payload || !payload.slug) return false;
  const slug = payload.slug;
  if (!isSupplyStashableItem(slug)) {
    if (typeof toast === "function") toast("Só rings/amulets com cargas vão para a Supply Stash.", "bad");
    return false;
  }
  const addOpts = { allowPouchOverflow: false };

  if (payload.source === "bag") {
    const count = p.bag && p.bag[slug] ? p.bag[slug] : 0;
    if (count <= 0) return false;
    delete p.bag[slug];
    if (!addSupplyStash(p, slug, count, addOpts)) {
      p.bag[slug] = (p.bag[slug] || 0) + count;
      if (typeof toast === "function") toast("Supply Stash cheia.", "bad");
      return false;
    }
    return true;
  }

  if (payload.source === "pouch") {
    const count = p.lootPouch && p.lootPouch[slug] ? p.lootPouch[slug] : 0;
    if (count <= 0) return false;
    if (typeof removeLootPouch !== "function") return false;
    if (!removeLootPouch(p, slug, count)) return false;
    if (!addSupplyStash(p, slug, count, addOpts)) {
      if (typeof addLootPouch === "function") addLootPouch(p, slug, count);
      else {
        p.lootPouch = p.lootPouch || {};
        p.lootPouch[slug] = (p.lootPouch[slug] || 0) + count;
      }
      if (typeof toast === "function") toast("Supply Stash cheia.", "bad");
      return false;
    }
    return true;
  }

  if (payload.source === "equip") {
    const e = p.equip && p.equip[payload.slot];
    if (!e || e.item !== slug) return false;
    const slot = payload.slot;
    const saved = Object.assign({}, e);
    if (e.charges !== undefined && typeof rememberAccessoryCharges === "function") {
      rememberAccessoryCharges(p, e.item, e.charges);
    }
    delete p.equip[slot];
    if (!addSupplyStash(p, slug, 1, addOpts)) {
      p.equip[slot] = saved;
      if (typeof toast === "function") toast("Supply Stash cheia.", "bad");
      return false;
    }
    return true;
  }
  return false;
}

/* Node / testes */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ensureSupplyStash, isSupplyStashableItem, isAutoSupplyStash, setAutoSupplyStash,
    supplyStashSlotsUsed, addSupplyStash, removeSupplyStash, routeLootItem,
    accessoryDisplaySlug, moveItemToSupplyStash, SUPPLY_STASH_CAP,
  };
}
