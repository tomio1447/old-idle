/* reward-chest.js — REWARD CHEST (baú de recompensas de BOSS)
 *
 * Todos os drops de BOSS (mob.boss) vão para o REWARD CHEST — separado da
 * Loot Pouch comum. O botão "🎁 REWARD" fica ao lado do MARKET no topo, com
 * badge mostrando quantos itens únicos há.
 *
 * O chest guarda: p.rewardChest = { [slug]: count }.
 * Abrir o modal mostra as SPRITES dos itens lado a lado (como o
 * baiak-idle.com), com o nome e a quantidade — simples, sem poluição.
 */
"use strict";

/* Lista os itens do reward chest: [{slug, count, it}] ordenado por nome. */
function rewardChestItems(p) {
  if (!p || !p.rewardChest) return [];
  const out = [];
  for (const slug in p.rewardChest) {
    const count = p.rewardChest[slug];
    if (count <= 0) continue;
    const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items) ? GAMEDATA.items[slug] : null;
    out.push({ slug: slug, count: count, it: it });
  }
  out.sort((a, b) => {
    const na = a.it && a.it.n ? a.it.n : a.slug;
    const nb = b.it && b.it.n ? b.it.n : b.slug;
    return na.localeCompare(nb);
  });
  return out;
}

/* Adiciona drops de boss ao reward chest (chamado no rollLoot). */
function rewardChestAdd(p, slug, count) {
  if (!p || !slug || !count) return;
  p.rewardChest = p.rewardChest || {};
  p.rewardChest[slug] = (p.rewardChest[slug] || 0) + count;
  if (typeof renderRewardButton === "function") renderRewardButton(p);
}

/* Move TODOS os itens do reward chest para a Loot Pouch (recolher). */
function rewardChestClaimAll(p) {
  if (!p || !p.rewardChest) return 0;
  let n = 0;
  for (const slug in p.rewardChest) {
    const count = p.rewardChest[slug];
    if (count <= 0) continue;
    if (typeof addLootPouch === "function") addLootPouch(p, slug, count);
    n++;
  }
  p.rewardChest = {};
  if (typeof save === "function") save();
  if (typeof renderRewardButton === "function") renderRewardButton(p);
  return n;
}

/* Move UM item do reward chest para a Loot Pouch. */
function rewardChestClaimOne(p, slug) {
  if (!p || !p.rewardChest || !p.rewardChest[slug]) return false;
  const count = p.rewardChest[slug];
  if (typeof addLootPouch === "function") addLootPouch(p, slug, count);
  delete p.rewardChest[slug];
  if (typeof save === "function") save();
  if (typeof renderRewardButton === "function") renderRewardButton(p);
  return true;
}

/* Botão do topo: badge com nº de itens únicos no chest. */
function renderRewardButton(p) {
  const btn = document.getElementById("btn-reward");
  const badge = document.getElementById("reward-badge");
  if (!btn) return;
  const n = rewardChestItems(p).length;
  if (!badge) return;
  if (n > 0) {
    badge.textContent = n;
    badge.style.display = "";
    btn.title = "Reward Chest — " + n + " item(ns) de boss";
  } else {
    badge.textContent = "";
    badge.style.display = "none";
    btn.title = "Reward Chest — drops de boss";
  }
}

/* Abre o modal do Reward Chest: sprites lado a lado, simples. */
function openRewardChest() {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  const itens = rewardChestItems(p);
  const box = $("#modal-body");
  box.innerHTML = `
    <div class="panel-title">🎁 Reward Chest
      <span class="tiny dim" style="font-weight:normal">drops de boss</span>
      <span style="flex:1"></span>
      ${itens.length ? `<button class="sm" id="reward-claim-all">Recolher tudo</button>` : ""}
      <button class="sm" id="reward-close">✕</button>
    </div>
    <div class="panel-body">
      ${itens.length ? `
        <div class="reward-grid">
          ${itens.map((i) => `
            <div class="reward-item" title="${i.it ? i.it.n : i.slug}">
              ${itemImg(i.slug)}
              <div class="reward-count">${fmtFull(i.count)}</div>
              <div class="tiny dim reward-name">${i.it ? i.it.n : i.slug}</div>
              <button class="sm" data-reward-claim="${i.slug}">Recolher</button>
            </div>`).join("")}
        </div>
        <div class="tiny dim mt8 center">Os drops de boss vão para cá. Recolha para a Loot Pouch e venda/use como quiser.</div>`
      : `<div class="dim small center" style="padding:16px">
           Nenhum drop de boss ainda. Mate um boss para ganhar recompensas.</div>`}
    </div>`;
  $("#modal").classList.add("show");
  $("#reward-close").addEventListener("click", () => $("#modal").classList.remove("show"));
  const all = $("#reward-claim-all");
  if (all) all.addEventListener("click", () => {
    const n = rewardChestClaimAll(p);
    toast(`Recolhido <b>${n}</b> item(ns) para a Loot Pouch.`);
    openRewardChest();
  });
  $$("#modal-body [data-reward-claim]").forEach((b) =>
    b.addEventListener("click", () => {
      rewardChestClaimOne(p, b.dataset.rewardClaim);
      toast("Item recolhido para a Loot Pouch.");
      openRewardChest();
    }));
}

function bindRewardButton() {
  const btn = $("#btn-reward");
  if (!btn) return;
  btn.addEventListener("click", () => openRewardChest());
}
