/* settings.js — Gerenciador de Contas + Configurações.
 * Aba "Configurações": idioma, versão da interface, FULLHD, auto-reconnect.
 * Aba "Conta & Segurança": e-mail, telefone, 2FA e redes sociais vinculadas
 * (só com sessão online — na tela de login a aba fica oculta). */
"use strict";

const SETTINGS_KEY = "global-idle-settings-v1";

const ClientSettings = {
  lang: "pt",
  fullhd: false,
  autoReconnect: false,
};

let _cfgTab = "settings"; // aba ativa sobrevive a re-renderizações

function loadClientSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.lang === "en" || data.lang === "pt") ClientSettings.lang = data.lang;
    ClientSettings.fullhd = !!data.fullhd;
    ClientSettings.autoReconnect = !!data.autoReconnect;
  } catch (e) {}
}

function saveClientSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      lang: ClientSettings.lang,
      fullhd: !!ClientSettings.fullhd,
      autoReconnect: !!ClientSettings.autoReconnect,
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

/* ------------------------- aba Configurações ------------------------- */
function _cfgSettingsPanelHtml() {
  const lang = ClientSettings.lang === "en" ? "en" : "pt";
  const uiMode = (typeof getUiMode === "function" && getUiMode()) ||
    (document.documentElement.getAttribute("data-ui-mode") === "mobile" ? "mobile" : "desktop");
  return `
    <div class="cfgm-block">
      <span class="cfgm-label">${t("config.language")}</span>
      <div class="cfgm-row2" id="cfgm-lang">
        <button type="button" class="cfgm-choice ${lang === "pt" ? "is-sel" : ""}" data-cfg-lang="pt">${t("config.lang.pt")}</button>
        <button type="button" class="cfgm-choice ${lang === "en" ? "is-sel" : ""}" data-cfg-lang="en">${t("config.lang.en")}</button>
      </div>
    </div>
    <div class="cfgm-block">
      <span class="cfgm-label">${t("config.uimode")}</span>
      <div class="cfgm-row2" id="cfgm-uimode">
        <button type="button" class="cfgm-mode ${uiMode === "mobile" ? "is-sel" : ""}" data-cfg-uimode="mobile">${t("uimode.mobile")}</button>
        <button type="button" class="cfgm-mode ${uiMode === "desktop" ? "is-sel" : ""}" data-cfg-uimode="desktop">${t("uimode.desktop")}</button>
      </div>
      <p class="cfgm-hint">${t("config.uimode.hint")}</p>
    </div>
    <div class="cfgm-block">
      <span class="cfgm-label">${t("config.graphics")}</span>
      <label class="cfgm-check">
        <input type="checkbox" id="cfgm-fullhd" ${ClientSettings.fullhd ? "checked" : ""}>
        <span>${t("config.fullhd")}</span>
      </label>
      <p class="cfgm-hint">${t("config.fullhd.hint")}</p>
    </div>
    <div class="cfgm-block">
      <span class="cfgm-label">${t("config.online")}</span>
      <label class="cfgm-check">
        <input type="checkbox" id="cfgm-autoreconnect" ${ClientSettings.autoReconnect ? "checked" : ""}>
        <span>${t("config.autoreconnect")}</span>
      </label>
      <p class="cfgm-hint">${t("config.autoreconnect.hint")}</p>
    </div>`;
}

function _bindSettingsPanel(body) {
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
  const fullhd = document.getElementById("cfgm-fullhd");
  if (fullhd) fullhd.addEventListener("change", (e) => {
    ClientSettings.fullhd = !!e.target.checked;
    saveClientSettings();
    applyClientSettings();
  });
  const autoRc = document.getElementById("cfgm-autoreconnect");
  if (autoRc) autoRc.addEventListener("change", (e) => {
    ClientSettings.autoReconnect = !!e.target.checked;
    saveClientSettings();
  });
}

/* ------------------------ aba Conta & Segurança -----------------------
 * Estado vem de accountMe(token) fresco; cada ação atualiza o objeto local
 * e re-renderiza só o painel. */
const _esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function _cfgBadge(ok, okText, noText) {
  return `<span class="cfgm-badge ${ok ? "is-ok" : "is-warn"}">${ok ? okText : noText}</span>`;
}

function _cfgAccountPanelHtml(account) {
  const a = account || {};
  const soc = a.socialLinks || {};
  const emailBadge = a.emailVerified
    ? _cfgBadge(true, "Confirmado") : _cfgBadge(false, "Não confirmado");
  const phoneBadge = a.phoneVerified
    ? _cfgBadge(true, "Confirmado") : _cfgBadge(false, "Não confirmado");
  const tfaBadge = a.totpEnabled
    ? _cfgBadge(true, "Ativado") : _cfgBadge(false, "Desativado");
  const igBadge = soc.instagram
    ? _cfgBadge(true, "@" + _esc(soc.instagram)) : _cfgBadge(false, "Não vinculado");
  const dcBadge = soc.discord
    ? _cfgBadge(true, _esc(soc.discord)) : _cfgBadge(false, "Não vinculado");
  return `
    <div class="cfgm-card">
      <div class="cfgm-card-top">
        <span class="cfgm-card-title">E-mail da conta ${emailBadge}</span>
      </div>
      <div class="cfgm-fields">
        <input class="cfgm-input" type="email" id="cfgm-email" value="${_esc(a.email || "")}" placeholder="seu@email.com">
        <button type="button" class="cfgm-act is-primary" id="cfgm-email-send">
          ${a.emailVerified ? "Alterar e-mail" : "Enviar confirmação"}</button>
      </div>
      <div class="cfgm-fields" id="cfgm-email-codebox" style="display:none">
        <input class="cfgm-input" type="text" id="cfgm-email-code" maxlength="6" placeholder="Código de 6 dígitos enviado ao e-mail">
        <button type="button" class="cfgm-act" id="cfgm-email-confirm">Confirmar e-mail</button>
      </div>
      <p class="cfgm-hint">Necessário para recuperação de conta e alertas de login.</p>
    </div>

    <div class="cfgm-card">
      <div class="cfgm-card-top">
        <span class="cfgm-card-title">Número de telefone ${phoneBadge}</span>
      </div>
      <div class="cfgm-fields">
        <input class="cfgm-input" type="tel" id="cfgm-phone" value="${_esc(a.phone || "")}" placeholder="+55 (47) 99999-9999">
        <button type="button" class="cfgm-act is-primary" id="cfgm-phone-send">Enviar código</button>
      </div>
      <div class="cfgm-fields" id="cfgm-phone-codebox" style="display:none">
        <input class="cfgm-input" type="text" id="cfgm-phone-code" maxlength="6" placeholder="Código de 6 dígitos">
        <button type="button" class="cfgm-act" id="cfgm-phone-confirm">Confirmar número</button>
      </div>
      <p class="cfgm-hint">O código chega no e-mail da conta enquanto não há envio por SMS.</p>
    </div>

    <div class="cfgm-card">
      <div class="cfgm-card-top">
        <span class="cfgm-card-title">Autenticação de 2 fatores (2FA) ${tfaBadge}</span>
        <button type="button" class="cfgm-act ${a.totpEnabled ? "is-danger-outline" : "is-primary"}" id="cfgm-tfa-toggle">
          ${a.totpEnabled ? "Desativar 2FA" : "Ativar 2FA"}</button>
      </div>
      <div id="cfgm-tfa-box" style="display:none"></div>
      <p class="cfgm-hint">Exige um código do seu app autenticador (Google Authenticator / Authy) ao entrar na conta.</p>
    </div>

    <div class="cfgm-card">
      <span class="cfgm-card-title">Redes sociais vinculadas</span>
      <div class="cfgm-card-top">
        <span class="cfgm-card-title">Instagram ${igBadge}</span>
      </div>
      <div class="cfgm-fields">
        <input class="cfgm-input" type="text" id="cfgm-ig" maxlength="60" value="${_esc(soc.instagram || "")}" placeholder="@seu_usuario">
        <button type="button" class="cfgm-act ${soc.instagram ? "is-danger-outline" : "is-primary"}" id="cfgm-ig-btn">
          ${soc.instagram ? "Desvincular" : "Vincular Instagram"}</button>
      </div>
      <div class="cfgm-card-top">
        <span class="cfgm-card-title">Discord ${dcBadge}</span>
      </div>
      <div class="cfgm-fields">
        <input class="cfgm-input" type="text" id="cfgm-dc" maxlength="60" value="${_esc(soc.discord || "")}" placeholder="usuario ou usuario#0000">
        <button type="button" class="cfgm-act ${soc.discord ? "is-danger-outline" : "is-primary"}" id="cfgm-dc-btn">
          ${soc.discord ? "Desvincular" : "Vincular Discord"}</button>
      </div>
      <p class="cfgm-hint">Usado pela equipe para eventos, sorteios e suporte da comunidade.</p>
    </div>

    <div class="cfgm-feedback" id="cfgm-feedback" aria-live="polite"></div>`;
}

function _cfgFeedback(msg, isErr) {
  const el = document.getElementById("cfgm-feedback");
  if (el) { el.textContent = msg || ""; el.classList.toggle("is-err", !!isErr); }
}

function _cfgRerenderAccount(body, account) {
  const panel = body.querySelector("#cfgm-panel-account");
  if (!panel) return;
  panel.innerHTML = _cfgAccountPanelHtml(account);
  _bindAccountPanel(body, account);
}

function _bindAccountPanel(body, account) {
  const token = (typeof sessionToken === "function") ? sessionToken() : "";
  const rerender = () => _cfgRerenderAccount(body, account);

  /* ---- e-mail ---- */
  const emailSend = document.getElementById("cfgm-email-send");
  if (emailSend) emailSend.addEventListener("click", async () => {
    const email = (document.getElementById("cfgm-email").value || "").trim();
    if (!email.includes("@")) { _cfgFeedback("Informe um e-mail válido.", true); return; }
    emailSend.disabled = true;
    const r = await accountEmailSendCode(token, email);
    emailSend.disabled = false;
    if (!r.ok) { _cfgFeedback(r.msg || "Falha ao enviar o código.", true); return; }
    if (r.alreadyVerified) { account.emailVerified = true; account.email = email; rerender(); return; }
    account.email = email;
    document.getElementById("cfgm-email-codebox").style.display = "";
    _cfgFeedback(r.devCode ? "DEV: código " + r.devCode : (r.msg || "Código enviado."));
  });
  const emailConfirm = document.getElementById("cfgm-email-confirm");
  if (emailConfirm) emailConfirm.addEventListener("click", async () => {
    const code = (document.getElementById("cfgm-email-code").value || "").trim();
    emailConfirm.disabled = true;
    const r = await accountEmailVerify(token, code);
    emailConfirm.disabled = false;
    if (!r.ok) { _cfgFeedback(r.msg || "Código incorreto.", true); return; }
    account.emailVerified = true;
    try { sessionStorage.setItem("tibia-idle-account", JSON.stringify(account)); } catch (e) {}
    _cfgFeedback("");
    rerender();
    _cfgFeedback("E-mail confirmado com sucesso.");
  });

  /* ---- telefone ---- */
  const phoneSend = document.getElementById("cfgm-phone-send");
  if (phoneSend) phoneSend.addEventListener("click", async () => {
    const phone = (document.getElementById("cfgm-phone").value || "").trim();
    phoneSend.disabled = true;
    const r = await accountPhoneSend(token, phone);
    phoneSend.disabled = false;
    if (!r.ok) { _cfgFeedback(r.msg || "Falha ao enviar o código.", true); return; }
    account.phone = phone; account.phoneVerified = false;
    document.getElementById("cfgm-phone-codebox").style.display = "";
    _cfgFeedback(r.devCode ? "DEV: código " + r.devCode : (r.msg || "Código enviado."));
  });
  const phoneConfirm = document.getElementById("cfgm-phone-confirm");
  if (phoneConfirm) phoneConfirm.addEventListener("click", async () => {
    const code = (document.getElementById("cfgm-phone-code").value || "").trim();
    phoneConfirm.disabled = true;
    const r = await accountPhoneVerify(token, code);
    phoneConfirm.disabled = false;
    if (!r.ok) { _cfgFeedback(r.msg || "Código incorreto.", true); return; }
    account.phoneVerified = true;
    rerender();
    _cfgFeedback("Número de telefone confirmado com sucesso.");
  });

  /* ---- 2FA ---- */
  const tfaToggle = document.getElementById("cfgm-tfa-toggle");
  if (tfaToggle) tfaToggle.addEventListener("click", async () => {
    const box = document.getElementById("cfgm-tfa-box");
    if (!account.totpEnabled) {
      tfaToggle.disabled = true;
      const r = await account2faSetup(token);
      tfaToggle.disabled = false;
      if (!r.ok) { _cfgFeedback(r.msg || "Falha ao gerar o código.", true); return; }
      box.style.display = "";
      box.innerHTML = `
        ${r.qr ? `<div class="cfgm-qr"><img src="${r.qr}" alt="QR do autenticador"></div>` : ""}
        <div class="cfgm-fields">
          <input class="cfgm-input is-mono" type="text" id="cfgm-tfa-secret" readonly value="${_esc(r.secret || "")}" title="Chave manual — clique para selecionar">
        </div>
        <div class="cfgm-fields">
          <input class="cfgm-input" type="text" id="cfgm-tfa-code" maxlength="6" placeholder="Código de 6 dígitos do app">
          <button type="button" class="cfgm-act" id="cfgm-tfa-activate">Validar e ativar</button>
        </div>`;
      const sec = document.getElementById("cfgm-tfa-secret");
      if (sec) sec.addEventListener("click", () => sec.select());
      document.getElementById("cfgm-tfa-activate").addEventListener("click", async () => {
        const code = (document.getElementById("cfgm-tfa-code").value || "").trim();
        const r2 = await account2faConfirm(token, code);
        if (!r2.ok) { _cfgFeedback(r2.msg || "Código inválido.", true); return; }
        account.totpEnabled = true;
        rerender();
        _cfgFeedback("Autenticação de 2 fatores ativada.");
      });
      _cfgFeedback("Escaneie o QR ou use a chave no app autenticador e informe o código.");
    } else {
      box.style.display = "";
      box.innerHTML = `
        <div class="cfgm-fields">
          <input class="cfgm-input" type="text" id="cfgm-tfa-code" maxlength="6" placeholder="Código atual do autenticador">
          <button type="button" class="cfgm-act is-danger-outline" id="cfgm-tfa-off">Desativar</button>
        </div>`;
      document.getElementById("cfgm-tfa-off").addEventListener("click", async () => {
        const code = (document.getElementById("cfgm-tfa-code").value || "").trim();
        const r2 = await account2faDisable(token, code);
        if (!r2.ok) { _cfgFeedback(r2.msg || "Código inválido.", true); return; }
        account.totpEnabled = false;
        rerender();
        _cfgFeedback("Autenticação de 2 fatores desativada.");
      });
    }
  });

  /* ---- redes sociais ---- */
  [["ig", "instagram"], ["dc", "discord"]].forEach(([key, provider]) => {
    const btn = document.getElementById("cfgm-" + key + "-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const linked = !!(account.socialLinks && account.socialLinks[provider]);
      const handle = linked ? "" : (document.getElementById("cfgm-" + key).value || "").trim();
      if (!linked && !handle) { _cfgFeedback("Informe o usuário para vincular.", true); return; }
      btn.disabled = true;
      const r = await accountSocialLink(token, provider, handle);
      btn.disabled = false;
      if (!r.ok) { _cfgFeedback(r.msg || "Falha ao salvar.", true); return; }
      account.socialLinks = r.social || {};
      rerender();
      _cfgFeedback(handle ? provider + " vinculado à sua conta." : provider + " desvinculado.");
    });
  });
}

/* ------------------------------ modal ------------------------------ */
function openConfigModal() {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modal-body");
  if (!modal || !body) return;
  const hasSession = typeof sessionToken === "function" && !!sessionToken() &&
    typeof accountMe === "function";
  if (!hasSession) _cfgTab = "settings";

  body.innerHTML = `
    <div class="cfgm">
      <header class="cfgm-header">
        <h2 class="cfgm-title">${hasSession ? "Configurações & Conta" : t("config.title")}</h2>
        <button type="button" class="cfgm-x" id="cfgm-close" aria-label="Fechar">✕</button>
      </header>
      ${hasSession ? `
      <nav class="cfgm-tabs">
        <button type="button" class="cfgm-tab ${_cfgTab === "settings" ? "is-active" : ""}" data-cfgm-tab="settings">${t("config.title")}</button>
        <button type="button" class="cfgm-tab ${_cfgTab === "account" ? "is-active" : ""}" data-cfgm-tab="account">Conta &amp; Segurança</button>
      </nav>` : ""}
      <div class="cfgm-body">
        <div class="cfgm-panel ${_cfgTab === "settings" ? "is-active" : ""}" id="cfgm-panel-settings">
          ${_cfgSettingsPanelHtml()}
        </div>
        ${hasSession ? `<div class="cfgm-panel ${_cfgTab === "account" ? "is-active" : ""}" id="cfgm-panel-account">
          <div class="cfgm-hint">Carregando dados da conta...</div>
        </div>` : ""}
      </div>
      <footer class="cfgm-footer">
        ${hasSession ? `<button type="button" class="cfgm-logout" id="cfgm-logout">${t("config.logout")}</button>` : ""}
        <button type="button" class="cfgm-done" id="cfgm-done">${t("config.close")}</button>
      </footer>
    </div>`;
  modal.classList.add("show");

  const close = () => modal.classList.remove("show");
  const closeBtn = document.getElementById("cfgm-close");
  const doneBtn = document.getElementById("cfgm-done");
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (doneBtn) doneBtn.addEventListener("click", close);

  body.querySelectorAll("[data-cfgm-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _cfgTab = btn.getAttribute("data-cfgm-tab") === "account" ? "account" : "settings";
      body.querySelectorAll("[data-cfgm-tab]").forEach((b) =>
        b.classList.toggle("is-active", b === btn));
      body.querySelectorAll(".cfgm-panel").forEach((p) =>
        p.classList.toggle("is-active", p.id === "cfgm-panel-" + _cfgTab));
    });
  });

  _bindSettingsPanel(body);

  const logoutBtn = document.getElementById("cfgm-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", () => {
    close();
    if (window.accountCharOps && typeof window.accountCharOps.logout === "function") {
      window.accountCharOps.logout();
    }
  });

  if (hasSession) {
    const token = sessionToken();
    accountMe(token).then((r) => {
      const panel = body.querySelector("#cfgm-panel-account");
      if (!panel || !modal.classList.contains("show")) return;
      const account = (r && r.ok && r.account) ? r.account : {};
      if (!r || !r.ok) {
        panel.innerHTML = `<div class="cfgm-hint">Sessão expirada — faça login novamente.</div>`;
        return;
      }
      try { sessionStorage.setItem("tibia-idle-account", JSON.stringify(account)); } catch (e) {}
      panel.innerHTML = _cfgAccountPanelHtml(account);
      _bindAccountPanel(body, account);
    }).catch(() => {});
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
