/* Regressão: cadastro duplicado não gera 409/reenvio e crosshair não faz 404. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,"..");
const css=fs.readFileSync(path.join(root,"game","css","otc-hud.css"),"utf8");
const client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const server=fs.readFileSync(path.join(root,"server","server.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(!css.includes("crosshair.png")&&css.includes("radial-gradient(circle")&&
  css.includes("linear-gradient(#f4f4f4"),"crosshair ainda depende de PNG ausente");
must(server.includes('code: 200, body: { ok: false, error: "ACCOUNT_EXISTS"')&&
  !server.includes('if (exist) return { code: 409'),"cadastro duplicado ainda responde HTTP 409");
must(game.includes('button.dataset.pending="1";button.disabled=true')&&
  game.includes('if(button.disabled||button.dataset.pending==="1")return;'),
  "botão Criar conta permite requests duplicados");
must(client.includes('error:"NETWORK_ERROR"')&&client.includes('r.data.error === "ACCOUNT_EXISTS"'),
  "cliente não diferencia conta existente/servidor offline");
const start=client.indexOf("async function accountRegister"),end=client.indexOf("\n\nasync function accountLogin",start);
const ctx={_api:async()=>({code:200,data:{ok:false,error:"ACCOUNT_EXISTS",msg:"Conta já existe"}})};
vm.createContext(ctx);vm.runInContext(client.slice(start,end),ctx);
ctx.accountRegister("same","x").then(r=>{
  must(!r.ok&&r.exists&&/aba Entrar/.test(r.msg),"mensagem de conta existente não orienta login");
  console.log("OK: cadastro duplicado é tratado no formulário e crosshair CSS não requisita PNG.");
}).catch(e=>{console.error(e);process.exitCode=1;});
