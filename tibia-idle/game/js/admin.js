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
  mobBusca: "",
  mobBoss: false,
  mobMult: 10,
  forgeBusca: "",
  forgeMobBusca: "",
  forgeStacks: 5,
  logs: [],
};

/* Abas do painel */
const ADMIN_TABS = [
  { id: "char", nome: "👤 Personagem" },
  { id: "coins", nome: "🪙 Coins" },
  { id: "skills", nome: "📊 Skills" },
  { id: "items", nome: "🎒 Itens" },
  { id: "loot", nome: "💰 Despojos" },
  { id: "imb", nome: "✨ Imbuements" },
  { id: "equip", nome: "🛡 Equipamento" },
  { id: "forge", nome: "⚒ FORJE" },
  { id: "mobs", nome: "👹 Invocar" },
  { id: "store", nome: "💰 Faturamento" },
];

/* Registra o que foi feito, para o usuario ver que a acao pegou */
function adminLog(msg) {
  ADMIN.logs.unshift(msg);
  if (ADMIN.logs.length > 8) ADMIN.logs.pop();
}

/* Aplica a mudanca e atualiza tudo de uma vez.
 * Centralizado porque esquecer o renderAll() faz o painel parecer quebrado
 * mesmo quando o estado mudou.
 *
 * Online: usa accountAdminSaveCharacter (admin_grant) para gravar level/exp/
 * skills/gold/bag/etc. no MySQL e no authority da instância — o autosave
 * comum protege esses campos e, em combate, nem chega a enviar o PUT. */
function adminAplicar(msg) {
  if (msg) adminLog(msg);
  adminPersist().catch((err) => {
    console.warn("[admin] persistência falhou", err);
    if (typeof toast === "function") toast("Falha ao salvar grant admin no servidor", "bad");
  });
}

async function adminPersist() {
  const p = typeof G !== "undefined" && G ? G.p : null;
  if (p && typeof saveCharacterToRoster === "function") saveCharacterToRoster(p);
  try {
    if (p) {
      localStorage.setItem(typeof SAVE_KEY !== "undefined" ? SAVE_KEY : "tibia-idle-save-v1",
        JSON.stringify({ v: 1, p: p, session: null }));
    }
  } catch (e) {}
  if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
      typeof accountAdminSaveCharacter === "function" && p && p.id) {
    const tok = typeof sessionToken === "function" ? sessionToken() : "";
    if (tok) {
      const ok = await accountAdminSaveCharacter(tok, String(p.id), p);
      if (!ok && typeof toast === "function") {
        const detail = (typeof accountAdminGrantLastError === "function" &&
          accountAdminGrantLastError()) || "";
        toast(detail || "Servidor recusou o grant admin. Recarregue e tente de novo.", "bad");
      }
    }
  } else if (typeof save === "function") {
    save();
  }
  if (typeof renderAll === "function") renderAll();
  renderAdminContent();
  return true;
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
    char: renderAdminChar, coins: renderAdminCoins,
    skills: renderAdminSkills,
    items: renderAdminItems, loot: renderAdminLoot, imb: renderAdminImbuements, equip: renderAdminEquip,
    forge: renderAdminForge, mobs: renderAdminMobs, store: renderAdminStore,
  }[ADMIN.aba] || renderAdminChar;
  fn(p, el);
  renderAdminLog();
}

/* -------------------------------------------------------- aba: coins */

/* Tibia Coins — moeda premium da CONTA (vale para todos os personagens,
 * como no client oficial). */
function renderAdminCoins(p, el) {
  const saldo = accountCoins();
  el.innerHTML = `
    <div class="admin-grid">

      <div class="admin-card">
        <div class="admin-card-t">Tibia Coins — saldo da conta</div>
        <div class="stat-row"><span class="k">Saldo atual</span>
          <span class="v">
            <img src="${COINS_GIF}" class="coin-gif" style="width:22px;height:22px;vertical-align:middle" alt="Tibia Coins">
            <b class="coin-txt" style="font-size:15px" id="adm-coins-n">${fmtFull(saldo)}</b>
          </span></div>
        <div class="tiny dim mt4">
          Os Tibia Coins ficam na <b>conta</b> e valem para todos os
          personagens do save — como no client oficial.<br>
          No Tibia: 250 TC = 30 dias de Premium Time.
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-t">Adicionar Tibia Coins</div>
        <div class="row" style="gap:6px;align-items:center">
          <input type="number" id="adm-coins" value="250" min="0"
                 class="admin-in" style="width:130px">
          <button class="sm primary" id="adm-coins-set">Adicionar</button>
        </div>
        <div class="admin-quick">
          ${[25, 250, 1000, 2500, 10000].map((n) =>
            `<button class="sm" data-coins="${n}">+${fmt(n)}</button>`).join("")}
          <button class="sm" data-coins="0">zerar</button>
        </div>
      </div>

    </div>`;

  const updateCoins=async(n,reset)=>{
    if(typeof accountApiConfigured==="function"&&accountApiConfigured()){
      const acc=typeof sessionAccount==="function"?sessionAccount():null;
      const amount=reset?-(acc&&acc.coins||0):n;
      const result=await accountAddCoins(sessionToken(),amount);
      if(!result.ok){toast(result.msg||"Servidor recusou a alteração de Coins","bad");return null;}
      return result.coins;
    }
    return typeof accountSetCoins==="function"
      ?accountSetCoins(reset?0:accountCoins()+n):0;
  };
  $("#adm-coins-set").addEventListener("click", async () => {
    const n = parseInt($("#adm-coins").value, 10);
    if (!Number.isFinite(n) || n <= 0) { toast("Valor inválido"); return; }
    const total=await updateCoins(n,false);if(total===null)return;
    adminAplicar(`+${fmtFull(n)} Tibia Coins na conta (saldo: ${fmtFull(total)})`);
  });
  $$("#admin-content [data-coins]").forEach((b) =>
    b.addEventListener("click", async () => {
      const n = parseInt(b.dataset.coins, 10);
      const total=await updateCoins(n,n===0);if(total===null)return;
      adminAplicar(n > 0
        ? `+${fmtFull(n)} Tibia Coins na conta (saldo: ${fmtFull(total)})`
        : "Tibia Coins zerados");
    }));
}

function storeFmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("pt-BR") : "—";
}
function storeFmtBrl(n) {
  return "R$ " + (Number(n) || 0).toFixed(2).replace(".", ",");
}

async function renderAdminStore(p, el) {
  el.innerHTML = `<div class="tiny dim">Carregando faturamento da STORE...</div>`;
  if (typeof storeAdminSummary !== "function") {
    el.innerHTML = `<div class="tiny" style="color:#ff9a6a">Cliente da STORE ausente.</div>`;
    return;
  }
  const r = await storeAdminSummary(sessionToken());
  if (!r.ok) {
    el.innerHTML = `<div class="tiny" style="color:#ff9a6a">${r.msg || "Sem permissão"}</div>
      <div class="tiny dim mt4">A aba Faturamento lista quem comprou Tibia Coins, o valor em R$ e o ledger (compra, VIP, ajuste admin).</div>`;
    return;
  }
  const t = r.totals || {};
  const accounts = r.accounts || [];
  const orders = r.orders || [];
  const ledger = r.ledger || [];
  el.innerHTML = `
    <div class="tiny dim mb4">Controle de Tibia Coins: compras Mercado Pago, gastos de VIP e ajustes manuais.</div>
    <div class="admin-grid mb4">
      <div class="admin-card"><div class="admin-card-t">Faturamento</div><b style="color:#ffe680">${storeFmtBrl(t.revenueBrl)}</b></div>
      <div class="admin-card"><div class="admin-card-t">TC vendidos</div><b>${t.coinsSold || 0}</b></div>
      <div class="admin-card"><div class="admin-card-t">TC gastos (VIP)</div><b>${t.coinsSpent || 0}</b></div>
      <div class="admin-card"><div class="admin-card-t">Ajustes admin</div><b>${t.coinsGranted || 0}</b></div>
      <div class="admin-card"><div class="admin-card-t">Pendentes</div><b>${t.pendingOrders || 0}</b></div>
      <div class="admin-card"><div class="admin-card-t">Mercado Pago</div><b>${r.mpConfigured ? "ligado" : "off"}</b></div>
    </div>
    <div class="admin-card-t">Saldos por conta</div>
    <div style="max-height:180px;overflow:auto" class="mb4">
      <table class="admin-tbl"><thead><tr><th>Login</th><th>TC</th><th>VIP</th></tr></thead><tbody>
        ${accounts.map((a) => `<tr><td>${String(a.login || "").replace(/[<>]/g, "")}</td><td>${a.coins}</td><td>${a.vipUntil > Date.now() ? storeFmtWhen(a.vipUntil) : "—"}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="admin-card-t">Pedidos</div>
    <div style="max-height:180px;overflow:auto" class="mb4">
      <table class="admin-tbl"><thead><tr><th>#</th><th>Login</th><th>Pacote</th><th>R$</th><th>Status</th><th>Quando</th></tr></thead><tbody>
        ${orders.map((o) => `<tr><td>${o.id}</td><td>${String(o.login || "").replace(/[<>]/g, "")}</td><td>${o.packId} · ${o.method}</td><td>${storeFmtBrl(o.brl)}</td><td>${o.status}</td><td>${storeFmtWhen(o.createdAt)}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="admin-card-t">Ledger</div>
    <div style="max-height:180px;overflow:auto">
      <table class="admin-tbl"><thead><tr><th>Login</th><th>Tipo</th><th>Δ TC</th><th>R$</th><th>Nota</th><th>Quando</th></tr></thead><tbody>
        ${ledger.map((l) => `<tr><td>${String(l.login || "").replace(/[<>]/g, "")}</td><td>${l.kind}</td><td>${l.delta}</td><td>${storeFmtBrl((l.brlCents || 0) / 100)}</td><td>${String(l.note || "").replace(/[<>]/g, "")}</td><td>${storeFmtWhen(l.createdAt)}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
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
        <div class="admin-card-t">VIP da conta</div>
        <div class="stat-row"><span class="k">Status</span>
          <span class="v" id="adm-vip-status">${typeof isVip === "function" && isVip()
            ? `<b style="color:#9ce84a">ATIVO</b> · ${typeof fmtVipTime === "function" ? fmtVipTime() : ""}`
            : `<span class="dim">inativo</span>`}</span></div>
        <div class="row" style="gap:6px;align-items:center;margin-top:6px">
          <input type="number" id="adm-vip-days" value="30" min="1" max="3650"
                 class="admin-in" style="width:90px" title="Dias de VIP">
          <button class="sm primary" id="adm-vip-add">Adicionar dias</button>
        </div>
        <div class="admin-quick">
          ${[7, 30, 90, 365].map((n) =>
            `<button class="sm" data-vip-days="${n}">+${n}d</button>`).join("")}
          <button class="sm" id="adm-vip-clear">Remover VIP</button>
        </div>
        <div class="tiny dim mt4">
          VIP fica na <b>conta</b> (vale para todos os personagens).
          Benefícios: revive 15s, +10% EXP, autoseller, controle manual SQM, etc.
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

  const applyVipDays = async (days, clear) => {
    if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
        typeof accountAddVipDays === "function" && typeof sessionToken === "function") {
      const result = await accountAddVipDays(sessionToken(), clear ? 0 : days, !!clear);
      if (!result.ok) { toast(result.msg || "Servidor recusou o VIP", "bad"); return; }
      if (p) p.vipUntil = result.vipUntil || 0;
      adminAplicar(clear
        ? "VIP removido da conta"
        : `VIP +${days}d (resta: ${typeof fmtVipTime === "function" ? fmtVipTime() : ""})`);
      return;
    }
    if (clear) {
      if (typeof deactivateVip === "function") deactivateVip();
      if (p) p.vipUntil = 0;
      adminAplicar("VIP removido (local)");
      return;
    }
    if (typeof activateVip === "function") activateVip(days);
    if (p && typeof sessionVipUntil === "function") p.vipUntil = sessionVipUntil();
    adminAplicar(`VIP +${days}d (local · resta: ${typeof fmtVipTime === "function" ? fmtVipTime() : ""})`);
  };
  const vipAddBtn = $("#adm-vip-add");
  if (vipAddBtn) vipAddBtn.addEventListener("click", async () => {
    const n = parseInt(($("#adm-vip-days") || {}).value, 10);
    if (!Number.isFinite(n) || n <= 0) { toast("Dias inválidos"); return; }
    await applyVipDays(n, false);
  });
  $$("#admin-content [data-vip-days]").forEach((b) =>
    b.addEventListener("click", async () => {
      await applyVipDays(parseInt(b.dataset.vipDays, 10), false);
    }));
  const vipClear = $("#adm-vip-clear");
  if (vipClear) vipClear.addEventListener("click", async () => {
    await applyVipDays(0, true);
  });

  $$("#admin-content [data-voc]").forEach((b) =>
    b.addEventListener("click", async () => {
      const oldVoc=p.voc,newVoc=b.dataset.voc;
      p.voc=newVoc;p.promoted=false;p.promotedAt=null;
      const mm=maxStats(p);p.hp=mm.hp;p.mp=mm.mp;
      // Vocation-base é imutável no save comum para impedir cruzamento entre
      // personagens. Admin/test server usa a rota explícita de reparo.
      if(typeof accountApiConfigured==="function"&&accountApiConfigured()&&
         typeof accountRepairCharacter==="function"&&typeof sessionToken==="function"){
        const result=await accountRepairCharacter(sessionToken(),String(p.id),newVoc,p);
        if(!result.ok){p.voc=oldVoc;toast(result.msg||"Falha ao trocar vocação","bad");renderAdminContent();return;}
      }
      if(typeof G!=="undefined"&&G.combat&&G.combat.players){
        const ent=G.combat.players.find(e=>e.p===p||String(e.id)===String(p.id));if(ent)ent.voc=newVoc;
      }
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

function renderAdminLoot(p, el) {
  const bag = typeof GAMEDATA !== "undefined" && GAMEDATA.items['bag-you-desire'];
  el.innerHTML = `<div class="admin-card"><div class="admin-card-t">Despojos Soul War</div>
    <div class="small">Bag You Desire · chance de teste 10%</div>
    <div class="admin-quick"><button class="sm primary" id="adm-bag-desire" ${bag ? '' : 'disabled'}>Adicionar Bag You Desire</button></div>
    <div class="tiny dim mt4">Abra a bag pela Loot Pouch para receber um item aleatório Soul War no Depot.</div></div>`;
  const b = $('#adm-bag-desire');
  if (b) b.addEventListener('click', () => { p.lootPouch = p.lootPouch || {}; p.lootPouch['bag-you-desire'] = (p.lootPouch['bag-you-desire'] || 0) + 1; adminAplicar('Bag You Desire adicionada'); });
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
 * usar, entao aqui as regras de uso nao valem.
 * Sempre cria/liga itemInstances: a aba FORJE e os procs leem por instância. */
function adminSetEquipSlot(p, slot, slug) {
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  if (p.equip[slot]) {
    if (typeof takeEquippedItemInstance === "function"
        && typeof itemUsesInstances === "function"
        && itemUsesInstances(p.equip[slot].item)) {
      const old = takeEquippedItemInstance(p, slot);
      if (old) {
        if (typeof putBagItemInstance === "function") {
          if (!putBagItemInstance(p, old) && typeof addItem === "function") {
            // mochila cheia: ainda devolve como stack legado se der
            addItem(p, old.slug, 1);
            if (typeof deleteItemInstance === "function") deleteItemInstance(p, old.id);
          }
        } else if (typeof addItem === "function") {
          addItem(p, old.slug, 1);
        }
      }
    } else {
      if (typeof addItem === "function") addItem(p, p.equip[slot].item, 1);
      delete p.equip[slot];
    }
  }
  if (typeof itemUsesInstances === "function" && itemUsesInstances(slug)
      && typeof equipEntryInstance === "function") {
    let inst = (typeof takeBagItemInstance === "function")
      ? takeBagItemInstance(p, slug) : null;
    if (!inst) {
      inst = {
        id: nextItemInstanceId(p),
        slug: slug,
        loc: null,
        tier: 0,
      };
      p.itemInstances = p.itemInstances || [];
      p.itemInstances.push(inst);
    }
    equipEntryInstance(p, slot, inst);
    return;
  }
  if (p.bag && p.bag[slug] && typeof removeItem === "function") removeItem(p, slug, 1);
  p.equip[slot] = { item: slug, count: 1 };
}

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
  adminSetEquipSlot(p, slot, slug);
  adminAplicar(`equipou ${it.n} em ${slot}`);
}


/* ---------------------------------------------------------- aba: FORJE */

function adminClampInt(value, min, max) {
  let n = Math.floor(Number(value));
  if (!Number.isFinite(n)) n = min;
  if (max !== undefined) n = Math.min(max, n);
  return Math.max(min, n);
}

function adminForgeLocLabel(loc) {
  loc = String(loc || "");
  if (loc === "bag") return "mochila";
  if (loc.indexOf("equip:") === 0) return "equipado: " + loc.slice(6);
  return loc || "inventário";
}

function adminForgeInventoryInstances(p) {
  // Garante instâncias para slots equipados sem instId (kits/admin legados).
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  if (typeof ensureForge === "function") ensureForge(p);
  const out = [];
  const seen = Object.create(null);
  const insts = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  for (const inst of insts) {
    if (!inst || !inst.slug || !inst.id || seen[inst.id]) continue;
    const loc = String(inst.loc || "");
    if (loc !== "bag" && loc.indexOf("equip:") !== 0) continue;
    if (typeof forgeIsEligibleItem === "function" && !forgeIsEligibleItem(inst.slug)) continue;
    const it = GAMEDATA.items[inst.slug];
    if (!it) continue;
    const maxTier = typeof forgeMaxTierForSlug === "function" ? forgeMaxTierForSlug(inst.slug) : 0;
    if (!maxTier) continue;
    seen[inst.id] = true;
    out.push({
      id: inst.id,
      inst: inst,
      slug: inst.slug,
      it: it,
      name: it.n || inst.slug,
      tier: typeof itemInstanceTier === "function" ? itemInstanceTier(inst) : (inst.tier || 0),
      maxTier: maxTier,
      cls: it.cls || 0,
      slot: it.s || "?",
      loc: loc,
      locLabel: adminForgeLocLabel(loc),
    });
  }
  out.sort((a, b) => {
    const la = a.loc.indexOf("equip:") === 0 ? 0 : 1;
    const lb = b.loc.indexOf("equip:") === 0 ? 0 : 1;
    return la - lb || a.slot.localeCompare(b.slot) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return out;
}

function adminSetForgeItemTier(p, instId, tier) {
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  const inst = typeof findItemInstance === "function" ? findItemInstance(p, instId) : null;
  if (!inst) return { ok: false, msg: "Item não encontrado no inventário." };
  if (typeof forgeIsEligibleItem === "function" && !forgeIsEligibleItem(inst.slug)) {
    return { ok: false, msg: "Item não é elegível para tier da Forge." };
  }
  const maxTier = typeof forgeMaxTierForSlug === "function" ? forgeMaxTierForSlug(inst.slug) : 0;
  tier = adminClampInt(tier, 0, maxTier);
  if (typeof forgeSetItemTier === "function") forgeSetItemTier(p, inst.id, tier);
  else inst.tier = tier;
  const it = GAMEDATA.items[inst.slug];
  return { ok: true, tier: tier, msg: `${it ? it.n : inst.slug} → ${tier ? "T" + tier : "sem tier"}` };
}

function adminApplyForgeMonsterVariant(def, variant, stacks) {
  variant = variant === "fiendish" || variant === "influenced" ? variant : "";
  const out = { influenced: false, fiendish: false, stacks: 0 };
  if (!variant || !def) return out;

  const s = variant === "fiendish" ? 15 : adminClampInt(stacks, 1, 5);
  const hp = Number(def.hp || 1);
  const exp = Number(def.exp || 0);
  const damage = Number(def.damage || 1);
  const armor = Number(def.armor || 0);
  const statMul = 1.35 + (s * 0.15);
  def.name = typeof displayMonsterName === "function"
    ? displayMonsterName(def.name)
    : String(def.name || "").replace(/^Influenced\s+/i, "").replace(/^Fiendish\s+/i, "");
  def.hp = Math.max(1, Math.floor(hp * statMul));
  def.exp = Math.floor(exp * (1 + s * 0.25));
  def.damage = Math.max(1, Math.floor(damage * (1 + s * 0.08)));
  def.armor = Math.floor(armor * (1 + s * 0.05));

  out.influenced = variant === "influenced";
  out.fiendish = variant === "fiendish";
  out.stacks = s;
  return out;
}

function adminForgeMonsterPreview(base, variant, stacks) {
  const def = Object.assign({}, base || {});
  const flags = adminApplyForgeMonsterVariant(def, variant, stacks);
  return Object.assign({ def: def }, flags);
}

function renderAdminForge(p, el) {
  if (typeof ensureForge === "function") ensureForge(p);
  const dustLimit = p.dustLimit || 100;
  const busca = (ADMIN.forgeBusca || "").trim().toLowerCase();
  const allItems = adminForgeInventoryInstances(p);
  let items = allItems;
  if (busca) {
    items = items.filter((e) => {
      const hay = `${e.name} ${e.slug} ${e.slot} ${e.locLabel} T${e.tier}`.toLowerCase();
      return hay.indexOf(busca) !== -1;
    });
  }
  const mostraItems = items.slice(0, 120);

  const c = G.combat;
  const mobBusca = (ADMIN.forgeMobBusca || "").trim().toLowerCase();
  let mobIds = Object.keys(GAMEDATA.monsters || {});
  if (mobBusca) {
    mobIds = mobIds.filter((i) =>
      (GAMEDATA.monsters[i].name || i).toLowerCase().indexOf(mobBusca) !== -1);
  }
  mobIds.sort((a, b) => (GAMEDATA.monsters[a].hp || 0) - (GAMEDATA.monsters[b].hp || 0));
  const mostraMobs = mobIds.slice(0, 120);
  const stacks = adminClampInt(ADMIN.forgeStacks || 5, 1, 5);
  ADMIN.forgeStacks = stacks;

  el.innerHTML = `
    <div class="admin-grid">

      <div class="admin-card">
        <div class="admin-card-t">Recursos da Forge</div>
        <div class="stat-row"><span class="k">Dust</span>
          <span class="v">${fmtFull(p.dust || 0)} / ${fmtFull(dustLimit)}</span></div>
        <div class="stat-row"><span class="k">Slivers</span>
          <span class="v">${fmtFull(p.slivers || 0)}</span></div>
        <div class="stat-row"><span class="k">Exalted Cores</span>
          <span class="v">${fmtFull(p.exaltedCores || 0)}</span></div>
        <div class="row mt8" style="gap:6px;align-items:center;flex-wrap:wrap">
          <label class="tiny dim">Dust</label>
          <input type="number" id="adm-forge-dust" value="${p.dust || 0}" min="0"
                 class="admin-in" style="width:90px">
          <label class="tiny dim">Limite</label>
          <input type="number" id="adm-forge-limit" value="${dustLimit}" min="100" max="325"
                 class="admin-in" style="width:90px">
          <button class="sm primary" id="adm-forge-res-apply">Aplicar</button>
        </div>
        <div class="row mt8" style="gap:6px;align-items:center;flex-wrap:wrap">
          <label class="tiny dim">Slivers</label>
          <input type="number" id="adm-forge-slivers" value="${p.slivers || 0}" min="0"
                 class="admin-in" style="width:90px">
          <label class="tiny dim">Cores</label>
          <input type="number" id="adm-forge-cores" value="${p.exaltedCores || 0}" min="0"
                 class="admin-in" style="width:90px">
        </div>
        <div class="admin-quick">
          <button class="sm" id="adm-forge-dust-zero">zerar dust</button>
          <button class="sm" id="adm-forge-dust-full">encher dust</button>
          <button class="sm" id="adm-forge-dust-plus">+100 dust</button>
        </div>
        <div class="tiny dim mt4">O limite segue a regra oficial atual da Forge: 100 até 325.</div>
      </div>

      <div class="admin-card" style="grid-column:1/-1">
        <div class="admin-card-t">Tier dos itens no inventário</div>
        <div class="row mb8" style="gap:6px;align-items:center;flex-wrap:wrap">
          <input id="adm-forge-busca" placeholder="Buscar item, slot ou local…" value="${ADMIN.forgeBusca || ""}"
                 class="admin-in" style="flex:1;min-width:220px">
          <span class="tiny dim" id="adm-forge-eligible-count">${items.length} de ${allItems.length} itens elegíveis</span>
          <span class="tiny dim">tier</span>
          <input type="number" id="adm-forge-all-tier" value="0" min="0" max="10"
                 class="admin-in" style="width:62px" title="Tier para aplicar em todos da lista"
                 aria-label="Tier para aplicar na lista">
          <button class="sm" id="adm-forge-all-apply">Aplicar tier na lista</button>
          <button class="sm" id="adm-forge-all-zero">Zerar lista</button>
        </div>
        <div class="tiny dim mb8">
          Mostra equipamentos da mochila e os equipados. Cada item físico é uma instância separada.
        </div>
        <div class="admin-itens">
          ${mostraItems.map((e) => {
            const opts = Array.from({ length: e.maxTier + 1 }, (_, n) =>
              `<option value="${n}" ${n === e.tier ? "selected" : ""}>${n ? "T" + n : "T0"}</option>`).join("");
            return `<div class="admin-item">
              ${itemImg(e.slug, 28)}
              <div class="admin-item-n">
                <div class="small">${e.name}</div>
                <div class="tiny dim">${e.locLabel} · ${e.slot} · cls ${e.cls} · atual ${e.tier ? "T" + e.tier : "sem tier"} · máx T${e.maxTier}</div>
              </div>
              <span class="tiny gold-txt">${e.tier ? "T" + e.tier : "T0"}</span>
              <select class="admin-in adm-forge-tier" data-inst-id="${e.id}" style="width:68px">${opts}</select>
              <button class="sm primary" data-forge-tier-set="${e.id}">ok</button>
              <button class="sm" data-forge-tier-max="${e.id}">T${e.maxTier}</button>
            </div>`;
          }).join("") || `<div class="dim tiny" style="padding:10px">Nenhum item elegível no inventário.</div>`}
        </div>
        ${items.length > 120 ? `<div class="tiny dim mt4">Mostrando 120 de ${items.length} — refine a busca.</div>` : ""}
      </div>

      <div class="admin-card" style="grid-column:1/-1">
        <div class="admin-card-t">Invocar monstros Influenced / Fiendish</div>
        ${!c ? `
          <div class="tiny dim">
            Nenhum combate em andamento. Entre em uma hunt ou boss e volte aqui para invocar monstros especiais na arena atual.
          </div>` : `
          <div class="stat-row"><span class="k">Arena atual</span>
            <span class="v">${c.boss ? "boss" : (c.hunt ? c.hunt.name : c.huntId)}</span></div>
          <div class="stat-row"><span class="k">Monstros vivos</span>
            <span class="v">${c.mobs.length}</span></div>
          <div class="row mb8" style="gap:6px;align-items:center;flex-wrap:wrap">
            <input id="adm-forge-mob-busca" placeholder="Buscar monstro…" value="${ADMIN.forgeMobBusca || ""}"
                   class="admin-in" style="flex:1;min-width:220px">
            <label class="tiny dim">Stacks influenced</label>
            <input type="number" id="adm-forge-stacks" value="${stacks}" min="1" max="5"
                   class="admin-in" style="width:62px">
            <button class="sm" id="adm-forge-clear-special">Remover especiais</button>
          </div>
          <div class="admin-itens">
            ${mostraMobs.map((i) => {
              const m = GAMEDATA.monsters[i];
              const inf = adminForgeMonsterPreview(m, "influenced", stacks).def;
              const fie = adminForgeMonsterPreview(m, "fiendish", stacks).def;
              return `<div class="admin-item">
                ${typeof mobImg === "function" ? mobImg(i, 28) : ""}
                <div class="admin-item-n">
                  <div class="small">${m.name}</div>
                  <div class="tiny dim">base hp ${fmtFull(m.hp || 0)} · inf${stacks} hp ${fmtFull(inf.hp || 0)} · fiendish hp ${fmtFull(fie.hp || 0)}</div>
                </div>
                <button class="sm" data-forge-summon="${i}" data-variant="influenced"><img src="assets/ui/icons/influenced-creature.png" style="width:12px;height:12px;vertical-align:-2px;margin-right:3px">Influenced</button>
                <button class="sm primary" data-forge-summon="${i}" data-variant="fiendish"><img src="assets/ui/icons/fiendish-creature.png" style="width:12px;height:12px;vertical-align:-2px;margin-right:3px">Fiendish</button>
              </div>`;
            }).join("") || `<div class="dim tiny" style="padding:10px">Nada encontrado.</div>`}
          </div>
          ${mobIds.length > 120 ? `<div class="tiny dim mt4">Mostrando 120 de ${mobIds.length} — refine a busca.</div>` : ""}`}
      </div>

    </div>`;

  const dustInp = $("#adm-forge-dust");
  const limitInp = $("#adm-forge-limit");
  const sliverInp = $("#adm-forge-slivers");
  const coreInp = $("#adm-forge-cores");
  const applyResources = () => {
    const limit = adminClampInt(limitInp ? limitInp.value : p.dustLimit, 100, 325);
    p.dustLimit = limit;
    p.dust = adminClampInt(dustInp ? dustInp.value : p.dust, 0, limit);
    p.slivers = adminClampInt(sliverInp ? sliverInp.value : p.slivers, 0);
    p.exaltedCores = adminClampInt(coreInp ? coreInp.value : p.exaltedCores, 0);
    adminAplicar(`Forge: dust ${p.dust}/${p.dustLimit}, slivers ${p.slivers}, cores ${p.exaltedCores}`);
  };
  const resBtn = $("#adm-forge-res-apply");
  if (resBtn) resBtn.addEventListener("click", applyResources);
  if ($("#adm-forge-dust-zero")) $("#adm-forge-dust-zero").addEventListener("click", () => {
    p.dust = 0;
    adminAplicar("Dust zerado");
  });
  if ($("#adm-forge-dust-full")) $("#adm-forge-dust-full").addEventListener("click", () => {
    p.dust = p.dustLimit || 100;
    adminAplicar(`Dust preenchido (${p.dust}/${p.dustLimit})`);
  });
  if ($("#adm-forge-dust-plus")) $("#adm-forge-dust-plus").addEventListener("click", () => {
    p.dust = Math.min(p.dustLimit || 100, (p.dust || 0) + 100);
    adminAplicar(`Dust → ${p.dust}/${p.dustLimit}`);
  });

  const buscaInp = $("#adm-forge-busca");
  if (buscaInp) buscaInp.addEventListener("input", () => {
    ADMIN.forgeBusca = buscaInp.value;
    renderAdminForge(p, el);
    const n = $("#adm-forge-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });

  $$("#admin-content [data-forge-tier-set]").forEach((b) =>
    b.addEventListener("click", () => {
      const sel = $(`.adm-forge-tier[data-inst-id="${b.dataset.forgeTierSet}"]`);
      const r = adminSetForgeItemTier(p, b.dataset.forgeTierSet, sel ? sel.value : 0);
      adminAplicar(r.msg);
    }));
  $$("#admin-content [data-forge-tier-max]").forEach((b) =>
    b.addEventListener("click", () => {
      const inst = typeof findItemInstance === "function" ? findItemInstance(p, b.dataset.forgeTierMax) : null;
      const maxTier = inst && typeof forgeMaxTierForSlug === "function" ? forgeMaxTierForSlug(inst.slug) : 0;
      const r = adminSetForgeItemTier(p, b.dataset.forgeTierMax, maxTier);
      adminAplicar(r.msg);
    }));
  if ($("#adm-forge-all-apply")) $("#adm-forge-all-apply").addEventListener("click", () => {
    const tier = adminClampInt($("#adm-forge-all-tier").value, 0, 10);
    let n = 0;
    for (const e of items) { adminSetForgeItemTier(p, e.id, tier); n++; }
    adminAplicar(`${n} item(ns) da lista ajustados para até T${tier}`);
  });
  if ($("#adm-forge-all-zero")) $("#adm-forge-all-zero").addEventListener("click", () => {
    let n = 0;
    for (const e of items) { adminSetForgeItemTier(p, e.id, 0); n++; }
    adminAplicar(`${n} item(ns) da lista ficaram sem tier`);
  });

  const mobInp = $("#adm-forge-mob-busca");
  if (mobInp) mobInp.addEventListener("input", () => {
    ADMIN.forgeMobBusca = mobInp.value;
    renderAdminForge(p, el);
    const n = $("#adm-forge-mob-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  const stackInp = $("#adm-forge-stacks");
  if (stackInp) stackInp.addEventListener("change", () => {
    ADMIN.forgeStacks = adminClampInt(stackInp.value, 1, 5);
    renderAdminForge(p, el);
  });
  if ($("#adm-forge-clear-special")) $("#adm-forge-clear-special").addEventListener("click", () => {
    if (!G.combat) return;
    const before = G.combat.mobs.length;
    G.combat.mobs = G.combat.mobs.filter((m) => !(m && (m.influenced || m.fiendish)));
    if (typeof resolveSQMOccupancy === "function") resolveSQMOccupancy(G.combat);
    adminAplicar(`${before - G.combat.mobs.length} monstro(s) especiais removidos`);
  });
  $$("#admin-content [data-forge-summon]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.forgeSummon;
      const variant = b.dataset.variant;
      const stackValue = adminClampInt(ADMIN.forgeStacks || 5, 1, 5);
      if (!adminSummon(G.combat, slug, false, 1, variant, stackValue)) {
        toast("Falha ao invocar.", "bad");
        return;
      }
      const nome = GAMEDATA.monsters[slug].name;
      adminAplicar(`${variant === "fiendish" ? "Fiendish" : "Influenced"} ${nome} invocado (${G.combat.mobs.length} na arena)`);
    }));
}

/* ----------------------------------------------------- aba: imbuements */

function adminImbMaterials() {
  if (typeof IMBDATA === "undefined" || !IMBDATA.mats) return [];
  const used = {};
  for (const key in IMBDATA.imbs) {
    const g = IMBDATA.imbs[key];
    for (const tier in g.tiers) {
      for (const pair of (g.tiers[tier].items || [])) {
        const id = pair[0], cnt = pair[1];
        if (!used[id]) used[id] = { id: id, name: IMBDATA.mats[id] || ("item " + id), max: 0, imbs: [] };
        used[id].max = Math.max(used[id].max, cnt || 1);
        if (used[id].imbs.indexOf(g.name) === -1) used[id].imbs.push(g.name);
      }
    }
  }
  return Object.keys(used).map((id) => used[id]).sort((a, b) => a.name.localeCompare(b.name));
}

function renderAdminImbuements(p, el) {
  const busca = (ADMIN.busca || "").trim().toLowerCase();
  let mats = adminImbMaterials();
  if (busca) mats = mats.filter((m) => m.name.toLowerCase().indexOf(busca) !== -1 || String(m.id).indexOf(busca) !== -1);
  const mostra = mats.slice(0, 220);
  const totalHave = adminImbMaterials().reduce((n, m) => n + ((p.lootPouch || {})["mat-" + m.id] || 0), 0);

  el.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-t">Materiais de imbuement</div>
      <div class="row mb8" style="gap:6px;align-items:center">
        <input id="adm-imb-busca" placeholder="Buscar material ou id…" value="${ADMIN.busca || ""}"
               class="admin-in" style="flex:1">
        <span class="tiny dim">${mats.length} materiais · ${fmtFull(totalHave)} no pouch</span>
      </div>
      <div class="admin-quick mb8">
        <button class="sm primary" id="adm-imb-basic">Kit Basic (+25 cada)</button>
        <button class="sm" id="adm-imb-powerful">Kit Powerful (+100 cada)</button>
        <button class="sm" id="adm-imb-clear">Remover materiais</button>
      </div>
      <div class="tiny dim mb8">Os materiais entram direto na <b>Loot Pouch</b>, onde a janela de Imbuement procura por eles.</div>
      <div class="admin-itens">
        ${mostra.map((m) => {
          const slug = "mat-" + m.id;
          const have = (p.lootPouch || {})[slug] || 0;
          return `<div class="admin-item">
            <img src="assets/item/${slug}.png" style="max-width:28px;max-height:28px;width:auto;height:auto;image-rendering:pixelated" alt="">
            <div class="admin-item-n">
              <div class="small">${m.name}</div>
              <div class="tiny dim">id ${m.id} · em uso: ${m.imbs.slice(0, 3).join(", ")}${m.imbs.length > 3 ? "…" : ""}</div>
            </div>
            ${have ? `<span class="tiny gold-txt">${have}</span>` : ""}
            <button class="sm" data-imb-give="${m.id}" data-n="${m.max || 25}">+req</button>
            <button class="sm" data-imb-give="${m.id}" data-n="25">+25</button>
            <button class="sm primary" data-imb-give="${m.id}" data-n="100">+100</button>
          </div>`;
        }).join("") || `<div class="dim tiny" style="padding:10px">Nada encontrado.</div>`}
      </div>
    </div>`;

  const inp = $("#adm-imb-busca");
  inp.addEventListener("input", () => {
    ADMIN.busca = inp.value;
    renderAdminImbuements(p, el);
    const n = $("#adm-imb-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  $$("#admin-content [data-imb-give]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.imbGive;
      const n = parseInt(b.dataset.n, 10) || 1;
      addLootPouch(p, "mat-" + id, n);
      adminAplicar(`+${n} ${IMBDATA.mats[id] || ("material " + id)} na Loot Pouch`);
    }));
  $("#adm-imb-basic").addEventListener("click", () => {
    let n = 0;
    for (const m of adminImbMaterials()) { addLootPouch(p, "mat-" + m.id, 25); n++; }
    adminAplicar(`kit Basic: +25 em ${n} materiais`);
  });
  $("#adm-imb-powerful").addEventListener("click", () => {
    let n = 0;
    for (const m of adminImbMaterials()) { addLootPouch(p, "mat-" + m.id, 100); n++; }
    adminAplicar(`kit Powerful: +100 em ${n} materiais`);
  });
  $("#adm-imb-clear").addEventListener("click", () => {
    if (!confirm("Remover todos os materiais de imbuement da Loot Pouch?")) return;
    for (const m of adminImbMaterials()) delete p.lootPouch["mat-" + m.id];
    adminAplicar("materiais de imbuement removidos");
  });
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
      adminSetEquipSlot(p, s, melhor);
      adminAplicar(`${s}: ${GAMEDATA.items[melhor].n}`);
    }));
  $$("#admin-content [data-clear-slot]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.dataset.clearSlot;
      if (p.equip[s] && s !== "ammo"
          && typeof takeEquippedItemInstance === "function"
          && typeof itemUsesInstances === "function"
          && itemUsesInstances(p.equip[s].item)) {
        const old = takeEquippedItemInstance(p, s);
        if (old && typeof putBagItemInstance === "function") putBagItemInstance(p, old);
        else if (old && typeof addItem === "function") addItem(p, old.slug, 1);
      } else if (p.equip[s] && s !== "ammo") {
        addItem(p, p.equip[s].item, 1);
        delete p.equip[s];
      } else {
        delete p.equip[s];
      }
      adminAplicar(`slot ${s} liberado`);
    }));

  const equiparTudo = (respeitarVoc) => {
    let n = 0;
    for (const s of SLOTS) {
      if (s === "ammo" || s === "backpack") continue;
      const melhor = adminMelhorDoSlot(p, s, respeitarVoc);
      if (!melhor) continue;
      adminSetEquipSlot(p, s, melhor);
      n++;
    }
    adminAplicar(`${n} slots preenchidos`);
  };
  $("#adm-best-all").addEventListener("click", () => equiparTudo(true));
  $("#adm-best-any").addEventListener("click", () => equiparTudo(false));
}

/* -------------------------------------------------------- aba: invocar
 *
 * Injeta monstros e bosses direto no combate em andamento, para testar
 * cenas de caça sem precisar viajar para a hunt certa. O monstro entra no
 * mesmo array que o spawnWave usa (c.mobs), com celula propria na grade —
 * assim movimento, loot e bestiario funcionam como num spawn normal.
 *
 * O modo "boss" aplica o multiplicador do applyBossMultiplier (o mesmo das
 * boss fights do jogo) e marca a entrada com boss=true, o que liga o loot
 * de boss e o registro na Bosstiary.
 */

/* Coloca UM monstro dentro do combate ativo. Devolve true se entrou. */
function adminSummon(c, slug, asBoss, mult, variant, stacks) {
  const base = (typeof GAMEDATA !== "undefined") ? GAMEDATA.monsters[slug] : null;
  if (!c || !base) return false;
  const def = Object.assign({}, base);
  if (asBoss) {
    const m = applyBossMultiplier(base, mult || 10);
    def.hp = m.hp; def.exp = m.exp; def.damage = m.damage; def.armor = m.armor;
    def.boss = true;
    def.name = base.name;
  }
  const special = adminApplyForgeMonsterVariant(def, variant, stacks);
  c.mobs.push({
    slug: slug, def: def,
    boss: !!asBoss,
    influenced: special.influenced,
    fiendish: special.fiendish,
    sinisterStacks: special.stacks,
    hp: def.hp, maxHp: def.hp,
    atkCd: 500,
    id: "adm-" + Math.random().toString(36).slice(2, 8),
    x: 0.80 + Math.random() * 0.14,
    y: 0.32 + Math.random() * 0.38,
    dir: "w",
    moving: false,
    attackAnim: 0,
    speed: 0.000045 + Math.random() * 0.000025,
    spawnAt: Date.now(),
  });
  const mob = c.mobs[c.mobs.length - 1];
  // celula real na grade, igual ao spawnWave: sem isso o bicho nasce
  // empilhado em cima dos outros e o movimento em SQM o ignora
  if (typeof placeFree === "function") {
    if (c.player) ensureCell(c.player);
    const occ = buildOccupancy(c, null);
    const cx = Math.floor(GRID_W * 0.72) + Math.floor(Math.random() * 5);
    const cy = 2 + Math.floor(Math.random() * (GRID_H - 4));
    placeFree(mob, occ, Math.min(GRID_W - 1, cx), cy);
    mob.speedPts = typeof monsterSpeedPts === "function" ? monsterSpeedPts(mob) : 100;
  } else {
    resolveSQMOccupancy(c);
  }
  return true;
}

function renderAdminMobs(p, el) {
  const c = G.combat;
  const busca = (ADMIN.mobBusca || "").trim().toLowerCase();

  if (!c) {
    el.innerHTML = `
      <div class="admin-card">
        <div class="admin-card-t">Invocar monstros</div>
        <div class="tiny dim">
          Nenhum combate em andamento. Entre em uma área de caça (ou boss)
          e volte aqui: o monstro invocado nasce dentro da arena atual.
        </div>
      </div>`;
    return;
  }

  let ids = Object.keys(GAMEDATA.monsters);
  if (busca) {
    ids = ids.filter((i) =>
      (GAMEDATA.monsters[i].name || i).toLowerCase().indexOf(busca) !== -1);
  }
  ids.sort((a, b) => (GAMEDATA.monsters[a].hp || 0) - (GAMEDATA.monsters[b].hp || 0));
  const mostra = ids.slice(0, 200);

  el.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-t">Arena atual</div>
      <div class="stat-row"><span class="k">Combate</span>
        <span class="v">${c.boss ? "boss" : (c.hunt ? c.hunt.name : c.huntId)}</span></div>
      <div class="stat-row"><span class="k">Monstros vivos</span>
        <span class="v">${c.mobs.length}</span></div>
      <div class="admin-quick">
        <button class="sm" id="adm-mob-clear">Limpar arena</button>
      </div>
      <div class="tiny dim mt4">
        Limpar remove todos os monstros vivos (o respawn da hunt traz os
        próximos normalmente).
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-t">Invocar monstro</div>
      <div class="row mb8" style="gap:6px;align-items:center">
        <input id="adm-mob-busca" placeholder="Buscar monstro…" value="${ADMIN.mobBusca || ""}"
               class="admin-in" style="flex:1">
        <label class="admin-chk" style="white-space:nowrap">
          <input type="checkbox" id="adm-mob-boss" ${ADMIN.mobBoss ? "checked" : ""}>
          como boss</label>
        <input type="number" id="adm-mob-mult" value="${ADMIN.mobMult || 10}" min="2" max="100"
               class="admin-in" style="width:64px" title="Multiplicador de boss">
      </div>
      <div class="admin-itens">
        ${mostra.map((i) => {
          const m = GAMEDATA.monsters[i];
          const mult = ADMIN.mobBoss ? (ADMIN.mobMult || 10) : 1;
          return `<div class="admin-item">
            ${typeof mobImg === "function" ? mobImg(i, 28) : ""}
            <div class="admin-item-n">
              <div class="small">${m.name}</div>
              <div class="tiny dim">hp ${fmtFull(Math.floor(m.hp * mult))} ·
                exp ${fmtFull(Math.floor((m.exp || 0) * mult))} ·
                dano ${fmtFull(Math.floor((m.damage || 0) * mult))}</div>
            </div>
            <button class="sm primary" data-summon="${i}">invocar</button>
          </div>`;
        }).join("") || `<div class="dim tiny" style="padding:10px">Nada encontrado.</div>`}
      </div>
      ${ids.length > 200 ? `<div class="tiny dim mt4">Mostrando 200 de ${ids.length} — refine a busca.</div>` : ""}
    </div>`;

  $("#adm-mob-clear").addEventListener("click", () => {
    c.mobs = [];
    resolveSQMOccupancy(c);
    adminAplicar("arena limpa");
  });
  const inp = $("#adm-mob-busca");
  inp.addEventListener("input", () => {
    ADMIN.mobBusca = inp.value;
    renderAdminMobs(p, el);
    const n = $("#adm-mob-busca");
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  $("#adm-mob-boss").addEventListener("change", (e) => {
    ADMIN.mobBoss = e.target.checked;
    renderAdminMobs(p, el);
  });
  $("#adm-mob-mult").addEventListener("change", (e) => {
    ADMIN.mobMult = Math.max(2, Math.min(100, parseInt(e.target.value, 10) || 10));
    renderAdminMobs(p, el);
  });
  $$("#admin-content [data-summon]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.summon;
      if (!adminSummon(c, slug, ADMIN.mobBoss, ADMIN.mobMult)) {
        toast("Falha ao invocar.", "bad");
        return;
      }
      const nome = GAMEDATA.monsters[slug].name;
      adminAplicar(`${ADMIN.mobBoss ? "boss " : ""}${nome} invocado ` +
        `(${c.mobs.length} na arena)`);
    }));
}

