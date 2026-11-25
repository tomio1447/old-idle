/* whatsapper.js — envio transacional via WhatsApp Cloud API (Meta oficial).
 *
 * Uso: código de verificação do vínculo de telefone e fallback de 2FA no
 * login. Modelo idêntico ao mailer.js: TEST_SERVER fica mockado até
 * WHATSAPP_REAL=1; sem credenciais retorna "wa-unconfigured".
 *
 * Meta Cloud API:
 *   POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
 *   Authorization: Bearer WHATSAPP_TOKEN
 *
 * Fora da janela de 24h de atendimento só se envia por TEMPLATE aprovado —
 * configure WHATSAPP_TEMPLATE (utility/auth com {{1}} = código). Templates
 * de autenticação com botão "copiar código" usam WHATSAPP_OTP_BUTTON=0 para
 * incluir o parâmetro do botão. Sem template caímos em texto livre, que só
 * chega se já houver conversa aberta (útil em dev/número de teste).
 *
 * Custo: cada mensagem de template é cobrada pela Meta — o contador diário
 * WHATSAPP_DAILY_CAP protege o orçamento (independente do cap de e-mail).
 */
"use strict";

const WA_API_VERSION = String(process.env.WHATSAPP_API_VERSION || "v21.0").trim();
const WA_DAILY_CAP = Math.max(1, Number(process.env.WHATSAPP_DAILY_CAP || 100) || 100);

function testServer() {
  const t = String(process.env.TEST_SERVER || "").toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}
function realSend() {
  const t = String(process.env.WHATSAPP_REAL || "").toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}
function configured() {
  return !!(String(process.env.WHATSAPP_TOKEN || "").trim() &&
    String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim());
}

/* ── Cota diária global (proteção de custo — cada msg cobra da Meta) ── */
let _waDay = null, _waCount = 0;
function quotaOk() {
  const day = new Date().toISOString().slice(0, 10);
  if (_waDay !== day) { _waDay = day; _waCount = 0; }
  if (_waCount >= WA_DAILY_CAP) return false;
  _waCount++;
  return true;
}

/* Normaliza para E.164 sem "+": BR por padrão quando vem formato local. */
function normalizePhone(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length >= 10 && d.length <= 11 && !d.startsWith("55")) d = "55" + d;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return /^[1-9]\d{9,14}$/.test(d) ? d : null;
}

async function sendVerificationCode(phone, code) {
  const text = "Global-Idle: seu código de verificação é " + code +
    " (expira em 10 min). Não compartilhe.";
  return send(phone, code, text);
}

async function sendLoginCode(phone, code, login) {
  const text = "Global-Idle: código de login para " + (login || "sua conta") +
    " é " + code + " (expira em 10 min). Se não foi você, mude sua senha.";
  return send(phone, code, text);
}

async function send(phone, code, fallbackText) {
  if (testServer() && !realSend()) {
    console.log("[whatsapper][mock] WhatsApp para", phone, "→", fallbackText);
    return { ok: true, mock: true };
  }
  if (!configured()) return { ok: false, reason: "wa-unconfigured" };
  if (!quotaOk()) return { ok: false, reason: "wa-daily-cap" };

  const to = normalizePhone(phone);
  if (!to) return { ok: false, reason: "wa-bad-phone" };

  const template = String(process.env.WHATSAPP_TEMPLATE || "").trim();
  const payload = { messaging_product: "whatsapp", to };
  if (template) {
    const components = [{ type: "body", parameters: [{ type: "text", text: code }] }];
    /* Template de autenticação com botão "copiar código": o parâmetro do
     * botão também recebe o código. WHATSAPP_OTP_BUTTON=<index> ativa. */
    const btnIdx = process.env.WHATSAPP_OTP_BUTTON;
    if (btnIdx !== undefined && btnIdx !== "")
      components.push({ type: "button", sub_type: "url", index: String(Number(btnIdx) || 0),
        parameters: [{ type: "text", text: code }] });
    payload.type = "template";
    payload.template = {
      name: template,
      language: { code: String(process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR").trim() },
      components,
    };
  } else {
    payload.type = "text";
    payload.text = { body: fallbackText };
  }

  try {
    const resp = await fetch(
      "https://graph.facebook.com/" + WA_API_VERSION + "/" +
      encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID) + "/messages",
      { method: "POST",
        headers: {
          Authorization: "Bearer " + String(process.env.WHATSAPP_TOKEN).trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload) });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.messages && data.messages.length)
      return { ok: true, id: data.messages[0].id };
    const err = (data && data.error) || {};
    console.warn("[whatsapper] falha Meta:", resp.status, JSON.stringify(err).slice(0, 300));
    return { ok: false, reason: "wa-meta-" + (err.code || resp.status),
      msg: err.message || "Meta recusou o envio" };
  } catch (e) {
    return { ok: false, reason: "wa-network" };
  }
}

module.exports = { configured, sendVerificationCode, sendLoginCode, normalizePhone };
