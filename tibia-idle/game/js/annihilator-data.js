"use strict";

const ANNIHILATOR = {
  id: "annihilator", name: "Annihilator Quest", level: 100, members: 4, accountRewardLimit: 4,
  otbm: "annihilator", otbmFloor: 7,
  bounds: { x: 1007, y: 1015, w: 39, h: 34, z: 7 },
  preparation: [1023, 1024, 1025, 1026].map((x) => ({ x, y: 1038, z: 7 })),
  lever: { x: 1027, y: 1038, z: 7 },
  entrance: [1020, 1021, 1022, 1023].map((x) => ({ x, y: 1026, z: 7 })),
  demons: [[1024, 1026], [1025, 1026], [1023, 1028], [1021, 1028], [1020, 1024], [1022, 1024]]
    .map(([x, y]) => ({ x, y, z: 7 })),
  exit: [1029, 1030, 1031, 1032].map((x) => ({ x, y: 1026, z: 7 })),
  rewards: ["demon-armor", "magic-sword", "stonecutter-axe", "demonbone"],
};

if (typeof module !== "undefined" && module.exports) module.exports = ANNIHILATOR;
