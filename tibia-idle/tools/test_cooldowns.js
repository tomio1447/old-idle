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
console.log('OK: spells/grupos, runas, potions e combo respeitam cooldowns.');
// Combo pode conter slots vazios; multi-target não pode tentar ler .min deles.
const comboCode = fs.readFileSync(root + 'combo.js', 'utf8');
const comboCtx = { window:{}, SPELLS:{}, SUPPLIES:{} }; comboCtx.window=comboCtx;
vm.createContext(comboCtx); vm.runInContext(comboCode, comboCtx, { filename:'combo.js' });
comboCtx.comboEscolhe({ mobs:[{hp:1},{hp:1}] }, { config:{ combo:[null] } }, {}, Date.now());
console.log('OK: slots nulos do combo não interrompem o loop.');
