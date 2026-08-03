/*
 * imbuement-ui.js — janela de imbuement no estilo do client oficial
 * (OTClient/Canary): shortcut no topo com a Gilded Imbuing Shrine e o
 * rotulo IMBUEMENTS; ao clicar abre o modal com os equipamentos que
 * aceitam imbuement, a lista por categoria, os tiers com chance de
 * sucesso/protection e os materiais exigidos.
 *
 * Regras de slot seguem o Tibia global (imbuements so vao em certas
 * pecas — fontes: gameplay oficial + cliente):
 *   weapon (melee): critico, leech vida/mana, elemental, skill do tipo
 *   weapon (dist) : critico, leech vida/mana, skill distancia
 *   weapon (magic): leech vida/mana          (wands/rods do global)
 *   shield        : protecoes + shielding
 *   armor         : life leech + protecoes
 *   helmet        : mana leech + skills
 *   boots         : velocidade + anti-paralisia
 *   backpack      : capacidade (featherweight)
 *   legs/amulet/ring/ammo: nenhum (igual ao global)
 */
"use strict";

const IMB_SKILL_CAT = { axe: 11, sword: 12, club: 13, distance: 15 };

function imbSlotCats(slot, itemSlug) {
  if (slot === "weapon") {
    const it = GAMEDATA.items[itemSlug] || {};
    const t = it.t || "sword";
    if (t === "distance") return [1, 2, 3, 15];
    if (t === "magic") return [1, 2];             // wands/rods: so leech
    return [0, 1, 2, 3, IMB_SKILL_CAT[t] || 12]; // melee + skill do tipo
  }
  if (slot === "shield") return [1, 4, 5, 6, 7, 8, 9, 14];
  if (slot === "armor") return [1, 4, 5, 6, 7, 8, 9];
  if (slot === "helmet") return [2, 11, 12, 13, 14, 15, 16, 18];
  if (slot === "boots") return [10, 19];
  if (slot === "backpack") return [17];
  return [];
}

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
    return `<div class="panel-title">Imbuement</div>
      <div class="panel-body">
        <p class="small dim">Nenhum equipamento com slot de imbuement.
        Itens com <b>imbSlots</b> (armas fortes, elmos e armaduras de
        nivel 25+) podem ser imbuídos aqui.</p>
        <div class="row" style="justify-content:flex-end">
          <button class="sm" id="imb-close">Fechar</button>
        </div>
      </div>`;
  }
  if (!eqs.some((e) => e.slot === IMB_UI.slot)) IMB_UI.slot = eqs[0].slot;
  const cur = eqs.find((e) => e.slot === IMB_UI.slot);
  const cats = imbSlotCats(cur.slot, cur.item);

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
  left += `</div><div class="imb-ativa">`;
  const ativos = imbOf(p, cur.slot);
  if (!ativos.length) {
    left += `<div class="tiny dim" style="padding:4px 2px">Nenhum imbuement neste item.</div>`;
  }
  ativos.forEach((im, i) => {
    const v = imbVisual(im);
    const rest = imbTempoTexto(imbRestante(im));
    left += `<div class="imb-ativa-row">
      ${imbIconeHtml(v.icon, 22)}
      <div class="imb-ativa-meta"><b>${v.nome} ${IMB_TIER_NOME[im.tier - 1]}</b>
        <span class="tiny ${rest === "expirado" ? "txt-red" : "dim"}">${rest}</span></div>
      <button class="imb-remove sm" data-slot="${cur.slot}" data-idx="${i}"
        title="Remove por ${fmtFull(IMBDATA.bases[1].remove)} gp">✕</button>
    </div>`;
  });
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
      ${faltaGold ? `<div class="tiny txt-red">Gold insuficiente.</div>` : ""}`;
  }

  return `<div class="panel-title">
      <img src="assets/ui/imbuement-machine.png" style="max-width:20px;max-height:20px;object-fit:contain" alt="">
      Imbuement <span class="spacer"></span><span class="tiny dim">até 20h em combate</span>
    </div>
    <div class="imb-grid">
      <div class="imb-col-left">${left}</div>
      <div class="imb-col-center">${center}</div>
      <div class="imb-col-right">${right}</div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="sm" id="imb-close">Fechar</button>
    </div>`;
}

function openImbueModal() {
  if (!G.p) return;
  if (IMB_UI.key === null) IMB_UI.key = "Vampirism";
  $("#modal").classList.add("wide");
  $("#modal-body").innerHTML = renderImbueModal(G.p);
  $("#modal").classList.add("show");
  bindImbueModal();
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
  const close = body.querySelector("#imb-close");
  if (close) close.addEventListener("click", () =>
    $("#modal").classList.remove("show", "wide"));
}
