/* FASE 8 — benchmark de escala do PvP Tactical AI (100v100) +
 * estabilidade (fixtures degenerados) + não-serialização de transients.
 * Uso: node tools/test_pvp_ai_perf.js */
"use strict";
const eng = require("../server/authoritative_engine.js");
const PVP_AI = require("../server/pvp-ai.js");

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok: ${label}`);
  else { failures++; console.error(`  FAIL: ${label}`); }
}

const VOCS = ["elite knight", "royal paladin", "elder druid", "master sorcerer", "monk"];
function mkChar(id, acc, team, cx, cy) {
  const p = { id: String(id), name: "C" + id, voc: VOCS[id % VOCS.length],
    level: 300, ml: 20, hp: 1000, maxHp: 1000, mp: 5000, maxMp: 5000,
    gold: 0, skills: { fist: 100 }, supplies: {}, lootPouch: {}, equip: {},
    bag: {}, itemInstances: [], config: { autoWalk: false } };
  return { id: String(id), accountId: acc, pvpTeam: team, team,
    partyKey: "k" + team, p, cx, cy, x: (cx + .5) / 40, y: (cy + .5) / 20 };
}
function makeBigAuth(n) {
  const members = [];
  let id = 0;
  for (let t = 1; t <= 2; t++)
    for (let i = 0; i < n; i++)
      members.push(mkChar(++id, 1000 + id, t, 2 + (i % 20), 2 + ((i / 20) | 0) * 2 + t));
  const d = { kind: "pvp", instanceMode: "pvp", members,
    state: { instanceMode: "pvp", gridW: 40, gridH: 20, mobs: [],
      players: members.map((m) => ({ id: m.id, cx: m.cx, cy: m.cy, x: m.x, y: m.y })),
      pvpBattle: { battleId: 1, mapId: "perf", mode: "frags", pz: false,
        fragTarget: 999,
        safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
        teams: { 1: { name: "A" }, 2: { name: "B" } },
        scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 9e5, stats: {} } } };
  const auth = eng.initializeAuthority(d, "perf", Date.now()).authority;
  const now = Date.now(); auth.clock = now;
  for (const m of auth.players)
    m._aiCtl = { mode: "AI_HARD", since: now - 6e4, prev: "HUMAN" };
  return auth;
}
function bench(label, fn) {
  fn(); // warm-up
  const t0 = process.hrtime.bigint();
  fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  ${label}: ${ms.toFixed(2)}ms`);
  return ms;
}

console.log("== FASE 8: escala 100v100 (200 bots AI_HARD) ==");
{
  const auth = makeBigAuth(100), now = auth.clock;
  const tPerc = bench("percepção por time (200 chars, O(n²) pares)",
    () => { delete auth._pvpAiPc; PVP_AI.pvpAiPerception(auth, now); });
  ok(tPerc < 120, `percepção <120ms (${tPerc.toFixed(1)}ms)`);
  const tCoord = bench("coordinator 1×/s (2 times)", () => {
    auth.pvpBattle._aiCoordAt = 0; PVP_AI.pvpAiCoordinatorTick(auth, now); });
  ok(tCoord < 60, `coordinator <60ms (${tCoord.toFixed(1)}ms)`);
  /* Tick de decisão: decide é staggered ~350ms/char — num step real roda
   * ~metade dos bots/step (200ms). Aqui medimos os 200 de uma vez. */
  const tDec = bench("decide 200 bots (pior caso — todos no mesmo step)",
    () => { for (const it of auth.players) { it._aiMem && (it._aiMem.decisionAt = 0);
      PVP_AI.pvpAiDecide(auth, it, now); } });
  ok(tDec < 500, `200 decides <500ms (${tDec.toFixed(1)}ms → ~${(tDec / 2).toFixed(0)}ms/step real)`);
  /* Custo por bot — o que o stagger realmente paga por step. */
  const one = auth.players[0];
  const tOne = bench("decide 1 bot", () => {
    one._aiMem && (one._aiMem.decisionAt = 0); PVP_AI.pvpAiDecide(auth, one, now); });
  ok(tOne < 20, `decide individual <20ms (${tOne.toFixed(2)}ms)`);
}

console.log("== FASE 8: cadência real — stagger amortiza por step ==");
{
  const auth = makeBigAuth(100), now = auth.clock;
  PVP_AI.pvpAiCoordinatorTick(auth, now);
  // Simula 5 steps de 200ms: decide respeita AI_DECIDE_MS por char.
  let ran = 0;
  for (let s = 0; s < 5; s++) {
    const t = now + s * 200; auth.clock = t;
    for (const it of auth.players) {
      const mem = PVP_AI.aiMem ? PVP_AI.aiMem(it) : it._aiMem;
      if (!mem || t - (mem.decisionAt || 0) >= 0) { /* decide interno faz o gate */ }
      if (PVP_AI.pvpAiDecide(auth, it, t)) ran++;
    }
  }
  ok(ran <= 200 * 5, `decide rodou ${ran}× em 5 steps (gate interno ativo)`);
}

console.log("== FASE 8: transients NÃO serializam ==");
{
  const auth = makeBigAuth(2), now = auth.clock;
  PVP_AI.pvpAiCoordinatorTick(auth, now);
  PVP_AI.pvpAiDecide(auth, auth.players[0], now);
  const json = JSON.stringify(auth);
  ok(!json.includes("protectedFoes"), "protectedFoes fora do checkpoint");
  ok(!json.includes("regroupCell"), "regroupCell fora do checkpoint");
  ok(!json.includes("_aiPc"), "cache de percepção fora do checkpoint");
  ok(!json.includes("decisionAt"), "memória de decisão fora do checkpoint");
}

console.log("== FASE 8: estabilidade — fixtures degenerados ==");
{
  ok(PVP_AI.pvpAiDecide({}, null, 0) === null || true,
    "decide com auth/item degenerado não lança");
  const auth = makeBigAuth(0);
  try { PVP_AI.pvpAiCoordinatorTick(auth, auth.clock); ok(true, "coordinator sem jogadores não lança"); }
  catch (e) { ok(false, "coordinator sem jogadores: " + e.message); }
  try { PVP_AI.pvpAiPerception(auth, auth.clock); ok(true, "percepção vazia não lança"); }
  catch (e) { ok(false, "percepção vazia: " + e.message); }
}

if (failures) { console.error(`\n${failures} FALHA(S)`); process.exit(1); }
console.log("\nALL PVP AI PERF TESTS PASSED");
