/* active-preys.js — painel PREYS ATIVAS junto ao Bônus Ativos/Daily Boost.
 *
 * Mesmo chrome do active-boosts-panel: aparece só quando o char tem prey
 * ativa e lista cada slot com a criatura (sprite), o tipo de prey (ícone
 * oficial small) e o nível (estrelas oficiais 5x2), além do valor do
 * bônus e do tempo restante. Minimizar fica salvo no localStorage.
 */
(function () {
  "use strict";

  var COLLAPSE_KEY = "tibia-idle-active-preys-collapsed";

  function isCollapsed() {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (e) { return false; }
  }
  function applyCollapsed(collapsed) {
    var body = document.getElementById("active-preys-body");
    var btn = document.getElementById("active-preys-toggle");
    if (body) body.style.display = collapsed ? "none" : "";
    if (btn) { btn.textContent = collapsed ? "+" : "−"; btn.title = collapsed ? "Expandir" : "Minimizar"; }
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch (e) {}
  }

  function timeTxt(leftMs) {
    var seg = Math.max(1, Math.ceil((Number(leftMs) || 0) / 1000));
    var h = Math.floor(seg / 3600), m = Math.ceil((seg % 3600) / 60);
    return (h > 0 ? h + "h" : "") + m + "m";
  }

  function cellHtml(slotIdx, sel) {
    var slug = sel.creature;
    var b = (typeof PREY_BONUSES !== "undefined" && PREY_BONUSES[sel.bonus]) || null;
    var nome = typeof preyMonsterName === "function" ? preyMonsterName(slug) : slug;
    var valor = typeof preyBonusValue === "function" ? preyBonusValue(sel.bonus, sel.step) : 0;
    var icon = typeof preySmallImg === "function" ? preySmallImg(sel.bonus) : "";
    var stars = typeof preyStarsHtml === "function" ? preyStarsHtml(sel.step) : "";
    var sprite = typeof mobImg === "function" ? mobImg(slug, 44) : "";
    var resta = "restam " + timeTxt(sel.until - Date.now());
    return '<div class="daily-boost-cell active-prey-cell">' +
      '<div class="daily-boost-sprite active-prey-sprite">' + sprite + "</div>" +
      '<div class="daily-boost-info">' +
        '<div class="daily-boost-kind">PREY ' + (slotIdx + 1) +
          (icon ? ' <img class="active-prey-icon" src="' + icon + '" alt="">' : "") + "</div>" +
        '<div class="daily-boost-name">' + nome + "</div>" +
        '<div class="daily-boost-bonus active-prey-bonus">' + stars +
          '<span class="active-prey-value" style="color:' + (b ? b.cor : "#fff") + '">+' +
          valor + "% " + (b ? b.nome : "") + "</span> · " + resta + "</div>" +
      "</div></div>";
  }

  function collect(p) {
    var cells = [];
    if (!p || typeof ensurePrey !== "function" || !ensurePrey(p)) return cells;
    var agora = Date.now();
    for (var i = 0; i < p.prey.slots.length; i++) {
      var s = p.prey.slots[i] && p.prey.slots[i].selected;
      if (s && s.creature && s.until > agora) cells.push(cellHtml(i, s));
    }
    return cells;
  }

  function render() {
    var panel = document.getElementById("active-preys-panel");
    if (!panel) return;
    var p = (typeof G !== "undefined" && G) ? G.p : null;
    var cells = collect(p);
    if (!cells.length) { panel.hidden = true; return; }
    var body = panel.querySelector(".daily-boost-body");
    if (body) body.innerHTML = cells.join("");
    panel.hidden = false;
  }

  function start() {
    var btn = document.getElementById("active-preys-toggle");
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener("click", function () { applyCollapsed(!isCollapsed()); });
    }
    applyCollapsed(isCollapsed());
    render();
    setInterval(render, 1000);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
