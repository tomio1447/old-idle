/* Regressão: The Prison (3 andares, hunts 250+ — mesmo mapa, monstros por andar).
 *
 * 1. OTBM publicado em game/maps (byte-igual ao beta-maps) com piso z=7:
 *    playerspawn {1069,1002,7}, spawnradius {1070,997,7}..{1078,1007,7} e
 *    centermap {1074,1002,7} com chão.
 * 2. 3 hunts 250+ no modal, todas com cat hard, pack 6–10, mesmo otbm/spawn/
 *    mob e as composições de monstros exatas por andar (Canary).
 * 3. Os 8 monstros existem no servidor com stats/loot do Canary
 *    (canarymonsters.json) e o pool online de cada andar inclui todos.
 * 4. Loot: todo item dos 8 monstros está no catálogo (itens novos com
 *    preço oficial da TibiaWiki; trash/quest ficam sell 0).
 * 5. Sprites: PNGs físicos de mobs, de todos os tiles usados pelo mapa e
 *    dos 14 itens de loot novos.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const engine = require("../server/authoritative_engine");
function must(v, m) { if (!v) throw Error(m); }
const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
const game = path.join(root, "game");
const OTBM = require(path.join(js, "otbm.js"));

const FLOORS = [
  { id: "prison-1", mobs: ["lost-soul", "plaguesmith", "demon-outcast", "betrayed-wraith", "dark-torturer"] },
  { id: "prison-2", mobs: ["lost-soul", "hellhound", "demon-outcast", "betrayed-wraith", "dark-torturer", "blightwalker"] },
  { id: "prison-3", mobs: ["lost-soul", "hellhound", "demon-outcast", "betrayed-wraith", "dark-torturer", "blightwalker", "plaguesmith", "juggernaut"] },
];
const ALL_MOBS = [...new Set(FLOORS.flatMap((f) => f.mobs))];

/* ---------------- 1) OTBM publicado + geometria ---------------- */
{
  const beta = fs.readFileSync(path.join(game, "beta-maps", "prisonroshamuul.otbm"));
  const pub = fs.readFileSync(path.join(game, "maps", "prisonroshamuul.otbm"));
  must(beta.equals(pub), "Prison não publica o OTBM (beta-maps ≠ maps)");
  const map = OTBM.read(pub, { z: 7 });
  must(map.sourceBounds.minX === 1063 && map.sourceBounds.minY === 992 &&
    map.sourceBounds.maxX === 1084 && map.sourceBounds.maxY === 1011,
    "bounds do OTBM divergentes: " + JSON.stringify(map.sourceBounds));
  const cell = (x, y) => map.cells[(x - 1063) + "," + (y - 992)];
  const grounded = (x, y) => { const c = cell(x, y); return !!(c && Number(c.g) > 0); };
  must(grounded(1069, 1002), "playerspawn {1069,1002,7} sem chão no OTBM");
  must(grounded(1074, 1002), "centermap {1074,1002,7} sem chão no OTBM");
  must(grounded(1070, 997) && grounded(1078, 1007) &&
    grounded(1078, 997) && grounded(1070, 1007),
    "spawnradius {1070,997}..{1078,1007} com cantos sem chão no OTBM");

  // todo id usado pelo mapa precisa de PNG físico em assets/tiles
  const usedIds = new Set();
  for (const c of Object.values(map.cells)) {
    if (c.g) usedIds.add(c.g);
    for (const it of (c.items || [])) usedIds.add(typeof it === "object" ? it.id : it);
  }
  for (const id of usedIds)
    must(fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
      "tile do prison sem sprite: " + id);
}

/* ---------------- 2/3) hunts (cliente + servidor) ---------------- */
{
  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(js, "gamedata.js"), "utf8"), ctx, { filename: "gamedata.js" });
  vm.runInContext(fs.readFileSync(path.join(js, "prison.js"), "utf8"), ctx, { filename: "prison.js" });
  const hunts = vm.runInContext("window.GAMEDATA.hunts", ctx);
  for (const f of FLOORS) {
    const h = hunts[f.id];
    must(h && h.level === 250 && h.minLevel === 250, f.id + " ausente/sem nível 250+");
    must(h.cat === "hard" && h.pack === 10 && h.packMin === 6 && h.packMax === 10,
      f.id + " sem cat hard/pack");
    must(JSON.stringify(h.monsters) === JSON.stringify(f.mobs),
      f.id + ": monstros divergentes: " + JSON.stringify(h.monsters));
    must(h.otbm === "prisonroshamuul" && h.otbmFloor === 7, f.id + " sem otbm/floor");
    must(JSON.stringify(h.otbmSpawn) === JSON.stringify({ x: 1069, y: 1002, z: 7 }) &&
      JSON.stringify(h.otbmMobBounds) === JSON.stringify({ x: 1070, y: 997, w: 9, h: 11, z: 7 }),
      f.id + ": playerspawn/spawnradius divergentes");
  }
  const avgs = {
    "prison-1": { hp: 6500, exp: 4430, damage: 462, armor: 39 },
    "prison-2": { hp: 6871, exp: 4856, damage: 474, armor: 45 },
    "prison-3": { hp: 8263, exp: 5649, damage: 599, armor: 48 },
  };
  for (const id of Object.keys(avgs)) {
    const h = hunts[id], a = avgs[id];
    must(h.avgHp === a.hp && h.avgExp === a.exp && h.avgDamage === a.damage && h.avgArmor === a.armor,
      id + ": médias Canary divergentes: " + JSON.stringify([h.avgHp, h.avgExp, h.avgDamage, h.avgArmor]));
  }

  const src = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
  must(src.includes('"prison-1":{monsters:["lost-soul","plaguesmith"') &&
    src.includes('"prison-2":{monsters:["lost-soul","hellhound"') &&
    src.includes('"prison-3":{monsters:["lost-soul","hellhound"'),
    "servidor sem HUNTS dos 3 andares da prison");
  must(src.includes('"prison.js"'), "engine não carrega prison.js no sandbox");

  for (const f of FLOORS) {
    const auth = { kind: "hunt", huntId: f.id, ended: false, mobs: [], pendingSpawns: [],
      spawnPool: [], spawnIds: ["srv-p1", "srv-p2", "srv-p3"], pack: 3, wave: 0,
      gridW: 30, gridH: 30, spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
      clock: Date.now(), rngState: 777, fiendishChance: 0, influencedChance: 0 };
    engine.spawnHuntWave(auth, Date.now());
    must(auth.spawnPool.length === f.mobs.length && f.mobs.every((s) => auth.spawnPool.includes(s)),
      f.id + ": pool online não inclui as criaturas do andar: " + JSON.stringify(auth.spawnPool));
  }
}

/* ---------------- 4) monstros Canary + loot no catálogo ---------------- */
{
  const monsters = JSON.parse(fs.readFileSync(path.join(root, "game", "data", "canarymonsters.json"), "utf8"));
  for (const slug of ALL_MOBS)
    must(monsters[slug] && monsters[slug].hp > 0 && Array.isArray(monsters[slug].loot) &&
      monsters[slug].loot.length > 0 && Array.isArray(monsters[slug].skills),
      slug + " sem ficha completa (hp/loot/skills) do Canary");

  const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["gamedata.js", "soulwar.js", "yasir-prices.js", "hard-hunts.js",
    "patch_imbuement.js", "hardcore-library.js", "feast-of-souls.js", "deepling-bosses.js",
    "buried-cathedral.js", "ingol-terrain.js", "roshamuul.js", "prison.js",
    "accessorydata.js", "weapondata.js", "weapons.js", "supply-stash-data.js"])
    vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
  const items = vm.runInContext("window.GAMEDATA.items", ctx);

  const zeroList = new Set(["silver-goblet", "dirty-cape", "slightly-rusted-armor",
    "bunch-of-wheat", "cluster-of-solace", "flask-of-demonic-blood", "explorer-brooch",
    "onyx-arrow"]);
  const loot = new Set();
  for (const slug of ALL_MOBS)
    for (const l of monsters[slug].loot) loot.add(l.item);
  for (const slug of loot) {
    must(items[slug], "item de loot fora do catálogo: " + slug);
    if (!zeroList.has(slug))
      must((Number(items[slug].npcSell) > 0 || Number(items[slug].sell) > 0),
        "loot sem preço (autoseller pularia): " + slug);
  }
  const prices = {
    "unholy-bone": 480, "skeleton-decoration": 3000, "piece-of-royal-steel": 10000,
    "piece-of-hell-steel": 500, "piece-of-draconian-steel": 3000, "demon-dust": 300,
    "golden-figurine": 3000, "bundle-of-cursed-straw": 800, "closed-trap": 75,
  };
  for (const slug of Object.keys(prices))
    must(items[slug] && items[slug].sell === prices[slug],
      slug + " com preço divergente: " + (items[slug] && items[slug].sell));

  for (const slug of ALL_MOBS)
    must(fs.existsSync(path.join(game, "assets", "mob", slug + ".png")),
      "sprite do monstro ausente: " + slug);
  for (const slug of Object.keys(PRISON_LOOT))
    must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
      "sprite do item de loot ausente: " + slug);
}

/* ---------------- 5) modal + index ---------------- */
{
  const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
  must(uiSrc.includes('"HUNTS 250+"') &&
    ["prison-1", "prison-2", "prison-3"].every((id) => uiSrc.includes('"' + id + '"')),
    "ui.js sem os 3 andares da prison na seção HUNTS 250+");
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  must(html.includes("js/prison.js?v=prison-v1") && /js\/ui\.js\?v=/.test(html),
    "cache-busts da prison ausentes no index");
}

/* itens novos do catálogo (para o check de PNG acima) */
const PRISON_LOOT = [
  "silver-goblet", "skeleton-decoration", "slightly-rusted-armor", "unholy-bone",
  "dirty-cape", "piece-of-royal-steel", "piece-of-hell-steel", "piece-of-draconian-steel",
  "demon-dust", "golden-figurine", "bunch-of-wheat", "bundle-of-cursed-straw", "closed-trap",
  "onyx-arrow",
];

console.log("ok: the prison (3 andares 250+ — mesmo mapa, composições Canary por andar, loot e sprites)");
