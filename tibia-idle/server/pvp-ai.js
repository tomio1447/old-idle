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
        if (actAt > c.since) aiSet(item, AI_MODES.HUMAN_RETURNING, now);
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

module.exports = {
  AI_MODES, AI_DRIVEN_MS, AI_OFFLINE_MS, AI_SUSPECT_MS, AI_CONFIRM_MS,
  AI_RETURN_GRACE_MS, AI_HYSTERESIS_MS,
  aiCtl, aiSet, pvpAiBlocksPose, pvpAiDriven, pvpAiNoteActivity,
  pvpAiControlTick,
  AI_HIT_MEM_MS, AI_CRIT_HP, AI_SUPPORT_HP, AI_FOE_SIGHT,
  aiTeamOf, aiHpPct, aiMpPct, aiMem, pvpAiNoteDamage, aiRecentDamage,
  pvpAiPerception, pvpAiPerceive,
};
