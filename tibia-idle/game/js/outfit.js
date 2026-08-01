/*
 * outfit.js — colorização das outfits no cliente (Change Outfit)
 *
 * Os sprites são exportados em dois arquivos por direção/frame:
 *   <nome>_<dir>.base.png  -> arte neutra
 *   <nome>_<dir>.mask.png  -> máscara com as áreas head/body/legs/feet
 *
 * A composição multiplica base × cor escolhida, exatamente como o cliente
 * original do Tibia faz. O resultado é cacheado em canvas.
 */
"use strict";

/* paleta oficial de outfit do Tibia (96 cores) */
const OUTFIT_PALETTE = ["#ffffff","#ffd4bf","#ffe9bf","#ffffbf","#e9ffbf","#d4ffbf","#bfffbf","#bfffd4","#bfffe9","#bfffff","#bfe9ff","#bfd4ff","#bfbfff","#d4bfff","#e9bfff","#ffbfff","#ffbfe9","#ffbfd4","#ffbfbf","#dadada","#bf9f8f","#bfaf8f","#bfbf8f","#afbf8f","#9fbf8f","#8fbf8f","#8fbf9f","#8fbfaf","#8fbfbf","#8fafbf","#8f9fbf","#8f8fbf","#9f8fbf","#af8fbf","#bf8fbf","#bf8faf","#bf8f9f","#bf8f8f","#b6b6b6","#bf7f5f","#bfaf8f","#bfbf5f","#9fbf5f","#7fbf5f","#5fbf5f","#5fbf7f","#5fbf9f","#5fbfbf","#5f9fbf","#5f7fbf","#5f5fbf","#7f5fbf","#9f5fbf","#bf5fbf","#bf5f9f","#bf5f7f","#bf5f5f","#919191","#bf6a3f","#bf943f","#bfbf3f","#94bf3f","#6abf3f","#3fbf3f","#3fbf6a","#3fbf94","#3fbfbf","#3f94bf","#3f6abf","#3f3fbf","#6a3fbf","#943fbf","#bf3fbf","#bf3f94","#bf3f6a","#bf3f3f","#6d6d6d","#bf5500","#bfaa00","#bfbf00","#aabf00","#55bf00","#00bf00","#00bf55","#00bfaa","#00bfbf","#00aabf","#0055bf","#0000bf","#5500bf","#aa00bf","#bf00bf","#bf00aa","#bf0055","#bf0000","#484848"];

/* cores padrão por vocação (head, body, legs, feet) — as clássicas do 7.4 */
const DEFAULT_OUTFIT_COLORS = {
  knight:   [95, 116, 116, 95],
  paladin:  [78, 68, 58, 76],
  druid:    [79, 78, 78, 76],
  sorcerer: [86, 50, 50, 86],
  monk:     [94, 88, 88, 94],
  none:     [78, 68, 58, 76],
};

/* tipos de outfit que o jogador pode escolher */
const OUTFIT_TYPES = [
  { id: "knight",   name: "Knight" },
  { id: "hunter",   name: "Hunter" },
  { id: "summoner", name: "Summoner" },
  { id: "mage",     name: "Mage" },
  { id: "citizen",  name: "Citizen" },
  { id: "monk",     name: "Monk" },
];

/* outfit padrão de cada vocação */
const VOC_OUTFIT = { knight: "knight", paladin: "hunter", druid: "summoner",
                     sorcerer: "mage", monk: "monk", none: "citizen" };

/* helpers que aceitam tanto <img> quanto <canvas> */
function spriteReady(s) {
  if (!s) return false;
  if (s.tagName === "CANVAS") return s.width > 0;
  return !!(s.complete && s.naturalWidth);
}
function spriteW(s) { return !s ? 0 : (s.tagName === "CANVAS" ? s.width : s.naturalWidth); }
function spriteH(s) { return !s ? 0 : (s.tagName === "CANVAS" ? s.height : s.naturalHeight); }

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paletteColor(i) {
  return OUTFIT_PALETTE[((i % OUTFIT_PALETTE.length) + OUTFIT_PALETTE.length) % OUTFIT_PALETTE.length];
}

/* normaliza a config de outfit de um personagem */
function playerOutfit(p) {
  const sex = p.sex === "female" ? "f" : "m";
  const base = (p.outfit && p.outfit.type) || VOC_OUTFIT[p.voc] || "citizen";
  const def = DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
  const c = (p.outfit && p.outfit.colors) || def;
  return {
    type: base,
    sex: sex,
    name: base + "-" + sex,
    colors: [c[0] | 0, c[1] | 0, c[2] | 0, c[3] | 0],
  };
}

/* garante que o personagem tenha o campo outfit preenchido */
function ensureOutfit(p) {
  const def = DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
  p.outfit = p.outfit || {};
  if (!p.outfit.type) p.outfit.type = VOC_OUTFIT[p.voc] || "citizen";
  if (!Array.isArray(p.outfit.colors) || p.outfit.colors.length !== 4)
    p.outfit.colors = def.slice();
  return p.outfit;
}

const OutfitRenderer = {
  cache: {},      // chave -> canvas pronto
  pending: {},    // chave -> true enquanto as imagens carregam

  key(name, suf, colors) { return `${name}_${suf}|${colors.join(",")}`; },

  /* Canvas colorido para (outfit, direção/frame, cores). null enquanto carrega. */
  get(name, suf, colors) {
    const k = this.key(name, suf, colors);
    if (this.cache[k] !== undefined) return this.cache[k];
    if (this.pending[k]) return null;

    const base = Sprites.get(`assets/outfit/${name}_${suf}.base.png`);
    const mask = Sprites.get(`assets/outfit/${name}_${suf}.mask.png`);
    if (!base) { this.cache[k] = null; return null; }
    if (!base.complete || !base.naturalWidth) return null;
    // Espera a máscara terminar de carregar antes de cachear. Sem isto o
    // canvas era gravado sem cor e o outfit ficava branco — o que só
    // aparecia ao virar de costas, porque as direções n/w carregam depois.
    // `mask.complete` já é true quando o arquivo falha (404), e nesse caso
    // naturalWidth fica 0 e seguimos sem cor, como fallback legítimo.
    if (mask && !mask.complete) return null;

    this.pending[k] = true;
    try {
      const w = base.naturalWidth, h = base.naturalHeight;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(base, 0, 0);

      if (mask && mask.complete && mask.naturalWidth) {
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
          if (r > 128 && g > 128 && bl < 128) col = cols[0];        // amarelo = head
          else if (r > 128 && g < 128 && bl < 128) col = cols[1];   // vermelho = body
          else if (r < 128 && g > 128 && bl < 128) col = cols[2];   // verde = legs
          else if (r < 128 && g < 128 && bl > 128) col = cols[3];   // azul = feet
          if (!col) continue;
          b[i]     = (b[i] * col[0] / 255) | 0;
          b[i + 1] = (b[i + 1] * col[1] / 255) | 0;
          b[i + 2] = (b[i + 2] * col[2] / 255) | 0;
        }
        cx.putImageData(bd, 0, 0);
      }
      this.cache[k] = cv;
      return cv;
    } catch (e) {
      this.cache[k] = null;
      return null;
    } finally {
      delete this.pending[k];
    }
  },

  /* Sprite do jogador pronto para desenhar; cai no PNG antigo se preciso.
   *
   * Ordem de tentativa:
   *   1. catalogo novo (252 outfits com addon e montaria) — so quando o
   *      jogador escolheu um visual de la, porque esse catalogo so tem a
   *      direcao sul e perderia a animacao de andar;
   *   2. sprites classicos por direcao/frame, que continuam sendo o padrao.
   */
  /* Quantos quadros de caminhada a outfit atual tem (sem contar o parado).
   * Fica aqui e nao no walker porque so o renderizador sabe qual catalogo
   * esta em uso: o novo (spritesheet com ate 8 quadros) ou o classico, que
   * so tem dois PNGs por direcao. */
  frameCount(p) {
    if (p && p.outfit && p.outfit.appearance &&
        typeof APP_OUTFIT !== "undefined") {
      const o = APP_OUTFIT[p.outfit.appearance];
      if (o && o.cols) return Math.max(1, o.cols - 1);
    }
    return 2;                       // sprites classicos: _dir1 e _dir2
  },

  forPlayer(p, dir, frame) {
    // Transcendence (Avatar Stage 3): o avatar oficial da vocação sobrepõe
    // QUALQUER visual — inclusive o outfit clássico padrão (quando
    // p.outfit.appearance está vazio o AppearanceRenderer era pulado e o
    // avatar nunca era aplicado). activeAvatarAppearance() devolve o avatar
    // enquanto p._avatar.active estiver dentro da janela de 7s.
    if (typeof activeAvatarAppearance === "function" &&
        typeof AppearanceRenderer !== "undefined") {
      const avatar = activeAvatarAppearance(p);
      if (avatar) {
        const cv = AppearanceRenderer.forPlayer(p, dir, frame);
        if (cv) return cv;
      }
    }
    const o = playerOutfit(p);
    if (p.outfit && p.outfit.appearance &&
        typeof AppearanceRenderer !== "undefined") {
      const cv = AppearanceRenderer.forPlayer(p, dir, frame);
      if (cv) return cv;
    }
    const suf = frame ? `${dir}${frame}` : dir;
    const cv = this.get(o.name, suf, o.colors);
    if (cv) return cv;
    return Sprites.walk(o.name, dir, frame) || Sprites.outfit(o.name, dir);
  },

  /* Data URL de uma prévia (usada na lista de personagens) */
  preview(p, dir) {
    const o = playerOutfit(p);
    if (p.outfit && p.outfit.appearance &&
        typeof AppearanceRenderer !== "undefined") {
      const nv = AppearanceRenderer.preview(p);
      if (nv) { try { return nv.toDataURL(); } catch (e) { /* segue */ } }
    }
    const cv = this.get(o.name, dir || "s", o.colors);
    if (cv) { try { return cv.toDataURL(); } catch (e) { return null; } }
    return null;
  },
};

/* Atalho global: o walker precisa saber o tamanho do ciclo de caminhada
 * para percorrer todos os quadros em vez de alternar entre dois. */
function walkFrameCount(p) {
  return (typeof OutfitRenderer !== "undefined" && OutfitRenderer.frameCount)
    ? OutfitRenderer.frameCount(p) : 2;
}
