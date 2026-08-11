/* Soul War / Dark Thais — conteúdo inicial de Mirrored Nightmare. */
"use strict";
(function(){
 if(typeof GAMEDATA==='undefined')return; const M=GAMEDATA.monsters,I=GAMEDATA.items;
 if(!I['bag-you-desire']) I['bag-you-desire']={n:'Bag You Desire',s:'container',t:'container',sell:5000,w:18,cid:34109,af:10,aw:24,ah:30};
 const serverLootItems={
  'white-gem':{n:'white gem',cid:32769,w:.3},
  'dragon-figurine':{n:'dragon figurine',cid:30053,w:6.5},
  'supreme-health-potion':{n:'supreme health potion',cid:23375,w:3.5},
  'ultimate-spirit-potion':{n:'ultimate spirit potion',cid:23374,w:3.1},
  'greed-s-arm':{n:"Greed's arm",cid:33924,w:1.25},
  'figurine-of-greed':{n:'figurine of Greed',cid:34021,w:.44},
  'the-skull-of-a-beast':{n:'the skull of a beast',cid:34075,w:2.3},
 };
 for(const slug in serverLootItems) if(!I[slug]) I[slug]=Object.assign({s:null,t:'loot',sell:1},serverLootItems[slug]);
 const souls=['soul-bastion','soulbleeder','soulcrusher','soulcutter','soulhexer','soulmaimer','soulpiercer','soulshredder','soulshroud','soulstrider','soulmantle','soulwalkers','soulbiter','soulful-legs','soulcrown'];
 souls.forEach((id)=>{if(!I[id])I[id]={n:id.replace(/-/g,' '),s:'misc',t:'soulwar',sell:25000,w:35};});
 const loot=[{chance:100,max:18,item:'platinum-coin'},{chance:28,max:4,item:'ultimate-health-potion'},{chance:28,max:4,item:'ultimate-mana-potion'},{chance:10,max:1,item:'bag-you-desire'}];
 const ap=(n,hp,exp,el,skill)=>({name:n,hp,exp,damage:900,armor:85,defense:65,element:el,attackSpeed:2000,mitigation:2.5,resist:{physical:0,fire:10,ice:10,energy:10,earth:10,death:10,holy:10},skills:[{el,min:900,max:1300,int:2000,ch:30,range:6,fx:skill,miss:el},{el,min:800,max:1150,int:3000,ch:22,radius:2,fx:skill}],loot:loot.slice()});
 M['knight-s-apparition']=ap("Knight's Apparition",25000,18500,'physical','hit-area');
 M['paladin-s-apparition']=ap("Paladin's Apparition",24000,19000,'holy','holy-damage');
 M['sorcerer-s-apparition']=ap("Sorcerer's Apparition",22000,20500,'energy','energy-area');
 M['druid-s-apparition']=ap("Druid's Apparition",23000,20000,'earth','small-plants');
 M['monk-s-apparition']=ap("Monk's Apparition",24500,21000,'physical','blow-white');
 M['many-faces']=ap('Many Faces',42000,32000,'death','mort-area');
 M['mirror-image']=ap('Mirror Image',35000,27000,'death','magic-blue');
 // Canary Soul War (normal monsters): 25k HP, 28.6k exp, def/armor 100.
 const apparition=(name, element, skills)=>({name,hp:25000,exp:28600,damage:1300,armor:100,defense:100,mitigation:3.34,element,attackSpeed:2000,resist:{physical:0,energy:0,earth:0,fire:-5,ice:30,holy:50,death:-30},skills,loot:loot.slice()});
 const iceHoly=(iceA, holyA, extra)=>[
  {el:'ice',min:iceA[0],max:iceA[1],int:3000,ch:31,range:7,radius:4,fx:'big-clouds',miss:'ice'},
  {el:'ice',min:1050,max:1300,int:9500,ch:37,range:7,chain:3,fx:'ice-attack',miss:'ice'},
  {el:'holy',min:holyA[0],max:holyA[1],int:4000,ch:55,range:7,fx:'holy-damage',miss:'holy'},
  {el:'holy',min:1250,max:1400,int:3000,ch:23,radius:4,fx:'holy-area'},
 ].concat(extra||[]);
 M['knight-s-apparition']=apparition("Knight's Apparition",'ice',iceHoly([840,1000],[1050,1300],[{el:'physical',min:850,max:1000,int:3000,ch:19,radius:4,fx:'groundshaker'}]));
 M['paladin-s-apparition']=apparition("Paladin's Apparition",'ice',iceHoly([840,1000],[1050,1300],[{el:'physical',min:900,max:1350,int:4000,ch:23,range:7,fx:'explosion-hit',miss:'explosion'}]));
 M['sorcerer-s-apparition']=apparition("Sorcerer's Apparition",'ice',iceHoly([1080,1300],[1100,1250],[{el:'ice',min:1100,max:1300,int:5000,ch:34,range:7,chain:3,fx:'big-clouds',miss:'ice'}]));
 M['druid-s-apparition']=apparition("Druid's Apparition",'ice',iceHoly([1080,1300],[1100,1250]));
 M['monk-s-apparition']=apparition("Monk's Apparition",'ice',iceHoly([1080,1300],[1100,1250]));
 M['many-faces']={name:'Many Faces',hp:30000,exp:18870,damage:1300,armor:105,defense:105,mitigation:3.34,element:'ice',attackSpeed:2000,resist:{physical:0,energy:0,earth:0,fire:-5,ice:30,holy:50,death:-30},skills:[{el:'ice',min:1220,max:1400,int:4000,ch:33,range:7,fx:'ice-attack',miss:'ice'},{el:'ice',min:1000,max:1450,int:5000,ch:44,range:7,radius:5,fx:'ice-area',miss:'ice'},{el:'holy',min:1050,max:1300,int:9500,ch:59,radius:4,fx:'holy-area'},{el:'holy',min:1150,max:1300,int:10000,ch:59,range:7,chain:4,fx:'holy-damage',miss:'holy'}],loot:loot.slice()};
 GAMEDATA.hunts['dark-thais']={name:'Dark Thais — Mirrored Nightmare',level:550,minLevel:550,cat:'hardcore',scene:'dark-thais',mapa:'dark-thais',otbm:'mirrored_nightmare_sw',otbmFloor:7,otbmFovBounds:{x:1014,y:1013,w:19,h:15,z:7},otbmRuntimeWidth:30,otbmRuntimeHeight:30,otbmSpawn:{x:1018,y:1020,z:7},otbmMobBounds:{x:1014,y:1013,w:19,h:15,z:7},monsters:['many-faces','knight-s-apparition','paladin-s-apparition','sorcerer-s-apparition','druid-s-apparition','monk-s-apparition','distorted-phantom'],avgHp:26857,avgExp:21553,avgDamage:993,avgArmor:87,avgGold:150,respawn:.7,pack:10,packMin:8,packMax:10,influencedMul:2,fiendishMul:2,color:'#38274e',soulWarZone:true,soulWarZoneMonster:'many-faces'};
 // Bossroom integral: o mundo 30×30 mantém todo o piso z=7. A célula G
 // exclusiva posiciona Goshnar no norte; os adds usam as demais células
 // livres da sala e não dependem desta zona.
 GAMEDATA.hunts['goshnars-greed-room']={
  name:"Goshnar's Greed Room",hidden:true,level:550,minLevel:550,
  cat:'boss-room',scene:'soulwar',otbm:'goshnarsgreed',otbmFloor:7,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1052,y:1022,z:7},
  otbmMobBounds:{x:1052,y:1011,w:1,h:1,z:7},
  monsters:['goshnar-s-greed','dreadful-harvester','soulsnatcher','greedbeast','powerful-soul'],
  avgHp:300000,avgExp:150000,avgDamage:1800,avgArmor:120,avgGold:100,
  respawn:1,pack:1,
 };
 window.soulwarOpenBag=function(p){const pool=['soul-bastion','soulbleeder','soulcrusher','soulcutter','soulhexer','soulmaimer','soulpiercer','soulshredder','soulshroud','soulstrider','soulmantle','soulwalkers','soulbiter','soulful-legs','soulcrown'];const item=pool[Math.floor(Math.random()*pool.length)]; if(p){p.depot=p.depot||[];p.depot.push(item);return item;}return null;};
})();
/* Mirror Image do Canary: no primeiro dano revela a Apparition da vocação
   que a atacou, preservando posição e vida restante proporcional. */
window.soulwarMirrorTransform=function(c,m,p){
 if(!m||m.slug!=='mirror-image'||m._mirrorDone)return;
 const map={knight:'knight-s-apparition',paladin:'paladin-s-apparition',sorcerer:'sorcerer-s-apparition',druid:'druid-s-apparition',monk:'monk-s-apparition'};
 const slug=map[p&&p.voc]||'many-faces', def=GAMEDATA.monsters[slug]; if(!def)return;
 const pct=m.maxHp?m.hp/m.maxHp:1; m.slug=slug;m.def=Object.assign({},def);m.maxHp=def.hp;m.hp=Math.max(1,Math.floor(def.hp*pct));m._mirrorDone=true;
 if(c&&c.events)c.events.push({t:'effect',x:m.x,y:m.y,screen:true,fx:'magic-blue'});
};

/* --------------------------------------------- Goshnar's Taints
 * Port das cinco penalidades do Canary. Elas só atuam em áreas Soul War e
 * expiram 14 dias após a primeira mácula. */
const SOULWAR_TAINT_DURATION=14*24*60*60*1000;
const SOULWAR_TAINTS=[
 {id:'teleport',name:'Taint of Teleportation',icon:'goshnar-taint-1',exp:1.045},
 {id:'spawn',name:'Taint of Duplication',icon:'goshnar-taint-2',exp:1.092},
 {id:'damage',name:'Taint of Pain',icon:'goshnar-taint-3',exp:1.141},
 {id:'heal',name:'Taint of Renewal',icon:'goshnar-taint-4',exp:1.192},
 {id:'loss',name:'Taint of Loss',icon:'goshnar-taint-5',exp:1.246},
];
const SOULWAR_TAINT_BOSSES=['goshnar-s-malice','goshnar-s-spite','goshnar-s-greed','goshnar-s-hatred','goshnar-s-cruelty'];
function soulwarTaintState(p){
 if(!p)return null;p.soulWarTaints=p.soulWarTaints||{level:0,firstAt:0,bosses:{}};
 const st=p.soulWarTaints;st.bosses=st.bosses||{};
 if(st.firstAt&&Date.now()-st.firstAt>=SOULWAR_TAINT_DURATION){st.level=0;st.firstAt=0;st.bosses={};}
 return st;
}
function soulwarTaintLevel(p){const st=soulwarTaintState(p);return st?Math.max(0,Math.min(5,st.level||0)):0;}
function soulwarTaintInfo(p){const level=soulwarTaintLevel(p);return level?Object.assign({level},SOULWAR_TAINTS[level-1]):null;}
function soulwarTaintTooltip(p){
 const level=soulwarTaintLevel(p);if(!level)return '';
 const penalties=['10% de chance de uma criatura teleportar até você','0,5% de chance de surgir outra criatura ao atacar','15% mais dano recebido','10% de chance de a criatura recuperar toda a vida ao morrer','Perda de 10% da vida e mana atuais a cada 10s'];
 return `Máculas de Goshnar ${level}/5 · ${penalties.slice(0,level).join(' · ')} · EXP +${Math.round((SOULWAR_TAINTS[level-1].exp-1)*1000)/10}%`;
}
function soulwarGrantBossTaint(p,bossId){
 if(SOULWAR_TAINT_BOSSES.indexOf(bossId)===-1)return 0;
 const st=soulwarTaintState(p);if(st.bosses[bossId])return st.level;
 st.bosses[bossId]=true;if(!st.firstAt)st.firstAt=Date.now();st.level=Math.min(5,(st.level||0)+1);
 const info=SOULWAR_TAINTS[st.level-1];
 if(typeof addLog==='function')addLog('death',`Você recebeu ${info.name} (${st.level}/5).`);
 if(typeof toast==='function')toast(`${info.name} — mácula ${st.level}/5`,'death');
 return st.level;
}
function soulwarInTaintZone(c){return !!(c&&((c.hunt&&c.hunt.soulWarZone)||(c.boss&&SOULWAR_TAINT_BOSSES.indexOf(c.boss.id)!==-1)));}
function soulwarTaintDamageMultiplier(c,p){return soulwarInTaintZone(c)&&soulwarTaintLevel(p)>=3?1.15:1;}
function soulwarTaintExpMultiplier(c,p){
 if(!soulwarInTaintZone(c))return 1;const level=soulwarTaintLevel(p);
 return level?SOULWAR_TAINTS[level-1].exp:1;
}
function soulwarTaintPreventMonsterDeath(c,mob,p,randomFn){
 if(!soulwarInTaintZone(c)||soulwarTaintLevel(p)<4||!mob||mob.boss)return false;
 if((randomFn||Math.random)()>=.10)return false;
 mob.hp=mob.maxHp;mob.spawnAt=Date.now();
 if(c.events)c.events.push({t:'effect',x:mob.x,y:mob.y,screen:true,fx:'magic-green'});
 if(typeof addLog==='function')addLog('death',`${mob.def.name} restaurou toda a vida pela quarta mácula!`);
 return true;
}
function soulwarTaintSpawnNearPlayer(c,p,now,randomFn){
 if(!soulwarInTaintZone(c)||soulwarTaintLevel(p)<2)return false;
 c.soulwarTaintSpawnCd=c.soulwarTaintSpawnCd||0;if(now<c.soulwarTaintSpawnCd||(randomFn||Math.random)()>=.005)return false;
 const slug=(c.hunt&&c.hunt.soulWarZoneMonster)||'many-faces',def=GAMEDATA.monsters[slug];if(!def)return false;
 const occ=typeof buildOccupancy==='function'?buildOccupancy(c,null):new Map(),ent={};
 const px=c.player&&c.player.cx!==undefined?c.player.cx:Math.floor((c.gridW||30)/2);
 const py=c.player&&c.player.cy!==undefined?c.player.cy:Math.floor((c.gridH||30)/2);
 if(typeof placeFree==='function'&&!placeFree(ent,occ,px,py,3))return false;
 const cx=ent.cx===undefined?px:ent.cx,cy=ent.cy===undefined?py:ent.cy;
 const pos=typeof cellToScreen==='function'?cellToScreen(cx,cy):{x:(cx+.5)/(c.gridW||30),y:(cy+.5)/(c.gridH||30)};
 const mob={slug,def:Object.assign({},def),hp:def.hp,maxHp:def.hp,atkCd:700,id:'taint-'+Date.now().toString(36),cx,cy,x:pos.x,y:pos.y,sx:pos.x,sy:pos.y,dir:'w',moving:false,attackAnim:0,speed:.000055,spawnAt:Date.now()};
 c.mobs.push(mob);c.soulwarTaintSpawnCd=now+30000;
 if(c.events)c.events.push({t:'effect',x:pos.x,y:pos.y,screen:true,fx:'teleport'});
 return true;
}
function soulwarTaintTick(c,p,dt,now,randomFn){
 if(!soulwarInTaintZone(c))return;
 const level=soulwarTaintLevel(p),rnd=randomFn||Math.random;if(!level)return;
 if(level>=1){
  c.soulwarTeleportAcc=(c.soulwarTeleportAcc||0)+dt;
  if(c.soulwarTeleportAcc>=2000){c.soulwarTeleportAcc=0;const mobs=(c.mobs||[]).filter(m=>!m.boss&&m.hp>0);
   if(mobs.length&&rnd()<.10){const m=mobs[Math.floor(rnd()*mobs.length)],occ=typeof buildOccupancy==='function'?buildOccupancy(c,m):new Map(),dest={};
    if(typeof placeFree==='function'&&placeFree(dest,occ,c.player.cx,c.player.cy,2)){m.cx=dest.cx;m.cy=dest.cy;const pos=cellToScreen(m.cx,m.cy);m.x=pos.x;m.y=pos.y;if(c.events)c.events.push({t:'effect',x:m.x,y:m.y,screen:true,fx:'teleport'});}}
  }
 }
 if(level>=5){c.soulwarLossAcc=(c.soulwarLossAcc||0)+dt;if(c.soulwarLossAcc>=10000){c.soulwarLossAcc-=10000;p.hp=Math.max(0,p.hp-Math.ceil(p.hp*.10));p.mp=Math.max(0,p.mp-Math.ceil(p.mp*.10));if(c.events)c.events.push({t:'effect',x:c.player.x,y:c.player.y,screen:true,fx:'mort-area'});}}
}

/* ------------------------------------------------ Goshnar's Greed
 * Mini game: o boss começa imune e a sala mantém até seis adds. Cada quinto
 * Greedbeast morto abre uma janela de vulnerabilidade de 20 segundos. */
const GOSHNAR_GREED_ID='goshnar-s-greed';
const GREED_ADDS=['dreadful-harvester','soulsnatcher','greedbeast','powerful-soul'];
const GREED_MAX_ADDS=6;
const GREED_KILLS_TO_OPEN=5;
const GREED_VULNERABLE_MS=20000;

function greedBossFight(c){return !!(c&&c.boss&&c.boss.id===GOSHNAR_GREED_ID);}
function greedBossMob(c){return c&&c.mobs?c.mobs.find((m)=>m&&m.boss):null;}
function greedBossAdds(c){return (c&&c.mobs||[]).filter((m)=>m&&!m.boss&&m.hp>0);}
function greedRandomIndex(length,randomFn){
 const r=Math.max(0,Math.min(.999999,(randomFn||Math.random)()));
 return Math.min(length-1,Math.floor(r*length));
}
function greedFreeCells(c){
 const out=[];
 const occ=typeof buildOccupancy==='function'?buildOccupancy(c,null):new Map();
 const w=c.gridW||((c.huntMap&&c.huntMap.rows&&c.huntMap.rows[0]||'').length)||30;
 const h=c.gridH||((c.huntMap&&c.huntMap.rows||[]).length)||30;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(c.huntMap&&typeof huntMapBlocked==='function'&&huntMapBlocked(c.huntMap,x,y))continue;
  if(occ&&occ.has&&occ.has(x+':'+y))continue;
  out.push({x,y});
 }
 return out;
}
function greedCreateAdd(c,slug,randomFn){
 const def=typeof GAMEDATA!=='undefined'&&GAMEDATA.monsters&&GAMEDATA.monsters[slug];
 const cells=greedFreeCells(c); if(!def||!cells.length)return null;
 const cell=cells[greedRandomIndex(cells.length,randomFn)];
 const pos=typeof cellToScreen==='function'?cellToScreen(cell.x,cell.y):
  {x:(cell.x+.5)/(c.gridW||30),y:(cell.y+.5)/(c.gridH||30)};
 const mob={slug,def:Object.assign({},def),hp:def.hp,maxHp:def.hp,
  atkCd:400+(randomFn||Math.random)()*1200,
  id:'greed-add-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
  cx:cell.x,cy:cell.y,x:pos.x,y:pos.y,sx:pos.x,sy:pos.y,dir:'w',
  moving:false,attackAnim:0,speed:.000055,spawnAt:Date.now()};
 // Adds ficam antes do boss enquanto ele está imune, para o auto-combatê-los.
 c.mobs.unshift(mob); return mob;
}
function greedSortTargets(c){
 if(!greedBossFight(c)||!c.greed)return;
 const boss=greedBossMob(c),adds=greedBossAdds(c);
 c.mobs=c.greed.immune?adds.concat(boss?[boss]:[]):(boss?[boss]:[]).concat(adds);
}
function greedFillAdds(c,randomFn){
 if(!greedBossFight(c)||!c.greed||!c.greed.immune)return 0;
 let made=0;
 while(greedBossAdds(c).length<GREED_MAX_ADDS){
  const slug=GREED_ADDS[greedRandomIndex(GREED_ADDS.length,randomFn)];
  if(!greedCreateAdd(c,slug,randomFn))break;
  made++;
 }
 greedSortTargets(c);
 if(made&&typeof resolveSQMOccupancy==='function')resolveSQMOccupancy(c);
 return made;
}
function greedBossInit(c,player,randomFn){
 if(!greedBossFight(c))return c;
 const now=Date.now(),boss=greedBossMob(c);
 c.greed={immune:true,greedbeastKills:0,vulnerableUntil:0,
  nextSpawnAt:now,lastBlockFx:0,randomFn:randomFn||Math.random};
 if(boss)boss.greedImmune=true;
 greedFillAdds(c,c.greed.randomFn);
 if(typeof addLog==='function')
  addLog('death',"Goshnar's Greed está imune. Mate <b>5 Greedbeasts</b> para abrir 20s de vulnerabilidade.");
 return c;
}
function greedStartVulnerability(c,now){
 const st=c.greed,boss=greedBossMob(c); if(!st||!boss)return false;
 st.immune=false;st.greedbeastKills=0;st.vulnerableUntil=now+GREED_VULNERABLE_MS;
 boss.greedImmune=false;greedSortTargets(c);
 c.events.push({t:'effect',x:boss.x,y:boss.y,screen:true,fx:'magic-green'});
 if(typeof addLog==='function')addLog('level',"5 Greedbeasts derrotados — Goshnar está <b>VULNERÁVEL por 20s</b>!");
 if(typeof toast==='function')toast("Goshnar's Greed vulnerável por 20 segundos!",'level');
 return true;
}
function greedBossHandleKill(c,mob,now){
 if(!greedBossFight(c)||!c.greed||!mob||mob.slug!=='greedbeast'||!c.greed.immune)return false;
 c.greed.greedbeastKills++;
 if(typeof addLog==='function')addLog('info',`Greedbeasts: <b>${c.greed.greedbeastKills}/${GREED_KILLS_TO_OPEN}</b>`);
 if(c.greed.greedbeastKills>=GREED_KILLS_TO_OPEN)return greedStartVulnerability(c,now||Date.now());
 return true;
}
function greedBossAfterDeaths(c){if(greedBossFight(c))greedSortTargets(c);}
function greedBossTick(c,now){
 if(!greedBossFight(c)||!c.greed)return true;
 const st=c.greed,boss=greedBossMob(c); if(!boss||boss.hp<=0)return true;
 if(!st.immune){
  if(now<st.vulnerableUntil){greedSortTargets(c);return true;}
  st.immune=true;st.vulnerableUntil=0;st.nextSpawnAt=now;boss.greedImmune=true;
  if(typeof addLog==='function')addLog('death',"A vulnerabilidade acabou — Goshnar's Greed está imune novamente.");
 }
 if(now>=st.nextSpawnAt){greedFillAdds(c,st.randomFn);st.nextSpawnAt=now+1500;}
 greedSortTargets(c);return true;
}
function greedBossCanTakePlayerDamage(c,target){
 return !(greedBossFight(c)&&c.greed&&c.greed.immune&&target&&target.boss);
}
function greedBossOutgoingDamageMultiplier(c,mob){
 return greedBossFight(c)&&c.greed&&c.greed.immune&&mob&&mob.boss ? .7 : 1;
}
function greedBossCleanup(c){if(c&&c.greed)delete c.greed;}
