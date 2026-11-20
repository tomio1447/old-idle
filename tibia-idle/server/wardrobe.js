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
  // Recompensas cosméticas por CONTA derivadas de missionsDone (autoridade).
  // O claim via /api/account/missions persiste só a flag; os cosméticos
  // derivam daqui — cura retroativa de claims feitos antes do grant ser
  // durável no servidor (o cliente só escrevia sessionStorage).
  const done = object(account.missionsDone);
  /* Make Believe: a recompensa decorre da MISSÃO CONCLUÍDA (fato), não só do
   * claim manual — progresso por conta, mas a flag pode existir só no char
   * que jogou (ou ter sido injetada). M1→outfit, M3→montaria (elmo/arma
   * seguem roleta manual). */
  const mProg = (ms, id) => Number(object(object(object(ms)[id]).progress).kills) || 0;
  const accMissions = object(account.missions);
  let mbM1 = !!done["moonstone-castle"] || mProg(accMissions, "moonstone-castle") >= 2500;
  let mbM3 = !!done["radiant-skyhold"] || mProg(accMissions, "radiant-skyhold") >= 5000;
  for (const character of characters) {
    if (mbM1 && mbM3) break;
    const p = object(character.data);
    const pd = object(p.missionsDone), pm = object(p.missions);
    if (!mbM1) mbM1 = !!pd["moonstone-castle"] || mProg(pm, "moonstone-castle") >= 2500;
    if (!mbM3) mbM3 = !!pd["radiant-skyhold"] || mProg(pm, "radiant-skyhold") >= 5000;
  }
  if (done["make-believe:outfit"] || mbM1)
    cosmetics.outfits["illuminated-warrior"] =
      Math.max(2, Number(cosmetics.outfits["illuminated-warrior"]) || 0);
  if (done["make-believe:mount"] || mbM3) cosmetics.mounts["radiant-nimbus"] = true;
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

/* Itens de troca valem da Bag OU da Loot Pouch (o loot das hunts cai na
 * pouch — exigir a mochila fazia o NPC recusar a troca com o item na conta). */
function sharedCount(shared, slug) {
  const bag = object(shared && shared.bag), pouch = object(shared && shared.lootPouch);
  return (Number(bag[slug]) || 0) + (Number(pouch[slug]) || 0);
}

function catalog(account, characters, shared) {
  const cosmetics = migrate(account, characters);
  return recipes.map((recipe) => {
    const appearance = recipe.kind === "mount" ? mounts.get(recipe.target)
      : appearances.outfits.find((o) => key(o.id) === recipe.target);
    const available = !!appearance && !recipe.requirement;
    const name = appearance ? appearance.nome : recipe.target.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join(" ");
    const entry = Object.assign({}, recipe, { name, owned: owned(cosmetics, recipe), available,
      reason: recipe.requirement ? recipe.label : !appearance ? "Aparência ainda não disponível no cliente" : "" });
    /* `enough`/`have` autoritativos (shared da conta): o botão Trocar do
     * modal não depende mais do espelho local G.p.bag, que podia estar
     * atrasado e deixar a troca impossível com o item na conta. */
    if (shared) {
      entry.have = {};
      for (const items of recipe.alternatives || [])
        for (const cost of items) entry.have[cost.slug] = sharedCount(shared, cost.slug);
      if (recipe.catalyst) entry.have[recipe.catalyst] = sharedCount(shared, recipe.catalyst);
      entry.enough = (recipe.alternatives || []).map((items) =>
        items.every((i) => sharedCount(shared, i.slug) >= i.count)
        && (!recipe.catalyst || sharedCount(shared, recipe.catalyst) > 0));
    }
    return entry;
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
  const bag = object(shared.bag), pouch = object(shared.lootPouch);
  if (recipe.catalyst && !(sharedCount(shared, recipe.catalyst) > 0))
    return { ok: false, msg: "Tenha na Bag ou Loot Pouch: " + recipe.catalyst + " (não será consumido)." };
  for (const cost of costs)
    if (sharedCount(shared, cost.slug) < cost.count)
      return { ok: false, msg: "Itens insuficientes na Bag ou Loot Pouch: " + cost.slug + " (" + cost.count + ")." };
  for (const cost of costs) {
    /* Consome da Bag primeiro; o que faltar sai da Loot Pouch. Instâncias de
     * item (imbSlots etc.) só existem na Bag — a pouch é stack puro. */
    let remaining = cost.count;
    const fromBag = Math.min(Number(bag[cost.slug]) || 0, remaining);
    if (fromBag > 0) {
      bag[cost.slug] -= fromBag;
      if (bag[cost.slug] <= 0) delete bag[cost.slug];
      remaining -= fromBag;
    }
    if (remaining > 0) {
      pouch[cost.slug] = (Number(pouch[cost.slug]) || 0) - remaining;
      if (pouch[cost.slug] <= 0) delete pouch[cost.slug];
    }
    let instLeft = fromBag;
    shared.itemInstances = (shared.itemInstances || []).filter((instance) => {
      if (instLeft > 0 && instance && instance.slug === cost.slug && instance.loc === "bag") {
        instLeft--; return false;
      }
      return true;
    });
  }
  shared.bag = bag;
  shared.lootPouch = pouch;
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
