/* Regressão: sala da Timira, retorno ao templo e escala/duração do crítico. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
const OTBM = require(path.join(js, 'otbm.js'));
function must(ok, msg) { if (!ok) throw Error(msg); }

// --- Timira room integral e coordenadas absolutas.
const beta = fs.readFileSync(path.join(game, 'beta-maps', 'timiraroom.otbm'));
const live = fs.readFileSync(path.join(game, 'maps', 'timiraroom.otbm'));
must(beta.equals(live), 'timiraroom beta não foi publicado integralmente');
must(crypto.createHash('sha256').update(live).digest('hex') ===
  '7cbcf1ca507e28da90aba75f029b1c7de9a91ddb94d168d18f9a5153714fd4f9',
  'timiraroom não corresponde à bossroom nova publicada na main');
const source = OTBM.read(live);
must(source.w === 18 && source.h === 16 && source.z === 2,
  'dimensões/andar da nova Timira room inesperados');
must(JSON.stringify(source.sourceBounds) === JSON.stringify({
  minX:175,minY:160,maxX:192,maxY:175,
}), 'âncoras absolutas da nova Timira room foram alteradas');
must(Object.keys(source.cells).length === 265, 'nova Timira room foi recortada');

const ctx = { window:{}, console };
ctx.window = ctx;
ctx.GAMEDATA = { items:{}, monsters:{}, hunts:{} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'hard-hunts.js'), 'utf8'), ctx);
const room = ctx.GAMEDATA.hunts['timira-room'];
must(room && room.otbm === 'timiraroom' && room.hidden && !room.otbmBounds,
  'hunt técnica da Timira ausente ou recortada');
must(JSON.stringify(room.otbmRoomBounds) === JSON.stringify({x:175,y:159,w:19,h:17,z:2}),
  'arena lógica da Timira divergente');
must(JSON.stringify(room.otbmSpawn) === JSON.stringify({x:182,y:170,z:2}),
  'player spawn absoluto da Timira divergente');
must(JSON.stringify(room.otbmMobBounds) === JSON.stringify({x:184,y:162,w:1,h:1,z:2}),
  'boss spawn absoluto da Timira divergente');

const zoneSrc = fs.readFileSync(path.join(js, 'otbmhunt.js'), 'utf8');
const zs = zoneSrc.indexOf('function applyHuntOtbmZones');
const ze = zoneSrc.indexOf('\n\n/* Garante', zs);
vm.runInContext(zoneSrc.slice(zs, ze), ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'tileflags.js'), 'utf8'), ctx);
ctx.applyHuntOtbmZones(source, room);
const runtime = OTBM.huntMapFromOtbm(source, ctx.TILEFLAGS);
must(JSON.stringify(runtime.spawn) === JSON.stringify({x:10,y:10}),
  'player spawn local/runtime da nova Timira incorreto');
must(runtime.mob.length === 1 && JSON.stringify(runtime.mob[0]) === JSON.stringify({x:12,y:2}),
  'boss spawn local/runtime da nova Timira incorreto');
for (const point of [runtime.spawn, runtime.mob[0]]) {
  const entry = runtime.leg[runtime.rows[point.y][point.x]];
  must(entry && !entry.bloc && !runtime.footprintBlocked[point.x + ':' + point.y],
    'spawn da Timira está bloqueado');
}
must(runtime.rows.length === 16 && runtime.rows.every(row => row.length === 24),
  'runtime da nova Timira room deveria ser 24x16 com padding mínimo');
const used = new Set();
Object.values(source.cells).forEach(c => { if (c.g) used.add(c.g); for (const id of c.items || []) used.add(id); });
must(used.size === 38, 'quantidade de sprites da nova Timira room mudou');
for (const id of used)
  must(fs.existsSync(path.join(game, 'assets', 'tiles', id + '.png')), 'sprite ausente: ' + id);
const patternCtx = {window:{}}; patternCtx.window = patternCtx;
vm.createContext(patternCtx);
vm.runInContext(fs.readFileSync(path.join(js, 'tilepatterndata.js'), 'utf8'), patternCtx);
for (const id of used) if (patternCtx.TILE_PATTERNS[id])
  must(fs.existsSync(path.join(game, 'assets', 'tiles', id + '_pattern.png')),
    'strip de pattern ausente: ' + id);
for (const id of [37930,37931,37933,37935])
  must(used.has(id), 'sprite nova da Timira não é usada pelo OTBM: ' + id);

const gameSrc = fs.readFileSync(path.join(js, 'game.js'), 'utf8');
const timiraStart = gameSrc.indexOf('"timira-the-many-headed":');
const timiraEnd = gameSrc.indexOf('"ferumbras-mortal-shell":', timiraStart);
const timiraBlock = gameSrc.slice(timiraStart, timiraEnd);
must(timiraBlock.includes('hunt: "timira-room"'), 'boss Timira ainda usa o mapa das Nagas');

// --- Retorno ao templo: boss tem combat ativo e hunt null.
const returnStart = gameSrc.indexOf('function resetTemplePlayerPosition');
const returnEnd = gameSrc.indexOf('\nfunction startAcademy', returnStart);
const returnCtx = {
  console,
  G:{
    p:{hunt:null,instanceMode:'boss',hp:1,mp:1},
    combat:{boss:{id:'timira-the-many-headed'}}, training:null, inCity:false,
    walker:{resetToSpawn(){ this.reset = (this.reset || 0) + 1; }},
    renderer:{npcHit:['stale']},
  },
  resetGridSize(){ returnCtx.gridReset = (returnCtx.gridReset || 0) + 1; },
  maxStats(){ return {hp:900,mp:700}; },
  addLog(){}, renderAll(){ returnCtx.rendered = true; },
};
vm.createContext(returnCtx);
vm.runInContext(gameSrc.slice(returnStart, returnEnd), returnCtx);
returnCtx.goToCity();
must(returnCtx.G.combat === null && returnCtx.G.inCity &&
     returnCtx.G.p.hunt === null && returnCtx.G.p.instanceMode === null,
  'botão do templo não encerrou boss com p.hunt null');
must(returnCtx.G.walker.reset === 1 && returnCtx.G.p.hp === 900 && returnCtx.G.p.mp === 700,
  'retorno não reposicionou/curou o player no templo');
must(returnCtx.gridReset === 1 && returnCtx.rendered,
  'retorno ao templo não restaurou grid/render');
must(gameSrc.includes('G.huntEntryToken !== entryToken || G.inCity || G.p.hunt !== id'),
  'callback OTBM pendente pode reabrir uma hunt após o retorno');

// --- Crítico com a mesma duração do Fatal e escala visual compensada.
must(gameSrc.includes('"critical-hit-effect", 1200, 1.45') &&
     gameSrc.includes('"fatal-text", 1200, 1'),
  'crítico e Fatal não usam a mesma duração configurada');
const renderSrc = fs.readFileSync(path.join(js, 'render.js'), 'utf8');
must(renderSrc.includes('function (x, y, name, customDurMs, customScale)') &&
     (renderSrc.match(/tibiaScale\(W\) \* \(e\.scale \|\| 1\)/g) || []).length === 2,
  'escala customizada não é aplicada nos dois renderers de efeito');
const addStart = renderSrc.indexOf('Renderer.prototype.addEffect');
const addEnd = renderSrc.indexOf('\n\nRenderer.prototype.addProjectile', addStart);
const fxCtx = {
  Renderer:function(){ this.effects=[]; },
  fxFrameCount(name){ return name === 'critical-hit-effect' ? 14 : 4; },
};
vm.createContext(fxCtx);
vm.runInContext(renderSrc.slice(addStart, addEnd), fxCtx);
const renderer = new fxCtx.Renderer();
renderer.addEffect(.5,.5,'critical-hit-effect',1200,1.45);
renderer.addEffect(.5,.4,'fatal-text',1200,1);
must(renderer.effects[0].dur === renderer.effects[1].dur &&
     renderer.effects[0].scale === 1.45 && renderer.effects[1].scale === 1,
  'objetos de efeito não preservam duração/escala crítica');

console.log('OK: crítico 1200ms ampliado, retorno destravado e nova Timira room 18x16 publicada.');
