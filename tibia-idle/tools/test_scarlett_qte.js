/* test_scarlett_qte.js — Dança da Scarlett: fila de intents + separação
 * movimento×QTE.
 *
 * Bug corrigido: durante phase==="qte", WASD/setas alimentavam G.walkKeys
 * (movimento) E o intent do QTE ao mesmo tempo; e o intent era slot
 * único — um segundo press no mesmo tick sobrescrevia o primeiro
 * (dir errada julgada = morte).
 *
 * Agora: (1) fila scarlettIntents — todos os pressos são julgados em
 * ordem; (2) o cliente não anda durante a dança (guarda no keydown, igual
 * à Malice); (3) toque no lead-in (antes da 1ª janela abrir) é ignorado,
 * não mata.
 */
const path = require("path"), fs = require("fs");
const engine = require("../server/authoritative_engine.js");
const gameDir = path.join(__dirname, "..", "game");
const gameSrc = fs.readFileSync(path.join(gameDir, "js", "game.js"), "utf8");
const clientSrc = fs.readFileSync(path.join(gameDir, "js", "account-client.js"), "utf8");
const scarlettSrc = fs.readFileSync(path.join(gameDir, "js", "scarlett-boss.js"), "utf8");

function must(ok, msg) { if (!ok) throw Error(msg); }

function player(overrides) {
  return Object.assign({ id: 1, name: "Tester", voc: "knight", level: 800,
    exp: engine.expForLevel(800), hp: 500000, mp: 20000, gold: 100000,
    skills: { sword: 120, axe: 10, club: 10, dist: 10, fist: 10, shield: 100 },
    ml: 20, equip: { weapon: { item: "sword" } }, supplies: {}, lootPouch: {},
    kills: {}, bosses: {}, config: {} }, overrides || {});
}
function bossDesc(p, bossId, slug) {
  const member = { id: String(p.id), p: JSON.parse(JSON.stringify(p)) };
  return { v: 1, savedAt: 1000, kind: "boss", huntId: null, bossId,
    instanceMode: "boss", activeCharacterId: String(p.id),
    members: [member],
    state: { players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10,
      x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: [{ id: "boss-1", slug: slug || bossId, boss: true, cx: 12, cy: 10,
        x: 12.5 / 30, y: 10.5 / 30 }], events: [] } };
}
function waitArenaBoss(auth) {
  const st = auth.authority.arenaBossSpawn;
  if (!st || st.spawned || !st.pending) return auth;
  const at = Number(st.at) || (Number(auth.authority.clock) || 0) + 5000;
  const elapsed = Math.max(0, at - (Number(auth.authority.clock) || 0)) + 1;
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth), elapsed, at + 1).state);
}
function silence(auth) {
  for (const mob of auth.authority.mobs || []) {
    mob.damage = 0; mob.attackSpeed = Number.MAX_SAFE_INTEGER; mob.attackAcc = 0;
    if (mob.def) mob.def.skills = [];
  }
}
// QTE ativa no estado autoritativo (mesma forma que scarlettStartQte gera).
function armQte(auth, dues) {
  const st = auth.authority.scarlett;
  st.phase = "qte"; st.immune = true; st.index = 0;
  st.sequence = dues.map((d) => d.dir);
  st.notes = dues.map((d) => ({ dir: d.dir, due: d.due, hit: false }));
  st.noteDues = st.notes.map((n) => n.due);
  st.qteStartedAt = auth.authority.clock;
  st.qteUntil = st.notes[st.notes.length - 1].due + 1070 + 200;
  delete st.pendingIntent; delete st.pendingIntents;
}

// --- 1) Movimento travado durante a dança (cliente) -------------------------
must(/G\.combat\.scarlett && G\.combat\.scarlett\.phase === "qte"/.test(gameSrc),
  "keydown de movimento sem a guarda da dança Scarlett");
must(clientSrc.includes("scarlettIntents"), "cliente não envia fila scarlettIntents");
must(scarlettSrc.includes("_scarlettPendingDirs"), "cliente sem fila de intents");

// --- 1b) Snapshot do servidor não pode sobrescrever a fila local ----------
// O state do tick carrega o combate do último checkpoint (autosave 20s), com
// _scarlettPendingDirs ([] ou intents velhos). Copiá-lo no merge apagava
// toques feitos com o tick em voo ("tecla perdida") e reenviava intents
// antigos (julgados contra a nota seguinte = morte no timing certo).
must(gameSrc.includes('key.charAt(0)!=="_")previous[key]=incoming[key]'),
  "merge do snapshot online ainda copia chaves _ (fila de intents do cliente)");
must(/key==="_scarlettPendingDirs"\|\|key==="_scarlettPendingDir"/.test(gameSrc),
  "checkpoint da instância ainda serializa a fila de intents da Scarlett");
{
  // Reproduz o merge: fila local com toque em voo + incoming do checkpoint.
  const previous = { _scarlettPendingDirs: [{ dir: "up", pressAuth: 5000 }], wave: 1 };
  const incoming = { _scarlettPendingDirs: [], wave: 2, _pvpPAt: 1 };
  for (const key of Object.keys(incoming))
    if (key !== "players" && key.charAt(0) !== "_") previous[key] = incoming[key];
  must(previous._scarlettPendingDirs.length === 1 && previous.wave === 2,
    "merge descartou o toque pendente da dança");
}

// --- 2) Fila: 5 pressos num único visual → sequência completa ---------------
{
  const auth = waitArenaBoss(engine.initializeAuthority(
    bossDesc(player(), "scarlett-etzel"), "a".repeat(64), 1000));
  silence(auth);
  const a = auth.authority, t0 = Number(a.clock);
  must(a.scarlett, "auth.scarlett ausente na luta scarlett-etzel");
  // 5 notas todas dentro da janela no instante do tick (due = t0-200).
  armQte(auth, ["up", "down", "left", "right", "up"].map((dir) => ({ dir, due: t0 - 200 })));
  const visual = {
    players: [{ id: "1", x: 10.5 / 30, y: 10.5 / 30, cx: 10, cy: 10, self: 1 }],
    scarlettIntents: ["up", "down", "left", "right", "up"].map((dir) => ({ dir })),
  };
  const out = engine.advanceAuthorityState(JSON.stringify(auth), 400, t0 + 400, visual);
  const a2 = JSON.parse(out.state).authority;
  must(a2.scarlett.phase === "vulnerable",
    "fila de intents não completou o QTE (phase=" + (a2.scarlett && a2.scarlett.phase) + ")");
  must(a2.scarlett.immune === false, "boss seguiu imune após sequência completa");
  must(a2.players[0].p.hp > 0 && !a2.players[0].permadead,
    "jogador morreu numa sequência correta");
}

// --- 3) Toque no lead-in: ignorado, não mata --------------------------------
{
  const auth = waitArenaBoss(engine.initializeAuthority(
    bossDesc(player(), "scarlett-etzel"), "b".repeat(64), 1000));
  silence(auth);
  const a = auth.authority, t0 = Number(a.clock);
  // Primeira nota só daqui a 2s — press agora é toque de movimento.
  armQte(auth, [{ dir: "up", due: t0 + 2000 }, { dir: "down", due: t0 + 2800 }]);
  const visual = {
    players: [{ id: "1", x: 10.5 / 30, y: 10.5 / 30, cx: 10, cy: 10, self: 1 }],
    scarlettIntents: [{ dir: "up", pressAuth: t0 }],
  };
  const out = engine.advanceAuthorityState(JSON.stringify(auth), 400, t0 + 400, visual);
  const a2 = JSON.parse(out.state).authority;
  must(a2.scarlett && a2.scarlett.phase === "qte",
    "press no lead-in derrubou o QTE (deveria ser ignorado)");
  must(a2.players[0].p.hp > 0 && !a2.players[0].permadead,
    "press no lead-in matou o jogador");
  must(a2.scarlett.index === 0, "press no lead-in avançou o index");
}

// --- 4) Direção errada na janela: falha + morte do mais fraco ---------------
{
  const auth = waitArenaBoss(engine.initializeAuthority(
    bossDesc(player(), "scarlett-etzel"), "c".repeat(64), 1000));
  silence(auth);
  const a = auth.authority, t0 = Number(a.clock);
  armQte(auth, [{ dir: "up", due: t0 - 200 }, { dir: "down", due: t0 + 600 }]);
  const visual = {
    players: [{ id: "1", x: 10.5 / 30, y: 10.5 / 30, cx: 10, cy: 10, self: 1 }],
    scarlettIntents: [{ dir: "left", pressAuth: t0 - 200 }], // errada, dentro da janela
  };
  const out = engine.advanceAuthorityState(JSON.stringify(auth), 400, t0 + 400, visual);
  const a2 = JSON.parse(out.state).authority;
  const evs = (a2.state && a2.state.events) || [];
  must(a2.scarlett.phase === "waiting", "dir errada não falhou o QTE");
  must(a2.players[0].permadead === true,
    "dir errada na janela não matou o jogador (permadead esperado)");
}

// --- 5) Dois pressos no mesmo tick: fila preserva ordem (bug original) ------
{
  const auth = waitArenaBoss(engine.initializeAuthority(
    bossDesc(player(), "scarlett-etzel"), "e".repeat(64), 1000));
  silence(auth);
  const a = auth.authority, t0 = Number(a.clock);
  armQte(auth, [{ dir: "up", due: t0 - 200 }, { dir: "down", due: t0 - 100 }]);
  const visual = {
    players: [{ id: "1", x: 10.5 / 30, y: 10.5 / 30, cx: 10, cy: 10, self: 1 }],
    // Antes: só "down" chegava (overwrite) → julgado contra a nota "up" = morte.
    scarlettIntents: [{ dir: "up", pressAuth: t0 - 200 }, { dir: "down", pressAuth: t0 - 100 }],
  };
  const out = engine.advanceAuthorityState(JSON.stringify(auth), 400, t0 + 400, visual);
  const a2 = JSON.parse(out.state).authority;
  must(a2.scarlett.phase === "vulnerable",
    "dois pressos no mesmo tick perderam o primeiro (overwrite ainda existe)");
  must(a2.players[0].p.hp > 0 && !a2.players[0].permadead,
    "dois pressos corretos no mesmo tick mataram o jogador");
}

console.log("test_scarlett_qte OK — fila de intents, lead-in ignorado, dir errada mata, movimento travado");
