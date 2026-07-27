/*
 * city-render.js — desenho do mapa da cidade com camera que segue o jogador
 */
"use strict";

const CitySprites = {
  cache: {},
  get(path) {
    if (this.cache[path] !== undefined) return this.cache[path];
    const img = new Image();
    img.src = path;
    img.onerror = () => { this.cache[path] = null; };
    this.cache[path] = img;
    return img;
  },
  tile(n) { return this.get(`assets/city/${n}.png`); },
};

/* Desenha uma imagem alinhada pelo canto inferior do tile (como no Tibia) */
function drawTileSprite(ctx, img, sx, sy, scale) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  // sprites maiores que 32px sobem para "encostar" no chao
  ctx.drawImage(img, sx, sy + TILE * scale - h, w, h);
}

Renderer.prototype.drawCityMap = function (player, dt, walker, hoverNpc) {
  const ctx = this.ctx;
  const W = this.c.width, H = this.c.height;
  // Mais visão no mapa para testes: 21 × 13 SQMs.
  const S = Math.min(W / (21 * TILE), H / (13 * TILE));
  const TS = TILE * S;

  // ---- camera centrada no jogador, presa aos limites do mapa
  const worldW = MAP_W * TS, worldH = MAP_H * TS;
  let camX = walker.px * S - W / 2;
  let camY = walker.py * S - H / 2;
  camX = Math.max(0, Math.min(worldW - W, camX));
  camY = Math.max(0, Math.min(worldH - H, camY));
  if (worldW < W) camX = (worldW - W) / 2;
  if (worldH < H) camY = (worldH - H) / 2;
  this.camX = camX; this.camY = camY; this.scale = S;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0f0e0c";
  ctx.fillRect(0, 0, W, H);

  // ---- chao: tiles 32x32 dedicados (grama, pedra, marmore...)
  const pave = CitySprites.tile("floor-pave");
  const grass = CitySprites.tile("floor-grass");
  const x0 = Math.max(0, Math.floor(camX / TS));
  const y0 = Math.max(0, Math.floor(camY / TS));
  const x1 = Math.min(MAP_W, Math.ceil((camX + W) / TS));
  const y1 = Math.min(MAP_H, Math.ceil((camY + H) / TS));

  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const sx = tx * TS - camX, sy = ty * TS - camY;
      const isGrass = CITY.grass[ty * MAP_W + tx];
      const src = isGrass ? grass : pave;
      if (src && src.complete && src.naturalWidth) {
        ctx.drawImage(src, sx, sy, TS + 1, TS + 1);
      } else {
        ctx.fillStyle = isGrass ? "#3c6b28" : "#6a6a68";
        ctx.fillRect(sx, sy, TS + 1, TS + 1);
      }
    }
  }

  // ---- predios
  // Desenhados em blocos solidos de cor + contorno, com a fachada de sprites
  // reais na frente. Os tiles de telhado do Tibia so encaixam num grid
  // isometrico especifico, entao usar cor cheia fica mais limpo.
  for (const b of BUILDINGS) {
    if ((b.x + b.w) * TS < camX || b.x * TS > camX + W ||
        (b.y + b.h) * TS < camY || b.y * TS > camY + H) continue;

    const bx = b.x * TS - camX, by = b.y * TS - camY;
    const bw = b.w * TS, bh = b.h * TS;
    const marble = b.wall === "marble";

    // piso interno do predio, com tiles reais
    const floor = CitySprites.tile(marble ? "floor-marble" : "floor-wood");
    for (let ty = b.y; ty < b.y + b.h; ty++) {
      for (let tx = b.x; tx < b.x + b.w; tx++) {
        const sx = tx * TS - camX, sy = ty * TS - camY;
        if (floor && floor.complete && floor.naturalWidth)
          ctx.drawImage(floor, sx, sy, TS + 1, TS + 1);
        else {
          ctx.fillStyle = marble ? "#cfc9b4" : "#8a6a52";
          ctx.fillRect(sx, sy, TS + 1, TS + 1);
        }
      }
    }

    // paredes: tiles de pedra/marmore em todo o perimetro
    const wallImg = CitySprites.tile(marble ? "wall-marble-h" : "wall-brick-h");
    const drawWall = (tx, ty) => {
      const sx = tx * TS - camX, sy = ty * TS - camY;
      if (wallImg && wallImg.complete && wallImg.naturalWidth)
        drawTileSprite(ctx, wallImg, sx, sy, S);
      else {
        ctx.fillStyle = marble ? "#a9a390" : "#6a4a38";
        ctx.fillRect(sx, sy, TS + 1, TS + 1);
      }
    };
    for (let tx = b.x; tx < b.x + b.w; tx++) {
      drawWall(tx, b.y);                 // parede de tras
    }
    for (let ty = b.y + 1; ty < b.y + b.h; ty++) {
      drawWall(b.x, ty);                 // lateral esquerda
      drawWall(b.x + b.w - 1, ty);       // lateral direita
    }

    // telhado: faixa superior cobrindo as duas primeiras fileiras
    const roofH = Math.min(bh * 0.5, 2 * TS);
    const rg = ctx.createLinearGradient(0, by - 6, 0, by + roofH);
    if (b.roof === "wood") {
      rg.addColorStop(0, "#9a6b3e"); rg.addColorStop(1, "#5e3f24");
    } else {
      rg.addColorStop(0, "#c25444"); rg.addColorStop(1, "#7a2f24");
    }
    ctx.fillStyle = rg;
    ctx.fillRect(bx - 4, by - 6, bw + 8, roofH);
    ctx.strokeStyle = "rgba(0,0,0,.22)";
    ctx.lineWidth = 1;
    for (let ly = by - 2; ly < by + roofH; ly += 8) {
      ctx.beginPath(); ctx.moveTo(bx - 4, ly); ctx.lineTo(bx + bw + 4, ly);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(bx - 4, by + roofH, bw + 8, 4);
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    // fachada: janelas e porta com sprites reais
    const win = CitySprites.tile(marble ? "window-marble" : "window-brick");
    const fy = (b.y + b.h - 1) * TS - camY;
    for (let tx = b.x; tx < b.x + b.w; tx++) {
      const sx = tx * TS - camX;
      const rel = tx - b.x;
      if (rel === b.door) {
        // porta desenhada como vao escuro com moldura
        ctx.fillStyle = "#2b1d12";
        ctx.fillRect(sx + TS * 0.15, fy + TS * 0.1, TS * 0.7, TS * 0.9);
        ctx.strokeStyle = "#c9a24a";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + TS * 0.15, fy + TS * 0.1, TS * 0.7, TS * 0.9);
        ctx.fillStyle = "#d8b45a";
        ctx.beginPath();
        ctx.arc(sx + TS * 0.72, fy + TS * 0.55, 2.2, 0, 7);
        ctx.fill();
      } else if (b.windows && rel % 2 === 1) {
        if (win && win.complete && win.naturalWidth) {
          drawTileSprite(ctx, win, sx, fy, S);
        } else {
          ctx.fillStyle = "#3a4a5a";
          ctx.fillRect(sx + TS * 0.2, fy + TS * 0.25, TS * 0.6, TS * 0.5);
        }
      }
    }
    // placa com o nome do estabelecimento
    if (b.label) {
      const lx = (b.x + b.w / 2) * TS - camX;
      const ly = (b.y + b.h - 1) * TS - camY - 6;
      ctx.font = "bold 11px Verdana";
      ctx.textAlign = "center";
      const tw = ctx.measureText(b.label).width + 12;
      ctx.fillStyle = "rgba(20,16,10,.85)";
      ctx.fillRect(lx - tw / 2, ly - 14, tw, 16);
      ctx.strokeStyle = "rgba(180,150,80,.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(lx - tw / 2, ly - 14, tw, 16);
      ctx.fillStyle = "#e8d9a8";
      ctx.fillText(b.label, lx, ly - 2);
    }
  }

  // ---- decoracao
  for (const [name, tx, ty] of DECOR) {
    const sx = tx * TS - camX, sy = ty * TS - camY;
    if (sx < -TS * 2 || sx > W + TS || sy < -TS * 2 || sy > H + TS) continue;
    drawTileSprite(ctx, CitySprites.tile(name), sx, sy, S);
  }

  // ---- NPCs
  this.npcHit = [];
  for (const id in POI) {
    const p = POI[id];
    const npc = NPCS[id];
    if (!npc) continue;
    const sx = p.tx * TS - camX + TS / 2;
    const sy = p.ty * TS - camY + TS / 2;
    if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) continue;

    const img = Sprites.npc(npc.sprite, "s");
    const hovered = hoverNpc === id;
    if (img && img.complete && img.naturalWidth) {
      const w = img.naturalWidth * S, h = img.naturalHeight * S;
      const bob = Math.sin(Date.now() / 700 + p.tx) * 1.5;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(sx, sy + h * 0.38, w * 0.3, h * 0.09, 0, 0, 7);
      ctx.fill();
      if (hovered) { ctx.save(); ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 14; }
      ctx.drawImage(img, sx - w / 2, sy - h / 2 + bob, w, h);
      if (hovered) ctx.restore();

      ctx.font = "bold 10px Verdana";
      ctx.textAlign = "center";
      const tw = ctx.measureText(npc.name).width + 10;
      const by = sy - h / 2 - 14;
      ctx.fillStyle = hovered ? "rgba(90,70,20,.92)" : "rgba(0,0,0,.7)";
      ctx.fillRect(sx - tw / 2, by, tw, 14);
      ctx.strokeStyle = hovered ? "#ffd24a" : "rgba(120,110,90,.5)";
      ctx.strokeRect(sx - tw / 2, by, tw, 14);
      ctx.fillStyle = hovered ? "#ffe680" : "#d8d0b8";
      ctx.fillText(npc.name, sx, by + 10);
    }
    this.npcHit.push({ id: id, x: sx, y: sy, w: 48, h: 64 });
  }

  // ---- jogador
  const pimg = OutfitRenderer.forPlayer(player, walker.dir, walker.frame);
  const psx = walker.px * S - camX, psy = walker.py * S - camY;
  if (spriteReady(pimg)) {
    const w = spriteW(pimg) * S, h = spriteH(pimg) * S;
    const bob = walker.moving ? 0 : Math.sin(Date.now() / 340) * 1.5;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath();
    ctx.ellipse(psx, psy + h * 0.38, w * 0.3, h * 0.1, 0, 0, 7);
    ctx.fill();
    ctx.drawImage(pimg, psx - w / 2, psy - h / 2 + bob, w, h);
  }

  // marcador do destino
  if (walker.moving) {
    const mx = walker.tpx * S - camX, my = walker.tpy * S - camY;
    const t = (Date.now() % 900) / 900;
    ctx.strokeStyle = "rgba(255,214,74," + (0.8 - t * 0.6) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(mx, my + 8, 9 + t * 10, 4 + t * 4, 0, 0, 7);
    ctx.stroke();
  }

  // ---- cabecalho
  ctx.textAlign = "left";
  ctx.font = "bold 13px Verdana";
  ctx.fillStyle = "rgba(0,0,0,.85)";
  ctx.fillText("Cidade de Thais", 13, 23);
  ctx.fillStyle = "#ffe680";
  ctx.fillText("Cidade de Thais", 12, 22);
  ctx.font = "10px Verdana";
  ctx.fillStyle = "rgba(0,0,0,.85)";
  ctx.fillText("Clique para andar · WASD/setas também · clique num NPC para falar", 13, 39);
  ctx.fillStyle = "#c8c0a8";
  ctx.fillText("Clique para andar · WASD/setas também · clique num NPC para falar", 12, 38);

  // ---- minimapa
  this.drawMiniMap(ctx, W, H, walker);
};

/* Minimapa no canto superior direito */
Renderer.prototype.drawMiniMap = function (ctx, W, H, walker) {
  const mw = 118, mh = 84, pad = 10;
  const ox = W - mw - pad, oy = pad;
  const sx = mw / MAP_W, sy = mh / MAP_H;

  ctx.fillStyle = "rgba(10,9,7,.82)";
  ctx.fillRect(ox - 2, oy - 2, mw + 4, mh + 4);
  ctx.strokeStyle = "rgba(150,130,80,.75)";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox - 2, oy - 2, mw + 4, mh + 4);

  // chao e grama
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const g = CITY.grass[ty * MAP_W + tx];
      if (!g) continue;
      ctx.fillStyle = "#2e4420";
      ctx.fillRect(ox + tx * sx, oy + ty * sy, sx + 0.5, sy + 0.5);
    }
  }
  // predios
  for (const b of BUILDINGS) {
    ctx.fillStyle = b.wall === "marble" ? "#b9b3a0" : "#7a4a3a";
    ctx.fillRect(ox + b.x * sx, oy + b.y * sy, b.w * sx, b.h * sy);
  }
  // NPCs
  for (const id in POI) {
    const p = POI[id];
    ctx.fillStyle = "#ffd24a";
    ctx.fillRect(ox + p.tx * sx - 1, oy + p.ty * sy - 1, 2.5, 2.5);
  }
  // jogador
  const ptx = walker.px / TILE, pty = walker.py / TILE;
  ctx.fillStyle = "#4ec8ff";
  ctx.beginPath();
  ctx.arc(ox + ptx * sx, oy + pty * sy, 2.6, 0, 7);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 0.8;
  ctx.stroke();
};

/* Converte coordenada do canvas -> pixel do mundo */
Renderer.prototype.screenToWorld = function (mx, my) {
  const S = this.scale || 2;
  return { x: (mx + (this.camX || 0)) / S, y: (my + (this.camY || 0)) / S };
};
