/* Chat global — painel cinza (Baiak-like), SSE + poll fallback, config local. */
(function () {
  "use strict";

  const CHAT_LS_KEY = "global-idle-chat-prefs-v1";
  const CHANNELS = [
    { id: "geral", labelKey: "chat.tab.geral" },
    { id: "comunicados", labelKey: "chat.tab.comunicados", soon: true },
    { id: "help", labelKey: "chat.tab.help", soon: true },
    { id: "market", labelKey: "chat.tab.market", soon: true },
  ];

  const OBSCENE_WORDS = [
    "porra", "caralho", "puta", "puto", "merda", "fdp", "vsf", "vtnc", "pqp",
    "arrombado", "viado", "bicha", "buceta", "cuzao", "cuzão", "filho da puta",
    "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "nigga", "faggot",
  ];
  const OBSCENE_RE = new RegExp(
    "\\b(?:" + OBSCENE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
    "gi"
  );

  const ChatUI = {
    ready: false,
    channel: "geral",
    messages: [],
    seen: new Set(),
    lastId: 0,
    source: null,
    pollTimer: null,
    reconnectTimer: null,
    generation: 0,
    collapsed: false,
    prefs: { filterObscene: true, opacity: 0.72 },
  };

  function tt(key, fallback) {
    if (typeof t === "function") {
      const v = t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function apiBase() {
    if (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) return ACCOUNT_API_URL;
    try {
      if (window.GLOBAL_IDLE_SERVER_CONFIG && window.GLOBAL_IDLE_SERVER_CONFIG.apiUrl) {
        return window.GLOBAL_IDLE_SERVER_CONFIG.apiUrl;
      }
    } catch (e) {}
    return window.location.origin;
  }

  function sessionToken() {
    try { return sessionStorage.getItem("tibia-idle-token") || ""; } catch (e) { return ""; }
  }

  function charId() {
    const p = typeof G !== "undefined" && G && G.p;
    return p && p.id != null ? Number(p.id) : 0;
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(CHAT_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.filterObscene === "boolean") ChatUI.prefs.filterObscene = parsed.filterObscene;
      if (typeof parsed.opacity === "number" && parsed.opacity >= 0.2 && parsed.opacity <= 1) {
        ChatUI.prefs.opacity = parsed.opacity;
      }
      if (typeof parsed.collapsed === "boolean") ChatUI.collapsed = parsed.collapsed;
    } catch (e) {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(CHAT_LS_KEY, JSON.stringify({
        filterObscene: ChatUI.prefs.filterObscene,
        opacity: ChatUI.prefs.opacity,
        collapsed: ChatUI.collapsed,
      }));
    } catch (e) {}
  }

  function applyOpacity() {
    const root = document.getElementById("global-chat");
    if (!root) return;
    root.style.setProperty("--chat-bg-opacity", String(ChatUI.prefs.opacity));
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function filterText(text) {
    let out = String(text || "");
    if (ChatUI.prefs.filterObscene) out = out.replace(OBSCENE_RE, "***");
    return out;
  }

  function fmtTime(ts) {
    const d = new Date(ts || Date.now());
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
  }

  function ensureDom() {
    if (document.getElementById("global-chat")) return;
    const wrap = document.getElementById("scene-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.id = "global-chat";
    el.className = "global-chat";
    el.setAttribute("aria-label", "Chat");
    el.innerHTML = `
      <div class="global-chat-head">
        <div class="global-chat-tabs" id="global-chat-tabs"></div>
        <button type="button" class="sm global-chat-cfg" id="global-chat-config" data-i18n="chat.config">Config</button>
        <button type="button" class="sm global-chat-toggle" id="global-chat-toggle" title="Minimizar">▾</button>
      </div>
      <div class="global-chat-body" id="global-chat-body">
        <div class="global-chat-messages" id="global-chat-messages"></div>
        <div class="global-chat-soon" id="global-chat-soon" style="display:none"></div>
        <form class="global-chat-input-row" id="global-chat-form" autocomplete="off">
          <input type="text" id="global-chat-input" maxlength="255"
            data-i18n-placeholder="chat.placeholder" placeholder="mensagem... (/pm nickname texto)" />
          <button type="submit" class="sm primary" id="global-chat-send" title="Enviar" aria-label="Enviar">➤</button>
        </form>
      </div>`;
    wrap.appendChild(el);
    paintTabs();
    bindDom();
    applyOpacity();
    if (typeof applyI18n === "function") applyI18n(el);
  }

  function paintTabs() {
    const box = document.getElementById("global-chat-tabs");
    if (!box) return;
    box.innerHTML = CHANNELS.map((c) => {
      const active = c.id === ChatUI.channel ? " active" : "";
      const label = tt(c.labelKey, c.id);
      return `<button type="button" class="global-chat-tab${active}" data-chat-channel="${c.id}">${escapeHtml(label)}</button>`;
    }).join("");
  }

  function bindDom() {
    const tabs = document.getElementById("global-chat-tabs");
    if (tabs && !tabs._bound) {
      tabs._bound = true;
      tabs.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-chat-channel]");
        if (!btn) return;
        setChannel(btn.getAttribute("data-chat-channel"));
      });
    }
    const form = document.getElementById("global-chat-form");
    if (form && !form._bound) {
      form._bound = true;
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        sendMessage();
      });
    }
    const cfg = document.getElementById("global-chat-config");
    if (cfg && !cfg._bound) {
      cfg._bound = true;
      cfg.addEventListener("click", openChatConfigModal);
    }
    const toggle = document.getElementById("global-chat-toggle");
    if (toggle && !toggle._bound) {
      toggle._bound = true;
      toggle.addEventListener("click", () => {
        ChatUI.collapsed = !ChatUI.collapsed;
        applyCollapsed();
        savePrefs();
      });
    }
  }

  function applyCollapsed() {
    const root = document.getElementById("global-chat");
    const toggle = document.getElementById("global-chat-toggle");
    if (!root) return;
    root.classList.toggle("collapsed", !!ChatUI.collapsed);
    if (toggle) toggle.textContent = ChatUI.collapsed ? "▸" : "▾";
  }

  function setChannel(id) {
    const meta = CHANNELS.find((c) => c.id === id) || CHANNELS[0];
    ChatUI.channel = meta.id;
    paintTabs();
    renderMessages();
    const soon = document.getElementById("global-chat-soon");
    const form = document.getElementById("global-chat-form");
    const msgs = document.getElementById("global-chat-messages");
    if (meta.soon) {
      if (soon) {
        soon.style.display = "";
        soon.textContent = tt("chat.soon", "Canal em breve.");
      }
      if (form) form.style.display = "none";
      if (msgs) msgs.style.display = "none";
    } else {
      if (soon) soon.style.display = "none";
      if (form) form.style.display = "";
      if (msgs) msgs.style.display = "";
    }
  }

  function renderMessages() {
    const box = document.getElementById("global-chat-messages");
    if (!box) return;
    const list = ChatUI.messages.filter((m) => {
      if (m.channel !== ChatUI.channel) return false;
      return true;
    });
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
    box.innerHTML = list.map((m) => formatLine(m)).join("");
    if (atBottom || list.length < 3) box.scrollTop = box.scrollHeight;
  }

  function formatLine(m) {
    const time = `<span class="gc-time">${escapeHtml(fmtTime(m.ts))}</span>`;
    if (m.type === "system") {
      return `<div class="gc-line gc-system">${time} <span class="gc-sys">${escapeHtml(filterText(m.text))}</span></div>`;
    }
    if (m.type === "pm") {
      const who = escapeHtml(m.nickname || "?");
      const to = escapeHtml(m.toName || "?");
      const voc = escapeHtml(m.vocShort || "");
      const lvl = escapeHtml(String(m.level || ""));
      return `<div class="gc-line gc-pm">${time} <span class="gc-tag">[PM]</span> <span class="gc-name">${who}</span> → <span class="gc-name">${to}</span> <span class="gc-meta">[${voc}][${lvl}]</span>: <span class="gc-text">${escapeHtml(filterText(m.text))}</span></div>`;
    }
    const who = escapeHtml(m.nickname || "?");
    const voc = escapeHtml(m.vocShort || "");
    const lvl = escapeHtml(String(m.level || ""));
    return `<div class="gc-line">${time} <span class="gc-name">${who}</span> <span class="gc-meta">[${voc}][${lvl}]</span>: <span class="gc-text">${escapeHtml(filterText(m.text))}</span></div>`;
  }

  function ingest(msg) {
    if (!msg || !msg.id || ChatUI.seen.has(msg.id)) return;
    ChatUI.seen.add(msg.id);
    ChatUI.messages.push(msg);
    if (ChatUI.messages.length > 250) {
      const drop = ChatUI.messages.shift();
      if (drop) ChatUI.seen.delete(drop.id);
    }
    if (msg.id > ChatUI.lastId) ChatUI.lastId = msg.id;
    if (msg.channel === ChatUI.channel) renderMessages();
  }

  async function api(method, path, body, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    try {
      const r = await fetch(apiBase() + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = {};
      try { data = await r.json(); } catch (e) { data = {}; }
      return { code: r.status, data };
    } catch (e) {
      return { code: 0, data: { ok: false, msg: "Sem conexão" } };
    }
  }

  async function loadHistory() {
    const token = sessionToken();
    if (!token) return;
    const id = charId();
    const q = `/api/chat/history?channel=${encodeURIComponent(ChatUI.channel)}&limit=80&charId=${id}`;
    const r = await api("GET", q, null, token);
    if (!r.data || !r.data.ok || !Array.isArray(r.data.messages)) return;
    for (const msg of r.data.messages) ingest(msg);
    renderMessages();
  }

  async function sendMessage() {
    const input = document.getElementById("global-chat-input");
    if (!input) return;
    const text = String(input.value || "").trim();
    if (!text) return;
    const token = sessionToken();
    const id = charId();
    if (!token || !id) {
      toastChat(tt("chat.needLogin", "Faça login para usar o chat."));
      return;
    }
    if (ChatUI.channel !== "geral") {
      toastChat(tt("chat.soon", "Canal em breve."));
      return;
    }
    input.disabled = true;
    const r = await api("POST", "/api/chat/send", {
      token, text, channel: ChatUI.channel, charId: id,
    }, token);
    input.disabled = false;
    if (!r.data || !r.data.ok) {
      toastChat((r.data && r.data.msg) || tt("chat.sendFail", "Falha ao enviar."));
      return;
    }
    input.value = "";
    if (r.data.message) ingest(r.data.message);
    input.focus();
  }

  function toastChat(msg) {
    if (typeof addLog === "function") addLog("say", escapeHtml(msg));
    else if (typeof console !== "undefined") console.warn("[chat]", msg);
  }

  async function startSse(generation) {
    const token = sessionToken();
    const id = charId();
    if (!token || !id) return false;
    const ticketRes = await api("POST", "/api/chat/ticket", { token, charId: id }, token);
    if (generation !== ChatUI.generation) return false;
    if (!ticketRes.data || !ticketRes.data.ok || !ticketRes.data.ticket) {
      startPoll(generation);
      return false;
    }
    stopSse();
    const url = apiBase() + "/api/chat/events?ticket=" + encodeURIComponent(ticketRes.data.ticket) +
      (ChatUI.lastId ? "&lastEventId=" + ChatUI.lastId : "");
    let source;
    try {
      source = new EventSource(url);
    } catch (e) {
      startPoll(generation);
      return false;
    }
    ChatUI.source = source;
    source.addEventListener("chat", (ev) => {
      if (generation !== ChatUI.generation) return;
      try {
        const msg = JSON.parse(ev.data);
        ingest(msg);
      } catch (e) {}
    });
    source.addEventListener("ready", () => {
      stopPoll();
    });
    source.addEventListener("chat-expired", () => {
      try { source.close(); } catch (e) {}
      if (ChatUI.source === source) ChatUI.source = null;
      scheduleReconnect(generation);
    });
    source.onerror = () => {
      try { source.close(); } catch (e) {}
      if (ChatUI.source === source) ChatUI.source = null;
      startPoll(generation);
      scheduleReconnect(generation);
    };
    return true;
  }

  function stopSse() {
    if (ChatUI.source) {
      try { ChatUI.source.close(); } catch (e) {}
      ChatUI.source = null;
    }
  }

  function startPoll(generation) {
    stopPoll();
    ChatUI.pollTimer = setInterval(() => {
      if (generation !== ChatUI.generation) return;
      pollOnce(generation);
    }, 2500);
    pollOnce(generation);
  }

  function stopPoll() {
    if (ChatUI.pollTimer) {
      clearInterval(ChatUI.pollTimer);
      ChatUI.pollTimer = null;
    }
  }

  async function pollOnce(generation) {
    const token = sessionToken();
    if (!token) return;
    const id = charId();
    const q = `/api/chat/history?channel=geral&since=${ChatUI.lastId}&limit=50&charId=${id}`;
    const r = await api("GET", q, null, token);
    if (generation !== ChatUI.generation) return;
    if (!r.data || !r.data.ok || !Array.isArray(r.data.messages)) return;
    for (const msg of r.data.messages) ingest(msg);
  }

  function scheduleReconnect(generation) {
    clearTimeout(ChatUI.reconnectTimer);
    ChatUI.reconnectTimer = setTimeout(() => {
      if (generation !== ChatUI.generation) return;
      startSse(generation);
    }, 2000);
  }

  function openChatConfigModal() {
    const modal = document.getElementById("modal");
    const body = document.getElementById("modal-body");
    if (!modal || !body) return;
    const opacityPct = Math.round(ChatUI.prefs.opacity * 100);
    body.innerHTML = `
      <div class="panel-title">${escapeHtml(tt("chat.configTitle", "Configurar Chat"))}
        <span style="flex:1"></span><button class="sm" id="chatcfg-close">✕</button>
      </div>
      <div class="panel-body">
        <div class="panel-inset" style="padding:10px;margin-bottom:10px">
          <label class="row" style="gap:8px;align-items:center;cursor:pointer">
            <input type="checkbox" id="chatcfg-filter" ${ChatUI.prefs.filterObscene ? "checked" : ""} />
            <span>${escapeHtml(tt("chat.filterObscene", "Ocultar mensagens obscenas"))}</span>
          </label>
          <div class="tiny dim mt4">${escapeHtml(tt("chat.filterHint", "Substitui palavrões por *** neste cliente."))}</div>
        </div>
        <div class="panel-inset" style="padding:10px">
          <div class="small mb4">${escapeHtml(tt("chat.opacity", "Opacidade do fundo"))}: <b id="chatcfg-opacity-val">${opacityPct}%</b></div>
          <input type="range" id="chatcfg-opacity" min="20" max="100" step="1" value="${opacityPct}" style="width:100%" />
          <div class="tiny dim mt4">${escapeHtml(tt("chat.opacityHint", "Ajuste a transparência do painel sobre a caçada."))}</div>
        </div>
      </div>`;
    modal.classList.add("show");
    const close = () => { modal.classList.remove("show"); };
    document.getElementById("chatcfg-close").addEventListener("click", close);
    const filter = document.getElementById("chatcfg-filter");
    filter.addEventListener("change", () => {
      ChatUI.prefs.filterObscene = !!filter.checked;
      savePrefs();
      renderMessages();
    });
    const slider = document.getElementById("chatcfg-opacity");
    const val = document.getElementById("chatcfg-opacity-val");
    slider.addEventListener("input", () => {
      const pct = Number(slider.value) || 72;
      ChatUI.prefs.opacity = Math.min(1, Math.max(0.2, pct / 100));
      if (val) val.textContent = Math.round(ChatUI.prefs.opacity * 100) + "%";
      applyOpacity();
      savePrefs();
    });
  }

  function showChat() {
    loadPrefs();
    ensureDom();
    const root = document.getElementById("global-chat");
    if (!root) return;
    root.style.display = "";
    applyOpacity();
    applyCollapsed();
    setChannel(ChatUI.channel);
    ChatUI.generation += 1;
    const gen = ChatUI.generation;
    ChatUI.ready = true;
    loadHistory().then(() => startSse(gen));
  }

  function hideChat() {
    ChatUI.generation += 1;
    ChatUI.ready = false;
    stopSse();
    stopPoll();
    clearTimeout(ChatUI.reconnectTimer);
    const root = document.getElementById("global-chat");
    if (root) root.style.display = "none";
  }

  window.ChatUI = ChatUI;
  window.showGlobalChat = showChat;
  window.hideGlobalChat = hideChat;
  window.openChatConfigModal = openChatConfigModal;
})();
