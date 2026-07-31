/*
 * patch_amazon.js — hunt "Amazon Camp" (Amazon + Valkyrie), nível 20.
 *
 * Carrega DEPOIS de monsters.js e patch_imbuement.js (mesma regra do
 * comentário no index.html: a fusão do MONSTERDATA recria GAMEDATA.monsters
 * e apagaria qualquer ajuste de loot feito antes dela).
 *
 * Correção de loot: monster.loot do Canary referencia "protective charm"
 * pelo NOME (slug() vira "protective-charm"), mas o item já existe no jogo
 * como "mat-11444" (material de imbuement injetado por patch_imbuement.js,
 * mesmo id de client 11444). Sem esse remapeamento o drop caía num slug
 * que não existe em GAMEDATA.items e sumia (loot fantasma). Mantemos a
 * chance/max REAIS do Canary (5.2% Amazon, 3.2% Valkyrie) em vez do valor
 * genérico de imbuement (12%) que patch_imbuement.js usa para outros bichos.
 *
 * "girlish hair decoration" (client id 11443) e "red apple" (id 3585)
 * nunca tinham entrado no catálogo — sprites extraídas via
 * tools/extract_amazon_loot_items.py.
 */
"use strict";

if (typeof GAMEDATA !== "undefined") {
  GAMEDATA.items["girlish-hair-decoration"] = {
    n: "girlish hair decoration", s: null, t: "loot", sell: 3, w: 0.5,
  };
  GAMEDATA.items["red-apple"] = {
    n: "red apple", s: null, t: "loot", sell: 3, w: 1.5,
  };

  for (const slug of ["amazon", "valkyrie"]) {
    const m = GAMEDATA.monsters[slug];
    if (!m || !m.loot) continue;
    m.jogavel = true;
    for (const l of m.loot) {
      if (l.item === "protective-charm") l.item = "mat-11444";
    }
  }

  GAMEDATA.hunts["amazon-camp"] = {
    name: "Amazon Camp", level: 20, monsters: ["amazon", "valkyrie"],
    color: "#5a7a3a", scene: "forest",
    avgHp: 150, avgExp: 73, avgDamage: 58, avgArmor: 11, avgGold: 3.1,
    respawn: 0.8, pack: 3, otbm: "amazon_camp",
  };

  // Garante a ordenação crescente por nível para que o Amazon Camp (nv 20)
  // apareça no lugar certo na lista de caçadas (entre nv 18 e nv 24).
  const sortedHunts = {};
  Object.keys(GAMEDATA.hunts)
    .sort((a, b) => (GAMEDATA.hunts[a].level || 0) - (GAMEDATA.hunts[b].level || 0))
    .forEach((k) => {
      sortedHunts[k] = GAMEDATA.hunts[k];
    });
  GAMEDATA.hunts = sortedHunts;
}
