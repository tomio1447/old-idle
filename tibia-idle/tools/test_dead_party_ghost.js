/* Player inconsciente não pode mover/renderizar como alvo fantasma. */
const fs = require('fs');
const path = require('path');
const game = path.join(__dirname, '..', 'game', 'js');
const grid = fs.readFileSync(path.join(game, 'gridai.js'), 'utf8');
const render = fs.readFileSync(path.join(game, 'render.js'), 'utf8');
const combat = fs.readFileSync(path.join(game, 'combat.js'), 'utf8');
function must(rx, src, msg) { if (!rx.test(src)) throw Error(msg); }
must(/const activeAlive = \(!c\.player\.p \|\| c\.player\.p\.hp > 0\)/, grid, 'Grid não identifica player morto');
must(/if \(activeAlive\) playerThinkStep/, grid, 'Player morto ainda recebe AI');
must(/if \(activeAlive\) advanceStep\(c\.player/, grid, 'Player morto ainda interpola movimento');
must(/player\.hp > 0/, render, 'Renderer ainda inclui player morto');
must(/drawPlayerCorpse\(ctx,W,H,pos,ent\.p/, render, 'Corpse de party inconsciente ausente');
must(/drawCombatPlayerCorpses\(ctx,W,H,combat,player,"body"\)/, render, 'Corpse não está na camada do chão');
must(/ent\.downedAt =/, combat, 'Tempo do corpse de party ausente');
console.log('OK: player morto não move/não é alvo fantasma; party mostra corpse até revive.');
