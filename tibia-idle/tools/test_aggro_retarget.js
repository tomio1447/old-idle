/* Regressão do aggro estilo Crystal server: monstro que não consegue
 * chegar no alvo foca o jogador alcançável mais perto (paridade com
 * authorityMobTarget do servidor). Cenário: parede em x=10 separa P1
 * (inalcançável) de mob+P2. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const js = path.join(__dirname, "..", "game", "js");

let NOW = 1000;
const RealDate = Date;
const FakeDate = function (...a) { return new RealDate(...a); };
FakeDate.now = () => NOW;

const sandbox = {
  console, Math, JSON, Set, Map, Array, Object, Number, String, Infinity,
  isFinite, parseInt, parseFloat, Date: FakeDate,
  monsterRangeSQM: () => 1,          // melee: alcance 1 SQM
  partyOnlineMode: () => false,      // combate local — cliente é autoridade
};
sandbox.globalThis = sandbox;
for (const f of ["grid.js", "party.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(js, f), "utf8"), sandbox, { filename: f });
}
const { partyNearestTarget, setGridSize } = sandbox;
setGridSize(30, 30);

let pass = 0;
const ok = (cond, msg) => { if (!cond) throw Error("FAIL: " + msg); pass++; };

const mkP = (id, cx, cy) => ({ id: String(id), cx, cy, x: cx + .5, y: cy + .5, p: { id: String(id), hp: 100 } });
// parede vertical em x=10 (toda a altura) — lado esquerdo inalcançável
const wall = [];
for (let y = 0; y < 30; y++) wall.push("10:" + y);

// --- cena 1: foco inalcançável cai pro mais perto alcançável ---
const P1 = mkP(1, 5, 15);            // atrás da parede
const P2 = mkP(2, 12, 20);
const mob = { id: "m1", slug: "x", cx: 12, cy: 15, hp: 100, targetId: "1" };
const c = { players: [P1, P2], player: P2, mobs: [mob], _mapBlockKeys: wall };

// histerese do engine (2 evals ~400ms): o foco ainda vale na janela
ok(partyNearestTarget(c, mob) === P1, "foco inalcançável soltou antes da histerese");
NOW += 500;                           // passa a janela de 400ms
const alvo = partyNearestTarget(c, mob);
ok(alvo === P2, "foco inalcançável não caiu pro alcançável mais perto (veio " + (alvo && alvo.id) + ")");
ok(mob._reach && Object.keys(mob._reach.map).length >= 2, "memo de alcançabilidade não populado");

// --- cena 2: foco alcançável é mantido sem histerese ---
const mob2 = { id: "m2", slug: "x", cx: 12, cy: 15, hp: 100, targetId: "2" };
ok(partyNearestTarget(c, mob2) === P2, "foco alcançável não foi mantido");
ok(!mob2._focusFailAt, "foco alcançável marcou falha");

// --- cena 3: sem foco, preferir o ALCANÇÁVEL mais perto, não o mais perto ---
// mob em (11,10): P1 dist 2 mas inalcançável; P2 dist 10 alcançável.
const mob3 = { id: "m3", slug: "x", cx: 11, cy: 10, hp: 100 };
ok(partyNearestTarget(c, mob3) === P2, "sem foco não preferiu alcançável (veio " +
   (partyNearestTarget(c, mob3) || {}).id + ")");

// --- cena 4: sem ninguém alcançável, cai no mais perto (fallback engine) ---
const c4 = { players: [P1], player: P1, mobs: [mob3], _mapBlockKeys: wall };
ok(partyNearestTarget(c4, mob3) === P1, "sem alcançáveis não caiu no mais perto");

// --- cena 5: online confia no targetId da autoridade (server já retargeta) ---
sandbox.partyOnlineMode = () => true;
const mob5 = { id: "m5", slug: "x", cx: 12, cy: 15, hp: 100, targetId: "1" };
NOW += 1000;
ok(partyNearestTarget(c, mob5) === P1, "online não honrou targetId da autoridade");

console.log("OK: aggro retarget — inalcançável foca o mais perto alcançável (" + pass + " asserções).");
