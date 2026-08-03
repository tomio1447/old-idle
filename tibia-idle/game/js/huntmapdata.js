/*
 * huntmapdata.js — mapas fechados das hunts (cenario real, com colisao).
 *
 * Cada mapa e uma grade de caracteres do tamanho exato da arena de combate
 * (GRID_W x GRID_H). A legenda liga cada caractere aos tiles oficiais
 * extraidos do client 8.60 (game/assets/tiles/<id>.png, ids confirmados no
 * items.xml do Canary) e diz se a celula BLOQUEIA movimento.
 *
 * Regra de dados: ids/names vem do Canary items.xml; o DESENHO do mapa e
 * decisao de design nossa (o Canary guarda os mapas em .otbm binario, sem
 * formato texto publico — N/A para copiar o layout 1:1).
 */
"use strict";

const HUNTMAPS = {

  /* Esgoto de Rookgaard — sala fechada: muralha de pedra em todo o
   * perimetro, pilares de sustentacao no meio, lama toxica (swamp 6352)
   * bloqueando o centro e uma ponte levadica de madeira (1771) unindo os
   * lados. S = spawn do jogador, G = zona dos monstros. */
  "rook-sewer": {
    nome: "Esgoto de Rookgaard",
    rows: [
      "#####################",
      "#....+.........+....#",
      "#....+..~~~~~..+....#",
      "#.......~~~~~.......#",
      "#..++...~~=~~...++..#",
      "#..+....~~=~~....+..#",
      "#..+..S.~~=~~.G..+..#",
      "#..+....~~=~~....+..#",
      "#..++...~~=~~...++..#",
      "#.......~~~~~.......#",
      "#....+..~~~~~..+....#",
      "#....+.........+....#",
      "#####################",
    ],
    leg: {
      /* chao de terra do esgoto — variantes oficiais 351/353/431/355 */
      ".": { v: [351, 353, 431, 355] },
      "S": { v: [351] },
      "G": { v: [351] },
      /* muralha de pedra fechando a sala (stone wall 5647, bloco cheio) */
      "#": { v: [5647], bloc: true },
      /* pilar de sustentacao (stone pillar 2152) */
      "+": { v: [2152], bloc: true },
      /* lama toxica: swamp oficial (6352/8716 variados por celula) */
      "~": { v: [6352, 8716], bloc: true },
      /* ponte levadica de madeira (drawbridge 1771) por cima da lama */
      "=": { v: [6352, 8716], g: [1771] },
    },
    /* decor posicionada a mao: [tileId, cx, cy] — nao bloqueia */
    deco: [
      [2050, 2, 1],  [2050, 18, 1],           // tochas na entrada norte
      [2050, 2, 11], [2050, 18, 11],          // tochas na saida sul
      [435, 1, 6],   [435, 19, 6],            // ralos do esgoto
      [3132, 3, 8],  [3132, 17, 4],           // pilhas de lixo
      [4254, 12, 3], [4271, 9, 9],            // ossadas
      [3114, 14, 5],                          // cranio
      [3913, 7, 4],  [3913, 13, 8],           // cogumelos na umidade
      [3688, 7, 3],  [3688, 13, 9],           // juncos na beira da lama
      [1066, 3, 3],  [1066, 17, 9],           // manchas de lama
      [5103, 10, 0],                          // grade fechada no muro norte
      [428, 4, 6],                            // escada da entrada (ao lado do S)
    ],
  },

  /* Amazon Camp (Amazon + Valkyrie) — acampamento florestal fechado com
   * árvores ao redor, paliçadas de madeira e tendas no centro.
   * S = spawn do jogador, G = zona das amazons/valkyries. */
  "amazon-camp": {
    nome: "Amazon Camp",
    rows: [
      "#####################",
      "#...................#",
      "#.T..T...+++...T..T.#",
      "#........+^+........#",
      "#........+++........#",
      "#...T...........T...#",
      "#..S..T......G..T...#",
      "#...T.....*.....T...#",
      "#........+++........#",
      "#........+^+........#",
      "#.T..T...+++...T..T.#",
      "#...................#",
      "#####################",
    ],
    leg: {
      ".": { v: [293, 106] },
      "S": { v: [293] },
      "G": { v: [293] },
      "#": { v: [7761, 2704], bloc: true },
      "T": { v: [2704], bloc: true },
      "+": { v: [4487, 4465], bloc: true },
      "^": { v: [293], g: [171], bloc: true },
      "*": { v: [293], g: [398], bloc: true },
    },
    deco: [
      [9997, 8, 5],  [9997, 12, 5],           // caixas perto das tendas
      [3674, 10, 8],                          // tocha do acampamento
      [2921, 6, 6],  [2921, 14, 6],           // detalhes de capim
    ],
  },
};

/* Liga o mapa a hunt — patch de dados, sem tocar no gamedata.js gerado.
 * "rats" e a hunt "Esgoto de Rookgaard" (cena sewer).
 * Usa o .otbm gerado pelo build_rookgaard_sewers.py (mapa real com
 * tiles do DAT 8.60). Se o .otbm falhar, cai no "rook-sewer" textual. */
if (typeof GAMEDATA !== "undefined" && GAMEDATA.hunts && GAMEDATA.hunts.rats) {
  GAMEDATA.hunts.rats.mapa = "rook-sewer";
  GAMEDATA.hunts.rats.otbm = "rookgaard_sewers";
}
if (typeof GAMEDATA !== "undefined" && GAMEDATA.hunts && GAMEDATA.hunts["amazon-camp"])
  GAMEDATA.hunts["amazon-camp"].mapa = "amazon-camp";

/* Consulta de colisao do mapa (usada pelo grid.js) */
function huntMapBlocked(map, cx, cy) {
  if (!map || cy < 0 || cy >= map.rows.length) return false;
  const row = map.rows[cy];
  if (cx < 0 || cx >= row.length) return true;
  const L = map.leg[row[cx]];
  return !!(L && L.bloc);
}
