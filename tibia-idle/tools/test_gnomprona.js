/* Regressão: hunt GNOMPRONA 400+ (Monster Graveyard — Weagon 1) e o
 * sistema de Hazard Level por conta. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game"), js = path.join(game, "js");
const OTBM = require(path.join(js, "otbm.js"));
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = { window: {}, console, Math, Date, Map, Set };
ctx.window = ctx; ctx.G = { p: { hazardLevel: 5, hazardSel: 3 } };
vm.createContext(ctx);
for (const file of ["gamedata.js", "monsterdata.js", "gnomprona.js", "bloodrotten.js"])
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });

for (const id of ["gnomprona-weagon2", "gnomprona-weagon3"])
  must(ctx.GAMEDATA.hunts[id] && ctx.GAMEDATA.hunts[id].gnomprona, "nova hunt Gnomprona ausente: " + id);
const hunt = ctx.GAMEDATA.hunts["gnomprona-weagon1"];
must(hunt && hunt.gnomprona === true && hunt.level === 400,
  "hunt gnomprona-weagon1 não registrada como 400+ gnomprona");
must(hunt.pack === 5 && hunt.packMin === 5 && hunt.packMax === 5,
  "pack base gnomprona deve ser 5 (+1 por hazard level)");
must(JSON.stringify(hunt.monsters) ===
  JSON.stringify(["nighthunter", "stalking-stalk", "sulphider", "sulphur-spouter", "undertaker"]),
  "monstros da Weagon 1 divergentes");
must((hunt.bossMobs || []).includes("plunder-patriarch"),
  "plunder-patriarch deve ser miniboss (bossMobs), fora da missão");
must(hunt.otbm === "gnomprona_weagon1" && hunt.otbmFloor === 7,
  "hunt não aponta para o OTBM gnomprona_weagon1");
must(JSON.stringify(hunt.otbmFovBounds) ===
  JSON.stringify({ x: 1007, y: 1015, w: 38, h: 26, z: 7 }) &&
  JSON.stringify(hunt.otbmSpawn) === JSON.stringify({ x: 1024, y: 1027, z: 7 }) &&
  JSON.stringify(hunt.otbmMobBounds) === JSON.stringify({ x: 1016, y: 1025, w: 11, h: 6, z: 7 }),
  "FOV/spawn/zona da Weagon 1 divergentes do centermap/radiuspawn");

// OTBM publicado: 38×26 com os bounds declarados.
const buf = fs.readFileSync(path.join(game, "maps", "gnomprona_weagon1.otbm"));
const map = OTBM.read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { z: 7 });
must(map.w === 38 && map.h === 26 &&
  map.sourceBounds.minX === 1007 && map.sourceBounds.minY === 1015 &&
  map.sourceBounds.maxX === 1044 && map.sourceBounds.maxY === 1040,
  "OTBM gnomprona_weagon1: bounds reais divergem do declarado");

// Hazard: unlock/active/pack/plunder (cliente).
must(ctx.gnompronaHazardUnlock(ctx.G.p) === 5 &&
  ctx.gnompronaHazardActive(ctx.G.p) === 3 && ctx.gnompronaPackBonus() === 3,
  "hazard unlock/active/packBonus fora do esperado");
must(Math.abs(ctx.gnompronaPlunderChance(0) - 0.001) < 1e-9 &&
  Math.abs(ctx.gnompronaPlunderChance(5) - 0.006) < 1e-9 &&
  Math.abs(ctx.gnompronaPlunderChance(10) - 0.11) < 1e-9,
  "curva de chance do Plunder Patriarch divergente");

// Missão (game.js): 5.000 de cada monstro → 1× primal-bag.
const gsrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
must(/"gnomprona-weagon1":\s*{[\s\S]*?monster:\s*"undertaker",\s*target:\s*5000/.test(gsrc),
  "missão gnomprona-weagon1 sem tasks de 5000 por monstro");
must(/slug:\s*"primal-bag",\s*count:\s*1/.test(gsrc),
  "recompensa da missão deve ser 1× primal-bag");
must(ctx.GAMEDATA.items["primal-bag"] && ctx.GAMEDATA.items["primal-bag"].cid === 39546,
  "item primal-bag ausente ou cid errado");
must(fs.existsSync(path.join(game, "assets", "item", "primal-bag.png")),
  "sprite primal-bag.png ausente");
for (const slug of hunt.monsters.concat(["plunder-patriarch"])) {
  must(ctx.GAMEDATA.monsters[slug] || ctx.MONSTERDATA[slug],
    "monstro sem definição: " + slug);
  must(fs.existsSync(path.join(game, "assets", "mob", slug + ".png")),
    "sprite ausente: " + slug);
}

// Seção no modal HUNTS.
const sections = fs.readFileSync(path.join(js, "hunt-sections.js"), "utf8");
must(/GNOMPRONA 400\+\s*"?\s*,?\s*ids:\s*\[\s*"gnomprona-weagon1"/.test(sections) ||
  sections.includes('"gnomprona-weagon1"'),
  "seção GNOMPRONA 400+ ausente em hunt-sections.js");

// Motor autoritativo: entrada + pack hazard + plunder.
const E = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));
const mk = (lvl, sel) => ({ id: "1", p: { id: "1", voc: "knight", level: 400,
  hp: 5000, mp: 500, gold: 0, hazardLevel: lvl, hazardSel: sel,
  skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
  ml: 10, config: {}, equip: {}, supplies: {}, stamina: 54000 } });
const desc = { kind: "hunt", huntId: "gnomprona-weagon1", instanceMode: "non-pvp",
  activeCharacterId: "1", members: [mk(4, 3)],
  state: { hunt: hunt, mobs: [], pendingSpawns: [], players: [] } };
const d = E.initializeAuthority(desc, "test-gnom", Date.now());
must(d.authority.hazardLevel === 3, "auth.hazardLevel != sel travado (3)");
E.spawnHuntWave(d.authority, Date.now() + 1000, { force: true });
must((d.authority.pendingSpawns || []).length === 8,
  "pack hazard != 5+3");
must(d.authority.pendingSpawns.every((sp) =>
  sp.mob.slug === "plunder-patriarch" ? !(sp.mob.hazard > 0) : sp.mob.hazard === 3),
  "flags mob.hazard erradas (miniboss não pode ser hazard)");
d.authority.hazardLevel = 12;
let plunder = 0;
for (let i = 0; i < 2000; i++) if (E.pickHuntSpawnSlug(d.authority) === "plunder-patriarch") plunder++;
must(plunder > 80 && plunder < 400, "plunder@12 ~11% — ficou " + plunder);
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js", "core.js",
  "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js", "yasir-prices.js", "hardcore-library.js",
  "magma-bubble.js", "gnomprona.js", "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(js, "mobsheetdata.js"), "utf8"), ctx);
vm.runInContext(sections, ctx);
ctx.addEventListener = () => {};
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);
const canary = JSON.parse(fs.readFileSync(path.join(game, "data", "canarymonsters.json"), "utf8"));
const expected = [
  { id: "gnomprona-weagon2", name: "Crystal Enigma", bounds: [1007, 1016, 36, 26],
    spawn: [1022, 1027], mobs: [1016, 1025, 12, 7],
    monsters: ["headpecker", "mantosaurus", "mercurial-menace", "noxious-ripptor", "shrieking-cry-stal"] },
  { id: "gnomprona-weagon3", name: "Sparkling Pools", bounds: [1008, 1013, 25, 22],
    spawn: [1020, 1024], mobs: [1016, 1020, 9, 10],
    monsters: ["emerald-tortoise", "gore-horn", "gorerilla", "hulking-prehemoth", "sabretooth"] },
];
for (const spec of expected) {
  const h = ctx.GAMEDATA.hunts[spec.id];
  must(h.name.includes(spec.name) && h.level === 400 && h.minLevel === 400, spec.id + ": nome/nível incorreto");
  must(JSON.stringify(h.monsters) === JSON.stringify(spec.monsters), spec.id + ": monstros divergentes");
  must(h.pack === 5 && h.packMin === 5 && h.packMax === 5 && h.respawn === hunt.respawn && h.gnomprona,
    spec.id + ": respawn deve seguir a Weagon 1");
  must(h.bossMobs.includes("plunder-patriarch") && h.spawnWeights["plunder-patriarch"] === 0 &&
    spec.monsters.every((slug) => h.spawnWeights[slug] === 20), spec.id + ": pesos/miniboss incorretos");
  must(ctx.HUNT_MODAL_SECTIONS.find((section) => section.title === "GNOMPRONA 400+").ids.includes(spec.id),
    spec.id + ": ausente no modal");
  must([h.otbmFovBounds.x, h.otbmFovBounds.y, h.otbmFovBounds.w, h.otbmFovBounds.h].join() === spec.bounds.join() &&
    [h.otbmSpawn.x, h.otbmSpawn.y].join() === spec.spawn.join() &&
    [h.otbmMobBounds.x, h.otbmMobBounds.y, h.otbmMobBounds.w, h.otbmMobBounds.h].join() === spec.mobs.join() &&
    h.otbmFloor === 7 && h.otbmSpawn.z === 7 && h.otbmMobBounds.z === 7, spec.id + ": posições incorretas");
  const bytes = fs.readFileSync(path.join(game, "maps", h.otbm + ".otbm"));
  must(bytes.equals(fs.readFileSync(path.join(game, "beta-maps", h.otbm + ".otbm"))), spec.id + ": OTBM publicado diverge da origem");
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = OTBM.read(ab, { z: 7 });
  for (let z = 0; z < 16; z++) must(OTBM.read(ab, { z }).z === 7, spec.id + ": andar inesperado no OTBM");
  must(parsed.w === spec.bounds[2] && parsed.h === spec.bounds[3] &&
    parsed.sourceBounds.minX === spec.bounds[0] && parsed.sourceBounds.minY === spec.bounds[1], spec.id + ": recorte inválido");
  for (const cell of Object.values(parsed.cells)) for (const id of [cell.g, ...cell.items])
    must(!id || fs.existsSync(path.join(game, "assets", "tiles", id + ".png")), spec.id + ": tile sem sprite " + id);
  ctx.applyHuntOtbmZones(parsed, h);
  must(parsed.mob.length === spec.mobs[2] * spec.mobs[3] &&
    parsed.spawn.x === spec.spawn[0] - spec.bounds[0] && parsed.spawn.y === spec.spawn[1] - spec.bounds[1],
    spec.id + ": loader não aplica as zonas/spawn da hunt");
  const runtime = OTBM.huntMapFromOtbm(parsed, ctx.TILEFLAGS);
  const walkable = (x, y) => runtime.rows[y] && runtime.rows[y][x] && !runtime.leg[runtime.rows[y][x]].bloc;
  must(walkable(runtime.spawn.x, runtime.spawn.y), spec.id + ": jogador nasce em célula bloqueada");
  const reached = new Set(), queue = [runtime.spawn];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i], key = x + "," + y;
    if (reached.has(key) || !walkable(x, y)) continue;
    reached.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push({ x: x + dx, y: y + dy });
  }
  let available = 0;
  for (let y = spec.mobs[1]; y < spec.mobs[1] + spec.mobs[3]; y++)
    for (let x = spec.mobs[0]; x < spec.mobs[0] + spec.mobs[2]; x++)
      if (reached.has((x - spec.bounds[0]) + "," + (y - spec.bounds[1]))) available++;
  must(available >= 18, spec.id + ": respawn sem espaço conectado para pack máximo e jogador");
  const authority = E.initializeAuthority({ ...desc, huntId: spec.id,
    state: { hunt: h, mobs: [], pendingSpawns: [], players: [] } }, "test-" + spec.id, Date.now()).authority;
  E.spawnHuntWave(authority, Date.now() + 1000, { force: true });
  must(authority.hazardLevel === 3 && authority.pendingSpawns.length === 8 &&
    authority.pendingSpawns.every((sp) => spec.monsters.includes(sp.mob.slug) ? sp.mob.hazard === 3 : sp.mob.slug === "plunder-patriarch"),
    spec.id + ": pack/hazard/spawn autoritativo incorreto");
  for (const slug of spec.monsters) {
    const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png")), sheet = ctx.MOBSHEETS[slug];
    must(sheet && png.readUInt32BE(16) === sheet.cw * sheet.cols && png.readUInt32BE(20) === sheet.ch * sheet.rows,
      slug + ": sprite incompatível com metadados");
    must(ctx.MONSTERDATA[slug].hp === canary[slug].hp && ctx.MONSTERDATA[slug].looktype === canary[slug].looktype,
      slug + ": dados divergentes do Canary");
    for (const drop of canary[slug].loot) {
      const client = catalog.GAMEDATA.items[drop.item], server = E.ITEMS[drop.item];
      must(client && server && client.cid === server.cid &&
        (client.npcSell ?? client.sell) === (server.npcSell ?? server.sell) && Number.isFinite(client.npcSell ?? client.sell),
        drop.item + ": loot sem registro/preço consistente");
      const icon = fs.readFileSync(path.join(game, "assets", "item", drop.item + ".png"));
      must(icon.readUInt32BE(16) <= 64 && icon.readUInt32BE(20) <= 64, drop.item + ": ícone inválido");
    }
  }
  console.log("OK — " + h.name + ": OTBM, " + available + " sqm de respawn conectado, sprites, loot e pack hazard.");
}
const huntUiSource = fs.readFileSync(path.join(js, "ui.js"), "utf8"), huntList = {};
Object.assign(ctx, { $: () => huntList, $$: () => [], HUNT_UI: { busca: "" },
  huntRisk: () => ({ cls: "low", txt: "400+" }), fmt: String,
  mobImg: (slug) => '<img src="assets/mob/' + slug + '.png">' });
vm.runInContext(huntUiSource.slice(huntUiSource.indexOf("function renderHunts(p)"),
  huntUiSource.indexOf("function openHuntsModal()")), ctx);
ctx.renderHunts(ctx.G.p);
for (const id of ["gnomprona-weagon1", "gnomprona-weagon2", "gnomprona-weagon3"])
  must(huntList.innerHTML.includes('data-hunt="' + id + '"'), id + ": card não renderiza no modal");
ctx.HUNT_UI.busca = "Sparkling Pools";
ctx.renderHunts(ctx.G.p);
must(huntList.innerHTML.includes('data-hunt="gnomprona-weagon3"') && !huntList.innerHTML.includes('data-hunt="gnomprona-weagon2"'),
  "busca do modal não encontra Sparkling Pools");
for (const [slug, price] of Object.entries({
  "headpecker-beak": 2800, "headpecker-feather": 1300, "mantosaurus-jaw": 2800,
  "mercurial-wing": 2500, "ripptor-scales": 1200, "ripptor-claw": 2600, "cry-stal": 3200,
  "emerald-tortoise-shell": 2150, "gore-horn": 2900, "gorerilla-mane": 2750,
  "gorerilla-tail": 2650, "prehemoth-horns": 3000, "prehemoth-claw": 2300, "sabretooth-fur": 2500,
})) must(catalog.GAMEDATA.items[slug].npcSell === price && E.ITEMS[slug].npcSell === price, slug + ": preço oficial incorreto");
for (const items of [catalog.GAMEDATA.items, E.ITEMS]) must(items["wooden-spellbook"].s === "shield" &&
  items["wooden-spellbook"].mag === 2 && items["wooden-spellbook"].npcSell === 12000,
  "wooden spellbook do loot não pode ser sobrescrito como item genérico");
const spellbookPlayer = { level: 400, voc: "druid", bag: { "wooden-spellbook": 1 }, equip: {},
  itemInstances: [{ id: "wooden-test", slug: "wooden-spellbook", loc: "bag", tier: 0 }] };
must(E.equipFromContainerAuth(spellbookPlayer, "wooden-spellbook", "bag").ok &&
  spellbookPlayer.equip.shield.item === "wooden-spellbook", "wooden spellbook do loot não equipa no servidor");
const pool = ["arboreal-tome", "arboreal-crown", "spiritthorn-armor", "spiritthorn-helmet",
  "alicorn-headguard", "alicorn-quiver", "arcanomancer-regalia", "arcanomancer-folio",
  "charged-arcanomancer-sigil", "charged-arboreal-ring", "charged-alicorn-ring", "charged-spiritthorn-ring"];
let account = { cosmetics: { hazard: { kills: 20, level: 5, sel: 3 } } };
catalog.accountApiConfigured = () => true;
catalog.sessionAccount = () => account;
catalog.sessionToken = () => null;
catalog.sessionStorage = { setItem: (key, value) => { account = JSON.parse(value); } };
const first = { hazardLevel: 1 }, second = { hazardLevel: 1 };
must(catalog.gnompronaHazardUnlock(first) === 5, "abates abaixo do máximo não devem liberar hazard");
catalog.gnompronaSetHazard(first, 4);
must(catalog.gnompronaHazardActive(first) === 4 && catalog.gnompronaHazardActive(second) === 4,
  "seleção deve valer para todos os personagens da conta");
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8");
vm.runInContext(ui.slice(ui.indexOf("function conditionTurnsLabel("), ui.indexOf("function renderStatusBar(")), catalog);
const shield = catalog.collectConditionBarItems(second).find((it) => it.icon === "cond-hazard-shield");
must(shield && shield.tempo === "4" && shield.desc.includes("5"), "condition bar sem hazard ativo/desbloqueado");
must(fs.existsSync(path.join(game, shield.img)), "Hazard Shield sem asset");
const bar = { style: {}, querySelectorAll: () => [] };
catalog.paintConditionBar(bar, second, true);
must(bar.innerHTML.includes("cond-hazard-shield.svg") && bar.innerHTML.includes('class="sb-tempo">4'),
  "condition bar não renderiza escudo com nível");
must(/"the-primal-menace":\s*\{[\s\S]*?cooldown:\s*0,/.test(gsrc), "Primal Menace deve estar sem cooldown");
const shared = require("../server/shared_inventory.js");
const hydrated = shared.applyAccountMissionsToPlayer({ hazardLevel: 1 }, account);
must(hydrated.hazardLevel === 5 && hydrated.hazardSel === 4, "servidor deve hidratar hazard por conta, não por abates");
const oldRandom = Math.random;
try {
  for (const [i, slug] of pool.entries()) {
    const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
    must(client && client.s && client.t !== "loot", "cliente: recompensa não equipável: " + slug);
    must(server && server.s === client.s, "servidor: slot divergente: " + slug);
    for (const key of ["arm", "def", "mag", "sword", "axe", "club", "dist", "lvl", "charges"])
      must(server[key] === client[key], "atributo divergente " + key + ": " + slug);
    must(client.arm || client.def || client.mag || client.dist, "recompensa sem atributos: " + slug);
    if (slug.startsWith("charged-")) {
      must(client.durationSec === 10800 && client.charges > 0, "anel sem duração: " + slug);
      must(client.res && client.res.fire === 4, "anel sem resistências: " + slug);
    }
    const p = { level: 400, voc: client.vocs[0], bag: { "primal-bag": 1 }, depot: [], equip: {} };
    Math.random = () => (i + 0.5) / pool.length;
    const reward = E.openAuthPrimalBag(p);
    must(reward.ok && reward.item === slug && p.depot[0] === slug, "recompensa incorreta: " + slug);
    p.bag[slug] = 1;
    p.itemInstances = [{ id: "primal-test-" + i, slug, loc: "bag", tier: 0 }];
    const equipped = E.equipFromContainerAuth(p, slug, "bag");
    must(equipped.ok && p.equip[client.s].item === slug, "falha ao equipar " + slug + ": " + equipped.msg);
  }
} finally { Math.random = oldRandom; }
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
const api = {}; vm.createContext(api);
vm.runInContext(serverSource.slice(serverSource.indexOf("async function updateAccountHazard("),
  serverSource.indexOf("async function updateAccountTutorial(")), api);
(async () => {
  const db = {
    findAccountByToken: async () => ({ id: 1, cosmetics: { hazard: { kills: 20, level: 5, sel: 4 } } }),
    setAccountHazard: async (id, h) => { must(id === 1 && h.level === 5 && h.sel === 3,
      "API deve persistir seleção da conta sem promover por total de abates"); },
  };
  const result = await api.updateAccountHazard(db, { token: "test", hazard: { kills: 21, level: 5, sel: 3 } });
  must(result.code === 200 && result.body.hazard.level === 5, "hazard da conta incorreto");
  console.log("OK — gnomprona/hazard: hunt, missão, OTBM, condition bar, conta, Primal Bag e equipamento validados.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
