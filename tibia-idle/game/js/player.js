/*
 * player.js — estado do personagem, equipamento, skills e progressao
 */
"use strict";

const SLOTS = ["helmet", "amulet", "backpack", "armor", "weapon", "shield",
               "legs", "boots", "ring", "ammo"];

const SKILL_NAMES = {
  fist: "Punho", sword: "Espada", axe: "Machado", club: "Clava",
  dist: "Distância", shield: "Escudo", magic: "Magic Level",
};

function newPlayer(name, voc, sex) {
  const p = {
    name: name || "Sem Nome",
    voc: voc || "none",
    sex: sex || "male",
    level: 1,
    exp: 0,
    hp: 150, mp: 0,
    skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 10, shield: 10 },
    skillTries: { fist: 0, sword: 0, axe: 0, club: 0, dist: 0, shield: 0 },
    ml: 0, manaSpent: 0,
    gold: 0,
    bank: 0,
    blessed: false,
    equip: { backpack: { item: "bag", count: 1 } }, // slot -> {item, count}
    bag: {},                // slug -> count
    bagSlots: 8,            // bag padrão: 8 slots/tipos de item
    lootPouch: {},          // loot de hunt para auto-seller
    lootConfig: { noCollect: [], noSell: [] },
    supplies: { "mana-fluid": 0 }, // slug -> count/carga selecionada
    hunt: null,             // id da hunt ativa
    stamina: 42 * 3600,     // segundos (42h cheio)
    deaths: 0,
    kills: {},              // slug -> total
    totalKills: 0,
    playtime: 0,
    lastSeen: Date.now(),
    created: Date.now(),
    // configuracao do auto-hunt
    config: {
      healAt: 90,           // % de vida para curar
      manaAt: 50,           // % de mana para usar mana fluids
      healSpell: "",        // magia de cura selecionada pelo Helper
      healSupply: "",       // runa/potion de cura selecionada pelo Helper
      manaSupply: "mana-fluid", // item de mana selecionado pelo Helper
      useRunes: true,
      autoRestock: false,   // legado: compras agora acontecem por carga, no uso
      manaTrain: null,      // receita ativa do treino online de mana
      attackMode: "chase",  // chase | stand | kiting
      kiteDistance: 3,       // SQMs de distância no modo kiting (1-5)
      shooterType: "auto",  // auto | spell | rune
      shooterSpell: "",
      shooterRune: "",
      autoSell: true,
      autoEquip: true,
      spellAttack: true,
      autoRetreat: true,    // recua em vez de morrer quando acabam os supplies
      barMode: "bars",      // bars | arcs
      lootFilter: "all",    // all | valuable | equip
      missionCollapsed: false,
    },
    missions: {},
    bosses: {},
    log: [],
    achievements: {},
  };
  const b = baseStats(p.voc, p.level);
  p.hp = b.hp; p.mp = b.mp;
  return p;
}

function maxStats(p) {
  const b = baseStats(p.voc, p.level);
  let bonusHp = 0, bonusMp = 0;
  for (const s of SLOTS) {
    const e = p.equip[s];
    if (!e) continue;
    const it = GAMEDATA.items[e.item];
    if (!it) continue;
    if (it.hp) bonusHp += it.hp;
    if (it.mp) bonusMp += it.mp;
  }
  return { hp: b.hp + bonusHp, mp: b.mp + bonusMp, cap: b.cap };
}

/* Soma dos atributos do equipamento */
function gearStats(p) {
  const g = { armor: 0, defense: 0, attack: 0, magicDamage: 0, mag: 0,
              prot: 0, hpreg: 0, mpreg: 0, speed: 0, weight: 0,
              melee: 0, sword: 0, axe: 0, club: 0, shield: 0, dist: 0 };
  for (const s of SLOTS) {
    const e = p.equip[s];
    if (!e) continue;
    const it = GAMEDATA.items[e.item];
    if (!it) continue;
    g.armor += it.arm || 0;
    g.defense += it.def || 0;
    g.attack += it.atk || 0;
    g.magicDamage += it.mdmg || 0;
    g.mag += it.mag || 0;
    g.prot += it.prot || 0;
    g.hpreg += it.hpreg || 0;
    g.mpreg += it.mpreg || 0;
    g.speed += it.spd || 0;
    g.weight += it.w || 0;
    g.melee += it.melee || 0;
    g.sword += it.sword || 0;
    g.axe += it.axe || 0;
    g.club += it.club || 0;
    g.shield += it.shield || 0;
  }
  return g;
}

/* Skill efetiva (base + bonus do equip) */
function effSkill(p, which) {
  const g = gearStats(p);
  let v = p.skills[which] || 10;
  if (which === "sword") v += g.sword + g.melee;
  else if (which === "axe") v += g.axe + g.melee;
  else if (which === "club") v += g.club + g.melee;
  else if (which === "shield") v += g.shield;
  else if (which === "dist") v += g.dist;
  return v;
}

function effMagic(p) {
  return p.ml + gearStats(p).mag;
}

/* Qual skill a arma equipada usa */
function weaponSkill(p) {
  const w = p.equip.weapon;
  if (!w) return "fist";
  const it = GAMEDATA.items[w.item];
  if (!it) return "fist";
  if (it.t === "sword") return "sword";
  if (it.t === "axe") return "axe";
  if (it.t === "club") return "club";
  if (it.t === "distance") return "dist";
  if (it.t === "magic") return "magic";
  return "fist";
}

/* Dano por golpe do jogador */
function playerDamage(p) {
  const w = p.equip.weapon;
  const it = w ? GAMEDATA.items[w.item] : null;
  const voc = VOCATIONS[p.voc];

  if (it && it.t === "magic") {
    const d = magicDamage(p.level, effMagic(p), it.mdmg || 10);
    return { min: d.min, max: d.max, element: "energy", type: "magic" };
  }
  if (it && it.t === "distance") {
    const ammo = p.equip.ammo ? GAMEDATA.items[p.equip.ammo.item] : null;
    const atk = (it.atk || 0) + (ammo ? (ammo.atk || 0) : 0);
    const d = distanceDamage(effSkill(p, "dist"), atk, 1.0);
    return { min: Math.floor(d.max * 0.2), max: d.max,
             element: "physical", type: "distance" };
  }
  const sk = weaponSkill(p);
  const atk = it ? (it.atk || 0) : 7;    // punho = attack 7
  const d = meleeDamage(effSkill(p, sk), atk, 1.0);
  return { min: Math.floor(d.max * 0.15), max: d.max,
           element: "physical", type: "melee" };
}

/* Defesa total do jogador */
function playerDefense(p) {
  const g = gearStats(p);
  return {
    armor: g.armor,
    defense: g.defense,
    shielding: effSkill(p, "shield"),
    protection: g.prot,
  };
}

/* --------------------------------------------------- progressao */

function addExp(p, amount) {
  p.exp += amount;
  let leveled = false;
  while (p.exp >= expForLevel(p.level + 1)) {
    p.level++;
    leveled = true;
  }
  if (leveled) {
    const b = maxStats(p);
    p.hp = b.hp; p.mp = b.mp;
  }
  return leveled;
}

/* Adiciona tentativas de skill; retorna true se subiu */
function addSkillTries(p, which, tries) {
  if (which === "magic") return false;
  const voc = SKILL_CONST[p.voc] || SKILL_CONST.none;
  const isShield = which === "shield";
  const isDist = which === "dist";
  const factor = isShield ? voc.shield : isDist ? voc.dist :
                 which === "fist" ? voc.fist : voc.melee;
  const base = isShield ? 100 : isDist ? 30 : which === "fist" ? 50 : 50;

  p.skillTries[which] = (p.skillTries[which] || 0) + tries;
  let up = false;
  let need = skillCost(p.skills[which], base, factor);
  while (p.skillTries[which] >= need) {
    p.skillTries[which] -= need;
    p.skills[which]++;
    up = true;
    need = skillCost(p.skills[which], base, factor);
  }
  return up;
}

/* Progresso % ate a proxima skill */
function skillProgress(p, which) {
  const voc = SKILL_CONST[p.voc] || SKILL_CONST.none;
  const isShield = which === "shield";
  const isDist = which === "dist";
  const factor = isShield ? voc.shield : isDist ? voc.dist :
                 which === "fist" ? voc.fist : voc.melee;
  const base = isShield ? 100 : isDist ? 30 : which === "fist" ? 50 : 50;
  const need = skillCost(p.skills[which], base, factor);
  return Math.min(100, ((p.skillTries[which] || 0) / need) * 100);
}

/* Gasto de mana sobe magic level */
function addManaSpent(p, mana) {
  const voc = VOCATIONS[p.voc];
  p.manaSpent += mana;
  let up = false;
  let need = mlCost(p.ml, voc.magicFactor);
  while (p.manaSpent >= need) {
    p.manaSpent -= need;
    p.ml++;
    up = true;
    need = mlCost(p.ml, voc.magicFactor);
  }
  return up;
}

function mlProgress(p) {
  const voc = VOCATIONS[p.voc];
  return Math.min(100, (p.manaSpent / mlCost(p.ml, voc.magicFactor)) * 100);
}

function spendGold(p, amount) {
  amount = Math.max(0, Math.floor(amount || 0));
  p.gold = Math.max(0, Math.floor(p.gold || 0));
  if (amount <= 0) return true;
  if (p.gold < amount) return false;
  p.gold = Math.max(0, p.gold - amount);
  return true;
}

function expProgress(p) {
  const cur = expForLevel(p.level);
  const next = expForLevel(p.level + 1);
  return Math.max(0, Math.min(100, ((p.exp - cur) / (next - cur)) * 100));
}

/* --------------------------------------------------- inventario */

function bagSlots(p) {
  return p.bagSlots || 8;
}

function bagUsedSlots(p) {
  return Object.keys(p.bag || {}).filter((slug) => (p.bag[slug] || 0) > 0).length;
}

function hasBagSpace(p, slug) {
  if (!p.bag) p.bag = {};
  return !!p.bag[slug] || bagUsedSlots(p) < bagSlots(p);
}

function addItem(p, slug, count) {
  count = count || 1;
  if (!p.bag) p.bag = {};
  if (!hasBagSpace(p, slug)) return false;
  p.bag[slug] = (p.bag[slug] || 0) + count;
  return true;
}

function removeItem(p, slug, count) {
  count = count || 1;
  if (!p.bag[slug]) return false;
  p.bag[slug] -= count;
  if (p.bag[slug] <= 0) delete p.bag[slug];
  return true;
}

function normalizeLootRule(text) {
  return String(text || "").trim().toLowerCase();
}

function itemDisplayName(slug) {
  const it = GAMEDATA.items[slug];
  return it ? it.n : slug;
}

function lootRuleMatches(slug, rule) {
  rule = normalizeLootRule(rule);
  if (!rule) return false;
  const name = normalizeLootRule(itemDisplayName(slug));
  const id = normalizeLootRule(slug);
  return id === rule || name === rule || id.indexOf(rule) !== -1 || name.indexOf(rule) !== -1;
}

function lootConfigList(p, key) {
  p.lootConfig = p.lootConfig || { noCollect: [], noSell: [] };
  p.lootConfig.noCollect = p.lootConfig.noCollect || [];
  p.lootConfig.noSell = p.lootConfig.noSell || [];
  return p.lootConfig[key] || [];
}

function isNoCollect(p, slug) {
  return lootConfigList(p, "noCollect").some((r) => lootRuleMatches(slug, r));
}

function isNoSell(p, slug) {
  return lootConfigList(p, "noSell").some((r) => lootRuleMatches(slug, r));
}

function addLootRule(p, key, text) {
  const rule = normalizeLootRule(text);
  if (!rule) return false;
  const list = lootConfigList(p, key);
  if (!list.includes(rule)) list.push(rule);
  return true;
}

function removeLootRule(p, key, index) {
  const list = lootConfigList(p, key);
  list.splice(index, 1);
}

function shouldGoLootPouch(slug) {
  const it = GAMEDATA.items[slug];
  if (!it || slug === "gold-coin" || SUPPLIES[slug]) return false;
  return !it.s;
}

function addLootPouch(p, slug, count) {
  count = count || 1;
  p.lootPouch = p.lootPouch || {};
  p.lootPouch[slug] = (p.lootPouch[slug] || 0) + count;
  return true;
}

function removeLootPouch(p, slug, count) {
  count = count || 1;
  if (!p.lootPouch || !p.lootPouch[slug]) return false;
  p.lootPouch[slug] -= count;
  if (p.lootPouch[slug] <= 0) delete p.lootPouch[slug];
  return true;
}

/* Score de um item para comparacao no auto-equip */
function itemScore(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return -1;
  const voc = p.voc;
  const isMagic = voc === "druid" || voc === "sorcerer";
  const isDist = voc === "paladin";
  let s = 0;
  s += (it.arm || 0) * 10;
  s += (it.def || 0) * (isMagic ? 3 : 6);
  s += (it.prot || 0) * 1.5;
  s += (it.hpreg || 0) * 12;
  s += (it.mpreg || 0) * (isMagic ? 15 : 6);
  s += (it.spd || 0) * 1.5;

  if (it.s === "weapon") {
    if (isMagic) {
      s += (it.mdmg || 0) * 6 + (it.mag || 0) * 60;
      if (it.t !== "magic") s -= 40;
    } else if (isDist) {
      s += it.t === "distance" ? (it.atk || 0) * 10 : (it.atk || 0) * 3;
    } else {
      const sk = it.t === "sword" ? "sword" : it.t === "axe" ? "axe" :
                 it.t === "club" ? "club" : null;
      if (sk) s += (it.atk || 0) * 10 + (it.def || 0) * 4;
      else s += (it.atk || 0) * 2;
      if (it.th) s += (it.atk || 0) * 2;   // 2H compensa perder escudo
    }
  }
  s += (it.mag || 0) * (isMagic ? 80 : 15);
  return s;
}

/* Auto-equip: veste o melhor item disponivel de cada slot */
function autoEquip(p) {
  const changes = [];
  for (const slot of SLOTS) {
    if (slot === "backpack" || slot === "ammo") continue;
    let best = p.equip[slot] ? p.equip[slot].item : null;
    let bestScore = best ? itemScore(p, best) : -1;
    for (const slug in p.bag) {
      const it = GAMEDATA.items[slug];
      if (!it || it.s !== slot) continue;
      if (it.lvl && p.level < it.lvl) continue;
      if (it.vocs && it.vocs.indexOf(p.voc) === -1) continue;
      const sc = itemScore(p, slug);
      if (sc > bestScore) { bestScore = sc; best = slug; }
    }
    if (best && (!p.equip[slot] || p.equip[slot].item !== best)) {
      // devolve o antigo pra bag
      if (p.equip[slot]) addItem(p, p.equip[slot].item, 1);
      removeItem(p, best, 1);
      p.equip[slot] = { item: best, count: 1 };
      changes.push({ slot: slot, item: best });
    }
  }
  // arma de duas maos remove o escudo
  const w = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  if (w && w.th && p.equip.shield) {
    addItem(p, p.equip.shield.item, 1);
    delete p.equip.shield;
  }
  // municao para paladin: a mochila guarda as cargas; o slot ammo guarda
  // qual municao esta selecionada para o auto-buy/consumo em combate.
  if (w && w.t === "distance") {
    let bestAmmo = null, bestAtk = -1;
    for (const slug in p.bag) {
      const it = GAMEDATA.items[slug];
      if (!it || it.s !== "ammo" || (p.bag[slug] || 0) <= 0) continue;
      if ((it.atk || 0) > bestAtk) { bestAtk = it.atk || 0; bestAmmo = slug; }
    }
    if (bestAmmo && (!p.equip.ammo || p.equip.ammo.item !== bestAmmo)) {
      p.equip.ammo = { item: bestAmmo, count: p.bag[bestAmmo] };
    } else if (p.equip.ammo) {
      p.equip.ammo.count = p.bag[p.equip.ammo.item] || 0;
    }
  }
  return changes;
}

/* Vende todo o loot marcado como vendavel */
function autoSell(p) {
  let total = 0;
  const sold = [];

  const sellFrom = (container, slug, source) => {
    const it = GAMEDATA.items[slug];
    if (!it || !container[slug]) return;
    if (isNoSell(p, slug)) return;
    if (slug === "gold-coin") {
      p.gold += container[slug];
      total += container[slug];
      delete container[slug];
      return;
    }
    // Ammo/equipamentos não são vendidos automaticamente; boss loot pode ser arrastado para a bag.
    if (it.s === "ammo" || (source === "lootPouch" && it.s)) return;
    // nao vende equipamento util da mochila principal
    if (source === "bag" && it.s) {
      const equipped = p.equip[it.s];
      if (!equipped || itemScore(p, slug) > itemScore(p, equipped.item)) return;
    }
    const value = (it.sell || 0) * container[slug];
    if (value <= 0) return;
    total += value;
    p.gold += value;
    sold.push({ item: slug, count: container[slug], gold: value, source: source });
    delete container[slug];
  };

  for (const slug in Object.assign({}, p.lootPouch || {}))
    sellFrom(p.lootPouch, slug, "lootPouch");
  for (const slug in Object.assign({}, p.bag))
    sellFrom(p.bag, slug, "bag");

  return { gold: total, items: sold };
}

/* Peso total carregado */
function carriedWeight(p) {
  let w = 0;
  for (const s of SLOTS) {
    const e = p.equip[s];
    if (e && GAMEDATA.items[e.item]) w += GAMEDATA.items[e.item].w || 0;
  }
  for (const slug in p.bag) {
    const it = GAMEDATA.items[slug];
    if (it) w += (it.w || 0.1) * p.bag[slug];
  }
  return w;
}
