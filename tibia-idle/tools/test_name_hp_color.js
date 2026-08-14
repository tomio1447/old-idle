/* Personagens e monstros: nome deve acompanhar a cor da barra de HP. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'render.js'), 'utf8');
const fn = src.match(/function drawNameBars\([\s\S]*?\n\}/);
if (!fn) throw Error('drawNameBars ausente');
if (!/const hpColor = playerHpBarColor\(hpPct\)/.test(fn[0])) throw Error('Cor dinâmica de HP ausente no nome do player');
if (!/drawNameText\(ctx, x, nY, name, hpColor/.test(fn[0])) throw Error('Nome do player ainda não segue HP');
if (/name, "#ffffff"/.test(fn[0])) throw Error('Nome branco fixo ainda presente');
console.log('OK: nome de player/party acompanha a cor da barra de HP.');
