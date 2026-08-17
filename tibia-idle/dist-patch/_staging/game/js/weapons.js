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

/* Itens que ja existiam no jogo com uma grafia e vieram do Canary com outra.
 * Sem esse mapa a mesma arma aparece duas vezes no catalogo: uma como
 * "broad sword" (escrita a mao) e outra como "broadsword" (nome oficial do
 * items.xml). O slug do Canary e absorvido pelo slug antigo, que e o que o
 * loot dos monstros e os saves ja referenciam.
 * chave = slug do Canary, valor = slug que o jogo ja usava */
const WD_ALIAS = {
  "broadsword": "broad-sword",
  "bunnyslippers": "bunny-slippers",
};

const WD_PLASMA_STATS = {
  "ring-of-blue-plasma":     { dist: 4, mag: 1, prot: 3, res: { physical: 3 } },
  "ring-of-green-plasma":    { mag: 2, prot: 3, res: { physical: 3 } },
  "ring-of-orange-plasma":   { fist: 4, prot: 3, res: { physical: 3 } },
  "ring-of-red-plasma":      { sword: 4, axe: 4, club: 4, prot: 3, res: { physical: 3 } },
  "collar-of-blue-plasma":   { dist: 4, mag: 2, prot: 5, res: { physical: 5 } },
  "collar-of-green-plasma":  { mag: 3, prot: 5, res: { physical: 5 } },
  "collar-of-orange-plasma": { fist: 4, mag: 2, prot: 5, res: { physical: 5 } },
  "collar-of-red-plasma":    { sword: 4, axe: 4, club: 4, prot: 5, res: { physical: 5 } },
};

/* Slugs mortos do catalogo antigo que hoje sao a MESMA coisa que um item
 * vindo do Canary, mas com outra grafia. Ficam duas linhas identicas na
 * Cyclopedia se nao forem removidos. Nada aponta para eles: nao estao em
 * loot de monstro nem em receita. */
const WD_MORTOS = ["energy-bomb-rune"];

/* Campos que o importador do Canary controla. O que nao esta aqui e
 * preservado do item antigo quando o novo nao define. */
const WD_CAMPOS_CANARY = [
  "atk", "def", "extraDef", "arm", "lvl", "vocs", "imbSlots", "th",
  "el", "elDmg", "mdmg", "dmgMin", "dmgMax", "manaCost", "res",
  "sword", "axe", "club", "dist", "shield", "fist", "mag",
  "lifeLeech", "manaLeech", "cls", "aug", "cat", "id",
  "af", "sf", "aw", "ah", "npcBuy", "npcSell", "range", "hit", "charges",
  "mantra", "bond",
];

/* Um item so entra na loja se o Canary conhece um NPC que o vende.
 * O resto e drop/quest, igual ao Tibia. */
function itemNaLoja(it) {
  return !!(it && (it.shop || (!it.drop && it.buy)));
}

/* Canary/OTC: subtype visual de stackable (map_drawer / Cyclopedia).
 * count 1→0, 2→1, 3→2, 4→3, 5–9→4, 10–24→5, 25–49→6, 50+→7. */
function itemStackSubtype(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 1) return 0;
  if (n <= 2) return 1;
  if (n <= 3) return 2;
  if (n <= 4) return 3;
  if (n < 10) return 4;
  if (n < 25) return 5;
  if (n < 50) return 6;
  return 7;
}

/* Tira <slug>_stack.png com `sf` frames de count (NAO anima no tempo). */
function itemTemStackFrames(it) {
  return !!(it && it.sf > 1);
}

/* O item tem sprite animada no tempo (tira <slug>_anim.png com `af` frames)?
 * Stackables com frames de count usam `sf` — nao entram aqui. */
function itemAnimado(it) {
  return !!(it && it.af > 1 && !itemTemStackFrames(it));
}

function itemSpriteBox(it, tam) {
  const px = tam || 32;
  // Nunca amplie a arte além do tamanho nativo do client 15x. `tam` é o
  // limite da caixa, não um tamanho obrigatório: moedas, gemas e joias
  // pequenas permanecem com seus poucos pixels originais.
  const esc = Math.min(1, px / Math.max(it.aw || 32, it.ah || 32));
  const w = Math.max(1, Math.round((it.aw || 32) * esc));
  const h = Math.max(1, Math.round((it.ah || 32) * esc));
  return { w: w, h: h };
}

/* Frame de pilha travado pelo count — Canary nao free-anima esses frames. */
function estiloStack(slug, it, tam, count) {
  if (!itemTemStackFrames(it)) return "";
  const { w, h } = itemSpriteBox(it, tam);
  const frames = it.sf | 0;
  const frame = Math.min(itemStackSubtype(count), frames - 1);
  const total = w * frames;
  const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
  return `width:${w}px;height:${h}px;` +
    `background-image:url(assets/item/${slug}_stack.png?v=${v});` +
    `background-size:${total}px ${h}px;` +
    `background-position:-${frame * w}px 0;` +
    `background-repeat:no-repeat;image-rendering:pixelated;`;
}

/* Estilo inline que roda a animacao da tira de sprites.
 * A tira e um PNG unico de af*aw pixels: a animacao e so mover o
 * background-position em passos, sem JS por item e sem N requisicoes. */
function estiloAnim(slug, it, tam) {
  if (!itemAnimado(it)) return "";
  const { w, h } = itemSpriteBox(it, tam);
  const dur = (it.af * 0.15).toFixed(2);
  const total = w * it.af;
  // --anim-w e lido pelo @keyframes item-anim: sem ele o CSS so conseguiria
  // deslocar em % da largura do elemento (um frame), nao da tira inteira
  return `--anim-w:${total}px;width:${w}px;height:${h}px;` +
    `background-image:url(assets/item/${slug}_anim.png?v=${
      typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1"});` +
    `background-size:${total}px ${h}px;background-position:0 0;` +
    `image-rendering:pixelated;` +
    `animation:item-anim ${dur}s steps(${it.af}) infinite;`;
}

/* <img> ou <div> animado / travado por count, conforme o item.
 *
 * Aceita as assinaturas que a base de codigo usa:
 *   itemImg(slug)
 *   itemImg(slug, "cls")
 *   itemImg(slug, 26)
 *   itemImg(slug, 26, "cls")
 *   itemImg(slug, 26, "cls", count)   <- stack frame Canary
 *   itemImg(slug, { size, cls, count })
 */

/* Retorna a classe CSS de borda conforme a classificacao do item:
 * cls 4 -> amarelo, cls 3 -> roxo, cls 2 -> azul, cls 1 ou sem -> vazio */
function itemClsBorder(slug) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
  return (it.cls && it.cls >= 2) ? "cls-" + it.cls : "";
}
function itemImg(slug, tam, cls, count) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items[slug]) || {};
  // 2o argumento objeto = { size, cls, count }
  if (tam && typeof tam === "object") {
    count = tam.count !== undefined ? tam.count : count;
    cls = tam.cls || cls;
    tam = tam.size || tam.tam || 0;
  }
  // 2o argumento como string = classe CSS (assinatura antiga do ui.js)
  if (typeof tam === "string") { cls = tam; tam = 0; }
  // classe de classificacao (forja): cls-2 azul, cls-3 roxo, cls-4 amarelo
  const clsBorder = (it.cls && it.cls >= 2) ? `cls-${it.cls}` : "";
  const clsAll = [cls, clsBorder].filter(Boolean).join(" ");
  const px = tam || 32;
  if (itemTemStackFrames(it)) {
    const qty = count !== undefined && count !== null ? count : 1;
    return `<div class="item-sprite ${clsAll}" title="${it.n || slug}"
      style="${estiloStack(slug, it, px, qty)}"></div>`;
  }
  if (itemAnimado(it)) {
    return `<div class="item-sprite ${clsAll}" title="${it.n || slug}"
      style="${estiloAnim(slug, it, px)}"></div>`;
  }
  // `tam` limita itens grandes, mas não amplia os pequenos. width/height
  // automáticos preservam a proporção e o tamanho nativo do PNG 15x.
  const dim = tam
    ? `max-width:${px}px;max-height:${px}px;width:auto;height:auto`
    : `width:auto;height:auto`;
  const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
  return `<img class="item-sprite ${clsAll}" src="assets/item/${slug}.png?v=${v}"
    alt="" loading="lazy" style="${dim}"
    onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src=this.src.replace(/\\.png(\\?|$)/,'.gif$1');}">`;
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
  for (const slugCanary in WEAPONDATA.items) {
    const novo = WEAPONDATA.items[slugCanary];
    // grafia diferente da que o jogo ja usava: cai no slug antigo
    const slug = WD_ALIAS[slugCanary] || slugCanary;
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
  // remove os slugs mortos que viraram duplicata visual de um item do Canary
  for (const slug of WD_MORTOS) delete GAMEDATA.items[slug];
  // itens antigos que nao vieram do Canary continuam vendaveis na loja como
  // antes (o campo `shop` so passa a mandar em quem o Canary conhece)
  for (const slug in GAMEDATA.items) {
    const it = GAMEDATA.items[slug];
    if (!it.cat && !it.drop && it.s) it.shop = 1;
  }
  for (const slug in WD_PLASMA_STATS) {
    if (GAMEDATA.items[slug]) {
      Object.assign(GAMEDATA.items[slug], WD_PLASMA_STATS[slug]);
    }
  }
  return novos;
}

if (typeof window !== "undefined") fundirWeaponData();
