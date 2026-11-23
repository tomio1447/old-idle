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

module.exports = {
  AI_MODES, AI_DRIVEN_MS, AI_OFFLINE_MS, AI_SUSPECT_MS, AI_CONFIRM_MS,
  AI_RETURN_GRACE_MS, AI_HYSTERESIS_MS,
  aiCtl, aiSet, pvpAiBlocksPose, pvpAiDriven, pvpAiNoteActivity,
  pvpAiControlTick,
};
