/* mailer.js — envio de e-mail transacional (código de verificação).
 *
 * SMTP via nodemailer (qualquer provedor: domínio próprio, Zoho, Gmail com
 * app password, Cloudflare Email SMTP, etc.). Em TEST_SERVER o e-mail NÃO é
 * enviado de verdade: o código é logado no console e devolvido como `devCode`
 * para o fluxo de teste não depender de credenciais — a menos que
 * MAIL_REAL=1, que força envio real mesmo em TEST_SERVER (alpha: mantém as
 * facilidades de teste, mas a verificação de e-mail vale de verdade).
 * Em produção (TEST_SERVER=0) exige SMTP configurado; sem ele o envio falha
 * com motivo claro.
 *
 * Config (.env) — exemplo Cloudflare Email SMTP:
 *   SMTP_HOST=smtp.mx.cloudflare.net
 *   SMTP_PORT=465
 *   SMTP_SECURE=1    (1 = SSL direto na 465; 0 = STARTTLS na 587)
 *   SMTP_USER=api_token
 *   SMTP_PASS=<API Token da Cloudflare com permissão Email Sending>
 *   SMTP_FROM=suporte@global-idle.com
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "1";
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "");
const SMTP_FROM = String(process.env.SMTP_FROM || "no-reply@global-idle.com").trim();
const TEST_SERVER = process.env.TEST_SERVER === "1";
const MAIL_REAL = process.env.MAIL_REAL === "1";

/* Fundo do e-mail: pergaminho/selo de cera embutido como CID (o cliente de
 * e-mail não precisa buscar URL externa). Se o arquivo sumir do deploy, o
 * template cai pro marrom escuro e o e-mail sai mesmo assim. */
const EMAIL_BG_CID = "gi-mail-bg";
const EMAIL_BG_PATH = path.join(__dirname, "..", "imagens", "backconfirmemail.png");
const EMAIL_BG_ATTACHMENT = fs.existsSync(EMAIL_BG_PATH)
  ? [{ filename: "backconfirmemail.png", path: EMAIL_BG_PATH, cid: EMAIL_BG_CID }]
  : null;

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function configured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/* Casca do e-mail: tabela 600px com a arte de fundo. `background=` no <td>
 * cobre a maioria dos clientes; o bloco VML cobre o Outlook desktop (MSO),
 * que não renderiza CSS background. bgcolor é o fallback quando o cliente
 * bloqueia imagens embutidas. */
function mailShell(title, introHtml, code, outroHtml) {
  const bg = EMAIL_BG_ATTACHMENT ? "cid:" + EMAIL_BG_CID : "";
  return `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0d0805;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0805;">
<tr><td align="center" style="padding:28px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr>
  <td ${bg ? `background="${bg}"` : ""} bgcolor="#1a1208" align="center" valign="middle"
      style="background-image:url('${bg}');background-position:center;background-size:cover;padding:34px 24px 40px;">
    <!--[if gte mso 9]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:380px;">
      <v:fill type="frame" src="${bg}" color="#1a1208" />
      <v:textbox inset="0,0,0,0">
    <![endif]-->
    <div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:bold;
                  letter-spacing:6px;color:#e6b84c;text-shadow:0 2px 8px #000,0 0 18px rgba(230,184,76,.35);">GLOBAL-IDLE</div>
      <div style="font-family:Verdana,sans-serif;font-size:10px;letter-spacing:3px;color:#cbb98f;
                  margin-top:4px;text-shadow:0 1px 3px #000;">${escapeHtml(title)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:22px auto 0;">
        <tr><td style="background:#140c05;border:1px solid #8c6d32;padding:18px 30px;box-shadow:0 8px 24px rgba(0,0,0,.65);">
          <div style="font-family:Verdana,sans-serif;font-size:12px;color:#e8dfc9;line-height:1.6;">${introHtml}</div>
          <div style="margin:14px auto 6px;padding:10px 26px;display:inline-block;background:#0d0804;
                      border:1px solid #d4af37;font-family:'Courier New',monospace;font-size:30px;
                      font-weight:bold;letter-spacing:8px;color:#ffe680;text-shadow:0 1px 2px #000;">${escapeHtml(code)}</div>
          <div style="font-family:Verdana,sans-serif;font-size:11px;color:#cbb98f;line-height:1.6;">${outroHtml}</div>
        </td></tr>
      </table>
    </div>
    <!--[if gte mso 9]></v:textbox></v:fill></v:rect><![endif]-->
  </td>
</tr>
<tr><td align="center" style="padding:14px 10px 0;">
  <div style="font-family:Verdana,sans-serif;font-size:9px;color:#6b6152;line-height:1.5;">
    E-mail automático do Global-Idle — não responda.<br>
    Se você não fez esta solicitação, ignore esta mensagem.
  </div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function send(to, subject, text, html) {
  if (TEST_SERVER && !MAIL_REAL) {
    console.log("[mailer][mock]", subject, "para", to, "→", /:\s*(\d{6})/.exec(text)?.[1] || text);
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
    await transporter.sendMail({
      from: SMTP_FROM, to, subject, text, html,
      attachments: EMAIL_BG_ATTACHMENT || [],
    });
    return { ok: true };
  } catch (e) {
    console.error("[mailer] falha ao enviar e-mail:", e && e.message);
    return { ok: false, reason: String((e && e.message) || "smtp-error").slice(0, 200) };
  }
}

async function sendVerificationCode(to, code, login) {
  const subject = "Seu código de verificação — Global-Idle";
  const text = "Olá " + (login || "jogador") + ",\n\nSeu código de verificação é: " +
    code + "\n\nEle expira em 10 minutos.";
  const html = mailShell("VERIFICAÇÃO DE CONTA",
    "Olá <b>" + escapeHtml(login || "jogador") + "</b>,<br>" +
    "seu código de verificação da conta Global-Idle é:",
    code,
    "O código expira em <b>10 minutos</b>.<br>Se você não pediu este código, ignore este e-mail.");
  return send(to, subject, text, html);
}

async function sendRecoveryCode(to, code, login) {
  const subject = "Recuperação de senha — Global-Idle";
  const text = "Olá " + (login || "jogador") + ",\n\nSeu código de recuperação é: " +
    code + "\n\nEle expira em 10 minutos. Se você não pediu a recuperação, ignore este e-mail.";
  const html = mailShell("RECUPERAÇÃO DE SENHA",
    "Olá <b>" + escapeHtml(login || "jogador") + "</b>,<br>" +
    "pedimos a recuperação da sua senha. Seu código é:",
    code,
    "O código expira em <b>10 minutos</b>.<br>Se você não pediu a recuperação, ignore este e-mail.");
  return send(to, subject, text, html);
}

async function sendLoginCode(to, code, login) {
  const subject = "Código de acesso (2FA) — Global-Idle";
  const text = "Olá " + (login || "jogador") + ",\n\nSeu código de acesso é: " +
    code + "\n\nEle expira em 10 minutos. Se você não tentou entrar, troque sua senha.";
  const html = mailShell("CÓDIGO DE ACESSO",
    "Olá <b>" + escapeHtml(login || "jogador") + "</b>,<br>" +
    "alguém tentou entrar na sua conta Global-Idle. Seu código de acesso é:",
    code,
    "O código expira em <b>10 minutos</b>.<br>Se não foi você, <b>troque sua senha</b> — ela pode ter vazado.");
  return send(to, subject, text, html);
}

async function sendPhoneCode(to, code, login, phone) {
  const subject = "Confirmação de telefone — Global-Idle";
  const text = "Olá " + (login || "jogador") + ",\n\nSeu código para confirmar o telefone " +
    (phone || "") + " é: " + code + "\n\nEle expira em 10 minutos.";
  const html = mailShell("CONFIRMAÇÃO DE TELEFONE",
    "Olá <b>" + escapeHtml(login || "jogador") + "</b>,<br>" +
    "seu código para confirmar o telefone <b>" + escapeHtml(phone || "") + "</b> é:",
    code,
    "O código expira em <b>10 minutos</b>.<br>Se você não pediu este código, ignore este e-mail.");
  return send(to, subject, text, html);
}

module.exports = { configured, sendVerificationCode, sendRecoveryCode, sendLoginCode, sendPhoneCode };
