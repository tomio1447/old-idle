/* Charms Canary + Hunts OTC: pontos, assign, ícones, bosstiary, campos de hunt. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function must(v, m) { if (!v) throw new Error(m); }

const root = path.join(__dirname, "..", "game");
const js = path.join(root, "js");
const enginePath = path.join(__dirname, "..", "server", "authoritative_engine.js");

/* ── assets OTC ── */
const sheet = path.join(root, "assets", "ui", "cyclopedia", "charms", "monster-bonus-effects.png");
must(fs.existsSync(sheet), "sprite sheet OTC monster-bonus-effects.png ausente");
const buf = fs.readFileSync(sheet);
must(buf.readUInt32BE(16) === 800 && buf.readUInt32BE(20) === 32,
  "sheet de charms deve ser 800×32 (25 runas × 32px)");

/* ── cyclopedia.js (client) ── */
const cycloSrc = fs.readFileSync(path.join(js, "cyclopedia.js"), "utf8");
const GAMEDATA = {
  monsters: {
    rat: { name: "Rat", hp: 20, exp: 5, best: { toKill: 5, u1: 2, u2: 3, charm: 5 }, jogavel: true },
    dragon: { name: "Dragon", hp: 1000, exp: 700, best: { toKill: 100, u1: 10, u2: 50, charm: 50 }, jogavel: true },
    "the-monster": { name: "The Monster", hp: 40000, exp: 1000, boss: true, jogavel: true },
  },
  hunts: {
    rats: { name: "Esgoto", level: 1, avgExp: 7, monsters: ["rat"], pack: 3, avgDamage: 7, avgHp: 20, avgArmor: 2 },
  },
};
const ctx = { GAMEDATA, console, module: { exports: {} }, exports: {} };
vm.createContext(ctx);
vm.runInContext(cycloSrc + "\nmodule.exports = { CHARMS, CYCLO_ABAS, bestiaryKill, bestiaryStage, buyCharm, assignCharm, clearCharm, charmOwned, charmAssignedRace, huntStars, charmIconHtml, ensureCyclopedia, resolveCharmId };", ctx);
const C = ctx.module.exports;

must(C.CHARMS.wound && C.CHARMS.wound.sprite === 0, "Wound sprite index");
must(C.CHARMS.enflame && C.CHARMS.enflame.custo === 400, "Enflame custo Canary tier1");
must(C.CHARMS.voidinversion && C.CHARMS.savage, "runas Void Inversion / Savage Blow");
must(Object.keys(C.CHARMS).length >= 20, "catálogo de charms incompleto");

const p = { bestiary: {}, charms: {}, charmRace: {}, charmsPagos: {}, charmPoints: 0 };
C.ensureCyclopedia(p);
const g1 = C.bestiaryKill(p, "rat", 1);
must(p.bestiary.rat >= 1, "kill registra bestiary");
must(typeof p.charmPoints === "number", "charm points inicializados");
C.bestiaryKill(p, "rat", 50);
must(C.bestiaryStage(p, "rat") >= 4, "rat completa com marcos curtos");
must(p.charmPoints > 0, "estágios creditam charm points");

p.charmPoints = 1000;
const buy = C.buyCharm(p, "wound");
must(buy.ok && C.charmOwned(p, "wound"), "buyCharm desbloqueia");
must(p.charmPoints === 1000 - 240, "custo Wound 240");
const bad = C.assignCharm(p, "wound", "dragon");
must(!bad.ok, "assign exige bestiário completo");
C.bestiaryKill(p, "dragon", 200);
const ok = C.assignCharm(p, "wound", "dragon");
must(ok.ok && C.charmAssignedRace(p, "wound") === "dragon", "assignCharm ok");
const icon = C.charmIconHtml("wound", 32);
must(icon.includes("monster-bonus-effects.png") && icon.includes("background-position"),
  "ícone OTC resolve path/clip");
must(C.huntStars(GAMEDATA.hunts.rats) >= 1, "huntStars");
/* Legacy array-with-named-props must normalize so unlock survives JSON */
const legacy = [];
legacy.enflame = true;
const pLegacy = { bestiary: { rat: 99 }, charms: legacy, charmRace: {}, charmsPagos: {}, charmPoints: 500 };
C.ensureCyclopedia(pLegacy);
must(C.charmOwned(pLegacy, "enflame"), "normalize array named prop → owned");
must(!Array.isArray(pLegacy.charms), "charms vira Object puro");
const round = JSON.parse(JSON.stringify(pLegacy));
C.ensureCyclopedia(round);
must(C.charmOwned(round, "enflame"), "unlock sobrevive JSON após normalize");
const asgLegacy = C.assignCharm(pLegacy, "enflame", "rat");
must(asgLegacy.ok, "assign após normalize de array legado");
must(C.resolveCharmId("Enflame") === "enflame", "resolveCharmId por nome");
must((C.CYCLO_ABAS || []).some((a) => a.id === "cidade" && a.secao), "seção CIDADE");
must((C.CYCLO_ABAS || []).filter((a) => a.cityAction).map((a) => a.cityAction).join(",")
  === "market,reward,forge,depot,imbuements", "CIDADE city actions");


/* ── bosstiary ── */
const bossSrc = fs.readFileSync(path.join(js, "bosstiary.js"), "utf8");
const bctx = { GAMEDATA, console, module: { exports: {} }, exports: {} };
vm.createContext(bctx);
vm.runInContext(bossSrc, bctx);
const B = bctx.module.exports;
const bp = { bosstiary: {}, bossPoints: 0 };
const bg = B.bosstiaryKill(bp, "the-monster", 3);
must(bp.bosstiary["the-monster"] === 3, "bosstiary kill count");
must(bg > 0 && bp.bossPoints > 0, "boss points creditados");

/* ── server engine ── */
const engine = require(enginePath);
const sp = {
  level: 50, hp: 500, mp: 200, voc: "knight",
  charms: { enflame: true }, charmRace: { enflame: "rat" },
  charmPoints: 500, bestiary: {}, charmsPagos: {}, bosstiary: {},
};
must(engine.applyCharmDamage(sp, "fire", 100) === 100,
  "applyCharmDamage não aplica mais +% passivo");
const buy2 = engine.buyCharm({ charms: {}, charmPoints: 400 }, "enflame");
must(buy2.ok, "server buyCharm");
const asg = engine.assignCharm(
  { charms: { enflame: true }, charmRace: {} }, "enflame", "rat");
must(asg.ok, "server assignCharm");
must(typeof engine.tryCharmOffensive === "function", "tryCharmOffensive exportado");
must(typeof engine.bestiaryKill === "function", "bestiaryKill server");

/* ── UI / hunts fields ── */
const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8");
const cycloUi = fs.readFileSync(path.join(js, "cyclopedia-ui.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
must(ui.includes("huntStarsHtml") && ui.includes("Nível recomendado"),
  "modal Hunts sem campos Canary");
must(cycloUi.includes("renderCycloHunts") && cycloUi.includes("charmIconHtml"),
  "aba Hunts/Charms OTC ausente");
must(html.includes("layout.css?v="), "layout cache-bust");
must(html.includes("ui.js?v="), "ui cache-bust");
must(html.includes("cyclopedia.js?v=charms-cidade-v2"), "cache-bust cyclopedia");
must(html.includes("cyclopedia-ui.js?v=charms-cidade-v2"), "cache-bust cyclopedia-ui");
must(html.includes("layout.css?v=charms-cidade-v2"), "cache-bust layout CIDADE");

console.log("OK: charms Canary (pontos/assign/ícones), bosstiary kills, hunts fields.");
