/* Prova fina: nenhum ÚNICO cast pode atingir 2 players a 9 células de um radius 2. */
"use strict";
const engine = require("../server/authoritative_engine");

engine.MONSTERS["aoe-dummy"] = {
  name: "AOE Dummy", hp: 50000, exp: 0, damage: 0, armor: 0, defense: 0,
  element: "physical", attackSpeed: 2000, loot: [],
  skills: [{ el: "energy", min: 100, max: 200, int: 1000, ch: 100, radius: 2, range: 7, alvo: 1 }],
};
function mkPlayer(id) {
  return { id, name: "T" + id, voc: "knight", level: 800, exp: engine.expForLevel(800),
    hp: 50_000_000, mp: 1000, skills: { sword: 1, shield: 1 }, ml: 1, equip: {},
    supplies: {}, lootPouch: {}, kills: {}, bosses: {}, config: {} };
}
const W = 30, p1 = mkPlayer(1), p2 = mkPlayer(2);
const desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "frozen", bossId: null,
  instanceMode: "non-pvp", activeCharacterId: "1",
  members: [{ id: "1", p: p1 }, { id: "2", p: p2 }],
  state: {
    players: [
      { id: "1", p: p1, cx: 16, cy: 15, x: 16.5 / W, y: 15.5 / W },
      { id: "2", p: p2, cx: 25, cy: 20, x: 25.5 / W, y: 20.5 / W },
    ],
    mobs: [{ id: "m1", slug: "aoe-dummy", cx: 15, cy: 15, x: 15.5 / W, y: 15.5 / W }],
    events: [], gridW: W, gridH: W,
  },
};
let auth = engine.initializeAuthority(desc, "a".repeat(64), 1000);
let clock = 1000, casts = new Map(); // ts -> Set(targets)
for (let t = 0; t < 60_000; t += 2000) {
  const res = engine.advanceAuthorityState(JSON.stringify(auth), 2000, clock + 2000);
  auth = JSON.parse(res.state); clock += 2000;
  /* p2 = ranged parado LONGE: reposiciona a cada chunk (o engine anda com os
   * membros na direção do mob — sem isso ele chega colado e o teste perde a
   * graça). Sem dano fantasma, ele NUNCA é atingido a 9 células do radius 2. */
  const far = auth.authority.players.find((it) => String(it.id) === "2");
  if (far) { far.cx = 25; far.cy = 20; far.x = 25.5 / W; far.y = 20.5 / W; }
  for (const ev of ((auth.state && auth.state.events) || [])) {
    if (ev.t === "taken") {
      const k = Number(ev.ts);
      if (!casts.has(k)) casts.set(k, new Set());
      casts.get(k).add(String(ev.targetId));
    }
  }
  for (const it of auth.authority.players) {
    it.p.hp = engine.maxStats(it.p).hp; it.p.mp = engine.maxStats(it.p).mp; it.downUntil = 0;
  }
}
let both = 0, only1 = 0, only2 = 0;
for (const [ts, set] of casts) {
  if (set.has("1") && set.has("2")) both++;
  else if (set.has("1")) only1++;
  else if (set.has("2")) only2++;
}
console.log("POST-FIX — casts com taken (agrupados por ts):", casts.size);
console.log("  cast atingiu OS DOIS simultaneamente (impossivel a 9 sqm de radius 2):", both);
console.log("  cast só no p1:", only1, "| cast só no p2:", only2);
console.log(both === 0 ? "  ✔ OK — nenhum cast fantasma" : "  ✘ AINDA HA dano fora da área");
