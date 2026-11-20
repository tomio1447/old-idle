/* Regressão: Final Radiant — Maior Domus (BOSSES 800+) + Phosphorus
 * (world boss). Update 15.30 "Make Believe", ausentes do dump Canary.
 *
 * HP de teste a pedido: 10.000 para os dois (os demais world bosses
 * voltaram aos HPs oficiais do dump Canary nesta mudança).
 *
 * Maior Domus: mesma arena do Mimar Haffar (minis_radiant.otbm,
 * playerspawn {1023,1034,7} / bossspawn {1023,1026,7}), cooldown 20h.
 * Phosphorus: warzone "phosphorus" (Final Radiant), final_radiant.otbm
 * 39×27 z=7 origem local 0,0 — bossspawn local 20,8 / playerspawn 20,16;
 * gate oficial: exige kills de maior-domus + mimar-haffar.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const wb = require("../server/world_boss.js");
const OTBM = require(path.join(js, "otbm.js"));

/* ---------------- dados do cliente (vm, ordem do index) ---------------- */
const ctx = { window: {}, console, Math, Date, Map, Set, document: undefined };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "weapondata.js", "weapons.js", "yasir-prices.js", "gnomprona.js",
                 "glooth-cave.js", "buster-darashia.js", "soulwar.js", "tileflags.js",
                 "mimar-haffar.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
vm.runInContext("var BOSS_DEFS={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "final-radiant.js"), "utf8"), ctx, { filename: "final-radiant.js" });

const M = ctx.GAMEDATA.monsters, items = ctx.GAMEDATA.items;
const COOLDOWN_20H = 20 * 60 * 60 * 1000;

/* ---------------- Maior Domus (BOSS_DEFS + monstro + hunt) ---------------- */
const b = ctx.BOSS_DEFS["maior-domus"];
must(b, "maior-domus sem BOSS_DEFS");
must(b.hp === 10000, "hp de teste deve ser 10000");
must(b.exp === 3500000, "exp oficial deve ser 3.5M");
must(b.baseMonster === "maior-domus" && b.sprite === "maior-domus", "sem baseMonster/sprite");
must(b.cooldown === COOLDOWN_20H, "cooldown deve ser 20h");
must(b.requirement && b.requirement.level === 800, "sem requisito de nível 800");
must(b.hunt === "maior-domus-room", "sem hunt da bossroom");

const domus = M["maior-domus"];
must(domus && domus.boss && domus.looktype === 1959,
  "maior-domus sem looktype 1959");
must(domus.mitigation === 2.53, "mitigation oficial 2.53");
must(domus.resist && domus.resist.earth === 40 && domus.resist.fire === 30 &&
     domus.resist.energy === 13, "resists oficiais (earth40/fire30/energy13)");
must(Array.isArray(domus.loot) && domus.loot.length >= 23,
  "maior-domus sem loot oficial completo");
must(ctx.MOBSHEETS["maior-domus"] && ctx.MOBSHEETS["maior-domus"].cols === 9 &&
     ctx.MOBSHEETS["maior-domus"].cw === 64, "sheet maior-domus ausente");
must(fs.existsSync(path.join(game, "assets", "mob", "maior-domus.png")),
  "sprite maior-domus ausente");

/* Hunt técnica invisível — mesma arena do Mimar Haffar. */
const hu = ctx.GAMEDATA.hunts["maior-domus-room"];
must(hu && hu.hidden === true, "sem hunt técnica invisível");
must(hu.otbm === "minis_radiant" && hu.otbmFloor === 7, "arena errada (deve ser minis_radiant)");
must(hu.otbmSpawn && hu.otbmSpawn.x === 1023 && hu.otbmSpawn.y === 1034 && hu.otbmSpawn.z === 7,
  "playerspawn errado (esperado {1023,1034,7} — mesmo do Mimar)");
must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1023 && hu.otbmMobBounds.y === 1026 &&
     hu.otbmMobBounds.z === 7, "bossspawn errado (esperado {1023,1026,7})");
must(hu.minLevel === 800 && hu.monsters[0] === "maior-domus", "hunt com nível/monstro errados");

/* ---------------- Phosphorus (monstro + warzone) ---------------- */
const pho = M["phosphorus"];
must(pho && pho.boss && pho.looktype === 1963, "phosphorus sem looktype 1963");
must(pho.hp === 10000 && pho.exp === 16000000, "phosphorus: hp teste 10k / exp oficial 16M");
must(pho.resist && pho.resist.earth === 20 && pho.resist.fire === 10 &&
     pho.resist.energy === 5, "resists oficiais (earth20/fire10/energy5)");
must(Array.isArray(pho.loot) && pho.loot.length >= 30,
  "phosphorus sem loot oficial completo");
must(ctx.MOBSHEETS["phosphorus"] && ctx.MOBSHEETS["phosphorus"].cols === 9 &&
     ctx.MOBSHEETS["phosphorus"].cw === 64, "sheet phosphorus ausente");
must(fs.existsSync(path.join(game, "assets", "mob", "phosphorus.png")),
  "sprite phosphorus ausente");

/* Warzone phosphorus: world boss 800+ com gate de kills. */
const wz = wb.WARZONES.find((w) => w.id === "phosphorus");
must(wz, "warzone phosphorus ausente de WARZONES");
must(wz.bossHp === 10000, "warzone: hp de teste deve ser 10000");
must(wz.minLevel === 800 && wz.maxChars === 5, "warzone: minLevel 800 / 5 chars");
must(Array.isArray(wz.requiresBossKills) &&
     wz.requiresBossKills.includes("maior-domus") &&
     wz.requiresBossKills.includes("mimar-haffar"),
  "warzone: requiresBossKills deve exigir maior-domus + mimar-haffar");
must(wz.otbm === "final_radiant" && wz.otbmFloor === 7 &&
     wz.gridW === 39 && wz.gridH === 27,
  "warzone: otbm/grid divergentes");
must(wz.otbmBounds && wz.otbmBounds.x === 1008 && wz.otbmBounds.y === 1015 &&
     wz.otbmBounds.w === 39 && wz.otbmBounds.h === 27 && wz.otbmBounds.z === 7,
  "warzone: otbmBounds deve ser o crop real 1008,1015 39×27 (era 0,0 = void)");
must(wz.playerSpawn.x === 20 && wz.playerSpawn.y === 16 &&
     wz.bossSpawn.x === 20 && wz.bossSpawn.y === 8,
  "warzone: spawns locais divergentes (player 20,16 / boss 20,8)");
must(wb.bossIdForWarzone("phosphorus") === "phosphorus", "bossIdForWarzone sem phosphorus");
must(wb.isWorldBossBossId("phosphorus"), "isWorldBossBossId sem phosphorus");
must(wb.warzoneIdFromBossId("phosphorus") === "phosphorus", "warzoneIdFromBossId sem phosphorus");

/* Mecânica Agony em área (true damage): 3000–5000, 20% a cada 8s, raio 5.
 * chLock = a rolagem acontece uma vez por intervalo (não a cada ataque). */
const agony = pho.skills.find((s) => s.el === "agony");
must(agony && agony.min === 3000 && agony.max === 5000 &&
     agony.int === 8000 && agony.ch === 20 && agony.chLock === true &&
     agony.radius === 5,
  "phosphorus: skill agony 3000–5000/20%/8s/raio5 (chLock) ausente ou errada");
must(!pho.skills.some((s) => s.miss === "physical"),
  "phosphorus: miss='physical' gera 404 (usar small-stone)");
must(!M["maior-domus"].skills.some((s) => s.miss === "physical"),
  "maior-domus: miss='physical' gera 404 (usar small-stone)");
must(fs.existsSync(path.join(game, "assets", "missile", "small-stone_e.png")) &&
     fs.existsSync(path.join(game, "assets", "missile", "small-stone_w.png")),
  "assets missile small-stone ausentes");
const frSrc = fs.readFileSync(path.join(js, "final-radiant.js"), "utf8");
must(!frSrc.includes('miss: "physical"'), 'final-radiant.js ainda tem miss:"physical"');
const engSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engSrc.includes("chLock"), "engine sem suporte a chLock");
const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
must(combatSrc.includes("chLock"), "combat.js sem suporte a chLock (paridade)");

/* Arena cliente + BOSS_DEFS reais (o placeholder "EM BREVE" fazia o world
 * boss cair no mapa genérico 40×40 — "mapa não carregado"). */
const phoHunt = ctx.GAMEDATA.hunts["phosphorus-room"];
must(phoHunt && phoHunt.otbm === "final_radiant" && phoHunt.otbmFloor === 7,
  "hunt phosphorus-room sem otbm final_radiant");
must(phoHunt.worldBoss === true && phoHunt.hidden === true &&
     phoHunt.otbmBounds && phoHunt.otbmBounds.x === 1008 && phoHunt.otbmBounds.y === 1015 &&
     phoHunt.otbmRuntimeWidth === 39 && phoHunt.otbmRuntimeHeight === 27,
  "hunt phosphorus-room sem bounds/runtime 39×27");
must(phoHunt.otbmSpawn.x === 1028 && phoHunt.otbmSpawn.y === 1031 &&
     phoHunt.otbmMobBounds.x === 1028 && phoHunt.otbmMobBounds.y === 1023,
  "hunt phosphorus-room: spawns absolutos errados");
must(ctx.BOSS_DEFS["phosphorus"] && ctx.BOSS_DEFS["phosphorus"].worldBoss === true &&
     ctx.BOSS_DEFS["phosphorus"].hunt === "phosphorus-room" &&
     !ctx.BOSS_DEFS["phosphorus"].unavailable,
  "BOSS_DEFS.phosphorus ainda é placeholder EM BREVE");

/* HPs oficiais restaurados nos demais world bosses (era teste 2500). */
const EXPECTED_WB_HP = {
  wz1: 200000, wz2: 250000, wz3: 340000, wz4: 350000, wz5: 350000,
  wz6: 350000, devourer: 25000, "pale-worm": 420000, megalomania: 620000,
  bakragore: 660000,
};
for (const w of wb.WARZONES) {
  if (w.id === "phosphorus") continue;
  must(EXPECTED_WB_HP[w.id] === w.bossHp,
    "warzone " + w.id + " com bossHp errado (esperado " + EXPECTED_WB_HP[w.id] +
    ", achou " + w.bossHp + ")");
}
const wbSrc = fs.readFileSync(path.join(__dirname, "..", "server", "world_boss.js"), "utf8");
must(!wbSrc.includes("WORLD_BOSS_TEST_HP"), "WORLD_BOSS_TEST_HP deve ter sido removido");
must(wbSrc.includes("BOSS_KILLS_REQUIRED"), "join sem gate de kills (BOSS_KILLS_REQUIRED)");

/* Phosphorus sem cooldown de 16h por personagem (a pedido). */
must(wbSrc.includes('wz === "phosphorus"') && wbSrc.includes("applyCharCooldown"),
  "world_boss.js sem exceção de cooldown para phosphorus");
const wbmSrc = fs.readFileSync(path.join(js, "world-bosses-modal.js"), "utf8");
must(wbmSrc.includes("sem cooldown"), "modal sem texto 'sem cooldown' para phosphorus");

/* ---------------- seção BOSSES 800+ no modal (game.js) ---------------- */
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const start = gameSrc.indexOf("const BOSS_MODAL_SECTIONS");
const fnEnd = gameSrc.indexOf("function renderBosses", start);
must(start >= 0 && fnEnd > start, "BOSS_MODAL_SECTIONS não encontrado");
const decl = gameSrc.slice(start, fnEnd);
const end = decl.indexOf("\n];");
must(end > 0, "fim da declaração não encontrado");
const secCtx = {};
vm.createContext(secCtx);
vm.runInContext(decl.slice(0, end + 3), secCtx);
const sections = vm.runInContext("BOSS_MODAL_SECTIONS", secCtx);
const sec = sections.find((s) => (s.ids || []).includes("maior-domus"));
must(sec && sec.minLevel === 800 && sec.title === "BOSSES 800+",
  "maior-domus fora da seção BOSSES 800+");
must(sections[sections.length - 1].title === "BOSSES 800+",
  "BOSSES 800+ deve ser a última seção do modal");

/* ---------------- loot: catálogo + sprite + preço oficial ---------------- */
/* Figurines Yasir 5,7M/3,4M; holy-ash 160 (Fiona/Yasir). Sem comprador →
 * sell 0: auric-moon-sigil, spellbook-of-dark-mysteries (equipamento
 * real Def 26/ml+3 lvl 80) e todo o set Moonsilver (armas lvl 1000,
 * capacetes lvl 800). Fixes em itens existentes: wand-of-starstorm
 * 3600 (Haroun), warrior-helmet 5000 (Alesar), golden-legs 30000
 * (Rashid), club-ring 100, giant-emerald 90000, giant-ruby 70000. */
const EXPECTED_PRICES = {
  "figurine-of-phosphorus": 5700000,
  "figurine-of-maior-domus": 3400000,
  "holy-ash": 160,
  "auric-moon-sigil": 0,
  "spellbook-of-dark-mysteries": 0,
  "moonsilver-nimbus-hat": 0,
  "moonsilver-strike-helm": 0,
  "moonsilver-trail-hood": 0,
  "moonsilver-epee": 0,
  "moonsilver-claymore": 0,
  "moonsilver-axe": 0,
  "moonsilver-chopper": 0,
  "moonsilver-crusher": 0,
  "moonsilver-mace": 0,
  "moonsilver-katar": 0,
  "moonsilver-bow": 0,
  "moonsilver-crossbow": 0,
  "moonsilver-channeler": 0,
  "moonsilver-sceptre": 0,
  "wand-of-starstorm": 3600,
  "warrior-helmet": 5000,
  "golden-legs": 30000,
  "club-ring": 100,
  "giant-emerald": 90000,
  "giant-ruby": 70000,
};
for (const slug of Object.keys(EXPECTED_PRICES)) {
  const it = items[slug];
  must(it, slug + " fora do catálogo");
  must(Number(it.sell) === EXPECTED_PRICES[slug] &&
       Number(it.npcSell ?? it.sell) === EXPECTED_PRICES[slug],
    slug + " com preço errado (esperado " + EXPECTED_PRICES[slug] +
    ", achou " + it.sell + "/" + it.npcSell + ")");
  must(Number.isFinite(Number(it.cid || it.id)) && Number(it.cid || it.id) > 0,
    slug + " sem cid/id");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + " sem PNG em assets/item");
}
/* Equipamentos reais: stats oficiais do set Moonsilver + spellbook
 * (modelo do catálogo: weapons.js — s/t/mag/dist/pierce). */
const sb = items["spellbook-of-dark-mysteries"];
must(sb.s === "shield" && sb.t === "spellbook" && sb.mag === 3 && sb.lvl === 80,
  "spellbook-of-dark-mysteries deve ser equipamento real (spellbook, mag+3, lvl80)");
must(items["moonsilver-epee"].t === "sword" && items["moonsilver-epee"].lvl === 1000 &&
     items["moonsilver-epee"].el === "earth" && items["moonsilver-epee"].elDmg === 50,
  "moonsilver-epee com stats errados");
must(items["moonsilver-bow"].t === "distance" && items["moonsilver-bow"].dist === 5 &&
     items["moonsilver-bow"].res && items["moonsilver-bow"].res.fire === 7,
  "moonsilver-bow com stats errados");
must(items["moonsilver-nimbus-hat"].s === "helmet" && items["moonsilver-nimbus-hat"].mag === 4,
  "moonsilver-nimbus-hat com stats errados");
/* Toda entrada de loot dos dois monstros resolve no catálogo + sprite. */
for (const mon of [domus, pho]) {
  for (const drop of mon.loot) {
    const slug = drop.item;
    must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
      "loot " + slug + " sem PNG em assets/item");
    const it = items[slug];
    must(it, "loot " + slug + " fora de GAMEDATA.items");
    must(Number.isFinite(Number(it.sell)) && Number(it.sell) >= 0,
      "loot " + slug + " sem sell válido");
  }
}
/* itens novos: engine (Sell All online) também precisa precificar. */
for (const slug of Object.keys(EXPECTED_PRICES)) {
  const it = engine.ITEMS[slug];
  must(it && Number(it.sell) === EXPECTED_PRICES[slug],
    "engine: " + slug + " fora do ITEMS ou com sell errado (" + (it && it.sell) + ")");
}

/* ---------------- engine: monstros + hunt da bossroom ---------------- */
for (const slug of ["maior-domus", "phosphorus"]) {
  const em = engine.MONSTERS[slug];
  must(em && em.boss && Array.isArray(em.loot) && em.loot.length >= 20,
    "engine: " + slug + " sem loot/registro");
}
must(engine.MONSTERS["maior-domus"].looktype === 1959 &&
     engine.MONSTERS["phosphorus"].looktype === 1963,
  "engine: looktypes divergentes");
must(engine.HUNTS["maior-domus-room"] &&
     engine.HUNTS["maior-domus-room"].monsters[0] === "maior-domus",
  "engine: hunt maior-domus-room ausente");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"final-radiant.js"'), "engine não carrega final-radiant.js no sandbox");
must(engineSrc.includes("final-radiant.js\").registerMonsters"),
  "engine não registra os monstros via require");
const boostSrc = fs.readFileSync(path.join(__dirname, "..", "server", "dailyboost.js"), "utf8");
must(boostSrc.includes('"maior-domus"'), "daily boost pool sem maior-domus");
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
must(canary["maior-domus"] && canary["maior-domus"].boss === 1,
  "canarymonsters.json sem entrada de maior-domus (filtro do DAILY_BOSS_POOL)");

/* ---------------- mapa final_radiant.otbm ---------------- */
const runtimeMap = path.join(game, "maps", "final_radiant.otbm");
const betaMap = path.join(game, "beta-maps", "bossesroom", "final_radiant.otbm");
must(fs.existsSync(runtimeMap), "final_radiant.otbm não publicado em game/maps/");
must(fs.existsSync(betaMap), "OTBM beta final_radiant ausente");
must(fs.readFileSync(runtimeMap).equals(fs.readFileSync(betaMap)),
  "runtime e beta divergentes (rode import_final_radiant_assets.py --publish-map)");
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const map = OTBM.read(fs.readFileSync(runtimeMap), { z: 7 });
must(map.z === 7 && map.w === 39 && map.h === 27, "OTBM z=7 39×27 incorreto");
/* Coordenadas locais (origem 0,0): walk() usa coords locais direto. */
const hm = OTBM.huntMapFromOtbm(map, tfCtx.TILEFLAGS || {});
const walk = (x, y) => {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const entry = hm.leg[hm.rows[y][x]];
  return !!(entry && !entry.bloc && !hm.footprintBlocked[x + ":" + y]);
};
must(walk(20, 8), "bossspawn local {20,8} bloqueado");
must(walk(20, 13), "centermap local {20,13} bloqueado");
must(walk(20, 16), "playerspawn local {20,16} bloqueado");
/* Conectividade: playerspawn alcança bossspawn e centermap. */
{
  const W = hm.rows[0].length, H = hm.rows.length, seen = {};
  const q = [[20, 16]]; seen["20,16"] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k]) continue;
      const e = hm.leg[hm.rows[ny][nx]];
      if ((e && e.bloc) || hm.footprintBlocked[nx + ":" + ny]) continue;
      seen[k] = 1; q.push([nx, ny]);
    }
  }
  must(seen["20,8"] && seen["20,13"], "playerspawn não alcança bossspawn/centermap");
}
/* TODOS os tiles usados pelo mapa têm sprite físico + catálogo do editor. */
{
  const used = new Set();
  Object.values(map.cells).forEach((c) => {
    if (c.g) used.add(c.g);
    (c.items || []).forEach((id) => used.add(id));
  });
  const missingPng = [];
  for (const id of used)
    if (!fs.existsSync(path.join(game, "assets", "tiles", id + ".png")))
      missingPng.push(id);
  must(missingPng.length === 0,
    "tiles de final_radiant sem PNG em assets/tiles: " + missingPng.join(", "));
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles de final_radiant fora do catálogo RME: " + unlisted.join(", "));
}

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/final-radiant.js?v="), "final-radiant.js não carregado no index");

console.log("ok: Final Radiant — Maior Domus (BOSSES 800+, 10k HP teste, 20h, arena Mimar) + Phosphorus (world boss 800+, 10k HP teste, gate Maior Domus+Mimar), WBs com HP oficial, loot oficial completo");
