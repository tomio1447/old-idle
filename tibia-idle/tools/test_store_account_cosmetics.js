"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const root = path.join(__dirname, ".."), store = require("../server/store");
(async () => {
  const acc = { id: 1, login: "test", coins: 500, cosmetics: { outfits: { citizen: 0 }, mounts: {}, bless: 2, preyCards: 5 } };
  const db = {
    findAccountByToken: async (token) => token === "test" ? acc : null,
    updateCoins: async (id, coins) => { acc.coins = coins; return acc; },
    setAccountCosmetics: async (id, cosmetics) => { acc.cosmetics = cosmetics; return acc; },
  };
  const catalog = store.cosmeticCatalog();
  const outfitId = Object.keys(catalog.outfits).find((id) => id !== "citizen");
  const purchased = await store.buyCosmetic(db, { token: "test", kind: "outfit", id: outfitId });
  assert(purchased.body.ok); assert.equal(acc.coins, 375);
  assert.equal(purchased.body.cosmetics.outfits[outfitId], 3);
  assert.equal(purchased.body.cosmetics.outfits.citizen, 3);
  assert.equal(acc.cosmetics.bless, 2); assert.equal(acc.cosmetics.preyCards, 5);
  const duplicate = await store.buyCosmetic(db, { token: "test", kind: "outfit", id: outfitId });
  assert(!duplicate.body.ok); assert.equal(acc.coins, 375);
  const mountId = Object.keys(catalog.mounts)[0];
  const mount = await store.buyCosmetic(db, { token: "test", kind: "mount", id: mountId });
  assert(mount.body.ok && mount.body.cosmetics.mounts[mountId]); assert.equal(acc.coins, 250);
  assert.equal((await store.buyCosmetic(db, { token: "invalid", kind: "outfit", id: outfitId })).code, 401);
  let account = { cosmetics: { outfits: { citizen: 0 }, mounts: { [mountId]: true } } };
  const appearance = { console, sessionAccount: () => account };
  appearance.window = appearance;
  vm.createContext(appearance);
  vm.runInContext(fs.readFileSync(path.join(root, "game/js/appearancedata.js"), "utf8"), appearance);
  vm.runInContext(fs.readFileSync(path.join(root, "game/js/appearance.js"), "utf8"), appearance);
  appearance.ensureOutfit = (p) => { p.outfit = p.outfit || { colors: [0, 0, 0, 0], addons: 0 }; };
  const male = { voc: "knight", sex: "male", wardrobe: { outfits: { "citizen-m": 0 }, mounts: {} } };
  const female = { voc: "druid", sex: "female" };
  for (const [p, id] of [[male, "citizen-m"], [female, "citizen-f"]]) {
    assert(appearance.ownsOutfit(p, id)); assert.equal(appearance.ownedAddons(p, id), 2);
    assert(appearance.ownsMount(p, mountId));
    assert(appearance.setAppearance(p, id));
    assert.equal(appearance.setAddons(p, 3), 3);
    appearance.setAppearance(p, id);
    assert.equal(p.outfit.addons, 3);
  }
  account = { cosmetics: { outfits: {}, mounts: {} } };
  assert.equal(appearance.ownedAddons(male, "citizen-m"), 0);
  assert(!appearance.ownsMount(male, mountId));
  male.wardrobe.outfits["citizen-m"] = 1;
  assert.equal(appearance.ownedAddons(male, "citizen-m"), 1);
  account = { cosmetics: { outfits: { nobleman: 0 }, mounts: {} } };
  assert(appearance.ownsOutfit(male, "nobleman-m")); assert(appearance.ownsOutfit(female, "noblewoman-f"));
  assert.equal(appearance.ownedAddons(male, "nobleman-m"), 2);
  assert.equal(appearance.ownedAddons(female, "noblewoman-f"), 2);
  console.log("OK: outfit completo por 125 TC, compras antigas, ambos os sexos, prioridade da conta, addons combinados, montarias compartilhadas e isolamento entre contas.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
