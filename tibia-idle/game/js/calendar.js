/* calendar.js — CALENDÁRIO global: grid do mês vigente com eventos/metas
 * por dia. Leitura para todos; contas role=admin editam dentro do modal. */
"use strict";

const CALENDAR_MONTHS_PT = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const CALENDAR_WEEKDAYS_PT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

let CALENDAR_UI = { events: [], day: null, editing: null };

function calendarPad2(n) { return String(n).padStart(2, "0"); }

function calendarDayKey(y, m, d) {
  return `${y}-${calendarPad2(m + 1)}-${calendarPad2(d)}`;
}

function calendarEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function calendarIsAdmin() {
  try {
    const acc = typeof sessionAccount === "function" ? sessionAccount() : null;
    return !!(acc && acc.role === "admin");
  } catch (e) { return false; }
}

async function calendarApiList() {
  const base = (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) || "";
  try {
    const r = await fetch(`${base}/api/calendar`, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (data && data.ok) return data.events || [];
  } catch (e) {}
  return [];
}

async function calendarApiWrite(action, fields) {
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  const base = (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) || "";
  try {
    const r = await fetch(`${base}/api/admin/calendar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ token, action }, fields || {})),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: !!(data && data.ok), msg: data && data.msg };
  } catch (e) { return { ok: false, msg: "Falha de conexão" }; }
}

function openCalendarModal() {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  if (typeof clearCityModalShells === "function") clearCityModalShells(body);
  body.classList.add("calendar-modal-shell");
  const now = new Date();
  const monthName = CALENDAR_MONTHS_PT[now.getMonth()];
  body.innerHTML = `<div class="panel-title calendar-modal-title">
      <span class="topbar-btn-emoji" aria-hidden="true">📅</span>
      <span>CALENDÁRIO — ${monthName} ${now.getFullYear()}</span>
      <button class="sm" id="calendar-modal-close">Fechar</button>
    </div>
    <div class="panel-body">
      <div id="calendar-grid-wrap" class="calendar-grid-wrap"></div>
      <div id="calendar-day-detail" class="calendar-day-detail"></div>
    </div>`;
  modal.classList.add("show");
  $("#calendar-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("calendar-modal-shell");
  });
  CALENDAR_UI.day = CALENDAR_UI.day || calendarDayKey(now.getFullYear(), now.getMonth(), now.getDate());
  CALENDAR_UI.editing = null;
  calendarRefresh();
}

async function calendarRefresh() {
  CALENDAR_UI.events = await calendarApiList();
  renderCalendarGrid();
  renderCalendarDayDetail();
}

function renderCalendarGrid() {
  const root = $("#calendar-grid-wrap");
  if (!root) return;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const todayKey = calendarDayKey(y, m, now.getDate());
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  for (const ev of CALENDAR_UI.events) {
    const d = String(ev.day || "").slice(0, 10);
    (byDay[d] = byDay[d] || []).push(ev);
  }
  let cells = "";
  for (let i = 0; i < first.getDay(); i++) cells += `<div class="cal-cell cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = calendarDayKey(y, m, d);
    const evs = byDay[key] || [];
    const cls = ["cal-cell"];
    if (key === todayKey) cls.push("cal-today");
    if (key === CALENDAR_UI.day) cls.push("cal-sel");
    if (evs.length) cls.push("cal-has");
    const dots = evs.slice(0, 3).map((ev) =>
      `<span class="cal-dot cal-dot-${ev.kind === "meta" ? "meta" : "evento"}"></span>`).join("");
    cells += `<button type="button" class="${cls.join(" ")}" data-cal-day="${key}">
      <span class="cal-num">${d}</span><span class="cal-dots">${dots}</span></button>`;
  }
  root.innerHTML = `
    <div class="cal-weekdays">${CALENDAR_WEEKDAYS_PT.map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${cells}</div>`;
  root.querySelectorAll("[data-cal-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      CALENDAR_UI.day = btn.dataset.calDay;
      CALENDAR_UI.editing = null;
      renderCalendarGrid();
      renderCalendarDayDetail();
    });
  });
}

function renderCalendarDayDetail() {
  const root = $("#calendar-day-detail");
  if (!root) return;
  const key = CALENDAR_UI.day;
  if (!key) { root.innerHTML = ""; return; }
  const evs = CALENDAR_UI.events.filter((ev) => String(ev.day || "").slice(0, 10) === key);
  const admin = calendarIsAdmin();
  const [y, m, d] = key.split("-").map(Number);
  const label = `${calendarPad2(d)} de ${CALENDAR_MONTHS_PT[m - 1].toLowerCase()} de ${y}`;

  const evRows = evs.map((ev) => {
    if (CALENDAR_UI.editing === ev.id) return calendarEditFormHtml(ev);
    return `<div class="cal-ev cal-ev-${ev.kind === "meta" ? "meta" : "evento"}">
      <div class="cal-ev-head">
        <span class="cal-ev-kind">${ev.kind === "meta" ? "META" : "EVENTO"}</span>
        <b>${calendarEscape(ev.title)}</b>
        ${admin ? `<span style="flex:1"></span>
          <button class="sm" data-cal-edit="${ev.id}">editar</button>
          <button class="sm danger" data-cal-del="${ev.id}">excluir</button>` : ""}
      </div>
      ${ev.body ? `<div class="tiny cal-ev-body">${calendarEscape(ev.body)}</div>` : ""}
    </div>`;
  }).join("");

  const addForm = CALENDAR_UI.editing === "new" ? calendarEditFormHtml({ day: key }) : "";
  root.innerHTML = `
    <div class="cal-detail-head">
      <b>${label}</b>
      ${admin && CALENDAR_UI.editing !== "new"
        ? `<button class="sm primary" id="cal-add">+ agendar</button>` : ""}
    </div>
    ${evRows || `<div class="tiny dim cal-empty-msg">Nada agendado neste dia.</div>`}
    ${addForm}`;

  const addBtn = $("#cal-add");
  if (addBtn) addBtn.addEventListener("click", () => {
    CALENDAR_UI.editing = "new"; renderCalendarDayDetail();
  });
  root.querySelectorAll("[data-cal-edit]").forEach((b) =>
    b.addEventListener("click", () => { CALENDAR_UI.editing = Number(b.dataset.calEdit); renderCalendarDayDetail(); }));
  root.querySelectorAll("[data-cal-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      const r = await calendarApiWrite("delete", { id: Number(b.dataset.calDel) });
      if (!r.ok && typeof toast === "function") toast(r.msg || "Falha ao excluir", "bad");
      await calendarRefresh();
    }));
  root.querySelectorAll("[data-cal-save]").forEach((b) =>
    b.addEventListener("click", async () => {
      const card = b.closest(".cal-edit");
      const title = card.querySelector("[data-cal-f-title]").value.trim();
      const bodyTxt = card.querySelector("[data-cal-f-body]").value.trim();
      const kind = card.querySelector("[data-cal-f-kind]").value;
      const day = card.querySelector("[data-cal-f-day]").value;
      if (!title) { if (typeof toast === "function") toast("Título obrigatório", "bad"); return; }
      const id = b.dataset.calSave === "new" ? null : Number(b.dataset.calSave);
      const r = await calendarApiWrite(id ? "update" : "add",
        { id, day, title, body: bodyTxt, kind });
      if (!r.ok) { if (typeof toast === "function") toast(r.msg || "Falha ao salvar", "bad"); return; }
      CALENDAR_UI.editing = null;
      await calendarRefresh();
    }));
  root.querySelectorAll("[data-cal-cancel]").forEach((b) =>
    b.addEventListener("click", () => { CALENDAR_UI.editing = null; renderCalendarDayDetail(); }));
}

function calendarEditFormHtml(ev) {
  const isNew = !ev.id;
  return `<div class="cal-edit">
    <input class="cal-in" data-cal-f-title placeholder="Título do evento/meta" maxlength="80" value="${calendarEscape(ev.title || "")}">
    <div class="row" style="gap:6px">
      <select class="cal-in" data-cal-f-kind>
        <option value="evento" ${ev.kind === "meta" ? "" : "selected"}>EVENTO</option>
        <option value="meta" ${ev.kind === "meta" ? "selected" : ""}>META</option>
      </select>
      <input class="cal-in" data-cal-f-day type="date" value="${calendarEscape(String(ev.day || "").slice(0, 10))}">
    </div>
    <textarea class="cal-in" data-cal-f-body rows="2" maxlength="500" placeholder="Descrição (opcional)">${calendarEscape(ev.body || "")}</textarea>
    <div class="row" style="gap:6px">
      <button class="sm primary" data-cal-save="${isNew ? "new" : ev.id}">${isNew ? "Agendar" : "Salvar"}</button>
      <button class="sm" data-cal-cancel>Cancelar</button>
    </div>
  </div>`;
}

window.openCalendarModal = openCalendarModal;

function calendarInitButton() {
  const btn = document.getElementById("btn-calendar");
  if (btn && !btn._calendarBound) {
    btn._calendarBound = true;
    btn.addEventListener("click", openCalendarModal);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", calendarInitButton);
} else {
  calendarInitButton();
}
