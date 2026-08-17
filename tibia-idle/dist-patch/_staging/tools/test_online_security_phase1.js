/* Fase 1 online: fechar endpoints premium/admin e bônus inicial server-side. */
"use strict";
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"..");
const server=fs.readFileSync(path.join(root,"server","server.js"),"utf8");
const game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const admin=fs.readFileSync(path.join(root,"game","js","admin.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(server.includes('if(acc.role!=="admin")return {code:403')||
  server.includes('if(!accountCanSelfAdmin(acc))return {code:403'),
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
must(game.includes('const adminAllowed = !onlineMode || !!serverCfg.testServer ||')&&
  game.includes('account.role === "admin"')&&
  !game.includes('const adminAllowed = true'),
  "painel Admin não libera TEST_SERVER / admin role corretamente");
must(server.includes("function accountCanSelfAdmin")&&server.includes("acc.role===\"admin\"||TEST_SERVER"),
  "servidor não libera grants Admin no TEST_SERVER para contas comuns");
must(server.includes('if(adminGrant&&!accountCanSelfAdmin(acc))')&&
  server.includes('if(!accountCanSelfAdmin(acc))return {code:403'),
  "admin_grant / coins ainda exigem role admin mesmo no TEST_SERVER");
must(admin.includes('accountAddCoins(sessionToken(),amount)')&&
  admin.includes('await accountRepairCharacter(sessionToken(),String(p.id),newVoc,p)'),
  "Admin legítimo não usa endpoints autenticados para Coins/vocation");
console.log("OK: Fase 1 — Coins/repair protegidos em prod; TEST_SERVER libera self-admin.");
