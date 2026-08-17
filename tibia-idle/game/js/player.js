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

/* Idle nasce em AUTO. Só desliga quando o jogador aperta o botão. */
function playerAutoWalkOn(p) {
  return !p || !p.config || p.config.autoWalk !== false;
}

/* Resolve o personagem vivo (combate) ou o save — para AUTO por membro. */
function resolvePlayerById(id) {
  if (id === null || id === undefined || id === "") return null;
  const sid = String(id);
  if (typeof G !== "undefined" && G && G.p) {
    const cur = (typeof characterId === "function") ? String(characterId(G.p)) : String(G.p.id);
    if (cur === sid) return G.p;
  }
  if (typeof G !== "undefined" && G && G.combat && Array.isArray(G.combat.players)) {
    for (const e of G.combat.players) {
      if (!e || !e.p) continue;
      const eid = String(e.id !== undefined ? e.id : "");
      const pid = (typeof characterId === "function")
        ? String(characterId(e.p)) : String(e.p.id || "");
      if (eid === sid || pid === sid) return e.p;
    }
  }
  if (typeof getCharacters === "function") {
    const list = getCharacters() || [];
    for (const c of list) {
      if (!c) continue;
      const cid = (typeof characterId === "function") ? String(characterId(c)) : String(c.id || "");
      if (cid === sid) return c;
    }
  }
  return null;
}

/* Liga/desliga AUTO no personagem. OFF = parado (park) até WASD/clique.
 * Controle manual (AUTO off) exige VIP. */
function togglePlayerAutoWalk(p) {
  if (!p) return true;
  p.config = p.config || {};
  const on = typeof playerAutoWalkOn === "function" ? playerAutoWalkOn(p) : p.config.autoWalk !== false;
  if (on && typeof vipManualControlAllowed === "function" && !vipManualControlAllowed()) {
    if (typeof toast === "function") toast("Controle manual SQM é exclusivo VIP.", "bad");
    p.config.autoWalk = true;
    if (typeof paintAutoWalkButton === "function") paintAutoWalkButton(typeof G !== "undefined" && G ? G.p : p);
    return true;
  }
  const next = !on;
  p.config.autoWalk = next;
  if (next && typeof G !== "undefined" && G && G.combat) {
    const sid = (typeof characterId === "function") ? String(characterId(p)) : String(p.id || "");
    const clear = (ent) => {
      if (!ent || !ent.p) return;
      const eid = String(ent.id !== undefined ? ent.id : "");
      const pid = (typeof characterId === "function")
        ? String(characterId(ent.p)) : String(ent.p.id || "");
      if (eid === sid || pid === sid) ent.walkGoal = null;
    };
    if (G.combat.player) clear(G.combat.player);
    if (Array.isArray(G.combat.players)) G.combat.players.forEach(clear);
  }
  if (typeof paintAutoWalkButton === "function") paintAutoWalkButton(typeof G !== "undefined" && G ? G.p : p);
  return next;
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

/* Preço da bênção por faixa de level:
 *   1–120   = 50% do level × 1000
 *   121–399 = 70% do level × 1000
 *   400+    = 100% do level × 1000 */
function blessingPriceForLevel(level) {
  level = Math.max(1, Math.floor(Number(level) || 1));
  const pricePerLevel = level <= 120 ? 500 : level < 400 ? 700 : 1000;
  return level * pricePerLevel;
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
    equip: { backpack: { item: "bag", count: 1 } }, // slot -> {item, count, instId?}
    bag: {},                // slug -> count (espelho agregado para não-equipáveis e instâncias em bag)
    itemInstances: [],      // itens não-stackáveis/equipáveis rastreados por instância
    ammo: {},               // slug -> unidades (munição não ocupa slot)
    upgrades: {},           // chave do item -> tier de refino do ferreiro
    imbuements: {},         // "equip:<slot>" -> [{cat, tier, sub}]
    conditions: {},         // veneno/fogo/energia... ativos no jogador
    buffs: {},              // buff de vocacao -> timestamp de expiracao
    bagSlots: 8,            // bag padrão: 8 slots/tipos de item
    lootPouch: {},          // loot de hunt para auto-seller
    supplyStash: {},        // rings/amulets com cargas (Auto Supply Stash)
    lootConfig: { noCollect: [], noSell: [] },
    cap: 5000,              // capacidade base (oz); piso se a fórmula por nível for menor
    supplies: { "mana-potion": 0 }, // slug -> count/carga selecionada
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
      manaAt: 50,           // % de mana para usar potions de mana
      healSpell: "",        // magia de cura selecionada pelo Helper
      healSupply: "",       // runa/potion de cura selecionada pelo Helper
      manaSupply: "",       // potion de mana — vazia = nenhuma (jogador escolhe 1)
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
      hasteSpell: "",       // magia de velocidade selecionada pelo Helper
      spellAttack: true,
      autoRetreat: true,    // recua em vez de morrer quando acabam os supplies
      barMode: "bars",      // bars | arcs
      lootFilter: "all",    // all | valuable | equip
      missionCollapsed: false,
      noPotions: false,
      pouchAutoSell: false,
      pouchAutoSellPct: 80,
      autoWalk: true,       // AUTO: IA anda sozinha; off = WASD/clique por SQM
      refillArrow: "",      // arrow selecionada
      refillBolt: "",       // bolt selecionada
      healFriendSpells: {},
      healFriendTargets: {},
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

const DEFAULT_PLAYER_CAP = 5000;

/* Garante CAP base nos saves antigos (faltava o campo → loot bloqueado). */
function ensurePlayerCapacity(p) {
  if (!p) return DEFAULT_PLAYER_CAP;
  const n = Math.floor(Number(p.cap));
  if (!Number.isFinite(n) || n <= 0) p.cap = DEFAULT_PLAYER_CAP;
  else p.cap = n;
  return p.cap;
}

function maxStats(p) {
  if (!p) return { hp: 150, mp: 0, cap: DEFAULT_PLAYER_CAP };
  ensurePlayerCapacity(p);
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
  // Wheel of Destiny: bonus de HP/Mana/Capacidade dos nos da wheel
  let w = null;
  if (typeof wheelTotals === "function" && p.wheel) w = wheelTotals(p);
  if (w) { bonusHp += w.hp; bonusMp += w.mp; }
  // Piso: CAP salva (default 5000) ou fórmula por nível — o que for maior.
  const cap = Math.max(b.cap + (w ? w.cap : 0), ensurePlayerCapacity(p));
  return { hp: b.hp + bonusHp, mp: b.mp + bonusMp, cap: cap };
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
    // Update 15.25: defence value dos SHIELDS +30% e dos SPELLBOOKS +60%.
    // O multiplicador so vale para o item vestido na mao secundaria (shield
    // slot) e nao conta para a aljava do paladin.
    if (s === "shield" && it.def && it.t !== "quiver") {
      g.defense += Math.floor(it.def * (it.mag ? 1.6 : 1.3));
    } else {
      g.defense += it.def || 0;
    }
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
    // skilldist do items.xml. Estava faltando: todas as outras skills eram
    // somadas aqui e a distancia so recebia bonus de imbuement, entao arco,
    // besta e equipamento de paladino com skilldist nao davam nada.
    g.dist += it.dist || 0;
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

/* Leech FIXO dos itens equipados (TibiaWiki/Siphoning e /Draining):
 * armas "Siphoning Inferniarch" concedem 10% de Mana Leech permanente e
 * armas "Draining Inferniarch" concedem 29% de Life Leech permanente,
 * como atributo próprio do item (sem precisar de imbuement).
 * Soma o atributo `lifeLeech`/`manaLeech` de todos os equipamentos.
 */
function equipmentLeechTotals(p) {
  const t = { lifeLeech: 0, manaLeech: 0 };
  if (!p || !p.equip || typeof GAMEDATA === "undefined") return t;
  for (const s of SLOTS) {
    const e = p.equip[s];
    if (!e || !e.item) continue;
    const it = GAMEDATA.items[e.item];
    if (!it) continue;
    t.lifeLeech += it.lifeLeech || 0;
    t.manaLeech += it.manaLeech || 0;
  }
  return t;
}

/* Bonus flat de skill vindo do equipamento (+ imbuements via gearStats). */
function gearSkillBonus(p, which) {
  const g = gearStats(p);
  if (which === "sword") return (g.sword || 0) + (g.melee || 0);
  if (which === "axe") return (g.axe || 0) + (g.melee || 0);
  if (which === "club") return (g.club || 0) + (g.melee || 0);
  if (which === "shield") return g.shield || 0;
  if (which === "dist") return g.dist || 0;
  if (which === "fist") return (g.fist || 0) + (g.melee || 0);
  if (which === "magic") return g.mag || 0;
  return 0;
}

/* Nome curto da stance ativa que mexe em skill (para o tooltip). */
function stanceSkillBonusLabel(p, kind) {
  if (!p || !p.stances) return kind === "dist" ? "sharpshooter" : "blood rage";
  for (const id in p.stances) {
    const st = typeof STANCES !== "undefined" ? STANCES[id] : null;
    if (!st) continue;
    if (kind === "melee" && st.meleePct) {
      return (st.nome || id).toLowerCase();
    }
    if (kind === "dist" && st.distPct) {
      return (st.nome || id).toLowerCase();
    }
  }
  return kind === "dist" ? "sharpshooter" : "blood rage";
}

/* Breakdown da skill efetiva: espelha effSkill/effMagic, com cada fonte
 * flat ou o delta absoluto dos % (blood rage, virtue…). Só partes > 0. */
function skillBreakdown(p, which) {
  const isMl = which === "magic";
  const parts = [];
  const base = isMl ? (p.ml || 0) : (p.skills[which] || 10);
  parts.push({ label: "base", value: base });

  const items = gearSkillBonus(p, which);
  if (items) parts.push({ label: "itens", value: items });

  let wheel = 0;
  if (isMl) {
    wheel = (typeof wheelMagicBonus === "function" && p.wheel) ? wheelMagicBonus(p) : 0;
  } else if (typeof wheelSkillBonus === "function" && p.wheel) {
    wheel = wheelSkillBonus(p, which);
  }
  if (wheel) parts.push({ label: "wheel", value: wheel });

  const loyalty = (typeof loyaltySkillBonus === "function") ? loyaltySkillBonus(p) : 0;
  if (loyalty) parts.push({ label: "loyalty", value: loyalty });

  let v = base + items + wheel + loyalty;

  if (!isMl && which === "fist" && typeof virtudeFistBonus === "function") {
    const mul = virtudeFistBonus(p);
    if (mul && mul !== 1) {
      const next = Math.floor(v * mul);
      const delta = next - v;
      if (delta) parts.push({ label: "virtue of justice", value: delta });
      v = next;
    }
  }

  if (!isMl && typeof stanceTotals === "function") {
    const st = stanceTotals(p);
    if (st.meleePct &&
        (which === "sword" || which === "axe" || which === "club" ||
         which === "fist")) {
      const next = Math.floor(v * (1 + st.meleePct / 100));
      const delta = next - v;
      if (delta) {
        parts.push({ label: stanceSkillBonusLabel(p, "melee"), value: delta });
      }
      v = next;
    }
    if (st.distPct && which === "dist") {
      const next = Math.floor(v * (1 + st.distPct / 100));
      const delta = next - v;
      if (delta) {
        parts.push({ label: stanceSkillBonusLabel(p, "dist"), value: delta });
      }
      v = next;
    }
  }

  return { parts: parts, total: v };
}

function skillBreakdownText(p, which) {
  const bd = skillBreakdown(p, which);
  return bd.parts.map((x) => x.value + " " + x.label).join(" + ");
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
  // Wheel of Destiny: bonus de skill (melee/distance/fist) dos nos da wheel
  if (typeof wheelSkillBonus === "function" && p.wheel) {
    v += wheelSkillBonus(p, which);
  }
  // Loyalty: flat +N em skills efetivas (não altera o save)
  if (typeof loyaltySkillBonus === "function") {
    v += loyaltySkillBonus(p);
  }
  // Virtue of Justice e PERCENTUAL sobre o total, entao entra depois de
  // somar o equipamento (SKILL_FISTPERCENT do Canary trabalha assim)
  if (which === "fist" && typeof virtudeFistBonus === "function") {
    v = Math.floor(v * virtudeFistBonus(p));
  }
  // Stances do 15.25, tambem percentuais sobre o TOTAL da skill:
  //   Blood Rage   -> +25% melee (fist/axe/club/sword)
  //   Sharpshooter -> +32% distance (conta equipamentos e buffs)
  if (typeof stanceTotals === "function") {
    const st = stanceTotals(p);
    if (st.meleePct &&
        (which === "sword" || which === "axe" || which === "club" ||
         which === "fist")) {
      v = Math.floor(v * (1 + st.meleePct / 100));
    }
    if (st.distPct && which === "dist") {
      v = Math.floor(v * (1 + st.distPct / 100));
    }
  }
  return v;
}

function effMagic(p) {
  const wheelMag = (typeof wheelMagicBonus === "function" && p.wheel) ? wheelMagicBonus(p) : 0;
  const loyaltyMag = (typeof loyaltySkillBonus === "function") ? loyaltySkillBonus(p) : 0;
  return p.ml + gearStats(p).mag + wheelMag + loyaltyMag;
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
  if (it.t === "magic" || it.t === "wand" || it.t === "rod") return "magic";
  // "fist" e o weaponType das armas de monk (jo staff, katar, sai...):
  // elas contam como punho, e nao como clava
  return "fist";
}

function isMagicWeaponItem(it) {
  if (!it) return false;
  const t = String(it.t || it.type || "");
  return t === "magic" || t === "wand" || t === "rod";
}

/* Multiplicador idle de dano base por vocação (Knight / Sorcerer +15%). */
function playerIdleBaseDmgMul(p) {
  if (typeof CanaryVocation !== "undefined" && CanaryVocation.idleBaseDamageMul)
    return CanaryVocation.idleBaseDamageMul(p && p.voc);
  return 1;
}

/* Dano por golpe do jogador */
function playerDamage(p) {
  const w = p.equip.weapon;
  const it = w ? (typeof upgradedStats === "function"
    ? upgradedStats(p, "equip:weapon", w.item) : GAMEDATA.items[w.item]) : null;
  const voc = VOCATIONS[p.voc];
  const baseVoc = (typeof CanaryVocation !== "undefined" && CanaryVocation.baseVocName)
    ? CanaryVocation.baseVocName(p.voc) : String(p.voc || "");
  const idleMul = playerIdleBaseDmgMul(p);

  if (isMagicWeaponItem(it)) {
    // Canary WeaponWand::getWeaponDamage: dano base do item (fromDamage a
    // toDamage em items.xml) + level/5, mantendo o elemento real da wand/rod
    // em vez de forçar energy e escalar com ml (magicDamage).
    const lvBonus = Math.floor((p.level || 1) / 5);
    let min = (it.dmgMin !== undefined ? it.dmgMin : (it.mdmg || 10)) + lvBonus;
    let max = (it.dmgMax !== undefined ? it.dmgMax : (it.mdmg || 10)) + lvBonus;
    if (idleMul !== 1) {
      min = Math.max(0, Math.floor(min * idleMul));
      max = Math.max(1, Math.floor(max * idleMul));
    }
    return { min: min, max: Math.max(min, max), element: it.el || "energy", type: "magic" };
  }
  if (it && it.t === "distance") {
    // armas de munição infinita (spear) usam só o próprio ataque
    const throwW = !!(it.inf || (typeof weaponAmmoKind === "function" && !weaponAmmoKind(it, w.item)));
    const ammo = throwW ? null : (p.equip.ammo ? GAMEDATA.items[p.equip.ammo.item] : null);
    let atk = (it.atk || 0) + (ammo ? (ammo.atk || 0) : 0);
    atk = Math.floor(atk * 1.2);            // +20% attack value (15.25)
    // municao elemental corta o dano pela metade contra monstro (o resto
    // vira dano do elemento), como no getWeaponDamage do servidor
    const el = (ammo && ammo.el) || "physical";
    const temEl = !!(ammo && ammo.el && ammo.el !== "physical");
    const d = distanceDamage(effSkill(p, "dist"), atk, 1.0, p.level, temEl);
    let min = d.min, max = d.max;
    // dmgMul da munição (ex.: diamond arrow idle +15%) multiplica o
    // resultado da fórmula, não o atk bruto — cobre min e max.
    const ammoMul = Number(ammo && ammo.dmgMul);
    if (ammoMul > 0 && ammoMul !== 1) {
      min = Math.max(0, Math.floor(min * ammoMul));
      max = Math.max(1, Math.floor(max * ammoMul));
    }
    if (idleMul !== 1) {
      min = Math.max(0, Math.floor(min * idleMul));
      max = Math.max(1, Math.floor(max * idleMul));
    }
    return { min: min, max: max, element: el, type: "distance" };
  }
  const sk = weaponSkill(p);
  // +20% attack value (15.25) sobre o ataque da arma
  let fis = it ? Math.floor((it.atk || 0) * 1.2) : 7;         // punho = attack 7 no canary
  // KNIGHT: dano base +30% (pedido do dono do jogo) — multiplica o ataque
  // da arma antes da rolagem, então vale para o dano físico de melee.
  // Elite Knight usa a mesma base (CanaryVocation.baseVocName).
  if (baseVoc === "knight") fis = Math.floor(fis * 1.3);
  // Arma elemental (naga sword, fire sword, ice rapier...) soma o elDmg ao
  // ataque ANTES de rolar: e o `totalAttack` do Weapon::getCombatDamage.
  // Antes o elDmg era ignorado aqui, entao uma naga sword (atk 8, elDmg 44)
  // batia como se tivesse ataque 8 e o gelo simplesmente sumia.
  const elDmg = (it && it.el && it.el !== "physical") ? (it.elDmg || 0) : 0;
  const total = fis + elDmg;
  const d = meleeDamage(effSkill(p, sk), total, 1.0, p.level);
  let min = d.min, max = d.max;
  if (idleMul !== 1) {
    min = Math.max(0, Math.floor(min * idleMul));
    max = Math.max(1, Math.floor(max * idleMul));
  }
  const r = { min: min, max: max, element: "physical", type: "melee" };
  const bond = (typeof elementalBond === "function") ? elementalBond(p) : null;
  if (bond) {
    r.element = bond;
    return r;
  }
  if (elDmg > 0) {
    // proporcao do golpe que fica em cada tipo. O servidor reparte o MESMO
    // valor rolado: primary = realDamage * (fisico/total) e secondary o
    // resto, entao os dois numeros sempre somam o golpe cheio.
    r.elemento2 = it.el;
    r.propFisica = total > 0 ? fis / total : 1;
  }
  return r;
}

/* Defesa total do jogador */
function playerDefense(p) {
  const g = gearStats(p);
  return {
    armor: g.armor,
    defense: g.defense,
    shielding: (function () {
      // Blood Rage (15.25): ZERA a capacidade de bloquear — so a armadura
      // continua reduzindo o dano, como diz a pagina oficial da magia.
      if (typeof stanceTotals === "function" && stanceTotals(p).noBlock)
        return 0;
      let sh = effSkill(p, "shield");
      // Protector e Virtue of Harmony aumentam o shielding em %
      let pc = 0;
      if (typeof buffTotals === "function") {
        const b = buffTotals(p);
        pc += b.shieldPercent || 0;
      }
      // stance Protector: +30% Shielding (15.25)
      if (typeof stanceTotals === "function") pc += stanceTotals(p).shieldPct;
      if (pc) sh = Math.floor(sh * (1 + pc / 100));
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

  // Rate de skill do servidor: divide o custo pelo rate
  const currentSkill = p.skills[which] || 10;
  const skillRate = (typeof serverSkillRate === "function")
    ? serverSkillRate(currentSkill) : 1;
  const effectiveTries = Math.floor(tries * skillRate);

  p.skillTries[which] = (p.skillTries[which] || 0) + effectiveTries;
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
  // Rate de magic do servidor: divide o custo pelo rate
  const magicRate = (typeof serverMagicRate === "function")
    ? serverMagicRate(p.ml) : 1;
  const effectiveMana = Math.floor(mana * magicRate);

  p.manaSpent += effectiveMana;
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
function setActiveAmmo(p, slug, persistOnline) {
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
  // Em combate online o próximo tick substitui o snapshot local. Seleções
  // explícitas precisam passar pela autoridade para não voltar à munição
  // anterior após 500 ms. Não há requisito de bow/crossbow nesta etapa.
  if(persistOnline&&p.id&&typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat()&&
     typeof accountSelectInstanceAmmo==="function"&&typeof sessionToken==="function")
    accountSelectInstanceAmmo(sessionToken(),p.id,slug,!!(p.config&&p.config.ammoAuto)).then((result)=>{
      if(!result.ok&&typeof toast==="function")toast(result.msg||"Não foi possível trocar a munição","bad");
    }).catch(()=>{});
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

function itemUsesInstances(slug) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s || it.s === "ammo") return false;
  // Arremessáveis (assassin star, throwing star, viper star, leaf star,
  // royal spear, small stone...) são MUNIÇÃO no Tibia: empilham na bag
  // (1 slot por tipo, contagem na stack). Itens de verdade (armas com
  // imbuement slot, armaduras etc.) continuam por instância.
  if (it.t === "distance" && !it.imbSlots) return false;
  // Anéis/amuletos/soft boots com cargas: CHEIOS empilham na bag; PARCIAIS
  // viram instâncias com .charges (não compartilham ledger por slug).
  if (isChargeStackableAccessory(slug)) return false;
  return true;
}

/* Rings/amulets/boots com cargas e sem imbuement (SSA, might, time ring…). */
function isChargeStackableAccessory(slug) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items) ? GAMEDATA.items[slug] : null;
  if (!it || !it.charges) return false;
  if (it.s !== "ring" && it.s !== "amulet" && it.s !== "boots") return false;
  if (it.imbSlots) return false;
  return true;
}

function accessoryCatalogCharges(slug) {
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items) ? GAMEDATA.items[slug] : null;
  const n = Math.floor(Number(it && it.charges) || 0);
  return n > 0 ? n : 0;
}

function accessoryChargesAreFull(slug, charges) {
  const full = accessoryCatalogCharges(slug);
  if (!full) return true;
  if (charges === undefined || charges === null) return true;
  const n = Math.floor(Number(charges));
  return Number.isFinite(n) && n >= full;
}

function accessoryChargesArePartial(slug, charges) {
  const full = accessoryCatalogCharges(slug);
  if (!full) return false;
  const n = Math.floor(Number(charges));
  return Number.isFinite(n) && n > 0 && n < full;
}

function nextItemInstanceId(p) {
  p._itemInstSeq = (p._itemInstSeq || 0) + 1;
  return "it-" + p._itemInstSeq.toString(36) + "-" + Date.now().toString(36);
}

function itemInstanceTier(inst) {
  return inst && inst.tier ? inst.tier : 0;
}

function findItemInstance(p, id) {
  ensureItemInstances(p);
  for (const inst of (p.itemInstances || [])) if (inst.id === id) return inst;
  return null;
}

function syncBagCountsFromInstances(p) {
  p.bag = p.bag || {};
  const nextBag = {};
  for (const slug in p.bag) {
    if (!p.bag[slug] || itemUsesInstances(slug)) continue;
    nextBag[slug] = p.bag[slug];
  }
  // Instâncias de itens que NÃO usam mais instância (arremessáveis viraram
  // empilháveis) são convertidas em quantidade na bag; as demais continuam
  // como instância (e entram na contagem de exibição).
  // Chargeables: PARCIAL permanece instância; CHEIO funde na stack da bag.
  const rest = [];
  for (const inst of (p.itemInstances || [])) {
    if (!inst || inst.loc !== "bag") { rest.push(inst); continue; }
    if (isChargeStackableAccessory(inst.slug)) {
      if (accessoryChargesArePartial(inst.slug, inst.charges)) {
        rest.push(inst);
        continue;
      }
      // full / sem charges → stack
      nextBag[inst.slug] = (nextBag[inst.slug] || 0) + 1;
      continue;
    }
    nextBag[inst.slug] = (nextBag[inst.slug] || 0) + 1;
    if (itemUsesInstances(inst.slug)) rest.push(inst);
  }
  p.bag = nextBag;
  p.itemInstances = rest;
}

function ensureItemInstances(p) {
  p.bag = p.bag || {};
  p.itemInstances = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  p.depot = Array.isArray(p.depot) ? p.depot : [];
  p.exaltationBox = Array.isArray(p.exaltationBox) ? p.exaltationBox : [];
  p.equip = p.equip || {};

  if (p._itemInstancesVersion === 2) {
    for (const inst of p.itemInstances) {
      if (!inst.id) inst.id = nextItemInstanceId(p);
      if (inst.tier === undefined) inst.tier = 0;
    }
    // Equip/admin kits muitas vezes gravam só {item,count} sem instId.
    // Sem reconciliar, a lista da Forge (e os procs) enxergam só o que
    // ainda tem instância — tipicamente só a arma do fluxo normal.
    for (const slot in p.equip) {
      const e = p.equip[slot];
      if (!e || !e.item || !itemUsesInstances(e.item)) continue;
      let inst = null;
      if (e.instId) {
        for (const cand of p.itemInstances) {
          if (cand && cand.id === e.instId) { inst = cand; break; }
        }
      }
      if (!inst) {
        for (const cand of p.itemInstances) {
          if (cand && cand.slug === e.item && cand.loc === "equip:" + slot) {
            inst = cand;
            break;
          }
        }
      }
      if (!inst) {
        const tier = (p.forge && p.forge[e.item]) || 0;
        inst = {
          id: nextItemInstanceId(p),
          slug: e.item,
          loc: "equip:" + slot,
          tier: tier,
        };
        p.itemInstances.push(inst);
      } else {
        inst.slug = e.item;
        inst.loc = "equip:" + slot;
        if (inst.tier === undefined) inst.tier = 0;
      }
      e.instId = inst.id;
    }
    for (const cand of p.itemInstances) {
      if (!cand || typeof cand.loc !== "string" || cand.loc.indexOf("equip:") !== 0) continue;
      const slot = cand.loc.slice(6);
      const e = p.equip[slot];
      if (!e || e.instId !== cand.id) cand.loc = "bag";
    }
    syncBagCountsFromInstances(p);
    return p.itemInstances;
  }

  const usedLegacyTier = {};
  const claimLegacyTier = (slug) => {
    if (!p.forge || !p.forge[slug] || usedLegacyTier[slug]) return 0;
    usedLegacyTier[slug] = true;
    return p.forge[slug] || 0;
  };
  const createInst = (slug, loc, tier) => {
    const inst = { id: nextItemInstanceId(p), slug: slug, loc: loc, tier: tier || 0 };
    p.itemInstances.push(inst);
    return inst;
  };

  for (const slot in p.equip) {
    const e = p.equip[slot];
    if (!e || !e.item || !itemUsesInstances(e.item)) continue;
    if (e.instId && findItemInstance(p, e.instId)) continue;
    const inst = createInst(e.item, "equip:" + slot, claimLegacyTier(e.item));
    e.instId = inst.id;
  }

  const nextBag = {};
  for (const slug in p.bag) {
    const count = p.bag[slug] || 0;
    if (!count) continue;
    if (!itemUsesInstances(slug)) {
      nextBag[slug] = count;
      continue;
    }
    let tierGiven = false;
    for (let i = 0; i < count; i++) {
      const tier = (!tierGiven ? claimLegacyTier(slug) : 0);
      createInst(slug, "bag", tier);
      if (tier > 0) tierGiven = true;
    }
  }
  p.bag = nextBag;

  p.depot = p.depot.map((entry) => {
    const slug = typeof entry === "string" ? entry : ((entry && (entry.slug || entry.item)) || null);
    if (!slug || !itemUsesInstances(slug)) return slug;
    return createInst(slug, "depot", claimLegacyTier(slug)).id;
  }).filter(Boolean);

  p.exaltationBox = p.exaltationBox.map((entry) => {
    const slug = typeof entry === "string" ? entry : ((entry && (entry.slug || entry.item)) || null);
    if (!slug || !itemUsesInstances(slug)) return slug;
    return createInst(slug, "exaltationBox", claimLegacyTier(slug)).id;
  }).filter(Boolean);

  p._itemInstancesVersion = 2;
  syncBagCountsFromInstances(p);
  return p.itemInstances;
}

function bagItemInstances(p, slug) {
  ensureItemInstances(p);
  return (p.itemInstances || []).filter((inst) => inst && inst.loc === "bag" && (!slug || inst.slug === slug));
}

function takeBagItemInstance(p, slug, options) {
  ensureItemInstances(p);
  options = options || {};
  let items = bagItemInstances(p, slug);
  if (options.instId) items = items.filter((inst) => inst.id === options.instId);
  if (!items.length) return null;
  items.sort((a, b) => {
    const ta = itemInstanceTier(a), tb = itemInstanceTier(b);
    return options.highestTier ? (tb - ta) : (ta - tb);
  });
  const chosen = items[0];
  chosen.loc = null;
  syncBagCountsFromInstances(p);
  return chosen;
}

function putBagItemInstance(p, inst) {
  if (!inst) return false;
  ensureItemInstances(p);
  if (!hasBagSpace(p, inst.slug)) return false;
  inst.loc = "bag";
  syncBagCountsFromInstances(p);
  return true;
}

function deleteItemInstance(p, instId) {
  ensureItemInstances(p);
  const idx = (p.itemInstances || []).findIndex((inst) => inst && inst.id === instId);
  if (idx < 0) return false;
  p.itemInstances.splice(idx, 1);
  syncBagCountsFromInstances(p);
  return true;
}

function equipEntryInstance(p, slot, inst) {
  if (!inst) return false;
  inst.loc = "equip:" + slot;
  p.equip[slot] = { item: inst.slug, count: 1, instId: inst.id };
  syncBagCountsFromInstances(p);
  return true;
}

function takeEquippedItemInstance(p, slot) {
  ensureItemInstances(p);
  const e = p.equip && p.equip[slot];
  if (!e || !e.item || !itemUsesInstances(e.item)) return null;
  let inst = e.instId ? findItemInstance(p, e.instId) : null;
  if (!inst) {
    inst = { id: nextItemInstanceId(p), slug: e.item, loc: null, tier: (p.forge && p.forge[e.item]) || 0 };
    p.itemInstances.push(inst);
  }
  inst.loc = null;
  delete p.equip[slot];
  syncBagCountsFromInstances(p);
  return inst;
}

function bagUsedSlots(p) {
  ensureItemInstances(p);
  // Parciais chargeable + demais instâncias na bag
  let used = (p.itemInstances || []).filter((inst) => inst && inst.loc === "bag").length;
  // Stacks cheias (inclui chargeables full e consumíveis)
  used += Object.keys(p.bag || {}).filter((slug) => (p.bag[slug] || 0) > 0 && !itemUsesInstances(slug)).length;
  return used;
}

function hasBagSpace(p, slug) {
  ensureItemInstances(p);
  if (itemUsesInstances(slug)) return bagUsedSlots(p) < bagSlots(p);
  // Chargeable parcial (opts) usa instância — tratado em addItem.
  // Stack cheia: reusa o slot do tipo se já existir.
  if (isChargeStackableAccessory(slug)) return !!p.bag[slug] || bagUsedSlots(p) < bagSlots(p);
  return !!p.bag[slug] || bagUsedSlots(p) < bagSlots(p);
}

function addItem(p, slug, count, opts) {
  count = count || 1;
  opts = opts || {};
  ensureItemInstances(p);
  if (isChargeStackableAccessory(slug)) {
    const full = accessoryCatalogCharges(slug);
    let ch = opts.charges !== undefined ? Math.floor(Number(opts.charges)) : full;
    if (!Number.isFinite(ch) || ch <= 0) return false;
    if (ch > full) ch = full;
    if (ch < full) {
      // Parcial: 1 instância por unidade — NÃO empilha.
      if (bagUsedSlots(p) + count > bagSlots(p)) return false;
      for (let i = 0; i < count; i++) {
        p.itemInstances.push({
          id: nextItemInstanceId(p), slug: slug, loc: "bag", tier: 0,
          charges: ch, maxCharges: full,
        });
      }
      return true;
    }
    // Cheio: empilha na bag (1 slot por tipo).
    if (!hasBagSpace(p, slug)) return false;
    p.bag[slug] = (p.bag[slug] || 0) + count;
    return true;
  }
  if (itemUsesInstances(slug)) {
    if (bagUsedSlots(p) + count > bagSlots(p)) return false;
    for (let i = 0; i < count; i++) {
      p.itemInstances.push({ id: nextItemInstanceId(p), slug: slug, loc: "bag", tier: 0 });
    }
    syncBagCountsFromInstances(p);
    return true;
  }
  if (!hasBagSpace(p, slug)) return false;
  p.bag[slug] = (p.bag[slug] || 0) + count;
  return true;
}

function removeItem(p, slug, count) {
  count = count || 1;
  ensureItemInstances(p);
  if (itemUsesInstances(slug)) {
    if (bagItemInstances(p, slug).length < count) return false;
    for (let i = 0; i < count; i++) {
      const inst = takeBagItemInstance(p, slug, { highestTier: false });
      if (!inst) return false;
      deleteItemInstance(p, inst.id);
    }
    syncBagCountsFromInstances(p);
    return true;
  }
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

/* Moedas são convertidas direto em gold da conta, nunca ocupam a pouch */
const CURRENCY_ITEMS = {
  "gold-coin": 1,
  "platinum-coin": 100,
  "crystal-coin": 10000,
};

function currencyValue(slug) {
  return CURRENCY_ITEMS[slug] || 0;
}

/* Credita moedas no balance da conta (p.gold compartilhado). Retorna o gold gerado. */
function creditCurrency(p, slug, count) {
  const unit = currencyValue(slug);
  if (!unit || !p) return 0;
  const total = unit * Math.max(0, Math.floor(Number(count) || 0));
  if (total <= 0) return 0;
  p.gold = (Number(p.gold) || 0) + total;
  return total;
}

/* Valor unitário de loot para o analyser / profit.
 * Regra (melhor preço NPC, sem inventar):
 *  1) moedas → face value (1 / 100 / 10000)
 *  2) item.npcSell → max(buy_price) de todos os NPCs em appearances.dat
 *     (Rashid, Yasir, Djinns, Fiona, Telas, Baxter, etc. via Canary)
 *  3) creature products / misc sem slot → item.sell (SELL_VALUE / tabela idle)
 *  4) equipamento sem npcSell → 0 (sem comprador conhecido)
 */
function lootNpcUnitValue(slug) {
  const face = currencyValue(slug);
  if (face) return face;
  const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items)
    ? GAMEDATA.items[slug] : null;
  if (!it) return 0;
  const npc = Number(it.npcSell);
  if (npc > 0) return npc;
  const slot = it.s || it.slot || null;
  const equipSlot = slot && slot !== "loot";
  if (equipSlot) return 0;
  return Math.max(0, Number(it.sell) || 0);
}

function sessionLootValue(lootMap) {
  let total = 0;
  for (const slug of Object.keys(lootMap || {})) {
    const count = Math.max(0, Number(lootMap[slug]) || 0);
    if (!count) continue;
    total += lootNpcUnitValue(slug) * count;
  }
  return total;
}

/* REGRA DA CASA (a pedido do jogador): TODO item coletavel vai para a
 * loot pouch — inclusive equipamento. A mochila fica so para o que o
 * jogador compra/separa na mao; moedas viram gold na hora e supplies tem
 * contador proprio (ambos tratados antes nos caminhos de loot). */
function shouldGoLootPouch(slug) {
  const it = GAMEDATA.items[slug];
  if (!it || currencyValue(slug) || SUPPLIES[slug]) return false;
  return true;
}

// Os 50 slots são o LIMIAR visual/autoseller, não um bloqueio de coleta.
// Loot nunca pode desaparecer silenciosamente quando a pouch chega a 100%.
const LOOT_POUCH_MAX_SLOTS = 50;
function lootPouchSlotsUsed(p) {
  // 1 slot por stack (slug com quantidade > 0). A pouch guarda contagens
  // empilhadas — não multiplique por count de equipamentos, senão o HUD
  // mostra ocupação absurda (ex.: 21007/50) e o autoseller fica “travado”.
  let slots = 0;
  for (const slug of Object.keys((p && p.lootPouch) || {})) {
    const count = p.lootPouch[slug] || 0;
    if (!count || typeof GAMEDATA === "undefined" || !GAMEDATA.items[slug]) continue;
    slots += 1;
  }
  return slots;
}
function lootPouchSlotsFree(p) { return Math.max(0, LOOT_POUCH_MAX_SLOTS - lootPouchSlotsUsed(p)); }

/* Esvazia a Loot Pouch do personagem. Não mexe em ouro/moedas da conta. */
function clearLootPouch(p) {
  if (!p) return 0;
  const before = Object.keys(p.lootPouch || {}).filter((slug) => (p.lootPouch[slug] || 0) > 0).length;
  p.lootPouch = {};
  return before;
}

function addLootPouch(p, slug, count) {
  count = Math.max(1, Math.floor(Number(count) || 1));
  // Moedas nunca entram na pouch — vão direto para o balance da conta.
  if (currencyValue(slug)) {
    creditCurrency(p, slug, count);
    return true;
  }
  p.lootPouch = p.lootPouch || {};
  const weight = (typeof itemUnitWeight === "function" ? itemUnitWeight(slug) : 0.1) * count;
  if (typeof freeCapacity === "function" && weight > freeCapacity(p) + 1e-9) {
    if (typeof addLog === "function") addLog("death", typeof capacityMessage === "function" ? capacityMessage() : "You cannot carry more.");
    return false;
  }
  // Aceita overflow acima dos 50 slots. O percentual continua em 100% e o
  // autoseller tenta liberar itens vendáveis, mas classes protegidas e novos
  // drops permanecem seguros na pouch.
  p.lootPouch[slug] = (p.lootPouch[slug] || 0) + count;
  return true;
}

function isProtectedPouchClass(slug) {
  const item = typeof GAMEDATA !== "undefined" && GAMEDATA.items
    ? GAMEDATA.items[slug] : null;
  return !!(item && Number(item.cls) >= 3);
}

/** Material de imbuement (mat-*): VENDER manual ok; Sell All / autoseller não. */
function isImbueMatItem(item, slug) {
  if (item && item._imbMat != null) return true;
  return typeof slug === "string" && /^mat-/.test(slug);
}

function canSellLootPouchItem(p, slug) {
  const item = typeof GAMEDATA !== "undefined" && GAMEDATA.items
    ? GAMEDATA.items[slug] : null;
  if (!item || (typeof isNoSell === "function" && isNoSell(p, slug)) ||
      isProtectedPouchClass(slug)) return false;
  // Sell All / autoseller: nunca vender materiais de imbue (use VENDER no menu).
  if (isImbueMatItem(item, slug)) return false;
  if (typeof pouchUnitSellPrice === "function") return pouchUnitSellPrice(item) > 0;
  const npc = Number(item.npcSell);
  if (Number.isFinite(npc) && npc > 0) return true;
  const sell = Number(item.sell);
  return Number.isFinite(sell) && sell > 0;
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
  if (it.inf || (typeof weaponAmmoKind === "function" && !weaponAmmoKind(it, slug)))
    return it.atk || 0;                        // spear/star: autossuficiente

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

  // Aljava: o teste era `it.s === "quiver"`, que NUNCA e verdade -- desde
  // que a aljava passou a ocupar a mao secundaria ela tem s:"shield" e
  // t:"quiver". Com isso o bonus nunca entrava, itemScore devolvia 0 e
  // qualquer escudo caido no loot (brass shield = 96) tomava o slot do
  // paladino no meio da caçada. Era essa a causa do "quiver desequipa
  // sozinho".
  if (it.t === "quiver") {
    if (isDist) {
      // para o paladino a aljava e o que alimenta o arco: tem que vencer
      // qualquer escudo, senao ele para de atirar
      s += 400 + (it.cap || 0) * 3 + (it.dist || 0) * 20;
    } else {
      s -= 80;          // as outras vocacoes nao tem uso para ela
    }
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

/* Auto-equip mid-hunt foi removido: só equipa o que o jogador (ou Helper de
 * equipamento / stash) escolher. itemScore continua para loja/admin. Stub
 * mantido para não quebrar tools/sim legados — não veste nada. */
function autoEquip(/* p */) {
  return [];
}

/* Peso carregado para CAP: equip + bag + loot pouch + supply stash.
 * Supplies/ammo são contadores de idle (milhares de unidades) e NÃO entram
 * no peso — senão stock de potions zera a CAP e o loot some em silêncio. */
function carriedWeight(p) {
  let w = 0;
  for (const s of SLOTS) {
    const e = p.equip[s];
    if (e && GAMEDATA.items[e.item]) w += GAMEDATA.items[e.item].w || 0;
  }
  const addMap = (map) => {
    for (const slug in (map || {})) {
      const it = GAMEDATA.items[slug];
      const n = map[slug] || 0;
      if (!n) continue;
      w += (it && it.w != null ? it.w : 0.1) * n;
    }
  };
  addMap(p.bag);
  addMap(p.lootPouch);
  addMap(p.supplyStash);
  return w;
}
function freeCapacity(p) {
  const max = typeof maxStats === "function" ? maxStats(p).cap : DEFAULT_PLAYER_CAP;
  return Math.max(0, max - carriedWeight(p));
}
function capacityMessage() {
  if (typeof t === "function") {
    const msg = t("cap.full");
    if (msg && msg !== "cap.full") return msg;
  }
  return "You cannot carry more.";
}
function itemUnitWeight(slug) {
  const it = typeof GAMEDATA !== "undefined" && GAMEDATA.items ? GAMEDATA.items[slug] : null;
  const w = Number(it && it.w);
  return Number.isFinite(w) && w >= 0 ? w : 0.1;
}
