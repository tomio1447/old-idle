"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
function must(ok, msg) { if (!ok) throw Error(msg); }
const ctx = {
  console, Date, Math, Infinity,
  SKILL_NAMES: { sword: "Sword", axe: "Axe", club: "Club", dist: "Distance", shield: "Shielding", fist: "Fist" },
  VOCATIONS: { knight: { attackSpeed: 2000 } },
  vipExerciseSpeed() { return 1; },
  cellCenter(c) { return { x: (c.x + .5) / 20, y: (c.y + .5) / 20 }; },
  weaponSkill() { return "sword"; },
  academyStatus() { return { ok: true, skill: "sword" }; },
  addSkillTries(p, s, n) { p.gains = (p.gains || 0) + n; return false; },
  addManaSpent(p, n) { p.gains = (p.gains || 0) + n; return false; },
  playerDamage() { return { min: 1, max: 2 }; },
  missileDir() { return "s"; },
  G: {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(game, "js", "training.js"), "utf8"), ctx, { filename: "training.js" });
vm.runInContext(fs.readFileSync(path.join(game, "js", "city.js"), "utf8"), ctx, { filename: "city.js" });
const mk = (id) => ({ id: String(id), name: "P" + id, voc: "knight", skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 10, shield: 10 }, skillTries: {}, ml: 0, manaSpent: 0, config: {} });
const a = mk(1), b = mk(2); ctx.ensureTraining(a); ctx.ensureTraining(b);
must(a.trainingExercise.activePlan === "free" && ctx.exerciseCharges(a) === Infinity, "entrada não concede arma grátis infinita");
a.trainingExercise.skill = "club"; a.trainingExercise.activePlan = "exercise"; a.trainingExercise.balances.exercise = 2;
b.trainingExercise.skill = "magic"; b.trainingExercise.activePlan = "lasting"; b.trainingExercise.balances.lasting = 2;
const dummy = vm.runInContext("TRAINING_DUMMY_ABS", ctx), queue = vm.runInContext("TRAINING_QUEUE_ABS", ctx), dummyId = vm.runInContext("TRAINING_DUMMY_ITEM_ID", ctx);
ctx.G.p = a;
const map = { sourceBounds: { x: 1000, y: 1014 }, w: 24, h: 18 };
const ma = ctx.buildTrainingMember(a, 0, map), mb = ctx.buildTrainingMember(b, 1, map), tr = { members: [ma, mb], dummyPos: ctx.trainingLocalPoint(map, dummy) };
ma.hitCd = mb.hitCd = 0; ctx.trainingPartyTick(tr, 100, Date.now());
must(a.trainingExercise.balances.exercise === 1 && b.trainingExercise.balances.lasting === 1, "cargas não são exclusivas por personagem");
must(a.gains === 7 * 1.25 * 2, "bônus de 125% ou shielding incorreto");
must(b.gains === 600 * 1.5 + 7 * 1.5, "bônus de 150% mágico incorreto");
must(ma.facing === "s" && mb.facing === "s", "fila não está virada ao sul");
must(ma.proj && ma.proj.fx === vm.runInContext('EXERCISE_FX["exercise-club"].fx', ctx), "EXERCISE_FX não reutilizado");
must(dummyId === 30616 && dummy.x === 1013 && dummy.y === 1022, "dummy incorreto");
must(queue.map(p => p.x).join(",") === "1011,1012,1013,1014" && queue.every(p => p.y === 1021 && p.z === 7), "fila absoluta incorreta");

// ---- conversão absoluta/local precisa usando bounds da exercisearea ----
const localDummy = ctx.trainingLocalPoint(map, dummy);
must(Math.abs(localDummy.x - 13.5 / 24) < 1e-9 && Math.abs(localDummy.y - 8.5 / 18) < 1e-9, "dummy local deve ser (13.5/24,8.5/18)");
const localQueue = queue.map((p, i) => ctx.trainingLocalPoint(map, p));
for (let i = 0; i < 4; i++) {
  const expectedX = (11.5 + i) / 24, expectedY = 7.5 / 18;
  must(Math.abs(localQueue[i].x - expectedX) < 1e-9 && Math.abs(localQueue[i].y - expectedY) < 1e-9,
    `fila[${i}] local incorreta: ${localQueue[i].x},${localQueue[i].y}`);
}
must(ma.isLocal === true, "personagem atual em G.p deve receber flag isLocal");

// ---- estrutura visual do training-ui.js ----
const uiSrc = fs.readFileSync(path.join(game, "js", "training-ui.js"), "utf8");
must(/class=\s*["'][^"']*tr-skill-grid/.test(uiSrc), "training-ui.js deve usar .tr-skill-grid");
must(/class=\s*["'][^"']*tr-plan-card/.test(uiSrc), "training-ui.js deve usar .tr-plan-card");
must(/class=\s*["'][^"']*tr-char-icon/.test(uiSrc), "painel deve usar .tr-char-icon");
must(!/<select\b/i.test(uiSrc), "training-ui.js não deve conter <select> visível");
must(!/type\s*=\s*["']radio["']/i.test(uiSrc), "training-ui.js não deve conter radio visível");
must(!/\btabs\b/.test(uiSrc), "training-ui.js não deve usar tabs");

console.log("OK: treino multi-personagem, planos, cargas, posições, conversão local e estrutura visual.");

ctx.accountApiConfigured = () => true;
const online = mk(3); ctx.ensureTraining(online);
online.trainingExercise.activePlan = "lasting"; online.trainingExercise.balances.lasting = 3;
const mo = ctx.buildTrainingMember(online, 0, map); mo.hitCd = 0;
ctx.academyTrainingTick(mo, online, 100, Date.now(), tr.dummyPos);
must(online.trainingExercise.balances.lasting === 3 && !online.gains, "online não pode consumir cargas ou conceder skills no navegador");
must(!!mo.proj, "animações online devem continuar funcionando");

async function testTrainingCheckpoints() {
  const assert = require("assert"), os = require("os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idle-training-test-"));
  const oldDir = process.env.GLOBAL_IDLE_DATA_DIR, oldHost = process.env.MYSQL_HOST;
  process.env.GLOBAL_IDLE_DATA_DIR = dir; process.env.MYSQL_HOST = "";
  const dbPath = require.resolve("../server/db");
  try {
    delete require.cache[dbPath];
    const db = await require(dbPath).getDb();
    const { advanceTrainingPlayer } = require("../server/authoritative_engine");
    db.accounts.push({ id: 1, login: "training-test", vip_until: 0, coins: 0 });
    const account = db.accounts[0], aid = account.id, now = Date.now();
    const lease = { holderId: "training-test", secretHash: "test-hash", now };
    db.leaseAcquire(aid, lease.holderId, "", "", lease.secretHash, now, now + 120000);
    const p = mk(1); p.trainingExercise = { skill: "sword", activePlan: "lasting", balances: { lasting: 3, exercise: 0 }, active: true };
    p.skillTries.sword = 49;
    const row = db.createCharacter(aid, "Training test", "knight", 1, JSON.stringify(p));
    const tick = (at, session = "test-session", stop = false) => db.trainingCheckpoint(aid, [row.id], session, at,
      Object.assign({}, lease, { now: at }), advanceTrainingPlayer, stop);
    let result = tick(now);
    assert(result.ok); assert.equal(JSON.parse(row.data).skills.sword, 10);
    result = tick(now + 2000);
    assert(result.ok); assert(result.advances.some((a) => a.type === "sword"));
    const saved = JSON.parse(row.data), version = row.save_version;
    assert(saved.skills.sword > 10); assert.equal(saved.trainingExercise.balances.lasting, 2);
    const disk = JSON.parse(fs.readFileSync(path.join(dir, "characters.json"), "utf8")).find((c) => c.id === row.id);
    assert.equal(JSON.parse(disk.data).skills.sword, saved.skills.sword);
    tick(now + 2000);
    assert.equal(JSON.parse(row.data).trainingExercise.balances.lasting, 2);
    tick(now + 3000, "different-session");
    assert.equal(JSON.parse(row.data).trainingExercise.balances.lasting, 2);
    tick(now + 60000, "different-session");
    assert.equal(JSON.parse(row.data).trainingExercise.balances.lasting, 2);
    const stale = db.saveCharactersVersioned(aid, [{ id: row.id, expectedVersion: version - 1, voc: "knight", level: 1, data: JSON.stringify(p) }], lease);
    assert.equal(stale.error, "SAVE_VERSION_CONFLICT");
    const denied = db.trainingCheckpoint(aid, [row.id], "test-session", now + 61000,
      Object.assign({}, lease, { secretHash: "invalid" }), advanceTrainingPlayer, false);
    assert.equal(denied.error, "LEASE_REQUIRED");
    const missing = db.trainingCheckpoint(aid, [row.id, 999999], "test-session", now + 61000, lease, advanceTrainingPlayer, false);
    assert.equal(missing.error, "CHARACTER_NOT_FOUND");
    const mage = mk(4); mage.voc = "druid"; mage.ml = 0; mage.manaSpent = 1599;
    mage.trainingExercise = { skill: "magic", activePlan: "lasting", balances: { lasting: 1 }, active: true };
    advanceTrainingPlayer(mage, now, "mage-session", false, lease.holderId, false);
    const magic = advanceTrainingPlayer(mage, now + 2000, "mage-session", false, lease.holderId, false);
    assert(magic.advances.some((a) => a.type === "magic")); assert(mage.ml > 0);
    assert.equal(mage.trainingExercise.balances.lasting, 0);
    advanceTrainingPlayer(mage, now + 4000, "mage-session", false, lease.holderId, true);
    assert.equal(mage.trainingExercise.activePlan, "free"); assert.equal(mage.trainingClock, null);
    delete require.cache[dbPath];
    const restarted = await require(dbPath).getDb();
    assert.equal(JSON.parse(restarted.findCharacter(row.id).data).skills.sword, saved.skills.sword);
    console.log("OK: avanço salvo antes da resposta, restart preserva skill, carga atômica, sem replay, lease e versão stale rejeitadas, ML e fallback free.");
  } finally {
    if (oldDir === undefined) delete process.env.GLOBAL_IDLE_DATA_DIR; else process.env.GLOBAL_IDLE_DATA_DIR = oldDir;
    if (oldHost === undefined) delete process.env.MYSQL_HOST; else process.env.MYSQL_HOST = oldHost;
    delete require.cache[dbPath];
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
testTrainingCheckpoints().catch((error) => { console.error(error); process.exitCode = 1; });
