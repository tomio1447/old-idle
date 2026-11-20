/* test_rmt.js — RMT (recompra de TC via PIX): backend financeiro.
 *
 * Cobre os casos de aceitação possíveis sem MySQL real: FakeDb emula a
 * semântica do MysqlStore (lock FOR UPDATE + UPDATE condicional). A garantia
 * transacional real fica no SQL (`coins=coins-? WHERE coins>=?` + COMMIT).
 *
 * Casos: cotação inteira em centavos, cripto/máscara, permissões, criar sem
 * saldo, criar com saldo, nonce duplicado, cancelar devolve 1x, cotação
 * imutável, transição inválida, rejeição devolve 1x, confirm-payment exige
 * comprovante, caixa insuficiente bloqueia aprovação, permissão negada,
 * manipulação de valores pelo cliente ignorada.
 */
"use strict";
const assert = require("assert");
const path = require("path");
process.env.RMT_ENC_KEY = "test-key-0123456789abcdef";
const rmt = require(path.join(__dirname, "..", "server", "rmt.js"));

/* ── FakeDb: mesma semântica do MysqlStore.rmt* ──────────────────────── */
function fakeDb(opts) {
  opts = opts || {};
  const state = {
    accounts: new Map(), requests: new Map(), profiles: new Map(),
    ledger: [], logs: [], receipts: new Map(), settings: {},
    seq: 0,
  };
  const db = {
    _state: state,
    async findAccountByToken(t) { return state.accounts.get(t) || null; },
    async findAccountById(id) { for (const a of state.accounts.values()) if (a.id === id) return a; return null; },
    async banActiveForAccount() { return null; },
    async rmtSettingsGet() { return state.settings; },
    async rmtSettingsSet(k, v) { state.settings[k] = String(v); return true; },
    async rmtProfileGet(accId) { return state.profiles.get(accId) || null; },
    async rmtProfileUpsert(accId, f) { const p = Object.assign({ account_id: accId, verification_status: "pending" }, f); state.profiles.set(accId, p); return p; },
    async rmtTransact(fn) { const conn = { query: async () => [[{}]] }; return fn(conn); },
    async rmtRequestCreate(conn, req) {
      const acc = [...state.accounts.values()].find((a) => a.id === req.account_id);
      if (!acc) return { error: "ACCOUNT_NOT_FOUND" };
      if ((acc.coins || 0) < req.tc_amount) return { error: "INSUFFICIENT_COINS" }; // UPDATE condicional
      acc.coins -= req.tc_amount;
      const row = Object.assign({ id: ++state.seq, status: "pending", idem_released: 0, created_at: new Date(), updated_at: new Date() }, req);
      state.requests.set(row.id, row);
      state.ledger.push({ account_id: acc.id, kind: "rmt_reserve", delta: -req.tc_amount, coins_after: acc.coins, ref: req.ticket_number });
      return { request: row, coins_after: acc.coins };
    },
    async rmtRequestGet(id) { return state.requests.get(Number(id)) || null; },
    async rmtRequestByNonce(n) { for (const r of state.requests.values()) if (r.client_nonce === n) return r; return null; },
    async rmtRequestList(f) {
      let rows = [...state.requests.values()];
      if (f.accountId) rows = rows.filter((r) => r.account_id === f.accountId);
      if (f.status) rows = rows.filter((r) => r.status === f.status);
      if (f.statusIn) rows = rows.filter((r) => f.statusIn.includes(r.status));
      return rows.slice(0, f.limit || 100);
    },
    async rmtRequestTransition(conn, id, fromStates, patch) {
      const cur = state.requests.get(Number(id));
      if (!cur) return { error: "NOT_FOUND" };
      const prev = Object.assign({}, cur); // como o MySQL: objetos são cópias
      if (fromStates && fromStates.length && !fromStates.includes(cur.status)) return { error: "BAD_STATE", current: cur.status };
      Object.assign(cur, patch);
      return { request: Object.assign({}, cur), previous: prev };
    },
    async rmtReleaseReserved(conn, requestId, accountId, tcAmount, ticket) {
      const r = state.requests.get(Number(requestId));
      if (!r || r.idem_released) return { released: false };
      r.idem_released = 1;
      const acc = [...state.accounts.values()].find((a) => a.id === accountId);
      acc.coins += tcAmount;
      state.ledger.push({ account_id: accountId, kind: "rmt_release", delta: tcAmount, coins_after: acc.coins, ref: ticket });
      return { released: true };
    },
    async rmtAdminLog(conn, row) { state.logs.push(row); },
    async rmtAdminLogs() { return state.logs; },
    async rmtReceipts(id) { return state.receipts.get(Number(id)) || []; },
    async rmtReceiptAdd(row) { const arr = state.receipts.get(Number(row.request_id)) || []; arr.push(row); state.receipts.set(Number(row.request_id), arr); return arr.length; },
    async rmtAccountSummary() { return {}; },
    async rmtTreasury() {
      let committed = 0;
      for (const r of state.requests.values())
        if (["approved", "payment_processing"].includes(r.status)) committed += r.net_amount_cents;
      return { committedCents: committed };
    },
    async listCharacters() { return []; },
  };
  for (const [tok, acc] of Object.entries(opts.accounts || {})) state.accounts.set(tok, acc);
  return db;
}

const ADMIN = { id: 9, login: "gm", role: "admin", admin_perms: null };
const RESTRICTED = { id: 8, login: "junior", role: "admin", admin_perms: JSON.stringify(["RMT_VIEW"]) };
const USER = { id: 1, login: "p1", role: "user", coins: 100000, created_at: new Date(Date.now() - 90 * 864e5) };
const TOK = "tok-user", TOKA = "tok-admin", TOKR = "tok-restricted";

async function mk(opts) {
  const db = fakeDb({ accounts: { [TOK]: Object.assign({}, USER), [TOKA]: ADMIN, [TOKR]: RESTRICTED } });
  if (opts && opts.settings) for (const k in opts.settings) await db.rmtSettingsSet(k, String(opts.settings[k]));
  if (opts && opts.profile !== false)
    await db.rmtProfileUpsert(1, { holder_name: "Jogador Um", holder_document_enc: rmt.enc("12345678901"), pix_key_type: "cpf", pix_key_enc: rmt.enc("12345678901") });
  return db;
}

(async () => {
  /* ── cotação: centavos inteiros, sem float ── */
  const q = rmt.quote(50000, { RATE_UNIT_TC: 1000, RATE_VALUE_CENTS: 1000, FEE_PERCENT: 0, FEE_FIXED_CENTS: 0 });
  assert.deepStrictEqual(q, { gross: 50000, fee: 0, net: 50000 });
  const q2 = rmt.quote(333, { RATE_UNIT_TC: 1000, RATE_VALUE_CENTS: 999, FEE_PERCENT: 10, FEE_FIXED_CENTS: 5 });
  assert.strictEqual(q2.gross, Math.floor(333 * 999 / 1000));
  assert.strictEqual(q2.net, q2.gross - q2.fee);
  assert.ok(Number.isInteger(q2.net));

  /* ── cripto + máscaras ── */
  const e = rmt.enc("12345678901");
  assert.strictEqual(rmt.dec(e), "12345678901");
  assert.strictEqual(rmt.maskDocument("12345678901"), "***.***.***-01");
  assert.strictEqual(rmt.maskPix("a@b.com", "email").includes("***@"), true);
  assert.ok(!String(e).includes("12345678901"));

  /* ── permissões ── */
  assert.strictEqual(rmt.adminHasPerm(ADMIN, "RMT_PAY"), true);
  assert.strictEqual(rmt.adminHasPerm(RESTRICTED, "RMT_PAY"), false);
  assert.strictEqual(rmt.adminHasPerm(RESTRICTED, "RMT_VIEW"), true);
  assert.strictEqual(rmt.adminHasPerm(USER, "RMT_VIEW"), false);

  /* ── criar sem saldo → recusado, sem débito ── */
  let db = await mk({ settings: { TREASURY_BALANCE_CENTS: "999999999" } });
  db._state.accounts.get(TOK).coins = 500;
  let r = await rmt.playerCreate(db, { token: TOK, tc_amount: 1000, client_nonce: "n1" }, {});
  assert.strictEqual(r.code, 409);
  assert.strictEqual(db._state.accounts.get(TOK).coins, 500);
  assert.strictEqual(db._state.requests.size, 0);

  /* ── criar com saldo → reserva + ledger + cotação snapshot ── */
  db = await mk({ settings: { TREASURY_BALANCE_CENTS: "999999999" } });
  r = await rmt.playerCreate(db, { token: TOK, tc_amount: 50000, client_nonce: "n2" }, {});
  assert.strictEqual(r.code, 201);
  assert.strictEqual(r.body.request.status, "pending");
  assert.strictEqual(r.body.request.netCents, 50000);
  assert.strictEqual(db._state.accounts.get(TOK).coins, 50000);
  assert.strictEqual(db._state.ledger[0].kind, "rmt_reserve");

  /* nonce repetido = mesma request, sem redebito */
  const r2 = await rmt.playerCreate(db, { token: TOK, tc_amount: 50000, client_nonce: "n2" }, {});
  assert.strictEqual(r2.body.duplicated, true);
  assert.strictEqual(db._state.accounts.get(TOK).coins, 50000);
  assert.strictEqual(db._state.requests.size, 1);

  /* manipulação do cliente ignorada: valores enviados não entram no snapshot */
  r = await rmt.playerCreate(db, { token: TOK, tc_amount: 1000, client_nonce: "n3",
    gross_amount_cents: 999999999, rate_value_cents: 1, net_amount_cents: 999999999 }, {});
  assert.strictEqual(r.code, 201);
  assert.strictEqual(r.body.request.netCents, 1000); // 1000 TC = R$10,00 = 1000 cents
  assert.strictEqual(r.body.request.rateValueCents, 1000);

  /* ── cancelar devolve exatamente 1x ── */
  const reqId = r.body.request.id;
  const c1 = await rmt.playerCancel(db, { token: TOK }, reqId, {});
  assert.strictEqual(c1.code, 200);
  assert.strictEqual(db._state.accounts.get(TOK).coins, 50000);
  const c2 = await rmt.playerCancel(db, { token: TOK }, reqId, {});
  assert.strictEqual(c2.code, 409); // BAD_STATE, não devolve de novo
  assert.strictEqual(db._state.accounts.get(TOK).coins, 50000);
  assert.strictEqual(db._state.ledger.filter(l => l.kind === "rmt_release").length, 1);

  /* jogador não cancela ticket alheio */
  db = await mk({ settings: { TREASURY_BALANCE_CENTS: "999999999" } });
  db._state.accounts.set("tok-other", { id: 2, login: "p2", role: "user", coins: 0 });
  r = await rmt.playerCreate(db, { token: TOK, tc_amount: 1000, client_nonce: "x1" }, {});
  const foreign = await rmt.playerCancel(db, { token: "tok-other" }, r.body.request.id, {});
  assert.strictEqual(foreign.code, 403);
  assert.strictEqual((await db.rmtRequestGet(r.body.request.id)).status, "pending");

  /* ── cotação imutável no ticket ── */
  r = await rmt.playerCreate(db, { token: TOK, tc_amount: 1000, client_nonce: "x2" }, {});
  await db.rmtSettingsSet("RATE_VALUE_CENTS", "500"); // admin muda a cotação depois
  const snap = await db.rmtRequestGet(r.body.request.id);
  assert.strictEqual(Number(snap.net_amount_cents), 1000); // request conserva a original

  /* ── fluxo admin: review → approve → payment → receipt → confirm ── */
  const rid = r.body.request.id;
  let t = await rmt.adminTransition(db, TOKA, rid, "approve", {}, {});
  assert.strictEqual(t.code, 409); // aprovar direto de pending = BAD_STATE
  t = await rmt.adminTransition(db, TOKA, rid, "review", {}, {});
  assert.strictEqual(t.code, 200);
  /* caixa insuficiente bloqueia aprovação */
  await db.rmtSettingsSet("TREASURY_BALANCE_CENTS", "0");
  t = await rmt.adminTransition(db, TOKA, rid, "approve", {}, {});
  assert.strictEqual(t.code, 409);
  assert.strictEqual(t.body.error, "INSUFFICIENT_CASH");
  await db.rmtSettingsSet("TREASURY_BALANCE_CENTS", "100000");
  t = await rmt.adminTransition(db, TOKA, rid, "approve", {}, {});
  assert.strictEqual(t.code, 200);
  /* confirm-payment sem comprovante → bloqueado */
  t = await rmt.adminTransition(db, TOKA, rid, "payment", {}, {});
  assert.strictEqual(t.code, 200);
  t = await rmt.adminTransition(db, TOKA, rid, "confirm-payment", {}, {});
  assert.strictEqual(t.code, 400);
  assert.strictEqual(t.body.error, "RECEIPT_REQUIRED");
  await db.rmtReceiptAdd({ request_id: rid, original_name: "pix.pdf", sha256: "abc" });
  t = await rmt.adminTransition(db, TOKA, rid, "confirm-payment", {}, {});
  assert.strictEqual(t.code, 200);
  assert.strictEqual(t.body.request.status, "paid");
  /* segunda confirmação = estado terminal, bloqueada */
  t = await rmt.adminTransition(db, TOKA, rid, "confirm-payment", {}, {});
  assert.strictEqual(t.code, 409);

  /* ── rejeição devolve TC uma única vez ── */
  r = await rmt.playerCreate(db, { token: TOK, tc_amount: 2000, client_nonce: "x3" }, {});
  const rid2 = r.body.request.id;
  const before = db._state.accounts.get(TOK).coins;
  await rmt.adminTransition(db, TOKA, rid2, "review", {}, {});
  t = await rmt.adminTransition(db, TOKA, rid2, "reject", { reason: "suspeita" }, {});
  assert.strictEqual(t.code, 200);
  assert.strictEqual(db._state.accounts.get(TOK).coins, before + 2000);
  const ticket2 = (await db.rmtRequestGet(rid2)).ticket_number;
  const rels = db._state.ledger.filter(l => l.kind === "rmt_release" && l.ref === ticket2);
  assert.strictEqual(rels.length, 1);
  /* rejeitar sem motivo → exigido */
  r = await rmt.playerCreate(db, { token: TOK, tc_amount: 1000, client_nonce: "x4" }, {});
  await rmt.adminTransition(db, TOKA, r.body.request.id, "review", {}, {});
  t = await rmt.adminTransition(db, TOKA, r.body.request.id, "reject", {}, {});
  assert.strictEqual(t.code, 400);

  /* ── permissão negada ── */
  t = await rmt.adminTransition(db, TOKR, rid2, "approve", {}, {});
  assert.strictEqual(t.code, 403);
  t = await rmt.adminTransition(db, "tok-user", rid2, "approve", {}, {});
  assert.strictEqual(t.code, 403);

  /* ── dados sensíveis nunca saem em claro ── */
  const pub = JSON.stringify(r.body.request);
  assert.ok(!pub.includes("12345678901"));

  console.log("ok: RMT — cotação em centavos, reserva atômica, nonce idempotente, cancel/reject devolvem 1x, cotação imutável, state machine, comprovante obrigatório, caixa, permissões, dados mascarados.");
})().catch((e) => { console.error(e); process.exit(1); });
