/* Regressão: modo de hunt (box/safe) é POR PERSONAGEM.
 * Bug relatado: setar box/safe num char, trocar de personagem e escolher
 * outro modo reescrevia o modo do anterior — os fallbacks de party
 * (c.huntMode no cliente, auth.huntMode no servidor, ||combat.huntMode no
 * challenge enviado) faziam um char herdar/gravar o modo do último pilotado.
 *
 * 1) formationMode (gridai.js, cliente): só o attackMode do PRÓPRIO ent —
 *    c.huntMode não pode vazar para outro membro;
 * 2) huntModeOf (authoritative_engine): idem com auth.huntMode — a troca de
 *    char no pilot não pode mudar o modo efetivo dos demais;
 * 3) fluxo real: A=box pilotado → troca → B=safe pilotado: os dois chars
 *    mantêm modos distintos e auth.huntMode vira só o do último self
 *    (informativo, não força ninguém);
 * 4) fonte: o challenge do tick não pode montar mode com fallback no
 *    combat.huntMode (gravava o modo de um no config do outro).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../server/authoritative_engine");

const ROOT = path.join(__dirname, "..", "game");
function must(ok, msg) { if (!ok) throw Error(msg); }
const now = 10_000;

function basePlayer(extra) {
  return Object.assign({ id: 1, name: "P", voc: "sorcerer", level: 80, exp: engine.expForLevel(80),
    hp: 800, mp: 800, gold: 999999, ml: 40,
    skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 20 },
    equip: { weapon: { item: "wand-of-cosmic-energy" } }, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {}, buffs: {}, conditions: {}, charms: {},
    bestiary: {}, charmsPagos: {}, charmPoints: 0 }, extra || {});
}
function partyHunt(players, mobs) {
  return { v: 1, savedAt: now, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(players[0].id),
    members: players.map((p) => ({ id: String(p.id), p: JSON.parse(JSON.stringify(p)) })),
    state: { gridW: 21, gridH: 13,
      players: players.map((p) => ({ id: String(p.id), p: JSON.parse(JSON.stringify(p)), cx: p._cx, cy: p._cy })),
      mobs: mobs, events: [] } };
}

// ---------- 1) formationMode por personagem (gridai.js, cliente) ----------
{
  const ctx = { console, Math, JSON, Object, Array, Number, String, Set, Map,
    performance: { now: () => 0 } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "gridai.js"), "utf8"), ctx);
  const formationMode = ctx.formationMode;
  must(typeof formationMode === "function", "formationMode ausente no gridai.js");
  const A = { p: { config: { attackMode: "box" } } };
  const B = { p: { config: { attackMode: "safe" } } };
  const semModo = { p: { config: { attackMode: "chase" } } };
  // O c.huntMode é o modo do último char pilotado — não pode vazar.
  must(formationMode({ huntMode: "safe" }, A) === "box",
    "A continuou box mesmo com a party em safe");
  must(formationMode({ huntMode: "box" }, B) === "safe",
    "B continuou safe mesmo com a party em box");
  must(formationMode({ huntMode: "box" }, semModo) === "",
    "membro sem modo não pode herdar o box da party");
  must(formationMode({}, semModo) === "", "sem modo próprio fica sem modo");
}

// ---------- 2) huntModeOf por personagem (engine) ----------
{
  const A = { id: "A", p: basePlayer({ id: "A", config: { attackMode: "box" } }) };
  const B = { id: "B", p: basePlayer({ id: "B", config: { attackMode: "safe" } }) };
  const C = { id: "C", p: basePlayer({ id: "C", config: { attackMode: "chase" } }) };
  const auth = { huntMode: "safe" }; // último self pilotado estava em safe
  must(engine.huntModeOf(auth, A) === "box", "A manteve box mesmo com auth.huntMode=safe");
  must(engine.huntModeOf(auth, B) === "safe", "B manteve safe");
  must(engine.huntModeOf(auth, C) === "",
    "char sem modo não pode herdar o safe da party (era o bug relatado)");
  must(engine.huntModeOf({ huntMode: "box" }, C) === "",
    "char sem modo não pode herdar o box da party");
  const kite = { id: "K", p: basePlayer({ id: "K", config: { attackMode: "kiting" } }) };
  must(engine.huntModeOf({ huntMode: "box" }, kite) === "kiting",
    "kiting do próprio char prevalece");
}

// ---------- 3) fluxo real: piloto A=box → troca → piloto B=safe ----------
{
  const A = basePlayer({ id: 11, name: "A", voc: "knight", config: { attackMode: "box" } });
  A._cx = 10; A._cy = 6;
  const B = basePlayer({ id: 12, name: "B", voc: "paladin", config: { attackMode: "chase" },
    equip: { weapon: { item: "bow" } } });
  B._cx = 1; B._cy = 1;
  const mobs = [{ id: "m1", slug: "rat", hp: 5000, maxHp: 5000, cx: 10, cy: 6 }];
  const live = engine.initializeAuthority(partyHunt([A, B], mobs), "e".repeat(64), now);
  const auth = live.authority;
  const itemA = auth.players.find((it) => String(it.id) === "11");
  const itemB = auth.players.find((it) => String(it.id) === "12");
  must(engine.huntModeOf(auth, itemA) === "box", "A começou em box");
  must(engine.huntModeOf(auth, itemB) === "", "B começou sem modo");

  // Tick do usuário agora pilotando B e escolhendo SAFE no Helper:
  // só o visual do self (B) carrega challenge com o modo novo.
  const serialized = JSON.stringify(live);
  // x/y normalizados são obrigatórios — o normalize descarta entrada sem eles.
  const after = JSON.parse(engine.advanceAuthorityState(serialized, 1000, now + 1000, {
    players: [
      { id: "11", x: 10.5 / 21, y: 6.5 / 13 },             // A: membro, sem challenge
      { id: "12", x: 1.5 / 21, y: 1.5 / 13, self: 1, challenge: { res: false, amp: false,
        box: false, huntMode: "safe", kiteDistance: 3 } }, // B: self, escolheu safe
    ], mobs: [],
  }).state);
  const auth2 = after.authority || after;
  const itemA2 = (auth2.players || []).find((it) => String(it.id) === "11");
  const itemB2 = (auth2.players || []).find((it) => String(it.id) === "12");
  must(itemB2.p.config.attackMode === "safe",
    "o safe escolhido gravou no config do B, veio " + itemB2.p.config.attackMode);
  must(itemA2.p.config.attackMode === "box",
    "o modo do A foi reescrito — era o bug relatado, veio " + itemA2.p.config.attackMode);
  must(engine.huntModeOf(auth2, itemA2) === "box" && engine.huntModeOf(auth2, itemB2) === "safe",
    "modos por personagem divergentes após a troca");
}

// ---------- 4) fonte: sem fallback de party no modo enviado ----------
{
  const src = fs.readFileSync(path.join(ROOT, "js", "account-client.js"), "utf8");
  must(!/attackMode\|\|\s*\(combat&&combat\.huntMode\)/.test(src),
    "o challenge ainda herda combat.huntMode — gravaria o modo de um char no outro");
}

console.log("ok: modo de hunt por personagem — formationMode/huntModeOf sem fallback " +
  "de party; troca de piloto não reescreve o modo dos demais; " +
  "challenge do tick sem herança de combat.huntMode");
