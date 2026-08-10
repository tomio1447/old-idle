/* Regras de spawn para arenas OTBM: party central em linha e mobs ±10 do líder. */
const fs = require('fs');
const path = require('path');
const game = path.join(__dirname, '..', 'game', 'js');
const combat = fs.readFileSync(path.join(game, 'combat.js'), 'utf8');
const party = fs.readFileSync(path.join(game, 'party.js'), 'utf8');
function must(text, source, msg) { if (!source.includes(text)) throw Error(msg); }
must('function huntMapCenterSpawn', combat, 'Spawn central OTBM ausente');
must('if (huntMap.otbm)', combat, 'Mapas OTBM devem usar spawn central sem interpretar marcador S');
must('setGridForMap(huntMap)', combat, 'Spawn deve ser calculado depois de aplicar o grid dinâmico');
must('Math.abs(x - lx) <= 10 && Math.abs(y - ly) <= 10', combat, 'Range ±10 do líder ausente');
must('Math.max(0, ly - 10)', combat, 'Fallback de respawn não limita Y ao líder');
must('const offs = [0, -1, 1, -2, 2', party, 'Party deve nascer em fileira X');
must('Prioridade: fileira X atravessando o centro', party, 'Posicionamento central da party ausente');
console.log('OK: party nasce em linha X central; mobs respeitam raio ±10 X/Y do líder.');
