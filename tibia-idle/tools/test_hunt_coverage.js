/* Regressão: TODAS as hunts do cliente (gamedata.js + registros em runtime)
 * precisam existir no HUNTS do servidor — sem registro, o pool de spawn
 * congela nas espécies da 1ª wave e pesos/ wavedevem nunca aplicam.
 * Probe comportamental: spawnHuntWave só preenche o pool se HUNTS[huntId]
 * existe (com monsters válidos no catálogo). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const engine = require(path.join(__dirname, '..', 'server', 'authoritative_engine.js'));

const ctx = vm.createContext({ window: {}, console, Math, Date, JSON, Object, Array, Number, String, Set, Map });
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.join(game, 'js', 'gamedata.js'), 'utf8'), ctx, { filename: 'gamedata.js' });
const jsDir = path.join(game, 'js');
for (const f of fs.readdirSync(jsDir).filter((f) => f.endsWith('.js') && f !== 'gamedata.js')) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  if (!src.includes('GAMEDATA.hunts')) continue;
  try { vm.runInContext(src, ctx, { filename: f }); } catch (e) { /* dependências de runtime pulam */ }
}
const clientHunts = Object.keys(ctx.GAMEDATA.hunts || {});
if (clientHunts.length < 60)
  throw Error('muito poucas hunts no cliente (' + clientHunts.length + ') — carga do VM quebrou?');

const missing = [];
for (const id of clientHunts) {
  const a = { huntId: id, spawnPool: [], mobs: [], pendingSpawns: [], rngState: 42, clock: Date.now() };
  try { engine.spawnHuntWave(a, a.clock, { force: true }); } catch (e) { /* HUNTS[huntId] pode ser null */ }
  if (!(a.spawnPool && a.spawnPool.length)) missing.push(id);
}
if (missing.length)
  throw Error('hunts do cliente SEM registro no servidor (pool não preenche): ' + missing.join(', '));
console.log('OK: ' + clientHunts.length + ' hunts do cliente — todas registradas no servidor.');
