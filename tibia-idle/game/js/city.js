/*
 * city.js — a cidade: NPCs, lojas, banco, templo e treinador.
 * O jogador alterna entre CIDADE (seguro, sem combate) e CAÇADA.
 */
"use strict";

/* NPCs disponiveis na cidade */
const NPCS = {
  shopkeeper: {
    name: "Rashid", role: "Loja de Equipamentos", sprite: "shopkeeper",
    greet: "Bem-vindo! Tenho as melhores armas e armaduras de Thais.",
    type: "shop",
  },
  magicshop: {
    name: "Eremo", role: "Runas & Poções", sprite: "magicshop",
    greet: "Runas frescas, feitas hoje. O que você precisa?",
    type: "supply",
  },
  blacksmith: {
    name: "Grimwald", role: "Ferreiro", sprite: "blacksmith",
    greet: "Traga seu loot que eu compro tudo por um bom preço.",
    type: "sell",
  },
  banker: {
    name: "Lorde Aldric", role: "Banco de Thais", sprite: "banker",
    greet: "Seu ouro está seguro conosco. Depósitos não se perdem na morte.",
    type: "bank",
  },
  priest: {
    name: "Irmã Elane", role: "Templo", sprite: "priest",
    greet: "Que a luz te guie. Posso curar suas feridas e abençoar sua alma.",
    type: "temple",
  },
  trainer: {
    name: "Mestre Dunfir", role: "Academia", sprite: "trainer",
    greet: "Treine comigo e suas habilidades crescerão, por um preço.",
    type: "train",
  },
  innkeeper: {
    name: "Marta", role: "Estalagem", sprite: "innkeeper",
    greet: "Descanse aqui e recupere sua stamina, viajante.",
    type: "inn",
  },
  captain: {
    name: "Capitão Bloodhand", role: "Viagens", sprite: "captain",
    greet: "Para onde vamos caçar hoje?",
    type: "travel",
  },
};

/* Catalogo da loja de equipamentos, por faixa de nivel.
 * Precos derivam do valor de venda do item (markup de 4x). */
function shopCatalog(p) {
  const out = [];
  for (const slug in GAMEDATA.items) {
    const it = GAMEDATA.items[slug];
    if (!it.s || it.s === "ammo") continue;
    if (it.t === "loot") continue;
    // so vende itens ate um pouco acima do nivel do jogador
    const req = it.lvl || 1;
    if (req > p.level + 15) continue;
    // itens muito raros nao ficam na loja (tem que dropar)
    const value = it.sell || 0;
    if (value > 25000) continue;
    if (value < 20) continue;
    out.push({ slug: slug, item: it, price: Math.floor(value * 4) });
  }
  // ordena pelo que e mais util para este personagem (score do auto-equip),
  // assim o jogador ve primeiro o que vale a pena comprar
  out.sort((a, b) => itemScore(p, b.slug) - itemScore(p, a.slug));
  return out;
}

/* Preco de treino de uma skill (sobe com o nivel atual) */
function trainPrice(p, skill) {
  const lvl = skill === "magic" ? p.ml : p.skills[skill];
  return Math.floor(500 * Math.pow(1.35, lvl - 9));
}

/* ------------------------------------------------------------ acoes */

function bankDeposit(p, amount) {
  amount = Math.min(amount, p.gold);
  if (amount <= 0) return 0;
  p.gold -= amount;
  p.bank += amount;
  return amount;
}

function bankWithdraw(p, amount) {
  amount = Math.min(amount, p.bank);
  if (amount <= 0) return 0;
  p.bank -= amount;
  p.gold += amount;
  return amount;
}

/* Templo: cura completa gratuita + compra de blessing */
const BLESS_PRICE_BASE = 2000;

function blessPrice(p) {
  return Math.floor(BLESS_PRICE_BASE + p.level * 200);
}

function buyBlessing(p) {
  const price = blessPrice(p);
  if (p.blessed) return { ok: false, msg: "Você já está abençoado." };
  if (p.gold < price) return { ok: false, msg: "Ouro insuficiente." };
  p.gold -= price;
  p.blessed = true;
  return { ok: true, msg: "Você foi abençoado! A próxima morte custará muito menos." };
}

/* Estalagem: restaura stamina pagando por hora */
function restPrice(p, hours) {
  return Math.floor(hours * (200 + p.level * 12));
}

function buyRest(p, hours) {
  const MAX = 42 * 3600;
  const missing = MAX - p.stamina;
  if (missing <= 60) return { ok: false, msg: "Sua stamina já está cheia." };
  const secs = Math.min(hours * 3600, missing);
  const price = restPrice(p, secs / 3600);
  if (p.gold < price) return { ok: false, msg: "Ouro insuficiente." };
  p.gold -= price;
  p.stamina = Math.min(MAX, p.stamina + secs);
  return { ok: true, msg: `Descansou ${(secs / 3600).toFixed(1)}h de stamina.`,
           price: price };
}

/* Academia: compra pontos de skill direto */
function buyTraining(p, skill, times) {
  let spent = 0, gained = 0;
  for (let i = 0; i < times; i++) {
    const price = trainPrice(p, skill);
    if (p.gold < price) break;
    p.gold -= price;
    spent += price;
    if (skill === "magic") {
      p.ml++;
    } else {
      p.skills[skill]++;
      p.skillTries[skill] = 0;
    }
    gained++;
  }
  return { spent: spent, gained: gained };
}

/* Compra de item na loja */
function buyItem(p, slug, price) {
  if (p.gold < price) return { ok: false, msg: "Ouro insuficiente." };
  p.gold -= price;
  addItem(p, slug, 1);
  return { ok: true };
}
