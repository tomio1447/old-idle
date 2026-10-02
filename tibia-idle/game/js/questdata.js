/*
 * questdata.js — definições de quests do jogo.
 *
 * Cada quest é um objeto com metadados, configuração de lobby, waves,
 * boss final e rewards. Quests futuras bastam adicionar uma entrada aqui.
 */
"use strict";

var QUEST_DEFS = {
  "yalahar-quest": {
    id:           "yalahar-quest",
    name:         "Yalahar Quest",
    level:        80,
    maxPlayers:   30,
    maxPerAccount: 1,
    icon:         "small-treasure-chest",
    description:  "Invada o laboratório de Yalahar e derrote o terrível Azerus para conquistar um equipamento Yalahari único.",
    /* Mapa — sourceBounds: {minX:1010, minY:1015, maxX:1043, maxY:1046}, 34×32 */
    otbm:         "yalaharquest",
    otbmFloor:    8,
    /* FOV / runtime: controla a câmera e o grid do client */
    otbmFovBounds:     { x: 1010, y: 1015, w: 34, h: 32, z: 8 },
    otbmFovWidth:      21,
    otbmFovHeight:     13,
    otbmRuntimeWidth:  34,
    otbmRuntimeHeight: 32,
    otbmSpawn:         { x: 1026, y: 1032, z: 8 },    // centro do mapa (abs)
    /* Coordenadas locais do spawn dos players (abs - mapOrigin)
     * Abs {1022..1029, 1026..1037} → local {12..19, 11..22} */
    spawnRange:   { minX: 13, maxX: 20, minY: 11, maxY: 22, z: 8 },
    spawnBlocked: [[13,14],[14,14],[18,14],[19,14],[13,15],[18,15],[19,15],[16,17],
      [13,18],[19,18],[13,19],[18,19],[19,19],[13,20],[14,20],[18,20],[19,20]],
    /* Contador antes da primeira wave (sobre item 8852 — strange apparatus) */
    countdownSec: 10,
    /* Waves */
    baseWaves:          5,
    wavesPerPlayers:    3,   // +1 wave a cada N jogadores
    baseMonstersPerWave: 8,
    monstersPerPlayers:  4,  // +1 monstro a cada N jogadores
    waveMonsters: [
      "rift-brood",
      "massive-energy-elemental",
      "rift-worm",
      "rift-scythe",
      "war-golem",
    ],
    /* Boss final */
    boss:         "azerus",
    bossSprite:   "azerus",
    /* Rewards (jogador escolhe 1 item) */
    rewards: [
      "yalahari-armor",
      "yalahari-mask",
      "yalahari-leg-piece",
      "yalahari-footwraps",
    ],
    /* Outfit concedida automaticamente ao completar (addon 1+2) */
    outfitReward: { base: "yalaharian", addons: 3 },
    /* Comportamento */
    kickOnDeath:  true,
    oneTimePerChar: true,
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { QUEST_DEFS };
}
