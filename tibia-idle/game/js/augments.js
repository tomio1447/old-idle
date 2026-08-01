/* augments.js — sistema de Augments (TibiaWiki/Augments)
 *
 * Augments são modificadores temporários de MAGIAS específicas vindos de
 * itens equipados (set Sanguine, Norcferatu, Stoic Iks, Enlightenment,
 * Moonsilver...). Tipos (wiki):
 *   - base damage      (Impact): +% no dano BASE da spell;
 *   - base healing     (Impact): +% na cura BASE da spell;
 *   - critical extra damage   : +% no dano crítico da spell;
 *   - critical hit chance     : +% de chance de crítico DA spell;
 *   - cooldown                : reduz o cooldown da spell (ms);
 *   - life leech / mana leech : leech extra da spell;
 *   - chain                   : aumenta chains de spells em cadeia.
 *
 * Confirmado por CipSoft (17/05/2024): o bônus de dano/cura é aplicado
 * SOMENTE sobre o dano/cura base da spell afetada.
 */
"use strict";

/* Correções de grafia dos nomes de spell citados nos itens (a wiki às vezes
 * escreve diferente do jogo). */
const AUGMENT_SPELL_ALIAS = {
  "fierce beserk": "fierce berserk",   // typo da wiki (Sanguine Legs)
  "hells core": "hell's core",
  "death echo": "death echo",
  "spirit mend": "spirit mend",
  "restore balance": "restore balance",
  "thousand fist blows": "thousand fist blows",
  "divine barrage": "divine barrage",
  "groundshaker": "groundshaker",
  "strong ethereal spear": "strong ethereal spear",
  "intense wound cleansing": "intense wound cleansing",
  "wound cleansing": "wound cleansing",
  "wrath of nature": "wrath of nature",
  "great energy beam": "great energy beam",
  "great death beam": "great death beam",
  "mystic repulse": "mystic repulse",
  "forceful uppercut": "forceful uppercut",
  "sweeping takedown": "sweeping takedown",
  "devastating knockout": "devastating knockout",
  "swift jab": "swift jab",
  "double jab": "double jab",
  "flurry of blows": "flurry of blows",
  "greater flurry of blows": "greater flurry of blows",
  "chained penance": "chained penance",
  "greater tiger clash": "greater tiger clash",
  "annihilation": "annihilation",
  "brutal strike": "brutal strike",
  "ethereal spear": "ethereal spear",
  "ultimate flame strike": "ultimate flame strike",
  "ultimate ice strike": "ultimate ice strike",
  "ultimate energy strike": "ultimate energy strike",
  "ultimate terra strike": "ultimate terra strike",
  "rage of the skies": "rage of the skies",
  "divine caldera": "divine caldera",
  "divine grenade": "divine grenade",
  "divine missile": "divine missile",
  "energy wave": "energy wave",
  "terra wave": "terra wave",
  "strong ice wave": "strong ice wave",
  "eternal winter": "eternal winter",
  "hell's core": "hell's core",
  "front sweep": "front sweep",
  "avatar of balance": "avatar of balance",
  "avatar of light": "avatar of light",
  "avatar of nature": "avatar of nature",
  "avatar of steel": "avatar of steel",
  "avatar of storm": "avatar of storm",
  "summon knight familiar": "summon knight familiar",
};

/* Normaliza o nome da spell citada no augment para o ID usado pelo jogo.
 * Retorna o id (ou a chave normalizada quando a spell não existe). */
function augmentSpellId(nome) {
  if (!nome) return null;
  let n = String(nome).toLowerCase().trim();
  n = AUGMENT_SPELL_ALIAS[n] || n;
  const chave = n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (typeof SPELLS === "undefined") return chave || null;
  if (SPELLS[chave]) return chave;
  // busca por nome exato (case-insensitive)
  for (const id in SPELLS) {
    if (String(SPELLS[id].name || "").toLowerCase() === n) return id;
  }
  // busca parcial (último recurso)
  for (const id in SPELLS) {
    const nm = String(SPELLS[id].name || "").toLowerCase();
    if (nm.indexOf(n) !== -1 || n.indexOf(nm) !== -1) return id;
  }
  return chave || null;
}

/* Soma os augments de TODOS os itens equipados que afetam a spell `spellId`.
 * Retorna { baseDmg, baseHeal, critDmg, critChance, cdReduction,
 *           lifeLeech, manaLeech, chain, total } em % (ou ms p/ cooldown). */
function augmentTotals(p, spellId) {
  const t = { baseDmg: 0, baseHeal: 0, critDmg: 0, critChance: 0,
              cdReduction: 0, lifeLeech: 0, manaLeech: 0, chain: 0, total: 0 };
  if (!p || !p.equip || typeof GAMEDATA === "undefined") return t;
  for (const slot in p.equip) {
    const e = p.equip[slot];
    if (!e || !e.item) continue;
    const it = GAMEDATA.items[e.item];
    if (!it || !Array.isArray(it.aug)) continue;
    for (const a of it.aug) {
      if (!a || typeof a !== "object") continue;
      if (augmentSpellId(a.s) !== spellId) continue;
      t.total++;
      const v = Number(a.v) || 0;
      switch (String(a.k || "").toLowerCase()) {
        case "base damage":
        case "damage":
        case "impact":             t.baseDmg += v; break;
        case "base healing":
        case "healing":            t.baseHeal += v; break;
        case "critical extra damage": t.critDmg += v; break;
        case "critical hit chance":
        case "crit chance":        t.critChance += v; break;
        case "cooldown":           t.cdReduction += v; break;  // ms
        case "life leech":         t.lifeLeech += v; break;
        case "mana leech":         t.manaLeech += v; break;
        case "chain":              t.chain += Math.max(0, Math.round(v)); break;
      }
    }
  }
  return t;
}

/* Nome exibível (pt-BR) de um augment para o tooltip. */
function augmentLabel(a) {
  const spell = (a.s && typeof augmentSpellId === "function")
    ? augmentSpellId(a.s) : null;
  const nomeSpell = (spell && typeof SPELLS !== "undefined" && SPELLS[spell])
    ? SPELLS[spell].name : (a.s || "");
  const v = Number(a.v) || 0;
  switch (String(a.k || "").toLowerCase()) {
    case "cooldown":           return `${nomeSpell}: −${Math.round(v / 1000)}s cooldown`;
    case "critical extra damage": return `${nomeSpell}: +${v}% dano crítico extra`;
    case "critical hit chance":
    case "crit chance":        return `${nomeSpell}: +${v}% chance de crítico`;
    case "life leech":         return `${nomeSpell}: +${v}% life leech`;
    case "mana leech":         return `${nomeSpell}: +${v}% mana leech`;
    case "base healing":
    case "healing":            return `${nomeSpell}: +${v}% cura base`;
    case "chain":              return `${nomeSpell}: +${Math.round(v)} chain`;
    case "base damage":
    case "damage":
    case "impact":
    default:                   return `${nomeSpell}: +${v}% dano base`;
  }
}
