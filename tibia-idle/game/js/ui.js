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
  $("#p-voc").textContent = VOCATIONS[p.voc].name;

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
        <span class="v">${baseLvl}${bonus > 0 ? ` <span style="color:#7ae87a">+${bonus}</span>` : ""}</span>
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
    el.addEventListener("mouseenter", () =>
      showTip(itemTip(slug, "Clique para desequipar")));
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", () => {
      addItem(G.p, slug, 1);
      delete G.p.equip[el.dataset.slot];
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
  const entries = Object.keys(p.bag).sort((a, b) => {
    const A = GAMEDATA.items[a], B = GAMEDATA.items[b];
    return (B ? B.sell || 0 : 0) - (A ? A.sell || 0 : 0);
  });
  if (!entries.length) {
    $("#inv").innerHTML = `<div class="dim small center" style="padding:14px">Mochila vazia</div>`;
    return;
  }
  $("#inv").innerHTML = entries.map((slug) =>
    `<div class="inv-item" data-item="${slug}">${itemImg(slug)}
      ${p.bag[slug] > 1 ? `<span class="cnt">${p.bag[slug]}</span>` : ""}
    </div>`).join("");
  $$("#inv .inv-item").forEach((el) => {
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
        const old = G.p.equip[it.s];
        if (old) addItem(G.p, old.item, 1);
        removeItem(G.p, slug, 1);
        G.p.equip[it.s] = { item: slug, count: 1 };
        const w = GAMEDATA.items[slug];
        if (w.th && G.p.equip.shield) {
          addItem(G.p, G.p.equip.shield.item, 1);
          delete G.p.equip.shield;
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

function renderSupplies(p) {
  let h = "";
  for (const slug in SUPPLIES) {
    const s = SUPPLIES[slug];
    const have = p.supplies[slug] || 0;
    h += `<div class="row" style="justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.25)">
      <div class="row" style="gap:5px;min-width:0">
        <img src="assets/item/${s.sprite}.png" style="width:22px;height:22px" alt="">
        <div style="min-width:0">
          <div class="tiny" style="color:#c8c0a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
          <div class="tiny dim">${s.price} gp · tem ${have}</div>
        </div>
      </div>
      <div class="row" style="gap:2px">
        <button class="sm" data-buy="${slug}" data-n="10">10</button>
        <button class="sm" data-buy="${slug}" data-n="100">100</button>
      </div>
    </div>`;
  }
  $("#supplies").innerHTML = h;
  $$("#supplies [data-buy]").forEach((b) => {
    b.addEventListener("click", () => {
      const slug = b.dataset.buy, n = parseInt(b.dataset.n, 10);
      const s = SUPPLIES[slug];
      const cost = s.price * n;
      if (G.p.gold < cost) { toast("Ouro insuficiente", ""); return; }
      G.p.gold -= cost;
      G.p.supplies[slug] = (G.p.supplies[slug] || 0) + n;
      addLog("sell", `Comprou ${n}x ${s.name} por ${fmtFull(cost)} gp`);
      renderAll();
    });
  });
}

function renderTopbar(p) {
  $("#gold").textContent = fmtFull(p.gold);
  const c = G.combat;
  if (c && c.stats.time > 3000) {
    const hrs = c.stats.time / 3600000;
    $("#xph").textContent = fmt(c.stats.exp / hrs);
    $("#gph").textContent = fmt((c.stats.gold - c.stats.supplyCost) / hrs);
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
      if (G.inCity && !G.combat && G.walker) {
        if (G.walker.goToNpc(id)) openNpc(id);
      } else {
        openNpc(id);
      }
    }));
}

function renderSpells(p) {
  const list = [];
  for (const id in SPELLS) {
    const s = SPELLS[id];
    if (s.vocs.indexOf(p.voc) === -1) continue;
    list.push([id, s]);
  }
  list.sort((a, b) => a[1].lvl - b[1].lvl);
  if (!list.length) {
    $("#spells").innerHTML = `<div class="dim small center" style="padding:10px">Escolha uma vocação para aprender magias.</div>`;
    return;
  }
  $("#spells").innerHTML = list.map(([id, s]) => {
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
