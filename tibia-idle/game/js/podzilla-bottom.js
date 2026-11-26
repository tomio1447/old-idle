/* podzilla-bottom.js — HUNT Podzilla Bottom (nível 400+).
 * Mapa: game/maps/podzilla_bottom.otbm (48×50, z=7 — único piso; bounds
 * 1012,1016–1059,1065). Componente caminhável principal de 312 sqm.
 * Criaturas: Quara Looter, Quara Plunderer e Quara Raider (8 a 12 por
 * onda) — stats, skills, resistências e loot vêm de canarymonsters.json /
 * MONSTERDATA (o dump prevalece sobre o wiki).
 * Coordenadas RME:
 *   playerspawn   {1031,1038,7} — centróide caminhável do respawnradius
 *   respawnradius {1022,1032,7} → {1040,1043,7} (19×12 = 228 sqm; 197
 *                 caminháveis, todas conectadas — as células bloqueadas
 *                 dentro do retângulo são ignoradas pelo seletor, mesmo
 *                 padrão do dark-thais)
 *
 * Tabela de loot: dump Canary (canarymonsters.json). A wiki lista drops
 * que NÃO constam no dump e não foram adicionados (mesma convenção do
 * warzone9/nimmersatt):
 *   quara-looter    — ring-of-orange-plasma
 *   quara-plunderer — spellbook-of-mind-control, quara-eye, demon-shield,
 *                     demonrage-sword
 *   quara-raider    — preserved-violet-seed
 * Creature products novos com preços oficiais Yasir (TibiaWiki / Creature
 * Products by NPC Price); cids/pesos do tools/_items14.json (appearances
 * do client 15.x). Ícones 32×32 em game/assets/item/<slug>.png
 * renderizados por tools/import_podzilla_assets.py.
 *
 * Fix de catálogo: necklace-of-the-deep (cid 13990) — o
 * deathlings-sunken-temple.js registra sell/npcSell 0; aqui o preço
 * oficial é restaurado para 3.000 (Rashid). Este arquivo precisa carregar
 * DEPOIS dele (index.html e loop "Conteúdo novo" do authoritative_engine).
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa, o que põe
 * os creature products no catálogo ITEMS para o Sell All online.
 */
"use strict";

/* Creature products/sementes novos do loot — preços oficiais Yasir (850,
 * 1250, 280, 410) ou sem comprador NPC (sementes de quest → sell 0).
 * necklace-of-the-deep: fix de preço compartilhado (Rashid 3.000) — o
 * merge só toca sell/npcSell/cid, preservando o acessório (charges/res).
 * Já existiam no catálogo e NÃO são redeclarados: red-gem (3039, 1000),
 * blue-gem (3041, 5000), glacier-kilt (823, 11000), glacier-robe (824,
 * 11000), crystal-crossbow (16163, 35000), rift-lance (22727, npcSell
 * 30000 Rashid — sell 1369 é o preço de mercado, mantido), haunted-blade
 * (7407, 8000), skull-staff (3324, npcSell 6000), crystalline-armor
 * (8050, 16000), abyss-hammer (7414, npcSell 20000) e platinum-coin
 * (3035, 100). */
const PODZILLA_LOOT_ITEMS = {
  "amber-souvenir":            { n: "amber souvenir", s: null, t: "loot", cid: 48508, w: 0.25, sell: 850,  npcSell: 850 },
  "resinous-fish-fin":         { n: "resinous fish fin", s: null, t: "loot", cid: 48509, w: 0.25, sell: 1250, npcSell: 1250 },
  "mantassin-tail":            { n: "mantassin tail", s: null, t: "loot", cid: 11489, w: 1.14, sell: 280,  npcSell: 280 },
  "quara-pincers":             { n: "quara pincers", s: null, t: "loot", cid: 11490, w: 1.20, sell: 410,  npcSell: 410 },
  "preserved-light-blue-seed": { n: "preserved light blue seed", s: null, t: "loot", cid: 45654, w: 0.30, sell: 0, npcSell: 0 },
  "preserved-violet-seed":     { n: "preserved violet seed", s: null, t: "loot", cid: 45655, w: 0.30, sell: 0, npcSell: 0 },
  "preserved-purple-seed":     { n: "preserved purple seed", s: null, t: "loot", cid: 45656, w: 0.30, sell: 0, npcSell: 0 },
  "necklace-of-the-deep":      { n: "necklace of the deep", s: null, t: "loot", cid: 13990, w: 5.09, sell: 3000, npcSell: 3000 },
};

(function registerPodzillaBottom() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in PODZILLA_LOOT_ITEMS) {
    const def = PODZILLA_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }

  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.hunts["podzilla-bottom"] = {
    name: "Podzilla Bottom",
    level: 400,
    minLevel: 400,
    cat: "hard",
    pack: 12,
    packMin: 8,
    packMax: 12,
    monsters: ["quara-looter", "quara-plunderer", "quara-raider"],
    spawnWeights: {
      "quara-looter": 34,
      "quara-plunderer": 33,
      "quara-raider": 33,
    },
    // Cena de caverna submarina — mesma das hunts deathlings/deeplings.
    color: "#2f5a70",
    scene: "cave",
    otbm: "podzilla_bottom",
    otbmFloor: 7,
    // Sem otbmBounds: o .otbm já é o recorte da área.
    otbmSpawn: { x: 1031, y: 1038, z: 7 },
    otbmMobBounds: { x: 1022, y: 1032, w: 19, h: 12, z: 7 },
    // Médias ponderadas pelos spawnWeights (dump Canary):
    //   hp  11500/13500/12500 → 12490 · exp 8650/10800/8150 → 9195
    //   dmg 450/500/320 → 424         · armor 95/90/95 → 93
    avgHp: 12490,
    avgExp: 9195,
    avgDamage: 424,
    avgArmor: 93,
    // Esperança dos drops de platinum-coin: 10% × ~13 moedas × 100 gp.
    avgGold: 130,
    respawn: 1,
  };
})();
