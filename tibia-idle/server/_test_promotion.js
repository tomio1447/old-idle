/* Teste funcional (VM): promoteCharacterById — online (API autoritativa) e offline. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ctx = vm.createContext({ window: {}, console, Math, Date, JSON, Object, Array, Number, String, Set, Map,
  setTimeout, clearTimeout, performance: { now: () => Date.now() }, sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
ctx.window = ctx;

/* stubs das dependências usadas por promoteCharacterById/vocationName */
const calls = [];
ctx.$ = () => null; ctx.$$ = () => [];
ctx.G = { p: { id: 7, name: "DruidaAtivo", voc: "druid", level: 100, gold: 50000, promoted: false } };
ctx.characterId = (p) => String(p.id);
ctx.saveCharacterToRoster = (p) => calls.push(["roster", String(p.id), !!p.promoted]);
ctx.PROMOTION_NAMES = { knight: "Elite Knight", paladin: "Royal Paladin", druid: "Elder Druid", sorcerer: "Master Sorcerer" };
ctx.VOCATIONS = { knight: { name: "Knight" }, paladin: { name: "Paladin" }, druid: { name: "Druid" }, sorcerer: { name: "Sorcerer" } };
ctx.vocationName = (p) => { const v = typeof p === "string" ? p : p.voc;
  const pr = typeof p === "object" && p.promoted; return pr && ctx.PROMOTION_NAMES[v] ? ctx.PROMOTION_NAMES[v] : v; };
ctx.fmtFull = (n) => String(n);
ctx.spendGold = (p, n) => { if ((p.gold || 0) < n) return false; p.gold -= n; return true; };
/* roster/getCharacters p/ promoção de OUTRO personagem */
ctx.getCharacters = () => [{ id: 9, name: "DruidaAlt", voc: "druid", level: 50, gold: 30000, promoted: false }];
ctx.normalizePlayer = (p) => p;
ctx.accountApiConfigured = () => false; /* começa OFFLINE */
ctx.sessionToken = () => "tok-123";
let apiResult = { ok: true };
ctx.accountPromoteCharacter = async (tok, id) => { calls.push(["api", tok, String(id)]); return apiResult; };
ctx.toast = () => {}; ctx.addLog = () => {}; ctx.refreshNpc = () => {};

vm.runInContext(fs.readFileSync(path.join("game", "js", "city-ui.js"), "utf8"), ctx, { filename: "city-ui.js" });
if (typeof ctx.promoteCharacterById !== "function") { console.log("promoteCharacterById indisponível"); process.exit(1); }

let fails = 0;
const must = (ok, msg) => { if (!ok) { fails++; console.log("  ✘ " + msg); } else console.log("  ✔ " + msg); };
const PROMOTION_PRICE = 20000;

(async () => {
  /* ---- OFFLINE: personagem ATIVO ---- */
  let r = await ctx.promoteCharacterById("7");
  must(r.ok && /Elder Druid/.test(r.msg), "offline ativo: promover retorna '" + r.msg + "'");
  must(ctx.G.p.promoted === true && ctx.G.p.gold === 50000 - PROMOTION_PRICE, "offline ativo: flag+gold aplicados no G.p");

  /* ---- OFFLINE: OUTRO personagem ---- */
  r = await ctx.promoteCharacterById("9");
  must(r.ok, "offline outro char: promovido");
  must(calls.some((c) => c[0] === "roster" && c[1] === "9" && c[2] === true), "offline outro char: salvo no roster");

  /* ---- ONLINE: API autoritativa ---- */
  ctx.accountApiConfigured = () => true;
  apiResult = { ok: true };
  /* roster PERSISTENTE (mesmas refs, como no jogo) */
  const roster = [{ id: 9, name: "DruidaAlt", voc: "druid", level: 50, gold: 30000, promoted: false }];
  ctx.getCharacters = () => roster;
  const alt = roster[0];
  calls.length = 0;
  r = await ctx.promoteCharacterById("9");
  must(r.ok && /Elder Druid/.test(r.msg), "online outro char: '" + r.msg + "'");
  must(calls.some((c) => c[0] === "api" && c[2] === "9"), "online: chamou /api/promote (autoritativo)");
  must(alt.promoted === true && alt.gold === 10000, "online: espelha flag/gold localmente pós-OK (lista atualiza no refreshNpc)");

  /* ---- ONLINE: falha da API não promove local ---- */
  const novo = { id: 11, name: "PaladinoNovo", voc: "paladin", level: 30, gold: 25000, promoted: false };
  ctx.getCharacters = () => [novo]; /* novo array, MESMA ref de objeto */
  apiResult = { ok: false, msg: "Sessão inválida" };
  r = await ctx.promoteCharacterById("11");
  must(!r.ok && novo.promoted === false && novo.gold === 25000, "online falha: NADA aplicado localmente ('" + r.msg + "')");

  /* ---- elegibilidade: sem gold ---- */
  apiResult = { ok: true };
  const pobre = { id: 12, name: "Pobre", voc: "knight", level: 40, gold: 100, promoted: false };
  ctx.getCharacters = () => [pobre];
  r = await ctx.promoteCharacterById("12");
  must(!r.ok && /gp/.test(r.msg), "sem gold: bloqueado antes de chamar API ('" + r.msg + "')");
  must(!calls.some((c) => c[0] === "api" && c[2] === "12"), "sem gold: API nem é chamada");

  console.log(fails ? "FALHAS: " + fails : "TUDO OK");
  process.exit(fails ? 1 : 0);
})();
