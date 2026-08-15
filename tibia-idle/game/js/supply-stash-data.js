/* supply-stash-data.js — rings/amulets com cargas (Canary items.xml parity).
 *
 * Fonte: canary-map-editor data/items/items.xml
 * - Time: stopduration + transformEquipTo + duration (s) no form equipado;
 *   decayTo 0 = some ao acabar. Mapeamos duration → charges @ 1/3s.
 * - Hits: showCharges + charges (might ring, SSA, amuletos de proteção…).
 * - transformEquipSlug: sprite “brilhando” quando equipado (quando existir
 *   PNG charged-* / form ativo); senão a UI usa filtro neutro sem glow amarelo.
 */
"use strict";

(function aplicarSupplyStashData() {
  const root = typeof window !== "undefined" ? window : global;
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.items) return;
  const IT = GAMEDATA.items;

  /* duration(s) → charges (1 carga / 3s, igual ao tick atual do idle). */
  function durCharges(sec) {
    return Math.max(1, Math.round(Number(sec) / 3));
  }

  /**
   * chargeable accessories (unequipped / bag form).
   * chargeMode: "time" | "hits"
   * durationSec: Canary equipped duration (time mode)
   * transformEquipTo: Canary client id (documentação)
   * transformEquipSlug: sprite slug enquanto equipado (opcional)
   */
  const CHARGEABLES = {
    /* ---- time rings (Canary transform + duration) ---- */
    "stealth-ring": {
      chargeMode: "time", durationSec: 600, charges: durCharges(600),
      transformEquipTo: 3086, invis: 1,
    },
    "power-ring": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      transformEquipTo: 3087, fist: 4,
    },
    "energy-ring": {
      chargeMode: "time", durationSec: 600, charges: durCharges(600),
      transformEquipTo: 3088, manaShield: 1, magicShield: 1,
      // Regra do dono (não Canary Knight): Monk + Royal Paladin
      vocs: ["monk", "exalted monk", "paladin", "royal paladin"],
    },
    "life-ring": {
      chargeMode: "time", durationSec: 1200, charges: durCharges(1200),
      transformEquipTo: 3089, hpreg: 6, mpreg: 2,
    },
    "time-ring": {
      chargeMode: "time", durationSec: 600, charges: durCharges(600),
      transformEquipTo: 3090, spd: 30,
    },
    "sword-ring": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      transformEquipTo: 3094, sword: 4,
    },
    "axe-ring": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      transformEquipTo: 3095, axe: 4,
    },
    "club-ring": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      transformEquipTo: 3096, club: 4,
    },
    "dwarven-ring": {
      chargeMode: "time", durationSec: 3600, charges: durCharges(3600),
      transformEquipTo: 3099, hpreg: 3,
    },
    "ring-of-healing": {
      chargeMode: "time", durationSec: 450, charges: durCharges(450),
      transformEquipTo: 3100, hpreg: 8, mpreg: 10,
    },
    "death-ring": {
      chargeMode: "time", durationSec: 480, charges: durCharges(480),
      transformEquipTo: 6300, arm: 1, shield: -10, res: { death: 5 },
    },
    "star-ring": {
      chargeMode: "time", durationSec: 600, charges: durCharges(600),
      transformEquipTo: 12670, hpreg: 5, mpreg: 6,
    },
    "prismatic-ring": {
      chargeMode: "time", durationSec: 3600, charges: durCharges(3600),
      transformEquipTo: 16264, res: { physical: 10, energy: 8 }, lvl: 60,
    },
    "ring-of-blue-plasma": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      transformEquipTo: 23530, dist: 3, mag: 1, lvl: 100, vocs: ["paladin"],
    },
    "ring-of-green-plasma": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      transformEquipTo: 23532, mag: 2, hpreg: 4, mpreg: 6, lvl: 100,
      vocs: ["sorcerer", "druid"],
    },
    "ring-of-red-plasma": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      transformEquipTo: 23534, sword: 3, club: 3, axe: 3, res: { physical: 3 },
      lvl: 100, vocs: ["knight"],
    },
    "ring-of-orange-plasma": {
      chargeMode: "time", durationSec: 1800, charges: durCharges(1800),
      fist: 3, mag: 1, res: { physical: 2 }, lvl: 100, vocs: ["monk"],
    },
    "enchanted-blister-ring": {
      chargeMode: "time", durationSec: 3600, charges: durCharges(3600),
      transformEquipTo: 31616, res: { fire: 6 }, lvl: 250,
    },
    "enchanted-ring-of-souls": {
      chargeMode: "time", durationSec: 7200, charges: durCharges(7200),
      transformEquipSlug: "enchanted-ring-of-souls",
      res: { physical: 2 }, lifeLeech: 10, lvl: 200,
    },
    "spiritthorn-ring": {
      chargeMode: "time", durationSec: 3600, charges: durCharges(3600),
      transformEquipSlug: "charged-spiritthorn-ring",
      res: { physical: 2, fire: 4, earth: 4, energy: 4, ice: 4 }, lvl: 250,
    },
    "ethereal-ring": {
      chargeMode: "time", durationSec: 3600, charges: durCharges(3600),
      transformEquipSlug: "charged-ethereal-ring",
      res: { physical: 1, fire: 4, earth: 4, energy: 4, ice: 4 }, lvl: 250,
    },
    "alicorn-ring": {
      chargeMode: "time", durationSec: 3600, charges: durCharges(3600),
      transformEquipSlug: "charged-alicorn-ring",
      mag: 1, res: { fire: 4, earth: 4, energy: 4, ice: 4 },
      lvl: 400, vocs: ["paladin"],
    },
    "arboreal-ring": {
      chargeMode: "time", durationSec: 3600, charges: durCharges(3600),
      transformEquipSlug: "charged-arboreal-ring",
      mag: 2, res: { fire: 4, earth: 4, energy: 4, ice: 4 },
      lvl: 400, vocs: ["druid"],
    },

    /* ---- hit rings ---- */
    "might-ring": {
      chargeMode: "hits", charges: 20,
      res: { physical: 20, fire: 20, earth: 20, energy: 20, ice: 20, holy: 20, death: 20 },
    },

    /* ---- hit amulets / necklaces (Canary showCharges) ---- */
    "terra-amulet": {
      chargeMode: "hits", charges: 200, lvl: 60,
      res: { earth: 20, fire: -10 },
    },
    "glacier-amulet": {
      chargeMode: "hits", charges: 200, lvl: 60,
      res: { ice: 20, energy: -10 },
    },
    "lightning-pendant": {
      chargeMode: "hits", charges: 200, lvl: 60,
      res: { energy: 20, earth: -10 },
    },
    "magma-amulet": {
      chargeMode: "hits", charges: 200, lvl: 60,
      res: { fire: 20, ice: -10 },
    },
    "strange-talisman": {
      chargeMode: "hits", charges: 200, res: { energy: 10 },
    },
    "silver-amulet": {
      chargeMode: "hits", charges: 200, res: { earth: 10 },
    },
    "bronze-amulet": {
      chargeMode: "hits", charges: 200, res: { manadrain: 20 },
    },
    "stone-skin-amulet": {
      chargeMode: "hits", charges: 5, res: { physical: 80, death: 80 },
    },
    "elven-amulet": {
      chargeMode: "hits", charges: 50,
      res: { physical: 5, fire: 5, earth: 5, energy: 5, ice: 5, holy: 5, death: 5 },
    },
    "garlic-necklace": {
      chargeMode: "hits", charges: 150, res: { lifedrain: 20 },
    },
    "protection-amulet": {
      chargeMode: "hits", charges: 250, res: { physical: 6 },
    },
    "dragon-necklace": {
      chargeMode: "hits", charges: 200, res: { fire: 8 },
    },
    "bonfire-amulet": {
      chargeMode: "hits", charges: 5, lvl: 80, res: { physical: 60, fire: 40 },
    },
    "sacred-tree-amulet": {
      chargeMode: "hits", charges: 5, lvl: 80, res: { physical: 60, earth: 40 },
    },
    "shockwave-amulet": {
      chargeMode: "hits", charges: 5, lvl: 80, res: { physical: 60, energy: 40 },
    },
    "necklace-of-the-deep": {
      chargeMode: "hits", charges: 50, lvl: 80, res: { lifedrain: 50 },
    },
    "gill-necklace": {
      chargeMode: "hits", charges: 750, lvl: 60, res: { physical: 15, earth: 10 },
    },
    "prismatic-necklace": {
      chargeMode: "hits", charges: 750, lvl: 60, res: { physical: 10, energy: 15 },
    },
    "glooth-amulet": {
      chargeMode: "hits", charges: 20, lvl: 200,
      res: { physical: 10, fire: 10, earth: 10, energy: 10, ice: 10, holy: 10, death: 10 },
      vocs: ["sorcerer", "druid"],
    },
    "ring-of-temptation": {
      chargeMode: "hits", charges: 200, lvl: 80, res: { manadrain: 30 },
    },
  };

  for (const slug in CHARGEABLES) {
    if (!IT[slug]) continue;
    const patch = CHARGEABLES[slug];
    Object.assign(IT[slug], patch);
    IT[slug].supplyStashable = true;
  }

  /* Qualquer ring/amulet com charges e sem mode: hits se não for time-ring listado. */
  for (const slug in IT) {
    const it = IT[slug];
    if (!it || (it.s !== "ring" && it.s !== "amulet")) continue;
    if (it.charges && !it.chargeMode) it.chargeMode = "hits";
    if (it.charges) it.supplyStashable = true;
  }

  root.SUPPLY_STASH_CHARGEABLES = CHARGEABLES;
  root.SUPPLY_STASH_MAX_SLOTS = 20; // Baiak-like supply pouch: ~20 tipos (documentado)
})();
