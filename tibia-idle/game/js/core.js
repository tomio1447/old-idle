/*
 * core.js — regras do Tibia Idle (formulas de XP, vocacao, combate e loot)
 * Baseado nas formulas reais do Tibia 7.4.
 */
"use strict";

const VOCATIONS = {
  none: {
    name: "Sem vocação", hpGain: 5, mpGain: 5, capGain: 10,
    weapon: "melee", magicFactor: 3.0, mpRegen: 6, hpRegen: 6,
    desc: "Rookgaard. Escolha uma vocação ao chegar no nível 8.",
  },
  knight: {
    name: "Knight", hpGain: 15, mpGain: 5, capGain: 25,
    weapon: "melee", magicFactor: 3.0, mpRegen: 6, hpRegen: 3,
    skillFactor: 1.1, defFactor: 1.0, atkFactor: 1.0,
    desc: "Tanque puro. Muita vida, skills de melee sobem rápido.",
  },
  paladin: {
    name: "Paladin", hpGain: 10, mpGain: 15, capGain: 20,
    weapon: "distance", magicFactor: 1.4, mpRegen: 4, hpRegen: 4,
    skillFactor: 1.2, defFactor: 1.1, atkFactor: 1.0,
    desc: "Distância. Equilíbrio entre dano, vida e mana.",
  },
  druid: {
    name: "Druid", hpGain: 5, mpGain: 30, capGain: 10,
    weapon: "magic", magicFactor: 1.1, mpRegen: 3, hpRegen: 6,
    skillFactor: 1.8, defFactor: 1.0, atkFactor: 1.0,
    desc: "Magia de gelo/terra e cura forte. Muita mana.",
  },
  sorcerer: {
    name: "Sorcerer", hpGain: 5, mpGain: 30, capGain: 10,
    weapon: "magic", magicFactor: 1.1, mpRegen: 3, hpRegen: 6,
    skillFactor: 1.8, defFactor: 1.0, atkFactor: 1.0,
    desc: "Magia de fogo/energia. O maior dano mágico do jogo.",
  },
  // Monk (15.x): luta de punho, ganhos equilibrados e as Virtudes
  monk: {
    name: "Monk", hpGain: 10, mpGain: 10, capGain: 25,
    weapon: "fist", magicFactor: 1.3, mpRegen: 6, hpRegen: 6,
    skillFactor: 1.1, defFactor: 1.05, atkFactor: 1.0,
    desc: "Punhos e harmonia. Combos de golpes e as três Virtudes.",
  },
};

/* Multiplicadores de skill por vocacao, direto do vocations.xml do Canary.
 * Quanto MENOR o numero, mais rapido a skill sobe. */
const SKILL_MULTIPLIER = {
  sorcerer: { fist: 1.5, club: 2.0, sword: 2.0, axe: 2.0, dist: 2.0, shield: 1.5, magic: 1.1 },
  druid:    { fist: 1.5, club: 1.8, sword: 1.8, axe: 1.8, dist: 1.8, shield: 1.5, magic: 1.1 },
  paladin:  { fist: 1.2, club: 1.2, sword: 1.2, axe: 1.2, dist: 1.1, shield: 1.1, magic: 1.1 },
  knight:   { fist: 1.1, club: 1.1, sword: 1.1, axe: 1.1, dist: 1.4, shield: 1.1, magic: 1.1 },
  monk:     { fist: 1.1, club: 1.5, sword: 1.5, axe: 1.5, dist: 2.0, shield: 1.2, magic: 1.1 },
  none:     { fist: 1.5, club: 2.0, sword: 2.0, axe: 2.0, dist: 2.0, shield: 1.5, magic: 1.1 },
};

function skillMultiplier(voc, skill) {
  const t = SKILL_MULTIPLIER[voc] || SKILL_MULTIPLIER.none;
  return t[skill] || 1.5;
}

/* Constantes de skill do Tibia real: [const, factor] por vocacao */
const SKILL_CONST = {
  knight:   { melee: 1.1, dist: 1.4, shield: 1.1, magic: 3.0, fist: 1.1 },
  paladin:  { melee: 1.2, dist: 1.1, shield: 1.1, magic: 1.4, fist: 1.2 },
  druid:    { melee: 1.8, dist: 1.8, shield: 1.5, magic: 1.1, fist: 1.5 },
  sorcerer: { melee: 2.0, dist: 2.0, shield: 1.5, magic: 1.1, fist: 1.5 },
  monk:     { melee: 1.5, dist: 2.0, shield: 1.2, magic: 1.3, fist: 1.1 },
  none:     { melee: 1.5, dist: 2.0, shield: 1.5, magic: 3.0, fist: 1.5 },
};

/* XP total necessaria para atingir um nivel (formula oficial do Tibia) */
function expForLevel(lvl) {
  return Math.floor((50 / 3) * (lvl * lvl * lvl - 6 * lvl * lvl + 17 * lvl - 12));
}

/* Stages de experiencia (estilo servidor Baiak): multiplica a XP por nivel.
 * Alto no comeco para tirar o char de Rookgaard rapido, suave depois. */
const EXP_STAGES = [
  { max: 8, mul: 6 },
  { max: 20, mul: 4 },
  { max: 50, mul: 3 },
  { max: 100, mul: 2.2 },
  { max: 200, mul: 1.7 },
  { max: 350, mul: 1.4 },
  { max: Infinity, mul: 1.2 },
];

function expStage(level) {
  for (const s of EXP_STAGES) if (level <= s.max) return s.mul;
  return 25;
}

/* Multiplicador de ouro conforme o nivel da area (economia escalada).
 * Precisa acompanhar o custo dos supplies, que tambem escala com o nivel. */
function goldStage(huntLevel) {
  return 1 + huntLevel * 0.55;
}

/* Pontos de skill necessarios para subir de um nivel de skill */
function skillCost(level, base, factor) {
  return Math.floor(base * Math.pow(factor, level - 10));
}

/* Pontos totais para chegar num nivel de skill a partir do minimo */
function skillTotalCost(target, minLevel, base, factor) {
  let sum = 0;
  for (let i = minLevel; i < target; i++) sum += skillCost(i, base, factor);
  return sum;
}

/* Mana necessaria para subir 1 magic level */
function mlCost(level, factor) {
  return Math.floor(1600 * Math.pow(factor, level));
}

/* --------------------------------------------------------- combate */

/* Dano de arma melee do Tibia: skill e attack do item */
function meleeDamage(skill, attack, factor) {
  const max = Math.floor((skill + 4) * attack * 0.085 * factor);
  return { min: 0, max: Math.max(1, max) };
}

/* Dano de arma de distancia */
function distanceDamage(skill, attack, factor) {
  const max = Math.floor((skill + 4) * attack * 0.085 * factor);
  return { min: 0, max: Math.max(1, max) };
}

/* Dano magico (strike) — escala com magic level e nivel */
function magicDamage(level, ml, base) {
  const max = Math.floor((level / 5 + ml * 2.0) * (base / 20) + base / 2);
  return { min: Math.floor(max * 0.55), max: Math.max(1, max) };
}

/* Reducao de dano por armadura + defesa (aproximacao do Tibia) */
function mitigate(raw, armor, defense, shielding) {
  // armadura reduz um valor plano aleatorio entre armor/2 e armor
  const armorRed = armor * 0.5 + Math.random() * armor * 0.5;
  // bloqueio por defesa+shielding: chance de reduzir bastante
  const blockPower = defense * (1 + shielding / 100);
  let dmg = raw - armorRed;
  if (Math.random() * 100 < Math.min(65, blockPower * 0.6)) {
    dmg -= blockPower * (0.4 + Math.random() * 0.6);
  }
  return Math.max(0, dmg);
}

/* Chance de acerto de arma de distancia por skill */
function hitChance(skill) {
  return Math.min(0.95, 0.35 + skill * 0.006);
}

/* Regeneracao de HP/MP por tick (segundos entre pontos) */
function regenRate(voc, hasLifeRing) {
  const v = VOCATIONS[voc];
  return {
    hp: hasLifeRing ? Math.max(2, v.hpRegen - 3) : v.hpRegen,
    mp: hasLifeRing ? Math.max(1, v.mpRegen - 2) : v.mpRegen,
  };
}

/* Stats maximos derivados do nivel */
/* Vida e mana do nivel 1, antes dos ganhos por nivel.
 * O personagem nascia com 150/0, o que deixava qualquer vocacao sem lancar
 * uma unica magia no comeco — inclusive o Monk, que depende de mana para
 * subir magic level. */
const START_HP = 185;
const START_MP = 5;

function baseStats(voc, level) {
  const v = VOCATIONS[voc];
  // rookgaard: 5/5/10 por nivel ate o 8
  const rookLvls = Math.min(level - 1, 7);
  const vocLvls = Math.max(0, level - 1 - rookLvls);
  return {
    hp: START_HP + rookLvls * 5 + vocLvls * v.hpGain,
    mp: START_MP + rookLvls * 5 + vocLvls * v.mpGain,
    cap: 400 + rookLvls * 10 + vocLvls * v.capGain,
  };
}

/* Velocidade de ataque em ms segundo a arma */
const ATTACK_SPEED = { melee: 2000, distance: 2000, magic: 2000 };

/* Elementos e seus icones/cores */
const ELEMENTS = {
  physical: { name: "Físico", color: "#d8d8d8", fx: "draw-blood" },
  fire:     { name: "Fogo",   color: "#ff8a3c", fx: "hit-by-fire" },
  ice:      { name: "Gelo",   color: "#7ec8ff", fx: "ice-attack" },
  energy:   { name: "Energia",color: "#c07cff", fx: "energy-damage" },
  earth:    { name: "Terra",  color: "#8ac83c", fx: "hit-by-poison" },
  death:    { name: "Morte",  color: "#8a5aa8", fx: "mort-area" },
  holy:     { name: "Sagrado",color: "#ffe680", fx: "holy-damage" },
};

/* SPELLS — todas as magias do 15.x, montadas a partir de SPELLDATA.
 *
 * SPELLDATA vem de tools/import_otc_spells.py e cruza duas fontes oficiais:
 * o spells.lua do otclient (lista canonica + indice do icone) e os scripts
 * Lua do canary (formulas de dano/cura executadas de verdade). Antes essa
 * tabela era escrita a mao com valores estimados; agora ela e derivada,
 * entao adicionar magia no servidor e so rodar o importador de novo.
 *
 * `power` continua existindo porque o codigo antigo ordena magias por ele;
 * agora e derivado da formula real em vez de chutado. */
const SPELL_LABEL = {
  attack: "Ataque", heal: "Cura", cure: "Cura de condição",
  support: "Suporte", conjure: "Conjuração", summon: "Invocação",
};

const SPELLS = {};

(function montarSpells() {
  const dados = (typeof window !== "undefined" && window.SPELLDATA)
    ? window.SPELLDATA : {};
  for (const id in dados) {
    const d = dados[id];
    const s = {
      name: d.name, words: d.words, type: d.type,
      mana: d.mana || 0, cd: Math.max(1000, d.cd || 2000), lvl: d.lvl || 1,
      ml: d.ml || 0, soul: d.soul || 0,
      vocs: d.vocs || [], icon: d.icon,
      element: d.element, area: !!d.area, alvos: d.alvos,
      range: d.range, needTarget: !!d.needTarget, needWeapon: !!d.needWeapon,
      premium: !!d.premium, group: d.group, chain: d.chain,
      cond: d.cond, dispel: d.dispel, regen: d.regen, monk: d.monk,
      f: d.f, sid: d.sid,
      // grupos de cooldown: {idDoGrupo: duracaoMs}. Lancar a magia trava o
      // grupo inteiro, e nao so ela — igual ao servidor.
      grupos: d.grupos || {}, gcd: d.gcd || 1000,
      label: SPELL_LABEL[d.type] || "Magia",
    };
    // power e uma nota relativa usada so para ordenar/escolher a "melhor"
    // magia no auto-cast; deriva do custo de mana quando nao ha formula
    s.power = powerFromFormula(d);
    SPELLS[id] = s;
  }
})();

/* Ajustes de balanceamento aplicados POR CIMA dos dados oficiais.
 *
 * SPELLDATA e gerado do otclient/canary, entao qualquer edicao manual la
 * seria perdida ao reimportar. As decisoes de design do jogo (que e idle e
 * progride mais rapido que o Tibia) moram aqui e sobrevivem a reimportacao.
 * Cada entrada precisa dizer POR QUE diverge do servidor. */
/* Custo de mana das magias de nivel 1.
 * Com 5 de mana inicial, o custo original (3 a 18) travava o personagem
 * novo: ele nao conseguia lancar nem a primeira magia da vocacao. */
const SPELL_MANA_NIVEL1 = 2;

const SPELL_OVERRIDES = {
  // o jogador pediu Exura Gran cedo no paladin: no idle o char passa pouco
  // tempo entre 14 e 20 e ficaria sem cura media nesse intervalo
  "exura-gran": { lvl: 14 },
};

(function aplicarOverrides() {
  for (const id in SPELL_OVERRIDES) {
    if (!SPELLS[id]) continue;
    Object.assign(SPELLS[id], SPELL_OVERRIDES[id]);
  }
  // toda magia de nivel 1 cabe na mana inicial do personagem
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if ((s.lvl || 1) <= 1 && s.mana > SPELL_MANA_NIVEL1) {
      s.mana = SPELL_MANA_NIVEL1;
    }
  }
})();

/* Nota relativa da magia: avalia a formula num personagem de referencia
 * (nivel 100, ml 50, skill 90, attack 40) para poder comparar magias
 * diferentes numa escala unica. */
function powerFromFormula(d) {
  const f = d.f;
  if (!f) return Math.max(0.5, Math.min(6, (d.mana || 20) / 60));
  let v;
  if (f.modo === "magic") {
    v = (f.lvlMax || 0) * 100 + (f.mlMax || 0) * 50 + (f.flatMax || 0);
  } else {
    v = (f.saMax || 0) * 90 * 40 + (f.skMax || 0) * 90 +
        (f.atMax || 0) * 40 + (f.lvlMax || 0) * 100 + (f.flatMax || 0);
  }
  if (d.alvos) v *= 1 + Math.min(3, d.alvos / 8);   // area vale mais
  return Math.round((v / 100) * 100) / 100;
}

/* SUPPLIES agora e montado em js/supplies.js a partir dos dados reais do
 * Canary (potions.lua e scripts/runes). A tabela manual que ficava aqui
 * tinha cura estimada e um `scale` inventado; agora cada potion traz a
 * faixa exata, o nivel minimo e as vocacoes que podem beber. */

/* AMMO_DEFS e QUIVER_DEFS agora sao derivados de QUIVERDATA, gerado por
 * tools/import_quivers.py a partir do items.xml do Canary. As tabelas
 * escritas a mao que ficavam aqui tinham quivers que nao existem no
 * servidor (basic, modified, ornate, sanguine, soulpiercer) e ignoravam
 * perfect shot, resistencia elemental e o containersize real. */
const AMMO_DEFS = {};
const QUIVER_DEFS = {};

(function montarQuivers() {
  const d = (typeof window !== "undefined" && window.QUIVERDATA)
    ? window.QUIVERDATA : null;
  if (!d) return;
  for (const slug in d.ammo) {
    const a = d.ammo[slug];
    AMMO_DEFS[slug] = {
      n: a.nome, kind: a.tipo, atk: a.atk, lvl: a.lvl || 1, id: a.itemId,
      shotCost: a.custo, sprite: slug, el: a.el,
      area: a.area, noMiss: a.noMiss ? 1 : undefined,
      poison: a.poison, desc: a.desc,
    };
  }
  for (const slug in d.quivers) {
    const q = d.quivers[slug];
    QUIVER_DEFS[slug] = {
      n: q.nome, cap: q.slots, lvl: q.lvl || 1, id: q.itemId,
      // `drop: true` = nao esta a venda, so cai de boss. Sem preco de
      // compra, a loja esconde e o painel mostra a origem.
      drop: !!q.drop,
      buy: q.drop ? 0 : (q.preco || 400),
      sell: q.drop ? 0 : Math.floor((q.preco || 400) / 8),
      // perfect shot: dano extra numa distancia EXATA, como no servidor
      shotDmg: q.shotDmg || 0, shotRange: q.shotRange || 0,
      prot: q.prot || null, mag: q.mag || 0,
    };
  }
})();

if (typeof GAMEDATA !== "undefined" && GAMEDATA.items) {
  if (!GAMEDATA.items["mystic-dust"]) {
    GAMEDATA.items["mystic-dust"] = {
      n: "poeira mistica", s: null, t: "loot", sell: 0, w: 0.1,
    };
  }
  if (!GAMEDATA.items["health-potion"]) {
    GAMEDATA.items["health-potion"] = {
      n: "health potion", s: null, t: "supply", sell: 45, buy: 45, w: 2.0,
    };
  }
  if (!GAMEDATA.items["mana-fluid"]) {
    GAMEDATA.items["mana-fluid"] = {
      n: "mana fluid", s: null, t: "supply", sell: 80, buy: 80, w: 2.0,
    };
  }
  for (const slug in AMMO_DEFS) {
    const a = AMMO_DEFS[slug];
    GAMEDATA.items[slug] = Object.assign({}, GAMEDATA.items[slug] || {}, {
      n: a.n, s: "ammo", t: "ammo", ammoKind: a.kind, atk: a.atk,
      lvl: a.lvl > 1 ? a.lvl : undefined, buy: a.shotCost, shotCost: a.shotCost,
      itemId: a.id, rarity: "none", sell: 0, w: a.kind === "bolt" ? 0.8 : 0.7,
      el: a.el || "physical",
      area: a.area, noMiss: a.noMiss, poison: a.poison,
    });
  }
  for (const slug in QUIVER_DEFS) {
    const q = QUIVER_DEFS[slug];
    GAMEDATA.items[slug] = Object.assign({}, GAMEDATA.items[slug] || {}, {
      // s = slot de inventario, t = tipo do item. A aljava entra no slot da
      // mao secundaria (shield), como no Tibia, mas continua sendo tipo
      // "quiver" para as regras de municao e de vocacao.
      n: q.n, s: "shield", t: "quiver", cap: q.cap, vocs: ["paladin"],
      lvl: q.lvl > 1 ? q.lvl : undefined, drop: q.drop || undefined,
      shotDmg: q.shotDmg || 0, shotRange: q.shotRange || 0,
      prot: q.prot || undefined, mag: q.mag || 0,
      sell: q.sell, buy: q.buy, w: 18,
    });
  }
  if (GAMEDATA.monsters && GAMEDATA.monsters.goblin &&
      !GAMEDATA.monsters.goblin.loot.some((l) => l.item === "health-potion")) {
    GAMEDATA.monsters.goblin.loot.push({ item: "health-potion", chance: 8, max: 1 });
  }
}

/* Cura/dano efetivo de um supply para um dado nivel */
function supplyPower(s, level) {
  const arr = s.heal || s.damage || s.mana;
  if (!arr) return [0, 0];
  const bonus = (s.scale || 0) * level;
  return [Math.floor(arr[0] + bonus), Math.floor(arr[1] + bonus * 1.35)];
}

/* Preco de compra escala com o nivel (supply que cura mais custa mais) */
function supplyPrice(s, level) {
  return Math.floor(s.price * (1 + (s.scale || 0) * level * 0.012));
}

/* Valor de venda de um supply: igual ao preco de compra */
function supplySellPrice(s, level) {
  return supplyPrice(s, level);
}

if (typeof module !== "undefined") {
  module.exports = { VOCATIONS, SKILL_CONST, expForLevel, skillCost,
    skillTotalCost, mlCost, meleeDamage, distanceDamage, magicDamage,
    mitigate, hitChance, regenRate, baseStats, ATTACK_SPEED, ELEMENTS,
    SPELLS, SUPPLIES, AMMO_DEFS, QUIVER_DEFS };
}
