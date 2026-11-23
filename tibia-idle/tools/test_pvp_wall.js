"use strict";
/* Regressão da Magic Wall de batalha PvP:
 * - chamada por conta vira muro quando algum char da PT tem runa +
 *   cooldown livre + alcance (qualquer vocação);
 * - muro bloqueia a célula para os dois times (authorityCellBlocked);
 * - caster consome a runa e entra na sequência de cooldowns;
 * - chamada espera até o TTL quando ninguém está livre; expira com
 *   evento wall-fail; célula ocupada/murada descarta a chamada;
 * - TARGET OFF (_pvpAttackOff) desliga runas e magias de ataque. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else { failures++; console.error("  FAIL:", msg); }
}
const eng = require(path.join(ROOT, "server/authoritative_engine.js"));
const PVP = require(path.join(ROOT, "server/pvp.js"));

function mkChar(id, acc, team, cx, cy, extra) {
  const p = Object.assign({ id: String(id), name: "C" + id, voc: "druid",
    level: 300, ml: 20, hp: 1000, mp: 500, gold: 0,
    skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    supplies: {}, lootPouch: {} }, extra || {});
  return { id: String(id), accountId: acc, pvpTeam: team, team,
    partyKey: "pvpb:1:" + team, p,
    cx, cy, x: (cx + .5) / 51, y: (cy + .5) / 52 };
}
function makeAuth(players, statePlayers) {
  const l = PVP.pvpMapLocal(PVP.PVP_MAPS.ank_open);
  const desc = { kind: "pvp", instanceMode: "pvp", huntId: null, bossId: null,
    members: players,
    state: { instanceMode: "pvp", gridW: l.gridW, gridH: l.gridH, mobs: [],
      players: statePlayers || players.map((m) => ({ id: m.id, cx: m.cx, cy: m.cy,
        x: (m.cx + .5) / l.gridW, y: (m.cy + .5) / l.gridH })),
      pvpBattle: { battleId: 1, mapId: "ank_open", mode: "frags", pz: true,
        fragTarget: 100, safezones: { 1: l.sz1, 2: l.sz2 }, controlZone: null,
        teams: { 1: { guildId: 1, name: "Alpha" }, 2: { guildId: 2, name: "Beta" } },
        scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
  return eng.initializeAuthority(desc, "test-pvp-wall", Date.now()).authority;
}

console.log("== Magic Wall — chamada vira muro ==");
{
  const now = Date.now();
  const c1 = mkChar(1, 100, 1, 10, 10);
  c1.p.supplies["magic-wall-rune"] = 3;
  const c2 = mkChar(2, 200, 2, 40, 40);
  const auth = makeAuth([c1, c2]);
  const p1 = auth.players.find((e) => String(e.id) === "1").p;
  const wallCell = { cx: 14, cy: 10 };
  auth.pvpBattle.wallCalls = { "100": { cx: wallCell.cx, cy: wallCell.cy, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  const wall = (auth.pvpBattle.walls || [])[0];
  ok(wall && wall.cx === wallCell.cx && wall.cy === wallCell.cy,
    "muro criado na célula chamada");
  ok(wall && wall.until >= now + 14000 && wall.until <= now + 20010,
    `muro dura 14–20s (until +${wall ? wall.until - now : 0}ms)`);
  ok(p1.supplies["magic-wall-rune"] === 2, "caster consumiu 1 carga de runa");
  ok((p1._runeCd || 0) > now && (p1._offensiveCd || 0) > now,
    "caster entrou na sequência de cooldowns");
  ok(eng.pvpWallAt(auth, wallCell.cx, wallCell.cy), "pvpWallAt marca a célula");
  ok(eng.authorityCellBlocked(auth, wallCell.cx, wallCell.cy),
    "authorityCellBlocked bloqueia o SQM murado");
  ok(!eng.authorityCellBlocked(auth, wallCell.cx + 1, wallCell.cy),
    "célula vizinha continua livre");
  ok(!auth.pvpBattle.wallCalls["100"], "chamada consumida após o cast");
}

console.log("\n== Escolha do caster: quem tem runa/cooldown/alcance ==");
{
  const now = Date.now();
  const far = mkChar(1, 100, 1, 10, 10);                       // fora de alcance
  far.p.supplies["magic-wall-rune"] = 2;
  const onCd = mkChar(2, 100, 1, 14, 10);                      // em cooldown
  onCd.p.supplies["magic-wall-rune"] = 2; onCd.p._runeCd = now + 5000;
  const free = mkChar(3, 100, 1, 15, 10);                      // livre e perto
  free.p.supplies["magic-wall-rune"] = 2;
  const auth = makeAuth([far, onCd, free]);
  const sup = (id) => auth.players.find((e) => String(e.id) === String(id)).p.supplies["magic-wall-rune"];
  auth.pvpBattle.wallCalls = { "100": { cx: 18, cy: 10, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  ok((auth.pvpBattle.walls || []).length === 1, "um muro criado");
  ok(sup(3) === 1 && sup(2) === 2 && sup(1) === 2,
    "só o char livre/perto gastou a runa");
}

console.log("\n== Sem runa em supplies: conjura igual (mecânica de guerra) ==");
{
  const now = Date.now();
  const c1 = mkChar(1, 100, 1, 10, 10);   // sem runa nenhuma
  const auth = makeAuth([c1]);
  auth.pvpBattle.wallCalls = { "100": { cx: 14, cy: 10, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  ok((auth.pvpBattle.walls || []).length === 1,
    "sem runa em supplies a wall conjura (war = mecânica de cooldown)");
}

console.log("\n== Em cooldown: chamada espera; TTL expira com wall-fail ==");
{
  const now = Date.now();
  const c1 = mkChar(1, 100, 1, 10, 10);
  c1.p._runeCd = now + 10000;             // sequência de cooldowns ocupada
  const auth = makeAuth([c1]);
  auth.pvpBattle.wallCalls = { "100": { cx: 14, cy: 10, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  ok(!(auth.pvpBattle.walls || []).length && auth.pvpBattle.wallCalls["100"],
    "cooldown ocupado: a chamada permanece pendente");
  eng.pvpProcessWallCalls(auth, now + 6001); // TTL = 6000ms
  ok(!auth.pvpBattle.wallCalls["100"], "chamada expirada pelo TTL");
  ok((auth.events || []).some((e) => e.t === "wall-fail"),
    "evento wall-fail emitido para a conta");
}

console.log("\n== Alvos inválidos ==");
{
  const now = Date.now();
  const c1 = mkChar(1, 100, 1, 10, 10);
  c1.p.supplies["magic-wall-rune"] = 3;
  const c2 = mkChar(2, 200, 2, 14, 10); // ocupa a célula-alvo
  const auth = makeAuth([c1, c2]);
  auth.pvpBattle.wallCalls = { "100": { cx: 14, cy: 10, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  ok(!(auth.pvpBattle.walls || []).length && !auth.pvpBattle.wallCalls["100"],
    "célula ocupada: chamada descartada, sem muro");
  // Já murada: segunda chamada na mesma célula também descarta.
  auth.pvpBattle.walls = [{ cx: 16, cy: 10, accId: 100, by: "1", until: now + 15000 }];
  auth.pvpBattle.wallCalls = { "100": { cx: 16, cy: 10, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  ok((auth.pvpBattle.walls || []).length === 1 && !auth.pvpBattle.wallCalls["100"],
    "célula já murada: chamada descartada (sem muro duplo)");
}

console.log("\n== TARGET OFF: flag _pvpAttackOff ==");
{
  // O gate fica no loop de ataque: _pvpAttackOff impede tryUseRune SD e
  // nextComboSpell — assertivo estrutural do diff aplicado.
  const src = fs.readFileSync(path.join(ROOT, "server/authoritative_engine.js"), "utf8");
  ok(src.includes("!item._pvpAttackOff"), "SD-rune e combo gated por _pvpAttackOff");
  ok(src.includes("pos.pvpAtk!==undefined"), "pos.pvpAtk processado no visual");
  ok(src.includes("pos.wallTarget"), "pos.wallTarget processado no visual");
}

console.log("\n== Serialização: walls no descriptor ==");
{
  const src = fs.readFileSync(path.join(ROOT, "server/authoritative_engine.js"), "utf8");
  ok(src.includes("walls:auth.pvpBattle.walls"), "pvpBattle.walls serializado");
}

if (failures) { console.error("\n" + failures + " FALHA(S)"); process.exit(1); }
console.log("\nALL PVP WALL TESTS PASSED");
