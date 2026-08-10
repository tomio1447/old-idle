/* Regressão do Templo Oficial de Thais importado do Canary Map Editor. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
function must(ok, msg) { if (!ok) throw Error(msg); }

const betaPath = path.join(game, 'beta-maps', 'templo.otbm');
const livePath = path.join(game, 'maps', 'templo.otbm');
const beta = fs.readFileSync(betaPath);
const live = fs.readFileSync(livePath);
must(beta.equals(live), 'templo.otbm do beta não foi publicado integralmente');

const ctx = { console, Uint8Array, ArrayBuffer, Promise, fetch() {
  return Promise.reject(new Error('fetch não deveria rodar no teste'));
} };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['tileflags.js', 'otbm.js', 'citymap.js', 'walker.js'])
  vm.runInContext(fs.readFileSync(path.join(js, file), 'utf8'), ctx);

const source = ctx.OTBM.read(live);
must(source.w === 30 && source.h === 21 && source.z === 7,
  'dimensões/andar do templo inesperados');
must(JSON.stringify(source.sourceBounds) === JSON.stringify({
  minX:1009, minY:1014, maxX:1038, maxY:1034,
}), 'coordenadas absolutas do templo divergentes');
must(Object.keys(source.cells).length === 573, 'tiles do templo foram recortados');

ctx.__source = source;
vm.runInContext('installOfficialTempleMap(__source)', ctx);
const state = JSON.parse(vm.runInContext(`JSON.stringify({
  w:MAP_W,h:MAP_H,spawn:CITY.spawn,npcs:CITY.npcs,
  removed:CITY.removedNpcPositions,official:CITY.officialTemple,
  blocked:isBlocked(CITY.spawn.x,CITY.spawn.y)
})`, ctx));
must(state.official && state.w === 30 && state.h === 21,
  'templo oficial não substituiu o mapa procedural');
must(JSON.stringify(state.spawn) === JSON.stringify({x:11,y:7}) && !state.blocked,
  'player position 1020,1021,7 não virou spawn local livre 11,7');
const walker = JSON.parse(vm.runInContext(`(() => {
  const w = new CityWalker();
  return JSON.stringify({px:w.px,py:w.py,tpx:w.tpx,tpy:w.tpy});
})()`, ctx));
must(JSON.stringify(walker) === JSON.stringify({px:368,py:240,tpx:368,tpy:240}),
  'CityWalker não nasceu no centro da player position');
must(Array.isArray(state.npcs) && state.npcs.length === 0,
  'o templo ainda publica NPCs');
must(JSON.stringify(state.removed) === JSON.stringify([
  {x:1013,y:1018,z:7},{x:1013,y:1020,z:7},
]), 'coordenadas dos NPCs removidos não foram preservadas');

const used = new Set();
Object.values(source.cells).forEach((cell) => {
  if (cell.g) used.add(cell.g);
  for (const id of cell.items || []) used.add(id);
});
must(used.size === 218, 'lista de sprites usados pelo templo mudou');
for (const id of used)
  must(fs.existsSync(path.join(game, 'assets', 'tiles', id + '.png')),
    'sprite ausente no templo: ' + id);

const npcXml = fs.readFileSync(path.join(game, 'beta-maps', 'templo-npc.xml'), 'utf8');
const monsterXml = fs.readFileSync(path.join(game, 'beta-maps', 'templo-monster.xml'), 'utf8');
const html = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
const gameSrc = fs.readFileSync(path.join(js, 'game.js'), 'utf8');
const renderSrc = fs.readFileSync(path.join(js, 'city-render.js'), 'utf8');
must(/<npcs\s*\/>/.test(npcXml) && /<monsters\s*\/>/.test(monsterXml),
  'sidecars do templo ainda contêm criaturas');
must(!html.includes('id="npc-quick"'), 'atalhos de NPC ainda aparecem na interface');
must(gameSrc.includes('loadOfficialTempleMap()') &&
     gameSrc.indexOf('loadOfficialTempleMap()') < gameSrc.indexOf('startGameReady(p)'),
  'o CityWalker pode ser criado antes do templo carregar');
const ground = renderSrc.indexOf('CITY.map, worldW, worldH, MAP_W, MAP_H, "ground"');
const player = renderSrc.indexOf('OutfitRenderer.forPlayer', ground);
const objects = renderSrc.indexOf('CITY.map, worldW, worldH, MAP_W, MAP_H, "objects"', player);
must(ground >= 0 && player > ground && objects > player,
  'ordem visual deveria ser chão, jogador, objetos bloqueantes');

console.log('OK: templo oficial 30x21, spawn 1020/1021/7, 218 sprites e zero NPCs.');
