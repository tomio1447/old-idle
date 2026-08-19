/* Regressão: Roshamuul (hunt 250+ — Guzzlemaw, Frazzlemaw, Silencer).
 *
 * 1. OTBM publicado em game/maps (byte-igual ao beta-maps) com piso z=7:
 *    centerroom {1073,1001,7}, playerspawn {1069,1004,7} e spawnradius
 *    {1069,998,7}..{1079,1005,7} com chão.
 * 2. Hunt 250+ com as 3 criaturas do Canary e spawn 40/40/20.
 * 3. Loot: creature products no catálogo com preço NPC da TibiaWiki.
 * 4. Missão 250 kills (100+100+50). Catálogo HUNTS 250+ lista a hunt.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const engine = require("../server/authoritative_engine");
function must(v, m) { if (!v) throw Error(m); }
const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
const game = path.join(root, "game");
const OTBM = require(path.join(js, "otbm.js"));

const MOBS = ["guzzlemaw", "frazzlemaw", "silencer"];

const beta = fs.readFileSync(path.join(game, "beta-maps", "roshamuul.otbm"));
const pub = fs.readFileSync(path.join(game, "maps", "roshamuul.otbm"));
must(beta.equals(pub), "Roshamuul não publica o OTBM (beta-maps ≠ maps)");
const map = OTBM.read(pub, { z: 7 });
must(map.sourceBounds.minX === 1064 && map.sourceBounds.minY === 992 &&
  map.sourceBounds.maxX === 1084 && map.sourceBounds.maxY === 1011,
  "bounds do OTBM divergentes: " + JSON.stringify(map.sourceBounds));
const cell = (x, y) => map.cells[(x - 1064) + "," + (y - 992)];
const grounded = (x, y) => { const c = cell(x, y); return !!(c && Number(c.g) > 0); };
must(grounded(1069, 1004), "playerspawn {1069,1004,7} sem chão no OTBM");
must(grounded(1073, 1001), "centerroom {1073,1001,7} sem chão no OTBM");
must(grounded(1069, 998) && grounded(1079, 1005),
  "spawnradius {1069,998}..{1079,1005} com cantos sem chão no OTBM");

const usedIds = new Set();
for (const c of Object.values(map.cells)) {
  if (c.g) usedIds.add(c.g);
  for (const it of (c.items || [])) usedIds.add(typeof it === "object" ? it.id : it);
}
for (const id of usedIds) {
  must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
}

{
  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), ctx, { filename: "gamedata.js" });
  vm.runInContext(fs.readFileSync(path.join(js, "roshamuul.js"), "utf8"), ctx, { filename: "roshamuul.js" });
  const h = vm.runInContext('window.GAMEDATA.hunts.roshamuul', ctx);
  must(h && h.name === "Roshamuul" && h.level === 250 && h.minLevel === 250,
    "hunt roshamuul ausente/sem nível 250+");
  must(h.cat === "hard" && h.pack === 10 && h.packMin === 6 && h.packMax === 10, "hunt sem cat hard/pack");
  must(JSON.stringify(h.monsters) === JSON.stringify(MOBS),
    "monstros da hunt divergentes do Canary");
  must(h.spawnWeights && h.spawnWeights.guzzlemaw === 40 &&
    h.spawnWeights.frazzlemaw === 40 && h.spawnWeights.silencer === 20,
    "spawnWeights 40/40/20 ausentes");
  must(h.otbm === "roshamuul" && h.otbmFloor === 7, "hunt sem otbm/floor");
  must(JSON.stringify(h.otbmSpawn) === JSON.stringify({ x: 1069, y: 1004, z: 7 }) &&
    JSON.stringify(h.otbmMobBounds) === JSON.stringify({ x: 1069, y: 998, w: 11, h: 8, z: 7 }),
    "playerspawn/spawnradius da hunt divergentes");
  must(h.avgHp === 5280 && h.avgExp === 4936 && h.avgDamage === 423 && h.avgArmor === 73,
    "médias Canary ponderadas da hunt divergentes");

  const src = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
  must(src.includes('"roshamuul":{monsters:["guzzlemaw","frazzlemaw","silencer"]'),
    "servidor sem HUNTS de roshamuul");
  const auth = { kind: "hunt", huntId: "roshamuul", ended: false, mobs: [], pendingSpawns: [],
    spawnPool: [], spawnIds: ["srv-r1", "srv-r2", "srv-r3"], pack: 3, wave: 0,
    gridW: 30, gridH: 30, spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
    clock: Date.now(), rngState: 424242, fiendishChance: 0, influencedChance: 0 };
  engine.spawnHuntWave(auth, Date.now());
  must(auth.spawnPool.length === 3 && MOBS.every((s) => auth.spawnPool.includes(s)),
    "pool online não inclui as 3 criaturas: " + JSON.stringify(auth.spawnPool));

  const counts = { guzzlemaw: 0, frazzlemaw: 0, silencer: 0 };
  const sample = { kind: "hunt", huntId: "roshamuul", rngState: 7 };
  for (let i = 0; i < 1000; i++) {
    const slug = engine.pickHuntSpawnSlug(sample);
    counts[slug] = (counts[slug] || 0) + 1;
  }
  must(counts.guzzlemaw > 300 && counts.guzzlemaw < 500 &&
    counts.frazzlemaw > 300 && counts.frazzlemaw < 500 &&
    counts.silencer > 120 && counts.silencer < 280,
    "amostra 40/40/20 fora do esperado: " + JSON.stringify(counts));
}

{
  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["gamedata.js", "soulwar.js", "yasir-prices.js", "hard-hunts.js",
    "patch_imbuement.js", "hardcore-library.js", "feast-of-souls.js",
    "deepling-bosses.js", "buried-cathedral.js", "ingol-terrain.js", "roshamuul.js",
    "accessorydata.js", "weapondata.js", "weapons.js", "supply-stash-data.js"])
    vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
  const items = vm.runInContext("window.GAMEDATA.items", ctx);
  for (const slug of MOBS) {
    const m = engine.MONSTERS[slug];
    must(m && Array.isArray(m.loot) && m.loot.length > 0, slug + " sem loot no servidor");
    must(m.looktype === (slug === "guzzlemaw" ? 584 : slug === "frazzlemaw" ? 594 : 585),
      slug + " looktype diferente do Canary: " + m.looktype);
    must(fs.existsSync(path.join(game, "assets", "mob", slug + ".png")),
      slug + " sem spritesheet");
    for (const l of m.loot) {
      const it = items[l.item];
      must(it, slug + ": item de loot fora do catálogo: " + l.item);
      const sellable = Number(it.npcSell) > 0 || Number(it.sell) > 0;
      const questy = l.item === "cluster-of-solace" || l.item === "crystal-rubbish";
      must(sellable || questy,
        slug + ": loot sem preço (autoseller pularia): " + l.item);
    }
  }
  must(items["frazzle-tongue"] && items["frazzle-tongue"].sell === 700, "frazzle-tongue sem sell 700");
  must(items["frazzle-skin"] && items["frazzle-skin"].sell === 400, "frazzle-skin sem sell 400");
  must(items["silencer-claws"] && items["silencer-claws"].sell === 390, "silencer-claws sem sell 390");
  must(items["silencer-resonating-chamber"] && items["silencer-resonating-chamber"].sell === 600,
    "silencer-resonating-chamber sem sell 600");
  for (const slug of ["frazzle-tongue", "frazzle-skin", "silencer-claws", "silencer-resonating-chamber"])
    must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")), slug + " sem sprite de item");
}

{
  const src = fs.readFileSync(path.join(js, "roshamuul.js"), "utf8");
  must(src.includes("MISSION_DEFS.roshamuul"), "missão de Roshamuul ausente");
  const targets = [...src.matchAll(/monster: "([a-z-]+)", target: (\d+)/g)];
  const total = targets.reduce((a, t) => a + Number(t[2]), 0);
  must(total === 250 && targets.length === 3, "missão deveria somar 250 kills em 3 tasks: " + total);
  const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
  must(uiSrc.includes('"HUNTS 250+"') && uiSrc.includes('"roshamuul"'),
    "ui.js sem roshamuul na seção HUNTS 250+");
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  must(html.includes("roshamuul.js?v=roshamuul-v1") && html.includes("js/ui.js?v="),
    "cache-busts do Roshamuul ausentes no index");
}

must(engine.MONSTERS.guzzlemaw && engine.MONSTERS.guzzlemaw.skills &&
  engine.MONSTERS.guzzlemaw.skills.some((s) => s && s.length === 8),
  "Guzzlemaw sem wave length=8 do Canary");
must(engine.MONSTERS.frazzlemaw && engine.MONSTERS.frazzlemaw.skills &&
  engine.MONSTERS.frazzlemaw.skills.some((s) => s && s.length === 5),
  "Frazzlemaw sem wave length=5 do Canary");
must(engine.MONSTERS.silencer && engine.MONSTERS.silencer.skills &&
  engine.MONSTERS.silencer.skills.some((s) => s === "silencer skill reducer" ||
    (s && String(s.n || s.name || "").toLowerCase().includes("silencer"))),
  "Silencer sem skill reducer do Canary");

console.log("ok: roshamuul (mapa + hunt 250+ + loot Canary + spawn 40/40/20 + missão 250 kills)");
