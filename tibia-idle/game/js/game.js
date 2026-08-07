/*
 * game.js — loop principal, save/load, ganhos offline e bootstrap
 */
"use strict";

// DEBUG temporário: contadores de procs da Exaltation Forge na tela
window.FORGE_DEBUG_COUNT = { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };

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
    // MODO ONLINE: envia o save para a API (MySQL) do personagem da conta
    if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
        typeof accountSaveCharacter === "function") {
      const tok = sessionToken();
      const cid = sessionCharId();
      if (tok && cid) {
        accountSaveCharacter(tok, cid, G.p).catch(() => {});
      }
    }
    return true;
  } catch (e) {
    console.warn("falha ao salvar", e);
    return false;
  }
}

/* ---------- sessão online (token + personagem da conta) ---------- */
function sessionToken() {
  try { return sessionStorage.getItem("tibia-idle-token") || ""; } catch (e) { return ""; }
}
function sessionCharId() {
  try { return sessionStorage.getItem("tibia-idle-char") || ""; } catch (e) { return ""; }
}
function sessionAccount() {
  try {
    const raw = sessionStorage.getItem("tibia-idle-account");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
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
  // Migracao: o quiver tinha um slot proprio inventado. No Tibia ele ocupa a
  // mao secundaria, entao saves antigos precisam mover o item para `shield`
  // e apagar o campo obsoleto, senao o personagem fica com dois quivers.
  if (p.equip && p.equip.quiver) {
    if (!p.equip.shield ||
        (GAMEDATA.items[p.equip.shield.item] || {}).t === "quiver") {
      p.equip.shield = p.equip.quiver;
    } else {
      // ja tinha escudo de verdade: o quiver volta para a mochila
      p.bag = p.bag || {};
      p.bag[p.equip.quiver.item] = (p.bag[p.equip.quiver.item] || 0) + 1;
    }
    delete p.equip.quiver;
  }
  p.config = Object.assign({
    healAt: 90,
    healSpellAt: 90,
    healItemAt: 60,
    manaAt: 50,
    healSpell: "",
    healSupply: "",
    manaSupply: "mana-potion",
    useRunes: true,
    autoRestock: false,
    manaTrain: null,
    autoConjure: null,
    attackMode: "chase",
    kiteDistance: 3,
    shooterType: "auto",
    shooterSpell: "",
    shooterRune: "",
    hasteSpell: "",           // magia de velocidade escolhida no helper (vazia = nao usa)
    missionCollapsed: false,
    noPotions: false,          // Helper: "NÃO USAR POTIONS"
    pouchAutoSell: false,     // Loot Pouch: autoseller ligado/desligado
    pouchAutoSellPct: 80,     // Loot Pouch: % de enchimento p/ vender tudo
    spellAttack: true,
    autoRetreat: true,
    barMode: "bars",
    lootFilter: "all",
    refillArrow: "",
    refillBolt: "",
  }, p.config || {});
  // Migracao: o "mystic-dust" verde (poeira mistica criada antes do Canary)
  // foi removido. Saves antigos convertem o que tinham na lootPouch/mochila
  // para o Dust da Exaltation Forge (p.dust), respeitando o dustLimit.
  if (p.lootPouch && p.lootPouch["mystic-dust"]) {
    p.dust = Math.min(p.dustLimit || 100, (p.dust || 0) + p.lootPouch["mystic-dust"]);
    delete p.lootPouch["mystic-dust"];
  }
  if (p.bag && p.bag["mystic-dust"]) {
    p.dust = Math.min(p.dustLimit || 100, (p.dust || 0) + p.bag["mystic-dust"]);
    delete p.bag["mystic-dust"];
  }
  p.config.autoRestock = false;
  p.config.healSpellAt = Math.max(1, Math.min(99, parseInt(p.config.healSpellAt === undefined ? p.config.healAt : p.config.healSpellAt, 10) || 90));
  p.config.healItemAt = Math.max(1, Math.min(99, parseInt(p.config.healItemAt === undefined ? p.config.healAt : p.config.healItemAt, 10) || 60));
  p.config.healAt = Math.max(p.config.healSpellAt, p.config.healItemAt);
  p.config.kiteDistance = Math.max(1, Math.min(5, parseInt(p.config.kiteDistance, 10) || 3));
  // paladino sempre tem uma munição padrão selecionada
  if (p.voc === "paladin" && !p.config.refillArrow && !p.config.refillBolt)
    p.config.refillArrow = "arrow";
  p.supplies = p.supplies || {};
  // Migracao do update 15.25.3a4a52: mana fluid foi REMOVIDO do jogo.
  // Cargas guardadas viram mana-potion (mesma faixa de restauracao) e a
  // selecao do Helper passa a apontar para ela.
  if (Object.prototype.hasOwnProperty.call(p.supplies, "mana-fluid")) {
    const q = p.supplies["mana-fluid"] || 0;
    if (q > 0) {
      p.supplies["mana-potion"] = (p.supplies["mana-potion"] || 0) + q;
    }
    delete p.supplies["mana-fluid"];
  }
  if (p.config.manaSupply === "mana-fluid") p.config.manaSupply = "mana-potion";
  if (!Object.prototype.hasOwnProperty.call(p.supplies, "mana-potion")) p.supplies["mana-potion"] = 0;
  if (p.config.manaSupply === undefined) p.config.manaSupply = "mana-potion";
  // Saves antigos que selecionaram algo que deixou de existir nao podem
  // quebrar o motor de cura/mana.
  if (p.config.manaSupply && typeof SUPPLIES !== "undefined" && !SUPPLIES[p.config.manaSupply])
    p.config.manaSupply = "";
  if (p.config.healSupply && typeof SUPPLIES !== "undefined" && !SUPPLIES[p.config.healSupply])
    p.config.healSupply = "";
  p.bag = p.bag || {};
  p.bagSlots = p.bagSlots || 8;
  p.itemInstances = Array.isArray(p.itemInstances) ? p.itemInstances : [];
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
  // ultima instancia escolhida no modal da hunt (pre-selecao de UI)
  p.lastInstanceChoice = p.lastInstanceChoice || null;
  p.ammo = p.ammo || {};
  p.upgrades = p.upgrades || {};
  p.imbuements = p.imbuements || {};
  p.dummies = p.dummies || {};
  p.conditions = p.conditions || {};
  p.buffs = p.buffs || {};
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  if (typeof ensurePrey === "function") ensurePrey(p);
  if (typeof ensureParty === "function") ensureParty(p);
  // Stances do update 15.25.3a4a52: posturas permanentes salvas junto ao
  // personagem (persistem apos logout, como no oficial).
  p.stances = p.stances || {};
  // Migracao: antes do 15.25 o Protector (utamo-tempo) era um BUFF
  // relancado pelo Helper. Vira stance ativa no save antigo.
  if (p.config.buff === "utamo-tempo") {
    p.stances["utamo-tempo"] = true;
    p.config.buff = null;
  }
  // Migracao: a Sharpshooter antiga (utito tempo san) foi SUBSTITUIDA
  // pela stance utori con. Se o jogador a usava como magia de suporte
  // recorrente, a stance equivalente ja nasce ligada.
  const mencionavaSharpshooter =
    p.config.buff === "utito-tempo-san" ||
    p.config.shooterSpell === "utito-tempo-san" ||
    (Array.isArray(p.config.attackSpells) &&
     p.config.attackSpells.indexOf("utito-tempo-san") !== -1) ||
    (Array.isArray(p.config.combo) && p.config.combo.some(
      (x) => x && x.kind === "spell" && x.id === "utito-tempo-san"));
  if (p.config.buff === "utito-tempo-san") p.config.buff = null;
  if (p.config.shooterSpell === "utito-tempo-san") p.config.shooterSpell = "";
  if (mencionavaSharpshooter && p.voc === "paladin" && p.level >= 20) {
    p.stances["utori-con"] = true;
  }
  // Magias removidas/substituidas pelo update saem das listas ofensivas
  // (combo e selecao antiga do Helper), senao o motor tenta lancar
  // fantasma. Stances nunca devem figurar como magia de rotacao.
  const REMOVIDAS_1525 = {
    "utito-tempo-san": 1,   // virou stance utori con
    "uteta-tio": 1,         // Mentor Other removida pelo update
  };
  if (Array.isArray(p.config.attackSpells)) {
    p.config.attackSpells = p.config.attackSpells.filter(
      (id) => !REMOVIDAS_1525[id] &&
              !(typeof SPELLS !== "undefined" && SPELLS[id] && SPELLS[id].stance));
  }
  if (Array.isArray(p.config.combo)) {
    for (let i = 0; i < p.config.combo.length; i++) {
      const slot = p.config.combo[i];
      if (slot && slot.kind === "spell" &&
          (REMOVIDAS_1525[slot.id] ||
           (typeof SPELLS !== "undefined" && SPELLS[slot.id] && SPELLS[slot.id].stance))) {
        p.config.combo[i] = null;
      }
    }
  }
  // Monk: harmonia acumulada e santuarios da quest "The Way of the Monk".
  // Saves feitos antes do sistema de Mantra nao tem esses campos.
  // barra de combo: cria a estrutura e migra a config antiga do shooter
  if (typeof ensureCombo === "function") ensureCombo(p);
  if (typeof migrateComboFromShooter === "function") migrateComboFromShooter(p);
  // helper de rings/amulets e Magic Shield (saves antigos nascem desligados)
  if (typeof ensureAccessoryConfig === "function") ensureAccessoryConfig(p);
  p.harmony = Math.max(0, Math.min(5, p.harmony || 0));
  p.monkShrines = Math.max(0, Math.min(3, p.monkShrines || 0));
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

  // loot vai para supplies, loot pouch ou municao — TODO item (equipamento
  // incluso) cai na pouch, regra da casa. Moedas (platinum/crystal) são
  // convertidas direto em gold.
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
    .map((s) => `<div class="inv-item ${itemClsBorder(s)}" title="${itemName(s)}">
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
  // Missão da Timira the Many-Headed: matar 25 Naga Archer, 25 Naga Warrior
  // e 25 Makara no mapa das Nagas. Completar a missão LIBERA o cooldown do
  // boss (bossState("timira-the-many-headed").lastFight = 0) — para matá-la
  // de novo é preciso refazer a missão (o kill do boss zera o progresso).
  "marapur-nagas": {
    title: "Missão: Timira the Many-Headed",
    tasks: [
      { monster: "naga-archer", target: 25, reward: { supplies: [{ slug: "strong-health-potion", count: 5 }] } },
      { monster: "naga-warrior", target: 25, reward: { supplies: [{ slug: "strong-mana-potion", count: 5 }] } },
      { monster: "makara", target: 25, reward: { supplies: [{ slug: "ultimate-health-potion", count: 2 }] } },
    ],
    completeReward: { gold: 5000, items: [{ slug: "small-diamond", count: 2 }] },
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
  // recompensas (equipamento incluso) caem na loot pouch, regra da casa:
  // ela nao tem limite, entao nao existe mais "mochila cheia" em missao.
  for (const r of reward.items || []) {
    addLootPouch(p, r.slug, r.count || 1);
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
      grantMissionReward(p, task.reward);
      st.claimed[task.monster] = true;
      addLog("level", `Missão: matou ${task.target}x <b>${GAMEDATA.monsters[task.monster] ? GAMEDATA.monsters[task.monster].name : task.monster}</b>. Recompensa: ${rewardText(task.reward)}.`);
      toast(`Missão concluída: <b>${rewardText(task.reward)}</b>`, "level");
    }
  }
  const all = def.tasks.every((t) => st.claimed[t.monster]);
  if (all && !st.completeClaimed) {
    grantMissionReward(p, def.completeReward);
    st.completeClaimed = true;
    addLog("level", `Missão de <b>${GAMEDATA.hunts[huntId].name}</b> completa. Recompensa final: ${rewardText(def.completeReward)}.`);
    toast(`Missão completa! <b>${rewardText(def.completeReward)}</b>`, "level");
  }
  // Timira: completar a missão das Nagas LIBERA o cooldown do boss — pode
  // matá-la de novo sem esperar as 16h (a missão precisa ser refeita, pois
  // o kill do boss zera o progresso — ver startBoss).
  if (huntId === "marapur-nagas" && all) {
    const tim = bossState(p, "timira-the-many-headed");
    if (tim.lastFight) {
      tim.lastFight = 0;
      addLog("level", "Timira the Many-Headed liberada! O cooldown foi zerado pela missão completa.");
      toast("Timira liberada! Missão completa zerou o cooldown.", "level");
    }
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
  // missão já finalizada: some de vez da tela
  G.p.missionsDone = G.p.missionsDone || {};
  if (G.p.missionsDone[huntId]) { box.style.display = "none"; return; }
  const st = missionState(G.p, huntId);
  const collapsed = !!G.p.config.missionCollapsed;
  const totalDone = def.tasks.filter((t) => (st.progress[t.monster] || 0) >= t.target).length;
  const completa = totalDone >= def.tasks.length;
  box.style.display = "block";
  // colapsada: só o cabeçalho fica visível — a classe remove o fundo preto
  // que ficava cobrindo o jogo atrás do painel
  box.classList.toggle("collapsed", collapsed);
  box.innerHTML = `
    <div class="mission-head" id="mission-toggle">
      <span>${collapsed ? "▸" : "▾"}</span><span>${def.title}</span>
      <span class="spacer"></span><span>${totalDone}/${def.tasks.length}</span>
      ${completa ? `<button class="sm primary" id="mission-finish" title="Encerrar a missão e remover do painel">FINALIZAR</button>` : ""}
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
      ${completa ? `<div class="mission-reward" style="color:#9ce84a;margin-top:6px">✅ Missão completa! Clique em FINALIZAR para removê-la do painel.</div>` : ""}
    </div>`}`;
  // Delegação de eventos no CONTAINER (uma vez só): o clique continua
  // funcionando mesmo quando renderAll() re-renderiza o conteúdo durante
  // a caçada (cada kill recria o HTML interno — antes o listener morria
  // junto e o minimizar parava de responder).
  if (!box._missionBound) {
    box._missionBound = true;
    box.addEventListener("click", (e) => {
      // FINALIZAR vem ANTES do toggle: o botão fica dentro do cabeçalho
      // (que é o #mission-toggle), então a checagem precisa ser primeiro
      if (e.target.closest && e.target.closest("#mission-finish")) {
        G.p.missionsDone = G.p.missionsDone || {};
        G.p.missionsDone[huntId] = true;
        addLog("info", `Missão <b>${def.title}</b> finalizada.`);
        renderMission();
      } else if (e.target.closest && e.target.closest("#mission-toggle")) {
        G.p.config.missionCollapsed = !G.p.config.missionCollapsed;
        renderMission();
      }
    });
  }
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
      // quiver de boss: nao existe na loja, so cai aqui
      { item: "jungle-quiver", chance: 4, max: 1 },
    ],
  },
  "goshnar-s-greed": { id:"goshnar-s-greed", name:"Goshnar's Greed", title:"Boss de Dark Thais", hunt:"dark-thais", baseMonster:"many-faces", sprite:"goshnar-s-greed", hp:550000, exp:350000, damage:1800, armor:120, defense:110, cooldown:BOSS_COOLDOWN, requirement:{level:550,text:"Requer nível 550+ (Dark Thais)"}, loot:[{item:"bag-you-desire",chance:10,max:1},{item:"crystal-coin",chance:100,max:20}] },
  // Ferumbras Mortal Shell — boss da Ferumbras Ascendant (Canary 15.x):
  // 300.000 HP, 2.000.000 exp, invoca 3 Demons, resist 65% em quase tudo
  // (menos físico/drown), loot oficial do boss (ids traduzidos do items.xml).
  // Timira the Many-Headed — boss das Nagas (Canary 15.x): 75.000 HP,
  // 45.500 exp, mitigação 2.07, resist 10% em energy/fire/ice/death.
  // Requisito: missão do mapa das Nagas (25 naga archer + 25 naga warrior +
  // 25 makara). Ao completar a missão o cooldown de 16h é ZERADO; ao matá-la
  // a missão volta a zero (precisa refazer para liberar de novo).
  "timira-the-many-headed": {
    id: "timira-the-many-headed",
    name: "Timira the Many-Headed",
    title: "Boss das Nagas (Marapur)",
    hunt: "marapur-nagas",
    baseMonster: "timira-the-many-headed",
    sprite: "timira-the-many-headed",
    hp: 75000,
    exp: 45500,
    damage: 600,
    armor: 82,
    defense: 60,
    speed: 0.00007,
    requirement: {
      mission: "marapur-nagas",
      text: "Matar 25 Naga Archer, 25 Naga Warrior e 25 Makara no mapa das Nagas",
    },
    cooldown: BOSS_COOLDOWN,
    // loot: usa o do canary (merge do monsterdata na baseMonster)
  },
  "ferumbras-mortal-shell": {
    id: "ferumbras-mortal-shell",
    name: "Ferumbras Mortal Shell",
    title: "Boss da Ferumbras Ascendant",
    hunt: "dt-seal",
    baseMonster: "demon",
    // looktype 229 do Canary = a forma do Ferumbras (não é um demon):
    // sprite própria extraída do DAT 15.x (assets/mob/ferumbras-mortal-shell.png)
    sprite: "ferumbras-mortal-shell",
    // stats DIRETOS do canary (newBossCombat usa hp/exp quando presentes)
    hp: 300000,
    exp: 2000000,
    damage: 500,
    armor: 100,
    defense: 120,
    speed: 0.00009,
    requirement: { level: 250, text: "Requer nível 250+ (Ferumbras Ascendant)" },
    cooldown: BOSS_COOLDOWN,
    loot: [
      { item: "gold-coin", chance: 100, max: 100 },
      { item: "platinum-coin", chance: 100, max: 25 },
      { item: "silver-token", chance: 100, max: 3 },
      { item: "small-sapphire", chance: 10, max: 10 },
      { item: "small-emerald", chance: 10, max: 10 },
      { item: "small-amethyst", chance: 10, max: 10 },
      { item: "small-diamond", chance: 10, max: 10 },
      { item: "small-topaz", chance: 10, max: 10 },
      { item: "white-pearl", chance: 10, max: 5 },
      { item: "black-pearl", chance: 10, max: 5 },
      { item: "red-gem", chance: 1, max: 1 },
      { item: "blue-gem", chance: 0.8, max: 1 },
      { item: "green-gem", chance: 4, max: 1 },
      { item: "emerald-bangle", chance: 1, max: 1 },
      { item: "rift-tapestry", chance: 3, max: 1 },
      { item: "golden-armor", chance: 0.8, max: 1 },
      { item: "magic-plate-armor", chance: 0.4, max: 1 },
      { item: "demon-shield", chance: 0.8, max: 1 },
      { item: "phoenix-shield", chance: 0.8, max: 1 },
      { item: "mastermind-shield", chance: 0.6, max: 1 },
      { item: "great-shield", chance: 0.1, max: 1 },
      { item: "great-axe", chance: 0.7, max: 1 },
      { item: "demonrage-sword", chance: 0.8, max: 1 },
      { item: "chaos-mace", chance: 0.8, max: 1 },
      { item: "bloody-edge", chance: 0.8, max: 1 },
      { item: "nightmare-blade", chance: 0.6, max: 1 },
      { item: "abyss-hammer", chance: 0.8, max: 1 },
      { item: "jade-hammer", chance: 0.8, max: 1 },
      { item: "havoc-blade", chance: 0.8, max: 1 },
      { item: "impaler", chance: 0.8, max: 1 },
      { item: "berserker", chance: 0.8, max: 1 },
      { item: "skullcrusher", chance: 0.3, max: 1 },
      { item: "divine-plate", chance: 0.8, max: 1 },
      { item: "velvet-mantle", chance: 0.3, max: 1 },
      { item: "greenwood-coat", chance: 0.4, max: 1 },
      { item: "lightning-legs", chance: 0.8, max: 1 },
      { item: "glacier-kilt", chance: 0.8, max: 1 },
      { item: "magma-legs", chance: 0.8, max: 1 },
      { item: "emerald-sword", chance: 0.4, max: 1 },
      { item: "rift-bow", chance: 0.5, max: 1 },
      { item: "rift-crossbow", chance: 0.5, max: 1 },
      { item: "demonwing-axe", chance: 0.3, max: 1 },
      { item: "obsidian-truncheon", chance: 0.4, max: 1 },
      { item: "ornamented-axe", chance: 0.4, max: 1 },
      { item: "queen-s-sceptre", chance: 0.8, max: 1 },
      { item: "boots-of-homecoming", chance: 0.8, max: 1 },
      { item: "ferumbras-staff", chance: 0.8, max: 1 },
      { item: "ferumbras-amulet", chance: 0.8, max: 1 },
      { item: "death-gaze", chance: 0.1, max: 1 },
      { item: "ferumbras-hat", chance: 0.1, max: 1 },
      { item: "gold-ingot", chance: 0.8, max: 1 },
    ],
  },
};

/* Quivers que so vem de boss (QUIVER_DEFS[x].drop). Cada um fica ligado ao
 * boss que o entrega, para o painel dizer onde consegui-lo em vez de so
 * mostrar "indisponivel". Enquanto o jogo tiver poucos bosses, os de nivel
 * mais alto ficam anotados como conteudo futuro. */
const QUIVER_DROPS = {
  "jungle-quiver": { boss: "the-monster", nome: "The Monster" },
  "candy-coated-quiver": { boss: null, nome: "boss de nível 200" },
  "eldritch-quiver": { boss: null, nome: "boss de nível 250" },
  "naga-quiver": { boss: null, nome: "boss de nível 250" },
  "alicorn-quiver": { boss: null, nome: "boss de nível 400" },
};

/* Onde conseguir um quiver de drop (texto curto para a UI) */
function quiverDropSource(slug) {
  const d = QUIVER_DROPS[slug];
  if (!d) return "";
  return d.boss ? "cai de " + d.nome : "drop de " + d.nome;
}

function bossState(p, id) {
  p.bosses = p.bosses || {};
  if (!p.bosses[id]) p.bosses[id] = { lastFight: 0, kills: 0 };
  return p.bosses[id];
}

function bossReadyInfo(p, boss) {
  if (boss.requirement) {
    if (boss.requirement.level && p.level < boss.requirement.level)
      return { ok: false, reason: boss.requirement.text || ("Requer nível " + boss.requirement.level), left: 0 };
    if (boss.requirement.mission && !isMissionComplete(p, boss.requirement.mission))
      return { ok: false, reason: boss.requirement.text, left: 0 };
  }
  const st = bossState(p, boss.id);
  const left = Math.max(0, (st.lastFight || 0) + boss.cooldown - Date.now());
  if (left > 0) return { ok: false, reason: "Cooldown", left: left };
  return { ok: true, reason: "Disponível", left: 0 };
}

/* Loot real do boss: o BOSS_DEFS pode não ter `loot` (ex.: a Timira usa o
 * loot do monstro base). Antes isso quebrava o modal (boss.loot.map de
 * undefined) — por isso a Timira não abria. */
function bossLootReal(boss) {
  if (boss.loot && boss.loot.length) return boss.loot;
  const base = GAMEDATA.monsters[boss.baseMonster || boss.sprite || "cave-rat"];
  return (base && base.loot) || [];
}

function bossLootText(boss) {
  return bossLootReal(boss).map((l) =>
    `${l.chance}% ${l.max > 1 ? "até " + l.max + "x " : ""}${itemName(l.item)}`);
}

function renderBosses(p) {
  const el = $("#bosses");
  if (!el) return;
  el.innerHTML = `<div class="npc-quick boss-quick">${Object.keys(BOSS_DEFS).map((id) => {
    const b = BOSS_DEFS[id];
    const r = bossReadyInfo(p, b);
    return `<div class="npc-btn boss-btn ${r.ok ? "" : "locked"}" data-boss-info="${id}" title="${b.name} — ${r.left ? "Cooldown" : r.reason}">
      ${mobImg(b.sprite, 32)}
      <div class="nb">${b.name.split(" ")[0]}</div>
    </div>`;
  }).join("")}</div>`;
  $$("#bosses [data-boss-info]").forEach((btn) =>
    btn.addEventListener("click", () => openBossModal(btn.dataset.bossInfo)));
}

/* Stats do boss: diretos (hp/exp/damage/armor no BOSS_DEFS, como o
 * Ferumbras Mortal Shell) ou escalados do monstro base pelo mult. */
function bossStats(boss) {
  const base = GAMEDATA.monsters[boss.baseMonster || boss.sprite] ||
    GAMEDATA.monsters["cave-rat"];
  const mult = applyBossMultiplier(base, boss.mult || 10);
  return {
    hp: boss.hp || mult.hp,
    exp: boss.exp || mult.exp,
    damage: boss.damage || mult.damage,
    armor: boss.armor || mult.armor,
    defense: boss.defense || base.defense || 0,
  };
}

function openBossModal(id) {
  const boss = BOSS_DEFS[id];
  if (!boss) return;
  const ready = bossReadyInfo(G.p, boss);
  const st = bossState(G.p, id);
  // Drops do boss: sprites lado a lado (como o baiak-idle.com), simples e
  // sem poluição — nome + sprite + chance.
  const drops = bossLootReal(boss);
  $("#modal-body").innerHTML = `
    <div class="panel-title">
      ${mobImg(boss.sprite, 24)}
      ${boss.name} — <span class="dim" style="font-weight:normal">${boss.title}</span>
      <span style="flex:1"></span><button class="sm" id="boss-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="panel-inset mb8" style="padding:8px">
        <div class="stat-row"><span class="k">Requisito</span><span class="v">${boss.requirement ? boss.requirement.text : "—"}</span></div>
        <div class="stat-row"><span class="k">Disponibilidade</span><span class="v" style="color:${ready.ok ? "#9ce84a" : "#ff9a6a"}">${ready.left ? fmtTime(ready.left / 1000) : ready.reason}</span></div>
        <div class="stat-row"><span class="k">Vitórias</span><span class="v">${fmtFull(st.kills || 0)}</span></div>
      </div>
      <div class="small dim mb4">Drops — chance oficial do Canary</div>
      <div class="reward-grid mb8">
        ${drops.map((l) => `
          <div class="reward-item" title="${itemName(l.item)} — ${l.chance}%${l.max > 1 ? " · até " + l.max + "x" : ""}">
            ${itemImg(l.item)}
            <div class="tiny dim reward-name">${itemName(l.item)}</div>
            <div class="tiny" style="color:#ffd65a">${l.chance}%${l.max > 1 ? " · " + l.max + "x" : ""}</div>
          </div>`).join("")}
      </div>
      <button class="danger full" id="boss-fight" ${ready.ok ? "" : "disabled"}>FIGHT</button>
      <div class="tiny dim mt8">Ao terminar a luta, vencendo ou morrendo, você será teleportado para a cidade. O loot do boss vai para o 🎁 Reward Chest.</div>
    </div>`;
  $("#modal").classList.add("show");
  $("#boss-close").addEventListener("click", () => $("#modal").classList.remove("show"));
  $("#boss-fight").addEventListener("click", () => {
    $("#modal").classList.remove("show");
    startBoss(id);
  });
}

function startBoss(id, force) {
  window.FORGE_DEBUG_COUNT = { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
  const boss = BOSS_DEFS[id];
  if (!boss) return;
  // PARTY: membros (não líder) não podem entrar em boss por conta própria —
  // só o líder escolhe e leva a party (requisitos validados no server).
  // `force = true` é o FOLLOW (membro teleportado para a sala do líder).
  if (!force && typeof partyBlocksHunt === "function" && partyBlocksHunt()) {
    toast("Membros de party só podem estar na Cidade ou Área de Treino. O líder escolhe o boss.", "bad");
    return;
  }
  const ready = bossReadyInfo(G.p, boss);
  if (!ready.ok) { toast(ready.reason); return; }
  if (G.training) stopAcademy(false);
  if (G.combat) stopHunt();
  const st = bossState(G.p, id);
  st.lastFight = Date.now();
  // Timira: ao entrar no boss a missão das Nagas volta a zero — para matá-la
  // de novo é preciso refazer os 25/25/25 (completar a missão zera o CD).
  if (id === "timira-the-many-headed") {
    const mst = missionState(G.p, "marapur-nagas");
    mst.progress = {};
    mst.claimed = {};
    mst.completeClaimed = false;
  }
  G.p.hunt = null;
  G.p.instanceMode = "boss";
  G.combat = newBossCombat(G.p, boss);
  G.inCity = false;
  addLog("death", `Você entrou no boss <b>${boss.name}</b>. Cooldown iniciado: 16h.`);
  toast(`Boss: <b>${boss.name}</b>`, "death");
  // PARTY: líder entrou numa sala de boss -> o SERVIDOR valida os
  // requisitos (cooldown + missão) de TODOS os membros antes do follow.
  // Se alguém não puder, a party não entra (o servidor recusa o report).
  if (typeof partyReportZone === "function") {
    const info = { zone: "boss", boss: id, cooldownMs: boss.cooldown || 0 };
    // requisitos de missão (ex.: Timira -> 25 nagas) para validar membros
    if (boss.requirement && boss.requirement.mission) {
      info.mission = boss.requirement.mission;
      const mdef = missionForHunt(boss.requirement.mission);
      if (mdef && mdef.tasks) {
        info.missionTargets = {};
        for (const t of mdef.tasks) info.missionTargets[t.monster] = t.target;
      }
    }
    partyReportZone(info);
  }
  renderAll();
}

/* ------------------------------------------------------------ hunt */
function openInstanceModal(id) {
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  // lembra a ultima instancia escolhida e destaca no modal — facilita
  // repetir a mesma hunt sem ler os dois blocos de novo
  const ultima = G.p && G.p.lastInstanceChoice;
  const modo = (G.p && G.p.config && G.p.config.attackMode) || "chase";
  // v33: sem Chase/Stand — sempre STAND
  const modos = [["kiting", "Kiting"], ["box", "BOX"], ["safe", "SAFE"]];
  $("#modal-body").innerHTML = `
    <div class="panel-title">Escolha a instância — ${hu.name}</div>
    <div class="panel-body">
      <div class="small mb4" style="color:#d4af37;font-weight:bold">🎯 Modo de Hunt</div>
      <div class="row wrap mb8" style="gap:6px">
        ${modos.map(([mid, label]) =>
          `<button class="sm ${modo === mid ? "primary" : ""}" data-hunt-mode="${mid}" title="${
            mid === "box" ? "Formação tática por vocação (knight no melhor spot, RP nas retas, magos na área)"
            : mid === "safe" ? "Fica nos cantos da tela, longe da box, mas no range das spells"
            : ""}">${label}</button>`).join("")}
      </div>
      <div class="shop-row" style="align-items:flex-start">
        <div style="flex:1">
          <div class="small" style="color:#9ce84a">Instância non-pvp
            ${ultima === "non-pvp" ? `<span class="tiny dim">· última escolha</span>` : ""}</div>
          <div class="tiny dim">Ninguém pode te raidar. EXP, loot e skills normais.</div>
        </div>
        <button class="primary sm" data-instance="non-pvp">Entrar</button>
      </div>
      <div class="shop-row" style="align-items:flex-start">
        <div style="flex:1">
          <div class="small" style="color:#ff9a6a">Instância pvp
            ${ultima === "pvp" ? `<span class="tiny dim">· última escolha</span>` : ""}</div>
          <div class="tiny dim">Outros jogadores reais poderão te raidar e matar no online. EXP, loot e skills +25%. +0,5% de chance de monstro Influenced.</div>
        </div>
        <button class="danger sm" data-instance="pvp">Entrar</button>
      </div>
      <button class="full mt8" id="instance-cancel">Cancelar</button>
    </div>`;
  $("#modal").classList.add("show");
  // MODO DE HUNT: escolhido aqui vale para a hunt inteira (party inclusa)
  $$("#modal-body [data-hunt-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      if (G.p && G.p.config) G.p.config.attackMode = b.dataset.huntMode;
      openInstanceModal(id);   // re-renderiza destacando o escolhido
    }));
  $$("#modal-body [data-instance]").forEach((b) =>
    b.addEventListener("click", () => {
      $("#modal").classList.remove("show");
      startHunt(id, b.dataset.instance);
    }));
  $("#instance-cancel").addEventListener("click", () => $("#modal").classList.remove("show"));
}

function startHunt(id, instanceMode, force) {
  window.FORGE_DEBUG_COUNT = { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  // Trava de nível das áreas especiais (ex.: Ferumbras Ascendant = 250+)
  const min = hu.minLevel || (hu.cat === "ferumbras-ascendant" ? 250 : 0);
  if (min && G.p && G.p.level < min) {
    toast(`Área bloqueada: requer nível ${min}+.`, "bad");
    return;
  }
  // PARTY: membros (não líder) não podem entrar em hunt por conta própria —
  // só cidade/treino. O líder escolhe a hunt e leva a party junto (follow).
  // `force = true` é o FOLLOW (o membro é teleportado pelo servidor para a
  // MESMA instância do líder — não é escolha dele).
  if (!force && typeof partyBlocksHunt === "function" && partyBlocksHunt()) {
    toast("Membros de party só podem estar na Cidade ou Área de Treino. O líder escolhe a hunt.", "bad");
    return;
  }
  if (!instanceMode) { openInstanceModal(id); return; }
  if (G.training) stopAcademy(false);
  G.inCity = false;
  G.p.hunt = id;
  G.p.instanceMode = instanceMode;
  G.p.lastInstanceChoice = instanceMode;   // pre-seleciona no proximo modal
  // hunt com arena .otbm: carrega (fetch) e converte o mapa antes de
  // montar o combate; hunts em ascii respondem na hora (otbmhunt.js)
  huntMapFromOtbmAsync(hu, () => {
    G.combat = newCombat(G.p, id, instanceMode);
    spawnWave(G.combat, G.p);
    addLog("info", `Viajando para <b style="color:#d4af37">${hu.name}</b> · instância <b>${instanceMode}</b>`);
    toast(`Caçando em <b>${hu.name}</b> (${instanceMode})`);
    // PARTY: líder entrou num local de caça -> membros seguem p/ MESMA instância
    if (typeof partyReportZone === "function") {
      partyReportZone({ zone: "hunt", hunt: id, instance: instanceMode, otbm: hu.otbm || null });
    }
    renderAll();
  });
}

function stopHunt() {
  // PARTY COMBAT: salva TODOS os personagens da instância antes de sair
  // (hp/mana/exp de cada um vão para o roster)
  if (typeof partyCombatSaveAll === "function") partyCombatSaveAll();
  G.p.hunt = null;
  G.p.instanceMode = null;
  G.combat = null;
  G.inCity = true;
  addLog("info", "Voltou para a <b style='color:#ffe680'>Cidade de Thais</b>.");
  // ao chegar na cidade o char descansa: cura completa
  const m = maxStats(G.p);
  G.p.hp = m.hp; G.p.mp = m.mp;
  // PARTY: líder voltou para a safe zone -> limpa follows pendentes
  if (typeof partyReportZone === "function") partyReportZone({ zone: "city" });
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
  // PARTY: Área de Treino é zona permitida para convidar
  if (typeof partyReportZone === "function") partyReportZone({ zone: "training", training: "academy" });
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
  // PARTY: líder voltou para a safe zone
  if (typeof partyReportZone === "function") partyReportZone({ zone: "city" });
  renderAll();
}

/* ------------------------------------------------------------ eventos */
function drainEvents() {
  const c = G.combat;
  if (!c) return;
  const r = G.renderer;
  // Posição normalizada (0-1) de um evento: os eventos carregam a posição
  // REAL da entidade no canvas (player ou mob, que andam pelo grid do
  // mapa). A fórmula antiga (0.42 + x*0.5) era do campo fixo e deslocava
  // os floaters para a direita — dodge/ruse saíam longe do personagem e o
  // dano em mobs próximos também ficava torto.
  const ex = (e) => (e.x !== undefined && e.x !== null)
    ? e.x : (c.player ? c.player.x : 0.5);
  const ey = (e) => (e.y !== undefined && e.y !== null)
    ? e.y : (c.player ? c.player.y : 0.5);
  for (const e of c.events) {
    switch (e.t) {
      case "hit": {
        // Cor do NUMERO de dano: fisico em VERMELHO contra criaturas de
        // SANGUE e contra PLAYERS (como o Tibia clássico) — a raca define a
        // cor (blood = vermelho) e o efeito. As demais racas seguem o esquema
        // antigo (veneno verde, morto-vivo cinza etc.).
        const ehFisico = (e.el === "physical" || !e.el);
        const raca = ehFisico
          ? (typeof fisicoPorRaca === "function" ? fisicoPorRaca(e.race) : null)
          : null;
        // blood (e sem raca conhecida) -> VERMELHO; players -> VERMELHO
        const vermelho = (ehFisico && raca && raca.color === "#c00000") ||
                         (ehFisico && e.race === "player");
        const col = ehFisico
          ? (vermelho ? "#c00000" : (raca ? raca.color : ELEMENTS.physical.color))
          : (ELEMENTS[e.el] || ELEMENTS.physical).color;
        // `dual` marca a parte elemental de uma arma que bate nos dois
        // tipos: desloca o numero para o lado para nao ficar por cima do
        // numero fisico, ja que os dois saem no mesmo instante e tile.
        const x = ex(e) + (e.dual ? 0.022 : 0), y = ey(e);
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx || (c.player ? c.player.x : 0.18), e.sy || 0.62,
                          x, y, col, e.missile);
        if (e.dmg > 0) r.addFloater(x, y, "-" + fmtDmg(e.dmg), col, e.dmg > 200, true, "damage");
        // e.fx vem do COMBAT_PARAM_EFFECT da runa (mort area, ice area,
        // stones...). Sem isso toda runa mostrava so o efeito generico do
        // elemento e a sudden death parecia igual a um golpe de death comum.
        // Exori usa o estouro CINZA "hit-area" (nao o draw-blood vermelho).
        r.addEffect(x, y, e.fx || (e.exori ? "hit-area"
                    : (raca ? raca.fx
                       : (ELEMENTS[e.el] || ELEMENTS.physical).fx)));
        // critico: uma UNICA animacao — o efeito oficial Critical Hit Effect
        // (estouro vermelho sobre o alvo). O texto "CRIT!" (crit-text) era
        // disparado junto e ficavam DUAS animacoes sobrepostas; removido.
        if (e.crit) {
          r.addEffect(x, y, "critical-hit-effect", 700);
        }
        // FATAL (Onslaught): sprite "FATAL!" importado do efeito oficial
        if (e.fatal) {
          // mais tempo de exibição para o efeito FATAL ser visível
          r.addEffect(x, y - 0.10, "fatal-text", 1200);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.fatal = (fdc.fatal || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        }
        break;
      }
      case "stance":
        // ativacao de stance: o sprite da postura explode no jogador
        r.addEffect(e.screen ? e.x : 0.13, e.screen ? e.y : 0.6, e.fx || "magic-blue");
        addLog("skill", `Stance ativada: <b>${e.nome}</b>`);
        break;
      case "stance-off":
        addLog("skill", `Stance desativada: <b>${e.nome}</b>`);
        break;
      case "manabuffer": {
        // Mana Buffer do 15.25: o golpe letal sai da mana em vez da vida
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        r.addFloater(px, py - 0.09, "-" + fmtFull(e.mana) + " mana", "#6a8aff");
        r.addFloater(px, py - 0.02, "mana buffer!", "#9ac0e8");
        r.addEffect(px, py, "magic-blue");
        r.playerFlash = 90;
        addLog("skill", `Mana Buffer absorveu <b>${fmtFull(e.vida)}</b> de dano por <b>${fmtFull(e.mana)}</b> mana.`);
        renderStats(G.p);
        break;
      }
      case "magic-shield-on": {
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        // 12.55+: mostra a capacidade do escudo (o "bônus" que o mage ganha
        // na mana) no cast
        r.addFloater(px, py - 0.10, e.cap ? "Magic Shield · ⚡" + fmt(e.cap) : "Magic Shield", "#7ec8ff");
        // O cast mantém o brilho azul oficial e adiciona o pulso roxo
        // persistente usado pelo OTC para diferenciar o Mana Shield.
        r.addEffect(px, py, "magic-blue");
        r.addEffect(px, py, "purple-energy", 800);
        break;
      }
      case "magic-shield": {
        const px = e.screen ? (e.x || 0.13) : 0.13, py = e.screen ? (e.y || 0.6) : 0.6;
        // Energy Ring (clássico): drena mana do personagem. utamo vita
        // (12.55+): drena a POOL do escudo — mostra o restante.
        if (e.source === "Magic Shield" && e.pool !== undefined) {
          // Absorção do Utamo Vita: número puro roxo, sem texto extra.
          r.addFloater(px, py - 0.10, "-" + fmtFull(e.mana), "#a64dff");
        } else {
          r.addFloater(px, py - 0.10, "-" + fmtFull(e.mana) + " mana", "#6a8aff");
        }
        r.addEffect(px, py, "magic-blue");
        // escudo quebrou (pool zerou): aviso
        if (e.source === "Magic Shield" && e.pool === 0) {
          addLog("death", "<b style='color:#7ec8ff'>Magic Shield</b> quebrou — a capacidade esgotou.");
        }
        break;
      }
      case "mana-wisp": {
        // as wands/rods do 15.25 devolvem mana a cada ataque
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        if (e.amount > 0)
          r.addFloater(px + 0.03, py - 0.14, "+" + fmtFull(e.amount), "#168cff", false, true, "restore");
        r.addEffect(px, py, "mana-wisp");
        break;
      }
      case "miss": {
        // Ruse (armor): evitou completamente um ataque.
        // Os floaters sobem NO SQM da entidade (player ou mob alvo) — a
        // posição vem do evento; o pequeno offset em y coloca o texto
        // sobre a cabeça, como os demais números.
        const mx = ex(e), my = ey(e) - 0.06;
        if (e.ruse) {
          r.addEffect(mx, ey(e), "ruse-effect", 1000);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.ruse = (fdc.ruse || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        } else {
          r.addFloater(mx, my, "errou", "#a0a0a0");
        }
        break;
      }
      case "dust": {
        const px = c.player ? c.player.x : 0.13, py = c.player ? c.player.y - 0.12 : 0.5;
        if (e.dust) r.addFloater(px, py, "+" + fmt(e.dust) + " dust", e.fiendish ? "#c78cff" : "#66c7ff");
        if (e.slivers) r.addFloater(px + 0.03, py + 0.04, "+" + fmt(e.slivers) + " slivers", "#ffe680");
        if (e.overflow) addLog("info", `Dust no limite: <b>${fmtFull(e.overflow)}</b> perdido.`);
        break;
      }
      case "range":
        // "fora de alcance" saía solto no meio da tela (a fórmula antiga
        // de posição deslocava tudo para a direita). Removido: a falha de
        // alcance fica só no log, sem poluir a cena.
        break;
      case "taken": {
        // O dano físico RECEBIDO por player usa sangue vermelho no client.
        // A cor cinza é exclusiva de físico sem sangue (pedra/constructos).
        const col = e.el === "physical" || !e.el
          ? "#ff6b6b" : (ELEMENTS[e.el] || ELEMENTS.physical).color;
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, e.x, e.y, col, e.missile);
        r.addFloater(e.screen ? e.x : 0.13, e.screen ? e.y - 0.07 : 0.55, "-" + fmtDmg(e.dmg), col, false, true, "damage");
        // e.fx = COMBAT_PARAM_EFFECT da habilidade do monstro (fire-area do
        // demon, mort area do lich...) — sem, cai o generico do elemento
        r.addEffect(e.screen ? e.x : 0.13, e.screen ? e.y : 0.6,
                    e.fx || (ELEMENTS[e.el] || ELEMENTS.physical).fx);
        r.playerFlash = 90;
        break;
      }
      case "mobheal":
        // cura defensiva do proprio monstro (bloco defenses do .lua)
        r.addFloater(ex(e), ey(e) - 0.06, "+" + fmtFull(e.heal), "#00e65a", false, true, "restore");
        r.addEffect(ex(e), ey(e), e.fx || "magic-green");
        break;
      case "effect":
        // animacao pura (debuff de stat de monstro nao implementado como
        // mecanica — entra so o efeito oficial da habilidade)
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, ex(e), ey(e), "#ffffff", e.missile);
        r.addEffect(ex(e), ey(e), e.fx || "magic-blue");
        break;
      case "block":
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, e.x, e.y, "#9ac0e8", e.missile);
        if (!e.magicShield) r.addFloater(e.screen ? e.x : 0.13, e.screen ? e.y - 0.07 : 0.55, "bloqueou", "#9ac0e8");
        break;
      case "heal-friend": {
        // HEAL FRIEND: cura aplicada em um aliado da party (exura sio /
        // gran sio / gran mas res). Mostra o +HP sobre o personagem.
        const px = e.screen ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.screen ? e.y - 0.12 : (c.player ? c.player.y - 0.12 : 0.5);
        r.addFloater(px, py, "+" + fmtFull(e.amount), "#00e65a", false, true, "restore");
        r.addEffect(px, e.screen ? e.y : (c.player ? c.player.y : 0.6), e.mass ? "magic-green" : "green-rings");
        // Critical Heal do Druid (10% base): efeito azul oficial em cima
        // do personagem que casta + texto CRITICAL!
        if (e.crit) {
          r.addFloater(px, py - 0.16, "CRITICAL!", "#7ec8ff");
          r.addEffect(px, e.screen ? e.y : (c.player ? c.player.y : 0.6), "critical-heal-effect", 800);
        }
        // Confirmação visível no PRÓPRIO aliado curado. Assim a party vê
        // exatamente quem recebeu exura sio "Nome", sem liberar as falas
        // automáticas dos demais aliados durante o combate.
        const healedEnt = e.targetId && c.players
          ? (typeof partyLiveEntity === "function" ? partyLiveEntity(c, { id:e.targetId, name:e.target }) : null) : null;
        if (healedEnt && typeof creatureSay === "function" && e.words) {
          creatureSay(healedEnt, e.words, TALK.SPELL);
        }
        if (e.mass) addLog("party", `<b style="color:#9ce84a">Mass Healing</b> curou <b>${e.target}</b> (+${fmtFull(e.amount)} hp)`);
        else addLog("party", `Curou <b>${e.target}</b> com ${e.spell} (+${fmtFull(e.amount)} hp)`);
        break;
      }
      case "heal": {
        const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.y !== undefined ? e.y : (c.player ? c.player.y - 0.12 : 0.5);
        r.addFloater(px, py, "+" + fmtFull(e.amount), "#00e65a", false, true, "restore");
        // Critical Heal (Vocation Adjustments 2026): SOMENTE a animação AZUL
        // oficial (critical-heal-effect) em cima do personagem que casta.
        // O vermelho é exclusivo do dano crítico em monstros.
        if (e.crit) {
          r.addEffect(px, py, "critical-heal-effect", 800);
        }
        // potion de spirit tambem restaura mana no mesmo gole
        if (e.mana) r.addFloater(px + 0.03, py + 0.04, "+" + fmtFull(e.mana), "#168cff", false, true, "restore");
        r.addEffect(px, c.player ? c.player.y : 0.6, "green-rings");
        // a potion correspondente brilha no Helper
        if (e.supply && typeof helperSupplyFlash === "function")
          helperSupplyFlash(e.supply, "heal");
        break;
      }
      case "mana": {
        const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.y !== undefined ? e.y : (c.player ? c.player.y - 0.12 : 0.5);
        r.addFloater(px, py, "+" + fmtFull(e.amount), "#168cff", false, true, "restore");
        // spirit potion bebida como mana tambem mostra a cura
        if (e.heal) r.addFloater(px + 0.03, py + 0.04, "+" + fmtFull(e.heal), "#00e65a", false, true, "restore");
        // faisca azul do gole de mana (como o CONST_ME_MAGIC_BLUE do client)
        r.addEffect(px, c.player ? c.player.y : 0.6, "magic-blue");
        if (e.supply && typeof helperSupplyFlash === "function")
          helperSupplyFlash(e.supply, "mana");
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
        addLog("death", `Sem quiver/munição válida/gold para usar <b>${e.name}</b>: o ataque à distância falhou.`);
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
      case "challenge-target":
        r.addEffect(e.x, e.y, e.amp ? "chivalrous-challenge" : "magic-blue");
        break;
      case "challenge": {
        // Exeta (Challenge / Chivalrous Challenge) do Knight: monstros
        // marcados focam o knight e causam 20% menos dano por 10s.
        const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.y !== undefined ? e.y : (c.player ? c.player.y : 0.6);
        const ehAmp = e.id === "exeta-amp-res" || /chivalrous/i.test(e.spell || "");
        // Exeta Amp Res: animação oficial (CONST_ME_CHIVALRIOUS_CHALLENGE,
        // anel de energia roxo/azul do DAT 15.x). Exeta Res: magic blue do
        // challenge.lua do Canary.
        if (!ehAmp) r.addEffect(px, py, "magic-blue");
        addLog("party", `<b style="color:#ffd65a">${e.spell || "Challenge"}</b> marcou <b>${e.count}</b> inimigo(s) — dano deles reduzido 20%`);
        break;
      }
      case "buff": {
        addLog("skill", `Buff ativo: <b>${e.nome}</b>`);
        // Momentum (helmet): redução de cooldowns
        if (e.nome === "Momentum") {
          const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
          const py = e.y !== undefined ? e.y : (c.player ? c.player.y : 0.6);
          r.addEffect(px, py, "momentum-effect", 1000);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.momentum = (fdc.momentum || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        } else if (e.nome === "Transcendence") {
          const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
          const py = e.y !== undefined ? e.y : (c.player ? c.player.y : 0.6);
          r.addFloater(px, py - 0.18, "AVATAR!", "#d79cff");
          const avatarFx = (typeof CLIENT_EFFECTS !== "undefined" && CLIENT_EFFECTS["avatar-effect"])
            ? "avatar-effect" : "magic-blue";
          r.addEffect(px, py, avatarFx, 1100);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.transcendence = (fdc.transcendence || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        }
        break;
      }
      case "poisoned":
        r.addEffect(ex(e), ey(e), "hit-by-poison");
        addLog("info", `<b>${e.name}</b> foi envenenado.`);
        break;
      case "burst":
        // a runa de area usa o proprio efeito (ice area na avalanche, fire
        // area na great fireball); a burst arrow continua na explosao
        r.addEffect(ex(e), ey(e), e.fx || "explosion-area");
        break;
      case "areafx": {
        // pinta o efeito em TODAS as casas cobertas pela matriz, nao so onde
        // havia monstro. Sem isso a magia de area parecia acertar um alvo so.
        for (const cel of (e.cells || [])) {
          const pos = typeof cellToScreen === "function"
            ? cellToScreen(cel.cx, cel.cy) : null;
          if (!pos) continue;
          r.addEffect(pos.x, pos.y, e.fx || "explosion-area");
        }
        break;
      }
      case "chain":
        // faisca do salto em cadeia (CONST_ME_WHITE_ENERGY_SPARK do Canary)
        r.addEffect(ex(e), ey(e), e.fx || "white-energy-spark");
        addLog("info", `Corrente atingiu <b>${e.n}</b> alvos.`);
        break;
      case "say": {
        // o personagem fala a magia/supply, como no client do Tibia.
        // Aliados do party combat falam no próprio lugar (bolha + log).
        const saidor = (e.whoId && c && c.players)
          ? c.players.find((x) => String(x.id) === String(e.whoId)) : null;
        if (saidor) {
          // A cena só mostra palavras mágicas do personagem selecionado.
          // Aliados continuam aplicando spell/efeito/cura normalmente, mas
          // não enchem a tela nem o log com falas automáticas.
          const selecionado = c && c.player && String(c.player.id) === String(saidor.id);
          if (!selecionado) break;
          if (typeof creatureSay === "function") {
            creatureSay(saidor, e.text, e.supply ? TALK.SAY : TALK.SPELL);
          }
          addLog("say", `<b>${saidor.name}</b>: ${e.text}`);
        } else {
          r.addSpeech(e.text, e.supply ? "#7ae87a" : "#ffe680");
          addLog("say", `<b>${G.p.name}</b>: ${e.text}`);
        }
        break;
      }
      case "kill": {
        const x = ex(e), y = ey(e);
        r.addCorpse(x, y, e.mob);
        // XP na tela exatamente como o cliente oficial: valor cheio
        // (nunca abreviado para "1.2k"), numero BRANCO e inteiro
        r.addFloater(x, y - 0.06, "+" + fmtDmg(e.exp) + " xp", "#ffffff");
        r.addEffect(x, y, "poff");
        addLog("exp", `Matou <b>${e.name}</b> · <span style="color:#9ce84a">+${fmtFull(e.exp)} xp</span>`);
        if (e.loot && e.loot.length) {
          // v27 — pedido do dono: sem toast de "loot raro" (flutuante à
          // esquerda) e sem a mensagem verde que sobe na tela. O loot fica
          // apenas no log do painel (abaixo).
          const txt = e.loot.map((l) => {
            const it = GAMEDATA.items[l.item];
            const rare = it && (it.sell || 0) >= 500;
            const nm = `${l.count > 1 ? l.count + "x " : ""}${itemName(l.item)}`;
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
        break;

      case "spawn-blink": {
        // Piscada do teleporte no ponto de respawn (o monstro ainda nao
        // nasceu): o efeito oficial de teleporte toca na celula.
        const px = (e.x !== undefined && e.x !== null) ? e.x : 0.5;
        const py = (e.y !== undefined && e.y !== null) ? e.y : 0.5;
        r.addEffect(px, py, "teleport", 240);
        break;
      }
      case "spawn": {
        // Monstro terminou de nascer: um estouro leve marca o momento.
        const px = (e.x !== undefined && e.x !== null) ? e.x : 0.5;
        const py = (e.y !== undefined && e.y !== null) ? e.y : 0.5;
        r.addEffect(px, py, "poff", 300);
        break;
      }

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
        if (e.mode === "dummy") {
          // Exercise Dummy: NÃO leva dano, apenas registra o tick de skill.
          // Sem floater de dano, sem efeito de impacto no dummy.
          // Com mapa .otbm, as posições vêm do training; sem mapa usa a baia fixa.
          const dp = t.dummyPos || { x: 0.70, y: 0.60 };
          r.addFloater(dp.x - 0.02, dp.y - 0.16, "+tick " + (SKILL_NAMES[e.skill] || e.skill), "#9ce84a", e.skillUp);
          renderSkills(G.p);
          renderStats(G.p);
          renderTopbar(G.p);
          if (e.skillUp) addLog("skill", `<b>${SKILL_NAMES[e.skill] || e.skill}</b> subiu no Exercise Dummy.`);
          if (e.shieldUp) addLog("skill", "<b>Shielding</b> subiu no Exercise Dummy.");
        } else {
          if (e.dmg > 0) r.addFloater(0.70, 0.45, "-" + fmtDmg(e.dmg), "#d8d8d8", e.dmg > 80);
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
        }
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
        addLog("death", `Sem quiver/munição válida/gold para treinar com <b>${e.name}</b>.`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
    }
  }
  t.events.length = 0;
}

/* ------------------------------------------------------------ loop */
/* Quando a aba fica inativa, o browser pausa requestAnimationFrame.
 * Ao voltar, o delta (ts - G.last) seria enorme e o tickAcc engoliria
 * dezenas de ticks de uma vez, causando o "travamento" que o jogador
 * percebe. A solução: resetar o acumulador ao retomar a aba e ignorar
 * o frame gigante que o browser entrega na volta. */
let _wasHidden = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    _wasHidden = true;
    G.bgLast = Date.now();
  } else {
    /* Ao voltar: reseta o timestamp para que o próximo frame
     * tenha dt ≈ 0 (não acumula ticks atrasados). O TEMPO que passou
     * com a aba escondida JÁ foi processado pelo bgTick (setInterval),
     * então não zeramos o acumulador para não perder progresso. */
    G.last = performance.now();
    G.tickAcc = 0;
    _wasHidden = false;
  }
});

/* ------------------------------------------------------------ idle em bg
 * O jogo é IDLE: minimizar a aba ou trocar de janela NÃO pode pausar a
 * caçada. O browser congela requestAnimationFrame em abas ocultas, então
 * um setInterval (que continua rodando, mesmo throttled a ~1s) mantém a
 * simulação viva:
 *
 *   - combatTick roda com `now` AVANÇANDO tick a tick (se todos os ticks
 *     usassem o mesmo Date.now(), os cooldowns de skill nunca passariam e
 *     o bicho castaria a magia em todos os ticks de uma vez);
 *   - c.events é limpo a cada tick (sem render não há floaters/logs — o
 *     resultado aparece nos painéis ao voltar);
 *   - imbuement/prey/supplies/save continuam rodando para o personagem
 *     não morrer nem perder progresso.
 */
let _bgTimer = null;
function startBackgroundTick() {
  if (_bgTimer) return;
  _bgTimer = setInterval(() => {
    if (!G || !G.p || G.paused || !G.combat || !document.hidden) return;
    const agora = Date.now();
    let elapsed = agora - (G.bgLast || agora);
    G.bgLast = agora;
    // teto por tick: 2 min — evita loop gigante se a aba ficou horas
    // fechada (nesse caso o computeOffline cobre no reload)
    elapsed = Math.min(elapsed, 120000);
    let acc = elapsed;
    let t = 0;
    while (acc >= TICK) {
      t += TICK;
      const nowTick = agora - acc + TICK;
      combatTick(G.combat, G.p, TICK, nowTick);
      acc -= TICK;
      G.combat.events.length = 0;   // sem render: descarta os visuais
    }
    // cargas por tempo dos anéis/amuletos continuam com a aba escondida
    if (typeof tickAccessoryCharges === "function") tickAccessoryCharges(G.p, elapsed);
    if (typeof imbTickAll === "function") imbTickAll(G.p, elapsed);
    if (typeof preyTick === "function") preyTick(G.p, elapsed);
    // reposição de supplies periódica (autoRestock) para não morrer
    G.sellTimer = (G.sellTimer || 0) + elapsed;
    if (G.sellTimer > 15000) {
      G.sellTimer = 0;
      if (typeof autoRestock === "function") autoRestock(G.p);
    }
    // autosave a cada ~20s mesmo com a aba escondida
    G.saveTimer = (G.saveTimer || 0) + elapsed;
    if (G.saveTimer > 20000) {
      G.saveTimer = 0;
      if (typeof save === "function") save();
    }
  }, 200);
}

/* Loot Pouch: nível de enchimento (0-100%) para o Autoseller.
 * Capacidade fixa de 100 unidades — o slider escolhe em quantos % dispara. */
function pouchFillPct(p) {
  const cap = 100;
  let units = 0;
  for (const slug in (p.lootPouch || {})) units += p.lootPouch[slug] || 0;
  return Math.min(100, Math.round((units / cap) * 100));
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (!G.p) return;
  /* Se estávamos com a aba escondida, descarta o frame de retorno
   * (ts pode ser segundos depois do G.last) e reinicia o relógio. */
  if (_wasHidden) {
    G.last = ts;
    G.tickAcc = 0;
    _wasHidden = false;
  }
  const dt = Math.min(250, ts - G.last || 16);
  G.last = ts;

  // a barra de cooldown anda sozinha, dentro ou fora da hunt — no Tibia o
  // cooldown nao pausa ao voltar para a cidade
  if (typeof renderCooldownBar === "function") renderCooldownBar(G.p);
  if (typeof avatarTick === "function") avatarTick(G.p, Date.now());

  if (!G.paused && G.combat) {
    const before = G.p.level;
    const beforeSkills = JSON.stringify(G.p.skills) + G.p.ml;
    G.tickAcc += dt;
    while (G.tickAcc >= TICK) {
      combatTick(G.combat, G.p, TICK, Date.now());
      G.tickAcc -= TICK;
    }
    // Relogio dos imbuements: 20h de TEMPO DE COMBATE (ver imbuement.js).
    if (typeof imbTickAll === "function") {
      // Cada membro da party consome apenas os imbuements dos itens que ELE
      // tem equipados; não há relógio compartilhado entre personagens.
      const ents = G.combat.players && G.combat.players.length > 1 ? G.combat.players : [{ p: G.p }];
      for (const ent of ents) if (ent.p) imbTickAll(ent.p, dt);
    }

    // Movimento a cada FRAME, nao a cada tick de 100ms (como o combatTick
    // fazia). No Canary o servidor so marca o INICIO do passo no beat de
    // 50ms; a animacao do trajeto e o client que interpola na taxa da
    // tela. A decisao (playerThinkStep/monsterThinkStep) continua trancada
    // pelo stepDur/nextStepAt — o que muda e que a posicao desenhada agora
    // segue o dt real do frame, dando fluidez de 60fps. O motor antigo
    // fica de fallback caso grid.js/gridai.js nao carreguem.
    if (typeof updateGridMovement === "function") {
      updateGridMovement(G.combat, G.p, dt, Date.now());
    } else if (typeof updateCombatMovement === "function") {
      updateCombatMovement(G.combat, G.p, dt);
    }
    // CARGAS de anéis/amuletos por TEMPO (time ring: 1 carga/3s equipado)
    if (typeof tickAccessoryCharges === "function") tickAccessoryCharges(G.p, dt);
    drainEvents();
    // HP/MP da party são entidades vivas; atualiza o painel em tempo real
    // mesmo quando outro membro está selecionado.
    if (G.combat.players && G.combat.players.length > 1 && typeof renderPartyPanel === "function") {
      G._partyHudAt = (G._partyHudAt || 0) + dt;
      if (G._partyHudAt >= 120) { G._partyHudAt = 0; renderPartyPanel(G.p); }
    }
    // Autoseller da Loot Pouch: quando o enchimento passa do % escolhido no
    // painel, vende TUDO automaticamente (respeitando "Não vender" e itens
    // sem valor). Checagem espaçada (2s) para não rodar a cada frame.
    if (G.p && G.p.config && G.p.config.pouchAutoSell &&
        typeof sellAllPouch === "function") {
      G._pouchTick = (G._pouchTick || 0) + dt;
      if (G._pouchTick >= 2000) {
        G._pouchTick = 0;
        const pct = pouchFillPct(G.p);
        if (pct >= (G.p.config.pouchAutoSellPct || 80)) {
          const r = sellAllPouch(G.p);
          if (r.kinds) {
            addLog("sell", `Autoseller: Loot Pouch em <b>${pct}%</b> — vendeu tudo por <b>${fmtFull(r.gold)} gp</b>.`);
            if (typeof renderLootPouch === "function") renderLootPouch(G.p);
          }
        }
      }
    }
    if (G.combat && G.combat.dead && Date.now() >= G.combat.deadUntil) {
      // Revive: jogador renasce no mesmo ponto que morreu
      const c = G.combat;
      const p = G.p;
      const max = maxStats(p);
      p.hp = max.hp; p.mp = max.mp;
      // Restaura posição do corpse
      if (c.deathPos && c.player) {
        c.player.x = c.deathPos.x;
        c.player.y = c.deathPos.y;
        c.player.dir = c.deathPos.dir || "e";
        c.player.moving = false;
      }
      c.mobs = [];
      c.dead = false;
      c.deathPos = null;
      addLog("info", "Você renasceu no local da morte.");
      toast("Renasceu!", "level");
      renderAll();
      return;
    }

    // PARTY COMBAT: aliados INCONSCIENTES renascem no local depois do
    // tempo (reviveAt) — a instância continua ativa enquanto alguém vivo
    // estiver nela
    if (G.combat && G.combat.players && G.combat.players.length > 1 &&
        !G.combat.dead) {
      for (const ent of G.combat.players) {
        if (ent.p && ent.p.hp <= 0 && ent.reviveAt &&
            Date.now() >= ent.reviveAt) {
          const mx = maxStats(ent.p);
          ent.p.hp = mx.hp;
          ent.p.mp = mx.mp;
          if (ent.deathPos) {
            ent.x = ent.deathPos.x;
            ent.y = ent.deathPos.y;
            ent.dir = ent.deathPos.dir || "e";
            ent.cx = undefined;
            ent.cy = undefined;
            if (typeof ensureCell === "function") ensureCell(ent);
          }
          ent.reviveAt = 0;
          ent.deathPos = null;
          addLog("party", `<b style="color:#9ce84a">${ent.name}</b> renasceu no local da morte.`);
          if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
          if (typeof renderPartyPanel === "function") renderPartyPanel(G.p);
        }
      }
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
    // regen de stamina por modo de treino: dummy 3:1, online 1:1
    const tr = G.training;
    const staRate = (typeof trainingStaminaRate === "function")
      ? trainingStaminaRate(tr) : (tr && tr.mode === "dummy" ? 1 / 3 : 1.0);
    G.p.stamina = Math.min(42 * 3600, G.p.stamina + (dt / 1000) * staRate);
    academyTrainingTick(tr, G.p, dt, Date.now());
    drainAcademyEvents();
    if (JSON.stringify(G.p.skills) + G.p.ml !== beforeSkills) {
      renderSkills(G.p);
      renderStats(G.p);
    }
  }

  G.renderer.resize();
  if (G.training) {
    G.renderer.drawAcademy(G.training, G.p, dt);
  } else if (!G.combat) {
    // Recupera saves que ficaram sem instância e com inCity=false após troca
    // de branch/reload: a ausência de combate sempre deve renderizar Thais.
    G.inCity = true;
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
    // selo da postura ativa no canto superior esquerdo da cena
    if (typeof renderStanceBadge === "function") renderStanceBadge(G.p);
  }

  // autosave a cada 20s
  G.saveTimer += dt;
  if (G.saveTimer > 20000) { G.saveTimer = 0; save(); }
  // Prey: o timer de 2h decrementa enquanto o personagem está caçando
  if (G.combat && typeof preyTick === "function") {
    preyTick(G.p, dt);
  }
}

/* ------------------------------------------------------------ render */
function renderAll() {
  const p = G.p;
  renderStats(p);
  renderSkills(p);
  renderEquip(p);
  if (typeof renderStatusBar === "function") renderStatusBar(p);
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
  if (typeof renderCoinBalance === "function") renderCoinBalance();
  var db = $("#depot-badge");
  if (db) { var n = p.depotNotification || 0; db.textContent = n > 0 ? n : ""; db.style.display = n > 0 ? "" : "none"; }
  renderHuntInfo();
  if (typeof renderStanceBadge === "function") renderStanceBadge(p);
  if (typeof renderPreyButton === "function") renderPreyButton(p);
  if (typeof renderPartyButton === "function") renderPartyButton(p);
  // Reward Chest: badge do botão (nº de itens de boss)
  if (typeof renderRewardButton === "function") renderRewardButton(p);
  // painel de party estilo OTC (canto superior direito da tela do jogo)
  if (typeof renderPartyPanel === "function") renderPartyPanel(p);
  // OTClient HUD: combat modes, player states (o hud-panel com HP/MP/Lv foi
  // removido — level e mana já têm as barras fixas do painel do personagem)
  if (typeof renderPlayerStates === "function") renderPlayerStates(p);
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

  // Migração: garante exercise weapon charges grátis para personagens antigos
  if (typeof ensureTraining === "function") {
    ensureTraining(p);
    const freeWeapon = p.voc === "knight" ? "exercise-sword"
      : p.voc === "paladin" ? "exercise-bow"
      : p.voc === "sorcerer" ? "exercise-wand"
      : p.voc === "druid" ? "exercise-rod"
      : p.voc === "monk" ? "exercise-wraps"
      : "exercise-sword";
    if (!p.exercise[freeWeapon]) p.exercise[freeWeapon] = 5000;
    if (!p.exercise["exercise-shield"]) p.exercise["exercise-shield"] = 5000;
  }

  $("#login").style.display = "none";
  $("#app").classList.add("ready");
  // modulelib lifecycle + background hide
  window.dispatchEvent(new Event("bg-game-start"));
  if (typeof moduleLifecycleStart === "function") moduleLifecycleStart();

  const off = computeOffline(p);
  p.lastSeen = Date.now();

  if (p.hunt && GAMEDATA.hunts[p.hunt]) {
    p.instanceMode = p.instanceMode || "non-pvp";
    // mesma regra do startHunt: hunt .otbm carrega o mapa antes do combate
    huntMapFromOtbmAsync(GAMEDATA.hunts[p.hunt], () => {
      G.combat = newCombat(p, p.hunt, p.instanceMode);
      spawnWave(G.combat, p);
    });
    G.inCity = false;
  } else {
    G.inCity = true;   // sem caçada ativa, o char fica na cidade
  }

  renderAll();
  bindControls();
  addLog("info", `Bem-vindo, <b>${p.name}</b>!`);
  if (off) showOfflineModal(off);

  G.last = performance.now();
  G.bgLast = Date.now();
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", save);
  setInterval(save, 20000);
  startBackgroundTick();   // idle continua rodando com a aba minimizada

  // PARTY online: polling leve (convites + follow) + reporta a zona inicial
  if (typeof partyStartPolling === "function") partyStartPolling();
  if (typeof partyReportZone === "function" && typeof partyCurrentZone === "function") {
    setTimeout(() => partyReportZone(partyCurrentZone()), 1500);
  }
}

function bindControls() {
  const p = G.p;
  $("#btn-cyclo").addEventListener("click", () => openCyclopedia());
  const btnImb = $("#btn-imbue");
  if (btnImb) btnImb.addEventListener("click", () => openImbueModal());
  const btnForge = $("#btn-forge");
  if (btnForge) btnForge.addEventListener("click", () => { if (typeof openForgeModal === "function") openForgeModal(); });
  const btnMarket = $("#btn-market");
  if (btnMarket) btnMarket.addEventListener("click", () => { if (typeof openMarket === "function") openMarket(); });
  const btnWheel = $("#btn-wheel");
  if (btnWheel) btnWheel.addEventListener("click", () => { if (typeof openWheelModal === "function") openWheelModal(); });
  const btnDepot = $("#btn-depot");
  if (btnDepot) btnDepot.addEventListener("click", () => { if (typeof openDepotModal === "function") openDepotModal(); });
  // Reward Chest (drops de boss) — botão ao lado do MARKET
  if (typeof bindRewardButton === "function") bindRewardButton();
  // painel de testes: so liga o botao se admin.js estiver carregado, para o
  // jogo continuar de pe se o arquivo for removido numa build de producao
  if (typeof bindPreyButton === "function") bindPreyButton();
  if (typeof bindPartyButton === "function") bindPartyButton();
  if (typeof bindTrainingButton === "function") bindTrainingButton();
  const btnAdmin = $("#btn-admin");
  if (btnAdmin) {
    if (typeof openAdmin === "function") {
      btnAdmin.addEventListener("click", () => openAdmin());
    } else {
      btnAdmin.style.display = "none";
    }
  }
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

  // ESC fecha o modal aberto (e o context menu), como no client do Tibia.
  // O handler roda mesmo com foco em input, para o jogador nunca ficar
  // preso numa janela sem botao de fechar.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = $("#modal");
    if (modal && modal.classList.contains("show")) {
      modal.classList.remove("show", "wide");
      if (typeof closeModal === "function") closeModal();
    }
    if (typeof hideContextMenu === "function") hideContextMenu();
    if (typeof hideTip === "function") hideTip();
  });

  initPanelCollapse();
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
  // Unico lugar que ainda equipa sozinho: o kit inicial. O auto-equip
  // periodico foi removido (o jogador troca o que quiser na mao), mas nascer
  // com a mochila cheia e nenhum item vestido nao ajuda ninguem.
  autoEquip(p);
  if (p.voc === "paladin") {
    // o quiver de Dawnport ocupa o slot proprio; sem ele o paladino nao
    // consegue atirar, entao garantimos que esteja equipado
    if (!equippedQuiver(p) && GAMEDATA.items["quiver"]) {
      if (p.bag && p.bag["quiver"]) removeItem(p, "quiver", 1);
      // o quiver vai para a mao secundaria, devolvendo o escudo se houver
      if (p.equip.shield) addItem(p, p.equip.shield.item, 1);
      p.equip.shield = { item: "quiver", count: 1 };
    }
    if (!p.equip.weapon && GAMEDATA.items["bow"]) {
      p.equip.weapon = { item: "bow", count: 1 };
    }
    // simple arrow ativa por padrao: e a municao que vem no kit
    if (!p.equip.ammo) setActiveAmmo(p, "simple-arrow");
  }
  // Kit de treino: 5000 cargas gratis da exercise weapon da vocação
  // + 25 Tibia Coins para comprar mais cargas
  if (typeof ensureTraining === "function") {
    ensureTraining(p);
    const freeWeapon = p.voc === "knight" ? "exercise-sword"
      : p.voc === "paladin" ? "exercise-bow"
      : p.voc === "sorcerer" ? "exercise-wand"
      : p.voc === "druid" ? "exercise-rod"
      : p.voc === "monk" ? "exercise-wraps"
      : "exercise-sword";
    if (p.exercise[freeWeapon] === undefined || p.exercise[freeWeapon] === 0) {
      p.exercise[freeWeapon] = 5000;
    }
    // Também dá 5000 cargas de exercise shield para todos
    if (p.exercise["exercise-shield"] === undefined || p.exercise["exercise-shield"] === 0) {
      p.exercise["exercise-shield"] = 5000;
    }
  }
  if (typeof accountAddCoins === "function") {
    accountAddCoins(25);
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
  const render = () => {
    $$("#outfit-parts [data-opart]").forEach((b) => b.classList.toggle("primary", +b.dataset.opart === part));
    $$("#outfit-palette [data-ocolor]").forEach((s) => s.classList.toggle("sel", +s.dataset.ocolor === draft.colors[part]));
    // O único preview agora é o 15x do Wardrobe abaixo.
    const ward = $("#cyclo-content");
    if (ward && typeof cycloAppearance === "function") cycloAppearance(p, ward);
  };

  $("#modal-body").innerHTML = `
    <div class="panel-title">Change Outfit
      <span style="flex:1"></span><button class="sm" id="outfit-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="outfit-color-editor mb8">
        <div style="min-width:0;flex:1">
          <div class="small dim mb4">Cores do visual</div>
          <div class="row wrap mb4" id="outfit-parts" style="gap:4px">
            ${PARTS.map(([n, i]) => `<button class="sm" data-opart="${i}">${n}</button>`).join("")}
          </div>
          <div id="outfit-palette" class="outfit-palette outfit-palette-compact">
        ${OUTFIT_PALETTE.map((c, i) =>
          `<span class="swatch" data-ocolor="${i}" style="background:${c}" title="cor ${i}"></span>`).join("")}
        </div>
      </div>
      </div>
      <div class="small dim mt8 mb4">Wardrobe — outfits, addons e montarias</div>
      <div id="cyclo-content" class="outfit-wardrobe" style="max-height:330px;overflow:auto"></div>
      <div class="row" style="gap:6px;margin-top:8px">
        <button class="primary" style="flex:1" id="outfit-save">Salvar outfit</button>
        <button style="flex:none" id="outfit-cancel">Cancelar</button>
      </div>
    </div>`;
  $("#modal").classList.add("show", "wide");
  // A antiga tela Aparências da Cyclopedia passa a viver dentro do Change Outfit.
  if (typeof CYCLO !== "undefined") { CYCLO.appModo = "outfit"; CYCLO.filtro = "all"; }
  if (typeof cycloAppearance === "function") cycloAppearance(p, $("#cyclo-content"));

  $$("#outfit-parts [data-opart]").forEach((b) => b.addEventListener("click", () => {
    part = +b.dataset.opart; render();
  }));
  $$("#outfit-palette [data-ocolor]").forEach((s) => s.addEventListener("click", () => {
    draft.colors[part] = +s.dataset.ocolor; render();
  }));
  const close = () => openCharacterModal();
  $("#outfit-close").addEventListener("click", close);
  $("#outfit-cancel").addEventListener("click", close);
  $("#outfit-save").addEventListener("click", () => {
    p.outfit = Object.assign({}, p.outfit || {}, { type: draft.type, colors: draft.colors.slice() });
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
/* Login ONLINE (conta + MySQL): abas Entrar/Criar conta, picker de
 * personagem e criação de personagem na conta. */
function initAccountLogin() {
  let selSex = "male", selVoc = "knight";
  const acc = sessionAccount();

  function msg(t) {
    const el = $("#acc-msg");
    if (el) el.innerHTML = t || "";
  }
  function vocOutfit(v, s) {
    const map = { knight: "knight", paladin: "hunter", druid: "summoner",
                  sorcerer: "mage", monk: "monk" };
    return map[v] + "-" + (s === "female" ? "f" : "m");
  }
  function paintAccVocs() {
    const grid = $("#acc-voc-grid");
    if (!grid) return;
    const vocs = ["knight", "paladin", "druid", "sorcerer", "monk"];
    grid.innerHTML = vocs.map((v) => `
      <div class="voc-card ${v === selVoc ? "sel" : ""}" data-voc="${v}">
        <img src="assets/outfit/${vocOutfit(v, selSex)}_s.png" alt="">
        <div class="vn">${VOCATIONS[v].name}</div>
        <div class="vd">${VOCATIONS[v].desc}</div>
      </div>`).join("");
    $$("#acc-voc-grid .voc-card").forEach((c) =>
      c.addEventListener("click", () => { selVoc = c.dataset.voc; paintAccVocs(); }));
  }
  function bindAccSex() {
    $$("#acc-char-picker .acc-sex").forEach((b) =>
      b.addEventListener("click", () => {
        selSex = b.dataset.sex;
        $$("#acc-char-picker .acc-sex").forEach((x) => x.classList.remove("primary"));
        b.classList.add("primary");
        paintAccVocs();
      }));
  }

  /* Mostra a lista de personagens da conta + form de novo personagem */
  function showPicker(token, account, characters) {
    $("#acc-panel-login").style.display = "none";
    $("#acc-panel-register").style.display = "none";
    $("#acc-char-picker").style.display = "";
    // salva a sessão
    try {
      sessionStorage.setItem("tibia-idle-token", token);
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(account));
    } catch (e) {}
    const coins = account.coins || 0;
    const cEl = $("#acc-char-coins");
    if (cEl) cEl.textContent = coins + " Tibia Coins";
    const list = $("#acc-char-list");
    if (list) {
      list.innerHTML = characters.length
        ? characters.map((c) => `
            <div class="shop-row clickable" data-acc-char="${c.id}" data-acc-char-name="${c.name}">
              <div style="flex:1"><b>${c.name}</b> · ${vocationName({ voc: c.voc })} · nv ${c.level}</div>
              <span>➜</span>
            </div>`).join("")
        : '<div class="tiny dim">Nenhum personagem ainda — crie o primeiro abaixo.</div>';
      $$("#acc-char-list [data-acc-char]").forEach((row) =>
        row.addEventListener("click", async () => {
          const cid = row.dataset.accChar;
          const name = row.dataset.accCharName;
          msg("Carregando <b>" + name + "</b>...");
          // busca o personagem completo na API (usamos o /me com o id e
          // recarregamos o save via rota de personagem quando disponível)
          const p = normalizePlayer({ name: name, voc: "knight", level: 1, id: cid });
          try { sessionStorage.setItem("tibia-idle-char", cid); } catch (e) {}
          startGame(p);
        }));
    }
    paintAccVocs();
    bindAccSex();
    $("#acc-btn-create-char").addEventListener("click", async () => {
      const name = ($("#acc-char-name").value || "").trim();
      if (name.length < 2) { msg("Digite um nome válido"); return; }
      const r = await accountCreateCharacter(token, name, selVoc, createCharacter(name, selVoc, selSex));
      if (!r.ok) { msg(r.msg || "Falha ao criar personagem"); return; }
      try { sessionStorage.setItem("tibia-idle-char", r.character.id); } catch (e) {}
      const p = createCharacter(name, selVoc, selSex);
      p.id = r.character.id;
      startGame(p);
    });
  }

  // abas
  $$("[data-acc-tab]").forEach((tab) =>
    tab.addEventListener("click", () => {
      const which = tab.dataset.accTab;
      $("#acc-tab-login").classList.toggle("active", which === "login");
      $("#acc-tab-register").classList.toggle("active", which === "register");
      $("#acc-panel-login").style.display = which === "login" ? "" : "none";
      $("#acc-panel-register").style.display = which === "register" ? "" : "none";
      msg("");
    }));

  $("#acc-btn-login").addEventListener("click", async () => {
    const login = ($("#acc-login").value || "").trim();
    const pass = $("#acc-password").value || "";
    if (!login || !pass) { msg("Informe login e senha"); return; }
    msg("Entrando...");
    const r = await accountLogin(login, pass);
    if (!r.ok) { msg(r.msg || "Falha no login"); return; }
    showPicker(r.token, r.account, r.characters);
  });
  $("#acc-btn-register").addEventListener("click", async () => {
    const login = ($("#acc-new-login").value || "").trim();
    const pass = $("#acc-new-password").value || "";
    if (login.length < 1 || pass.length < 1) { msg("Informe login e senha"); return; }
    msg("Criando conta...");
    const r = await accountRegister(login, pass);
    msg(r.ok ? "Conta criada! Faça o login." : (r.msg || "Falha"));
    if (r.ok) {
      $("#acc-tab-login").click();
      $("#acc-login").value = login;
      $("#acc-password").value = pass;
    }
  });
  $("#acc-login").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#acc-btn-login").click(); });
  $("#acc-password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#acc-btn-login").click(); });
  $("#acc-new-login").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#acc-btn-register").click(); });
  $("#acc-new-password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#acc-btn-register").click(); });
  $("#acc-char-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#acc-btn-create-char").click(); });

  // sessão já existente (refresh da página): pula o login
  const tok = sessionToken();
  if (tok && acc) {
    msg("Reconectando...");
    accountMe(tok).then((r) => {
      if (r.ok) showPicker(tok, r.account, r.characters);
      else msg("Sessão expirada — faça login novamente.");
    });
  }
}

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

  // ---------- MODO ONLINE (conta + MySQL) ----------
  // Se a API está configurada, mostra o login/cadastro de conta; o modo
  // local fica escondido.
  const online = typeof accountApiConfigured === "function" && accountApiConfigured();
  if (online) {
    const accLogin = $("#account-login");
    const localLogin = $("#local-login");
    if (accLogin) accLogin.style.display = "";
    if (localLogin) localLogin.style.display = "none";
    initAccountLogin();
    return;
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
