/*
 * city-ui.js — janelas de dialogo dos NPCs da cidade
 */
"use strict";

let shopFilter = "";
let shopSlot = "all";

/* Catálogo do modal NPCS (mesmo estilo de cards do modal HUNTS). */
const NPC_MODAL_CATALOG = [
  {
    shop: "tibianus",
    name: "King Tibianus",
    role: "Promoção",
    sprite: "king-tibianus",
    descKey: "npc.desc.tibianus",
  },
  {
    shop: "gnomally",
    name: "Gnomally",
    role: "Trocas Crystalline",
    sprite: "gnomally",
    descKey: "npc.desc.gnomally",
  },
  {
    shop: "enpa",
    name: "Enpa-Deia Pema",
    role: "Equipamentos Monk",
    sprite: "enpa-deia-pema",
    descKey: "npc.desc.enpa",
  },
  {
    shop: "oberon-trader",
    name: "Oberon Trader",
    role: "Falcon Forge",
    sprite: "oberon-trader",
    desc: "Troca itens de Falcon Forge e vende Roasted Dragon Wings.",
  },
  {
    shop: "umbral-creation",
    name: "Umbral Creation",
    role: "Roshamuul Forge",
    sprite: "umbral-creation",
    desc: "Cria, melhora e transforma itens Umbral.",
  },
];

/* Serviços do templo (Cyclopedia CIDADE) — modal paralelo ao NPCS. */
const CIDADE_MODAL_CATALOG = [
  {
    action: "market",
    nameKey: "btn.market",
    name: "MARKET",
    roleKey: "cidade.role.market",
    role: "Comércio",
    icon: "assets/ui/market/market.png",
    descKey: "cidade.desc.market",
  },
  {
    action: "reward",
    nameKey: "btn.reward",
    name: "REWARD",
    roleKey: "cidade.role.reward",
    role: "Reward Chest",
    icon: "assets/item/reward-chest.png",
    descKey: "cidade.desc.reward",
  },
  {
    action: "forge",
    nameKey: "cidade.name.forge",
    name: "FORJE",
    roleKey: "cidade.role.forge",
    role: "Exaltation Forge",
    icon: "assets/item/exalted-core.gif",
    descKey: "cidade.desc.forge",
  },
  {
    action: "depot",
    nameKey: "btn.depot",
    name: "DEPOT",
    roleKey: "cidade.role.depot",
    role: "Depósito",
    icon: "assets/item/depot-item-3497.png",
    descKey: "cidade.desc.depot",
  },
  {
    action: "imbuements",
    nameKey: "btn.imbuements",
    name: "IMBUEMENTS",
    roleKey: "cidade.role.imbuements",
    role: "Imbuements",
    icon: "assets/ui/imbuement-machine.png",
    descKey: "cidade.desc.imbuements",
  },
];

const CITY_MODAL_SHELLS = [
  "npcs-modal-shell", "cidade-modal-shell", "ranking-modal-shell",
  "hunts-modal-shell", "bosses-modal-shell", "boss-modal-shell", "reward-modal-shell",
];

const RANKING_TABS = [
  { by: "level", labelKey: "ranking.tab.level", label: "TOP LEVEL" },
  { by: "magic", labelKey: "ranking.tab.magic", label: "MAGIC" },
  { by: "sword", labelKey: "ranking.tab.sword", label: "SWORD" },
  { by: "fist", labelKey: "ranking.tab.fist", label: "FIST" },
  { by: "club", labelKey: "ranking.tab.club", label: "CLUB" },
  { by: "axe", labelKey: "ranking.tab.axe", label: "AXE" },
  { by: "distance", labelKey: "ranking.tab.distance", label: "DISTANCE" },
];

let RANKING_UI = { by: "level", loading: false };

function clearCityModalShells(body) {
  if (!body) return;
  body.classList.remove(...CITY_MODAL_SHELLS);
}

/* Chaves públicas → ids internos em NPCS (King Tibianus = priest). */
const NPC_SHOP_IDS = {
  enpa: "enpa",
  gnomally: "gnomally",
  tibianus: "priest",
};

function openNpcShop(shopKey) {
  const id = NPC_SHOP_IDS[shopKey] || shopKey;
  clearCityModalShells($("#modal-body"));
  if (typeof openNpc === "function") openNpc(id);
}

function openCidadeService(action) {
  clearCityModalShells($("#modal-body"));
  if (typeof openCycloCityAction === "function") {
    openCycloCityAction(action);
    return;
  }
  if (action === "market" && typeof openMarket === "function") openMarket();
  else if (action === "reward" && typeof openRewardChest === "function") openRewardChest();
  else if (action === "forge" && typeof openForgeModal === "function") openForgeModal();
  else if (action === "depot" && typeof openDepotModal === "function") openDepotModal();
  else if (action === "imbuements" && typeof openImbueModal === "function") openImbueModal();
}

/* Contagem de pacotes de boss ainda não recolhidos no Reward Chest. */
function cidadeRewardPendingCount(p) {
  if (!p || typeof rewardChestBundleList !== "function") return 0;
  try { return rewardChestBundleList(p).length; } catch (e) { return 0; }
}

function cidadeRewardBangHtml(n, extraClass) {
  if (!(n > 0)) return "";
  const cls = "cidade-reward-bang" + (extraClass ? " " + extraClass : "");
  const count = n > 1
    ? `<span class="cidade-reward-bang-count">${n}</span>` : "";
  return `<span class="${cls}" title="Recompensa de boss pendente" aria-label="Recompensa pendente">!${count}</span>`;
}

/* "!" no botão CIDADE (topbar) — mesmo espírito do convite Megalomania. */
function ensureCidadeRewardBang() {
  const btn = document.getElementById("btn-cidade");
  if (!btn) return null;
  let bang = document.getElementById("cidade-reward-bang");
  if (!bang) {
    bang = document.createElement("span");
    bang.id = "cidade-reward-bang";
    bang.className = "cidade-reward-bang";
    bang.setAttribute("aria-hidden", "true");
    bang.hidden = true;
    btn.appendChild(bang);
  }
  if (getComputedStyle(btn).position === "static") btn.style.position = "relative";
  return bang;
}

function renderCidadeRewardNotify(p) {
  const player = p || (typeof G !== "undefined" && G ? G.p : null);
  const n = cidadeRewardPendingCount(player);
  const bang = ensureCidadeRewardBang();
  if (bang) {
    if (n > 0) {
      bang.hidden = false;
      bang.setAttribute("aria-hidden", "false");
      bang.innerHTML = "!" + (n > 1
        ? `<span class="cidade-reward-bang-count">${n}</span>` : "");
      bang.title = n === 1
        ? "1 recompensa de boss para recolher"
        : `${n} recompensas de boss para recolher`;
    } else {
      bang.hidden = true;
      bang.setAttribute("aria-hidden", "true");
      bang.innerHTML = "!";
      bang.removeAttribute("title");
    }
  }
  const card = document.querySelector('#cidade-modal-list [data-cidade-action="reward"]');
  if (card) {
    let cardBang = card.querySelector(".cidade-reward-bang");
    if (n > 0) {
      if (!cardBang) {
        card.insertAdjacentHTML("beforeend", cidadeRewardBangHtml(n, "cidade-reward-bang--card"));
      } else {
        cardBang.innerHTML = "!" + (n > 1
          ? `<span class="cidade-reward-bang-count">${n}</span>` : "");
        cardBang.hidden = false;
      }
    } else if (cardBang) {
      cardBang.remove();
    }
  }
}

function openCidadeModal() {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  clearCityModalShells(body);
  body.classList.add("cidade-modal-shell");
  body.innerHTML = `<div class="panel-title cidade-modal-title">
      <span class="cidade-btn-icon" aria-hidden="true"></span>
      <span data-i18n="btn.cidade">CIDADE</span>
      <button class="sm" id="cidade-modal-close">Fechar</button>
    </div>
    <div class="panel-body" id="cidade-modal-list"></div>`;
  modal.classList.add("show");
  if (typeof applyI18n === "function") applyI18n(body);
  $("#cidade-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("cidade-modal-shell");
  });
  renderCidadeCatalog();
}

function renderCidadeCatalog() {
  const root = $("#cidade-modal-list");
  if (!root) return;
  const tt = (key, fallback) => (typeof t === "function" ? t(key) : fallback);
  const pending = cidadeRewardPendingCount(G.p);
  root.innerHTML = `<section class="hunt-modal-section cidade-modal-section">
    <div class="hunt-cat-title">${tt("cidade.catalogTitle", "Serviços da cidade")}</div>
    <div class="hunts-group">${CIDADE_MODAL_CATALOG.map((entry) => {
      const name = tt(entry.nameKey, entry.name);
      const role = tt(entry.roleKey, entry.role);
      const desc = tt(entry.descKey, entry.descKey);
      const bang = entry.action === "reward" ? cidadeRewardBangHtml(pending, "cidade-reward-bang--card") : "";
      return `<button type="button" class="hunt-card hunt-modal-card hunt-canary-card cidade-modal-card" data-cidade-action="${entry.action}">
        <span class="mobs" aria-hidden="true">
          <img src="${entry.icon}" alt="" class="cidade-modal-sprite">
        </span>
        <span class="info">
          <span class="nm">${name}</span>
          <span class="meta">${role}</span>
          <span class="tiny dim cidade-modal-desc">${desc}</span>
        </span>
        <span class="risk low">${tt("npc.open", "Abrir")}</span>
        ${bang}
      </button>`;
    }).join("")}</div>
  </section>`;
  $$("#cidade-modal-list [data-cidade-action]").forEach((btn) => {
    btn.addEventListener("click", () => openCidadeService(btn.dataset.cidadeAction));
  });
  renderCidadeRewardNotify(G.p);
}

function openNpcsModal() {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  clearCityModalShells(body);
  body.classList.add("npcs-modal-shell");
  body.innerHTML = `<div class="panel-title npcs-modal-title">
      <span class="npcs-btn-icon" aria-hidden="true"></span>
      <span data-i18n="btn.npcs">NPCS</span>
      <button class="sm" id="npcs-modal-close">Fechar</button>
    </div>
    <div class="panel-body" id="npcs-modal-list"></div>`;
  modal.classList.add("show");
  if (typeof applyI18n === "function") applyI18n(body);
  $("#npcs-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("npcs-modal-shell");
  });
  renderNpcsCatalog();
}

function rankingEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rankingVocLabel(voc) {
  if (typeof VOCATIONS !== "undefined" && VOCATIONS[voc] && VOCATIONS[voc].name)
    return VOCATIONS[voc].name;
  return voc || "—";
}

function openRankingModal() {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  clearCityModalShells(body);
  body.classList.add("ranking-modal-shell");
  const tt = (key, fallback) => (typeof t === "function" ? t(key) : fallback);
  const tabs = RANKING_TABS.map((tab) =>
    `<button type="button" class="ranking-tab${RANKING_UI.by === tab.by ? " active" : ""}" data-ranking-by="${tab.by}">${tt(tab.labelKey, tab.label)}</button>`
  ).join("");
  body.innerHTML = `<div class="panel-title ranking-modal-title">
      <span class="ranking-btn-icon" aria-hidden="true"></span>
      <span data-i18n="btn.ranking">RANKING</span>
      <button class="sm" id="ranking-modal-close">Fechar</button>
    </div>
    <div class="ranking-tabs" role="tablist">${tabs}</div>
    <div class="panel-body" id="ranking-modal-list"></div>`;
  modal.classList.add("show");
  if (typeof applyI18n === "function") applyI18n(body);
  $("#ranking-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("ranking-modal-shell");
  });
  $$("#modal-body [data-ranking-by]").forEach((btn) => {
    btn.addEventListener("click", () => {
      RANKING_UI.by = btn.dataset.rankingBy || "level";
      $$("#modal-body [data-ranking-by]").forEach((b) =>
        b.classList.toggle("active", b.dataset.rankingBy === RANKING_UI.by));
      loadRankingList();
    });
  });
  loadRankingList();
}

async function loadRankingList() {
  const root = $("#ranking-modal-list");
  if (!root) return;
  const tt = (key, fallback) => (typeof t === "function" ? t(key) : fallback);
  const by = RANKING_UI.by || "level";
  root.innerHTML = `<div class="tiny dim ranking-status">${tt("ranking.loading", "Carregando…")}</div>`;
  RANKING_UI.loading = true;
  try {
    const base = (typeof ACCOUNT_API_URL === "string" && ACCOUNT_API_URL) || "";
    const url = `${base}/api/rankings?by=${encodeURIComponent(by)}&limit=50`;
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    let data = {};
    try { data = await response.json(); } catch (e) { data = {}; }
    if (!response.ok || !data || !data.ok) {
      root.innerHTML = `<div class="hunt-section-empty">${tt("ranking.error", "Não foi possível carregar o ranking.")}</div>`;
      return;
    }
    renderRankingList(data.rankings || [], by);
  } catch (e) {
    root.innerHTML = `<div class="hunt-section-empty">${tt("ranking.error", "Não foi possível carregar o ranking.")}</div>`;
  } finally {
    RANKING_UI.loading = false;
  }
}

function renderRankingList(rows, by) {
  const root = $("#ranking-modal-list");
  if (!root) return;
  const tt = (key, fallback) => (typeof t === "function" ? t(key) : fallback);
  if (!rows.length) {
    root.innerHTML = `<div class="hunt-section-empty">${tt("ranking.empty", "Nenhum personagem no ranking.")}</div>`;
    return;
  }
  const valueHeader = by === "level" ? tt("char.level", "Nível") : tt("ranking.col.value", "Valor");
  const body = rows.map((row, index) => {
    const value = row.value != null ? row.value : (by === "level" ? row.level : "—");
    return `<tr>
      <td class="ranking-pos">${index + 1}</td>
      <td class="ranking-name">${rankingEscape(row.name)}</td>
      <td class="ranking-voc">${rankingEscape(rankingVocLabel(row.voc))}</td>
      <td class="ranking-value">${rankingEscape(value)}</td>
    </tr>`;
  }).join("");
  root.innerHTML = `<section class="hunt-modal-section ranking-modal-section">
    <div class="hunt-cat-title">${tt("ranking.catalogTitle", "Ranking de personagens")}</div>
    <div class="ranking-table-wrap">
      <table class="ranking-table">
        <thead>
          <tr>
            <th>${tt("ranking.col.rank", "#")}</th>
            <th>${tt("ranking.col.name", "Nome")}</th>
            <th>${tt("ranking.col.voc", "Vocação")}</th>
            <th>${valueHeader}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function renderNpcsCatalog() {
  const root = $("#npcs-modal-list");
  if (!root) return;
  root.innerHTML = `<section class="hunt-modal-section npcs-modal-section">
    <div class="hunt-cat-title">${typeof t === "function" ? t("npc.catalogTitle") : "Serviços"}</div>
    <div class="hunts-group">${NPC_MODAL_CATALOG.map((entry) => {
      const desc = entry.desc || (typeof t === "function" ? t(entry.descKey) : entry.descKey);
      const spriteHtml = entry.sprite === "oberon-trader"
        ? `<span class="npc-anim-oberon" role="img" aria-label="${entry.name}"></span>`
        : entry.sprite === "umbral-creation"
        ? `<span class="npc-anim-guzzlemaw" role="img" aria-label="${entry.name}"></span>`
        : `<img src="assets/npc/${entry.sprite}_s.png" alt="" class="npc-modal-sprite">`;
      return `<button type="button" class="hunt-card hunt-modal-card hunt-canary-card npc-modal-card" data-npc-shop="${entry.shop}">
        <span class="mobs" aria-hidden="true">
          ${spriteHtml}
        </span>
        <span class="info">
          <span class="nm">${entry.name}</span>
          <span class="meta">${entry.role}</span>
          <span class="tiny dim npc-modal-desc">${desc}</span>
        </span>
        <span class="risk low">${typeof t === "function" ? t("npc.open") : "Abrir"}</span>
      </button>`;
    }).join("")}</div>
  </section>`;
  $$("#npcs-modal-list [data-npc-shop]").forEach((btn) => {
    btn.addEventListener("click", () => openNpcShop(btn.dataset.npcShop));
  });
}

function openNpc(id) {
  const npc = NPCS[id];
  if (!npc) return;
  G.activeNpc = id;
  const p = G.p;
  let body = "";
  clearCityModalShells($("#modal-body"));

  switch (npc.type) {
    case "shop":   body = npcShop(p); break;
    case "supply": body = npcSupply(p); break;
    case "sell":   body = npcSell(p); break;
    case "npcbuy": body = npcBuyOnly(p, npc.shopId || id); break;
    case "tokenbarter": body = npcTokenBarter(p, npc.shopId || id); break;
    case "upgrade": body = npcUpgrade(p); break;
    case "bank":   body = npcBank(p); break;
    case "temple": body = npcTemple(p); break;
    case "promotion": body = npcPromotion(p); break;
    case "train":  body = npcTrain(p); break;
    case "inn":    body = npcInn(p); break;
    case "travel": body = npcTravel(p); break;
    case "oberon-trader": body = npcOberonTraderHtml(p); break;
    case "umbral-creation": body = npcUmbralCreationHtml(p); break;
  }

  const npcTitleSprite = npc.sprite === "umbral-creation"
    ? `<span class="npc-anim-guzzlemaw" role="img" aria-label="${npc.name}" style="transform:scale(0.4);width:40px;height:40px;display:inline-block"></span>`
    : `<img src="assets/npc/${npc.sprite}_s.png" style="height:22px" alt="">`;
  $("#modal-body").innerHTML = `
    <div class="panel-title">
      ${npcTitleSprite}
      ${npc.name} — <span class="dim" style="font-weight:normal">${npc.role}</span>
      <span style="flex:1"></span>
      <button class="sm" id="npc-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="npc-greet mb8">"${npc.greet}"</div>
      <div id="npc-content">${body}</div>
    </div>`;
  $("#modal").classList.add("show");
  $("#npc-close").addEventListener("click", closeNpc);
  bindNpc(id, npc.type);
}

function closeNpc() {
  G.activeNpc = null;
  $("#modal").classList.remove("show");
  renderAll();
}

function refreshNpc(id) {
  const npc = NPCS[id];
  const p = G.p;
  let body = "";
  switch (npc.type) {
    case "shop":   body = npcShop(p); break;
    case "supply": body = npcSupply(p); break;
    case "sell":   body = npcSell(p); break;
    case "npcbuy": body = npcBuyOnly(p, npc.shopId || id); break;
    case "tokenbarter": body = npcTokenBarter(p, npc.shopId || id); break;
    case "upgrade": body = npcUpgrade(p); break;
    case "bank":   body = npcBank(p); break;
    case "temple": body = npcTemple(p); break;
    case "promotion": body = npcPromotion(p); break;
    case "train":  body = npcTrain(p); break;
    case "inn":    body = npcInn(p); break;
    case "travel": body = npcTravel(p); break;
    case "oberon-trader": body = npcOberonTraderHtml(p); break;
    case "umbral-creation": body = npcUmbralCreationHtml(p); break;
  }
  $("#npc-content").innerHTML = body;
  bindNpc(id, npc.type);
  renderTopbar(p);
}

function openAcademyConjureModal(showList) {
  const p = G.p;
  G.activeNpc = "academy-conjure";
  const recipes = academyConjuresFor(p);
  const rows = recipes.map((r) => {
    const check = academyConjureCheck(p, r);
    const sprite = r.kind === "ammo" ? r.slug :
      r.kind === "supply" && SUPPLIES[r.slug] ? SUPPLIES[r.slug].sprite : "spellbook";
    return `<div class="shop-row" style="opacity:${check.ok ? 1 : .45}">
      ${r.kind === "support" ? `<span style="width:28px;text-align:center">✨</span>` : itemImg(sprite, 30)}
      <div style="flex:1;min-width:0">
        <div class="small">${r.name}</div>
        <div class="tiny dim"><b>${r.words}</b> · ${academyConjureProduct(r)} · nv ${r.level} · ML ${r.ml} · ${fmtFull(r.mana)} mana</div>
        <div class="tiny dim">${check.ok ? r.desc : `<span style="color:#ff9a6a">${check.msg}</span>`}</div>
      </div>
      <div class="row" style="gap:3px;flex:none">
        <button class="sm ${check.ok ? "primary" : ""}" data-academy-conjure="${r.id}" ${check.ok ? "" : "disabled"}>
          Conjurar</button>
        <button class="sm ${p.config.autoConjure === r.id ? "primary" : ""}"
          data-academy-loop="${r.id}" title="Conjurar em loop enquanto houver mana">
          ${p.config.autoConjure === r.id ? "LOOP ON" : "Loop"}</button>
      </div>
    </div>`;
  }).join("");

  $("#modal-body").innerHTML = `
    <div class="panel-title">
      Academia — Conjure
      <span style="flex:1"></span>
      <button class="sm" id="academy-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="small dim">Textbox</label>
      <input id="academy-conjure-text" value="conjure:" autocomplete="off"
        style="width:100%;padding:6px;background:#14120e;color:#ffe680;border:2px solid;border-color:#16140f #5a5348 #5a5348 #16140f;margin:4px 0 8px">
      <div class="row mb8" style="justify-content:space-between">
        <span class="small dim">${vocationName(p)} · Mana ${Math.floor(p.mp)} / ${maxStats(p).mp}</span>
        <button class="sm primary" id="academy-toggle-list">${showList === false ? "Abrir lista" : "Atualizar lista"}</button>
      </div>
      <div id="academy-conjure-list" class="list" style="max-height:360px;${showList === false ? "display:none" : ""}">
        ${rows || `<div class="dim small center" style="padding:14px">Nenhum conjurável para esta vocação.</div>`}
      </div>
      ${p.config.autoConjure && ACADEMY_CONJURES[p.config.autoConjure] ? `
        <div class="tiny mt8" style="color:#9ce84a">
          Loop ativo: <b>${ACADEMY_CONJURES[p.config.autoConjure].name}</b> —
          conjura sozinho sempre que a mana permitir, enquanto estiver na academia.
        </div>` : `<div class="tiny dim mt8">Use <b>Loop</b> para conjurar automaticamente enquanto houver mana.</div>`}
      <div class="row mt8" style="gap:4px">
        <button class="full" id="academy-back-city">Voltar para cidade</button>
      </div>
    </div>`;
  $("#modal").classList.add("show");
  const conjureInput = $("#academy-conjure-text");
  conjureInput.focus();
  conjureInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = conjureInput.value.toLowerCase().replace(/^conjure:\s*/, "").trim();
    const found = academyConjuresFor(p).find((r) =>
      r.words.toLowerCase() === q || r.name.toLowerCase() === q ||
      r.name.toLowerCase().indexOf(q) !== -1);
    if (!found) { toast("Conjure não encontrado para sua vocação."); return; }
    const cast = castAcademyConjure(p, found.id);
    toast(cast.msg, cast.ok ? "level" : "");
    if (cast.ok) addLog("skill", cast.msg + (cast.mlUp ? ` Magic Level +${cast.mlUp}!` : ""));
    openAcademyConjureModal(true);
  });
  $("#academy-close").addEventListener("click", () => {
    G.activeNpc = null;
    $("#modal").classList.remove("show");
    renderAll();
  });
  $("#academy-toggle-list").addEventListener("click", () => openAcademyConjureModal(true));
  $("#academy-back-city").addEventListener("click", () => {
    $("#modal").classList.remove("show");
    stopAcademy();
  });
  $$("#academy-conjure-list [data-academy-loop]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.academyLoop;
      if (p.config.autoConjure === id) {
        p.config.autoConjure = null;
        toast("Auto-conjure desligado.");
      } else {
        const chk = academyConjureCheck(p, ACADEMY_CONJURES[id]);
        // mana baixa nao impede ligar o loop: ele espera encher
        if (!chk.ok && p.mp >= ACADEMY_CONJURES[id].mana) { toast(chk.msg); return; }
        p.config.autoConjure = id;
        toast(`Auto-conjure ligado: <b>${ACADEMY_CONJURES[id].name}</b>`);
        if (!G.training) toast("Entre na academia para o loop rodar.");
      }
      openAcademyConjureModal(true);
    }));
  $$("#academy-conjure-list [data-academy-conjure]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = castAcademyConjure(p, b.dataset.academyConjure);
      toast(r.msg, r.ok ? "level" : "");
      if (r.ok) {
        addLog("skill", r.msg + (r.mlUp ? ` Magic Level +${r.mlUp}!` : ""));
        renderAll();
      }
      openAcademyConjureModal(true);
    }));
}

function goldLine(p) {
  return `<div class="row mb8" style="justify-content:space-between">
    <span class="small dim">Seu ouro</span>
    <span class="gold-txt">${fmtFull(p.gold)} gp</span></div>`;
}

/* ---------------------------------------------------------- loja */
function npcShop(p) {
  const all = shopCatalog(p);
  const filtered = all.filter((e) => {
    if (shopSlot !== "all" && e.item.s !== shopSlot) return false;
    if (shopFilter && e.item.n.indexOf(shopFilter.toLowerCase()) === -1)
      return false;
    return true;
  });
  const slots = ["all", "weapon", "shield", "armor", "helmet", "legs",
                 "boots", "ring", "amulet", "quiver"];
  const names = { all: "Tudo", weapon: "Armas", shield: "Escudos",
    armor: "Armaduras", helmet: "Elmos", legs: "Pernas", boots: "Botas",
    ring: "Anéis", amulet: "Colares", quiver: "Quivers" };

  const rows = filtered.slice(0, 60).map((e) => {
    const cur = p.equip[e.item.s];
    const better = !cur || itemScore(p, e.slug) > itemScore(p, cur.item);
    const afford = p.gold >= e.price;
    return `<div class="shop-row" data-tip="${e.slug}">
      ${itemImg(e.slug, 30)}
      <div style="flex:1;min-width:0">
        <div class="small" style="color:${better ? "#9ce84a" : "#c8c0a8"}">
          ${e.item.n}${better ? " ▲" : ""}</div>
        <div class="tiny dim">${shopStatLine(e.item)}</div>
      </div>
      <button class="sm ${afford ? "primary" : ""}" data-buy-item="${e.slug}"
        data-price="${e.price}" ${afford ? "" : "disabled"}>
        ${fmtFull(e.price)}</button>
    </div>`;
  }).join("");

  return goldLine(p) + `
    <div class="row wrap mb8" style="gap:3px">
      ${slots.map((s) => `<button class="sm ${shopSlot === s ? "primary" : ""}"
        data-slot-filter="${s}">${names[s]}</button>`).join("")}
    </div>
    <input id="shop-search" placeholder="Buscar item…" value="${shopFilter}"
      style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:2px solid;border-color:#16140f #5a5348 #5a5348 #16140f;margin-bottom:6px">
    <div class="list" style="max-height:340px">${rows ||
      '<div class="dim small center" style="padding:16px">Nada encontrado</div>'}</div>
    <div class="tiny dim mt4">▲ = melhor que o seu equipamento atual</div>`;
}

function shopStatLine(it) {
  const s = [];
  if (it.atk) s.push("atk " + it.atk);
  if (it.def) s.push("def " + it.def + (it.extraDef ? " (+" + it.extraDef + ")" : ""));
  if (it.arm) s.push("arm " + it.arm);
  if (it.mdmg) s.push("mag " + (it.dmgMin ? it.dmgMin + "–" + it.dmgMax : it.mdmg));
  if (it.mag) s.push("ML+" + it.mag);
  for (const [campo, nome] of [["sword", "sword"], ["axe", "axe"], ["club", "club"],
       ["dist", "dist"], ["shield", "shield"], ["fist", "fist"], ["melee", "melee"]]) {
    if (it[campo]) s.push(nome + "+" + it[campo]);
  }
  if (it.prot) s.push("prot " + it.prot + "%");
  if (it.res && typeof it.res === "object") {
    for (const e of Object.keys(it.res)) {
      const v = it.res[e];
      s.push((v > 0 ? "+" : "") + v + "% " + e);
    }
  }
  if (it.lifeLeech) s.push("life leech " + it.lifeLeech + "%");
  if (it.manaLeech) s.push("mana leech " + it.manaLeech + "%");
  if (it.hpreg) s.push("hp+" + it.hpreg);
  if (it.mpreg) s.push("mp+" + it.mpreg);
  if (it.spd) s.push("spd+" + it.spd);
  if (it.mantra) s.push("mantra " + it.mantra);
  if (it.bond) s.push("bond " + it.bond);
  if (it.th) s.push("2H");
  if (it.lvl) s.push("nv " + it.lvl);
  if (it.w) s.push(Number(it.w).toFixed(2) + " oz");
  return s.join(" · ") || "—";
}

/** Rótulo de classe/tipo do item (slot/categoria), não a classificação de forja. */
function npcShopClassLabel(it) {
  if (!it) return "";
  const key = String(it.cat || it.s || it.t || "").toLowerCase();
  if (!key) return "";
  const i18nKey = "npc.class." + key;
  if (typeof t === "function") {
    const translated = t(i18nKey);
    if (translated && translated !== i18nKey) return translated;
  }
  const fallback = {
    helmet: "Elmo", armor: "Armadura", legs: "Pernas", boots: "Botas",
    shield: "Escudo", spellbook: "Spellbook", weapon: "Arma", fist: "Punho",
    ring: "Anel", amulet: "Amuleto", distance: "Distância", club: "Clava",
    sword: "Espada", axe: "Machado", loot: "Item", ammo: "Munição"
  };
  return fallback[key] || key;
}

function npcShopVocLabel(vocs) {
  if (!vocs || !vocs.length) return "";
  return vocs.map((v) => {
    const key = "voc." + v + ".name";
    if (typeof t === "function") {
      const name = t(key);
      if (name && name !== key) return name;
    }
    return v.charAt(0).toUpperCase() + v.slice(1);
  }).join(", ");
}

/**
 * Bloco de texto compartilhado das linhas de loja NPC (Enpa / Gnomally):
 * nome, descrição completa (stats / desc), vocação, classe, imbuements.
 */
function npcShopItemTextHtml(it, opts) {
  opts = opts || {};
  const name = (it && it.n) || opts.name || "—";
  const nameColor = opts.nameColor || "#c8c0a8";
  const nameSuffix = opts.nameSuffix || "";
  const descParts = [];
  if (it && it.desc) descParts.push(it.desc);
  const stats = it ? shopStatLine(it) : "";
  if (stats && stats !== "—") descParts.push(stats);
  const desc = descParts.join(" · ") || (opts.fallbackDesc || "—");

  const meta = [];
  const voc = npcShopVocLabel(it && it.vocs);
  if (voc) {
    const lab = typeof t === "function" ? t("npc.meta.vocation") : "Vocação";
    meta.push(`<div class="npc-shop-meta-line"><span class="npc-shop-meta-k">${lab}:</span> ${voc}</div>`);
  }
  const cls = npcShopClassLabel(it);
  if (cls) {
    const lab = typeof t === "function" ? t("npc.meta.class") : "Classe";
    meta.push(`<div class="npc-shop-meta-line"><span class="npc-shop-meta-k">${lab}:</span> ${cls}</div>`);
  }
  if (it && it.imbSlots) {
    const lab = typeof t === "function" ? t("npc.meta.imbuements") : "Imbuements";
    meta.push(`<div class="npc-shop-meta-line"><span class="npc-shop-meta-k">${lab}:</span> ${it.imbSlots}</div>`);
  }

  return `<div class="npc-shop-text">
      <div class="small npc-shop-name" style="color:${nameColor}">${name}${nameSuffix}</div>
      <div class="tiny dim npc-shop-desc">${desc}</div>
      ${meta.length ? `<div class="npc-shop-meta">${meta.join("")}</div>` : ""}
    </div>`;
}

/* ---------------------------------------------------------- NPC buy-only (catálogo fixo) */
function npcBuyOnly(p, shopId) {
  if (typeof ensureNpcShopItems === "function") ensureNpcShopItems();
  const shop = typeof npcShopDef === "function" ? npcShopDef(shopId) : null;
  const items = ((shop && shop.items) || []).slice().sort((a, b) => {
    const la = (GAMEDATA.items[a.slug] && GAMEDATA.items[a.slug].lvl) || 0;
    const lb = (GAMEDATA.items[b.slug] && GAMEDATA.items[b.slug].lvl) || 0;
    if (la !== lb) return la - lb;
    return (a.price || 0) - (b.price || 0);
  });
  let lastLvl = null;
  const rows = items.map((e) => {
    const it = GAMEDATA.items[e.slug];
    if (!it) return "";
    const lvl = it.lvl || 0;
    let header = "";
    if (lvl !== lastLvl) {
      lastLvl = lvl;
      const label = lvl > 0
        ? ((typeof t === "function" ? t("char.level") : "Nível") + " " + lvl)
        : (typeof t === "function" ? t("npc.levelNone") : "Sem nível");
      header = `<div class="hunt-cat-title">${label}</div>`;
    }
    const afford = p.gold >= e.price;
    const cur = it.s ? p.equip[it.s] : null;
    const better = it.s && (!cur || itemScore(p, e.slug) > itemScore(p, cur.item));
    return header + `<div class="shop-row npc-shop-row" data-tip="${e.slug}">
      ${itemImg(e.slug, 30)}
      ${npcShopItemTextHtml(it, {
        nameColor: better ? "#9ce84a" : "#c8c0a8",
        nameSuffix: better ? " ▲" : ""
      })}
      <button class="sm ${afford ? "primary" : ""}" data-npc-buy="${e.slug}"
        data-shop="${shopId}" data-price="${e.price}" ${afford ? "" : "disabled"}>
        ${typeof t === "function" ? t("npc.buy") : "Comprar"} ${fmtFull(e.price)}</button>
    </div>`;
  }).join("");

  return goldLine(p) + `
    <div class="tiny dim mb8">${typeof t === "function" ? t("npc.buyOnlyHint") : "Apenas compra — venda de loot pela Loot Pouch."}</div>
    <div class="list" style="max-height:360px">${rows ||
      '<div class="dim small center" style="padding:16px">Catálogo vazio</div>'}</div>`;
}

/* ---------------------------------------------------------- token barter (Gnomally) */
function npcTokenBarter(p, shopId) {
  if (typeof ensureNpcShopItems === "function") ensureNpcShopItems();
  const shop = typeof npcShopDef === "function" ? npcShopDef(shopId) : null;
  const token = (shop && shop.currency) || "major-crystalline-token";
  const have = typeof bagTokenCount === "function" ? bagTokenCount(p, token) : ((p.bag && p.bag[token]) || 0);
  const tokenName = typeof itemName === "function" ? itemName(token) : token;
  const items = (shop && shop.items) || [];

  const costBtn = (cost, can, extraAttr, disabled) =>
    `<button class="sm npc-barter-btn ${can ? "primary" : ""}" data-npc-barter="${extraAttr}"
      data-shop="${shopId}" ${disabled ? "disabled" : ""}>
      <span class="npc-barter-qty">${fmtFull(cost)}</span>${itemImg(token, 16, "npc-barter-token")}
    </button>`;

  const rows = items.map((e, idx) => {
    const cost = e.cost || 0;
    const can = have >= cost;
    if (e.kind === "outfit") {
      const oid = typeof npcOutfitIdForPlayer === "function"
        ? npcOutfitIdForPlayer(p, e.outfitBase) : null;
      const owned = oid && typeof ownsOutfit === "function" && ownsOutfit(p, oid);
      const disabled = !can || owned;
      return `<div class="shop-row npc-shop-row">
        <span class="npc-shop-icon-fallback" style="width:30px;text-align:center">🧥</span>
        ${npcShopItemTextHtml(null, {
          name: e.name || e.outfitBase,
          fallbackDesc: owned ? "já possui" : "—"
        })}
        ${costBtn(cost, can && !owned, idx, disabled)}
      </div>`;
    }
    const it = GAMEDATA.items[e.slug];
    if (!it) return "";
    return `<div class="shop-row npc-shop-row" data-tip="${e.slug}">
      ${itemImg(e.slug, 30)}
      ${npcShopItemTextHtml(it)}
      ${costBtn(cost, can, idx, !can)}
    </div>`;
  }).join("");

  return `
    <div class="row mb8" style="justify-content:space-between;align-items:center">
      <span class="small dim">${typeof t === "function" ? t("npc.tokensInBag") : "Tokens na backpack"}</span>
      <span class="row" style="gap:6px;align-items:center">
        ${itemImg(token, 22)}
        <b class="gold-txt">${fmtFull(have)}</b>
        <span class="tiny dim">${tokenName}</span>
      </span>
    </div>
    <div class="tiny dim mb8">${typeof t === "function" ? t("npc.tokenBarterHint") : "Trocas só com tokens da backpack (não da pouch)."}</div>
    <div class="list" style="max-height:360px">${rows ||
      '<div class="dim small center" style="padding:16px">Nenhuma oferta</div>'}</div>`;
}

/* ---------------------------------------------------------- supplies */
function npcSupply(p) {
  const rows = Object.keys(SUPPLIES).map((slug) => {
    const s = SUPPLIES[slug];
    const locked = (s.lvl || 1) > p.level;
    const price = supplyPrice(s, p.level);
    const pw = supplyPower(s, p.level);
    const have = p.supplies[slug] || 0;
    const eff = s.type === "heal" ? `cura ${pw[0]}–${pw[1]}` :
                s.type === "attack" ? `dano ${pw[0]}–${pw[1]}` :
                s.type === "mana" ? `mana ${pw[0]}–${pw[1]}` : "comida";
    return `<div class="shop-row" style="opacity:${locked ? .4 : 1}">
      ${itemImg(s.sprite, 30)}
      <div style="flex:1;min-width:0">
        <div class="small">${s.name}</div>
        <div class="tiny dim">${eff} · cargas ${have} · ${fmtFull(price)} gp/carga${locked ? ` · <span style="color:#ff9a6a">nv ${s.lvl}</span>` : ""}</div>
      </div>
      <div class="row" style="gap:2px">
        ${[10, 50, 200].map((n) => `<button class="sm" data-buy-sup="${slug}"
          data-n="${n}" ${locked || p.gold < price * n ? "disabled" : ""}>
          +${n}c</button>`).join("")}
      </div>
    </div>`;
  }).join("");
  return goldLine(p) + `<div class="list" style="max-height:340px">${rows}</div>
    <div class="tiny dim mt4">Supplies usam cargas. Se uma carga selecionada chegar a 0, a próxima é comprada automaticamente no uso.</div>`;
}

/* ---------------------------------------------------------- vender */
function npcSell(p) {
  const entries = Object.keys(p.bag).filter((s) => GAMEDATA.items[s]);
  let total = 0;
  for (const s of entries)
    total += (GAMEDATA.items[s].sell || 0) * p.bag[s];

  const rows = entries.sort((a, b) =>
    (GAMEDATA.items[b].sell || 0) * p.bag[b] -
    (GAMEDATA.items[a].sell || 0) * p.bag[a]).map((slug) => {
    const it = GAMEDATA.items[slug];
    const val = (it.sell || 0) * p.bag[slug];
    return `<div class="shop-row" data-tip="${slug}">
      ${itemImg(slug, 30)}
      <div style="flex:1;min-width:0">
        <div class="small">${it.n}</div>
        <div class="tiny dim">${p.bag[slug]}x · ${fmtFull(it.sell || 0)} gp cada</div>
      </div>
      <span class="tiny dim">${fmtFull(val)} gp</span>
    </div>`;
  }).join("");

  if (!entries.length)
    return goldLine(p) +
      `<div class="dim small center" style="padding:20px">Sua mochila está vazia.</div>`;

  return goldLine(p) + `
    <div class="list mb8" style="max-height:320px">${rows}</div>
    <div class="tiny dim center">
      Clique em um item para abrir as opções e vender.<br>
      Para vender o loot de uma vez, use <b>Sell all</b> na Loot Pouch.
    </div>`;
}

/* ---------------------------------------------------------- ferreiro */
function npcUpgrade(p) {
  const dust = p.dust || 0;
  const list = [];
  for (const slot of UPGRADE_SLOTS) {
    const e = p.equip[slot];
    if (e && GAMEDATA.items[e.item])
      list.push({ source: "equip", slot: slot, slug: e.item });
  }
  for (const slug in p.bag) {
    const it = GAMEDATA.items[slug];
    if (it && it.s && UPGRADE_SLOTS.indexOf(it.s) !== -1)
      list.push({ source: "bag", slot: it.s, slug: slug });
  }

  const rows = list.map((entry) => {
    const key = upgradeKey(entry.source, entry.slot, entry.slug);
    const it = GAMEDATA.items[entry.slug];
    const tier = itemUpgradeTier(p, key);
    const check = canUpgrade(p, key, entry.slug);
    const cost = check.cost || upgradeCost(p, entry.slug, tier);
    const maxed = tier >= UPGRADE_MAX_TIER;
    const stats = upgradedStats(p, key, entry.slug);
    const bits = [];
    if (stats.atk) bits.push(`atk ${stats.atk}`);
    if (stats.def) bits.push(`def ${stats.def}`);
    if (stats.arm) bits.push(`arm ${stats.arm}`);
    return `<div class="shop-row" data-tip="${entry.slug}" style="opacity:${check.ok || maxed ? 1 : .5}">
      ${itemImg(entry.slug, 30)}
      <div style="flex:1;min-width:0">
        <div class="small">${it.n}${tier ? ` <b style="color:#d4af37">+${tier}</b>` : ""}
          <span class="tiny dim">· ${entry.source === "equip" ? "equipado" : "mochila"}</span></div>
        <div class="tiny dim">${bits.join(" · ") || "sem atributos"}</div>
        <div class="tiny dim">${maxed ? `<span style="color:#9ce84a">nível máximo</span>`
          : `${fmtFull(cost.gold)} gp · ${cost.dust}x Dust · ${cost.chance}% sucesso`}</div>
      </div>
      <button class="sm ${check.ok ? "primary" : ""}" data-upgrade="${key}|${entry.slug}"
        ${check.ok ? "" : "disabled"}>${maxed ? "MAX" : `+${tier + 1}`}</button>
    </div>`;
  }).join("");

  return goldLine(p) + `
    <div class="row mb8" style="justify-content:space-between">
      <span class="small dim"><img src="assets/item/dust.gif" style="width:14px;height:14px;vertical-align:-3px;margin-right:4px">Dust (Forja)</span>
      <b style="color:#b060ff">${fmtFull(dust)}</b>
    </div>
    <div class="list mb8" style="max-height:330px">
      ${rows || `<div class="dim small center" style="padding:18px">Nenhum equipamento para melhorar.</div>`}
    </div>
    <div class="tiny dim">
      Cada upgrade soma <b>+6%</b> nos atributos do item. Até <b>+3</b> o sucesso é garantido;
      a partir do <b>+4</b> a forja pode falhar e consumir o material — o item nunca é destruído.
      O Dust vem de monstros influenciados e fiendish.
    </div>`;
}

/* ---------------------------------------------------------- banco */
function npcBank(p) {
  return `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Em mãos</span>
        <span class="v gold-txt">${fmtFull(p.gold)} gp</span></div>
      <div class="stat-row"><span class="k">No banco</span>
        <span class="v" style="color:#7ad2ff">${fmtFull(p.bank || 0)} gp</span></div>
      <div class="stat-row"><span class="k">Total</span>
        <span class="v">${fmtFull(p.gold + (p.bank || 0))} gp</span></div>
    </div>
    <div class="small dim mb4">Depositar</div>
    <div class="row wrap mb8" style="gap:3px">
      <button class="sm" data-dep="1000">1k</button>
      <button class="sm" data-dep="10000">10k</button>
      <button class="sm" data-dep="100000">100k</button>
      <button class="sm primary" data-dep="all">Tudo</button>
    </div>
    <div class="small dim mb4">Sacar</div>
    <div class="row wrap" style="gap:3px">
      <button class="sm" data-wd="1000">1k</button>
      <button class="sm" data-wd="10000">10k</button>
      <button class="sm" data-wd="100000">100k</button>
      <button class="sm" data-wd="all">Tudo</button>
    </div>
    <div class="tiny dim mt8">
      Ouro no banco não é perdido quando você morre.</div>`;
}

/* ---------------------------------------------------------- templo */
function npcTemple(p) {
  const max = maxStats(p);
  const price = blessPrice(p);
  return `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Vida</span>
        <span class="v">${Math.floor(p.hp)} / ${max.hp}</span></div>
      <div class="stat-row"><span class="k">Mana</span>
        <span class="v">${Math.floor(p.mp)} / ${max.mp}</span></div>
      <div class="stat-row"><span class="k">Bênção</span>
        <span class="v" style="color:${p.blessed ? "#9ce84a" : "#8a8270"}">
          ${p.blessed ? "ativa" : "não possui"}</span></div>
      <div class="stat-row"><span class="k">Mortes</span>
        <span class="v">${p.deaths}</span></div>
    </div>
    <button class="full mb8" id="temple-heal">Curar gratuitamente</button>
    <button class="primary full" id="temple-bless" ${p.blessed || p.gold < price ? "disabled" : ""}>
      Comprar bênção — ${fmtFull(price)} gp</button>
    <div class="tiny dim mt8">
      A bênção é consumida ao morrer. Preço: 50% × level até 120,
      70% até 399 e 100% a partir do level 400.</div>`;
}

/* ---------------------------------------------------------- promoção */
const PROMOTION_PRICE = 20000;
const PROMOTION_LEVEL = 20;

/* Online: só personagens da conta logada (mesmo escopo do picker pós-login /
 * accountCharacterCache de /api/me). Offline: roster local completo. */
function promotionAccountCharacters() {
  const online = typeof accountApiConfigured === "function" && accountApiConfigured()
    && typeof sessionToken === "function" && !!sessionToken()
    && typeof accountCharacterCacheRead === "function";
  if (!online) return typeof getCharacters === "function" ? getCharacters() : [];

  const cache = accountCharacterCacheRead() || [];
  if (!cache.length) {
    return G.p ? [G.p] : [];
  }
  const roster = typeof getCharacters === "function" ? getCharacters() : [];
  const byId = new Map(roster.map((c) => [String(c.id), c]));
  const currentId = G.p ? String(characterId(G.p)) : "";
  return cache.map((summary) => {
    const id = String(summary.id);
    if (currentId && id === currentId) return G.p;
    if (byId.has(id)) return byId.get(id);
    let raw = summary.snapshot || {};
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (e) { raw = {}; }
    }
    raw = raw && typeof raw === "object" ? raw : {};
    const merged = Object.assign({}, raw, {
      id,
      name: summary.name || raw.name,
      voc: summary.voc || raw.voc || "knight",
      level: Number(summary.level) || Number(raw.level) || 1,
      sex: summary.sex || raw.sex || "male",
      promoted: summary.promoted !== undefined ? !!summary.promoted : !!raw.promoted,
      outfit: summary.outfit || raw.outfit || null,
    });
    const p = typeof normalizePlayer === "function" ? normalizePlayer(merged) : merged;
    p.id = id;
    return p;
  }).filter(Boolean);
}

function promotionEligibility(p) {
  if (p.promoted) return { ok: false, msg: "Já promovido" };
  if (p.level < PROMOTION_LEVEL) return { ok: false, msg: `Requer nível ${PROMOTION_LEVEL}` };
  if ((p.gold || 0) < PROMOTION_PRICE) return { ok: false, msg: `Requer ${fmtFull(PROMOTION_PRICE)} gp` };
  return { ok: true, msg: "Pronto" };
}

function promoteCharacterById(id) {
  const currentId = G.p ? characterId(G.p) : null;
  const wanted = String(id);
  let target = null;
  if (String(currentId) === wanted) target = G.p;
  else target = promotionAccountCharacters().find((p) => String(p.id) === wanted);
  if (!target) return { ok: false, msg: "Personagem não encontrado." };
  const check = promotionEligibility(target);
  if (!check.ok) return check;
  if (!spendGold(target, PROMOTION_PRICE)) return { ok: false, msg: "Ouro insuficiente." };
  target.promoted = true;
  target.promotedAt = Date.now();
  saveCharacterToRoster(target);
  if (String(currentId) === wanted) G.p = target;
  return { ok: true, msg: `${target.name} agora é ${vocationName(target)}!` };
}

function npcPromotion() {
  const chars = promotionAccountCharacters();
  return `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Preço</span><span class="v gold-txt">${fmtFull(PROMOTION_PRICE)} gp</span></div>
      <div class="stat-row"><span class="k">Nível mínimo</span><span class="v">${PROMOTION_LEVEL}</span></div>
    </div>
    <div class="small dim mb4">Escolha o personagem para promover</div>
    <div class="list" style="max-height:330px">
      ${chars.map((ch) => {
        const e = promotionEligibility(ch);
        return `<div class="shop-row">
          <div style="flex:1;min-width:0">
            <div class="small" style="color:${ch.promoted ? "#9ce84a" : "#c8c0a8"}">${ch.name}</div>
            <div class="tiny dim">${vocationName(ch)} · nível ${ch.level} · ${fmtFull(ch.gold || 0)} gp</div>
          </div>
          <div class="tiny ${e.ok ? "" : "dim"}" style="color:${e.ok ? "#9ce84a" : "#ff9a6a"}">${e.msg}</div>
          <button class="sm primary" data-promote-char="${ch.id}" ${e.ok ? "" : "disabled"}>Promover</button>
        </div>`;
      }).join("") || `<div class="dim small center" style="padding:14px">Nenhum personagem salvo.</div>`}
    </div>
    <div class="tiny dim mt8">Promoções: Elite Knight, Royal Paladin, Elder Druid e Master Sorcerer.</div>`;
}

/* ---------------------------------------------------------- academia */
function npcTrain(p) {
  const st = academyStatus(p);
  const skillTxt = st.skill === "magic" ? "Magic Level (65 mana por hit)" :
    st.skill ? SKILL_NAMES[st.skill] : "aguardando equipamento";
  const weapon = p.equip.weapon ? itemName(p.equip.weapon.item) : "nenhuma";
  const ammo = p.equip.ammo ? `${itemName(p.equip.ammo.item)} (${ammoCount(p, p.equip.ammo.item)})` : "nenhuma";

  const dummyId = (p.config && p.config.dummy) || "exercise";
  const dummy = EXERCISE_DUMMIES[dummyId] || EXERCISE_DUMMIES.exercise;
  const rate = dummy.rate / 100;
  const isMagic = st.skill === "magic";
  const porGolpe = isMagic
    ? `${Math.floor(EXERCISE_MANA * rate)} mana spent`
    : `${(EXERCISE_TRIES * rate).toFixed(1)} tries`;
  const intervalo = (exerciseInterval(p) / 1000).toFixed(1);

  return goldLine(p) + `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Sala</span><span class="v">Safezone</span></div>
      <div class="stat-row"><span class="k">Dummy</span><span class="v">${dummy.name}</span></div>
      <div class="stat-row"><span class="k">Vocação</span><span class="v">${vocationName(p)}</span></div>
      <div class="stat-row"><span class="k">Skill treinada</span><span class="v">${skillTxt}</span></div>
      <div class="stat-row"><span class="k">Por golpe</span><span class="v" style="color:#9ce84a">${porGolpe}</span></div>
      <div class="stat-row"><span class="k">Intervalo</span><span class="v">${intervalo}s</span></div>
      <div class="stat-row"><span class="k">Taxa do dummy</span><span class="v">${dummy.rate}%</span></div>
      <div class="stat-row"><span class="k">Shielding</span><span class="v">Todos os hits</span></div>
      <div class="stat-row"><span class="k">Weapon</span><span class="v">${weapon}</span></div>
    </div>
    <div class="small dim mb4">Exercise dummy</div>
    <div class="row wrap mb8" style="gap:4px">
      ${Object.keys(EXERCISE_DUMMIES).map((id) => {
        const d = EXERCISE_DUMMIES[id];
        const dono = id === "exercise" || (p.dummies && p.dummies[id]);
        const sel = id === dummyId;
        return `<button class="sm ${sel ? "primary" : ""}" data-dummy="${id}"
          title="${dono ? `taxa ${d.rate}%` : `comprar por ${fmtFull(d.price)} gp`}">
          ${d.name.replace(" Exercise Dummy", "").replace("Exercise Dummy", "Básico")}
          ${dono ? "" : `· ${fmtFull(d.price)}`}</button>`;
      }).join("")}
    </div>
    <div class="tiny dim mb8">
      Fórmula do Canary: <b>${isMagic ? "600" : "7"} × taxa</b> por golpe, a cada
      <b>baseAttackSpeed / rateExerciseTrainingSpeed</b>. Não é preciso ter a
      exercise weapon — treina com o equipamento atual.
    </div>
    ${st.ok ? "" : `<div class="small mb8" style="color:#ffb060">${st.msg}</div>`}
    <button class="primary full mb8" id="academy-enter">Teleportar para Academia</button>
    <button class="full" id="academy-conjure-list">Abrir conjure</button>
    <div class="tiny dim mt8">
      Dentro da academia você bate no exercise dummy em safezone. A skill treinada
      segue a arma equipada — sem arma, treina punho. Mages acumulam mana spent
      sem gastar mana, distance não consome munição, e todos ganham shielding.
    </div>`;
}

/* ---------------------------------------------------------- estalagem */
function npcInn(p) {
  const MAX = 42 * 3600;
  const pct = (p.stamina / MAX) * 100;
  return `
    <div class="mb8">
      <div class="row small mb4" style="justify-content:space-between">
        <span class="dim">Stamina</span>
        <span class="v">${fmtTime(p.stamina)} / 42h</span>
      </div>
      <div class="bar"><div class="fill sta" style="width:${pct}%"></div></div>
    </div>
    ${goldLine(p)}
    <div class="row wrap" style="gap:4px">
      ${[1, 5, 12, 42].map((h) => `<button class="sm" data-rest="${h}"
        ${p.gold < restPrice(p, h) ? "disabled" : ""}>
        ${h}h · ${fmtFull(restPrice(p, h))}</button>`).join("")}
    </div>
    <div class="tiny dim mt8">
      Stamina temporariamente desativada: todos permanecem com <b style="color:#9ce84a">42h</b>.</div>`;
}

/* ---------------------------------------------------------- viagens */
function npcTravel(p) {
  return `<button class="primary full" data-open-hunts-catalog>
    <span class="hunts-demon-icon" aria-hidden="true"></span>
    <span>Abrir catálogo de HUNTS</span>
  </button>
  <div class="tiny dim center mt8">Todas as áreas disponíveis ficam no catálogo único por sessão.</div>`;
}

/* ---------------------------------------------------------- binds */
function bindNpc(id, type) {
  const p = G.p;

  // tooltips dos itens
  $$("#npc-content [data-tip]").forEach((el) => {
    const slug = el.dataset.tip;
    el.addEventListener("mouseenter", () => showTip(itemTip(slug)));
    el.addEventListener("mouseleave", hideTip);
  });

  // loja de equipamentos
  $$("#npc-content [data-slot-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      shopSlot = b.dataset.slotFilter;
      refreshNpc(id);
    }));
  const search = $("#shop-search");
  if (search) {
    search.addEventListener("input", (e) => {
      shopFilter = e.target.value.toLowerCase();
      clearTimeout(G.searchT);
      G.searchT = setTimeout(() => {
        refreshNpc(id);
        const s2 = $("#shop-search");
        if (s2) { s2.focus(); s2.setSelectionRange(999, 999); }
      }, 260);
    });
  }
  $$("#npc-content [data-buy-item]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.buyItem;
      const r = buyItem(p, slug, parseInt(b.dataset.price, 10));
      if (!r.ok) { toast(r.msg); return; }
      toast(`Comprou <b>${itemName(slug)}</b>`);
      addLog("sell", `Comprou <b>${itemName(slug)}</b> por ${fmtFull(b.dataset.price)} gp`);
      hideTip();
      refreshNpc(id);
    }));

  $$("#npc-content [data-npc-buy]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.npcBuy;
      const shopId = b.dataset.shop;
      const r = typeof buyNpcCatalogItem === "function"
        ? buyNpcCatalogItem(p, shopId, slug)
        : buyItem(p, slug, parseInt(b.dataset.price, 10));
      if (!r.ok) { toast(r.msg); return; }
      toast(`${typeof t === "function" ? t("npc.bought") : "Comprou"} <b>${itemName(slug)}</b>`);
      addLog("sell", `Comprou <b>${itemName(slug)}</b> por ${fmtFull(b.dataset.price)} gp`);
      hideTip();
      refreshNpc(id);
    }));

  $$("#npc-content [data-npc-barter]").forEach((b) =>
    b.addEventListener("click", () => {
      const idx = parseInt(b.dataset.npcBarter, 10);
      const shopId = b.dataset.shop;
      const r = typeof exchangeNpcBarter === "function"
        ? exchangeNpcBarter(p, shopId, idx)
        : { ok: false, msg: "Troca indisponível." };
      if (!r.ok) { toast(r.msg); return; }
      toast(r.msg, "level");
      addLog("sell", r.msg);
      hideTip();
      refreshNpc(id);
      renderAll();
    }));

  // supplies
  $$("#npc-content [data-buy-sup]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.buySup, n = parseInt(b.dataset.n, 10);
      const s = SUPPLIES[slug];
      const cost = supplyPrice(s, p.level) * n;
      if (!spendGold(p, cost)) { toast("Ouro insuficiente"); return; }
      p.supplies[slug] = (p.supplies[slug] || 0) + n;
      addLog("sell", `Comprou ${n} carga(s) de ${s.name} por ${fmtFull(cost)} gp`);
      refreshNpc(id);
    }));

  // ferreiro: aplicar upgrade
  $$("#npc-content [data-upgrade]").forEach((b) =>
    b.addEventListener("click", () => {
      const [key, slug] = b.dataset.upgrade.split("|");
      const r = applyUpgrade(p, key, slug);
      if (!r.ok) { toast(r.msg); return; }
      toast(r.msg, r.success ? "level" : "death");
      addLog(r.success ? "skill" : "death", r.msg);
      hideTip();
      refreshNpc(id);
      renderAll();
    }));

  // vender: clicar no item abre o menu de opções (nunca vende direto)
  if (type === "sell") {
    $$("#npc-content .shop-row[data-tip]").forEach((row) => {
      const slug = row.dataset.tip;
      if (!p.bag[slug]) return;
      row.classList.add("clickable");
      const openMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTip();
        openBagItemMenu(p, slug, e.clientX, e.clientY, () => refreshNpc(id));
      };
      row.addEventListener("click", openMenu);
      row.addEventListener("contextmenu", openMenu);
    });
  }

  // oberon trader
  $$("#npc-content [data-oberon-trade]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = oberonTraderExchange(p);
      if (!r.ok) { toast(r.msg); return; }
      toast(r.msg, "level");
      addLog("sell", r.msg);
      hideTip();
      refreshNpc(id);
      renderAll();
    }));
  $$("#npc-content [data-oberon-buy-wings]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = oberonTraderBuyWings(p);
      if (!r.ok) { toast(r.msg); return; }
      toast(r.msg, "level");
      addLog("sell", r.msg);
      hideTip();
      refreshNpc(id);
      renderAll();
    }));

  // banco
  $$("#npc-content [data-dep]").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.dep === "all" ? p.gold : parseInt(b.dataset.dep, 10);
      const done = bankDeposit(p, v);
      if (done > 0) toast(`Depositou ${fmtFull(done)} gp`);
      refreshNpc(id);
    }));
  $$("#npc-content [data-wd]").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.wd === "all" ? p.bank : parseInt(b.dataset.wd, 10);
      const done = bankWithdraw(p, v);
      if (done > 0) toast(`Sacou ${fmtFull(done)} gp`);
      refreshNpc(id);
    }));

  // templo
  const heal = $("#temple-heal");
  if (heal) heal.addEventListener("click", () => {
    const m = maxStats(p);
    p.hp = m.hp; p.mp = m.mp;
    if (typeof clearPlayerCombatConditions === "function") clearPlayerCombatConditions(p);
    else p.conditions = {};
    toast("Curado completamente");
    refreshNpc(id);
  });
  const bless = $("#temple-bless");
  if (bless) bless.addEventListener("click", () => {
    const r = buyBlessing(p);
    toast(r.msg, r.ok ? "level" : "");
    if (r.ok) addLog("info", "Recebeu a bênção do templo.");
    refreshNpc(id);
  });

  // promoção King Tibianus
  $$("#npc-content [data-promote-char]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = promoteCharacterById(b.dataset.promoteChar);
      toast(r.msg, r.ok ? "level" : "");
      if (r.ok) addLog("level", r.msg);
      refreshNpc(id);
      renderAll();
    }));

  // academia
  const academyEnter = $("#academy-enter");
  if (academyEnter) academyEnter.addEventListener("click", () => {
    $("#modal").classList.remove("show");
    startAcademy();
  });
  // escolher / comprar exercise dummy
  $$("#npc-content [data-dummy]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.dummy;
      const d = EXERCISE_DUMMIES[id];
      if (!d) return;
      p.dummies = p.dummies || {};
      const dono = id === "exercise" || p.dummies[id];
      if (!dono) {
        if (p.gold < d.price) { toast(`Faltam ${fmtFull(d.price - p.gold)} gp.`); return; }
        p.gold -= d.price;
        p.dummies[id] = 1;
        addLog("sell", `Comprou <b>${d.name}</b> por <span class="gold-txt">${fmtFull(d.price)} gp</span>`);
      }
      p.config.dummy = id;
      toast(`Treinando no <b>${d.name}</b> (${d.rate}%)`);
      refreshNpc(G.activeNpc || "trainer");
      renderAll();
    }));

  const academyConjure = $("#academy-conjure-list");
  if (academyConjure) academyConjure.addEventListener("click", () => {
    openAcademyConjureModal(true);
  });

  // estalagem
  $$("#npc-content [data-rest]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = buyRest(p, parseInt(b.dataset.rest, 10));
      toast(r.msg);
      if (r.ok) addLog("info", `Descansou na estalagem por ${fmtFull(r.price)} gp`);
      refreshNpc(id);
    }));

  // viagens: o NPC reutiliza o mesmo catálogo único do botão HUNTS.
  $$("#npc-content [data-open-hunts-catalog]").forEach((el) => {
    el.addEventListener("click", () => {
      closeNpc();
      if (typeof openHuntsModal === "function") openHuntsModal();
    });
  });

  // Umbral Creation: tabs
  $$("#npc-content [data-umbral-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.umbralTab;
      $$("#npc-content [data-umbral-tab]").forEach((t) => t.classList.toggle("active", t === tab));
      $$("#npc-content [data-umbral-panel]").forEach((p) => {
        p.style.display = p.dataset.umbralPanel === id ? "" : "none";
      });
    });
  });
  // Umbral Creation: craft
  $$("#npc-content [data-umbral-craft]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = tryUmbralCraft(p, b.dataset.umbralCraft, b.dataset.umbralTo, b.dataset.umbralFrom, b.dataset.umbralDream, b.dataset.umbralCluster);
      toast(r.msg, r.ok ? "level" : "death");
      if (r.ok) addLog("skill", r.msg);
      else addLog("death", r.msg);
      hideTip();
      refreshNpc(id);
      renderAll();
    }));
}
