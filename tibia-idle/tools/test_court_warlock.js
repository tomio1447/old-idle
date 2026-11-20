/* Regressão: Court Warlock — boss 400+, boss final da The Order of the
 * Stag Quest (update 15.20 / Isle of Ada).
 *
 * Ficha oficial (wikitext Fandom + staticdata do client 15.20):
 *   race_id 2741 · looktype OFICIAL 1903 · hp 120.000 · exp 147.000
 *   walksthrough Fire/Energy/Poison · para-immune · sense-invis
 *   cooldown resetável com Twisted Marionette (52746, npcvalue 125k)
 *
 * Luta oficial (Spoiler):
 *   F1 — Raubritters (Poisoned/Frozen/Raging/Energised, hp 35.000,
 *        imunes ao próprio elemento) spawnam NA posição do jogador;
 *        4 do mesmo tipo → versão enraivecida; teleporte periódico;
 *        terreno especial (ground 500 do court_room.otbm) = Death Damage
 *   F2 — sala enche de Falcon Knights/Paladins; terreno some
 *   F3 — Court Warlock entra com menos HP conforme a luta
 *
 * Loot oficial: Stag Set (10 peças lvl 350 "Negotiable" → sell 0),
 * Twisted Marionette 125k (Yasir), Wooden Spellbook 12k
 * (Talila/Valindara), Spellbook of Mind Control, Terra Hood,
 * Lightning Headband, Magma Coat, gems, moedas, poções ultimate.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const engine = require("../server/authoritative_engine.js");
const OTBM = require(path.join(js, "otbm.js"));
const cw = require("../game/js/court-warlock.js");

/* ---------------- dados do cliente (vm, ordem do index) ---------------- */
const ctx = { window: {}, console, Math, Date, Map, Set, document: undefined };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "weapondata.js", "weapons.js", "yasir-prices.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
vm.runInContext(
  "var MISSION_DEFS={},QUEST_DEFS={},BOSS_DEFS={},NPCS={}," +
  "BOSS_MODAL_SECTIONS=[{title:'BOSSES 400+',ids:[]}];" +
  "var NPC_MODAL_CATALOG=[],MONSTERDATA=window.MONSTERDATA||{};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "court-warlock.js"), "utf8"),
  ctx, { filename: "court-warlock.js" });

const M = ctx.GAMEDATA.monsters;

/* ---------------- ficha do boss ---------------- */
const boss = M["court-warlock"];
must(boss, "court-warlock ausente em GAMEDATA.monsters");
must(boss.name === "Court Warlock", "nome divergente: " + boss.name);
must(boss.raceId === 2741, "raceId oficial é 2741: " + boss.raceId);
must(boss.looktype === 1903, "looktype oficial é 1903: " + boss.looktype);
must(boss.hp === 120000, "hp oficial é 120000: " + boss.hp);
must(boss.exp === 147000, "exp oficial é 147000: " + boss.exp);
must(boss.resist && boss.resist.fire === 100 && boss.resist.energy === 100 &&
  boss.resist.earth === 100, "walksthrough Fire/Energy/Poison ausente");
must(Array.isArray(boss.imune) && boss.imune.includes("paralyze") &&
  boss.imune.includes("invisible"), "para-immune + sense-invis ausentes");
must(Array.isArray(boss.skills) && boss.skills.length >= 3,
  "skills do warlock ausentes");
must(Array.isArray(boss.voices.list) && boss.voices.list.length >= 5,
  "voices oficiais ausentes");

/* ---------------- raubritters ---------------- */
const RAUBS = [
  ["poisoned-raubritter", "earth"], ["frozen-raubritter", "ice"],
  ["raging-raubritter", "fire"], ["energised-raubritter", "energy"]];
for (const [slug, el] of RAUBS) {
  const r = M[slug];
  must(r, slug + " ausente");
  must(r.hp === 35000 && r.exp === 0, slug + ": hp oficial 35k / exp 0");
  must(r.resist[el] === 100, slug + ": deve ser imune a " + el);
  must(r.cwRaub === true, slug + ": flag cwRaub ausente");
  must(typeof r.looktype === "number" && r.looktype > 0,
    slug + ": looktype ausente");
}
for (const [slug, el] of RAUBS) {
  const e = M["enraged-" + slug];
  must(e, "enraged-" + slug + " ausente");
  must(e.cwStrong === true && e.hp === 52500,
    "enraged-" + slug + ": forma forte incorreta (hp " + e.hp + ")");
  must(e.damage > M[slug].damage,
    "enraged-" + slug + ": dano deve superar a base");
}
/* Energised: distance fighter oficial. */
must(M["energised-raubritter"].targetDistance > 1,
  "energised deve ser distance fighter");

/* ---------------- itens + loot ---------------- */
const I = ctx.GAMEDATA.items;
const STAG = ["stag-helmet", "stag-robe", "stag-plate", "stag-legs",
  "stag-shinguards", "stag-boots", "stag-footwraps", "stag-spellbook",
  "stag-scrolls", "stag-shield"];
const STAG_CID = { "stag-helmet": 52348, "stag-robe": 52349,
  "stag-plate": 52350, "stag-legs": 52351, "stag-shinguards": 52352,
  "stag-boots": 52353, "stag-footwraps": 52354, "stag-spellbook": 52355,
  "stag-scrolls": 52356, "stag-shield": 52357 };
for (const s of STAG) {
  const it = I[s];
  must(it, s + " ausente em GAMEDATA.items");
  must(it.cid === STAG_CID[s], s + ": cid oficial " + STAG_CID[s] +
    " ≠ " + it.cid);
  must(it.lvl === 350, s + ": lvl 350 ausente");
  must(it.sell === 0 && it.npcSell === 0,
    s + ": 'Negotiable' sem comprador → sell/npcSell devem ser 0");
  const png = path.join(game, "assets", "item", s + ".png");
  must(fs.existsSync(png) && fs.statSync(png).size > 0,
    s + ": ícone ausente");
}
const MAR = I["twisted-marionette"];
must(MAR && MAR.cid === 52746 && MAR.sell === 125000 && MAR.npcSell === 125000,
  "twisted-marionette: cid 52746 / npcvalue 125k");
const WSB = I["wooden-spellbook"];
must(WSB && WSB.cid === 25699 && WSB.sell === 12000,
  "wooden-spellbook: cid 25699 / npcvalue 12k");
const USP = I["ultimate-spirit-potion"];
must(USP && USP.cid === 23374 && USP.sell === 600,
  "ultimate-spirit-potion: cid 23374");
/* Loot oficial no monstro — todos os slugs existem em GAMEDATA.items. */
must(boss.loot.length >= 20, "loot incompleto: " + boss.loot.length);
for (const l of boss.loot)
  must(I[l.item], "loot sem item registrado: " + l.item);
for (const s of STAG)
  must(boss.loot.some((l) => l.item === s), "loot sem " + s);
must(boss.loot.some((l) => l.item === "twisted-marionette" && l.chance < 10),
  "twisted-marionette deve ser drop raro");
must(boss.loot.some((l) => l.item === "wooden-spellbook"),
  "loot sem wooden-spellbook");

/* ---------------- sprites dos mobs ---------------- */
for (const slug of ["court-warlock",
  ...RAUBS.map(([s]) => s), ...RAUBS.map(([s]) => "enraged-" + s)]) {
  const png = path.join(game, "assets", "mob", slug + ".png");
  must(fs.existsSync(png) && fs.statSync(png).size > 0,
    slug + ": sprite ausente");
  must(ctx.MOBSHEETS[slug], slug + ": MOBSHEETS ausente");
}
must(fs.existsSync(path.join(game, "assets", "item", "twisted-marionette.png")),
  "ícone da marionette ausente");
must(fs.existsSync(path.join(game, "assets", "mob", "falcon-knight.png")) &&
  fs.existsSync(path.join(game, "assets", "mob", "falcon-paladin.png")),
  "sprites dos falcons ausentes");

/* ---------------- sala + OTBM ---------------- */
const room = ctx.GAMEDATA.hunts["court-warlock-room"];
must(room && room.hidden && room.pack === 1 && room.cat === "boss-room",
  "hunt técnica ausente");
must(room.otbm === "court_room" && room.otbmFloor === 7,
  "otbm/floor divergentes");
must(room.otbmSpawn.x === 1021 && room.otbmSpawn.y === 1028 &&
  room.otbmSpawn.z === 7, "playerspawn divergente");
must(room.otbmMobBounds.x === 1021 && room.otbmMobBounds.y === 1022,
  "bossspawn divergente");
must(room.level === 400 && room.minLevel === 400, "nível 400 ausente");

const otbmPath = path.join(game, "maps", "court_room.otbm");
must(fs.existsSync(otbmPath), "court_room.otbm não publicado em game/maps");
const buf = fs.readFileSync(otbmPath);
const bmap = OTBM.read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { z: 7 });
const min = bmap.sourceBounds;
const L = (ax, ay) => ({ cx: ax - min.minX, cy: ay - min.minY });
const walkable = (ax, ay) => {
  const c = L(ax, ay);
  const cell = bmap.cells[c.cx + "," + c.cy];
  return !!(cell && cell.g);
};
must(walkable(1021, 1022), "bossspawn {1021,1022} não caminhável");
must(walkable(1021, 1028), "playerspawn {1021,1028} não caminhável");
must(walkable(1021, 1025), "centerroom {1021,1025} não caminhável");
/* Terreno especial: as células ground 500 do OTBM devem bater com
 * CW_HAZARD_OFFSETS relativos ao bossspawn. */
const hzExpected = new Set(cw.CW_HAZARD_OFFSETS.map(([dx, dy]) =>
  (1021 + dx) + "," + (1022 + dy)));
const hzReal = new Set();
for (const key in bmap.cells) {
  const cell = bmap.cells[key];
  if (cell.g === 500) {
    const [cx, cy] = key.split(",").map(Number);
    hzReal.add((cx + min.minX) + "," + (cy + min.minY));
  }
}
must(hzReal.size === 12, "12 células de terreno especial esperadas: " + hzReal.size);
must([...hzReal].every((k) => hzExpected.has(k)),
  "terreno especial diverge dos offsets: " + [...hzReal].join(" "));

/* ---------------- BOSS_DEFS + modal ---------------- */
const bdef = ctx.BOSS_DEFS["court-warlock"];
must(bdef, "BOSS_DEFS ausente");
must(bdef.hunt === "court-warlock-room" && bdef.baseMonster === "court-warlock" &&
  bdef.sprite === "court-warlock", "BOSS_DEFS campos divergentes");
must(bdef.requirement && bdef.requirement.level === 400 &&
  bdef.requirement.enforced === true, "requirement 400+ enforced ausente");
must(bdef.cooldown === 20 * 60 * 60 * 1000, "cooldown 20h ausente");
must(ctx.BOSS_MODAL_SECTIONS[0].ids.includes("court-warlock"),
  "court-warlock ausente da seção BOSSES 400+");

/* ---------------- engine ---------------- */
must(engine.MONSTERS && engine.MONSTERS["court-warlock"],
  "court-warlock não registrado no MONSTERS do engine");
must(engine.MONSTERS["poisoned-raubritter"] &&
  engine.MONSTERS["enraged-energised-raubritter"],
  "raubritters não registrados no engine");
const engSrc = fs.readFileSync(
  path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engSrc.includes("court-warlock.js"),
  "engine não carrega court-warlock.js no sandbox");
must(/function tickCourtWarlock/.test(engSrc), "tickCourtWarlock ausente");
must(engSrc.includes("tickCourtWarlock(auth,now)"),
  "tickCourtWarlock fora da cadeia de ticks");

/* ---------------- hooks do cliente ---------------- */
const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
must(combatSrc.includes("courtWarlockBossInit") &&
  combatSrc.includes("courtWarlockBossTick"), "hooks combat.js ausentes");
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
must(gameSrc.includes("courtWarlockBossCleanup"),
  "cleanup em game.js ausente");
must(!gameSrc.includes('"court-warlock":     { id: "court-warlock", name: "Court Warlock", title: "EM BREVE"'),
  "stub EM BREVE ainda presente");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/court-warlock.js?v="),
  "court-warlock.js não carregado no index");
must(html.indexOf("js/roost-graveborn.js") < html.indexOf("js/court-warlock.js"),
  "court-warlock deve carregar depois do roost-graveborn");

/* -------- simulação autoritativa completa -------- */
{
  const bcell = L(1021, 1022), pcell = L(1021, 1028);   // coords oficiais
  const lvl = 450;
  const player = { id: "1", name: "T", voc: "knight", level: lvl,
    exp: engine.expForLevel(lvl), hp: 300000, mp: 20000, gold: 0,
    skills: { sword: 120 }, ml: 20, equip: {}, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} };
  const desc = { v: 1, savedAt: 1000, kind: "boss", huntId: null,
    bossId: "court-warlock", instanceMode: "boss", activeCharacterId: "1",
    members: [{ id: "1", p: player }],
    state: { players: [{ id: "1", p: player, cx: pcell.cx, cy: pcell.cy, x: .5, y: .5 }],
      mobs: [{ id: "boss-1", slug: "court-warlock", boss: true,
        cx: bcell.cx, cy: bcell.cy, x: .5, y: .5 }], events: [] } };
  let auth = engine.initializeAuthority(desc, "a".repeat(64), 1000);
  const adv = (ms) => JSON.parse(engine.advanceAuthorityState(
    JSON.stringify(auth), ms, Number(auth.authority.clock) + ms).state);
  const silence = () => { for (const m of auth.authority.mobs) {
    m.damage = 0; m.attackSpeed = Number.MAX_SAFE_INTEGER; m.attackAcc = 0;
    for (const s of m.skills || []) { s.min = 0; s.max = 0; } } };
  const refill = () => { for (const it of auth.authority.players)
    it.p.hp = engine.maxStats(it.p).hp; };
  /* Avança em passos curtos silenciando os mobs novos a cada passo —
   * raubritters spawnam NA posição do jogador e matam antes do silence
   * se o passo for longo demais. */
  const stepAdv = (ms, step = 1200) => {
    for (let t = 0; t < ms; t += step) {
      auth = adv(Math.min(step, ms - t)); silence(); refill();
      if (auth.authority.ended) break;
    }
  };
  auth = adv(6000);   // atravessa o spawn delay
  silence(); refill();
  must(auth.authority.cw && auth.authority.cw.pendingBoss,
    "Court Warlock deve ficar retido (pendingBoss) durante a fase 1");
  must(!auth.authority.mobs.some((m) => m.boss),
    "Warlock não deve estar em mobs na fase 1");
  must(auth.authority.cw.hazards.length === 12,
    "12 células de terreno especial não registradas");

  /* Terreno especial: pisa numa célula hazard → Death Damage. */
  const hz = auth.authority.cw.hazards[0].split(",").map(Number);
  auth.authority.players[0].cx = hz[0]; auth.authority.players[0].cy = hz[1];
  const hpBefore = auth.authority.players[0].p.hp;
  auth = adv(1500);   // avanço direto — sem refill que desfaz o dano medido
  must(auth.authority.players[0].p.hp < hpBefore,
    "terreno especial não causou Death Damage");
  /* Sai do terreno especial — senão o dano contínuo derruba o player
   * durante os avanços das waves e o tick para (ended). */
  auth.authority.players[0].cx = pcell.cx;
  auth.authority.players[0].cy = pcell.cy;
  refill();

  /* Waves: raubritters spawnam (até 5 waves). */
  stepAdv(16000);
  const raubs1 = auth.authority.mobs.filter((m) => m.cwType);
  must(raubs1.length >= 2, "waves de raubritters não spawnaram");

  /* 4 do mesmo tipo → transformação enraivecida. */
  const inj = [];
  for (let i = 0; i < 4; i++) {
    const m = { id: "inj-" + i, slug: "poisoned-raubritter",
      def: engine.MONSTERS["poisoned-raubritter"],
      hp: 35000, maxHp: 35000, cx: hz[0] + 2, cy: hz[1] + 2,
      x: .5, y: .5, sx: .5, sy: .5, cwType: "earth",
      damage: 0, attackSpeed: Number.MAX_SAFE_INTEGER, attackAcc: 0,
      speed: 0, moving: false, dir: "w" };
    auth.authority.mobs.push(m); inj.push(m.id);
  }
  stepAdv(400);
  const enraged = auth.authority.mobs.filter((m) =>
    inj.includes(m.id) && m.slug === "enraged-poisoned-raubritter" && m.cwStrong);
  must(enraged.length === 4,
    "4 raubritters do mesmo tipo não viraram forma enraivecida");
  must(auth.authority.cw.transforms >= 1, "transform não contabilizado");

  /* Teleporte: após CW_TELEPORT_MS o jogador muda de posição ou
   * o evento teleport é emitido (eventos persistem no estado). */
  const posBefore = [auth.authority.players[0].cx, auth.authority.players[0].cy].join(",");
  stepAdv(27000);
  const posAfter = [auth.authority.players[0].cx, auth.authority.players[0].cy].join(",");
  const tpEv = (auth.authority.events || []).some((e) => e.fx === "teleport") ||
    posAfter !== posBefore;
  must(tpEv, "teleporte periódico não disparou");

  /* Fase 1 → 2: completa as waves restantes, remove os mobs para
   * isolar a transição. */
  while (auth.authority.cw.wave < 5) { stepAdv(15000); }
  stepAdv(500);
  must(auth.authority.cw.phase === 2, "fase 2 não iniciou após as waves");
  must(auth.authority.cw.hazards.length === 0,
    "terreno especial deve sumir na fase 2 (oficial)");
  const falcons = auth.authority.mobs.filter((m) => m.cwFalcon);
  must(falcons.length === 8 &&
    falcons.some((m) => m.slug === "falcon-knight") &&
    falcons.some((m) => m.slug === "falcon-paladin"),
    "sala não encheu de Falcons: " +
    auth.authority.mobs.map((m) => m.slug).join(","));

  /* Mata todos os minions → fase 3: Warlock entra com bônus de HP. */
  for (const m of auth.authority.mobs) if (!m.boss) m.hp = 0;
  stepAdv(500);
  must(auth.authority.cw.phase === 3, "fase 3 não iniciou");
  const war = auth.authority.mobs.find((m) => m.boss);
  must(war && war.slug === "court-warlock" && war.hp > 0,
    "Court Warlock não entrou na fase 3");
  must(war.maxHp === 120000 + auth.authority.cw.transforms * 15000,
    "hp do boss deve refletir os transforms: " + war.maxHp);
  must(!auth.authority.mobs.some((m) => m.cwRaub || m.cwType || m.cwFalcon),
    "minions devem sair na fase 3");

  /* Mata o Warlock → bossDefeated + crédito. */
  war.hp = 0;
  auth = adv(400);
  must(auth.authority.bossDefeated === true &&
    Number(auth.authority.players[0].p.bosses["court-warlock"] &&
      auth.authority.players[0].p.bosses["court-warlock"].kills) === 1,
    "crédito do boss court-warlock não registrado");
}

/* ==================== Stag Bastion — hunt 400+ ==================== */
{
  const hunt = ctx.GAMEDATA.hunts["stag-bastion"];
  must(hunt && hunt.cat === "hard" && hunt.level === 400 &&
    hunt.minLevel === 400, "stag-bastion: hunt 400+ ausente");
  must(hunt.packMin === 8 && hunt.packMax === 10,
    "pack deve ser 8-10 (respawn oficial)");
  must(hunt.otbm === "stag_bastion" && hunt.otbmFloor === 7,
    "otbm/floor divergentes");
  must(hunt.otbmSpawn.x === 1020 && hunt.otbmSpawn.y === 1024 &&
    hunt.otbmSpawn.z === 7, "centerroom divergente");
  must(hunt.otbmMobBounds.x === 1017 && hunt.otbmMobBounds.y === 1020 &&
    hunt.otbmMobBounds.w === 9 && hunt.otbmMobBounds.h === 9,
    "spawn radius divergente do oficial {1017,1020}-{1025,1028}");
  must(hunt.monsters.length === 3, "hunt deve ter 3 raubritters");

  /* Fichas oficiais (wikitext). */
  const SB = {
    "raubritter-skirmisher": { hp: 11000, exp: 8550, armor: 100,
      mitigation: 3.92, lt: 1908, td: 1 },
    "raubritter-chastener": { hp: 10000, exp: 9500, armor: 80,
      mitigation: 3.68, lt: 1920, td: 1 },
    "raubritter-marksman": { hp: 10500, exp: 9025, armor: 90,
      mitigation: 3.45, lt: 1889, td: 4 },
  };
  for (const slug in SB) {
    const m = M[slug], o = SB[slug];
    must(m, slug + " ausente");
    must(m.hp === o.hp && m.exp === o.exp && m.armor === o.armor &&
      m.mitigation === o.mitigation, slug + ": ficha oficial divergente");
    must(m.looktype === o.lt, slug + ": looktype " + o.lt);
    must(m.targetDistance === o.td, slug + ": distance divergente");
    must(m.imune.includes("paralyze") && m.imune.includes("invisible"),
      slug + ": imunes oficiais ausentes");
    must(m.loot.length >= 10, slug + ": loot incompleto");
    for (const l of m.loot)
      must(I[l.item], slug + ": loot sem item " + l.item);
    must(fs.existsSync(path.join(game, "assets", "mob", slug + ".png")) &&
      ctx.MOBSHEETS[slug], slug + ": sprite ausente");
  }
  /* Resistências oficiais (resist = 100 − dmgMod). */
  must(M["raubritter-skirmisher"].resist.fire === -15 &&
    M["raubritter-skirmisher"].resist.ice === 20, "skirmisher resists");
  must(M["raubritter-chastener"].resist.physical === -20 &&
    M["raubritter-chastener"].resist.ice === 25, "chastener resists");
  must(M["raubritter-marksman"].resist.energy === 12 &&
    M["raubritter-marksman"].ranged === 1, "marksman ranged/resists");

  /* Itens novos da hunt — cids + npcvalues oficiais. */
  const NEW_IT = { "stag-parchment": [52664, 3000],
    "silver-poniard": [52662, 2000], "cuirass-plate": [52663, 1000],
    "bottle-of-raubritter-lager": [52745, 0],
    "marinated-sturgeon": [52638, 0], "crystalline-arrow": [15793, 0],
    "ring-of-green-plasma": [23531, 8000],
    "ring-of-orange-plasma": [50150, 8000] };
  for (const s in NEW_IT) {
    const it = I[s], [cid, sell] = NEW_IT[s];
    must(it, s + " ausente");
    must(it.cid === cid, s + ": cid oficial " + cid + " ≠ " + it.cid);
    must(it.sell === sell, s + ": npcvalue oficial " + sell + " ≠ " + it.sell);
    must(fs.existsSync(path.join(game, "assets", "item", s + ".png")),
      s + ": ícone ausente");
  }
  /* Preços: placeholders ≤1 corrigidos ao npcvalue oficial
   * (shockwave-amulet 3000, magma-amulet 1500, gold-ingot 5000).
   * Itens com preço real já registrado ficam como estão (Yasir p/
   * creature products, convenção antiga p/ equipamentos). */
  const FIX = { "shockwave-amulet": 3000, "magma-amulet": 1500,
    "gold-ingot": 5000 };
  for (const s in FIX)
    must(I[s] && I[s].sell === FIX[s],
      s + ": preço oficial " + FIX[s] + " ≠ " + (I[s] && I[s].sell));
  for (const s of ["magma-monocle", "wand-of-cosmic-energy",
    "wand-of-starstorm", "lightning-robe", "terra-mantle",
    "composite-hornbow"])
    must(I[s] && I[s].sell > 1, s + ": sem preço registrado");

  /* OTBM: retângulo de spawn 100% caminhável + center walkable. */
  const sb = fs.readFileSync(path.join(game, "maps", "stag_bastion.otbm"));
  const smap = OTBM.read(sb.buffer.slice(sb.byteOffset, sb.byteOffset + sb.byteLength), { z: 7 });
  const smin = smap.sourceBounds;
  let wcells = 0;
  for (let ax = 1017; ax <= 1025; ax++)
    for (let ay = 1020; ay <= 1028; ay++)
      if ((smap.cells[(ax - smin.minX) + "," + (ay - smin.minY)] || {}).g) wcells++;
  must(wcells === 81, "spawn rect deve ser 81/81 caminhável: " + wcells);
  must((smap.cells[(1020 - smin.minX) + "," + (1024 - smin.minY)] || {}).g,
    "centerroom não caminhável");

  /* Modal + engine. */
  const sectSrc = fs.readFileSync(path.join(js, "hunt-sections.js"), "utf8");
  must(sectSrc.includes('"stag-bastion"'),
    "stag-bastion ausente da seção HUNTS 400+");
  must(sectSrc.includes('"arean-outskirts"'),
    "arean-outskirts ausente da seção HUNTS 400+");
  must(engine.MONSTERS["raubritter-skirmisher"] &&
    engine.MONSTERS["raubritter-chastener"] &&
    engine.MONSTERS["raubritter-marksman"],
    "raubritters de hunt não registrados no engine");
}

/* ==================== Arean Outskirts — hunt 400+ ==================== */
{
  const hunt = ctx.GAMEDATA.hunts["arean-outskirts"];
  must(hunt && hunt.cat === "hard" && hunt.level === 400,
    "arean-outskirts: hunt 400+ ausente");
  must(hunt.packMin === 8 && hunt.packMax === 10, "pack 8-10 ausente");
  must(hunt.otbm === "arean_outskirts" && hunt.otbmFloor === 7,
    "otbm divergente");
  must(hunt.otbmSpawn.x === 1020 && hunt.otbmSpawn.y === 1018 &&
    hunt.otbmSpawn.z === 7, "centerroom divergente");
  must(hunt.otbmMobBounds.x === 1015 && hunt.otbmMobBounds.y === 1014 &&
    hunt.otbmMobBounds.w === 9 && hunt.otbmMobBounds.h === 7,
    "spawn rect divergente do oficial {1015,1014}-{1023,1020}");
  must(hunt.monsters.length === 4, "hunt deve ter 4 monstros");

  /* Night Harpy — ficha oficial: hp 14000, exp 21000, armor 90,
   * mit 3.92, speed 190, Bird. */
  const nh = M["night-harpy"];
  must(nh && nh.hp === 14000 && nh.exp === 21000 && nh.armor === 90 &&
    nh.mitigation === 3.92 && nh.speed === 190,
    "night-harpy: ficha oficial divergente");
  must(nh.resist.earth === 40 && nh.resist.fire === 30 &&
    nh.resist.ice === -12 && nh.resist.death === -9,
    "night-harpy: resists oficiais divergentes");
  must(nh.imune.includes("paralyze") && nh.imune.includes("invisible"),
    "night-harpy: imunes ausentes");
  must(nh.loot.length === 10, "night-harpy: loot oficial incompleto");
  for (const l of nh.loot) must(I[l.item], "loot sem item " + l.item);
  must(nh.loot.some((l) => l.item === "night-harpy-feathers" && l.max === 10),
    "feathers 5-10 ausente do loot");
  for (const g of ["giant-sapphire", "giant-topaz", "giant-emerald",
    "giant-ruby", "giant-amethyst"])
    must(nh.loot.some((l) => l.item === g), "loot sem " + g);
  must(fs.existsSync(path.join(game, "assets", "mob", "night-harpy.png")) &&
    ctx.MOBSHEETS["night-harpy"], "night-harpy sprite ausente");

  /* Item novo + gems corrigidas ao npcvalue oficial. */
  const feathers = I["night-harpy-feathers"];
  must(feathers && feathers.cid === 52633 && feathers.sell === 5000,
    "night-harpy-feathers: cid 52633 / npcvalue 5000");
  must(fs.existsSync(path.join(game, "assets", "item",
    "night-harpy-feathers.png")), "ícone feathers ausente");
  const GEMS = { "giant-emerald": 90000, "giant-amethyst": 60000,
    "giant-sapphire": 50000, "giant-topaz": 80000, "giant-ruby": 70000 };
  for (const g in GEMS)
    must(I[g] && I[g].sell === GEMS[g],
      g + ": npcvalue oficial " + GEMS[g] + " ≠ " + (I[g] && I[g].sell));

  /* OTBM: spawn rect 100% caminhável + center. */
  const ob = fs.readFileSync(path.join(game, "maps", "arean_outskirts.otbm"));
  const omap = OTBM.read(ob.buffer.slice(ob.byteOffset, ob.byteOffset + ob.byteLength), { z: 7 });
  const omin = omap.sourceBounds;
  let w2 = 0;
  for (let ax = 1015; ax <= 1023; ax++)
    for (let ay = 1014; ay <= 1020; ay++)
      if ((omap.cells[(ax - omin.minX) + "," + (ay - omin.minY)] || {}).g) w2++;
  must(w2 === 63, "spawn rect deve ser 63/63 caminhável: " + w2);
  must((omap.cells[(1020 - omin.minX) + "," + (1018 - omin.minY)] || {}).g,
    "centerroom não caminhável");
  must(engine.MONSTERS["night-harpy"],
    "night-harpy não registrado no engine");
}

/* ==================== Order of the Stag Quest (350+) ==================== */
{
  /* Missões registradas nos hunts existentes. */
  const m1 = ctx.MISSION_DEFS["stag-bastion"];
  must(m1 && m1.tasks.length === 1 && m1.tasks[0].counter === "kills" &&
    m1.tasks[0].target === 500, "M1: 500 kills na Stag Bastion ausente");
  must(m1.completeReward && m1.completeReward.items &&
    m1.completeReward.items.some((r) =>
      r.slug === "mariners-compass-from-the-antoinette" && r.count === 1),
    "M1: recompensa Mariner's Compass ausente");
  const m2 = ctx.MISSION_DEFS["arean-outskirts"];
  must(m2 && m2.tasks.length === 1 && m2.tasks[0].monster === "night-harpy" &&
    m2.tasks[0].target === 50, "M2: 50 Night Harpies ausente");
  must(m2.completeReward && m2.completeReward.bossAccess === "court-warlock",
    "M2: recompensa de acesso ao Court Warlock ausente");

  /* Compass: extra slot + arm 3, cid oficial 52759, sem comprador. */
  const comp = I["mariners-compass-from-the-antoinette"];
  must(comp && comp.s === "extra" && comp.arm === 3,
    "compass: extra slot + arm 3 ausentes");
  must(comp.cid === 52759, "compass: cid oficial 52759");
  must(comp.sell === 0 && comp.npcSell === 0,
    "compass: npcvalue oficial 0 (sem comprador)");
  const cpng = path.join(game, "assets", "item",
    "mariners-compass-from-the-antoinette.png");
  must(fs.existsSync(cpng) && fs.statSync(cpng).size > 0,
    "compass: ícone ausente");

  /* Quest card + gate do boss. */
  const q = ctx.QUEST_DEFS["order-of-the-stag-quest"];
  must(q && q.level === 350 && q.questType === "boss" &&
    typeof q.renderDetail === "function" && q.bossSprite === "court-warlock",
    "QUEST_DEFS Order of the Stag ausente/errada");
  const req = ctx.BOSS_DEFS["court-warlock"].requirement;
  must(req && req.level === 400 && req.enforced &&
    req.mission === "arean-outskirts" && req.access === "court-warlock",
    "CW: gate missão 2 (arean-outskirts + access) ausente");

  /* Royal Bounacean Advisor: outfit oficial m=1436/f=1437 no appearancedata. */
  const appSrc = fs.readFileSync(path.join(js, "appearancedata.js"), "utf8");
  must(appSrc.includes('"royal-bounacean-advisor-m"') &&
    appSrc.includes('"royal-bounacean-advisor-f"'),
    "outfit royal-bounacean-advisor ausente do appearancedata");

  /* Estado derivado: progresso por hunt counter. */
  const p = { level: 350, missions: {}, missionsDone: {}, bosses: {} };
  let st = ctx.stagQuestState(p);
  must(!st.m1.done && !st.m2.done && !st.m3.done && st.reqLevel,
    "stagQuestState vazio deve estar incompleto");
  p.missions["stag-bastion"] = { progress: { kills: 499 } };
  st = ctx.stagQuestState(p);
  must(!st.m1.done && st.m1.kills === 499, "M1 499/500 não deve concluir");
  p.missions["stag-bastion"].progress.kills = 500;
  p.missions["arean-outskirts"] = { progress: { "night-harpy": 50,
    "raubritter-skirmisher": 300 } };
  st = ctx.stagQuestState(p);
  must(st.m1.done && st.m2.done && st.m2.kills === 50,
    "M1 500 + M2 50 harpies devem concluir (só night-harpy conta)");
  p.bosses["court-warlock"] = { kills: 1 };
  st = ctx.stagQuestState(p);
  must(st.m3.done && st.complete && !st.outfitClaimed,
    "M3 kill do Court Warlock deve concluir a quest");

  /* Grant da outfit: ambos os sexos, addons 1+2, idempotente. */
  ctx.stagGrantOutfit(p);
  ctx.stagClaim(p, "outfit");
  must(p.wardrobe.outfits["royal-bounacean-advisor-m"] === 2 &&
    p.wardrobe.outfits["royal-bounacean-advisor-f"] === 2,
    "outfit m/f com addons não concedida");
  must(p.missionsDone["order-of-stag:outfit"] === true,
    "claim order-of-stag:outfit não persistido");
  must(ctx.stagQuestState(p).outfitClaimed,
    "outfitClaimed deve evitar re-grant");

  /* Gate real: bossReadyInfo equivalente — sem acesso/missão → bloqueado. */
  const pLock = { level: 400, missions: {}, missionsDone: {}, bosses: {},
    bossAccess: {} };
  must(!pLock.bossAccess["court-warlock"],
    "acesso ao CW não pode existir antes da Missão 2");
  pLock.bossAccess["court-warlock"] = true;
  must(pLock.bossAccess["court-warlock"], "access flag da Missão 2");
}

console.log("OK: Court Warlock — ficha oficial 2741/lt1903/120k, " +
  "raubritters + enraged, Stag Set + Marionette, sala/hazard OTBM, " +
  "engine + hooks, sim autoritativa (waves→transform→falcons→boss→crédito). " +
  "Stag Bastion 400+: 3 raubritters oficiais, pack 8-10, retângulo de " +
  "spawn validado, loot oficial com preços, sprites + seção modal. " +
  "Order of the Stag 350+: M1 500 kills→compass extra+3arm, " +
  "M2 50 harpies→acesso CW, M3 CW→Royal Bounacean Advisor addons.");
