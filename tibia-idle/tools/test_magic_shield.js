/* Regressão Magic Shield. Execute: node tibia-idle/tools/test_magic_shield.js */
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/../game/js/accessories.js', 'utf8');
const ctx = {
  console, Date, Math,
  SPELLS: { 'utamo-vita': { lvl: 14, mana: 50, vocs: ['sorcerer', 'druid'], cd: 14000, words: 'utamo vita' } },
  IMBDATA: { bases: { 1: { duration: 72000 } } },
  SLOTS: [],
  maxStats: () => ({ hp: 1000, mp: 1000 }), effMagic: () => 50,
  cdReady: () => true, cdStart: () => {}, addManaSpent: () => {}, combatManaSkillGain: () => 0,
  entCdSet: () => {}, isMagicShieldActive: () => false,
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'accessories.js' });
const fail = (m) => { throw new Error(m); };
const base = (voc, mode) => ({ voc, level: 100, hp: 1000, mp: 1000, equip: {}, config: { magicShield: { mode, enabled: mode !== 'off', useSpell: true, hpBelow: 45, mpAbove: 15 } } });
if (!ctx.magicShieldSpellAllowed(base('master sorcerer', 'always'))) fail('Master Sorcerer deveria poder usar utamo vita');
if (!ctx.magicShieldSpellAllowed(base('elder druid', 'always'))) fail('Elder Druid deveria poder usar utamo vita');
let p = base('master sorcerer', 'always'), c = { events: [], player: { x: .5, y: .5 } };
if (!ctx.tryMagicShield(c, p, Date.now())) fail('Modo sempre ativo deveria castar com HP cheio');
p = base('druid', 'hp'); p.hp = 900;
if (ctx.tryMagicShield({ events: [], player: {} }, p, Date.now())) fail('Modo por HP não deveria castar acima do limiar');
p = base('druid', 'off'); p.hp = 1;
if (ctx.tryMagicShield({ events: [], player: {} }, p, Date.now())) fail('Modo não usar não deveria castar');
const src = code;
if (!src.includes('[data-ms-mode]')) fail('Binding dos botões Magic Shield ausente');
console.log('OK: Magic Shield — promotions, modos e binding validados.');
