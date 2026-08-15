/* settings.js — CONFIG: idioma, FULLHD e versão Mobile/Desktop. */
"use strict";

const SETTINGS_KEY = "global-idle-settings-v1";

const ClientSettings = {
  lang: "pt",
  fullhd: false,
};

function loadClientSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.lang === "en" || data.lang === "pt") ClientSettings.lang = data.lang;
    ClientSettings.fullhd = !!data.fullhd;
  } catch (e) {}
}

function saveClientSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      lang: ClientSettings.lang,
      fullhd: !!ClientSettings.fullhd,
    }));
  } catch (e) {}
}

function clientDisplayDpr() {
  const raw = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  if (ClientSettings.fullhd) return Math.max(2, Math.min(3, Math.round(raw) || 2));
  return Math.min(2, raw);
}

function setCanvasNearest(ctx) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  if ("webkitImageSmoothingEnabled" in ctx) ctx.webkitImageSmoothingEnabled = false;
  if ("mozImageSmoothingEnabled" in ctx) ctx.mozImageSmoothingEnabled = false;
  if ("msImageSmoothingEnabled" in ctx) ctx.msImageSmoothingEnabled = false;
}

function applyClientSettings() {
  document.body.classList.toggle("fullhd", !!ClientSettings.fullhd);
  if (typeof applyI18n === "function") applyI18n(document);
  if (typeof window.refreshVocGrid === "function") window.refreshVocGrid();
  if (typeof G !== "undefined" && G.renderer && typeof G.renderer.resize === "function") {
    G.renderer.resize();
  }
}

function openConfigModal() {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modal-body");
  if (!modal || !body) return;
  const lang = ClientSettings.lang === "en" ? "en" : "pt";
  const uiMode = (typeof getUiMode === "function" && getUiMode()) ||
    (document.documentElement.getAttribute("data-ui-mode") === "mobile" ? "mobile" : "desktop");
  body.innerHTML = `
    <div class="panel-title">${t("config.title")}
      <span style="flex:1"></span>
      <button type="button" class="sm" id="cfg-close">✕</button>
    </div>
    <div class="panel-body cfg-body">
      <div class="small dim mb4">${t("config.language")}</div>
      <div class="row cfg-lang" style="gap:8px">
        <button type="button" class="sm ${lang === "pt" ? "primary" : ""}" data-cfg-lang="pt">${t("config.lang.pt")}</button>
        <button type="button" class="sm ${lang === "en" ? "primary" : ""}" data-cfg-lang="en">${t("config.lang.en")}</button>
      </div>
      <div class="small dim mt12 mb4">${t("config.uimode")}</div>
      <div class="cfg-uimode">
        <button type="button" class="sm ${uiMode === "mobile" ? "primary" : ""}" data-cfg-uimode="mobile">${t("uimode.mobile")}</button>
        <button type="button" class="sm ${uiMode === "desktop" ? "primary" : ""}" data-cfg-uimode="desktop">${t("uimode.desktop")}</button>
      </div>
      <div class="tiny dim mt8">${t("config.uimode.hint")}</div>
      <div class="small dim mt12 mb4">${t("config.graphics")}</div>
      <label class="toggle cfg-fullhd">
        <input type="checkbox" id="cfg-fullhd" ${ClientSettings.fullhd ? "checked" : ""}>
        <b>${t("config.fullhd")}</b>
      </label>
      <div class="tiny dim mt8">${t("config.fullhd.hint")}</div>
      <button type="button" class="primary full mt12" id="cfg-done">${t("config.close")}</button>
    </div>`;
  modal.classList.add("show");
  const close = () => modal.classList.remove("show");
  const closeBtn = document.getElementById("cfg-close");
  const doneBtn = document.getElementById("cfg-done");
  const fullhd = document.getElementById("cfg-fullhd");
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (doneBtn) doneBtn.addEventListener("click", close);
  body.querySelectorAll("[data-cfg-lang]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ClientSettings.lang = btn.getAttribute("data-cfg-lang") === "en" ? "en" : "pt";
      saveClientSettings();
      applyClientSettings();
      openConfigModal();
    });
  });
  body.querySelectorAll("[data-cfg-uimode]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const mode = btn.getAttribute("data-cfg-uimode") === "mobile" ? "mobile" : "desktop";
      if (typeof setUiMode === "function") setUiMode(mode);
      if (typeof rebuildMobileMenuActions === "function") rebuildMobileMenuActions();
      openConfigModal();
    });
  });
  if (fullhd) {
    fullhd.addEventListener("change", (e) => {
      ClientSettings.fullhd = !!e.target.checked;
      saveClientSettings();
      applyClientSettings();
    });
  }
}

function bindConfigButtons() {
  ["btn-config", "btn-config-login"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", openConfigModal);
  });
}

loadClientSettings();
window.ClientSettings = ClientSettings;
window.clientDisplayDpr = clientDisplayDpr;
window.setCanvasNearest = setCanvasNearest;
window.applyClientSettings = applyClientSettings;
window.openConfigModal = openConfigModal;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    applyClientSettings();
    bindConfigButtons();
  });
} else {
  applyClientSettings();
  bindConfigButtons();
}
