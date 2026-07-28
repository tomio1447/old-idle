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
  /* As tres Virtudes nao tem duracao no Tibia: sao POSTURAS que ficam
   * ligadas ate o Monk trocar. O `dur` alto emula isso sem mexer no
   * expirador de buffs. Os efeitos reais moram em monk.js, porque dependem
   * do estado sereno — aqui ficam so os que o motor de buffs ja sabia
   * aplicar. */
  "utura-tio": {
    id: "virtue-sustain", nome: "Virtue of Sustain", grupo: "virtue",
    voc: "monk", dur: 3600000,
    // sustain e postura de CURA: virtudeCuraBonus() da +35% (70% sereno)
    // em toda cura do Monk. Nao reduz dano recebido no servidor.
    desc: "Toda cura do Monk aumenta 35% (70% se sereno).",
  },
  "utito-virtu": {
    id: "virtue-justice", nome: "Virtue of Justice", grupo: "virtue",
    voc: "monk", dur: 3600000,
    // fist +15% / +30% sereno, aplicado em effSkill via virtudeFistBonus
    desc: "Fist fighting +15% (30% se sereno).",
  },
  "utori-virtu": {
    id: "virtue-harmony", nome: "Virtue of Harmony", grupo: "virtue",
    voc: "monk", dur: 3600000,
    // +4 pontos no bonus base de harmony (+8 sereno) e devolve 1 harmony
    // ao usar spender; ambos tratados em monk.js
    desc: "Bônus base de Harmony +4 (+8 sereno) e devolve 1 ponto ao gastar.",
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
