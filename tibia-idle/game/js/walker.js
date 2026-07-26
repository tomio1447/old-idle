/*
 * walker.js — movimento do jogador pela cidade, com colisao e caminho.
 * Coordenadas em pixels do MUNDO (nao da tela).
 */
"use strict";

function CityWalker() {
  // comeca na praca, ao sul da fonte
  this.px = 16 * TILE;
  this.py = 14 * TILE;
  this.tpx = this.px;
  this.tpy = this.py;
  this.dir = "s";
  this.moving = false;
  this.stepT = 0;
  this.frame = 0;
  this.speed = 116;        // pixels do mundo por segundo
  this.target = null;      // npc de destino
  this.path = [];          // fila de pontos (pixels do mundo)
  this.keys = {};          // teclas pressionadas
}

/* Centro do tile em pixels */
function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

/* Busca em largura evitando paredes; devolve lista de tiles */
function findPath(sx, sy, gx, gy) {
  if (isBlocked(gx, gy)) {
    // procura o tile livre mais proximo do destino
    let best = null, bestD = 1e9;
    for (let r = 1; r <= 3 && !best; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (isBlocked(nx, ny)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
        }
      }
    }
    if (!best) return [];
    gx = best.x; gy = best.y;
  }
  if (sx === gx && sy === gy) return [];

  const key = (x, y) => y * MAP_W + x;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const seen = new Uint8Array(MAP_W * MAP_H);
  const q = [[sx, sy]];
  seen[key(sx, sy)] = 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1],
                [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false;

  for (let head = 0; head < q.length && !found; head++) {
    const [cx, cy] = q[head];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const k = key(nx, ny);
      if (seen[k] || isBlocked(nx, ny)) continue;
      // diagonal so passa se os dois lados estiverem livres
      if (dx && dy && (isBlocked(cx + dx, cy) || isBlocked(cx, cy + dy)))
        continue;
      seen[k] = 1;
      prev[k] = key(cx, cy);
      q.push([nx, ny]);
      if (nx === gx && ny === gy) { found = true; break; }
    }
  }
  if (!found) return [];

  const out = [];
  let cur = key(gx, gy);
  const start = key(sx, sy);
  while (cur !== start && cur >= 0) {
    out.push({ x: cur % MAP_W, y: Math.floor(cur / MAP_W) });
    cur = prev[cur];
  }
  return out.reverse();
}

/* Manda caminhar ate um ponto em pixels do mundo */
CityWalker.prototype.goToPixel = function (wx, wy, npcId) {
  const from = toTile(this.px, this.py);
  const to = toTile(wx, wy);
  const tiles = findPath(from.tx, from.ty, to.tx, to.ty);
  if (!tiles.length) {
    this.target = npcId || null;
    // ja esta no lugar
    if (npcId) return true;
    return false;
  }
  this.path = tiles.map((t) => tileCenter(t.x, t.y));
  const last = this.path[this.path.length - 1];
  this.tpx = last.x; this.tpy = last.y;
  this.target = npcId || null;
  this.moving = true;
  return false;
};

/* Caminha ate ficar adjacente a um NPC */
CityWalker.prototype.goToNpc = function (id) {
  const p = POI[id];
  if (!p) return false;
  const me = toTile(this.px, this.py);
  // ja esta ao lado?
  if (Math.abs(me.tx - p.tx) <= 1 && Math.abs(me.ty - p.ty) <= 1) return true;
  // procura o tile livre vizinho mais proximo do NPC
  let best = null, bestD = 1e9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = p.tx + dx, ny = p.ty + dy;
      if (isBlocked(nx, ny)) continue;
      const d = (nx - me.tx) ** 2 + (ny - me.ty) ** 2;
      if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
    }
  }
  if (!best) return false;
  const c = tileCenter(best.x, best.y);
  return this.goToPixel(c.x, c.y, id);
};

/* Movimento livre por teclado (WASD / setas) */
CityWalker.prototype.stepByKeys = function (dt) {
  let dx = 0, dy = 0;
  const k = this.keys;
  if (k.left) dx -= 1;
  if (k.right) dx += 1;
  if (k.up) dy -= 1;
  if (k.down) dy += 1;
  if (!dx && !dy) return false;

  this.path.length = 0;
  this.target = null;
  const len = Math.hypot(dx, dy) || 1;
  const step = this.speed * (dt / 1000);
  const nx = this.px + (dx / len) * step;
  const ny = this.py + (dy / len) * step;

  // testa os eixos separado para deslizar na parede
  const t1 = toTile(nx, this.py);
  if (!isBlocked(t1.tx, t1.ty)) this.px = nx;
  const t2 = toTile(this.px, ny);
  if (!isBlocked(t2.tx, t2.ty)) this.py = ny;

  if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? "e" : "w";
  else this.dir = dy > 0 ? "s" : "n";

  this.moving = true;
  this.stepT += dt;
  if (this.stepT > 170) {
    this.stepT = 0;
    this.frame = this.frame === 1 ? 2 : 1;
  }
  return true;
};

/* Avanca a caminhada; devolve o npc alcancado (uma unica vez) */
CityWalker.prototype.update = function (dt) {
  if (this.stepByKeys(dt)) return null;

  if (!this.path.length) {
    if (this.moving) { this.moving = false; this.frame = 0; }
    const reached = this.target;
    this.target = null;
    return reached;
  }

  this.moving = true;
  const next = this.path[0];
  const dx = next.x - this.px, dy = next.y - this.py;
  const dist = Math.hypot(dx, dy);
  const step = this.speed * (dt / 1000);

  if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? "e" : "w";
  else if (dy !== 0) this.dir = dy > 0 ? "s" : "n";

  if (dist <= step) {
    this.px = next.x; this.py = next.y;
    this.path.shift();
    if (!this.path.length) {
      this.moving = false;
      this.frame = 0;
      const reached = this.target;
      this.target = null;
      return reached;
    }
  } else {
    this.px += (dx / dist) * step;
    this.py += (dy / dist) * step;
  }

  this.stepT += dt;
  if (this.stepT > 170) {
    this.stepT = 0;
    this.frame = this.frame === 1 ? 2 : 1;
  }
  return null;
};
