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
      // celula inicial: canto esquerdo da arena. x/y sao derivados dela e
      // servem so para o render -- a verdade e (cx, cy).
      cx: 3, cy: 6,
      x: (3 + 0.5) / 21, y: (6 + 0.5) / 13, dir: "e", moving: false,
      frame: 0, walkT: 0, attackAnim: 0, speedPts: 110,
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
  // Coloca cada monstro numa CELULA livre. Antes o spawn era em float
  // aleatorio e o resolveSQMOccupancy empurrava depois quem colidisse -- o
  // que deixava bichos empilhados no primeiro frame.
  if (typeof placeFree === "function") {
    if (c.player) ensureCell(c.player);
    const occ = buildOccupancy(c, null);
    for (const m of c.mobs) {
      if (m.cx !== undefined) continue;
      // nascem pela direita da arena, como na cena antiga
      const cx = Math.floor(GRID_W * 0.72) + Math.floor(Math.random() * 5);
      const cy = 2 + Math.floor(Math.random() * (GRID_H - 4));
      placeFree(m, occ, Math.min(GRID_W - 1, cx), cy);
      m.speedPts = typeof monsterSpeedPts === "function" ? monsterSpeedPts(m) : 100;
    }
  } else {
    resolveSQMOccupancy(c);
  }
  c.wave++;
}

/* Velocidade de ataque do jogador em ms */
function attackInterval(c, p) {
  let base = 2000;
  const g = gearStats(p);
  // `c` pode vir vazio quando a Cyclopedia consulta a velocidade fora de
  // uma cacada; sem a guarda isso quebrava a aba de combate
  const bf = c && c.buffs;
  if (bf && bf.haste && bf.haste > 0) base *= 0.8;
  base -= Math.min(400, g.speed * 4);
  return Math.max(800, base);
}

/* Distancia em SQM com fallback para o modo antigo.
 * Enquanto houver entidade sem celula (cena de treino, testes antigos), a
 * conta de tela continua valendo. */
function sqmDist(a, b) {
  if (typeof sqmDistance === "function" &&
      a && b && a.cx !== undefined && b.cx !== undefined) {
    return sqmDistance(a, b);
  }
  const dx = ((a.x || 0) - (b.x || 0)) * COMBAT_GRID_W;
  const dy = ((a.y || 0) - (b.y || 0)) * COMBAT_GRID_H;
  return Math.max(Math.abs(dx), Math.abs(dy));
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
  // no treino nada e cobrado nem consumido: o dummy da academia serve para
  // subir skill, nao para gastar o estoque de runa e potion do jogador
  if (c && c.training) return true;

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
  return it.shotCost || it.buy || it.sell || 0;
}

function ammoCompatibleWithWeapon(ammo, weapon) {
  if (!ammo || !weapon) return false;
  const wid = weapon.item || "";
  const kind = ammo.ammoKind || (ammo.n && ammo.n.indexOf("bolt") !== -1 ? "bolt" : "arrow");
  if (kind === "bolt") return wid === "crossbow" || /crossbow/.test(wid);
  return wid === "bow" || (/bow/.test(wid) && !/crossbow/.test(wid));
}

/* Consome 1 unidade de munição do contador.
 * Se o contador zerar, compra a próxima unidade no ato descontando do gold.
 * Sem gold, o ataque não sai e o personagem fica exposto. */
function consumeAmmoCharge(c, p) {
  // modo treino: bater no dummy da academia nao gasta nem compra municao,
  // igual ao exercise weapon do servidor, que so consome cargas do proprio
  // exercise. Sem isso treinar distance drenava o gold do jogador.
  if (c && c.training) return true;
  // armas com munição infinita (spear) nunca gastam gold
  const weapon = p.equip.weapon || null;
  const wp = weapon ? GAMEDATA.items[weapon.item] : null;
  if (wp && wp.inf) return true;
  if (!equippedQuiver(p)) {
    if (c && c.events) c.events.push({ t: "no-ammo", name: "quiver" });
    return false;
  }
  const ammo = p.equip.ammo;
  if (!ammo || !ammo.item) {
    if (c && c.events) c.events.push({ t: "no-ammo", name: "munição" });
    return false;
  }
  const slug = ammo.item;
  const it = GAMEDATA.items[slug];
  if (!it || it.s !== "ammo" || !ammoCompatibleWithWeapon(it, weapon)) {
    if (c && c.events) c.events.push({ t: "no-ammo", name: it ? it.n : "munição" });
    return false;
  }
  if ((it.lvl || 1) > p.level) {
    if (c && c.events) c.events.push({ t: "no-ammo", name: it.n + " requer nível " + it.lvl });
    return false;
  }
  const cost = ammoPrice(slug);
  if (cost <= 0 || !spendGold(p, cost)) {
    if (c && c.events) c.events.push({ t: "no-ammo", name: it.n });
    return false;
  }
  ammo.count = Infinity;
  if (c && c.stats) {
    c.stats.supplyCost += cost;
    c.stats.supplyUsed[slug] = (c.stats.supplyUsed[slug] || 0) + 1;
  }
  return true;
}

/* ---------------------------------------------------------- condicoes
 * Conditions do Tibia 15.x (CONDITION_* do Canary). Cada uma tira HP por
 * turno enquanto durar, com o elemento e o efeito visual proprios.
 * As cures (exana pox/flam/vis/kor/mort) removem a condition
 * correspondente.
 */
const CONDITION_TURN_MS = 2000;

const CONDITIONS = {
  poison:  { nome: "Envenenado",   el: "earth",  fx: "hit-by-poison",
             cor: "#8ac83c", cure: "exana-pox" },
  fire:    { nome: "Queimando",    el: "fire",   fx: "hit-by-fire",
             cor: "#ff8a3c", cure: "exana-flam" },
  energy:  { nome: "Eletrificado", el: "energy", fx: "energy-damage",
             cor: "#c07cff", cure: "exana-vis" },
  bleed:   { nome: "Sangrando",    el: "physical", fx: "draw-blood",
             cor: "#d84040", cure: "exana-kor" },
  cursed:  { nome: "Amaldiçoado",  el: "death",  fx: "mort-area",
             cor: "#8a5aa8", cure: "exana-mort" },
  // congelamento nao tem exana proprio no Tibia: passa com o tempo
  freezing:{ nome: "Congelado",    el: "ice",    fx: "ice-attack",
             cor: "#7ec8ff", cure: null },
};

/* Aplica (ou renova) uma condition num alvo — monstro ou jogador. */
function applyCondition(alvo, tipo, dmg, turns) {
  if (!alvo || !CONDITIONS[tipo]) return;
  if (alvo.hp !== undefined && alvo.hp <= 0) return;
  alvo.conditions = alvo.conditions || {};
  const cur = alvo.conditions[tipo];
  if (cur) {
    // reaplicar mantem o pior dano e a maior duracao, como no servidor
    cur.dmg = Math.max(cur.dmg, dmg);
    cur.turns = Math.max(cur.turns, turns);
  } else {
    alvo.conditions[tipo] = { dmg: dmg, turns: turns, acc: 0 };
  }
}

/* compatibilidade: veneno continua tendo atalho proprio */
function applyPoison(mob, dmg, turns) {
  applyCondition(mob, "poison", dmg, turns);
}

function hasCondition(alvo, tipo) {
  return !!(alvo && alvo.conditions && alvo.conditions[tipo]);
}

function clearCondition(alvo, tipo) {
  if (alvo && alvo.conditions && alvo.conditions[tipo]) {
    delete alvo.conditions[tipo];
    return true;
  }
  return false;
}

function conditionList(alvo) {
  if (!alvo || !alvo.conditions) return [];
  return Object.keys(alvo.conditions);
}

/* Drena o HP de todas as conditions ativas nos monstros e no jogador. */
function tickConditions(c, p, dt) {
  // --- monstros
  for (const m of c.mobs) {
    if (m.hp <= 0 || !m.conditions) continue;
    for (const tipo of Object.keys(m.conditions)) {
      const co = m.conditions[tipo];
      const def = CONDITIONS[tipo];
      co.acc += dt;
      while (co.acc >= CONDITION_TURN_MS && co.turns > 0 && m.hp > 0) {
        co.acc -= CONDITION_TURN_MS;
        co.turns--;
        const dmg = Math.max(1, co.dmg);
        m.hp -= dmg;
        c.stats.damage += dmg;
        c.events.push({ t: "hit", dmg: dmg, x: m.x, y: m.y,
                        screen: true, el: def.el, condition: tipo });
      }
      if (co.turns <= 0) delete m.conditions[tipo];
    }
  }
  // --- jogador
  if (p.conditions) {
    for (const tipo of Object.keys(p.conditions)) {
      const co = p.conditions[tipo];
      const def = CONDITIONS[tipo];
      co.acc += dt;
      while (co.acc >= CONDITION_TURN_MS && co.turns > 0 && p.hp > 0) {
        co.acc -= CONDITION_TURN_MS;
        co.turns--;
        const dmg = Math.max(1, co.dmg);
        p.hp -= dmg;
        c.stats.taken += dmg;
        c.events.push({ t: "taken", dmg: dmg, el: def.el, condition: tipo,
                        x: c.player ? c.player.x : 0.13,
                        y: c.player ? c.player.y : 0.6, screen: true });
      }
      if (co.turns <= 0) delete p.conditions[tipo];
    }
    if (p.hp <= 0) playerDeath(c, p);
  }
}

/* compatibilidade com o nome antigo */
function tickPoison(c, p, dt) { tickConditions(c, p, dt); }

/* O monstro aplica a condition dele ao acertar (dados do Canary). */
function applyMonsterCondition(c, p, mob) {
  const def = mob.def || {};
  // veneno vem do campo `poison` importado do Canary
  if (def.poison) {
    applyCondition(p, "poison", def.poison.dmg, def.poison.turns);
    c.events.push({ t: "player-condition", tipo: "poison" });
    return;
  }
  // demais elementos tem chance de aplicar a condition correspondente
  const porElemento = { fire: "fire", energy: "energy", ice: "freezing",
                        death: "cursed" };
  const tipo = porElemento[def.element];
  if (!tipo) return;
  if (Math.random() > 0.18) return;             // 18% de chance
  const dano = Math.max(1, Math.round((def.damage || 10) * 0.08));
  applyCondition(p, tipo, dano, 4);
  c.events.push({ t: "player-condition", tipo: tipo });
}

/* Municao ativa (null quando a arma nao usa municao) */
function activeAmmoItem(p) {
  const wp = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  if (!wp || wp.t !== "distance" || wp.inf || !equippedQuiver(p)) return null;
  const a = p.equip.ammo;
  if (!a || !a.item) return null;
  const it = GAMEDATA.items[a.item];
  return it && it.s === "ammo" ? it : null;
}

/* Missile (projetil) que cada municao/elemento usa, pelos nomes do
 * CONST_ANI_* do Canary. */
const AMMO_MISSILE = {
  "arrow": "arrow", "simple-arrow": "arrow", "flash-arrow": "arrow",
  "shiver-arrow": "arrow", "flaming-arrow": "arrow", "earth-arrow": "arrow",
  "envenomed-arrow": "poison-arrow", "sniper-arrow": "arrow", "tarsal-arrow": "arrow",
  "diamond-arrow": "arrow", "onyx-arrow": "arrow", "crystalline-arrow": "arrow",
  "poison-arrow": "poison-arrow", "burst-arrow": "burst-arrow",
  "bolt": "bolt", "piercing-bolt": "bolt", "vortex-bolt": "bolt",
  "power-bolt": "power-bolt", "drill-bolt": "bolt", "prismatic-bolt": "bolt",
  "infernal-bolt": "infernal-bolt", "spectral-bolt": "bolt",
  "spear": "spear", "royal-spear": "royal-spear", "hunting-spear": "hunting-spear",
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

/* Bonus de dano dos charms da Cyclopedia, por elemento.
 * Aplicado ANTES da resistencia, como no servidor: o charm aumenta o golpe
 * e o monstro resiste ao total. */
function applyCharmDamage(p, element, dano) {
  if (typeof charmTotals !== "function") return dano;
  const t = charmTotals(p);
  const pc = t.dano[element] || 0;
  if (!pc) return dano;
  return Math.floor(dano * (1 + pc / 100));
}

/* Executa um ataque do jogador no alvo */
function playerAttack(c, p, target) {
  const d = playerDamage(p);
  const isMagic = d.type === "magic";
  const isDist = d.type === "distance";
  const pos = c.player || { x: 0.18, y: 0.62 };
  // Alcance em SQM (Chebyshev), nao em fracao de tela. Antes "1 SQM" valia
  // distancias diferentes no eixo X e no Y, porque a grade e 21x13.
  if (typeof sqmDistance === "function" && c.player && c.player.cx !== undefined
      && target.cx !== undefined
      ? sqmDistance(c.player, target) > playerRangeSQM(p)
      : pointDistance(pos, target) > playerAttackRange(p)) {
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

  // Perfect shot do quiver: quando o alvo esta EXATAMENTE na distancia que o
  // quiver configura, o tiro ganha dano fixo e nao pode errar. E a regra de
  // src/items/weapons/weapons.cpp, onde chance vira 100 se damageX/Y != 0.
  // Fora dessa distancia exata nao ha bonus nenhum.
  let perfeito = 0;
  if (isDist && c.player) {
    const eq = equippedQuiver(p);
    const q = eq ? GAMEDATA.items[eq.item] : null;
    if (q && q.shotDmg) {
      // distancia real em SQM (Chebyshev). Antes era uma divisao por 0.085
      // que so acertava no eixo X: a grade e 21x13, entao o mesmo valor de
      // tela valia SQMs diferentes na horizontal e na vertical.
      const sqm = (typeof sqmDistance === "function" && c.player.cx !== undefined
                   && target.cx !== undefined)
        ? sqmDistance(c.player, target)
        : Math.round(pointDistance(c.player, target) / 0.085);
      if (sqm === q.shotRange) perfeito = q.shotDmg;
    }
  }

  // chance de errar para distancia. Burst arrow explode de qualquer jeito:
  // no Tibia ela nunca "erra", a explosao acontece onde a flecha cai.
  // Perfect shot tambem ignora a rolagem de acerto.
  if (isDist && !perfeito && !(ammo && ammo.noMiss) &&
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
    // charm da Cyclopedia aumenta o golpe antes da resistencia do monstro
    v = applyCharmDamage(p, element, Math.max(1, Math.floor(v)));
    return applyResist(target, element, Math.max(1, v));
  };

  let raw = rollDamage();
  // dano extra do perfect shot, somado depois da resistencia
  if (perfeito) raw += perfeito;

  // ---- Monk: o mantra vira dano no golpe de punho (perk Ascetic /
  // santuarios da quest). So no auto-ataque corpo a corpo, como no
  // combat.cpp: o servidor testa damage.origin == ORIGIN_FIST.
  if (!isDist && !isMagic && typeof mantraAtaqueBonus === "function") {
    const extra = mantraAtaqueBonus(p, c);
    if (extra > 0) raw += extra;
  }

  // ---- buffs de vocacao (Virtudes, Protector)
  const bf = typeof buffTotals === "function" ? buffTotals(p) : null;
  if (bf) {
    if (bf.dmgDealt !== 1) raw = Math.max(1, Math.floor(raw * bf.dmgDealt));
    if (bf.lifeOnHit) {
      const mx = maxStats(p);
      p.hp = Math.min(mx.hp, p.hp + Math.max(1, Math.floor(raw * bf.lifeOnHit)));
    }
    if (bf.manaOnHit) {
      const mx = maxStats(p);
      p.mp = Math.min(mx.mp, p.mp + Math.max(1, Math.floor(raw * bf.manaOnHit)));
    }
  }

  // ---- charms defensivos/utilitarios da Cyclopedia
  const ch = typeof charmTotals === "function" ? charmTotals(p) : null;
  if (ch && ch.vampirismo) {
    const mx = maxStats(p);
    p.hp = Math.min(mx.hp, p.hp + Math.max(1,
      Math.floor(raw * ch.vampirismo / 100)));
  }

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
    for (const m of c.mobs) {
      if (m === target || m.hp <= 0) continue;
      if (sqmDist(m, target) > 1) continue;   // so os 8 tiles vizinhos
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
      const R = ammo.area;                     // raio em SQM (3x3 = raio 1)
      c.events.push({ t: "burst", x: target.x, y: target.y });
      for (const m of c.mobs) {
        if (m === target || m.hp <= 0) continue;
        if (sqmDist(m, target) > R) continue;
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

/* Tenta lancar uma spell ofensiva.
 *
 * O dano vem de spellValues() (js/spells.js), que aplica a formula real do
 * canary para aquela magia. Antes o dano era `power * (level/5 + ml*1.8)`,
 * um numero inventado igual para todas — por isso Exori Con e Exevo Mas San
 * batiam quase o mesmo. Agora Exori Con usa skill de distance e Exevo Mas San
 * usa magic level, como no servidor.
 *
 * A magia usada e a que o jogador marcou no Helper (multiseleção: ele pode
 * marcar varias e o motor usa a de maior dano fora de cooldown). */
function tryCastSpell(c, p, target, now) {
  if (!p.config.spellAttack) return false;

  // Barra de COMBO: quando o jogador montou uma rotacao, ela manda em tudo.
  // A ordem dos slots e a prioridade e cada slot pode exigir um numero
  // minimo de alvos, entao a escolha ja considera o tamanho do pack.
  if (typeof comboAtivo === "function" && comboAtivo(p)) {
    const escolha = comboEscolhe(c, p, target, now);
    if (!escolha) return false;
    // o slot escolhido pode ser uma RUNA: nesse caso o disparo sai por
    // tryUseRune, que sabe cobrar carga e desenhar o projetil da runa
    if (escolha.kind === "rune") {
      return tryUseRune(c, p, target, now, escolha.id);
    }
    return castSpellById(c, p, target, now, escolha.id);
  }

  const escolhidas = p.config.attackSpells;   // lista marcada no Helper
  const usaLista = Array.isArray(escolhidas) && escolhidas.length > 0;

  const avail = [];
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if (s.type !== "attack") continue;
    if (s.vocs.indexOf(p.voc) === -1) continue;
    if (p.level < s.lvl) continue;
    if (s.ml && effMagic(p) < s.ml) continue;
    if (p.mp < s.mana) continue;
    // cooldown proprio da magia E do grupo dela, como no servidor
    if (!cdReady(p, id, now)) continue;
    // magia que exige arma (exori, exori min...) nao sai de maos vazias
    if (s.needWeapon && !(p.equip && p.equip.weapon)) continue;
    if (usaLista && escolhidas.indexOf(id) === -1) continue;
    avail.push([id, s]);
  }
  if (!avail.length) return false;
  // Alcance: 5 SQM e o padrao de magia. A checagem por magia especifica
  // acontece depois de escolher qual sera lancada -- aqui so descarta o caso
  // de o alvo estar longe de QUALQUER magia.
  if (c.player && c.player.cx !== undefined && target.cx !== undefined
      && typeof sqmDistance === "function") {
    if (sqmDistance(c.player, target) > 7) return false;
  } else if (c.player && pointDistance(c.player, target) > spellRange()) return false;
  // compatibilidade com a config antiga de shooter unico
  let selected = null;
  if (!usaLista && p.config.shooterType === "spell" && p.config.shooterSpell)
    selected = avail.find((a) => a[0] === p.config.shooterSpell);
  if (!selected) {
    if (!usaLista && p.config.shooterType === "rune") return false;
    // escolhe pelo dano estimado NESTE personagem, nao por um peso fixo
    avail.sort((a, b) => spellValues(p, b[1]).max - spellValues(p, a[1]).max);
    selected = avail[0];
  }
  const [id] = selected;
  return castSpellById(c, p, target, now, id);
}

/* Lanca UMA magia especifica, ja escolhida.
 *
 * Separado de tryCastSpell porque agora existem dois caminhos de escolha: a
 * barra de combo (ordem do jogador) e a selecao automatica antiga. O que
 * acontece DEPOIS de escolher e identico, entao mora aqui. */
function castSpellById(c, p, target, now, id) {
  const s = SPELLS[id];
  if (!s) return false;

  // agora que a magia esta escolhida, o alcance dela e que manda.
  // MONKSPELLS traz o spell:range() do .lua (Mystic Repulse alcanca 7).
  if (c.player && c.player.cx !== undefined && target.cx !== undefined
      && typeof sqmDistance === "function") {
    const md0 = (typeof MONKSPELLS !== "undefined") ? MONKSPELLS[id] : null;
    const alc = (md0 && md0.range) ? Math.min(7, md0.range)
              : (s.range && s.range > 1 ? Math.min(7, s.range) : 5);
    // Magia selfTarget explode em volta de QUEM LANCA, entao a distancia
    // ate o alvo nao a impede: o Divine Caldera de um paladino cercado sai
    // mesmo com o alvo apontado longe. Exigir alcance aqui simplesmente
    // engolia a magia (retornava false sem gastar mana nem avisar).
    const ehSelf = (typeof SPELLTARGET !== "undefined" && SPELLTARGET[id])
      ? !!SPELLTARGET[id].self : false;
    if (!ehSelf && sqmDistance(c.player, target) > alc) return false;
  }

  p.mp -= s.mana;
  addManaSpent(p, combatManaSkillGain(c, s.mana));
  cdStart(p, id, s, now);
  c.spellCd[id] = now + s.cd;   // mantido: testes antigos leem esse mapa

  // Alvos e elemento.
  //
  // Monk tem regras proprias em tres pontos e por isso desvia daqui:
  //   * a lista de alvos sai de monkSpellTargets(), que sabe fazer CHAIN
  //     (saltar para o vizinho mais proximo) alem de area;
  //   * o elemento vem do Elemental Bond da arma, que SUBSTITUI o tipo de
  //     dano declarado no script;
  //   * o efeito visual muda de cor conforme esse bond.
  const md = (typeof MONKSPELLS !== "undefined") ? MONKSPELLS[id] : null;
  const usaMonk = md && typeof monkSpellTargets === "function";

  let targets;
  // matriz real da area (o leque do sweeping, a onda, o feixe). Quando a
  // matriz existe ela manda: o raio circular so vale de fallback.
  const nomeArea = typeof areaNameOf === "function" ? areaNameOf("spell", id) : null;
  const porMatriz = nomeArea && typeof areaMobs === "function"
    ? areaMobs(c, nomeArea, c.player, target, id) : null;
  if (porMatriz) {
    // Numa magia selfTarget quem manda e a MATRIZ, nada mais: o Divine
    // Caldera explode em volta do conjurador e nao tem por que acertar um
    // alvo apontado a 10 SQM. Forcar o alvo aqui (como se fazia para
    // corrigir arredondamento de direcao) fazia a magia bater em quem
    // estava visivelmente fora do circulo.
    const soMatriz = (typeof SPELLTARGET !== "undefined" && SPELLTARGET[id])
      ? !!SPELLTARGET[id].self : false;
    if (soMatriz) {
      targets = porMatriz;
    } else {
      targets = porMatriz.indexOf(target) === -1
        ? [target].concat(porMatriz) : porMatriz;
    }
  } else if (usaMonk) {
    targets = monkSpellTargets(p, id, c, target);
  } else {
    const nAlvos = typeof spellTargets === "function" ? spellTargets(s) : (s.area ? 4 : 1);
    targets = nAlvos > 1 ? c.mobs.slice(0, nAlvos) : [target];
  }

  let elemento = s.element || "energy";
  if (typeof monkSpellElement === "function") {
    elemento = monkSpellElement(p, s, elemento);
  }
  const fxMagia = (md && md.fx && typeof monkFx === "function")
    ? monkFx(p, md.fx) : null;
  // celulas cobertas pela area: o efeito visual precisa aparecer em TODAS,
  // nao so onde havia monstro. Era esse o bug de "a magia so pinta o alvo".
  const areaTiles = nomeArea && typeof areaCells === "function"
    ? areaCells(nomeArea, c.player, target, id) : [];

  // Ciclo builder/spender do Monk. O spender precisa LER a harmonia antes de
  // gastar, senao o bonus sairia sempre 1x: gastaHarmony() zera o contador e
  // devolve quanto havia, e o multiplicador e calculado com esse valor.
  let monkMult = 1;
  const kind = typeof monkSpellKind === "function" ? monkSpellKind(id) : null;
  if (kind === "spender") {
    monkMult = harmonyBonus(p, c);
    const gastou = gastaHarmony(p, c);
    if (gastou > 0) {
      c.events.push({ t: "harmony", spent: gastou, screen: true });
    }
  }

  // faixa de dano do Monk: BASE_POWER * (fist/100) * (attack/10) + flat.
  // Calculada uma vez fora do laco porque nao muda entre alvos.
  const faixaMonk = (md && typeof monkSpellDamage === "function")
    ? monkSpellDamage(p, id) : null;

  targets.forEach((t, idx) => {
    let dmg;
    if (faixaMonk) {
      dmg = faixaMonk.min +
            Math.floor(Math.random() * (faixaMonk.max - faixaMonk.min + 1));
      // sweeping takedown bate 75% fora do quadrado central
      if (md.powBorda && idx > 0) dmg = Math.floor(dmg * md.powBorda);
    } else {
      dmg = rollSpell(p, s);
    }
    if (monkMult !== 1) dmg = Math.floor(dmg * monkMult);
    // buff de vocacao (Virtude, Protector) tambem afeta magia
    if (typeof buffTotals === "function") {
      dmg = Math.floor(dmg * buffTotals(p, now).dmgDealt);
    }
    dmg = applyCharmDamage(p, elemento, dmg);
    dmg = applyResist(t, elemento, dmg);
    t.hp -= dmg;
    c.stats.damage += dmg;
    // magias que aplicam condition (Ignite, Envenom, Curse...)
    if (s.cond && typeof applyCondition === "function") {
      applyCondition(t, s.cond.tipo, s.cond.dano, s.cond.golpes);
    }
    c.events.push({ t: "hit", dmg: dmg, x: t.x, y: t.y,
                    sx: c.player ? c.player.x : 0.18,
                    sy: c.player ? c.player.y : 0.62,
                    screen: true,
                    // no chain o projetil sai do alvo ANTERIOR, nao do
                    // jogador: e o golpe saltando de inimigo em inimigo
                    projectile: idx === 0 || !!(md && md.chain),
                    el: elemento, spell: s.name, fx: fxMagia,
                    chain: md && md.chain && idx > 0 ? 1 : 0,
                    missile: ELEMENT_MISSILE[elemento] || "energy" });
  });
  if (areaTiles.length > 1) {
    c.events.push({ t: "areafx", cells: areaTiles, screen: true,
                    fx: fxMagia || (ELEMENTS[elemento] || ELEMENTS.physical).fx,
                    el: elemento });
  }
  if (md && md.chain && targets.length > 1) {
    c.events.push({ t: "chain", n: targets.length, x: target.x, y: target.y,
                    screen: true, fx: md.chainFx || "white-energy-spark" });
  }
  // builder gera a harmonia DEPOIS do golpe, como o postCastSpell do servidor
  if (kind === "builder") {
    const antes = typeof harmonyAtual === "function" ? harmonyAtual(p) : 0;
    const agora = ganhaHarmony(p, c);
    if (agora !== antes) c.events.push({ t: "harmony", gained: 1, screen: true });
  }

  if (c.player) c.player.attackAnim = 220;
  // `nAlvos` era uma variavel do ramo antigo, que agora vive dentro do else.
  // O que o evento precisa saber e apenas se o golpe pegou mais de um alvo.
  c.events.push({ t: "cast", name: s.name, area: targets.length > 1,
                  x: target.x, y: target.y, screen: true });
  c.events.push({ t: "say", text: spellWords(id, s) });
  return true;
}

/* Usa runa de ataque se configurado */
function tryUseRune(c, p, target, now, forcada) {
  // `forcada` vem da barra de combo: o slot ja decidiu qual runa usar, entao
  // pula a escolha automatica abaixo.
  if (!forcada && typeof comboAtivo === "function" && comboAtivo(p)) {
    // com combo montado quem dispara runa e o tryCastSpell, para respeitar a
    // ordem dos slots. Sem esta guarda a runa saia duas vezes por tick.
    return false;
  }
  if (!p.config.useRunes && !forcada) return false;
  if (c.runeCd > now) return false;
  if (c.player && c.player.cx !== undefined && target.cx !== undefined
      && typeof sqmDistance === "function") {
    if (sqmDistance(c.player, target) > 6) return false;   // runa: 6 SQM
  } else if (c.player && pointDistance(c.player, target) > runeRange()) return false;
  let best = null;
  if (forcada) {
    const sf = SUPPLIES[forcada];
    if (!sf || sf.type !== "attack") return false;
    if (!Object.prototype.hasOwnProperty.call(p.supplies, forcada)) p.supplies[forcada] = 0;
    if (!canRechargeSupply(p, forcada)) return false;
    best = forcada;
  } else if (p.config.shooterType === "rune" && p.config.shooterRune) {
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
  // cooldown proprio da runa (o Canary declara em rune:cooldown), nao um
  // 2000 fixo para todas
  c.runeCd = now + (s.cd || 2000);

  // Alvos: as runas de area do Canary cobrem uma GRADE (avalanche e great
  // fireball pegam 37 SQMs). Como a cena da caçada tem poucos monstros, o
  // que limita e quem esta dentro do raio, medido a partir do alvo — e o
  // mesmo criterio do servidor, que monta a lista de tiles em volta.
  const alvos = [target];
  const nomeAreaR = typeof areaNameOf === "function" ? areaNameOf("rune", best) : null;
  const porMatrizR = nomeAreaR && typeof areaMobs === "function"
    ? areaMobs(c, nomeAreaR, c.player, target) : null;
  const tilesR = nomeAreaR && typeof areaCells === "function"
    ? areaCells(nomeAreaR, c.player, target) : [];
  if (porMatrizR) {
    for (const m of porMatrizR) if (m !== target) alvos.push(m);
  } else if (s.area && s.area.raio > 0) {
    // 0.13 por SQM e a escala usada no resto do combate (burst arrow, cleave)
    const R = s.area.raio;                   // raio ja vem em SQM do lua
    for (const m of c.mobs) {
      if (m === target || m.hp <= 0) continue;
      if (sqmDist(m, target) <= R) alvos.push(m);
    }
  }

  const missile = s.missile || ELEMENT_MISSILE[s.element] || "energy";
  let total = 0;
  for (const alvo of alvos) {
    let dmg = 0;
    if (s.f) {
      // formula real do .lua: (level/5) + (magicLevel * K) + C
      const pw = supplyPowerFor(p, best);
      dmg = Math.floor(pw[0] + Math.random() * (pw[1] - pw[0]));
      // charms e resistencia do monstro, na mesma ordem do ataque normal
      if (typeof applyCharmDamage === "function") {
        dmg = applyCharmDamage(p, s.element, Math.max(1, dmg));
      }
      dmg = applyResist(alvo, s.element, Math.max(1, dmg));
      alvo.hp -= dmg;
      c.stats.damage += dmg;
      total += dmg;
    }
    // conditions (soulfire queima, poison bomb envenena): o dano vem no
    // tempo, entao a runa pode nem ter dano direto
    if (s.cond && typeof applyCondition === "function") {
      applyCondition(alvo, s.cond.tipo, s.cond.dano || 1, s.cond.golpes || 5);
      c.events.push({ t: "poisoned", x: alvo.x, y: alvo.y,
                      name: alvo.def ? alvo.def.name : "" });
    }
    c.events.push({ t: "hit", dmg: dmg, x: alvo.x, y: alvo.y,
                    sx: c.player ? c.player.x : 0.18,
                    sy: c.player ? c.player.y : 0.62,
                    screen: true,
                    // so o primeiro alvo mostra o projetil: a runa e
                    // arremessada uma vez e explode em area
                    projectile: alvo === target,
                    el: s.element, rune: s.name,
                    fx: s.fx || null, missile: missile });
  }
  if (tilesR.length > 1) {
    c.events.push({ t: "areafx", cells: tilesR, screen: true,
                    fx: s.fx || (ELEMENTS[s.element] || ELEMENTS.physical).fx,
                    el: s.element });
  } else if (s.area && alvos.length > 1) {
    c.events.push({ t: "burst", x: target.x, y: target.y, fx: s.fx || null });
  }

  if (c.player) c.player.attackAnim = 180;
  c.events.push({ t: "say", text: s.name.toLowerCase(), supply: true });
  return total > 0 || !!s.cond;
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
          p.level >= s.lvl && p.mp >= s.mana &&
          cdReady(p, selectedHealSpell, now)) heals.push([selectedHealSpell, s]);
    } else {
      for (const id in SPELLS) {
        const s = SPELLS[id];
        if (s.type !== "heal") continue;
        if (s.vocs.indexOf(p.voc) === -1) continue;
        if (p.level < s.lvl || p.mp < s.mana) continue;
        if (!cdReady(p, id, now)) continue;
        heals.push([id, s]);
      }
    }
    if (heals.length) {
      // sem selecao manual: usa a cura que mais restaura NESTE personagem,
      // calculada pela formula do canary e nao por um peso fixo
      if (!selectedHealSpell) {
        heals.sort((a, b) => spellValues(p, b[1]).max - spellValues(p, a[1]).max);
      }
      const [idCura, s] = heals[0];
      const amount = Math.max(1, rollSpell(p, s));
      cdStart(p, idCura, s, now);
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

/* Mantem o buff de vocacao ativo (Virtude do Monk, Protector do Knight,
 * Divine Dazzle do Paladin). O jogador escolhe qual no Helper. */
/* Lanca a magia de velocidade quando ela nao esta ativa.
 *
 * Fica separada do tryBuff porque este so aceita UM buff (o escolhido em
 * p.config.buff, que e a Virtude do monk ou o Protector do knight). Haste
 * nao deve competir por esse slot: no Tibia o jogador mantem as duas coisas
 * ao mesmo tempo. Escolhe sempre a mais forte que couber na mana.
 */
function tryHaste(c, p, now) {
  if (typeof HASTEDATA === "undefined") return false;
  if (p.config && p.config.autoHaste === false) return false;
  if ((c.hasteCd || 0) > now) return false;
  // ja tem uma ativa? nao gasta mana de novo
  if (typeof hasteAtiva === "function" && hasteAtiva(p, now)) return false;

  let melhor = null, ganho = 0;
  for (const id of (typeof hastesDisponiveis === "function"
                    ? hastesDisponiveis(p) : [])) {
    const sp = SPELLS[id];
    if (!sp) continue;
    if (sp.vocs && sp.vocs.indexOf(p.voc) === -1) continue;
    if (p.level < (sp.lvl || 1) || p.mp < sp.mana) continue;
    if (!cdReady(p, id, now)) continue;
    const d = hasteDelta(p, id);
    if (d > ganho) { ganho = d; melhor = id; }
  }
  if (!melhor) return false;

  const sp = SPELLS[melhor];
  p.mp -= sp.mana;
  addManaSpent(p, combatManaSkillGain(c, sp.mana));
  cdStart(p, melhor, sp, now);
  if (!p.buffs) p.buffs = {};
  p.buffs[melhor] = now + (HASTEDATA[melhor].dur || 30000);
  c.hasteCd = now + 2000;
  c.events.push({ t: "say", text: spellWords(melhor, sp) });
  c.events.push({ t: "buff", nome: HASTEDATA[melhor].nome || sp.name });
  return true;
}

function tryBuff(c, p, now) {
  if (typeof BUFFS === "undefined") return false;
  const chave = p.config && p.config.buff;
  if (!chave || !BUFFS[chave]) return false;
  if (hasBuff(p, chave, now)) return false;
  if ((c.buffCd || 0) > now) return false;
  const s = SPELLS[chave];
  if (!s) return false;
  if (s.vocs && s.vocs.indexOf(p.voc) === -1) return false;
  if (p.level < (s.lvl || 1) || p.mp < s.mana) return false;
  if (!cdReady(p, chave, now)) return false;
  p.mp -= s.mana;
  addManaSpent(p, combatManaSkillGain(c, s.mana));
  cdStart(p, chave, s, now);
  applyBuff(p, chave, now);
  c.buffCd = now + Math.max(1000, s.cd || 2000);
  c.events.push({ t: "say", text: spellWords(chave, s) });
  c.events.push({ t: "buff", nome: BUFFS[chave].nome });
  return true;
}

/* Usa a magia de cura de condition (exana ...) quando o jogador esta
 * sofrendo um efeito e conhece a magia. Prioriza o efeito mais nocivo. */
const CURE_ORDEM = ["cursed", "fire", "energy", "bleed", "poison", "freezing"];

function tryCureCondition(c, p, now) {
  if (!p.conditions) return false;
  if ((c.cureCd || 0) > now) return false;
  for (const tipo of CURE_ORDEM) {
    if (!p.conditions[tipo]) continue;
    const def = CONDITIONS[tipo];
    if (!def.cure) continue;
    const s = SPELLS[def.cure];
    if (!s) continue;
    if (s.vocs && s.vocs.indexOf(p.voc) === -1) continue;
    if (p.level < (s.lvl || 1) || p.mp < s.mana) continue;
    if (!cdReady(p, def.cure, now)) continue;
    p.mp -= s.mana;
    addManaSpent(p, combatManaSkillGain(c, s.mana));
    cdStart(p, def.cure, s, now);
    clearCondition(p, tipo);
    c.cureCd = now + 1000;
    c.events.push({ t: "say", text: spellWords(def.cure, s) });
    c.events.push({ t: "cured", tipo: tipo, nome: def.nome });
    return true;
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
  // o monstro so bate se o alvo estiver dentro do alcance EM SQM. Melee = 1,
  // e a diagonal conta como colado (Chebyshev), igual ao canUseAttack().
  if (typeof sqmDistance === "function" && pl.cx !== undefined && mob.cx !== undefined) {
    if (sqmDistance(pl, mob) > monsterRangeSQM(mob)) return false;
  } else if (pointDistance(pl, mob) > monsterAttackRange(mob)) return false;

  // Divine Dazzle (exana amp res): o alvo ofuscado erra golpes
  const bfm = typeof buffTotals === "function" ? buffTotals(p) : null;
  if (bfm && bfm.mobMissChance && Math.random() < bfm.mobMissChance) {
    c.events.push({ t: "miss", x: pl.x, y: pl.y, dazzle: true });
    return 0;
  }
  // charm Dodge: esquiva total do golpe
  const chm = typeof charmTotals === "function" ? charmTotals(p) : null;
  if (chm && chm.esquiva && Math.random() * 100 < chm.esquiva) {
    c.events.push({ t: "miss", x: pl.x, y: pl.y, dodge: true });
    return 0;
  }
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
  // charm Parry: devolve parte do dano ao agressor
  if (chm && chm.reflete) {
    const volta = Math.max(1, Math.floor(raw * chm.reflete / 100));
    mob.hp -= volta;
    c.stats.damage += volta;
  }
  // ATENCAO A ORDEM: o `p.hp -= raw` ficava AQUI, antes das reducoes abaixo.
  // O resultado e que Protector e protecao de imbuement mudavam so o numero
  // exibido no log — a vida perdida continuava sendo o dano cheio. Agora
  // todas as reducoes acontecem primeiro e o desconto vem por ultimo.

  // buffs: reduz o dano recebido (Protector, Virtue of Sustain)
  const bfd = typeof buffTotals === "function" ? buffTotals(p) : null;
  if (bfd && bfd.dmgReceived !== 1)
    raw = Math.max(1, Math.floor(raw * bfd.dmgReceived));

  // protecao elemental vinda dos imbuements
  if (typeof imbProtection === "function") {
    const prot = imbProtection(p, mob.def.element);
    if (prot > 0) raw = Math.max(1, Math.floor(raw * (1 - prot / 100)));
  }

  // Mantra do Monk: armadura elemental de valor FIXO, aplicada por ultimo
  // como no applyMantraAbsorb() do servidor. Diferente das outras reducoes,
  // pode zerar o golpe — e o que torna o Monk forte contra chip damage.
  if (typeof mantraAbsorve === "function") {
    const antesMantra = raw;
    raw = mantraAbsorve(p, raw, mob.def.element);
    if (raw <= 0) {
      c.events.push({ t: "block", x: pl.x, y: pl.y, sx: mob.x, sy: mob.y,
                      screen: true, mantra: true,
                      projectile: monsterAttackRange(mob) > 0.16,
                      missile: monsterMissile(mob) });
      addSkillTries(p, "shield", combatSkillGain(c, 1));
      return 0;
    }
    if (raw < antesMantra) c.stats.mantraAbsorvido =
      (c.stats.mantraAbsorvido || 0) + (antesMantra - raw);
  }

  p.hp -= raw;
  c.stats.taken += raw;
  applyMonsterCondition(c, p, mob);
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
  // motor de movimento em SQM (grid.js + gridai.js). O antigo continua no
  // arquivo como fallback caso os modulos novos nao carreguem.
  if (typeof updateGridMovement === "function") updateGridMovement(c, p, dt, now);
  else updateCombatMovement(c, p, dt);

  // conditions (veneno, fogo, energia, sangramento, maldicao) drenando
  tickConditions(c, p, dt);

  // buff de vocacao: mantem a Virtude / Protector sempre ativos
  tryBuff(c, p, now);
  tryHaste(c, p, now);

  // cura de conditions (exana) antes da cura de HP
  tryCureCondition(c, p, now);

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
    // bestiario da Cyclopedia: cada abate conta e pode render charm points
    let charmGanho = 0;
    if (typeof bestiaryKill === "function") {
      charmGanho = bestiaryKill(p, m.slug, 1);
    }
    const loot = rollLoot(c, p, m);
    c.events.push({ t: "kill", mob: m.slug, name: displayMonsterName(m.def.name),
                    exp: exp, loot: loot, x: m.x, y: m.y, screen: true,
                    charm: charmGanho });
  }
  c.mobs = alive;

  // auto sell / equip periodicos sao chamados pelo game loop
}
