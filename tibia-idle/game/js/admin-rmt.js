/* admin-rmt.js — aba RMT do painel admin: fila, ticket, tesouraria e settings.
 *
 * Endpoints /api/admin/rmt/* (server/rmt.js). Cada ação passa pelo gate de
 * permissão do backend (RMT_VIEW/REVIEW/APPROVE/PAY/REJECT/CONFIG/AUDIT) —
 * o frontend só exibe os botões; a autoridade é sempre o servidor.
 */
"use strict";

async function rmtAdmApi(method, path, body) {
  const r = await _api(method, path, body || null, sessionToken());
  return (r && r.data) || { ok: false, msg: "Sem resposta" };
}
function rmtBrl(cents) {
  return "R$ " + (Number(cents || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}
const RMT_ST = {
  pending: "Pendente", under_review: "Em análise", approved: "Aprovada",
  payment_processing: "Pagando", paid: "Paga", rejected: "Reprovada", cancelled: "Cancelada",
};
function rmtStCls(s) {
  return s === "paid" ? "rmt-st-paid" : s === "rejected" || s === "cancelled" ? "rmt-st-bad"
    : s === "approved" || s === "payment_processing" ? "rmt-st-warn" : "rmt-st-open";
}

function renderAdminRmt(p, el) {
  el.innerHTML = '<div class="tiny dim">Carregando RMT…</div>';
  Promise.all([rmtAdmApi("GET", "/api/admin/rmt/dashboard"), rmtAdmApi("GET", "/api/admin/rmt/requests")])
    .then(([d, l]) => {
      if (!d.ok) {
        el.innerHTML = `<div class="tiny" style="color:#ff9a6a">${d.msg || d.error || "RMT indisponível"}</div>`;
        return;
      }
      const t = d.treasury || {};
      el.innerHTML = `
        <div class="admin-grid">
          <div class="admin-card"><div class="admin-card-t">Tesouraria</div>
            <div class="stat-row"><span class="k">TC compradas</span><span class="v">${Number(t.soldTc || 0).toLocaleString()}</span></div>
            <div class="stat-row"><span class="k">TC reservadas</span><span class="v">${Number(t.reservedTc || 0).toLocaleString()}</span></div>
            <div class="stat-row"><span class="k">TC no mês</span><span class="v">${Number(t.monthTc || 0).toLocaleString()}</span></div>
            <div class="stat-row"><span class="k">Comprometido</span><span class="v">${rmtBrl(t.committedCents)}</span></div>
            <div class="stat-row"><span class="k">Pago total</span><span class="v">${rmtBrl(t.paidCents)}</span></div>
            <div class="stat-row"><span class="k">Caixa disponível</span><span class="v" style="color:#9ce84a">${rmtBrl(d.availableCents)}</span></div>
            <div class="stat-row"><span class="k">Fila</span><span class="v">${t.pendingTickets} pend. / ${t.reviewTickets} análise</span></div>
          </div>
          <div class="admin-card"><div class="admin-card-t">Configurações</div><div id="rmt-adm-set"></div></div>
        </div>
        <div class="admin-card" style="margin-top:8px">
          <div class="admin-card-t">Solicitações
            <select id="rmt-adm-filter" class="tiny" style="margin-left:8px">
              <option value="">todas</option>
              ${["pending", "under_review", "approved", "payment_processing", "paid", "rejected", "cancelled"]
                .map((s) => `<option value="${s}">${RMT_ST[s]}</option>`).join("")}
            </select>
          </div>
          <div id="rmt-adm-queue"></div>
        </div>
        <div id="rmt-adm-ticket" style="margin-top:8px"></div>`;
      renderRmtAdmSettings(el, d.settings || {});
      renderRmtAdmQueue(el, (l && l.requests) || []);
      el.querySelector("#rmt-adm-filter").addEventListener("change", async (e) => {
        const r = await rmtAdmApi("GET", "/api/admin/rmt/requests" + (e.target.value ? "?status=" + e.target.value : ""));
        if (r.ok) renderRmtAdmQueue(el, r.requests);
      });
    });
}

function renderRmtAdmSettings(el, s) {
  const box = el.querySelector("#rmt-adm-set");
  const fields = [
    ["RMT_ENABLED", "Ativo (0/1)"], ["RATE_UNIT_TC", "TC por cotação"],
    ["RATE_VALUE_CENTS", "Cotação (centavos)"], ["MINIMUM_SELL_AMOUNT", "Mín. TC"],
    ["MAXIMUM_SELL_AMOUNT", "Máx. TC (0=sem)"], ["FEE_PERCENT", "Taxa %"],
    ["FEE_FIXED_CENTS", "Taxa fixa (cents)"], ["PROCESSING_ESTIMATED_HOURS", "Prazo (h)"],
    ["MIN_ACCOUNT_AGE_DAYS", "Idade mín. conta (dias)"], ["TREASURY_BALANCE_CENTS", "Caixa (cents)"],
    ["DUAL_APPROVAL_CENTS", "Dupla aprovação ≥ (cents)"],
  ];
  box.innerHTML = fields.map(([k, label]) =>
    `<div class="stat-row"><span class="k tiny">${label}</span>
      <input class="admin-in tiny" data-rmt-set="${k}" value="${s[k] != null ? s[k] : 0}" style="width:90px"></div>`).join("") +
    `<button class="sm primary" id="rmt-set-save" style="margin-top:6px">SALVAR CONFIG</button>`;
  box.querySelector("#rmt-set-save").addEventListener("click", async () => {
    const patch = {};
    box.querySelectorAll("[data-rmt-set]").forEach((i) => { patch[i.dataset.rmtSet] = Number(i.value) || 0; });
    const r = await rmtAdmApi("PUT", "/api/admin/rmt/settings", { settings: patch });
    toast && toast(r.ok ? "Configurações salvas." : (r.msg || r.error || "Falha"), r.ok ? "good" : "bad");
  });
}

function renderRmtAdmQueue(el, rows) {
  const box = el.querySelector("#rmt-adm-queue");
  if (!rows.length) { box.innerHTML = '<div class="tiny dim">Fila vazia.</div>'; return; }
  box.innerHTML = `<table class="rmt-table">
    <tr><th>Ticket</th><th>Conta</th><th>TC</th><th>Líquido</th><th>Data</th><th>Status</th><th></th></tr>
    ${rows.map((r) => `<tr>
      <td class="tiny">${r.ticket}</td><td class="tiny">#${r.accountId} ${r.characterName || ""}</td>
      <td class="tiny">${Number(r.tcAmount).toLocaleString()}</td><td class="tiny">${rmtBrl(r.netCents)}</td>
      <td class="tiny">${new Date(r.createdAt).toLocaleDateString("pt-BR")}</td>
      <td class="tiny ${rmtStCls(r.status)}">${RMT_ST[r.status] || r.status}</td>
      <td><button class="sm" data-rmt-open="${r.id}">abrir</button></td></tr>`).join("")}</table>`;
  box.querySelectorAll("[data-rmt-open]").forEach((b) =>
    b.addEventListener("click", () => renderRmtAdmTicket(el, Number(b.dataset.rmtOpen))));
}

async function renderRmtAdmTicket(el, id) {
  const box = el.querySelector("#rmt-adm-ticket");
  box.innerHTML = '<div class="tiny dim">Abrindo…</div>';
  const r = await rmtAdmApi("GET", "/api/admin/rmt/requests/" + id);
  if (!r.ok) { box.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Falha"}</div>`; return; }
  const q = r.request;
  const actions = [];
  if (q.status === "pending") actions.push(["review", "START REVIEW"]);
  if (q.status === "under_review") actions.push(["approve", "APPROVE REQUEST"], ["reject", "REJECT REQUEST"]);
  if (q.status === "approved") actions.push(["payment", "START PAYMENT"], ["reject", "REJECT REQUEST"]);
  if (q.status === "payment_processing") actions.push(["confirm-payment", "CONFIRM PAYMENT"], ["review", "BACK TO REVIEW"]);
  box.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-t">${q.ticket} — ${RMT_ST[q.status]}</div>
      <div class="rmt-cols">
        <div>
          <div class="tiny dim">JOGADOR</div>
          <div class="tiny">Conta #${q.accountId} (${(r.account && r.account.login) || "?"}) · ${q.characterName || "-"}</div>
          <div class="tiny dim">Conta criada: ${r.account && r.account.createdAt ? new Date(r.account.createdAt).toLocaleDateString("pt-BR") : "?"} · saldo ${r.account ? Number(r.account.coins).toLocaleString() : "?"} TC</div>
          <div class="tiny dim">Histórico: ${(r.playerHistory || []).length} solicitações anteriores</div>
          <div class="tiny dim" style="margin-top:4px">RECEBIMENTO</div>
          <div class="tiny">${q.holderName} · doc ${q.document}<br>${q.pixKeyType}: ${q.pixKey}</div>
        </div>
        <div>
          <div class="tiny dim">FINANCEIRO</div>
          <div class="tiny">${Number(q.tcAmount).toLocaleString()} TC · ${Number(q.rateUnitTc).toLocaleString()} TC = ${rmtBrl(q.rateValueCents)}</div>
          <div class="tiny">Bruto ${rmtBrl(q.grossCents)} · Taxa ${rmtBrl(q.feeCents)} · <b style="color:#9ce84a">Líquido ${rmtBrl(q.netCents)}</b></div>
          <div class="tiny dim" style="margin-top:4px">COMPROVANTES: ${(q.receipts || []).map((rc) =>
            `<a class="tiny" href="#" data-rmt-rcpt="${rc.id}">${rc.original_name}</a>`).join(", ") || "nenhum"}</div>
          <input type="file" id="rmt-rcpt-file" accept=".jpg,.jpeg,.png,.pdf" class="tiny" style="margin-top:4px">
          <button class="sm" id="rmt-rcpt-up">ATTACH RECEIPT</button>
        </div>
      </div>
      ${q.rejectionReason ? `<div class="tiny" style="color:#ff9a6a">Motivo: ${q.rejectionReason}</div>` : ""}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        ${actions.map(([a, label]) => `<button class="sm ${a === "approve" || a === "confirm-payment" ? "primary" : ""}" data-rmt-act="${a}">${label}</button>`).join("")}
      </div>
      <div class="rmt-log" style="margin-top:8px">${(r.logs || []).map((l) =>
        `<div class="tiny dim">▸ ${new Date(l.at).toLocaleString("pt-BR")} — ${l.by}: ${l.action} ${l.from ? "(" + l.from + "→" + l.to + ")" : ""} ${l.description || ""}</div>`).join("") || '<div class="tiny dim">Sem eventos.</div>'}</div>
    </div>`;
  box.querySelectorAll("[data-rmt-rcpt]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    window.open((typeof ACCOUNT_API_URL !== "undefined" ? ACCOUNT_API_URL : "") +
      "/api/admin/rmt/receipts/" + a.dataset.rmtRcpt + "?token=" + encodeURIComponent(sessionToken()), "_blank");
  }));
  box.querySelector("#rmt-rcpt-up").addEventListener("click", async () => {
    const f = box.querySelector("#rmt-rcpt-file").files[0];
    if (!f) { toast && toast("Selecione o arquivo.", "bad"); return; }
    const fd = new FormData(); fd.append("file", f);
    try {
      const resp = await fetch((typeof ACCOUNT_API_URL !== "undefined" ? ACCOUNT_API_URL : "") +
        "/api/admin/rmt/requests/" + id + "/receipt", {
          method: "POST", headers: { Authorization: "Bearer " + sessionToken() }, body: fd });
      const rr = await resp.json();
      toast && toast(rr.ok ? "Comprovante anexado." : (rr.msg || "Falha no upload."), rr.ok ? "good" : "bad");
      if (rr.ok) renderRmtAdmTicket(el, id);
    } catch (e) { toast && toast("Falha no upload.", "bad"); }
  });
  box.querySelectorAll("[data-rmt-act]").forEach((b) => b.addEventListener("click", async () => {
    const act = b.dataset.rmtAct;
    const payload = {};
    if (act === "reject") { payload.reason = prompt("Justificativa da reprovação:"); if (payload.reason == null) return; }
    if (act === "confirm-payment" && !confirm("Confirmar que o PIX foi EFETIVAMENTE transferido ao titular?")) return;
    const rr = await rmtAdmApi("POST", "/api/admin/rmt/requests/" + id + "/" + act, payload);
    toast && toast(rr.msg || (rr.ok ? "Status atualizado." : "Falha."), rr.ok ? "good" : "bad");
    if (rr.ok) renderRmtAdmTicket(el, id);
  }));
}
