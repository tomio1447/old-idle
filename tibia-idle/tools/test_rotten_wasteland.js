/* Regressão: Rotten Wasteland, três criaturas e criação de Goshnar's Hatred. */
"use strict";
const crypto=require("crypto"),fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game"),js=path.join(game,"js");
const OTBM=require(path.join(js,"otbm.js"));
function must(ok,msg){if(!ok)throw Error(msg);}
function pngSize(file){const b=fs.readFileSync(file);return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};}
const ctx={window:{},console,Math,Date,Map,Set};ctx.window=ctx;vm.createContext(ctx);
for(const file of ["gamedata.js","weapondata.js","weapons.js","monsterdata.js","mobsheetdata.js",
  "monsters.js","hard-hunts.js","soulwar.js","tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js,file),"utf8"),ctx,{filename:file});

const beta=fs.readFileSync(path.join(game,"beta-maps","Rotten Wasteland.otbm"));
const runtime=fs.readFileSync(path.join(game,"maps","rotten_wasteland.otbm"));
must(beta.equals(runtime),"Rotten Wasteland runtime difere do beta-map entregue");
must(crypto.createHash("sha256").update(runtime).digest("hex")===
  "ba751589dd9afe6000bda56015df9c2a8c2b4d501a713108236760d25983081d",
  "SHA do mapa Rotten Wasteland inesperado");
const hunt=ctx.GAMEDATA.hunts["rotten-wasteland"];
must(hunt&&hunt.otbm==="rotten_wasteland"&&hunt.otbmFloor===7&&
  hunt.otbmRuntimeWidth===30&&hunt.otbmRuntimeHeight===30&&
  JSON.stringify(hunt.monsters)===JSON.stringify(["rotten-golem","branchy-crawler","mould-phantom"]),
  "hunt Rotten Wasteland/mapa/três monstros não registrados");
must(JSON.stringify(hunt.otbmFovBounds)===JSON.stringify({x:1040,y:1012,w:21,h:15,z:7})&&
  JSON.stringify(hunt.otbmSpawn)===JSON.stringify({x:1045,y:1022,z:7})&&
  JSON.stringify(hunt.otbmMobBounds)===JSON.stringify({x:1047,y:1017,w:12,h:7,z:7}),
  "FOV/spawn/respawn globais de Rotten Wasteland incorretos");
let map=OTBM.read(runtime,{z:7});
must(map.w===21&&map.h===15&&Object.keys(map.cells).length===270&&
  map.sourceBounds.minX===1040&&map.sourceBounds.minY===1012&&
  map.sourceBounds.maxX===1060&&map.sourceBounds.maxY===1026,
  "piso z=7 de Rotten Wasteland não foi mantido integralmente");
const loader=fs.readFileSync(path.join(js,"otbmhunt.js"),"utf8");
const zs=loader.indexOf("function applyHuntOtbmZones"),ze=loader.indexOf("\n\n/* Garante",zs);
vm.runInContext(loader.slice(zs,ze),ctx);ctx.applyHuntOtbmZones(map,hunt);
map.idleTargetWidth=30;map.idleTargetHeight=30;
const hm=OTBM.huntMapFromOtbm(map,ctx.TILEFLAGS);
must(hm.rows.length===30&&hm.rows.every(r=>r.length===30)&&
  hm.spawn.x===9&&hm.spawn.y===17&&hm.mob.length===84,
  "Rotten Wasteland não resultou no mundo 30×30/spawns esperados");
const free=hm.mob.filter(p=>{const e=hm.leg[hm.rows[p.y][p.x]];return e&&!e.bloc&&!hm.footprintBlocked[p.x+":"+p.y];});
must(free.length===69,"zona Rotten Wasteland não comporta as waves Soul War");
const visualIds=new Set();Object.values(hm.leg).forEach(e=>{
  (e.v||[]).forEach(id=>visualIds.add(id));(e.g||[]).forEach(id=>visualIds.add(id));
});
must(visualIds.size===89,"quantidade de tiles Rotten Wasteland inesperada");
for(const id of visualIds)must(fs.existsSync(path.join(game,"assets","tiles",id+".png")),
  "sprite do mapa Rotten Wasteland ausente: "+id);

const expected={
 "rotten-golem":{hp:28000,exp:17860,speed:200,armor:108,defense:108,damage:950,mitigation:3.04,
  resist:{physical:20,energy:-15,earth:40,fire:-25,holy:50,death:-20},look:1312,skills:5,loot:16},
 "branchy-crawler":{hp:27000,exp:17860,speed:235,armor:100,defense:100,damage:950,mitigation:3.04,
  resist:{energy:-5,earth:50,fire:-9,holy:40,death:-15},look:1297,skills:5,loot:16},
 "mould-phantom":{hp:28000,exp:18330,speed:240,armor:100,defense:100,damage:900,mitigation:2.45,
  resist:{physical:-10,earth:50},look:1298,skills:5,loot:15},
};
for(const [slug,e] of Object.entries(expected)){
  const m=ctx.GAMEDATA.monsters[slug];must(m&&m.element==="physical",slug+": melee não ficou físico");
  for(const k of ["hp","exp","speed","armor","defense","damage","mitigation"])
    must(m[k]===e[k],`${slug}.${k} divergente do Canary`);
  must(JSON.stringify(m.resist)===JSON.stringify(e.resist)&&m.looktype===e.look&&
    m.skills.length===e.skills&&m.loot.length===e.loot,slug+": resist/look/attacks/loot divergentes");
  const sheet=path.join(game,"assets","mob",slug+".png"),sz=pngSize(sheet),meta=ctx.MOBSHEETS[slug];
  must(meta&&meta.cols===9&&sz.w===meta.cw*9&&sz.h===meta.ch*4,slug+": moving sheet inválido");
  for(const loot of m.loot){
    const item=ctx.GAMEDATA.items[loot.item];
    must(item,`${slug}: loot sem definição: ${loot.item}`);
    must(fs.existsSync(path.join(game,"assets","item",loot.item+".png")),`${slug}: loot sem sprite: ${loot.item}`);
  }
}
const poison=ctx.GAMEDATA.monsters["rotten-golem"].skills.find(s=>s.n==="poison chain");
const mouldPoison=ctx.GAMEDATA.monsters["mould-phantom"].skills.find(s=>s.n==="poison chain");
const mouldHoly=ctx.GAMEDATA.monsters["mould-phantom"].skills.find(s=>s.n==="extended holy chain");
must(poison.el==="earth"&&poison.chain===3&&mouldPoison.el==="earth"&&mouldPoison.chain===3&&
  mouldHoly.el==="holy"&&mouldHoly.chain===3,"chains especiais de Rotten Wasteland incorretas");

const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const ms=gameSrc.indexOf("const MISSION_DEFS = {");
const me=gameSrc.indexOf("\n\nfunction missionForHunt",ms);
vm.runInContext(gameSrc.slice(ms,me)+"\nwindow.__MISSIONS=MISSION_DEFS;",ctx);
const mission=ctx.__MISSIONS["rotten-wasteland"];
must(mission&&mission.tasks.length===1&&mission.tasks[0].monster==="rotten-golem"&&
  mission.tasks[0].target===50&&mission.completeReward.bossAccess==="goshnar-s-hatred",
  "missão de 50 Rotten Golems não libera Goshnar's Hatred");
const bs=gameSrc.indexOf("const BOSS_DEFS = {");
const be=gameSrc.indexOf("\n\n/* Quivers",bs);ctx.BOSS_COOLDOWN=0;
vm.runInContext(gameSrc.slice(bs,be)+"\nwindow.__BOSSES=BOSS_DEFS;",ctx);
const boss=ctx.__BOSSES["goshnar-s-hatred"],base=ctx.GAMEDATA.monsters["goshnar-s-hatred"];
must(boss&&boss.hunt==="goshnars-hatred-room"&&boss.requirement.enforced===true&&
  boss.requirement.mission==="rotten-wasteland"&&boss.requirement.access==="goshnar-s-hatred"&&
  boss.hp===300000&&boss.exp===75000&&boss.damage===5000&&boss.armor===160&&boss.defense===160,
  "Goshnar's Hatred não foi criado/bloqueado com stats oficiais");
must(base&&base.skills.length===3&&base.defSkills.length===2&&base.loot.length===24&&
  base.skills.find(s=>s.n==="singlecloudchain").el==="energy",
  "ataques/defesas/loot de Goshnar's Hatred divergentes do Canary");
const hatredRanges={"crystal-coin":[70,75],"bullseye-potion":[10,25],
  "ultimate-mana-potion":[50,100],"supreme-health-potion":[50,100]};
for(const [item,[min,max]] of Object.entries(hatredRanges)){
  const drop=base.loot.find(l=>l.item===item);must(drop&&drop.min===min&&drop.max===max,item+": range min/max perdido");
}
const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const ls=combatSrc.indexOf("function lootStackCount"),le=combatSrc.indexOf("\n\n/* Gera o loot",ls);
vm.runInContext(combatSrc.slice(ls,le),ctx);
must(ctx.lootStackCount({min:70,max:75},0)===70&&ctx.lootStackCount({min:70,max:75},.999999)===75,
  "rollLoot não respeita a faixa 70..75 do Canary");
for(const loot of base.loot){
  must(ctx.GAMEDATA.items[loot.item],"Hatred: loot sem definição: "+loot.item);
  must(fs.existsSync(path.join(game,"assets","item",loot.item+".png")),"Hatred: loot sem sprite: "+loot.item);
}
const ui=fs.readFileSync(path.join(js,"ui.js"),"utf8");
must(ui.includes('{ title: "SOULWAR 400+", ids: ["dark-thais", "rotten-wasteland"] }'),
  "Rotten Wasteland não aparece em Soulwar 400+");
console.log("OK: Rotten Wasteland 30×30, 3 monstros, loot/attacks, missão 50 e Goshnar's Hatred validados.");
