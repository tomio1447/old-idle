/* Combate online autoritativo e determinístico (browser + worker). */
"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const DATA=path.join(__dirname,"..","game","data");
function read(name){return JSON.parse(fs.readFileSync(path.join(DATA,name),"utf8"));}
const MONSTERS=Object.assign({},read("monsters.json"),read("canarymonsters.json"));
const ITEMS=read("items.json");
const HUNTS=Object.assign(read("hunts.json"),{
  "mota-extension":{monsters:["floating-savant","retching-horror","fury","hellhound","demon"]},
  "cobra-bastion":{monsters:["cobra-vizier","cobra-scout","cobra-assassin"]},
  "timira-room":{monsters:["timira-the-many-headed"]},
  "library-fire":{monsters:["burning-book","rage-squid","biting-book"]},
  "library-energy":{monsters:["energetic-book","biting-book"]},
  "library-ice":{monsters:["icecold-book","squid-warden","ink-blob"]},
  "library-earth":{monsters:["cursed-book","biting-book"]},
  "dark-thais":{monsters:["many-faces","knight-s-apparition","paladin-s-apparition","sorcerer-s-apparition","druid-s-apparition","monk-s-apparition","distorted-phantom"]},
  "rotten-wasteland":{monsters:["rotten-golem","branchy-crawler","mould-phantom"]},
  "goshnars-greed-room":{monsters:["goshnar-s-greed","dreadful-harvester","soulsnatcher","greedbeast","powerful-soul"]},
  "goshnars-hatred-room":{monsters:["goshnar-s-hatred","dreadful-harvester","hateful-soul"]},
});
const VOC={none:{hp:5,mp:5},knight:{hp:15,mp:5},paladin:{hp:10,mp:15},druid:{hp:5,mp:30},sorcerer:{hp:5,mp:30},monk:{hp:10,mp:10}};
const START_HP=185,START_MP=5,FULL_STAMINA=42*3600;
function clone(v){return JSON.parse(JSON.stringify(v||{}));}
function expForLevel(level){return Math.floor((50/3)*(level**3-6*level**2+17*level-12));}
function maxStats(p){const level=Math.max(1,Number(p.level)||1),v=VOC[p.voc]||VOC.none;
  const rook=Math.min(level-1,7),voc=Math.max(0,level-1-rook);let hp=START_HP+rook*5+voc*v.hp,mp=START_MP+rook*5+voc*v.mp;
  for(const slot of Object.keys(p.equip||{})){const e=p.equip[slot],it=e&&ITEMS[e.item];if(it){hp+=Number(it.hp)||0;mp+=Number(it.mp)||0;}}
  return {hp:Math.max(1,Math.floor(hp)),mp:Math.max(0,Math.floor(mp))};}
function blessingPrice(level){level=Math.max(1,Math.floor(Number(level)||1));return level*(level<=120?500:level<400?700:1000);}
function seedFor(id){return parseInt(crypto.createHash("sha256").update(String(id)).digest("hex").slice(0,8),16)||1;}
function random(auth){let x=Number(auth.rngState)||1;x^=x<<13;x^=x>>>17;x^=x<<5;auth.rngState=x>>>0;return auth.rngState/4294967296;}
function roll(auth,min,max){return Math.floor(min+random(auth)*(max-min+1));}
function monsterDef(slug){return MONSTERS[String(slug)]||null;}
function weaponAttack(p){const e=p.equip&&p.equip.weapon,it=e&&ITEMS[e.item];return Math.max(7,Number(it&&(it.attack!==undefined?it.attack:it.atk))||7);}
function attackSkillName(p){if(p.voc==="paladin")return "dist";if(p.voc==="monk")return "fist";
  const e=p.equip&&p.equip.weapon,it=e&&ITEMS[e.item],type=it&&String(it.type||it.t||"");return ["sword","axe","club"].includes(type)?type:"fist";}
function playerSkill(p){const skills=p.skills||{},which=attackSkillName(p);return Number(skills[which])||10;}
function progressAttack(p){
  if(p.voc==="druid"||p.voc==="sorcerer"){
    p.manaSpent=(Number(p.manaSpent)||0)+5;let need=Math.floor(400*Math.pow(1.18,Number(p.ml)||0));
    while(p.manaSpent>=need){p.manaSpent-=need;p.ml=(Number(p.ml)||0)+1;need=Math.floor(400*Math.pow(1.18,p.ml));}return;
  }
  const which=attackSkillName(p);p.skills=p.skills||{};p.skillTries=p.skillTries||{};p.skills[which]=Number(p.skills[which])||10;
  p.skillTries[which]=(Number(p.skillTries[which])||0)+1;let need=Math.floor(50*Math.pow(1.1,p.skills[which]-10));
  while(p.skillTries[which]>=need){p.skillTries[which]-=need;p.skills[which]++;need=Math.floor(50*Math.pow(1.1,p.skills[which]-10));}
}
function playerDamage(auth,p,mob){const level=Number(p.level)||1,skill=playerSkill(p),magic=p.voc==="druid"||p.voc==="sorcerer";
  const power=magic?level*.45+(Number(p.ml)||0)*2.8+12:level*.25+skill*.72+weaponAttack(p)*1.15;
  return Math.max(1,Math.floor(power*(.85+random(auth)*.3)-(Number(mob.armor)||0)*.35));}
function playerArmor(p){let armor=0;for(const slot of Object.keys(p.equip||{})){const e=p.equip[slot],it=e&&ITEMS[e.item];armor+=Number(it&&it.armor)||0;}return armor;}
function mobDamage(auth,mob,p){return Math.max(0,Math.floor((Number(mob.damage)||1)*(.55+random(auth)*.45)-playerArmor(p)*.45));}
function addExp(p,amount){p.exp=Math.max(0,Number(p.exp)||0)+Math.max(0,Math.floor(amount));p.level=Math.max(1,Number(p.level)||1);
  while(p.exp>=expForLevel(p.level+1))p.level++;
  const max=maxStats(p);p.hp=Math.min(max.hp,Math.max(0,Number(p.hp)||0));p.mp=Math.min(max.mp,Math.max(0,Number(p.mp)||0));}
function applyPvpLoss(p,source){const rate=source==="player-raid"?.08:.03,loss=Math.floor(Math.max(0,Number(p.exp)||0)*rate);p.exp=Math.max(0,(Number(p.exp)||0)-loss);return loss;}
function canonicalPlayer(member){const p=clone(member&&member.p||{});p.id=String(member.id);p.level=Math.max(1,Number(p.level)||1);p.exp=Math.max(0,Number(p.exp)||0);
  p.gold=Math.max(0,Number(p.gold)||0);p.skills=p.skills||{fist:10,sword:10,axe:10,club:10,dist:10,shield:10};
  p.skillTries=p.skillTries||{};p.supplies=p.supplies||{};p.lootPouch=p.lootPouch||{};p.kills=p.kills||{};p.bosses=p.bosses||{};p.stamina=FULL_STAMINA;
  const max=maxStats(p);p.hp=Math.min(max.hp,Math.max(1,Number(p.hp)||max.hp));p.mp=Math.min(max.mp,Math.max(0,Number(p.mp)||max.mp));return p;}
function makeMob(auth,slug,boss,id){const def=monsterDef(slug);if(!def)return null;const greedAdd=["dreadful-harvester","soulsnatcher","greedbeast","powerful-soul"].includes(String(slug));
  const sequence=Math.max(1,Number(auth.nextMobId)||1);auth.nextMobId=sequence+1;const mob={id:id||("srv-"+sequence),slug:String(slug),boss:!!boss,
    hp:Math.max(1,Number(def.hp)||1),maxHp:Math.max(1,Number(def.hp)||1),armor:greedAdd?0:Math.max(0,Number(def.armor)||0),damage:Math.max(0,Number(def.damage)||0),
    exp:Math.max(0,Number(def.exp)||0),attackSpeed:Math.max(500,Number(def.attackSpeed)||2000),attackAcc:0,def};
  const points=auth.spawnPoints||[],point=points.length?points[(sequence-1)%points.length]:null;
  if(point)Object.assign(mob,point);else if(auth.gridW&&auth.gridH){mob.cx=Math.floor(auth.gridW/2);mob.cy=Math.floor(auth.gridH/2);
    mob.x=(mob.cx+.5)/auth.gridW;mob.y=(mob.cy+.5)/auth.gridH;mob.sx=mob.x;mob.sy=mob.y;}
  return mob;}
function reward(auth,mob,players){const alive=players.filter((x)=>x.p.hp>0),receivers=alive.length?alive:players,share=Math.floor(mob.exp/Math.max(1,receivers.length));
  for(const item of receivers){addExp(item.p,share);item.p.totalKills=(Number(item.p.totalKills)||0)+1;item.p.kills[mob.slug]=(Number(item.p.kills[mob.slug])||0)+1;
    if(auth.huntId){item.p.missions=item.p.missions||{};const mission=item.p.missions[auth.huntId]||(item.p.missions[auth.huntId]={progress:{},claimed:{},completeClaimed:false});
      mission.progress=mission.progress||{};mission.progress[mob.slug]=(Number(mission.progress[mob.slug])||0)+1;}}
  const leader=players[0]&&players[0].p;if(!leader)return;
  for(const entry of mob.def.loot||[]){if(random(auth)*100>Math.min(100,Number(entry.chance)||0))continue;
    const min=Math.max(1,Number(entry.min)||1),max=Math.max(min,Number(entry.max)||1),count=roll(auth,min,max);
    if(mob.boss){leader.rewardChest=Array.isArray(leader.rewardChest)?leader.rewardChest:[];
      leader.rewardChest.push({item:entry.item,count,bossId:auth.bossId||mob.slug,source:"server"});}
    else if(entry.item==="gold-coin")leader.gold=(Number(leader.gold)||0)+count;
    else leader.lootPouch[entry.item]=(Number(leader.lootPouch[entry.item])||0)+count;
    auth.stats.loot[entry.item]=(Number(auth.stats.loot[entry.item])||0)+count;
  }
  auth.stats.exp+=mob.exp;auth.stats.kills++;
}
function usePotion(p){const max=maxStats(p),sup=p.supplies||{};
  if(p.hp<max.hp*.45){for(const id of ["supreme-health-potion","ultimate-health-potion","great-health-potion","strong-health-potion","health-potion","small-health-potion"]){
    if((sup[id]||0)>0){sup[id]--;p.hp=Math.min(max.hp,p.hp+Math.floor(max.hp*.35));return;}}}
  if(p.mp<max.mp*.3){for(const id of ["ultimate-mana-potion","great-mana-potion","strong-mana-potion","mana-potion"]){
    if((sup[id]||0)>0){sup[id]--;p.mp=Math.min(max.mp,p.mp+Math.max(50,Math.floor(max.mp*.3)));return;}}}}
function healPlayers(auth){
  for(const item of auth.players){const p=item.p;if(p.hp<=0||item.downUntil)continue;const max=maxStats(p);
    p.mp=Math.min(max.mp,p.mp+Math.max(1,Math.floor(max.mp*.015)));item.healAcc=(Number(item.healAcc)||0)+1000;
    const at=Math.max(20,Math.min(95,Number(p.config&&p.config.healAt)||70));
    if(item.healAcc>=1000&&p.hp<max.hp*at/100){const rate={knight:.12,paladin:.14,druid:.18,sorcerer:.17,monk:.16}[p.voc]||.1,
        mana=Math.max(10,Math.floor((Number(p.level)||1)*.05));
      if(p.mp>=mana){p.mp-=mana;p.hp=Math.min(max.hp,p.hp+Math.max(20,Math.floor(max.hp*rate)));item.healAcc=0;}}
  }
  for(const healer of auth.players){if(!["druid","monk"].includes(healer.p.voc)||healer.p.hp<=0||healer.downUntil)continue;
    healer.friendHealAcc=(Number(healer.friendHealAcc)||0)+1000;if(healer.friendHealAcc<2000)continue;
    const target=auth.players.filter((x)=>x.p.hp>0&&!x.downUntil).sort((a,b)=>a.p.hp/maxStats(a.p).hp-b.p.hp/maxStats(b.p).hp)[0],mana=80;
    if(target&&target!==healer&&target.p.hp<maxStats(target.p).hp*.8&&healer.p.mp>=mana){healer.p.mp-=mana;
      target.p.hp=Math.min(maxStats(target.p).hp,target.p.hp+Math.floor(maxStats(target.p).hp*.2));healer.friendHealAcc=0;}}
}
function fillGreed(auth){if(!auth.greed||!auth.greed.immune||auth.ended)return;const choices=["dreadful-harvester","soulsnatcher","powerful-soul"];
  while(auth.mobs.filter((m)=>!m.boss&&m.hp>0).length<6){const r=random(auth),slug=r<.30?"greedbeast":choices[Math.min(2,Math.floor(((r-.30)/.70)*3))];
    const mob=makeMob(auth,slug,false);if(!mob)break;auth.mobs.unshift(mob);}}
function respawn(auth){if(auth.kind==="boss"||auth.ended)return;const count=Math.max(1,auth.pack||3);
  while(auth.mobs.length<count&&auth.spawnPool.length){const slug=auth.spawnPool[roll(auth,0,auth.spawnPool.length-1)],m=makeMob(auth,slug,false);if(m)auth.mobs.push(m);else break;}}
function fullWipe(auth){const pvp=auth.instanceMode==="pvp";if(pvp)for(const item of auth.players)applyPvpLoss(item.p,auth.lastDamageSource||"monster");
  const cost=auth.players.reduce((sum,item)=>sum+blessingPrice(item.p.level),0),leader=auth.players[0]&&auth.players[0].p;
  if(leader&&leader.gold>=cost){leader.gold-=cost;for(const item of auth.players){const max=maxStats(item.p);item.p.hp=max.hp;item.p.mp=max.mp;item.p.blessed=true;item.downUntil=0;}
    auth.wipes++;auth.mobs=[];respawn(auth);return;}
  auth.ended=true;auth.terminalReason="party-wipe";
}
function step(auth,now){if(auth.ended)return;
  if(auth.greed){if(!auth.greed.immune&&now>=auth.greed.vulnerableUntil){auth.greed.immune=true;auth.greed.vulnerableUntil=0;}
    if(auth.greed.immune)fillGreed(auth);}
  for(const item of auth.players){const p=item.p;p.stamina=FULL_STAMINA;if(item.downUntil&&now>=item.downUntil){const max=maxStats(p);p.hp=max.hp;p.mp=max.mp;item.downUntil=0;}usePotion(p);}
  healPlayers(auth);respawn(auth);const living=auth.mobs.filter((m)=>m.hp>0),boss=living.find((m)=>m.boss);
  const target=auth.greed&&auth.greed.immune?living.find((m)=>!m.boss):(boss||living[0]);
  if(target)for(const item of auth.players){if(item.p.hp<=0||item.downUntil)continue;item.attackAcc+=1000;
    while(item.attackAcc>=1200&&target.hp>0){item.attackAcc-=1200;target.hp-=playerDamage(auth,item.p,target);progressAttack(item.p);}}
  const dead=auth.mobs.filter((m)=>m.hp<=0);auth.mobs=auth.mobs.filter((m)=>m.hp>0);
  for(const mob of dead){
    if(auth.greed&&auth.greed.immune&&mob.slug==="greedbeast"){
      auth.greed.greedbeastKills++;if(auth.greed.greedbeastKills>=5){auth.greed.immune=false;auth.greed.greedbeastKills=0;auth.greed.vulnerableUntil=now+40000;}}
    reward(auth,mob,auth.players);if(mob.boss){auth.ended=true;auth.terminalReason="boss-defeated";auth.bossDefeated=true;
      const leader=auth.players[0]&&auth.players[0].p;if(leader){leader.bosses[auth.bossId]=leader.bosses[auth.bossId]||{};leader.bosses[auth.bossId].kills=(leader.bosses[auth.bossId].kills||0)+1;}}}
  for(const mob of auth.mobs){mob.attackAcc+=1000;while(mob.attackAcc>=mob.attackSpeed){mob.attackAcc-=mob.attackSpeed;
    const alive=auth.players.filter((x)=>x.p.hp>0&&!x.downUntil);if(!alive.length)break;const victim=alive[roll(auth,0,alive.length-1)];
    let damage=mobDamage(auth,mob,victim.p);if(auth.greed&&auth.greed.immune&&mob.boss)damage=Math.floor(damage*.7);victim.p.hp-=damage;
    if(victim.p.hp<=0){victim.p.hp=0;victim.p.blessed=false;victim.downUntil=now+30000;}}}
  if(auth.players.every((x)=>x.p.hp<=0||x.downUntil))fullWipe(auth);
}
function initializeAuthority(descriptor,instanceId,now){
  const combat=descriptor.state||{},active=Array.isArray(combat.mobs)?combat.mobs:[];
  // HARD hunts begin with teleport-blink entries in pendingSpawns; the local
  // array `mobs` is still empty when the first server snapshot is created.
  // Promote those pending definitions into the authoritative initial wave.
  const pending=Array.isArray(combat.pendingSpawns)?combat.pendingSpawns.map((sp)=>{
    if(!sp||!sp.mob)return null;const mob=Object.assign({},sp.mob,{cx:sp.cx,cy:sp.cy});
    const w=Number(combat.gridW)||30,h=Number(combat.gridH)||30;
    if(mob.x===undefined)mob.x=(Number(sp.cx)+.5)/w;if(mob.y===undefined)mob.y=(Number(sp.cy)+.5)/h;
    return mob;
  }).filter(Boolean):[];
  const seen=new Set(),visual=active.concat(pending).filter((mob)=>{
    const key=String(mob&&mob.id||mob&&mob.slug||"");if(!key||seen.has(key))return false;seen.add(key);return true;});
  combat.mobs=visual;combat.pendingSpawns=[];
  const players=(descriptor.members||[]).map((m)=>({id:String(m.id),p:canonicalPlayer(m),attackAcc:0,downUntil:0}));
  const auth={v:2,rngState:seedFor(instanceId),nextMobId:1,clock:Number(now)||Date.now(),carryMs:0,kind:descriptor.kind,
    huntId:descriptor.huntId||null,bossId:descriptor.bossId||null,instanceMode:descriptor.instanceMode||"non-pvp",players,mobs:[],spawnPool:[],spawnPoints:[],
    gridW:Number(combat.gridW)||30,gridH:Number(combat.gridH)||30,pack:Math.max(1,visual.length||3),
    stats:{kills:0,exp:0,loot:{}},wipes:0,ended:false,terminalReason:null,lastDamageSource:"monster"};
  for(const old of visual){const slug=String(old.slug||""),m=makeMob(auth,slug,!!old.boss,String(old.id||""));if(m){
      for(const key of ["cx","cy","x","y","sx","sy"])if(old[key]!==undefined)m[key]=old[key];
      if(old.cx!==undefined&&old.cy!==undefined&&!auth.spawnPoints.some((p)=>p.cx===old.cx&&p.cy===old.cy))
        auth.spawnPoints.push({cx:Number(old.cx),cy:Number(old.cy),x:Number(old.x),y:Number(old.y),sx:Number(old.sx),sy:Number(old.sy)});
      auth.mobs.push(m);if(!m.boss&&!auth.spawnPool.includes(slug))auth.spawnPool.push(slug);}}
  if(!auth.spawnPool.length){const hunt=HUNTS[auth.huntId];for(const slug of (hunt&&hunt.monsters)||[])if(monsterDef(slug))auth.spawnPool.push(slug);}
  if(descriptor.kind==="boss"){const boss=auth.mobs.find((m)=>m.boss)||auth.mobs[0];if(boss)boss.boss=true;const leader=players[0]&&players[0].p;
    if(leader&&auth.bossId){leader.bosses[auth.bossId]=leader.bosses[auth.bossId]||{};leader.bosses[auth.bossId].lastFight=auth.clock;}
    if(auth.bossId==="goshnar-s-greed"){auth.greed={immune:true,greedbeastKills:0,vulnerableUntil:0};fillGreed(auth);}}
  descriptor.authority=auth;return materializeAuthority(descriptor);
}
function materializeAuthority(descriptor){const auth=descriptor.authority;if(!auth)return descriptor;
  descriptor.members=auth.players.map((item)=>({id:item.id,p:clone(item.p),hp:item.p.hp,mp:item.p.mp}));descriptor.activeCharacterId=descriptor.activeCharacterId||auth.players[0]&&auth.players[0].id;
  descriptor.state=descriptor.state||{};const oldPlayers=Array.isArray(descriptor.state.players)?descriptor.state.players:[];
  descriptor.state.players=auth.players.map((item)=>Object.assign({},oldPlayers.find((x)=>String(x.id)===item.id)||{id:item.id},{id:item.id,p:clone(item.p),hp:item.p.hp,mp:item.p.mp,reviveAt:item.downUntil||0}));
  const oldMobs=Array.isArray(descriptor.state.mobs)?descriptor.state.mobs:[];
  descriptor.state.mobs=auth.mobs.map((m)=>Object.assign({},
    {cx:m.cx,cy:m.cy,x:m.x,y:m.y,sx:m.sx,sy:m.sy},oldMobs.find((x)=>String(x.id)===String(m.id))||{},
    {id:m.id,slug:m.slug,boss:m.boss,greedImmune:!!(auth.greed&&auth.greed.immune&&m.boss),
      hp:m.hp,maxHp:m.maxHp,atkCd:Math.max(0,m.attackSpeed-m.attackAcc),def:m.def}));
  if(auth.greed)descriptor.state.greed={immune:auth.greed.immune,greedbeastKills:auth.greed.greedbeastKills,
    vulnerableUntil:auth.greed.vulnerableUntil,nextSpawnAt:auth.clock+1500,lastBlockFx:0};
  descriptor.state.stats=Object.assign({},descriptor.state.stats||{},auth.stats);descriptor.state.bossDefeated=!!auth.bossDefeated;descriptor.state.dead=auth.ended&&auth.terminalReason==="party-wipe";
  descriptor.savedAt=auth.clock;return descriptor;
}
function advanceAuthorityState(serialized,elapsed,checkpointAt){let descriptor=typeof serialized==="string"?JSON.parse(serialized):clone(serialized);
  const auth=descriptor.authority;if(!auth)return null;
  // v2 corrige instâncias criadas com HP/MP antigos do banco no checkpoint de
  // entrada. A migração roda uma única vez também para snapshots já ativos.
  if(Number(auth.v||1)<2){for(const item of auth.players||[]){const max=maxStats(item.p);
      item.p.hp=max.hp;item.p.mp=max.mp;item.p.stamina=FULL_STAMINA;item.downUntil=0;}
    auth.v=2;}
  // Migra instâncias HARD criadas pela versão que ignorava pendingSpawns.
  if(!auth.spawnPool.length&&descriptor.state&&Array.isArray(descriptor.state.pendingSpawns)){
    const recoverMobs=auth.mobs.length===0;auth.spawnPoints=auth.spawnPoints||[];
    auth.gridW=Number(auth.gridW)||Number(descriptor.state.gridW)||30;auth.gridH=Number(auth.gridH)||Number(descriptor.state.gridH)||30;
    for(const sp of descriptor.state.pendingSpawns){const old=sp&&sp.mob,slug=String(old&&old.slug||"");if(!monsterDef(slug))continue;
      if(!auth.spawnPool.includes(slug))auth.spawnPool.push(slug);
      const point={cx:Number(sp.cx),cy:Number(sp.cy),x:(Number(sp.cx)+.5)/auth.gridW,y:(Number(sp.cy)+.5)/auth.gridH};
      if(!auth.spawnPoints.some((p)=>p.cx===point.cx&&p.cy===point.cy))auth.spawnPoints.push(point);
      if(recoverMobs){const mob=makeMob(auth,slug,!!old.boss,String(old.id||""));if(mob){Object.assign(mob,point);auth.mobs.push(mob);}}}
    descriptor.state.pendingSpawns=[];auth.pack=Math.max(auth.pack||0,auth.mobs.length||auth.spawnPool.length||1);
  }
  const total=Math.max(0,Number(elapsed)||0)+(Number(auth.carryMs)||0);
  const requested=Math.floor(total/1000),steps=Math.min(250000,requested);auth.carryMs=total-steps*1000;
  for(let i=0;i<steps;i++){auth.clock+=1000;step(auth,auth.clock);if(auth.ended){auth.carryMs=0;break;}}
  auth.clock=Math.max(auth.clock,Number(checkpointAt)||auth.clock);descriptor=materializeAuthority(descriptor);
  return {state:JSON.stringify(descriptor),characters:auth.players.map((item)=>({id:Number(item.id),data:JSON.stringify(item.p),level:item.p.level,voc:item.p.voc,
    hp:item.p.hp,mp:item.p.mp,max_hp:maxStats(item.p).hp,max_mp:maxStats(item.p).mp})),terminalReason:auth.ended?auth.terminalReason:null};
}
function protectedPlayer(descriptor,id){const auth=descriptor&&descriptor.authority;const item=auth&&auth.players.find((x)=>String(x.id)===String(id));return item?clone(item.p):null;}
module.exports={initializeAuthority,materializeAuthority,advanceAuthorityState,protectedPlayer,applyPvpLoss,expForLevel,maxStats,blessingPrice,MONSTERS,ITEMS};
