/* Regressão: mapas reais exportados pelo Canary's Map Editor 4.
 * Confirma que o beta foi publicado no runtime, preserva as dimensões reais
 * da instância e garante PNG físico para todos os IDs usados. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const OTBM = require(path.join(game, 'js', 'otbm.js'));
const maps = [
  {
    name: 'livraria_fire2', w: 20, h: 12, cells: 240, z: 2,
    runtimeW: 24, runtimeH: 15,
  },
  {
    name: 'livraria_ice', w: 24, h: 16, cells: 361, z: 2,
    runtimeW: 24, runtimeH: 16,
    // Sprites introduzidas pela atualização gráfica de 83103680.
    requiredIds: [7107, 28291, 28325],
  },
];
const sandbox = { window: {} }; sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(game, 'rme', 'data', 'known_tiles.js'), 'utf8'), sandbox);
for (const spec of maps) {
  const source = path.join(game, 'beta-maps', spec.name + '.otbm');
  const runtime = path.join(game, 'maps', spec.name + '.otbm');
  if (!fs.existsSync(source) || !fs.existsSync(runtime))
    throw Error('Mapa fonte/runtime ausente: ' + spec.name);

  const sourceBytes = fs.readFileSync(source);
  const runtimeBytes = fs.readFileSync(runtime);
  if (!sourceBytes.equals(runtimeBytes))
    throw Error(spec.name + ': versão beta ainda não foi publicada em game/maps');

  const map = OTBM.read(runtimeBytes);
  if (map.z !== spec.z || map.w !== spec.w || map.h !== spec.h ||
      Object.keys(map.cells).length !== spec.cells)
    throw Error(`${spec.name}: mapa fonte inesperado z=${map.z}, ${map.w}x${map.h}, ${Object.keys(map.cells).length} cells`);

  const used = new Set();
  Object.values(map.cells).forEach(c => {
    if (c.g) used.add(c.g);
    (c.items || []).forEach(id => used.add(id));
  });
  for (const id of spec.requiredIds || []) {
    if (!used.has(id)) throw Error(`${spec.name}: atualização gráfica perdeu o ID ${id}`);
  }

  const listed = OTBM.missingTiles(map, sandbox.RME_KNOWN_TILES);
  if (listed.length)
    throw Error(spec.name + ': IDs ausentes no catálogo RME: ' + listed.join(', '));
  const missing = [...used].filter(id =>
    !fs.existsSync(path.join(game, 'assets', 'tiles', `${id}.png`)));
  if (missing.length)
    throw Error(spec.name + ': PNGs físicos ausentes: ' + missing.join(', '));

  const playable = spec.crop ? OTBM.crop(map, spec.crop) : map;
  if (spec.croppedCells !== undefined &&
      Object.keys(playable.cells).length !== spec.croppedCells)
    throw Error(`${spec.name}: recorte jogável contém ${Object.keys(playable.cells).length} cells`);
  const runtimeMap = OTBM.huntMapFromOtbm(playable, {});
  if (runtimeMap.rows.length !== spec.runtimeH ||
      runtimeMap.rows.some(row => row.length !== spec.runtimeW))
    throw Error(spec.name + ': dimensões runtime OTBM inesperadas');
  if (runtimeMap.leg[' '].v !== undefined)
    throw Error(spec.name + ': void não pode ter lista de sprites vazia (tiles/undefined.png)');

  console.log(`OK: ${spec.name} (fonte ${map.w}x${map.h}, runtime ${spec.runtimeW}x${spec.runtimeH}, ${used.size} sprites).`);
}
