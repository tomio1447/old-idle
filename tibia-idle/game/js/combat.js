/*
 * combat.js — simulacao do auto-hunt: spawn, combate, loot, morte.
 * Roda em ticks de tempo real e tambem acelerado (ganhos offline).
 */
"use strict";

const TICK = 100;   // ms por tick de simulacao
const COMBAT_GRID_W = 21;
const COMBAT_GRID_H = 13;

/* Animacao de spawn dos monstros: o teleporte "pisca" 3x no ponto antes de
 * o bicho nascer (pedido do jogador). SPAWN_BLINK_MS e o intervalo entre
 * piscadas; o renderer toca o efeito assets/fx/teleport.png a cada uma. */
const SPAWN_BLINK_MS = 300;
const SPAWN_BLINKS = 3;

/* Spells "exori" do Knight: golpe de skill FISICO (Berserk, Fierce Berserk,
 * Front Sweep, Groundshaker, Whirlwind Throw, Brutal Strike, Annihilation,
 * Ethereal Spear, Strong Ethereal Spear, Executioner's Throw). O numero de
 * dano delas deve sair VERMELHO VIVO (cor do elemento fisico) e nao a cor da
 * raca do alvo — e o estouro usa o cinza "hit-area". O drainEvents (game.js)
 * le a flag `exori` para aplicar essas cores. */
const KNIGHT_EXORI = new Set(["exori", "exori-gran", "exori-min", "exori-mas",
  "exori-hur", "exori-ico", "exori-gran-ico", "exori-con", "exori-gran-con",
  "exori-amp-kor"]);
const INFLUENCED_BASE_CHANCE = 0.004;
const INFLUENCED_PVP_BONUS = 0.004;
const FIENDISH_BASE_CHANCE = 0.0012;
const FIENDISH_PVP_BONUS = 0.0008;

function displayMonsterName(name) {
  return String(name || "").replace(/^Influenced\s+/i, "").replace(/^Fiendish\s+/i, "");
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
  /* mapa fechado da hunt (huntmapdata.js): paredes/agua bloqueiam o grid */
  const huntMap = (typeof HUNTMAPS !== "undefined" && hunt.mapa) ? HUNTMAPS[hunt.mapa] : null;
  /* spawn do jogador: spawn vindo do .otbm; senao marcador "S" do mapa
   * ascii; sem mapa, canto esquerdo */
  let spx = 3, spy = 6;
  if (huntMap && huntMap.spawn) {
    spx = huntMap.spawn.x;
    spy = huntMap.spawn.y;
  } else if (huntMap) {
    let achou = false;
    for (let y = 0; y < huntMap.rows.length && !achou; y++)
      for (let x = 0; x < huntMap.rows[y].length; x++)
        if (huntMap.rows[y][x] === "S") { spx = x; spy = y; achou = true; break; }
  }
  const out = {
    huntId: huntId,
    hunt: hunt,
    huntMap: huntMap,
    instanceMode: mode,
    pvp: pvp,
    expMul: pvp ? 1.25 : 1,
    lootMul: pvp ? 1.25 : 1,
    skillMul: pvp ? 1.25 : 1,
    // Hunts Hardcore podem multiplicar ambas as chances sem alterar as
    // tabelas globais de criaturas/hunts normais.
    influencedChance: (INFLUENCED_BASE_CHANCE + (pvp ? INFLUENCED_PVP_BONUS : 0)) * (hunt.influencedMul || 1),
    fiendishChance: (FIENDISH_BASE_CHANCE + (pvp ? FIENDISH_PVP_BONUS : 0)) * (hunt.fiendishMul || 1),
    // RAID será feito por jogadores reais no online. Não simular NPC/Player Raider aqui.
    raidEnabled: false,
    raidCd: Infinity,
    raidMode: pvp ? "real-player" : "none",
    mobs: [],
    pendingSpawns: [],   // fila de spawn com animacao de teleporte (3 piscadas)
    wave: 0,
    playerAtkCd: 0,
    spellCd: {},
    runeCd: 0,
    healCd: 0,
    // cooldown das POTIONS do 15.x: beber qualquer potion trava TODAS as
    // potions por 1s (e o cooldown compartilhado do cliente oficial — por
    // isso health e mana nao podem entrar no mesmo segundo). Runas tem o
    // cooldown proprio (runeCd) e nao participam.
    potionCd: 0,
    regenHp: 0,
    regenMp: 0,
    buffs: {},
    player: {
      // celula inicial: marcador "S" do mapa (ou canto esquerdo sem mapa).
      // x/y sao derivados dela e servem so para o render -- a verdade e
      // (cx, cy).
      cx: spx, cy: spy,
      x: (spx + 0.5) / 21, y: (spy + 0.5) / 13, dir: "e", moving: false,
      frame: 0, walkT: 0, attackAnim: 0, speedPts: 110,
    },
    stats: {
      startedAt: Date.now(), kills: 0, exp: 0, gold: 0, damage: 0,
      taken: 0, deaths: 0, loot: {}, supplyUsed: {}, supplyCost: 0,
      time: 0,
    },
    events: [],       // eventos visuais para a UI
    delayedHits: [],  // re-strikes agendados (Death Echo / Spiritual Outburst 15.25)
    dead: false,
    deadUntil: 0,
    players: null,    // PARTY COMBAT: todas as entidades na MESMA instância
  };
  // MODO DE HUNT (box/safe): escolhido no modal de instância ou no Helper
  // — vale para a party inteira (os aliados seguem c.huntMode)
  if (player.config && (player.config.attackMode === "box" || player.config.attackMode === "safe")) {
    out.huntMode = player.config.attackMode;
  }
  // PARTY COMBAT: o líder leva TODOS os membros para a mesma instância
  maybeLoadPartyCombat(out, player, spx, spy);
  return out;
}

/* PARTY COMBAT: quando o LÍDER entra numa hunt, carrega TODOS os membros
 * da party local para a mesma instância (c.players). O jogador controla
 * todos — o ativo (c.player) é o líder por padrão e pode ser trocado pelo
 * painel OTC sem recarregar. */
function maybeLoadPartyCombat(c, player, spx, spy) {
  try {
    if (typeof partyOnlineMode === "function" && partyOnlineMode()) return;
    if (typeof partyIsLeaderLocal !== "function" || !partyIsLeaderLocal(player)) return;
    if (typeof partyCombatLoad !== "function") return;
    const ents = partyCombatLoad(player);
    if (!ents || ents.length < 2) return;
    c.players = ents;
    // o líder (ativo) é o save REAL em uso — mutações refletem na hora
    c.players[0].p = player;
    c.players[0].id = player.id || c.players[0].id;
    c.player = c.players[0];
    if (typeof partyCombatPlace === "function") partyCombatPlace(c, spx, spy);
    if (typeof addLog === "function") {
      addLog("party", `<b style="color:#9ce84a">Party na mesma instância!</b> ${c.players.length} personagens na arena — clique neles no painel para controlar cada um.`);
    }
  } catch (e) { /* sem party: segue normal */ }
}

function newBossCombat(player, boss) {
  const c = newCombat(player, boss.hunt || "rats", "non-pvp");
  const base = GAMEDATA.monsters[boss.baseMonster || boss.sprite || "cave-rat"];
  // Boss com stats DIRETOS do Canary (hp/exp/damage/armor/defense definidos
  // no BOSS_DEFS) não passa pelo multiplicador — usa os valores oficiais.
  // Loot: se o BOSS_DEFS não define o próprio, usa o loot real do monstro
  // base (merge do canary — ex.: Timira usa o loot oficial do .lua).
  const def = Object.assign({}, base, {
    name: boss.name,
    hp: boss.hp || applyBossMultiplier(base, boss.mult || 10).hp,
    exp: boss.exp || applyBossMultiplier(base, boss.mult || 10).exp,
    damage: boss.damage || applyBossMultiplier(base, boss.mult || 10).damage,
    armor: boss.armor || applyBossMultiplier(base, boss.mult || 10).armor,
    defense: boss.defense || base.defense || 0,
    loot: (boss.loot && boss.loot.length) ? boss.loot : (base.loot || []),
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
  // Hardcore sorteia uma nova box completa a cada respawn: 10–12 mobs.
  const pack = (c.hunt.packMin && c.hunt.packMax)
    ? c.hunt.packMin + Math.floor(Math.random() * (c.hunt.packMax - c.hunt.packMin + 1))
    : (c.hunt.pack || 3);
  // Celulas G ja escolhidas nesta wave (para dois mobs da fila nao cairem
  // na mesma posicao designada — o occ e reconstruido a cada iteracao e
  // nao ve os pendingSpawns, que ainda nao estao em c.mobs). Reseta quando
  // a fila anterior ja nasceu (wave completa): as celulas voltam a ficar
  // disponiveis para a proxima leva.
  if (!c._spawnTaken || !(c.pendingSpawns && c.pendingSpawns.length))
    c._spawnTaken = {};
  // Conta também os que estão "piscando" (fila de spawn) para não encher a
  // arena além do pack enquanto a animação de teleporte roda. A condição
  // le a fila a cada iteracao (naFila cresce a cada push).
  while (c.mobs.length + (c.pendingSpawns ? c.pendingSpawns.length : 0) < pack) {
    const slug = c.hunt.monsters[Math.floor(Math.random() * c.hunt.monsters.length)];
    const base = GAMEDATA.monsters[slug];
    if (!base) break;
    const fiendish = Math.random() < (c.fiendishChance || FIENDISH_BASE_CHANCE);
    const influenced = !fiendish && (Math.random() < (c.influencedChance || INFLUENCED_BASE_CHANCE));
    const stacks = fiendish ? 15 : (influenced ? (1 + Math.floor(Math.random() * 5)) : 0);
    const m = Object.assign({}, base);
    m.name = displayMonsterName(base.name);
    if (fiendish || influenced) {
      const mult = 1.35 + (stacks * 0.15);
      m.hp = Math.floor(base.hp * mult);
      m.exp = Math.floor((base.exp || 0) * (1 + stacks * 0.25));
      m.damage = Math.floor((base.damage || 1) * (1 + stacks * 0.08));
      m.armor = Math.floor((base.armor || 0) * (1 + stacks * 0.05));
    }
    const mob = {
      slug: slug, def: m,
      influenced: influenced,
      fiendish: fiendish,
      sinisterStacks: stacks,
      hp: m.hp, maxHp: m.hp,
      atkCd: 400 + Math.random() * 1200,
      id: Math.random().toString(36).slice(2, 8),
      dir: "w",
      moving: false,
      attackAnim: 0,
      speed: 0.000045 + Math.random() * 0.000025,
      spawnAt: Date.now(),
    };
    // --- ponto de respawn (posicao designada no RME) ---
    // A zona G do .otbm marca EXATAMENTE onde o editor quer os monstros.
    // Cada spawn sorteia uma celula G LIVRE e nasce nela (sem desviar),
    // reservando a celula para o proximo nao nascer em cima. So quando a
    // zona inteira esta ocupada e que cai no fallback (celula livre mais
    // proxima / canto da arena).
    let cx, cy;
    if (typeof placeFree === "function") {
      if (c.player) ensureCell(c.player);
      const occ = buildOccupancy(c, null);
      const zona = (c.huntMap && c.huntMap.mob && c.huntMap.mob.length)
        ? c.huntMap.mob : null;
      if (zona && zona.length) {
        // células G livres (respeita a posicao designada + ocupacao atual
        // + celulas ja escolhidas nesta wave)
        const livres = zona.filter((z) =>
          cellFree(occ, z.x, z.y) && !c._spawnTaken[z.x + ":" + z.y]);
        if (livres.length) {
          const z = livres[Math.floor(Math.random() * livres.length)];
          cx = z.x; cy = z.y;
          c._spawnTaken[cx + ":" + cy] = true;
        } else {
          // zona lotada: nasce na livre mais proxima de uma celula G
          const z = zona[Math.floor(Math.random() * zona.length)];
          const ent = { cx: undefined, cy: undefined };
          placeFree(ent, occ, z.x, z.y);
          cx = ent.cx; cy = ent.cy;
        }
      } else {
        // arena sem zona: qualquer celula livre (evita o canto fixo)
        const livres = [];
        for (let yy = 0; yy < GRID_H; yy++)
          for (let xx = 0; xx < GRID_W; xx++)
            if (cellFree(occ, xx, yy)) livres.push([xx, yy]);
        let alvo = livres[Math.floor(Math.random() * livres.length)] || [17, 5];
        const ent = { cx: undefined, cy: undefined };
        placeFree(ent, occ, alvo[0], alvo[1]);
        cx = ent.cx; cy = ent.cy;
      }
      // reserva a celula para o proximo da fila nao nascer em cima
      if (cx !== undefined && cy !== undefined) occ.set(cx + ":" + cy, true);
    } else {
      // fallback (sem grid): float como antes
      cx = Math.floor(GRID_W * 0.72) + Math.floor(Math.random() * 5);
      cy = 2 + Math.floor(Math.random() * (GRID_H - 4));
      mob.x = 0.80 + Math.random() * 0.16;
      mob.y = 0.30 + Math.random() * 0.42;
    }
    // ultima rede: arena lotada -> canto direito (comportamento antigo)
    if (cx === undefined || cy === undefined) {
      cx = Math.min(GRID_W - 1, Math.floor(GRID_W * 0.72) + Math.floor(Math.random() * 5));
      cy = 2 + Math.floor(Math.random() * (GRID_H - 4));
    }
    c.pendingSpawns = c.pendingSpawns || [];
    c.pendingSpawns.push({
      mob: mob,
      cx: cx, cy: cy,
      startedAt: Date.now(),
      blink: 0,
      done: false,
    });
  }
  c.wave++;
}

/* Processa a fila de spawn: a cada SPAWN_BLINK_MS o teleporte "pisca" no
 * ponto (evento spawn-blink -> renderer mostra o efeito). Depois de
 * SPAWN_BLINKS piscadas o monstro nasce de verdade. */
function tickSpawnQueue(c) {
  if (!c.pendingSpawns || !c.pendingSpawns.length) return;
  const now = Date.now();
  for (const sp of c.pendingSpawns) {
    const b = Math.floor((now - sp.startedAt) / SPAWN_BLINK_MS);
    if (b > sp.blink) {
      sp.blink = Math.min(SPAWN_BLINKS, b);
      if (sp.blink <= SPAWN_BLINKS) {
        const s = (typeof cellToScreen === "function")
          ? cellToScreen(sp.cx, sp.cy) : null;
        c.events.push({
          t: "spawn-blink",
          x: s ? s.x : (sp.cx + 0.5) / GRID_W,
          y: s ? s.y : (sp.cy + 0.5) / GRID_H,
          blink: sp.blink,
        });
      }
    }
    if (b >= SPAWN_BLINKS && !sp.done) {
      sp.done = true;
      const m = sp.mob;
      m.cx = sp.cx; m.cy = sp.cy;
      const s = (typeof cellToScreen === "function")
        ? cellToScreen(sp.cx, sp.cy) : null;
      if (s) { m.x = s.x; m.y = s.y; m.sx = s.x; m.sy = s.y; }
      else { m.x = (sp.cx + 0.5) / GRID_W; m.y = (sp.cy + 0.5) / GRID_H; }
      m.speedPts = typeof monsterSpeedPts === "function" ? monsterSpeedPts(m) : 100;
      m.spawnAt = Date.now();
      c.mobs.push(m);
      c.events.push({ t: "spawn", slug: m.slug, x: m.x, y: m.y });
    }
  }
  c.pendingSpawns = c.pendingSpawns.filter((sp) => !sp.done);
}

/* Velocidade de ataque do jogador em ms.
 *
 * Base de 1 ataque a cada 1.2s, a pedido do jogador. O Canary segue o
 * Tibia atual: 2s fixos para toda arma desde a unificacao dos speeds
 * (weapons em .lua nao declaram attackSpeed proprio). O idle anda no dobro
 * do ritmo oficial para a cena nao ficar parada — os multiplicadores de
 * haste/equip e o piso de 800ms continuam os mesmos de antes. */
function attackInterval(c, p) {
  let base = 1200;
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
  // Agony (TibiaWiki): dano verdadeiro que não pode ser curado nem
  // protegido — só esperar acabar.
  agony:   { nome: "Agony",        el: "agony",  fx: "draw-blood",
             cor: "#9a6a3a", cure: null },
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
        let dmg = Math.max(1, co.dmg);
        // Agony: true damage — o Magic Shield NÃO protege contra ele
        // (TibiaWiki: "can not be cured or protected against").
        if (def.el !== "agony" && typeof applyMagicShieldAbsorb === "function") {
          dmg = applyMagicShieldAbsorb(c, p, dmg, {
            el: def.el,
            x: c.player ? c.player.x : 0.13,
            y: c.player ? c.player.y : 0.6,
          });
        }
        if (dmg <= 0) continue;
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
  // condition do golpe corpo-a-corpo importada do Canary (ex.: veneno da
  // aranha, escorpiao, cobra) — o parser antigo perdia essa info e o bicho
  // mordia sem nunca envenenar
  if (def.meleeCond && def.meleeCond.tipo) {
    const mc = def.meleeCond;
    const tipo = mc.tipo === "poison" ? "poison"
      : mc.tipo === "fire" ? "fire"
      : mc.tipo === "energy" ? "energy"
      : mc.tipo === "bleed" ? "bleed"
      : mc.tipo === "freezing" ? "freezing"
      : null;
    if (tipo && typeof CONDITIONS !== "undefined" && CONDITIONS[tipo]) {
      const dmg = mc.dano || Math.max(1, Math.round((def.damage || 10) * 0.08));
      applyCondition(p, tipo, dmg, 4);
      c.events.push({ t: "player-condition", tipo: tipo });
      return;
    }
  }
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
/* Casa vizinha para onde o tiro perdido cai.
 *
 * Porte do bloco `destList` de WeaponDistance::useWeapon: o servidor
 * embaralha as 9 posicoes do 3x3 em volta do alvo e fica com a primeira que
 * tenha chao e nao seja bloqueada. Aqui devolvemos um alvo "fantasma" com
 * celula propria, que serve de centro para a area da municao.
 */
function tileVizinho(c, target) {
  if (target.cx === undefined) return target;
  const volta = [
    [-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0],
    [1, 0], [-1, 1], [0, 1], [1, 1],
  ];
  // embaralha, como o std::ranges::shuffle do servidor
  for (let i = volta.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = volta[i]; volta[i] = volta[j]; volta[j] = t;
  }
  for (const [dx, dy] of volta) {
    const cx = target.cx + dx, cy = target.cy + dy;
    if (typeof inBounds === "function" && !inBounds(cx, cy)) continue;
    const s = (typeof cellToScreen === "function")
      ? cellToScreen(cx, cy) : { x: target.x, y: target.y };
    // objeto so de posicao: nao e criatura, so o ponto onde a flecha caiu
    return { cx: cx, cy: cy, x: s.x, y: s.y, fantasma: true };
  }
  return target;
}

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
  "arrow": "arrow", "simple-arrow": "arrow", "flash-arrow": "flash-arrow",
  "shiver-arrow": "shiver-arrow",
  // slug oficial e "flaming-arrow" mas o sprite importado ficou com o nome
  // "flamming-arrow" (2 m); mapeia pro arquivo que existe de fato.
  "flaming-arrow": "flamming-arrow", "earth-arrow": "earth-arrow",
  "envenomed-arrow": "poison-arrow", "sniper-arrow": "sniper-arrow", "tarsal-arrow": "arrow",
  "diamond-arrow": "diamond-arrow", "onyx-arrow": "onyx-arrow", "crystalline-arrow": "arrow",
  "poison-arrow": "poison-arrow", "burst-arrow": "burst-arrow",
  // flechas AoE do 15.25: nao tem sprite de projetil proprio no cliente —
  // voam como flecha comum e explodem com o areaFx do elemento
  "shatterstorm-arrow": "arrow", "firestorm-arrow": "arrow",
  "terrastorm-arrow": "arrow", "froststorm-arrow": "arrow",
  "thunderstorm-arrow": "arrow",
  "bolt": "bolt", "piercing-bolt": "piercing-bolt", "vortex-bolt": "bolt",
  "power-bolt": "power-bolt", "drill-bolt": "bolt", "prismatic-bolt": "bolt",
  "infernal-bolt": "infernal-bolt", "spectral-bolt": "spectral-bolt",
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

/* CONST_ANI_WEAPONTYPE (brutal_strike.lua, annihilation.lua,
 * whirlwind_throw.lua, executioners_throw.lua): o client arremessa uma
 * copia giratoria da ARMA de melee equipada — whirlwind-sword/axe/club. */
function weaponMissile(p) {
  const wp = p && p.equip && p.equip.weapon
    ? GAMEDATA.items[p.equip.weapon.item] : null;
  const cat = wp && wp.cat;
  if (cat === "axe" || cat === "club" || cat === "sword")
    return "whirlwind-" + cat;
  return "whirlwind-sword";        // punho/desarmado: espada generica
}

/* Projetil de um monstro que ataca a distancia. Arqueiros atiram flecha,
 * casters cospem o elemento e o resto arremessa pedra. */
function monsterMissile(mob) {
  const def = mob.def || {};
  // 1) O servidor declara o arremessavel de cada habilidade no shootEffect
  //    (CONST_ANI_*) do .lua, e o importador guardou em skills[].miss. ESSA
  //    e a sprite certa: o behemoth atira large-rock, nao a pedrinha
  //    generica. Vale a habilidade a distancia de MAIOR dano — o arremesso
  //    "basico" do bicho (o boulder throw do behemoth, nao um buff).
  let base = null;
  for (const sk of def.skills || []) {
    if (!sk.miss || (sk.range || 1) <= 1) continue;
    if (!base || (sk.max || 0) > (base.max || 0)) base = sk;
  }
  if (base) return base.miss;
  // 2) Monstro sem habilidades importadas: heuristicas antigas.
  if (!def.ranged) return null;
  const slug = mob.slug || "";
  if (/archer|scout|spearman|hunter/.test(slug))
    return slug.indexOf("spearman") !== -1 ? "spear" : "arrow";
  if (/goblin/.test(slug)) return "small-stone";
  return ELEMENT_MISSILE[def.element] || "small-stone";
}

/* Aplica a resistencia elemental do monstro (dados do Canary).
 * percent > 0 = toma MENOS dano; negativo = fraqueza. 100 = imune.
 *
 * 15.25: Expose Weakness (crippling stance do Sorcerer) concede 8% de
 * elemental pierce contra o alvo marcado — "atacantes recebem 8%
 * elemental pierce contra o alvo". Implementado como -8 pontos na
 * resistencia do monstro enquanto a marca durar (so dano elemental —
 * fisico nao e elemento). */
/* Life/mana leech de Augments (TibiaWiki/Augments): aplica o leech extra
 * da spell sobre o dano causado, curando/recarregando o personagem. */
function augmentApplyLeech(c, p, aug, dano) {
  if (!aug || !p) return;
  const max = typeof maxStats === "function" ? maxStats(p) : null;
  if (aug.lifeLeech > 0) {
    const cura = Math.max(1, Math.floor(dano * aug.lifeLeech / 100));
    if (max) p.hp = Math.min(max.hp, p.hp + cura);
    else p.hp = (p.hp || 0) + cura;
    if (c) c.stats.healed = (c.stats.healed || 0) + cura;
  }
  if (aug.manaLeech > 0) {
    const mana = Math.max(1, Math.floor(dano * aug.manaLeech / 100));
    if (max) p.mp = Math.min(max.mp, p.mp + mana);
    else p.mp = (p.mp || 0) + mana;
  }
}




/* ====================================================== Mitigation
 * TibiaWiki/Mitigation: propriedade defensiva que reduz TODOS os tipos de
 * dano comuns (Physical, Earth, Ice, Fire, Energy, Holy e Death) por uma
 * porcentagem. Agony (true damage) e DOT de condições NÃO são reduzidos.
 * Os valores das criaturas vêm do Bestiary (campo `mitigation` do Canary,
 * em %: ~0.01 a ~5.4 no jogo; ver List_of_Creatures_by_Mitigation_Value).
 */

/* % de mitigation da criatura (0 se não tiver). */
function monsterMitigationPct(mob) {
  const mit = mob && mob.def ? mob.def.mitigation : 0;
  return (mit && mit > 0) ? mit : 0;
}

/* Aplica a mitigation da criatura a um golpe (todos os tipos comuns;
 * agony e dano no tempo não passam por aqui). */
function applyMonsterMitigation(mob, element, dano) {
  const mit = monsterMitigationPct(mob);
  if (!mit || element === "agony") return dano;
  return Math.max(1, Math.floor(dano * (1 - mit / 100)));
}

/* Mitigation do JOGADOR (TibiaWiki/Mitigation): calculada de
 *   - a skill de Shielding;
 *   - a Defense do escudo/spellbook (ou da ARMA quando two-handed ou
 *     one-handed sem escudo — com penalidade para two-handed);
 * Fórmula aproximada (o client não divulga a exata): shielding*0.04 +
 * def*0.2, teto 25%. Reduz todos os tipos comuns no dano recebido. */
function playerMitigationPct(p) {
  const e = p.equip || {};
  const shield = e.shield ? GAMEDATA.items[e.shield.item] : null;
  const weapon = e.weapon ? GAMEDATA.items[e.weapon.item] : null;
  const temEscudo = !!(shield && (shield.t === "shield" || shield.t === "spellbook"));
  const duasMaos = !!(weapon && weapon.th);
  let defEquip = 0;
  if (temEscudo) {
    defEquip = shield.def || 0;
  } else if (weapon) {
    // arma cobre a defesa quando não há escudo — two-handed vale menos
    defEquip = (weapon.def || 0) * (duasMaos ? 0.6 : 1);
  }
  // shielding: usa playerDefense quando o personagem está completo (tem
  // skills); senão cai no valor cru da skill para players parciais.
  let sh = 0;
  if (p && p.skills && typeof effSkill === "function") {
    sh = effSkill(p, "shield") || 0;
  } else if (p && p.skills) {
    sh = p.skills.shield || 0;
  }
  // Wheel of Destiny: mitigacao extra dos nos (0.03 por ponto, em %)
  let wheelMit = 0;
  if (typeof wheelTotals === "function" && p.wheel) {
    wheelMit = wheelTotals(p).mitigation * 100;
  }
  return Math.min(50, Math.max(0, sh * 0.04 + defEquip * 0.2 + wheelMit));
}

/* Aplica a mitigation do jogador ao dano recebido (tipos comuns apenas). */
function applyPlayerMitigation(p, element, dano) {
  if (element === "agony") return dano;
  const mit = (typeof playerMitigationPct === "function") ? playerMitigationPct(p) : 0;
  if (mit <= 0) return dano;
  return Math.max(1, Math.floor(dano * (1 - mit / 100)));
}

/* Resistência por ELEMENTO do jogador (TibiaWiki: Anéis / Amuletos e
 * Colares). Soma o `res[element]` de TODOS os equipamentos (anel, amuleto,
 * armadura, escudo etc.). Proteção positiva reduz o dano; negativa (fraqueza,
 * ex.: terra amulet -10% fogo) aumenta. */
function playerResistPct(p, element) {
  if (!p || !p.equip || typeof GAMEDATA === "undefined") return 0;
  let total = 0;
  for (const s in p.equip) {
    const e = p.equip[s];
    if (!e || !e.item) continue;
    const it = GAMEDATA.items[e.item];
    if (!it || !it.res) continue;
    total += Number(it.res[element]) || 0;
  }
  return total;
}

/* Aplica a resistência por elemento do jogador ao dano recebido.
 * CARGAS POR GOLPE: itens com chargeMode "hits" (o might ring de 20 cargas)
 * gastam 1 carga a cada golpe recebido. A carga é descontada DEPOIS da
 * redução — o último golpe (20º) ainda é absorvido e só então o anel
 * quebra, como no Tibia. */
function applyPlayerResist(p, element, dano) {
  if (element === "agony") return dano;   // true damage: nunca reduz
  const pc = (typeof playerResistPct === "function") ? playerResistPct(p, element) : 0;
  const reduzido = pc ? Math.max(1, Math.floor(dano * (1 - pc / 100))) : dano;
  if (dano > 0 && p && p.equip && typeof consumeAccessoryHitCharge === "function") {
    try { consumeAccessoryHitCharge(p); } catch (e) { /* não bloqueia o dano */ }
  }
  return reduzido;
}

/* ====================================================== Elemental Pierce
 * TibiaWiki/Elemental_Pierce (Winter Update 2025): aumenta a sensibilidade
 * do inimigo por uma porcentagem. Regras:
 *   - o aumento é METADE acima de sensibilidade 100% (arredondado p/ cima);
 *   - sensibilidade 0% nunca aumenta;
 *   - no máximo, DOBRA a sensibilidade;
 *   - não afeta dano de Charms.
 * "Sensibilidade" = resistência NEGATIVA do alvo (pc < 0).
 */

/* Soma o Elemental Pierce dos itens equipados para um elemento (%). */
function playerPiercePct(p, element) {
  if (!p || !p.equip || typeof GAMEDATA === "undefined") return 0;
  let total = 0;
  for (const slot in p.equip) {
    const e = p.equip[slot];
    if (!e || !e.item) continue;
    const it = GAMEDATA.items[e.item];
    if (!it || !it.pierce) continue;
    total += Number(it.pierce[element]) || 0;
  }
  return total;
}

/* Aplica o pierce a um valor de RESISTÊNCIA (pc). Retorna a nova resist. */
function applyPierceToResist(pc, piercePct) {
  if (!piercePct || piercePct <= 0) return pc;
  const sens = -(pc || 0);
  // sensibilidade 0% (ou resistência >= 0) nunca aumenta
  if (sens <= 0) return pc;
  let novo;
  if (sens > 100) {
    novo = sens + Math.ceil(piercePct / 2);
  } else {
    const extra = sens + piercePct;
    novo = extra > 100 ? 100 + Math.ceil((extra - 100) / 2) : extra;
  }
  novo = Math.min(novo, 2 * sens);   // no máximo dobra
  return -novo;
}

function applyResist(mob, element, dano, piercePct) {
  // Agony é "true damage": não pode ser mitigado nem reduzido por
  // resistência (TibiaWiki: "Can not be mitigated or reduced").
  if (element === "agony") return Math.max(1, Math.floor(dano));
  const def = mob && mob.def;
  const r = def && def.resist;
  if (!r || !element) return dano;
  // Imunidade declarada no array `imune` (ex.: "physical", "fire") zera o
  // golpe, como os mobs imunes a físico do client (Ghost, Pirate Ghost,
  // Spectre, Phantasm, Dipthrah...).
  if (Array.isArray(def.imune) && def.imune.indexOf(element) !== -1) return 0;
  let pc = r[element];
  if (!pc && element !== "physical" &&
      !(mob.exposeUntil && mob.exposeUntil > Date.now())) return dano;
  if (element !== "physical" && mob.exposeUntil && mob.exposeUntil > Date.now())
    pc = (pc || 0) - 8;
  // Elemental Pierce (TibiaWiki): aumenta a sensibilidade (resist negativa)
  // do alvo antes do cálculo — mesmas regras do Expose Weakness.
  if (piercePct && piercePct > 0) pc = applyPierceToResist(pc, piercePct);
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
    // (o antigo evento "range" mostrava "fora de alcance" na tela — foi
    // removido; a falha fica silenciosa no log de quem chamou)
    return false;
  }

  // Mirror Image revela a Apparition correspondente à vocação que iniciou o ataque.
  if (target && target.slug === "mirror-image" && typeof soulwarMirrorTransform === "function") soulwarMirrorTransform(c, target, p);

  // Distância usa cargas de ammo. Se acabou, compra 1 carga no uso;
  // se não houver gold, o ataque não sai.
  if (isDist && !consumeAmmoCharge(c, p)) {
    c.events.push({ t: "miss", x: target.x, y: target.y, reason: "ammo" });
    return 0;
  }

  const ammo = isDist ? activeAmmoItem(p) : null;

  // Perfect Shot (TibiaWiki/Perfect_Shot): quando o alvo esta EXATAMENTE na
  // distancia que o equipamento configura, o golpe ganha dano fixo e nao
  // pode errar. Fonte: quivers (paladinos, ex.: eldritch +20 @4) e wands
  // (sorcerers, ex.: eldritch wand +65 @4). Fora dessa distancia exata nao
  // ha bonus nenhum. So vale para o ALVO PRINCIPAL (area/cleave nao somam).
  let perfeito = 0;
  if ((isDist || isMagic) && c.player) {
    const eq = isDist ? equippedQuiver(p) : null;
    const q = eq ? GAMEDATA.items[eq.item] : null;
    const arma = p.equip && p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
    const src = (q && q.shotDmg) ? q : ((arma && arma.shotDmg) ? arma : null);
    if (src && src.shotDmg) {
      // distancia real em SQM (Chebyshev). Antes era uma divisao por 0.085
      // que so acertava no eixo X: a grade e 21x13, entao o mesmo valor de
      // tela valia SQMs diferentes na horizontal e na vertical.
      const sqm = (typeof sqmDistance === "function" && c.player.cx !== undefined
                   && target.cx !== undefined)
        ? sqmDistance(c.player, target)
        : Math.round(pointDistance(c.player, target) / 0.085);
      if (sqm === src.shotRange) perfeito = src.shotDmg;
    }
  }

  // Rolagem de acerto da distancia, com a tabela real do weapons.cpp: a
  // chance depende da DISTANCIA e do maxHitChance da municao, e nao de uma
  // curva unica de skill como antes.
  //
  // O que muda de comportamento: errar NAO cancela o disparo. No servidor o
  // tiro que erra e resolvido numa casa vizinha ao alvo (o bloco `destList`
  // de useWeapon). Para municao com area isso e o que garante que a
  // explosao aconteca de qualquer jeito, so que centrada no lugar errado —
  // era esta a queixa de a diamond arrow nao causar o dano em area.
  let alvoTiro = target;         // onde a flecha realmente cai
  let errou = false;
  // maxHitChance 100 e o "nunca erra" do servidor: burst, diamond, sniper e
  // spectral entram aqui e pulam a rolagem inteira.
  const nuncaErra = !!(ammo && ammo.noMiss);
  if (isDist && !perfeito && !nuncaErra) {
    const maxHit = (ammo && ammo.hit) ? ammo.hit : 90;
    // A tabela do weapons.cpp e indexada por SQM inteiro. O sqmDist cai num
    // valor fracionario quando a criatura nao tem celula (cena de treino e
    // testes antigos, que so usam coordenada de tela); arredondar para cima
    // com minimo 1 mantem esse caminho valendo em vez de virar distancia 0.
    const sqm = Math.max(1, Math.ceil(sqmDist(c.player || pos, target)));
    const chance = (typeof hitChanceDistance === "function")
      ? hitChanceDistance(effSkill(p, "dist"), sqm, maxHit)
      : 90;
    if (chance < Math.floor(Math.random() * 100) + 1) {
      errou = true;
      // desvia para uma casa vizinha, como o destList do servidor
      alvoTiro = tileVizinho(c, target);
    }
  }

  // Sem area o tiro perdido simplesmente nao acerta ninguem. Com area, o
  // disparo continua e explode na casa desviada.
  if (errou && !(ammo && (ammo.areaMatrix || ammo.area))) {
    c.events.push({ t: "miss", x: target.x, y: target.y });
    addSkillTries(p, "dist", combatSkillGain(c, 1));
    return 0;
  }

  const element = ammo && ammo.el ? ammo.el : d.element;
  const rollDamage = (alvoPrincipal) => {
    let v = d.min + Math.random() * (d.max - d.min);
    // Agony é true damage: a Armor do alvo não reduz (TibiaWiki).
    if (!isMagic && element !== "agony") {
      // Mitigation dos MONSTROS foi aumentada no 15.25 ("Mitigation foi
      // ajustada... Mitigation dos monstros foi aumentada"): o redutor de
      // armadura sobe de 30-70% para 45-95% e o teto de 55% para 62%.
      const red = Math.min(v * 0.62,
                           target.def.armor * (0.45 + Math.random() * 0.5));
      v -= red;
    }
    // charm da Cyclopedia aumenta o golpe antes da resistencia — mas desde
    // o 15.25 os auto attacks so ativam charms no ALVO PRINCIPAL, entao o
    // bonus nao vale para cleave nem para a area da municao.
    v = Math.max(1, Math.floor(v));
    if (alvoPrincipal) v = applyCharmDamage(p, element, v);
    v = applyResist(target, element, Math.max(1, v), playerPiercePct(p, element));
    // Mitigation do monstro reduz TODOS os tipos comuns (TibiaWiki).
    // O perfect shot é somado FORA deste roll — por isso ele bypassa a
    // mitigation (regra oficial).
    return applyMonsterMitigation(target, element, v);
  };

  let raw = rollDamage(true);
  // dano extra do perfect shot, somado depois da resistencia
  if (perfeito) raw += perfeito;

  // ---- multiplicadores de stance/haste do 15.25: Protector (-15% dano
  // causado) e a nova Swift Foot, que agora permite atacar mas reduz 30%
  if (raw > 0) {
    if (typeof stanceTotals === "function") {
      const dst = stanceTotals(p).dmgDealt;
      if (dst !== 1) raw = Math.max(1, Math.floor(raw * dst));
    }
    if (typeof swiftFootMul === "function") {
      const swf = swiftFootMul(p);
      if (swf !== 1) raw = Math.max(1, Math.floor(raw * swf));
    }
  }

  // ---- Monk: o mantra vira dano no golpe de punho (perk Ascetic /
  // santuarios da quest). So no auto-ataque corpo a corpo, como no
  // combat.cpp: o servidor testa damage.origin == ORIGIN_FIST.
  if (!isDist && !isMagic && typeof mantraAtaqueBonus === "function") {
    const extra = mantraAtaqueBonus(p, c);
    if (extra > 0) raw += extra;
  }

  // ---- bonus do Bosstiary: o nivel da dano extra contra bosses. E o que o
  // sistema faz no jogo original — subir o nivel precisa valer alguma coisa.
  if (target.def && target.def.boss &&
      typeof bosstiaryDamageBonus === "function") {
    const mul = bosstiaryDamageBonus(p);
    if (mul !== 1) raw = Math.max(1, Math.floor(raw * mul));
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

  // ---- imbuements do 15.x (usado abaixo: leech, elemental, strike)
  const imb = typeof imbTotals === "function" ? imbTotals(p) : null;

  // ---- crítico do golpe (Summer Update 2025): 5% intrínseco + Strike
  // imbuement, com 10% de dano extra intrínseco. O roll é o MESMO do
  // Critical Heal (funções playerCritChancePct/playerCritExtraPct).
  let critou = false;
  let fatalou = false;
  let extraPct = 0;
  const critRoll = typeof rollPlayerCrit === "function" ? rollPlayerCrit(p) : { crit: false, extraPct: 0 };
  if (critRoll.crit) {
    extraPct += critRoll.extraPct;
    critou = true;
  }

  // Exaltation Forge oficial: Onslaught soma +60% ao bônus do golpe.
  const forgeOnslaught = (typeof forgeTryOnslaught === "function") ? forgeTryOnslaught(p) : null;
  if (forgeOnslaught) {
    extraPct += (forgeOnslaught.bonusPct || 60);
    fatalou = true;
  }

  // Transcendence (avatar): todos os ataques viram críticos com +15% extra.
  const transcendencePct = (typeof forgeTranscendenceDamagePct === "function")
    ? forgeTranscendenceDamagePct(p, Date.now()) : 0;
  if (transcendencePct > 0) {
    extraPct += transcendencePct;
    critou = true;
  }

  if (extraPct > 0) raw = Math.max(1, Math.floor(raw * (1 + extraPct / 100)));
  // Wheel of Destiny: bonus de dano % (revelation dos estagios)
  if (typeof wheelDamageMul === "function" && p.wheel) {
    raw = Math.max(1, Math.floor(raw * wheelDamageMul(p)));
  }

  if (imb) {
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
  // Leech FIXO dos itens equipados (TibiaWiki/Siphoning e /Draining):
  // as armas Siphoning Inferniarch concedem 10% de Mana Leech permanente e
  // as Draining Inferniarch concedem 29% de Life Leech permanente (atributo
  // do Doomforge, sem imbuement). Somado ao leech dos imbuements.
  if (typeof equipmentLeechTotals === "function") {
    const eqLeech = equipmentLeechTotals(p);
    if (eqLeech.lifeLeech) {
      const max = maxStats(p);
      const cura = Math.max(1, Math.floor(raw * eqLeech.lifeLeech / 100));
      p.hp = Math.min(max.hp, p.hp + cura);
    }
    if (eqLeech.manaLeech) {
      const max = maxStats(p);
      const mana = Math.max(1, Math.floor(raw * eqLeech.manaLeech / 100));
      p.mp = Math.min(max.mp, p.mp + mana);
    }
  }
  // Wheel of Destiny: life/mana leech dos nos da wheel
  if (typeof wheelLeechTotals === "function" && p.wheel) {
    const wl = wheelLeechTotals(p);
    if (wl.lifeLeech) {
      const max = maxStats(p);
      const cura = Math.max(1, Math.floor(raw * wl.lifeLeech / 100));
      p.hp = Math.min(max.hp, p.hp + cura);
    }
    if (wl.manaLeech) {
      const max = maxStats(p);
      const mana = Math.max(1, Math.floor(raw * wl.manaLeech / 100));
      p.mp = Math.min(max.mp, p.mp + mana);
    }
  }

  // Imbuement de dano elemental (Scorch/Venom/Frost/Electrify/Reap):
  // converte X% do golpe FISICO no elemento escolhido. Vale para melee e
  // distance (como o secondary damage das armas — mesma mecanica), nao
  // vale para magias e nao se acumula com arma elemental (essa ja reparte).
  let imbEl = null, imbProp = 1;
  if (imb && imb.elemental && imb.elementalType &&
      !d.elemento2 && element === "physical" && !errou && !isMagic) {
    imbEl = imb.elementalType;
    imbProp = 1 - Math.min(100, imb.elemental) / 100;
  }

  // Tiro perdido nao acerta o alvo: o dano direto e descartado e so a area
  // (resolvida mais abaixo, na casa desviada) continua valendo. Sem isto o
  // "erro" ainda causaria dano cheio no alvo e nao seria erro nenhum.
  if (errou) raw = 0;

  if (c.player) c.player.attackAnim = 180;
  if (typeof forgeRegisterOffensiveAction === "function") {
    forgeRegisterOffensiveAction(p, Date.now());
    if (typeof forgeTryTranscendence === "function") {
      const tr = forgeTryTranscendence(p, Date.now());
      if (tr) c.events.push({ t: "buff", nome: "Transcendence" });
    }
  }
  if (raw > 0) {
    // Arma elemental: o golpe se divide em dois tipos de dano, como o
    // Weapon::getCombatDamage do servidor faz com primary/secondary. Uma
    // naga sword (atk 8, elDmg 44) entrega ~15% fisico e ~85% gelo do MESMO
    // valor rolado — nao dois golpes somados. Cada parte sofre a resistencia
    // do seu proprio elemento e aparece como um numero separado na tela.
    const convEl = d.elemento2 ? d.elemento2 : imbEl;
    const convProp = (d.elemento2 && d.propFisica !== undefined)
      ? d.propFisica : imbProp;
    const parte2 = (convEl && !errou) ? convEl : null;
    if (parte2) {
      const fisBruto = Math.max(1, Math.round(raw * convProp));
      const elemBruto = Math.max(1, raw - fisBruto);
      // a resistencia ja foi aplicada com o elemento fisico no rollDamage,
      // entao aqui so a parte elemental precisa ser reavaliada
      const elemFinal = Math.max(1,
        applyResist(target, parte2, applyCharmDamage(p, parte2, elemBruto),
                         playerPiercePct(p, parte2)));
      target.hp -= fisBruto + elemFinal;
      c.stats.damage += fisBruto + elemFinal;
      // dano fisico: numero vermelho e efeito de sangue
      c.events.push({ t: "hit", dmg: fisBruto, x: target.x, y: target.y,
                      sx: pos.x, sy: pos.y, screen: true,
                      projectile: false, el: "physical", crit: critou, fatal: fatalou,
                      race: target.def && target.def.race });
      // dano elemental: cor e animacao do elemento (gelo = azul + ice-attack)
      c.events.push({ t: "hit", dmg: elemFinal, x: target.x, y: target.y,
                      sx: pos.x, sy: pos.y, screen: true,
                      projectile: false, el: parte2, dual: 1 });
    } else {
      target.hp -= raw;
      c.stats.damage += raw;
      c.events.push({ t: "hit", dmg: raw, x: target.x, y: target.y,
                      sx: pos.x, sy: pos.y, screen: true,
                      projectile: isDist || isMagic, el: element, crit: critou, fatal: fatalou,
                      race: target.def && target.def.race,
                      missile: isDist ? playerMissile(p, element)
                                      : (isMagic ? (ELEMENT_MISSILE[element] || "energy") : null) });
    }
    // 15.25: as crippling stances do Sorcerer aplicam Sap Strength /
    // Expose Weakness em qualquer golpe que acerte (auto attack incluso)
    if (typeof stanceApplyDebuffs === "function") stanceApplyDebuffs(p, target);
    // 15.25: wands e rods passam a GERAR mana em vez de consumir. A
    // pagina oficial diz apenas "restauram uma pequena quantidade, quanto
    // maior o poder, maior a quantidade": atamos 2% do dano causado.
    if (isMagic) {
      const mw = Math.max(1, Math.floor(raw * 0.02));
      p.mp = Math.min(maxStats(p).mp, p.mp + mw);
      c.events.push({ t: "mana-wisp", amount: mw,
                      x: pos.x, y: pos.y, screen: true });
    }
  } else if (errou) {
    // o projetil ainda voa, mas cai na casa desviada
    c.events.push({ t: "miss", x: target.x, y: target.y });
  }

  // Cleave (15.x): certas armas atingem alvos adjacentes por 50% do dano
  const wpItem = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  if (wpItem && wpItem.cleave && !isDist && !isMagic) {
    for (const m of c.mobs) {
      if (m === target || m.hp <= 0) continue;
      if (sqmDist(m, target) > 1) continue;   // so os 8 tiles vizinhos
      const corte = Math.max(1, Math.floor(rollDamage(false) * 0.5));
      m.hp -= corte;
      c.stats.damage += corte;
      // crippling stance tambem marca quem tomou o respingo
      if (typeof stanceApplyDebuffs === "function") stanceApplyDebuffs(p, m);
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
    // Municao com area: a matriz vem do script da arma no Canary (burst
    // arrow = 3x3 cheio, diamond arrow = 5x5 SEM os cantos). Antes isso era
    // um raio circular unico lido de `ammo.area`, que nao consegue desenhar
    // a cruz da diamond — e a diamond arrow nem existia no catalogo, entao
    // nunca explodia coisa nenhuma.
    // A area explode onde a FLECHA CAIU. Num tiro certeiro isso e o proprio
    // alvo; num tiro perdido e a casa vizinha sorteada, e por isso a
    // explosao acontece mesmo quando o disparo erra.
    const centro = alvoTiro || target;
    const matriz = ammo.areaMatrix;
    let atingidos = null;
    if (matriz && typeof matrixMobs === "function") {
      atingidos = matrixMobs(c, matriz, centro);
    }
    if (!atingidos && ammo.area) {
      // Fallback para quem nao tem celula (cena de treino, testes antigos):
      // o matrixMobs devolve null nesses casos porque depende de cx/cy.
      // `area` guarda o LADO do quadrado (3 = 3x3, 5 = 5x5), entao o raio e
      // metade disso. Tratar o lado como raio dobrava o tamanho da explosao.
      const R = Math.max(1, Math.floor(ammo.area / 2));
      atingidos = c.mobs.filter((m) => m.hp > 0 && sqmDist(m, centro) <= R);
    }
    if (atingidos) {
      c.events.push({ t: "burst", x: centro.x, y: centro.y });
      // pinta o efeito em TODA celula da area, nao so onde ha monstro
      if (matriz && typeof matrixCells === "function") {
        const cells = matrixCells(matriz, centro);
        if (cells.length > 1) {
          c.events.push({ t: "areafx", cells: cells, screen: true,
                          fx: ammo.areaFx || "explosion-area", el: element });
        }
      }
      for (const m of atingidos) {
        // o alvo principal ja levou o golpe direto; nao conta duas vezes
        if (m === target && !errou) continue;
        if (m.hp <= 0) continue;
        // Rolagem CHEIA em cada alvo. O 0.75 que estava aqui era invencao
        // nossa: no Canary a municao de area executa a mesma formula em
        // todas as casas cobertas, sem desconto por ser respingo.
        const splash = Math.max(1, Math.floor(rollDamage(false)));
        m.hp -= splash;
        c.stats.damage += splash;
        // crippling stance tambem marca quem estava na area da flecha
        if (typeof stanceApplyDebuffs === "function") stanceApplyDebuffs(p, m);
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
  // Sem seleção explícita, não escolhe "a melhor" magia sozinho.
  // O antigo fallback era justamente o módulo Configurar forçando spells.
  if (!usaLista && !(p.config.shooterType === "spell" && p.config.shooterSpell)) return false;

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
    // magia de ESCUDO do knight (15.25) nao sai sem escudo na secundaria
    if (s.shieldSpell) {
      const ess = p.equip && p.equip.shield;
      const iss = ess ? GAMEDATA.items[ess.item] : null;
      if (!iss || iss.t === "quiver") continue;
    }
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
  // stances nao sao magias de ataque: ligam/desligam pela aba ATAQUE do
  // Helper (toggleStance). Sem o guard uma stance esquecida na rotacao
  // sairia como se fosse golpe.
  if (s.stance) return false;

  // 15.25: Shield Bash/Slam precisam de um ESCUDO na mao secundaria (a
  // aljava do paladin nao conta). Sem escudo a magia simplesmente nao sai.
  if (s.shieldSpell) {
    const esh = p.equip && p.equip.shield;
    const ish = esh ? GAMEDATA.items[esh.item] : null;
    if (!ish || ish.t === "quiver") return false;
  }

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

  // Wheel of Destiny: reducao de custo de mana (%) da magia (upgrade da wheel)
  let wheelManaCost = s.mana;
  if (typeof wheelApplySpellBoost === "function" && p.wheel) {
    const _wb = wheelApplySpellBoost(p, id);
    if (_wb.manaPct) wheelManaCost = Math.max(0, Math.round(s.mana * (1 - _wb.manaPct / 100)));
  }
  p.mp -= wheelManaCost;
  addManaSpent(p, combatManaSkillGain(c, wheelManaCost));
  // Augments (TibiaWiki): modificadores de magia vindos dos itens equipados.
  // O bônus de dano/cura é aplicado SOMENTE sobre o dano/cura base da spell.
  const aug = (typeof augmentTotals === "function") ? augmentTotals(p, id) : null;
  // Augment "cooldown" (TibiaWiki): reduz o cooldown da spell (ms).
  let cdReal = Math.max(1000, (s.cd || 2000) - ((aug && aug.cdReduction) || 0));
  // Wheel of Destiny: reducao de cooldown (ms) da magia (upgrade da wheel)
  if (typeof wheelApplySpellBoost === "function" && p.wheel) {
    const _wcd = wheelApplySpellBoost(p, id);
    if (_wcd.cooldownMs) cdReal = Math.max(1000, cdReal - _wcd.cooldownMs);
  }
  // VIP: 30% menos cooldown em Gift of Life e Avatar
  if (typeof vipWheelCooldown === "function" && vipWheelCooldown() < 1) {
    const isWheelSpell = id === "utura-tio" || id.startsWith("uteta-res-");
    if (isWheelSpell) cdReal = Math.max(1000, Math.floor(cdReal * vipWheelCooldown()));
  }
  cdStart(p, id, (cdReal !== (s.cd || 2000))
    ? Object.assign({}, s, { cd: cdReal }) : s, now);
  c.spellCd[id] = now + cdReal;   // mantido: testes antigos leem esse mapa
  if (s.aggr || s.type === "attack") entCdSet(c, p, "offensiveCd", now + 1000);
  if (typeof forgeTryMomentum === "function") {
    const momentum = forgeTryMomentum(p, now);
    if (momentum) c.events.push({ t: "buff", nome: "Momentum" });
  }
  if (s.aggr || s.type === "attack") {
    if (typeof forgeRegisterOffensiveAction === "function") forgeRegisterOffensiveAction(p, now);
    if (typeof forgeTryTranscendence === "function") {
      const tr = forgeTryTranscendence(p, now);
      if (tr) c.events.push({ t: "buff", nome: "Transcendence" });
    }
  }

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
  } else if (s.chain && s.chain > 1) {
    // Chain generica do 15.25 (nova Lightning, Forked Glacier/Thorns):
    // a magia acerta o alvo e ate N-1 alvos ADICIONAIS, saltando sempre
    // para o inimigo mais proximo do ultimo atingido — a mesma regra da
    // chain do Monk, so que sem janela de distancia (o boletim descreve
    // apenas "alvos adicionais proximos").
    const vistos = new Set([target]);
    const lista = [target];
    let atual = target;
    while (lista.length < s.chain) {
      let perto = null, menor = Infinity;
      for (const m of c.mobs) {
        if (m.hp <= 0 || vistos.has(m)) continue;
        const dd = sqmDist(m, atual);
        if (dd < menor) { menor = dd; perto = m; }
      }
      if (!perto) break;
      lista.push(perto);
      vistos.add(perto);
      atual = perto;
    }
    targets = lista;
  } else {
    const nAlvos = typeof spellTargets === "function" ? spellTargets(s) : (s.area ? 4 : 1);
    targets = nAlvos > 1 ? c.mobs.slice(0, nAlvos) : [target];
  }
  // a magia encadeia (monk ou generica)? guia o visual do projetil, que
  // sai do alvo ANTERIOR em vez do jogador, e o evento de raio em cadeia.
  const ehChain = (md && md.chain) || (s.chain && s.chain > 1);
  // fracao do re-strike do 15.25: Death Echo tem 0.5 na propria magia e o
  // Spiritual Outburst do Monk ganhou o mesmo no MONKSPELLDATA
  const echoFrac = s.echo || (md && md.echo) || 0;

  const originalElement = s.element || "energy";
  let elemento = originalElement;
  // golpe de skill fisico do Knight (exori): numero vermelho vivo + estouro
  // cinza (o drainEvents em game.js le a flag)
  const ehExori = KNIGHT_EXORI.has(id);
  if (typeof monkSpellElement === "function") {
    elemento = monkSpellElement(p, s, elemento);
  }
  // stance elemental do Sorcerer (15.25): a conversao e um gatilho UNICO
  // por conjuracao — se a magia anterior era do elemento da stance, esta
  // sai convertida; se esta for do elemento, arma a proxima (stances.js)
  if (typeof stanceConvert === "function") {
    elemento = stanceConvert(p, elemento);
  }
  // Efeito visual: o Monk manda primeiro (o Elemental Bond troca a cor do
  // golpe), depois o efeito proprio da magia vindo do Canary (s.fx) e so
  // entao o fallback por elemento. Sem o s.fx toda magia do mesmo elemento
  // usava a mesma animacao.
  //
  // Conversao elemental (Master of Flames/Thunder/Decay): quando a stance
  // troca o elemento da magia, a sprite TAMBEM precisa trocar — dano de
  // MORTE nao pode explodir laranja (bug visto com exevo gran mas flam
  // sob Master of Decay). s.fx/s.missile valem so para o elemento
  // ORIGINAL, entao a magia convertida cai no efeito/projetil generico do
  // elemento novo (ELEMENTS/ELEMENT_MISSILE no fallback do evento/render).
  const converteuEl = !md && elemento !== originalElement;
  let fxMagia = (md && md.fx && typeof monkFx === "function")
    ? monkFx(p, md.fx) : (converteuEl ? null : (s.fx || null));
  if (!md && typeof stanceDamageFx === "function") {
    fxMagia = stanceDamageFx(p, s, originalElement, elemento, fxMagia);
  }
  // Projetil (COMBAT_PARAM_DISTANCEEFFECT do .lua): magia de mana sai com
  // o missil do elemento (strikes & cia); magia de skill do knight NAO tem
  // distance effect — berserk/fierce berserk/groundshaker/front sweep nao
  // declaram nenhum nos .lua, entao o golpe acontece no SQM atingido sem
  // nada voando ate o alvo (antes caia o "small-stone" do fallback fisico
  // e a animacao parecia "voar"). "$weapon" = CONST_ANI_WEAPONTYPE.
  const modoMagia = !s.f || s.f.modo !== "skill";
  let missMagia = converteuEl ? null : (s.missile || null);
  if (missMagia === "$weapon") missMagia = weaponMissile(p);
  if (!missMagia && modoMagia && !md) missMagia = ELEMENT_MISSILE[elemento] || "energy";
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

  // Elemento que a arma equipada acrescenta as magias de skill (knight com
  // naga sword, fire sword...). Resolvido uma vez fora do laco.
  const armaElemento = (typeof spellWeaponElement === "function")
    ? spellWeaponElement(p) : null;
  const forgeOnslaughtSpell = (typeof forgeTryOnslaught === "function") ? forgeTryOnslaught(p) : null;

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
    // Augment "base damage" (Impact): +% sobre o dano base, antes de
    // stances/forja/crítico (regra oficial confirmada em 17/05/2024).
    if (aug && aug.baseDmg > 0) {
      dmg = Math.max(1, Math.floor(dmg * (1 + aug.baseDmg / 100)));
    }
    if (monkMult !== 1) dmg = Math.floor(dmg * monkMult);
    // buff de vocacao (Virtude, Protector) tambem afeta magia
    if (typeof buffTotals === "function") {
      dmg = Math.floor(dmg * buffTotals(p, now).dmgDealt);
    }
    // ---- efeitos de stance do 15.25 sobre a magia:
    //   - Protector: -15% de dano causado (mesmo multiplicador do ataque);
    //   - Master of Flames: +4% base power nas magias de fogo;
    //   - Master of Thunder: +4% de chance de CRITICO (150%) em energia;
    //   - Master of Decay: 10% de chance de +30% de dano extra em morte.
    // O critico do update sai com o efeito "CRIT!" (ver drainEvents).
    let critSt = false;
    let fatalSpell = false;
    let extraSpellPct = 0;
    if (typeof stanceTotals === "function") {
      const stT = stanceTotals(p);
      if (stT.dmgDealt !== 1) dmg = Math.floor(dmg * stT.dmgDealt);
      const pEl = stT.elemPct[elemento] || 0;
      if (pEl) dmg = Math.max(1, Math.floor(dmg * (1 + pEl / 100)));
      const crCh = stT.elemCrit[elemento] || 0;
      const crDg = stT.elemCritDmg[elemento] || 0;
      if (crCh && Math.random() < crCh / 100) {
        extraSpellPct += 50;
        critSt = true;
      } else if (crDg && Math.random() < 0.10) {
        extraSpellPct += crDg;
        critSt = true;
      }
    }
    // Crítico intrínseco (Summer Update 2025): 5%/10% também vale para
    // magias — rola quando a stance não deu crítico.
    if (!critSt && typeof rollPlayerCrit === "function") {
      const critSpell = rollPlayerCrit(p);
      if (critSpell.crit) {
        extraSpellPct += critSpell.extraPct;
        critSt = true;
      }
    }
    // Augments de crítico (TibiaWiki): "critical extra damage" aumenta o
    // dano crítico DA spell; "critical hit chance" pode conceder crítico à
    // spell mesmo sem outra fonte de chance.
    if (aug) {
      if (!critSt && aug.critChance > 0 &&
          Math.random() * 100 < aug.critChance) {
        critSt = true;
      }
      if (critSt && aug.critDmg > 0) extraSpellPct += aug.critDmg;
    }
    // Swift Foot (15.25): conjurar durante o buff custa -30% de dano
    if (typeof swiftFootMul === "function") dmg = Math.floor(dmg * swiftFootMul(p));
    if (forgeOnslaughtSpell) {
      extraSpellPct += (forgeOnslaughtSpell.bonusPct || 60);
      fatalSpell = true;
    }
    const transcendSpellPct = (typeof forgeTranscendenceDamagePct === "function")
      ? forgeTranscendenceDamagePct(p, now) : 0;
    if (transcendSpellPct > 0) {
      extraSpellPct += transcendSpellPct;
      critSt = true;
    }
    if (extraSpellPct > 0) dmg = Math.max(1, Math.floor(dmg * (1 + extraSpellPct / 100)));
    // Wheel of Destiny: bonus de dano % da magia (upgrade da wheel) + critico
    if (typeof wheelApplySpellBoost === "function" && p.wheel) {
      const wb = wheelApplySpellBoost(p, id);
      if (wb.damagePct) dmg = Math.max(1, Math.floor(dmg * (1 + wb.damagePct / 100)));
      if (wb.critChance > 0 && !critSt && Math.random() * 100 < wb.critChance) {
        critSt = true;
        dmg = Math.max(1, Math.floor(dmg * (1 + (wb.critDamage || 0) / 100)));
      }
    }
    if (typeof wheelDamageMul === "function" && p.wheel) {
      dmg = Math.max(1, Math.floor(dmg * wheelDamageMul(p)));
    }
    dmg = applyCharmDamage(p, elemento, dmg);
    // Magia de skill com arma elemental: o servidor manda o golpe em duas
    // partes (damage.primary do weapon->getWeaponDamage e damage.secondary
    // do weapon->getElementType), entao um knight de naga sword ve exori
    // sair como fisico + gelo. So vale para as magias de melee que usam a ARMA:
    // magias de mana (modo "magic") e magias de paladino nao carregam elemento de arma.
    const armaEl = (s.f && s.f.modo !== "magic" && !faixaMonk && (!s.vocs || !s.vocs.includes("paladin")))
      ? armaElemento : null;
    if (armaEl) {
      const fis = Math.max(1, Math.round(dmg * armaEl.propFisica));
      const ele = Math.max(1, dmg - fis);
      const fisFinal = applyMonsterMitigation(t, elemento,
        applyResist(t, elemento, fis, playerPiercePct(p, elemento)));
      const eleFinal = Math.max(1,
        applyMonsterMitigation(t, armaEl.el,
          applyResist(t, armaEl.el, applyCharmDamage(p, armaEl.el, ele),
                      playerPiercePct(p, armaEl.el))));
      t.hp -= fisFinal + eleFinal;
      c.stats.damage += fisFinal + eleFinal;
      // Augments de life/mana leech (TibiaWiki): leech extra da spell.
      if (aug && (aug.lifeLeech > 0 || aug.manaLeech > 0)) {
        augmentApplyLeech(c, p, aug, fisFinal + eleFinal);
      }
      if (s.cond && typeof applyCondition === "function") {
        applyCondition(t, s.cond.tipo, s.cond.dano, s.cond.golpes);
      }
      // 15.25, por alvo: crippling stance marca o alvo; a magia de escudo
      // enfraquece o proximo auto attack; o eco re-bate em 1s
      if (typeof stanceApplyDebuffs === "function") stanceApplyDebuffs(p, t, now);
      if (s.weakNext) t.weakNextUntil = now + 10000;
      if (echoFrac) {
        c.delayedHits.push({ at: now + 1000, mobId: t.id,
          dmg: Math.max(1, Math.floor((fisFinal + eleFinal) * echoFrac)),
          el: elemento, fx: fxMagia });
      }
      c.events.push({ t: "hit", dmg: fisFinal, x: t.x, y: t.y,
                      sx: c.player ? c.player.x : 0.18,
                      sy: c.player ? c.player.y : 0.62, screen: true,
                      projectile: (idx === 0 || !!ehChain) && !!missMagia,
                      el: elemento, spell: s.name, fx: fxMagia,
                      race: t.def && t.def.race, crit: critSt, fatal: fatalSpell,
                      chain: ehChain && idx > 0 ? 1 : 0,
                      exori: ehExori ? 1 : 0,
                      missile: missMagia });
      c.events.push({ t: "hit", dmg: eleFinal, x: t.x, y: t.y,
                      sx: c.player ? c.player.x : 0.18,
                      sy: c.player ? c.player.y : 0.62, screen: true,
                      projectile: false, el: armaEl.el, dual: 1,
                      crit: critSt, fatal: fatalSpell });
      return;
    }
    dmg = applyMonsterMitigation(t, elemento, applyResist(t, elemento, dmg, playerPiercePct(p, elemento)));
    t.hp -= dmg;
    c.stats.damage += dmg;
    // Augments de life/mana leech (TibiaWiki): leech extra da spell.
    if (aug && (aug.lifeLeech > 0 || aug.manaLeech > 0)) {
      augmentApplyLeech(c, p, aug, dmg);
    }
    // Wheel of Destiny: life/mana leech extra da magia (upgrade da wheel)
    if (typeof wheelApplySpellBoost === "function" && p.wheel) {
      const wb = wheelApplySpellBoost(p, id);
      if (wb.lifeLeech || wb.manaLeech) {
        augmentApplyLeech(c, p, { lifeLeech: wb.lifeLeech, manaLeech: wb.manaLeech }, dmg);
      }
    }
    // magias que aplicam condition (Ignite, Envenom, Curse...)
    if (s.cond && typeof applyCondition === "function") {
      applyCondition(t, s.cond.tipo, s.cond.dano, s.cond.golpes);
    }
    // 15.25, por alvo: crippling stance (Sap Strength / Expose Weakness),
    // weakNext do Shield Bash/Slam ("reduz em 50% o dano do proximo
    // ataque automatico do alvo realizado em ate 10 segundos") e o eco —
    // "apos 1 segundo a mesma area e atingida novamente por 50% do dano
    // inicial" (Death Echo / Spiritual Outburst).
    if (typeof stanceApplyDebuffs === "function") stanceApplyDebuffs(p, t, now);
    if (s.weakNext) t.weakNextUntil = now + 10000;
    if (echoFrac) {
      c.delayedHits.push({ at: now + 1000, mobId: t.id,
        dmg: Math.max(1, Math.floor(dmg * echoFrac)),
        el: elemento, fx: fxMagia });
    }
    c.events.push({ t: "hit", dmg: dmg, x: t.x, y: t.y,
                    sx: c.player ? c.player.x : 0.18,
                    sy: c.player ? c.player.y : 0.62,
                    screen: true,
                    // no chain o projetil sai do alvo ANTERIOR, nao do
                    // jogador: e o golpe saltando de inimigo em inimigo.
                    // Sem DISTANCEEFFECT na magia (modo skill), nada voa.
                    projectile: (idx === 0 || !!ehChain) && !!missMagia,
                    el: elemento, spell: s.name, fx: fxMagia,
                    crit: critSt, fatal: fatalSpell,
                    chain: ehChain && idx > 0 ? 1 : 0,
                    exori: ehExori ? 1 : 0,
                    missile: missMagia });
  });
  if (areaTiles.length > 1) {
    c.events.push({ t: "areafx", cells: areaTiles, screen: true,
                    fx: fxMagia || (ELEMENTS[elemento] || ELEMENTS.physical).fx,
                    el: elemento });
  }
  if (ehChain && targets.length > 1) {
    c.events.push({ t: "chain", n: targets.length, x: target.x, y: target.y,
                    screen: true,
                    fx: (md && md.chainFx) || "white-energy-spark" });
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
  if (entCd(c, p, "runeCd") > now) return false;
  if (entCd(c, p, "offensiveCd") > now) return false;
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
  entCdSet(c, p, "runeCd", now + (s.cd || 2000));
  entCdSet(c, p, "offensiveCd", now + 1000);
  if (typeof forgeRegisterOffensiveAction === "function") forgeRegisterOffensiveAction(p, now);
  if (typeof forgeTryTranscendence === "function") {
    const tr = forgeTryTranscendence(p, now);
    if (tr) c.events.push({ t: "buff", nome: "Transcendence" });
  }
  const forgeOnslaughtRune = (typeof forgeTryOnslaught === "function") ? forgeTryOnslaught(p) : null;
  const transcendRunePct = (typeof forgeTranscendenceDamagePct === "function")
    ? forgeTranscendenceDamagePct(p, now) : 0;

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
      let extraRunePct = 0;
      let runeCrit = false;
      let runeFatal = false;
      if (forgeOnslaughtRune) {
        extraRunePct += (forgeOnslaughtRune.bonusPct || 60);
        runeFatal = true;
      }
      if (transcendRunePct > 0) {
        extraRunePct += transcendRunePct;
        runeCrit = true;
      }
      if (extraRunePct > 0) dmg = Math.max(1, Math.floor(dmg * (1 + extraRunePct / 100)));
      // charms e resistencia do monstro, na mesma ordem do ataque normal
      if (typeof applyCharmDamage === "function") {
        dmg = applyCharmDamage(p, s.element, Math.max(1, dmg));
      }
      dmg = applyMonsterMitigation(alvo, s.element,
        applyResist(alvo, s.element, Math.max(1, dmg), playerPiercePct(p, s.element)));
      alvo.hp -= dmg;
      c.stats.damage += dmg;
      total += dmg;
      c.events.push({ t: "hit", dmg: dmg, x: alvo.x, y: alvo.y,
                      sx: c.player ? c.player.x : 0.18,
                      sy: c.player ? c.player.y : 0.62,
                      screen: true,
                      projectile: alvo === target,
                      el: s.element, rune: s.name,
                      crit: runeCrit, fatal: runeFatal,
                      fx: s.fx || null, missile: missile });
    }
    // crippling stances do Sorcerer (15.25): "spells, runes e auto
    // attacks aplicam Sap Strength / Expose Weakness"
    if (typeof stanceApplyDebuffs === "function") stanceApplyDebuffs(p, alvo, now);
    // conditions (soulfire queima, poison bomb envenena): o dano vem no
    // tempo, entao a runa pode nem ter dano direto
    if (s.cond && typeof applyCondition === "function") {
      applyCondition(alvo, s.cond.tipo, s.cond.dano || 1, s.cond.golpes || 5);
      c.events.push({ t: "poisoned", x: alvo.x, y: alvo.y,
                      name: alvo.def ? alvo.def.name : "" });
    }
    if (!s.f) {
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

/* ====================================================== Critical Heal (2026)
 * Vocation Adjustments 2026: Druids com o perk "Blessing of the Grove"
 * (Revelation Perk) podem curar além do normal — a cura usa a MESMA chance
 * de Critical Hit e o MESMO dano crítico extra do personagem para melhorar
 * o valor curado.
 * https://tibia.fandom.com/wiki/Critical_Heal
 */

/* Fontes de crítico do personagem (Critical Hit — Summer Update 2025):
 * todo personagem tem 5% de chance intrínseca de 10% de dano extra; o
 * Strike imbuement soma a chance fixa de 10% e o bônus de dano.
 * https://tibia.fandom.com/wiki/Critical_Hit
 */
function playerCritChancePct(p) {
  const imb = typeof imbTotals === "function" ? imbTotals(p) : null;
  const base = 5 + ((imb && imb.critChance) ? imb.critChance : 0);
  // VIP: +3% chance de crítico
  return base + (typeof vipCritBonus === "function" ? vipCritBonus() * 100 : 0);
}

function playerCritExtraPct(p) {
  const imb = typeof imbTotals === "function" ? imbTotals(p) : null;
  return 10 + ((imb && imb.crit) ? imb.crit : 0);
}

/* Rola o crítico do golpe: { crit, extraPct }. */
function rollPlayerCrit(p) {
  const chance = playerCritChancePct(p);
  if (chance <= 0 || Math.random() * 100 >= chance) return { crit: false, extraPct: 0 };
  return { crit: true, extraPct: playerCritExtraPct(p) };
}

/* O critical heal é exclusivo do Druid (Blessing of the Grove). O toggle
 * p.config.criticalHeal permite desligar no Helper, se um dia houver o
 * sistema de perks; por padrão nasce ligado para o Druid. */
function criticalHealEnabled(p) {
  return !!(p && p.voc === "druid" && (!p.config || p.config.criticalHeal !== false));
}

/* Chance de critical heal em %: 10% BASE para o Druid (pedido do dono) +
 * Strike imbuement (que soma à chance de crit hit). */
function criticalHealChancePct(p) {
  // 10% base do druid + o bônus do Strike (imbutido no crit hit chance).
  return 10 + Math.max(0, playerCritChancePct(p) - 5);
}

/* Dano crítico extra em % usado no critical heal: as mesmas fontes do
 * golpe crítico (10% intrínseco + Strike) + Transcendence ativa. */
function criticalHealExtraPct(p) {
  let extra = playerCritExtraPct(p);
  if (typeof forgeTranscendenceDamagePct === "function") {
    extra += forgeTranscendenceDamagePct(p, Date.now());
  }
  return extra;
}

/* Rola o critical heal: { crit, extraPct }. Retorna crit=false quando o
 * personagem não pode (não é druid), a chance é 0 ou o roll falhou. */
function tryCriticalHeal(p) {
  if (!criticalHealEnabled(p)) return { crit: false, extraPct: 0 };
  const chance = criticalHealChancePct(p);
  if (chance <= 0) return { crit: false, extraPct: 0 };
  if (Math.random() * 100 >= chance) return { crit: false, extraPct: 0 };
  return { crit: true, extraPct: criticalHealExtraPct(p) };
}

/* Cura: spell primeiro, depois runa/pocao.
 *
 * Cooldowns do 15.x, como no cliente oficial:
 *   - magia de cura: trava por 1s o caminho de MAGIA (healCd) — e o grupo
 *     Healing — alem do cooldown proprio da spell;
 *   - potion: trava por 1s TODAS as potions (potionCd), mas NAO trava
 *     magia: no Tibia da para beber a potion e soltar exura no mesmo segundo.
 */
function tryHeal(c, p, now) {
  const max = maxStats(p);
  const pct = (p.hp / max.hp) * 100;
  const spellAt = p.config.healSpellAt === undefined ? (p.config.healAt || 90) : p.config.healSpellAt;
  const itemAt = p.config.healItemAt === undefined ? (p.config.healAt || 90) : p.config.healItemAt;
  if (pct > Math.max(spellAt, itemAt)) return false;

  // 1. magia de cura: usa apenas se o HP estiver no limite configurado para spell.
  if (pct <= spellAt && !(entCd(c, p, "healCd") > now)) {
    const heals = [];
    const selectedHealSpell = p.config.healSpell;
    if (selectedHealSpell) {
      const s = SPELLS[selectedHealSpell];
      if (s && s.type === "heal" && s.vocs.indexOf(p.voc) !== -1 &&
          p.level >= s.lvl && p.mp >= s.mana &&
          cdReady(p, selectedHealSpell, now)) heals.push([selectedHealSpell, s]);
    } // sem spell selecionada: não faz fallback automático

    if (heals.length) {
      // sem selecao manual: usa a cura que mais restaura NESTE personagem,
      // calculada pela formula do canary e nao por um peso fixo
      if (!selectedHealSpell) {
        heals.sort((a, b) => spellValues(p, b[1]).max - spellValues(p, a[1]).max);
      }
      const [idCura, s] = heals[0];
      let amount = Math.max(1, rollSpell(p, s));
      // Augment "base healing" (TibiaWiki): +% sobre a cura base da spell,
      // antes de stances/crítico (regra oficial de 17/05/2024).
      if (typeof augmentTotals === "function") {
        const augCura = augmentTotals(p, idCura);
        if (augCura.baseHeal > 0) {
          amount = Math.max(1, Math.floor(amount * (1 + augCura.baseHeal / 100)));
        }
      }
      // stances 15.25: Sharpshooter ativa reduz 25% a cura CONJURADA do
      // paladin; Shared Conservation soma 10% de autocura
      if (typeof stanceTotals === "function") {
        const stH = stanceTotals(p);
        if (stH.healMul !== 1) amount = Math.max(1, Math.floor(amount * stH.healMul));
        if (stH.healSelf) amount = Math.max(1, Math.floor(amount * (1 + stH.healSelf)));
      }
      // Critical Heal (Vocation Adjustments 2026): o Druid com Blessing of
      // the Grove usa a chance de Critical Hit e o dano crítico extra do
      // personagem para curar além do normal.
      let ch = { crit: false, extraPct: 0 };
      if (typeof tryCriticalHeal === "function") ch = tryCriticalHeal(p);
      if (ch.crit && ch.extraPct > 0) {
        amount = Math.max(1, Math.floor(amount * (1 + ch.extraPct / 100)));
      }
      // Wheel of Destiny: cura % da magia (upgrade da wheel) + cura global
      if (typeof wheelApplySpellBoost === "function" && p.wheel) {
        const _wh = wheelApplySpellBoost(p, idCura);
        if (_wh.healPct) amount = Math.max(1, Math.floor(amount * (1 + _wh.healPct / 100)));
      }
      if (typeof wheelHealMul === "function" && p.wheel) {
        amount = Math.max(1, Math.floor(amount * wheelHealMul(p)));
      }
      // Wheel of Destiny: reducao de custo de mana (%) da cura
      let _curaMana = s.mana;
      if (typeof wheelApplySpellBoost === "function" && p.wheel) {
        const _wm = wheelApplySpellBoost(p, idCura);
        if (_wm.manaPct) _curaMana = Math.max(0, Math.round(s.mana * (1 - _wm.manaPct / 100)));
      }
      cdStart(p, idCura, s, now);
      if (typeof forgeTryMomentum === "function") {
        const momentum = forgeTryMomentum(p, now);
        if (momentum) c.events.push({ t: "buff", nome: "Momentum" });
      }
      p.mp -= _curaMana;
      addManaSpent(p, combatManaSkillGain(c, _curaMana));
      p.hp = Math.min(max.hp, p.hp + amount);
      entCdSet(c, p, "healCd", now + 1000);
      c.events.push({ t: "heal", amount: amount, spell: s.name, crit: ch.crit, critExtraPct: ch.extraPct });
      c.events.push({ t: "say", text: spellWords(selectedHealSpell || heals[0][0], s) });
      return true;
    }
  }
  // 2. item/runa/potion de cura: usa apenas se HP estiver no limite de item
  //    e se as potions nao estiverem no cooldown compartilhado de 1s.
  //    "NÃO USAR POTIONS" (helper) desliga este bloco inteiro.
  if (!p.config.noHealthPotions && p.config.useRunes && pct <= itemAt && !(entCd(c, p, "potionCd") > now)) {
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
      // potion de HP que tambem da mana (spirit/great spirit) restaura os
      // dois no mesmo gole — no canary potions.lua as spirit fazem as duas
      // rolagens. Antes a mana extra era ignorada pelo motor.
      let manaAmount = 0;
      if (s.mana) {
        manaAmount = Math.floor(s.mana[0] + Math.random() * (s.mana[1] - s.mana[0]));
        p.mp = Math.min(max.mp, p.mp + manaAmount);
      }
      let amount = Math.floor(pw[0] + Math.random() * (pw[1] - pw[0]));
      // Shared Conservation (15.25): +10% de autocura vale tambem para
      // potion/runa usada em si mesmo
      if (typeof stanceTotals === "function" && stanceTotals(p).healSelf) {
        amount = Math.max(1, Math.floor(amount * (1 + stanceTotals(p).healSelf)));
      }
      // Critical Heal (2026): a runa de cura (UH/IH) e uma magia de cura
      // conjurada — o Druid com Blessing of the Grove critica ela também.
      // Potions NÃO críticam (como no oficial).
      let chR = { crit: false, extraPct: 0 };
      if (s.kind === "rune" && typeof tryCriticalHeal === "function") {
        chR = tryCriticalHeal(p);
        if (chR.crit && chR.extraPct > 0) {
          amount = Math.max(1, Math.floor(amount * (1 + chR.extraPct / 100)));
        }
      }
      // Wheel of Destiny: cura global (revelation)
      if (typeof wheelHealMul === "function" && p.wheel) {
        amount = Math.max(1, Math.floor(amount * wheelHealMul(p)));
      }
      p.hp = Math.min(max.hp, p.hp + amount);
      // potion trava TODAS as potions por 1s; runa de cura (UH/IH) nao bebe,
      // entao usa o cooldown de runa e mantem o healCd antigo
      if (s.kind === "rune") entCdSet(c, p, "healCd", now + 1000);
      else entCdSet(c, p, "potionCd", now + 1000);
      if (typeof forgeTryMomentum === "function") {
        const momentum = forgeTryMomentum(p, now);
        if (momentum) c.events.push({ t: "buff", nome: "Momentum" });
      }
      c.events.push({ t: "heal", amount: amount, rune: s.name,
                      mana: manaAmount, supply: best, drunk: s.kind !== "rune",
                      crit: chR.crit, critExtraPct: chR.extraPct });
      // o famoso "Aahhh..." do Tibia: beber potion NAO fala o nome do item;
      // runa continua anunciando o nome (el e uma conjuracao, nao um gole)
      if (s.kind === "rune") {
        c.events.push({ t: "say", text: s.name.toLowerCase(), supply: true });
      } else {
        c.events.push({ t: "say", text: "Aahhh...", supply: true, drunk: 1 });
      }
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
 * ao mesmo tempo. SO lanca a magia escolhida em p.config.hasteSpell no
 * helper (sem selecao, o personagem nao usa velocidade sozinho).
 */
function tryHaste(c, p, now) {
  if (typeof HASTEDATA === "undefined") return false;
  if (p.config && p.config.autoHaste === false) return false;
  // SO usa velocidade quando o jogador escolheu uma magia no helper
  // (p.config.hasteSpell). Antes o tryHaste pegava a MELHOR haste
  // disponivel sozinho e o paladin lancava utamo tempo san / Swift Foot
  // sem ter configurado nada — a UI dizia "sem seleção não usa", mas o
  // codigo nao respeitava.
  const escolhida = p.config && p.config.hasteSpell;
  if (!escolhida || !SPELLS[escolhida]) return false;
  if (entCd(c, p, "hasteCd") > now) return false;
  // ja tem uma ativa? nao gasta mana de novo
  if (typeof hasteAtiva === "function" && hasteAtiva(p, now)) return false;

  const sp = SPELLS[escolhida];
  if (sp.vocs && sp.vocs.indexOf(p.voc) === -1) return false;
  if (p.level < (sp.lvl || 1) || p.mp < sp.mana) return false;
  if (!cdReady(p, escolhida, now)) return false;

  p.mp -= sp.mana;
  addManaSpent(p, combatManaSkillGain(c, sp.mana));
  cdStart(p, escolhida, sp, now);
  if (typeof forgeTryMomentum === "function") {
    const momentum = forgeTryMomentum(p, now);
    if (momentum) c.events.push({ t: "buff", nome: "Momentum" });
  }
  if (!p.buffs) p.buffs = {};
  p.buffs[escolhida] = now + (HASTEDATA[escolhida].dur || 30000);
  entCdSet(c, p, "hasteCd", now + 2000);
  c.events.push({ t: "say", text: spellWords(escolhida, sp) });
  c.events.push({ t: "buff", nome: HASTEDATA[escolhida].nome || sp.name });
  return true;
}

function tryBuff(c, p, now) {
  if (typeof BUFFS === "undefined") return false;
  const chave = p.config && p.config.buff;
  if (!chave || !BUFFS[chave]) return false;
  if (hasBuff(p, chave, now)) return false;
  if (entCd(c, p, "buffCd") > now) return false;
  const s = SPELLS[chave];
  if (!s) return false;
  if (s.vocs && s.vocs.indexOf(p.voc) === -1) return false;
  if (p.level < (s.lvl || 1) || p.mp < s.mana) return false;
  if (!cdReady(p, chave, now)) return false;
  p.mp -= s.mana;
  addManaSpent(p, combatManaSkillGain(c, s.mana));
  cdStart(p, chave, s, now);
  if (typeof forgeTryMomentum === "function") {
    const momentum = forgeTryMomentum(p, now);
    if (momentum) c.events.push({ t: "buff", nome: "Momentum" });
  }
  applyBuff(p, chave, now);
  entCdSet(c, p, "buffCd", now + Math.max(1000, s.cd || 2000));
  c.events.push({ t: "say", text: spellWords(chave, s) });
  c.events.push({ t: "buff", nome: BUFFS[chave].nome });
  return true;
}

/* Usa a magia de cura de condition (exana ...) quando o jogador esta
 * sofrendo um efeito e conhece a magia. Prioriza o efeito mais nocivo. */
const CURE_ORDEM = ["cursed", "fire", "energy", "bleed", "poison", "freezing"];

function tryCureCondition(c, p, now) {
  // Exana só é automática quando o jogador habilitar explicitamente essa
  // automação; sem isso nenhuma magia não marcada no Helper é conjurada.
  if (!p.config || !p.config.autoCure) return false;
  if (!p.conditions) return false;
  if (entCd(c, p, "cureCd") > now) return false;
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
    if (typeof forgeTryMomentum === "function") {
      const momentum = forgeTryMomentum(p, now);
      if (momentum) c.events.push({ t: "buff", nome: "Momentum" });
    }
    clearCondition(p, tipo);
    entCdSet(c, p, "cureCd", now + 1000);
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

/* Repoe mana com potions.
 *
 * Antes esta funcao nao tinha cooldown NENHUM: como combate roda em ticks
 * de 100ms, uma mana potion era bebida a cada tick enquanto a mana estivesse
 * abaixo do limite — 10 goles por segundo. No Tibia a potion trava todas as
 * potions por 1s (o mesmo potionCd da cura de item), entao uma mana potion
 * por segundo e o maximo. */
/* EXETA AMP RES / EXETA RES (Chivalrous Challenge / Challenge) do Knight.
 * Marca os monstros ao alcance para focarem o knight e, como o Challenge do
 * Tibia, os marcados causam 20% MENOS dano a ele. Exeta res marca 1 (o mais
 * próximo); exeta amp res marca TODOS ao alcance (7 SQM). Os dois são
 * ligados/desligados na aba Ataque do Helper (p.config.exetaRes /
 * p.config.exetaAmpRes) e PODEM ficar ligados juntos — o amp res tem
 * prioridade e o exeta res cobre quando ele está em cooldown. */
function tryChallenge(c, p, now) {
  now = now || Date.now();
  if (!c || !c.mobs || !c.mobs.length) return false;
  // só knight (e elite knight)
  if (p.voc !== "knight" && p.voc !== "elite knight") return false;
  const cfg = p.config || {};
  // MODO BOX: o knight na formação SEMPRE casta os dois (exeta res + amp
  // res) — faz parte da função dele na box (pedido do dono). O modo pode
  // vir do modal de instância (c.huntMode).
  const boxForca = cfg.attackMode === "box" ||
    (typeof formationMode === "function" && formationMode(c, { p: p }) === "box");
  const useAmp = !!cfg.exetaAmpRes || boxForca;
  const useRes = !!cfg.exetaRes || boxForca;
  if (!useAmp && !useRes) return false;
  const ids = useAmp ? ["exeta-amp-res", useRes ? "exeta-res" : null]
                     : ["exeta-res"];
  for (const id of ids) {
    if (!id) continue;
    const s = (typeof SPELLS !== "undefined") ? SPELLS[id] : null;
    if (!s || p.level < s.lvl || p.mp < s.mana) continue;
    if (typeof cdReady === "function" && !cdReady(p, id, now)) continue;
    if (doChallengeCast(c, p, now, id, s)) return true;
  }
  return false;
}

/* Casta a spell de challenge escolhida (exeta res = 1 alvo; exeta amp res =
 * TODOS ao alcance) e emite os eventos com o efeito oficial de cada uma. */
function doChallengeCast(c, p, now, id, s) {
  const amp = id === "exeta-amp-res";
  const pl = c.player || { x: 0.18, y: 0.62 };
  let marcou = 0;
  for (const m of c.mobs) {
    if (m.hp <= 0) continue;
    const d = (pl.cx !== undefined && m.cx !== undefined &&
               typeof sqmDistance === "function")
      ? sqmDistance(pl, m) : 1;
    if (d > (s.range || 7)) continue;
    // pedido do dono (v24): o exeta RES também pega TODOS os monstros ao
    // alcance (antes marcava só 1)
    m.challengedUntil = now + 10000;   // 10s de Challenge
    if (amp && monsterTargetDistance(m) > 1) m.forceMeleeUntil = now + 10000;
    marcou++;
  }
  if (!marcou) return false;

  p.mp -= s.mana;
  if (typeof addManaSpent === "function") addManaSpent(p, s.mana);
  if (typeof cdStart === "function") cdStart(p, id, s, now);
  c.events.push({ t: "challenge", x: pl.x, y: pl.y, screen: true,
                  count: marcou, spell: s.name, id: id });
  c.events.push({ t: "say", text: s.words || (amp ? "exeta amp res" : "exeta res") });
  return true;
}

function tryMana(c, p, now) {
  now = now || Date.now();
  if (entCd(c, p, "potionCd") > now) return false;
  // MAGIC SHIELD ATIVO (utamo vita 12.55+): o escudo tem POOL própria e a
  // regra oficial diz que ela NÃO recarrega com potions — só recastando a
  // spell. Com o escudo ativo o mage não bebe mana potion (e no energy ring
  // clássico a mana ia toda para o dano, então também não adianta beber).
  if (typeof isMagicShieldActive === "function" && isMagicShieldActive(p, now)) return false;
  const max = maxStats(p);
  const manaAt = (p.config.manaAt === undefined ? 50 : p.config.manaAt) / 100;
  if (p.mp > max.mp * manaAt) return false;
  // "NÃO USAR POTIONS" (helper) desliga potions de mana também
  if (p.config.noManaPotions) return false;
  if (p.config.manaSupply === "") return false;
  const candidates = [];
  if (p.config.manaSupply) candidates.push(p.config.manaSupply);
  // Sem potion selecionada no Helper, não consome mana potion.
  for (const slug of candidates) {
    const s = SUPPLIES[slug];
    // potions spirit tem cura+mana: elas so entram aqui quando o jogador as
    // escolheu explicitamente como fonte de mana (senao o motor bebia a
    // spirit cara como se fosse mana potion comum)
    if (!s || !(s.type === "mana" || (s.both && p.config.manaSupply === slug))) continue;
    if (!canRechargeSupply(p, slug)) continue;
    if (!consumeSupplyCharge(c, p, slug)) continue;
    const amount = Math.floor(s.mana[0] + Math.random() * (s.mana[1] - s.mana[0]));
    p.mp = Math.min(max.mp, p.mp + amount);
    // spirit tambem cura HP no mesmo gole
    let healAmount = 0;
    if (s.both && s.heal) {
      healAmount = Math.floor(s.heal[0] + Math.random() * (s.heal[1] - s.heal[0]));
      p.hp = Math.min(max.hp, p.hp + healAmount);
    }
    entCdSet(c, p, "potionCd", now + 1000);   // cooldown por personagem (party combat)
    if (typeof forgeTryMomentum === "function") {
      const momentum = forgeTryMomentum(p, now);
      if (momentum) c.events.push({ t: "buff", nome: "Momentum" });
    }
    c.events.push({ t: "mana", amount: amount, supply: slug,
                    heal: healAmount, drunk: 1 });
    // o gole do Tibia: "Aahhh..." — nunca o nome da potion
    c.events.push({ t: "say", text: s.kind === "food" ? "Munch." : "Aahhh...",
                    supply: true, drunk: 1 });
    return true;
  }
  return false;
}

/* Monstro ataca o jogador */
/* Fala periodica do monstro, portada do Monster::onThinkYell do Canary.
 *
 * O servidor acumula o tempo desde a ultima checagem em yellTicks; quando
 * passa de yellSpeedTicks (o `interval` do monster.voices), zera o contador
 * e faz UMA rolagem de yellChance. Passando, sorteia uma fala do vetor e a
 * envia como TALKTYPE_MONSTER_YELL (`yell = true`) ou TALKTYPE_MONSTER_SAY.
 *
 * Detalhe que importa: o contador zera mesmo quando a rolagem falha, entao
 * a criatura nao "acumula" chance ao longo do tempo.
 */
function monsterThinkYell(mob, dt) {
  const v = mob.def && mob.def.voices;
  if (!v || !v.list || !v.list.length) return;
  const intervalo = v.int || 5000;
  if (!intervalo) return;
  mob.yellTicks = (mob.yellTicks || 0) + dt;
  if (mob.yellTicks < intervalo) return;
  mob.yellTicks = 0;
  // uniform_random(1, 100) <= chance
  if ((v.ch || 0) < Math.floor(Math.random() * 100) + 1) return;
  const fala = v.list[Math.floor(Math.random() * v.list.length)];
  if (!fala) return;
  if (typeof creatureSay === "function") {
    creatureSay(mob, fala.t,
                fala.y ? TALK.MONSTER_YELL : TALK.MONSTER_SAY);
  }
}

/* ================================================================== skills *
 * Habilidades do monstro, do .lua da criatura (MONSTERDATA.skills e
 * defSkills — o tools/import_monsters.py le os blocos attacks/defenses).
 *
 * A cada turno de ataque (attackSpeed do bicho) rolamos a lista NA ORDEM
 * do .lua, como o Monster::doAttacking do servidor: a primeira habilidade
 * pronta (intervalo proprio decorrido) que passar na chance entra em cena;
 * se nenhuma sair, cai o corpo-a-corpo. Cada habilidade tem relogio
 * proprio — o spell:interval — guardado em mob.skillCds.
 *
 * O que cada campo significa (espelha os parametros do spell:... do lua):
 *   el     elemento (CombatType)
 *   min/max faixa de dano, ou de cura nas defensivas
 *   int    intervalo proprio (spell:interval)
 *   ch     chance por turno (spell:chance)
 *   range  alcance do arremesso (spell:range)
 *   radius raio da explosao (spell:radius): sem `alvo` explode NO MONSTRO
 *          (a GFB do demon), com `alvo` explode NO JOGADOR
 *   length onda que sai do monstro na direcao do alvo (spell:length/spread)
 *   fx     efeito no impacto (COMBAT_PARAM_EFFECT)
 *   miss   arremessavel (COMBAT_PARAM_DISTANCEEFFECT)
 *   n      nome da condition/efeito (texto do spell:name)
 *
 * Removido a pedido do jogador:
 *   - "invisible": nao existe mais invisibilidade no jogo, entao o utana
 *     vid dos monstros (warlock, stalker...) nunca e usado;
 *   - fuga com hp baixo (runHealth/runAt): ver gridai.js.
 * Sem correspondente num idle solo (habilidade ignorada, documentado):
 *   - summon/challenge/outfit: o import nao guarda quem seria invocado e
 *     a arena segue o proprio respawn;
 *   - debuffs de stat (speed/drunk): o conditions do jogador cobre so
 *     dano no tempo — a habilidade entra so com a animacao oficial.
 * ===================================================================== */

/* Alcance da habilidade em SQM (o canUseAttack compara Chebyshev).
 *
 * Regra do Canary (Monster::canUseSpell): `range == 0` (ausente no .lua)
 * significa SEM limite de distancia — o basic_attack/auto attack de muitos
 * monstros nao declara range e acerta de qualquer distancia. Antes o jogo
 * tratava range ausente como 1 e o bicho so "atacava de colado", o que
 * parecia magia bugada.
 *
 *  - range explicito > 0  -> usa o range (teto 7, alcance do grid)
 *  - range ausente        -> 99 (sem limite)
 *  - length (onda)        -> comprimento da onda
 *  - radius (explosao)    -> raio (o dano da explosao centrada no mob so
 *                            acerta dentro do raio — checado no mobSkillHit)
 */
function mobSkillRangeSQM(sk) {
  if ((sk.range || 0) > 0) return Math.min(7, sk.range);
  if (sk.length) return sk.length;                    // onda
  if (sk.range === undefined || sk.range === null) return 99;  // sem limite
  if (sk.radius) return Math.max(1, sk.radius);       // explosao (propria ou no alvo)
  return 1;                                           // sem dado: colado
}

/* Faixa min/max do dado do .lua (dano ou cura). */
function mobSkillRoll(sk) {
  const mn = sk.min || 0, mx = sk.max === undefined ? mn : sk.max;
  return mn + Math.floor(Math.random() * (mx - mn + 1));
}

/* Matriz oficial do Canary (AreaCombat::setupArea(radius)): o valor de cada
 * celula e a "distancia" ao centro num grid 13x13. A explosao de raio r
 * cobre as celulas com valor 1..r — o CIRCULO do servidor (diamante com
 * cantos cortados). Antes o jogo pintava um QUADRADO cheio (Chebyshev), e
 * era isso que deixava a death explosion do grimeleech e cia "quadrada". */
const SKILL_RADIUS_GRID = [
  [0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 8, 8, 7, 8, 8, 0, 0, 0, 0],
  [0, 0, 0, 8, 7, 6, 6, 6, 7, 8, 0, 0, 0],
  [0, 0, 8, 7, 6, 5, 5, 5, 6, 7, 8, 0, 0],
  [0, 8, 7, 6, 5, 4, 4, 4, 5, 6, 7, 8, 0],
  [0, 8, 6, 5, 4, 3, 2, 3, 4, 5, 6, 8, 0],
  [8, 7, 6, 5, 4, 2, 1, 2, 4, 5, 6, 7, 8],
  [0, 8, 6, 5, 4, 3, 2, 3, 4, 5, 6, 8, 0],
  [0, 8, 7, 6, 5, 4, 4, 4, 5, 6, 7, 8, 0],
  [0, 0, 8, 7, 6, 5, 5, 5, 6, 7, 8, 0, 0],
  [0, 0, 0, 8, 7, 6, 6, 6, 7, 8, 0, 0, 0],
  [0, 0, 0, 0, 8, 8, 7, 8, 8, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0],
];

function skillRadiusValue(dx, dy) {
  const row = SKILL_RADIUS_GRID[dy + 6];
  if (!row) return 0;
  return row[dx + 6] || 0;
}

/* Celulas de uma explosao de raio r: o circulo oficial do Canary
 * (diamante com cantos cortados), centrado em (cx0, cy0). */
function skillRadiusCells(cx0, cy0, r) {
  const out = [];
  r = Math.max(0, r | 0);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx < -6 || dx > 6 || dy < -6 || dy > 6) continue;
      const v = skillRadiusValue(dx, dy);
      if (v > 0 && v <= r) out.push({ cx: (cx0 | 0) + dx, cy: (cy0 | 0) + dy });
    }
  return out;
}

/* A celula (px, py) esta dentro da explosao de raio r centrada em (cx0, cy0)?
 * Usado para o DANO: no servidor a explosao so acerta quem esta numa celula
 * coberta pelo formato — antes o dano usava Chebyshev (quadrado). */
function skillRadiusHas(cx0, cy0, r, px, py) {
  const dx = (px | 0) - (cx0 | 0);
  const dy = (py | 0) - (cy0 | 0);
  if (dx < -6 || dx > 6 || dy < -6 || dy > 6) return false;
  const v = skillRadiusValue(dx, dy);
  return v > 0 && v <= (r | 0);
}

/* Direcao cardinal da onda (getPrimaryDirection do Canary): eixo dominante.
 * Antes a onda saia numa linha DIAGONAL na direcao do alvo; no Tibia onda
 * so existe reta (N/S/L/O) — o caster vira e a onda varre o eixo. */
function skillWaveDir(mob, pl) {
  const dx = (pl.cx | 0) - (mob.cx | 0);
  const dy = (pl.cy | 0) - (mob.cy | 0);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 };
  return dy >= 0 ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 };
}

/* Celulas de uma onda: a RETA oficial do Canary (AreaCombat::setupArea(
 * length, spread)). A boca abre com o spread: as `spread` primeiras casas
 * tem a largura cheia e a cada `spread` casas a boca encolhe 1 de cada
 * lado, terminando na ponta unica no ultimo SQM. */
function skillWaveCells(mob, pl, len, spread) {
  const out = [];
  len = Math.max(1, len | 0);
  spread = spread | 0;
  const d = skillWaveDir(mob, pl);
  const cols = spread > 0 ? Math.floor((len - (len % spread)) / spread) * 2 + 1 : 1;
  const centro = Math.floor(cols / 2);
  let colSpread = cols;
  for (let y = 1; y <= len; y++) {
    const minOff = cols - colSpread - centro;
    const maxOff = colSpread - 1 - centro;
    for (let h = minOff; h <= maxOff; h++) {
      out.push({
        cx: (mob.cx | 0) + d.dx * y + (d.dy !== 0 ? h : 0),
        cy: (mob.cy | 0) + d.dy * y + (d.dx !== 0 ? h : 0),
      });
    }
    if (spread > 0 && y % spread === 0) colSpread--;
  }
  return out;
}

/* O alvo esta numa celula coberta pela onda reta? (dano fiel ao servidor:
 * so acerta quem a onda realmente cruza). */
function skillWaveHas(mob, pl, len, spread, px, py) {
  const cells = skillWaveCells(mob, pl, len, spread);
  const k = (px | 0) + ":" + (py | 0);
  for (const q of cells) if (q.cx + ":" + q.cy === k) return true;
  return false;
}

/* A animacao oficial da habilidade (area, onda ou impacto), sem dano. */
function mobSkillFx(c, mob, pl, sk) {
  const el = sk.el || "physical";
  const fx = sk.fx || (ELEMENTS[el] || ELEMENTS.physical).fx;
  if (sk.length) {
    // onda RETA (N/S/L/O) saindo do monstro, com a boca do spread — o
    // formato oficial do Canary (AreaCombat::setupArea(length, spread))
    c.events.push({ t: "areafx",
                    cells: skillWaveCells(mob, pl, sk.length, sk.spread || 0),
                    fx: fx, screen: true });
    return;
  }
  if (sk.radius) {
    // com alcance+alvo a explosao cai NO JOGADOR; senao, no proprio monstro
    const centro = sk.alvo && (sk.range || 1) > 1 ? pl : mob;
    c.events.push({ t: "areafx",
                    cells: skillRadiusCells(centro.cx, centro.cy, sk.radius),
                    fx: fx, screen: true });
    return;
  }
  const noAlvo = !!sk.alvo || (sk.range || 1) > 1;
  const onde = noAlvo ? pl : mob;
  c.events.push({ t: "effect", x: onde.x, y: onde.y, fx: fx, screen: true,
                  projectile: noAlvo, sx: mob.x, sy: mob.y,
                  missile: sk.miss || ELEMENT_MISSILE[el] || null });
}

/* O dano da habilidade. O corpo-a-corpo passa por armor/defense/shielding
 * (meleeCombat do servidor); o dano de SPELL nao passa — o Combat executa
 * com block type None e o que segura o dano sao as RESISTENCIAS:
 * protection geral, protecao elemental de imbuement, redutores "dano
 * recebido" (Virtue/Protector/stances), a bolha do utamo vita, a Mantra
 * elementar do Monk e, no golpe letal, o Mana Buffer do 15.25 — na mesma
 * ordem em que o auto attack os aplica. */
function mobSkillHit(c, p, mob, sk, dmg) {
  // PARTY COMBAT: o dano da skill vai para a entidade que o monstro está
  // atacando (m.target) — rebate o save dela em `p` para as resistências.
  const tgt = (mob.target && mob.target.p && mob.target.p.hp > 0)
    ? mob.target : (c.player || null);
  const pl = tgt || c.player;
  if (tgt && tgt.p) p = tgt.p;
  const agora = Date.now();
  let raw = dmg;
  // Tipos especiais de dano (TibiaWiki/Damage):
  //  - "mana drain": ataca a MANA (cor azul), não é reduzido por armor;
  //  - "life drain": remove HP (cor vermelha) e transfere ao atacante;
  //  - "agony": true damage, não pode ser mitigado nem reduzido.
  const nomeSk = String(sk.n || sk.name || "").toLowerCase();
  const ehManaDrain = /mana\s*drain|manadrain/i.test(nomeSk);
  const ehLifeDrain = /life\s*drain|lifedrain/i.test(nomeSk);
  const ehAgony = sk.el === "agony" || /agony/i.test(nomeSk);
  const tipoEl = ehManaDrain ? "manadrain" : ehLifeDrain ? "lifedrain" : (sk.el || "physical");
  // Sap Strength (15.25): monstro marcado causa 10% menos — vale para todo
  // dano causado, nao so o auto attack (o debuff marca o ALVO, nao o golpe)
  if (mob.sapStrUntil && mob.sapStrUntil > agora) raw = Math.floor(raw * 0.9);
  const def0 = playerDefense(p);
  // Agony ignora TODAS as reduções (armor, proteção %, imbuement, mantra).
  if (!ehAgony) {
    raw = raw * (1 - Math.min(0.7, def0.protection / 100));
    if (typeof imbProtection === "function") {
      const prot = imbProtection(p, tipoEl);
      if (prot > 0) raw = Math.max(1, Math.floor(raw * (1 - prot / 100)));
    }
    // Mitigation do jogador: reduz TODOS os tipos comuns por % (shielding +
    // def do escudo/spellbook/arma — TibiaWiki/Mitigation).
    if (typeof applyPlayerMitigation === "function") {
      raw = applyPlayerMitigation(p, tipoEl, raw);
    }
    // Resistência por ELEMENTO dos anéis/amuletos/equipamentos (TibiaWiki:
    // proteção física +80% do stone skin amulet, +20% terra do terra amulet
    // etc.). Aplica após a mitigation, como no client.
    if (raw > 0 && typeof applyPlayerResist === "function") {
      raw = applyPlayerResist(p, tipoEl, raw);
    }
    // Prey de DEFESA (TibiaWiki/Prey_System): −12~30% do dano recebido da
    // criatura alvo; o tempo da prey gasta um pouco extra a cada hit.
    if (raw > 0 && typeof preyDefenseBonus === "function") {
      const pDef = preyDefenseBonus(p, mob.slug);
      if (pDef > 0) {
        raw = Math.max(1, Math.floor(raw * (1 - pDef / 100)));
        if (typeof preyDefenseTickOnHit === "function") preyDefenseTickOnHit(p, mob.slug);
      }
    }



  }
  const bfd = typeof buffTotals === "function" ? buffTotals(p) : null;
  if (bfd && bfd.dmgReceived !== 1)
    raw = Math.max(1, Math.floor(raw * bfd.dmgReceived));
  if (typeof stanceTotals === "function") {
    const stD = stanceTotals(p).dmgReceived;
    if (stD !== 1) raw = Math.max(1, Math.floor(raw * stD));
  }
  if (typeof forgeIncomingDamageMul === "function") {
    const trMul = forgeIncomingDamageMul(p, agora);
    if (trMul !== 1) raw = Math.max(1, Math.floor(raw * trMul));
  }
  raw = Math.max(1, Math.floor(raw));
  if (c.buffs.shield && c.buffs.shield > 0) {
    const absorbed = Math.min(raw, c.buffs.shield);
    c.buffs.shield -= absorbed;
    raw -= absorbed;
  }
  // Agony (true damage): nem o mantra do Monk reduz.
  if (raw > 0 && !ehAgony && typeof mantraAbsorve === "function") {
    raw = mantraAbsorve(p, raw, tipoEl, c);



  }
  if (raw > 0 && typeof applyMagicShieldAbsorb === "function") {
    raw = applyMagicShieldAbsorb(c, p, raw, {
      el: tipoEl,
      x: pl.x, y: pl.y, sx: mob.x, sy: mob.y,
    });
  }
  if (raw > 0) {
    if ((p.voc === "sorcerer" || p.voc === "druid") && raw >= p.hp && p.hp > 0) {
      const excesso = raw - p.hp + 1;
      const taxa = (agora - (p.manaBufferAt || 0) >= 2000)
        ? Math.floor(maxStats(p).mp * 0.25) : 0;
      const custo = excesso * 8 + taxa;
      if (p.mp >= custo) {
        p.mp -= custo;
        p.hp = 1;
        if (taxa) p.manaBufferAt = agora;
        c.events.push({ t: "manabuffer", vida: excesso, mana: custo,
                        x: pl.x, y: pl.y, screen: true, sx: mob.x, sy: mob.y });
        return 0;
      }
    }
  }
  // Explosao CENTRADA NO MONSTRO (radius sem `alvo`): o dano so entra se o
  // player estiver dentro do FORMATO OFICIAL (circulo do Canary, diamante
  // com cantos cortados) — antes usava sqmDistance (Chebyshev), que e um
  // QUADRADO cheio e deixava a death explosion do grimeleech "quadrada".
  if (sk.radius && !sk.alvo && typeof skillRadiusHas === "function" &&
      pl.cx !== undefined && mob.cx !== undefined) {
    if (!skillRadiusHas(mob.cx, mob.cy, sk.radius, pl.cx, pl.cy)) return 0;
  }
  // ONDA: o dano so entra se o alvo estiver numa celula coberta pela onda
  // RETA (a onda vai no eixo dominante; quem esta na diagonal fora dela
  // nao leva dano, como no servidor).
  if (sk.length && typeof skillWaveHas === "function" &&
      pl.cx !== undefined && mob.cx !== undefined) {
    if (!skillWaveHas(mob, pl, sk.length, sk.spread || 0, pl.cx, pl.cy)) return 0;
  }

  // condition aplicada pela magia (veneno/fogo/energia do *field e das
  // magias `condition` do .lua) — drena no tempo depois do impacto
  if (sk.cond && typeof CONDITIONS !== "undefined" && CONDITIONS[sk.cond]) {
    const dmgCond = sk.condDano ||
      Math.max(1, Math.round(raw * 0.25));
    applyCondition(p, sk.cond, dmgCond, 4);
    c.events.push({ t: "player-condition", tipo: sk.cond });
  }

  const bolt = !sk.radius && ((sk.range || 1) > 1 || !!sk.length);
  const miss = sk.miss || ELEMENT_MISSILE[sk.el || "physical"] || null;
  if (raw <= 0) {
    c.events.push({ t: "block", x: pl.x, y: pl.y, sx: mob.x, sy: mob.y,
                    screen: true, mantra: true,
                    projectile: bolt, missile: miss });
    return 0;
  }
  if (ehManaDrain) {
    // Mana Drain (TibiaWiki): perde MANA em vez de vida — cor azul.
    const mx = maxStats(p);
    const drenado = Math.min(p.mp, raw);
    p.mp = Math.max(0, p.mp - drenado);
    c.stats.taken += drenado;
    c.events.push({ t: "taken", dmg: drenado, el: "manadrain",
                    x: pl.x, y: pl.y, sx: mob.x, sy: mob.y, screen: true,
                    fx: sk.fx || null, projectile: bolt, missile: miss });
    if (drenado > 0 && mob.hp > 0) {
      // transferência: o dreno alimenta o atacante
      mob.hp = Math.min(mob.def.hp || mob.maxHp, mob.hp + Math.floor(drenado / 2));
    }
    return drenado;
  }
  p.hp -= raw;
  c.stats.taken += raw;
  if (tgt) tgt.taken = (tgt.taken || 0) + raw;
  if (ehLifeDrain && mob.hp > 0) {
    // Life Drain: remove HP e transfere ao atacante (cura o mob).
    mob.hp = Math.min(mob.def.hp || mob.maxHp, mob.hp + raw);
  }
  c.events.push({ t: "taken", dmg: raw, el: tipoEl,
                  x: pl.x, y: pl.y, sx: mob.x, sy: mob.y, screen: true,
                  // COMBAT_PARAM_EFFECT do .lua (fire-area, mort area,
                  // ice attack...) em vez do generico do elemento
                  fx: sk.fx || null,
                  projectile: bolt, missile: miss });
  return raw;
}

/* Rola a lista de habilidades do monstro (defensivas antes, na ordem do
 * servidor; depois ofensivas na ordem do .lua).
 *
 * IMPORTANTE — fiel ao Canary (Monster::commitCombatIntention): o servidor
 * NÃO para na primeira magia que passar na chance. Ele percorre TODAS as
 * attackSpells do .lua e cada uma rola a própria chance de forma
 * independente — todas as que passarem castam no mesmo turno. O basic
 * attack (chance=100) sempre passa, mas NÃO bloqueia as magias especiais
 * (era esse o bug: o jogo dava return na primeira skill e o naga-warrior,
 * makara etc. nunca usavam as magias).
 *
 * Devolve true quando QUALQUER habilidade entrou em cena — o corpo-a-corpo
 * (mobAttack) só roda se nenhuma skill da lista passar (monstros sem basic
 * attack ch=100 na lista). */
function mobCastSkill(c, p, mob, now) {
  // PARTY COMBAT: o monstro ataca a entidade mais próxima (m.target), não
  // só o personagem ativo — todos na mesma instância levam dano de verdade.
  const tgt = (mob.target && mob.target.p && mob.target.p.hp > 0)
    ? mob.target : (c.player || null);
  if (tgt && tgt.p) p = tgt.p;
  if (mob.hp <= 0 || p.hp <= 0) return false;
  const def = mob.def || {};
  const skills = def.skills || [];
  const defS = def.defSkills || [];
  if (!skills.length && !defS.length) return false;
  const pl = tgt || c.player;
  if (!pl) return false;
  const dist = (pl.cx !== undefined && mob.cx !== undefined &&
                typeof sqmDistance === "function")
    ? sqmDistance(mob, pl) : 1;
  if (!mob.skillCds) mob.skillCds = {};
  let usou = false;

  // ---- defensivas (o bloco defenses do .lua): cura propria.
  // Uma cura por turno (a primeira que passar) — suficiente para o idle.
  for (let i = 0; i < defS.length; i++) {
    const sk = defS[i];
    const key = "d" + i;
    if ((mob.skillCds[key] || 0) > now) continue;
    if (Math.random() * 100 >= (sk.ch === undefined ? 15 : sk.ch)) continue;
    if (sk.n === "healing") {
      if (mob.maxHp && mob.hp >= mob.maxHp) continue;   // vida cheia
      const cura = Math.max(0, mobSkillRoll(sk));
      if (!cura) continue;
      mob.hp = Math.min(mob.maxHp || (mob.hp + cura), mob.hp + cura);
      mob.skillCds[key] = now + (sk.int || 2000);
      c.events.push({ t: "mobheal", x: mob.x, y: mob.y, heal: cura,
                      fx: sk.fx || "magic-green", screen: true });
      usou = true;
    }
    // "speed" proprio: o import nao guarda duracao/magnitude do buff, e
    // inventar valor aqui quebraria a regra dos dados oficiais — ignorado.
  }

  // ---- ofensivas, na ordem do .lua. TODAS as que passarem na chance
  // castam (sem return no meio) — ver comentario do cabecalho.
  for (let i = 0; i < skills.length; i++) {
    const sk = skills[i];
    const key = "s" + i;
    if ((mob.skillCds[key] || 0) > now) continue;
    const nomeFx = sk.n || "";
    // removido a pedido: invisibilidade (warlock, stalker, ferumbras...)
    if (/invisib/i.test(nomeFx)) continue;
    // sem correspondente no idle solo: ver o cabecalho do bloco
    if (/summon|challenge|outfit|skill reducer|cancel invisib/i.test(nomeFx)) continue;
    // magias de nome com efeito implicito (o parser so pega o nome, sem
    // dano nem cond): "djinn electrify" eletrifica, "paralyze" congela o
    // passo. Sem correspondente (drunk, speed) entra so a animacao.
    if (!sk.cond && !sk.campo && !((sk.max || 0) > 0)) {
      if (/electrif/i.test(nomeFx)) sk.cond = "energy";
      else if (/paralyz/i.test(nomeFx)) sk.cond = "freezing";
    }
    if (dist > mobSkillRangeSQM(sk)) continue;
    if (Math.random() * 100 >= (sk.ch === undefined ? 15 : sk.ch)) continue;
    mob.skillCds[key] = now + (sk.int || 2000);
    mob.attackAnim = 220;
    // magia sem dano direto (faixa zerada): entra a animacao oficial e,
    // quando a magia carrega um efeito no tempo (campo de fogo/veneno do
    // *field, ou as magias `condition` do .lua), aplica a condition
    // correspondente — antes essas magias "não faziam nada" e pareciam
    // bugadas
    if (!((sk.max || 0) > 0)) {
      mobSkillFx(c, mob, pl, sk);
      const tipoEfeito = sk.campo || sk.cond;
      if (tipoEfeito && typeof CONDITIONS !== "undefined" &&
          CONDITIONS[tipoEfeito]) {
        const danoC = sk.condDano ||
          Math.max(1, Math.round((mob.def.damage || 10) * 0.1));
        applyCondition(p, tipoEfeito, danoC, 4);
        c.events.push({ t: "player-condition", tipo: tipoEfeito });
      }
      usou = true;
      continue;
    }
    mobSkillFx(c, mob, pl, sk);
    mobSkillHit(c, p, mob, sk, Math.max(0, mobSkillRoll(sk)));
    usou = true;
  }
  return usou;
}

function mobAttack(c, p, mob) {
  // PARTY COMBAT: o melee acerta quem o monstro está perseguindo (m.target)
  // — o alvo mais próximo entre líder + membros da mesma instância.
  const tgt = (mob.target && mob.target.p && mob.target.p.hp > 0)
    ? mob.target : null;
  const pl = tgt || c.player || { x: 0.18, y: 0.62 };
  if (tgt && tgt.p) p = tgt.p;
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
  // Exaltation Forge oficial: Ruse (armor)
  if (typeof forgeTryRuse === "function") {
    const ruse = forgeTryRuse(p);
    if (ruse) {
      c.events.push({ t: "miss", x: pl.x, y: pl.y, dodge: true, ruse: true });
      return 0;
    }
  }
  // Divine Defiance (stance do Paladin, 15.25): 12% de esquiva contra
  // inimigos NAO adjacentes. Golpe corpo-a-corpo ignora a esquiva.
  if (typeof stanceTotals === "function" &&
      typeof sqmDistance === "function" &&
      pl.cx !== undefined && mob.cx !== undefined) {
    const dod = stanceTotals(p).dodgeRanged;
    if (dod && sqmDistance(pl, mob) > 1 && Math.random() < dod) {
      c.events.push({ t: "miss", x: pl.x, y: pl.y, dodge: true });
      return 0;
    }
  }
  const def = playerDefense(p);
  let raw = mob.def.damage * (0.6 + Math.random() * 0.8);
  const agora = Date.now();
  // Exeta (Challenge / Chivalrous Challenge) do Knight: monstro marcado
  // causa 20% MENOS dano ao knight enquanto o Challenge durar.
  if (mob.challengedUntil && mob.challengedUntil > agora) {
    raw = Math.floor(raw * 0.8);
  }
  // Shield Bash/Slam (15.25): o proximo auto attack do alvo em ate 10s
  // sai pela METADE. O debuff e consumido neste golpe.
  if (mob.weakNextUntil) {
    if (mob.weakNextUntil > agora) raw = Math.floor(raw * 0.5);
    delete mob.weakNextUntil;
  }
  // Sap Strength (crippling stance do Sorcerer, 15.25): o alvo marcado
  // causa 10% menos dano.
  if (mob.sapStrUntil && mob.sapStrUntil > agora) {
    raw = Math.floor(raw * 0.9);
  }
  // The Way of the Monk expandido (15.25): cada santuario da quest reduz
  // em 2% o dano de MELEE auto attacks recebidos. No oficial sao 10
  // santuarios (teto de 20%); o jogo tem 3, entao o teto aqui e 6%.
  if (p.monkShrines && monsterAttackRange(mob) <= 0.16) {
    const rs = Math.min(0.20, p.monkShrines * 0.02);
    if (rs > 0) raw = Math.floor(raw * (1 - rs));
  }
  raw = mitigate(raw, def.armor, def.defense, def.shielding);
  raw = raw * (1 - Math.min(0.7, def.protection / 100));
  // Prey de DEFESA: também reduz o auto attack da criatura alvo
  if (raw > 0 && typeof preyDefenseBonus === "function") {
    const pDef = preyDefenseBonus(p, mob.slug);
    if (pDef > 0) {
      raw = Math.max(1, Math.floor(raw * (1 - pDef / 100)));
      if (typeof preyDefenseTickOnHit === "function") preyDefenseTickOnHit(p, mob.slug);
    }
  }
  // Mitigation do jogador: reduz todos os tipos comuns por % (o auto attack
  // do mob é físico — TibiaWiki/Mitigation).
  if (typeof applyPlayerMitigation === "function") {
    raw = applyPlayerMitigation(p, "physical", raw);
  }
  // Resistência física dos anéis/amuletos (ex.: stone skin amulet +80%,
  // might ring +20%, protection amulet +6%).
  if (raw > 0 && typeof applyPlayerResist === "function") {
    raw = applyPlayerResist(p, "physical", raw);
  }
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

  // stances do 15.25: Blood Rage AUMENTA o dano recebido em 15% e o
  // Protector reduz 15% — multiplicador proprio, separado dos buffs
  if (typeof stanceTotals === "function") {
    const stD = stanceTotals(p).dmgReceived;
    if (stD !== 1) raw = Math.max(1, Math.floor(raw * stD));
  }
  if (typeof forgeIncomingDamageMul === "function") {
    const trMul = forgeIncomingDamageMul(p, agora);
    if (trMul !== 1) raw = Math.max(1, Math.floor(raw * trMul));
  }

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
    raw = mantraAbsorve(p, raw, mob.def.element, c);
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

  // Magic Shield / Energy Ring: absorve dano com mana antes de chegar na vida.
  if (raw > 0 && typeof applyMagicShieldAbsorb === "function") {
    raw = applyMagicShieldAbsorb(c, p, raw, {
      el: mob.def.element,
      x: pl.x, y: pl.y, sx: mob.x, sy: mob.y,
    });
    if (raw <= 0) return 0;
  }

  // Mana Buffer (15.25, so Sorcerer/Druid): diante de um golpe LETAL o
  // dano excedente sai da MANA, nao da vida — 8 de mana por ponto de vida
  // evitado, mais uma taxa extra de 25% da mana maxima que so pode ser
  // cobrada uma vez a cada 2 segundos (boletim oficial do update). Se a
  // mana nao cobrir, o personagem morre normalmente.
  if ((p.voc === "sorcerer" || p.voc === "druid") && raw >= p.hp && p.hp > 0) {
    const excesso = raw - p.hp + 1;              // o necessario para zerar
    const taxa = (agora - (p.manaBufferAt || 0) >= 2000)
      ? Math.floor(maxStats(p).mp * 0.25) : 0;
    const custo = excesso * 8 + taxa;
    if (p.mp >= custo) {
      p.mp -= custo;
      p.hp = 1;                                  // sobrevive no limite
      if (taxa) p.manaBufferAt = agora;
      c.events.push({ t: "manabuffer", vida: excesso, mana: custo,
                      x: pl.x, y: pl.y, screen: true,
                      sx: mob.x, sy: mob.y });
      return 0;   // golpe absorvido: nada sai da vida nem dos stats
    }
  }

  p.hp -= raw;
  c.stats.taken += raw;
  if (tgt) tgt.taken = (tgt.taken || 0) + raw;
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
  // Party combat: a Loot Pouch do líder é o destino ÚNICO de todo loot,
  // mesmo quando o membro ativo/quem deu o último hit é outro personagem.
  // Equipamentos, imbuements e Forge continuam calculados pelo `p` atacante
  // nos seus respectivos ataques; só a propriedade do drop muda aqui.
  if (c && c.players && c.players.length > 1 && c.players[0] && c.players[0].p) {
    p = c.players[0].p;
  }
  const got = [];
  // Rate de loot do servidor: multiplica a chance de drop
  const lootRate = (typeof SERVER_LOOT_RATE !== "undefined") ? SERVER_LOOT_RATE : 1;
  for (const l of mob.def.loot) {
    // Chance efetiva = chance base * lootRate (cap 100%)
    const effectiveChance = Math.min(100, l.chance * lootRate);
    if (Math.random() * 100 > effectiveChance) continue;
    let count = l.max > 1 ? 1 + Math.floor(Math.random() * l.max) : 1;
    // Rate de loot também multiplica a quantidade
    if (lootRate > 1) {
      const boosted = count * lootRate;
      count = Math.max(1, Math.floor(boosted) + (Math.random() < boosted % 1 ? 1 : 0));
    }
    if ((c.lootMul || 1) > 1) {
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
      const g = creditCurrency(p, l.item, count);
      c.stats.gold += g;
      c.stats.loot[l.item] = (c.stats.loot[l.item] || 0) + count;
      got.push({ item: l.item, count: count });
      continue;
    } else if (mob.boss) {
      // REWARD CHEST: todo drop de boss vai para o baú de recompensas
      // (separado da Loot Pouch comum)
      if (typeof rewardChestAdd === "function") rewardChestAdd(p, l.item, count);
      else addLootPouch(p, l.item, count);
    } else if (SUPPLIES[l.item]) {
      p.supplies[l.item] = (p.supplies[l.item] || 0) + count;
    } else if (it.s === "ammo") {
      addAmmo(p, l.item, count);
    } else {
      addLootPouch(p, l.item, count);
    }
    c.stats.loot[l.item] = (c.stats.loot[l.item] || 0) + count;
    got.push({ item: l.item, count: count });
  }
  // Prey de LOOT (TibiaWiki/Prey_System): com bônus de X%, há X% de chance
  // de o monstro gerar OUTRO conjunto de loot (como se matasse dois).
  if (typeof preyLootChance === "function") {
    const pLoot = preyLootChance(p, mob.slug);
    if (pLoot > 0 && Math.random() * 100 < pLoot) {
      for (const l of mob.def.loot) {
        if (Math.random() * 100 > l.chance) continue;
        const count = l.max > 1 ? 1 + Math.floor(Math.random() * l.max) : 1;
        const it = GAMEDATA.items[l.item];
        if (!it) continue;
        if (!mob.boss && isNoCollect(p, l.item)) continue;
        if (l.item === "gold-coin") {
          const g = Math.floor(count * goldStage(c.hunt.level));
          p.gold += g; c.stats.gold += g;
        } else if (currencyValue(l.item)) {
          const g = creditCurrency(p, l.item, count);
          c.stats.gold += g;
          c.stats.loot[l.item] = (c.stats.loot[l.item] || 0) + count;
          got.push({ item: l.item, count: count });
        } else if (mob.boss) {
          if (typeof rewardChestAdd === "function") rewardChestAdd(p, l.item, count);
          else addLootPouch(p, l.item, count);
        } else if (SUPPLIES[l.item]) {
          p.supplies[l.item] = (p.supplies[l.item] || 0) + count;
        } else if (it.s === "ammo") {
          addAmmo(p, l.item, count);
        } else {
          addLootPouch(p, l.item, count);
        }
        c.stats.loot[l.item] = (c.stats.loot[l.item] || 0) + count;
        got.push({ item: l.item, count: count });
      }
    }
  }
  if (mob.influenced || mob.fiendish) {
    let dustRoll = 0;
    const stacks = mob.fiendish ? 15 : Math.max(1, mob.sinisterStacks || 1);
    for (let i = 0; i < stacks; i++) dustRoll += 1 + Math.floor(Math.random() * 3);
    if (typeof forgeGainDust === "function") {
      const dg = forgeGainDust(p, dustRoll);
      if (dg.gained > 0) {
        c.stats.loot["dust"] = (c.stats.loot["dust"] || 0) + dg.gained;
        got.push({ item: "dust", count: dg.gained });
      }
      if (dg.gained > 0 || dg.overflow > 0) {
        c.events.push({ t: "dust", dust: dg.gained, overflow: dg.overflow, fiendish: !!mob.fiendish });
      }
    }
    if (mob.fiendish) {
      const stars = mob.def && mob.def.best ? (mob.def.best.stars || 3) : 3;
      const slivers = Math.max(1, Math.floor(1 + Math.random() * Math.max(1, stars)));
      p.slivers = (p.slivers || 0) + slivers;
      c.stats.loot["slivers"] = (c.stats.loot["slivers"] || 0) + slivers;
      got.push({ item: "slivers", count: slivers });
      c.events.push({ t: "dust", dust: 0, slivers: slivers, fiendish: true });
    }
  }
  return got;
}

/* ======================================================================
 * PARTY COMBAT — aliados na mesma instância
 * ====================================================================== */

/* Entidade viva do party combat de um personagem (null = fora de party). */
function entByPlayer(c, p) {
  if (!c || !p) return null;
  if (c.players && c.players.length > 1) {
    const id = String(p.id || "");
    for (const e of c.players) {
      if (e.p === p || String(e.id) === id) return e;
    }
  }
  return null;
}

/* Cooldowns do HELPER POR PERSONAGEM (party combat): o líder e cada membro
 * têm o próprio healCd/potionCd/runeCd/cureCd/buffCd/hasteCd/magicShieldCd —
 * um aliado bebendo potion não trava a potion do outro. Sem party, cai no
 * campo antigo do combate (c.healCd etc.) e nada muda. */
function entCd(c, p, key) {
  const ent = entByPlayer(c, p);
  if (ent && ent[key] !== undefined) return ent[key];
  return c[key] || 0;
}
function entCdSet(c, p, key, val) {
  const ent = entByPlayer(c, p);
  if (ent) ent[key] = val;
  else c[key] = val;
}

/* Posição do ator de um evento (c.player no momento do push — para aliados
 * o c.player é temporariamente o aliado, então x/y já saem certos). */
function actorPos(c, p) {
  const pl = c.player || { x: 0.13, y: 0.6 };
  const ent = entByPlayer(c, p);
  return {
    x: pl.x, y: pl.y,
    whoId: ent ? String(ent.id) : null,
    who: (p && p.name) ? p.name : "",
  };
}

/* Tick dos aliados (membros da party que NÃO são o personagem ativo):
 * roda o HELPER COMPLETO de cada um com a configuração DELE — cura (spell
 * + potion), mana, cura de condition, anel/amuleto emergencial, magic
 * shield, buff/haste, exeta (knight) e ataque (runa → spell → arma). */
function partyTickAllies(c, now, dt) {
  if (!c || !c.players || c.players.length < 2) return;
  for (const ent of c.players) {
    if (ent === c.player || !ent.p) continue;
    // aliado caiu: agenda o renascimento no local (reviveAt) — o loop do
    // game.js revive quando o tempo chega
    if (ent.p.hp <= 0) {
      if (!ent.reviveAt) {
        ent.reviveAt = now + ((typeof reviveTime === "function") ? reviveTime() : 30000);
        ent.deathPos = { x: ent.x, y: ent.y, dir: ent.dir || "e" };
        ent.p.deaths = (ent.p.deaths || 0) + 1;
        if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
        if (typeof addLog === "function") {
          addLog("death", `<b>${ent.name}</b> caiu em combate — renasce no local em ${Math.round((typeof reviveTime === "function" ? reviveTime() : 30000) / 1000)}s.`);
        }
      }
      continue;
    }
    partyHelperTick(c, ent, now, dt);
  }
}

/* HELPER INDIVIDUAL de um personagem do party combat. Troca o c.player
 * para o aliado durante o tick (as funções do helper usam c.player para
 * posição/alcance) e anexa whoId/posição aos eventos gerados, para o
 * drainEvents desenhar no lugar certo (e o log no nome certo). */
function partyHelperTick(c, ent, now, dt) {
  const p = ent.p;
  if (!p) return;
  const n0 = c.events.length;
  const prev = c.player;
  c.player = ent;
  try {
    // ---- helper completo com o config DELE (cada personagem controla
    // individualmente o próprio auto-hunt) ----
    if (typeof tryCureCondition === "function") { try { tryCureCondition(c, p, now); } catch (e) { /* segue */ } }
    if (typeof tryAccessoryHelper === "function") { try { tryAccessoryHelper(c, p, now); } catch (e) { /* segue */ } }
    if (typeof tryMagicShield === "function") { try { tryMagicShield(c, p, now); } catch (e) { /* segue */ } }
    if (typeof tryHeal === "function") { try { tryHeal(c, p, now); } catch (e) { /* segue */ } }
    // HEAL FRIEND (Druid/Monk): cura os aliados com a config do próprio
    if (typeof tryHealFriend === "function") { try { tryHealFriend(c, p, now); } catch (e) { /* segue */ } }
    if (typeof tryMana === "function") { try { tryMana(c, p, now); } catch (e) { /* segue */ } }
    if (typeof tryChallenge === "function") { try { tryChallenge(c, p, now); } catch (e) { /* segue */ } }
    if (typeof tryBuff === "function") { try { tryBuff(c, p, now); } catch (e) { /* segue */ } }
    if (typeof tryHaste === "function") { try { tryHaste(c, p, now); } catch (e) { /* segue */ } }
    // ---- ataque com a arma/magias DELE: runa > spell > ataque básico ----
    ent.atkCd -= dt;
    if (ent.atkCd <= 0 && c.mobs.length) {
      const alvo = c.mobs[0];
      let acted = false;
      if (typeof tryUseRune === "function") { try { acted = tryUseRune(c, p, alvo, now); } catch (e) { /* segue */ } }
      if (!acted && typeof tryCastSpell === "function") { try { acted = tryCastSpell(c, p, alvo, now); } catch (e) { /* segue */ } }
      if (!acted && typeof playerAttack === "function") {
        try { const r = playerAttack(c, p, alvo); acted = r !== false; } catch (e) { /* segue */ }
      }
      ent.atkCd = acted ? ((typeof attackInterval === "function") ? attackInterval(c, p) : 2000) : 250;
    }
  } finally {
    c.player = prev;
    // anexa whoId/posição aos eventos gerados pelo aliado para o drain
    // desenhar no lugar certo e logar o nome certo
    for (let i = n0; i < c.events.length; i++) {
      const ev = c.events[i];
      if (ev.whoId === undefined) { ev.whoId = String(ent.id); ev.who = ent.name; }
      if (ev.x === undefined && ev.screen) { ev.x = ent.x; ev.y = ent.y; }
    }
  }
}

/* Personagem da party caiu (hp <= 0): vira INCONSCIENTE (revive no local
 * depois de reviveTime) e o controle passa para o próximo membro vivo. */
function partyHandleDown(c, fallenP) {
  const ent = c.players.find((e) => e.p === fallenP) || c.player;
  if (ent) {
    if (!ent.reviveAt) {
      ent.reviveAt = Date.now() + ((typeof reviveTime === "function") ? reviveTime() : 30000);
      ent.deathPos = { x: ent.x, y: ent.y, dir: ent.dir || "e" };
      ent.p.hp = 0;
      c.stats.deaths++;
      ent.p.deaths = (ent.p.deaths || 0) + 1;
      if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
      if (typeof addLog === "function") {
        addLog("death", `<b>${ent.name}</b> caiu em combate — renasce no local em ${Math.round(ent.reviveAt / 1000 - Date.now() / 1000)}s.`);
      }
    }
  }
  // troca o controle para o próximo vivo
  const proximo = c.players.find((e) => e !== ent && e.p && e.p.hp > 0);
  if (proximo && typeof partyCombatSwitchTo === "function") {
    if (typeof addLog === "function") {
      addLog("party", `Controlando agora: <b>${proximo.name}</b> (${fallenP.name} inconsciente).`);
    }
    partyCombatSwitchTo(proximo.id);
  }
}

/* Morte do jogador: perde exp, skills e renasce no local */
function playerDeath(c, p) {
  // Wheel of Destiny — Gift of Life (estágio VERDE): revive no local, sem
  // perder XP/ouro, 1 vez a cada 2h (como a magia do jogo).
  if (typeof wheelStage === "function" && p.wheel && wheelStage(p, "green") >= 1) {
    const agora = Date.now();
    const GIFT_CD = 2 * 3600 * 1000;
    if (!p.wheel.giftOfLifeAt || (agora - p.wheel.giftOfLifeAt) >= GIFT_CD) {
      p.wheel.giftOfLifeAt = agora;
      const max = maxStats(p);
      p.hp = max.hp; p.mp = max.mp;
      c.events.push({ t: "heal", amount: max.hp, spell: "Gift of Life" });
      if (typeof addLog === "function") addLog("skill", "Gift of Life salvou você de <b>morrer</b>! (cooldown de 2h)");
      return { exp: 0, gold: 0, giftOfLife: true };
    }
  }

  p.deaths++;
  c.stats.deaths++;
  // a bencao do templo reduz muito a perda e e consumida na morte
  // Full Bless (7 bênçãos VIP): perda ainda menor
  const blessCount = p.blessed === true ? 1 : (p.blessed || 0);
  const blessed = blessCount > 0;
  const fullBless = blessCount >= 7;
  const expRate = fullBless ? 0.005 : blessed ? 0.015 : 0.07;
  const goldRate = fullBless ? 0.01 : blessed ? 0.02 : 0.1;
  if (blessed) p.blessed = false;
  const lostExp = Math.floor(p.exp * expRate);
  p.exp = Math.max(0, p.exp - lostExp);
  while (p.level > 1 && p.exp < expForLevel(p.level)) p.level--;
  const lostGold = Math.floor(p.gold * goldRate);
  spendGold(p, lostGold);
  // Guarda posição da morte para o corpse
  const deathX = c.player ? c.player.x : 0.18;
  const deathY = c.player ? c.player.y : 0.62;
  const deathDir = c.player ? c.player.dir : "e";
  c.dead = true;
  c.deadUntil = Date.now() + reviveTime();   // 30s normal, 15s VIP
  c.deathPos = { x: deathX, y: deathY, dir: deathDir };
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
  // VIP: regeneração extra (+10 HP e +20 MP a cada 3s)
  if (typeof vipRegenHp === "function" && vipRegenHp() > 0) {
    c.vipRegenAcc = (c.vipRegenAcc || 0) + dt;
    if (c.vipRegenAcc >= 3000) {
      c.vipRegenAcc -= 3000;
      p.hp = Math.min(max.hp, p.hp + vipRegenHp());
      p.mp = Math.min(max.mp, p.mp + vipRegenMp());
    }
  }

  // buffs decaem
  if (c.buffs.haste > 0) c.buffs.haste -= dt;

  // spawn
  if (!c.mobs.length && !(c.pendingSpawns && c.pendingSpawns.length)) {
    if (c.boss) return;
    spawnWave(c, p);
  }
  // fila de spawn: teleporte piscando 3x antes do monstro nascer
  if (c.pendingSpawns && c.pendingSpawns.length) tickSpawnQueue(c);
  if (c.raidEnabled) {
    c.raidCd -= dt;
    if (c.raidCd <= 0) {
      notifyRealPlayerRaidPending(c);
      c.raidCd = 60000 + Math.random() * 90000;
    }
  }

  // movimentação: NAO roda mais no tick. O passo em SQM (grid.js +
  // gridai.js) e avancado a cada FRAME no loop do game.js, como no client
  // do Tibia: o servidor so alinha o INICIO dos passos no beat de 50ms,
  // mas a animacao do trajeto acompanha os frames da tela. Rodando no tick
  // de 100ms, as criaturas so mudavam de posicao 10x por segundo e a cena
  // andava "aos trancos".

  // conditions (veneno, fogo, energia, sangramento, maldicao) drenando
  tickConditions(c, p, dt);

  // buff de vocacao: mantem a Virtude / Protector sempre ativos
  tryBuff(c, p, now);
  tryHaste(c, p, now);

  // cura de conditions (exana) antes da cura de HP
  tryCureCondition(c, p, now);

  // helper de equipamento e magic shield do painel Helper (antes da cura de HP,
  // para equipar o anel emergencial no instante em que a vida cai abaixo do threshold)
  if (typeof tryAccessoryHelper === "function") tryAccessoryHelper(c, p, now);
  if (typeof tryMagicShield === "function") tryMagicShield(c, p, now);

  // cura e mana
  tryHeal(c, p, now);
  // HEAL FRIEND (Druid/Monk): cura os aliados da party — exura sio / exura
  // gran sio curam o membro mais ferido; exura gran mas res (Mass Healing)
  // cura os aliados adjacentes quando 2+ membros estão com HP baixo.
  if (typeof tryHealFriend === "function") tryHealFriend(c, p, now);
  tryMana(c, p, now);

  // EXETA AMP RES (Chivalrous Challenge, knight): marca os monstros para
  // focarem o knight. Neste idle single-player o player já é o único alvo,
  // então o efeito mecânico é o do Challenge do Tibia: os monstros marcados
  // causam 20% MENOS dano ao knight (e o exeta amp res marca TODOS ao
  // alcance de 7 SQM). Auto-cast com o cooldown da magia.
  if (typeof tryChallenge === "function") tryChallenge(c, p, now);

  // Sem recuo automático: se ficar sem cura, o HP zera e o personagem morre,
  // voltando ao templo/cidade pelo fluxo normal de morte.

  // ataque do jogador (personagem ATIVO)
  c.playerAtkCd -= dt;
  if (c.playerAtkCd <= 0 && c.mobs.length) {
    const target = c.mobs[0];
    // prioridade: runa > spell > arma, respeitando alcance
    let acted = tryUseRune(c, p, target, now) ||
                tryCastSpell(c, p, target, now);
    if (!acted) {
      // playerAttack devolve o dano causado, e 0 quando o golpe SAIU mas
      // errou (rolagem de acerto da distancia, sem municao). Isso e um turno
      // gasto: so `false` — alvo fora de alcance — significa que nao houve
      // ataque. Com o `!!` que estava aqui o 0 virava false e o cooldown
      // caia para 250ms, entao o arqueiro que errava reatirava quase 8x mais
      // rapido que o intervalo da arma e nunca parava para curar.
      const r = playerAttack(c, p, target);
      acted = r !== false;
    }
    c.playerAtkCd = acted ? attackInterval(c, p) : 250;
  }

  // PARTY COMBAT: os ALIADOS (membros na mesma instância) lutam sozinhos —
  // atacam com a arma deles e o Druid/Monk cura a party (HEAL FRIEND).
  if (c.players && c.players.length > 1 &&
      typeof partyTickAllies === "function") {
    partyTickAllies(c, now, dt);
  }

  // monstros agem: no Canary (Monster::commitCombatIntention) o ataque
  // BÁSICO (melee, chance 100 no .lua) roda SEMPRE e as skills rolam a
  // própria chance ADICIONAL no mesmo turno — cada attack da lista é
  // independente. Antes o código fazia `skills || melee`, então quando
  // qualquer skill passava o dano físico básico NUNCA saía (os monstros
  // pareciam não causar dano físico, só as magias).
  for (const m of c.mobs) {
    m.atkCd -= dt;
    if (m.atkCd <= 0) {
      // PARTY COMBAT: escolhe o alvo (mais próximo entre líder + membros)
      if (typeof partyNearestTarget === "function") m.target = partyNearestTarget(c, m);
      const pp = (m.target && m.target.p) ? m.target.p : p;
      // 1) skills do .lua (cada uma rola a própria chance)
      if (typeof mobCastSkill === "function") mobCastSkill(c, pp, m, now);
      // 2) melee (ataque básico) — roda SEMPRE que o monstro tem dano base
      if ((m.def && (m.def.damage || 0) > 0)) mobAttack(c, pp, m);
      m.atkCd = (m.def && m.def.attackSpeed) || 2000;
    }
    monsterThinkYell(m, dt);
  }

  // Re-strikes do 15.25 (Death Echo / Spiritual Outburst): 1 segundo apos
  // o primeiro impacto, o MESMO alvo recebe a fracao do dano inicial.
  // Alvo morto ou fora de cena simplesmente perde o eco.
  if (c.delayedHits && c.delayedHits.length) {
    const pend = [];
    for (const h of c.delayedHits) {
      if (h.at > now) { pend.push(h); continue; }
      const mob = c.mobs.find((m) => m.id === h.mobId);
      if (mob && mob.hp > 0) {
        const dmg = Math.max(1, h.dmg);
        mob.hp -= dmg;
        c.stats.damage += dmg;
        c.events.push({ t: "hit", dmg: dmg, x: mob.x, y: mob.y,
                        screen: true, el: h.el, fx: h.fx || "death-echo" });
      }
    }
    c.delayedHits = pend;
  }

  // morte do jogador. PARTY COMBAT: o personagem que caiu vira
  // INCONSCIENTE e renasce no local depois de um tempo; o controle passa
  // para o próximo membro vivo. Só quando TODOS caem é que vale a morte
  // normal (perda + revive da instância inteira).
  if (p.hp <= 0) {
    if (c.players && c.players.length > 1 &&
        typeof partyHandleDown === "function") {
      partyHandleDown(c, p);
      const vivos = c.players.some((e) => e.p && e.p.hp > 0);
      if (!vivos) { playerDeath(c, p); return; }
    } else {
      playerDeath(c, p); return;
    }
  }

  // monstros mortos
  const alive = [];
  for (const m of c.mobs) {
    if (m.hp > 0) { alive.push(m); continue; }
    // recompensa
    const staminaMul = p.stamina > 39 * 3600 ? 1.5 : p.stamina > 0 ? 1.0 : 0.5;
    let exp = Math.floor(m.def.exp * staminaMul * expStage(p.level) * (c.expMul || 1));
    // Prey de EXP (TibiaWiki/Prey_System): +13~40% de experiência
    if (typeof preyExpBonus === "function") {
      const pExp = preyExpBonus(p, m.slug);
      if (pExp > 0) exp = Math.floor(exp * (1 + pExp / 100));
    }
    // VIP: bônus de +10% EXP
    if (typeof vipExpBonus === "function" && vipExpBonus() > 1) {
      exp = Math.floor(exp * vipExpBonus());
    }
    // Party — Shared Experience (TibiaWiki/Party): Exp = M * S / P * C.
    // O exp calculado já é o M*C do líder (stamina/prey); cada membro do
    // party recebe M*S/P aplicado de verdade no save dele (com level-up).
    const partyShare = (typeof partyShareExp === "function") ? partyShareExp(p, exp) : null;
    if (partyShare) {
      exp = partyShare.leaderExp;
      for (const mem of partyShare.members) {
        const ups = (typeof partyApplyToMember === "function")
          ? partyApplyToMember(mem.id, mem.exp) : 0;
        // PARTY COMBAT: o membro em cena (entidade viva) também ganha o XP
        // na hora — o save do roster é cópia e não refletiria o level-up
        if (typeof partyApplyToMemberLive === "function") {
          partyApplyToMemberLive(mem.id, mem.exp);
        }
        if (typeof partyRecordKill === "function") {
          partyRecordKill(p, mem.id, mem.exp, 0, ups);
        }
      }
      if (typeof partyRecordKill === "function") partyRecordKill(p, null, exp, 0, 0);
    }
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
    // bosstiary: boss abatido rende boss points, que sobem o nivel
    let bossGanho = 0;
    if (m.def && m.def.boss && typeof bosstiaryKill === "function") {
      bossGanho = bosstiaryKill(p, m.slug, 1);
    }
    const loot = rollLoot(c, p, m);
    if (typeof partyRecordKill === "function" && partyShare) {
      partyRecordKill(p, null, 0, loot.length, 0);
    }
    c.events.push({ t: "kill", mob: m.slug, name: displayMonsterName(m.def.name),
                    exp: exp, loot: loot, x: m.x, y: m.y, screen: true,
                    charm: charmGanho, bossPts: bossGanho });
  }
  c.mobs = alive;

  // auto sell / equip periodicos sao chamados pelo game loop
}
