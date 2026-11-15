/*
 * imbuement-ui.js — janela de imbuement no estilo do client oficial
 * (OTClient/Canary): shortcut no topo com a Gilded Imbuing Shrine e o
 * rotulo IMBUEMENTS; ao clicar abre o modal com os equipamentos que
 * aceitam imbuement, a lista por categoria, os tiers com chance de
 * sucesso/protection e os materiais exigidos.
 *
 * Regras de slot seguem o Tibia global / Canary (imbuements so vao em
 * certas pecas — fontes: TibiaWiki Imbuing + shrine do client):
 *   weapon (melee): elemental, vamp, void, strike, skill do tipo
 *   weapon (bow 2H): elemental + vamp + void + strike + precision
 *   weapon (1H dist): vamp + void + strike + precision (sem elemental)
 *   weapon (magic): void + epiphany; strike so em wands/rods especiais
 *   shield        : protecoes + blockade — NUNCA life leech
 *   spellbook     : protecoes + blockade + epiphany
 *   armor         : life leech + protecoes
 *   helmet        : mana leech + skills
 *   boots         : velocidade + anti-paralisia
 *   backpack      : capacidade (featherweight)
 *   legs/amulet/ring/ammo: nenhum (igual ao global)
 *
 * A tabela de categorias vive em imbuement.js (`imbSlotCats`).
 */
"use strict";

/* slots que devem aparecer na janela (mesmo vazios nao aparecem — sem item
 * equipado nao tem o que imbuar) */
function imbEquipables(p) {
  const out = [];
  for (const slot of SLOTS) {
    const e = p.equip[slot];
    if (!e) continue;
    const slots = imbSlotsOf(e.item);
    if (!slots) continue;
    if (!imbSlotCats(slot, e.item).length) continue;
    out.push({ slot: slot, item: e.item, slots: slots });
  }
  return out;
}

/* ------------------------------------------------------------ UI state */
const IMB_UI = { slot: null, key: null, tier: 1, prot: false };

function imbCatName(cat) {
  return (typeof IMBDATA !== "undefined" && IMBDATA.categories[cat]) ||
         (IMB_CATEGORIA[cat] || {}).nome || "Categoria " + cat;
}

function imbIconeHtml(icon, px) {
  return `<img src="assets/imbuement/${icon}.png" width="${px}" height="${px}"
     style="image-rendering:pixelated" alt="">`;
}

function imbSlotLabel(slot) {
  return { weapon: "Arma", shield: "Escudo/Mão dir.", armor: "Armadura",
           helmet: "Elmo", boots: "Botas", backpack: "Mochila" }[slot] || slot;
}

function renderImbueModal(p) {
  const eqs = imbEquipables(p);
  if (!eqs.length) {
    return `<div class="panel-title cidade-modal-title">
      <img src="assets/ui/imbuement-machine.png" class="cidade-btn-icon" style="width:20px;height:20px" alt="">
      Imbuement <span class="spacer"></span>
      <button class="sm" id="imb-close">Fechar</button>
    </div>
    <div class="panel-body">
      <p class="small dim">Nenhum equipamento com slot de imbuement.
      Itens com <b>imbSlots</b> (armas fortes, elmos e armaduras de
      nivel 25+) podem ser imbuídos aqui.</p>
    </div>`;
  }
  if (!eqs.some((e) => e.slot === IMB_UI.slot)) IMB_UI.slot = eqs[0].slot;
  const cur = eqs.find((e) => e.slot === IMB_UI.slot);
  const cats = imbSlotCats(cur.slot, cur.item);
  const selGroup = IMB_UI.key && typeof imbFindGroup === "function"
    ? imbFindGroup(IMB_UI.key) : null;
  if (!selGroup || cats.indexOf(selGroup.cat) < 0) IMB_UI.key = null;

  // ------ coluna esquerda: equipamentos + imbuements ativos do slot
  let left = `<div class="imb-eqlist">`;
  for (const e of eqs) {
    const sel = e.slot === IMB_UI.slot ? " sel" : "";
    left += `<div class="imb-eq${sel}" data-slot="${e.slot}">
      ${itemImg(e.item, 30)}
      <div class="imb-eq-meta"><b>${imbSlotLabel(e.slot)}</b>
        <span class="tiny dim">${GAMEDATA.items[e.item].n} · ${e.slots} slot${e.slots > 1 ? "s" : ""}</span>
      </div></div>`;
  }
  left += `</div><div class="imb-ativa"><div class="tiny dim mb4">Slots de imbuement</div>`;
  const ativos = imbOf(p, cur.slot);
  // Sempre desenha a quantidade exata de quadrados que o item possui.
  // Slots sem imbuement ficam vazios em vez de desaparecerem.
  left += `<div class="imb-slot-grid">`;
  for (let i = 0; i < cur.slots; i++) {
    const im = ativos[i];
    if (!im) { left += `<div class="imb-modal-slot vazio" title="Slot vazio"></div>`; continue; }
    const v = imbVisual(im), rest = imbTempoTexto(imbRestante(im));
    left += `<div class="imb-modal-slot ${rest === "expirado" ? "expirado" : ""}" title="${v.nome} ${IMB_TIER_NOME[im.tier - 1]} · ${rest}">
      ${imbIconeHtml(v.icon, 24)}<button class="imb-remove" data-slot="${cur.slot}" data-idx="${i}">✕</button></div>`;
  }
  left += `</div>`;
  ativos.forEach((im) => { const v=imbVisual(im), rest=imbTempoTexto(imbRestante(im)); left += `<div class="tiny dim">${v.nome}: ${rest}</div>`; });
  left += `</div>`;

  // ------ centro: lista por categoria (filtrada pelo slot)
  let center = "";
  for (const cat of cats) {
    center += `<div class="imb-cat">${imbCatName(cat)}</div>`;
    const grupos = Object.keys(IMBDATA.imbs)
      .map((k) => IMBDATA.imbs[k])
      .filter((g) => g.cat === cat)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const g of grupos) {
      const key = imbKeyOf(g);
      const sel = key === IMB_UI.key ? " sel" : "";
      const sub = g.sub ? ` <span class="dim">(${g.sub})</span>` : "";
      center += `<div class="imb-row${sel}" data-key="${key}">
        ${imbIconeHtml(g.icon, 24)}<span>${g.name}${sub}</span></div>`;
    }
  }

  // ------ direita: detalhe
  let right;
  const glist = Object.keys(IMBDATA.imbs).map((k) => IMBDATA.imbs[k]);
  const g = glist.find((x) => imbKeyOf(x) === IMB_UI.key);
  if (!g || !cats.includes(g.cat)) {
    right = `<p class="small dim">Selecione um imbuement na lista.</p>`;
  } else {
    const t = IMB_UI.tier;
    const cd = imbCusto(imbKeyOf(g), t, IMB_UI.prot);
    const eff = g.tiers[t].desc;
    let tiers = "";
    [1, 2, 3].forEach((tt) => {
      const b = IMBDATA.bases[tt];
      const sel = tt === t ? " sel" : "";
      tiers += `<button class="imb-tier${sel}" data-tier="${tt}">
        ${b.name}<span class="tiny dim">${fmtFull(b.price)} gp</span></button>`;
    });
    let mats = "";
    let pode = true;
    for (const m of imbMats(imbKeyOf(g), t)) {
      const have = (p.lootPouch || {})["mat-" + m.id] || 0;
      const ok = have >= m.count;
      if (!ok) pode = false;
      const src = (m.drops && m.drops.length)
        ? m.drops.map((d) => GAMEDATA.monsters[d].name).join(", ")
        : "sem fonte neste mundo";
      mats += `<div class="imb-mat" title="${m.name} · dropa de: ${src}">
        <img src="assets/item/mat-${m.id}.png" width="24" height="24"
          style="image-rendering:pixelated" alt="">
        <span class="${ok ? "" : "txt-red"}">${have}/${m.count}</span></div>`;
    }
    const faltaGold = p.gold < cd.price;
    const tcPrice = (typeof IMB_TIER_COINS !== "undefined" && IMB_TIER_COINS[t]) || 0;
    const tcHave = typeof accountCoins === "function" ? accountCoins() : 0;
    const tcOk = imbPrecheck(p, IMB_UI.slot, IMB_UI.key, t).ok && tcHave >= tcPrice;
    right = `
      <div class="row" style="gap:8px;align-items:center">
        ${imbIconeHtml(g.icon, 40)}
        <div><b>${g.name}</b>${g.sub ? ` <span class="dim">(${g.sub})</span>` : ""}
          <div class="tiny dim">${imbCatName(g.cat)}</div></div>
      </div>
      <div class="imb-tiers">${tiers}</div>
      <div class="tiny imb-eff">${eff}</div>
      <div class="tiny dim">Materiais (toque p/ origem):</div>
      <div class="imb-mats">${mats}</div>
      <label class="row small" style="gap:6px;margin:6px 0">
        <input type="checkbox" id="imb-prot" ${IMB_UI.prot ? "checked" : ""}>
        Usar protection charm (+${fmtFull(IMBDATA.bases[t].protection)} gp, sucesso garantido)
      </label>
      <div class="row small" style="justify-content:space-between">
        <span>Chance: <b class="${cd.pct === 100 ? "txt-good" : ""}">${cd.pct}%</b></span>
        <span>Total: <b class="gold-txt">${fmtFull(cd.price)} gp</b></span>
      </div>
      <button class="primary wide" id="imb-apply"
        ${!pode || faltaGold ? "disabled" : ""}>Imbuir</button>
      ${!pode ? `<div class="tiny txt-red">Faltam materiais na loot pouch.</div>` : ""}
      ${faltaGold ? `<div class="tiny txt-red">Gold insuficiente.</div>` : ""}
      <button class="wide imb-tc-btn" id="imb-tc-apply" ${tcOk ? "" : "disabled"}>
        <img src="assets/ui/coins/tibia-coins.gif" class="coin-gif" alt=""> Imbuir via TC — ${tcPrice} coins
      </button>
      <div class="tiny dim">Via TC: sem materiais e sem gold, sucesso garantido.</div>
      ${tcHave < tcPrice ? `<div class="tiny txt-red">Tibia Coins insuficientes (${fmtFull(tcHave)} TC).</div>` : ""}`;
  }

  return `<div class="panel-title cidade-modal-title">
      <img src="assets/ui/imbuement-machine.png" class="cidade-btn-icon" style="width:20px;height:20px" alt="">
      Imbuement <span class="tiny dim">até 20h em combate</span>
      <span class="spacer"></span>
      <button class="sm" id="imb-close">Fechar</button>
    </div>
    <div class="panel-body imb-modal-content">
      <div class="imb-grid">
        <div class="imb-col-left">${left}</div>
        <div class="imb-col-center">${center}</div>
        <div class="imb-col-right">${right}</div>
      </div>
    </div>`;
}

function openImbueModal() {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  if (typeof clearCityModalShells === "function") clearCityModalShells(body);
  else if (body) body.classList.remove("imb-modal-shell", "cidade-modal-shell");
  if (body) body.classList.add("imb-modal-shell", "cidade-modal-shell");
  modal.classList.remove("wide");
  body.innerHTML = renderImbueModal(G.p);
  modal.classList.add("show");
  bindImbueModal();
}

function closeImbueModal() {
  $("#modal").classList.remove("show", "wide");
  if (typeof clearCityModalShells === "function") clearCityModalShells($("#modal-body"));
  else $("#modal-body").classList.remove("imb-modal-shell", "cidade-modal-shell");
}

function bindImbueModal() {
  const body = $("#modal-body");
  body.querySelectorAll(".imb-eq").forEach((el) =>
    el.addEventListener("click", () => {
      IMB_UI.slot = el.dataset.slot;
      openImbueModal();
    }));
  body.querySelectorAll(".imb-row").forEach((el) =>
    el.addEventListener("click", () => {
      IMB_UI.key = el.dataset.key;
      openImbueModal();
    }));
  body.querySelectorAll(".imb-tier").forEach((el) =>
    el.addEventListener("click", () => {
      IMB_UI.tier = +el.dataset.tier;
      openImbueModal();
    }));
  const prot = body.querySelector("#imb-prot");
  if (prot) prot.addEventListener("change", () => {
    IMB_UI.prot = prot.checked;
    openImbueModal();
  });
  body.querySelectorAll(".imb-remove").forEach((el) =>
    el.addEventListener("click", () => {
      const r = imbRemove(G.p, el.dataset.slot, +el.dataset.idx);
      if (typeof toast === "function") toast(r.msg, r.ok ? "ok" : "err");
      if (typeof renderAll === "function") renderAll();
      openImbueModal();
    }));
  const apply = body.querySelector("#imb-apply");
  if (apply) apply.addEventListener("click", () => {
    const r = imbAdd(G.p, IMB_UI.slot, IMB_UI.key, IMB_UI.tier, IMB_UI.prot);
    if (typeof toast === "function") toast(r.msg, r.ok ? "ok" : "err");
    if (typeof renderAll === "function") renderAll();
    openImbueModal();
  });
  const tcApply = body.querySelector("#imb-tc-apply");
  if (tcApply) tcApply.addEventListener("click", () => {
    imbApplyViaTc(tcApply);
  });
  const close = body.querySelector("#imb-close");
  if (close) close.addEventListener("click", () => closeImbueModal());
}

/* Imbue via Tibia Coins: online o servidor debita (30/60/90 por tier);
 * offline debita o saldo local da conta. Sem materiais/gold, 100%. */
async function imbApplyViaTc(btn) {
  if (!G.p || !btn || btn.dataset.busy === "1") return;
  const tier = IMB_UI.tier;
  const price = (typeof IMB_TIER_COINS !== "undefined" && IMB_TIER_COINS[tier]) || 0;
  const fail = (msg) => {
    if (typeof toast === "function") toast(msg, "err");
    openImbueModal();
  };
  const pre = imbPrecheck(G.p, IMB_UI.slot, IMB_UI.key, tier);
  if (!pre.ok) return fail(pre.msg || "Imbuement indisponível.");
  btn.dataset.busy = "1";
  btn.disabled = true;
  try {
    const token = typeof sessionToken === "function" ? sessionToken() : "";
    const online = token && typeof accountApiConfigured === "function" &&
      accountApiConfigured() && typeof storeBuyImbuement === "function";
    if (online) {
      const r = await storeBuyImbuement(token, tier);
      if (!r || !r.ok) return fail((r && r.msg) || "Falha ao debitar Tibia Coins.");
    } else {
      if (typeof accountCoins !== "function" || accountCoins() < price)
        return fail("Tibia Coins insuficientes.");
      accountSpendCoins(price);
      if (typeof renderCoinBalance === "function") renderCoinBalance();
    }
    const r = imbAddTc(G.p, IMB_UI.slot, IMB_UI.key, tier);
    if (typeof toast === "function") toast(r.msg, r.ok ? "ok" : "err");
    if (typeof renderAll === "function") renderAll();
    openImbueModal();
  } finally {
    btn.dataset.busy = "";
  }
}
