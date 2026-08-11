/* Regressão: fetch OTBM pendente nunca pode prender o loading da hunt. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function must(ok, msg) { if (!ok) throw Error(msg); }

const game = path.join(__dirname, '..', 'game');
const source = fs.readFileSync(path.join(game, 'js', 'otbmhunt.js'), 'utf8');
const end = source.indexOf('\nif (typeof module');
const warnings = [], stages = [];
const ctx = {
  console:{warn(...args){ warnings.push(args.join(' ')); },log(){}},
  showGameLoading(show,text,pct){ stages.push({show,text,pct}); },
  HUNTMAPS:{}, TILEFLAGS:{},
  OTBM:{
    read(){ return {w:1,h:1,z:2,sourceBounds:{minX:0,minY:0},cells:{}}; },
    huntMapFromOtbm(){ return {leg:{},rows:[' ']}; },
  },
  fetch(){ return new Promise(() => {}); },
  setTimeout, clearTimeout, setInterval, clearInterval,
};
ctx.window = ctx;
ctx.OTBM_HUNT_TIMEOUT_MS = 5;
vm.createContext(ctx);
vm.runInContext(source.slice(0, end), ctx);

(async () => {
  const hunt = {otbm:'cobra_bastion',monsters:[]};
  const started = Date.now();
  await new Promise((resolve, reject) => {
    const guard = setTimeout(() => reject(Error('callback OTBM não retornou')), 500);
    ctx.huntMapFromOtbmAsync(hunt, () => { clearTimeout(guard); resolve(); });
  });
  must(Date.now() - started < 500, 'fetch pendente bloqueou a entrada na Cobra');
  must(warnings.some(x => x.includes('timeout ao carregar OTBM')),
    'timeout OTBM não foi diagnosticado');
  must(stages.some(x => x.text === 'Baixando mapa cobra_bastion...' && x.pct === 5),
    'loading não informa que está aguardando o OTBM');

  // Depois de um timeout o cache deve permitir uma nova tentativa real.
  ctx.fetch = () => Promise.resolve({ok:true,arrayBuffer:() => Promise.resolve(new ArrayBuffer(1))});
  await new Promise(resolve => ctx.huntMapFromOtbmAsync(hunt, resolve));
  must(hunt.mapa === 'otbm:cobra_bastion' && ctx.HUNTMAPS[hunt.mapa],
    'cache ficou preso em loading após timeout e impediu nova entrada');
  console.log('OK: OTBM pendente expira e Cobra pode tentar/carregar novamente.');
})().catch(error => { console.error(error); process.exitCode = 1; });
