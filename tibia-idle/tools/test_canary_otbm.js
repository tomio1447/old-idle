/* Regressão: RME/Canary 4 grava OTBM moderno (u32 inicial, sem magic ASCII).
 * Este mapa real editado pelo usuário deve abrir, normalizar coordenadas e
 * referenciar exclusivamente sprites que já existem no catálogo do jogo. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const OTBM = require(path.join(game, 'js', 'otbm.js'));
const source = path.join(game, 'beta-maps', 'livraria_fire2.otbm');
const runtime = path.join(game, 'maps', 'livraria_fire2.otbm');
if (!fs.existsSync(source) || !fs.existsSync(runtime)) throw Error('Mapa fonte/runtime livraria_fire ausente');
const map = OTBM.read(fs.readFileSync(source));
if (map.z !== 2 || map.w !== 24 || map.h !== 15 || Object.keys(map.cells).length !== 360)
  throw Error(`Recorte Canary inesperado: z=${map.z}, ${map.w}x${map.h}, ${Object.keys(map.cells).length} cells`);
const sandbox = { window: {} }; sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(game, 'rme', 'data', 'known_tiles.js'), 'utf8'), sandbox);
const listed = OTBM.missingTiles(map, sandbox.RME_KNOWN_TILES);
if (listed.length) throw Error('IDs do mapa ausentes no catálogo RME: ' + listed.join(', '));
const used = new Set();
Object.values(map.cells).forEach(c => { if (c.g) used.add(c.g); (c.items || []).forEach(id => used.add(id)); });
const missing = [...used].filter(id => !fs.existsSync(path.join(game, 'assets', 'tiles', `${id}.png`)));
if (missing.length) throw Error('PNGs físicos ausentes no mapa Canary: ' + missing.join(', '));
console.log(`OK: OTBM Canary v4 lido (${map.w}x${map.h}, z ${map.z}, ${Object.keys(map.cells).length} tiles) com ${used.size} sprites físicos.`);
