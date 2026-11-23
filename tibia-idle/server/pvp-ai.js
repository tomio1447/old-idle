"use strict";
/* ==================== PvP TACTICAL AI — CONTROL MANAGER ====================
 * FASE 1: máquina de estados de controle por personagem.
 *
 * Estados (AI_MODES):
 *   HUMAN          — jogador no controle (presença + atividade recentes).
 *   AI_PENDING     — suspeito: offline recente OU AFK suspeito; humano
 *                    ainda manda (sem takeover).
 *   AI_HARD        — IA assume: pose/walkIntent do cliente são ignorados e
 *                    o goal autoritativo dirige o char.
 *   HUMAN_RETURNING— graça curta ao retornar: ainda IA, depois HUMAN.
 *   DEAD           — hp<=0/downUntil: sem ações; restaura o modo anterior
 *                    no respawn.
 *   DISABLED       — controle desligado manualmente.
 *
 * Sinais por char (ambos server-side, sem depender de db):
 *   _pvpDrivenAt   — última entrada `self` no visual (presença; já existia).
 *   _pvpHumanActAt — última ATIVIDADE intencional: pose que mudou de
 *                    célula/posição, walkIntent ou campo actAt explícito.
 *                    Pose idêntica ecoando (aba aberta + jogador parado)
 *                    NÃO conta — é o que separa AFK de "jogando".
 * ========================================================================== */

const AI_DRIVEN_MS = 5000;     // janela de presença do self (mesma do pvpAi antigo)
const AI_OFFLINE_MS = 8000;    // sem self há 8s → offline confirmado
const AI_SUSPECT_MS = 15000;   // sem atividade intencional há 15s → AI_PENDING
const AI_CONFIRM_MS = 45000;   // sem atividade intencional há 45s → AI_HARD
const AI_RETURN_GRACE_MS = 500;// graça do retorno humano
const AI_HYSTERESIS_MS = 10000;// sem re-takeover logo após devolver controle

const AI_MODES = {
  HUMAN: "HUMAN", AI_PENDING: "AI_PENDING", AI_HARD: "AI_HARD",
  HUMAN_RETURNING: "HUMAN_RETURNING", DEAD: "DEAD", DISABLED: "DISABLED",
};

function aiCtl(item) {
  let c = item._aiCtl;
  if (!c || typeof c !== "object") c = item._aiCtl = { mode: AI_MODES.HUMAN, since: 0, prev: AI_MODES.HUMAN };
  return c;
}
function aiSet(item, mode, now) {
  const c = aiCtl(item);
  if (c.mode === mode) return c;
  if (mode === AI_MODES.DEAD) c.prev = c.mode === AI_MODES.DEAD ? c.prev : c.mode;
  c.mode = mode; c.since = Number(now) || Date.now();
  return c;
}
/* O char está sob comando da IA? (pose/walkIntent do cliente ignorados)
 * HUMAN_RETURNING também bloqueia: na graça de retorno a pose velha do
 * cliente não pode "teleportar" o char de volta antes do handoff. */
function pvpAiBlocksPose(item) {
  const c = item._aiCtl;
  return !!(c && (c.mode === AI_MODES.AI_HARD || c.mode === AI_MODES.HUMAN_RETURNING));
}
/* O char deve receber movimento autoritativo? (AI_HARD ou offline antigo) */
function pvpAiDriven(item, now) {
  if (pvpAiBlocksPose(item)) return true;
  return !((Number(item._pvpDrivenAt) || 0) > (Number(now) || Date.now()) - AI_DRIVEN_MS);
}
/* Marca atividade intencional — usada pela máquina de estados. */
function pvpAiNoteActivity(item, now) {
  item._pvpHumanActAt = Number(now) || Date.now();
}

/* Avaliação por char — O(1) por player, roda a cada pvpBattleTick. */
function pvpAiControlTick(auth, now) {
  const pb = auth && auth.pvpBattle; if (!pb || pb.finished) return;
  now = Number(now) || Number(auth.clock) || Date.now();
  pb.aiControl = pb.aiControl || {};
  for (const item of auth.players || []) {
    if (!item || !item.p) continue;
    const c = aiCtl(item), id = String(item.id);
    // DEAD é overlay — preserva o modo anterior pro respawn.
    if (item.p.hp <= 0 || item.downUntil) {
      if (c.mode !== AI_MODES.DEAD) aiSet(item, AI_MODES.DEAD, now);
      pb.aiControl[id] = c.mode;
      continue;
    }
    if (c.mode === AI_MODES.DEAD) aiSet(item, c.prev || AI_MODES.HUMAN, now);
    if (c.mode === AI_MODES.DISABLED) { pb.aiControl[id] = c.mode; continue; }

    const driven = (Number(item._pvpDrivenAt) || 0) > now - AI_DRIVEN_MS;
    const offlineMs = now - (Number(item._pvpDrivenAt) || 0);
    let actAt = Number(item._pvpHumanActAt) || 0;
    /* Benefício da dúvida: char pilotado sem histórico (actAt=0 — recém
     * materializado) ganha o carimbo no primeiro contato; só quem FOI
     * ativo e parou pode virar AFK confirmado. */
    if (driven && actAt <= 0) actAt = item._pvpHumanActAt = now;
    const active = actAt > now - AI_SUSPECT_MS;
    const confirmedAfk = actAt > 0 && actAt <= now - AI_CONFIRM_MS;

    switch (c.mode) {
      case AI_MODES.HUMAN:
        if (!driven) {
          // Offline: a IA já assumia movimento aos 5s; o modo formaliza a
          // transição com um pending curto antes do takeover integral.
          aiSet(item, offlineMs > AI_OFFLINE_MS ? AI_MODES.AI_HARD : AI_MODES.AI_PENDING, now);
        } else if (!active) aiSet(item, AI_MODES.AI_PENDING, now);
        break;
      case AI_MODES.AI_PENDING:
        if (driven && active) { aiSet(item, AI_MODES.HUMAN, now); break; }
        if (!driven && offlineMs > AI_OFFLINE_MS) { aiSet(item, AI_MODES.AI_HARD, now); break; }
        if (confirmedAfk) aiSet(item, AI_MODES.AI_HARD, now); // AFK confirmado
        break;
      case AI_MODES.AI_HARD: {
        // Retorno humano tem prioridade: atividade nova após o takeover.
        if (actAt > c.since) {
          aiSet(item, AI_MODES.HUMAN_RETURNING, now);
          // Comandos da IA não vazam pro humano: goal/alvo/modo limpos.
          item._aiGoal = null; item._aiTargetId = null;
          if (item._pvpCtrl && item._pvpCtrl._aiOwned) item._pvpCtrl = null;
        }
        break;
      }
      case AI_MODES.HUMAN_RETURNING:
        if (now - c.since >= AI_RETURN_GRACE_MS) {
          aiSet(item, AI_MODES.HUMAN, now);
          c.returnedAt = now; // histerese — próximo pending respeita o mínimo
        }
        break;
      default: break;
    }
    /* Histerese: quem acabou de voltar não cai em PENDING/HARD nos próximos
     * AI_HYSTERESIS_MS — pausas curtas de leitura não custam o controle. */
    if ((c.mode === AI_MODES.AI_PENDING || c.mode === AI_MODES.AI_HARD) &&
        Number(c.returnedAt) > 0 && now - c.returnedAt < AI_HYSTERESIS_MS)
      aiSet(item, AI_MODES.HUMAN, now);
    pb.aiControl[id] = c.mode;
  }
}

/* ==================== FASE 2 — PERCEPTION + MEMORY ==================== */
/* Percepção compartilhada POR TIME, 1× por tick — O(n²) de inteiros
 * (distância Manhattan), barato até 100v100, e muito melhor que cada bot
 * filtrar auth.players sozinho. O objeto vai em auth._aiPercept como
 * propriedade NÃO enumerável: cache em memória, não serializa. */

const AI_HIT_MEM_MS = 6000;    // janela de dano recente na memória
const AI_MEM_HITS = 20;        // máx. de registros de dano por char
const AI_CRIT_HP = 0.55;       // aliado crítico (cura emergencial)
const AI_SUPPORT_HP = 0.75;    // aliado precisa de suporte
const AI_FOE_SIGHT = 11;       // "campo de visão" tático (alcance do target call)
const AI_PURSUE_SQ = 4;        // hostil a ≤4sqm conta como perseguidor

function aiTeamOf(item) {
  const t = Number(item && (item.pvpTeam !== undefined ? item.pvpTeam : item.team));
  return t === 1 || t === 2 ? t : 0;
}
/* maxStats é do engine (não persistido em p.maxHp) — o resolver chega por
 * injeção no pvpAiPerception (engine passa (p)=>maxStats(p)); fallback
 * usa hp/mp atuais quando o resolver não está disponível. */
function aiMaxima(item, statFn) {
  const p = item && item.p || {};
  const st = typeof statFn === "function" ? statFn(p) : null;
  return { hp: Math.max(1, Number(st && st.hp) || Number(p.maxHp) || Number(p.hp) || 1),
           mp: Math.max(1, Number(st && st.mp) || Number(p.maxMp) || Number(p.mp) || 1) };
}
function aiHpPct(item, mx) {
  mx = mx || aiMaxima(item);
  return Math.max(0, Math.min(1, (Number(item.p.hp) || 0) / mx.hp));
}
function aiMpPct(item, mx) {
  mx = mx || aiMaxima(item);
  return Math.max(0, Math.min(1, (Number(item.p.mp) || 0) / mx.mp));
}
/* Condições VISÍVEIS (o que um jogador veria no boneco). */
function aiVisibleConds(item, now) {
  const c = item.p && item.p.conditions, out = [];
  if (c) for (const k of Object.keys(c)) out.push(k);
  if ((Number(item._pvpParalyzeUntil) || 0) > now) out.push("paralyze");
  return out;
}
/* Memória temporária por char — expira pela janela, sem serviço externo. */
function aiMem(item) {
  let m = item._aiMem;
  if (!m || typeof m !== "object")
    m = item._aiMem = { hits: [], lastTargetId: null, lastAttackerId: null,
      lastAttackerAt: 0, decisionAt: 0, lastAction: null, lastActionAt: 0 };
  return m;
}
/* Hook chamado pelo engine quando um player recebe dano PvP. */
function pvpAiNoteDamage(item, dmg, srcId, now) {
  const m = aiMem(item);
  m.hits.push({ t: Number(now) || Date.now(), dmg: Math.max(0, Math.floor(Number(dmg) || 0)),
    src: srcId ? String(srcId) : null });
  if (m.hits.length > AI_MEM_HITS) m.hits.splice(0, m.hits.length - AI_MEM_HITS);
  if (srcId) { m.lastAttackerId = String(srcId); m.lastAttackerAt = Number(now) || Date.now(); }
}
/* Dano recebido nos últimos winMs — poda expirados de passagem. */
function aiRecentDamage(item, now, winMs) {
  const m = item._aiMem; if (!m || !m.hits || !m.hits.length) return { total: 0, hits: 0, topSrc: null };
  now = Number(now) || Date.now(); winMs = Number(winMs) || AI_HIT_MEM_MS;
  let total = 0, hits = 0, top = null, topDmg = 0;
  for (let i = m.hits.length - 1; i >= 0; i--) {
    const h = m.hits[i];
    if (now - h.t > winMs) { m.hits.splice(0, i + 1); break; }
    total += h.dmg; hits++;
    if (h.src && h.dmg >= topDmg) { topDmg = h.dmg; top = h.src; }
  }
  return { total, hits, topSrc: top };
}
/* Resumo de um char para a percepção (posição snapshot do tick). */
function _mkSight(item, now, statFn) {
  const dead = (Number(item.p.hp) || 0) <= 0 || !!item.downUntil;
  const mx = aiMaxima(item, statFn);
  return { id: String(item.id), item, team: aiTeamOf(item), dead,
    hpPct: aiHpPct(item, mx), mpPct: aiMpPct(item, mx),
    voc: String(item.p.voc || "").toLowerCase(),
    cond: aiVisibleConds(item, now),
    cx: Number(item.cx) || 0, cy: Number(item.cy) || 0,
    ctl: (item._aiCtl && item._aiCtl.mode) || "HUMAN",
    foesNear: 0, alliesNear: 0, nearestFoe: 99, nearestFoeId: null,
    isolated: false, critical: false, needsSupport: false };
}

/* Percepção da batalha — 1× por tick (chave auth.clock). statFn resolve
 * os máximos reais (engine injeta maxStats; sem ele, cai no hp atual). */
function pvpAiPerception(auth, now, statFn) {
  now = Number(now) || Number(auth.clock) || Date.now();
  const clock = Number(auth.clock) || now;
  let pc = auth._aiPercept;
  if (pc && pc.clock === clock) return pc;
  pc = { clock, teams: { 1: null, 2: null }, byId: {} };
  const mk = () => ({ members: [], alive: [], critical: [] });
  pc.teams[1] = mk(); pc.teams[2] = mk();
  for (const item of auth.players || []) {
    if (!item || !item.p) continue;
    const s = _mkSight(item, now, statFn), team = s.team;
    if (!pc.byId[s.id]) pc.byId[s.id] = s;
    if (team === 1 || team === 2) pc.teams[team].members.push(s);
  }
  /* Pares aliado×hostil: ameaça próxima, isolamento, alvo mais próximo.
   * Raio de "percepção" = AI_FOE_SIGHT (o que um jogador enxerga na tela). */
  for (const t of [1, 2]) {
    const g = pc.teams[t], foes = pc.teams[t === 1 ? 2 : 1].members;
    for (const s of g.members) {
      for (const f of foes) {
        if (f.dead) continue;
        const d = Math.abs(f.cx - s.cx) + Math.abs(f.cy - s.cy);
        if (d < s.nearestFoe) { s.nearestFoe = d; s.nearestFoeId = f.id; }
        if (d <= AI_FOE_SIGHT) s.foesNear++;
      }
      for (const a of g.members) {
        if (a === s || a.dead) continue;
        const d = Math.abs(a.cx - s.cx) + Math.abs(a.cy - s.cy);
        if (d <= AI_FOE_SIGHT) s.alliesNear++;
      }
      s.isolated = !s.dead && s.alliesNear === 0;
      s.critical = !s.dead && s.hpPct < AI_CRIT_HP;
      s.needsSupport = !s.dead && s.hpPct < AI_SUPPORT_HP;
    }
    g.alive = g.members.filter((m) => !m.dead);
    g.critical = g.members.filter((m) => m.critical).sort((a, b) => a.hpPct - b.hpPct);
  }
  /* Cache não-enumerável: não entra no JSON do checkpoint (é derivado). */
  Object.defineProperty(auth, "_aiPercept",
    { value: pc, writable: true, enumerable: false, configurable: true });
  return pc;
}

/* Visão tática POR CHAR — o que a IA "enxerga" daquele personagem.
 * Nada de estado oculto: hpPct/voc/cond do inimigo = o que um jogador
 * real veria (barra de hp, outfit, efeitos). */
function pvpAiPerceive(auth, item, pc) {
  pc = pc || pvpAiPerception(auth);
  const s = pc.byId[String(item.id)]; if (!s) return null;
  const pb = auth.pvpBattle || {};
  const myTeam = pc.teams[s.team] || { members: [], alive: [], critical: [] };
  const foeTeam = pc.teams[s.team === 1 ? 2 : 1] || { members: [], alive: [] };
  const dmg = aiRecentDamage(item, pc.clock, AI_HIT_MEM_MS);
  // Hostis ordenados por distância (dentro do campo de visão).
  const foes = foeTeam.alive
    .map((f) => ({ s: f, d: Math.abs(f.cx - s.cx) + Math.abs(f.cy - s.cy) }))
    .filter((f) => f.d <= AI_FOE_SIGHT)
    .sort((a, b) => a.d - b.d);
  // Perseguidores: hostis colados em mim (ou me dando dano recente).
  const pursuers = foes.filter((f) => f.d <= AI_PURSUE_SQ);
  if (dmg.topSrc && !pursuers.some((f) => f.s.id === dmg.topSrc)) {
    const src = pc.byId[dmg.topSrc];
    if (src && !src.dead) pursuers.push({ s: src, d: Math.abs(src.cx - s.cx) + Math.abs(src.cy - s.cy) });
  }
  return {
    now: pc.clock, self: s, team: s.team,
    ctl: (item._aiCtl && item._aiCtl.mode) || "HUMAN",
    battle: { mode: pb.mode || null, scores: pb.scores || {},
      targetId: pb.teams && pb.teams[s.team] ? pb.teams[s.team].targetId : null,
      holder: Number(pb.holder) || 0,
      inControl: s.team === (Number(pb.holder) || 0) },
    allies: myTeam.alive, critAllies: myTeam.critical,
    foes, nearestFoe: foes[0] || null, pursuers,
    dmgTaken: dmg.total, dmgHits: dmg.hits, topAttacker: dmg.topSrc,
    isolated: s.isolated, critical: s.critical, needsSupport: s.needsSupport,
    paralyzed: s.cond.indexOf("paralyze") >= 0,
    mem: aiMem(item),
  };
}

/* ==================== FASE 3 — DECISION ENGINE (UTILITY AI) ====================
 * Utility scoring sobre a visão tática. A decisão produz:
 *   - item._aiGoal  — goal de movimento no MESMO shape de pvpBattleGoal
 *                     ({cx,cy,td,push|follow|retreat|protect|hold}) — a
 *                     execução continua sendo pvpStepToward/walkToward;
 *   - item._aiTargetId — alvo individual (só vale quando não há target call);
 *   - item._pvpCtrl.mode — vocabulário de cast já existente (ue/sd/heal/
 *                     paralyze/bow/xbow) — reusa tryUseRune/nextComboSpell.
 * Estabilidade: stickiness da ação anterior + histerese de alvo, cadência
 * AI_DECIDE_MS por char (stagger natural: cada char tem seu relógio).
 * ========================================================================== */

const AI_DECIDE_MS = 350;        // decisão individual a cada ≥350ms
const AI_GOAL_TTL = 700;         // goal cacheado vale até a próxima decisão
const AI_FLEE_HP = 0.35;         // hp% pra considerar fuga
const AI_FINISH_HP = 0.22;       // inimigo finalizável
const AI_STICK_ACTION = 8;       // bônus de continuidade da ação atual
const AI_STICK_TARGET = 12;      // bônus de continuidade do alvo atual
const AI_PRIO = {
  SURVIVE: 100, SAVE_ALLY: 95, INTERRUPT: 90, FINISH: 85, DEFEND: 85,
  ATTACK: 75, CONTEST: 70, REPOSITION: 65, PURSUE: 40,
};

function _szCenter(auth, team) {
  const sz = auth.pvpBattle && auth.pvpBattle.safezones &&
    auth.pvpBattle.safezones[team === 2 ? 2 : 1];
  if (!sz) return null;
  return { cx: Math.floor((Number(sz.x1) + Number(sz.x2)) / 2),
           cy: Math.floor((Number(sz.y1) + Number(sz.y2)) / 2) };
}
function _vocBase(item) {
  const v = String(item.p && item.p.voc || "").toLowerCase();
  return v.indexOf("knight") >= 0 ? "knight" : v.indexOf("paladin") >= 0 ? "paladin" :
    v.indexOf("druid") >= 0 ? "druid" : v.indexOf("sorcerer") >= 0 ? "sorcerer" :
    v.indexOf("monk") >= 0 ? "monk" : v;
}
/* Score de um hostil como alvo individual: hp% baixo, alcance, isolamento,
 * foco do time e proximidade — quanto maior melhor. */
function pvpAiScoreTarget(v, foe, myReach) {
  let s = 60 - foe.s.hpPct * 40;
  if (foe.d <= myReach) s += 20;
  if (foe.s.isolated) s += 15;
  s -= foe.d * 2;
  if (foe.s.critical || foe.s.hpPct < AI_FINISH_HP) s += 12;
  const sup = /druid|sorcerer/.test(foe.s.voc) ? 8 : 0; // backline vale mais
  return s + sup;
}
/* Modo de cast (_pvpCtrl.mode) por vocação + situação — FASE 4 refina. */
function pvpAiCombatMode(v) {
  const voc = _vocBase(v.self.item);
  switch (voc) {
    case "sorcerer": return v.self.foesNear >= 3 ? "ue" : "sd";
    case "druid": return v.critAllies.some((a) => a.id !== v.self.id) ? "heal" : "sd";
    case "paladin": {
      const clumped = v.foes.filter((f) => f.d <= 4).length >= 3;
      return clumped ? "bow" : "xbow";
    }
    default: return "sd"; // knight/monk: melee — mode não governa
  }
}

/* Decide a próxima ação do char. Retorna a ação vencedora (ou null). */
function pvpAiDecide(auth, item, now) {
  const pc = pvpAiPerception(auth, now), v = pvpAiPerceive(auth, item, pc);
  if (!v || v.self.dead) return null;
  const mem = v.mem, s = v.self, pb = auth.pvpBattle || {};
  const reach = _vocBase(item) === "knight" || _vocBase(item) === "monk" ? 1 : 3;
  mem.decisionAt = now;

  const cand = [];
  const myTeam = s.team, szHome = _szCenter(auth, myTeam);

  /* SURVIVE — hp crítico sob pressão real: perseguidor colado OU burst
   * recente maior que metade do HP atual. */
  const threat = v.pursuers.length >= 1 ||
    v.dmgTaken > Math.max(1, Number(item.p.hp) || 1) * 0.5;
  if ((s.hpPct < AI_FLEE_HP || s.critical) && threat && szHome) {
    cand.push({ action: "RETREAT", prio: AI_PRIO.SURVIVE - s.hpPct * 40,
      goal: { cx: szHome.cx, cy: szHome.cy, td: 0, retreat: true } });
  }

  /* SAVE_ALLY / DEFEND — aliado crítico (que não eu) precisa de escudo:
   * intercepta na célula do aliado. Só se eu aguento (hp>45%). */
  const critOther = v.critAllies.find((a) => a.id !== s.id);
  if (critOther && s.hpPct > 0.45) {
    const d = Math.abs(critOther.cx - s.cx) + Math.abs(critOther.cy - s.cy);
    cand.push({ action: "PROTECT", prio: AI_PRIO.SAVE_ALLY - d * 2,
      goal: { cx: critOther.cx, cy: critOther.cy, td: 1, protect: true },
      allyId: critOther.id });
  }

  /* FINISH — inimigo vulnerável dentro de 8sqm. */
  const finishable = v.foes.find((f) => f.s.hpPct < AI_FINISH_HP && f.d <= 8);
  if (finishable) {
    cand.push({ action: "ATTACK", prio: AI_PRIO.FINISH,
      targetId: finishable.s.id,
      goal: { cx: finishable.s.cx, cy: finishable.s.cy, td: reach, push: true } });
  }

  /* ATTACK — target call do comandante tem prioridade estratégica;
   * sem call, melhor alvo por score. Ataque normal = push na célula do
   * alvo com alcance da vocação (mesmo shape do goal existente). */
  const callId = v.battle.targetId ? String(v.battle.targetId) : null;
  let tgt = callId && v.foes.find((f) => f.s.id === callId);
  if (!tgt) {
    let best = -1e9;
    for (const f of v.foes) {
      let sc = pvpAiScoreTarget(v, f, reach);
      if (mem.lastTargetId && f.s.id === mem.lastTargetId) sc += AI_STICK_TARGET;
      if (sc > best) { best = sc; tgt = f; }
    }
  }
  if (tgt) {
    cand.push({ action: "ATTACK", prio: callId ? AI_PRIO.ATTACK + 10 : AI_PRIO.ATTACK,
      targetId: tgt.s.id,
      goal: { cx: tgt.s.cx, cy: tgt.s.cy, td: reach, push: true } });
  }

  /* CONTEST — modo control: disputar a zona vale mais que kill solto. */
  if (v.battle.mode === "control" && !v.battle.inControl && pb.controlZone) {
    const z = pb.controlZone;
    cand.push({ action: "CONTEST", prio: AI_PRIO.CONTEST,
      goal: { cx: Number(z.cx) || 0, cy: Number(z.cy) || 0, td: 0, zone: true } });
  }

  /* HOLD — ficar parado (segurar posição sob paralyze/cerco). */
  if (v.paralyzed && v.pursuers.length === 0)
    cand.push({ action: "HOLD", prio: AI_PRIO.REPOSITION, goal: null });

  /* FOLLOW (fallback) — formação normal do engine. */
  cand.push({ action: "FOLLOW", prio: AI_PRIO.PURSUE, goal: undefined });

  /* Stickiness: ação atual ganha bônus — evita ping-pong a cada decisão. */
  for (const c of cand) if (c.action === mem.lastAction) c.prio += AI_STICK_ACTION;
  cand.sort((a, b) => b.prio - a.prio);
  const win = cand[0];

  /* Aplica efeitos colaterais da decisão. */
  mem.lastAction = win.action; mem.lastActionAt = now;
  if (win.targetId) { mem.lastTargetId = String(win.targetId); item._aiTargetId = String(win.targetId); }
  else if (win.action !== "ATTACK") item._aiTargetId = null;
  // Modo de cast: humano pode ter travado pelo painel (override respeitado).
  if (!item._pvpCtrl || !item._pvpCtrl.mode || item._pvpCtrl._aiOwned) {
    const mode = pvpAiCombatMode(v);
    item._pvpCtrl = Object.assign({}, item._pvpCtrl || {}, { mode, _aiOwned: true });
  }
  item._aiGoal = { goal: win.goal === undefined ? null : win.goal,
    follow: win.goal === undefined, action: win.action, until: now + AI_GOAL_TTL };
  return win;
}

/* Gate no topo de pvpBattleGoal: AI_HARD decide e serve o goal cacheado;
 * undefined = fluxo normal (humano/auxiliar sem takeover). */
function pvpAiGateGoal(auth, item, now) {
  const c = item && item._aiCtl;
  if (!c || c.mode !== "AI_HARD") return undefined;
  now = Number(now) || Number(auth.clock) || Date.now();
  const mem = aiMem(item);
  if (now - (Number(mem.decisionAt) || 0) >= AI_DECIDE_MS) pvpAiDecide(auth, item, now);
  const g = item._aiGoal;
  if (!g || (Number(g.until) || 0) <= now) return undefined;
  // FOLLOW delega à formação normal (pvpBattleGoal segue o fluxo comum).
  return g.follow ? undefined : g.goal;
}

module.exports = {
  AI_MODES, AI_DRIVEN_MS, AI_OFFLINE_MS, AI_SUSPECT_MS, AI_CONFIRM_MS,
  AI_RETURN_GRACE_MS, AI_HYSTERESIS_MS,
  aiCtl, aiSet, pvpAiBlocksPose, pvpAiDriven, pvpAiNoteActivity,
  pvpAiControlTick,
  AI_HIT_MEM_MS, AI_CRIT_HP, AI_SUPPORT_HP, AI_FOE_SIGHT,
  aiTeamOf, aiHpPct, aiMpPct, aiMem, pvpAiNoteDamage, aiRecentDamage,
  pvpAiPerception, pvpAiPerceive,
  AI_PRIO, AI_DECIDE_MS, pvpAiScoreTarget, pvpAiCombatMode,
  pvpAiDecide, pvpAiGateGoal,
};
