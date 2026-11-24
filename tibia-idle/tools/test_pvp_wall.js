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
  ok(src.includes("pvpAttackOffEff(auth,item)"), "SD-rune e combo gated por pvpAttackOffEff");
  ok(src.includes("pos.pvpAtk!==undefined"), "pos.pvpAtk processado no visual");
  ok(src.includes("pos.wallTarget"), "pos.wallTarget processado no visual");
}

console.log("\n== Serialização: walls no descriptor ==");
{
  const src = fs.readFileSync(path.join(ROOT, "server/authoritative_engine.js"), "utf8");
  ok(src.includes("walls:auth.pvpBattle.walls"), "pvpBattle.walls serializado");
}

console.log("\n== Painel estendido: AFK do time como caster ==");
{
  const now = Date.now();
  const caller = mkChar(1, 100, 1, 10, 10);          // quem chamou (sem runa)
  const afk = mkChar(2, 200, 1, 14, 10);             // AFK aliado COM runa
  afk.p.supplies["magic-wall-rune"] = 2;
  const foe = mkChar(3, 300, 2, 20, 10);
  const auth = makeAuth([caller, afk, foe]);
  auth.players[1]._aiCtl = { mode: "AI_HARD" };      // _aiCtl vive na entidade runtime
  auth.pvpBattle.wallCalls = { "100": { cx: 16, cy: 10, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  const wall = (auth.pvpBattle.walls || [])[0];
  ok(wall && wall.cx === 16, "AFK aliado com runa+alcance conjura o muro");
  ok(wall && String(wall.by) === "2", "caster é o char AFK da conta aliada");
}

console.log("\n== Painel estendido: HUMANO aliado e INIMIGO imunes ==");
{
  const now = Date.now();
  // Caller LONGE da célula (>7sqm): se o muro sair, foi o aliado/inimigo.
  const caller = mkChar(1, 100, 1, 40, 40);
  const human = mkChar(2, 200, 1, 14, 10);           // aliado PILOTADO
  human.p.supplies["magic-wall-rune"] = 2;           // (sem _aiCtl = humano)
  const foe = mkChar(3, 300, 2, 13, 10);
  foe.p.supplies["magic-wall-rune"] = 5;             // inimigo c/ runa sobrando
  const auth = makeAuth([caller, human, foe]);
  auth.players[2]._aiCtl = { mode: "AI_HARD" };
  auth.pvpBattle.wallCalls = { "100": { cx: 16, cy: 10, at: now } };
  eng.pvpProcessWallCalls(auth, now);
  ok(!(auth.pvpBattle.walls || []).length,
    "nem humano aliado nem AFK inimigo conjuram (espera TTL)");
}

console.log("\n== TARGET OFF de time atinge só AFK (pvpAttackOffEff) ==");
{
  const own = mkChar(1, 100, 1, 10, 10);
  const afk = mkChar(2, 200, 1, 11, 10);
  const human = mkChar(3, 300, 1, 12, 10);           // aliado pilotado
  const auth = makeAuth([own, afk, human]);
  auth.players[1]._aiCtl = { mode: "AI_HARD" };
  const it = auth.players;
  auth.pvpBattle.teams[1].attackOff = true;
  ok(eng.pvpAttackOffEff(auth, it[1]) === true,
    "AFK do time: attackOff do painel desarma");
  ok(eng.pvpAttackOffEff(auth, it[2]) === false,
    "humano aliado: flag do time não desarma (autonomia)");
  auth.pvpBattle.teams[1].attackOff = false;
  ok(eng.pvpAttackOffEff(auth, it[1]) === false,
    "flag desligada volta a permitir ataque");
  it[1]._pvpAttackOff = true;
  ok(eng.pvpAttackOffEff(auth, it[1]) === true,
    "flag próprio do char continua valendo");
}

console.log("\n== Linha de visão: muros/paredes bloqueiam (pvpLosClear) ==");
{
  const now = Date.now();
  const a = mkChar(1, 100, 1, 10, 10), b = mkChar(2, 200, 2, 14, 10);
  const auth = makeAuth([a, b]);
  ok(eng.pvpLosClear(auth, 10, 10, 14, 10) === true, "linha livre passa");
  auth.pvpBattle.walls = [{ cx: 12, cy: 10, accId: 100, by: "1", until: now + 15000 }];
  ok(eng.pvpLosClear(auth, 10, 10, 14, 10) === false, "magic wall na linha bloqueia");
  auth.pvpBattle.walls = [];
  auth.blockedCells = { "11:10": true };            // parede do mapa
  ok(eng.pvpLosClear(auth, 10, 10, 14, 10) === false, "parede do mapa bloqueia");
  auth.blockedCells = {};
  ok(eng.pvpLosClear(auth, 10, 10, 10, 10) === true, "mesma célula = livre");
  // Diagonal com canto fechado pelos dois lados: não passa.
  auth.blockedCells = { "11:10": true, "10:11": true };
  ok(eng.pvpLosClear(auth, 10, 10, 11, 11) === false, "canto diagonal fechado bloqueia");
}

if (failures) { console.error("\n" + failures + " FALHA(S)"); process.exit(1); }
console.log("\nALL PVP WALL TESTS PASSED");
