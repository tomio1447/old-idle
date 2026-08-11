/* Regressão: só animações de tile realmente publicadas podem ser requisitadas. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const game=path.join(__dirname,'..','game'),js=path.join(game,'js'),tiles=path.join(game,'assets','tiles');
function must(ok,msg){if(!ok)throw Error(msg);}
const ctx={window:{}};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js,'tileanimdata.js'),'utf8'),ctx);
const metadata=Object.keys(ctx.TILE_ANIM).sort((a,b)=>+a-+b);
const files=fs.readdirSync(tiles).filter(n=>/^\d+_anim\.png$/.test(n)).map(n=>n.replace('_anim.png','')).sort((a,b)=>+a-+b);
must(JSON.stringify(metadata)===JSON.stringify(files),
  `TILE_ANIM (${metadata.length}) diverge dos strips publicados (${files.length})`);
for(const id of ['4633','2941','4635','4634','4599','4598','4636','4600','2943','2111','35500','38534','38536','31158','30961','1718'])
  must(!ctx.TILE_ANIM[id], 'metadata ainda requisita strip inexistente: '+id);
must(fs.existsSync(path.join(game,'assets','ui','conditions','cond-poison.png')),
  'alias cond-poison ausente');
const preload=fs.readFileSync(path.join(js,'preload.js'),'utf8');
const tilemap=fs.readFileSync(path.join(js,'tilemap.js'),'utf8');
must(preload.includes("TILE_ANIM[id]") && tilemap.includes('const drawW = w + 1, drawH = h + 1'),
  'preloader/renderer não protegem animações e seams');
console.log(`OK: ${metadata.length} animações publicadas, zero metadata 404 e bleed anti-grid ativo.`);
