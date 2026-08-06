/* Soul War / Dark Thais — conteúdo inicial de Mirrored Nightmare. */
"use strict";
(function(){
 if(typeof GAMEDATA==='undefined')return; const M=GAMEDATA.monsters,I=GAMEDATA.items;
 if(!I['bag-you-desire']) I['bag-you-desire']={n:'Bag You Desire',s:'container',t:'container',sell:5000,w:18};
 const loot=[{chance:100,max:18,item:'platinum-coin'},{chance:28,max:4,item:'ultimate-health-potion'},{chance:28,max:4,item:'ultimate-mana-potion'},{chance:10,max:1,item:'bag-you-desire'}];
 const ap=(n,hp,exp,el,skill)=>({name:n,hp,exp,damage:900,armor:85,defense:65,element:el,attackSpeed:2000,mitigation:2.5,resist:{physical:0,fire:10,ice:10,energy:10,earth:10,death:10,holy:10},skills:[{el,min:900,max:1300,int:2000,ch:30,range:6,fx:skill,miss:el},{el,min:800,max:1150,int:3000,ch:22,radius:2,fx:skill}],loot:loot.slice()});
 M['knight-s-apparition']=ap("Knight's Apparition",25000,18500,'physical','hit-area');
 M['paladin-s-apparition']=ap("Paladin's Apparition",24000,19000,'holy','holy-damage');
 M['sorcerer-s-apparition']=ap("Sorcerer's Apparition",22000,20500,'energy','energy-area');
 M['druid-s-apparition']=ap("Druid's Apparition",23000,20000,'earth','small-plants');
 M['monk-s-apparition']=ap("Monk's Apparition",24500,21000,'physical','blow-white');
 M['many-faces']=ap('Many Faces',42000,32000,'death','mort-area');
 M['mirror-image']=ap('Mirror Image',35000,27000,'death','magic-blue');
 GAMEDATA.hunts['dark-thais']={name:'Dark Thais — Mirrored Nightmare',level:550,minLevel:550,cat:'hardcore',scene:'dark-thais',mapa:'dark-thais',monsters:['mirror-image','many-faces','knight-s-apparition','paladin-s-apparition','sorcerer-s-apparition','druid-s-apparition','monk-s-apparition'],avgHp:27000,avgExp:22000,avgDamage:950,avgArmor:85,avgGold:150,respawn:.7,pack:10,packMin:8,packMax:10,influencedMul:2,fiendishMul:2,color:'#38274e'};
 window.soulwarOpenBag=function(p){const pool=['soul-bastion','soulbleeder','soulcrusher','soulmaimer','soulshredder'];const item=pool[Math.floor(Math.random()*pool.length)]; if(p&&p.lootPouch){p.lootPouch[item]=(p.lootPouch[item]||0)+1;return item;}return null;};
})();
