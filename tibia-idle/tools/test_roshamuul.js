/* Regressão: Roshamuul (hunt 250+ — Guzzlemaw, Frazzlemaw, Silencer).
 *
 * 1. OTBM publicado em game/maps (byte-igual ao beta-maps) com piso z=7:
 *    centerroom {1073,1001,7}, playerspawn {1069,1004,7} e spawnradius
 *    {1069,998,7}..{1079,1005,7} com chão.
 * 2. Hunt 250+ com as 3 criaturas do Canary e spawn 40/40/20 (pesos
 *    escalados x1000/x100 pro roll inteiro) + miniboss raro Mawhawk
 *    (0,01% por slot = 1/10001, sempre dropa 1x Dream Matter no
 *    Reward Chest).
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
  must(JSON.stringify(h.bossMobs) === JSON.stringify(["mawhawk"]),
    "bossMobs sem o miniboss mawhawk: " + JSON.stringify(h.bossMobs));
  must(h.spawnWeights && h.spawnWeights.guzzlemaw === 4000 &&
    h.spawnWeights.frazzlemaw === 4000 && h.spawnWeights.silencer === 2000 &&
    h.spawnWeights.mawhawk === 1,
    "spawnWeights escalados (4000/4000/2000/1 = 0,01% mawhawk) ausentes");
  must(h.otbm === "roshamuul" && h.otbmFloor === 7, "hunt sem otbm/floor");
  must(JSON.stringify(h.otbmSpawn) === JSON.stringify({ x: 1069, y: 1004, z: 7 }) &&
    JSON.stringify(h.otbmMobBounds) === JSON.stringify({ x: 1069, y: 998, w: 11, h: 8, z: 7 }),
    "playerspawn/spawnradius da hunt divergentes");
  must(h.avgHp === 5280 && h.avgExp === 4936 && h.avgDamage === 423 && h.avgArmor === 73,
    "médias Canary ponderadas da hunt divergentes");

  const src = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
  must(src.includes('"roshamuul":{monsters:["guzzlemaw","frazzlemaw","silencer"]'),
    "servidor sem HUNTS de roshamuul");
  must(src.includes('bossMobs:["mawhawk"]') &&
    src.includes('mawhawk:1'),
    "servidor sem mawhawk em bossMobs/peso 1");
  const auth = { kind: "hunt", huntId: "roshamuul", ended: false, mobs: [], pendingSpawns: [],
    spawnPool: [], spawnIds: ["srv-r1", "srv-r2", "srv-r3"], pack: 3, wave: 0,
    gridW: 30, gridH: 30, spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
    clock: Date.now(), rngState: 424242, fiendishChance: 0, influencedChance: 0 };
  engine.spawnHuntWave(auth, Date.now());
  must(auth.spawnPool.length === 4 && MOBS.every((s) => auth.spawnPool.includes(s)) &&
    auth.spawnPool.includes("mawhawk"),
    "pool online não inclui as 3 criaturas + mawhawk: " + JSON.stringify(auth.spawnPool));

  const counts = { guzzlemaw: 0, frazzlemaw: 0, silencer: 0, mawhawk: 0 };
  const sample = { kind: "hunt", huntId: "roshamuul", rngState: 7 };
  const SAMPLES = 400000;
  for (let i = 0; i < SAMPLES; i++) {
    const slug = engine.pickHuntSpawnSlug(sample);
    counts[slug] = (counts[slug] || 0) + 1;
  }
  // 4000/4000/2000/1 sobre 10001: ~40%/~40%/~20% e ~0,01% de mawhawk.
  must(counts.guzzlemaw > 150000 && counts.guzzlemaw < 170000 &&
    counts.frazzlemaw > 150000 && counts.frazzlemaw < 170000 &&
    counts.silencer > 70000 && counts.silencer < 90000,
    "amostra 40/40/20 fora do esperado: " + JSON.stringify(counts));
  // Esperado ~40 em 400k; faixa larga só garante a taxa de ~0,01%.
  must(counts.mawhawk >= 10 && counts.mawhawk <= 120,
    "taxa do miniboss mawhawk fora de ~0,01%: " + counts.mawhawk);
  const mh = engine.MONSTERS.mawhawk;
  must(mh && mh.looktype === 595, "mawhawk sem def/looktype 595 no MONSTERS");
  const dm = (mh.loot || []).filter((l) => l && l.item === "dream-matter");
  must(dm.length === 1 && dm[0].chance === 100 && dm[0].max === 1,
    "mawhawk sem 1x dream-matter garantido: " + JSON.stringify(mh.loot));
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
  // Miniboss Mawhawk: tabela inteira resolvível no catálogo + sprites.
  {
    const maw = engine.MONSTERS.mawhawk;
    must(fs.existsSync(path.join(game, "assets", "mob", "mawhawk.png")),
      "mawhawk sem spritesheet");
    for (const l of maw.loot) {
      const it = items[l.item];
      must(it, "mawhawk: item de loot fora do catálogo: " + l.item);
      must(fs.existsSync(path.join(game, "assets", "item", l.item + ".png")),
        "mawhawk: loot sem sprite de item: " + l.item);
      const sellable = Number(it.npcSell) > 0 || Number(it.sell) > 0;
      const questy = l.item === "cluster-of-solace" || l.item === "dream-matter" ||
        l.item === "unrealized-dream";
      must(sellable || questy,
        "mawhawk: loot sem preço (autoseller pularia): " + l.item);
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
  const uiSrc = fs.readFileSync(path.join(js, "hunt-sections.js"), "utf8");
  must(uiSrc.includes('"HUNTS 250+"') && uiSrc.includes('"roshamuul"'),
    "hunt-sections.js sem roshamuul na seção HUNTS 250+");
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  must(html.includes("roshamuul.js?v=roshamuul-") && html.includes("js/ui.js?v="),
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

console.log("ok: roshamuul (mapa + hunt 250+ + loot Canary + spawn 40/40/20 + miniboss mawhawk 0,01% + missão 250 kills)");
