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
  const loc = (typeof i18nLang === "function" && i18nLang() === "en") ? "en-US" : "pt-BR";
  return Math.floor(n || 0).toLocaleString(loc);
}
/* Numero de dano na tela: o client original mostra o valor inteiro puro
 * (ex: 1500), sem abreviar em "1.5k" nem separador de milhar. */
function fmtDmg(n) {
  return String(Math.floor(n || 0));
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = sec % 60;
  if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
  if (m > 0) return m + "m " + String(s).padStart(2, "0") + "s";
  return s + "s";
}
/* Contagem regressiva curta estilo Tibia: 45s / 1m30s / 1h5m / 2h */
function fmtShortDuration(sec) {
  sec = Math.max(0, Math.ceil(Number(sec) || 0));
  if (sec < 60) return sec + "s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return m > 0 ? (h + "h" + m + "m") : (h + "h");
  return s > 0 ? (m + "m" + s + "s") : (m + "m");
}
function itemName(slug) {
  const it = GAMEDATA.items[slug];
  return it ? it.n : slug;
}
/* itemImg vive em weapons.js: ele sabe desenhar as sprites animadas.
 * A versao que existia aqui sobrescrevia a de la (ui.js carrega depois) e
 * era a causa de TODOS os itens animados aparecerem estaticos. */

/* Brilho do item de potion/runa no Helper quando ela e consumida.
 *
 * O evento "heal"/"mana" do combate chega pelo drainEvents e chama aqui:
 * a linha do supply correspondente pisca (verde = cura, azul = mana) por
 * ~900ms. Fora de combate a funcao simplesmente nao acha a linha e some
 * sem erro. O reflow forçado reinicia a animacao quando dois goles saem
 * quase juntos (spirit potion cura HP e mana no mesmo segundo). */
function helperSupplyFlash(slug, kind) {
  if (!slug) return;
  const row = document.querySelector(
    `.helper-supply-row[data-supply-slug="${slug}"]`);
  if (!row) return;
  const cls = kind === "mana" ? "flash-mana" : "flash-heal";
  row.classList.remove("flash-heal", "flash-mana");
  void row.offsetWidth;              // reinicia a animacao CSS
  row.classList.add(cls);
  setTimeout(() => row.classList.remove(cls), 950);
}

/* ------------------------------------------------------------ toasts */
function toast(msg, kind) {
  if(typeof G!=="undefined"&&G&&G._silentCombat)return;
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

/* Liga qualquer slot de loot ao mesmo tooltip completo usado pelos itens
 * equipados e pela mochila. `extra` acrescenta apenas o contexto do drop;
 * atributos, requisitos, classificação, augments e imbuements vêm de
 * itemTip(), sem uma segunda descrição simplificada para manter. */
function bindFullItemTooltip(el, slug, extra, slot, instId) {
  if (!el || !slug) return;
  el.addEventListener("mouseenter", () =>
    showTip(itemTip(slug, extra || "", slot || null, instId || null)));
  el.addEventListener("mouseleave", hideTip);
}

/* Linha de resistência no estilo TibiaWiki: ícone oficial do elemento
 * (assets/ui/damage) + valor assinado (0%, +10%, -5%, 100% imune) + barra.
 * Fraqueza em vermelho, resistência em verde, imune em verde-claro,
 * neutro em cinza. Usada no modal de bosses e nas hunts. */
function resistRowHtml(el, value) {
  const info = ELEMENTS[el] || ELEMENTS.physical;
  const v = Number(value) || 0;
  const weak = v < 0, immune = v >= 100;
  const pct = (immune ? "" : v > 0 ? "+" : "") + v + "%";
  const color = weak ? "#e85b52" : immune ? "#37d45b" : (v > 0 ? "#80d64a" : "#9a948a");
  const width = Math.max(8, Math.min(100, 50 + v / 2));
  const icon = typeof dmgIconImg === "function" ? dmgIconImg(el, 13) : "";
  const label = `${info.name}: ${pct}` + (immune ? " — imune" : weak ? " — fraqueza" : "");
  return `<div class="hunt-best-res resist-row ${weak ? "weak" : immune ? "immune" : v > 0 ? "strong" : "neutral"}"
    title="${label}">
    <span class="resist-icon">${icon}</span>
    <span class="resist-val" style="color:${color}">${pct}</span>
    <i><b style="width:${width}%;background:${color}"></b></i>
  </div>`;
}

/* Tooltip de drop (boss/hunt): NOME do item + % de chance em destaque logo
 * abaixo do nome, seguido do corpo do tooltip completo do item (sem repetir
 * o nome). Garante nome+chance mesmo quando o item não está no catálogo. */
function dropTooltipHtml(slug, bossName, drop) {
  const it = GAMEDATA.items[slug];
  const name = (it && it.n) ? it.n : slug;
  const chance = Number(drop && drop.chance);
  const max = Math.max(1, Number(drop && drop.max) || 1);
  let h = `<div class="tt-name">${name}</div>`;
  h += `<div class="tt-stat" style="color:#dab0ff">Drop de ${bossName || "boss"} · ${
    Number.isFinite(chance) ? chance : "?"}% de chance${max > 1 ? ` · até ${max}x` : ""}</div>`;
  try {
    if (typeof itemTip === "function" && it) {
      const full = itemTip(slug, "");
      const endName = full.indexOf("</div>");
      if (endName !== -1) h += full.slice(endName + 6);
    }
  } catch (e) { /* o cabeçalho nome+chance já está montado */ }
  return h;
}

/* Tooltip completo de um item.
 *
 * Mostra na ordem do client: ataque (fisico + elemento), bonus de skill,
 * mantra, resistencias, augments e os slots de imbuement. O slot vazio
 * aparece como um quadrado tracejado; o preenchido mostra o icone oficial,
 * o nome do imbuement e quanto tempo falta.
 *
 * `slot` e opcional: so quando o item esta EQUIPADO da para saber quais
 * imbuements ele carrega, porque eles moram na instancia do item
 * (p.imbuements["inst:<instId>"]) quando houver instancia.
 */
function itemTip(slug, extra, slot, instId) {
  const it = GAMEDATA.items[slug];
  if (!it) return slug;
  const p = G.p;
  let h = `<div class="tt-name">${it.n}</div>`;

  // ---- ataque: fisico e a parte convertida em elemento
  const st = [];
  if (it.atk || it.elDmg) {
    const el = it.el && typeof ELEMENTS !== "undefined" ? ELEMENTS[it.el] : null;
    let linha = "Ataque " + (it.atk || 0);
    if (it.elDmg && el) {
      linha += ` <span style="color:${el.color}">+ ${it.elDmg} ${el.name}</span>`;
    }
    st.push(linha);
  }
  if (it.s === "ammo") st.push((it.ammoKind === "bolt" ? "Bolt (besta)" : "Flecha (arco)") + " · " + fmtFull(ammoPrice(slug)) + " gp/tiro");
  if (it.cap) st.push("Capacidade quiver " + it.cap);
  // Perfect Shot (TibiaWiki): dano extra fixo a uma distância EXATA
  if (it.shotDmg) {
    st.push(`<span style="color:#ffe680">Perfect shot: +${it.shotDmg} de dano a ${it.shotRange} SQM</span>`);
  }
  if (it.def) st.push("Defesa " + it.def + (it.extraDef ? ` (+${it.extraDef})` : ""));
  if (it.arm) st.push("Armadura " + it.arm);
  if (it.mdmg) st.push("Dano mágico " + (it.dmgMin ? `${it.dmgMin}–${it.dmgMax}` : it.mdmg));

  // ---- bonus de skill do proprio item
  const skills = [];
  for (const [campo, nome] of [["sword", "Espada"], ["axe", "Machado"],
       ["club", "Clava"], ["dist", "Distância"], ["shield", "Escudo"],
       ["fist", "Punho"], ["melee", "Melee"], ["mag", "Magic level"]]) {
    if (it[campo]) skills.push(`${nome} +${it[campo]}`);
  }
  if (skills.length) st.push(skills.join(" · "));

  // ---- mantra: a armadura elemental do Monk
  if (it.mantra) {
    st.push(`<span style="color:#7ec8ff">Mantra ${it.mantra}</span>`);
  }
  // ---- elemental bond: o elemento que a arma impoe as magias
  if (it.bond && typeof ELEMENTS !== "undefined" && ELEMENTS[it.bond]) {
    const eb = ELEMENTS[it.bond];
    st.push(`Elemental Bond: <span style="color:${eb.color}">${eb.name}</span>`);
  }

  if (it.prot) st.push("Proteção " + it.prot + "%");
  // Elemental Pierce (TibiaWiki): aumenta a sensibilidade do alvo
  if (it.pierce) {
    const ps = Object.keys(it.pierce).map((e) => {
      const d = typeof ELEMENTS !== "undefined" ? ELEMENTS[e] : null;
      return `<span style="color:#7ec8ff">${it.pierce[e]}% ${
        d ? d.name : e} pierce</span>`;
    });
    st.push(ps.join(" · "));
  }
  // resistencias por elemento, cada uma na sua cor e com o ícone oficial
  // do tipo de dano (TibiaWiki/Damage)
  if (it.res) {
    const rs = Object.keys(it.res).map((e) => {
      const d = typeof ELEMENTS !== "undefined" ? ELEMENTS[e] : null;
      return `<span style="color:${d ? d.color : "#ccc"}">${
        typeof dmgIconImg === "function" ? dmgIconImg(e, 10) : ""}${
        it.res[e] > 0 ? "+" : ""}${it.res[e]}% ${d ? d.name : e}</span>`;
    });
    st.push(rs.join(" · "));
  }
  if (it.lifeLeech) st.push(`Life leech ${it.lifeLeech}%`);
  if (it.manaLeech) st.push(`Mana leech ${it.manaLeech}%`);
  if (it.hpreg) st.push("Regen. vida +" + it.hpreg);
  if (it.mpreg) st.push("Regen. mana +" + it.mpreg);
  if (it.spd) st.push("Velocidade +" + it.spd);
  if (it.th) st.push("Duas mãos");
  // Cargas de anéis/amuletos/boots por tempo (ou por golpe). Equipado: saldo + tempo.
  if (it.charges && (it.s === "ring" || it.s === "amulet" || it.s === "boots")) {
    const modo = it.chargeMode === "hits"
      ? "1 carga por golpe recebido" : "1 carga a cada 3s enquanto equipado";
    let linha = `⚡ ${it.charges} cargas · ${modo}`;
    if (it.chargeMode !== "hits" && it.durationSec) {
      linha = `⏱ ${typeof fmtShortDuration === "function" ? fmtShortDuration(it.durationSec) : (it.durationSec + "s")} · ${modo}`;
    } else if (it.chargeMode !== "hits") {
      linha = `⏱ ${typeof fmtShortDuration === "function" ? fmtShortDuration(it.charges * 3) : ((it.charges * 3) + "s")} · ${modo}`;
    }
    if (p && p.equip && slot && p.equip[slot] && p.equip[slot].item === slug &&
        typeof accessoryChargesNow === "function") {
      const cg = accessoryChargesNow(p, slot);
      if (cg) {
        if (cg.mode === "hits") {
          linha = `⚡ ${cg.now}/${cg.max} cargas (equipado) · ${modo}`;
        } else {
          const t = typeof fmtShortDuration === "function"
            ? fmtShortDuration(cg.remSec) : (cg.remSec + "s");
          linha = `⏱ ${t} restantes (${cg.now}/${cg.max}) · ${modo}`;
        }
      }
    }
    st.push(`<span style="color:#ffe680">${linha}</span>`);
  }
  if (st.length) h += `<div class="tt-stat">${st.join("<br>")}</div>`;

  // ---- augments: bonus por magia especifica (TibiaWiki/Augments)
  if (it.aug && it.aug.length) {
    h += `<div class="tt-aug"><div class="tt-sub">Augments</div>` +
      it.aug.map((a) => `<div class="tiny" style="color:#9ce84a">▸ ${
        typeof augmentLabel === "function" ? augmentLabel(a) : (a.s + " +" + a.v + "% " + (a.k || ""))
      }</div>`).join("") + `</div>`;
  }

  // ---- imbuements: um quadrado por slot
  if (it.imbSlots) {
    h += imbSlotsTip(p, slug, slot, it.imbSlots);
  }

  if (it.cls) h += `<div class="tt-req">Classificação ${it.cls}${
    typeof FORGE_MAX_TIER !== "undefined" && FORGE_MAX_TIER[it.cls]
      ? ` · máx T${FORGE_MAX_TIER[it.cls]}` : ""}</div>`;

  // ---- Forja: tier do item (instância primeiro, legado p.forge depois) e o
  // bônus real que ele está dando ao personagem, ex.: "Transcendence: +0,28%"
  let ftier = 0;
  let fInst = null;
  const insts = (p && p.itemInstances) || [];
  if (instId) {
    fInst = insts.find((i) => i.id === instId) || null;
  } else if (slot && p && p.equip && p.equip[slot] && p.equip[slot].instId) {
    fInst = insts.find((i) => i.id === p.equip[slot].instId) || null;
  }
  if (fInst && typeof itemInstanceTier === "function") {
    ftier = itemInstanceTier(fInst) || 0;
  } else if (p && p.forge && p.forge[slug]) {
    ftier = p.forge[slug] || 0;   // saves antigos / itens empilhados
  }
  if (ftier) {
    h += `<div class="tt-req" style="color:#ffe680">Forja: Tier ${ftier}</div>`;
    if (it.s && typeof forgeEffectForSlot === "function") {
      const ef = forgeEffectForSlot(it.s, ftier, p);
      if (ef && ef.chance > 0) {
        h += `<div class="tt-req" style="color:#d4af37">${ef.name}: +${
          ef.chance.toFixed(2).replace(".", ",")}%</div>`;
      }
    }
  }
  if (it.lvl) h += `<div class="tt-req">Requer nível ${it.lvl}</div>`;
  if (it.vocs) h += `<div class="tt-req">Vocação: ${it.vocs.join(", ")}</div>`;
  if (it.w) h += `<div class="tt-req">Peso ${it.w.toFixed(2)} oz</div>`;
  if (it.desc) h += `<div class="tiny dim mt4">${it.desc}</div>`;
  if (it.sell) h += `<div class="tt-sell">Vende por ${fmtFull(it.sell)} gp</div>`;
  if (extra) h += `<div class="dim tiny mt4">${extra}</div>`;
  return h;
}

/* Os quadradinhos de imbuement do tooltip.
 *
 * Vazio = moldura tracejada. Preenchido = icone oficial do client, nome e
 * tempo restante. O tempo fica vermelho na ultima hora, para o jogador
 * perceber que precisa renovar. */
function imbSlotsTip(p, slug, slot, total) {
  const lista = (p && slot && typeof imbOf === "function") ? imbOf(p, slot) : [];
  const agora = Date.now();
  let h = `<div class="tt-imb"><div class="tt-sub">Imbuements (${
    lista.length}/${total})</div><div class="tt-imb-row">`;
  for (let i = 0; i < total; i++) {
    const im = lista[i];
    if (!im) {
      h += `<div class="imb-slot vazio" title="Slot de imbuement vazio"></div>`;
      continue;
    }
    const v = typeof imbVisual === "function" ? imbVisual(im)
      : { nome: "?", icon: 0 };
    const restante = typeof imbRestante === "function"
      ? imbRestante(im, agora) : 0;
    const venceu = restante <= 0;
    const urgente = !venceu && restante < 3600000;   // menos de 1h
    const tempo = typeof imbTempoTexto === "function"
      ? imbTempoTexto(restante) : "";
    h += `<div class="imb-slot ${venceu ? "expirado" : ""}"
      title="${v.nome} ${IMB_TIER_NOME[(im.tier || 1) - 1] || ""}">
      <img src="assets/imbuement/${v.icon}.png" alt="">
      <span class="imb-tempo ${urgente ? "urgente" : ""}">${tempo}</span>
    </div>`;
  }
  h += `</div>`;
  // detalhe textual de cada imbuement aplicado
  for (const im of lista) {
    const v = typeof imbVisual === "function" ? imbVisual(im) : { nome: "?" };
    const efeito = typeof imbEfeitoTexto === "function" ? imbEfeitoTexto(im) : "";
    const restante = typeof imbRestante === "function" ? imbRestante(im) : 0;
    h += `<div class="tiny ${restante <= 0 ? "dim" : ""}">
      ${v.nome} ${IMB_TIER_NOME[(im.tier || 1) - 1] || ""}${efeito ? ` · ${efeito}` : ""}
      · <span class="${restante > 0 && restante < 3600000 ? "imb-urgente" : "dim"}">${
        typeof imbTempoTexto === "function" ? imbTempoTexto(restante) : ""}</span>
    </div>`;
  }
  return h + `</div>`;
}

/* ------------------------------------------------------------ log */
function addLog(kind, html) {
  if(typeof G!=="undefined"&&G&&G._silentCombat)return;
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
  if (!p) return;
  // faixa de conditions/buffs ativos (ícones OTC, mesma fonte da status-bar)
  if (typeof paintConditionBar === "function") paintConditionBar($("#cond-bar"), p, false);

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

  // Barra de vida/mana com o valor CHEIO (10150, não "10.1k") — como o
  // client oficial mostra o número inteiro no tooltip da barra.
  setBar("#bar-hp", p.hp / max.hp, `${Math.floor(p.hp)} / ${Math.floor(max.hp)}`);
  setBar("#bar-mp", max.mp ? p.mp / max.mp : 0,
         max.mp ? `${Math.floor(p.mp)} / ${Math.floor(max.mp)}` : "");
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
  const statRows = $("#stat-rows");
  if (statRows) statRows.innerHTML = rows.map(
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
  // HP bar: cor dinâmica conforme % (verde > amarelo > laranja > vermelho)
  const fill = el.querySelector(".fill");
  if (fill && fill.classList.contains("hp")) {
    const hpColor = hpBarColor(pct);
    fill.style.background = hpColor.grad;
    l.style.color = hpColor.text;
  }
}

/* Cor da barra de HP conforme % — igual ao Tibia real */
function hpBarColor(pct) {
  if (pct > 0.6)  return {
    grad: "linear-gradient(180deg, #4ade80, #16a34a)",
    text: "#4ade80",
  };
  if (pct > 0.3)  return {
    grad: "linear-gradient(180deg, #facc15, #ca8a04)",
    text: "#facc15",
  };
  if (pct > 0.1)  return {
    grad: "linear-gradient(180deg, #fb923c, #ea580c)",
    text: "#fb923c",
  };
  return {
    grad: "linear-gradient(180deg, #f87171, #dc2626)",
    text: "#f87171",
  };
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
    // Valor principal = TOTAL efetivo; +bonus fica muted (detalhe no tooltip).
    h += `<div class="mb4 skill-row" data-skill="${k}" style="cursor:help">
      <div class="row small" style="justify-content:space-between">
        <span class="k">${SKILL_NAMES[k]}</span>
        <span class="v"><b>${lvl}</b>${bonus > 0 ? ` <span class="dim">+${bonus}</span>` : ""} <span class="dim">${prog.toFixed(1)}%</span></span>
      </div>
      <div class="bar" style="height:8px"><div class="fill skl" style="width:${prog}%"></div></div>
    </div>`;
  }
  $("#skills").innerHTML = h;
  $$("#skills .skill-row").forEach((el) => {
    const k = el.dataset.skill;
    el.addEventListener("mouseenter", () => {
      const name = SKILL_NAMES[k] || k;
      const tip = (typeof skillBreakdownText === "function")
        ? skillBreakdownText(p, k) : "";
      showTip(`<div class="tt-name">${name}</div>` +
        (tip ? `<div class="tiny dim mt4" style="max-width:300px">${tip}</div>` : ""));
    });
    el.addEventListener("mouseleave", hideTip);
  });
}

const SLOT_LABELS = {
  helmet: "elmo", amulet: "colar", backpack: "bolsa", armor: "corpo",
  weapon: "arma", shield: "escudo", legs: "pernas", boots: "botas",
  ring: "anel", extra: "extra", ammo: "muni",
};
/* Layout do inventário no padrão solicitado:
 *   colar | helmet | bag
 *   arma  | armor  | shield
 *   ring  | legs   | extra slot
 *   CAP   | boots  | ammo */
const SLOT_ORDER = [
  "amulet", "helmet", "backpack",
  "weapon", "armor", "shield",
  "ring", "legs", "extra",
  "cap", "boots", "ammo",
];

function renderEquip(p) {
  if (typeof ensurePlayerCapacity === "function") ensurePlayerCapacity(p);
  let h = "";
  for (const slot of SLOT_ORDER) {
    if (!slot) { h += `<div></div>`; continue; }
    if (slot === "cap") {
      const max = typeof maxStats === "function" ? maxStats(p).cap : (p.cap || 5000);
      const free = typeof freeCapacity === "function" ? freeCapacity(p) : max;
      const label = (typeof t === "function" && t("equip.cap")) || "CAP";
      const full = free <= 0;
      h += `<div class="slot cap-slot${full ? " cap-full" : ""}" data-slot="cap" title="${label}: ${fmt(free)} / ${fmt(max)}">
        <span class="cap-label">${label}:</span>
        <span class="cap-value">${fmt(free)}</span>
      </div>`;
      continue;
    }
    const e = p.equip[slot];
    if (e) {
      const cnt = slot === "ammo" ? "∞" : e.count;
      const tierTxt = typeof forgeTierTextForEntry === "function" ? forgeTierTextForEntry(e) : forgeTierText(e.item);
      const tierCls = typeof forgeTierClassForEntry === "function" ? forgeTierClassForEntry(e) : forgeTierClass(e.item);
      // anel/amuleto equipado: Canary usa transformEquipTo (sprite ativo).
      // Sem glow amarelo no slot — só o sprite transformado / filtro neutro.
      const glow = (slot === "ring" || slot === "amulet") ? " acc-active" : "";
      const showSlug = (typeof accessoryDisplaySlug === "function")
        ? accessoryDisplaySlug(e.item, true) : e.item;
      const chg = (typeof accessoryChargesNow === "function") ? accessoryChargesNow(p, slot) : null;
      let chgTxt = "";
      if (chg) {
        if (chg.mode === "hits") {
          chgTxt = `<span class="cnt charge-cnt" data-charge-overlay="hits">${chg.now}</span>`;
        } else {
          const t = typeof fmtShortDuration === "function"
            ? fmtShortDuration(chg.remSec) : (chg.remSec + "s");
          chgTxt = `<span class="cnt charge-cnt item-tempo" data-charge-overlay="time">${t}</span>`;
        }
      } else if (cnt && cnt !== 1) {
        chgTxt = `<span class="cnt">${cnt}</span>`;
      }
      h += `<div class="slot ${itemClsBorder(e.item)} ${tierCls}${glow}" data-slot="${slot}" data-item="${e.item}">
        ${itemImg(showSlug, 0, null, e.count || 1)}${tierTxt ? `<span class="tier-badge ${tierCls}">${tierTxt}</span>` : ""}${chgTxt}
      </div>`;
    } else if (slot === "shield" && p.equip.weapon &&
               (p.voc === "knight" || p.voc === "elite knight" || p.voc === "monk") &&
               (GAMEDATA.items[p.equip.weapon.item] || {}).th) {
      // Armas de duas mãos ocupam a mão secundária apenas VISUALMENTE. Não
      // criamos p.equip.shield: logo nenhum atributo/imbuement é aplicado.
      const weapon = p.equip.weapon.item;
      h += `<div class="slot two-hand-shadow" data-label="duas mãos" title="Arma de duas mãos — visual no escudo">${itemImg(weapon)}</div>`;
    } else {
      h += `<div class="slot empty" data-slot="${slot}" data-label="${SLOT_LABELS[slot]}"></div>`;
    }
  }

  $("#equip").innerHTML = h;

  $$("#equip .slot").forEach((el) => {
    const slotDrop = el.dataset.slot;
    if (slotDrop === "cap") return;
    if (typeof bindDrop === "function") {
    bindDrop(el, (payload) => {
      if (payload && payload.source === "stash" && typeof persistEquipFromSupplyStash === "function") {
        persistEquipFromSupplyStash(G.p, payload.slug, slotDrop);
        return false;
      }
      // Online em combate: pouch→equip precisa do equip autoritativo (senão o
      // tick restaura a pouch e o item "volta"). Fora de combate o caminho
      // local+save continua (bag/equip são do cliente no PUT de cidade).
      if (payload && (payload.source === "pouch" || payload.source === "bag") &&
          typeof persistEquipFromContainer === "function" &&
          typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
        persistEquipFromContainer(G.p, payload.slug, payload.source, slotDrop, payload.instId || null);
        return false;
      }
      return typeof moveItemToEquip === "function" && moveItemToEquip(G.p, payload, slotDrop);
    });
    }
    const slug = el.dataset.item;
    if (!slug) return;
    if (typeof bindItemDrag === "function") bindItemDrag(el, { source: "equip", slug: slug, slot: slotDrop, instId: p.equip[slotDrop] && p.equip[slotDrop].instId ? p.equip[slotDrop].instId : null });
    el.addEventListener("mouseenter", () => {
      const slot = el.dataset.slot;
      const extra = slot === "backpack" ? `${GAMEDATA.items[slug] ? GAMEDATA.items[slug].n : "Bag"} · ${bagSlots(p)} slots` :
        slot === "shield" && (GAMEDATA.items[slug] || {}).t === "quiver"
          ? `Aljava na mão secundária. Munição: ${p.equip.ammo ? itemName(p.equip.ammo.item) + " · " + fmtFull(ammoPrice(p.equip.ammo.item)) + " gp/tiro" : "nenhuma"}` :
        slot === "extra" ? "Extra Slot: ferramentas bônus com resistência elemental" :
        slot === "ammo" ? `Munição no quiver · ${fmtFull(ammoPrice(slug))} gp/tiro` :
        "Clique para desequipar";
      // passa o slot: e por ele que imbOf() encontra os imbuements do item
      // (e o instId resolve o tier da instância para o bônus da forja)
      showTip(itemTip(slug, extra, slot, p.equip[slot] && p.equip[slot].instId));
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", () => {
      const slot = el.dataset.slot;
      if (slot === "backpack") {
        const bp = p.equip && p.equip.backpack;
        if (!bp || bp.item === "bag") { toast("A bag padrão de 8 slots não pode ser removida."); return; }
        if (typeof unequipToContainer === "function" && unequipToContainer(p, "backpack", "bag")) {
          renderAll();
        }
        return;
      }
      if (slot === "ammo") { setActiveAmmo(G.p, null); hideTip(); renderAll(); return; }
      // Instância online: desequip autoritativo (senão o tick restaura o slot).
      if (typeof persistUnequipFromContainer === "function" &&
          typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
        persistUnequipFromContainer(G.p, slot, "bag");
        hideTip();
        return;
      }
      if (typeof unequipToContainer === "function") {
        if (!unequipToContainer(G.p, slot, "bag")) return;
      } else {
        if (!addItem(G.p, slug, 1)) {
          toast("Mochila cheia."); return;
        }
        if (slot === "shield" && (GAMEDATA.items[slug] || {}).t === "quiver") {
          setActiveAmmo(G.p, null);
        }
        delete G.p.equip[slot];
      }
      hideTip();
      renderAll();
    });
  });
}

/* Atualiza só o overlay de tempo/cargas nos slots (HUD tick) — sem rebind.
 * Se o DOM ainda mostra um item que já quebrou no save, re-renderiza o equip. */
function refreshEquipChargeOverlays(p) {
  if (!p || !p.equip || typeof accessoryChargesNow !== "function") return;
  const root = $("#equip");
  if (!root) return;
  let stale = false;
  root.querySelectorAll(".slot[data-slot][data-item]").forEach((el) => {
    const slot = el.dataset.slot;
    const live = p.equip[slot] && p.equip[slot].item;
    if (!live || live !== el.dataset.item) {
      stale = true;
      return;
    }
    const cg = accessoryChargesNow(p, slot);
    let ov = el.querySelector("[data-charge-overlay]");
    if (!cg) {
      if (ov) ov.remove();
      return;
    }
    const txt = cg.mode === "hits"
      ? String(Math.max(0, cg.now | 0))
      : (typeof fmtShortDuration === "function" ? fmtShortDuration(cg.remSec) : (cg.remSec + "s"));
    const mode = cg.mode === "hits" ? "hits" : "time";
    if (!ov) {
      ov = document.createElement("span");
      ov.className = "cnt charge-cnt" + (mode === "time" ? " item-tempo" : "");
      ov.dataset.chargeOverlay = mode;
      el.appendChild(ov);
    } else {
      ov.dataset.chargeOverlay = mode;
      ov.classList.toggle("item-tempo", mode === "time");
    }
    if (ov.textContent !== txt) ov.textContent = txt;
  });
  if (stale && typeof renderEquip === "function") {
    try { renderEquip(p); } catch (err) { /* UI opcional */ }
  }
}

/* ------------------------------------------------------------ status bar
 * Barra de status estilo Tibia/OTC: ícones de condições especiais logo abaixo
 * dos equipamentos e também em #cond-bar (sob HP/mana), com overlay de duração.
 * Fonte: TibiaWiki Special Conditions + assets/ui/conditions/*.png.
 */

function conditionTurnsLabel(c) {
  if (!c) return "";
  if (c.until) {
    const left = Math.max(0, Math.ceil((Number(c.until) - Date.now()) / 1000));
    if (!left) return "";
    return typeof fmtShortDuration === "function" ? fmtShortDuration(left) : (left + "s");
  }
  const turns = Math.max(0, Math.floor(Number(c.turns) || 0));
  if (!turns) return "";
  const sec = turns * 2;
  return typeof fmtShortDuration === "function" ? fmtShortDuration(sec) : (sec + "s");
}

function conditionIconSlug(tipo, fallback) {
  const wiki = (typeof WIKI_CONDITIONS !== "undefined") ? WIKI_CONDITIONS[tipo] : null;
  if (wiki && wiki.icon) return wiki.icon;
  const map = (typeof CONDITION_ICON_SLUG !== "undefined") ? CONDITION_ICON_SLUG : {};
  if (map[tipo]) return map[tipo];
  if (fallback) return fallback;
  const raw = String(tipo || "");
  if (raw.indexOf("cond-") === 0) return raw;
  return raw ? ("cond-" + raw) : "";
}

function collectConditionBarItems(p) {
  const agora = Date.now();
  const itens = [];
  if (!p) return itens;

  const push = (icon, nome, desc, tipo, tempo) => {
    const meta = (typeof WIKI_CONDITION_ICONS !== "undefined") ? WIKI_CONDITION_ICONS[icon] : null;
    itens.push({
      icon: icon,
      nome: nome || (meta && meta.nome) || icon,
      desc: desc || (meta && meta.desc) || "",
      tipo: tipo || (meta && meta.tipo) || "harmful",
      tempo: tempo || "",
    });
  };

  if (p.conditions) {
    const keys = typeof conditionList === "function" ? conditionList(p) : Object.keys(p.conditions);
    for (const t of keys) {
      const c = p.conditions[t];
      if (!c) continue;
      const wiki = (typeof WIKI_CONDITIONS !== "undefined") ? WIKI_CONDITIONS[t] : null;
      const d = (typeof CONDITIONS !== "undefined") ? CONDITIONS[t] : null;
      push(conditionIconSlug(t), (wiki && wiki.nome) || (d && d.nome) || t,
        (wiki && wiki.desc) || "", (wiki && wiki.tipo) || "harmful", conditionTurnsLabel(c));
    }
  }

  if (typeof isMagicShieldActive === "function" && isMagicShieldActive(p, agora)) {
    const src = typeof magicShieldSource === "function" ? magicShieldSource(p, agora) : "Magic Shield";
    const meta = (typeof WIKI_CONDITION_ICONS !== "undefined")
      ? WIKI_CONDITION_ICONS["cond-magic-shield"] : null;
    push("cond-magic-shield", "Magic Shield",
      meta ? meta.desc : "O personagem perde mana em vez de vida quando é ferido.",
      "neutral", src);
  }

  if (typeof hasteAtiva === "function") {
    const hs = hasteAtiva(p, agora);
    if (hs) {
      const meta = (typeof WIKI_CONDITION_ICONS !== "undefined")
        ? WIKI_CONDITION_ICONS["cond-haste"] : null;
      push("cond-haste", "Haste — " + hs.nome,
        meta ? meta.desc : "Faz o personagem se mover mais rápido.",
        "positive", typeof fmtShortDuration === "function"
          ? fmtShortDuration(Math.max(0, (hs.ate - agora) / 1000))
          : Math.max(0, Math.ceil((hs.ate - agora) / 1000)) + "s");
    }
  }

  if (typeof buffTotals === "function") {
    const bt = buffTotals(p, agora);
    for (const b of bt.lista) {
      const def = (typeof BUFFS !== "undefined" && BUFFS[b.chave]) ? BUFFS[b.chave] : null;
      push("cond-strengthened", b.nome,
        (def && def.desc) ? def.desc : "Bônus de skill ativo por um período.",
        "positive", typeof fmtShortDuration === "function"
          ? fmtShortDuration(Math.max(0, (b.ate - agora) / 1000))
          : Math.max(0, Math.ceil((b.ate - agora) / 1000)) + "s");
    }
  }

  if (typeof avatarActive === "function" && avatarActive(p, agora)) {
    const av = p._avatar || {};
    const resta = Math.max(0, (av.started + av.duration - agora) / 1000);
    itens.push({
      avatar: true, nome: "Avatar Stage 3", tipo: "positive",
      desc: "Transcendence: -15% dano recebido e todos os ataques críticos com +15% de dano extra.",
      tempo: typeof fmtShortDuration === "function" ? fmtShortDuration(resta) : (Math.ceil(resta) + "s"),
    });
  }

  if (typeof soulwarTaintInfo === "function") {
    const taint = soulwarTaintInfo(p);
    if (taint) {
      const icon = taint.icon && String(taint.icon).indexOf("cond-") === 0
        ? taint.icon : ("cond-" + (taint.icon || "goshnar-taint-1"));
      push(icon, "Máculas de Goshnar",
        typeof soulwarTaintTooltip === "function" ? soulwarTaintTooltip(p) : "",
        "negative", taint.level + "/5");
    }
  }

  if (p.stances && typeof STANCES !== "undefined") {
    for (const id in p.stances) {
      if (!p.stances[id] || !STANCES[id]) continue;
      const st = STANCES[id];
      const wiki = st.iconWiki;
      const img = wiki && typeof WIKI_ICONS !== "undefined" && WIKI_ICONS[wiki]
        ? WIKI_ICONS[wiki].path : "";
      itens.push({
        icon: wiki || "cond-strengthened",
        img: img || undefined,
        nome: st.nome,
        desc: st.desc || "",
        tipo: "positive",
        tempo: "",
      });
    }
  }

  return itens;
}

function attrEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function paintConditionBar(box, p, withLabel) {
  if (!box) return;
  const itens = collectConditionBarItems(p);
  if (!itens.length) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  let h = withLabel ? '<span class="sb-label">Status</span>' : "";
  for (const it of itens) {
    if (it.avatar) {
      const voc = p && p.voc;
      const cor = { knight: "#ff7a3a", paladin: "#ffe680", sorcerer: "#c78cff",
                    druid: "#7ae87a", monk: "#66c7ff" }[voc] || "#c78cff";
      h += `<span class="sb-avatar" style="color:${cor}" data-nome="${attrEscape(it.nome)}" data-desc="${attrEscape(it.desc)}" data-tempo="${attrEscape(it.tempo)}">◈</span>`;
      continue;
    }
    const img = it.img
      ? `<img src="${it.img}" alt="">`
      : `<img src="assets/ui/conditions/${it.icon}.png" alt="">`;
    const tempo = it.tempo
      ? `<span class="sb-tempo">${it.tempo}</span>` : "";
    h += `<span class="sb-ico ${it.tipo || ""}" data-nome="${attrEscape(it.nome)}" data-desc="${attrEscape(it.desc)}" data-tempo="${attrEscape(it.tempo)}">${img}${tempo}</span>`;
  }
  box.innerHTML = h;
  box.style.display = "flex";
  box.querySelectorAll(".sb-ico, .sb-avatar").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      const nome = el.dataset.nome || "";
      const desc = el.dataset.desc || "";
      const tempo = el.dataset.tempo || "";
      const taintTip = desc.indexOf("tt-taint-list") !== -1;
      const descCls = taintTip ? "tiny dim mt4 tt-taint" : "tiny dim mt4";
      const descW = taintTip ? "320px" : "230px";
      showTip(`<div class="tt-name">${nome}</div>` +
        (desc ? `<div class="${descCls}" style="max-width:${descW}">${desc}</div>` : "") +
        (tempo ? `<div class="tiny mt4" style="color:#ffe680">${tempo}</div>` : ""));
    });
    el.addEventListener("mouseleave", hideTip);
  });
}

function renderStatusBar(p) {
  paintConditionBar($("#status-bar"), p, true);
  paintAutoWalkButton(p);
}

function paintAutoWalkButton(p) {
  const on = typeof playerAutoWalkOn === "function" ? playerAutoWalkOn(p) : !(p && p.config && p.config.autoWalk === false);
  const title = on
    ? "AUTO ligado — o personagem anda sozinho"
    : "AUTO desligado — clique no chão ou WASD (1 SQM). Deixe um membro parado no canto.";
  const apply = (btn) => {
    if (!btn) return;
    btn.classList.toggle("primary", on);
    btn.classList.toggle("on", on);
    btn.classList.toggle("off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = title;
    if (btn.id === "btn-auto-walk") btn.textContent = on ? "AUTO" : "SQM";
  };
  apply($("#btn-auto-walk"));
  // Botões por membro da party (painel OTC) — só o personagem ativo espelha
  // o estado global; os demais são pintados em renderPartyPanel.
  const curId = p && (typeof characterId === "function" ? characterId(p) : p.id);
  if (curId !== undefined && curId !== null) {
    $$("#party-panel-body .btn-auto-walk").forEach((btn) => {
      if (String(btn.dataset.autoWalkChar) === String(curId)) apply(btn);
    });
  }
  const hint = $(".sqm-walk-hint");
  if (hint) {
    hint.textContent = on
      ? "ON = caça sozinho"
      : "OFF = clique no chão / WASD";
  }
}

/* Abas de categoria (accordion) dos catálogos HUNTS e BOSSES:
 * todas minimizadas por padrão (lista de títulos); expandir uma aba
 * minimiza as demais.
 * mode "accordion" = uma aberta por vez; mode "multi" = várias podem
 * abrir sem fechar as outras (usado pela busca do modal de hunts). */
function bindCatalogAccordion(root, mode) {
  const sections = Array.prototype.slice.call(root.querySelectorAll(".accordion-section"));
  const setOpen = (sec, open) => {
    sec.classList.toggle("open", !!open);
    const head = sec.querySelector(".hunt-cat-title");
    const group = sec.querySelector(".hunts-group");
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
    if (group) group.classList.toggle("collapsed", !open);
  };
  const open = (sec) => {
    if (mode !== "multi") sections.forEach((s) => setOpen(s, false));
    setOpen(sec, true);
  };
  const toggle = (sec) => {
    if (mode !== "multi" && sec.classList.contains("open")) setOpen(sec, false);
    else open(sec);
  };
  sections.forEach((sec) => {
    const head = sec.querySelector(".hunt-cat-title");
    if (!head) return;
    head.addEventListener("click", (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      toggle(sec);
    });
    head.addEventListener("keydown", (ev) => {
      if (ev && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        toggle(sec);
      }
    });
  });
  return { sections, setOpen, open, toggle };
}

const HUNT_MODAL_SECTIONS = [
  { title: "HUNTS LEVEL 0–100", ids: ["rats", "amazon-camp", "elf-yalahar", "salamander-cave", "stonerefiner", "cave-cave-edron", "ankrahmun-tombs", "meriana-island", "mutateds-yalahar"] },
  { title: "HUNTS 100–250", ids: ["lizard-chosen-tower", "ghastly-dragons", "elder-wyrm-darashia", "minotaur-oramond-east", "deeplings-deeper"] },
  { title: "HUNTS 250+", ids: ["mota-extension", "cobra-bastion", "marapur-nagas", "buried-cathedral", "ingol-terrain", "roshamuul", "prison-1", "prison-2", "prison-3", "catacombs-oramond", "deathlings-sunken-temple", "falcon-bastion"] },
  { title: "FERUMBRAS ASCENDANT", ids: ["ferumbras-way", "dt-seal", "juggerseal"] },
  { title: "LIBRARY SESSION 400+", ids: ["library-fire", "library-energy", "library-ice", "library-earth"] },
  { title: "SOULWAR 400+", ids: ["dark-thais", "rotten-wasteland", "claustrophobic-inferno", "ebb-and-flow", "furious-crate"] },
];

const HUNT_UI = { busca: "" };

/* Único catálogo público de hunts — layout Canary/OTC Cyclopedia:
 * dificuldade (estrelas), nível recomendado, criaturas e risco. */
function renderHunts(p) {
  const root = $("#hunts-modal-list");
  if (!root || !p) return;
  const cur = p.hunt;
  const busca = (HUNT_UI.busca || "").toLowerCase();
  const card = (id) => {
    const hu = GAMEDATA.hunts[id];
    if (!hu) return "";
    if (busca && (hu.name || "").toLowerCase().indexOf(busca) === -1) return "";
    const risk = hu.comingSoon ? { cls: "mid", txt: "em breve" } : huntRisk(p, hu);
    const stars = typeof huntStars === "function" ? huntStars(hu) : 1;
    const starsHtml = typeof huntStarsHtml === "function"
      ? huntStarsHtml(stars) : `★${stars}`;
    const aviso = hu.comingSoon
      ? `<div class="tiny" style="color:#e8d24a">Em breve — missão Fear 15× já ativa</div>`
      : (risk.cls === "high"
        ? `<div class="tiny" style="color:#ff9a6a">⚠ Não recomendado para o seu nível</div>` : "");
    const mobs = (hu.monsters || []).slice(0, 4).map((m) => {
      const st = typeof bestiaryStage === "function" ? bestiaryStage(p, m) : 1;
      const charm = typeof charmOnRace === "function" ? charmOnRace(p, m) : null;
      return `<span class="hunt-modal-mob">${mobImg(m, 24, st ? "" : "filter:brightness(0);")}${
        charm && typeof charmIconHtml === "function" ? charmIconHtml(charm, 12) : ""}</span>`;
    }).join("");
    return `<button class="hunt-card hunt-modal-card hunt-canary-card ${cur === id ? "active" : ""} ${hu.comingSoon ? "coming-soon" : ""}" data-hunt="${id}">
      <span class="mobs" aria-hidden="true">${mobs}</span>
      <span class="info">
        <span class="nm">${hu.name} ${starsHtml}</span>
        <span class="meta">Nível recomendado <b>${hu.level}</b> · ${fmt(hu.avgExp)} xp/kill</span>
        ${aviso}
      </span>
      <span class="risk ${risk.cls}">${risk.txt}</span>
    </button>`;
  };
  root.innerHTML = HUNT_MODAL_SECTIONS.map((section) => {
    const cards = section.ids.map(card).filter(Boolean).join("");
    // Busca ativa: abas sem resultado somem; caso contrário, seção vazia
    // mantém o aviso "Em breve".
    if (busca && !cards) return "";
    return `<section class="hunt-modal-section accordion-section">
      <div class="hunt-cat-title accordion-head" role="button" tabindex="0"
        aria-expanded="false">${section.title}</div>
      <div class="hunts-group collapsed">${cards || `<div class="hunt-section-empty">Em breve</div>`}</div>
    </section>`;
  }).join("");
  if (typeof bindCatalogAccordion === "function") {
    const acc = bindCatalogAccordion(root, busca ? "multi" : "accordion");
    // Busca ativa: abre automaticamente as abas que têm resultados.
    if (busca) acc.sections.forEach((sec) => {
      if (sec.querySelector(".hunt-modal-card")) acc.open(sec);
    });
  }
  $$("#hunts-modal-list [data-hunt]").forEach((el) => {
    el.addEventListener("click", () => {
      const modalBox = $("#modal-body");
      if (modalBox) modalBox.classList.remove("hunts-modal-shell");
      openHuntInfoModal(el.dataset.hunt);
    });
  });
}

function openHuntsModal() {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  body.classList.remove(
    "boss-modal-shell", "reward-modal-shell",
    "npcs-modal-shell", "cidade-modal-shell", "ranking-modal-shell"
  );
  body.classList.add("hunts-modal-shell");
  body.innerHTML = `<div class="panel-title hunts-modal-title">
      <span class="hunts-demon-icon" aria-hidden="true"></span>
      <span>HUNTS</span>
      <input id="hunts-modal-busca" placeholder="buscar…" value="${HUNT_UI.busca || ""}"
        style="margin-left:8px;width:120px;padding:3px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <button class="sm" id="hunts-modal-close">Fechar</button>
    </div><div class="panel-body" id="hunts-modal-list"></div>`;
  modal.classList.add("show");
  $("#hunts-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("hunts-modal-shell");
  });
  const inp = $("#hunts-modal-busca");
  if (inp) inp.addEventListener("input", () => {
    HUNT_UI.busca = inp.value;
    renderHunts(G.p);
    const n = $("#hunts-modal-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  renderHunts(G.p);
}

/* ────────────────────────────────────────────────────────────────
 * Modal de informações da hunt: monstros com ATRIBUTOS, RESISTÊNCIAS
 * e DROPS (chance + quantidade), e o botão para caçar.
 * ──────────────────────────────────────────────────────────────── */
function openHuntInfoModal(id) {
  const p = G.p;
  const hu = GAMEDATA.hunts[id];
  if (!hu || !p) return;
  const risk = huntRisk(p, hu);
  const modo = G.combat ? G.combat.instanceMode : (p.instanceMode || "non-pvp");
  const packLabel = (hu.packMin && hu.packMax) ? `${hu.packMin}–${hu.packMax}` : (hu.pack || 3);

  const monsterCard = (slug) => {
    const m = GAMEDATA.monsters[slug];
    if (!m) return "";
    const elements = ["physical", "earth", "energy", "fire", "ice", "holy", "death"];
    const resistHtml = elements.map((el) =>
      resistRowHtml(el, (m.resist && m.resist[el]) || 0)).join("");
    const lootHtml = (m.loot || []).map((l) => {
      const it = GAMEDATA.items[l.item];
      const label = `${it ? it.n : l.item} · ${l.chance}% chance${l.max > 1 ? ` · até ${l.max}` : ""}`;
      return `<div class="hunt-loot-slot loot-with-chance" data-hunt-drop="${l.item}"
        data-hunt-chance="${l.chance}" data-hunt-max="${l.max || 1}"
        title="${label}">${itemImg(l.item, 28)}
        <span class="loot-chance">${Number(l.chance) || 0}%</span></div>`;
    }).join("") || `<span class="tiny dim">—</span>`;
    return `<div class="hunt-best-card">
      <div class="hunt-best-sprite">${mobImg(slug, 58)}</div>
      <div class="hunt-best-name">${m.name}</div>
      <div class="hunt-best-stat"><span>HP</span><b>${fmtFull(m.hp)}</b></div>
      <div class="hunt-best-stat"><span>Exp</span><b>${fmtFull(m.exp)}</b></div>
      <div class="hunt-best-title">RESISTÊNCIAS</div>
      <div class="hunt-best-resists">${resistHtml}</div>
      <div class="hunt-best-loot">${lootHtml}</div>
    </div>`;
  };

  const stars = typeof huntStars === "function" ? huntStars(hu) : 1;
  const starsHtml = typeof huntStarsHtml === "function" ? huntStarsHtml(stars) : "";
  const soon = !!hu.comingSoon;
  $("#modal-body").innerHTML = `
    <div class="panel-title">${hu.name}
      <span style="margin-left:8px">${starsHtml}</span>
      <span class="tiny dim" style="margin-left:6px">nv recomendado ${hu.level}</span>
      <span style="flex:1"></span>
      <span class="risk ${soon ? "mid" : risk.cls}" style="margin-right:6px">${soon ? "em breve" : risk.txt}</span>
      <button class="sm" id="huntinfo-close">✕</button>
    </div>
    <div class="panel-body">
      ${soon ? `<div class="tiny mb8" style="color:#e8d24a">Mapa em breve. A missão de Fear (15×) já está pré-setada para liberar Goshnar's Spite.</div>` : ""}
      ${!soon && risk.cls === "high" ? `<div class="tiny mb8" style="color:#ff9a6a">⚠ Local não recomendado para a sua faixa de nível — risco alto de morte.</div>` : ""}
      <div class="huntinfo-summary row wrap" style="gap:10px;margin-bottom:8px">
        <span class="tiny dim">Dificuldade <b>${stars}/5</b></span>
        <span class="tiny dim">XP/h ~ <b style="color:#9ce84a">${fmt(hu.avgExp * 3600 / 60)}</b></span>
        <span class="tiny dim">Instância: <b style="color:${modo === "pvp" ? "#ff9a6a" : "#9ce84a"}">${modo}</b></span>
        <span class="tiny dim">Pack: <b>${packLabel}</b> criaturas</span>
        <span class="tiny dim">Respawn: <b>${hu.respawn || 0.8}s</b></span>
      </div>
      <div class="hunt-monsters">${hu.monsters.map(monsterCard).join("")}</div>
      <div class="row mt8" style="gap:6px;justify-content:flex-end">
        <button class="sm" id="huntinfo-cancel">Cancelar</button>
        <button class="primary sm" id="huntinfo-go" ${soon ? "disabled" : ""}>${soon ? "Em breve" : `⚔ Caçar em ${hu.name}`}</button>
      </div>
    </div>`;

  const close = () => $("#modal").classList.remove("show", "wide");
  $("#huntinfo-close").addEventListener("click", close);
  $("#huntinfo-cancel").addEventListener("click", close);
  // Tooltip dos drops: nome do item + % de chance (mesmo padrão do boss).
  $$("#modal-body [data-hunt-drop]").forEach((el) => {
    const drop = {
      chance: Number(el.dataset.huntChance) || 0,
      max: Math.max(1, Number(el.dataset.huntMax) || 1),
    };
    el.addEventListener("mouseenter", () =>
      showTip(dropTooltipHtml(el.dataset.huntDrop, hu.name, drop)));
    el.addEventListener("mouseleave", hideTip);
  });
  if (!soon) {
    $("#huntinfo-go").addEventListener("click", () => { close(); startHunt(id); });
  }
  $("#modal").classList.add("show", "wide");
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
  // Rate de experiência do servidor aplicado na estimativa
  const expRate = (typeof expStage === "function") ? expStage(p.level) : 1;
  return {
    exp: killsPerHour * hu.avgExp * expRate,
    gold: killsPerHour * hu.avgGold * 1.6,
    kills: killsPerHour,
    ttk: ttk,
  };
}

function renderInventory(p) {
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  const slots = bagSlots(p);
  const instanced = (p.itemInstances || [])
    .filter((inst) => inst && inst.loc === "bag")
    .sort((a, b) => {
      const A = GAMEDATA.items[a.slug], B = GAMEDATA.items[b.slug];
      const ds = (B ? B.sell || 0 : 0) - (A ? A.sell || 0 : 0);
      if (ds) return ds;
      return itemInstanceTier(b) - itemInstanceTier(a);
    })
    .map((inst) => ({
      slug: inst.slug, instId: inst.id, tier: itemInstanceTier(inst), count: 1, instanced: true,
      charges: inst.charges, maxCharges: inst.maxCharges,
    }));
  const stacked = Object.keys(p.bag)
    .filter((slug) => (p.bag[slug] || 0) > 0 && !(typeof itemUsesInstances === "function" && itemUsesInstances(slug)))
    .sort((a, b) => {
      const A = GAMEDATA.items[a], B = GAMEDATA.items[b];
      return (B ? B.sell || 0 : 0) - (A ? A.sell || 0 : 0);
    })
    .map((slug) => ({ slug: slug, count: p.bag[slug], instanced: false }));
  const entries = instanced.concat(stacked);
  const displaySlots = Math.max(slots, entries.length);
  const cells = [];
  for (let i = 0; i < displaySlots; i++) {
    const e = entries[i];
    if (e) {
      const tierCls = e.tier && typeof forgeTierClassForValue === "function" ? forgeTierClassForValue(e.tier) : "";
      let badge = "";
      if (e.tier) badge = `<span class="tier-badge ${tierCls}">T${e.tier}</span>`;
      else if (e.instanced && e.charges !== undefined && typeof fmtShortDuration === "function") {
        const it = GAMEDATA.items[e.slug];
        if (it && it.chargeMode === "time") {
          badge = `<span class="cnt charge-cnt item-tempo">${fmtShortDuration(e.charges * 3)}</span>`;
        } else {
          badge = `<span class="cnt charge-cnt">${e.charges}</span>`;
        }
      } else if (e.count > 1) badge = `<span class="cnt">${e.count}</span>`;
      cells.push(`<div class="inv-item ${itemClsBorder(e.slug)} ${tierCls}" data-item="${e.slug}"${e.instId ? ` data-inst="${e.instId}"` : ""}>${itemImg(e.slug, 0, null, e.count || 1)}
        ${badge}
      </div>`);
    } else {
      cells.push(`<div class="inv-item empty" title="Slot vazio"></div>`);
    }
  }
  const sellVal = typeof bagSellableValue === "function" ? bagSellableValue(p) : 0;
  $("#inv").innerHTML = `
    <div class="inv-head" style="grid-column:1/-1;margin:0 0 3px 2px;display:flex;align-items:center;gap:6px;justify-content:space-between">
      <span class="tiny dim">Bag padrão: ${bagUsedSlots(p)} / ${slots} slots</span>
      <button class="sm ${sellVal > 0 ? "danger" : ""}" id="btn-bag-sell-all" ${sellVal > 0 ? "" : "disabled"}
        title="Vende tudo que tem valor (respeita 'Não vender'; itens tierados ficam)">
        Vender tudo${sellVal > 0 ? ` · ${fmtFull(sellVal)} gp` : ""}
      </button>
    </div>${cells.join("")}`;
  const invBox = $("#inv");
  // delegação no container: o botão é recriado a cada render, então um
  // listener direto nele morreria junto com o elemento antigo
  if (!invBox.dataset.sellBound) {
    invBox.dataset.sellBound = "1";
    invBox.addEventListener("click", (e) => {
      if (e.target && e.target.closest && e.target.closest("#btn-bag-sell-all")) {
        const run = typeof sellAllBagAndPersist === "function"
          ? sellAllBagAndPersist(G.p)
          : Promise.resolve({ gold: typeof sellAllBag === "function" ? sellAllBag(G.p) : 0, ok: true });
        Promise.resolve(run).catch(() => {});
      }
    });
  }
  if (typeof bindDrop === "function" && !invBox.dataset.dropBound) {
    invBox.dataset.dropBound = "1";
    bindDrop(invBox, (payload) => {
      if (payload && payload.source === "stash" && typeof persistWithdrawFromSupplyStash === "function") {
        persistWithdrawFromSupplyStash(G.p, { slug: payload.slug, dest: "bag" }).then((result) => {
          if (result && result.ok && typeof addLog === "function")
            addLog("info", `Moveu <b>${itemName(payload.slug)}</b> para a mochila.`);
        });
        return false;
      }
      // ONLINE (combate ou cidade): pouch→bag precisa da API autoritativa — a
      // pouch é server-owned e o PUT comum a restaurava: o item "voltava" e o
      // jogo parecia travar (o drag não persistia; depois o "Equipar em X"
      // falhava com item ausente no servidor).
      if (payload && payload.source === "pouch" &&
          typeof accountApiConfigured === "function" && accountApiConfigured() &&
          typeof accountMovePouchToBag === "function" &&
          typeof sessionToken === "function" && G.p && G.p.id) {
        const count = (G.p.lootPouch && G.p.lootPouch[payload.slug]) || 0;
        if (count <= 0) return false;
        accountMovePouchToBag(sessionToken(), G.p.id, { slug: payload.slug, qty: count }).then((result) => {
          if (result && result.ok) {
            if (result.state && typeof applyOnlineAuthorityState === "function" &&
                typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
              applyOnlineAuthorityState(result.state, null, result.version);
            } else {
              if (result.lootPouch) G.p.lootPouch = result.lootPouch || {};
              if (result.bag) G.p.bag = result.bag || {};
              if (result.itemInstances) G.p.itemInstances = result.itemInstances || [];
            }
            if (typeof addLog === "function")
              addLog("info", `Moveu <b>${itemName(payload.slug)}</b> para a mochila.`);
          } else {
            if (typeof toast === "function")
              toast((result && result.msg) || "Não foi possível mover para a mochila.", "bad");
          }
          if (typeof renderAll === "function") renderAll();
        });
        return false; // async — bindDrop não duplica o move
      }
      const ok = typeof moveItemToBag === "function" && moveItemToBag(G.p, payload);
      if (ok) addLog("info", `Moveu <b>${itemName(payload.slug)}</b> para a mochila.`);
      return ok;
    });
  }
  $$("#inv .inv-item[data-item]").forEach((el) => {
    const slug = el.dataset.item;
    const instId = el.dataset.inst || null;
    if (typeof bindItemDrag === "function") bindItemDrag(el, { source: "bag", slug: slug, instId: instId });
    el.addEventListener("mouseenter", () => {
      const extra = instId
        ? `${typeof forgeTierTextForInstance === "function" ? (forgeTierTextForInstance(instId) || "sem tier") : "item"} · Clique para opções`
        : `${p.bag[slug]}x · Clique para opções`;
      showTip(itemTip(slug, extra, null, instId));
    });
    el.addEventListener("mouseleave", hideTip);
    const openMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      openBagItemMenu(p, slug, e.clientX, e.clientY, null, instId);
    };
    el.addEventListener("click", openMenu);
    el.addEventListener("contextmenu", openMenu);
  });
}

/* Equipa um item da mochila. Retorna true se equipou. */
function equipFromBag(p, slug, instId) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return false;
  if (typeof canEquipItem === "function") {
    const chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) { toast(chk.msg, ""); return false; }
  } else if (it.lvl && p.level < it.lvl) { toast(`Requer nível ${it.lvl}`, ""); return false; }
  // Equip com persistência: em instância online vai pela autoridade (senão o
  // tick de 200ms restaura a arma anterior) e em ambos os caminhos aplica a
  // munição automática do tipo da arma (bow→arrow, crossbow→bolt). Munição
  // continua no fluxo do setActiveAmmo, que já persiste pela API própria.
  if (it.s !== "ammo" && typeof persistEquipFromContainer === "function") {
    persistEquipFromContainer(p, slug, "bag", it.s, instId);
    return true;
  }
  if (typeof equipItemFromContainer === "function") return equipItemFromContainer(p, slug, "bag", it.s, instId);
  if (it.s === "ammo") {
    if (!equippedQuiver(p)) { toast("Equipe um quiver antes de selecionar munição."); return false; }
    setActiveAmmo(p, slug, true);
    toast(`Munição no quiver: <b>${it.n}</b> (${fmtFull(ammoPrice(slug))} gp/tiro)`);
    return true;
  }

  let takenInst = null;
  const old = p.equip[it.s];
  if (typeof itemUsesInstances === "function" && itemUsesInstances(slug)) {
    takenInst = takeBagItemInstance(p, slug, { instId: instId, highestTier: true });
    if (!takenInst) return false;
  } else {
    removeItem(p, slug, 1);
  }

  if (old) {
    if (old.instId && typeof takeEquippedItemInstance === "function") {
      const oldInst = takeEquippedItemInstance(p, it.s);
      if (!putBagItemInstance(p, oldInst)) {
        if (takenInst) putBagItemInstance(p, takenInst); else addItem(p, slug, 1);
        equipEntryInstance(p, it.s, oldInst);
        toast("Mochila cheia.");
        return false;
      }
    } else if (!addItem(p, old.item, 1)) {
      if (takenInst) putBagItemInstance(p, takenInst); else addItem(p, slug, 1);
      toast("Mochila cheia.");
      return false;
    }
  }

  if (takenInst) equipEntryInstance(p, it.s, takenInst);
  else p.equip[it.s] = { item: slug, count: 1 };

  if (it.th && p.equip.shield) {
    const shieldEntry = p.equip.shield;
    if (shieldEntry.instId && typeof takeEquippedItemInstance === "function") {
      const shInst = takeEquippedItemInstance(p, "shield");
      if (!putBagItemInstance(p, shInst)) {
        equipEntryInstance(p, "shield", shInst);
        toast("Sem espaço para guardar o escudo.");
      }
    } else {
      if (addItem(p, p.equip.shield.item, 1)) delete p.equip.shield;
      else toast("Sem espaço para guardar o escudo.");
    }
  }
  return true;
}

/* Move e equipa um item do LOOT POUCH em outro personagem da party.
 * O item sai da pouch do personagem atual, vai para a bag do destino e é
 * equipado nele (equipOnOtherCharacter exige o item na `bag`, então não
 * serve para itens que estão na pouch — onde todos os drops caem).
 * Conta online: passa pela autoridade (/api/characters/equip-other), que
 * tira o item do shared e equipa o alvo — mutação local não persistia. */
function equipOnOtherCharacterPouch(from, to, slug) {
  // Loot Pouch não equipa diretamente: mover para a mochila primeiro.
  if (typeof toast === "function") toast("Mova o item para a mochila antes de equipar.", "bad");
  return false;
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return false;
  const slot = it.s;
  const chk = typeof canEquipItem === "function" ? canEquipItem(to, slug, slot) : { ok: true };
  if (!chk.ok) { toast(`${to.name}: ${chk.msg}`); return false; }
  if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
      typeof sessionToken === "function" && sessionToken() && from && to &&
      typeof accountEquipOnOtherCharacter === "function") {
    const sourceId = from.id ? String(from.id) : (typeof sessionCharId === "function" ? sessionCharId() : "");
    const targetId = String(to.id || "");
    if (!sourceId || !targetId) return false;
    return accountEquipOnOtherCharacter(sessionToken(), sourceId, targetId, slug, "pouch", null)
      .then((result) => {
        if (result && result.ok) {
          toast(`${it.n} equipado em <b>${to.name}</b>`);
          return true;
        }
        toast((result && result.msg) || `${to.name} não conseguiu equipar o item.`, "bad");
        return false;
      });
  }
  if (!from.lootPouch || from.lootPouch[slug] < 1) return false;
  from.lootPouch[slug] -= 1;
  if (from.lootPouch[slug] === 0) delete from.lootPouch[slug];
  to.bag = to.bag || {};
  to.bag[slug] = (to.bag[slug] || 0) + 1;
  if (typeof equipItemFromContainer !== "function" || !equipItemFromContainer(to, slug, "bag", slot)) {
    to.bag[slug] -= 1;
    if (to.bag[slug] === 0) delete to.bag[slug];
    from.lootPouch[slug] = (from.lootPouch[slug] || 0) + 1;
    toast(`${to.name} não conseguiu equipar o item.`);
    return false;
  }
  if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(to);
  if (typeof save === "function") save();
  toast(`${it.n} equipado em <b>${to.name}</b>`);
  return true;
}

/* Opções "Equipar em <personagem>" para os membros da party/roster que
 * atendem aos requisitos do item. Filtra por id (e não por referência de
 * objeto: getCharacters() devolve cópias normalizadas, então `c !== p`
 * sempre seria true e o personagem ATIVO também entraria na lista).
 * `fromPouch` usa o caminho que tira o item da Loot Pouch (onde os drops
 * caem) em vez da mochila. */
function partyEquipMenuOptions(p, slug, instId, fromPouch) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return [];
  if (fromPouch) return []; // Loot Pouch não equipa diretamente: mover para a mochila primeiro.
  const activeId = String((typeof characterId === "function" ? characterId(p) : (p && p.id)) || "");
  // Sempre pega os personagens da conta, nunca todos do roster/party.
  const accountChars = (typeof accountCharacterCacheRead === "function" && accountCharacterCacheRead())
    || (typeof G !== "undefined" && G.accountChars)
    || [];
  const roster = typeof getCharacters === "function" ? getCharacters() : [];
  const source = accountChars.length ? roster.filter((c) => accountChars.some((a) => String(a.id) === String(c.id))) : roster;
  const opts = [];
  for (const other of source) {
    const oid = String((typeof characterId === "function" ? characterId(other) : (other && other.id)) || "");
    if (!oid || oid === activeId) continue;   // nunca equipa "em si mesmo"
    const chk = (typeof canEquipItem === "function"
      ? canEquipItem(other, slug, it.s) : { ok: true });
    if (!chk.ok) continue;                    // só quem tem os requisitos
    opts.push({
      label: `Equipar em ${other.name || oid}`,
      hint: `lvl ${other.level} · ${other.voc || ""}`,
      action: () => {
        // Online o equip é assíncrono (API autoritativa) — Promise.resolve
        // cobre os dois caminhos (local síncrono e remoto).
        const result = fromPouch
          ? equipOnOtherCharacterPouch(p, other, slug)
          : equipOnOtherCharacter(p, other, slug, instId);
        Promise.resolve(result).then((ok) => {
          if (ok && typeof renderAll === "function") renderAll();
        });
      },
    });
  }
  return opts;
}

/* Move e equipa um item em outro personagem da conta/party.
 * Requer que o item esteja na mochila do personagem atual. Offline/local.
 * Conta online: o backpack é compartilhado no SERVIDOR — a operação passa
 * por /api/characters/equip-other (tira o item do shared, equipa o alvo e
 * devolve o shared + equip do alvo). Sem isso o toast dizia "equipado" mas
 * nada persistia: o item não aparecia no personagem alvo e a mochila
 * "voltava" no próximo estado do servidor. */
function equipOnOtherCharacter(from, to, slug, instId) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return false;
  if (to === from) return equipFromBag(from, slug, instId);
  const slot = it.s;
  const chk = typeof canEquipItem === "function" ? canEquipItem(to, slug, slot) : { ok: true };
  if (!chk.ok) { toast(`${to.name}: ${chk.msg}`); return false; }

  if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
      typeof sessionToken === "function" && sessionToken() && from && to &&
      typeof accountEquipOnOtherCharacter === "function") {
    const sourceId = from.id ? String(from.id) : (typeof sessionCharId === "function" ? sessionCharId() : "");
    const targetId = String(to.id || "");
    if (!sourceId || !targetId) return false;
    return accountEquipOnOtherCharacter(sessionToken(), sourceId, targetId, slug, "bag", instId || null)
      .then((result) => {
        if (result && result.ok) {
          toast(`${it.n} equipado em <b>${to.name}</b>`);
          return true;
        }
        toast((result && result.msg) || `${to.name} não conseguiu equipar o item.`, "bad");
        return false;
      });
  }

  if (instId) {
    if (typeof takeBagItemInstance !== "function") return false;
    const taken = takeBagItemInstance(from, slug, { instId: instId, highestTier: false });
    if (!taken) return false;
    if (typeof putBagItemInstance !== "function" || !putBagItemInstance(to, taken)) {
      putBagItemInstance(from, taken);
      toast("Mochila do destino cheia.");
      return false;
    }
    if (typeof equipItemFromContainer !== "function" || !equipItemFromContainer(to, slug, "bag", slot, taken.id)) {
      putBagItemInstance(from, taken);
      toast(`${to.name} não conseguiu equipar o item.`);
      return false;
    }
  } else {
    if (!from.bag || from.bag[slug] < 1) return false;
    from.bag[slug] -= 1;
    if (from.bag[slug] === 0) delete from.bag[slug];
    to.bag = to.bag || {};
    to.bag[slug] = (to.bag[slug] || 0) + 1;
    if (typeof equipItemFromContainer !== "function" || !equipItemFromContainer(to, slug, "bag", slot)) {
      to.bag[slug] -= 1;
      if (to.bag[slug] === 0) delete to.bag[slug];
      from.bag[slug] = (from.bag[slug] || 0) + 1;
      toast(`${to.name} não conseguiu equipar o item.`);
      return false;
    }
  }

  if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(to);
  if (typeof save === "function") save();
  toast(`${it.n} equipado em <b>${to.name}</b>`);
  return true;
}

/* Vende um item da mochila (unica via de venda manual fora da Loot Pouch) */
function sellBagItem(p, slug, instId) {
  const it = GAMEDATA.items[slug];
  const count = p.bag[slug] || 0;
  if (!it) return 0;
  if (instId && typeof itemUsesInstances === "function" && itemUsesInstances(slug)) {
    const inst = takeBagItemInstance(p, slug, { instId: instId, highestTier: false });
    if (!inst) return 0;
    const valueOne = it.sell || 0;
    if (valueOne <= 0) { putBagItemInstance(p, inst); toast("Esse item não possui valor de venda."); return 0; }
    p.gold += valueOne;
    deleteItemInstance(p, inst.id);
    addLog("sell", `Vendeu <b>${it.n}</b>${inst.tier ? ` T${inst.tier}` : ""} por <span class="gold-txt">${fmtFull(valueOne)} gp</span>`);
    return valueOne;
  }
  if (count <= 0) return 0;
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
  if (typeof save === "function") save();
  return value;
}

/* Menu de opções de um item da mochila */
function openBagItemMenu(p, slug, x, y, after, instId) {
  const it = GAMEDATA.items[slug];
  if (!it) return;
  const count = instId ? 1 : (p.bag[slug] || 0);
  const inst = instId && typeof findItemInstance === "function" ? findItemInstance(p, instId) : null;
  const value = (it.sell || 0) * count;
  const refresh = () => { if (after) after(); else renderAll(); };
  const opts = [{ label: "Detalhes", action: () => openItemDetails(slug, count) }];

  if (it.s) {
    opts.push({
      label: it.s === "ammo" ? "Selecionar munição" : "Equipar",
      action: () => { if (equipFromBag(p, slug, instId)) refresh(); },
    });
    opts.push(...partyEquipMenuOptions(p, slug, instId, false));
  }
  // moedas viram gold direto; o resto só é vendido pela Loot Pouch
  if (currencyValue(slug)) {
    opts.push({
      label: `Converter em gold · ${fmtFull(currencyValue(slug) * count)} gp`,
      action: () => {
        if (typeof persistBagSell === "function") {
          persistBagSell(p, { slug, instId }).then((result) => {
            if (result && result.ok && typeof refresh === "function") refresh();
            else if (result && result.ok) renderAll();
          });
          return;
        }
        if (sellBagItem(p, slug, instId) > 0) refresh();
      },
    });
  } else {
  opts.push({
    label: "Mover para Loot Pouch",
    hint: value > 0 ? `${fmtFull(value)} gp` : "",
    action: () => {
      if (instId && inst && inst.tier > 0) {
        toast("Itens tierados precisam ficar em bag/depot/equip. Não mova para a Loot Pouch.");
        return;
      }
      // Conta online: bag é compartilhada e o PUT comum não persiste o
      // movimento (em combate o tick restaura; na cidade o shared volta) —
      // usa a API autoritativa, senão o item "voltava" para a backpack.
      if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
          typeof accountMoveBagToPouch === "function" &&
          typeof sessionToken === "function" && sessionToken() && p && p.id) {
        accountMoveBagToPouch(sessionToken(), p.id, { slug, qty: instId ? 1 : count, instId: instId || null })
          .then((result) => {
            if (result && result.ok) {
              if (result.state && typeof applyOnlineAuthorityState === "function" &&
                  typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
                applyOnlineAuthorityState(result.state, null, result.version);
              } else {
                if (result.lootPouch) p.lootPouch = result.lootPouch || {};
                if (result.bag) p.bag = result.bag || {};
                if (result.itemInstances) p.itemInstances = result.itemInstances || [];
              }
              addLog("info", `Moveu <b>${it.n}</b> para a Loot Pouch.`);
            } else {
              toast((result && result.msg) || "Não foi possível mover para a Loot Pouch.", "bad");
            }
            if (typeof renderAll === "function") renderAll();
          });
        return;
      }
      if (instId && typeof takeBagItemInstance === "function") {
        const taken = takeBagItemInstance(p, slug, { instId: instId, highestTier: false });
        if (!taken) return;
        deleteItemInstance(p, taken.id);
        addLootPouch(p, slug, 1);
      } else {
        addLootPouch(p, slug, count);
        delete p.bag[slug];
      }
      addLog("info", `Moveu <b>${it.n}</b> para a Loot Pouch.`);
      if (typeof save === "function") save();
      refresh();
    },
  });
  if (typeof isSupplyStashableItem === "function" && isSupplyStashableItem(slug)) {
    const autoOn = typeof isAutoSupplyStash === "function" && isAutoSupplyStash(p, slug);
    opts.push({
      label: autoOn ? "Auto Supply Stash: ON" : "Auto Supply Stash",
      hint: autoOn ? "loot → Supply Stash" : "ligar",
      action: () => {
        setAutoSupplyStash(p, slug, !autoOn);
        toast(autoOn
          ? `<b>${it.n}</b>: Auto Supply Stash desligado (loot volta para a pouch).`
          : `<b>${it.n}</b>: loot irá para a Supply Stash.`);
        if (typeof persistAutoSupplyStash === "function") {
          persistAutoSupplyStash(p, slug, !autoOn);
          return;
        }
        if (typeof save === "function") save();
        refresh();
        if (typeof renderSupplyStash === "function") renderSupplyStash(p);
      },
    });
    opts.push({
      label: "Mover para Supply Stash",
      action: () => {
        if (typeof persistMoveToSupplyStash === "function") {
          persistMoveToSupplyStash(p, { source: "bag", slug: slug });
          return;
        }
        if (typeof moveItemToSupplyStash === "function" &&
            moveItemToSupplyStash(p, { source: "bag", slug: slug })) {
          addLog("info", `Moveu <b>${it.n}</b> para a Supply Stash.`);
          if (typeof save === "function") save();
          refresh();
          if (typeof renderSupplyStash === "function") renderSupplyStash(p);
        }
      },
    });
  }
  }
  opts.push({
    label: "Destruir",
    danger: true,
    action: () => {
      if (!confirm(`Destruir ${count}x ${it.n}? Isso não pode ser desfeito.`)) return;
      // Conta online: bag é compartilhada e o PUT comum não persiste a
      // destruição — sem a API o item "voltava" para a backpack.
      if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
          typeof accountDestroyBagItem === "function" &&
          typeof sessionToken === "function" && sessionToken() && p && p.id) {
        accountDestroyBagItem(sessionToken(), p.id, slug, instId || null).then((result) => {
          if (result && result.ok) {
            if (result.state && typeof applyOnlineAuthorityState === "function" &&
                typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
              applyOnlineAuthorityState(result.state, null, result.version);
            } else {
              if (result.bag) p.bag = result.bag || {};
              if (result.itemInstances) p.itemInstances = result.itemInstances || [];
            }
            addLog("info", `Destruiu ${count}x <b>${it.n}</b>.`);
          } else {
            toast((result && result.msg) || "Não foi possível destruir o item.", "bad");
          }
          if (typeof renderAll === "function") renderAll();
        });
        return;
      }
      if (instId && typeof takeBagItemInstance === "function") {
        const taken = takeBagItemInstance(p, slug, { instId: instId, highestTier: false });
        if (!taken) return;
        deleteItemInstance(p, taken.id);
      } else {
        delete p.bag[slug];
      }
      addLog("info", `Destruiu ${count}x <b>${it.n}</b>.`);
      if (typeof save === "function") save();
      refresh();
    },
  });
  showContextMenu(x, y, `${it.n} <span class="dim">${inst ? (forgeTierTextForInstance(inst.id) || "1x") : (count + "x")}</span>`, opts);
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
        <div class="inv-item ${itemClsBorder(slug)}" style="cursor:default">${itemImg(slug)}</div>
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

/* Equipa um item direto da loot pouch (todo drop cai nela agora). O item
 * antigo volta para a pouch tambem — ela nao enche, entao a troca nunca
 * falha, ao contrario da troca via mochila. */
function equipFromPouch(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return false;
  if (typeof canEquipItem === "function") {
    const chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) { toast(chk.msg, ""); return false; }
  } else if (it.lvl && p.level < it.lvl) { toast(`Requer nível ${it.lvl}`, ""); return false; }
  // Equip com persistência (instância online: autoritativo; sempre aplica a
  // munição automática do tipo da arma).
  if (it.s !== "ammo" && typeof persistEquipFromContainer === "function") {
    persistEquipFromContainer(p, slug, "pouch", it.s);
    return true;
  }
  if (typeof equipItemFromContainer === "function") return equipItemFromContainer(p, slug, "pouch", it.s);
  if (it.s === "ammo") {
    if (!equippedQuiver(p)) { toast("Equipe um quiver antes de selecionar munição."); return false; }
    setActiveAmmo(p, slug, true);
    toast(`Munição no quiver: <b>${it.n}</b> (${fmtFull(ammoPrice(slug))} gp/tiro)`);
    return true;
  }
  const old = p.equip[it.s];
  removeLootPouch(p, slug, 1);
  if (old) addLootPouch(p, old.item, 1);
  p.equip[it.s] = { item: slug, count: 1 };
  if (it.th && p.equip.shield) {
    addLootPouch(p, p.equip.shield.item, 1);
    delete p.equip.shield;
  }
  return true;
}

/* Vende um item específico do Loot Pouch */
/* Preço unitário seguro para Sell All / pouch (evita NaN e UI travada). */
function pouchUnitSellPrice(it) {
  if (!it) return 0;
  const npc = Number(it.npcSell);
  if (Number.isFinite(npc) && npc > 0) return Math.floor(npc);
  const sell = Number(it.sell);
  if (Number.isFinite(sell) && sell > 0) return Math.floor(sell);
  return 0;
}

function sellPouchItem(p, slug) {
  const it = GAMEDATA.items[slug];
  const count = Math.max(0, Math.floor(Number(p.lootPouch && p.lootPouch[slug]) || 0));
  if (!it || count <= 0) return 0;
  if (typeof isProtectedPouchClass === "function" && isProtectedPouchClass(slug)) {
    toast(`Itens de classificação ${it.cls} são protegidos e não podem ser vendidos pela Loot Pouch.`, "bad");
    return 0;
  }
  const unit = pouchUnitSellPrice(it);
  const value = unit * count;
  if (!Number.isFinite(value) || value <= 0) {
    toast("Esse item não possui valor de venda.");
    return 0;
  }
  p.gold = Math.max(0, (Number(p.gold) || 0) + value);
  addLog("sell", `Vendeu ${count}x ${it.n} do Loot Pouch por <span class="gold-txt">${fmtFull(value)} gp</span>`);
  delete p.lootPouch[slug];
  p.lootPouch = p.lootPouch;
  return value;
}

/* Persiste venda da pouch. Online (combate ou cidade) usa a API autoritativa
 * — sem ela a venda local "voltava": a pouch é server-owned e o PUT comum
 * restaurava os itens ao trocar de personagem/reload. Offline grava local. */
function persistLootPouchSell(p, options) {
  const opts = options || {};
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountSellLootPouch === "function" && typeof sessionToken === "function" && p && p.id;
  if (useAccount) {
    return accountSellLootPouch(sessionToken(), p.id, opts.slug || null).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.lootPouch) {
          p.lootPouch = result.lootPouch || {};
          if (result.bag) p.bag = result.bag || {};
          if (result.itemInstances) p.itemInstances = result.itemInstances || [];
        }
      } else {
        toast((result && result.msg) || "Não foi possível vender a Loot Pouch online.", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      else if (typeof renderLootPouch === "function") renderLootPouch(p);
      return result || { ok: false };
    }).catch(() => {
      toast("Não foi possível vender a Loot Pouch online.", "bad");
      return { ok: false };
    });
  }
  if (typeof save === "function") save();
  return Promise.resolve({ ok: true, local: true, gold: opts.gold || 0 });
}

/* Destroy/discard de um stack da pouch. Online: API (lootPouch é protected no
 * PUT). Offline: remove local + save. */
function persistLootPouchDestroy(p, slug) {
  if (!p || !slug) return Promise.resolve({ ok: false });
  const count = Math.max(0, Math.floor(Number(p.lootPouch && p.lootPouch[slug]) || 0));
  if (count <= 0) return Promise.resolve({ ok: false, msg: "Item não encontrado." });
  const it = typeof GAMEDATA !== "undefined" && GAMEDATA.items ? GAMEDATA.items[slug] : null;
  const name = it && it.n ? it.n : slug;
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountDestroyLootPouchItem === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    return accountDestroyLootPouchItem(sessionToken(), p.id, slug).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.lootPouch) {
          p.lootPouch = result.lootPouch || {};
        } else {
          delete p.lootPouch[slug];
        }
        if (typeof addLog === "function")
          addLog("info", `Destruiu ${count}x <b>${name}</b>.`);
      } else {
        toast((result && result.msg) || "Não foi possível destruir o item.", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      else if (typeof renderLootPouch === "function") renderLootPouch(p);
      return result || { ok: false };
    }).catch(() => {
      toast("Não foi possível destruir o item.", "bad");
      return { ok: false };
    });
  }
  delete p.lootPouch[slug];
  if (typeof addLog === "function") addLog("info", `Destruiu ${count}x <b>${name}</b>.`);
  if (typeof save === "function") save();
  if (typeof renderAll === "function") renderAll();
  else if (typeof renderLootPouch === "function") renderLootPouch(p);
  return Promise.resolve({ ok: true, local: true, destroyed: count });
}

/* Persiste Auto Supply Stash por item (online: instância ou personagem). */
function persistAutoSupplyStash(p, slug, on) {
  if (!p || !slug) return Promise.resolve({ ok: false });
  if (typeof setAutoSupplyStash === "function") setAutoSupplyStash(p, slug, on);
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountSetAutoSupplyStash === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    return accountSetAutoSupplyStash(sessionToken(), p.id, slug, on).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.autoSupplyStash) {
          p.config = p.config || {};
          p.config.autoSupplyStash = result.autoSupplyStash;
        }
      } else if (!result || !result.ok) {
        // Reverte o toggle local se a API falhou.
        if (typeof setAutoSupplyStash === "function") setAutoSupplyStash(p, slug, !on);
        toast((result && result.msg) || "Não foi possível salvar Auto Supply Stash.", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      else {
        if (typeof renderLootPouch === "function") renderLootPouch(p);
        if (typeof renderSupplyStash === "function") renderSupplyStash(p);
      }
      return result || { ok: false };
    }).catch(() => {
      if (typeof setAutoSupplyStash === "function") setAutoSupplyStash(p, slug, !on);
      toast("Não foi possível salvar Auto Supply Stash.", "bad");
      return { ok: false };
    });
  }
  if (typeof save === "function") save();
  return Promise.resolve({ ok: true, local: true, slug, on: !!on });
}

/* Persiste lootConfig (NÃO COLETAR / NÃO VENDER) — online precisa ir pra autoridade. */
function persistLootConfig(p) {
  if (!p) return Promise.resolve({ ok: false });
  const lootConfig = (typeof lootConfigList === "function")
    ? { noCollect: lootConfigList(p, "noCollect").slice(), noSell: lootConfigList(p, "noSell").slice() }
    : (p.lootConfig || { noCollect: [], noSell: [] });
  p.lootConfig = lootConfig;
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountSetLootConfig === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    return accountSetLootConfig(sessionToken(), p.id, lootConfig).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.lootConfig) {
          p.lootConfig = result.lootConfig;
        }
      } else if (!result || !result.ok) {
        toast((result && result.msg) || "Não foi possível salvar regras de loot.", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      else if (typeof renderLootPouch === "function") renderLootPouch(p);
      return result || { ok: false };
    }).catch(() => {
      toast("Não foi possível salvar regras de loot.", "bad");
      return { ok: false };
    });
  }
  if (typeof save === "function") save();
  return Promise.resolve({ ok: true, local: true, lootConfig });
}

/* Move pouch/bag → Supply Stash com persistência (igual pouch-sell/clear).
 * Conta online: API autoritativa (PUT comum ignora lootPouch/supplyStash).
 * Offline/localStorage: move local + save. */
function persistMoveToSupplyStash(p, payload) {
  const opts = payload || {};
  const slug = opts.slug;
  const source = opts.source || "pouch";
  if (!p || !slug) return Promise.resolve({ ok: false });
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountMoveToSupplyStash === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    const snapshot = {
      bag: Object.assign({}, p.bag || {}),
      lootPouch: Object.assign({}, p.lootPouch || {}),
      supplyStash: Object.assign({}, p.supplyStash || {}),
      itemInstances: Array.isArray(p.itemInstances)
        ? p.itemInstances.map((inst) => Object.assign({}, inst)) : [],
    };
    const optimistic = typeof moveItemToSupplyStash === "function" &&
      moveItemToSupplyStash(p, { source, slug });
    const refreshStashUi = () => {
      if (typeof renderAll === "function") renderAll();
      else {
        if (typeof renderInventory === "function") renderInventory(p);
        if (typeof renderLootPouch === "function") renderLootPouch(p);
        if (typeof renderSupplyStash === "function") renderSupplyStash(p);
      }
    };
    if (optimistic) refreshStashUi();
    return accountMoveToSupplyStash(sessionToken(), p.id, { slug, source }).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.lootPouch || result.supplyStash || result.bag) {
          if (result.lootPouch) p.lootPouch = result.lootPouch || {};
          if (result.supplyStash) p.supplyStash = result.supplyStash || {};
          if (result.bag) p.bag = result.bag || {};
          if (result.itemInstances) p.itemInstances = result.itemInstances || [];
        } else if (!optimistic && typeof moveItemToSupplyStash === "function") {
          // Resposta sem snapshot: aplica localmente (já refletido no servidor).
          moveItemToSupplyStash(p, { source, slug });
        }
        if (typeof addLog === "function")
          addLog("info", `Moveu <b>${typeof itemName === "function" ? itemName(slug) : slug}</b> para a Supply Stash.`);
      } else {
        p.bag = snapshot.bag;
        p.lootPouch = snapshot.lootPouch;
        p.supplyStash = snapshot.supplyStash;
        p.itemInstances = snapshot.itemInstances;
        toast((result && result.msg) || "Não foi possível mover para a Supply Stash.", "bad");
      }
      refreshStashUi();
      return result || { ok: false };
    }).catch(() => {
      p.bag = snapshot.bag;
      p.lootPouch = snapshot.lootPouch;
      p.supplyStash = snapshot.supplyStash;
      p.itemInstances = snapshot.itemInstances;
      refreshStashUi();
      toast("Não foi possível mover para a Supply Stash.", "bad");
      return { ok: false };
    });
  }
  if (typeof moveItemToSupplyStash !== "function" || !moveItemToSupplyStash(p, { source, slug }))
    return Promise.resolve({ ok: false });
  if (typeof addLog === "function")
    addLog("info", `Moveu <b>${typeof itemName === "function" ? itemName(slug) : slug}</b> para a Supply Stash.`);
  if (typeof save === "function") save();
  if (typeof renderAll === "function") renderAll();
  return Promise.resolve({ ok: true, local: true });
}

/* Equipa 1 item da bag/Loot Pouch com persistência. Em instância online o
 * equip precisa passar pela autoridade (/api/instance/equip) — sem isso o
 * tick de 200ms restaurava o snapshot e a arma "voltava" (falcon bow).
 * Fora do combate o caminho local + save continua. A munição automática por
 * tipo de arma (bow→arrow, crossbow→bolt) é aplicada nos dois caminhos
 * (no online o servidor já faz; aqui o setActiveAmmo persiste pela API). */
function persistEquipFromContainer(p, slug, source, slot, instId) {
  if (!slug || !slot) { toast("Item/slot inválido para equipar."); return Promise.resolve(false); }
  const inCombat = typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat();
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountEquipItem === "function" && typeof sessionToken === "function" && p && p.id;
  if (useAccount) {
    // Preview IMEDIATO fora de combate (cidade): equipa no cliente na hora e
    // a API confirma/persiste (evita o equip "atrasado"/perdido ao trocar de
    // personagem — o PUT comum não persiste pouch/bag protegidos). Em combate
    // a autoridade decide (o tick restaura qualquer preview).
    let optimistic = false;
    if (!inCombat && typeof equipItemFromContainer === "function") {
      try {
        optimistic = !!equipItemFromContainer(p, slug, source, slot, instId);
        if (optimistic) {
          if (typeof autoSelectAmmoForWeapon === "function") autoSelectAmmoForWeapon(p, slug);
          if (typeof renderAll === "function") renderAll();
        }
      } catch (e) { optimistic = false; }
    }
    return accountEquipItem(sessionToken(), p.id, { slug, source, slot, instId }).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" && inCombat) {
          applyOnlineAuthorityState(result.state, null, result.version);
        }
        const it = GAMEDATA.items[slug];
        toast(`Equipou <b>${it && it.n ? it.n : slug}</b>`);
        if (typeof renderAll === "function") renderAll();
        return true;
      }
      // Falha: fora de combate restaura do último snapshot conhecido do cache
      // (o preview otimista fica sem persistência); em combate o próximo tick
      // já reverte.
      if (!inCombat && optimistic && typeof accountCharacterCacheRead === "function") {
        try {
          const cache = accountCharacterCacheRead();
          const summary = cache.find((c) => String(c.id) === String(p.id));
          const snap = summary && summary.snapshot;
          if (snap) {
            p.equip = snap.equip || p.equip;
            p.bag = snap.bag || p.bag;
            p.lootPouch = snap.lootPouch || p.lootPouch;
            p.itemInstances = snap.itemInstances || p.itemInstances;
          }
        } catch (e) { /* restauração best-effort */ }
        if (typeof renderAll === "function") renderAll();
      }
      toast((result && result.msg) || "Não foi possível equipar.", "bad");
      return false;
    }).catch(() => {
      toast("Não foi possível equipar.", "bad");
      return false;
    });
  }
  const ok = typeof equipItemFromContainer === "function" &&
    equipItemFromContainer(p, slug, source, slot, instId);
  if (ok) {
    if (typeof autoSelectAmmoForWeapon === "function") autoSelectAmmoForWeapon(p, slug);
    if (typeof save === "function") save();
    if (typeof renderAll === "function") renderAll();
  }
  return Promise.resolve(ok);
}

/* Desequipa 1 slot com persistência (mesmo racional do equip: sem a rota
 * autoritativa o tick restaura o item no slot). */
function persistUnequipFromContainer(p, slot, dest) {
  if (!slot) { toast("Slot inválido para desequipar."); return Promise.resolve(false); }
  const inCombat = typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat();
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountEquipItem === "function" && typeof sessionToken === "function" && p && p.id;
  if (useAccount) {
    // Preview imediato fora de combate (cidade), igual ao equip.
    let optimistic = false;
    if (!inCombat && typeof unequipToContainer === "function") {
      try {
        optimistic = !!unequipToContainer(p, slot, dest || "bag");
        if (optimistic && typeof renderAll === "function") renderAll();
      } catch (e) { optimistic = false; }
    }
    return accountEquipItem(sessionToken(), p.id, { unequip: true, slot, dest }).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" && inCombat) {
          applyOnlineAuthorityState(result.state, null, result.version);
        }
        if (typeof renderAll === "function") renderAll();
        return true;
      }
      if (!inCombat && optimistic && typeof accountCharacterCacheRead === "function") {
        try {
          const cache = accountCharacterCacheRead();
          const summary = cache.find((c) => String(c.id) === String(p.id));
          const snap = summary && summary.snapshot;
          if (snap) {
            p.equip = snap.equip || p.equip;
            p.bag = snap.bag || p.bag;
            p.lootPouch = snap.lootPouch || p.lootPouch;
            p.itemInstances = snap.itemInstances || p.itemInstances;
          }
        } catch (e) { /* restauração best-effort */ }
        if (typeof renderAll === "function") renderAll();
      }
      toast((result && result.msg) || "Não foi possível desequipar.", "bad");
      return false;
    }).catch(() => {
      toast("Não foi possível desequipar.", "bad");
      return false;
    });
  }
  const ok = typeof unequipToContainer === "function" && unequipToContainer(p, slot, dest || "bag");
  if (ok && typeof save === "function") save();
  if (ok && typeof renderAll === "function") renderAll();
  return Promise.resolve(ok);
}

/* Equipa 1 item da Supply Stash com persistência (supplyStash protected no PUT). */
function persistEquipFromSupplyStash(p, slug, slot) {
  if (!p || !slug) return Promise.resolve({ ok: false });
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountEquipFromSupplyStash === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    return accountEquipFromSupplyStash(sessionToken(), p.id, { slug, slot }).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.supplyStash || result.equip) {
          if (result.supplyStash) p.supplyStash = result.supplyStash || {};
          if (result.equip) p.equip = result.equip || {};
          if (result.bag) p.bag = result.bag || {};
          if (result.itemInstances) p.itemInstances = result.itemInstances || [];
        } else if (typeof equipItemFromContainer === "function") {
          equipItemFromContainer(p, slug, "stash", slot);
        }
        const it = typeof GAMEDATA !== "undefined" && GAMEDATA.items && GAMEDATA.items[slug];
        toast(`Equipou <b>${it && it.n ? it.n : slug}</b> da Supply Stash.`);
      } else {
        toast((result && result.msg) || "Não foi possível equipar da Supply Stash.", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      return result || { ok: false };
    }).catch(() => {
      toast("Não foi possível equipar da Supply Stash.", "bad");
      return { ok: false };
    });
  }
  if (typeof equipItemFromContainer !== "function" || !equipItemFromContainer(p, slug, "stash", slot))
    return Promise.resolve({ ok: false });
  const it = typeof GAMEDATA !== "undefined" && GAMEDATA.items && GAMEDATA.items[slug];
  toast(`Equipou <b>${it && it.n ? it.n : slug}</b> da Supply Stash.`);
  if (typeof save === "function") save();
  if (typeof renderAll === "function") renderAll();
  return Promise.resolve({ ok: true, local: true });
}

/* Retira da Supply Stash (bag/pouch/destroy) com persistência. */
function persistWithdrawFromSupplyStash(p, opts) {
  opts = opts || {};
  const slug = opts.slug;
  const dest = opts.dest || "bag";
  const qty = opts.qty;
  if (!p || !slug) return Promise.resolve({ ok: false });
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountWithdrawFromSupplyStash === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    return accountWithdrawFromSupplyStash(sessionToken(), p.id, { slug, dest, qty }).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.supplyStash) {
          p.supplyStash = result.supplyStash || {};
          if (result.lootPouch) p.lootPouch = result.lootPouch || {};
          if (result.bag) p.bag = result.bag || {};
          if (result.itemInstances) p.itemInstances = result.itemInstances || [];
        } else if (dest === "destroy" && typeof removeSupplyStash === "function") {
          const n = qty != null ? qty : ((p.supplyStash && p.supplyStash[slug]) || 0);
          if (n > 0) removeSupplyStash(p, slug, n);
        } else if (dest === "bag" && typeof moveItemToBag === "function") {
          moveItemToBag(p, { source: "stash", slug });
        } else if (dest === "pouch") {
          const n = qty != null ? qty : ((p.supplyStash && p.supplyStash[slug]) || 0);
          if (n > 0 && typeof addLootPouch === "function" && typeof removeSupplyStash === "function") {
            addLootPouch(p, slug, n);
            removeSupplyStash(p, slug, n);
          }
        }
      } else {
        toast((result && result.msg) || "Não foi possível retirar da Supply Stash.", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      return result || { ok: false };
    }).catch(() => {
      toast("Não foi possível retirar da Supply Stash.", "bad");
      return { ok: false };
    });
  }
  if (dest === "destroy") {
    const n = qty != null ? qty : ((p.supplyStash && p.supplyStash[slug]) || 0);
    if (n <= 0 || typeof removeSupplyStash !== "function" || !removeSupplyStash(p, slug, n))
      return Promise.resolve({ ok: false });
  } else if (dest === "bag") {
    if (typeof moveItemToBag !== "function" || !moveItemToBag(p, { source: "stash", slug }))
      return Promise.resolve({ ok: false });
  } else if (dest === "pouch") {
    const n = qty != null ? qty : ((p.supplyStash && p.supplyStash[slug]) || 0);
    if (n <= 0) return Promise.resolve({ ok: false });
    if (typeof addLootPouch === "function") addLootPouch(p, slug, n);
    if (typeof removeSupplyStash === "function") removeSupplyStash(p, slug, n);
  } else {
    return Promise.resolve({ ok: false });
  }
  if (typeof save === "function") save();
  if (typeof renderAll === "function") renderAll();
  return Promise.resolve({ ok: true, local: true });
}

/* Vende tudo que estiver liberado dentro do Loot Pouch.
   Respeita "Não vender", classes 3/4 e materiais de imbue (canSellLootPouchItem). */
function sellAllPouch(p) {
  let total = 0, kinds = 0;
  // Snapshot das chaves: sellPouchItem deleta entradas; preço inválido não conta.
  for (const slug of Object.keys(p.lootPouch || {})) {
    if (typeof canSellLootPouchItem === "function") {
      if (!canSellLootPouchItem(p, slug)) continue;
    } else {
      const it = GAMEDATA.items[slug];
      if (!it || isNoSell(p, slug)) continue;
      if (typeof isProtectedPouchClass === "function" && isProtectedPouchClass(slug)) continue;
      if (typeof isImbueMatItem === "function" && isImbueMatItem(it, slug)) continue;
      if (pouchUnitSellPrice(it) <= 0) continue;
    }
    const gained = sellPouchItem(p, slug);
    if (!Number.isFinite(gained) || gained <= 0) continue;
    total += gained;
    kinds++;
  }
  return { gold: Number.isFinite(total) ? total : 0, kinds: kinds };
}

/* Sell All com persistência: em hunt online não muta localmente — só o
 * servidor vende (evita ouro/pouch reaparecer no próximo tick/autosave). */
function sellAllPouchAndPersist(p) {
  if (!p) return Promise.resolve({ gold: 0, kinds: 0, ok: false });
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountSellLootPouch === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    const beforeKeys = Object.keys(p.lootPouch || {}).filter((slug) => {
      if ((p.lootPouch[slug] || 0) <= 0) return false;
      if (typeof canSellLootPouchItem === "function") return canSellLootPouchItem(p, slug);
      const it = GAMEDATA.items[slug];
      if (!it || (typeof isNoSell === "function" && isNoSell(p, slug))) return false;
      if (typeof isProtectedPouchClass === "function" && isProtectedPouchClass(slug)) return false;
      if (typeof isImbueMatItem === "function" && isImbueMatItem(it, slug)) return false;
      return pouchUnitSellPrice(it) > 0;
    });
    if (!beforeKeys.length) return Promise.resolve({ gold: 0, kinds: 0, ok: true });
    return accountSellLootPouch(sessionToken(), p.id, null).then((result) => {
      if (result && result.ok) {
        if (result.state && typeof applyOnlineAuthorityState === "function" &&
            typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
          applyOnlineAuthorityState(result.state, null, result.version);
        } else if (result.lootPouch) {
          p.lootPouch = result.lootPouch || {};
          if (result.bag) p.bag = result.bag || {};
          if (result.itemInstances) p.itemInstances = result.itemInstances || [];
        }
      } else {
        toast((result && result.msg) || "Não foi possível vender a Loot Pouch online.", "bad");
        return { gold: 0, kinds: 0, ok: false };
      }
      const gold = Number(result.gold);
      const safeGold = Number.isFinite(gold) && gold > 0 ? Math.floor(gold) : 0;
      if (safeGold > 0 && typeof addLog === "function")
        addLog("sell", `Vendeu a Loot Pouch por <span class="gold-txt">${fmtFull(safeGold)} gp</span>`);
      if (typeof renderAll === "function") renderAll();
      else if (typeof renderLootPouch === "function") renderLootPouch(p);
      // gold=0 com itens “vendáveis” no client = catálogo server desatualizado;
      // não fingir sucesso (evita UI/pouch “travada” sem feedback).
      if (!safeGold) {
        toast("Nada vendido — itens sem preço NPC ou ainda na pouch.", "bad");
        return { gold: 0, kinds: 0, ok: true };
      }
      return { gold: safeGold, kinds: beforeKeys.length, ok: true };
    }).catch(() => {
      toast("Não foi possível vender a Loot Pouch online.", "bad");
      return { gold: 0, kinds: 0, ok: false };
    });
  }
  const r = sellAllPouch(p);
  if (r.kinds && typeof save === "function") save();
  return Promise.resolve(Object.assign({ ok: true }, r));
}

/* Valor total vendável da mochila (para o hint do botão). */
function bagSellableValue(p) {
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  let total = 0;
  for (const slug of Object.keys(p.bag || {})) {
    const it = GAMEDATA.items[slug];
    const count = p.bag[slug] || 0;
    if (!it || count <= 0 || typeof itemUsesInstances === "function" && itemUsesInstances(slug)) continue;
    if (typeof isNoSell === "function" && isNoSell(p, slug)) continue;
    total += (it.sell || 0) * count;
  }
  for (const inst of (p.itemInstances || [])) {
    if (!inst || inst.loc !== "bag") continue;
    const it = GAMEDATA.items[inst.slug];
    if (!it || (it.sell || 0) <= 0) continue;
    if (inst.tier > 0) continue;                 // item tierado não é vendido
    if (typeof isNoSell === "function" && isNoSell(p, inst.slug)) continue;
    total += it.sell || 0;
  }
  return total;
}

/* Botão provisório "Vender tudo" da mochila: vende tudo que tem valor
 * (empilhado E por instância), respeitando a marca "Não vender" e nunca
 * vendendo item tierado. Itens sem valor continuam na bag. */
function sellAllBag(p) {
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  let total = 0, kinds = 0, guardados = 0;
  for (const slug of Object.keys(p.bag || {})) {
    const it = GAMEDATA.items[slug];
    const count = p.bag[slug] || 0;
    if (!it || count <= 0 || typeof itemUsesInstances === "function" && itemUsesInstances(slug)) continue;
    if ((it.sell || 0) <= 0) { guardados++; continue; }
    if (typeof isNoSell === "function" && isNoSell(p, slug)) { guardados++; continue; }
    total += (it.sell || 0) * count;
    delete p.bag[slug];
    kinds++;
  }
  const rest = [];
  for (const inst of (p.itemInstances || [])) {
    if (!inst || inst.loc !== "bag") { rest.push(inst); continue; }
    const it = GAMEDATA.items[inst.slug];
    if (!it || (it.sell || 0) <= 0 || inst.tier > 0 ||
        (typeof isNoSell === "function" && isNoSell(p, inst.slug))) {
      rest.push(inst);
      guardados++;
      continue;
    }
    total += it.sell || 0;
    kinds++;
  }
  p.itemInstances = rest;
  if (typeof syncBagCountsFromInstances === "function") syncBagCountsFromInstances(p);
  if (total > 0) {
    p.gold += total;
    addLog("sell", `Vendeu tudo da mochila por <span class="gold-txt">${fmtFull(total)} gp</span> (${kinds} tipos).`);
    toast(`Vendeu tudo da mochila: <b>+${fmtFull(total)} gp</b>`);
  } else {
    toast(guardados ? "Nada vendável na mochila (itens sem valor/tierados ficam)." : "Mochila vazia ou sem itens vendáveis.", "bad");
  }
  renderAll();
  return { gold: total, kinds, guardados };
}

/* Persiste venda da mochila: online usa API (gold protected no PUT; em hunt
 * o tick restaura bag). Offline muta local + save. */
function persistBagSell(p, options) {
  const opts = options || {};
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountSellBag === "function" && typeof sessionToken === "function" && p && p.id;
  if (useAccount) {
    return accountSellBag(sessionToken(), p.id, {
      slug: opts.slug || null,
      instId: opts.instId || null,
    }).then((result) => {
      if (result && result.ok && result.state && typeof applyOnlineAuthorityState === "function" &&
          typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
        applyOnlineAuthorityState(result.state, null, result.version);
      } else if (result && result.ok) {
        // Cidade: accountSellBag já aplicou bag/gold no G.p quando possível.
        if (result.bag && p) p.bag = result.bag;
        if (result.itemInstances && p) p.itemInstances = result.itemInstances;
      } else if (!result || !result.ok) {
        toast((result && result.msg) || "Não foi possível vender a mochila online.", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      return result || { ok: false };
    }).catch(() => {
      toast("Não foi possível vender a mochila online.", "bad");
      return { ok: false };
    });
  }
  const gold = sellBagItem(p, opts.slug, opts.instId);
  if (gold > 0 && typeof save === "function") save();
  if (typeof renderAll === "function") renderAll();
  return Promise.resolve({ ok: gold > 0, local: true, gold });
}

/* Sell All da mochila com persistência — não muta localmente online. */
function sellAllBagAndPersist(p) {
  if (!p) return Promise.resolve({ gold: 0, kinds: 0, ok: false });
  const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
    typeof accountSellBag === "function" && typeof sessionToken === "function" && p.id;
  if (useAccount) {
    const beforeVal = typeof bagSellableValue === "function" ? bagSellableValue(p) : 0;
    if (beforeVal <= 0) {
      toast("Mochila vazia ou sem itens vendáveis.", "bad");
      return Promise.resolve({ gold: 0, kinds: 0, ok: true });
    }
    return accountSellBag(sessionToken(), p.id, {}).then((result) => {
      if (result && result.ok && result.state && typeof applyOnlineAuthorityState === "function" &&
          typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
        applyOnlineAuthorityState(result.state, null, result.version);
      } else if (result && result.ok) {
        if (result.bag) p.bag = result.bag;
        if (result.itemInstances) p.itemInstances = result.itemInstances;
      } else if (!result || !result.ok) {
        toast((result && result.msg) || "Não foi possível vender a mochila online.", "bad");
        return { gold: 0, kinds: 0, ok: false };
      }
      const gold = Number(result.gold);
      const safeGold = Number.isFinite(gold) && gold > 0 ? Math.floor(gold) : 0;
      if (safeGold > 0) {
        if (typeof addLog === "function")
          addLog("sell", `Vendeu tudo da mochila por <span class="gold-txt">${fmtFull(safeGold)} gp</span>`);
        toast(`Vendeu tudo da mochila: <b>+${fmtFull(safeGold)} gp</b>`);
      } else {
        toast("Nada vendável na mochila (itens sem valor/tierados ficam).", "bad");
      }
      if (typeof renderAll === "function") renderAll();
      return { gold: safeGold, kinds: safeGold > 0 ? 1 : 0, ok: true };
    }).catch(() => {
      toast("Não foi possível vender a mochila online.", "bad");
      return { gold: 0, kinds: 0, ok: false };
    });
  }
  const r = sellAllBag(p);
  const gold = typeof r === "object" && r ? (Number(r.gold) || 0) : (Number(r) || 0);
  if (gold > 0 && typeof save === "function") save();
  return Promise.resolve(Object.assign({ ok: true }, typeof r === "object" && r ? r : { gold, kinds: gold > 0 ? 1 : 0 }));
}

function renderLootPouch(p) {
  const box = $("#lootpouch");
  if (!box) return;
  p.lootPouch = p.lootPouch || {};
  p.config = p.config || {};
  if (typeof bindDrop === "function" && !box.dataset.dropBound) {
    box.dataset.dropBound = "1";
    bindDrop(box, (payload) => {
      // ONLINE: bag→pouch precisa da API autoritativa (a bag é compartilhada
      // e o PUT comum não persiste o movimento — o item "voltava").
      if (payload && payload.source === "bag" &&
          typeof accountApiConfigured === "function" && accountApiConfigured() &&
          typeof accountMoveBagToPouch === "function" &&
          typeof sessionToken === "function" && G.p && G.p.id) {
        const instId = payload.instId || null;
        const qty = instId ? 1 : ((G.p.bag && G.p.bag[payload.slug]) || 0);
        if (qty <= 0) return false;
        accountMoveBagToPouch(sessionToken(), G.p.id, { slug: payload.slug, qty, instId }).then((result) => {
          if (result && result.ok) {
            if (result.state && typeof applyOnlineAuthorityState === "function" &&
                typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat()) {
              applyOnlineAuthorityState(result.state, null, result.version);
            } else {
              if (result.lootPouch) G.p.lootPouch = result.lootPouch || {};
              if (result.bag) G.p.bag = result.bag || {};
              if (result.itemInstances) G.p.itemInstances = result.itemInstances || [];
            }
            if (typeof addLog === "function")
              addLog("info", `Moveu <b>${itemName(payload.slug)}</b> para a Loot Pouch.`);
          } else {
            if (typeof toast === "function")
              toast((result && result.msg) || "Não foi possível mover para a Loot Pouch.", "bad");
          }
          if (typeof renderAll === "function") renderAll();
        });
        return false; // async — bindDrop não duplica o move
      }
      const ok = typeof moveItemToPouch === "function" && moveItemToPouch(G.p, payload);
      if (ok) addLog("info", `Moveu <b>${itemName(payload.slug)}</b> para a Loot Pouch.`);
      return ok;
    });
  }
  const entries = Object.keys(p.lootPouch)
    .filter((slug) => (p.lootPouch[slug] || 0) > 0 && GAMEDATA.items[slug])
    .sort((a, b) => pouchUnitSellPrice(GAMEDATA.items[b]) * p.lootPouch[b] -
                    pouchUnitSellPrice(GAMEDATA.items[a]) * p.lootPouch[a]);
  const sellBtn = $("#btn-pouch-sell-all");
  if (sellBtn) sellBtn.disabled = !entries.some((s) =>
    typeof canSellLootPouchItem === "function" && canSellLootPouchItem(p, s));
  // Autoseller: vende TUDO automaticamente quando a pouch atingir o total de
  // itens configurado. Respeita as regras do seller (lista "NÃO VENDER" e
  // itens sem valor). Cooldown entre vendas: 5 min; VIP 2 min.
  const vipOk = typeof vipAutoSellAllowed === "function" && vipAutoSellAllowed();
  const asOn = !!p.config.pouchAutoSell;
  const asPct = p.config.pouchAutoSellPct === undefined ? 80 : p.config.pouchAutoSellPct;
  const asFill = pouchFillPct(p);
  const pouchSlots = typeof lootPouchSlotsUsed === "function" ? lootPouchSlotsUsed(p) : entries.length;
  const cdMs = typeof pouchAutoSellCooldownMs === "function" ? pouchAutoSellCooldownMs(p) : POUCH_AUTOSELL_CD_MS;
  const lastAt = Number(p._pouchAutoSellAt) || 0;
  const restante = Math.max(0, cdMs - (Date.now() - lastAt));
  const cdTxt = restante > 0
    ? `próxima venda em ${restante >= 60000 ? Math.ceil(restante / 60000) + "m" : Math.max(1, Math.ceil(restante / 1000)) + "s"}`
    : `entre vendas: ${vipOk ? "2 min" : "5 min"}`;
  const asBox = `
    <div class="pouch-autoseller ${asOn ? "on" : ""}" style="grid-column:1/-1">
      <div class="row" style="justify-content:space-between;align-items:center;gap:6px">
        <span class="small" style="${asOn ? "color:#9ce84a;font-weight:bold" : ""}">⚡ Autoseller ${vipOk ? "VIP" : ""}</span>
        <span class="tiny dim">${pouchSlots} stacks · ${asFill} itens · vende em ${asPct} itens · ${cdTxt}</span>
        <button class="sm ${asOn ? "primary" : ""}" id="btn-pouch-autosell">${asOn ? "ATIVO — desligar" : "LIGAR"}</button>
      </div>
      <div class="row mt4" style="align-items:center;gap:6px">
        <input type="range" id="pouch-autosell-pct" min="10" max="100" step="5" value="${asPct}"
          style="flex:1" ${asOn ? "" : "disabled"}>
        <span class="tiny" style="width:auto;text-align:right;color:#d4af37">${asPct} itens</span>
      </div>
      <div class="tiny dim mt4">Sem limite de slots. Ao somar ${asPct} itens, vende apenas itens liberados (a cada 5 min; VIP 2 min); classificações 3 e 4 ficam protegidas.</div>
    </div>`;
  const btnAs = $("#btn-pouch-autosell");
  if (btnAs && !btnAs._bound) {
    btnAs._bound = true;
  }
  if (!entries.length) {
    box.innerHTML = asBox + `<div class="dim small center" style="grid-column:1/-1;padding:10px">Loot Pouch vazia</div>`;
    bindPouchAutoseller(p);
    return;
  }
  box.innerHTML = asBox + `<div class="tiny dim" style="grid-column:1/-1;margin:0 0 3px 2px">
      Auto-seller: ${entries.filter((s) => typeof canSellLootPouchItem === "function" && canSellLootPouchItem(p, s)).length} vendável · classes 3/4 protegidas
    </div>` + entries.map((slug) =>
    `<div class="inv-item ${isNoSell(p, slug) ? "locked" : ""} ${itemClsBorder(slug)}" data-pouch-item="${slug}" draggable="true">
      ${itemImg(slug, 0, null, p.lootPouch[slug])}${p.lootPouch[slug] > 1 ? `<span class="cnt">${p.lootPouch[slug]}</span>` : ""}
    </div>`).join("");

  $$("#lootpouch [data-pouch-item]").forEach((el) => {
    const slug = el.dataset.pouchItem;
    if (typeof bindItemDrag === "function") bindItemDrag(el, { source: "pouch", slug: slug });
    const it = GAMEDATA.items[slug];
    el.addEventListener("mouseenter", () => {
      const noSell = isNoSell(p, slug), noCollect = isNoCollect(p, slug);
      const protectedClass = typeof isProtectedPouchClass === "function" && isProtectedPouchClass(slug);
      const flags = [protectedClass ? `Classe ${it.cls} protegida` : "",
        noSell ? "Não vender" : "", noCollect ? "Não coletar" : ""].filter(Boolean).join(" · ");
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
  bindPouchAutoseller(p);
}

/* Liga o toggle + slider do Autoseller da Loot Pouch. */
/* ---------------------------------------------------------- Supply Stash */
function renderSupplyStash(p) {
  const box = $("#supplystash");
  if (!box) return;
  if (typeof ensureSupplyStash === "function") ensureSupplyStash(p);
  else { p.supplyStash = p.supplyStash || {}; }
  if (typeof bindDrop === "function" && !box.dataset.dropBound) {
    box.dataset.dropBound = "1";
    bindDrop(box, (payload) => {
      if (!payload || !payload.slug || payload.source === "depot") return false;
      if (typeof persistMoveToSupplyStash === "function") {
        persistMoveToSupplyStash(G.p, {
          source: payload.source || "pouch",
          slug: payload.slug,
        });
        // Persistência assíncrona cuida de save/render; não duplique o move.
        return false;
      }
      const ok = typeof moveItemToSupplyStash === "function" && moveItemToSupplyStash(G.p, payload);
      if (ok) addLog("info", `Moveu <b>${itemName(payload.slug)}</b> para a Supply Stash.`);
      return ok;
    });
  }
  const used = typeof supplyStashSlotsUsed === "function" ? supplyStashSlotsUsed(p) : Object.keys(p.supplyStash || {}).length;
  const cap = typeof SUPPLY_STASH_CAP !== "undefined" ? SUPPLY_STASH_CAP : 20;
  const entries = Object.keys(p.supplyStash || {})
    .filter((slug) => (p.supplyStash[slug] || 0) > 0 && GAMEDATA.items[slug])
    .sort((a, b) => (GAMEDATA.items[a].n || a).localeCompare(GAMEDATA.items[b].n || b));
  const head = `<div class="tiny dim" style="grid-column:1/-1;margin:0 0 3px 2px">
    slots ${used}/${cap} · rings/amulets com cargas · Auto Supply Stash no botão direito
  </div>`;
  if (!entries.length) {
    box.innerHTML = head + `<div class="dim small center" style="grid-column:1/-1;padding:10px">Supply Stash vazia</div>`;
    return;
  }
  box.innerHTML = head + entries.map((slug) => {
    const n = p.supplyStash[slug];
    const it = GAMEDATA.items[slug];
    const auto = typeof isAutoSupplyStash === "function" && isAutoSupplyStash(p, slug);
    return `<div class="inv-item ${itemClsBorder(slug)}${auto ? " stash-auto" : ""}" data-stash-item="${slug}" draggable="true"
      title="${it.n}${auto ? " · Auto ON" : ""}">
      ${itemImg(slug, 0, null, n)}${n > 1 ? `<span class="cnt">${n > 999 ? (Math.floor(n / 100) / 10) + "k" : n}</span>` : ""}
    </div>`;
  }).join("");

  $$("#supplystash [data-stash-item]").forEach((el) => {
    const slug = el.dataset.stashItem;
    if (typeof bindItemDrag === "function") bindItemDrag(el, { source: "stash", slug: slug });
    el.addEventListener("mouseenter", () => {
      const n = p.supplyStash[slug] || 0;
      const auto = typeof isAutoSupplyStash === "function" && isAutoSupplyStash(p, slug);
      showTip(itemTip(slug, `${n}x · Supply Stash${auto ? " · Auto ON" : ""} · Clique direito para opções`));
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openSupplyStashItemMenu(p, slug, e.clientX, e.clientY);
    });
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openSupplyStashItemMenu(p, slug, e.clientX, e.clientY);
    });
  });
}

function openSupplyStashItemMenu(p, slug, x, y) {
  const it = GAMEDATA.items[slug];
  if (!it) return;
  const count = (p.supplyStash && p.supplyStash[slug]) || 0;
  const autoOn = typeof isAutoSupplyStash === "function" && isAutoSupplyStash(p, slug);
  const opts = [
    { label: "Detalhes", action: () => openItemDetails(slug, count) },
    ...(it.s ? [{
      label: "Equipar",
      hint: it.s,
      action: () => {
        if (typeof persistEquipFromSupplyStash === "function") {
          persistEquipFromSupplyStash(p, slug, it.s);
          return;
        }
        if (typeof equipItemFromContainer === "function" &&
            equipItemFromContainer(p, slug, "stash", it.s)) {
          toast(`Equipou <b>${it.n}</b> da Supply Stash.`);
          renderAll();
        }
      },
    }] : []),
    {
      label: "Mover para backpack",
      action: () => {
        if (typeof persistWithdrawFromSupplyStash === "function") {
          persistWithdrawFromSupplyStash(p, { slug, dest: "bag" });
          return;
        }
        if (!addItem(p, slug, count)) { toast("Mochila cheia."); return; }
        removeSupplyStash(p, slug, count);
        renderAll();
      },
    },
    {
      label: "Mover para Loot Pouch",
      action: () => {
        if (typeof persistWithdrawFromSupplyStash === "function") {
          persistWithdrawFromSupplyStash(p, { slug, dest: "pouch" });
          return;
        }
        addLootPouch(p, slug, count);
        removeSupplyStash(p, slug, count);
        renderAll();
      },
    },
    {
      label: autoOn ? "Auto Supply Stash: ON" : "Auto Supply Stash",
      hint: autoOn ? "desligar" : "ligar",
      action: () => {
        setAutoSupplyStash(p, slug, !autoOn);
        toast(!autoOn
          ? `<b>${it.n}</b>: loot irá para a Supply Stash.`
          : `<b>${it.n}</b>: Auto Supply Stash desligado.`);
        if (typeof persistAutoSupplyStash === "function") {
          persistAutoSupplyStash(p, slug, !autoOn);
          return;
        }
        if (typeof save === "function") save();
        renderAll();
      },
    },
    {
      label: "Destruir",
      danger: true,
      action: () => {
        if (!confirm(`Destruir ${count}x ${it.n} da Supply Stash?`)) return;
        if (typeof persistWithdrawFromSupplyStash === "function") {
          persistWithdrawFromSupplyStash(p, { slug, dest: "destroy" });
          return;
        }
        removeSupplyStash(p, slug, count);
        renderAll();
      },
    },
  ];
  showContextMenu(x, y, `${it.n} <span class="dim">${count}x</span>`, opts);
}

function bindPouchAutoseller(p) {
  const btn = $("#btn-pouch-autosell");
  const slider = $("#pouch-autosell-pct");
  if (btn && !btn._bound) {
    btn._bound = true;
    btn.addEventListener("click", () => {
      p.config.pouchAutoSell = !p.config.pouchAutoSell;
      const vipOk = typeof vipAutoSellAllowed === "function" && vipAutoSellAllowed();
      toast(p.config.pouchAutoSell
        ? `Autoseller LIGADO — vende itens liberados quando a pouch somar ${p.config.pouchAutoSellPct === undefined ? 80 : p.config.pouchAutoSellPct} itens (a cada ${vipOk ? "2" : "5"} min; classes 3/4 protegidas)`
        : "Autoseller desligado");
      renderLootPouch(p);
    });
  }
  if (slider && !slider._bound) {
    slider._bound = true;
    slider.addEventListener("input", () => {
      p.config.pouchAutoSellPct = parseInt(slider.value, 10) || 80;
      // atualiza o rótulo sem re-renderizar (evita perder o arrasto)
      const label = slider.parentElement && slider.parentElement.querySelector("span.tiny");
      if (label) label.textContent = p.config.pouchAutoSellPct + " itens";
    });
    slider.addEventListener("change", () => {
      p.config.pouchAutoSellPct = parseInt(slider.value, 10) || 80;
      renderLootPouch(p);
    });
  }
}

/* Menu de opções de um item do Loot Pouch */
function openPouchItemMenu(p, slug, x, y) {
  const it = GAMEDATA.items[slug];
  if (!it) return;
  const count = p.lootPouch[slug] || 0;
  const noSell = isNoSell(p, slug);
  const noCollect = isNoCollect(p, slug);
  const protectedClass = typeof isProtectedPouchClass === "function" && isProtectedPouchClass(slug);
  const value = protectedClass ? 0 : pouchUnitSellPrice(it) * count;

  showContextMenu(x, y, `${it.n} <span class="dim">${count}x</span>`, [
    {
      label: "Detalhes",
      action: () => openItemDetails(slug, count),
    },
    ...(slug === "bag-you-desire" ? [{
      label: "Abrir",
      hint: "item Soul War aleatório → Depot",
      action: () => {
        const openLocal = () => {
          const depot = Array.isArray(p.depot) ? p.depot : [];
          if (depot.length >= 30) { toast("Depot cheio (30 slots).", "bad"); return; }
          const item = typeof soulwarOpenBag === "function" ? soulwarOpenBag(p) : null;
          if (!item) { toast("Não foi possível abrir a bag.", "bad"); return; }
          removeLootPouch(p, slug, 1);
          addLog("loot", `Abriu <b>Bag You Desire</b> e recebeu <b>${itemName(item)}</b> no Depot.`);
          const bagImg = typeof itemImg === "function" ? itemImg(item, 24) : "";
          toast(`<span style="display:flex;align-items:center;gap:6px">${bagImg}<span>Bag You Desire:<br><b>${itemName(item)}</b> no Depot</span></span>`, "rare");
          renderAll();
        };
        // Conta online: lootPouch é protected no PUT — sem API a bag "volta"
        // para a pouch no próximo estado do servidor (e o item duplica no depot).
        if (typeof sessionToken === "function" && sessionToken() && p && p.id &&
            typeof accountOpenBagYouDesire === "function") {
          accountOpenBagYouDesire(sessionToken(), p.id).then((result) => {
            if (result && result.ok) {
              if (result.state && typeof applyOnlineAuthorityState === "function")
                applyOnlineAuthorityState(result.state, null, result.version);
              else if (result.lootPouch) {
                p.lootPouch = result.lootPouch || {};
                if (result.depot) p.depot = result.depot || [];
              }
              addLog("loot", `Abriu <b>Bag You Desire</b> e recebeu <b>${itemName(result.item)}</b> no Depot.`);
              const bagImg2 = typeof itemImg === "function" ? itemImg(result.item, 24) : "";
              toast(`<span style="display:flex;align-items:center;gap:6px">${bagImg2}<span>Bag You Desire:<br><b>${itemName(result.item)}</b> no Depot</span></span>`, "rare");
              renderAll();
            } else {
              toast((result && result.msg) || "Não foi possível abrir a bag.", "bad");
            }
          });
          return;
        }
        openLocal();
      },
    }] : []),
    // Equipar direto da pouch foi REMOVIDO: itens só podem ser equipados
    // a partir da mochila. Primeiro mova da Loot Pouch para a backpack.

    {
      label: "Mover para backpack",
      action: () => {
        const moveLocal = () => {
          if (!addItem(p, slug, count)) { toast("Mochila cheia."); return false; }
          removeLootPouch(p, slug, count);
          addLog("info", `Moveu <b>${it.n}</b> do Loot Pouch para a mochila.`);
          return true;
        };
        // Conta online: lootPouch é protected no PUT — precisa API, senão
        // o item fica na pouch do servidor e DUPLICA na backpack após restart.
        if (typeof sessionToken === "function" && sessionToken() && p && p.id &&
            typeof accountMovePouchToBag === "function") {
          accountMovePouchToBag(sessionToken(), p.id, { slug: slug, qty: count }).then((result) => {
            if (result && result.ok) {
              if (result.state && typeof applyOnlineAuthorityState === "function")
                applyOnlineAuthorityState(result.state, null, result.version);
              else if (result.lootPouch) {
                p.lootPouch = result.lootPouch || {};
                if (result.bag) p.bag = result.bag || {};
                if (result.itemInstances) p.itemInstances = result.itemInstances || [];
              }
              addLog("info", `Moveu <b>${it.n}</b> do Loot Pouch para a mochila.`);
              toast(`Moveu <b>${it.n}</b> para a mochila.`);
              renderAll();
              return;
            }
            toast((result && result.msg) || "Não foi possível mover para a backpack.", "bad");
          });
          return;
        }
        if (!moveLocal()) return;
        if (typeof save === "function") save();
        renderAll();
      },
    },
    ...(typeof isSupplyStashableItem === "function" && isSupplyStashableItem(slug) ? [
      {
        label: (typeof isAutoSupplyStash === "function" && isAutoSupplyStash(p, slug))
          ? "Auto Supply Stash: ON" : "Auto Supply Stash",
        hint: "loot → stash",
        action: () => {
          const on = !(typeof isAutoSupplyStash === "function" && isAutoSupplyStash(p, slug));
          setAutoSupplyStash(p, slug, on);
          toast(on
            ? `<b>${it.n}</b>: loot irá para a Supply Stash.`
            : `<b>${it.n}</b>: Auto Supply Stash desligado.`);
          if (typeof persistAutoSupplyStash === "function") {
            persistAutoSupplyStash(p, slug, on);
            return;
          }
          if (typeof save === "function") save();
          renderAll();
        },
      },
      {
        label: "Mover para Supply Stash",
        action: () => {
          if (typeof persistMoveToSupplyStash === "function") {
            persistMoveToSupplyStash(p, { source: "pouch", slug: slug });
            return;
          }
          if (typeof moveItemToSupplyStash === "function" &&
              moveItemToSupplyStash(p, { source: "pouch", slug: slug })) {
            addLog("info", `Moveu <b>${it.n}</b> para a Supply Stash.`);
            if (typeof save === "function") save();
            renderAll();
          }
        },
      },
    ] : []),
    {
      label: noCollect ? "Voltar a coletar" : "Não coletar",
      hint: "autoloot",
      action: () => {
        if (noCollect) removeLootRuleByText(p, "noCollect", slug);
        else addLootRule(p, "noCollect", slug);
        toast(noCollect ? `<b>${it.n}</b> voltou para o autoloot.`
                        : `<b>${it.n}</b> será ignorado pelo autoloot.`);
        if (typeof persistLootConfig === "function") {
          persistLootConfig(p);
          return;
        }
        if (typeof save === "function") save();
        renderAll();
      },
    },
    ...(protectedClass ? [{
      label: `Classificação ${it.cls} protegida`,
      hint: "não pode ser vendida pela Loot Pouch",
      disabled: true,
    }] : [{
      label: noSell ? "Voltar a vender" : "Não vender",
      hint: "sell all",
      action: () => {
        if (noSell) removeLootRuleByText(p, "noSell", slug);
        else addLootRule(p, "noSell", slug);
        toast(noSell ? `<b>${it.n}</b> voltou para o sell all.`
                     : `<b>${it.n}</b> será ignorado pelo sell all.`);
        if (typeof persistLootConfig === "function") {
          persistLootConfig(p);
          return;
        }
        if (typeof save === "function") save();
        renderAll();
      },
    }]),
    ...(value > 0 ? [{
      label: `Vender · ${fmtFull(value)} gp`,
      hint: (typeof isImbueMatItem === "function" && isImbueMatItem(it, slug))
        ? "material de imbue" : undefined,
      action: () => {
        const useAccount = typeof accountApiConfigured === "function" && accountApiConfigured() &&
          typeof sessionToken === "function" && sessionToken() && p && p.id &&
          typeof persistLootPouchSell === "function";
        if (useAccount) {
          persistLootPouchSell(p, { slug }).then((result) => {
            if (result && result.ok && (Number(result.gold) || 0) > 0 && typeof addLog === "function") {
              const it2 = GAMEDATA.items[slug];
              addLog("sell", `Vendeu ${it2 ? it2.n : slug} do Loot Pouch por <span class="gold-txt">${fmtFull(result.gold)} gp</span>`);
            }
          });
          return;
        }
        if (sellPouchItem(p, slug) > 0) {
          if (typeof save === "function") save();
          renderAll();
        }
      },
    }] : (!protectedClass ? [{
      label: "Sem valor de venda",
      hint: "NPC não compra — use Destruir",
      disabled: true,
    }] : [])),
    {
      label: "Destruir",
      danger: true,
      hint: value <= 0 ? "item sem venda" : "",
      action: () => {
        if (!confirm(`Destruir ${count}x ${it.n}? Isso não pode ser desfeito.`)) return;
        if (typeof persistLootPouchDestroy === "function") {
          persistLootPouchDestroy(p, slug);
          return;
        }
        delete p.lootPouch[slug];
        addLog("info", `Destruiu ${count}x <b>${it.n}</b>.`);
        if (typeof save === "function") save();
        renderAll();
      },
    },
  ]);
}

function clearLootPouchWithConfirm(p) {
  if (!p) return;
  if (!confirm("Limpar toda a Loot Pouch? Itens serão perdidos.")) return;
  const kinds = typeof clearLootPouch === "function" ? clearLootPouch(p) : 0;
  p.lootPouch = p.lootPouch || {};
  if (typeof addLog === "function")
    addLog("info", kinds
      ? `Loot Pouch limpa (<b>${kinds}</b> tipo(s) removido(s)).`
      : "Loot Pouch já estava vazia.");
  toast(kinds ? "Loot Pouch limpa." : "Loot Pouch já estava vazia.");
  // Online em combate: a autoridade sobrescreve o snapshot local no tick —
  // a limpeza precisa ir pelo patch da instância (como a troca de munição).
  const onlineCombat = typeof onlineAuthorityCombat === "function" && onlineAuthorityCombat();
  if (onlineCombat && typeof accountClearInstanceLootPouch === "function" &&
      typeof sessionToken === "function" && p.id) {
    accountClearInstanceLootPouch(sessionToken(), p.id).then((result) => {
      if (result && result.ok && result.state && typeof applyOnlineAuthorityState === "function")
        applyOnlineAuthorityState(result.state, null, result.version);
      else if (!result || !result.ok)
        toast((result && result.msg) || "Não foi possível limpar a Loot Pouch online.", "bad");
      if (typeof renderAll === "function") renderAll();
      else if (typeof renderLootPouch === "function") renderLootPouch(p);
    }).catch(() => {
      toast("Não foi possível limpar a Loot Pouch online.", "bad");
    });
  } else if (typeof save === "function") {
    save();
  }
  $("#modal").classList.remove("show");
  if (typeof renderAll === "function") renderAll();
  else if (typeof renderLootPouch === "function") renderLootPouch(p);
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
      <div class="panel-inset mt8" style="padding:8px">
        <div class="small" style="color:#ff6a6a;font-weight:bold">LIMPAR LOOT POUCH</div>
        <div class="tiny dim mb8">Remove todos os itens da pouch. Ouro da conta não é afetado. Esta ação não pode ser desfeita.</div>
        <button class="sm danger" id="lootcfg-clear">LIMPAR LOOT POUCH</button>
      </div>
      <div class="tiny dim mt8">Você pode digitar parte do nome ou slug do item. Ex: meat, gold coin, leather armor.</div>
    </div>`;
  $("#modal").classList.add("show");
  $("#lootcfg-close").addEventListener("click", () => { $("#modal").classList.remove("show"); renderLootPouch(p); });
  const clearBtn = $("#lootcfg-clear");
  if (clearBtn) clearBtn.addEventListener("click", () => clearLootPouchWithConfirm(p));
  $$("#modal-body [data-add-rule]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.addRule;
    const input = key === "noCollect" ? $("#no-collect-input") : $("#no-sell-input");
    addLootRule(p, key, input.value);
    if (typeof persistLootConfig === "function") persistLootConfig(p);
    else if (typeof save === "function") save();
    openLootPouchConfigModal();
  }));
  $$("#modal-body [data-remove-rule]").forEach((b) => b.addEventListener("click", () => {
    const [key, idx] = b.dataset.removeRule.split(":");
    removeLootRule(p, key, parseInt(idx, 10));
    if (typeof persistLootConfig === "function") persistLootConfig(p);
    else if (typeof save === "function") save();
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
        <img src="assets/item/${s.sprite}.png" style="max-width:22px;max-height:22px;object-fit:contain;image-rendering:pixelated" alt="">
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

/* Seletor do buff de vocacao (Virtudes do Monk, Protector, Divine Dazzle).
 * As stances do 15.25 moram no renderStancePicker, no topo da aba Ataque. */
function renderBuffPicker(p) {
  let html = "";
  if (typeof availableBuffs === "function") {
    const lista = availableBuffs(p);
    if (lista.length) {
      const ativos = typeof buffTotals === "function" ? buffTotals(p).lista : [];
      const agora = Date.now();
      html += `
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
  }
  return html;
}

/* Seletor de STANCES (posturas do 15.25), com um bloco proprio no TOPO da
 * aba Ataque — antes ficava embutido no meio do renderBuffPicker, abaixo
 * do buff de vocacao e do kiting, e para o Sorcerer as cinco posturas
 * vinham misturadas numa lista so.
 *
 * O Sorcerer tem DOIS grupos que se combinam (regra oficial da pagina de
 * Stances do TibiaWiki):
 *   - sorcelem (Master of Flames/Thunder/Decay): UMA stance elemental por
 *     vez, e ela que "atua o elemento" — converte a proxima magia
 *     nao-relacionada para o tipo dela;
 *   - sorcrip (Aura of Sapped Strength / Exposed Weakness): UMA aura
 *     crippling por vez, e pode ficar ligada JUNTO com a elemental.
 * As secoes aparecem separadas e com o elemento colorido, para o jogador
 * ver exatamente o que esta ativando. O status em cima mostra o que esta
 * ligado agora — incluindo se a conversao do elemento esta ARMADA. */
function renderStancePicker(p) {
  if (typeof stanceList !== "function") return "";
  const sts = stanceList(p);
  if (!sts.length) return "";

  const GRUPO_NOME = {
    sorcelem: "Stance elemental — ativa o elemento",
    sorcrip: "Aura crippling — pode combinar com a elemental",
  };
  const elNome = (el) => (typeof ELEMENTS !== "undefined" && ELEMENTS[el])
    ? ELEMENTS[el].name : el;
  const elCor = (el) => (typeof ELEMENTS !== "undefined" && ELEMENTS[el])
    ? ELEMENTS[el].color : "#d4af37";

  const porGrupo = {};
  const ordem = [];
  for (const x of sts) {
    const g = x.st.grupo || "geral";
    if (!porGrupo[g]) { porGrupo[g] = []; ordem.push(g); }
    porGrupo[g].push(x);
  }
  const ativos = sts.filter((x) => stanceAtiva(p, x.id));

  let html = `<div class="small dim mb4">Stance (postura do 15.25)</div>`;
  if (ativos.length) {
    const conv = (typeof stanceTotals === "function")
      ? stanceTotals(p).convert : null;
    html += `<div class="tiny mb4" style="color:#9ce84a">✔ Ativa(s): `
      + `<b>${ativos.map((x) => x.st.nome).join(" + ")}</b>`
      + (conv ? ` — toda magia sai como `
        + `<span style="color:${elCor(conv)}">${elNome(conv).toLowerCase()}</span>`
        : "")
      + `</div>`;
  }
  for (const g of ordem) {
    if (ordem.length > 1 || GRUPO_NOME[g]) {
      html += `<div class="tiny dim mt8 mb4">${GRUPO_NOME[g] || "Postura"}</div>`;
    }
    html += `<div class="list" style="max-height:190px">`;
    for (const { id, st, spell, livre } of porGrupo[g]) {
      const on = stanceAtiva(p, id);
      const elTag = st.elemento
        ? ` · <span style="color:${elCor(st.elemento)}">${elNome(st.elemento)}</span>` : "";
      html += `<div class="shop-row ${on ? "selected" : ""}" style="opacity:${livre ? 1 : .45}">
        ${spellIcon(spell)}
        <div style="flex:1;min-width:0">
          <div class="small">${st.nome}${elTag}
            ${on ? `<span style="color:#9ce84a"> · ATIVA</span>` : ""}</div>
          <div class="tiny dim"><b>${spell.words || id}</b> · ${spell.mana} mana · nv ${spell.lvl}</div>
          <div class="tiny dim">${st.desc}</div>
        </div>
        <button class="sm ${on ? "primary" : ""}" data-stance="${id}" ${livre ? "" : "disabled"}>
          ${on ? "DESLIGAR" : "ATIVAR"}</button>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="tiny dim mt4">Ativar paga a mana UMA vez e a postura fica ligada até trocar ou desligar — vale mesmo depois de relogar.`
    + (porGrupo.sorcelem ? ` O Sorcerer mantém 1 elemental + 1 aura crippling ao mesmo tempo, e a elemental converte TODAS as magias para o elemento dela (regra da casa, diferente do global).` : "")
    + `</div>`;
  return html;
}

/* Selo da postura ativa: um quadrado (ou dois, para o Sorcerer com
 * elemental+crippling) no canto superior esquerdo da cena, como a area de
 * icones de condicao do cliente oficial. Borda na cor do elemento quando a
 * postura e uma Master of X. */
function stanceBadgesHtml(p) {
  if (!p || !p.stances || typeof STANCES === "undefined") return "";
  const ativos = [];
  for (const id in p.stances) {
    if (STANCES[id]) ativos.push(id);
  }
  if (!ativos.length) return "";
  // elemento primeiro, crippling/outras depois (ordem otc do cliente)
  ativos.sort((a, b) => {
    const ea = STANCES[a].elemento ? 0 : 1, eb = STANCES[b].elemento ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return (SPELLS[a] ? SPELLS[a].icon : 999) - (SPELLS[b] ? SPELLS[b].icon : 999);
  });
  return ativos.map((id) => {
    const st = STANCES[id];
    const sp = (typeof SPELLS !== "undefined") ? SPELLS[id] : null;
    const cor = st.elemento && typeof ELEMENTS !== "undefined" && ELEMENTS[st.elemento]
      ? ELEMENTS[st.elemento].color : "#d4af37";
    const nomeEl = st.elemento && typeof ELEMENTS !== "undefined" && ELEMENTS[st.elemento]
      ? ` (${ELEMENTS[st.elemento].name})` : "";
    return `<div class="stance-sq" style="border-color:${cor}"
             title="${st.nome}${nomeEl} — ${st.desc}">
      ${st.iconWiki && typeof WIKI_ICONS !== "undefined" && WIKI_ICONS[st.iconWiki]
        ? `<img src="${WIKI_ICONS[st.iconWiki].path}" alt="${st.nome}">`
        : (sp && sp.icon != null
          ? `<img src="assets/spell/otc/${sp.icon}.png" alt="${st.nome}">` : "")}
    </div>`;
  }).join("");
}

function renderStanceBadge(p) {
  const el = $("#stance-badge");
  if (!el) return;
  const h = stanceBadgesHtml(p);
  el.innerHTML = h;
  el.style.display = h ? "flex" : "none";
}

/* Seletor da magia de velocidade (haste). Sem selecao, o personagem nao
 * lanca nada sozinho -- so quando o jogador escolhe explicitamente aqui. */
function renderHastePicker(p) {
  if (typeof hastesDisponiveis !== "function") return "";
  const lista = hastesDisponiveis(p);
  if (!lista.length) return "";
  const ativa = typeof hasteAtiva === "function" ? hasteAtiva(p, Date.now()) : null;
  return `
    <div class="small dim mt8 mb4">Magia de velocidade</div>
    <div class="list" style="max-height:150px">
      ${lista.map((id) => {
        const sp = SPELLS[id];
        if (!sp) return "";
        const sel = p.config.hasteSpell === id;
        const ok = p.level >= (sp.lvl || 1);
        const resta = ativa && ativa.id === id
          ? Math.max(0, Math.ceil((ativa.ate - Date.now()) / 1000)) : 0;
        return `<div class="shop-row ${sel ? "selected" : ""}" style="opacity:${ok ? 1 : .45}">
          ${spellIcon(sp)}
          <div style="flex:1;min-width:0">
            <div class="small">${HASTEDATA[id].nome || sp.name}
              ${resta ? `<span style="color:#9ce84a">· ${resta}s</span>` : ""}</div>
            <div class="tiny dim"><b>${sp.words || id}</b> · ${sp.mana} mana · nv ${sp.lvl} · cd ${Math.round(sp.cd / 1000)}s</div>
          </div>
          <button class="sm ${sel ? "primary" : ""}" data-haste="${id}" ${ok ? "" : "disabled"}>
            ${sel ? "ATIVA" : "USAR"}</button>
        </div>`;
      }).join("")}
    </div>
    <div class="tiny dim mt4">A magia selecionada e relançada sozinha quando expira. Sem seleção, o personagem não usa velocidade sozinho.</div>`;
}

function renderHelper(p) {
  if (typeof helperSyncLiveCombat === "function") helperSyncLiveCombat(p);
  if (typeof renderHelperPresets === "function") renderHelperPresets(p);
  const healEl = $("#helper-heal");
  const magicEl = $("#helper-magic-shield");
  const equipHelperEl = $("#helper-equipment");
  const atkEl = $("#helper-attack");
  // ESCUDO MÁGICO: knights não usam — não podem equipar energy ring (só
  // Monk/RP) nem conjurar utamo vita. A aba some para knight/elite knight.
  const ehKnight = p.voc === "knight" || p.voc === "elite knight";
  const tabMS = document.querySelector('[data-panel="magic-shield"]');
  if (tabMS) tabMS.style.display = ehKnight ? "none" : "";
  // HEAL FRIEND tem aba própria e só aparece para Druid/Monk.
  const canHealFriend = p.voc === "druid" || p.voc === "elder druid" ||
    p.voc === "monk" || p.voc === "exalted monk";
  const friendTab = document.querySelector('[data-panel="heal-friend"]');
  const friendPanel = document.querySelector('[data-panel-group="mid"][data-panel="heal-friend"]');
  if (friendTab) friendTab.style.display = canHealFriend ? "" : "none";
  if (!canHealFriend && friendPanel) friendPanel.style.display = "none";
  if (typeof renderHealFriend === "function") renderHealFriend(p);
  const comboEl = $("#helper-combo");
  if (healEl) {
    // A aba Cura contém somente autocura. Spells de aliado (exura sio,
    // Restore Friend, Mass Healing) vivem exclusivamente em Curar aliado.
    const friendHealIds = new Set(typeof healFriendSpells === "function"
      ? healFriendSpells(p)
      : ((typeof CanaryVocation !== "undefined" && CanaryVocation.friendHealSpellIds)
        ? CanaryVocation.friendHealSpellIds(p.voc)
        : ["exura-sio", "exura-gran-sio", "exura-gran-mas-res", "exura-tio-sio"]));
    const heals = (typeof CanaryVocation !== "undefined" && CanaryVocation.selfHealSpellIds)
      ? CanaryVocation.selfHealSpellIds(SPELLS, p.voc)
      : Object.keys(SPELLS).filter((id) => {
          const s = SPELLS[id];
          return s.type === "heal" && (typeof spellForVoc === "function" ? spellForVoc(s, p.voc) : s.vocs.indexOf(p.voc) !== -1) && !friendHealIds.has(id);
        });
    heals.sort((a, b) => SPELLS[a].lvl - SPELLS[b].lvl);
    // potions da vocacao, com nivel e cura reais do canary. suppliesOf ja
    // esconde o que a vocacao nunca podera beber (knight nao usa ultimate
    // mana potion em nivel nenhum) e ordena por nivel.
    const healSup = (typeof suppliesOf === "function"
      ? suppliesOf(p, "heal").map((x) => x[0])
      : Object.keys(SUPPLIES).filter((k) => SUPPLIES[k].type === "heal"));
    const manaSup = (typeof suppliesOf === "function"
      ? suppliesOf(p, "mana").map((x) => x[0])
      : ["mana-potion"]);

    // slot "mana"|"heal": spirit potions (type heal + both) entram nas DUAS
    // listas — a seleção/USANDO deve seguir o slot clicado, não s.type.
    const supplyRow = (slug, slot) => {
      const s = SUPPLIES[slug]; if (!s) return "";
      const pw = typeof supplyPowerFor === "function"
        ? supplyPowerFor(p, slug) : supplyPower(s, p.level);
      const liberado = typeof supplyAllowed === "function"
        ? supplyAllowed(p, slug) : p.level >= (s.lvl || 1);
      const motivo = !liberado && typeof supplyBlockReason === "function"
        ? supplyBlockReason(p, slug) : "";
      const ehMana = slot === "mana";
      const selected = ehMana ? p.config.manaSupply === slug
                              : p.config.healSupply === slug;
      const disabledMana = ehMana && !selected;
      // potion que cura vida E mana (spirit) mostra os dois valores
      const valores = [];
      if (s.heal) valores.push(`<span style="color:#7ae87a">hp ${s.heal[0]}-${s.heal[1]}</span>`);
      if (s.mana) valores.push(`<span style="color:#6a8aff">mana ${s.mana[0]}-${s.mana[1]}</span>`);
      if (!valores.length) valores.push(`${ehMana ? "mana" : "hp"} ${pw[0]}-${pw[1]}`);
      return `<div class="helper-supply-row ${selected ? "selected" : disabledMana ? "disabled" : ""}"
                   data-supply-slug="${slug}" data-supply-slot="${slot}"
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
          data-use-supply="${slug}" data-supply-slot="${slot}" ${liberado ? "" : "disabled"}>
          ${selected ? "USANDO" : disabledMana ? "DESATIVADO" : "USAR"}</button>
      </div>`;
    };
    healEl.innerHTML = `
      <div class="mb8">
        <div class="small" style="font-weight:bold;color:#d4af37">HEAL CONDITION</div>
        <div class="tiny dim">Defina a % de HP de cada cura. O Helper usa a primeira da lista pronta, respeitando cooldown.</div>
      </div>
      <div class="list helper-heal-spell-list" style="border:1px solid #2a251c;border-radius:4px;padding:4px;margin-bottom:8px">${heals.map((id, idx) => {
        const s = SPELLS[id], ok = p.level >= s.lvl;
        const cfg = (p.config.healSpells || []).find((x) => x && x.id === id);
        const active = !!cfg;
        const at = cfg ? cfg.at : 0;
        const faixa = ok && typeof spellRangeText === "function" ? spellRangeText(p, s) : "";
        return `<div class="helper-heal-spell-row ${active ? "selected" : ""}" style="opacity:${ok ? 1 : .45};padding:6px 4px;border-bottom:1px solid #2a251c">
          <div class="row" style="align-items:center;gap:8px">
            ${spellIcon(s)}
            <div style="flex:1;min-width:0">
              <div class="small">${s.name} ${active && faixa ? `<span style="color:#7ae87a">· ${faixa} hp</span>` : ""}</div>
              <div class="tiny dim">${s.words ? `<b>${s.words}</b> · ` : ""}${s.mana} mana · nv ${s.lvl} · cd ${Math.round(s.cd / 1000)}s</div>
            </div>
            <div class="row" style="align-items:center;gap:6px">
              <button class="sm ${active ? "primary" : ""}" data-heal-spell-toggle="${id}" ${ok ? "" : "disabled"} title="Ativar/desativar cura">${active ? "ON" : "OFF"}</button>
              <input type="number" min="1" max="99" value="${at}" data-heal-spell-at="${id}" ${active && ok ? "" : "disabled"}
                style="width:50px;padding:4px;background:#14120e;color:#c8c0a8;border:1px solid #16140f;text-align:center">
            </div>
          </div>
        </div>`;
      }).join("") || `<div class="dim tiny">Nenhuma magia de cura.</div>`}</div>
      <div class="mt8">
        <label class="small dim">Usar item de cura abaixo de (%)</label>
        <input id="helper-heal-item-at" type="number" min="1" max="99" value="${p.config.healItemAt}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="row mt8 mb4" style="justify-content:space-between;align-items:center">
        <span class="small ${p.config.noHealthPotions ? "" : "dim"}" style="${p.config.noHealthPotions ? "color:#ff9090;font-weight:bold" : ""}">🚫 Potions</span>
        <button class="sm ${p.config.noHealthPotions ? "danger" : ""}" id="helper-no-potions" title="Desliga todas as potions (HP e mana) — o personagem passa a usar só magias">
          ${p.config.noHealthPotions ? "HP OFF — reativar" : "NÃO USAR POTIONS HP"}
        </button>
      </div>
      <div class="small dim mt8 mb4">Itens de HP (${healSup.length})</div>
      <div class="list" style="${p.config.noHealthPotions ? "opacity:.45;pointer-events:none" : ""}">${healSup.map((slug) => supplyRow(slug, "heal")).join("")}</div>
      <div class="mt8">
        <label class="small dim">Preencher mana abaixo de (%)</label>
        <input id="helper-mana-at" type="number" min="1" max="99" value="${p.config.manaAt === undefined ? 50 : p.config.manaAt}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="row mt8 mb4" style="justify-content:space-between"><span class="small ${p.config.noManaPotions ? "" : "dim"}" style="${p.config.noManaPotions ? "color:#ff9090;font-weight:bold" : ""}">🚫 Potions de mana</span><button class="sm ${p.config.noManaPotions ? "danger" : ""}" id="helper-no-mana-potions">${p.config.noManaPotions ? "MANA OFF — reativar" : "NÃO USAR POTIONS MANA"}</button></div>
      <div class="tiny dim mb4">Só 1 potion de mana ativa. Por padrão todas desativadas — escolha qual usar.</div>
      <div class="small dim mt8 mb4">Itens de mana (${manaSup.length})</div>
      <div class="list" style="${p.config.noManaPotions ? "opacity:.45;pointer-events:none" : ""}">${manaSup.map((slug) => supplyRow(slug, "mana")).join("")}</div>`;
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
    $$("#helper-heal [data-heal-spell-toggle]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.healSpellToggle;
      const spells = p.config.healSpells = p.config.healSpells || [];
      const i = spells.findIndex((x) => x && x.id === id);
      if (i >= 0) {
        spells.splice(i, 1);
        toast(`Cura <b>${SPELLS[id].name}</b> desativada`);
      } else {
        spells.push({ id: id, at: p.config.healSpellAt || p.config.healAt || 50 });
        toast(`Cura <b>${SPELLS[id].name}</b> ativada`);
      }
      // manter compat com saves/presets antigos que usam healSpell
      p.config.healSpell = spells.length ? spells[0].id : "";
      renderHelper(p);
    }));
    $$("#helper-heal [data-heal-spell-at]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.healSpellAt;
        const val = Math.max(1, Math.min(99, parseInt(input.value, 10) || 1));
        input.value = val;
        const cfg = (p.config.healSpells || []).find((x) => x && x.id === id);
        if (cfg) {
          cfg.at = val;
          p.config.healSpellAt = val;
          p.config.healAt = Math.max(p.config.healSpellAt, p.config.healItemAt);
          const healAt = $("#heal-at"), healVal = $("#heal-at-val");
          if (healAt) healAt.value = p.config.healAt;
          if (healVal) healVal.textContent = p.config.healAt + "%";
        }
        renderHelper(p);
      });
    });
    const noPotBtn = $("#helper-no-potions");
    if (noPotBtn) noPotBtn.addEventListener("click", () => {
      p.config.noHealthPotions = !p.config.noHealthPotions;
      toast(p.config.noHealthPotions
        ? "Potions desativadas — o personagem passa a usar só magias"
        : "Potions reativadas");
      renderHelper(p);
    });
    const noManaBtn = $("#helper-no-mana-potions");
    if (noManaBtn) noManaBtn.addEventListener("click", () => { p.config.noManaPotions = !p.config.noManaPotions; renderHelper(p); });
    $$("#helper-heal [data-use-supply]").forEach((b) => b.addEventListener("click", () => {
      const slug = b.dataset.useSupply;
      const slot = b.dataset.supplySlot || (SUPPLIES[slug] && SUPPLIES[slug].type === "mana" ? "mana" : "heal");
      const s = SUPPLIES[slug];
      if (!s) return;
      if (!Object.prototype.hasOwnProperty.call(p.supplies, slug)) p.supplies[slug] = 0;
      if (slot === "mana") {
        // Exclusivo: só 1 potion de mana; toggle desativa.
        p.config.manaSupply = p.config.manaSupply === slug ? "" : slug;
        toast(p.config.manaSupply ? `Mana selecionada: <b>${s.name}</b>` : "Potion de mana desativada");
      } else {
        p.config.healSupply = p.config.healSupply === slug ? "" : slug;
        toast(p.config.healSupply ? `Cura selecionada: <b>${s.name}</b>` : "Potion/runa de cura desativada");
      }
      renderHelper(p);
    }));
  }
  if (magicEl && typeof renderMagicShieldHelper === "function") {
    magicEl.innerHTML = renderMagicShieldHelper(p);
    if (typeof bindMagicShieldHelper === "function") bindMagicShieldHelper(p);
  }
  if (equipHelperEl && typeof renderEquipmentHelper === "function") {
    equipHelperEl.innerHTML = renderEquipmentHelper(p);
    if (typeof bindEquipmentHelper === "function") bindEquipmentHelper(p);
  }
  if (atkEl) {
    const mode = p.config.attackMode || "chase";
    const ehKnightAtk = p.voc === "knight" || p.voc === "elite knight";
    const exetaResOn = !!p.config.exetaRes;
    const exetaAmpOn = !!p.config.exetaAmpRes;
    const challengeHtml = ehKnightAtk ? `
      <div class="small dim mt8 mb4">⚔ Challenge do Knight (marca inimigos — dano deles −20% por 10s)</div>
      <div class="row wrap" style="gap:6px">
        <button class="sm ${exetaResOn ? "primary" : ""}" data-exeta="res" ${p.level >= 20 ? "" : "disabled"}
          title="Exeta Res (Challenge): marca TODOS. Nível 20. cd 5s.">
          ${exetaResOn ? "✓ " : ""}Exeta Res ${p.level >= 20 ? "" : "· nv 20"}</button>
        <button class="sm ${exetaAmpOn ? "primary" : ""}" data-exeta="amp-res" ${p.level >= 150 ? "" : "disabled"}
          title="Exeta Amp Res (Chivalrous Challenge): marca TODOS ao alcance (7 SQM). Nível 150. Animação oficial no cast.">
          ${exetaAmpOn ? "✓ " : ""}Exeta Amp Res ${p.level >= 150 ? "" : "· nv 150"}</button>
      </div>
      <div class="tiny dim mt4">Os dois podem ficar <b>ligados juntos</b>: o Amp Res tem prioridade e o Res
        cobre quando ele está em recarga. O monstro marcado causa 20% menos dano.</div>` : "";
    // MODO DE HUNT: fica NO ALTO da aba Ataque (acima das stances/buffs) —
    // o mesmo seletor aparece no topo do modal de instância da hunt.
    // v33: sem Chase/Stand — sempre STAND (parado, persegue só p/ atacar)
    const modos = [["kiting", "Kiting"], ["box", "BOX"], ["safe", "SAFE"]];
    atkEl.innerHTML = `
      <div class="small mb4" style="color:#d4af37;font-weight:bold">🎯 Modo de Hunt</div>
      <div class="row wrap" style="gap:6px">
        ${modos.map(([id, label]) =>
          `<button class="sm ${mode === id ? "primary" : ""}" data-attack-mode="${id}" title="${
            id === "box" ? "Formação tática por vocação (knight no melhor spot, RP nas retas, magos na área)"
            : id === "safe" ? "Fica nos cantos da tela, longe da box, mas no range das spells"
            : ""}">${label}</button>`).join("")}
      </div>
      <div class="mt8" style="max-width:180px;${mode === "kiting" ? "" : "display:none"}">
        <label class="small dim">Distância do Kiting (SQM)</label>
        <input id="kite-distance" type="number" min="1" max="5" value="${p.config.kiteDistance || 3}"
          style="width:100%;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      </div>
      <div class="tiny dim mt8">Kiting mantém de 1 a 5 SQMs do monstro. Stand fica parado. Chase aproxima.
        <b>BOX</b> (party de 4): cada vocação assume a posição dela — Knight faz checagem de células x/y e para
        no MELHOR spot do meio da sala tankando (casta exeta res + amp res), RP a 2 SQMs do knight nas retas,
        Druid/Sorcerer na posição de wave com máximo de alvos, Monk dentro da box no melhor Flurry (não foge).
        <b>SAFE</b>: o personagem vai para os CANTOS da tela, longe da box, mas ainda no range das spells.</div>
      ${renderStancePicker(p)}
      ${challengeHtml}
      ${renderBuffPicker(p)}
      ${renderHastePicker(p)}`;
    $$("#helper-attack [data-buff]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.buff;
      p.config.buff = p.config.buff === k ? null : k;
      toast(p.config.buff ? `Buff selecionado: <b>${BUFFS[k].nome}</b>`
                          : "Buff desativado.");
      renderHelper(p);
    }));
    $$("#helper-attack [data-haste]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.haste;
      p.config.hasteSpell = p.config.hasteSpell === k ? "" : k;
      toast(p.config.hasteSpell
        ? `Velocidade selecionada: <b>${HASTEDATA[k].nome}</b>`
        : "Velocidade desativada.");
      renderHelper(p);
    }));
    // stances do 15.25: toggle direto no personagem (custa mana; persiste)
    $$("#helper-attack [data-stance]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.stance;
      if (typeof toggleStance !== "function") return;
      if (toggleStance(p, id, G.combat)) {
        const st = STANCES[id];
        toast(stanceAtiva(p, id)
              ? `Stance ativa: <b>${st ? st.nome : id}</b>`
              : `Stance desligada: <b>${st ? st.nome : id}</b>`);
        if (typeof renderStats === "function") renderStats(p);
        if (typeof renderStanceBadge === "function") renderStanceBadge(p);
      } else if (typeof cdRemaining === "function") {
        // Falhou por cooldown compartilhado (o grupo da postura travado por
        // outra magia). Antes o clique morria em silencio: o jogador
        // apertava ATIVAR, nada acontecia e parecia que a postura nao
        // ativava. Agora mostra quanto falta para destravar.
        const r = cdRemaining(p, id);
        if (r > 0) toast(`Postura em recarga: aguarde <b>${Math.ceil(r / 1000)}s</b>.`);
      }
      renderHelper(p);
    }));
    $$("#helper-attack [data-attack-mode]").forEach((b) => b.addEventListener("click", () => {
      p.config.attackMode = b.dataset.attackMode;
      renderHelper(p);
    }));
    // Challenge do Knight: exeta res / exeta amp res — toggles independentes
    // (podem ficar os dois ligados)
    $$("#helper-attack [data-exeta]").forEach((b) => b.addEventListener("click", () => {
      const qual = b.dataset.exeta;
      if (qual === "amp-res") {
        p.config.exetaAmpRes = !p.config.exetaAmpRes;
        toast(p.config.exetaAmpRes
          ? "Exeta Amp Res ATIVO — marca todos os inimigos ao alcance (7 SQM)."
          : "Exeta Amp Res desativado.");
      } else {
        p.config.exetaRes = !p.config.exetaRes;
        toast(p.config.exetaRes
          ? "Exeta Res ATIVO — marca 1 inimigo (Challenge)."
          : "Exeta Res desativado.");
      }
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
          "tarsal-arrow", "diamond-arrow", "onyx-arrow", "crystalline-arrow",
          // flechas AoE do 15.25 (13 sqm)
          "shatterstorm-arrow", "firestorm-arrow", "terrastorm-arrow",
          "froststorm-arrow", "thunderstorm-arrow"],
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
  if (cityBtn) cityBtn.textContent = G.training ? "🏛 Sair da academia" : "🏛 Ir para o templo";
}

/* Atalhos legados (#npc-quick) removidos — use o modal NPCS. */
function renderNpcQuick() {
  const el = $("#npc-quick");
  if (!el) return;
  el.innerHTML = "";
}

/* Painel "Magias": o grimorio completo da vocacao — SOMENTE LEITURA.
 *
 * Mostra TODAS as magias que a vocacao tem no 15.x (nao so as ofensivas),
 * agrupadas por tipo, com o icone oficial, as palavras, o custo e — o mais
 * util — a faixa de dano/cura JA CALCULADA para o personagem atual usando a
 * formula do canary.
 *
 * Nao ha mais botao USAR aqui: quem manda na rotacao e a aba COMBO, onde o
 * jogador monta os slots na ordem de prioridade. Esta aba serve apenas para
 * o jogador consultar o que ele tem disponivel (como o spellbook do client,
 * que tambem nao conjura nada). */
function renderSpells(p) {
  const box = $("#helper-spells");
  if (!box) return;
  if (typeof spellsByType !== "function") { box.innerHTML = ""; return; }

  const grupos = spellsByType(p.voc);
  const filtro = (p.config.spellFilter || "all");
  const somenteDisponiveis = !!p.config.spellOnlyReady;
  // spells presentes na barra de COMBO: so para exibir o selo "na rotação"
  const combo = typeof ensureCombo === "function" ? ensureCombo(p) : [];
  const noCombo = {};
  for (const entrada of combo) {
    if (entrada && entrada.kind === "spell") noCombo[entrada.id] = true;
  }

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
    const marc = !!noCombo[id];
    const faixa = ok ? spellRangeText(p, s) : "";
    return `<div class="spell-row ${marc ? "selected" : ""}" style="opacity:${ok ? 1 : .4}">
      ${spellIcon(s)}
      <div style="flex:1;min-width:0">
        <div class="small">${s.name}
          ${s.stance ? `<span class="tiny" style="color:#d4af37">· stance</span>` : ""}
          ${faixa ? `<span style="color:${s.type === "heal" ? "#7ae87a" : "#ff9a4a"}">· ${faixa}</span>` : ""}</div>
        <div class="tiny dim"><b>${s.words}</b> · ${s.mana} mana · nv ${s.lvl}${s.ml ? " · ml " + s.ml : ""} · cd ${Math.round(s.cd / 1000)}s</div>
        <div class="tiny dim">${s.stance ? "Postura do 15.25 — ative/desligue na aba ATAQUE." : spellDesc(s)}</div>
      </div>
      ${marc
        ? `<span class="tiny" style="white-space:nowrap;color:#9ce84a">na rotação</span>`
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
      Valores calculados com a fórmula real do Canary para este personagem.<br>
      Esta aba é só consulta: as magias de ataque entram em combate pela aba
      <b style="color:#9ce84a">COMBO</b> (e a cura pela aba <b>HEAL</b>).
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
  // sem handler de USAR: a aba Magias e somente leitura. A escolha das
  // magias de ataque acontece na barra de COMBO (openComboPicker).
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
        `${a.spell.img
          ? `<img src="${a.spell.img}" alt="">`
          : (a.spell.icon != null
          ? `<img src="assets/spell/otc20/${a.spell.icon}.png" alt="">` : "")}
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
 * As categorias são por família de munição. A escolha manual é livre: não
 * exige bow/crossbow equipado; a compatibilidade só é validada ao disparar.
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
  if (!it || it.s !== "ammo") return false;
  if (!equippedQuiver(p)) return false;
  return p.level >= (it.lvl || 1);
}

/* Melhor munição por custo-benefício, usada pelo modo automático */
function bestAmmoFor(p) {
  let melhor = null, melhorNota = -1;
  for (const slug in AMMO_DEFS) {
    if (!ammoUsable(p, slug)) continue;
    const item=GAMEDATA.items[slug];
    // No modo automático, se já há arma equipada, mantenha munição capaz de
    // disparar com ela. A seleção manual continua totalmente livre.
    if(p.equip.weapon&&typeof ammoCompatibleWithWeapon==="function"&&
       !ammoCompatibleWithWeapon(item,p.equip.weapon))continue;
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
      : (p.level < (it.lvl || 1) ? "nível " + it.lvl : "");
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
    if (b) setActiveAmmo(p, b, true);
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
      setActiveAmmo(p, b.dataset.pickAmmo, true);
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
let COMBO_DRAG_FROM = -1, COMBO_JUST_DROPPED = false;

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

  $$("#helper-combo [data-combo-slot]").forEach((b) => {
    b.addEventListener("click", (ev) => {
      if (COMBO_JUST_DROPPED) { ev.preventDefault(); return; }
      if (ev.target.closest("[data-combo-min]") ||
          ev.target.closest("[data-combo-clear]")) return;
      openComboPicker(parseInt(b.dataset.comboSlot, 10));
    });
    // Reordenação: o Chrome esconde MIME customizado no dragover e o drop
    // nunca dispara. Índice em memória + text/plain, preventDefault sempre.
    b.addEventListener("dragstart", (ev) => {
      if (ev.target.closest("select") || ev.target.closest("button")) { ev.preventDefault(); return; }
      COMBO_DRAG_FROM = parseInt(b.dataset.comboSlot, 10);
      try {
        ev.dataTransfer.setData("text/plain", String(COMBO_DRAG_FROM));
        ev.dataTransfer.setData("text/combo-slot", String(COMBO_DRAG_FROM));
        ev.dataTransfer.effectAllowed = "move";
      } catch (e) {}
      b.classList.add("dragging");
    });
    b.addEventListener("dragend", () => { b.classList.remove("dragging"); COMBO_DRAG_FROM = -1; });
    b.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      b.classList.add("drop-here");
    });
    b.addEventListener("dragleave", () => b.classList.remove("drop-here"));
    b.addEventListener("drop", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      b.classList.remove("drop-here");
      let from = COMBO_DRAG_FROM;
      if (!(from >= 0) && ev.dataTransfer) {
        from = parseInt(ev.dataTransfer.getData("text/plain") ||
          ev.dataTransfer.getData("text/combo-slot"), 10);
      }
      const to = parseInt(b.dataset.comboSlot, 10);
      COMBO_DRAG_FROM = -1;
      if (isNaN(from) || isNaN(to) || from === to) return;
      const live = ensureCombo(p);
      const tmp = live[from]; live[from] = live[to]; live[to] = tmp;
      COMBO_JUST_DROPPED = true;
      setTimeout(() => { COMBO_JUST_DROPPED = false; }, 80);
      save();
      renderComboBar(p, el);
    });
  });
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
return `<div class="combo-slot vazio" data-combo-slot="${i}" draggable="true">
      ${num}
      <div class="combo-add">+</div>
      <div class="tiny dim">vazio</div>
    </div>`;
  }
  const info = comboInfo(entrada);
  if (!info) {
    return `<div class="combo-slot vazio" data-combo-slot="${i}" draggable="true">
      ${num}<div class="tiny dim">indisponível</div></div>`;
  }
  const arte = info.img
    ? `<img src="${info.img}" alt="" draggable="false">`
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

  return `<div class="combo-slot" data-combo-slot="${i}" draggable="true">
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
    if (typeof spellForVoc === "function" ? !spellForVoc(s, p.voc)
        : (s.vocs.indexOf(p.voc) === -1)) continue;
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
      // Área/chain: default min=2 (uso tipico no pack). ST fica em 1.
      // Mantem o minimo se for a mesma entrada.
      let min = 1;
      if (antigo && antigo.id === id) min = antigo.min;
      else if (kind === "spell") {
        const sp = typeof SPELLS !== "undefined" ? SPELLS[id] : null;
        if (sp && (sp.area || Number(sp.chain) > 1)) min = 2;
      } else if (kind === "rune") {
        const ru = typeof SUPPLIES !== "undefined" ? SUPPLIES[id] : null;
        if (ru && ru.area) min = 2;
      }
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
