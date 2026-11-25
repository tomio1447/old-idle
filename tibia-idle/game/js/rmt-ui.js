/* rmt-ui.js — aba RMT dentro do Market (recompra oficial de TC via PIX).
 *
 * Renderizada dentro do mesmo #market-body das demais abas — identidade
 * visual do jogo (panel, sm/primary, tiny, tabelas do market).
 * Nunca envia valores calculados: o backend recalcula cotação/taxas; o
 * cliente só manda tc_amount + client_nonce (idempotência de double-click).
 */
"use strict";

let _rmtDash = null;          // cache do /api/rmt/dashboard
let _rmtNonce = null;         // nonce da tentativa atual (uuid por venda)
let _rmtView = null;          // null = dashboard | {ticket: id} = detalhe
let _rmtBusy = false;
let _rmtSyncBound = false;

function fmtBrl(cents) {
  return "R$ " + (Number(cents || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTc(n) { return (typeof fmtFull === "function" ? fmtFull(n) : Number(n || 0).toLocaleString("pt-BR")) + " TC"; }
function rmtStatusLabel(s) {
  return ({ pending: "Pendente", under_review: "Em análise", approved: "Aprovada",
    payment_processing: "Pagamento em processamento", paid: "Paga",
    rejected: "Reprovada", cancelled: "Cancelada" })[s] || s;
}
function rmtStatusClass(s) {
  return s === "paid" ? "rmt-st-paid" : s === "rejected" || s === "cancelled" ? "rmt-st-bad"
    : s === "approved" || s === "payment_processing" ? "rmt-st-warn" : "rmt-st-open";
}
async function rmtApi(method, path, body) {
  const r = await _api(method, path, body || null, sessionToken());
  return (r && r.data) || { ok: false, msg: "Sem resposta do servidor" };
}

/* SSE: backend publica "rmt" em cada mudança de status — atualiza a aba se aberta. */
function rmtBindSync() {
  if (_rmtSyncBound) return;
  _rmtSyncBound = true;
  window.addEventListener("tibia-idle-sync-rmt", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "created") toast && toast("Solicitação RMT criada: " + (d.request && d.request.ticket), "good");
    if (d.action === "status" && d.request)
      toast && toast("RMT " + d.request.ticket + ": " + rmtStatusLabel(d.request.status),
        d.request.status === "rejected" ? "bad" : "good");
    if (d.action === "cancelled") toast && toast("Solicitação RMT cancelada — TC devolvidas.", "good");
    const body = document.getElementById("market-body");
    if (body && document.querySelector('[data-mtab="rmt"].primary')) {
      _rmtDash = null; renderRmt(body);
    }
  });
}

async function rmtLoadDash(force) {
  if (_rmtDash && !force) return _rmtDash;
  const r = await rmtApi("GET", "/api/rmt/dashboard");
  _rmtDash = r.ok ? r : null;
  return r;
}

function renderRmt(body) {
  rmtBindSync();
  _rmtView = null;
  body.innerHTML = '<div class="tiny dim">Carregando RMT…</div>';
  rmtLoadDash(true).then((r) => {
    if (!r.ok) {
      body.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "RMT indisponível no momento."}</div>`;
      return;
    }
    renderRmtHome(body, r);
  });
}

/* ── Tela principal: dashboard + venda + PIX + histórico ─────────────── */
function renderRmtHome(body, d) {
  const sum = d.summary || {};
  const estCents = d.rate && d.rate.unitTc > 0
    ? Math.floor(((Number(d.coins) || 0) * d.rate.valueCents) / d.rate.unitTc) : 0;
  body.innerHTML = `
    <div class="rmt-grid">
      <div class="rmt-card"><div class="tiny dim">TC DISPONÍVEIS</div><div class="rmt-big">${fmtTc(d.coins)}</div></div>
      <div class="rmt-card"><div class="tiny dim">COTAÇÃO</div><div class="rmt-big">${fmtTc(d.rate.unitTc)} = ${fmtBrl(d.rate.valueCents)}</div></div>
      <div class="rmt-card"><div class="tiny dim">VALOR ESTIMADO DO SALDO</div><div class="rmt-big" style="color:#9ce84a">${fmtBrl(estCents)}</div></div>
      <div class="rmt-card"><div class="tiny dim">RESERVADAS / PENDENTES</div><div class="rmt-big">${fmtTc(sum.reservedTc)} · ${fmtBrl(sum.pendingCents)}</div></div>
    </div>
    ${!d.enabled ? '<div class="tiny" style="color:#ff9a6a;margin:6px 0">O módulo RMT está temporariamente desativado.</div>' : ""}
    ${d.kycRequired && (!d.profile || d.profile.verificationStatus !== "verified") ? `
      <div class="tiny" style="margin:6px 0;padding:8px 10px;border:1px solid rgba(234,179,8,.4);border-radius:4px;background:rgba(234,179,8,.1);color:#fde68a">
        🔒 <b>Vendas bloqueadas:</b> complete a verificação 18+ em "Payment Information" abaixo — exigimos CPF do titular,
        data de nascimento e recebimento via PIX no próprio CPF.</div>` : ""}
    <div class="rmt-cols">
      <div>
        <div class="rmt-sec-title">VENDER TIBIA COINS</div>
        <div class="rmt-sell-box">
          <label class="tiny">Quantidade de TC</label>
          <input id="rmt-tc" type="number" min="${d.minSell || 0}" step="100" placeholder="${d.minSell || 0}" style="width:140px">
          <div id="rmt-quote" class="tiny dim" style="margin-top:6px">Informe a quantidade para simular.</div>
          <button class="sm primary" id="rmt-sell" style="margin-top:8px">SELL TIBIA COINS</button>
        </div>
        <div class="rmt-sec-title" style="margin-top:14px">PAYMENT INFORMATION</div>
        <div id="rmt-profile"></div>
      </div>
      <div>
        <div class="rmt-sec-title">MINHAS SOLICITAÇÕES</div>
        <div id="rmt-history"><div class="tiny dim">Carregando…</div></div>
      </div>
    </div>`;
  renderRmtProfile(body, d.profile, d);
  renderRmtHistory(body);
  rmtWireSell(body, d);
}

/* ── Formulário de venda + confirmação ───────────────────────────────── */
function rmtWireSell(body, d) {
  const input = body.querySelector("#rmt-tc");
  const out = body.querySelector("#rmt-quote");
  const btn = body.querySelector("#rmt-sell");
  let debounce = null;
  const simulate = () => {
    const tc = Math.floor(Number(input.value) || 0);
    if (!tc) { out.innerHTML = '<span class="dim">Informe a quantidade para simular.</span>'; return null; }
    return rmtApi("POST", "/api/rmt/rate", { tc }).then((r) => {
      if (!r.ok || !r.quote) { out.innerHTML = '<span style="color:#ff9a6a">Não foi possível simular.</span>'; return null; }
      const q = r.quote;
      out.innerHTML =
        `Bruto: <b>${fmtBrl(q.gross)}</b><br>` +
        `Taxas: <b>${fmtBrl(q.fee)}</b><br>` +
        `Líquido a receber: <b style="color:#9ce84a">${fmtBrl(q.net)}</b>`;
      return q;
    });
  };
  input.addEventListener("input", () => {
    clearTimeout(debounce); debounce = setTimeout(simulate, 350);
  });
  btn.addEventListener("click", async () => {
    const tc = Math.floor(Number(input.value) || 0);
    if (!tc) { toast && toast("Informe a quantidade de TC.", "bad"); return; }
    if (!d.profile || !d.profile.pixKey) { toast && toast("Cadastre seus dados PIX abaixo antes de vender.", "bad"); return; }
    if (d.kycRequired && d.profile.verificationStatus !== "verified") {
      const st = d.profile.verificationStatus;
      toast && toast(st === "pending" ? "Verificação 18+ em análise — aguarde a liberação."
        : st === "rejected" ? "Verificação reprovada — corrija os dados abaixo."
        : "Complete a verificação 18+ antes de vender.", "bad");
      return;
    }
    const r = await rmtApi("POST", "/api/rmt/rate", { tc });
    if (!r.ok || !r.quote) { toast && toast((r && r.msg) || "Falha na simulação.", "bad"); return; }
    rmtConfirmBox(body, d, tc, r.quote);
  });
}

function rmtConfirmBox(body, d, tc, q) {
  const old = body.querySelector("#rmt-confirm"); if (old) old.remove();
  const div = document.createElement("div");
  div.id = "rmt-confirm";
  div.className = "rmt-confirm";
  div.innerHTML = `
    <div class="rmt-sec-title">CONFIRMAR VENDA</div>
    <div class="tiny">Quantidade: <b>${fmtTc(tc)}</b></div>
    <div class="tiny">Cotação: <b>${fmtTc(d.rate.unitTc)} = ${fmtBrl(d.rate.valueCents)}</b></div>
    <div class="tiny">Bruto: <b>${fmtBrl(q.gross)}</b> · Taxas: <b>${fmtBrl(q.fee)}</b></div>
    <div class="tiny">Líquido: <b style="color:#9ce84a">${fmtBrl(q.net)}</b></div>
    <div class="tiny dim" style="margin-top:4px">Processamento estimado: ${d.processingHours}h · Pagamento manual via PIX para <b>${d.profile.holderName}</b> (${d.profile.pixKey}).</div>
    <div class="tiny" style="color:#ffb56a;margin-top:4px">Após aprovação, a solicitação não poderá ser desfeita livremente.</div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="sm primary" id="rmt-confirm-yes">CONFIRMAR</button>
      <button class="sm" id="rmt-confirm-no">Voltar</button>
    </div>`;
  body.querySelector(".rmt-sell-box").appendChild(div);
  div.querySelector("#rmt-confirm-no").addEventListener("click", () => div.remove());
  div.querySelector("#rmt-confirm-yes").addEventListener("click", async () => {
    if (_rmtBusy) return;
    _rmtBusy = true;
    _rmtNonce = (crypto.randomUUID ? crypto.randomUUID() : "n" + Date.now() + Math.random());
    const r = await rmtApi("POST", "/api/rmt/requests", {
      token: sessionToken(), tc_amount: tc, client_nonce: _rmtNonce,
      character_id: (G && G.p && G.p.id) || null, character_name: (G && G.p && G.p.name) || "",
    });
    _rmtBusy = false;
    if (!r.ok) { toast && toast(r.msg || "Falha ao criar solicitação.", "bad"); return; }
    toast && toast("Ticket " + r.request.ticket + " criado — " + fmtTc(r.request.tcAmount) + " reservadas.", "good");
    renderRmt(body);
  });
}

/* ── Payment information + verificação 18+ ───────────────────────────── */
const RMT_KYC_ST = { unverified: "Não verificado", pending: "Em análise", verified: "Verificado ✓", rejected: "Reprovado" };
function rmtMaskDigits(el, max, fmt) {
  el.addEventListener("input", () => {
    const d = el.value.replace(/\D/g, "").slice(0, max);
    el.value = fmt ? fmt(d) : d;
  });
}
const fmtCpf = (d) => d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const fmtDob = (d) => d.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");

function renderRmtProfile(body, profile, dash) {
  const el = body.querySelector("#rmt-profile");
  const p = profile || {};
  const kycOn = !!(dash && dash.kycRequired);
  const st = p.verificationStatus || "unverified";
  const stCls = st === "verified" ? "rmt-st-paid" : st === "rejected" ? "rmt-st-bad" : "rmt-st-warn";
  el.innerHTML = `
    <div class="rmt-sell-box">
      ${p.holderName ? `<div class="tiny">Titular: <b>${p.holderName}</b> · ${p.document || ""}${p.birthDate ? " · nasc. " + p.birthDate : ""}
        · ${p.pixKeyType}: <b>${p.pixKey}</b>
        <span class="${stCls}">(${RMT_KYC_ST[st] || st})</span></div>` : ""}
      ${st === "pending" ? '<div class="tiny" style="color:#fde68a">⏳ Verificação 18+ em análise pela equipe — a venda libera quando aprovada.</div>' : ""}
      ${st === "rejected" ? `<div class="tiny" style="color:#ff9a6a">✖ Verificação reprovada${p.kyc && p.kyc.failReason ? " (" + p.kyc.failReason + ")" : ""} — corrija e reenvie.</div>` : ""}
      ${st === "verified" ? '<div class="tiny" style="color:#9ce84a">✔ Identidade 18+ verificada — RMT liberado.</div>' : ""}
      ${kycOn ? '<div class="tiny dim">Verificação 18+ obrigatória: o RMT só paga <b>pessoa física</b>, via PIX no <b>próprio CPF</b> do titular.</div>'
        : '<div class="tiny dim">Cadastre os dados PIX do titular da conta para receber pagamentos.</div>'}
      <div class="rmt-pf-grid" style="margin-top:6px">
        <input id="rmt-pf-name" class="tiny" placeholder="Nome completo do titular" value="">
        <input id="rmt-pf-doc" class="tiny" placeholder="${kycOn ? "CPF do titular (somente números)" : "CPF ou CNPJ do titular"}" maxlength="14">
        ${kycOn ? '<input id="rmt-pf-dob" class="tiny" placeholder="Nascimento (DD/MM/AAAA)" maxlength="10" inputmode="numeric">' : ""}
        ${kycOn
          ? '<input id="rmt-pf-key" class="tiny" placeholder="Chave PIX = o próprio CPF" maxlength="14">'
          : `<select id="rmt-pf-type" class="tiny">
              <option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option><option value="phone">Telefone</option>
              <option value="random">Chave aleatória</option>
            </select>
            <input id="rmt-pf-key" class="tiny" placeholder="Chave PIX">`}
      </div>
      ${kycOn ? `<label class="tiny" style="display:flex;gap:6px;align-items:flex-start;margin-top:6px;line-height:1.4">
        <input type="checkbox" id="rmt-pf-consent" style="margin-top:2px">
        <span>Declaro ser o titular dos dados, ter 18 anos ou mais e autorizo o tratamento do CPF e data de nascimento
          exclusivamente para verificação de identidade e pagamentos (LGPD).</span></label>` : ""}
      <button class="sm" id="rmt-pf-save" style="margin-top:6px">${p.holderName ? "ATUALIZAR / REVERIFICAR" : "ENVIAR PARA VERIFICAÇÃO"}</button>
    </div>`;
  const doc = el.querySelector("#rmt-pf-doc");
  const key = el.querySelector("#rmt-pf-key");
  const dob = el.querySelector("#rmt-pf-dob");
  rmtMaskDigits(doc, 14, (d) => (kycOn || d.length <= 11) ? fmtCpf(d) : d);
  if (dob) rmtMaskDigits(dob, 8, fmtDob);
  if (kycOn) rmtMaskDigits(key, 11, fmtCpf);
  el.querySelector("#rmt-pf-save").addEventListener("click", async () => {
    const payload = {
      token: sessionToken(),
      holder_name: el.querySelector("#rmt-pf-name").value,
      holder_document: doc.value,
      pix_key_type: kycOn ? "cpf" : el.querySelector("#rmt-pf-type").value,
      pix_key: key.value,
    };
    if (kycOn) {
      payload.birth_date = dob.value;
      payload.consent = el.querySelector("#rmt-pf-consent").checked ? 1 : 0;
    }
    const r = await rmtApi("PUT", "/api/rmt/payment-profile", payload);
    toast && toast(r.msg || (r.ok ? "Dados salvos." : "Falha ao salvar."), r.ok ? "good" : "bad");
    if (r.ok || r.profile) renderRmt(body);
  });
}

/* ── Histórico + ticket ──────────────────────────────────────────────── */
async function renderRmtHistory(body) {
  const el = body.querySelector("#rmt-history");
  const r = await rmtApi("GET", "/api/rmt/history");
  if (!r.ok) { el.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
  if (!r.requests.length) { el.innerHTML = '<div class="tiny dim">Nenhuma solicitação ainda.</div>'; return; }
  el.innerHTML = `<table class="m-offers-table rmt-table">
    <tr><th>Ticket</th><th>TC</th><th>Líquido</th><th>Status</th><th></th></tr>
    ${r.requests.map((q) => `<tr>
      <td class="tiny">${q.ticket}</td>
      <td class="tiny">${fmtTc(q.tcAmount)}</td>
      <td class="tiny">${fmtBrl(q.netCents)}</td>
      <td class="tiny ${rmtStatusClass(q.status)}">${rmtStatusLabel(q.status)}</td>
      <td><button class="sm" data-rmt-ticket="${q.id}">abrir</button></td>
    </tr>`).join("")}</table>`;
  el.querySelectorAll("[data-rmt-ticket]").forEach((b) =>
    b.addEventListener("click", () => renderRmtTicket(body, Number(b.dataset.rmtTicket))));
}

async function renderRmtTicket(body, id) {
  const r = await rmtApi("GET", "/api/rmt/requests/" + id);
  if (!r.ok) { toast && toast(r.msg || "Ticket não encontrado.", "bad"); return; }
  const q = r.request;
  const steps = ["pending", "under_review", "approved", "payment_processing", "paid"];
  const idx = steps.indexOf(q.status);
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <button class="sm" id="rmt-back">← Voltar</button>
      <b class="tiny">${q.ticket}</b>
      <span class="tiny ${rmtStatusClass(q.status)}">${rmtStatusLabel(q.status)}</span>
    </div>
    <div class="rmt-timeline">
      ${steps.map((s, i) => `<div class="rmt-step ${q.status === "rejected" || q.status === "cancelled" ? "rmt-step-dead" : i <= idx ? "rmt-step-done" : ""}">
        <div class="rmt-dot"></div><div class="tiny">${rmtStatusLabel(s)}</div></div>`).join('<div class="rmt-line"></div>')}
    </div>
    ${q.status === "rejected" && q.rejectionReason ? `<div class="tiny" style="color:#ff9a6a;margin:6px 0">Motivo: ${q.rejectionReason}</div>` : ""}
    <div class="rmt-grid" style="margin-top:8px">
      <div class="rmt-card"><div class="tiny dim">TC VENDIDAS</div><div class="rmt-big">${fmtTc(q.tcAmount)}</div></div>
      <div class="rmt-card"><div class="tiny dim">COTAÇÃO APLICADA</div><div class="rmt-big">${fmtTc(q.rateUnitTc)} = ${fmtBrl(q.rateValueCents)}</div></div>
      <div class="rmt-card"><div class="tiny dim">BRUTO / TAXAS</div><div class="rmt-big">${fmtBrl(q.grossCents)} / ${fmtBrl(q.feeCents)}</div></div>
      <div class="rmt-card"><div class="tiny dim">LÍQUIDO</div><div class="rmt-big" style="color:#9ce84a">${fmtBrl(q.netCents)}</div></div>
    </div>
    <div class="tiny" style="margin-top:8px">Recebimento: <b>${q.holderName}</b> · ${q.pixKeyType} ${q.pixKey} · doc ${q.document}</div>
    <div class="tiny dim">Criado em ${new Date(q.createdAt).toLocaleString("pt-BR")}${q.paidAt ? " · Pago em " + new Date(q.paidAt).toLocaleString("pt-BR") : ""}</div>
    ${q.status === "pending" ? '<button class="sm" id="rmt-cancel" style="margin-top:8px">CANCELAR SOLICITAÇÃO</button>' : ""}
    <div class="rmt-sec-title" style="margin-top:12px">HISTÓRICO DO TICKET</div>
    <div class="rmt-log">${(r.timeline || []).map((l) =>
      `<div class="tiny dim">▸ ${new Date(l.at).toLocaleString("pt-BR")} — ${l.action}${l.from ? " (" + l.from + " → " + l.to + ")" : ""}${l.description ? ": " + l.description : ""}</div>`).join("") || '<div class="tiny dim">Sem eventos ainda.</div>'}</div>`;
  body.querySelector("#rmt-back").addEventListener("click", () => renderRmt(body));
  const cancel = body.querySelector("#rmt-cancel");
  if (cancel) cancel.addEventListener("click", async () => {
    const rr = await rmtApi("POST", `/api/rmt/requests/${id}/cancel`, { token: sessionToken() });
    toast && toast(rr.msg || (rr.ok ? "Cancelada." : "Falha ao cancelar."), rr.ok ? "good" : "bad");
    if (rr.ok) renderRmt(body);
  });
}
