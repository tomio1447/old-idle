/* Regressão: bosses oficiais usam exatamente o loot importado do servidor. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
function must(ok, msg) { if (!ok) throw Error(msg); }

const ctx = { window:{}, console, BOSS_COOLDOWN:0, addEventListener(){} };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  'gamedata.js','weapondata.js','weapons.js','ammodata.js','ammo.js',
  'monsterdata.js','mobsheetdata.js','monsters.js','soulwar.js',
]) vm.runInContext(fs.readFileSync(path.join(js, file), 'utf8'), ctx);

const gameSrc = fs.readFileSync(path.join(js, 'game.js'), 'utf8');
const defsStart = gameSrc.indexOf('const BOSS_DEFS = {');
const defsEnd = gameSrc.indexOf('\n\n/* Quivers', defsStart);
vm.runInContext(gameSrc.slice(defsStart, defsEnd) + '\nwindow.__BOSS_DEFS = BOSS_DEFS;', ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'scarlett-boss.js'), 'utf8'), ctx);
const lootStart = gameSrc.indexOf('function bossLootReal');
const lootEnd = gameSrc.indexOf('\n\nfunction bossLootText', lootStart);
vm.runInContext(gameSrc.slice(lootStart, lootEnd), ctx);

const official = [
  'goshnar-s-greed','timira-the-many-headed',
  'ferumbras-mortal-shell','scarlett-etzel',
];
for (const id of official) {
  const boss = ctx.__BOSS_DEFS[id];
  const server = ctx.MONSTERDATA[boss.baseMonster];
  must(boss && server && server.loot && server.loot.length,
    id + ': boss/loot do servidor ausente');
  const actual = ctx.bossLootReal(boss);
  must(JSON.stringify(actual) === JSON.stringify(server.loot),
    id + ': chances/quantidades divergem do servidor');
  for (const drop of actual) {
    must(ctx.GAMEDATA.items[drop.item], id + ': item sem ficha: ' + drop.item);
    const png = path.join(game, 'assets', 'item', drop.item + '.png');
    const gif = path.join(game, 'assets', 'item', drop.item + '.gif');
    must(fs.existsSync(png) || fs.existsSync(gif), id + ': item sem sprite: ' + drop.item);
  }
}
const greedLoot = ctx.bossLootReal(ctx.__BOSS_DEFS['goshnar-s-greed']);
const desire = greedLoot.find(drop => drop.item === 'bag-you-desire');
must(greedLoot.length === 21 && desire && desire.chance === 0.1 && desire.max === 1,
  'Bag You Desire deveria ter chance de servidor 0,1%');
must(ctx.bossLootReal(ctx.__BOSS_DEFS['ferumbras-mortal-shell']).length === 57,
  'Ferumbras deveria usar as 57 entradas do servidor');
must(ctx.bossLootReal(ctx.__BOSS_DEFS['timira-the-many-headed']).length === 30,
  'Timira deveria usar as 30 entradas do servidor');
must(ctx.bossLootReal(ctx.__BOSS_DEFS['scarlett-etzel']).length === 36,
  'Scarlett deveria usar as 36 entradas do servidor');

console.log('OK: Goshnar 21, Ferumbras 57, Timira 30 e Scarlett 36 drops idênticos ao servidor.');
