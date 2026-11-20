"use strict";

let cosmeticNpcRequest = 0;

function cosmeticEscape(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

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
    <div class="panel-body"><div class="small mb8">Desbloqueios permanentes para todos os personagens da conta. Itens de troca podem estar na Bag ou na Loot Pouch.</div>
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

/* Frame parado (sul) do sheet da montaria via background CSS — sem canvas:
 * o caminho AppearanceRenderer.mount/Sprites podia envenenar o cache num
 * 404 transitório e deixar o slot vazio pra sempre (montaria "sem sprite"). */
function cosmeticMountSpriteHtml(id, meta, size) {
  const cw = meta.cw || 64, ch = meta.ch || 64;
  const cols = meta.cols || 9, rows = meta.rows || 4;
  const sz = size || 44;
  const scale = sz / Math.max(cw, ch);
  const bgW = cw * cols * scale, bgH = ch * rows * scale;
  const bgY = -2 * ch * scale;
  return `<span class="cosmetic-mount-sprite" style="display:inline-flex;width:${sz}px;height:${sz}px;flex:none;` +
    `background:url('assets/appearance/mount/${id}.base.png') 0px ${bgY}px / ${bgW}px ${bgH}px no-repeat;` +
    `image-rendering:pixelated" title="${cosmeticEscape(meta.nome || id)}"></span>`;
}

function renderCosmeticNpcOffers(id, offers) {
  const escape = cosmeticEscape;
  const content = $("#cosmetic-npc-content");
  content.innerHTML = `<input id="cosmetic-npc-search" placeholder="Buscar ${id === "lothar" ? "montaria" : "outfit"}..." style="width:100%;box-sizing:border-box;margin-bottom:8px">
    <div id="cosmetic-npc-offers"></div>`;
  const render = () => {
    const search = $("#cosmetic-npc-search").value.toLowerCase().trim();
    $("#cosmetic-npc-offers").innerHTML = offers.filter((r) => r.name.toLowerCase().includes(search)).map((r) => {
      const title = escape(r.name) + (r.kind === "addon" ? " — Addon " + r.addon : r.kind === "outfit" ? " — Outfit" : "");
      const costs = (r.alternatives || []).map((items, index) => {
        /* `enough`/`have` autoritativos vêm do servidor (Bag + Loot Pouch da
         * conta); o espelho local é só fallback para catálogo antigo. */
        const localEnough = items.every((i) =>
            Number(G.p && (Number(G.p.bag && G.p.bag[i.slug]) + Number(G.p.lootPouch && G.p.lootPouch[i.slug]))) >= i.count)
          && (!r.catalyst || Number(G.p && (Number(G.p.bag && G.p.bag[r.catalyst]) + Number(G.p.lootPouch && G.p.lootPouch[r.catalyst]))) > 0);
        const enough = Array.isArray(r.enough) ? !!r.enough[index] : localEnough;
        const have = r.have || {};
        return `<div class="row wrap mb4" style="gap:6px"><span class="tiny" style="flex:1">${items.map((i) => {
          const item = GAMEDATA.items[i.slug];
          const owned = have[i.slug] !== undefined ? ` <span class="dim">(tem ${have[i.slug]})</span>` : "";
          return `${itemImg(i.slug, 22)} ${i.count}× ${escape(item ? item.n : i.slug.replace(/-/g, " "))}${owned}`;
        }).join(" + ")}</span><button class="sm" data-cosmetic-exchange="${escape(r.id)}" data-alternative="${index}" ${r.owned || !r.available || !enough ? "disabled" : ""}>Trocar</button></div>`;
      }).join("");
      const mountMeta = r.kind === "mount" && typeof APP_MOUNT !== "undefined" && APP_MOUNT[r.target];
      const mountSprite = mountMeta && mountMeta.cw
        ? cosmeticMountSpriteHtml(r.target, mountMeta, 44)
        : "";
      return `<div class="panel mb8"><div class="panel-body"><div class="row" style="gap:8px;align-items:center">${mountSprite}<div style="flex:1"><b>${title}</b><div class="tiny dim mb4">${r.owned ? "Desbloqueado na conta" : escape(r.reason || "Troca por itens")}</div>${r.catalyst && !r.owned ? `<div class="tiny dim">Também requer ${escape(r.catalyst.replace(/-/g, " "))} na Bag ou Loot Pouch (não consumido).</div>` : ""}${costs}</div></div></div></div>`;
    }).join("") || `<div class="tiny dim">Nenhum resultado.</div>`;
    content.querySelectorAll("[data-cosmetic-exchange]").forEach((button) => {
      button.onclick = () => { button.disabled = true; openCosmeticNpc(id, button.dataset.cosmeticExchange, Number(button.dataset.alternative)); };
    });
    paintCosmeticNpcPortraits();
  };
  $("#cosmetic-npc-search").oninput = render;
  render();
}
