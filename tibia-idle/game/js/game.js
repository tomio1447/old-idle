/*
 * game.js — loop principal, save/load, ganhos offline e bootstrap
 */
"use strict";

const SAVE_KEY = "tibia-idle-save-v1";

const G = {
  p: null,
  combat: null,
  training: null,
  renderer: null,
  last: 0,
  autoScroll: true,
  paused: false,
  sellTimer: 0,
  saveTimer: 0,
  tickAcc: 0,
  cityRegenHp: 0,
  cityRegenMp: 0,
  manaTrainAcc: 0,
};

/* ------------------------------------------------------------ save */
function save() {
  G.p.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, p: G.p,
      session: G.combat ? { hunt: G.combat.huntId, stats: G.combat.stats } : null,
    }));
    return true;
  } catch (e) {
    console.warn("falha ao salvar", e);
    return false;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.p ? normalizePlayer(d.p) : null;
  } catch (e) { return null; }
}

function normalizePlayer(p) {
  p.config = Object.assign({
    healAt: 60,
    useRunes: true,
    autoRestock: false,
    manaTrain: null,
    autoSell: true,
    autoEquip: true,
    spellAttack: true,
    autoRetreat: true,
    lootFilter: "all",
  }, p.config || {});
  p.config.autoRestock = false;
  p.supplies = p.supplies || {};
  p.bag = p.bag || {};
  p.equip = p.equip || {};
  p.bank = p.bank || 0;
  return p;
}

function wipeSave() {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

/* ------------------------------------------------------------ offline */
/* Simula o tempo que o jogador ficou fora, de forma resumida e conservadora */
function computeOffline(p) {
  const now = Date.now();
  const elapsed = Math.max(0, now - (p.lastSeen || now));
  const MAX_OFFLINE = 12 * 3600 * 1000;         // teto de 12h
  const eff = Math.min(elapsed, MAX_OFFLINE);
  if (!p.hunt || eff < 60000) return null;      // menos de 1 min: ignora

  const hunt = GAMEDATA.hunts[p.hunt];
  if (!hunt) return null;

  const est = huntEstimate(p, hunt);
  const risk = huntRisk(p, hunt);
  // eficiencia offline: 60% do rendimento online, pior se a hunt for perigosa
  let effRate = 0.6;
  if (risk.cls === "mid") effRate = 0.45;
  if (risk.cls === "high") effRate = 0.25;

  // stamina limita o tempo de caca
  const staminaSec = Math.min(eff / 1000, p.stamina);
  const hours = staminaSec / 3600;
  if (hours <= 0) return null;

  const kills = Math.floor(est.kills * hours * effRate);
  let exp = Math.floor(est.exp * hours * effRate);
  let gold = Math.floor(est.gold * hours * effRate);

  // supplies/ammo offline usam o mesmo modelo de cargas do combate online:
  // cargas existentes são consumidas; se uma carga selecionada está 0, compra
  // a próxima diretamente do gold balance.
  let supplyCost = 0;
  const usedSupplies = {};

  // loot em itens
  const loot = {};
  const mobs = hunt.monsters;
  for (let i = 0; i < kills; i++) {
    const m = GAMEDATA.monsters[mobs[i % mobs.length]];
    if (!m) continue;
    for (const l of m.loot) {
      if (Math.random() * 100 > l.chance) continue;
      if (l.item === "gold-coin") continue;   // ja contabilizado
      const cnt = l.max > 1 ? 1 + Math.floor(Math.random() * l.max) : 1;
      loot[l.item] = (loot[l.item] || 0) + cnt;
    }
    if (i > 4000) break;   // limite de simulacao
  }

  // aplica
  const beforeLevel = p.level;
  addExp(p, exp);
  p.gold += gold;
  p.stamina = Math.max(0, p.stamina - staminaSec);
  p.totalKills += kills;
  p.playtime += staminaSec * 1000;

  const offlineStats = { supplyUsed: usedSupplies, supplyCost: 0, supplyBought: {} };
  const offlineCombat = { stats: offlineStats, events: [] };
  let runeUse = Math.min(4000, Math.floor(kills * 0.35));
  const supplySlugs = Object.keys(p.supplies || {}).filter((slug) => {
    const s = SUPPLIES[slug];
    return s && (s.type === "heal" || s.type === "attack" || s.type === "mana");
  });
  for (let i = 0; i < runeUse && supplySlugs.length; i++) {
    const slug = supplySlugs[i % supplySlugs.length];
    if (!consumeSupplyCharge(offlineCombat, p, slug)) break;
  }

  // skills: ganha tries proporcional aos golpes
  const swings = Math.floor(kills * Math.max(1, est.ttk / 2));
  const sk = weaponSkill(p);
  if (sk === "dist") {
    const ammoUse = Math.min(4000, Math.floor(swings * 0.6));
    for (let i = 0; i < ammoUse; i++) {
      if (!consumeAmmoCharge(offlineCombat, p)) break;
    }
  }
  if (sk !== "magic") addSkillTries(p, sk, Math.floor(swings * 0.6));
  addSkillTries(p, "shield", Math.floor(swings * 0.5));
  if (VOCATIONS[p.voc].weapon === "magic")
    addManaSpent(p, Math.floor(kills * 40));

  // loot vai pra bag
  for (const slug in loot) addItem(p, slug, loot[slug]);
  supplyCost = offlineStats.supplyCost;

  return {
    time: staminaSec * 1000, kills: kills, exp: exp, gold: gold,
    levels: p.level - beforeLevel, loot: loot, supplies: usedSupplies,
    supplyCost: supplyCost, hunt: hunt.name, rate: effRate,
    capped: elapsed > MAX_OFFLINE,
  };
}

function showOfflineModal(r) {
  const lootRows = Object.keys(r.loot)
    .sort((a, b) => (GAMEDATA.items[b] ? GAMEDATA.items[b].sell || 0 : 0) -
                    (GAMEDATA.items[a] ? GAMEDATA.items[a].sell || 0 : 0))
    .slice(0, 24)
    .map((s) => `<div class="inv-item" title="${itemName(s)}">
        ${itemImg(s)}<span class="cnt">${r.loot[s]}</span></div>`).join("");
  const supRows = Object.keys(r.supplies).map((s) =>
    `<div class="stat-row"><span class="k">${SUPPLIES[s] ? SUPPLIES[s].name : itemName(s)}</span>
     <span class="v">-${r.supplies[s]}</span></div>`).join("");

  $("#modal-body").innerHTML = `
    <div class="panel-title">Bem-vindo de volta!</div>
    <div class="panel-body">
      <p class="small mb8">Você caçou em <b style="color:#d4af37">${r.hunt}</b>
      por <b>${fmtTime(r.time / 1000)}</b>${r.capped ? ' <span class="dim">(limite de 12h)</span>' : ""}.</p>
      <div class="panel-inset" style="padding:8px" class="mb8">
        <div class="stat-row"><span class="k">Monstros mortos</span><span class="v">${fmtFull(r.kills)}</span></div>
        <div class="stat-row"><span class="k">Experiência</span><span class="v" style="color:#9ce84a">+${fmtFull(r.exp)}</span></div>
        ${r.levels > 0 ? `<div class="stat-row"><span class="k">Níveis ganhos</span><span class="v" style="color:#ffe680">+${r.levels}</span></div>` : ""}
        <div class="stat-row"><span class="k">Ouro coletado</span><span class="v gold-txt">+${fmtFull(r.gold)}</span></div>
        ${r.supplyCost ? `<div class="stat-row"><span class="k">Gasto em supplies</span><span class="v" style="color:#e08080">-${fmtFull(r.supplyCost)}</span></div>` : ""}
        <div class="stat-row"><span class="k">Rendimento offline</span><span class="v">${Math.round(r.rate * 100)}%</span></div>
      </div>
      ${supRows ? `<div class="small dim mt8 mb4">Supplies consumidos</div>${supRows}` : ""}
      ${lootRows ? `<div class="small dim mt8 mb4">Loot recolhido</div>
        <div class="inv-grid">${lootRows}</div>` : ""}
      <button class="primary full mt12" id="modal-ok">Continuar caçando</button>
    </div>`;
  $("#modal").classList.add("show");
  $("#modal-ok").addEventListener("click", () => {
    $("#modal").classList.remove("show");
  });
}

/* ------------------------------------------------------------ hunt */
function startHunt(id) {
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  if (G.training) stopAcademy(false);
  G.inCity = false;
  G.p.hunt = id;
  G.combat = newCombat(G.p, id);
  spawnWave(G.combat, G.p);
  addLog("info", `Viajando para <b style="color:#d4af37">${hu.name}</b>`);
  toast(`Caçando em <b>${hu.name}</b>`);
  renderAll();
}

function stopHunt() {
  G.p.hunt = null;
  G.combat = null;
  G.inCity = true;
  addLog("info", "Voltou para a <b style='color:#ffe680'>Cidade de Thais</b>.");
  // ao chegar na cidade o char descansa: cura completa
  const m = maxStats(G.p);
  G.p.hp = m.hp; G.p.mp = m.mp;
  renderAll();
}

/* Alterna entre cidade, caçada e academia */
function goToCity() {
  if (G.training) stopAcademy();
  else if (G.p.hunt) stopHunt();
  else { G.inCity = true; renderAll(); }
}

function startAcademy() {
  if (!G.p) return;
  if (G.combat) stopHunt();
  G.training = newAcademyTraining(G.p);
  G.inCity = false;
  G.p.hunt = null;
  G.combat = null;
  addLog("info", "Teleportado para a <b style='color:#9ce84a'>Academia Safezone</b>.");
  toast("Academia Safezone: Treiner ativo", "level");
  renderAll();
  openAcademyConjureModal(false);
}

function stopAcademy(log) {
  if (!G.training) return;
  G.training = null;
  G.inCity = true;
  G.combat = null;
  G.p.hunt = null;
  const m = maxStats(G.p);
  G.p.hp = m.hp;
  if (log !== false) {
    addLog("info", "Saiu da academia e voltou para a <b style='color:#ffe680'>Cidade de Thais</b>.");
    toast("Voltou para a cidade");
  }
  G.activeNpc = null;
  renderAll();
}

/* ------------------------------------------------------------ eventos */
function drainEvents() {
  const c = G.combat;
  if (!c) return;
  const r = G.renderer;
  for (const e of c.events) {
    switch (e.t) {
      case "hit": {
        const col = (ELEMENTS[e.el] || ELEMENTS.physical).color;
        const x = 0.42 + (e.x || 0.5) * 0.5;
        r.addFloater(x, e.y || 0.5, "-" + fmt(e.dmg), col, e.dmg > 200);
        r.addEffect(x, e.y || 0.5, (ELEMENTS[e.el] || ELEMENTS.physical).fx);
        break;
      }
      case "miss":
        r.addFloater(0.42 + (e.x || 0.5) * 0.5, e.y || 0.5, "errou", "#a0a0a0");
        break;
      case "taken":
        r.addFloater(0.13, 0.55, "-" + fmt(e.dmg),
                     (ELEMENTS[e.el] || ELEMENTS.physical).color);
        r.addEffect(0.13, 0.6, (ELEMENTS[e.el] || ELEMENTS.physical).fx);
        r.shake = Math.min(9, 2 + e.dmg / 30);
        r.playerFlash = 90;
        break;
      case "block":
        r.addFloater(0.13, 0.55, "bloqueou", "#9ac0e8");
        break;
      case "heal":
        r.addFloater(0.13, 0.5, "+" + fmt(e.amount), "#7ae87a");
        r.addEffect(0.13, 0.6, "green-rings");
        break;
      case "mana":
        r.addFloater(0.13, 0.5, "+" + fmt(e.amount) + " mana", "#6a8aff");
        break;
      case "supply-buy":
        addLog("sell", `Carga de <b>${e.name}</b> comprada no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderSupplies(G.p);
        break;
      case "ammo-buy":
        addLog("sell", `Carga de <b>${e.name}</b> comprada no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderInventory(G.p);
        renderEquip(G.p);
        break;
      case "no-ammo":
        addLog("death", `Sem gold para comprar carga de <b>${e.name}</b>.`);
        break;
      case "cast":
        r.addEffect(0.3, 0.5, e.area ? "explosion-area" : "magic-blue");
        break;
      case "kill": {
        const x = 0.42 + (e.x || 0.5) * 0.5;
        r.addCorpse(x, e.y || 0.5, e.mob);
        r.addFloater(x, (e.y || 0.5) - 0.06, "+" + fmt(e.exp) + " xp", "#9ce84a");
        r.addEffect(x, e.y || 0.5, "poff");
        addLog("exp", `Matou <b>${e.name}</b> · <span style="color:#9ce84a">+${fmtFull(e.exp)} xp</span>`);
        if (e.loot && e.loot.length) {
          const txt = e.loot.map((l) => {
            const it = GAMEDATA.items[l.item];
            const rare = it && (it.sell || 0) >= 500;
            const nm = `${l.count > 1 ? l.count + "x " : ""}${itemName(l.item)}`;
            if (rare) toast(`Loot raro: <b>${itemName(l.item)}</b>`, "rare");
            return rare ? `<b style="color:#dab0ff">${nm}</b>` : nm;
          }).join(", ");
          addLog("loot", `Loot: ${txt}`);
        }
        break;
      }
      case "death":
        addLog("death", `Você morreu! Perdeu ${fmtFull(e.exp)} xp e ${fmtFull(e.gold)} gp.` +
          (e.blessed ? " <span style='color:#9ce84a'>A bênção protegeu você.</span>" : ""));
        toast("Você morreu!", "death");
        r.shake = 16;
        break;
      case "retreat":
        addLog("death", "Sem cura! Recuando para se recuperar…");
        toast("Recuando: acabaram os supplies", "death");
        break;
      case "resume":
        addLog("info", "Recuperado. Voltando à caçada.");
        break;
    }
  }
  c.events.length = 0;
}

function regenInCity(p, dt) {
  const max = maxStats(p);
  const g = gearStats(p);
  const rr = regenRate(p.voc, g.hpreg > 0);
  G.cityRegenHp += dt;
  G.cityRegenMp += dt;
  const hpEvery = Math.max(1000, (rr.hp * 1000) / (1 + g.hpreg * 0.4));
  const mpEvery = Math.max(800, (rr.mp * 1000) / (1 + g.mpreg * 0.4));
  while (G.cityRegenHp >= hpEvery) {
    G.cityRegenHp -= hpEvery;
    p.hp = Math.min(max.hp, p.hp + 1 + Math.floor(p.level / 20));
  }
  while (G.cityRegenMp >= mpEvery) {
    G.cityRegenMp -= mpEvery;
    p.mp = Math.min(max.mp, p.mp + 2 + Math.floor(p.level / 15));
  }
}

function tickManaTrain(p, dt) {
  G.manaTrainAcc += dt;
  if (G.manaTrainAcc < 1000) return;
  G.manaTrainAcc = 0;
  const r = runManaTrainTick(p);
  if (!r) return;
  if (r.stopped) {
    toast(r.msg);
    addLog("skill", `Mana train pausado: ${r.msg}`);
    return;
  }
  addLog("skill", `Mana train criou <b>${r.product}</b> usando ${fmtFull(r.recipe.mana)} mana.`);
  if (r.mlUp > 0) toast(`Magic Level +${r.mlUp}!`, "level");
  renderSkills(p);
  renderInventory(p);
  renderSupplies(p);
  renderEquip(p);
  if (G.activeNpc === "trainer" && $("#modal").classList.contains("show"))
    refreshNpc("trainer");
}

function drainAcademyEvents() {
  const t = G.training;
  if (!t) return;
  const r = G.renderer;
  for (const e of t.events) {
    const kind = e.type || e.t;
    switch (kind) {
      case "hit":
        r.addFloater(0.68, 0.42, "+tick " + (SKILL_NAMES[e.skill] || e.skill), "#9ce84a", e.skillUp);
        r.addEffect(0.68, 0.58, e.skill === "magic" ? "magic-blue" : "block-hit");
        // O Treiner revida para gerar shielding: explosão de fogo visual no player.
        r.addEffect(0.28, 0.60, "fire-area");
        r.addFloater(0.28, 0.48, "treiner hit", "#ff8a3c");
        renderSkills(G.p);
        renderStats(G.p);
        renderTopbar(G.p);
        if (e.skillUp) addLog("skill", `<b>${SKILL_NAMES[e.skill] || e.skill}</b> subiu batendo no Treiner.`);
        if (e.shieldUp) addLog("skill", "<b>Shielding</b> subiu treinando no Treiner.");
        break;
      case "msg":
        addLog("info", e.msg);
        break;
      case "ammo-buy":
        addLog("sell", `Carga de <b>${e.name}</b> comprada no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderInventory(G.p);
        renderEquip(G.p);
        break;
      case "no-ammo":
        addLog("death", `Sem munição/gold para treinar com <b>${e.name}</b>.`);
        break;
    }
  }
  t.events.length = 0;
}

/* ------------------------------------------------------------ loop */
function loop(ts) {
  requestAnimationFrame(loop);
  if (!G.p) return;
  const dt = Math.min(250, ts - G.last || 16);
  G.last = ts;

  if (!G.paused && G.combat) {
    const before = G.p.level;
    const beforeSkills = JSON.stringify(G.p.skills) + G.p.ml;
    G.tickAcc += dt;
    while (G.tickAcc >= TICK) {
      combatTick(G.combat, G.p, TICK, Date.now());
      G.tickAcc -= TICK;
    }
    drainEvents();

    if (G.p.level > before) {
      addLog("level", `Subiu para o nível <b>${G.p.level}</b>!`);
      toast(`Nível <b>${G.p.level}</b>!`, "level");
      G.renderer.addFloater(0.13, 0.42, "LEVEL UP!", "#ffe680", true);
    }
    if (JSON.stringify(G.p.skills) + G.p.ml !== beforeSkills) {
      renderSkills(G.p);
    }

    // auto sell / equip a cada 15s
    G.sellTimer += dt;
    if (G.sellTimer > 15000) {
      G.sellTimer = 0;
      if (G.p.config.autoSell) {
        const r = autoSell(G.p);
        if (r.items.length)
          addLog("sell", `Vendeu ${r.items.length} tipo(s) de loot por <span class="gold-txt">${fmtFull(r.gold)} gp</span>`);
      }
      if (G.p.config.autoEquip) {
        const ch = autoEquip(G.p);
        for (const c of ch)
          addLog("info", `Equipou <b>${itemName(c.item)}</b>`);
        if (ch.length) renderEquip(G.p);
      }
      const spent = autoRestock(G.p);
      if (spent > 0) {
        addLog("sell", `Repôs supplies por <span class="gold-txt">${fmtFull(spent)} gp</span>`);
        renderSupplies(G.p);
      }
      renderInventory(G.p);
    }
  }

  if (!G.paused && G.training) {
    const beforeSkills = JSON.stringify(G.p.skills) + G.p.ml;
    regenInCity(G.p, dt);
    academyTrainingTick(G.training, G.p, dt, Date.now());
    drainAcademyEvents();
    if (JSON.stringify(G.p.skills) + G.p.ml !== beforeSkills) {
      renderSkills(G.p);
      renderStats(G.p);
    }
  }

  G.renderer.resize();
  if (G.training) {
    G.renderer.drawAcademy(G.training, G.p, dt);
  } else if (G.inCity && !G.combat) {
    // na cidade a stamina e a mana regeneram devagar (treino online)
    G.p.stamina = Math.min(42 * 3600, G.p.stamina + (dt / 1000) * 0.35);
    regenInCity(G.p, dt);
    tickManaTrain(G.p, dt);
    // caminhada: ao chegar num NPC, abre o dialogo dele
    const reached = G.walker.update(dt);
    if (reached) openNpc(reached);
    G.renderer.drawCityMap(G.p, dt, G.walker, G.hoverNpc);
  } else {
    G.renderer.draw(G.combat, G.p, dt);
  }

  // atualiza HUD a cada ~150ms
  G.hudAcc = (G.hudAcc || 0) + dt;
  if (G.hudAcc > 150) {
    G.hudAcc = 0;
    renderStats(G.p);
    renderTopbar(G.p);
  }

  // autosave a cada 20s
  G.saveTimer += dt;
  if (G.saveTimer > 20000) { G.saveTimer = 0; save(); }
}

/* ------------------------------------------------------------ render */
function renderAll() {
  const p = G.p;
  renderStats(p);
  renderSkills(p);
  renderEquip(p);
  renderHunts(p);
  renderInventory(p);
  renderSupplies(p);
  renderSpells(p);
  renderNpcQuick();
  renderTopbar(p);
  renderHuntInfo();
}

function renderHuntInfo() {
  const p = G.p;
  const el = $("#hunt-info");
  if (!el) return;
  if (G.training) {
    const t = G.training;
    const st = academyStatus(p);
    el.innerHTML = `
      <div class="row mb4" style="justify-content:space-between">
        <b style="color:#9ce84a">Academia Safezone</b>
        <span class="risk low">seguro</span>
      </div>
      <div class="stat-row"><span class="k">Alvo</span><span class="v">Treiner</span></div>
      <div class="stat-row"><span class="k">Skill</span><span class="v">${st.skill ? (SKILL_NAMES[st.skill] || st.skill) : "—"}</span></div>
      <div class="stat-row"><span class="k">Hits</span><span class="v">${fmtFull(t.stats.hits)}</span></div>
      <div class="stat-row"><span class="k">Bônus</span><span class="v" style="color:#9ce84a">+200% ticks/hit</span></div>
      <button class="primary full mt8" onclick="openAcademyConjureModal(true)">Conjure</button>`;
    return;
  }
  if (!p.hunt) {
    el.innerHTML = `<div class="dim small center" style="padding:8px">Nenhuma caçada ativa</div>`;
    return;
  }
  const hu = GAMEDATA.hunts[p.hunt];
  const est = huntEstimate(p, hu);
  const risk = huntRisk(p, hu);
  el.innerHTML = `
    <div class="row mb4" style="justify-content:space-between">
      <b style="color:#d4af37">${hu.name}</b>
      <span class="risk ${risk.cls}">${risk.txt}</span>
    </div>
    <div class="stat-row"><span class="k">XP / hora</span><span class="v" style="color:#9ce84a">${fmt(est.exp)}</span></div>
    <div class="stat-row"><span class="k">Gold / hora</span><span class="v gold-txt">${fmt(est.gold)}</span></div>
    <div class="stat-row"><span class="k">Kills / hora</span><span class="v">${Math.round(est.kills)}</span></div>
    <div class="stat-row"><span class="k">Tempo por kill</span><span class="v">${est.ttk.toFixed(1)}s</span></div>
    <div class="stat-row"><span class="k">Sobrevivência</span><span class="v">${risk.ttd > 900 ? "∞" : Math.round(risk.ttd) + "s"}</span></div>`;
}

/* ------------------------------------------------------------ boot */
function startGame(p) {
  p = normalizePlayer(p);
  G.p = p;
  G.renderer = new Renderer($("#scene"));
  G.renderer.resize();
  G.walker = new CityWalker();

  $("#login").style.display = "none";
  $("#app").classList.add("ready");

  const off = computeOffline(p);
  p.lastSeen = Date.now();

  if (p.hunt && GAMEDATA.hunts[p.hunt]) {
    G.combat = newCombat(p, p.hunt);
    spawnWave(G.combat, p);
    G.inCity = false;
  } else {
    G.inCity = true;   // sem caçada ativa, o char fica na cidade
  }

  renderAll();
  bindControls();
  addLog("info", `Bem-vindo, <b>${p.name}</b>!`);
  if (off) showOfflineModal(off);

  G.last = performance.now();
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", save);
  setInterval(save, 20000);
}

function bindControls() {
  const p = G.p;
  $("#btn-city").addEventListener("click", () => {
    if (G.inCity && !G.combat && !G.training) { toast("Você já está na cidade"); return; }
    goToCity();
  });

  // interacao com NPCs no canvas da cidade
  const cv = $("#scene");
  const canvasPos = (e) => {
    const r = cv.getBoundingClientRect();
    return { mx: (e.clientX - r.left) * (cv.width / r.width),
             my: (e.clientY - r.top) * (cv.height / r.height) };
  };
  cv.addEventListener("mousemove", (e) => {
    if (!G.inCity || G.combat) {
      if (G.hoverNpc) { G.hoverNpc = null; cv.style.cursor = "default"; }
      return;
    }
    const { mx, my } = canvasPos(e);
    const id = G.renderer.npcAt(mx, my);
    G.hoverNpc = id;
    cv.style.cursor = id ? "pointer" : "default";
  });
  cv.addEventListener("mouseleave", () => { G.hoverNpc = null; });
  cv.addEventListener("click", (e) => {
    if (!G.inCity || G.combat) return;
    const { mx, my } = canvasPos(e);
    const id = G.renderer.npcAt(mx, my);
    if (id) {
      // caminha ate o NPC; se ja estiver do lado, abre na hora
      if (G.walker.goToNpc(id)) openNpc(id);
    } else {
      const w = G.renderer.screenToWorld(mx, my);
      G.walker.goToPixel(w.x, w.y, null);
    }
  });

  // ---- movimento por teclado (WASD e setas)
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const k = KEYMAP[e.key];
    if (!k || !G.inCity || G.combat) return;
    G.walker.keys[k] = true;
    e.preventDefault();
  });
  document.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.key];
    if (k) G.walker.keys[k] = false;
  });
  window.addEventListener("blur", () => { G.walker.keys = {}; });
  $("#btn-sell").addEventListener("click", () => {
    const r = autoSell(p);
    toast(`Vendeu tudo por <b>${fmtFull(r.gold)} gp</b>`);
    addLog("sell", `Venda manual: <span class="gold-txt">${fmtFull(r.gold)} gp</span>`);
    renderAll();
  });
  $("#btn-equip").addEventListener("click", () => {
    const ch = autoEquip(p);
    if (!ch.length) { toast("Já está com o melhor equipamento"); return; }
    for (const c of ch) addLog("info", `Equipou <b>${itemName(c.item)}</b>`);
    renderAll();
  });
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Apagar o personagem e recomeçar? Isso não pode ser desfeito."))
      wipeSave();
  });
  $("#heal-at").addEventListener("input", (e) => {
    p.config.healAt = parseInt(e.target.value, 10);
    $("#heal-at-val").textContent = p.config.healAt + "%";
  });
  $("#cfg-runes").addEventListener("change", (e) => {
    p.config.useRunes = e.target.checked;
  });
  $("#cfg-sell").addEventListener("change", (e) => {
    p.config.autoSell = e.target.checked;
  });
  $("#cfg-equip").addEventListener("change", (e) => {
    p.config.autoEquip = e.target.checked;
  });
  $("#cfg-spell").addEventListener("change", (e) => {
    p.config.spellAttack = e.target.checked;
  });
  $("#loot-filter").addEventListener("change", (e) => {
    p.config.lootFilter = e.target.value;
  });

  // tabs da coluna direita
  $$(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const group = t.dataset.group;
      $$(`.tab[data-group="${group}"]`).forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      $$(`[data-panel-group="${group}"]`).forEach((x) => {
        x.style.display = x.dataset.panel === t.dataset.panel ? "" : "none";
      });
    });
  });

  // sincroniza controles com o estado
  $("#heal-at").value = p.config.healAt;
  $("#heal-at-val").textContent = p.config.healAt + "%";
  $("#cfg-runes").checked = p.config.useRunes;
  $("#cfg-sell").checked = p.config.autoSell;
  $("#cfg-equip").checked = p.config.autoEquip;
  $("#cfg-spell").checked = p.config.spellAttack;
  $("#loot-filter").value = p.config.lootFilter;
}

/* ------------------------------------------------------------ login */
function initLogin() {
  const saved = load();
  if (saved) {
    $("#continue-box").style.display = "";
    $("#saved-name").textContent = saved.name;
    $("#saved-info").textContent =
      `${VOCATIONS[saved.voc].name} · nível ${saved.level}`;
    $("#btn-continue").addEventListener("click", () => startGame(saved));
  }

  let selVoc = "knight", selSex = "male";
  const vocs = ["knight", "paladin", "druid", "sorcerer"];
  const outfitOf = (v, s) => {
    const map = { knight: "knight", paladin: "hunter", druid: "summoner",
                  sorcerer: "mage" };
    return map[v] + "-" + (s === "female" ? "f" : "m");
  };
  function paintVocs() {
    $("#voc-grid").innerHTML = vocs.map((v) => `
      <div class="voc-card ${v === selVoc ? "sel" : ""}" data-voc="${v}">
        <img src="assets/outfit/${outfitOf(v, selSex)}_s.png" alt="">
        <div class="vn">${VOCATIONS[v].name}</div>
        <div class="vd">${VOCATIONS[v].desc}</div>
      </div>`).join("");
    $$("#voc-grid .voc-card").forEach((c) =>
      c.addEventListener("click", () => { selVoc = c.dataset.voc; paintVocs(); }));
  }
  paintVocs();

  $$("[data-sex]").forEach((b) => {
    b.addEventListener("click", () => {
      selSex = b.dataset.sex;
      $$("[data-sex]").forEach((x) => x.classList.remove("primary"));
      b.classList.add("primary");
      paintVocs();
    });
  });

  $("#btn-create").addEventListener("click", () => {
    const name = ($("#char-name").value || "").trim();
    if (name.length < 2) { toast("Digite um nome válido"); return; }
    const p = newPlayer(name, selVoc, selSex);
    // kit inicial por vocacao
    const kits = {
      knight: ["sword", "brass-armor", "brass-helmet", "wooden-shield",
               "leather-legs", "leather-boots"],
      paladin: ["bow", "arrow", "leather-armor", "leather-helmet",
                "leather-legs", "leather-boots"],
      druid: ["wooden-wand", "leather-armor", "leather-helmet",
              "leather-legs", "leather-boots"],
      sorcerer: ["wooden-wand", "leather-armor", "leather-helmet",
                 "leather-legs", "leather-boots"],
    };
    for (const slug of kits[selVoc] || []) {
      addItem(p, slug, slug === "arrow" ? 50 : 1);
    }
    p.gold = 500;
    p.supplies["intense-healing-rune"] = 10;
    autoEquip(p);
    startGame(p);
  });

  $("#char-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#btn-create").click();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTooltip();
  initLogin();
});
