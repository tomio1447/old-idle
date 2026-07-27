/*
 * buffs.js — buffs de vocação do Tibia 15.x, vindos do Canary
 *
 * Cada buff e uma CONDITION_ATTRIBUTES no servidor, com percentuais
 * exatos. Aqui viram modificadores aplicados no combate:
 *
 *   dmgDealt      multiplicador do dano causado
 *   dmgReceived   multiplicador do dano recebido
 *   shieldPercent bonus percentual de shielding
 *
 * As tres Virtudes do Monk sao exclusivas entre si: ativar uma remove a
 * anterior, exatamente como o setVirtue() do servidor.
 */
"use strict";

const BUFFS = {
  // ---- Monk: as tres Virtudes (utura tio / utito virtu / utori virtu)
  "utura-tio": {
    id: "virtue-sustain", nome: "Virtue of Sustain", grupo: "virtue",
    voc: "monk", dur: 60000,
    // sustentacao: recebe menos dano e regenera ao acertar
    dmgReceived: 0.85, lifeOnHit: 0.06,
    desc: "Recebe 15% menos dano e recupera vida ao golpear.",
  },
  "utito-virtu": {
    id: "virtue-justice", nome: "Virtue of Justice", grupo: "virtue",
    voc: "monk", dur: 60000,
    // justica: mais dano, menos defesa
    dmgDealt: 1.25, dmgReceived: 1.10,
    desc: "Causa 25% mais dano, mas recebe 10% a mais.",
  },
  "utori-virtu": {
    id: "virtue-harmony", nome: "Virtue of Harmony", grupo: "virtue",
    voc: "monk", dur: 60000,
    // harmonia: equilibrio, recupera mana ao acertar
    dmgDealt: 1.10, manaOnHit: 0.05, shieldPercent: 20,
    desc: "Dano e defesa equilibrados, com ganho de mana ao golpear.",
  },

  // ---- Knight: Protector (utamo tempo) — valores do protector.lua
  "utamo-tempo": {
    id: "protector", nome: "Protector", grupo: "focus",
    voc: "knight", dur: 13000,
    shieldPercent: 220, dmgDealt: 0.65, dmgReceived: 0.85,
    desc: "Shielding +220%, causa 65% do dano e recebe 85%.",
  },

  // ---- Paladin: Divine Dazzle (exana amp res)
  "exana-amp-res": {
    id: "divine-dazzle", nome: "Divine Dazzle", grupo: "support",
    voc: "paladin", dur: 16000,
    // ofusca o alvo: os monstros erram mais
    mobMissChance: 0.35,
    desc: "Ofusca os inimigos: eles erram 35% dos golpes.",
  },
};

/* buffs ativos do jogador, limpando os que expiraram */
function activeBuffs(p, now) {
  now = now || Date.now();
  if (!p.buffs) return {};
  const out = {};
  for (const k in p.buffs) {
    if (p.buffs[k] > now) out[k] = p.buffs[k];
    else delete p.buffs[k];
  }
  return out;
}

function hasBuff(p, chave, now) {
  return !!activeBuffs(p, now)[chave];
}

/* Ativa um buff. Virtudes se substituem entre si. */
function applyBuff(p, chave, now) {
  const b = BUFFS[chave];
  if (!b) return false;
  now = now || Date.now();
  p.buffs = p.buffs || {};
  if (b.grupo === "virtue") {
    // so uma virtude por vez, como o setVirtue do Canary
    for (const k in BUFFS) {
      if (BUFFS[k].grupo === "virtue" && k !== chave) delete p.buffs[k];
    }
  }
  p.buffs[chave] = now + b.dur;
  return true;
}

/* Soma os modificadores de todos os buffs ativos */
function buffTotals(p, now) {
  const t = { dmgDealt: 1, dmgReceived: 1, shieldPercent: 0,
              lifeOnHit: 0, manaOnHit: 0, mobMissChance: 0, lista: [] };
  const ativos = activeBuffs(p, now);
  for (const k in ativos) {
    const b = BUFFS[k];
    if (!b) continue;
    if (b.dmgDealt) t.dmgDealt *= b.dmgDealt;
    if (b.dmgReceived) t.dmgReceived *= b.dmgReceived;
    if (b.shieldPercent) t.shieldPercent += b.shieldPercent;
    if (b.lifeOnHit) t.lifeOnHit += b.lifeOnHit;
    if (b.manaOnHit) t.manaOnHit += b.manaOnHit;
    if (b.mobMissChance) t.mobMissChance = Math.max(t.mobMissChance, b.mobMissChance);
    t.lista.push({ chave: k, nome: b.nome, ate: ativos[k] });
  }
  return t;
}

/* Buffs que o personagem pode lançar agora */
function availableBuffs(p) {
  const out = [];
  for (const k in BUFFS) {
    const b = BUFFS[k];
    if (b.voc && b.voc !== p.voc) continue;
    const s = typeof SPELLS !== "undefined" ? SPELLS[k] : null;
    if (s && p.level < (s.lvl || 1)) continue;
    out.push({ chave: k, buff: b, spell: s });
  }
  return out;
}
