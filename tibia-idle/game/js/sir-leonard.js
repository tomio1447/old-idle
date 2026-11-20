/* sir-leonard.js — Boss Sir Leonard (Book World, nível 150+).
 *
 * BOSS SIMPLES (sem mecânica): ficha oficial do update 15.10
 * (tibiawiki.com.br / tibia.fandom.com — o monstro não existe no dump
 * Canary). Boss final da Book World Quest ("Between the Lines"),
 * bosstiary Bane, cooldown oficial 7200s (2h), spawntype Triggered.
 *
 * Ficha oficial:
 *   hp 22.000 · exp 26.000 · mitigation 2.22 · Centaurs · race_id 2680
 *   melee 180-420 · UE de Terra 0-480 · Death Strike 400-520 ·
 *   Bomba Musical (death) 400-430 · invoca até 5 Crusader Guardian
 *   (summon oficial, "similar to a regular Crusader" — hp 3.400, exp 0).
 *   Resistências: death +30, physical +10, earth +5, energy -5, ice -10
 *   (fire/holy neutras 100%). pushable não, pushobjects sim,
 *   paraimmune, sees invisible, atravessa fire/energy/poison.
 *
 * Looktype: o Sir Leonard NÃO existe no DAT convertido (pixel-diff de
 * todos os looktypes 1-2409 confirmou — conteúdo 15.10 ausente, mesmo
 * caso do Bramble Wyrmling). A sheet game/assets/mob/sir-leonard.png foi
 * montada do GIF oficial da wiki (8 frames 64×64, direção única
 * replicada nas 4 linhas — padrão bramble-wyrmling / moonstone-miner).
 * O Crusader Guardian reusa a sheet do Crusader da hunt.
 *
 * Coordenadas absolutas do RME (fornecidas pelo usuário):
 *   centerroom  {1022,1028,7}
 *   bossspawn   {1021,1025,7}
 *   playerspawn {1022,1032,7}
 * Sala: game/maps/sir_leonard.otbm (publicada byte-igual de
 * beta-maps/bossesroom/sir_leonard.otbm — 25×24 em z=7, bounds
 * 1010..1034 × 1016..1039; os três pontos são caminháveis e conectados
 * no componente de 125 sqm).
 *
 * BOOK WORLD QUEST (missão de boss, level 150+):
 *   M1 — Eliminar 1000 monstros em Book World (MISSION_DEFS["book-world"],
 *        counter "kills") → libera o acesso ao Sir Leonard
 *        (requirement.mission enforced).
 *   M2 — Derrotar o Sir Leonard → outfit Illuminator com addon 1+2
 *        (1x por conta — claim em p.missionsDone["book-world:outfit"],
 *        mergeFlagMap sincroniza para acc.missionsDone).
 *   Render próprio (renderDetail) mostra as 2 missões + caixa de reward.
 *
 * Este arquivo também roda no sandbox vm do servidor
 * (authoritative_engine): lá só a parte de itens/hunt executa
 * (BOSS_DEFS/MISSION_DEFS/QUEST_DEFS não existem no vm); o registro do
 * monstro no MONSTERS do servidor é via module.exports (require direto,
 * mesmo padrão do mimar-haffar.js / book-world.js).
 */
"use strict";

/* Cooldown oficial: 7200s (2h) — bosstiary Bane (tibiawiki). */
const SIR_LEONARD_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const SIR_LEONARD_ROOM = {
  otbm: "sir_leonard",
  name: "Sir Leonard Room",
  center: { x: 1022, y: 1028, z: 7 },
  spawn: { x: 1022, y: 1032, z: 7 },   // playerspawn
  boss:  { x: 1021, y: 1025, z: 7 },   // bossspawn
};

const SIR_LEONARD_STATS = {
  name: "Sir Leonard",
  hp: 22000,
  exp: 26000,
  damage: 350,
  armor: 0,
  defense: 80,
};

/* Itens de loot novos (cids do appearances.dat 15.x). Preços oficiais
 * (TibiaWiki): axe of sir leonard = Yasir/Fiona 49.000; helmet of sir
 * leonard = Yasir/Fiona 46.000; gearwheel chain = Flint 5.000;
 * white gem = joalheria 12.000; blank imbuement scroll 25.000
 * (pedido). Os 5 itens Ink e a proficiency catalyst não têm comprador
 * NPC (TibiaWiki sellto "--" / "Jogadores") → sell 0. */
const SIR_LEONARD_LOOT_ITEMS = {
  "ink-blade":              { n: "ink blade",              s: null, t: "loot", cid: 51270, w: 3.5,  sell: 0,     npcSell: 0 },
  "ink-quill":              { n: "ink quill",              s: null, t: "loot", cid: 51271, w: 0.8,  sell: 0,     npcSell: 0 },
  "ink-claw":               { n: "ink claw",               s: null, t: "loot", cid: 51272, w: 4.0,  sell: 0,     npcSell: 0 },
  "ink-vine":               { n: "ink vine",               s: null, t: "loot", cid: 51273, w: 2.0,  sell: 0,     npcSell: 0 },
  "ink-brush":              { n: "ink brush",              s: null, t: "loot", cid: 51274, w: 1.5,  sell: 0,     npcSell: 0 },
  "axe-of-sir-leonard":     { n: "axe of sir leonard",     s: null, t: "loot", cid: 51429, w: 0.25, sell: 49000, npcSell: 49000 },
  "helmet-of-sir-leonard":  { n: "helmet of sir leonard",  s: null, t: "loot", cid: 51430, w: 0.25, sell: 46000, npcSell: 46000 },
  "gearwheel-chain":        { n: "gearwheel chain",        s: null, t: "loot", cid: 21170, w: 10.0, sell: 5000,  npcSell: 5000 },
  "proficiency-catalyst":   { n: "proficiency catalyst",   s: null, t: "loot", cid: 51588, w: 5.0,  sell: 0,     npcSell: 0 },
  "blank-imbuement-scroll": { n: "blank imbuement scroll", s: null, t: "loot", cid: 51442, w: 2.5,  sell: 25000, npcSell: 25000 },
  "white-gem":              { n: "white gem",              s: null, t: "loot", cid: 32769, w: 0.3,  sell: 12000, npcSell: 12000 },
};

/* Crusader Guardian — summon oficial do Sir Leonard ("similar to a
 * regular Crusader", hp 3.400 / exp 0, TibiaWiki). Sem loot/exp e sem
 * bestiário — não é uma criatura caçável. */
const CRUSADER_GUARDIAN = {
  name: "Crusader Guardian",
  hp: 3400, exp: 0,
  speed: 160, armor: 55, defense: 50,
  damage: 240, element: "physical", attackSpeed: 2000,
  mitigation: 0,
  resist: {},
  skills: [
    { el: "physical", min: 80, max: 260, int: 2000, ch: 30, range: 1 },
  ],
  looktype: 1847, race: "blood", targetDistance: 1,
  staticAttack: 90, imune: ["paralyze", "invisible"],
  loot: [],
  grupo: "quests",
};

/* Sir Leonard — monstro novo (update 15.10, ausente do dump Canary).
 * Ficha oficial: melee 180-420, UE de Terra 0-480, Death Strike
 * 400-520, Bomba Musical (death) 400-430, até 5 Crusader Guardian. */
const SIR_LEONARD = {
  name: "Sir Leonard",
  boss: 1,
  hp: SIR_LEONARD_STATS.hp,
  exp: SIR_LEONARD_STATS.exp,
  speed: 200,
  armor: SIR_LEONARD_STATS.armor,
  defense: SIR_LEONARD_STATS.defense,
  damage: SIR_LEONARD_STATS.damage,
  element: "physical",
  attackSpeed: 2000,
  mitigation: 2.22,
  /* Oficiais: phys 90/earth 95/death 70 (resiste) · energy 105/ice 110
   * (fraco) · fire/holy neutras. */
  resist: { physical: 10, earth: 5, death: 30, energy: -5, ice: -10 },
  looktype: 0,
  race: "blood",
  raceId: 2680,
  targetDistance: 1,
  staticAttack: 90,
  imune: ["paralyze", "invisible"],
  skills: [
    /* Oficiais (TibiaWiki): */
    { el: "physical", min: 180, max: 420, int: 2000, ch: 30, range: 1 },
    { el: "earth", min: 0, max: 480, int: 2000, ch: 15, radius: 4, fx: "earth-area", campo: 1 },
    { el: "death", min: 400, max: 520, int: 2000, ch: 15, range: 7, miss: "death", alvo: 1 },
    { el: "death", min: 400, max: 430, int: 2000, ch: 12, radius: 3, fx: "death-area", campo: 1 },
    /* Summon: até 5 Crusader Guardian (o motor usa o nome "summon" +
     * summonSlug/summonCount). */
    { el: "physical", min: 0, max: 0, int: 4000, ch: 15, n: "summon",
      summonSlug: "crusader-guardian", summonCount: 5, range: 7 },
  ],
  loot: [
    /* Tabela oficial (tibiawiki.com.br): comum 1-20 platinum;
     * incomum bronze amulet/gearwheel chain/protection amulet/silver
     * amulet/time ring; semi-raro axe ring/death ring; raro ancient
     * shield/axe of sir leonard/blank imbuement scroll/green gem/
     * helmet of sir leonard/knight armor/knight axe/knight legs/
     * proficiency catalyst/warrior helmet/white gem + stone skin
     * amulet (Fandom); muito raro os 5 itens Ink. */
    { chance: 100, min: 1, max: 20, item: "platinum-coin" },
    { chance: 10, max: 1, item: "bronze-amulet" },
    { chance: 10, max: 1, item: "gearwheel-chain" },
    { chance: 10, max: 1, item: "protection-amulet" },
    { chance: 10, max: 1, item: "silver-amulet" },
    { chance: 10, max: 1, item: "time-ring" },
    { chance: 5, max: 1, item: "axe-ring" },
    { chance: 5, max: 1, item: "death-ring" },
    { chance: 1.5, max: 1, item: "ancient-shield" },
    { chance: 1.5, max: 1, item: "axe-of-sir-leonard" },
    { chance: 1.5, max: 1, item: "blank-imbuement-scroll" },
    { chance: 1.5, max: 1, item: "green-gem" },
    { chance: 1.5, max: 1, item: "helmet-of-sir-leonard" },
    { chance: 1.5, max: 1, item: "knight-armor" },
    { chance: 1.5, max: 1, item: "knight-axe" },
    { chance: 1.5, max: 1, item: "knight-legs" },
    { chance: 1.5, max: 1, item: "proficiency-catalyst" },
    { chance: 1.5, max: 1, item: "stone-skin-amulet" },
    { chance: 1.5, max: 1, item: "warrior-helmet" },
    { chance: 1.5, max: 1, item: "white-gem" },
    { chance: 0.5, max: 1, item: "ink-blade" },
    { chance: 0.5, max: 1, item: "ink-brush" },
    { chance: 0.5, max: 1, item: "ink-claw" },
    { chance: 0.5, max: 1, item: "ink-quill" },
    { chance: 0.5, max: 1, item: "ink-vine" },
  ],
  voices: {
    int: 5000,
    ch: 10,
    list: [
      { t: "Joran! Each pen is indeed mightier than *your* sword!" },
      { t: "Miserable wretch! You won't save Tibia's colours!" },
      { t: "Yvette! Your annoying fiddling will not save you and your would-be lover!" },
      { t: "Surrender or die!" },
    ],
  },
  grupo: "quests",
};

const SIR_LEONARD_DATA = {
  monsterSlug: "sir-leonard",
  monster: SIR_LEONARD,
  registerMonsters(monsters) {
    if (monsters) {
      monsters["sir-leonard"] = SIR_LEONARD;
      monsters["crusader-guardian"] = CRUSADER_GUARDIAN;
    }
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = SIR_LEONARD_DATA;

/* ── Book World Quest ── */

const BOOK_WORLD_QUEST_ID = "book-world-quest";

/* Missão 1: contagem de kills na hunt book-world (o contador "kills"
 * já é incrementado por kill — handleMissionKill no cliente e
 * progress.kills no engine). */
const BOOK_WORLD_MISSION_DEF = {
  "book-world": {
    title: "Missão: Book World — 1000 monstros",
    tasks: [{
      counter: "kills", target: 1000,
      label: "Eliminar 1000 monstros em Book World",
    }],
    completeReward: { bossAccess: "sir-leonard", bossName: "Sir Leonard" },
  },
};

function bookWorldMissionKills(p) {
  const st = p && p.missions && p.missions["book-world"];
  const prog = (st && st.progress) || {};
  if (Number(prog.kills) > 0) return Number(prog.kills) || 0;
  let sum = 0;
  for (const v of Object.values(prog)) sum += Number(v) || 0;
  return sum;
}

function bookWorldQuestState(p) {
  const bosses = (p && p.bosses) || {};
  const m1k = bookWorldMissionKills(p);
  const m1 = m1k >= 1000 || !!(p && p.missionsDone && p.missionsDone["book-world"]);
  const m2 = Number(bosses["sir-leonard"] && bosses["sir-leonard"].kills) > 0;
  const done = (p && p.missionsDone) || {};
  return {
    reqLevel: (p && Number(p.level)) >= 150,
    m1: { done: m1, kills: Math.min(m1k, 1000), target: 1000 },
    m2: { done: m2, kills: m2 ? 1 : 0, target: 1 },
    claimed: { outfit: !!done["book-world:outfit"] },
    complete: m2,
  };
}

function bookWorldClaim(p, key, value) {
  p.missionsDone = p.missionsDone || {};
  p.missionsDone["book-world:" + key] = value === undefined ? true : value;
  if (typeof syncMissionsToAccount === "function") syncMissionsToAccount(p);
}

/* Outfit Illuminator addon 1+2 (wiki: male_id 1860, female_id 1861).
 * No catálogo: "illuminator-f" = 1861 (F) e "illuminator-m" = 1860 (M)
 * — a entrada 1860 estava rotulada como feminina; o patch corrige o id
 * e o sexo para o masculino oficial. */
function bookWorldGrantOutfit(p) {
  if (typeof ensureWardrobe === "function") ensureWardrobe(p);
  p.wardrobe = p.wardrobe || {};
  p.wardrobe.outfits = p.wardrobe.outfits || {};
  // 2 = addon 1 + addon 2 (ownedAddonMask: count>=2 → mask 3).
  p.wardrobe.outfits["illuminator-m"] = 2;
  p.wardrobe.outfits["illuminator-f"] = 2;
  try {
    const acc = (typeof sessionAccount === "function") ? sessionAccount() : null;
    if (acc) {
      acc.cosmetics = acc.cosmetics || {};
      acc.cosmetics.outfits = acc.cosmetics.outfits || {};
      acc.cosmetics.outfits["illuminator"] = 2;
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    }
  } catch (e) { /* offline */ }
}

function renderBookWorldQuestDetail(q, ui) {
  const p = G.p;
  if (typeof pullAccountMissions === "function") pullAccountMissions(p);
  const st = bookWorldQuestState(p);
  const fmtK = (n) => (typeof fmtFull === "function" ? fmtFull(n) : String(n));
  const row = (label, cur, target, done) =>
    `<div class="shop-row"><span class="info">${label}</span><b style="color:${done ? "#9ce84a" : "#d4af37"}">${done ? "✓ " : ""}${fmtK(cur)}/${fmtK(target)}</b></div>`;
  const reqRow = (label, ok) =>
    `<div class="shop-row"><span class="info">${label}</span><b style="color:${ok ? "#9ce84a" : "#ff9a6a"}">${ok ? "✓" : "✗"}</b></div>`;
  const rewardsUnlocked = st.m2.done;
  const outfitBox = `<section class="quest-detail-panel mb-reward-box"><div class="hunt-best-title">OUTFIT</div>
    ${st.claimed.outfit
      ? `<div class="mb-outfit-granted">${typeof questOutfitPreviewHtml === "function" ? questOutfitPreviewHtml({ base: "illuminator", addons: 3 }, 40) : ""}<span class="tiny" style="color:#9ce84a">✓ Resgatada — Illuminator (addon 1+2)</span></div>`
      : `<div class="mb-outfit-granted">${typeof questOutfitPreviewHtml === "function" ? questOutfitPreviewHtml({ base: "illuminator", addons: 3 }, 40) : ""}</div>
         <button type="button" class="sm primary quest-action" id="bw-claim-outfit" ${rewardsUnlocked ? "" : "disabled"}>RESGATAR</button>`}
  </section>`;

  ui.body.innerHTML = `<div class="panel-title">${q.name} — Level ${q.level}+<span class="spacer"></span><button class="sm" id="boss-quest-close">Fechar</button></div>
    <div class="panel-body quest-detail-body">
      <div class="quest-detail-desc">${q.description || ""}</div>
      <section class="quest-detail-panel"><div class="hunt-best-title">REQUISITOS</div>
        ${reqRow("Level 150+", st.reqLevel)}
        <div class="tiny dim">A quest é completada apenas 1 vez por conta.</div>
      </section>
      <section class="quest-detail-panel"><div class="hunt-best-title">MISSÕES</div>
        ${row("Missão 1 — Eliminar monstros em Book World", st.m1.kills, st.m1.target, st.m1.done)}
        <div class="tiny dim" style="margin:-4px 0 6px 4px">Recompensa: acesso ao boss Sir Leonard</div>
        ${row("Missão 2 — Derrotar o Sir Leonard", st.m2.kills, st.m2.target, st.m2.done)}
      </section>
      <section class="quest-detail-panel"><div class="hunt-best-title">REWARD${rewardsUnlocked ? "" : " — complete a Missão 2"}</div>
        <div class="mb-rewards-grid">${outfitBox}</div>
      </section>
      <button class="sm" id="boss-quest-back">Voltar</button>
    </div>`;

  $("#boss-quest-close").onclick = () => {
    ui.modal.classList.remove("show");
    ui.body.classList.remove("quest-detail-shell");
  };
  $("#boss-quest-back").onclick = () => { openQuestsModal(); };

  if (!st.claimed.outfit) {
    const btn = $("#bw-claim-outfit");
    if (btn) btn.onclick = () => {
      if (!rewardsUnlocked) return;
      bookWorldGrantOutfit(p);
      bookWorldClaim(p, "outfit");
      if (typeof addLog === "function") addLog("level", "Outfit <b>Illuminator</b> (addon 1+2) desbloqueada!");
      if (typeof toast === "function") toast("Outfit Illuminator desbloqueada!", "level");
      renderBookWorldQuestDetail(q, ui);
    };
  }
}

(function registerSirLeonard() {
  if (typeof GAMEDATA === "undefined") return;

  const items = GAMEDATA.items || (GAMEDATA.items = {});
  for (const slug in SIR_LEONARD_LOOT_ITEMS) {
    const def = SIR_LEONARD_LOOT_ITEMS[slug];
    if (!items[slug]) items[slug] = def;
    else {
      if (def.sell != null) items[slug].sell = def.sell;
      if (def.npcSell != null) items[slug].npcSell = def.npcSell;
      if (def.cid != null && items[slug].cid == null) items[slug].cid = def.cid;
      if (def.w != null && items[slug].w == null) items[slug].w = def.w;
      if (def.n && !items[slug].n) items[slug].n = def.n;
    }
  }

  /* Monstros novos (ausentes do dump Canary) — registra nos dois
   * catálogos para o spawn/loot resolverem igual aos demais bosses. */
  if (typeof MONSTERDATA !== "undefined" && MONSTERDATA) {
    MONSTERDATA["sir-leonard"] = SIR_LEONARD;
    MONSTERDATA["crusader-guardian"] = CRUSADER_GUARDIAN;
  }
  GAMEDATA.monsters = GAMEDATA.monsters || {};
  GAMEDATA.monsters["sir-leonard"] = SIR_LEONARD;
  GAMEDATA.monsters["crusader-guardian"] = CRUSADER_GUARDIAN;

  if (typeof MOBSHEETS !== "undefined" && MOBSHEETS) {
    if (!MOBSHEETS["sir-leonard"])
      MOBSHEETS["sir-leonard"] = { ch: 64, cols: 9, cw: 64, rows: 4 };
    /* O Crusader Guardian reusa a arte do Crusader da hunt —
     * assets/mob/crusader-guardian.png é cópia de crusader.png. */
    if (!MOBSHEETS["crusader-guardian"])
      MOBSHEETS["crusader-guardian"] = { ch: 64, cols: 9, cw: 64, rows: 4 };
  }

  /* Hunt técnica invisível: arena da bossroom para o newBossCombat ter
   * colisão/spawn e o boss nascer na célula. */
  if (!GAMEDATA.hunts) GAMEDATA.hunts = {};
  GAMEDATA.hunts["sir-leonard-room"] = {
    name: SIR_LEONARD_ROOM.name,
    hidden: true,
    level: 150,
    minLevel: 150,
    monsters: ["sir-leonard"],
    color: "#3a4a6a",
    scene: "library",
    otbm: SIR_LEONARD_ROOM.otbm,
    otbmFloor: 7,
    otbmSpawn: SIR_LEONARD_ROOM.spawn,
    otbmMobBounds: Object.assign({ w: 1, h: 1 }, SIR_LEONARD_ROOM.boss),
    avgHp: SIR_LEONARD_STATS.hp,
    avgExp: SIR_LEONARD_STATS.exp,
    avgDamage: SIR_LEONARD_STATS.damage,
    avgArmor: SIR_LEONARD_STATS.armor,
    avgGold: 100,
    respawn: 1,
    pack: 1,
    cat: "boss-room",
  };

  /* Missão 1 da Book World Quest: 1000 kills em Book World libera o
   * acesso ao boss. */
  if (typeof MISSION_DEFS !== "undefined")
    Object.assign(MISSION_DEFS, BOOK_WORLD_MISSION_DEF);

  if (typeof QUEST_DEFS !== "undefined") {
    QUEST_DEFS[BOOK_WORLD_QUEST_ID] = {
      id: BOOK_WORLD_QUEST_ID,
      name: "Book World Quest",
      level: 150,
      questType: "boss",
      worldQuest: true,
      playable: false,
      icon: "small-treasure-chest",
      bossSprite: "sir-leonard",
      description: "A quest da Book World (Between the Lines): derrote 1000 monstros em Book World para abrir a sala do Sir Leonard e, ao vencê-lo, conquiste a outfit Illuminator com os dois addons.",
      renderDetail: renderBookWorldQuestDetail,
      rewardReady: (pp) => {
        const st = bookWorldQuestState(pp);
        return st.m2.done && !st.claimed.outfit;
      },
    };
  }

  if (typeof BOSS_DEFS === "undefined") return;

  /* Stats diretos (newBossCombat usa hp/exp/damage/armor/defense quando
   * presentes) — skills/resist/loot vêm do monstro base. Sem lista
   * própria de loot: bossLootReal usa a tabela oficial do monstro. */
  BOSS_DEFS["sir-leonard"] = {
    id: "sir-leonard",
    name: SIR_LEONARD_STATS.name,
    title: "Boss Book World",
    hunt: "sir-leonard-room",
    baseMonster: "sir-leonard",
    sprite: "sir-leonard",
    hp: SIR_LEONARD_STATS.hp,
    exp: SIR_LEONARD_STATS.exp,
    damage: SIR_LEONARD_STATS.damage,
    armor: SIR_LEONARD_STATS.armor,
    defense: SIR_LEONARD_STATS.defense,
    speed: 0.00007,
    // Book World Quest: acesso liberado pela Missão 1 (1000 kills em
    // Book World).
    requirement: {
      level: 150,
      mission: "book-world",
      enforced: true,
      text: "Book World Quest — Missão 1: eliminar 1000 monstros em Book World",
    },
    cooldown: SIR_LEONARD_COOLDOWN_MS,
  };
})();
