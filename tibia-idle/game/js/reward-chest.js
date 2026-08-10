/* reward-chest.js — recompensas de boss agrupadas por batalha.
 *
 * O item visual do baú é o Reward Chest oficial, client id 19250. A primeira
 * tela mostra cada boss derrotado; somente ao clicar na imagem do boss o
 * jogador abre o pacote e vê seus drops em slots individuais.
 */
"use strict";

const REWARD_CHEST_ITEM_ID = 19250;
if (typeof GAMEDATA !== "undefined" && GAMEDATA.items && !GAMEDATA.items["reward-chest"]) {
  GAMEDATA.items["reward-chest"] = {
    n:"reward chest", s:"container", t:"container", cid:REWARD_CHEST_ITEM_ID,
    sell:0, w:12.0,
  };
}

/* Migra saves antigos (apenas rewardChest agregado) para um pacote legado. */
function rewardChestBundleList(p) {
  if (!p) return [];
  p.rewardChest = p.rewardChest || {};
  p.rewardChestBundles = Array.isArray(p.rewardChestBundles) ? p.rewardChestBundles : [];
  if (!p.rewardChestBundles.length && !p.rewardChestLegacyMigrated &&
      Object.keys(p.rewardChest).some((slug) => p.rewardChest[slug] > 0)) {
    p.rewardChestBundles.push({
      id:"legacy-reward", bossId:null, name:"Recompensa anterior",
      sprite:null, createdAt:Date.now(), items:Object.assign({}, p.rewardChest),
    });
    p.rewardChestLegacyMigrated = true;
  }
  return p.rewardChestBundles.filter((b) => b && b.items &&
    Object.keys(b.items).some((slug) => b.items[slug] > 0));
}

function rewardChestFindBundle(p, id) {
  return rewardChestBundleList(p).find((b) => String(b.id) === String(id)) || null;
}

/* Lista itens agregados ou apenas os itens de um pacote de boss. */
function rewardChestItems(p, bundleId) {
  if (!p) return [];
  const source = bundleId
    ? ((rewardChestFindBundle(p, bundleId) || {}).items || {})
    : (p.rewardChest || {});
  const out = [];
  for (const slug in source) {
    const count = source[slug];
    if (count <= 0) continue;
    const it = (typeof GAMEDATA !== "undefined" && GAMEDATA.items)
      ? GAMEDATA.items[slug] : null;
    out.push({ slug, count, it });
  }
  out.sort((a,b) => ((a.it && a.it.n) || a.slug)
    .localeCompare((b.it && b.it.n) || b.slug));
  return out;
}

/* Adiciona drop ao total e ao pacote da batalha que o gerou. */
function rewardChestAdd(p, slug, count, source) {
  if (!p || !slug || !count) return;
  p.rewardChest = p.rewardChest || {};
  rewardChestBundleList(p); // executa migração antes de criar pacote novo
  p.rewardChest[slug] = (p.rewardChest[slug] || 0) + count;

  source = source || {};
  const id = source.bundleId || source.id || "unassigned-reward";
  let bundle = p.rewardChestBundles.find((b) => String(b.id) === String(id));
  if (!bundle) {
    bundle = {
      id, bossId:source.bossId || null,
      name:source.name || "Recompensa de boss",
      sprite:source.sprite || source.bossId || null,
      createdAt:Date.now(), items:{},
    };
    p.rewardChestBundles.push(bundle);
  }
  bundle.items[slug] = (bundle.items[slug] || 0) + count;
  if (typeof renderRewardButton === "function") renderRewardButton(p);
}

function rewardChestRemoveBundleIfEmpty(p, bundle) {
  if (!bundle || Object.keys(bundle.items || {}).some((slug) => bundle.items[slug] > 0)) return;
  p.rewardChestBundles = (p.rewardChestBundles || []).filter((b) => b !== bundle);
}

/* Coleta um item. Com bundleId, coleta somente o drop daquela batalha. */
function rewardChestClaimOne(p, slug, bundleId) {
  if (!p || !p.rewardChest) return false;
  let count = 0;
  if (bundleId) {
    const bundle = rewardChestFindBundle(p, bundleId);
    if (!bundle || !bundle.items[slug]) return false;
    count = bundle.items[slug];
    delete bundle.items[slug];
    rewardChestRemoveBundleIfEmpty(p, bundle);
  } else {
    count = p.rewardChest[slug] || 0;
    if (!count) return false;
    for (const bundle of rewardChestBundleList(p)) delete bundle.items[slug];
    p.rewardChestBundles = rewardChestBundleList(p);
  }
  if (typeof addLootPouch === "function") addLootPouch(p, slug, count);
  p.rewardChest[slug] = Math.max(0, (p.rewardChest[slug] || 0) - count);
  if (!p.rewardChest[slug]) delete p.rewardChest[slug];
  if (typeof save === "function") save();
  if (typeof renderRewardButton === "function") renderRewardButton(p);
  return true;
}

/* Coleta todos os drops de um boss específico. */
function rewardChestClaimBundle(p, bundleId) {
  const bundle = rewardChestFindBundle(p, bundleId);
  if (!bundle) return 0;
  let types = 0;
  for (const slug of Object.keys(bundle.items)) {
    const count = bundle.items[slug];
    if (count <= 0) continue;
    if (typeof addLootPouch === "function") addLootPouch(p, slug, count);
    p.rewardChest[slug] = Math.max(0, (p.rewardChest[slug] || 0) - count);
    if (!p.rewardChest[slug]) delete p.rewardChest[slug];
    types++;
  }
  bundle.items = {};
  rewardChestRemoveBundleIfEmpty(p, bundle);
  if (typeof save === "function") save();
  if (typeof renderRewardButton === "function") renderRewardButton(p);
  return types;
}

/* Compatibilidade: coleta absolutamente todos os pacotes pendentes. */
function rewardChestClaimAll(p) {
  if (!p || !p.rewardChest) return 0;
  let n = 0;
  for (const slug of Object.keys(p.rewardChest)) {
    const count = p.rewardChest[slug];
    if (count <= 0) continue;
    if (typeof addLootPouch === "function") addLootPouch(p, slug, count);
    n++;
  }
  p.rewardChest = {};
  p.rewardChestBundles = [];
  if (typeof save === "function") save();
  if (typeof renderRewardButton === "function") renderRewardButton(p);
  return n;
}

function renderRewardButton(p) {
  const btn = document.getElementById("btn-reward");
  const badge = document.getElementById("reward-badge");
  if (!btn || !badge) return;
  const n = rewardChestBundleList(p).length;
  // Reserva o espaço do badge mesmo vazio para os botões da topbar não
  // saltarem para o lado quando uma recompensa é aberta ou recolhida.
  badge.textContent = n || "0";
  badge.style.display = "inline-block";
  badge.style.visibility = n ? "visible" : "hidden";
  badge.setAttribute("aria-hidden", n ? "false" : "true");
  btn.title = n ? `Reward Chest — ${n} boss(es) aguardando abertura`
                : "Reward Chest — drops de boss";
}

function rewardBossCard(bundle) {
  const count = Object.values(bundle.items || {}).reduce((sum,n) => sum + n, 0);
  const sprite = bundle.sprite && typeof mobImg === "function"
    ? mobImg(bundle.sprite, 84) : `<img src="assets/item/reward-chest.png" alt="">`;
  return `<button class="reward-boss-card" data-reward-boss="${bundle.id}"
                  title="Abrir recompensa de ${bundle.name}">
    <span class="reward-boss-sprite">${sprite}</span>
    <span class="reward-boss-chest"><img src="assets/item/reward-chest.png" alt="Reward Chest"></span>
    <b>${bundle.name}</b><small>${fmtFull(count)} item(ns) · clique para abrir</small>
  </button>`;
}

/* bundleId ausente = tela de bosses; presente = drops daquele boss. */
function openRewardChest(bundleId) {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  const bundles = rewardChestBundleList(p);
  const bundle = bundleId ? rewardChestFindBundle(p, bundleId) : null;
  const itens = bundle ? rewardChestItems(p, bundle.id) : [];
  const total = itens.reduce((sum,i) => sum + i.count, 0);
  const box = $("#modal-body");
  box.classList.remove("boss-modal-shell");
  box.classList.add("reward-modal-shell");

  box.innerHTML = `<div class="reward-chest-custom">
    <div class="panel-title reward-chest-title">
      <img class="reward-title-icon" src="assets/item/reward-chest.png" alt="Reward Chest">
      <div><b>REWARD CHEST</b><small>Client ID ${REWARD_CHEST_ITEM_ID}</small></div>
      <span class="spacer"></span>
      ${bundle ? `<button class="sm" id="reward-back">← BOSSES</button>` : ""}
      <button class="sm" id="reward-close">✕</button>
    </div>
    <div class="panel-body reward-chest-body">
      ${bundle ? `
        <div class="reward-opened-boss">
          <span>${bundle.sprite ? mobImg(bundle.sprite, 54) : "🎁"}</span>
          <div><b>${bundle.name}</b><small>${itens.length} tipos · ${fmtFull(total)} itens</small></div>
          <button class="primary sm" id="reward-claim-all">RECOLHER TUDO</button>
        </div>
        <div class="reward-slot-grid">
          ${itens.map((i) => `<button class="reward-slot ${typeof itemClsBorder === "function" ? itemClsBorder(i.slug) : ""}"
                    data-reward-claim="${i.slug}" aria-label="${i.it ? i.it.n : i.slug} · ${fmtFull(i.count)}x">
              <span class="reward-slot-art">${itemImg(i.slug)}</span>
              <b class="reward-slot-count">${fmtFull(i.count)}</b>
            </button>`).join("")}
        </div>
        <div class="reward-footer">Clique em um slot para enviar o item à Loot Pouch.</div>`
      : bundles.length ? `
        <div class="reward-boss-help">Escolha o boss para abrir sua recompensa.</div>
        <div class="reward-boss-grid">${bundles.map(rewardBossCard).join("")}</div>`
      : `<div class="reward-empty"><span>🎁</span><b>Reward Chest vazio</b>
           <small>Derrote um boss para receber recompensas.</small></div>`}
    </div>
  </div>`;

  $("#modal").classList.add("show");
  $("#reward-close").addEventListener("click", () => {
    if (typeof hideTip === "function") hideTip();
    $("#modal").classList.remove("show");
    box.classList.remove("reward-modal-shell");
  });
  const back = $("#reward-back");
  if (back) back.addEventListener("click", () => {
    if (typeof hideTip === "function") hideTip();
    openRewardChest();
  });
  $$("#modal-body [data-reward-boss]").forEach((b) =>
    b.addEventListener("click", () => openRewardChest(b.dataset.rewardBoss)));
  const all = $("#reward-claim-all");
  if (all && bundle) all.addEventListener("click", () => {
    if (typeof hideTip === "function") hideTip();
    const n = rewardChestClaimBundle(p, bundle.id);
    toast(`Recolhido <b>${n}</b> tipo(s) para a Loot Pouch.`);
    openRewardChest();
  });
  $$("#modal-body [data-reward-claim]").forEach((b) => {
    const slug = b.dataset.rewardClaim;
    const rewardItem = itens.find((i) => i.slug === slug);
    if (typeof bindFullItemTooltip === "function") {
      bindFullItemTooltip(b, slug,
        `Reward Chest · ${fmtFull(rewardItem ? rewardItem.count : 0)}x · clique para recolher`);
    }
    b.addEventListener("click", () => {
      if (typeof hideTip === "function") hideTip();
      rewardChestClaimOne(p, slug, bundle && bundle.id);
      toast("Item recolhido para a Loot Pouch.");
      openRewardChest(bundle && rewardChestFindBundle(p, bundle.id) ? bundle.id : undefined);
    });
  });
}

function bindRewardButton() {
  const btn = $("#btn-reward");
  if (btn) btn.addEventListener("click", () => openRewardChest());
}
