/* Contrato de cooldown do combate. Execute: node tibia-idle/tools/test_cooldowns.js */
const fs = require('fs'), vm = require('vm');
const root = __dirname + '/../game/js/';
const combat = fs.readFileSync(root + 'combat.js', 'utf8');
const combo = fs.readFileSync(root + 'combo.js', 'utf8');
const cdCode = fs.readFileSync(root + 'cooldown.js', 'utf8');
const ctx = { window:{ SPELLGROUPS:{} }, Date, Math }; ctx.window.window=ctx.window;
vm.createContext(ctx); vm.runInContext(cdCode, ctx, { filename:'cooldown.js' });
const fail = (m) => { throw Error(m); };
// Spell cooldown + group cooldown: uma magia no grupo Attack trava outra.
ctx.SPELLS = { a:{cd:4000,grupos:{'1':2000}}, b:{cd:3000,grupos:{'1':2000}}, support:{cd:2000,grupos:{'3':2000}} };
const p = {}; ctx.cdStart(p,'a',ctx.SPELLS.a,1000);
if (ctx.cdReady(p,'a',1001) || ctx.cdReady(p,'b',1001)) fail('Grupo de spell não bloqueou corretamente');
if (!ctx.cdReady(p,'support',1001)) fail('Grupo independente foi bloqueado indevidamente');
// Regressões de runtime: spell/rune e combo consultam a mesma exaustão.
for (const needle of ['entCd(c, p, "offensiveCd") > now', 'entCdSet(c, p, "offensiveCd", now + 2000)'])
  if (!combat.includes(needle)) fail('Cooldown ofensivo ausente: '+needle);
if (!combo.includes('entCd(c, p, "offensiveCd") > now')) fail('Combo ignora offensiveCd');
// HP e mana usam o mesmo potionCd; rune tem cd próprio.
for (const needle of ['entCd(c, p, "potionCd") > now', 'entCdSet(c, p, "potionCd", now + 1000)', 'entCdSet(c, p, "runeCd", now + (s.cd || 2000))'])
  if (!combat.includes(needle)) fail('Contrato potion/runa ausente: '+needle);
if (!fs.readFileSync(root + 'accessories.js', 'utf8').includes('MAGIC_SHIELD_POTION_CD_MS'))
  fail('Magic Shield Potion sem cooldown próprio');
console.log('OK: spells/grupos, runas, potions e combo respeitam cooldowns.');
// Combo pode conter slots vazios; multi-target não pode tentar ler .min deles.
const comboCode = fs.readFileSync(root + 'combo.js', 'utf8');
const comboCtx = { window:{}, SPELLS:{}, SUPPLIES:{} }; comboCtx.window=comboCtx;
vm.createContext(comboCtx); vm.runInContext(comboCode, comboCtx, { filename:'combo.js' });
comboCtx.comboEscolhe({ mobs:[{hp:1},{hp:1}] }, { config:{ combo:[null] } }, {}, Date.now());
console.log('OK: slots nulos do combo não interrompem o loop.');
comboCtx.SPELLS = {
  a:{id:'a',type:'attack',vocs:['sorcerer'],lvl:1,mana:10,cd:4000},
  b:{id:'b',type:'attack',vocs:['sorcerer'],lvl:1,mana:10,cd:4000}
};
comboCtx.SUPPLIES = { 'sudden-death-rune':{type:'attack',lvl:1} };
comboCtx.entCd = () => 0;
comboCtx.cdReady = (p,id,now) => !((p._spellCd&&p._spellCd[id]||0)>now);
comboCtx.supplyAllowed = () => true;
comboCtx.canRechargeSupply = () => true;
const comboPlayer = { voc:'sorcerer', level:50, mp:500, ml:20,
  config:{ combo:[
    {kind:'spell',id:'a',min:1},
    {kind:'rune',id:'sudden-death-rune',min:1},
    {kind:'spell',id:'b',min:1}]},
  _spellCd:{ a: Date.now()+20000 } };
const chosen = comboCtx.comboEscolhe({ mobs:[{hp:1}], runeCd:0 }, comboPlayer, {hp:1}, Date.now());
if (!chosen || chosen.kind!=='spell' || chosen.id!=='b')
  fail('combo escolheu runa com spell posterior ainda disponível: '+JSON.stringify(chosen));
console.log('OK: combo prioriza spell com CD disponível em vez de runa no meio.');

ctx.RUNEDATA = { 'avalanche-rune': { nome:'Avalanche Rune', cd:2000, gcd:2000, grupo:'attack' } };
ctx.SPELLS = { 'exevo-gran-mas-frigo': { name:'Eternal Winter', cd:4000, icon:1, grupos:{'1':2000} } };
const online = {
  _spellCd: { 'exevo-gran-mas-frigo': 5000 },
  _groupCd: { '1': 3000, attack: 3000 },
  _runeCd: 4000,
  _lastRuneId: 'avalanche-rune',
};
ctx.cdHydrateFromAuthority(online, 2000, 100000);
const winter = ctx.cdActiveSpells(online, 100000).find((x)=>x.id==='exevo-gran-mas-frigo');
const aval = ctx.cdActiveSpells(online, 100000).find((x)=>x.id==='avalanche-rune');
const atk = ctx.cdGroupState(online, '1', 100000);
if (!winter || Math.abs(winter.resta - 3000) > 1) fail('barra não hidratou CD da magia online');
if (!aval || Math.abs(aval.resta - 2000) > 1) fail('barra não hidratou CD da avalanche');
if (!atk.ativo || Math.abs(atk.resta - 1000) > 1) fail('barra não hidratou grupo Attack');
console.log('OK: barra de cooldown hidrata magia, runa e grupo a partir do relógio autoritativo.');
