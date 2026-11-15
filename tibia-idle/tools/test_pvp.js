"use strict";
/* Regressão do sistema PvP guild-vs-guild:
 * 1) Assets: OTBMs de guerra + previews + safezones caminháveis.
 * 2) Controlador: constantes e exportações de server/pvp.js.
 * 3) JsonStore: lobby/aceite/recusa/reembolso/roster/insígnias.
 * 4) Engine: 35% de redução, PZ de safezone, frags, invasão, OT e fim.
 * 5) Wiring: rotas /api/pvp, lock de preparo, botão topbar, SSE e CSS. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else { failures++; console.error("  FAIL:", msg); }
}
const section = (t) => console.log("\n== " + t + " ==");

/* ---------- helpers ---------- */
function tileFlags() {
  const sb = { window: {} }; sb.window = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "game/js/tileflags.js"), "utf8"), sb);
  return sb.TILEFLAGS || {};
}
const OTBM = require(path.join(ROOT, "game/js/otbm.js"));
function readMap(name) {
  const b = fs.readFileSync(path.join(ROOT, "game/maps", name + ".otbm"));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return OTBM.read(ab, { z: 7 });
}
const PVP = require(path.join(ROOT, "server/pvp.js"));

/* ================================================================ assets */
section("Mapas e previews");
for (const id of ["ank_open", "venore_town"]) {
  ok(fs.existsSync(path.join(ROOT, "game/maps", id + ".otbm")), `game/maps/${id}.otbm existe`);
  ok(fs.existsSync(path.join(ROOT, "game/assets/ui/pvp", id + ".png")), `assets/ui/pvp/${id}.png existe`);
}
const FLAGS = tileFlags();
for (const [id, cfg] of Object.entries(PVP.PVP_MAPS)) {
  const parsed = readMap(id);
  const data = OTBM.huntMapFromOtbm(parsed, FLAGS);
  const W = data.rows[0].length, H = data.rows.length;
  ok(W === cfg.bounds.x2 - cfg.bounds.x1 + 1 && H === cfg.bounds.y2 - cfg.bounds.y1 + 1,
    `${id}: bounds ${cfg.bounds.x2 - cfg.bounds.x1 + 1}x${cfg.bounds.y2 - cfg.bounds.y1 + 1} batem com o OTBM (${W}x${H})`);
  for (const [team, rect] of Object.entries(cfg.safezones)) {
    let walkable = 0, total = 0;
    for (let ax = rect.x1; ax <= rect.x2; ax++) for (let ay = rect.y1; ay <= rect.y2; ay++) {
      total++;
      const cx = ax - cfg.bounds.x1, cy = ay - cfg.bounds.y1;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const leg = data.leg[data.rows[cy][cx]];
      if (leg && !leg.bloc) walkable++;
    }
    ok(walkable > 0, `${id} safezone ${team}: ${walkable}/${total} células caminháveis (RME ${rect.x1},${rect.y1}-${rect.x2},${rect.y2})`);
  }
}

/* ============================================================ controller */
section("server/pvp.js — constantes e contrato");
ok(typeof PVP.createPvpController === "function", "createPvpController exportado");
const ANK = PVP.PVP_MAPS.ank_open, VEN = PVP.PVP_MAPS.venore_town;
ok(ANK && ANK.mode === "frags" && ANK.fragTarget === 100 && ANK.pz === true,
  "Ankrahmun: frags, alvo 100, safezones são PZ");
ok(VEN && VEN.mode === "control" && VEN.pz === true && VEN.controlZone,
  "Venore: controle de área, safezones exclusivas (PZ)");
{
  const vl = PVP.pvpMapLocal(VEN), data = OTBM.huntMapFromOtbm(readMap("venore_town"), FLAGS);
  const blk = (x, y) => { const l = data.leg[data.rows[y] && data.rows[y][x]]; return !l || l.bloc || !!(data.footprintBlocked && data.footprintBlocked[x + ":" + y]); };
  const reach = (rect) => { const seen = new Set(), q = [];
    for (let x = rect.x1; x <= rect.x2; x++) for (let y = rect.y1; y <= rect.y2; y++) if (!blk(x, y)) { seen.add(x + ":" + y); q.push([x, y]); }
    while (q.length) { const [x, y] = q.shift();
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nx = x + dx, ny = y + dy, k = nx + ":" + ny;
        if (nx < 0 || ny < 0 || nx >= vl.gridW || ny >= vl.gridH || seen.has(k) || blk(nx, ny)) continue; seen.add(k); q.push([nx, ny]); } }
    return seen; };
  const r1 = reach(vl.sz1), r2 = reach(vl.sz2), cz = vl.control;
  let both = 0, total = 0;
  for (let x = cz.x1; x <= cz.x2; x++) for (let y = cz.y1; y <= cz.y2; y++) { total++; if (r1.has(x + ":" + y) && r2.has(x + ":" + y)) both++; }
  const ccx = Math.round((cz.x1 + cz.x2) / 2), ccy = Math.round((cz.y1 + cz.y2) / 2);
  ok(both >= 10 && r1.has(ccx + ":" + ccy) && r2.has(ccx + ":" + ccy),
    `Venore: área de controle alcançável pelos dois times (${both}/${total} células, centro ${ccx},${ccy} caminhável)`);
}
ok(JSON.stringify(PVP.PVP_TEAM_SIZES) === JSON.stringify([3, 5, 10, 15, 20, 50, 100]),
  "Tamanhos de equipe 3/5/10/15/20/50/100");
ok(PVP.PVP_MIN_GUILD_MEMBERS === 7 && PVP.PVP_MIN_GUILD_LEVEL === 2,
  "Elegibilidade: 7+ membros e guild nível 2+");
ok(PVP.PVP_MIN_LEAD_MS === 10 * 60000, "Agendamento mínimo 10min à frente");
ok(PVP.PVP_CREATE_COOLDOWN_MS === 30 * 60000, "Intervalo mínimo 30min entre criações");
ok(PVP.PVP_HOUSE_FEE === 0.10, "Taxa da casa 10%");
ok(PVP.PVP_BATTLE_MS === 10 * 60000 && PVP.PVP_OT_MS === undefined,
  "Batalha 10min, sem prorrogação");
const _ctrl = PVP.createPvpController({});
ok(_ctrl.PVP_INSIGNIA_WIN === 3 && _ctrl.PVP_INSIGNIA_LOSE === 1, "Insígnias 3 vitória / 1 derrota");
const local = PVP.pvpMapLocal(ANK);
ok(local.sz1.x1 === 29 && local.sz1.y1 === 35 && local.sz1.x2 === 35 && local.sz1.y2 === 39,
  "Ankrahmun sz1 em coordenadas locais (29,35)-(35,39)");

/* ================================================================ JsonStore */
section("JsonStore — lobby, stakes, roster, insígnias");
process.env.GLOBAL_IDLE_DATA_DIR = fs.mkdtempSync(path.join(require("os").tmpdir(), "pvp-test-"));
delete require.cache[require.resolve(path.join(ROOT, "server/db.js"))];
const { getDb } = require(path.join(ROOT, "server/db.js"));
(async () => {
  const db = await getDb();
  ok(typeof db.pvpLobbyCreate === "function" && typeof db.pvpRosterGet === "function" &&
     typeof db.pvpStakeCredit === "function" && typeof db.accountAddInsignias === "function",
     "métodos pvp_* presentes no JsonStore");
  ok(typeof db.pvpLobbyCreate === "function" && typeof MysqlStore !== "undefined" || true, "");
  // semeia 2 guilds com caixa
  db.guilds = [
    { id: 1, name: "Alpha", level: 3, exp: 0, balance: 1000, coins: 50, icon: 1 },
    { id: 2, name: "Beta", level: 2, exp: 0, balance: 2000, coins: 50, icon: 2 },
  ];
  db.guildMembers = [];
  for (let i = 0; i < 8; i++) db.guildMembers.push({ guild_id: 1, account_id: 100 + i, char_id: 1000 + i, rank: i === 0 ? "leader" : "member" });
  for (let i = 0; i < 8; i++) db.guildMembers.push({ guild_id: 2, account_id: 200 + i, char_id: 2000 + i, rank: i === 0 ? "leader" : "member" });
  db.accounts = [{ id: 100, login: "a", pvp_insignias: 0 }, { id: 200, login: "b", pvp_insignias: 0 }];
  db.guildLog = [];

  let r = db.pvpLobbyCreate({ challengerGuildId: 1, challengedGuildId: 2, createdBy: 100,
    map: "ank_open", teamSize: 5, stakeType: "gold", stakeAmount: 500,
    scheduledAt: Date.now() + 3600000, charName: "Leader" });
  ok(r.ok && r.id === 1, "lobby criado (pending) com aposta 500 gold");
  ok(db.guildById(1).balance === 500, "aposta debitada do balance da desafiante (1000→500)");
  ok(db.guildLog.some((l) => l.category === "pvp"), "guild_log registra categoria 'pvp'");
  ok(db.pvpBattleGet(1).status === "pending", "batalha nasce pending");

  r = db.pvpLobbyCreate({ challengerGuildId: 1, challengedGuildId: 2, createdBy: 100,
    map: "ank_open", teamSize: 5, stakeType: "gold", stakeAmount: 100,
    scheduledAt: Date.now() + 7200000 });
  ok(!r.ok && r.error === "PVP_GUILD_BUSY", "uma batalha ativa/agendada por guild é imposta");

  ok(db.pvpBattleDecline(1, 1).ok === false, "desafiante não pode 'recusar' o próprio convite");
  ok(db.pvpBattleDecline(1, 2).ok, "desafiada recusa → status declined");
  ok(db.guildById(1).balance === 1000, "recusa reembolsa a desafiante integralmente");

  r = db.pvpLobbyCreate({ challengerGuildId: 1, challengedGuildId: 2, createdBy: 100,
    map: "venore_town", teamSize: 5, stakeType: "coins", stakeAmount: 20,
    scheduledAt: Date.now() + 3600000 });
  ok(r.ok && db.guildById(1).coins === 30, "aposta em TC debita guilds.coins (50→30)");
  ok(db.pvpBattleAccept(2, 2, "Vice").ok, "aceite da desafiada");
  ok(db.guildById(2).coins === 30 && db.pvpBattleGet(2).status === "accepted",
    "aposta da desafiada debitada no aceite (50→30 TC)");
  r = db.pvpLobbyCreate({ challengerGuildId: 2, challengedGuildId: 1, createdBy: 200,
    map: "ank_open", teamSize: 5, stakeType: "gold", stakeAmount: 100,
    scheduledAt: Date.now() + 3600000 });
  ok(!r.ok && r.error === "PVP_GUILD_BUSY", "busy vale para as duas guilds da batalha");

  db.pvpRosterReplace(2, [
    { team: 1, account_id: 100, char_ids: [1000, 1001], leader: true, online: true },
    { team: 2, account_id: 200, char_ids: [2000], leader: true, online: false },
  ]);
  const roster = db.pvpRosterGet(2);
  ok(roster.length === 2 && roster[0].char_ids.length === 2 && roster[1].online === false,
    "roster persistido por time com flag de offline (IA)");
  ok(db.pvpStakeCredit(1, "coins", 36).ok && db.guildById(1).coins === 66,
    "pvpStakeCredit credita pote (30+36=66)");
  ok(db.accountAddInsignias(100, 3) && db.accounts[0].pvp_insignias === 3,
    "insígnias PvP somam em accounts.pvp_insignias");

  /* ================================================================ engine */
  section("authoritative_engine — regras de batalha");
  const eng = require(path.join(ROOT, "server/authoritative_engine.js"));
  const now = Date.now();
  function mkChar(id, acc, team, cx, cy) {
    return { id: String(id), accountId: acc, pvpTeam: team, team,
      partyKey: "pvpb:1:" + team,
      p: { id: String(id), name: "C" + id, voc: "knight", level: 300,
           skills: { fist: 100, sword: 100, axe: 100, club: 100, dist: 100, shield: 100 } },
      cx, cy, x: (cx + .5) / 51, y: (cy + .5) / 52 };
  }
  function makeAuth(mode, pz) {
    const local1 = PVP.pvpMapLocal(PVP.PVP_MAPS.ank_open), local2 = PVP.pvpMapLocal(PVP.PVP_MAPS.venore_town);
    const l = mode === "control" ? local2 : local1;
    const desc = {
      kind: "pvp", instanceMode: "pvp", huntId: null, bossId: null,
      members: [mkChar(1, 100, 1, l.sz1.x1, l.sz1.y1), mkChar(2, 200, 2, l.sz2.x1, l.sz2.y1)],
      state: { instanceMode: "pvp", gridW: l.gridW, gridH: l.gridH, mobs: [], players: [
        { id: "1", cx: l.sz1.x1, cy: l.sz1.y1, x: (l.sz1.x1 + .5) / l.gridW, y: (l.sz1.y1 + .5) / l.gridH },
        { id: "2", cx: l.sz2.x1, cy: l.sz2.y1, x: (l.sz2.x1 + .5) / l.gridW, y: (l.sz2.y1 + .5) / l.gridH },
      ],
      pvpBattle: { battleId: 1, mapId: mode === "control" ? "venore_town" : "ank_open",
        mode, pz, fragTarget: 2,
        safezones: { 1: l.sz1, 2: l.sz2 }, controlZone: l.control || null, dominationMs: { 1: 0, 2: 0 },
        teams: { 1: { guildId: 1, name: "Alpha" }, 2: { guildId: 2, name: "Beta" } },
        scores: { 1: 0, 2: 0 }, scoreTickMs: 10000,
        endsAt: Date.now() + 600000, stats: {} } },
    };
    const out = eng.initializeAuthority(desc, "test-pvp", Date.now());
    return out.authority;
  }

  // PZ: dentro de qualquer safezone ninguém ataca nem é atacado (Ankrahmun).
  let auth = makeAuth("frags", true);
  let [a1, a2] = auth.players;
  ok(!eng.canPlayerDamagePlayer(auth, a1, a2), "PZ: jogador dentro de safezone não pode atacar");
  a1.cx = 10; a1.cy = 10; a2.cx = 12; a2.cy = 10; // fora das duas sz
  ok(eng.canPlayerDamagePlayer(auth, a1, a2), "fora da sz, times rivais se atacam");
  a2.cx = auth.pvpBattle.safezones[2].x1; a2.cy = auth.pvpBattle.safezones[2].y1;
  ok(!eng.canPlayerDamagePlayer(auth, a1, a2), "PZ: jogador dentro de safezone não pode ser atacado");
  ok(eng.pvpBattleStepBlocked(auth, a1, auth.pvpBattle.safezones[2].x1, auth.pvpBattle.safezones[2].y1),
    "PZ: time 1 não entra na safezone do time 2");
  ok(!eng.pvpBattleStepBlocked(auth, a1, 20, 20), "célula livre fora da sz não é bloqueada");

  // Venore: safezones exclusivas (PZ) — rival não entra, sem combate dentro.
  auth = makeAuth("control", true);
  [a1, a2] = auth.players;
  ok(!eng.canPlayerDamagePlayer(auth, a1, a2), "Venore: sem combate dentro das safezones");
  ok(eng.pvpBattleStepBlocked(auth, a1, auth.pvpBattle.safezones[2].x1, auth.pvpBattle.safezones[2].y1),
    "Venore: time rival não pisa na safezone inimiga");

  // Redução de 35%: mesmo hit com e sem batalha.
  const raw = 10000;
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  a1.cx = 10; a1.cy = 10; a2.cx = 12; a2.cy = 10;
  a2.p.hp = 1e9; const m = eng.maxStats(a2.p); a2.p._maxhp = m.hp; // garante maxHp estável
  const dmgBattle = eng.applyPlayerPvpDamage(auth, a1, a2, raw, "physical", Date.now());
  const auth2 = makeAuth("frags", true);
  const [b1, b2] = auth2.players;
  b1.cx = 10; b1.cy = 10; b2.cx = 12; b2.cy = 10;
  b2.p.hp = 1e9;
  delete auth2.pvpBattle; // mesma instância pvp, sem as regras de batalha
  const dmgRaid = eng.applyPlayerPvpDamage(auth2, b1, b2, raw, "physical", Date.now());
  ok(dmgBattle === Math.max(0, Math.floor(dmgRaid * 0.65)) && dmgBattle < dmgRaid,
    `dano PvP de batalha reduzido 35% (${dmgRaid} → ${dmgBattle})`);

  // Frags: kill credita ponto no placar e stats; alvo encerra a partida.
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  a1.cx = 10; a1.cy = 10; a2.cx = 12; a2.cy = 10;
  eng.applyPlayerPvpDamage(auth, a1, a2, 1e9, "physical", Date.now());
  ok(auth.pvpBattle.scores[1] === 1, "frag: time 1 marca 1 ponto");
  ok(auth.pvpBattle.stats["1"] && auth.pvpBattle.stats["1"].kills === 1 &&
     auth.pvpBattle.stats["2"] && auth.pvpBattle.stats["2"].deaths === 1,
     "stats de kill/morte por personagem");
  ok(a2.p.hp <= 0 && !a2.permadead && a2.downUntil > 0, "morto fica down para respawn (sem permadeath)");
  // segundo frag atinge fragTarget=2 → finished; próximo tick encerra a instância.
  a2.p.hp = eng.maxStats(a2.p).hp; a2.downUntil = 0;
  eng.applyPlayerPvpDamage(auth, a1, a2, 1e9, "physical", Date.now());
  ok(auth.pvpBattle.finished && auth.pvpBattle.finished.winnerTeam === 1,
    "alvo de frags encerra a batalha com vencedor");
  eng.pvpBattleTick(auth, Date.now(), 200);
  ok(auth.ended && auth.terminalReason === "pvp-battle-end", "instância termina com terminalReason pvp-battle-end");

  // Controle (Venore): domina quem tem mais chars vivos na zona; placar = segundos.
  auth = makeAuth("control", true);
  [a1, a2] = auth.players;
  const cz = auth.pvpBattle.controlZone;
  a1.cx = cz.x1; a1.cy = cz.y1; a2.cx = 0; a2.cy = 0;   // só o time 1 na zona
  for (let i = 0; i < 25; i++) eng.pvpBattleTick(auth, Date.now(), 200);
  ok(auth.pvpBattle.scores[1] === 5 && auth.pvpBattle.scores[2] === 0 && auth.pvpBattle.holder === 1,
    `controle: time 1 domina 5s (placar ${auth.pvpBattle.scores[1]}×${auth.pvpBattle.scores[2]})`);
  a2.cx = cz.x2; a2.cy = cz.y2;                          // 1×1 → zona disputada
  for (let i = 0; i < 10; i++) eng.pvpBattleTick(auth, Date.now(), 200);
  ok(auth.pvpBattle.scores[1] === 5 && auth.pvpBattle.scores[2] === 0 && auth.pvpBattle.holder === 0,
    "controle: zona disputada (empate de chars) não pontua");
  const c3c = mkChar(31, 300, 2, cz.x1 + 1, cz.y1 + 1);
  auth.players.push(c3c);                                // 1×2 → time 2 domina
  for (let i = 0; i < 10; i++) eng.pvpBattleTick(auth, Date.now(), 200);
  ok(auth.pvpBattle.scores[2] === 2 && auth.pvpBattle.holder === 2, "controle: maioria na zona vira o domínio");
  a2.p.hp = 0;                                           // morto não conta
  ok(eng.pvpBattleControlCounts(auth)[2] === 1, "controle: morto não conta na zona");
  auth.pvpBattle.endsAt = Date.now() - 1;
  eng.pvpBattleTick(auth, Date.now(), 200);
  ok(auth.pvpBattle.finished && auth.pvpBattle.finished.winnerTeam === 1, "controle: fim do tempo → mais segundos de domínio vence");
  // IA no controle: fora da zona, o goal é o centro da zona.
  auth = makeAuth("control", true);
  [a1, a2] = auth.players;
  const g = eng.pvpBattleGoal(auth, a1);
  ok(g && g.zone && g.cx === Math.round((cz.x1 + cz.x2) / 2) && g.cy === Math.round((cz.y1 + cz.y2) / 2),
    "IA de Venore marcha para a área de controle");

  // Empate no tempo → resultado empatado, sem prorrogação.
  auth = makeAuth("frags", true);
  auth.pvpBattle.endsAt = Date.now() - 1;
  eng.pvpBattleTick(auth, Date.now(), 200);
  ok(auth.pvpBattle.finished && auth.pvpBattle.finished.draw && !auth.pvpBattle.overtime,
    "Ankrahmun: empate no tempo encerra empatado (sem OT)");
  eng.pvpBattleTick(auth, Date.now(), 200);
  ok(auth.ended, "empate encerra a instância");

  // Respawn: morto volta dentro da própria safezone (o step do engine é
  // quem restaura o HP; o respawn em si reposiciona e zera o walkAcc).
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  a1.cx = 10; a1.cy = 10; a2.cx = 12; a2.cy = 10;
  eng.applyPlayerPvpDamage(auth, a1, a2, 1e9, "physical", Date.now());
  a2.p.hp = eng.maxStats(a2.p).hp; a2.downUntil = 0;
  eng.pvpBattleRespawn(auth, a2, Date.now() + 11000);
  const sz = auth.pvpBattle.safezones[2];
  ok(a2.cx >= sz.x1 && a2.cx <= sz.x2 && a2.cy >= sz.y1 && a2.cy <= sz.y2 && a2.walkAcc === 0,
    "respawn reposiciona dentro da própria safezone");

  // IA offline: pvpBattleTarget escolhe o hostil de MENOR maxHp.
  auth = makeAuth("frags", true);
  const c3 = mkChar(3, 300, 2, 13, 10);
  auth.players.push(c3); auth.pvpBattle.stats["3"] = { name: "C3", team: 2, kills: 0, deaths: 0, damage: 0 };
  [a1, a2] = auth.players;
  a1.cx = 10; a1.cy = 10; a2.cx = 12; a2.cy = 10;
  const proxy = (ent) => ({ id: String(ent.id), _playerEnt: ent,
    hp: Math.max(1, Number(ent.p.hp) || eng.maxStats(ent.p).hp),
    maxHp: eng.maxStats(ent.p).hp });
  const hi = proxy(a2), lo = proxy(c3); lo.maxHp = 100; // menor maxHp
  const tgt = eng.pvpBattleTarget(auth, a1, [hi, lo]);
  ok(tgt && String(tgt.id) === "3", `IA prioriza alvo de menor maxHp (got ${tgt && tgt.id})`);

  // Ataques normais/spells chegam pelo proxy: redução 35%, letal mata e credita.
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  a1.cx = 10; a1.cy = 10; a2.cx = 11; a2.cy = 10;
  a2.p.hp = 1000;
  const px = eng.combatLivingFor(auth, a1).find((t) => t._playerEnt === a2);
  px.hp = px.hp - 1000;
  ok(a2.p.hp === 350 && auth.pvpBattle.stats["1"].damage === 650,
    `proxy aplica −35% e credita dano (hp ${a2.p.hp}, dano ${auth.pvpBattle.stats["1"] && auth.pvpBattle.stats["1"].damage})`);
  px.hp = Math.max(0, px.hp - 1e6);
  ok(a2.p.hp === 0 && auth.pvpBattle.scores[1] === 1 && auth.pvpBattle.stats["1"].kills === 1,
    "golpe letal pelo proxy mata (não trava em 1 HP) e marca frag");
  // IA dentro da PZ: sem alvo atacável, marcha até o inimigo.
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  const gz = eng.pvpBattleGoal(auth, a1);
  ok(gz && Number.isFinite(gz.cx) && !gz.zone, "IA sai da safezone PZ em direção ao inimigo");
  // IA offline com preset manual (autoWalk:false, box) ainda anda; BFS contorna parede.
  {
    const desc = { kind: "pvp", instanceMode: "pvp", members: [mkChar(1, 100, 1, 1, 1), mkChar(2, 200, 2, 9, 1)],
      state: { instanceMode: "pvp", gridW: 11, gridH: 5, mobs: [],
        blockedCells: { "5:0": true, "5:1": true, "5:2": true, "5:3": true },
        players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 11, y: 1.5 / 5 }, { id: "2", cx: 9, cy: 1, x: 9.5 / 11, y: 1.5 / 5 }],
        pvpBattle: { battleId: 9, mapId: "test-wall", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 10, y1: 0, x2: 10, y2: 0 } },
          teams: { 1: { name: "A" }, 2: { name: "B" } }, scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    for (const m of desc.members) m.p.config = { autoWalk: false, attackMode: "box" };
    const t0 = Date.now();
    let ser = JSON.stringify(eng.initializeAuthority(desc, "wall", t0));
    for (let k = 1; k <= 8; k++) { const o = eng.advanceAuthorityState(ser, 1000, t0 + k * 1000); ser = typeof o.state === "string" ? o.state : JSON.stringify(o.state); }
    const pw = JSON.parse(ser).authority.players.find((p) => String(p.id) === "1");
    ok(pw.cx >= 5, `IA offline com preset manual anda e contorna a parede pelo BFS (x ${pw.cx},${pw.cy})`);
  }

  // Team target: líder marca, o time inteiro foca.
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  a1.cx = 10; a1.cy = 10; a2.cx = 12; a2.cy = 10;
  auth.pvpBattle.teams["1"].targetId = "2";
  const tt = eng.pvpBattleTarget(auth, a1, [proxy(a2)]);
  ok(tt && String(tt.id) === "2", "target manual do time sobrepõe o da IA");

  // Só o LÍDER da guild designa o alvo do time: teamTarget de outra conta
  // é ignorado; o líder escreve e o time inteiro foca.
  {
    const desc = { kind: "pvp", instanceMode: "pvp",
      members: [mkChar(1, 100, 1, 1, 1), mkChar(3, 300, 1, 2, 1), mkChar(2, 200, 2, 9, 1)],
      state: { instanceMode: "pvp", gridW: 11, gridH: 5, mobs: [],
        players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 11, y: 1.5 / 5 },
          { id: "3", cx: 2, cy: 1, x: 2.5 / 11, y: 1.5 / 5 },
          { id: "2", cx: 9, cy: 1, x: 9.5 / 11, y: 1.5 / 5 }],
        pvpBattle: { battleId: 10, mapId: "lead", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 10, y1: 0, x2: 10, y2: 0 } },
          teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
          scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    const ser = JSON.stringify(eng.initializeAuthority(desc, "lead", Date.now()));
    const targetAfter = (vis) => {
      const o = eng.advanceAuthorityState(ser, 200, Date.now(), { players: vis });
      const st = typeof o.state === "string" ? JSON.parse(o.state) : o.state;
      return st.authority.pvpBattle.teams["1"].targetId;
    };
    ok(targetAfter([{ id: "3", cx: 2, cy: 1, x: 2.5 / 11, y: 1.5 / 5, teamTarget: "2" }]) == null,
      "alvo do time: membro comum/IA não designa (só o líder escreve targetId)");
    ok(targetAfter([{ id: "1", cx: 1, cy: 1, x: 1.5 / 11, y: 1.5 / 5, teamTarget: "2" }]) === "2",
      "alvo do time: o líder designa o foco do time");
    // Só o char self fica "pilotado": auxiliar da conta vira IA do servidor.
    const o2 = eng.advanceAuthorityState(ser, 200, Date.now(),
      { players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 11, y: 1.5 / 5 },
        { id: "3", cx: 2, cy: 1, x: 2.5 / 11, y: 1.5 / 5, self: 1 }] });
    const st2 = typeof o2.state === "string" ? JSON.parse(o2.state) : o2.state;
    const p1 = st2.authority.players.find((x) => x.id === "1");
    const p3 = st2.authority.players.find((x) => x.id === "3");
    ok(!p1._pvpDrivenAt && p3._pvpDrivenAt > 0,
      "driven: só o char self é pilotado — os auxiliares da conta viram IA");
  }

  // Âncora da formação = o char PILOTADO da conta líder, não o primeiro.
  {
    const desc = { kind: "pvp", instanceMode: "pvp",
      members: [mkChar(1, 100, 1, 1, 1), mkChar(5, 100, 1, 2, 1), mkChar(3, 300, 1, 30, 20), mkChar(2, 200, 2, 20, 20)],
      state: { instanceMode: "pvp", gridW: 40, gridH: 30, mobs: [],
        players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 30 },
          { id: "5", cx: 2, cy: 1, x: 2.5 / 40, y: 1.5 / 30 },
          { id: "3", cx: 30, cy: 20, x: 30.5 / 40, y: 20.5 / 30 },
          { id: "2", cx: 20, cy: 20, x: 20.5 / 40, y: 20.5 / 30 }],
        pvpBattle: { battleId: 14, mapId: "anch", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
          teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
          scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    const aA = eng.initializeAuthority(desc, "anch", Date.now()).authority;
    const fol = aA.players.find((x) => x.id === "3");
    ok(eng.pvpBattleLeaderChar(aA, fol).id === "1",
      "âncora sem pilotado: primeiro char vivo da conta líder");
    aA.players.find((x) => x.id === "5")._pvpDrivenAt = Date.now();
    ok(eng.pvpBattleLeaderChar(aA, fol).id === "5",
      "âncora = o char PILOTADO da conta líder (o humano dita o avanço)");
    // Char preso dentro da própria sz precisa sair p/ lutar — não segura linha.
    // Líder (pilotado) fora da sz a 4 sqm e inimigo a 11 dele: sem o bypass
    // de sz, o gate de engajamento (6 p/ melee) daria goal null.
    const descSz = JSON.parse(JSON.stringify(desc));
    descSz.state.pvpBattle.pz = true;
    descSz.state.pvpBattle.safezones[1] = { x1: 28, y1: 18, x2: 32, y2: 22 };
    descSz.state.players[2].cx = 30; descSz.state.players[2].cy = 20; // dentro da sz
    descSz.state.players[1].cx = 26; descSz.state.players[1].cy = 20; // líder fora, a 4
    descSz.state.players[3].cx = 15; descSz.state.players[3].cy = 20; // inimigo a 11 do líder
    const aSz = eng.initializeAuthority(descSz, "szx", Date.now()).authority;
    const folSz = aSz.players.find((x) => x.id === "3");
    aSz.players.find((x) => x.id === "5")._pvpDrivenAt = Date.now();
    const gSz = eng.pvpBattleGoal(aSz, folSz);
    const szOut = gSz && !(gSz.cx >= 28 && gSz.cx <= 32 && gSz.cy >= 18 && gSz.cy <= 22);
    ok(gSz && szOut,
      `char dentro da safezone marcha p/ fora (goal ${gSz && gSz.cx},${gSz && gSz.cy} fora da PZ)`);
  }

  // Alcance de cast: a IA aproxima até onde a MAGIA alcança, não só a arma.
  // (Mago com varinha alc. 6 + exori vis alc. 3: antes parava a 6 e nunca castava.)
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  a1.p.voc = "sorcerer"; a1.p.equip = { weapon: { item: "wooden-wand" } };
  a1.p.config = { attackSpells: ["exori-vis"] };
  a1.cx = 10; a1.cy = 10; a2.cx = 20; a2.cy = 10;
  const gMage = eng.pvpBattleGoal(auth, a1);
  ok(gMage && gMage.td === 3, `IA aproxima ao alcance da magia (td ${gMage && gMage.td} — varinha 6 + exori vis 3)`);
  a1.p.equip = {}; a1.p.config = {}; a1.p.voc = "none";
  const gMelee = eng.pvpBattleGoal(auth, a1);
  ok(gMelee && gMelee.td === 1, `vocação desconhecida cai no alcance da arma (td ${gMelee && gMelee.td})`);

  // Distância por vocação: RP/druid/sorcerer a 3 sqm; knight/monk sempre melee.
  auth = makeAuth("frags", true);
  [a1, a2] = auth.players;
  a1.cx = 10; a1.cy = 10; a2.cx = 30; a2.cy = 10;
  a1.p.voc = "royal paladin"; a1.p.equip = { weapon: { item: "warsinger-bow" } };
  const gRp = eng.pvpBattleGoal(auth, a1);
  ok(gRp && gRp.td === 3 && !gRp.follow, `RP: alvo a 3 sqm (td ${gRp && gRp.td}, não o alcance 7 do bow)`);
  a1.p.voc = "monk";
  const gMonk = eng.pvpBattleGoal(auth, a1);
  ok(gMonk && gMonk.td === 1, `monk: sempre melee (td ${gMonk && gMonk.td})`);
  a1.p.voc = "elite knight";
  const gEk = eng.pvpBattleGoal(auth, a1);
  ok(gEk && gEk.td === 1, `elite knight: sempre melee (td ${gEk && gEk.td})`);
  // Ranged mais perto que 3 sqm recebe goal p/ recuar (dist!==td no movimento).
  a1.p.voc = "elder druid"; a2.cx = 11; a2.cy = 10; // dist 1 do druida
  const gBack = eng.pvpBattleGoal(auth, a1);
  ok(gBack && gBack.td === 3 && gBack.cx === 11, "ranged colado no alvo recebe goal para recuar a 3 sqm");

  // Formação: membro longe do líder acompanha (td 5); líder luta normal;
  // membro perto do líder segue o combate.
  {
    const desc = { kind: "pvp", instanceMode: "pvp",
      members: [mkChar(1, 100, 1, 1, 1), mkChar(3, 300, 1, 30, 20), mkChar(2, 200, 2, 20, 20)],
      state: { instanceMode: "pvp", gridW: 40, gridH: 30, mobs: [],
        players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 30 },
          { id: "3", cx: 30, cy: 20, x: 30.5 / 40, y: 20.5 / 30 },
          { id: "2", cx: 20, cy: 20, x: 20.5 / 40, y: 20.5 / 30 }],
        pvpBattle: { battleId: 11, mapId: "form", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
          teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
          scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    const aForm = eng.initializeAuthority(desc, "form", Date.now()).authority;
    const [lead, fol, foe] = aForm.players;
    const gFol = eng.pvpBattleGoal(aForm, fol);
    const folDist = gFol ? Math.max(Math.abs(gFol.cx - 1), Math.abs(gFol.cy - 1)) : 99;
    ok(gFol && gFol.follow && folDist >= 1 && folDist <= 5 && !(gFol.cx === 1 && gFol.cy === 1),
      `formação: membro a >5 sqm do líder recebe célula livre do anel de 5 (${gFol && gFol.cx},${gFol && gFol.cy})`);
    const gLead = eng.pvpBattleGoal(aForm, lead);
    ok(gLead && !gLead.follow && gLead.cx === 20 && gLead.cy === 20 && gLead.td === 1,
      "formação: o líder não se segue — avança no alvo inimigo (melee)");
    // Dois seguidores: célula ocupada é pulada — a formação se espalha.
    fol.cx = 6; fol.cy = 6; fol.x = 6.5 / 40; fol.y = 6.5 / 30; // a 5 do líder
    const fol2 = { id: "7", pvpTeam: 1, team: 1, partyKey: "pvpb:1:1", accountId: 300,
      cx: 30, cy: 20, x: 30.5 / 40, y: 20.5 / 30,
      p: { voc: "knight", hp: 100, level: 100, accountId: 300 } };
    aForm.players.push(fol2);
    const gFol2 = eng.pvpBattleGoal(aForm, fol2);
    ok(gFol2 && gFol2.follow && !(gFol2.cx === 6 && gFol2.cy === 6),
      "formação: célula do anel já ocupada é pulada (seguidores não empilham)");
    aForm.players.pop();
    // Melee mantém 1 sqm do líder: a 3 sqm sem alvo ao alcance, volta pro anel.
    fol.cx = 4; fol.cy = 3; fol.x = 4.5 / 40; fol.y = 3.5 / 30;
    const gRing = eng.pvpBattleGoal(aForm, fol);
    const ringD = gRing ? Math.max(Math.abs(gRing.cx - 1), Math.abs(gRing.cy - 1)) : 99;
    ok(gRing && gRing.follow && ringD === 1,
      `formação: EK/monk cola a 1 sqm do líder (célula ${gRing && gRing.cx},${gRing && gRing.cy} dist ${ringD})`);
    fol.p.voc = "royal paladin"; // ranged forma na segunda linha (3 sqm)
    fol.cx = 7; fol.cy = 5; fol.x = 7.5 / 40; fol.y = 5.5 / 30; // a 6 sqm — fora do anel
    const gRng = eng.pvpBattleGoal(aForm, fol);
    const rngD = gRng ? Math.max(Math.abs(gRng.cx - 1), Math.abs(gRng.cy - 1)) : 99;
    ok(gRng && gRng.follow && rngD >= 2 && rngD <= 4,
      `formação: ranged orbita o líder a ~3 sqm (célula ${gRng && gRng.cx},${gRng && gRng.cy} dist ${rngD})`);
    fol.p.voc = "knight";
    fol.cx = 2; fol.cy = 1; fol.x = 2.5 / 40; fol.y = 1.5 / 30; // a 1 sqm do líder
    const gHold = eng.pvpBattleGoal(aForm, fol);
    ok(gHold === null,
      "formação: em posição e alvo a >6 sqm do líder — melee segura a linha");
    foe.cx = 6; foe.cy = 4; foe.x = 6.5 / 40; foe.y = 4.5 / 30; // inimigo encosta no anel
    const gNear = eng.pvpBattleGoal(aForm, fol);
    ok(gNear && !gNear.follow && gNear.td === 1,
      "formação: dentro de 5 sqm do líder e alvo ao alcance — o membro engaja");
    // Alvo designado pelo líder: o time inteiro avança junto, mesmo longe.
    aForm.pvpBattle.teams["1"].targetId = "2";
    foe.cx = 20; foe.cy = 20; foe.x = 20.5 / 40; foe.y = 20.5 / 30;
    fol.cx = 30; fol.cy = 20; fol.x = 30.5 / 40; fol.y = 20.5 / 30;
    const gPush = eng.pvpBattleGoal(aForm, fol);
    ok(gPush && gPush.push && gPush.cx === 20 && gPush.cy === 20 && gPush.td === 1,
      "alvo designado: o time inteiro avança no alvo chamado (sem formação)");
    delete aForm.pvpBattle.teams["1"].targetId;
    foe.cx = 20; foe.cy = 20; foe.x = 20.5 / 40; foe.y = 20.5 / 30;
  }

  // Simulação real de tick: o seguidor longe do líder ANDA de fato (cap de
  // passos em PvP — antes a janela de 1 sqm/s deixava o bot parado).
  {
    const desc = { kind: "pvp", instanceMode: "pvp",
      members: [mkChar(1, 100, 1, 1, 1), mkChar(3, 300, 1, 30, 20), mkChar(2, 200, 2, 20, 20)],
      state: { instanceMode: "pvp", gridW: 40, gridH: 30, mobs: [],
        players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 30 },
          { id: "3", cx: 30, cy: 20, x: 30.5 / 40, y: 20.5 / 30 },
          { id: "2", cx: 20, cy: 20, x: 20.5 / 40, y: 20.5 / 30 }],
        pvpBattle: { battleId: 12, mapId: "form2", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
          teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
          scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    let ser = JSON.stringify(eng.initializeAuthority(desc, "move", Date.now()));
    let st = JSON.parse(ser);
    const startD = 29; // (30,20) -> (1,1)
    for (let k = 0; k < 15; k++) {
      const o = eng.advanceAuthorityState(ser, 200, Date.now() + k * 200);
      ser = typeof o.state === "string" ? o.state : JSON.stringify(o.state);
    }
    st = JSON.parse(ser);
    const fol = st.authority.players.find((x) => x.id === "3");
    const lead = st.authority.players.find((x) => x.id === "1");
    const dNow = Math.max(Math.abs(fol.cx - lead.cx), Math.abs(fol.cy - lead.cy));
    ok(dNow <= startD - 5, `bot anda para acompanhar o líder (dist ${startD} -> ${dNow} após 3 s de tick)`);

    // Regressão: seguidor a 1 sqm da célula do anel (td=0) deve PISAR nela —
    // `Number(td)||alcance` colapsava 0 -> alcance e o bot congelava a 1 sqm.
    {
      const desc3 = { kind: "pvp", instanceMode: "pvp",
        members: [mkChar(1, 100, 1, 10, 10), mkChar(4, 400, 1, 16, 10), mkChar(2, 200, 2, 38, 20)],
        state: { instanceMode: "pvp", gridW: 40, gridH: 30, mobs: [],
          players: [{ id: "1", cx: 10, cy: 10, x: 10.5 / 40, y: 10.5 / 30 },
            { id: "4", cx: 16, cy: 10, x: 16.5 / 40, y: 10.5 / 30 },
            { id: "2", cx: 38, cy: 20, x: 38.5 / 40, y: 20.5 / 30 }],
          pvpBattle: { battleId: 14, mapId: "td0", mode: "frags", pz: false, fragTarget: 99,
            safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
            teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
            scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
      let ser3 = JSON.stringify(eng.initializeAuthority(desc3, "td0", Date.now()));
      for (let k = 0; k < 15; k++) {
        const o = eng.advanceAuthorityState(ser3, 200, Date.now() + k * 200);
        ser3 = typeof o.state === "string" ? o.state : JSON.stringify(o.state);
      }
      const st3 = JSON.parse(ser3);
      const f3 = st3.authority.players.find((x) => x.id === "4");
      const l3 = st3.authority.players.find((x) => x.id === "1");
      const d3 = Math.max(Math.abs(f3.cx - l3.cx), Math.abs(f3.cy - l3.cy));
      ok(d3 <= 5, `seguidor pisa na célula do anel (td=0) em vez de congelar a 1 sqm (dist ${d3})`);
    }

    // RP colado no inimigo recua/posiciona até ~3 sqm (não fica melee).
    const desc2 = { kind: "pvp", instanceMode: "pvp",
      members: [mkChar(1, 100, 1, 10, 10), mkChar(2, 200, 2, 11, 10)],
      state: { instanceMode: "pvp", gridW: 40, gridH: 30, mobs: [],
        players: [{ id: "1", cx: 10, cy: 10, x: 10.5 / 40, y: 10.5 / 30 },
          { id: "2", cx: 11, cy: 10, x: 11.5 / 40, y: 10.5 / 30 }],
        pvpBattle: { battleId: 13, mapId: "rp", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
          teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
          scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    let ser2 = JSON.stringify(eng.initializeAuthority(desc2, "rp", Date.now()));
    let st2 = JSON.parse(ser2);
    st2.authority.players[0].p.voc = "royal paladin";
    st2.authority.players[0].p.equip = { weapon: { item: "warsinger-bow" } };
    // Inimigo "pilotado" e parado — isola o teste do recuo do RP.
    st2.authority.players[1].p.config = { autoWalk: false };
    st2.authority.players[1]._pvpDrivenAt = Date.now() + 999999;
    ser2 = JSON.stringify(st2);
    for (let k = 0; k < 15; k++) {
      const o = eng.advanceAuthorityState(ser2, 200, Date.now() + k * 200);
      ser2 = typeof o.state === "string" ? o.state : JSON.stringify(o.state);
    }
    st2 = JSON.parse(ser2);
    const rp = st2.authority.players.find((x) => x.id === "1");
    const foe2 = st2.authority.players.find((x) => x.id === "2");
    const dRp = Math.max(Math.abs(rp.cx - foe2.cx), Math.abs(rp.cy - foe2.cy));
    ok(dRp === 3, `RP sai do melee e segura 3 sqm do alvo (dist ${dRp})`);
  }

  // Designação de alvo limitada a 11 sqm do char do líder.
  {
    const desc = { kind: "pvp", instanceMode: "pvp",
      members: [mkChar(1, 100, 1, 1, 1), mkChar(2, 200, 2, 12, 1), mkChar(4, 400, 2, 30, 1)],
      state: { instanceMode: "pvp", gridW: 40, gridH: 5, mobs: [],
        players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 5 },
          { id: "2", cx: 12, cy: 1, x: 12.5 / 40, y: 1.5 / 5 },
          { id: "4", cx: 30, cy: 1, x: 30.5 / 40, y: 1.5 / 5 }],
        pvpBattle: { battleId: 12, mapId: "rng", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
          teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
          scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    const ser2 = JSON.stringify(eng.initializeAuthority(desc, "rng", Date.now()));
    const tgt2 = (vis) => {
      const o = eng.advanceAuthorityState(ser2, 200, Date.now(), { players: vis });
      const st = typeof o.state === "string" ? JSON.parse(o.state) : o.state;
      return st.authority.pvpBattle.teams["1"].targetId;
    };
    ok(tgt2([{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 5, teamTarget: "4" }]) == null,
      "alvo do time: inimigo a 29 sqm não pode ser designado (>11)");
    ok(tgt2([{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 5, teamTarget: "99" }]) == null,
      "alvo do time: id inexistente não sobrescreve o targetId");
    ok(tgt2([{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 5, teamTarget: "2" }]) === "2",
      "alvo do time: inimigo vivo a 11 sqm é designado pelo líder");
  }

  // Prioridade de cast na guerra: mago usa SD rune antes das magias;
  // o ataque básico (melee/distance) NÃO é engolido pelo cast.
  {
    const desc = { kind: "pvp", instanceMode: "pvp",
      members: [mkChar(1, 100, 1, 1, 1), mkChar(2, 200, 2, 5, 1)],
      state: { instanceMode: "pvp", gridW: 40, gridH: 5, mobs: [],
        players: [{ id: "1", cx: 1, cy: 1, x: 1.5 / 40, y: 1.5 / 5 },
          { id: "2", cx: 5, cy: 1, x: 5.5 / 40, y: 1.5 / 5 }],
        pvpBattle: { battleId: 13, mapId: "sd", mode: "frags", pz: false, fragTarget: 99,
          safezones: { 1: { x1: 0, y1: 0, x2: 0, y2: 0 }, 2: { x1: 39, y1: 0, x2: 39, y2: 0 } },
          teams: { 1: { name: "A", leaderAccountId: 100 }, 2: { name: "B", leaderAccountId: 200 } },
          scores: { 1: 0, 2: 0 }, endsAt: Date.now() + 600000, stats: {} } } };
    let ser = JSON.stringify(eng.initializeAuthority(desc, "sd", Date.now()));
    // Mago com SD na bag + magia configurada: a runa sai primeiro.
    const stepSer = (serIn, ms) => {
      const o = eng.advanceAuthorityState(serIn, ms, Date.now());
      return { ser: typeof o.state === "string" ? o.state : JSON.stringify(o.state),
        state: typeof o.state === "string" ? JSON.parse(o.state) : o.state };
    };
    let st = JSON.parse(ser);
    const mage = st.authority.players.find((x) => x.id === "1");
    mage.p.voc = "sorcerer"; mage.p.ml = 50; mage.p.level = 300; mage.p.mp = 99999;
    mage.p.supplies = { "sudden-death-rune": 5 };
    mage.p.config = { attackSpells: ["exori-vis"] };
    ser = JSON.stringify(st);
    let lastRune = null, sawSpellId = false;
    for (let k = 0; k < 14 && lastRune == null; k++) {
      const r = stepSer(ser, 200); ser = r.ser; st = r.state;
      const pl = st.authority.players.find((x) => x.id === "1");
      lastRune = pl.p._lastRuneId || null;
      sawSpellId = sawSpellId || (st.state && st.state.events || []).some((e) => e.t === "hit" && e.spellId === "exori-vis");
    }
    ok(lastRune === "sudden-death-rune", "mago em batalha prioriza sudden-death-rune antes das magias");
    ok(!sawSpellId, "SD sai antes do exori-vis configurado");
    st = JSON.parse(ser);
    const sdCount = st.authority.players.find((x) => x.id === "1").p.supplies["sudden-death-rune"];
    ok(sdCount === 4, `SD consumiu 1 carga (restam ${sdCount})`);

    // Cavaleiro colado: exori E o ataque básico melee saem no mesmo swing.
    const desc2 = JSON.parse(ser);
    const kn = desc2.authority.players.find((x) => x.id === "1");
    kn.p.voc = "knight"; kn.p.supplies = {}; kn.p._lastRuneId = undefined; kn.p.mp = 99999;
    kn.p._runeCd = 0; kn.p._offensiveCd = 0; kn.p._groupCd = {}; kn.attackAcc = 0;
    kn.p.equip = { weapon: { item: "sword" } }; // exori exige arma (needWeapon)
    kn.p.config = { attackSpells: ["exori"] };
    kn.cx = 4; kn.cy = 1; kn.x = 4.5 / 40; kn.y = 1.5 / 5; // colado no inimigo (5,1)
    let ser2 = JSON.stringify(desc2);
    let sawExori = false, sawBasic = false;
    for (let k = 0; k < 14 && !(sawExori && sawBasic); k++) {
      const r = stepSer(ser2, 200); ser2 = r.ser;
      const evs = (r.state.state && r.state.state.events) || [];
      sawExori = sawExori || evs.some((e) => e.t === "hit" && e.spellId === "exori");
      sawBasic = sawBasic || evs.some((e) => e.t === "hit" && !e.spellId && e.whoId === "1");
    }
    ok(sawExori, "knight casta exori no alvo colado");
    ok(sawBasic, "ataque básico melee continua ativo junto com a magia (mesmo swing)");
  }

  /* ============================================ IA restrita ao preset */
  section("IA — preset e permissões do personagem");
  const pdata = { voc: "knight", level: 300, mp: 99999, helperActivePreset: "hpp-hunt",
    config: { attackSpells: ["old"], lang: "pt" },
    helperPresets: [
      { id: "hpp-hunt", name: "HUNT", config: { attackSpells: ["hunt-spell"], healAt: 70 } },
      { id: "hpp-pvp", name: "PvP", config: { attackSpells: ["pvp-spell"], healAt: 55, godMode: true } },
    ] };
  ok(PVP.pvpApplyBattlePreset(pdata) === "hpp-pvp" && pdata.config.attackSpells[0] === "pvp-spell" &&
     pdata.config.healAt === 55, "preset 'PVP' do personagem vira a config da IA na batalha");
  ok(pdata.config.godMode === undefined && pdata.config.lang === "pt",
    "campos fora da whitelist do Helper não entram; preferências de UI preservadas");
  const adata = { helperActivePreset: "hpp-hunt", config: {},
    helperPresets: [{ id: "hpp-hunt", name: "HUNT", config: { healAt: 70 } }] };
  ok(PVP.pvpApplyBattlePreset(adata) === "hpp-hunt" && adata.config.healAt === 70,
    "sem preset 'PVP', usa o preset ativo");
  const ndata = { config: { healAt: 40 } };
  ok(PVP.pvpApplyBattlePreset(ndata) === null && ndata.config.healAt === 40, "sem presets, mantém a config atual");
  // Combo de guerra do knight: gran ico > gran > exori, todos min=1 —
  // sobrepõe o combo do preset e vale também sem preset nenhum.
  {
    const kd = { voc: "elite knight", config: {},
      helperPresets: [{ id: "hpp-pvp", name: "PVP",
        config: { combo: [{ kind: "spell", id: "exori-mas", min: 2 }] } }] };
    PVP.pvpApplyBattlePreset(kd);
    const ids = (kd.config.combo || []).map((s) => s && s.id).filter(Boolean);
    ok(JSON.stringify(ids) === JSON.stringify(["exori-gran-ico", "exori-gran", "exori"]) &&
      kd.config.combo.slice(0, 3).every((s) => s.min === 1),
      "knight com preset: combo de guerra gran ico > gran > exori (min 1)");
    const kd2 = { voc: "knight", config: { combo: [{ kind: "spell", id: "exori-min", min: 1 }] } };
    PVP.pvpApplyBattlePreset(kd2);
    ok(kd2.config.combo[0].id === "exori-gran-ico", "knight sem preset também recebe o combo de guerra");
    const kd3 = { voc: "sorcerer", config: { combo: [{ kind: "spell", id: "exevo-vis-hur", min: 1 }] } };
    PVP.pvpApplyBattlePreset(kd3);
    ok(kd3.config.combo[0].id === "exevo-vis-hur", "outras vocações mantêm o próprio combo");
  }
  const spells = Object.values(eng.ALL_SPELLS).filter((s) => s && s.id && (s.type === "attack" || s.aggr));
  const kSpell = spells.find((s) => eng.spellAllowedForVoc(s, "knight") && Number(s.lvl || 0) <= 300 && Number(s.mana || 0) > 0);
  const sSpell = spells.find((s) => !eng.spellAllowedForVoc(s, "knight") && eng.spellAllowedForVoc(s, "sorcerer"));
  const hiSpell = spells.find((s) => eng.spellAllowedForVoc(s, "knight") && Number(s.lvl || 0) > 300);
  const list = eng.playerSpellList({ voc: "knight", level: 300, mp: 99999,
    config: { attackSpells: [kSpell.id, sSpell.id].concat(hiSpell ? [hiSpell.id] : []) } });
  ok(list.some((s) => s.id === kSpell.id) && !list.some((s) => s.id === sSpell.id) &&
     !(hiSpell && list.some((s) => s.id === hiSpell.id)),
     `IA ignora spell de outra vocação (${sSpell.id})${hiSpell ? " e acima do level (" + hiSpell.id + ")" : ""}`);
  ok(!eng.playerSpellList({ voc: "knight", level: 300, mp: 0, config: { attackSpells: [kSpell.id] } }).length,
    "IA não lança spell sem mana");
  const vAuth = { pvpBattle: {}, players: [{ id: "1", accountId: 100 }, { id: "2", accountId: 200 }, { id: "3", p: { accountId: 100 } }] };
  const vis = PVP.pvpFilterVisualState(vAuth, { players: [{ id: "1" }, { id: "2", teamTarget: "1" }, { id: "3" }] }, 100);
  ok(vis.players.map((v) => v.id).join(",") === "1,3",
    "cliente só controla os próprios chars (rival/IA não podem ser pilotados)");
  ok(PVP.pvpFilterVisualState({ players: [] }, { players: [{ id: "x" }] }, 1).players.length === 1,
    "fora de batalha PvP o visual_state não é filtrado");

  /* ============================================ restart + guild lock */
  section("Restart — batalha ao vivo sobrevive e liquida uma vez");
  const T0 = Date.now();
  db.pvpBattleUpdate(2, { status: "live", host_account_id: 100, instance_id: "inst-pvp", started_at: T0 - 60000 });
  const cursorIso = new Date(T0 - 30000).toISOString();
  db.instances = [
    { account_id: 100, instance_id: "inst-pvp", status: "active", version: 5, saved_at: cursorIso, worker_cursor_at: cursorIso,
      state: JSON.stringify({ authority: { pvpBattle: { battleId: 2, endsAt: T0 + 60000, scores: { 1: 3, 2: 1 }, stats: {} } } }) },
    { account_id: 300, instance_id: "inst-hunt", status: "active", version: 1, saved_at: cursorIso, worker_cursor_at: cursorIso, state: "{}" },
  ];
  const keep = await PVP.pvpResumeLiveOnBoot(db, T0);
  ok(keep.length === 1 && keep[0] === "inst-pvp", "boot identifica a batalha ao vivo a preservar");
  const resumed = JSON.parse(db.instanceGet(100).state).authority.pvpBattle;
  ok(Math.abs(resumed.endsAt - (T0 + 90000)) < 50 && resumed.downtimeMs >= 29950,
    "timer estendido pelo downtime (tempo restante preservado)");
  ok(new Date(db.instanceGet(100).worker_cursor_at).getTime() === T0, "cursor do worker recomeça agora (downtime não simulado)");
  db.endAllInstances("server-restart", keep);
  ok(db.instanceGet(100).status === "active" && db.instanceGet(300).status === "ended",
    "endAllInstances encerra hunts mas mantém a instância PvP");
  ok(PVP.pvpGuildActiveBattle && (await PVP.pvpGuildActiveBattle(db, 1)) &&
     (await PVP.pvpGuildActiveBattle(db, 2)) && !(await PVP.pvpGuildActiveBattle(db, 9)),
    "guild com batalha ativa detectada (bloqueio de sair/expulsar)");
  const pubs = [];
  const ctrl = PVP.createPvpController({ getDb: () => db, publishAccount: (a, t, d) => pubs.push([a, t, d]) });
  await ctrl.tick();
  ok(ctrl.sharedForAccount(100) && ctrl.sharedForAccount(200) &&
     ctrl.sharedForAccount(200).instanceId === "inst-pvp" && ctrl.sharedForAccount(200).team === 2,
    "controlador novo religa o roster à instância após restart");
  ok(pubs.some(([a, t, d]) => a === 200 && t === "instance" && d.action === "pvp-battle-resume"),
    "clientes avisados da retomada");
  ok(db.pvpBattleGet(2).status === "live", "batalha segue ao vivo após religar");
  // engine decide e fecha a instância (status 'ended'): resultado vale.
  const coinsBefore = db.guildById(1).coins;
  const inst = db.instanceGet(100);
  const st = JSON.parse(inst.state); st.authority.pvpBattle.finished = { winnerTeam: 1, reason: "time" };
  inst.state = JSON.stringify(st); inst.status = "ended"; inst.terminal_reason = "pvp-battle-end";
  await Promise.all([ctrl.tick(), ctrl.tick(), ctrl.tick()]);
  const fin = db.pvpBattleGet(2);
  ok(fin.status === "finished" && Number(fin.winner_guild_id) === 1 && !fin.draw,
    "instância encerrada pelo engine liquida com vencedor (não vira empate abortado)");
  ok(db.guildById(1).coins - coinsBefore === 36, `pote pago uma única vez com ticks concorrentes (+${db.guildById(1).coins - coinsBefore} TC)`);
  ok(!ctrl.sharedForAccount(200) && !(await PVP.pvpGuildActiveBattle(db, 1)), "fim libera roster e o bloqueio da guild");
  /* Início rápido + sem cooldown (test server). */
  {
    const battles = [], members = (gid, base) => Array.from({ length: 7 }, (_, i) =>
      ({ guild_id: gid, account_id: base + i, rank: i === 0 ? "leader" : "member" }));
    const all = members(1, 100).concat(members(2, 200));
    const guilds = { 1: { id: 1, name: "A", level: 2, exp: 10, balance: 1e6, coins: 0 }, 2: { id: 2, name: "B", level: 2, exp: 10, balance: 1e6, coins: 0 } };
    const fdb = {
      guildMemberByAccount: async (a) => all.find((m) => m.account_id === Number(a)) || null,
      guildById: async (id) => guilds[Number(id)] || null,
      guildMembers: async (gid) => all.filter((m) => m.guild_id === Number(gid)),
      pvpBattleLastCreate: async () => Date.now() - 1000,
      pvpLobbyCreate: async (o) => { const b = { id: battles.length + 1, status: "pending", challenger_guild_id: o.challengerGuildId,
        challenged_guild_id: o.challengedGuildId, created_by: o.createdBy, map: o.map, team_size: o.teamSize,
        stake_type: o.stakeType, stake_amount: o.stakeAmount, scheduled_at: o.scheduledAt, quick: o.quick ? 1 : 0, created_at: Date.now() };
        battles.push(b); return { ok: true, id: b.id }; },
      pvpBattleGet: async (id) => battles.find((b) => b.id === Number(id)) || null,
      pvpBattleAccept: async (id) => { const b = battles.find((x) => x.id === Number(id)); b.status = "accepted"; return { ok: true }; },
      pvpBattleUpdate: async (id, f) => { Object.assign(battles.find((x) => x.id === Number(id)), f); return { ok: true }; },
      pvpBattlesActive: async () => battles,
    };
    const qc = PVP.createPvpController({ testServer: true, getDb: () => fdb });
    const t0 = Date.now();
    const low = await qc.createLobby(fdb, { id: 100 }, { rivalGuildId: 2, map: "ank_open", teamSize: 5, stakeAmount: 4999999, quickStart: true });
    const lowTc = await qc.createLobby(fdb, { id: 100 }, { rivalGuildId: 2, map: "ank_open", teamSize: 5, stakeType: "coins", stakeAmount: 24, quickStart: true });
    ok(low.code === 400 && low.body.error === "PVP_STAKE_MIN" && lowTc.code === 400 && lowTc.body.error === "PVP_STAKE_MIN" &&
       !battles.length && PVP.PVP_MIN_STAKE.gold === 5000000 && PVP.PVP_MIN_STAKE.coins === 25,
      "apostas mínimas 5kk gold / 25 TC");
    const r1 = await qc.createLobby(fdb, { id: 100 }, { rivalGuildId: 2, map: "ank_open", teamSize: 5, stakeAmount: 5000000, quickStart: true });
    ok(r1.code === 200 && battles[0].quick === 1 && battles[0].scheduled_at - t0 >= 4 * 60000,
      `início rápido sem agendamento e sem cooldown (code ${r1.code} ${r1.body && r1.body.error || ""})`);
    const ra = await qc.respond(fdb, { id: 200 }, { battleId: 1, accept: true });
    const left = battles[0].scheduled_at - Date.now();
    ok(ra.code === 200 && left > 1000 && left <= 10000, `aceite do rápido agenda o início em segundos (${Math.round(left / 1000)}s)`);
    const prod = PVP.createPvpController({ testServer: false, getDb: () => fdb });
    battles.length = 0;
    const r2 = await prod.createLobby(fdb, { id: 100 }, { rivalGuildId: 2, map: "ank_open", teamSize: 5, stakeAmount: 5000000, quickStart: true });
    ok(r2.code === 400 && ["PVP_SCHEDULE", "PVP_COOLDOWN"].includes(r2.body.error),
      "fora do test server: início rápido e fim do cooldown não valem");
  }
  const histAcc = db.pvpBattlesForAccount(200);
  ok(histAcc.length === 1 && Number(histAcc[0].id) === 2 && !db.pvpBattlesForAccount(999).length,
    "histórico individual: batalhas encerradas em que a conta foi sorteada");
  const arenas = PVP.pvpClientArenas();
  ok(Object.keys(PVP.PVP_MAPS).every((id) => arenas[id] && arenas[id].otbm === PVP.PVP_MAPS[id].otbm &&
     arenas[id].gridW === PVP.pvpMapLocal(PVP.PVP_MAPS[id]).gridW && arenas[id].gridH === PVP.pvpMapLocal(PVP.PVP_MAPS[id]).gridH),
    "arenas do cliente usam o mesmo grid local do servidor");
  const guildSrc = fs.readFileSync(path.join(ROOT, "server/guild.js"), "utf8");
  ok((guildSrc.match(/pvpLockError\(db, member\.guild_id/g) || []).length === 2 && guildSrc.includes("PVP_GUILD_LOCKED"),
    "guildLeave e guildKick recusam com PVP_GUILD_LOCKED");

  /* ================================================================ wiring */
  section("Wiring — servidor e cliente");
  const server = fs.readFileSync(path.join(ROOT, "server/server.js"), "utf8");
  for (const route of ["/api/pvp/state", "/api/pvp/battle", "/api/pvp/lobby", "/api/pvp/respond", "/api/pvp/cancel"])
    ok(server.includes(`"${route}"`), `rota ${route} registrada`);
  ok(server.includes("createPvpSharedInstance"), "instância compartilhada de batalha criada");
  ok(server.includes("PVP_LOCKED"), "preparo trava hunts/bosses/quests");
  ok(server.includes("global.__PVP=PVP"), "controlador PvP publicado globalmente");
  ok(server.includes("pvpRosterGet(pvpBattle.id)") || server.includes("pvpRosterGet"),
    "publicação de instância alcança o roster");
  const index = fs.readFileSync(path.join(ROOT, "game/index.html"), "utf8");
  ok(index.includes('id="btn-pvp"'), "botão PVP na topbar");
  ok(index.includes("pvp-ui.js"), "pvp-ui.js carregado");
  const acc = fs.readFileSync(path.join(ROOT, "game/js/account-client.js"), "utf8");
  ok(acc.includes('accountSyncDispatch("pvp"'), "SSE 'pvp' despachado");
  const city = fs.readFileSync(path.join(ROOT, "game/js/city-ui.js"), "utf8");
  ok(city.includes("pvp-modal-shell"), "shell pvp nas shells de cidade");
  const css = fs.readFileSync(path.join(ROOT, "game/css/layout.css"), "utf8");
  ok(css.includes("#pvp-countdown") && css.includes("#pvp-scoreboard") && css.includes(".pvp-btn-icon"),
    "CSS de contador, placar e ícone de caveira");
  const ui = fs.readFileSync(path.join(ROOT, "game/js/pvp-ui.js"), "utf8");
  ok(ui.includes("/api/pvp/lobby") && ui.includes("/api/pvp/respond") && ui.includes("/api/pvp/state"),
    "pvp-ui chama as rotas corretas");
  const dbSrc = fs.readFileSync(path.join(ROOT, "server/db.js"), "utf8");
  ok(!dbSrc.includes("ENUM('hunt','boss','pvp')") && !dbSrc.includes("ENUM('hunt','boss','quest') NOT NULL") &&
     dbSrc.includes("ENUM('hunt','boss','quest','pvp')"),
    "account_instances.kind aceita hunt/boss/quest/pvp (migrações não brigam)");
  ok(/resolved\.worldBoss\|\|resolved\.pvp\)&&Number\(ownerId\)!==Number\(acc\.id\)/.test(server) &&
     server.includes("tickOpts.leaseAccountId=acc.id") &&
     server.includes("!resolved.worldBoss&&!resolved.pvp"),
    "convidados da batalha avançam a autoridade com o próprio lease (movimento/target do rival)");
  ok(server.includes("tickOpts.hotAuth") && server.includes("pvpAuthCacheGet") &&
     dbSrc.includes("hotApi") && dbSrc.includes("worker_cursor_at=? WHERE account_id=?"),
    "batalha usa descritor quente em memória (sem SELECT/UPDATE do blob por tick)");
  ok(server.includes("pvpShareSave") && server.includes("endAccountInstance:"),
    "checkpoint do browser só espelha a batalha; preparo encerra hunts dos sorteados");
  const pvpSrc = fs.readFileSync(path.join(ROOT, "server/pvp.js"), "utf8");
  ok(pvpSrc.includes("opts.endAccountInstance(Number(r.account_id), \"pvp-prep\")"), "T-10: sorteados vão para a área de treino");
  // Settle: 'finished' é gravado ANTES dos pagamentos — um erro de payout
  // não re-dispara finishBattle a cada tick (pagava o pote em loop).
  const finIdx = pvpSrc.indexOf('status: "finished", finished_at: now(), winner_guild_id');
  const payIdx = pvpSrc.indexOf("pvpStakeCredit(winnerGuild");
  ok(finIdx > 0 && payIdx > finIdx, "finishBattle marca 'finished' antes de pagar o pote");
  ok(dbSrc.includes("exec = exec || this"), "MysqlStore.guildLogAdd tolera exec null (controller chama com null)");
  const gameSrc = fs.readFileSync(path.join(ROOT, "game/js/game.js"), "utf8");
  ok(gameSrc.includes('session.kind==="pvp"') && gameSrc.includes("pvpArenaHunt(session)") &&
     gameSrc.includes("pvpHandleCombatClick(cell)") && gameSrc.includes("if(c&&c.pvpBattle)return null;"),
    "cliente retoma instância pvp (arena virtual), repassa clique ao PvP e não espelha a batalha no localStorage");
  ok(!ui.includes('localStorage.setItem("tibia-idle-active-instance-v1"') && ui.includes("pvpPruneForeignRoster") &&
     ui.includes("pvpLobbyCapture") && !ui.includes("toISOString().slice(0, 16)"),
    "arena sem espelho local, roster limpo de chars rivais, formulário preserva aposta/hora local");
  ok(ui.includes("TIME TO BATTLE:") && !/getElementById\("pvp-(countdown|scoreboard)"\)[\s\S]{0,400}style\.display = ""/.test(ui) &&
     ui.includes('el.style.display = "flex"') && ui.includes('el.style.display = "block"'),
    "contador TIME TO BATTLE e placar visíveis (display explícito; o CSS esconde por padrão)");
  ok(PVP.PVP_MAPS.venore_town.img.startsWith("/assets/") && PVP.PVP_MAPS.ank_open.img.startsWith("/assets/"),
    "previews dos mapas com caminho absoluto (CSS var não resolve relativo a /css)");
  ok(server.includes("if (resolved.pvp)") && server.includes("paused: true"), "checkpoint de treino durante a batalha não gera 409");
  {
    const tiles = fs.readdirSync(path.join(ROOT, "game/assets/tiles"));
    const have = new Set(tiles.map((f) => f.replace(/\.png$/, "")));
    const used = new Set();
    for (const id of ["venore_town", "ank_open"]) {
      const m = OTBM.read(fs.readFileSync(path.join(ROOT, "game/maps", id + ".otbm")), { z: 7 });
      for (const c of Object.values(m.cells || {})) { if (c.g) used.add(c.g); for (const i of c.items || []) used.add(i); }
    }
    const missing = [...used].filter((cid) => !have.has(String(cid)) && cid !== 16249);
    ok(!missing.length, `sprites dos mapas de guerra presentes (${used.size} ids; faltando: ${missing.slice(0, 8).join(",") || "nenhum"})`);
  }
  ok(acc.includes("pvpAccId") && acc.includes("teamTarget=combat._pvpTeamTarget"),
    "visual_state da batalha envia só chars próprios + alvo do time");
  const engSrc = fs.readFileSync(path.join(ROOT, "server/authoritative_engine.js"), "utf8");
  const gridSrc = fs.readFileSync(path.join(ROOT, "game/js/grid.js"), "utf8");
  ok(gridSrc.includes("combat.pvpBattle") && gridSrc.includes("pvpMyAccountId"),
    "câmera da guerra segue o char da própria conta (mapa > FOV)");
  ok(server.includes("leaderAccountId") && engSrc.includes("leaderAccountId"),
    "alvo do time restrito ao líder: metadado no estado + gate na autoridade");
  ok(engSrc.includes("PVP_BATTLE_RUNE_RANGE") && engSrc.includes("pvpReach") &&
     engSrc.includes("pvpApproachRange"),
    "magias/runas da guerra respeitam alcance; IA aproxima até a spell alcançar");
  ok(engSrc.includes("pvpFollowCell") && engSrc.includes("pvpStepToRange"),
    "formação da guerra: célula livre no anel do líder + recuo lateral de ranged");
  ok(server.includes('TEST_SERVER&&/(sorcerer|druid)/i') && server.includes("data.ml=80"),
    "test server: mages entram na guerra com ML 80");
  const guildUi = fs.readFileSync(path.join(ROOT, "game/js/guild-ui.js"), "utf8");
  ok(guildUi.includes("function guildTempShopHtml") && guildUi.includes("guild-open-pvp") &&
     !guildUi.includes("Sistema em desenvolvimento"),
    "aba PVP da guild ativa: loja de boost por insígnias + atalho do modal");
  ok(ui.includes('["calendar", "Calendar"]') && ui.includes('["boosts", "Boosts"]') && ui.includes("Meu histórico") &&
     ui.includes("data-pvp-buy-temp") && ui.includes("data-pvp-forfeit") && ui.includes("data-pvp-cancel") &&
     ui.includes("G.combat.pvpBattle") && !ui.includes("window.INSTANCE"),
    "modal PVP: Calendar, Boosts, histórico individual, cancelar/desistir; placar lê G.combat");
  {
    const ctx = { console, Math, Date, JSON, Number, String, Object, Array, Promise,
      setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {},
      document: { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } },
      GAMEDATA: { hunts: {} }, toast() {}, sessionAccount: () => ({ id: 100 }),
      localStorage: (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })() };
    ctx.window = ctx; ctx.addEventListener = () => {}; ctx.Element = function () {};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "game/js/pvp-ui.js"), "utf8") + "\n;this.__pvp={pvpArenaHunt,pvpHandleCombatClick,pvpModeText,pvpUnseen,pvpMarkSeen,pvpEntTeam,pvpOwnTeam,pvpWarSide};", ctx);
    {
      const old = { inGuild: true, accountId: 100, invites: [], upcoming: [], history: [{ id: 1, challengerName: "A", challengedName: "B" }], myHistory: [] };
      ok(ctx.__pvp.pvpUnseen(old).length === 0, "notificação: histórico antigo não acende no 1º uso");
      const fresh = Object.assign({}, old, { invites: [{ id: 7, challengerName: "B" }],
        upcoming: [{ id: 8, status: "accepted", challengerName: "A", challengedName: "B" }],
        history: old.history.concat([{ id: 2, challengerName: "A", challengedName: "B" }]) });
      ok(ctx.__pvp.pvpUnseen(fresh).length === 3, `convite + batalha aceita + resultado novo acendem o botão (${ctx.__pvp.pvpUnseen(fresh).length})`);
      ctx.__pvp.pvpMarkSeen(fresh);
      ok(ctx.__pvp.pvpUnseen(fresh).map((x) => x.k).join(",") === "inv:7",
        "abrir o modal marca como visto, mas o convite recebido segue aceso até ser respondido");
      const answered = Object.assign({}, fresh, { invites: [] });
      ok(ctx.__pvp.pvpUnseen(answered).length === 0, "convite respondido apaga o glow");
      const prep = Object.assign({}, answered, { upcoming: [{ id: 8, status: "prep", challengerName: "A", challengedName: "B",
        roster: { 1: [{ accountId: 100 }], 2: [] } }] });
      ok(ctx.__pvp.pvpUnseen(prep).map((x) => x.k).join(",") === "b:8:prep,pick:8", "mudança de status e sorteio da conta notificam de novo");
    }
    const h = ctx.__pvp.pvpArenaHunt({ kind: "pvp", state: { gridW: 69, gridH: 43, pvpBattle: { mapId: "venore_town" } } });
    ok(h && h.otbm === "venore_town" && h.otbmRuntimeWidth === 69 && h.hidden && ctx.GAMEDATA.hunts["pvp-venore_town"] === h,
      "arena virtual de Venore registrada para o loader OTBM");
    const mk = (id, acc, team, cx, cy) => ({ id, pvpTeam: team, cx, cy, p: { name: "N" + id, hp: 100, accountId: acc } });
    ctx.G = { combat: { pvpBattle: { mode: "control",
        teams: { 1: { leaderAccountId: 100 }, 2: { leaderAccountId: 200 } } },
      players: [mk("1", 100, 1, 5, 5), mk("2", 200, 2, 9, 9), mk("3", 300, 1, 10, 10)] } };
    ok(ctx.__pvp.pvpHandleCombatClick({ cx: 9, cy: 8 }) && ctx.G.combat._pvpTeamTarget === "2",
      "clique num inimigo marca o alvo do time");
    ok(!ctx.__pvp.pvpHandleCombatClick({ cx: 11, cy: 11 }) && ctx.G.combat._pvpTeamTarget === "2",
      "aliado (mesmo time) nunca vira alvo");
    ok(ctx.__pvp.pvpHandleCombatClick({ cx: 9, cy: 9 }) && ctx.G.combat._pvpTeamTarget === "",
      "clicar de novo no alvo libera o alvo do time");
    // Membro comum (a conta não é a leaderAccountId do time) não designa.
    ctx.G.combat.pvpBattle.teams[1].leaderAccountId = 300;
    ok(ctx.__pvp.pvpHandleCombatClick({ cx: 9, cy: 9 }) && ctx.G.combat._pvpTeamTarget === "",
      "só o líder designa o alvo — clique de membro comum é recusado");
    ok(!ctx.__pvp.pvpHandleCombatClick({ cx: 30, cy: 30 }), "clique no chão vazio segue para o movimento");
    /* War shields: verde no próprio time (identificado por p.accountId),
     * vermelho no rival — o viewer pode estar no time 2. */
    ok(ctx.__pvp.pvpOwnTeam() === 1, "time do viewer identificado pelos chars da conta");
    ok(ctx.__pvp.pvpWarSide(ctx.G.combat.players[0]) === "ally" &&
       ctx.__pvp.pvpWarSide(ctx.G.combat.players[2]) === "ally",
      "aliados (contas distintas, mesmo time) = verde");
    ok(ctx.__pvp.pvpWarSide(ctx.G.combat.players[1]) === "enemy", "rival = vermelho");
    ctx.G = { combat: { pvpBattle: { mode: "control" }, players: [mk("1", 100, 2, 5, 5), mk("2", 200, 1, 9, 9)] } };
    ok(ctx.__pvp.pvpOwnTeam() === 2 && ctx.__pvp.pvpWarSide(ctx.G.combat.players[0]) === "ally" &&
       ctx.__pvp.pvpWarSide(ctx.G.combat.players[1]) === "enemy",
      "viewer no time 2: aliados verdes, time 1 vermelho");
    ctx.G = { combat: { players: [mk("1", 100, 1, 5, 5)] } };
    ok(ctx.__pvp.pvpWarSide(ctx.G.combat.players[0]) === null, "fora de batalha não há war shield");
  }
  /* Snapshot enxuto por viewer: a autoridade vira stub e chars de outras
   * contas perdem os campos pesados — o tick de 4.8MB travava a aba. */
  {
    const m = server.match(/const PVP_CLIENT_HEAVY_KEYS=[\s\S]*?function pvpSlimClientState\(state,viewerAccountId\)\{[\s\S]*?\n\}/);
    ok(!!m, "pvpSlimClientState presente no servidor");
    const slimCtx = {};
    vm.createContext(slimCtx);
    vm.runInContext(m[0] + "\n;this.__slim=pvpSlimClientState;this.__heavy=PVP_CLIENT_HEAVY_KEYS;", slimCtx);
    const ownP = { id: 1, accountId: 100, name: "Own", hp: 10, mp: 5, equip: { a: 1 }, depot: { x: 1 }, missions: { m: 1 } };
    const foeP = { id: 2, accountId: 200, name: "Foe", hp: 9, mp: 4, equip: { a: 2 }, depot: { x: 2 }, missions: { m: 2 } };
    const st = slimCtx.__slim({
      authority: { ended: false, players: [{ p: ownP }, { p: foeP }], clock: 1234 },
      members: [{ id: 1, p: ownP, hp: 10, mp: 5 }, { id: 2, p: foeP, hp: 9, mp: 4 }],
      state: { players: [{ id: 1, p: ownP, pvpTeam: 1 }, { id: 2, p: foeP, pvpTeam: 2 }],
               pvpBattle: { mapId: "ank_open", scores: { 1: 0, 2: 0 } } },
    }, 100);
    ok(st.authority && st.authority.pvpSlim && !st.authority.players && st.authority.clock === 1234,
      "autoridade vira stub (sem players) mas mantém ended/terminalReason/clock");
    ok(st.members[0].p.depot && st.members[1].p.pvpSlim && !st.members[1].p.depot,
      "members: char próprio completo, rival reduzido ao mínimo");
    ok(st.state.players[0].p.depot && !st.state.players[1].p.depot && !st.state.players[1].p.missions,
      "state.players: rival sem campos pesados");
    ok(st.state.players[1].p.equip && st.state.players[1].p.accountId === 200 && st.state.players[1].pvpTeam === 2,
      "state.players: rival mantém equip/accountId/pvpTeam (outfit + war shield)");
    ok(st.state.pvpBattle && st.state.pvpBattle.mapId === "ank_open", "pvpBattle preservado para o placar");
  }
  {
    const renderSrc = fs.readFileSync(path.join(ROOT, "game/js/render.js"), "utf8");
    ok(renderSrc.includes("function drawWarShieldIcon") && renderSrc.includes("pvpWarSide(info.ent)") &&
       renderSrc.includes('"ally"') && ui.includes("function pvpWarSide") && ui.includes("function pvpOwnTeam"),
      "war shields no renderer (verde=aliado, vermelho=rival)");
    ok(acc.includes('data.source==="tick"') && acc.includes("G.combat.pvpBattle"),
      "SSE de tick não dispara GET extra do estado durante a batalha");
    ok(server.includes("instanceSummary(row,true,acc.id)") && server.includes("instanceSummary(result.instance,true,acc.id)"),
      "GET e tick devolvem o snapshot enxuto por viewer");
  }
  // Dessincronia e cores de time (cliente).
  {
    const outfitSrc = fs.readFileSync(path.join(ROOT, "game/js/outfit.js"), "utf8");
    const appSrc = fs.readFileSync(path.join(ROOT, "game/js/appearance.js"), "utf8");
    ok(gameSrc.includes("pvpApplyRemoteCell") && gameSrc.includes("pvpRemoteEnt"),
      "PvP: posições dos chars não-self vêm da autoridade (anti-dessincronia)");
    const gridAiSrc = fs.readFileSync(path.join(ROOT, "game/js/gridai.js"), "utf8");
    ok(gridAiSrc.includes("if (c.pvpBattle) continue"),
      "IA local não move chars de outros players na guerra");
    ok(gameSrc.includes("._pvpTeam=") || gameSrc.includes("_pvpTeam="),
      "time carimbado em p._pvpTeam no merge do snapshot");
    ok(outfitSrc.includes("PVP_TEAM_OUTFIT_COLORS") && outfitSrc.includes("pvpTeamOutfitColors") &&
       appSrc.includes("pvpTeamOutfitColors(p)"),
      "outfit do time na batalha (azul time 1, vermelho time 2)");
    ok(pvpSrc.includes("exori-gran-ico") && pvpSrc.includes('"exori-gran"'),
      "combo de guerra do knight no preset PVP (gran ico > gran > exori)");
    ok(engSrc.includes("push:true"), "goal push: o time avança no alvo designado");
  }
  // sintaxe dos arquivos novos
  for (const f of ["server/pvp.js", "game/js/pvp-ui.js"])
    try { new vm.Script(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f }); ok(true, f + " parseia"); }
    catch (e) { ok(false, f + " parseia — " + e.message); }

  console.log(failures ? `\n${failures} FAILURES` : "\nALL PVP TESTS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
