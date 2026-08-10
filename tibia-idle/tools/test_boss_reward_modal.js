/* Regressão: bosses sem cooldown e Reward Chest em slots dedicados. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const gameJs = fs.readFileSync(path.join(game,'js','game.js'),'utf8');
const rewardJs = fs.readFileSync(path.join(game,'js','reward-chest.js'),'utf8');
const css = fs.readFileSync(path.join(game,'css','layout.css'),'utf8');
function must(ok,msg){ if(!ok) throw Error(msg); }

must(gameJs.includes('const BOSS_COOLDOWN = 0;'), 'Cooldown global dos bosses não foi zerado');
must(!gameJs.includes('Cooldown iniciado: 16h.'), 'Log ainda anuncia cooldown de 16h');
for (const id of ['the-monster','goshnar-s-greed','timira-the-many-headed','ferumbras-mortal-shell']) {
  // Todos os bosses antigos apontam para BOSS_COOLDOWN; Scarlett usa o mesmo
  // valor em scarlett-boss.js.
  must(gameJs.includes(`"${id}"`) || gameJs.includes(`id:"${id}"`), id+' ausente');
}
const scarlett = fs.readFileSync(path.join(game,'js','scarlett-boss.js'),'utf8');
must(scarlett.includes('typeof BOSS_COOLDOWN !== "undefined" ? BOSS_COOLDOWN'),
  'Scarlett não herda o cooldown global zero');

must(rewardJs.includes('const REWARD_CHEST_ITEM_ID = 19250;'),
  'Reward Chest não usa o client id 19250');
const chestPng=fs.readFileSync(path.join(game,'assets','item','reward-chest.png'));
must(chestPng.readUInt32BE(16)===45 && chestPng.readUInt32BE(20)===40,
  'Sprite oficial do Reward Chest ausente/incorreta');
must(rewardJs.includes('data-reward-boss') && rewardJs.includes('rewardBossCard') &&
     rewardJs.includes('Escolha o boss para abrir sua recompensa.'),
  'Primeira tela não exige clicar na imagem do boss');
must(rewardJs.includes('class="reward-slot') && rewardJs.includes('class="reward-slot-grid"') &&
     rewardJs.includes('RECOLHER TUDO'), 'Tela de drops em slots incompleta');
for (const cls of ['.reward-chest-custom','.reward-boss-grid','button.reward-boss-card',
                   '.reward-slot-grid','button.reward-slot','.reward-slot-count'])
  must(css.includes(cls), 'CSS ausente: '+cls);
const combat=fs.readFileSync(path.join(game,'js','combat.js'),'utf8');
must(combat.includes('rewardChestAdd(p, l.item, count, rewardSource)') &&
     combat.indexOf('if (mob.boss) {') < combat.indexOf('else if (l.item === "gold-coin")'),
  'Drops/moedas do boss não são selados no pacote do Reward Chest');

// Dois bosses geram pacotes separados; abrir/coletar um não revela/remove o outro.
const ctx={window:{},console};ctx.window=ctx;
ctx.document={getElementById(){return null;}};
ctx.GAMEDATA={items:{a:{n:'A'},b:{n:'B'}}};
ctx.renderRewardButton=()=>{};ctx.save=()=>{};
ctx.addLootPouch=(p,slug,n)=>{p.lootPouch=p.lootPouch||{};p.lootPouch[slug]=(p.lootPouch[slug]||0)+n;};
vm.createContext(ctx);vm.runInContext(rewardJs,ctx);
const p={rewardChest:{}};
ctx.rewardChestAdd(p,'a',2,{bundleId:'fight-1',bossId:'scarlett',name:'Scarlett',sprite:'scarlett-etzel'});
ctx.rewardChestAdd(p,'b',3,{bundleId:'fight-1',bossId:'scarlett',name:'Scarlett',sprite:'scarlett-etzel'});
ctx.rewardChestAdd(p,'a',4,{bundleId:'fight-2',bossId:'timira',name:'Timira',sprite:'timira'});
must(ctx.rewardChestBundleList(p).length===2,'Batalhas de boss foram misturadas');
must(ctx.rewardChestItems(p,'fight-1').length===2 && ctx.rewardChestItems(p,'fight-2')[0].count===4,
  'Drops não ficaram associados à imagem do boss');
must(ctx.rewardChestClaimOne(p,'a','fight-1') && p.lootPouch.a===2 && p.rewardChest.a===4,
  'Coleta de um slot removeu item de outro boss');
must(ctx.rewardChestClaimBundle(p,'fight-2')===1 && p.lootPouch.a===6 && !p.rewardChest.a,
  'Coleta do pacote de boss quebrou');
must(ctx.rewardChestClaimAll(p)===1 && p.lootPouch.b===3 && !ctx.rewardChestBundleList(p).length,
  'Coleta total quebrou');

console.log('OK: bosses sem cooldown; Reward Chest 19250 abre boss antes dos slots.');
