/*
 * gridai.js — decisao de movimento por criatura, na ordem do Canary.
 *
 * A ordem de decisao do Monster::onThink e:
 *   1. sem alvo               -> passo aleatorio de vez em quando
 *   2. fugindo (runHealth)    -> getDistanceStep(flee = true)
 *   3. longe demais           -> anda em direcao ao alvo
 *   4. perto demais (dist)    -> recua para manter targetDistance
 *   5. na distancia certa     -> danca, salvo se cair no staticAttackChance
 *
 * O staticAttackChance e a peca que da personalidade: 90 significa que em
 * 90% dos ticks o bicho fica parado batendo, e em 10% ele se desloca. Um
 * demon (70) se mexe mais que um rat (90).
 */
"use strict";

/* Dados de movimento vindos do Canary (tools/import_monster_moves.py) */
const MOVEDATA = (typeof window !== "undefined" && window.MONSTERMOVES)
  ? window.MONSTERMOVES : {};

function moveInfo(slug) {
  return MOVEDATA[slug] || {};
}

/* Distancia que o monstro QUER manter do alvo.
 * 1 = melee, cola. >1 = atirador, recua para atirar de longe. */
function monsterTargetDistance(mob) {
  const mi = moveInfo(mob.slug);
  if (mi.targetDistance) return mi.targetDistance;
  // fallback para monstro sem dado: usa a flag ranged que o jogo ja tinha
  return mob.def && mob.def.ranged ? 4 : 1;
}

/* Chance (0-100) de ficar parado em vez de dancar */
function monsterStaticChance(mob) {
  const mi = moveInfo(mob.slug);
  return mi.staticAttack === undefined ? 90 : mi.staticAttack;
}

/* O monstro esta fugindo? runHealth do Canary e um valor ABSOLUTO de hp,
 * nao percentual. O jogo tinha `runAt` em percentual, entao os dois valem. */
function monsterFleeing(mob) {
  const mi = moveInfo(mob.slug);
  if (mi.runHealth && mob.hp > 0 && mob.hp <= mi.runHealth) return true;
  const pct = mob.def && mob.def.runAt;
  if (pct && mob.maxHp) return (mob.hp / mob.maxHp) * 100 <= pct;
  return false;
}

/* Velocidade base do monstro, em pontos de speed do Canary */
function monsterSpeedPts(mob) {
  const mi = moveInfo(mob.slug);
  return mi.speed || (mob.def && mob.def.speed) || 100;
}

/* Alcance de ataque em SQM.
 * canUseAttack() do servidor compara a distancia de Chebyshev com o range
 * da spell. Melee e 1: a diagonal conta como colado. */
function monsterRangeSQM(mob) {
  const mi = moveInfo(mob.slug);
  const td = monsterTargetDistance(mob);
  if (td > 1) return Math.max(td, mi.atkRange ? Math.min(mi.atkRange, 7) : 4);
  return 1;
}

/* Decide e executa o passo de UM monstro. Devolve true se andou. */
function monsterThinkStep(c, mob, alvo, occ, now) {
  ensureCell(mob);
  if (mob.hp <= 0) return false;

  // passo em andamento: so continua interpolando
  if (mob.moving) return false;

  // respeita a duracao do passo anterior antes de dar o proximo
  if (mob.nextStepAt && now < mob.nextStepAt) return false;

  const td = monsterTargetDistance(mob);
  const dist = alvo ? sqmDistance(mob, alvo) : 99;
  const perto = dist <= 1;
  let dir = null;

  if (!alvo) {
    // sem alvo: vagueia devagar
    if (Math.random() < 0.25) dir = randomStep(mob, occ);
  } else if (monsterFleeing(mob)) {
    // 2. fugindo: sempre tenta se afastar
    dir = stepAway(mob, alvo, occ);
  } else if (dist > td) {
    // 3. longe: aproxima
    dir = stepToward(mob, alvo.cx, alvo.cy, occ);
  } else if (dist < td) {
    // 4. perto demais para um atirador: recua
    dir = stepAway(mob, alvo, occ);
  } else {
    // 5. na distancia certa: danca, se o dado deixar
    if (Math.random() * 100 >= monsterStaticChance(mob)) {
      dir = danceStep(mob, alvo, occ, td > 1);
    }
  }

  if (!dir) {
    // parado: encara o alvo e espera o proximo tick
    if (alvo) mob.dir = dirTo(mob, alvo);
    mob.nextStepAt = now + 200;
    return false;
  }

  mob.speedPts = monsterSpeedPts(mob);
  const ok = beginStep(mob, dir, occ, perto);
  if (ok) {
    mob.nextStepAt = now + mob.stepDur;
  } else {
    mob.nextStepAt = now + 200;
  }
  return ok;
}

/* Passo do jogador, conforme o modo de ataque configurado. */
function playerThinkStep(c, p, alvo, occ, now) {
  const pl = c.player;
  if (!pl) return false;
  ensureCell(pl);
  if (pl.moving) return false;
  if (pl.nextStepAt && now < pl.nextStepAt) return false;
  if (!alvo) return false;

  const modo = (p.config && p.config.attackMode) || "chase";
  if (modo === "stand") {
    pl.dir = dirTo(pl, alvo);
    pl.nextStepAt = now + 200;
    return false;
  }

  const alcance = playerRangeSQM(p);
  const dist = sqmDistance(pl, alvo);
  let dir = null;

  if (modo === "kiting" && alcance > 1) {
    // mantem a distancia escolhida pelo jogador, dentro do alcance da arma
    const querido = Math.max(1, Math.min(alcance,
      parseInt(p.config.kiteDistance, 10) || 3));
    if (dist < querido) dir = stepAway(pl, alvo, occ);
    else if (dist > querido) dir = stepToward(pl, alvo.cx, alvo.cy, occ);
  } else if (dist > alcance) {
    dir = stepToward(pl, alvo.cx, alvo.cy, occ);
  }

  if (!dir) {
    pl.dir = dirTo(pl, alvo);
    pl.nextStepAt = now + 150;
    return false;
  }

  // Velocidade pelo modelo do Canary: 110 + (nivel-1) + equip + montaria +
  // haste. Antes era 110 fixo, entao o NIVEL nao contava e um char 500
  // andava igual a um char 1.
  pl.speedPts = typeof playerSpeed === "function"
    ? playerSpeed(p, now)
    : 110 + (typeof gearStats === "function" ? (gearStats(p).speed || 0) : 0);

  const ok = beginStep(pl, dir, occ, dist <= 1);
  pl.nextStepAt = now + (ok ? pl.stepDur : 150);
  return ok;
}

/* Alcance do jogador em SQM, derivado do tipo de dano.
 * Melee = 1 (inclui diagonal, por Chebyshev), distancia = 6, magia = 5. */
function playerRangeSQM(p) {
  if (typeof playerDamage !== "function") return 1;
  const d = playerDamage(p);
  if (d.type === "distance") {
    const w = p.equip && p.equip.weapon
      ? GAMEDATA.items[p.equip.weapon.item] : null;
    return (w && w.range) ? Math.min(7, w.range) : 6;
  }
  if (d.type === "magic") return 5;
  return 1;
}

/* Tick de movimento de toda a cena. Substitui updateCombatMovement. */
function updateGridMovement(c, p, dt, now) {
  if (!c.player) return;
  now = now || Date.now();
  ensureCell(c.player);

  c.player.attackAnim = Math.max(0, (c.player.attackAnim || 0) - dt);
  for (const m of c.mobs) {
    m.attackAnim = Math.max(0, (m.attackAnim || 0) - dt);
    ensureCell(m);
  }

  // interpola quem esta no meio de um passo
  advanceStep(c.player, dt);
  for (const m of c.mobs) advanceStep(m, dt);

  const occ = buildOccupancy(c);
  const vivos = c.mobs.filter((m) => m.hp > 0);
  const alvo = vivos.length ? vivos[0] : null;

  playerThinkStep(c, p, alvo, occ, now);
  for (const m of vivos) monsterThinkStep(c, m, c.player, occ, now);
}
