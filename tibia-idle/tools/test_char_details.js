"use strict";
/* char-details: verifica o histórico de mortes (p.deathLog) gravado pelo
 * combate local (combat.js) e pelo motor autoritativo (authMarkPlayerDeath),
 * mais a estrutura da janela de detalhes. */
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");

/* ---------- cliente: applyCharacterDeathConsequences grava deathLog ---------- */
const combatSrc = fs.readFileSync(path.join(root, "game/js/combat.js"), "utf8");
const cctx = {
  Date, Math, JSON, console,
  expForLevel: (l) => l * 1000,
  combatDeathCause: () => "monster",
  recordCombatSessionDeath: () => {},
  saveCharacterToRoster: () => {},
};
vm.createContext(cctx);
const cstart = combatSrc.indexOf("function applyCharacterDeathConsequences(");
vm.runInContext(combatSrc.slice(cstart, combatSrc.indexOf("/* Tick dos aliados")), cctx);

const p = { hp: 0, level: 50, exp: 50000, skills: {}, blessed: true, name: "Tutor" };
p._lastHitBy = "Demon";
const c = { huntId: "rookgaard-sewer", stats: {}, player: { p }, players: [{ p }] };
let loss = cctx.applyCharacterDeathConsequences(c, p);
assert.equal(p.deaths, 1, "contador de mortes");
assert.equal(p.blessed, false);
assert(Array.isArray(p.deathLog) && p.deathLog.length === 1, "deathLog criado");
assert.equal(p.deathLog[0].by, "Demon", "killer registrado");
assert.equal(p.deathLog[0].where, "rookgaard-sewer", "local registrado");
assert.equal(p.deathLog[0].level, 50);
assert.equal(p.deathLog[0].blessed, true, "tinha bless");
assert.equal(p.deathLog[0].lost, 0, "fora de PvP não perde xp");
assert.equal(p._lastHitBy, null, "lastHitBy consumido");

/* PvP raid: 8% de xp vai pro campo lost */
const p2 = { hp: 0, level: 30, exp: 100000, skills: {}, name: "Vitima" };
const c2 = { pvp: true, stats: {}, player: { p: p2 } };
loss = cctx.applyCharacterDeathConsequences(c2, p2, "raid");
assert.equal(loss.exp, 8000, "raid = 8%");
assert.equal(p2.deathLog[0].lost, 8000, "perda vai pro log");
assert.equal(p2.deathLog[0].by, null, "sem atacante registrado");

/* cap de 20 entradas, mais nova primeiro */
for (let i = 0; i < 25; i++) {
  p2._lastHitBy = "Mob" + i;
  cctx.applyCharacterDeathConsequences(c2, p2);
}
assert.equal(p2.deathLog.length, 20, "cap em 20");
assert.equal(p2.deathLog[0].by, "Mob24", "mais recente primeiro");
assert.equal(p2.deaths, 26, "contador acumula");

/* ---------- engine: authMarkPlayerDeath grava deathLog ---------- */
const engSrc = fs.readFileSync(path.join(root, "server/authoritative_engine.js"), "utf8");
const ectx = { Date, Number, Object, recordAuthSessionDeath: (auth) => { auth.deaths = (auth.deaths || 0) + 1; } };
vm.createContext(ectx);
vm.runInContext(engSrc.slice(engSrc.indexOf("function playerReviveDelay("), engSrc.indexOf("function combatLivingFor(")), ectx);
vm.runInContext(engSrc.slice(engSrc.indexOf("function authIsWorldBoss("), engSrc.indexOf("const SCARLETT_KEYS=")), ectx);

const now = Date.now();
const auth = { kind: "hunt", huntId: "demon-library", clock: now };
const item = { id: "p1", p: { hp: 0, level: 120, vipUntil: 0, blessed: true, _lastHitBy: "Hellhound" }, x: .5, y: .5 };
assert(ectx.authMarkPlayerDeath(auth, item, now));
assert.equal(item.p.deaths, 1);
assert.equal(item.p.deathLog.length, 1);
assert.equal(item.p.deathLog[0].by, "Hellhound");
assert.equal(item.p.deathLog[0].where, "demon-library");
assert.equal(item.p.deathLog[0].blessed, true);
assert.equal(item.p._lastHitBy, null);

/* segunda morte seguida (wasDown) não duplica o log */
item.downedAt = now; item.p.hp = 0;
ectx.authMarkPlayerDeath(auth, item, now + 100);
assert.equal(item.p.deathLog.length, 1, "wasDown não duplica");

/* boss: where sai do bossId */
const bauth = { kind: "boss", bossId: "scarlett-etzel", clock: now };
const bitem = { id: "p2", p: { hp: 0, level: 200 }, x: .1, y: .1 };
ectx.authMarkPlayerDeath(bauth, bitem, now);
assert.equal(bitem.p.deathLog[0].where, "scarlett-etzel");

/* ---------- estrutura da janela ---------- */
const cd = fs.readFileSync(path.join(root, "game/js/char-details.js"), "utf8");
for (const t of ["personagem", "outfit", "montarias", "proficiencia", "roda", "deaths"])
  assert(cd.includes(`"${t}"`), `aba ${t}`);
assert(cd.includes("cycloAppearance(p, box, { minimal: true })"), "catálogo minimal");
assert(cd.includes('renderWheelModal(p, { embedded: true })'), "roda usa a wheel real (p.wheel.slots)");
assert(cd.includes("bindWheel(el, chardRender)"), "roda embutida é interativa");
assert(!cd.includes("wheelVoc"), "sem seletor de vocação — a roda é a do personagem");
assert(!/Proficiência[\s\S]{0,400}\d+%\s*<\/div>/.test(cd.split("chardTabProficiencia")[1].split("/* ----")[0]),
  "proficiência não inventa números");
const html = fs.readFileSync(path.join(root, "game/index.html"), "utf8");
assert(html.includes('id="btn-switch-portrait"'), "retrato no topbar");
assert(html.includes("js/char-details.js"), "script carregado");
const gsrc = fs.readFileSync(path.join(root, "game/js/game.js"), "utf8");
assert(gsrc.includes("window.accountCharOps"), "accountCharOps exposto");
assert(gsrc.includes("openCharDetails"), "delegação para a janela");

console.log("OK: deathLog local+autoritativo (by/where/blessed/lost, cap 20), janela Detalhes do personagem integrada.");
