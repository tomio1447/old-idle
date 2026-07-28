/*
 * weapons.js — funde o catalogo importado do Canary (WEAPONDATA) dentro do
 * GAMEDATA.items que o resto do jogo ja consulta.
 *
 * Por que fundir em vez de criar uma segunda base: `GAMEDATA.items` aparece
 * em mais de cem pontos (loja, bag, auto-equip, loot, imbuement, forja,
 * Cyclopedia). Duplicar a fonte significaria caçar todos eles. Fundindo aqui,
 * logo depois do gamedata.js carregar, tudo passa a enxergar os 1300+ itens
 * sem mudar uma linha das outras telas.
 *
 * Regra do merge (importa):
 *   - o Canary vence nos campos que ELE conhece (atk, def, arm, lvl, vocs,
 *     imbSlots, elemento, skills, classificacao, augments);
 *   - o item antigo mantem os campos que o Canary NAO traz. Varios acessorios
 *     (life ring, ring of healing, stone skin amulet) tem os efeitos num
 *     script Lua e nao no items.xml — sem essa regra eles perderiam hpreg,
 *     mpreg e prot e virariam lixo de 2 gp.
 */
"use strict";

/* Campos que o importador do Canary controla. O que nao esta aqui e
 * preservado do item antigo quando o novo nao define. */
const WD_CAMPOS_CANARY = [
  "atk", "def", "extraDef", "arm", "lvl", "vocs", "imbSlots", "th",
  "el", "elDmg", "mdmg", "dmgMin", "dmgMax", "manaCost", "res",
  "sword", "axe", "club", "dist", "shield", "fist", "mag",
  "lifeLeech", "manaLeech", "cls", "aug", "cat", "id",
  "af", "aw", "ah", "npcBuy", "npcSell", "range", "hit", "charges",
];

/* Um item so entra na loja se o Canary conhece um NPC que o vende.
 * O resto e drop/quest, igual ao Tibia. */
function itemNaLoja(it) {
  return !!(it && (it.shop || (!it.drop && it.buy)));
}

/* O item tem sprite animada (tira <slug>_anim.png com `af` frames)? */
function itemAnimado(it) {
  return !!(it && it.af > 1);
}

/* Estilo inline que roda a animacao da tira de sprites.
 * A tira e um PNG unico de af*aw pixels: a animacao e so mover o
 * background-position em passos, sem JS por item e sem N requisicoes. */
function estiloAnim(slug, it, tam) {
  if (!itemAnimado(it)) return "";
  const px = tam || 32;
  const esc = px / Math.max(it.aw || 32, it.ah || 32);
  const w = Math.round((it.aw || 32) * esc);
  const h = Math.round((it.ah || 32) * esc);
  const dur = (it.af * 0.12).toFixed(2);
  return `width:${w}px;height:${h}px;` +
    `background-image:url(assets/item/${slug}_anim.png?v=${
      typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1"});` +
    `background-size:${w * it.af}px ${h}px;image-rendering:pixelated;` +
    `animation:item-anim ${dur}s steps(${it.af}) infinite;`;
}

/* <img> ou <div> animado, conforme o item */
function itemImg(slug, tam, cls) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
  const px = tam || 32;
  if (itemAnimado(it)) {
    return `<div class="item-sprite ${cls || ""}" title="${it.n || slug}"
      style="${estiloAnim(slug, it, px)}"></div>`;
  }
  return `<img class="item-sprite ${cls || ""}" src="assets/item/${slug}.png"
    alt="" loading="lazy" style="width:${px}px;height:${px}px">`;
}

/* A vocacao pode usar o item? (nivel + restricao de vocacao) */
function itemLiberado(p, it) {
  if (!it) return false;
  if (it.lvl && p.level < it.lvl) return false;
  if (it.vocs && it.vocs.indexOf(p.voc) === -1) return false;
  return true;
}

/* Funde WEAPONDATA em GAMEDATA.items. Idempotente: rodar duas vezes nao
 * duplica nem re-sobrescreve o que o jogador ja tem. */
function fundirWeaponData() {
  if (typeof WEAPONDATA === "undefined" || typeof GAMEDATA === "undefined") return 0;
  let novos = 0;
  for (const slug in WEAPONDATA.items) {
    const novo = WEAPONDATA.items[slug];
    const velho = GAMEDATA.items[slug];
    if (!velho) {
      GAMEDATA.items[slug] = Object.assign({}, novo);
      novos++;
      continue;
    }
    // o antigo e a base (preserva efeitos que so existem em script Lua),
    // o Canary sobrescreve o que ele conhece
    const fim = Object.assign({}, velho);
    for (const k of WD_CAMPOS_CANARY) {
      if (novo[k] !== undefined) fim[k] = novo[k];
    }
    fim.n = velho.n || novo.n;
    fim.s = novo.s || velho.s;
    fim.t = novo.t || velho.t;
    if (novo.shop) fim.shop = 1; else if (novo.drop) fim.drop = 1;
    // preco: o item antigo ja tinha uma curva calibrada com a economia do
    // jogo; so adota o valor novo se o antigo nao existir
    if (!fim.sell) fim.sell = novo.sell;
    GAMEDATA.items[slug] = fim;
  }
  // itens antigos que nao vieram do Canary continuam vendaveis na loja como
  // antes (o campo `shop` so passa a mandar em quem o Canary conhece)
  for (const slug in GAMEDATA.items) {
    const it = GAMEDATA.items[slug];
    if (!it.cat && !it.drop && it.s) it.shop = 1;
  }
  return novos;
}

if (typeof window !== "undefined") fundirWeaponData();
