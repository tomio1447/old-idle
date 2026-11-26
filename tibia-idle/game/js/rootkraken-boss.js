/* rootkraken-boss.js — Boss The Rootkraken (nível 400+).
 *
 * Boss final da "The Rise of Podzilla" (update 13.40.54ea79, jul/2024).
 * O monstro "the-rootkraken" já vem COMPLETO do dump Canary
 * (game/data/canarymonsters.json → MONSTERDATA): hp 360.000, exp 600.000,
 * looktype 1765, damage 1200, armor/defense 85, mitigation 2, speed 180,
 * resists energy +15 / earth -10 / fire -15, imune paralyze+invisible+drunk,
 * boss:1, tabela de loot oficial de 29 entradas — usada verbatim (sem
 * MONSTER def aqui; igual ao padrão de bosses presentes no dump).
 *
 * ══ MECÂNICA "ROOT DEEP" ══ (oficial, tibiawiki.com.br The Rise of
 * Podzilla Quest + guias SU24):
 *  - Cada jogador tem um contador que começa em 100 e cresce durante a
 *    luta, sem teto (oficial "até 1.000+"). O dano SOFRIDO por aquele
 *    jogador escala com o contador: dmg *= contador/100.
 *  - A sala spawna até 9 Rotten Plant Thing (carniphila verde). Se não
 *    forem mortas transformam em Angry Plant Thing (amarela) e depois em
 *    Frenzied Plant Thing (azul); quando a Frenzied ATACA o jogador o
 *    contador sobe (ela "faz seu contador aumentar").
 *  - Rampas/Writhing Mass/barreiras da luta real: NÃO implementadas (o
 *    idle não tem exploração de sala; documentado como simplificação —
 *    a mecânica central contador+plants cobre o risco principal).
 *
 * DESIGN CALLs (taxas — não documentadas nas fontes oficiais):
 *  - Contador: +25 a cada 8s de luta (passivo) e +25 por golpe recebido
 *    de Frenzied Plant Thing. Sem teto (o cap oficial 1000+ vive na
 *    prática pelo tempo de sala).
 *  - Plant spawn: 1 a cada 9s até o teto de 9 plant things vivas (só
 *    conta rotten/angry/frenzied com hp>0).
 *  - Transformação: rotten→angry 20s após nascer, angry→frenzied +20s
 *    (reloga a janela de kill do guia oficial).
 *  - Stats das plant things (DESIGN CALL — não constam no dump Canary e
 *    as wikis não listam hp/dano): adds de boss 400+ — rotten 24k hp /
 *    dmg 600, angry 34k / 800, frenzied 45k / 1000, exp 0 (adds não dão
 *    XP), earth +20 / fire -10 (família carniphila), imunes a
 *    paralisia/invisível. Sprites: looktypes 1767/1768/1769 do DAT —
 *    mesma base carniphila em verde/amarelo/azul, exatamente como o
 *    guia oficial descreve (verificado renderizando 1759–1772: 1767 é a
 *    carniphila verde, 1768 a amarela, 1769 a azul; sheets geradas pelo
 *    mesmo layout 9×4 @64px do the-rootkraken.png).
 *
 * UI do contador (minimal viable): evento "say" flutuante + linha no
 * log a cada cruzamento de 250/500/750/1000+; estado serializado em
 * descriptor.state.rootkraken (online) — idêntico ao caminho do hatred.
 *
 * Coordenadas absolutas do RME (sala rootkraken.otbm, 44×37 z=7,
 * bounds 1009..1052 × 1016..1052 — o .otbm já é o recorte da sala):
 *   bossspawn   {1030,1029,7} → local (21,13)
 *   playerspawn {1030,1038,7} → local (21,22)
 *   centermap   {1030,1034,7} → local (21,18) — caminhável e conectada
 *   no componente de ~370 sqm.
 */
"use strict";

const ROOTKRAKEN_ID = "the-rootkraken";

/* Cooldown: 20h — padrão Archfoe (boss de quest sem cd próprio). */
const ROOTKRAKEN_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const ROOTKRAKEN_ROOM = {
  otbm: "rootkraken",
  name: "The Rootkraken's Room",
  center: { x: 1030, y: 1034, z: 7 },
  spawn: { x: 1030, y: 1038, z: 7 },   // playerspawn
  boss:  { x: 1030, y: 1029, z: 7 },   // bossspawn
};

const ROOTKRAKEN_STATS = {
  name: "The Rootkraken",
  hp: 360000,
  exp: 600000,
  damage: 1200,
  armor: 85,
  defense: 85,
};

/* ══ Plant things (adds do Rootkraken) — ausentes do dump Canary.
 * Stats = DESIGN CALL (ver cabeçalho). Slugs/sheets em
 * assets/mob/<slug>.png (9×4 @64px, looktypes 1767/1768/1769). */
const RK_PLANT_THINGS = {
  "rotten-plant-thing": {
    name: "Rotten Plant Thing",
    hp: 24000, exp: 0, speed: 150, armor: 40, defense: 40,
    damage: 600, element: "physical", attackSpeed: 2000, mitigation: 1.5,
    resist: { earth: 20, fire: -10 },
    skills: [
      { el: "earth", min: 250, max: 480, int: 2500, ch: 30, range: 7, fx: "plant-attack", miss: "poison", alvo: 1 },
      { el: "physical", min: 300, max: 600, int: 2000, ch: 20, range: 1, alvo: 1 },
    ],
    looktype: 1767, race: "venom", targetDistance: 1, staticAttack: 90,
    imune: ["paralyze", "invisible"],
    grupo: "bosses", rkStage: 0,
  },
  "angry-plant-thing": {
    name: "Angry Plant Thing",
    hp: 34000, exp: 0, speed: 165, armor: 50, defense: 50,
    damage: 800, element: "physical", attackSpeed: 2000, mitigation: 1.8,
    resist: { earth: 20, fire: -10 },
    skills: [
      { el: "earth", min: 350, max: 640, int: 2500, ch: 30, range: 7, fx: "plant-attack", miss: "poison", alvo: 1 },
      { el: "physical", min: 420, max: 780, int: 2000, ch: 20, range: 1, alvo: 1 },
    ],
    looktype: 1768, race: "venom", targetDistance: 1, staticAttack: 90,
    imune: ["paralyze", "invisible"],
    grupo: "bosses", rkStage: 1,
  },
  "frenzied-plant-thing": {
    name: "Frenzied Plant Thing",
    hp: 45000, exp: 0, speed: 180, armor: 60, defense: 60,
    damage: 1000, element: "physical", attackSpeed: 2000, mitigation: 2.0,
    resist: { earth: 20, fire: -10 },
    skills: [
      { el: "earth", min: 480, max: 820, int: 2500, ch: 30, range: 7, fx: "plant-attack", miss: "poison", alvo: 1 },
      { el: "physical", min: 560, max: 990, int: 2000, ch: 20, range: 1, alvo: 1 },
    ],
    looktype: 1769, race: "venom", targetDistance: 1, staticAttack: 90,
    imune: ["paralyze", "invisible"],
    grupo: "bosses", rkStage: 2,
  },
};

/* Cadeia de transformação oficial: rotten → angry → frenzied. */
const RK_PLANT_CHAIN = {
  "rotten-plant-thing": "angry-plant-thing",
  "angry-plant-thing": "frenzied-plant-thing",
};

/* DESIGN CALLs — taxas da mecânica (ver cabeçalho). */
const RK_COUNTER_START = 100;
const RK_COUNTER_STEP = 25;
const RK_COUNTER_GROWTH_MS = 8000;   // crescimento passivo
const RK_COUNTER_HIT_STEP = 25;      // golpe recebido de frenzied
const RK_PLANT_CAP = 9;              // oficial: até 9 Rotten Plant Thing
const RK_PLANT_SPAWN_MS = 9000;
const RK_TRANSFORM_MS = 20000;       // por estágio (rotten→angry→frenzied)
const RK_COUNTER_MARKS = [250, 500, 750, 1000]; // thresholds de aviso na UI

const ROOTKRAKEN_DATA = {
  monsterSlug: ROOTKRAKEN_ID,
  /* O boss já vem do dump (canarymonsters.json); o patch só registra os
   * plant things no MONSTERS do servidor. */
  registerMonsters(monsters) {
    if (!monsters) return;
    for (const slug in RK_PLANT_THINGS) monsters[slug] = RK_PLANT_THINGS[slug];
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = ROOTKRAKEN_DATA;

/* ─── helpers da mecânica (cliente offline — espelho do engine) ─── */

function rkParticipants(c) {
  if (c.players && c.players.length) return c.players;
  const ent = c.player || (typeof G !== "undefined" && G && G.p ? { id: G.p.id, p: G.p } : null);
  return ent ? [ent] : [];
}
function rkPlayerKey(ent) {
  return String((ent && (ent.id || (ent.p && ent.p.id))) || "player");
}
function rkBoss(c) {
  return (c.mobs || []).find((m) => m && m.boss && m.hp > 0) ||
         (c.mobs || []).find((m) => m && m.slug === ROOTKRAKEN_ID && m.hp > 0) || null;
}
function rkPlants(c) {
  return (c.mobs || []).filter((m) => m && m.rkPlant && m.hp > 0);
}

/* Entidade dona do player `p` (o multiplicador recebe o player data,
 * não a entidade) — mesmo mapeamento do hatredEntFor. */
function rkEntFor(c, p) {
  return rkParticipants(c).find(
    (e) => e && (e.p === p || String(e.id) === String(p && p.id) ||
                 String(e.p && e.p.id) === String(p && p.id))) || null;
}

/* Contador→dano sofrido: dmg *= counter/100 para QUALQUER fonte (oficial:
 * "quanto maior o contador, mais dano você leva"). */
function rootkrakenBossOutgoingDamageMultiplier(c, mob, p) {
  if (!c || !c.rootkraken || !p) return 1;
  const ent = rkEntFor(c, p);
  const key = rkPlayerKey(ent || { id: p.id, p: p });
  const n = Number(c.rootkraken.counters && c.rootkraken.counters[key]);
  if (!Number.isFinite(n) || n <= 0) return 1;
  /* Golpe da frenzied também aumenta o contador (oficial). Aplicado aqui
   * porque este é o único ponto que conhece mob E alvo; o passivo cresce
   * no tick. */
  if (mob && mob.slug === "frenzied-plant-thing")
    c.rootkraken.counters[key] = n + RK_COUNTER_HIT_STEP;
  return Math.max(1, (Number(c.rootkraken.counters[key]) || RK_COUNTER_START) / RK_COUNTER_START);
}

function rootkrakenBossInit(c, player) {
  if (!c || c.rootkraken) return;
  const now = Date.now();
  c.rootkraken = {
    counters: {}, nextCounterAt: now + RK_COUNTER_GROWTH_MS,
    nextPlantAt: now + RK_PLANT_SPAWN_MS, marks: {},
  };
  for (const ent of rkParticipants(c)) c.rootkraken.counters[rkPlayerKey(ent)] = RK_COUNTER_START;
}

function rkPlantMob(c, slug, now) {
  const base = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters[slug]) ||
               (typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug]);
  if (!base) return null;
  const def = Object.assign({}, base);
  const as = Math.max(500, Number(def.attackSpeed) || 2000);
  return {
    slug: slug, def: def, name: def.name,
    boss: false, rkPlant: true, rkSpawnedAt: now,
    influenced: false, fiendish: false, sinisterStacks: 0,
    hp: def.hp, maxHp: def.hp,
    atkCd: Math.floor(as * 0.15) + Math.random() * (as - Math.floor(as * 0.15)),
    id: "rk-" + Math.random().toString(36).slice(2, 8),
    dir: "w", moving: false, attackAnim: 0,
    speed: 0.000045 + Math.random() * 0.000025,
    spawnAt: now,
  };
}

function rkPlantCell(c) {
  /* Célula livre perto do centro da arena (mesmo helper do spawn wave). */
  const gridW = (typeof GRID_W === "number" ? GRID_W : 30);
  const gridH = (typeof GRID_H === "number" ? GRID_H : 30);
  const occ = (typeof buildOccupancy === "function") ? buildOccupancy(c, null) : null;
  if (occ) {
    for (const sp of c.pendingSpawns || [])
      if (sp && Number.isFinite(Number(sp.cx))) occ.set(Number(sp.cx) + ":" + Number(sp.cy), true);
    const ent = { cx: undefined, cy: undefined };
    if (typeof placeFree === "function")
      placeFree(ent, occ, Math.floor(gridW / 2), Math.floor(gridH / 2), Math.max(gridW, gridH));
    if (Number.isFinite(ent.cx)) return { cx: ent.cx, cy: ent.cy };
  }
  return { cx: Math.floor(gridW * 0.5), cy: Math.floor(gridH * 0.35) };
}

function rkTransformMob(c, mob, nextSlug, now) {
  const base = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters[nextSlug]) ||
               (typeof MONSTERDATA !== "undefined" && MONSTERDATA[nextSlug]);
  if (!base) return;
  mob.slug = nextSlug;
  mob.def = Object.assign({}, base);
  mob.name = base.name;
  mob.rkSpawnedAt = now;
  /* Mantém o HP atual (o add continua o mesmo — só muda de estágio). */
  mob.maxHp = Math.max(mob.hp, base.hp);
  c.events = c.events || [];
  const pos = (typeof entityPosition === "function") ? entityPosition(mob, 0.5, 0.5) : { x: mob.x, y: mob.y };
  c.events.push({ t: "transform", slug: nextSlug, x: pos.x, y: pos.y, targetId: String(mob.id || ""), screen: true });
}

function rootkrakenBossTick(c, now) {
  if (!c || !c.rootkraken) return true;
  now = now || Date.now();
  const st = c.rootkraken;
  st.counters = st.counters || {};
  for (const ent of rkParticipants(c))
    if (st.counters[rkPlayerKey(ent)] === undefined) st.counters[rkPlayerKey(ent)] = RK_COUNTER_START;

  const boss = rkBoss(c);
  if (!boss) {
    /* Boss morto: plants param de nascer/evoluir, contador congela. */
    return true;
  }

  /* Crescimento passivo do contador (+25 / 8s por jogador). */
  while (now >= st.nextCounterAt) {
    st.nextCounterAt += RK_COUNTER_GROWTH_MS;
    for (const ent of rkParticipants(c)) {
      const key = rkPlayerKey(ent);
      if (ent.p && ent.p.hp > 0)
        st.counters[key] = (Number(st.counters[key]) || RK_COUNTER_START) + RK_COUNTER_STEP;
    }
  }
  /* Thresholds → floater "say" + log (UI minimal viable). */
  st.marks = st.marks || {};
  for (const ent of rkParticipants(c)) {
    const key = rkPlayerKey(ent);
    const n = Number(st.counters[key]) || RK_COUNTER_START;
    let mark = 0;
    for (const m of RK_COUNTER_MARKS) if (n >= m) mark = m;
    if (n > 1000) mark = Math.floor(n / 250) * 250;
    if (mark > (st.marks[key] || 0)) {
      st.marks[key] = mark;
      const pos = (typeof entityPosition === "function") ? entityPosition(ent, 0.5, 0.5) : { x: 0.5, y: 0.5 };
      c.events = c.events || [];
      c.events.push({ t: "say", text: "ROOT DEEP " + n, whoId: key, x: pos.x, y: pos.y, screen: true });
      if (typeof addLog === "function")
        addLog("warn", "Root Deep: " + n + " — o dano sofrido aumenta!");
    }
  }

  /* Transformação rotten → angry → frenzied (20s por estágio). */
  for (const m of rkPlants(c)) {
    const next = RK_PLANT_CHAIN[m.slug];
    if (next && now - (Number(m.rkSpawnedAt) || now) >= RK_TRANSFORM_MS)
      rkTransformMob(c, m, next, now);
  }

  /* Spawn: até 9 plant things vivas (conta pendingSpawns também). */
  const pendPlants = (c.pendingSpawns || []).filter((sp) => sp && sp.mob && sp.mob.rkPlant).length;
  while (now >= st.nextPlantAt) {
    st.nextPlantAt += RK_PLANT_SPAWN_MS;
    if (rkPlants(c).length + pendPlants >= RK_PLANT_CAP) break;
    const mob = rkPlantMob(c, "rotten-plant-thing", now);
    if (!mob) break;
    const cell = rkPlantCell(c);
    c.pendingSpawns = c.pendingSpawns || [];
    c.pendingSpawns.push({ mob: mob, cx: cell.cx, cy: cell.cy, startedAt: now, blink: 0, done: false });
  }
  return true;
}

function rootkrakenBossCleanup(c) {
  if (c) delete c.rootkraken;
}

/* ─── registro (GAMEDATA compartilhado client/servidor) ─── */
(function registerRootkraken() {
  if (typeof GAMEDATA === "undefined") return;

  /* Plant things: ausentes do dump — registra nos dois catálogos. O boss
   * ("the-rootkraken") JÁ existe no dump → não sobrescrever. */
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  for (const slug in RK_PLANT_THINGS) {
    if (typeof MONSTERDATA !== "undefined" && MONSTERDATA) MONSTERDATA[slug] = RK_PLANT_THINGS[slug];
    GAMEDATA.monsters[slug] = RK_PLANT_THINGS[slug];
  }

  /* Mob sheets: the-rootkraken (576×256 = 9×4 @64px) + 3 plants
   * (mesmo layout, geradas dos looktypes 1767/1768/1769 do DAT). */
  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS) {
    if (!MOBSHEETS[ROOTKRAKEN_ID]) MOBSHEETS[ROOTKRAKEN_ID] = { cw: 64, ch: 64, cols: 9, rows: 4 };
    for (const slug in RK_PLANT_THINGS)
      if (!MOBSHEETS[slug]) MOBSHEETS[slug] = { cw: 64, ch: 64, cols: 9, rows: 4 };
  }

  /* Itens de loot novos — cids do canary-items.xml; preços oficiais de
   * NPC (Yasir / tibiadb). amber-slayer & cia. (WEAPONDATA): NPC value
   * oficial 0 (sem comprador — tibiadb "Weapons: NPC value 0") → fix
   * cid + sell/npcSell 0, mesmo padrão do set Moonsilver/dragon-scale.
   * Itens compartilhados (poções, gems, white-gem) NÃO são reprecificados
   * aqui — mantém paridade com mimar-haffar/court-warlock/feast-of-souls. */
  if (!GAMEDATA.items) GAMEDATA.items = {};
  const lootItems = {
    /* amber: NPC value oficial 20.000 (tibiadb "Valuables"). */
    "amber": { n: "amber", s: null, t: "loot", cid: 32626, w: 1, sell: 20000, npcSell: 20000 },
    /* creature products do Rootkraken → Yasir (oficial). */
    "root-tentacle": { n: "root tentacle", s: null, t: "loot", cid: 48516, w: 1, sell: 300000, npcSell: 300000 },
    "fish-eye": { n: "fish eye", s: null, t: "loot", cid: 48517, w: 1, sell: 500000, npcSell: 500000 },
    /* item de quest (Rootwalker outfit) — sem comprador NPC → sell 0. */
    "strange-inedible-fruit": { n: "strange inedible fruit", s: null, t: "loot", cid: 48514, w: 0.25, sell: 0, npcSell: 0 },
  };
  for (const slug in lootItems) {
    const def = lootItems[slug];
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = def;
    else {
      if (def.sell != null) GAMEDATA.items[slug].sell = def.sell;
      if (def.npcSell != null) GAMEDATA.items[slug].npcSell = def.npcSell;
      if (def.cid != null && GAMEDATA.items[slug].cid == null) GAMEDATA.items[slug].cid = def.cid;
      if (def.w != null && GAMEDATA.items[slug].w == null) GAMEDATA.items[slug].w = def.w;
    }
  }
  /* Amber weapons (8): existem no weapondata com `id` mas sem `cid` e
   * com sell placeholder — NPC value oficial 0 → cid + sell/npcSell 0. */
  const AMBER_WEAPON_CIDS = {
    "amber-slayer": 47368, "amber-greataxe": 47369, "amber-bludgeon": 47370,
    "amber-sabre": 47374, "amber-axe": 47375, "amber-cudgel": 47376,
    "amber-crossbow": 47377, "amber-kusarigama": 50239,
  };
  for (const slug in AMBER_WEAPON_CIDS) {
    const it = GAMEDATA.items[slug];
    if (!it) continue;
    if (it.cid == null) it.cid = AMBER_WEAPON_CIDS[slug];
    it.sell = 0; it.npcSell = 0;
  }

  /* Hunt técnica invisível da sala (mesmo padrão dragon-pack-room). */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["the-rootkraken-room"] = {
    name: ROOTKRAKEN_ROOM.name,
    hidden: true,
    level: 400,
    minLevel: 400,
    monsters: [ROOTKRAKEN_ID],
    color: "#3f6b2a",
    scene: "lair",
    otbm: ROOTKRAKEN_ROOM.otbm,
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da sala.
    otbmSpawn: ROOTKRAKEN_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, ROOTKRAKEN_ROOM.boss),
    avgHp: ROOTKRAKEN_STATS.hp,
    avgExp: ROOTKRAKEN_STATS.exp,
    avgDamage: ROOTKRAKEN_STATS.damage,
    avgArmor: ROOTKRAKEN_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  BOSS_DEFS[ROOTKRAKEN_ID] = {
    id: ROOTKRAKEN_ID,
    name: ROOTKRAKEN_STATS.name,
    title: "Boss da The Rise of Podzilla",
    hunt: "the-rootkraken-room",
    sprite: ROOTKRAKEN_ID,
    baseMonster: ROOTKRAKEN_ID,
    hp: ROOTKRAKEN_STATS.hp,
    exp: ROOTKRAKEN_STATS.exp,
    damage: ROOTKRAKEN_STATS.damage,
    armor: ROOTKRAKEN_STATS.armor,
    defense: ROOTKRAKEN_STATS.defense,
    speed: 0.00002,
    loot: [],
    requirement: {
      level: 400,
      killsRequired: ["doctor-marrow"],
      mission: "podzilla-bottom",
      enforced: true,
      text: "The Rise of Podzilla — Missão 1: eliminar 1500 monstros em Podzilla Bottom (requer Doctor Marrow + nível 400)",
    },
    cooldown: ROOTKRAKEN_COOLDOWN_MS,
  };

  if (typeof BOSS_MODAL_SECTIONS !== "undefined") {
    const sect = BOSS_MODAL_SECTIONS.find((s) => s.title === "BOSSES 400+");
    if (sect && sect.ids.indexOf(ROOTKRAKEN_ID) < 0) {
      const at = sect.ids.indexOf("dragon-pack");
      if (at >= 0) sect.ids.splice(at + 1, 0, ROOTKRAKEN_ID);
      else sect.ids.push(ROOTKRAKEN_ID);
    }
  }
})();
