/* Integração do test server: estáticos + contas + save completo. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
function must(ok, msg) { if (!ok) throw Error(msg); }

const root = path.join(__dirname, '..');
const serverDir = path.join(root, 'server');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-idle-account-'));
const port = 34671;
const child = spawn(process.execPath, ['server.js'], {
  cwd: serverDir,
  env: Object.assign({}, process.env, {
    PORT:String(port), HOST:'127.0.0.1', TEST_SERVER:'1', MYSQL_HOST:'',
    GLOBAL_IDLE_DATA_DIR:dataDir,
  }),
  stdio:['ignore','pipe','pipe'],
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const base = `http://127.0.0.1:${port}`;

async function request(route, options) {
  const response = await fetch(base + route, options);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status:response.status, data };
}
async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try { const r = await request('/api/health'); if (r.data.ok) return; }
    catch (e) { /* inicializando */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('servidor não iniciou: ' + logs);
}
async function post(route, body) {
  return request(route, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
  });
}

(async () => {
  await waitReady();
  const rootPage = await request('/');
  must(rootPage.status === 200 && rootPage.data.includes('js/server-config.js'),
    'frontend não é servido na mesma porta');
  const config = await request('/js/server-config.js');
  must(config.data.includes('online:true') && config.data.includes('testServer:true'),
    'configuração online/test server não foi injetada');
  const accountClient = fs.readFileSync(path.join(root, 'game', 'js', 'account-client.js'), 'utf8');
  const gameClient = fs.readFileSync(path.join(root, 'game', 'js', 'game.js'), 'utf8');
  must(accountClient.includes('ACCOUNT_SERVER_CONFIG.online') &&
       accountClient.includes('function accountLoadCharacter'),
    'frontend não ativa API/carregamento completo automaticamente');
  must(gameClient.includes('account.role === "admin"') &&
       !gameClient.includes('const adminAllowed = !!serverCfg.testServer'),
    'painel Admin não está restrito à role admin');

  const registered = await post('/api/register', {login:'friend',password:'friend'});
  must(registered.status === 201 && registered.data.ok,
    'cadastro público de conta não está liberado');
  const duplicate = await post('/api/register', {login:'friend',password:'friend'});
  must(duplicate.status === 200 && !duplicate.data.ok && duplicate.data.error === 'ACCOUNT_EXISTS',
    'conta duplicada deveria ser erro de formulário sem HTTP 409');
  const friendLogin = await post('/api/login', {login:'friend',password:'friend'});
  must(friendLogin.status === 200 && friendLogin.data.ok,
    'conta recém-criada não consegue entrar');
  const friendToken=friendLogin.data.token;
  const forgedCoins=await post('/api/coins',{token:friendToken,amount:999999});
  must(forgedCoins.status===403&&forgedCoins.data.error==='ADMIN_ONLY',
    'usuário comum ainda consegue fabricar Tibia Coins');
  const firstFriend=await post('/api/characters',{token:friendToken,name:'Friend One',voc:'knight',
    data:JSON.stringify({name:'Friend One',voc:'knight',sex:'male'})});
  must(firstFriend.status===201&&firstFriend.data.coins===25,
    'bônus inicial de 25 TC não foi concedido pelo servidor');
  const secondFriend=await post('/api/characters',{token:friendToken,name:'Friend Two',voc:'druid',
    data:JSON.stringify({name:'Friend Two',voc:'druid',sex:'female'})});
  must(secondFriend.status===201&&secondFriend.data.coins===25,
    'criação de personagem adicional duplicou o bônus de TC');

  for (const credential of [['1','1'],['2','2']]) {
    const logged = await post('/api/login', {login:credential[0],password:credential[1]});
    must(logged.status === 200 && logged.data.ok && logged.data.account.role === 'admin',
      'login test server falhou: ' + credential[0]);
  }
  const login = await post('/api/login', {login:'2',password:'2'});
  const token = login.data.token;
  const created = await post('/api/characters', {
    token, name:'Server Test', voc:'druid',
    data:JSON.stringify({name:'Server Test',voc:'druid',level:7,hp:500,sex:'female',
      outfit:{type:'summoner',colors:[12,34,56,78]}}),
  });
  must(created.status === 201 && created.data.ok && created.data.character.sex === 'female' &&
    JSON.stringify(created.data.character.outfit.colors) === JSON.stringify([12,34,56,78]),
    'criação/resumo visual do personagem falhou');
  const id = created.data.character.id;
  const crossed = await request('/api/characters/' + id, {
    method:'PUT',headers:{'content-type':'application/json'},
    body:JSON.stringify({token,expected_version:created.data.character.saveVersion,
      voc:'paladin',level:500,data:JSON.stringify({id:'999',name:'Other',voc:'paladin'})}),
  });
  must(crossed.status===409&&crossed.data.error==='CHARACTER_IDENTITY_MISMATCH',
    'servidor aceitou save pertencente a outro personagem');
  const repaired = await request('/api/characters/' + id + '/repair', {
    method:'PUT',headers:{'content-type':'application/json'},
    body:JSON.stringify({token,voc:'druid',data:JSON.stringify({id:String(id),name:'Server Test',voc:'druid',sex:'female',hp:500,outfit:{type:'summoner',colors:[12,34,56,78]}})}),
  });
  must(repaired.status===200&&repaired.data.ok&&repaired.data.character.voc==='druid',
    'rota de reparo de identidade falhou');
  const accountSummary = await request('/api/me', {headers:{authorization:'Bearer ' + token}});
  const summaryChar = accountSummary.data.characters.find(c => Number(c.id) === Number(id));
  must(summaryChar && summaryChar.sex === 'female' && summaryChar.outfit &&
    summaryChar.outfit.colors[2] === 56 && summaryChar.snapshot && summaryChar.snapshot.voc === 'druid',
    'seletor/cache da conta não recebe outfit/cores/snapshot atuais');
  let loaded = await request('/api/characters/' + id, {
    headers:{authorization:'Bearer ' + token},
  });
  must(loaded.data.ok && JSON.parse(loaded.data.character.data).hp === 500,
    'save completo não foi carregado');
  const saved = await request('/api/characters/' + id, {
    method:'PUT', headers:{'content-type':'application/json'},
    body:JSON.stringify({token,expected_version:summaryChar.saveVersion,voc:'druid',level:8,
      data:JSON.stringify({name:'Server Test',voc:'druid',level:8,hp:700})}),
  });
  must(saved.data.ok, 'save de personagem falhou');
  loaded = await request('/api/characters/' + id, {
    headers:{authorization:'Bearer ' + token},
  });
  must(loaded.data.character.level === 8 && JSON.parse(loaded.data.character.data).hp === 700,
    'save atualizado não persistiu');

  console.log('OK: test server único, contas 1/1 e 2/2, Admin e save completo funcionando.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  child.kill('SIGTERM');
  fs.rmSync(dataDir, {recursive:true,force:true});
});
