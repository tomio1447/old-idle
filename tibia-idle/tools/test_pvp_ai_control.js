"use strict";
/* Regressão do Control Manager (PvP Tactical AI — FASE 1):
 * - máquina de estados HUMAN→AI_PENDING→AI_HARD→HUMAN_RETURNING→HUMAN;
 * - presença (_pvpDrivenAt) distingue offline; atividade intencional
 *   (_pvpHumanActAt: pose que mudou / walkIntent / actAt) distingue AFK —
 *   pose idêntica ecoando NÃO conta como jogar;
 * - AI_HARD ignora pose e walkIntent do cliente e sai do freeze de self;
 * - retorno humano tem prioridade, com graça + histerese anti-flick;
 * - DEAD é overlay e restaura o modo anterior no respawn;
 * - aiControl serializa no descriptor p/ badge do cliente. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else { failures++; console.error("  FAIL:", msg); }
}
const eng = require(path.join(ROOT, "server/authoritative_engine.js"));
const PVP_AI = require(path.join(ROOT, "server/pvp-ai.js"));
const PVP = require(path.join(ROOT, "server/pvp.js"));

function mkChar(id, acc, team, cx, cy, extra) {
  const p = Object.assign({ id: String(id), name: "C" + id, voc: "druid",
    level: 300, ml: 20, hp: 1000, maxHp: 1000, mp: 5000, maxMp: 5000, gold: 0,
    skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    supplies: {}, lootPouch: {}, equip: {}, bag: {}, itemInstances: [],
    config: { autoWalk: false, attackMode: "box" } }, extra || {});
  return { id: String(id), accountId: acc, pvpTeam: team, team,
    partyKey: "pvpb:1:" + team, p,
    cx, cy, x: (cx + .5) / 11, y: (cy + .5) / 5 };
}
function makeAuth(members) {
  const desc = { kind: "pvp", instanceMode: "pvp", members,
    state: { instanceMode: "pvp", gridW: 11, gridH: 5, mobs: [],
      players: members.map((m) => ({ id: m.id, cx: m.cx, cy: m.cy,
        x: m.x, y: m.y })),
      pvpBattle: { battleId: 1, mapId: "test-ai", mode: "frags", pz: false,
        fragTarget: 99,
        safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 10, y1: 0, x2: 10, y2: 0 } },
        teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
        scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
  return eng.initializeAuthority(desc, "test-pvp-ai", Date.now()).authority;
}
const vis = (id, cx, cy, extra) => Object.assign({ id: String(id), cx, cy,
  x: (cx + .5) / 11, y: (cy + .5) / 5, self: 1 }, extra || {});
const adv = (authority, visPlayers, elapsed) => {
  const ser = JSON.stringify({ authority });
  const o = eng.advanceAuthorityState(ser, elapsed || 200, Date.now(),
    { players: visPlayers });
  return JSON.parse(typeof o.state === "string" ? o.state : JSON.stringify(o.state)).authority;
};

console.log("== estado: HUMAN com presença + atividade ==");
{
  const c1 = mkChar(1, 100, 1, 5, 1), c2 = mkChar(2, 200, 2, 8, 1);
  const auth = makeAuth([c1, c2]), now = Date.now();
  const it = auth.players.find((p) => String(p.id) === "1");
  it._pvpDrivenAt = now; it._pvpHumanActAt = now;
  PVP_AI.pvpAiControlTick(auth, now);
  ok(it._aiCtl.mode === "HUMAN", "presença+atividade → HUMAN");
  ok(auth.pvpBattle.aiControl["1"] === "HUMAN", "aiControl serializa o modo");
}

console.log("== offline: sem self há 8s+ → AI_HARD ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now(), it = auth.players[0];
  it._pvpDrivenAt = now - 9000;
  PVP_AI.pvpAiControlTick(auth, now);
  ok(it._aiCtl.mode === "AI_HARD", "offline confirmado → AI_HARD");
  ok(PVP_AI.pvpAiBlocksPose(it), "AI_HARD bloqueia pose do cliente");
  ok(PVP_AI.pvpAiDriven(it, now), "AI_HARD recebe movimento autoritativo");
}

console.log("== offline recente: pending antes do takeover ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now(), it = auth.players[0];
  it._pvpDrivenAt = now - 6000; // >5s (IA de movimento já), <8s (formal)
  PVP_AI.pvpAiControlTick(auth, now);
  ok(it._aiCtl.mode === "AI_PENDING", "offline recente → AI_PENDING");
  ok(!PVP_AI.pvpAiBlocksPose(it), "PENDING ainda não bloqueia pose");
  ok(PVP_AI.pvpAiDriven(it, now), "PENDING com drivenAt velho já anda como IA");
}

console.log("== AFK online: driven fresco, atividade parada ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now(), it = auth.players[0];
  it._pvpDrivenAt = now;           // cliente tickando
  it._pvpHumanActAt = now - 20000; // parado há 20s
  PVP_AI.pvpAiControlTick(auth, now);
  ok(it._aiCtl.mode === "AI_PENDING", "AFK suspeito → AI_PENDING");
  it._pvpHumanActAt = now - 50000; // parado há 50s
  PVP_AI.pvpAiControlTick(auth, now);
  ok(it._aiCtl.mode === "AI_HARD", "AFK confirmado → AI_HARD");
  ok(PVP_AI.pvpAiBlocksPose(it), "AFK confirmado ignora a pose (aba aberta)");
}

console.log("== retorno humano: prioridade + graça + histerese ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now(), it = auth.players[0];
  it._pvpDrivenAt = now; it._pvpHumanActAt = now - 50000;
  PVP_AI.pvpAiControlTick(auth, now);
  PVP_AI.pvpAiControlTick(auth, now); // HUMAN→PENDING→(confirm)HARD
  ok(it._aiCtl.mode === "AI_HARD", "setup: AI_HARD");
  // Jogador age de novo → retorno tem prioridade sobre qualquer estado.
  it._pvpHumanActAt = now + 100;
  PVP_AI.pvpAiControlTick(auth, now + 100);
  ok(it._aiCtl.mode === "HUMAN_RETURNING", "atividade nova → HUMAN_RETURNING");
  PVP_AI.pvpAiControlTick(auth, now + 700);
  ok(it._aiCtl.mode === "HUMAN", "graça de 500ms → HUMAN");
  // Histerese: não despenca de volta logo após devolver o controle.
  it._pvpHumanActAt = now; // atividade 'velha' relativa a now+700
  PVP_AI.pvpAiControlTick(auth, now + 1000);
  ok(it._aiCtl.mode === "HUMAN", "histerese segura o controle no retorno");
}

console.log("== DEAD: overlay sem ações, restaura no respawn ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now(), it = auth.players[0];
  it._pvpDrivenAt = now - 9000;
  PVP_AI.pvpAiControlTick(auth, now);
  ok(it._aiCtl.mode === "AI_HARD", "setup: AI_HARD antes de morrer");
  it.p.hp = 0;
  PVP_AI.pvpAiControlTick(auth, now + 1);
  ok(it._aiCtl.mode === "DEAD", "morto → DEAD (overlay)");
  it.p.hp = 1000; delete it.downUntil;
  PVP_AI.pvpAiControlTick(auth, now + 2);
  ok(it._aiCtl.mode === "AI_HARD", "respawn restaura o modo anterior");
}

console.log("== atividade: pose que muda conta; eco idêntico não ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  // Primeiro contato semeia actAt (benefício da dúvida); ecos idênticos
  // seguintes NÃO o avançam — é o que separa AFK de "jogando".
  let a = adv(auth, [vis(1, 5, 1)], 200);
  let it = a.players.find((p) => String(p.id) === "1");
  const seed = Number(it._pvpHumanActAt) || 0;
  ok(seed > 0, "primeiro contato semeia actAt");
  a = adv(a, [vis(1, 5, 1)], 200);
  it = a.players.find((p) => String(p.id) === "1");
  ok(Number(it._pvpHumanActAt) === seed, "pose idêntica NÃO marca atividade");
  // Andou → atividade.
  a = adv(a, [vis(1, 6, 1)], 200);
  it = a.players.find((p) => String(p.id) === "1");
  ok(Number(it._pvpHumanActAt) > seed, "pose mudou marca _pvpHumanActAt");
  // walkIntent também marca.
  const before = it._pvpHumanActAt;
  a = adv(a, [vis(1, 6, 1, { walkIntent: { dx: 1, dy: 0 } })], 200);
  it = a.players.find((p) => String(p.id) === "1");
  ok(Number(it._pvpHumanActAt) > Number(before), "walkIntent marca atividade");
}

console.log("== integração: AI_HARD ignora pose/walkIntent e anda como IA ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const it = auth.players[0];
  // Char já sob AI_HARD (AFK confirmado) continua recebendo self do
  // cliente (aba aberta) — pose e walkIntent têm de ser ignorados.
  it._aiCtl = { mode: "AI_HARD", since: Date.now() - 60000, prev: "HUMAN" };
  it._pvpHumanActAt = Date.now() - 120000;
  const ser = JSON.stringify({ authority: auth });
  const o = eng.advanceAuthorityState(ser, 200, Date.now(),
    { players: [vis(1, 9, 4)] });
  const a = JSON.parse(typeof o.state === "string" ? o.state : JSON.stringify(o.state)).authority;
  const after = a.players.find((p) => String(p.id) === "1");
  ok(a.pvpBattle.aiControl["1"] === "AI_HARD", "modo serializa no descriptor");
  ok(after.cx !== 9 || after.cy !== 4, "pose do cliente ignorada em AI_HARD");
  ok(!after.walkIntent, "walkIntent do cliente descartado em AI_HARD");
  // walkIntent é intenção humana → retorno imediato (HUMAN_RETURNING).
  const o2 = eng.advanceAuthorityState(o.state, 200, Date.now(),
    { players: [vis(1, 9, 4, { walkIntent: { dx: -1, dy: 0 } })] });
  const a2 = JSON.parse(typeof o2.state === "string" ? o2.state : JSON.stringify(o2.state)).authority;
  ok(a2.pvpBattle.aiControl["1"] === "HUMAN_RETURNING",
    "walkIntent em AI_HARD → retorno humano imediato");
}

console.log("== integração: pose do HUMAN segue autoritativa ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const ser = JSON.stringify({ authority: auth });
  const o = eng.advanceAuthorityState(ser, 200, Date.now(), { players: [vis(1, 7, 3)] });
  const a = JSON.parse(typeof o.state === "string" ? o.state : JSON.stringify(o.state)).authority;
  const after = a.players.find((p) => String(p.id) === "1");
  ok(after.cx === 7 && after.cy === 3, "char HUMAN aplica a pose do cliente");
  ok(a.pvpBattle.aiControl["1"] === "HUMAN", "pilotado recente → HUMAN no mapa");
}

console.log("== FASE 2: percepção por time 1×/tick ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(3, 100, 1, 6, 1),
    mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now();
  auth.clock = now;
  auth.players[1].p.hp = 300; // crítico (30%)
  const statFn = (p) => eng.maxStats(p);
  const pc = PVP_AI.pvpAiPerception(auth, now, statFn);
  ok(pc.teams[1].members.length === 2 && pc.teams[2].members.length === 1,
    "membros separados por time");
  ok(pc.teams[1].critical.length === 1 && pc.teams[1].critical[0].id === "3",
    "aliado crítico identificado");
  const pc2 = PVP_AI.pvpAiPerception(auth, now, statFn);
  ok(pc2 === pc, "cache por clock reutiliza o objeto");
  auth.clock = now + 200;
  const pc3 = PVP_AI.pvpAiPerception(auth, now + 200, statFn);
  ok(pc3 !== pc, "clock novo recalcula");
  ok(JSON.stringify(auth).indexOf("_aiPercept") < 0,
    "percepção não serializa (não enumerável)");
}

console.log("== FASE 2: visão tática por char ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(3, 100, 1, 6, 1),
    mkChar(2, 200, 2, 8, 1)]);
  auth.clock = Date.now();
  auth.pvpBattle.teams[1].targetId = "2";
  const it = auth.players[0];
  const v = PVP_AI.pvpAiPerceive(auth, it);
  ok(v && v.team === 1 && v.battle.targetId === "2", "battle + target call no contexto");
  ok(v.foes.length === 1 && v.foes[0].s.id === "2" && v.foes[0].d === 3,
    "hostil ordenado por distância");
  ok(v.nearestFoe && v.nearestFoe.s.id === "2", "nearestFoe aponta");
  ok(v.pursuers.length === 1, "hostil a 3sqm conta como perseguidor");
  // Hostil fora do campo de visão não é percebido.
  const far = auth.players.find((p) => String(p.id) === "2");
  far.cx = 30; far.cy = 30;
  auth.clock = Date.now() + 1;
  const v2 = PVP_AI.pvpAiPerceive(auth, it);
  ok(v2.foes.length === 0, "hostil a 25sqm fora do campo de visão");
}

console.log("== FASE 2: memória de dano recente ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now(), att = auth.players[1], vic = auth.players[0];
  // Integração: dano real via applyPlayerPvpDamage alimenta a memória.
  eng.applyPlayerPvpDamage(auth, att, vic, 200, "physical", now);
  const m = PVP_AI.aiRecentDamage(vic, now, 6000);
  ok(m.hits === 1 && m.total > 0, "dano PvP registra na memória da vítima");
  ok(m.topSrc === "2", "top attacker identificado");
  const old = PVP_AI.aiRecentDamage(vic, now + 10000, 6000);
  ok(old.total === 0 && old.hits === 0, "memória expira fora da janela");
  // Perseguidor por dano mesmo fora dos 4sqm.
  auth.players[1].cx = 30; auth.players[1].cy = 30;
  auth.clock = now;
  eng.applyPlayerPvpDamage(auth, att, vic, 50, "physical", now + 1);
  const v = PVP_AI.pvpAiPerceive(auth, vic);
  ok(v.pursuers.some((f) => f.s.id === "2"), "atacante recente entra como perseguidor");
}

console.log("== FASE 3: decisão utility — ataque/prioridades ==");
{
  const statFn = (p) => eng.maxStats(p);
  const mk = (id, acc, team, cx, cy, x) => mkChar(id, acc, team, cx, cy, x);
  // Cenário: sorcerer AI_HARD com 2 hostis — escolhe atacar e mirar o alvo.
  const auth = makeAuth([mk(1, 100, 1, 5, 1, { voc: "sorcerer" }),
    mk(2, 200, 2, 7, 1), mk(3, 200, 2, 9, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  const w = PVP_AI.pvpAiDecide(auth, it, now);
  ok(w && w.action === "ATTACK", "hostis no campo → ATTACK");
  ok(it._aiGoal && it._aiGoal.goal && it._aiGoal.goal.push === true,
    "goal push no shape do engine");
  ok(it._aiTargetId, "alvo individual registrado");
  ok(it._pvpCtrl && it._pvpCtrl.mode === "sd", "sorcerer com <3 hostis → modo sd");
  // Gate: AI_HARD serve o goal; humano → undefined (fluxo normal).
  ok(PVP_AI.pvpAiGateGoal(auth, it, now) === it._aiGoal.goal,
    "gate entrega o goal cacheado");
  const h = auth.players[1]; h._aiCtl = { mode: "HUMAN", since: 0 };
  ok(PVP_AI.pvpAiGateGoal(auth, h, now) === undefined,
    "humano não entra no gate");
}

console.log("== FASE 3: prioridades — RETREAT > ATTACK ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 6, 1),
    mkChar(3, 200, 2, 7, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  it.p.hp = 200; // crítico, 2 perseguidores colados
  const w = PVP_AI.pvpAiDecide(auth, it, now);
  ok(w && w.action === "RETREAT", "hp crítico + perseguidores → RETREAT");
  ok(it._aiGoal.goal.retreat === true, "goal de retirada pra própria sz");
}

console.log("== FASE 3: PROTECT — aliado crítico sob ameaça ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "elite knight" }),
    mkChar(3, 100, 1, 6, 1), mkChar(2, 200, 2, 7, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  auth.players[1].p.hp = 250; // aliado crítico
  const w = PVP_AI.pvpAiDecide(auth, it, now);
  ok(w && w.action === "PROTECT" && w.allyId === "3",
    "aliado crítico → PROTECT intercepta");
}

console.log("== FASE 3: target call > alvo individual ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 6, 1),
    mkChar(3, 200, 2, 9, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  auth.pvpBattle.teams[1].targetId = "3"; // comandante chamou o mais longe
  const w = PVP_AI.pvpAiDecide(auth, it, now);
  ok(w && w.targetId === "3", "target call do comandante vence o score");
}

console.log("== FASE 3: stickiness — ação não oscila ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 6, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  const w1 = PVP_AI.pvpAiDecide(auth, it, now);
  const t1 = it._aiTargetId;
  const w2 = PVP_AI.pvpAiDecide(auth, it, now + 400);
  ok(w1.action === w2.action && it._aiTargetId === t1,
    "decisão estável entre ciclos");
}

console.log("== FASE 3: modo de cast por vocação ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "sorcerer" }),
    mkChar(2, 200, 2, 8, 1), mkChar(3, 200, 2, 8, 2), mkChar(4, 200, 2, 9, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  PVP_AI.pvpAiDecide(auth, it, now);
  ok(it._pvpCtrl.mode === "ue", "sorcerer com pack de 3 perto do alvo → ue");
  ok(it._pvpCtrl._aiOwned === true, "modo marcado como AI-owned");
}

console.log("== FASE 3: _aiTargetId vale só sem target call ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 6, 1),
    mkChar(3, 200, 2, 9, 1)]);
  const it = auth.players[0];
  it._aiTargetId = "3";
  const prox = (id) => ({ id: String(id), hp: 100, maxHp: 1000, _playerEnt: true });
  const living = [prox(2), prox(3)];
  const t1 = eng.pvpBattleTarget(auth, it, living);
  ok(t1 && String(t1.id) === "3", "sem call → alvo da IA");
  auth.pvpBattle.teams[1].targetId = "2";
  const t2 = eng.pvpBattleTarget(auth, it, living);
  ok(t2 && String(t2.id) === "2", "com call → chamado vence o _aiTargetId");
}

console.log("== FASE 3: retorno limpa o modo AI-owned ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1), mkChar(2, 200, 2, 8, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  it._pvpCtrl = { mode: "ue", _aiOwned: true };
  it._aiGoal = { goal: { cx: 1, cy: 1 }, action: "ATTACK", until: now + 999 };
  it._aiTargetId = "2";
  it._pvpHumanActAt = now; // jogador voltou
  PVP_AI.pvpAiControlTick(auth, now);
  ok(it._aiCtl.mode === "HUMAN_RETURNING" && it._pvpCtrl === null &&
    it._aiGoal === null && it._aiTargetId === null,
    "handoff limpa goal/alvo/modo da IA");
}

console.log("== FASE 4: perfis por vocação ==");
{
  ok(PVP_AI.AI_PROFILES.knight.reach === 1 && PVP_AI.AI_PROFILES.paladin.reach === 3,
    "melee 1sqm / ranged 3sqm");
  ok(PVP_AI.AI_PROFILES.monk && PVP_AI.AI_PROFILES.monk.role === "frontline",
    "monk existe como frontline condicional");
  ok(PVP_AI.AI_PROFILES.druid.fleeHp > PVP_AI.AI_PROFILES.knight.fleeHp,
    "druid recua mais cedo que knight");
}

console.log("== FASE 4: DEFEND — knight intercepta quem encosta no healer ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "elite knight" }),
    mkChar(3, 100, 1, 7, 1, { voc: "druid" }), // backline aliada
    mkChar(2, 200, 2, 8, 1)]);                // hostil colado no druid
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  const w = PVP_AI.pvpAiDecide(auth, it, now);
  ok(w && w.action === "DEFEND" && w.allyId === "3",
    "knight defende a backline empurrando o agressor");
  ok(it._aiGoal.goal.defend === true && it._aiGoal.goal.td === 1,
    "intercepta colado (1sqm)");
}

console.log("== FASE 4: KITE — paladino recua do perseguidor colado ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "royal paladin" }),
    mkChar(2, 200, 2, 6, 1)]); // hostil colado
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  it.p.hp = 700; // ferido mas não crítico (flee 0.35)
  const w = PVP_AI.pvpAiDecide(auth, it, now);
  ok(w && (w.action === "KITE" || w.action === "ATTACK"),
    "paladino sob pressão responde (kite ou ataca)");
  if (w.action === "KITE")
    ok(it._aiGoal.goal.kite === true, "kite recua mantendo o fight");
}

console.log("== FASE 4: paladin BOW em pack / XBOW single ==");
{
  // Pack de 3 hostis perto do alvo → bow (área).
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "royal paladin" }),
    mkChar(2, 200, 2, 8, 1), mkChar(3, 200, 2, 8, 2), mkChar(4, 200, 2, 9, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  PVP_AI.pvpAiDecide(auth, it, now);
  ok(it._pvpCtrl.mode === "bow", "pack de 3 perto do alvo → bow");
  // Alvo isolado → xbow.
  const a2 = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "royal paladin" }),
    mkChar(2, 200, 2, 9, 1)]);
  a2.clock = now + 1;
  const it2 = a2.players[0];
  it2._aiCtl = { mode: "AI_HARD", since: now, prev: "HUMAN" };
  PVP_AI.pvpAiDecide(a2, it2, now + 1);
  ok(it2._pvpCtrl.mode === "xbow", "alvo isolado → xbow");
}

console.log("== FASE 4: druid HEAL com aliado crítico ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "elder druid" }),
    mkChar(3, 100, 1, 6, 1), mkChar(2, 200, 2, 9, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  auth.players[1].p.hp = 300; // aliado crítico
  PVP_AI.pvpAiDecide(auth, it, now);
  ok(it._pvpCtrl.mode === "heal", "aliado crítico → heal");
  // Sem mana → não trava em heal (clock novo recalcula a percepção).
  it.p.mp = 100; it.p.maxMp = 5000; it._pvpCtrl = null;
  auth.clock = now + 400;
  PVP_AI.pvpAiDecide(auth, it, now + 400);
  ok(it._pvpCtrl.mode !== "heal", "mana baixa → não força heal");
}

console.log("== FASE 4: PROTECT ranged posiciona no alcance ==");
{
  const auth = makeAuth([mkChar(1, 100, 1, 5, 1, { voc: "elder druid" }),
    mkChar(3, 100, 1, 6, 1), mkChar(2, 200, 2, 7, 1)]);
  const now = Date.now(); auth.clock = now;
  const it = auth.players[0];
  it._aiCtl = { mode: "AI_HARD", since: now - 60000, prev: "HUMAN" };
  auth.players[1].p.hp = 250; // aliado crítico
  const w = PVP_AI.pvpAiDecide(auth, it, now);
  ok(w && w.action === "PROTECT" && it._aiGoal.goal.td === 3,
    "druid posiciona a 3sqm do aliado (alcance de sio)");
}

if (failures) { console.error(`\n${failures} FALHA(S)`); process.exit(1); }
console.log("\nALL PVP AI CONTROL TESTS PASSED");
