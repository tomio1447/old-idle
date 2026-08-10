/* Regressão: instâncias OTBM usam dimensões reais e câmera central fixa. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
const OTBM = require(path.join(js, 'otbm.js'));

function must(ok, message) { if (!ok) throw Error(message); }

// Flags reais para que a busca central diferencie piso e parede.
const flagsCtx = { window: {} };
flagsCtx.window = flagsCtx;
vm.createContext(flagsCtx);
vm.runInContext(fs.readFileSync(path.join(js, 'tileflags.js'), 'utf8'), flagsCtx);

const source = fs.readFileSync(path.join(game, 'maps', 'livraria_ice.otbm'));
const ice = OTBM.read(source);
const iceMap = OTBM.huntMapFromOtbm(ice, flagsCtx.TILEFLAGS);
must(iceMap.rows.length === 16 && iceMap.rows.every(row => row.length === 24),
  'Library Ice deve preservar o mapa completo 24×16');

// Contexto mínimo da engine: grid.js + combat.js são código browser clássico.
const ctx = {
  console,
  HUNTMAPS: { 'otbm:livraria_ice': iceMap },
  GAMEDATA: {
    items: {}, monsters: {},
    hunts: {
      ice: { mapa: 'otbm:livraria_ice', monsters: [], pack: 0 },
      large: { mapa: 'synthetic-large', monsters: [], pack: 0 },
      plain: { monsters: [], pack: 0 },
    },
  },
  huntMapBlocked(map, x, y) {
    if (!map || y < 0 || y >= map.rows.length || x < 0 || x >= map.rows[y].length) return true;
    if (map.footprintBlocked && map.footprintBlocked[x + ':' + y]) return true;
    const entry = map.leg[map.rows[y][x]];
    return !entry || !!entry.bloc;
  },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'grid.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'combat.js'), 'utf8'), ctx);

const player = { instanceMode: 'non-pvp', config: { attackMode: 'kiting' } };
const combat = ctx.newCombat(player, 'ice', 'non-pvp');
must(combat.gridW === 24 && combat.gridH === 16, 'Combate Ice não adotou grid 24×16');
must(combat.camera && combat.camera.locked && combat.camera.x === 12 && combat.camera.y === 8,
  'Câmera Ice não ficou travada no centro geométrico');
must(vm.runInContext('inBounds(23, 15) && !inBounds(24, 16)', ctx),
  'Colisão não usa os limites dinâmicos da Library Ice');
must(!ctx.huntMapBlocked(iceMap, combat.player.cx, combat.player.cy),
  'Spawn central da Library Ice caiu em uma célula bloqueada');
must(Math.abs(combat.player.x - (combat.player.cx + 0.5) / 24) < 1e-12 &&
     Math.abs(combat.player.y - (combat.player.cy + 0.5) / 16) < 1e-12,
  'Posição visual não foi normalizada pelo grid dinâmico');

// O tile 10,2 é coberto pelo footprint 2×2 de uma parede ancorada ao lado:
// antes ele era tratado como chão livre e monstros entravam dentro da sprite.
must(iceMap.footprintBlocked['10:2'] &&
     !iceMap.leg[iceMap.rows[2][10]].bloc && ctx.huntMapBlocked(iceMap, 10, 2),
  'Footprint visual da parede não entrou na colisão');
const intruder = { cx: 9, cy: 2, x: 9.5 / 24, y: 2.5 / 16,
  sx: 9.5 / 24, sy: 2.5 / 16, hp: 100, maxHp: 100, moving: false };
combat.mobs = [intruder];
let occ = ctx.buildOccupancy(combat, intruder);
must(!ctx.beginStep(intruder, { d: 'e', dx: 1, dy: 0, diag: false }, occ, false),
  'Monstro conseguiu iniciar passo para dentro da parede');
intruder.cx = 10; intruder.cy = 2;
intruder.x = 10.5 / 24; intruder.y = 2.5 / 16;
must(ctx.repairBlockedMapPosition(combat, intruder) &&
     !ctx.huntMapBlocked(iceMap, intruder.cx, intruder.cy),
  'Entidade já dentro da parede não foi resgatada');
// Também não pode cortar diagonalmente a quina de uma parede.
occ = new Map([['1:0', true]]);
const corner = { cx: 0, cy: 0 };
must(!ctx.beginStep(corner, { d: 'se', dx: 1, dy: 1, diag: true }, occ, false),
  'Monstro cortou diagonalmente a quina da parede');
combat.mobs = [];

const iceView = vm.runInContext('centeredGridViewport(840, 520, 24, 16)', ctx);
must(iceView.tile === 40 && iceView.width === 960 && iceView.height === 640,
  'Viewport Ice aplicou zoom-out nos SQMs');
must(iceView.x === -60 && iceView.y === -60 && iceView.centerX === 420 && iceView.centerY === 260,
  'Viewport Ice não está centralizado no FOV 21×13');

// Exercita o renderer real com canvas falso: as duas camadas devem receber
// 24×16 e a câmera precisa transladar exatamente para a margem central.
const canvasOps = [], mapDraws = [];
const fake2d = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return () => ({ width: 0 });
    return (...args) => { canvasOps.push([key, ...args]); };
  },
  set() { return true; },
});
ctx.Image = class {};
ctx.performance = { now: () => 0 };
ctx.drawTileCharMap = (...args) => mapDraws.push(args.slice(4));
vm.runInContext(fs.readFileSync(path.join(js, 'render.js'), 'utf8'), ctx);
const renderer = new ctx.Renderer({ width: 840, height: 520, getContext: () => fake2d });
renderer.draw(combat, { hp: 0 }, 16);
must(mapDraws.length === 2 && mapDraws.every(call => call[0] === 24 && call[1] === 16),
  'Renderer ainda cortou a Library Ice no grid legado');
const translate = canvasOps.find(op => op[0] === 'translate');
must(translate && translate[1] === -60 && translate[2] === -60,
  'Renderer não aplicou o FOV central sem zoom-out na Library Ice');
must(canvasOps.filter(op => op[0] === 'save').length ===
     canvasOps.filter(op => op[0] === 'restore').length,
  'Renderer deixou estado de câmera/clip aberto');

// Mapa sintético bem maior que o antigo limite 21×13.
const largeMap = {
  rows: Array.from({ length: 50 }, () => 'a'.repeat(80)),
  leg: { a: { v: [28291] } },
  legenda: { a: { v: [28291] } },
  otbm: true,
};
ctx.HUNTMAPS['synthetic-large'] = largeMap;
const large = ctx.newCombat(player, 'large', 'non-pvp');
must(large.gridW === 80 && large.gridH === 50, 'Instância 80×50 foi truncada');
must(large.camera.locked && large.camera.x === 40 && large.camera.y === 25,
  'Câmera do mapa grande não usa o centro do mapa');
must(vm.runInContext('inBounds(79, 49) && !inBounds(80, 50)', ctx),
  'Bounds do mapa 80×50 foram limitados ao grid antigo');
const largeView = vm.runInContext('centeredGridViewport(840, 520, 80, 50)', ctx);
must(largeView.tile === 40 && largeView.width === 3200 && largeView.height === 2000 &&
     largeView.x === -1180 && largeView.y === -740,
  'Mapa 80×50 sofreu zoom-out em vez de usar o FOV nativo 21×13');

// Sem mapa, cenas antigas continuam exatamente em 21×13.
const plain = ctx.newCombat(player, 'plain', 'non-pvp');
must(plain.gridW === 21 && plain.gridH === 13, 'Cena sem OTBM não voltou a 21×13');

// O editor também precisa salvar além do offset u8 (256): writer cria
// múltiplas TILE_AREA e o leitor recompõe as coordenadas sem truncar.
const editable = {
  w: 300, h: 270, z: 7, name: 'large-editor-map',
  spawn: { x: 150, y: 135 }, mob: [{ x: 299, y: 269 }],
  cells: {
    '0,0': { g: 28291, items: [] },
    '255,255': { g: 28291, items: [28325] },
    '256,256': { g: 28291, items: [] },
    '299,269': { g: 28291, items: [] },
  },
};
const editableRoundTrip = OTBM.read(OTBM.write(editable));
must(editableRoundTrip.w === 300 && editableRoundTrip.h === 270 &&
     editableRoundTrip.cells['255,255'].items[0] === 28325 &&
     editableRoundTrip.cells['256,256'].g === 28291 &&
     editableRoundTrip.cells['299,269'].g === 28291,
  'Writer OTBM truncou coordenadas acima de 255');
must(editableRoundTrip.spawn.x === 150 && editableRoundTrip.mob[0].x === 299,
  'Zonas do editor não sobreviveram ao mapa grande');

// Mais combinações visuais do que o pool ASCII não podem reciclar legenda.
const rich = { w: 200, h: 15, name: 'rich', cells: {} };
const richFlags = {};
for (let x = 0; x < 200; x++) {
  const id = 10000 + x;
  rich.cells[x + ',7'] = { g: id, items: [] };
  richFlags[id] = [1, 0];
}
const richMap = OTBM.huntMapFromOtbm(rich, richFlags);
must(new Set([...richMap.rows[7]]).size === 200,
  'Legenda reciclou caracteres e misturou tiles de um mapa grande');

// A hunt deve usar o arquivo inteiro; nenhum crop 24×15 pode voltar.
const libraryCtx = { window: {}, GAMEDATA: { items: {}, monsters: {}, hunts: {} } };
libraryCtx.window = libraryCtx;
vm.createContext(libraryCtx);
vm.runInContext(fs.readFileSync(path.join(js, 'hardcore-library.js'), 'utf8'), libraryCtx);
const hunt = libraryCtx.GAMEDATA.hunts['library-ice'];
must(hunt && hunt.otbm === 'livraria_ice' && !hunt.otbmBounds,
  'Library Ice ainda está presa ao recorte antigo 24×15');

console.log('OK: Library Ice 24×16 e mapa sintético 80×50 usam grid livre com câmera central fixa.');
