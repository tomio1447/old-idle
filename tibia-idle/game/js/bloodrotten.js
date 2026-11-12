"use strict";

(function () {
  const data = {
    bosses: ["murcion", "vemiath", "chagorz", "ichgahal", "bakragore"],
    /* Bakragore's Burden: taints conquistadas ao derrotar os bosses filhos.
     * Cada membro do lobby pode contribuir com as taints que possui
     * (kill registrada no boss correspondente); a soma vira o burden da
     * luta — +1 Elder Bloodjaw por taint (máx. 8 slots) e +5% de HP. */
    burden: {
      maxPerMember: 4,
      bosses: [
        { slug: "murcion", name: "Murcion", taint: "Taint of the Jaded Roots" },
        { slug: "vemiath", name: "Vemiath", taint: "Taint of the Darklight Core" },
        { slug: "chagorz", name: "Chagorz", taint: "Taint of the Gloom Pillars" },
        { slug: "ichgahal", name: "Ichgahal", taint: "Taint of the Putrefactory" },
      ],
    },
    respawnMs: 15000,
    bagDrop: { item: "bag-you-covet", chance: 10, max: 1 },
    explosion: { min: 1100, max: 1380, radius: 3, interval: 9000, warning: 2000 },
    rooms: {
      vemiath: {
        summon: "elder-bloodjaw",
        center: { x: 1024, y: 1029, z: 7 },
        boss: { x: 1024, y: 1023, z: 7 },
        player: { x: 1024, y: 1034, z: 7 },
        area: { x: 1019, y: 1022, w: 12, h: 14, z: 7 },
        bounds: { x: 1009, y: 1015, w: 31, h: 27, z: 7 },
      },
      chagorz: {
        summon: "echo-of-chagorz",
        center: { x: 1022, y: 1027, z: 7 },
        boss: { x: 1022, y: 1021, z: 7 },
        player: { x: 1022, y: 1032, z: 7 },
        area: { x: 1017, y: 1020, w: 12, h: 14, z: 7 },
        bounds: { x: 1010, y: 1015, w: 25, h: 23, z: 7 },
      },
      murcion: {
        summon: "echo-of-murcion",
        center: { x: 1023, y: 1027, z: 7 },
        boss: { x: 1023, y: 1022, z: 7 },
        player: { x: 1023, y: 1031, z: 7 },
        area: { x: 1018, y: 1021, w: 12, h: 14, z: 7 },
        bounds: { x: 1011, y: 1017, w: 25, h: 22, z: 7 },
      },
      ichgahal: {
        summon: "echo-of-ichgahal",
        center: { x: 1024, y: 1027, z: 7 },
        boss: { x: 1024, y: 1024, z: 7 },
        player: { x: 1024, y: 1031, z: 7 },
        area: { x: 1019, y: 1021, w: 12, h: 14, z: 7 },
        bounds: { x: 1010, y: 1017, w: 27, h: 22, z: 7 },
      },
      /* Bakragore — World Boss via lobby (até 5 jogadores). Sem pilares:
       * o Bakragore's Burden soma as taints contribuídas pelo lobby e
       * transforma cada taint em +1 slot de Elder Bloodjaw (2 base, máx. 8)
       * e +5% de HP do boss. Coordenadas absolutas do .otbm — no combate o
       * tick traduz via delta boss↔room.boss para o grid local. */
      bakragore: {
        summon: "elder-bloodjaw",
        taints: true, baseSummons: 2, maxSummons: 8, hpPerTaint: 0.05,
        center: { x: 1020, y: 1026, z: 7 },
        boss: { x: 1020, y: 1021, z: 7 },
        player: { x: 1020, y: 1031, z: 7 },
        area: { x: 1013, y: 1018, w: 15, h: 17, z: 7 },
        bounds: { x: 1009, y: 1016, w: 23, h: 24, z: 7 },
      },
    },
    pillar: {
      name: "Pillar of Dark Energy", hp: 37500, exp: 0, speed: 0,
      damage: 0, armor: 104, defense: 60, mitigation: 3.16,
      resist: { physical: -30, energy: 25, earth: -40, fire: -25, ice: 10, holy: 10, death: 0 },
      imune: ["paralyze", "invisible"], skills: [], loot: [], pushable: false,
      attackSpeed: 2000, targetDistance: 1, lookTypeEx: 43588, noAttack: true,
    },
    items: {
      "crystal-coin": [3043, 0.1], "ultimate-mana-potion": [23373, 3.1], "giant-emerald": [30060, 1.5],
      "supreme-health-potion": [23375, 3.5], "yellow-gem": [3037, 0.3], "berserk-potion": [7439, 2],
      "blue-gem": [3041, 0.3], "green-gem": [3038, 0.3], "bullseye-potion": [7443, 2],
      "mastermind-potion": [7440, 2.9], "ultimate-spirit-potion": [23374, 3.1], "giant-topaz": [32623, 1.7],
      "giant-amethyst": [32622, 1.7], "gold-ingot": [9058, 18], "red-gem": [3039, 0.3],
      "dragon-figurine": [30053, 6.5], "raw-watermelon-tourmaline": [33778, 1.5],
      "vemiath-s-infused-basalt": [43967, 2], "violet-gem": [3036, 0.3], "bag-you-covet": [43895, 0.2],
      "giant-sapphire": [30061, 1.5], "white-gem": [32769, 0.3],
      "amber-with-a-bug": [32624, 1], "amber-with-a-dragonfly": [32625, 1],
      "putrefactive-figurine": [43962, 0.5], "ichgahal-s-fungal-infestation": [43964, 2.5],
      "giant-ruby": [30059, 1.7], "figurine-of-bakragore": [43963, 0.5],
      "bakragore-s-amalgamation": [43968, 0.3], "spiritual-horseshoe": [44048, 0.8],
    },
    prices: {
      "crystal-coin": 10000, "ultimate-mana-potion": 0, "giant-emerald": 90000,
      "supreme-health-potion": 0, "yellow-gem": 1000, "berserk-potion": 500,
      "blue-gem": 5000, "green-gem": 5000, "bullseye-potion": 500,
      "mastermind-potion": 500, "ultimate-spirit-potion": 0, "giant-topaz": 80000,
      "giant-amethyst": 60000, "gold-ingot": 5000, "red-gem": 1000,
      "dragon-figurine": 45000, "raw-watermelon-tourmaline": 0,
      "vemiath-s-infused-basalt": 1000000, "violet-gem": 10000, "bag-you-covet": 0,
      "giant-sapphire": 50000, "white-gem": 12000,
      "amber-with-a-bug": 41000, "amber-with-a-dragonfly": 56000,
      "putrefactive-figurine": 3200000, "ichgahal-s-fungal-infestation": 900000,
      "giant-ruby": 70000, "figurine-of-bakragore": 5400000,
      "bakragore-s-amalgamation": 2000000,
      /* Spiritual Horseshoe: sem comprador NPC oficial — igual Bag You
       * Covet, mantém sell/npcSell em 0 (não inventa preço). */
      "spiritual-horseshoe": 0,
    },
    names: {
      "figurine-of-bakragore": "Figurine of Bakragore",
      "bakragore-s-amalgamation": "Bakragore's Amalgamation",
      "spiritual-horseshoe": "Spiritual Horseshoe",
      "giant-ruby": "Giant Ruby",
    },
  };
  data.room = data.rooms.vemiath;
  data.registerBagLoot = function (monsters) {
    for (const slug of data.bosses) if (monsters[slug]) {
      const monster = monsters[slug];
      monster.loot = (monster.loot || []).filter((entry) => entry.item !== data.bagDrop.item)
        .concat(Object.assign({}, data.bagDrop));
    }
  };
  data.accessError = function (bossId, level) {
    return data.bosses.includes(bossId) && (Number(level) || 0) < 600 ? "Requer nível 600+ para enfrentar os bosses da Bloodrotten." : null;
  };
  data.cells = function (st, mob) {
    const cells = [], r = data.explosion.radius, b = st.bounds;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const cx = mob.cx + dx, cy = mob.cy + dy;
      if (dx * dx + dy * dy <= r * r && cx >= b.x && cy >= b.y && cx < b.x + b.w && cy < b.y + b.h)
        cells.push({ cx, cy });
    }
    return cells;
  };
  data.freeCell = function (c, st, desired, blocked) {
    const occupied = new Set();
    for (const p of c.players || []) if (p.p?.hp > 0) occupied.add(p.cx + ":" + p.cy);
    for (const m of c.mobs || []) if (m.hp > 0) occupied.add(m.cx + ":" + m.cy);
    for (const p of c.pendingSpawns || []) occupied.add(p.cx + ":" + p.cy);
    const b = st.bounds, candidates = [];
    for (let cy = b.y; cy < b.y + b.h; cy++) for (let cx = b.x; cx < b.x + b.w; cx++) {
      if (!occupied.has(cx + ":" + cy) && !blocked(cx, cy))
        candidates.push({ cx, cy, distance: Math.abs(cx - desired.cx) + Math.abs(cy - desired.cy) });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.cy - b.cy || a.cx - b.cx);
    return candidates[0] || null;
  };
  data.tick = function (c, now, hooks) {
    const id = c.bossId || c.boss?.id;
    if (!data.bosses.includes(id)) return;
    const boss = !c.ended && !c.dead && !c.bossDefeated && (c.mobs || []).find((m) => m.boss && m.hp > 0);
    if (!boss) {
      if (c.bloodrotten) {
        c.mobs = (c.mobs || []).filter((m) => !m.bloodrottenSummon);
        c.pendingSpawns = (c.pendingSpawns || []).filter((p) => !p.mob?.bloodrottenSummon);
        c.bloodrotten = null;
      }
      return;
    }
    if (!c.bloodrotten) {
      const room = data.rooms[id];
      if (!room) return;
      const ox = boss.cx - room.boss.x, oy = boss.cy - room.boss.y;
      const cells = [[-1, 2], [1, 2], [-2, 3], [2, 3], [-4, 1], [5, 1], [-4, 9], [5, 9]];
      /* Bakragore's Burden: cada taint contribuída no lobby vira +1 slot de
       * summon (sem pilares) e +hpPerTaint de HP máximo do boss. */
      const taints = room.taints ? Math.max(0, Math.floor(Number(c.bakragoreBurden) || 0)) : 0;
      const summonCount = room.taints
        ? Math.min((room.baseSummons || 2) + taints, room.maxSummons || 8) : 4;
      const pillarCount = room.taints ? 0 : 4;
      c.bloodrotten = { bounds: { x: room.area.x + ox, y: room.area.y + oy, w: room.area.w, h: room.area.h },
        taints,
        slots: cells.slice(0, summonCount + pillarCount).map((d, i) => ({
          slug: i < summonCount ? room.summon : "pillar-of-dark-energy",
          id: null, dueAt: now, desired: { cx: boss.cx + d[0], cy: boss.cy + d[1] } })) };
      if (room.taints && taints > 0 && Number.isFinite(Number(boss.maxHp))) {
        boss.maxHp = Math.max(1, Math.floor(boss.maxHp * (1 + (room.hpPerTaint || 0.05) * taints)));
        boss.hp = boss.maxHp;
      }
    }
    const st = c.bloodrotten;
    for (const slot of st.slots) {
      let mob = (c.mobs || []).find((m) => String(m.id) === slot.id && m.hp > 0);
      const pending = (c.pendingSpawns || []).some((p) => String(p.mob?.id) === slot.id);
      if (slot.id && !mob && !pending) { slot.id = null; slot.dueAt = now + data.respawnMs; }
      if (!slot.id && now >= slot.dueAt) {
        const cell = data.freeCell(c, st, slot.desired, hooks.blocked);
        if (cell) {
          mob = hooks.spawn(slot.slug, cell, now);
          if (mob) {
            mob.bloodrottenSummon = true; mob.summoned = true; mob.exp = 0;
            mob.def = Object.assign({}, mob.def, { exp: 0, loot: [] });
            if (slot.slug === "pillar-of-dark-energy") {
              mob.cx = cell.cx; mob.cy = cell.cy; mob.fixedSpawn = true; mob.noMove = true; mob.speed = 0;
              mob.allowBlockedSpawn = true; mob.fixedSpawnCx = cell.cx; mob.fixedSpawnCy = cell.cy;
            }
            slot.id = String(mob.id); slot.explodeAt = now + data.explosion.interval; slot.warned = false;
          }
        }
      }
      if (!mob || mob.hp <= 0 || slot.slug !== "pillar-of-dark-energy") continue;
      if (!slot.warned && now >= slot.explodeAt - data.explosion.warning) {
        slot.warned = true; slot.explodeAt = Math.max(slot.explodeAt, now + data.explosion.warning);
        hooks.warn(mob, data.cells(st, mob), data.explosion.warning, now);
      }
      if (now >= slot.explodeAt) {
        const damage = data.explosion.min + Math.floor((hooks.random || Math.random)() * (data.explosion.max - data.explosion.min + 1));
        hooks.explode(mob, data.cells(st, mob), damage, now);
        slot.explodeAt = now + data.explosion.interval; slot.warned = false;
      }
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  if (typeof window === "undefined") return;
  window.BLOODROTTEN = data;
  if (typeof GAMEDATA !== "undefined") {
    GAMEDATA.monsters = GAMEDATA.monsters || {};
    const summons = [...new Set(Object.keys(data.rooms).map((key) => data.rooms[key].summon))];
    for (const slug of data.bosses.concat(summons)) if (!GAMEDATA.monsters[slug] && typeof MONSTERDATA !== "undefined")
      GAMEDATA.monsters[slug] = MONSTERDATA[slug];
    data.registerBagLoot(GAMEDATA.monsters);
    GAMEDATA.monsters["pillar-of-dark-energy"] = data.pillar;
    GAMEDATA.items["vemiath-s-infused-basalt"] = Object.assign({}, GAMEDATA.items["vemiath-s-infused-basalt"], {
      n: "Vemiath's Infused Basalt", cid: 43967, w: 2, s: null, t: "loot" });
    for (const slug in data.items) {
      GAMEDATA.items[slug] = Object.assign({ n: slug.replace(/-/g, " "), cid: data.items[slug][0], w: data.items[slug][1],
        s: null, t: "loot" }, GAMEDATA.items[slug], { sell: data.prices[slug], npcSell: data.prices[slug] });
    }
    for (const slug in data.names) if (GAMEDATA.items[slug]) GAMEDATA.items[slug].n = data.names[slug];
    Object.assign(GAMEDATA.items["bag-you-covet"], { n: "Bag You Covet", s: "container", t: "container" });
    for (const bossId of Object.keys(data.rooms)) {
      const room = data.rooms[bossId], meta = {
        vemiath: { huntId: "vemiath-room", otbm: "vemiath_room", w: 31, h: 30,
          name: "Vemiath — Darklight Core", title: "Darklight Core — Bloodrotten",
          description: "Derrote Vemiath. Até 4 Elder Bloodjaws e 4 Pillars of Dark Energy; reposição após 15s. Pilares explodem em Energy com aviso de 2s." },
        chagorz: { huntId: "chagorz-room", otbm: "chagorz_room", w: 25, h: 23,
          name: "Chagorz — Gloom Pillars", title: "Gloom Pillars — Bloodrotten",
          description: "Derrote Chagorz. Até 4 Echoes of Chagorz e 4 Pillars of Dark Energy; reposição após 15s. Pilares explodem em Energy com aviso de 2s." },
        murcion: { huntId: "murcion-room", otbm: "murcion_room", w: 25, h: 22,
          name: "Murcion — Jaded Roots", title: "Jaded Roots — Bloodrotten",
          description: "Derrote Murcion. Até 4 Echoes of Murcion e 4 Pillars of Dark Energy; reposição após 15s. Pilares explodem em Energy com aviso de 2s." },
        ichgahal: { huntId: "ichgahal-room", otbm: "ichgahal_room", w: 27, h: 22,
          name: "Ichgahal — Putrefactory", title: "Putrefactory — Bloodrotten",
          description: "Derrote Ichgahal. Até 4 Echoes of Ichgahal e 4 Pillars of Dark Energy; reposição após 15s. Pilares explodem em Energy com aviso de 2s." },
        /* Bakragore só entra via lobby de World Boss (world-bosses-modal +
         * WARZONES no servidor). A sala OTBM é registrada aqui para o
         * cliente carregar o mapa real no combate compartilhado; o
         * BOSS_DEFS.bakragore (worldBoss:true) fica em game.js. */
        bakragore: { huntId: "bakragore-room", otbm: "bakragore_room", w: 24, h: 24, worldBoss: true,
          name: "Bakragore — Rotten Blood" },
      }[bossId];
      if (!meta) continue;
      GAMEDATA.hunts[meta.huntId] = {
        name: meta.name, hidden: true, cat: meta.worldBoss ? "boss" : "boss-room", level: 600, minLevel: 600,
        scene: meta.worldBoss ? "cave" : "soulwar", color: meta.worldBoss ? "#5b2338" : "#604479",
        pack: 1, respawn: 0, monsters: [bossId],
        otbm: meta.otbm, otbmFloor: 7, otbmFovBounds: room.bounds,
        otbmFovWidth: 21, otbmFovHeight: 15, otbmRuntimeWidth: meta.w, otbmRuntimeHeight: meta.h, noFovBound: true,
        otbmSpawn: room.player, otbmMobBounds: { ...room.boss, w: 1, h: 1 },
        bloodrotten: true, worldBoss: !!meta.worldBoss, centerroom: room.center, bossarea: room.area,
      };
      if (meta.worldBoss) continue;
      window.BOSS_DEFS = window.BOSS_DEFS || {};
      window.BOSS_DEFS[bossId] = {
        id: bossId, name: bossId[0].toUpperCase() + bossId.slice(1), title: meta.title, hunt: meta.huntId,
        sprite: bossId, baseMonster: bossId, mult: 1, hp: 350000, exp: 3250000,
        requirement: { level: 600, text: "Requer nível 600+ (BLOODROTTEN 600+)" },
        description: meta.description,
      };
    }
  }
  window.bloodrottenBossTick = function (c, now) {
    data.tick(c, now, {
      blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= c.gridW || cy >= c.gridH ||
        (typeof isWalkableCell === "function" && !isWalkableCell(cx, cy)),
      spawn: (slug, cell) => spawnMobAt(c, slug, cell.cx, cell.cy, { bossHelper: true, now }),
      warn: (mob, cells, duration) => c.events.push({ t: "areafx", cells, fx: "magic-blue", duration, screen: true }),
      explode: (mob, cells, damage) => {
        c.events.push({ t: "areafx", cells, fx: "energy-area", screen: true });
        const targets = new Set(cells.map((p) => p.cx + ":" + p.cy));
        const previous = mob.target;
        for (const ent of c.players || []) if (ent.p?.hp > 0 && targets.has(ent.cx + ":" + ent.cy)) {
          mob.target = ent; mobSkillHit(c, ent.p, mob, { el: "energy", fx: "energy-area" }, damage);
        }
        mob.target = previous;
      },
    });
  };
})();
