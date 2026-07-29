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
/* itemImg vive em weapons.js: ele sabe desenhar as sprites animadas.
 * A versao que existia aqui sobrescrevia a de la (ui.js carrega depois) e
 * era a causa de TODOS os itens animados aparecerem estaticos. */

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
  if (it.s === "ammo") st.push((it.ammoKind === "bolt" ? "Bolt (besta)" : "Flecha (arco)") + " · " + fmtFull(ammoPrice(slug)) + " gp/tiro");
  if (it.cap) st.push("Capacidade quiver " + it.cap);
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
  // faixa de conditions/buffs ativos
  const box = $("#cond-bar");
  if (box) {
    const partes = [];
    if (typeof conditionList === "function") {
      for (const t of conditionList(p)) {
        const d = CONDITIONS[t];
        if (!d) continue;
        const c = p.conditions[t];
        partes.push(`<span class="cond" style="border-color:${d.cor};color:${d.cor}"
          title="${d.nome}">${d.nome} ${c.turns}</span>`);
      }
    }
    if (typeof buffTotals === "function") {
      const agora = Date.now();
      for (const b of buffTotals(p).lista) {
        const s2 = Math.max(0, Math.ceil((b.ate - agora) / 1000));
        partes.push(`<span class="cond buff" title="${b.nome}">${b.nome} ${s2}s</span>`);
      }
    }
    box.innerHTML = partes.join("");
    box.style.display = partes.length ? "" : "none";
  }

  // faixa exclusiva do Monk: harmonia, mantra e o estado sereno
  const mbox = $("#monk-bar");
  if (mbox) {
    const st = typeof monkStatus === "function" ? monkStatus(p) : null;
    if (!st) {
      mbox.style.display = "none";
    } else {
      mbox.style.display = "";
      // as 5 bolinhas de harmonia sao o feedback mais importante: o jogador
      // precisa saber quando vale a pena soltar o spender
      const pontos = [];
      for (let i = 1; i <= st.harmonyMax; i++) {
        pontos.push(`<span class="harm ${i <= st.harmony ? "on" : ""}"></span>`);
      }
      mbox.innerHTML = `
        <span class="monk-harm" title="Harmony: cada ponto DOBRA o bônus do próximo spender">
          ${pontos.join("")}
          <b>${st.bonus > 0 ? "+" + st.bonus + "%" : ""}</b>
        </span>
        ${st.mantra ? `<span class="cond monk-mantra"
          title="Mantra: abate ${st.mantra} de todo dano de fogo, gelo, energia e terra">
          🛡 Mantra ${st.mantra}</span>` : ""}
        ${st.atkBonus ? `<span class="cond monk-atk"
          title="Santuários da quest: o mantra soma ${st.atkBonus} ao golpe de punho">
          ✊ +${st.atkBonus}</span>` : ""}
        ${st.bond && ELEMENTS[st.bond] ? `<span class="cond monk-bond"
          style="border-color:${ELEMENTS[st.bond].color};color:${ELEMENTS[st.bond].color}"
          title="Elemental Bond da arma: as magias do Monk causam dano de ${ELEMENTS[st.bond].name}">
          ⚡ ${ELEMENTS[st.bond].name}</span>` : ""}
        ${st.sereno ? `<span class="cond monk-serene"
          title="Sereno: virtudes e bônus de punho valem em dobro">☯ Sereno</span>` : ""}`;
    }
  }

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
    ...(typeof mantraTotal === "function" && mantraTotal(p)
      ? [["Mantra", mantraTotal(p) + " (elemental)"]] : []),
    ...(typeof playerSpeedBreakdown === "function"
      ? [["Velocidade", (function () {
          const v = playerSpeedBreakdown(p);
          // as parcelas explicam de onde vem cada ponto; sem isso o jogador
          // nao tem como saber que o nivel entra na conta
          const partes = [];
          if (v.nivel) partes.push(`nv +${v.nivel}`);
          if (v.equip) partes.push(`equip +${v.equip}`);
          if (v.mount) partes.push(`mont +${v.mount}`);
          if (v.haste) partes.push(`<span style="color:#7ec8ff">haste +${v.haste}</span>`);
          return `<b>${v.total}</b>${partes.length
            ? ` <span class="tiny dim">(${partes.join(" · ")})</span>` : ""}`;
        })()]] : []),
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
  ring: "anel", extra: "extra", ammo: "muni",
};
/* Layout do inventario do Tibia. A mao secundaria (shield) aceita escudo OU
 * quiver — nao existe campo separado para aljava. O Extra Slot fica no canto
 * inferior direito, abaixo da mao secundaria, como no cliente. */
const SLOT_ORDER = [
  null, "helmet", null,
  "amulet", "armor", "backpack",
  "weapon", "legs", "shield",
  "ring", "boots", "extra",
  null, null, "ammo",
];

function renderEquip(p) {
  let h = "";
  for (const slot of SLOT_ORDER) {
    if (!slot) { h += `<div></div>`; continue; }
    const e = p.equip[slot];
    if (e) {
      const cnt = slot === "ammo" ? "∞" : e.count;
      h += `<div class="slot" data-slot="${slot}" data-item="${e.item}">
        ${itemImg(e.item)}${cnt && cnt !== 1 ? `<span class="cnt">${cnt}</span>` : ""}
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
      const extra = slot === "backpack" ? `Bag padrão · ${bagSlots(p)} slots` :
        slot === "shield" && (GAMEDATA.items[slug] || {}).t === "quiver"
          ? `Aljava na mão secundária. Munição: ${p.equip.ammo ? itemName(p.equip.ammo.item) + " · " + fmtFull(ammoPrice(p.equip.ammo.item)) + " gp/tiro" : "nenhuma"}` :
        slot === "extra" ? "Extra Slot: ferramentas bônus com resistência elemental" :
        slot === "ammo" ? `Munição no quiver · ${fmtFull(ammoPrice(slug))} gp/tiro` :
        "Clique para desequipar";
      showTip(itemTip(slug, extra));
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", () => {
      const slot = el.dataset.slot;
      if (slot === "backpack") { toast("A bag padrão de 8 slots não pode ser removida."); return; }
      if (slot === "ammo") { setActiveAmmo(G.p, null); hideTip(); renderAll(); return; }
      if (!addItem(G.p, slug, 1)) {
        toast("Mochila cheia."); return;
      }
      // tirar a aljava tambem desequipa a municao
      if (slot === "shield" && (GAMEDATA.items[slug] || {}).t === "quiver") {
        setActiveAmmo(G.p, null);
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
    el.addEventListener("mouseenter", () =>
      showTip(itemTip(slug, `${p.bag[slug]}x · Clique para opções`)));
    el.addEventListener("mouseleave", hideTip);
    const openMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      openBagItemMenu(p, slug, e.clientX, e.clientY);
    };
    el.addEventListener("click", openMenu);
    el.addEventListener("contextmenu", openMenu);
  });
}

/* Equipa um item da mochila. Retorna true se equipou. */
function equipFromBag(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return false;
  if (it.lvl && p.level < it.lvl) { toast(`Requer nível ${it.lvl}`, ""); return false; }
  if (it.s === "ammo") {
    if (!equippedQuiver(p)) { toast("Equipe um quiver antes de selecionar munição."); return false; }
    setActiveAmmo(p, slug);
    toast(`Munição no quiver: <b>${it.n}</b> (${fmtFull(ammoPrice(slug))} gp/tiro)`);
    return true;
  }
  const old = p.equip[it.s];
  removeItem(p, slug, 1);
  if (old && !addItem(p, old.item, 1)) {
    addItem(p, slug, 1);
    toast("Mochila cheia.");
    return false;
  }
  p.equip[it.s] = { item: slug, count: 1 };
  if (it.th && p.equip.shield) {
    if (addItem(p, p.equip.shield.item, 1)) delete p.equip.shield;
    else toast("Sem espaço para guardar o escudo.");
  }
  return true;
}

/* Vende um item da mochila (unica via de venda manual fora da Loot Pouch) */
function sellBagItem(p, slug) {
  const it = GAMEDATA.items[slug];
  const count = p.bag[slug] || 0;
  if (!it || count <= 0) return 0;
  if (currencyValue(slug)) {
    const g = creditCurrency(p, slug, count);
    delete p.bag[slug];
    addLog("sell", `Converteu ${count}x ${it.n} em <span class="gold-txt">${fmtFull(g)} gp</span>`);
    return g;
  }
  const value = (it.sell || 0) * count;
  if (value <= 0) { toast("Esse item não possui valor de venda."); return 0; }
  p.gold += value;
  addLog("sell", `Vendeu ${count}x ${it.n} por <span class="gold-txt">${fmtFull(value)} gp</span>`);
  delete p.bag[slug];
  return value;
}

/* Menu de opções de um item da mochila */
function openBagItemMenu(p, slug, x, y, after) {
  const it = GAMEDATA.items[slug];
  if (!it) return;
  const count = p.bag[slug] || 0;
  const value = (it.sell || 0) * count;
  const refresh = () => { if (after) after(); else renderAll(); };
  const opts = [{ label: "Detalhes", action: () => openItemDetails(slug, count) }];

  if (it.s) {
    opts.push({
      label: it.s === "ammo" ? "Selecionar munição" : "Equipar",
      action: () => { if (equipFromBag(p, slug)) refresh(); },
    });
  }
  // moedas viram gold direto; o resto só é vendido pela Loot Pouch
  if (currencyValue(slug)) {
    opts.push({
      label: `Converter em gold · ${fmtFull(currencyValue(slug) * count)} gp`,
      action: () => { if (sellBagItem(p, slug) > 0) refresh(); },
    });
  } else {
    opts.push({
      label: "Mover para Loot Pouch",
      hint: value > 0 ? `${fmtFull(value)} gp` : "",
      action: () => {
        addLootPouch(p, slug, count);
        delete p.bag[slug];
        addLog("info", `Moveu <b>${it.n}</b> para a Loot Pouch.`);
        refresh();
      },
    });
  }
  opts.push({
    label: "Destruir",
    danger: true,
    action: () => {
      if (!confirm(`Destruir ${count}x ${it.n}? Isso não pode ser desfeito.`)) return;
      delete p.bag[slug];
      addLog("info", `Destruiu ${count}x <b>${it.n}</b>.`);
      refresh();
    },
  });
  showContextMenu(x, y, `${it.n} <span class="dim">${count}x</span>`, opts);
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
  if (it.el && it.el !== "physical") add("Elemento", (ELEMENTS[it.el] || {}).name || it.el);
  if (it.poison) add("Veneno", `${it.poison.dmg} de dano por ${it.poison.turns} turnos`);
  if (it.area) add("Área", "Explode em 3x3 ao redor do alvo");
  if (it.noMiss) add("Precisão", "Nunca erra");
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

/* Icone de uma magia, recortado da folha defaultspells.png */
/* Icone da magia. O indice vem do `clientId` do spells.lua do otclient, que
 * e exatamente a coluna do spritesheet spell-icons-32x32 do cliente oficial —
 * por isso cada magia agora mostra o icone certo, e nao um aproximado. */
function spellIcon(s, cls) {
  if (!s || s.icon == null) return "";
  return `<img class="spell-icon ${cls || ""}" src="assets/spell/otc/${s.icon}.png"
    alt="${s.name || ""}" title="${s.name || ""}">`;
}

/* Seletor do buff de vocacao (Virtudes do Monk, Protector, Divine Dazzle) */
function renderBuffPicker(p) {
  if (typeof availableBuffs !== "function") return "";
  const lista = availableBuffs(p);
  if (!lista.length) return "";
  const ativos = typeof buffTotals === "function" ? buffTotals(p).lista : [];
  const agora = Date.now();
  return `
    <div class="small dim mt8 mb4">Buff de vocação</div>
    <div class="list" style="max-height:150px">
      ${lista.map(({ chave, buff, spell }) => {
        const sel = p.config.buff === chave;
        const at = ativos.find((x) => x.chave === chave);
        const resta = at ? Math.max(0, Math.ceil((at.ate - agora) / 1000)) : 0;
        return `<div class="shop-row ${sel ? "selected" : ""}">
          ${spell ? spellIcon(spell) : ""}
          <div style="flex:1;min-width:0">
            <div class="small">${buff.nome}
              ${resta ? `<span style="color:#9ce84a">· ${resta}s</span>` : ""}</div>
            <div class="tiny dim">${spell ? `<b>${spell.words || chave}</b> · ${spell.mana} mana · nv ${spell.lvl}` : ""}</div>
            <div class="tiny dim">${buff.desc}</div>
          </div>
          <button class="sm ${sel ? "primary" : ""}" data-buff="${chave}">
            ${sel ? "ATIVO" : "USAR"}</button>
        </div>`;
      }).join("")}
    </div>
    <div class="tiny dim mt4">O buff é relançado sozinho enquanto estiver selecionado.</div>`;
}

function renderHelper(p) {
  const healEl = $("#helper-heal");
  const atkEl = $("#helper-attack");
  const comboEl = $("#helper-combo");
  if (healEl) {
    const heals = Object.keys(SPELLS).filter((id) => {
      const s = SPELLS[id];
      return s.type === "heal" && s.vocs.indexOf(p.voc) !== -1;
    }).sort((a, b) => SPELLS[a].lvl - SPELLS[b].lvl);
    // potions da vocacao, com nivel e cura reais do canary. suppliesOf ja
    // esconde o que a vocacao nunca podera beber (knight nao usa ultimate
    // mana potion em nivel nenhum) e ordena por nivel.
    const healSup = (typeof suppliesOf === "function"
      ? suppliesOf(p, "heal").map((x) => x[0])
      : Object.keys(SUPPLIES).filter((k) => SUPPLIES[k].type === "heal"));
    const manaSup = (typeof suppliesOf === "function"
      ? suppliesOf(p, "mana").map((x) => x[0])
      : ["mana-fluid"]);

    const supplyRow = (slug) => {
      const s = SUPPLIES[slug]; if (!s) return "";
      const pw = typeof supplyPowerFor === "function"
        ? supplyPowerFor(p, slug) : supplyPower(s, p.level);
      const liberado = typeof supplyAllowed === "function"
        ? supplyAllowed(p, slug) : p.level >= (s.lvl || 1);
      const motivo = !liberado && typeof supplyBlockReason === "function"
        ? supplyBlockReason(p, slug) : "";
      const ehMana = s.type === "mana";
      const selected = ehMana ? p.config.manaSupply === slug
                              : p.config.healSupply === slug;
      const disabledMana = ehMana && !selected;
      // potion que cura vida E mana (spirit) mostra os dois valores
      const valores = [];
      if (s.heal) valores.push(`<span style="color:#7ae87a">hp ${s.heal[0]}-${s.heal[1]}</span>`);
      if (s.mana) valores.push(`<span style="color:#6a8aff">mana ${s.mana[0]}-${s.mana[1]}</span>`);
      if (!valores.length) valores.push(`${ehMana ? "mana" : "hp"} ${pw[0]}-${pw[1]}`);
      return `<div class="helper-supply-row ${selected ? "selected" : disabledMana ? "disabled" : ""}"
                   style="opacity:${liberado ? 1 : .45}">
        <img src="assets/item/${s.sprite}.png" alt="${s.name}">
        <div style="flex:1;min-width:0">
          <div class="small">${s.name}
            ${s.lvl > 1 ? `<span class="tiny dim">· nv ${s.lvl}</span>` : ""}</div>
          <div class="tiny dim">
            <span class="gold-txt">${fmtFull(supplyPrice(s, p.level))} gp</span>
            · <span class="charge-highlight">CARGAS ${p.supplies[slug] || 0}</span>
            · ${valores.join(" · ")}
          </div>
          ${motivo ? `<div class="tiny" style="color:#ff9090">requer ${motivo}</div>` : ""}
        </div>
        <button class="sm ${selected ? "primary" : disabledMana ? "danger" : ""}"
          data-use-supply="${slug}" ${liberado ? "" : "disabled"}>
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
        // a faixa vem da formula do canary avaliada neste personagem
        const faixa = ok && typeof spellRangeText === "function"
          ? spellRangeText(p, s) : "";
        return `<div class="shop-row ${selected ? "selected" : ""}" style="opacity:${ok ? 1 : .45}">
          ${spellIcon(s)}
          <div style="flex:1;min-width:0">
            <div class="small">${s.name}
              ${faixa ? `<span style="color:#7ae87a">· ${faixa} hp</span>` : ""}</div>
            <div class="tiny dim">${s.words ? `<b>${s.words}</b> · ` : ""}${s.mana} mana · nv ${s.lvl} · cd ${Math.round(s.cd / 1000)}s</div>
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
      <div class="small dim mt8 mb4">Itens de HP (${healSup.length})</div>
      <div class="list" style="max-height:210px">${healSup.map(supplyRow).join("")}</div>
      <div class="mt8">
        <label class="small dim">Preencher mana abaixo de (%)</label>
        <input id="helper-mana-at" type="number" min="1" max="99" value="${p.config.manaAt === undefined ? 50 : p.config.manaAt}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="small dim mt8 mb4">Itens de mana (${manaSup.length})</div>
      <div class="list" style="max-height:210px">${manaSup.map(supplyRow).join("")}</div>`;
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
      <div class="tiny dim mt8">Kiting faz o personagem manter de 1 a 5 SQMs do monstro targetado. Stand mantém parado. Chase aproxima.</div>
      ${renderBuffPicker(p)}`;
    $$("#helper-attack [data-buff]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.buff;
      p.config.buff = p.config.buff === k ? null : k;
      toast(p.config.buff ? `Buff selecionado: <b>${BUFFS[k].nome}</b>`
                          : "Buff desativado.");
      renderHelper(p);
    }));
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
  if (comboEl) renderComboBar(p, comboEl);
  renderRefill(p);
}

/* ---------------------------------------------------------- refill (paladin) */
const REFILL_AMMO = {
  arrow: ["flash-arrow", "shiver-arrow", "flaming-arrow", "earth-arrow", "simple-arrow",
          "poison-arrow", "arrow", "envenomed-arrow", "burst-arrow", "sniper-arrow",
          "tarsal-arrow", "diamond-arrow", "onyx-arrow", "crystalline-arrow"],
  bolt: ["bolt", "piercing-bolt", "vortex-bolt", "power-bolt", "drill-bolt",
         "prismatic-bolt", "infernal-bolt", "spectral-bolt"],
};

function isPaladin(p) { return p && p.voc === "paladin"; }

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

  const wp = p.equip.weapon ? GAMEDATA.items[p.equip.weapon.item] : null;
  const infinite = wp && wp.inf;
  const sel = p.equip.ammo && p.equip.ammo.item ? p.equip.ammo.item : null;
  const auto = !!p.config.ammoAuto;
  const eqQ = equippedQuiver(p);
  const q = eqQ ? QUIVER_DEFS[eqQ.item] : null;

  // A lista completa saiu daqui e virou um modal com abas (openAmmoPicker).
  // Aqui fica so o resumo do que esta equipado, que e o que o jogador
  // precisa ver de relance durante a cacada.
  el.innerHTML = `
    <div class="tiny dim mb8">
      Munição de paladin fica no quiver e <b>não é consumida</b>: cada tiro
      desconta o custo em gold. Sem gold, o personagem não ataca à distância.
      ${infinite ? `<br><b style="color:#9ce84a">A ${wp.n} equipada é infinita e não gasta munição.</b>` : ""}
    </div>

    <div class="quiver-head">
      <div class="quiver-slot">
        ${q ? `<img src="assets/item/${eqQ.item}.png" alt="">`
            : `<img src="assets/ui/slots/right-hand.png" alt="" style="opacity:.45">`}
      </div>
      <div style="flex:1;min-width:0">
        <div class="small">${q ? q.n : "Nenhum quiver equipado"}
          ${q ? `<span class="tiny dim">· ${q.cap} espaços</span>` : ""}</div>
        <div class="tiny dim">
          ${auto
            ? `Munição <b style="color:#9ce84a">automática</b>${sel ? ` · usando <b>${itemName(sel)}</b>` : ""}`
            : (sel ? `Atirando <b>${itemName(sel)}</b> ·
                      <span class="gold-txt">${fmtFull(ammoPrice(sel))} gp por tiro</span>`
                   : `<span style="color:#ff9090">Nenhuma munição escolhida</span>`)}
        </div>
        ${q && q.shotDmg
          ? `<div class="tiny" style="color:#ffe680">Perfect shot: +${q.shotDmg} de dano e acerto garantido a ${q.shotRange} SQM</div>`
          : ""}
      </div>
      <button class="sm primary" id="abrir-ammo">Escolher</button>
    </div>

    <div class="row wrap mb8" style="gap:4px">
      <button class="sm" data-ammo-open="arrow">Flechas</button>
      <button class="sm" data-ammo-open="bolt">Bolts</button>
      <button class="sm" data-ammo-open="elemental">Elementais</button>
      <button class="sm" data-ammo-open="especial">Especiais</button>
      <button class="sm" data-ammo-open="quiver">Quivers</button>
    </div>

    <div class="tiny dim">
      Os quivers <b>jungle</b>, <b>candy-coated</b>, <b>eldritch</b>,
      <b>naga</b> e <b>alicorn</b> não estão à venda: são drop de boss.
    </div>

    <div class="small dim mt8 mb4">Testes</div>
    <div class="row wrap" style="gap:4px">
      <button class="sm" data-test-give="bow">Buy Bow (grátis)</button>
      <button class="sm" data-test-give="crossbow">Buy Crossbow (grátis)</button>
      <button class="sm" data-test-give="quiver">Buy Quiver (grátis)</button>
    </div>`;

  const abrir = (cat) => {
    if (cat) AMMO_MODAL.cat = cat;
    openAmmoPicker();
  };
  $("#abrir-ammo").addEventListener("click", () => abrir("todas"));
  $$("#helper-refill [data-ammo-open]").forEach((b) =>
    b.addEventListener("click", () => abrir(b.dataset.ammoOpen)));

  // atalhos de teste: entregam arma/quiver de graça
  $$("#helper-refill [data-test-give]").forEach((b) => b.addEventListener("click", () => {
    const slug = b.dataset.testGive;
    if (slug === "quiver") {
      const old = equippedQuiver(p);
      if (old && old.item !== slug && !addItem(p, old.item, 1)) {
        toast("Mochila cheia para guardar o quiver atual.");
        return;
      }
      p.equip.shield = { item: slug, count: 1 };
    } else {
      const old = p.equip.weapon;
      if (old && old.item !== slug && !addItem(p, old.item, 1)) {
        toast("Mochila cheia para guardar a arma atual.");
        return;
      }
      p.equip.weapon = { item: slug, count: 1 };
    }
    addLog("info", `[teste] Recebeu <b>${itemName(slug)}</b> e equipou.`);
    toast(`[teste] <b>${itemName(slug)}</b> equipado.`);
    renderAll();
  }));
}

/* ---------------------------------------------------------- minimizar painéis */
const COLLAPSE_KEY = "tibia-idle-collapsed-v1";

/* rótulo usado quando o painel não tem .panel-title (ex.: o helper de abas) */
const COLLAPSE_LABELS = { helper: "Helper" };

function readCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return d && typeof d === "object" ? d : {};
  } catch (e) { return {}; }
}

function writeCollapsed(state) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state)); } catch (e) {}
}

function setPanelCollapsed(id, collapsed) {
  const panel = document.querySelector(`[data-collapse="${id}"]`);
  if (!panel) return;
  panel.classList.toggle("collapsed", collapsed);
  const btn = panel.querySelector("[data-collapse-btn]");
  if (btn) {
    btn.textContent = collapsed ? "+" : "–";
    btn.title = collapsed ? "Expandir" : "Minimizar";
  }
  const state = readCollapsed();
  if (collapsed) state[id] = 1; else delete state[id];
  writeCollapsed(state);
  if (G.renderer && typeof G.renderer.resize === "function") G.renderer.resize();
}

/* Injeta o botão "–" no título de cada painel e restaura o estado salvo */
function initPanelCollapse() {
  const saved = readCollapsed();
  $$("[data-collapse]").forEach((panel) => {
    const id = panel.dataset.collapse;
    // o painel do helper usa a barra de abas como cabeçalho
    const head = panel.querySelector(".panel-title") || panel.querySelector(".tabs");
    if (!head || head.querySelector("[data-collapse-btn]")) return;

    // painel de abas não tem título: cria um rótulo visível só quando minimizado
    if (head.classList.contains("tabs") && !head.querySelector(".tabs-label")) {
      const lbl = document.createElement("span");
      lbl.className = "tabs-label";
      lbl.textContent = COLLAPSE_LABELS[id] || "Painel";
      head.insertBefore(lbl, head.firstChild);
    }

    // garante que o botão fique encostado à direita
    if (!head.querySelector(".spacer, [style*='flex:1']")) {
      const sp = document.createElement("span");
      sp.style.flex = "1";
      head.appendChild(sp);
    }
    const btn = document.createElement("button");
    btn.className = "sm collapse-btn";
    btn.dataset.collapseBtn = id;
    btn.textContent = "–";
    btn.title = "Minimizar";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setPanelCollapsed(id, !panel.classList.contains("collapsed"));
    });
    head.appendChild(btn);

    if (saved[id]) setPanelCollapsed(id, true);
  });
}

function renderTopbar(p) {
  p.gold = Math.max(0, Math.floor(p.gold || 0));
  $("#gold").textContent = fmtFull(p.gold);
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

/* Painel "Magias": o grimorio completo da vocacao.
 *
 * Mostra TODAS as magias que a vocacao tem no 15.x (nao so as ofensivas),
 * agrupadas por tipo, com o icone oficial, as palavras, o custo e — o mais
 * util — a faixa de dano/cura JA CALCULADA para o personagem atual usando a
 * formula do canary. Marcar uma magia de ataque a coloca na rotacao do
 * auto-cast; sem nenhuma marcada o motor usa a de maior dano. */
function renderSpells(p) {
  const box = $("#helper-spells");
  if (!box) return;
  if (typeof spellsByType !== "function") { box.innerHTML = ""; return; }

  const grupos = spellsByType(p.voc);
  const filtro = (p.config.spellFilter || "all");
  const marcadas = p.config.attackSpells || (p.config.attackSpells = []);
  const somenteDisponiveis = !!p.config.spellOnlyReady;

  const ordem = ["attack", "heal", "cure", "support", "conjure", "summon"];
  const contagem = ordem.reduce((acc, t) => {
    acc[t] = (grupos[t] || []).length; return acc;
  }, {});
  const total = ordem.reduce((n, t) => n + contagem[t], 0);
  const liberadas = ordem.reduce((n, t) =>
    n + (grupos[t] || []).filter((s) => spellUnlocked(p, s)).length, 0);

  const linha = (s) => {
    const ok = spellUnlocked(p, s);
    const id = s.id;
    const marc = marcadas.indexOf(id) !== -1;
    const faixa = ok ? spellRangeText(p, s) : "";
    const podeMarcar = s.type === "attack";
    return `<div class="spell-row ${marc ? "selected" : ""}" style="opacity:${ok ? 1 : .4}">
      ${spellIcon(s)}
      <div style="flex:1;min-width:0">
        <div class="small">${s.name}
          ${faixa ? `<span style="color:${s.type === "heal" ? "#7ae87a" : "#ff9a4a"}">· ${faixa}</span>` : ""}</div>
        <div class="tiny dim"><b>${s.words}</b> · ${s.mana} mana · nv ${s.lvl}${s.ml ? " · ml " + s.ml : ""} · cd ${Math.round(s.cd / 1000)}s</div>
        <div class="tiny dim">${spellDesc(s)}</div>
      </div>
      ${podeMarcar
        ? `<button class="sm ${marc ? "primary" : ""}" data-spell-toggle="${id}" ${ok ? "" : "disabled"}>${marc ? "USANDO" : "USAR"}</button>`
        : `<span class="tiny dim" style="white-space:nowrap">${ok ? "aprendida" : "nv " + s.lvl}</span>`}
    </div>`;
  };

  const secao = (tipo) => {
    let ls = grupos[tipo] || [];
    if (somenteDisponiveis) ls = ls.filter((s) => spellUnlocked(p, s));
    if (!ls.length) return "";
    return `<div class="small dim mt8 mb4">${SPELL_TIPOS[tipo]} (${ls.length})</div>
      <div class="list" style="max-height:290px">${ls.map(linha).join("")}</div>`;
  };

  box.innerHTML = `
    <div class="tiny dim mb8">
      <b style="color:#d4af37">${liberadas}</b> de <b>${total}</b> magias de
      ${VOCATIONS[p.voc].name} liberadas no nível ${p.level}.
      Valores calculados com a fórmula real do Canary para este personagem.
    </div>
    <div class="row wrap mb4" style="gap:4px">
      ${[["all", "Todas"]].concat(ordem.filter((t) => contagem[t])
        .map((t) => [t, SPELL_TIPOS[t] + " " + contagem[t]]))
        .map(([id, label]) =>
          `<button class="sm ${filtro === id ? "primary" : ""}" data-spell-filter="${id}">${label}</button>`).join("")}
    </div>
    <label class="toggle tiny"><input type="checkbox" id="spell-only-ready"
      ${somenteDisponiveis ? "checked" : ""}> Mostrar só as que já posso lançar</label>
    ${(filtro === "all" ? ordem : [filtro]).map(secao).join("")
      || `<div class="dim tiny">Nenhuma magia neste filtro.</div>`}`;

  $$("#helper-spells [data-spell-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      p.config.spellFilter = b.dataset.spellFilter;
      renderSpells(p);
    }));
  const chk = $("#spell-only-ready");
  if (chk) chk.addEventListener("change", () => {
    p.config.spellOnlyReady = chk.checked;
    renderSpells(p);
  });
  $$("#helper-spells [data-spell-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.spellToggle;
      const i = marcadas.indexOf(id);
      if (i === -1) {
        marcadas.push(id);
        // marcar magia no grimorio ja liga o auto-cast, senao nada acontece
        p.config.spellAttack = true;
        const cb = $("#cfg-spell");
        if (cb) cb.checked = true;
        toast(`Magia adicionada: <b>${SPELLS[id].name}</b>`);
      } else {
        marcadas.splice(i, 1);
        toast(`Magia removida: <b>${SPELLS[id].name}</b>`);
      }
      renderSpells(p);
    }));
}

/* ------------------------------------------------- barra de cooldown */
/*
 * Espelha o modules/game_cooldown do otclient: a fileira da esquerda tem os
 * grupos da vocacao (sempre visiveis) e a da direita os icones das magias
 * que estao em cooldown agora.
 *
 * Roda a cada frame, entao o DOM e criado uma vez e depois so os estilos
 * mudam — recriar innerHTML 60x por segundo travava a aba e perdia o
 * tooltip enquanto o mouse estava em cima.
 */
const CD_UI = { grupos: null, voc: null, slots: {} };

function renderCooldownBar(p) {
  const barra = $("#cooldown-bar");
  if (!barra || !p || typeof cdVocGroups !== "function") return;
  const now = Date.now();

  // ---- grupos: so remonta quando a vocacao muda
  const elGrupos = $("#cd-groups");
  if (elGrupos && CD_UI.voc !== p.voc) {
    CD_UI.voc = p.voc;
    CD_UI.grupos = cdVocGroups(p);
    elGrupos.innerHTML = CD_UI.grupos.map((g) => `
      <div class="cd-slot group" data-cd-group="${g.id}" title="${g.pt}">
        <img src="assets/spell/group/${g.id - 1}.png" alt="${g.pt}">
        <div class="cd-fill" style="height:0"></div>
      </div>`).join("");
  }
  if (elGrupos && CD_UI.grupos) {
    for (const g of CD_UI.grupos) {
      const el = elGrupos.querySelector(`[data-cd-group="${g.id}"]`);
      if (!el) continue;
      const st = cdGroupState(p, g.id, now);
      el.classList.toggle("on", st.ativo);
      // o overlay encolhe conforme o cooldown corre
      el.querySelector(".cd-fill").style.height = (st.pct * 100).toFixed(1) + "%";
    }
  }

  // ---- magias em cooldown: entram e saem, entao reconcilia por id
  const elSpells = $("#cd-spells");
  if (!elSpells) return;
  const ativos = cdActiveSpells(p, now);
  const vistos = {};
  for (const a of ativos) {
    vistos[a.id] = true;
    let el = CD_UI.slots[a.id];
    if (!el || !el.isConnected) {
      el = document.createElement("div");
      el.className = "cd-slot spell";
      el.dataset.cdSpell = a.id;
      el.title = `${a.spell.name} (${Math.round(a.dur / 1000)}s)`;
      el.innerHTML =
        `${a.spell.icon != null
          ? `<img src="assets/spell/otc20/${a.spell.icon}.png" alt="">` : ""}
         <div class="cd-fill" style="height:0"></div>
         <div class="cd-num"></div>`;
      elSpells.appendChild(el);
      CD_UI.slots[a.id] = el;
    }
    el.querySelector(".cd-fill").style.height = (a.pct * 100).toFixed(1) + "%";
    const seg = a.resta / 1000;
    el.querySelector(".cd-num").textContent =
      seg >= 10 ? Math.ceil(seg) : seg.toFixed(1);
  }
  // remove os que terminaram
  for (const id in CD_UI.slots) {
    if (vistos[id]) continue;
    const el = CD_UI.slots[id];
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete CD_UI.slots[id];
  }
  if (typeof cdPrune === "function") cdPrune(p, now);

  const vazio = !ativos.length;
  let aviso = elSpells.querySelector(".cd-vazio");
  if (vazio && !aviso) {
    aviso = document.createElement("span");
    aviso.className = "cd-vazio";
    aviso.textContent = "nenhuma magia em cooldown";
    elSpells.appendChild(aviso);
  } else if (!vazio && aviso) {
    aviso.remove();
  }
}

/* ============================================================ munições
 *
 * Modal no mesmo formato do seletor de cura do baiakidle: abas clicaveis por
 * categoria, busca por nome, filtro de "so liberadas" e uma opcao automatica
 * no topo. A lista antiga era uma coluna unica com as 22 municoes, o que
 * obrigava a rolar muito para achar a bolt certa.
 *
 * As categorias sao por familia de municao, nao por arma: quem usa bow so
 * enxerga flechas de qualquer jeito (a checagem de compatibilidade vive em
 * ammoCompatibleWithWeapon), mas separar por efeito ajuda a escolher.
 */
const AMMO_CATS = [
  { id: "todas", nome: "Todas" },
  { id: "arrow", nome: "Flechas" },
  { id: "bolt", nome: "Bolts" },
  { id: "elemental", nome: "Elementais" },
  { id: "especial", nome: "Especiais" },
  { id: "quiver", nome: "Quivers" },
];

const AMMO_MODAL = { cat: "todas", busca: "", soLiberadas: false };

/* Em que categorias uma munição entra */
function ammoInCat(slug, cat) {
  const a = AMMO_DEFS[slug];
  if (!a) return false;
  if (cat === "todas") return true;
  if (cat === "arrow" || cat === "bolt") return a.kind === cat;
  if (cat === "elemental") return !!a.el && a.el !== "physical";
  if (cat === "especial") return !!(a.area || a.noMiss || a.poison);
  return false;
}

/* A munição pode ser usada agora? */
function ammoUsable(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return false;
  if (!equippedQuiver(p)) return false;
  if (p.level < (it.lvl || 1)) return false;
  if (typeof ammoCompatibleWithWeapon === "function" &&
      !ammoCompatibleWithWeapon(it, p.equip.weapon)) return false;
  return true;
}

/* Melhor munição por custo-benefício, usada pelo modo automático */
function bestAmmoFor(p) {
  let melhor = null, melhorNota = -1;
  for (const slug in AMMO_DEFS) {
    if (!ammoUsable(p, slug)) continue;
    const a = AMMO_DEFS[slug];
    const nota = (a.atk || 0) / (a.shotCost || 1);
    if (nota > melhorNota) { melhorNota = nota; melhor = slug; }
  }
  return melhor;
}

function openAmmoPicker() {
  const p = G.p;
  if (!p) return;
  AMMO_MODAL.busca = "";
  desenhaAmmoPicker();
  $("#modal").classList.add("show");
}

function desenhaAmmoPicker() {
  const p = G.p;
  const cat = AMMO_MODAL.cat;
  const busca = (AMMO_MODAL.busca || "").toLowerCase();
  const atual = p.equip.ammo && p.equip.ammo.item ? p.equip.ammo.item : null;
  const auto = !!p.config.ammoAuto;

  const linhaAmmo = (slug) => {
    const a = AMMO_DEFS[slug];
    const it = GAMEDATA.items[slug];
    if (!a || !it) return "";
    const ok = ammoUsable(p, slug);
    const sel = !auto && atual === slug;
    const motivo = !equippedQuiver(p) ? "equipe um quiver"
      : (p.level < (it.lvl || 1) ? "nível " + it.lvl
      : (typeof ammoCompatibleWithWeapon === "function" &&
         !ammoCompatibleWithWeapon(it, p.equip.weapon)
         ? (a.kind === "bolt" ? "crossbow" : "bow") : ""));
    return `<div class="pick-row ${sel ? "selected" : ""}"
                 style="opacity:${ok ? 1 : .5}">
      <img src="assets/item/${slug}.png" alt="${a.n}">
      <div style="flex:1;min-width:0">
        <div class="small">${a.n}</div>
        <div class="tiny dim">
          atk ${a.atk} · <span class="gold-txt">${a.shotCost} gp/tiro</span>
          ${a.lvl > 1 ? ` · lvl ${a.lvl}` : ""}
          ${a.el && a.el !== "physical" && ELEMENTS[a.el]
            ? ` · <span style="color:${ELEMENTS[a.el].color}">${ELEMENTS[a.el].name}</span>` : ""}
        </div>
        ${a.desc ? `<div class="tiny" style="color:#ff8a3c">${a.desc}</div>` : ""}
        ${motivo ? `<div class="tiny" style="color:#ff9090">requer ${motivo}</div>` : ""}
      </div>
      <button class="sm ${sel ? "primary" : ""}" data-pick-ammo="${slug}"
        ${ok ? "" : "disabled"}>${sel ? "Usando" : "Usar"}</button>
    </div>`;
  };

  const linhaQuiver = (slug) => {
    const q = QUIVER_DEFS[slug];
    if (!q) return "";
    const eqq = equippedQuiver(p);
    const usando = eqq && eqq.item === slug;
    const naBag = p.bag && p.bag[slug];
    const ok = p.level >= (q.lvl || 1);
    const extras = [];
    if (q.shotDmg) extras.push(`<span style="color:#ffe680">perfect shot +${q.shotDmg} a ${q.shotRange} SQM</span>`);
    if (q.prot) {
      for (const e in q.prot) {
        extras.push(`<span style="color:${(ELEMENTS[e] || {}).color || "#ccc"}">+${q.prot[e]}% ${e}</span>`);
      }
    }
    if (q.mag) extras.push(`+${q.mag} magic level`);
    // quiver de boss nao tem botao de compra: so aparece quando cai
    const origem = q.drop
      ? `<span style="color:#c07cff">${typeof quiverDropSource === "function"
           ? quiverDropSource(slug) : "drop de boss"}</span>`
      : `<span class="gold-txt">${fmtFull(q.buy)} gp</span>`;
    let acao;
    if (usando) acao = `<button class="sm primary" disabled>Equipado</button>`;
    else if (naBag) acao = `<button class="sm" data-pick-quiver="${slug}" ${ok ? "" : "disabled"}>Equipar</button>`;
    else if (q.drop) acao = `<span class="tiny dim" style="white-space:nowrap">não obtido</span>`;
    else acao = `<button class="sm" data-pick-quiver="${slug}" ${ok ? "" : "disabled"}>Comprar</button>`;
    return `<div class="pick-row ${usando ? "selected" : ""}"
                 style="opacity:${ok ? 1 : .5}">
      <img src="assets/item/${slug}.png" alt="${q.n}">
      <div style="flex:1;min-width:0">
        <div class="small">${q.n}
          <span class="tiny dim">· ${q.cap} espaços</span></div>
        <div class="tiny dim">
          ${q.lvl > 1 ? `nv ${q.lvl} · ` : ""}${origem}
          ${extras.length ? " · " + extras.join(" · ") : ""}
        </div>
        ${!ok ? `<div class="tiny" style="color:#ff9090">requer nível ${q.lvl}</div>` : ""}
      </div>
      ${acao}
    </div>`;
  };

  let itens;
  if (cat === "quiver") {
    itens = Object.keys(QUIVER_DEFS)
      .filter((s) => !busca || QUIVER_DEFS[s].n.toLowerCase().indexOf(busca) !== -1)
      .filter((s) => !AMMO_MODAL.soLiberadas || p.level >= (QUIVER_DEFS[s].lvl || 1))
      .sort((a, b) => (QUIVER_DEFS[a].lvl || 1) - (QUIVER_DEFS[b].lvl || 1))
      .map(linhaQuiver);
  } else {
    itens = Object.keys(AMMO_DEFS)
      .filter((s) => ammoInCat(s, cat))
      .filter((s) => !busca || AMMO_DEFS[s].n.toLowerCase().indexOf(busca) !== -1)
      .filter((s) => !AMMO_MODAL.soLiberadas || ammoUsable(p, s))
      // ordena por nivel exigido e, dentro do mesmo nivel, por ataque —
      // igual as listas de magia e potion, para o jogador ler a progressao
      .sort((a, b) => ((AMMO_DEFS[a].lvl || 1) - (AMMO_DEFS[b].lvl || 1)) ||
                      (AMMO_DEFS[a].atk - AMMO_DEFS[b].atk))
      .map(linhaAmmo);
  }

  const conta = (c) => c === "quiver"
    ? Object.keys(QUIVER_DEFS).length
    : Object.keys(AMMO_DEFS).filter((s) => ammoInCat(s, c)).length;

  $("#modal-body").innerHTML = `
    <div class="panel-title">Munição — escolher
      <span style="flex:1"></span>
      <button class="sm" id="ammo-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="pick-tabs">
        ${AMMO_CATS.map((c) => `<div class="pick-tab ${cat === c.id ? "active" : ""}"
          data-ammo-cat="${c.id}">${c.nome} <span class="dim">${conta(c.id)}</span></div>`).join("")}
      </div>
      <div class="row mb8" style="gap:8px;align-items:center">
        <input id="ammo-busca" placeholder="Buscar munição (nome)..."
          value="${AMMO_MODAL.busca}" style="flex:1;padding:6px;
          background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <label class="toggle tiny" style="white-space:nowrap">
          <input type="checkbox" id="ammo-so-lib" ${AMMO_MODAL.soLiberadas ? "checked" : ""}>
          Só liberadas</label>
      </div>
      ${cat !== "quiver" ? `
        <div class="pick-row ${auto ? "selected" : ""}">
          <div style="flex:1;min-width:0">
            <div class="small">Munição automática</div>
            <div class="tiny dim">usa a de melhor custo-benefício disponível</div>
          </div>
          <button class="sm ${auto ? "primary" : ""}" id="ammo-auto-row">
            ${auto ? "Usando" : "Usar"}</button>
        </div>` : ""}
      <div class="list" style="max-height:330px">
        ${itens.join("") || `<div class="dim tiny" style="padding:10px">Nada nesta categoria.</div>`}
      </div>
      <div class="row mt8" style="gap:6px;align-items:center">
        <span class="tiny dim" style="flex:1">
          ${auto ? "Munição automática (melhor disponível)"
                 : (atual ? `Atual: <b>${itemName(atual)}</b> · ${ammoPrice(atual)} gp/tiro`
                          : "Nenhuma munição escolhida")}
        </span>
        <button class="sm ${auto ? "primary" : ""}" id="ammo-auto">Automática</button>
        <button class="sm" id="ammo-fechar">Fechar</button>
      </div>
    </div>`;

  const fechar = () => $("#modal").classList.remove("show");
  $("#ammo-close").addEventListener("click", fechar);
  $("#ammo-fechar").addEventListener("click", fechar);

  $$("#modal-body [data-ammo-cat]").forEach((t) =>
    t.addEventListener("click", () => {
      AMMO_MODAL.cat = t.dataset.ammoCat;
      desenhaAmmoPicker();
    }));

  const inp = $("#ammo-busca");
  if (inp) inp.addEventListener("input", () => {
    AMMO_MODAL.busca = inp.value;
    desenhaAmmoPicker();
    const n = $("#ammo-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  const chk = $("#ammo-so-lib");
  if (chk) chk.addEventListener("change", () => {
    AMMO_MODAL.soLiberadas = chk.checked;
    desenhaAmmoPicker();
  });

  const ligarAuto = () => {
    p.config.ammoAuto = true;
    const b = bestAmmoFor(p);
    if (b) setActiveAmmo(p, b);
    toast(b ? `Automática: <b>${itemName(b)}</b>` : "Automática ligada.");
    save(); renderAll(); desenhaAmmoPicker();
  };
  const btnAuto = $("#ammo-auto");
  if (btnAuto) btnAuto.addEventListener("click", ligarAuto);
  const rowAuto = $("#ammo-auto-row");
  if (rowAuto) rowAuto.addEventListener("click", ligarAuto);

  $$("#modal-body [data-pick-ammo]").forEach((b) =>
    b.addEventListener("click", () => {
      p.config.ammoAuto = false;
      setActiveAmmo(p, b.dataset.pickAmmo);
      toast(`Munição: <b>${itemName(b.dataset.pickAmmo)}</b>`);
      save(); renderAll(); desenhaAmmoPicker();
    }));

  $$("#modal-body [data-pick-quiver]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.pickQuiver;
      const q = QUIVER_DEFS[slug];
      const naBag = p.bag && p.bag[slug];
      if (!naBag) {
        if (q.drop) { toast("Esse quiver só cai de boss."); return; }
        if (p.gold < q.buy) { toast("Gold insuficiente."); return; }
        spendGold(p, q.buy);
        toast(`<b>${q.n}</b> comprado por <span class="gold-txt">${fmtFull(q.buy)} gp</span>`);
      } else {
        removeItem(p, slug, 1);
        toast(`<b>${q.n}</b> equipado.`);
      }
      // devolve o que estava na mao secundaria (escudo ou quiver antigo)
      if (p.equip.shield) addItem(p, p.equip.shield.item, 1);
      p.equip.shield = { item: slug, count: 1 };
      save(); renderAll(); desenhaAmmoPicker();
    }));
}

/* ============================================================ barra de COMBO
 *
 * Seis caixas em sequencia. Clicar numa caixa abre o modal de escolha; o
 * seletor "N+" que aparece nas de area define o minimo de alvos para o slot
 * disparar. A ordem das caixas e a prioridade da rotacao.
 */
const COMBO_MODAL = { slot: 0, cat: "todas", busca: "" };

const COMBO_CATS = [
  { id: "todas", nome: "Todas" },
  { id: "ataque", nome: "Ataque" },
  { id: "area", nome: "Área" },
  { id: "runas", nome: "Runas" },
];

function renderComboBar(p, el) {
  const combo = ensureCombo(p);
  const usados = combo.filter((x) => x).length;

  el.innerHTML = `
    <div class="row mb8" style="gap:6px;align-items:center">
      <div class="small">Rotação de combate</div>
      <span class="tiny dim">${usados}/${COMBO_SLOTS} slots · a ordem é a prioridade</span>
      <span class="spacer" style="flex:1"></span>
      ${usados ? `<button class="sm" id="combo-limpar-tudo">Limpar tudo</button>` : ""}
    </div>
    <div class="combo-bar">
      ${combo.map((entrada, i) => desenhaComboSlot(p, entrada, i)).join("")}
    </div>
    <div class="tiny dim mt8">
      O motor percorre os slots de cima para baixo e usa o primeiro que
      estiver pronto. Slots de área só disparam com o número de alvos pedido.
    </div>`;

  $$("#helper-combo [data-combo-slot]").forEach((b) =>
    b.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-combo-min]") ||
          ev.target.closest("[data-combo-clear]")) return;
      openComboPicker(parseInt(b.dataset.comboSlot, 10));
    }));
  $$("#helper-combo [data-combo-min]").forEach((sel) =>
    sel.addEventListener("change", () => {
      const i = parseInt(sel.dataset.comboMin, 10);
      if (combo[i]) combo[i].min = parseInt(sel.value, 10) || 1;
      save();
      renderComboBar(p, el);
    }));
  $$("#helper-combo [data-combo-clear]").forEach((b) =>
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      combo[parseInt(b.dataset.comboClear, 10)] = null;
      save();
      renderComboBar(p, el);
    }));
  const lt = $("#combo-limpar-tudo");
  if (lt) lt.addEventListener("click", () => {
    for (let i = 0; i < combo.length; i++) combo[i] = null;
    save();
    renderComboBar(p, el);
  });
}

function desenhaComboSlot(p, entrada, i) {
  const num = `<span class="combo-num">${i + 1}</span>`;
  if (!entrada) {
    return `<div class="combo-slot vazio" data-combo-slot="${i}">
      ${num}
      <div class="combo-add">+</div>
      <div class="tiny dim">vazio</div>
    </div>`;
  }
  const info = comboInfo(entrada);
  if (!info) {
    return `<div class="combo-slot vazio" data-combo-slot="${i}">
      ${num}<div class="tiny dim">indisponível</div></div>`;
  }
  const arte = info.img
    ? `<img src="${info.img}" alt="">`
    : (typeof spellIcon === "function" && info.icon != null
       ? spellIcon({ icon: info.icon, name: info.nome }) : "");

  // o seletor de alvos so faz sentido em area/chain
  const seletor = info.area
    ? `<select class="combo-min" data-combo-min="${i}" title="Alvos mínimos">
         ${[1, 2, 3, 4, 5, 6].map((n) =>
           `<option value="${n}" ${entrada.min === n ? "selected" : ""}>${
             n === 1 ? "1" : n + "+"}</option>`).join("")}
       </select>`
    : `<span class="tiny dim">alvo único</span>`;

  return `<div class="combo-slot" data-combo-slot="${i}">
    ${num}
    <button class="combo-x" data-combo-clear="${i}" title="Remover">✕</button>
    <div class="combo-art">${arte}</div>
    <div class="combo-nome small">${info.nome}</div>
    <div class="tiny dim">${info.tipo}${info.lvl ? " · nv " + info.lvl : ""}</div>
    <div class="combo-alvos">${seletor}</div>
  </div>`;
}

/* ------------------------------------------------- modal de escolha */

function openComboPicker(slot) {
  const p = G.p;
  if (!p) return;
  COMBO_MODAL.slot = slot;
  COMBO_MODAL.busca = "";
  COMBO_MODAL.cat = "todas";
  desenhaComboPicker();
  $("#modal").classList.add("show");
}

/* Junta magias de ataque e runas numa lista so, ja filtrada pela vocacao */
function comboOpcoes(p) {
  const out = [];
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if (s.type !== "attack") continue;
    if (s.vocs.indexOf(p.voc) === -1) continue;
    out.push({ kind: "spell", id: id, s: s, lvl: s.lvl || 1,
               area: !!s.area });
  }
  const runas = typeof suppliesOf === "function"
    ? suppliesOf(p, "attack").map((x) => x[0])
    : Object.keys(SUPPLIES).filter((k) => SUPPLIES[k].type === "attack");
  for (const slug of runas) {
    const s = SUPPLIES[slug];
    if (!s) continue;
    out.push({ kind: "rune", id: slug, s: s, lvl: s.lvl || 1,
               area: !!(s.area && s.area.raio) });
  }
  out.sort((a, b) => a.lvl - b.lvl);
  return out;
}

function desenhaComboPicker() {
  const p = G.p;
  const slot = COMBO_MODAL.slot;
  const combo = ensureCombo(p);
  const atual = combo[slot];
  const busca = (COMBO_MODAL.busca || "").toLowerCase();
  const soLiberadas = !!COMBO_MODAL.soLiberadas;

  let itens = comboOpcoes(p);
  if (COMBO_MODAL.cat === "ataque") itens = itens.filter((o) => o.kind === "spell" && !o.area);
  else if (COMBO_MODAL.cat === "area") itens = itens.filter((o) => o.area);
  else if (COMBO_MODAL.cat === "runas") itens = itens.filter((o) => o.kind === "rune");
  if (busca) {
    itens = itens.filter((o) => {
      const nome = (o.kind === "rune" ? o.s.name : o.s.name).toLowerCase();
      const pal = (o.s.words || "").toLowerCase();
      return nome.indexOf(busca) !== -1 || pal.indexOf(busca) !== -1;
    });
  }
  const liberado = (o) => o.kind === "rune"
    ? (typeof supplyAllowed === "function" ? supplyAllowed(p, o.id) : p.level >= o.lvl)
    : (typeof spellUnlocked === "function" ? spellUnlocked(p, o.s) : p.level >= o.lvl);
  if (soLiberadas) itens = itens.filter(liberado);

  $("#modal-body").innerHTML = `
    <div class="panel-title">⚔ Rotação — slot ${slot + 1} (ordem = prioridade)
      <span style="flex:1"></span>
      <button class="sm" id="combo-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row wrap mb8" style="gap:4px">
        ${COMBO_CATS.map((c) => `<button class="sm ${
          COMBO_MODAL.cat === c.id ? "primary" : ""}"
          data-combo-cat="${c.id}">${c.nome}</button>`).join("")}
      </div>
      <div class="row mb8" style="gap:6px;align-items:center">
        <input id="combo-busca" placeholder="Buscar por nome ou palavra (ex.: exura, fireball)…"
          value="${COMBO_MODAL.busca || ""}"
          style="flex:1;padding:6px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
        <label class="tiny dim" style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" id="combo-so-liberadas" ${soLiberadas ? "checked" : ""}>
          Só liberadas</label>
      </div>
      <div class="list" style="max-height:46vh">
        ${itens.map((o) => linhaComboPicker(p, o, atual, liberado(o))).join("")
          || `<div class="dim tiny" style="padding:10px">Nada com esse filtro.</div>`}
      </div>
      <div class="row mt8" style="gap:6px;align-items:center">
        <span class="tiny dim">Limpar este slot</span>
        <span style="flex:1"></span>
        <button class="sm" id="combo-slot-limpar">Limpar</button>
        <button class="sm primary" id="combo-fechar">Fechar</button>
      </div>
    </div>`;

  const fechar = () => $("#modal").classList.remove("show");
  $("#combo-close").addEventListener("click", fechar);
  $("#combo-fechar").addEventListener("click", fechar);
  $("#combo-slot-limpar").addEventListener("click", () => {
    combo[slot] = null;
    save();
    desenhaComboPicker();
    renderHelper(p);
  });
  const inp = $("#combo-busca");
  inp.addEventListener("input", () => {
    COMBO_MODAL.busca = inp.value;
    desenhaComboPicker();
    const n = $("#combo-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  $("#combo-so-liberadas").addEventListener("change", (e) => {
    COMBO_MODAL.soLiberadas = e.target.checked;
    desenhaComboPicker();
  });
  $$("#modal-body [data-combo-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      COMBO_MODAL.cat = b.dataset.comboCat;
      desenhaComboPicker();
    }));
  $$("#modal-body [data-combo-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      const kind = b.dataset.comboKind;
      const id = b.dataset.comboPick;
      const antigo = combo[slot];
      // mantem o minimo que o jogador ja tinha ajustado, se for a mesma entrada
      const min = (antigo && antigo.id === id) ? antigo.min : 1;
      combo[slot] = { kind: kind, id: id, min: min };
      // runa escolhida precisa existir no mapa de supplies para poder recarregar
      if (kind === "rune" &&
          !Object.prototype.hasOwnProperty.call(p.supplies, id)) p.supplies[id] = 0;
      save();
      desenhaComboPicker();
      renderHelper(p);
    }));
  $$("#modal-body [data-combo-minsel]").forEach((sel) =>
    sel.addEventListener("change", () => {
      if (combo[slot]) combo[slot].min = parseInt(sel.value, 10) || 1;
      save();
      renderHelper(p);
    }));
}

function linhaComboPicker(p, o, atual, ok) {
  const usando = atual && atual.kind === o.kind && atual.id === o.id;
  const s = o.s;
  const el = s.element && typeof ELEMENTS !== "undefined" && ELEMENTS[s.element]
    ? ELEMENTS[s.element] : null;

  let arte, detalhe;
  if (o.kind === "rune") {
    const pw = typeof supplyPowerFor === "function"
      ? supplyPowerFor(p, o.id) : [0, 0];
    arte = `<img src="assets/item/${s.sprite}.png" alt="">`;
    detalhe = `lvl ${o.lvl}${s.ml ? " · ml " + s.ml : ""} · ${
      fmtFull(supplyPrice(s, p.level))}g/uso · cd ${
      Math.round((s.cd || 2000) / 1000)}s · Runa${o.area ? " · Área" : ""}`;
    if (pw[1]) detalhe = `<span style="color:${el ? el.color : "#ff9a4a"}">${
      pw[0]}-${pw[1]}</span> · ` + detalhe;
  } else {
    arte = typeof spellIcon === "function" ? spellIcon(s) : "";
    const faixa = ok && typeof spellRangeText === "function"
      ? spellRangeText(p, s) : "";
    detalhe = `lvl ${o.lvl} · ${s.mana} mana · cd ${
      Math.round((s.cd || 2000) / 1000)}s${o.area ? " · Área" : ""}`;
    if (faixa) detalhe = `<span style="color:${el ? el.color : "#ff9a4a"}">${
      faixa}</span> · ` + detalhe;
  }

  // o seletor de alvos aparece na propria linha quando a entrada esta em uso
  const seletor = (usando && o.area)
    ? `<select class="combo-min" data-combo-minsel="1">
         ${[1, 2, 3, 4, 5, 6].map((n) =>
           `<option value="${n}" ${atual.min === n ? "selected" : ""}>${
             n === 1 ? "1" : n + "+"}</option>`).join("")}
       </select>` : "";

  return `<div class="shop-row ${usando ? "selected" : ""}"
               style="opacity:${ok ? 1 : .45}">
    ${arte}
    <div style="flex:1;min-width:0">
      <div class="small">${s.name}</div>
      ${s.words ? `<div class="tiny dim"><b>${s.words}</b></div>` : ""}
      <div class="tiny dim">${detalhe}</div>
    </div>
    ${seletor}
    <button class="sm ${usando ? "primary" : ""}" data-combo-pick="${o.id}"
      data-combo-kind="${o.kind}" ${ok ? "" : "disabled"}>${
      usando ? "Em uso" : "Usar"}</button>
  </div>`;
}
