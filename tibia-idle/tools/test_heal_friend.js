/* Regressão Heal Friend. Execute: node tibia-idle/tools/test_heal_friend.js */
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync(__dirname + '/../game/js/party.js', 'utf8');
const ctx = { console, Date, Math, window: {},
  SPELLS: { 'exura-sio': { name:'Heal Friend', mana:120, lvl:18, cd:1000, words:'exura sio', type:'heal', vocs:['druid'] } },
  healFriendSpells: () => ['exura-sio'],
  partyHealTargets: () => [{ id:'knight-1', name:'Tomio', hp:400, maxHp:1000 }],
  rollSpell: () => 600, tryCriticalHeal: () => ({ crit:false, extraPct:0 }),
  cdReady: () => true, cdStart: () => {}, entCd: () => 0, entCdSet: () => {},
  addManaSpent: () => {}, spellWords: (id) => id.replace(/-/g, ' '),
  partyApplyFriendHeal: (p, target, amount) => { target.hp += amount; ctx.applied = { target, amount }; },
};
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(code, ctx, { filename:'party.js' });
// Substitui as integrações de roster pelo cenário determinístico de teste.
ctx.partyHealTargets = () => [{ id:'knight-1', name:'Tomio', hp:400, maxHp:1000 }];
ctx.partyApplyFriendHeal = (p, target, amount) => { target.hp += amount; ctx.applied = { target, amount }; };
const p = { id:'druid-1', voc:'druid', level:100, mp:1000, config:{ healFriendSpells:{ 'exura-sio':{ enabled:true, at:70, minTargets:2 } }, healFriendTargets:{ 'knight-1':{ enabled:true, priority:1 } } } };
const targetEnt = { id:'knight-1', p:{ id:'knight-1', hp:400 }, x:.4, y:.5 };
const c = { players:[{ id:'druid-1', p }, targetEnt], player:{ id:'druid-1', x:.5, y:.5 }, events:[] };
if (!ctx.tryHealFriend(c,p,Date.now())) throw Error('Exura Sio não foi usada apesar de alvo abaixo do limiar');
if (!ctx.applied || ctx.applied.amount !== 600) throw Error('Cura não foi aplicada ao alvo');
if (!c.events.some(e => e.t==='heal-friend' && e.targetId==='knight-1')) throw Error('Evento visual do Heal Friend ausente');
if (!c.events.some(e => e.t==='say' && e.text === 'exura sio "Tomio"')) throw Error('Fala parametrizada ausente');
console.log('OK: Heal Friend — seleção, aplicação, evento e fala validados.');
