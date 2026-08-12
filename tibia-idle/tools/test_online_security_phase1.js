/* Fase 1 online: fechar endpoints premium/admin e bônus inicial server-side. */
"use strict";
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"..");
const server=fs.readFileSync(path.join(root,"server","server.js"),"utf8");
const game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const admin=fs.readFileSync(path.join(root,"game","js","admin.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(server.includes('if(acc.role!=="admin")return {code:403')&&server.includes('error:"ADMIN_ONLY"'),
  "usuário comum ainda pode alterar Tibia Coins diretamente");
must(server.includes('if(!existingCharacters.length)await db.updateCoins')&&
  server.includes('O cliente nunca recebe permissão para fabricar saldo premium'),
  "bônus inicial não foi movido para transação server-side única");
must(!game.includes('await accountAddCoins(token,25)')&&
  game.includes('O bônus inicial de TC é transação exclusiva do servidor'),
  "criação de personagem ainda fabrica TC pelo cliente");
must(server.includes('if(!privileged&&!identityMismatch)return {code:403')&&
  server.includes('error:"REPAIR_NOT_ALLOWED"'),
  "rota repair permite troca livre de vocation por usuário comum");
must(game.includes('const adminAllowed = !onlineMode || !!(account && account.role === "admin")')&&
  !game.includes('const adminAllowed = !!serverCfg.testServer'),
  "painel Admin ainda é liberado globalmente no test server");
must(admin.includes('accountAddCoins(sessionToken(),amount)')&&
  admin.includes('await accountRepairCharacter(sessionToken(),String(p.id),newVoc,p)'),
  "Admin legítimo não usa endpoints autenticados para Coins/vocation");
console.log("OK: Fase 1 — Coins, repair e painel Admin protegidos no servidor.");
