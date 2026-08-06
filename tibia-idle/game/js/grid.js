/*
 * grid.js — movimento em SQM (tiles), no modelo do Canary.
 *
 * O QUE MUDA EM RELACAO AO ANTIGO
 *
 * Antes cada criatura tinha uma posicao float que deslizava continuamente na
 * direcao do alvo, e um passe de "resolveSQMOccupancy" empurrava quem ficasse
 * sobreposto. Isso produzia tres problemas que nunca fecharam:
 *   - alcance impreciso: a distancia era euclidiana em fracao de tela, entao
 *     "1 SQM" variava conforme o eixo (a grade e 21x13, nao quadrada);
 *   - monstros empilhados: o empurrao era corretivo, nao preventivo;
 *   - todo monstro colava no jogador, porque nao existia targetDistance.
 *
 * Agora cada criatura tem uma CELULA (cx, cy) que e a verdade, e uma posicao
 * de tela interpolada so para desenhar. Nada ocupa a mesma celula, a distancia
 * e de Chebyshev (como no Tibia) e o passo tem duracao, nao velocidade.
 *
 * FONTES (src/ do Canary)
 *   creature.cpp getStepDuration()   duracao do passo e custo da diagonal
 *   creature.hpp updateCalculatedStepSpeed()  formula logaritmica da speed
 *   monster.cpp  getDanceStep()      o "dance" em volta do alvo
 *   monster.cpp  getDistanceStep()   manter distancia / fugir
 *   monster.cpp  canUseAttack()      alcance por Chebyshev
 */
"use strict";

/* Tamanho da arena em SQMs. Mantido igual ao antigo para as cenas e o
 * render nao mudarem de escala. */
const GRID_W = 21;
const GRID_H = 13;

/* Constantes de movimento do Canary */
const SERVER_BEAT = 50;                 // game.hpp: todo passo alinha em 50ms
const WALK_DIAGONAL_EXTRA_COST = 3;     // creature.hpp
const WALK_TARGET_NEARBY_EXTRA_COST = 2;
const GROUND_SPEED = 150;               // creature.cpp: piso padrao
const SPEED_A = 857.36;                 // creature.hpp speedA/B/C
const SPEED_B = 261.29;
const SPEED_C = -4795.01;

/* Velocidade -> "passos por unidade", pela formula logaritmica do servidor.
 * E ela que faz 220 de speed nao ser o dobro de 110: o ganho e decrescente. */
function calculatedStepSpeed(speed) {
  if (speed <= -SPEED_B) return 1;
  const f = Math.floor(SPEED_A * Math.log(speed + SPEED_B) + SPEED_C + 0.5);
  return Math.max(1, f);
}

/* Duracao de UM passo, em ms.
 *
 * duration = 1000 * groundSpeed / stepSpeed, arredondado para cima no beat
 * de 50ms. Diagonal custa 3x; monstro com alvo colado custa 2x (e o que
 * impede a horda de grudar sem dar espaco de reacao).
 */
function stepDuration(speed, diagonal, alvoPerto) {
  const base = Math.floor(1000 * GROUND_SPEED / calculatedStepSpeed(speed));
  let d = Math.ceil(base / SERVER_BEAT) * SERVER_BEAT;
  if (diagonal) d *= WALK_DIAGONAL_EXTRA_COST;
  else if (alvoPerto) d *= WALK_TARGET_NEARBY_EXTRA_COST;
  return d;
}

/* Distancia em SQM. O Tibia usa Chebyshev: a diagonal custa 1, nao 1.41.
 * E por isso que um monstro na diagonal esta "colado" para efeito de melee. */
function sqmDistance(a, b) {
  return Math.max(Math.abs((a.cx || 0) - (b.cx || 0)),
                  Math.abs((a.cy || 0) - (b.cy || 0)));
}

function sameCell(a, b) {
  return a && b && a.cx === b.cx && a.cy === b.cy;
}

function inBounds(cx, cy) {
  return cx >= 0 && cy >= 0 && cx < GRID_W && cy < GRID_H;
}

/* As 8 direcoes, na ordem do enum do servidor */
const DIRS = [
  { d: "n",  dx: 0,  dy: -1, diag: false },
  { d: "e",  dx: 1,  dy: 0,  diag: false },
  { d: "s",  dx: 0,  dy: 1,  diag: false },
  { d: "w",  dx: -1, dy: 0,  diag: false },
  { d: "ne", dx: 1,  dy: -1, diag: true },
  { d: "se", dx: 1,  dy: 1,  diag: true },
  { d: "sw", dx: -1, dy: 1,  diag: true },
  { d: "nw", dx: -1, dy: -1, diag: true },
];

/* Direcao "olhando para": diagonal nao existe em sprite, entao cai no eixo
 * dominante, como o client faz. */
function dirTo(from, to) {
  const dx = (to.cx || 0) - (from.cx || 0);
  const dy = (to.cy || 0) - (from.cy || 0);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "e" : "w";
  if (dy !== 0) return dy > 0 ? "s" : "n";
  return dx >= 0 ? "e" : "w";
}

/* --------------------------------------------------------- ocupacao */

/* Mapa das celulas ocupadas. No Tibia duas criaturas nao dividem tile --
 * essa e a regra que faz o "corpo" existir e a hitbox ser real. */
/* Celulas fixas bloqueadas pelo mapa da hunt (paredes/agua do HUNTMAPS).
 * Cacheado no combate — o mapa nao muda durante a luta. */
function mapBlockKeys(c) {
  if (!c._mapBlockKeys) {
    const keys = [];
    if (c.huntMap && typeof huntMapBlocked === "function")
      for (let y = 0; y < c.huntMap.rows.length; y++)
        for (let x = 0; x < c.huntMap.rows[y].length; x++)
          if (huntMapBlocked(c.huntMap, x, y)) keys.push(x + ":" + y);
    c._mapBlockKeys = keys;
  }
  return c._mapBlockKeys;
}

function buildOccupancy(c, ignorar) {
  const occ = new Map();
  /* o mapa entra como ocupacao fixa: spawn, passo, dance e A* passam a
   * respeitar paredes/agua sem precisar mudar nenhuma chamada. */
  for (const k of mapBlockKeys(c)) occ.set(k, true);
  if (c.player && c.player !== ignorar && (!c.player.p || c.player.p.hp > 0)) {
    occ.set(c.player.cx + ":" + c.player.cy, c.player);
  }
  /* PARTY COMBAT: os aliados também ocupam tile (duas criaturas não
   * dividem SQM) — monstros e aliados desviam uns dos outros. */
  if (c.players && c.players.length > 1) {
    for (const e of c.players) {
      if (e === ignorar || !e.p || e.p.hp <= 0) continue;
      if (e.cx !== undefined && e.cy !== undefined) occ.set(e.cx + ":" + e.cy, e);
    }
  }
  for (const m of c.mobs) {
    if (m === ignorar || m.hp <= 0) continue;
    occ.set(m.cx + ":" + m.cy, m);
  }
  return occ;
}

function cellFree(occ, cx, cy) {
  return inBounds(cx, cy) && !occ.has(cx + ":" + cy);
}

/* Converte celula -> posicao de tela (0..1), que e o que o render usa.
 * O +0.5 centraliza a criatura no tile. */
function cellToScreen(cx, cy) {
  return { x: (cx + 0.5) / GRID_W, y: (cy + 0.5) / GRID_H };
}

/* Converte tela -> celula, para migrar entidades que ainda usam float */
function screenToCell(x, y) {
  return {
    cx: Math.max(0, Math.min(GRID_W - 1, Math.floor((x || 0.5) * GRID_W))),
    cy: Math.max(0, Math.min(GRID_H - 1, Math.floor((y || 0.5) * GRID_H))),
  };
}

/* Garante que a entidade tem celula. Entidades criadas antes desta engine
 * so tinham x/y de tela. */
function ensureCell(ent) {
  if (ent.cx === undefined || ent.cy === undefined) {
    const c = screenToCell(ent.x, ent.y);
    ent.cx = c.cx;
    ent.cy = c.cy;
    const s = cellToScreen(ent.cx, ent.cy);
    ent.x = s.x; ent.y = s.y;
    ent.sx = s.x; ent.sy = s.y;   // origem da interpolacao
  }
  if (ent.sx === undefined) { ent.sx = ent.x; ent.sy = ent.y; }
  // Quantos quadros de caminhada esta criatura tem. Vem do sheet
  // (MOBSHEETS[slug].cols conta a pose parada, por isso o -1). Sem isso o
  // advanceStep usaria 2 para todo mundo e as criaturas de 8 quadros
  // andariam picotado.
  if (ent.walkFrames === undefined && ent.slug &&
      typeof MOBSHEETS !== "undefined" && MOBSHEETS && MOBSHEETS[ent.slug]) {
    ent.walkFrames = Math.max(1, (MOBSHEETS[ent.slug].cols || 3) - 1);
  }
  return ent;
}

/* Coloca a entidade numa celula livre proxima da desejada.
 * Usado no spawn: sem isso dois monstros nascem no mesmo tile. */
function placeFree(ent, occ, cx, cy) {
  for (let r = 0; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!cellFree(occ, nx, ny)) continue;
        ent.cx = nx; ent.cy = ny;
        const s = cellToScreen(nx, ny);
        ent.x = s.x; ent.y = s.y; ent.sx = s.x; ent.sy = s.y;
        occ.set(nx + ":" + ny, ent);
        return true;
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------ passo */

/* Inicia um passo para a celula vizinha. O movimento na tela e so
 * interpolacao: a celula ja muda na hora, como no servidor (a criatura
 * "esta" no tile de destino assim que o passo comeca). */
function beginStep(ent, dir, occ, alvoPerto) {
  const nx = ent.cx + dir.dx, ny = ent.cy + dir.dy;
  if (!cellFree(occ, nx, ny)) return false;

  occ.delete(ent.cx + ":" + ent.cy);
  const antes = cellToScreen(ent.cx, ent.cy);
  ent.sx = antes.x; ent.sy = antes.y;
  ent.cx = nx; ent.cy = ny;
  occ.set(nx + ":" + ny, ent);

  const alvo = cellToScreen(nx, ny);
  ent.tx = alvo.x; ent.ty = alvo.y;
  ent.stepDur = stepDuration(ent.speedPts || 110, dir.diag, alvoPerto);
  ent.stepT = 0;
  ent.moving = true;
  ent.dir = dir.d === "ne" || dir.d === "se" ? "e"
          : dir.d === "nw" || dir.d === "sw" ? "w" : dir.d;
  return true;
}

/* Avanca a interpolacao visual do passo em andamento. */
function advanceStep(ent, dt) {
  if (!ent.moving) {
    ent.walkT = 0;
    ent.frame = 0;
    return false;
  }
  ent.stepT += dt;
  const p = Math.min(1, ent.stepT / Math.max(1, ent.stepDur));
  ent.x = ent.sx + (ent.tx - ent.sx) * p;
  ent.y = ent.sy + (ent.ty - ent.sy) * p;
  // Distribui o ciclo de caminhada ao longo do trajeto. O numero de quadros
  // varia por criatura (o DAT 8.60 traz de 1 a 12; 640 monstros tem 8) e
  // vive em ent.walkFrames, preenchido pelo render a partir do sheet. Antes
  // era fixo em dois quadros, entao quem tinha 8 andava picotado.
  const n = Math.max(1, ent.walkFrames || 2);
  ent.frame = 1 + Math.min(n - 1, Math.floor(p * n));
  if (p >= 1) {
    ent.moving = false;
    ent.x = ent.tx; ent.y = ent.ty;
    ent.sx = ent.x; ent.sy = ent.y;
    ent.frame = 0;
    return true;
  }
  return false;
}

/* A* de verdade, no lugar do greedy.
 *
 * O greedy anterior tentava a direcao boa e alguns desvios laterais; num
 * corredor em U ele batia na parede de corpos e travava, porque nenhum dos
 * candidatos aproximava do alvo. O A* enxerga o caminho inteiro e contorna.
 *
 * Custos: reto = 1, diagonal = 3 (WALK_DIAGONAL_EXTRA_COST do Canary), o que
 * reproduz a preferencia do servidor por andar reto. A heuristica e a
 * distancia de Chebyshev, admissivel para esses custos.
 *
 * O teto de 400 nos evita e generoso para uma grade de 21x13 (273 celulas) e
 * garante que o pior caso nao pese no tick.
 */
function findPathGrid(ent, gx, gy, occ, maxNos) {
  const inicio = ent.cx + ":" + ent.cy;
  if (ent.cx === gx && ent.cy === gy) return null;

  const abertos = [{ cx: ent.cx, cy: ent.cy, g: 0,
                     f: Math.max(Math.abs(gx - ent.cx), Math.abs(gy - ent.cy)) }];
  const veioDe = new Map();
  const custo = new Map([[inicio, 0]]);
  const fechados = new Set();
  let nos = 0;
  const teto = maxNos || 400;

  while (abertos.length && nos < teto) {
    // fila de prioridade simples: a grade e pequena, um scan linear e mais
    // barato que manter um heap
    let melhor = 0;
    for (let i = 1; i < abertos.length; i++) {
      if (abertos[i].f < abertos[melhor].f) melhor = i;
    }
    const atual = abertos.splice(melhor, 1)[0];
    const chave = atual.cx + ":" + atual.cy;
    if (fechados.has(chave)) continue;
    fechados.add(chave);
    nos++;

    if (atual.cx === gx && atual.cy === gy) {
      // reconstroi ate o primeiro passo saindo da origem
      let cur = chave;
      let passo = null;
      while (veioDe.has(cur)) {
        const ant = veioDe.get(cur);
        if (ant.chave === inicio) { passo = ant.dir; break; }
        cur = ant.chave;
      }
      return passo;
    }

    for (const d of DIRS) {
      const nx = atual.cx + d.dx, ny = atual.cy + d.dy;
      const nk = nx + ":" + ny;
      if (fechados.has(nk)) continue;
      // o destino pode estar ocupado (e o alvo): aceita como chegada
      const ehDestino = nx === gx && ny === gy;
      if (!ehDestino && !cellFree(occ, nx, ny)) continue;
      if (!inBounds(nx, ny)) continue;
      const g = atual.g + (d.diag ? WALK_DIAGONAL_EXTRA_COST : 1);
      if (custo.has(nk) && custo.get(nk) <= g) continue;
      custo.set(nk, g);
      veioDe.set(nk, { chave: chave, dir: d });
      const h = Math.max(Math.abs(gx - nx), Math.abs(gy - ny));
      abertos.push({ cx: nx, cy: ny, g: g, f: g + h });
    }
  }
  return null;
}

/* Escolhe a direcao que mais aproxima de (gx,gy).
 *
 * Tenta o A* primeiro; se ele nao achar caminho (alvo cercado, teto de nos
 * estourado) cai no greedy, que ao menos aproxima. */
function stepToward(ent, gx, gy, occ) {
  const viaAStar = findPathGrid(ent, gx, gy, occ);
  if (viaAStar) return viaAStar;
  return stepTowardGreedy(ent, gx, gy, occ);
}

function stepTowardGreedy(ent, gx, gy, occ) {
  const dx = gx - ent.cx, dy = gy - ent.cy;
  if (dx === 0 && dy === 0) return null;
  const sx = Math.sign(dx), sy = Math.sign(dy);

  const cand = [];
  if (sx && sy) cand.push({ dx: sx, dy: sy, diag: true });
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (sx) cand.push({ dx: sx, dy: 0, diag: false });
    if (sy) cand.push({ dx: 0, dy: sy, diag: false });
  } else {
    if (sy) cand.push({ dx: 0, dy: sy, diag: false });
    if (sx) cand.push({ dx: sx, dy: 0, diag: false });
  }
  // desvios laterais quando o caminho direto esta ocupado
  if (sx) { cand.push({ dx: sx, dy: 1, diag: true }); cand.push({ dx: sx, dy: -1, diag: true }); }
  if (sy) { cand.push({ dx: 1, dy: sy, diag: true }); cand.push({ dx: -1, dy: sy, diag: true }); }

  for (const cd of cand) {
    if (cellFree(occ, ent.cx + cd.dx, ent.cy + cd.dy)) {
      return DIRS.find((d) => d.dx === cd.dx && d.dy === cd.dy) || null;
    }
  }
  return null;
}

/* Passo para LONGE do alvo (fuga e manter distancia).
 * getDistanceStep() do servidor faz exatamente isso: tenta as direcoes que
 * aumentam a distancia e aceita a primeira livre. */
function stepAway(ent, from, occ) {
  const dx = Math.sign(ent.cx - from.cx) || (Math.random() < 0.5 ? 1 : -1);
  const dy = Math.sign(ent.cy - from.cy) || (Math.random() < 0.5 ? 1 : -1);
  const cand = [
    { dx: dx, dy: dy, diag: true },
    { dx: dx, dy: 0, diag: false },
    { dx: 0, dy: dy, diag: false },
  ];
  for (const cd of cand) {
    if (cellFree(occ, ent.cx + cd.dx, ent.cy + cd.dy)) {
      return DIRS.find((d) => d.dx === cd.dx && d.dy === cd.dy) || null;
    }
  }
  return null;
}

/* O "dance step" do Canary.
 *
 * Quando o monstro ja esta na distancia que quer, ele nao fica imovel: anda
 * de lado mantendo a MESMA distancia do alvo. E o vaivem caracteristico do
 * Tibia. So sao aceitas direcoes que preservam a distancia atual.
 */
function danceStep(ent, alvo, occ, manterDistancia) {
  const distAtual = sqmDistance(ent, alvo);
  const offX = ent.cx - alvo.cx;
  const offY = ent.cy - alvo.cy;
  const opcoes = [];

  const tenta = (dir) => {
    const nx = ent.cx + dir.dx, ny = ent.cy + dir.dy;
    const nd = Math.max(Math.abs(nx - alvo.cx), Math.abs(ny - alvo.cy));
    if (nd !== distAtual) return;          // tem que manter a distancia
    if (!cellFree(occ, nx, ny)) return;
    opcoes.push(dir);
  };

  // as guardas de sinal vem do getDanceStep: com keepDistance so anda para
  // o lado que nao encurta a distancia
  if (!manterDistancia || offY >= 0) tenta(DIRS[0]);   // n
  if (!manterDistancia || offY <= 0) tenta(DIRS[2]);   // s
  if (!manterDistancia || offX <= 0) tenta(DIRS[1]);   // e
  if (!manterDistancia || offX >= 0) tenta(DIRS[3]);   // w

  if (!opcoes.length) return null;
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

/* Passo aleatorio, para monstro sem alvo */
function randomStep(ent, occ) {
  const ordem = [DIRS[0], DIRS[1], DIRS[2], DIRS[3]]
    .sort(() => Math.random() - 0.5);
  for (const d of ordem) {
    if (cellFree(occ, ent.cx + d.dx, ent.cy + d.dy)) return d;
  }
  return null;
}
