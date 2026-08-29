"use strict";

const HEART_BOSS_IDS = ["aftershock", "anomaly", "eradicator", "outburst", "realityquake", "rupture", "world-devourer"];
const HEART_ROOM = {
  otbm: "hearthboss",
  center: { x: 1026, y: 1026, z: 7 },
  boss: { x: 1023, y: 1021, z: 7 },
  spawn: { x: 1029, y: 1030, z: 7 },
};

(function registerHeartDestructionBosses() {
  if (typeof GAMEDATA === "undefined") return;
  if (typeof MOBSHEETS !== "undefined" && !MOBSHEETS.realityquake) {
    MOBSHEETS.realityquake = { cw: 32, ch: 32, cols: 1, rows: 1 };
  }
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  const sharedLoot = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters.outburst && GAMEDATA.monsters.outburst.loot) ||
    (typeof MONSTERDATA !== "undefined" && MONSTERDATA.outburst && MONSTERDATA.outburst.loot) || [];
  const stats = {
    aftershock: { name: "Aftershock", hp: 105000, exp: 20000, damage: 900, armor: 100, defense: 100, loot: sharedLoot },
    anomaly: { name: "Anomaly", hp: 290000, exp: 50000, damage: 1400, armor: 100, defense: 100 },
    eradicator: { name: "Eradicator", hp: 290000, exp: 50000, damage: 1800, armor: 100, defense: 100 },
    outburst: { name: "Outburst", hp: 290000, exp: 50000, damage: 1800, armor: 100, defense: 100 },
    realityquake: { name: "Realityquake", hp: 110000, exp: 20000, damage: 1000, armor: 100, defense: 100 },
    rupture: { name: "Rupture", hp: 290000, exp: 112000, damage: 1100, armor: 100, defense: 100 },
    "world-devourer": { name: "World Devourer", hp: 25000, exp: 77700, damage: 1600, armor: 150, defense: 150 },
  };
  for (const id of HEART_BOSS_IDS) {
    const def = stats[id];
    const huntId = `${id}-room`;
    GAMEDATA.hunts[huntId] = {
      name: `${def.name}'s Room`, hidden: true, level: 150, minLevel: 150,
      monsters: [id], color: "#4d4162", scene: "palace",
      otbm: HEART_ROOM.otbm, otbmFloor: 7,
      otbmBounds: { x: 1016, y: 1020, w: 21, h: 13, z: 7 },
      otbmSpawn: HEART_ROOM.spawn,
      otbmMobBounds: Object.assign({ w: 1, h: 1 }, HEART_ROOM.boss),
      avgHp: def.hp, avgExp: def.exp, avgDamage: def.damage,
      avgArmor: def.armor, avgGold: 100, respawn: 1, pack: 1, cat: "boss-room",
    };
    if (typeof BOSS_DEFS !== "undefined") {
      BOSS_DEFS[id] = Object.assign({
        id, title: id === "world-devourer" ? "Boss final Heart of Destruction" : "Heart of Destruction",
        hunt: huntId, sprite: id, baseMonster: id, speed: 0.000055, loot: [],
        requirement: { level: 150, text: "Requer nível 150+" },
        cooldown: 16 * 60 * 60 * 1000,
      }, def);
    }
  }
})();

function heartBossInit(c) {
  if (!c || !c.boss || HEART_BOSS_IDS.indexOf(c.boss.id) === -1 || c.heartDestruction) return;
  c.heartDestruction = { stages: {}, nextWorldAddsAt: Date.now() + 10000 };
}

function heartSpawnAdds(c, slug, count, now) {
  if (!c || typeof buildOccupancy !== "function") return;
  const base = GAMEDATA.monsters && GAMEDATA.monsters[slug];
  if (!base) return;
  const occ = buildOccupancy(c, null);
  const cx0 = Math.floor((c.gridW || 21) / 2), cy0 = Math.floor((c.gridH || 13) / 2);
  for (let i = 0; i < count; i++) {
    const ent = {};
    if (!placeFree(ent, occ, cx0 + (i % 3) - 1, cy0 + Math.floor(i / 3) - 1, 8)) continue;
    const mob = { slug, def: base, hp: base.hp, maxHp: base.hp, atkCd: 700,
      id: Math.random().toString(36).slice(2, 8), dir: "w", moving: false,
      attackAnim: 0, speed: 0.00005, spawnAt: now };
    c.pendingSpawns = c.pendingSpawns || [];
    c.pendingSpawns.push({ mob, cx: ent.cx, cy: ent.cy, startedAt: now, blink: 0, done: false });
  }
}

function heartBossTick(c, now) {
  if (!c || !c.boss || !c.heartDestruction || HEART_BOSS_IDS.indexOf(c.boss.id) === -1) return;
  const boss = (c.mobs || []).find((m) => m && m.boss);
  if (!boss || boss.hp <= 0) return;
  now = now || Date.now();
  const thresholds = c.boss.id === "anomaly" ? [75, 50, 25, 5]
    : c.boss.id === "outburst" ? [80, 60, 40, 20]
    : c.boss.id === "rupture" ? [80, 60, 40, 25, 10]
    : c.boss.id === "aftershock" ? [80, 60, 40, 20, 10] : [];
  const pct = boss.hp / Math.max(1, boss.maxHp) * 100;
  for (const threshold of thresholds) {
    if (pct <= threshold && !c.heartDestruction.stages[threshold]) {
      c.heartDestruction.stages[threshold] = true;
      heartSpawnAdds(c, "spark-of-destruction", 4, now);
    }
  }
  if (c.boss.id === "world-devourer" && now >= c.heartDestruction.nextWorldAddsAt) {
    c.heartDestruction.nextWorldAddsAt = now + 10000;
    heartSpawnAdds(c, "spark-of-destruction", 4, now);
  }
}
