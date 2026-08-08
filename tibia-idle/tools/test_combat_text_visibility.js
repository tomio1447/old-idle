/* Regressão visual: combate idle não deve criar mural de texto na cena. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'render.js'), 'utf8');
function must(rx, msg) { if (!rx.test(src)) throw Error(msg); }
must(/const FLOATER_MAX_LIFE = 2000;/, 'Floaters devem durar no máximo 2s');
must(/kind === "damage" \? 1300/, 'Dano deve expirar antes de 2s');
must(/kind === "restore" \? 1150/, 'Cura deve expirar antes de 2s');
must(/this\.floaters\.length > 28/, 'Fila de floaters deve ser limitada');
must(/function floaterAlpha\(p\)/, 'Fade progressivo dos floaters ausente');
must(/TALK\.MONSTER_YELL \? 2000 : 1600/, 'Falas/magias devem durar no máximo 2s');
must(/dono\.speech\.length > 2/, 'Fila de magias/falas deve ser limitada');
must(/p \* 10/, 'Falas devem subir enquanto desaparecem');
// O renderer atual não implementa mapa de luz/escurecimento (radial overlay).
if (/createRadialGradient/.test(src)) throw Error('Iluminação radial não deve escurecer a cena');
console.log('OK: textos de combate desvanecem durante a subida (≤2s) e iluminação dinâmica está desativada.');
