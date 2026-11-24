"use strict";
/* Regressão do painel de controle por personagem da batalha PvP:
 * - pvpCtrl viaja sanitizado no visual (chase/mode por char);
 * - knight/monk CHASE OFF segura a formação (sem push no alvo chamado);
 * - druida PARALYZE trava o alvo chamado (consome runa, _pvpParalyzeUntil,
 *   goal nulo durante a janela) e não desperdiça em quem já está parado;
 * - sorcerer UE gasta runa de área antes da SD;
 * - druida HEAL habilita friend-heal — e o sio NUNCA cura o outro time;
 * - paladin BOW/XBOW troca pra melhor arma da mochila + munição do preset. */
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
  const p = Object.assign({ id: String(id), name: "C" + id, voc: "druid",
    level: 300, ml: 20, hp: 1000, mp: 5000, gold: 0,
    skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 },
    supplies: {}, lootPouch: {}, equip: {}, bag: {}, itemInstances: [] }, extra || {});
  return { id: String(id), accountId: acc, pvpTeam: team, team,
    partyKey: "pvpb:1:" + team, p,
    cx, cy, x: (cx + .5) / 51, y: (cy + .5) / 52 };
}
function makeAuth(players) {
  const l = PVP.pvpMapLocal(PVP.PVP_MAPS.ank_open);
  const desc = { kind: "pvp", instanceMode: "pvp", huntId: null, bossId: null,
    members: players,
    state: { instanceMode: "pvp", gridW: l.gridW, gridH: l.gridH, mobs: [],
      players: players.map((m) => ({ id: m.id, cx: m.cx, cy: m.cy,
        x: (m.cx + .5) / l.gridW, y: (m.cy + .5) / l.gridH })),
      pvpBattle: { battleId: 1, mapId: "ank_open", mode: "frags", pz: true,
        fragTarget: 100, safezones: { 1: l.sz1, 2: l.sz2 }, controlZone: null,
        teams: { 1: { guildId: 1, name: "Alpha" }, 2: { guildId: 2, name: "Beta" } },
        scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
  return eng.initializeAuthority(desc, "test-pvp-ctrl", Date.now()).authority;
}

console.log("== sanitizePvpCtrl ==");
{
  ok(eng.sanitizePvpCtrl(null) === null, "null → null");
  const d = eng.sanitizePvpCtrl({});
  ok(d && d.chase === true && d.mode === "sd", "default chase ON + mode sd");
  const u = eng.sanitizePvpCtrl({ chase: 0, mode: "ue" });
  ok(u.chase === false && u.mode === "ue", "chase OFF + mode ue");
  const bad = eng.sanitizePvpCtrl({ mode: "hax" });
  ok(bad.mode === "sd", "modo inválido cai pra sd");
  ok(eng.sanitizePvpCtrl({ mode: "paralyze" }).mode === "paralyze" &&
     eng.sanitizePvpCtrl({ mode: "heal" }).mode === "heal" &&
     eng.sanitizePvpCtrl({ mode: "bow" }).mode === "bow" &&
     eng.sanitizePvpCtrl({ mode: "xbow" }).mode === "xbow",
     "modos paralyze/heal/bow/xbow aceitos");
}

console.log("== normalizeVisualState carrega pvpCtrl ==");
{
  const c1 = mkChar(1, 100, 1, 10, 10);
  const auth = makeAuth([c1, mkChar(2, 200, 2, 40, 40)]);
  const norm = eng.normalizeVisualState({ players: [
    { id: "1", x: 0.2, y: 0.2, pvpCtrl: { chase: 0, mode: "paralyze" } },
    { id: "2", x: 0.4, y: 0.4, pvpCtrl: { chase: 1, mode: "ue" } }] }, auth);
  const v1 = norm.players.find((v) => v.id === "1"), v2 = norm.players.find((v) => v.id === "2");
  ok(v1 && v1.pvpCtrl && v1.pvpCtrl.chase === 0 && v1.pvpCtrl.mode === "paralyze",
    "pvpCtrl chega no visual (chase/mode)");
  ok(v2 && v2.pvpCtrl && v2.pvpCtrl.mode === "ue", "segundo char com pvpCtrl próprio");
}

console.log("== CHASE: knight segura a formação com chase OFF ==");
{
  const now = Date.now();
  const c1 = mkChar(1, 100, 1, 10, 10, { voc: "elite knight" }); // auxiliar
  const c2 = mkChar(2, 100, 1, 8, 8, { voc: "elite knight" });   // âncora (mesma conta)
  const c3 = mkChar(3, 200, 2, 14, 10);                         // inimigo chamado
  const auth = makeAuth([c1, c2, c3]);
  auth.clock = now;
  auth.pvpBattle.teams[1].leaderAccountId = 100;
  auth.pvpBattle.teams[1].targetId = "3";
  const e1 = auth.players.find((e) => String(e.id) === "1");
  const goalOn = eng.pvpBattleGoal(auth, e1);
  ok(goalOn && goalOn.push === true, "chase ON (default) avança no alvo chamado");
  e1._pvpCtrl = { chase: false, mode: "sd" };
  const goalOff = eng.pvpBattleGoal(auth, e1);
  ok(!(goalOff && goalOff.push), "chase OFF não sai em push no alvo chamado");
  ok(!goalOff || goalOff.follow || goalOff.td === 0,
    "chase OFF mantém formação/posição (follow ou parado)");
}

console.log("== PARALYZE: druida trava o alvo chamado ==");
{
  const now = Date.now();
  const c1 = mkChar(1, 100, 1, 10, 10, { voc: "elder druid" });
  c1.p.supplies["paralyze-rune"] = 2;
  const c2 = mkChar(2, 200, 2, 13, 10); // alvo chamado a 3 sqm
  const auth = makeAuth([c1, c2]);
  auth.clock = now;
  auth.pvpBattle.teams[1].targetId = "2";
  const e1 = auth.players.find((e) => String(e.id) === "1");
  const e2 = auth.players.find((e) => String(e.id) === "2");
  e1._pvpCtrl = { chase: true, mode: "paralyze" };
  e1.p._runeCd = 0; e1.p._offensiveCd = 0; e1.p._groupCd = {};
  const cast = eng.pvpTryParalyze(auth, e1, e1.p, now, [], now);
  ok(cast === true, "paralyze castado no alvo chamado");
  ok(e1.p.supplies["paralyze-rune"] === 1, "consumiu 1 carga de paralyze rune");
  ok(Number(e2._pvpParalyzeUntil) > now && e2._pvpParalyzeUntil <= now + eng.PVP_BATTLE_PARALYZE_MS + 5,
    `_pvpParalyzeUntil +${e2._pvpParalyzeUntil - now}ms`);
  ok((e1.p._runeCd || 0) >= now + 5900, "runa entra no cooldown (6s)");
  ok(eng.pvpBattleGoal(auth, e2) === null, "alvo paralisado não anda (goal null)");
  const again = eng.pvpTryParalyze(auth, e1, e1.p, now + 100, [], now + 100);
  ok(again === false, "não desperdiça runa em alvo já paralisado");
  ok(e1.p.supplies["paralyze-rune"] === 1, "carga preservada na repetição");
  // Fora de alcance: alvo a >7 sqm não paralisa.
  e2.cx = 25; e2.x = (25.5) / 51;
  e2._pvpParalyzeUntil = 0;
  e1.p._runeCd = 0; e1.p._offensiveCd = 0; e1.p._groupCd = {};
  const far = eng.pvpTryParalyze(auth, e1, e1.p, now, [], now);
  ok(far === false && e1.p.supplies["paralyze-rune"] === 1,
    "alvo fora de alcance: sem cast, sem consumo");
}

console.log("== UE: sorcerer gasta runa de área antes da SD ==");
{
  const now = Date.now();
  const c1 = mkChar(1, 100, 1, 10, 10, { voc: "master sorcerer" });
  c1.p.supplies["thunderstorm-rune"] = 3;
  c1.p.supplies["sudden-death-rune"] = 5;
  const c2 = mkChar(2, 200, 2, 12, 10);
  const auth = makeAuth([c1, c2]);
  auth.clock = now;
  const e1 = auth.players.find((e) => String(e.id) === "1");
  const e2 = auth.players.find((e) => String(e.id) === "2");
  e1.p._runeCd = 0; e1.p._offensiveCd = 0; e1.p._groupCd = {};
  const proxy = { id: "2", hp: e2.p.hp, p: e2.p, cx: e2.cx, cy: e2.cy, x: e2.x, y: e2.y, _playerEnt: e2 };
  const fired = eng.pvpTryUeRunes(auth, e1, e1.p, now, proxy, [proxy], now);
  ok(fired === true, "UE dispara runa de área");
  ok(e1.p.supplies["thunderstorm-rune"] === 2, "thunderstorm consumida primeiro");
  ok(e1.p.supplies["sudden-death-rune"] === 5, "SD preservada quando UE pega");
}

console.log("== HEAL: friend-heal só cura o próprio time ==");
{
  const now = Date.now();
  const healer = mkChar(1, 100, 1, 10, 10, { voc: "elder druid" });
  healer._pvpCtrl = { chase: true, mode: "heal" };
  const ally = mkChar(2, 100, 1, 11, 10, { voc: "elite knight" });
  const foe = mkChar(3, 200, 2, 12, 10);
  const auth = makeAuth([healer, ally, foe]);
  auth.clock = now;
  const eHealer = auth.players.find((e) => String(e.id) === "1");
  const eAlly = auth.players.find((e) => String(e.id) === "2");
  const eFoe = auth.players.find((e) => String(e.id) === "3");
  eHealer._pvpCtrl = { chase: true, mode: "heal" };
  eAlly.p.hp = Math.floor(eAlly.p.hp * 0.4);
  eFoe.p.hp = Math.floor(eFoe.p.hp * 0.4);
  const allyHp = eAlly.p.hp, foeHp = eFoe.p.hp;
  eHealer.friendHealAcc = 5000;
  auth._stepDt = 0; // não deixa o acc ser resetado pelo dt do teste
  eng.healPlayers(auth, now);
  ok(eAlly.p.hp > allyHp, "modo heal curou o aliado mais ferido");
  ok(eFoe.p.hp === foeHp, "modo heal NUNCA cura o inimigo (mesmo ferido)");
}

console.log("== Equip: paladin BOW/XBOW troca arma + munição ==");
{
  const now = Date.now();
  const pal = mkChar(1, 100, 1, 10, 10, { voc: "royal paladin" });
  pal.p.equip.weapon = { item: "crossbow", count: 1 };
  pal.p.bag["elvish-bow"] = 1;
  pal.p.bag["arbalest"] = 1;
  const auth = makeAuth([pal, mkChar(2, 200, 2, 40, 40)]);
  const e1 = auth.players.find((e) => String(e.id) === "1");
  e1._pvpCtrl = { chase: true, mode: "bow" };
  eng.pvpEquipPreset(auth, e1, e1.p, now);
  ok(e1.p.equip.weapon && e1.p.equip.weapon.item === "elvish-bow",
    `BOW vestiu o melhor bow da mochila (${e1.p.equip.weapon && e1.p.equip.weapon.item})`);
  ok(e1.p.equip.ammo && e1.p.equip.ammo.item === "diamond-arrow", "munição → diamond arrow");
  const crossbowBack = (e1.p.bag["crossbow"] || 0) === 1 ||
    (e1.p.itemInstances || []).some((i) => i && i.slug === "crossbow" && i.loc === "bag");
  ok(crossbowBack, "arma anterior voltou pra mochila");
  // Troca pra XBOW: melhor crossbow disponível (arbalest na bag + crossbow equipada).
  e1._pvpCtrl = { chase: true, mode: "xbow" };
  eng.pvpEquipPreset(auth, e1, e1.p, now);
  ok(/crossbow|arbalest/.test(String(e1.p.equip.weapon.item)),
    `XBOW vestiu crossbow da mochila (${e1.p.equip.weapon.item})`);
  ok(e1.p.equip.ammo && e1.p.equip.ammo.item === "spectral-bolt", "munição → spectral bolt");
  // Mesma chamada duas vezes: memoizada, sem efeito colateral.
  const weaponOnce = e1.p.equip.weapon.item;
  eng.pvpEquipPreset(auth, e1, e1.p, now);
  ok(e1.p.equip.weapon.item === weaponOnce, "preset memoizado (sem re-swap a cada tick)");
}

console.log("");
console.log("== BCP BOW/XBOW: auto-equip arma + quiver + melhor munição ==");
{
  const ITEMS = eng.ITEMS;
  const mkP = (extra) => Object.assign({ name: "Pal", voc: "royal paladin", level: 300,
    equip: {}, bag: {}, lootPouch: {}, supplyStash: {}, supplies: {}, itemInstances: [], config: {} }, extra || {});
  const auth = { events: [], clock: 1000, gridW: 11, gridH: 5, players: [] };
  // 1) bow na loot pouch, crossbow equipado, sem quiver equipado (quiver na stash).
  {
    const p = mkP({ equip: { weapon: { item: "royal-crossbow", count: 1 }, ammo: { item: "spectral-bolt", count: null } },
      lootPouch: { "elvish-bow": 1 }, supplyStash: { "jungle-quiver": 1 } });
    const it = { id: "9", accountId: 1, p, _pvpCtrl: { mode: "bow", chase: true }, cx: 1, cy: 1, x: .1, y: .3 };
    eng.pvpEquipPreset(auth, it, p, 1000);
    ok(p.equip.weapon && p.equip.weapon.item === "elvish-bow", "bow da loot pouch equipado");
    ok(p.equip.ammo && p.equip.ammo.item === "diamond-arrow", "munição = diamond arrow");
    ok(p.config.refillArrow === "diamond-arrow", "refill de arrow aponta diamond arrow");
    ok(p.equip.shield && p.equip.shield.item === "jungle-quiver", "quiver auto-equipado da supply stash");
    ok((Number(p.bag["royal-crossbow"]) || 0) + (p.itemInstances || []).filter((i) => i.slug === "royal-crossbow" && i.loc === "bag").length >= 1,
      "crossbow anterior volta pra mochila (nada some)");
    // 2) xbow de volta: spectral bolt.
    it._pvpCtrl = { mode: "xbow", chase: true };
    eng.pvpEquipPreset(auth, it, p, 1200);
    ok(p.equip.weapon && p.equip.weapon.item === "royal-crossbow", "xbow re-equipa o crossbow");
    ok(p.equip.ammo && p.equip.ammo.item === "spectral-bolt", "munição = spectral bolt");
  }
  // 3) Sem crossbow nenhum: não cria item, avisa 1x e re-tenta depois.
  {
    const p = mkP({ equip: { weapon: { item: "elvish-bow", count: 1 }, ammo: { item: "diamond-arrow", count: null } } });
    const it = { id: "8", accountId: 2, p, _pvpCtrl: { mode: "xbow", chase: true }, cx: 1, cy: 1, x: .1, y: .3 };
    auth.events.length = 0;
    eng.pvpEquipPreset(auth, it, p, 1000);
    ok(p.equip.weapon.item === "elvish-bow", "sem crossbow: arma atual mantida (nunca cria item)");
    ok(auth.events.some((e) => e.t === "pvp-equip-fail" && e.mode === "xbow"), "evento pvp-equip-fail emitido");
    eng.pvpEquipPreset(auth, it, p, 1500);
    ok(auth.events.filter((e) => e.t === "pvp-equip-fail").length === 1, "aviso não spamma");
    p.lootPouch["royal-crossbow"] = 1;              // item chegou depois
    eng.pvpEquipPreset(auth, it, p, 1000 + 3001);
    ok(p.equip.weapon.item === "royal-crossbow", "re-tenta após 3s e equipa quando o item aparece");
  }
  // 4) Nível baixo: diamond arrow (150) indisponível → melhor arrow do nível.
  {
    const p = mkP({ level: 50, equip: { weapon: { item: "crossbow", count: 1 } }, bag: { "bow": 1 } });
    const it = { id: "7", accountId: 3, p, _pvpCtrl: { mode: "bow", chase: true }, cx: 1, cy: 1, x: .1, y: .3 };
    eng.pvpEquipPreset(auth, it, p, 1000);
    const am = p.equip.ammo && ITEMS[p.equip.ammo.item];
    ok(p.equip.ammo && p.equip.ammo.item !== "diamond-arrow" && am && (Number(am.lvl) || 0) <= 50,
      "nível baixo: melhor arrow permitida (" + (p.equip.ammo && p.equip.ammo.item) + ")");
  }
}

if (failures) { console.error(`${failures} FALHA(S)`); process.exit(1); }
console.log("ALL PVP CTRL TESTS PASSED");
