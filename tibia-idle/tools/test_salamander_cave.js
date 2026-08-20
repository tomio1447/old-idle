/* Regressão: Salamander's Cave (hunt 0–100, importação Canary).
 *
 * 1. OTBM publicado em game/maps (byte-igual ao beta-maps) e a hunt usa as
 *    coordenadas do RME: centerroom {1065,1003,7}, playerspawn {1063,1007,7}
 *    e monsterspawnradius {1063,998,7}..{1067,1008,7} (otbmMobBounds 5×11).
 *    O spawn precisa cair em célula ANDÁVEL e o FOV = bounds do mapa.
 * 2. Os 4 monstros (Emerald Damselfly, Marsh Stalker, Swampling, Salamander)
 *    existem no cliente E no servidor com os mesmos stats/loot do
 *    canarymonsters.json (importação 100% Canary — as duas fontes batem).
 * 3. Loot: todo item dos 4 monstros está no catálogo com preço oficial da
 *    TibiaWiki (itens novos com npcvalue; trash/quest ficam sell 0) e a
 *    hunt registra os itens que faltavam (sprites à parte).
 * 4. Server: pool online da hunt no engine + salamander-cave.js no sandbox vm.
 * 5. Modal: a hunt aparece na seção HUNTS LEVEL 0–100.
 * 6. Sprites: PNGs físicos de mobs, de todos os tiles usados pelo mapa e
 *    dos itens de loot novos (extração na máquina do usuário).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
function must(v, m) { if (!v) throw Error("FALHOU: " + m); }
const root = path.join(__dirname, "..");
const game = path.join(root, "game");
const js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
global.window = { addEventListener() {} };
const { applyHuntOtbmZones } = require(path.join(js, "otbmhunt.js"));

const MOBS = ["emerald-damselfly", "marsh-stalker", "swampling", "salamander"];

/* ---------------- 1) OTBM publicado + geometria ---------------- */
{
  const beta = fs.readFileSync(path.join(game, "beta-maps", "salamandercave.otbm"));
  const pub = fs.readFileSync(path.join(game, "maps", "salamandercave.otbm"));
  must(beta.equals(pub), "maps/salamandercave.otbm difere do beta-maps");

  const ctx = { window: {}, console, setInterval, clearInterval, Date, Math, Map, Set };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(js, "salamander-cave.js"), "utf8"), ctx);
  const hunt = ctx.GAMEDATA.hunts["salamander-cave"];
  must(hunt, "hunt salamander-cave não registrada no GAMEDATA");
  must(hunt.otbm === "salamandercave" && hunt.otbmFloor === 7, "otbm/floor errados");
  must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1063, y: 1007, z: 7 }),
    "playerspawn divergente: " + JSON.stringify(hunt.otbmSpawn));
  must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1063, y: 998, w: 5, h: 11, z: 7 }),
    "monsterspawnradius divergente: " + JSON.stringify(hunt.otbmMobBounds));
  must(JSON.stringify(hunt.monsters) === JSON.stringify(MOBS),
    "composição divergente: " + JSON.stringify(hunt.monsters));
  must(hunt.level === 15 && hunt.cat === "aventureiro", "nível/categoria divergentes");

  const tfCtx = { window: {}, console };
  vm.createContext(tfCtx);
  vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
  const TILEFLAGS = tfCtx.window.TILEFLAGS;

  const mapa = OTBM.read(pub, { z: 7 });
  const b = mapa.sourceBounds;
  must(b, "mapa sem sourceBounds");
  must(hunt.otbmFovBounds.x === b.minX && hunt.otbmFovBounds.y === b.minY &&
    hunt.otbmFovBounds.w === b.maxX - b.minX + 1 && hunt.otbmFovBounds.h === b.maxY - b.minY + 1,
    "otbmFovBounds não casa com os bounds do mapa");
  const center = { x: 1065, y: 1003, z: 7 }; // centerroom (referência do RME)
  must(b.minX <= center.x && center.x <= b.maxX && b.minY <= center.y && center.y <= b.maxY,
    "centerroom fora do mapa");

  mapa.idleTargetWidth = 30; mapa.idleTargetHeight = 30;
  applyHuntOtbmZones(mapa, hunt);
  const hm = OTBM.huntMapFromOtbm(mapa, TILEFLAGS);
  must(hm.spawn, "spawn não converteu");
  const sp = hm.legenda[hm.rows[hm.spawn.y][hm.spawn.x]];
  must(!sp.bloc, "playerspawn caiu em célula bloqueada");
  const mob = hm.mobSet || {};
  must(Object.keys(mob).length === 55, "zona de monstros não tem 5×11 células");
  const walk = Object.keys(mob).filter((k) => {
    const [x, y] = k.split(":").map(Number);
    return !hm.legenda[hm.rows[y][x]].bloc;
  });
  must(walk.length >= 50, "zona de monstros quase toda bloqueada");
}

/* ---------------- 2) monstros: cliente == servidor == canary ---------------- */
{
  const canary = require(path.join(game, "data", "canarymonsters.json"));
  const cctx = { window: {} };
  vm.createContext(cctx);
  vm.runInContext(fs.readFileSync(path.join(js, "monsterdata.js"), "utf8"), cctx);
  const md = cctx.window.MONSTERDATA || cctx.window.GAMEDATA.monsters;
  const engineSrc = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
  for (const s of MOBS) {
    const c = canary[s], m = md[s];
    must(c && m, s + " ausente do canary/monsterdata");
    for (const k of ["hp", "exp", "damage", "armor", "speed", "mitigation", "targetDistance"])
      must(Number(m[k]) === Number(c[k]), s + "." + k + " diverge entre cliente e Canary");
    const la = (m.loot || []).map((l) => l.item).sort();
    const lb = (c.loot || []).map((l) => l.item).sort();
    must(JSON.stringify(la) === JSON.stringify(lb), s + " com loot divergente do Canary");
  }
  // pool online do servidor
  must(/\"salamander-cave\":\{monsters:\["emerald-damselfly","marsh-stalker","swampling","salamander"\]/.test(engineSrc),
    "engine sem o pool da salamander-cave");
  must(engineSrc.includes('path.join(js,"salamander-cave.js")'),
    "engine não carrega salamander-cave.js no sandbox");
  const engine = require(path.join(root, "server", "authoritative_engine"));
  const auth = { kind: "hunt", huntId: "salamander-cave", ended: false, mobs: [], pendingSpawns: [],
    spawnPool: [], spawnIds: ["srv-p1", "srv-p2", "srv-p3", "srv-p4"], pack: 4, wave: 0,
    gridW: 30, gridH: 30, spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
    clock: Date.now(), rngState: 777, fiendishChance: 0, influencedChance: 0 };
  engine.spawnHuntWave(auth, Date.now());
  must(auth.spawnPool.length === MOBS.length && MOBS.every((s) => auth.spawnPool.includes(s)),
    "pool online não inclui as 4 criaturas: " + JSON.stringify(auth.spawnPool));
}

/* ---------------- 3) loot completo com preços ---------------- */
{
  const cctx = { window: {}, console };
  cctx.window = cctx;
  vm.createContext(cctx);
  vm.runInContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), cctx);
  vm.runInContext(fs.readFileSync(path.join(js, "salamander-cave.js"), "utf8"), cctx);
  const items = cctx.GAMEDATA.items;
  const zeroList = new Set(["worm", "simple-jo-staff"]);
  const prices = {
    "swampling-moss": 20, "piece-of-swampling-wood": 30, "swampling-club": 40,
    "damselfly-wing": 20, "damselfly-eye": 25, "marsh-stalker-feather": 50,
    "marsh-stalker-beak": 65,
  };
  const loot = new Set();
  for (const s of MOBS)
    for (const l of require(path.join(game, "data", "canarymonsters.json"))[s].loot)
      loot.add(l.item);
  for (const slug of loot) {
    must(items[slug], "item de loot fora do catálogo: " + slug);
    if (!zeroList.has(slug))
      must((Number(items[slug].npcSell) > 0 || Number(items[slug].sell) > 0),
        "loot sem preço (autoseller pularia): " + slug);
  }
  for (const slug of Object.keys(prices))
    must(items[slug] && items[slug].sell === prices[slug] && items[slug].npcSell === prices[slug],
      slug + " com preço divergente: " + (items[slug] && items[slug].sell));
  must(items["simple-jo-staff"] && items["simple-jo-staff"].s === "weapon" &&
    items["simple-jo-staff"].atk === 12 && items["simple-jo-staff"].def === 8 &&
    items["simple-jo-staff"].th === true &&
    JSON.stringify(items["simple-jo-staff"].vocs) === JSON.stringify(["monk", "exalted monk"]),
    "simple-jo-staff não importou como arma de monge (Canary)");
  must(items["swampling-club"] && items["swampling-club"].atk === 17 &&
    items["swampling-club"].def === 12 && items["swampling-club"].sell === 40,
    "swampling-club sem atk/def/preço Canary");
}

/* ---------------- 4) modal ---------------- */
{
  const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
  must(uiSrc.includes('{ title: "HUNTS LEVEL 0–100", ids: ["rats", "amazon-camp", "salamander-cave"] }'),
    "seção HUNTS LEVEL 0–100 sem a salamander-cave");
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  must(html.includes("js/salamander-cave.js?v=salamander-cave-v1"),
    "cache-bust da salamander-cave ausente no index");
}

/* ---------------- 5) sprites ---------------- */
{
  for (const s of MOBS)
    must(fs.existsSync(path.join(game, "assets", "mob", s + ".png")),
      "sprite do monstro ausente: " + s);
  const mapa = OTBM.read(fs.readFileSync(path.join(game, "maps", "salamandercave.otbm")), { z: 7 });
  const need = new Set();
  for (const k in mapa.cells) {
    const c = mapa.cells[k];
    if (c.g) need.add(c.g);
    for (const it of c.items || []) need.add(it);
  }
  const missing = [...need].filter((id) => !fs.existsSync(path.join(game, "assets", "tiles", id + ".png")));
  must(missing.length === 0,
    "tiles do mapa sem PNG (" + missing.length + "): " + missing.slice(0, 12).join(",") + "...");
  const items = ["swampling-moss", "piece-of-swampling-wood", "swampling-club",
    "damselfly-wing", "damselfly-eye", "marsh-stalker-feather", "marsh-stalker-beak",
    "simple-jo-staff"];
  for (const slug of items)
    must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
      "sprite do item de loot ausente: " + slug);
}

console.log("ok: salamander cave (hunt 0–100, importação Canary, mapa e loot completos)");
