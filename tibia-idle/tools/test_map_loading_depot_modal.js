/* Regressão: loading entre mapas, ícone Depot 3497 e modais sem IDs técnicos. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
function must(ok, msg) { if (!ok) throw Error(msg); }

const requested = [];
const label = {textContent:''}, fill = {style:{}};
const loading = {
  style:{display:'none'},
  querySelector(selector){ return selector === '.gl-text' ? label : fill; },
};
function FakeImage() {}
Object.defineProperty(FakeImage.prototype, 'src', {
  set(value) { requested.push(value); queueMicrotask(() => this.onload && this.onload()); },
});
const ctx = {
  window:{}, console, Image:FakeImage,
  document:{getElementById(id){ return id === 'game-loading' ? loading : null; }},
  requestAnimationFrame(fn){ fn(); }, setTimeout, clearTimeout,
  TILE_PATTERNS:{1:{px:2,py:2}}, TILE_ANIM:{2:{af:2}},
  IDLE_ANIMATIONS:{monsters:{rat:{frames:2}}},
  HUNTMAPS:{arena:{leg:{a:{v:[1],g:[2]}}}},
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'preload.js'), 'utf8'), ctx);

(async () => {
  ctx.beginMapLoading('Carregando teste...');
  must(loading.style.display === 'flex' && label.textContent === 'Carregando teste...',
    'overlay não aparece ao iniciar troca de mapa');
  const preload = ctx.preloadHuntMapAssets({mapa:'arena',monsters:['rat']}, 'Preparando teste');
  must(label.textContent === 'Preparando teste 0/6',
    'preloader não informa o estágio antes da primeira imagem');
  await preload;
  for (const asset of [
    'assets/tiles/1.png','assets/tiles/1_pattern.png',
    'assets/tiles/2.png','assets/tiles/2_anim.png',
    'assets/mob/rat.png','assets/mob/rat.idle.png',
  ]) must(requested.includes(asset), 'asset do mapa não foi pré-carregado: ' + asset);
  must(fill.style.width === '100%', 'barra de loading não chegou a 100%');
  ctx.finishMapLoading();
  must(loading.style.display === 'none', 'overlay não fecha após dois frames');

  // onload atrasado de uma transição encerrada não pode reabrir o overlay.
  let lateLoad;
  ctx.Image = class {
    set src(value) { requested.push(value); lateLoad = this.onload; }
  };
  ctx.beginMapLoading('Transição antiga');
  const delayed = ctx.preloadAssetPaths(['assets/tiles/late.png'], 'Preparando antigo');
  ctx.finishMapLoading();
  lateLoad();
  await delayed;
  must(loading.style.display === 'none', 'asset atrasado reabriu overlay encerrado');

  // Uma conexão de imagem que nunca dispara load/error não pode bloquear a
  // Cobra Bastion nem qualquer outra troca de mapa.
  ctx.MAP_ASSET_TIMEOUT_MS = 5;
  ctx.Image = class { set src(value) { requested.push(value); } };
  ctx.beginMapLoading('Transição travada');
  const started = Date.now();
  await ctx.preloadAssetPaths(['assets/tiles/stalled.png'], 'Preparando travado');
  must(Date.now() - started < 500 && fill.style.width === '100%',
    'asset pendente manteve o loading aberto indefinidamente');
  ctx.finishMapLoading();

  const gameSrc = fs.readFileSync(path.join(js, 'game.js'), 'utf8');

  // Mesmo se o carregador OTBM jamais chamar done(), o watchdog da própria
  // transição precisa criar o combate e fechar o overlay.
  const huntStart = gameSrc.indexOf('function startHunt');
  const huntEnd = gameSrc.indexOf('\n\nfunction resetTemplePlayerPosition', huntStart);
  const watchdogs = [];
  const huntCtx = {
    console:{warn(){}}, GAMEDATA:{hunts:{'cobra-bastion':{
      name:'Cobra Bastion',otbm:'cobra_bastion',monsters:[],
    }}},
    G:{p:{hunt:null,config:{}},inCity:true,training:null,huntEntryToken:0},
    partyBlocksHunt(){return false;}, beginMapLoading(){huntCtx.began=true;},
    huntMapFromOtbmAsync(){},
    setTimeout(fn){watchdogs.push(fn);return watchdogs.length;}, clearTimeout(){},
    newCombat(){return {id:'cobra-combat'};},
    spawnWave(){huntCtx.spawned=true;}, addLog(){}, toast(){},
    partyReportZone(){huntCtx.reported=true;}, renderAll(){huntCtx.rendered=true;},
    finishMapLoading(){huntCtx.finished=true;},
  };
  huntCtx.window = huntCtx;
  huntCtx.HUNT_ENTRY_TIMEOUT_MS = 1;
  vm.createContext(huntCtx);
  vm.runInContext(gameSrc.slice(huntStart,huntEnd),huntCtx);
  huntCtx.startHunt('cobra-bastion','non-pvp');
  must(huntCtx.began && watchdogs.length === 1 && !huntCtx.G.combat,
    'watchdog da entrada não foi armado');
  watchdogs[0]();
  must(huntCtx.G.combat && huntCtx.spawned && huntCtx.rendered && huntCtx.finished,
    'watchdog não liberou a Cobra após callback OTBM pendente');

  // v4: entrada na Cobra não usa fetch/OTBM.read — mapa já em HUNTMAPS
  const preMapPath = path.join(js, 'cobra-bastion-map.js');
  must(fs.existsSync(preMapPath), 'pré-compilado ausente para teste de entrada sem fetch');
  const preCtx2 = { window:{ addEventListener(){}, HUNTMAPS:{}, OTBM_HUNT_CACHE:{} }, console, setInterval, clearInterval, TILEFLAGS:{} };
  preCtx2.window = preCtx2.window;
  preCtx2.HUNTMAPS = preCtx2.window.HUNTMAPS;
  preCtx2.OTBM_HUNT_CACHE = preCtx2.window.OTBM_HUNT_CACHE;
  vm.createContext(preCtx2);
  // precisa de HUNTMAPS global antes
  preCtx2.HUNTMAPS = {};
  preCtx2.window.HUNTMAPS = preCtx2.HUNTMAPS;
  vm.runInContext(fs.readFileSync(path.join(js, 'huntmapdata.js'), 'utf8'), preCtx2);
  vm.runInContext(fs.readFileSync(preMapPath, 'utf8'), preCtx2);
  const cobraPre = vm.runInContext('typeof HUNTMAPS !== "undefined" ? HUNTMAPS["otbm:cobra_bastion"] : null', preCtx2) || preCtx2.HUNTMAPS["otbm:cobra_bastion"] || preCtx2.window.HUNTMAPS["otbm:cobra_bastion"];
  must(cobraPre, 'Pré-compilado não carregável em contexto isolado');
  // Simula entrada na Cobra com mapa pré-compilado: huntMapFromOtbmAsync deve ser síncrono
  const otbmhuntCode2 = fs.readFileSync(path.join(js, 'otbmhunt.js'), 'utf8');
  const syncCtx = {
    console:{warn(){}}, HUNTMAPS: {"otbm:cobra_bastion": cobraPre}, TILEFLAGS:{},
    OTBM: null,
    fetch: () => { throw Error('fetch não deveria ser chamado com pré-compilado'); },
    showGameLoading: () => { throw Error('showGameLoading não deveria ser chamado para pré-compilado'); },
    setInterval, clearInterval, Date, MAP_LOADING_GENERATION: 5,
    window:{ addEventListener(){}, HUNTMAPS:{}, OTBM_HUNT_CACHE:{} },
  };
  syncCtx.window = syncCtx.window;
  syncCtx.OTBM_HUNT_CACHE = {};
  // OTBM dummy que deve falhar se chamado
  let otbmReadCalled = false;
  syncCtx.OTBM = { read: () => { otbmReadCalled = true; throw Error('OTBM.read não deve ser chamado para Cobra pré-compilada'); }, huntMapFromOtbm: () => { throw Error('não deve converter'); } };
  vm.createContext(syncCtx);
  vm.runInContext(otbmhuntCode2, syncCtx);
  let cobraDone = false;
  syncCtx.huntMapFromOtbmAsync({otbm:'cobra_bastion', name:'Cobra', mapa:null}, () => { cobraDone = true; });
  must(cobraDone && !otbmReadCalled, 'Cobra pré-compilada fez fetch/OTBM.read em vez de retorno síncrono');

  // v4: conversão tardia após watchdog não pode reabrir overlay, mas deve substituir fallback
  const lateHunt = {otbm:'temp_late', name:'Late', mapa:null};
  const lateCtx = {
    console:{warn(){}}, HUNTMAPS:{}, TILEFLAGS:{}, OTBM:{ read(){ return {w:2,h:2,z:2,cells:{"0,0":{g:1}}, sourceBounds:{minX:0,minY:0}}; }, huntMapFromOtbm(m){ return {rows:["ab","cd"], leg:{a:{v:[1]},b:{v:[1]},c:{v:[1]},d:{v:[1]}}, footprintBlocked:{}}; }},
    fetch: () => new Promise(r => setTimeout(() => r({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))}), 20)),
    showGameLoading: (show,text)=>{ lateCtx.shown = text; },
    setInterval, clearInterval, setTimeout, clearTimeout, Date, MAP_LOADING_GENERATION: 10,
    OTBM_HUNT_CACHE:{}, window:{addEventListener(){}},
  };
  lateCtx.window = lateCtx.window;
  vm.createContext(lateCtx);
  vm.runInContext(otbmhuntCode2, lateCtx);
  lateCtx.MAP_LOADING_GENERATION = 10;
  let lateDone = false;
  lateCtx.huntMapFromOtbmAsync(lateHunt, ()=>{ lateDone = true; });
  // simula watchdog que incrementa geração antes do fetch terminar
  lateCtx.MAP_LOADING_GENERATION = 11;
  await new Promise(r=>setTimeout(r, 80));
  must(lateDone, 'Callback tardio não foi chamado');
  must(!lateCtx.shown || !lateCtx.shown.includes('Montando mapa'),
    'Conversão tardia reabriu overlay Montando mapa após watchdog');
  must(lateCtx.HUNTMAPS["otbm:temp_late"], 'Mapa tardio não substituiu fallback no HUNTMAPS');

  for (const marker of [
    'beginMapLoading(`Carregando ${boss.name}...',
    'beginMapLoading(`Carregando ${hu.name}...',
    'beginMapLoading("Retornando ao Templo Oficial...',
    'beginMapLoading("Carregando academia...',
    'preloadHuntMapAssets(arena', 'preloadHuntMapAssets(hu',
  ]) must(gameSrc.includes(marker), 'transição sem loading: ' + marker);

  const html = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
  for (const script of ['otbm','otbmhunt','hard-hunts','tileanimdata',
    'tilepatterndata','tilemap','preload','game'])
    must(html.includes(`js/${script}.js?v=cobra-loading-v8`),
      'script crítico sem cache-busting: ' + script);
  const reward = fs.readFileSync(path.join(js, 'reward-chest.js'), 'utf8');
  const forgeUi = fs.readFileSync(path.join(js, 'forge-ui.js'), 'utf8');
  const depotPng = fs.readFileSync(path.join(game, 'assets', 'item', 'depot-item-3497.png'));
  must(html.includes('assets/item/depot-item-3497.png') && forgeUi.includes('depot-item-3497.png'),
    'botão Depot não usa o item 3497');
  must(depotPng.readUInt32BE(16) === 27 && depotPng.readUInt32BE(20) === 25,
    'sprite oficial 3497 inválida');
  must(!reward.includes('Client ID') && !reward.includes('Item ID'),
    'Reward Chest ainda exibe ID técnico');

  console.log('OK: loading pré-carrega mapas, Depot usa 3497 e modais ocultam IDs técnicos.');
})().catch(error => { console.error(error); process.exitCode = 1; });
