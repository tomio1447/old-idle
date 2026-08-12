/* Market: TC/banco autoritativos, sem crédito cliente e transferências versionadas. */
"use strict";
const fs=require("fs"),os=require("os"),path=require("path"),{spawn}=require("child_process");
const root=path.join(__dirname,".."),serverDir=path.join(root,"server"),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"market-authority-"));
const port=41100+(process.pid%150),base=`http://127.0.0.1:${port}`;let child,logs="";
function must(v,m){if(!v)throw Error(m);}async function request(route,options){const response=await fetch(base+route,options),text=await response.text();let data;
  try{data=JSON.parse(text);}catch(e){data=text;}return {status:response.status,data};}
async function post(route,body){return request(route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function put(route,body){return request(route,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
async function start(){child=spawn(process.execPath,["server.js"],{cwd:serverDir,env:Object.assign({},process.env,{PORT:String(port),HOST:"127.0.0.1",MYSQL_HOST:"",TEST_SERVER:"1",GLOBAL_IDLE_DATA_DIR:dataDir}),stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",c=>logs+=c);child.stderr.on("data",c=>logs+=c);for(let i=0;i<100;i++){try{if((await request("/api/health")).data.ok)return;}catch(e){}await new Promise(r=>setTimeout(r,35));}throw Error(logs);}
(async()=>{await start();const login=await post("/api/login",{login:"2",password:"2"}),token=login.data.token;
  const created=await post("/api/characters",{token,name:"Market Hero",voc:"knight",data:JSON.stringify({name:"Market Hero",voc:"knight"})}),c=created.data.character;
  const repaired=await put("/api/characters/"+c.id+"/repair",{token,voc:"knight",data:JSON.stringify(Object.assign({},c.snapshot,{id:String(c.id),name:c.name,voc:"knight",gold:10000}))});
  const version=repaired.data.character.saveVersion,acquired=await post("/api/lease/acquire",{token,holder_id:"marketholder1"}),
    lease={holder_id:acquired.data.holderId,lease_token:acquired.data.leaseToken};
  const transfer=Object.assign({token,char_id:c.id,expected_version:version,amount:1000},lease);
  const raced=await Promise.all([post("/api/market/deposit",transfer),post("/api/market/deposit",transfer)]);
  must(raced.filter(x=>x.status===200).length===1&&raced.filter(x=>x.status===409).length===1,
    "dois depósitos da mesma versão fabricaram saldo");
  const deposited=raced.find(x=>x.status===200).data;
  must(deposited.bank===1000&&deposited.character.snapshot.gold===9000&&
    deposited.character.saveVersion===version+1,"depósito não moveu gold atomicamente");
  let r=await post("/api/market/withdraw",Object.assign({token,char_id:c.id,
    expected_version:deposited.character.saveVersion,amount:500},lease));
  must(r.status===200&&r.data.bank===500&&r.data.character.snapshot.gold===9500,
    "saque não atualizou personagem/banco autoritativos");
  const coinBefore=r.data.coinBalance;
  r=await post("/api/market/offers",{token,kind:"coins",qty:100,price:100,price_tc:0,seller_name:c.name});
  must(r.status===201&&r.data.coinBalance===coinBefore-100&&r.data.bank===480,
    "oferta TC não devolveu saldo/taxa autoritativos");
  const offerId=r.data.offer.id;
  const cancelled=await request("/api/market/offers/"+offerId,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
  must(cancelled.status===200&&cancelled.data.coinBalance===coinBefore&&cancelled.data.bank===480,
    "cancelamento duplicou/perdeu TC ou alterou banco incorretamente");

  const buyerLogin=await post("/api/login",{login:"1",password:"1"}),buyerToken=buyerLogin.data.token,buyerCoins=buyerLogin.data.account.coins;
  const buyerCreated=await post("/api/characters",{token:buyerToken,name:"Market Buyer",voc:"paladin",data:JSON.stringify({name:"Market Buyer",voc:"paladin"})}),bc=buyerCreated.data.character;
  const buyerRepair=await put("/api/characters/"+bc.id+"/repair",{token:buyerToken,voc:"paladin",
    data:JSON.stringify(Object.assign({},bc.snapshot,{id:String(bc.id),name:bc.name,voc:"paladin",gold:10000}))});
  const buyerLeaseResponse=await post("/api/lease/acquire",{token:buyerToken,holder_id:"marketbuyer1"}),buyerLease={holder_id:buyerLeaseResponse.data.holderId,lease_token:buyerLeaseResponse.data.leaseToken};
  const buyerDeposit=await post("/api/market/deposit",Object.assign({token:buyerToken,char_id:bc.id,
    expected_version:buyerRepair.data.character.saveVersion,amount:10000},buyerLease));
  must(buyerDeposit.status===200&&buyerDeposit.data.bank===10000,"banco do comprador não foi financiado");
  const sell=await post("/api/market/offers",{token,kind:"coins",qty:50,price:100,price_tc:0,seller_name:c.name});
  const bought=await post("/api/market/buy",{token:buyerToken,offer_id:sell.data.offer.id,buyer_name:bc.name});
  must(bought.status===200&&bought.data.coins===50&&bought.data.coinBalance===buyerCoins+25+50&&bought.data.bank===5000,
    "compra de TC não retornou saldo autoritativo do comprador");
  const sellerBank=await request("/api/market/bank",{headers:{authorization:"Bearer "+token}});
  must(sellerBank.data.bank===5460&&sellerBank.data.coinBalance===coinBefore-50,
    "venda de TC não creditou banco/manteve lock de moedas corretamente");
  const raceOffer=await post("/api/market/offers",{token,kind:"coins",qty:10,price:100,price_tc:0,seller_name:c.name});
  const race=await Promise.all([post("/api/market/buy",{token:buyerToken,offer_id:raceOffer.data.offer.id,buyer_name:bc.name}),
    post("/api/market/buy",{token:buyerToken,offer_id:raceOffer.data.offer.id,buyer_name:bc.name})]);
  must(race.filter(x=>x.status===200).length===1&&race.filter(x=>x.status===404).length===1,
    "duas compras concorrentes consumiram a mesma oferta");
  const buyerAfterRace=await request("/api/market/bank",{headers:{authorization:"Bearer "+buyerToken}});
  must(buyerAfterRace.data.bank===4000&&buyerAfterRace.data.coinBalance===buyerCoins+25+60,
    "corrida de compra debitou/creditou saldo mais de uma vez");
  const ui=fs.readFileSync(path.join(root,"game","js","market-ui.js"),"utf8"),client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
  must(!ui.includes("accountAddCoins(tok")&&!ui.includes("accountSpendCoins(")&&
    client.includes("accountApplyServerBalances")&&client.includes("marketGoldTransferBody"),
    "Market ainda altera TC/banco pelo cliente");
  console.log("OK: Market sincroniza TC/banco e transfere gold com versão/lease sem duplicação.");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(child)child.kill("SIGTERM");fs.rmSync(dataDir,{recursive:true,force:true});});
