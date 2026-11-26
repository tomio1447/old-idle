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
const beta = fs.readFileSync(path.join(game, 'beta-maps', 'bossesroom', 'timiraroom.otbm'));
const live = fs.readFileSync(path.join(game, 'maps', 'timiraroom.otbm'));
must(beta.equals(live), 'timiraroom beta não foi publicado integralmente');
must(crypto.createHash('sha256').update(live).digest('hex') ===
  '0b15fde8bb0adf1325ddf12a574447bf0282980f61d335e0f79f7351dab390f4',
  'timiraroom não corresponde à bossroom publicada');
const source = OTBM.read(live.buffer.slice(live.byteOffset, live.byteOffset + live.byteLength), {z:7});
must(source.w === 38 && source.h === 34 && source.z === 7,
  'dimensões/andar da Timira room inesperados');
must(JSON.stringify(source.sourceBounds) === JSON.stringify({
  minX:1012,minY:1016,maxX:1049,maxY:1049,
}), 'âncoras absolutas da Timira room foram alteradas');
must(Object.keys(source.cells).length === 1237, 'Timira room foi recortada');

const ctx = { window:{}, console };
ctx.window = ctx;
ctx.GAMEDATA = { items:{}, monsters:{}, hunts:{} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'hard-hunts.js'), 'utf8'), ctx);
const room = ctx.GAMEDATA.hunts['timira-room'];
must(room && room.otbm === 'timiraroom' && room.hidden && !room.otbmBounds,
  'hunt técnica da Timira ausente ou recortada');
must(!room.otbmRoomBounds, 'otbmRoomBounds removido (nenhum código o lê)');
must(JSON.stringify(room.otbmSpawn) === JSON.stringify({x:1033,y:1035,z:7}),
  'player spawn absoluto da Timira divergente');
must(JSON.stringify(room.otbmMobBounds) === JSON.stringify({x:1033,y:1029,w:1,h:1,z:7}),
  'boss spawn absoluto da Timira divergente');

const zoneSrc = fs.readFileSync(path.join(js, 'otbmhunt.js'), 'utf8');
const zs = zoneSrc.indexOf('function applyHuntOtbmZones');
const ze = zoneSrc.indexOf('/* Garante', zs);
vm.runInContext(zoneSrc.slice(zs, ze), ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'tileflags.js'), 'utf8'), ctx);
ctx.applyHuntOtbmZones(source, room);
const runtime = OTBM.huntMapFromOtbm(source, ctx.TILEFLAGS);
must(JSON.stringify(runtime.spawn) === JSON.stringify({x:21,y:19}),
  'player spawn local/runtime da Timira incorreto');
must(runtime.mob.length === 1 && JSON.stringify(runtime.mob[0]) === JSON.stringify({x:21,y:13}),
  'boss spawn local/runtime da Timira incorreto');
const walkCell = (x, y) => {
  const entry = runtime.leg[runtime.rows[y] && runtime.rows[y][x]];
  return !!(entry && !entry.bloc && !runtime.footprintBlocked[x + ':' + y]);
};
for (const point of [runtime.spawn, runtime.mob[0]])
  must(walkCell(point.x, point.y), 'spawn da Timira está bloqueado');
// BFS: o bossspawn precisa ser alcançável a partir do playerspawn.
{
  const seen = new Set([runtime.spawn.x + ',' + runtime.spawn.y]);
  const q = [runtime.spawn];
  for (let i = 0; i < q.length; i++)
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = q[i].x + dx, ny = q[i].y + dy, k = nx + ',' + ny;
      if (!seen.has(k) && walkCell(nx, ny)) { seen.add(k); q.push({x:nx,y:ny}); }
    }
  must(seen.has(runtime.mob[0].x + ',' + runtime.mob[0].y),
    'bossspawn desconectado do playerspawn');
}
must(runtime.rows.length === 34 && runtime.rows.every(row => row.length === 38),
  'runtime da Timira room deveria ser 38x34 sem padding');
const used = new Set();
Object.values(source.cells).forEach(c => { if (c.g) used.add(c.g); for (const id of c.items || []) used.add(id); });
must(used.size === 81, 'quantidade de sprites da Timira room mudou');
for (const id of used)
  must(fs.existsSync(path.join(game, 'assets', 'tiles', id + '.png')), 'sprite ausente: ' + id);
const patternCtx = {window:{}}; patternCtx.window = patternCtx;
vm.createContext(patternCtx);
vm.runInContext(fs.readFileSync(path.join(js, 'tilepatterndata.js'), 'utf8'), patternCtx);
for (const id of used) if (patternCtx.TILE_PATTERNS[id])
  must(fs.existsSync(path.join(game, 'assets', 'tiles', id + '_pattern.png')),
    'strip de pattern ausente: ' + id);

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
  // combat mock sem flag/eventos de luta → a função real retorna false aqui.
  bossFightEngaged(){ return false; },
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
must(gameSrc.includes('G.huntEntryToken === entryToken && !G.inCity && G.p.hunt === id') &&
     gameSrc.includes('if (G.huntEntryToken !== entryToken) return false;') &&
     gameSrc.includes('if (!restoreHuntEntryState("OTBM")) return;') &&
     gameSrc.includes('if (!restoreHuntEntryState("preloader tardio") || !G.combat ||'),
  'callback/watchdog OTBM pendente pode reabrir uma hunt após o retorno');

// --- Crítico com a mesma duração do Fatal e escala visual compensada.
must(gameSrc.includes('"critical-hit-effect", 1200, 1.45') &&
     gameSrc.includes('"fatal-text", 1200, 1'),
  'crítico e Fatal não usam a mesma duração configurada');
const renderSrc = fs.readFileSync(path.join(js, 'render.js'), 'utf8');
must(renderSrc.includes('addEffect = function (x, y, name, customDurMs, customScale') &&
     (renderSrc.match(/tibiaScale\(W\) \* \(e\.scale \|\| 1\)/g) || []).length === 2,
  'escala customizada não é aplicada nos dois renderers de efeito');
const addStart = renderSrc.indexOf('Renderer.prototype.addEffect');
const addEnd = renderSrc.indexOf('\n\nRenderer.prototype.addProjectile', addStart);
const fxCtx = {
  Renderer:function(){ this.effects=[]; },
  fxFrameCount(name){ return name === 'critical-hit-effect' ? 14 : 4; },
  resolveFxName(name){ return name; },
  fxClientMeta(){ return null; }, fxAutoDurationMs(){ return 0; }, fxPriority(){ return 0; },
  Sprites:{ fx(){ return null; } }, FX_MAX_LIFE_MS:60000,
};
vm.createContext(fxCtx);
vm.runInContext(renderSrc.slice(addStart, addEnd), fxCtx);
const renderer = new fxCtx.Renderer();
renderer.addEffect(.5,.5,'critical-hit-effect',1200,1.45);
renderer.addEffect(.5,.4,'fatal-text',1200,1);
must(renderer.effects[0].dur === renderer.effects[1].dur &&
     renderer.effects[0].scale === 1.45 && renderer.effects[1].scale === 1,
  'objetos de efeito não preservam duração/escala crítica');

console.log('OK: crítico 1200ms ampliado, retorno destravado e Timira room 38x34 z=7 publicada.');
