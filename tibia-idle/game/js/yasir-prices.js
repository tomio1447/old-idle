/* yasir-prices.js — preços que Yasir (TibiaWiki) compra de creature products.
 *
 * Sell All / autoseller usam sell; analyser prefere npcSell. Mantém sell =
 * npcSell. Inclui aliases de slug (greed-s-arm / greeds-arm) para o mesmo CID.
 * Fonte: TibiaWiki Yasir / Creature Products by NPC Price. */
"use strict";

(function applyYasirNpcPrices(global) {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  const items = GAMEDATA.items;

  const registerLootItem = (slug, def) => {
    const sell = Math.max(0, Math.floor(Number(def.sell) || 0));
    const npcSell = def.npcSell != null
      ? Math.max(0, Math.floor(Number(def.npcSell) || 0))
      : sell;
    const base = Object.assign({ s: null, t: "loot" }, def, { sell, npcSell });
    if (!items[slug]) items[slug] = base;
    else {
      items[slug].sell = sell;
      items[slug].npcSell = npcSell;
      if (def.n && !items[slug].n) items[slug].n = def.n;
      if (def.cid && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  };

  /* Soul War / Goshnar boss loot — preços oficiais Yasir (gp). */
  const YASIR_SOULWAR_LOOT = {
    "greed-s-arm": { n: "Greed's arm", cid: 33924, w: 1.25, sell: 950000 },
    "greeds-arm": { n: "Greed's arm", cid: 33924, w: 1.25, sell: 950000 },
    "figurine-of-greed": { n: "figurine of Greed", cid: 34021, w: 0.44, sell: 2900000 },

    "vial-of-hatred": { n: "vial of Hatred", cid: 33927, w: 1.1, sell: 737000 },
    "figurine-of-hatred": { n: "figurine of hatred", cid: 34020, w: 0.44, sell: 2700000 },

    "spite-s-spirit": { n: "Spite's spirit", cid: 33926, w: 0.8, sell: 840000 },
    "spites-spirit": { n: "Spite's spirit", cid: 33926, w: 0.8, sell: 840000 },
    "figurine-of-spite": { n: "figurine of Spite", cid: 33952, w: 0.44, sell: 3000000 },

    "malice-s-spine": { n: "Malice's spine", cid: 33921, w: 1.2, sell: 850000 },
    "malices-spine": { n: "Malice's spine", cid: 33921, w: 1.2, sell: 850000 },
    "malice-s-horn": { n: "Malice's horn", cid: 33920, w: 1.1, sell: 620000 },
    "malices-horn": { n: "Malice's horn", cid: 33920, w: 1.1, sell: 620000 },
    "figurine-of-malice": { n: "figurine of Malice", cid: 34018, w: 0.44, sell: 2800000 },

    "cruelty-s-claw": { n: "Cruelty's claw", cid: 33922, w: 1.1, sell: 640000 },
    "crueltys-claw": { n: "Cruelty's claw", cid: 33922, w: 1.1, sell: 640000 },
    "cruelty-s-chest": { n: "Cruelty's chest", cid: 33923, w: 1.4, sell: 720000 },
    "crueltys-chest": { n: "Cruelty's chest", cid: 33923, w: 1.4, sell: 720000 },
    "figurine-of-cruelty": { n: "figurine of Cruelty", cid: 34019, w: 0.44, sell: 3100000 },

    "figurine-of-megalomania": { n: "figurine of Megalomania", cid: 33953, w: 0.44, sell: 5000000 },
    "megalomania-s-skull": { n: "Megalomania's skull", cid: 33925, w: 1.1, sell: 1500000 },
    "megalomanias-skull": { n: "Megalomania's skull", cid: 33925, w: 1.1, sell: 1500000 },
    "megalomania-s-essence": { n: "Megalomania's essence", cid: 33928, w: 0.8, sell: 1900000 },
    "megalomanias-essence": { n: "Megalomania's essence", cid: 33928, w: 0.8, sell: 1900000 },

    /* Soul War trash / zone creature products Yasir also buys. */
    "crawler-s-essence": { n: "crawler's essence", cid: 33982, w: 0.45, sell: 3700 },
    "crawlers-essence": { n: "crawler's essence", cid: 33982, w: 0.45, sell: 3700 },
    "roots": { n: "roots", cid: 33938, w: 0.9, sell: 1200 },
    "mould-heart": { n: "mould heart", cid: 34141, w: 0.75, sell: 2100 },
    // Claustrophobic Inferno (brachiodemon / infernal phantom).
    "hand": { n: "hand", cid: 33936, w: 1.2, sell: 1450 },
    "head": { n: "head", cid: 33937, w: 1.5, sell: 3500 },
    "infernal-heart": { n: "infernal heart", cid: 34139, w: 0.75, sell: 2100 },
    "diabolic-skull": { n: "diabolic skull", cid: 34025, w: 2.1, sell: 19000 },
    "infernal-robe": { n: "infernal robe", cid: 34146, w: 1.8, sell: 1200 },
  };

  Object.keys(YASIR_SOULWAR_LOOT).forEach((slug) => {
    registerLootItem(slug, YASIR_SOULWAR_LOOT[slug]);
  });

  if (global) {
    global.YASIR_SOULWAR_LOOT = YASIR_SOULWAR_LOOT;
    global.applyYasirNpcPrices = function reapply() {
      Object.keys(YASIR_SOULWAR_LOOT).forEach((slug) => {
        registerLootItem(slug, YASIR_SOULWAR_LOOT[slug]);
      });
    };
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : null));
