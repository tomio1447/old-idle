/* Turnstile — anti-bot na criação de conta.
 *
 * Servidor: /api/captcha/config expõe a sitekey pública; /api/register exige
 * captchaToken válido quando TURNSTILE_SECRET está configurada (siteverify
 * da Cloudflare), e passa o IP real do cliente (remoteip).
 * Cliente: modal de criar conta renderiza o widget sob demanda e envia o
 * token; falha reseta o widget (token é de uso único).
 * Sem chaves configuradas tudo é no-op — dev/local não trava.
 */
"use strict";
const fs = require("fs"), path = require("path");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
const accountJs = fs.readFileSync(path.join(__dirname, "..", "game", "js", "account-client.js"), "utf8");
const gameJs = fs.readFileSync(path.join(__dirname, "..", "game", "js", "game.js"), "utf8");
const envExample = fs.readFileSync(path.join(__dirname, "..", "server", ".env.example"), "utf8");
function must(ok, msg) { if (!ok) throw Error(msg); }

/* --- servidor: config + verificação -------------------------------------- */
must(serverSource.includes('TURNSTILE_SITEKEY = String(process.env.TURNSTILE_SITEKEY'),
  "TURNSTILE_SITEKEY não lida do env");
must(serverSource.includes('TURNSTILE_SECRET = String(process.env.TURNSTILE_SECRET'),
  "TURNSTILE_SECRET não lida do env");
must(serverSource.includes("challenges.cloudflare.com/turnstile/v0/siteverify"),
  "URL do siteverify ausente");
must(/url === "\/api\/captcha\/config"/.test(serverSource),
  "rota /api/captcha/config ausente");
must(/sitekey: TURNSTILE_SITEKEY, required: !!TURNSTILE_SECRET/.test(serverSource),
  "/api/captcha/config não devolve sitekey+required");

const regIdx = serverSource.indexOf("async function register(");
const regBlock = serverSource.slice(regIdx, regIdx + 3500);
must(/register\(db, body, remoteIp\)/.test(regBlock),
  "register não recebe remoteIp");
must(/if \(TURNSTILE_SECRET\)/.test(regBlock),
  "captcha só é exigido quando TURNSTILE_SECRET existe");
must(/verifyTurnstile\(body\.captchaToken \|\| body\["cf-turnstile-response"\], remoteIp\)/.test(regBlock),
  "register não verifica captchaToken via siteverify");
must(regBlock.indexOf("TURNSTILE_SECRET") < regBlock.indexOf("findAccountByLogin"),
  "captcha deve rodar ANTES da consulta de conta existente");
must(/x-forwarded-for/.test(serverSource) && /register\(db, body, remoteIp\)/.test(serverSource),
  "rota /api/register não passa o IP real (x-forwarded-for) pro register");

/* CSP precisa liberar script+iframe+XHR do challenges.cloudflare.com. */
const cspIdx = serverSource.indexOf("Content-Security-Policy");
const csp = serverSource.slice(cspIdx, cspIdx + 700);
must(/script-src[^;]*challenges\.cloudflare\.com/.test(csp),
  "CSP bloqueia o api.js do Turnstile (script-src)");
must(/frame-src[^;]*challenges\.cloudflare\.com/.test(csp),
  "CSP bloqueia o iframe do widget (frame-src)");
must(/connect-src[^;]*challenges\.cloudflare\.com/.test(csp),
  "CSP bloqueia as chamadas do widget (connect-src)");

/* --- cliente: config + widget + token no submit --------------------------- */
must(/accountCaptchaConfig[\s\S]{0,300}\/api\/captcha\/config/.test(accountJs),
  "accountCaptchaConfig não busca /api/captcha/config");
must(/captchaToken: captchaToken \|\| ""/.test(accountJs),
  "accountRegister não envia captchaToken");
must(gameJs.includes('id="acc-turnstile"'),
  "container do widget ausente no modal de criar conta");
must(/turnstile\/v0\/api\.js\?render=explicit/.test(gameJs),
  "loader do api.js do Turnstile ausente");
must(/window\.turnstile\.render\(box, \{ sitekey/.test(gameJs),
  "widget não é renderizado com a sitekey do servidor");
must(/window\.turnstile\.getResponse\(tsWidget\)/.test(gameJs),
  "submit não coleta o token do widget");
must(/window\.turnstile\.reset\(tsWidget\)/.test(gameJs),
  "falha no register não reseta o widget (token é de uso único)");
must(/accountRegister\(login, pass, email, displayName, captchaToken\)/.test(gameJs),
  "submit não repassa captchaToken pro accountRegister");

/* --- docs ----------------------------------------------------------------- */
must(envExample.includes("TURNSTILE_SITEKEY") && envExample.includes("TURNSTILE_SECRET"),
  ".env.example não documenta as chaves do Turnstile");

console.log("test_turnstile_register: OK");
