/*
 * city-ui.js — janelas de dialogo dos NPCs da cidade
 */
"use strict";

let shopFilter = "";
let shopSlot = "all";

function openNpc(id) {
  const npc = NPCS[id];
  if (!npc) return;
  G.activeNpc = id;
  const p = G.p;
  let body = "";

  switch (npc.type) {
    case "shop":   body = npcShop(p); break;
    case "supply": body = npcSupply(p); break;
    case "sell":   body = npcSell(p); break;
    case "upgrade": body = npcUpgrade(p); break;
    case "bank":   body = npcBank(p); break;
    case "temple": body = npcTemple(p); break;
    case "promotion": body = npcPromotion(p); break;
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
  G.activeNpc = null;
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
    case "upgrade": body = npcUpgrade(p); break;
    case "bank":   body = npcBank(p); break;
    case "temple": body = npcTemple(p); break;
    case "promotion": body = npcPromotion(p); break;
    case "train":  body = npcTrain(p); break;
    case "inn":    body = npcInn(p); break;
    case "travel": body = npcTravel(p); break;
  }
  $("#npc-content").innerHTML = body;
  bindNpc(id, npc.type);
  renderTopbar(p);
}

function openAcademyConjureModal(showList) {
  const p = G.p;
  G.activeNpc = "academy-conjure";
  const recipes = academyConjuresFor(p);
  const rows = recipes.map((r) => {
    const check = academyConjureCheck(p, r);
    const sprite = r.kind === "ammo" ? r.slug :
      r.kind === "supply" && SUPPLIES[r.slug] ? SUPPLIES[r.slug].sprite : "spellbook";
    return `<div class="shop-row" style="opacity:${check.ok ? 1 : .45}">
      ${r.kind === "support" ? `<span style="width:28px;text-align:center">✨</span>` : `<img src="assets/item/${sprite}.png">`}
      <div style="flex:1;min-width:0">
        <div class="small">${r.name}</div>
        <div class="tiny dim"><b>${r.words}</b> · ${academyConjureProduct(r)} · nv ${r.level} · ML ${r.ml} · ${fmtFull(r.mana)} mana</div>
        <div class="tiny dim">${check.ok ? r.desc : `<span style="color:#ff9a6a">${check.msg}</span>`}</div>
      </div>
      <div class="row" style="gap:3px;flex:none">
        <button class="sm ${check.ok ? "primary" : ""}" data-academy-conjure="${r.id}" ${check.ok ? "" : "disabled"}>
          Conjurar</button>
        <button class="sm ${p.config.autoConjure === r.id ? "primary" : ""}"
          data-academy-loop="${r.id}" title="Conjurar em loop enquanto houver mana">
          ${p.config.autoConjure === r.id ? "LOOP ON" : "Loop"}</button>
      </div>
    </div>`;
  }).join("");

  $("#modal-body").innerHTML = `
    <div class="panel-title">
      Academia — Conjure
      <span style="flex:1"></span>
      <button class="sm" id="academy-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="small dim">Textbox</label>
      <input id="academy-conjure-text" value="conjure:" autocomplete="off"
        style="width:100%;padding:6px;background:#14120e;color:#ffe680;border:2px solid;border-color:#16140f #5a5348 #5a5348 #16140f;margin:4px 0 8px">
      <div class="row mb8" style="justify-content:space-between">
        <span class="small dim">${vocationName(p)} · Mana ${Math.floor(p.mp)} / ${maxStats(p).mp}</span>
        <button class="sm primary" id="academy-toggle-list">${showList === false ? "Abrir lista" : "Atualizar lista"}</button>
      </div>
      <div id="academy-conjure-list" class="list" style="max-height:360px;${showList === false ? "display:none" : ""}">
        ${rows || `<div class="dim small center" style="padding:14px">Nenhum conjurável para esta vocação.</div>`}
      </div>
      ${p.config.autoConjure && ACADEMY_CONJURES[p.config.autoConjure] ? `
        <div class="tiny mt8" style="color:#9ce84a">
          Loop ativo: <b>${ACADEMY_CONJURES[p.config.autoConjure].name}</b> —
          conjura sozinho sempre que a mana permitir, enquanto estiver na academia.
        </div>` : `<div class="tiny dim mt8">Use <b>Loop</b> para conjurar automaticamente enquanto houver mana.</div>`}
      <div class="row mt8" style="gap:4px">
        <button class="full" id="academy-back-city">Voltar para cidade</button>
      </div>
    </div>`;
  $("#modal").classList.add("show");
  const conjureInput = $("#academy-conjure-text");
  conjureInput.focus();
  conjureInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = conjureInput.value.toLowerCase().replace(/^conjure:\s*/, "").trim();
    const found = academyConjuresFor(p).find((r) =>
      r.words.toLowerCase() === q || r.name.toLowerCase() === q ||
      r.name.toLowerCase().indexOf(q) !== -1);
    if (!found) { toast("Conjure não encontrado para sua vocação."); return; }
    const cast = castAcademyConjure(p, found.id);
    toast(cast.msg, cast.ok ? "level" : "");
    if (cast.ok) addLog("skill", cast.msg + (cast.mlUp ? ` Magic Level +${cast.mlUp}!` : ""));
    openAcademyConjureModal(true);
  });
  $("#academy-close").addEventListener("click", () => {
    G.activeNpc = null;
    $("#modal").classList.remove("show");
    renderAll();
  });
  $("#academy-toggle-list").addEventListener("click", () => openAcademyConjureModal(true));
  $("#academy-back-city").addEventListener("click", () => {
    $("#modal").classList.remove("show");
    stopAcademy();
  });
  $$("#academy-conjure-list [data-academy-loop]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.academyLoop;
      if (p.config.autoConjure === id) {
        p.config.autoConjure = null;
        toast("Auto-conjure desligado.");
      } else {
        const chk = academyConjureCheck(p, ACADEMY_CONJURES[id]);
        // mana baixa nao impede ligar o loop: ele espera encher
        if (!chk.ok && p.mp >= ACADEMY_CONJURES[id].mana) { toast(chk.msg); return; }
        p.config.autoConjure = id;
        toast(`Auto-conjure ligado: <b>${ACADEMY_CONJURES[id].name}</b>`);
        if (!G.training) toast("Entre na academia para o loop rodar.");
      }
      openAcademyConjureModal(true);
    }));
  $$("#academy-conjure-list [data-academy-conjure]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = castAcademyConjure(p, b.dataset.academyConjure);
      toast(r.msg, r.ok ? "level" : "");
      if (r.ok) {
        addLog("skill", r.msg + (r.mlUp ? ` Magic Level +${r.mlUp}!` : ""));
        renderAll();
      }
      openAcademyConjureModal(true);
    }));
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
                 "boots", "ring", "amulet", "quiver"];
  const names = { all: "Tudo", weapon: "Armas", shield: "Escudos",
    armor: "Armaduras", helmet: "Elmos", legs: "Pernas", boots: "Botas",
    ring: "Anéis", amulet: "Colares", quiver: "Quivers" };

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
        <div class="tiny dim">${eff} · cargas ${have} · ${fmtFull(price)} gp/carga${locked ? ` · <span style="color:#ff9a6a">nv ${s.lvl}</span>` : ""}</div>
      </div>
      <div class="row" style="gap:2px">
        ${[10, 50, 200].map((n) => `<button class="sm" data-buy-sup="${slug}"
          data-n="${n}" ${locked || p.gold < price * n ? "disabled" : ""}>
          +${n}c</button>`).join("")}
      </div>
    </div>`;
  }).join("");
  return goldLine(p) + `<div class="list" style="max-height:340px">${rows}</div>
    <div class="tiny dim mt4">Supplies usam cargas. Se uma carga selecionada chegar a 0, a próxima é comprada automaticamente no uso.</div>`;
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
      <span class="tiny dim">${fmtFull(val)} gp</span>
    </div>`;
  }).join("");

  if (!entries.length)
    return goldLine(p) +
      `<div class="dim small center" style="padding:20px">Sua mochila está vazia.</div>`;

  return goldLine(p) + `
    <div class="list mb8" style="max-height:320px">${rows}</div>
    <div class="tiny dim center">
      Clique em um item para abrir as opções e vender.<br>
      Para vender o loot de uma vez, use <b>Sell all</b> na Loot Pouch.
    </div>`;
}

/* ---------------------------------------------------------- ferreiro */
function npcUpgrade(p) {
  const dust = (p.lootPouch && p.lootPouch[UPGRADE_MATERIAL]) || 0;
  const list = [];
  for (const slot of UPGRADE_SLOTS) {
    const e = p.equip[slot];
    if (e && GAMEDATA.items[e.item])
      list.push({ source: "equip", slot: slot, slug: e.item });
  }
  for (const slug in p.bag) {
    const it = GAMEDATA.items[slug];
    if (it && it.s && UPGRADE_SLOTS.indexOf(it.s) !== -1)
      list.push({ source: "bag", slot: it.s, slug: slug });
  }

  const rows = list.map((entry) => {
    const key = upgradeKey(entry.source, entry.slot, entry.slug);
    const it = GAMEDATA.items[entry.slug];
    const tier = itemUpgradeTier(p, key);
    const check = canUpgrade(p, key, entry.slug);
    const cost = check.cost || upgradeCost(p, entry.slug, tier);
    const maxed = tier >= UPGRADE_MAX_TIER;
    const stats = upgradedStats(p, key, entry.slug);
    const bits = [];
    if (stats.atk) bits.push(`atk ${stats.atk}`);
    if (stats.def) bits.push(`def ${stats.def}`);
    if (stats.arm) bits.push(`arm ${stats.arm}`);
    return `<div class="shop-row" data-tip="${entry.slug}" style="opacity:${check.ok || maxed ? 1 : .5}">
      <img src="assets/item/${entry.slug}.png">
      <div style="flex:1;min-width:0">
        <div class="small">${it.n}${tier ? ` <b style="color:#d4af37">+${tier}</b>` : ""}
          <span class="tiny dim">· ${entry.source === "equip" ? "equipado" : "mochila"}</span></div>
        <div class="tiny dim">${bits.join(" · ") || "sem atributos"}</div>
        <div class="tiny dim">${maxed ? `<span style="color:#9ce84a">nível máximo</span>`
          : `${fmtFull(cost.gold)} gp · ${cost.dust}x poeira · ${cost.chance}% sucesso`}</div>
      </div>
      <button class="sm ${check.ok ? "primary" : ""}" data-upgrade="${key}|${entry.slug}"
        ${check.ok ? "" : "disabled"}>${maxed ? "MAX" : `+${tier + 1}`}</button>
    </div>`;
  }).join("");

  return goldLine(p) + `
    <div class="row mb8" style="justify-content:space-between">
      <span class="small dim">Poeira mística</span>
      <b style="color:#b060ff">${fmtFull(dust)}</b>
    </div>
    <div class="list mb8" style="max-height:330px">
      ${rows || `<div class="dim small center" style="padding:18px">Nenhum equipamento para melhorar.</div>`}
    </div>
    <div class="tiny dim">
      Cada upgrade soma <b>+6%</b> nos atributos do item. Até <b>+3</b> o sucesso é garantido;
      a partir do <b>+4</b> a forja pode falhar e consumir o material — o item nunca é destruído.
      A poeira mística vem de monstros influenciados.
    </div>`;
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

/* ---------------------------------------------------------- promoção */
const PROMOTION_PRICE = 20000;
const PROMOTION_LEVEL = 20;

function promotionEligibility(p) {
  if (p.promoted) return { ok: false, msg: "Já promovido" };
  if (p.level < PROMOTION_LEVEL) return { ok: false, msg: `Requer nível ${PROMOTION_LEVEL}` };
  if ((p.gold || 0) < PROMOTION_PRICE) return { ok: false, msg: `Requer ${fmtFull(PROMOTION_PRICE)} gp` };
  return { ok: true, msg: "Pronto" };
}

function promoteCharacterById(id) {
  const currentId = G.p ? characterId(G.p) : null;
  let target = null;
  if (id === currentId) target = G.p;
  else target = getCharacters().find((p) => p.id === id);
  if (!target) return { ok: false, msg: "Personagem não encontrado." };
  const check = promotionEligibility(target);
  if (!check.ok) return check;
  if (!spendGold(target, PROMOTION_PRICE)) return { ok: false, msg: "Ouro insuficiente." };
  target.promoted = true;
  target.promotedAt = Date.now();
  saveCharacterToRoster(target);
  if (id === currentId) G.p = target;
  return { ok: true, msg: `${target.name} agora é ${vocationName(target)}!` };
}

function npcPromotion() {
  const chars = getCharacters();
  return `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Preço</span><span class="v gold-txt">${fmtFull(PROMOTION_PRICE)} gp</span></div>
      <div class="stat-row"><span class="k">Nível mínimo</span><span class="v">${PROMOTION_LEVEL}</span></div>
    </div>
    <div class="small dim mb4">Escolha o personagem para promover</div>
    <div class="list" style="max-height:330px">
      ${chars.map((ch) => {
        const e = promotionEligibility(ch);
        return `<div class="shop-row">
          <div style="flex:1;min-width:0">
            <div class="small" style="color:${ch.promoted ? "#9ce84a" : "#c8c0a8"}">${ch.name}</div>
            <div class="tiny dim">${vocationName(ch)} · nível ${ch.level} · ${fmtFull(ch.gold || 0)} gp</div>
          </div>
          <div class="tiny ${e.ok ? "" : "dim"}" style="color:${e.ok ? "#9ce84a" : "#ff9a6a"}">${e.msg}</div>
          <button class="sm primary" data-promote-char="${ch.id}" ${e.ok ? "" : "disabled"}>Promover</button>
        </div>`;
      }).join("") || `<div class="dim small center" style="padding:14px">Nenhum personagem salvo.</div>`}
    </div>
    <div class="tiny dim mt8">Promoções: Elite Knight, Royal Paladin, Elder Druid e Master Sorcerer.</div>`;
}

/* ---------------------------------------------------------- academia */
function npcTrain(p) {
  const st = academyStatus(p);
  const skillTxt = st.skill === "magic" ? "Magic Level (65 mana por hit)" :
    st.skill ? SKILL_NAMES[st.skill] : "aguardando equipamento";
  const weapon = p.equip.weapon ? itemName(p.equip.weapon.item) : "nenhuma";
  const ammo = p.equip.ammo ? `${itemName(p.equip.ammo.item)} (${ammoCount(p, p.equip.ammo.item)})` : "nenhuma";

  const dummyId = (p.config && p.config.dummy) || "exercise";
  const dummy = EXERCISE_DUMMIES[dummyId] || EXERCISE_DUMMIES.exercise;
  const rate = dummy.rate / 100;
  const isMagic = st.skill === "magic";
  const porGolpe = isMagic
    ? `${Math.floor(EXERCISE_MANA * rate)} mana spent`
    : `${(EXERCISE_TRIES * rate).toFixed(1)} tries`;
  const intervalo = (exerciseInterval(p) / 1000).toFixed(1);

  return goldLine(p) + `
    <div class="panel-inset mb8" style="padding:8px">
      <div class="stat-row"><span class="k">Sala</span><span class="v">Safezone</span></div>
      <div class="stat-row"><span class="k">Dummy</span><span class="v">${dummy.name}</span></div>
      <div class="stat-row"><span class="k">Vocação</span><span class="v">${vocationName(p)}</span></div>
      <div class="stat-row"><span class="k">Skill treinada</span><span class="v">${skillTxt}</span></div>
      <div class="stat-row"><span class="k">Por golpe</span><span class="v" style="color:#9ce84a">${porGolpe}</span></div>
      <div class="stat-row"><span class="k">Intervalo</span><span class="v">${intervalo}s</span></div>
      <div class="stat-row"><span class="k">Taxa do dummy</span><span class="v">${dummy.rate}%</span></div>
      <div class="stat-row"><span class="k">Shielding</span><span class="v">Todos os hits</span></div>
      <div class="stat-row"><span class="k">Weapon</span><span class="v">${weapon}</span></div>
    </div>
    <div class="small dim mb4">Exercise dummy</div>
    <div class="row wrap mb8" style="gap:4px">
      ${Object.keys(EXERCISE_DUMMIES).map((id) => {
        const d = EXERCISE_DUMMIES[id];
        const dono = id === "exercise" || (p.dummies && p.dummies[id]);
        const sel = id === dummyId;
        return `<button class="sm ${sel ? "primary" : ""}" data-dummy="${id}"
          title="${dono ? `taxa ${d.rate}%` : `comprar por ${fmtFull(d.price)} gp`}">
          ${d.name.replace(" Exercise Dummy", "").replace("Exercise Dummy", "Básico")}
          ${dono ? "" : `· ${fmtFull(d.price)}`}</button>`;
      }).join("")}
    </div>
    <div class="tiny dim mb8">
      Fórmula do Canary: <b>${isMagic ? "600" : "7"} × taxa</b> por golpe, a cada
      <b>baseAttackSpeed / rateExerciseTrainingSpeed</b>. Não é preciso ter a
      exercise weapon — treina com o equipamento atual.
    </div>
    ${st.ok ? "" : `<div class="small mb8" style="color:#ffb060">${st.msg}</div>`}
    <button class="primary full mb8" id="academy-enter">Teleportar para Academia</button>
    <button class="full" id="academy-conjure-list">Abrir conjure</button>
    <div class="tiny dim mt8">
      Dentro da academia você bate no exercise dummy em safezone. A skill treinada
      segue a arma equipada — sem arma, treina punho. Mages acumulam mana spent
      sem gastar mana, distance não consome munição, e todos ganham shielding.
    </div>`;
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
      hideTip();
      refreshNpc(id);
    }));

  // supplies
  $$("#npc-content [data-buy-sup]").forEach((b) =>
    b.addEventListener("click", () => {
      const slug = b.dataset.buySup, n = parseInt(b.dataset.n, 10);
      const s = SUPPLIES[slug];
      const cost = supplyPrice(s, p.level) * n;
      if (!spendGold(p, cost)) { toast("Ouro insuficiente"); return; }
      p.supplies[slug] = (p.supplies[slug] || 0) + n;
      addLog("sell", `Comprou ${n} carga(s) de ${s.name} por ${fmtFull(cost)} gp`);
      refreshNpc(id);
    }));

  // ferreiro: aplicar upgrade
  $$("#npc-content [data-upgrade]").forEach((b) =>
    b.addEventListener("click", () => {
      const [key, slug] = b.dataset.upgrade.split("|");
      const r = applyUpgrade(p, key, slug);
      if (!r.ok) { toast(r.msg); return; }
      toast(r.msg, r.success ? "level" : "death");
      addLog(r.success ? "skill" : "death", r.msg);
      hideTip();
      refreshNpc(id);
      renderAll();
    }));

  // vender: clicar no item abre o menu de opções (nunca vende direto)
  if (type === "sell") {
    $$("#npc-content .shop-row[data-tip]").forEach((row) => {
      const slug = row.dataset.tip;
      if (!p.bag[slug]) return;
      row.classList.add("clickable");
      const openMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTip();
        openBagItemMenu(p, slug, e.clientX, e.clientY, () => refreshNpc(id));
      };
      row.addEventListener("click", openMenu);
      row.addEventListener("contextmenu", openMenu);
    });
  }

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

  // promoção King Tibianus
  $$("#npc-content [data-promote-char]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = promoteCharacterById(b.dataset.promoteChar);
      toast(r.msg, r.ok ? "level" : "");
      if (r.ok) addLog("level", r.msg);
      refreshNpc(id);
      renderAll();
    }));

  // academia
  const academyEnter = $("#academy-enter");
  if (academyEnter) academyEnter.addEventListener("click", () => {
    $("#modal").classList.remove("show");
    startAcademy();
  });
  // escolher / comprar exercise dummy
  $$("#npc-content [data-dummy]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.dummy;
      const d = EXERCISE_DUMMIES[id];
      if (!d) return;
      p.dummies = p.dummies || {};
      const dono = id === "exercise" || p.dummies[id];
      if (!dono) {
        if (p.gold < d.price) { toast(`Faltam ${fmtFull(d.price - p.gold)} gp.`); return; }
        p.gold -= d.price;
        p.dummies[id] = 1;
        addLog("sell", `Comprou <b>${d.name}</b> por <span class="gold-txt">${fmtFull(d.price)} gp</span>`);
      }
      p.config.dummy = id;
      toast(`Treinando no <b>${d.name}</b> (${d.rate}%)`);
      refreshNpc(G.activeNpc || "trainer");
      renderAll();
    }));

  const academyConjure = $("#academy-conjure-list");
  if (academyConjure) academyConjure.addEventListener("click", () => {
    openAcademyConjureModal(true);
  });

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
