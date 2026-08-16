/*
 * area.js — resolve a AREA de uma magia/runa em celulas concretas.
 *
 * O QUE MUDA
 *
 * Antes toda area virava um raio circular em volta do alvo. Isso acertava
 * por acaso os circulos (AREA_CIRCLE3X3) e errava tudo o mais: o leque do
 * Sweeping Takedown, as ondas (WAVE), os feixes (BEAM) e as paredes
 * (WALLFIELD) viravam bolas.
 *
 * Agora cada area usa a MATRIZ real do register_spells.lua, ja rotacionada
 * nas quatro direcoes por tools/import_areas.py. A direcao do lance escolhe
 * qual rotacao vale, exatamente como o AreaCombat::getArea() faz.
 *
 * ONDE A AREA E ANCORADA
 *
 * Isso e sutil e o servidor trata os dois casos:
 *   - area com centro NO CONJURADOR (ondas, feixes, o leque do monk): a
 *     matriz nasce em cima do jogador e se projeta na direcao do alvo;
 *   - area com centro NO ALVO (bombas, circulos de runa): a matriz nasce
 *     em cima do alvo.
 * O criterio e o proprio desenho: se a casa central da matriz e a unica da
 * borda (o "3" encostado na beirada), o lance sai do conjurador.
 */
"use strict";

const AREADATA_MAP = (typeof window !== "undefined" && window.AREADATA)
  ? window.AREADATA : {};

/* Areas cujo centro fica no CONJURADOR, nao no alvo.
 * Detectado pelo desenho: se nenhuma casa fica "atras" do centro no eixo
 * vertical da matriz original, o efeito so se projeta para frente -- e um
 * cone/onda/feixe saindo de quem lanca. */
/* Knight self-AoE (Berserk family): sempre em volta do caster, mesmo se o
 * SPELLTARGET importado vier sem self (AREA_SQUARE1X1/CIRCLE3X3 estao em
 * AREA_ANCORA_ALVO e senao centrariam no inimigo). */
const AREA_SELF_SPELLS = {
  "exori": 1, "exori-gran": 1, "exori-mas": 1, "exori-min": 1, "exori-scu": 1,
};

function areaSaiDoConjurador(nome, spellId) {
  // 1) A FONTE DE VERDADE e o spell:isSelfTarget() do .lua. Divine Caldera
  //    (exevo mas san) e Hell's Core usam AREA_CIRCLE3X3/5X5 -- circulos
  //    simetricos que a heuristica abaixo classificaria como "no alvo",
  //    quando na verdade explodem em volta de QUEM LANCA.
  if (spellId && AREA_SELF_SPELLS[spellId]) return true;
  if (spellId && typeof SPELLTARGET !== "undefined") {
    const st = SPELLTARGET[spellId];
    if (st) {
      if (st.self) return true;
      // magia que exige alvo selecionado nasce NO alvo
      if (st.needTarget) return false;
    }
  }
  const a = AREADATA_MAP[nome];
  if (!a) return false;
  if (AREA_ANCORA_ALVO[nome]) return false;
  // 2) fallback pelo desenho: se nenhuma casa fica atras do centro, o
  //    efeito so se projeta para frente e portanto sai do conjurador
  let atras = 0;
  for (const [, dy] of a.n) if (dy > 0) atras++;
  return atras === 0;
}

/* Excecoes explicitas: areas simetricas que apesar de tudo sao lancadas
 * SOBRE o alvo. Circulos de runa e bombas caem aqui. */
const AREA_ANCORA_ALVO = {
  AREA_CIRCLE1X1: 1, AREA_CIRCLE2X2: 1, AREA_CIRCLE3X3: 1,
  AREA_CIRCLE4X4: 1, AREA_CIRCLE5X5: 1, AREA_CIRCLE6X6: 1,
  AREA_SQUARE1X1: 1, AREA_CROSS1X1: 1,
};

/* Direcao do lance, em quatro quadrantes. A matriz so tem 4 rotacoes,
 * entao a diagonal cai no eixo dominante -- igual ao getArea().
 * Prefere a facing do caster (dir n/e/s/w) quando existe — waves/beams
 * saem sempre para onde ele esta virado. */
function areaDir(origem, alvo) {
  const facing = origem && origem.dir;
  if (facing === "n" || facing === "e" || facing === "s" || facing === "w") return facing;
  const dx = (alvo.cx || 0) - (origem.cx || 0);
  const dy = (alvo.cy || 0) - (origem.cy || 0);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "e" : "w";
  if (dy !== 0) return dy > 0 ? "s" : "n";
  return dx >= 0 ? "e" : "w";
}

/* Celulas atingidas por uma area, em coordenadas absolutas da grade.
 *
 * Devolve [] quando a area nao e conhecida, e o chamador cai no
 * comportamento antigo (raio). Assim uma matriz nova no Canary nao quebra
 * o jogo -- ela so nao ganha o formato exato ate ser importada.
 */
function areaCells(nome, origem, alvo, spellId) {
  const a = AREADATA_MAP[nome];
  if (!a || !origem || !alvo) return [];
  const dir = areaDir(origem, alvo);
  const offs = a[dir] || a.n;
  const base = areaSaiDoConjurador(nome, spellId) ? origem : alvo;
  const out = [];
  const vistos = new Set();
  // WAVE/BEAM: o SQM de lancamento e SEMPRE 1 a frente do caster na
  // direcao em que ele esta virado. O centro da matriz (caster) nunca
  // entra na lista de dano/FX — filtramos [0,0] e qualquer celula que
  // coincida com o caster.
  const waveProjetada = areaSaiDoConjurador(nome, spellId) && /(WAVE|BEAM)/i.test(nome);
  const ox0 = Number(origem.cx) || 0, oy0 = Number(origem.cy) || 0;
  for (const [dx, dy] of offs) {
    const ox = Number(dx) || 0, oy = Number(dy) || 0;
    if (waveProjetada && ox === 0 && oy === 0) continue;
    const cx = (base.cx || 0) + ox;
    const cy = (base.cy || 0) + oy;
    if (waveProjetada && cx === ox0 && cy === oy0) continue;
    if (typeof inBounds === "function" && !inBounds(cx, cy)) continue;
    const k = cx + ":" + cy;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ cx: cx, cy: cy });
  }
  return out;
}

/* Celulas cobertas por uma matriz de area CRUA, centrada no alvo.
 *
 * As municoes do Canary (burst arrow, diamond arrow) trazem a propria
 * createCombatArea no script da arma, no formato "3 = casa do alvo, 1 = casa
 * atingida". Diferente das magias, essa area nao gira com a direcao: a
 * flecha cai no alvo e explode em volta dele. Por isso a matriz e lida
 * direto, sem passar pelas rotacoes do AREADATA.
 *
 * Precisa ser uma matriz de verdade e nao um raio: a diamond arrow e um 5x5
 * SEM os quatro cantos, o que nenhum raio circular representa.
 */
function matrixCells(matriz, alvo) {
  if (!matriz || !matriz.length || !alvo || alvo.cx === undefined) return [];
  // acha o centro (valor 3); se o script nao marcar, usa o meio da matriz
  let cr = -1, cc = -1;
  for (let r = 0; r < matriz.length; r++) {
    for (let col = 0; col < matriz[r].length; col++) {
      if (matriz[r][col] === 3) { cr = r; cc = col; }
    }
  }
  if (cr < 0) {
    cr = (matriz.length - 1) / 2;
    cc = (matriz[0].length - 1) / 2;
  }
  const out = [];
  for (let r = 0; r < matriz.length; r++) {
    for (let col = 0; col < matriz[r].length; col++) {
      if (!matriz[r][col]) continue;          // 0 = fora da area
      const cx = alvo.cx + (col - cc);
      const cy = alvo.cy + (r - cr);
      if (typeof inBounds === "function" && !inBounds(cx, cy)) continue;
      out.push({ cx: cx, cy: cy });
    }
  }
  return out;
}

/* Monstros vivos dentro de uma matriz de municao. null = nao da para saber. */
function matrixMobs(c, matriz, alvo) {
  if (!c || !c.mobs || !alvo || alvo.cx === undefined) return null;
  const cells = matrixCells(matriz, alvo);
  if (!cells.length) return null;
  const chaves = new Set(cells.map((q) => q.cx + ":" + q.cy));
  return c.mobs.filter((m) => m.hp > 0 && m.cx !== undefined &&
                              chaves.has(m.cx + ":" + m.cy));
}

/* Monstros vivos dentro da area. E a lista que leva dano. */
function areaMobs(c, nome, origem, alvo, spellId) {
  // A matriz so vale se TODO mundo tem celula. Cenas antigas (treino, testes
  // que montam mob na mao) usam so x/y de tela; nesses casos devolver uma
  // lista vazia faria o combate achar que a area nao pegou ninguem, em vez
  // de cair no raio. Retornar null e o sinal de "nao sei", que aciona o
  // fallback.
  if (!c || !c.mobs || !origem || origem.cx === undefined) return null;
  if (!alvo || alvo.cx === undefined) return null;
  const semCelula = c.mobs.some((m) => m.hp > 0 && m.cx === undefined);
  if (semCelula) return null;

  const cells = areaCells(nome, origem, alvo, spellId);
  if (!cells.length) return null;             // area desconhecida
  const chaves = new Set(cells.map((q) => q.cx + ":" + q.cy));
  const out = [];
  for (const m of c.mobs) {
    if (m.hp <= 0 || m.cx === undefined) continue;
    if (chaves.has(m.cx + ":" + m.cy)) out.push(m);
  }
  return out;
}

/* Quantos monstros a area pegaria — usado pelo requisito "N+" do combo
 * e pelo gate de self-AoE (exevo mas san etc.). Devolve 0 quando a matriz
 * e conhecida e ninguem esta dentro; null so quando nao da para medir. */
function areaCount(c, nome, origem, alvo, spellId) {
  const l = areaMobs(c, nome, origem, alvo, spellId);
  return l === null ? null : l.length;
}

/* Nome da area de uma magia/runa, olhando as tres fontes de dados */
function areaNameOf(kind, id) {
  if (kind === "rune") {
    const rd = (typeof RUNEDATA !== "undefined") ? RUNEDATA[id] : null;
    return rd && rd.areaNome ? rd.areaNome : null;
  }
  const md = (typeof MONKSPELLS !== "undefined") ? MONKSPELLS[id] : null;
  if (md && md.areaNome) return md.areaNome;
  const s = (typeof SPELLS !== "undefined") ? SPELLS[id] : null;
  // nas magias comuns o proprio campo `area` guarda o nome da matriz
  if (s && typeof s.area === "string") return s.area;
  const st = (typeof SPELLTARGET !== "undefined") ? SPELLTARGET[id] : null;
  return (st && st.areaNome) || null;
}
