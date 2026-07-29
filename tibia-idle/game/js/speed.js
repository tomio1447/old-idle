/*
 * speed.js — velocidade do personagem no modelo do Canary.
 *
 * O QUE ESTAVA ERRADO
 *
 * O jogador andava com speed fixa em 110, somando so equipamento e montaria.
 * O NIVEL era ignorado por completo: um char nivel 500 andava igual a um
 * nivel 1. E as magias de haste nao mexiam em nada -- `c.buffs.haste` so
 * afetava a velocidade de ATAQUE, nunca a de caminhada.
 *
 * COMO E NO SERVIDOR
 *
 *   Player::updateBaseSpeed()
 *       baseSpeed = vocation.baseSpeed + (level - 1)
 *   As 11 vocacoes do vocations.xml usam baseSpeed = 110, entao a conta e a
 *   mesma para todas: cada nivel vale 1 ponto.
 *
 *   Creature::getSpeed()
 *       speed = baseSpeed + varSpeed
 *   varSpeed e a soma dos modificadores temporarios (haste, paralyze) e dos
 *   equipamentos com `speed`.
 *
 *   ConditionSpeed::getFormulaValues() + startCondition()
 *       difference = baseSpeed - 40
 *       min = mina * difference + minb
 *       max = maxa * difference + maxb
 *       delta = random(min, max) - baseSpeed
 *   Repare que o ganho da haste ESCALA com o nivel: utani hur da +23 num
 *   char nivel 8 e +170 num nivel 500. Cravar "+40" seria errado nas duas
 *   pontas.
 *
 * A velocidade vira duracao de passo em grid.js, pela formula logaritmica
 * que ja estava implementada (calculatedStepSpeed).
 */
"use strict";

/* Todas as vocacoes do vocations.xml usam 110 */
const VOC_BASE_SPEED = 110;

/* Player::PLAYER_MIN_SPEED. O paralyze nao consegue baixar disso. */
const PLAYER_MIN_SPEED = 10;

const HASTEDATA_MAP = (typeof window !== "undefined" && window.HASTEDATA)
  ? window.HASTEDATA : {};

/* baseSpeed do jogador: 110 + (nivel - 1), como no updateBaseSpeed(). */
function playerBaseSpeed(p) {
  const lvl = Math.max(1, (p && p.level) || 1);
  return VOC_BASE_SPEED + (lvl - 1);
}

/* Delta de velocidade de uma magia de haste PARA ESTE personagem.
 *
 * Usa a media entre min e max da formula. O servidor sorteia no intervalo,
 * mas num idle o valor precisa ser estavel: se sorteasse a cada tick a
 * duracao do passo ficaria tremendo.
 */
function hasteDelta(p, id) {
  const h = HASTEDATA_MAP[id];
  if (!h) return 0;
  if (h.delta) return h.delta;              // delta fixo, sem formula
  const base = playerBaseSpeed(p);
  const dif = base - 40;
  const lo = h.mina * dif + h.minb;
  const hi = h.maxa * dif + h.maxb;
  return Math.round((lo + hi) / 2 - base);
}

/* Soma dos modificadores temporarios ativos (haste de magia).
 *
 * As magias de velocidade nao se acumulam no Tibia: vale a mais forte. Por
 * isso aqui pega o MAIOR delta em vez de somar todos.
 */
function speedBuffDelta(p, agora) {
  if (!p || !p.buffs) return 0;
  agora = agora || Date.now();
  let melhor = 0;
  for (const id in p.buffs) {
    if (!HASTEDATA_MAP[id]) continue;
    if (p.buffs[id] <= agora) continue;     // expirou
    const d = hasteDelta(p, id);
    if (d > melhor) melhor = d;
  }
  return melhor;
}

/* varSpeed: equipamento + montaria + haste ativa.
 *
 * O `spd` dos itens ja e um delta de speed no items.xml (boots of haste dao
 * 20), entao entra somado direto -- e o mesmo caminho do servidor, onde o
 * equipamento aplica CONDITION_PARAM_SPEED.
 */
function playerVarSpeed(p, agora) {
  let v = 0;
  if (typeof gearStats === "function") v += (gearStats(p).speed || 0);
  if (typeof mountSpeedBonus === "function") v += (mountSpeedBonus(p) || 0);
  v += speedBuffDelta(p, agora);
  return v;
}

/* Velocidade final, como o Creature::getSpeed(). */
function playerSpeed(p, agora) {
  const s = playerBaseSpeed(p) + playerVarSpeed(p, agora);
  return Math.max(PLAYER_MIN_SPEED, s);
}

/* Detalhamento para a interface mostrar de onde vem cada ponto */
function playerSpeedBreakdown(p, agora) {
  const base = playerBaseSpeed(p);
  const equip = typeof gearStats === "function" ? (gearStats(p).speed || 0) : 0;
  const mount = typeof mountSpeedBonus === "function"
    ? (mountSpeedBonus(p) || 0) : 0;
  const haste = speedBuffDelta(p, agora);
  return {
    base: base,
    nivel: base - VOC_BASE_SPEED,     // quanto o nivel contribuiu
    equip: equip,
    mount: mount,
    haste: haste,
    total: Math.max(PLAYER_MIN_SPEED, base + equip + mount + haste),
  };
}

/* Qual magia de haste esta ativa, para a UI nomear o bonus */
function hasteAtiva(p, agora) {
  if (!p || !p.buffs) return null;
  agora = agora || Date.now();
  let melhor = null, valor = 0;
  for (const id in p.buffs) {
    if (!HASTEDATA_MAP[id] || p.buffs[id] <= agora) continue;
    const d = hasteDelta(p, id);
    if (d > valor) { valor = d; melhor = id; }
  }
  return melhor ? { id: melhor, nome: HASTEDATA_MAP[melhor].nome,
                    delta: valor, ate: p.buffs[melhor] } : null;
}

/* A magia de velocidade esta disponivel para este personagem? */
function hastesDisponiveis(p) {
  const out = [];
  for (const id in HASTEDATA_MAP) {
    const h = HASTEDATA_MAP[id];
    if (h.vocs && h.vocs.indexOf(p.voc) === -1) continue;
    if (h.lvl && p.level < h.lvl) continue;
    out.push(id);
  }
  return out;
}
