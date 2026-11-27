"use strict";
/* test_weekly_daily_reward.js — E2E do cronograma semanal de recompensa
 * diária POR CONTA. Sobe o server real numa porta própria com JsonStore em
 * diretório temporário e exercita: status semanal, claim por tipo, marca da
 * conta, wildcards no pool, boost em TODOS os chars, e o 409 de re-claim.
 * Uso: node tools/test_weekly_daily_reward.js
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gi-dr-"));

let passed = 0, failed = 0;
function check(cond, label, extra) {
  if (cond) { passed++; console.log("  ok:", label); }
  else { failed++; console.log("  FALHOU:", label, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
}
function api(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(BASE + url, {
      method, headers: Object.assign({ "content-type": "application/json" },
        token ? { authorization: "Bearer " + token } : {},
        data ? { "content-length": Buffer.byteLength(data) } : {}),
    }, (res) => {
      let buf = ""; res.on("data", (c) => buf += c); res.on("end", () => {
        let j = {}; try { j = JSON.parse(buf); } catch (e) { }
        resolve({ code: res.statusCode, data: j });
      });
    });
    req.on("error", reject);
    if (data) req.write(data); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const child = spawn(process.execPath, ["server/server.js"], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), HOST: "127.0.0.1",
      GLOBAL_IDLE_DATA_DIR: DATA_DIR,
      MYSQL_HOST: "", MYSQL_USER: "", MYSQL_PASSWORD: "", MYSQL_DATABASE: "",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let booted = false;
  child.stdout.on("data", (d) => { if (String(d).includes("bootId")) booted = true; });
  child.stderr.on("data", (d) => process.stderr.write(d));
  try {
    for (let i = 0; i < 60 && !booted; i++) await sleep(500);
    if (!booted) throw new Error("server não subiu");

    // conta + login + 2 chars
    let r = await api("POST", "/api/register", { login: "drtest", password: "teste123", displayName: "Dr Teste" });
    check(r.data.ok === true, "register", r.data);
    r = await api("POST", "/api/login", { login: "drtest", password: "teste123" });
    check(r.data.ok === true && !!r.data.token, "login", r.data);
    const token = r.data.token;
    r = await api("POST", "/api/characters", { token, name: "Drcharone", voc: "knight" });
    check(r.data.ok === true, "char 1 criado", r.data);
    const c1 = r.data.character.id, v1 = r.data.character.saveVersion;
    r = await api("POST", "/api/characters", { token, name: "Drchartwo", voc: "paladin" });
    check(r.data.ok === true, "char 2 criado", r.data);
    const c2 = r.data.character.id, v2 = r.data.character.saveVersion;

    // lease (requireLease)
    r = await api("POST", "/api/lease/acquire", { token, holder_id: "dr-test-holder-01" });
    check(r.data.ok === true && !!r.data.leaseToken, "lease acquire", r.data);
    const lease = { holder_id: "dr-test-holder-01", lease_token: r.data.leaseToken };

    // status: recompensa do dia + grade semanal de 7 entradas
    r = await api("GET", `/api/training/daily-reward?char_id=${c1}`, null, token);
    const st = r.data;
    check(st.ok === true && st.available === true, "status disponível", st);
    check(Array.isArray(st.schedule) && st.schedule.length === 7, "grade semanal de 7 dias", st.schedule);
    check(Number.isInteger(st.weekday) && st.reward && st.reward.type, "reward do dia tipado", st);
    const types = st.schedule.map((row) => row.reward && row.reward.type);
    check(JSON.stringify(types) === JSON.stringify(["exercise", "wildcard", "exp", "wildcard", "exercise", "exp", "skill"]),
      "cronograma dom=exercise seg/qua=wildcard ter/sex=exp qui=exercise sáb=skill", types);
    check(st.schedule[0].reward.charges === 1500 && st.schedule[4].reward.charges === 500,
      "cargas dom=1500 qui=500", st.schedule);
    check(st.schedule[2].reward.mul === 1.25 && st.schedule[2].reward.leftMs === 3600000,
      "terça exp ×1.25 por 1h", st.schedule[2].reward);
    check(st.schedule[5].reward.mul === 2 && st.schedule[5].reward.leftMs === 1800000,
      "sexta exp ×2 por 30min", st.schedule[5].reward);
    check(st.schedule[6].reward.mul === 2 && st.schedule[6].reward.leftMs === 1800000,
      "sábado skill ×2 por 30min", st.schedule[6].reward);
    check(st.schedule[1].reward.cards === 10 && st.schedule[3].reward.cards === 10,
      "seg/qua 10 wildcards", st.schedule);

    // claim do dia — arma só quando o dia pede exercise
    const needsWeapon = st.reward.type === "exercise";
    const claimBody = Object.assign({ token, char_id: Number(c1),
      weapon: needsWeapon ? "exercise-sword" : "",
      expected_version: Number(v1) || 1 }, lease);
    r = await api("POST", "/api/training/daily-claim", claimBody);
    check(r.data.ok === true, `claim do dia (${st.reward.type})`, r.data);
    check(typeof r.data.msg === "string" && r.data.msg.length > 4, "msg de claim", r.data);
    check(r.data.dailyReward && r.data.dailyReward.available === false &&
      r.data.dailyReward.claimedDay === st.rewardDay, "conta marcada após claim", r.data.dailyReward);

    if (st.reward.type === "exercise") {
      const te = r.data.trainingExercise || {};
      check(te.balances && te.balances.lasting === st.reward.charges,
        `coletor ganhou ${st.reward.charges} cargas Lasting`, te);
    }
    if (st.reward.type === "wildcard") {
      check(Number(r.data.preyCards) === 10, "pool de Prey Cards +10", r.data);
    }
    if (st.reward.type === "exp" || st.reward.type === "skill") {
      const key = st.reward.type === "exp" ? "expBoost" : "skillBoost";
      check(r.data[key] && Number(r.data[key].mul) === st.reward.mul &&
        Number(r.data[key].leftMs) === st.reward.leftMs, `boost ${key} no coletor`, r.data[key]);
      // o OUTRO char da conta também recebeu o boost (recompensa por conta)
      r = await api("GET", "/api/me", null, token);
      const charData = (c) => { const d = (c && (c.snapshot || c.data)) || {};
        return typeof d === "string" ? JSON.parse(d) : d; };
      const other = (r.data.characters || []).find((c) => String(c.id) === String(c2));
      let od = {}; try { od = charData(other); } catch (e) { }
      check(od[key] && Number(od[key].mul) === st.reward.mul &&
        Number(od[key].leftMs) === st.reward.leftMs, `boost ${key} no OUTRO char da conta`, od[key]);
      // coletor marcado; outro não
      const me1 = (r.data.characters || []).find((c) => String(c.id) === String(c1));
      let d1 = {}; try { d1 = charData(me1); } catch (e) { }
      check(d1.dailyRewardDay === st.rewardDay && od.dailyRewardDay === undefined,
        "marcador só no coletor", { d1: d1.dailyRewardDay, od: od.dailyRewardDay });
    }

    // segundo claim → 409 (conta já coletou)
    r = await api("POST", "/api/training/daily-claim", Object.assign(claimBody,
      { expected_version: Number(v1) + 1 }));
    check(r.code === 409 && r.data.error === "DAILY_REWARD_ALREADY_CLAIMED",
      "re-claim bloqueado (409)", r.data);

    // e o claim pelo OUTRO char também bloqueia — a marca é da conta
    r = await api("POST", "/api/training/daily-claim", Object.assign({ token,
      char_id: Number(c2), weapon: "exercise-bow", expected_version: Number(v2) || 1 }, lease));
    check(r.code === 409, "claim pelo outro char também bloqueado", r.data);

    console.log(`\n${passed} ok, ${failed} falhas`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) { }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
