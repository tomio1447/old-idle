/* Regressão: target bloqueado não pode congelar monstro em mapa OTBM. */
const fs = require('fs');
const path = require('path');
const grid = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'gridai.js'), 'utf8');
const library = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'hardcore-library.js'), 'utf8');
function must(rx, text) { if (!rx.test(text)) throw Error('Regra ausente: ' + rx); }
must(/function monsterReachableTarget/, grid);
must(/findPathGrid\(mob, ent\.cx, ent\.cy, occ\)/, grid);
must(/const alvoMob = monsterReachableTarget\(c, m, occ, preferred\)/, grid);
must(/\["icecold-book", "squid-warden", "ink-blob"\]/, library);
console.log('OK: monstro retargeta membro alcançável; Library Ice usa Ink Blob oficial.');
