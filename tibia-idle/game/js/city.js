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

/* Receitas do treino online de mana.
 * O treino não gasta gold: usa mana, conta como mana spent para ML, e cria
 * ammo/runa em cargas conforme vocação e requisitos. */
const MANA_TRAIN_RECIPES = {
  "paladin-arrow": {
    name: "Conjurar Arrows", vocs: ["paladin"], type: "ammo",
    slug: "arrow", amount: 15, mana: 100, level: 13, ml: 0,
    desc: "Cria 15 arrows para caça de distância.",
  },
  "sorc-hmm": {
    name: "Heavy Magic Missile", vocs: ["sorcerer"], type: "supply",
    slug: "heavy-magic-missile-rune", charges: 1, mana: 350,
    level: 25, ml: 3, desc: "Runa ofensiva básica de sorcerer.",
  },
  "sorc-gfb": {
    name: "Great Fireball", vocs: ["sorcerer"], type: "supply",
    slug: "great-fireball-rune", charges: 1, mana: 530,
    level: 30, ml: 4, desc: "Runa de fogo em área.",
  },
  "sorc-explosion": {
    name: "Explosion", vocs: ["sorcerer"], type: "supply",
    slug: "explosion-rune", charges: 1, mana: 570,
    level: 31, ml: 6, desc: "Runa explosiva para dano físico.",
  },
  "sorc-sd": {
    name: "Sudden Death", vocs: ["sorcerer"], type: "supply",
    slug: "sudden-death-rune", charges: 1, mana: 985,
    level: 45, ml: 15, desc: "Runa de alto dano de death.",
  },
  "druid-ih": {
    name: "Intense Healing", vocs: ["druid"], type: "supply",
    slug: "intense-healing-rune", charges: 1, mana: 120,
    level: 11, ml: 1, desc: "Runa de cura inicial de druid.",
  },
  "druid-uh": {
    name: "Ultimate Healing", vocs: ["druid"], type: "supply",
    slug: "ultimate-healing-rune", charges: 1, mana: 400,
    level: 24, ml: 4, desc: "Runa de cura forte.",
  },
  "druid-sd": {
    name: "Sudden Death", vocs: ["druid"], type: "supply",
    slug: "sudden-death-rune", charges: 1, mana: 985,
    level: 45, ml: 15, desc: "Runa ofensiva avançada.",
  },
};

function manaTrainRecipesFor(p) {
  return Object.keys(MANA_TRAIN_RECIPES)
    .map((id) => Object.assign({ id: id }, MANA_TRAIN_RECIPES[id]))
    .filter((r) => r.vocs.indexOf(p.voc) !== -1);
}

function manaTrainReqText(r) {
  return `nv ${r.level} · ML ${r.ml} · ${fmtFull(r.mana)} mana`;
}

function manaTrainCanSelect(p, r) {
  if (r.vocs.indexOf(p.voc) === -1)
    return { ok: false, msg: "Vocação incompatível." };
  if (p.level < r.level)
    return { ok: false, msg: `Requer nível ${r.level}.` };
  if (p.ml < r.ml)
    return { ok: false, msg: `Requer magic level ${r.ml}.` };
  return { ok: true, msg: "" };
}

function manaTrainProductLabel(r) {
  if (r.type === "ammo") return `${r.amount}x ${itemName(r.slug)}`;
  const s = SUPPLIES[r.slug];
  return `${r.charges || 1} carga(s) de ${s ? s.name : itemName(r.slug)}`;
}

function setManaTrain(p, id) {
  if (!id) { p.config.manaTrain = null; return { ok: true, msg: "Mana train pausado." }; }
  const r = MANA_TRAIN_RECIPES[id];
  if (!r) return { ok: false, msg: "Receita inválida." };
  const check = manaTrainCanSelect(p, r);
  if (!check.ok) return check;
  p.config.manaTrain = id;
  return { ok: true, msg: `Mana train ativo: ${r.name}.` };
}

function runManaTrainTick(p) {
  const id = p.config && p.config.manaTrain;
  if (!id) return null;
  const r = MANA_TRAIN_RECIPES[id];
  if (!r) { p.config.manaTrain = null; return null; }
  const check = manaTrainCanSelect(p, r);
  if (!check.ok) { p.config.manaTrain = null; return { stopped: true, msg: check.msg }; }
  if (p.mp < r.mana) return null;

  const beforeMl = p.ml;
  p.mp -= r.mana;
  addManaSpent(p, r.mana);
  if (r.type === "ammo") {
    addItem(p, r.slug, r.amount);
    if (p.equip.weapon && GAMEDATA.items[p.equip.weapon.item] &&
        GAMEDATA.items[p.equip.weapon.item].t === "distance") {
      if (!p.equip.ammo || p.equip.ammo.item === r.slug)
        p.equip.ammo = { item: r.slug, count: p.bag[r.slug] || 0 };
    }
  } else {
    p.supplies[r.slug] = (p.supplies[r.slug] || 0) + (r.charges || 1);
  }
  return {
    recipe: r,
    product: manaTrainProductLabel(r),
    mlUp: p.ml - beforeMl,
  };
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
