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
    // Fov de câmera padrão (segue o líder). A fileira de preparo ficava fora
    // do fov e huntMapBlocked a bloqueava — resolvido por noFovBound via
    // walkFloors (o mapa usa leg.bloc/paredes para colisão, não o fov).
    otbmFovWidth:      21,
    otbmFovHeight:     13,
    otbmRuntimeWidth:  39,
    otbmRuntimeHeight: 34,
    otbmSpawn:         { x: 1024, y: 1038, z: 7 },
    /* Spawn nos 4 SQMs de preparo (abs 1023..1026,1038 → local 16..19,23) */
    spawnRange:   { minX: 16, maxX: 19, minY: 23, maxY: 23, z: 7 },
    kickOnDeath:  false,
    countdownSec: 0,
    // Ids de chão do .otbm marcados como bloqueio no .dat — liberados para o
    // jogador poder andar pela sala (ver questMapBlockedCells).
    walkFloors:   [101, 377, 381, 410, 10145],
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
  /* Hat of The Mad — party quest de waves fixas (fluxo GENÉRICO de
   * questWaves; não usa server/annihilator.js). Sem boss: a quest completa
   * quando a wave 5 é limpa. Recompensa automática por conta viva
   * (fixedRewards + goldReward), 1x por personagem. Level 30 = design call
   * (quest clássica low-level no molde das party quests de legado). */
  "hat-of-the-mad": {
    id:           "hat-of-the-mad",
    name:         "Hat of The Mad",
    level:        30,
    maxPlayers:   4,
    maxPerAccount: 4,
    playable:     true,
    questType:    "party",
    icon:         "hat-of-the-mad",
    description:  "Entre na sala do mago louco e sobreviva às 5 waves de monstros. Recompensa por conta viva: Hat of the Mad + Devil Helmet + 5.000 gold.",
    /* Mapa — sourceBounds: {minX:1010, minY:1014, maxX:1058, maxY:1052}, 49×39 z=7 */
    otbm:         "hat_of_the_mad",
    otbmFloor:    7,
    otbmFovBounds:     { x: 1010, y: 1014, w: 49, h: 39, z: 7 },
    otbmFovWidth:      21,
    otbmFovHeight:     13,
    otbmRuntimeWidth:  49,
    otbmRuntimeHeight: 39,
    otbmSpawn:         { x: 1032, y: 1027, z: 7 },   // centro da sala (abs)
    /* Spawn dos players: 3×3 em volta do playerspawn
     * (abs {1031..1033, 1026..1028} → local {21..23, 12..14}) */
    spawnRange:   { minX: 21, maxX: 23, minY: 12, maxY: 14, z: 7 },
    /* Spawn dos mobs: raio ao redor do centro da sala
     * (abs {1025..1041, 1022..1031} → local {15..31, 8..17}, 165 sqm livres) */
    mobSpawnRange: { minX: 15, maxX: 31, minY: 8, maxY: 17, z: 7 },
    countdownSec: 0,
    /* Waves FIXAS — composições exatas, sem random pool. A engine usa
     * `waves[current-1]` quando o campo existe (uma entrada = 1 monstro). */
    baseWaves:          5,
    wavesPerPlayers:    999,
    baseMonstersPerWave: 8,
    monstersPerPlayers:  999,
    waves: [
      ["orc-spearman","orc-spearman","orc-spearman","orc-spearman","orc-spearman",
       "orc-warrior","orc-warrior","orc-warrior"],
      ["rotworm","rotworm","bonelord","bonelord",
       "minotaur-archer","minotaur-archer","minotaur-archer",
       "minotaur-mage","minotaur-mage","minotaur-mage"],
      ["minotaur","minotaur","minotaur","minotaur",
       "minotaur-guard","minotaur-guard","minotaur-archer","minotaur-archer"],
      ["minotaur-guard","minotaur-guard","minotaur-mage","minotaur-mage",
       "dragon","fire-devil"],
      ["giant-spider","dragon","fire-devil","fire-devil","fire-devil","fire-elemental"],
    ],
    waveMonsters: [
      "orc-spearman", "orc-warrior", "rotworm", "bonelord",
      "minotaur-archer", "minotaur-mage", "minotaur", "minotaur-guard",
      "dragon", "fire-devil", "giant-spider", "fire-elemental",
    ],
    /* Sem boss — completa ao limpar a wave 5 */
    boss:         null,
    /* Recompensa automática por conta viva (sem modal de escolha):
     * itens no Reward Chest + gold direto no saldo da conta. */
    fixedRewards: ["hat-of-the-mad", "devil-helmet"],
    goldReward:   5000,
    rewards:      ["hat-of-the-mad", "devil-helmet"],
    rewardDescription: "1× Hat of the Mad + 1× Devil Helmet (Reward Chest) + 5.000 gold — por conta viva, uma vez por personagem.",
    kickOnDeath:  false,
    oneTimePerChar: true,
  },
};

Object.assign(QUEST_DEFS, {
  "soulwar-quest": {
    id: "soulwar-quest", name: "Soulwar Quest", level: 400, questType: "boss", playable: false,
    boss: "goshnar-s-megalomania", bossSprite: "goshnar-s-malice",
    description: "Derrote os cinco bosses de acesso e, por último, Goshnar’s Megalomania. Progresso por personagem.",
    objectives: ["goshnar-s-malice", "goshnar-s-spite", "goshnar-s-greed", "goshnar-s-hatred", "goshnar-s-cruelty", "goshnar-s-megalomania"],
    rewards: ["bag-you-desire"], rewardDescription: "1× Bag You Desire — uma vez por personagem."
  },
  "primal-ordeal": {
    id: "primal-ordeal", name: "Primal Ordeal", level: 400, questType: "boss", playable: false,
    boss: "the-primal-menace", bossSprite: "the-primal-menace",
    description: "Acompanhe o hazard da conta e os marcos da Primal Ordeal. Selecionar um hazard menor não reduz o progresso.",
    rewards: ["primal-bag"], mountRewards: ["noxious-ripptor"],
    rewardDescription: "Hazard 6: montaria Noxious Ripptor (resgate aqui). Hazard 12: 4× Primal Bag. Marcos por conta."
  },
  "bloodrotten-quest": {
    id: "bloodrotten-quest", name: "The Blood Rotten Quest", level: 600, questType: "boss", playable: false,
    boss: "bakragore", bossSprite: "bakragore",
    description: "Derrote Murcion (Jaded Roots), Vemiath (Darklight Core), Chagorz (Gloom Pillars), Ichgahal (Putrefactory) e, por último, Bakragore — acessado pelo lobby de World Boss (até 5 jogadores). Progresso por personagem.",
    objectives: ["murcion", "vemiath", "chagorz", "ichgahal", "bakragore"],
    rewards: ["figurine-of-bakragore", "bag-you-covet"],
    rewardDescription: "1× Figurine of Bakragore + 1× Bag You Covet — uma vez por personagem."
  }
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { QUEST_DEFS };
}
