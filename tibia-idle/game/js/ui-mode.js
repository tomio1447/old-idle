/* ui-mode.js — escolha Mobile / Desktop (persistida). Desktop = layout atual;
 * Mobile = overrides em mobile.css + dock de abas. */
"use strict";

const UI_MODE_KEY = "global-idle-ui-mode-v1";

function suggestUiMode() {
  try {
    if (window.matchMedia("(max-width: 900px)").matches) return "mobile";
    if (window.matchMedia("(pointer: coarse)").matches &&
        window.matchMedia("(max-width: 1200px)").matches) return "mobile";
    if (window.matchMedia("(hover: none)").matches && window.innerWidth < 1024)
      return "mobile";
  } catch (e) {}
  return "desktop";
}

function getUiMode() {
  try {
    const v = localStorage.getItem(UI_MODE_KEY);
    if (v === "mobile" || v === "desktop") return v;
  } catch (e) {}
  return null;
}

function applyUiMode(mode) {
  const m = mode === "mobile" ? "mobile" : "desktop";
  const html = document.documentElement;
  html.setAttribute("data-ui-mode", m);
  if (document.body) {
    document.body.classList.toggle("ui-mobile", m === "mobile");
    document.body.classList.toggle("ui-desktop", m === "desktop");
    if (m !== "mobile") {
      document.body.removeAttribute("data-mobile-tab");
      document.body.classList.remove("mobile-menu-open");
    } else if (!document.body.getAttribute("data-mobile-tab")) {
      document.body.setAttribute("data-mobile-tab", "game");
    }
  }
  const dock = document.getElementById("mobile-dock");
  if (dock) dock.hidden = m !== "mobile";
  const menu = document.getElementById("mobile-menu-sheet");
  if (menu && m !== "mobile") menu.classList.remove("show");
  syncMobileDockActive();
  try {
    if (typeof G !== "undefined" && G.renderer && typeof G.renderer.resize === "function")
      G.renderer.resize();
  } catch (e) {}
  return m;
}

function setUiMode(mode) {
  const m = applyUiMode(mode === "mobile" ? "mobile" : "desktop");
  try { localStorage.setItem(UI_MODE_KEY, m); } catch (e) {}
  return m;
}

function syncMobileDockActive() {
  const tab = (document.body && document.body.getAttribute("data-mobile-tab")) || "game";
  document.querySelectorAll("#mobile-dock [data-mobile-tab]").forEach((btn) => {
    btn.classList.toggle("primary", btn.getAttribute("data-mobile-tab") === tab);
    btn.setAttribute("aria-pressed", btn.getAttribute("data-mobile-tab") === tab ? "true" : "false");
  });
}

function setMobileTab(tab) {
  if (!document.body || !document.body.classList.contains("ui-mobile")) return;
  const allowed = { game: 1, inv: 1, helper: 1, analyse: 1, menu: 1 };
  const next = allowed[tab] ? tab : "game";
  if (next === "menu") {
    toggleMobileMenu(true);
    return;
  }
  toggleMobileMenu(false);
  document.body.setAttribute("data-mobile-tab", next);
  syncMobileDockActive();
  const target =
    next === "inv" ? document.querySelector(".col-left") :
    next === "helper" ? document.querySelector('.panel[data-collapse="helper"]') :
    next === "analyse" ? document.querySelector(".col-right") :
    document.getElementById("scene-wrap");
  if (target && typeof target.scrollIntoView === "function") {
    try { target.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) {
      target.scrollIntoView(true);
    }
  }
}

function toggleMobileMenu(force) {
  const sheet = document.getElementById("mobile-menu-sheet");
  if (!sheet || !document.body) return;
  const open = force === undefined ? !sheet.classList.contains("show") : !!force;
  if (open) rebuildMobileMenuActions();
  sheet.classList.toggle("show", open);
  sheet.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("mobile-menu-open", open);
}

function closeUiModeChoiceModal() {
  const el = document.getElementById("ui-mode-modal");
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

function openUiModeChoiceModal(opts) {
  const force = !!(opts && opts.force);
  if (!force && getUiMode()) return false;
  const modal = document.getElementById("ui-mode-modal");
  if (!modal) return false;
  const suggested = suggestUiMode();
  const hint = document.getElementById("ui-mode-suggest");
  if (hint) {
    const label = suggested === "mobile"
      ? (typeof t === "function" ? t("uimode.suggest.mobile") : "Mobile")
      : (typeof t === "function" ? t("uimode.suggest.desktop") : "Desktop");
    hint.textContent = (typeof t === "function" ? t("uimode.suggest") : "Sugerido:") + " " + label;
  }
  modal.querySelectorAll("[data-ui-mode-pick]").forEach((btn) => {
    const pick = btn.getAttribute("data-ui-mode-pick");
    btn.classList.toggle("primary", pick === suggested);
  });
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  return true;
}

function bindUiModeChoice() {
  const modal = document.getElementById("ui-mode-modal");
  if (!modal) return;
  modal.querySelectorAll("[data-ui-mode-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setUiMode(btn.getAttribute("data-ui-mode-pick"));
      closeUiModeChoiceModal();
    });
  });
}

function bindMobileChrome() {
  document.querySelectorAll("#mobile-dock [data-mobile-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setMobileTab(btn.getAttribute("data-mobile-tab")));
  });
  const close = document.getElementById("mobile-menu-close");
  if (close) close.addEventListener("click", () => toggleMobileMenu(false));
  const sheet = document.getElementById("mobile-menu-sheet");
  if (sheet) {
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) toggleMobileMenu(false);
    });
  }
  // Ações do topbar no sheet: clicar fecha o menu (o botão original recebe o clique via proxy).
  const actions = document.getElementById("mobile-menu-actions");
  if (actions) {
    actions.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mobile-proxy]");
      if (!btn) return;
      const id = btn.getAttribute("data-mobile-proxy");
      const real = id && document.getElementById(id);
      if (real) {
        toggleMobileMenu(false);
        real.click();
      }
    });
  }
  rebuildMobileMenuActions();
}

function rebuildMobileMenuActions() {
  const host = document.getElementById("mobile-menu-actions");
  const topbar = document.querySelector("#app .topbar");
  if (!host || !topbar) return;
  const skip = { "btn-config": 1 };
  const bits = [];
  topbar.querySelectorAll(":scope > button").forEach((btn) => {
    if (!btn.id || skip[btn.id]) return;
    if (btn.hidden || btn.style.display === "none") return;
    const label = (btn.textContent || "").replace(/\s+/g, " ").trim() || btn.id;
    bits.push(
      `<button type="button" class="sm full mobile-menu-btn" data-mobile-proxy="${btn.id}">${label}</button>`
    );
  });
  // Acessos de caçada (HUNTS / BOSSES / TREINO) também no menu.
  document.querySelectorAll(".left-side-actions > button").forEach((btn) => {
    if (!btn.id) return;
    const label = (btn.textContent || "").replace(/\s+/g, " ").trim() || btn.id;
    bits.push(
      `<button type="button" class="sm full mobile-menu-btn" data-mobile-proxy="${btn.id}">${label}</button>`
    );
  });
  host.innerHTML = bits.join("");
}

function bootUiMode() {
  const saved = getUiMode();
  if (saved) applyUiMode(saved);
  else applyUiMode("desktop"); // sem flash de mobile até o usuário escolher
  bindUiModeChoice();
  bindMobileChrome();
  openUiModeChoiceModal();
  // Reconstrói o menu quando o app fica pronto (admin etc. podem aparecer depois).
  const app = document.getElementById("app");
  if (app && typeof MutationObserver !== "undefined") {
    const mo = new MutationObserver(() => {
      if (document.body && document.body.classList.contains("ui-mobile"))
        rebuildMobileMenuActions();
    });
    mo.observe(app, { attributes: true, attributeFilter: ["class"] });
  }
  window.addEventListener("resize", () => {
    if (document.body && document.body.classList.contains("ui-mobile")) {
      try {
        if (typeof G !== "undefined" && G.renderer && typeof G.renderer.resize === "function")
          G.renderer.resize();
      } catch (e) {}
    }
  });
}

window.UI_MODE_KEY = UI_MODE_KEY;
window.suggestUiMode = suggestUiMode;
window.getUiMode = getUiMode;
window.setUiMode = setUiMode;
window.applyUiMode = applyUiMode;
window.openUiModeChoiceModal = openUiModeChoiceModal;
window.setMobileTab = setMobileTab;
window.rebuildMobileMenuActions = rebuildMobileMenuActions;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootUiMode);
} else {
  bootUiMode();
}
