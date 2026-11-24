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
    item.p._aiCtlMode = c.mode; // acessível onde só p chega (usePotion etc)
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
  if (!m || typeof m !== "object") {
    // Memória tática é TRANSIENTE — non-enumerable pra não serializar
    // no checkpoint (hits, decisionAt, etc. não são estado persistente).
    m = { hits: [], lastTargetId: null, lastAttackerId: null,
      lastAttackerAt: 0, decisionAt: 0, lastAction: null, lastActionAt: 0 };
    Object.defineProperty(item, "_aiMem",
      { value: m, writable: true, enumerable: false, configurable: true });
  }
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
  if (!item) return null;
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
      targetId: pb.teams && pb.teams[s.team]
        ? (pb.teams[s.team].targetId || pb.teams[s.team].aiTargetId || null) : null,
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
/* ==================== FASE 4 — VOCATIONAL PROFILES ====================
 * Papel, alcance de combate e thresholds por vocação. Spells/runas não são
 * codificadas aqui — a escolha de cast usa o vocabulário _pvpCtrl.mode
 * (validado por tryUseRune/nextComboSpell com os dados reais do servidor).
 * ========================================================================== */
const AI_PROFILES = {
  /* Knight/monk: FRONTLINE — tank, iniciação, controle de espaço. Melee
   * (1sqm), protege a backline (intercepta quem encosta no healer), não
   * persegue além do follow do líder sem target call. */
  knight: { reach: 1, role: "frontline", fleeHp: 0.30, protectHp: 0.40,
    defendsBackline: true },
  monk:   { reach: 1, role: "frontline", fleeHp: 0.32, protectHp: 0.40,
    defendsBackline: true },
  /* Paladin: RANGED — dano à distância, execução. Mantém 4sqm, kite sob
   * pressão, prioriza vulnerável/isolado. */
  paladin: { reach: 3, role: "ranged", fleeHp: 0.35, protectHp: 0.55,
    kites: true },
  /* Druid: SUPPORT — cura emergencial primeiro, dano depois. Recua mais
   * cedo: o time perde o healer se ele cair. */
  druid:  { reach: 3, role: "support", fleeHp: 0.42, protectHp: 0.50,
    kites: true },
  /* Sorcerer: BURST — dano explosivo/área. Mantém 4sqm, kite sob pressão,
   * aproveita packs. */
  sorcerer: { reach: 3, role: "burst", fleeHp: 0.35, protectHp: 0.60,
    kites: true },
};
function _profile(item) {
  return AI_PROFILES[_vocBase(item)] || AI_PROFILES.knight;
}
/* Vocações de "backline" — alvo preferido da proteção do frontline. */
function _isBackline(sight) {
  return sight && /druid|sorcerer/.test(sight.voc || "");
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
/* Modo de cast (_pvpCtrl.mode) por vocação + situação — FASE 4.
 * Cluster/contagem medidos em torno do ALVO (não do caster): pack no alvo
 * → área; alvo solto → single-target; aliado crítico → cura (druid). */
function pvpAiCombatMode(v, tgtSight) {
  const voc = _vocBase(v.self.item);
  const packNear = (t, r) => t ? v.foes.filter((f) =>
    Math.abs(f.s.cx - t.cx) + Math.abs(f.s.cy - t.cy) <= r).length : 0;
  switch (voc) {
    case "sorcerer": return packNear(tgtSight, 3) >= 3 ? "ue" : "sd";
    case "druid":
      // Healer com mana real pra curar — sem mana não adianta travar em sio.
      if (v.self.mpPct > 0.15 && v.critAllies.some((a) => a.id !== v.self.id))
        return "heal";
      return "sd";
    case "paladin": return packNear(tgtSight, 3) >= 3 ? "bow" : "xbow";
    default: return "sd"; // knight/monk: melee — mode não governa
  }
}

/* Decide a próxima ação do char. Retorna a ação vencedora (ou null). */
function pvpAiDecide(auth, item, now) {
  const pc = pvpAiPerception(auth, now), v = pvpAiPerceive(auth, item, pc);
  if (!v || v.self.dead) return null;
  const mem = v.mem, s = v.self, pb = auth.pvpBattle || {};
  const prof = _profile(item), reach = prof.reach;
  mem.decisionAt = now;

  const cand = [];
  const myTeam = s.team, szHome = _szCenter(auth, myTeam);
  const coord = _aiCoord(pb, myTeam);
  const mapW = AI_MAP_WEIGHTS[pb.mode] || AI_MAP_WEIGHTS.frags;

  /* RECALL — o líder apertou REGROUP: todos os bots largam o alvo e
   * vêm pra célula do caller (perto = 2sqm). Ordem explícita vence até
   * o instinto de sobrevivência; alvos são ignorados enquanto ativa. */
  const recall = pb.teams && pb.teams[myTeam] && pb.teams[myTeam].recall;
  const recallOn = !!(recall && Number(recall.until) > now);
  if (recallOn)
    cand.push({ action: "RECALL", prio: AI_PRIO.SURVIVE + 20,
      goal: { cx: Number(recall.cx) || s.cx, cy: Number(recall.cy) || s.cy,
        td: 2, recall: true } });

  /* TEAM_RETREAT — o comandante decretou retirada: quem está ferido e
   * exposto recua junto (a retirada coletiva não deixa stragglers). */
  if (coord && coord.strategy === "retreat" && s.hpPct < 0.55 && szHome) {
    cand.push({ action: "RETREAT", prio: AI_PRIO.ATTACK + 5,
      goal: { cx: szHome.cx, cy: szHome.cy, td: 0, retreat: true, team: true } });
  }

  /* SURVIVE — hp abaixo do threshold da vocação sob pressão real:
   * perseguidor colado OU burst recente maior que metade do HP atual.
   * Druid recua mais cedo (0.42) — perder o healer derruba o time. */
  const threat = v.pursuers.length >= 1 ||
    v.dmgTaken > Math.max(1, Number(item.p.hp) || 1) * 0.5;
  if (s.hpPct < prof.fleeHp && threat && szHome) {
    cand.push({ action: "RETREAT", prio: AI_PRIO.SURVIVE - s.hpPct * 40,
      goal: { cx: szHome.cx, cy: szHome.cy, td: 0, retreat: true } });
  }

  /* SAVE_ALLY — aliado crítico (não eu): frontline intercepta colado (1sqm
   * = corpo na frente), ranged posiciona no alcance de suporte. */
  const critOther = v.critAllies.find((a) => a.id !== s.id);
  if (critOther && s.hpPct > prof.protectHp) {
    const d = Math.abs(critOther.cx - s.cx) + Math.abs(critOther.cy - s.cy);
    cand.push({ action: "PROTECT", prio: AI_PRIO.SAVE_ALLY - d * 2,
      goal: { cx: critOther.cx, cy: critOther.cy,
        td: prof.defendsBackline ? 1 : reach, protect: true },
      allyId: critOther.id });
  }

  /* DEFEND (frontline) — hostil encostado na backline (druid/sorcerer):
   * o tank empurra o agressor, não o aliado. Knight/monk apenas. */
  if (prof.defendsBackline && s.hpPct > prof.protectHp) {
    for (const a of v.allies) {
      if (a.id === s.id || !_isBackline(a)) continue;
      const bully = v.foes.find((f) =>
        Math.abs(f.s.cx - a.cx) + Math.abs(f.s.cy - a.cy) <= 2);
      if (bully) {
        cand.push({ action: "DEFEND", prio: AI_PRIO.DEFEND + 3,
          targetId: bully.s.id, allyId: a.id,
          goal: { cx: bully.s.cx, cy: bully.s.cy, td: 1, push: true, defend: true } });
        break;
      }
    }
  }

  /* KITE (ranged) — sob pressão real: hostil colado (≤2sqm) E ferido, ou
   * 2+ colados. Recua 3sqm na direção oposta — mantém alcance de cast. */
  const glued = v.pursuers.filter((f) => f.d <= 2);
  if (prof.kites && glued.length && s.hpPct > prof.fleeHp &&
      (s.hpPct < 0.75 || glued.length >= 2)) {
    const pur = glued[0].s;
    if (Math.abs(pur.cx - s.cx) + Math.abs(pur.cy - s.cy) <= 2) {
      const dx = Math.sign(s.cx - pur.cx) || (s.team === 1 ? -1 : 1);
      const dy = Math.sign(s.cy - pur.cy);
      cand.push({ action: "KITE", prio: AI_PRIO.REPOSITION + 10,
        goal: { cx: s.cx + dx * 3, cy: s.cy + dy * 3, td: 0, kite: true } });
    }
  }

  /* FINISH — inimigo vulnerável dentro de 8sqm. */
  const finishable = v.foes.find((f) => f.s.hpPct < AI_FINISH_HP && f.d <= 8);
  if (finishable && !recallOn) {
    cand.push({ action: "ATTACK", prio: AI_PRIO.FINISH + mapW.finish,
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
      // FASE 7: alvo "protegido" (≥2 escoltas coladas) é des-priorizado —
      // pressiona outro setor em vez de bater cabeça na guarda do healer.
      if (coord && coord.protectedFoes && coord.protectedFoes[f.s.id]) sc -= 15;
      if (mem.lastTargetId && f.s.id === mem.lastTargetId) sc += AI_STICK_TARGET;
      if (sc > best) { best = sc; tgt = f; }
    }
  }
  /* Em strategy "retreat" a ordem do time é recuar — ataque individual só
   * sai via FINISH (finalização segura não é suicídio). */
  if (tgt && !(coord && coord.strategy === "retreat") && !recallOn) {
    // FASE 7: no mapa de controle, perseguir longe da zona vale menos
    // (caçar kill solto entrega o território).
    const pursueAdj = !callId ? mapW.pursue : 0;
    cand.push({ action: "ATTACK", prio: (callId ? AI_PRIO.ATTACK + 10 : AI_PRIO.ATTACK) + pursueAdj,
      targetId: tgt.s.id,
      goal: { cx: tgt.s.cx, cy: tgt.s.cy, td: reach, push: true } });
  }

  /* REGROUP — time espalhado e zona disputada: reagrupa no centro da
   * massa aliada (Venore se ganha com massa na zona, não caçando solo). */
  if (coord && coord.regroup && coord.regroupCell) {
    cand.push({ action: "REGROUP", prio: AI_PRIO.CONTEST + 5,
      goal: { cx: coord.regroupCell.cx, cy: coord.regroupCell.cy, td: 0,
        regroup: true } });
  }

  /* CONTEST — modo control: disputar a zona vale mais que kill solto. */
  if (v.battle.mode === "control" && !v.battle.inControl && pb.controlZone) {
    const z = pb.controlZone;
    cand.push({ action: "CONTEST", prio: AI_PRIO.CONTEST + mapW.contest,
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

  /* FASE 5: em fuga/reposicionamento sob perseguição, pede Magic Wall na
   * célula entre eu e o perseguidor (mesma wallCalls do cliente). */
  if ((win.action === "RETREAT" || win.action === "KITE") && v.pursuers.length)
    pvpAiDefensiveWall(auth, item, v, now);

  /* Aplica efeitos colaterais da decisão. */
  mem.lastAction = win.action; mem.lastActionAt = now;
  if (win.targetId) { mem.lastTargetId = String(win.targetId); item._aiTargetId = String(win.targetId); }
  else if (win.action !== "ATTACK") item._aiTargetId = null;
  // Modo de cast: humano pode ter travado pelo painel (override respeitado).
  if (!item._pvpCtrl || !item._pvpCtrl.mode || item._pvpCtrl._aiOwned) {
    const tgtSight = win.targetId ? pc.byId[String(win.targetId)] : null;
    const mode = pvpAiCombatMode(v, tgtSight);
    if (!item._pvpCtrl || item._pvpCtrl.mode !== mode) {
      item._pvpCtrl = Object.assign({}, item._pvpCtrl || {},
        { mode, _aiOwned: true, _aiDirty: true }); // engine: pvpEquipPreset
    }
  }
  item._aiGoal = { goal: win.goal === undefined ? null : win.goal,
    follow: win.goal === undefined, action: win.action, until: now + AI_GOAL_TTL };
  return win;
}

/* ==================== FASE 5 — RESOURCE INTELLIGENCE ==================== */

/* Config de consumíveis para chars sob AI_HARD — TRANSIENT (não salva no
 * p.config): thresholds de combate + melhor potion presente na supply.
 * orders.health/mana vêm do engine (HEALTH_POTION_ORDER/MANA_POTION_ORDER)
 * — a validação lvl/voc continua em potionAllowed/consumeSupply. */
function pvpAiPotionCfg(p, orders) {
  const sup = p && p.supplies || {};
  const pick = (list) => Array.isArray(list)
    ? list.find((s) => Object.prototype.hasOwnProperty.call(sup, s) && (Number(sup[s]) || 0) > 0)
    : null;
  return { healItemAt: 75, manaAt: 60,
    healSupply: pick(orders && orders.health), manaSupply: pick(orders && orders.mana) };
}

/* Pedido de Magic Wall DEFENSIVO em 2 fases — a tática real do jogador:
 * célula ocupada NÃO aceita muro (regra do próprio wallCalls), então a IA
 * marca a célula que está deixando e emite o pedido depois de pisar fora.
 * pvpProcessWallCalls escolhe o caster (runa + cooldown + alcance reais,
 * máx/conta, TTL de 6s). Anti-spam: ~4s por conta. */
const AI_WALL_CALL_MS = 4000;
function pvpAiDefensiveWall(auth, item, v, now) {
  const pb = auth && auth.pvpBattle; if (!pb || !v) return false;
  const accId = Number(item.accountId || (item.p && item.p.accountId)) || 0;
  if (!accId) return false;
  const mem = aiMem(item);
  if (mem.wallPending) {
    const w = mem.wallPending;
    if (now - w.at > AI_WALL_CALL_MS) { mem.wallPending = null; return false; }
    if (Number(item.cx) !== w.cx || Number(item.cy) !== w.cy) {
      pb.wallCalls = pb.wallCalls || {};
      pb.wallCalls[accId] = { cx: w.cx, cy: w.cy, at: now, ai: true };
      mem.wallPending = null; mem.wallCallAt = now;
      return true;
    }
    return false; // ainda em cima da célula — espera o passo
  }
  // Em retirada/kite com perseguidor colado: marca a célula atual.
  if (v.pursuers.length && v.pursuers[0].d <= 2 &&
      now - (Number(mem.wallCallAt) || 0) >= AI_WALL_CALL_MS) {
    mem.wallPending = { cx: Number(item.cx), cy: Number(item.cy), at: now };
    return true;
  }
  return false;
}

/* ==================== FASE 6 — HYBRID COORDINATION ==================== */
/* Camada estratégica 1×/s por TIME, dentro do pvpBattleTick:
 * - strategy por mapa (offensive/defensive/balanced/domination/retreat);
 * - consenso de alvo quando o LÍDER está offline — os bots agregam seus
 *   alvos recentes e o melhor foco vira o target call do time (os demais
 *   seguem pelo pvpBattleTarget normal — foco coordenado de verdade);
 * - eventos internos TEAM_* consumidos pelo decide;
 * - comandante humano online sempre manda — consenso só preenche o vácuo.
 * ========================================================================== */

const AI_COORD_MS = 1000;         // cadência do comandante
const AI_FRAG_LEAD_DEF = 5;       // déficit de frags → offensive
const AI_FRAG_LEAD_SAFE = 8;      // vantagem larga → defensive
/* ==================== FASE 7 — ADAPTIVE INTELLIGENCE ====================
 * Peso das ações por MODO de mapa (o objetivo real do mapa dita a tática):
 * - frags (Ankrahmun): finalizar vale mais; disputa de zona não existe.
 * - control (Venore): o território vale mais que perseguições soltas —
 *   CONTEST/REGROUP sobem, perseguir longe da zona cai.
 * ========================================================================== */
const AI_MAP_WEIGHTS = {
  frags:   { finish: +10, contest: 0, pursue: 0 },
  control: { finish: 0, contest: +15, pursue: -15 },
};
/* Tempo que um alvo "protegido" permanece marcado na memória do time. */
const AI_PROTECTED_MEM_MS = 8000;

function _teamHp(g) { return g.alive.reduce((s, m) => s + m.hpPct, 0); }
function _leaderOnline(auth, t, now) {
  const pb = auth.pvpBattle, acc = pb.teams && pb.teams[t] &&
    Number(pb.teams[t].leaderAccountId) || 0;
  if (!acc) return false;
  return !!(auth.players || []).some((o) => o && o.p && o.p.hp > 0 && !o.downUntil &&
    aiTeamOf(o) === t &&
    Number(o.accountId !== undefined ? o.accountId : (o.p && o.p.accountId)) === acc &&
    (Number(o._pvpDrivenAt) || 0) > now - AI_DRIVEN_MS);
}
/* Consenso ofensivo: soma os alvos recentes dos bots vivos do time —
 * o foco emergente (quem mais bots já estavam batendo) + score do hostil. */
function _consensusTarget(auth, pc, t, foeG, protectedFoes) {
  const g = pc.teams[t], agg = {};
  for (const m of g.alive) {
    const mm = m.item && m.item._aiMem;
    if (mm && mm.lastTargetId) {
      const f = pc.byId[mm.lastTargetId];
      if (f && !f.dead && f.team !== t)
        agg[f.id] = (agg[f.id] || 0) + 25; // foco existente pesa
    }
  }
  let best = null, bestSc = -1e9;
  for (const f of foeG.alive) {
    let sc = (agg[f.id] || 0) + 60 - f.hpPct * 40 + (f.isolated ? 15 : 0) +
      (/druid|sorcerer/.test(f.voc) ? 8 : 0) - f.nearestFoe -
      (protectedFoes && protectedFoes[f.id] ? 15 : 0);
    if (sc > bestSc) { bestSc = sc; best = f.id; }
  }
  return best;
}

function pvpAiCoordinatorTick(auth, now) {
  const pb = auth && auth.pvpBattle; if (!pb || pb.finished) return;
  now = Number(now) || Number(auth.clock) || Date.now();
  if (now - (Number(pb._aiCoordAt) || 0) < AI_COORD_MS) return;
  pb._aiCoordAt = now;
  const pc = pvpAiPerception(auth, now);
  pb.aiCoord = pb.aiCoord || {};
  for (const t of [1, 2]) {
    const team = pb.teams && pb.teams[t] || {};
    const g = pc.teams[t] || { alive: [], critical: [] },
      foeG = pc.teams[t === 1 ? 2 : 1] || { alive: [] };
    const coord = pb.aiCoord[t] = pb.aiCoord[t] || { lastStrategy: null };
    coord.leaderOnline = _leaderOnline(auth, t, now);
    coord.events = [];

    /* FASE 7 (antes da estratégia — o consenso consome o mapa):
     * hostil com ≥2 aliados colados = escoltado; marcado na memória do
     * time pros bots des-priorizarem e pressionarem outro setor.
     * Memória TRANSIENTE (non-enumerable) — não vai pro checkpoint. */
    if (!coord.protectedFoes)
      Object.defineProperty(coord, "protectedFoes",
        { value: {}, writable: true, enumerable: false, configurable: true });
    for (const id of Object.keys(coord.protectedFoes))
      if (now - coord.protectedFoes[id] > AI_PROTECTED_MEM_MS)
        delete coord.protectedFoes[id];
    for (const f of foeG.alive) {
      const guards = foeG.alive.filter((o) => o !== f &&
        Math.abs(o.cx - f.cx) + Math.abs(o.cy - f.cy) <= 2).length;
      if (guards >= 2) coord.protectedFoes[f.id] = now;
    }

    /* Estratégia macro: modo control → dominar/defender a zona;
     * frags → placar + HP agregado + superioridade numérica. */
    let strategy;
    if (pb.mode === "control") {
      const holder = Number(pb.holder) || 0;
      strategy = holder === t ? "domination" : "offensive";
    } else {
      const myScore = Number((pb.scores || {})[t]) || 0,
        foScore = Number((pb.scores || {})[t === 1 ? 2 : 1]) || 0;
      const myHp = _teamHp(g), foHp = _teamHp(foeG),
        numAdv = g.alive.length - foeG.alive.length;
      strategy = g.alive.length === 0 ? "defensive" :
        myHp < foHp * 0.6 ? "retreat" :
        foScore - myScore >= AI_FRAG_LEAD_DEF || numAdv > 0 ? "offensive" :
        myScore - foScore >= AI_FRAG_LEAD_SAFE ? "defensive" : "balanced";
    }
    if (strategy !== coord.lastStrategy) {
      coord.events.push({ t: "TEAM_STRATEGY_" + strategy.toUpperCase() });
      coord.lastStrategy = strategy;
    }
    coord.strategy = strategy;

    /* Consenso de alvo: só quando o líder está offline. Com líder online,
     * o call dele é soberano — os bots apenas seguem. */
    if (!coord.leaderOnline) {
      /* Consenso escreve aiTargetId — targetId fica EXCLUSIVO do líder
       * humano (regra "só o líder designa" preservada; a resolução do
       * foco usa targetId || aiTargetId). */
      const tgt = _consensusTarget(auth, pc, t, foeG, coord.protectedFoes);
      coord.consensusTargetId = tgt;
      if (tgt) team.aiTargetId = tgt; else delete team.aiTargetId;
    } else {
      coord.consensusTargetId = null;
      delete team.aiTargetId; // líder de volta: call dos bots sai
      // Líder online: alvo chamado morto é limpo (bots não mantêm fogo em cadáver).
      if (team.targetId && pc.byId[String(team.targetId)] &&
          pc.byId[String(team.targetId)].dead)
        delete team.targetId;
    }

    if (g.critical.length)
      coord.events.push({ t: "TEAM_MEMBER_CRITICAL", id: g.critical[0].id });
    if (pb.mode === "control" && (Number(pb.holder) || 0) !== t)
      coord.events.push({ t: "TEAM_CONTROL_CONTESTED" });
    if (strategy === "retreat")
      coord.events.push({ t: "TEAM_RETREAT" });

    /* Dispersão do time: distância média ao centro da massa. */
    if (g.alive.length >= 3) {
      const mx = g.alive.reduce((a, m) => a + m.cx, 0) / g.alive.length,
        my = g.alive.reduce((a, m) => a + m.cy, 0) / g.alive.length;
      const spread = g.alive.reduce((a, m) =>
        a + Math.abs(m.cx - mx) + Math.abs(m.cy - my), 0) / g.alive.length;
      coord.regroup = pb.mode === "control" &&
        (Number(pb.holder) || 0) !== t && spread > 6;
      if (coord.regroup) coord.regroupCell = { cx: Math.round(mx), cy: Math.round(my) };
      coord.spread = Math.round(spread * 10) / 10;
    } else { coord.regroup = false; coord.spread = 0; }
  }
}
/* O decide lê a coordenação do time (targetId efetivo + estratégia). */
function _aiCoord(pb, t) {
  return pb && pb.aiCoord && pb.aiCoord[t] || null;
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
  AI_PRIO, AI_DECIDE_MS, AI_PROFILES, pvpAiScoreTarget, pvpAiCombatMode,
  pvpAiDecide, pvpAiGateGoal, pvpAiPotionCfg, pvpAiDefensiveWall,
  AI_WALL_CALL_MS, AI_COORD_MS, pvpAiCoordinatorTick, AI_MAP_WEIGHTS,
  AI_PROTECTED_MEM_MS,
};
