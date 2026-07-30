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

  // ---- chao: tiles oficiais 32x32 por regiao (grama, rua calcada, terra)
  const x0 = Math.max(0, Math.floor(camX / TS));
  const y0 = Math.max(0, Math.floor(camY / TS));
  const x1 = Math.min(MAP_W, Math.ceil((camX + W) / TS));
  const y1 = Math.min(MAP_H, Math.ceil((camY + H) / TS));

  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const sx = tx * TS - camX, sy = ty * TS - camY;
      const gid = CITY.ground[ty * MAP_W + tx];
      if (!TileSprites.draw(ctx, gid, sx, sy, TS)) {
        ctx.fillStyle = gid === 103 ? "#6b4f31" :
          gid === 106 ? "#3c6b28" : "#b8a878";
        ctx.fillRect(sx, sy, TS + 1, TS + 1);
      }
    }
  }

  // ---- muralha perimetral: a cidade e um local FECHADO, com portoes de
  // arco oficiais ao norte e ao sul (o grid bloqueia a borda inteira)
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const wid = CITY.wall[ty * MAP_W + tx];
      if (!wid) continue;
      const sx = tx * TS - camX, sy = ty * TS - camY;
      if (!TileSprites.drawDeco(ctx, wid, sx, sy, TS)) {
        ctx.fillStyle = "#c9b87a";
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

    // piso interno com tiles oficiais (marmore branco 409 / madeira 419).
    // O non-marble leva uma sombra leve para separar do sandstone da parede.
    const floorIds = marble ? [409] : [419];
    for (let ty = b.y; ty < b.y + b.h; ty++) {
      for (let tx = b.x; tx < b.x + b.w; tx++) {
        const sx = tx * TS - camX, sy = ty * TS - camY;
        if (!TileSprites.draw(ctx, tileVariant(floorIds, tx, ty), sx, sy, TS)) {
          ctx.fillStyle = marble ? "#cfc9b4" : "#8a6a52";
          ctx.fillRect(sx, sy, TS + 1, TS + 1);
        }
        if (!marble) {
          ctx.fillStyle = "rgba(30,16,8,.22)";
          ctx.fillRect(sx, sy, TS + 1, TS + 1);
        }
      }
    }

    // paredes: blocos oficiais completos — predios comuns usam sandstone
    // wall (478); os de marmore usam dark marble (965-970, variacao por
    // celula). Fileira de cima recebe o telhado, entao parede vai da
    // segunda fileira ate a base.
    const wallIds = marble ? [965, 966, 967, 968, 969, 970] : [478];
    const drawWall = (tx, ty) => {
      const sx = tx * TS - camX, sy = ty * TS - camY;
      if (!TileSprites.draw(ctx, tileVariant(wallIds, tx, ty), sx, sy, TS)) {
        ctx.fillStyle = marble ? "#4a4640" : "#c9b87a";
        ctx.fillRect(sx, sy, TS + 1, TS + 1);
      }
    };
    for (let ty = b.y + 1; ty < b.y + b.h; ty++)
      for (let tx = b.x; tx < b.x + b.w; tx++) drawWall(tx, ty);

    // predios de marmore: topo plano de marmore branco (409)
    if (marble)
      for (let tx = b.x; tx < b.x + b.w; tx++) {
        const sx = tx * TS - camX, sy = b.y * TS - camY;
        if (!TileSprites.draw(ctx, 409, sx, sy, TS)) {
          ctx.fillStyle = "#d9d3bf"; ctx.fillRect(sx, sy, TS + 1, TS + 1);
        }
      }

    // telhado dos predios comuns: os tiles de roof do client (5033/5034)
    // sao so a cumeeira, entao o telhado em si e uma faixa procedural de
    // telhas cobrindo a primeira fileira (DESIGN — como ja era antes).
    if (!marble) {
      const rg = ctx.createLinearGradient(0, by - 4, 0, by + TS);
      rg.addColorStop(0, "#c25444"); rg.addColorStop(1, "#7a2f24");
      ctx.fillStyle = rg;
      ctx.fillRect(bx - 4, by - 4, bw + 8, TS + 6);
      ctx.strokeStyle = "rgba(0,0,0,.22)";
      ctx.lineWidth = 1;
      for (let ly = by; ly < by + TS + 2; ly += 7) {
        ctx.beginPath(); ctx.moveTo(bx - 4, ly); ctx.lineTo(bx + bw + 4, ly);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.fillRect(bx - 4, by + TS + 2, bw + 8, 4);
    }
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    // fachada: janelas e porta oficiais (frame de porta 1646; janela de
    // pedra 1489 / com vidro 1488, suspensas no meio do tile da fachada)
    const winId = marble ? 1488 : 1489;
    const fy = (b.y + b.h - 1) * TS - camY;
    for (let tx = b.x; tx < b.x + b.w; tx++) {
      const sx = tx * TS - camX;
      const rel = tx - b.x;
      if (rel === b.door) {
        // vao escuro da entrada + frame oficial por cima
        ctx.fillStyle = "#2b1d12";
        ctx.fillRect(sx + TS * 0.12, fy + TS * 0.08, TS * 0.76, TS * 0.92);
        TileSprites.drawDeco(ctx, 1646, sx, fy, TS);
      } else if (b.windows && rel % 2 === 1) {
        // fundo do vao para o vidro da janela oficial se destacar
        ctx.fillStyle = "#26313d";
        ctx.fillRect(sx + TS * 0.3, fy + TS * 0.34, TS * 0.4, TS * 0.4);
        TileSprites.drawDeco(ctx, winId, sx, fy - TS * 0.3, TS);
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

  // ---- decoracao: numero = tile oficial; texto = PNG legado assets/city
  for (const [spr, tx, ty] of DECOR) {
    const sx = tx * TS - camX, sy = ty * TS - camY;
    if (sx < -TS * 2 || sx > W + TS || sy < -TS * 2 || sy > H + TS) continue;
    if (typeof spr === "number") TileSprites.drawDeco(ctx, spr, sx, sy, TS);
    else drawTileSprite(ctx, CitySprites.tile(spr), sx, sy, S);
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

  // grama (id 106 no ground oficial) pintada de verde escuro
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const gid = CITY.ground[ty * MAP_W + tx];
      if (gid !== 106) continue;
      ctx.fillStyle = "#2e4420";
      ctx.fillRect(ox + tx * sx, oy + ty * sy, sx + 0.5, sy + 0.5);
    }
  }
  // muralha perimetral
  ctx.fillStyle = "#8a8578";
  ctx.fillRect(ox, oy, mw, sy + 0.5);
  ctx.fillRect(ox, oy + mh - sy, mw, sy + 0.5);
  ctx.fillRect(ox, oy, sx + 0.5, mh);
  ctx.fillRect(ox + mw - sx, oy, sx + 0.5, mh);
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
