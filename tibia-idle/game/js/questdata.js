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
  /* Annihilator Quest — mecânica exclusiva (server/annihilator.js +
   * annihilator-data.js): 4 personagens da MESMA conta posicionados nos
   * SQMs de preparo, alavanca, 6 Demons, caminhada de saída e 1 recompensa
   * por personagem vivo (máx. 4 por conta). Não usa o fluxo genérico de
   * waves/boss — `playable:false` mantém a entrada visível no modal sem
   * permitir lobby até a mecânica dedicada ser plugada. */
  "annihilator": {
    id:           "annihilator",
    name:         "Annihilator Quest",
    level:        100,
    maxPlayers:   4,
    maxPerAccount: 4,
    playable:     true,
    questType:    "party",
    flow:         "annihilator",
    icon:         "demon-armor",
    description:  "Posicione seus 4 personagens nos SQMs de preparo, acione a alavanca e sobreviva aos 6 Demons. Cada sobrevivente que chegar à saída escolhe 1 recompensa lendária (máx. 4 por conta).",
    otbm:         "annihilator",
    otbmFloor:    7,
    /* FOV / runtime: bounds abs {1007..1045, 1015..1048} = 39x34.
     * Entrance abs {1020..1023, 1026} → local {13..16, 11}. */
    otbmFovBounds:     { x: 1007, y: 1015, w: 39, h: 34, z: 7 },
    otbmFovWidth:      21,
    otbmFovHeight:     13,
    otbmRuntimeWidth:  39,
    otbmRuntimeHeight: 34,
    otbmSpawn:         { x: 1024, y: 1038, z: 7 },
    /* Spawn nos 4 SQMs de preparo (abs 1023..1026,1038 → local 16..19,23) */
    spawnRange:   { minX: 16, maxX: 19, minY: 23, maxY: 23, z: 7 },
    kickOnDeath:  false,
    countdownSec: 10,
    /* Encontro único: 6 Demons (a mecânica de preparo/alavanca/saída do
     * server/annihilator.js é refinada depois — por ora roda como quest
     * padrão de 1 wave com todos os demons). */
    baseWaves:          1,
    wavesPerPlayers:    999,
    baseMonstersPerWave: 6,
    monstersPerPlayers:  999,
    waveMonsters: ["demon"],
    boss:         "demon",
    bossSprite:   "demon",
    rewards:      ["demon-armor", "magic-sword", "stonecutter-axe", "demonbone"],
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { QUEST_DEFS };
}
