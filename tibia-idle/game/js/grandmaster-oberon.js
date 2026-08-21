/* grandmaster-oberon.js — Boss Grand Master Oberon (Falcon Bastion).
 *
 * Mecânica exclusiva: Oberon precisa ser derrotado 4 vezes. Cada vez que
 * zera de HP ele fica invulnerável e abre um modal de debate. O jogador
 * escolhe 1 entre 4 réplicas; a correta quebra a invulnerabilidade, spawna
 * 2 Falcon Knights + 2 Falcon Paladins e o combate continua normalmente. Se
 * errar, ele fica invulnerável por 10s e uma nova pergunta é oferecida.
 */
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

/* Debate: frases de Oberon e a réplica correta do jogador. */
const OBERON_DEBATE = [
  {
    phrase: "The world will suffer for its idle laziness!",
    answer: "Are you ever going to fight or do you prefer talking!",
  },
  {
    phrase: "You appear like a worm among men!",
    answer: "How appropriate, you look like something worms already got the better of!",
  },
  {
    phrase: "People fall at my feet when they see me coming!",
    answer: "Even before they smell your breath?",
  },
  {
    phrase: "This will be the end of mortal man!",
    answer: "Then let me show you the concept of mortality before it!",
  },
  {
    phrase: "I will remove you from this plane of existence!",
    answer: "Too bad you barely exist at all!",
  },
  {
    phrase: "Dragons will soon rule this world, I am their herald!",
    answer: "Excuse me but I still do not get the message!",
  },
  {
    phrase: "The true virtue of chivalry are my belief!",
    answer: "Dare strike up a Minnesang and you will receive your last accolade!",
  },
  {
    phrase: "I lead the most honourable and formidable following of knights!",
    answer: "Then why are we fighting alone right now?",
  },
  {
    phrase: "ULTAH SALID'AR, ESDO LO!",
    answer: "SEHWO ASIMO, TOLIDO ESD!",
  },
];

/* Expõe o banco de perguntas para o servidor (vm sandbox do
 * authoritative_engine). O servidor julga a resposta do debate com a MESMA
 * lista do cliente — se as cópias divergissem, nenhuma resposta acertaria. */
if (typeof window !== "undefined") window.OBERON_DEBATE = OBERON_DEBATE;

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
    cooldown: 0,
    mechanic: "oberon-debate",
  };
})();

/* ===================================================== mecânica do debate */

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
  if (!c.oberon) {
    c.oberon = {
      lives: 4,
      phase: 0,
      invulnerable: false,
      pending: false,
      nextAt: 0,
    };
  }
  return c.oberon;
}

function oberonBossInit(c, player) {
  if (!c || c.oberonInit) return;
  c.oberonInit = true;
  oberonBossState(c);
  const boss = getOberonMob(c);
  if (boss) boss.oberonInvulnerable = false;
}

function oberonBossCanTakeDamage(c, mob) {
  if (!mob) return true;
  if (isOberonCombat(c) && (mob.boss || mob.slug === "grand-master-oberon")) {
    return !mob.oberonInvulnerable;
  }
  return true;
}

function oberonSpawnHelpers(c, player, now) {
  if (!c || !c.huntMap) return;
  const boss = getOberonMob(c);
  const bx = boss ? (boss.cx || 10) : 10;
  const by = boss ? (boss.cy || 10) : 10;
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

/* Renderiza o modal de debate a partir de um payload {phrase, options}.
 * Usado pelo fluxo LOCAL (opções montadas com OBERON_DEBATE) e pelo fluxo
 * ONLINE (opções enviadas pelo servidor — que nunca envia a resposta certa).
 * `onAnswer` recebe o TEXTO da réplica escolhida ("" se fechou o modal).
 * Visual dedicado (.oberon-debate-shell): bordas escuras, fundo quase
 * transparente e texto amarelo — dá para acompanhar a luta atrás do modal. */
function oberonOpenDebateModalRemote(boss, payload, onAnswer) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modal-body");
  if (!modal || !body || !payload) { if (onAnswer) onAnswer(""); return; }

  const phrase = String(payload.phrase || "");
  const options = Array.isArray(payload.options)
    ? payload.options.map((o) => String(o)).filter(Boolean).slice(0, 6) : [];
  if (!phrase || options.length < 2) { if (onAnswer) onAnswer(""); return; }

  body.classList.remove(...(body.className.match(/\S+/g) || []).filter((s) => s.endsWith("-modal-shell")));
  body.classList.add("oberon-debate-shell");
  body.innerHTML = `
    <div class="panel-title">
      <span style="color:#ffd700">Grand Master Oberon</span>
      <button class="sm" id="oberon-debate-close" style="margin-left:auto">✕</button>
    </div>
    <div class="panel-body" style="text-align:center;max-width:440px">
      <div class="mb8" style="font-style:italic;color:#ffd700">"${phrase}"</div>
      <div class="small dim mb8" style="color:#e8c94a">Escolha a réplica correta para quebrar a invulnerabilidade.</div>
      <div id="oberon-debate-options" class="list" style="text-align:left;gap:6px;display:flex;flex-direction:column">
        ${options.map((a, i) => `<button class="sm" data-oberon-answer="${i}" style="white-space:normal;height:auto;line-height:1.3;padding:8px">${a}</button>`).join("")}
      </div>
    </div>`;
  modal.classList.add("show");

  const close = (value) => {
    modal.classList.remove("show");
    body.classList.remove("oberon-debate-shell");
    if (onAnswer) onAnswer(value);
  };
  document.getElementById("oberon-debate-close").addEventListener("click", () => close(""));
  document.querySelectorAll("#oberon-debate-options [data-oberon-answer]").forEach((btn) =>
    btn.addEventListener("click", () => close(options[Number(btn.dataset.oberonAnswer)])));
}

function oberonOpenDebateModal(boss, question, onAnswer) {
  if (!question) { if (onAnswer) onAnswer(false); return; }

  const answers = [question.answer];
  const wrong = OBERON_DEBATE
    .filter((q) => q.answer !== question.answer)
    .map((q) => q.answer)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  answers.push(...wrong);
  answers.sort(() => Math.random() - 0.5);

  oberonOpenDebateModalRemote(boss, { phrase: question.phrase, options: answers }, (chosen) => {
    if (onAnswer) onAnswer(!!chosen && chosen === question.answer);
  });
}

function oberonBossAsk(c, player, now) {
  const st = oberonBossState(c);
  const boss = getOberonMob(c);
  if (!st || !boss || st.pending || st.phase >= OBERON_DEBATE.length) return;

  st.pending = true;
  const question = OBERON_DEBATE[st.phase % OBERON_DEBATE.length];

  oberonOpenDebateModal(boss, question, (correct) => {
    st.pending = false;
    if (!c) return;
    if (correct) {
      st.lives--;
      st.phase++;
      st.invulnerable = false;
      if (boss) boss.oberonInvulnerable = false;
      oberonSpawnHelpers(c, player, Date.now());
      if (st.lives <= 0 && boss) {
        boss.oberonInvulnerable = false;
        boss.hp = 0; // Permite morrer de verdade
      }
    } else {
      st.nextAt = Date.now() + 10000;
    }
  });
}

function oberonBossTick(c, p, dt, now) {
  const tickDebug = isOberonCombat(c);
  if (typeof addLog === "function" && tickDebug) addLog("info", `[Oberon] tick ativo. boss.hp=${(getOberonMob(c)||{}).hp} lives=${(c.oberon||{}).lives} inv=${(c.oberon||{}).invulnerable}`);
  if (!tickDebug) return true;
  oberonBossInit(c, p);
  const st = oberonBossState(c);
  const boss = getOberonMob(c);
  if (!boss || !st) { if (typeof addLog === "function") addLog("bad", "[Oberon] boss ou estado nulo"); return true; }

  // Se o boss zerou o HP e ainda tem vidas: resgata, cura e abre o debate
  if (boss.hp <= 0 && st.lives > 0 && !st.invulnerable) {
    boss.hp = boss.maxHp || OBERON_STATS.hp;
    st.invulnerable = true;
    boss.oberonInvulnerable = true;
    oberonBossAsk(c, p, now);
  }

  // Se errou a resposta, reabre após 10 segundos
  if (st.invulnerable && !st.pending && st.nextAt && now >= st.nextAt) {
    st.nextAt = 0;
    oberonBossAsk(c, p, now);
  }

  // Garante imortalidade enquanto debate
  if (st.invulnerable && boss.hp <= 0) {
    boss.hp = Math.max(1, boss.maxHp || OBERON_STATS.hp);
  }

  return true;
}

function oberonBossHandleKill(c, m, now) {
  if (typeof addLog === "function") addLog("info", `[Oberon] kill trigger. combat=${isOberonCombat(c)} slug=${m && m.slug} boss=${m && m.boss} hp=${m && m.hp}`);
  if (!isOberonCombat(c) || !m) return false;
  const boss = getOberonMob(c);
  if (m !== boss && !m.boss && m.slug !== "grand-master-oberon") { if (typeof addLog === "function") addLog("info", "[Oberon] morte ignorada (nao e o boss)"); return false; }

  const st = oberonBossState(c);
  if (m.oberonInvulnerable || (st && st.invulnerable)) return true; // Impede morte real

  if (st && st.lives > 0) {
    m.hp = m.maxHp || OBERON_STATS.hp;
    m.oberonInvulnerable = true;
    st.invulnerable = true;
    oberonBossAsk(c, (c.player && c.player.p) || (typeof G !== "undefined" && G.p), now);
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