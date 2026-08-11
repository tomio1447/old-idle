/* Regressões do mapa pré-compilado e do loading v4 da Cobra Bastion. */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(value, message) { if (!value) throw new Error(message); }
function turn() { return new Promise((resolve) => setImmediate(resolve)); }

function evaluateOtbmHunt(context) {
  const source = fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8");
  const end = source.indexOf("\nif (typeof module");
  vm.createContext(context);
  vm.runInContext(source.slice(0, end), context);
}

function verifyPrecompiledMap() {
  const source = fs.readFileSync(path.join(js, "cobra-bastion-map.js"), "utf8");
  const context = { HUNTMAPS: {} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  const hm = context.HUNTMAPS["otbm:cobra_bastion"];
  const sprites = new Set();
  Object.values(hm.leg).forEach((entry) => {
    (entry.v || []).forEach((id) => sprites.add(id));
    (entry.g || []).forEach((id) => sprites.add(id));
  });

  must(crypto.createHash("sha256").update(source).digest("hex").startsWith("f0c0c23c"),
    "SHA do pré-compilado divergiu");
  must(hm.rows.length === 17 && hm.rows.every((row) => row.length === 24),
    "pré-compilado não é 24×17");
  must(hm.spawn.x === 11 && hm.spawn.y === 10 && hm.mob.length === 120,
    "spawn/zona do pré-compilado divergiu");
  must(Object.keys(hm.leg).length === 199 &&
       Object.keys(hm.footprintBlocked).length === 170 && sprites.size === 157,
    "leg/footprint/sprites do pré-compilado divergiu");
  must(hm.otbm === true && hm.legenda === hm.leg && !source.includes('"legenda":'),
    "alias legenda foi serializado em duplicidade");
}

function verifyIndexOrder() {
  const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
  const huntmaps = html.indexOf('src="js/huntmapdata.js"');
  const cobra = html.indexOf('src="js/cobra-bastion-map.js?v=cobra-loading-v16"');
  const otbm = html.indexOf('src="js/otbm.js?v=cobra-loading-v16"');
  const otbmhunt = html.indexOf('src="js/otbmhunt.js?v=cobra-loading-v16"');
  must(huntmaps >= 0 && cobra > huntmaps && otbm > cobra && otbmhunt > cobra,
    "ordem de scripts do mapa pré-compilado incorreta");
  for (const file of ["otbm", "otbmhunt", "hard-hunts", "tileanimdata",
    "tilepatterndata", "tilemap", "preload", "game"])
    must(html.includes(`src="js/${file}.js?v=cobra-loading-v16"`),
      `${file}.js sem cache-busting v4`);
}

function verifyFastPathWithoutParserOrFetch() {
  const integral = { rows: ["x"] };
  const context = {
    console, HUNTMAPS: { "otbm:cobra_bastion": integral },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  context.window = context;
  evaluateOtbmHunt(context);
  const hunt = { otbm: "cobra_bastion" };
  let callbacks = 0;
  context.huntMapFromOtbmAsync(hunt, () => callbacks++);
  must(callbacks === 1 && hunt.mapa === "otbm:cobra_bastion",
    "fast-path não resolveu sincronamente sem OTBM/fetch");
}

function verifyReloadPreservesCobraAndBrowserRefresh() {
  const cobra = { rows: ["cobra"] };
  const handlers = {};
  const context = {
    console,
    HUNTMAPS: {
      "otbm:cobra_bastion": cobra,
      "cobra-bastion": cobra,
      "otbm:dynamic": { rows: ["dynamic"] },
    },
    COBRA_BASTION_PRECOMPILED: cobra,
    TileSprites: { cache: { old: true } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener(name, handler) { handlers[name] = handler; },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), context);
  context.reloadMaps();
  must(context.HUNTMAPS["otbm:cobra_bastion"] === cobra &&
       context.HUNTMAPS["cobra-bastion"] === cobra &&
       !context.HUNTMAPS["otbm:dynamic"],
    "reloadMaps descartou a Cobra pré-compilada");
  must(Object.keys(context.TileSprites.cache).length === 0,
    "reloadMaps não limpou o cache visual");

  let prevented = false;
  handlers.keydown({
    ctrlKey: true, shiftKey: true, altKey: false, key: "r",
    preventDefault() { prevented = true; }, stopPropagation() {},
  });
  must(!prevented, "Ctrl+Shift+R ainda é capturado e impede o hard refresh");
}

async function verifyStaleParserIsSilentButCached() {
  let generation = 7;
  let releaseBuffer;
  const reports = [];
  const context = {
    console,
    HUNTMAPS: {},
    TILEFLAGS: {},
    currentMapLoadingGeneration: () => generation,
    showGameLoading(show, text, pct) { reports.push({ show, text, pct }); },
    fetch() {
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => new Promise((resolve) => { releaseBuffer = resolve; }),
      });
    },
    OTBM: {
      read() { return { w: 1, h: 1, z: 2, sourceBounds: { minX: 0, minY: 0 }, cells: {} }; },
      huntMapFromOtbm() { return { rows: ["x"], leg: { x: {} }, otbm: true }; },
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  context.window = context;
  evaluateOtbmHunt(context);

  const hunt = { otbm: "late_map" };
  const done = new Promise((resolve) => context.huntMapFromOtbmAsync(hunt, resolve));
  await turn();
  must(typeof releaseBuffer === "function", "fetch de teste não chegou ao arrayBuffer");
  generation++;
  releaseBuffer(new ArrayBuffer(1));
  await done;

  must(reports.some((entry) => entry.text === "Baixando mapa late_map..."),
    "estágio inicial do OTBM não foi reportado");
  must(!reports.some((entry) => entry.text === "Montando mapa late_map..."),
    "OTBM stale reabriu o overlay em Montando mapa");
  must(context.HUNTMAPS["otbm:late_map"] && hunt.mapa === "otbm:late_map",
    "OTBM stale não populou HUNTMAPS silenciosamente");
}

function newPreloadContext() {
  const timers = [];
  const warnings = [];
  const loading = {
    style: { display: "none" },
    querySelector() { return { style: {}, textContent: "" }; },
  };
  const context = {
    console: { warn(message) { warnings.push(message); } },
    document: { getElementById(id) { return id === "game-loading" ? loading : null; } },
    requestAnimationFrame() {},
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(js, "preload.js"), "utf8"), context);
  return { context, timers, warnings, loading };
}

function verifyFinishFallback() {
  let fixture = newPreloadContext();
  fixture.context.beginMapLoading("Preparando Cobra Bastion 184/184");
  fixture.context.finishMapLoading();
  must(fixture.loading.style.display === "flex", "rAF suspenso não foi simulado");
  fixture.timers.find((timer) => timer.delay === 350).fn();
  must(fixture.loading.style.display === "none" &&
       fixture.warnings.includes("[preload] fallback hide forçado"),
    "fallback de 350ms não fechou o overlay em 184/184");

  fixture = newPreloadContext();
  fixture.context.beginMapLoading("geração antiga");
  fixture.context.finishMapLoading();
  const staleFallback = fixture.timers.find((timer) => timer.delay === 350).fn;
  fixture.context.beginMapLoading("geração nova");
  staleFallback();
  must(fixture.loading.style.display === "flex",
    "fallback antigo fechou o overlay de uma geração nova");
}

function huntFixture(options = {}) {
  const timers = [];
  const warnings = [];
  const errors = [];
  let loaderDone;
  let combatBuilds = 0;
  let preloads = 0;
  let finishes = 0;
  let immediateHides = 0;
  const hunt = { name: "Cobra Bastion", otbm: "cobra_bastion", monsters: [] };
  const context = {
    console: {
      warn(...args) { warnings.push(args.join(" ")); },
      error(...args) { errors.push(args.join(" ")); },
    },
    GAMEDATA: { hunts: { "cobra-bastion": hunt } },
    HUNTMAPS: {},
    G: { p: { hunt: null, config: {} }, inCity: true, training: null, huntEntryToken: 0 },
    partyBlocksHunt() { return false; },
    beginMapLoading() {},
    showGameLoading(show) { if (!show) immediateHides++; },
    huntMapFromOtbmAsync(_hunt, done) { loaderDone = done; },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
    newCombat(_player, id) {
      combatBuilds++;
      if (options.combatError) throw new Error("falha simulada ao criar combate");
      return { huntId: id, huntMap: hunt.mapa ? context.HUNTMAPS[hunt.mapa] : null };
    },
    spawnWave() {}, addLog() {}, toast() {}, partyReportZone() {}, renderAll() {},
    preloadHuntMapAssets() { preloads++; return Promise.resolve(); },
    finishMapLoading() { finishes++; },
  };
  context.window = context;
  context.HUNT_ENTRY_TIMEOUT_MS = 1;
  const source = fs.readFileSync(path.join(js, "game.js"), "utf8");
  const start = source.indexOf("function startHunt");
  const end = source.indexOf("\n\nfunction resetTemplePlayerPosition", start);
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return {
    context, hunt, timers, warnings, errors,
    loaderDone: () => loaderDone,
    counts: () => ({ combatBuilds, preloads, finishes, immediateHides }),
  };
}

async function verifyLateReplacementAndTempleGuard() {
  let fixture = huntFixture();
  fixture.context.startHunt("cobra-bastion", "non-pvp");
  fixture.timers.find((timer) => timer.delay === 1).fn();
  const fallback = fixture.context.G.combat;
  const integral = { rows: ["integral"], otbm: true };
  fixture.context.HUNTMAPS["otbm:cobra_bastion"] = integral;
  fixture.hunt.mapa = "otbm:cobra_bastion";
  fixture.loaderDone()();
  await turn();
  await turn();

  let counts = fixture.counts();
  must(fixture.context.G.combat !== fallback && fixture.context.G.combat.huntMap === integral &&
       counts.combatBuilds === 2 && counts.preloads === 1 && counts.finishes === 3 &&
       counts.immediateHides >= 1,
    "OTBM tardio não substituiu o fallback integralmente");
  must(fixture.warnings.some((message) => message.includes("[hunt] OTBM tardio substituiu fallback")),
    "substituição tardia não foi registrada no log");

  fixture = huntFixture();
  fixture.context.startHunt("cobra-bastion", "non-pvp");
  fixture.timers.find((timer) => timer.delay === 1).fn();
  fixture.context.G.huntEntryToken++;
  fixture.context.G.inCity = true;
  fixture.context.G.p.hunt = null;
  fixture.context.HUNTMAPS["otbm:cobra_bastion"] = integral;
  fixture.hunt.mapa = "otbm:cobra_bastion";
  fixture.loaderDone()();
  await turn();
  counts = fixture.counts();
  must(counts.combatBuilds === 1 && counts.preloads === 0,
    "callback tardio recriou combate depois da volta ao templo");

  // Um sync de party pode marcar cidade antes de G.combat existir. Se o token
  // ainda é o mesmo, o watchdog deve restaurar a entrada solicitada.
  fixture = huntFixture();
  fixture.context.startHunt("cobra-bastion", "non-pvp");
  fixture.context.G.inCity = true;
  fixture.context.G.p.hunt = null;
  fixture.timers.find((timer) => timer.delay === 1).fn();
  counts = fixture.counts();
  must(counts.combatBuilds === 1 && fixture.context.G.combat &&
       !fixture.context.G.inCity && fixture.context.G.p.hunt === "cobra-bastion" &&
       fixture.warnings.some((message) => message.includes("watchdog restaurou estado")),
    "watchdog abandonou a entrada após sincronização de party");

  // Se o OTBM terminou, restaure no callback e entre imediatamente; não espere
  // o timeout de 7s só porque a party marcou cidade durante o fetch.
  fixture = huntFixture();
  fixture.context.startHunt("cobra-bastion", "non-pvp");
  fixture.context.G.inCity = true;
  fixture.context.G.p.hunt = null;
  fixture.context.HUNTMAPS["otbm:cobra_bastion"] = integral;
  fixture.hunt.mapa = "otbm:cobra_bastion";
  fixture.loaderDone()();
  await turn();
  await turn();
  counts = fixture.counts();
  must(counts.combatBuilds === 1 && fixture.context.G.combat.huntMap === integral &&
       fixture.warnings.some((message) => message.includes("OTBM restaurou estado")),
    "callback OTBM esperou o watchdog apesar de já estar pronto");

  // Token trocado significa retorno real/uma transição mais nova: não reviva.
  fixture = huntFixture();
  fixture.context.startHunt("cobra-bastion", "non-pvp");
  fixture.context.G.huntEntryToken++;
  fixture.context.G.inCity = true;
  fixture.context.G.p.hunt = null;
  fixture.timers.find((timer) => timer.delay === 1).fn();
  counts = fixture.counts();
  must(counts.combatBuilds === 0 && counts.immediateHides === 0,
    "watchdog antigo sobrepôs uma transição mais nova");

  // Mesmo uma exceção secundária ao criar/renderizar o combate não pode
  // impedir o watchdog de liberar o overlay.
  fixture = huntFixture({ combatError: true });
  fixture.context.startHunt("cobra-bastion", "non-pvp");
  fixture.timers.find((timer) => timer.delay === 1).fn();
  counts = fixture.counts();
  must(counts.finishes === 2 && fixture.errors.some((message) =>
    message.includes("[hunt] falha ao concluir entrada")),
  "exceção durante entrada impediu o watchdog de fechar o loading");
}

(async () => {
  verifyPrecompiledMap();
  verifyIndexOrder();
  verifyFastPathWithoutParserOrFetch();
  verifyReloadPreservesCobraAndBrowserRefresh();
  await verifyStaleParserIsSilentButCached();
  verifyFinishFallback();
  await verifyLateReplacementAndTempleGuard();
  console.log("OK: Cobra loading v4, fallback 184/184 e mapa pré-compilado validados.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
