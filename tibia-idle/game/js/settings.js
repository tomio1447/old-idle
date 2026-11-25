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
let _cfgProviders = null; // /api/auth/providers — OAuth Discord no card social

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

function _cfgBadge(ok, text) {
  return `<span class="cfgm-badge ${ok ? "is-ok" : "is-warn"}">${text}</span>`;
}

/* Ícones de marca dos cards — Discord usa o mesmo path Clyde do botão OAuth;
 * o autenticador é o quadrado vermelho + cadeado do Oracle Authenticator. */
const _CFG_ICONS = {
  ig: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" fill="none" stroke="#E1306C" stroke-width="2"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="#E1306C" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.5" fill="#E1306C"/></svg>`,
  dc: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#5865F2" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.6 1.25a18.27 18.27 0 0 0-5.5 0 12.6 12.6 0 0 0-.61-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .07-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .07.01c.12.1.25.2.37.3a.08.08 0 0 1-.01.12c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .08.02 19.84 19.84 0 0 0 6.02-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z"/></svg>`,
  tfa: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><defs><linearGradient id="cfgOraGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5503a"/><stop offset="1" stop-color="#c74634"/></linearGradient></defs><rect x="1.6" y="1.6" width="20.8" height="20.8" rx="5" fill="url(#cfgOraGrad)"/><path fill="#fff" d="M12 5.6a3.4 3.4 0 0 0-3.4 3.4v1.9H7.6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8.8a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1V9A3.4 3.4 0 0 0 12 5.6zm-1.6 3.4a1.6 1.6 0 1 1 3.2 0v1.9h-3.2V9z"/><path fill="#c74634" d="M12 13.6a1.3 1.3 0 0 0-.65 2.43l-.3 1.47h1.9l-.3-1.47A1.3 1.3 0 0 0 12 13.6z"/></svg>`,
};
const _cfgIco = (name) => `<span class="cfgm-ico">${_CFG_ICONS[name] || ""}</span>`;

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
  const dcVerified = !!soc.discordVerified;
  const dcBadge = dcVerified
    ? _cfgBadge(true, "✓ " + _esc(soc.discord))
    : (soc.discord ? _cfgBadge(true, _esc(soc.discord)) : _cfgBadge(false, "Não vinculado"));
  const dcOauth = !!(_cfgProviders && _cfgProviders.discord);
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
        <span class="cfgm-card-title">${_cfgIco("tfa")}Autenticação de 2 fatores (2FA) ${tfaBadge}</span>
        <button type="button" class="cfgm-act ${a.totpEnabled ? "is-danger-outline" : "is-primary"}" id="cfgm-tfa-toggle">
          ${a.totpEnabled ? "Desativar 2FA" : "Ativar 2FA"}</button>
      </div>
      <div id="cfgm-tfa-box" style="display:none"></div>
      <p class="cfgm-hint">Exige um código do seu app autenticador (Google Authenticator / Authy) ao entrar na conta.</p>
    </div>

    <div class="cfgm-card">
      <span class="cfgm-card-title">Redes sociais vinculadas</span>
      <div class="cfgm-card-top">
        <span class="cfgm-card-title">${_cfgIco("ig")}Instagram ${igBadge}</span>
      </div>
      <div class="cfgm-fields">
        <input class="cfgm-input" type="text" id="cfgm-ig" maxlength="60" value="${_esc(soc.instagram || "")}" placeholder="@seu_usuario">
        <button type="button" class="cfgm-act ${soc.instagram ? "is-danger-outline" : "is-primary"}" id="cfgm-ig-btn">
          ${soc.instagram ? "Desvincular" : "Vincular Instagram"}</button>
      </div>
      <div class="cfgm-card-top">
        <span class="cfgm-card-title">${_cfgIco("dc")}Discord ${dcBadge}</span>
      </div>
      ${dcOauth ? `
      <div class="cfgm-fields">
        <button type="button" class="cfgm-act ${soc.discord ? "is-danger-outline" : "is-primary"}" id="cfgm-dc-oauth">
          ${soc.discord ? "Desvincular conta Discord" : "Conectar com Discord"}</button>
      </div>
      ${dcVerified ? "" : `
      <div class="cfgm-fields">
        <input class="cfgm-input" type="text" id="cfgm-dc" maxlength="60" value="${_esc(soc.discord || "")}" placeholder="usuario ou usuario#0000">
        <button type="button" class="cfgm-act ${soc.discord ? "is-danger-outline" : ""}" id="cfgm-dc-btn">
          ${soc.discord ? "Remover handle" : "Salvar handle"}</button>
      </div>`}` : `
      <div class="cfgm-fields">
        <input class="cfgm-input" type="text" id="cfgm-dc" maxlength="60" value="${_esc(soc.discord || "")}" placeholder="usuario ou usuario#0000">
        <button type="button" class="cfgm-act ${soc.discord ? "is-danger-outline" : "is-primary"}" id="cfgm-dc-btn">
          ${soc.discord ? "Desvincular" : "Vincular Discord"}</button>
      </div>`}
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
  const dcOauth = document.getElementById("cfgm-dc-oauth");
  if (dcOauth) dcOauth.addEventListener("click", async () => {
    const linked = !!(account.socialLinks && (account.socialLinks.discord || account.socialLinks.discordVerified));
    if (!linked) {
      /* Vínculo verificado: OAuth na mesma aba — o callback devolve
       * /?sso=<token> e o boot reentra na conta já com o nó social.discord. */
      location.href = "/api/auth/discord?token=" + encodeURIComponent(token);
      return;
    }
    dcOauth.disabled = true;
    const r = await accountSocialLink(token, "discord", "", true);
    dcOauth.disabled = false;
    if (!r.ok) { _cfgFeedback(r.msg || "Falha ao desvincular.", true); return; }
    account.socialLinks = r.social || {};
    rerender();
    _cfgFeedback("Conta Discord desvinculada.");
  });
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

  /* Moldura "gi" da cidade: mesma do picker de personagens. Remove shells
   * residuais antes de aplicar (convenção dos outros modais). */
  body.classList.forEach((cls) => {
    if (/(?:-shell|gi-picker)$/.test(cls)) body.classList.remove(cls);
  });
  body.classList.add("gi-picker");
  body.innerHTML = `
    <span class="gi-corner gi-corner--tl"></span><span class="gi-corner gi-corner--tr"></span>
    <span class="gi-corner gi-corner--bl"></span><span class="gi-corner gi-corner--br"></span>
    <div class="cfgm">
      <header class="gi-modal__header">
        <h1 class="gi-modal__title">${hasSession ? "Configurações & Conta" : t("config.title")}</h1>
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
      <footer class="gi-modal__footer">
        ${hasSession ? `<button type="button" class="gi-btn gi-btn--danger" id="cfgm-logout">${t("config.logout")}</button>` : ""}
        <button type="button" class="gi-btn gi-btn--secondary" id="cfgm-done">${t("config.close")}</button>
      </footer>
    </div>`;
  modal.classList.add("show");

  const close = () => { modal.classList.remove("show"); body.classList.remove("gi-picker"); };
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
    const prPromise = (typeof accountAuthProviders === "function")
      ? accountAuthProviders().catch(() => ({})) : Promise.resolve({});
    Promise.all([accountMe(token), prPromise]).then(([r, pr]) => {
      _cfgProviders = pr || {};
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
