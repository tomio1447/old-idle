"use strict";

const recipes = require("../game/js/cosmetic-npcs-data");
const window = {};
new Function("window", require("fs").readFileSync(require("path").join(__dirname, "../game/js/appearancedata.js"), "utf8"))(window);
const appearances = window.APPEARANCES;
const outfits = new Map(appearances.outfits.map((o) => [o.id, o]));
const mounts = new Map(appearances.mounts.map((m) => [m.id, m]));
const pairs = { noblewoman: "nobleman", norsewoman: "norseman", "retro-noblewoman": "retro-nobleman" };
const starters = ["citizen", "hunter", "mage", "knight", "summoner", "monk"];

function object(value) {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch (e) { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function key(id) {
  const base = String(id).replace(/-[mf](-\d+)?$/, "").replace(/-\d+$/, "");
  return pairs[base] || base;
}

function migrate(account, characters) {
  const cosmetics = object(account.cosmetics);
  cosmetics.outfits = Object.assign({}, object(cosmetics.outfits));
  cosmetics.mounts = Object.assign({}, object(cosmetics.mounts));
  cosmetics.addonBits = Object.assign({}, object(cosmetics.addonBits));
  for (const base of starters) if (cosmetics.outfits[base] === undefined) cosmetics.outfits[base] = 0;
  for (const character of characters) {
    const p = object(character.data);
    for (const [id, value] of Object.entries(object(object(p.wardrobe).outfits))) {
      if (!outfits.has(id)) continue;
      const base = key(id), count = Math.max(0, Math.min(3, Number(value) || 0));
      const mask = count >= 2 ? 3 : count >= 1 ? 1 : 0;
      const canonicalMask = id === "hunter-f" ? ((mask & 1) << 1) | ((mask & 2) >> 1) : mask;
      cosmetics.addonBits[base] = (Number(cosmetics.addonBits[base]) || 0) | canonicalMask;
      if (cosmetics.outfits[base] === undefined) cosmetics.outfits[base] = 0;
    }
    for (const [id, owned] of Object.entries(object(object(p.wardrobe).mounts)))
      if (owned && mounts.has(id)) cosmetics.mounts[id] = true;
    if (Number(object(object(p.bosses)["doctor-marrow"]).kills) > 0 || Number(object(p.kills)["doctor-marrow"]) > 0)
      cosmetics.mounts["mutated-abomination"] = true;
    if (Number(object(object(p.bosses).vladrukh).kills) > 0 || Number(object(p.kills).vladrukh) > 0)
      cosmetics.mounts["gloom-maw"] = true;
  }
  for (const [id, owned] of Object.entries(object(account.mounts)))
    if (owned && mounts.has(id)) cosmetics.mounts[id] = true;
  for (const [id, count] of Object.entries(cosmetics.outfits)) {
    const mask = Number(count) >= 2 ? 3 : Number(count) >= 1 ? 1 : 0;
    cosmetics.addonBits[id] = (Number(cosmetics.addonBits[id]) || 0) | mask;
  }
  if (object(account.tutorial).rewardGranted && !object(account.tutorial).skipped)
    cosmetics.mounts.landsailer = true;
  account.cosmetics = cosmetics;
  return cosmetics;
}

function owned(cosmetics, recipe) {
  if (recipe.kind === "mount") return !!cosmetics.mounts[recipe.target];
  if (recipe.kind === "outfit") return cosmetics.outfits[recipe.target] !== undefined;
  const bits = Number(cosmetics.addonBits[recipe.target]) || 0;
  return (bits & recipe.addon) === recipe.addon;
}

function catalog(account, characters) {
  const cosmetics = migrate(account, characters);
  return recipes.map((recipe) => {
    const appearance = recipe.kind === "mount" ? mounts.get(recipe.target)
      : appearances.outfits.find((o) => key(o.id) === recipe.target);
    const available = !!appearance && !recipe.requirement;
    const name = appearance ? appearance.nome : recipe.target.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join(" ");
    return Object.assign({}, recipe, { name, owned: owned(cosmetics, recipe), available,
      reason: recipe.requirement ? recipe.label : !appearance ? "Aparência ainda não disponível no cliente" : "" });
  });
}

function exchange(account, characters, shared, recipeId, alternative) {
  const cosmetics = migrate(account, characters);
  const recipe = recipes.find((r) => r.id === recipeId);
  if (!recipe) return { ok: false, msg: "Troca desconhecida." };
  if (owned(cosmetics, recipe)) return { ok: false, msg: "Sua conta já possui este desbloqueio." };
  const entry = catalog(account, characters).find((r) => r.id === recipeId);
  if (!entry.available) return { ok: false, msg: entry.reason };
  const costs = (recipe.alternatives || [])[alternative];
  if (!costs) return { ok: false, msg: "Receita inválida." };
  if (recipe.kind === "addon" && recipe.requireBase && cosmetics.outfits[recipe.target] === undefined)
    return { ok: false, msg: "Desbloqueie a outfit base primeiro." };
  const bag = object(shared.bag);
  if (recipe.catalyst && !(Number(bag[recipe.catalyst]) > 0))
    return { ok: false, msg: "Tenha na Bag: " + recipe.catalyst + " (não será consumido)." };
  for (const cost of costs)
    if ((Number(bag[cost.slug]) || 0) < cost.count)
      return { ok: false, msg: "Itens insuficientes na Bag: " + cost.slug + " (" + cost.count + ")." };
  for (const cost of costs) {
    bag[cost.slug] -= cost.count;
    if (bag[cost.slug] <= 0) delete bag[cost.slug];
    let remaining = cost.count;
    shared.itemInstances = (shared.itemInstances || []).filter((instance) => {
      if (remaining > 0 && instance && instance.slug === cost.slug && instance.loc === "bag") {
        remaining--; return false;
      }
      return true;
    });
  }
  shared.bag = bag;
  if (recipe.kind === "mount") cosmetics.mounts[recipe.target] = true;
  else if (recipe.kind === "outfit") cosmetics.outfits[recipe.target] = 0;
  else {
    cosmetics.addonBits[recipe.target] = (Number(cosmetics.addonBits[recipe.target]) || 0) | recipe.addon;
    cosmetics.outfits[recipe.target] = cosmetics.addonBits[recipe.target] === 3 ? 2 : 0;
  }
  return { ok: true, msg: entry.name + " desbloqueado para toda a conta!" };
}

function mergeCosmetics(prior, incoming) {
  prior = object(prior); incoming = object(incoming);
  const out = Object.assign({}, prior, incoming);
  for (const field of ["outfits", "addonBits", "mounts"]) {
    out[field] = Object.assign({}, object(prior[field]));
    for (const [id, value] of Object.entries(object(incoming[field]))) {
      if (field === "outfits") out[field][id] = Math.max(Number(out[field][id]) || 0, Number(value) || 0);
      else if (field === "addonBits") out[field][id] = (Number(out[field][id]) || 0) | (Number(value) || 0);
      else if (value) out[field][id] = true;
    }
  }
  return out;
}

function applyToPlayer(player, account) {
  const cos = object(account && account.cosmetics);
  player._accountCosmetics = {
    outfits: Object.assign({}, object(cos.outfits)),
    addonBits: Object.assign({}, object(cos.addonBits)),
    mounts: Object.assign({}, object(cos.mounts)),
  };
  return player;
}

module.exports = { object, key, migrate, catalog, exchange, mergeCosmetics, applyToPlayer };
