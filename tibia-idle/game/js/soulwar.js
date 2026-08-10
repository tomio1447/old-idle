/* Soul War / Dark Thais — conteúdo inicial de Mirrored Nightmare. */
"use strict";
(function(){
 if(typeof GAMEDATA==='undefined')return; const M=GAMEDATA.monsters,I=GAMEDATA.items;
 if(!I['bag-you-desire']) I['bag-you-desire']={n:'Bag You Desire',s:'container',t:'container',sell:5000,w:18,cid:34109,af:10,aw:24,ah:30};
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
 GAMEDATA.hunts['dark-thais']={name:'Dark Thais — Mirrored Nightmare',level:550,minLevel:550,cat:'hardcore',scene:'dark-thais',mapa:'dark-thais',monsters:['many-faces','knight-s-apparition','paladin-s-apparition','sorcerer-s-apparition','druid-s-apparition','monk-s-apparition'],avgHp:27000,avgExp:22000,avgDamage:950,avgArmor:85,avgGold:150,respawn:.7,pack:10,packMin:8,packMax:10,influencedMul:2,fiendishMul:2,color:'#38274e'};
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
