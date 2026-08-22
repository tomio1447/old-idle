/* Audit: dano AOE dos bosses + comportamento da sequência de HP (healthbar).
 * Para cada boss de arena: 120s de combate, player imortal (curado a cada chunk).
 * Mede: taken por elemento, areafx, e a série de HP% do boss (passos fixos?). */
"use strict";
const engine = require("../server/authoritative_engine");

function player() {
  return {
    id: 1, name: "Audit", voc: "knight", level: 800, exp: engine.expForLevel(800),
    hp: 1e9, mp: 20000, gold: 100000,
    skills: { sword: 130, axe: 10, club: 10, dist: 10, fist: 10, shield: 120 },
    ml: 20, equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {},
  };
}
function bossDesc(p, bossId) {
  const member = { id: String(p.id), p: JSON.parse(JSON.stringify(p)) };
  return {
    v: 1, savedAt: 1000, kind: "boss", huntId: null, bossId,
    instanceMode: "boss", activeCharacterId: String(p.id), members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 15, cy: 15, x: 15.5 / 30, y: 15.5 / 30 }],
      mobs: [{ id: "boss-1", slug: bossId, boss: true, cx: 12, cy: 15, x: 12.5 / 30, y: 15.5 / 30 }],
      events: [], gridW: 30, gridH: 30,
    },
  };
}
function waitArenaBoss(auth, fromClock) {
  const st = auth.authority.arenaBossSpawn;
  if (!st || st.spawned || !st.pending) return auth;
  const at = Number(st.at) || (Number(fromClock) || auth.authority.clock) + 5000;
  const elapsed = Math.max(0, at - (Number(auth.authority.clock) || 0)) + 1;
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth), elapsed, at + 1).state);
}

function auditBoss(bossId) {
  const p = player();
  let auth = engine.initializeAuthority(bossDesc(p, bossId), "f".repeat(64), 1000);
  auth = waitArenaBoss(auth, 1000);
  const stats = { taken: {}, takenCount: {}, areafx: 0, effect: 0, hpSeries: [], immuneTime: 0 };
  let clock = auth.authority.clock, SIM = 120_000, CHUNK = 2000, snapshots = 0;
  for (let t = 0; t < SIM; t += CHUNK) {
    const res = engine.advanceAuthorityState(JSON.stringify(auth), CHUNK, clock + CHUNK);
    auth = JSON.parse(res.state);
    clock += CHUNK;
    const a = auth.authority;
    for (const ev of ((auth.state && auth.state.events) || [])) {
      if (ev.t === "taken") {
        stats.taken[ev.el || "?"] = (stats.taken[ev.el || "?"] || 0) + (Number(ev.dmg) || 0);
        stats.takenCount[ev.el || "?"] = (stats.takenCount[ev.el || "?"] || 0) + 1;
      } else if (ev.t === "areafx") stats.areafx++;
      else if (ev.t === "effect") stats.effect++;
    }
    const boss = (a.mobs || []).find(m => m.boss);
    if (boss) {
      stats.hpSeries.push(boss.hp / boss.maxHp);
      if (boss.qteImmune || boss.greedImmune || boss.megaImmune) stats.immuneTime++;
    }
    snapshots++;
    const it = (a.players || [])[0];
    if (it) { it.p.hp = engine.maxStats(it.p).hp; it.p.mp = engine.maxStats(it.p).mp; it.downUntil = 0; it.permadead = false; }
    if (res.terminalReason) { stats.terminal = res.terminalReason; break; }
  }
  return stats;
}

/* detecta passos fixos: quantas trocas de valor distintas a serie de HP% tem
 * e o desvio padrao dos deltas (passos fixos => deltas quase iguais) */
function stepAnalysis(series) {
  if (series.length < 4) return "curta";
  const uniq = [...new Set(series.map(v => Math.round(v * 1000) / 1000))];
  const deltas = [];
  for (let i = 1; i < series.length; i++) deltas.push(series[i - 1] - series[i]);
  const pos = deltas.filter(d => d > 0.0005);
  if (!pos.length) return "sem queda";
  const mean = pos.reduce((a, b) => a + b, 0) / pos.length;
  const sd = Math.sqrt(pos.reduce((a, b) => a + (b - mean) ** 2, 0) / pos.length);
  const steps5 = pos.every(d => Math.abs(d % 0.05) < 0.006 || Math.abs((d % 0.05) - 0.05) < 0.006);
  return `hp% final=${(series[series.length - 1] * 100).toFixed(1)} quedas=${pos.length} mediaDelta=${(mean * 100).toFixed(2)}% sd=${(sd * 100).toFixed(2)}% multiplosDe5%=${steps5 ? "SIM" : "nao"}`;
}

const bosses = process.argv[2] ? process.argv[2].split(",") : [
  "scarlett-etzel", "the-dread-maiden", "the-fear-feaster", "the-unwelcome",
  "grand-master-oberon", "timira-the-many-headed", "doctor-marrow", "faceless-bane",
  "goshnar-s-hatred", "goshnar-s-greed", "goshnar-s-spite", "goshnar-s-malice",
  "ferumbras-mortal-shell", "leiden",
];
for (const b of bosses) {
  try {
    const s = auditBoss(b);
    const elSummary = Object.entries(s.takenCount).map(([el, n]) => `${el}=${n}`).join(" ") || "NENHUM DANO";
    console.log(`\n=== ${b} ${s.terminal ? "(" + s.terminal + ")" : ""} ===`);
    console.log(`  dano recebido: ${elSummary}`);
    console.log(`  areafx=${s.areafx} effect=${s.effect} snapshotsImune=${s.immuneTime}`);
    console.log(`  healthbar: ${stepAnalysis(s.hpSeries)}`);
  } catch (e) {
    console.log(`\n=== ${b} === ERRO: ${e.message}`);
  }
}
