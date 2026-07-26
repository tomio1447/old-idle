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

/* ------------------------------------------------------------ academia safezone */
const ACADEMY_SKILL_MULT = 3;      // 200% mais rápido que bater em alvo comum
const ACADEMY_MAGE_HIT_MANA = 65;

const ACADEMY_CONJURES = {
  "rp-arrow": {
    name: "Arrows", vocs: ["paladin"], kind: "ammo", slug: "arrow",
    amount: 25, mana: 100, level: 13, ml: 0,
    words: "conjure arrows", desc: "Cria arrows para distance fighting.",
  },
  "rp-bolt": {
    name: "Bolts", vocs: ["paladin"], kind: "ammo", slug: "bolt",
    amount: 15, mana: 140, level: 20, ml: 1,
    words: "conjure bolts", desc: "Cria bolts para crossbow.",
  },
  "rp-power-bolt": {
    name: "Power Bolts", vocs: ["paladin"], kind: "ammo", slug: "power-bolt",
    amount: 5, mana: 220, level: 40, ml: 4,
    words: "conjure power bolts", desc: "Cria munição forte para treino/caça.",
  },
  "sorc-hmm": {
    name: "Heavy Magic Missile", vocs: ["sorcerer"], kind: "supply",
    slug: "heavy-magic-missile-rune", charges: 1, mana: 350,
    level: 25, ml: 3, words: "adori gran", desc: "Cria 1 carga de HMM.",
  },
  "sorc-gfb": {
    name: "Great Fireball", vocs: ["sorcerer"], kind: "supply",
    slug: "great-fireball-rune", charges: 1, mana: 530,
    level: 30, ml: 4, words: "adori gran flam", desc: "Cria 1 carga de GFB.",
  },
  "sorc-explosion": {
    name: "Explosion", vocs: ["sorcerer"], kind: "supply",
    slug: "explosion-rune", charges: 1, mana: 570,
    level: 31, ml: 6, words: "adevo mas hur", desc: "Cria 1 carga de Explosion.",
  },
  "sorc-sd": {
    name: "Sudden Death", vocs: ["sorcerer"], kind: "supply",
    slug: "sudden-death-rune", charges: 1, mana: 985,
    level: 45, ml: 15, words: "adori gran mort", desc: "Cria 1 carga de SD.",
  },
  "druid-ih": {
    name: "Intense Healing", vocs: ["druid"], kind: "supply",
    slug: "intense-healing-rune", charges: 1, mana: 120,
    level: 11, ml: 1, words: "adura gran", desc: "Cria 1 carga de IH.",
  },
  "druid-uh": {
    name: "Ultimate Healing", vocs: ["druid"], kind: "supply",
    slug: "ultimate-healing-rune", charges: 1, mana: 400,
    level: 24, ml: 4, words: "adura vita", desc: "Cria 1 carga de UH.",
  },
  "druid-sd": {
    name: "Sudden Death", vocs: ["druid"], kind: "supply",
    slug: "sudden-death-rune", charges: 1, mana: 985,
    level: 45, ml: 15, words: "adori gran mort", desc: "Cria 1 carga de SD.",
  },
  "knight-light": {
    name: "Utevo Gran Lux", vocs: ["knight"], kind: "support",
    mana: 60, level: 13, ml: 0, words: "utevo gran lux",
    desc: "Magia de suporte: luz forte. Conta mana spent para ML.",
  },
  "knight-haste": {
    name: "Utani Hur", vocs: ["knight"], kind: "support",
    mana: 60, level: 14, ml: 0, words: "utani hur",
    buff: "haste", duration: 60000,
    desc: "Magia de suporte: haste no treino por 60s.",
  },
};

function academySkillFor(p) {
  if (p.voc === "knight") {
    const sk = weaponSkill(p);
    return ["sword", "axe", "club"].indexOf(sk) !== -1 ? sk : null;
  }
  if (p.voc === "paladin") return "dist";
  if (p.voc === "druid" || p.voc === "sorcerer") return "magic";
  return "fist";
}

function academyStatus(p) {
  const skill = academySkillFor(p);
  if (p.voc === "knight" && !skill)
    return { ok: false, skill: null, msg: "Equipe sword, club ou axe para treinar como knight." };
  if (p.voc === "paladin") {
    const w = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
    if (!w || w.t !== "distance")
      return { ok: false, skill: "dist", msg: "Equipe bow/crossbow para treinar distance fighting." };
    if (!p.equip.ammo || !p.equip.ammo.item)
      return { ok: false, skill: "dist", msg: "Selecione arrows/bolts na mochila ou conjure munição." };
  }
  return { ok: true, skill: skill, msg: "Treinando " + (SKILL_NAMES[skill] || skill) };
}

function newAcademyTraining(p) {
  const st = academyStatus(p);
  return {
    startedAt: Date.now(), time: 0, hitCd: 500, hits: 0,
    skill: st.skill, lastMsg: 0, hasteUntil: 0, lightUntil: 0,
    stats: { hits: 0, damage: 0, skillUps: 0, shieldUps: 0, manaSpent: 0,
             supplyUsed: {}, supplyBought: {}, supplyCost: 0 },
    events: [],
  };
}

function academyAttackDelay(t) {
  return t.hasteUntil > Date.now() ? 1500 : 2000;
}

function academyConjuresFor(p) {
  return Object.keys(ACADEMY_CONJURES)
    .map((id) => Object.assign({ id: id }, ACADEMY_CONJURES[id]))
    .filter((r) => r.vocs.indexOf(p.voc) !== -1);
}

function academyConjureCheck(p, r) {
  if (!r || r.vocs.indexOf(p.voc) === -1)
    return { ok: false, msg: "Vocação incompatível." };
  if (p.level < r.level)
    return { ok: false, msg: `Requer nível ${r.level}.` };
  if (p.ml < r.ml)
    return { ok: false, msg: `Requer magic level ${r.ml}.` };
  if (p.mp < r.mana)
    return { ok: false, msg: `Mana insuficiente (${fmtFull(r.mana)}).` };
  return { ok: true, msg: "" };
}

function academyConjureProduct(r) {
  if (r.kind === "ammo") return `${r.amount}x ${itemName(r.slug)}`;
  if (r.kind === "supply") {
    const s = SUPPLIES[r.slug];
    return `${r.charges || 1} carga(s) de ${s ? s.name : itemName(r.slug)}`;
  }
  return r.name;
}

function castAcademyConjure(p, id) {
  const r = ACADEMY_CONJURES[id];
  const check = academyConjureCheck(p, r);
  if (!check.ok) return check;

  const beforeMl = p.ml;
  p.mp -= r.mana;
  addManaSpent(p, r.mana);

  if (r.kind === "ammo") {
    addItem(p, r.slug, r.amount);
    if (!p.equip.ammo || p.equip.ammo.item === r.slug)
      p.equip.ammo = { item: r.slug, count: p.bag[r.slug] || 0 };
  } else if (r.kind === "supply") {
    p.supplies[r.slug] = (p.supplies[r.slug] || 0) + (r.charges || 1);
  } else if (r.kind === "support" && typeof G !== "undefined" && G.training) {
    if (r.buff === "haste") G.training.hasteUntil = Date.now() + (r.duration || 60000);
    if (r.words === "utevo gran lux") G.training.lightUntil = Date.now() + 180000;
  }

  return {
    ok: true,
    msg: `${r.words}: ${academyConjureProduct(r)}.`,
    mlUp: p.ml - beforeMl,
  };
}

function academyTrainingTick(t, p, dt, now) {
  t.time += dt;
  t.hitCd -= dt;
  if (t.hitCd > 0) return;

  const st = academyStatus(p);
  t.skill = st.skill;
  if (!st.ok) {
    if (now - t.lastMsg > 3000) {
      t.events.push({ type: "msg", msg: st.msg });
      t.lastMsg = now;
    }
    t.hitCd = 1000;
    return;
  }

  let skillUp = false;
  let dmg = 0;
  if (st.skill === "magic") {
    if (p.mp < ACADEMY_MAGE_HIT_MANA) {
      if (now - t.lastMsg > 3000) {
        t.events.push({ type: "msg", msg: "Aguardando mana para bater no Treiner." });
        t.lastMsg = now;
      }
      t.hitCd = 1000;
      return;
    }
    p.mp -= ACADEMY_MAGE_HIT_MANA;
    t.stats.manaSpent += ACADEMY_MAGE_HIT_MANA;
    skillUp = addManaSpent(p, ACADEMY_MAGE_HIT_MANA * ACADEMY_SKILL_MULT);
  } else if (st.skill === "dist") {
    if (!consumeAmmoCharge(t, p)) {
      if (now - t.lastMsg > 3000) {
        t.events.push({ type: "msg", msg: "Sem munição/gold. Use conjure para criar arrows ou bolts." });
        t.lastMsg = now;
      }
      t.hitCd = 1000;
      return;
    }
    const d = playerDamage(p);
    dmg = Math.max(1, Math.floor((d.min + Math.random() * (d.max - d.min)) * 0.85));
    skillUp = addSkillTries(p, "dist", ACADEMY_SKILL_MULT);
  } else {
    if (p.voc === "knight") {
      const d = playerDamage(p);
      dmg = Math.max(1, Math.floor((d.min + Math.random() * (d.max - d.min)) * 0.9));
    }
    skillUp = addSkillTries(p, st.skill, ACADEMY_SKILL_MULT);
  }

  const shieldUp = addSkillTries(p, "shield", ACADEMY_SKILL_MULT);
  t.hits++;
  t.stats.hits++;
  t.stats.damage += dmg;
  if (skillUp) t.stats.skillUps++;
  if (shieldUp) t.stats.shieldUps++;
  t.events.push({ type: "hit", skill: st.skill, dmg: dmg,
                  skillUp: skillUp, shieldUp: shieldUp });
  t.hitCd = academyAttackDelay(t);
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
