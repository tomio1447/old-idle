/* Party online: 1 drop = 1 crédito na pouch do líder (nunca ×N membros).
 * Também garante que catch-up local online não chama rollLoot/combatTick. */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const gameSrc = fs.readFileSync(path.join(__dirname, "..", "game", "js", "game.js"), "utf8");
const combatSrc = fs.readFileSync(path.join(__dirname, "..", "game", "js", "combat.js"), "utf8");
const serverSrc = fs.readFileSync(
  path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");

must(gameSrc.includes("onlineAuthorityCombat()") &&
  /function advanceIdleInstance[\s\S]*?onlineAuthorityCombat\(\)[\s\S]*?return \{processed:0/.test(gameSrc),
  "advanceIdleInstance deve no-op no combate online");
must(gameSrc.includes("Não rode combatTick/rollLoot local") ||
  gameSrc.includes("não pode matar/lootear") ||
  gameSrc.includes("Não rode combatTick/rollLoot local — o tick autoritativo"),
  "visibilitychange deve pular catch-up local online");
must(/function rollLoot[\s\S]*?onlineAuthorityCombat\(\)[\s\S]*?return \[\]/.test(combatSrc),
  "rollLoot online deve retornar [] sem creditar");
must(serverSrc.includes("UM crédito por kill no líder"),
  "reward() deve documentar crédito único no líder");

function mkPlayer(id) {
  return {
    id: String(id), name: "P" + id, voc: "knight", level: 200,
    exp: engine.expForLevel(200), hp: 50000, mp: 5000, gold: 0, cap: 5000,
    skills: { sword: 80, axe: 10, club: 10, dist: 10, fist: 10, shield: 50 },
    ml: 10, equip: { weapon: { item: "sword" } }, supplies: {},
    lootPouch: {}, bag: {}, ammo: {}, kills: {}, bosses: {}, config: {},
  };
}

function killWithParty(size) {
  const members = [];
  for (let i = 1; i <= size; i++) members.push({ id: String(i), p: mkPlayer(i) });
  const desc = {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "inferno", instanceMode: "non-pvp",
    activeCharacterId: "1", members,
    state: {
      players: members.map((m, i) => ({
        id: m.id, p: m.p, cx: 10 + i, cy: 10, x: (10.5 + i) / 30, y: 10.5 / 30,
      })),
      mobs: [{ id: "mob-1", slug: "demon", boss: false, cx: 15, cy: 10, x: 15.5 / 30, y: 10.5 / 30 }],
      events: [],
    },
  };
  const wrap = engine.initializeAuthority(desc, "b".repeat(64), 1000);
  const auth = wrap.authority;
  for (const item of auth.players) {
    item.p.hp = engine.maxStats(item.p).hp;
    item.p.conditions = {};
  }
  const mob = auth.mobs[0];
  must(mob, "mob ausente");
  mob.def = Object.assign({}, mob.def, {
    loot: [
      { item: "giant-sword", chance: 100, min: 1, max: 1 },
      { item: "platinum-coin", chance: 100, min: 3, max: 3 },
    ],
  });
  mob.hp = 0;
  mob.damage = 0;
  mob.attackSpeed = 1e12;
  const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(wrap), 200, 1200).state);
  return after;
}

for (const size of [1, 4, 5]) {
  const after = killWithParty(size);
  const leader = after.authority.players[0].p;
  const helpers = after.authority.players.slice(1);
  must((leader.lootPouch["giant-sword"] || 0) === 1,
    "party " + size + ": líder deveria ter 1 giant-sword, got " +
    (leader.lootPouch["giant-sword"] || 0));
  must((after.state.stats.loot["giant-sword"] || 0) === 1,
    "party " + size + ": analyser qty deve ser 1");
  for (const h of helpers) {
    must(!(h.p.lootPouch && h.p.lootPouch["giant-sword"]),
      "party " + size + ": helper " + h.id + " não deveria receber loot");
  }
  const kill = (after.state.events || []).filter((e) => e && e.t === "kill");
  must(kill.length === 1, "party " + size + ": um evento kill");
  const drop = (kill[0].loot || []).find((l) => l.item === "giant-sword");
  must(drop && drop.count === 1, "party " + size + ": kill.loot count=1");
}

console.log("OK: party loot = 1 crédito/kill no líder; catch-up online bloqueado.");
