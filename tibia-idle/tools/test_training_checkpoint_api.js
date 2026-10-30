"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const { spawn } = require("child_process");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "idle-training-api-"));
const port = 37400 + process.pid % 500, base = `http://127.0.0.1:${port}`;
let child, logs = "";
async function request(route, body, method = "POST", token) {
  const response = await fetch(base + route, { method, headers: Object.assign({ "content-type": "application/json" }, token ? { authorization: "Bearer " + token } : {}),
    body: method === "GET" ? undefined : JSON.stringify(body || {}) });
  return { status: response.status, data: await response.json() };
}
async function stop() {
  if (!child) return;
  const proc = child; child = null;
  await new Promise((resolve) => { proc.once("exit", resolve); proc.kill("SIGTERM"); });
}
async function start() {
  child = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, "..", "server"),
    env: Object.assign({}, process.env, { PORT: String(port), HOST: "127.0.0.1", MYSQL_HOST: "", TEST_SERVER: "0", GLOBAL_IDLE_DATA_DIR: dataDir }), stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (s) => { logs += s; }); child.stderr.on("data", (s) => { logs += s; });
  for (let i = 0; i < 150; i++) {
    try { if ((await request("/api/health", null, "GET")).data.ok) return; } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Server startup failed: " + logs);
}
(async () => {
  await start();
  await request("/api/register", { login: "training-api", password: "test" });
  const login = await request("/api/login", { login: "training-api", password: "test" });
  const token = login.data.token; assert(token);
  const acquired = await request("/api/lease/acquire", { token, holder_id: "training-api-holder" });
  const lease = { token, holder_id: acquired.data.holderId, lease_token: acquired.data.leaseToken };
  const created = await request("/api/characters", { token, name: "Training API", voc: "druid", data: JSON.stringify({ name: "Training API", voc: "druid" }) });
  assert.equal(created.status, 201);
  const id = created.data.character.id;
  const forgedClock = await request("/api/characters/" + id, Object.assign({}, lease, {
    expected_version: created.data.character.saveVersion,
    data: JSON.stringify({ trainingClock: { at: Date.now() - 3600000, sessionId: "training-test-session", holderId: lease.holder_id }, ml: 999 })
  }), "PUT");
  assert.equal(forgedClock.status, 200);
  const checked = await request("/api/characters/" + id, null, "GET", token);
  assert(!JSON.parse(checked.data.character.data).trainingClock);
  assert.notEqual(JSON.parse(checked.data.character.data).ml, 999);
  const config = await request("/api/training/config", Object.assign({}, lease, { char_id: id, skill: "magic", plan: "free" }));
  assert.equal(config.status, 200, JSON.stringify(config.data));
  const body = Object.assign({}, lease, { char_ids: [id], session_id: "training-test-session" });
  let r = await request("/api/training/checkpoint", body);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const firstVersion = r.data.characters[0].saveVersion;
  await new Promise((resolve) => setTimeout(resolve, 2100));
  r = await request("/api/training/checkpoint", Object.assign({}, body, { ml: 999, skills: { sword: 999 }, elapsed: 3600000 }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const trained = r.data.characters[0].snapshot;
  assert(trained.ml < 999 && (trained.ml > 0 || trained.manaSpent > 0));
  const loaded = await request("/api/characters/" + id, null, "GET", token);
  const saved = JSON.parse(loaded.data.character.data);
  assert.equal(saved.ml, trained.ml); assert.equal(saved.manaSpent, trained.manaSpent);
  const stale = await request("/api/characters/" + id, Object.assign({}, lease, { expected_version: firstVersion, data: JSON.stringify({ ml: 0, skills: { sword: 10 } }) }), "PUT");
  assert.equal(stale.status, 409);
  const invalid = await request("/api/training/checkpoint", Object.assign({}, body, { char_ids: [999999] }));
  assert.notEqual(invalid.status, 200);
  const noLease = await request("/api/training/checkpoint", Object.assign({}, body, { lease_token: "invalid" }));
  assert.equal(noLease.status, 423);
  await request("/api/training/checkpoint", Object.assign({}, body, { stop: true }));
  await stop(); await start();
  const restored = await request("/api/characters/" + id, null, "GET", token);
  const snapshot = JSON.parse(restored.data.character.data);
  assert.equal(snapshot.ml, trained.ml); assert(snapshot.manaSpent >= trained.manaSpent);
  console.log("OK: HTTP checkpoint persiste antes da resposta, rejeita skill/tempo forjados, save stale, personagem inválido e lease inválida; restart preserva avanço.");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await stop(); fs.rmSync(dataDir, { recursive: true, force: true });
});
