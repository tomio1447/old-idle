/* E2E: damage taken do analyser inclui dano absorvido pelo magic shield
 * (utamo pool / energy ring) e dano direto na mana (manadrain já contava).
 * HP só perde a parte pós-shield; o evento "taken" carrega HP+shield. */
"use strict";
const engine = require("../server/authoritative_engine");

let fails = 0;
const must = (ok, msg) => { if (!ok) { fails++; console.log("  ✘ " + msg); } else console.log("  ✔ " + msg); };

engine.MONSTERS["analyser-dummy"] = {
  name: "Analyser Dummy", hp: 999999, exp: 0, damage: 300, armor: 0, defense: 0,
  element: "energy", attackSpeed: 2000, loot: [], mitigation: 0, resist: {},
  skills: [{ el: "energy", min: 200, max: 200, int: 2000, ch: 100 }],
};

function mkPlayer() {
  return { id: 1, name: "ShieldTester", voc: "sorcerer", level: 400, exp: engine.expForLevel(400),
    hp: 50_000, mp: 100_000, gold: 0,
    skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 10 },
    ml: 80, equip: {}, supplies: {}, lootPouch: {}, kills: {}, bosses: {}, config: {},
    /* utamo vita ativo: pool 500 */
    magicShieldUntil: Date.now() + 3600_000, magicShieldPool: 500, magicShieldCap: 500,
  };
}
const W = 30;
const p = mkPlayer();
const desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "frozen", bossId: null,
  instanceMode: "non-pvp", activeCharacterId: "1",
  members: [{ id: "1", p: JSON.parse(JSON.stringify(p)) }],
  state: {
    players: [{ id: "1", p, cx: 16, cy: 15, x: 16.5 / W, y: 15.5 / W }],
    mobs: [{ id: "m1", slug: "analyser-dummy", cx: 15, cy: 15, x: 15.5 / W, y: 15.5 / W }],
    events: [], gridW: W, gridH: W,
  },
};
let auth = engine.initializeAuthority(desc, "b".repeat(64), 1000);
/* congela o melee do dummy (damage 0) para medir SÓ a skill (200 fixo) */
auth.authority.mobs[0].damage = 0;

let clock = 1000;
let takenTotal = 0, shieldEvTotal = 0, takenEvents = 0, shieldOnlyEvents = 0;
let hpBefore = null;
for (let t = 0; t < 30_000; t += 1000) {
  const res = engine.advanceAuthorityState(JSON.stringify(auth), 1000, clock + 1000);
  auth = JSON.parse(res.state); clock += 1000;
  for (const ev of ((auth.state && auth.state.events) || [])) {
    if (ev.t === "taken" && String(ev.targetId) === "1") {
      takenTotal += Number(ev.dmg) || 0; takenEvents++;
      if (Number(ev.shield) > 0 && Number(ev.dmg) === Number(ev.shield)) shieldOnlyEvents++;
    }
    if (ev.t === "magic-shield") shieldEvTotal += Number(ev.mana) || 0;
  }
  /* mantém o shield renovado com pool 500 para o teste inteiro */
  const it = auth.authority.players[0];
  it.p.magicShieldUntil = clock + 3600_000;
  it.p.magicShieldPool = 500;
  it.p.hp = engine.maxStats(it.p).hp;
  it.p.mp = engine.maxStats(it.p).mp; it.p.downUntil = 0;
  hpBefore = it.p.hp;
}
/* sem shield o taken seria ~200/golpe de skill + 0 melee; com shield ativo
 * TODA a skill (200) é absorvida (pool 500) => taken por golpe = 200
 * (HP intacto) — antes do fix taken seria 0 e o analyser não contaria. */
console.log("  taken events:", takenEvents, "| taken total:", takenTotal,
  "| pool absorvida (eventos magic-shield):", shieldEvTotal, "| 100% shield:", shieldOnlyEvents);
must(takenEvents > 0, "cada golpe absorvido gera evento taken (era 0 antes)");
must(takenTotal >= shieldEvTotal - 50, "taken total ≈ dano total absorvido pelo shield (analyser conta)");
must(shieldOnlyEvents > 0, "hits 100% absorvidos contam como taken (dmg == shield)");

/* cenário 2: shield parcial (pool 50) — taken = HP + shield */
const p2 = mkPlayer(); p2.magicShieldPool = 50;
const desc2 = JSON.parse(JSON.stringify(desc));
desc2.members = [{ id: "1", p: JSON.parse(JSON.stringify(p2)) }];
desc2.state.players = [{ id: "1", p: p2, cx: 16, cy: 15, x: 16.5 / W, y: 15.5 / W }];
let auth2 = engine.initializeAuthority(desc2, "c".repeat(64), 1000);
auth2.authority.mobs[0].damage = 0;
let clock2 = 1000, partTaken = 0, partShield = 0, partHpLoss = 0, prevHp = null;
for (let t = 0; t < 6000; t += 1000) {
  prevHp = auth2.authority.players[0].p.hp;
  const res = engine.advanceAuthorityState(JSON.stringify(auth2), 1000, clock2 + 1000);
  auth2 = JSON.parse(res.state); clock2 += 1000;
  const it = auth2.authority.players[0];
  partHpLoss += Math.max(0, prevHp - it.p.hp);
  for (const ev of ((auth2.state && auth2.state.events) || [])) {
    if (ev.t === "taken" && String(ev.targetId) === "1") partTaken += Number(ev.dmg) || 0;
    if (ev.t === "magic-shield") partShield += Number(ev.mana) || 0;
  }
  it.p.hp = engine.maxStats(it.p).hp; it.p.mp = engine.maxStats(it.p).mp;
}
console.log("  shield parcial: taken =", partTaken, "| hp perdido =", partHpLoss, "| shield pagou =", partShield);
must(Math.abs(partTaken - (partHpLoss + partShield)) <= 2,
  "taken == HP perdido + shield absorvido (diferença " + Math.abs(partTaken - (partHpLoss + partShield)) + ")");

console.log(fails ? "FALHAS: " + fails : "TUDO OK");
process.exit(fails ? 1 : 0);
