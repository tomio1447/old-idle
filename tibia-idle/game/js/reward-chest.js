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
  const total = itens.reduce((sum, i) => sum + i.count, 0);
  box.innerHTML = `
    <div class="reward-chest-custom">
      <div class="panel-title reward-chest-title">
        <span class="reward-chest-emblem">🎁</span>
        <div><b>REWARD CHEST</b><small>Recompensas dos bosses</small></div>
        <span class="spacer"></span>
        <span class="reward-summary">${itens.length} tipos · ${fmtFull(total)} itens</span>
        <button class="sm" id="reward-close">✕</button>
      </div>
      <div class="panel-body reward-chest-body">
        ${itens.length ? `
          <div class="reward-actions">
            <span>Clique em um slot para enviar o item à Loot Pouch.</span>
            <button class="primary sm" id="reward-claim-all">RECOLHER TUDO</button>
          </div>
          <div class="reward-slot-grid">
            ${itens.map((i) => `
              <button class="reward-slot ${typeof itemClsBorder === "function" ? itemClsBorder(i.slug) : ""}"
                      data-reward-claim="${i.slug}"
                      title="${i.it ? i.it.n : i.slug} · ${fmtFull(i.count)}x">
                <span class="reward-slot-art">${itemImg(i.slug)}</span>
                <b class="reward-slot-count">${fmtFull(i.count)}</b>
              </button>`).join("")}
          </div>
          <div class="reward-footer">Itens recolhidos vão para a Loot Pouch.</div>`
        : `<div class="reward-empty">
             <span>🎁</span><b>Reward Chest vazio</b>
             <small>Derrote um boss para receber recompensas.</small>
           </div>`}
      </div>
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
