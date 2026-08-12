/* Regressão: servidor detecta/repara payload cruzado entre personagens. */
"use strict";
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"..");
const server=fs.readFileSync(path.join(root,"server","server.js"),"utf8");
const game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const css=fs.readFileSync(path.join(root,"game","css","layout.css"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(server.includes('error:"CHARACTER_IDENTITY_MISMATCH"')&&
  server.includes('String(payload.id)!==String(c.id)')&&
  server.includes('String(payload.name).toLowerCase()!==String(c.name).toLowerCase()'),
  "save cruzado não é rejeitado por id/nome");
must(server.includes("name:c.name,voc:c.voc")&&server.includes("voc:c.voc,level"),
  "save comum ainda pode substituir a vocação-base");
must(server.includes("function repairCharacterIdentity")&&
  server.includes('/^\\/api\\/characters\\/\\d+\\/repair$/.test(url)'),
  "endpoint autorizado de reparo ausente");
must(server.includes("identityMismatch:wrongId||wrongName")&&
  server.includes("dataOwnerName:wrongName"),"picker não recebe diagnóstico da corrupção");
must(client.includes("function accountRepairCharacter")&&game.includes("function showIdentityRepair")&&
  game.includes('data-repair-char')&&game.includes('Dados cruzados com'),
  "frontend não oferece reparo para personagem já corrompido");
must(css.includes(".account-character-card.identity-mismatch")&&css.includes(".account-identity-warning"),
  "alerta visual de identidade cruzada ausente");
console.log("OK: identidade por id/nome/vocação é imutável e saves antigos podem ser reparados.");
