/* proficiency.js — Weapon Proficiency (Tibia 15.25/Summer Update 2025)
 *
 * Estado por personagem: p.prof = {
 *   xp:    { <slug>: number },              -- XP de proficiência por arma
 *   perks: { <slug>: { <lane>: <idx> } }    -- perk escolhido por nível
 * }
 *
 * Progressão OFICIAL (proficiencies.json + const.lua do cliente de
 * referência): cada kill com a arma equipada credita XP nela conforme a
 * dificuldade do bestiário; ao atingir o threshold de um nível o jogador
 * escolhe UM perk daquele lane — sem custo, apenas o nível da arma.
 * Os perks só ficam ativos enquanto a arma está empunhada e o jogador
 * cumpre os requisitos dela (nível/vocação), como no servidor.
 */
"use strict";

const PROFD = () => (typeof window !== "undefined" && window.PROFDATA)
  ? window.PROFDATA : (typeof PROFDATA !== "undefined" ? PROFDATA : null);

/* ElementId/DamageType -> elemento interno do jogo */
const PROF_ELEMENT = {
  0: "physical", 1: "physical", 4: "physical",
  8: "fire", 16: "earth", 32: "energy", 64: "ice",
  128: "holy", 256: "death", 512: "healing", 1024: "earth",
  2048: "death", 4096: "energy", 8192: "agony", 1048576: "healing",
};
const PROF_ELEMENT_NAME = {
  physical: "Physical", fire: "Fire", earth: "Earth", energy: "Energy",
  ice: "Ice", holy: "Holy", death: "Death", healing: "Healing",
  agony: "Agony",
};
const PROF_ELEMENT_NAME_PT = {
  physical: "físico", fire: "fogo", earth: "terra", energy: "energia",
  ice: "gelo", holy: "sagrado", death: "morte", healing: "cura",
  agony: "agony",
};

/* SkillId -> skill interna */
const PROF_SKILL = { 1: "magic", 6: "shield", 7: "dist", 8: "sword",
                     9: "club", 10: "axe", 11: "fist", 13: "fishing" };
const PROF_SKILL_NAME_PT = { magic: "Magic Level", shield: "Shielding",
  dist: "Distance Fighting", sword: "Sword Fighting",
  club: "Club Fighting", axe: "Axe Fighting", fist: "Fist Fighting",
  fishing: "Fishing" };

/* Tipos de perk (enum do servidor, proficiencies_definitions.hpp) */
const PROF_T = {
  ATK: 0, DEF: 1, WDEF: 2, SKILL: 3, MAGLV: 4, AUG: 5, BESTIARY: 6,
  BOSS: 7, CRIT_CH: 8, CRIT_CH_EL: 9, CRIT_CH_RUNE: 10, CRIT_CH_AUTO: 11,
  CRIT_DMG: 12, CRIT_DMG_EL: 13, CRIT_DMG_RUNE: 14, CRIT_DMG_AUTO: 15,
  MANA_LEECH: 16, LIFE_LEECH: 17, MANA_HIT: 18, LIFE_HIT: 19,
  MANA_KILL: 20, LIFE_KILL: 21, RANGE_DMG: 22, HIT_CH: 23, RANGE: 24,
  SK_AUTO: 25, SK_SPELL: 26, SK_HEAL: 27, ALPHA: 28, OMEGA: 29,
  ARMOR_PEN: 30, PIERCE: 31, HOMING: 32,
};

/* Augment types do perk 5 */
const PROF_AUG = { MANA_COST: 1, BASE_DMG: 2, HEALING: 3, DURATION: 4,
  TARGETS: 5, COOLDOWN: 6, AREA: 8, SKILL: 13, LIFE_LEECH: 14,
  MANA_LEECH: 15, CRIT_DMG: 16, CRIT_CH: 17 };

/* ------------------------------------------------------------ ícones
 * Atlas oficiais do cliente (game_proficiency/images), copiados para
 * game/assets/proficiency/. Cada célula tem 64x64; o offset vem do
 * const.lua do módulo OTC. icon-grey no OTC é o offset +64y — aqui o
 * estado travado usa CSS grayscale, então só o offset colorido importa. */
const PROF_ICON_ATLAS = "assets/proficiency/";

const PROF_ELEMENT_MASK = {           /* ElementId -> offset icons-1/2 */
  4: "0 0", 8: "64 0", 16: "192 0", 32: "128 0", 64: "256 0",
  128: "384 0", 256: "320 0", 512: "0 0", 8192: "0 0",
};
const PROF_PIERCE_MASK = {            /* DamageType -> offset pierce */
  0: "0 0", 8: "64 0", 16: "192 0", 32: "128 0", 64: "256 0",
  128: "384 0", 256: "320 0",
};
const PROF_MAGIC_MASK = {             /* DamageType -> offset icons-8 */
  8: "0 0", 16: "128 0", 32: "192 0", 64: "64 0", 128: "320 0",
  256: "256 0", 1048576: "384 0",
};
const PROF_SKILL_MASK = {             /* SkillId -> offset icons-4..7 */
  1: "256 0", 6: "320 0", 7: "384 0", 8: "0 0", 9: "128 0",
  10: "64 0", 11: "192 0", 13: "448 0",
};
const PROF_BESTIARY_MASK = {
  Amphibic: "0 0", Aquatic: "64 0", Bird: "128 0", Construct: "192 0",
  Demon: "256 0", Dragon: "320 0", Elemental: "384 0",
  "Extra Dimensional": "1216 0", Fey: "448 0", Giant: "512 0",
  Human: "576 0", Humanoid: "640 0", Inkborn: "1280 0",
  Lycanthrope: "704 0", Magical: "768 0", Mammal: "832 0",
  Plant: "896 0", Reptile: "960 0", Slime: "1024 0", Undead: "1088 0",
  Vermin: "1152 0",
};
const PROF_SPELL_ICON = {             /* SpellId oficial -> offset icons-9 */
  1: "0 0", 2: "64 0", 13: "128 0", 19: "192 0", 22: "192 192",
  23: "256 0", 24: "320 0", 43: "384 0", 56: "256 192", 57: "448 0",
  59: "512 0", 61: "576 0", 62: "640 0", 80: "704 0", 84: "768 0",
  87: "832 0", 88: "896 0", 89: "960 0", 105: "1024 0", 106: "1088 0",
  107: "1152 0", 112: "1216 0", 113: "0 64", 118: "64 64",
  119: "128 64", 120: "192 64", 121: "256 64", 122: "320 64",
  123: "384 64", 124: "448 64", 125: "512 64", 141: "576 64",
  148: "640 64", 150: "704 64", 153: "768 64", 154: "832 64",
  155: "896 64", 156: "960 64", 157: "1024 64", 158: "1088 64",
  169: "1152 64", 173: "1216 64", 177: "0 128", 178: "64 128",
  238: "128 128", 240: "192 128", 258: "256 128", 260: "320 128",
  261: "384 128", 263: "448 128", 264: "512 128", 265: "576 128",
  266: "640 128", 267: "704 128", 268: "768 128", 270: "832 128",
  271: "896 128", 283: "960 128", 287: "1024 128", 288: "1088 128",
  289: "1152 128", 290: "1216 128", 292: "0 192", 293: "64 192",
  294: "128 192",
};
const PROF_AUG_ICON = {               /* AugmentType -> offset augment-icons */
  3: "192 0", 6: "160 0", 2: "192 0", 14: "352 0", 15: "384 0",
  16: "224 0", 17: "224 0",
};
const PROF_TYPE_ICON = {              /* Type -> [atlas, offset] fixos */
  0: ["icons-0", "0 0"],      1: ["icons-0", "64 0"],
  2: ["icons-0", "128 0"],    7: ["icons-0", "192 0"],
  8: ["icons-0", "256 0"],    10: ["icons-0", "320 0"],
  11: ["icons-0", "384 0"],   12: ["icons-0", "448 0"],
  14: ["icons-0", "512 0"],   15: ["icons-0", "576 0"],
  17: ["icons-0", "640 0"],   16: ["icons-0", "704 0"],
  19: ["icons-0", "768 0"],   18: ["icons-0", "832 0"],
  21: ["icons-0", "896 0"],   20: ["icons-0", "960 0"],
  22: ["icons-0", "1024 0"],  23: ["icons-0", "1088 0"],
  24: ["icons-0", "1152 0"],
  /* os offsets oficiais de alpha/omega/armor-pen (1216/1280/1344) e homing
     não existem no atlas 15.25 de 1216px — fallback para células válidas */
  28: ["icons-0", "448 0"],   /* alpha strike -> crit extra dmg */
  29: ["icons-0", "576 0"],   /* omega strike -> auto crit dmg */
  30: ["icons-0", "0 0"],     /* armor pen -> weapon attack */
  32: ["icons-0", "1088 0"],  /* homing -> ranged hit chance */
};

/* {src, x, y, aug:{x,y}|null} do ícone de 64px do perk. */
function profPerkIcon(pk) {
  const off = (s) => { const p = String(s || "0 0").split(" ");
    return { x: +p[0] || 0, y: +p[1] || 0 }; };
  let src = "icons-0", o = off("0 0"), aug = null;
  switch (pk.t) {
    case PROF_T.AUG:
      src = "icons-9";
      o = off(PROF_SPELL_ICON[pk.sid] || "0 0");
      if (PROF_AUG_ICON[pk.ag]) { const a = off(PROF_AUG_ICON[pk.ag]);
        aug = { src: "augment-icons", x: a.x, y: a.y }; }
      break;
    case PROF_T.BESTIARY:
      src = "icons-3"; o = off(PROF_BESTIARY_MASK[pk.bn]); break;
    case PROF_T.MAGLV:
      src = "icons-8"; o = off(PROF_MAGIC_MASK[pk.dt]); break;
    case PROF_T.CRIT_CH_EL:
      src = "icons-2"; o = off(PROF_ELEMENT_MASK[pk.el]); break;
    case PROF_T.CRIT_DMG_EL:
      src = "icons-1"; o = off(PROF_ELEMENT_MASK[pk.el]); break;
    case PROF_T.SKILL:
      src = "icons-7"; o = off(PROF_SKILL_MASK[pk.sk]); break;
    case PROF_T.SK_AUTO:
      src = "icons-4"; o = off(PROF_SKILL_MASK[pk.sk]); break;
    case PROF_T.SK_SPELL:
      src = "icons-5"; o = off(PROF_SKILL_MASK[pk.sk]); break;
    case PROF_T.SK_HEAL:
      src = "icons-6"; o = off(PROF_SKILL_MASK[pk.sk]); break;
    case PROF_T.PIERCE:
      src = "icons-weaponmastery-elementalPiercing";
      o = off(PROF_PIERCE_MASK[pk.dt]); break;
    default: {
      const d = PROF_TYPE_ICON[pk.t];
      if (d) { src = d[0]; o = off(d[1]); }
    }
  }
  return { src: PROF_ICON_ATLAS + src + ".png", x: o.x, y: o.y, aug: aug };
}

/* ------------------------------------------------------------ estado */

function profData() { return PROFD(); }

function ensureProf(p) {
  if (!p.prof) p.prof = { xp: {}, perks: {} };
  if (!p.prof.xp) p.prof.xp = {};
  if (!p.prof.perks) p.prof.perks = {};
  return p.prof;
}

function profItemEntry(slug) {
  const D = profData();
  return (D && D.items[slug]) || null;
}

function profTree(slug) {
  const D = profData(), e = profItemEntry(slug);
  return (D && e) ? D.trees[e.t] : null;
}

function profLaneCount(slug) {
  const tr = profTree(slug);
  return tr ? tr.lv.length : 0;
}

function profXpColumn(slug) {
  const e = profItemEntry(slug);
  return (e && e.x) || "regular";
}

/* XP necessário para o nível `lvl` (1-based) da arma. */
function profXpNeed(slug, lvl) {
  const D = profData();
  const col = D.xp[profXpColumn(slug)] || D.xp.regular;
  return col[Math.min(lvl, col.length) - 1] || 0;
}

/* XP máximo do item (dominar = laneCount + 2 thresholds, como o cliente). */
function profXpMax(slug) {
  const lanes = profLaneCount(slug);
  const D = profData();
  const col = D.xp[profXpColumn(slug)] || D.xp.regular;
  return col[Math.min(lanes + 1, col.length - 1)] || col[col.length - 1];
}

function profXp(p, slug) {
  if (!p || !p.prof || !p.prof.xp) return 0;
  return p.prof.xp[slug] || 0;
}

/* Nível de proficiência da arma (0..laneCount). */
function profLevel(p, slug) {
  const xp = profXp(p, slug), lanes = profLaneCount(slug);
  let lvl = 0;
  for (let i = 1; i <= lanes && xp >= profXpNeed(slug, i); i++) lvl = i;
  return lvl;
}

/* perks escolhidos {lane: perkIdx} (0-based) */
function profPicked(p, slug) {
  if (!p || !p.prof || !p.prof.perks) return {};
  return p.prof.perks[slug] || {};
}

/* A arma pode ganhar XP / usar perks? existe no catálogo */
function profHasTree(slug) { return !!profTree(slug); }

/* Arma atualmente equipada do jogador (slug) */
function profEquippedSlug(p) {
  const w = p && p.equip && p.equip.weapon;
  return (w && w.item) || null;
}

/* Perks ativos = arma equipada + jogador cumpre os requisitos dela. */
function profActive(p) {
  const slug = profEquippedSlug(p);
  if (!slug || !profHasTree(slug)) return null;
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || null;
  if (typeof itemLiberado === "function" && it && !itemLiberado(p, it)) {
    return { slug: slug, inactive: true };
  }
  return { slug: slug, inactive: false };
}

/* ------------------------------------------------------------ XP / kill */

/* XP de proficiência creditado num abate (tabela oficial por estrelas do
 * bestiário; bosses usam a tabela de Bosstiary: Bane/Archfoe/Nemesis). */
function profKillXp(m) {
  const D = profData();
  const K = (D && D.kill) || { stars: [1, 30, 70, 100, 165, 240],
    boss: { bane: 500, archfoe: 5000, nemesis: 15000 } };
  const def = (m && m.def) || {};
  let xp;
  if (def.boss || m.boss) {
    /* sem raridade de bosstiary no nosso data: Archfoe é o caso comum */
    xp = K.boss.archfoe;
  } else {
    const stars = Math.max(0, Math.min(5,
      (def.best && def.best.stars) || 0));
    xp = K.stars[stars];
  }
  if (m && m.influenced) xp = Math.round(xp * (K.influencedMul || 1.1));
  if (m && m.fiendish) xp = Math.round(xp * (K.fiendishMul || 2.5));
  return xp;
}

/* Chamado no bloco de kill: credita XP na arma empunhada e aplica os
 * ganhos fixos de kill (life/mana on kill). Retorna info p/ o evento. */
function proficiencyOnKill(c, p, m) {
  if (!p) return null;
  ensureProf(p);
  const act = profActive(p);
  if (!act) return null;
  let gained = 0;
  let levelUps = 0;
  if (!act.inactive) {
    const before = profLevel(p, act.slug);
    gained = profKillXp(m);
    if (gained > 0) {
      p.prof.xp[act.slug] = profXp(p, act.slug) + gained;
      const after = profLevel(p, act.slug);
      levelUps = after - before;
    }
  }
  /* life/mana on kill — perks ativos da arma empunhada */
  const t = proficiencyTotals(p);
  if (t.lifeOnKill || t.manaOnKill) {
    const mx = (typeof maxStats === "function") ? maxStats(p) : null;
    if (t.lifeOnKill && mx) p.hp = Math.min(mx.hp, p.hp + t.lifeOnKill);
    if (t.manaOnKill && mx) p.mp = Math.min(mx.mp, p.mp + t.manaOnKill);
  }
  return { slug: act.slug, xp: gained, ups: levelUps };
}

/* ------------------------------------------------------------ perks */

/* Pode escolher o perk do lane? (0-based). Sem custo: basta o nível. */
function profCanPick(p, slug, lane) {
  return profLevel(p, slug) >= lane + 1;
}

/* Escolhe (ou troca) o perk do lane. Sem custo nenhum. */
function proficiencyPick(p, slug, lane, perkIdx) {
  ensureProf(p);
  if (!profHasTree(slug)) return false;
  const lv = profTree(slug).lv[lane];
  if (!lv || !lv[perkIdx]) return false;
  if (!profCanPick(p, slug, lane)) return false;
  if (!p.prof.perks[slug]) p.prof.perks[slug] = {};
  if (p.prof.perks[slug][lane] === perkIdx) delete p.prof.perks[slug][lane];
  else p.prof.perks[slug][lane] = perkIdx;
  return true;
}

/* Perks efetivos da arma: [{lane, idx, perk}] apenas escolhidos+liberados */
function profActivePerks(p, slug) {
  const lvl = profLevel(p, slug), picks = profPicked(p, slug);
  const tr = profTree(slug), out = [];
  if (!tr) return out;
  for (let lane = 0; lane < tr.lv.length; lane++) {
    const idx = picks[lane];
    if (idx === undefined || lane >= lvl) continue;
    const perk = tr.lv[lane][idx];
    if (perk) out.push({ lane: lane, idx: idx, perk: perk });
  }
  return out;
}

/* ------------------------------------------------------------ totais */

/* Soma todos os perks ativos da arma EMPUNHADA. Percentuais saem em %
 * (frações oficiais convertidas); multiplicadores de skill ficam crus. */
function proficiencyTotals(p) {
  const t = {
    atk: 0, defense: 0, weaponDef: 0, skill: {}, magLevel: {},
    augs: {}, bestiary: {}, bossDmg: 0,
    crit: { chance: 0, dmg: 0 },
    critEl: { chance: {}, dmg: {} },
    critRune: { chance: 0, dmg: 0 }, critAuto: { chance: 0, dmg: 0 },
    manaLeech: 0, lifeLeech: 0, manaOnHit: 0, lifeOnHit: 0,
    manaOnKill: 0, lifeOnKill: 0,
    perfectShot: [], hitChance: 0, range: 0,
    skillPctAuto: {}, skillPctSpell: {}, skillPctHeal: {},
    alpha: 0, omega: 0, armorPen: 0, pierce: {}, procs: [],
    slug: null, inactive: false,
  };
  const act = profActive(p);
  if (!act || act.inactive) {
    if (act) { t.slug = act.slug; t.inactive = true; }
    return t;
  }
  t.slug = act.slug;
  const pct = (v) => v * 100;
  for (const { perk } of profActivePerks(p, act.slug)) {
    const v = Number(perk.v) || 0;
    const el = PROF_ELEMENT[perk.el] || PROF_ELEMENT[perk.dt];
    const sk = PROF_SKILL[perk.sk];
    switch (perk.t) {
      case PROF_T.ATK: t.atk += v; break;
      case PROF_T.DEF: t.defense += v; break;
      case PROF_T.WDEF: t.weaponDef += v; break;
      case PROF_T.SKILL:
        if (sk) t.skill[sk] = (t.skill[sk] || 0) + v; break;
      case PROF_T.MAGLV:
        if (el) t.magLevel[el] = (t.magLevel[el] || 0) + v; break;
      case PROF_T.AUG: {
        if (!perk.sp || !perk.ag) break;
        const a = t.augs[perk.sp] || (t.augs[perk.sp] = {
          baseDmg: 0, baseHeal: 0, cdReduction: 0, critDmg: 0,
          critChance: 0, lifeLeech: 0, manaLeech: 0, manaCost: 0,
          targets: 0, area: false });
        switch (perk.ag) {
          case PROF_AUG.BASE_DMG: a.baseDmg += pct(v); break;
          case PROF_AUG.HEALING: a.baseHeal += pct(v); break;
          case PROF_AUG.COOLDOWN: a.cdReduction += v; break; /* ms */
          case PROF_AUG.CRIT_DMG: a.critDmg += pct(v); break;
          case PROF_AUG.CRIT_CH: a.critChance += pct(v); break;
          case PROF_AUG.LIFE_LEECH: a.lifeLeech += pct(v); break;
          case PROF_AUG.MANA_LEECH: a.manaLeech += pct(v); break;
          case PROF_AUG.MANA_COST: a.manaCost += pct(v); break;
          case PROF_AUG.TARGETS: a.targets += Math.round(v); break;
          case PROF_AUG.AREA: a.area = true; break;
        }
        break;
      }
      case PROF_T.BESTIARY:
        if (perk.bn) t.bestiary[perk.bn] = (t.bestiary[perk.bn] || 0) + pct(v);
        break;
      case PROF_T.BOSS: t.bossDmg += pct(v); break;
      case PROF_T.CRIT_CH: t.crit.chance += pct(v); break;
      case PROF_T.CRIT_CH_EL:
        if (el) t.critEl.chance[el] = (t.critEl.chance[el] || 0) + pct(v);
        break;
      case PROF_T.CRIT_CH_RUNE: t.critRune.chance += pct(v); break;
      case PROF_T.CRIT_CH_AUTO: t.critAuto.chance += pct(v); break;
      case PROF_T.CRIT_DMG: t.crit.dmg += pct(v); break;
      case PROF_T.CRIT_DMG_EL:
        if (el) t.critEl.dmg[el] = (t.critEl.dmg[el] || 0) + pct(v);
        break;
      case PROF_T.CRIT_DMG_RUNE: t.critRune.dmg += pct(v); break;
      case PROF_T.CRIT_DMG_AUTO: t.critAuto.dmg += pct(v); break;
      case PROF_T.MANA_LEECH: t.manaLeech += pct(v); break;
      case PROF_T.LIFE_LEECH: t.lifeLeech += pct(v); break;
      case PROF_T.MANA_HIT: t.manaOnHit += v; break;
      case PROF_T.LIFE_HIT: t.lifeOnHit += v; break;
      case PROF_T.MANA_KILL: t.manaOnKill += v; break;
      case PROF_T.LIFE_KILL: t.lifeOnKill += v; break;
      case PROF_T.RANGE_DMG:
        t.perfectShot.push({ range: perk.r || 1, dmg: v }); break;
      case PROF_T.HIT_CH: t.hitChance += pct(v); break;
      case PROF_T.RANGE: t.range += v; break;
      case PROF_T.SK_AUTO:
        if (sk) t.skillPctAuto[sk] = (t.skillPctAuto[sk] || 0) + v; break;
      case PROF_T.SK_SPELL:
        if (sk) t.skillPctSpell[sk] = (t.skillPctSpell[sk] || 0) + v; break;
      case PROF_T.SK_HEAL:
        if (sk) t.skillPctHeal[sk] = (t.skillPctHeal[sk] || 0) + v; break;
      case PROF_T.ALPHA: t.alpha += v; break;
      case PROF_T.OMEGA: t.omega += v; break;
      case PROF_T.ARMOR_PEN: t.armorPen += v; break;
      case PROF_T.PIERCE:
        if (el) t.pierce[el] = (t.pierce[el] || 0) + pct(v); break;
      case PROF_T.HOMING:
        if (el) t.procs.push({ el: el, mult: perk.m || 0,
                               prob: perk.pr || 0 }); break;
    }
  }
  return t;
}

function proficiencySkillBonus(p, which) {
  const t = proficiencyTotals(p);
  return t.skill[which] || 0;
}

/* Magic level extra por elemento (perk Special Magic Level). */
function proficiencyMagicBonus(p, element) {
  const t = proficiencyTotals(p);
  return t.magLevel[element] || 0;
}

/* Augments de proficiência de uma spell (mescla com os dos itens). */
function proficiencyAugTotals(p, spellId) {
  const t = proficiencyTotals(p);
  return t.augs[spellId] || null;
}

/* ------------------------------------------------------------ labels */

function profPctTxt(v) {
  /* fração -> "5%"/"7,5%"; valores >= 1 vêm diretos (type 27 usa isso) */
  const pv = (v >= 1) ? v : v * 100;
  const s = (Math.round(pv * 100) / 100).toString().replace(".", ",");
  return s + "%";
}

function proficiencyPerkName(pk) {
  switch (pk.t) {
    case PROF_T.ATK: return "Attack Damage";
    case PROF_T.DEF: return "Defence";
    case PROF_T.WDEF: return "Weapon Shield Mod";
    case PROF_T.SKILL: return "Skill Bonus";
    case PROF_T.MAGLV: return "Special Magic Boost";
    case PROF_T.AUG: return "Spell Augment";
    case PROF_T.BESTIARY: return "Bestiary Damage";
    case PROF_T.BOSS: return "Powerful Foe Bonus";
    case PROF_T.CRIT_CH: case PROF_T.CRIT_CH_EL:
    case PROF_T.CRIT_CH_RUNE: case PROF_T.CRIT_CH_AUTO:
      return "Critical Hit Chance";
    case PROF_T.CRIT_DMG: case PROF_T.CRIT_DMG_EL:
    case PROF_T.CRIT_DMG_RUNE: case PROF_T.CRIT_DMG_AUTO:
      return "Critical Extra Damage";
    case PROF_T.MANA_LEECH: return "Mana Leech";
    case PROF_T.LIFE_LEECH: return "Life Leech";
    case PROF_T.MANA_HIT: return "Mana Gain on Hit";
    case PROF_T.LIFE_HIT: return "Life Gain on Hit";
    case PROF_T.MANA_KILL: return "Mana Gain on Kill";
    case PROF_T.LIFE_KILL: return "Life Gain on Kill";
    case PROF_T.RANGE_DMG: return "Perfect Shot Damage";
    case PROF_T.HIT_CH: return "Ranged Hit Chance";
    case PROF_T.RANGE: return "Attack Range";
    case PROF_T.SK_AUTO: return "Skill Percentage Auto-Attack Damage";
    case PROF_T.SK_SPELL: return "Skill Percentage Spell Damage";
    case PROF_T.SK_HEAL: return "Skill Percentage Spell Healing";
    case PROF_T.ALPHA: return "Alpha Strike";
    case PROF_T.OMEGA: return "Omega Strike";
    case PROF_T.ARMOR_PEN: return "Armor Penetration";
    case PROF_T.PIERCE: return "Elemental Pierce";
    case PROF_T.HOMING: return "Homing Missile";
  }
  return "Perk";
}

function proficiencyPerkDesc(pk) {
  const v = Number(pk.v) || 0;
  const el = PROF_ELEMENT[pk.el] || PROF_ELEMENT[pk.dt];
  const elPt = PROF_ELEMENT_NAME_PT[el] || el || "?";
  const sk = PROF_SKILL[pk.sk];
  const skPt = PROF_SKILL_NAME_PT[sk] || sk || "?";
  switch (pk.t) {
    case PROF_T.ATK: return `+${v} ataque`;
    case PROF_T.DEF: return `+${v} defesa`;
    case PROF_T.WDEF: return `+${v} modificador de defesa`;
    case PROF_T.SKILL: return `+${v} ${skPt}`;
    case PROF_T.MAGLV: return `+${v} Magic Level (${elPt})`;
    case PROF_T.AUG: {
      const sp = (typeof SPELLS !== "undefined" && SPELLS[pk.sp] &&
                  SPELLS[pk.sp].name) || pk.sp || "?";
      switch (pk.ag) {
        case PROF_AUG.BASE_DMG: return `+${profPctTxt(v)} dano base de ${sp}`;
        case PROF_AUG.HEALING: return `+${profPctTxt(v)} cura base de ${sp}`;
        case PROF_AUG.COOLDOWN:
          return `−${Math.round(v / 1000)}s cooldown de ${sp}`;
        case PROF_AUG.CRIT_DMG:
          return `+${profPctTxt(v)} dano crítico extra de ${sp}`;
        case PROF_AUG.CRIT_CH:
          return `+${profPctTxt(v)} chance de crítico de ${sp}`;
        case PROF_AUG.LIFE_LEECH: return `+${profPctTxt(v)} life leech de ${sp}`;
        case PROF_AUG.MANA_LEECH: return `+${profPctTxt(v)} mana leech de ${sp}`;
        case PROF_AUG.MANA_COST: return `−${profPctTxt(v)} custo de mana de ${sp}`;
        case PROF_AUG.TARGETS: return `+${Math.round(v)} alvo(s) em ${sp}`;
        case PROF_AUG.AREA: return `área ampliada em ${sp}`;
      }
      return `augment de ${sp}`;
    }
    case PROF_T.BESTIARY:
      return `+${profPctTxt(v)} dano contra ${pk.bn || "criaturas"}`;
    case PROF_T.BOSS:
      return `+${profPctTxt(v)} dano contra bosses e Sinister Embraced`;
    case PROF_T.CRIT_CH: return `+${profPctTxt(v)} chance de crítico`;
    case PROF_T.CRIT_CH_EL:
      return `+${profPctTxt(v)} chance de crítico (${elPt} spells/runas)`;
    case PROF_T.CRIT_CH_RUNE:
      return `+${profPctTxt(v)} chance de crítico (runas ofensivas)`;
    case PROF_T.CRIT_CH_AUTO:
      return `+${profPctTxt(v)} chance de crítico (auto-attack)`;
    case PROF_T.CRIT_DMG: return `+${profPctTxt(v)} dano crítico extra`;
    case PROF_T.CRIT_DMG_EL:
      return `+${profPctTxt(v)} dano crítico extra (${elPt} spells/runas)`;
    case PROF_T.CRIT_DMG_RUNE:
      return `+${profPctTxt(v)} dano crítico extra (runas ofensivas)`;
    case PROF_T.CRIT_DMG_AUTO:
      return `+${profPctTxt(v)} dano crítico extra (auto-attack)`;
    case PROF_T.MANA_LEECH: return `+${profPctTxt(v)} mana leech`;
    case PROF_T.LIFE_LEECH: return `+${profPctTxt(v)} life leech`;
    case PROF_T.MANA_HIT: return `+${v} mana por hit`;
    case PROF_T.LIFE_HIT: return `+${v} HP por hit`;
    case PROF_T.MANA_KILL: return `+${v} mana por kill`;
    case PROF_T.LIFE_KILL: return `+${v} HP por kill`;
    case PROF_T.RANGE_DMG: return `+${v} dano a ${pk.r || 1} SQM de distância`;
    case PROF_T.HIT_CH: return `+${profPctTxt(v)} chance de acerto`;
    case PROF_T.RANGE: return `+${v} alcance`;
    case PROF_T.SK_AUTO:
      return `${profPctTxt(v)} do seu ${skPt} como dano extra nos auto-attacks`;
    case PROF_T.SK_SPELL:
      return `${profPctTxt(v)} do seu ${skPt} como dano extra nas spells`;
    case PROF_T.SK_HEAL:
      return `${profPctTxt(v)} do seu ${skPt} como cura extra nas spells`;
    case PROF_T.ALPHA:
      return `+${profPctTxt(v)} dano contra alvos com ≥95% HP`;
    case PROF_T.OMEGA:
      return `+${profPctTxt(v)} dano contra alvos com ≤30% HP`;
    case PROF_T.ARMOR_PEN: return `${profPctTxt(v)} armor penetration`;
    case PROF_T.PIERCE: return `+${profPctTxt(v)} pierce de ${elPt}`;
    case PROF_T.HOMING:
      return `${Math.round((pk.pr || 0) * 100)}% chance: míssil de ${elPt} (${pk.m || 0}× level)`;
  }
  return "";
}

/* ------------------------------------------------------------ lista */

/* Todas as armas do catálogo, agrupadas por categoria, com progresso do
 * jogador. Ordenadas por: empunhada > possuída > ataque/valor. */
function profWeaponList(p, opts) {
  const D = profData();
  const out = [];
  if (!D) return out;
  opts = opts || {};
  const eq = profEquippedSlug(p);
  for (const slug in D.items) {
    const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]);
    if (!it) continue;
    if (opts.cat) {
      const c = it.cat === "wand" || it.cat === "rod" ? "wand" : it.cat;
      if (c !== opts.cat) continue;
    }
    const owned = (typeof bagCount === "function" && bagCount(p, slug) > 0) ||
                  eq === slug;
    if (opts.ownedOnly && !owned) continue;
    const lvl = profLevel(p, slug);
    const xp = profXp(p, slug);
    const usable = (typeof itemLiberado === "function")
      ? itemLiberado(p, it) : true;
    out.push({ slug: slug, it: it, level: lvl, xp: xp, owned: owned,
               equipped: eq === slug, usable: usable,
               lanes: profLaneCount(slug) });
  }
  out.sort((a, b) => {
    if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    if (a.level !== b.level) return b.level - a.level;
    return (b.it.atk || 0) - (a.it.atk || 0);
  });
  return out;
}

/* Progresso dentro do nível atual (0..1) e texto "xp / next". */
function profProgress(p, slug) {
  const lvl = profLevel(p, slug), lanes = profLaneCount(slug);
  const xp = profXp(p, slug);
  const mastered = lvl >= lanes;
  const prev = lvl === 0 ? 0 : profXpNeed(slug, lvl);
  const next = mastered ? profXpMax(slug) : profXpNeed(slug, lvl + 1);
  const frac = mastered ? Math.min(1, xp / Math.max(1, profXpMax(slug)))
    : Math.min(1, (xp - prev) / Math.max(1, next - prev));
  return { level: lvl, lanes: lanes, xp: xp, prev: prev, next: next,
           frac: frac, mastered: mastered };
}

if (typeof module !== "undefined") {
  module.exports = { ensureProf, profLevel, profXp, profXpNeed, profXpMax,
    profKillXp, proficiencyOnKill, proficiencyPick, profCanPick,
    profActivePerks, proficiencyTotals, proficiencySkillBonus,
    proficiencyMagicBonus, proficiencyAugTotals, proficiencyPerkDesc,
    proficiencyPerkName, profWeaponList, profProgress, profTree,
    profPicked, profLaneCount, profEquippedSlug, profActive, profPerkIcon,
    profHasTree, profData, PROF_T };
}
