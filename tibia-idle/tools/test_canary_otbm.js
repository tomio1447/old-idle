/* Regressão: mapas reais exportados pelo Canary's Map Editor 4.
 * Confirma OTBM moderno, dimensões fonte, canvas runtime 24×15 e PNGs físicos. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const OTBM = require(path.join(game, 'js', 'otbm.js'));
const maps = [
  { name: 'livraria_fire2', w: 20, h: 12, cells: 240, z: 2 },
  { name: 'livraria_ice', w: 20, h: 14, cells: 277, z: 2 },
];
const sandbox = { window: {} }; sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(game, 'rme', 'data', 'known_tiles.js'), 'utf8'), sandbox);
for (const spec of maps) {
  const source = path.join(game, 'beta-maps', spec.name + '.otbm');
  const runtime = path.join(game, 'maps', spec.name + '.otbm');
  if (!fs.existsSync(source) || !fs.existsSync(runtime)) throw Error('Mapa fonte/runtime ausente: ' + spec.name);
  const map = OTBM.read(fs.readFileSync(source));
  if (map.z !== spec.z || map.w !== spec.w || map.h !== spec.h || Object.keys(map.cells).length !== spec.cells)
    throw Error(`${spec.name}: recorte inesperado z=${map.z}, ${map.w}x${map.h}, ${Object.keys(map.cells).length} cells`);
  const runtimeMap = OTBM.huntMapFromOtbm(map, {});
  if (runtimeMap.rows.length !== 15 || runtimeMap.rows.some(row => row.length !== 24))
    throw Error(spec.name + ': moldura runtime Global-Idle deve ser fixa em 24×15');
  if (runtimeMap.leg[' '].v !== undefined)
    throw Error(spec.name + ': void não pode ter lista de sprites vazia (tiles/undefined.png)');
  const listed = OTBM.missingTiles(map, sandbox.RME_KNOWN_TILES);
  if (listed.length) throw Error(spec.name + ': IDs ausentes no catálogo RME: ' + listed.join(', '));
  const used = new Set();
  Object.values(map.cells).forEach(c => { if (c.g) used.add(c.g); (c.items || []).forEach(id => used.add(id)); });
  const missing = [...used].filter(id => !fs.existsSync(path.join(game, 'assets', 'tiles', `${id}.png`)));
  if (missing.length) throw Error(spec.name + ': PNGs físicos ausentes: ' + missing.join(', '));
  console.log(`OK: ${spec.name} (${map.w}x${map.h}, z ${map.z}, ${Object.keys(map.cells).length} tiles, ${used.size} sprites).`);
}
