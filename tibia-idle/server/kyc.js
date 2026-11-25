/* kyc.js — verificação 18+ (KYC leve) exigida para o RMT.
 *
 * O CPF não carrega data de nascimento — os dígitos verificadores só validam
 * o número. A conferência de idade acontece em duas camadas:
 *   1. Declarada: o jogador informa a data de nascimento junto do CPF e ela
 *      precisa dar 18+ ANTES de qualquer consulta externa.
 *   2. Provedor (KYC_PROVIDER): adapter que cruza CPF+nome+nascimento numa
 *      base real (Receita/reseller). Sem provedor contratado o status fica
 *      'pending' e a liberação é manual pelo admin (mesmo modelo do PIX).
 *
 * Regras:
 *  - RMT paga só pessoa física: documento = CPF válido (11 dígitos + DV).
 *  - 1 CPF = 1 conta (unicidade via HMAC — o CPF cru nunca é indexável).
 *  - Consentimento LGPD registrado (versão, data e IP).
 *  - KYC_PROVIDER=mock só é honrado em TEST_SERVER (dev local).
 */
"use strict";

const crypto = require("crypto");

const CONSENT_VERSION = "v1-2026-11";
const MIN_AGE = 18;

/* ── CPF: dígitos verificadores ──────────────────────────────────────── */
function cpfCheckDigits(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

/* ── Data de nascimento: DD/MM/AAAA ou ISO AAAA-MM-DD ────────────────── */
function parseBirthDate(raw) {
  const s = String(raw || "").trim();
  let y, mo, d;
  let m = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  }
  if (!y || y < 1900 || y > new Date().getUTCFullYear()) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // rejeita 31/02 etc.
  return { iso: y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0"), y, mo, d };
}

function ageOn(iso, at) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const now = at || new Date();
  let age = now.getUTCFullYear() - y;
  const mm = now.getUTCMonth() + 1, dd = now.getUTCDate();
  if (mm < m || (mm === m && dd < d)) age--;
  return age;
}

function maskBirthDate(iso) {
  const [y, m] = String(iso || "").split("-");
  return y && m ? "**/" + m + "/" + y : "";
}

/* ── Unicidade sem indexar CPF em claro (HMAC) ───────────────────────── */
function hmacKey() {
  const raw = String(process.env.KYC_HMAC_KEY || process.env.RMT_ENC_KEY || "");
  return crypto.createHash("sha256").update("kyc-hmac:" + raw).digest();
}
function cpfHmac(digits) {
  return crypto.createHmac("sha256", hmacKey()).update(String(digits)).digest("hex");
}

/* ── Provedor de consulta (adapter) ──────────────────────────────────── */
function testServer() {
  const t = String(process.env.TEST_SERVER || "").toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}
function provider() {
  const p = String(process.env.KYC_PROVIDER || "").toLowerCase().trim();
  if (p) return p === "mock" && !testServer() ? "none" : p; // mock nunca em prod
  return testServer() ? "mock" : "none";
}

/* Retorna { status: 'verified'|'pending'|'rejected', provider, ref, reason }
 * 'pending' cai na fila de verificação manual do admin.
 * 'rejected' carrega reason ('NAME_MISMATCH', 'DOC_NOT_FOUND', 'DOB_MISMATCH'...). */
async function checkIdentity() {
  const p = provider();
  if (p === "mock")
    return { status: "verified", provider: "mock", ref: "mock-" + crypto.randomBytes(8).toString("hex") };
  if (p === "none")
    return { status: "pending", provider: "none", ref: null };
  /* Adapters reais (idwall / CAF / BigDataCorp / Serpro DataValid): cada um
   * POSTa cpf+nome+nascimento e devolve match + data de nascimento real —
   * a idade deve ser conferida pela DATA RETORNADA, não pela declarada.
   * Enquanto nenhum for contratado, provedor desconhecido cai em 'pending'. */
  return { status: "pending", provider: p, ref: null };
}

module.exports = {
  CONSENT_VERSION, MIN_AGE,
  cpfCheckDigits, parseBirthDate, ageOn, maskBirthDate, cpfHmac,
  provider, checkIdentity,
};
