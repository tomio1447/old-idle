/* Loot Pouch: 50 slots é limiar do autoseller, nunca descarte de loot. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const playerSrc = fs.readFileSync(path.join(game, 'js', 'player.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(game, 'js', 'ui.js'), 'utf8');
const combatSrc = fs.readFileSync(path.join(game, 'js', 'combat.js'), 'utf8');
function must(ok, msg) { if (!ok) throw Error(msg); }

const start = playerSrc.indexOf('const LOOT_POUCH_MAX_SLOTS');
const end = playerSrc.indexOf('function distanceWeaponPower', start);
must(start >= 0 && end > start, 'bloco da Loot Pouch não encontrado em player.js');
const items = {};
for (let i=0;i<55;i++) items['loot-'+i] = {n:'Loot '+i,s:null,sell:10,cls:2};
items['class-3'] = {n:'Class 3',s:'weapon',sell:5000,cls:3};
items['class-4'] = {n:'Class 4',s:'armor',sell:9000,cls:4};
const ctx = {
  GAMEDATA:{items}, SUPPLIES:{},
  itemUsesInstances(){ return false; },
  isNoSell(){ return false; },
  currencyValue(){ return 0; },
  creditCurrency(){ return 0; },
  freeCapacity(){ return 1e9; },
  itemUnitWeight(){ return 0.1; },
  addLog(){},
};
vm.createContext(ctx);
vm.runInContext(playerSrc.slice(start,end),ctx);
const p={lootPouch:{},gold:0};
for(let i=0;i<50;i++) must(ctx.addLootPouch(p,'loot-'+i,1),'falha antes de 50');
must(ctx.lootPouchSlotsUsed(p)===50,'contagem de 50 slots incorreta');
must(ctx.addLootPouch(p,'loot-50',2) && p.lootPouch['loot-50']===2,
  'loot novo foi descartado quando a pouch chegou a 100%');
must(ctx.lootPouchSlotsUsed(p)===51,'overflow seguro não foi contabilizado');
must(ctx.addLootPouch(p,'class-3',1) && ctx.addLootPouch(p,'class-4',1),
  'classes protegidas não entraram na Loot Pouch');
must(ctx.isProtectedPouchClass('class-3') && ctx.isProtectedPouchClass('class-4') &&
     !ctx.isProtectedPouchClass('loot-1'), 'proteção de classificação incorreta');

// Executa o rollLoot real com a pouch já acima de 50 slots.
Object.assign(ctx,{
  isNoCollect(){return false;}, goldStage(){return 1;}, currencyValue(){return 0;},
  creditCurrency(){return 0;}, addAmmo(){}, SERVER_LOOT_RATE:1,
});
const rollStart=combatSrc.indexOf('function rollLoot');
const rollEnd=combatSrc.indexOf('\n\n/* ======================================================================\n * PARTY COMBAT',rollStart);
vm.runInContext(combatSrc.slice(rollStart,rollEnd),ctx);
p.config={lootFilter:'all'};p.supplies={};
const combat={players:[],lootMul:1,stats:{gold:0,loot:{}},hunt:{level:1},events:[]};
const mob={boss:false,slug:'rat',def:{loot:[{item:'loot-54',chance:100,max:1}]}};
const got=ctx.rollLoot(combat,p,mob);
must(got.length===1 && p.lootPouch['loot-54']===1,
  'rollLoot real não enviou o drop para a pouch em overflow');

const sellStart=uiSrc.indexOf('function sellPouchItem');
const sellEnd=uiSrc.indexOf('\n\n/* Valor total vendável da mochila',sellStart);
Object.assign(ctx,{
  toast(){},addLog(){},fmtFull(n){return String(n);},
  isNoSell(){return false;},
});
vm.runInContext(uiSrc.slice(sellStart,sellEnd),ctx);
const before3=p.lootPouch['class-3'], before4=p.lootPouch['class-4'];
const result=ctx.sellAllPouch(p);
must(result.gold>0,'itens comuns não foram vendidos');
must(p.lootPouch['class-3']===before3 && p.lootPouch['class-4']===before4,
  'sell all vendeu item class 3/4');
must(ctx.sellPouchItem(p,'class-3')===0 && ctx.sellPouchItem(p,'class-4')===0,
  'venda manual aceitou item class 3/4');
must(combatSrc.includes('addLootPouch(p, l.item, count)'),
  'loot normal não é enviado para addLootPouch');
must(!playerSrc.includes('lootPouchSlotsUsed(p) + needed > LOOT_POUCH_MAX_SLOTS'),
  'bloqueio silencioso de pouch cheia ainda existe');

// Contagem de slots: 1 por stack, nunca quantidade de equipamento.
ctx.itemUsesInstances = () => true;
items['sword'] = {n:'sword',s:'weapon',sell:100,cls:1};
p.lootPouch = { sword: 21007 };
must(ctx.lootPouchSlotsUsed(p) === 1, 'equipamento empilhado na pouch não pode contar 21007 slots');
must(ctx.clearLootPouch(p) === 1 && Object.keys(p.lootPouch).length === 0,
  'clearLootPouch não esvaziou a pouch');
must(ctx.lootPouchSlotsUsed(p) === 0, 'slots após limpar devem ser 0');

const uiClear = uiSrc.includes('LIMPAR LOOT POUCH') &&
  uiSrc.includes('clearLootPouchWithConfirm') &&
  uiSrc.includes('Limpar toda a Loot Pouch? Itens serão perdidos.');
must(uiClear, 'Config da Loot Pouch sem botão/confirmação de limpar');
must(uiSrc.includes('sellAllPouchAndPersist') && uiSrc.includes('accountSellInstanceLootPouch') &&
  uiSrc.includes('persistLootPouchSell'),
  'Sell All / venda unitária sem persistência online da Loot Pouch');

const gameSrc = fs.readFileSync(path.join(game, 'js', 'game.js'), 'utf8');
must(gameSrc.includes('sellAllPouchAndPersist') && gameSrc.includes('!onlineAuthorityCombat()'),
  'botão/autoseller ainda vende só no cliente em hunt online');

console.log('OK: loot nunca some com 50+ slots; classes 3/4 entram e nunca são vendidas; clear + slots sane.');
