/*
 * spells.js — motor de magias com as formulas reais do Canary 15.x
 *
 * SPELLDATA (js/spelldata.js) traz as 186 magias do otclient com o indice do
 * icone e, quando a magia existe no canary, os coeficientes da formula que o
 * servidor usa de verdade. As formulas foram obtidas EXECUTANDO os scripts
 * Lua do canary com stubs e amostrando o resultado (tools/canary_spell_runner)
 * — nao sao aproximacoes.
 *
 * Dois modos de formula:
 *   magic : valor = lvl*level + ml*magicLevel + flat
 *   skill : valor = sa*(skill*attack) + sk*skill + at*attack + lvl*level + flat
 *
 * O jogo nao tem grid de SQM nas hunts, entao `alvos` (derivado da AREA_* do
 * canary) vira "quantos monstros a magia acerta de uma vez".
 */
"use strict";

/* Nomes de vocacao usados nos dados (ja colapsados nas 5 bases) */
const SPELL_VOCS = ["sorcerer", "druid", "paladin", "knight", "monk"];

/* Tipos que o Helper agrupa em abas */
const SPELL_TIPOS = {
  attack: "Ataque",
  heal: "Cura",
  cure: "Cura de condição",
  support: "Suporte",
  conjure: "Conjuração",
  summon: "Invocação",
};

/* Todas as magias, indexadas pelas palavras (exura-gran) */
const ALL_SPELLS = (typeof window !== "undefined" && window.SPELLDATA)
  ? window.SPELLDATA : {};

/* ---------------------------------------------------------------- consulta */

/* A magia esta disponivel para essa vocacao? */
function spellForVoc(s, voc) {
  return !!s && Array.isArray(s.vocs) && s.vocs.indexOf(voc) !== -1;
}

/* O personagem ja pode lancar (vocacao + nivel + magic level)? */
function spellUnlocked(p, s) {
  if (!spellForVoc(s, p.voc)) return false;
  if (p.level < (s.lvl || 1)) return false;
  if (s.ml && typeof effMagic === "function" && effMagic(p) < s.ml) return false;
  return true;
}

/* Lista as magias de um tipo para a vocacao, ordenadas por nivel */
function spellsOf(voc, tipo) {
  const out = [];
  for (const id in ALL_SPELLS) {
    const s = ALL_SPELLS[id];
    if (tipo && s.type !== tipo) continue;
    if (!spellForVoc(s, voc)) continue;
    out.push(s);
  }
  out.sort((a, b) => (a.lvl - b.lvl) || a.name.localeCompare(b.name));
  return out;
}

/* Todas as magias da vocacao agrupadas por tipo (para o Helper) */
function spellsByType(voc) {
  const g = {};
  for (const t in SPELL_TIPOS) g[t] = [];
  for (const id in ALL_SPELLS) {
    const s = ALL_SPELLS[id];
    if (!spellForVoc(s, voc)) continue;
    (g[s.type] || (g[s.type] = [])).push(s);
  }
  for (const t in g) {
    g[t].sort((a, b) => (a.lvl - b.lvl) || a.name.localeCompare(b.name));
  }
  return g;
}

/* ---------------------------------------------------------------- formulas */

/* Skill que a magia usa: o canary aplica a skill da arma equipada.
 * Monk sem arma usa fist; knight usa sword/axe/club; paladin usa dist. */
function spellSkillFor(p, s) {
  if (typeof weaponSkill !== "function") return "fist";
  const sk = weaponSkill(p);
  // magias de arremesso do paladin (exori con / exori san) usam distance
  if (s && s.range && s.range > 1 && p.voc === "paladin") return "dist";
  // magias de punho do monk (exori pug / exori nia) usam fist mesmo com arma
  if (s && p.voc === "monk" && /pug|nia/.test(s.words || "")) return "fist";
  return sk === "magic" ? "fist" : sk;
}

/* Attack do item equipado, usado nas formulas de skill do canary */
function spellAttackValue(p) {
  const w = p.equip && p.equip.weapon;
  if (!w) return 7;                          // punho vale attack 7 no canary
  const it = (typeof upgradedStats === "function")
    ? upgradedStats(p, "equip:weapon", w.item)
    : (typeof GAMEDATA !== "undefined" ? GAMEDATA.items[w.item] : null);
  if (!it) return 7;
  if (it.t === "distance") {
    const ammo = it.inf ? null
      : (p.equip.ammo && typeof GAMEDATA !== "undefined"
         ? GAMEDATA.items[p.equip.ammo.item] : null);
    return (it.atk || 0) + (ammo ? (ammo.atk || 0) : 0) || 7;
  }
  // O dano elemental da arma conta no ataque das magias de skill: o
  // COMBAT_FORMULA_SKILL do servidor chama getWeaponDamage, que soma
  // physicalAttack + elementalAttack. Sem isso um knight com naga sword
  // (atk 8, elDmg 44) lancava exori como se tivesse ataque 8.
  const elDmg = (it.el && it.el !== "physical") ? (it.elDmg || 0) : 0;
  return (it.atk || 0) + elDmg || 7;
}

/* Elemento secundario que a arma equipada adiciona as magias de skill.
 * No combat.cpp, damage.secondary vem de weapon->getElementType(). */
function spellWeaponElement(p) {
  const w = p.equip && p.equip.weapon;
  if (!w) return null;
  const it = (typeof upgradedStats === "function")
    ? upgradedStats(p, "equip:weapon", w.item)
    : (typeof GAMEDATA !== "undefined" ? GAMEDATA.items[w.item] : null);
  if (!it || !it.el || it.el === "physical" || !it.elDmg) return null;
  const fis = it.atk || 0;
  const total = fis + it.elDmg;
  return { el: it.el, propFisica: total > 0 ? fis / total : 1 };
}

/* Avalia a formula do canary e devolve {min, max} ja em valores positivos */
function spellValues(p, s) {
  const f = s && s.f;
  if (!f) {
    // sem formula no canary: estima pelo custo de mana, que e como o
    // proprio Tibia balanceia magias novas
    const base = Math.max(4, (s && s.mana ? s.mana : 20) * 0.9);
    return { min: Math.floor(base * 0.7), max: Math.floor(base * 1.3) };
  }
  const level = p.level || 1;
  let lo, hi;
  if (f.modo === "magic") {
    const ml = typeof effMagic === "function" ? effMagic(p) : (p.ml || 0);
    lo = (f.lvlMin || 0) * level + (f.mlMin || 0) * ml + (f.flatMin || 0);
    hi = (f.lvlMax || 0) * level + (f.mlMax || 0) * ml + (f.flatMax || 0);
  } else {
    const skill = typeof effSkill === "function"
      ? effSkill(p, spellSkillFor(p, s)) : (p.skills ? p.skills.fist : 10);
    const atk = spellAttackValue(p);
    const sa = skill * atk;
    lo = (f.saMin || 0) * sa + (f.skMin || 0) * skill + (f.atMin || 0) * atk +
         (f.lvlMin || 0) * level + (f.flatMin || 0);
    hi = (f.saMax || 0) * sa + (f.skMax || 0) * skill + (f.atMax || 0) * atk +
         (f.lvlMax || 0) * level + (f.flatMax || 0);
  }
  lo = Math.max(0, lo);
  hi = Math.max(lo, hi);
  return { min: Math.floor(lo), max: Math.floor(hi) };
}

/* Rola um valor dentro da faixa da formula */
function rollSpell(p, s) {
  const v = spellValues(p, s);
  if (v.max <= v.min) return v.min;
  return v.min + Math.floor(Math.random() * (v.max - v.min + 1));
}

/* Quantos monstros a magia acerta (1 se nao for de area) */
function spellTargets(s) {
  if (!s.area) return 1;
  // o campo `alvos` do canary conta SQMs; na hunt limitamos ao que cabe
  return Math.max(2, Math.min(6, Math.round((s.alvos || 8) / 3)));
}

/* Alcance em SQM; -1 vira corpo-a-corpo */
function spellReach(s) {
  if (s.range && s.range > 0) return s.range;
  if (s.area) return 4;
  return 1;
}

/* ------------------------------------------------------------ apresentacao */

/* Descricao curta em portugues, montada a partir dos dados reais */
function spellDesc(s) {
  const partes = [];
  if (s.type === "attack") {
    const el = (typeof ELEMENTS !== "undefined" && ELEMENTS[s.element])
      ? ELEMENTS[s.element].name : (s.element || "físico");
    partes.push("Dano de " + el.toLowerCase());
    if (s.area) partes.push("em área");
    if (s.chain) partes.push("encadeia em " + s.chain + " alvos");
    if (s.cond) {
      partes.push("aplica " + s.cond.tipo + " (" + s.cond.golpes + "x" +
                  s.cond.dano + ")");
    }
  } else if (s.type === "heal") {
    partes.push(s.regen ? "Regenera vida ao longo do tempo" : "Recupera vida");
    if (s.area) partes.push("em área");
  } else if (s.type === "cure") {
    partes.push("Remove " + (s.dispel || "condição"));
  } else if (s.type === "conjure") {
    partes.push("Cria itens" + (s.soul ? " · " + s.soul + " soul" : ""));
  } else if (s.type === "summon") {
    partes.push("Invoca um aliado");
  } else {
    partes.push("Efeito de suporte");
  }
  if (s.needWeapon) partes.push("exige arma");
  if (s.premium) partes.push("premium");
  return partes.join(" · ");
}

/* Texto "18-42" com a faixa de dano/cura no nivel atual do jogador */
function spellRangeText(p, s) {
  if (s.type !== "attack" && s.type !== "heal") return "";
  if (s.regen) {
    return s.regen.hp + " hp / " + Math.round(s.regen.intervalo / 1000) + "s";
  }
  const v = spellValues(p, s);
  if (!v.max) return "";
  return v.min + "–" + v.max;
}

/* Caminho do icone: a coluna do spritesheet do otclient */
function spellIconPath(s) {
  if (!s || s.icon == null) return null;
  return "assets/spell/otc/" + s.icon + ".png";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ALL_SPELLS, SPELL_TIPOS, spellsOf, spellsByType, spellValues,
    rollSpell, spellUnlocked, spellDesc, spellIconPath,
  };
}
