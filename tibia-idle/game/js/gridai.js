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

/* v37: monstros ficam mais PARADOS antes de se mover — o tempo de espera
 * entre passos quando o bicho está parado subiu de 200ms para 600ms, e a
 * chance de ficar parado em vez de "dançar" subiu de 90% para 96% (piso de
 * 90% mesmo nos dados do Canary). Menos agitação na cena. */
const MOB_STAND_MS = 600;

/* Chance (0-100) de ficar parado em vez de dancar */
function monsterStaticChance(mob) {
  const mi = moveInfo(mob.slug);
  const base = mi.staticAttack === undefined ? 96 : mi.staticAttack;
  return Math.max(90, base);
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
    // sem alvo: vagueia devagar (v37: bem mais raro)
    if (Math.random() < 0.10) dir = randomStep(mob, occ);
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
    // parado: encara o alvo e espera (v37: 600ms antes de se mover de novo)
    if (alvo) mob.dir = dirTo(mob, alvo);
    mob.nextStepAt = now + MOB_STAND_MS;
    return false;
  }

  mob.speedPts = monsterSpeedPts(mob);
  const ok = beginStep(mob, dir, occ, perto);
  if (ok) {
    mob.nextStepAt = now + mob.stepDur;
  } else {
    mob.nextStepAt = now + MOB_STAND_MS;
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
  // centro, RP nas retas a 2 SQM, magos a 3 SQM reta — ou SAFE nos cantos
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

/* Quantas das 8 adjacências de (cx,cy) estão DENTRO do mapa e livres.
 * O knight precisa da volta TODA livre para os 8 monstros do box chegarem
 * e ele tankar os 8 lados (v38). */
function boxAdjFreeCount(cx, cy, occ) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (boxCellLivre(cx + dx, cy + dy, occ)) n++;
    }
  }
  return n;
}

/* Espaço para os magos: as 4 retas cardeais. Uma reta só conta se TODAS as
 * células até 3 SQM (1, 2 e 3) estão no mapa e livres — é o corredor que o
 * mago usa para chegar e a linha da wave dele até a box (v38). */
function boxMageLanesCount(c, cx, cy, occ) {
  let n = 0;
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of dirs) {
    let ok = true;
    for (let s = 1; s <= 3; s++) {
      if (!boxCellLivre(cx + dx * s, cy + dy * s, occ)) { ok = false; break; }
    }
    if (ok) n++;
  }
  return n;
}

/* MELHOR SPOT do KNIGHT (BOX), v38: varre a SALA INTEIRA (não só 7x7) e
 * escolhe a célula livre com, em ordem de prioridade:
 *   1. MAIS adjacências livres (8 = box perfeita: tanka os 8 lados);
 *   2. MAIS corredores livres para os magos (retas a 3 SQM desimpedidas);
 *   3. MAIS mobs no alcance do exeta amp res (7 SQM) e do melee (1 SQM);
 *   4. mais perto do centro da sala (espaço para as waves dos dois lados).
 * Células com menos de 5 adjacências livres nem são consideradas (o knight
 * encostado em parede não tanka box). Retorna {cx, cy, score}. */
function boxKnightSpot(c, occ, base) {
  base = base || boxCenter(c);
  const GW = (typeof GRID_W !== "undefined") ? GRID_W : 21;
  const GH = (typeof GRID_H !== "undefined") ? GRID_H : 13;
  let melhor = null, melhorScore = -1;
  for (let cy = 0; cy < GH; cy++) {
    for (let cx = 0; cx < GW; cx++) {
      if (!boxCellLivre(cx, cy, occ)) continue;
      const adj = boxAdjFreeCount(cx, cy, occ);
      if (adj < 5) continue;   // sem espaço mínimo p/ tankar box, descarta
      const lanes = boxMageLanesCount(c, cx, cy, occ);
      const n7 = boxCountMobs(c, cx, cy, 7);
      const n1 = boxCountMobs(c, cx, cy, 1);
      const dist = Math.max(Math.abs(cx - base.cx), Math.abs(cy - base.cy));
      const score = adj * 300 + lanes * 120 + n7 * 100 + n1 * 60 - dist * 3;
      if (score > melhorScore) { melhorScore = score; melhor = { cx, cy }; }
    }
  }
  if (!melhor) return { cx: base.cx, cy: base.cy, score: 0 };
  return { cx: melhor.cx, cy: melhor.cy, score: melhorScore };
}

/* Conta mobs vivos que a WAVE RETA do caster pegaria mirando a box (v38).
 * Reusa skillWaveCells — a MESMA geometria oficial do Canary usada no dano
 * real (AreaCombat::setupArea(length, spread)) — com o caster no tile
 * candidato e o alvo no centro/knight: a wave sai na reta e cruza a box. */
function boxCountWaveMobs(c, fromCx, fromCy, toCx, toCy) {
  if (typeof skillWaveCells !== "function") {
    return boxCountMobs(c, fromCx, fromCy, 3);
  }
  const cells = skillWaveCells({ cx: fromCx, cy: fromCy },
                               { cx: toCx, cy: toCy }, 7, 2);
  let n = 0;
  for (const m of (c && c.mobs) || []) {
    if (m.hp <= 0 || m.cx === undefined || m.cy === undefined) continue;
    const k = m.cx + ":" + m.cy;
    for (const q of cells) if (q.cx + ":" + q.cy === k) { n++; break; }
  }
  return n;
}

/* Outro aliado vivo já está na célula? Usado para DISTRIBUIR os magos em
 * retas diferentes (cobrir a box por lados opostos) em vez de empilhar. */
function boxLaneOcupada(c, cx, cy) {
  if (!c || !c.players) return false;
  for (const e of c.players) {
    if (!e.p || e.p.hp <= 0) continue;
    if (e.cx === cx && e.cy === cy) return true;
  }
  return false;
}

/* Posição-alvo do BOX por vocação. Reavaliada a cada ~1,5s (com histerese
 * no formationThinkStep). Retorna {cx, cy, score} — o score alimenta a
 * histerese anti-oscilação. */
function boxTargetCell(c, ent, occ) {
  const p = ent && ent.p;
  if (!p) return null;
  const voc = p.voc;
  const centro = boxCenter(c);
  const knight = boxKnightEnt(c);
  const base = knight || centro;

  if (voc === "knight" || voc === "elite knight") {
    // v38: KNIGHT procura a melhor posição da SALA — varre tudo e escolhe
    // o spot com adjacência livre (tankar 8) + corredores para os magos.
    return boxKnightSpot(c, occ, centro);
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
      melhorN = 0;
    }
    return { cx: melhor.cx, cy: melhor.cy, score: melhorN };
  }

  // DRUID/SORCERER/MONK: RETAS a 3 SQM do knight (nunca diagonais). v38:
  // a reta escolhida é a que a WAVE RETA do mago (mirando a box) pega MAIS
  // mobs — peso 10 — + mobs no raio das magias de área (3 SQM) — peso 1.
  // Ficam parados a 3 SQMs do tanque, alinhados com a box.
  let melhor = null, melhorScore = -1;
  const retas3 = [
    { cx: base.cx + 3, cy: base.cy }, { cx: base.cx - 3, cy: base.cy },
    { cx: base.cx, cy: base.cy + 3 }, { cx: base.cx, cy: base.cy - 3 },
  ];
  for (const r of retas3) {
    if (!boxCellLivre(r.cx, r.cy, occ)) continue;
    const nWave = boxCountWaveMobs(c, r.cx, r.cy, base.cx, base.cy);
    const nArea = boxCountMobs(c, r.cx, r.cy, 3);
    let score = nWave * 10 + nArea;
    // distribui os magos: reta já ocupada por outro aliado perde um pouco
    if (boxLaneOcupada(c, r.cx, r.cy)) score -= 40;
    if (score > melhorScore) { melhorScore = score; melhor = r; }
  }
  if (!melhor) {
    // sem reta livre: procura perto (2-3 SQM) mantendo reta sempre que
    // possível; último caso, perto do knight numa reta
    for (const r of retas3) {
      if (boxCellLivre(r.cx, r.cy, occ)) { melhor = r; break; }
    }
    if (!melhor) {
      const retas2 = [
        { cx: base.cx + 2, cy: base.cy }, { cx: base.cx - 2, cy: base.cy },
        { cx: base.cx, cy: base.cy + 2 }, { cx: base.cx, cy: base.cy - 2 },
      ];
      melhor = retas2.find((r) => boxCellLivre(r.cx, r.cy, occ)) || base;
    }
    melhorScore = 0;
  }
  return { cx: melhor.cx, cy: melhor.cy, score: melhorScore };
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
            if (boxCellLivre(cx, cy, occ)) return { cx, cy, score: 0 };
          }
        }
      }
    }
    return { cx: 2, cy: 2, score: 0 };
  }
  return { cx: melhor.cx, cy: melhor.cy, score: melhorN * 1000 + melhorDist };
}

/* Passo genérico de formação: vai para a posição do alvo e FICA parado lá
 * atacando. Reavalia a cada ~1,5s (os mobs andam, o melhor spot muda).
 *
 * v38 (anti-oscilação — "não correr sem motivo"):
 *   - reavaliação a cada 1500ms (antes 1000);
 *   - HISTERESE: só troca de destino se o novo tiver score > 20% do atual
 *     (ou se o atual ficou ocupado). O melhor spot muda a cada tick dos
 *     mobs; sem histerese o personagem corria atrás da célula "melhor" e
 *     ficava andando de um lado pro outro sem parar;
 *   - caminho bloqueado (stepToward falha): espera 500ms antes de tentar
 *     de novo, em vez de "dançar" na frente do bloqueio. */
function formationThinkStep(c, ent, alvo, occ, now, targetFn) {
  if (!ent) return false;
  ensureCell(ent);
  if (ent.moving) return false;
  if (ent.nextStepAt && now < ent.nextStepAt) return false;

  if (!ent._boxAt || now - ent._boxAt > 1500) {
    ent._boxAt = now;
    const novo = targetFn(c, ent, occ);
    if (novo) {
      const atual = ent._boxTarget;
      // o alvo atual é válido se a célula dele está livre OU o personagem
      // já ESTÁ nela (o occ inclui o próprio personagem — sem isso ele
      // "via a célula ocupada por ele mesmo" e trocava de reta para sempre)
      const naCelula = atual && ent.cx === atual.cx && ent.cy === atual.cy;
      const atualOk = atual && (naCelula || boxCellLivre(atual.cx, atual.cy, occ));
      if (!atualOk || (novo.score || 0) > (ent._boxScore || 0) * 1.2) {
        ent._boxTarget = novo;
        ent._boxScore = novo.score || 0;
      }
    }
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
    // caminho bloqueado: espera mais antes de tentar de novo
    if (alvo) ent.dir = dirTo(ent, alvo);
    ent.nextStepAt = now + 500;
    return false;
  }
  ent.speedPts = 110 + Math.min(200, (ent.p && ent.p.level) || 1);
  const ok = beginStep(ent, dir, occ, false);
  ent.nextStepAt = now + (ok ? ent.stepDur : 500);
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
