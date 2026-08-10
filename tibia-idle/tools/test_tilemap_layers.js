/* Regressão de mapas OTBM: pisos/decorações andáveis ficam abaixo das
 * criaturas; paredes e pilares bloqueantes ficam acima delas. */
const fs = require('fs');
const path = require('path');
const game = path.join(__dirname, '..', 'game', 'js');
const tilemap = fs.readFileSync(path.join(game, 'tilemap.js'), 'utf8');
const render = fs.readFileSync(path.join(game, 'render.js'), 'utf8');

const floors = tilemap.indexOf('Primeira passagem: todos os pisos');
const walkable = tilemap.indexOf('Objetos ANDÁVEIS/decorativos', floors);
const blocking = tilemap.indexOf('Objetos NÃO-ANDÁVEIS', walkable);
if (floors < 0 || walkable < 0 || blocking < 0 ||
    !(floors < walkable && walkable < blocking))
  throw Error('Tile renderer deve manter a ordem pisos → objetos andáveis → bloqueantes');

const floorBlock = tilemap.slice(floors, walkable);
const walkableBlock = tilemap.slice(walkable, blocking);
const blockingBlock = tilemap.slice(blocking);
if (!/L\.v\.length/.test(floorBlock) || !/TileSprites\.draw\(/.test(floorBlock))
  throw Error('Passagem de piso deve ignorar lista vazia e desenhar o chão');
if (!/drawCellItems\(false\)/.test(walkableBlock) ||
    !/drawDecoItems\(false\)/.test(walkableBlock))
  throw Error('Decorações andáveis devem ser desenhadas na camada ground');
if (!/drawCellItems\(true\)/.test(blockingBlock) ||
    !/drawDecoItems\(true\)/.test(blockingBlock))
  throw Error('Paredes/pilares devem ser desenhados na camada objects');

const groundCall = render.indexOf('GRID_W, GRID_H, "ground"');
const entityPass = render.indexOf('const entityInfo = []', groundCall);
const objectsCall = render.indexOf('GRID_W, GRID_H, "objects"', entityPass);
if (groundCall < 0 || entityPass < 0 || objectsCall < 0 ||
    !(groundCall < entityPass && entityPass < objectsCall))
  throw Error('Render de combate deve manter mapa ground → criaturas → objects');

console.log('OK: tilemap usa pisos/andáveis → criaturas → paredes/pilares bloqueantes.');
