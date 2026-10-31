/* daily-boost.js — painel DAILY BOOST acima do menu de caçadas.
 *
 * Mostra o Daily Monster e o Daily Boss do dia, com a sprite animada
 * (idle real ou ciclo de caminhada via mobImg) e o bônus sorteado do dia
 * (15%–35% cada, independente — vem do servidor em /api/daily-boost).
 * A escolha vira no server save das 00h (Brasília); o painel refaz o
 * fetch quando a data muda. Minimizar fica salvo no localStorage.
 */
(function () {
  "use strict";

  var current = null;
  var COLLAPSE_KEY = "tibia-idle-daily-boost-collapsed";

  function apiBase() {
    return (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) || "";
  }
  function tt(key) { return typeof t === "function" ? t(key) : key; }

  function isCollapsed() {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (e) { return false; }
  }
  function applyCollapsed(collapsed) {
    var body = document.getElementById("daily-boost-body");
    var btn = document.getElementById("daily-boost-toggle");
    if (body) body.style.display = collapsed ? "none" : "";
    if (btn) { btn.textContent = collapsed ? "+" : "−"; btn.title = collapsed ? "Expandir" : "Minimizar"; }
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch (e) {}
  }

  function spriteHtml(slug) {
    if (typeof bossMobImg === "function") return bossMobImg(slug, 52);
    if (typeof mobImg === "function") return mobImg(slug, 52, null, { walkAnim: true });
    return '<div class="mob-img" style="width:52px;height:52px"></div>';
  }

  function cellHtml(entry, labelKey, bonusPct, bonusLabel) {
    if (!entry) return "";
    var name = String(entry.name || entry.slug || "?");
    var pct = Math.max(0, Math.floor(Number(bonusPct) || 0));
    return '<div class="daily-boost-cell">' +
      '<div class="daily-boost-sprite">' + spriteHtml(entry.slug) + "</div>" +
      '<div class="daily-boost-info">' +
        '<div class="daily-boost-kind">' + tt(labelKey) + "</div>" +
        '<div class="daily-boost-name" title="' + name.replace(/"/g, "&quot;") + '">' + name + "</div>" +
        '<div class="daily-boost-bonus">+' + pct + "% " + bonusLabel + "</div>" +
      "</div></div>";
  }

  function render(data) {
    var panel = document.getElementById("daily-boost-panel");
    if (!panel) return;
    if (!data || !data.ok || (!data.monster && !data.boss)) { panel.hidden = true; return; }
    var body = panel.querySelector(".daily-boost-body");
    if (!body) return;
    body.innerHTML =
      cellHtml(data.monster, "daily.monster", data.expBonus, "EXP") +
      cellHtml(data.boss, "daily.boss", data.lootBonus, "LOOT");
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
  function start() {
    var btn = document.getElementById("daily-boost-toggle");
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener("click", function () { applyCollapsed(!isCollapsed()); });
    }
    applyCollapsed(isCollapsed());
    fetchDaily();
    setInterval(fetchDaily, 60000);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
