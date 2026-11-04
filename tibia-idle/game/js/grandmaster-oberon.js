/* grandmaster-oberon.js — Boss Grand Master Oberon (Falcon Bastion).
 *
 * Mecânica exclusiva: Oberon precisa ser derrotado 4 vezes. Cada vez que
 * zera de HP ele revive com HP cheio e invoca 4 falcons (2 Falcon Knights +
 * 2 Falcon Paladins — ou 10% de chance de 1 mini boss do Falcon Bastion).
 * A quarta morte é a morte real. (Mecânica de debate/falas removida a
 * pedido do dono.) */
"use strict";

const OBERON_ROOM = {
  otbm: "oberonroom",
  name: "Grand Master Oberon Room",
  center: { x: 1057, y: 999, z: 7 },
  spawn: { x: 1057, y: 1001, z: 7 },
  boss: { x: 1057, y: 996, z: 7 },
};

/* Stats oficiais do Canary para Grand Master Oberon */
const OBERON_STATS = {
  name: "Grand Master Oberon",
  hp: 60000,
  exp: 20000,
  damage: 1400,
  armor: 82,
  defense: 60,
};

/* Spawn genérico de monstro numa célula do combate (usado pelos helpers do
 * Oberon e pelas skills de summon). Entra pela fila pendingSpawns — blink
 * de teleporte como nas waves normais. */
function spawnMobAt(c, slug, cx, cy, opts) {
  opts = opts || {};
  const base = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters[slug]) ||
    (typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug]);
  if (!c || !base) return null;
  const m = Object.assign({}, base);
  m.name = (typeof displayMonsterName === "function") ? displayMonsterName(base.name) : base.name;
  const as = Math.max(500, Number(m.attackSpeed) || 2000);
  const atkMin = Math.floor(as * 0.15);
  const mob = {
    slug: slug, def: m,
    boss: !!opts.boss, bossHelper: !!opts.bossHelper,
    influenced: false, fiendish: false,
    hp: m.hp, maxHp: m.hp,
    atkCd: atkMin + Math.random() * (as - atkMin),
    id: "mob-" + Math.random().toString(36).slice(2, 8),
    dir: "w", moving: false, attackAnim: 0,
    speed: 0.000045 + Math.random() * 0.000025,
    spawnAt: opts.now || Date.now(),
  };
  c.pendingSpawns = c.pendingSpawns || [];
  const occ = (typeof buildOccupancy === "function") ? buildOccupancy(c, null) : null;
  if (occ) {
    for (const sp of c.pendingSpawns) {
      if (sp && Number.isFinite(Number(sp.cx)) && Number.isFinite(Number(sp.cy)))
        occ.set(Number(sp.cx) + ":" + Number(sp.cy), true);
    }
    const ent = { cx: undefined, cy: undefined };
    if (typeof placeFree === "function") placeFree(ent, occ, cx, cy);
    if (Number.isFinite(ent.cx)) { cx = ent.cx; cy = ent.cy; }
  }
  c.pendingSpawns.push({ mob: mob, cx: cx, cy: cy, startedAt: opts.now || Date.now(), blink: 0, done: false });
  return mob;
}

/* Tabela de Loot corrigida para dropar o item correto do gamedata */
const OBERON_LOOT = [
  { chance: 30,  max: 1, item: "bone" },
  { chance: 30,  max: 1, item: "brass-shield" },
  { chance: 23,  max: 1, item: "viking-helmet" },
  { chance: 8.5, max: 1, item: "spatial-warp-almanac" }, // <-- Chance de drop ajustada e corrigida
  { chance: 3,   max: 1, item: "patch-of-fine-cloth" },
  { chance: 3,   max: 1, item: "grant-of-arms" },
  { chance: 0.5, max: 1, item: "falcon-battleaxe" },
  { chance: 0.5, max: 1, item: "falcon-longsword" },
  { chance: 0.5, max: 1, item: "falcon-mace" },
  { chance: 0.5, max: 1, item: "falcon-bow" },
  { chance: 0.5, max: 1, item: "falcon-circlet" },
  { chance: 0.5, max: 1, item: "falcon-coif" },
  { chance: 0.5, max: 1, item: "falcon-rod" },
  { chance: 0.5, max: 1, item: "falcon-wand" },
  { chance: 0.5, max: 1, item: "falcon-sai" },
  { chance: 0.3, max: 1, item: "falcon-greaves" },
  { chance: 0.5, max: 1, item: "falcon-plate" },
  { chance: 0.5, max: 1, item: "falcon-shield" },
];

const OBERON_ITEMS = {
  "spatial-warp-almanac": { n: "the spatial warp almanac", s: null, t: "loot", cid: 28865, w: 2.00, sell: 200, npcSell: 200 },
  "falcon-escutcheon":    { n: "falcon escutcheon", s: "shield", t: "shield", cid: 28722, w: 56.00, sell: 0, npcSell: 0, def: 51, lvl: 300, th: true },
  "falcon-shield":        { n: "falcon shield", s: "shield", t: "shield", cid: 28721, w: 51.00, sell: 0, npcSell: 0, def: 45, lvl: 200 },
  "grant-of-arms":        { n: "grant of arms", s: null, t: "loot", cid: 28824, w: 0.20, sell: 0, npcSell: 0 },
  "patch-of-fine-cloth":  { n: "patch of fine cloth", s: null, t: "loot", cid: 28821, w: 0.20, sell: 0, npcSell: 0 },
  "roasted-dragon-wings": { n: "roasted dragon wings", s: null, t: "food", cid: 9081, w: 0.60, sell: 0, npcSell: 0 },
};

(function registerGrandMasterOberon() {
  if (typeof GAMEDATA === "undefined") return;
  const items = GAMEDATA.items || (GAMEDATA.items = {});

  for (const slug in OBERON_ITEMS) {
    const def = OBERON_ITEMS[slug];
    if (!items[slug]) items[slug] = Object.assign({}, def);
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.s != null) items[slug].s = def.s;
      if (def.t != null) items[slug].t = def.t;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.def != null) items[slug].def = def.def;
      if (def.lvl != null) items[slug].lvl = def.lvl;
      if (def.th != null) items[slug].th = def.th;
    }
  }

  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["grand-master-oberon-room"] = {
    name: OBERON_ROOM.name,
    hidden: true,
    level: 250,
    minLevel: 250,
    monsters: ["grand-master-oberon"],
    color: "#5a4a6a",
    scene: "cave",
    otbm: OBERON_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: OBERON_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, OBERON_ROOM.boss),
    avgHp: OBERON_STATS.hp,
    avgExp: OBERON_STATS.exp,
    avgDamage: OBERON_STATS.damage,
    avgArmor: OBERON_STATS.armor,
    avgGold: 500,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  if (typeof BOSS_DEFS === "undefined") return;

  BOSS_DEFS["grand-master-oberon"] = {
    id: "grand-master-oberon",
    name: OBERON_STATS.name,
    title: "Boss Falcon Bastion",
    hunt: "grand-master-oberon-room",
    baseMonster: "grand-master-oberon",
    sprite: "grand-master-oberon",
    hp: OBERON_STATS.hp,
    exp: OBERON_STATS.exp,
    damage: OBERON_STATS.damage,
    armor: OBERON_STATS.armor,
    defense: OBERON_STATS.defense,
    speed: 0.00004,
    loot: OBERON_LOOT,
    requirement: {
      level: 250,
      text: "Requer nível 250+ (Falcon Bastion)",
    },
    cooldown: typeof BOSS_COOLDOWN !== "undefined" ? BOSS_COOLDOWN : 0,
    mechanic: "oberon-lives",
  };
})();

/* ===================================================== mecânica das 4 vidas */

function isOberonCombat(c) {
  if (!c) return false;
  if (c.boss && (c.boss.id === "grand-master-oberon" || c.boss === "grand-master-oberon")) return true;
  if (c.huntId === "grand-master-oberon-room" || (c.hunt && c.hunt.id === "grand-master-oberon-room")) return true;
  return false;
}

function getOberonMob(c) {
  if (!c || !c.mobs) return null;
  return c.mobs.find((m) => m && (m.boss || m.slug === "grand-master-oberon" || m.id === "grand-master-oberon")) || null;
}

function oberonBossState(c) {
  if (!c) return null;
  if (!c.oberon) c.oberon = { lives: 4 };
  return c.oberon;
}

function oberonBossInit(c, player) {
  if (!c || c.oberonInit) return;
  c.oberonInit = true;
  oberonBossState(c);
}

function oberonBossCanTakeDamage(c, mob) {
  return true;
}

const OBERON_MINI_BOSS_CHANCE = 0.10;
const OBERON_MINI_BOSSES = ["grand-commander-soeren", "preceptor-lazare", "grand-chaplain-gaunder", "grand-canon-dominus"];

function oberonSpawnHelpers(c, player, now) {
  if (!c || !c.huntMap) return;
  const boss = getOberonMob(c);
  const bx = boss ? (boss.cx || 10) : 10;
  const by = boss ? (boss.cy || 10) : 10;
  // 10% de chance de nascer 1 mini boss do Falcon Bastion em vez dos helpers
  if (Math.random() < OBERON_MINI_BOSS_CHANCE) {
    const slug = OBERON_MINI_BOSSES[Math.floor(Math.random() * OBERON_MINI_BOSSES.length)];
    if (typeof spawnMobAt === "function") {
      spawnMobAt(c, slug, bx, by, { boss: true, bossHelper: true, now: now });
    }
    return;
  }
  const helpers = [
    { slug: "falcon-knight", x: bx - 1, y: by },
    { slug: "falcon-knight", x: bx + 1, y: by },
    { slug: "falcon-paladin", x: bx, y: by - 1 },
    { slug: "falcon-paladin", x: bx, y: by + 1 },
  ];
  for (const h of helpers) {
    if (typeof spawnMobAt === "function") {
      spawnMobAt(c, h.slug, h.x, h.y, { bossHelper: true, now: now });
    }
  }
}

function oberonBossTick(c, p, dt, now) {
  if (!isOberonCombat(c)) return true;
  oberonBossInit(c, p);
  const st = oberonBossState(c);
  const boss = getOberonMob(c);
  if (!boss || !st) return true;

  // Zerou o HP com mais de 1 vida: revive instantâneo + 4 falcons.
  if (boss.hp <= 0 && st.lives > 1) {
    st.lives--;
    boss.hp = boss.maxHp || OBERON_STATS.hp;
    oberonSpawnHelpers(c, p, now);
  }

  return true;
}

function oberonBossHandleKill(c, m, now) {
  if (!isOberonCombat(c) || !m) return false;
  const boss = getOberonMob(c);
  if (m !== boss && !m.boss && m.slug !== "grand-master-oberon") return false;

  const st = oberonBossState(c);
  // Toda morte traz 4 falcons (ou 10% de chance de 1 mini boss).
  oberonSpawnHelpers(c, (c.player && c.player.p) || (typeof G !== "undefined" && G.p), now);
  // Com mais de 1 vida: revive com HP cheio e aborta a morte real.
  if (st && st.lives > 1) {
    st.lives--;
    m.hp = m.maxHp || OBERON_STATS.hp;
    return true; // Retorna true para a engine de combate abortar a morte
  }
  return false;
}

/* ===================================================== NPC Oberon Trader */

function npcOberonTraderHtml(p) {
  const haveShield = (p.bag && p.bag["falcon-shield"] || 0) >= 1;
  const haveGrant = (p.bag && p.bag["grant-of-arms"] || 0) >= 1;
  const haveCloth = (p.bag && p.bag["patch-of-fine-cloth"] || 0) >= 1;
  const canTrade = haveShield && haveGrant && haveCloth;

  const wingsPrice = 5000000;
  const canBuyWings = p.gold >= wingsPrice;

  const ingRow = (slug, have) => `
    <div class="shop-row" style="align-items:center;gap:6px">
      ${typeof itemImg === "function" ? itemImg(slug, { size: 32 }) : ""}
      <span style="color:${have ? '#9ce84a' : '#e85b52'}">1x ${itemName(slug)}</span>
    </div>`;

  return `
    <div class="small dim mb8">"Traga-me os itens certos e forjarei para você um escudo de verdade."</div>
    <div class="mb8" style="border:1px solid #2a2822;padding:8px;background:#14120e">
      <div class="small mb4" style="color:#ffe680">Trocar Falcon Escutcheon</div>
      <div class="tiny dim mb4">Você receberá:</div>
      <div class="shop-row mb4" style="align-items:center;gap:6px">
        ${typeof itemImg === "function" ? itemImg("falcon-escutcheon", { size: 32 }) : ""}
        <span style="color:#ffe680">1x Falcon Escutcheon</span>
      </div>
      <div class="tiny dim mb4">Requer na mochila:</div>
      ${ingRow("falcon-shield", haveShield)}
      ${ingRow("grant-of-arms", haveGrant)}
      ${ingRow("patch-of-fine-cloth", haveCloth)}
      <button class="sm mt8 primary" data-oberon-trade ${canTrade ? "" : "disabled"}>
        Forjar Falcon Escutcheon
      </button>
    </div>
    <div style="border:1px solid #2a2822;padding:8px;background:#14120e">
      <div class="small mb4" style="color:#ffe680">Comprar Roasted Dragon Wings</div>
      <div class="shop-row" style="align-items:center;gap:6px">
        ${typeof itemImg === "function" ? itemImg("roasted-dragon-wings", { size: 32 }) : ""}
        <span class="tiny dim">Você receberá: <b>Roasted Dragon Wings</b></span>
      </div>
      <div class="shop-row mb4" style="align-items:center;gap:6px">
        ${typeof itemImg === "function" ? itemImg("gold-coin", { size: 32 }) : ""}
        <span class="gold-txt">(GP) ${fmtFull(wingsPrice)}</span>
      </div>
      <button class="sm primary" data-oberon-buy-wings ${canBuyWings ? "" : "disabled"}>
        Comprar 1x Roasted Dragon Wings
      </button>
    </div>`;
}

function oberonTraderExchange(p) {
  const need = ["falcon-shield", "grant-of-arms", "patch-of-fine-cloth"];
  for (const slug of need) {
    if (!p.bag || (p.bag[slug] || 0) < 1) return { ok: false, msg: `Falta ${itemName(slug)}.` };
  }
  for (const slug of need) removeItem(p, slug, 1);
  addItem(p, "falcon-escutcheon", 1);
  return { ok: true, msg: `Você forjou <b>${itemName("falcon-escutcheon")}</b>!` };
}

function oberonTraderBuyWings(p) {
  const price = 5000000;
  if (p.gold < price) return { ok: false, msg: "Ouro insuficiente." };
  spendGold(p, price);
  addItem(p, "roasted-dragon-wings", 1);
  return { ok: true, msg: `Você comprou <b>${itemName("roasted-dragon-wings")}</b>.` };
}

/* ===================================================== AUTO-HOOKS (MONKEY PATCH)
 * Este bloco de código se injeta dinamicamente nas funções centrais de combate do jogo,
 * garantindo que a imortalidade e o debate ativem sem precisar alterar outros arquivos.
 */
(function injectOberonMechanics() {
  if (typeof window === "undefined") return;

  // Intercepta o loop de combate (tick de turnos)
  const originalCombatTick = window.combatTick;
  window.combatTick = function (c, dt) {
    if (isOberonCombat(c)) {
      oberonBossTick(c, G.p, dt, Date.now());
    }
    if (originalCombatTick) {
      return originalCombatTick.apply(this, arguments);
    }
  };

  // Intercepta o dano que causaria a morte do boss
  const originalKillMob = window.killMob || window.handleMobDeath;
  const deathFunc = function (c, mob, now) {
    if (isOberonCombat(c) && mob) {
      const activeNow = now || Date.now();
      if (oberonBossHandleKill(c, mob, activeNow)) {
        return; // Aborta a execução da morte! O boss revive.
      }
    }
    if (originalKillMob) {
      return originalKillMob.apply(this, arguments);
    }
  };

  if (window.killMob) window.killMob = deathFunc;
  else if (window.handleMobDeath) window.handleMobDeath = deathFunc;
})();