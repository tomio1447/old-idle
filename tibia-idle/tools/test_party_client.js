/* Teste do cliente de PARTY online (party.js + party-ui.js):
 * 1) partyCurrentZone deriva a zona certa (cidade/hunt/boss/treino);
 * 2) partyCanInviteNow só true em cidade/treino;
 * 3) partyApplyFollow chama startHunt com a MESMA instância e confirma o
 *    follow no servidor exatamente UMA vez (nonce de uso único);
 * 4) partyOnlineHtml renderiza inbox (aceitar/recusar) e trava o botão de
 *    convidar fora da zona segura;
 * 5) carrega party.js + party-ui.js sem erro de runtime.
 */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="modal"></div><div id="modal-body"></div><div id="tooltip"></div>
<div id="ctx-menu"></div><div id="hunts"></div><div id="log"></div>
<div id="party-content"></div><div id="party-badge"></div><div id="btn-party"></div>
<canvas id="scene" width="840" height="520"></canvas></body></html>`,
  { url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
const errors = [];
w.addEventListener("error", (e) => errors.push("WINDOWERROR " + e.message));
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient")
      return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    return typeof k === "string" ? () => {} : undefined;
  },
  set() { return true; },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
const ctx = vm.createContext(w);
function load(f) {
  try { vm.runInContext(fs.readFileSync(path.join(GAME, f), "utf8"), ctx, { filename: f }); }
  catch (e) { errors.push(f + ": " + e.message); }
}

// ---------- stubs globais ----------
w.$ = (sel) => w.document.querySelector(sel);
w.$$ = (sel) => Array.from(w.document.querySelectorAll(sel));
w.toast = () => {};
w.addLog = () => {};
w.renderPartyButton = () => {};
w.renderAll = () => {};
w.VOCATIONS = {
  knight: { name: "Knight" }, paladin: { name: "Paladin" },
  druid: { name: "Druid" }, sorcerer: { name: "Sorcerer" }, monk: { name: "Monk" },
};
w.fmtFull = (n) => String(n);
w.accountApiConfigured = () => true;
w.sessionToken = () => "tok";
w.sessionCharId = () => "42";

// estado do "servidor" mockado
let fakeState = null;
let fakeFollowCalls = [];
let fakeStartHunt = [];
let fakeStartBoss = [];
w.accountPartyState = async (charId) => ({ ok: true, state: fakeState });
w.accountPartyInbox = async () => ({
  ok: true,
  invites: [
    { id: 7, leader_name: "LiderX", character_name: "Membro", leader_zone: "city" },
  ],
});
w.accountPartyCreate = async () => ({ ok: true, state: {} });
w.accountPartyInvite = async () => ({ ok: true, invite: {} });
w.accountPartyLeave = async () => ({ ok: true, msg: "saiu" });
w.accountPartyFollow = async (charId, nonce) => {
  fakeFollowCalls.push(nonce);
  return { ok: true, msg: "ok" };
};
w.accountPartyReportZone = async () => ({ ok: true });
w.partyKick = async () => ({ ok: true, msg: "kick" });
w.partyAccept = async () => ({ ok: true, msg: "aceito" });
w.partyDecline = async () => ({ ok: true, msg: "recusado" });
w.startHunt = (id, instance) => { fakeStartHunt.push([id, instance]); };
w.startBoss = (id) => { fakeStartBoss.push(id); };

// ---------- carrega os arquivos do jogo ----------
load("js/party.js");
load("js/party-ui.js");

// ---------- TESTE 1: partyCurrentZone ----------
w.G = { p: { hunt: null }, inCity: true, training: null, combat: null };
if (w.partyCurrentZone().zone !== "city") errors.push("T1: city != " + w.partyCurrentZone().zone);

w.G.inCity = false; w.G.p.hunt = "rats"; w.G.p.instanceMode = "pvp"; w.G.combat = {};
if (w.partyCurrentZone().zone !== "hunt" || w.partyCurrentZone().instance !== "pvp")
  errors.push("T1: hunt errada");

w.G.combat = { boss: { id: "the-monster" } };
if (w.partyCurrentZone().zone !== "boss" || w.partyCurrentZone().boss !== "the-monster")
  errors.push("T1: boss errada");

w.G.combat = null; w.G.training = { mode: "dummy" };
if (w.partyCurrentZone().zone !== "training") errors.push("T1: training errada");

// ---------- TESTE 2: partyCanInviteNow ----------
w.G = { p: {}, inCity: true, training: null, combat: null };
if (!w.partyCanInviteNow()) errors.push("T2: cidade deveria permitir convite");
w.G.inCity = false; w.G.p.hunt = "rats"; w.G.combat = {};
if (w.partyCanInviteNow()) errors.push("T2: hunt NÃO pode convidar");
w.G.p.hunt = null; w.G.combat = null; w.G.training = { mode: "academy" };
if (!w.partyCanInviteNow()) errors.push("T2: treino deveria permitir convite");

// ---------- TESTE 3: partyApplyFollow (hunt com MESMA instância) ----------
fakeStartHunt = []; fakeFollowCalls = [];
fakeState = {
  id: 1, isLeader: false, leader: { name: "LiderX", zone: "hunt", hunt: "amazon-camp", instance: "pvp" },
  members: [], follow: { nonce: "n1", hunt: "amazon-camp", instance: "pvp", otbm: null, boss: null },
};
w.G = { p: { name: "Membro" }, inCity: true, training: null, combat: null, _partyFollowNonce: null };
w.partyApplyFollow(fakeState.follow).then(async () => {
  if (fakeStartHunt.length !== 1 || fakeStartHunt[0][0] !== "amazon-camp" || fakeStartHunt[0][1] !== "pvp")
    errors.push("T3: startHunt chamado errado: " + JSON.stringify(fakeStartHunt));
  if (fakeFollowCalls.length !== 1 || fakeFollowCalls[0] !== "n1")
    errors.push("T3: follow confirmado errado: " + JSON.stringify(fakeFollowCalls));

  // replay do mesmo nonce (poll duplicado) NÃO pode teleportar de novo
  fakeStartHunt = []; fakeFollowCalls = [];
  await w.partyApplyFollow({ nonce: "n1", hunt: "amazon-camp", instance: "pvp" });
  if (fakeStartHunt.length !== 0 || fakeFollowCalls.length !== 0)
    errors.push("T3: replay do nonce aplicou 2x");

  // ---------- TESTE 3b: follow de BOSS ----------
  fakeStartBoss = []; fakeFollowCalls = [];
  w.G._partyFollowNonce = null;
  await w.partyApplyFollow({ nonce: "n2", boss: "the-monster" });
  if (fakeStartBoss.length !== 1 || fakeStartBoss[0] !== "the-monster")
    errors.push("T3b: startBoss chamado errado");
  if (fakeFollowCalls.length !== 1 || fakeFollowCalls[0] !== "n2")
    errors.push("T3b: follow do boss não confirmado");

  // ---------- TESTE 4: HTML do modal online (inbox + trava de zona) ----------
  w.G = { p: { name: "LiderX" }, inCity: false, training: null, combat: {} }; // líder na HUNT
  const p = w.G.p;
  const box = w.document.querySelector("#party-content");
  const st = { id: 1, isLeader: true,
    leader: { name: "LiderX", zone: "hunt" },
    members: [{ id: 9, name: "Membro", voc: "paladin", level: 10 }] };
  const inbox = [
    { id: 7, leader_name: "OutroLider", character_name: "MeuChar", leader_zone: "city" },
  ];
  box.innerHTML = w.partyOnlineHtml(p, st, inbox);
  const invBtn = box.querySelector("#party-invite-btn");
  if (!invBtn) errors.push("T4: botão de convidar ausente");
  else if (!invBtn.disabled) errors.push("T4: botão de convidar DEVERIA estar desabilitado na hunt");
  if (!box.querySelector('[data-party-accept="7"]')) errors.push("T4: botão aceitar ausente");
  if (!box.querySelector('[data-party-decline="7"]')) errors.push("T4: botão recusar ausente");
  if (!/Cidade|Treino/.test(box.innerHTML)) errors.push("T4: aviso de zona ausente");

  // líder na CIDADE -> botão liberado
  w.G.inCity = true; w.G.combat = null;
  box.innerHTML = w.partyOnlineHtml(p, st, inbox);
  const btn2 = box.querySelector("#party-invite-btn");
  if (!btn2 || btn2.disabled) errors.push("T4: botão deveria estar liberado na cidade");

  // ---------- TESTE 5: sem party -> botão criar party ----------
  box.innerHTML = w.partyOnlineHtml(p, null, []);
  if (!box.querySelector("#party-create")) errors.push("T5: botão criar party ausente");

  // ---------- fim ----------
  if (errors.length) {
    console.log("ERROS (" + errors.length + "):");
    for (const e of errors.slice(0, 40)) console.log("  - " + e);
    process.exit(1);
  }
  console.log("PARTY CLIENT OK — zona, convite gated, follow (nonce único) e inbox validados");
  process.exit(0);
}).catch((e) => {
  console.error("FALHA:", e);
  process.exit(1);
});
