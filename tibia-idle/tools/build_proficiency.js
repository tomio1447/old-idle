/* build_proficiency.js — gera game/js/proficiencydata.js
 *
 * Fontes oficiais (CipSoft/Canary/crystalserver):
 *   C:\crystalserver\data\json\proficiencies.json  — árvores de perks por arma
 *   otclient game_proficiency/const.lua          — tabela de XP + enums
 *   otclient game_proficiency/proficiency_data.lua — regra de resolução
 *
 * Resolução de cada arma do WEAPONDATA para uma árvore:
 *   1. nome específico   "Sword 1H Magic Sword", "Throw - Spear", "Rod 1H ..."
 *   2. réplicas          "earth knight axe replica" -> "Replica Earth Axe"
 *   3. tier/título       "sanguine blade" -> "Sanguine 1H Sword"
 *   4. genérica por cls  "Generic 1H Sword Class 2"
 *   5. default           árvore Sanguine da categoria (como o OTClient)
 *
 * Uso: node tools/build_proficiency.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROF_JSON = "C:\\crystalserver\\data\\json\\proficiencies.json";
const OUT = path.join(ROOT, "game", "js", "proficiencydata.js");

/* ------------------------------- dados de entrada */

const profs = JSON.parse(fs.readFileSync(PROF_JSON, "utf8"));

global.window = {};
require(path.join(ROOT, "game", "js", "weapondata.js"));
require(path.join(ROOT, "game", "js", "spelldata.js"));
/* patch 15.25: adiciona as magias novas (Shield Slam, Barrages, Forked,
 * Death Echo, Thousand Fist Blows...) dentro de window.SPELLDATA — sem ele
 * os SpellIds 301/302/303/310/316/317/318 ficam sem slug. */
require(path.join(ROOT, "game", "js", "spelldata_1525.js"));
const ITEMS = window.WEAPONDATA.items;
const SPELLDATA = window.SPELLDATA;

/* spellId (CIP) -> slug do jogo */
const SID2SLUG = {};
for (const slug in SPELLDATA) {
  const sid = SPELLDATA[slug].sid;
  if (sid && !SID2SLUG[sid]) SID2SLUG[sid] = slug;
}
/* fallback por nome */
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const NAME2SLUG = {};
for (const slug in SPELLDATA) {
  NAME2SLUG[norm(SPELLDATA[slug].name)] = slug;
  NAME2SLUG[norm(SPELLDATA[slug].words)] = slug;
}

/* nomes dos spells por id CIP (SpellAugmentIcons do const.lua) */
const SPELL_ID_NAME = {
  1: "Light Healing", 2: "Intense Healing", 13: "Energy Wave", 19: "Fire Wave",
  22: "Energy Beam", 23: "Great Energy Beam", 24: "Hell's Core",
  43: "Strong Ice Wave", 56: "Wrath of Nature", 57: "Strong Ethereal Spear",
  59: "Front Sweep", 61: "Brutal Strike", 62: "Annihilation", 80: "Berserk",
  84: "Heal Friend", 87: "Death Strike", 88: "Energy Strike",
  89: "Flame Strike", 105: "Fierce Berserk", 106: "Groundshaker",
  107: "Whirlwind Throw", 112: "Ice Strike", 113: "Terra Strike",
  118: "Eternal Winter", 119: "Rage of the Skies", 120: "Terra Wave",
  121: "Ice Wave", 122: "Divine Missile", 123: "Wound Cleansing",
  124: "Divine Caldera", 125: "Divine Healing", 141: "Inflict Wound",
  148: "Physical Strike", 150: "Strong Flame Strike",
  153: "Strong Terra Strike", 154: "Ultimate Flame Strike",
  155: "Ultimate Energy Strike", 156: "Ultimate Ice Strike",
  157: "Ultimate Terra Strike", 158: "Intense Wound Cleansing",
  169: "Apprentice's Strike", 173: "Chill Out", 177: "Buzz", 178: "Scorch",
  238: "Divine Dazzle", 240: "Great Fire Wave", 258: "Divine Grenade",
  260: "Great Death Beam", 261: "Executioner Throw", 263: "Ice Burst",
  264: "Avatar of Steel", 265: "Avatar of Light", 266: "Avatar of Storm",
  267: "Avatar of Nature", 268: "Divine Empowerment",
  270: "Lesser Ethereal Spear", 271: "Lesser Front Sweep",
  283: "Avatar of Balance", 287: "Flurry of Blows", 288: "Chained Penance",
  289: "Greater Flurry of Blows", 290: "Mystic Repulse",
  292: "Greater Tiger Clash", 293: "Devastating Knockout",
  294: "Sweeping Takedown", 301: "Thousand Fist Blows",
  302: "Divine Barrage", 303: "Ethereal Barrage",
  310: "Death Echo", 316: "Shield Slam", 317: "Forked Glacier",
  318: "Forked Thorns", 262: "Ice Burst", 263: "Terra Burst",
};

function spellSlug(id) {
  if (SID2SLUG[id]) return SID2SLUG[id];
  const nm = SPELL_ID_NAME[id];
  if (nm && NAME2SLUG[norm(nm)]) return NAME2SLUG[norm(nm)];
  if (nm) {
    /* busca parcial: "Executioner Throw" -> "executioner-s-throw" */
    const want = norm(nm);
    const want2 = norm(nm.replace(/'s\b/gi, "s").replace(/'/g, ""));
    for (const n in NAME2SLUG) {
      const n2 = n.replace(/-s-/g, "-").replace(/-s$/, "");
      if (n.indexOf(want) !== -1 || want.indexOf(n) !== -1 ||
          n2.indexOf(want) !== -1 || want.indexOf(n2) !== -1 ||
          (want2 && (n.indexOf(want2) !== -1 || want2.indexOf(n) !== -1))) {
        return NAME2SLUG[n];
      }
    }
  }
  return null;
}

/* ------------------------------- índice das árvores */

const byName = {};
profs.forEach((d) => { byName[d.Name.toLowerCase()] = d; });

/* ------------------------------- categorização do item */

const WEAPON_CATS = { sword: 1, axe: 1, club: 1, distance: 1, fist: 1,
                      wand: 1, rod: 1 };

function weaponAmmoKindLocal(wp, slug) {
  const explicit = wp.ammoKind || wp.ammoType || wp.ammotype;
  if (explicit) {
    const k = String(explicit).toLowerCase();
    return k === "bolt" ? "bolt" : k === "arrow" ? "arrow" : null;
  }
  const id = String(slug || "");
  if (/soulbleeder|soulpiercer|thorn-spitter/.test(id)) return "arrow";
  if (/crossbow|arbalest|bolter|spitter|ironworker|devileye/.test(id)) return "bolt";
  if (/bow/.test(id) && !/crossbow/.test(id)) return "arrow";
  return null;
}

/* "Sword" | "Axe" | "Club" | "Bow" | "Fist" | "Wand" | "Rod" | "Throw" */
function itemCategory(slug, it) {
  if (it.cat === "distance") {
    return weaponAmmoKindLocal(it, slug) ? "Bow" : "Throw";
  }
  if (it.cat === "wand" || it.cat === "rod" ||
      it.t === "wand" || it.t === "rod" || it.t === "magic") {
    /* Wand=sorcerer, Rod=druid: a forma NÃO vem do nome — "soulhexer" é wand
     * mas usa a árvore "Soul 1H Rod" (druid) e "soultainter" é rod com a
     * árvore "Soul 1H Wand" (sorcerer), como no proficiencies.json. */
    const vocs = Array.isArray(it.vocs) ? it.vocs : [];
    const hasDruid = vocs.indexOf("druid") !== -1;
    const hasSorc = vocs.indexOf("sorcerer") !== -1;
    if (hasDruid && !hasSorc) return "Rod";
    if (hasSorc && !hasDruid) return "Wand";
    return /\brod\b/.test(it.n) ? "Rod" : "Wand";
  }
  if (it.cat === "fist") return "Fist";
  return it.cat.charAt(0).toUpperCase() + it.cat.slice(1);
}

function handedness(it, cat) {
  if (cat === "Bow" || cat === "Throw" || cat === "Fist") return "2H";
  if (cat === "Wand" || cat === "Rod") return "1H";
  return it.th ? "2H" : "1H";
}

const TIER_PATTERNS = [
  ["siphoning inferniarch", "Siphoning Inferniarch"],
  ["draining inferniarch", "Draining Inferniarch"],
  ["rending inferniarch", "Rending Inferniarch"],
  ["inferniarch", "Inferniarch"],
  ["gilded eldritch", "Gilded Eldritch"],
  ["eldritch", "Eldritch"],
  ["master umbral", "Master Umbral"],
  ["crude umbral", "Crude Umbral"],
  ["umbral", "Umbral"],
  ["grand sanguine", "Grand Sanguine"],
  ["sanguine", "Sanguine"],
  ["amber", "Amber"], ["soul", "Soul"], ["cobra", "Cobra"],
  ["falcon", "Falcon"], ["naga", "Naga"], ["lion", "Lion"],
  ["jungle", "Jungle"], ["glooth", "Glooth"], ["destruction", "Destruction"],
  ["crypt", "Crypt"], ["moonsilver", "Moonsilver"],
  ["stellar moonsilver", "Stellar Moonsilver"],
];

function detectTier(lname) {
  for (const [pat, tier] of TIER_PATTERNS) {
    if (lname.indexOf(pat) !== -1) return tier;
  }
  return null;
}

const REPLICA_ELEMENTS = [
  ["earth", "Earth"], ["energy", "Energy"], ["icy", "Ice"],
  ["ice", "Ice"], ["fiery", "Fire"], ["fire", "Fire"],
];

/* default OTClient: árvore Sanguine da categoria */
const DEFAULT_TREE = {
  Sword: "sanguine 1h sword", Axe: "sanguine 1h axe",
  Club: "sanguine 1h club", Bow: "sanguine 2h bow",
  Throw: "sanguine 2h bow", Fist: "sanguine 2h fist",
  Wand: "sanguine 1h wand", Rod: "sanguine 1h rod",
};

function resolveTree(slug, it) {
  const lname = it.n.toLowerCase();
  const cat = itemCategory(slug, it);
  const h = handedness(it, cat);

  /* 1. nomes específicos */
  const tries = [];
  if (cat === "Throw") {
    tries.push(`throw - ${lname}`);
  }
  if (cat === "Bow") {
    tries.push(`distance 2h ${lname}`, `distance ${lname}`,
               `throw - ${lname}`);
  } else if (cat === "Wand" || cat === "Rod") {
    tries.push(`${cat.toLowerCase()} 1h ${lname}`,
               `${cat.toLowerCase()} ${lname}`,
               `caster 1h ${lname}`, `caster ${lname}`);
  } else if (cat === "Fist") {
    tries.push(`fist 2h ${lname}`, `fist ${lname}`);
  } else {
    tries.push(`${cat.toLowerCase()} ${h.toLowerCase()} ${lname}`,
               `${cat.toLowerCase()} ${lname}`);
  }
  for (const nm of tries) if (byName[nm]) return byName[nm].Name;

  /* 2. réplicas ("earth knight axe replica" -> "Replica Earth Axe") */
  if (/replica/.test(lname)) {
    for (const [pat, el] of REPLICA_ELEMENTS) {
      if (lname.indexOf(pat + "-") === 0 || lname.indexOf(pat + " ") === 0) {
        const catName = cat === "Wand" || cat === "Rod" ? "Caster"
          : cat === "Bow" || cat === "Throw" ? "Distance" : cat;
        const nm = `replica ${el.toLowerCase()} ${catName.toLowerCase()}`;
        if (byName[nm]) return byName[nm].Name;
      }
    }
  }

  /* 3. tier family ("sanguine blade" -> "Sanguine 1H Sword") */
  const tier = detectTier(lname);
  if (tier) {
    let nm;
    if (tier === "Inferniarch" && (cat === "Bow" || cat === "Throw")) {
      nm = `${tier} 2H Distance`;
    } else if (cat === "Wand" || cat === "Rod") {
      nm = `${tier} 1H ${cat}`;
    } else {
      const catName = cat === "Throw" ? "Bow" : cat;
      nm = `${tier} ${h} ${catName}`;
    }
    if (byName[nm.toLowerCase()]) return byName[nm.toLowerCase()].Name;
    /* fallback: sem o handedness certo */
    const alt = h === "1H" ? "2H" : "1H";
    const nm2 = `${tier} ${alt} ${cat === "Throw" ? "Bow" : cat}`;
    if (byName[nm2.toLowerCase()]) return byName[nm2.toLowerCase()].Name;
  }

  /* 4. genérica por classificação do item */
  const cls = it.cls || 0;
  if (cls > 0) {
    const catName = cat === "Wand" || cat === "Rod" ? "Caster"
      : cat === "Throw" ? "Distance" : cat;
    const nm = `generic ${h.toLowerCase()} ${catName.toLowerCase()} class ${cls}`;
    if (byName[nm]) return byName[nm].Name;
  }
  /* genérica sem classe (Distance/Caster 2H) */
  const catGen = cat === "Wand" || cat === "Rod" ? "caster"
    : cat === "Throw" ? "distance" : cat.toLowerCase();
  const gen = `generic 2h ${catGen}`;
  if (byName[gen] && (cat === "Bow" || cat === "Throw" ||
                      cat === "Wand" || cat === "Rod" || cat === "Fist")) {
    return byName[gen].Name;
  }

  /* 5. default OTClient (árvore Sanguine da categoria) */
  const def = DEFAULT_TREE[cat] || DEFAULT_TREE.Sword;
  return byName[def] ? byName[def].Name : profs[0].Name;
}

/* coluna da tabela de XP (regular/knight/crossbow) */
function xpColumn(slug, it, cat) {
  if (cat === "Bow" &&
      (/crossbow/.test(slug) || weaponAmmoKindLocal(it, slug) === "bolt")) {
    return "crossbow";
  }
  if (Array.isArray(it.vocs) && it.vocs.indexOf("knight") !== -1) return "knight";
  return "regular";
}

/* ------------------------------- monta saída */

const XP_TABLE = {
  regular:  [1750, 25000, 100000, 400000, 2000000, 8000000, 30000000,
             60000000, 90000000],
  knight:   [1250, 20000, 80000, 300000, 1500000, 6000000, 20000000,
             40000000, 60000000],
  crossbow: [600, 8000, 30000, 150000, 650000, 2500000, 10000000,
             20000000, 30000000],
};

/* XP de proficiência por abate — tabela oficial por bestiaryStars;
 * bosses: Bane 500 / Archfoe 5000 / Nemesis 15000 */
const KILL_XP = { stars: [1, 30, 70, 100, 165, 240],
                  boss: { bane: 500, archfoe: 5000, nemesis: 15000 },
                  influencedMul: 1.1, fiendishMul: 2.5 };

const treeIds = {};   /* nome -> id sequencial */
const trees = [];     /* árvores usadas */
const items = {};     /* slug -> {t: treeId, x: coluna xp} */
const unmappedSpells = new Set();

function treeFor(entry) {
  const nm = entry.Name.toLowerCase();
  if (treeIds[nm] !== undefined) return treeIds[nm];
  const levels = entry.Levels.map((lv) =>
    (lv.Perks || []).map((pk) => {
      const o = { t: pk.Type, v: pk.Value };
      if (pk.SkillId !== undefined) o.sk = pk.SkillId;
      if (pk.ElementId !== undefined) o.el = pk.ElementId;
      if (pk.DamageType !== undefined) o.dt = pk.DamageType;
      if (pk.AugmentType !== undefined) o.ag = pk.AugmentType;
      if (pk.SpellId !== undefined) {
        o.sid = pk.SpellId;  /* id oficial p/ lookup de ícone */
        const s = spellSlug(pk.SpellId);
        if (s) o.sp = s; else { o.spid = pk.SpellId; unmappedSpells.add(pk.SpellId); }
      }
      if (pk.BestiaryId !== undefined) o.be = pk.BestiaryId;
      if (pk.BestiaryName !== undefined) o.bn = pk.BestiaryName;
      if (pk.Range !== undefined) o.r = pk.Range;
      if (pk.Multiplier !== undefined) o.m = pk.Multiplier;
      if (pk.Probability !== undefined) o.pr = pk.Probability;
      if (pk.MissileId !== undefined) o.mi = pk.MissileId;
      return o;
    }));
  const id = trees.length;
  trees.push({ n: entry.Name, pid: entry.ProficiencyId, lv: levels });
  treeIds[nm] = id;
  return id;
}

let mapped = 0;
for (const slug in ITEMS) {
  const it = ITEMS[slug];
  if (!it || !WEAPON_CATS[it.cat]) continue;
  const entry = resolveTree(slug, it);
  const prof = byName[entry.toLowerCase()];
  const cat = itemCategory(slug, it);
  items[slug] = { t: treeFor(prof), x: xpColumn(slug, it, cat) };
  mapped++;
}

/* ------------------------------- emite o arquivo */

const out = `/* proficiencydata.js — GERADO por tools/build_proficiency.js
 * Não edite à mão: rode \`node tools/build_proficiency.js\`.
 *
 * Fonte: proficiencies.json oficial (Canary/crystalserver) — árvores de
 * perks reais de cada arma, com os mesmos thresholds de XP do cliente.
 *   t=Type v=Value sk=SkillId el=ElementId dt=DamageType ag=AugmentType
 *   sp=spell slug be=BestiaryId bn=BestiaryName r=Range m=Multiplier
 *   pr=Probability mi=MissileId
 */
window.PROFDATA = ${JSON.stringify({ xp: XP_TABLE, kill: KILL_XP, trees, items })};
`;

fs.writeFileSync(OUT, out, "utf8");
console.log(`OK: ${mapped} armas -> ${trees.length} árvores, ${OUT}`);
console.log(`tamanho: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
if (unmappedSpells.size) {
  console.log("spellIds sem slug:", [...unmappedSpells].join(", "));
}
/* amostragem */
for (const s of ["magic-sword", "bow", "spear", "wand-of-vortex",
                 "sanguine-blade", "knife", "emerald-sword"]) {
  if (items[s]) {
    const tr = trees[items[s].t];
    console.log(`  ${s} -> "${tr.n}" (${tr.lv.length} níveis, xp:${items[s].x})`);
  }
}
