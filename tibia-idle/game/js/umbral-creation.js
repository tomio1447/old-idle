/* umbral-creation.js — NPC Umbral Creation (Guzzlemaw). */
"use strict";

const UMBRAL_ITEMS = {
  "crude-umbral-blade": {
    "n": "Crude Umbral Blade",
    "s": "weapon",
    "t": "sword",
    "cid": 20064,
    "w": 63,
    "sell": 0,
    "atk": 48,
    "def": 26
  },
  "umbral-blade": {
    "n": "Umbral Blade",
    "s": "weapon",
    "t": "sword",
    "cid": 20065,
    "w": 59,
    "sell": 0,
    "atk": 50,
    "def": 29,
    "imbSlots": 1
  },
  "umbral-masterblade": {
    "n": "Umbral Masterblade",
    "s": "weapon",
    "t": "sword",
    "cid": 20066,
    "w": 55,
    "sell": 0,
    "atk": 52,
    "def": 31,
    "imbSlots": 1
  },
  "crude-umbral-slayer": {
    "n": "Crude Umbral Slayer",
    "s": "weapon",
    "t": "sword",
    "cid": 20067,
    "w": 100,
    "sell": 0,
    "atk": 51,
    "def": 29,
    "th": true
  },
  "umbral-slayer": {
    "n": "Umbral Slayer",
    "s": "weapon",
    "t": "sword",
    "cid": 20068,
    "w": 95,
    "sell": 0,
    "atk": 52,
    "def": 31,
    "imbSlots": 1,
    "th": true
  },
  "umbral-master-slayer": {
    "n": "Umbral Master Slayer",
    "s": "weapon",
    "t": "sword",
    "cid": 20069,
    "w": 90,
    "sell": 0,
    "atk": 54,
    "def": 35,
    "imbSlots": 2,
    "th": true
  },
  "crude-umbral-axe": {
    "n": "Crude Umbral Axe",
    "s": "weapon",
    "t": "axe",
    "cid": 20070,
    "w": 90,
    "sell": 0,
    "atk": 49,
    "def": 24
  },
  "umbral-axe": {
    "n": "Umbral Axe",
    "s": "weapon",
    "t": "axe",
    "cid": 20071,
    "w": 85,
    "sell": 0,
    "atk": 51,
    "def": 27,
    "imbSlots": 1
  },
  "umbral-master-axe": {
    "n": "Umbral Master Axe",
    "s": "weapon",
    "t": "axe",
    "cid": 20072,
    "w": 80,
    "sell": 0,
    "atk": 53,
    "def": 30,
    "imbSlots": 1
  },
  "crude-umbral-chopper": {
    "n": "Crude Umbral Chopper",
    "s": "weapon",
    "t": "axe",
    "cid": 20073,
    "w": 120,
    "sell": 0,
    "atk": 51,
    "def": 27,
    "th": true
  },
  "umbral-chopper": {
    "n": "Umbral Chopper",
    "s": "weapon",
    "t": "axe",
    "cid": 20074,
    "w": 115,
    "sell": 0,
    "atk": 52,
    "def": 30,
    "imbSlots": 1,
    "th": true
  },
  "umbral-master-chopper": {
    "n": "Umbral Master Chopper",
    "s": "weapon",
    "t": "axe",
    "cid": 20075,
    "w": 110,
    "sell": 0,
    "atk": 54,
    "def": 34,
    "imbSlots": 2,
    "th": true
  },
  "crude-umbral-mace": {
    "n": "Crude Umbral Mace",
    "s": "weapon",
    "t": "club",
    "cid": 20076,
    "w": 90,
    "sell": 0,
    "atk": 48,
    "def": 22
  },
  "umbral-mace": {
    "n": "Umbral Mace",
    "s": "weapon",
    "t": "club",
    "cid": 20077,
    "w": 85,
    "sell": 0,
    "atk": 50,
    "def": 26,
    "imbSlots": 1
  },
  "umbral-master-mace": {
    "n": "Umbral Master Mace",
    "s": "weapon",
    "t": "club",
    "cid": 20078,
    "w": 80,
    "sell": 0,
    "atk": 52,
    "def": 30,
    "imbSlots": 1
  },
  "crude-umbral-hammer": {
    "n": "Crude Umbral Hammer",
    "s": "weapon",
    "t": "club",
    "cid": 20079,
    "w": 170,
    "sell": 0,
    "atk": 51,
    "def": 27,
    "th": true
  },
  "umbral-hammer": {
    "n": "Umbral Hammer",
    "s": "weapon",
    "t": "club",
    "cid": 20080,
    "w": 165,
    "sell": 0,
    "atk": 53,
    "def": 30,
    "imbSlots": 1,
    "th": true
  },
  "umbral-master-hammer": {
    "n": "Umbral Master Hammer",
    "s": "weapon",
    "t": "club",
    "cid": 20081,
    "w": 160,
    "sell": 0,
    "atk": 55,
    "def": 34,
    "imbSlots": 2,
    "th": true
  },
  "crude-umbral-bow": {
    "n": "Crude Umbral Bow",
    "s": "distance",
    "t": "distance",
    "cid": 20082,
    "w": 50,
    "sell": 0,
    "atk": 2,
    "th": true
  },
  "umbral-bow": {
    "n": "Umbral Bow",
    "s": "distance",
    "t": "distance",
    "cid": 20083,
    "w": 45,
    "sell": 0,
    "atk": 4,
    "imbSlots": 1,
    "th": true
  },
  "umbral-master-bow": {
    "n": "Umbral Master Bow",
    "s": "distance",
    "t": "distance",
    "cid": 20084,
    "w": 40,
    "sell": 0,
    "atk": 6,
    "imbSlots": 2,
    "th": true
  },
  "crude-umbral-crossbow": {
    "n": "Crude Umbral Crossbow",
    "s": "distance",
    "t": "distance",
    "cid": 20085,
    "w": 130,
    "sell": 0,
    "atk": 3,
    "th": true
  },
  "umbral-crossbow": {
    "n": "Umbral Crossbow",
    "s": "distance",
    "t": "distance",
    "cid": 20086,
    "w": 125,
    "sell": 0,
    "atk": 6,
    "imbSlots": 1,
    "th": true
  },
  "umbral-master-crossbow": {
    "n": "Umbral Master Crossbow",
    "s": "distance",
    "t": "distance",
    "cid": 20087,
    "w": 120,
    "sell": 0,
    "atk": 9,
    "imbSlots": 2,
    "th": true
  },
  "crude-umbral-spellbook": {
    "n": "Crude Umbral Spellbook",
    "s": "amulet",
    "t": "accessory",
    "cid": 20088,
    "w": 40,
    "sell": 0,
    "def": 14,
    "ml": 1,
    "mag": 2
  },
  "umbral-spellbook": {
    "n": "Umbral Spellbook",
    "s": "amulet",
    "t": "accessory",
    "cid": 20089,
    "w": 35,
    "sell": 0,
    "def": 16,
    "imbSlots": 1,
    "ml": 2,
    "mag": 3
  },
  "umbral-master-spellbook": {
    "n": "Umbral Master Spellbook",
    "s": "amulet",
    "t": "accessory",
    "cid": 20090,
    "w": 30,
    "sell": 0,
    "def": 20,
    "imbSlots": 1,
    "ml": 4,
    "mag": 5
  },
  "cluster-of-solace": {
    "n": "Cluster of Solace",
    "s": "loot",
    "t": "loot",
    "cid": 20062,
    "w": 28,
    "sell": 0
  },
  "dream-matter": {
    "n": "Dream Matter",
    "s": "loot",
    "t": "loot",
    "cid": 20063,
    "w": 39,
    "sell": 0
  }
};

/* Ordem de cada grupo. */
const UMBRAL_BASES = [
  "blade",
  "slayer",
  "axe",
  "chopper",
  "mace",
  "hammer",
  "bow",
  "crossbow",
  "spellbook"
];

const UMBRAL_CRAFT = {
  clusters: 75,
  recipes: [
  {
    "from": "crude-umbral-blade",
    "to": "umbral-blade"
  },
  {
    "from": "crude-umbral-slayer",
    "to": "umbral-slayer"
  },
  {
    "from": "crude-umbral-axe",
    "to": "umbral-axe"
  },
  {
    "from": "crude-umbral-chopper",
    "to": "umbral-chopper"
  },
  {
    "from": "crude-umbral-mace",
    "to": "umbral-mace"
  },
  {
    "from": "crude-umbral-hammer",
    "to": "umbral-hammer"
  },
  {
    "from": "crude-umbral-bow",
    "to": "umbral-bow"
  },
  {
    "from": "crude-umbral-crossbow",
    "to": "umbral-crossbow"
  },
  {
    "from": "crude-umbral-spellbook",
    "to": "umbral-spellbook"
  }
]
};

const UMBRAL_TRANSFORM = {
  clusters: 150,
  recipes: [
  {
    "from": "umbral-blade",
    "to": "umbral-masterblade"
  },
  {
    "from": "umbral-slayer",
    "to": "umbral-master-slayer"
  },
  {
    "from": "umbral-axe",
    "to": "umbral-master-axe"
  },
  {
    "from": "umbral-chopper",
    "to": "umbral-master-chopper"
  },
  {
    "from": "umbral-mace",
    "to": "umbral-master-mace"
  },
  {
    "from": "umbral-hammer",
    "to": "umbral-master-hammer"
  },
  {
    "from": "umbral-bow",
    "to": "umbral-master-bow"
  },
  {
    "from": "umbral-crossbow",
    "to": "umbral-master-crossbow"
  },
  {
    "from": "umbral-spellbook",
    "to": "umbral-master-spellbook"
  }
]
};

const UMBRAL_MASTER = {
  slugs: [
  "umbral-masterblade",
  "umbral-master-slayer",
  "umbral-master-axe",
  "umbral-master-chopper",
  "umbral-master-mace",
  "umbral-master-hammer",
  "umbral-master-bow",
  "umbral-master-crossbow",
  "umbral-master-spellbook"
]
};

(function registerUmbralCreation() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  for (const slug in UMBRAL_ITEMS) {
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = UMBRAL_ITEMS[slug];
  }
})();

/* Registra o NPC no catalogo global (city.js ja deve existir). */
(function registerUmbralNpc() {
  if (typeof NPCS === "undefined") return;
  NPCS["umbral-creation"] = {
    name: "Umbral Creation",
    role: "Roshamuul Forge",
    sprite: "umbral-creation",
    greet: "I can shape umbral items for you, if you bring the right materials.",
    type: "umbral-creation",
  };
})();

function npcUmbralCreationHtml(p) {
  const renderRecipe = (r, tab, price) => {
    const haveFrom = (p.bag && p.bag[r.from] || 0) >= 1;
    const haveClusters = (p.bag && p.bag["cluster-of-solace"] || 0) >= price;
    const canCraft = haveFrom && haveClusters;
    const missingCls = price - (p.bag && p.bag["cluster-of-solace"] || 0);
    return `
      <div class="shop-row umbral-recipe" style="align-items:center;gap:8px;flex-wrap:wrap">
        <div class="umbral-recipe-ing">
          ${typeof itemImg === "function" ? itemImg(r.from, { size: 32 }) : ""}
          <span class="tiny" style="color:${haveFrom ? '#9ce84a' : '#e85b52'}">1x ${itemName(r.from)}</span>
        </div>
        <span class="tiny dim">+</span>
        <div class="umbral-recipe-ing">
          <span class="tiny" style="color:${haveClusters ? '#9ce84a' : '#e85b52'}">${price}x Cluster of Solace</span>
        </div>
        <span class="tiny dim">=</span>
        <div class="umbral-recipe-res">
          ${typeof itemImg === "function" ? itemImg(r.to, { size: 32 }) : ""}
          <span class="tiny" style="color:#ffe680">1x ${itemName(r.to)}</span>
        </div>
        <button class="sm primary" data-umbral-craft="${tab}" data-umbral-from="${r.from}" data-umbral-to="${r.to}" data-umbral-price="${price}" ${canCraft ? "" : "disabled"}>
          Craft
        </button>
      </div>`;
  };

  const tabBtn = (id, label, active) => `
    <div class="umbral-tab ${active ? 'active' : ''}" data-umbral-tab="${id}">${label}</div>`;

  const craftRows = UMBRAL_CRAFT.recipes.map((r) => renderRecipe(r, "craft", UMBRAL_CRAFT.clusters)).join("");
  const transformRows = UMBRAL_TRANSFORM.recipes.map((r) => renderRecipe(r, "transform", UMBRAL_TRANSFORM.clusters)).join("");
  const masterRows = UMBRAL_MASTER.slugs.map((slug) => `
    <div class="shop-row" style="align-items:center;gap:8px">
      ${typeof itemImg === "function" ? itemImg(slug, { size: 32 }) : ""}
      <span class="tiny" style="color:#d4af37">${itemName(slug)}</span>
    </div>`).join("");

  return `
    <div class="umbral-tabs row" style="gap:4px;margin-bottom:10px">
      ${tabBtn("craft", "Craft Umbral", true)}
      ${tabBtn("transform", "Umbral Transformation", false)}
      ${tabBtn("master", "Master Umbral", false)}
    </div>
    <div data-umbral-panel="craft" class="umbral-panel">
      <div class="small mb8 dim">Combine a Crude Umbral item with Clusters of Solace to forge an Umbral piece.</div>
      ${craftRows}
    </div>
    <div data-umbral-panel="transform" class="umbral-panel" style="display:none">
      <div class="small mb8 dim">Transform an Umbral item into its Master version using Clusters of Solace.</div>
      ${transformRows}
    </div>
    <div data-umbral-panel="master" class="umbral-panel" style="display:none">
      <div class="small mb8 dim">Available Master Umbral equipment.</div>
      ${masterRows}
    </div>`;
}

function tryUmbralCraft(p, tab, from, to, price) {
  if (!p.bag || (p.bag[from] || 0) < 1) return { ok: false, msg: `Missing ${itemName(from)}.` };
  if ((p.bag["cluster-of-solace"] || 0) < price) return { ok: false, msg: `Not enough Clusters of Solace.` };

  // Umbral creation always succeeds on this server.
  removeItem(p, "cluster-of-solace", price);
  removeItem(p, from, 1);
  addItem(p, to, 1);
  return { ok: true, msg: `You successfully crafted <b>${itemName(to)}</b>!` };
}
