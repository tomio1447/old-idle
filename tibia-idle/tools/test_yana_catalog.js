"use strict";
const assert = require("assert");
const { loadImbData, buildYanaCatalog, YANA_CATALOG, applyYanaPurchase, tokenCount } = require("../server/yana_catalog");

const data = loadImbData();
const groups = data.groups || data.imbs;
const expectedOffers = Object.values(groups).reduce((sum, group) => sum + [1, 2, 3].filter((tier) =>
  group.tiers && group.tiers[tier] && Array.isArray(group.tiers[tier].items) && group.tiers[tier].items.length).length, 0);
assert.strictEqual(YANA_CATALOG.length, expectedOffers, "catálogo deve incluir todos os grupos e tiers");
assert.deepStrictEqual(Array.from(new Set(YANA_CATALOG.map((offer) => offer.cost))).sort((a,b) => a-b), [2, 4, 6]);
assert.strictEqual(new Set(YANA_CATALOG.map((offer) => offer.id)).size, YANA_CATALOG.length, "IDs únicos");

for (const offer of buildYanaCatalog(data)) {
  assert.strictEqual(offer.cost, offer.tier * 2);
  assert.strictEqual(JSON.stringify(offer.items.map((item) => [item.cid, item.count])),
    JSON.stringify(groups[offer.key].tiers[offer.tier].items), "entrega deve ser derivada exatamente de IMBDATA");
  assert.ok(offer.items.every((item) => item.slug === "mat-" + item.cid));
}

const offer = YANA_CATALOG.find((entry) => entry.tier === 3);
const player = { lootPouch: { "gold-token": 2 }, bag: { "gold-token": 5 } };
const result = applyYanaPurchase(player, offer.id);
assert.strictEqual(result.ok, true);
assert.strictEqual(tokenCount(player), 1, "deve cobrar exatamente 6 Gold Tokens entre pouch e bag");
for (const item of offer.items) assert.strictEqual(player.lootPouch[item.slug], item.count, "material entregue na Loot Pouch");
const before = JSON.stringify(player);
assert.strictEqual(applyYanaPurchase(player, "arbitrary-payload").ok, false, "oferta arbitrária recusada");
assert.strictEqual(JSON.stringify(player), before, "payload inválido não pode mutar inventário");
console.log(`Yana catalog: ${YANA_CATALOG.length} ofertas validadas.`);
