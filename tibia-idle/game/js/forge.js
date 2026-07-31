/*
 * forge.js — Sistema de Exaltation Forge + Depot + Avatar (Canary).
 *
 * Forja: tenta subir o tier de um item com cls >= 1.
 * Regras do Canary:
 *   - cls 1 -> max tier 3, cls 2 -> 5, cls 3 -> 7, cls 4 -> 10
 *   - custo: gold + dusts + exalted cores (tier 7+)
 *   - sucesso: chance por tier, falha pode causar downgrade ou break
 *   - resultado vai para a Exaltation Box dentro do Depot
 *
 * Depot: 30 slots para guardar equipamentos. Exaltation Box dentro
 * do depot recebe os itens forjados.
 *
 * Avatar (Transcendence): ativado em combate, buff temporario.
 */
"use strict";

/* ---------- Inicializacao ---------- */
function ensureForge(p) {
  p.forge = p.forge || {};         // slug -> tier
  p.dusts = p.dusts || {};         // "dust-basic" -> qty, etc
  p.exaltedCores = p.exaltedCores || 0;
  p.depot = p.depot || [];         // array de slugs (ate 30)
  p.exaltationBox = p.exaltationBox || []; // array de slugs (itens forjados)
  p.depotNotification = p.depotNotification || 0; // contador de notificacao
}

/* ---------- Forja ---------- */

/* Verifica se pode forjar o item para o proximo tier */
function forgeCanUpgrade(p, slug) {
  const it = GAMEDATA.items[slug];
  if (!it) return { ok: false, msg: "Item desconhecido." };
  const cls = it.cls || 0;
  if (cls < 1) return { ok: false, msg: "Este item nao tem classificacao para forja." };
  const maxTier = FORGE_MAX_TIER[cls] || 3;
  ensureForge(p);
  const current = p.forge[slug] || 0;
  if (current >= maxTier) return { ok: false, msg: "Tier maximo (T" + maxTier + ") atingido." };
  const next = current + 1;
  const cost = FORGE_COSTS[next];
  if (!cost) return { ok: false, msg: "Custo nao definido para tier " + next + "." };

  // Verifica gold
  if (p.gold < cost.gold) return { ok: false, msg: "Faltam " + fmtFull(cost.gold - p.gold) + " gp." };

  // Verifica dusts
  for (const d of cost.dust) {
    const have = p.dusts[d.type] || 0;
    if (have < d.qty) return { ok: false, msg: "Faltam " + (d.qty - have) + " " + FORGE_DUSTS[d.type].name + "." };
  }

  // Verifica exalted cores
  if (cost.cores > p.exaltedCores) return { ok: false, msg: "Faltam " + (cost.cores - p.exaltedCores) + " Exalted Cores." };

  return { ok: true, current: current, next: next, cost: cost };
}

/* Tenta forjar. Retorna resultado. O item equipado e desequipado,
 * forjado e o resultado vai para a Exaltation Box. */
function forgeAttempt(p, slug) {
  const check = forgeCanUpgrade(p, slug);
  if (!check.ok) return check;

  const cost = check.cost;
  const next = check.next;

  // Consome recursos
  p.gold -= cost.gold;
  for (const d of cost.dust) p.dusts[d.type] -= d.qty;
  p.exaltedCores -= cost.cores;

  // Roll
  const roll = Math.random() * 100;
  const success = roll < cost.pct;

  ensureForge(p);
  let resultItem = slug;
  let resultTier = next;
  let resultMsg = "";

  if (success) {
    // Sucesso: tier sobe
    resultMsg = "Forja bem-sucedida! " + itemName(slug) + " agora e T" + next + ".";
    p.forge[slug] = next;
  } else if (cost.break) {
    // Item quebrado: destruido
    resultMsg = "A forja FALHOU e o item foi DESTRUIDO!";
    resultItem = null;
    resultTier = 0;
    delete p.forge[slug];
  } else if (cost.downgrade && check.current > 0) {
    // Downgrade: perde 1 tier
    resultMsg = "A forja FALHOU! " + itemName(slug) + " perdeu 1 tier (agora T" + check.current + ").";
    p.forge[slug] = Math.max(0, check.current - 1);
    if (p.forge[slug] <= 0) delete p.forge[slug];
  } else {
    // Falha sem downgrade
    resultMsg = "A forja FALHOU! Os materiais foram consumidos mas o item permanece T" + check.current + ".";
  }

  // Remove dos equipamentos (se equipado)
  for (const slot of SLOTS) {
    if (p.equip[slot] && p.equip[slot].item === slug) {
      delete p.equip[slot];
      break;
    }
  }

  // Coloca na Exaltation Box
  if (resultItem) {
    if (!p.exaltationBox) p.exaltationBox = [];
    // Remove do depot se estava la
    const di = p.depot.indexOf(resultItem);
    if (di >= 0) p.depot.splice(di, 1);
    // Remove da bag se estava la
    if (p.bag && p.bag[resultItem]) { delete p.bag[resultItem]; }
    // Adiciona na exaltation box
    p.exaltationBox.push(resultItem);
  }

  // Notificacao
  p.depotNotification = (p.depotNotification || 0) + 1;

  return {
    ok: true,
    success: success,
    tier: success ? next : check.current,
    msg: resultMsg + " (" + cost.pct + "% de chance, roll: " + Math.round(roll) + ")",
    cost: cost.gold,
    broken: !resultItem,
    downgraded: !success && cost.downgrade && check.current > 0 && !cost.break,
  };
}

/* ---------- Depot ---------- */

/* Move um item equipado para o depot (max 30 slots) */
function depotStore(p, slug) {
  ensureForge(p);
  if (p.depot.length >= 30) return { ok: false, msg: "Depot cheio (30 slots)." };

  // Remove dos equipamentos
  for (const slot of SLOTS) {
    if (p.equip[slot] && p.equip[slot].item === slug) {
      delete p.equip[slot];
      break;
    }
  }
  // Remove da bag
  if (p.bag && p.bag[slug]) { delete p.bag[slug]; }

  p.depot.push(slug);
  return { ok: true, msg: itemName(slug) + " guardado no Depot." };
}

/* Retira um item do depot para a mochila */
function depotRetrieve(p, slug) {
  ensureForge(p);
  const idx = p.depot.indexOf(slug);
  if (idx < 0) return { ok: false, msg: "Item nao esta no depot." };
  if (!addItem(p, slug, 1)) return { ok: false, msg: "Mochila cheia." };
  p.depot.splice(idx, 1);
  return { ok: true, msg: itemName(slug) + " retirado do Depot." };
}

/* Retira da Exaltation Box */
function exaltationRetrieve(p, slug) {
  ensureForge(p);
  const idx = (p.exaltationBox || []).indexOf(slug);
  if (idx < 0) return { ok: false, msg: "Item nao esta na Exaltation Box." };
  if (!addItem(p, slug, 1)) return { ok: false, msg: "Mochila cheia." };
  p.exaltationBox.splice(idx, 1);
  return { ok: true, msg: itemName(slug) + " retirado da Exaltation Box." };
}

/* Equipa direto do depot */
function depotEquip(p, slug) {
  ensureForge(p);
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Item nao pode ser equipado." };
  if (typeof canEquipItem === "function") {
    const chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) return { ok: false, msg: chk.msg };
  }
  // Remove do depot
  const idx = p.depot.indexOf(slug);
  if (idx < 0) return { ok: false, msg: "Item nao esta no depot." };
  p.depot.splice(idx, 1);
  // Guarda o que estava no slot
  const old = p.equip[it.s];
  if (old) p.depot.push(old.item);
  p.equip[it.s] = { item: slug, count: 1 };
  if (it.th && p.equip.shield) {
    p.depot.push(p.equip.shield.item);
    delete p.equip.shield;
  }
  return { ok: true, msg: itemName(slug) + " equipado." };
}

/* Equipa direto da Exaltation Box */
function exaltationEquip(p, slug) {
  ensureForge(p);
  const it = GAMEDATA.items[slug];
  if (!it || !it.s) return { ok: false, msg: "Item nao pode ser equipado." };
  if (typeof canEquipItem === "function") {
    const chk = canEquipItem(p, slug, it.s);
    if (!chk.ok) return { ok: false, msg: chk.msg };
  }
  const idx = (p.exaltationBox || []).indexOf(slug);
  if (idx < 0) return { ok: false, msg: "Item nao esta na Exaltation Box." };
  p.exaltationBox.splice(idx, 1);
  const old = p.equip[it.s];
  if (old) p.exaltationBox.push(old.item);
  p.equip[it.s] = { item: slug, count: 1 };
  if (it.th && p.equip.shield) {
    p.exaltationBox.push(p.equip.shield.item);
    delete p.equip.shield;
  }
  // Limpa notificacao ao interagir
  p.depotNotification = 0;
  return { ok: true, msg: itemName(slug) + " equipado da Exaltation Box." };
}

/* ---------- Dust Fusion ---------- */

/* Fusiona N dusts inferiores em 1 superior */
function dustFuse(p, fromSlug) {
  ensureForge(p);
  const rule = FORGE_FUSION[fromSlug];
  if (!rule) return { ok: false, msg: "Fusao nao disponivel para " + fromSlug + "." };
  const have = p.dusts[fromSlug] || 0;
  if (have < rule.need) return { ok: false, msg: "Precisa de " + rule.need + " " + FORGE_DUSTS[fromSlug].name + " (tem " + have + ")." };
  p.dusts[fromSlug] -= rule.need;
  p.dusts[rule.to] = (p.dusts[rule.to] || 0) + 1;
  return { ok: true, msg: "1 " + FORGE_DUSTS[rule.to].name + " criado de " + rule.need + " " + FORGE_DUSTS[fromSlug].name + "." };
}

/* Converte Exalted Dust em Exalted Core */
function dustToCore(p) {
  ensureForge(p);
  const need = EXALTED_CORE.costDust;
  const have = p.dusts["dust-exalted"] || 0;
  if (have < need) return { ok: false, msg: "Precisa de " + need + " Exalted Dust (tem " + have + ")." };
  p.dusts["dust-exalted"] -= need;
  p.exaltedCores = (p.exaltedCores || 0) + 1;
  return { ok: true, msg: "1 Exalted Core criado de " + need + " Exalted Dust." };
}

/* ---------- Avatar (Transcendence) ---------- */

/* Estado do avatar por personagem */
function ensureAvatar(p) {
  p._avatar = p._avatar || { active: false, started: 0, duration: 15000, cooldown: 180000, lastUsed: 0 };
}

/* Tenta ativar o avatar. So pode se weapon estiver forjada. */
function avatarActivate(p) {
  ensureAvatar(p);
  const av = p._avatar;
  const now = Date.now();
  // Cooldown
  if (now - av.lastUsed < av.cooldown) {
    const rem = Math.ceil((av.cooldown - (now - av.lastUsed)) / 1000);
    return { ok: false, msg: "Avatar em recarga: " + rem + "s restantes." };
  }
  // Precisa ter weapon forjada
  const w = p.equip.weapon;
  if (!w) return { ok: false, msg: "Equipe uma arma forjada para usar o Avatar." };
  const tier = (p.forge && p.forge[w.item]) || 0;
  if (tier <= 0) return { ok: false, msg: "A arma precisa estar forjada (Transcendence)." };
  // Ativa
  av.active = true;
  av.started = now;
  av.lastUsed = now;
  // Buff: +tier*3% dano, +tier*5% velocidade
  const ef = FORGE_EFFECTS.weapon;
  const dmgBonus = ef.perTier(tier);
  const spdBonus = ef.perTier2(tier);
  av.dmgBonus = dmgBonus;
  av.spdBonus = spdBonus;
  return { ok: true, dmg: dmgBonus, spd: spdBonus, msg: "AVATAR ATIVADO! +" + dmgBonus + "% dano, +" + spdBonus + "% vel por 15s!" };
}

/* Tick do avatar: desativa quando expira */
function avatarTick(p, dt) {
  ensureAvatar(p);
  const av = p._avatar;
  if (!av.active) return;
  if (Date.now() - av.started >= av.duration) {
    av.active = false;
    if (typeof addLog === "function") addLog("info", "<b style='color:#d4af37'>Avatar expirou.</b>");
  }
}

/* Bonus de dano do avatar (chamado pelo combate) */
function avatarDmgBonus(p) {
  ensureAvatar(p);
  return p._avatar.active ? (p._avatar.dmgBonus || 0) : 0;
}

/* Bonus de velocidade do avatar */
function avatarSpdBonus(p) {
  ensureAvatar(p);
  return p._avatar.active ? (p._avatar.spdBonus || 0) : 0;
}

/* Avatar ativo? */
function avatarActive(p) {
  ensureAvatar(p);
  return p._avatar.active;
}

/* ---------- Forge Totals (efeitos agregados dos itens equipados) ---------- */
function forgeTotals(p) {
  ensureForge(p);
  const t = {
    onslaught: 0,   // +% crit extra damage
    dodge: 0,       // % dodge chance
    momentum: 0,    // % cooldown reduction
    amplification: 0, // % heal amp
    avatarWeapon: false,
    avatarTier: 0,
  };
  for (const slot of FORGE_SLOTS) {
    const e = p.equip[slot];
    if (!e) continue;
    const tier = p.forge[e.item] || 0;
    if (!tier) continue;
    const ef = FORGE_EFFECTS[slot];
    if (!ef) continue;
    if (slot === "helmet") t.onslaught += ef.perTier(tier);
    else if (slot === "armor") t.dodge += ef.perTier(tier);
    else if (slot === "legs") t.momentum += ef.perTier(tier);
    else if (slot === "weapon") { t.avatarWeapon = true; t.avatarTier = tier; }
    else if (slot === "boots") t.amplification += ef.perTier(tier);
  }
  return t;
}

/* ---------- Tier display helper ---------- */

/* Texto do tier para exibicao: "T3" ou "" */
function forgeTierText(slug) {
  if (!G.p || !G.p.forge) return "";
  const tier = G.p.forge[slug] || 0;
  return tier > 0 ? "T" + tier : "";
}

/* Classe CSS do tier para borda */
function forgeTierClass(slug) {
  if (!G.p || !G.p.forge) return "";
  const tier = G.p.forge[slug] || 0;
  if (tier >= 9) return "tier-legendary";
  if (tier >= 7) return "tier-epic";
  if (tier >= 5) return "tier-rare";
  if (tier >= 1) return "tier-forged";
  return "";
}
