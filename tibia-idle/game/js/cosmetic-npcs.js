"use strict";

let cosmeticNpcRequest = 0;

function cosmeticNpcPortrait(id) {
  return `<span data-cosmetic-portrait="${id}" class="npc-modal-sprite" style="display:inline-flex;width:52px;height:52px"></span>`;
}

function paintCosmeticNpcPortraits() {
  const paint = (attempt) => {
    let pending = false;
    document.querySelectorAll("[data-cosmetic-portrait]").forEach((slot) => {
      if (slot.firstChild) return;
      const addoner = slot.dataset.cosmeticPortrait === "addoner";
      const canvas = AppearanceRenderer.outfit(addoner ? "golden-m" : "beggar-m", addoner ? 3 : 2,
        addoner ? [0, 0, 0, 0] : [114, 113, 132, 132], "s", 0);
      if (!canvas) { pending = true; return; }
      canvas.style.cssText = "width:52px;height:52px;object-fit:contain;image-rendering:pixelated";
      slot.appendChild(canvas);
    });
    if (pending && attempt < 60) setTimeout(() => paint(attempt + 1), 100);
  };
  paint(0);
}

async function openCosmeticNpc(id, recipe, alternative) {
  const token = sessionToken(), request = ++cosmeticNpcRequest;
  G.activeNpc = id;
  const body = $("#modal-body");
  clearCityModalShells(body);
  body.classList.add("npc-modal-shell");
  body.innerHTML = `<div class="panel-title npc-modal-title">${cosmeticNpcPortrait(id)}
    <span>${id === "addoner" ? "ADDONER — Outfits e Addons" : "Lothar — Montarias"}</span>
    <button class="sm" id="cosmetic-npc-close">Fechar</button></div>
    <div class="panel-body"><div class="small mb8">Desbloqueios permanentes para todos os personagens da conta. Coloque os itens de troca na Bag.</div>
    <div id="cosmetic-npc-content">Carregando...</div></div>`;
  $("#modal").classList.add("show");
  $("#cosmetic-npc-close").onclick = closeNpc;
  paintCosmeticNpcPortraits();
  try {
    const response = await _api("POST", "/api/account/wardrobe", { token, recipe, alternative });
    if (sessionToken() !== token || request !== cosmeticNpcRequest || G.activeNpc !== id) return;
    const data = response.data;
    if (data.cosmetics) {
      const account = sessionAccount();
      if (account) {
        account.cosmetics = data.cosmetics;
        sessionStorage.setItem("tibia-idle-account", JSON.stringify(account));
      }
    }
    if (data.sharedInventory) accountApplySharedInventory(data.sharedInventory);
    if (recipe && data.msg) toast(data.msg);
    if (!data.catalog) { $("#cosmetic-npc-content").textContent = data.msg || "Não foi possível carregar as trocas."; return; }
    renderCosmeticNpcOffers(id, data.catalog.filter((r) => r.npc === id));
  } catch (error) {
    if (request === cosmeticNpcRequest && G.activeNpc === id)
      $("#cosmetic-npc-content").textContent = "Falha de conexão. Feche e abra o NPC para tentar novamente.";
  }
}

function renderCosmeticNpcOffers(id, offers) {
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const content = $("#cosmetic-npc-content");
  content.innerHTML = `<input id="cosmetic-npc-search" placeholder="Buscar ${id === "lothar" ? "montaria" : "outfit"}..." style="width:100%;box-sizing:border-box;margin-bottom:8px">
    <div id="cosmetic-npc-offers"></div>`;
  const render = () => {
    const search = $("#cosmetic-npc-search").value.toLowerCase().trim();
    $("#cosmetic-npc-offers").innerHTML = offers.filter((r) => r.name.toLowerCase().includes(search)).map((r) => {
      const title = escape(r.name) + (r.kind === "addon" ? " — Addon " + r.addon : r.kind === "outfit" ? " — Outfit" : "");
      const costs = (r.alternatives || []).map((items, index) => {
        const enough = items.every((i) => Number(G.p && G.p.bag && G.p.bag[i.slug]) >= i.count)
          && (!r.catalyst || Number(G.p && G.p.bag && G.p.bag[r.catalyst]) > 0);
        return `<div class="row wrap mb4" style="gap:6px"><span class="tiny" style="flex:1">${items.map((i) => {
          const item = GAMEDATA.items[i.slug];
          return `${item ? itemImg(i.slug, 22) : ""} ${i.count}× ${escape(item ? item.n : i.slug.replace(/-/g, " "))}`;
        }).join(" + ")}</span><button class="sm" data-cosmetic-exchange="${escape(r.id)}" data-alternative="${index}" ${r.owned || !r.available || !enough ? "disabled" : ""}>Trocar</button></div>`;
      }).join("");
      return `<div class="panel mb8"><div class="panel-body"><b>${title}</b><div class="tiny dim mb4">${r.owned ? "Desbloqueado na conta" : escape(r.reason || "Troca por itens")}</div>${r.catalyst && !r.owned ? `<div class="tiny dim">Também requer ${escape(r.catalyst.replace(/-/g, " "))} na Bag (não consumido).</div>` : ""}${r.owned ? "" : costs}</div></div>`;
    }).join("") || `<div class="tiny dim">Nenhum resultado.</div>`;
    content.querySelectorAll("[data-cosmetic-exchange]").forEach((button) => {
      button.onclick = () => { button.disabled = true; openCosmeticNpc(id, button.dataset.cosmeticExchange, Number(button.dataset.alternative)); };
    });
  };
  $("#cosmetic-npc-search").oninput = render;
  render();
}
