/* gnomprona.js — categoria de hunts GNOMPRONA 400+ (Monster Graveyard).
 *
 * Primeira hunt: "Monster Graveyard — Weagon 1"
 * (game/maps/gnomprona_weagon1.otbm — 38×26, z=7; bounds 1007,1015–1044,1040).
 * Monstros: nighthunter, stalking-stalk, sulphider, sulphur-spouter,
 * undertaker — stats/loot do canary (MONSTERDATA).
 *
 * HAZARD LEVEL (por CONTA — acc.cosmetics.hazard = {kills, level, sel}):
 *   - cada kill do boss The Primal Menace libera +1 nível de hazard
 *     (cap 12 — hooks em bosstiary.js e no motor autoritativo);
 *   - o modal da hunt mostra uma caixa 1–12: níveis desbloqueados são
 *     clicáveis e o jogador escolhe o hazard ativo (sel);
 *   - pack da hunt = 5 base + 1 por hazard level (hook em huntWaveSize);
 *   - a cada spawn rola a chance do Plunder Patriarch (miniboss, não
 *     conta na missão) — hook em pickHuntMonsterSlug / pickHuntSpawnSlug:
 *       hazard < 10 → 1% + 1% por nível  (n1=2%, n5=6%, n9=10%)
 *       hazard ≥ 10 → 10% + 10% por nível (n10+=sempre);
 *   - monstros hazard (nível > 0, motor autoritativo): +2% dano/nível,
 *     dodge 0,85%/nível, crit 7,5% a cada 2s (+50% dano), +3,5% exp/nível
 *     e 4%/nível de rolagem extra da tabela de loot.
 *
 * Missão "gnomprona-weagon1": 5.000 kills de cada um dos 5 monstros —
 * recompensa 1× Primal Bag (MISSION_DEFS em game.js).
 */
"use strict";

/* ---------- hazard (por conta — acc.cosmetics.hazard / p.hazard*) ---------- */
const GNOMPRONA_HAZARD_MAX = 12;

/* Espelho do hazard persistido na conta (cosmetics.hazard). */
function gnompronaAccountHazard() {
  try {
    if (typeof accountApiConfigured !== "function" || !accountApiConfigured())
      return null;
    const acc = typeof sessionAccount === "function" ? sessionAccount() : null;
    const h = acc && acc.cosmetics && acc.cosmetics.hazard;
    return h && typeof h === "object" && !Array.isArray(h) ? h : null;
  } catch (e) { return null; }
}

/* Nível desbloqueado: maior entre o espelho da conta e o do personagem
 * (o char carrega p.hazardLevel = abates do The Primal Menace). */
function gnompronaHazardUnlock(p) {
  const accH = gnompronaAccountHazard();
  const accLevel = accH ? Number(accH.level) || 0 : 0;
  const own = Number(p && p.hazardLevel) || 0;
  // TODAS as contas já começam com hazard 1 desbloqueado.
  return Math.max(1, Math.min(GNOMPRONA_HAZARD_MAX, Math.max(accLevel, own)));
}

/* Nível ativo: a escolha (sel) vem da conta quando existe — senão do char;
 * sem escolha registrada joga no máximo desbloqueado. */
function gnompronaHazardActive(p) {
  const mx = gnompronaHazardUnlock(p);
  if (!mx) return 0;
  const accH = gnompronaAccountHazard();
  const sel = accH && accH.sel !== undefined ? Number(accH.sel)
    : (p && p.hazardSel !== undefined ? Number(p.hazardSel) : mx);
  return Math.max(1, Math.min(mx, sel || mx));
}

/* Publica o estado de hazard na conta (cosmetics.hazard) e sincroniza. */
function gnompronaSyncAccount(p, selected) {
  const level = gnompronaHazardUnlock(p);
  const kills = Math.max(level,
    Number((gnompronaAccountHazard() || {}).kills) || 0,
    Number(p && p.hazardKills) || 0);
  const sel = selected === undefined ? gnompronaHazardActive(p)
    : Math.max(1, Math.min(level, Math.floor(Number(selected) || 1)));
  try {
    if (typeof accountApiConfigured !== "function" || !accountApiConfigured())
      return;
    const acc = typeof sessionAccount === "function" ? sessionAccount() : null;
    if (!acc) return;
    acc.cosmetics = acc.cosmetics && typeof acc.cosmetics === "object" &&
      !Array.isArray(acc.cosmetics) ? acc.cosmetics : {};
    acc.cosmetics.hazard = { kills: kills, level: level, sel: sel };
    sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    const token = typeof sessionToken === "function" ? sessionToken() : null;
    if (token && typeof accountUpdateHazard === "function")
      accountUpdateHazard(token, acc.cosmetics.hazard);
  } catch (e) { /* offline */ }
}

function gnompronaSetHazard(p, lvl) {
  const mx = gnompronaHazardUnlock(p);
  const sel = Math.max(1, Math.min(mx, Number(lvl) || 0));
  if (p) p.hazardSel = sel;
  gnompronaSyncAccount(p, sel);
  return sel;
}

/* +1 monstro por nível de hazard no pack base de 5. */
function gnompronaPackBonus() {
  return typeof G !== "undefined" && G && G.p ? gnompronaHazardActive(G.p) : 0;
}

/* Chance do Plunder Patriarch a cada spawn (fração 0–1) — reduzida 10×
 * a pedido do usuário. */
function gnompronaPlunderChance(level) {
  const l = Math.max(0, Math.min(GNOMPRONA_HAZARD_MAX,
    Number(level === undefined ? gnompronaPackBonus() : level) || 0));
  const c = l < 10 ? 0.01 + 0.01 * l : 0.1 + 0.1 * l;
  return Math.min(1, c / 10);
}

/* Primal Bag — abre e sorteia 1 item do set de Gnomprona → Depot.
 * Pool espelhado em PRIMAL_BAG_POOL do motor autoritativo. */
const GNOMPRONA_BAG_POOL = [
  "arboreal-tome", "arboreal-crown", "spiritthorn-armor", "spiritthorn-helmet",
  "alicorn-headguard", "alicorn-quiver", "arcanomancer-regalia",
  "arcanomancer-folio", "charged-arcanomancer-sigil", "charged-arboreal-ring",
  "charged-alicorn-ring", "charged-spiritthorn-ring",
];
window.gnompronaOpenBag = function (p) {
  const item = GNOMPRONA_BAG_POOL[
    Math.floor(Math.random() * GNOMPRONA_BAG_POOL.length)];
  if (p) { p.depot = p.depot || []; p.depot.push(item); return item; }
  return null;
};

(function registerGnomprona() {
  if (typeof GAMEDATA === "undefined") return;
  GAMEDATA.hunts = GAMEDATA.hunts || {};
  GAMEDATA.items = GAMEDATA.items || {};

  /* Recompensa da missão — Primal Bag (cid 39546 do canary items.xml). */
  if (!GAMEDATA.items["primal-bag"]) {
    GAMEDATA.items["primal-bag"] = {
      n: "primal bag", s: null, t: "loot", w: 8, cid: 39546,
      sell: 0, npcSell: 0,
    };
  }

  /* .otbm z=7: bounds reais (1007,1015)–(1044,1040) → 38×26.
   * centermap (1024,1027) = spawn do jogador (célula caminhável central).
   * radiuspawn (1016,1025)–(1026,1030) = zona de respawn (11×6, 64 sqm). */
  GAMEDATA.hunts["gnomprona-weagon1"] = {
    name: "Monster Graveyard — Weagon 1",
    level: 400,
    minLevel: 400,
    cat: "gnomprona",
    gnomprona: true,
    /* 5 base + 1 por hazard level (bônus aplicado em huntWaveSize). */
    pack: 5, packMin: 5, packMax: 5,
    monsters: ["nighthunter", "stalking-stalk", "sulphider",
      "sulphur-spouter", "undertaker"],
    /* Miniboss raro (não entra na missão): sorteado à parte pela chance
     * do hazard em pickHuntMonsterSlug/pickHuntSpawnSlug — peso 0 aqui. */
    bossMobs: ["plunder-patriarch"],
    spawnWeights: {
      "nighthunter": 20, "stalking-stalk": 20, "sulphider": 20,
      "sulphur-spouter": 20, "undertaker": 20,
      "plunder-patriarch": 0,
    },
    color: "#4a3a5a",
    scene: "crypt",
    otbm: "gnomprona_weagon1",
    otbmFloor: 7,
    otbmFovBounds: { x: 1007, y: 1015, w: 38, h: 26, z: 7 },
    otbmFovWidth: 21, otbmFovHeight: 13,
    otbmSpawn: { x: 1024, y: 1027, z: 7 },
    otbmMobBounds: { x: 1016, y: 1025, w: 11, h: 6, z: 7 },
    // Pisos caminháveis do .otbm (lápides/terra graveyard 15.x).
    walkFloors: [1019, 1020, 4515, 4516, 4517, 4518, 4519, 4520, 4521,
      4522, 4523, 4524, 4525, 4526, 4527, 4528, 4529, 4530, 38980, 38982,
      38984, 38985, 38986, 38987, 38988],
    avgHp: 19280,
    avgExp: 12521,
    avgDamage: 550,
    avgArmor: 55,
    avgGold: 300,
    respawn: 1,
  };

  const variants = [
    { id: "gnomprona-weagon2", name: "Crystal Enigma — Weagon 2", otbm: "gnomprona_weagon2",
      monsters: ["headpecker", "mantosaurus", "mercurial-menace", "noxious-ripptor", "shrieking-cry-stal"],
      bounds: { x: 1007, y: 1016, w: 36, h: 26, z: 7 }, spawn: { x: 1022, y: 1027, z: 7 },
      mobs: { x: 1016, y: 1025, w: 12, h: 7, z: 7 }, floors: [1019, 1020], color: "#5a6a83" },
    { id: "gnomprona-weagon3", name: "Sparkling Pools — Weagon 3", otbm: "gnomprona_weagon3",
      monsters: ["emerald-tortoise", "gore-horn", "gorerilla", "hulking-prehemoth", "sabretooth"],
      bounds: { x: 1008, y: 1013, w: 25, h: 22, z: 7 }, spawn: { x: 1020, y: 1024, z: 7 },
      mobs: { x: 1016, y: 1020, w: 9, h: 10, z: 7 }, floors: [1019, 1020, 10197], color: "#356b67" },
  ];
  for (const spec of variants) {
    const weights = { "plunder-patriarch": 0 };
    for (const slug of spec.monsters) weights[slug] = 20;
    const stats = spec.monsters.map((slug) => typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug]).filter(Boolean);
    const avg = (key, fallback) => stats.length ? Math.round(stats.reduce((sum, m) => sum + (Number(m[key]) || 0), 0) / stats.length) : fallback;
    GAMEDATA.hunts[spec.id] = Object.assign({}, GAMEDATA.hunts["gnomprona-weagon1"], {
      name: spec.name, monsters: spec.monsters, spawnWeights: weights, color: spec.color,
      otbm: spec.otbm, otbmFovBounds: spec.bounds, otbmSpawn: spec.spawn,
      otbmMobBounds: spec.mobs, walkFloors: spec.floors,
      avgHp: avg("hp", 20000), avgExp: avg("exp", 12500),
      avgDamage: avg("damage", 1000), avgArmor: avg("armor", 80),
    });
  }
  const products = [
    ["headpecker-beak", 39387, 2800, 3.9], ["headpecker-feather", 39388, 1300, 0.7],
    ["mantosaurus-jaw", 39386, 2800, 4.2], ["mercurial-wing", 39395, 2500, 0.1],
    ["ripptor-scales", 39391, 1200, 0.3], ["ripptor-claw", 39389, 2600, 2.8],
    ["cry-stal", 39394, 3200, 9.7], ["emerald-tortoise-shell", 39379, 2150, 6],
    ["gore-horn", 39377, 2900, 2.6], ["gorerilla-mane", 39392, 2750, 2.4],
    ["gorerilla-tail", 39393, 2650, 2.8], ["prehemoth-horns", 39382, 3000, 11],
    ["prehemoth-claw", 39383, 2300, 8.5], ["sabretooth-fur", 39378, 2500, 1.35],
    ["coral-brooch", 24391, 750, 0.8],
  ];
  for (const [slug, cid, price, weight] of products) {
    GAMEDATA.items[slug] = Object.assign({}, GAMEDATA.items[slug], {
      n: slug === "cry-stal" ? "cry-stal" : slug.replace(/-/g, " "), s: null, t: "loot",
      cid: cid, sell: price, npcSell: price, w: weight,
    });
  }
  if (GAMEDATA.items["wooden-spellbook"]) GAMEDATA.items["wooden-spellbook"].cid = 25699;
  for (const [slug, price] of [["gold-ingot", 5000], ["silver-brooch", 150],
    ["emerald-bangle", 800], ["orichalcum-pearl", 40], ["ring-of-the-sky", 30000]]) {
    if (GAMEDATA.items[slug]) Object.assign(GAMEDATA.items[slug], { sell: price, npcSell: price });
  }

  /* Sala do The Primal Menace — beta-maps/bossesroom/primal_room.otbm →
   * maps/primal_room.otbm. OTBM z=7: (1009,1015)–(1047,1045) 39×31.
   * centeroom (1028,1030); bossspawn (1028,1025); playerspawn (1029,1035).
   * gnomprona:true → a instância carrega o hazard ativo da conta
   * (auth.hazardLevel) e os adds nascem hazard-flagged pelo motor. */
  GAMEDATA.hunts["the-primal-menace-room"] = {
    name: "The Primal Menace Room",
    hidden: true,
    level: 400,
    minLevel: 400,
    cat: "gnomprona",
    gnomprona: true,
    scene: "crypt",
    otbm: "primal_room",
    otbmFloor: 7,
    otbmFovBounds: { x: 1009, y: 1015, w: 39, h: 31, z: 7 },
    otbmFovWidth: 21, otbmFovHeight: 13,
    otbmSpawn: { x: 1029, y: 1035, z: 7 },
    otbmMobBounds: { x: 1028, y: 1025, w: 1, h: 1, z: 7 },
    monsters: ["the-primal-menace", "nighthunter", "stalking-stalk",
      "sulphider", "sulphur-spouter", "undertaker"],
    avgHp: 400000, avgExp: 0, avgDamage: 763, avgArmor: 100, avgGold: 100,
    respawn: 1, pack: 1,
  };
})();
