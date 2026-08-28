/* ratmiral-boss.js — Ratmiral Blackwhiskers (nível 250+).
 * Sala: game/maps/ratmiralroom.otbm.
 * Mecânica: a cada ~12s spawna até 4 Elite Pirat e 1 Mister Catkiller.
 */
"use strict";

const RATMIRAL_ID = "ratmiral-blackwhiskers";
const RATMIRAL_ROOM = {
  otbm: "ratmiralroom",
  name: "Ratmiral's Room",
  center: { x: 1030, y: 1021, z: 7 },
  spawn: { x: 1030, y: 1025, z: 7 },
  boss: { x: 1026, y: 1018, z: 7 },
};

(function registerRatmiral() {
  if (typeof GAMEDATA === "undefined") return;

  if (typeof MOBSHEETS !== "undefined" && !MOBSHEETS["mister-catkiller"]) {
    const base = MOBSHEETS["pirat-cutthroat"] || { cw: 37, ch: 37, cols: 9, rows: 4 };
    MOBSHEETS["mister-catkiller"] = Object.assign({}, base);
  }

  if (!GAMEDATA.monsters) GAMEDATA.monsters = {};
  if (!GAMEDATA.monsters["mister-catkiller"]) {
    const base = GAMEDATA.monsters["pirat-cutthroat"] || {};
    GAMEDATA.monsters["mister-catkiller"] = Object.assign({}, base, {
      name: "Mister Catkiller",
      hp: 12000,
      exp: 6000,
      damage: 1200,
      armor: 75,
      defense: 70,
      looktype: 0,
    });
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["ratmiral-room"] = {
    name: "Ratmiral's Room",
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: [RATMIRAL_ID],
    color: "#3a4a6a",
    scene: "palace",
    otbm: RATMIRAL_ROOM.otbm,
    otbmFloor: 7,
    otbmBounds: { x: 1018, y: 1016, w: 21, h: 13, z: 7 },
    otbmSpawn: RATMIRAL_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, RATMIRAL_ROOM.boss),
    avgHp: 100000,
    avgExp: 50000,
    avgDamage: 3000,
    avgArmor: 80,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;
  BOSS_DEFS[RATMIRAL_ID] = {
    id: RATMIRAL_ID,
    name: "Ratmiral Blackwhiskers",
    title: "Pirat Admiral",
    hunt: "ratmiral-room",
    sprite: RATMIRAL_ID,
    hp: 100000,
    exp: 50000,
    damage: 3000,
    armor: 80,
    defense: 80,
    speed: 0.000055,
    loot: [],
    requirement: { level: 250, text: "Requer nível 250+ (A Pirate's Tail)" },
    cooldown: 16 * 60 * 60 * 1000,
  };
})();

function ratmiralBossInit(c, player) {
  if (!c || c.ratmiral) return;
  c.ratmiral = {
    nextAddAt: Date.now() + 8000,
    interval: 12000,
    eliteCap: 4,
    catkillerCap: 1,
  };
}

function ratmiralBossTick(c, now) {
  if (!c || !c.boss || c.boss.id !== RATMIRAL_ID || !c.ratmiral) return;
  now = now || Date.now();
  if (now < c.ratmiral.nextAddAt) return;

  const counts = {};
  for (const m of c.mobs || []) {
    if (m && !m.boss && m.slug) counts[m.slug] = (counts[m.slug] || 0) + 1;
  }

  const toSpawn = [];
  const elite = counts["elite-pirat"] || 0;
  const catkiller = counts["mister-catkiller"] || 0;
  for (let i = elite; i < c.ratmiral.eliteCap; i++) toSpawn.push("elite-pirat");
  for (let i = catkiller; i < c.ratmiral.catkillerCap; i++) toSpawn.push("mister-catkiller");

  if (toSpawn.length && typeof buildOccupancy === "function") {
    const occ = buildOccupancy(c, null);
    const cx0 = Math.floor((c.gridW || (typeof GRID_W !== "undefined" ? GRID_W : 21)) / 2);
    const cy0 = Math.floor((c.gridH || (typeof GRID_H !== "undefined" ? GRID_H : 13)) / 2);
    for (const slug of toSpawn) {
      const base = GAMEDATA.monsters[slug];
      if (!base) continue;
      const m = Object.assign({}, base);
      const mob = {
        slug: slug,
        def: m,
        hp: m.hp,
        maxHp: m.hp,
        atkCd: 700 + Math.random() * 400,
        id: Math.random().toString(36).slice(2, 8),
        dir: "w",
        moving: false,
        attackAnim: 0,
        speed: 0.000045 + Math.random() * 0.00002,
        spawnAt: now,
      };
      const ent = {};
      const dx = Math.floor(Math.random() * 6) - 3;
      const dy = Math.floor(Math.random() * 4) - 2;
      if (placeFree(ent, occ, cx0 + dx, cy0 + dy, 8)) {
        c.pendingSpawns = c.pendingSpawns || [];
        c.pendingSpawns.push({
          mob: mob,
          cx: ent.cx,
          cy: ent.cy,
          startedAt: now,
          blink: 0,
          done: false,
        });
      }
    }
  }
  c.ratmiral.nextAddAt = now + c.ratmiral.interval;
}
