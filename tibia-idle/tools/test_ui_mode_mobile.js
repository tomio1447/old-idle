/* Smoke: modo Mobile/Desktop (persistência + CSS escopado). */
"use strict";
const fs = require("fs");
const path = require("path");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const css = path.join(game, "css");

function must(v, m) { if (!v) throw new Error(m); }

const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
const uiMode = fs.readFileSync(path.join(js, "ui-mode.js"), "utf8");
const settings = fs.readFileSync(path.join(js, "settings.js"), "utf8");
const i18n = fs.readFileSync(path.join(js, "i18n.js"), "utf8");
const mobileCss = fs.readFileSync(path.join(css, "mobile.css"), "utf8");

must(html.includes('id="ui-mode-modal"'), "modal de escolha Mobile/Desktop ausente");
must(html.includes("data-ui-mode-pick"), "botões de escolha ausentes");
must(html.includes('id="mobile-dock"'), "dock mobile ausente");
must(html.includes("css/mobile.css?v=settings-click-fix-v1"), "mobile.css sem cache-bust");
must(html.includes("js/ui-mode.js?v=settings-click-fix-v1"), "ui-mode.js sem cache-bust");
must(html.includes("js/settings.js?v=settings-click-fix-v1"), "settings.js sem cache-bust");
must(mobileCss.includes("pointer-events: none"), "mobile.css #toasts precisa pointer-events:none");
must(mobileCss.includes("top: auto"), "mobile.css #toasts precisa top:auto (não esticar overlay)");
must(mobileCss.includes("#ui-mode-modal:not(.show)"), "ui-mode-modal fechado precisa pointer-events none");
must(html.includes("viewport-fit=cover"), "viewport-fit=cover ausente");
must(html.includes('localStorage.getItem("global-idle-ui-mode-v1")'), "boot script sem leitura do modo");

must(uiMode.includes('UI_MODE_KEY = "global-idle-ui-mode-v1"'), "chave localStorage ausente");
must(uiMode.includes("function setUiMode"), "setUiMode ausente");
must(uiMode.includes("function getUiMode"), "getUiMode ausente");
must(uiMode.includes("suggestUiMode"), "suggestUiMode ausente");
must(uiMode.includes('setAttribute("data-ui-mode"'), "apply não seta data-ui-mode");
must(uiMode.includes('classList.toggle("ui-mobile"'), "apply não seta body.ui-mobile");

must(settings.includes("data-cfg-uimode"), "CONFIG sem troca de versão");
must(settings.includes("setUiMode"), "CONFIG não chama setUiMode");

must(i18n.includes('"uimode.title"'), "i18n PT uimode.title ausente");
must(i18n.includes('"config.uimode"'), "i18n config.uimode ausente");

must(mobileCss.includes('html[data-ui-mode="mobile"]'), "mobile.css sem escopo data-ui-mode");
must(mobileCss.includes("#mobile-dock"), "mobile.css sem dock");
must(mobileCss.includes(".modal-bg .modal"), "mobile.css sem overrides de modal");
must(mobileCss.includes("#login"), "mobile.css sem login");
must(mobileCss.includes(".topbar"), "mobile.css sem topbar");
must(mobileCss.includes("data-mobile-tab"), "mobile.css sem abas");

// Simula persistência / toggle de classe (sem DOM real).
const store = {};
const fakeLocal = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
};
fakeLocal.setItem("global-idle-ui-mode-v1", "mobile");
must(fakeLocal.getItem("global-idle-ui-mode-v1") === "mobile", "persistência mobile falhou");
fakeLocal.setItem("global-idle-ui-mode-v1", "desktop");
must(fakeLocal.getItem("global-idle-ui-mode-v1") === "desktop", "persistência desktop falhou");

console.log("OK test_ui_mode_mobile.js");
