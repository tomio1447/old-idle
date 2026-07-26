/*
 * citymap.js — mapa da Cidade de Thais em grade de tiles (32px).
 * O mundo e maior que a tela; a camera segue o personagem.
 */
"use strict";

const TILE = 32;
const MAP_W = 34;      // largura em tiles
const MAP_H = 24;      // altura em tiles

/* Tipos de tile para colisao */
const T_FLOOR = 0;     // andavel
const T_BLOCK = 1;     // parede / objeto solido
const T_GRASS = 2;     // grama (andavel)

/* Um predio: retangulo de paredes com telhado e porta */
function Building(x, y, w, h, opts) {
  opts = opts || {};
  return {
    x: x, y: y, w: w, h: h,
    wall: opts.wall || "brick",
    roof: opts.roof || "red",
    door: opts.door !== undefined ? opts.door : Math.floor(w / 2),
    windows: opts.windows !== false,
    label: opts.label || null,
  };
}

/* Layout da cidade: praca central com fonte, predios ao redor */
const BUILDINGS = [
  // fileira norte
  Building(2, 2, 6, 4, { label: "Loja", roof: "red" }),
  Building(10, 2, 6, 4, { label: "Runas & Poções", roof: "wood" }),
  Building(19, 2, 6, 4, { label: "Banco", wall: "marble", roof: "red" }),
  Building(27, 2, 5, 4, { label: "Ferreiro", roof: "wood" }),
  // fileira sul
  Building(2, 17, 6, 5, { label: "Academia", roof: "wood" }),
  Building(11, 18, 7, 4, { label: "Estalagem", roof: "red" }),
  Building(21, 17, 6, 5, { label: "Depot", wall: "marble", roof: "red" }),
  // templo a leste (marmore)
  Building(28, 10, 5, 5, { label: "Templo", wall: "marble", roof: "red" }),
];

/* Pontos de interesse com posicao em TILES (na frente de cada predio) */
const POI = {
  shopkeeper: { tx: 5,  ty: 7,  npc: true },
  magicshop:  { tx: 13, ty: 7,  npc: true },
  banker:     { tx: 22, ty: 7,  npc: true },
  blacksmith: { tx: 29, ty: 7,  npc: true },
  trainer:    { tx: 5,  ty: 16, npc: true },
  innkeeper:  { tx: 14, ty: 17, npc: true },
  priest:     { tx: 27, ty: 13, npc: true },
  captain:    { tx: 24, ty: 16, npc: true },
};

/* Objetos decorativos soltos: [sprite, tx, ty, solido] */
const DECOR = [
  // fonte no centro da praca (2x2)
  ["fountain-a", 15, 11, true], ["fountain-b", 16, 11, true],
  ["fountain-c", 15, 12, true], ["fountain-d", 16, 12, true],
  // depot: baus visiveis na frente do predio
  ["depot", 22, 16, true], ["depot", 23, 16, true],
  ["mailbox", 24, 16, true],
  // altar do templo
  ["altar", 29, 9, true], ["altar-b", 30, 9, true],
  // estatuas ladeando a praca
  ["statue-hero", 12, 9, true], ["statue-angel", 20, 9, true],
  // arvores e arbustos
  ["tree-fir", 1, 9, true], ["tree-fir", 1, 14, true],
  ["tree-magic", 9, 13, true], ["tree-fir", 32, 17, true],
  ["bush", 8, 9, false], ["bush-berry", 19, 14, false],
  ["bush", 25, 12, false], ["bush-berry", 10, 15, false],
  ["flowers", 14, 9, false], ["flowers", 17, 9, false],
  ["flowers", 14, 14, false], ["flowers", 17, 14, false],
  // mobilia de rua
  ["barrel", 9, 6, true], ["crate", 17, 6, true],
  ["barrel", 26, 6, true], ["box", 3, 15, true],
  ["lamp", 12, 11, true], ["lamp", 19, 11, true],
  ["lamp", 12, 12, true], ["lamp", 19, 12, true],
  ["signpost", 16, 15, false],
];

/* Constroi a grade de colisao e a lista de desenho */
function buildCityMap() {
  const grid = new Uint8Array(MAP_W * MAP_H);   // 0 = livre
  const at = (x, y) => y * MAP_W + x;

  // areas de grama: praca central e canteiros das bordas
  const grass = new Uint8Array(MAP_W * MAP_H);
  for (let y = 8; y <= 15; y++)
    for (let x = 1; x <= MAP_W - 2; x++)
      if (y === 8 || y === 15 || x <= 1 || x >= MAP_W - 2) grass[at(x, y)] = 1;

  // bordas do mapa sao solidas
  for (let x = 0; x < MAP_W; x++) {
    grid[at(x, 0)] = T_BLOCK;
    grid[at(x, MAP_H - 1)] = T_BLOCK;
  }
  for (let y = 0; y < MAP_H; y++) {
    grid[at(0, y)] = T_BLOCK;
    grid[at(MAP_W - 1, y)] = T_BLOCK;
  }

  // paredes dos predios (o interior tambem bloqueia: sao fachadas)
  for (const b of BUILDINGS)
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++)
        if (x > 0 && y > 0 && x < MAP_W && y < MAP_H) grid[at(x, y)] = T_BLOCK;

  // decoracao solida
  for (const [, tx, ty, solid] of DECOR)
    if (solid && tx < MAP_W && ty < MAP_H) grid[at(tx, ty)] = T_BLOCK;

  return { grid: grid, grass: grass, at: at };
}

const CITY = buildCityMap();

function isBlocked(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return CITY.grid[ty * MAP_W + tx] === T_BLOCK;
}

/* Converte pixel do mundo -> tile */
function toTile(px, py) {
  return { tx: Math.floor(px / TILE), ty: Math.floor(py / TILE) };
}
