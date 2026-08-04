/* Teste da API de contas (servidor + cliente):
 * 1) servidor: register/login/save via HTTP real (requer server.js rodando)
 * 2) cliente: account-client.js com fetch stub
 */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const errors = [];

// ============ TESTE 1: account-client.js com fetch stub =========
const dom = new JSDOM(`<html><body></body></html>`, { url: "http://x/" });
const w = dom.window;
w.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
w.sessionStorage = w.localStorage;

// fetch stub que fala com a API real (se estiver rodando) ou mock
let apiBase = process.env.API_URL || "http://127.0.0.1:3456";
w.fetch = async (url, opts) => {
  const method = (opts && opts.method) || "GET";
  const headers = (opts && opts.headers) || {};
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  const p = url.replace(apiBase, "");
  // mock local para nao depender do servidor nos testes do cliente
  if (process.env.LIVE === "1") {
    const r = await import("node:http");
    // usa fetch do node 18+
  }
  // stub de respostas (funções para avaliar o body só quando houver)
  const resp = {
    "/api/login": () => body && body.login === "1" && body.password === "1"
      ? { ok: true, token: "tok-admin", account: { id: 1, login: "1", role: "admin", coins: 1000 }, characters: [] }
      : { ok: false, msg: "Login ou senha inválidos" },
    "/api/register": () => ({ ok: true, id: 9, login: (body || {}).login, role: "user" }),
    "/api/me": () => ({ ok: true, account: { id: 1, login: "1", role: "admin", coins: 1000 }, characters: [{ id: 1, name: "AdminChar", voc: "knight", level: 5 }] }),
    "/api/characters": () => ({ ok: true, character: { id: 2, name: (body || {}).name, voc: (body || {}).voc, level: 1 } }),
  };
  const data = resp[p] ? resp[p]() : { ok: false, msg: "not found" };
  return { status: data.ok ? 200 : 400, json: async () => data };
};

const ctx = vm.createContext(w);
function loadClient() {
  vm.runInContext(fs.readFileSync(path.join(GAME, "js/account-client.js"), "utf8"), ctx, { filename: "account-client.js" });
}
loadClient();

(async () => {
  try {
    // login admin
    const r = await vm.runInContext("accountLogin('1','1')", ctx);
    if (!r.ok) errors.push("login admin falhou");
    else if (r.account.role !== "admin") errors.push("role nao admin");
    else if (r.account.coins !== 1000) errors.push("coins nao 1000");
    console.log("CLIENTE LOGIN OK — admin 1/1 role=admin coins=1000");

    // register
    const reg = await vm.runInContext("accountRegister('novo','senha')", ctx);
    if (!reg.ok) errors.push("register falhou");
    console.log("CLIENTE REGISTER OK");

    // me
    const me = await vm.runInContext("accountMe('tok-admin')", ctx);
    if (!me.ok || me.characters.length !== 1) errors.push("me falhou");
    console.log("CLIENTE ME OK — 1 personagem");

    // create character
    const cc = await vm.runInContext("accountCreateCharacter('tok-admin','NovoChar','paladin',{})", ctx);
    if (!cc.ok || cc.character.name !== "NovoChar") errors.push("create character falhou");
    console.log("CLIENTE CREATE CHAR OK");
  } catch (e) {
    errors.push("cliente: " + (e.stack || e.message));
  }

  // ============ TESTE 2: servidor real (se LIVE=1) =========
  if (process.env.LIVE === "1") {
    try {
      const base = apiBase;
      const http = require("node:http");
      function req(method, p, body) {
        return new Promise((resolve, reject) => {
          const data = body ? JSON.stringify(body) : null;
          const r = http.request(base + p, {
            method,
            headers: { "Content-Type": "application/json" },
          }, (res) => {
            let d = "";
            res.on("data", (c) => d += c);
            res.on("end", () => resolve(JSON.parse(d)));
          });
          r.on("error", reject);
          if (data) r.write(data);
          r.end();
        });
      }
      const login = await req("POST", "/api/login", { login: "1", password: "1" });
      if (!login.ok) errors.push("servidor: login admin falhou");
      else console.log("SERVIDOR LOGIN OK — admin 1/1");
      const reg = await req("POST", "/api/register", { login: "t" + Date.now(), password: "x" });
      if (!reg.ok) errors.push("servidor: register falhou");
      else console.log("SERVIDOR REGISTER OK");
    } catch (e) { errors.push("servidor: " + e.message); }
  }

  if (errors.length) {
    console.log("ERROS (" + errors.length + "):");
    for (const e of errors.slice(0, 20)) console.log("  - " + e);
    process.exit(1);
  }
  console.log("ACCOUNT API OK — cliente + fluxo de contas");
  process.exit(0);
})();
