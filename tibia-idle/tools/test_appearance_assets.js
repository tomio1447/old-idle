/* Auditoria ampla de assets 15x: outfits, addons, montarias e monstros. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const game=path.join(__dirname,'..','game');
const ctx={window:{}};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(game,'js/appearancedata.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(game,'js/mobsheetdata.js'),'utf8'),ctx);
const missing=[];
for(const o of ctx.APPEARANCES.outfits){
 for(const suf of ['', '-a1','-a2']){
  const base=path.join(game,'assets/appearance/outfit',o.id+suf+'.base.png');
  if(suf && !fs.existsSync(base)) continue;
  if(!fs.existsSync(base)) missing.push(base);
  if(o.sexo!=='avatar' && !fs.existsSync(base.replace('.base.png','.mask.png'))) missing.push(base.replace('.base.png','.mask.png'));
 }
}
for(const m of ctx.APPEARANCES.mounts){const f=path.join(game,'assets/appearance/mount',m.id+'.base.png');if(!fs.existsSync(f))missing.push(f);}
const invalidSheets=[];
for(const slug of Object.keys(ctx.MOBSHEETS)){
 const f=path.join(game,'assets/mob',slug+'.png');
 if(!fs.existsSync(f)){missing.push(f);continue;}
 // PNG IHDR: largura/altura big-endian nos bytes 16..23. Sem dependência npm.
 const b=fs.readFileSync(f), w=b.readUInt32BE(16), h=b.readUInt32BE(20), m=ctx.MOBSHEETS[slug];
 if(w!==m.cw*m.cols || h!==m.ch*m.rows) invalidSheets.push(`${slug}: ${w}x${h}, catálogo ${m.cw}x${m.ch} × ${m.cols}x${m.rows}`);
}
if(missing.length) throw Error('Assets ausentes: '+missing.slice(0,20).join(', ')+' ('+missing.length+' total)');
if(invalidSheets.length) throw Error('Geometria inválida de sheets: '+invalidSheets.slice(0,10).join('; ')+' ('+invalidSheets.length+' total)');
console.log('OK: outfits, addons, mounts e sheets de monstros presentes e geometricamente válidos.');
