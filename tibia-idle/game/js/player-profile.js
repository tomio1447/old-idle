/* player-profile.js — perfil público de um personagem.
 *
 * Aberto ao clicar no nome de um personagem (lista de membros da guild,
 * solicitações, ranking). Mostra nome/vocação/level, a PT dele e as
 * skills. Dados vêm de GET /api/character/profile (sessão obrigatória).
 */
"use strict";
(function () {
  function injectStyle() {
    if (document.getElementById("player-profile-style")) return;
    var st = document.createElement("style");
    st.id = "player-profile-style";
    st.textContent =
      ".player-profile-bg{position:fixed;inset:0;z-index:99998;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.62)}" +
      ".player-profile{width:min(430px,92vw);padding:16px 14px 12px;" +
      "background:linear-gradient(180deg,#2b2820,#171512);border:2px solid;" +
      "border-color:#686252 #17150f #17150f #686252;box-shadow:0 14px 44px rgba(0,0,0,.7)}" +
      ".player-profile-title{color:#f1db7a;font-weight:700;font-size:14px;" +
      "letter-spacing:.4px;text-align:center}" +
      ".player-profile-sub{color:#a9a08d;font-size:11px;text-align:center;margin-bottom:12px}" +
      ".player-profile-sec{color:#8f8775;font-size:9px;letter-spacing:.5px;" +
      "text-transform:uppercase;margin:10px 0 4px;border-bottom:1px solid #3a362b;padding-bottom:3px}" +
      ".player-profile-party{display:flex;flex-direction:column;gap:3px}" +
      ".player-profile-party .row{display:flex;align-items:center;gap:6px;" +
      "padding:4px 6px;background:#1d1a15;border:1px solid #37322a}" +
      ".player-profile-party .row .nm{flex:1;color:#e8dfc8;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".player-profile-party .row .meta{color:#8f8775;font-size:10px}" +
      ".player-profile-party .row .lead{color:#ffe680;font-size:9px;letter-spacing:.4px}" +
      ".player-profile-skills{display:grid;grid-template-columns:1fr 1fr;gap:3px 14px}" +
      ".player-profile-skills .row{display:flex;justify-content:space-between;" +
      "padding:2px 4px;font-size:11px;color:#c9c3b2}" +
      ".player-profile-skills .row b{color:#f1db7a}" +
      ".player-profile-empty{color:#8f8775;font-size:11px;padding:4px 0}" +
      ".player-profile-close{display:block;margin:12px auto 0;min-width:110px}";
    document.head.appendChild(st);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function vocLabel(voc) {
    try {
      if (typeof vocationName === "function") return vocationName({ voc: voc });
    } catch (e) {}
    return String(voc || "");
  }
  function skillLabel(key) {
    if (typeof SKILL_NAMES === "object" && SKILL_NAMES && SKILL_NAMES[key])
      return SKILL_NAMES[key];
    return key;
  }

  function profileBody(p) {
    var partyRows = "";
    if (p.party && Array.isArray(p.party.members) && p.party.members.length) {
      partyRows = p.party.members.map(function (m) {
        return '<div class="row">' +
          '<span class="nm">' + esc(m.name) + '</span>' +
          (m.leader ? '<span class="lead">LÍDER</span>' : "") +
          '<span class="meta">' + esc(vocLabel(m.voc)) + ' · Nv ' + esc(m.level) + '</span>' +
        '</div>';
      }).join("");
    } else {
      partyRows = '<div class="player-profile-empty">Sem party.</div>';
    }
    var sk = p.skills || {};
    var skillRows = ["fist", "sword", "axe", "club", "dist", "shield"].map(function (k) {
      return '<div class="row"><span>' + esc(skillLabel(k)) + '</span><b>' + esc(sk[k] == null ? 10 : sk[k]) + '</b></div>';
    }).join("") +
      '<div class="row"><span>' + esc(skillLabel("magic")) + '</span><b>' + esc(p.magicLevel || 0) + '</b></div>';
    return (
      '<div class="player-profile-title">' + esc(p.name) + '</div>' +
      '<div class="player-profile-sub">' + esc(vocLabel(p.voc)) + ' · Level ' + esc(p.level) + '</div>' +
      '<div class="player-profile-sec">Party</div>' +
      '<div class="player-profile-party">' + partyRows + '</div>' +
      '<div class="player-profile-sec">Skills</div>' +
      '<div class="player-profile-skills">' + skillRows + '</div>' +
      '<button class="primary player-profile-close" id="player-profile-close">Fechar</button>'
    );
  }

  async function openPlayerProfile(charId) {
    var id = Number(charId);
    if (!id) return;
    var tok = "";
    try { tok = sessionStorage.getItem("tibia-idle-token") || ""; } catch (e) {}
    if (!tok) return;
    try {
      var apiBase = (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) || "";
      var r = await fetch(apiBase + "/api/character/profile?char_id=" + encodeURIComponent(id), {
        headers: { authorization: "Bearer " + tok }, cache: "no-store",
      });
      var d = await r.json().catch(function () { return null; });
      if (!d || !d.ok || !d.profile) {
        if (typeof msg === "function") msg((d && d.msg) || "Perfil indisponível.");
        return;
      }
      injectStyle();
      var old = document.getElementById("player-profile-modal");
      if (old) old.remove();
      var bg = document.createElement("div");
      bg.id = "player-profile-modal";
      bg.className = "player-profile-bg";
      bg.innerHTML = '<div class="player-profile panel">' + profileBody(d.profile) + '</div>';
      bg.addEventListener("click", function (e) { if (e.target === bg) bg.remove(); });
      document.body.appendChild(bg);
      var btn = bg.querySelector("#player-profile-close");
      if (btn) btn.addEventListener("click", function () { bg.remove(); });
    } catch (e) {
      if (typeof msg === "function") msg("Falha ao carregar o perfil.");
    }
  }
  window.openPlayerProfile = openPlayerProfile;
})();
