/* active-boosts.js — painel BÔNUS ATIVOS acima do Daily Boost.
 *
 * Mesmo chrome do daily-boost-panel: aparece só quando o char tem bônus
 * temporário ativo e lista cada um com o tempo restante:
 *   - p.expBoost   {mul,leftMs} — drena SÓ em hunt ("Xmin de caça")
 *   - p.skillBoost {mul,leftMs} — drena SÓ no treino ("Xmin de treino")
 *   - p.skillBoostUntil (ts)    — legado ×1.5, corre no relógio ("Xmin")
 * O painel repinta a cada 1s porque o leftMs desce em tempo real nos ticks
 * de combate/treino. Minimizar fica salvo no localStorage.
 */
(function () {
  "use strict";

  var COLLAPSE_KEY = "tibia-idle-active-boosts-collapsed";

  function isCollapsed() {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (e) { return false; }
  }
  function applyCollapsed(collapsed) {
    var body = document.getElementById("active-boosts-body");
    var btn = document.getElementById("active-boosts-toggle");
    if (body) body.style.display = collapsed ? "none" : "";
    if (btn) { btn.textContent = collapsed ? "+" : "−"; btn.title = collapsed ? "Expandir" : "Minimizar"; }
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch (e) {}
  }

  function iconOf(type) {
    if (typeof dailyRewardIcon === "function") return dailyRewardIcon({ type: type });
    if (type === "exp") return "assets/ui/store/xp-boost.png";
    return (typeof TRAINING_ICON_PATH !== "undefined" ? TRAINING_ICON_PATH : "assets/sprites/training/") +
      (type === "skill" ? "skill-trainer-all.gif" : "lasting-exercise-sword.gif");
  }

  function mins(leftMs) {
    return Math.max(1, Math.ceil((Number(leftMs) || 0) / 60000));
  }
  function mulTxt(mul) {
    var m = Number(mul) || 1;
    return m === Math.floor(m) ? "×" + m : "×" + m.toFixed(1);
  }

  function cellHtml(icon, kind, name, bonus) {
    return '<div class="daily-boost-cell">' +
      '<div class="daily-boost-sprite"><img class="active-boost-icon" src="' + icon + '" alt=""></div>' +
      '<div class="daily-boost-info">' +
        '<div class="daily-boost-kind">' + kind + "</div>" +
        '<div class="daily-boost-name">' + name + "</div>" +
        '<div class="daily-boost-bonus">' + bonus + "</div>" +
      "</div></div>";
  }

  function collect(p) {
    var cells = [];
    if (!p) return cells;
    if (p.expBoost && Number(p.expBoost.leftMs) > 0) {
      cells.push(cellHtml(iconOf("exp"), "BÔNUS EXP",
        mulTxt(p.expBoost.mul) + " de EXP",
        "restam " + mins(p.expBoost.leftMs) + "min de caça"));
    }
    if (p.skillBoost && Number(p.skillBoost.leftMs) > 0) {
      cells.push(cellHtml(iconOf("skill"), "BÔNUS SKILL",
        mulTxt(p.skillBoost.mul) + " de Skill",
        "restam " + mins(p.skillBoost.leftMs) + "min de treino"));
    }
    var untilMs = Number(p.skillBoostUntil) - Date.now();
    if (untilMs > 0) {
      cells.push(cellHtml(iconOf("skill"), "BÔNUS SKILL",
        mulTxt(1.5) + " de Skill",
        "restam " + mins(untilMs) + "min"));
    }
    return cells;
  }

  function render() {
    var panel = document.getElementById("active-boosts-panel");
    if (!panel) return;
    var p = (typeof G !== "undefined" && G) ? G.p : null;
    var cells = collect(p);
    if (!cells.length) { panel.hidden = true; return; }
    var body = panel.querySelector(".daily-boost-body");
    if (body) body.innerHTML = cells.join("");
    panel.hidden = false;
  }

  function start() {
    var btn = document.getElementById("active-boosts-toggle");
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
