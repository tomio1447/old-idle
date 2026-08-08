/* Itens de inventário 15x devem ocupar célula 32×32, sem stretch. */
const fs=require('fs'),path=require('path');const dir=path.join(__dirname,'..','game','assets','item');
for(const s of ['arrow','bolt','power-bolt','burst-arrow','poison-arrow','ruby-necklace']){
 const b=fs.readFileSync(path.join(dir,s+'.png')); const w=b.readUInt32BE(16),h=b.readUInt32BE(20);
 if(w!==32||h!==32)throw Error(`${s}: esperado 32×32, recebido ${w}×${h}`);
}
console.log('OK: arrows, bolts e Ruby Necklace importados como sprites 15x 32×32.');
