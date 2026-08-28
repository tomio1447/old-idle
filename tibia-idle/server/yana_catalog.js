"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TIER_COSTS = Object.freeze({ 1: 2, 2: 4, 3: 6 });

function loadImbData(file) {
  const source = fs.readFileSync(file || path.join(__dirname, "..", "game", "js", "imbuementdata.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "imbuementdata.js", timeout: 1000 });
  if (!sandbox.window.IMBDATA || !sandbox.window.IMBDATA.imbs) throw new Error("IMBDATA inválido");
  return sandbox.window.IMBDATA;
}

function buildYanaCatalog(data) {
  const imbs = data && (data.groups || data.imbs) || {};
  const categories = data && data.categories || {};
  const bases = data && data.bases || {};
  const offers = [];
  Object.keys(imbs).forEach((key, index) => {
    const group = imbs[key] || {};
    for (let tier = 1; tier <= 3; tier++) {
      const sourceItems = group.tiers && group.tiers[tier] && group.tiers[tier].items;
      if (!Array.isArray(sourceItems) || !sourceItems.length) continue;
      const items = sourceItems.map((row) => ({ cid: Number(row[0]), count: Number(row[1]), slug: "mat-" + Number(row[0]) }));
      if (items.some((item) => !Number.isSafeInteger(item.cid) || item.cid <= 0 || !Number.isSafeInteger(item.count) || item.count <= 0))
        throw new Error("Materiais inválidos em " + key);
      offers.push(Object.freeze({
        id: "imb-" + index + "-t" + tier,
        key,
        name: group.name || key,
        sub: group.sub || "",
        categoryId: Number(group.cat),
        category: categories[group.cat] || "Imbuement",
        tier,
        tierName: bases[tier] && bases[tier].name || String(tier),
        cost: TIER_COSTS[tier],
        items: Object.freeze(items.map(Object.freeze)),
      }));
    }
  });
  return Object.freeze(offers);
}

const YANA_CATALOG = buildYanaCatalog(loadImbData());
const YANA_BY_ID = new Map(YANA_CATALOG.map((offer) => [offer.id, offer]));

function yanaOffer(id) { return YANA_BY_ID.get(String(id || "")) || null; }
function tokenCount(player) {
  return Math.max(0, Math.floor(Number(player && player.lootPouch && player.lootPouch["gold-token"]) || 0)) +
    Math.max(0, Math.floor(Number(player && player.bag && player.bag["gold-token"]) || 0));
}
function applyYanaPurchase(player, offerId) {
  const offer = yanaOffer(offerId);
  if (!player || !offer) return { ok: false, error: "YANA_INVALID_OFFER", msg: "Pacote inválido." };
  if (tokenCount(player) < offer.cost) return { ok: false, error: "YANA_TOKENS", msg: "Gold Tokens insuficientes." };
  player.lootPouch = player.lootPouch || {};
  player.bag = player.bag || {};
  let remaining = offer.cost;
  for (const container of [player.lootPouch, player.bag]) {
    const take = Math.min(remaining, Math.max(0, Math.floor(Number(container["gold-token"]) || 0)));
    if (take) {
      container["gold-token"] -= take;
      if (container["gold-token"] <= 0) delete container["gold-token"];
      remaining -= take;
    }
  }
  for (const item of offer.items) player.lootPouch[item.slug] = (Number(player.lootPouch[item.slug]) || 0) + item.count;
  return { ok: true, offer, goldTokens: tokenCount(player) };
}

module.exports = { TIER_COSTS, loadImbData, buildYanaCatalog, YANA_CATALOG, yanaOffer, tokenCount, applyYanaPurchase };
