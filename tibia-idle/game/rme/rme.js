/*
 * rme.js — editor de mapas do tibia idle ("OTI RME").
 *
 * O mapa e um objeto {w, h, cells: {"x,y": {g, items[]}}, spawn, mob[]} no
 * MESMO modelo do js/otbm.js — salvar e so OTBM.write(map). A lista de
 * itens (paleta) vem de data/catalog.js (build_rme_catalog.py: TODOS os
 * itens do .dat 8.60 com sprite), desenhada a partir dos atlases
 * data/atlas_<N>.png — pixel oficial, igualzinho ao que o jogo desenha.
 *
 * Zonas: S = spawn do jogador (uma unica celula), G = area de monstros
 * (conjunto de celulas). gravadas na descricao do .otbm (linha OTIDLE).
 */
"use strict";

const CATALOG = window.RME_CATALOG;
const KNOWN = window.RME_KNOWN_TILES || [];
const KNOWN_SET = new Set(KNOWN);

/* tabela id -> {w, b, g, page, idx, tw, th, name} */
const ITEMS = new Map();
const SLUG_RE = /[^a-z0-9_.-]+/g;
for (const entry of CATALOG.entries) {
  const [id, w, b, g, page, idx, tw, th] = entry;
  ITEMS.set(id, { id, w, b, g, page, idx, tw: tw || 1, th: th || 1,
                  name: CATALOG.names[id] || ("item " + id) });
}
function itemName(id) {
  const it = ITEMS.get(id);
  return it ? it.name : "item " + id;
}

/* ------------------------------------------------------------ estado */
const state = {
  w: 21, h: 13,
  cells: {},            // "x,y" -> {g: 0, items: []}
  spawn: null,          // {x, y}
  mob: new Set(),       // "x,y"
  layer: "g",           // g chao | i itens | z zonas
  tool: "pen",          // pen | rect | erase | pick | move
  zone: "s",            // s jogador | m monstros
  brush: 1,
  selId: 106,           // grass
  zoom: 2,
  showGrid: true,
  showBlock: false,
  undo: [],
  painting: false,
  dragStart: null,      // {x, y} — célula onde começou o arrasto
  dragData: null,       // Map "dx,dy" -> {cell, spawn, mob} — dados das células arrastadas
  dragOffset: null,     // {dx, dy} — deslocamento atual do arrasto
  rectStart: null,
  rectNow: null,
  hover: null,
};

/* ------------------------------------------------------------ atlas */
const atlases = [];
function loadAtlases(cb) {
  let left = CATALOG.pages;
  for (let i = 0; i < CATALOG.pages; i++) {
    const img = new Image();
    img.src = "data/atlas_" + i + ".png";
    img.onload = () => { if (--left === 0) cb(); };
    img.onerror = () => { if (--left === 0) cb(); };
    atlases.push(img);
  }
}
const externalTiles = {};
/* Cache de PNGs em assets/tiles/ — itens que o atlas 32x32 nao cobre
 * (exercise dummies 64x64, monstros, etc). Carrega sob demanda e reusa. */
function loadExternalTile(id) {
  if (externalTiles[id] !== undefined) return externalTiles[id];
  const img = new Image();
  img.src = `../assets/tiles/${id}.png`;
  externalTiles[id] = img;
  img.onload = () => render();   // redesenha quando a imagem chega
  // known_tiles pode listar arquivos ainda não exportados. Ao receber 404,
  // volta para o atlas em vez de deixar a maioria da paleta vazia.
  img.onerror = () => { externalTiles[id] = null; render(); };
  return img;
}
function drawItem32(ctx, id, dx, dy, size) {
  const it = ITEMS.get(id);
  if (!it) return;
  /* Se existe PNG em assets/tiles/ (incluindo itens 64x64 como exercise dummies),
   * carrega e desenha a sprite completa no tamanho certo, ancorada no canto
   * inferior direito (convencao do client: item 2x2 ocupa 2 tiles a partir
   * do canto superior esquerdo do tile de referencia). */
  if (KNOWN_SET.has(id)) {
    const img2 = loadExternalTile(id);
    if (img2 && img2.complete && img2.naturalWidth) {
      /* Desenha a sprite ocupando exatamente tw x th células, sem forçar
       * escala de 32x32 — isso corrige sprites 62x62 e tamanhos irregulares. */
      const w = it.tw * size;
      const h = it.th * size;
      ctx.drawImage(img2, dx - (w - size), dy - (h - size), w, h);
      return;
    }
    /* Enquanto carrega, mostra placeholder; após 404 cai no atlas. */
    if (img2) { ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(dx, dy, size, size); return; }
  }
  /* Fallback: atlas 32x32 (apenas para itens sem PNG externo) */
  const img = atlases[it.page];
  if (!img || !img.complete || !img.naturalWidth) return;
  const cx = it.idx % CATALOG.cols;
  const cy = Math.floor(it.idx / CATALOG.cols) % CATALOG.rowsPerPage;
  // Itens multi-tile ocupam vários quadrados consecutivos no atlas. Recorta
  // a área completa e ancora a base no tile de referência, como o OTClient.
  const sw = 32 * (it.tw || 1), sh = 32 * (it.th || 1);
  const dw = size * (it.tw || 1), dh = size * (it.th || 1);
  ctx.drawImage(img, cx * 32, cy * 32, sw, sh,
                dx - (dw - size), dy - (dh - size), dw, dh);
}

/* ------------------------------------------------------------ canvas */
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

function cellPx() { return 32 * state.zoom; }
function padPx() { return PAD * cellPx(); }
/* Exposto para o rme-anim.js (animacao das sprites no editor). */
window.__rmeState = state;
window.__rmeCellPx = cellPx;
window.__rmePadPx = padPx;
window.__rmeAfterRender = window.__rmeAfterRender || function () {};
/* Padding extra para itens grandes (2x2, 2x1, etc.) não cortarem nas bordas.
 * No Tibia, o tile de referência é o inferior-direito, então um item 2x2
 * estende 1 tile acima e 1 à esquerda. */
const PAD = 1;  // 1 tile de padding em cada direção
function resizeCanvas() {
  const S = cellPx();
  cv.width = (state.w + PAD * 2) * S;
  cv.height = (state.h + PAD * 2) * S;
}

function cellBlocked(x, y) {
  const c = state.cells[x + "," + y];
  if (!c || !c.g) return true;
  const g = ITEMS.get(c.g);
  if (!g || !g.w) return true;
  for (const id of c.items) {
    const it = ITEMS.get(id);
    if (it && it.b) return true;
  }
  return false;
}

function render() {
  const S = cellPx();
  const PS = PAD * S;  // padding em pixels
  ctx.clearRect(0, 0, cv.width, cv.height);
  // fundo xadrez (celulas vazias) — com offset de padding
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      if ((x + y) % 2) { ctx.fillStyle = "#14120e"; }
      else { ctx.fillStyle = "#0d0c0a"; }
      ctx.fillRect(PS + x * S, PS + y * S, S, S);
      const c = state.cells[x + "," + y];
      if (!c) continue;
      if (c.g) drawItem32(ctx, c.g, PS + x * S, PS + y * S, S);
      for (let i = 0; i < c.items.length; i++)
        drawItem32(ctx, c.items[i], PS + x * S, PS + y * S, S);
    }
  }
  // colisao
  if (state.showBlock) {
    ctx.fillStyle = "rgba(220,40,40,.24)";
    for (let y = 0; y < state.h; y++)
      for (let x = 0; x < state.w; x++)
        if (cellBlocked(x, y)) ctx.fillRect(PS + x * S, PS + y * S, S, S);
  }
  // zonas
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (state.spawn) {
    zoneCell(state.spawn.x, state.spawn.y, "S", "#6ab0ff");
  }
  for (const key of state.mob) {
    const [x, y] = key.split(",").map(Number);
    zoneCell(x, y, "G", "#ff7a7a");
  }
  // retangulo em curso
  if (state.rectStart && state.rectNow) {
    const [x0, y0, x1, y1] = rectBounds(state.rectStart, state.rectNow);
    ctx.strokeStyle = "rgba(255,215,94,.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(PS + x0 * S + 1, PS + y0 * S + 1, (x1 - x0 + 1) * S - 2,
                   (y1 - y0 + 1) * S - 2);
  }
  // grade
  if (state.showGrid) {
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.w; x++) {
      ctx.beginPath(); ctx.moveTo(PS + x * S + .5, 0); ctx.lineTo(PS + x * S + .5, cv.height); ctx.stroke();
    }
    for (let y = 0; y <= state.h; y++) {
      ctx.beginPath(); ctx.moveTo(0, PS + y * S + .5); ctx.lineTo(cv.width, PS + y * S + .5); ctx.stroke();
    }
  }
  // drag preview
  if (state.dragStart && state.dragData && state.dragOffset) {
    const ddx = state.dragOffset.dx;
    const ddy = state.dragOffset.dy;
    // escurece posições originais
    for (const [key, data] of state.dragData) {
      const [ox, oy] = key.split(",").map(Number);
      const sx = state.dragStart.x + ox;
      const sy = state.dragStart.y + oy;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(PS + sx * S, PS + sy * S, S, S);
      // borda tracejada na origem
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,215,94,.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(PS + sx * S + .5, PS + sy * S + .5, S - 1, S - 1);
      ctx.setLineDash([]);
    }
    // desenha células na nova posição (semi-transparente)
    ctx.globalAlpha = 0.75;
    for (const [key, data] of state.dragData) {
      const [ox, oy] = key.split(",").map(Number);
      const nx = state.dragStart.x + ox + ddx;
      const ny = state.dragStart.y + oy + ddy;
      if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
      if (!data.cell) continue;
      if (data.cell.g) drawItem32(ctx, data.cell.g, PS + nx * S, PS + ny * S, S);
      for (const id of data.cell.items) drawItem32(ctx, id, PS + nx * S, PS + ny * S, S);
    }
    ctx.globalAlpha = 1.0;
    // borda de destaque na área de destino
    const allNx = [], allNy = [];
    for (const [key, data] of state.dragData) {
      const [ox, oy] = key.split(",").map(Number);
      const nx = state.dragStart.x + ox + ddx;
      const ny = state.dragStart.y + oy + ddy;
      if (nx >= 0 && ny >= 0 && nx < state.w && ny < state.h) {
        allNx.push(nx); allNy.push(ny);
      }
    }
    if (allNx.length) {
      const minX = Math.min(...allNx), maxX = Math.max(...allNx);
      const minY = Math.min(...allNy), maxY = Math.max(...allNy);
      ctx.strokeStyle = "rgba(106,176,255,.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(PS + minX * S + 1, PS + minY * S + 1,
                     (maxX - minX + 1) * S - 2, (maxY - minY + 1) * S - 2);
    }
  }
  // hover
  if (state.hover) {
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = 1;
    for (let dy = 0; dy < state.brush; dy++)
      for (let dx = 0; dx < state.brush; dx++) {
        const hx = state.hover.x + dx, hy = state.hover.y + dy;
        if (hx < state.w && hy < state.h)
          ctx.strokeRect(PS + hx * S + .5, PS + hy * S + .5, S - 1, S - 1);
      }
  }
  // animacao das sprites (agua, lava, fogo, cristais...) por cima do mapa
  if (typeof window.__rmeAfterRender === "function")
    window.__rmeAfterRender();
}
function zoneCell(x, y, letra, cor) {
  const S = cellPx();
  const PS = PAD * S;
  ctx.strokeStyle = cor;
  ctx.lineWidth = 2;
  ctx.strokeRect(PS + x * S + 2, PS + y * S + 2, S - 4, S - 4);
  ctx.fillStyle = cor;
  ctx.font = `bold ${Math.max(11, S * 0.42)}px Arial`;
  ctx.fillText(letra, PS + x * S + S / 2, PS + y * S + S / 2);
}
function rectBounds(a, b) {
  return [Math.min(a.x, b.x), Math.min(a.y, b.y),
          Math.max(a.x, b.x), Math.max(a.y, b.y)];
}

/* ------------------------------------------------------------ edicao */
function cellAt(x, y, create) {
  const k = x + "," + y;
  if (!state.cells[k] && create) state.cells[k] = { g: 0, items: [] };
  return state.cells[k];
}

function pushUndo() {
  state.undo.push(JSON.stringify({
    cells: state.cells, spawn: state.spawn, mob: [...state.mob],
  }));
  if (state.undo.length > 40) state.undo.shift();
}
function undo() {
  const snap = state.undo.pop();
  if (!snap) return;
  const d = JSON.parse(snap);
  state.cells = d.cells;
  state.spawn = d.spawn;
  state.mob = new Set(d.mob);
  render();
  status("desfeito");
}

function applyPaint(x, y) {
  for (let dy = 0; dy < state.brush; dy++) {
    for (let dx = 0; dx < state.brush; dx++) {
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= state.w || py >= state.h) continue;
      if (state.layer === "z") {
        const k = px + "," + py;
        if (state.zone === "s") state.spawn = { x: px, y: py };
        else if (state.mob.has(k)) { /* mantem */ }
        else state.mob.add(k);
        continue;
      }
      const c = cellAt(px, py, true);
      if (state.layer === "g") c.g = state.selId;
      else if (c.items[c.items.length - 1] !== state.selId)
        c.items.push(state.selId);
    }
  }
}
function applyErase(x, y) {
  for (let dy = 0; dy < state.brush; dy++) {
    for (let dx = 0; dx < state.brush; dx++) {
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= state.w || py >= state.h) continue;
      if (state.layer === "z") {
        const k = px + "," + py;
        if (state.spawn && state.spawn.x === px && state.spawn.y === py)
          state.spawn = null;
        state.mob.delete(k);
        continue;
      }
      const c = cellAt(px, py, false);
      if (!c) continue;
      if (state.layer === "g") c.g = 0;
      else c.items.pop();
      if (!c.g && !c.items.length) delete state.cells[px + "," + py];
    }
  }
}
function applyRect(a, b) {
  const [x0, y0, x1, y1] = rectBounds(a, b);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) applyPaint(x, y);
}

function canvasCell(e) {
  const r = cv.getBoundingClientRect();
  const S = cellPx();
  const PS = PAD * S;
  return {
    x: Math.floor((e.clientX - r.left - PS) / S),
    y: Math.floor((e.clientY - r.top - PS) / S),
  };
}

cv.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const c = canvasCell(e);
  if (c.x < 0 || c.y < 0 || c.x >= state.w || c.y >= state.h) return;
  if (state.tool === "pick") {
    const cell = cellAt(c.x, c.y, false);
    if (cell) {
      const id = state.layer === "i"
        ? (cell.items[cell.items.length - 1] || cell.g) : cell.g;
      if (id) { selectItem(id); status(`pegou ${id} (${itemName(id)})`); }
    } else status("celula vazia");
    return;
  }
  if (state.tool === "move") {
    /* Inicia o arrasto: captura as células sob o pincel */
    state.dragStart = c;
    state.dragData = new Map();
    state.dragOffset = { dx: 0, dy: 0 };
    for (let dy = 0; dy < state.brush; dy++) {
      for (let dx = 0; dx < state.brush; dx++) {
        const px = c.x + dx, py = c.y + dy;
        if (px < 0 || py < 0 || px >= state.w || py >= state.h) continue;
        const cell = cellAt(px, py, false);
        state.dragData.set(dx + "," + dy, {
          cell: cell ? JSON.parse(JSON.stringify(cell)) : null,
          spawn: state.spawn && state.spawn.x === px && state.spawn.y === py,
          mob: state.mob.has(px + "," + py),
        });
      }
    }
    pushUndo();
    cv.style.cursor = "grabbing";
    render();
    return;
  }
  cv.setPointerCapture(e.pointerId);
  state.painting = true;
  pushUndo();
  if (state.tool === "rect") {
    state.rectStart = c; state.rectNow = c;
  } else if (state.tool === "erase") {
    applyErase(c.x, c.y);
  } else {
    applyPaint(c.x, c.y);
  }
  render();
});
cv.addEventListener("pointermove", (e) => {
  const c = canvasCell(e);
  state.hover = c;
  if (state.tool === "move" && state.dragStart) {
    state.dragOffset = {
      dx: c.x - state.dragStart.x,
      dy: c.y - state.dragStart.y,
    };
    render();
    showCellInfo(c);
    return;
  }
  if (state.painting) {
    if (state.tool === "rect") state.rectNow = c;
    else if (state.tool === "erase") applyErase(c.x, c.y);
    else applyPaint(c.x, c.y);
  }
  render();
  showCellInfo(c);
});
cv.addEventListener("pointerup", (e) => {
  if (state.tool === "move" && state.dragStart) {
    const ddx = state.dragOffset.dx;
    const ddy = state.dragOffset.dy;
    if (ddx !== 0 || ddy !== 0) {
      /* Salva o conteúdo que estava no destino (para swap) */
      const destCells = new Map();
      for (const [key, data] of state.dragData) {
        const [ox, oy] = key.split(",").map(Number);
        const nx = state.dragStart.x + ox + ddx;
        const ny = state.dragStart.y + oy + ddy;
        if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
        const dKey = nx + "," + ny;
        if (!destCells.has(dKey)) {
          const dc = cellAt(nx, ny, false);
          destCells.set(dKey, {
            cell: dc ? JSON.parse(JSON.stringify(dc)) : null,
            spawn: state.spawn && state.spawn.x === nx && state.spawn.y === ny,
            mob: state.mob.has(nx + "," + ny),
          });
        }
      }
      /* Limpa posições originais */
      for (const [key, data] of state.dragData) {
        const [ox, oy] = key.split(",").map(Number);
        const sx = state.dragStart.x + ox;
        const sy = state.dragStart.y + oy;
        delete state.cells[sx + "," + sy];
        if (data.spawn) state.spawn = null;
        if (data.mob) state.mob.delete(sx + "," + sy);
      }
      /* Coloca o conteúdo arrastado no destino */
      for (const [key, data] of state.dragData) {
        const [ox, oy] = key.split(",").map(Number);
        const nx = state.dragStart.x + ox + ddx;
        const ny = state.dragStart.y + oy + ddy;
        if (nx < 0 || ny < 0 || nx >= state.w || ny >= state.h) continue;
        if (data.cell) state.cells[nx + "," + ny] = data.cell;
        if (data.spawn) state.spawn = { x: nx, y: ny };
        if (data.mob) state.mob.add(nx + "," + ny);
      }
      /* Coloca o conteúdo do destino nas posições originais (swap) */
      let i = 0;
      for (const [key, data] of state.dragData) {
        const [ox, oy] = key.split(",").map(Number);
        const nx = state.dragStart.x + ox + ddx;
        const ny = state.dragStart.y + oy + ddy;
        const dKey = nx + "," + ny;
        const dest = destCells.get(dKey);
        if (!dest) continue;
        const sx = state.dragStart.x + ox;
        const sy = state.dragStart.y + oy;
        if (sx < 0 || sy < 0 || sx >= state.w || sy >= state.h) continue;
        /* Não sobrescreve se a origem já recebeu conteúdo do arrasto */
        if (!state.cells[sx + "," + sy] && dest.cell) {
          state.cells[sx + "," + sy] = dest.cell;
        }
        if (dest.spawn) state.spawn = { x: sx, y: sy };
        if (dest.mob) state.mob.add(sx + "," + sy);
      }
      status(`movido ${state.dragData.size} SQM (${ddx > 0 ? "+" : ""}${ddx}, ${ddy > 0 ? "+" : ""}${ddy})`);
    }
    state.dragStart = null;
    state.dragData = null;
    state.dragOffset = null;
    cv.style.cursor = "grab";
    render();
    autoSaveSchedule();
    return;
  }
  if (state.painting && state.tool === "rect" && state.rectStart && state.rectNow) {
    applyRect(state.rectStart, state.rectNow);
  }
  state.painting = false;
  state.rectStart = state.rectNow = null;
  render();
});
cv.addEventListener("pointerleave", () => {
  state.hover = null;
  /* Se estava arrastando, cancela o move sem aplicar */
  if (state.dragStart) {
    state.dragStart = null;
    state.dragData = null;
    state.dragOffset = null;
    cv.style.cursor = "grab";
    /* Desfaz o undo que foi empilhado no pointerdown do move */
    state.undo.pop();
  }
  render();
});
cv.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  }
});

/* ------------------------------------------------------------ status */
const statusEl = document.getElementById("status");
function status(t) { statusEl.textContent = t; }
function fmtFlags(id) {
  const it = ITEMS.get(id);
  if (!it) return "?";
  if (it.g) return it.w ? "chão andável" : "chão bloqueado";
  return it.b ? "bloqueia" : "decoração";
}
function showCellInfo(c) {
  const el = document.getElementById("cell-detail");
  if (!c || c.x < 0 || c.y < 0 || c.x >= state.w || c.y >= state.h) {
    el.textContent = "—";
    return;
  }
  const cell = cellAt(c.x, c.y, false);
  const partes = [`(${c.x},${c.y})`];
  if (state.spawn && state.spawn.x === c.x && state.spawn.y === c.y) partes.push("<b>S jogador</b>");
  if (state.mob.has(c.x + "," + c.y)) partes.push("<b>G monstros</b>");
  if (!cell) partes.push('<span class="bad">vazio — bloqueia</span>');
  else {
    partes.push(`chão <b>${cell.g || "—"}</b>`);
    if (cell.items.length) partes.push(`itens <b>${cell.items.join(", ")}</b>`);
    partes.push(cellBlocked(c.x, c.y) ? '<span class="bad">bloqueada</span>' : "andável");
  }
  el.innerHTML = partes.join(" · ");
}

/* ------------------------------------------------------------ paleta */
const palList = document.getElementById("pal-list");
const palInner = document.getElementById("pal-inner");
const ROW_H = 36;
let palFiltrada = [];
const ROWS_POOL = [];

function filtrarPalette() {
  const q = document.getElementById("pal-search").value.trim().toLowerCase();
  const f = document.getElementById("pal-filter").value;
  palFiltrada = [];
  for (const entry of CATALOG.entries) {
    const id = entry[0], w = entry[1], b = entry[2], g = entry[3];
    if (f === "gw" && !(g && w)) continue;
    if (f === "gb" && !(g && !w)) continue;
    if (f === "wall" && !(!g && b)) continue;
    if (f === "deco" && !(!g && !b)) continue;
    if (q) {
      const nm = (CATALOG.names[id] || "").toLowerCase();
      if (!nm.includes(q) && String(id).indexOf(q) !== 0) continue;
    }
    palFiltrada.push(id);
    if (q && palFiltrada.length >= 2000) break;  // busca limitada
  }
  palInner.style.height = palFiltrada.length * ROW_H + "px";
  document.getElementById("pal-foot").textContent =
    palFiltrada.length.toLocaleString("pt-BR") + " itens (" +
    CATALOG.entries.length.toLocaleString("pt-BR") + " no catálogo)";
  renderPalRows();
}

function palRowEl(i) {
  let el = ROWS_POOL[i];
  if (el) return el;
  el = document.createElement("div");
  el.className = "pal-row";
  el.innerHTML = `<span class="pal-icon"></span>
    <div class="pal-meta"><div class="pal-name"></div><div class="pal-flags"></div></div>`;
  el.addEventListener("click", () => selectItem(+el.dataset.id));
  ROWS_POOL.push(el);
  return el;
}
function renderPalRows() {
  const top = palList.scrollTop;
  const h = palList.clientHeight || 400;
  const i0 = Math.max(0, Math.floor(top / ROW_H) - 2);
  const i1 = Math.min(palFiltrada.length, Math.ceil((top + h) / ROW_H) + 2);
  // remove sobras
  while (palInner.firstChild) palInner.removeChild(palInner.firstChild);
  for (let i = i0; i < i1; i++) {
    const id = palFiltrada[i];
    const it = ITEMS.get(id);
    const el = palRowEl(i - i0);
    el.style.top = i * ROW_H + "px";
    el.style.position = "absolute";
    el.dataset.id = id;
    el.classList.toggle("sel", id === state.selId);
    el.querySelector(".pal-name").textContent = `${id} · ${it.name}`;
    const tw = it.tw || 1, th = it.th || 1;
    const sizeStr = (tw > 1 || th > 1) ? ` <span class="b">${tw}×${th}</span>` : "";
    el.querySelector(".pal-flags").innerHTML =
      it.g ? (it.w ? '<span class="w">chão</span>' : '<span class="b">chão trava</span>') + sizeStr
           : (it.b ? '<span class="b">parede</span>' : "deco") + sizeStr;
    const ic = el.querySelector(".pal-icon");
    // A linha é reciclada pela virtualização: limpe o estado da animação do
    // item anterior. Sem isso um sprite animado continuava tentando pintar
    // em cima do próximo item quando a paleta era rolada muito rápido.
    delete ic.dataset.anim;
    delete ic.dataset.fr;
    // A paleta usa sempre o atlas completo: known_tiles contém ids do DAT
    // que ainda não possuem PNG individual e apontá-los direto deixava a
    // lista em branco. PNG externo fica reservado ao canvas do mapa.
    const cx = it.idx % CATALOG.cols;
    const cy = Math.floor(it.idx / CATALOG.cols) % CATALOG.rowsPerPage;
    // A miniatura mostra o sprite INTEIRO: um 2x2 é reduzido para caber no
    // ícone, em vez de exibir apenas seu quadrante superior esquerdo.
    const scale = 32 / Math.max(it.tw || 1, it.th || 1);
    ic.style.backgroundImage = `url(data/atlas_${it.page}.png)`;
    ic.style.backgroundPosition = `-${cx * 32 * scale}px -${cy * 32 * scale}px`;
    ic.style.backgroundSize = `${CATALOG.cols * 32 * scale}px ${CATALOG.rowsPerPage * 32 * scale}px`;
    if (!el.parentNode) palInner.appendChild(el);
  }
  // Solicita uma atualização única das animações para as linhas recém
  // recicladas; não força trabalho a cada evento bruto de scroll.
  if (typeof window.__rmeRefreshPaletteAnims === "function") window.__rmeRefreshPaletteAnims();
}
let palScrollRaf = 0;
palList.addEventListener("scroll", () => {
  if (palScrollRaf) return;
  palScrollRaf = requestAnimationFrame(() => { palScrollRaf = 0; renderPalRows(); });
}, { passive: true });

function selectItem(id) {
  if (!ITEMS.has(id)) return;
  state.selId = id;
  const it = ITEMS.get(id);
  document.getElementById("sel-item").innerHTML =
    `selecionado: <b>${id}</b> · ${it.name} <span class="dim">(${fmtFlags(id)})</span>`;
  // troca a camada se fizer sentido: piso na camada chao, resto em itens
  if (state.layer !== "z") setLayer(it.g && state.layer === "g" ? "g" :
                                    it.g ? "g" : "i");
  renderPalRows();
}

/* ------------------------------------------------------------ toolbar */
function setLayer(l) {
  state.layer = l;
  document.querySelectorAll("#grp-layer button").forEach((b) =>
    b.classList.toggle("sel", b.dataset.layer === l));
}
document.querySelectorAll("#grp-layer button").forEach((b) =>
  b.addEventListener("click", () => setLayer(b.dataset.layer)));
document.querySelectorAll("#grp-tool button").forEach((b) =>
  b.addEventListener("click", () => {
    state.tool = b.dataset.tool;
    document.querySelectorAll("#grp-tool button").forEach((x) =>
      x.classList.toggle("sel", x === b));
    cv.style.cursor = state.tool === "move" ? "grab" : "crosshair";
  }));
document.querySelectorAll("#grp-zone button").forEach((b) =>
  b.addEventListener("click", () => {
    state.zone = b.dataset.zone;
    document.querySelectorAll("#grp-zone button").forEach((x) =>
      x.classList.toggle("sel", x === b));
  }));
document.getElementById("brush-size").addEventListener("change", (e) => {
  state.brush = +e.target.value;
});
document.getElementById("tgl-grid").addEventListener("change", (e) => {
  state.showGrid = e.target.checked; render();
});
document.getElementById("tgl-block").addEventListener("change", (e) => {
  state.showBlock = e.target.checked; render();
});
document.getElementById("btn-zoom-in").addEventListener("click", () => setZoom(state.zoom * 1.25));
document.getElementById("btn-zoom-out").addEventListener("click", () => setZoom(state.zoom / 1.25));
function setZoom(z) {
  state.zoom = Math.max(0.5, Math.min(4, z));
  document.getElementById("zoom-label").textContent = state.zoom.toFixed(1) + "x";
  resizeCanvas();
  render();
}
document.getElementById("btn-undo").addEventListener("click", undo);
document.getElementById("btn-clear").addEventListener("click", () => {
  if (!confirm("Apagar o mapa inteiro?")) return;
  pushUndo();
  state.cells = {};
  state.spawn = null;
  state.mob.clear();
  render();
  status("mapa limpo");
});
document.getElementById("btn-resize").addEventListener("click", () => {
  const w = Math.max(8, Math.min(64, +document.getElementById("map-w").value || 21));
  const h = Math.max(8, Math.min(40, +document.getElementById("map-h").value || 13));
  if (w === state.w && h === state.h) return;
  if (!confirm(`Redimensionar para ${w}×${h}? O conteúdo fora da nova área é removido.`)) return;
  pushUndo();
  state.w = w; state.h = h;
  for (const k of Object.keys(state.cells)) {
    const [x, y] = k.split(",").map(Number);
    if (x >= w || y >= h) delete state.cells[k];
  }
  for (const k of [...state.mob]) {
    const [x, y] = k.split(",").map(Number);
    if (x >= w || y >= h) state.mob.delete(k);
  }
  if (state.spawn && (state.spawn.x >= w || state.spawn.y >= h)) state.spawn = null;
  resizeCanvas();
  render();
  status(`tamanho ${w}×${h}`);
});
document.getElementById("pal-search").addEventListener("input", filtrarPalette);
document.getElementById("pal-filter").addEventListener("change", filtrarPalette);

/* ------------------------------------------------------------ salvar */
function mapModel() {
  return {
    name: (document.getElementById("map-name").value.trim() || "mapa")
      .toLowerCase().replace(SLUG_RE, "_").replace(/^_+|_+$/g, "") || "mapa",
    w: state.w, h: state.h,
    cells: state.cells,
    spawn: state.spawn,
    mob: [...state.mob].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    }),
  };
}
function validarParaSalvar(m) {
  const erros = [];
  let pintadas = 0;
  for (const k in m.cells) {
    const c = m.cells[k];
    if (c.g || (c.items && c.items.length)) pintadas++;
  }
  if (!pintadas) erros.push("o mapa está vazio");
  if (!m.spawn) erros.push("marque o spawn do jogador (camada Zonas, ferramenta S)");
  if (!m.mob.length) erros.push("marque ao menos 1 célula da zona de monstros (G)");
  if (m.spawn && cellBlocked(m.spawn.x, m.spawn.y))
    erros.push("o spawn do jogador está numa célula bloqueada");
  return erros;
}

document.getElementById("btn-save").addEventListener("click", () => {
  const m = mapModel();
  const erros = validarParaSalvar(m);
  if (erros.length) {
    openModal("Não dá para salvar",
      "<p>Resolva antes:</p><ul><li>" + erros.join("</li><li>") + "</li></ul>");
    return;
  }
  const buf = OTBM.write(m);
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = m.name + ".otbm";
  a.click();
  URL.revokeObjectURL(a.href);
  status(`baixado ${m.name}.otbm (${(buf.byteLength / 1024).toFixed(1)} KB)`);
  // avisa das sprites que o jogo ainda nao tem
  const lidos = OTBM.read(buf);
  const falta = OTBM.missingTiles(lidos, KNOWN);
  setTimeout(() => avisarFaltantes(falta, m.name), 250);
});

function avisarFaltantes(falta, nome) {
  if (!falta.length) {
    status(`baixado ${nome}.otbm — todas as sprites já existem no jogo`);
    return;
  }
  openModal("Sprites que o jogo ainda NÃO tem",
    `<p>O mapa usa <b>${falta.length}</b> id(s) sem PNG em
     <code>game/assets/tiles/</code> (eles apareceriam como buracos).
     Depois de copiar <code>${nome}.otbm</code> para
     <code>game/maps/</code>, rode:</p>
     <p><code>python3 tools/import_otbm_sprites.py game/maps/${nome}.otbm</code></p>
     <p>Ele extrai os PNGs do client 8.60 automaticamente.</p>
     <div class="id-list">` +
    falta.map((id) => `<span class="id-chip">${id} · ${itemName(id)}</span>`).join("") +
    `</div>`);
}

document.getElementById("btn-check").addEventListener("click", () => {
  const m = mapModel();
  const falta = OTBM.missingTiles(
    { cells: m.cells }, KNOWN);
  if (!falta.length)
    openModal("Verificar sprites",
      "<p>Todos os ids usados no mapa já existem em " +
      "<code>game/assets/tiles/</code>. Pode salvar tranquilo.</p>");
  else avisarFaltantes(falta, m.name);
});

/* ------------------------------------------------------------ modal */
function openModal(title, html) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-bg").classList.add("show");
}
function closeModal() {
  document.getElementById("modal-bg").classList.remove("show");
}
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-ok").addEventListener("click", closeModal);

/* ------------------------------------------------------------ boot */
loadAtlases(() => {
  resizeCanvas();
  filtrarPalette();
  selectItem(106);
  render();
  status(`catálogo: ${CATALOG.entries.length.toLocaleString("pt-BR")} itens · ` +
         `${KNOWN.length} sprites já existem no jogo`);
  // Auto-save: carrega o último mapa salvo no localStorage
  autoSaveLoad();
});


/* ------------------------------------------------------------ Abrir Mapa */
document.getElementById("btn-open-map").addEventListener("click", () => {
  document.getElementById("file-open-map").click();
});

document.getElementById("file-open-map").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const mapData = OTBM.read(ev.target.result);
      state.w = mapData.w || 21;
      state.h = mapData.h || 13;
      document.getElementById("map-w").value = state.w;
      document.getElementById("map-h").value = state.h;
      if(mapData.name) document.getElementById("map-name").value = mapData.name;
      state.cells = mapData.cells || {};
      state.spawn = mapData.spawn;
      state.mob = new Set(mapData.mob ? mapData.mob.map(m => m.x + "," + m.y) : []);
      resizeCanvas();
      render();
      e.target.value = "";
    } catch(err) {
      alert("Erro ao abrir .otbm: " + err);
    }
  };
  reader.readAsArrayBuffer(file);
});

/* ------------------------------------------------------------ Auto-Save */
const AUTO_SAVE_KEY = "oti_rme_autosave";
const AUTO_SAVE_MS = 3000;  // salva a cada 3s de inatividade
let autoSaveTimer = null;

function autoSaveGet() {
  try { return JSON.parse(localStorage.getItem(AUTO_SAVE_KEY)); } catch { return null; }
}
function autoSaveNow() {
  const m = mapModel();
  const data = { ...m, cells: state.cells, spawn: state.spawn,
                 mob: [...state.mob], ts: Date.now() };
  try { localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data)); } catch {}
  status("💾 auto-salvo");
}
function autoSaveSchedule() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(autoSaveNow, AUTO_SAVE_MS);
}
function autoSaveLoad() {
  const saved = autoSaveGet();
  if (!saved || !saved.cells) return;
  // Pergunta se quer restaurar
  const ago = Math.round((Date.now() - (saved.ts || 0)) / 1000);
  const timeStr = ago < 60 ? `${ago}s` : `${Math.round(ago/60)}min`;
  if (!confirm(`Restaurar mapa auto-salvo (${timeStr} atrás, "${saved.name || "mapa"}")?`)) return;
  state.w = saved.w || 21;
  state.h = saved.h || 13;
  document.getElementById("map-w").value = state.w;
  document.getElementById("map-h").value = state.h;
  if (saved.name) document.getElementById("map-name").value = saved.name;
  state.cells = saved.cells;
  state.spawn = saved.spawn;
  state.mob = new Set(saved.mob ? saved.mob.map(m => m.x + "," + m.y) : []);
  resizeCanvas();
  render();
  status("mapa restaurado do auto-save");
}

// Hook: agenda auto-save a cada edição (delegado ao wrapper, sem redefinir função)
const _origApplyPaint = applyPaint;
const _origApplyErase = applyErase;
// Não usamos `function applyPaint` de novo — hoisting causaria recursão infinita.
// Em vez disso, sobrescrevemos a variável no escopo do módulo:
applyPaint = function(x, y) { _origApplyPaint(x, y); autoSaveSchedule(); };
applyErase = function(x, y) { _origApplyErase(x, y); autoSaveSchedule(); };

// Ctrl+S salva manualmente (download + auto-save)
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    autoSaveNow();
    document.getElementById("btn-save").click();
  }
});
