/*
 * ui.js — construcao e atualizacao da interface
 */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function fmt(n) {
  n = Math.floor(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function fmtFull(n) {
  return Math.floor(n || 0).toLocaleString("pt-BR");
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = sec % 60;
  if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
  if (m > 0) return m + "m " + String(s).padStart(2, "0") + "s";
  return s + "s";
}
function itemName(slug) {
  const it = GAMEDATA.items[slug];
  return it ? it.n : slug;
}
function itemImg(slug, cls) {
  return `<img src="assets/item/${slug}.png" class="${cls || ""}" alt="">`;
}

/* ------------------------------------------------------------ toasts */
function toast(msg, kind) {
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.innerHTML = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .35s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 350);
  }, 3600);
  while ($("#toasts").children.length > 5) $("#toasts").firstChild.remove();
}

/* ------------------------------------------------------------ tooltip */
const tooltip = { el: null };
function initTooltip() {
  tooltip.el = $("#tooltip");
  document.addEventListener("mousemove", (e) => {
    if (tooltip.el.style.display !== "block") return;
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const r = tooltip.el.getBoundingClientRect();
    if (x + r.width > innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height > innerHeight) y = e.clientY - r.height - pad;
    tooltip.el.style.left = x + "px";
    tooltip.el.style.top = y + "px";
  });
}
function showTip(html) {
  tooltip.el.innerHTML = html;
  tooltip.el.style.display = "block";
}
function hideTip() { tooltip.el.style.display = "none"; }

function itemTip(slug, extra) {
  const it = GAMEDATA.items[slug];
  if (!it) return slug;
  let h = `<div class="tt-name">${it.n}</div>`;
  const st = [];
  if (it.atk) st.push("Ataque " + it.atk);
  if (it.def) st.push("Defesa " + it.def);
  if (it.arm) st.push("Armadura " + it.arm);
  if (it.mdmg) st.push("Dano mágico " + it.mdmg);
  if (it.mag) st.push("magic level +" + it.mag);
  if (it.prot) st.push("Proteção " + it.prot + "%");
  if (it.hpreg) st.push("Regen. vida +" + it.hpreg);
  if (it.mpreg) st.push("Regen. mana +" + it.mpreg);
  if (it.spd) st.push("Velocidade +" + it.spd);
  if (it.melee) st.push("Melee +" + it.melee);
  if (it.sword) st.push("Sword +" + it.sword);
  if (it.axe) st.push("Axe +" + it.axe);
  if (it.club) st.push("Club +" + it.club);
  if (it.shield) st.push("Shielding +" + it.shield);
  if (it.th) st.push("Duas mãos");
  if (st.length) h += `<div class="tt-stat">${st.join("<br>")}</div>`;
  if (it.lvl) h += `<div class="tt-req">Requer nível ${it.lvl}</div>`;
  if (it.vocs) h += `<div class="tt-req">Vocação: ${it.vocs.join(", ")}</div>`;
  if (it.sell) h += `<div class="tt-sell">Vende por ${fmtFull(it.sell)} gp</div>`;
  if (extra) h += `<div class="dim tiny mt4">${extra}</div>`;
  return h;
}

/* ------------------------------------------------------------ log */
function addLog(kind, html) {
  const box = $("#log");
  if (!box) return;
  const d = new Date();
  const t = String(d.getHours()).padStart(2, "0") + ":" +
            String(d.getMinutes()).padStart(2, "0");
  const el = document.createElement("div");
  el.className = "log-line " + kind;
  el.innerHTML = `<span class="time">${t}</span><span>${html}</span>`;
  box.appendChild(el);
  while (box.children.length > 120) box.firstChild.remove();
  if (G.autoScroll) box.scrollTop = box.scrollHeight;
}

/* ------------------------------------------------------------ paineis */
function renderStats(p) {
  const max = maxStats(p);
  const g = gearStats(p);
  const dmg = playerDamage(p);
  const def = playerDefense(p);

  $("#p-name").textContent = p.name;
  $("#p-level").textContent = p.level;
  $("#p-voc").textContent = vocationName(p);

  setBar("#bar-hp", p.hp / max.hp, `${fmt(p.hp)} / ${fmt(max.hp)}`);
  setBar("#bar-mp", max.mp ? p.mp / max.mp : 0,
         `${fmt(p.mp)} / ${fmt(max.mp)}`);
  setBar("#bar-exp", expProgress(p) / 100, expProgress(p).toFixed(1) + "%");
  setBar("#bar-sta", p.stamina / (42 * 3600), fmtTime(p.stamina));

  const rows = [
    ["Experiência", fmtFull(p.exp)],
    ["Próximo nível", fmtFull(Math.max(0, expForLevel(p.level + 1) - p.exp))],
    ["Dano por golpe", `${dmg.min}–${dmg.max}`],
    ["Armadura", def.armor],
    ["Defesa", def.defense],
    ["Proteção", def.protection + "%"],
    ["Capacidade", fmt(max.cap - carriedWeight(p)) + " / " + fmt(max.cap)],
    ["Mortes", p.deaths],
    ["Kills totais", fmtFull(p.totalKills)],
  ];
  $("#stat-rows").innerHTML = rows.map(
    (r) => `<div class="stat-row"><span class="k">${r[0]}</span><span class="v">${r[1]}</span></div>`
  ).join("");
}

function setBar(sel, pct, label) {
  const el = $(sel);
  if (!el) return;
  el.querySelector(".fill").style.width =
    Math.max(0, Math.min(100, pct * 100)) + "%";
  const l = el.querySelector(".label");
  if (l) l.textContent = label;
}

function renderSkills(p) {
  const order = ["magic", "fist", "sword", "axe", "club", "dist", "shield"];
  let h = "";
  for (const k of order) {
    const isMl = k === "magic";
    const lvl = isMl ? effMagic(p) : effSkill(p, k);
    const baseLvl = isMl ? p.ml : p.skills[k];
    const prog = isMl ? mlProgress(p) : skillProgress(p, k);
    const bonus = lvl - baseLvl;
    h += `<div class="mb4">
      <div class="row small" style="justify-content:space-between">
        <span class="k">${SKILL_NAMES[k]}</span>
        <span class="v">${baseLvl}${bonus > 0 ? ` <span style="color:#7ae87a">+${bonus}</span>` : ""} <span class="dim">${prog.toFixed(1)}%</span></span>
      </div>
      <div class="bar" style="height:8px"><div class="fill skl" style="width:${prog}%"></div></div>
    </div>`;
  }
  $("#skills").innerHTML = h;
}

const SLOT_LABELS = {
  helmet: "elmo", amulet: "colar", backpack: "bolsa", armor: "corpo",
  weapon: "arma", shield: "escudo", legs: "pernas", boots: "botas",
  ring: "anel", ammo: "muni",
};
const SLOT_ORDER = [
  null, "helmet", null,
  "amulet", "armor", "backpack",
  "weapon", "legs", "shield",
  "ring", "boots", "ammo",
];

function renderEquip(p) {
  let h = "";
  for (const slot of SLOT_ORDER) {
    if (!slot) { h += `<div></div>`; continue; }
    const e = p.equip[slot];
    if (e) {
      h += `<div class="slot" data-slot="${slot}" data-item="${e.item}">
        ${itemImg(e.item)}${e.count > 1 ? `<span class="cnt">${e.count}</span>` : ""}
      </div>`;
    } else {
      h += `<div class="slot empty" data-slot="${slot}" data-label="${SLOT_LABELS[slot]}"></div>`;
    }
  }
  $("#equip").innerHTML = h;
  $$("#equip .slot").forEach((el) => {
    const slug = el.dataset.item;
    if (!slug) return;
    el.addEventListener("mouseenter", () => {
      const slot = el.dataset.slot;
      showTip(itemTip(slug, slot === "backpack" ? `Bag padrão · ${bagSlots(p)} slots` : "Clique para desequipar"));
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", () => {
      const slot = el.dataset.slot;
      if (slot === "backpack") { toast("A bag padrão de 8 slots não pode ser removida."); return; }
      if (slot !== "ammo" && !addItem(G.p, slug, 1)) {
        toast("Mochila cheia."); return;
      }
      delete G.p.equip[slot];
      hideTip();
      renderAll();
    });
  });
}

function renderHunts(p) {
  const cur = p.hunt;
  let h = "";
  for (const id in GAMEDATA.hunts) {
    const hu = GAMEDATA.hunts[id];
    const locked = p.level < hu.level;
    const active = cur === id;
    const risk = huntRisk(p, hu);
    const mobs = hu.monsters.slice(0, 3).map(
      (m) => `<img src="assets/mob/${m}_s.png" alt="">`).join("");
    h += `<div class="hunt-card ${active ? "active" : ""} ${locked ? "locked" : ""}"
            data-hunt="${id}">
      <div class="mobs">${mobs}</div>
      <div class="info">
        <div class="nm">${hu.name}</div>
        <div class="meta">nv ${hu.level} · ${fmt(hu.avgExp)} xp/kill</div>
      </div>
      <span class="risk ${risk.cls}">${risk.txt}</span>
    </div>`;
  }
  $("#hunts").innerHTML = h;
  $$("#hunts .hunt-card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.hunt;
      const hu = GAMEDATA.hunts[id];
      if (G.p.level < hu.level) {
        toast(`Precisa do nível <b>${hu.level}</b> para ${hu.name}`, "");
        return;
      }
      startHunt(id);
    });
  });
}

/* Avalia o risco de uma hunt para o personagem */
function huntRisk(p, hu) {
  const max = maxStats(p);
  const def = playerDefense(p);
  const pack = hu.pack || 3;
  // dano recebido por segundo estimado
  let dps = 0;
  for (let i = 0; i < pack; i++) {
    let raw = hu.avgDamage * 0.7;
    raw = Math.max(0, raw - def.armor * 0.7 - def.defense * 0.35);
    raw *= 1 - Math.min(0.7, def.protection / 100);
    dps += raw / 2;
  }
  const ttd = dps > 0 ? max.hp / dps : 999;
  if (ttd > 45) return { cls: "low", txt: "seguro", ttd: ttd };
  if (ttd > 18) return { cls: "mid", txt: "médio", ttd: ttd };
  return { cls: "high", txt: "perigo", ttd: ttd };
}

/* Estimativa de XP/h e gold/h de uma hunt */
function huntEstimate(p, hu) {
  const dmg = playerDamage(p);
  const avgDmg = (dmg.min + dmg.max) / 2;
  const interval = 2.0;                   // segundos por golpe
  const dps = avgDmg / interval;
  const effHp = hu.avgHp + hu.avgArmor * 3;
  const ttk = Math.max(0.6, effHp / Math.max(1, dps));
  const killsPerHour = 3600 / (ttk + (hu.respawn || 0.8));
  return {
    exp: killsPerHour * hu.avgExp,
    gold: killsPerHour * hu.avgGold * 1.6,
    kills: killsPerHour,
    ttk: ttk,
  };
}

function renderInventory(p) {
  const slots = bagSlots(p);
  const entries = Object.keys(p.bag).filter((slug) => (p.bag[slug] || 0) > 0).sort((a, b) => {
    const A = GAMEDATA.items[a], B = GAMEDATA.items[b];
    return (B ? B.sell || 0 : 0) - (A ? A.sell || 0 : 0);
  });
  const displaySlots = Math.max(slots, entries.length);
  const cells = [];
  for (let i = 0; i < displaySlots; i++) {
    const slug = entries[i];
    if (slug) {
      cells.push(`<div class="inv-item" data-item="${slug}">${itemImg(slug)}
        ${p.bag[slug] > 1 ? `<span class="cnt">${p.bag[slug]}</span>` : ""}
      </div>`);
    } else {
      cells.push(`<div class="inv-item empty" title="Slot vazio"></div>`);
    }
  }
  $("#inv").innerHTML = `
    <div class="tiny dim" style="grid-column:1/-1;margin:0 0 3px 2px">
      Bag padrão: ${bagUsedSlots(p)} / ${slots} slots
    </div>${cells.join("")}`;
  const invBox = $("#inv");
  invBox.addEventListener("dragover", (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes("text/loot-pouch")) e.preventDefault();
  });
  invBox.addEventListener("drop", (e) => {
    const slug = e.dataTransfer ? e.dataTransfer.getData("text/loot-pouch") : "";
    if (!slug) return;
    e.preventDefault();
    const count = G.p.lootPouch && G.p.lootPouch[slug] ? G.p.lootPouch[slug] : 0;
    if (count <= 0) return;
    if (!addItem(G.p, slug, count)) { toast("Mochila cheia."); return; }
    removeLootPouch(G.p, slug, count);
    addLog("info", `Moveu <b>${itemName(slug)}</b> do Loot Pouch para a mochila.`);
    hideTip();
    renderAll();
  });
  $$("#inv .inv-item[data-item]").forEach((el) => {
    const slug = el.dataset.item;
    const it = GAMEDATA.items[slug];
    const hint = it && it.s ? "Clique para equipar" : "Clique para vender";
    el.addEventListener("mouseenter", () =>
      showTip(itemTip(slug, `${p.bag[slug]}x · ${hint}`)));
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", () => {
      if (it && it.s) {
        if (it.lvl && G.p.level < it.lvl) {
          toast(`Requer nível ${it.lvl}`, "");
          return;
        }
        if (it.s === "ammo") {
          G.p.equip.ammo = { item: slug, count: G.p.bag[slug] || 0 };
          toast(`Munição selecionada: <b>${it.n}</b>`);
          hideTip();
          renderAll();
          return;
        }
        const old = G.p.equip[it.s];
        removeItem(G.p, slug, 1);
        if (old && !addItem(G.p, old.item, 1)) {
          addItem(G.p, slug, 1);
          toast("Mochila cheia.");
          return;
        }
        G.p.equip[it.s] = { item: slug, count: 1 };
        const w = GAMEDATA.items[slug];
        if (w.th && G.p.equip.shield) {
          if (addItem(G.p, G.p.equip.shield.item, 1)) delete G.p.equip.shield;
          else toast("Sem espaço para guardar o escudo.");
        }
      } else if (it && it.sell) {
        const total = it.sell * G.p.bag[slug];
        G.p.gold += total;
        addLog("sell", `Vendeu ${G.p.bag[slug]}x ${it.n} por <span class="gold-txt">${fmtFull(total)} gp</span>`);
        delete G.p.bag[slug];
      }
      hideTip();
      renderAll();
    });
  });
}

/* ---------------------------------------------------------- context menu */
function hideContextMenu() {
  const el = document.getElementById("ctx-menu");
  if (el) el.remove();
}

/* Menu de opções ancorado no cursor. options: [{label, action, danger, disabled, hint}] */
function showContextMenu(x, y, title, options) {
  hideContextMenu();
  const el = document.createElement("div");
  el.id = "ctx-menu";
  el.className = "ctx-menu";
  el.innerHTML = `<div class="ctx-title">${title}</div>` +
    options.map((o, i) =>
      `<div class="ctx-item ${o.danger ? "danger" : ""} ${o.disabled ? "disabled" : ""}"
        data-ctx="${i}">${o.label}${o.hint ? `<span class="ctx-hint">${o.hint}</span>` : ""}</div>`
    ).join("");
  document.body.appendChild(el);

  const r = el.getBoundingClientRect();
  el.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 6)) + "px";
  el.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) + "px";

  el.addEventListener("click", (e) => e.stopPropagation());
  $$("#ctx-menu [data-ctx]").forEach((node) => {
    const opt = options[parseInt(node.dataset.ctx, 10)];
    if (!opt || opt.disabled) return;
    node.addEventListener("click", () => { hideContextMenu(); opt.action(); });
  });
  setTimeout(() => {
    document.addEventListener("click", hideContextMenu, { once: true });
    document.addEventListener("contextmenu", hideContextMenu, { once: true });
    document.addEventListener("keydown", function esc(ev) {
      if (ev.key === "Escape") { hideContextMenu(); document.removeEventListener("keydown", esc); }
    });
  }, 0);
}

/* Modal com os atributos completos de um item */
function openItemDetails(slug, count) {
  const it = GAMEDATA.items[slug];
  if (!it) return;
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== 0 && v !== "") rows.push([k, v]); };
  add("Quantidade", count ? `${fmtFull(count)}x` : null);
  add("Tipo", it.t || (it.s ? it.s : "loot"));
  add("Slot", it.s || "—");
  add("Ataque", it.atk);
  add("Dano mágico", it.mdmg);
  add("Defesa", it.def);
  add("Armadura", it.arm);
  add("Proteção", it.prot);
  add("Regen. HP", it.hpreg);
  add("Regen. Mana", it.mpreg);
  add("Velocidade", it.spd);
  add("HP extra", it.hp);
  add("Mana extra", it.mp);
  add("Nível mínimo", it.lvl);
  add("Peso", it.w ? `${it.w} oz` : null);
  add("Preço de compra", it.buy ? `${fmtFull(it.buy)} gp` : null);
  add("Preço de venda", it.sell ? `${fmtFull(it.sell)} gp` : null);
  if (count && it.sell) add("Valor total", `${fmtFull(it.sell * count)} gp`);
  if (it.inf) add("Especial", "Munição infinita");
  if (it.th) add("Especial", "Duas mãos");

  $("#modal-body").innerHTML = `
    <div class="panel-title">Detalhes do item
      <span style="flex:1"></span><button class="sm" id="details-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row mb8" style="gap:10px;align-items:center">
        <div class="inv-item" style="cursor:default">${itemImg(slug)}</div>
        <div>
          <div style="color:#d4af37;font-weight:bold">${it.n}</div>
          <div class="tiny dim">${slug}</div>
        </div>
      </div>
      <div class="list" style="max-height:300px">
        ${rows.map(([k, v]) => `<div class="stat-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}
      </div>
    </div>`;
  $("#modal").classList.add("show");
  $("#details-close").addEventListener("click", () => $("#modal").classList.remove("show"));
}

/* Vende um item específico do Loot Pouch */
function sellPouchItem(p, slug) {
  const it = GAMEDATA.items[slug];
  const count = p.lootPouch[slug] || 0;
  if (!it || count <= 0) return 0;
  const value = (it.sell || 0) * count;
  if (value <= 0) { toast("Esse item não possui valor de venda."); return 0; }
  p.gold += value;
  addLog("sell", `Vendeu ${count}x ${it.n} do Loot Pouch por <span class="gold-txt">${fmtFull(value)} gp</span>`);
  delete p.lootPouch[slug];
  return value;
}

/* Vende tudo que estiver liberado dentro do Loot Pouch.
   Só respeita a marca "Não vender" — o resto (inclusive equipamento de boss) é vendido. */
function sellAllPouch(p) {
  let total = 0, kinds = 0;
  for (const slug of Object.keys(p.lootPouch || {})) {
    const it = GAMEDATA.items[slug];
    if (!it || isNoSell(p, slug)) continue;      // respeita "Não vender"
    if ((it.sell || 0) <= 0) continue;
    total += sellPouchItem(p, slug);
    kinds++;
  }
  return { gold: total, kinds: kinds };
}

function renderLootPouch(p) {
  const box = $("#lootpouch");
  if (!box) return;
  p.lootPouch = p.lootPouch || {};
  const entries = Object.keys(p.lootPouch)
    .filter((slug) => (p.lootPouch[slug] || 0) > 0 && GAMEDATA.items[slug])
    .sort((a, b) => (GAMEDATA.items[b].sell || 0) * p.lootPouch[b] -
                    (GAMEDATA.items[a].sell || 0) * p.lootPouch[a]);
  const sellBtn = $("#btn-pouch-sell-all");
  if (sellBtn) sellBtn.disabled = !entries.some((s) =>
    !isNoSell(p, s) && (GAMEDATA.items[s].sell || 0) > 0);
  if (!entries.length) {
    box.innerHTML = `<div class="dim small center" style="grid-column:1/-1;padding:10px">Loot Pouch vazia</div>`;
    return;
  }
  box.innerHTML = `<div class="tiny dim" style="grid-column:1/-1;margin:0 0 3px 2px">
      Auto-seller: ${entries.filter((s) => !isNoSell(p, s) && (GAMEDATA.items[s].sell || 0) > 0).length} vendável · clique no item para as opções
    </div>` + entries.map((slug) =>
    `<div class="inv-item ${isNoSell(p, slug) ? "locked" : ""}" data-pouch-item="${slug}" draggable="true">
      ${itemImg(slug)}${p.lootPouch[slug] > 1 ? `<span class="cnt">${p.lootPouch[slug]}</span>` : ""}
    </div>`).join("");

  $$("#lootpouch [data-pouch-item]").forEach((el) => {
    const slug = el.dataset.pouchItem;
    const it = GAMEDATA.items[slug];
    el.addEventListener("mouseenter", () => {
      const noSell = isNoSell(p, slug), noCollect = isNoCollect(p, slug);
      const flags = [noSell ? "Não vender" : "", noCollect ? "Não coletar" : ""].filter(Boolean).join(" · ");
      showTip(itemTip(slug, `${p.lootPouch[slug]}x · Clique para opções${flags ? " · " + flags : ""}`));
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("dragstart", (e) => {
      hideContextMenu();
      e.dataTransfer.setData("text/loot-pouch", slug);
      e.dataTransfer.effectAllowed = "move";
    });
    const openMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      openPouchItemMenu(p, slug, e.clientX, e.clientY);
    };
    el.addEventListener("click", openMenu);
    el.addEventListener("contextmenu", openMenu);
  });
}

/* Menu de opções de um item do Loot Pouch */
function openPouchItemMenu(p, slug, x, y) {
  const it = GAMEDATA.items[slug];
  if (!it) return;
  const count = p.lootPouch[slug] || 0;
  const noSell = isNoSell(p, slug);
  const noCollect = isNoCollect(p, slug);
  const value = (it.sell || 0) * count;

  showContextMenu(x, y, `${it.n} <span class="dim">${count}x</span>`, [
    {
      label: "Detalhes",
      action: () => openItemDetails(slug, count),
    },
    {
      label: "Mover para backpack",
      action: () => {
        if (!addItem(p, slug, count)) { toast("Mochila cheia."); return; }
        removeLootPouch(p, slug, count);
        addLog("info", `Moveu <b>${it.n}</b> do Loot Pouch para a mochila.`);
        renderAll();
      },
    },
    {
      label: noCollect ? "Voltar a coletar" : "Não coletar",
      hint: "autoloot",
      action: () => {
        if (noCollect) removeLootRuleByText(p, "noCollect", slug);
        else addLootRule(p, "noCollect", slug);
        toast(noCollect ? `<b>${it.n}</b> voltou para o autoloot.`
                        : `<b>${it.n}</b> será ignorado pelo autoloot.`);
        renderAll();
      },
    },
    {
      label: noSell ? "Voltar a vender" : "Não vender",
      hint: "sell all",
      action: () => {
        if (noSell) removeLootRuleByText(p, "noSell", slug);
        else addLootRule(p, "noSell", slug);
        toast(noSell ? `<b>${it.n}</b> voltou para o sell all.`
                     : `<b>${it.n}</b> será ignorado pelo sell all.`);
        renderAll();
      },
    },
    {
      label: `Vender${value > 0 ? ` · ${fmtFull(value)} gp` : ""}`,
      disabled: value <= 0,
      action: () => { if (sellPouchItem(p, slug) > 0) renderAll(); },
    },
    {
      label: "Destruir",
      danger: true,
      action: () => {
        if (!confirm(`Destruir ${count}x ${it.n}? Isso não pode ser desfeito.`)) return;
        delete p.lootPouch[slug];
        addLog("info", `Destruiu ${count}x <b>${it.n}</b>.`);
        renderAll();
      },
    },
  ]);
}

function openLootPouchConfigModal() {
  const p = G.p;
  const renderList = (key) => lootConfigList(p, key).map((rule, i) => `
    <div class="stat-row">
      <span class="k">${rule}</span>
      <button class="sm danger" data-remove-rule="${key}:${i}">x</button>
    </div>`).join("") || `<div class="dim tiny" style="padding:8px">Nenhum item configurado.</div>`;

  $("#modal-body").innerHTML = `
    <div class="panel-title">Configurar Loot Pouch
      <span style="flex:1"></span><button class="sm" id="lootcfg-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row wrap" style="gap:10px;align-items:flex-start">
        <div class="panel-inset" style="padding:8px;flex:1;min-width:230px">
          <div class="small" style="color:#ff9a6a;font-weight:bold">NÃO COLETAR</div>
          <div class="tiny dim mb4">Itens desta lista serão ignorados no loot.</div>
          <div class="row mb8" style="gap:4px">
            <input id="no-collect-input" placeholder="nome do item" style="flex:1;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
            <button class="sm primary" data-add-rule="noCollect">Add</button>
          </div>
          <div class="list" style="max-height:220px">${renderList("noCollect")}</div>
        </div>
        <div class="panel-inset" style="padding:8px;flex:1;min-width:230px">
          <div class="small" style="color:#ffe680;font-weight:bold">NÃO VENDER</div>
          <div class="tiny dim mb4">Itens desta lista ficam guardados no Loot Pouch.</div>
          <div class="row mb8" style="gap:4px">
            <input id="no-sell-input" placeholder="nome do item" style="flex:1;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
            <button class="sm primary" data-add-rule="noSell">Add</button>
          </div>
          <div class="list" style="max-height:220px">${renderList("noSell")}</div>
        </div>
      </div>
      <div class="tiny dim mt8">Você pode digitar parte do nome ou slug do item. Ex: meat, gold coin, leather armor.</div>
    </div>`;
  $("#modal").classList.add("show");
  $("#lootcfg-close").addEventListener("click", () => { $("#modal").classList.remove("show"); renderLootPouch(p); });
  $$("#modal-body [data-add-rule]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.addRule;
    const input = key === "noCollect" ? $("#no-collect-input") : $("#no-sell-input");
    addLootRule(p, key, input.value);
    openLootPouchConfigModal();
  }));
  $$("#modal-body [data-remove-rule]").forEach((b) => b.addEventListener("click", () => {
    const [key, idx] = b.dataset.removeRule.split(":");
    removeLootRule(p, key, parseInt(idx, 10));
    openLootPouchConfigModal();
  }));
}

function renderSupplies(p) {
  const box = $("#supplies");
  if (!box) return;
  let h = "";
  for (const slug in SUPPLIES) {
    const s = SUPPLIES[slug];
    const have = p.supplies[slug] || 0;
    h += `<div class="row" style="justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.25)">
      <div class="row" style="gap:5px;min-width:0">
        <img src="assets/item/${s.sprite}.png" style="width:22px;height:22px" alt="">
        <div style="min-width:0">
          <div class="tiny" style="color:#c8c0a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
          <div class="tiny dim">${fmtFull(supplyPrice(s, p.level))} gp/carga · cargas ${have}</div>
        </div>
      </div>
      <div class="row" style="gap:2px">
        <button class="sm" data-buy="${slug}" data-n="10">+10c</button>
        <button class="sm" data-buy="${slug}" data-n="100">+100c</button>
      </div>
    </div>`;
  }
  box.innerHTML = h;
  $$("#supplies [data-buy]").forEach((b) => {
    b.addEventListener("click", () => {
      const slug = b.dataset.buy, n = parseInt(b.dataset.n, 10);
      const s = SUPPLIES[slug];
      const cost = supplyPrice(s, G.p.level) * n;
      if (!spendGold(G.p, cost)) { toast("Ouro insuficiente", ""); return; }
      G.p.supplies[slug] = (G.p.supplies[slug] || 0) + n;
      addLog("sell", `Comprou ${n} carga(s) de ${s.name} por ${fmtFull(cost)} gp`);
      renderAll();
    });
  });
}

function renderHelper(p) {
  const healEl = $("#helper-heal");
  const atkEl = $("#helper-attack");
  const shooterEl = $("#helper-shooter");
  if (healEl) {
    const heals = Object.keys(SPELLS).filter((id) => {
      const s = SPELLS[id];
      return s.type === "heal" && s.vocs.indexOf(p.voc) !== -1;
    }).sort((a, b) => SPELLS[a].lvl - SPELLS[b].lvl);
    const healSup = Object.keys(SUPPLIES).filter((slug) => SUPPLIES[slug].type === "heal");
    const supplyRow = (slug) => {
      const s = SUPPLIES[slug]; if (!s) return "";
      const pw = supplyPower(s, p.level);
      const kind = s.type === "mana" ? "mana" : "hp";
      const selected = s.type === "mana" ? p.config.manaSupply === slug : p.config.healSupply === slug;
      const disabledMana = s.type === "mana" && !selected;
      return `<div class="helper-supply-row ${selected ? "selected" : disabledMana ? "disabled" : ""}">
        <img src="assets/item/${s.sprite}.png" alt="${s.name}">
        <div style="flex:1;min-width:0">
          <div class="small">${s.name}</div>
          <div class="tiny dim">
            <span class="gold-txt">${fmtFull(supplyPrice(s, p.level))} gp</span>
            · <span class="charge-highlight">CARGAS ${p.supplies[slug] || 0}</span>
            · ${kind} ${pw[0]}-${pw[1]}
          </div>
        </div>
        <button class="sm ${selected ? "primary" : disabledMana ? "danger" : ""}" data-use-supply="${slug}">
          ${selected ? "USANDO" : disabledMana ? "DESATIVADO" : "USAR"}</button>
      </div>`;
    };
    healEl.innerHTML = `
      <div class="mb8">
        <label class="small dim">Usar magia de cura abaixo de (%)</label>
        <input id="helper-heal-spell-at" type="number" min="1" max="99" value="${p.config.healSpellAt}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="small dim mt8 mb4">Magias de cura</div>
      <div class="list" style="max-height:115px">${heals.map((id) => {
        const s = SPELLS[id], ok = p.level >= s.lvl;
        const selected = p.config.healSpell === id;
        return `<div class="shop-row ${selected ? "selected" : ""}" style="opacity:${ok ? 1 : .45}">
          <div style="flex:1;min-width:0">
            <div class="small">${s.name}</div>
            <div class="tiny dim">${s.mana} mana · nv ${s.lvl}</div>
          </div>
          <button class="sm ${selected ? "primary" : ""}" data-heal-spell="${id}" ${ok ? "" : "disabled"}>
            ${selected ? "Selecionada" : "Selecionar Spell"}</button>
        </div>`;
      }).join("") || `<div class="dim tiny">Nenhuma magia de cura.</div>`}</div>
      <div class="mt8">
        <label class="small dim">Usar item de cura abaixo de (%)</label>
        <input id="helper-heal-item-at" type="number" min="1" max="99" value="${p.config.healItemAt}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="small dim mt8 mb4">Itens de HP</div>
      <div class="list" style="max-height:132px">${healSup.map(supplyRow).join("")}</div>
      <div class="mt8">
        <label class="small dim">Preencher mana abaixo de (%)</label>
        <input id="helper-mana-at" type="number" min="1" max="99" value="${p.config.manaAt === undefined ? 50 : p.config.manaAt}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="small dim mt8 mb4">Mana Fluid</div>
      <div class="list" style="max-height:70px">${["mana-fluid"].map(supplyRow).join("")}</div>`;
    ["helper-heal-spell-at", "helper-heal-item-at", "helper-mana-at"].forEach((id) => {
      const input = $("#" + id);
      if (!input) return;
      input.addEventListener("change", () => {
        const val = Math.max(1, Math.min(99, parseInt(input.value, 10) || 1));
        input.value = val;
        if (id === "helper-heal-spell-at") p.config.healSpellAt = val;
        else if (id === "helper-heal-item-at") p.config.healItemAt = val;
        else p.config.manaAt = val;
        p.config.healAt = Math.max(p.config.healSpellAt || 1, p.config.healItemAt || 1);
        const healAt = $("#heal-at"), healVal = $("#heal-at-val");
        if (healAt) healAt.value = p.config.healAt;
        if (healVal) healVal.textContent = p.config.healAt + "%";
      });
    });
    $$("#helper-heal [data-heal-spell]").forEach((b) => b.addEventListener("click", () => {
      p.config.healSpell = b.dataset.healSpell;
      toast(`Spell de cura selecionada: <b>${SPELLS[p.config.healSpell].name}</b>`);
      renderHelper(p);
    }));
    $$("#helper-heal [data-use-supply]").forEach((b) => b.addEventListener("click", () => {
      const slug = b.dataset.useSupply;
      const s = SUPPLIES[slug];
      if (!s) return;
      if (!Object.prototype.hasOwnProperty.call(p.supplies, slug)) p.supplies[slug] = 0;
      if (s.type === "mana") {
        p.config.manaSupply = p.config.manaSupply === slug ? "" : slug;
        toast(p.config.manaSupply ? `Mana selecionada: <b>${s.name}</b>` : "Mana Fluid desativado");
      } else {
        p.config.healSupply = slug;
        toast(`Cura selecionada: <b>${s.name}</b>`);
      }
      renderHelper(p);
    }));
  }
  if (atkEl) {
    const mode = p.config.attackMode || "chase";
    atkEl.innerHTML = `
      <div class="small dim mb4">Ataque Mode</div>
      <div class="row wrap" style="gap:6px">
        ${[["chase", "Chase"], ["stand", "Stand"], ["kiting", "Kiting"]].map(([id, label]) =>
          `<button class="sm ${mode === id ? "primary" : ""}" data-attack-mode="${id}">${label}</button>`).join("")}
      </div>
      <div class="mt8" style="max-width:180px">
        <label class="small dim">Distância do Kiting (SQM)</label>
        <input id="kite-distance" type="number" min="1" max="5" value="${p.config.kiteDistance || 3}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="tiny dim mt8">Kiting faz o personagem manter de 1 a 5 SQMs do monstro targetado. Stand mantém parado. Chase aproxima.</div>`;
    $$("#helper-attack [data-attack-mode]").forEach((b) => b.addEventListener("click", () => {
      p.config.attackMode = b.dataset.attackMode;
      renderHelper(p);
    }));
    const kd = $("#kite-distance");
    if (kd) kd.addEventListener("change", () => {
      p.config.kiteDistance = Math.max(1, Math.min(5, parseInt(kd.value, 10) || 3));
      kd.value = p.config.kiteDistance;
    });
  }
  if (shooterEl) {
    const attackSpells = Object.keys(SPELLS).filter((id) => {
      const s = SPELLS[id];
      return s.type === "attack" && s.vocs.indexOf(p.voc) !== -1;
    }).sort((a, b) => SPELLS[a].lvl - SPELLS[b].lvl);
    const attackRunes = Object.keys(SUPPLIES).filter((slug) => SUPPLIES[slug].type === "attack");
    shooterEl.innerHTML = `
      <div class="row wrap mb8" style="gap:6px">
        ${[["auto", "Auto"], ["spell", "Magia"], ["rune", "Runa"]].map(([id, label]) =>
          `<button class="sm ${p.config.shooterType === id ? "primary" : ""}" data-shooter-type="${id}">${label}</button>`).join("")}
      </div>
      <div class="small dim mb4">Magias ofensivas</div>
      <div class="list" style="max-height:130px">${attackSpells.map((id) => {
        const s = SPELLS[id];
        const ok = p.level >= s.lvl;
        return `<div class="shop-row" style="opacity:${ok ? 1 : .45}">
          <div style="flex:1"><div class="small">${s.name}</div><div class="tiny dim">${s.label} · ${s.mana} mana · nv ${s.lvl}</div></div>
          <button class="sm ${p.config.shooterSpell === id && p.config.shooterType === "spell" ? "primary" : ""}" data-shooter-spell="${id}" ${ok ? "" : "disabled"}>Usar</button>
        </div>`;
      }).join("") || `<div class="dim tiny">Nenhuma magia ofensiva.</div>`}</div>
      <div class="small dim mt8 mb4">Runas ofensivas</div>
      <div class="list" style="max-height:150px">${attackRunes.map((slug) => {
        const s = SUPPLIES[slug], ok = p.level >= (s.lvl || 1);
        return `<div class="shop-row" style="opacity:${ok ? 1 : .45}">
          <img src="assets/item/${s.sprite}.png">
          <div style="flex:1"><div class="small">${s.name}</div><div class="tiny dim">cargas ${p.supplies[slug] || 0} · ${fmtFull(supplyPrice(s, p.level))} gp/carga · nv ${s.lvl || 1}</div></div>
          <button class="sm ${p.config.shooterRune === slug && p.config.shooterType === "rune" ? "primary" : ""}" data-shooter-rune="${slug}" ${ok ? "" : "disabled"}>${p.config.shooterRune === slug && p.config.shooterType === "rune" ? "USANDO" : "USAR"}</button>
        </div>`;
      }).join("")}</div>`;
    $$("#helper-shooter [data-shooter-type]").forEach((b) => b.addEventListener("click", () => {
      p.config.shooterType = b.dataset.shooterType;
      renderHelper(p);
    }));
    $$("#helper-shooter [data-shooter-spell]").forEach((b) => b.addEventListener("click", () => {
      p.config.shooterType = "spell"; p.config.shooterSpell = b.dataset.shooterSpell; renderHelper(p);
    }));
    $$("#helper-shooter [data-shooter-rune]").forEach((b) => b.addEventListener("click", () => {
      p.config.shooterType = "rune"; p.config.shooterRune = b.dataset.shooterRune;
      if (!Object.prototype.hasOwnProperty.call(p.supplies, p.config.shooterRune)) p.supplies[p.config.shooterRune] = 0;
      renderHelper(p);
    }));
  }
  renderRefill(p);
}

/* ---------------------------------------------------------- refill (paladin) */
const REFILL_AMMO = {
  arrow: ["arrow", "poison-arrow", "burst-arrow"],
  bolt: ["bolt", "power-bolt", "infernal-bolt"],
};

function isPaladin(p) { return p && p.voc === "paladin"; }

/* Compra munição até o alvo configurado. Retorna {bought, cost}. */
function refillAmmo(p, slug, target) {
  const it = GAMEDATA.items[slug];
  if (!it || it.s !== "ammo") return { bought: 0, cost: 0 };
  const price = ammoPrice(slug);
  const have = p.bag[slug] || 0;
  let need = Math.max(0, (target || 0) - have);
  if (need <= 0 || price <= 0) return { bought: 0, cost: 0 };
  const afford = Math.floor(p.gold / price);
  need = Math.min(need, afford);
  if (need <= 0) return { bought: 0, cost: 0 };
  const cost = need * price;
  if (!spendGold(p, cost)) return { bought: 0, cost: 0 };
  if (!addItem(p, slug, need)) { p.gold += cost; return { bought: 0, cost: 0 }; }
  return { bought: need, cost: cost };
}

function renderRefill(p) {
  const tab = $("#tab-refill");
  const el = $("#helper-refill");
  if (!el) return;
  // a aba só existe para paladinos
  if (tab) tab.style.display = isPaladin(p) ? "" : "none";
  if (!isPaladin(p)) {
    const panel = document.querySelector('[data-panel-group="mid"][data-panel="refill"]');
    if (panel && panel.style.display !== "none") {
      panel.style.display = "none";
      const heal = document.querySelector('[data-panel-group="mid"][data-panel="heal"]');
      const healTab = document.querySelector('.tab[data-group="mid"][data-panel="heal"]');
      if (heal) heal.style.display = "";
      if (healTab) { $$('.tab[data-group="mid"]').forEach((t) => t.classList.remove("active")); healTab.classList.add("active"); }
    }
    el.innerHTML = "";
    return;
  }

  const cfg = p.config;
  const group = (title, key) => {
    const list = REFILL_AMMO[key];
    const selected = cfg[key === "arrow" ? "refillArrow" : "refillBolt"];
    return `
      <div class="small dim mt8 mb4">${title}</div>
      <div class="list" style="max-height:150px">
        ${list.map((slug) => {
          const it = GAMEDATA.items[slug];
          if (!it) return "";
          const sel = selected === slug;
          const have = p.bag[slug] || 0;
          return `<div class="helper-supply-row ${sel ? "selected" : ""}">
            <img src="assets/item/${slug}.png" alt="${it.n}">
            <div style="flex:1;min-width:0">
              <div class="small">${it.n}</div>
              <div class="tiny dim">
                <span class="gold-txt">${fmtFull(ammoPrice(slug))} gp</span>
                · <span class="charge-highlight">TEM ${fmtFull(have)}</span>
                ${it.atk ? `· atk ${it.atk}` : ""}
              </div>
            </div>
            <button class="sm ${sel ? "primary" : ""}" data-refill-pick="${key}:${slug}">
              ${sel ? "USANDO" : "USAR"}</button>
          </div>`;
        }).join("")}
      </div>`;
  };

  const wp = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  const infinite = wp && wp.inf;

  el.innerHTML = `
    <label class="toggle"><input type="checkbox" id="refill-on" ${cfg.refillAmmo ? "checked" : ""}>
      Refill automático de munição</label>
    <div class="row mt8" style="gap:8px;align-items:flex-end">
      <div style="flex:1">
        <label class="small dim">Comprar até (unidades)</label>
        <input id="refill-target" type="number" min="1" max="9999" value="${cfg.refillTarget || 100}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <button class="sm primary" id="refill-now">Refill agora</button>
    </div>
    <div class="tiny dim mt4">
      Ao ficar sem munição durante a caçada, o refill compra automaticamente até a quantidade definida.
      ${infinite ? `<b style="color:#9ce84a">A ${wp.n} equipada é infinita e não gasta munição.</b>` : ""}
    </div>
    ${group("Arrows", "arrow")}
    ${group("Bolts", "bolt")}`;

  $("#refill-on").addEventListener("change", (e) => {
    p.config.refillAmmo = e.target.checked;
    toast(p.config.refillAmmo ? "Refill automático ativado." : "Refill automático desativado.");
  });
  const tgt = $("#refill-target");
  tgt.addEventListener("change", () => {
    p.config.refillTarget = Math.max(1, Math.min(9999, parseInt(tgt.value, 10) || 100));
    tgt.value = p.config.refillTarget;
  });
  $$("#helper-refill [data-refill-pick]").forEach((b) => b.addEventListener("click", () => {
    const [key, slug] = b.dataset.refillPick.split(":");
    const field = key === "arrow" ? "refillArrow" : "refillBolt";
    p.config[field] = p.config[field] === slug ? "" : slug;
    // seleciona a munição escolhida como ammo ativa
    if (p.config[field]) {
      p.equip.ammo = { item: slug, count: p.bag[slug] || 0 };
      toast(`Munição selecionada: <b>${GAMEDATA.items[slug].n}</b>`);
    }
    renderAll();
  }));
  $("#refill-now").addEventListener("click", () => {
    const target = p.config.refillTarget || 100;
    let bought = 0, cost = 0;
    for (const field of ["refillArrow", "refillBolt"]) {
      const slug = p.config[field];
      if (!slug) continue;
      const r = refillAmmo(p, slug, target);
      bought += r.bought; cost += r.cost;
    }
    if (!bought) { toast("Nada para comprar (sem seleção, já cheio ou sem gold)."); return; }
    addLog("buy", `Refill: comprou ${bought}x munição por <span class="gold-txt">${fmtFull(cost)} gp</span>`);
    toast(`Refill: <b>${bought}</b> unidades por ${fmtFull(cost)} gp`);
    renderAll();
  });
}

function renderTopbar(p) {
  p.gold = Math.max(0, Math.floor(p.gold || 0));
  $("#gold").textContent = fmtFull(p.gold);
  const menuBtn = $("#btn-toggle-menus");
  if (menuBtn) menuBtn.textContent = G.sideCollapsed ? "Mostrar menus" : "Minimizar menus";
  const cityBtn = $("#btn-city");
  if (cityBtn) cityBtn.textContent = G.training ? "🏛 Sair da academia" : "🏛 Ir para a cidade";
  const c = G.combat;
  if (G.training) {
    $("#xph").textContent = "treino";
    $("#gph").textContent = "0";
    $("#session").textContent = fmtTime(G.training.time / 1000);
    $("#kills").textContent = fmtFull(G.training.stats.hits);
  } else if (c && c.stats.time > 3000) {
    const hrs = c.stats.time / 3600000;
    $("#xph").textContent = fmt(c.stats.exp / hrs);
    $("#gph").textContent = fmt(Math.max(0, (c.stats.gold - c.stats.supplyCost) / hrs));
    $("#session").textContent = fmtTime(c.stats.time / 1000);
    $("#kills").textContent = fmtFull(c.stats.kills);
  }
}

/* Atalhos para os NPCs da cidade */
function renderNpcQuick() {
  const el = $("#npc-quick");
  if (!el) return;
  el.innerHTML = Object.keys(NPCS).map((id) => {
    const n = NPCS[id];
    return `<div class="npc-btn" data-npc="${id}" title="${n.name} — ${n.role}">
      <img src="assets/npc/${n.sprite}_s.png" alt="">
      <div class="nb">${n.role.split(" ")[0]}</div>
    </div>`;
  }).join("");
  $$("#npc-quick .npc-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.npc;
      // se estiver na cidade, o personagem caminha ate o NPC;
      // fora dela (caçando) abre direto
      if (G.training && id === "trainer") {
        openAcademyConjureModal(true);
      } else if (G.inCity && !G.combat && !G.training && G.walker) {
        if (G.walker.goToNpc(id)) openNpc(id);
      } else {
        openNpc(id);
      }
    }));
}

function renderSpells(p) {
  const box = $("#spells");
  if (!box) return;
  const list = [];
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if (s.vocs.indexOf(p.voc) === -1) continue;
    list.push([id, s]);
  }
  list.sort((a, b) => a[1].lvl - b[1].lvl);
  if (!list.length) {
    box.innerHTML = `<div class="dim small center" style="padding:10px">Escolha uma vocação para aprender magias.</div>`;
    return;
  }
  box.innerHTML = list.map(([id, s]) => {
    const ok = p.level >= s.lvl;
    return `<div class="row" style="justify-content:space-between;padding:3px 0;opacity:${ok ? 1 : .4};border-bottom:1px solid rgba(0,0,0,.2)">
      <div style="min-width:0">
        <div class="tiny" style="color:${s.type === "heal" ? "#7ae87a" : s.type === "buff" ? "#7ad2ff" : "#ffb060"}">${s.name}</div>
        <div class="tiny dim">${s.label}</div>
      </div>
      <div class="tiny" style="text-align:right;white-space:nowrap">
        <div style="color:#6a8aff">${s.mana} mana</div>
        <div class="dim">nv ${s.lvl}</div>
      </div>
    </div>`;
  }).join("");
}
