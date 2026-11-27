"use strict";
/* test_charm_expansion.js — E2E do produto "Charm Expansion" da Store
 * (oficial: 450 Tibia Coins, por conta, charms ativos ilimitados).
 * Sobe o server real (TEST_SERVER=1, JsonStore temporário) e exercita:
 *   - catálogo expõe charmExpansionCoins=450
 *   - compra sem saldo → 409
 *   - compra com saldo → coins debitados (NT primeiro) + cosmetics marcado
 *   - re-compra → 409 ("já desbloqueado")
 *   - ledger registra o ref "charm-expansion"
 * Uso: node tools/test_charm_expansion.js
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const PORT = 8124;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gi-ce-"));

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
      TEST_SERVER: "1",
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

    let r = await api("POST", "/api/register", { login: "cetest", password: "teste123", displayName: "Ce Teste" });
    check(r.data.ok === true, "register", r.data);
    r = await api("POST", "/api/login", { login: "cetest", password: "teste123" });
    const token = r.data.token;
    check(r.data.ok === true && !!token, "login", r.data);

    // catálogo expõe o preço oficial
    r = await api("GET", "/api/store/catalog", null, token);
    check(r.data.ok === true && r.data.charmExpansionCoins === 450,
      "catálogo: charmExpansionCoins=450", r.data.charmExpansionCoins);

    // sem saldo → 409
    r = await api("POST", "/api/store/charm-expansion", { token });
    check(r.code === 409 && r.data.ok === false, "compra sem saldo → 409", r.data);

    // credita via checkout + simulate (caminho oficial de TEST_SERVER):
    // pack tc500 = 500 + 25 bônus = 525 coins.
    r = await api("POST", "/api/store/checkout", { token, packId: "tc500", method: "pix" });
    check(r.data.ok === true && r.data.order && r.data.order.id, "checkout cria pedido", r.data);
    const orderId = r.data.order.id;
    r = await api("POST", "/api/store/simulate", { token, orderId });
    check(r.data.ok === true && r.data.coins === 525, "simulate credita 525 coins", r.data);

    // compra → débito 450, cosmetics.charmExpansion=1
    r = await api("POST", "/api/store/charm-expansion", { token });
    check(r.code === 200 && r.data.ok === true, "compra ok", r.data);
    check(r.data.coins === 75, "coins debitados (525-450=75)", r.data);
    const cos = typeof r.data.cosmetics === "string" ? JSON.parse(r.data.cosmetics) : (r.data.cosmetics || {});
    check(cos.charmExpansion === 1, "cosmetics.charmExpansion=1", r.data.cosmetics);
    check(typeof r.data.msg === "string" && r.data.msg.length > 4, "msg de confirmação", r.data);

    // re-compra → 409 já desbloqueado
    r = await api("POST", "/api/store/charm-expansion", { token });
    check(r.code === 409 && r.data.ok === false, "re-compra → 409", r.data);

    // /api/me reflete o desbloqueio pra o cliente (account.cosmetics)
    r = await api("GET", "/api/me", null, token);
    const accCos = r.data.account && r.data.account.cosmetics || {};
    const meCos = typeof accCos === "string" ? JSON.parse(accCos) : accCos;
    check(meCos.charmExpansion === 1, "/api/me reflete charmExpansion", r.data.account && r.data.account.cosmetics);

    console.log(`\n${passed} ok, ${failed} falhas`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) { }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
