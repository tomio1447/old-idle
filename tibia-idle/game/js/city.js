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
    name: "Grimwald", role: "Ferreiro — Upgrades", sprite: "blacksmith",
    greet: "Traga seu equipamento e Dust da Forja que eu forjo algo melhor.",
    type: "upgrade",
  },
  banker: {
    name: "Lorde Aldric", role: "Banco de Thais", sprite: "banker",
    greet: "Seu ouro está seguro conosco. Depósitos não se perdem na morte.",
    type: "bank",
  },
  priest: {
    name: "King Tibianus", role: "Promoção", sprite: "banker",
    greet: "Greetings, adventurer. I can grant promotions to worthy citizens of Tibia.",
    type: "promotion",
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
    // Item que nenhum NPC do Tibia vende nao entra na loja: no Canary
    // (appearances.dat) so 304 dos 1328 equipamentos tem npcsaledata. O
    // resto e drop, quest ou recompensa e precisa ser conquistado.
    if (typeof itemNaLoja === "function" && !itemNaLoja(it)) continue;
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
    addAmmo(p, r.slug, r.amount);
    if (p.equip.weapon && GAMEDATA.items[p.equip.weapon.item] &&
        GAMEDATA.items[p.equip.weapon.item].t === "distance") {
      if (!p.equip.ammo || p.equip.ammo.item === r.slug) setActiveAmmo(p, r.slug);
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

/* ------------------------------------------------------------ ferreiro: upgrades
 * Upgrade por tiers: cada nivel soma atributos ao item e custa gold +
 * Dust da Exaltation Forge (o recurso p.dust; a poeira mística verde
 * criada antes do Canary foi removida). A partir do tier 4 pode falhar,
 * consumindo o material mas nunca destruindo o item. */
const UPGRADE_MAX_TIER = 10;
const UPGRADE_SLOTS = ["weapon", "armor", "helmet", "legs", "shield", "boots"];

/* +6% por tier nos atributos principais do item */
function upgradeBonusPct(tier) { return (tier || 0) * 6; }

function itemUpgradeTier(p, key) {
  return (p.upgrades && p.upgrades[key]) || 0;
}

/* chave estavel: equipamento usa o slot, mochila usa o slug */
function upgradeKey(source, slot, slug) {
  return source === "equip" ? "equip:" + slot : "bag:" + slug;
}

function upgradeCost(p, slug, tier) {
  const it = GAMEDATA.items[slug];
  const base = Math.max(40, Math.floor((it && it.sell ? it.sell : 100) * 0.35));
  const next = (tier || 0) + 1;
  return {
    gold: Math.floor(base * Math.pow(1.65, next - 1)),
    dust: next,                                   // 1 Dust no +1, 2 no +2...
    chance: next <= 3 ? 100 : Math.max(35, 100 - (next - 3) * 11),
  };
}

/* Aplica os bonus de upgrade sobre os atributos de um item */
function upgradedStats(p, key, slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return null;
  const tier = itemUpgradeTier(p, key);
  if (!tier) return it;
  const mul = 1 + upgradeBonusPct(tier) / 100;
  const out = Object.assign({}, it);
  for (const f of ["atk", "def", "arm", "mdmg"]) {
    if (out[f]) out[f] = Math.round(out[f] * mul);
  }
  out.tier = tier;
  return out;
}

function canUpgrade(p, key, slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return { ok: false, msg: "Item inválido." };
  if (!it.s || UPGRADE_SLOTS.indexOf(it.s) === -1)
    return { ok: false, msg: "Este tipo de item não pode ser melhorado." };
  const tier = itemUpgradeTier(p, key);
  if (tier >= UPGRADE_MAX_TIER)
    return { ok: false, msg: `Já está no nível máximo (+${UPGRADE_MAX_TIER}).` };
  const cost = upgradeCost(p, slug, tier);
  if (p.gold < cost.gold)
    return { ok: false, msg: `Faltam ${fmtFull(cost.gold - p.gold)} gp.`, cost: cost };
  const dust = p.dust || 0;
  if (dust < cost.dust)
    return { ok: false, msg: `Precisa de ${cost.dust}x Dust (Forja) (tem ${dust}).`, cost: cost };
  return { ok: true, msg: "", cost: cost };
}

function applyUpgrade(p, key, slug) {
  const check = canUpgrade(p, key, slug);
  if (!check.ok) return check;
  const cost = check.cost;
  p.gold -= cost.gold;
  p.dust = Math.max(0, (p.dust || 0) - cost.dust);
  p.upgrades = p.upgrades || {};

  const roll = Math.random() * 100;
  if (roll > cost.chance) {
    // falha: perde gold e material, o item continua intacto
    return { ok: true, success: false, cost: cost,
             msg: `A forja falhou! O ${itemName(slug)} sobreviveu, mas o material foi perdido.` };
  }
  const tier = itemUpgradeTier(p, key) + 1;
  p.upgrades[key] = tier;
  return { ok: true, success: true, tier: tier, cost: cost,
           msg: `${itemName(slug)} melhorado para +${tier}!` };
}

/* ------------------------------------------------------------ academia safezone */
/* ------------------------------------------------------- exercise dummies
 * Treino no formato do Canary (exercise_training_weapons.lua):
 *
 *   melee/dist/shield -> addSkillTries(skill, 7 * rate)
 *   magic             -> addManaSpent(600 * rate)
 *   intervalo         -> baseAttackSpeed / rateExerciseTrainingSpeed
 *
 * onde `rate` e a taxa do dummy dividida por 100. Aqui nao exigimos a
 * exercise weapon: o personagem treina com o que ja tem equipado, mas os
 * contadores seguem exatamente a formula do servidor.
 */
const EXERCISE_TRIES = 7;          // tries por golpe (7 * rate)
const EXERCISE_MANA = 600;         // mana spent por golpe magico (600 * rate)
const RATE_EXERCISE_SPEED = 1.0;   // config.lua: rateExerciseTrainingSpeed

/* dummies do items.xml do Canary: id -> rate */
const EXERCISE_DUMMIES = {
  "exercise": { name: "Exercise Dummy", rate: 100, price: 0 },
  "ferumbras": { name: "Ferumbras Exercise Dummy", rate: 110, price: 25000 },
  "demon": { name: "Demon Exercise Dummy", rate: 110, price: 25000 },
  "monk": { name: "Monk Exercise Dummy", rate: 110, price: 25000 },
};

function dummyRate(p) {
  const d = EXERCISE_DUMMIES[(p.config && p.config.dummy) || "exercise"]
            || EXERCISE_DUMMIES.exercise;
  return d.rate / 100;
}

/* Intervalo entre golpes, como no servidor: baseAttackSpeed / rate */
function exerciseInterval(p) {
  const base = (VOCATIONS[p.voc] && VOCATIONS[p.voc].attackSpeed) || 2000;
  return Math.max(200, base / RATE_EXERCISE_SPEED);
}

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
  // A skill treinada segue a ARMA equipada, como as exercise weapons do
  // Canary (cada arma treina a sua skill). Sem arma, treina punho — que
  // e justamente a skill principal do Monk.
  const sk = weaponSkill(p);
  if (sk === "magic") return "magic";
  // vocacoes magicas treinam ML mesmo sem rod/wand equipada
  if ((p.voc === "druid" || p.voc === "sorcerer") && sk === "fist")
    return "magic";
  if (["sword", "axe", "club", "dist", "fist"].indexOf(sk) !== -1) return sk;
  return "fist";
}

function academyStatus(p) {
  // No Canary o treino exige a exercise weapon. Aqui a exigencia foi
  // removida: o personagem treina com o equipamento que ja tem, e a
  // skill treinada segue a arma (ou o punho, se estiver desarmado).
  const skill = academySkillFor(p) || "fist";
  return { ok: true, skill: skill,
           msg: "Treinando " + (SKILL_NAMES[skill] || skill) };
}

function newAcademyTraining(p, mode, weapon, huntMap) {
  const st = academyStatus(p);
  // modo "dummy": treina a skill da exercise weapon escolhida e consome
  // 1 carga por golpe; modo "online" (padrão): treina com o equipamento.
  let skill = st.skill;
  if (mode === "dummy" && weapon && EXERCISE_WEAPONS && EXERCISE_WEAPONS[weapon]) {
    skill = EXERCISE_WEAPONS[weapon].skill;
  }
  // Mapa .otbm da sala de exercise weapons (opcional): player spawna no
  // marcador do mapa e o dummy fica na célula `mob` (onde o editor marcou).
  let playerPos = null, dummyPos = null;
  if (huntMap) {
    if (huntMap.spawn) {
      playerPos = cellCenter(huntMap.spawn);
    } else {
      // fallback: procura o marcador "S" no grid
      for (let y = 0; y < huntMap.rows.length && !playerPos; y++)
        for (let x = 0; x < huntMap.rows[y].length && !playerPos; x++)
          if (huntMap.rows[y][x] === "S") playerPos = cellCenter({ x, y });
    }
    if (huntMap.mob && huntMap.mob.length) {
      dummyPos = cellCenter(huntMap.mob[0]);
    }
  }
  return {
    startedAt: Date.now(), time: 0, hitCd: 500, hits: 0,
    // marca o contexto como treino: consumeAmmoCharge e o gasto de supply
    // olham essa flag para nao cobrar arrows/bolts/runas no dummy
    training: true,
    mode: mode || "online",
    weapon: weapon || null,
    huntMap: huntMap || null,
    playerPos: playerPos,
    dummyPos: dummyPos,
    proj: null,           // arma voando: { t, dur, from, to, weapon }
    projHitFx: false,
    lungeT: 0,            // animação do golpe (ms restantes)
    skill: skill, lastMsg: 0, hasteUntil: 0, lightUntil: 0,
    stats: { hits: 0, damage: 0, skillUps: 0, shieldUps: 0, manaSpent: 0,
             supplyUsed: {}, supplyBought: {}, supplyCost: 0 },
    events: [],
  };
}

function academyAttackDelay(t, p) {
  // baseAttackSpeed / rateExerciseTrainingSpeed, como no servidor
  const base = p ? exerciseInterval(p) : 2000;
  return t.hasteUntil > Date.now() ? base * 0.75 : base;
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
    // munição é apenas contagem: não cria item na mochila
    addAmmo(p, r.slug, r.amount);
    if (!p.equip.ammo || p.equip.ammo.item === r.slug) setActiveAmmo(p, r.slug);
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

/* Conjure em loop: enquanto o auto-conjure estiver ligado e houver mana,
 * o personagem refaz a receita escolhida automaticamente. */
function academyAutoConjureTick(t, p, dt) {
  const id = p.config && p.config.autoConjure;
  if (!id) return;
  const r = ACADEMY_CONJURES[id];
  if (!r) { p.config.autoConjure = null; return; }

  t.conjureCd = (t.conjureCd || 0) - dt;
  if (t.conjureCd > 0) return;
  t.conjureCd = 1000;                       // 1 conjure por segundo

  const check = academyConjureCheck(p, r);
  if (!check.ok) {
    // sem mana é só esperar; qualquer outro impedimento desliga o loop
    if (p.mp < r.mana) return;
    p.config.autoConjure = null;
    t.events.push({ type: "msg", msg: `Auto-conjure parado: ${check.msg}` });
    return;
  }
  const res = castAcademyConjure(p, id);
  if (res.ok) {
    t.stats.conjures = (t.stats.conjures || 0) + 1;
    t.events.push({ type: "conjure", msg: res.msg, mlUp: res.mlUp });
  }
}

function academyTrainingTick(t, p, dt, now) {
  t.time += dt;
  academyAutoConjureTick(t, p, dt);
  t.hitCd -= dt;
  if (t.hitCd > 0) return;

  const st = academyStatus(p);
  // no modo dummy a skill vem da exercise weapon (não do equipamento)
  if (t.mode === "dummy" && t.weapon && EXERCISE_WEAPONS && EXERCISE_WEAPONS[t.weapon]) {
    t.skill = EXERCISE_WEAPONS[t.weapon].skill;
  } else {
    t.skill = st.skill;
  }
  if (!st.ok && t.mode !== "dummy") {
    if (now - t.lastMsg > 3000) {
      t.events.push({ type: "msg", msg: st.msg });
      t.lastMsg = now;
    }
    t.hitCd = 1000;
    return;
  }

  // dummy: consome 1 carga por golpe; sem cargas o treino para
  if (t.mode === "dummy" && t.weapon) {
    ensureTraining(p);
    if ((p.exercise[t.weapon] || 0) <= 0) {
      const w = EXERCISE_WEAPONS[t.weapon];
      t.events.push({ type: "msg", msg: `${w ? w.name : "Exercise weapon"} sem cargas — treino encerrado.` });
      if (typeof stopAcademy === "function") stopAcademy(false);
      return;
    }
    p.exercise[t.weapon] -= 1;
    if (p.exercise[t.weapon] < 0) p.exercise[t.weapon] = 0;
  }

  let skillUp = false;
  let dmg = 0;
  const rate = dummyRate(p);
  if (t.skill === "magic") {
    // magia: o servidor conta mana spent, sem exigir mana do jogador
    const ganho = Math.floor(EXERCISE_MANA * rate);
    t.stats.manaSpent += ganho;
    skillUp = addManaSpent(p, ganho);
  } else if (t.skill === "shield") {
    // exercise shield: só shielding (o próprio golpe de escudo)
    skillUp = addSkillTries(p, "shield", EXERCISE_TRIES * rate);
  } else if (t.skill === "dist") {
    // sem exigir municao: o treino aqui nao consome arrows
    const d = playerDamage(p);
    dmg = Math.max(1, Math.floor((d.min + Math.random() * (d.max - d.min)) * 0.85));
    skillUp = addSkillTries(p, "dist", EXERCISE_TRIES * rate);
  } else {
    if (p.voc === "knight" || p.voc === "monk") {
      const d = playerDamage(p);
      dmg = Math.max(1, Math.floor((d.min + Math.random() * (d.max - d.min)) * 0.9));
    }
    skillUp = addSkillTries(p, t.skill, EXERCISE_TRIES * rate);
  }

  const shieldUp = t.skill === "shield" ? false
    : addSkillTries(p, "shield", EXERCISE_TRIES * rate);
  t.hits++;
  t.stats.hits++;
  t.stats.damage += dmg;
  if (skillUp) t.stats.skillUps++;
  if (shieldUp) t.stats.shieldUps++;
  t.events.push({ type: "hit", skill: t.skill, dmg: dmg, mode: t.mode,
                  weapon: t.weapon,
                  skillUp: skillUp, shieldUp: shieldUp });
  // Animação do golpe no modo dummy: a exercise weapon VOIA do player até
  // o dummy (como no client — a arma é arremessada a cada golpe). O
  // personagem fica parado; `proj` carrega a trajetória para o drawAcademy.
  if (t.mode === "dummy" && t.playerPos && t.dummyPos) {
    t.proj = {
      t: 0, dur: 300,
      from: { x: t.playerPos.x, y: t.playerPos.y },
      to: { x: t.dummyPos.x, y: t.dummyPos.y },
      weapon: t.weapon,
    };
    t.projHitFx = false;
  } else {
    t.lungeT = 180;
  }
  t.hitCd = academyAttackDelay(t, p);
}

/* ------------------------------------------------------------ acoes */

function bankDeposit(p, amount) {
  amount = Math.min(amount, p.gold);
  if (amount <= 0) return 0;
  spendGold(p, amount);
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
  spendGold(p, price);
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
  spendGold(p, price);
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
    spendGold(p, price);
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
  if (!hasBagSpace(p, slug)) return { ok: false, msg: "Mochila cheia." };
  spendGold(p, price);
  addItem(p, slug, 1);
  return { ok: true };
}
