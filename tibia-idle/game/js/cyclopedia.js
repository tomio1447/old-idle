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

/* Estagios do bestiario. Os marcos de kills NAO sao mais fixos: cada
 * monstro traz os proprios em best.toKill/u1/u2 (vindos do Canary), porque
 * la um rat completa em 5 abates e um dragon lord em 2500. A escala unica
 * de 1/25/100/250 que existia aqui tornava o rat interminavel e o boss
 * trivial. Os valores abaixo sao so o fallback de quem nao tem ficha. */
const BEST_ESTAGIOS = [
  { nome: "Descoberto", kills: 1, revela: ["hp", "exp"] },
  { nome: "Iniciado", kills: 25, revela: ["dano", "armadura", "loot"] },
  { nome: "Experiente", kills: 100, revela: ["resistencias", "velocidade"] },
  { nome: "Completo", kills: 250, revela: ["tudo"] },
];

/* Marcos reais de um monstro: [descoberto, iniciado, experiente, completo].
 *
 * O Canary da tres numeros por criatura — FirstUnlock, SecondUnlock e
 * toKill. O primeiro estagio e sempre 1 abate (basta ver o bicho morrer). */
function bestiaryMarcos(slug) {
  const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters)
    ? GAMEDATA.monsters[slug] : null;
  const b = m && m.best;
  if (!b || !b.toKill) return BEST_ESTAGIOS.map((e) => e.kills);
  const total = b.toKill;
  // u1/u2 podem vir maiores que o total em algumas fichas: ordena e limita
  const u1 = Math.max(1, Math.min(b.u1 || Math.ceil(total / 10), total));
  const u2 = Math.max(u1, Math.min(b.u2 || Math.ceil(total / 2), total));
  return [1, u1, u2, total];
}

/* Charm points que o monstro paga ao completar o bestiario. O Canary define
 * por criatura (CharmsPoints); dividimos entre os estagios. */
function bestiaryCharms(slug) {
  const m = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters)
    ? GAMEDATA.monsters[slug] : null;
  const total = (m && m.best && m.best.charm) || 25;
  // 0 no primeiro estagio (so descobriu), o resto crescendo ate o total
  return [0, Math.round(total * 0.2), Math.round(total * 0.4), total];
}

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
  // Rate de bestiário do servidor: kills contam 2x
  const bestRate = (typeof SERVER_BESTIARY_RATE !== "undefined") ? SERVER_BESTIARY_RATE : 1;
  const kills = Math.floor((n || 1) * bestRate);
  const antes = p.bestiary[slug] || 0;
  const depois = antes + kills;
  p.bestiary[slug] = depois;
  const marcos = bestiaryMarcos(slug);
  const pontos = bestiaryCharms(slug);
  let ganhos = 0;
  for (let i = 0; i < marcos.length; i++) {
    const chave = slug + ":" + i;
    // credita uma unica vez por estagio, mesmo recarregando o jogo
    if (depois >= marcos[i] && !p.charmsPagos[chave]) {
      p.charmsPagos[chave] = 1;
      ganhos += pontos[i];
    }
  }
  if (ganhos) p.charmPoints += ganhos;
  return ganhos;
}

/* Em que estagio esta o monstro (0 = nem descoberto) */
function bestiaryStage(p, slug) {
  ensureCyclopedia(p);
  const k = p.bestiary[slug] || 0;
  const marcos = bestiaryMarcos(slug);
  let st = 0;
  for (let i = 0; i < marcos.length; i++) {
    if (k >= marcos[i]) st = i + 1;
  }
  return st;
}

function bestiaryProgress(p, slug) {
  ensureCyclopedia(p);
  const kills = p.bestiary[slug] || 0;
  const marcos = bestiaryMarcos(slug);
  const st = bestiaryStage(p, slug);
  const completo = st >= marcos.length;
  // a barra mede a distancia ate o PROXIMO marco, nao ate o total
  const alvo = completo ? marcos[marcos.length - 1] : marcos[st];
  return {
    kills: kills, estagio: st, alvo: alvo,
    total: marcos[marcos.length - 1],
    nome: st === 0 ? "Desconhecido" : BEST_ESTAGIOS[st - 1].nome,
    completo: completo,
    pct: Math.min(1, kills / Math.max(1, alvo)),
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
