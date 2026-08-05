/*
 * gridai.js — decisao de movimento por criatura, na ordem do Canary.
 *
 * A ordem de decisao do Monster::onThink e:
 *   1. sem alvo               -> passo aleatorio de vez em quando
 *   2. longe demais           -> anda em direcao ao alvo
 *   3. perto demais (dist)    -> recua para manter targetDistance
 *   4. na distancia certa     -> danca, salvo se cair no staticAttackChance
 *
 * O staticAttackChance e a peca que da personalidade: 90 significa que em
 * 90% dos ticks o bicho fica parado batendo, e em 10% ele se desloca. Um
 * demon (70) se mexe mais que um rat (90).
 *
 * REMOVIDO a pedido do jogador: a FUGA com hp baixo (runHealth/runAt).
 * Monstros nunca fogem — e o item 2 do onThink do Canary some daqui. De
 * quebra isso aposenta um bug de traducao: o runAt do MONSTERDATA vem em
 * hp ABSOLUTO (behemoth 300, dragon lord 300...) e era comparado com o hp
 * PERCENTUAL, entao qualquer valor > 100 fazia o bicho "fugir" de hp cheio.
 * Os campos runHealth/runAt continuam nos dados como referencia, inertes.
 */
"use strict";

/* Dados de movimento vindos do Canary (tools/import_monster_moves.py) */
const MOVEDATA = (typeof window !== "undefined" && window.MONSTERMOVES)
  ? window.MONSTERMOVES : {};

function moveInfo(slug) {
  return MOVEDATA[slug] || {};
}

/* Distancia que o monstro QUER manter do alvo.
 * 1 = melee, cola. >1 = atirador, recua para atirar de longe.
 *
 * O Canary traz targetDistance de ate 7 (yellow-butterfly, wisp...), e no
 * idle isso fazia o ranged "recuar demais": ele atravessava o mapa inteiro
 * fugindo do player. Mantemos o ranged RANGED (mecanica do jogo — o player
 * usa Exeta Amp Res / magias para forcar melee), mas com um TETO de 3 SQM:
 * distancia de atirador classica, sem o bicho correr ate a borda. */
const MAX_TARGET_DISTANCE = 3;
function monsterTargetDistance(mob) {
  const mi = moveInfo(mob.slug);
  if (mi.targetDistance) {
    return Math.min(MAX_TARGET_DISTANCE, mi.targetDistance);
  }
  // fallback para monstro sem dado: usa a flag ranged que o jogo ja tinha
  return mob.def && mob.def.ranged ? 3 : 1;
}

/* Chance (0-100) de ficar parado em vez de dancar */
function monsterStaticChance(mob) {
  const mi = moveInfo(mob.slug);
  return mi.staticAttack === undefined ? 90 : mi.staticAttack;
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
  } else if (dist > td) {
    // 2. longe: aproxima
    dir = stepToward(mob, alvo.cx, alvo.cy, occ);
  } else if (dist < td) {
    // 3. perto demais para um atirador: recua
    dir = stepAway(mob, alvo, occ);
  } else {
    // 4. na distancia certa: danca, se o dado deixar
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
  // MODO BOX: segue a formação tática (knight no centro, RP nas retas a
  // 2 SQM, magos na posição de área) — igual aos aliados.
  if (modo === "box") {
    return boxThinkStep(c, pl, alvo, occ, now);
  }
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
 * Melee = 1 (inclui diagonal, por Chebyshev), distancia = 6, magia = 6
 * (o 15.25 aumentou o alcance das wands e rods: "recebem maior alcance"). */
function playerRangeSQM(p) {
  if (typeof playerDamage !== "function") return 1;
  const d = playerDamage(p);
  if (d.type === "distance") {
    const w = p.equip && p.equip.weapon
      ? GAMEDATA.items[p.equip.weapon.item] : null;
    return (w && w.range) ? Math.min(7, w.range) : 6;
  }
  if (d.type === "magic") return 6;   // 15.25: wands/rods alcancam mais
  return 1;
}

/* ======================================================================
 * MODO BOX — posicionamento tático por vocação (party combat, 4 membros)
 * ======================================================================
 * Novo modo de ataque "box" (Helper → Ataque). Cada vocação tem a função
 * dela na formação:
 *   - KNIGHT: fica no MEIO da sala (spawn/centro do mapa), parado,
 *     tankando, batendo e castando exeta res + exeta amp res;
 *   - PALADIN (RP): fica a 2 SQM do knight, SEMPRE nas RETAS (N/S/L/O,
 *     nunca diagonais), na reta que pega mais alvos, batendo de longe;
 *   - DRUID/SORCERER/MONK: se posiciona (reta ou diagonal, 1-2 SQM do
 *     centro) para atingir o MÁXIMO de alvos com as magias de área (raio 3).
 * ====================================================================== */

/* Centro da "sala" do BOX: spawn do mapa (onde o knight fica) ou centro. */
function boxCenter(c) {
  if (c && c.huntMap && c.huntMap.spawn) {
    return { cx: c.huntMap.spawn.x, cy: c.huntMap.spawn.y };
  }
  const GW = (typeof GRID_W !== "undefined") ? GRID_W : 21;
  const GH = (typeof GRID_H !== "undefined") ? GRID_H : 13;
  return { cx: Math.floor(GW / 2), cy: Math.floor(GH / 2) };
}

/* A entidade knight da party (referência da formação). */
function boxKnightEnt(c) {
  if (!c || !c.players) return null;
  return c.players.find((e) => e.p && e.p.hp > 0 &&
    (e.p.voc === "knight" || e.p.voc === "elite knight")) || null;
}

/* Quantos mobs vivos estão a distância Chebyshev <= r de (cx, cy). */
function boxCountMobs(c, cx, cy, r) {
  let n = 0;
  for (const m of (c && c.mobs) || []) {
    if (m.hp <= 0 || m.cx === undefined) continue;
    if (Math.max(Math.abs(m.cx - cx), Math.abs(m.cy - cy)) <= r) n++;
  }
  return n;
}

/* Célula livre (bounds + sem ocupação). */
function boxCellLivre(cx, cy, occ) {
  if (typeof inBounds === "function" && !inBounds(cx, cy)) return false;
  if (occ && occ.has(cx + ":" + cy)) return false;
  return true;
}

/* Posição-alvo do BOX por vocação. Reavaliada a cada ~1s. */
function boxTargetCell(c, ent, occ) {
  const p = ent && ent.p;
  if (!p) return null;
  const voc = p.voc;
  const centro = boxCenter(c);
  const knight = boxKnightEnt(c);
  const base = knight || centro;

  if (voc === "knight" || voc === "elite knight") {
    return { cx: base.cx, cy: base.cy };
  }

  // PALADIN: RETAS a 2 SQM do knight (nunca diagonais), na reta com mais
  // mobs à frente (raio do ataque de distância).
  if (voc === "paladin" || voc === "royal paladin") {
    const retas = [
      { cx: base.cx, cy: base.cy - 2 },
      { cx: base.cx, cy: base.cy + 2 },
      { cx: base.cx - 2, cy: base.cy },
      { cx: base.cx + 2, cy: base.cy },
    ];
    let melhor = null, melhorN = -1;
    for (const r of retas) {
      if (!boxCellLivre(r.cx, r.cy, occ)) continue;
      const n = boxCountMobs(c, r.cx, r.cy, 6);
      if (n > melhorN) { melhorN = n; melhor = r; }
    }
    if (!melhor) {
      melhor = retas.find((r) => boxCellLivre(r.cx, r.cy, occ)) ||
               { cx: base.cx + 2, cy: base.cy };
    }
    return melhor;
  }

  // DRUID/SORCERER/MONK: célula (reta ou diagonal, 1-2 SQM do centro) que
  // maximiza mobs dentro do raio de área (3 SQM — as magias 3x3 do Canary).
  let melhor = null, melhorN = -1;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const cx = base.cx + dx, cy = base.cy + dy;
      if (!boxCellLivre(cx, cy, occ)) continue;
      const n = boxCountMobs(c, cx, cy, 3);
      if (n > melhorN) { melhorN = n; melhor = { cx, cy }; }
    }
  }
  if (!melhor) {
    // sem mobs: fica perto do knight, numa reta (como o RP)
    const retas = [
      { cx: base.cx + 2, cy: base.cy }, { cx: base.cx, cy: base.cy + 2 },
      { cx: base.cx - 2, cy: base.cy }, { cx: base.cx, cy: base.cy - 2 },
    ];
    melhor = retas.find((r) => boxCellLivre(r.cx, r.cy, occ)) || base;
  }
  return melhor;
}

/* Passo do modo BOX: vai para a posição da formação e FICA parado lá
 * atacando (knight no centro, RP nas retas, magos na posição de área).
 * Reavalia a posição a cada ~1s (os mobs andam, a melhor célula muda). */
function boxThinkStep(c, ent, alvo, occ, now) {
  if (!ent) return false;
  ensureCell(ent);
  if (ent.moving) return false;
  if (ent.nextStepAt && now < ent.nextStepAt) return false;
  if (!ent._boxAt || now - ent._boxAt > 1000) {
    ent._boxAt = now;
    ent._boxTarget = boxTargetCell(c, ent, occ);
  }
  const alvoCel = ent._boxTarget;
  if (!alvoCel) return false;
  if (ent.cx === alvoCel.cx && ent.cy === alvoCel.cy) {
    // parado na posição: encara o alvo de ataque e espera
    if (alvo) ent.dir = dirTo(ent, alvo);
    ent.nextStepAt = now + 250;
    return false;
  }
  const dir = stepToward(ent, alvoCel.cx, alvoCel.cy, occ);
  if (!dir) {
    if (alvo) ent.dir = dirTo(ent, alvo);
    ent.nextStepAt = now + 250;
    return false;
  }
  ent.speedPts = 110 + Math.min(200, (ent.p && ent.p.level) || 1);
  const ok = beginStep(ent, dir, occ, false);
  ent.nextStepAt = now + (ok ? ent.stepDur : 250);
  return ok;
}

/* Tick de movimento de toda a cena. Substitui updateCombatMovement. */
function updateGridMovement(c, p, dt, now) {
  if (!c.player) return;
  now = now || Date.now();
  ensureCell(c.player);
  // O jogador nao esta em MOBSHEETS (usa o catalogo de outfits), entao o
  // ensureCell nao consegue descobrir sozinho o tamanho do ciclo. Sem isto o
  // advanceStep cairia no padrao de 2 quadros e a caminhada ficaria picotada
  // justamente nas outfits de 8 quadros.
  if (typeof walkFrameCount === "function") {
    c.player.walkFrames = walkFrameCount(p);
  }

  c.player.attackAnim = Math.max(0, (c.player.attackAnim || 0) - dt);
  for (const m of c.mobs) {
    m.attackAnim = Math.max(0, (m.attackAnim || 0) - dt);
    ensureCell(m);
  }

  // interpola quem esta no meio de um passo
  advanceStep(c.player, dt);
  if (c.players && c.players.length > 1) {
    for (const e of c.players) {
      if (e !== c.player && e.p && e.p.hp > 0) advanceStep(e, dt);
    }
  }
  for (const m of c.mobs) advanceStep(m, dt);

  const occ = buildOccupancy(c);
  const vivos = c.mobs.filter((m) => m.hp > 0);
  const alvo = vivos.length ? vivos[0] : null;

  // MODO BOX: o personagem ATIVO também segue a formação (o playerThinkStep
  // delega para o boxThinkStep quando attackMode === "box").
  playerThinkStep(c, p, alvo, occ, now);

  // PARTY COMBAT: os aliados andam sozinhos até o alvo (cada um com o
  // alcance da própria arma) — ou seguem a formação BOX — e os MONSTROS
  // perseguem o alvo que escolheram (o mais próximo).
  if (c.players && c.players.length > 1) {
    for (const ent of c.players) {
      if (ent === c.player || !ent.p || ent.p.hp <= 0) continue;
      if (ent.p.config && ent.p.config.attackMode === "box") {
        boxThinkStep(c, ent, alvo, occ, now);
      } else {
        allyThinkStep(c, ent, alvo, occ, now);
      }
    }
  }
  for (const m of vivos) {
    const alvoMob = (m.target && m.target.p && m.target.p.hp > 0)
      ? m.target : c.player;
    monsterThinkStep(c, m, alvoMob, occ, now);
  }
}

/* Passo de um ALIADO do party combat: persegue o alvo até o alcance da
 * arma dele e fica parado atacando (como o playerThinkStep em modo chase,
 * sem configurações de kiting/stand). */
function allyThinkStep(c, ent, alvo, occ, now) {
  if (!ent || !alvo) return;
  ensureCell(ent);
  if (ent.moving) return;
  if (ent.nextStepAt && now < ent.nextStepAt) return;
  const alcance = (typeof partyAllyRangeSQM === "function")
    ? partyAllyRangeSQM(ent) : 1;
  const dist = sqmDistance(ent, alvo);
  if (dist <= alcance) {
    ent.dir = dirTo(ent, alvo);
    ent.nextStepAt = now + 250;
    return;
  }
  const dir = stepToward(ent, alvo.cx, alvo.cy, occ);
  if (!dir) {
    ent.dir = dirTo(ent, alvo);
    ent.nextStepAt = now + 200;
    return;
  }
  ent.speedPts = 110 + Math.min(200, (ent.p && ent.p.level) || 1);
  const ok = beginStep(ent, dir, occ, false);
  ent.nextStepAt = now + (ok ? ent.stepDur : 200);
}
