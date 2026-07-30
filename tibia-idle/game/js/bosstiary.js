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

/* Todos os bosses que podem entrar na lista (precisam de arte). */
function bosstiaryList(filtro) {
  if (typeof GAMEDATA === "undefined") return [];
  const out = [];
  for (const slug in GAMEDATA.monsters) {
    const m = GAMEDATA.monsters[slug];
    if (!m.boss || !m.jogavel) continue;
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
  };
}
