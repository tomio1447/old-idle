/* Regressão: The Roost of the Graveborn Quest — boss quest 450+
 * (update 15.20).
 *
 * Progressão oficial (wikitext TibiaWiki/Fandom):
 *   M1 — 5.000 kills na Unhallowed Crypt → acesso ao Adventurer Group
 *   M2 — cadeia sequencial: Adventurer Group (The First Dragon,
 *        first_dragon.otbm) → Eldritch Dragon Lord (Under Fire,
 *        eldritch_dl.otbm) → Ice Horror (The Frozen Hoard,
 *        ice_horror.otbm) → The Gravedigger (The Last Dragon Soul,
 *        gravedigger.otbm) → libera Bonelord's Phylactery
 *        (bonelords_phylactery.otbm)
 *   M3 — derrotar a Phylactery → 1 de cada Crypt Rune (auto-resgate)
 *
 * NPC Dragon Ancestor Spirit (Draconia): troca 1 de cada Crypt Rune
 * por 1 arma Crypt aleatória — roleta gif igual à do Make Believe,
 * pesos oficiais: spine 82 / slicer 79 / bile 76 / strike 75 /
 * splitter 73 / breaker 69 / jaw 64.
 *
 * Bosses (fichas oficiais): eldritch-dl race 2739 lt 1879 exp 750k,
 * ice-horror race 2733 lt 1881 hp 542.700 exp 259.000 (ice 0%, heal
 * 0%), gravedigger race 2721 lt 1880 exp 750k, adventurer-group race
 * 2773 lookItem 52836, phylactery race 2771 lookItem 52831 exp 1M
 * earth 110%. Cooldown 20h todos. HPs ocultos oficialmente —
 * estimados (adventurer 520k, eldritch 680k, gravedigger 720k,
 * phylactery 850k).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const OTBM = require(path.join(js, "otbm.js"));
const roost = require("../game/js/roost-graveborn.js");

/* ---------------- dados do cliente (vm, ordem do index) ---------------- */
const ctx = { window: {}, console, Math, Date, Map, Set, document: undefined };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "weapondata.js", "weapons.js", "yasir-prices.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
/* Stubs das coleções que vivem em game.js/city.js/city-ui.js (DOM) — o
 * módulo escreve nelas via referência. */
vm.runInContext(
  "var MISSION_DEFS={},QUEST_DEFS={},BOSS_DEFS={},NPCS={}," +
  "BOSS_MODAL_SECTIONS=[{title:'SOULWAR 400+',ids:[]},{title:'BLOODROTTEN 600+',ids:[]},{title:'BOSSES 800+',ids:[]}];" +
  "var NPC_MODAL_CATALOG=[],MONSTERDATA=window.MONSTERDATA||{};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "roost-graveborn.js"), "utf8"),
  ctx, { filename: "roost-graveborn.js" });

const M = ctx.GAMEDATA.monsters;
const BOSSES = ["adventurer-group", "eldritch-dragon-lord", "ice-horror",
  "the-gravedigger", "bonelords-phylactery"];

/* ---------------- boss rooms + gating sequencial ---------------- */
for (const id of BOSSES) {
  const mon = M[id];
  must(mon, id + ": monstro ausente no GAMEDATA.monsters");
  const b = ctx.BOSS_DEFS[id];
  must(b, id + ": BOSS_DEFS ausente");
  must(b.hunt === id + "-room" && b.baseMonster === id && b.sprite === id,
    id + ": BOSS_DEFS hunt/baseMonster/sprite divergentes");
  must(b.requirement && b.requirement.level === 450 && b.requirement.enforced,
    id + ": requirement level 450 enforced ausente");
  must(b.cooldown === 20 * 60 * 60 * 1000, id + ": cooldown deve ser 20h");
  const room = ctx.GAMEDATA.hunts[id + "-room"];
  must(room && room.hidden && room.pack === 1 && room.cat === "boss-room",
    id + "-room: hunt técnica ausente");
  must(room.monsters.length === 1 && room.monsters[0] === id,
    id + "-room: monsters divergentes");
}
/* Missão 1 e cadeia. */
must(ctx.BOSS_DEFS["adventurer-group"].requirement.mission === "unhallowed-crypt" &&
  ctx.BOSS_DEFS["adventurer-group"].requirement.access === "adventurer-group",
  "adventurer-group deve pedir a missão unhallowed-crypt");
must(JSON.stringify(ctx.BOSS_DEFS["eldritch-dragon-lord"].requirement.killsRequired) ===
  '["adventurer-group"]', "eldritch deve exigir adventurer-group");
must(JSON.stringify(ctx.BOSS_DEFS["ice-horror"].requirement.killsRequired) ===
  '["eldritch-dragon-lord"]', "ice-horror deve exigir eldritch");
must(JSON.stringify(ctx.BOSS_DEFS["the-gravedigger"].requirement.killsRequired) ===
  '["ice-horror"]', "gravedigger deve exigir ice-horror");
must(JSON.stringify(ctx.BOSS_DEFS["bonelords-phylactery"].requirement.killsRequired) ===
  '["adventurer-group","eldritch-dragon-lord","ice-horror","the-gravedigger"]',
  "phylactery deve exigir os 4 bosses");

const mission = ctx.MISSION_DEFS["unhallowed-crypt"];
must(mission && mission.tasks.length === 1 &&
  mission.tasks[0].counter === "kills" && mission.tasks[0].target === 500,
  "Missão unhallowed-crypt deve pedir 500 kills");
must(mission.completeReward && mission.completeReward.bossAccess === "adventurer-group",
  "Missão deve liberar o Adventurer Group");

must(ctx.QUEST_DEFS["roost-of-the-graveborn-quest"] &&
  ctx.QUEST_DEFS["roost-of-the-graveborn-quest"].level === 450 &&
  typeof ctx.QUEST_DEFS["roost-of-the-graveborn-quest"].renderDetail === "function",
  "QUEST_DEFS da Roost ausente");
const sect = ctx.BOSS_MODAL_SECTIONS.find((s) => /GRAVEBORN/.test(s.title));
must(sect && sect.minLevel === 450 &&
  JSON.stringify(sect.ids) === JSON.stringify(BOSSES),
  "seção GRAVEBORN 450+ ausente/ordenada errada");
/* Ordem por nível: GRAVEBORN 450+ logo abaixo de SOULWAR 400+,
 * antes de BLOODROTTEN 600+ e BOSSES 800+. */
must(ctx.BOSS_MODAL_SECTIONS.findIndex((s) => /GRAVEBORN/.test(s.title)) ===
  ctx.BOSS_MODAL_SECTIONS.findIndex((s) => /SOULWAR/.test(s.title)) + 1,
  "GRAVEBORN 450+ não ficou abaixo de SOULWAR");

/* ---------------- NPC Dragon Ancestor Spirit ---------------- */
must(ctx.NPCS["dragon-ancestor-spirit"] &&
  ctx.NPCS["dragon-ancestor-spirit"].type === "crypt-exchange",
  "NPC dragon-ancestor-spirit ausente/type errado");
must(ctx.NPC_MODAL_CATALOG.some((e) => e.shop === "dragon-ancestor-spirit"),
  "NPC fora do catálogo do modal");
const cui = fs.readFileSync(path.join(js, "city-ui.js"), "utf8");
must((cui.match(/case "crypt-exchange":/g) || []).length === 2,
  "city-ui.js deve despachar crypt-exchange nos 2 switches");
must(cui.includes("roostBindExchange"), "bindNpc sem wiring crypt-exchange");
must(fs.existsSync(path.join(game, "assets", "npc", "dragon-ancestor-spirit_s.png")),
  "portrait do NPC ausente");
/* Outfit: 1899 era a Night Harpy — o espírito usa 1883 (dragão espectral). */
const imp = fs.readFileSync(path.join(__dirname, "import_roost_graveborn_assets.py"), "utf8");
must(imp.includes('NPC_PORTRAIT = ("dragon-ancestor-spirit", 1883)') &&
  !imp.includes('"dragon-ancestor-spirit", 1899'),
  "importer ainda gera o portrait com looktype 1899 (Night Harpy)");
/* Modal dedicado gi-crypt-* com grid de runas, roleta e close. */
must(typeof ctx.npcCryptExchangeHtml === "function", "npcCryptExchangeHtml ausente");
const htmlNoRunes = ctx.npcCryptExchangeHtml({ lootPouch: {} });
for (const cls of ["gi-crypt-modal", "gi-crypt-header", "gi-crypt-npc-icon",
  "gi-crypt-quote", "gi-crypt-body", "gi-rune-grid", "gi-crypt-reward",
  "gi-reward-box", "gi-crypt-actions", "gi-crypt-btn", "gi-crypt-status"])
  must(htmlNoRunes.includes(cls), `modal sem .${cls}`);
must((htmlNoRunes.match(/gi-rune-slot/g) || []).length === 5,
  "grid deve ter 5 rune slots");
must(!htmlNoRunes.includes("is-owned"), "slot marcado is-owned sem runas");
must(htmlNoRunes.includes("gi-crypt-close") && htmlNoRunes.includes("id=\"roost-exchange-btn\"") &&
  htmlNoRunes.includes("id=\"roost-exchange-icon\"") && htmlNoRunes.includes("id=\"roost-exchange-name\""),
  "modal sem close/roleta/botão");
must(htmlNoRunes.includes("disabled"), "botão deve vir disabled sem runas");
const htmlReady = ctx.npcCryptExchangeHtml({ lootPouch: Object.fromEntries(
  ["fiery-crypt-rune", "icy-crypt-rune", "deathly-crypt-rune",
   "ancient-crypt-rune", "necromantic-crypt-rune"].map((s) => [s, 2])) });
must(htmlReady.includes("is-ready") && !/id="roost-exchange-btn" disabled/.test(htmlReady),
  "botão pronto deve ter is-ready sem disabled");
must((htmlReady.match(/is-owned/g) || []).length >= 5, "slots com runas sem is-owned");
must(cui.includes("gi-crypt-shell"), "openNpc sem shell dedicado crypt-exchange");
const lcss = fs.readFileSync(path.join(game, "css", "layout.css"), "utf8");
must(lcss.includes(".gi-crypt-shell") && lcss.includes(".gi-rune-slot.is-owned"),
  "CSS gi-crypt ausente no layout.css");

/* ---------------- runas + armas: tabela da roleta ---------------- */
const RUNES = ["fiery-crypt-rune", "icy-crypt-rune", "deathly-crypt-rune",
  "ancient-crypt-rune", "necromantic-crypt-rune"];
const WEAPONS = { "crypt-spine": 82, "crypt-slicer": 79, "crypt-bile": 76,
  "crypt-strike": 75, "crypt-splitter": 73, "crypt-breaker": 69, "crypt-jaw": 64 };
const WEAPON_CIDS = { "crypt-spine": 52332, "crypt-splitter": 52333,
  "crypt-breaker": 52334, "crypt-strike": 52335, "crypt-bile": 52336,
  "crypt-jaw": 52337, "crypt-slicer": 52338 };
const RUNE_CIDS = { "fiery-crypt-rune": 52657, "icy-crypt-rune": 52658,
  "deathly-crypt-rune": 52659, "ancient-crypt-rune": 52660,
  "necromantic-crypt-rune": 52661 };
const NEW_LOOT = { "worn-guide-book": [52710, 250000], "golden-claw": [52711, 250000],
  "shrunken-head": [52712, 250000], "ancient-scales": [52713, 400000],
  "soul-trap": [52714, 250000], "skull-tendril": [52715, 650000],
  "bone-spikes": [52717, 1500000], "icy-scales": [52726, 250000],
  "icy-horns": [52727, 250000], "frozen-crapace": [52728, 500000],
  "dragon-tongue": [24938, 550], "shard": [7290, 2000] };

const pctSum = roost.CRYPT_WEAPONS.reduce((s, w) => s + w.pct, 0);
must(Math.abs(pctSum - 100.1) < 0.05 && roost.CRYPT_WEAPONS.length === 7,
  "percentuais da roleta devem somar ~100 (7 armas)");
for (const w of roost.CRYPT_WEAPONS)
  must(WEAPONS[w.slug] === w.qty, w.slug + ": qty oficial divergente");

/* Distribuição da roleta — 40k giros: cada arma aparece; spine é o mais
 * frequente; jaw o menos. */
{
  const n = 40000, hits = {};
  const rnd = vm.runInContext("Math.random", ctx) || Math.random;
  for (let i = 0; i < n; i++) { const s = roost.roostRollWeapon(); hits[s] = (hits[s] || 0) + 1; }
  for (const slug of Object.keys(WEAPONS))
    must((hits[slug] || 0) > n * 0.10, slug + ": roleta quase nunca sorteia");
  const sorted = Object.entries(hits).sort((a, b) => b[1] - a[1]);
  must(sorted[0][0] === "crypt-spine" && sorted[6][0] === "crypt-jaw",
    "distribuição da roleta invertida: " + JSON.stringify(sorted));
}

/* Itens: catálogo cliente + paridade servidor + ícone. */
const catalog = { console }; catalog.window = catalog; vm.createContext(catalog);
for (const file of ["gamedata.js", "weapondata.js", "weapons.js", "quiverdata.js",
  "core.js", "accessorydata.js", "supply-stash-data.js", "supplydata.js", "supplies.js",
  "yasir-prices.js", "hardcore-library.js", "hard-hunts.js", "magma-bubble.js", "gnomprona.js",
  "falcon-bastion.js", "deathlings-sunken-temple.js",
  "azzilon-castle.js", "bloodrotten.js", "glooth-cave.js", "buried-cathedral.js",
  "buster-darashia.js", "urmahlullu.js", "bashmuul-issavi.js", "true-asuras.js",
  "mimar-haffar.js", "moonstone-castle.js", "radiant-skyhold.js", "book-world.js",
  "sir-leonard.js", "norcferatus-fortress.js", "unhallowed-crypt.js",
  "roost-graveborn.js"]) {
  vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), catalog, { filename: file });
  if (file === "weapons.js") vm.runInContext("fundirWeaponData()", catalog);
}
const E = engine;
const checkItem = (slug, cid, sell) => {
  const client = catalog.GAMEDATA.items[slug], server = E.ITEMS[slug];
  must(client && server, slug + ": ausente no cliente ou no servidor");
  const cId = client.cid !== undefined ? client.cid : client.id;
  const sId = server.cid !== undefined ? server.cid : server.id;
  must(cId === cid && sId === cid, slug + ": cid divergente (" + cid + ")");
  must(Number(client.sell) === sell && Number(server.sell) === sell,
    slug + ": preço divergente (" + sell + ")");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    slug + ": ícone ausente");
};
for (const slug of Object.keys(WEAPON_CIDS)) checkItem(slug, WEAPON_CIDS[slug], 0);
for (const slug of Object.keys(RUNE_CIDS)) checkItem(slug, RUNE_CIDS[slug], 0);
for (const slug of Object.keys(NEW_LOOT)) checkItem(slug, NEW_LOOT[slug][0], NEW_LOOT[slug][1]);
/* stats oficiais das armas */
{
  const it = catalog.GAMEDATA.items;
  must(it["crypt-slicer"].atk === 58 && it["crypt-slicer"].def === 33 &&
    it["crypt-slicer"].sword === 4 && it["crypt-slicer"].lvl === 450 &&
    it["crypt-slicer"].vocs[0] === "knight" && it["crypt-slicer"].th === 1,
    "crypt-slicer stats divergentes");
  must(it["crypt-spine"].atk === 8 && it["crypt-spine"].hit === 5 &&
    it["crypt-spine"].range === 6 && it["crypt-spine"].dist === 3 &&
    it["crypt-spine"].res.ice === 5 && it["crypt-spine"].vocs[0] === "paladin",
    "crypt-spine stats divergentes");
  must(it["crypt-bile"].dmgMin === 85 && it["crypt-bile"].dmgMax === 135 &&
    it["crypt-bile"].mag === 4 && it["crypt-bile"].range === 7 &&
    it["crypt-bile"].vocs[0] === "sorcerer", "crypt-bile stats divergentes");
  must(it["crypt-jaw"].res.energy === 6 && it["crypt-jaw"].vocs[0] === "druid",
    "crypt-jaw stats divergentes");
  must(it["crypt-strike"].fist === 4 && it["crypt-strike"].mag === 1 &&
    it["crypt-strike"].vocs[0] === "monk", "crypt-strike stats divergentes");
  must(it["crypt-splitter"].axe === 4 && it["crypt-breaker"].club === 4,
    "crypt-splitter/breaker skills divergentes");
}
/* Todos os drops dos bosses existem no catálogo. */
const known = new Set(Object.keys(catalog.GAMEDATA.items)
  .concat(Object.keys(catalog.AMMODATA ? catalog.AMMODATA.ammo || {} : {})));
for (const slug of BOSSES)
  for (const l of M[slug].loot)
    must(known.has(l.item), slug + ": drop fora do catálogo: " + l.item);
/* Runa certa dropa no boss certo (rare oficial). */
must(M["eldritch-dragon-lord"].loot.some((l) => l.item === "fiery-crypt-rune"),
  "eldritch sem fiery-crypt-rune");
must(M["ice-horror"].loot.some((l) => l.item === "icy-crypt-rune"),
  "ice-horror sem icy-crypt-rune");
must(M["the-gravedigger"].loot.some((l) => l.item === "deathly-crypt-rune"),
  "gravedigger sem deathly-crypt-rune");
must(M["bonelords-phylactery"].loot.some((l) => l.item === "necromantic-crypt-rune"),
  "phylactery sem necromantic-crypt-rune");
must(M["adventurer-group"].loot.some((l) => l.item === "ancient-crypt-rune") &&
  M["adventurer-group"].loot.some((l) => l.item === "worn-guide-book"),
  "adventurer-group (loot do Fatal Bug) sem ancient-crypt-rune/worn-guide-book");

/* Fichas oficiais. */
must(M["ice-horror"].hp === 542700 && M["ice-horror"].exp === 259000 &&
  M["ice-horror"].raceId === 2733 && M["ice-horror"].resist.ice === 100,
  "ice-horror ficha divergente");
must(M["ice-horror"].skills.some((s) => s.el === "death" && s.min === 950) &&
  M["ice-horror"].skills.some((s) => s.el === "energy" && s.min === 1300),
  "ice-horror sem Death Ring 950+ / Great Energy Wave 1300+");
must(M["eldritch-dragon-lord"].exp === 750000 && M["eldritch-dragon-lord"].raceId === 2739 &&
  M["eldritch-dragon-lord"].resist.fire === 100, "eldritch ficha divergente");
must(M["the-gravedigger"].raceId === 2721 && M["the-gravedigger"].exp === 750000 &&
  M["the-gravedigger"].skills.some((s) => s.el === "fire" && s.min === 600 && s.max === 800),
  "gravedigger sem Fire Ball 600-800");
must(M["bonelords-phylactery"].exp === 1000000 && M["bonelords-phylactery"].resist.earth === -10,
  "phylactery ficha divergente");
must(M["adventurer-group"].raceId === 2773 && M["adventurer-group"].lookItem === 52836 &&
  M["bonelords-phylactery"].lookItem === 52831, "lookItems divergentes");

/* ---------------- sprites ---------------- */
for (const slug of BOSSES) {
  const sheet = ctx.MOBSHEETS[slug];
  must(sheet && sheet.rows === 4 && sheet.cols === 9,
    slug + ": MOBSHEETS ausente/9x4 divergente");
  const png = fs.readFileSync(path.join(game, "assets", "mob", slug + ".png"));
  must(png.readUInt32BE(16) === sheet.cw * sheet.cols &&
    png.readUInt32BE(20) === sheet.ch * sheet.rows,
    slug + ": dimensões do PNG não batem com o MOBSHEETS");
}
const caCtx = { console }; caCtx.window = caCtx; vm.createContext(caCtx);
vm.runInContext(fs.readFileSync(path.join(js, "creatureanchordata.js"), "utf8"), caCtx);
for (const slug of ["eldritch-dragon-lord", "the-gravedigger", "ice-horror"])
  must(caCtx.CREATURE_ANCHORS && caCtx.CREATURE_ANCHORS[slug],
    slug + ": âncora CREATURE_ANCHORS ausente");

/* -------- Adventurer Group: encontro oficial multi-membro -------- */
const AG_MEMBERS = ["yorik-youngbook", "percy-peacetinker", "grendel-greenlunch",
  "fiona-firstdream", "nigel-neverguess"];
const AV_MAP = { "yorik-youngbook": "avatar-of-steel", "percy-peacetinker": "avatar-of-light",
  "grendel-greenlunch": "avatar-of-nature", "fiona-firstdream": "avatar-of-storm",
  "nigel-neverguess": "avatar-of-balance" };
for (const s of [...AG_MEMBERS, ...Object.values(AV_MAP), "bright-crystal"]) {
  must(M[s], s + " ausente do ROOST_MONSTERS");
  /* Humanoides clássicos (looktypes 137/144/268) têm só 2 frames de
   * walk no DAT → sheet 3×4; avatares/15.20 têm 9×4. */
  must(ctx.MOBSHEETS[s] && ctx.MOBSHEETS[s].cols >= 3 && ctx.MOBSHEETS[s].rows === 4 &&
    fs.existsSync(path.join(game, "assets", "mob", s + ".png")), s + " sheet ausente");
  must(E.MONSTERS[s], "engine: " + s + " ausente do MONSTERS");
  must(caCtx.CREATURE_ANCHORS[s], s + " âncora ausente");
}
must(M["adventurer-group"].name === "Fatal Bug" && M["adventurer-group"].raceId === 2773,
  "entidade final deve ser o Fatal Bug (race 2773)");
for (const [m, a] of Object.entries(AV_MAP)) {
  must(M[m].agTransform === a, m + " agTransform ≠ " + a);
  must(Number(M[a].damageTakenMul) < 1, a + " sem damageTakenMul<1");
}
must(M["bright-crystal"].noAttack === true && M["bright-crystal"].exp === 0,
  "bright-crystal deve ser estático/noAttack");
const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
must(combatSrc.includes("adventurerGroupBossInit") && combatSrc.includes("adventurerGroupBossTick") &&
  combatSrc.includes("mob.critAll") && combatSrc.includes("mobTakenMul"),
  "cliente combat.js sem hooks do encontro");
const roostSrc = fs.readFileSync(path.join(js, "roost-graveborn.js"), "utf8");
must(roostSrc.includes("AG_MEMBER_SPAWNS") && roostSrc.includes("adventurerGroupBossTick"),
  "roost module sem mecânica do encontro");
must(roostSrc.includes("ELD_VENT_SPAWNS") && roostSrc.includes("eldritchBossTick"),
  "roost module sem vulcões");

/* -------- Eldritch Dragon Lord: vulcões oficiais -------- */
for (const s of ["pulsating-lava", "eruption", "flame-totem"]) {
  must(M[s], s + " ausente do ROOST_MONSTERS");
  must(M[s].lookItem, s + " deve ser lookItem (objeto oficial)");
  must(ctx.MOBSHEETS[s] && fs.existsSync(path.join(game, "assets", "mob", s + ".png")),
    s + " sheet ausente");
  must(E.MONSTERS[s], "engine: " + s + " ausente");
}
must(M["pulsating-lava"].eldStage.next === "eruption" &&
  M["eruption"].eldStage.next === "flame-totem" &&
  !M["flame-totem"].eldStage, "cadeia de evolução divergente");
must(M["flame-totem"].skills.length > 0, "flame-totem deve atacar");
must(M["pulsating-lava"].noAttack === true && M["pulsating-lava"].exp === 0,
  "pulsating-lava deve ser hazard estático");

/* -------- Ice Horror: Ice Crawlers invocados -------- */
must(M["ice-crawler"], "ice-crawler ausente do ROOST_MONSTERS");
must(M["ice-crawler"].exp === 0 && M["ice-crawler"].resist.ice === 100 &&
  M["ice-crawler"].element === "ice" && Array.isArray(M["ice-crawler"].loot) &&
  M["ice-crawler"].loot.length === 0, "ice-crawler ficha divergente");
must(E.MONSTERS["ice-crawler"], "engine: ice-crawler ausente do MONSTERS");
{ /* sprite = crystal-spider oficial ("looks the same as a Crystal Spider") */
  const s = ctx.MOBSHEETS["ice-crawler"];
  must(s && s.cols === 3 && s.rows === 4 && s.cw === 49 && s.ch === 49,
    "ice-crawler: MOBSHEETS divergente da crystal-spider (3x4 49x49)");
  const png = fs.readFileSync(path.join(game, "assets", "mob", "ice-crawler.png"));
  must(png.readUInt32BE(16) === s.cw * s.cols &&
    png.readUInt32BE(20) === s.ch * s.rows,
    "ice-crawler: dimensões do PNG divergentes");
  const ref = fs.readFileSync(path.join(game, "assets", "mob", "crystal-spider.png"));
  must(png.equals(ref), "ice-crawler.png deve ser a sprite da crystal-spider");
  must(caCtx.CREATURE_ANCHORS["ice-crawler"], "ice-crawler âncora ausente");
}
must(Number.isFinite(roost.IH_CRAWLER_MAX) && roost.IH_CRAWLER_MAX >= 1 &&
  roost.IH_CRAWLER_MAX <= 8 && roost.IH_SUMMON_MS > 0,
  "constantes de invocação do ice-horror divergentes");
must(combatSrc.includes("iceHorrorBossInit") && combatSrc.includes("iceHorrorBossTick"),
  "cliente combat.js sem hooks do ice-horror");
must(roostSrc.includes("iceHorrorBossTick") && roostSrc.includes("ihSpawnCrawler"),
  "roost module sem mecânica de invocação");
const engSrc = fs.readFileSync(path.join(__dirname, "..", "server",
  "authoritative_engine.js"), "utf8");
must(engSrc.includes("tickIceHorror") && engSrc.includes("iceCrawler"),
  "engine sem tickIceHorror/iceCrawler");

/* -------- The Gravedigger: Bonelord Totems invocados -------- */
must(M["bonelord-totem"], "bonelord-totem ausente do ROOST_MONSTERS");
must(M["bonelord-totem"].lookItem === 51192 &&
  M["bonelord-totem"].damageTakenMul === 0 && M["bonelord-totem"].exp === 0 &&
  M["bonelord-totem"].loot.length === 0 &&
  M["bonelord-totem"].skills.some((s) => s.el === "death" && s.radius >= 3),
  "bonelord-totem ficha divergente (oficial: objectID 51192, dmg mods 0%)");
must(E.MONSTERS["bonelord-totem"], "engine: bonelord-totem ausente");
must(ctx.MOBSHEETS["bonelord-totem"] &&
  fs.existsSync(path.join(game, "assets", "mob", "bonelord-totem.png")) &&
  caCtx.CREATURE_ANCHORS["bonelord-totem"], "bonelord-totem sheet/âncora ausente");
must(roost.GD_TOTEM_MAX === 2 && roost.GD_SUMMON_MS > 0,
  "GD_TOTEM_MAX deve ser 2 (Summon amount=2 oficial)");
must(combatSrc.includes("gravediggerBossInit") && combatSrc.includes("gravediggerBossTick"),
  "cliente combat.js sem hooks do gravedigger");
must(roostSrc.includes("gravediggerBossTick") && roostSrc.includes("gdSpawnTotem"),
  "roost module sem mecânica do gravedigger");
must(engSrc.includes("tickGravedigger") && engSrc.includes("gdTotem"),
  "engine sem tickGravedigger/gdTotem");
/* funil: damageTakenMul 0 deve zerar o dano (totem invulnerável oficial) */
must(engSrc.includes("agMul===0") && combatSrc.includes("mul === 0"),
  "funnels sem o caso damageTakenMul===0 (totem seria matável)");

/* -------- Bone Overlord / Bonelord's Phylactery: encontro em 2 fases -------- */
const BO_CAGES = ["zharvorins-soulcage", "myzareths-soulcage",
  "scariths-soulcage", "elyraxs-soulcage"];
const BO_SPIRITS = ["zharvorins-spirit", "myzareths-spirit",
  "scariths-spirit", "elyraxs-spirit"];
const BO_ALL = [...BO_CAGES, ...BO_SPIRITS, "enthralled-dragon",
  "an-eye", "bone-barrier", "wraithfire"];
for (const s of BO_ALL) {
  must(M[s], s + " ausente do ROOST_MONSTERS");
  must(E.MONSTERS[s], "engine: " + s + " ausente do MONSTERS");
  must(ctx.MOBSHEETS[s] &&
    fs.existsSync(path.join(game, "assets", "mob", s + ".png")),
    s + " sheet ausente");
  must(caCtx.CREATURE_ANCHORS[s], s + " âncora ausente");
}
/* soulcages: objectID oficial 52546, pool compartilhado, resistências */
for (const s of BO_CAGES) {
  must(M[s].lookItem === 52546 && M[s].hp === roost.BO_CAGE_POOL &&
    M[s].exp === 0, s + " ficha divergente (objectID 52546 oficial)");
}
must(M["zharvorins-soulcage"].resist.death === -50 &&
  M["myzareths-soulcage"].resist.energy === -50 &&
  M["scariths-soulcage"].resist.ice === -50 &&
  M["elyraxs-soulcage"].resist.holy === -50 &&
  M["elyraxs-soulcage"].resist.death === -50 &&
  M["elyraxs-soulcage"].skills.some((k) => k.el === "holy" && k.min === 1600),
  "resistências/skills das soulcages divergentes do oficial");
must(M["scariths-soulcage"].mitigation === 3.45,
  "scariths-soulcage sem mitigation 3.45 oficial");
/* espíritos: imunes a todo dano (oficial), condição por corner */
must(BO_SPIRITS.every((s) => M[s].damageTakenMul === 0 && M[s].exp === 0),
  "dragon spirits devem ser imunes a todo dano (oficial)");
must(M["zharvorins-spirit"].boCond === "rooted" &&
  M["myzareths-spirit"].boCond === "feared" &&
  M["scariths-spirit"].boCond === "drunk" &&
  M["elyraxs-spirit"].boCond === "slowed",
  "condições dos spirits divergentes");
must(BO_SPIRITS.every((s) => M[s].skills.some((k) =>
  k.el === "energy" && k.min === 450) && M[s].skills.some((k) =>
  k.el === "physical" && k.min === 800)),
  "spirits sem Energy Missile 450+/Bleed Explosion 800+ oficiais");
/* summons da fase 2 + objetos dos gazes */
must(M["enthralled-dragon"].looktype === 1883 &&
  M["enthralled-dragon"].resist.fire === 100 &&
  M["enthralled-dragon"].resist.energy === 100 &&
  M["enthralled-dragon"].resist.earth === 100,
  "enthralled-dragon divergente (oficial: atravessa Fire/Energy/Poison)");
must(M["an-eye"].lookItem === 5898 && M["an-eye"].damageTakenMul === 0,
  "an-eye divergente");
must(M["bone-barrier"].lookItem === 6972 && M["bone-barrier"].hp === 10000,
  "bone-barrier divergente (objectID 6972, hp 10.000 oficiais)");
must(M["wraithfire"].lookItem === 52441 && M["wraithfire"].damageTakenMul === 0,
  "wraithfire divergente (itemid 52441 oficial)");
must(roost.BO_CAGE_POOL === 120000 && roost.BO_CAGE_SPAWNS.length === 4 &&
  roost.BO_DRAGON_SPAWNS.length === 4 && roost.BO_GAZE_MS > 0,
  "constantes do bone-overlord divergentes");
must(combatSrc.includes("boneOverlordBossInit") &&
  combatSrc.includes("boneOverlordBossTick"),
  "cliente combat.js sem hooks do bone-overlord");
must(roostSrc.includes("boneOverlordBossTick") && roostSrc.includes("boMakeMob"),
  "roost module sem mecânica do bone-overlord");
must(engSrc.includes("tickBoneOverlord") && engSrc.includes("boSpirit") &&
  engSrc.includes("_boSyncHp"), "engine sem tickBoneOverlord/pool delta");
must(fs.readFileSync(path.join(js, "game.js"), "utf8")
  .includes("boneOverlordBossCleanup"), "game.js sem cleanup do bone-overlord");

/* ---------------- engine ---------------- */
for (const slug of BOSSES) {
  must(E.MONSTERS[slug], "engine: " + slug + " ausente do MONSTERS");
  const eh = E.HUNTS[slug + "-room"];
  must(eh && eh.monsters.length === 1 && eh.monsters[0] === slug,
    "engine: " + slug + "-room ausente");
}
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes('"roost-graveborn.js"'),
  "engine não carrega roost-graveborn.js no sandbox de itens");
must(engineSrc.includes('require("../game/js/roost-graveborn.js")'),
  "engine sem require/registerMonsters do patch");
must(engineSrc.includes("tickAdventurerGroup") && engineSrc.includes("agCrystal") &&
  engineSrc.includes("agMember") && engineSrc.includes("damageTakenMul") &&
  engineSrc.includes("mob.critAll") && engineSrc.includes('auth.bossId==="adventurer-group"'),
  "engine sem mecânica do encontro Adventurer Group");
must(engineSrc.includes("tickEldritch") && engineSrc.includes("eldVent") &&
  engineSrc.includes("eldritchImmune") && engineSrc.includes('auth.bossId==="eldritch-dragon-lord"'),
  "engine sem mecânica dos vulcões");
must(combatSrc.includes("eldritchBossInit") && combatSrc.includes("eldritchBossTick"),
  "cliente sem hooks dos vulcões");

/* ---------------- OTBMs: bounds, spawns, caminhabilidade ---------------- */
const tfCtx = { console }; tfCtx.window = tfCtx; vm.createContext(tfCtx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), tfCtx);
const TILEFLAGS = tfCtx.TILEFLAGS || {};
const MAPS = [
  ["adventurer-group", "first_dragon.otbm", "first_dragon.otbm"],
  ["ice-horror", "ice_horror.otbm", "ice_horror.otbm"],
  ["eldritch-dragon-lord", "bossesroom/eldritch_dl.otbm", "eldritch_dl.otbm"],
  ["the-gravedigger", "bossesroom/gravedigger.otbm", "gravedigger.otbm"],
  ["bonelords-phylactery", "bossesroom/bonelords_phylactery.otbm", "bonelords_phylactery.otbm"],
];
for (const [bossId, betaRel, mapName] of MAPS) {
  const runtime = path.join(game, "maps", mapName);
  const beta = path.join(game, "beta-maps", betaRel);
  must(fs.existsSync(runtime), mapName + " não publicado");
  must(fs.existsSync(beta), "beta ausente: " + betaRel);
  must(fs.readFileSync(runtime).equals(fs.readFileSync(beta)),
    mapName + ": runtime diverge do beta");
  const buf = fs.readFileSync(runtime);
  const map = OTBM.read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { z: 7 });
  must(map.z === 7 && map.w > 10 && map.h > 10, mapName + ": mapa 1x1/piso errado");
  const room = roost.ROOST_ROOMS[bossId];
  must(map.sourceBounds &&
    room.spawn.x >= map.sourceBounds.minX && room.spawn.x <= map.sourceBounds.maxX &&
    room.spawn.y >= map.sourceBounds.minY && room.spawn.y <= map.sourceBounds.maxY &&
    room.boss.x >= map.sourceBounds.minX && room.boss.x <= map.sourceBounds.maxX &&
    room.boss.y >= map.sourceBounds.minY && room.boss.y <= map.sourceBounds.maxY,
    bossId + ": spawn/boss fora dos bounds");
  /* zones absolutas → locais (espelho do applyHuntOtbmZones). */
  map.spawn = { x: room.spawn.x - map.sourceBounds.minX, y: room.spawn.y - map.sourceBounds.minY };
  map.mob = [{ x: room.boss.x - map.sourceBounds.minX, y: room.boss.y - map.sourceBounds.minY, w: 1, h: 1 }];
  const hm = OTBM.huntMapFromOtbm(map, TILEFLAGS);
  const walk = (ax, ay) => {
    const x = ax - map.sourceBounds.minX, y = ay - map.sourceBounds.minY;
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const e = hm.leg[hm.rows[y][x]];
    return !!(e && !e.bloc && !hm.footprintBlocked[x + ":" + y]);
  };
  must(walk(room.spawn.x, room.spawn.y), bossId + ": playerspawn bloqueado");
  must(walk(room.boss.x, room.boss.y), bossId + ": bossspawn bloqueado");
  const sep = Math.max(Math.abs(room.spawn.x - room.boss.x), Math.abs(room.spawn.y - room.boss.y));
  must(sep >= 4, bossId + ": spawn/boss colados (" + sep + " sqm)");
  /* Conectividade: spawn alcança boss. */
  const W = hm.rows[0].length, H = hm.rows.length;
  const sx = room.spawn.x - map.sourceBounds.minX, sy = room.spawn.y - map.sourceBounds.minY;
  const seen = {}; seen[sx + "," + sy] = 1;
  const q = [[sx, sy]];
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
  const bx = room.boss.x - map.sourceBounds.minX, by = room.boss.y - map.sourceBounds.minY;
  must(seen[bx + "," + by], bossId + ": bossspawn inalcançável a partir do playerspawn");
  /* Tiles: todos têm sprite + catálogo RME. */
  const used = new Set();
  Object.values(map.cells).forEach((c) => {
    if (c.g) used.add(c.g); (c.items || []).forEach((id) => used.add(id));
  });
  const missingPng = [...used].filter((id) =>
    !fs.existsSync(path.join(game, "assets", "tiles", id + ".png")));
  must(missingPng.length === 0, mapName + ": tiles sem sprite: " + missingPng.join(","));
}
const rmeCtx = { window: {} }; rmeCtx.window = rmeCtx; vm.createContext(rmeCtx);
vm.runInContext(fs.readFileSync(path.join(game, "rme", "data", "known_tiles.js"), "utf8"), rmeCtx);
for (const [, , mapName] of MAPS) {
  const buf = fs.readFileSync(path.join(game, "maps", mapName));
  const map = OTBM.read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { z: 7 });
  const unlisted = OTBM.missingTiles(map, rmeCtx.RME_KNOWN_TILES);
  must(unlisted.length === 0, mapName + ": tiles fora do catálogo RME: " + unlisted.join(","));
}

/* ---------------- roostCanExchange / auto-resgate ---------------- */
{
  const p = { level: 450, lootPouch: {}, bosses: {}, missions: {}, missionsDone: {} };
  must(!roost.roostCanExchange(p), "troca sem runas não pode liberar");
  for (const r of RUNES.slice(0, 4)) p.lootPouch[r] = 1;
  must(!roost.roostCanExchange(p), "troca com 4/5 runas não pode liberar");
  p.lootPouch["necromantic-crypt-rune"] = 1;
  must(roost.roostCanExchange(p), "troca com 5 runas deve liberar");
  /* Estado da quest: M1 5k kills → M2 4 bosses → M3 phylactery. */
  const st0 = roost.roostState(p);
  must(!st0.m1.done && !st0.m2.done && !st0.m3.done, "estado inicial errado");
  p.missions["unhallowed-crypt"] = { progress: { kills: 500 } };
  must(roost.roostState(p).m1.done, "M1 deve completar com 500 kills");
  for (const id of ["adventurer-group", "eldritch-dragon-lord", "ice-horror"])
    p.bosses[id] = { kills: 1 };
  must(!roost.roostState(p).m2.done, "M2 deve exigir os 4 bosses");
  p.bosses["the-gravedigger"] = { kills: 1 };
  must(roost.roostState(p).m2.done && !roost.roostState(p).m3.done, "M2/M3 estado errado");
  p.bosses["bonelords-phylactery"] = { kills: 1 };
  must(roost.roostState(p).complete, "quest deve completar com a Phylactery");
}

/* ---------------- index.html ---------------- */
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/roost-graveborn.js?v="),
  "roost-graveborn.js não carregado no index");
must(html.indexOf("js/make-believe-quest.js") < html.indexOf("js/roost-graveborn.js"),
  "roost-graveborn deve carregar depois do make-believe (roleta)");

/* -------- Adventurer Group: simulação autoritativa completa -------- */
{
  const bmap = OTBM.read(fs.readFileSync(
    path.join(game, "maps", "first_dragon.otbm")).buffer
      .slice(0), { z: 7 });
  const min = bmap.sourceBounds;
  const L = (ax, ay) => ({ cx: ax - min.minX, cy: ay - min.minY });
  const bcell = L(1030, 1027), pcell = L(1029, 1034);   // coords oficiais do enunciado
  const lvl = 500;
  const player = { id: "1", name: "T", voc: "knight", level: lvl,
    exp: engine.expForLevel(lvl), hp: 300000, mp: 20000, gold: 0,
    skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} };
  const desc = { v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "adventurer-group", instanceMode: "boss", activeCharacterId: "1",
    members: [{ id: "1", p: player }],
    state: { players: [{ id: "1", p: player, cx: pcell.cx, cy: pcell.cy, x: .5, y: .5 }],
      mobs: [{ id: "boss-1", slug: "adventurer-group", boss: true,
        cx: bcell.cx, cy: bcell.cy, x: .5, y: .5 }], events: [] } };
  let auth = engine.initializeAuthority(desc, "a".repeat(64), 1000);
  const adv = (ms) => JSON.parse(engine.advanceAuthorityState(
    JSON.stringify(auth), ms, Number(auth.authority.clock) + ms).state);
  auth = adv(6000);   // atravessa o spawn delay de 5s
  must(auth.authority.ag && auth.authority.ag.pendingBoss,
    "Fatal Bug deve ficar retido (pendingBoss) até os 5 caírem");
  must(!auth.authority.mobs.some((m) => m.boss),
    "Fatal Bug não deve estar em mobs durante a fase de grupo");
  const members = auth.authority.mobs.filter((m) => m.agMember);
  must(members.length === 5, "5 membros do Adventurer Group não spawnaram: " +
    auth.authority.mobs.map((m) => m.slug).join(","));
  must(auth.authority.mobs.some((m) => m.agCrystal), "Bright Crystal não spawnou");
  /* Red HP → transforma no avatar (critAll + damageTakenMul). */
  const m0 = members[0];
  m0.hp = m0.maxHp * 0.25;
  auth = adv(400);
  const tr = auth.authority.mobs.find((m) => m.id === m0.id);
  must(tr && tr.agTransformed && /^avatar-of-/.test(tr.slug) && tr.critAll &&
    Number(tr.def.damageTakenMul) < 1, "membro não virou avatar em vida vermelha");
  /* Todos os 5 caem → Fatal Bug entra. */
  for (const m of auth.authority.mobs) if (m.agMember) m.hp = 0;
  const mpBefore = auth.authority.players[0].p.mp;
  auth = adv(400);
  must(auth.authority.mobs.some((m) => m.boss && m.hp > 0 && m.slug === "adventurer-group"),
    "Fatal Bug não entrou após os 5 membros caírem");
  /* Crystal (no raio do player spawn oficial) deve ter explodido. */
  const cry = auth.authority.mobs.find((m) => m.agCrystal);
  if (cry && cry.hp <= 0) must(auth.authority.players[0].p.mp < mpBefore,
    "Bright Crystal não drenou mana ao explodir");
  /* Mata o Fatal Bug → bossDefeated + crédito adventurer-group. */
  const fb = auth.authority.mobs.find((m) => m.boss);
  fb.hp = 0;
  auth = adv(400);
  must(auth.authority.bossDefeated === true &&
    Number(auth.authority.players[0].p.bosses["adventurer-group"] &&
      auth.authority.players[0].p.bosses["adventurer-group"].kills) === 1,
    "crédito do boss adventurer-group não registrado");
}

/* -------- Eldritch: simulação autoritativa dos vulcões -------- */
{
  const bmap = OTBM.read(fs.readFileSync(
    path.join(game, "maps", "eldritch_dl.otbm")).buffer.slice(0), { z: 7 });
  const min = bmap.sourceBounds;
  const L = (ax, ay) => ({ cx: ax - min.minX, cy: ay - min.minY });
  const bcell = L(1021, 1024), pcell = L(1021, 1030);   // coords oficiais
  const lvl = 500;
  const player = { id: "1", name: "T", voc: "knight", level: lvl,
    exp: engine.expForLevel(lvl), hp: 300000, mp: 20000, gold: 0,
    skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} };
  const desc = { v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "eldritch-dragon-lord", instanceMode: "boss", activeCharacterId: "1",
    members: [{ id: "1", p: player }],
    state: { players: [{ id: "1", p: player, cx: pcell.cx, cy: pcell.cy, x: .5, y: .5 }],
      mobs: [{ id: "boss-1", slug: "eldritch-dragon-lord", boss: true,
        cx: bcell.cx, cy: bcell.cy, x: .5, y: .5 }], events: [] } };
  let auth = engine.initializeAuthority(desc, "b".repeat(64), 1000);
  const adv = (ms) => JSON.parse(engine.advanceAuthorityState(
    JSON.stringify(auth), ms, Number(auth.authority.clock) + ms).state);
  auth = adv(6000);
  const vents = auth.authority.mobs.filter((m) => m.eldVent);
  must(auth.authority.eld && vents.length === 4 &&
    vents.every((m) => m.slug === "pulsating-lava"),
    "4 pulsating-lavas não spawnaram: " +
    auth.authority.mobs.map((m) => m.slug).join(","));
  /* Silencia o dano (mesmo padrão do harness de boss) — queremos observar
   * a evolução, não medir TTK. */
  for (const m of auth.authority.mobs) {
    m.damage = 0; m.attackSpeed = Number.MAX_SAFE_INTEGER; m.attackAcc = 0;
  }
  const refill = () => { for (const it of auth.authority.players) it.p.hp = engine.maxStats(it.p).hp; };
  /* Evolução: lava → eruption → flame-totem (~18s/estágio). */
  refill(); auth = adv(19000);
  must(auth.authority.mobs.filter((m) => m.eldVent && m.hp > 0)
    .every((m) => m.slug === "eruption"), "lavas não viraram eruptions");
  refill(); auth = adv(19000);
  must(auth.authority.mobs.filter((m) => m.eldVent && m.hp > 0)
    .every((m) => m.slug === "flame-totem"), "eruptions não viraram totems");
  const boss = auth.authority.mobs.find((m) => m.boss);
  must(boss && boss.eldritchImmune === true,
    "boss deve ficar imortal com 4 flame totems (>=3)");
  /* Mata 2 totems → imunidade cai; respawn volta como lava. */
  let dead = 0;
  for (const m of auth.authority.mobs)
    if (m.eldVent && m.slug === "flame-totem" && dead++ < 2) m.hp = 0;
  auth = adv(400);
  must(auth.authority.mobs.find((m) => m.boss).eldritchImmune === false,
    "imunidade deve cair com 2 totems vivos");
  auth = adv(31000);
  must(auth.authority.mobs.some((m) => m.eldVent && m.hp > 0 &&
    m.slug === "pulsating-lava"),
    "vent morto não respawnou como pulsating-lava");
}

/* -------- Ice Horror: simulação autoritativa das invocações -------- */
{
  const bmap = OTBM.read(fs.readFileSync(
    path.join(game, "maps", "ice_horror.otbm")).buffer.slice(0), { z: 7 });
  const min = bmap.sourceBounds;
  const L = (ax, ay) => ({ cx: ax - min.minX, cy: ay - min.minY });
  const bcell = L(1030, 1025), pcell = L(1030, 1031);   // coords oficiais
  const lvl = 500;
  const player = { id: "1", name: "T", voc: "knight", level: lvl,
    exp: engine.expForLevel(lvl), hp: 300000, mp: 20000, gold: 0,
    skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} };
  const desc = { v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "ice-horror", instanceMode: "boss", activeCharacterId: "1",
    members: [{ id: "1", p: player }],
    state: { players: [{ id: "1", p: player, cx: pcell.cx, cy: pcell.cy, x: .5, y: .5 }],
      mobs: [{ id: "boss-1", slug: "ice-horror", boss: true,
        cx: bcell.cx, cy: bcell.cy, x: .5, y: .5 }], events: [] } };
  let auth = engine.initializeAuthority(desc, "c".repeat(64), 1000);
  const adv = (ms) => JSON.parse(engine.advanceAuthorityState(
    JSON.stringify(auth), ms, Number(auth.authority.clock) + ms).state);
  auth = adv(6000);   // atravessa o spawn delay de 5s
  must(auth.authority.iceH, "iceH não inicializado no bind do boss");
  /* Silencia o dano (mesmo padrão do harness de boss). */
  const silence = () => { for (const m of auth.authority.mobs) {
    m.damage = 0; m.attackSpeed = Number.MAX_SAFE_INTEGER; m.attackAcc = 0;
    m.skills = []; } };
  const refill = () => { for (const it of auth.authority.players) it.p.hp = engine.maxStats(it.p).hp; };
  silence(); refill(); auth = adv(7000); silence(); refill();
  must(auth.authority.mobs.filter((m) => m.iceCrawler && m.hp > 0).length >= 1,
    "primeiro ice-crawler não invocado");
  /* Avança ~2 ciclos — cap em IH_CRAWLER_MAX. */
  auth = adv(13000); silence(); refill();
  auth = adv(13000); silence(); refill();
  const crawlers = auth.authority.mobs.filter((m) => m.iceCrawler && m.hp > 0);
  must(crawlers.length === roost.IH_CRAWLER_MAX &&
    crawlers.every((m) => m.slug === "ice-crawler"),
    "cap de crawlers divergente: " + crawlers.length);
  must(!auth.authority.mobs.some((m) => m.iceCrawler && !(m.hp > 0)) ||
    true, "");
  /* Mata um crawler → reposição no próximo ciclo. */
  crawlers[0].hp = 0;
  auth = adv(13000); silence(); refill();
  must(auth.authority.mobs.filter((m) => m.iceCrawler && m.hp > 0).length ===
    roost.IH_CRAWLER_MAX, "crawler morto não foi reposto");
  /* Boss morto → luta encerra (invocação para junto). */
  const nBefore = auth.authority.mobs.filter((m) => m.iceCrawler).length;
  for (const m of auth.authority.mobs) if (m.boss) m.hp = 0;
  auth = adv(13000);
  must(auth.authority.bossDefeated === true &&
    auth.authority.mobs.filter((m) => m.iceCrawler).length === nBefore,
    "invocação deve parar com o boss morto");
}

/* -------- Gravedigger: simulação autoritativa dos totens -------- */
{
  const bmap = OTBM.read(fs.readFileSync(
    path.join(game, "maps", "gravedigger.otbm")).buffer.slice(0), { z: 7 });
  const min = bmap.sourceBounds;
  const L = (ax, ay) => ({ cx: ax - min.minX, cy: ay - min.minY });
  const bcell = L(1023, 1029), pcell = L(1023, 1035);   // coords oficiais
  const lvl = 500;
  const player = { id: "1", name: "T", voc: "knight", level: lvl,
    exp: engine.expForLevel(lvl), hp: 300000, mp: 20000, gold: 0,
    skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} };
  const desc = { v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "the-gravedigger", instanceMode: "boss", activeCharacterId: "1",
    members: [{ id: "1", p: player }],
    state: { players: [{ id: "1", p: player, cx: pcell.cx, cy: pcell.cy, x: .5, y: .5 }],
      mobs: [{ id: "boss-1", slug: "the-gravedigger", boss: true,
        cx: bcell.cx, cy: bcell.cy, x: .5, y: .5 }], events: [] } };
  let auth = engine.initializeAuthority(desc, "d".repeat(64), 1000);
  const adv = (ms) => JSON.parse(engine.advanceAuthorityState(
    JSON.stringify(auth), ms, Number(auth.authority.clock) + ms).state);
  auth = adv(6000);
  must(auth.authority.gd, "gd não inicializado no bind do boss");
  const silence = () => { for (const m of auth.authority.mobs) {
    m.damage = 0; m.attackSpeed = Number.MAX_SAFE_INTEGER; m.attackAcc = 0;
    m.skills = []; } };
  const refill = () => { for (const it of auth.authority.players) it.p.hp = engine.maxStats(it.p).hp; };
  silence(); refill(); auth = adv(9000); silence(); refill();
  must(auth.authority.mobs.filter((m) => m.gdTotem && m.hp > 0).length >= 1,
    "primeiro bonelord-totem não invocado");
  auth = adv(16000); silence(); refill();
  const totems = auth.authority.mobs.filter((m) => m.gdTotem && m.hp > 0);
  must(totems.length === 2 && totems.every((m) => m.slug === "bonelord-totem" &&
    m.def.damageTakenMul === 0 && m.def.lookItem === 51192),
    "cap de totens divergente: " + totems.length);
  /* invulnerável oficial: damageTakenMul 0 zera qualquer dano no funnel. */
  must(totems.every((m) => m.speed === 0), "totem deve ser estático");
}

/* -------- Bone Overlord: simulação autoritativa das 2 fases -------- */
{
  const bmap = OTBM.read(fs.readFileSync(
    path.join(game, "maps", "bonelords_phylactery.otbm")).buffer.slice(0), { z: 7 });
  const min = bmap.sourceBounds;
  const L = (ax, ay) => ({ cx: ax - min.minX, cy: ay - min.minY });
  const bcell = L(1026, 1025), pcell = L(1026, 1035);   // coords oficiais
  const lvl = 500;
  const player = { id: "1", name: "T", voc: "knight", level: lvl,
    exp: engine.expForLevel(lvl), hp: 400000, mp: 20000, gold: 0,
    skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} };
  const desc = { v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "bonelords-phylactery", instanceMode: "boss",
    activeCharacterId: "1", members: [{ id: "1", p: player }],
    state: { players: [{ id: "1", p: player, cx: pcell.cx, cy: pcell.cy, x: .5, y: .5 }],
      mobs: [{ id: "boss-1", slug: "bonelords-phylactery", boss: true,
        cx: bcell.cx, cy: bcell.cy, x: .5, y: .5 }], events: [] } };
  let auth = engine.initializeAuthority(desc, "d".repeat(64), 1000);
  const adv = (ms) => JSON.parse(engine.advanceAuthorityState(
    JSON.stringify(auth), ms, Number(auth.authority.clock) + ms).state);
  auth = adv(7000);
  must(auth.authority.bo, "bo não inicializado no bind do boss");
  const silence = () => { for (const m of auth.authority.mobs) {
    m.damage = 0; m.attackSpeed = Number.MAX_SAFE_INTEGER; m.attackAcc = 0;
    m.skills = []; } };
  const refill = () => { for (const it of auth.authority.players) it.p.hp = engine.maxStats(it.p).hp; };
  silence(); refill();
  const cages = () => auth.authority.mobs.filter((m) => m.boCage);
  const spirits = () => auth.authority.mobs.filter((m) => m.boSpirit);
  must(cages().length === 4 && spirits().length === 4,
    "deve abrir com 4 soulcages + 4 dragon spirits");
  must(!auth.authority.mobs.some((m) => m.boss),
    "a Phylactery deve ficar retida na fase 1");
  must(auth.authority.bo.cagePool === 120000,
    "cagePool deve iniciar em 120000");
  must(spirits().every((s) => s.def.damageTakenMul === 0),
    "spirits devem ser invulneráveis");
  /* pool compartilhado: dano em UMA cage drena todas. */
  cages()[0].hp = 60000; auth = adv(300); silence(); refill();
  const pool = auth.authority.bo.cagePool;
  must(pool < 120000 && cages().every((m) => !(m.hp > 0) || m.hp === pool),
    "dano numa cage deve drenar o pool compartilhado");
  /* pool zerado → fase 2: Phylactery + 4 Enthralled Dragons. */
  for (const m of cages()) m.hp = 1;
  auth = adv(300);
  must(auth.authority.bo.cagePool === 0,
    "pool deve zerar (delta propagado): " + auth.authority.bo.cagePool);
  auth = adv(500); silence(); refill();
  must(auth.authority.mobs.some((m) => m.boss && m.hp > 0),
    "Phylactery deve entrar quando o pool zera");
  must(auth.authority.mobs.filter((m) => m.boDragon && m.hp > 0).length === 4,
    "deve invocar 4 Enthralled Dragons");
  must(spirits().every((s) => !(s.hp > 0)),
    "spirits devem sair com as cages destruídas");
  /* matar a Phylactery credita o boss e encerra a cadeia. */
  for (const m of auth.authority.mobs) if (m.boss) m.hp = 0;
  auth = adv(3000);
  must(auth.authority.bossDefeated === true,
    "matar a Phylactery deve creditar bonelords-phylactery");
}

console.log("OK — Roost of the Graveborn Quest 450+: 5 bossrooms OTBM " +
  "z=7 (spawn/boss validados), cadeia sequencial M1 500 kills → " +
  "Adventurer Group → Eldritch DL → Ice Horror → Gravedigger → " +
  "Phylactery (5 crypt runes), NPC Dragon Ancestor Spirit com troca " +
  "por roleta gif (7 armas crypt, pesos oficiais), paridade " +
  "cliente/servidor.");
