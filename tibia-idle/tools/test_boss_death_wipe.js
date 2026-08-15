/* Boss fight death: permadead (sem contador/revive), wipe → templo. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");
const combatSrc = fs.readFileSync(path.join(js, "combat.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const renderSrc = fs.readFileSync(path.join(js, "render.js"), "utf8");
const scarlettSrc = fs.readFileSync(path.join(js, "scarlett-boss.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
const engineSrc = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");

function must(ok, msg) { if (!ok) throw Error(msg); }

must(combatSrc.includes("function bossFailAndReturnTemple"), "bossFailAndReturnTemple ausente");
must(combatSrc.includes("ent.permadead = true") && combatSrc.includes("c.boss && typeof partyHandleDown"),
  "morte em boss não usa partyHandleDown/permadead");
must(!/if \(c\.boss\) \{\s*[\s\S]*?playerDeath\(c, p/.test(combatSrc.slice(
  combatSrc.indexOf("BOSS: sem revive"), combatSrc.indexOf("Gates de HP do boss"))),
  "boss ainda chama playerDeath (contador)");

must(gameSrc.includes("if(!c.boss){") && gameSrc.includes("partyWipeBlessCost"),
  "finishIdleInstance ainda tenta bless/retorno em wipe de boss");
must(scarlettSrc.includes("bossFailAndReturnTemple") &&
  scarlettSrc.includes("PARTY DERROTADA — BOSS FALHOU") &&
  !scarlettSrc.includes("ent.permadead=false;ent.reviveAt=c.deadUntil"),
  "Scarlett wipe ainda agenda revive/contador");
must(renderSrc.includes("!!ent.permadead") && renderSrc.includes("!combat.boss"),
  "render ainda mostra contador em wipe de boss");
must(indexSrc.includes("boss-death-wipe-v1"), "cache-bust boss-death-wipe-v1 ausente");

must(engineSrc.includes("function authIsBossFight") &&
  engineSrc.includes("function authMarkPlayerDeath") &&
  engineSrc.includes("if(authIsBossFight(auth)){") &&
  engineSrc.includes('terminalReason="party-wipe";return;'),
  "motor autoritativo não encerra wipe de boss sem bless");
must(engineSrc.includes("reviveAt:item.permadead?0:(item.downUntil||0)") &&
  engineSrc.includes("permadead:!!item.permadead") &&
  engineSrc.includes("!authIsBossFight(auth)"),
  "snapshot online não propaga permadead / ainda marca dead com timer em boss");

// Offline: solo em boss → permadead, sem deadUntil/contador.
const ctx = {
  reviveTime: () => 30000,
  applyCharacterDeathConsequences: () => ({ exp: 0 }),
  saveCharacterToRoster() {},
  addLog() {},
  toast() {},
  clearInstanceSession() { ctx.cleared = true; },
  stopHunt() { ctx.stopped = true; },
  setTimeout: (fn) => { ctx.pending = fn; },
};
vm.createContext(ctx);
let a = combatSrc.indexOf("function bossFailAndReturnTemple");
let b = combatSrc.indexOf("/* Morte do jogador:", a);
vm.runInContext(combatSrc.slice(a, b), ctx);

const player = { id: "solo", name: "Solo", hp: 0, level: 50 };
const ent = { id: "solo", name: "Solo", p: player, x: 0.2, y: 0.5, dir: "e" };
const fight = { boss: { id: "timira", name: "Timira" }, player: ent, players: [ent], huntId: null };
ctx.partyHandleDown(fight, player, 1000);
must(ent.permadead === true && ent.reviveAt === 0 && ent.deathPos,
  "solo em boss não ficou permadead/corpo");
must(fight.bossFailed && fight.instanceFinished && ctx.cleared,
  "wipe de boss solo não falhou/limpou a instância");
ctx.pending && ctx.pending();
must(ctx.stopped, "wipe de boss não agendou retorno ao templo");

// Party: um morto continua; wipe só com todos.
ctx.cleared = false; ctx.stopped = false; ctx.pending = null;
const aEnt = { id: "a", name: "A", p: { id: "a", name: "A", hp: 0 }, x: 0.1, y: 0.5, dir: "e" };
const bEnt = { id: "b", name: "B", p: { id: "b", name: "B", hp: 100 }, x: 0.2, y: 0.5, dir: "e" };
const party = { boss: { id: "greed", name: "Greed" }, player: aEnt, players: [aEnt, bEnt] };
ctx.partyCombatSwitchTo = (id) => { ctx.switched = id; };
ctx.partyHandleDown(party, aEnt.p, 2000);
must(aEnt.permadead && bEnt.p.hp > 0 && !party.bossFailed && ctx.switched === "b",
  "morte parcial em boss não manteve o vivo / não trocou controle");
bEnt.p.hp = 0;
ctx.partyHandleDown(party, bEnt.p, 3000);
must(party.bossFailed && ctx.cleared, "wipe com todos mortos não falhou o boss");

// Hunt normal ainda agenda revive (sem permadead).
const hEnt = { id: "h", name: "H", p: { id: "h", name: "H", hp: 0 }, x: 0.3, y: 0.5, dir: "e" };
const h2 = { id: "h2", name: "H2", p: { id: "h2", name: "H2", hp: 50 }, x: 0.4, y: 0.5, dir: "e" };
const hunt = { boss: null, huntId: "rats", player: hEnt, players: [hEnt, h2] };
ctx.partyHandleDown(hunt, hEnt.p, 5000);
must(!hEnt.permadead && hEnt.reviveAt === 5000 + 30000 && !hunt.bossFailed,
  "hunt normal perdeu revive ou virou permadead");

console.log("OK: boss death wipe (permadead, sem contador, wipe→templo; hunt intacta).");
