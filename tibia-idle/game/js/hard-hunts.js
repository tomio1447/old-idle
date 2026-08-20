/* hard-hunts.js — categoria HARD e Cobra Bastion.
 *
 * Cobra Vizier/Scout/Assassin vêm integralmente do MONSTERDATA importado do
 * Canary. Este patch só completa itens de loot ausentes, traduz as três
 * magias nomeadas (cujos formatos vivem em scripts separados no Canary) e
 * registra as hunts depois da fusão dos monstros. */
"use strict";

(function registerHardHunts() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items;
  const monsters = GAMEDATA.monsters;

  // Preços NPC (TibiaWiki / Yasir / gem shops). sell e npcSell iguais —
  // Sell All / autoseller usam sell; analyser prefere npcSell.
  // sell=0 = NPC não compra (não inventar 1 gp).
  const registerLootItem = (slug, def) => {
    const sell = Math.max(0, Math.floor(Number(def.sell) || 0));
    const npcSell = def.npcSell != null
      ? Math.max(0, Math.floor(Number(def.npcSell) || 0))
      : sell;
    const base = Object.assign({ s: null, t: "loot" }, def, { sell, npcSell });
    if (!items[slug]) items[slug] = base;
    else {
      items[slug].sell = sell;
      items[slug].npcSell = npcSell;
      if (def.n && !items[slug].n) items[slug].n = def.n;
      if (def.cid && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
    }
  };

  const cobraLootItems = {
    "cobra-crest":          { n: "cobra crest", cid: 31678, w: 1.70, sell: 650 },
    "gemmed-figurine":      { n: "gemmed figurine", cid: 24392, w: 6.50, sell: 3500 },
    "red-crystal-fragment": { n: "red crystal fragment", cid: 16126, w: 0.15, sell: 800 },
    "onyx-chip":            { n: "onyx chip", cid: 22193, w: 1.20, sell: 500 },
    "cheesy-figurine":      { n: "cheesy figurine", cid: 17818, w: 0.75, sell: 150 },
    "opal":                 { n: "opal", cid: 22194, w: 1.20, sell: 500 },
  };
  Object.keys(cobraLootItems).forEach((slug) => registerLootItem(slug, cobraLootItems[slug]));

  // Loot MOTA Extension. CIDs/pesos do Canary; preços wiki.
  const motaLootItems = {
    "small-enchanted-ruby": { n: "small enchanted ruby", cid: 676, w: 0.10, sell: 250, af: 3, aw: 4, ah: 5 },
    "sample-of-monster-blood": { n: "sample of monster blood", cid: 27874, w: 0.85, sell: 250 },
    "pool-of-chitinous-glue": { n: "pool of chitinous glue", cid: 20207, w: 2.70, sell: 480 },
    "broken-dream": { n: "broken dream", cid: 20029, w: 0.10, sell: 0 },
    "jalapeno-pepper": { n: "jalapeno pepper", cid: 8016, w: 0.30, sell: 0 },
    "explorer-brooch": { n: "explorer brooch", cid: 4871, w: 0.90, sell: 0 },
    "hellhound-slobber": { n: "hellhound slobber", cid: 9637, w: 0.75, sell: 500, af: 2, aw: 19, ah: 23 },
    "goosebump-leather": { n: "goosebump leather", cid: 20205, w: 2.80, sell: 650 },
    "blazing-bone": { n: "blazing bone", cid: 16131, w: 2.20, sell: 610, af: 2, aw: 21, ah: 26 },
    "fiery-heart": { n: "fiery heart", cid: 9636, w: 1.14, sell: 375, af: 2, aw: 18, ah: 19 },
    "magma-amulet": { n: "magma amulet", cid: 817, w: 5, s: "amulet", t: "accessory", sell: 0 },
  };
  Object.keys(motaLootItems).forEach((slug) => registerLootItem(slug, motaLootItems[slug]));
  // Crystal Ring e Black Pearl usam patterns/subtipos no DAT, não frame
  // animation. Os metadados antigos pediam _anim.png inexistente.
  for (const slug of ["crystal-ring", "black-pearl"]) if (items[slug]) {
    delete items[slug].af; delete items[slug].aw; delete items[slug].ah;
  }

  // Formatos oficiais dos scripts de spell do Canary:
  // explosion_wave.lua = centro, depois duas linhas de largura 3;
  // wave_t.lua = centro, depois uma linha de largura 3;
  // death_chain.lua = corrente death de 2–3 saltos.
  const patchSkill = (slug, name, patch) => {
    const mob = monsters[slug];
    if (!mob) return;
    const skill = (mob.skills || []).find((s) => String(s.n || "").toLowerCase() === name);
    if (skill) Object.assign(skill, patch);
  };
  patchSkill("cobra-vizier", "explosion wave", {
    el: "physical", fx: "explosion-hit", areaPattern: [[0], [-1, 0, 1], [-1, 0, 1]],
  });
  patchSkill("cobra-vizier", "death chain", {
    el: "death", fx: "mort-area", range: 3, chain: 3,
  });
  patchSkill("cobra-assassin", "wave t", {
    el: "earth", fx: "green-rings", areaPattern: [[0], [-1, 0, 1]],
  });

  // Toda hunt HARD nasce em ondas variáveis de 6–10 criaturas.
  const harden = (hunt) => Object.assign(hunt, {
    cat: "hard", pack: 10, packMin: 6, packMax: 10,
  });
  const marapurNagas = GAMEDATA.hunts["marapur-nagas"];
  if (marapurNagas) harden(Object.assign(marapurNagas, {
    // Sala publicada em beta-maps/nagas_marapur.otbm. O arquivo possui
    // andares auxiliares; a instância jogável é exclusivamente o piso z=7.
    otbm: "nagas_marapur",
    otbmFloor: 7,
    // A FOV é apenas o trecho inicialmente visível. O piso z=7 completo
    // continua no mundo 30×30 e não pode ser recortado por estas coordenadas.
    otbmFovBounds: { x: 1009, y: 1012, w: 19, h: 15, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: { x: 1017, y: 1019, z: 7 },
    otbmMobBounds: { x: 1008, y: 1008, w: 23, h: 21, z: 7 },
    // Médias Canary (naga-archer/warrior + makara). O gamedata antigo
    // trazia avgDamage 273 / avgHp 3200 — subestimava o risco (badge MÉDIO).
    avgHp: 5073,
    avgExp: 5587,
    avgDamage: 468,
    avgArmor: 72,
  }));
  const ferumbrasWay = GAMEDATA.hunts["ferumbras-way"];
  if (ferumbrasWay) harden(Object.assign(ferumbrasWay, {
    otbm: "ferumbrasway",
    otbmFloor: 7,
    otbmFovBounds: { x: 1063, y: 990, w: 19, h: 15, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: { x: 1069, y: 1001, z: 7 },
    otbmMobBounds: { x: 1068, y: 995, w: 10, h: 9, z: 7 },
  }));

  const catacombsOramond = GAMEDATA.hunts["catacombs-oramond"];
  if (catacombsOramond) harden(Object.assign(catacombsOramond, {
    otbm: "catacombs",
    otbmFloor: 7,
    otbmFovBounds: { x: 1057, y: 1013, w: 19, h: 15, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: { x: 1066, y: 1020, z: 7 },
    otbmMobBounds: { x: 1066, y: 1014, w: 16, h: 13, z: 7 },
  }));

  const dtSeal = GAMEDATA.hunts["dt-seal"];
  if (dtSeal) harden(Object.assign(dtSeal, {
    name: "Grounds of Damnation (Tafariel)",
    otbm: "dt_seal",
    otbmFloor: 7,
    otbmFovBounds: { x: 1009, y: 1010, w: 19, h: 15, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: { x: 1018, y: 1018, z: 7 },
    otbmMobBounds: { x: 1006, y: 1008, w: 25, h: 21, z: 7 },
  }));

  const juggerSeal = GAMEDATA.hunts["juggerseal"];
  if (juggerSeal) harden(Object.assign(juggerSeal, {
    otbm: "juggerseal",
    otbmFloor: 7,
    otbmFovBounds: { x: 1065, y: 994, w: 19, h: 15, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: { x: 1074, y: 1005, z: 7 },
    otbmMobBounds: { x: 1070, y: 996, w: 11, h: 10, z: 7 },
  }));

  GAMEDATA.hunts["mota-extension"] = harden({
    name: "MOTA Extension",
    level: 400,
    minLevel: 400,
    monsters: ["floating-savant", "retching-horror", "fury", "hellhound", "demon"],
    color: "#8c6a45",
    scene: "museum",
    otbm: "MOTA",
    otbmFloor: 7,
    otbmFovBounds: { x: 1042, y: 1009, w: 21, h: 16, z: 7 },
    otbmRuntimeWidth: 30,
    otbmRuntimeHeight: 30,
    otbmSpawn: { x: 1051, y: 1016, z: 7 },
    otbmMobBounds: { x: 1040, y: 1006, w: 25, h: 20, z: 7 },
    avgHp: 6620,
    avgExp: 5428,
    avgDamage: 426,
    avgArmor: 49,
    avgGold: 110,
    respawn: 1.1,
  });

  // Bossroom nova da Timira publicada em beta-maps. O OTBM ocupa
  // (175,160,2)..(192,175,2); `otbmRoomBounds` preserva a arena lógica
  // global definida para combate, sem recortar paredes/objetos do arquivo.
  GAMEDATA.hunts["timira-room"] = {
    name: "Timira's Room",
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: ["timira-the-many-headed"],
    color: "#78bfa8",
    scene: "palace",
    otbm: "timiraroom",
    otbmRoomBounds: { x:175, y:159, w:19, h:17, z:2 },
    otbmMobBounds: { x:184, y:162, w:1, h:1, z:2 },
    otbmSpawn: { x:182, y:170, z:2 },
    avgHp: 75000,
    avgExp: 45500,
    avgDamage: 600,
    avgArmor: 82,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  GAMEDATA.hunts["cobra-bastion"] = harden({
    name: "Cobra Bastion",
    level: 250,
    minLevel: 250,
    monsters: ["cobra-vizier", "cobra-scout", "cobra-assassin"],
    color: "#b99a52",
    scene: "palace",
    otbm: "cobra_bastion",
    // Renderiza todo o OTBM. A janela 21×13 cuida do FOV sem recortar dados
    // nem reduzir o zoom do mapa; respawns continuam absolutos.
    otbmMobBounds: { x: 154, y: 160, w: 10, h: 12, z: 2 },
    otbmSpawn: { x: 157, y: 165, z: 2 },
    avgHp: 8400,
    avgExp: 7313,
    avgDamage: 477,
    avgArmor: 81,
    avgGold: 75,
    respawn: 1.2,
  });
})();
