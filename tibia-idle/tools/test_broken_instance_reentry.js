"use strict";
/* Regressão da reentrada de instância quebrada:
 * - quebra marca o mapa (hunt/boss) e dispara location.reload();
 * - world boss / batalha PvP / quest NÃO geram marker (caem no templo);
 * - no boot o marker é consumido UMA vez e re-entra no mapa certo;
 * - cap de re-entradas: a 3ª quebra do mesmo mapa vai pro templo;
 * - o marker preserva a contagem entre reloads (anti-loop). */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else { failures++; console.error("  FAIL:", msg); }
}
const src = fs.readFileSync(path.join(ROOT, "game/js/game.js"), "utf8");

// Extrai o bloco de funções e avalia com stubs de browser.
const start = src.indexOf("const BROKEN_INSTANCE_KEY");
const end = src.indexOf("function combatSessionParticipants");
if (start < 0 || end < 0) { console.error("FAIL: bloco não encontrado"); process.exit(1); }
const block = src.slice(start, end);

const store = {};
const sstore = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const sessionStorage = {
  getItem: (k) => (k in sstore ? sstore[k] : null),
  setItem: (k, v) => { sstore[k] = String(v); },
  removeItem: (k) => { delete sstore[k]; },
};
let bootLoadingMsg = "";
const armBootLoading = (t) => { bootLoadingMsg = String(t || ""); };
const AUTOLOGIN_KEY = "tibia-idle-autologin-v1";
let reloaded = false;
const location = { reload() { reloaded = true; } };
const calls = { toast: [], log: [], boss: [], hunt: [], arba: [] };
const G = { p: { id: "7", instanceMode: "non-pvp" }, combat: null };
const BOSS_DEFS = { "ice-horror": { name: "Ice Horror" }, arbaziloth: { name: "Arbaziloth" } };
const GAMEDATA = { hunts: { "wasp-nest": { name: "Wasp Nest" } } };
const clearInstanceSession = () => {};
const toast = (m) => calls.toast.push(m);
const addLog = (k, m) => calls.log.push(m);
const startBoss = (id) => calls.boss.push(id);
const startHunt = (id, mode) => calls.hunt.push([id, mode]);
const arbazilothPickMode = (id) => calls.arba.push(id);
const INSTANCE_SESSION_KEY = "tibia-idle-active-instance-v1";

const F = new Function(
  "G", "BOSS_DEFS", "GAMEDATA", "localStorage", "sessionStorage", "location",
  "clearInstanceSession", "toast", "addLog", "startBoss", "startHunt",
  "arbazilothPickMode", "INSTANCE_SESSION_KEY", "AUTOLOGIN_KEY", "armBootLoading",
  block + ";return {markBrokenInstance,reloadIntoBrokenInstance," +
    "consumeBrokenInstanceReentry,reenterBrokenInstance,BROKEN_INSTANCE_KEY};"
)(G, BOSS_DEFS, GAMEDATA, localStorage, sessionStorage, location, clearInstanceSession,
  toast, addLog, startBoss, startHunt, arbazilothPickMode, INSTANCE_SESSION_KEY,
  AUTOLOGIN_KEY, armBootLoading);
const { markBrokenInstance, reloadIntoBrokenInstance, consumeBrokenInstanceReentry,
  reenterBrokenInstance, BROKEN_INSTANCE_KEY } = F;

console.log("== Quebra marca o mapa e dispara reload ==");
{
  G.combat = { huntId: "wasp-nest", instanceMode: "non-pvp", players: [] };
  reloaded = false;
  const m = markBrokenInstance("instance-create-timeout");
  ok(m && m.kind === "hunt" && m.huntId === "wasp-nest" && m.charId === "7",
    "marker hunt com charId do char ativo");
  ok(reloadIntoBrokenInstance("instance-create-timeout") && reloaded,
    "reloadIntoBrokenInstance recarrega a página");
  ok(sstore["tibia-idle-online-autoload"] === "7",
    "reload arma o autoload do char (boot não cai na seleção)");
  ok(sstore[AUTOLOGIN_KEY] === "7",
    "reload arma o autologin offline do char");
  ok(/Recuperando/i.test(bootLoadingMsg),
    "boot loading mostra 'Recuperando instância' em vez da tela de seleção");
}

console.log("\n== Fluxos excluídos não geram marker ==");
{
  delete store[BROKEN_INSTANCE_KEY];
  for (const [name, c] of [
    ["pvpBattle", { pvpBattle: {}, huntId: "x" }],
    ["worldBoss", { worldBoss: true, boss: { id: "wb", worldBoss: true } }],
    ["boss worldBoss", { boss: { id: "wb", worldBoss: true } }],
    ["quest", { questId: "annihilator", huntId: "x" }],
    ["sem mapa", { players: [] }],
  ]) {
    G.combat = c;
    ok(markBrokenInstance("x") === null, `${name}: sem marker`);
  }
  G.combat = null;
  ok(markBrokenInstance("x") === null, "sem combat: sem marker");
}

console.log("\n== Boot consome o marker uma vez e re-entra no mapa ==");
{
  delete store[BROKEN_INSTANCE_KEY];
  G.combat = { boss: { id: "ice-horror" }, instanceMode: "boss", players: [] };
  markBrokenInstance("instance-create-timeout");
  G.combat = null;
  calls.boss.length = 0;
  reenterBrokenInstance();
  ok(calls.boss.length === 1 && calls.boss[0] === "ice-horror",
    "re-entra no boss quebrado");
  const after = JSON.parse(store[BROKEN_INSTANCE_KEY]);
  ok(after && after.consumed === true, "marker fica consumed (contagem preservada)");
  calls.boss.length = 0;
  reenterBrokenInstance();
  ok(calls.boss.length === 0, "segundo boot não re-entra de novo");
}

console.log("\n== Arbaziloth pede o modo de novo ==");
{
  delete store[BROKEN_INSTANCE_KEY];
  G.combat = { boss: { id: "arbaziloth" }, instanceMode: "boss", players: [] };
  markBrokenInstance("instance-create-timeout");
  G.combat = null;
  calls.arba.length = 0;
  reenterBrokenInstance();
  ok(calls.arba.length === 1 && calls.arba[0] === "arbaziloth",
    "arbaziloth reabre a escolha de modo");
}

console.log("\n== Cap anti-loop: 3ª quebra vai pro templo ==");
{
  delete store[BROKEN_INSTANCE_KEY];
  G.combat = { huntId: "wasp-nest", instanceMode: "non-pvp", players: [] };
  const m1 = markBrokenInstance("x");
  consumeBrokenInstanceReentry();            // boot 1 → re-entra
  const m2 = markBrokenInstance("x");        // quebrou de novo (mesmo mapa)
  consumeBrokenInstanceReentry();            // boot 2 → re-entra
  const m3 = markBrokenInstance("x");        // 3ª quebra
  ok(m1 && m1.attempts === 1, "1ª quebra: attempts=1");
  ok(m2 && m2.attempts === 2, "2ª quebra: attempts=2 (mesmo mapa soma)");
  ok(m3 === null, "3ª quebra: sem marker (temple fallback)");
  ok(!(BROKEN_INSTANCE_KEY in store), "marker limpo após o cap");
}

console.log("\n== Marker errado/vencido não re-entra ==");
{
  delete store[BROKEN_INSTANCE_KEY];
  store[BROKEN_INSTANCE_KEY] = JSON.stringify({ charId: "999", kind: "hunt",
    huntId: "wasp-nest", at: Date.now(), attempts: 1, consumed: false });
  calls.hunt.length = 0;
  reenterBrokenInstance();
  ok(calls.hunt.length === 0, "marker de OUTRO char não re-entra");
  store[BROKEN_INSTANCE_KEY] = JSON.stringify({ charId: "7", kind: "hunt",
    huntId: "wasp-nest", at: Date.now() - 16 * 60 * 1000, attempts: 1, consumed: false });
  reenterBrokenInstance();
  ok(calls.hunt.length === 0 && !(BROKEN_INSTANCE_KEY in store),
    "marker vencido (>15min) é limpo sem re-entrar");
}

console.log("\n== Pontos de quebra ligados ao reload ==");
{
  ok(src.includes('reloadIntoBrokenInstance("instance-create-timeout")'),
    "watchdog 45s → reload de volta pro mapa");
  ok(src.includes('reloadIntoBrokenInstance("create-rejected:'),
    "rejeição do create → reload de volta pro mapa");
  ok(src.includes("reenterBrokenInstance()"),
    "boot re-entra no mapa quebrado");
  ok(/if \(!autoId\)[\s\S]*BROKEN_INSTANCE_KEY[\s\S]*sessionCharId\(\)[\s\S]*autoId = String\(broken\.charId\)/
      .test(src),
    "boot usa o marker como fallback de autoId (guardado por sessionCharId)");
  ok(src.includes('sessionStorage.setItem("tibia-idle-online-autoload", String(marker.charId))'),
    "reloadIntoBrokenInstance arma o autoload antes do reload");
}

if (failures) { console.error("\n" + failures + " FALHA(S)"); process.exit(1); }
console.log("\nALL BROKEN INSTANCE REENTRY TESTS PASSED");
