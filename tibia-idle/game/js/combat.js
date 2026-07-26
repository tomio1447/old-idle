/*
 * combat.js — simulacao do auto-hunt: spawn, combate, loot, morte.
 * Roda em ticks de tempo real e tambem acelerado (ganhos offline).
 */
"use strict";

const TICK = 100;   // ms por tick de simulacao

function newCombat(player, huntId) {
  const hunt = GAMEDATA.hunts[huntId];
  return {
    huntId: huntId,
    hunt: hunt,
    mobs: [],
    wave: 0,
    playerAtkCd: 0,
    spellCd: {},
    runeCd: 0,
    healCd: 0,
    regenHp: 0,
    regenMp: 0,
    buffs: {},
    stats: {
      startedAt: Date.now(), kills: 0, exp: 0, gold: 0, damage: 0,
      taken: 0, deaths: 0, loot: {}, supplyUsed: {}, supplyCost: 0,
      time: 0,
    },
    events: [],       // eventos visuais para a UI
    dead: false,
    deadUntil: 0,
  };
}

function spawnWave(c, p) {
  const pack = c.hunt.pack || 3;
  while (c.mobs.length < pack) {
    const slug = c.hunt.monsters[Math.floor(Math.random() * c.hunt.monsters.length)];
    const m = GAMEDATA.monsters[slug];
    if (!m) break;
    c.mobs.push({
      slug: slug, def: m,
      hp: m.hp, maxHp: m.hp,
      atkCd: 400 + Math.random() * 1200,
      id: Math.random().toString(36).slice(2, 8),
      x: 0.15 + Math.random() * 0.7,
      y: 0.25 + Math.random() * 0.5,
      spawnAt: Date.now(),
    });
  }
  c.wave++;
}

/* Velocidade de ataque do jogador em ms */
function attackInterval(c, p) {
  let base = 2000;
  const g = gearStats(p);
  if (c.buffs.haste && c.buffs.haste > 0) base *= 0.8;
  base -= Math.min(400, g.speed * 4);
  return Math.max(800, base);
}

function hasSelectedSupply(p, slug) {
  return !!p.supplies && Object.prototype.hasOwnProperty.call(p.supplies, slug);
}

function canRechargeSupply(p, slug) {
  const s = SUPPLIES[slug];
  if (!s || (s.lvl || 1) > p.level) return false;
  if ((p.supplies[slug] || 0) > 0) return true;
  return hasSelectedSupply(p, slug) && p.gold >= supplyPrice(s, p.level);
}

/*
 * Consome 1 carga de runa/potion. Se a carga selecionada chegou a 0,
 * compra exatamente a próxima carga no momento do uso, descontando do gold.
 * Assim não existe mais restock periódico secando o saldo do jogador.
 */
function consumeSupplyCharge(c, p, slug) {
  const s = SUPPLIES[slug];
  if (!s || !hasSelectedSupply(p, slug) || (s.lvl || 1) > p.level) return false;

  if ((p.supplies[slug] || 0) <= 0) {
    const cost = supplyPrice(s, p.level);
    if (p.gold < cost) return false;
    p.gold -= cost;
    p.supplies[slug] = 1;
    if (c && c.stats) {
      c.stats.supplyCost += cost;
      c.stats.supplyBought = c.stats.supplyBought || {};
      c.stats.supplyBought[slug] = (c.stats.supplyBought[slug] || 0) + 1;
    }
    if (c && c.events)
      c.events.push({ t: "supply-buy", name: s.name, cost: cost });
  }

  p.supplies[slug] = Math.max(0, (p.supplies[slug] || 0) - 1);
  if (c && c.stats) {
    c.stats.supplyUsed[slug] = (c.stats.supplyUsed[slug] || 0) + 1;
  }
  return true;
}

function ammoPrice(slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return 0;
  return it.buy || Math.max(1, Math.floor((it.sell || 0) * 0.02));
}

/* Consome 1 carga de ammo. Ao zerar, compra a próxima carga no uso. */
function consumeAmmoCharge(c, p) {
  const ammo = p.equip.ammo;
  if (!ammo || !ammo.item) return true;
  const slug = ammo.item;
  const it = GAMEDATA.items[slug];
  if (!it || it.s !== "ammo") return true;

  if ((p.bag[slug] || 0) <= 0) {
    const cost = ammoPrice(slug);
    if (cost <= 0 || p.gold < cost) {
      if (c && c.events) c.events.push({ t: "no-ammo", name: it.n });
      ammo.count = 0;
      return false;
    }
    p.gold -= cost;
    p.bag[slug] = 1;
    if (c && c.stats) {
      c.stats.supplyCost += cost;
      c.stats.supplyBought = c.stats.supplyBought || {};
      c.stats.supplyBought[slug] = (c.stats.supplyBought[slug] || 0) + 1;
    }
    if (c && c.events)
      c.events.push({ t: "ammo-buy", name: it.n, cost: cost });
  }

  p.bag[slug] = Math.max(0, (p.bag[slug] || 0) - 1);
  ammo.count = p.bag[slug];
  if (c && c.stats)
    c.stats.supplyUsed[slug] = (c.stats.supplyUsed[slug] || 0) + 1;
  return true;
}

/* Executa um ataque do jogador no alvo */
function playerAttack(c, p, target) {
  const d = playerDamage(p);
  const isMagic = d.type === "magic";
  const isDist = d.type === "distance";

  // Distância usa cargas de ammo. Se acabou, compra 1 carga no uso;
  // se não houver gold, o ataque não sai.
  if (isDist && !consumeAmmoCharge(c, p)) {
    c.events.push({ t: "miss", x: target.x, y: target.y, reason: "ammo" });
    return 0;
  }

  // chance de errar para distancia
  if (isDist && Math.random() > hitChance(effSkill(p, "dist"))) {
    c.events.push({ t: "miss", x: target.x, y: target.y });
    addSkillTries(p, "dist", 1);
    return 0;
  }

  let raw = d.min + Math.random() * (d.max - d.min);
  // armadura do monstro reduz o dano fisico, mas nunca zera o golpe:
  // a reducao e limitada a 55% para nao travar melee em bicho blindado
  if (!isMagic) {
    const red = Math.min(raw * 0.55,
                         target.def.armor * (0.3 + Math.random() * 0.4));
    raw -= red;
  }
  raw = Math.max(1, Math.floor(raw));

  target.hp -= raw;
  c.stats.damage += raw;
  c.events.push({ t: "hit", dmg: raw, x: target.x, y: target.y,
                  el: d.element, crit: false });

  // ganho de skill
  if (isMagic) {
    // magia sobe ML pelo gasto de mana (feito no cast)
  } else if (isDist) {
    addSkillTries(p, "dist", 1);
  } else {
    addSkillTries(p, weaponSkill(p), 1);
  }
  return raw;
}

/* Tenta lancar uma spell ofensiva */
function tryCastSpell(c, p, target, now) {
  if (!p.config.spellAttack) return false;
  const avail = [];
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if (s.type !== "attack") continue;
    if (s.vocs.indexOf(p.voc) === -1) continue;
    if (p.level < s.lvl) continue;
    if (p.mp < s.mana) continue;
    if ((c.spellCd[id] || 0) > now) continue;
    avail.push([id, s]);
  }
  if (!avail.length) return false;
  // usa a mais forte disponivel
  avail.sort((a, b) => b[1].power - a[1].power);
  const [id, s] = avail[0];

  p.mp -= s.mana;
  addManaSpent(p, s.mana);
  c.spellCd[id] = now + s.cd;

  const ml = effMagic(p);
  const base = (p.level / 5 + ml * 1.8) * s.power;
  const targets = s.area ? c.mobs.slice(0, 4) : [target];
  for (const t of targets) {
    let dmg = Math.floor(base * (0.7 + Math.random() * 0.6));
    if (VOCATIONS[p.voc].weapon !== "magic") dmg = Math.floor(dmg * 0.55);
    t.hp -= dmg;
    c.stats.damage += dmg;
    c.events.push({ t: "hit", dmg: dmg, x: t.x, y: t.y,
                    el: s.element || "energy", spell: s.name });
  }
  c.events.push({ t: "cast", name: s.name, area: !!s.area });
  return true;
}

/* Usa runa de ataque se configurado */
function tryUseRune(c, p, target, now) {
  if (!p.config.useRunes) return false;
  if (c.runeCd > now) return false;
  let best = null;
  for (const slug in p.supplies) {
    const s = SUPPLIES[slug];
    if (!s || s.type !== "attack" || !canRechargeSupply(p, slug)) continue;
    if (!best || s.tier > SUPPLIES[best].tier) best = slug;
  }
  if (!best) return false;
  const s = SUPPLIES[best];
  if (!consumeSupplyCharge(c, p, best)) return false;
  c.runeCd = now + 2000;

  const pw = supplyPower(s, p.level);
  const dmg = Math.floor(pw[0] + Math.random() * (pw[1] - pw[0]));
  target.hp -= dmg;
  c.stats.damage += dmg;
  c.events.push({ t: "hit", dmg: dmg, x: target.x, y: target.y,
                  el: s.element, rune: s.name });
  return true;
}

/* Cura: spell primeiro, depois runa/pocao */
function tryHeal(c, p, now) {
  const max = maxStats(p);
  const pct = (p.hp / max.hp) * 100;
  if (pct > p.config.healAt) return false;
  if (c.healCd > now) return false;

  // 1. spell de cura
  const heals = [];
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if (s.type !== "heal") continue;
    if (s.vocs.indexOf(p.voc) === -1) continue;
    if (p.level < s.lvl || p.mp < s.mana) continue;
    heals.push([id, s]);
  }
  if (heals.length) {
    heals.sort((a, b) => b[1].power - a[1].power);
    const [, s] = heals[0];
    const ml = effMagic(p);
    const amount = Math.floor((p.level / 5 + ml * 2.0) * s.power *
                              (0.85 + Math.random() * 0.3));
    p.mp -= s.mana;
    addManaSpent(p, s.mana);
    p.hp = Math.min(max.hp, p.hp + amount);
    c.healCd = now + 1000;
    c.events.push({ t: "heal", amount: amount, spell: s.name });
    return true;
  }
  // 2. runa de cura
  if (p.config.useRunes) {
    let best = null;
    for (const slug in p.supplies) {
      const s = SUPPLIES[slug];
      if (!s || s.type !== "heal" || !canRechargeSupply(p, slug)) continue;
      if (!best || s.tier > SUPPLIES[best].tier) best = slug;
    }
    if (best) {
      const s = SUPPLIES[best];
      if (!consumeSupplyCharge(c, p, best)) return false;
      const pw = supplyPower(s, p.level);
      const amount = Math.floor(pw[0] + Math.random() * (pw[1] - pw[0]));
      p.hp = Math.min(max.hp, p.hp + amount);
      c.healCd = now + 1000;
      c.events.push({ t: "heal", amount: amount, rune: s.name });
      return true;
    }
  }
  return false;
}

/* Existe alguma forma de cura disponivel agora? (spell com mana ou runa) */
function canHeal(c, p) {
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if (s.type !== "heal") continue;
    if (s.vocs.indexOf(p.voc) === -1) continue;
    if (p.level >= s.lvl && p.mp >= s.mana) return true;
  }
  if (p.config.useRunes) {
    for (const slug in p.supplies) {
      const s = SUPPLIES[slug];
      if (s && s.type === "heal" && canRechargeSupply(p, slug)) return true;
    }
  }
  return false;
}

/*
 * Legado: antes havia restock automático a cada 15s, que gastava o gold sem
 * ação direta do jogador. Agora supplies usam cargas: só desconta gold quando
 * uma carga selecionada chega a 0 e precisa ser usada novamente.
 */
function autoRestock() {
  return 0;
}

/* Repoe mana com cogumelos */
function tryMana(c, p) {
  const max = maxStats(p);
  if (p.mp > max.mp * 0.35) return false;
  for (const slug in p.supplies) {
    const s = SUPPLIES[slug];
    if (!s || s.type !== "mana" || !canRechargeSupply(p, slug)) continue;
    if (!consumeSupplyCharge(c, p, slug)) continue;
    const amount = Math.floor(s.mana[0] + Math.random() * (s.mana[1] - s.mana[0]));
    p.mp = Math.min(max.mp, p.mp + amount);
    c.events.push({ t: "mana", amount: amount });
    return true;
  }
  return false;
}

/* Monstro ataca o jogador */
function mobAttack(c, p, mob) {
  const def = playerDefense(p);
  let raw = mob.def.damage * (0.6 + Math.random() * 0.8);
  raw = mitigate(raw, def.armor, def.defense, def.shielding);
  raw = raw * (1 - Math.min(0.7, def.protection / 100));
  raw = Math.max(0, Math.floor(raw));

  if (c.buffs.shield && c.buffs.shield > 0) {
    const absorbed = Math.min(raw, c.buffs.shield);
    c.buffs.shield -= absorbed;
    raw -= absorbed;
  }

  if (raw <= 0) {
    c.events.push({ t: "block" });
    addSkillTries(p, "shield", 1);
    return 0;
  }
  p.hp -= raw;
  c.stats.taken += raw;
  addSkillTries(p, "shield", 1);
  c.events.push({ t: "taken", dmg: raw, el: mob.def.element });
  return raw;
}

/* Gera o loot de um monstro morto */
function rollLoot(c, p, mob) {
  const got = [];
  for (const l of mob.def.loot) {
    if (Math.random() * 100 > l.chance) continue;
    const count = l.max > 1 ? 1 + Math.floor(Math.random() * l.max) : 1;
    const it = GAMEDATA.items[l.item];
    if (!it) continue;
    // filtro de loot
    if (p.config.lootFilter === "valuable" && (it.sell || 0) < 20 &&
        l.item !== "gold-coin") continue;
    if (p.config.lootFilter === "equip" && !it.s && l.item !== "gold-coin")
      continue;
    if (l.item === "gold-coin") {
      const g = Math.floor(count * goldStage(c.hunt.level));
      p.gold += g;
      c.stats.gold += g;
    } else {
      addItem(p, l.item, count);
    }
    c.stats.loot[l.item] = (c.stats.loot[l.item] || 0) + count;
    got.push({ item: l.item, count: count });
  }
  return got;
}

/* Morte do jogador: perde exp, skills e volta ao templo */
function playerDeath(c, p) {
  p.deaths++;
  c.stats.deaths++;
  // a bencao do templo reduz muito a perda e e consumida na morte
  const blessed = !!p.blessed;
  const expRate = blessed ? 0.015 : 0.07;
  const goldRate = blessed ? 0.02 : 0.1;
  if (blessed) p.blessed = false;
  const lostExp = Math.floor(p.exp * expRate);
  p.exp = Math.max(0, p.exp - lostExp);
  while (p.level > 1 && p.exp < expForLevel(p.level)) p.level--;
  const lostGold = Math.floor(p.gold * goldRate);
  p.gold -= lostGold;
  const max = maxStats(p);
  p.hp = max.hp; p.mp = max.mp;
  c.mobs = [];
  c.dead = true;
  c.deadUntil = Date.now() + 10000;   // 10s para voltar
  c.events.push({ t: "death", exp: lostExp, gold: lostGold, blessed: blessed });
  return { exp: lostExp, gold: lostGold };
}

/* --------------------------------------------------- tick principal */

function combatTick(c, p, dt, now) {
  c.stats.time += dt;
  p.playtime += dt;

  // stamina: gasta 1s por segundo caçando
  p.stamina = Math.max(0, p.stamina - dt / 1000);

  if (c.dead) {
    if (now >= c.deadUntil) { c.dead = false; spawnWave(c, p); }
    return;
  }

  const max = maxStats(p);
  const g = gearStats(p);

  // regeneracao natural
  const rr = regenRate(p.voc, g.hpreg > 0);
  c.regenHp += dt;
  c.regenMp += dt;
  const hpEvery = Math.max(1000, (rr.hp * 1000) / (1 + g.hpreg * 0.4));
  const mpEvery = Math.max(800, (rr.mp * 1000) / (1 + g.mpreg * 0.4));
  while (c.regenHp >= hpEvery) {
    c.regenHp -= hpEvery;
    p.hp = Math.min(max.hp, p.hp + 1 + Math.floor(p.level / 20));
  }
  while (c.regenMp >= mpEvery) {
    c.regenMp -= mpEvery;
    p.mp = Math.min(max.mp, p.mp + 2 + Math.floor(p.level / 15));
  }

  // buffs decaem
  if (c.buffs.haste > 0) c.buffs.haste -= dt;

  // spawn
  if (!c.mobs.length) spawnWave(c, p);

  // cura e mana
  tryHeal(c, p, now);
  tryMana(c, p);

  // ---- recuo: sem cura e com pouca vida, sai da hunt em vez de morrer
  if (c.retreating) {
    c.retreatT -= dt;
    p.hp = Math.min(max.hp, p.hp + max.hp * (dt / 12000));
    p.mp = Math.min(max.mp, p.mp + max.mp * (dt / 10000));
    if (c.retreatT <= 0 && p.hp >= max.hp * 0.92) {
      c.retreating = false;
      c.events.push({ t: "resume" });
      spawnWave(c, p);
    }
    return;
  }
  if (p.config.autoRetreat && p.hp < max.hp * 0.3 && !canHeal(c, p)) {
    c.retreating = true;
    c.retreatT = 8000;
    c.mobs = [];
    c.stats.retreats = (c.stats.retreats || 0) + 1;
    c.events.push({ t: "retreat" });
    return;
  }

  // ataque do jogador
  c.playerAtkCd -= dt;
  if (c.playerAtkCd <= 0 && c.mobs.length) {
    const target = c.mobs[0];
    // prioridade: runa > spell > arma
    if (!tryUseRune(c, p, target, now)) {
      if (!tryCastSpell(c, p, target, now)) {
        playerAttack(c, p, target);
      }
    }
    c.playerAtkCd = attackInterval(c, p);
  }

  // monstros atacam
  for (const m of c.mobs) {
    m.atkCd -= dt;
    if (m.atkCd <= 0) {
      mobAttack(c, p, m);
      m.atkCd = m.def.attackSpeed || 2000;
    }
  }

  // morte do jogador
  if (p.hp <= 0) { playerDeath(c, p); return; }

  // monstros mortos
  const alive = [];
  for (const m of c.mobs) {
    if (m.hp > 0) { alive.push(m); continue; }
    // recompensa
    const staminaMul = p.stamina > 39 * 3600 ? 1.5 : p.stamina > 0 ? 1.0 : 0.5;
    const exp = Math.floor(m.def.exp * staminaMul * expStage(p.level));
    addExp(p, exp);
    c.stats.exp += exp;
    c.stats.kills++;
    p.totalKills++;
    p.kills[m.slug] = (p.kills[m.slug] || 0) + 1;
    const loot = rollLoot(c, p, m);
    c.events.push({ t: "kill", mob: m.slug, name: m.def.name,
                    exp: exp, loot: loot, x: m.x, y: m.y });
  }
  c.mobs = alive;

  // auto sell / equip periodicos sao chamados pelo game loop
}
