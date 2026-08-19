/* Regressão: Ingol Terrain (hunt 250+ da zona Ingol) — mapa, criaturas
 * Canary e loot de creature products.
 *
 * 1. OTBM publicado em game/maps (byte-igual ao beta-maps) com piso z=7:
 *    centerroom {1073,1002,7}, playerspawn {1068,1002,7} e spawnradius
 *    {1069,998,7}..{1079,1008,7} dentro dos bounds e com chão.
 * 2. Hunt 250+ com as 5 criaturas do Canary (harpy, crape-man, liodile,
 *    boar-man, carnivostrich); o servidor tem a hunt no HUNTS e o spawn
 *    pool online inclui as 5.
 * 3. Loot das 5 criaturas: os 5 creature products entram no catálogo com
 *    preço NPC da TibiaWiki.
 * 4. Missão: 250 kills (50×5). Catálogo HUNTS 250+ lista a hunt.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const engine = require("../server/authoritative_engine");
function must(v, m) { if (!v) throw Error(m); }
const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
const game = path.join(root, "game");
const OTBM = require(path.join(js, "otbm.js"));

const MOBS = ["harpy", "crape-man", "liodile", "boar-man", "carnivostrich"];

/* ---------------- 1) OTBM publicado + geometria ---------------- */
const beta = fs.readFileSync(path.join(game, "beta-maps", "ingolterrain.otbm"));
const pub = fs.readFileSync(path.join(game, "maps", "ingolterrain.otbm"));
must(beta.equals(pub), "Ingol Terrain não publica o OTBM (beta-maps ≠ maps)");
const map = OTBM.read(pub, { z: 7 });
must(map.sourceBounds.minX === 1061 && map.sourceBounds.minY === 991 &&
  map.sourceBounds.maxX === 1085 && map.sourceBounds.maxY === 1011,
  "bounds do OTBM divergentes: " + JSON.stringify(map.sourceBounds));
const cell = (x, y) => map.cells[(x - 1061) + "," + (y - 991)];
const grounded = (x, y) => { const c = cell(x, y); return !!(c && Number(c.g) > 0); };
must(grounded(1068, 1002), "playerspawn {1068,1002,7} sem chão no OTBM");
must(grounded(1073, 1002), "centerroom {1073,1002,7} sem chão no OTBM");
must(grounded(1069, 998) && grounded(1079, 1008) && grounded(1079, 998) && grounded(1069, 1008),
  "spawnradius {1069,998}..{1079,1008} com cantos sem chão no OTBM");

const usedIds = new Set();
for (const c of Object.values(map.cells)) {
  if (c.g) usedIds.add(c.g);
  for (const it of (c.items || [])) usedIds.add(typeof it === "object" ? it.id : it);
}
for (const id of usedIds) {
  must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
}

/* ---------------- 2) hunt (cliente + servidor) ---------------- */
{
  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), ctx, { filename: "gamedata.js" });
  vm.runInContext(fs.readFileSync(path.join(js, "ingol-terrain.js"), "utf8"), ctx, { filename: "ingol-terrain.js" });
  const h = vm.runInContext('window.GAMEDATA.hunts["ingol-terrain"]', ctx);
  must(h && h.name === "Ingol Terrain" && h.level === 250 && h.minLevel === 250,
    "hunt ingol-terrain ausente/sem nível 250+");
  must(h.cat === "hard" && h.pack === 10 && h.packMin === 6 && h.packMax === 10, "hunt sem cat hard/pack");
  must(JSON.stringify(h.monsters) === JSON.stringify(MOBS),
    "monstros da hunt divergentes do Canary");
  must(h.otbm === "ingolterrain" && h.otbmFloor === 7, "hunt sem otbm/floor");
  must(JSON.stringify(h.otbmSpawn) === JSON.stringify({ x: 1068, y: 1002, z: 7 }) &&
    JSON.stringify(h.otbmMobBounds) === JSON.stringify({ x: 1069, y: 998, w: 11, h: 11, z: 7 }),
    "playerspawn/spawnradius da hunt divergentes");
  must(h.avgHp === 8580 && h.avgExp === 6526 && h.avgDamage === 468 && h.avgArmor === 69,
    "médias Canary da hunt divergentes");

  const src = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
  must(src.includes('"ingol-terrain":{monsters:["harpy","crape-man","liodile","boar-man","carnivostrich"]'),
    "servidor sem HUNTS de ingol-terrain");
  const auth = { kind: "hunt", huntId: "ingol-terrain", ended: false, mobs: [], pendingSpawns: [],
    spawnPool: [], spawnIds: ["srv-i1", "srv-i2", "srv-i3"], pack: 3, wave: 0,
    gridW: 30, gridH: 30, spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
    clock: Date.now(), rngState: 424242, fiendishChance: 0, influencedChance: 0 };
  engine.spawnHuntWave(auth, Date.now());
  must(auth.spawnPool.length === 5 && MOBS.every((s) => auth.spawnPool.includes(s)),
    "pool online não inclui as 5 criaturas: " + JSON.stringify(auth.spawnPool));
}

/* ---------------- 3) loot completo + catálogo ---------------- */
{
  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["gamedata.js", "soulwar.js", "yasir-prices.js", "hard-hunts.js",
    "patch_imbuement.js", "hardcore-library.js", "feast-of-souls.js",
    "deepling-bosses.js", "buried-cathedral.js", "ingol-terrain.js", "accessorydata.js",
    "weapondata.js", "weapons.js", "supply-stash-data.js"])
    vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
  const items = vm.runInContext("window.GAMEDATA.items", ctx);
  for (const slug of MOBS) {
    const m = engine.MONSTERS[slug];
    must(m && Array.isArray(m.loot) && m.loot.length > 0, slug + " sem loot no servidor");
    must(fs.existsSync(path.join(game, "assets", "mob", slug + ".png")),
      slug + " sem spritesheet");
    for (const l of m.loot) {
      const it = items[l.item];
      must(it, slug + ": item de loot fora do catálogo: " + l.item);
      must((Number(it.npcSell) > 0 || Number(it.sell) > 0),
        slug + ": loot sem preço (autoseller pularia): " + l.item);
    }
  }
  must(items["harpy-feathers"] && items["harpy-feathers"].sell === 730, "harpy-feathers sem sell 730");
  must(items["crab-man-claws"] && items["crab-man-claws"].sell === 550, "crab-man-claws sem sell 550");
  must(items["liodile-fang"] && items["liodile-fang"].sell === 480, "liodile-fang sem sell 480");
  must(items["boar-man-hoof"] && items["boar-man-hoof"].sell === 600, "boar-man-hoof sem sell 600");
  must(items["carnivostrich-feather"] && items["carnivostrich-feather"].sell === 630,
    "carnivostrich-feather sem sell 630");
  for (const slug of ["harpy-feathers", "crab-man-claws", "liodile-fang", "boar-man-hoof", "carnivostrich-feather"])
    must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")), slug + " sem sprite de item");
}

/* ---------------- 4) missão 250 kills + catálogo ---------------- */
{
  const src = fs.readFileSync(path.join(js, "ingol-terrain.js"), "utf8");
  must(src.includes('MISSION_DEFS["ingol-terrain"]'), "missão de Ingol Terrain ausente");
  const targets = [...src.matchAll(/monster: "([a-z-]+)", target: (\d+)/g)];
  const total = targets.reduce((a, t) => a + Number(t[2]), 0);
  must(total === 250 && targets.length === 5, "missão deveria somar 250 kills em 5 tasks: " + total);
  const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
  must(uiSrc.includes('"HUNTS 250+"') && uiSrc.includes('"ingol-terrain"'),
    "ui.js sem ingol-terrain na seção HUNTS 250+");
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  must(html.includes("ingol-terrain.js?v=ingol-v1") && html.includes("js/ui.js?v="),
    "cache-busts do Ingol Terrain ausentes no index");
}

console.log("ok: ingol terrain (mapa + hunt 250+ + loot Canary + missão 250 kills)");
