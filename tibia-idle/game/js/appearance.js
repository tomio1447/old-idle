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


/* Metadados extraídos do frame group IDLE real do DAT. Os frames de
 * caminhada continuam nos sheets principais e nunca entram nesta tabela. */
const IDLE_ANIM_DATA = (typeof window !== "undefined" && window.IDLE_ANIMATIONS)
  ? window.IDLE_ANIMATIONS : { outfits:{}, mounts:{}, monsters:{} };

function idleAnimationMeta(kind, id) {
  const group = IDLE_ANIM_DATA[kind] || {};
  return id && group[id] && group[id].frames > 1 ? group[id] : null;
}

function idleAnimationFrame(meta, now, phase) {
  if (!meta || meta.frames <= 1) return 0;
  const ds = meta.durations && meta.durations.length === meta.frames
    ? meta.durations : Array(meta.frames).fill(180);
  const total = meta.duration || ds.reduce((sum, n) => sum + n, 0) || 180;
  const parsedNow = Number(now);
  const clock = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  let elapsed = (clock + (Number(phase) || 0)) % total;
  if (elapsed < 0) elapsed += total;
  for (let frame = 0; frame < ds.length; frame++) {
    if (elapsed < ds[frame]) return frame;
    elapsed -= ds[frame];
  }
  return 0;
}

/* Retorna um marcador idle somente quando a outfit/avatar OU a montaria
 * realmente possui grupo idle animado. Sem esse marcador o renderer usa a
 * pose 0 estática, mesmo que o sheet tenha muitos frames de caminhada. */
function appearanceIdleFrame(p, now) {
  const a = activeAvatarAppearance(p) || currentAppearance(p);
  const m = currentMount(p);
  const outfitIdle = a && idleAnimationMeta("outfits", a.id);
  const mountIdle = m && idleAnimationMeta("mounts", m.id);
  if (!outfitIdle && !mountIdle) return 0;
  const parsedNow = Number(now);
  return { idle:true, now:Number.isFinite(parsedNow) ? parsedNow : Date.now() };
}

/* ------------------------------------------------------------ avatars
 * Transcendence ativa o Avatar Stage 3. O outfit normal do jogador nao e
 * alterado no save: durante a janela ativa, o renderer substitui a aparencia
 * pelo avatar oficial da vocacao e, quando avatarActive() expira, volta a
 * desenhar o outfit normal automaticamente. */
function activeAvatarAppearance(p) {
  if (!p) return null;
  const byVoc = (typeof AVATAR_OUTFIT_BY_VOC !== "undefined")
    ? AVATAR_OUTFIT_BY_VOC : null;
  if (!byVoc) return null;
  let ativo = !!(p._avatar && p._avatar.active);
  if (ativo && typeof avatarActive === "function") ativo = avatarActive(p);
  else if (ativo && p._avatar.started && p._avatar.duration) {
    if (Date.now() - p._avatar.started >= p._avatar.duration) {
      p._avatar.active = false;
      ativo = false;
    }
  }
  if (!ativo) return null;
  const id = byVoc[p.voc] || null;
  return id ? (APP_OUTFIT[id] || null) : null;
}

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

/* Ordem das direcoes dentro do spritesheet, igual a do client (o indice e a
 * linha do sheet). O resto do jogo fala em "n"/"e"/"s"/"w". */
const APP_DIR_ROW = { n: 0, e: 1, s: 2, w: 3 };

function appDirRow(dir) {
  const r = APP_DIR_ROW[dir];
  return r === undefined ? 2 : r;      // sem direcao conhecida: sul
}

function markSpriteAnchor(canvas, meta, sw, sh) {
  if (!canvas || !meta) return canvas;
  sw = Number(sw) || 64; sh = Number(sh) || 64;
  canvas._spriteAnchor = {
    sw, sh,
    ox: meta.ox !== undefined ? Number(meta.ox) : sw - canvas.width,
    oy: meta.oy !== undefined ? Number(meta.oy) : sh - canvas.height,
  };
  return canvas;
}

/* Compoe base + addons + cores num canvas. Devolve null enquanto carrega.
 *
 * Cada visual e um spritesheet de 4 linhas (direcoes) x 4 colunas (parado +
 * 3 passos), com a celula sempre do mesmo tamanho (cw x ch vindos do
 * appearancedata). Antes existia um PNG unico por outfit, so da direcao sul
 * e recortado por camada — por isso o personagem nao virava e o addon saia
 * deslocado do corpo. Aqui recortamos a celula (dir, frame) do sheet e todas
 * as camadas usam exatamente a mesma celula, entao ficam alinhadas. */
const AppearanceRenderer = {
  cache: {},

  key(id, addons, colors, dir, frame) {
    return id + "|" + addons + "|" + colors.join(",") + "|" + dir + "|" + frame;
  },

  /* Recorta uma celula do sheet ja colorida. */
  celula(img, mask, meta, col, linha, colors) {
    const cw = meta.cw, ch = meta.ch;
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, col * cw, linha * ch, cw, ch, 0, 0, cw, ch);
    if (!mask || !mask.complete || !mask.naturalWidth) return cv;
    const mc = document.createElement("canvas");
    mc.width = cw; mc.height = ch;
    const mx = mc.getContext("2d", { willReadFrequently: true });
    mx.drawImage(mask, col * cw, linha * ch, cw, ch, 0, 0, cw, ch);
    return tingir(cv, cx, mx, cw, ch, colors);
  },

  /* Canvas da outfit do catalogo novo, com os addons ligados */
  outfit(id, addons, colors, dir, frame) {
    const o = APP_OUTFIT[id];
    if (!o || !o.cw) return null;
    addons = Math.max(0, Math.min(3, addons | 0));
    const linha = appDirRow(dir);
    const idleRequest = !!(frame && typeof frame === "object" && frame.idle);
    const idleMeta = idleRequest ? idleAnimationMeta("outfits", id) : null;
    const renderMeta = idleMeta || o;
    const col = idleMeta
      ? idleAnimationFrame(idleMeta, frame.now, 0)
      : Math.max(0, Math.min((o.cols || 4) - 1,
          typeof frame === "number" ? frame | 0 : 0));
    const assetMode = idleMeta ? ".idle" : "";
    const k = this.key(id, addons, colors, linha,
      (idleMeta ? "idle:" : "walk:") + col);
    if (this.cache[k] !== undefined) return this.cache[k];

    const camadas = [""];
    if (addons & 1) camadas.push("-a1");
    if (addons & 2) camadas.push("-a2");

    // todas as camadas precisam estar carregadas antes de compor, senao o
    // canvas seria cacheado incompleto (mesmo bug do outfit branco antigo)
    const imgs = [];
    for (const suf of camadas) {
      const base = Sprites.get(
        `assets/appearance/outfit/${id}${suf}${assetMode}.base.png`);
      if (!base) continue;                      // camada inexistente: ignora
      if (!base.complete) return null;
      if (!base.naturalWidth) continue;         // 404: segue sem ela
      if (o.sexo === "avatar") {
        // Avatares oficiais ja vem prontos do client 15.x e nao usam mascara
        // de cor/addon; evitar pedir arquivo .mask.png inexistente.
        imgs.push([base, null]);
        continue;
      }
      const hasIdleMask = !idleMeta || !Array.isArray(idleMeta.masks) ||
        idleMeta.masks.indexOf(suf) !== -1;
      const mask = hasIdleMask ? Sprites.get(
        `assets/appearance/outfit/${id}${suf}${assetMode}.mask.png`) : null;
      if (mask && !mask.complete) return null;
      imgs.push([base, mask]);
    }
    if (!imgs.length) { this.cache[k] = null; return null; }

    // a celula tem tamanho fixo: as camadas de addon foram exportadas com a
    // mesma caixa do corpo, entao basta empilhar na origem (0,0)
    const cv = document.createElement("canvas");
    cv.width = renderMeta.cw; cv.height = renderMeta.ch;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    for (const [base, mask] of imgs) {
      const tmp = this.celula(base, mask, renderMeta, col, linha, colors);
      if (tmp) cx.drawImage(tmp, 0, 0);
    }
    markSpriteAnchor(cv, renderMeta, 64, 64);
    this.cache[k] = cv;
    return cv;
  },

  /* Canvas da montaria (sem cor de outfit: o bicho tem cor propria) */
  mount(id, dir, frame) {
    const m = APP_MOUNT[id];
    if (!m || !m.cw) return null;
    const linha = appDirRow(dir);
    const idleRequest = !!(frame && typeof frame === "object" && frame.idle);
    const idleMeta = idleRequest ? idleAnimationMeta("mounts", id) : null;
    const renderMeta = idleMeta || m;
    const col = idleMeta
      ? idleAnimationFrame(idleMeta, frame.now, 0)
      : Math.max(0, Math.min((m.cols || 4) - 1,
          typeof frame === "number" ? frame | 0 : 0));
    const k = "mount|" + id + "|" + linha + "|" +
      (idleMeta ? "idle:" : "walk:") + col;
    if (this.cache[k] !== undefined) return this.cache[k];
    const base = Sprites.get(`assets/appearance/mount/${id}${idleMeta ? ".idle" : ""}.base.png`);
    if (!base) { this.cache[k] = null; return null; }
    if (!base.complete) return null;
    if (!base.naturalWidth) { this.cache[k] = null; return null; }
    const cv = document.createElement("canvas");
    cv.width = renderMeta.cw; cv.height = renderMeta.ch;
    cv.getContext("2d").drawImage(base,
      col * renderMeta.cw, linha * renderMeta.ch,
      renderMeta.cw, renderMeta.ch, 0, 0, renderMeta.cw, renderMeta.ch);
    markSpriteAnchor(cv, renderMeta, 64, 64);
    this.cache[k] = cv;
    return cv;
  },

  /* Sprite para o jogo: monta o personagem (com addons) sobre a montaria,
   * na direcao e no frame de caminhada pedidos. */
  forPlayer(p, dir, frame) {
    const avatar = activeAvatarAppearance(p);
    if (avatar) {
      // Avatar oficial nao usa as cores/addons/montaria do jogador.
      return this.outfit(avatar.id, 0, [0, 0, 0, 0], dir, frame);
    }

    const o = currentAppearance(p);
    if (!o) return null;
    const cores = (p.outfit && p.outfit.colors) ||
                  DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
    const addons = (p.outfit && p.outfit.addons) || 0;
    const corpo = this.outfit(o.id, addons, cores, dir, frame);
    if (!corpo) return null;
    const mnt = currentMount(p);
    if (!mnt) return corpo;
    const bicho = this.mount(mnt.id, dir, frame);
    if (!bicho) return corpo;
    const linha = appDirRow(dir);
    const idleRequest = !!(frame && typeof frame === "object" && frame.idle);
    let frameKey;
    if (idleRequest) {
      const outfitMeta = idleAnimationMeta("outfits", o.id);
      const mountMeta = idleAnimationMeta("mounts", mnt.id);
      frameKey = "idle:" + idleAnimationFrame(outfitMeta, frame.now, 0) + ":" +
        idleAnimationFrame(mountMeta, frame.now, 0);
    } else {
      frameKey = "walk:" + (typeof frame === "number" ? frame | 0 : 0);
    }
    const k = "jogo|" + o.id + "|" + addons + "|" + cores.join(",") +
              "|" + mnt.id + "|" + linha + "|" + frameKey;
    if (this.cache[k] !== undefined) return this.cache[k];
    this.cache[k] = this.montar(corpo, bicho, o, mnt);
    return this.cache[k];
  },

  /* Junta personagem + montaria respeitando o deslocamento do DAT.
   *
   * No client o personagem montado e desenhado subindo dispX/dispY da
   * outfit: e por isso que o cavaleiro senta na sela em vez de flutuar
   * acima ou afundar no bicho. O codigo antigo usava um "+8" fixo, o que
   * desalinhava toda montaria com altura diferente. */
  montar(corpo, bicho, o, mnt) {
    const subir = o.dy || 0;
    const ca = corpo._spriteAnchor || { sw:64, sh:64, ox:64-corpo.width, oy:64-corpo.height };
    const ma = bicho._spriteAnchor || { sw:64, sh:64, ox:64-bicho.width, oy:64-bicho.height };
    const fullW = Math.max(ca.sw, ma.sw);
    const fullH = Math.max(ma.sh, ca.sh + subir);
    // Posições dos recortes dentro de um canvas lógico comum, com os dois
    // frame groups ancorados pelo canto inferior-direito do SQM.
    const mountX = fullW - ma.sw + ma.ox;
    const mountY = fullH - ma.sh + ma.oy;
    const bodyX = fullW - ca.sw + ca.ox;
    const bodyY = fullH - ca.sh - subir + ca.oy;
    const minX = Math.min(mountX, bodyX);
    const minY = Math.min(mountY, bodyY);
    const maxX = Math.max(mountX + bicho.width, bodyX + corpo.width);
    const maxY = Math.max(mountY + bicho.height, bodyY + corpo.height);
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(maxX - minX));
    cv.height = Math.max(1, Math.ceil(maxY - minY));
    const cx = cv.getContext("2d");
    cx.drawImage(bicho, mountX - minX, mountY - minY);
    cx.drawImage(corpo, bodyX - minX, bodyY - minY);
    cv._spriteAnchor = { sw:fullW, sh:fullH, ox:minX, oy:minY };
    return cv;
  },

  /* Prévia (montaria + personagem) para as telas de selecao */
  preview(p, dir) {
    const o = currentAppearance(p);
    if (!o) return null;
    const cores = (p.outfit && p.outfit.colors) ||
                  DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
    const corpo = this.outfit(o.id, (p.outfit && p.outfit.addons) || 0,
                              cores, dir || "s", 0);
    if (!corpo) return null;
    const mnt = currentMount(p);
    const bicho = mnt ? this.mount(mnt.id, dir || "s", 0) : null;
    if (!bicho) return corpo;
    return this.montar(corpo, bicho, o, mnt);
  },
};

/* Multiplica os pixels do canvas pela cor da paleta indicada na mascara.
 *
 * A mascara marca as quatro regiões tingiveis com cores puras: amarelo =
 * cabeca, vermelho = corpo, verde = pernas, azul = pes. Separado em funcao
 * propria porque agora tingimos CELULAS do spritesheet (uma direcao/frame de
 * cada vez), nao a imagem inteira. */
function tingir(cv, cx, mx, w, h, colors) {
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

/* Aplica as cores da paleta usando a mascara, na imagem inteira. */
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
  return tingir(cv, cx, mx, w, h, colors);
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
