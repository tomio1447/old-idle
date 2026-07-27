/*
 * cyclopedia-ui.js — a janela da Cyclopedia
 *
 * Layout do cliente: coluna de abas a esquerda com os icones oficiais e o
 * conteudo a direita. As abas que o jogo ainda nao sustenta aparecem, mas
 * dizem exatamente o que falta em vez de mostrar uma tela falsa.
 */
"use strict";

const CYCLO = { aba: "character", sub: "stats", filtro: "all", busca: "",
                sel: null };

function cycloIcon(aba, ativo) {
  return `assets/ui/cyclopedia/${aba.icone}_${ativo ? "on" : "off"}.png`;
}

function openCyclopedia(aba) {
  const p = G.p;
  if (!p) return;
  ensureCyclopedia(p);
  ensureWardrobe(p);
  if (aba) CYCLO.aba = aba;

  $("#modal-body").innerHTML = `
    <div class="panel-title">📖 Cyclopedia
      <span style="flex:1"></span>
      <span class="tiny gold-txt" id="cyclo-gold"></span>
      <button class="sm" id="cyclo-close">✕</button>
    </div>
    <div class="panel-body cyclo-wrap">
      <div class="cyclo-tabs" id="cyclo-tabs"></div>
      <div class="cyclo-content" id="cyclo-content"></div>
    </div>`;
  $("#modal").classList.add("show");
  $("#modal").classList.add("wide");
  $("#cyclo-close").addEventListener("click", () => {
    $("#modal").classList.remove("show", "wide");
  });
  renderCycloTabs();
  renderCycloContent();
}

function renderCycloTabs() {
  const el = $("#cyclo-tabs");
  if (!el) return;
  el.innerHTML = CYCLO_ABAS.map((a) => `
    <div class="cyclo-tab ${CYCLO.aba === a.id ? "active" : ""}
                ${a.pronta ? "" : "indisponivel"}" data-cyclo-tab="${a.id}">
      <img src="${cycloIcon(a, CYCLO.aba === a.id)}" alt="">
      <span>${a.nome}</span>
    </div>`).join("");
  $$("#cyclo-tabs [data-cyclo-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.aba = b.dataset.cycloTab;
      CYCLO.sel = null;
      CYCLO.busca = "";
      renderCycloTabs();
      renderCycloContent();
    }));
  const g = $("#cyclo-gold");
  if (g) g.textContent = fmtFull(G.p.gold) + " gp";
}

function renderCycloContent() {
  const el = $("#cyclo-content");
  if (!el) return;
  const p = G.p;
  const aba = CYCLO_ABAS.find((a) => a.id === CYCLO.aba);
  if (!aba) return;
  if (!aba.pronta) {
    el.innerHTML = `
      <div class="cyclo-vazio">
        <img src="${cycloIcon(aba, true)}" alt="" style="opacity:.5">
        <div class="small mt8" style="color:#d4af37">${aba.nome}</div>
        <div class="tiny dim mt4" style="max-width:340px;line-height:1.5">
          Existe no cliente oficial, mas ainda não no jogo.<br><br>
          <b>O que falta:</b> ${aba.falta}
        </div>
      </div>`;
    return;
  }
  ({
    character: renderCycloCharacter,
    bestiary: renderCycloBestiary,
    bosstiary: renderCycloBosstiary,
    charms: renderCycloCharms,
    items: renderCycloItems,
  }[CYCLO.aba] || (() => { el.innerHTML = ""; }))(p, el);
}

/* ------------------------------------------------------------ personagem */

const CYCLO_CHAR_SUBS = [
  { id: "stats", nome: "Estatísticas", icone: "icon_generalstats" },
  { id: "combat", nome: "Combate", icone: "icon-character-generalstats-combatstats" },
  { id: "items", nome: "Itens", icone: "icon_items" },
  { id: "appearance", nome: "Aparências", icone: "icon_outfitsmounts" },
];

function renderCycloCharacter(p, el) {
  el.innerHTML = `
    <div class="cyclo-subtabs" id="cyclo-subs">
      ${CYCLO_CHAR_SUBS.map((s) => `
        <button class="sm ${CYCLO.sub === s.id ? "primary" : ""}"
                data-cyclo-sub="${s.id}">
          <img src="assets/ui/cyclopedia/character/${s.icone}.png"
               style="width:14px;height:14px;vertical-align:-2px" alt="">
          ${s.nome}
        </button>`).join("")}
    </div>
    <div id="cyclo-sub-body"></div>`;
  $$("#cyclo-subs [data-cyclo-sub]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.sub = b.dataset.cycloSub;
      renderCycloCharacter(p, el);
    }));
  const body = $("#cyclo-sub-body");
  ({
    stats: cycloStats, combat: cycloCombat,
    items: cycloItems, appearance: cycloAppearance,
  }[CYCLO.sub] || cycloStats)(p, body);
}

function linhaStat(k, v) {
  return `<div class="stat-row"><span class="k">${k}</span>
          <span class="v">${v}</span></div>`;
}

function cycloStats(p, el) {
  const max = maxStats(p);
  const g = gearStats(p);
  const prox = expForLevel(p.level + 1);
  const atual = expForLevel(p.level);
  el.innerHTML = `
    <div class="cyclo-cols">
      <div>
        <div class="small dim mb4">Geral</div>
        ${linhaStat("Nome", p.name)}
        ${linhaStat("Vocação", VOCATIONS[p.voc].name)}
        ${linhaStat("Nível", p.level)}
        ${linhaStat("Experiência", fmtFull(Math.floor(p.exp)))}
        ${linhaStat("Para o próximo nível",
                    fmtFull(Math.max(0, prox - Math.floor(p.exp))))}
        ${linhaStat("Progresso",
          Math.floor(((p.exp - atual) / Math.max(1, prox - atual)) * 100) + "%")}
        ${linhaStat("Vida", `${Math.floor(p.hp)} / ${max.hp}`)}
        ${linhaStat("Mana", `${Math.floor(p.mp)} / ${max.mp}`)}
        ${linhaStat("Capacidade", fmtFull(max.cap))}
        ${linhaStat("Gold", fmtFull(p.gold) + " gp")}
      </div>
      <div>
        <div class="small dim mb4">Habilidades</div>
        ${linhaStat("Magic Level", p.ml + (g.mag ? ` (+${g.mag})` : ""))}
        ${linhaStat("Punho", effSkill(p, "fist"))}
        ${linhaStat("Espada", effSkill(p, "sword"))}
        ${linhaStat("Machado", effSkill(p, "axe"))}
        ${linhaStat("Clava", effSkill(p, "club"))}
        ${linhaStat("Distância", effSkill(p, "dist"))}
        ${linhaStat("Escudo", effSkill(p, "shield"))}
        <div class="small dim mt8 mb4">Sessão</div>
        ${linhaStat("Monstros mortos", fmtFull(p.totalKills || 0))}
        ${linhaStat("Bestiário",
          `${bestiarySummary(p).descobertos} / ${bestiarySummary(p).total}`)}
        ${linhaStat("Charm points", fmtFull(p.charmPoints || 0))}
      </div>
    </div>`;
}

function cycloCombat(p, el) {
  const d = playerDamage(p);
  const def = playerDefense(p);
  const b = typeof buffTotals === "function" ? buffTotals(p) : null;
  const c = typeof charmTotals === "function" ? charmTotals(p) : null;
  const imb = typeof imbTotals === "function" ? imbTotals(p) : null;
  const elems = Object.keys(ELEMENTS);
  el.innerHTML = `
    <div class="cyclo-cols">
      <div>
        <div class="small dim mb4">Ataque</div>
        ${linhaStat("Tipo", d.type === "magic" ? "Mágico"
                    : d.type === "distance" ? "Distância" : "Corpo a corpo")}
        ${linhaStat("Dano por golpe", `${d.min} – ${d.max}`)}
        ${linhaStat("Elemento", (ELEMENTS[d.element] || {}).name || d.element)}
        ${linhaStat("Velocidade de ataque",
                    (typeof attackInterval === "function"
                     ? Math.round(attackInterval({}, p)) : 2000) + " ms")}
        ${b ? linhaStat("Modificador de buff",
              Math.round(b.dmgDealt * 100) + "%") : ""}
        ${c && c.vampirismo ? linhaStat("Vampirismo (charm)",
              c.vampirismo + "%") : ""}
        <div class="small dim mt8 mb4">Defesa</div>
        ${linhaStat("Armadura", def.armor)}
        ${linhaStat("Defesa", def.defense)}
        ${linhaStat("Shielding", def.shielding)}
        ${b ? linhaStat("Dano recebido",
              Math.round(b.dmgReceived * 100) + "%") : ""}
        ${c && c.esquiva ? linhaStat("Esquiva (charm)", c.esquiva + "%") : ""}
      </div>
      <div>
        <div class="small dim mb4">Resistências elementais</div>
        ${elems.map((e) => {
          const prot = (imb && imb.prot && imb.prot[e]) || 0;
          const dano = (c && c.dano[e]) || 0;
          return `<div class="stat-row">
            <span class="k" style="color:${ELEMENTS[e].color}">
              ${ELEMENTS[e].name}</span>
            <span class="v">${prot ? "+" + prot + "% res" : "—"}
              ${dano ? ` · +${dano}% dano` : ""}</span></div>`;
        }).join("")}
        <div class="tiny dim mt8">
          Resistências vêm dos imbuements; o bônus de dano vem dos charms.
        </div>
      </div>
    </div>`;
}

function cycloItems(p, el) {
  const slots = SLOTS.filter((s) => p.equip[s]);
  // p.bag e um objeto slug -> quantidade, nao um array
  const bag = Object.keys(p.bag || {}).filter((s) => (p.bag[s] || 0) > 0);
  el.innerHTML = `
    <div class="small dim mb4">Equipado (${slots.length})</div>
    <div class="cyclo-grid">
      ${slots.map((s) => {
        const e = p.equip[s];
        const it = GAMEDATA.items[e.item];
        return `<div class="cyclo-cell" title="${it ? it.n : e.item}">
          <img src="assets/item/${e.item}.png" alt="">
          <div class="tiny dim">${s}</div>
        </div>`;
      }).join("") || `<div class="dim tiny">Nada equipado.</div>`}
    </div>
    <div class="small dim mt8 mb4">Mochila (${bag.length})</div>
    <div class="cyclo-grid">
      ${bag.map((slug) => {
        const it = GAMEDATA.items[slug];
        const n = p.bag[slug];
        return `<div class="cyclo-cell" title="${it ? it.n : slug}">
          <img src="assets/item/${slug}.png" alt="">
          ${n > 1 ? `<span class="cyclo-qtd">${n}</span>` : ""}
        </div>`;
      }).join("") || `<div class="dim tiny">Mochila vazia.</div>`}`;
}

/* ------------------------------------------------------------ aparências */

function cycloAppearance(p, el) {
  const modo = CYCLO.appModo || (CYCLO.appModo = "outfit");
  const filtro = CYCLO.filtro || "all";
  const atual = currentAppearance(p);
  const mnt = currentMount(p);

  const lista = modo === "outfit"
    ? appearanceCatalog(p, filtro)
    : mountCatalog(p, filtro);

  const cardOutfit = (o) => {
    const tem = ownsOutfit(p, o.id);
    const ads = ownedAddons(p, o.id);
    const ativo = atual && atual.id === o.id;
    // o .base.png e a arte neutra (sai branca): o canvas colorido e montado
    // depois em pintarCards(), com as cores do proprio personagem
    return `<div class="app-card ${ativo ? "ativo" : ""} ${tem ? "" : "bloq"}"
                 data-app-outfit="${o.id}">
      <div class="app-img" data-pintar="${o.id}"><img
        src="assets/appearance/outfit/${o.id}.base.png"
        alt="${o.nome}" loading="lazy"></div>
      <div class="tiny">${o.nome}</div>
      <div class="tiny dim">
        ${tem ? (o.addons ? `addons ${ads}/${o.addons}` : "sem addon")
              : `<span class="gold-txt">${fmtFull(outfitPrice(o))} gp</span>`}
      </div>
    </div>`;
  };
  const cardMount = (m) => {
    const tem = ownsMount(p, m.id);
    const ativo = mnt && mnt.id === m.id;
    return `<div class="app-card ${ativo ? "ativo" : ""} ${tem ? "" : "bloq"}"
                 data-app-mount="${m.id}">
      <div class="app-img"><img src="assets/appearance/mount/${m.id}.base.png"
        alt="${m.nome}" loading="lazy"></div>
      <div class="tiny">${m.nome}</div>
      <div class="tiny dim">
        ${tem ? `+${m.speed} vel` : `<span class="gold-txt">${fmtFull(mountPrice(m))} gp</span>`}
      </div>
    </div>`;
  };

  el.innerHTML = `
    <div class="row mb8" style="gap:10px;align-items:flex-start">
      <div>
        <div id="app-preview" class="outfit-preview"></div>
        <div class="tiny dim center mt4" style="max-width:110px">
          ${atual ? atual.nome : "—"}${mnt ? "<br>+ " + mnt.nome : ""}
        </div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="small dim mb4">Addons do visual atual</div>
        <div class="row wrap mb8" style="gap:4px" id="app-addons">
          ${[[0, "Nenhum"], [1, "Addon 1"], [2, "Addon 2"], [3, "Os dois"]]
            .map(([n, t]) => {
              const donos = atual ? ownedAddons(p, atual.id) : 0;
              const temAddons = atual ? (atual.addons || 0) : 0;
              const ok = n === 0 || (n === 3 ? donos >= 2 : donos >= n);
              return `<button class="sm ${(p.outfit.addons || 0) === n ? "primary" : ""}"
                data-set-addon="${n}" ${ok ? "" : "disabled"}
                title="${ok ? "" : "Compre o addon primeiro"}">${t}</button>`;
            }).join("")}
        </div>
        ${atual && (atual.addons || 0) > ownedAddons(p, atual.id) ? `
          <button class="sm mb8" data-buy-addon="${atual.id}">
            Comprar addon ${ownedAddons(p, atual.id) + 1} ·
            <span class="gold-txt">${fmtFull(addonPrice(atual))} gp</span>
          </button>` : ""}
        <div class="small dim mb4">Montaria</div>
        <div class="row wrap" style="gap:4px">
          <button class="sm ${!mnt ? "primary" : ""}" data-set-mount="">
            A pé</button>
          ${mnt ? `<span class="tiny dim" style="align-self:center">
            Montado em <b>${mnt.nome}</b> (+${mnt.speed} velocidade)</span>` : ""}
        </div>
      </div>
    </div>

    <div class="row wrap mb4" style="gap:4px">
      <button class="sm ${modo === "outfit" ? "primary" : ""}"
        data-app-modo="outfit">Visuais</button>
      <button class="sm ${modo === "mount" ? "primary" : ""}"
        data-app-modo="mount">Montarias</button>
      <span style="flex:1"></span>
      ${[["all", "Todos"], ["owned", "Meus"], ["locked", "À venda"],
         ["premium", "Premium"]].map(([f, t]) =>
        `<button class="sm ${filtro === f ? "primary" : ""}"
          data-app-filtro="${f}">${t}</button>`).join("")}
    </div>
    <div class="tiny dim mb4">${lista.length} ${modo === "outfit" ? "visuais" : "montarias"}
      · clique para ${modo === "outfit" ? "vestir" : "montar"} ou comprar</div>
    <div class="app-grid">${lista.map(modo === "outfit" ? cardOutfit : cardMount).join("")}</div>`;

  /* Troca o PNG neutro de cada card pelo canvas colorido.
   * Feito em lotes com requestAnimationFrame: colorir 127 sprites de uma vez
   * congela a aba, porque cada um percorre a mascara pixel a pixel. */
  const pintarCards = () => {
    const alvos = $$("#cyclo-content [data-pintar]");
    let i = 0;
    const cores = (p.outfit && p.outfit.colors) ||
                  DEFAULT_OUTFIT_COLORS[p.voc] || DEFAULT_OUTFIT_COLORS.none;
    const lote = () => {
      let feitos = 0;
      while (i < alvos.length && feitos < 12) {
        const box = alvos[i];
        const id = box.dataset.pintar;
        const cv = AppearanceRenderer.outfit(id, 0, cores);
        if (cv) {
          box.innerHTML = "";
          box.appendChild(cv);
          i++; feitos++;
        } else {
          // ainda carregando: tenta de novo no proximo quadro
          break;
        }
      }
      if (i < alvos.length) requestAnimationFrame(lote);
    };
    requestAnimationFrame(lote);
  };
  if (modo === "outfit") pintarCards();

  // prévia com montaria e addons
  const desenhar = () => {
    const cv = AppearanceRenderer.preview(p);
    const box = $("#app-preview");
    if (!box) return;
    if (!cv) { box.innerHTML = `<div class="tiny dim">carregando…</div>`;
               setTimeout(desenhar, 140); return; }
    box.innerHTML = "";
    box.appendChild(cv);
  };
  desenhar();

  $$("#cyclo-content [data-app-modo]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.appModo = b.dataset.appModo;
      cycloAppearance(p, el);
    }));
  $$("#cyclo-content [data-app-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.filtro = b.dataset.appFiltro;
      cycloAppearance(p, el);
    }));
  $$("#cyclo-content [data-set-addon]").forEach((b) =>
    b.addEventListener("click", () => {
      setAddons(p, +b.dataset.setAddon);
      save(); renderAll();
      cycloAppearance(p, el);
    }));
  $$("#cyclo-content [data-buy-addon]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = buyAddon(p, b.dataset.buyAddon);
      if (!r.ok) { toast(r.erro); return; }
      toast(`Addon ${r.addon} comprado por <span class="gold-txt">${fmtFull(r.preco)} gp</span>`);
      setAddons(p, ownedAddons(p, b.dataset.buyAddon) >= 2 ? 3
                : ownedAddons(p, b.dataset.buyAddon));
      save(); renderAll(); renderCycloTabs();
      cycloAppearance(p, el);
    }));
  $$("#cyclo-content [data-set-mount]").forEach((b) =>
    b.addEventListener("click", () => {
      setMount(p, b.dataset.setMount || null);
      save(); renderAll();
      cycloAppearance(p, el);
    }));
  $$("#cyclo-content [data-app-outfit]").forEach((c) =>
    c.addEventListener("click", () => {
      const id = c.dataset.appOutfit;
      if (ownsOutfit(p, id)) {
        setAppearance(p, id);
        toast(`Visual: <b>${APP_OUTFIT[id].nome}</b>`);
      } else {
        const r = buyOutfit(p, id);
        if (!r.ok) { toast(r.erro); return; }
        setAppearance(p, id);
        toast(`<b>${APP_OUTFIT[id].nome}</b> comprado por
               <span class="gold-txt">${fmtFull(r.preco)} gp</span>`);
      }
      save(); renderAll(); renderCycloTabs();
      cycloAppearance(p, el);
    }));
  $$("#cyclo-content [data-app-mount]").forEach((c) =>
    c.addEventListener("click", () => {
      const id = c.dataset.appMount;
      if (ownsMount(p, id)) {
        setMount(p, currentMount(p) && currentMount(p).id === id ? null : id);
      } else {
        const r = buyMount(p, id);
        if (!r.ok) { toast(r.erro); return; }
        setMount(p, id);
        toast(`<b>${APP_MOUNT[id].nome}</b> comprada por
               <span class="gold-txt">${fmtFull(r.preco)} gp</span>`);
      }
      save(); renderAll(); renderCycloTabs();
      cycloAppearance(p, el);
    }));
}

/* ------------------------------------------------------------- bestiário */

function renderCycloBestiary(p, el) {
  const resumo = bestiarySummary(p);
  const busca = (CYCLO.busca || "").toLowerCase();
  let ls = Object.keys(GAMEDATA.monsters);
  if (busca) {
    ls = ls.filter((s) =>
      GAMEDATA.monsters[s].name.toLowerCase().indexOf(busca) !== -1);
  }
  if (CYCLO.filtro === "owned") ls = ls.filter((s) => bestiaryStage(p, s) > 0);
  else if (CYCLO.filtro === "locked") ls = ls.filter((s) => bestiaryStage(p, s) === 0);
  ls.sort((a, b) => GAMEDATA.monsters[a].hp - GAMEDATA.monsters[b].hp);

  if (CYCLO.sel && GAMEDATA.monsters[CYCLO.sel]) {
    return cycloBestiaryDetail(p, el, CYCLO.sel);
  }

  el.innerHTML = `
    <div class="row mb8" style="gap:6px;align-items:center">
      <div class="tiny dim">
        Descobertos <b style="color:#d4af37">${resumo.descobertos}</b>/${resumo.total}
        · Completos <b style="color:#9ce84a">${resumo.completos}</b>
        · <b class="gold-txt">${fmtFull(resumo.pontos)}</b> charm points
      </div>
      <span style="flex:1"></span>
      <input id="cyclo-busca" placeholder="buscar…" value="${CYCLO.busca || ""}"
        style="width:120px;padding:3px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      ${[["all", "Todos"], ["owned", "Vistos"], ["locked", "Ocultos"]]
        .map(([f, t]) => `<button class="sm ${CYCLO.filtro === f ? "primary" : ""}"
          data-best-filtro="${f}">${t}</button>`).join("")}
    </div>
    <div class="app-grid">
      ${ls.map((s) => {
        const m = GAMEDATA.monsters[s];
        const pr = bestiaryProgress(p, s);
        const visto = pr.estagio > 0;
        return `<div class="app-card ${visto ? "" : "bloq"}" data-best="${s}">
          <div class="app-img">
            <img src="assets/mob/${s}_s.png" alt="" loading="lazy"
                 style="${visto ? "" : "filter:brightness(0)"}">
          </div>
          <div class="tiny">${visto ? m.name : "???"}</div>
          <div class="tiny dim">${pr.kills} mortes</div>
          <div class="best-bar"><div style="width:${(pr.pct * 100).toFixed(0)}%"></div></div>
        </div>`;
      }).join("") || `<div class="dim tiny">Nenhum monstro nesse filtro.</div>`}
    </div>`;

  const inp = $("#cyclo-busca");
  if (inp) inp.addEventListener("input", () => {
    CYCLO.busca = inp.value;
    renderCycloBestiary(p, el);
    const n = $("#cyclo-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  $$("#cyclo-content [data-best-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.filtro = b.dataset.bestFiltro;
      renderCycloBestiary(p, el);
    }));
  $$("#cyclo-content [data-best]").forEach((c) =>
    c.addEventListener("click", () => {
      CYCLO.sel = c.dataset.best;
      renderCycloBestiary(p, el);
    }));
}

function cycloBestiaryDetail(p, el, slug) {
  const m = GAMEDATA.monsters[slug];
  const pr = bestiaryProgress(p, slug);
  const oculto = `<span class="dim">???</span>`;
  const ver = (campo, valor) =>
    bestiaryReveals(p, slug, campo) ? valor : oculto;

  el.innerHTML = `
    <div class="row mb8" style="gap:6px;align-items:center">
      <button class="sm" id="best-voltar">← Voltar</button>
      <b style="color:#d4af37">${pr.estagio > 0 ? m.name : "???"}</b>
      <span style="flex:1"></span>
      <span class="tiny dim">${pr.nome} · ${pr.kills} mortes</span>
    </div>
    <div class="cyclo-cols">
      <div>
        <div class="app-img" style="width:64px;height:64px;margin-bottom:8px">
          <img src="assets/mob/${slug}_s.png" alt=""
               style="${pr.estagio > 0 ? "" : "filter:brightness(0)"}">
        </div>
        ${linhaStat("Vida", ver("hp", fmtFull(m.hp)))}
        ${linhaStat("Experiência", ver("exp", fmtFull(m.exp)))}
        ${linhaStat("Dano base", ver("dano", m.damage))}
        ${linhaStat("Armadura", ver("armadura", m.armor))}
        ${linhaStat("Velocidade", ver("velocidade", m.speed || "—"))}
        ${linhaStat("Foge com", ver("velocidade",
          m.runAt ? m.runAt + "% de vida" : "não foge"))}
        <div class="small dim mt8 mb4">Progresso</div>
        <div class="best-bar big"><div style="width:${(pr.pct * 100).toFixed(0)}%"></div></div>
        <div class="tiny dim mt4">
          ${pr.completo ? "Bestiário completo!"
            : `${pr.kills} / ${pr.alvo} para <b>${
              BEST_ESTAGIOS[Math.min(pr.estagio, 3)].nome}</b>`}
        </div>
      </div>
      <div>
        <div class="small dim mb4">Resistências</div>
        ${bestiaryReveals(p, slug, "resistencias")
          ? (m.resist && Object.keys(m.resist).length
             ? Object.keys(m.resist).map((e) => `
                <div class="stat-row">
                  <span class="k" style="color:${(ELEMENTS[e] || {}).color || "#ccc"}">
                    ${(ELEMENTS[e] || {}).name || e}</span>
                  <span class="v" style="color:${m.resist[e] > 0 ? "#9ce84a" : "#ff9090"}">
                    ${m.resist[e] > 0 ? "+" : ""}${m.resist[e]}%</span>
                </div>`).join("")
             : `<div class="tiny dim">Nenhuma resistência.</div>`)
          : `<div class="tiny dim">Mate ${BEST_ESTAGIOS[2].kills} para revelar.</div>`}
        <div class="small dim mt8 mb4">Loot</div>
        ${bestiaryReveals(p, slug, "loot")
          ? (m.loot || []).map((l) => `
              <div class="stat-row">
                <span class="k">
                  <img src="assets/item/${l.item}.png"
                       style="width:14px;height:14px;vertical-align:-3px"> 
                  ${itemName(l.item)}</span>
                <span class="v">${l.chance}%${l.max > 1 ? " ·até " + l.max : ""}</span>
              </div>`).join("") || `<div class="tiny dim">Sem loot.</div>`
          : `<div class="tiny dim">Mate ${BEST_ESTAGIOS[1].kills} para revelar.</div>`}
      </div>
    </div>`;
  $("#best-voltar").addEventListener("click", () => {
    CYCLO.sel = null;
    renderCycloBestiary(p, el);
  });
}

/* ------------------------------------------------------------ bosstiário */

function renderCycloBosstiary(p, el) {
  const bosses = Object.keys(BOSS_DEFS);
  el.innerHTML = `
    <div class="tiny dim mb8">
      Bosses derrotados aparecem aqui com o loot e o tempo de espera.
      O jogo tem <b>${bosses.length}</b> boss${bosses.length > 1 ? "es" : ""} no momento.
    </div>
    ${bosses.map((id) => {
      const b = BOSS_DEFS[id];
      const st = bossState(p, id);
      const info = bossReadyInfo(p, b);
      return `<div class="shop-row">
        <img src="assets/mob/${b.sprite}_s.png" alt="">
        <div style="flex:1;min-width:0">
          <div class="small">${b.name}
            <span class="tiny dim">· ${b.title}</span></div>
          <div class="tiny dim">Vitórias: <b>${st.kills || 0}</b> ·
            ${info.ok ? `<span style="color:#9ce84a">Disponível</span>`
                      : `<span style="color:#ff9090">${info.reason}${
                          info.left ? " (" + Math.ceil(info.left / 60000) + " min)" : ""}</span>`}
          </div>
          <div class="tiny dim">Loot: ${bossLootText(b).slice(0, 4).join(", ")}…</div>
        </div>
      </div>`;
    }).join("")}`;
}

/* ---------------------------------------------------------------- charms */

function renderCycloCharms(p, el) {
  const pts = p.charmPoints || 0;
  el.innerHTML = `
    <div class="tiny dim mb8">
      Charm points vêm do bestiário: cada estágio de um monstro rende pontos
      (${BEST_CHARM_POINTS.slice(1).join(" / ")}).
      Você tem <b class="gold-txt">${fmtFull(pts)}</b>.
    </div>
    ${Object.keys(CHARMS).map((id) => {
      const c = CHARMS[id];
      const tem = charmOwned(p, id);
      const pode = pts >= c.custo;
      return `<div class="shop-row ${tem ? "selected" : ""}">
        <div style="flex:1;min-width:0">
          <div class="small">${c.nome}
            <span class="tiny dim">· ${c.tipo}</span></div>
          <div class="tiny dim">${c.desc}</div>
        </div>
        <button class="sm ${tem ? "primary" : ""}" data-buy-charm="${id}"
          ${tem || !pode ? "disabled" : ""}>
          ${tem ? "ATIVO" : fmtFull(c.custo) + " pts"}</button>
      </div>`;
    }).join("")}`;
  $$("#cyclo-content [data-buy-charm]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = buyCharm(p, b.dataset.buyCharm);
      if (!r.ok) { toast(r.erro); return; }
      toast(`Charm <b>${CHARMS[b.dataset.buyCharm].nome}</b> ativado!`);
      save(); renderAll();
      renderCycloCharms(p, el);
    }));
}

/* ----------------------------------------------------------------- itens */

function renderCycloItems(p, el) {
  const busca = (CYCLO.busca || "").toLowerCase();
  let ids = Object.keys(GAMEDATA.items);
  if (busca) {
    ids = ids.filter((i) =>
      (GAMEDATA.items[i].n || "").toLowerCase().indexOf(busca) !== -1);
  }
  ids.sort((a, b) => (GAMEDATA.items[a].n || a)
    .localeCompare(GAMEDATA.items[b].n || b));
  const mostrar = ids.slice(0, 160);
  el.innerHTML = `
    <div class="row mb8" style="gap:6px;align-items:center">
      <div class="tiny dim">${ids.length} itens conhecidos</div>
      <span style="flex:1"></span>
      <input id="cyclo-busca-item" placeholder="buscar item…"
        value="${CYCLO.busca || ""}"
        style="width:150px;padding:3px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
    </div>
    <div class="app-grid">
      ${mostrar.map((i) => {
        const it = GAMEDATA.items[i];
        return `<div class="app-card" title="${it.n}">
          <div class="app-img"><img src="assets/item/${i}.png" alt="" loading="lazy"></div>
          <div class="tiny">${it.n}</div>
          <div class="tiny dim">${it.sell ? fmtFull(it.sell) + " gp" : ""}</div>
        </div>`;
      }).join("")}
    </div>
    ${ids.length > mostrar.length
      ? `<div class="tiny dim mt4">Mostrando ${mostrar.length}. Use a busca.</div>`
      : ""}`;
  const inp = $("#cyclo-busca-item");
  if (inp) inp.addEventListener("input", () => {
    CYCLO.busca = inp.value;
    renderCycloItems(p, el);
    const n = $("#cyclo-busca-item");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
}
