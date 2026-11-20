/* smser.js — envio de SMS transacional (confirmação/recuperação).
 *
 * DESATIVADO: a confirmação hoje é só por e-mail (ver mailer.js). Este
 * módulo fica pronto para plugar um gateway depois — basta configurar as
 * variáveis e implementar o `send` do provedor escolhido.
 *
 * Gateways previstos (config .env):
 *   SMS_PROVIDER=twilio|vonage|gateway   — escolhe a implementação
 *   TWILIO_SID= / TWILIO_TOKEN= / TWILIO_FROM=+1…   — Twilio REST
 *   VONAGE_KEY= / VONAGE_SECRET= / VONAGE_FROM=      — Vonage
 *   SMS_GATEWAY_URL=http://…:8080  SMS_GATEWAY_TOKEN= SMS_GATEWAY_FROM=
 *                                                  — sms-gate.app (Android self-hosted)
 *
 * Em TEST_SERVER o SMS NÃO é enviado de verdade: o código é logado no
 * console e devolvido como `devCode` (mesmo padrão do mailer).
 */
"use strict";

const SMS_PROVIDER = String(process.env.SMS_PROVIDER || "").trim().toLowerCase();
const TEST_SERVER = process.env.TEST_SERVER === "1";

function configured() {
  if (SMS_PROVIDER === "twilio")
    return !!(process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM);
  if (SMS_PROVIDER === "vonage")
    return !!(process.env.VONAGE_KEY && process.env.VONAGE_SECRET && process.env.VONAGE_FROM);
  if (SMS_PROVIDER === "gateway")
    return !!(process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_TOKEN);
  return false;
}

/* phone: E.164 ("+5511987654321"). Retorna {ok,mock?}|{ok:false,reason}. */
async function sendVerificationCode(phone, code, login) {
  const text = "Global-Idle: seu codigo de verificacao e " + code +
    " (expira em 10 min).";
  return send(phone, text);
}

async function sendRecoveryCode(phone, code, login) {
  const text = "Global-Idle: seu codigo de recuperacao e " + code +
    " (expira em 10 min). Se nao foi voce, ignore.";
  return send(phone, text);
}

async function send(phone, text) {
  if (TEST_SERVER) {
    console.log("[smser][mock] SMS para", phone, "→", text);
    return { ok: true, mock: true };
  }
  if (!configured()) return { ok: false, reason: "sms-unconfigured" };
  try {
    if (SMS_PROVIDER === "twilio") {
      const auth = Buffer.from(process.env.TWILIO_SID + ":" + process.env.TWILIO_TOKEN).toString("base64");
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM, Body: text }),
      });
      if (!r.ok) throw new Error("twilio " + r.status);
      return { ok: true };
    }
    if (SMS_PROVIDER === "gateway") {
      const r = await fetch(String(process.env.SMS_GATEWAY_URL).replace(/\/$/, "") + "/message", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.SMS_GATEWAY_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, phoneNumbers: [phone] }),
      });
      if (!r.ok) throw new Error("gateway " + r.status);
      return { ok: true };
    }
    return { ok: false, reason: "sms-provider-" + SMS_PROVIDER + "-not-implemented" };
  } catch (e) {
    console.error("[smser] falha ao enviar SMS:", e && e.message);
    return { ok: false, reason: String((e && e.message) || "sms-error").slice(0, 200) };
  }
}

module.exports = { configured, sendVerificationCode, sendRecoveryCode };
