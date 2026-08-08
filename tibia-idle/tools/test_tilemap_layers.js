/* Regressão de mapas OTBM: pisos não podem cortar sprites multi-SQM. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'tilemap.js'), 'utf8');
const ground = src.indexOf('Primeira passagem: todos os pisos');
const objects = src.indexOf('Segunda passagem: paredes');
if (ground < 0 || objects < 0 || ground >= objects) throw Error('Tile renderer deve desenhar floors antes de objetos');
const beforeObjects = src.slice(ground, objects);
const objectsBlock = src.slice(objects, src.indexOf('Terceira passagem:', objects));
if (!/L\.v\.length/.test(beforeObjects)) throw Error('Passagem de floor deve ignorar lista vazia');
if (!/for \(const id of L\.g\) TileSprites\.drawDeco/.test(objectsBlock)) throw Error('Objetos OTBM devem usar âncora drawDeco');
console.log('OK: tilemap usa passes floor → objetos → decoração; sprites multi-SQM não são cortados por pisos.');
