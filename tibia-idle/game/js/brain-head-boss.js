/* brain-head-boss.js — Boss Brain Head (Feast of Souls 250+).
 * Sala: game/maps/brainheadroom.otbm
 * Mecânica: 4 Cerebellum estáticos e imunes ao redor do boss. Enquanto
 * houver Cerebellum vivo, Brain Head não leva dano. Só depois o boss fica
 * vulnerável ao jogador e o helper.
 */
"use strict";

const BRAIN_HEAD_ID = "brain-head";
const CEREBELLUM_ID = "cerebellum";
const BRAINHEAD_ROOM = {
  otbm: "brainheadroom",
  name: "Brain Head's Room",
  center: { x: 1024, y: 1028, z: 7 },
  spawn: { x: 1024, y: 1034, z: 7 },
  boss: { x: 1024, y: 1028, z: 7 },
  cerebella: [
    { x: 1024, y: 1025, z: 7 },
    { x: 1027, y: 1028, z: 7 },
    { x: 1024, y: 1031, z: 7 },
    { x: 1021, y: 1028, z: 7 },
  ],
};

(function registerBrainHead() {
  if (typeof GAMEDATA === "undefined") return;

  if (typeof MOBSHEETS !== "undefined") {
    if (!MOBSHEETS[BRAIN_HEAD_ID]) MOBSHEETS[BRAIN_HEAD_ID] = { cw: 64, ch: 64, cols: 1, rows: 1 };
    if (!MOBSHEETS[CEREBELLUM_ID]) MOBSHEETS[CEREBELLUM_ID] = { cw: 64, ch: 32, cols: 1, rows: 1 };
  }
  if (typeof CREATURE_ANCHORS !== "undefined") {
    if (!CREATURE_ANCHORS[BRAIN_HEAD_ID]) CREATURE_ANCHORS[BRAIN_HEAD_ID] = { sw: 64, sh: 64, ox: 0, oy: 0 };
    if (!CREATURE_ANCHORS[CEREBELLUM_ID]) CREATURE_ANCHORS[CEREBELLUM_ID] = { sw: 64, sh: 32, ox: 0, oy: 0 };
  }

  if (typeof MONSTERMOVES !== "undefined") {
    MONSTERMOVES[BRAIN_HEAD_ID] = { attackable: 1, blockable: 0, hostile: 1, pushCreatures: 0, pushItems: 0, speed: 0, staticAttack: 99, targetDistance: 7 };
    MONSTERMOVES[CEREBELLUM_ID] = { attackable: 1, blockable: 0, hostile: 1, pushCreatures: 0, pushItems: 0, speed: 0, staticAttack: 99, targetDistance: 7 };
  }

  if (!GAMEDATA.items) GAMEDATA.items = {};
  const lootItems = {
    "cursed-bone": { n: "cursed bone", s: null, t: "loot", cid: 32774, sell: 6000, npcSell: 6000 },
    "death-toll": { n: "death toll", s: null, t: "loot", cid: 32703, sell: 1000, npcSell: 1000 },
    "ivory-comb": { n: "ivory comb", s: null, t: "loot", cid: 32773, sell: 8000, npcSell: 8000 },
    "silver-hand-mirror": { n: "silver hand mirror", s: null, t: "loot", cid: 32772, sell: 10000, npcSell: 10000 },
    "amber-with-a-dragonfly": { n: "amber with a dragonfly", s: null, t: "loot", cid: 32625, sell: 56000, npcSell: 56000 },
    "phantasmal-axe": { n: "phantasmal axe", s: "weapon", t: "axe", cid: 32616, sell: 0, npcSell: 0 },
    "ghost-claw": { n: "ghost claw", s: "weapon", t: "club", cid: 32631, sell: 0, npcSell: 0 },
    "giant-amethyst": { n: "giant amethyst", s: null, t: "loot", cid: 32622, sell: 60000, npcSell: 60000 },
    "spooky-hood": { n: "spooky hood", s: "head", t: "armor", cid: 32630, sell: 0, npcSell: 0 },
    "ring-of-souls": { n: "ring of souls", s: "ring", t: "ring", cid: 32636, sell: 0, npcSell: 0 },
  };
  for (const slug in lootItems) {
    if (!GAMEDATA.items[slug]) GAMEDATA.items[slug] = lootItems[slug];
    else {
      GAMEDATA.items[slug].sell = lootItems[slug].sell;
      GAMEDATA.items[slug].npcSell = lootItems[slug].npcSell;
      if (GAMEDATA.items[slug].cid == null) GAMEDATA.items[slug].cid = lootItems[slug].cid;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["brain-head-room"] = {
    name: "Brain Head's Room",
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: [BRAIN_HEAD_ID],
    color: "#3d2a4a",
    scene: "palace",
    otbm: BRAINHEAD_ROOM.otbm,
    otbmFloor: 7,
    otbmBounds: { x: 1008, y: 1014, w: 31, h: 29, z: 7 },
    otbmSpawn: BRAINHEAD_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, BRAINHEAD_ROOM.boss),
    avgHp: 75000,
    avgExp: 55000,
    avgDamage: 1300,
    avgArmor: 78,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;
  BOSS_DEFS[BRAIN_HEAD_ID] = {
    id: BRAIN_HEAD_ID,
    name: "Brain Head",
    title: "Feast of Souls",
    hunt: "brain-head-room",
    sprite: BRAIN_HEAD_ID,
    baseMonster: BRAIN_HEAD_ID,
    hp: 75000,
    exp: 55000,
    damage: 1300,
    armor: 78,
    defense: 78,
    speed: 0,
    fixedSpawn: true,
    loot: [],
    requirement: { level: 250, text: "Requer nível 250+ (Feast of Souls)" },
    cooldown: 16 * 60 * 60 * 1000,
  };
})();

function brainheadCerebellumAlive(c) {
  const alive = !!(c && c.brainHead && c.brainHead.cerebella && c.brainHead.cerebella.some((m) => m && m.hp > 0));
  if (c && c.brainHead && !alive) {
    c.brainHead.immune = false;
    if (c.brainHead.boss) c.brainHead.boss.qteImmune = false;
  }
  return alive;
}

function brainheadBossCanTakePlayerDamage(c, target) {
  if (!c || !target || !target.boss || target.slug !== BRAIN_HEAD_ID) return true;
  // Bloqueia desde o primeiro frame da arena; os Cerebellum entram após o
  // atraso visual de spawn e só então passam a controlar a imunidade.
  if (!c.brainHead) return false;
  return !c.brainHead.immune && !brainheadCerebellumAlive(c);
}

function brainheadBossOrigin(c) {
  const bounds = c && c.hunt && c.hunt.otbmBounds ? c.hunt.otbmBounds : {};
  return { ox: Number(bounds.x) || 0, oy: Number(bounds.y) || 0 };
}

function brainheadMapSize(c) {
  const hunt = c.huntMap || {};
  const rows = Array.isArray(hunt.rows) ? hunt.rows : [];
  const w = rows.length ? (rows[0] || "").length : (typeof GRID_W !== "undefined" ? GRID_W : 31);
  const h = rows.length || (typeof GRID_H !== "undefined" ? GRID_H : 29);
  return { w, h };
}

function brainheadBossSpawnCerebellum(c) {
  const { ox, oy } = brainheadBossOrigin(c);
  const { w, h } = brainheadMapSize(c);
  const base = (GAMEDATA && GAMEDATA.monsters && GAMEDATA.monsters[CEREBELLUM_ID]) ||
    (typeof MONSTERDATA !== "undefined" && MONSTERDATA[CEREBELLUM_ID]);
  if (!base) return [];
  const now = Date.now();
  const mobs = [];
  for (const pos of BRAINHEAD_ROOM.cerebella) {
    const def = Object.assign({}, base);
    def.ranged = true;
    def.speed = 0;
    const cx = pos.x - ox;
    const cy = pos.y - oy;
    const s = (typeof cellToScreen === "function") ? cellToScreen(cx, cy, w, h) : { x: (cx + 0.5) / w, y: (cy + 0.5) / h };
    const m = {
      slug: CEREBELLUM_ID,
      def: def,
      cerebellum: true,
      boss: false,
      hp: def.hp,
      maxHp: def.hp,
      atkCd: Math.random() * 500,
      id: "cerebellum-" + mobs.length + "-" + Math.random().toString(36).slice(2, 6),
      dir: "w",
      moving: false,
      attackAnim: 0,
      speed: 0,
      cx: cx,
      cy: cy,
      x: s.x,
      y: s.y,
      sx: s.x,
      sy: s.y,
      spawnAt: now,
    };
    c.pendingSpawns = c.pendingSpawns || [];
    c.pendingSpawns.push({ mob: m, cx: cx, cy: cy, startedAt: now, blink: 0, done: false });
    mobs.push(m);
  }
  return mobs;
}

function brainheadBossInit(c, player) {
  if (!c || !c.mobs) return false;
  const boss = c.mobs.find((m) => m && m.boss && m.slug === BRAIN_HEAD_ID);
  if (!boss) return false;
  if (c.brainHead) return false;
  boss.def = Object.assign({}, boss.def);
  boss.def.ranged = true;
  boss.def.speed = 0;
  boss.speed = 0;
  const cerebella = brainheadBossSpawnCerebellum(c, player);
  c.brainHead = { boss: boss, cerebella: cerebella, immune: true, startedAt: Date.now() };
  return true;
}
