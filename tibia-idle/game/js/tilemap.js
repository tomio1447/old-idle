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
  get(id) {
    if (this.cache[id] !== undefined) return this.cache[id];
    const img = new Image();
    const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
    img.src = "assets/tiles/" + id + ".png?v=" + v;
    img.onerror = () => { this.cache[id] = null; };
    this.cache[id] = img;
    return img;
  },
  /* desenha o tile esticado num quadrado size x size (chao) */
  draw(ctx, id, sx, sy, size) {
    const img = this.get(id);
    if (img && img.complete && img.naturalWidth) {
      const scale = size / 32;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      // Ancorar pelo bottom-right (ou top-left)?
      // No Tibia sprites maiores q 32x32 geralmente espalham pra cima e pra esquerda.
      // Entao sx e sy sao a celula base (32x32 do chao).
      const dx = sx - (w - size);
      const dy = sy - (h - size);
      ctx.drawImage(img, dx, dy, w + (scale>1?0:1), h + (scale>1?0:1));
      return true;
    }
    return false;
  },
  /* desenha item alinhado pela base do tile — deco maior que 32px "sobe",
   * como o client oficial ancora objetos empilhaveis */
  drawDeco(ctx, id, sx, sy, size) {
    const img = this.get(id);
    if (!img || !img.complete || !img.naturalWidth) return false;
    const k = size / 32;
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.drawImage(img, sx + (size - w) / 2, sy + size - h, w, h);
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
  for (let y = 0; y < rows && y < map.rows.length; y++) {
    const row = map.rows[y];
    for (let x = 0; x < cols && x < row.length; x++) {
      const L = map.leg[row[x]];
      if (!L) continue;
      const sx = x * tw, sy = y * th;
      if (L.v) TileSprites.draw(ctx, tileVariant(L.v, x, y), sx, sy, tw);
      if (L.g) for (const id of L.g) TileSprites.draw(ctx, id, sx, sy, tw);
    }
  }
  for (const d of map.deco || [])
    TileSprites.drawDeco(ctx, d[0], d[1] * tw, d[2] * th, tw);
}
