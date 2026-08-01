/* prey.js — Sistema de Prey (TibiaWiki/Prey_System + Canary)
 *
 * Bônus ao caçar uma criatura específica por até 2 horas:
 *   - 3 slots (2 desbloqueados + 1 permanente comprável);
 *   - cada slot mostra 9 criaturas aleatórias (sempre low/mid/high);
 *   - você escolhe 1 criatura + ganha 1 bônus rolado (dano/defesa/exp/loot);
 *   - timer de 2h (decrementa enquanto caça);
 *   - reroll grátis a cada 20h OU pago (150 gp por nível);
 *   - Prey Wildcard melhora o step do bônus (e pode trocar o tipo).
 *
 * Bônus (10 passos):
 *   - Dano   : 7%  a 25% (passos de 2%)
 *   - Defesa : 12% a 30% (passos de 2%)
 *   - Exp    : 13% a 40% (passos de 3%)
 *   - Loot   : 13% a 40% (passos de 3%)
 *
 * Loot melhorado: com bônus de X%, há X% de chance de o monstro gerar um
 * segundo conjunto de loot (como se matasse dois).
 */
"use strict";

const PREY_SLOT_COUNT = 3;
const PREY_LIST_SIZE = 9;
const PREY_DURATION_MS = 2 * 3600 * 1000;          // 2 horas
const PREY_FREE_REROLL_MS = 20 * 3600 * 1000;      // reroll grátis a cada 20h
const PREY_REROLL_GOLD_PER_LEVEL = 150;            // 150 gp por nível
const PREY_DEFENSE_TICK_MS = 10 * 1000;            // defesa gasta +10s por hit

const PREY_BONUSES = {
  damage:  { nome: "Dano",   cor: "#ff6a4a", step: 2, base: 7,  max: 25 },
  defense: { nome: "Defesa", cor: "#6a9aff", step: 2, base: 12, max: 30 },
  exp:     { nome: "Exp",    cor: "#ffe680", step: 3, base: 13, max: 40 },
  loot:    { nome: "Loot",   cor: "#7ae87a", step: 3, base: 13, max: 40 },
};

/* Chances de começar com cada nível de recompensa (1-5 estrelas, wiki). */
const PREY_STEP_CHANCES = [
  { step: 0, chance: 35.5 },  // 1 estrela
  { step: 1, chance: 26.5 },
  { step: 2, chance: 22.0 },
  { step: 3, chance: 11.9 },
  { step: 4, chance: 4.1 },   // 5 estrelas
];

function preyBonusValue(tipo, step) {
  const b = PREY_BONUSES[tipo];
  if (!b) return 0;
  return Math.min(b.max, b.base + b.step * Math.max(0, Math.min(9, step || 0)));
}

function ensurePrey(p) {
  if (!p) return null;
  p.prey = p.prey || {};
  const pr = p.prey;
  pr.slots = Array.isArray(pr.slots) ? pr.slots : [];
  while (pr.slots.length < PREY_SLOT_COUNT) {
    pr.slots.push({ unlocked: pr.slots.length < 2, creatures: [],
                    rerollAt: 0, selected: null });
  }
  pr.wildcards = Math.max(0, Number(pr.wildcards) || 0);
  for (const s of pr.slots) {
    if (!s.selected) continue;
    // limpa preys expiradas
    if (s.selected.until && s.selected.until <= Date.now()) s.selected = null;
  }
  return pr;
}

/* Faixas de criaturas por dificuldade (exp do Canary). */
function preyFaixaDe(mob) {
  const exp = (mob && mob.exp) || 0;
  if (exp < 200) return "low";
  if (exp < 1000) return "mid";
  return "high";
}

/* Gera 9 criaturas aleatórias para o slot (3 low, 3 mid, 3 high),
 * sem repetir criatura entre slots. */
function preyRerollList(p, slotIdx) {
  ensurePrey(p);
  const pr = p.prey;
  const usadas = new Set();
  for (const s of pr.slots) {
    for (const c of (s.creatures || [])) usadas.add(c);
    if (s.selected && s.selected.creature) usadas.add(s.selected.creature);
  }
  const pool = { low: [], mid: [], high: [] };
  const seen = new Set();
  for (const huntId in (typeof GAMEDATA !== "undefined" ? GAMEDATA.hunts : {})) {
    const hu = GAMEDATA.hunts[huntId];
    for (const slug of (hu.monsters || [])) {
      if (seen.has(slug) || usadas.has(slug)) continue;
      seen.add(slug);
      const mob = (typeof MONSTERDATA !== "undefined") ? MONSTERDATA[slug] : null;
      if (!mob) continue;
      pool[preyFaixaDe(mob)].push(slug);
    }
  }
  const lista = [];
  for (const faixa of ["low", "mid", "high"]) {
    const arr = pool[faixa];
    for (let i = 0; i < 3 && arr.length; i++) {
      const idx = Math.floor(Math.random() * arr.length);
      lista.push(arr.splice(idx, 1)[0]);
    }
  }
  // se faltou alguma faixa (poucas criaturas), completa com o pool todo
  const resto = pool.low.concat(pool.mid, pool.high);
  while (lista.length < PREY_LIST_SIZE && resto.length) {
    lista.push(resto.splice(Math.floor(Math.random() * resto.length), 1)[0]);
  }
  return lista.slice(0, PREY_LIST_SIZE);
}

/* Custo do reroll pago (150 gp por nível). */
function preyRerollCost(p) {
  return (p.level || 1) * PREY_REROLL_GOLD_PER_LEVEL;
}

/* Reroll da lista do slot: grátis se passou 20h desde o último, senão pago. */
function preyReroll(p, slotIdx, forcePay) {
  ensurePrey(p);
  const slot = p.prey.slots[slotIdx];
  if (!slot || !slot.unlocked) return { ok: false, msg: "Slot bloqueado." };
  const agora = Date.now();
  if (!forcePay && slot.rerollAt <= agora) {
    slot.rerollAt = agora + PREY_FREE_REROLL_MS;
  } else {
    const custo = preyRerollCost(p);
    if ((p.gold || 0) < custo) return { ok: false, msg: "Gold insuficiente." };
    p.gold -= custo;
  }
  slot.creatures = preyRerollList(p, slotIdx);
  if (slot.selected) slot.selected = null;
  return { ok: true };
}

/* Rola um bônus (tipo + step) para a criatura escolhida. */
function preyRollBonus() {
  const tipos = Object.keys(PREY_BONUSES);
  const tipo = tipos[Math.floor(Math.random() * tipos.length)];
  let r = Math.random() * 100, acc = 0, step = 0;
  for (const c of PREY_STEP_CHANCES) {
    acc += c.chance;
    if (r < acc) { step = c.step; break; }
  }
  return { tipo, step };
}

/* Ativa a prey: escolhe a criatura da lista e rola o bônus. */
function preySelect(p, slotIdx, creature, tipoForcado) {
  ensurePrey(p);
  const slot = p.prey.slots[slotIdx];
  if (!slot || !slot.unlocked) return { ok: false, msg: "Slot bloqueado." };
  if (!slot.creatures || slot.creatures.indexOf(creature) === -1)
    return { ok: false, msg: "Criatura não está na lista." };
  const roll = tipoForcado
    ? { tipo: tipoForcado, step: 0 }
    : preyRollBonus();
  slot.selected = {
    creature: creature,
    bonus: roll.tipo,
    step: roll.step,
    until: Date.now() + PREY_DURATION_MS,
  };
  return { ok: true, bonus: roll.tipo, step: roll.step,
           value: preyBonusValue(roll.tipo, roll.step) };
}

/* Usa um Prey Wildcard: melhora o step (+1) e pode trocar o tipo. */
function preyUseWildcard(p, slotIdx) {
  ensurePrey(p);
  const slot = p.prey.slots[slotIdx];
  if (!slot || !slot.selected) return { ok: false, msg: "Sem prey ativa." };
  if ((p.prey.wildcards || 0) < 1) return { ok: false, msg: "Sem wildcards." };
  p.prey.wildcards--;
  const sel = slot.selected;
  if (sel.step >= 9) {
    // já no máximo: o tipo muda com garantia
    const tipos = Object.keys(PREY_BONUSES).filter((t) => t !== sel.bonus);
    sel.bonus = tipos[Math.floor(Math.random() * tipos.length)];
    sel.step = 0;
  } else {
    sel.step = Math.min(9, sel.step + 1);
    if (Math.random() < 0.5) {
      const tipos = Object.keys(PREY_BONUSES);
      const novo = tipos[Math.floor(Math.random() * tipos.length)];
      if (novo !== sel.bonus) sel.bonus = novo;
    }
  }
  return { ok: true, bonus: sel.bonus, step: sel.step,
           value: preyBonusValue(sel.bonus, sel.step) };
}

/* Prey ativa (não expirada) que aponta para a criatura `slug`. */
function preyForCreature(p, slug) {
  ensurePrey(p);
  const agora = Date.now();
  for (const slot of p.prey.slots) {
    const s = slot.selected;
    if (!s) continue;
    if (s.until <= agora) { slot.selected = null; continue; }
    if (s.creature === slug) return s;
  }
  return null;
}

function preyExpBonus(p, slug) {
  const s = preyForCreature(p, slug);
  return s && s.bonus === "exp" ? preyBonusValue("exp", s.step) : 0;
}
function preyDamageBonus(p, slug) {
  const s = preyForCreature(p, slug);
  return s && s.bonus === "damage" ? preyBonusValue("damage", s.step) : 0;
}
function preyDefenseBonus(p, slug) {
  const s = preyForCreature(p, slug);
  return s && s.bonus === "defense" ? preyBonusValue("defense", s.step) : 0;
}
function preyLootChance(p, slug) {
  const s = preyForCreature(p, slug);
  return s && s.bonus === "loot" ? preyBonusValue("loot", s.step) : 0;
}

/* Tick do timer: decrementa o tempo das preys ativas enquanto caça. */
function preyTick(p, dt) {
  ensurePrey(p);
  if (!dt) return;
  const agora = Date.now();
  for (const slot of p.prey.slots) {
    const s = slot.selected;
    if (!s) continue;
    if (s.until <= agora) { slot.selected = null; continue; }
    s.until -= dt;
    if (s.until <= agora) slot.selected = null;
  }
}

/* Gasta tempo extra da prey de defesa ao tomar dano da criatura alvo. */
function preyDefenseTickOnHit(p, slug) {
  const s = preyForCreature(p, slug);
  if (s) s.until = Math.max(Date.now(), s.until - PREY_DEFENSE_TICK_MS);
}

/* Custo para desbloquear o slot permanente (regra da casa: gold alto). */
const PREY_PERMANENT_SLOT_COST = 250000;

function preyBuyPermanentSlot(p) {
  ensurePrey(p);
  const slot = p.prey.slots[2];
  if (!slot || slot.unlocked) return { ok: false, msg: "Já desbloqueado." };
  if ((p.gold || 0) < PREY_PERMANENT_SLOT_COST)
    return { ok: false, msg: "Gold insuficiente." };
  p.gold -= PREY_PERMANENT_SLOT_COST;
  slot.unlocked = true;
  slot.creatures = preyRerollList(p, 2);
  return { ok: true };
}
