/*
 * tilemap.js — carregador dos tiles oficiais 32x32 (assets/tiles/<id>.png,
 * extraidos do client 8.60 por tools/extract_tiles.py) + desenho de mapas
 * em grade de caracteres (usado pela cena de combate e pela cidade).
 *
 * Convencao da legenda de um mapa (ver huntmapdata.js):
 *   v: [ids...]  -> chao com variacao deterministica por celula (hash)
 *   g: [ids...]  -> camadas fixas POR CIMA do v, desenhadas na ordem
 *   bloc: true   -> celula bloqueia movimento
 */
"use strict";

const TileSprites = {
  cache: {},
  /* Duração de cada frame da animação (ms). O client roda a 10fps, mas
   * alguns tiles (agua com 95 frames, lava) ficavam lentos demais no
   * idle — a pedido do jogador, a velocidade foi ajustada por tipo:
   * agua/liquidos mais rapidos, fogo/luz media, o resto no padrao. */
  ANIM_DUR: 120,
  /* ids cuja strip <id>_anim.png NAO carregou (404): caem na sprite
   * estatica <id>.png para o mapa nunca ficar com buracos. */
  _broken: {},
  _anim(id) {
    return (typeof TILE_ANIM !== "undefined" && TILE_ANIM[id] &&
            !this._broken[id]) ? TILE_ANIM[id] : null;
  },
  _dur(id) {
    const a = this._anim(id);
    if (!a) return this.ANIM_DUR;
    // agua (53873, 53882..53899, 4612..4614...): 95 quadros a 120ms =
    // 11s por ciclo; a 40ms fica 3.8s, proximo do client real
    if (a.af >= 60) return 40;
    if (a.af >= 12) return 80;
    return this.ANIM_DUR;
  },
  _pattern(id) {
    const all = (typeof TILE_PATTERNS !== "undefined" && TILE_PATTERNS) || {};
    return all[id] || null;
  },
  _patternFrame(meta) {
    if (!meta || meta.af <= 1) return 0;
    const durations = meta.durations && meta.durations.length === meta.af
      ? meta.durations : Array(meta.af).fill(this.ANIM_DUR);
    const total = meta.duration || durations.reduce((sum, n) => sum + n, 0);
    let elapsed = performance.now() % Math.max(1, total);
    for (let frame = 0; frame < durations.length; frame++) {
      if (elapsed < durations[frame]) return frame;
      elapsed -= durations[frame];
    }
    return 0;
  },
  _patternSource(id, cx, cy) {
    const meta = this._pattern(id);
    if (!meta) return null;
    const key = "pattern:" + id;
    let img = this.cache[key];
    if (img === undefined) {
      img = new Image();
      const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
      img.src = "assets/tiles/" + id + "_pattern.png?v=" + v;
      img.onerror = () => { this.cache[key] = null; };
      this.cache[key] = img;
    }
    if (!img || !img.complete || !img.naturalWidth) return { meta, img:null, sx:0 };
    const px = ((Number(cx) || 0) % meta.px + meta.px) % meta.px;
    const py = ((Number(cy) || 0) % meta.py + meta.py) % meta.py;
    const frame = this._patternFrame(meta);
    const index = (frame * meta.py + py) * meta.px + px;
    return { meta, img, sx:index * meta.aw };
  },
  /* Frame atual da animação do id (0 para estático) */
  frameFor(id) {
    const a = this._anim(id);
    if (!a || !a.af) return 0;
    return Math.floor(performance.now() / this._dur(id)) % a.af;
  },
  get(id, frame) {
    const a = this._anim(id);
    const key = a ? id + "_" + frame : id;
    if (this.cache[key] !== undefined) return this.cache[key];
    const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
    if (a) {
      const img = new Image();
      img.src = "assets/tiles/" + id + "_anim.png?v=" + v;
      this.cache[key] = img;
      // Se a strip de animacao nao existir (404), o tile cai na sprite
      // ESTATICA em vez de sumir do mapa — a lista TILE_ANIM pode conter
      // ids cuja strip ainda nao foi copiada (atualizacao parcial).
      img.onerror = () => {
        this._broken[id] = true;
        const est = new Image();
        est.src = "assets/tiles/" + id + ".png?v=" + v;
        est.onerror = () => { this.cache[id] = null; this.cache[key] = null; };
        this.cache[id] = est;
        this.cache[key] = est;
      };
      return img;
    }
    const img = new Image();
    img.src = "assets/tiles/" + id + ".png?v=" + v;
    img.onerror = () => { this.cache[key] = null; };
    this.cache[key] = img;
    return img;
  },
  /* desenha o tile esticado num quadrado size x size (chao). `cx/cy`
   * selecionam o pattern X/Y oficial do DAT para a célula. */
  draw(ctx, id, sx, sy, size, cx, cy) {
    const pattern = this._patternSource(id, cx, cy);
    const a = pattern ? null : this._anim(id);
    const fr = a ? this.frameFor(id) : 0;
    const img = pattern ? pattern.img : this.get(id, fr);
    if (img && img.complete && img.naturalWidth) {
      const scale = size / 32;
      const nativeW = pattern ? pattern.meta.aw : (a ? a.aw : img.naturalWidth);
      const nativeH = pattern ? pattern.meta.ah : (a ? a.ah : img.naturalHeight);
      const w = nativeW * scale;
      const h = nativeH * scale;
      // Sprites maiores que 32px se espalham para cima/esquerda, como no client.
      const dx = sx - (w - size);
      const dy = sy - (h - size);
      // 1 pixel de bleed elimina linhas entre SQMs causadas por frações de
      // pixel/DPR sem alterar a origem lógica da célula.
      const drawW = w + 1, drawH = h + 1;
      if (pattern) {
        ctx.drawImage(img, pattern.sx, 0, nativeW, nativeH, dx, dy, drawW, drawH);
      } else if (a) {
        ctx.drawImage(img, fr * a.aw, 0, a.aw, a.ah, dx, dy, drawW, drawH);
      } else {
        ctx.drawImage(img, dx, dy, drawW, drawH);
      }
      return true;
    }
    return false;
  },
  /* desenha item alinhado pela base do tile — deco maior que 32px "sobe",
   * como o client oficial ancora objetos empilhaveis.
   *
   * Objetos MULTI-SQM da paleta 15.x (2x1, 1x2, 2x2... — sprite com
   * largura/altura multiplos exatos de 32 e maior que 1 SQM): o no do item
   * no .otbm fica no SQM INFERIOR-DIREITO do footprint, e a sprite ocupa o
   * bloco tw x th estendendo 1 SQM para cima/esquerda (convencao OTBM/RME e
   * igual ao proprio draw() do chao). Logo, para itens de CHAO, o canto
   * superior-esquerdo do sprite vai para (sx-(w-size), sy-(h-size)).
   * Itens em CELULA DE PAREDE (hangables — fogueiras, estantes, marcados
   * pelo chao nao andavel do muro) ficam CENTRALIZADOS na celula do muro,
   * "grudados/pendurados" nele, sem o deslocamento — e sem o "espaco no
   * meio" que o deslocamento causava. Sprites legado de decoracao (tamanhos
   * nao multiplos de 32, ex. 43x17) e itens 1x1 continuam centralizados. */
  drawDeco(ctx, id, sx, sy, size, onWall, cx, cy) {
    const pattern = this._patternSource(id, cx, cy);
    const a = pattern ? null : this._anim(id);
    const fr = a ? this.frameFor(id) : 0;
    const img = pattern ? pattern.img : this.get(id, fr);
    if (!img || !img.complete || !img.naturalWidth) return false;
    const k = size / 32;
    const nW = pattern ? pattern.meta.aw : (a ? a.aw : img.naturalWidth);
    const nH = pattern ? pattern.meta.ah : (a ? a.ah : img.naturalHeight);
    const w = nW * k;
    const h = nH * k;
    // multi-SQM: dimensoes multiplas exatas de 32 e maiores que 1 SQM
    const multi = (nW % 32 === 0 && nH % 32 === 0 && (nW > 32 || nH > 32));
    let dx, dy;
    if (multi && !onWall) {
      // objeto de CHAO: ancora inferior-direita -> estende p/ cima/esquerda
      dx = sx - (w - size); dy = sy - (h - size);
    } else {
      // 1x1 ou item em muro (hangable): centralizado na celula
      dx = sx + (size - w) / 2; dy = sy + size - h;
    }
    if (pattern) {
      ctx.drawImage(img, pattern.sx, 0, nW, nH, dx, dy, w, h);
    } else if (a) {
      ctx.drawImage(img, fr * a.aw, 0, a.aw, a.ah, dx, dy, w, h);
    } else {
      ctx.drawImage(img, dx, dy, w, h);
    }
    return true;
  },
};

/* hash deterministico por celula — sempre a mesma variante de chao */
function tileVariant(ids, cx, cy) {
  return ids[(cx * 31 + cy * 17) % ids.length];
}

/* Item explicitamente NÃO-ANDÁVEL (parede/pilar/bloqueante) em TILEFLAGS. */
function tileItemIsBlocking(id) {
  const f = (typeof TILEFLAGS !== "undefined" && TILEFLAGS[id]);
  return !!(f && f[0] === 0);
}

function tileLegendIsWall(L) {
  return !!(L && L.v && L.v.some(function (id) {
    const f = (typeof TILEFLAGS !== "undefined" && TILEFLAGS[id]);
    return f && f[0] === 0;
  }));
}

/* Ordena drawables por SQM (sul depois, leste depois) — mesma regra do client. */
function sortTileDepthDrawables(list) {
  return (list || []).slice().sort(function (a, b) {
    return (a.ty - b.ty) || (a.tx - b.tx) || ((a.footY || 0) - (b.footY || 0))
      || ((a.order || 0) - (b.order || 0));
  });
}

/* Desenha paredes/bloqueantes célula a célula (N→S, O→L). Em cada SQM,
 * opcionalmente intercalá criaturas via opts.drawables [{tx,ty,footY,order,draw}].
 * Assim: criatura à DIREITA da parede fica por cima; à ESQUERDA, a parede cobre. */
function drawBlockingTilesInterleaved(ctx, map, W, H, cols, rows, opts) {
  opts = opts || {};
  const tw = W / cols, th = H / rows;
  const decoAt = {};
  for (const d of map.deco || []) {
    if (!tileItemIsBlocking(d[0])) continue;
    const key = (d[1] | 0) + ":" + (d[2] | 0);
    (decoAt[key] || (decoAt[key] = [])).push(d);
  }
  const drawables = sortTileDepthDrawables(opts.drawables);
  let di = 0;
  const n = drawables.length;
  const flushCell = function (x, y) {
    while (di < n && drawables[di].ty === y && drawables[di].tx === x) {
      const item = drawables[di++];
      if (typeof item.draw === "function") item.draw();
    }
  };
  for (let y = 0; y < rows; y++) {
    const row = (y < map.rows.length) ? map.rows[y] : null;
    for (let x = 0; x < cols; x++) {
      if (row && x < row.length) {
        const L = map.leg[row[x]];
        if (L && L.g) {
          const cw = tileLegendIsWall(L);
          for (const id of L.g) {
            if (!tileItemIsBlocking(id)) continue;
            TileSprites.drawDeco(ctx, id, x * tw, y * th, tw, cw, x, y);
          }
        }
      }
      const extras = decoAt[x + ":" + y];
      if (extras) {
        for (const d of extras)
          TileSprites.drawDeco(ctx, d[0], d[1] * tw, d[2] * th, tw, false, d[1], d[2]);
      }
      flushCell(x, y);
    }
  }
  while (di < n) {
    const item = drawables[di++];
    if (typeof item.draw === "function") item.draw();
  }
}

/* Desenha um mapa de caracteres inteiro numa area W x H (cena de combate).
 * mode:
 *   'all'      -> chão + objetos (comportamento original, usado pela cidade)
 *   'ground'   -> chão + objetos ANDÁVEIS (desenhado ANTES das criaturas)
 *   'objects'  -> só objetos NÃO-ANDÁVEIS; com opts.drawables, intercalá
 *                 criaturas por SQM (profundidade Oeste/Leste e Norte/Sul)
 * opts (opcional):
 *   drawables: [{ tx, ty, footY?, order?, draw }] — só em mode 'objects'/'all'
 * Regra de z-order (igual ao client Tibia): tiles/pisos e decorações andáveis
 * (sofás, gelo, tapetes) ficam ABAIXO das criaturas (o player anda em cima);
 * paredes/pilares (não-andáveis) intercalam por posição de tile com criaturas. */
function drawTileCharMap(ctx, map, W, H, cols, rows, mode, opts) {
  if (mode === undefined) mode = "all";
  opts = opts || null;
  const tw = W / cols, th = H / rows;
  const drawCellItems = function (onlyBlocking) {
    for (let y = 0; y < rows && y < map.rows.length; y++) {
      const row = map.rows[y];
      for (let x = 0; x < cols && x < row.length; x++) {
        const L = map.leg[row[x]];
        if (!L || !L.g) continue;
        const cw = tileLegendIsWall(L);
        for (const id of L.g) {
          if (tileItemIsBlocking(id) !== onlyBlocking) continue;
          TileSprites.drawDeco(ctx, id, x * tw, y * th, tw, cw, x, y);
        }
      }
    }
  };
  const drawDecoItems = function (onlyBlocking) {
    for (const d of map.deco || []) {
      if (tileItemIsBlocking(d[0]) !== onlyBlocking) continue;
      TileSprites.drawDeco(ctx, d[0], d[1] * tw, d[2] * th, tw, false, d[1], d[2]);
    }
  };
  if (mode !== "objects") {
    ctx.fillStyle = "#060806";
    ctx.fillRect(0, 0, W, H);
    // Primeira passagem: todos os pisos (sempre atrás de tudo).
    for (let y = 0; y < rows && y < map.rows.length; y++) {
      const row = map.rows[y];
      for (let x = 0; x < cols && x < row.length; x++) {
        const L = map.leg[row[x]];
        if (!L || !L.v || !L.v.length) continue;
        TileSprites.draw(ctx, tileVariant(L.v, x, y), x * tw, y * th, tw, x, y);
      }
    }
    // Objetos ANDÁVEIS/decorativos (sofás, gelo, tapetes): ABAIXO das criaturas.
    if (mode === "all" || mode === "ground") { drawCellItems(false); drawDecoItems(false); }
  }
  if (mode !== "ground") {
    // Paredes/pilares: intercalados com criaturas quando opts.drawables existe.
    if (mode === "all" || mode === "objects") {
      if (opts && opts.drawables)
        drawBlockingTilesInterleaved(ctx, map, W, H, cols, rows, opts);
      else { drawCellItems(true); drawDecoItems(true); }
    }
  }
}
