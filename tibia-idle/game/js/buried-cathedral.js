/* buried-cathedral.js — HUNT BURIED CATHEDRAL (categoria 250+).
 *
 * Hunt nova do Roshamuul abaixo do Haunted Nexus (The Dream Courts Quest):
 * 4 criaturas diretas do Canary — Ripper Spectre, Gazer Spectre, Burster
 * Spectre e Arachnophobica (mesmos looktypes do Canary: os três spectres
 * compartilham o looktype 1122 com cores de outfit distintas
 * lookHead/lookBody/lookLegs/lookFeet; Arachnophobica usa looktype 1135).
 *
 * Este patch:
 *   (1) garante no catálogo os 10 itens de loot que faltavam (3 ectoplasms,
 *       golden idol of Tukh — itens de quest sem comprador NPC, sell 0 —
 *       e os demais com os valores oficiais de venda a NPC da TibiaWiki);
 *   (2) registra a hunt técnica do piso z=7 (game/maps/buried_cathedral.otbm,
 *       publicada a partir de beta-maps/);
 *   (3) registra a missão: eliminar 250 criaturas (70+60+60+60) para liberar
 *       o acesso ao boss Faceless Bane (completeReward.bossAccess).
 *
 * Coordenadas absolutas do RME: centermap {1071,1002,7},
 * playerspawn {1070,1006,7}, spawnradius {1066,997,7}..{1075,1006,7}.
 *
 * O arquivo também roda no sandbox vm do servidor (authoritative_engine):
 * lá só a parte de itens/hunt executa (MISSION_DEFS não existe no vm), o que
 * põe os itens do loot no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* Geometria do mapa (coordenadas absolutas do RME). */
const BURIED_CATHEDRAL = {
  otbm: "buried_cathedral",
  name: "Buried Cathedral",
  center: { x: 1071, y: 1002, z: 7 },   // centermap
  spawn: { x: 1070, y: 1006, z: 7 },    // playerspawn
  mob: { x: 1066, y: 997, w: 10, h: 10, z: 7 }, // spawnradius
};

/* Itens de loot do Canary que faltavam no catálogo. Pesos e valores de
 * venda oficiais (TibiaWiki): os 3 ectoplasms e o golden idol of Tukh são
 * itens de quest (10 min de duração, sem NPC comprador) → sell 0 e o
 * Sell All / autoseller pulam, padrão do jogo. */
const BURIED_LOOT_ITEMS = {
  "green-ectoplasm":           { n: "green ectoplasm", s: null, t: "loot", cid: 30083, w: 1.00, sell: 0, npcSell: 0 },
  "red-ectoplasm":             { n: "red ectoplasm", s: null, t: "loot", cid: 30084, w: 1.00, sell: 0, npcSell: 0 },
  "blue-ectoplasm":            { n: "blue ectoplasm", s: null, t: "loot", cid: 30082, w: 1.00, sell: 0, npcSell: 0 },
  "golden-idol-of-tukh":       { n: "golden idol of Tukh", s: null, t: "loot", cid: 29299, w: 20.00, sell: 0, npcSell: 0 },
  "brown-crystal-splinter":    { n: "brown crystal splinter", s: null, t: "loot", cid: 16123, w: 0.10, sell: 400, npcSell: 400 },
  "coral-brooch":              { n: "coral brooch", s: null, t: "loot", cid: 24391, w: 0.80, sell: 750, npcSell: 750 },
  "hexagonal-ruby":            { n: "hexagonal ruby", s: null, t: "loot", cid: 30180, w: 1.25, sell: 30000, npcSell: 30000 },
  "prismatic-quartz":          { n: "prismatic quartz", s: null, t: "loot", cid: 24962, w: 1.20, sell: 450, npcSell: 450 },
  "small-enchanted-emerald":   { n: "small enchanted emerald", s: null, t: "loot", cid: 677, w: 0.10, sell: 250, npcSell: 250 },
  "essence-of-a-bad-dream":    { n: "essence of a bad dream", s: null, t: "loot", cid: null, w: 0.95, sell: 360, npcSell: 360 },
};

/* Médias das 4 criaturas (Canary: hp/exp/dano/armor). */
const BURIED_AVG = { hp: 4950, exp: 4600, damage: 393, armor: 69, gold: 120 };

(function registerBuriedCathedral() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in BURIED_LOOT_ITEMS) {
    const def = BURIED_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      items[slug].sell = def.sell;
      items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["buried-cathedral"] = {
    name: BURIED_CATHEDRAL.name,
    level: 250,
    minLevel: 250,
    cat: "hard",
    pack: 10,
    packMin: 6,
    packMax: 10,
    monsters: ["ripper-spectre", "gazer-spectre", "burster-spectre", "arachnophobica"],
    color: "#4a3f66",
    scene: "crypt",
    otbm: BURIED_CATHEDRAL.otbm,
    otbmFloor: 7,
    otbmFovBounds: { x: 1062, y: 993, w: 20, h: 20, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: BURIED_CATHEDRAL.spawn,
    otbmMobBounds: BURIED_CATHEDRAL.mob,
    avgHp: BURIED_AVG.hp,
    avgExp: BURIED_AVG.exp,
    avgDamage: BURIED_AVG.damage,
    avgArmor: BURIED_AVG.armor,
    avgGold: BURIED_AVG.gold,
    respawn: 1,
  };

  /* Missão: eliminar 250 criaturas (70+60+60+60) → libera o acesso ao boss
   * Faceless Bane (o def do boss vem depois; o gate de acesso usa o mesmo
   * padrão dos Goshnar: BOSS_DEFS.entry = {mission, access}). */
  if (typeof MISSION_DEFS !== "undefined") {
    MISSION_DEFS["buried-cathedral"] = {
      title: "Missão: Buried Cathedral",
      tasks: [
        { monster: "ripper-spectre", target: 70,
          reward: { supplies: [{ slug: "ultimate-health-potion", count: 3 }] } },
        { monster: "gazer-spectre", target: 60,
          reward: { supplies: [{ slug: "ultimate-mana-potion", count: 3 }] } },
        { monster: "burster-spectre", target: 60,
          reward: { supplies: [{ slug: "ultimate-spirit-potion", count: 3 }] } },
        { monster: "arachnophobica", target: 60,
          reward: { supplies: [{ slug: "ultimate-health-potion", count: 3 }] } },
      ],
      completeReward: { bossAccess: "faceless-bane", bossName: "Faceless Bane" },
    };
  }
})();
