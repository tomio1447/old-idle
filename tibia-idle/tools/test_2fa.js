/* 2FA — TOTP (RFC 6238) + fallback por e-mail.
 *
 * Fluxo implementado:
 *  - /api/account/2fa/setup (logado) → segredo pendente + otpauth URI + QR
 *  - /api/account/2fa/confirm → 1º código válido ativa totp_enabled
 *  - /api/account/2fa/disable → exige código atual, limpa segredo
 *  - /api/login com 2FA ativo → need2fa + challenge (5min, 5 tentativas)
 *  - /api/login/2fa → código TOTP ou código de e-mail → sessão
 *  - /api/login/2fa/email → envia código (máx 3 por challenge)
 * Testa o TOTP contra os vetores oficiais do RFC 6238.
 */
"use strict";
const fs = require("fs"), path = require("path");
const crypto = require("crypto");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
const dbSource = fs.readFileSync(path.join(__dirname, "..", "server", "db.js"), "utf8");
const mailerSource = fs.readFileSync(path.join(__dirname, "..", "server", "mailer.js"), "utf8");
const accountJs = fs.readFileSync(path.join(__dirname, "..", "game", "js", "account-client.js"), "utf8");
const gameJs = fs.readFileSync(path.join(__dirname, "..", "game", "js", "game.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "game", "index.html"), "utf8");
function must(ok, msg) { if (!ok) throw Error(msg); }

/* --- TOTP real: extrai as funções do server e roda vetores RFC 6238 -------- */
const fnSrc = serverSource.slice(
  serverSource.indexOf('const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";'),
  serverSource.indexOf("let QRCode = null;"));
const sandbox = { crypto, Date };
const fn = new Function("crypto", "Date", fnSrc +
  "return { base32Encode, base32Decode, totpCode, totpVerify };")(crypto, Date);
must(typeof fn.totpCode === "function" && typeof fn.totpVerify === "function",
  "extração das funções TOTP falhou");

/* RFC 6238 apêndice B — segredo ASCII "12345678901234567890" em base32.
 * T=59s → contador 1 → 8 dígitos 94287082 → 6 dígitos 287082. */
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
must(fn.base32Decode(RFC_SECRET_B32).toString() === "12345678901234567890",
  "base32Decode não decodificou o segredo do RFC");
must(fn.totpCode(RFC_SECRET_B32, 0, 59000) === "287082",
  "TOTP T=59s != vetor RFC 6238 (esperado 287082)");
must(fn.totpCode(RFC_SECRET_B32, 0, 1111111109000) === "081804",
  "TOTP T=1111111109s != vetor RFC 6238 (esperado 081804)");
/* Janela ±1 passo: código do passo anterior ainda é aceito (drift). */
const nowCode = fn.totpCode(RFC_SECRET_B32, 0, Date.now());
must(fn.totpVerify(RFC_SECRET_B32, nowCode) === true, "totpVerify rejeitou código válido");
const prevCode = fn.totpCode(RFC_SECRET_B32, -1, Date.now());
must(fn.totpVerify(RFC_SECRET_B32, prevCode) === true,
  "totpVerify não aceitou o passo anterior (janela de drift)");
must(fn.totpVerify(RFC_SECRET_B32, "000000") === false &&
  fn.totpVerify("", "287082") === false &&
  fn.totpVerify(RFC_SECRET_B32, "abc") === false,
  "totpVerify aceitou código/segredo inválido");
const enc = fn.base32Encode(crypto.randomBytes(20));
must(/^[A-Z2-7]{32}$/.test(enc) && fn.base32Decode(enc).length === 20,
  "base32Encode de 20 bytes não produziu 32 chars reversíveis");

/* --- servidor: fluxo + endpoints ------------------------------------------ */
must(/acc\.totp_enabled && acc\.totp_secret/.test(serverSource),
  "login não verifica totp_enabled");
must(/need2fa: true, tfa/.test(serverSource) && /hasEmail/.test(serverSource),
  "login não devolve need2fa+tfa+hasEmail");
must(/TFA_CHALLENGE_MAX_TRIES/.test(serverSource) &&
  /\+\+c\.ch\.tries > TFA_CHALLENGE_MAX_TRIES/.test(serverSource),
  "challenge sem limite de tentativas (brute-force do código)");
must(/tfaChallenges\.delete\(c\.key\)/.test(serverSource),
  "challenge não é consumido após sucesso");
must(/url === "\/api\/login\/2fa"/.test(serverSource),
  "rota /api/login/2fa ausente");
must(/url === "\/api\/login\/2fa\/email"/.test(serverSource),
  "rota /api/login/2fa/email ausente");
must(/url === "\/api\/account\/2fa\/setup"/.test(serverSource) &&
  /url === "\/api\/account\/2fa\/confirm"/.test(serverSource) &&
  /url === "\/api\/account\/2fa\/disable"/.test(serverSource),
  "rotas de gestão do 2FA ausentes");
must(/otpauth:\/\/totp\//.test(serverSource) && /issuer=Global-Idle/.test(serverSource),
  "URI otpauth ausente/malformada");
must(/mailer\.sendLoginCode/.test(serverSource),
  "fallback de e-mail não usa mailer.sendLoginCode");
must(/totpEnabled:!!\(acc&&acc\.totp_enabled\)/.test(serverSource),
  "accountPublicView não expõe totpEnabled");
must(/emailsSent[^\n]*>= 3/.test(serverSource),
  "fallback de e-mail sem limite de envios por challenge");

/* --- db: colunas + helpers ------------------------------------------------- */
must(dbSource.includes('"ADD COLUMN totp_secret VARCHAR(64) DEFAULT NULL"') &&
  dbSource.includes('"ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0"') &&
  dbSource.includes('"ADD COLUMN tfa_code CHAR(6) DEFAULT NULL"'),
  "migração das colunas 2FA ausente");
must(/setAccountTotp[\s\S]{0,400}totp_secret/.test(dbSource) &&
  /setAccountTfaCode[\s\S]{0,400}tfa_code/.test(dbSource),
  "helpers setAccountTotp/setAccountTfaCode ausentes");
must((dbSource.match(/setAccountTotp/g) || []).length >= 2 &&
  (dbSource.match(/setAccountTfaCode/g) || []).length >= 2,
  "helpers devem existir nas duas stores (JsonStore + MySQL)");

/* --- mailer ---------------------------------------------------------------- */
must(mailerSource.includes("async function sendLoginCode") &&
  mailerSource.includes("sendLoginCode"),
  "sendLoginCode ausente no mailer");

/* --- cliente --------------------------------------------------------------- */
must(/r\.data\.need2fa/.test(accountJs) && /tfa: r\.data\.tfa/.test(accountJs),
  "accountLogin não repassa o challenge need2fa");
must(/\/api\/login\/2fa"/.test(accountJs) && /method: method === "email"/.test(accountJs),
  "accountLogin2fa ausente/errado");
must(/\/api\/login\/2fa\/email/.test(accountJs),
  "accountLogin2faEmail ausente");
must(/\/api\/account\/2fa\/setup/.test(accountJs) &&
  /\/api\/account\/2fa\/confirm/.test(accountJs) &&
  /\/api\/account\/2fa\/disable/.test(accountJs),
  "funções de gestão 2FA ausentes no cliente");
must(indexHtml.includes('id="account-tfa-form"') && indexHtml.includes('id="acc-tfa-email"'),
  "formulário do 2º passo ausente no index.html");
must(gameJs.includes("showTfaStep") && gameJs.includes("result.need2fa"),
  "submit do login não abre o passo 2FA");
must(gameJs.includes("showTfaManage") && gameJs.includes('id="acc-2fa"'),
  "painel da conta sem gestão do 2FA");
must(gameJs.includes("account2faSetup") && gameJs.includes("account2faConfirm") &&
  gameJs.includes("account2faDisable"),
  "modal de gestão não chama as APIs de 2FA");

console.log("test_2fa: OK");
