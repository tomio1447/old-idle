"use strict";

const assert = require("node:assert/strict");
const W = require("../server/wardrobe");
const recipes = require("../game/js/cosmetic-npcs-data");
const test = require("node:test");

const character = (data) => ({ data: JSON.stringify(data) });

test("migration unites both sexes, partial addons and mounts without granting full addons", () => {
  const account = { cosmetics: { outfits: { citizen: 0 }, bless: 7, preyCards: 4 } };
  const characters = [character({ wardrobe: { outfits: { "knight-m": 1 }, mounts: { draptor: true } } }),
    character({ wardrobe: { outfits: { "noblewoman-f": 2 }, mounts: { donkey: true } } })];
  const cos = W.migrate(account, characters);
  assert.equal(cos.addonBits.knight, 1);
  assert.equal(cos.addonBits.nobleman, 3);
  assert.equal(cos.addonBits.citizen, 0);
  assert.equal(cos.mounts.draptor, true);
  assert.equal(cos.mounts.donkey, true);
  assert.equal(cos.bless, 7);
  assert.equal(cos.preyCards, 4);
  assert.deepEqual(W.migrate(account, characters), cos);
});

test("hunter female accessory maps to the correct male counterpart", () => {
  const cos = W.migrate({}, [character({ wardrobe: { outfits: { "hunter-f": 1 } } })]);
  assert.equal(cos.addonBits.hunter, 2);
});

test("store full outfits remain full and old characters cannot remove unlocks", () => {
  const account = { cosmetics: { outfits: { knight: 3 }, mounts: { draptor: true } } };
  const cos = W.migrate(account, [character({ wardrobe: { outfits: { "knight-m": 0 }, mounts: {} } })]);
  assert.equal(cos.addonBits.knight, 3);
  assert.equal(cos.mounts.draptor, true);
});

test("mount exchange consumes exactly one selected alternative and rejects repeated claims", () => {
  const account = {}, shared = { bag: { harness: 2, "music-box": 1 } };
  assert.equal(W.exchange(account, [], shared, "mount:draptor", 0).ok, true);
  assert.equal(shared.bag.harness, 1);
  assert.equal(shared.bag["music-box"], 1);
  assert.equal(account.cosmetics.mounts.draptor, true);
  assert.equal(W.exchange(account, [], shared, "mount:draptor", 1).ok, false);
  assert.equal(shared.bag["music-box"], 1);
});

test("missing items, forged recipes and invalid alternatives never consume items", () => {
  const shared = { bag: { harness: 1 } }, account = {};
  assert.equal(W.exchange(account, [], shared, "mount:war-bear", 0).ok, false);
  assert.equal(W.exchange(account, [], shared, "mount:draptor", 99).ok, false);
  assert.equal(W.exchange(account, [], shared, "unknown", 0).ok, false);
  assert.equal(shared.bag.harness, 1);
});

test("multi-item exchange is all-or-nothing and respects quantities", () => {
  const account = {}, shared = { bag: { "spectral-horseshoe": 4, "spectral-horse-tack": 1 } };
  assert.equal(W.exchange(account, [], shared, "mount:phantasmal-jade", 0).ok, false);
  assert.equal(shared.bag["spectral-horseshoe"], 4);
  shared.bag["spectral-saddle"] = 1;
  assert.equal(W.exchange(account, [], shared, "mount:phantasmal-jade", 0).ok, true);
  assert.deepEqual(shared.bag, {});
});

test("second addon can be obtained independently without unlocking the first", () => {
  const account = {}, shared = { bag: { "sniper-gloves": 1 } };
  assert.equal(W.exchange(account, [], shared, "addon:hunter:2", 0).ok, true);
  assert.equal(account.cosmetics.addonBits.hunter, 2);
  assert.equal(account.cosmetics.outfits.hunter, 0);
  assert.equal(W.migrate(account, []).addonBits.hunter, 2);
});

test("equipment instances are removed along with consumed aggregate items", () => {
  const account = {}, shared = { bag: { "chicken-feather": 100, honeycomb: 50, "legion-helmet": 1 },
    itemInstances: [{ id: "a", slug: "legion-helmet", loc: "bag" }, { id: "b", slug: "legion-helmet", loc: "equip:head" }] };
  assert.equal(W.exchange(account, [], shared, "addon:citizen:2", 0).ok, true);
  assert.equal(shared.itemInstances.length, 1);
  assert.equal(shared.itemInstances[0].id, "b");
});

test("objective mounts use server character records and do not use lastFight", () => {
  const chars = [character({ bosses: { "doctor-marrow": { lastFight: Date.now(), kills: 0 } } })];
  assert.equal(W.migrate({}, chars).mounts["mutated-abomination"], undefined);
  const cos = W.migrate({}, [character({ bosses: { "doctor-marrow": { kills: 1 }, vladrukh: { kills: 1 } } })]);
  assert.equal(cos.mounts["mutated-abomination"], true);
  assert.equal(cos.mounts["gloom-maw"], true);
});

test("tutorial completion grants Landsailer but skipping does not", () => {
  assert.equal(W.migrate({ tutorial: { rewardGranted: true } }, []).mounts.landsailer, true);
  assert.equal(W.migrate({ tutorial: { rewardGranted: true, skipped: true } }, []).mounts.landsailer, undefined);
});

test("future hazard and missing client art are not exchangeable", () => {
  assert.equal(W.exchange({}, [], { bag: {} }, "mount:noxious-ripptor", 0).ok, false);
  assert.equal(W.exchange({}, [], { bag: { "demon-in-a-golden-box": 1 } }, "mount:alpha-demonosaur", 0).ok, false);
});

test("client equips account unlocks on both sexes and does not enable unowned addon layers", () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const account = { cosmetics: { outfits: { hunter: 0, nobleman: 0 }, addonBits: { hunter: 2 }, mounts: { draptor: true } } };
  const ctx = { console, sessionAccount: () => account, accountApiConfigured: () => true };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ["appearancedata.js", "outfit.js", "appearance.js", "loyalty.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../game/js", file), "utf8"), ctx);
  const male = { voc: "knight", sex: "male", gold: 1000, outfit: {} };
  const female = { voc: "knight", sex: "female", gold: 1000, outfit: {} };
  assert.equal(ctx.ownsOutfit(male, "nobleman-m"), true);
  assert.equal(ctx.ownsOutfit(female, "noblewoman-f"), true);
  assert.equal(ctx.setAppearance(male, "hunter-m"), true);
  assert.equal(ctx.setAppearance(female, "hunter-f"), true);
  assert.equal(ctx.setAddons(male, 3), 2);
  assert.equal(ctx.setAddons(female, 3), 1);
  assert.equal(ctx.setMount(male, "draptor"), true);
  assert.equal(ctx.setMount(female, "draptor"), true);
  assert.equal(ctx.buyAddon(male, "hunter-m").ok, false);
  assert.equal(male.gold, 1000);
  assert.equal(ctx.loyaltyAddonCount(male), 1);
  assert.equal(ctx.loyaltyAddonCount(female), 1);
  assert.equal(ctx.loyaltyMountCount(male), 1);
  assert.equal(ctx.loyaltyMountCount(female), 1);
});

test("stale Store writes preserve NPC unlocks and partial addon bits", () => {
  const merged = W.mergeCosmetics({ outfits: { hunter: 0 }, addonBits: { hunter: 2 }, mounts: { draptor: true } },
    { outfits: { citizen: 3 }, mounts: { donkey: true } });
  assert.equal(merged.addonBits.hunter, 2);
  assert.equal(merged.outfits.citizen, 3);
  assert.equal(merged.mounts.draptor, true);
  assert.equal(merged.mounts.donkey, true);
});

test("JSON persistence migrates all characters, rejects combat trades and retains unlocks after reload", async () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "idle-wardrobe-test-"));
  const previousDirectory = process.env.GLOBAL_IDLE_DATA_DIR, previousHost = process.env.MYSQL_HOST;
  process.env.GLOBAL_IDLE_DATA_DIR = temporary;
  process.env.MYSQL_HOST = "";
  try {
    const db = await require("../server/db").getDb();
    db.accounts = [{ id: 901, cosmetics: {}, shared_inventory: { v: 1, bag: { harness: 1 }, itemInstances: [], forgeResourcesDone: 1, staminaSharedDone: 1 } }];
    db.characters = [{ id: 801, account_id: 901, zone: "city", data: JSON.stringify({ wardrobe: { outfits: { "knight-m": 1 }, mounts: {} } }) },
      { id: 802, account_id: 901, zone: "city", data: JSON.stringify({ wardrobe: { outfits: {}, mounts: { donkey: true } } }) }];
    db.instances = [{ account_id: 901, status: "active" }];
    assert.equal(db.accountWardrobe(901, "mount:draptor", 0).ok, false);
    db.instances = [];
    const result = db.accountWardrobe(901, "mount:draptor", 0);
    assert.equal(result.ok, true);
    const saved = JSON.parse(fs.readFileSync(path.join(temporary, "accounts.json"), "utf8"))[0];
    assert.equal(saved.cosmetics.mounts.draptor, true);
    assert.equal(saved.cosmetics.mounts.donkey, true);
    assert.equal(saved.cosmetics.addonBits.knight, 1);
    assert.equal(saved.shared_inventory.bag.harness, undefined);
  } finally {
    if (previousDirectory === undefined) delete process.env.GLOBAL_IDLE_DATA_DIR; else process.env.GLOBAL_IDLE_DATA_DIR = previousDirectory;
    if (previousHost === undefined) delete process.env.MYSQL_HOST; else process.env.MYSQL_HOST = previousHost;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("catalog recipes have unique IDs and positive integer item quantities", () => {
  assert.equal(new Set(recipes.map((r) => r.id)).size, recipes.length);
  for (const recipe of recipes) for (const items of recipe.alternatives || []) for (const item of items) {
    assert.ok(item.slug);
    assert.ok(Number.isSafeInteger(item.count) && item.count > 0);
  }
});
