const fs=require('fs'),path=require('path');const game=path.join(__dirname,'..','game');
const f=path.join(game,'assets','ui','background','backgroudsummer2026.png'),css=fs.readFileSync(path.join(game,'css','layout.css'),'utf8');
if(!fs.existsSync(f))throw Error('Background Summer ausente');
for(const x of ['backgroudsummer2026.png','background-attachment: fixed','#app { background: transparent'])if(!css.includes(x))throw Error('CSS background incompleto: '+x);
console.log('OK: Background Summer fixo configurado atrás do conteúdo.');
