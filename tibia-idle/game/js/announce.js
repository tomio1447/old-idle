/* announce.js — popup global de anúncios do servidor.
 *
 * O servidor publica via POST /api/admin/announce; o anúncio chega por
 * SSE ("announce") e também fica disponível em /api/health por TTL —
 * cobre quem estava online e quem logar depois. Cada anúncio aparece
 * uma vez por sessão/navegador (dedup em localStorage) e tem botão OK.
 */
"use strict";
(function () {
  var POLL_MS = 15000;
  var SEEN_KEY = "gi-announce-seen";

  function seenList() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") || []; }
    catch (e) { return []; }
  }
  function isSeen(id) {
    return id && seenList().indexOf(String(id)) >= 0;
  }
  function markSeen(id) {
    if (!id) return;
    try {
      var s = seenList();
      if (s.indexOf(String(id)) < 0) s.push(String(id));
      localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-20)));
    } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function injectStyle() {
    if (document.getElementById("announce-style")) return;
    var st = document.createElement("style");
    st.id = "announce-style";
    st.textContent =
      ".announce-modal-bg{position:fixed;inset:0;z-index:99999;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.62)}" +
      ".announce-modal{width:min(460px,92vw);padding:18px 16px 14px;text-align:center;" +
      "background:linear-gradient(180deg,#2b2820,#171512);border:2px solid;" +
      "border-color:#d4af37 #6b5715 #6b5715 #d4af37;box-shadow:0 14px 44px rgba(0,0,0,.7)}" +
      ".announce-title{color:#ffe680;font-weight:700;font-size:14px;letter-spacing:.5px;" +
      "text-transform:uppercase;margin-bottom:10px}" +
      ".announce-msg{color:#e8dfc8;font-size:12px;line-height:1.6;margin-bottom:14px;" +
      "max-height:50vh;overflow-y:auto;text-align:left}" +
      ".announce-ok{min-width:120px}";
    document.head.appendChild(st);
  }

  /* Exibe o popup (uma vez por anúncio). `a` = {id,title,message,button,until}. */
  function announceShow(a) {
    if (!a || !a.message) return;
    if (a.until && Date.now() > Number(a.until)) return;
    if (isSeen(a.id)) return;
    markSeen(a.id);
    injectStyle();
    var old = document.getElementById("announce-modal");
    if (old) old.remove();
    var bg = document.createElement("div");
    bg.id = "announce-modal";
    bg.className = "announce-modal-bg";
    bg.innerHTML =
      '<div class="announce-modal panel">' +
        '<div class="announce-title">' + esc(a.title || "Aviso") + '</div>' +
        '<div class="announce-msg">' + esc(a.message).replace(/\n/g, "<br>") + '</div>' +
        '<button class="primary announce-ok" id="announce-ok">' + esc(a.button || "OK") + '</button>' +
      '</div>';
    document.body.appendChild(bg);
    var ok = bg.querySelector("#announce-ok");
    if (ok) ok.addEventListener("click", function () { bg.remove(); });
  }
  window.announceShow = announceShow;

  /* Entrega instantânea por SSE (account-client dispara este evento). */
  window.addEventListener("tibia-idle-announce", function (ev) {
    announceShow(ev && ev.detail);
  });

  /* Poll de /api/health — cobre quem logou após o anúncio (e sessões sem SSE). */
  function healthUrl() {
    var base = (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) || "";
    return base + "/api/health";
  }
  function poll() {
    fetch(healthUrl(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.announce) announceShow(d.announce); })
      .catch(function () {})
      .then(function () { setTimeout(poll, POLL_MS); });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", poll);
  else poll();
})();
