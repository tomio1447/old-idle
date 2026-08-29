/* braingrounds-venore.js — Brain Grounds - Venore (hunts 250+).
 * Um "piso" de entrada com 3 sub-andares de dificuldade crescente,
 * todos usando o mesmo mapa otherworld-venore.otbm.
 */
"use strict";

(function registerBrainGroundsVenore() {
  if (typeof GAMEDATA === "undefined" || !GAMEDATA.hunts) return;

  const OTBM = "otherworld-venore";
  const FLOOR = 7;
  const BOUNDS = { x: 1011, y: 1019, w: 20, h: 17, z: FLOOR };
  const FOV = { x: 1011, y: 1019, w: 20, h: 17, z: FLOOR };
  const SPAWN = { x: 1020, y: 1034, z: FLOOR };
  const MOB_ZONE = { x: 1014, y: 1022, w: 12, h: 10, z: FLOOR };
  const COMMON = {
    otbm: OTBM,
    otbmFloor: FLOOR,
    otbmBounds: BOUNDS,
    otbmFovBounds: FOV,
    otbmFovWidth: 20,
    otbmFovHeight: 17,
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: SPAWN,
    otbmMobBounds: MOB_ZONE,
    scene: "otherworld",
    color: "#5b4a72",
    cat: "hardcore",
    level: 250,
    minLevel: 250,
    respawn: 0.8,
    avgGold: 100,
    avgDamage: 500,
    avgArmor: 80,
  };

  const floors = [
    {
      id: "braingrounds-venore-f1",
      name: "Brain Grounds - Venore · Floor 1",
      label: "Floor 1 — Tranquilo",
      monsters: ["flimsy-lost-soul", "mean-lost-soul"],
      spawnWeights: { "flimsy-lost-soul": 1, "mean-lost-soul": 1 },
      packMin: 3,
      packMax: 5,
      avgHp: 4500,
      avgExp: 5040,
      avgArmor: 80,
      desc: "Apenas Flimsy e Mean Lost Souls. Ideal para quem está começando na área.",
    },
    {
      id: "braingrounds-venore-f2",
      name: "Brain Grounds - Venore · Floor 2",
      label: "Floor 2 — Equilibrado",
      monsters: ["flimsy-lost-soul", "mean-lost-soul", "freakish-lost-soul"],
      spawnWeights: { "flimsy-lost-soul": 1, "mean-lost-soul": 1, "freakish-lost-soul": 0.4 },
      packMin: 4,
      packMax: 6,
      avgHp: 5200,
      avgExp: 5800,
      avgArmor: 82,
      desc: "Freakish aparece raramente. XP e dano um pouco maiores.",
    },
    {
      id: "braingrounds-venore-f3",
      name: "Brain Grounds - Venore · Floor 3",
      label: "Floor 3 — Intenso",
      monsters: ["flimsy-lost-soul", "mean-lost-soul", "freakish-lost-soul"],
      spawnWeights: { "flimsy-lost-soul": 1, "mean-lost-soul": 1, "freakish-lost-soul": 3 },
      packMin: 6,
      packMax: 9,
      avgHp: 6000,
      avgExp: 6500,
      avgArmor: 85,
      desc: "Freakish Lost Soul predomina. Pack grande e risco elevado.",
    },
  ];

  for (const def of floors) {
    GAMEDATA.hunts[def.id] = Object.assign({}, COMMON, {
      name: def.name,
      monsters: def.monsters,
      spawnWeights: def.spawnWeights,
      packMin: def.packMin,
      packMax: def.packMax,
      pack: Math.round((def.packMin + def.packMax) / 2),
      avgHp: def.avgHp,
      avgExp: def.avgExp,
      avgArmor: def.avgArmor,
    });
  }

  GAMEDATA.hunts["braingrounds-venore"] = {
    name: "Brain Grounds - Venore",
    level: 250,
    minLevel: 250,
    cat: "hardcore",
    color: "#5b4a72",
    scene: "otherworld",
    avgHp: 5200,
    avgExp: 5800,
    avgDamage: 500,
    avgArmor: 80,
    avgGold: 100,
    respawn: 0.8,
    monsters: ["flimsy-lost-soul", "mean-lost-soul", "freakish-lost-soul"],
    floors: floors.map((f) => f.id),
    floorData: floors,
  };

  if (typeof HUNT_MODAL_SECTIONS !== "undefined") {
    const section = HUNT_MODAL_SECTIONS.find((s) =>
      s.title && s.title.indexOf("250+") !== -1
    );
    if (section && section.ids.indexOf("braingrounds-venore") === -1) {
      section.ids.push("braingrounds-venore");
    }
  }
})();
