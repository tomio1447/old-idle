/*
 * cooldown.js — rastreio de cooldowns no formato do cliente oficial
 *
 * O otclient (modules/game_cooldown) mostra duas coisas ao mesmo tempo:
 *
 *   1. os GRUPOS de magia (Attack, Healing, Support, Focus, Virtue...), que
 *      ficam sempre visiveis e escurecem enquanto o grupo esta travado;
 *   2. os ICONES das magias lancadas, que aparecem so durante o cooldown
 *      proprio da magia e somem quando ele acaba.
 *
 * Aqui a mesma logica, com um detalhe importante do servidor que o jogo nao
 * tinha: lancar uma magia trava o GRUPO inteiro dela por um tempo curto
 * (`gcd`), alem do cooldown longo da propria magia (`cd`). Era por isso que
 * dava para spammar magias diferentes sem nenhuma penalidade.
 *
 * O estado mora no jogador (p.cd / p.gcd) e nao no contexto de combate, para
 * o cooldown continuar correndo ao trocar de hunt ou voltar para a cidade —
 * como acontece no Tibia.
 */
"use strict";

/* id numerico -> nome do grupo, direto do SpellGroups do otclient */
const CD_GRUPOS = (typeof window !== "undefined" && window.SPELLGROUPS)
  ? window.SPELLGROUPS : {};

/* Nome em portugues de cada grupo, para o tooltip */
const CD_GRUPO_PT = {
  Attack: "Ataque", Healing: "Cura", Support: "Suporte", Special: "Especial",
  Conjure: "Conjuração", Crippling: "Debilitante", Focus: "Foco",
  UltimateStrikes: "Golpes Supremos", GreatBeams: "Grandes Feixes",
  BurstsOfNature: "Explosões da Natureza", Virtue: "Virtude",
};

/* Garante os mapas de cooldown no jogador */
function cdInit(p) {
  if (!p.cd) p.cd = {};      // por magia:  id -> timestamp de liberacao
  if (!p.gcd) p.gcd = {};    // por grupo:  idGrupo -> timestamp de liberacao
  return p;
}

/* Registra o disparo de uma magia: trava ela e todos os grupos dela */
function cdStart(p, id, s, now) {
  cdInit(p);
  now = now || Date.now();
  const spell = s || (typeof SPELLS !== "undefined" ? SPELLS[id] : null);
  if (!spell) return;
  p.cd[id] = { ate: now + (spell.cd || 2000), dur: spell.cd || 2000 };
  const grupos = spell.grupos || {};
  for (const g in grupos) {
    const dur = grupos[g] || spell.gcd || 1000;
    const ate = now + dur;
    // se o grupo ja esta travado por mais tempo, mantem o maior
    if (!p.gcd[g] || p.gcd[g].ate < ate) p.gcd[g] = { ate: ate, dur: dur };
  }
}

/* A magia pode ser lancada agora? Checa o cooldown proprio E o do grupo. */
function cdReady(p, id, now) {
  cdInit(p);
  now = now || Date.now();
  const e = p.cd[id];
  if (e && e.ate > now) return false;
  const s = typeof SPELLS !== "undefined" ? SPELLS[id] : null;
  if (s && s.grupos) {
    for (const g in s.grupos) {
      const gg = p.gcd[g];
      if (gg && gg.ate > now) return false;
    }
  }
  return true;
}

/* Quanto falta, em ms (0 = pronta) */
function cdRemaining(p, id, now) {
  cdInit(p);
  now = now || Date.now();
  let resta = 0;
  const e = p.cd[id];
  if (e) resta = Math.max(resta, e.ate - now);
  const s = typeof SPELLS !== "undefined" ? SPELLS[id] : null;
  if (s && s.grupos) {
    for (const g in s.grupos) {
      const gg = p.gcd[g];
      if (gg) resta = Math.max(resta, gg.ate - now);
    }
  }
  return Math.max(0, resta);
}

/* Limpa as entradas vencidas (evita o mapa crescer para sempre) */
function cdPrune(p, now) {
  cdInit(p);
  now = now || Date.now();
  for (const k in p.cd) if (p.cd[k].ate <= now) delete p.cd[k];
  for (const k in p.gcd) if (p.gcd[k].ate <= now) delete p.gcd[k];
}

/* Magias em cooldown agora, da que falta menos para a que falta mais.
 * E o que a barra desenha na fileira de icones. */
function cdActiveSpells(p, now) {
  cdInit(p);
  now = now || Date.now();
  const out = [];
  for (const id in p.cd) {
    const e = p.cd[id];
    const resta = e.ate - now;
    if (resta <= 0) continue;
    const s = typeof SPELLS !== "undefined" ? SPELLS[id] : null;
    if (!s) continue;
    out.push({
      id: id, spell: s, resta: resta, dur: e.dur || s.cd || 2000,
      pct: Math.max(0, Math.min(1, resta / (e.dur || s.cd || 2000))),
    });
  }
  out.sort((a, b) => a.resta - b.resta);
  return out;
}

/* Grupos que a vocacao usa, na ordem do cliente. Sempre visiveis, mesmo
 * destravados — e assim que o otclient monta a barra. */
function cdVocGroups(p) {
  const usados = {};
  if (typeof SPELLS !== "undefined") {
    for (const id in SPELLS) {
      const s = SPELLS[id];
      if (!s.vocs || s.vocs.indexOf(p.voc) === -1) continue;
      for (const g in (s.grupos || {})) usados[g] = true;
    }
  }
  return Object.keys(usados)
    .map(Number)
    .sort((a, b) => a - b)
    .map((g) => ({
      id: g,
      nome: CD_GRUPOS[g] || ("Grupo " + g),
      pt: CD_GRUPO_PT[CD_GRUPOS[g]] || CD_GRUPOS[g] || ("Grupo " + g),
    }));
}

/* Estado de um grupo: travado? quanto falta? que fracao ja passou? */
function cdGroupState(p, g, now) {
  cdInit(p);
  now = now || Date.now();
  const e = p.gcd[g];
  if (!e || e.ate <= now) return { ativo: false, resta: 0, pct: 0 };
  const resta = e.ate - now;
  return {
    ativo: true, resta: resta,
    pct: Math.max(0, Math.min(1, resta / (e.dur || 2000))),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    cdStart, cdReady, cdRemaining, cdActiveSpells, cdVocGroups, cdGroupState,
  };
}
