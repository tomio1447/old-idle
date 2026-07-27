/*
 * game.js — loop principal, save/load, ganhos offline e bootstrap
 */
"use strict";

const SAVE_KEY = "tibia-idle-save-v1";
const CHARACTERS_KEY = "tibia-idle-characters-v1";
const ACTIVE_CHARACTER_KEY = "tibia-idle-active-character-v1";
const AUTOLOGIN_KEY = "tibia-idle-autologin-v1";

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
function characterId(p) {
  if (!p.id) p.id = "char-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  return p.id;
}

function readRoster() {
  try {
    const raw = localStorage.getItem(CHARACTERS_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return d && typeof d === "object" ? d : {};
  } catch (e) { return {}; }
}

function writeRoster(roster) {
  localStorage.setItem(CHARACTERS_KEY, JSON.stringify(roster));
}

function saveCharacterToRoster(p) {
  if (!p) return false;
  const id = characterId(p);
  const roster = readRoster();
  p.lastSeen = Date.now();
  roster[id] = { v: 1, p: p };
  writeRoster(roster);
  localStorage.setItem(ACTIVE_CHARACTER_KEY, id);
  return true;
}

function getCharacters() {
  const roster = readRoster();
  return Object.keys(roster).map((id) => {
    const p = roster[id] && roster[id].p ? normalizePlayer(roster[id].p) : null;
    if (p) p.id = id;
    return p;
  }).filter(Boolean).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

function save() {
  if (!G.p) return false;
  try {
    saveCharacterToRoster(G.p);
    // mantém compatibilidade com saves antigos de 1 personagem
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
    const roster = readRoster();
    const active = localStorage.getItem(ACTIVE_CHARACTER_KEY);
    if (active && roster[active] && roster[active].p) {
      const p = normalizePlayer(roster[active].p);
      p.id = active;
      return p;
    }
    const ids = Object.keys(roster);
    if (ids.length) {
      const id = ids[0];
      localStorage.setItem(ACTIVE_CHARACTER_KEY, id);
      const p = normalizePlayer(roster[id].p);
      p.id = id;
      return p;
    }
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.p) return null;
    const p = normalizePlayer(d.p);
    saveCharacterToRoster(p);
    return p;
  } catch (e) { return null; }
}

function normalizePlayer(p) {
  p.config = Object.assign({
    healAt: 90,
    healSpellAt: 90,
    healItemAt: 60,
    manaAt: 50,
    healSpell: "",
    healSupply: "",
    manaSupply: "mana-fluid",
    useRunes: true,
    autoRestock: false,
    manaTrain: null,
    autoConjure: null,
    attackMode: "chase",
    kiteDistance: 3,
    shooterType: "auto",
    shooterSpell: "",
    shooterRune: "",
    missionCollapsed: false,
    autoEquip: true,
    spellAttack: true,
    autoRetreat: true,
    barMode: "bars",
    lootFilter: "all",
    refillArrow: "",
    refillBolt: "",
  }, p.config || {});
  p.config.autoRestock = false;
  p.config.healSpellAt = Math.max(1, Math.min(99, parseInt(p.config.healSpellAt === undefined ? p.config.healAt : p.config.healSpellAt, 10) || 90));
  p.config.healItemAt = Math.max(1, Math.min(99, parseInt(p.config.healItemAt === undefined ? p.config.healAt : p.config.healItemAt, 10) || 60));
  p.config.healAt = Math.max(p.config.healSpellAt, p.config.healItemAt);
  p.config.kiteDistance = Math.max(1, Math.min(5, parseInt(p.config.kiteDistance, 10) || 3));
  // paladino sempre tem uma munição padrão selecionada
  if (p.voc === "paladin" && !p.config.refillArrow && !p.config.refillBolt)
    p.config.refillArrow = "arrow";
  p.supplies = p.supplies || {};
  if (!Object.prototype.hasOwnProperty.call(p.supplies, "mana-fluid")) p.supplies["mana-fluid"] = 0;
  if (p.config.manaSupply === undefined) p.config.manaSupply = "mana-fluid";
  p.bag = p.bag || {};
  p.bagSlots = p.bagSlots || 8;
  p.lootPouch = p.lootPouch || {};
  p.lootConfig = p.lootConfig || { noCollect: [], noSell: [] };
  p.lootConfig.noCollect = p.lootConfig.noCollect || [];
  p.lootConfig.noSell = p.lootConfig.noSell || [];
  p.equip = p.equip || {};
  if (!p.equip.backpack) p.equip.backpack = { item: "bag", count: 1 };
  p.gold = Math.max(0, Math.floor(p.gold || 0));
  p.bank = p.bank || 0;
  p.promoted = !!p.promoted;
  p.promotedAt = p.promotedAt || null;
  p.missions = p.missions || {};
  p.bosses = p.bosses || {};
  p.instanceMode = p.instanceMode || null;
  p.ammo = p.ammo || {};
  p.upgrades = p.upgrades || {};
  p.imbuements = p.imbuements || {};
  p.dummies = p.dummies || {};
  p.conditions = p.conditions || {};
  p.buffs = p.buffs || {};
  if (!p.config.dummy) p.config.dummy = "exercise";
  migrateAmmoToCounter(p);   // saves antigos guardavam munição na bag
  ensureOutfit(p);
  return p;
}

function wipeSave() {
  // remove o personagem atual do roster, não só o save legado
  const id = G.p ? characterId(G.p) : localStorage.getItem(ACTIVE_CHARACTER_KEY);
  if (id) {
    const roster = readRoster();
    delete roster[id];
    writeRoster(roster);
    const rest = Object.keys(roster);
    if (rest.length) localStorage.setItem(ACTIVE_CHARACTER_KEY, rest[0]);
    else localStorage.removeItem(ACTIVE_CHARACTER_KEY);
  }
  localStorage.removeItem(SAVE_KEY);
  try { sessionStorage.removeItem(AUTOLOGIN_KEY); } catch (e) {}
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

  const modeMul = p.instanceMode === "pvp" ? 1.25 : 1;
  const kills = Math.floor(est.kills * hours * effRate);
  let exp = Math.floor(est.exp * hours * effRate * modeMul);
  let gold = Math.floor(est.gold * hours * effRate * modeMul);

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
      if (isNoCollect(p, l.item)) continue;
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
  const skillMul = p.instanceMode === "pvp" ? 1.25 : 1;
  if (sk !== "magic") addSkillTries(p, sk, Math.floor(swings * 0.6 * skillMul));
  addSkillTries(p, "shield", Math.floor(swings * 0.5 * skillMul));
  if (VOCATIONS[p.voc].weapon === "magic")
    addManaSpent(p, Math.floor(kills * 40 * skillMul));

  // loot vai para supplies, loot pouch ou bag respeitando slots.
  // moedas (platinum/crystal) são convertidas direto em gold.
  for (const slug in loot) {
    if (currencyValue(slug)) gold += creditCurrency(p, slug, loot[slug]);
    else if (SUPPLIES[slug]) p.supplies[slug] = (p.supplies[slug] || 0) + loot[slug];
    else if (GAMEDATA.items[slug] && GAMEDATA.items[slug].s === "ammo") addAmmo(p, slug, loot[slug]);
    else if (shouldGoLootPouch(slug)) addLootPouch(p, slug, loot[slug]);
    else if (!addItem(p, slug, loot[slug])) delete loot[slug];
  }
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

/* ------------------------------------------------------------ missions */
const MISSION_DEFS = {
  rats: {
    title: "Missão: Esgoto de Rookgaard",
    tasks: [
      { monster: "rat", target: 25, reward: { items: [{ slug: "rapier", count: 1 }] } },
      { monster: "cave-rat", target: 25, reward: { items: [{ slug: "leather-boots", count: 1 }] } },
      { monster: "bug", target: 25, reward: { items: [{ slug: "leather-armor", count: 1 }] } },
    ],
    completeReward: { supplies: [{ slug: "health-potion", count: 10 }], gold: 500 },
  },
};

function missionForHunt(id) {
  if (MISSION_DEFS[id]) return MISSION_DEFS[id];
  const hu = GAMEDATA.hunts[id];
  if (!hu) return null;
  const seen = new Set();
  const tasks = hu.monsters.filter((m) => !seen.has(m) && seen.add(m))
    .map((m) => ({ monster: m, target: 25, reward: { supplies: [{ slug: "health-potion", count: 2 }] } }));
  return {
    title: "Missão: " + hu.name,
    tasks: tasks,
    completeReward: { supplies: [{ slug: "health-potion", count: 10 }], gold: 500 },
  };
}

function missionState(p, huntId) {
  p.missions = p.missions || {};
  if (!p.missions[huntId])
    p.missions[huntId] = { progress: {}, claimed: {}, completeClaimed: false };
  return p.missions[huntId];
}

function rewardText(reward) {
  if (!reward) return "—";
  const out = [];
  if (reward.gold) out.push(fmtFull(reward.gold) + " gp");
  (reward.items || []).forEach((r) => out.push((r.count || 1) + "x " + itemName(r.slug)));
  (reward.supplies || []).forEach((r) => out.push((r.count || 1) + " carga(s) " + (SUPPLIES[r.slug] ? SUPPLIES[r.slug].name : itemName(r.slug))));
  return out.join(" · ") || "—";
}

function grantMissionReward(p, reward) {
  if (!reward) return true;
  for (const r of reward.items || []) {
    if (!addItem(p, r.slug, r.count || 1)) return false;
  }
  for (const r of reward.supplies || [])
    p.supplies[r.slug] = (p.supplies[r.slug] || 0) + (r.count || 1);
  if (reward.gold) p.gold += reward.gold;
  return true;
}

function tryCompleteMissionRewards(p, huntId) {
  const def = missionForHunt(huntId);
  if (!def) return;
  const st = missionState(p, huntId);
  for (const task of def.tasks) {
    if ((st.progress[task.monster] || 0) >= task.target && !st.claimed[task.monster]) {
      if (!grantMissionReward(p, task.reward)) {
        toast("Mochila cheia para receber recompensa da missão.", "death");
        return;
      }
      st.claimed[task.monster] = true;
      addLog("level", `Missão: matou ${task.target}x <b>${GAMEDATA.monsters[task.monster] ? GAMEDATA.monsters[task.monster].name : task.monster}</b>. Recompensa: ${rewardText(task.reward)}.`);
      toast(`Missão concluída: <b>${rewardText(task.reward)}</b>`, "level");
    }
  }
  const all = def.tasks.every((t) => st.claimed[t.monster]);
  if (all && !st.completeClaimed) {
    if (!grantMissionReward(p, def.completeReward)) {
      toast("Mochila cheia para recompensa final da missão.", "death");
      return;
    }
    st.completeClaimed = true;
    addLog("level", `Missão de <b>${GAMEDATA.hunts[huntId].name}</b> completa. Recompensa final: ${rewardText(def.completeReward)}.`);
    toast(`Missão completa! <b>${rewardText(def.completeReward)}</b>`, "level");
  }
}

function handleMissionKill(p, huntId, monster) {
  const def = missionForHunt(huntId);
  if (!def || !def.tasks.some((t) => t.monster === monster)) return;
  const st = missionState(p, huntId);
  const task = def.tasks.find((t) => t.monster === monster);
  st.progress[monster] = Math.min(task.target, (st.progress[monster] || 0) + 1);
  tryCompleteMissionRewards(p, huntId);
  renderMission();
}

function renderMission() {
  const box = $("#mission-box");
  if (!box || !G.p || !G.combat || G.training || G.combat.boss) {
    if (box) box.style.display = "none";
    return;
  }
  const huntId = G.combat.huntId;
  const def = missionForHunt(huntId);
  if (!def) { box.style.display = "none"; return; }
  const st = missionState(G.p, huntId);
  const collapsed = !!G.p.config.missionCollapsed;
  const totalDone = def.tasks.filter((t) => (st.progress[t.monster] || 0) >= t.target).length;
  box.style.display = "block";
  box.innerHTML = `
    <div class="mission-head" id="mission-toggle">
      <span>${collapsed ? "▸" : "▾"}</span><span>${def.title}</span>
      <span class="spacer"></span><span>${totalDone}/${def.tasks.length}</span>
    </div>
    ${collapsed ? "" : `<div class="mission-body">
      ${def.tasks.map((t) => {
        const cur = Math.min(t.target, st.progress[t.monster] || 0);
        const done = cur >= t.target;
        const pct = (cur / t.target) * 100;
        const name = GAMEDATA.monsters[t.monster] ? GAMEDATA.monsters[t.monster].name : t.monster;
        return `<div class="mission-row ${done ? "done" : ""}">
          <div style="flex:1"><b>${name}</b><div class="mission-progressbar"><div style="width:${pct}%"></div></div></div>
          <span>${cur}/${t.target}</span>
        </div>`;
      }).join("")}
      <div class="mission-reward">Final: ${rewardText(def.completeReward)}</div>
    </div>`}`;
  $("#mission-toggle").addEventListener("click", () => {
    G.p.config.missionCollapsed = !G.p.config.missionCollapsed;
    renderMission();
  });
}

function isMissionComplete(p, huntId) {
  const def = missionForHunt(huntId);
  if (!def) return false;
  const st = missionState(p, huntId);
  return def.tasks.every((t) => (st.progress[t.monster] || 0) >= t.target);
}

/* ------------------------------------------------------------ bosses */
const BOSS_COOLDOWN = 16 * 3600 * 1000;
const BOSS_DEFS = {
  "the-monster": {
    id: "the-monster",
    name: "The Monster",
    title: "Boss dos Rats",
    hunt: "rats",
    baseMonster: "cave-rat",
    sprite: "cave-rat",
    mult: 10,
    requirement: { mission: "rats", text: "Completar tasks do Bueiro de Rookgaard" },
    cooldown: BOSS_COOLDOWN,
    loot: [
      { item: "platinum-coin", chance: 10, max: 5 },
      { item: "chain-armor", chance: 10, max: 1 },
      { item: "legion-helmet", chance: 10, max: 1 },
      { item: "studded-legs", chance: 10, max: 1 },
      { item: "copper-shield", chance: 10, max: 1 },
      { item: "mace", chance: 10, max: 1 },
      { item: "katana", chance: 10, max: 1 },
      { item: "leather-boots", chance: 10, max: 1 },
    ],
  },
};

function bossState(p, id) {
  p.bosses = p.bosses || {};
  if (!p.bosses[id]) p.bosses[id] = { lastFight: 0, kills: 0 };
  return p.bosses[id];
}

function bossReadyInfo(p, boss) {
  const reqOk = !boss.requirement || !boss.requirement.mission || isMissionComplete(p, boss.requirement.mission);
  if (!reqOk) return { ok: false, reason: boss.requirement.text, left: 0 };
  const st = bossState(p, boss.id);
  const left = Math.max(0, (st.lastFight || 0) + boss.cooldown - Date.now());
  if (left > 0) return { ok: false, reason: "Cooldown", left: left };
  return { ok: true, reason: "Disponível", left: 0 };
}

function bossLootText(boss) {
  return boss.loot.map((l) =>
    `${l.chance}% ${l.max > 1 ? "até " + l.max + "x " : ""}${itemName(l.item)}`);
}

function renderBosses(p) {
  const el = $("#bosses");
  if (!el) return;
  el.innerHTML = `<div class="npc-quick boss-quick">${Object.keys(BOSS_DEFS).map((id) => {
    const b = BOSS_DEFS[id];
    const r = bossReadyInfo(p, b);
    return `<div class="npc-btn boss-btn ${r.ok ? "" : "locked"}" data-boss-info="${id}" title="${b.name} — ${r.left ? "Cooldown" : r.reason}">
      <img src="assets/mob/${b.sprite}_s.png" alt="">
      <div class="nb">${b.name.split(" ")[0]}</div>
    </div>`;
  }).join("")}</div>`;
  $$("#bosses [data-boss-info]").forEach((btn) =>
    btn.addEventListener("click", () => openBossModal(btn.dataset.bossInfo)));
}

function openBossModal(id) {
  const boss = BOSS_DEFS[id];
  if (!boss) return;
  const ready = bossReadyInfo(G.p, boss);
  const base = GAMEDATA.monsters[boss.baseMonster];
  const mult = applyBossMultiplier(base, boss.mult || 10);
  const st = bossState(G.p, id);
  $("#modal-body").innerHTML = `
    <div class="panel-title">
      <img src="assets/mob/${boss.sprite}_s.png" style="height:24px;image-rendering:pixelated">
      ${boss.name} — <span class="dim" style="font-weight:normal">${boss.title}</span>
      <span style="flex:1"></span><button class="sm" id="boss-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="panel-inset mb8" style="padding:8px">
        <div class="stat-row"><span class="k">Requisito</span><span class="v">${boss.requirement.text}</span></div>
        <div class="stat-row"><span class="k">Disponibilidade</span><span class="v" style="color:${ready.ok ? "#9ce84a" : "#ff9a6a"}">${ready.left ? fmtTime(ready.left / 1000) : ready.reason}</span></div>
        <div class="stat-row"><span class="k">Cooldown</span><span class="v">1 combate a cada 16h</span></div>
        <div class="stat-row"><span class="k">Vitórias</span><span class="v">${fmtFull(st.kills || 0)}</span></div>
      </div>
      <div class="panel-inset mb8" style="padding:8px">
        <div class="stat-row"><span class="k">Sprite</span><span class="v">Cave Rat</span></div>
        <div class="stat-row"><span class="k">Vida</span><span class="v">${fmtFull(mult.hp)}</span></div>
        <div class="stat-row"><span class="k">Dano</span><span class="v">${fmtFull(mult.damage)}</span></div>
        <div class="stat-row"><span class="k">Defesa</span><span class="v">${fmtFull(mult.armor)}</span></div>
      </div>
      <div class="small dim mb4">Drops — 10% cada</div>
      <div class="list mb8" style="max-height:180px">
        ${bossLootText(boss).map((line) => `<div class="stat-row"><span class="k">${line}</span></div>`).join("")}
      </div>
      <button class="danger full" id="boss-fight" ${ready.ok ? "" : "disabled"}>FIGHT</button>
      <div class="tiny dim mt8">Ao terminar a luta, vencendo ou morrendo, você será teleportado para a cidade. O loot do boss vai para o Loot Pouch.</div>
    </div>`;
  $("#modal").classList.add("show");
  $("#boss-close").addEventListener("click", () => $("#modal").classList.remove("show"));
  $("#boss-fight").addEventListener("click", () => {
    $("#modal").classList.remove("show");
    startBoss(id);
  });
}

function startBoss(id) {
  const boss = BOSS_DEFS[id];
  if (!boss) return;
  const ready = bossReadyInfo(G.p, boss);
  if (!ready.ok) { toast(ready.reason); return; }
  if (G.training) stopAcademy(false);
  if (G.combat) stopHunt();
  const st = bossState(G.p, id);
  st.lastFight = Date.now();
  G.p.hunt = null;
  G.p.instanceMode = "boss";
  G.combat = newBossCombat(G.p, boss);
  G.inCity = false;
  addLog("death", `Você entrou no boss <b>${boss.name}</b>. Cooldown iniciado: 16h.`);
  toast(`Boss: <b>${boss.name}</b>`, "death");
  renderAll();
}

/* ------------------------------------------------------------ hunt */
function openInstanceModal(id) {
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  $("#modal-body").innerHTML = `
    <div class="panel-title">Escolha a instância — ${hu.name}</div>
    <div class="panel-body">
      <div class="shop-row" style="align-items:flex-start">
        <div style="flex:1">
          <div class="small" style="color:#9ce84a">Instância non-pvp</div>
          <div class="tiny dim">Ninguém pode te raidar. EXP, loot e skills normais.</div>
        </div>
        <button class="primary sm" data-instance="non-pvp">Entrar</button>
      </div>
      <div class="shop-row" style="align-items:flex-start">
        <div style="flex:1">
          <div class="small" style="color:#ff9a6a">Instância pvp</div>
          <div class="tiny dim">Outros jogadores reais poderão te raidar e matar no online. EXP, loot e skills +25%. +0,5% de chance de monstro Influenced.</div>
        </div>
        <button class="danger sm" data-instance="pvp">Entrar</button>
      </div>
      <button class="full mt8" id="instance-cancel">Cancelar</button>
    </div>`;
  $("#modal").classList.add("show");
  $$("#modal-body [data-instance]").forEach((b) =>
    b.addEventListener("click", () => {
      $("#modal").classList.remove("show");
      startHunt(id, b.dataset.instance);
    }));
  $("#instance-cancel").addEventListener("click", () => $("#modal").classList.remove("show"));
}

function startHunt(id, instanceMode) {
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  if (!instanceMode) { openInstanceModal(id); return; }
  if (G.training) stopAcademy(false);
  G.inCity = false;
  G.p.hunt = id;
  G.p.instanceMode = instanceMode;
  G.combat = newCombat(G.p, id, instanceMode);
  spawnWave(G.combat, G.p);
  addLog("info", `Viajando para <b style="color:#d4af37">${hu.name}</b> · instância <b>${instanceMode}</b>`);
  toast(`Caçando em <b>${hu.name}</b> (${instanceMode})`);
  renderAll();
}

function stopHunt() {
  G.p.hunt = null;
  G.p.instanceMode = null;
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
  const ex = (e) => e.screen ? (e.x || 0.5) : 0.42 + (e.x || 0.5) * 0.5;
  const ey = (e) => e.y || 0.5;
  for (const e of c.events) {
    switch (e.t) {
      case "hit": {
        const col = (ELEMENTS[e.el] || ELEMENTS.physical).color;
        const x = ex(e), y = ey(e);
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx || (c.player ? c.player.x : 0.18), e.sy || 0.62,
                          x, y, col, e.missile);
        r.addFloater(x, y, "-" + fmt(e.dmg), col, e.dmg > 200);
        r.addEffect(x, y, (ELEMENTS[e.el] || ELEMENTS.physical).fx);
        break;
      }
      case "miss":
        r.addFloater(ex(e), ey(e), "errou", "#a0a0a0");
        break;
      case "range":
        r.addFloater(ex(e), ey(e), "fora de alcance", "#c8c0a8");
        break;
      case "taken": {
        const col = (ELEMENTS[e.el] || ELEMENTS.physical).color;
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, e.x, e.y, col, e.missile);
        r.addFloater(e.screen ? e.x : 0.13, e.screen ? e.y - 0.07 : 0.55, "-" + fmt(e.dmg), col);
        r.addEffect(e.screen ? e.x : 0.13, e.screen ? e.y : 0.6, (ELEMENTS[e.el] || ELEMENTS.physical).fx);
        r.shake = Math.min(9, 2 + e.dmg / 30);
        r.playerFlash = 90;
        break;
      }
      case "block":
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, e.x, e.y, "#9ac0e8", e.missile);
        r.addFloater(e.screen ? e.x : 0.13, e.screen ? e.y - 0.07 : 0.55, "bloqueou", "#9ac0e8");
        break;
      case "heal": {
        const px = c.player ? c.player.x : 0.13, py = c.player ? c.player.y - 0.12 : 0.5;
        r.addFloater(px, py, "+" + fmt(e.amount), "#7ae87a");
        r.addEffect(px, c.player ? c.player.y : 0.6, "green-rings");
        break;
      }
      case "mana": {
        const px = c.player ? c.player.x : 0.13, py = c.player ? c.player.y - 0.12 : 0.5;
        r.addFloater(px, py, "+" + fmt(e.amount) + " mana", "#6a8aff");
        break;
      }
      case "supply-buy":
        addLog("sell", `Carga de <b>${e.name}</b> comprada no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderSupplies(G.p);
        break;
      case "ammo-buy":
        addLog("sell", `Comprou 1x <b>${e.name}</b> no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
      case "no-ammo":
        addLog("death", `Sem <b>${e.name}</b> e sem gold: o ataque à distância falhou.`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
      case "bag-full":
        addLog("death", "Mochila cheia: loot no chão foi ignorado.");
        toast("Mochila cheia", "death");
        break;
      case "raid-real-player":
        addLog("death", "Raid PvP reservado para jogador real online — nenhum NPC fake foi criado.");
        break;
      case "cast":
        r.addEffect(e.screen ? e.x : 0.3, e.screen ? e.y : 0.5, e.area ? "explosion-area" : "magic-blue");
        break;
      case "player-condition": {
        const d = CONDITIONS[e.tipo];
        if (d) addLog("death", `Você está <b style="color:${d.cor}">${d.nome}</b>!`);
        renderStats(G.p);
        break;
      }
      case "cured":
        addLog("skill", `Curou <b>${e.nome}</b>.`);
        renderStats(G.p);
        break;
      case "buff":
        addLog("skill", `Buff ativo: <b>${e.nome}</b>`);
        break;
      case "poisoned":
        r.addEffect(ex(e), ey(e), "hit-by-poison");
        addLog("info", `<b>${e.name}</b> foi envenenado.`);
        break;
      case "burst":
        r.addEffect(ex(e), ey(e), "explosion-area");
        r.shake = Math.max(r.shake || 0, 5);
        break;
      case "say":
        // o personagem fala a magia/supply, como no client do Tibia
        r.addSpeech(e.text, e.supply ? "#7ae87a" : "#ffe680");
        addLog("say", `<b>${G.p.name}</b>: ${e.text}`);
        break;
      case "kill": {
        const x = ex(e), y = ey(e);
        r.addCorpse(x, y, e.mob);
        r.addFloater(x, y - 0.06, "+" + fmt(e.exp) + " xp", "#9ce84a");
        r.addEffect(x, y, "poff");
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
        if (c.boss) {
          const st = bossState(G.p, c.boss.id);
          st.kills = (st.kills || 0) + 1;
          addLog("level", `Boss <b>${c.boss.name}</b> derrotado!`);
          toast(`Boss derrotado: <b>${c.boss.name}</b>`, "level");
          renderBosses(G.p);
          setTimeout(() => {
            if (G.combat === c && c.bossDefeated) stopHunt();
          }, 2500);
        } else {
          handleMissionKill(G.p, c.huntId, e.mob);
        }
        break;
      }
      case "death":
        addLog("death", `Você morreu! Perdeu ${fmtFull(e.exp)} xp e ${fmtFull(e.gold)} gp.` +
          (e.blessed ? " <span style='color:#9ce84a'>A bênção protegeu você.</span>" : ""));
        toast("Você morreu!", "death");
        r.shake = 16;
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
        if (e.dmg > 0) r.addFloater(0.70, 0.45, "-" + fmt(e.dmg), "#d8d8d8", e.dmg > 80);
        r.addFloater(0.68, 0.38, "+tick " + (SKILL_NAMES[e.skill] || e.skill), "#9ce84a", e.skillUp);
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
      case "conjure":
        addLog("info", `Auto-conjure: <b>${e.msg}</b>`);
        if (e.mlUp) addLog("skill", "<b>Magic Level</b> subiu conjurando.");
        renderEquip(G.p);
        renderSupplies(G.p);
        renderRefill(G.p);
        break;
      case "ammo-buy":
        addLog("sell", `Comprou 1x <b>${e.name}</b> no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
      case "no-ammo":
        addLog("death", `Sem <b>${e.name}</b> e sem gold para treinar.`);
        renderEquip(G.p);
        renderRefill(G.p);
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

  // a barra de cooldown anda sozinha, dentro ou fora da hunt — no Tibia o
  // cooldown nao pausa ao voltar para a cidade
  if (typeof renderCooldownBar === "function") renderCooldownBar(G.p);

  if (!G.paused && G.combat) {
    const before = G.p.level;
    const beforeSkills = JSON.stringify(G.p.skills) + G.p.ml;
    G.tickAcc += dt;
    while (G.tickAcc >= TICK) {
      combatTick(G.combat, G.p, TICK, Date.now());
      G.tickAcc -= TICK;
    }
    drainEvents();
    if (G.combat && G.combat.dead && Date.now() >= G.combat.deadUntil) {
      addLog("death", "Você acordou no templo de Thais.");
      stopHunt();
      return;
    }

    if (G.p.level > before) {
      addLog("level", `Subiu para o nível <b>${G.p.level}</b>!`);
      toast(`Nível <b>${G.p.level}</b>!`, "level");
      G.renderer.addFloater(0.13, 0.42, "LEVEL UP!", "#ffe680", true);
    }
    if (JSON.stringify(G.p.skills) + G.p.ml !== beforeSkills) {
      renderSkills(G.p);
    }

    // auto equip a cada 15s (a venda e sempre manual: Sell all ou menu do item)
    G.sellTimer += dt;
    if (G.sellTimer > 15000) {
      G.sellTimer = 0;
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
      renderLootPouch(G.p);
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
  renderLootPouch(p);
  renderSupplies(p);
  renderSpells(p);
  renderHelper(p);
  renderMission();
  renderNpcQuick();
  renderBosses(p);
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
      <div class="stat-row"><span class="k">Dano causado</span><span class="v">${fmtFull(t.stats.damage || 0)}</span></div>
      <div class="stat-row"><span class="k">Bônus</span><span class="v" style="color:#9ce84a">+200% ticks/hit</span></div>
      <button class="primary full mt8" onclick="openAcademyConjureModal(true)">Conjure</button>`;
    return;
  }
  if (G.combat && G.combat.boss) {
    const boss = G.combat.boss;
    const mob = G.combat.mobs[0];
    el.innerHTML = `
      <div class="row mb4" style="justify-content:space-between">
        <b style="color:#ff9a6a">${boss.name}</b>
        <span class="risk high">boss</span>
      </div>
      <div class="stat-row"><span class="k">Cooldown</span><span class="v">16h por combate</span></div>
      <div class="stat-row"><span class="k">Vida</span><span class="v">${mob ? Math.ceil(mob.hp) + " / " + mob.maxHp : "derrotado"}</span></div>
      <div class="stat-row"><span class="k">Sprite</span><span class="v">Cave Rat</span></div>`;
    return;
  }
  if (!p.hunt) {
    el.innerHTML = `<div class="dim small center" style="padding:8px">Nenhuma caçada ativa</div>`;
    return;
  }
  const hu = GAMEDATA.hunts[p.hunt];
  const est = huntEstimate(p, hu);
  const risk = huntRisk(p, hu);
  const mode = G.combat ? G.combat.instanceMode : (p.instanceMode || "non-pvp");
  el.innerHTML = `
    <div class="row mb4" style="justify-content:space-between">
      <b style="color:#d4af37">${hu.name}</b>
      <span class="risk ${risk.cls}">${risk.txt}</span>
    </div>
    <div class="stat-row"><span class="k">Instância</span><span class="v" style="color:${mode === "pvp" ? "#ff9a6a" : "#9ce84a"}">${mode}</span></div>
    ${mode === "pvp" ? `<div class="stat-row"><span class="k">Bônus PvP</span><span class="v">+25% exp/loot/skills · raidável</span></div>` : ""}
    <div class="stat-row"><span class="k">XP / hora</span><span class="v" style="color:#9ce84a">${fmt(est.exp * (mode === "pvp" ? 1.25 : 1))}</span></div>
    <div class="stat-row"><span class="k">Gold / hora</span><span class="v gold-txt">${fmt(est.gold * (mode === "pvp" ? 1.25 : 1))}</span></div>
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
    p.instanceMode = p.instanceMode || "non-pvp";
    G.combat = newCombat(p, p.hunt, p.instanceMode);
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
  $("#btn-cyclo").addEventListener("click", () => openCyclopedia());
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
  initPanelCollapse();
  $("#btn-equip").addEventListener("click", () => {
    const ch = autoEquip(p);
    if (!ch.length) { toast("Já está com o melhor equipamento"); return; }
    for (const c of ch) addLog("info", `Equipou <b>${itemName(c.item)}</b>`);
    renderAll();
  });
  $("#btn-lootpouch-config").addEventListener("click", openLootPouchConfigModal);
  $("#btn-pouch-sell-all").addEventListener("click", () => {
    const r = sellAllPouch(p);
    if (!r.kinds) { toast("Nada para vender na Loot Pouch."); return; }
    toast(`Loot Pouch vendida por <b>${fmtFull(r.gold)} gp</b>`);
    renderAll();
  });
  $("#btn-switch").addEventListener("click", openCharacterModal);
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Apagar o personagem e recomeçar? Isso não pode ser desfeito."))
      wipeSave();
  });
  $("#heal-at").addEventListener("input", (e) => {
    p.config.healAt = parseInt(e.target.value, 10);
    p.config.healSpellAt = p.config.healAt;
    p.config.healItemAt = p.config.healAt;
    $("#heal-at-val").textContent = p.config.healAt + "%";
    renderHelper(p);
  });
  $("#cfg-runes").addEventListener("change", (e) => {
    p.config.useRunes = e.target.checked;
  });
  $("#cfg-equip").addEventListener("change", (e) => {
    p.config.autoEquip = e.target.checked;
  });
  $("#cfg-spell").addEventListener("change", (e) => {
    p.config.spellAttack = e.target.checked;
  });
  $("#bar-mode").addEventListener("change", (e) => {
    p.config.barMode = e.target.value;
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
  $("#cfg-equip").checked = p.config.autoEquip;
  $("#cfg-spell").checked = p.config.spellAttack;
  $("#bar-mode").value = p.config.barMode || "bars";
  $("#loot-filter").value = p.config.lootFilter;
}

/* ------------------------------------------------------------ personagens */
/* Kit inicial: o mesmo que o Canary entrega em Dawnport ao escolher a
 * vocacao (dawnport_vocation_trial.lua). Antes todo mundo comecava com
 * club + wooden shield, o que nao existe no servidor e ignorava que cada
 * vocacao ganha uma arma propria:
 *
 *   sorcerer  The Scorcher + spellbook of the novice
 *   druid     The Chiller  + spellbook of the novice
 *   paladin   bow + quiver + 100 simple arrows
 *   knight    dagger + wooden shield
 *   monk      simple jo staff
 *
 * Todos recebem leather helmet, coat, leather legs e leather boots, mais as
 * potions e runas da vocacao. giveStartingItems (js/supplies.js) le esses
 * dados; aqui ficam so os ajustes que o motor do jogo precisa. */
function giveStarterKit(p) {
  if (typeof giveStartingItems === "function") {
    giveStartingItems(p);
  } else {
    // fallback se supplydata.js nao carregou
    addItem(p, "club", 1);
    addItem(p, "wooden-shield", 1);
  }
  p.gold = Math.max(0, p.gold || 0);
  autoEquip(p);
  if (p.voc === "paladin") {
    // paladino sai de bow: o quiver ja vem com simple arrow selecionada
    if (!p.equip.ammo) setActiveAmmo(p, "simple-arrow");
    if (!p.equip.weapon && GAMEDATA.items["bow"]) {
      p.equip.weapon = { item: "bow", count: 1 };
    }
  }
  return p;
}

function createCharacter(name, voc, sex) {
  const p = newPlayer(name, voc, sex);
  giveStarterKit(p);
  normalizePlayer(p);
  saveCharacterToRoster(p);
  return p;
}

/* Desenha o retrato de cada personagem na lista, com o outfit atual dele.
   Os sprites podem ainda estar carregando, então tenta de novo por alguns frames. */
function paintCharPortraits(chars, tries) {
  tries = tries === undefined ? 24 : tries;
  let missing = false;
  for (const c of chars) {
    const box = document.querySelector(`[data-portrait="${c.id}"]`);
    if (!box || box.dataset.done) continue;
    const url = OutfitRenderer.preview(c, "s");
    if (url) {
      box.innerHTML = `<img src="${url}" alt="">`;
      box.dataset.done = "1";
    } else {
      missing = true;
    }
  }
  if (missing && tries > 0)
    setTimeout(() => paintCharPortraits(chars, tries - 1), 90);
}

/* -------------------------------------------------- change outfit */
function openOutfitModal() {
  const p = G.p;
  ensureOutfit(p);
  // trabalha numa cópia: só aplica ao confirmar
  const draft = { type: p.outfit.type, colors: p.outfit.colors.slice() };
  const PARTS = [["Cabeça", 0], ["Corpo", 1], ["Pernas", 2], ["Pés", 3]];
  let part = 0;
  let dir = "s";

  const render = () => {
    const fake = { sex: p.sex, voc: p.voc, outfit: draft };
    const o = playerOutfit(fake);
    const url = OutfitRenderer.preview(fake, dir);
    $("#outfit-preview").innerHTML = url
      ? `<img src="${url}" alt="">`
      : `<div class="tiny dim">carregando…</div>`;
    $("#outfit-name").textContent = (OUTFIT_TYPES.find((t) => t.id === draft.type) || {}).name || draft.type;
    $$("#outfit-types [data-otype]").forEach((b) =>
      b.classList.toggle("primary", b.dataset.otype === draft.type));
    $$("#outfit-parts [data-opart]").forEach((b) =>
      b.classList.toggle("primary", +b.dataset.opart === part));
    $$("#outfit-palette [data-ocolor]").forEach((s) =>
      s.classList.toggle("sel", +s.dataset.ocolor === draft.colors[part]));
    if (!url) setTimeout(render, 120);
  };

  $("#modal-body").innerHTML = `
    <div class="panel-title">Change Outfit
      <span style="flex:1"></span><button class="sm" id="outfit-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="row mb8" style="gap:12px;align-items:flex-start">
        <div>
          <div id="outfit-preview" class="outfit-preview"></div>
          <div class="row mt4" style="gap:3px;justify-content:center">
            ${[["n", "↑"], ["w", "←"], ["s", "↓"], ["e", "→"]].map(([d, a]) =>
              `<button class="sm" data-odir="${d}">${a}</button>`).join("")}
          </div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="small dim mb4">Outfit</div>
          <div class="row wrap mb4" id="outfit-types" style="gap:4px">
            ${OUTFIT_TYPES.map((t) =>
              `<button class="sm" data-otype="${t.id}">${t.name}</button>`).join("")}
          </div>
          <div class="tiny dim">Atual: <b id="outfit-name" style="color:#d4af37"></b></div>
          <div class="small dim mt8 mb4">Parte a colorir</div>
          <div class="row wrap" id="outfit-parts" style="gap:4px">
            ${PARTS.map(([n, i]) =>
              `<button class="sm" data-opart="${i}">${n}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="small dim mb4">Cor</div>
      <div id="outfit-palette" class="outfit-palette mb8">
        ${OUTFIT_PALETTE.map((c, i) =>
          `<span class="swatch" data-ocolor="${i}" style="background:${c}" title="cor ${i}"></span>`).join("")}
      </div>
      <div class="row" style="gap:6px">
        <button class="primary" style="flex:1" id="outfit-save">Salvar outfit</button>
        <button style="flex:none" id="outfit-cancel">Cancelar</button>
      </div>
    </div>`;
  $("#modal").classList.add("show");

  $$("#outfit-types [data-otype]").forEach((b) => b.addEventListener("click", () => {
    draft.type = b.dataset.otype; render();
  }));
  $$("#outfit-parts [data-opart]").forEach((b) => b.addEventListener("click", () => {
    part = +b.dataset.opart; render();
  }));
  $$("#outfit-palette [data-ocolor]").forEach((s) => s.addEventListener("click", () => {
    draft.colors[part] = +s.dataset.ocolor; render();
  }));
  $$("#modal-body [data-odir]").forEach((b) => b.addEventListener("click", () => {
    dir = b.dataset.odir; render();
  }));
  const close = () => openCharacterModal();
  $("#outfit-close").addEventListener("click", close);
  $("#outfit-cancel").addEventListener("click", close);
  $("#outfit-save").addEventListener("click", () => {
    p.outfit = { type: draft.type, colors: draft.colors.slice() };
    save();
    toast("Outfit atualizado!");
    renderAll();
    openCharacterModal();
  });
  render();
}

function openCharacterModal() {
  save();
  const chars = getCharacters();
  const currentId = G.p ? characterId(G.p) : localStorage.getItem(ACTIVE_CHARACTER_KEY);
  $("#modal-body").innerHTML = `
    <div class="panel-title">Trocar personagem
      <span style="flex:1"></span><button class="sm" id="char-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="small dim mb4">Personagens salvos neste navegador</div>
      <div class="list mb8" style="max-height:260px">
        ${chars.length ? chars.map((p) => `
          <div class="shop-row">
            <div class="char-portrait" data-portrait="${p.id}"></div>
            <div style="flex:1;min-width:0">
              <div class="small" style="color:${p.id === currentId ? "#9ce84a" : "#c8c0a8"}">
                ${p.name}${p.id === currentId ? " · atual" : ""}</div>
              <div class="tiny dim">${vocationName(p)} · nível ${p.level} · ${fmtFull(p.gold)} gp</div>
            </div>
            <button class="sm primary" data-load-char="${p.id}" ${p.id === currentId ? "disabled" : ""}>Entrar</button>
          </div>`).join("") : `<div class="dim small center" style="padding:12px">Nenhum personagem salvo.</div>`}
      </div>
      <button class="full mb8" id="char-outfit">👕 Change Outfit</button>
      <button class="full mb8" id="char-appearance">🐴 Aparências (addons e montarias)</button>
      <button class="primary full mb8" id="char-new-toggle">Criar novo personagem</button>
      <div id="char-new-box" class="panel-inset" style="display:none;padding:8px">
        <div class="field"><label>Nome</label><input id="new-char-name" maxlength="20" autocomplete="off"></div>
        <div class="field"><label>Sexo</label><select id="new-char-sex"><option value="male">Masculino</option><option value="female">Feminino</option></select></div>
        <div class="field"><label>Vocação</label><select id="new-char-voc">
          <option value="knight">Knight</option><option value="paladin">Paladin</option>
          <option value="druid">Druid</option><option value="sorcerer">Sorcerer</option>
          <option value="monk">Monk</option>
        </select></div>
        <button class="primary full" id="char-create">Criar e entrar</button>
      </div>
      <div class="tiny dim mt8">Ao trocar/criar personagem a página recarrega para iniciar a sessão limpa.</div>
    </div>`;
  $("#modal").classList.add("show");
  paintCharPortraits(chars);
  $("#char-close").addEventListener("click", () => $("#modal").classList.remove("show"));
  $("#char-outfit").addEventListener("click", () => openOutfitModal());
  // atalho direto para a aba de aparencias da Cyclopedia, onde ficam os
  // 252 visuais, os addons e as 236 montarias
  $("#char-appearance").addEventListener("click", () => {
    CYCLO.sub = "appearance";
    openCyclopedia("character");
  });
  $$("#modal-body [data-load-char]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.loadChar;
    const roster = readRoster();
    if (!roster[id] || !roster[id].p) { toast("Personagem não encontrado."); return; }
    save();                                   // salva o char atual antes de sair
    localStorage.setItem(ACTIVE_CHARACTER_KEY, id);
    // marca para entrar direto no personagem escolhido após o reload
    sessionStorage.setItem(AUTOLOGIN_KEY, id);
    location.reload();
  }));
  $("#char-new-toggle").addEventListener("click", () => {
    const box = $("#char-new-box");
    box.style.display = box.style.display === "none" ? "" : "none";
  });
  $("#char-create").addEventListener("click", () => {
    const name = ($("#new-char-name").value || "").trim();
    if (name.length < 2) { toast("Digite um nome válido"); return; }
    const np = createCharacter(name, $("#new-char-voc").value, $("#new-char-sex").value);
    sessionStorage.setItem(AUTOLOGIN_KEY, characterId(np));
    location.reload();
  });
}

/* ------------------------------------------------------------ login */
function initLogin() {
  const saved = load();

  // veio de "Trocar personagem"/"Criar e entrar": entra direto, sem passar
  // pela tela de criação.
  let autoId = null;
  try { autoId = sessionStorage.getItem(AUTOLOGIN_KEY); } catch (e) { autoId = null; }
  if (autoId) {
    try { sessionStorage.removeItem(AUTOLOGIN_KEY); } catch (e) {}
    const roster = readRoster();
    if (roster[autoId] && roster[autoId].p) {
      const target = normalizePlayer(roster[autoId].p);
      target.id = autoId;
      localStorage.setItem(ACTIVE_CHARACTER_KEY, autoId);
      startGame(target);
      return;
    }
  }

  if (saved) {
    $("#continue-box").style.display = "";
    $("#saved-name").textContent = saved.name;
    $("#saved-info").textContent =
      `${vocationName(saved)} · nível ${saved.level}`;
    $("#btn-continue").addEventListener("click", () => startGame(saved));
  }

  let selVoc = "knight", selSex = "male";
  const vocs = ["knight", "paladin", "druid", "sorcerer", "monk"];
  const outfitOf = (v, s) => {
    const map = { knight: "knight", paladin: "hunter", druid: "summoner",
                  sorcerer: "mage", monk: "monk" };
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
    const p = createCharacter(name, selVoc, selSex);
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
