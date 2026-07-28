/*
 * admin.js — painel de testes (modo debug).
 *
 * Existe para nao precisar cacar 3 horas so para conferir se uma espada de
 * nivel 600 aparece direito. Tudo aqui mexe no estado do jogador direto e
 * chama save()/renderAll(), os mesmos caminhos que o jogo normal usa — nada
 * de gravar em localStorage por fora, senao o proximo save sobrescreve.
 *
 * Nada neste arquivo e chamado pelo loop do jogo: se admin.js sumir, o resto
 * continua funcionando igual.
 */
"use strict";

const ADMIN = {
  aba: "char",
  busca: "",
  itemCat: "sword",
  logs: [],
};

/* Abas do painel */
const ADMIN_TABS = [
  { id: "char", nome: "👤 Personagem" },
  { id: "skills", nome: "📊 Skills" },
  { id: "items", nome: "🎒 Itens" },
  { id: "equip", nome: "🛡 Equipamento" },
  { id: "world", nome: "🌍 Mundo" },
];

/* Registra o que foi feito, para o usuario ver que a acao pegou */
function adminLog(msg) {
  ADMIN.logs.unshift(msg);
  if (ADMIN.logs.length > 8) ADMIN.logs.pop();
}

/* Aplica a mudanca e atualiza tudo de uma vez.
 * Centralizado porque esquecer o renderAll() faz o painel parecer quebrado
 * mesmo quando o estado mudou. */
function adminAplicar(msg) {
  if (msg) adminLog(msg);
  if (typeof save === "function") save();
  if (typeof renderAll === "function") renderAll();
  renderAdminContent();
}

/* ------------------------------------------------------------- abertura */

function openAdmin(aba) {
  const p = G.p;
  if (!p) { toast("Crie um personagem primeiro"); return; }
  if (aba) ADMIN.aba = aba;

  $("#modal-body").innerHTML = `
    <div class="panel-title">🛠 Painel Admin
      <span class="tiny dim" style="margin-left:8px">modo de testes</span>
      <span style="flex:1"></span>
      <button class="sm" id="admin-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="admin-tabs" id="admin-tabs"></div>
      <div class="admin-content" id="admin-content"></div>
      <div class="admin-log" id="admin-log"></div>
    </div>`;
  $("#modal").classList.add("show", "wide");
  $("#admin-close").addEventListener("click", () => {
    $("#modal").classList.remove("show", "wide");
  });
  renderAdminTabs();
  renderAdminContent();
}

function renderAdminTabs() {
  const el = $("#admin-tabs");
  if (!el) return;
  el.innerHTML = ADMIN_TABS.map((t) =>
    `<div class="admin-tab ${ADMIN.aba === t.id ? "active" : ""}"
       data-admin-tab="${t.id}">${t.nome}</div>`).join("");
  $$("#admin-tabs [data-admin-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      ADMIN.aba = b.dataset.adminTab;
      renderAdminTabs();
      renderAdminContent();
    }));
}

function renderAdminLog() {
  const el = $("#admin-log");
  if (!el) return;
  el.innerHTML = ADMIN.logs.length
    ? ADMIN.logs.map((l) => `<div class="tiny">▸ ${l}</div>`).join("")
    : `<div class="tiny dim">Nenhuma alteração ainda.</div>`;
}

function renderAdminContent() {
  const el = $("#admin-content");
  if (!el) return;
  const p = G.p;
  const fn = {
    char: renderAdminChar, skills: renderAdminSkills,
    items: renderAdminItems, equip: renderAdminEquip,
    world: renderAdminWorld,
  }[ADMIN.aba] || renderAdminChar;
  fn(p, el);
  renderAdminLog();
}

/* ------------------------------------------------------ aba: personagem */

/* Define o nivel e ajusta o que depende dele.
 * A exp PRECISA acompanhar: o loop de combate recalcula o nivel a partir da
 * exp, entao mudar so p.level fazia o personagem voltar ao nivel antigo no
 * primeiro kill. */
function adminSetLevel(p, lvl) {
  lvl = Math.max(1, Math.min(2000, Math.floor(lvl) || 1));
  p.level = lvl;
  p.exp = expForLevel(lvl);
  const m = maxStats(p);
  p.hp = m.hp;
  p.mp = m.mp;
  return lvl;
}

function renderAdminChar(p, el) {
  const m = maxStats(p);
  const vocs = Object.keys(VOCATIONS);
  el.innerHTML = `
    <div class="admin-grid">

      <div class="admin-card">
        <div class="admin-card-t">Nível e experiência</div>
        <div class="row" style="gap:6px;align-items:center">
          <input type="number" id="adm-level" value="${p.level}" min="1" max="2000"
                 class="admin-in" style="width:90px">
          <button class="sm primary" id="adm-level-set">Aplicar</button>
        </div>
        <div class="admin-quick">
          ${[10, 50, 100, 200, 300, 500, 1000].map((n) =>
            `<button class="sm" data-lvl="${n}">nv ${n}</button>`).join("")}
        </div>
        <div class="tiny dim mt4">exp atual: ${fmtFull(Math.floor(p.exp))}</div>
      </div>

      <div class="admin-card">
        <div class="admin-card-t">Vida e mana</div>
        <div class="stat-row"><span class="k">HP</span>
          <span class="v">${Math.floor(p.hp)} / ${m.hp}</span></div>
        <div class="stat-row"><span class="k">Mana</span>
          <span class="v">${Math.floor(p.mp)} / ${m.mp}</span></div>
        <div class="admin-quick">
          <button class="sm primary" id="adm-full">Encher HP/Mana</button>
          <button class="sm" id="adm-hp-half">HP 50%</button>
          <button class="sm" id="adm-hp-low">HP 10%</button>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-t">Gold e banco</div>
        <div class="row" style="gap:6px;align-items:center">
          <input type="number" id="adm-gold" value="${p.gold}" min="0"
                 class="admin-in" style="width:130px">
          <button class="sm primary" id="adm-gold-set">Aplicar</button>
        </div>
        <div class="admin-quick">
          ${[10000, 100000, 1000000, 100000000].map((n) =>
            `<button class="sm" data-gold="${n}">+${fmt(n)}</button>`).join("")}
          <button class="sm" data-gold="0">zerar</button>
        </div>
        <div class="tiny dim mt4">banco: ${fmtFull(p.bank || 0)} gp</div>
      </div>

      <div class="admin-card">
        <div class="admin-card-t">Vocação</div>
        <div class="admin-quick">
          ${vocs.map((v) => `<button class="sm ${p.voc === v ? "primary" : ""}"
            data-voc="${v}">${VOCATIONS[v].name}</button>`).join("")}
        </div>
        <div class="tiny dim mt4">
          Trocar a vocação recalcula HP/mana e mantém as skills.
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-t">Estado</div>
        <label class="admin-chk"><input type="checkbox" id="adm-promoted"
          ${p.promoted ? "checked" : ""}> Promovido (${PROMOTION_NAMES[p.voc] || "—"})</label>
        <label class="admin-chk"><input type="checkbox" id="adm-blessed"
          ${p.blessed ? "checked" : ""}> Bênção ativa</label>
        <div class="admin-quick">
          <button class="sm" id="adm-stamina">Stamina cheia (42h)</button>
          <button class="sm" id="adm-cure">Curar condições</button>
        </div>
        <div class="tiny dim mt4">condições ativas:
          ${Object.keys(p.conditions || {}).length || "nenhuma"}</div>
      </div>

      ${isMonk(p) ? `
      <div class="admin-card">
        <div class="admin-card-t">☯ Monk</div>
        <div class="stat-row"><span class="k">Mantra do equip</span>
          <span class="v">${mantraTotal(p)}</span></div>
        <div class="stat-row"><span class="k">Harmony</span>
          <span class="v">${harmonyAtual(p)} / 5
            (${Math.round((harmonyBonus(p) - 1) * 100)}%)</span></div>
        <div class="stat-row"><span class="k">Sereno</span>
          <span class="v">${monkSereno(p) ? "sim" : "não"}</span></div>
        <div class="admin-quick">
          ${[0, 1, 3, 5].map((n) =>
            `<button class="sm" data-harm="${n}">harmony ${n}</button>`).join("")}
        </div>
        <div class="admin-quick">
          ${[0, 1, 2, 3].map((n) =>
            `<button class="sm ${(p.monkShrines || 0) === n ? "primary" : ""}"
              data-shrine="${n}">${n} santuário${n === 1 ? "" : "s"}</button>`).join("")}
        </div>
        <div class="tiny dim mt4">
          Santuários somam o mantra ao golpe de punho (100% cada).
        </div>
      </div>` : ""}

      <div class="admin-card admin-danger">
        <div class="admin-card-t">Zona de risco</div>
        <div class="admin-quick">
          <button class="sm" id="adm-reset-skills">Zerar skills</button>
          <button class="sm" id="adm-clear-bag">Esvaziar mochila</button>
          <button class="sm" id="adm-unequip">Desequipar tudo</button>
        </div>
      </div>

    </div>`;

  const lvlInput = $("#adm-level");
  $("#adm-level-set").addEventListener("click", () => {
    const n = adminSetLevel(p, parseInt(lvlInput.value, 10));
    adminAplicar(`nível → ${n}`);
  });
  $$("#admin-content [data-lvl]").forEach((b) =>
    b.addEventListener("click", () => {
      const n = adminSetLevel(p, parseInt(b.dataset.lvl, 10));
      adminAplicar(`nível → ${n}`);
    }));

  $("#adm-full").addEventListener("click", () => {
    const mm = maxStats(p);
    p.hp = mm.hp; p.mp = mm.mp;
    adminAplicar("HP e mana cheios");
  });
  $("#adm-hp-half").addEventListener("click", () => {
    p.hp = Math.floor(maxStats(p).hp * 0.5);
    adminAplicar("HP em 50%");
  });
  $("#adm-hp-low").addEventListener("click", () => {
    p.hp = Math.max(1, Math.floor(maxStats(p).hp * 0.1));
    adminAplicar("HP em 10%");
  });

  const goldInput = $("#adm-gold");
  $("#adm-gold-set").addEventListener("click", () => {
    p.gold = Math.max(0, Math.floor(parseFloat(goldInput.value) || 0));
    adminAplicar(`gold → ${fmtFull(p.gold)}`);
  });
  $$("#admin-content [data-gold]").forEach((b) =>
    b.addEventListener("click", () => {
      const n = parseInt(b.dataset.gold, 10);
      p.gold = n === 0 ? 0 : p.gold + n;
      adminAplicar(`gold → ${fmtFull(p.gold)}`);
    }));

  $$("#admin-content [data-voc]").forEach((b) =>
    b.addEventListener("click", () => {
      p.voc = b.dataset.voc;
      const mm = maxStats(p);
      p.hp = mm.hp; p.mp = mm.mp;
      adminAplicar(`vocação → ${VOCATIONS[p.voc].name}`);
    }));

  $("#adm-promoted").addEventListener("change", (e) => {
    p.promoted = e.target.checked;
    if (p.promoted && !p.promotedAt) p.promotedAt = Date.now();
    adminAplicar(p.promoted ? "promovido" : "promoção removida");
  });
  $("#adm-blessed").addEventListener("change", (e) => {
    p.blessed = e.target.checked;
    adminAplicar(p.blessed ? "bênção ativa" : "bênção removida");
  });
  $("#adm-stamina").addEventListener("click", () => {
    p.stamina = 42 * 3600;
    adminAplicar("stamina cheia");
  });
  $("#adm-cure").addEventListener("click", () => {
    p.conditions = {};
    adminAplicar("condições curadas");
  });

  $$("#admin-content [data-harm]").forEach((b) =>
    b.addEventListener("click", () => {
      p.harmony = parseInt(b.dataset.harm, 10);
      adminAplicar(`harmony → ${p.harmony}`);
    }));
  $$("#admin-content [data-shrine]").forEach((b) =>
    b.addEventListener("click", () => {
      p.monkShrines = parseInt(b.dataset.shrine, 10);
      adminAplicar(`santuários → ${p.monkShrines}`);
    }));

  $("#adm-reset-skills").addEventListener("click", () => {
    for (const k in p.skills) p.skills[k] = 10;
    for (const k in p.skillTries) p.skillTries[k] = 0;
    p.ml = 0; p.manaSpent = 0;
    adminAplicar("skills zeradas");
  });
  $("#adm-clear-bag").addEventListener("click", () => {
    p.bag = {};
    adminAplicar("mochila esvaziada");
  });
  $("#adm-unequip").addEventListener("click", () => {
    // a bag fica: desequipar tudo e perder os itens seria pior que o bug
    for (const s of SLOTS) {
      if (s === "backpack" || !p.equip[s]) continue;
      if (s !== "ammo") addItem(p, p.equip[s].item, 1);
      delete p.equip[s];
    }
    adminAplicar("equipamento removido");
  });
}

/* ---------------------------------------------------------- aba: skills */

/* Coloca a skill no nivel pedido sem passar pelo loop de tries.
 * Zera o progresso parcial para a barra nao ficar mostrando 80% de um nivel
 * que o jogador nunca treinou. */
function adminSetSkill(p, which, valor) {
  valor = Math.max(10, Math.min(200, Math.floor(valor) || 10));
  if (which === "magic") {
    p.ml = Math.max(0, Math.min(200, Math.floor(valor)));
    p.manaSpent = 0;
    return p.ml;
  }
  p.skills[which] = valor;
  if (p.skillTries) p.skillTries[which] = 0;
  return valor;
}

function renderAdminSkills(p, el) {
  const skills = ["fist", "sword", "axe", "club", "dist", "shield"];
  el.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-t">Ajuste individual</div>
      <table class="admin-tbl">
        <tr><th>Skill</th><th>Atual</th><th>Efetiva</th><th style="width:150px">Definir</th></tr>
        ${skills.map((s) => `
          <tr>
            <td>${SKILL_NAMES[s]}</td>
            <td class="gold-txt">${p.skills[s]}</td>
            <td class="dim">${effSkill(p, s)}</td>
            <td>
              <input type="number" class="admin-in adm-sk" data-sk="${s}"
                     value="${p.skills[s]}" min="10" max="200" style="width:66px">
              <button class="sm" data-sk-set="${s}">ok</button>
            </td>
          </tr>`).join("")}
        <tr>
          <td>Magic Level</td>
          <td class="gold-txt">${p.ml}</td>
          <td class="dim">${effMagic(p)}</td>
          <td>
            <input type="number" class="admin-in adm-sk" data-sk="magic"
                   value="${p.ml}" min="0" max="200" style="width:66px">
            <button class="sm" data-sk-set="magic">ok</button>
          </td>
        </tr>
      </table>
    </div>

    <div class="admin-card">
      <div class="admin-card-t">Todas de uma vez</div>
      <div class="admin-quick">
        ${[10, 40, 60, 80, 100, 130, 150].map((n) =>
          `<button class="sm" data-all-sk="${n}">todas ${n}</button>`).join("")}
      </div>
      <div class="tiny dim mt4">
        Inclui o magic level. A skill efetiva soma os bônus do equipamento.
      </div>
    </div>`;

  $$("#admin-content [data-sk-set]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.dataset.skSet;
      const inp = $(`.adm-sk[data-sk="${s}"]`);
      const v = adminSetSkill(p, s, parseInt(inp.value, 10));
      adminAplicar(`${s === "magic" ? "magic level" : SKILL_NAMES[s]} → ${v}`);
    }));
  $$("#admin-content [data-all-sk]").forEach((b) =>
    b.addEventListener("click", () => {
      const n = parseInt(b.dataset.allSk, 10);
      for (const s of skills) adminSetSkill(p, s, n);
      adminSetSkill(p, "magic", n);
      adminAplicar(`todas as skills → ${n}`);
    }));
}

/* ----------------------------------------------------------- aba: itens */

/* Categorias do buscador. Reaproveita ITEM_CATS da Cyclopedia quando ela
 * estiver carregada, para nao manter duas listas que divergem com o tempo. */
function adminCats() {
  if (typeof ITEM_CATS !== "undefined") return ITEM_CATS;
  return [{ id: "all", nome: "Todos", match: () => true }];
}

function renderAdminItems(p, el) {
  const cats = adminCats();
  const def = cats.find((c) => c.id === ADMIN.itemCat) || cats[0];
  const busca = (ADMIN.busca || "").trim().toLowerCase();

  let ids = Object.keys(GAMEDATA.items).filter((i) => def.match(GAMEDATA.items[i]));
  if (busca) {
    ids = ids.filter((i) =>
      (GAMEDATA.items[i].n || i).toLowerCase().indexOf(busca) !== -1);
  }
  ids.sort((a, b) => {
    const A = GAMEDATA.items[a], B = GAMEDATA.items[b];
    return (A.lvl || 0) - (B.lvl || 0) || (A.n || a).localeCompare(B.n || b);
  });
  const mostra = ids.slice(0, 200);

  el.innerHTML = `
    <div class="row mb8" style="gap:6px;align-items:center">
      <input id="adm-busca" placeholder="Buscar item…" value="${ADMIN.busca || ""}"
             class="admin-in" style="flex:1">
      <span class="tiny dim">${ids.length} itens${
        ids.length > 200 ? " (200 primeiros)" : ""}</span>
    </div>
    <div class="admin-quick mb8">
      ${cats.map((c) => `<button class="sm ${
        ADMIN.itemCat === c.id ? "primary" : ""}"
        data-adm-cat="${c.id}">${c.nome}</button>`).join("")}
    </div>
    <div class="admin-itens">
      ${mostra.map((i) => {
        const it = GAMEDATA.items[i];
        const naBag = (p.bag && p.bag[i]) || 0;
        return `<div class="admin-item">
          ${itemImg(i, 28)}
          <div class="admin-item-n">
            <div class="small">${it.n}</div>
            <div class="tiny dim">${it.lvl ? "nv " + it.lvl + " · " : ""}${
              it.atk ? "atk " + it.atk + " · " : ""}${
              it.arm ? "arm " + it.arm + " · " : ""}${
              it.def ? "def " + it.def + " · " : ""}${
              it.vocs ? it.vocs.join("/") : "todas"}</div>
          </div>
          ${naBag ? `<span class="tiny gold-txt">${naBag}</span>` : ""}
          <button class="sm" data-give="${i}" data-n="1">+1</button>
          <button class="sm" data-give="${i}" data-n="100">+100</button>
          <button class="sm primary" data-give-eq="${i}">equipar</button>
        </div>`;
      }).join("") || `<div class="dim tiny" style="padding:10px">Nada encontrado.</div>`}
    </div>`;

  const inp = $("#adm-busca");
  inp.addEventListener("input", () => {
    ADMIN.busca = inp.value;
    renderAdminItems(p, el);
    const n = $("#adm-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  $$("#admin-content [data-adm-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      ADMIN.itemCat = b.dataset.admCat;
      renderAdminItems(p, el);
    }));
  $$("#admin-content [data-give]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.give;
      const n = parseInt(b.dataset.n, 10);
      // a bag tem limite de slots; sem espaco o addItem devolve false e o
      // item sumiria sem aviso nenhum
      if (!addItem(p, slug, n)) {
        toast("Sem espaço na mochila", "bad");
        return;
      }
      adminAplicar(`+${n} ${GAMEDATA.items[slug].n}`);
    }));
  $$("#admin-content [data-give-eq]").forEach((b) =>
    b.addEventListener("click", () => {
      adminEquipar(p, b.dataset.giveEq);
    }));
}

/* Equipa direto no slot certo do item, ignorando nivel e vocacao.
 * O objetivo do painel e justamente testar item que o char ainda nao pode
 * usar, entao aqui as regras de uso nao valem. */
function adminEquipar(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return;
  if (it.s === "ammo") {
    setActiveAmmo(p, slug);
    adminAplicar(`munição ativa: ${it.n}`);
    return;
  }
  const slot = it.s;
  if (!slot || SLOTS.indexOf(slot) === -1) {
    toast("Esse item não é equipável", "bad");
    return;
  }
  // devolve o que estava no slot, igual ao auto-equip faz
  if (p.equip[slot]) addItem(p, p.equip[slot].item, 1);
  if (p.bag && p.bag[slug]) removeItem(p, slug, 1);
  p.equip[slot] = { item: slug, count: 1 };
  adminAplicar(`equipou ${it.n} em ${slot}`);
}

/* ---------------------------------------------------- aba: equipamento */

/* Melhor item de cada slot que o Canary conhece, sem olhar nivel.
 * Usa itemScore quando existe, que e o mesmo criterio do auto-equip. */
function adminMelhorDoSlot(p, slot, respeitarVoc) {
  let melhor = null, nota = -1;
  for (const slug in GAMEDATA.items) {
    const it = GAMEDATA.items[slug];
    if (it.s !== slot) continue;
    if (it.t === "quiver" && !canUseQuiver(p)) continue;
    if (respeitarVoc && it.vocs && it.vocs.indexOf(p.voc) === -1) continue;
    const n = typeof itemScore === "function" ? itemScore(p, slug)
      : (it.atk || 0) + (it.arm || 0) * 3 + (it.def || 0);
    if (n > nota) { nota = n; melhor = slug; }
  }
  return melhor;
}

function renderAdminEquip(p, el) {
  const g = gearStats(p);
  el.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-t">Slots</div>
      <table class="admin-tbl">
        <tr><th>Slot</th><th>Item</th><th style="width:120px"></th></tr>
        ${SLOTS.map((s) => {
          const e = p.equip[s];
          const it = e ? GAMEDATA.items[e.item] : null;
          return `<tr>
            <td class="dim">${s}</td>
            <td>${it ? `<span class="row" style="gap:5px;align-items:center">
                   ${itemImg(e.item, 20)}<span class="small">${it.n}</span></span>`
                     : `<span class="tiny dim">vazio</span>`}</td>
            <td>
              <button class="sm" data-best-slot="${s}">melhor</button>
              ${it ? `<button class="sm" data-clear-slot="${s}">tirar</button>` : ""}
            </td>
          </tr>`;
        }).join("")}
      </table>
    </div>

    <div class="admin-card">
      <div class="admin-card-t">Kits prontos</div>
      <div class="admin-quick">
        <button class="sm primary" id="adm-best-all">Melhor de tudo (da vocação)</button>
        <button class="sm" id="adm-best-any">Melhor de tudo (ignorar vocação)</button>
      </div>
      <div class="tiny dim mt4">
        Escolhe pelo mesmo critério do auto-equipar, mas sem exigir nível.
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-t">Atributos somados</div>
      <div class="stat-row"><span class="k">Ataque</span><span class="v">${g.attack}</span></div>
      <div class="stat-row"><span class="k">Defesa</span><span class="v">${g.defense}</span></div>
      <div class="stat-row"><span class="k">Armadura</span><span class="v">${g.armor}</span></div>
      <div class="stat-row"><span class="k">Magic level</span><span class="v">+${g.mag}</span></div>
      <div class="stat-row"><span class="k">Velocidade</span><span class="v">+${g.speed}</span></div>
      <div class="stat-row"><span class="k">Peso</span><span class="v">${g.weight.toFixed(1)} oz</span></div>
    </div>`;

  $$("#admin-content [data-best-slot]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.dataset.bestSlot;
      const melhor = adminMelhorDoSlot(p, s, false);
      if (!melhor) { toast("Nenhum item para esse slot", "bad"); return; }
      if (p.equip[s]) addItem(p, p.equip[s].item, 1);
      p.equip[s] = { item: melhor, count: 1 };
      adminAplicar(`${s}: ${GAMEDATA.items[melhor].n}`);
    }));
  $$("#admin-content [data-clear-slot]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.dataset.clearSlot;
      if (p.equip[s] && s !== "ammo") addItem(p, p.equip[s].item, 1);
      delete p.equip[s];
      adminAplicar(`slot ${s} liberado`);
    }));

  const equiparTudo = (respeitarVoc) => {
    let n = 0;
    for (const s of SLOTS) {
      if (s === "ammo" || s === "backpack") continue;
      const melhor = adminMelhorDoSlot(p, s, respeitarVoc);
      if (!melhor) continue;
      if (p.equip[s]) addItem(p, p.equip[s].item, 1);
      p.equip[s] = { item: melhor, count: 1 };
      n++;
    }
    adminAplicar(`${n} slots preenchidos`);
  };
  $("#adm-best-all").addEventListener("click", () => equiparTudo(true));
  $("#adm-best-any").addEventListener("click", () => equiparTudo(false));
}

/* ---------------------------------------------------------- aba: mundo */

function renderAdminWorld(p, el) {
  const hunts = Object.keys(GAMEDATA.hunts || {});
  el.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-t">Bestiário e Charms</div>
      <div class="admin-quick">
        <button class="sm primary" id="adm-bestiary">Completar bestiário</button>
        <button class="sm" id="adm-charm-pts">+100.000 pontos de charm</button>
      </div>
      <div class="tiny dim mt4">
        Completar libera todos os 4 estágios de cada monstro, o que destrava
        os charms para compra.
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-t">Aparências</div>
      <div class="admin-quick">
        <button class="sm primary" id="adm-outfits">Liberar outfits e montarias</button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-t">Áreas de caça</div>
      <div class="tiny dim mb4">${hunts.length} áreas. O nível libera o acesso.</div>
      <div class="admin-quick">
        <button class="sm" id="adm-kills">+1000 kills registrados</button>
      </div>
    </div>

    <div class="admin-card admin-danger">
      <div class="admin-card-t">Save</div>
      <div class="admin-quick">
        <button class="sm" id="adm-export">Copiar save (JSON)</button>
        <button class="sm" id="adm-reload">Recarregar página</button>
      </div>
      <div class="tiny dim mt4">
        O save fica no localStorage e é gravado a cada alteração aqui.
      </div>
    </div>`;

  $("#adm-bestiary").addEventListener("click", () => {
    if (typeof ensureCyclopedia === "function") ensureCyclopedia(p);
    if (!p.bestiary) p.bestiary = {};
    let n = 0;
    for (const slug in GAMEDATA.monsters) {
      // 5000 abates cobre o ultimo estagio de qualquer bicho da tabela
      p.bestiary[slug] = Math.max(p.bestiary[slug] || 0, 5000);
      n++;
    }
    adminAplicar(`bestiário completo (${n} monstros)`);
  });
  $("#adm-charm-pts").addEventListener("click", () => {
    p.charmPoints = (p.charmPoints || 0) + 100000;
    adminAplicar(`charm points: ${fmtFull(p.charmPoints)}`);
  });
  $("#adm-outfits").addEventListener("click", () => {
    if (typeof ensureWardrobe === "function") ensureWardrobe(p);
    // o guarda-roupa mora em p.wardrobe.outfits (id "nome-sexo" -> addons)
    // e p.wardrobe.mounts (id -> true); nao em p.outfits/p.mounts
    let no = 0, nm = 0;
    if (typeof APP_OUTFIT !== "undefined") {
      for (const id in APP_OUTFIT) { p.wardrobe.outfits[id] = 3; no++; }
    }
    if (typeof APP_MOUNT !== "undefined") {
      for (const id in APP_MOUNT) { p.wardrobe.mounts[id] = true; nm++; }
    }
    adminAplicar(`${no} outfits (com addons) e ${nm} montarias liberadas`);
  });
  $("#adm-kills").addEventListener("click", () => {
    p.totalKills = (p.totalKills || 0) + 1000;
    adminAplicar(`total de kills: ${p.totalKills}`);
  });
  $("#adm-export").addEventListener("click", () => {
    const txt = JSON.stringify(p);
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    toast(`Save copiado (${(txt.length / 1024).toFixed(1)} KB)`);
  });
  $("#adm-reload").addEventListener("click", () => {
    save();
    location.reload();
  });
}
