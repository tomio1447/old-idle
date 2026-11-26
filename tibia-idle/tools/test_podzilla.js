/* Regressão: hunt PODZILLA BOTTOM (categoria HUNTS 400+, última da
 * seção). Quara Looter / Quara Plunderer / Quara Raider (34/33/33),
 * pack 8–12, OTBM próprio z=7.
 * Mapa: game/maps/podzilla_bottom.otbm publicado byte-igual a partir de
 * beta-maps/bossesroom/podzilla_bottom.otbm — 48×50, bounds
 * 1012..1059 × 1016..1065.
 *   playerspawn   {1031,1038,7} — centróide caminhável do respawnradius
 *   respawnradius {1022,1032,7} → {1040,1043,7} (19×12 = 228 sqm; 197
 *                 caminháveis, todas conectadas — células bloqueadas do
 *                 retângulo são puladas pelo seletor, padrão dark-thais)
 * Creature products novos (Yasir): amber-souvenir 850 / resinous-fish-fin
 * 1250 / mantassin-tail 280 / quara-pincers 410. preserved-*-seed são
 * itens de quest sem comprador NPC → sell 0. necklace-of-the-deep: fix
 * sell/npcSell 0→3000 (Rashid) — podzilla-bottom.js carrega depois de
 * deathlings-sunken-temple.js. rift-lance mantém sell 1369 / npcSell
 * 30000 (Rashid — já correto). Stats/loot = dump Canary (wiki lista drops
 * extras não incluídos: ring-of-orange-plasma no looter; spellbook-of-
 * mind-control/quara-eye/demon-shield/demonrage-sword no plunderer;
 * preserved-violet-seed no raider). */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "mobsheetdata.js",
  "accessorydata.js", "deathlings-sunken-temple.js", "warzone9.js",
  "nimmersatt.js", "podzilla-bottom.js", "hunt-sections.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);

const hunt = ctx.GAMEDATA.hunts["podzilla-bottom"];
must(hunt && hunt.name === "Podzilla Bottom", "hunt podzilla-bottom ausente/nome errado");
must(hunt.level === 400 && hunt.minLevel === 400, "nível deve ser 400");
must(hunt.cat === "hard", "cat deve ser hard");
const SPECIES = ["quara-looter", "quara-plunderer", "quara-raider"];
must(JSON.stringify(hunt.monsters) === JSON.stringify(SPECIES), "monstros divergentes");
must(hunt.spawnWeights["quara-looter"] === 34 &&
  hunt.spawnWeights["quara-plunderer"] === 33 &&
  hunt.spawnWeights["quara-raider"] === 33, "spawnWeights 34/33/33 ausente");
must(hunt.pack === 12 && hunt.packMin === 8 && hunt.packMax === 12,
  "pack deve ser 8–12");
must(hunt.otbm === "podzilla_bottom" && hunt.otbmFloor === 7, "OTBM/piso errado");
must(JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1031, y: 1038, z: 7 }),
  "otbmSpawn diverge do playerspawn (centróide)");
must(JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1022, y: 1032, w: 19, h: 12, z: 7 }),
  "respawnradius diverge das coordenadas informadas");

// OTBM publicado: byte-idêntico à origem e só z=7.
const bytes = fs.readFileSync(path.join(game, "maps", "podzilla_bottom.otbm"));
must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", "bossesroom", "podzilla_bottom.otbm"))),
  "OTBM publicado diverge de beta-maps");
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, "andar inesperado no OTBM");
const parsed = OTBM.read(ab, { z: 7 });
const b = parsed.sourceBounds;
must(parsed.w === 48 && parsed.h === 50 && b.minX === 1012 && b.minY === 1016 &&
  b.maxX === 1059 && b.maxY === 1065, "bounds reais do OTBM divergem");
for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
  must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")),
    "tile sem sprite: " + id);
// Todos os ids usados constam no catálogo do editor RME.
{
  const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
  vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
  const unlisted = OTBM.missingTiles(parsed, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0,
    "tiles do podzilla_bottom fora do catálogo RME: " + unlisted.join(", "));
}

// Zonas absolutas → locais; spawn e área de respawn caminháveis/conectadas.
ctx.applyHuntOtbmZones(parsed, hunt);
must(parsed.spawn.x === 19 && parsed.spawn.y === 22, "spawn local errado (esperado 19,22)");
must(parsed.mob.length === 19 * 12, "zona de respawn deve cobrir 19×12 = 228 sqm");
const runtime = OTBM.huntMapFromOtbm(parsed, ctx.TILEFLAGS);
const walkable = (x, y) => runtime.rows[y] && runtime.rows[y][x] &&
  !runtime.leg[runtime.rows[y][x]].bloc;
must(walkable(runtime.spawn.x, runtime.spawn.y), "jogador nasce em célula bloqueada");
const reached = new Set(), queue = [runtime.spawn];
for (let i = 0; i < queue.length; i++) {
  const { x, y } = queue[i], key = x + "," + y;
  if (reached.has(key) || !walkable(x, y)) continue;
  reached.add(key);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    queue.push({ x: x + dx, y: y + dy });
}
must(reached.size === 312, "componente conectado deve ter 312 sqm: " + reached.size);
// O retângulo tem bordas/decor bloqueadas: só as 197 células caminháveis
// precisam estar conectadas (o seletor pula as bloqueadas).
let available = 0, blockedInZone = 0;
for (const c of parsed.mob) {
  if (!walkable(c.x, c.y)) { blockedInZone++; continue; }
  if (reached.has(c.x + "," + c.y)) available++;
}
must(blockedInZone === 228 - 197, "zona deve ter 31 células bloqueadas: " + blockedInZone);
must(available === 197, "zona de respawn não é toda conectada: " + available + "/197");

// Card no modal HUNTS 400+ (último da seção).
const s400 = ctx.HUNT_MODAL_SECTIONS.find((s) => s.title === "HUNTS 400+");
must(s400 && s400.ids[s400.ids.length - 1] === "podzilla-bottom",
  "podzilla-bottom deve ser o último id da categoria HUNTS 400+");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "hard", txt: "400+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">', G: { p: {} } });
vm.runInContext(ui.slice(ui.indexOf("function renderHunts(p)"),
  ui.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="podzilla-bottom"'), "card não renderiza no modal");

// Monstros: dados Canary + sprite compatível com o sheet.
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
const DUMP = {
  "quara-looter": { hp: 11500, exp: 8650, looktype: 1741 },
  "quara-plunderer": { hp: 13500, exp: 10800, looktype: 1758 },
  "quara-raider": { hp: 12500, exp: 8150, looktype: 1759 },
};
for (const slug of hunt.monsters) {
  const md = ctx.MONSTERDATA[slug], sheet = ctx.MOBSHEETS[slug];
  must(md && canary[slug] && md.hp === canary[slug].hp && md.exp === canary[slug].exp &&
    md.looktype === canary[slug].looktype &&
    md.hp === DUMP[slug].hp && md.exp === DUMP[slug].exp &&
    md.looktype === DUMP[slug].looktype,
    slug + ": dados divergentes do Canary");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": sprite incompatível com metadados");
}

// Loot: cada drop registrado no cliente e no servidor com preço e ícone.
// Mesma ordem do loop "Conteúdo novo" da authoritative_engine — patches
// que reprecificam itens compartilhados (necklace-of-the-deep etc.)
// precisam rodar na sequência em que o servidor os carrega.
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js", "book-world.js",
  "sir-leonard.js", "norcferatus-fortress.js", "unhallowed-crypt.js",
  "roost-graveborn.js", "court-warlock.js", "warzone9.js", "nimmersatt.js",
  "brainstealer-boss.js", "mega-magmaoid-boss.js", "dragon-pack-boss.js",
  "podzilla-bottom.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
const lootSlugs = new Set();
for (const slug of hunt.monsters) for (const drop of canary[slug].loot) lootSlugs.add(drop.item);
must(lootSlugs.size === 19, "dump deve somar 19 slugs de loot: " + lootSlugs.size);
for (const slug of lootSlugs) {
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  must(client && server && client.cid === server.cid &&
    Number.isFinite(client.npcSell ?? client.sell) &&
    (client.npcSell ?? client.sell) === (server.npcSell ?? server.sell),
    slug + ": loot sem registro/preço consistente");
  const icon = fs.readFileSync(path.join(game, "assets", "item", slug + ".png"));
  must(icon.readUInt32BE(16) <= 64 && icon.readUInt32BE(20) <= 64,
    slug + ": ícone inválido");
}
// Preços oficiais já validados: Yasir p/ os creature products novos,
// sementes sem comprador → 0, necklace-of-the-deep 3000 (Rashid — fix
// sobre o sell 0 do deathlings), preços dos itens compartilhados.
for (const [slug, price] of Object.entries({
  "amber-souvenir": 850, "resinous-fish-fin": 1250,
  "mantassin-tail": 280, "quara-pincers": 410,
  "preserved-light-blue-seed": 0, "preserved-violet-seed": 0,
  "preserved-purple-seed": 0, "necklace-of-the-deep": 3000,
  "red-gem": 1000, "blue-gem": 5000, "glacier-kilt": 11000,
  "glacier-robe": 11000, "crystal-crossbow": 35000,
  "rift-lance": 30000, "haunted-blade": 8000, "skull-staff": 6000,
  "crystalline-armor": 16000, "abyss-hammer": 20000,
  "platinum-coin": 100,
})) for (const items of [catalog.GAMEDATA.items, E.ITEMS])
  must(items[slug] && (items[slug].npcSell ?? items[slug].sell) === price,
    slug + ": preço oficial incorreto");

// Servidor autoritativo: definição da hunt e pack 8–12 só com as espécies.
must(E.HUNTS["podzilla-bottom"] && E.HUNTS["podzilla-bottom"].packMin === 8 &&
  E.HUNTS["podzilla-bottom"].packMax === 12 &&
  JSON.stringify(E.HUNTS["podzilla-bottom"].monsters) === JSON.stringify(SPECIES),
  "HUNTS do servidor sem podzilla-bottom ou pack errado");
const desc = { kind: "hunt", huntId: "podzilla-bottom", instanceMode: "non-pvp",
  activeCharacterId: "1", state: { hunt, mobs: [], pendingSpawns: [], players: [] },
  members: [{ id: "1", p: { id: "1", voc: "knight", level: 400, hp: 12000, mp: 1200,
    gold: 0, skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } }] };
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const d = E.initializeAuthority(JSON.parse(JSON.stringify(desc)),
    "test-podzilla-" + i, Date.now());
  E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
  const n = (d.authority.pendingSpawns || []).length;
  must(n >= 8 && n <= 12, "pack autoritativo fora de 8–12: " + n);
  must(d.authority.pendingSpawns.every((sp) => SPECIES.includes(sp.mob.slug)),
    "monstro fora da hunt no pack autoritativo");
  seen.add(n);
}

// index.html carrega o patch depois de deathlings-sunken-temple.js (fix
// compartilhado do necklace-of-the-deep) e de nimmersatt.js.
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/podzilla-bottom.js?v="), "podzilla-bottom.js não carregado no index");
must(html.indexOf("js/deathlings-sunken-temple.js") < html.indexOf("js/podzilla-bottom.js"),
  "podzilla-bottom.js deve carregar depois de deathlings-sunken-temple.js");
must(html.indexOf("js/nimmersatt.js") < html.indexOf("js/podzilla-bottom.js"),
  "podzilla-bottom.js deve carregar depois de nimmersatt.js");

console.log("OK — Podzilla Bottom: OTBM 48×50 z=7, " + available +
  " sqm de respawn conectado, pack " + Math.min(...seen) + "–" + Math.max(...seen) +
  ", " + lootSlugs.size + " itens de loot com sprite e preço, HUNTS 400+.");
