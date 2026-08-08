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
  /* desenha o tile esticado num quadrado size x size (chao) */
  draw(ctx, id, sx, sy, size) {
    const a = this._anim(id);
    const fr = a ? this.frameFor(id) : 0;
    const img = this.get(id, fr);
    if (img && img.complete && img.naturalWidth) {
      const scale = size / 32;
      const w = (a ? a.aw : img.naturalWidth) * scale;
      const h = (a ? a.ah : img.naturalHeight) * scale;
      // Ancorar pelo bottom-right (ou top-left)?
      // No Tibia sprites maiores q 32x32 geralmente espalham pra cima e pra esquerda.
      // Entao sx e sy sao a celula base (32x32 do chao).
      const dx = sx - (w - size);
      const dy = sy - (h - size);
      if (a) {
        // recorta o frame atual dentro da strip <id>_anim.png
        ctx.drawImage(img, fr * a.aw, 0, a.aw, a.ah, dx, dy, w, h);
      } else {
        ctx.drawImage(img, dx, dy, w + (scale>1?0:1), h + (scale>1?0:1));
      }
      return true;
    }
    return false;
  },
  /* desenha item alinhado pela base do tile — deco maior que 32px "sobe",
   * como o client oficial ancora objetos empilhaveis */
  drawDeco(ctx, id, sx, sy, size) {
    const a = this._anim(id);
    const fr = a ? this.frameFor(id) : 0;
    const img = this.get(id, fr);
    if (!img || !img.complete || !img.naturalWidth) return false;
    const k = size / 32;
    const w = (a ? a.aw : img.naturalWidth) * k;
    const h = (a ? a.ah : img.naturalHeight) * k;
    if (a) {
      ctx.drawImage(img, fr * a.aw, 0, a.aw, a.ah,
                    sx + (size - w) / 2, sy + size - h, w, h);
    } else {
      ctx.drawImage(img, sx + (size - w) / 2, sy + size - h, w, h);
    }
    return true;
  },
};

/* hash deterministico por celula — sempre a mesma variante de chao */
function tileVariant(ids, cx, cy) {
  return ids[(cx * 31 + cy * 17) % ids.length];
}

/* Desenha um mapa de caracteres inteiro numa area W x H (cena de combate) */
function drawTileCharMap(ctx, map, W, H, cols, rows) {
  const tw = W / cols, th = H / rows;
  ctx.fillStyle = "#060806";
  ctx.fillRect(0, 0, W, H);
  // OTC/Canary desenha o mapa por camadas, não por SQM completo. Fazer
  // ground + objeto em cada célula fazia o ground seguinte cobrir pedaços
  // de paredes/cristais 2×2 e gerava um mosaico recortado no mapa Ice.
  // Primeira passagem: todos os pisos, sempre atrás de objetos grandes.
  for (let y = 0; y < rows && y < map.rows.length; y++) {
    const row = map.rows[y];
    for (let x = 0; x < cols && x < row.length; x++) {
      const L = map.leg[row[x]];
      if (!L || !L.v || !L.v.length) continue;
      TileSprites.draw(ctx, tileVariant(L.v, x, y), x * tw, y * th, tw);
    }
  }
  // Segunda passagem: paredes, móveis e objetos 2×2/1×2. Nenhum piso pode
  // mais apagar suas partes que avançam sobre SQMs vizinhos.
  for (let y = 0; y < rows && y < map.rows.length; y++) {
    const row = map.rows[y];
    for (let x = 0; x < cols && x < row.length; x++) {
      const L = map.leg[row[x]];
      if (!L || !L.g) continue;
      for (const id of L.g) TileSprites.draw(ctx, id, x * tw, y * th, tw);
    }
  }
  // Terceira passagem: decoração explícita acima das camadas OTBM.
  for (const d of map.deco || [])
    TileSprites.drawDeco(ctx, d[0], d[1] * tw, d[2] * th, tw);
}
