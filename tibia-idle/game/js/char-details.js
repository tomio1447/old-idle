/*
 * char-details.js — "Detalhes do personagem"
 *
 * Janela única aberta pelo ícone de personagem da topbar. Segue o padrão das
 * telas de referência: mesma moldura para todas as abas, retrato + nome no
 * topo e o conteúdo dentro do mesmo espaço.
 *
 * Abas:
 *   Personagem — faixa de troca (todos os personagens da conta/roster) +
 *                atributos, skills, detalhes de combate, proteções e
 *                progressão do personagem ativo.
 *   Outfit     — guarda-roupa gi-*: prévia viva com rotação + toggles de
 *                addon/montaria/cores à esquerda e catálogo próprio
 *                (abas Visuais/Montarias, busca, cards equipado/bloqueado)
 *                à direita, sobre os mesmos dados do cycloAppearance().
 *   Roda       — Wheel of Destiny embutida (mesmo planner do openWheelModal,
 *                mas renderizada dentro da aba).
 *   Deaths     — histórico de mortes (p.deathLog, campo protegido do save:
 *                só o motor autoritativo e o combate local gravam).
 *
 *   Proficiência — Weapon Proficiency estilo OTC: grid de armas, badge de
 *                mastery, barra de XP, 7 colunas de nível com 1 perk
 *                escolhido por nível (sem custo) e reset dos picks.
 */
"use strict";

const CHARD = {
  tab: "personagem",
  outfitPart: 0,           // parte da cor selecionada (0 cabeça .. 3 pés)
  outfitBusca: "",         // filtro de texto do catálogo
  chars: null,             // {mode:"online"|"local", loading, account, characters, chars}
};

const CHARD_TABS = [
  { id: "personagem", nome: "Personagem" },
  { id: "outfit",     nome: "Outfit" },
  { id: "montarias",  nome: "Montarias" },
  { id: "proficiencia", nome: "Proficiência" },
  { id: "roda",       nome: "Roda do Destino" },
  { id: "charms",     nome: "Charms" },
  { id: "loyalty",    nome: "Loyalty" },
  { id: "deaths",     nome: "Deaths" },
];

const CHARD_SHELL_CLASSES = [
  "hunts-modal-shell", "boss-modal-shell", "bosses-modal-shell",
  "reward-modal-shell", "npcs-modal-shell", "npc-modal-shell",
  "cidade-modal-shell", "ranking-modal-shell", "social-modal-shell",
  "calendar-modal-shell", "lootcfg-modal-shell", "imb-modal-shell",
];

/* ------------------------------------------------------------ entrada */

function openCharDetails(tab) {
  const p = (typeof G !== "undefined" && G) ? G.p : null;
  if (!p) {
    // fora do jogo (tela de login): mantém o picker online antigo
    if (typeof window.openAccountCharacterPicker === "function")
      window.openAccountCharacterPicker();
    return;
  }
  if (typeof save === "function") save();
  if (tab) CHARD.tab = tab;
  chardShell(p);
  chardRender();
  chardRefreshChars();
  chardStartLive();
}

/* Compatibilidade: openCharacterModal() e openOutfitModal() continuam
 * declaradas em game.js, mas delegam para esta janela. */

function chardClose() {
  chardStopLive();
  if (CHARD._catalogMo) { try { CHARD._catalogMo.disconnect(); } catch (e) {} CHARD._catalogMo = null; }
  const modal = $("#modal"), body = $("#modal-body");
  if (modal) modal.classList.remove("show", "wide", "modal-cyclo", "login-modal");
  if (body) body.classList.remove("chard-modal-shell");
}

/* ------------------------------------------------------------ moldura */

function chardShell(p) {
  const body = $("#modal-body");
  body.classList.remove.apply(body.classList, CHARD_SHELL_CLASSES);
  body.classList.add("chard-modal-shell");
  body.innerHTML = `
    <div class="panel-title chard-title">
      <span class="chard-title-portrait" id="chard-title-portrait"></span>
      <span class="chard-title-text">Detalhes do personagem: <b>${chardEsc(p.name)}</b></span>
      <span style="flex:1"></span>
      <button class="sm" id="chard-close" title="Fechar">✕</button>
    </div>
    <div class="chard-tabs market-tabs" id="chard-tabs">
      ${CHARD_TABS.map((t) => `
        <button class="sm chard-tab ${CHARD.tab === t.id ? "primary" : ""}"
                data-chard-tab="${t.id}">${t.nome}<span class="chard-tab-alert" data-chard-alert="${t.id}" hidden>!</span></button>`).join("")}
    </div>
    <div class="panel-body chard-body" id="chard-body"></div>`;
  const modal = $("#modal");
  modal.classList.add("show", "wide");
  modal.classList.remove("modal-cyclo", "login-modal");
  $("#chard-close").addEventListener("click", chardClose);
  $$("#chard-tabs [data-chard-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      CHARD.tab = b.dataset.chardTab;
      $$("#chard-tabs .chard-tab").forEach((x) =>
        x.classList.toggle("primary", x === b));
      chardRender();
    }));
  chardPaintTitlePortrait(p);
}

function chardEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------- pontos pendentes por personagem (roda + proficiência) ---------- */

/* Aceita o blob completo (p/roster) ou o snapshot do summary da conta. */
function charPendingPoints(p) {
  const out = { wheel: 0, prof: 0 };
  if (!p || typeof p !== "object") return out;
  try { if (typeof wheelAvail === "function") out.wheel = wheelAvail(p); } catch (e) {}
  try {
    if (typeof profLevel === "function" && typeof profPicked === "function" &&
        p.prof && p.prof.xp) {
      for (const slug in p.prof.xp) {
        const unlocked = profLevel(p, slug);
        const picked = Object.keys(profPicked(p, slug)).length;
        out.prof += Math.max(0, unlocked - picked);
      }
    }
  } catch (e) {}
  return out;
}
if (typeof window !== "undefined") window.charPendingPoints = charPendingPoints;

/* "!" nas abas Proficiência/Roda quando o char ativo tem pontos sobrando. */
function chardPaintTabBadges(p) {
  const pend = charPendingPoints(p);
  $$("#chard-tabs [data-chard-alert]").forEach((s) => {
    const id = s.dataset.chardAlert;
    s.hidden = !(id === "proficiencia" && pend.prof > 0) &&
               !(id === "roda" && pend.wheel > 0);
  });
}

/* ---------- refresh instantâneo enquanto o modal está aberto ---------- */

/* p vivo de um char da conta: ativo ou participante da instância online. */
function chardLiveP(id) {
  if (typeof G === "undefined" || !G || !G.p) return null;
  const cid = typeof characterId === "function" ? characterId(G.p) : G.p.id;
  if (String(cid) === String(id) || String(G.p.id) === String(id)) return G.p;
  if (typeof combatSessionParticipants === "function") {
    const parts = combatSessionParticipants(G.combat) || [];
    for (const e of parts) {
      if (e && e.p && (String(e.id) === String(id) || String(e.p.id) === String(id)))
        return e.p;
    }
  }
  return null;
}

/* Roster local (throttle 2s — o parse do localStorage não roda a cada tick). */
let _chardRosterMap = null, _chardRosterAt = 0;
function chardRosterChar(id) {
  if (typeof getCharacters !== "function") return null;
  const now = Date.now();
  if (!_chardRosterMap || now - _chardRosterAt > 2000) {
    _chardRosterAt = now; _chardRosterMap = {};
    try { for (const c of getCharacters()) _chardRosterMap[String(c.id)] = c; }
    catch (e) {}
  }
  return _chardRosterMap[String(id)] || null;
}

/* Nível/"!" dos cards da faixa de personagens — patch in-place, sem
 * reconstruir retratos nem listeners. */
function chardLiveCharStrip() {
  const host = $("#chard-chars");
  if (!host || !CHARD.chars || CHARD.chars.loading) return;
  const isOnline = CHARD.chars.mode === "online";
  const list = isOnline ? (CHARD.chars.characters || []) : (CHARD.chars.chars || []);
  for (const c of list) {
    const id = String(c.id);
    const btn = host.querySelector(`[data-chard-enter="${id}"]`);
    if (!btn) continue;
    const live = chardLiveP(id) || chardRosterChar(id) ||
                 (isOnline ? c.snapshot : c);
    const lvl = Number(live && live.level) || Number(c.level) || 1;
    const lvlEl = btn.querySelector(".chard-char-level");
    if (lvlEl && lvlEl.textContent !== String(lvl)) lvlEl.textContent = String(lvl);
    const pend = charPendingPoints(live);
    const hasPend = pend.wheel + pend.prof > 0;
    btn.classList.toggle("has-pending", hasPend);
    let alertEl = btn.querySelector(".chard-char-alert");
    if (hasPend && !alertEl) {
      alertEl = document.createElement("span");
      alertEl.className = "chard-char-alert";
      alertEl.title = "Pontos disponíveis";
      alertEl.textContent = "!";
      btn.insertBefore(alertEl, btn.firstChild);
    } else if (!hasPend && alertEl) alertEl.remove();
  }
}

/* Assinatura dos campos exibidos: level/XP/skills/ouro/pontos mudam →
 * re-renderiza a aba ativa e a faixa de personagens na hora. */
function chardLiveTick() {
  const el = $("#chard-body");
  const p = (typeof G !== "undefined" && G) ? G.p : null;
  if (!el || !p) { chardStopLive(); return; }
  const pend = charPendingPoints(p);
  const sig = [p.level, Math.floor(p.xp || 0), Math.floor(p.hp || 0),
    Math.floor(p.mana || 0), Math.floor(p.stamina || 0),
    Math.floor((typeof p.gold === "number" ? p.gold : 0)),
    pend.wheel, pend.prof, CHARD.tab,
    p.skills ? Object.keys(p.skills).map((k) =>
      (p.skills[k] && (p.skills[k].level || p.skills[k])) || 0).join(",") : "",
  ].join("|");
  if (sig !== CHARD._liveSig) {
    CHARD._liveSig = sig;
    chardRender();
    chardLiveCharStrip();
  }
}

function chardStartLive() {
  chardStopLive();
  CHARD._liveSig = null;
  CHARD._liveTimer = setInterval(chardLiveTick, 350);
}
function chardStopLive() {
  if (CHARD._liveTimer) { clearInterval(CHARD._liveTimer); CHARD._liveTimer = null; }
}

/* ---------- "!" no botão CONTA da topbar ---------- */

let _swAlertRosterAt = 0, _swAlertRosterMap = null;
function paintSwitchAlert() {
  const el = $("#btn-switch-alert");
  if (!el) return;
  let pend = 0;
  if (typeof G !== "undefined" && G && G.p) {
    /* Roster da conta — throttle 3s (o parse do localStorage é pesado). */
    const now = Date.now();
    if (!_swAlertRosterMap || now - _swAlertRosterAt > 3000) {
      _swAlertRosterAt = now; _swAlertRosterMap = {};
      if (typeof getCharacters === "function")
        try { for (const c of getCharacters()) _swAlertRosterMap[String(c.id)] = c; }
        catch (e) {}
    }
    const roster = _swAlertRosterMap, seen = {};
    const cid = typeof characterId === "function" ? characterId(G.p) : G.p.id;
    /* p vivo do ativo + participantes da instância — só os da minha conta
     * (id no roster), senão PT com char alheio acenderia o badge. */
    const live = typeof combatSessionParticipants === "function"
      ? combatSessionParticipants(G.combat) : [{ p: G.p }];
    for (const e of live) {
      if (!e || !e.p) continue;
      const id = String((typeof characterId === "function" ? characterId(e.p) : null) ||
                        e.p.id || e.id);
      if (seen[id] || !(id === String(cid) || roster[id])) continue;
      seen[id] = 1;
      const pp = charPendingPoints(e.p);
      pend += pp.wheel + pp.prof;
    }
    for (const id in roster) {
      if (seen[id]) continue;
      const pp = charPendingPoints(roster[id]);
      pend += pp.wheel + pp.prof;
    }
  }
  el.hidden = pend <= 0;
}

function chardPaintTitlePortrait(p, tries) {
  const box = $("#chard-title-portrait");
  if (!box) return;
  tries = tries === undefined ? 20 : tries;
  const cv = (typeof AppearanceRenderer !== "undefined")
    ? AppearanceRenderer.preview(p, "s", tries <= 8) : null;
  if (cv) {
    cv.style.width = "30px"; cv.style.height = "30px";
    cv.style.imageRendering = "pixelated";
    box.innerHTML = ""; box.appendChild(cv);
    return;
  }
  if (tries > 0) setTimeout(() => chardPaintTitlePortrait(p, tries - 1), 90);
}

function chardRender() {
  const el = $("#chard-body");
  const p = (typeof G !== "undefined" && G) ? G.p : null;
  if (!el || !p) return;
  chardPaintTabBadges(p);
  const shell = el.closest(".modal") || $("#modal-body");
  if (shell) {
    shell.classList.toggle("wheel-open", CHARD.tab === "roda");
    shell.classList.toggle("prof-open", CHARD.tab === "proficiencia");
  }
  ({
    personagem: chardTabPersonagem,
    outfit: chardTabOutfit,
    montarias: chardTabMontarias,
    proficiencia: chardTabProficiencia,
    roda: chardTabRoda,
    charms: chardTabCharms,
    loyalty: chardTabLoyalty,
    deaths: chardTabDeaths,
  }[CHARD.tab] || chardTabPersonagem)(p, el);
}

/* ------------------------------------------------------------ personagens */

/* Busca a lista de personagens: conta (online) ou roster local (offline). */
function chardRefreshChars() {
  const online = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof sessionToken === "function" && sessionToken();
  if (!online) {
    CHARD.chars = { mode: "local", loading: false, chars: getCharacters() };
    chardPaintCharStrip();
    return;
  }
  const token = sessionToken();
  CHARD.chars = { mode: "online", loading: true, token };
  chardPaintCharStrip();
  accountMe(token).then((res) => {
    if (!res || !res.ok) {
      CHARD.chars = { mode: "online", loading: false, error: true, token };
      chardPaintCharStrip();
      return;
    }
    CHARD.chars = {
      mode: "online", loading: false, token,
      account: res.account, characters: res.characters || [],
    };
    chardPaintCharStrip();
  }).catch(() => {
    CHARD.chars = { mode: "online", loading: false, error: true, token };
    chardPaintCharStrip();
  });
}

/* Linha "Personagens" — clicar em outro card entra nele (mesmo fluxo dos
 * pickers antigos: dentro de hunt compartilhada só transfere o controle). */
function chardPaintCharStrip() {
  const host = $("#chard-chars");
  if (!host || !CHARD.chars) return;
  const cur = String(typeof characterId === "function" ? characterId(G.p) : G.p.id);
  const isOnline = CHARD.chars.mode === "online";

  let cards = "";
  if (CHARD.chars.loading) {
    cards = `<div class="tiny dim" style="padding:10px">Carregando personagens…</div>`;
  } else if (isOnline && CHARD.chars.error) {
    cards = `<div class="tiny dim" style="padding:10px">Não foi possível carregar a conta.</div>`;
  } else {
    const list = isOnline ? (CHARD.chars.characters || []) : (CHARD.chars.chars || []);
    cards = list.map((c) => {
      const id = String(c.id);
      const isCur = id === cur;
      const voc = vocationName({ voc: c.voc || "knight", promoted: !!c.promoted });
      const live = chardLiveP(id) || chardRosterChar(id) ||
                   (isOnline ? c.snapshot : c);
      const pend = charPendingPoints(live);
      const lvl = Number(live && live.level) || Number(c.level) || 1;
      return `<button type="button" class="chard-char-card ${isCur ? "is-current" : ""} ${pend.wheel + pend.prof > 0 ? "has-pending" : ""}"
        data-chard-enter="${id}" ${isCur ? "disabled" : ""}
        title="${isCur ? "Personagem atual" : "Entrar com " + chardEsc(c.name)}">
        ${pend.wheel + pend.prof > 0 ? `<span class="chard-char-alert" title="Pontos disponíveis">!</span>` : ""}
        <span class="chard-char-portrait" data-chard-portrait="${id}"></span>
        <span class="chard-char-info">
          <b>${chardEsc(c.name)}</b>
          <i>${chardEsc(voc)}</i>
        </span>
        <span class="chard-char-level">${lvl}</span>
        ${isCur ? `<span class="chard-char-tag">atual</span>` : `<span class="chard-char-enter">Entrar ›</span>`}
      </button>`;
    }).join("") || `<div class="tiny dim" style="padding:10px">Nenhum personagem.</div>`;
  }

  const acc = isOnline ? CHARD.chars.account : null;
  host.innerHTML = `
    <div class="chard-chars-row">
      ${cards}
      <button type="button" class="chard-char-card chard-char-new" id="chard-new-char" title="Criar novo personagem">
        <span class="chard-char-plus">＋</span>
        <span class="chard-char-info"><b>Novo</b><i>personagem</i></span>
      </button>
    </div>
    <div class="chard-chars-actions">
      ${acc && !acc.emailVerified ? `<button class="sm" id="chard-verify-email" title="Confirmar e-mail da conta">📧 Confirmar e-mail</button>` : ""}
      ${acc ? `<button class="sm" id="chard-account-picker" title="Tela completa da conta">Conta · ${Number(acc.coins) || 0} TC</button>` : ""}
      ${acc ? `<button class="sm danger" id="chard-logout">Logout</button>` : ""}
    </div>`;

  // retratos
  const list = isOnline ? (CHARD.chars.characters || []) : (CHARD.chars.chars || []);
  chardPaintPortraits(list, 24);

  $$("#chard-chars [data-chard-enter]").forEach((b) =>
    b.addEventListener("click", () => chardEnterChar(b.dataset.chardEnter)));
  const novo = $("#chard-new-char");
  if (novo) novo.addEventListener("click", chardCreateChar);
  const picker = $("#chard-account-picker");
  if (picker) picker.addEventListener("click", () => {
    if (typeof window.openAccountCharacterPicker === "function")
      window.openAccountCharacterPicker();
  });
  const verify = $("#chard-verify-email");
  if (verify) verify.addEventListener("click", () => {
    if (typeof window.openAccountCharacterPicker === "function")
      window.openAccountCharacterPicker();
  });
  const out = $("#chard-logout");
  if (out) out.addEventListener("click", () => {
    if (window.accountCharOps && typeof window.accountCharOps.logout === "function")
      window.accountCharOps.logout();
    else if (typeof window.openAccountCharacterPicker === "function")
      window.openAccountCharacterPicker();
  });
}

/* Pinta os retratos dos cards (roster local ou resumos da conta), com retry
 * enquanto os sprites carregam — mesmo padrão de paintAccountPortraits. */
function chardPaintPortraits(list, tries) {
  tries = tries === undefined ? 24 : tries;
  const allowUnmounted = tries <= 8;
  let missing = false;
  for (const c of list) {
    const box = document.querySelector(`[data-chard-portrait="${c.id}"]`);
    if (!box || box.dataset.done) continue;
    // mesma receita de accountCharacterPreview(): resumo da conta OU
    // personagem completo do roster local viram um p mínimo renderizável
    const preview = {
      id: String(c.id), name: c.name, voc: c.voc || "knight",
      promoted: !!c.promoted, level: Number(c.level) || 1,
      sex: c.sex || "male",
      outfit: c.outfit ? JSON.parse(JSON.stringify(c.outfit)) : null,
    };
    if (typeof ensureOutfit === "function") ensureOutfit(preview);
    if (typeof syncOutfitLook === "function") syncOutfitLook(preview);
    const cv = typeof AppearanceRenderer !== "undefined"
      ? AppearanceRenderer.preview(preview, "s", allowUnmounted) : null;
    if (cv) {
      cv.style.width = "40px"; cv.style.height = "40px";
      cv.style.imageRendering = "pixelated";
      box.innerHTML = ""; box.appendChild(cv); box.dataset.done = "1";
    } else missing = true;
  }
  if (missing && tries > 0)
    setTimeout(() => chardPaintPortraits(list, tries - 1), 90);
}

/* Entra com outro personagem — delega ao mesmo fluxo dos pickers antigos. */
function chardEnterChar(id) {
  id = String(id);
  if (CHARD.chars && CHARD.chars.mode === "online") {
    const summary = (CHARD.chars.characters || []).find((c) => String(c.id) === id);
    if (!summary) return;
    if (summary.identityMismatch) {
      // fluxo de reparo continua no picker completo
      if (typeof window.openAccountCharacterPicker === "function")
        window.openAccountCharacterPicker();
      return;
    }
    if (window.accountCharOps && window.accountCharOps.enter) {
      window.accountCharOps.enter(CHARD.chars.token, summary);
      return;
    }
    if (typeof window.openAccountCharacterPicker === "function")
      window.openAccountCharacterPicker();
    return;
  }
  // offline: party em combate → transfere controle; senão autoload+reload
  if (G.combat && G.combat.players &&
      G.combat.players.some((e) => String(e.id) === id)) {
    if (typeof partyCombatSwitchTo === "function" && partyCombatSwitchTo(id)) {
      chardClose();
      renderAll();
    }
    return;
  }
  const roster = readRoster();
  if (!roster[id] || !roster[id].p) { toast("Personagem não encontrado."); return; }
  save();
  localStorage.setItem(ACTIVE_CHARACTER_KEY, id);
  sessionStorage.setItem(AUTOLOGIN_KEY, id);
  if (typeof armBootLoading === "function") armBootLoading("Carregando personagem...");
  location.reload();
}

function chardCreateChar() {
  if (CHARD.chars && CHARD.chars.mode === "online") {
    // criador completo da conta (sexo/vocação/visual inicial)
    if (window.accountCharOps && window.accountCharOps.create) {
      window.accountCharOps.create(CHARD.chars.token,
        CHARD.chars.account || {}, CHARD.chars.characters || []);
      return;
    }
    if (typeof window.openAccountCharacterPicker === "function")
      window.openAccountCharacterPicker();
    return;
  }
  // offline: formulário compacto inline
  const host = $("#chard-chars");
  if (!host) return;
  if ($("#chard-create-box")) { $("#chard-create-box").remove(); return; }
  host.insertAdjacentHTML("beforeend", `
    <div id="chard-create-box" class="panel-inset" style="padding:8px;margin-top:6px">
      <div class="field"><label>Nome</label><input id="chard-nc-name" maxlength="20" autocomplete="off"></div>
      <div class="field"><label>Sexo</label><select id="chard-nc-sex"><option value="male">Masculino</option><option value="female">Feminino</option></select></div>
      <div class="field"><label>Vocação</label><select id="chard-nc-voc">
        <option value="knight">Knight</option><option value="paladin">Paladin</option>
        <option value="druid">Druid</option><option value="sorcerer">Sorcerer</option>
        <option value="monk">Monk</option>
      </select></div>
      <button class="primary full" id="chard-nc-create">Criar e entrar</button>
      <div class="tiny dim mt8">Ao trocar/criar personagem a página recarrega para iniciar a sessão limpa.</div>
    </div>`);
  $("#chard-nc-create").addEventListener("click", () => {
    const name = ($("#chard-nc-name").value || "").trim();
    if (name.length < 2) { toast("Digite um nome válido"); return; }
    const np = createCharacter(name, $("#chard-nc-voc").value, $("#chard-nc-sex").value);
    sessionStorage.setItem(AUTOLOGIN_KEY, characterId(np));
    if (typeof armBootLoading === "function") armBootLoading("Carregando personagem...");
    location.reload();
  });
}

/* ------------------------------------------------- aba Personagem */

function chardStatRow(k, v) {
  return `<div class="stat-row"><span class="k">${k}</span>
          <span class="v">${v}</span></div>`;
}

function chardProgressBar(pct) {
  return `<div class="chard-prog"><div style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
}

function chardTabPersonagem(p, el) {
  const max = maxStats(p);
  const dmg = playerDamage(p);
  const def = playerDefense(p);
  const prox = expForLevel(p.level + 1);
  const falta = Math.max(0, prox - Math.floor(p.exp));
  const best = typeof bestiarySummary === "function" ? bestiarySummary(p) : null;
  const eqLeech = typeof equipmentLeechTotals === "function" ? equipmentLeechTotals(p) : { lifeLeech: 0, manaLeech: 0 };
  const imb = typeof imbTotals === "function" ? imbTotals(p) : null;
  const w = typeof wheelTotals === "function" && p.wheel ? wheelTotals(p) : null;
  const b = typeof buffTotals === "function" ? buffTotals(p) : null;
  const c = typeof charmTotals === "function" ? charmTotals(p) : null;
  const g = gearStats(p);
  const speed = typeof playerSpeed === "function" ? playerSpeed(p) : null;

  const skills = [
    ["fist", SKILL_NAMES.fist], ["club", SKILL_NAMES.club],
    ["sword", SKILL_NAMES.sword], ["axe", SKILL_NAMES.axe],
    ["dist", SKILL_NAMES.dist], ["shield", SKILL_NAMES.shield],
  ];

  const lifeLeech = (eqLeech.lifeLeech || 0) + ((imb && imb.lifeLeech) || 0) + ((w && w.lifeLeech) || 0);
  const manaLeech = (eqLeech.manaLeech || 0) + ((imb && imb.manaLeech) || 0) + ((w && w.manaLeech) || 0);
  const mit = ((w && w.mitigation) || 0) * 100 + ((w && w.gemMitigation) || 0);

  const PROTS = ["physical", "fire", "ice", "earth", "energy", "death", "holy"];

  // Bônus de experiência — só fontes reais do jogo
  const vip = typeof isVip === "function" && isVip();
  // Stamina é da conta: lê o pool compartilhado, não o espelho do char.
  if (typeof accountStaminaSync === "function") accountStaminaSync(p, 0);
  const sta = Number(p.stamina) || 0;
  const stBonus = vip && sta > 13 * 3600 ? "+50%" : (sta < 3 * 3600 ? "−50%" : "0%");
  const expBonusRows = [
    ["VIP", vip ? "+10%" : "—"],
    ["Stamina" + (vip && sta > 13 * 3600 ? " (VIP 13h+)" : ""), stBonus],
    ["Party (exp compartilhada)", (() => {
      const pct = typeof partyExpBonusPct === "function" ? partyExpBonusPct(p) : 100;
      const bonus = pct - 100;
      return bonus > 0 ? "+" + bonus + "%" : "0%";
    })()],
  ];

  el.innerHTML = `
    <div class="chard-chars" id="chard-chars"></div>

    <div class="chard-head">
      <span class="chard-head-portrait" id="chard-main-portrait"></span>
      <div class="chard-head-name">
        <b>${chardEsc(p.name)}</b>
        <span>${chardEsc(vocationName(p))}</span>
        <span class="dim">Level ${p.level}</span>
      </div>
      <div class="chard-head-stats">
        <span>Vida máxima <b>${Math.floor(max.hp)}</b></span>
        <span>Mana máxima <b>${Math.floor(max.mp)}</b></span>
        <span>Stamina <b>${fmtTime(sta)}</b></span>
        <span>Velocidade <b>${speed == null ? "—" : speed}</b></span>
        <span>Capacidade <b>${fmtFull(Math.floor(max.cap))} oz</b></span>
      </div>
    </div>

    <div class="chard-cols-3">
      <div class="chard-box">
        <div class="chard-box-title">Atributos e skills</div>
        <div class="chard-skill-head"><span>Skill</span><span>Level</span><span>Progresso</span></div>
        ${skills.map(([k, nome]) => {
          const lvl = effSkill(p, k), base = p.skills[k] || 10;
          const prog = skillProgress(p, k);
          return `<div class="chard-skill-row">
            <span class="nm">${nome}</span>
            <span class="lv">${lvl}${lvl > base ? `<i>+${lvl - base}</i>` : ""}</span>
            <span class="pg">${chardProgressBar(prog)}<i>${prog.toFixed(0)}%</i></span>
          </div>`;
        }).join("")}
        ${(() => {
          const lvl = effMagic(p), prog = mlProgress(p);
          return `<div class="chard-skill-row">
            <span class="nm">${SKILL_NAMES.magic}</span>
            <span class="lv">${lvl}${lvl > p.ml ? `<i>+${lvl - p.ml}</i>` : ""}</span>
            <span class="pg">${chardProgressBar(prog)}<i>${prog.toFixed(0)}%</i></span>
          </div>`;
        })()}
      </div>

      <div class="chard-box">
        <div class="chard-box-title">Detalhes de combate</div>
        <div class="chard-duo">
          <div>${chardStatRow("Dano", `${dmg.min} – ${dmg.max}`)}
               ${chardStatRow("Tipo", dmg.type === "magic" ? "Mágico" : dmg.type === "distance" ? "Distância" : "Corpo a corpo")}
               ${chardStatRow("Chance de crítico", (typeof playerCritChancePct === "function" ? playerCritChancePct(p).toFixed(1) : "0") + "%")}
               ${chardStatRow("Dano crítico", "+" + (typeof playerCritExtraPct === "function" ? playerCritExtraPct(p).toFixed(1) : "0") + "%")}
               ${chardStatRow("Ataque", (typeof attackInterval === "function" ? Math.round(attackInterval({}, p)) : 2000) + " ms")}</div>
          <div>${chardStatRow("Armadura", def.armor)}
               ${chardStatRow("Defesa", def.defense)}
               ${chardStatRow("Shielding", def.shielding)}
               ${chardStatRow("Life Leech", (Math.round(lifeLeech * 10) / 10) + "%")}
               ${chardStatRow("Mana Leech", (Math.round(manaLeech * 10) / 10) + "%")}</div>
          <div>${chardStatRow("Esquiva", (((w && w.dodge) || 0) + ((c && c.esquiva) || 0)) + "%")}
               ${chardStatRow("Mitigação", (Math.round(mit * 10) / 10) + "%")}
               ${b ? chardStatRow("Dano (buff)", Math.round(b.dmgDealt * 100) + "%") : ""}
               ${b ? chardStatRow("Dano recebido", Math.round(b.dmgReceived * 100) + "%") : ""}
               ${c && c.vampirismo ? chardStatRow("Vampirismo (charm)", c.vampirismo + "%") : ""}</div>
        </div>
      </div>

      <div class="chard-box">
        <div class="chard-box-title">Proteções</div>
        ${PROTS.map((e) => {
          let v = (typeof playerResistPct === "function" ? playerResistPct(p, e) : 0);
          if (e !== "physical" && typeof imbProtection === "function") v += imbProtection(p, e);
          if (e === "physical") v += g.prot || 0;
          const nome = (ELEMENTS[e] || {}).name || e;
          const cor = (ELEMENTS[e] || {}).color || "#c8c0a8";
          return `<div class="stat-row"><span class="k" style="color:${cor}">${nome}</span>
            <span class="v">${v ? "+" + v + "%" : "0%"}</span></div>`;
        }).join("")}
        <div class="tiny dim mt8">Soma do equipamento, imbuements e roda.</div>
      </div>
    </div>

    <div class="chard-cols-2">
      <div class="chard-box">
        <div class="chard-box-title">Progressão</div>
        ${chardStatRow("Próximo level " + (p.level + 1), expProgress(p).toFixed(0) + "%")}
        ${chardProgressBar(expProgress(p))}
        <div class="tiny dim mt4">faltam ${fmtFull(falta)} de experiência</div>
        ${best ? chardStatRow("Progresso no Bestiary", `${best.descobertos} / ${best.total}`) : ""}
        ${chardStatRow("Charm points", fmtFull(p.charmPoints || 0))}
        ${chardStatRow("Monstros mortos", fmtFull(p.totalKills || 0))}
        ${chardStatRow("Mortes", fmtFull(p.deaths || 0))}
      </div>
      <div class="chard-box">
        <div class="chard-box-title">Bônus de experiência</div>
        ${expBonusRows.map((r) => chardStatRow(r[0], r[1])).join("")}
        <div class="tiny dim mt8">Bônus aplicados sobre a exp de cada kill em hunt.</div>
      </div>
    </div>`;

  chardPaintCharStrip();
  chardPaintMainPortrait(p);
}

function chardPaintMainPortrait(p, tries) {
  const box = $("#chard-main-portrait");
  if (!box) return;
  tries = tries === undefined ? 20 : tries;
  const cv = (typeof AppearanceRenderer !== "undefined")
    ? AppearanceRenderer.preview(p, "s", tries <= 8) : null;
  if (cv) {
    cv.style.width = "64px"; cv.style.height = "64px";
    cv.style.imageRendering = "pixelated";
    box.innerHTML = ""; box.appendChild(cv);
    return;
  }
  if (tries > 0) setTimeout(() => chardPaintMainPortrait(p, tries - 1), 90);
}

/* ------------------------------------------------- aba Outfit */

function chardTabMontarias(p, el) {
  // Mesma grade do catálogo, abrindo já em modo "mount" (aba própria nas
  // telas de referência). O modo persiste no CYCLO.appModo compartilhado.
  chardTabOutfit(p, el);
}

function chardTabOutfit(p, el) {
  const PARTS = [["Cabeça", 0], ["Corpo", 1], ["Pernas", 2], ["Pés", 3]];
  const atual = typeof currentAppearance === "function" ? currentAppearance(p) : null;
  const mnt = typeof currentMount === "function" ? currentMount(p) : null;
  const mask = atual ? ownedAddonMask(p, atual.id) : 0;
  const addonsAtivos = (p.outfit && p.outfit.addons) || 0;
  if (CHARD.tab === "montarias") CHARD.outfitMode = "mount";
  else if (!CHARD.outfitMode) CHARD.outfitMode = "outfit";
  if (!CHARD.previewDir) CHARD.previewDir = "s";

  const addonPill = (bit, label) => {
    const ok = (mask & bit) === bit;
    const on = (addonsAtivos & bit) === bit;
    return `<button type="button" class="gi-toggle-pill ${on ? "is-active" : ""}"
      data-chard-addon-bit="${bit}" ${ok ? "" : `disabled title="Desbloqueie o addon no Addoner ou na Store"`}>
      ${on ? "✓ " : ""}${label}</button>`;
  };

  el.innerHTML = `
  <div class="gi-wardrobe">
    <aside class="gi-wardrobe-preview">
      <div class="gi-preview-stage">
        <div class="gi-preview-pedestal"></div>
        <div class="gi-preview-sprite" id="chard-outfit-preview"></div>
        <button type="button" class="gi-rotate-btn" id="chard-outfit-rotate" title="Girar personagem">↻</button>
      </div>
      <div class="gi-preview-identity">
        <h3 class="gi-preview-outfit" id="chard-outfit-name">${atual ? chardEsc(atual.nome) : "—"}</h3>
        <span class="gi-preview-mount" id="chard-mount-name">${mnt ? "+ " + chardEsc(mnt.nome) : ""}</span>
      </div>
      <div class="gi-control-group">
        <span class="gi-control-label">ADDONS</span>
        <div class="gi-addon-toggles">
          ${addonPill(1, "Addon 1")}${addonPill(2, "Addon 2")}
        </div>
      </div>
      <div class="gi-control-group">
        <span class="gi-control-label">MONTARIA</span>
        <div class="gi-mount-switch">
          <button type="button" class="gi-switch-opt ${!mnt ? "is-active" : ""}" data-chard-mount-off>A pé</button>
          <button type="button" class="gi-switch-opt ${mnt ? "is-active" : ""}" data-chard-mount-on>Montado</button>
        </div>
      </div>
      <div class="gi-control-group">
        <div class="gi-control-head">
          <span class="gi-control-label">CORES</span>
          <button type="button" class="gi-random-btn" id="chard-outfit-random" title="Sortear cores das 4 partes">🎲 Random</button>
        </div>
        <div class="gi-addon-toggles" id="chard-outfit-parts" style="grid-template-columns:repeat(4,1fr)">
          ${PARTS.map(([n, i]) => `<button type="button" class="gi-toggle-pill ${CHARD.outfitPart === i ? "is-active" : ""}" data-chard-part="${i}">${n}</button>`).join("")}
        </div>
        <div id="chard-outfit-palette" class="outfit-palette gi-palette">
          ${OUTFIT_PALETTE.map((c, i) =>
            `<span class="swatch ${p.outfit.colors[CHARD.outfitPart] === i ? "sel" : ""}" data-chard-color="${i}" style="background:${c}" title="cor ${i}"></span>`).join("")}
        </div>
      </div>
      <button type="button" class="gi-wardrobe-apply" id="chard-outfit-save">Aplicar Visual</button>
    </aside>
    <section class="gi-wardrobe-catalog">
      <div class="gi-catalog-toolbar">
        <div class="gi-catalog-tabs" id="chard-cat-tabs"></div>
        <div class="gi-catalog-search">
          <span class="gi-search-icon">🔍</span>
          <input type="text" id="chard-outfit-busca" placeholder="Buscar outfit ou montaria..."
            value="${chardEsc(CHARD.outfitBusca || "")}" autocomplete="off">
        </div>
      </div>
      <div class="gi-catalog-grid" id="chard-catalog-grid"></div>
    </section>
  </div>`;

  let repaintEspera = 0;
  const repaint = () => {
    const cv = (typeof AppearanceRenderer !== "undefined")
      ? AppearanceRenderer.preview(p, CHARD.previewDir, repaintEspera >= 10) : null;
    const box = $("#chard-outfit-preview");
    if (box) {
      if (cv) {
        /* O canvas do preview é recortado pelo conteúdo (montado fica mais
         * alto que largo) — escala proporcional pra caber inteiro na box. */
        const s = Math.min(1.5, 110 / cv.width, 116 / cv.height);
        cv.style.width = Math.max(1, Math.round(cv.width * s)) + "px";
        cv.style.height = Math.max(1, Math.round(cv.height * s)) + "px";
        cv.style.imageRendering = "pixelated";
        box.innerHTML = ""; box.appendChild(cv);
      } else if (repaintEspera < 60) {
        repaintEspera++;
        box.innerHTML = `<div class="tiny dim">carregando…</div>`;
        setTimeout(repaint, 140);
        return;
      }
    }
    const mnt2 = typeof currentMount === "function" ? currentMount(p) : null;
    const at2 = typeof currentAppearance === "function" ? currentAppearance(p) : null;
    const nm = $("#chard-outfit-name"), mn = $("#chard-mount-name");
    if (nm) nm.textContent = at2 ? at2.nome : "—";
    if (mn) mn.textContent = mnt2 ? "+ " + mnt2.nome : "";
  };
  repaint();

  const refresh = () => chardRender();

  /* Catálogo próprio (mesma fonte do cycloAppearance): Visuais/Montarias
   * com contagem, cards equipado/bloqueado e pintura em lotes. */
  const catalog = () => {
    const modo = CHARD.outfitMode || "outfit";
    const q = (CHARD.outfitBusca || "").trim().toLowerCase();
    const total = {
      outfit: appearanceCatalog(p, "owned").length,
      mount: mountCatalog(p, "owned").length,
    };
    const lista = (modo === "outfit" ? appearanceCatalog(p, "owned") : mountCatalog(p, "owned"))
      .filter((o) => !q || (o.nome || "").toLowerCase().includes(q));

    const tabs = $("#chard-cat-tabs");
    if (tabs) {
      tabs.innerHTML = [["outfit", "Visuais", total.outfit], ["mount", "Montarias", total.mount]]
        .map(([id, t, n]) => `<button type="button" class="gi-cat-tab ${modo === id ? "is-active" : ""}"
          data-chard-cat="${id}">${t} <span>${n}</span></button>`).join("");
      $$("#chard-cat-tabs [data-chard-cat]").forEach((b) =>
        b.addEventListener("click", () => { CHARD.outfitMode = b.dataset.chardCat; catalog(); }));
    }

    const grid = $("#chard-catalog-grid");
    if (!grid) return;
    const at2 = typeof currentAppearance === "function" ? currentAppearance(p) : null;
    const mn2 = typeof currentMount === "function" ? currentMount(p) : null;
    grid.innerHTML = lista.map((o) => {
      if (modo === "outfit") {
        const tem = ownsOutfit(p, o.id), ads = ownedAddons(p, o.id);
        const eq = at2 && at2.id === o.id;
        return `<button type="button" class="gi-item-card ${eq ? "is-equipped" : ""} ${tem ? "" : "is-locked"}"
          data-chard-pick-outfit="${o.id}" ${tem ? "" : `title="Desbloqueie no Addoner ou na Store"`}>
          ${eq ? `<span class="gi-equipped-tag">EM USO</span>` : ""}${tem ? "" : `<span class="gi-lock-tag">🔒</span>`}
          <div class="gi-item-sprite" data-pintar="${o.id}"><div class="tiny dim">…</div></div>
          <span class="gi-item-name">${chardEsc(o.nome)}</span>
          <span class="gi-item-meta ${tem && o.addons && ads >= o.addons ? "is-complete" : ""}">
            ${tem ? (o.addons ? `addons ${ads}/${o.addons}` : "sem addon") : "Bloqueado"}</span>
        </button>`;
      }
      const tem = ownsMount(p, o.id);
      const eq = mn2 && mn2.id === o.id;
      return `<button type="button" class="gi-item-card ${eq ? "is-equipped" : ""} ${tem ? "" : "is-locked"}"
        data-chard-pick-mount="${o.id}" ${tem ? "" : `title="Desbloqueie no Lothar ou na Store"`}>
        ${eq ? `<span class="gi-equipped-tag">EM USO</span>` : ""}${tem ? "" : `<span class="gi-lock-tag">🔒</span>`}
        <div class="gi-item-sprite" data-pintar-mount="${o.id}"><div class="tiny dim">…</div></div>
        <span class="gi-item-name">${chardEsc(o.nome)}</span>
        <span class="gi-item-meta">${tem ? `+${o.speed} vel` : "Bloqueado"}</span>
      </button>`;
    }).join("") || `<div class="tiny dim" style="padding:10px;grid-column:1/-1">Nenhum resultado.</div>`;

    /* Pintura em lotes (mesma técnica do cycloAppearance): colorir ~127
     * sprites de uma vez congela a aba — 12 por frame. */
    const alvos = grid.querySelectorAll("[data-pintar],[data-pintar-mount]");
    const cores = (p.outfit && p.outfit.colors) ||
      DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
    let i = 0;
    const lote = () => {
      let feitos = 0;
      while (i < alvos.length && feitos < 12) {
        const box = alvos[i];
        const cv = box.dataset.pintarMount
          ? AppearanceRenderer.mount(box.dataset.pintarMount, "s", 0)
          : AppearanceRenderer.outfit(box.dataset.pintar, 0, cores);
        if (!cv) break;
        cv.style.width = "52px"; cv.style.height = "52px";
        cv.style.imageRendering = "pixelated"; cv.style.objectFit = "contain";
        box.innerHTML = ""; box.appendChild(cv);
        i++; feitos++;
      }
      if (i < alvos.length) requestAnimationFrame(lote);
    };
    if (alvos.length) requestAnimationFrame(lote);

    grid.querySelectorAll("[data-chard-pick-outfit]").forEach((c) =>
      c.addEventListener("click", () => {
        const id = c.dataset.chardPickOutfit;
        if (!ownsOutfit(p, id)) { toast("Visual bloqueado — desbloqueie no Addoner ou na Store."); return; }
        setAppearance(p, id); save(); renderAll(); refresh();
      }));
    grid.querySelectorAll("[data-chard-pick-mount]").forEach((c) =>
      c.addEventListener("click", () => {
        const id = c.dataset.chardPickMount;
        if (!ownsMount(p, id)) { toast("Montaria bloqueada — desbloqueie no Lothar ou na Store."); return; }
        setMount(p, id); save(); renderAll(); refresh();
      }));
  };
  catalog();

  const busca = $("#chard-outfit-busca");
  if (busca) busca.addEventListener("input", () => {
    CHARD.outfitBusca = busca.value;
    catalog();
  });

  const rot = $("#chard-outfit-rotate");
  if (rot) rot.addEventListener("click", () => {
    const dirs = ["s", "w", "n", "e"];
    CHARD.previewDir = dirs[(dirs.indexOf(CHARD.previewDir || "s") + 1) % 4];
    repaintEspera = 0;
    repaint();
  });

  $$("#chard-body [data-chard-addon-bit]").forEach((b) =>
    b.addEventListener("click", () => {
      setAddons(p, addonsAtivos ^ (+b.dataset.chardAddonBit));
      save(); renderAll(); refresh();
    }));
  const off = $("#chard-body [data-chard-mount-off]");
  if (off) off.addEventListener("click", () => {
    setMount(p, null); save(); renderAll(); refresh();
  });
  const on = $("#chard-body [data-chard-mount-on]");
  if (on) on.addEventListener("click", () => {
    if (currentMount(p)) return;
    CHARD.outfitMode = "mount";
    catalog();
    toast("Escolha uma montaria no catálogo.");
  });
  $$("#chard-outfit-parts [data-chard-part]").forEach((b) =>
    b.addEventListener("click", () => {
      CHARD.outfitPart = +b.dataset.chardPart; refresh();
    }));
  $$("#chard-outfit-palette [data-chard-color]").forEach((s) =>
    s.addEventListener("click", () => {
      p.outfit.colors[CHARD.outfitPart] = +s.dataset.chardColor;
      save(); renderAll();
      repaintEspera = 0;
      repaint();
      catalog();
    }));
  const rnd = $("#chard-outfit-random");
  if (rnd) rnd.addEventListener("click", () => {
    p.outfit.colors = (p.outfit.colors || [0, 0, 0, 0]).map(() =>
      Math.floor(Math.random() * OUTFIT_PALETTE.length));
    save(); renderAll(); refresh();
  });
  $("#chard-outfit-save").addEventListener("click", () => {
    save();
    toast("Visual aplicado!");
    renderAll();
    CHARD.tab = "personagem";
    chardShell(p);
    chardRender();
    chardRefreshChars();
  });
}

/* ------------------------------------------------- aba Proficiência
 *
 * Weapon Proficiency no molde do módulo game_proficiency do cliente de
 * referência: lista de armas à esquerda (grid 34px + filtros), e à direita
 * o badge de mastery, a barra de XP, as 7 colunas de nível com os perks
 * (1 escolhido por nível, sem custo — só o requisito de level da arma) e
 * o detalhe do perk sob cada coluna.
 */

const PROF_CATS = [
  { id: "",        nome: "Todas" },
  { id: "sword",   nome: "Espadas" },
  { id: "axe",     nome: "Machados" },
  { id: "club",    nome: "Clavas" },
  { id: "distance",nome: "Distância" },
  { id: "fist",    nome: "Punhos" },
  { id: "wand",    nome: "Wands/Rods" },
];

function profCatOf(it) {
  if (it.cat === "wand" || it.cat === "rod") return "wand";
  return it.cat;
}

/* mini fileira de estrelas (5x5) sob o item no grid, como o MiniStar do OTC */
function chardProfMiniStars(lanes, level) {
  let s = "";
  for (let i = 0; i < lanes; i++) {
    s += `<i class="prof-star-mini${i < level ? " on" : ""}"></i>`;
  }
  return `<div class="prof-stars-mini">${s}</div>`;
}

/* 64px do atlas oficial; locked/unpicked sai em grayscale como no OTC */
function chardProfIconHtml(pk, locked, picked) {
  const ic = profPerkIcon(pk);
  const cls = (picked && !locked) ? "" : " grey";
  /* ic.src já vem completo ("assets/proficiency/icons-N.png"); o aug é só
   * o nome do atlas ("augment-icons") e precisa do caminho montado aqui. */
  const aug = ic.aug
    ? `<i class="prof-aug-ic${cls}"
         style="background-image:url('assets/proficiency/${ic.aug.src}.png');
                background-position:-${ic.aug.x}px -${ic.aug.y}px"></i>`
    : "";
  return `<div class="prof-perk-ic${cls}"
    style="background-image:url('${ic.src}');
           background-position:-${ic.x}px -${ic.y}px">${aug}
    ${locked ? `<i class="prof-lock"></i>` : ""}</div>`;
}

/* célula de estrela do topo (108x20): fill = progresso DENTRO daquele nível */
function chardProfStarCell(p, slug, i, lvl, lanes) {
  const xp = profXp(p, slug);
  const prev = i === 0 ? 0 : profXpNeed(slug, i);
  const need = profXpNeed(slug, i + 1);
  const done = lvl >= i + 1;
  const frac = done ? 1 : Math.max(0, Math.min(1,
    need > prev ? (xp - prev) / (need - prev) : 0));
  const picks = profPicked(p, slug);
  const masteredAll = lvl >= lanes &&
    Object.keys(picks).length >= lanes;
  const starCls = done ? (masteredAll ? " gold" : " silver") : "";
  const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `<div class="prof-star-cell" title="Nível ${i + 1}: ${fmt(Math.min(xp, need))} / ${fmt(need)} XP">
    <div class="prof-star-fill" style="width:${Math.round(frac * 100)}%"></div>
    <i class="prof-star${starCls}"></i>
  </div>`;
}

function chardTabProficiencia(p, el) {
  if (typeof profWeaponList !== "function" || typeof profData !== "function" ||
      !profData()) {
    el.innerHTML = `<div class="cyclo-vazio"><div class="tiny dim">
      Dados de proficiência indisponíveis.</div></div>`;
    return;
  }
  ensureProf(p);
  if (CHARD.profCat === undefined) CHARD.profCat = "";
  if (CHARD.profSearch === undefined) CHARD.profSearch = "";
  if (CHARD.profVoc === undefined) CHARD.profVoc = false;
  if (CHARD.profLvl === undefined) CHARD.profLvl = false;

  const list = profWeaponList(p, { cat: CHARD.profCat });
  const q = (CHARD.profSearch || "").trim().toLowerCase();
  const vis = list.filter((w) => {
    if (q && !(w.it.n || w.slug).toLowerCase().includes(q) &&
        !w.slug.toLowerCase().includes(q)) return false;
    if (CHARD.profVoc && !w.usable) return false;
    if (CHARD.profLvl && (w.it.lvl || 0) > p.level) return false;
    return true;
  });
  if (!CHARD.profSel || !list.some((w) => w.slug === CHARD.profSel)) {
    CHARD.profSel = (list.find((w) => w.equipped) || vis[0] || list[0] || {}).slug;
  }
  const sel = list.find((w) => w.slug === CHARD.profSel);
  /* Rascunho de escolhas por arma: clicar num perk só altera o rascunho;
   * o botão OK confirma e salva em p.prof.perks. */
  if (sel && CHARD.profDraftFor !== sel.slug) {
    CHARD.profDraftFor = sel.slug;
    CHARD.profDraft = Object.assign({}, profPicked(p, sel.slug));
  }

  /* ---------------- coluna esquerda: badge + filtros + grid -------------- */
  const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let leftHtml = "";
  if (sel) {
    const prog = profProgress(p, sel.slug);
    const picks = profPicked(p, sel.slug);
    const masteredAll = prog.level > 0 && prog.level >= prog.lanes &&
      Object.keys(picks).length >= prog.lanes;
    const badge = prog.level === 0 ? "icon-masterylevel-0"
      : `icon-masterylevel-${prog.level}-${masteredAll ? "gold" : "silver"}`;
    const nextTxt = prog.mastered
      ? "Nível máximo atingido"
      : `${fmt(Math.max(0, prog.next - prog.xp))} XP para o próximo nível`;
    leftHtml = `
      <div class="prof-item-name">${chardEsc(sel.it.n || sel.slug)}</div>
      <div class="prof-badge" style="background-image:url('assets/proficiency/${badge}.png')">
        <div class="prof-badge-item">${itemImg(sel.slug, 40)}</div>
      </div>
      <div class="prof-xp-txt">${fmt(prog.xp)} / ${fmt(prog.next)}</div>
      <div class="prof-next-txt">${nextTxt}</div>`;
  }
  const catChips = PROF_CATS.map((c) =>
    `<button type="button" class="prof-cat${CHARD.profCat === c.id ? " on" : ""}"
       data-cat="${c.id}">${c.nome}</button>`).join("");
  const gridCells = vis.map((w) => `
    <button type="button" class="prof-cell${w.slug === CHARD.profSel ? " sel" : ""}"
      data-slug="${w.slug}"
      title="${chardEsc(w.it.n || w.slug)} — nível ${w.level}/${w.lanes}${w.equipped ? " (equipada)" : ""}">
      ${itemImg(w.slug, 32)}
      ${chardProfMiniStars(w.lanes, w.level)}
      ${w.equipped ? `<i class="prof-eq" title="Equipada"></i>` : ""}
    </button>`).join("");

  /* ---------------- coluna direita: estrelas + XP + lanes ---------------- */
  let rightHtml = `<div class="cyclo-vazio" style="flex:1">
      <div class="tiny dim mt8">Selecione uma arma à esquerda.</div></div>`;
  if (sel) {
    const prog = profProgress(p, sel.slug);
    const tr = profTree(sel.slug);
    const picks = CHARD.profDraft || {};
    const saved = profPicked(p, sel.slug);
    const lanes = prog.lanes;
    const stars = Array.from({ length: lanes }, (_, i) =>
      chardProfStarCell(p, sel.slug, i, prog.level, lanes)).join("");
    const xpPct = Math.round(prog.frac * 100);
    const warn = !sel.usable
      ? `<div class="prof-vocwarn" style="width:${lanes * 108 - 2}px">Perks inativos: você não cumpre os requisitos para usar esta arma.</div>` : "";

    const lanesHtml = tr.lv.map((perks, lane) => {
      const unlocked = lane < prog.level;
      const cells = perks.map((pk, idx) => {
        const picked = picks[lane] === idx;
        const confirmed = saved[lane] === idx;
        const st = !unlocked ? " locked"
          : picked ? (confirmed ? " picked" : " picked pending") : " avail";
        return `<button type="button" class="prof-perk${st}"
          data-lane="${lane}" data-idx="${idx}"
          title="${chardEsc(proficiencyPerkName(pk))} — ${chardEsc(proficiencyPerkDesc(pk))}${unlocked ? "" : " (travado)"}">
          ${chardProfIconHtml(pk, !unlocked, picked)}
        </button>`;
      }).join("");
      const selPk = picks[lane] !== undefined ? perks[picks[lane]] : null;
      const detail = !unlocked
        ? `<div class="prof-detail locked"><i class="prof-lock-sm"></i></div>`
        : selPk
          ? `<div class="prof-detail sel"><div>
              <div class="prof-detail-name">${chardEsc(proficiencyPerkName(selPk))}</div>
              <div>${chardEsc(proficiencyPerkDesc(selPk))}</div>
            </div></div>`
          : `<div class="prof-detail">Escolha 1 perk</div>`;
      return `<div class="prof-lane${unlocked ? "" : " locked"}">
        <div class="prof-lane-perks n${perks.length}">${cells}</div>
        ${detail}
      </div>`;
    }).join("");

    const hasPicks = Object.keys(picks).length > 0;
    const laneW = `width:${lanes * 108}px`;
    const laneGrid = `grid-template-columns:repeat(${lanes},108px);${laneW}`;
    /* rascunho != salvo -> OK habilita. "Limpar" também só afeta o rascunho. */
    const dirty = Object.keys(picks).length !== Object.keys(saved).length ||
      Object.keys(picks).some((k) => saved[k] !== picks[k]);
    const sumRows = Object.keys(picks).map(Number).sort((a, b) => a - b)
      .map((lane) => {
        const pk = tr.lv[lane] && tr.lv[lane][picks[lane]];
        return pk ? `<div class="prof-sum-row"><span class="k">Nv${lane + 1}</span>` +
          `${chardEsc(proficiencyPerkName(pk))} — ` +
          `${chardEsc(proficiencyPerkDesc(pk))}</div>` : "";
      }).join("") ||
      `<div class="tiny dim" style="padding:2px 0">Nenhum perk escolhido ainda.</div>`;
    rightHtml = `
      <div class="prof-stars-row" style="${laneGrid}">${stars}</div>
      <div class="prof-xpbar" style="${laneW}"
        title="${fmt(prog.xp)} XP (nível ${prog.level}/${lanes})">
        <div class="prof-xpbar-fill" style="width:${xpPct}%"></div>
      </div>
      ${warn}
      <div class="prof-lanes" style="${laneGrid}">${lanesHtml}</div>
      <div class="prof-summary" style="${laneW}">
        <div class="prof-sec-title">Bônus escolhidos</div>
        <div class="prof-sum-list">${sumRows}</div>
      </div>
      <div class="prof-foot" style="${laneW}">
        <div class="tiny dim prof-hint">
          Nível ${prog.level}/${lanes} — clique num perk desbloqueado (1 por
          nível, sem custo) e confirme com OK. Perks valem com a arma equipada.
        </div>
        <button type="button" id="prof-reset" class="btn small"
          ${hasPicks ? "" : "disabled"}>Limpar perks</button>
        <button type="button" id="prof-ok" class="btn small prof-ok"
          ${dirty ? "" : "disabled"}>OK</button>
      </div>`;
  }

  el.innerHTML = `
    <div class="prof-root">
      <div class="prof-left">
        <div class="prof-panel">${leftHtml}</div>
        <div class="prof-filters">
          <label class="prof-chk"><input type="checkbox" id="prof-f-lvl"${CHARD.profLvl ? " checked" : ""}> Level</label>
          <label class="prof-chk"><input type="checkbox" id="prof-f-voc"${CHARD.profVoc ? " checked" : ""}> Voc.</label>
        </div>
        <div class="prof-cats">${catChips}</div>
        <input id="prof-search" class="prof-search" type="text"
          placeholder="Buscar arma..." value="${chardEsc(CHARD.profSearch)}">
        <div class="prof-grid">${gridCells ||
          `<div class="tiny dim" style="padding:8px">Nenhuma arma.</div>`}</div>
      </div>
      <div class="prof-right">${rightHtml}</div>
    </div>`;

  /* ---------------- bindings ---------------- */
  el.querySelectorAll(".prof-cat").forEach((b) =>
    b.addEventListener("click", () => {
      CHARD.profCat = b.dataset.cat || "";
      chardRender();
    }));
  el.querySelector("#prof-search").addEventListener("input", (e) => {
    CHARD.profSearch = e.target.value;
    /* re-render mantendo o foco do input */
    const pos = e.target.selectionStart;
    chardRender();
    const inp = el.querySelector("#prof-search");
    if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
  });
  el.querySelector("#prof-f-voc").addEventListener("change", (e) => {
    CHARD.profVoc = e.target.checked; chardRender();
  });
  el.querySelector("#prof-f-lvl").addEventListener("change", (e) => {
    CHARD.profLvl = e.target.checked; chardRender();
  });
  el.querySelectorAll(".prof-cell").forEach((b) =>
    b.addEventListener("click", () => {
      CHARD.profSel = b.dataset.slug;
      chardRender();
    }));
  el.querySelectorAll(".prof-perk").forEach((b) =>
    b.addEventListener("click", () => {
      /* Rascunho: só altera CHARD.profDraft — nada é salvo até o OK. */
      const lane = +b.dataset.lane, idx = +b.dataset.idx;
      const tr = profTree(CHARD.profSel);
      if (!tr || !tr.lv[lane] || !tr.lv[lane][idx]) return;
      if (typeof profCanPick === "function" &&
          !profCanPick(p, CHARD.profSel, lane)) return;
      if (!CHARD.profDraft) CHARD.profDraft = {};
      if (CHARD.profDraft[lane] === idx) delete CHARD.profDraft[lane];
      else CHARD.profDraft[lane] = idx;
      chardRender();
    }));
  const okBtn = el.querySelector("#prof-ok");
  if (okBtn) okBtn.addEventListener("click", () => {
    ensureProf(p);
    const draft = CHARD.profDraft || {};
    if (Object.keys(draft).length) {
      p.prof.perks[CHARD.profSel] = Object.assign({}, draft);
    } else {
      delete p.prof.perks[CHARD.profSel];
    }
    if (typeof save === "function") save();
    if (typeof toast === "function") toast("Perks de proficiência confirmados.");
    chardRender();
  });
  const resetBtn = el.querySelector("#prof-reset");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    CHARD.profDraft = {};
    chardRender();
  });
}

/* ------------------------------------------------- aba Roda do Destino */

function chardTabRoda(p, el) {
  if (typeof renderWheelModal !== "function" || typeof WHEEL_SLOTS === "undefined") {
    el.innerHTML = `<div class="cyclo-vazio"><div class="tiny dim">Roda do Destino indisponível.</div></div>`;
    return;
  }
  ensureWheel(p);
  // A roda é da vocação do personagem — sem seletor. O módulo real
  // (WHEEL_SLOTS -> p.wheel.slots) é o que alimenta os bônus de combate.
  el.innerHTML = `<div class="chard-wheel-embed">${renderWheelModal(p, { embedded: true })}</div>`;
  if (typeof bindWheel === "function") bindWheel(el, chardRender);
}

/* ------------------------------------------------- aba Charms */

function chardTabCharms(p, el) {
  if (typeof renderCycloCharms !== "function") {
    el.innerHTML = `<div class="cyclo-vazio"><div class="tiny dim">Charms indisponível.</div></div>`;
    return;
  }
  renderCycloCharms(p, el);
}

/* ------------------------------------------------- aba Loyalty */

function chardTabLoyalty(p, el) {
  if (typeof renderLoyaltyHtml !== "function") {
    el.innerHTML = `<div class="cyclo-vazio"><div class="tiny dim">Loyalty indisponível.</div></div>`;
    return;
  }
  if (typeof ensureWardrobe === "function") ensureWardrobe(p);
  el.innerHTML = `<div class="chard-loyalty-embed">${renderLoyaltyHtml(p)}</div>`;
}

/* ------------------------------------------------- aba Deaths */

function chardAgo(ts) {
  const d = Math.max(0, Date.now() - (Number(ts) || 0));
  const min = Math.floor(d / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function chardTabDeaths(p, el) {
  const log = Array.isArray(p.deathLog) ? p.deathLog.slice(0, 20) : [];
  const track = (G.combat && G.combat.stats && G.combat.stats.deathTrack) || null;
  const mine = track && track.byPlayer ? track.byPlayer[String(p.id)] : null;
  const sessDeaths = mine ? (mine.deaths || 0) : 0;
  const sessBless = mine ? (mine.blessGold || 0) : 0;

  const whereName = (w) => {
    if (!w) return "—";
    const hunt = typeof GAMEDATA !== "undefined" && GAMEDATA.hunts && GAMEDATA.hunts[w];
    if (hunt && hunt.name) return hunt.name;
    const mon = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters[w];
    if (mon && mon.name) return mon.name;
    return String(w);
  };
  const rows = log.map((d) => {
    const where = chardEsc(whereName(d.where));
    const by = chardEsc(d.by || "—");
    return `<tr>
      <td>${chardAgo(d.at)}</td>
      <td>${by}</td>
      <td>${where}</td>
      <td class="num">${Number(d.level) || "—"}</td>
      <td>${d.blessed ? "usada" : "—"}</td>
      <td class="num">${d.lost ? "−" + fmtFull(d.lost) + " xp" : "—"}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="chard-box-title">Histórico de mortes
      <span class="tiny dim" style="font-weight:normal"> — últimas 20 mortes registradas</span>
    </div>
    <div class="chard-deaths-summary">
      ${chardStatRow("Total de mortes", fmtFull(p.deaths || 0))}
      ${sessDeaths ? chardStatRow("Nesta sessão", sessDeaths) : ""}
      ${sessBless ? chardStatRow("Bless gasta na sessão", fmtFull(sessBless) + " gp") : ""}
    </div>
    <div class="chard-deaths-wrap">
      <table class="chard-deaths-table">
        <thead><tr>
          <th>Quando</th><th>Morto por</th><th>Onde</th>
          <th class="num">Level</th><th>Bless</th><th class="num">Perdido</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="dim" style="text-align:center;padding:18px">
          Nenhuma morte registrada ainda — o histórico começa a contar daqui.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="tiny dim mt8">Registrado pelo servidor (hunts online) e pelo
    combate local — mortes anteriores a este recurso não aparecem.</div>`;
}

/* ------------------------------------------------- ícone da topbar */

/* Retrato do personagem ativo no botão da topbar. Guarda uma chave do visual
 * para não recolorir o sprite a cada renderStats. */
function paintSwitchPortrait(p) {
  const box = $("#btn-switch-portrait");
  const nm = $("#btn-switch-name");
  if (nm && p) nm.textContent = p.name || "Personagem";
  if (!box || !p || typeof AppearanceRenderer === "undefined") return;
  const o = p.outfit || {};
  const key = [
    (o.appearance || o.type || ""), (o.addons || 0), (o.mount || ""),
    (o.colors || []).join(","), p.voc, p.sex || "",
    (p._avatar && p._avatar.active) ? "av" : "",
  ].join("|");
  if (box.dataset.key === key && box.firstChild) return;
  const espera = Number(box.dataset.espera) || 0;
  const cv = AppearanceRenderer.preview(p, "s", espera >= 8);
  if (!cv) {
    if (!box.dataset.pending) {
      box.dataset.pending = "1";
      box.dataset.espera = String(espera + 1);
      setTimeout(() => { delete box.dataset.pending; paintSwitchPortrait(p); }, 160);
    }
    return;
  }
  delete box.dataset.espera;
  cv.style.height = "26px"; cv.style.width = "auto";
  cv.style.maxWidth = "28px";
  cv.style.imageRendering = "pixelated";
  box.innerHTML = ""; box.appendChild(cv);
  box.dataset.key = key;
}

window.openCharDetails = openCharDetails;
