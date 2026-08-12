/* Canary: Player::getLookCorpse() → male 4240 / female 4247. */
const fs = require('fs');
const path = require('path');
const game = path.join(__dirname, '..', 'game');
const render = fs.readFileSync(path.join(game, 'js', 'render.js'), 'utf8');
const combat = fs.readFileSync(path.join(game, 'js', 'combat.js'), 'utf8');
for (const id of [4240, 4247]) {
  if (!fs.existsSync(path.join(game, 'assets', 'tiles', id + '.png'))) throw Error('Corpse asset ausente: ' + id);
}
if (!/\? 4247 : 4240/.test(render)) throw Error('Seleção de corpse feminina/masculina ausente');
if (!/ctx\.fillStyle = "#ff3b30"/.test(render)) throw Error('Contador vermelho de respawn ausente');
if (!/elapsed \* ts \* 0\.7/.test(render)) throw Error('Contador não sobe sobre corpse');
if (!/c\.deadAt = c\._tickNow \|\| Date\.now\(\)/.test(combat)) throw Error('Início histórico do contador de morte ausente');
if (!(render.indexOf('drawCombatPlayerCorpses(ctx,W,H,combat,player,"body")') <
      render.indexOf('const depthEntities = buildRenderEntities')))
  throw Error('Corpse não está imediatamente acima do ground');
console.log('OK: corpse Canary 4240/4247 acima do ground e contador vermelho validados.');
