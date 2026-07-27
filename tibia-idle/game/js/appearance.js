/*
 * appearance.js — outfits, addons e montarias
 *
 * Os dados vem de APPEARANCES (js/appearancedata.js), extraido do DAT 8.60
 * cruzado com o outfits.xml/mounts.xml do Canary: 252 visuais (234 deles com
 * os dois addons) e 236 montarias.
 *
 * Como o addon funciona no cliente: dentro do frame group da outfit, o eixo
 * `yp` separa a base (0) do overlay do addon 1 (1) e do addon 2 (2). Os
 * overlays sao desenhados POR CIMA da base, entao addon 3 = base + 1 + 2.
 * Aqui cada camada e um PNG (`-a1`, `-a2`) que compomos em canvas, aplicando
 * as mesmas cores da base — senao o chapeu sairia branco enquanto o corpo
 * fica colorido.
 *
 * A montaria e uma outfit de looktype proprio: desenhamos o bicho primeiro e
 * o personagem por cima, deslocado, como o cliente faz.
 */
"use strict";

const APPEARANCE_DATA = (typeof window !== "undefined" && window.APPEARANCES)
  ? window.APPEARANCES : { outfits: [], mounts: [] };

/* indices por id, para consulta rapida */
const APP_OUTFIT = {};
const APP_MOUNT = {};
(function indexar() {
  for (const o of APPEARANCE_DATA.outfits) APP_OUTFIT[o.id] = o;
  for (const m of APPEARANCE_DATA.mounts) APP_MOUNT[m.id] = m;
})();

/* ------------------------------------------------------------ economia
 * Precos em gold. A ideia e que o visual seja uma recompensa de progressao:
 * a outfit basica custa pouco, cada addon custa mais que a outfit inteira e
 * a montaria e o item caro do fim. Premium (no Canary) fica bem mais caro
 * porque no Tibia exige conta paga — aqui vira dinheiro de jogo. */
const APP_PRECO = {
  outfit: 5000,
  outfitPremium: 25000,
  addon: 30000,
  addonPremium: 75000,
  mount: 60000,
  mountPremium: 150000,
};

function outfitPrice(o) {
  if (!o) return 0;
  return o.premium ? APP_PRECO.outfitPremium : APP_PRECO.outfit;
}

function addonPrice(o) {
  if (!o) return 0;
  return o.premium ? APP_PRECO.addonPremium : APP_PRECO.addon;
}

function mountPrice(m) {
  if (!m) return 0;
  return m.premium ? APP_PRECO.mountPremium : APP_PRECO.mount;
}

/* ------------------------------------------------------------ posse
 * p.wardrobe = { outfits: {id: addonsComprados}, mounts: {id: true} }
 * As outfits classicas da vocacao nascem liberadas para o personagem nao
 * comecar sem nenhuma opcao. */
const APP_INICIAIS = ["citizen", "hunter", "mage", "knight", "summoner"];

function ensureWardrobe(p) {
  if (!p.wardrobe) p.wardrobe = { outfits: {}, mounts: {} };
  if (!p.wardrobe.outfits) p.wardrobe.outfits = {};
  if (!p.wardrobe.mounts) p.wardrobe.mounts = {};
  const sexo = p.sex === "female" ? "f" : "m";
  for (const base of APP_INICIAIS) {
    const id = base + "-" + sexo;
    if (APP_OUTFIT[id] && p.wardrobe.outfits[id] === undefined) {
      p.wardrobe.outfits[id] = 0;      // possui a outfit, nenhum addon
    }
  }
  return p.wardrobe;
}

function ownsOutfit(p, id) {
  ensureWardrobe(p);
  return p.wardrobe.outfits[id] !== undefined;
}

function ownedAddons(p, id) {
  ensureWardrobe(p);
  return p.wardrobe.outfits[id] || 0;
}

function ownsMount(p, id) {
  ensureWardrobe(p);
  return !!p.wardrobe.mounts[id];
}

/* Compra: devolve {ok, erro} para a UI mostrar o motivo */
function buyOutfit(p, id) {
  const o = APP_OUTFIT[id];
  if (!o) return { ok: false, erro: "Visual desconhecido." };
  if (ownsOutfit(p, id)) return { ok: false, erro: "Você já tem esse visual." };
  const preco = outfitPrice(o);
  if (p.gold < preco) return { ok: false, erro: "Gold insuficiente." };
  p.gold -= preco;
  p.wardrobe.outfits[id] = 0;
  return { ok: true, preco: preco };
}

function buyAddon(p, id) {
  const o = APP_OUTFIT[id];
  if (!o) return { ok: false, erro: "Visual desconhecido." };
  if (!ownsOutfit(p, id))
    return { ok: false, erro: "Compre o visual antes do addon." };
  const tem = ownedAddons(p, id);
  if (tem >= (o.addons || 0))
    return { ok: false, erro: "Esse visual não tem mais addons." };
  const preco = addonPrice(o);
  if (p.gold < preco) return { ok: false, erro: "Gold insuficiente." };
  p.gold -= preco;
  p.wardrobe.outfits[id] = tem + 1;
  return { ok: true, preco: preco, addon: tem + 1 };
}

function buyMount(p, id) {
  const m = APP_MOUNT[id];
  if (!m) return { ok: false, erro: "Montaria desconhecida." };
  if (ownsMount(p, id)) return { ok: false, erro: "Você já tem essa montaria." };
  const preco = mountPrice(m);
  if (p.gold < preco) return { ok: false, erro: "Gold insuficiente." };
  p.gold -= preco;
  p.wardrobe.mounts[id] = true;
  return { ok: true, preco: preco };
}

/* ------------------------------------------------------------ equipar */

/* Qual visual o personagem esta usando (id do catalogo novo, se houver) */
function currentAppearance(p) {
  ensureOutfit(p);
  const sexo = p.sex === "female" ? "f" : "m";
  const id = p.outfit.appearance;
  if (id && APP_OUTFIT[id]) return APP_OUTFIT[id];
  // sem escolha explicita: usa a outfit classica da vocacao
  const base = (VOC_OUTFIT[p.voc] || "citizen") + "-" + sexo;
  return APP_OUTFIT[base] || null;
}

function setAppearance(p, id) {
  if (!APP_OUTFIT[id] || !ownsOutfit(p, id)) return false;
  ensureOutfit(p);
  p.outfit.appearance = id;
  // o addon ativo nao pode passar do que foi comprado
  const max = Math.min(ownedAddons(p, id), APP_OUTFIT[id].addons || 0);
  if ((p.outfit.addons || 0) > max) p.outfit.addons = max;
  return true;
}

/* addons: 0 = so a base, 1 = addon 1, 2 = addon 2, 3 = os dois */
function setAddons(p, n) {
  ensureOutfit(p);
  const o = currentAppearance(p);
  const donos = o ? ownedAddons(p, o.id) : 0;
  n = Math.max(0, Math.min(3, n | 0));
  // nao deixa ligar um addon que nao foi comprado
  if (donos < 2 && n === 3) n = donos >= 1 ? 1 : 0;
  if (donos < 1) n = 0;
  if (donos === 1 && n === 2) n = 1;
  p.outfit.addons = n;
  return n;
}

function setMount(p, id) {
  ensureOutfit(p);
  if (!id) { p.outfit.mount = null; return true; }
  if (!APP_MOUNT[id] || !ownsMount(p, id)) return false;
  p.outfit.mount = id;
  return true;
}

function currentMount(p) {
  ensureOutfit(p);
  const id = p.outfit.mount;
  return id && APP_MOUNT[id] ? APP_MOUNT[id] : null;
}

/* Bonus de velocidade da montaria. No Canary quase toda mount da speed 10;
 * o valor entra no calculo de velocidade do personagem. */
function mountSpeedBonus(p) {
  const m = currentMount(p);
  return m ? (m.speed || 0) : 0;
}

/* ------------------------------------------------------- renderizacao */

/* Compoe base + addons + cores num canvas. Devolve null enquanto carrega. */
const AppearanceRenderer = {
  cache: {},

  key(id, addons, colors) { return id + "|" + addons + "|" + colors.join(","); },

  /* Canvas da outfit do catalogo novo, com os addons ligados */
  outfit(id, addons, colors) {
    const o = APP_OUTFIT[id];
    if (!o) return null;
    addons = Math.max(0, Math.min(3, addons | 0));
    const k = this.key(id, addons, colors);
    if (this.cache[k] !== undefined) return this.cache[k];

    const camadas = [""];
    if (addons & 1) camadas.push("-a1");
    if (addons & 2) camadas.push("-a2");

    // todas as camadas precisam estar carregadas antes de compor, senao o
    // canvas seria cacheado incompleto (mesmo bug do outfit branco antigo)
    const imgs = [];
    for (const suf of camadas) {
      const base = Sprites.get(
        `assets/appearance/outfit/${id}${suf}.base.png`);
      if (!base) continue;                      // camada inexistente: ignora
      if (!base.complete) return null;
      if (!base.naturalWidth) continue;         // 404: segue sem ela
      const mask = Sprites.get(
        `assets/appearance/outfit/${id}${suf}.mask.png`);
      if (mask && !mask.complete) return null;
      imgs.push([base, mask]);
    }
    if (!imgs.length) { this.cache[k] = null; return null; }

    // o canvas tem o tamanho da maior camada: os overlays podem ser
    // menores (so o chapeu, por exemplo) e sao alinhados pela base
    let w = 0, h = 0;
    for (const [b] of imgs) {
      w = Math.max(w, b.naturalWidth);
      h = Math.max(h, b.naturalHeight);
    }
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true });

    for (const [base, mask] of imgs) {
      const tmp = colorize(base, mask, colors);
      if (tmp) cx.drawImage(tmp, 0, h - tmp.height);   // alinha pelo pe
    }
    this.cache[k] = cv;
    return cv;
  },

  /* Canvas da montaria (sem cor de outfit: o bicho tem cor propria) */
  mount(id) {
    const k = "mount|" + id;
    if (this.cache[k] !== undefined) return this.cache[k];
    const base = Sprites.get(`assets/appearance/mount/${id}.base.png`);
    if (!base) { this.cache[k] = null; return null; }
    if (!base.complete) return null;
    if (!base.naturalWidth) { this.cache[k] = null; return null; }
    const cv = document.createElement("canvas");
    cv.width = base.naturalWidth; cv.height = base.naturalHeight;
    cv.getContext("2d").drawImage(base, 0, 0);
    this.cache[k] = cv;
    return cv;
  },

  /* Sprite para o jogo: monta o personagem (com addons) sobre a montaria.
   * Os PNGs do catalogo so tem a direcao sul, entao o mesmo desenho serve
   * para todas as direcoes — e o preco de ter 252 visuais sem explodir o
   * numero de arquivos. */
  forPlayer(p, dir, frame) {
    const o = currentAppearance(p);
    if (!o) return null;
    const cores = (p.outfit && p.outfit.colors) ||
                  DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
    const corpo = this.outfit(o.id, (p.outfit && p.outfit.addons) || 0, cores);
    if (!corpo) return null;
    const mnt = currentMount(p);
    if (!mnt) return corpo;
    const bicho = this.mount(mnt.id);
    if (!bicho) return corpo;
    const k = "jogo|" + o.id + "|" + ((p.outfit && p.outfit.addons) || 0) +
              "|" + cores.join(",") + "|" + mnt.id;
    if (this.cache[k] !== undefined) return this.cache[k];
    const w = Math.max(corpo.width, bicho.width);
    const h = Math.max(corpo.height, bicho.height) + 8;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const cx = cv.getContext("2d");
    cx.drawImage(bicho, (w - bicho.width) / 2, h - bicho.height);
    cx.drawImage(corpo, (w - corpo.width) / 2, h - corpo.height - 8);
    this.cache[k] = cv;
    return cv;
  },

  /* Prévia completa (montaria + personagem) para as telas de selecao */
  preview(p) {
    const o = currentAppearance(p);
    if (!o) return null;
    const cores = (p.outfit && p.outfit.colors) ||
                  DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
    const corpo = this.outfit(o.id, (p.outfit && p.outfit.addons) || 0, cores);
    if (!corpo) return null;
    const mnt = currentMount(p);
    const bicho = mnt ? this.mount(mnt.id) : null;
    if (!bicho) return corpo;
    const w = Math.max(corpo.width, bicho.width);
    const h = Math.max(corpo.height, bicho.height) + 8;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const cx = cv.getContext("2d");
    // o bicho embaixo, o personagem por cima e um pouco acima
    cx.drawImage(bicho, (w - bicho.width) / 2, h - bicho.height);
    cx.drawImage(corpo, (w - corpo.width) / 2, h - corpo.height - 8);
    return cv;
  },
};

/* Aplica as cores da paleta usando a mascara. Extraido do OutfitRenderer
 * para poder colorir cada camada de addon separadamente. */
function colorize(base, mask, colors) {
  if (!base || !base.naturalWidth) return null;
  const w = base.naturalWidth, h = base.naturalHeight;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(base, 0, 0);
  if (!mask || !mask.complete || !mask.naturalWidth) return cv;

  const mc = document.createElement("canvas");
  mc.width = w; mc.height = h;
  const mx = mc.getContext("2d", { willReadFrequently: true });
  mx.drawImage(mask, 0, 0);
  const bd = cx.getImageData(0, 0, w, h);
  const md = mx.getImageData(0, 0, w, h);
  const cols = colors.map((i) => hexToRgb(paletteColor(i)));
  const b = bd.data, m = md.data;
  for (let i = 0; i < b.length; i += 4) {
    if (m[i + 3] === 0) continue;
    const r = m[i], g = m[i + 1], bl = m[i + 2];
    let col = null;
    if (r > 128 && g > 128 && bl < 128) col = cols[0];
    else if (r > 128 && g < 128 && bl < 128) col = cols[1];
    else if (r < 128 && g > 128 && bl < 128) col = cols[2];
    else if (r < 128 && g < 128 && bl > 128) col = cols[3];
    if (!col) continue;
    b[i] = (b[i] * col[0] / 255) | 0;
    b[i + 1] = (b[i + 1] * col[1] / 255) | 0;
    b[i + 2] = (b[i + 2] * col[2] / 255) | 0;
  }
  cx.putImageData(bd, 0, 0);
  return cv;
}

/* Catalogo filtrado, para as telas de loja e customizacao */
function appearanceCatalog(p, filtro) {
  const sexo = p.sex === "female" ? "f" : "m";
  let ls = APPEARANCE_DATA.outfits.filter((o) => o.sexo === sexo);
  if (filtro === "owned") ls = ls.filter((o) => ownsOutfit(p, o.id));
  else if (filtro === "locked") ls = ls.filter((o) => !ownsOutfit(p, o.id));
  else if (filtro === "premium") ls = ls.filter((o) => o.premium);
  return ls;
}

function mountCatalog(p, filtro) {
  let ls = APPEARANCE_DATA.mounts.slice();
  if (filtro === "owned") ls = ls.filter((m) => ownsMount(p, m.id));
  else if (filtro === "locked") ls = ls.filter((m) => !ownsMount(p, m.id));
  else if (filtro === "premium") ls = ls.filter((m) => m.premium);
  return ls;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    APP_OUTFIT, APP_MOUNT, ensureWardrobe, buyOutfit, buyAddon, buyMount,
    setAppearance, setAddons, setMount, appearanceCatalog, mountCatalog,
  };
}
