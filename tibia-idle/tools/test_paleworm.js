/* Regressão: The Pale Worm (Feast of Souls) — sala OTBM, BOSS_DEFS,
 * gate dos 3 bosses, lobby 1–9 (arquivo separado do Megalomania) e a
 * mecânica do The Unwelcome (neutro + imune a death que cura 200%). */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
function must(ok,msg){if(!ok)throw Error(msg);}

/* ---------------- cliente (vm) ---------------- */
const ctx={window:{},console,Math,Date,Map,Set,document:undefined};ctx.window=ctx;vm.createContext(ctx);
for(const file of ["gamedata.js","monsterdata.js","mobsheetdata.js","monsters.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,file),"utf8"),ctx,{filename:file});
ctx.BOSS_DEFS={};
vm.runInContext(fs.readFileSync(path.join(js,"feast-of-souls.js"),"utf8"),ctx,{filename:"feast-of-souls.js"});

const hunt=ctx.GAMEDATA.hunts["the-pale-worm-room"];
const eqPt=(a,b)=>!!(a&&b&&a.x===b.x&&a.y===b.y&&a.z===b.z&&
  (b.w===undefined||a.w===b.w)&&(b.h===undefined||a.h===b.h));
must(hunt&&hunt.otbm==="thepalewormroom"&&hunt.otbmFloor===7&&hunt.hidden===true&&
  eqPt(hunt.otbmSpawn,{x:1041,y:1010,z:7})&&
  eqPt(hunt.otbmMobBounds,{x:1051,y:1015,w:1,h:1,z:7}),
  "room técnica do Pale Worm divergente (spawn/boss do Map Editor)");

const pw=ctx.BOSS_DEFS["the-pale-worm"];
must(pw&&pw.id==="the-pale-worm"&&pw.baseMonster==="the-pale-worm"&&
  pw.hp===420000&&pw.exp===30000&&pw.damage===1050&&pw.armor===150&&pw.defense===150,
  "stats Canary do Pale Worm divergentes (420k hp / 30k exp / 1050 dmg / 150 armor)");
must(pw.cooldown===16*60*60*1000,"cooldown do Pale Worm não é 16h");
must(pw.requirement&&pw.requirement.enforced===true&&Array.isArray(pw.requirement.killsRequired)&&
  JSON.stringify(pw.requirement.killsRequired)===JSON.stringify(["the-dread-maiden","the-fear-feaster","the-unwelcome"]),
  "gate do Pale Worm não exige os 3 bosses anteriores (enforced)");

const uw=ctx.BOSS_DEFS["the-unwelcome"];
must(uw&&uw.deathAbsorbs===true,"Unwelcome sem mecânica deathAbsorbs");
for(const el of ["physical","energy","earth","fire","ice","holy","death","lifedrain","manadrain","drown"])
  must(uw.resist&&uw.resist[el]===0,"Unwelcome não está neutro em "+el);

const it=ctx.GAMEDATA.items;
must(it["pale-worm-s-scalp"]&&it["pale-worm-s-scalp"].sell===489000&&it["pale-worm-s-scalp"].cid===32598&&it["pale-worm-s-scalp"].w===0.75,
  "pale-worm-s-scalp importado errado (Yasir 489.000)");
must(it["spectral-scrap-of-cloth"]&&it["spectral-scrap-of-cloth"].sell===0&&it["spectral-scrap-of-cloth"].cid===32629&&it["spectral-scrap-of-cloth"].w===3.5,
  "spectral-scrap-of-cloth importado errado (sem NPC)");
must(it["ghost-backpack"]&&it["ghost-backpack"].sell===0&&it["ghost-backpack"].cid===32620&&it["ghost-backpack"].w===5,
  "ghost-backpack importado errado (sem NPC)");
must(fs.existsSync(path.join(game,"assets","item","pale-worm-s-scalp.png"))&&
  fs.existsSync(path.join(game,"assets","item","spectral-scrap-of-cloth.png"))&&
  fs.existsSync(path.join(game,"assets","item","ghost-backpack.png")),
  "sprites dos 3 itens novos do Pale Worm ausentes");

/* ---------------- mapa ---------------- */
const OTBM=require(path.join(js,"otbm.js"));
const beta=fs.readFileSync(path.join(game,"beta-maps","bossesroom","thepalewormroom.otbm"));
const pub=fs.readFileSync(path.join(game,"maps","thepalewormroom.otbm"));
must(beta.equals(pub),"OTBM do Pale Worm não publicado em game/maps");
const map=OTBM.read(pub,{z:7});
must(map.w===32&&map.h===24&&map.z===7&&
  map.sourceBounds.minX===1033&&map.sourceBounds.minY===999&&
  map.sourceBounds.maxX===1064&&map.sourceBounds.maxY===1022,
  "bossroom Canary do Pale Worm não manteve z=7 32×24 integral");
// centro informado (1048,1010) tem chão; spawn e boss dentro do mapa
for(const [x,y] of [[1048,1010],[1041,1010],[1051,1015]]){
  const lx=x-map.sourceBounds.minX,ly=y-map.sourceBounds.minY;
  const cell=map.cells[lx+","+ly];
  must(cell&&cell.g===32614,"tile "+x+","+y+" sem o chão 32614 (soul sand floor)");
}
ctx.applyHuntOtbmZones=function(m,h){
  const bounds=m.sourceBounds||{},ox=bounds.minX||0,oy=bounds.minY||0;
  const sameFloor=(z)=>z===undefined||Number(z)===Number(m.z);
  const local=(p)=>p&&sameFloor(p.z)?{x:Number(p.x)-ox,y:Number(p.y)-oy}:null;
  const sp=local(h.otbmSpawn);
  if(sp&&sp.x>=0&&sp.y>=0&&sp.x<m.w&&sp.y<m.h)m.spawn=sp;
  const zone=h.otbmMobBounds;
  if(zone&&sameFloor(zone.z)){
    const st=local(zone),w=Math.max(0,Number(zone.w)||0),h2=Math.max(0,Number(zone.h)||0);
    m.mob=[];
    for(let y=0;y<h2;y++)for(let x=0;x<w;x++){
      const px=st.x+x,py=st.y+y;
      if(px>=0&&py>=0&&px<m.w&&py<m.h)m.mob.push({x:px,y:py});
    }
  }
  return m;
};
ctx.applyHuntOtbmZones(map,hunt);
const hm=OTBM.huntMapFromOtbm(map,ctx.TILEFLAGS);
must(hm.rows.length===24&&hm.rows.every((r)=>r.length===32)&&
  hm.spawn.x===8&&hm.spawn.y===11&&hm.mob.length===1&&hm.mob[0].x===18&&hm.mob[0].y===16,
  "coordenadas runtime do Pale Worm incorretas (spawn local 8,11 / boss 18,16)");

/* ---------------- mecânica Unwelcome (cliente) ---------------- */
vm.runInContext(fs.readFileSync(path.join(js,"combat.js"),"utf8"),ctx,{filename:"combat.js"});
const mobBase={id:"uw",x:.5,y:.5,def:{hp:1000,deathAbsorbs:true},hp:500,maxHp:1000};
const c={events:[]};
let m=Object.assign({},mobBase);
must(ctx.unwelcomeAbsorbDeath(m,"death",100,c)===0&&m.hp===700&&
  c.events.length===1&&c.events[0].t==="mobheal"&&c.events[0].heal===200,
  "Unwelcome não curou 200% do dano death no cliente");
m=Object.assign({},mobBase,{hp:999});
must(ctx.unwelcomeAbsorbDeath(m,"death",100,c)===0&&m.hp===1000,
  "cura do Unwelcome estourou o HP máximo");
m=Object.assign({},mobBase);
must(ctx.unwelcomeAbsorbDeath(m,"fire",100,c)===100&&m.hp===500,
  "Unwelcome absorveu elemento não-death");
must(ctx.unwelcomeAbsorbDeath(m,"death",0,c)===0&&m.hp===500,
  "dano death zerado não deve curar");

/* ---------------- engine ---------------- */
const engine=require(path.join(__dirname,"..","server","authoritative_engine.js"));
must(engine.HUNTS["the-pale-worm-room"]&&engine.HUNTS["the-pale-worm-room"].monsters[0]==="the-pale-worm",
  "HUNTS server sem the-pale-worm-room");

const desc=engine.initializeAuthority({
  kind:"boss",bossId:"the-unwelcome",huntId:"the-unwelcome-room",instanceMode:"boss",
  activeCharacterId:"1",
  members:[{id:"1",p:{id:"1",name:"K",voc:"knight",level:300,hp:8000,mp:300}}],
  state:{gridW:30,gridH:30,mobs:[{id:"b",slug:"the-unwelcome",boss:true,hp:300000,maxHp:300000,cx:15,cy:15,x:.5,y:.5}]},
},"b".repeat(64),1000);
// Boss nasce deferido (arenaBossSpawn.pending) — o override deve valer lá.
const pend=desc.authority.arenaBossSpawn&&desc.authority.arenaBossSpawn.pending;
must(pend&&pend.def&&pend.def.deathAbsorbs===true&&pend.def.resist&&
  ["physical","energy","earth","fire","ice","holy","death"].every((el)=>pend.def.resist[el]===0),
  "engine não aplicou resist neutra + deathAbsorbs no The Unwelcome");
// Regressão do _auth não-enumerável: o estado materializado deve serializar.
must((()=>{try{JSON.stringify(engine.materializeAuthority(desc));return true;}catch(e){return false;}})(),
  "estado materializado do Unwelcome não serializa (ciclo _auth?)");

const emob={id:"b",slug:"the-unwelcome",x:.5,y:.5,def:pend.def,hp:1000,maxHp:1000,
  _auth:{events:[],clock:1000}};
must(engine.applyOutgoingDamage(emob,"death",100,1000)===0&&emob.hp===1200&&
  emob._auth.events.length===1&&emob._auth.events[0].t==="mobheal"&&emob._auth.events[0].heal===200,
  "engine: Unwelcome não curou 200% do dano death");
must(engine.applyOutgoingDamage(emob,"fire",100,1000)===100&&emob.hp===1200,
  "engine: Unwelcome não está neutro em fire");

/* ---------------- integração (estático) ---------------- */
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const indexSrc=fs.readFileSync(path.join(game,"index.html"),"utf8");
const accSrc=fs.readFileSync(path.join(js,"account-client.js"),"utf8");
const serverSrc=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
must(gameSrc.includes('ids: ["the-dread-maiden", "the-fear-feaster", "the-unwelcome", "the-pale-worm"]'),
  "modal de bosses não lista o Pale Worm na seção FEAST OF SOULS");
must(gameSrc.includes("function feastBossesKilled")&&gameSrc.includes("boss.requirement.killsRequired")&&
  gameSrc.includes("req.killsRequired && Array.isArray(req.killsRequired)"),
  "gate killsRequired não está no bossReadyInfo/checklist");
must(gameSrc.includes('id === "the-pale-worm"')&&gameSrc.includes("paleLobbyOpenFromBoss")&&
  gameSrc.includes("__PALE_LOBBY_STARTING"),
  "startBoss/modal não abrem o lobby do Pale Worm");
must(indexSrc.includes("js/pale-worm-lobby.js?v=paleworm-v1")&&indexSrc.includes("js/game.js?v=paleworm-v1"),
  "cache-bust/script do Pale Worm ausente no index.html");
must(accSrc.includes('type==="pale-lobby"')&&accSrc.includes('"pale-lobby",'),
  "SSE do account-client não despacha pale-lobby");
must(serverSrc.includes("/api/pale-lobby/state")&&serverSrc.includes("__PALE_LOBBY")&&
  serverSrc.includes("createPaleWormLobbyController"),
  "rotas/controller do lobby Pale Worm ausentes no server.js");
must(serverSrc.includes('the-pale-worm"?9:5'),
  "PUT de instância não permite 9 membros no Pale Worm");

/* ---------------- lobby Pale Worm (separado do mega) ---------------- */
const paleMod=require(path.join(__dirname,"..","server","pale_worm_lobby.js"));
const megaMod=require(path.join(__dirname,"..","server","megalomania_lobby.js"));
must(paleMod.MAX_SLOTS===9&&megaMod.MAX_SLOTS===5,
  "lobby Pale Worm deve ter 9 vagas e o Megalomania continua com 5 (intocado)");
must(JSON.stringify(paleMod.GATE_BOSSES)===JSON.stringify(["the-dread-maiden","the-fear-feaster","the-unwelcome"]),
  "gate de bosses do lobby Pale Worm divergente");

function charOf(id,name,accountId,kills){
  const data={name,voc:"knight",level:300,bosses:{}};
  for(const k of kills||[])data.bosses[k]={lastFight:0,kills:1};
  return {id,name,account_id:accountId,data:JSON.stringify(data)};
}
function makeDb(){
  const chars=new Map();
  const parties=new Map();
  const instances=new Map();
  return {
    chars,instances,
    findCharacter:(id)=>chars.get(Number(id))||null,
    findCharacterByName:(name)=>{for(const c of chars.values())if(c.name===name)return c;return null;},
    charactersOf:async()=>[],
    partyFindByCharacter:async(id)=>parties.get(Number(id))||null,
    instanceTransferOwner:async(from,to)=>{
      const row=instances.get(Number(from));
      if(!row)return {ok:false};
      instances.delete(Number(from));instances.set(Number(to),row);
      return {ok:true,instance:row};
    },
  };
}
const db=makeDb();
const events=[];
const ctrl=paleMod.createPaleWormLobbyController({getDb:()=>db,publishAccount:(a,t,d)=>events.push({a,t,d})});
db.chars.set(1,charOf(1,"Lider",10,["the-dread-maiden","the-fear-feaster","the-unwelcome"]));
db.chars.set(2,charOf(2,"SemGate",20,[]));
db.chars.set(3,charOf(3,"Convidado",30,["the-dread-maiden","the-fear-feaster","the-unwelcome"]));
db.chars.set(4,charOf(4,"Outro",40,["the-dread-maiden","the-fear-feaster","the-unwelcome"]));

(async()=>{
  // create: sem gate → 403
  let r=await ctrl.createLobby(db,{id:20},db.chars.get(2),{inTemple:true,playerName:"SemGate"});
  must(r.code===403&&/Dread Maiden/.test(r.body.msg),"create aceitou char sem as kills dos 3 bosses");
  // create ok
  r=await ctrl.createLobby(db,{id:10},db.chars.get(1),{inTemple:true,playerName:"Lider"});
  must(r.code===200&&r.body.ok&&r.body.lobby.slots.length===9&&r.body.lobby.filled===1,
    "create do lobby não abre com 9 slots");
  // invite char sem gate → 403
  r=await ctrl.invite(db,{id:10},"SemGate");
  must(r.code===403&&/SemGate: /.test(r.body.msg),"invite aceitou convidado sem gate");
  // invite próprio char → 400
  r=await ctrl.invite(db,{id:10},"Lider");
  must(r.code===400,"invite para o próprio jogador deveria falhar");
  // invite ok + accept
  r=await ctrl.invite(db,{id:10},"Convidado");
  must(r.code===200&&r.body.inviteId,"invite ok não retornou inviteId");
  const invId=r.body.inviteId;
  r=await ctrl.acceptInvite(db,{id:30},invId,db.chars.get(3),{inTemple:true,playerName:"Convidado"});
  must(r.code===200&&r.body.ok&&r.body.lobby.filled===2,"accept não preencheu a vaga");
  // 1 char por conta: mesma conta não entra duas vezes
  r=await ctrl.acceptInvite(db,{id:10},invId,db.chars.get(1),{inTemple:true});
  must(r.code===404||r.code===409,"invite reutilizado/auto-aceite não deveria funcionar");
  // start revalida gate: remove kills do convidado → 403
  db.chars.get(3).data=JSON.stringify({name:"Convidado",voc:"knight",level:300,bosses:{}});
  r=await ctrl.start(db,{id:10});
  must(r.code===403&&/Convidado/.test(r.body.msg),"start não revalidou o gate dos membros");
  db.chars.get(3).data=JSON.stringify({name:"Convidado",voc:"knight",level:300,
    bosses:{"the-dread-maiden":{kills:1},"the-fear-feaster":{kills:1},"the-unwelcome":{kills:1}}});
  r=await ctrl.start(db,{id:10});
  must(r.code===200&&r.body.members.length===2,"start não listou os 2 membros");
  // bindShare
  const lobby=ctrl.getLobbyForAccount(10);
  ctrl.bindShare(lobby,"inst-1",10);
  must(lobby.status==="fighting"&&lobby.instanceId==="inst-1",
    "bindShare não marcou luta em andamento");
  for(const aid of [10,30])
    must(ctrl.sharedForAccount(aid)&&ctrl.sharedForAccount(aid).instanceId==="inst-1",
      "share da instância não chegou aos membros");
  // leave-fight do líder → transfere para o convidado
  db.instances.set(10,{instance_id:"inst-1",version:1});
  r=await ctrl.leaveFight(db,{id:10});
  must(r.code===200&&r.body.remaining===1&&r.body.transferredTo===30&&r.body.shouldEndInstance===false,
    "leave-fight do líder não transferiu a sala para o próximo membro");
  const l2=ctrl.getLobbyForAccount(30);
  must(l2&&Number(l2.leaderAccountId)===30&&l2.instanceOwnerAccountId===30,
    "líder do lobby não foi reatribuído após transferência");
  // último saiu → encerra
  r=await ctrl.leaveFight(db,{id:30});
  must(r.code===200&&r.body.remaining===0&&r.body.shouldEndInstance===true,
    "último lutador saiu sem sinalizar encerramento da sala");
  console.log("ok: pale worm lobby 9 slots + gate + takeover (mega intocado)");
})().catch((e)=>{console.error(e);process.exit(1);});
