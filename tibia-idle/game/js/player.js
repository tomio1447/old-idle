/*
 * player.js — estado do personagem, equipamento, skills e progressao
 */
"use strict";

/* Slots do inventario, na ordem do cliente.
 *
 * `quiver` nao existe como campo separado no Tibia: a aljava ocupa a mao
 * secundaria (right-hand), o mesmo lugar do escudo — por isso paladino que
 * usa arco abre mao do escudo. Aqui o slot `shield` aceita os dois, e o
 * quiver so entra nele quando a vocacao e paladin.
 *
 * `extra` e o Extra Slot do 15.x: o campo inferior direito do inventario,
 * lido como a cintura do personagem, onde entram ferramentas bonus que dao
 * resistencia elemental.
 */
const SLOTS = ["helmet", "amulet", "backpack", "armor", "weapon", "shield",
               "legs", "boots", "ring", "extra", "ammo"];

/* O quiver equipado, se houver.
 *
 * A aljava mora no slot de escudo (right-hand), como no Tibia: o paladino
 * que carrega quiver abre mao do escudo. Toda a base de codigo consulta esta
 * funcao em vez de olhar p.equip.quiver, que era um slot inventado.
 */
function equippedQuiver(p) {
  const e = p && p.equip && p.equip.shield;
  if (!e) return null;
  const it = GAMEDATA.items[e.item];
  return it && it.t === "quiver" ? e : null;
}

/* Só paladino usa aljava — a vocacao do item no items.xml do canary */
function canUseQuiver(p) {
  return p && p.voc === "paladin";
}

const SKILL_NAMES = {
  fist: "Punho", sword: "Espada", axe: "Machado", club: "Clava",
  dist: "Distância", shield: "Escudo", magic: "Magic Level",
};

const PROMOTION_NAMES = {
  knight: "Elite Knight",
  paladin: "Royal Paladin",
  druid: "Elder Druid",
  sorcerer: "Master Sorcerer",
  monk: "Exalted Monk",
  none: "Sem vocação",
};

function vocationName(p) {
  const voc = typeof p === "string" ? p : p.voc;
  const promoted = typeof p === "object" && p.promoted;
  if (promoted && PROMOTION_NAMES[voc]) return PROMOTION_NAMES[voc];
  return VOCATIONS[voc] ? VOCATIONS[voc].name : voc;
}

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
    promoted: false,
    promotedAt: null,
    equip: { backpack: { item: "bag", count: 1 } }, // slot -> {item, count}
    bag: {},                // slug -> count
    ammo: {},               // slug -> unidades (munição não ocupa slot)
    upgrades: {},           // chave do item -> tier de refino do ferreiro
    imbuements: {},         // "equip:<slot>" -> [{cat, tier, sub}]
    conditions: {},         // veneno/fogo/energia... ativos no jogador
    buffs: {},              // buff de vocacao -> timestamp de expiracao
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
      healAt: 90,           // legado: % geral de cura
      healSpellAt: 90,      // % de HP para usar magia de cura
      healItemAt: 60,       // % de HP para usar item/runa/potion de cura
      manaAt: 50,           // % de mana para usar mana fluids
      healSpell: "",        // magia de cura selecionada pelo Helper
      healSupply: "",       // runa/potion de cura selecionada pelo Helper
      manaSupply: "mana-fluid", // item de mana selecionado pelo Helper
      useRunes: true,
      autoRestock: false,   // legado: compras agora acontecem por carga, no uso
      manaTrain: null,      // receita ativa do treino online de mana
      autoConjure: null,
      attackMode: "chase",  // chase | stand | kiting
      kiteDistance: 3,       // SQMs de distância no modo kiting (1-5)
      // Barra de combo: a rotacao de ataque. Cada slot e
      // {kind:"spell"|"rune", id, min} e a ORDEM e a prioridade.
      combo: [],
      comboMigrado: 1,      // char novo ja nasce sem config de shooter
      // legado: mantidos so para saves antigos migrarem (ver combo.js)
      shooterType: "auto",
      shooterSpell: "",
      shooterRune: "",
      autoEquip: true,
      spellAttack: true,
      autoRetreat: true,    // recua em vez de morrer quando acabam os supplies
      barMode: "bars",      // bars | arcs
      lootFilter: "all",    // all | valuable | equip
      missionCollapsed: false,
      refillArrow: "",      // arrow selecionada
      refillBolt: "",       // bolt selecionada
    },
    missions: {},
    bosses: {},
    log: [],
    achievements: {},
    outfit: null,           // {type, colors:[head,body,legs,feet]}
  };
  ensureOutfit(p);
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
              melee: 0, sword: 0, axe: 0, club: 0, shield: 0, dist: 0,
              fist: 0 };
  for (const s of SLOTS) {
    const e = p.equip[s];
    if (!e) continue;
    const base = GAMEDATA.items[e.item];
    if (!base) continue;
    // aplica o refino do ferreiro nos atributos do item equipado
    const it = typeof upgradedStats === "function"
      ? upgradedStats(p, "equip:" + s, e.item) : base;
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
    g.fist += it.fist || 0;
  }
  // bonus de skill vindos dos imbuements (15.x)
  if (typeof imbTotals === "function") {
    const t = imbTotals(p);
    g.sword += t.sword || 0;
    g.axe += t.axe || 0;
    g.club += t.club || 0;
    g.shield += t.shield || 0;
    g.dist += t.dist || 0;
    g.mag += t.magic || 0;
    g.speed += t.speed || 0;
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
  // punho tambem recebe bonus de equipamento: as armas de monk trazem
  // skillfist no items.xml (a jo staff da +1)
  else if (which === "fist") v += g.fist + g.melee;
  // Virtue of Justice e PERCENTUAL sobre o total, entao entra depois de
  // somar o equipamento (SKILL_FISTPERCENT do Canary trabalha assim)
  if (which === "fist" && typeof virtudeFistBonus === "function") {
    v = Math.floor(v * virtudeFistBonus(p));
  }
  return v;
}

function effMagic(p) {
  return p.ml + gearStats(p).mag;
}

/* Qual skill a arma equipada usa */
/* Aplica o multiplicador de skill da vocacao (vocations.xml do Canary):
 * multiplicador menor = skill sobe mais rapido. */
function skillGainFor(p, skill, tries) {
  const mul = typeof skillMultiplier === "function"
    ? skillMultiplier(p.voc, skill) : 1.5;
  return tries / mul;
}

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
  // "fist" e o weaponType das armas de monk (jo staff, katar, sai...):
  // elas contam como punho, e nao como clava
  return "fist";
}

/* Dano por golpe do jogador */
function playerDamage(p) {
  const w = p.equip.weapon;
  const it = w ? (typeof upgradedStats === "function"
    ? upgradedStats(p, "equip:weapon", w.item) : GAMEDATA.items[w.item]) : null;
  const voc = VOCATIONS[p.voc];

  if (it && it.t === "magic") {
    const d = magicDamage(p.level, effMagic(p), it.mdmg || 10);
    return { min: d.min, max: d.max, element: "energy", type: "magic" };
  }
  if (it && it.t === "distance") {
    // armas de munição infinita (spear) usam só o próprio ataque
    const ammo = it.inf ? null : (p.equip.ammo ? GAMEDATA.items[p.equip.ammo.item] : null);
    const atk = (it.atk || 0) + (ammo ? (ammo.atk || 0) : 0);
    const d = distanceDamage(effSkill(p, "dist"), atk, 1.0);
    return { min: Math.floor(d.max * 0.2), max: d.max,
             element: (ammo && ammo.el) || "physical", type: "distance" };
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
    shielding: (function () {
      let sh = effSkill(p, "shield");
      // Protector e Virtue of Harmony aumentam o shielding em %
      if (typeof buffTotals === "function") {
        const b = buffTotals(p);
        if (b.shieldPercent) sh = Math.floor(sh * (1 + b.shieldPercent / 100));
      }
      return sh;
    })(),
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

/* ---------------------------------------------------- municao (contador)
 * Munição não ocupa slot da mochila: vive em p.ammo como contagem pura.
 * É reposta apenas por conjure e loot — nunca comprada. */
function ammoCount(p, slug) {
  return (p.ammo && p.ammo[slug]) || 0;
}

function addAmmo(p, slug, count) {
  count = count || 1;
  if (!p.ammo) p.ammo = {};
  p.ammo[slug] = (p.ammo[slug] || 0) + count;
  if (p.equip.ammo && p.equip.ammo.item === slug)
    p.equip.ammo.count = p.ammo[slug];
  return p.ammo[slug];
}

function removeAmmo(p, slug, count) {
  count = count || 1;
  if (!p.ammo || !p.ammo[slug]) return false;
  p.ammo[slug] = Math.max(0, p.ammo[slug] - count);
  if (p.equip.ammo && p.equip.ammo.item === slug)
    p.equip.ammo.count = p.ammo[slug];
  return true;
}

/* Seleciona a munição ativa. O slot de ammo é único: escolher uma arrow
 * desequipa automaticamente o bolt anterior (e vice-versa), evitando
 * qualquer estado com duas munições ativas ao mesmo tempo. */
function setActiveAmmo(p, slug) {
  if (!slug) { delete p.equip.ammo; return null; }
  const it = GAMEDATA.items[slug];
  if (!it || it.s !== "ammo") return null;
  p.equip.ammo = { item: slug, count: Infinity };
  // mantem a config do helper coerente: so um tipo fica marcado
  if (p.config) {
    const isBolt = slug.indexOf("bolt") !== -1;
    p.config.refillArrow = isBolt ? "" : slug;
    p.config.refillBolt = isBolt ? slug : "";
  }
  return p.equip.ammo;
}

/* Move munição legada que estava ocupando slots da bag para o contador */
function migrateAmmoToCounter(p) {
  if (!p.ammo) p.ammo = {};
  for (const slug of Object.keys(p.bag || {})) {
    const it = GAMEDATA.items[slug];
    if (it && it.s === "ammo") {
      p.ammo[slug] = (p.ammo[slug] || 0) + p.bag[slug];
      delete p.bag[slug];
    }
  }
  // A municao nao e mais estocada: o slot guarda apenas qual esta escolhida
  // e o custo sai em gold a cada tiro. Gravar aqui a contagem antiga deixava
  // count 0 em saves migrados, e o auto-equip trocava a municao do jogador
  // por outra achando que a dele tinha acabado.
  if (p.equip.ammo && p.equip.ammo.item) p.equip.ammo.count = Infinity;
  return p.ammo;
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

/* Remove a regra que casa exatamente com o texto/slug informado */
function removeLootRuleByText(p, key, text) {
  const rule = normalizeLootRule(text);
  if (!rule) return false;
  const list = lootConfigList(p, key);
  let removed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] === rule || lootRuleMatches(text, list[i])) { list.splice(i, 1); removed = true; }
  }
  return removed;
}

/* Moedas são convertidas direto em gold, nunca ocupam a pouch */
const CURRENCY_ITEMS = {
  "gold-coin": 1,
  "platinum-coin": 100,
  "crystal-coin": 10000,
};

function currencyValue(slug) {
  return CURRENCY_ITEMS[slug] || 0;
}

/* Credita moedas no balance do jogador. Retorna o gold gerado. */
function creditCurrency(p, slug, count) {
  const unit = currencyValue(slug);
  if (!unit) return 0;
  const total = unit * (count || 0);
  if (total <= 0) return 0;
  p.gold += total;
  return total;
}

function shouldGoLootPouch(slug) {
  const it = GAMEDATA.items[slug];
  if (!it || currencyValue(slug) || SUPPLIES[slug]) return false;
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

/* Poder real de uma arma de distância para o auto-equip.
 * Uma spear vale o próprio atk (munição infinita). Um bow/crossbow vale o
 * atk da melhor munição que o jogador consegue usar — e vale 0 se ele não
 * tem munição nem gold para comprar, evitando trocar por uma arma inútil. */
function distanceWeaponPower(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it || it.t !== "distance") return 0;
  if (it.inf) return it.atk || 0;              // spear: autossuficiente

  if (!equippedQuiver(p)) return 0;
  let best = 0;
  for (const ammoSlug in GAMEDATA.items) {
    const am = GAMEDATA.items[ammoSlug];
    if (!am || am.s !== "ammo") continue;
    if (am.lvl && p.level < am.lvl) continue;
    const price = am.shotCost || am.buy || 0;
    if (price <= 0 || p.gold < price) continue;
    if ((am.atk || 0) > best) best = am.atk || 0;
  }
  if (!best) return 0;                          // sem quiver/munição pagável: arma inútil
  return (it.atk || 0) + best;
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
  // Mantra so serve para o Monk, mas para ele vale MUITO: alem de abater
  // dano elemental fixo, vira dano de punho com os santuarios da quest.
  // Sem este peso o auto-equip preferia uma armadura de +2 de armor a uma
  // robe de monge com 19 de mantra.
  if (it.mantra) s += voc === "monk" ? it.mantra * 14 : 0;

  if (it.s === "quiver") {
    s += 100 + (it.cap || 0) * 3 + (it.dist || 0) * 20;
    if (!isDist) s -= 80;
  }

  if (it.s === "weapon") {
    if (isMagic) {
      s += (it.mdmg || 0) * 6 + (it.mag || 0) * 60;
      if (it.t !== "magic") s -= 40;
    } else if (isDist) {
      if (it.t === "distance") {
        // bow/crossbow tiram o dano da munição (atk 0 no item), enquanto a
        // spear carrega o atk no próprio item. Comparar atk cru faria a
        // spear vencer sempre; então avalia o conjunto arma + munição.
        s += distanceWeaponPower(p, slug) * 10;
      } else {
        s += (it.atk || 0) * 3;
      }
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
    const cur = best ? GAMEDATA.items[best] : null;
    for (const slug in p.bag) {
      const it = GAMEDATA.items[slug];
      if (!it || it.s !== slot) continue;
      if (it.lvl && p.level < it.lvl) continue;
      if (it.vocs && it.vocs.indexOf(p.voc) === -1) continue;
      // aljava e item de paladino e disputa a mao secundaria com o escudo:
      // o auto-equip nao pode trocar o escudo de um knight por um quiver
      if (it.t === "quiver" && !canUseQuiver(p)) continue;
      // não troca a arma de distância equipada por uma spear só porque a
      // munição acabou: as regras de arrow continuam valendo e o jogador
      // fica sem atacar, em vez de virar arremessador sem avisar.
      if (slot === "weapon" && it.inf && cur && cur.t === "distance" && !cur.inf)
        continue;
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
  // Municao para paladin. A municao nao e mais estocada: cada tiro cobra
  // gold, entao nao existe "melhor municao disponivel no contador". O
  // auto-equip so garante que EXISTA alguma municao valida selecionada —
  // trocar a escolha do jogador aqui zerava a selecao dele a cada 15s e,
  // pior, gravava count 0, o que fazia o ataque a distancia sair sem dano.
  if (w && w.t === "distance" && !w.inf && equippedQuiver(p)) {
    const atual = p.equip.ammo && p.equip.ammo.item
      ? GAMEDATA.items[p.equip.ammo.item] : null;
    const serve = atual && atual.s === "ammo" &&
      (typeof ammoCompatibleWithWeapon !== "function" ||
       ammoCompatibleWithWeapon(atual, p.equip.weapon)) &&
      p.level >= (atual.lvl || 1);
    // no modo automatico o jogador delegou a escolha, entao reavaliamos
    // sempre (subiu de nivel = pode ter liberado municao melhor)
    if (!serve || p.config.ammoAuto) {
      // Escolhe a municao com melhor custo-beneficio, nao a de maior ataque.
      // Pegar so o maior atk fazia o auto-equip trocar para burst arrow
      // (15 gp/tiro) sozinho e drenar o gold do jogador em pouco tempo.
      let melhor = null, melhorNota = -1;
      for (const slug in GAMEDATA.items) {
        const it = GAMEDATA.items[slug];
        if (!it || it.s !== "ammo") continue;
        if (p.level < (it.lvl || 1)) continue;
        if (typeof ammoCompatibleWithWeapon === "function" &&
            !ammoCompatibleWithWeapon(it, p.equip.weapon)) continue;
        const custo = it.shotCost || it.buy || 1;
        const nota = (it.atk || 0) / custo;
        if (nota > melhorNota) { melhorNota = nota; melhor = slug; }
      }
      if (melhor) setActiveAmmo(p, melhor);
    }
  }
  return changes;
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
