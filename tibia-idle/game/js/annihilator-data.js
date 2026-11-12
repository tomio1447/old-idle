"use strict";

const ANNIHILATOR = {
  id: "annihilator", name: "Annihilator Quest", level: 100, members: 4, accountRewardLimit: 4,
  otbm: "annihilator", otbmFloor: 7,
  bounds: { x: 1007, y: 1015, w: 39, h: 34, z: 7 },
  preparation: [1023, 1024, 1025, 1026].map((x) => ({ x, y: 1038, z: 7 })),
  lever: { x: 1027, y: 1038, z: 7 },
  entrance: [1020, 1021, 1022, 1023].map((x) => ({ x, y: 1026, z: 7 })),
  demons: [[1020, 1024], [1022, 1024], [1021, 1028], [1023, 1028], [1024, 1026], [1025, 1026]]
    .map(([x, y]) => ({ x, y, z: 7 })),
  exit: [1029, 1030, 1031, 1032].map((x) => ({ x, y: 1026, z: 7 })),
  rewards: ["demon-armor", "magic-sword", "stonecutter-axe", "demonbone"],
  teleport: { x: 1037, y: 1022, z: 7 },
  rewardTrigger: { x: 1027, y: 1026, z: 7 },
  chests: ["demon-armor", "magic-sword", "stonecutter-axe", "demonbone"]
    .map((reward, i) => ({ reward, x: 1028 + i * 2, y: 1023, z: 7 })),
  prepareMap(map) {
    if (!map || Number(map.z) !== 7) return map;
    const b = map.sourceBounds || {}, ox = Number(b.minX ?? b.x), oy = Number(b.minY ?? b.y);
    for (const chest of this.chests) {
      const cell = map.cells[(chest.x - ox) + "," + (chest.y - oy)];
      if (cell && cell.items.includes(2472)) cell.items = cell.items.filter((id) => id === 2472);
    }
    return map;
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = ANNIHILATOR;
