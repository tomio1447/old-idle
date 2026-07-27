/*
 * cyclopedia.js — a Cyclopedia do 15.x
 *
 * Estrutura copiada do modules/game_cyclopedia do otclient: nove abas, com os
 * icones oficiais do cliente. O que cada uma faz aqui depende do que o jogo
 * tem de verdade — e isso esta declarado em CYCLO_ABAS.pronta, para a tela
 * dizer honestamente o que ainda nao existe em vez de fingir.
 *
 *   Character  -> stats, itens equipados e APARENCIAS (outfits/addons/mounts)
 *   Bestiary   -> os 91 monstros importados do canary, com loot e resistencias
 *   Bosstiary  -> os bosses do jogo, com cooldown e loot
 *   Charms     -> charm points ganhos ao completar bestiary
 *   Items      -> catalogo dos itens conhecidos
 *   Map / Houses / Boss Slots / Magical Archives -> sem base no jogo ainda
 */
"use strict";

const CYCLO_ABAS = [
  { id: "character", nome: "Personagem", icone: "character", pronta: true },
  { id: "bestiary", nome: "Bestiário", icone: "bestiary", pronta: true },
  { id: "bosstiary", nome: "Bosstiário", icone: "bosstiary", pronta: true },
  { id: "charms", nome: "Charms", icone: "charms", pronta: true },
  { id: "items", nome: "Itens", icone: "items", pronta: true },
  { id: "map", nome: "Mapa", icone: "map", pronta: false,
    falta: "O jogo não tem mapa-múndi navegável: as caçadas são instâncias " +
           "escolhidas por lista, sem coordenadas." },
  { id: "houses", nome: "Casas", icone: "houses", pronta: false,
    falta: "Não existe sistema de casas, aluguel nem mobília." },
  { id: "bossSlot", nome: "Boss Slots", icone: "bossSlot", pronta: false,
    falta: "Depende do Bosstiário com dezenas de bosses e pontos de " +
           "bosstiary; hoje só existe 1 boss no jogo." },
  { id: "magicalArchives", nome: "Arquivos Mágicos", icone: "magical",
    pronta: false,
    falta: "Wheel of Destiny e Forge não foram implementados." },
];

/* Categorias do bestiario, como o canary agrupa as racas */
const BEST_CLASSES = {
  mammal: "Mamíferos", reptile: "Répteis", amphibic: "Anfíbios",
  bird: "Aves", vermin: "Vermes", undead: "Mortos-vivos",
  humanoid: "Humanoides", human: "Humanos", giant: "Gigantes",
  demon: "Demônios", dragon: "Dragões", elemental: "Elementais",
  construct: "Constructos", plant: "Plantas", aquatic: "Aquáticos",
  slime: "Slimes", magical: "Mágicos", extra: "Outros",
};

/* Quantos kills para completar cada estagio do bestiario.
 * O canary usa marcos por dificuldade; aqui uma escala unica e previsivel. */
const BEST_ESTAGIOS = [
  { nome: "Descoberto", kills: 1, revela: ["hp", "exp"] },
  { nome: "Iniciado", kills: 25, revela: ["dano", "armadura", "loot"] },
  { nome: "Experiente", kills: 100, revela: ["resistencias", "velocidade"] },
  { nome: "Completo", kills: 250, revela: ["tudo"] },
];

/* Charm points ganhos ao chegar em cada estagio */
const BEST_CHARM_POINTS = [0, 5, 15, 25];

/* Charms disponiveis. Cada um custa pontos e da um efeito passivo. */
const CHARMS = {
  wound: { nome: "Wound", custo: 600, tipo: "dano", elemento: "physical",
           valor: 5, desc: "5% de dano físico extra ao acertar." },
  enflame: { nome: "Enflame", custo: 1000, tipo: "dano", elemento: "fire",
             valor: 5, desc: "5% de dano de fogo extra ao acertar." },
  poison: { nome: "Poison", custo: 600, tipo: "dano", elemento: "earth",
            valor: 5, desc: "5% de dano de terra extra ao acertar." },
  freeze: { nome: "Freeze", custo: 800, tipo: "dano", elemento: "ice",
            valor: 5, desc: "5% de dano de gelo extra ao acertar." },
  zap: { nome: "Zap", custo: 800, tipo: "dano", elemento: "energy",
         valor: 5, desc: "5% de dano de energia extra ao acertar." },
  curse: { nome: "Curse", custo: 900, tipo: "dano", elemento: "death",
           valor: 5, desc: "5% de dano de morte extra ao acertar." },
  cripple: { nome: "Cripple", custo: 500, tipo: "utilidade",
             desc: "10% de chance de deixar o monstro mais lento." },
  parry: { nome: "Parry", custo: 1000, tipo: "defesa", valor: 5,
           desc: "Reflete 5% do dano recebido." },
  dodge: { nome: "Dodge", custo: 800, tipo: "defesa", valor: 4,
           desc: "4% de chance de esquivar por completo." },
  vampiric: { nome: "Vampiric Embrace", custo: 1200, tipo: "defesa", valor: 3,
              desc: "Recupera 3% do dano causado como vida." },
};

/* --------------------------------------------------------------- estado */

function ensureCyclopedia(p) {
  if (!p.bestiary) p.bestiary = {};        // slug -> kills
  if (!p.charms) p.charms = {};            // charmId -> true
  if (p.charmPoints === undefined) p.charmPoints = 0;
  if (!p.charmsPagos) p.charmsPagos = {};  // estagios ja creditados
  return p;
}

/* Registra um abate no bestiario e credita charm points por estagio novo */
function bestiaryKill(p, slug, n) {
  ensureCyclopedia(p);
  const antes = p.bestiary[slug] || 0;
  const depois = antes + (n || 1);
  p.bestiary[slug] = depois;
  let ganhos = 0;
  for (let i = 0; i < BEST_ESTAGIOS.length; i++) {
    const e = BEST_ESTAGIOS[i];
    const chave = slug + ":" + i;
    // credita uma unica vez por estagio, mesmo recarregando o jogo
    if (depois >= e.kills && !p.charmsPagos[chave]) {
      p.charmsPagos[chave] = 1;
      ganhos += BEST_CHARM_POINTS[i];
    }
  }
  if (ganhos) p.charmPoints += ganhos;
  return ganhos;
}

/* Em que estagio esta o monstro (0 = nem descoberto) */
function bestiaryStage(p, slug) {
  ensureCyclopedia(p);
  const k = p.bestiary[slug] || 0;
  let st = 0;
  for (let i = 0; i < BEST_ESTAGIOS.length; i++) {
    if (k >= BEST_ESTAGIOS[i].kills) st = i + 1;
  }
  return st;
}

function bestiaryProgress(p, slug) {
  ensureCyclopedia(p);
  const kills = p.bestiary[slug] || 0;
  const st = bestiaryStage(p, slug);
  const prox = BEST_ESTAGIOS[Math.min(st, BEST_ESTAGIOS.length - 1)];
  const alvo = st >= BEST_ESTAGIOS.length ? prox.kills : prox.kills;
  return {
    kills: kills, estagio: st, alvo: alvo,
    nome: st === 0 ? "Desconhecido" : BEST_ESTAGIOS[st - 1].nome,
    completo: st >= BEST_ESTAGIOS.length,
    pct: Math.min(1, kills / alvo),
  };
}

/* O jogador ja pode ver esse dado do monstro? */
function bestiaryReveals(p, slug, campo) {
  const st = bestiaryStage(p, slug);
  if (st >= BEST_ESTAGIOS.length) return true;
  for (let i = 0; i < st; i++) {
    const r = BEST_ESTAGIOS[i].revela;
    if (r.indexOf("tudo") !== -1 || r.indexOf(campo) !== -1) return true;
  }
  return false;
}

/* Resumo do bestiario para o cabecalho da aba */
function bestiarySummary(p) {
  ensureCyclopedia(p);
  const todos = Object.keys(GAMEDATA.monsters || {});
  let desc = 0, comp = 0;
  for (const s of todos) {
    const st = bestiaryStage(p, s);
    if (st > 0) desc++;
    if (st >= BEST_ESTAGIOS.length) comp++;
  }
  return { total: todos.length, descobertos: desc, completos: comp,
           pontos: p.charmPoints || 0 };
}

/* ---------------------------------------------------------------- charms */

function charmOwned(p, id) {
  ensureCyclopedia(p);
  return !!p.charms[id];
}

function buyCharm(p, id) {
  const c = CHARMS[id];
  if (!c) return { ok: false, erro: "Charm desconhecido." };
  if (charmOwned(p, id)) return { ok: false, erro: "Você já tem esse charm." };
  if ((p.charmPoints || 0) < c.custo)
    return { ok: false, erro: "Charm points insuficientes." };
  p.charmPoints -= c.custo;
  p.charms[id] = true;
  return { ok: true };
}

/* Soma os efeitos dos charms comprados, para o combate consultar */
function charmTotals(p) {
  ensureCyclopedia(p);
  const t = { dano: {}, reflete: 0, esquiva: 0, vampirismo: 0, lentidao: 0 };
  for (const id in p.charms) {
    const c = CHARMS[id];
    if (!c) continue;
    if (c.tipo === "dano" && c.elemento) {
      t.dano[c.elemento] = (t.dano[c.elemento] || 0) + c.valor;
    } else if (id === "parry") t.reflete += c.valor;
    else if (id === "dodge") t.esquiva += c.valor;
    else if (id === "vampiric") t.vampirismo += c.valor;
    else if (id === "cripple") t.lentidao += 10;
  }
  return t;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CYCLO_ABAS, CHARMS, BEST_ESTAGIOS, bestiaryKill, bestiaryStage,
    bestiaryProgress, bestiarySummary, buyCharm, charmTotals,
  };
}
