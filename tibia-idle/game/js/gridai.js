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
  // Exeta Amp Res força criaturas ranged a encostar no knight enquanto o
  // challenge estiver ativo, como o forceTarget do Canary.
  if (mob.forceMeleeUntil && mob.forceMeleeUntil > Date.now()) return 1;
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
  // O idle roda em ticks curtos: usar o valor cru do Canary deixava a
  // "dança" visualmente muito mais frequente que no servidor. Acrescentamos
  // uma margem conservadora e mantemos ao menos 95% de pausa entre passos.
  return Math.min(99, Math.max(95, (mi.staticAttack === undefined ? 90 : mi.staticAttack) + 7));
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

/* Escolhe o alvo vivo mais próximo que o monstro consegue alcançar. O
 * Canary não mantém target inalcançável: se uma parede/corredor fecha a rota,
 * retoma o alvo mais próximo com caminho em vez de ficar parado. */
function monsterReachableTarget(c, mob, occ, preferred) {
  const candidates = (c.players && c.players.length ? c.players : [c.player])
    .filter((e) => e && (!e.p || e.p.hp > 0) && e.cx !== undefined && e.cy !== undefined);
  candidates.sort((a, b) => sqmDistance(mob, a) - sqmDistance(mob, b));
  const range = monsterRangeSQM(mob);
  for (const ent of candidates) {
    if (sqmDistance(mob, ent) <= range) return ent;
    // findPathGrid aceita a célula ocupada pelo alvo como destino.
    if (typeof findPathGrid === "function" && findPathGrid(mob, ent.cx, ent.cy, occ)) return ent;
  }
  return preferred || candidates[0] || null;
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
    mob.nextStepAt = now + 450;
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
  // MODO BOX / SAFE: segue a formação tática (knight no melhor spot do
  // centro, RP nas retas a 2 SQM, ED/MS a 4 SQM reta — ou SAFE nos cantos
  // da tela). O modo de hunt pode vir do modal de instância (c.huntMode).
  const fm = formationMode(c, { p: p });
  if (fm === "box") return boxThinkStep(c, pl, alvo, occ, now);
  if (fm === "safe") return safeThinkStep(c, pl, alvo, occ, now);

  // v33: remoção do Chase/Stand — o personagem SEMPRE fica em STAND: parado
  // encarando o alvo; só anda quando o alvo sai do alcance (persegue para
  // manter o ataque). Kiting continua (distância escolhida pelo jogador).
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
    // stand: persegue o alvo apenas quando ele sai do alcance do ataque
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
 * MODO BOX / SAFE — posicionamento tático por vocação (party combat)
 * ======================================================================
 * Novos modos de ataque (Helper → Ataque → Modo de Hunt):
 *   - BOX: cada vocação assume a posição dela na formação —
 *       KNIGHT: faz uma CHECAGEM de células (x/y) ao redor do centro e
 *         para no MELHOR SPOT (mais mobs no alcance do exeta/bate), parado
 *         tankando e castando exeta res + exeta amp res;
 *       PALADIN (RP): a 2 SQM do knight, SEMPRE nas RETAS (nunca
 *         diagonais), na reta que pega mais alvos;
 *       DRUID/SORCERER/MONK: na célula que atinge o MÁXIMO de alvos com as
 *         magias de área (raio 3);
 *   - SAFE: o personagem vai para os CANTOS da tela, LONGE da box, mas
 *     ainda dentro do alcance das spells (raio 7) — farma do canto.
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

/* MODO DE HUNT ativo para uma entidade: "box", "safe" ou "" (nenhum).
 * O modo pode vir do config do personagem OU do modo escolhido no modal de
 * instância da hunt (c.huntMode) — vale para a party inteira. */
function formationMode(c, ent) {
  const m = ent && ent.p && ent.p.config ? ent.p.config.attackMode : "";
  if (m === "box" || m === "safe") return m;
  if (c && c.huntMode && (c.huntMode === "box" || c.huntMode === "safe")) {
    return c.huntMode;
  }
  return "";
}

/* Pontuação tática da posição do knight. Além de concentrar a box, a
 * adjacência livre é importante: cada tile livre é um monstro que ele pode
 * segurar sem bloquear a linha das waves dos aliados. */
function knightBoxScore(c, cell, occ, base) {
  const n7 = boxCountMobs(c, cell.cx, cell.cy, 7);
  const n1 = boxCountMobs(c, cell.cx, cell.cy, 1);
  let livres = 0;
  for (const d of DIRS) if (boxCellLivre(cell.cx + d.dx, cell.cy + d.dy, occ)) livres++;
  return n7 * 100 + n1 * 65 + livres * 35 -
    (Math.abs(cell.cx - base.cx) + Math.abs(cell.cy - base.cy));
}

/* MELHOR SPOT do KNIGHT (BOX): varre a sala e privilegia concentração de
 * mobs E os oito tiles ao redor disponíveis para tankar a box inteira. */
function boxKnightSpot(c, occ, base) {
  base = base || boxCenter(c);
  let melhor = null, melhorScore = -Infinity;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const cell = { cx: base.cx + dx, cy: base.cy + dy };
    if (occ && !boxCellLivre(cell.cx, cell.cy, occ)) continue;
    const score = knightBoxScore(c, cell, occ, base);
    if (score > melhorScore) { melhorScore = score; melhor = cell; }
  }
  return melhor || { cx: base.cx, cy: base.cy };
}

function adjacentMobs(c, cell) { return boxCountMobs(c, cell.cx, cell.cy, 1); }

/* Conta alvos no corredor da wave que sai do caster em direção ao knight.
 * A largura de 3 SQMs representa a faixa das waves; isso diferencia uma
 * posição que só "vê" mobs de outra que realmente atravessa a box. */
function waveLineHits(c, from, knight) {
  if (!knight) return 0;
  const horizontal = from.cx !== knight.cx;
  const sign = horizontal ? Math.sign(knight.cx - from.cx) : Math.sign(knight.cy - from.cy);
  let hits = 0;
  for (const m of c.mobs || []) {
    if (m.hp <= 0) continue;
    const forward = horizontal ? (m.cx - from.cx) * sign : (m.cy - from.cy) * sign;
    const lateral = horizontal ? Math.abs(m.cy - from.cy) : Math.abs(m.cx - from.cx);
    if (forward >= 1 && forward <= 7 && lateral <= 1) hits++;
  }
  return hits;
}

function mageBoxScore(c, cell, knight) {
  // Segurança vem antes de dano: uma wave ótima não vale um mage cercado.
  return boxCountMobs(c, cell.cx, cell.cy, 3) * 10 +
    waveLineHits(c, cell, knight) * 28 - adjacentMobs(c, cell) * 80;
}

/* Posição-alvo do BOX por vocação. Knight tanque central; RP em reta a 2;
 * mages/monk em reta a 3, escolhendo a linha que corta a maior parte da box. */
function boxTargetCell(c, ent, occ) {
  const p = ent && ent.p;
  if (!p) return null;
  const voc = p.voc;
  const centro = boxCenter(c);
  const knight = boxKnightEnt(c);
  const base = knight || centro;
  if (voc === "knight" || voc === "elite knight") return boxKnightSpot(c, occ, base);

  // RP mantém 2 SQM do knight; Mages (ED/MS) e Monk ficam a 3.
  const distancia = (voc === "paladin" || voc === "royal paladin") ? 2 : 3;
  const retas = [
    { cx: base.cx + distancia, cy: base.cy }, { cx: base.cx - distancia, cy: base.cy },
    { cx: base.cx, cy: base.cy + distancia }, { cx: base.cx, cy: base.cy - distancia },
  ];
  let melhor = null, scoreMelhor = -Infinity;
  for (const r of retas) {
    if (!boxCellLivre(r.cx, r.cy, occ)) continue;
    const score = distancia === 2
      ? boxCountMobs(c, r.cx, r.cy, 6) * 12 - adjacentMobs(c, r) * 35
      : mageBoxScore(c, r, base);
    if (score > scoreMelhor) { scoreMelhor = score; melhor = r; }
  }
  return melhor || retas.find((r) => boxCellLivre(r.cx, r.cy, occ)) || base;
}

/* Score comparável usado pela histerese: só abandonamos um bom tile quando
 * o novo é materialmente melhor, em vez de correr atrás de cada mob. */
function boxTargetScore(c, ent, cell, occ) {
  if (!cell || !ent || !ent.p) return -Infinity;
  const knight = boxKnightEnt(c), base = knight || boxCenter(c);
  const voc = ent.p.voc;
  if (voc === "knight" || voc === "elite knight") return knightBoxScore(c, cell, occ, base);
  if (voc === "paladin" || voc === "royal paladin")
    return boxCountMobs(c, cell.cx, cell.cy, 6) * 12 - adjacentMobs(c, cell) * 35;
  return mageBoxScore(c, cell, base);
}

/* Posição-alvo do modo SAFE: um dos CANTOS da tela, LONGE da box, mas
 * ainda dentro do alcance das spells (raio 7). Escolhe o canto livre com
 * MAIS mobs no range; empate → o mais longe da box (mais seguro). */
function safeTargetCell(c, ent, occ) {
  const GW = (typeof GRID_W !== "undefined") ? GRID_W : 21;
  const GH = (typeof GRID_H !== "undefined") ? GRID_H : 13;
  const centro = boxCenter(c);
  const cantos = [
    { cx: 2, cy: 2 }, { cx: GW - 3, cy: 2 },
    { cx: 2, cy: GH - 3 }, { cx: GW - 3, cy: GH - 3 },
  ];
  let melhor = null, melhorN = -1, melhorDist = -1;
  for (const q of cantos) {
    if (!boxCellLivre(q.cx, q.cy, occ)) continue;
    const n = boxCountMobs(c, q.cx, q.cy, 7);   // range das spells/runas
    const dist = Math.max(Math.abs(q.cx - centro.cx), Math.abs(q.cy - centro.cy));
    if (n > melhorN || (n === melhorN && dist > melhorDist)) {
      melhorN = n; melhorDist = dist; melhor = q;
    }
  }
  if (!melhor) {
    // todos os cantos ocupados: acha a célula livre mais perto de um canto
    for (let r = 1; r <= 4; r++) {
      for (const q of cantos) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const cx = q.cx + dx, cy = q.cy + dy;
            if (boxCellLivre(cx, cy, occ)) return { cx, cy };
          }
        }
      }
    }
    return { cx: 2, cy: 2 };
  }
  return melhor;
}

/* Passo genérico de formação: vai para a posição do alvo e FICA parado lá
 * atacando. Reavalia a cada ~1s (os mobs andam, o melhor spot muda). */
function formationThinkStep(c, ent, alvo, occ, now, targetFn) {
  if (!ent) return false;
  ensureCell(ent);
  if (ent.moving) return false;
  if (ent.nextStepAt && now < ent.nextStepAt) return false;
  if (!ent._boxAt || now - ent._boxAt > 1800) {
    ent._boxAt = now;
    // A própria célula não pode ser tratada como bloqueada. Sem isso o
    // melhor tile atual nunca era elegível e a formação se reposicionava sem
    // motivo a cada reavaliação.
    const planningOcc = buildOccupancy(c, ent);
    // Reservas evitam que dois aliados escolham a mesma excelente reta antes
    // de qualquer um chegar nela. A reserva é só planejamento, não atributo.
    // Snapshots antigos serializavam Map como `{}`; normalize sempre para que
    // retomar uma instância não tente chamar delete/forEach em um objeto comum.
    if (!(c._formationReservations instanceof Map))
      c._formationReservations = new Map();
    c._formationReservations.delete(ent);
    c._formationReservations.forEach((cell) => planningOcc.set(cell.cx + ":" + cell.cy, true));
    const candidato = targetFn(c, ent, planningOcc);
    const novoScore = targetFn === boxTargetCell ? boxTargetScore(c, ent, candidato, planningOcc) : 0;
    const atualScore = targetFn === boxTargetCell ? boxTargetScore(c, ent, ent._boxTarget, planningOcc) : -Infinity;
    // Histerese de 20%: estabilidade é preferível a uma melhoria marginal.
    if (!ent._boxTarget || novoScore >= atualScore * 1.20) ent._boxTarget = candidato;
    if (ent._boxTarget) c._formationReservations.set(ent, ent._boxTarget);
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

/* Passo do modo BOX. */
function boxThinkStep(c, ent, alvo, occ, now) {
  return formationThinkStep(c, ent, alvo, occ, now, boxTargetCell);
}

/* Passo do modo SAFE. */
function safeThinkStep(c, ent, alvo, occ, now) {
  return formationThinkStep(c, ent, alvo, occ, now, safeTargetCell);
}

/* Tick de movimento de toda a cena. Substitui updateCombatMovement. */
function updateGridMovement(c, p, dt, now) {
  if (!c.player) return;
  now = now || Date.now();
  const activeAlive = (!c.player.p || c.player.p.hp > 0) && (!p || p.hp > 0);
  if (activeAlive) {
    ensureCell(c.player);
    repairBlockedMapPosition(c, c.player);
    // O jogador nao esta em MOBSHEETS (usa o catalogo de outfits), entao o
    // ensureCell nao consegue descobrir sozinho o tamanho do ciclo.
    if (typeof walkFrameCount === "function") c.player.walkFrames = walkFrameCount(p);
    c.player.attackAnim = Math.max(0, (c.player.attackAnim || 0) - dt);
  } else {
    // Morto não recebe AI, passo/interpolação nem permanece como "fantasma".
    c.player.moving = false;
    c.player.stepT = 0;
  }
  for (const m of c.mobs) {
    m.attackAnim = Math.max(0, (m.attackAnim || 0) - dt);
    ensureCell(m);
    repairBlockedMapPosition(c, m);
  }
  if (c.players && c.players.length > 1) {
    for (const e of c.players) {
      if (!e || !e.p || e.p.hp <= 0) continue;
      ensureCell(e);
      repairBlockedMapPosition(c, e);
    }
  }

  // Interpola somente entidade viva; corpse permanece imóvel no SQM da morte.
  if (activeAlive) advanceStep(c.player, dt);
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
  if (activeAlive) playerThinkStep(c, p, alvo, occ, now);

  // PARTY COMBAT: os aliados andam sozinhos até o alvo (cada um com o
  // alcance da própria arma) — ou seguem a formação BOX/SAFE — e os
  // MONSTROS perseguem o alvo que escolheram (o mais próximo).
  if (c.players && c.players.length > 1) {
    for (const ent of c.players) {
      if (ent === c.player || !ent.p || ent.p.hp <= 0) continue;
      const fm = formationMode(c, ent);
      if (fm === "box") {
        boxThinkStep(c, ent, alvo, occ, now);
      } else if (fm === "safe") {
        safeThinkStep(c, ent, alvo, occ, now);
      } else {
        allyThinkStep(c, ent, alvo, occ, now);
      }
    }
  }
  for (const m of vivos) {
    // Target morto não mantém vaga nem atenção: escolhe instantaneamente o
    // membro vivo mais próximo, inclusive quando o personagem ativo caiu.
    const preferred = (typeof partyNearestTarget === "function")
      ? partyNearestTarget(c, m)
      : ((m.target && m.target.p && m.target.p.hp > 0) ? m.target : c.player);
    const alvoMob = monsterReachableTarget(c, m, occ, preferred);
    m.target = alvoMob;
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
