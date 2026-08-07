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
  $("#modal").classList.add("modal-cyclo");
  $("#cyclo-close").addEventListener("click", () => {
    $("#modal").classList.remove("show", "wide", "modal-cyclo");
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
        return `<div class="cyclo-cell ${itemClsBorder(e.item)}" title="${it ? it.n : e.item}">
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
        return `<div class="cyclo-cell ${itemClsBorder(slug)}" title="${it ? it.n : slug}">
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
    // Canvas da preview precisa receber tamanho CSS; sem isso outfits sem
    // addon podiam ficar em 1:1 minúsculo/transparente no quadro do modal.
    cv.style.width = "76px"; cv.style.height = "76px";
    cv.style.imageRendering = "pixelated";
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

  // Paginacao. Com os 1655 monstros do Canary, desenhar a grade inteira de
  // uma vez cria 1655 cards e a mesma quantidade de backgrounds recortados —
  // o suficiente para travar a aba do navegador. Antes eram 91 cards e o
  // problema nao aparecia.
  const POR_PAGINA = 60;
  const totalPags = Math.max(1, Math.ceil(ls.length / POR_PAGINA));
  if (CYCLO.pag === undefined) CYCLO.pag = 0;
  CYCLO.pag = Math.max(0, Math.min(totalPags - 1, CYCLO.pag));
  const pagina = ls.slice(CYCLO.pag * POR_PAGINA,
                          (CYCLO.pag + 1) * POR_PAGINA);

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
      ${pagina.map((s) => {
        const m = GAMEDATA.monsters[s];
        const pr = bestiaryProgress(p, s);
        const visto = pr.estagio > 0;
        return `<div class="app-card ${visto ? "" : "bloq"}" data-best="${s}">
          <div class="app-img">
            ${mobImg(s, 48, visto ? "" : "filter:brightness(0);")}
          </div>
          <div class="tiny">${visto ? m.name : "???"}</div>
          <div class="tiny dim">${pr.kills} mortes</div>
          <div class="best-bar"><div style="width:${(pr.pct * 100).toFixed(0)}%"></div></div>
        </div>`;
      }).join("") || `<div class="dim tiny">Nenhum monstro nesse filtro.</div>`}
    </div>
    ${totalPags > 1 ? `<div class="row mt8" style="gap:6px;align-items:center">
      <button class="sm" data-best-pag="${CYCLO.pag - 1}"
        ${CYCLO.pag === 0 ? "disabled" : ""}>‹ Anterior</button>
      <div class="tiny dim">Página ${CYCLO.pag + 1} de ${totalPags}
        · ${ls.length} criaturas</div>
      <button class="sm" data-best-pag="${CYCLO.pag + 1}"
        ${CYCLO.pag >= totalPags - 1 ? "disabled" : ""}>Próxima ›</button>
    </div>` : ""}`;

  el.querySelectorAll("[data-best-pag]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.pag = parseInt(b.dataset.bestPag, 10);
      renderCycloBestiary(p, el);
    }));

  const inp = $("#cyclo-busca");
  if (inp) inp.addEventListener("input", () => {
    CYCLO.busca = inp.value;
    CYCLO.pag = 0;              // filtrar volta para a primeira pagina
    renderCycloBestiary(p, el);
    const n = $("#cyclo-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  $$("#cyclo-content [data-best-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.filtro = b.dataset.bestFiltro;
      CYCLO.pag = 0;
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
          ${mobImg(slug, 64, pr.estagio > 0 ? "" : "filter:brightness(0);")}
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
          : `<div class="tiny dim">Mate ${bestiaryMarcos(slug)[2]} para revelar.</div>`}
        <div class="small dim mt8 mb4">Loot</div>
        ${bestiaryReveals(p, slug, "loot")
          ? (m.loot || []).filter((l) => l.item).map((l) => `
              <div class="stat-row">
                <span class="k">
                  <img src="assets/item/${l.item}.png"
                       style="width:14px;height:14px;vertical-align:-3px"> 
                  ${itemName(l.item)}</span>
                <span class="v">${l.chance}%${l.max > 1 ? " ·até " + l.max : ""}</span>
              </div>`).join("") || `<div class="tiny dim">Sem loot.</div>`
          : `<div class="tiny dim">Mate ${bestiaryMarcos(slug)[1]} para revelar.</div>`}
      </div>
    </div>`;
  $("#best-voltar").addEventListener("click", () => {
    CYCLO.sel = null;
    renderCycloBestiary(p, el);
  });
}

/* ------------------------------------------------------------ bosstiário */

function renderCycloBosstiary(p, el) {
  ensureBosstiary(p);
  const cat = CYCLO.bossFiltro || "todos";
  const ls = bosstiaryList(cat);
  const rs = bosstiarySummary(p);

  // mesma paginacao do bestiario: 353 bosses de uma vez travam a aba
  const POR_PAGINA = 60;
  const totalPags = Math.max(1, Math.ceil(ls.length / POR_PAGINA));
  if (CYCLO.bossPag === undefined) CYCLO.bossPag = 0;
  CYCLO.bossPag = Math.max(0, Math.min(totalPags - 1, CYCLO.bossPag));
  const pagina = ls.slice(CYCLO.bossPag * POR_PAGINA,
                          (CYCLO.bossPag + 1) * POR_PAGINA);

  el.innerHTML = `
    <div class="best-head">
      <div>
        <div class="small">Nível do Bosstiário
          <b class="gold-txt">${rs.nivel}</b></div>
        <div class="tiny dim">${fmtFull(rs.pontos)} pontos ·
          faltam ${fmtFull(Math.max(0, rs.prox.faltam))} para o ${rs.prox.nivel}</div>
      </div>
      <div style="text-align:right">
        <div class="tiny dim">Dano contra bosses</div>
        <div class="small" style="color:#9ce84a">
          +${Math.round((rs.bonus - 1) * 100)}%</div>
      </div>
    </div>
    <div class="tiny dim mb8">
      ${rs.descobertos} de ${rs.total} bosses encontrados ·
      ${rs.completos} completos
    </div>
    <div class="app-filters mb8">
      ${["todos", "bane", "archfoe", "nemesis"].map((f) => `
        <button class="sm ${cat === f ? "on" : ""}" data-boss-filtro="${f}">
          ${f === "todos" ? "Todos" : BOSS_CATS[f].nome}</button>`).join("")}
    </div>
    <div class="app-grid">
      ${pagina.map((slug) => {
        const m = GAMEDATA.monsters[slug];
        const pr = bosstiaryProgress(p, slug);
        const visto = pr.kills > 0;
        return `<div class="app-card ${visto ? "" : "bloq"}" data-boss-ficha="${slug}">
          <div class="app-img">
            ${mobImg(slug, 48, visto ? "" : "filter:brightness(0);")}
          </div>
          <div class="tiny">${visto ? m.name : "???"}</div>
          <div class="tiny" style="color:${pr.cat.cor}">${pr.cat.nome}</div>
          <div class="tiny dim">${pr.kills} / ${pr.alvo}</div>
          <div class="best-bar"><div style="width:${(pr.pct * 100).toFixed(0)}%
            ;background:${pr.cat.cor}"></div></div>
        </div>`;
      }).join("")}
    </div>
    ${totalPags > 1 ? `<div class="row mt8" style="gap:6px;align-items:center">
      <button class="sm" data-boss-pag="${CYCLO.bossPag - 1}"
        ${CYCLO.bossPag === 0 ? "disabled" : ""}>‹ Anterior</button>
      <div class="tiny dim">Página ${CYCLO.bossPag + 1} de ${totalPags}
        · ${ls.length} bosses</div>
      <button class="sm" data-boss-pag="${CYCLO.bossPag + 1}"
        ${CYCLO.bossPag >= totalPags - 1 ? "disabled" : ""}>Próxima ›</button>
    </div>` : ""}`;

  el.querySelectorAll("[data-boss-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.bossFiltro = b.dataset.bossFiltro;
      CYCLO.bossPag = 0;        // trocar de categoria volta ao inicio
      renderCycloBosstiary(p, el);
    }));
  el.querySelectorAll("[data-boss-pag]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.bossPag = parseInt(b.dataset.bossPag, 10);
      renderCycloBosstiary(p, el);
    }));
}

/* ---------------------------------------------------------------- charms */

function renderCycloCharms(p, el) {
  const pts = p.charmPoints || 0;
  el.innerHTML = `
    <div class="tiny dim mb8">
      Charm points vêm do bestiário: cada estágio de um monstro rende pontos
      (o total varia por criatura: o Canary define os pontos de cada uma).
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

/* ----------------------------------------------------------------- itens
 *
 * Catalogo no formato do baiakidle: coluna de categorias a esquerda com a
 * contagem, lista no meio e o detalhe do item selecionado a direita. Antes
 * era uma grade unica de 160 itens sem separacao, impossivel de navegar.
 *
 * As categorias seguem a taxonomia do TibiaWiki (Armas corpo a corpo,
 * Distancia, Wands & Rods, Escudos, Aljavas, Extra Slot...), casada com os
 * campos `s` (slot) e `t` (tipo) que o jogo ja guarda em cada item.
 */
const ITEM_CATS = [
  // armas, na mesma ordem do mercado do Tibia
  { id: "sword", nome: "Espadas", grupo: "Armas",
    match: (it) => it.t === "sword" },
  { id: "axe", nome: "Machados", grupo: "Armas",
    match: (it) => it.t === "axe" },
  { id: "club", nome: "Clavas", grupo: "Armas",
    match: (it) => it.t === "club" },
  { id: "distance", nome: "Distância", grupo: "Armas",
    match: (it) => it.s === "weapon" && it.t === "distance" },
  { id: "wand", nome: "Wands & Rods", grupo: "Armas",
    match: (it) => it.s === "weapon" && (it.t === "magic" || it.cat === "wand") },
  { id: "fist", nome: "Punho (Monk)", grupo: "Armas",
    match: (it) => it.t === "fist" },
  // defesa
  { id: "shield", nome: "Escudos", grupo: "Defesa",
    match: (it) => it.s === "shield" && it.t === "shield" },
  { id: "spellbook", nome: "Spellbooks", grupo: "Defesa",
    match: (it) => it.t === "spellbook" },
  { id: "quiver", nome: "Aljavas", grupo: "Defesa",
    match: (it) => it.t === "quiver" },
  { id: "ammo", nome: "Munição", grupo: "Defesa",
    match: (it) => it.s === "ammo" },
  // vestimenta
  { id: "helmet", nome: "Elmos", grupo: "Vestimenta",
    match: (it) => it.s === "helmet" },
  { id: "armor", nome: "Armaduras", grupo: "Vestimenta",
    match: (it) => it.s === "armor" },
  { id: "legs", nome: "Calças", grupo: "Vestimenta",
    match: (it) => it.s === "legs" },
  { id: "boots", nome: "Botas", grupo: "Vestimenta",
    match: (it) => it.s === "boots" },
  { id: "amulet", nome: "Amuletos", grupo: "Vestimenta",
    match: (it) => it.s === "amulet" },
  { id: "ring", nome: "Anéis", grupo: "Vestimenta",
    match: (it) => it.s === "ring" },
  { id: "extra", nome: "Extra Slot", grupo: "Vestimenta",
    match: (it) => it.s === "extra" },
  // resto
  { id: "supply", nome: "Suprimentos", grupo: "Outros",
    match: (it) => it.t === "supply" },
  { id: "loot", nome: "Despojos", grupo: "Outros",
    match: (it) => it.t === "loot" },
];

/* Ordena por nivel exigido e depois por poder, para a lista mostrar a
 * progressao em vez da ordem alfabetica */
function itemSortKey(it) {
  const poder = (it.atk || 0) + (it.arm || 0) + (it.def || 0) +
                (it.elDmg || 0) + (it.mdmg || 0) + (it.mag || 0) * 5;
  return [(it.lvl || 0), poder];
}

/* Vocacoes disponiveis no filtro. `todas` mostra tudo, incluindo o que a
 * vocacao do jogador nao pode usar. */
const ITEM_VOCS = [
  { id: "", nome: "Todas" },
  { id: "mine", nome: "Minha" },
  { id: "knight", nome: "Knight" },
  { id: "paladin", nome: "Paladin" },
  { id: "druid", nome: "Druid" },
  { id: "sorcerer", nome: "Sorcerer" },
  { id: "monk", nome: "Monk" },
];

/* Aplica os filtros de vocacao, nivel, origem e busca a uma lista de slugs.
 *
 * O filtro de vocacao trata "sem restricao" como liberado para todos: no
 * items.xml a maioria dos itens simplesmente nao declara vocacao, e escondê-los
 * ao filtrar por Knight deixaria a lista quase vazia.
 */
function filtraItens(p, ids) {
  const f = CYCLO.itemFiltro || {};
  const busca = (CYCLO.busca || "").trim().toLowerCase();
  return ids.filter((i) => {
    const it = GAMEDATA.items[i];
    if (!it) return false;
    if (busca && (it.n || "").toLowerCase().indexOf(busca) === -1) return false;
    if (f.voc) {
      const alvo = f.voc === "mine" ? p.voc : f.voc;
      if (it.vocs && it.vocs.indexOf(alvo) === -1) return false;
    }
    if (f.lvlMax && (it.lvl || 0) > f.lvlMax) return false;
    if (f.usavel && !itemLiberado(p, it)) return false;
    if (f.origem === "loja" && !itemNaLoja(it)) return false;
    if (f.origem === "drop" && itemNaLoja(it)) return false;
    if (f.anim && !itemAnimado(it)) return false;
    if (f.cls && (it.cls || 0) !== f.cls) return false;
    return true;
  });
}

function renderCycloItems(p, el) {
  const cat = CYCLO.itemCat || "sword";
  const def = ITEM_CATS.find((c) => c.id === cat) || ITEM_CATS[0];
  // chave propria: CYCLO.filtro ja e uma STRING usada pelo bestiario e pela
  // aba de aparencias; escrever um objeto ali quebrava as duas
  if (!CYCLO.itemFiltro) CYCLO.itemFiltro = { voc: "", lvlMax: 0, origem: "" };
  const f = CYCLO.itemFiltro;

  const daCat = (c) => Object.keys(GAMEDATA.items)
    .filter((i) => c.match(GAMEDATA.items[i]));

  const brutos = daCat(def);
  let ids = filtraItens(p, brutos);
  ids.sort((a, b) => {
    const ka = itemSortKey(GAMEDATA.items[a]);
    const kb = itemSortKey(GAMEDATA.items[b]);
    return (ka[0] - kb[0]) || (ka[1] - kb[1]) ||
           (GAMEDATA.items[a].n || a).localeCompare(GAMEDATA.items[b].n || b);
  });

  const sel = CYCLO.itemSel && GAMEDATA.items[CYCLO.itemSel]
    ? CYCLO.itemSel : null;

  // maior nivel da categoria, para calibrar o slider
  let maxLvl = 0;
  for (const i of brutos) maxLvl = Math.max(maxLvl, GAMEDATA.items[i].lvl || 0);
  maxLvl = Math.ceil(maxLvl / 25) * 25 || 100;

  const btn = (chave, valor, texto, ativo) =>
    `<div class="item-filtro ${ativo ? "active" : ""}"
      data-filtro="${chave}" data-valor="${valor}">${texto}</div>`;

  // as categorias sao agrupadas (Armas / Defesa / Vestimenta / Outros) para
  // a coluna nao virar uma lista corrida de 19 linhas
  let grupoAtual = "";
  const colunaCats = ITEM_CATS.map((c) => {
    const n = daCat(c).length;
    if (!n) return "";
    let cab = "";
    if (c.grupo !== grupoAtual) {
      grupoAtual = c.grupo;
      cab = `<div class="tiny dim" style="padding:6px 4px 2px">${c.grupo}</div>`;
    }
    return cab + `<div class="item-cat ${cat === c.id ? "active" : ""}"
      data-item-cat="${c.id}">${c.nome} <span class="dim">(${n})</span></div>`;
  }).join("");

  el.innerHTML = `
    <div class="row mb8" style="gap:6px;align-items:center">
      <input id="cyclo-busca-item" placeholder="Buscar item…"
        value="${CYCLO.busca || ""}"
        style="flex:1;padding:5px;background:#14120e;color:#c8c0a8;border:1px solid #16140f">
      <span class="tiny dim">${ids.length} de ${brutos.length}</span>
    </div>
    <div class="item-filtros">
      ${ITEM_VOCS.map((v) =>
        btn("voc", v.id, v.nome, (f.voc || "") === v.id)).join("")}
      <span class="sep"></span>
      ${btn("origem", "", "Todos", !f.origem)}
      ${btn("origem", "loja", "Loja", f.origem === "loja")}
      ${btn("origem", "drop", "Drop", f.origem === "drop")}
      <span class="sep"></span>
      ${btn("usavel", "1", "Só usáveis", !!f.usavel)}
      ${btn("anim", "1", "Animados", !!f.anim)}
      <span class="sep"></span>
      <label>nv ≤ <input id="cyclo-lvl" type="range" min="0" max="${maxLvl}"
        step="5" value="${f.lvlMax || maxLvl}">
        <b style="color:#ffe680" id="cyclo-lvl-val">${f.lvlMax || "∞"}</b></label>
      ${(f.voc || f.origem || f.usavel || f.anim || f.lvlMax)
        ? `<div class="item-filtro" id="cyclo-limpar"
             style="color:#c86a4a">✕ limpar</div>` : ""}
    </div>
    <div class="item-browser">
      <div class="item-cats">${colunaCats}</div>
      <div class="item-list">
        ${ids.map((i) => {
          const it = GAMEDATA.items[i];
          const bloq = !itemLiberado(p, it);
          return `<div class="item-row ${sel === i ? "active" : ""} ${itemClsBorder(i)}"
                       data-item-pick="${i}" style="${bloq ? "opacity:.55" : ""}">
            ${itemImg(i, 26)}
            <span class="small">${it.n}</span>
            ${it.af ? `<span class="badge-anim" title="sprite animada">▸</span>` : ""}
            ${it.cls ? `<span class="badge-cls" title="classificação ${it.cls}">C${it.cls}</span>` : ""}
            ${it.lvl ? `<span class="tiny dim">nv ${it.lvl}</span>` : ""}
          </div>`;
        }).join("") || `<div class="dim tiny" style="padding:10px">Nada com esses filtros.</div>`}
      </div>
      <div class="item-detail">
        ${sel ? detalheItem(p, sel)
              : `<div class="dim tiny" style="padding:20px;text-align:center">
                   Selecione um item para ver os detalhes.</div>`}
      </div>
    </div>`;

  const inp = $("#cyclo-busca-item");
  if (inp) inp.addEventListener("input", () => {
    CYCLO.busca = inp.value;
    renderCycloItems(p, el);
    const n = $("#cyclo-busca-item");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  const lim = $("#cyclo-limpar");
  if (lim) lim.addEventListener("click", () => {
    CYCLO.itemFiltro = { voc: "", lvlMax: 0, origem: "" };
    renderCycloItems(p, el);
  });
  const sl = $("#cyclo-lvl");
  if (sl) sl.addEventListener("input", () => {
    const v = parseInt(sl.value, 10);
    f.lvlMax = v >= maxLvl ? 0 : v;
    const lbl = $("#cyclo-lvl-val");
    if (lbl) lbl.textContent = f.lvlMax || "∞";
    clearTimeout(CYCLO._lvlTimer);
    // redesenha com atraso: arrastar o slider redesenharia a lista a cada
    // pixel e travaria a aba com 170 itens
    CYCLO._lvlTimer = setTimeout(() => renderCycloItems(p, el), 180);
  });
  $$("#cyclo-content [data-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.filtro, v = b.dataset.valor;
      if (k === "usavel" || k === "anim") f[k] = f[k] ? 0 : 1;
      else f[k] = f[k] === v ? "" : v;
      CYCLO.itemSel = null;
      renderCycloItems(p, el);
    }));
  $$("#cyclo-content [data-item-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.itemCat = b.dataset.itemCat;
      CYCLO.itemSel = null;
      f.lvlMax = 0;
      renderCycloItems(p, el);
    }));
  $$("#cyclo-content [data-item-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      CYCLO.itemSel = b.dataset.itemPick;
      renderCycloItems(p, el);
    }));
}

/* Painel de detalhe do item selecionado.
 *
 * Mostra tudo que veio do Canary: classificacao da forja, augments,
 * resistencias por elemento, leech, bonus de skill e o preco de NPC real
 * (que e so informativo — a economia do jogo usa `sell`/`buy`).
 */
function detalheItem(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return "";
  const linha = (k, v) => v
    ? `<div class="stat-row"><span class="k">${k}</span><span class="v">${v}</span></div>`
    : "";
  const el = it.el && ELEMENTS[it.el] ? ELEMENTS[it.el] : null;
  const q = it.t === "quiver" ? QUIVER_DEFS[slug] : null;
  const equipado = SLOTS.some((s) => p.equip[s] && p.equip[s].item === slug);
  const naBag = (p.bag && p.bag[slug]) || 0;
  const liberado = itemLiberado(p, it);

  const skills = ["sword", "axe", "club", "dist", "shield", "fist"]
    .filter((s) => it[s])
    .map((s) => `+${it[s]} ${s}`).join(", ");

  const res = it.res ? Object.keys(it.res).map((e) => {
    const cor = (ELEMENTS[e] || {}).color || "#ccc";
    const nome = (ELEMENTS[e] || {}).name || e;
    return `<span style="color:${cor}">${it.res[e] > 0 ? "+" : ""}${it.res[e]}% ${nome}</span>`;
  }).join(" · ") : "";

  const aug = it.aug ? it.aug.map((a) =>
    `<div class="tiny" style="color:#9ce84a">▸ ${
      typeof augmentLabel === "function" ? augmentLabel(a) : (a.s + " +" + a.v + "% " + (a.k || ""))
    }</div>`).join("") : "";

  return `
    <div style="text-align:center;padding:8px 0">
      <div style="display:flex;justify-content:center">${itemImg(slug, 48)}</div>
      <div class="small mt4" style="color:#d4af37">${it.n}</div>
      ${equipado ? `<div class="tiny" style="color:#9ce84a">equipado</div>`
                 : (naBag ? `<div class="tiny dim">${naBag} na mochila</div>` : "")}
      ${!liberado ? `<div class="tiny" style="color:#c86a4a">não pode usar ainda</div>` : ""}
    </div>
    ${linha("Nível", it.lvl || "")}
    ${linha("Vocação", it.vocs ? it.vocs.join(", ") : "")}
    ${linha("Ataque", it.atk || "")}
    ${linha("Dano elemental", it.elDmg && el
      ? `<span style="color:${el.color}">${it.elDmg} ${el.name}</span>` : "")}
    ${linha("Dano mágico", it.mdmg
      ? (it.dmgMin ? `${it.dmgMin}–${it.dmgMax}` : it.mdmg) : "")}
    ${linha("Mana por tiro", it.manaCost || "")}
    ${linha("Defesa", it.def ? it.def + (it.extraDef ? ` (+${it.extraDef})` : "") : "")}
    ${linha("Armadura", it.arm || "")}
    ${linha("Magic level", it.mag ? "+" + it.mag : "")}
    ${linha("Skills", skills)}
    ${linha("Elemento", !it.elDmg && el
      ? `<span style="color:${el.color}">${el.name}</span>` : "")}
    ${linha("Resistências", res)}
    ${linha("Elemental Bond", it.bond && ELEMENTS[it.bond]
      ? `<span style="color:${ELEMENTS[it.bond].color}">${ELEMENTS[it.bond].name}</span>
         <span class="tiny dim">(elemento das magias)</span>` : "")}
    ${linha("Mantra", it.mantra
      ? `<span style="color:#7ec8ff">${it.mantra}</span>
         <span class="tiny dim">(abate dano elemental)</span>` : "")}
    ${linha("Life leech", it.lifeLeech ? it.lifeLeech + "%" : "")}
    ${linha("Mana leech", it.manaLeech ? it.manaLeech + "%" : "")}
    ${linha("Regen. vida", it.hpreg || "")}
    ${linha("Regen. mana", it.mpreg || "")}
    ${linha("Velocidade", it.spd ? "+" + it.spd : "")}
    ${linha("Duas mãos", it.th ? "sim" : "")}
    ${linha("Peso", it.w ? it.w.toFixed(2) + " oz" : "")}
    ${it.s === "ammo"
      ? linha("Custo por tiro", `<span class="gold-txt">${it.shotCost || it.buy || 0} gp</span>`)
      : linha("Compra", it.buy ? `<span class="gold-txt">${fmtFull(it.buy)} gp</span>` : "")}
    ${linha("Venda", it.sell ? `<span class="gold-txt">${fmtFull(it.sell)} gp</span>` : "")}
    ${linha("Preço NPC (Tibia)", it.npcBuy
      ? `<span class="dim">${fmtFull(it.npcBuy)} gp</span>` : "")}
    ${it.cls ? linha("Classificação",
      `<span style="color:#d4af37">${it.cls}</span>
       <span class="tiny dim">(forja: até tier ${it.cls * 2 + 2})</span>`) : ""}
    ${aug ? `<div class="stat-row" style="display:block">
      <div class="k mb4">Augments</div>${aug}</div>` : ""}
    ${q ? `
      ${linha("Espaços", q.cap)}
      ${q.shotDmg ? linha("Perfect shot",
        `<span style="color:#ffe680">+${q.shotDmg} a ${q.shotRange} SQM</span>`) : ""}
      ${q.prot ? Object.keys(q.prot).map((e) => linha(
        "Resistência", `<span style="color:${(ELEMENTS[e] || {}).color || "#ccc"}">+${q.prot[e]}% ${e}</span>`)).join("") : ""}
      ${q.drop ? `<div class="tiny mt4" style="color:#c07cff">${
        typeof quiverDropSource === "function" ? quiverDropSource(slug) : "drop de boss"}</div>` : ""}
    ` : ""}
    ${it.imbSlots ? linha("Slots de imbuement", it.imbSlots) : ""}
    ${!itemNaLoja(it) && it.s
      ? `<div class="tiny mt4" style="color:#c07cff">só por drop ou quest</div>` : ""}`;
}
