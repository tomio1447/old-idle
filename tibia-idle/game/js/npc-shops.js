/*
 * npc-shops.js — catálogos de NPCs de compra/troca (buy-only / barter).
 * Enpa-Deia Pema: ouro da conta. Gnomally: Major Crystalline Token na backpack.
 */
"use strict";

const MAJOR_CRYSTALLINE_TOKEN = "major-crystalline-token";

const NPC_SHOP_ITEMS = {
  "major-crystalline-token": {
    n: "major crystalline token", s: null, t: "loot", cid: 16129, sell: 0, w: 3.5
  },
  "iron-loadstone": {
    n: "iron loadstone", s: null, t: "loot", cid: 16153, sell: 0, w: 2.0
  },
  "glow-wine": {
    n: "glow wine", s: null, t: "loot", cid: 16154, sell: 0, w: 2.0
  },
  "light-jo-staff": {
    n: "light jo staff", s: "weapon", t: "fist", atk: 10, def: 6, fist: 1,
    bond: "energy", cat: "fist", cls: 1, th: 1, shop: 1, npcBuy: 250, sell: 288,
    vocs: ["monk"], w: 17, id: 50166
  }
};

/* Preços que Enpa-Deia Pema COMPRA do jogador (wiki) → npcSell / seller. */
const ENPA_SELLER_PRICES = {
  "boots-of-enlightenment": 80,
  "coned-hat-of-enlightenment": 700,
  "fists-of-enlightenment": 200,
  "legs-of-enlightenment": 400,
  "nunchaku-of-enlightenment": 500,
  "robe-of-enlightenment": 150,
  "sai-of-enlightenment": 100
};

const NPC_SHOPS = {
  enpa: {
    currency: "gold",
    buyOnly: true,
    items: [
      { slug: "boots-of-enlightenment", price: 8000 },
      { slug: "coned-hat-of-enlightenment", price: 70000 },
      { slug: "fists-of-enlightenment", price: 20000 },
      { slug: "harmony-amulet", price: 1000 },
      { slug: "jo-staff", price: 500 },
      { slug: "legs-of-enlightenment", price: 40000 },
      { slug: "light-jo-staff", price: 250 },
      { slug: "nunchaku-of-enlightenment", price: 50000 },
      { slug: "plain-monk-robe", price: 450 },
      { slug: "robe-of-enlightenment", price: 150000 },
      { slug: "sai-of-enlightenment", price: 100000 }
    ]
  },
  gnomally: {
    currency: MAJOR_CRYSTALLINE_TOKEN,
    currencyFrom: "bag",
    buyOnly: true,
    /* Major Crystalline Token exchanges (wiki Gnomally + Major Token). */
    items: [
      { slug: "gill-gugel", cost: 10 },
      { slug: "gill-coat", cost: 10 },
      { slug: "gill-legs", cost: 10 },
      { slug: "spellbook-of-vigilance", cost: 10 },
      { slug: "prismatic-helmet", cost: 10 },
      { slug: "prismatic-armor", cost: 10 },
      { slug: "prismatic-legs", cost: 10 },
      { slug: "prismatic-boots", cost: 10 },
      { slug: "prismatic-shield", cost: 10 },
      { slug: "gnomish-cuirass", cost: 100 },
      { slug: "iron-loadstone", cost: 20 },
      { slug: "glow-wine", cost: 20 },
      { kind: "outfit", outfitBase: "soil-guardian", cost: 20, name: "Soil Guardian Outfit" },
      { kind: "outfit", outfitBase: "crystal-warlord", cost: 20, name: "Crystal Warlord Outfit" }
    ]
  }
};

function ensureNpcShopItems() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  for (const slug of Object.keys(NPC_SHOP_ITEMS)) {
    if (!GAMEDATA.items[slug]) {
      GAMEDATA.items[slug] = Object.assign({}, NPC_SHOP_ITEMS[slug]);
    }
  }
  if (!GAMEDATA.items["light-jo-staff"] && GAMEDATA.items["simple-jo-staff"]) {
    const src = GAMEDATA.items["simple-jo-staff"];
    GAMEDATA.items["light-jo-staff"] = Object.assign({}, src, {
      n: "light jo staff", npcBuy: 250
    });
  }
  applyEnpaSellerPrices();
}

function applyEnpaSellerPrices() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  for (const slug of Object.keys(ENPA_SELLER_PRICES)) {
    const it = GAMEDATA.items[slug];
    if (!it) continue;
    const price = ENPA_SELLER_PRICES[slug];
    it.npcSell = Math.max(Number(it.npcSell) || 0, price);
    /* Seller da loot pouch usa sell; garante pelo menos o preço NPC. */
    it.sell = Math.max(Number(it.sell) || 0, price);
  }
}

function npcShopDef(shopId) {
  return NPC_SHOPS[shopId] || null;
}

function bagTokenCount(p, slug) {
  if (!p || !p.bag) return 0;
  return Math.max(0, Math.floor(Number(p.bag[slug]) || 0));
}

function npcOutfitIdForPlayer(p, outfitBase) {
  if (!p || !outfitBase) return null;
  const sex = p.sex === "f" || p.sex === "female" ? "f" : "m";
  return outfitBase + "-" + sex;
}

function buyNpcCatalogItem(p, shopId, slug) {
  const shop = npcShopDef(shopId);
  if (!shop || shop.currency !== "gold")
    return { ok: false, msg: "Loja inválida." };
  const entry = (shop.items || []).find((e) => e.slug === slug);
  if (!entry) return { ok: false, msg: "Item não encontrado nesta loja." };
  const price = entry.price;
  if (typeof buyItem === "function") return buyItem(p, slug, price);
  if ((p.gold || 0) < price) return { ok: false, msg: "Ouro insuficiente." };
  if (typeof hasBagSpace === "function" && !hasBagSpace(p, slug))
    return { ok: false, msg: "Mochila cheia." };
  if (typeof spendGold === "function") spendGold(p, price);
  else p.gold -= price;
  if (typeof addItem === "function") addItem(p, slug, 1);
  else {
    p.bag = p.bag || {};
    p.bag[slug] = (p.bag[slug] || 0) + 1;
  }
  return { ok: true };
}

function exchangeNpcBarter(p, shopId, index) {
  const shop = npcShopDef(shopId);
  if (!shop || shop.currency === "gold")
    return { ok: false, msg: "Troca inválida." };
  const entry = (shop.items || [])[index];
  if (!entry) return { ok: false, msg: "Oferta inválida." };
  const cost = Math.max(0, Math.floor(Number(entry.cost) || 0));
  const token = shop.currency;
  const have = bagTokenCount(p, token);
  if (have < cost)
    return { ok: false, msg: "Tokens insuficientes na backpack." };

  if (entry.kind === "outfit") {
    const oid = npcOutfitIdForPlayer(p, entry.outfitBase);
    if (!oid) return { ok: false, msg: "Outfit inválida." };
    if (typeof ensureWardrobe === "function") ensureWardrobe(p);
    if (typeof ownsOutfit === "function" && ownsOutfit(p, oid))
      return { ok: false, msg: "Você já possui este visual." };
    if (!removeItem(p, token, cost))
      return { ok: false, msg: "Tokens insuficientes na backpack." };
    p.wardrobe = p.wardrobe || { outfits: {}, mounts: {} };
    p.wardrobe.outfits = p.wardrobe.outfits || {};
    p.wardrobe.outfits[oid] = 0;
    return {
      ok: true,
      msg: "Outfit desbloqueada: " + (entry.name || oid),
      kind: "outfit",
      id: oid
    };
  }

  const slug = entry.slug;
  if (!slug || !GAMEDATA.items[slug])
    return { ok: false, msg: "Item ausente no jogo." };
  if (typeof hasBagSpace === "function" && !hasBagSpace(p, slug))
    return { ok: false, msg: "Mochila cheia." };
  if (!removeItem(p, token, cost))
    return { ok: false, msg: "Tokens insuficientes na backpack." };
  if (!addItem(p, slug, 1)) {
    addItem(p, token, cost);
    return { ok: false, msg: "Não foi possível receber o item." };
  }
  const label = typeof itemName === "function" ? itemName(slug) : slug;
  return { ok: true, msg: "Trocou por " + label, slug: slug };
}

ensureNpcShopItems();

/* Expõe no global (browser + vm de testes). */
(function exportNpcShops(g) {
  if (!g) return;
  g.NPC_SHOPS = NPC_SHOPS;
  g.ENPA_SELLER_PRICES = ENPA_SELLER_PRICES;
  g.MAJOR_CRYSTALLINE_TOKEN = MAJOR_CRYSTALLINE_TOKEN;
  g.NPC_SHOP_ITEMS = NPC_SHOP_ITEMS;
  g.ensureNpcShopItems = ensureNpcShopItems;
  g.applyEnpaSellerPrices = applyEnpaSellerPrices;
  g.npcShopDef = npcShopDef;
  g.bagTokenCount = bagTokenCount;
  g.buyNpcCatalogItem = buyNpcCatalogItem;
  g.exchangeNpcBarter = exchangeNpcBarter;
  g.npcOutfitIdForPlayer = npcOutfitIdForPlayer;
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : null));
