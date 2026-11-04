"use strict";

const GRIMVALE_LOOT_ITEMS = {
  "fox-paw": { n: "fox paw", cid: 27462, w: 1.2, sell: 100 },
  "werefox-tail": { n: "werefox tail", cid: 27463, w: 1.4, sell: 200 },
  "werefox-trophy": { n: "werefox trophy", cid: 27706, w: 5, sell: 9000 },
  "werebadger-claws": { n: "werebadger claws", cid: 22051, w: 1.1, sell: 160 },
  "werebadger-skull": { n: "werebadger skull", cid: 22055, w: 3, sell: 185 },
  "werebadger-trophy": { n: "werebadger trophy", cid: 22101, w: 5, sell: 9000 },
  "werewolf-fangs": { n: "werewolf fangs", cid: 22052, w: 1.6, sell: 180 },
  "werewolf-fur": { n: "werewolf fur", cid: 10317, w: 1.12, sell: 380 },
  "wereboar-hooves": { n: "wereboar hooves", cid: 22053, w: 2.5, sell: 175 },
  "wereboar-tusks": { n: "wereboar tusks", cid: 22054, w: 1.9, sell: 165 },
  "wereboar-trophy": { n: "wereboar trophy", cid: 22102, w: 5, sell: 10000 },
  "werebear-fur": { n: "werebear fur", cid: 22057, w: 5, sell: 185 },
  "werebear-skull": { n: "werebear skull", cid: 22056, w: 5, sell: 195 },
  "werebear-trophy": { n: "werebear trophy", cid: 22103, w: 5, sell: 11000 },
  "moonlight-crystals": { n: "moonlight crystals", cid: 22083, w: 4, sell: 0 },
  "small-enchanted-emerald": { n: "small enchanted emerald", cid: 677, w: 0.1, sell: 250 },
  "small-enchanted-ruby": { n: "small enchanted ruby", cid: 676, w: 0.1, sell: 250 },
};
const GRIMVALE_SELL_PRICES = {
  "werewolf-amulet": 3000, "moonlight-rod": 200, "badger-boots": 7500,
  "underworld-rod": 4400, "relic-sword": 25000, "dreaded-cleaver": 15000,
  bonebreaker: 10000, "furry-club": 1000, "fur-armor": 5000,
  "spiked-squelcher": 5000, "wereboar-loincloth": 1500,
};
const GRIMVALE_HUNTS = {
  "grimvale-1st-floor": {
    name: "Grimvale 1st Floor", level: 0, minLevel: 0, cat: "aventureiro",
    pack: 5, packMin: 4, packMax: 6, monsters: ["werefox", "werebadger", "werewolf"],
    color: "#68634b", scene: "cave", otbm: "grimvale", otbmFloor: 7,
    otbmFovBounds: { x: 1011, y: 1015, w: 27, h: 24, z: 7 },
    otbmFovWidth: 21, otbmFovHeight: 17, otbmRuntimeWidth: 27, otbmRuntimeHeight: 27, otbmOffsetY: -1,
    otbmSpawn: { x: 1024, y: 1028, z: 7 },
    otbmMobBounds: { x: 1020, y: 1023, w: 11, h: 10, z: 7 },
    avgHp: 1718, avgExp: 1700, avgDamage: 263, avgArmor: 36, avgGold: 131, respawn: 1,
  },
  "grimvale-2nd-floor": {
    name: "Grimvale 2nd Floor", level: 0, minLevel: 0, cat: "aventureiro",
    pack: 5, packMin: 4, packMax: 6, monsters: ["wereboar", "werebear"],
    color: "#6b5544", scene: "cave", otbm: "grimvale2", otbmFloor: 7,
    otbmFovBounds: { x: 1011, y: 1016, w: 21, h: 16, z: 7 },
    otbmFovWidth: 21, otbmFovHeight: 15, otbmRuntimeWidth: 25, otbmRuntimeHeight: 17, otbmOffsetY: 1,
    otbmSpawn: { x: 1021, y: 1023, z: 7 },
    otbmMobBounds: { x: 1016, y: 1021, w: 11, h: 7, z: 7 },
    avgHp: 2300, avgExp: 2050, avgDamage: 435, avgArmor: 35, avgGold: 172, respawn: 1,
  },
};

(function registerGrimvale() {
  if (typeof GAMEDATA !== "undefined") {
    const items = GAMEDATA.items || (GAMEDATA.items = {});
    for (const [slug, def] of Object.entries(GRIMVALE_LOOT_ITEMS))
      items[slug] = Object.assign({ s: null, t: "loot" }, items[slug] || {}, def, { npcSell: def.sell });
    for (const [slug, price] of Object.entries(GRIMVALE_SELL_PRICES))
      if (items[slug]) Object.assign(items[slug], { sell: price, npcSell: price });
    Object.assign(GAMEDATA.hunts || (GAMEDATA.hunts = {}), GRIMVALE_HUNTS);
  }
  if (typeof MISSION_DEFS !== "undefined") {
    for (const [id, hunt] of Object.entries(GRIMVALE_HUNTS)) {
      MISSION_DEFS[id] = {
        title: hunt.name,
        tasks: hunt.monsters.map((monster) => ({ monster, target: id === "grimvale-1st-floor" ? 250 : 500 })),
      };
    }
  }
})();

if (typeof module !== "undefined" && module.exports)
  module.exports = { items: GRIMVALE_LOOT_ITEMS, prices: GRIMVALE_SELL_PRICES, hunts: GRIMVALE_HUNTS };
