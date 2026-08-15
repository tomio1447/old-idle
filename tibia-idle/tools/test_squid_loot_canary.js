const fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','game','js','hardcore-library.js'),'utf8');
for(const x of [
  '"rage-squid"',
  'chance:90,max:5,item:"small-ruby"',
  'chance:.5,max:1,item:"fire-axe"',
  '"squid-warden"',
  'chance:11,max:57,item:"platinum-coin"',
  'chance:10.003,max:4,item:"ultimate-mana-potion"',
  'if (!mobs[slug])',
]) if(!s.includes(x)) throw Error('loot/Canary guard ausente: '+x);
console.log('OK: Rage Squid e Squid Warden usam chances/maxCount do Canary (fallback sem overwrite).');
