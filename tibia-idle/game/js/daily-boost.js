/* daily-boost.js — painel DAILY BOOST na coluna esquerda.
 *
 * Mostra o Daily Monster (+25% EXP) e o Daily Boss (+25% loot) do dia,
 * com a sprite animada (idle real ou ciclo de caminhada via mobImg).
 * A escolha é do servidor (/api/daily-boost) e vira no server save das
 * 00h (Brasília) — o painel refaz o fetch quando a data muda.
 */
(function () {
  "use strict";

  var current = null;

  function apiBase() {
    return (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) || "";
  }
  function tt(key) { return typeof t === "function" ? t(key) : key; }

  function spriteHtml(slug) {
    if (typeof bossMobImg === "function") return bossMobImg(slug, 52);
    if (typeof mobImg === "function") return mobImg(slug, 52, null, { walkAnim: true });
    return '<div class="mob-img" style="width:52px;height:52px"></div>';
  }

  function cellHtml(entry, labelKey, bonusKey) {
    if (!entry) return "";
    var name = String(entry.name || entry.slug || "?");
    return '<div class="daily-boost-cell">' +
      '<div class="daily-boost-sprite">' + spriteHtml(entry.slug) + "</div>" +
      '<div class="daily-boost-info">' +
        '<div class="daily-boost-kind">' + tt(labelKey) + "</div>" +
        '<div class="daily-boost-name" title="' + name.replace(/"/g, "&quot;") + '">' + name + "</div>" +
        '<div class="daily-boost-bonus">' + tt(bonusKey) + "</div>" +
      "</div></div>";
  }

  function render(data) {
    var panel = document.getElementById("daily-boost-panel");
    if (!panel) return;
    if (!data || !data.ok || (!data.monster && !data.boss)) { panel.hidden = true; return; }
    var body = panel.querySelector(".daily-boost-body");
    if (!body) return;
    body.innerHTML =
      cellHtml(data.monster, "daily.monster", "daily.exp") +
      cellHtml(data.boss, "daily.boss", "daily.loot");
    panel.hidden = false;
  }

  function fetchDaily() {
    return fetch(apiBase() + "/api/daily-boost", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        if (current && current.date !== d.date) render(d);
        else if (!current) render(d);
        current = d;
      })
      .catch(function () {});
  }

  /* Poll a cada 60s — barato e resolve a virada de 00h sem timer complicado. */
  function start() { fetchDaily(); setInterval(fetchDaily, 60000); }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
