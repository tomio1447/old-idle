/* rmt.js — RMT (Real Money Trading): recompra oficial de Tibia Coins via PIX.
 *
 * Modelo: o servidor é o ÚNICO comprador. O jogador cria uma solicitação, as
 * TC são debitadas na hora (reserva = débito real em accounts.coins dentro da
 * mesma transação — nunca flag lógica, senão a TC reservada poderia ser
 * vendida no Market), vira ticket, admin analisa, paga via PIX manual, anexa
 * comprovante e confirma.
 *
 * Regras duras:
 *  - Valores monetários SEMPRE em centavos inteiros (bigint). Nunca float.
 *  - A cotação é capturada no POST e gravada como snapshot na request —
 *    mudanças posteriores de settings não afetam tickets abertos.
 *  - Transições de status só pelo mapa RMT_FLOW (UPDATE ... WHERE status=?).
 *  - Devolução de TC é idempotente por request (idem_released).
 *  - CPF/PIX viajam AES-256-GCM (RMT_ENC_KEY no .env) e saem mascarados.
 *  - Ledger reusa coin_ledger (kinds rmt_reserve / rmt_release / rmt_purchase).
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const kyc = require("./kyc");

const RECEIPT_DIR = process.env.RMT_RECEIPT_DIR ||
  path.join(__dirname, "data", "rmt_receipts");
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const RECEIPT_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };

/* ── Configurações (rmt_settings) ────────────────────────────────────── */
const RMT_DEFAULTS = {
  RMT_ENABLED: "1",
  RATE_UNIT_TC: "1000",            // 1.000 TC =
  RATE_VALUE_CENTS: "5000",        // R$ 50,00
  MINIMUM_SELL_AMOUNT: "1000",
  MAXIMUM_SELL_AMOUNT: "0",        // 0 = sem teto
  FEE_PERCENT: "0",                // % sobre o bruto
  FEE_FIXED_CENTS: "0",
  PROCESSING_ESTIMATED_HOURS: "48",
  MIN_ACCOUNT_AGE_DAYS: "0",
  MIN_REJECTED_FREE: "3",          // até N rejeições sem flag
  TREASURY_BALANCE_CENTS: "0",     // caixa reservado pelo admin
  DUAL_APPROVAL_CENTS: "0",        // >0 exige aprovador ≠ revisor acima do valor
};

function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

async function rmtSettings(db) {
  if (typeof db.rmtSettingsGet !== "function") return null;
  const stored = await db.rmtSettingsGet();
  const out = {};
  for (const k in RMT_DEFAULTS) out[k] = num(stored[k] !== undefined ? stored[k] : RMT_DEFAULTS[k], num(RMT_DEFAULTS[k], 0));
  return out;
}

function rmtSupported(db) { return typeof db.rmtTransact === "function"; }
/* Gate 18+/KYC no RMT — RMT_KYC_REQUIRED=0 desliga (legado/dev). */
function kycRequired() { return String(process.env.RMT_KYC_REQUIRED ?? "1") !== "0"; }
function unsupported() {
  return { code: 503, body: { ok: false, error: "RMT_UNSUPPORTED", msg: "RMT indisponível neste backend de dados." } };
}
function disabled() {
  return { code: 403, body: { ok: false, error: "RMT_DISABLED", msg: "O módulo RMT está desativado." } };
}

/* ── Criptografia de dados sensíveis (AES-256-GCM) ───────────────────── */
function encKey() {
  const raw = String(process.env.RMT_ENC_KEY || "");
  if (!raw) return null;
  // Aceita hex(64) ou qualquer string — deriva 32 bytes por sha256.
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : crypto.createHash("sha256").update(raw).digest();
}
function enc(plain) {
  const key = encKey();
  if (!key || plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const buf = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return "gcm:" + iv.toString("base64") + ":" + c.getAuthTag().toString("base64") + ":" + buf.toString("base64");
}
function dec(payload) {
  const key = encKey();
  try {
    if (!key || !payload || !String(payload).startsWith("gcm:")) return null;
    const [, iv, tag, data] = String(payload).split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch (e) { return null; }
}
/* Máscaras de exibição — o valor completo nunca sai do backend. */
function maskDocument(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 11) return "***.***.***-" + d.slice(-2);
  if (d.length === 14) return "**.***.***/****-" + d.slice(-2);
  return d ? "****" + d.slice(-2) : "";
}
function maskPix(v, type) {
  const s = String(v || "");
  if (!s) return "";
  if (type === "cpf" || type === "cnpj") return maskDocument(s);
  if (type === "email") { const [a, b] = s.split("@"); return (a || "").slice(0, 2) + "***@" + (b || ""); }
  if (type === "phone") return "(**) *****-" + s.replace(/\D/g, "").slice(-4);
  return s.slice(0, 6) + "…" + s.slice(-4); // chave aleatória
}

/* ── Permissões ──────────────────────────────────────────────────────── */
const RMT_PERMS = ["RMT_VIEW", "RMT_REVIEW", "RMT_APPROVE", "RMT_PAY", "RMT_REJECT", "RMT_CONFIG", "RMT_AUDIT"];
/* role=admin é super (per plano aprovado); admin_perms só restringe quando
 * preenchida (array JSON de permissões concedidas). */
function adminHasPerm(acc, perm) {
  if (!acc || acc.role !== "admin") return false;
  if (!acc.admin_perms) return true;
  try {
    const perms = typeof acc.admin_perms === "string" ? JSON.parse(acc.admin_perms) : acc.admin_perms;
    return Array.isArray(perms) ? perms.includes(perm) : true;
  } catch (e) { return true; }
}

/* ── Máquina de estados ──────────────────────────────────────────────── */
const RMT_FLOW = {
  pending: ["under_review", "cancelled"],
  under_review: ["approved", "rejected"],
  approved: ["payment_processing", "rejected"],
  payment_processing: ["paid", "under_review"],
  paid: [],
  rejected: [],
  cancelled: [],
};
const OPEN_STATUSES = ["pending", "under_review", "approved", "payment_processing"];

/* ── Cotação ─────────────────────────────────────────────────────────── */
function quote(tc, s) {
  const gross = Math.floor((tc * s.RATE_VALUE_CENTS) / s.RATE_UNIT_TC);
  const fee = Math.min(gross, Math.floor((gross * s.FEE_PERCENT) / 100) + s.FEE_FIXED_CENTS);
  return { gross, fee, net: gross - fee };
}

/* ── Ticket ──────────────────────────────────────────────────────────── */
function ticketNumber() {
  const d = new Date();
  const ymd = "" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  return "RMT-" + ymd + "-" + crypto.randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0");
}

/* ── Elegibilidade ───────────────────────────────────────────────────── */
async function rmtEligibility(db, acc, s) {
  const reasons = [];
  if (s.MIN_ACCOUNT_AGE_DAYS > 0 && acc.created_at) {
    const days = (Date.now() - new Date(acc.created_at).getTime()) / 86400000;
    if (days < s.MIN_ACCOUNT_AGE_DAYS) reasons.push("ACCOUNT_TOO_NEW");
  }
  if (typeof db.banActiveForAccount === "function") {
    const ban = await db.banActiveForAccount(acc.id).catch(() => null);
    if (ban) reasons.push("ACCOUNT_BANNED");
  }
  const rejected = await db.rmtRequestList({ accountId: acc.id, status: "rejected", limit: 50 });
  if (rejected.length >= Math.max(3, s.MIN_REJECTED_FREE)) reasons.push("REPEATED_REJECTIONS");
  const open = await db.rmtRequestList({ accountId: acc.id, statusIn: OPEN_STATUSES, limit: 20 });
  if (open.length >= 3) reasons.push("TOO_MANY_OPEN");
  return { eligible: reasons.length === 0, flagged: reasons.length > 0 && !reasons.includes("ACCOUNT_BANNED"), reasons };
}

/* ── Serialização segura para o jogador (dados mascarados) ───────────── */
function publicRequest(r) {
  return {
    id: Number(r.id), ticket: r.ticket_number, status: r.status,
    tcAmount: Number(r.tc_amount), rateUnitTc: Number(r.rate_unit_tc),
    rateValueCents: Number(r.rate_value_cents),
    grossCents: Number(r.gross_amount_cents), feeCents: Number(r.fee_amount_cents),
    netCents: Number(r.net_amount_cents),
    holderName: r.holder_name, pixKeyType: r.pix_key_type,
    pixKey: maskPix(dec(r.pix_key_enc), r.pix_key_type),
    document: maskDocument(dec(r.holder_document_enc)),
    rejectionReason: r.rejection_reason || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
    approvedAt: r.approved_at, paidAt: r.paid_at,
    characterName: r.character_name || null,
  };
}
/* Versão admin: mesma máscara (admin vê mascarado; chave completa nunca sai
 * pela API — quem paga consulta o banco/operador interno se precisar). */

async function notify(ctx, accountId, data) {
  try { if (ctx && typeof ctx.publishSync === "function") ctx.publishSync(accountId, "rmt", data); } catch (e) { }
}

/* ════════════════════ HANDLERS DO JOGADOR ═══════════════════════════ */

async function authAcc(db, body) {
  const acc = await db.findAccountByToken(String((body && body.token) || ""));
  if (!acc) return null;
  return acc;
}

async function playerDashboard(db, body) {
  if (!rmtSupported(db)) return unsupported();
  const acc = await authAcc(db, body); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const s = await rmtSettings(db);
  const sum = await db.rmtAccountSummary(acc.id);
  const profile = await db.rmtProfileGet(acc.id);
  const last = (await db.rmtRequestList({ accountId: acc.id, limit: 1 }))[0] || null;
  return { code: 200, body: {
    ok: true, enabled: !!s.RMT_ENABLED,
    coins: Number(acc.coins) || 0,
    rate: { unitTc: s.RATE_UNIT_TC, valueCents: s.RATE_VALUE_CENTS },
    fee: { percent: s.FEE_PERCENT, fixedCents: s.FEE_FIXED_CENTS },
    minSell: s.MINIMUM_SELL_AMOUNT, maxSell: s.MAXIMUM_SELL_AMOUNT,
    processingHours: s.PROCESSING_ESTIMATED_HOURS,
    summary: sum,
    profile: profile ? publicProfile(profile) : null,
    kycRequired: kycRequired(),
    lastRequest: last ? publicRequest(last) : null,
  } };
}

async function playerRate(db, body) {
  if (!rmtSupported(db)) return unsupported();
  const s = await rmtSettings(db);
  const tc = Math.max(0, Math.floor(Number(body && body.tc) || 0));
  const q = tc ? quote(tc, s) : null;
  return { code: 200, body: { ok: true, enabled: !!s.RMT_ENABLED,
    rate: { unitTc: s.RATE_UNIT_TC, valueCents: s.RATE_VALUE_CENTS },
    fee: { percent: s.FEE_PERCENT, fixedCents: s.FEE_FIXED_CENTS }, quote: q } };
}

async function playerHistory(db, body) {
  if (!rmtSupported(db)) return unsupported();
  const acc = await authAcc(db, body); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const rows = await db.rmtRequestList({ accountId: acc.id, limit: 100 });
  return { code: 200, body: { ok: true, requests: rows.map(publicRequest) } };
}

async function playerRequestGet(db, body, id) {
  if (!rmtSupported(db)) return unsupported();
  const acc = await authAcc(db, body); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const r = await db.rmtRequestGet(id);
  if (!r || Number(r.account_id) !== Number(acc.id)) return { code: 404, body: { ok: false, msg: "Ticket não encontrado" } };
  const logs = typeof db.rmtAdminLogs === "function" ? await db.rmtAdminLogs({ requestId: r.id, limit: 50 }) : [];
  const timeline = logs
    .filter(l => l.action !== "note" && l.action !== "receipt")
    .map(l => ({ action: l.action, from: l.old_status, to: l.new_status, at: l.created_at, description: l.description }));
  return { code: 200, body: { ok: true, request: publicRequest(r), timeline } };
}

/* Serialização do perfil de recebimento — sempre mascarado, nunca sai CPF/DOB cru. */
function publicProfile(p) {
  return {
    holderName: p.holder_name, pixKeyType: p.pix_key_type,
    pixKey: maskPix(dec(p.pix_key_enc), p.pix_key_type),
    document: maskDocument(dec(p.holder_document_enc)),
    birthDate: kyc.maskBirthDate(dec(p.birth_date_enc)),
    verificationStatus: p.verification_status,
    kyc: {
      failReason: p.kyc_fail_reason || null,
      provider: p.kyc_provider || null,
      checkedAt: p.kyc_checked_at || null,
      verifiedAt: p.verified_at || null,
    },
  };
}

async function playerProfileGet(db, body) {
  if (!rmtSupported(db)) return unsupported();
  const acc = await authAcc(db, body); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const p = await db.rmtProfileGet(acc.id);
  return { code: 200, body: { ok: true, kycRequired: kycRequired(),
    profile: p ? publicProfile(p) : null } };
}

const PIX_TYPES = ["cpf", "cnpj", "email", "phone", "random"];
async function playerProfilePut(db, body, ctx) {
  if (!rmtSupported(db)) return unsupported();
  const acc = await authAcc(db, body); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const holder = String(body.holder_name || "").trim().slice(0, 120);
  const doc = String(body.holder_document || "").replace(/\D/g, "");
  const keyType = String(body.pix_key_type || "").toLowerCase();
  const key = String(body.pix_key || "").trim().slice(0, 120);
  const kycOn = kycRequired();
  if (holder.length < 5) return { code: 400, body: { ok: false, msg: "Nome completo do titular inválido" } };
  if (!PIX_TYPES.includes(keyType)) return { code: 400, body: { ok: false, msg: "Tipo de chave PIX inválido" } };
  if (!key) return { code: 400, body: { ok: false, msg: "Chave PIX obrigatória" } };

  if (kycOn) {
    /* Regra dura do RMT: pessoa física 18+ com PIX no PRÓPRIO CPF — a chave
     * só pode ser cpf e tem que ser igual ao documento verificado. Sem isso
     * qualquer menor poderia sacar para um PIX de terceiro. */
    if (doc.length !== 11)
      return { code: 400, body: { ok: false, error: "CPF_ONLY", msg: "Informe o CPF do titular — o RMT só paga pessoa física." } };
    if (!kyc.cpfCheckDigits(doc))
      return { code: 400, body: { ok: false, error: "CPF_INVALID", msg: "CPF inválido — confira os dígitos." } };
    if (keyType !== "cpf")
      return { code: 400, body: { ok: false, error: "PIX_CPF_ONLY", msg: "A chave PIX de recebimento precisa ser o próprio CPF do titular." } };
    if (key.replace(/\D/g, "") !== doc)
      return { code: 400, body: { ok: false, error: "PIX_DOC_MISMATCH", msg: "A chave PIX (CPF) deve ser a mesma do titular." } };
  } else {
    if (doc.length !== 11 && doc.length !== 14) return { code: 400, body: { ok: false, msg: "CPF/CNPJ do titular inválido" } };
    if (keyType === "cpf" && key.replace(/\D/g, "") !== doc) return { code: 400, body: { ok: false, msg: "A chave CPF deve ser do próprio titular" } };
    if (keyType === "cpf" && key.replace(/\D/g, "").length !== 11) return { code: 400, body: { ok: false, msg: "Chave CPF inválida" } };
    if (keyType === "cnpj" && key.replace(/\D/g, "").length !== 14) return { code: 400, body: { ok: false, msg: "Chave CNPJ inválida" } };
    if (keyType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return { code: 400, body: { ok: false, msg: "Chave e-mail inválida" } };
  }

  /* ── Verificação 18+ (LGPD: consentimento explícito registrado) ── */
  let kycFields = { verification_status: "pending", kyc_provider: "none" };
  if (kycOn) {
    const dob = kyc.parseBirthDate(body.birth_date);
    if (!dob) return { code: 400, body: { ok: false, error: "DOB_INVALID", msg: "Data de nascimento inválida (DD/MM/AAAA)." } };
    if (!body.consent)
      return { code: 400, body: { ok: false, error: "CONSENT_REQUIRED", msg: "É preciso autorizar o tratamento dos dados (LGPD) para a verificação." } };

    const fields = {
      holder_name: holder, holder_document_enc: enc(doc),
      birth_date_enc: enc(dob.iso), cpf_hmac: kyc.cpfHmac(doc),
      pix_key_type: keyType, pix_key_enc: enc(key),
      kyc_provider: kyc.provider(),
      consent_version: kyc.CONSENT_VERSION, consent_ip: (ctx && ctx.ip) || "",
    };
    const save = async (extra) => db.rmtProfileUpsert(acc.id, Object.assign(fields, extra));

    /* Idade declarada — rejeita antes de qualquer consulta externa. */
    if (kyc.ageOn(dob.iso) < kyc.MIN_AGE) {
      await save({ verification_status: "rejected", kyc_fail_reason: "UNDERAGE" });
      return { code: 403, body: { ok: false, error: "UNDERAGE",
        msg: "O RMT exige titular maior de 18 anos.", profile: publicProfile(await db.rmtProfileGet(acc.id)) } };
    }
    /* Unicidade: um CPF só pode estar verificado em uma conta. */
    const dup = await db.rmtProfileByCpfHmac(kyc.cpfHmac(doc), acc.id);
    if (dup)
      return { code: 409, body: { ok: false, error: "CPF_IN_USE", msg: "Este CPF já está vinculado a outra conta." } };

    const chk = await kyc.checkIdentity({ cpf: doc, name: holder, birthDateIso: dob.iso, accountId: acc.id });
    kycFields = { verification_status: chk.status, kyc_provider: chk.provider,
      kyc_fail_reason: chk.status === "rejected" ? (chk.reason || "CHECK_FAILED") : null };
    const p = await save(kycFields);
    await notify(ctx, acc.id, { action: "profile-updated", kycStatus: p.verification_status });
    const msgs = {
      verified: "Identidade verificada — RMT liberado para venda.",
      pending: "Dados salvos e em análise — a venda libera após a verificação 18+.",
      rejected: "Verificação reprovada: " + (chk.reason || "os dados não conferem") + ".",
    };
    return { code: 200, body: { ok: chk.status !== "rejected", kycStatus: p.verification_status,
      msg: msgs[p.verification_status] || msgs.pending, profile: publicProfile(p) } };
  }

  const p = await db.rmtProfileUpsert(acc.id, {
    holder_name: holder, holder_document_enc: enc(doc),
    pix_key_type: keyType, pix_key_enc: enc(key),
    verification_status: "pending", kyc_provider: "legacy",
  });
  await notify(ctx, acc.id, { action: "profile-updated" });
  return { code: 200, body: { ok: true, msg: "Dados de recebimento salvos. Entrarão em análise na próxima solicitação.",
    profile: publicProfile(p) } };
}

async function playerCreate(db, body, ctx) {
  if (!rmtSupported(db)) return unsupported();
  const acc = await authAcc(db, body); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const s = await rmtSettings(db);
  if (!s.RMT_ENABLED) return disabled();
  const tc = Math.floor(Number(body.tc_amount) || 0);
  if (tc <= 0) return { code: 400, body: { ok: false, msg: "Quantidade de TC inválida" } };
  if (s.MINIMUM_SELL_AMOUNT > 0 && tc < s.MINIMUM_SELL_AMOUNT)
    return { code: 400, body: { ok: false, error: "BELOW_MIN", msg: "Mínimo de venda: " + s.MINIMUM_SELL_AMOUNT + " TC" } };
  if (s.MAXIMUM_SELL_AMOUNT > 0 && tc > s.MAXIMUM_SELL_AMOUNT)
    return { code: 400, body: { ok: false, error: "ABOVE_MAX", msg: "Máximo por solicitação: " + s.MAXIMUM_SELL_AMOUNT + " TC" } };
  const nonce = String(body.client_nonce || "").slice(0, 64);
  if (nonce) { // idempotência: mesmo nonce = mesma request, sem redebitar
    const dup = await db.rmtRequestByNonce(nonce);
    if (dup) return { code: 200, body: { ok: true, duplicated: true, request: publicRequest(dup) } };
  }
  const elig = await rmtEligibility(db, acc, s);
  if (elig.reasons.includes("ACCOUNT_BANNED") || elig.reasons.includes("ACCOUNT_TOO_NEW"))
    return { code: 403, body: { ok: false, error: elig.reasons[0], msg: "Conta inelegível para o RMT" } };
  const profile = await db.rmtProfileGet(acc.id);
  if (!profile || !profile.pix_key_enc || !profile.holder_name)
    return { code: 400, body: { ok: false, error: "NO_PIX_PROFILE", msg: "Cadastre seus dados PIX (Payment Information) antes de vender" } };
  if (kycRequired() && profile.verification_status !== "verified") {
    const st = profile.verification_status;
    if (st === "pending")
      return { code: 403, body: { ok: false, error: "KYC_PENDING",
        msg: "Sua identidade está em análise — a venda libera após a verificação 18+." } };
    if (st === "rejected")
      return { code: 403, body: { ok: false, error: "KYC_REJECTED",
        msg: profile.kyc_fail_reason === "UNDERAGE"
          ? "O RMT exige titular maior de 18 anos."
          : "Verificação reprovada — corrija os dados de recebimento e tente novamente." } };
    return { code: 403, body: { ok: false, error: "KYC_REQUIRED",
      msg: "Complete a verificação 18+ nos dados de recebimento antes de vender." } };
  }
  const q = quote(tc, s);
  if (q.net <= 0) return { code: 400, body: { ok: false, msg: "Valor líquido inválido para a quantidade informada" } };
  // Conta flagada entra direto em UNDER_REVIEW (não é rejeitada por indicador isolado).
  const initialStatus = elig.flagged ? "under_review" : "pending";
  const req = {
    ticket_number: ticketNumber(),
    client_nonce: nonce || ("auto-" + crypto.randomBytes(16).toString("hex")),
    account_id: Number(acc.id),
    character_id: Number(body.character_id) || null,
    character_name: String(body.character_name || "").slice(0, 32),
    login: acc.login,
    tc_amount: tc,
    rate_unit_tc: s.RATE_UNIT_TC, rate_value_cents: s.RATE_VALUE_CENTS,
    gross_amount_cents: q.gross, fee_amount_cents: q.fee, net_amount_cents: q.net,
    holder_name: profile.holder_name,
    holder_document_enc: profile.holder_document_enc, // snapshot imutável
    pix_key_type: profile.pix_key_type, pix_key_enc: profile.pix_key_enc,
  };
  try {
    const out = await db.rmtTransact((conn) => db.rmtRequestCreate(conn, req)
      .then((r) => {
        if (r.error) return r;
        if (initialStatus !== "pending")
          return db.rmtRequestTransition(conn, r.request.id, ["pending"], { status: initialStatus })
            .then((t) => (t.error ? t : { request: t.request, coins_after: r.coins_after }));
        return r;
      }));
    if (out.error === "INSUFFICIENT_COINS")
      return { code: 409, body: { ok: false, error: "INSUFFICIENT_COINS", msg: "Tibia Coins insuficientes" } };
    if (out.error) return { code: 500, body: { ok: false, error: out.error, msg: "Falha ao criar a solicitação" } };
    if (initialStatus === "under_review")
      await db.rmtAdminLog(null, { admin_login: "system", request_id: out.request.id,
        action: "auto-review", old_status: "pending", new_status: "under_review",
        description: "Flags: " + elig.reasons.join(","), ip: ctx && ctx.ip });
    await notify(ctx, acc.id, { action: "created", request: publicRequest(out.request) });
    return { code: 201, body: { ok: true, request: publicRequest(out.request),
      coins: out.coins_after, msg: "Solicitação criada. Suas TC foram reservadas." } };
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY")
      return { code: 409, body: { ok: false, error: "DUPLICATED", msg: "Solicitação duplicada" } };
    throw e;
  }
}

async function playerCancel(db, body, id, ctx) {
  if (!rmtSupported(db)) return unsupported();
  const acc = await authAcc(db, body); if (!acc) return { code: 401, body: { ok: false, msg: "Sessão inválida" } };
  const out = await db.rmtTransact(async (conn) => {
    const peek = await db.rmtRequestTransition(conn, id, null, {});
    if (!peek.request) return { error: "NOT_FOUND" };
    if (Number(peek.request.account_id) !== Number(acc.id)) return { error: "FORBIDDEN" };
    const t = await db.rmtRequestTransition(conn, id, ["pending"], { status: "cancelled" });
    if (t.error) return t;
    const rel = await db.rmtReleaseReserved(conn, id, acc.id, Number(t.previous.tc_amount),
      t.previous.ticket_number, acc.login);
    if (!rel.released) return { error: "RELEASE_FAILED" };
    return t;
  });
  if (out.error === "NOT_FOUND") return { code: 404, body: { ok: false, msg: "Ticket não encontrado" } };
  if (out.error === "FORBIDDEN") return { code: 403, body: { ok: false, msg: "Este ticket não é da sua conta" } };
  if (out.error === "BAD_STATE") return { code: 409, body: { ok: false, error: "BAD_STATE", msg: "Só é possível cancelar solicitações pendentes" } };
  if (out.error) return { code: 500, body: { ok: false, error: out.error } };
  await notify(ctx, acc.id, { action: "cancelled", request: publicRequest(out.request) });
  return { code: 200, body: { ok: true, request: publicRequest(out.request), msg: "Solicitação cancelada. TC devolvidas." } };
}

/* ════════════════════ HANDLERS DO ADMIN ══════════════════════════════ */

async function adminAuth(db, token, perm) {
  const acc = await db.findAccountByToken(String(token || ""));
  if (!acc) return { error: { code: 401, body: { ok: false, msg: "Sessão inválida" } } };
  if (acc.role !== "admin") return { error: { code: 403, body: { ok: false, error: "ADMIN_ONLY" } } };
  if (perm && !adminHasPerm(acc, perm)) return { error: { code: 403, body: { ok: false, error: "PERM_DENIED", msg: "Sem permissão " + perm } } };
  return { acc };
}

function adminRequestView(r, receipts) {
  const v = publicRequest(r);
  v.accountId = Number(r.account_id);
  v.characterId = r.character_id != null ? Number(r.character_id) : null;
  v.adminLogin = r.admin_login || null;
  v.adminNote = r.admin_note || null;
  v.receipts = receipts || [];
  return v;
}

async function adminDashboard(db, token) {
  const auth = await adminAuth(db, token, "RMT_VIEW"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const s = await rmtSettings(db);
  const t = await db.rmtTreasury();
  return { code: 200, body: { ok: true, treasury: t,
    cashCents: s.TREASURY_BALANCE_CENTS,
    availableCents: s.TREASURY_BALANCE_CENTS - t.committedCents,
    settings: s } };
}

async function adminList(db, token, q) {
  const auth = await adminAuth(db, token, "RMT_VIEW"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const rows = await db.rmtRequestList({
    status: q.status || undefined,
    accountId: Number(q.account_id) || undefined,
    limit: Number(q.limit) || 200,
  });
  return { code: 200, body: { ok: true, requests: rows.map((r) => adminRequestView(r)) } };
}

async function adminGet(db, token, id) {
  const auth = await adminAuth(db, token, "RMT_VIEW"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const r = await db.rmtRequestGet(id);
  if (!r) return { code: 404, body: { ok: false, msg: "Ticket não encontrado" } };
  const receipts = await db.rmtReceipts(r.id);
  const logs = await db.rmtAdminLogs({ requestId: r.id, limit: 100 });
  const acc = await db.findAccountById(r.account_id);
  const chars = acc && typeof db.listCharacters === "function" ? await db.listCharacters(acc.id).catch(() => []) : [];
  const history = await db.rmtRequestList({ accountId: r.account_id, limit: 50 });
  return { code: 200, body: { ok: true,
    request: adminRequestView(r, receipts),
    account: acc ? { id: acc.id, login: acc.login, coins: acc.coins, role: acc.role,
      createdAt: acc.created_at, characters: (chars || []).map(c => ({ id: c.id, name: c.name, level: c.level })) } : null,
    playerHistory: history.filter(h => Number(h.id) !== Number(r.id)).map(publicRequest),
    logs: logs.map(l => ({ action: l.action, from: l.old_status, to: l.new_status,
      by: l.admin_login, at: l.created_at, description: l.description, ip: l.ip_address })),
  } };
}

/* Transição genérica com log + devolução automática quando aplica. */
async function adminTransition(db, token, id, action, opts, ctx) {
  const perm = { review: "RMT_REVIEW", approve: "RMT_APPROVE", reject: "RMT_REJECT",
    payment: "RMT_PAY", "confirm-payment": "RMT_PAY" }[action];
  const auth = await adminAuth(db, token, perm); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const acc = auth.acc;
  const s = await rmtSettings(db);
  const out = await db.rmtTransact(async (conn) => {
    const cur = (await db.rmtRequestTransition(conn, id, null, {})).request;
    if (!cur) return { error: "NOT_FOUND" };
    const allowed = RMT_FLOW[cur.status] || [];
    let next = null, patch = {};
    if (action === "review" && allowed.includes("under_review")) next = "under_review";
    if (action === "approve" && allowed.includes("approved")) {
      // Caixa: aprovação só com disponibilidade financeira.
      const t = await db.rmtTreasury();
      if (s.TREASURY_BALANCE_CENTS - t.committedCents < Number(cur.net_amount_cents))
        return { error: "INSUFFICIENT_CASH" };
      if (s.DUAL_APPROVAL_CENTS > 0 && Number(cur.net_amount_cents) >= s.DUAL_APPROVAL_CENTS &&
          cur.admin_login && cur.admin_login === acc.login)
        return { error: "DUAL_APPROVAL_REQUIRED" };
      next = "approved"; patch = { approved_at: new Date() };
    }
    if (action === "reject" && allowed.includes("rejected")) {
      if (!String(opts.reason || "").trim()) return { error: "REASON_REQUIRED" };
      next = "rejected"; patch = { rejection_reason: String(opts.reason).slice(0, 400) };
    }
    if (action === "payment" && allowed.includes("payment_processing")) next = "payment_processing";
    if (action === "confirm-payment" && allowed.includes("paid")) {
      // Comprovante obrigatório antes de concluir.
      const rcpts = await db.rmtReceipts(id);
      if (!rcpts.length) return { error: "RECEIPT_REQUIRED" };
      next = "paid"; patch = { paid_at: new Date() };
    }
    if (!next) return { error: "BAD_STATE", current: cur.status };
    patch.status = next;
    patch.admin_id = Number(acc.id); patch.admin_login = acc.login;
    if (opts.note) patch.admin_note = String(opts.note).slice(0, 400);
    const t = await db.rmtRequestTransition(conn, id, [cur.status], patch);
    if (t.error) return t;
    // Rejeição ANTES do pagamento devolve as TC (idempotente). Após `paid` as
    // moedas são do servidor — reversão é operação excepcional manual.
    if (next === "rejected" && ["under_review", "approved"].includes(cur.status)) {
      const rel = await db.rmtReleaseReserved(conn, id, cur.account_id, Number(cur.tc_amount),
        cur.ticket_number, "");
      if (!rel.released) return { error: "RELEASE_FAILED" };
    }
    await db.rmtAdminLog(conn, { admin_id: acc.id, admin_login: acc.login, request_id: id,
      action, old_status: cur.status, new_status: next,
      description: opts.note || opts.reason || "", ip: ctx && ctx.ip });
    if (next === "paid")
      await conn.query(
        "INSERT INTO coin_ledger (account_id, login, kind, delta, coins_after, brl_cents, ref, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [cur.account_id, "", "rmt_purchase", 0, 0, Number(cur.net_amount_cents), cur.ticket_number,
         "Compra RMT " + cur.tc_amount + " TC por R$"]);
    return { request: t.request, previous: cur };
  });
  if (out.error === "NOT_FOUND") return { code: 404, body: { ok: false, msg: "Ticket não encontrado" } };
  if (out.error === "BAD_STATE") return { code: 409, body: { ok: false, error: "BAD_STATE", msg: "Transição não permitida do status " + out.current } };
  if (out.error === "INSUFFICIENT_CASH") return { code: 409, body: { ok: false, error: "INSUFFICIENT_CASH", msg: "Caixa insuficiente para aprovar" } };
  if (out.error === "DUAL_APPROVAL_REQUIRED") return { code: 409, body: { ok: false, error: "DUAL_APPROVAL_REQUIRED", msg: "Este valor exige aprovação de outro administrador" } };
  if (out.error === "REASON_REQUIRED") return { code: 400, body: { ok: false, error: "REASON_REQUIRED", msg: "Informe a justificativa" } };
  if (out.error === "RECEIPT_REQUIRED") return { code: 400, body: { ok: false, error: "RECEIPT_REQUIRED", msg: "Anexe o comprovante PIX antes de confirmar o pagamento" } };
  if (out.error) return { code: 500, body: { ok: false, error: out.error } };
  await notify(ctx, out.previous.account_id, { action: "status", request: publicRequest(out.request) });
  return { code: 200, body: { ok: true, request: adminRequestView(out.request) } };
}

/* ── Upload de comprovante (multipart mínimo, sem dependência) ───────── */
function parseMultipart(buf, boundary) {
  const bnd = Buffer.from("--" + boundary);
  const parts = [];
  let start = buf.indexOf(bnd);
  while (start !== -1) {
    const next = buf.indexOf(bnd, start + bnd.length);
    if (next === -1) break;
    const seg = buf.slice(start + bnd.length, next);
    const headEnd = seg.indexOf("\r\n\r\n");
    if (headEnd !== -1) {
      const head = seg.slice(0, headEnd).toString("latin1");
      let body = seg.slice(headEnd + 4);
      if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a)
        body = body.slice(0, body.length - 2);
      const name = /name="([^"]+)"/.exec(head);
      const file = /filename="([^"]*)"/.exec(head);
      const mime = /Content-Type:\s*([^\r\n]+)/i.exec(head);
      parts.push({ name: name && name[1], filename: file && file[1],
        mime: mime && mime[1].trim(), data: body });
    }
    start = next;
  }
  return parts;
}

async function adminReceiptUpload(db, token, id, req, rawBody, ctx) {
  const auth = await adminAuth(db, token, "RMT_PAY"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const target = await db.rmtRequestGet(id);
  if (!target) return { code: 404, body: { ok: false, msg: "Ticket não encontrado" } };
  if (!["approved", "payment_processing"].includes(target.status))
    return { code: 409, body: { ok: false, error: "BAD_STATE", msg: "Comprovante só após aprovado/em pagamento" } };
  const ct = String(req.headers["content-type"] || "");
  const m = /boundary=(.+)$/.exec(ct);
  if (!m || !rawBody || !rawBody.length) return { code: 400, body: { ok: false, msg: "Upload multipart esperado" } };
  if (rawBody.length > RECEIPT_MAX_BYTES + 64 * 1024)
    return { code: 413, body: { ok: false, msg: "Arquivo acima de 5MB" } };
  const parts = parseMultipart(rawBody, m[1].trim());
  const file = parts.find(p => p.filename && p.data && p.data.length);
  if (!file) return { code: 400, body: { ok: false, msg: "Nenhum arquivo enviado" } };
  const mime = (file.mime || "").toLowerCase();
  const ext = RECEIPT_MIME[mime];
  if (!ext) return { code: 400, body: { ok: false, msg: "Tipo de arquivo inválido (jpg/png/pdf)" } };
  if (file.data.length > RECEIPT_MAX_BYTES) return { code: 413, body: { ok: false, msg: "Arquivo acima de 5MB" } };
  const sha = crypto.createHash("sha256").update(file.data).digest("hex");
  const stored = "rmt-" + Number(id) + "-" + sha.slice(0, 12) + ext;
  try { fs.mkdirSync(RECEIPT_DIR, { recursive: true }); } catch (e) { }
  fs.writeFileSync(path.join(RECEIPT_DIR, stored), file.data);
  const rid = await db.rmtReceiptAdd({ request_id: Number(id), stored_name: stored,
    original_name: file.filename, sha256: sha, size_bytes: file.data.length,
    mime, uploaded_by: auth.acc.login });
  await db.rmtAdminLog(null, { admin_id: auth.acc.id, admin_login: auth.acc.login,
    request_id: id, action: "receipt", description: file.filename + " sha256:" + sha.slice(0, 16), ip: ctx && ctx.ip });
  return { code: 200, body: { ok: true, receipt: { id: rid, name: file.filename, sha256: sha } } };
}

/* Download do comprovante — admin apenas, nunca público. */
async function adminReceiptGet(db, token, receiptId, res) {
  const auth = await adminAuth(db, token, "RMT_VIEW");
  if (auth.error) return auth.error;
  const rows = await db.query("SELECT * FROM rmt_receipts WHERE id=?", [Number(receiptId)]);
  const r = rows && rows[0];
  if (!r) return { code: 404, body: { ok: false, msg: "Comprovante não encontrado" } };
  const file = path.join(RECEIPT_DIR, path.basename(r.stored_name));
  if (!fs.existsSync(file)) return { code: 404, body: { ok: false, msg: "Arquivo ausente" } };
  return { code: 200, file, mime: r.mime || "application/octet-stream" };
}

async function adminSettingsGet(db, token) {
  const auth = await adminAuth(db, token, "RMT_CONFIG"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  return { code: 200, body: { ok: true, settings: await rmtSettings(db), defaults: RMT_DEFAULTS, perms: RMT_PERMS } };
}

async function adminSettingsPut(db, token, body, ctx) {
  const auth = await adminAuth(db, token, "RMT_CONFIG"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const patch = body.settings || body;
  const allowed = Object.keys(RMT_DEFAULTS);
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    const v = Math.floor(Number(patch[k]));
    if (!Number.isFinite(v) || v < 0) return { code: 400, body: { ok: false, msg: "Valor inválido para " + k } };
    await db.rmtSettingsSet(k, String(v), auth.acc.login);
  }
  await db.rmtAdminLog(null, { admin_id: auth.acc.id, admin_login: auth.acc.login,
    action: "settings", description: JSON.stringify(patch).slice(0, 380), ip: ctx && ctx.ip });
  return { code: 200, body: { ok: true, settings: await rmtSettings(db) } };
}

async function adminAudit(db, token, q) {
  const auth = await adminAuth(db, token, "RMT_AUDIT"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const logs = await db.rmtAdminLogs({ requestId: Number(q.request_id) || undefined, limit: Number(q.limit) || 200 });
  return { code: 200, body: { ok: true, logs } };
}

/* ── Fila de verificação 18+/KYC (manual enquanto não há provedor) ────── */
async function adminProfileList(db, token, q) {
  const auth = await adminAuth(db, token, "RMT_VIEW"); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  const rows = await db.rmtProfileList({ status: q.status || undefined, limit: q.limit });
  const out = [];
  for (const p of rows) {
    const acc = await db.findAccountById(p.account_id).catch(() => null);
    const v = publicProfile(p);
    v.accountId = Number(p.account_id);
    v.login = acc ? acc.login : null;
    v.updatedAt = p.updated_at;
    out.push(v);
  }
  return { code: 200, body: { ok: true, profiles: out } };
}

async function adminProfileSetStatus(db, token, accountId, action, body, ctx) {
  const perm = action === "reject" ? "RMT_REJECT" : "RMT_REVIEW";
  const auth = await adminAuth(db, token, perm); if (auth.error) return auth.error;
  if (!rmtSupported(db)) return unsupported();
  if (action !== "verify" && action !== "reject")
    return { code: 400, body: { ok: false, msg: "Ação inválida" } };
  const status = action === "verify" ? "verified" : "rejected";
  const reason = action === "reject"
    ? String((body && body.reason) || "MANUAL_REJECT").slice(0, 200) : null;
  if (action === "reject" && !reason)
    return { code: 400, body: { ok: false, msg: "Informe o motivo da reprovação" } };
  const cur = await db.rmtProfileGet(accountId);
  if (!cur) return { code: 404, body: { ok: false, msg: "Perfil não encontrado" } };
  const p = await db.rmtProfileSetStatus(accountId, status,
    { reason, provider: "admin:" + auth.acc.login });
  await db.rmtAdminLog(null, { admin_id: auth.acc.id, admin_login: auth.acc.login,
    request_id: null, action: "kyc-" + action,
    description: "KYC acc#" + accountId + " → " + status + (reason ? " (" + reason + ")" : ""),
    ip: ctx && ctx.ip });
  const v = publicProfile(p);
  v.accountId = Number(p.account_id);
  return { code: 200, body: { ok: true, profile: v,
    msg: status === "verified" ? "KYC aprovado — conta liberada para vender." : "KYC reprovado." } };
}

module.exports = {
  rmtSupported, rmtSettings, RMT_DEFAULTS, RMT_PERMS, adminHasPerm, kycRequired,
  playerDashboard, playerRate, playerHistory, playerRequestGet,
  playerProfileGet, playerProfilePut, playerCreate, playerCancel,
  adminDashboard, adminList, adminGet, adminTransition,
  adminReceiptUpload, adminReceiptGet, adminSettingsGet, adminSettingsPut, adminAudit,
  adminProfileList, adminProfileSetStatus,
  maskDocument, maskPix, enc, dec, quote,
};
