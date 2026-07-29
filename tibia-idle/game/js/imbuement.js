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

/* Nome oficial e iconId de cada categoria, do imbuements.xml do Canary.
 * O iconId indexa assets/imbuement/<id>.png, extraido do client 15.x. */
const IMB_ICONE = {
  0:  { nome: "Elemental",   icon: 13 },   // o sub troca o icone (ver abaixo)
  1:  { nome: "Vampirism",   icon: 46 },
  2:  { nome: "Void",        icon: 49 },
  3:  { nome: "Strike",      icon: 1 },
  4:  { nome: "Lich Shroud", icon: 25 },
  5:  { nome: "Snake Skin",  icon: 28 },
  6:  { nome: "Dragon Hide", icon: 34 },
  7:  { nome: "Quara Scale", icon: 40 },
  8:  { nome: "Cloud Fabric",icon: 31 },
  9:  { nome: "Demon Presence", icon: 37 },
  10: { nome: "Swiftness",   icon: 73 },
  11: { nome: "Chop",        icon: 52 },
  12: { nome: "Slash",       icon: 70 },
  13: { nome: "Bash",        icon: 55 },
  14: { nome: "Blockade",    icon: 67 },
  15: { nome: "Precision",   icon: 58 },
  16: { nome: "Epiphany",    icon: 64 },
  17: { nome: "Featherweight", icon: 76 },
  18: { nome: "Punch",       icon: 61 },
  19: { nome: "Vibrancy",    icon: 79 },
};

/* O imbuement de dano elemental tem um nome e um icone POR ELEMENTO --
 * Scorch e fogo, Frost e gelo, e assim por diante. */
const IMB_ELEM_ICONE = {
  fire:   { nome: "Scorch",    icon: 13 },
  earth:  { nome: "Venom",     icon: 7 },
  ice:    { nome: "Frost",     icon: 19 },
  energy: { nome: "Electrify", icon: 10 },
  death:  { nome: "Reap",      icon: 4 },
  holy:   { nome: "Blaze",     icon: 22 },
};

/* Nome e icone de um imbuement aplicado */
function imbVisual(im) {
  if (!im) return { nome: "?", icon: 0 };
  if (im.cat === 0 && im.sub && IMB_ELEM_ICONE[im.sub]) {
    return IMB_ELEM_ICONE[im.sub];
  }
  return IMB_ICONE[im.cat] || { nome: (IMB_CATEGORIA[im.cat] || {}).nome || "?",
                                icon: 0 };
}

/* Duracao de um imbuement, em ms. O Canary usa 72000 SEGUNDOS (20 horas)
 * para as tres bases. */
const IMB_DURACAO_MS = 72000 * 1000;

/* Quanto falta, em ms. Imbuement sem `ate` (save antigo) conta como cheio,
 * para nao expirar de surpresa o que o jogador ja tinha. */
function imbRestante(im, agora) {
  if (!im) return 0;
  if (!im.ate) return IMB_DURACAO_MS;
  return Math.max(0, im.ate - (agora || Date.now()));
}

function imbExpirado(im, agora) {
  return im && im.ate ? imbRestante(im, agora) <= 0 : false;
}

/* "19h 42m" / "42m" / "3m" — formato curto para o tooltip */
function imbTempoTexto(ms) {
  if (ms <= 0) return "expirado";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
  if (m > 0) return m + "m";
  return Math.max(1, Math.floor(ms / 1000)) + "s";
}

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
  // `ate` marca quando o imbuement vence. O Canary da 20h por base.
  p.imbuements[imbKey(slot)] = lista.concat([
    { cat: cat, tier: tier, sub: sub, ate: Date.now() + IMB_DURACAO_MS }]);
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
      // imbuement vencido nao da mais bonus (o item volta ao normal)
      if (imbExpirado(im)) continue;
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
