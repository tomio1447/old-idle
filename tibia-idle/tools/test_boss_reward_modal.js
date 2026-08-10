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

must(rewardJs.includes('class="reward-slot') &&
     rewardJs.includes('class="reward-slot-art"') &&
     rewardJs.includes('class="reward-slot-count"'),
  'Reward Chest não cria um slot dedicado para cada item');
must(rewardJs.includes('class="reward-slot-grid"') &&
     rewardJs.includes('RECOLHER TUDO'),
  'Modal personalizado do Reward Chest incompleto');
for (const cls of ['.reward-chest-custom','.reward-slot-grid','button.reward-slot','.reward-slot-count'])
  must(css.includes(cls), 'CSS ausente: '+cls);

// Funções de armazenamento continuam movendo item individual/tudo à pouch.
const ctx={window:{},console};ctx.window=ctx;
ctx.document={getElementById(){return null;}};
ctx.GAMEDATA={items:{a:{n:'A'},b:{n:'B'}}};
ctx.renderRewardButton=()=>{};ctx.save=()=>{};
ctx.addLootPouch=(p,slug,n)=>{p.lootPouch=p.lootPouch||{};p.lootPouch[slug]=(p.lootPouch[slug]||0)+n;};
vm.createContext(ctx);vm.runInContext(rewardJs,ctx);
const p={rewardChest:{a:2,b:3}};
must(ctx.rewardChestItems(p).length===2,'Listagem do Reward Chest quebrou');
must(ctx.rewardChestClaimOne(p,'a') && p.lootPouch.a===2 && !p.rewardChest.a,
  'Coleta por slot quebrou');
must(ctx.rewardChestClaimAll(p)===1 && p.lootPouch.b===3 && !Object.keys(p.rewardChest).length,
  'Coleta total quebrou');

console.log('OK: bosses sem cooldown e Reward Chest personalizado em slots.');
