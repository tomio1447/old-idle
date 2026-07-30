/*
 * citymap.js — mapa da Cidade de Thais em grade de tiles (32px), agora com
 * CENARIO REAL: chao, muralha e decoracao sao os tiles oficiais extraidos
 * do client 8.60 (assets/tiles/<id>.png, ids do items.xml do Canary).
 * A cidade e FECHADA: muralha de pedra-sabao em todo o perimetro com dois
 * portoes (norte e sul) — o grid bloqueia a borda inteira, portao incluso.
 * O mundo e maior que a tela; a camera segue o personagem.
 */
"use strict";

const TILE = 32;
const MAP_W = 34;      // largura em tiles
const MAP_H = 24;      // altura em tiles

/* Tipos de tile para colisao */
const T_FLOOR = 0;     // andavel
const T_BLOCK = 1;     // parede / objeto solido

/* Paleta oficial de cenario (ids do items.xml do Canary):
 * 106 grass · 479 stone tile (rua) · 481 stone flooring (praca)
 * 103 dirt (terra batida) · 478 sandstone wall (bloco 2x2, peca principal)
 * 1557 stone archway · 965-970 dark marble
 * 409 white marble floor · 419 wooden floor · 5033/5034 red roof */
const CHAO_GRAMA = [106];
const CHAO_RUA = [479];
const CHAO_PRACA = [481];
const CHAO_TERRA = [103];
const MURO = 478;
const PORTAO = 1557;

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
  Building(19, 2, 6, 4, { label: "Banco", wall: "marble", roof: "flat" }),
  Building(27, 2, 5, 4, { label: "Ferreiro", roof: "wood" }),
  // fileira sul
  Building(2, 17, 6, 5, { label: "Academia", roof: "wood" }),
  Building(11, 18, 7, 4, { label: "Estalagem", roof: "red" }),
  Building(21, 17, 6, 5, { label: "Depot", wall: "marble", roof: "flat" }),
  // templo a leste (marmore)
  Building(28, 10, 5, 5, { label: "Templo", wall: "marble", roof: "flat" }),
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

/* Objetos decorativos soltos: [sprite, tx, ty, solido]
 * sprite NUMERO = tile oficial assets/tiles/<n>.png;
 * sprite TEXTO  = PNG legado em assets/city/<nome>.png. */
const DECOR = [
  // fonte no centro da praca (2x2) — sprites legados
  ["fountain-a", 15, 11, true], ["fountain-b", 16, 11, true],
  ["fountain-c", 15, 12, true], ["fountain-d", 16, 12, true],
  // depot: baus de depot oficiais + caixa de correio
  [3502, 22, 16, true], [3502, 23, 16, true],
  [3501, 24, 16, true],
  // altar do templo — legacy + pilares de marmore oficiais na fachada
  ["altar", 29, 9, true], ["altar-b", 30, 9, true],
  [2153, 28, 15, true], [2153, 32, 15, true],
  // estatuas oficiais ladeando a praca
  [2027, 12, 9, true], [2031, 20, 9, true],
  // arvores e arbustos oficiais
  [3614, 1, 9, true], [3614, 1, 14, true],
  [9587, 9, 13, true], [3614, 32, 17, true],
  [3681, 8, 9, false], [3682, 19, 14, false],
  [3681, 25, 12, false], [3682, 10, 15, false],
  [2981, 14, 9, false], [2981, 17, 9, false],
  [2981, 14, 14, false], [2981, 17, 14, false],
  // mobilia de rua
  ["barrel", 9, 6, true], ["crate", 17, 6, true],
  ["barrel", 26, 6, true], ["box", 3, 15, true],
  [2914, 12, 11, true], [2914, 19, 11, true],
  [2914, 12, 12, true], [2914, 19, 12, true],
  [2967, 16, 15, false],
];

/* Constroi a grade de colisao, o chao (ids) e a muralha perimetral */
function buildCityMap() {
  const grid = new Uint8Array(MAP_W * MAP_H);    // 0 = livre
  const ground = new Uint16Array(MAP_W * MAP_H); // id do tile de chao
  const wall = new Uint16Array(MAP_W * MAP_H);   // id do tile de muralha
  const at = (x, y) => y * MAP_W + x;
  const hv = (x, y) => (x * 31 + y * 17) % 97;   // hash deterministo

  // grama como base de tudo
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      ground[at(x, y)] = CHAO_GRAMA[hv(x, y) % CHAO_GRAMA.length];

  // ruas (stone tile 479): faixa norte (em frente aos predios), faixa
  // central (corredor da praca) e faixa sul
  const rua = (x, y) => { ground[at(x, y)] = CHAO_RUA[hv(x, y) % CHAO_RUA.length]; };
  for (let x = 1; x < MAP_W - 1; x++) {
    rua(x, 6); rua(x, 7); rua(x, 8);          // rua norte
    rua(x, 16); rua(x, 17);                    // rua sul
  }
  // praca central em stone flooring quadriculado (481)
  for (let y = 9; y <= 15; y++)
    for (let x = 11; x <= 22; x++)
      ground[at(x, y)] = CHAO_PRACA[hv(x, y) % CHAO_PRACA.length];
  // acessos norte/sul ate os portoes viram terra batida
  for (let y = 1; y <= 5; y++) for (let x = 15; x <= 18; x++) ground[at(x, y)] = CHAO_TERRA[0];
  for (let y = 18; y <= 22; y++) for (let x = 15; x <= 18; x++) ground[at(x, y)] = CHAO_TERRA[0];

  // bordas do mapa sao solidas + muralha oficial fechando a cidade
  for (let x = 0; x < MAP_W; x++) {
    grid[at(x, 0)] = T_BLOCK;
    grid[at(x, MAP_H - 1)] = T_BLOCK;
    const porta = (x === 16 || x === 17);
    wall[at(x, 0)] = porta ? PORTAO : MURO;
    wall[at(x, MAP_H - 1)] = porta ? PORTAO : MURO;
  }
  for (let y = 0; y < MAP_H; y++) {
    grid[at(0, y)] = T_BLOCK;
    grid[at(MAP_W - 1, y)] = T_BLOCK;
    wall[at(0, y)] = MURO;
    wall[at(MAP_W - 1, y)] = MURO;
  }

  // paredes dos predios (o interior tambem bloqueia: sao fachadas)
  for (const b of BUILDINGS)
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++)
        if (x > 0 && y > 0 && x < MAP_W && y < MAP_H) grid[at(x, y)] = T_BLOCK;

  // decoracao solida
  for (const [, tx, ty, solid] of DECOR)
    if (solid && tx < MAP_W && ty < MAP_H) grid[at(tx, ty)] = T_BLOCK;

  return { grid: grid, ground: ground, wall: wall, at: at };
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
