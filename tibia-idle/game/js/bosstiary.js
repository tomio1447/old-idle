/*
 * bosstiary.js — progressao de bosses no molde do Bosstiary do Tibia.
 *
 * O que existia: a aba "Bosstiário" da Cyclopedia listava BOSS_DEFS, que tem
 * UM boss no jogo inteiro (the-monster). Não havia progressão, pontos nem
 * categoria — a aba era praticamente um cartaz.
 *
 * O import_monsters.py trouxe 369 bosses do Canary (353 com sprite), então
 * aqui montamos o sistema de verdade:
 *
 *   - cada boss tem uma categoria (Bane / Archfoe / Nemesis) que define
 *     quantos abates cada estágio pede e quantos pontos paga;
 *   - abater rende Boss Points, que sobem o Bosstiary Level;
 *   - o nível dá um bônus permanente de dano contra bosses, que é o papel
 *     do sistema no jogo original.
 *
 * Como a categoria é decidida: o Canary não marca Bane/Archfoe/Nemesis no
 * arquivo do monstro (isso vive no banco do bosstiary), então derivamos do
 * HP, que é o melhor indicador disponível de porte do encontro. É uma
 * aproximação, e está documentada como tal.
 */
"use strict";

/* Categorias no formato do Tibia: quanto mais duro, menos abates para
 * completar e mais pontos por abate. */
const BOSS_CATS = {
  bane: { nome: "Bane", kills: 30, pts: 5, cor: "#9ce84a" },
  archfoe: { nome: "Archfoe", kills: 10, pts: 15, cor: "#5aa8ff" },
  nemesis: { nome: "Nemesis", kills: 5, pts: 50, cor: "#ff6a6a" },
};

/* Faixas de HP que separam as categorias. Aproximação: o dado real de
 * categoria não está no .lua do monstro. */
function bossCategory(slug) {
  const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters)
    ? GAMEDATA.monsters[slug] : null;
  if (!m) return "bane";
  const hp = m.hp || 0;
  if (hp >= 150000) return "nemesis";
  if (hp >= 30000) return "archfoe";
  return "bane";
}

/* Bosses realmente enfrentáveis no jogo: flag `boss` + sprite (jogavel) +
 * presença em hunt ativa/quest (activeMonsterSlugs) ou referenciado por um
 * BOSS_DEFS (modal de bosses e world bosses). O dump Canary tem ~370
 * bosses, mas só uma fração existe aqui. */
function bosstiaryList(filtro) {
  if (typeof GAMEDATA === "undefined") return [];
  const ativos = typeof activeMonsterSlugs === "function"
    ? activeMonsterSlugs() : new Set();
  if (typeof BOSS_DEFS !== "undefined" && BOSS_DEFS) {
    for (const id in BOSS_DEFS) {
      const b = BOSS_DEFS[id];
      if (!b) continue;
      if (b.baseMonster) ativos.add(b.baseMonster);
      if (b.sprite) ativos.add(b.sprite);
    }
  }
  const out = [];
  for (const slug in GAMEDATA.monsters) {
    const m = GAMEDATA.monsters[slug];
    if (!m.boss) continue;
    /* Sprite: monsterPlayable lê MOBSHEETS direto — o flag m.jogavel fica
     * stale nos monstros registrados por patch (a sheet é adicionada depois
     * do fundirMonsterData). */
    const temSprite = typeof monsterPlayable === "function"
      ? monsterPlayable(slug) : m.jogavel;
    if (!temSprite) continue;
    if (!ativos.has(slug)) continue;
    if (filtro && filtro !== "todos" && bossCategory(slug) !== filtro) continue;
    out.push(slug);
  }
  // do mais fraco para o mais forte: é a ordem em que o jogador encara
  out.sort((a, b) => (GAMEDATA.monsters[a].hp || 0) -
                     (GAMEDATA.monsters[b].hp || 0));
  return out;
}

function ensureBosstiary(p) {
  if (!p.bosstiary) p.bosstiary = {};        // slug -> kills
  if (p.bossPoints === undefined) p.bossPoints = 0;
  if (!p.bossPagos) p.bossPagos = {};        // slug -> ja creditado
  return p;
}

/* Registra o abate de um boss e credita os pontos do estagio. */
function bosstiaryKill(p, slug, n) {
  ensureBosstiary(p);
  const m = (typeof GAMEDATA !== "undefined") ? GAMEDATA.monsters[slug] : null;
  if (!m || !m.boss) return 0;
  const antes = p.bosstiary[slug] || 0;
  const depois = antes + (n || 1);
  p.bosstiary[slug] = depois;

  /* Gnomprona: kill do The Primal Menace libera +1 nível de hazard na
   * CONTA (cap 12) — MAS só se a luta foi no hazard atual desbloqueado
   * (sel === level). Lutar abaixo não libera o próximo nível.
   * Marcos: nível 6 → montaria Noxious Ripptor (resgatar na quest
   *         Primal Ordeal); nível 12 → 4× Primal Bag (automático). */
  if (slug === "the-primal-menace") {
    p.hazardKills = depois;
    const level = Math.max(0, Math.min(12,
      typeof gnompronaHazardUnlock === "function"
        ? gnompronaHazardUnlock(p) : (Number(p.hazardLevel) || 0)));
    const fought = Math.max(0, Math.min(12,
      typeof gnompronaHazardActive === "function"
        ? gnompronaHazardActive(p)
        : (p.hazardSel !== undefined ? Number(p.hazardSel) : level)));
    if (fought >= level && level < 12) {
      const novo = level + 1;
      p.hazardLevel = novo;
      addLog("level", `Hazard Level <b>${novo}</b> desbloqueado para a conta!`);
      toast(`Hazard Level ${novo} desbloqueado!`, "level");
      if (novo === 12 && typeof grantMissionReward === "function") {
        grantMissionReward(p, { items: [{ slug: "primal-bag", count: 4 }] });
        addLog("level", "Recompensa: <b>4× Primal Bag</b>!");
      }
    }
    if (typeof gnompronaSyncAccount === "function") gnompronaSyncAccount(p);
  }

  const cat = BOSS_CATS[bossCategory(slug)];
  // pontos saem por abate ate o limite da categoria; depois disso o boss
  // continua dando loot, mas nao inflaciona mais o nivel
  const pagosAntes = Math.min(antes, cat.kills);
  const pagosAgora = Math.min(depois, cat.kills);
  const ganhos = (pagosAgora - pagosAntes) * cat.pts;
  if (ganhos > 0) p.bossPoints += ganhos;
  return ganhos;
}

/* Progresso de um boss para a tela. */
function bosstiaryProgress(p, slug) {
  ensureBosstiary(p);
  const kills = p.bosstiary[slug] || 0;
  const cat = BOSS_CATS[bossCategory(slug)];
  return {
    kills: kills, alvo: cat.kills, cat: cat,
    completo: kills >= cat.kills,
    pct: Math.min(1, kills / cat.kills),
  };
}

/* Nivel do Bosstiary: cresce pela raiz dos pontos, entao os primeiros
 * niveis vem rapido e os altos exigem muito — como no jogo original, onde
 * o nivel e um marcador de longo prazo. */
function bosstiaryLevel(p) {
  ensureBosstiary(p);
  return Math.floor(Math.sqrt((p.bossPoints || 0) / 25));
}

/* Quantos pontos faltam para o proximo nivel. */
function bosstiaryNext(p) {
  const lv = bosstiaryLevel(p) + 1;
  const alvo = lv * lv * 25;
  return { nivel: lv, alvo: alvo, faltam: alvo - (p.bossPoints || 0) };
}

/* Bonus de dano contra bosses dado pelo nivel (1% por nivel, teto de 25%).
 * O combate multiplica o golpe por isto quando o alvo e um boss. */
function bosstiaryDamageBonus(p) {
  return 1 + Math.min(0.25, bosstiaryLevel(p) * 0.01);
}

/* ------------------------------------------------------------ Boss Slots
 * Molde Crystalserver/Tibia (io_bosstiary): cada char tem 2 slots fixos
 * (o 2º pede 1500 boss points) + o slot do boss do dia (boosted). Um boss
 * slotted dá chance extra de loot ao ser abatido: bônus dos boss points
 * (curva oficial) + 25% se o boss está no nível 3. Trocar de boss é grátis
 * nas 2 primeiras vezes; a partir da 3ª custa 300k*remoções - 500k.
 *
 * Níveis por categoria (marcos de kills; nível 3 = completo, pois o último
 * marco É o alvo): Bane 10/20/30, Archfoe 3/7/10, Nemesis 1/3/5 — mesma
 * escala dos oficiais (25/100/300, 5/20/60, 1/3/5) ajustada aos nossos
 * alvos de categoria. */
const BOSS_SLOT_LEVELS = {
  bane: [10, 20, 30],
  archfoe: [3, 7, 10],
  nemesis: [1, 3, 5],
};
const BOSS_SLOT2_POINTS = 1500;
/* Slot 3: desbloqueio ÚNICO por conta — 150 Tibia Coins (oficial). Gravado
 * em cosmetics.bossSlot3 da conta e espelhado em p.bossSlot3 do save. */
const BOSS_SLOT3_COINS = 150;
/* Boss do dia (slot boosted): kill conta 3× no bosstiário — nos moldes do
 * kill bonus oficial (multiplier + boost). O loot extra já vem do
 * dailyBossLootMul do servidor (15–35% sorteado por dia). */
const BOSS_SLOT_DAILY_KILLS = 3;

function ensureBossSlots(p) {
  if (!p.bossSlots || typeof p.bossSlots !== "object" || Array.isArray(p.bossSlots))
    p.bossSlots = { 1: null, 2: null, 3: null };
  p.bossSlotRemoves = Math.max(0, Number(p.bossSlotRemoves) || 0);
  p.bossSlot3 = p.bossSlot3 ? 1 : 0;
  return p;
}

/* Slot 3 desbloqueado? Flag da conta (cosmetics.bossSlot3) ou mirror no
 * save do personagem (p.bossSlot3) — cobre modo local e saves antigos. */
function bossSlot3Owned(p) {
  if (p && p.bossSlot3) return true;
  const cos = (typeof accountCosmetics === "function") ? accountCosmetics() : null;
  return !!(cos && cos.bossSlot3);
}

/* Nível 0–3 de um boss (marcos de kills por categoria). */
function bossSlotLevel(p, slug) {
  ensureBosstiary(p);
  const kills = p.bosstiary[slug] || 0;
  const lv = BOSS_SLOT_LEVELS[bossCategory(slug)] || BOSS_SLOT_LEVELS.bane;
  let lvl = 0;
  for (const k of lv) if (kills >= k) lvl++;
  return lvl;
}

/* "Unlocked" p/ slot = nível ≥1 (oficial: getBosstiaryFinished level 1). */
function bossSlotUnlocked(p, slug) {
  return bossSlotLevel(p, slug) >= 1;
}

/* Bônus de loot derivado dos boss points — curva oficial
 * io_bosstiary.calculateLootBonus. */
function bossLootBonusPct(points) {
  const pts = Math.max(0, Number(points) || 0);
  if (pts <= 250) return Math.floor(25 + pts / 10);
  if (pts < 1250) return Math.floor(37.5 + pts / 20);
  return Math.floor(100 + 0.5 *
    (Math.sqrt(8 * ((pts - 1250) / 5) + 81) - 9));
}

/* % extra de chance de loot quando o boss slotted é abatido:
 * bônus dos pontos + 25 se o boss atingiu o nível 3. */
function bossSlotBonusPct(p, slug) {
  ensureBossSlots(p);
  const sl = p.bossSlots || {};
  if (sl[1] !== slug && sl[2] !== slug && sl[3] !== slug) return 0;
  return bossLootBonusPct(p.bossPoints) +
    (bossSlotLevel(p, slug) >= 3 ? 25 : 0);
}

/* Preço de remover um boss do slot (oficial calculteRemoveBoss):
 * as 2 primeiras remoções são grátis; da 3ª em diante 300k*vezes - 500k. */
function bossSlotRemovePrice(removes) {
  removes = Math.max(0, Number(removes) || 0);
  return removes < 2 ? 0 : 300000 * removes - 500000;
}

/* Bosses que podem ocupar um slot (nível ≥1 e ativos no mundo). */
function bossSlotList(p) {
  return bosstiaryList().filter((s) => bossSlotUnlocked(p, s));
}

/* Validação compartilhada cliente/servidor antes do assign.
 * Retorna null se pode associar, ou a mensagem do motivo. */
function bossSlotAssignError(p, slot, slug) {
  ensureBossSlots(p);
  slot = Number(slot);
  if (slot !== 1 && slot !== 2 && slot !== 3) return "slot inválido";
  const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters)
    ? GAMEDATA.monsters[slug] : null;
  if (!m || !m.boss) return "não é um boss";
  if (!bossSlotUnlocked(p, slug))
    return "boss bloqueado — complete o nível 1 do bosstiário dele";
  if (slot === 2 && (p.bossPoints || 0) < BOSS_SLOT2_POINTS)
    return `o slot 2 exige ${typeof fmtFull === "function" ? fmtFull(BOSS_SLOT2_POINTS) : BOSS_SLOT2_POINTS} boss points`;
  if (slot === 3 && !bossSlot3Owned(p))
    return `o slot 3 exige o desbloqueio de ${BOSS_SLOT3_COINS} Tibia Coins`;
  if ([1, 2, 3].some((s) => s !== slot && p.bossSlots[s] === slug))
    return "este boss já ocupa outro slot";
  return null;
}

function bossSlotAssign(p, slot, slug) {
  const erro = bossSlotAssignError(p, slot, slug);
  if (erro) return { ok: false, erro: erro };
  p.bossSlots[Number(slot)] = slug;
  return { ok: true };
}

/* Remove: cobra o preço da remoção N+1 e limpa o slot. */
function bossSlotRemove(p, slot) {
  ensureBossSlots(p);
  slot = Number(slot);
  if (slot !== 1 && slot !== 2 && slot !== 3) return { ok: false, erro: "slot inválido" };
  if (!p.bossSlots[slot]) return { ok: false, erro: "slot vazio" };
  const preco = bossSlotRemovePrice(p.bossSlotRemoves);
  if (preco > 0) {
    if ((p.gold || 0) < preco)
      return { ok: false, erro: `custa ${typeof fmtFull === "function" ? fmtFull(preco) : preco} gp` };
    p.gold -= preco;
  }
  p.bossSlots[slot] = null;
  p.bossSlotRemoves++;
  return { ok: true, preco: preco };
}

/* Resumo para o cabecalho da aba. */
function bosstiarySummary(p) {
  ensureBosstiary(p);
  const todos = bosstiaryList();
  let completos = 0, descobertos = 0;
  for (const s of todos) {
    const k = p.bosstiary[s] || 0;
    if (k > 0) descobertos++;
    if (k >= BOSS_CATS[bossCategory(s)].kills) completos++;
  }
  return {
    total: todos.length, descobertos: descobertos, completos: completos,
    pontos: p.bossPoints || 0, nivel: bosstiaryLevel(p),
    prox: bosstiaryNext(p), bonus: bosstiaryDamageBonus(p),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BOSS_CATS, bossCategory, bosstiaryList, bosstiaryKill,
    bosstiaryProgress, bosstiaryLevel, bosstiaryDamageBonus, bosstiarySummary,
    BOSS_SLOT_LEVELS, BOSS_SLOT2_POINTS, BOSS_SLOT_DAILY_KILLS,
    ensureBossSlots, bossSlotLevel, bossSlotUnlocked, bossLootBonusPct,
    bossSlotBonusPct, bossSlotRemovePrice, bossSlotList,
    bossSlotAssignError, bossSlotAssign, bossSlotRemove,
  };
}
