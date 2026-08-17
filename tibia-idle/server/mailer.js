/* mailer.js — envio de e-mail transacional (código de verificação).
 *
 * SMTP via nodemailer (qualquer provedor: domínio próprio, Zoho, Gmail com
 * app password, etc.). Em TEST_SERVER o e-mail NÃO é enviado de verdade:
 * o código é logado no console e devolvido como `devCode` para o fluxo de
 * teste não depender de credenciais. Em produção (TEST_SERVER=0) exige SMTP
 * configurado; sem ele o envio falha com motivo claro.
 *
 * Config (.env):
 *   SMTP_HOST=       ex.: smtp.seudominio.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=0    (1 para SSL direto, ex.: porta 465)
 *   SMTP_USER=       usuário/e-mail remetente
 *   SMTP_PASS=       senha/app password
 *   SMTP_FROM=no-reply@global-idle.com
 */
"use strict";

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "1";
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "");
const SMTP_FROM = String(process.env.SMTP_FROM || "no-reply@global-idle.com").trim();
const TEST_SERVER = process.env.TEST_SERVER === "1";

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function configured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

async function sendVerificationCode(to, code, login) {
  const subject = "Seu código de verificação — Global-Idle";
  const text = "Olá " + (login || "jogador") + ",\n\nSeu código de verificação é: " +
    code + "\n\nEle expira em 10 minutos.";
  const html = "<p>Olá <b>" + escapeHtml(login || "jogador") + "</b>,</p>" +
    "<p>Seu código de verificação da conta Global-Idle é:</p>" +
    "<p style=\"font-size:26px;letter-spacing:6px;font-weight:bold\">" + escapeHtml(code) + "</p>" +
    "<p>Ele expira em 10 minutos. Se você não pediu este código, ignore este e-mail.</p>";

  if (TEST_SERVER) {
    console.log("[mailer][mock] código de verificação para", to, "→", code);
    return { ok: true, mock: true };
  }
  if (!configured()) {
    return { ok: false, reason: "smtp-unconfigured" };
  }
  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { ok: true };
  } catch (e) {
    console.error("[mailer] falha ao enviar e-mail:", e && e.message);
    return { ok: false, reason: String((e && e.message) || "smtp-error").slice(0, 200) };
  }
}

module.exports = { configured, sendVerificationCode };
