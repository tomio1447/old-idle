/*
 * combat.js — simulacao do auto-hunt: spawn, combate, loot, morte.
 * Roda em ticks de tempo real e tambem acelerado (ganhos offline).
 */
"use strict";

const TICK = 100;   // ms por tick de simulacao
const COMBAT_GRID_W = 21;
const COMBAT_GRID_H = 13;
const INFLUENCED_BASE_CHANCE = 0.005;
const INFLUENCED_PVP_BONUS = 0.005;

function displayMonsterName(name) {
  return String(name || "").replace(/^Influenced\s+/i, "");
}

function applyBossMultiplier(base, mult) {
  mult = mult || 10;
  return {
    hp: Math.floor((base.hp || 1) * mult),
    exp: Math.floor((base.exp || 0) * mult),
    damage: Math.floor((base.damage || 1) * mult),
    armor: Math.floor((base.armor || 0) * mult),
  };
}

function newCombat(player, huntId, instanceMode) {
  const hunt = GAMEDATA.hunts[huntId];
  const mode = instanceMode || player.instanceMode || "non-pvp";
  const pvp = mode === "pvp";
  return {
    huntId: huntId,
    hunt: hunt,
    instanceMode: mode,
    pvp: pvp,
    expMul: pvp ? 1.25 : 1,
    lootMul: pvp ? 1.25 : 1,
    skillMul: pvp ? 1.25 : 1,
    influencedChance: INFLUENCED_BASE_CHANCE + (pvp ? INFLUENCED_PVP_BONUS : 0),
    // RAID será feito por jogadores reais no online. Não simular NPC/Player Raider aqui.
    raidEnabled: false,
    raidCd: Infinity,
    raidMode: pvp ? "real-player" : "none",
    mobs: [],
    wave: 0,
    playerAtkCd: 0,
    spellCd: {},
    runeCd: 0,
    healCd: 0,
    regenHp: 0,
    regenMp: 0,
    buffs: {},
    player: {
      x: 0.18, y: 0.62, dir: "e", moving: false,
      frame: 0, walkT: 0, attackAnim: 0,
    },
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

function newBossCombat(player, boss) {
  const c = newCombat(player, boss.hunt || "rats", "non-pvp");
  const base = GAMEDATA.monsters[boss.baseMonster || boss.sprite || "cave-rat"];
  const mult = applyBossMultiplier(base, boss.mult || 10);
  const def = Object.assign({}, base, {
    name: boss.name,
    hp: mult.hp,
    exp: boss.exp || mult.exp,
    damage: mult.damage,
    armor: mult.armor,
    loot: boss.loot || [],
    attackSpeed: boss.attackSpeed || base.attackSpeed || 2000,
  });
  c.boss = boss;
  c.bossDefeated = false;
  c.raidEnabled = false;
  c.instanceMode = "boss";
  c.expMul = 1;
  c.lootMul = 1;
  c.skillMul = 1;
  c.mobs = [{
    slug: boss.sprite || boss.baseMonster || "cave-rat",
    def: def,
    boss: true,
    hp: def.hp,
    maxHp: def.hp,
    atkCd: 700,
    id: "boss-" + boss.id,
    x: 0.78,
    y: 0.50,
    dir: "w",
    moving: false,
    attackAnim: 0,
    speed: boss.speed || 0.000055,
    spawnAt: Date.now(),
  }];
  resolveSQMOccupancy(c);
  return c;
}

function notifyRealPlayerRaidPending(c) {
  // Placeholder: no modo online o raid será feito por outro jogador real.
  // Não cria NPC fake para representar player.
  c.events.push({ t: "raid-real-player" });
}

function spawnWave(c, p) {
  const pack = c.hunt.pack || 3;
  while (c.mobs.length < pack) {
    const slug = c.hunt.monsters[Math.floor(Math.random() * c.hunt.monsters.length)];
    const base = GAMEDATA.monsters[slug];
    if (!base) break;
    const influenced = Math.random() < (c.influencedChance || INFLUENCED_BASE_CHANCE);
    const m = Object.assign({}, base);
    m.name = displayMonsterName(base.name);
    if (influenced) {
      // Mantém somente o nome original; o destaque visual indica que é influenced.
      // 300% a mais de XP base = 4x a experiência original.
      m.hp = Math.floor(base.hp * 2);
      m.exp = Math.floor((base.exp || 0) * 4);
      m.damage = Math.floor(base.damage * 1.2);
      m.armor = Math.floor(base.armor * 1.2);
    }
    c.mobs.push({
      slug: slug, def: m,
      influenced: influenced,
      hp: m.hp, maxHp: m.hp,
      atkCd: 400 + Math.random() * 1200,
      id: Math.random().toString(36).slice(2, 8),
      x: 0.80 + Math.random() * 0.16,
      y: 0.30 + Math.random() * 0.42,
      dir: "w",
      moving: false,
      attackAnim: 0,
      speed: 0.000045 + Math.random() * 0.000025,
      spawnAt: Date.now(),
    });
  }
  resolveSQMOccupancy(c);
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

function pointDistance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function pointDistanceSQM(a, b) {
  const dx = ((a.x || 0) - (b.x || 0)) * COMBAT_GRID_W;
  const dy = ((a.y || 0) - (b.y || 0)) * COMBAT_GRID_H;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function entityCell(ent) {
  return {
    x: clamp(Math.floor((ent.x || 0) * COMBAT_GRID_W), 0, COMBAT_GRID_W - 1),
    y: clamp(Math.floor((ent.y || 0) * COMBAT_GRID_H), 0, COMBAT_GRID_H - 1),
  };
}

function cellKey(cell) { return cell.x + ":" + cell.y; }
function sameSQM(a, b) {
  const ca = entityCell(a), cb = entityCell(b);
  return ca.x === cb.x && ca.y === cb.y;
}
function cellCenter(cell) {
  return { x: (cell.x + 0.5) / COMBAT_GRID_W, y: (cell.y + 0.5) / COMBAT_GRID_H };
}
function isCellFree(cell, occupied) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= COMBAT_GRID_W || cell.y >= COMBAT_GRID_H) return false;
  return !occupied.has(cellKey(cell));
}
function nearestFreeCell(origin, occupied, prefer) {
  let best = null, bestScore = Infinity;
  for (let r = 1; r <= 4; r++) {
    for (let y = origin.y - r; y <= origin.y + r; y++) {
      for (let x = origin.x - r; x <= origin.x + r; x++) {
        const cell = { x, y };
        if (!isCellFree(cell, occupied)) continue;
        const score = Math.abs(x - origin.x) + Math.abs(y - origin.y) -
          (prefer ? ((x - origin.x) * prefer.x + (y - origin.y) * prefer.y) * 0.25 : 0);
        if (score < bestScore) { bestScore = score; best = cell; }
      }
    }
    if (best) return best;
  }
  return null;
}

function resolveSQMOccupancy(c) {
  if (!c.player) return;
  const occupied = new Set([cellKey(entityCell(c.player))]);
  for (const m of c.mobs) {
    let cell = entityCell(m);
    if (!isCellFree(cell, occupied)) {
      const pc = entityCell(c.player);
      const prefer = { x: Math.sign(cell.x - pc.x) || 1, y: Math.sign(cell.y - pc.y) || 0 };
      const free = nearestFreeCell(cell, occupied, prefer) || nearestFreeCell(pc, occupied, prefer);
      if (free) {
        const p = cellCenter(free);
        m.x = p.x; m.y = p.y;
        cell = free;
      }
    }
    occupied.add(cellKey(cell));
  }
}

function playerAttackRange(p) {
  const d = playerDamage(p);
  if (d.type === "distance") return 0.58;
  if (d.type === "magic") return 0.52;
  return 0.145;
}

/* Palavras magicas faladas ao conjurar: usa o proprio id da spell
 * ("exura-gran" -> "exura gran"). */
function spellWords(id, s) {
  if (id && typeof id === "string") return id.replace(/-/g, " ");
  return (s && s.name ? s.name : "").toLowerCase();
}

function spellRange() { return 0.60; }
function runeRange() { return 0.62; }

/* Alcance de ataque do monstro.
 * O Tibia separa quem luta em melee de quem usa magia/distancia — isso NAO
 * depende do elemento: bear e snake batem corpo-a-corpo, mesmo a snake
 * causando veneno. A flag `ranged` no gamedata manda; o resto e melee. */
function monsterAttackRange(m) {
  const def = m.def || {};
  if (def.ranged) return def.ranged === 2 ? 0.34 : 0.26;
  return 0.115;
}

function faceDir(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "e" : "w";
  return dy >= 0 ? "s" : "n";
}

function movePoint(ent, target, speed, dt, stopRange) {
  const d = pointDistance(ent, target);
  ent.moving = false;
  if (d <= stopRange || d <= 0.001) return d;
  const step = Math.min(d - stopRange, speed * dt);
  ent.x += ((target.x - ent.x) / d) * step;
  ent.y += ((target.y - ent.y) / d) * step;
  ent.x = clamp(ent.x, 0.08, 0.96);
  ent.y = clamp(ent.y, 0.22, 0.78);
  // o passo é sempre na direção do destino, então esta é a direção da caminhada
  ent.dir = faceDir(ent, target);
  ent.moving = true;
  ent.walkT = (ent.walkT || 0) + dt;
  // alterna só entre os dois frames de passo (0 é a pose parada)
  ent.frame = 1 + (Math.floor(ent.walkT / 170) % 2);
  return pointDistance(ent, target);
}

function updateCombatMovement(c, p, dt) {
  if (!c.player) return;
  const pl = c.player;
  pl.attackAnim = Math.max(0, (pl.attackAnim || 0) - dt);
  pl.moving = false;
  if (!c.mobs.length) return;

  const target = c.mobs[0];
  const desired = playerAttackRange(p);
  const cur = pointDistance(pl, target);
  const playerSpeed = 0.000070 + Math.min(0.000035, gearStats(p).speed * 0.0000012);

  const mode = p.config.attackMode || "chase";
  if (mode !== "stand") {
    if (mode === "kiting" && desired >= 0.2) {
      const kiteSQM = clamp(parseInt(p.config.kiteDistance, 10) || 3, 1, 5);
      const curSQM = pointDistanceSQM(pl, target);
      const kiteStopNorm = kiteSQM / COMBAT_GRID_W;
      if (curSQM < kiteSQM) {
        const away = { x: clamp(pl.x - (target.x - pl.x) * 1.35, 0.08, 0.40),
                       y: clamp(pl.y - (target.y - pl.y) * 0.65, 0.25, 0.75) };
        movePoint(pl, away, playerSpeed * 1.18, dt, 0.02);
      } else if (curSQM > kiteSQM + 0.8) {
        movePoint(pl, target, playerSpeed, dt, Math.max(0.02, kiteStopNorm));
      }
    } else if (desired < 0.2) {
      movePoint(pl, target, playerSpeed, dt, desired * 0.82);
    } else {
      if (cur > desired * 0.92) movePoint(pl, target, playerSpeed, dt, desired * 0.82);
      else if (cur < 0.22) {
        const away = { x: clamp(pl.x - (target.x - pl.x), 0.08, 0.36),
                       y: clamp(pl.y - (target.y - pl.y) * 0.35, 0.25, 0.75) };
        movePoint(pl, away, playerSpeed, dt, 0.02);
      }
    }
  }
  // Andando, o sprite olha para onde caminha (movePoint já definiu a direção);
  // parado, encara o alvo. Sem isso o personagem fugia de costas no kiting.
  if (!pl.moving) pl.dir = faceDir(pl, target);

  c.mobs.forEach((m, i) => {
    m.attackAnim = Math.max(0, (m.attackAnim || 0) - dt);
    const range = monsterAttackRange(m);
    const laneTarget = {
      x: pl.x + 0.012 * Math.min(i, 3),
      y: clamp(pl.y + (i - (c.mobs.length - 1) / 2) * 0.055, 0.26, 0.76),
    };
    movePoint(m, laneTarget, m.speed || 0.00005, dt, range * 0.90);
    if (!m.moving) m.dir = faceDir(m, pl);
  });
  resolveSQMOccupancy(c);
}

function combatSkillGain(c, amount) {
  return (amount || 1) * (c.skillMul || 1);
}
function combatManaSkillGain(c, mana) {
  return mana * (c.skillMul || 1);
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
    if (!spendGold(p, cost)) return false;
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

/* Preco de 1 unidade de municao */
function ammoPrice(slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return 0;
  return it.buy || it.sell || 0;
}

/* Consome 1 unidade de munição do contador.
 * Se o contador zerar, compra a próxima unidade no ato descontando do gold.
 * Sem gold, o ataque não sai e o personagem fica exposto. */
function consumeAmmoCharge(c, p) {
  // armas com munição infinita (spear) nunca gastam carga
  const wp = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  if (wp && wp.inf) return true;
  const ammo = p.equip.ammo;
  if (!ammo || !ammo.item) return true;
  const slug = ammo.item;
  const it = GAMEDATA.items[slug];
  if (!it || it.s !== "ammo") return true;

  if (ammoCount(p, slug) <= 0) {
    // sem estoque: compra 1 unidade no uso
    const cost = ammoPrice(slug);
    if (cost <= 0 || !spendGold(p, cost)) {
      if (c && c.events) c.events.push({ t: "no-ammo", name: it.n });
      ammo.count = 0;
      return false;
    }
    addAmmo(p, slug, 1);
    if (c && c.stats) {
      c.stats.supplyCost += cost;
      c.stats.supplyBought = c.stats.supplyBought || {};
      c.stats.supplyBought[slug] = (c.stats.supplyBought[slug] || 0) + 1;
    }
    if (c && c.events) c.events.push({ t: "ammo-buy", name: it.n, cost: cost });
  }

  removeAmmo(p, slug, 1);
  if (c && c.stats)
    c.stats.supplyUsed[slug] = (c.stats.supplyUsed[slug] || 0) + 1;
  return true;
}

/* ---------------------------------------------------------- condicoes
 * Veneno em turnos, como no Tibia: a cada turno o alvo perde HP fixo.
 * Reaplicar renova a duracao e mantem o maior dano por turno. */
const POISON_TURN_MS = 2000;

function applyPoison(mob, dmg, turns) {
  if (!mob || mob.hp <= 0) return;
  const cur = mob.poison;
  if (cur) {
    cur.dmg = Math.max(cur.dmg, dmg);
    cur.turns = Math.max(cur.turns, turns);
  } else {
    mob.poison = { dmg: dmg, turns: turns, acc: 0 };
  }
}

/* Aplica o dano de veneno de todos os monstros envenenados */
function tickPoison(c, p, dt) {
  for (const m of c.mobs) {
    const po = m.poison;
    if (!po || m.hp <= 0) continue;
    po.acc += dt;
    while (po.acc >= POISON_TURN_MS && po.turns > 0 && m.hp > 0) {
      po.acc -= POISON_TURN_MS;
      po.turns--;
      const dmg = Math.max(1, po.dmg);
      m.hp -= dmg;
      c.stats.damage += dmg;
      c.events.push({ t: "hit", dmg: dmg, x: m.x, y: m.y,
                      screen: true, el: "earth", poison: true });
    }
    if (po.turns <= 0) delete m.poison;
  }
}

/* Municao ativa (null quando a arma nao usa municao) */
function activeAmmoItem(p) {
  const wp = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  if (!wp || wp.t !== "distance" || wp.inf) return null;
  const a = p.equip.ammo;
  if (!a || !a.item) return null;
  const it = GAMEDATA.items[a.item];
  return it && it.s === "ammo" ? it : null;
}

/* Missile (projetil) que cada municao/elemento usa, pelos nomes do
 * CONST_ANI_* do Canary. */
const AMMO_MISSILE = {
  "arrow": "arrow", "bolt": "bolt", "poison-arrow": "poison-arrow",
  "burst-arrow": "burst-arrow", "power-bolt": "power-bolt",
  "infernal-bolt": "infernal-bolt", "spear": "spear",
  "royal-spear": "royal-spear", "hunting-spear": "hunting-spear",
};

const ELEMENT_MISSILE = {
  fire: "fire", energy: "energy", earth: "earth", ice: "ice",
  death: "death", holy: "holy", physical: "small-stone",
};

/* Escolhe o sprite de projetil de um ataque a distancia do jogador. */
function playerMissile(p, element) {
  const wp = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  if (wp && wp.inf && AMMO_MISSILE[p.equip.weapon.item])
    return AMMO_MISSILE[p.equip.weapon.item];      // spear arremessada
  const a = p.equip.ammo;
  if (a && a.item && AMMO_MISSILE[a.item]) return AMMO_MISSILE[a.item];
  return ELEMENT_MISSILE[element] || "arrow";
}

/* Projetil de um monstro que ataca a distancia. Arqueiros atiram flecha,
 * casters cospem o elemento e o resto arremessa pedra. */
function monsterMissile(mob) {
  const def = mob.def || {};
  if (!def.ranged) return null;
  const slug = mob.slug || "";
  if (/archer|scout|spearman|hunter/.test(slug))
    return slug.indexOf("spearman") !== -1 ? "spear" : "arrow";
  if (/goblin/.test(slug)) return "small-stone";
  return ELEMENT_MISSILE[def.element] || "small-stone";
}

/* Aplica a resistencia elemental do monstro (dados do Canary).
 * percent > 0 = toma MENOS dano; negativo = fraqueza. 100 = imune. */
function applyResist(mob, element, dano) {
  const r = mob.def && mob.def.resist;
  if (!r || !element) return dano;
  const pc = r[element];
  if (!pc) return dano;
  const escala = Math.max(0, 1 - pc / 100);
  return Math.max(pc >= 100 ? 0 : 1, Math.floor(dano * escala));
}

/* Executa um ataque do jogador no alvo */
function playerAttack(c, p, target) {
  const d = playerDamage(p);
  const isMagic = d.type === "magic";
  const isDist = d.type === "distance";
  const pos = c.player || { x: 0.18, y: 0.62 };
  if (pointDistance(pos, target) > playerAttackRange(p)) {
    c.events.push({ t: "range", x: target.x, y: target.y, screen: true });
    return false;
  }

  // Distância usa cargas de ammo. Se acabou, compra 1 carga no uso;
  // se não houver gold, o ataque não sai.
  if (isDist && !consumeAmmoCharge(c, p)) {
    c.events.push({ t: "miss", x: target.x, y: target.y, reason: "ammo" });
    return 0;
  }

  const ammo = isDist ? activeAmmoItem(p) : null;

  // chance de errar para distancia. Burst arrow explode de qualquer jeito:
  // no Tibia ela nunca "erra", a explosao acontece onde a flecha cai.
  if (isDist && !(ammo && ammo.noMiss) &&
      Math.random() > hitChance(effSkill(p, "dist"))) {
    c.events.push({ t: "miss", x: target.x, y: target.y });
    addSkillTries(p, "dist", combatSkillGain(c, 1));
    return 0;
  }

  const element = ammo && ammo.el ? ammo.el : d.element;
  const rollDamage = () => {
    let v = d.min + Math.random() * (d.max - d.min);
    if (!isMagic) {
      const red = Math.min(v * 0.55,
                           target.def.armor * (0.3 + Math.random() * 0.4));
      v -= red;
    }
    return applyResist(target, element, Math.max(1, Math.floor(v)));
  };

  let raw = rollDamage();

  // ---- imbuements do 15.x
  const imb = typeof imbTotals === "function" ? imbTotals(p) : null;
  let critou = false;
  if (imb) {
    if (imb.crit && Math.random() < 0.10) {        // 10% de chance de critico
      raw = Math.floor(raw * (1 + imb.crit / 100));
      critou = true;
    }
    if (imb.lifeLeech) {
      const max = maxStats(p);
      const cura = Math.max(1, Math.floor(raw * imb.lifeLeech / 100));
      p.hp = Math.min(max.hp, p.hp + cura);
    }
    if (imb.manaLeech) {
      const max = maxStats(p);
      const mana = Math.max(1, Math.floor(raw * imb.manaLeech / 100));
      p.mp = Math.min(max.mp, p.mp + mana);
    }
  }

  target.hp -= raw;
  c.stats.damage += raw;
  if (c.player) c.player.attackAnim = 180;
  c.events.push({ t: "hit", dmg: raw, x: target.x, y: target.y,
                  sx: pos.x, sy: pos.y, screen: true,
                  projectile: isDist || isMagic, el: element, crit: critou,
                  missile: isDist ? playerMissile(p, element)
                                  : (isMagic ? (ELEMENT_MISSILE[element] || "energy") : null) });

  // Cleave (15.x): certas armas atingem alvos adjacentes por 50% do dano
  const wpItem = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  if (wpItem && wpItem.cleave && !isDist && !isMagic) {
    const R = 0.16;
    for (const m of c.mobs) {
      if (m === target || m.hp <= 0) continue;
      if (pointDistance(m, target) > R) continue;
      const corte = Math.max(1, Math.floor(rollDamage() * 0.5));
      m.hp -= corte;
      c.stats.damage += corte;
      c.events.push({ t: "hit", dmg: corte, x: m.x, y: m.y,
                      screen: true, el: element });
    }
    c.events.push({ t: "cleave", x: target.x, y: target.y });
  }

  if (ammo) {
    // poison arrow: envenena o alvo por alguns turnos
    if (ammo.poison) {
      applyPoison(target, ammo.poison.dmg, ammo.poison.turns);
      c.events.push({ t: "poisoned", x: target.x, y: target.y,
                      name: target.def.name });
    }
    // burst arrow: explode em area 3x3 ao redor do alvo
    if (ammo.area) {
      const R = 0.13 * (ammo.area + 0.5);      // raio equivalente a 3x3 SQM
      c.events.push({ t: "burst", x: target.x, y: target.y });
      for (const m of c.mobs) {
        if (m === target || m.hp <= 0) continue;
        if (pointDistance(m, target) > R) continue;
        const splash = Math.max(1, Math.floor(rollDamage() * 0.75));
        m.hp -= splash;
        c.stats.damage += splash;
        c.events.push({ t: "hit", dmg: splash, x: m.x, y: m.y,
                        screen: true, el: element });
      }
    }
  }

  // ganho de skill
  if (isMagic) {
    // magia sobe ML pelo gasto de mana (feito no cast)
  } else if (isDist) {
    addSkillTries(p, "dist", combatSkillGain(c, 1));
  } else {
    addSkillTries(p, weaponSkill(p), combatSkillGain(c, 1));
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
  if (c.player && pointDistance(c.player, target) > spellRange()) return false;
  // helper shooter: magia selecionada ou a mais forte disponível
  let selected = null;
  if (p.config.shooterType === "spell" && p.config.shooterSpell)
    selected = avail.find((a) => a[0] === p.config.shooterSpell);
  if (!selected) {
    if (p.config.shooterType === "rune") return false;
    avail.sort((a, b) => b[1].power - a[1].power);
    selected = avail[0];
  }
  const [id, s] = selected;

  p.mp -= s.mana;
  addManaSpent(p, combatManaSkillGain(c, s.mana));
  c.spellCd[id] = now + s.cd;

  const ml = effMagic(p);
  const base = (p.level / 5 + ml * 1.8) * s.power;
  const targets = s.area ? c.mobs.slice(0, 4) : [target];
  for (const t of targets) {
    let dmg = Math.floor(base * (0.7 + Math.random() * 0.6));
    if (VOCATIONS[p.voc].weapon !== "magic") dmg = Math.floor(dmg * 0.55);
    dmg = applyResist(t, s.element || "energy", dmg);
    t.hp -= dmg;
    c.stats.damage += dmg;
    c.events.push({ t: "hit", dmg: dmg, x: t.x, y: t.y,
                    sx: c.player ? c.player.x : 0.18,
                    sy: c.player ? c.player.y : 0.62,
                    screen: true, projectile: true,
                    el: s.element || "energy", spell: s.name,
                    missile: ELEMENT_MISSILE[s.element] || "energy" });
  }
  if (c.player) c.player.attackAnim = 220;
  c.events.push({ t: "cast", name: s.name, area: !!s.area,
                  x: target.x, y: target.y, screen: true });
  c.events.push({ t: "say", text: spellWords(id, s) });
  return true;
}

/* Usa runa de ataque se configurado */
function tryUseRune(c, p, target, now) {
  if (!p.config.useRunes) return false;
  if (c.runeCd > now) return false;
  if (c.player && pointDistance(c.player, target) > runeRange()) return false;
  let best = null;
  if (p.config.shooterType === "rune" && p.config.shooterRune) {
    const s = SUPPLIES[p.config.shooterRune];
    if (s && s.type === "attack") {
      if (!Object.prototype.hasOwnProperty.call(p.supplies, p.config.shooterRune))
        p.supplies[p.config.shooterRune] = 0;
      if (canRechargeSupply(p, p.config.shooterRune)) best = p.config.shooterRune;
    }
  } else if (p.config.shooterType !== "spell") {
    for (const slug in p.supplies) {
      const s = SUPPLIES[slug];
      if (!s || s.type !== "attack" || !canRechargeSupply(p, slug)) continue;
      if (!best || s.tier > SUPPLIES[best].tier) best = slug;
    }
  }
  if (!best) return false;
  const s = SUPPLIES[best];
  if (!consumeSupplyCharge(c, p, best)) return false;
  c.runeCd = now + 2000;

  const pw = supplyPower(s, p.level);
  const dmg = applyResist(target, s.element,
                          Math.floor(pw[0] + Math.random() * (pw[1] - pw[0])));
  target.hp -= dmg;
  c.stats.damage += dmg;
  if (c.player) c.player.attackAnim = 180;
  c.events.push({ t: "hit", dmg: dmg, x: target.x, y: target.y,
                  sx: c.player ? c.player.x : 0.18,
                  sy: c.player ? c.player.y : 0.62,
                  screen: true, projectile: true,
                  el: s.element, rune: s.name,
                  missile: s.tier >= 4 ? "sudden-death"
                                       : (ELEMENT_MISSILE[s.element] || "energy") });
  c.events.push({ t: "say", text: s.name.toLowerCase(), supply: true });
  return true;
}

/* Cura: spell primeiro, depois runa/pocao */
function tryHeal(c, p, now) {
  const max = maxStats(p);
  const pct = (p.hp / max.hp) * 100;
  const spellAt = p.config.healSpellAt === undefined ? (p.config.healAt || 90) : p.config.healSpellAt;
  const itemAt = p.config.healItemAt === undefined ? (p.config.healAt || 90) : p.config.healItemAt;
  if (pct > Math.max(spellAt, itemAt)) return false;
  if (c.healCd > now) return false;

  // 1. magia de cura: usa apenas se o HP estiver no limite configurado para spell.
  if (pct <= spellAt) {
    const heals = [];
    const selectedHealSpell = p.config.healSpell;
    if (selectedHealSpell) {
      const s = SPELLS[selectedHealSpell];
      if (s && s.type === "heal" && s.vocs.indexOf(p.voc) !== -1 &&
          p.level >= s.lvl && p.mp >= s.mana) heals.push([selectedHealSpell, s]);
    } else {
      for (const id in SPELLS) {
        const s = SPELLS[id];
        if (s.type !== "heal") continue;
        if (s.vocs.indexOf(p.voc) === -1) continue;
        if (p.level < s.lvl || p.mp < s.mana) continue;
        heals.push([id, s]);
      }
    }
    if (heals.length) {
      if (!selectedHealSpell) heals.sort((a, b) => b[1].power - a[1].power);
      const [, s] = heals[0];
      const ml = effMagic(p);
      const amount = Math.floor((p.level / 5 + ml * 2.0) * s.power *
                                (0.85 + Math.random() * 0.3));
      p.mp -= s.mana;
      addManaSpent(p, combatManaSkillGain(c, s.mana));
      p.hp = Math.min(max.hp, p.hp + amount);
      c.healCd = now + 1000;
      c.events.push({ t: "heal", amount: amount, spell: s.name });
      c.events.push({ t: "say", text: spellWords(selectedHealSpell || heals[0][0], s) });
      return true;
    }
  }
  // 2. item/runa/potion de cura: usa apenas se HP estiver no limite de item.
  if (p.config.useRunes && pct <= itemAt) {
    let best = null;
    const selectedHealSupply = p.config.healSupply;
    if (selectedHealSupply) {
      const s = SUPPLIES[selectedHealSupply];
      if (s && s.type === "heal" && canRechargeSupply(p, selectedHealSupply))
        best = selectedHealSupply;
    } else {
      for (const slug in p.supplies) {
        const s = SUPPLIES[slug];
        if (!s || s.type !== "heal" || !canRechargeSupply(p, slug)) continue;
        if (!best || s.tier > SUPPLIES[best].tier) best = slug;
      }
    }
    if (best) {
      const s = SUPPLIES[best];
      if (!consumeSupplyCharge(c, p, best)) return false;
      const pw = supplyPower(s, p.level);
      const amount = Math.floor(pw[0] + Math.random() * (pw[1] - pw[0]));
      p.hp = Math.min(max.hp, p.hp + amount);
      c.healCd = now + 1000;
      c.events.push({ t: "heal", amount: amount, rune: s.name });
      c.events.push({ t: "say", text: s.name.toLowerCase(), supply: true });
      return true;
    }
  }
  return false;
}

/* Existe alguma forma de cura disponivel agora? (spell com mana ou runa) */
function canHeal(c, p) {
  if (p.config.healSpell) {
    const s = SPELLS[p.config.healSpell];
    if (s && s.type === "heal" && s.vocs.indexOf(p.voc) !== -1 &&
        p.level >= s.lvl && p.mp >= s.mana) return true;
  } else {
    for (const id in SPELLS) {
      const s = SPELLS[id];
      if (s.type !== "heal") continue;
      if (s.vocs.indexOf(p.voc) === -1) continue;
      if (p.level >= s.lvl && p.mp >= s.mana) return true;
    }
  }
  if (p.config.useRunes) {
    if (p.config.healSupply) {
      const s = SUPPLIES[p.config.healSupply];
      if (s && s.type === "heal" && canRechargeSupply(p, p.config.healSupply)) return true;
    } else {
      for (const slug in p.supplies) {
        const s = SUPPLIES[slug];
        if (s && s.type === "heal" && canRechargeSupply(p, slug)) return true;
      }
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
  const manaAt = (p.config.manaAt === undefined ? 50 : p.config.manaAt) / 100;
  if (p.mp > max.mp * manaAt) return false;
  if (p.config.manaSupply === "") return false;
  const candidates = [];
  if (p.config.manaSupply) candidates.push(p.config.manaSupply);
  else for (const slug in p.supplies) candidates.push(slug);
  for (const slug of candidates) {
    const s = SUPPLIES[slug];
    if (!s || s.type !== "mana" || !canRechargeSupply(p, slug)) continue;
    if (!consumeSupplyCharge(c, p, slug)) continue;
    const amount = Math.floor(s.mana[0] + Math.random() * (s.mana[1] - s.mana[0]));
    p.mp = Math.min(max.mp, p.mp + amount);
    c.events.push({ t: "mana", amount: amount });
    c.events.push({ t: "say", text: s.name.toLowerCase(), supply: true });
    return true;
  }
  return false;
}

/* Monstro ataca o jogador */
function mobAttack(c, p, mob) {
  const pl = c.player || { x: 0.18, y: 0.62 };
  if (pointDistance(pl, mob) > monsterAttackRange(mob)) return false;
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

  mob.attackAnim = 180;
  if (raw <= 0) {
    c.events.push({ t: "block", x: pl.x, y: pl.y, sx: mob.x, sy: mob.y,
                    screen: true, projectile: monsterAttackRange(mob) > 0.16,
                    missile: monsterMissile(mob) });
    addSkillTries(p, "shield", combatSkillGain(c, 1));
    return 0;
  }
  p.hp -= raw;
  // protecao elemental vinda dos imbuements
  if (typeof imbProtection === "function") {
    const prot = imbProtection(p, mob.def.element);
    if (prot > 0) raw = Math.max(1, Math.floor(raw * (1 - prot / 100)));
  }
  c.stats.taken += raw;
  addSkillTries(p, "shield", combatSkillGain(c, 1));
  c.events.push({ t: "taken", dmg: raw, el: mob.def.element,
                  x: pl.x, y: pl.y, sx: mob.x, sy: mob.y,
                  screen: true, projectile: monsterAttackRange(mob) > 0.16,
                  missile: monsterMissile(mob) });
  return raw;
}

/* Gera o loot de um monstro morto */
function rollLoot(c, p, mob) {
  const got = [];
  for (const l of mob.def.loot) {
    if (Math.random() * 100 > l.chance) continue;
    let count = l.max > 1 ? 1 + Math.floor(Math.random() * l.max) : 1;
    if (mob.influenced) count *= 2;
    else if ((c.lootMul || 1) > 1) {
      const boosted = count * c.lootMul;
      count = Math.max(1, Math.floor(boosted) + (Math.random() < boosted % 1 ? 1 : 0));
    }
    const it = GAMEDATA.items[l.item];
    if (!it) continue;
    if (!mob.boss && isNoCollect(p, l.item)) continue;
    // filtro de loot
    if (p.config.lootFilter === "valuable" && (it.sell || 0) < 20 &&
        l.item !== "gold-coin") continue;
    if (p.config.lootFilter === "equip" && !it.s && l.item !== "gold-coin")
      continue;
    if (l.item === "gold-coin") {
      const g = Math.floor(count * goldStage(c.hunt.level));
      p.gold += g;
      c.stats.gold += g;
    } else if (currencyValue(l.item)) {
      // platinum/crystal coin: vendidos na hora e somados ao balance
      const g = creditCurrency(p, l.item, count);
      c.stats.gold += g;
      c.stats.loot[l.item] = (c.stats.loot[l.item] || 0) + count;
      got.push({ item: l.item, count: count });
      continue;
    } else if (mob.boss) {
      addLootPouch(p, l.item, count);
    } else if (SUPPLIES[l.item]) {
      p.supplies[l.item] = (p.supplies[l.item] || 0) + count;
    } else if (it.s === "ammo") {
      // munição lootada vai para o contador, sem ocupar slot
      addAmmo(p, l.item, count);
    } else if (shouldGoLootPouch(l.item)) {
      addLootPouch(p, l.item, count);
    } else if (!addItem(p, l.item, count)) {
      if (!c.bagFullWarned) {
        c.events.push({ t: "bag-full" });
        c.bagFullWarned = true;
      }
      continue;
    }
    c.stats.loot[l.item] = (c.stats.loot[l.item] || 0) + count;
    got.push({ item: l.item, count: count });
  }
  if (mob.influenced && !isNoCollect(p, "mystic-dust")) {
    const dust = 1 + Math.floor(Math.random() * 4);
    addLootPouch(p, "mystic-dust", dust);
    c.stats.loot["mystic-dust"] = (c.stats.loot["mystic-dust"] || 0) + dust;
    got.push({ item: "mystic-dust", count: dust });
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
  spendGold(p, lostGold);
  const max = maxStats(p);
  p.hp = max.hp; p.mp = max.mp;
  if (c.player) {
    c.player.x = 0.18; c.player.y = 0.62;
    c.player.dir = "e"; c.player.moving = false;
  }
  c.mobs = [];
  c.dead = true;
  c.deadUntil = Date.now() + (c.boss ? 2500 : 10000);   // boss volta mais rápido para a cidade
  c.events.push({ t: "death", exp: lostExp, gold: lostGold, blessed: blessed });
  return { exp: lostExp, gold: lostGold };
}

/* --------------------------------------------------- tick principal */

function combatTick(c, p, dt, now) {
  c.stats.time += dt;
  p.playtime += dt;

  // stamina: gasta 1s por segundo caçando
  p.stamina = Math.max(0, p.stamina - dt / 1000);

  if (c.dead) return;

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
  if (!c.mobs.length) {
    if (c.boss) return;
    spawnWave(c, p);
  }
  if (c.raidEnabled) {
    c.raidCd -= dt;
    if (c.raidCd <= 0) {
      notifyRealPlayerRaidPending(c);
      c.raidCd = 60000 + Math.random() * 90000;
    }
  }

  // movimentação: player aproxima/kita e monstros procuram distância de ataque
  updateCombatMovement(c, p, dt);

  // veneno das poison arrows continua drenando o alvo entre os golpes
  tickPoison(c, p, dt);

  // cura e mana
  tryHeal(c, p, now);
  tryMana(c, p);

  // Sem recuo automático: se ficar sem cura, o HP zera e o personagem morre,
  // voltando ao templo/cidade pelo fluxo normal de morte.

  // ataque do jogador
  c.playerAtkCd -= dt;
  if (c.playerAtkCd <= 0 && c.mobs.length) {
    const target = c.mobs[0];
    let acted = false;
    // prioridade: runa > spell > arma, respeitando alcance
    acted = tryUseRune(c, p, target, now) ||
             tryCastSpell(c, p, target, now) ||
             !!playerAttack(c, p, target);
    c.playerAtkCd = acted ? attackInterval(c, p) : 250;
  }

  // monstros atacam
  for (const m of c.mobs) {
    m.atkCd -= dt;
    if (m.atkCd <= 0) {
      const acted = mobAttack(c, p, m);
      m.atkCd = acted === false ? 300 : (m.def.attackSpeed || 2000);
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
    const exp = Math.floor(m.def.exp * staminaMul * expStage(p.level) * (c.expMul || 1));
    addExp(p, exp);
    c.stats.exp += exp;
    c.stats.kills++;
    p.totalKills++;
    p.kills[m.slug] = (p.kills[m.slug] || 0) + 1;
    if (m.boss) c.bossDefeated = true;
    const loot = rollLoot(c, p, m);
    c.events.push({ t: "kill", mob: m.slug, name: displayMonsterName(m.def.name),
                    exp: exp, loot: loot, x: m.x, y: m.y, screen: true });
  }
  c.mobs = alive;

  // auto sell / equip periodicos sao chamados pelo game loop
}
