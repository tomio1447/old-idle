/* Regressão: Make Believe Quest (800+, update 15.30).
 *
 * Cadeia: req (Doctor Marrow + 800) → M1 2500 kills Moonstone Castle
 * (libera Mimar Haffar + Maior Domus) → M2 matar os 2 (libera hunt
 * Radiant Skyhold) → M3 5000 kills Radiant Skyhold (libera o world boss
 * Phosphorus) → M4 matar Phosphorus → 4 rewards 1x por conta:
 * outfit Illuminated Warrior (addons 1+2), montaria Radiant Nimbus,
 * 1 arma + 1 elmo Moonsilver aleatórios (roleta).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

/* ---------------- cliente (vm, ordem do index) ---------------- */
const ctx = { window: {}, console, Math, Date, Map, Set, Object, JSON, Number,
              String, Array, sessionStorage: { getItem: () => null, setItem: () => {} },
              MISSION_DEFS: {}, QUEST_DEFS: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext("var BOSS_DEFS={};", ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js",
                 "weapondata.js", "weapons.js", "mimar-haffar.js", "radiant-skyhold.js",
                 "moonstone-castle.js", "final-radiant.js", "make-believe-quest.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);

/* ---------------- missões (MISSION_DEFS) ---------------- */
const m1 = ctx.MISSION_DEFS["moonstone-castle"];
must(m1 && m1.tasks.length === 1, "missão moonstone-castle ausente");
must(m1.tasks[0].counter === "kills" && m1.tasks[0].target === 2500,
  "M1 deve ser counter kills x2500");
const m3 = ctx.MISSION_DEFS["radiant-skyhold"];
must(m3 && m3.tasks[0].counter === "kills" && m3.tasks[0].target === 5000,
  "M3 deve ser counter kills x5000");
must(!m1.tasks[0].monster && !m3.tasks[0].monster,
  "task kills-counter não deve ter monster (match em handleMissionKill)");

/* ---------------- quest def ---------------- */
const q = ctx.QUEST_DEFS["make-believe-quest"];
must(q, "QUEST_DEFS make-believe-quest ausente");
must(q.level === 800 && q.questType === "boss" && q.worldQuest === true,
  "quest deve ser 800+ worldQuest");
must(typeof q.renderDetail === "function", "quest sem renderDetail");
must(q.bossSprite === "phosphorus", "card deve usar sprite phosphorus");

/* ---------------- gates dos bosses ---------------- */
const mimar = ctx.BOSS_DEFS["mimar-haffar"];
must(mimar.requirement.level === 800, "mimar: level req deve ser 800");
must(mimar.requirement.enforced === true, "mimar: requirement deve ser enforced");
must(mimar.requirement.mission === "moonstone-castle", "mimar: sem requirement.mission");
must(JSON.stringify(mimar.requirement.killsRequired) === '["doctor-marrow"]',
  "mimar: killsRequired deve ser doctor-marrow");
const domus = ctx.BOSS_DEFS["maior-domus"];
must(domus.requirement.mission === "moonstone-castle" &&
     JSON.stringify(domus.requirement.killsRequired) === '["doctor-marrow"]' &&
     domus.requirement.enforced === true, "maior-domus: mesmo gate da Missão 1");

/* ---------------- gate da hunt radiant-skyhold ---------------- */
const sky = ctx.GAMEDATA.hunts["radiant-skyhold"];
must(sky.requirement && JSON.stringify(sky.requirement.killsRequired) ===
     '["mimar-haffar","maior-domus"]', "radiant-skyhold sem killsRequired M2");

/* ---------------- warzone phosphorus ---------------- */
const wbSrc = fs.readFileSync(path.join(__dirname, "..", "server", "world_boss.js"), "utf8");
must(/requiresMission:\s*"radiant-skyhold"/.test(wbSrc), "warzone sem requiresMission");
must(/requiresMissionTarget:\s*5000/.test(wbSrc), "warzone sem target 5000");
must(/MISSION_REQUIRED/.test(wbSrc), "sem erro MISSION_REQUIRED no join");
must(/requiresBossKills:\s*\["maior-domus",\s*"mimar-haffar"\]/.test(wbSrc),
  "gate de kills do phosphorus deve permanecer");

/* ---------------- engine: contador kills ---------------- */
const engSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(/mission\.progress\.kills=\(Number\(mission\.progress\.kills\)\|\|0\)\+1/.test(engSrc),
  "engine sem incremento de progress.kills");

/* ---------------- game.js: hunt gate ---------------- */
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
must(/function huntRequirementCheck\(p, hu\)/.test(gameSrc), "sem huntRequirementCheck");
must(/huntRequirementCheck\(G\.p, hu\)/.test(gameSrc),
  "startHunt sem enforce de hu.requirement");

/* ---------------- quest-ui dispatch + index ---------------- */
const quiSrc = fs.readFileSync(path.join(js, "quest-ui.js"), "utf8");
must(/typeof q\.renderDetail === "function"\) return q\.renderDetail/.test(quiSrc),
  "openQuestDetail sem dispatch renderDetail");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/make-believe-quest.js"), "index sem script tag");

/* ---------------- assets: outfit + montaria ---------------- */
const actx = { window: {} };
vm.createContext(actx);
vm.runInContext(fs.readFileSync(path.join(js, "appearancedata.js"), "utf8"), actx);
const APP = actx.window.APPEARANCES;
const om = APP.outfits.find((o) => o.id === "illuminated-warrior-m");
const of_ = APP.outfits.find((o) => o.id === "illuminated-warrior-f");
must(om && om.looktype === 1976 && om.addons === 2, "outfit illuminated-warrior-m ausente/errada");
must(of_ && of_.looktype === 1977 && of_.addons === 2, "outfit illuminated-warrior-f ausente/errada");
const mt = APP.mounts.find((m) => m.id === "radiant-nimbus");
must(mt && mt.looktype === 1975 && mt.mountId === 237, "mount radiant-nimbus ausente/errada");
for (const f of ["illuminated-warrior-m.base.png", "illuminated-warrior-m.mask.png",
                 "illuminated-warrior-m-a1.base.png", "illuminated-warrior-m-a2.base.png",
                 "illuminated-warrior-m.mounted.base.png",
                 "illuminated-warrior-f.base.png", "illuminated-warrior-f-a2.mask.png",
                 "illuminated-warrior-f.mounted.base.png"])
  must(fs.existsSync(path.join(game, "assets", "appearance", "outfit", f)),
    "sprite outfit ausente: " + f);
must(fs.existsSync(path.join(game, "assets", "appearance", "mount", "radiant-nimbus.base.png")),
  "sprite radiant-nimbus ausente");

/* ---------------- itens da roleta: equipamento real + ícone ---------------- */
const MB = require(path.join(js, "make-believe-quest.js"));
must(MB.MAKE_BELIEVE_WEAPONS.length === 11, "roleta de armas deve ter 11 itens");
must(MB.MAKE_BELIEVE_HELMETS.length === 5, "roleta de elmos deve ter 5 itens");
const wItems = (ctx.WEAPONDATA && ctx.WEAPONDATA.items) || {};
for (const slug of [...MB.MAKE_BELIEVE_WEAPONS, ...MB.MAKE_BELIEVE_HELMETS]) {
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    "ícone ausente: " + slug);
  must(ctx.GAMEDATA.items[slug] || wItems[slug],
    "item desconhecido no catálogo: " + slug);
}

/* ---------------- estado derivado (makeBelieveState) ---------------- */
const p = { level: 800, bosses: {}, missions: {}, missionsDone: {} };
let st = MB.makeBelieveState(p);
must(!st.requirementsMet && !st.m1.done && !st.m2.done && !st.m3.done && !st.m4.done,
  "estado inicial deve ter tudo pendente");
p.bosses["doctor-marrow"] = { kills: 1 };
st = MB.makeBelieveState(p);
must(st.requirementsMet === true, "reqs: marrow+800 deve passar");
p.missions["moonstone-castle"] = { progress: { kills: 2499 } };
must(MB.makeBelieveState(p).m1.done === false, "M1 2499 não deve completar");
p.missions["moonstone-castle"].progress.kills = 2500;
must(MB.makeBelieveState(p).m1.done === true, "M1 2500 deve completar");
p.bosses["mimar-haffar"] = { kills: 1 };
must(MB.makeBelieveState(p).m2.done === false, "M2 sem maior-domus");
p.bosses["maior-domus"] = { kills: 1 };
must(MB.makeBelieveState(p).m2.done === true, "M2 com os dois kills");
// fallback: progress por slug (autoridade antiga) soma para o counter kills
p.missions["radiant-skyhold"] = { progress: { "radiant-warden": 3000, "radiant-acolyte": 2000 } };
must(MB.makeBelieveState(p).m3.done === true, "M3 deve somar progress por slug");
p.bosses["phosphorus"] = { kills: 1 };
st = MB.makeBelieveState(p);
must(st.m4.done === true && st.complete === true, "M4 = kill phosphorus");
p.missionsDone["make-believe:weapon"] = "moonsilver-epee";
st = MB.makeBelieveState(p);
must(st.claimed.weapon === "moonsilver-epee", "claim deve preservar o slug sorteado");

console.log("ok: Make Believe Quest — missões M1 2500/M3 5000 counter kills, gates (mimar+maior: marrow+800+M1; radiant: M2; phosphorus: M3), rewards 1x/conta (outfit+mount+2 roletas), assets 1975/1976/1977.");
