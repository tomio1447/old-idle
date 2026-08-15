/* Regressão: superfície HTTP usada pelo cliente e canal realtime SSE. */
"use strict";
const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"..");
const server=fs.readFileSync(path.join(root,"server","server.js"),"utf8");
const db=fs.readFileSync(path.join(root,"server","db.js"),"utf8");
const client=fs.readFileSync(path.join(root,"game","js","account-client.js"),"utf8");
const market=fs.readFileSync(path.join(root,"game","js","market-ui.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const required=[
  "/api/register","/api/login","/api/logout","/api/me",
  "/api/lease/acquire","/api/lease/takeover","/api/lease/renew","/api/lease/release",
  "/api/instance","/api/instance/tick","/api/instance/ammo","/api/instance/pouch-clear","/api/instance/end","/api/characters",
  "/api/party/save","/api/party/create","/api/party/invite","/api/party/inbox",
  "/api/party/accept","/api/party/decline","/api/party/leave","/api/party/kick",
  "/api/party/reorder","/api/party/state","/api/party/zone","/api/party/follow",
  "/api/market/offers","/api/market/mine","/api/market/buy","/api/market/claim",
  "/api/market/deposit","/api/market/withdraw","/api/market/bank","/api/market/history",
  "/api/sync/ticket","/api/sync/events","/api/sync/state",
];
for(const route of required){
  must(server.includes(route),"servidor sem rota requerida: "+route);
  must(client.includes(route)||market.includes(route),"cliente sem integração requerida: "+route);
}
must(server.includes('const SYNC_PROTOCOL="sse-v2"')&&server.includes('"Content-Type":"text/event-stream; charset=utf-8"')&&
  client.includes("new EventSource(url)"),"canal realtime SSE não está ligado ponta a ponta");
for(const type of ["lease","instance","character","party","party-inbox","snapshot-required","sync-expired"])
  must(client.includes('"'+type+'"'),"cliente não assina evento SSE: "+type);
must(server.includes('publishPartyForCharacters(db,[updated.id],"character-save")')&&
  server.includes('publishPartyForCharacters(db,[body.char_id],"zone")'),
  "outfit/addons ou follow da party ainda dependem somente de polling");
must(server.includes("instanceGetByParty")&&server.includes("sharedDetached")&&
  client.includes('char_id:typeof sessionCharId==="function"?sessionCharId():null'),
  "cliente/API não resolvem uma única instância por party e personagem");
const mysqlTick=db.slice(db.indexOf("async instanceAuthorityTick"),db.indexOf("async instanceEnd"));
must(db.includes("JsonStore.prototype.instanceGetByParty")&&db.includes("async instanceGetByParty")&&
  mysqlTick.includes("WHERE id=?`")&&!mysqlTick.includes("WHERE id=? AND account_id=?"),
  "storage JSON/MySQL não materializa todos os membros da party compartilhada");
must(db.includes("JsonStore.prototype.instancePatchState")&&db.includes("async instancePatchState")&&
  server.includes("async function selectInstanceAmmo")&&
  server.includes("async function clearInstanceLootPouch")&&
  client.includes("accountClearInstanceLootPouch"),
  "storage/API não persistem a troca de munição/limpeza de pouch na autoridade");
must(!client.includes("new WebSocket(")&&!server.includes("WebSocketServer"),
  "WebSocket paralelo foi introduzido e pode duplicar o runtime SSE");
console.log("OK: APIs online e SSE v2 estão integrados sem WebSocket/runtime duplicado.");
