/* Regressão: Soul War boss rooms próprias + instância não vaza entre chars. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
const root=path.join(__dirname,".."),game=path.join(root,"game"),js=path.join(game,"js");
function must(ok,msg){if(!ok)throw Error(msg);}
const greed=fs.readFileSync(path.join(game,"maps","goshnars_greed_room.otbm"));
const hatred=fs.readFileSync(path.join(game,"maps","goshnars_hatred_room.otbm"));
const rotten=fs.readFileSync(path.join(game,"maps","rotten_wasteland.otbm"));
must(!greed.equals(rotten)&&!hatred.equals(rotten)&&!greed.equals(hatred),
  "Greed/Hatred ainda compartilham o mapa da Rotten Wasteland");
must(crypto.createHash("sha256").update(greed).digest("hex")==="067b88f26d09ea4fb9631088cc6af7c7a094c39cd9c4964866835064ebe822f8"&&
  crypto.createHash("sha256").update(hatred).digest("hex")==="8728c78730ed243c3cd4a620c9529af0c3edbd5396a2a07cc368ffb2d4031f8a",
  "geração das boss rooms não é determinística");
must(!fs.existsSync(path.join(game,"maps","goshnarsgreed.otbm"))&&
  !fs.existsSync(path.join(game,"maps","goshnars_hatred.otbm")),
  "aliases antigos podem recolocar boss no cache/mapa incorreto");
const soul=fs.readFileSync(path.join(js,"soulwar.js"),"utf8"),src=fs.readFileSync(path.join(js,"game.js"),"utf8");
must(soul.includes("otbm:'goshnars_greed_room'")&&soul.includes("otbm:'goshnars_hatred_room'")&&
  src.includes('"goshnar-s-greed":{hunt:"goshnars-greed-room",otbm:"goshnars_greed_room"}')&&
  src.includes('"goshnar-s-hatred":{hunt:"goshnars-hatred-room",otbm:"goshnars_hatred_room"}')&&
  src.includes("const arena = bossArenaDefinition(boss)"),
  "start/resume de boss não força a rota dedicada");
const start=src.indexOf("function instanceIncludesCharacter"),end=src.indexOf("\n\nfunction readInstanceSession",start);
const ctx={};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
const ms={members:[{id:"ms",p:{name:"MS"}}]},party={members:[{id:"ms"},{id:"ek"}]};
must(!ctx.instanceIncludesCharacter(ms,"ek"),"EK recebeu acesso à instância solo do MS");
must(ctx.instanceIncludesCharacter(ms,"ms")&&ctx.instanceIncludesCharacter(party,"ek"),
  "dono ou membro legítimo da mesma party perdeu acesso");
must(src.includes("G.foreignInstance={")&&src.includes("não foi aberta neste personagem")&&
  src.includes("Outro personagem da conta já possui uma instância ativa")&&
  src.includes('clearInstanceSession(G.foreignInstance?"foreign-instance":"no-combat",!!G.foreignInstance)'),
  "cliente não isola/bloqueia ou encerra indevidamente instância de outro char");
console.log("OK: Greed/Hatred usam boss rooms próprias e instância só aparece aos membros persistidos.");
