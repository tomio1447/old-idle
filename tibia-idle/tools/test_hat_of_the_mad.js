/* Regressão: party quest "Hat of The Mad" (PARTY QUESTS, level 30+).
 *
 * Fluxo GENÉRICO de questWaves (não usa server/annihilator.js):
 *   - 5 waves de composição FIXA via quest.waves (uma entrada = 1 monstro);
 *   - SEM boss — a quest completa quando a wave 5 é limpa;
 *   - mobs nascem em mobSpawnRange próprio (local {15..31, 8..17}), separado
 *     do spawnRange dos players ({21..23, 12..14}, 3×3 em volta do spawn);
 *   - recompensa automática por conta viva: 1× hat-of-the-mad + 1×
 *     devil-helmet no Reward Chest + 5.000 gold no saldo da conta
 *     (quest.fixedRewards + quest.goldReward, sem modal de escolha);
 *   - 1x por personagem (oneTimePerChar).
 *
 * Mapa `hat_of_the_mad.otbm` 49×39 z=7 — publicado byte-igual de
 * beta-maps/quests/ (bounds 1010..1058 × 1014..1052, 1847 cells/58 ids;
 * os 6 sprites faltantes 2119/2122/2127/2814/2821/2927 foram importados
 * por tools/import_hat_of_the_mad_assets.py). Playerspawn abs
 * {1032,1027,7} → local (22,13), componente de 197 sqm.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const OTBM = require(path.join(js, "otbm.js"));
const E = require("../server/authoritative_engine.js");
const { QUEST_DEFS } = require("../game/js/questdata.js");

/* ---------------- mapa publicado = byte-igual do beta-maps ---------------- */
const beta = fs.readFileSync(path.join(game, "beta-maps", "quests", "hat_of_the_mad.otbm"));
const pub = fs.readFileSync(path.join(game, "maps", "hat_of_the_mad.otbm"));
must(pub.equals(beta), "hat_of_the_mad.otbm publicado difere do beta-maps");

const ab = pub.buffer.slice(pub.byteOffset, pub.byteOffset + pub.byteLength);
const m = OTBM.read(ab, { z: 7 });
must(m.z === 7 && m.w === 49 && m.h === 39, "mapa deve ser 49×39 z=7");
const bb = m.sourceBounds;
must(bb.minX === 1010 && bb.minY === 1014 && bb.maxX === 1058 && bb.maxY === 1052,
  "bounds devem ser 1010..1058 × 1014..1052");

/* ---------------- spawns caminháveis + conectados ---------------- */
const ctx = { console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext("var TILEFLAGS={};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "tileflags.js"), "utf8"), ctx);
vm.runInContext("addEventListener=function(){};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);
const rt = OTBM.huntMapFromOtbm(m, ctx.TILEFLAGS);
const W = (x, y) => rt.rows[y] && rt.rows[y][x] && !rt.leg[rt.rows[y][x]].bloc &&
  !(rt.footprintBlocked && rt.footprintBlocked[x + ":" + y]);
const sx = 1032 - bb.minX, sy = 1027 - bb.minY;
must(W(sx, sy), "playerspawn {1032,1027,7} não é caminhável");
const R = new Set(), queue = [{ x: sx, y: sy }];
while (queue.length) {
  const { x, y } = queue.pop(), k = x + "," + y;
  if (R.has(k) || !W(x, y)) continue;
  R.add(k);
  for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push({ x: x + a, y: y + c });
}
must(R.size === 197, "componente do playerspawn deve ter 197 sqm (achou " + R.size + ")");

/* spawnRange dos players {21..23, 12..14}: todas as 9 células livres. */
for (let y = 12; y <= 14; y++) for (let x = 21; x <= 23; x++)
  must(W(x, y), `spawnRange: célula ${x},${y} bloqueada`);

/* mobSpawnRange {15..31, 8..17}: ≥160 sqm livres, todos conectados. */
let mobWalk = 0;
for (let y = 8; y <= 17; y++) for (let x = 15; x <= 31; x++) {
  if (!W(x, y)) continue;
  mobWalk++;
  must(R.has(x + "," + y), `mobSpawnRange: célula ${x},${y} desconectada`);
}
must(mobWalk >= 160, "mobSpawnRange deve ter ≥160 sqm livres (achou " + mobWalk + ")");

/* Cerca de FOV: a janela de câmera 21×13 central (local y13–25) era usada
 * como limite de movimento em huntMapBlocked e bloqueava a metade de cima
 * da sala (y8–18) só no cliente — mobs nasciam lá (o servidor não aplica
 * fov) e ficavam inalcançáveis. `noFovBound` remove a cerca: colisão vem
 * das paredes do OTBM. */
vm.runInContext(fs.readFileSync(path.join(js, "huntmapdata.js"), "utf8"), ctx);
{
  const m2 = OTBM.read(pub.buffer.slice(pub.byteOffset, pub.byteOffset + pub.byteLength), { z: 7 });
  const cropped = OTBM.crop(m2, QUEST_DEFS["hat-of-the-mad"].otbmFovBounds);
  cropped.idleTargetWidth = 49; cropped.idleTargetHeight = 39;
  cropped.idleFovWidth = 21; cropped.idleFovHeight = 13;
  const hm = OTBM.huntMapFromOtbm(cropped, ctx.TILEFLAGS);
  const B = (x, y) => ctx.huntMapBlocked(hm, x, y);
  must(B(20, 10) && B(20, 8), "sem noFovBound a metade de cima fica cercada pelo fov (sanidade)");
  hm.noFovBound = true;
  must(!B(20, 10) && !B(20, 8) && !B(16, 9), "noFovBound: metade de cima da sala deve ser caminhável");
  must(B(0, 0) && B(48, 38), "noFovBound: bordas continuam bloqueadas");
}

/* Todos os tiles usados têm sprite importado. */
const used = new Set();
for (const c of Object.values(m.cells)) {
  if (c.g) used.add(c.g);
  for (const i of c.items || []) used.add(i);
}
const missing = [...used].filter((id) =>
  !fs.existsSync(path.join(game, "assets", "tiles", id + ".png")));
must(missing.length === 0, "tiles sem sprite: " + missing.join(","));

/* ---------------- QUEST_DEFS ---------------- */
const q = QUEST_DEFS["hat-of-the-mad"];
must(q, "QUEST_DEFS['hat-of-the-mad'] ausente");
must(q.questType === "party" && q.playable === true, "deve ser party quest jogável");
must(q.level === 30 && q.maxPlayers === 4 && q.maxPerAccount === 4,
  "level/maxPlayers/maxPerAccount errados (design: level 30, 4 chars da conta)");
must(q.otbm === "hat_of_the_mad" && q.otbmFloor === 7, "otbm/floor errados");
must(q.otbmRuntimeWidth === 49 && q.otbmRuntimeHeight === 39, "runtime grid deve ser 49×39");
must(q.noFovBound === true, "noFovBound ausente — fov cercaria metade da sala no cliente");
must(q.otbmSpawn && q.otbmSpawn.x === 1032 && q.otbmSpawn.y === 1027 && q.otbmSpawn.z === 7,
  "otbmSpawn deve ser {1032,1027,7}");
must(q.spawnRange && q.spawnRange.minX === 21 && q.spawnRange.maxX === 23 &&
     q.spawnRange.minY === 12 && q.spawnRange.maxY === 14 && q.spawnRange.z === 7,
  "spawnRange deve ser {21..23, 12..14, z:7}");
must(q.mobSpawnRange && q.mobSpawnRange.minX === 15 && q.mobSpawnRange.maxX === 31 &&
     q.mobSpawnRange.minY === 8 && q.mobSpawnRange.maxY === 17 && q.mobSpawnRange.z === 7,
  "mobSpawnRange deve ser {15..31, 8..17, z:7}");
must(q.countdownSec === 0 && q.baseWaves === 5 && q.wavesPerPlayers === 999,
  "countdown/waves base errados");
must(Array.isArray(q.waves) && q.waves.length === 5, "quest.waves deve ter 5 waves fixas");
const EXPECT_WAVES = [
  { "orc-spearman": 5, "orc-warrior": 3 },
  { "rotworm": 2, "bonelord": 2, "minotaur-archer": 3, "minotaur-mage": 3 },
  { "minotaur": 4, "minotaur-guard": 2, "minotaur-archer": 2 },
  { "minotaur-guard": 2, "minotaur-mage": 2, "dragon": 1, "fire-devil": 1 },
  { "giant-spider": 1, "dragon": 1, "fire-devil": 3, "fire-elemental": 1 },
];
q.waves.forEach((list, i) => {
  const count = {};
  for (const slug of list) count[slug] = (count[slug] || 0) + 1;
  must(JSON.stringify(count) === JSON.stringify(EXPECT_WAVES[i]),
    "wave " + (i + 1) + " diverge: " + JSON.stringify(count));
});
const SLUGS = ["orc-spearman", "orc-warrior", "rotworm", "bonelord",
  "minotaur-archer", "minotaur-mage", "minotaur", "minotaur-guard",
  "dragon", "fire-devil", "giant-spider", "fire-elemental"];
must(q.waveMonsters.length === 12 && SLUGS.every((s) => q.waveMonsters.includes(s)),
  "waveMonsters deve listar os 12 slugs");
must(q.boss === null || q.boss === undefined, "quest NÃO deve ter boss");
must(JSON.stringify(q.fixedRewards) === JSON.stringify(["hat-of-the-mad", "devil-helmet"]),
  "fixedRewards errado");
must(q.goldReward === 5000, "goldReward deve ser 5000");
must(q.kickOnDeath === false && q.oneTimePerChar === true,
  "kickOnDeath false / oneTimePerChar true esperados");

/* ---------------- monstros + itens ---------------- */
for (const slug of SLUGS) {
  must(E.MONSTERS[slug], "MONSTERS sem " + slug);
  must(fs.existsSync(path.join(game, "assets", "mob", slug + ".png")),
    "sprite ausente: assets/mob/" + slug + ".png");
}
for (const [slug, cid] of [["hat-of-the-mad", 3210], ["devil-helmet", 3356]]) {
  const it = E.ITEMS[slug];
  must(it && it.cid === cid, "item " + slug + " ausente ou cid errado");
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    "ícone ausente: assets/item/" + slug + ".png");
}

/* ---------------- engine: waves fixas, mobSpawnCells, sem boss ---------------- */
const p = { id: "1", accountId: 9, name: "Tester", voc: "sorcerer", level: 100, hp: 50000, mp: 100 };
const mkDescriptor = () => ({
  v: 1, kind: "quest", huntId: null, bossId: null, instanceMode: "quest",
  questId: "hat-of-the-mad", activeCharacterId: "1",
  members: [{ id: "1", p, hp: 50000, mp: 100, accountId: 9 }],
  state: {
    questId: "hat-of-the-mad", instanceMode: "quest", gridW: 49, gridH: 39,
    huntId: null, blockedCells: {},
    raidEnabled: false, influencedChance: 0, fiendishChance: 0,
    players: [{ id: "1", p, hp: 50000, mp: 100, accountId: 9,
      cx: 22, cy: 13, x: 22.5 / 49, y: 13.5 / 39, dir: "s" }],
    mobs: [], pendingSpawns: [],
    questWaves: {
      total: q.baseWaves, current: 0, monstersPerWave: q.baseMonstersPerWave,
      monsterPool: q.waveMonsters, waves: q.waves, bossSlug: q.boss,
      bossSpawned: false, spawnCells: [{ x: 22, y: 13 }],
      mobSpawnCells: [{ x: 20, y: 12 }, { x: 25, y: 15 }],
      kickOnDeath: false, countdownUntil: 0,
    },
  },
});
const init = E.initializeAuthority(JSON.parse(JSON.stringify(mkDescriptor())), "hat-test", Date.now());
let auth = init.authority;
must(auth && auth.questWaves, "initializeAuthority não preservou questWaves");
must(Array.isArray(auth.questWaves.waves) && auth.questWaves.waves.length === 5,
  "questWaves.waves não chegou na authority");
for (const slug of SLUGS)
  must(auth.spawnPool.includes(slug), "spawnPool sem " + slug + " (waves explícitas)");

const advance = (ms) => E.advanceAuthorityState(init, ms, Date.now(), null,
  { inPlace: true, rawState: true });
const settleWave = (expected, label) => {
  // mobs da wave nascem (pendingSpawns → mobs em ~2s de blink) e morrem;
  // a próxima wave (ou o fim da quest) sai no respawn de 4s (telegraph -2s).
  for (const mob of auth.mobs || []) mob.hp = 0;
  for (let t = 0; t < 60 && !auth.ended; t++) {
    advance(400);
    if (auth.pendingSpawns && auth.pendingSpawns.length) {
      const slugs = auth.pendingSpawns.map((sp) => sp.mob && sp.mob.slug);
      must(JSON.stringify([...slugs].sort()) === JSON.stringify([...expected].sort()),
        label + " spawnou composição errada: " + JSON.stringify(slugs));
      for (const sp of auth.pendingSpawns) {
        const ok = (sp.mob.cx === 20 && sp.mob.cy === 12) || (sp.mob.cx === 25 && sp.mob.cy === 15);
        must(ok, label + " mob fora do mobSpawnCells: " + sp.mob.cx + "," + sp.mob.cy);
      }
      return;
    }
  }
  must(auth.ended, label + " não spawnou e a quest não terminou");
};

// Wave 1: deve nascer exatamente a composição fixa (5 spearman + 3 warrior).
advance(400);
must(auth.questWaves.current === 1, "wave 1 não iniciou");
must(auth.pendingSpawns.length === 8, "wave 1 deve ter 8 mobs, achou " + auth.pendingSpawns.length);
const w1 = {};
for (const sp of auth.pendingSpawns) w1[sp.mob.slug] = (w1[sp.mob.slug] || 0) + 1;
must(JSON.stringify(w1) === JSON.stringify(EXPECT_WAVES[0]),
  "wave 1 diverge da composição fixa: " + JSON.stringify(w1));
for (const sp of auth.pendingSpawns)
  must((sp.mob.cx === 20 && sp.mob.cy === 12) || (sp.mob.cx === 25 && sp.mob.cy === 15),
    "wave 1 spawnou fora do mobSpawnCells");
// Materializa a wave 1 (blinks ~2s) e segue o ciclo até a última.
for (let t = 0; t < 20 && (auth.pendingSpawns || []).length; t++) advance(400);
must((auth.mobs || []).length === 8, "wave 1 não materializou os 8 mobs");
settleWave(q.waves[1], "wave 2");
for (let t = 0; t < 20 && (auth.pendingSpawns || []).length; t++) advance(400);
for (const i of [2, 3, 4]) {
  settleWave(q.waves[i], "wave " + (i + 1));
  for (let t = 0; t < 20 && (auth.pendingSpawns || []).length; t++) advance(400);
}
// Última wave limpa → sem boss → quest completa na hora.
for (const mob of auth.mobs || []) mob.hp = 0;
advance(400);
must(auth.ended === true && auth.terminalReason === "quest-completed",
  "quest sem boss deve terminar com 'quest-completed' após a wave 5");

/* ---------------- asserts de fonte (engine/server/controller/ui) ---------------- */
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");
must(engineSrc.includes("qw.waves[qw.current-1]"), "engine: spawnQuestWave sem suporte a waves fixas");
must(engineSrc.includes("qw.mobSpawnCells"), "engine: mobs devem usar mobSpawnCells");
must(/!qw\.bossSlug\)\{auth\.ended=true;auth\.terminalReason="quest-completed"/.test(engineSrc),
  "engine: quest sem boss deve completar ao limpar a última wave");

const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
must(serverSrc.includes("quest.mobSpawnRange") && serverSrc.includes("mobSpawnCells"),
  "server: createQuestSharedInstance deve calcular mobSpawnCells");
must(serverSrc.includes("waves:quest.waves||null"),
  "server: questWaves descriptor deve carregar waves");

const ctrlSrc = fs.readFileSync(path.join(__dirname, "..", "server", "quest_controller.js"), "utf8");
must(ctrlSrc.includes("quest.fixedRewards") && ctrlSrc.includes("addAccountMarketGold") &&
     ctrlSrc.includes('"reward-granted"'),
  "controller: branch fixedRewards + gold na conta + publish reward-granted");

const uiSrc = fs.readFileSync(path.join(game, "js", "quest-ui.js"), "utf8");
must(uiSrc.includes('case "reward-granted"'), "quest-ui: case reward-granted ausente");
must(uiSrc.includes("INICIAR — ${q.maxPlayers} personagens"),
  "quest-ui: botão de party deve usar q.maxPlayers");

/* ---------------- controller: reward fixa por conta viva ---------------- */
(async () => {
  const assert = require("node:assert/strict");
  const events = [], saved = {}, goldCalls = [];
  const chars = [1, 2, 3, 4].map((id) => ({
    id, account_id: 9, level: 40, name: "Hero " + id, voc: "knight",
    data: { level: 40, name: "Hero " + id, voc: "knight", hp: 10, mp: 10 },
  }));
  const db = {
    findAccountByToken: async () => ({ id: 9 }),
    findCharacter: async (id) => chars.find((c) => c.id === id),
    updateCharacter: async (id, voc, level, data) => { saved[id] = data; },
    addAccountMarketGold: async (accountId, amount) => { goldCalls.push([accountId, amount]); },
  };
  const ctrl = require("../server/quest_controller").createQuestController({
    getDb: () => db,
    publishAccount: (id, type, data) => events.push(data),
    endSharedInstance: async () => {},
  });
  // listQuests expõe a quest nova.
  const listed = ctrl.listQuests().find((it) => it.id === "hat-of-the-mad");
  assert.ok(listed && listed.maxPlayers === 4 && listed.level === 30,
    "listQuests deve expor hat-of-the-mad (party, 4 jogadores, lvl 30)");
  // Lobby privado da party + join dos 4 chars da conta.
  const r = await ctrl.apiCreateLobby(db, {
    token: "test", questId: "hat-of-the-mad", characterIds: [1, 2, 3, 4],
  });
  assert.equal(r.code, 200);
  const lobby = ctrl.findLobbyById(r.body.lobbyId);
  assert.ok(lobby && lobby.lobbyType === "private", "lobby party deve ser privado");
  assert.equal(lobby.joins.get(9).chars.length, 4);
  // Fim da instância com sucesso → recompensa automática (sem reward-choice).
  lobby.phase = "combat"; lobby.instanceId = "i1";
  await ctrl.onSharedEnded(lobby.id, "quest-completed");
  const granted = events.filter((e) => e.action === "reward-granted");
  assert.equal(granted.length, 1, "deve publicar 1 reward-granted por conta viva");
  assert.deepEqual(granted[0].rewards, ["hat-of-the-mad", "devil-helmet"]);
  assert.equal(granted[0].gold, 5000);
  assert.equal(events.filter((e) => e.action === "reward-choice").length, 0,
    "quest de recompensa fixa não deve publicar reward-choice");
  assert.deepEqual(goldCalls, [[9, 5000]], "gold deve ir para o saldo da conta");
  const target = saved[granted[0].charId];
  assert.ok(target && target.quests && target.quests["hat-of-the-mad"].completed,
    "quest deve nascer completada no storage do char alvo");
  assert.ok(!target.quests["hat-of-the-mad"].inProgress, "sem flag inProgress na recompensa fixa");
  assert.equal(target.rewardChest["hat-of-the-mad"], 1);
  assert.equal(target.rewardChest["devil-helmet"], 1);

  /* ---------------- index.html ---------------- */
  const idx = fs.readFileSync(path.join(game, "index.html"), "utf8");
  assert.ok(/js\/questdata\.js\?v=/.test(idx), "index.html sem tag do questdata.js");
  assert.ok(/js\/quest-ui\.js\?v=/.test(idx), "index.html sem tag do quest-ui.js");

  console.log("ok: Hat of The Mad — party quest 30+ (4 chars da conta), 5 waves fixas sem boss, " +
    "mobSpawnRange próprio, recompensa automática hat+helmet+5000 gold por conta viva, " +
    "mapa 49×39 publicado byte-igual (componente 197 sqm)");
})().catch((e) => { console.error(e); process.exit(1); });
