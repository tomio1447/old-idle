/*
 * city-ui.js — janelas de dialogo dos NPCs da cidade
 */
"use strict";

let shopFilter = "";
let shopSlot = "all";

function openNpc(id) {
  const npc = NPCS[id];
  if (!npc) return;
  const p = G.p;
  let body = "";

  switch (npc.type) {
    case "shop":   body = npcShop(p); break;
    case "supply": body = npcSupply(p); break;
    case "sell":   body = npcSell(p); break;
    case "bank":   body = npcBank(p); break;
    case "temple": body = npcTemple(p); break;
    case "train":  body = npcTrain(p); break;
    case "inn":    body = npcInn(p); break;
    case "travel": body = npcTravel(p); break;
  }

  $("#modal-body").innerHTML = `
    <div class="panel-title">
      <img src="assets/npc/${npc.sprite}_s.png" style="height:22px">
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
    case "bank":   body = npcBank(p); break;
    case "temple": body = npcTemple(p); break;
    case "train":  body = npcTrain(p); break;
    case "inn":    body = npcInn(p); break;
    case "travel": body = npcTravel(p); break;
  }
  $("#npc-content").innerHTML = body;
  bindNpc(id, npc.type);
  renderTopbar(p);
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
                 "boots", "ring", "amulet"];
  const names = { all: "Tudo", weapon: "Armas", shield: "Escudos",
    armor: "Armaduras", helmet: "Elmos", legs: "Pernas", boots: "Botas",
    ring: "Anéis", amulet: "Colares" };

  const rows = filtered.slice(0, 60).map((e) => {
    const cur = p.equip[e.item.s];
    const better = !cur || itemScore(p, e.slug) > itemScore(p, cur.item);
    const afford = p.gold >= e.price;
    return `<div class="shop-row" data-tip="${e.slug}">
      <img src="assets/item/${e.slug}.png">
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
  if (it.def) s.push("def " + it.def);
  if (it.arm) s.push("arm " + it.arm);
  if (it.mdmg) s.push("mag " + it.mdmg);
  if (it.mag) s.push("ML+" + it.mag);
  if (it.prot) s.push("prot " + it.prot + "%");
  if (it.hpreg) s.push("hp+" + it.hpreg);
  if (it.mpreg) s.push("mp+" + it.mpreg);
  if (it.lvl) s.push("nv " + it.lvl);
  return s.join(" · ") || "—";
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
      <img src="assets/item/${s.sprite}.png">
      <div style="flex:1;min-width:0">
        <div class="small">${s.name}</div>
        <div class="tiny dim">${eff} · tem ${have}${locked ? ` · <span style="color:#ff9a6a">nv ${s.lvl}</span>` : ""}</div>
      </div>
      <div class="row" style="gap:2px">
        ${[10, 50, 200].map((n) => `<button class="sm" data-buy-sup="${slug}"
          data-n="${n}" ${locked || p.gold < price * n ? "disabled" : ""}>
          ${n}</button>`).join("")}
      </div>
    </div>`;
  }).join("");
  return goldLine(p) + `<div class="list" style="max-height:340px">${rows}</div>
    <div class="tiny dim mt4">O poder das runas cresce com o seu nível.</div>`;
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
      <img src="assets/item/${slug}.png">
      <div style="flex:1;min-width:0">
        <div class="small">${it.n}</div>
        <div class="tiny dim">${p.bag[slug]}x · ${fmtFull(it.sell || 0)} gp cada</div>
      </div>
      <button class="sm" data-sell-item="${slug}">${fmtFull(val)}</button>
    </div>`;
  }).join("");

  if (!entries.length)
    return goldLine(p) +
      `<div class="dim small center" style="padding:20px">Sua mochila está vazia.</div>`;

  return goldLine(p) + `
    <div class="list mb8" style="max-height:320px">${rows}</div>
    <button class="primary full" id="sell-all">
      Vender tudo por ${fmtFull(total)} gp</button>`;
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
      Com a bênção você perde bem menos experiência ao morrer.</div>`;
}

/* ---------------------------------------------------------- academia */
function npcTrain(p) {
  const isMage = VOCATIONS[p.voc].weapon === "magic";
  const skills = isMage ? ["magic", "shield"] :
    p.voc === "paladin" ? ["dist", "shield", "magic"] :
    ["sword", "axe", "club", "shield", "magic"];
  const rows = skills.map((k) => {
    const lvl = k === "magic" ? p.ml : p.skills[k];
    const price = trainPrice(p, k);
    return `<div class="shop-row">
      <div style="flex:1">
        <div class="small">${SKILL_NAMES[k]}</div>
        <div class="tiny dim">nível atual ${lvl}</div>
      </div>
      <button class="sm ${p.gold >= price ? "primary" : ""}"
        data-train="${k}" ${p.gold < price ? "disabled" : ""}>
        +1 · ${fmtFull(price)}</button>
    </div>`;
  }).join("");
  return goldLine(p) + rows +
    `<div class="tiny dim mt8">Treinar fica mais caro conforme a skill sobe.</div>`;
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
      Acima de 39h você ganha <b style="color:#9ce84a">+50% de experiência</b>.
      Com stamina zerada, a XP cai pela metade.</div>`;
}

/* ---------------------------------------------------------- viagens */
function npcTravel(p) {
  const rows = Object.keys(GAMEDATA.hunts).map((id) => {
    const hu = GAMEDATA.hunts[id];
    const locked = p.level < hu.level;
    const est = huntEstimate(p, hu);
    const risk = huntRisk(p, hu);
    const mobs = hu.monsters.slice(0, 3).map(
      (m) => `<img src="assets/mob/${m}_s.png" style="width:22px;height:22px">`).join("");
    return `<div class="shop-row ${locked ? "" : "clickable"}"
        data-travel="${locked ? "" : id}" style="opacity:${locked ? .4 : 1}">
      <div class="row" style="gap:1px;width:70px;flex:none">${mobs}</div>
      <div style="flex:1;min-width:0">
        <div class="small">${hu.name}</div>
        <div class="tiny dim">nv ${hu.level} · ${fmt(est.exp)} xp/h · ${fmt(est.gold)} gp/h</div>
      </div>
      <span class="risk ${risk.cls}">${risk.txt}</span>
    </div>`;
  }).join("");
  return `<div class="list" style="max-height:380px">${rows}</div>`;
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
      if (p.config.autoEquip) autoEquip(p);
      hideTip();
      refreshNpc(id);
    }));

  // supplies
  $$("#npc-content [data-buy-sup]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.buySup, n = parseInt(b.dataset.n, 10);
      const s = SUPPLIES[slug];
      const cost = supplyPrice(s, p.level) * n;
      if (p.gold < cost) { toast("Ouro insuficiente"); return; }
      p.gold -= cost;
      p.supplies[slug] = (p.supplies[slug] || 0) + n;
      addLog("sell", `Comprou ${n}x ${s.name} por ${fmtFull(cost)} gp`);
      refreshNpc(id);
    }));

  // vender
  $$("#npc-content [data-sell-item]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.sellItem;
      const it = GAMEDATA.items[slug];
      const val = (it.sell || 0) * p.bag[slug];
      p.gold += val;
      addLog("sell", `Vendeu ${p.bag[slug]}x ${it.n} por <span class="gold-txt">${fmtFull(val)} gp</span>`);
      delete p.bag[slug];
      hideTip();
      refreshNpc(id);
    }));
  const sellAll = $("#sell-all");
  if (sellAll) sellAll.addEventListener("click", () => {
    const r = autoSell(p);
    toast(`Vendeu tudo por <b>${fmtFull(r.gold)} gp</b>`);
    addLog("sell", `Vendeu o loot por <span class="gold-txt">${fmtFull(r.gold)} gp</span>`);
    refreshNpc(id);
  });

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

  // academia
  $$("#npc-content [data-train]").forEach((b) =>
    b.addEventListener("click", () => {
      const sk = b.dataset.train;
      const r = buyTraining(p, sk, 1);
      if (r.gained) {
        toast(`${SKILL_NAMES[sk]} subiu!`, "level");
        addLog("skill", `Treinou <b>${SKILL_NAMES[sk]}</b> por ${fmtFull(r.spent)} gp`);
      }
      refreshNpc(id);
    }));

  // estalagem
  $$("#npc-content [data-rest]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = buyRest(p, parseInt(b.dataset.rest, 10));
      toast(r.msg);
      if (r.ok) addLog("info", `Descansou na estalagem por ${fmtFull(r.price)} gp`);
      refreshNpc(id);
    }));

  // viagens
  $$("#npc-content [data-travel]").forEach((el) => {
    const hid = el.dataset.travel;
    if (!hid) return;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      closeNpc();
      startHunt(hid);
    });
  });
}
