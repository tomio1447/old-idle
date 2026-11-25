"use strict";
/* Regressão do drag-to-push de batalha PvP (Canary playerMoveThing):
 * - input.push sobrevive ao normalizeVisualState e agenda _pushReq no self;
 * - novo drag SUBSTITUI o pendente; o eco do mesmo push não reseta o delay;
 * - delay de 1s: antes não empurra, depois move o alvo 1 SQM;
 * - destino adjacente ao ALVO (Chebyshev 1), célula livre, dentro do grid;
 * - pusher precisa estar adjacente (re-tenta no ritmo 600ms, expira em 15s);
 * - PZ: alvo em safezone só sai pra outra safezone; rooted bloqueia;
 * - eventos pvp-push / pvp-push-fail emitidos para o cliente. */
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
  const p = Object.assign({ id: String(id), name: "C" + id, voc: "knight",
    level: 300, ml: 20, hp: 3000, mp: 500, gold: 0,
    skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    supplies: {}, lootPouch: {} }, extra || {});
  return { id: String(id), accountId: acc, pvpTeam: team, team,
    partyKey: "pvpb:1:" + team, p,
    cx, cy, x: (cx + .5) / 51, y: (cy + .5) / 52 };
}
function makeAuth(players, mapId) {
  const mid = mapId || "ank_open";
  const l = PVP.pvpMapLocal(PVP.PVP_MAPS[mid]);
  const desc = { kind: "pvp", instanceMode: "pvp", huntId: null, bossId: null,
    members: players,
    state: { instanceMode: "pvp", gridW: l.gridW, gridH: l.gridH, mobs: [],
      players: players.map((m) => ({ id: m.id, cx: m.cx, cy: m.cy,
        x: (m.cx + .5) / l.gridW, y: (m.cy + .5) / l.gridH })),
      pvpBattle: { battleId: 1, mapId: mid, mode: "frags", pz: true,
        fragTarget: 100, safezones: { 1: l.sz1, 2: l.sz2 }, controlZone: null,
        teams: { 1: { guildId: 1, name: "Alpha" }, 2: { guildId: 2, name: "Beta" } },
        scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
  return eng.initializeAuthority(desc, "test-pvp-push", Date.now()).authority;
}
const entOf = (auth, id) => auth.players.find((e) => String(e.id) === String(id));

console.log("== input.push sobrevive ao normalizeVisualState ==");
{
  const v = eng.normalizeVisualState({ players: [
    { id: "1", self: 1, x: .2, y: .2, cx: 10, cy: 10,
      push: { id: "9", cx: 12.9, cy: 10.2 } },
  ] }, { gridW: 51, gridH: 52 });
  const p0 = v.players[0];
  ok(p0 && p0.push && p0.push.id === "9" && p0.push.cx === 13 && p0.push.cy === 10,
    "push {id,cx,cy} sanitizado e arredondado");
}

console.log("\n== Push adjacente: delay 1s, depois move o alvo 1 SQM ==");
{
  const now = Date.now();
  const pusher = mkChar(1, 100, 1, 10, 10);
  const target = mkChar(2, 200, 1, 11, 10);   // aliado à direita
  const auth = makeAuth([pusher, target]);
  const eT = entOf(auth, 2);
  entOf(auth, 1)._pushReq = { id: "2", cx: 12, cy: 10, at: now };

  eng.pvpPushTick(auth, now + 500);            // antes do delay
  ok(eT.cx === 11 && eT.cy === 10, "antes de 1s o alvo não se move");

  eng.pvpPushTick(auth, now + 1100);           // depois do delay
  ok(eT.cx === 12 && eT.cy === 10, "push move o alvo 1 SQM a leste");
  const ev = (auth.events || []).find((e) => e.t === "pvp-push");
  ok(ev && ev.targetId === "2" && ev.sourceId === "1",
    "evento pvp-push emitido com source/target");
  ok(!entOf(auth, 1)._pushReq, "request consumido após o push");
}

console.log("\n== Distância: pusher longe re-tenta e expira ==");
{
  const now = Date.now();
  const pusher = mkChar(1, 100, 1, 10, 10);
  const target = mkChar(2, 200, 1, 20, 10);   // 10 SQMs de distância
  const auth = makeAuth([pusher, target]);
  const eT = entOf(auth, 2), req = { id: "2", cx: 21, cy: 10, at: now };
  entOf(auth, 1)._pushReq = req;

  eng.pvpPushTick(auth, now + 2000);
  ok(eT.cx === 20, "longe demais: alvo não move");
  ok(entOf(auth, 1)._pushReq === req, "request permanece pendente (autowalk)");

  // Timeout conta do agendamento: request velho morre mesmo distante.
  entOf(auth, 1)._pushReq = { id: "2", cx: 21, cy: 10, at: now - 16000 };
  eng.pvpPushTick(auth, now);
  ok(eT.cx === 20 && !entOf(auth, 1)._pushReq, "timeout 15s cancela o request");
  ok((auth.events || []).some((e) => e.t === "pvp-push-fail" && e.reason === "noway"),
    "pvp-push-fail noway emitido no timeout");
}

console.log("\n== Destino inválido ==");
{
  const now = Date.now();
  const pusher = mkChar(1, 100, 1, 10, 10);
  const target = mkChar(2, 200, 1, 11, 10);
  const blocker = mkChar(3, 300, 2, 12, 10);  // ocupa o destino
  const auth = makeAuth([pusher, target, blocker]);
  const eP = entOf(auth, 1), eT = entOf(auth, 2);

  eP._pushReq = { id: "2", cx: 11, cy: 10, at: now };   // mesmo tile do alvo
  eng.pvpPushTick(auth, now + 1100);
  ok(eT.cx === 11 && (auth.events || []).some((e) => e.t === "pvp-push-fail" && e.reason === "range"),
    "soltar no mesmo tile falha (range)");

  eP._pushReq = { id: "2", cx: 13, cy: 10, at: now };   // 2 SQMs do alvo
  eng.pvpPushTick(auth, now + 2200);
  ok(eT.cx === 11 && (auth.events || []).filter((e) => e.t === "pvp-push-fail").length >= 2,
    "soltar a 2 SQMs do alvo falha (range)");

  eP._pushReq = { id: "2", cx: 12, cy: 10, at: now };   // célula ocupada
  eng.pvpPushTick(auth, now + 3300);
  ok(eT.cx === 11 && (auth.events || []).some((e) => e.t === "pvp-push-fail" && e.reason === "room"),
    "célula ocupada falha (room)");
}

console.log("\n== PZ: alvo em safezone só sai pra safezone ==");
{
  const now = Date.now();
  const l = PVP.pvpMapLocal(PVP.PVP_MAPS.ank_open);
  const sz = l.sz1;
  const my = Math.floor((sz.y1 + sz.y2) / 2);
  // Alvo na borda direita da sz; destino adjacente FORA da sz.
  const pusher = mkChar(1, 100, 1, sz.x2 - 1, my);
  const target = mkChar(2, 200, 1, sz.x2, my);
  const auth = makeAuth([pusher, target]);
  auth.blockedCells = {};                      // isola a regra PZ do mapa real
  const eP = entOf(auth, 1), eT = entOf(auth, 2);

  eP._pushReq = { id: "2", cx: sz.x2 + 1, cy: my, at: now };
  eng.pvpPushTick(auth, now + 1100);
  const failEv = (auth.events || []).find((e) => e.t === "pvp-push-fail");
  ok(eT.cx === sz.x2 && eT.cy === my, "alvo em PZ não sai pra fora");
  ok(failEv && failEv.reason === "pz",
    `fail pz emitido (reason=${failEv && failEv.reason})`);

  // Destino DENTRO da própria safezone → push funciona.
  eP._pushReq = { id: "2", cx: sz.x2 - 1, cy: my + 1 <= sz.y2 ? my + 1 : my - 1, at: now };
  // o pusher ocupa (x2-1,my) — manda o alvo pra diagonal interna livre
  eP._pushReq = { id: "2", cx: sz.x2 - 1, cy: my - 1, at: now };
  eng.pvpPushTick(auth, now + 2200);
  ok(eT.cx === sz.x2 - 1 && eT.cy === my - 1,
    "alvo em PZ empurrado pra outro SQM de PZ funciona");
}

console.log("\n== Rooted bloqueia o push ==");
{
  const now = Date.now();
  const pusher = mkChar(1, 100, 1, 10, 10);
  const target = mkChar(2, 200, 1, 11, 10);
  target.p.conditions = { rooted: { until: now + 9000 } };
  const auth = makeAuth([pusher, target]);
  const eT = entOf(auth, 2);
  entOf(auth, 1)._pushReq = { id: "2", cx: 12, cy: 10, at: now };
  eng.pvpPushTick(auth, now + 1100);
  ok(eT.cx === 11, "alvo rooted não se move");
  ok((auth.events || []).some((e) => e.t === "pvp-push-fail" && e.reason === "rooted"),
    "pvp-push-fail rooted emitido");
}

console.log("\n== Empurrar o PRÓPRIO char não trava o pusher ==");
{
  const now = Date.now();
  const pusher = mkChar(1, 100, 1, 10, 10);
  const auth = makeAuth([pusher]);
  const eP = entOf(auth, 1);
  // O cliente filtra self-push → walkGoal; se ainda assim chegar ao engine,
  // empurrar a si mesmo 1 SQM é legal no Canary (self-move) — aceita.
  eP._pushReq = { id: "1", cx: 11, cy: 10, at: now };
  eng.pvpPushTick(auth, now + 1100);
  ok(eP.cx === 11 && eP.cy === 10, "self-push move o próprio char");
}

console.log("\n== Mecânica antiga removida (clique→câmera no aliado) ==");
{
  const ui = fs.readFileSync(path.join(ROOT, "game/js/pvp-ui.js"), "utf8");
  const grid = fs.readFileSync(path.join(ROOT, "game/js/grid.js"), "utf8");
  ok(!ui.includes("_pvpSelChar"), "pvp-ui.js sem _pvpSelChar");
  ok(!grid.includes("_pvpSelChar"), "grid.js sem _pvpSelChar");
  ok(ui.includes("pvpDragStart") && ui.includes("pvpDragEnd") &&
    ui.includes("pvpPushClientTick"), "handlers de drag presentes");
  ok(ui.includes("c._pvpPush = { id:"), "pending push gravado no combat");
}

if (failures) { console.error("\n" + failures + " FALHA(S)"); process.exit(1); }
console.log("\nALL PVP PUSH TESTS PASSED");
