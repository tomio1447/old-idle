/* Rates de loot aumentam chance, nunca quantidade. */
const fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','game','js','combat.js'),'utf8');
if(!/l\.chance \* lootRate \* \(c\.lootMul \|\| 1\)/.test(s)) throw Error('Multiplicadores não aplicados à chance');
if(/const boosted = count \* lootRate/.test(s)||/const boosted = count \* c\.lootMul/.test(s)) throw Error('Multiplicador ainda altera quantidade');
console.log('OK: loot rate/PvP alteram somente chance, não o max do item.');
