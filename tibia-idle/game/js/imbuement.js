/*
 * imbuement.js — sistema de imbuements do Tibia 15.x
 *
 * Os dados (categorias, tiers e percentuais) vem do imbuements.xml do
 * Canary, carregado em window.CANARY.imbuements. Cada item com
 * `imbSlots` pode receber ate aquele numero de imbuements.
 *
 * Guardado no personagem como:
 *   p.imbuements["equip:weapon"] = [{ cat: 0, tier: 1, sub: "fire" }, ...]
 */
"use strict";

/* categorias que o combate do idle sabe aplicar */
const IMB_CATEGORIA = {
  0:  { id: "elemental", nome: "Dano Elemental",   attr: "elemental" },
  1:  { id: "lifeleech", nome: "Life Leech",       attr: "lifeLeech" },
  2:  { id: "manaleech", nome: "Mana Leech",       attr: "manaLeech" },
  3:  { id: "critical",  nome: "Critical Hit",     attr: "crit" },
  4:  { id: "prot-death",nome: "Proteção (Morte)", attr: "protDeath" },
  5:  { id: "prot-earth",nome: "Proteção (Terra)", attr: "protEarth" },
  6:  { id: "prot-fire", nome: "Proteção (Fogo)",  attr: "protFire" },
  7:  { id: "prot-ice",  nome: "Proteção (Gelo)",  attr: "protIce" },
  8:  { id: "prot-energy",nome:"Proteção (Energia)",attr:"protEnergy" },
  9:  { id: "prot-holy", nome: "Proteção (Sagrado)",attr:"protHoly" },
  10: { id: "speed",     nome: "Velocidade",       attr: "speed" },
  11: { id: "skill-axe", nome: "Machado",          attr: "axe" },
  12: { id: "skill-sword",nome:"Espada",           attr: "sword" },
  13: { id: "skill-club",nome: "Clava",            attr: "club" },
  14: { id: "skill-shield",nome:"Escudo",          attr: "shield" },
  15: { id: "skill-dist",nome: "Distância",        attr: "dist" },
  16: { id: "skill-magic",nome:"Magic Level",      attr: "magic" },
  17: { id: "capacity",  nome: "Capacidade",       attr: "cap" },
  18: { id: "skill-fist",nome: "Punho",            attr: "fist" },
};

/* valor de cada tier por categoria (Basic / Intricate / Powerful) */
const IMB_VALOR = {
  elemental:  [10, 15, 25],       // % do dano fisico convertido
  lifeLeech:  [5, 8, 12],         // % do dano vira vida
  manaLeech:  [2, 4, 6],
  crit:       [15, 25, 40],       // % de dano extra no critico
  protDeath:  [3, 5, 10], protEarth: [3, 5, 10], protFire: [3, 5, 10],
  protIce:    [3, 5, 10], protEnergy:[3, 5, 10], protHoly: [3, 5, 10],
  speed:      [10, 20, 30],
  axe: [1, 2, 4], sword: [1, 2, 4], club: [1, 2, 4],
  shield: [1, 2, 4], dist: [1, 2, 4], magic: [1, 2, 3], fist: [1, 2, 4],
  cap:        [100, 200, 300],
};

const IMB_TIER_NOME = ["Basic", "Intricate", "Powerful"];
const IMB_PRECO = [5000, 30000, 200000];

/* elementos disponiveis para o imbuement de dano */
const IMB_ELEMENTOS = ["fire", "ice", "energy", "earth", "death", "holy"];

function imbSlotsOf(slug) {
  const it = GAMEDATA.items[slug];
  return it && it.imbSlots ? it.imbSlots : 0;
}

function imbKey(slot) { return "equip:" + slot; }

function imbOf(p, slot) {
  p.imbuements = p.imbuements || {};
  return p.imbuements[imbKey(slot)] || [];
}

function imbAdd(p, slot, cat, tier, sub) {
  const e = p.equip[slot];
  if (!e) return { ok: false, msg: "Nada equipado nesse slot." };
  const max = imbSlotsOf(e.item);
  if (!max) return { ok: false, msg: "Este item não aceita imbuement." };
  const lista = imbOf(p, slot);
  if (lista.length >= max)
    return { ok: false, msg: `Só cabem ${max} imbuement(s) neste item.` };
  if (lista.some((x) => x.cat === cat))
    return { ok: false, msg: "Já existe um imbuement dessa categoria." };
  const preco = IMB_PRECO[tier] || IMB_PRECO[0];
  if (p.gold < preco)
    return { ok: false, msg: `Faltam ${fmtFull(preco - p.gold)} gp.` };
  p.gold -= preco;
  p.imbuements = p.imbuements || {};
  p.imbuements[imbKey(slot)] = lista.concat([{ cat: cat, tier: tier, sub: sub }]);
  const c = IMB_CATEGORIA[cat];
  return { ok: true, msg: `${c.nome} ${IMB_TIER_NOME[tier]} aplicado.`,
           cost: preco };
}

function imbRemove(p, slot, idx) {
  const lista = imbOf(p, slot).slice();
  if (idx < 0 || idx >= lista.length) return false;
  lista.splice(idx, 1);
  p.imbuements[imbKey(slot)] = lista;
  return true;
}

/* Soma de todos os imbuements ativos do personagem */
function imbTotals(p) {
  const t = {
    elemental: 0, elementalType: null, lifeLeech: 0, manaLeech: 0, crit: 0,
    protDeath: 0, protEarth: 0, protFire: 0, protIce: 0, protEnergy: 0,
    protHoly: 0, speed: 0, cap: 0,
    axe: 0, sword: 0, club: 0, shield: 0, dist: 0, magic: 0, fist: 0,
  };
  if (!p.imbuements) return t;
  for (const slot of SLOTS) {
    const e = p.equip[slot];
    if (!e) continue;
    for (const im of imbOf(p, slot)) {
      const c = IMB_CATEGORIA[im.cat];
      if (!c) continue;
      const vals = IMB_VALOR[c.attr];
      if (!vals) continue;
      const v = vals[Math.min(im.tier, vals.length - 1)];
      t[c.attr] = (t[c.attr] || 0) + v;
      if (c.attr === "elemental" && im.sub) t.elementalType = im.sub;
    }
  }
  return t;
}

/* Proteção elemental total contra um elemento (em %) */
function imbProtection(p, element) {
  const t = imbTotals(p);
  const mapa = { death: "protDeath", earth: "protEarth", fire: "protFire",
                 ice: "protIce", energy: "protEnergy", holy: "protHoly" };
  return t[mapa[element]] || 0;
}
