/* partners-ui.js — Modal PARCEIROS (botão da topbar): lista os streamers
 * parceiros com status de live (online/offline, tempo de live), nível do
 * parceiro e o voucher — exibido como ***** até o jogador seguir o canal
 * (mesmo OAuth do gate de voucher; o servidor revela o código quando
 * accounts.social.twitch.follows[channel] === true).
 *
 * Dados: GET /api/partners?token= — já vem ordenado (online primeiro,
 * maior tempo de live na frente). Auto-refresh a cada 60s enquanto aberto. */
"use strict";

let _partnersTimer = null;

function partnersEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function partnersUptime(min) {
  min = Math.max(0, Number(min) || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (h >= 24) return Math.floor(h / 24) + "d " + (h % 24) + "h";
  if (h) return h + "h " + String(m).padStart(2, "0") + "min";
  return m + "min";
}
function partnersViewers(n) {
  n = Number(n) || 0;
  return n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "k" : String(n);
}

const TWITCH_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#a970ff" d="M4.3 1 1.8 5v17h5v3h2.5l3-3h4.3l5.2-5.5V1H4.3zm15 14-3.8 4h-4l-3 3v-3H4.8V3h14.5v12z"/><rect x="14" y="6.5" width="2.2" height="6" fill="#a970ff"/><rect x="9" y="6.5" width="2.2" height="6" fill="#a970ff"/></svg>`;
const INSTAGRAM_ICON = `<svg viewBox="0 0 24 24" width="16" height="16"><defs><linearGradient id="pt-ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f9ce34"/><stop offset=".5" stop-color="#ee2a7b"/><stop offset="1" stop-color="#6228d7"/></linearGradient></defs><path fill="url(#pt-ig)" d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8C2.4 4 4 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1zM12 7a5 5 0 100 10 5 5 0 000-10zm0 8.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4zm5.2-9.4a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z"/></svg>`;

async function partnersFetch() {
  const r = await _api("GET", "/api/partners?token=" + encodeURIComponent(sessionToken()), null, sessionToken());
  return r.data || { ok: false };
}

function partnerCardHtml(p) {
  const live = p.live && p.live.online;
  const avatar = p.avatar
    ? `<img class="partner-avatar" src="${partnersEsc(p.avatar)}" alt="" width="52" height="52">`
    : `<span class="partner-avatar partner-avatar--icon">${TWITCH_ICON}</span>`;
  const liveBadge = live
    ? `<span class="partner-live"><span class="partner-live-dot"></span>AO VIVO</span>`
    : `<span class="partner-offline">OFFLINE</span>`;
  const streamLine = live
    ? `<div class="partner-stream-meta">há <b>${partnersUptime(p.live.uptimeMin)}</b> em live · ${partnersViewers(p.live.viewers)} assistindo</div>
       ${p.live.title ? `<div class="partner-stream-title" title="${partnersEsc(p.live.title)}">${partnersEsc(p.live.title)}</div>` : ""}`
    : `<div class="partner-stream-meta partner-offline-meta">fora do ar</div>`;
  const voucherLine = p.voucherHidden
    ? `<div class="partner-voucher">
         <span class="partner-voucher-code partner-voucher-hidden">• • • • •</span>
         <button type="button" class="partner-follow-btn" data-channel="${partnersEsc(p.channel)}">Seguir para revelar</button>
       </div>`
    : `<div class="partner-voucher">
         <span class="partner-voucher-code" title="Clique para copiar">${partnersEsc(p.voucher)}</span>
         <button type="button" class="partner-redeem-btn" data-voucher="${partnersEsc(p.voucher)}">Resgatar</button>
       </div>`;
  const socials = `<div class="partner-socials">
      <a href="${partnersEsc(p.url)}" target="_blank" rel="noopener noreferrer" title="Assistir na Twitch">${TWITCH_ICON} @${partnersEsc(p.channel)}</a>
      ${p.instagram ? `<a href="${partnersEsc(p.instagram)}" target="_blank" rel="noopener noreferrer" title="Instagram">${INSTAGRAM_ICON}</a>` : ""}
    </div>`;
  return `<div class="partner-card${live ? " is-live" : ""}" data-channel="${partnersEsc(p.channel)}">
    <div class="partner-head">
      ${avatar}
      <div class="partner-id">
        <div class="partner-name">${partnersEsc(p.name)}</div>
        <div class="partner-sub">Nv. ${Number(p.level) || 1} de parceiro</div>
      </div>
      ${liveBadge}
    </div>
    ${streamLine}
    ${voucherLine}
    ${socials}
  </div>`;
}

async function renderPartnersModal(bd) {
  const body = bd.querySelector("#partners-body");
  body.innerHTML = `<div class="partners-loading">Carregando parceiros...</div>`;
  const r = await partnersFetch();
  if (!bd.isConnected) return;
  if (!r.ok) {
    body.innerHTML = `<div class="partners-loading">${partnersEsc(r.msg || "Falha ao carregar — tente de novo.")}</div>`;
    return;
  }
  const list = r.partners || [];
  body.innerHTML = list.length
    ? list.map(partnerCardHtml).join("")
    : `<div class="partners-loading">Nenhum parceiro cadastrado ainda.</div>`;
  wirePartnerActions(bd, body);
}

function wirePartnerActions(bd, body) {
  body.querySelectorAll(".partner-voucher-code:not(.partner-voucher-hidden)").forEach((el) => {
    el.addEventListener("click", () => {
      const code = el.textContent.trim();
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(code);
        el.classList.add("copied");
        const old = el.textContent;
        el.textContent = "copiado!";
        setTimeout(() => { el.textContent = old; el.classList.remove("copied"); }, 1200);
      } catch (e) {}
    });
  });
  body.querySelectorAll(".partner-redeem-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const code = b.dataset.voucher || "";
      closePartnersModal();
      if (typeof openStoreModal === "function") openStoreModal("vouchers");
      setTimeout(() => {
        const inp = document.getElementById("store-voucher-code");
        if (inp) { inp.value = code; inp.focus(); }
      }, 250);
    });
  });
  body.querySelectorAll(".partner-follow-btn").forEach((b) => {
    b.addEventListener("click", () => partnerFollowFlow(b.dataset.channel, bd));
  });
}

/* Seguir para revelar: mesmo OAuth do gate de voucher, mas mirando o canal
 * do parceiro (?channel=). Poll em /api/twitch/status?channel= até confirmar
 * o follow, então re-renderiza a lista (servidor passa a enviar o código). */
async function partnerFollowFlow(channel, bd) {
  const statusEl = bd.querySelector("#partners-status");
  const say = (t, c) => { if (statusEl) { statusEl.textContent = t; statusEl.style.color = c || ""; } };
  window.open("/api/twitch/auth?token=" + encodeURIComponent(sessionToken()) +
    "&channel=" + encodeURIComponent(channel),
    "gi-twitch-auth", "width=540,height=700,menubar=no,toolbar=no,location=yes");
  say("Confirmando o follow de @" + channel + " na Twitch...");
  let tries = 0;
  const iv = setInterval(async () => {
    if (!bd.isConnected || ++tries > 80) { clearInterval(iv); return; }
    try {
      const r = await _api("GET", "/api/twitch/status?token=" + encodeURIComponent(sessionToken()) +
        "&channel=" + encodeURIComponent(channel), null, sessionToken());
      const st = r.data;
      if (!st || !st.ok) return;
      if (st.verified) {
        clearInterval(iv);
        say("✔ Follow confirmado — voucher liberado!", "#9ce84a");
        setTimeout(() => { if (bd.isConnected) renderPartnersModal(bd); }, 700);
      } else if (st.linked) {
        say("Conectado como @" + st.login + " — siga @" + channel + " na Twitch e aguarde.", "#f2c96b");
      }
    } catch (e) {}
  }, 2500);
}

function openPartnersModal() {
  const old = document.getElementById("partners-backdrop");
  if (old) { old.remove(); return; }
  const bd = document.createElement("div");
  bd.id = "partners-backdrop";
  bd.className = "voucher-reward-backdrop partners-backdrop";
  bd.innerHTML = `
    <div class="voucher-reward-card partners-card" role="dialog" aria-modal="true">
      <div class="voucher-reward-title">${TWITCH_ICON} Parceiros
        <button type="button" class="sm voucher-reward-close" aria-label="Fechar">✕</button>
      </div>
      <div class="voucher-reward-intro">
        Siga os streamers parceiros na Twitch para liberar o voucher de cada um.
      </div>
      <div id="partners-body" class="partners-body"></div>
      <div class="tiny" id="partners-status"></div>
    </div>`;
  document.body.appendChild(bd);
  renderPartnersModal(bd);
  if (_partnersTimer) clearInterval(_partnersTimer);
  _partnersTimer = setInterval(() => {
    if (bd.isConnected) renderPartnersModal(bd);
    else { clearInterval(_partnersTimer); _partnersTimer = null; }
  }, 60000);
  bd.addEventListener("click", (e) => { if (e.target === bd) closePartnersModal(); });
  bd.querySelector(".voucher-reward-close").addEventListener("click", closePartnersModal);
}
function closePartnersModal() {
  const bd = document.getElementById("partners-backdrop");
  if (bd) bd.remove();
  if (_partnersTimer) { clearInterval(_partnersTimer); _partnersTimer = null; }
}

window.openPartnersModal = openPartnersModal;
window.closePartnersModal = closePartnersModal;
