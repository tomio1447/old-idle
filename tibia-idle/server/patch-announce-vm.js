/* patch-announce-vm.js — roda NA VM (node), aplica o recurso de
 * anúncio global no código já implantado. Idempotente. */
"use strict";
const fs = require("fs");
const APP = process.env.APP_DIR || "/opt/global-idle/tibia-idle";
const changed = [];

function insertAfter(s, anchor, insert) {
  if (s.includes(insert.trim().slice(0, 60))) return s; // já aplicado
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error("âncora não encontrada: " + anchor.slice(0, 60));
  return s.slice(0, i + anchor.length) + insert + s.slice(i + anchor.length);
}
function insertBefore(s, anchor, insert) {
  if (s.includes(insert.trim().slice(0, 60))) return s;
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error("âncora não encontrada: " + anchor.slice(0, 60));
  return s.slice(0, i) + insert + s.slice(i);
}
function replaceOnce(s, from, to) {
  if (s.includes(to)) return s;
  const i = s.indexOf(from);
  if (i < 0) throw new Error("âncora não encontrada: " + from.slice(0, 60));
  return s.slice(0, i) + to + s.slice(i + from.length);
}
function writeIf(file, s, before) {
  if (s === before) return;
  fs.writeFileSync(APP + "/" + file, s, "utf8");
  changed.push(file);
}
/* A VM tem CRLF — normaliza para LF na leitura (o node não se importa e
 * o próximo deploy reescreve o arquivo de qualquer forma). */
function readNorm(file) {
  return fs.readFileSync(APP + "/" + file, "utf8").replace(/\r\n/g, "\n");
}

/* ---- server/server.js ---- */
{
  const file = "server/server.js";
  const before = readNorm(file);
  let s = before;
  const state =
    "\n/* Anúncio global com popup: state leve devolvido em /api/health (TTL)\n" +
    " * e empurrado por SSE — o cliente mostra o modal uma vez por anúncio. */\n" +
    "const ANNOUNCE_STATE={current:null};\n" +
    "function getAnnounceState(){\n" +
    "  const a=ANNOUNCE_STATE.current;\n" +
    "  if(!a)return null;\n" +
    "  if(a.until&&Date.now()>Number(a.until)){ANNOUNCE_STATE.current=null;return null;}\n" +
    "  return a;\n" +
    "}\n";
  s = insertBefore(s, "async function authorizeMaintenance", state);
  s = insertAfter(s, "          maintenance:getMaintenanceState(),",
    "\n          announce:getAnnounceState(),");
  const routes =
    "\n      /* POST /api/admin/announce — popup global (SSE + health/TTL). */\n" +
    "      if(req.method===\"POST\"&&url===\"/api/admin/announce\"){\n" +
    "        const limited=rateLimit(req,\"admin-announce\",10,60000);if(limited)return send(res,limited.code,limited.body);\n" +
    "        let body={};\n" +
    "        try{body=await readBody(req);}catch(e){return send(res,400,{ok:false,error:\"BAD_JSON\",msg:\"JSON inválido\"});}\n" +
    "        const auth=await authorizeMaintenance(req,body,db);\n" +
    "        if(!auth.ok)return send(res,403,{ok:false,error:\"FORBIDDEN\",msg:\"Token de manutenção ou admin necessário\"});\n" +
    "        const title=String(body.title||\"Aviso\").slice(0,80);\n" +
    "        const message=String(body.message||\"\").slice(0,2000);\n" +
    "        if(!message.trim())return send(res,400,{ok:false,error:\"EMPTY\",msg:\"Mensagem vazia\"});\n" +
    "        const ttlSec=Math.max(30,Math.min(86400,Math.floor(Number(body.ttlSec)||900)));\n" +
    "        const button=String(body.button||\"OK\").slice(0,30)||\"OK\";\n" +
    "        ANNOUNCE_STATE.current={id:String(Date.now()),title,message,button,\n" +
    "          at:Date.now(),until:Date.now()+ttlSec*1000};\n" +
    "        try{if(SYNC_BUS&&typeof SYNC_BUS.broadcastAll===\"function\")SYNC_BUS.broadcastAll(\"announce\",ANNOUNCE_STATE.current);}catch(e){}\n" +
    "        console.log(\"[announce] publicado:\",JSON.stringify(title),\"ttl=\"+ttlSec+\"s\",\"via=\"+auth.via);\n" +
    "        return send(res,200,{ok:true,announce:ANNOUNCE_STATE.current});\n" +
    "      }\n" +
    "      if(req.method===\"POST\"&&url===\"/api/admin/announce/clear\"){\n" +
    "        let body={};try{body=await readBody(req);}catch(e){body={};}\n" +
    "        const auth=await authorizeMaintenance(req,body,db);\n" +
    "        if(!auth.ok)return send(res,403,{ok:false,error:\"FORBIDDEN\",msg:\"Token de manutenção ou admin necessário\"});\n" +
    "        ANNOUNCE_STATE.current=null;\n" +
    "        return send(res,200,{ok:true});\n" +
    "      }\n";
  s = insertAfter(s,
    "      if(req.method===\"GET\"&&url===\"/api/maintenance\"){\n" +
    "        return send(res,200,{ok:true,maintenance:getMaintenanceState(),serverPower:\"on\"});\n" +
    "      }",
    routes);
  writeIf(file, s, before);
}

/* ---- game/js/account-client.js ---- */
{
  const file = "game/js/account-client.js";
  const before = readNorm(file);
  let s = before;
  s = insertAfter(s,
    "    if(type===\"quest\"){accountSyncDispatch(\"quest\",data);return;}",
    "\n    if(type===\"announce\"){\n" +
    "      try{window.dispatchEvent(new CustomEvent(\"tibia-idle-announce\",{detail:data}));}catch(e){}\n" +
    "      return;\n" +
    "    }");
  s = replaceOnce(s,
    '"sync-expired","maintenance","world-boss","quest"]',
    '"sync-expired","maintenance","world-boss","quest","announce"]');
  writeIf(file, s, before);
}

/* ---- game/index.html ---- */
{
  const file = "game/index.html";
  const before = readNorm(file);
  let s = insertAfter(before,
    '<script src="js/server-config.js"></script>',
    '\n<script src="js/announce.js?v=announce-v1"></script>');
  writeIf(file, s, before);
}

console.log("PATCHED:", changed.join(", ") || "(nada — já estava aplicado)");
