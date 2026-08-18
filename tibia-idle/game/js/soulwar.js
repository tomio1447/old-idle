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
  // Rotten Wasteland + Goshnar's Hatred (items.xml do Canary).
  'roots':{n:'roots',cid:33938,w:.9},
  'crawler-s-essence':{n:"crawler's essence",cid:33982,w:.45},
  'mould-heart':{n:'mould heart',cid:34141,w:.75},
  'mould-robe':{n:'mould robe',cid:34148,w:1.8},
  'vial-of-hatred':{n:'vial of Hatred',cid:33927,w:1.1},
  'figurine-of-hatred':{n:'figurine of hatred',cid:34020,w:.44},
  'spectral-horseshoe':{n:'spectral horseshoe',cid:34072,w:1.2},
  'spectral-horse-tack':{n:'spectral horse tack',cid:34074,w:.8},
  'bracelet-of-strengthening':{n:'bracelet of strengthening',cid:34076,w:1.5},
  // Claustrophobic Inferno (items.xml do Canary).
  'hand':{n:'hand',cid:33936,w:1.2},
  'head':{n:'head',cid:33937,w:1.5},
  'diabolic-skull':{n:'diabolic skull',cid:34025,w:2.1},
  'infernal-heart':{n:'infernal heart',cid:34139,w:.75},
  'infernal-robe':{n:'infernal robe',cid:34146,w:1.8},
  // Ebb and Flow (items.xml do Canary).
  'jaws':{n:'jaws',cid:34014,w:2},
  'rod':{n:'rod',cid:33929,w:1.5},
  'goblet-of-gloom':{n:'goblet of gloom',cid:34022,w:1.5},
  'capricious-heart':{n:'capricious heart',cid:34138,w:.75},
  'capricious-robe':{n:'capricious robe',cid:34145,w:1.8},
  'hazardous-heart':{n:'hazardous heart',cid:34140,w:.75},
  'hazardous-robe':{n:'hazardous robe',cid:34147,w:1.8},
  'red-crystal-fragment':{n:'red crystal fragment',cid:16126,w:.15},
  'onyx-chip':{n:'onyx chip',cid:22193,w:.2},
  'magma-amulet':{n:'magma amulet',cid:817,w:5},
  'ring-of-green-plasma':{n:'ring of green plasma',cid:23532,w:.9},
  'warrior-s-axe':{n:"warrior's axe",cid:14040,w:88},
  // Ebb and Flow + Goshnar's Spite (items.xml do Canary).
  'figurine-of-spite':{n:'figurine of Spite',cid:33952,w:.44},
  'spites-spirit':{n:"Spite's spirit",cid:33926,w:.8},
  'spite-s-spirit':{n:"Spite's spirit",cid:33926,w:.8},
  // Goshnar's Malice (items.xml do Canary).
  'malices-spine':{n:"Malice's spine",cid:33921,w:1.2},
  'malice-s-spine':{n:"Malice's spine",cid:33921,w:1.2},
  'malices-horn':{n:"Malice's horn",cid:33920,w:1.1},
  'malice-s-horn':{n:"Malice's horn",cid:33920,w:1.1},
  'figurine-of-malice':{n:'figurine of Malice',cid:34018,w:.44},
  // Goshnar's Cruelty + Megalomania (items.xml do Canary).
  'cruelty-s-claw':{n:"Cruelty's claw",cid:33922,w:1.1},
  'cruelty-s-chest':{n:"Cruelty's chest",cid:33923,w:1.4},
  'figurine-of-cruelty':{n:'figurine of Cruelty',cid:34019,w:.44},
  'figurine-of-megalomania':{n:'figurine of Megalomania',cid:33953,w:.44},
  'megalomania-s-skull':{n:"Megalomania's skull",cid:33925,w:1.1},
  'megalomania-s-essence':{n:"Megalomania's essence",cid:33928,w:.8},
 };
 // sell/npcSell ficam a cargo de yasir-prices.js (Yasir/TibiaWiki). Aqui só
 // garante metadados (nome/cid/peso) sem sobrescrever preço NPC já aplicado.
 for(const slug in serverLootItems){
  if(!I[slug]) I[slug]=Object.assign({s:null,t:'loot',sell:0,npcSell:0},serverLootItems[slug]);
  else{
   const src=serverLootItems[slug];
   if(src.cid&&!I[slug].cid) I[slug].cid=src.cid;
   if(src.n&&!I[slug].n) I[slug].n=src.n;
   if(src.w!=null&&I[slug].w==null) I[slug].w=src.w;
  }
 }
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
 // Dano nerfado −30% (pedido de balanceamento Soul War, igual ao aplicado
 // em canarymonsters.json/monsterdata.js para as 4 hunts da zona).
 const apparition=(name, element, skills)=>({name,hp:25000,exp:28600,damage:910,armor:100,defense:100,mitigation:3.34,element,attackSpeed:2000,resist:{physical:0,energy:0,earth:0,fire:-5,ice:30,holy:50,death:-30},skills,loot:loot.slice()});
 const iceHoly=(iceA, holyA, extra)=>[
  {el:'ice',min:iceA[0],max:iceA[1],int:3000,ch:31,range:7,radius:4,fx:'big-clouds',miss:'ice'},
  {el:'ice',min:735,max:910,int:9500,ch:37,range:7,chain:3,fx:'ice-attack',miss:'ice'},
  {el:'holy',min:holyA[0],max:holyA[1],int:4000,ch:55,range:7,fx:'holy-damage',miss:'holy'},
  {el:'holy',min:875,max:980,int:3000,ch:23,radius:4,fx:'holy-area'},
 ].concat(extra||[]);
 M['knight-s-apparition']=apparition("Knight's Apparition",'ice',iceHoly([588,700],[735,910],[{el:'physical',min:595,max:700,int:3000,ch:19,radius:4,fx:'groundshaker'}]));
 M['paladin-s-apparition']=apparition("Paladin's Apparition",'ice',iceHoly([588,700],[735,910],[{el:'physical',min:630,max:945,int:4000,ch:23,range:7,fx:'explosion-hit',miss:'explosion'}]));
 M['sorcerer-s-apparition']=apparition("Sorcerer's Apparition",'ice',iceHoly([756,910],[770,875],[{el:'ice',min:770,max:910,int:5000,ch:34,range:7,chain:3,fx:'big-clouds',miss:'ice'}]));
 M['druid-s-apparition']=apparition("Druid's Apparition",'ice',iceHoly([756,910],[770,875]));
 M['monk-s-apparition']=apparition("Monk's Apparition",'ice',iceHoly([756,910],[770,875]));
 M['many-faces']={name:'Many Faces',hp:30000,exp:18870,damage:910,armor:105,defense:105,mitigation:3.34,element:'ice',attackSpeed:2000,resist:{physical:0,energy:0,earth:0,fire:-5,ice:30,holy:50,death:-30},skills:[{el:'ice',min:854,max:980,int:4000,ch:33,range:7,fx:'ice-attack',miss:'ice'},{el:'ice',min:700,max:1015,int:5000,ch:44,range:7,radius:5,fx:'ice-area',miss:'ice'},{el:'holy',min:735,max:910,int:9500,ch:59,radius:4,fx:'holy-area'},{el:'holy',min:805,max:910,int:10000,ch:59,range:7,chain:4,fx:'holy-damage',miss:'holy'}],loot:loot.slice()};
 GAMEDATA.hunts['dark-thais']={name:'Dark Thais — Mirrored Nightmare',level:550,minLevel:550,cat:'hardcore',scene:'dark-thais',mapa:'dark-thais',otbm:'mirrored_nightmare_sw',otbmFloor:7,otbmFovBounds:{x:1014,y:1013,w:19,h:15,z:7},otbmFovWidth:20,otbmFovHeight:12,otbmRuntimeWidth:30,otbmRuntimeHeight:30,otbmSpawn:{x:1018,y:1020,z:7},otbmMobBounds:{x:1016,y:1019,w:8,h:8,z:7},monsters:['many-faces','knight-s-apparition','paladin-s-apparition','sorcerer-s-apparition','druid-s-apparition','monk-s-apparition','distorted-phantom'],avgHp:26857,avgExp:21553,avgDamage:695,avgArmor:87,avgGold:150,respawn:.7,pack:10,packMin:8,packMax:10,influencedMul:2,fiendishMul:2,color:'#38274e',soulWarZone:true,soulWarZoneMonster:'many-faces'};

 // Os dados gerados já vêm dos mesmos monster.lua do Canary. Estes ajustes
 // preservam detalhes dos spells nomeados que o import genérico não infere:
 // melee é físico; Poison Chain é earth; Extended Holy Chain é holy.
 for(const slug of ['rotten-golem','branchy-crawler','mould-phantom'])if(M[slug])M[slug].element='physical';
 const rottenPoison=(M['rotten-golem']&&M['rotten-golem'].skills||[]).find(s=>s.n==='poison chain');
 if(rottenPoison)Object.assign(rottenPoison,{el:'earth',chain:3,fx:'energy-shock-green',range:7});
 for(const slug of ['rotten-golem','branchy-crawler']){
  const root=(M[slug]&&M[slug].skills||[]).find(s=>s.n==='root');
  // Canary root.lua: CONDITION_ROOTED 3000ms, CONST_ME_ROOTS, needTarget.
  // chance=1 no .lua (1% a cada 2s) — mantido; pack faz o root aparecer.
  if(root) Object.assign(root,{
   fx:'rooting-effect', range:root.range||7, alvo:1,
   ch:Math.max(1, Number(root.ch)||1),
  });
 }
 const mouldPoison=(M['mould-phantom']&&M['mould-phantom'].skills||[]).find(s=>s.n==='poison chain');
 if(mouldPoison)Object.assign(mouldPoison,{el:'earth',chain:3,fx:'energy-shock-green',range:7});
 const mouldHoly=(M['mould-phantom']&&M['mould-phantom'].skills||[]).find(s=>s.n==='extended holy chain');
 if(mouldHoly)Object.assign(mouldHoly,{el:'holy',chain:3,fx:'holy-damage',range:7});
 const hatredCloud=(M['goshnar-s-hatred']&&M['goshnar-s-hatred'].skills||[]).find(s=>s.n==='singlecloudchain');
 if(hatredCloud)Object.assign(hatredCloud,{el:'energy',fx:'energy-area'});
 const hatredLoot=(M['goshnar-s-hatred']&&M['goshnar-s-hatred'].loot)||[];
 const hatredMin={'crystal-coin':70,'bullseye-potion':10,'mastermind-potion':10,
  'transcendence-potion':10,'berserk-potion':10,'ultimate-mana-potion':50,
  'supreme-health-potion':50,'ultimate-spirit-potion':50};
 for(const drop of hatredLoot)if(hatredMin[drop.item])drop.min=hatredMin[drop.item];
 const spiteCloud=(M['goshnar-s-spite']&&M['goshnar-s-spite'].skills||[]).find(s=>s.n==='singlecloudchain');
 if(spiteCloud)Object.assign(spiteCloud,{el:'energy',fx:'energy-area'});
 const spiteLoot=(M['goshnar-s-spite']&&M['goshnar-s-spite'].loot)||[];
 const spiteMin={'crystal-coin':70,'bullseye-potion':10,'mastermind-potion':10,
  'berserk-potion':10,'ultimate-mana-potion':50,'supreme-health-potion':50,
  'ultimate-spirit-potion':50};
 for(const drop of spiteLoot)if(spiteMin[drop.item])drop.min=spiteMin[drop.item];
 const maliceLoot=(M['goshnar-s-malice']&&M['goshnar-s-malice'].loot)||[];
 const maliceMin={'crystal-coin':70,'bullseye-potion':10,'mastermind-potion':10,
  'transcendence-potion':10,'berserk-potion':10,'ultimate-mana-potion':50,
  'supreme-health-potion':50,'ultimate-spirit-potion':50};
 for(const drop of maliceLoot)if(maliceMin[drop.item])drop.min=maliceMin[drop.item];
 // Megalomania: Bag You Desire com 50% a mais que os mini-bosses (0.1% → 0.15%).
 const MEGA_BAG_CHANCE=0.15;
 for(const slug of ['goshnar-s-megalomania-green','goshnar-s-megalomania-blue']){
  const megaLoot=(M[slug]&&M[slug].loot)||[];
  const megaMin={'crystal-coin':70,'bullseye-potion':10,'mastermind-potion':10,
   'berserk-potion':10,'ultimate-mana-potion':50,'supreme-health-potion':50,
   'ultimate-spirit-potion':50};
  for(const drop of megaLoot){
   if(megaMin[drop.item])drop.min=megaMin[drop.item];
   if(drop.item==='bag-you-desire')drop.chance=MEGA_BAG_CHANCE;
  }
 }

 // Mapa completo é mantido como mundo runtime 30×30. Os bounds descrevem
 // a FOV/source do arquivo entregue, não um crop do OTBM.
 // Rooted (CONDITION_ROOTED / Canary root.lua) via spell "root" dos golems.
 GAMEDATA.hunts['rotten-wasteland']={
  name:'Rotten Wasteland',level:400,minLevel:400,cat:'hardcore',scene:'soulwar',
  otbm:'rotten_wasteland',otbmFloor:7,
  otbmFovBounds:{x:1040,y:1012,w:21,h:15,z:7},otbmFovWidth:21,otbmFovHeight:13,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1045,y:1022,z:7},otbmMobBounds:{x:1047,y:1017,w:12,h:7,z:7},
  monsters:['rotten-golem','branchy-crawler','mould-phantom'],
  avgHp:27667,avgExp:18017,avgDamage:653,avgArmor:103,avgGold:170,
  respawn:.7,pack:10,packMin:8,packMax:10,influencedMul:2,fiendishMul:2,
  color:'#54652d',soulWarZone:true,soulWarZoneMonster:'rotten-golem',
  soulWarRoot:true,
 };

 // Ebb and Flow — beta-maps/ebb&flow.otbm → maps/ebb_and_flow.otbm.
 // OTBM z=7 (1041,1004)..(1067,1027) 27×24, mundo runtime 30×30.
 // Câmera no padrão da Mirrored Nightmare (20×12): mais zoom-in que a
 // clássica 21×13 (a FOV 27×24 antiga gerava barras pretas e faixa escura
 // da moldura void). Spawn/zonas continuam nos mesmos lugares: spawn no
 // centro da sala (1052,1016); zona (1048,1012)..(1059,1020).
 // Monstros oficiais (TibiaWiki): Bony Sea Devil, Capricious Phantom,
 // Hazardous Phantom, Turbulent Elemental. Fear nos hits; 15× → Greed.
 if(M['capricious-phantom']) M['capricious-phantom'].targetDistance=4;
 if(M['hazardous-phantom']) M['hazardous-phantom'].targetDistance=4;
 for(const slug of ['bony-sea-devil','capricious-phantom','hazardous-phantom']){
  const iceChain=(M[slug]&&M[slug].skills||[])
   .find(s=>String(s.n||'').toLowerCase()==='ice chain');
  if(iceChain) Object.assign(iceChain,{el:'ice',chain:3,range:7,fx:'ice-attack'});
 }
 // Wiki: só Turbulent Elemental NÃO causa Fear. Boost nos outros três.
 for(const slug of ['bony-sea-devil','capricious-phantom','hazardous-phantom']){
  if(!M[slug]) continue;
  M[slug].skills=M[slug].skills||[];
  let fear=M[slug].skills.find(s=>String(s.n||'').toLowerCase()==='soulwars fear');
  if(!fear){
   fear={n:'soulwars fear',el:'physical',ch:15,alvo:1,range:7,min:0,max:0};
   M[slug].skills.push(fear);
  }else Object.assign(fear,{ch:Math.max(Number(fear.ch)||0,15),alvo:1,range:fear.range||7});
 }
 GAMEDATA.hunts['ebb-and-flow']={
  name:'Ebb and Flow',level:400,minLevel:400,cat:'hardcore',scene:'soulwar',
  otbm:'ebb_and_flow',otbmFloor:7,
  otbmFovBounds:{x:1041,y:1004,w:27,h:24,z:7},
  otbmFovWidth:20,otbmFovHeight:12,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1052,y:1016,z:7},
  otbmMobBounds:{x:1048,y:1012,w:12,h:9,z:7},
  monsters:['bony-sea-devil','capricious-phantom','hazardous-phantom','turbulent-elemental'],
  avgHp:38000,avgExp:31048,avgDamage:665,avgArmor:101,avgGold:170,
  respawn:.7,pack:10,packMin:8,packMax:10,influencedMul:2,fiendishMul:2,
  color:'#2d5565',soulWarZone:true,soulWarZoneMonster:'bony-sea-devil',
  soulWarFear:true,
 };

 // Claustrophobic Inferno — beta-maps/claustrophobic inferno.otbm →
 // maps/claustrophobic_inferno.otbm. OTBM z=7 (1042,1008)..(1067,1026) 26×19.
 // Câmera no padrão da Mirrored Nightmare (20×12): a FOV da sala inteira
 // (26×19) deixava o mapa com zoom-out excessivo. Spawn (1050,1016) e
 // zona de monstros (1048,1014)..(1059,1022) continuam nos mesmos lugares.
 for(const slug of ['brachiodemon','infernal-demon']) if(M[slug]) M[slug].element='physical';
 if(M['infernal-phantom']){
  M['infernal-phantom'].element='fire';
  M['infernal-phantom'].targetDistance=4;
 }
 const infernalChain=(M['infernal-phantom']&&M['infernal-phantom'].skills||[])
  .find(s=>s.n==='extended fire chain');
 if(infernalChain) Object.assign(infernalChain,{el:'fire',chain:3,range:7,fx:'fire-area'});
 const infernalDeathChain=(M['infernal-demon']&&M['infernal-demon'].skills||[])
  .find(s=>s.n==='death chain');
 if(infernalDeathChain) Object.assign(infernalDeathChain,{el:'death',chain:3,fx:'mort-area',range:7});
 GAMEDATA.hunts['claustrophobic-inferno']={
  name:'Claustrophobic Inferno',level:400,minLevel:400,cat:'hardcore',scene:'soulwar',
  otbm:'claustrophobic_inferno',otbmFloor:7,
  otbmFovBounds:{x:1042,y:1008,w:26,h:19,z:7},
  otbmFovWidth:20,otbmFovHeight:12,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1050,y:1016,z:7},
  otbmMobBounds:{x:1048,y:1014,w:12,h:9,z:7},
  monsters:['brachiodemon','infernal-demon','infernal-phantom'],
  avgHp:27667,avgExp:16323,avgDamage:747,avgArmor:107,avgGold:170,
  respawn:.7,pack:10,packMin:8,packMax:10,influencedMul:2,fiendishMul:2,
  color:'#6a2a1a',soulWarZone:true,soulWarZoneMonster:'brachiodemon',
 };

 // Bossroom Canary: beta-maps/bossesroom/goshnars_hatred_room.otbm publicado
 // como maps/goshnars_hatred_room.otbm. OTBM z=7 (1042,1009)..(1063,1026)
 // 22×18 → mundo runtime 30×30.
 // Spawns: player sul (1052,1023), boss centro-norte (1052,1017).
 // FOV câmera 22×15: cobre a sala e a distância player↔boss.
 GAMEDATA.hunts['goshnars-hatred-room']={
  name:"Goshnar's Hatred Room",hidden:true,level:400,minLevel:400,
  cat:'boss-room',scene:'soulwar',otbm:'goshnars_hatred_room',otbmFloor:7,
  otbmFovBounds:{x:1042,y:1009,w:22,h:18,z:7},
  otbmFovWidth:22,otbmFovHeight:15,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1052,y:1023,z:7},
  otbmMobBounds:{x:1052,y:1017,w:1,h:1,z:7},
  monsters:['goshnar-s-hatred','dreadful-harvester','hateful-soul'],
  avgHp:300000,avgExp:75000,avgDamage:5000,avgArmor:160,avgGold:100,
  respawn:1,pack:1,soulWarZone:true,soulWarZoneMonster:'rotten-golem',
 };

 // Bossroom Canary: beta-maps/bossesroom/goshnars_greed_room.otbm publicado
 // como maps/goshnars_greed_room.otbm. OTBM z=7 (1042,1009)..(1063,1026)
 // 22×18 → mundo runtime 30×30.
 // Spawns: player sul (1053,1023), boss norte (1053,1012).
 // FOV câmera 22×15: cobre a sala e a distância player↔boss.
 GAMEDATA.hunts['goshnars-greed-room']={
  name:"Goshnar's Greed Room",hidden:true,level:550,minLevel:550,
  cat:'boss-room',scene:'soulwar',otbm:'goshnars_greed_room',otbmFloor:7,
  otbmFovBounds:{x:1042,y:1009,w:22,h:18,z:7},
  otbmFovWidth:22,otbmFovHeight:15,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1053,y:1023,z:7},
  otbmMobBounds:{x:1053,y:1012,w:1,h:1,z:7},
  monsters:['goshnar-s-greed','dreadful-harvester','soulsnatcher','greedbeast','powerful-soul'],
  avgHp:300000,avgExp:150000,avgDamage:1800,avgArmor:120,avgGold:100,
  respawn:1,pack:1,soulWarZone:true,soulWarZoneMonster:'many-faces',
 };

 // Bossroom Canary: beta-maps/bossesroom/goshnar_spite_room.otbm publicado
 // como maps/goshnars_spite_room.otbm. OTBM z=7 (1040,1011)..(1063,1029)
 // 24×19 → mundo runtime 30×30.
 // Spawns Map Editor: player oeste (1046,1020), boss leste (1057,1020).
 // FOV câmera 22×13: cobre a largura útil da câmara (~22 SQM) e a distância
 // player↔boss (11 SQM), sem zoom excessivo; o mapa integral continua 24×19.
 GAMEDATA.hunts['goshnars-spite-room']={
  name:"Goshnar's Spite Room",hidden:true,level:400,minLevel:400,
  cat:'boss-room',scene:'soulwar',otbm:'goshnars_spite_room',otbmFloor:7,
  otbmFovBounds:{x:1040,y:1011,w:24,h:19,z:7},
  otbmFovWidth:22,otbmFovHeight:13,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1046,y:1020,z:7},
  otbmMobBounds:{x:1057,y:1020,w:1,h:1,z:7},
  monsters:['goshnar-s-spite','dreadful-harvester','spiteful-spitter','weeping-soul'],
  avgHp:300000,avgExp:75000,avgDamage:5000,avgArmor:160,avgGold:100,
  respawn:1,pack:1,soulWarZone:true,soulWarZoneMonster:'bony-sea-devil',
 };

 // Bossroom Canary: beta-maps/bossesroom/goshars_malice_room.otbm (typo
 // goshars no arquivo entregue) publicado como maps/goshars_malice_room.otbm.
 // OTBM z=7 (1040,1009)..(1063,1030) 24×22 → mundo runtime 30×30.
 // Arena circular ~17–19 Ø centrada ~1052,1020,7.
 // Spawns Map Editor: player oeste (1046,1020), boss leste (1057,1020).
 // FOV câmera 22×15: segue o player; cobre a câmara mármore e a distância
 // player↔boss (11 SQM); o mapa integral continua 24×22.
 GAMEDATA.hunts['goshnars-malice-room']={
  name:"Goshnar's Malice Room",hidden:true,level:400,minLevel:400,
  cat:'boss-room',scene:'soulwar',otbm:'goshars_malice_room',otbmFloor:7,
  otbmFovBounds:{x:1040,y:1009,w:24,h:22,z:7},
  otbmFovWidth:22,otbmFovHeight:15,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1046,y:1020,z:7},
  otbmMobBounds:{x:1057,y:1020,w:1,h:1,z:7},
  monsters:['goshnar-s-malice','dreadful-harvester','malicious-soul'],
  avgHp:300000,avgExp:75000,avgDamage:5000,avgArmor:160,avgGold:100,
  respawn:1,pack:1,soulWarZone:true,soulWarZoneMonster:'dreadful-harvester',
 };

 // Bossroom Canary: maps/goshnars_megalomania.otbm (z=7 24×21,
 // (1039,1010)..(1062,1030)). Spawns Map Editor: player (1051,1022),
 // boss (1051,1014). FOV 22×15 cobre a arena circular de areia.
 GAMEDATA.hunts['goshnars-megalomania-room']={
  name:"Goshnar's Megalomania Room",hidden:true,level:400,minLevel:400,
  cat:'boss-room',scene:'soulwar',otbm:'goshnars_megalomania',otbmFloor:7,
  otbmFovBounds:{x:1039,y:1010,w:24,h:21,z:7},
  otbmFovWidth:22,otbmFovHeight:15,
  otbmRuntimeWidth:30,otbmRuntimeHeight:30,
  otbmSpawn:{x:1051,y:1022,z:7},
  otbmMobBounds:{x:1051,y:1014,w:1,h:1,z:7},
  monsters:['goshnar-s-megalomania-purple','goshnar-s-megalomania-green',
   'goshnar-s-megalomania-blue','aspect-of-power'],
  avgHp:620000,avgExp:3000000,avgDamage:2500,avgArmor:55,avgGold:100,
  respawn:1,pack:1,soulWarZone:true,soulWarZoneMonster:'aspect-of-power',
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
/* Texto oficial (PT) das penalidades — só as máculas ativas (1..level). */
const SOULWAR_TAINT_PENALTIES=[
 '10% de chance de uma criatura teleportar perto de você',
 '0,5% de chance de uma nova criatura surgir perto de você se você atingir outra criatura',
 'dano recebido aumentado em 15%',
 '10% de chance de uma criatura se curar completamente em vez de morrer',
 'perda de 10% dos seus pontos de vida e da sua mana a cada 10 segundos',
];
function soulwarTaintTooltip(p){
 const level=soulwarTaintLevel(p);if(!level)return '';
 const word=level===1?'penalidade':'penalidades';
 const items=SOULWAR_TAINT_PENALTIES.slice(0,level).map((t)=>`<li>${t}</li>`).join('');
 const exp=Math.round((SOULWAR_TAINTS[level-1].exp-1)*1000)/10;
 return `<div class="tt-taint-head">Se você está nas covas do Goshnar, você sofre ${level} ${word}:</div>`+
  `<ul class="tt-taint-list">${items}</ul>`+
  `<div class="tt-taint-exp">EXP +${exp}%</div>`;
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
/* Megalomania exige as 5 máculas ativas (todos os mini-bosses Soul War).
 * TEMP TEST: remove before release — MEGA_TEST_BYPASS libera o pré-requisito. */
function soulwarHasAllBossTaints(p){
 // TEMP TEST: remove before release
 if(typeof MEGA_TEST_BYPASS!=="undefined"&&MEGA_TEST_BYPASS)return true;
 const st=soulwarTaintState(p);if(!st||soulwarTaintLevel(p)<5)return false;
 for(let i=0;i<SOULWAR_TAINT_BOSSES.length;i++)
  if(!st.bosses[SOULWAR_TAINT_BOSSES[i]])return false;
 return true;
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
const GREEDBEAST_SPAWN_CHANCE=.60;
const GREED_VULNERABLE_MS=40000;

function greedBossFight(c){return !!(c&&c.boss&&c.boss.id===GOSHNAR_GREED_ID);}
function greedBossMob(c){return c&&c.mobs?c.mobs.find((m)=>m&&m.boss):null;}
function greedBossAdds(c){return (c&&c.mobs||[]).filter((m)=>m&&!m.boss&&m.hp>0);}
function greedMinigameElement(){return typeof document!=='undefined'?document.getElementById('greed-minigame'):null;}
function greedRenderMinigame(c){
 const el=greedMinigameElement();if(!el||!c||!c.greed)return;
 if(!c.greed.immune){el.style.display='none';el.innerHTML='';return;}
 el.style.display='block';
 el.innerHTML=`GOSHNAR ESTÁ IMUNE — GREEDBEASTS <b>${c.greed.greedbeastKills}/${GREED_KILLS_TO_OPEN}</b><small>Mate Greedbeasts para abrir 40 segundos de vulnerabilidade</small>`;
}
function greedHideMinigame(){const el=greedMinigameElement();if(el){el.style.display='none';el.innerHTML='';}}
function greedRandomIndex(length,randomFn){
 const r=Math.max(0,Math.min(.999999,(randomFn||Math.random)()));
 return Math.min(length-1,Math.floor(r*length));
}
function greedRandomAddSlug(randomFn){
 const r=Math.max(0,Math.min(.999999,(randomFn||Math.random)()));
 if(r<GREEDBEAST_SPAWN_CHANCE)return 'greedbeast';
 const others=['dreadful-harvester','soulsnatcher','powerful-soul'];
 return others[Math.min(2,Math.floor(((r-GREEDBEAST_SPAWN_CHANCE)/(1-GREEDBEAST_SPAWN_CHANCE))*3))];
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
 // Os adds desta mecânica nascem sem defesa, mitigation, resistências ou
 // imunidades; preservam apenas HP, dano e o conjunto oficial de magias.
 const addDef=Object.assign({},def,{armor:0,defense:0,mitigation:0,resist:{},imune:[]});
 const mob={slug,def:addDef,hp:addDef.hp,maxHp:addDef.hp,
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
  const slug=greedRandomAddSlug(randomFn);
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
 greedFillAdds(c,c.greed.randomFn);greedRenderMinigame(c);
 if(typeof addLog==='function')
  addLog('death',"Goshnar's Greed está imune. Mate <b>5 Greedbeasts</b> para abrir 20s de vulnerabilidade.");
 return c;
}
function greedStartVulnerability(c,now){
 const st=c.greed,boss=greedBossMob(c); if(!st||!boss)return false;
 st.immune=false;st.greedbeastKills=0;st.vulnerableUntil=now+GREED_VULNERABLE_MS;
 boss.greedImmune=false;greedSortTargets(c);greedHideMinigame();
 c.events.push({t:'effect',x:boss.x,y:boss.y,screen:true,fx:'magic-green'});
 if(typeof addLog==='function')addLog('level',"5 Greedbeasts derrotados — Goshnar está <b>VULNERÁVEL por 40s</b>!");
 if(typeof toast==='function')toast("Goshnar's Greed vulnerável por 40 segundos!",'level');
 return true;
}
function greedBossHandleKill(c,mob,now){
 if(!greedBossFight(c)||!c.greed||!mob||mob.slug!=='greedbeast'||!c.greed.immune)return false;
 c.greed.greedbeastKills++;
 if(typeof addLog==='function')addLog('info',`Greedbeasts: <b>${c.greed.greedbeastKills}/${GREED_KILLS_TO_OPEN}</b>`);
 greedRenderMinigame(c);
 if(c.greed.greedbeastKills>=GREED_KILLS_TO_OPEN)return greedStartVulnerability(c,now||Date.now());
 return true;
}
function greedBossAfterDeaths(c){if(greedBossFight(c))greedSortTargets(c);}
function greedBossTick(c,now){
 if(!greedBossFight(c)||!c.greed)return true;
 const st=c.greed,boss=greedBossMob(c); if(!boss||boss.hp<=0)return true;
 if(!st.immune){
  if(now<st.vulnerableUntil){greedSortTargets(c);return true;}
  st.immune=true;st.vulnerableUntil=0;st.nextSpawnAt=now;boss.greedImmune=true;greedRenderMinigame(c);
  if(typeof addLog==='function')addLog('death',"A vulnerabilidade acabou — Goshnar's Greed está imune novamente.");
 }
 if(now>=st.nextSpawnAt){greedFillAdds(c,st.randomFn);st.nextSpawnAt=now+1500;}
 greedSortTargets(c);return true;
}
function greedBossCanTakePlayerDamage(c,target){
 if(!greedBossFight(c)||!target||!target.boss)return true;
 // Se o init ainda não rodou, falhe fechado: Goshnar jamais começa vulnerável.
 return !!c.greed&&!c.greed.immune&&!target.greedImmune;
}
function greedBossOutgoingDamageMultiplier(c,mob){
 return greedBossFight(c)&&c.greed&&c.greed.immune&&mob&&mob.boss ? .7 : 1;
}
function greedBossCleanup(c){if(c&&c.greed)delete c.greed;greedHideMinigame();}

/* ------------------------------------------------ Goshnar's Hatred
 * Dread's Torment: ativa após 20–40s, soma um contador individual a cada
 * 5s e aumenta em 10% por ponto o dano de Hatred/Hateful Soul. */
const HATRED_MAX_SUMMONS=5;
const HATRED_COUNTER_TICK=5000;
function hatredBossFight(c){return !!(c&&c.boss&&c.boss.id==='goshnar-s-hatred');}
function hatredMinigameElement(){return typeof document!=='undefined'?document.getElementById('hatred-minigame'):null;}
function hatredHideMinigame(){const el=hatredMinigameElement();if(el){el.style.display='none';el.innerHTML='';}}
function hatredParticipants(c){
 if(c&&c.players&&c.players.length)return c.players.filter(e=>e&&e.p);
 if(c&&c._hatredPlayer)return [{id:c._hatredPlayer.id||'player',name:c._hatredPlayer.name||'Player',p:c._hatredPlayer}];
 return [];
}
function hatredPlayerKey(ent){return String((ent&&ent.id)||(ent&&ent.p&&ent.p.id)||'player');}
function hatredEnsureCounters(c){
 const counters=c.hatred.counters||(c.hatred.counters={});
 for(const ent of hatredParticipants(c)){const key=hatredPlayerKey(ent);if(counters[key]===undefined)counters[key]=0;}
 return counters;
}
function hatredCounterFor(c,p){
 if(!c||!c.hatred)return 0;const counters=hatredEnsureCounters(c);
 const ent=hatredParticipants(c).find(e=>e.p===p||String(e.id)===String(p&&p.id));
 return Math.max(0,counters[hatredPlayerKey(ent)]||0);
}
function hatredChangeAllCounters(c,delta,reset){
 if(!c||!c.hatred)return;const counters=hatredEnsureCounters(c);
 for(const key of Object.keys(counters))counters[key]=reset?0:Math.max(0,(counters[key]||0)+delta);
}
function hatredSummons(c){return (c&&c.mobs||[]).filter(m=>m&&m.hatredSummon&&m.hp>0);}
function hatredRandomSummonSlug(randomFn){return (randomFn||Math.random)()<.10?'hateful-soul':'dreadful-harvester';}
function hatredCreateSummon(c,slug,randomFn,now){
 const base=GAMEDATA.monsters&&GAMEDATA.monsters[slug];
 const cells=typeof greedFreeCells==='function'?greedFreeCells(c):[];if(!base||!cells.length)return null;
 const rnd=randomFn||Math.random,cell=cells[Math.floor(rnd()*cells.length)%cells.length];
 const hp=slug==='hateful-soul'?50000:15000;
 const def=Object.assign({},base,{hp,exp:0,loot:[]});
 const pos=typeof cellToScreen==='function'?cellToScreen(cell.x,cell.y):
  {x:(cell.x+.5)/(c.gridW||30),y:(cell.y+.5)/(c.gridH||30)};
 const mob={slug,def,hp,maxHp:hp,hatredSummon:true,atkCd:400+rnd()*1200,
  id:'hatred-add-'+now.toString(36)+'-'+Math.random().toString(36).slice(2,7),
  cx:cell.x,cy:cell.y,x:pos.x,y:pos.y,sx:pos.x,sy:pos.y,dir:'w',moving:false,
  attackAnim:0,speed:.000055,spawnAt:now};
 c.mobs.unshift(mob);c.events.push({t:'spawn',slug,x:mob.x,y:mob.y});return mob;
}
function hatredFillSummons(c,randomFn,now){
 if(!hatredBossFight(c)||!c.hatred)return 0;let made=0;
 while(hatredSummons(c).length<HATRED_MAX_SUMMONS){
  const slug=hatredRandomSummonSlug(randomFn);if(!hatredCreateSummon(c,slug,randomFn,now))break;made++;
 }
 if(made&&typeof resolveSQMOccupancy==='function')resolveSQMOccupancy(c);return made;
}
function hatredRenderMinigame(c,now){
 const el=hatredMinigameElement();if(!el||!c||!c.hatred)return;
 const st=c.hatred,summons=hatredSummons(c),dread=summons.filter(m=>m.slug==='dreadful-harvester').length;
 const hateful=summons.filter(m=>m.slug==='hateful-soul').length;
 const state=st.active?'MECÂNICA ATIVA':`ATIVA EM ${Math.max(0,Math.ceil((st.nextActivationAt-now)/1000))}s`;
 const rows=hatredParticipants(c).map(ent=>{const n=st.counters[hatredPlayerKey(ent)]||0;
  return `<div class="hatred-row"><span>${ent.name||ent.p.name||'Player'}</span><span class="hatred-count">${n} · +${n*10}% dano</span></div>`;}).join('');
 const renderKey=state+'|'+dread+'|'+hateful+'|'+rows;if(st.renderKey===renderKey)return;st.renderKey=renderKey;
 el.style.display='block';el.innerHTML=`<div class="hatred-title">GOSHNAR'S HATRED — ${state}</div>
  <div class="hatred-row"><b>Summons</b><span class="hatred-count">${summons.length}/${HATRED_MAX_SUMMONS}</span></div>
  <div class="hatred-row"><span>Dreadful Harvester</span><b>${dread}</b></div>
  <div class="hatred-row"><span>Hateful Soul</span><b>${hateful}</b></div>${rows}
  <small>Harvester morto: −1 contador · Hateful Soul morto: zera todos</small>`;
}
function hatredBossInit(c,player,randomFn,now){
 if(!hatredBossFight(c))return c;now=now||Date.now();const rnd=randomFn||Math.random;
 // Delay inicial 20–40s antes de Dread's Torment (summons + contadores).
 c._hatredPlayer=player;c.hatred={active:false,nextActivationAt:now+20000+Math.floor(rnd()*20001),
  nextCounterAt:0,counters:{},randomFn:rnd,startedAt:now};hatredEnsureCounters(c);
 const boss=(c.mobs||[]).find(m=>m&&m.boss);if(boss){boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;}
 hatredRenderMinigame(c,now);return c;
}
function hatredBossTick(c,now){
 now=now||Date.now();if(!hatredBossFight(c)||!c.hatred)return true;const st=c.hatred;
 const boss=(c.mobs||[]).find(m=>m&&m.boss&&m.hp>0);
 // Boss ainda no delay de arena: manter countdown, não ativar summons.
 if(!boss){
  if(typeof arenaBossSpawnPending==='function'&&arenaBossSpawnPending(c)){
   hatredRenderMinigame(c,now);return true;
  }
  hatredHideMinigame();return true;
 }
 hatredEnsureCounters(c);
 if(!st.active&&now>=st.nextActivationAt){
  st.active=true;st.nextCounterAt=now+HATRED_COUNTER_TICK;hatredFillSummons(c,st.randomFn,now);
  if(typeof addLog==='function')addLog('death',"Dread's Torment foi ativado. Elimine os summons para controlar o dano!");
 }
 while(st.active&&now>=st.nextCounterAt){
  for(const ent of hatredParticipants(c))if(ent.p&&ent.p.hp>0){const key=hatredPlayerKey(ent);st.counters[key]=(st.counters[key]||0)+1;}
  hatredFillSummons(c,st.randomFn,st.nextCounterAt);st.nextCounterAt+=HATRED_COUNTER_TICK;
 }
 hatredRenderMinigame(c,now);return true;
}
function hatredBossHandleKill(c,mob,now){
 if(!hatredBossFight(c)||!c.hatred||!mob||!mob.hatredSummon)return false;
 if(mob.slug==='hateful-soul'){
  hatredChangeAllCounters(c,0,true);
  if(typeof addLog==='function')addLog('level','Hateful Soul derrotada — todos os contadores foram zerados.');
 }else{
  hatredChangeAllCounters(c,-1,false);
  if(typeof addLog==='function')addLog('info','Dreadful Harvester derrotado — contadores reduzidos em 1.');
 }
 hatredRenderMinigame(c,now||Date.now());return true;
}
function hatredBossOutgoingDamageMultiplier(c,mob,p){
 if(!hatredBossFight(c)||!c.hatred||!mob)return 1;
 if(!mob.boss&&mob.slug!=='hateful-soul')return 1;
 return 1+hatredCounterFor(c,p)*.10;
}
function hatredBossCleanup(c){if(c){delete c.hatred;delete c._hatredPlayer;}hatredHideMinigame();}

/* ------------------------------------------------ Goshnar's Spite
 * Canary: searing fires (14s spawn / 5s stomp / +10 defense miss),
 * weeping-soul corpses (10% heal 10% maxHP), room trash.
 * Extra idle: bubble QTE a cada 40s — falha = −25% dano no boss até o
 * próximo QTE resolver (sucesso limpa; falha mantém/aplica). */
const GOSHNAR_SPITE_ID='goshnar-s-spite';
const SPITE_TRASH=['dreadful-harvester','spiteful-spitter','weeping-soul'];
const SPITE_MAX_TRASH=8;
const SPITE_TRASH_RESPAWN_MS=15000;
const SPITE_FIRE_INTERVAL=14000;
const SPITE_FIRE_TIMEOUT=5000;
const SPITE_FIRE_STOMP_CD=56000;
const SPITE_FIRE_DEFENSE=10;
const SPITE_HEAL_CHANCE=10;
const SPITE_HEAL_PCT=10;
const SPITE_QTE_INTERVAL=40000;
const SPITE_QTE_DURATION=5500;
const SPITE_QTE_BUBBLES=7;
const SPITE_QTE_FAIL_MUL=.75;
/* Pads absolutos (fonte OTBM z=7) em torno do boss em (1057,1020). */
const SPITE_FIRE_PADS=[
 {id:'N',x:1057,y:1016,z:7},{id:'W',x:1050,y:1020,z:7},
 {id:'E',x:1062,y:1020,z:7},{id:'S',x:1056,y:1025,z:7},
];

function spiteBossFight(c){return !!(c&&c.boss&&c.boss.id===GOSHNAR_SPITE_ID);}
function spiteBossMob(c){return c&&c.mobs?c.mobs.find((m)=>m&&m.boss):null;}
function spiteTrashMobs(c){return (c&&c.mobs||[]).filter((m)=>m&&m.spiteTrash&&m.hp>0);}
function spiteMinigameElement(){return typeof document!=='undefined'?document.getElementById('spite-minigame'):null;}
function spiteQteElement(){return typeof document!=='undefined'?document.getElementById('spite-qte'):null;}
function spiteHideMinigame(){const el=spiteMinigameElement();if(el){el.style.display='none';el.innerHTML='';}}
function spiteHideQte(){const el=spiteQteElement();if(el){el.style.display='none';el.innerHTML='';el.className='spite-qte';}}
function spiteRandomIndex(length,randomFn){
 const r=Math.max(0,Math.min(.999999,(randomFn||Math.random)()));
 return Math.min(length-1,Math.floor(r*length));
}
function spiteRandomTrashSlug(randomFn){
 return SPITE_TRASH[spiteRandomIndex(SPITE_TRASH.length,randomFn)];
}
function spitePadRuntime(c,pad){
 const hunt=c&&c.hunt,bounds=hunt&&hunt.otbmFovBounds;
 if(!bounds||!pad)return null;
 const ox=Number(bounds.x)||0,oy=Number(bounds.y)||0;
 const rw=Number(hunt.otbmRuntimeWidth)||30,rh=Number(hunt.otbmRuntimeHeight)||30;
 const fw=Number(bounds.w)||24,fh=Number(bounds.h)||19;
 const padX=Math.floor((rw-fw)/2),padY=Math.floor((rh-fh)/2);
 const lx=Number(pad.x)-ox,ly=Number(pad.y)-oy;
 if(lx<0||ly<0||lx>=fw||ly>=fh)return null;
 return {cx:padX+lx,cy:padY+ly,id:pad.id};
}
function spiteCreateTrash(c,slug,randomFn,now){
 const def=typeof GAMEDATA!=='undefined'&&GAMEDATA.monsters&&GAMEDATA.monsters[slug];
 const cells=typeof greedFreeCells==='function'?greedFreeCells(c):[];
 if(!def||!cells.length)return null;
 const rnd=randomFn||Math.random,cell=cells[spiteRandomIndex(cells.length,rnd)];
 const pos=typeof cellToScreen==='function'?cellToScreen(cell.x,cell.y):
  {x:(cell.x+.5)/(c.gridW||30),y:(cell.y+.5)/(c.gridH||30)};
 const mob={slug,def:Object.assign({},def),hp:def.hp,maxHp:def.hp,spiteTrash:true,
  atkCd:400+rnd()*1200,
  id:'spite-trash-'+now.toString(36)+'-'+Math.random().toString(36).slice(2,7),
  cx:cell.x,cy:cell.y,x:pos.x,y:pos.y,sx:pos.x,sy:pos.y,dir:'w',
  moving:false,attackAnim:0,speed:.000055,spawnAt:now};
 c.mobs.unshift(mob);
 if(c.events)c.events.push({t:'spawn',slug,x:mob.x,y:mob.y});
 return mob;
}
function spiteFillTrash(c,randomFn,now){
 if(!spiteBossFight(c)||!c.spite)return 0;
 let made=0;const rnd=randomFn||c.spite.randomFn||Math.random;
 while(spiteTrashMobs(c).length<SPITE_MAX_TRASH){
  if(!spiteCreateTrash(c,spiteRandomTrashSlug(rnd),rnd,now||Date.now()))break;
  made++;
 }
 if(made&&typeof resolveSQMOccupancy==='function')resolveSQMOccupancy(c);
 return made;
}
function spiteApplyDefenseBonus(boss,stacks){
 if(!boss||!boss.def)return;
 const baseArmor=Number(boss._spiteBaseArmor);
 const baseDefense=Number(boss._spiteBaseDefense);
 if(!Number.isFinite(baseArmor))boss._spiteBaseArmor=Number(boss.def.armor)||0;
 if(!Number.isFinite(baseDefense))boss._spiteBaseDefense=Number(boss.def.defense)||0;
 const n=Math.max(0,Number(stacks)||0);
 boss.def.armor=(Number(boss._spiteBaseArmor)||0)+n*SPITE_FIRE_DEFENSE;
 boss.def.defense=(Number(boss._spiteBaseDefense)||0)+n*SPITE_FIRE_DEFENSE;
 boss.spiteDefenseStacks=n;
}
function spiteSyncDamageMul(c){
 const boss=spiteBossMob(c);if(!boss||!c.spite)return;
 boss.spiteDamageTakenMul=c.spite.qtePenalty?SPITE_QTE_FAIL_MUL:1;
}
function spiteIncomingDamageMultiplier(c,target){
 if(!spiteBossFight(c)||!target||!target.boss||!c.spite)return 1;
 return c.spite.qtePenalty?SPITE_QTE_FAIL_MUL:1;
}
function spiteRenderMinigame(c,now){
 const el=spiteMinigameElement();if(!el||!c||!c.spite)return;
 const st=c.spite,trash=spiteTrashMobs(c);
 const fire=st.fire?`FOGO ${st.fire.id} — ${Math.max(0,Math.ceil((st.fire.expiresAt-now)/1000))}s`:'sem fogo';
 const qte=st.qtePhase==='active'?`QTE bolhas ${st.bubblesLeft||0}`:
  (st.qtePenalty?'penalidade −25% dano':'próximo QTE '+Math.max(0,Math.ceil((st.nextQteAt-now)/1000))+'s');
 const key=[trash.length,fire,qte,st.defenseStacks||0,!!st.qtePenalty].join('|');
 if(st.renderKey===key)return;st.renderKey=key;
 el.style.display='block';
 el.innerHTML=`<div class="spite-title">GOSHNAR'S SPITE</div>
  <div class="spite-row"><span>Trash</span><b>${trash.length}/${SPITE_MAX_TRASH}</b></div>
  <div class="spite-row"><span>Defesa extra</span><b>+${(st.defenseStacks||0)*SPITE_FIRE_DEFENSE}</b></div>
  <div class="spite-row"><span>Searing Fire</span><b>${fire}</b></div>
  <div class="spite-row"><span>Bubble QTE</span><b>${qte}</b></div>
  <small>Pise/estampe o fogo em 5s · QTE a cada 40s (−25% dano se falhar)</small>
  ${st.fire?`<button type="button" class="spite-stomp" data-spite-stomp="1">ESTAMPAR FOGO ${st.fire.id}</button>`:''}`;
 const btn=el.querySelector('[data-spite-stomp]');
 if(btn)btn.onclick=function(ev){ev.preventDefault();spiteStompFire(c,Date.now());};
}
function spiteRenderQte(c,now){
 const el=spiteQteElement();if(!el||!c||!c.spite||c.spite.qtePhase!=='active'){spiteHideQte();return;}
 const st=c.spite,left=Math.max(0,Math.ceil((st.qteUntil-now)/1000));
 el.style.display='block';el.className='spite-qte active';
 const bubbles=(st.bubbles||[]).map((b,i)=>b.popped?'':
  `<button type="button" class="spite-bubble" data-spite-bubble="${i}" style="left:${b.x}%;top:${b.y}%"></button>`).join('');
 el.innerHTML=`<div class="spite-qte-title">ESTOURE AS BOLHAS — ${left}s</div>
  <div class="spite-qte-board">${bubbles}</div>
  <div class="spite-qte-help">Clique em todas antes do tempo · falha = −25% dano no boss</div>`;
 el.querySelectorAll('[data-spite-bubble]').forEach((node)=>{
  node.onclick=function(ev){ev.preventDefault();spitePopBubble(c,Number(node.getAttribute('data-spite-bubble')),Date.now());};
 });
}
function spiteStartQte(c,now,randomFn){
 if(!spiteBossFight(c)||!c.spite)return false;
 const st=c.spite,rnd=randomFn||st.randomFn||Math.random;
 st.qtePhase='active';st.qteUntil=now+SPITE_QTE_DURATION;
 st.bubbles=[];st.bubblesLeft=SPITE_QTE_BUBBLES;
 for(let i=0;i<SPITE_QTE_BUBBLES;i++){
  st.bubbles.push({x:8+Math.floor(rnd()*84),y:10+Math.floor(rnd()*70),popped:false});
 }
 spiteRenderQte(c,now);spiteRenderMinigame(c,now);
 if(typeof addLog==='function')addLog('death',"Spite: estoure todas as bolhas!");
 if(c.events)c.events.push({t:'spite-qte',phase:'start',screen:true});
 return true;
}
function spiteResolveQte(c,success,now){
 const st=c&&c.spite;if(!st||st.qtePhase!=='active')return;
 st.qtePhase='idle';st.nextQteAt=(now||Date.now())+SPITE_QTE_INTERVAL;
 st.bubbles=[];st.bubblesLeft=0;delete st.qteUntil;
 if(success){
  st.qtePenalty=false;
  if(typeof addLog==='function')addLog('level','Bolhas estouradas — sem penalidade de dano.');
  if(typeof toast==='function')toast('Spite QTE sucesso!','level');
 }else{
  st.qtePenalty=true;
  if(typeof addLog==='function')addLog('death','QTE falhou — Spite toma 25% menos dano até o próximo QTE.');
  if(typeof toast==='function')toast('Spite QTE falhou (−25% dano)','death');
 }
 spiteSyncDamageMul(c);spiteHideQte();spiteRenderMinigame(c,now||Date.now());
 if(c.events)c.events.push({t:'spite-qte',result:success?'success':'fail',screen:true});
}
function spitePopBubble(c,index,now){
 const st=c&&c.spite;if(!st||st.qtePhase!=='active')return false;
 const bubble=st.bubbles&&st.bubbles[index];if(!bubble||bubble.popped)return false;
 // Online: envia intent; o servidor valida.
 if(typeof onlineAuthorityCombat==='function'&&onlineAuthorityCombat()&&c){
  c._spitePendingBubble=index;c._spitePendingBubbleAt=now||Date.now();
  return true;
 }
 bubble.popped=true;st.bubblesLeft=Math.max(0,(st.bubblesLeft||0)-1);
 if(st.bubblesLeft<=0)spiteResolveQte(c,true,now||Date.now());
 else spiteRenderQte(c,now||Date.now());
 return true;
}
function spiteSpawnFire(c,now,randomFn){
 const st=c.spite;if(!st)return false;
 const pad=SPITE_FIRE_PADS[spiteRandomIndex(SPITE_FIRE_PADS.length,randomFn||st.randomFn)];
 const runtime=spitePadRuntime(c,pad);
 st.fire={id:pad.id,expiresAt:now+SPITE_FIRE_TIMEOUT,cx:runtime&&runtime.cx,cy:runtime&&runtime.cy};
 if(c.events)c.events.push({t:'effect',x:runtime?((runtime.cx+.5)/(c.gridW||30)):.5,
  y:runtime?((runtime.cy+.5)/(c.gridH||30)):.5,screen:true,fx:'fire-area'});
 spiteRenderMinigame(c,now);return true;
}
function spiteMissFire(c,now){
 const st=c.spite,boss=spiteBossMob(c);if(!st||!st.fire)return;
 st.defenseStacks=(st.defenseStacks||0)+1;spiteApplyDefenseBonus(boss,st.defenseStacks);
 st.fire=null;st.nextFireAt=now+SPITE_FIRE_INTERVAL;
 if(typeof addLog==='function')addLog('death',"Searing Fire sumiu — Spite ganhou +"+SPITE_FIRE_DEFENSE+" defesa.");
 spiteRenderMinigame(c,now);
}
function spiteStompFire(c,now){
 const st=c&&c.spite;if(!st||!st.fire)return false;
 if(st.stompReadyAt&&now<st.stompReadyAt){
  if(typeof addLog==='function')addLog('info','Alma ainda recuperando do último estampe.');
  return false;
 }
 if(typeof onlineAuthorityCombat==='function'&&onlineAuthorityCombat()&&c){
  c._spitePendingStomp=true;c._spitePendingStompAt=now;return true;
 }
 st.fire=null;st.stompReadyAt=now+SPITE_FIRE_STOMP_CD;st.nextFireAt=now+SPITE_FIRE_INTERVAL;
 if(typeof addLog==='function')addLog('level','Searing Fire estampado a tempo!');
 spiteRenderMinigame(c,now);return true;
}
function spiteTryCorpseHeal(c,mob,randomFn){
 if(!spiteBossFight(c)||!c.spite||!mob||mob.slug!=='weeping-soul')return false;
 const boss=spiteBossMob(c);if(!boss||boss.hp<=0)return false;
 const rnd=randomFn||c.spite.randomFn||Math.random;
 // Canary: passo no cadáver — no idle o kill equivale a “passar” pelo corpo.
 if(Math.floor(rnd()*100)+1>SPITE_HEAL_CHANCE)return false;
 const heal=Math.floor(boss.maxHp*(SPITE_HEAL_PCT/100));
 boss.hp=Math.min(boss.maxHp,boss.hp+heal);
 if(c.events)c.events.push({t:'effect',x:boss.x,y:boss.y,screen:true,fx:'magic-blue'});
 if(typeof addLog==='function')addLog('death',"Lágrimas da Weeping Soul curaram Spite em "+heal+"!");
 return true;
}
function spiteBossInit(c,player,randomFn,now){
 if(!spiteBossFight(c))return c;
 now=now||Date.now();const rnd=randomFn||Math.random;
 const boss=spiteBossMob(c);
 c.spite={defenseStacks:0,qtePenalty:false,qtePhase:'idle',
  nextFireAt:now+SPITE_FIRE_INTERVAL,nextQteAt:now+SPITE_QTE_INTERVAL,
  fire:null,stompReadyAt:0,pendingRespawns:[],randomFn:rnd,startedAt:now};
 if(boss){
  boss._spiteBaseArmor=Number(boss.def&&boss.def.armor)||0;
  boss._spiteBaseDefense=Number(boss.def&&boss.def.defense)||0;
  boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
 }
 spiteFillTrash(c,rnd,now);spiteSyncDamageMul(c);spiteRenderMinigame(c,now);
 if(typeof addLog==='function')
  addLog('death',"Goshnar's Spite: estampe os fogos e prepare-se para as bolhas a cada 40s.");
 return c;
}
function spiteBossHandleKill(c,mob,now){
 if(!spiteBossFight(c)||!c.spite||!mob||!mob.spiteTrash)return false;
 now=now||Date.now();
 if(mob.slug==='weeping-soul')spiteTryCorpseHeal(c,mob,c.spite.randomFn);
 c.spite.pendingRespawns=c.spite.pendingRespawns||[];
 c.spite.pendingRespawns.push({at:now+SPITE_TRASH_RESPAWN_MS});
 spiteRenderMinigame(c,now);return true;
}
function spiteBossTick(c,now){
 now=now||Date.now();if(!spiteBossFight(c)||!c.spite)return true;
 const st=c.spite,boss=spiteBossMob(c);
 if(!boss||boss.hp<=0){
  if(typeof arenaBossSpawnPending==='function'&&arenaBossSpawnPending(c)){
   spiteRenderMinigame(c,now);return true;
  }
  spiteHideMinigame();spiteHideQte();return true;
 }
 // Trash: processa respawns agendados e completa até o teto de 8.
 st.pendingRespawns=(st.pendingRespawns||[]).filter((job)=>{
  if(now<job.at)return true;
  if(spiteTrashMobs(c).length<SPITE_MAX_TRASH)
   spiteCreateTrash(c,spiteRandomTrashSlug(st.randomFn),st.randomFn,now);
  return false;
 });
 if(spiteTrashMobs(c).length<SPITE_MAX_TRASH&&!(st.pendingRespawns||[]).length)
  spiteFillTrash(c,st.randomFn,now);
 // Searing fire
 if(st.fire&&now>=st.fire.expiresAt)spiteMissFire(c,now);
 else if(!st.fire&&now>=st.nextFireAt)spiteSpawnFire(c,now,st.randomFn);
 // Bubble QTE
 if(st.qtePhase==='active'){
  if(now>=st.qteUntil)spiteResolveQte(c,false,now);
  else spiteRenderQte(c,now);
 }else if(now>=st.nextQteAt)spiteStartQte(c,now,st.randomFn);
 spiteSyncDamageMul(c);spiteRenderMinigame(c,now);return true;
}
function spiteBossCleanup(c){
 if(c){delete c.spite;delete c._spitePendingBubble;delete c._spitePendingStomp;}
 spiteHideMinigame();spiteHideQte();
}
function spiteRenderOnline(c){
 if(!c||!c.spite){spiteHideMinigame();spiteHideQte();return;}
 const now=Date.now();
 if(c.spite.qtePhase==='active')spiteRenderQte(c,now);else spiteHideQte();
 spiteRenderMinigame(c,now);
}

/* ------------------------------------------------ Goshnar's Malice
 * Canary: createSoulWarWhiteTiles a cada 40s no onThink.
 * Idle: Maze QTE a cada 30s (matriz 30×30, azul→vermelho em 12s, blocos
 * vindo de cima e de baixo). Meta vermelha em posição aleatória.
 * Falha = 6000 death em todos os players (explosão
 * da maldição). Trash: Dreadful Harvester / Malicious Soul até 8,
 * respawn 20s. Sem CD de boss para testes. */
const GOSHNAR_MALICE_ID='goshnar-s-malice';
const MALICE_TRASH=['dreadful-harvester','malicious-soul'];
const MALICE_MAX_TRASH=8;
const MALICE_TRASH_RESPAWN_MS=20000;
const MALICE_QTE_INTERVAL=30000;
const MALICE_QTE_DURATION=12000;
const MALICE_QTE_SIZE=30;
const MALICE_QTE_FAIL_DMG=6000;
const MALICE_SLIDE_MS=140; // ~2× mais rápido que 280ms
const MALICE_BLOCK_COUNT=10;
const MALICE_GOAL_MIN_DIST=12;

function maliceBossFight(c){return !!(c&&c.boss&&c.boss.id===GOSHNAR_MALICE_ID);}
function maliceBossMob(c){return c&&c.mobs?c.mobs.find((m)=>m&&m.boss):null;}
function maliceTrashMobs(c){return (c&&c.mobs||[]).filter((m)=>m&&m.maliceTrash&&m.hp>0);}
function maliceMinigameElement(){return typeof document!=='undefined'?document.getElementById('malice-minigame'):null;}
function maliceQteElement(){return typeof document!=='undefined'?document.getElementById('malice-qte'):null;}
function maliceHideMinigame(){const el=maliceMinigameElement();if(el){el.style.display='none';el.innerHTML='';}}
function maliceHideQte(){
 const el=maliceQteElement();if(el){el.style.display='none';el.innerHTML='';el.className='malice-qte';}
 if(typeof document!=='undefined'&&document._maliceKeyHandler){
  document.removeEventListener('keydown',document._maliceKeyHandler,true);
  document.removeEventListener('keydown',document._maliceKeyHandler,false);
  document._maliceKeyHandler=null;
 }
}
function maliceRandomIndex(length,randomFn){
 const r=Math.max(0,Math.min(.999999,(randomFn||Math.random)()));
 return Math.min(length-1,Math.floor(r*length));
}
function maliceRandomTrashSlug(randomFn){
 return MALICE_TRASH[maliceRandomIndex(MALICE_TRASH.length,randomFn)];
}
function maliceCreateTrash(c,slug,randomFn,now){
 const def=typeof GAMEDATA!=='undefined'&&GAMEDATA.monsters&&GAMEDATA.monsters[slug];
 const cells=typeof greedFreeCells==='function'?greedFreeCells(c):[];
 if(!def||!cells.length)return null;
 const rnd=randomFn||Math.random,cell=cells[maliceRandomIndex(cells.length,rnd)];
 const pos=typeof cellToScreen==='function'?cellToScreen(cell.x,cell.y):
  {x:(cell.x+.5)/(c.gridW||30),y:(cell.y+.5)/(c.gridH||30)};
 const mob={slug,def:Object.assign({},def),hp:def.hp,maxHp:def.hp,maliceTrash:true,
  atkCd:400+rnd()*1200,
  id:'malice-trash-'+now.toString(36)+'-'+Math.random().toString(36).slice(2,7),
  cx:cell.x,cy:cell.y,x:pos.x,y:pos.y,sx:pos.x,sy:pos.y,dir:'w',
  moving:false,attackAnim:0,speed:.000055,spawnAt:now};
 c.mobs.unshift(mob);
 if(c.events)c.events.push({t:'spawn',slug,x:mob.x,y:mob.y});
 return mob;
}
function maliceFillTrash(c,randomFn,now){
 if(!maliceBossFight(c)||!c.malice)return 0;
 let made=0;const rnd=randomFn||c.malice.randomFn||Math.random;
 while(maliceTrashMobs(c).length<MALICE_MAX_TRASH){
  if(!maliceCreateTrash(c,maliceRandomTrashSlug(rnd),rnd,now||Date.now()))break;
  made++;
 }
 if(made&&typeof resolveSQMOccupancy==='function')resolveSQMOccupancy(c);
 return made;
}
function maliceCellBlocked(st,x,y){
 if(!st||!st.blocks)return false;
 const N=MALICE_QTE_SIZE;
 if(x<0||y<0||x>=N||y>=N)return true;
 for(const b of st.blocks){
  if(b.x===x&&y>=b.y&&y<b.y+(b.len||1))return true;
 }
 return false;
}
function maliceRandomBoardPoint(rnd,N,avoid,minDist){
 const dist=Math.max(1,Number(minDist)||MALICE_GOAL_MIN_DIST);
 let x=1,y=1,guard=0;
 do{
  x=1+Math.floor(rnd()*(N-2));
  y=1+Math.floor(rnd()*(N-2));
  guard++;
 }while(guard<80&&avoid&&(Math.abs(x-avoid.x)+Math.abs(y-avoid.y)<dist));
 if(avoid&&(Math.abs(x-avoid.x)+Math.abs(y-avoid.y)<dist)){
  x=Math.max(1,Math.min(N-2,N-1-avoid.x));
  y=Math.max(1,Math.min(N-2,N-1-avoid.y));
 }
 return{x,y};
}
function maliceBuildMaze(randomFn){
 const rnd=randomFn||Math.random,N=MALICE_QTE_SIZE;
 const start=maliceRandomBoardPoint(rnd,N,null,0);
 const goal=maliceRandomBoardPoint(rnd,N,start,MALICE_GOAL_MIN_DIST);
 const blocks=[];
 const used=new Set();
 for(let i=0;i<MALICE_BLOCK_COUNT;i++){
  let x=1+Math.floor(rnd()*(N-2)),guard=0;
  while((x===start.x||x===goal.x||used.has(x))&&guard++<40)x=1+Math.floor(rnd()*(N-2));
  used.add(x);
  const len=2+Math.floor(rnd()*3);
  const fromTop=rnd()<.5;
  const dy=fromTop?1:-1;
  const y=fromTop?(-len-Math.floor(rnd()*12)):(N+Math.floor(rnd()*12));
  blocks.push({x,y,len,dy});
 }
 return {start,goal,px:start.x,py:start.y,blocks};
}
function maliceSlideBlocks(st){
 if(!st||!st.blocks)return false;
 let hit=false;
 const N=MALICE_QTE_SIZE;
 for(const b of st.blocks){
  const dy=b.dy===-1?-1:1;
  b.dy=dy;
  b.y+=dy;
  if(b.x===st.px&&st.py>=b.y&&st.py<b.y+(b.len||1))hit=true;
 }
 // Recicla blocos que saíram — nunca na coluna do start/goal/jogador.
 const forbidden=new Set();
 if(st.start)forbidden.add(st.start.x);
 if(st.goal)forbidden.add(st.goal.x);
 if(Number.isFinite(Number(st.px)))forbidden.add(Number(st.px));
 const rnd=st.randomFn||Math.random;
 for(const b of st.blocks){
  const dy=b.dy===-1?-1:1;
  const len=b.len||1;
  const exited=dy>0?(b.y>=N):(b.y+len<=0);
  if(!exited)continue;
  b.dy=rnd()<.5?1:-1;
  b.y=b.dy>0?(-len-Math.floor(rnd()*8)):(N+Math.floor(rnd()*8));
  let x=1+Math.floor(rnd()*(N-2)),guard=0;
  while(forbidden.has(x)&&guard++<40)x=1+Math.floor(rnd()*(N-2));
  b.x=x;
 }
 return hit;
}
function malicePlayerEntities(c){
 if(c&&c.players&&c.players.length)return c.players.filter((e)=>e&&e.p);
 if(c&&c.player&&c.player.p)return [c.player];
 return [];
}
function maliceApplyCurseExplosion(c,now){
 if(!c)return 0;
 now=now||Date.now();
 const dmg=MALICE_QTE_FAIL_DMG;
 let hit=0;
 for(const ent of malicePlayerEntities(c)){
  if(!ent.p||ent.p.hp<=0||ent.permadead||ent.downUntil)continue;
  ent.p.hp=Math.max(0,ent.p.hp-dmg);
  hit++;
  const x=Number(ent.x);const y=Number(ent.y);
  if(c.events)c.events.push({t:'taken',dmg,el:'death',fx:'mort-area',screen:true,
   x:Number.isFinite(x)?x:.5,y:Number.isFinite(y)?y:.5,
   targetId:String(ent.id!=null?ent.id:(ent.p.id!=null?ent.p.id:'player'))});
  if(ent.p.hp<=0){
   if(ent===c.player&&typeof playerDeath==='function')playerDeath(c,ent.p);
   else if(c.boss){
    ent.downedAt=now;ent.permadead=true;ent.reviveAt=0;
    ent.deathPos={x:ent.x,y:ent.y,dir:ent.dir||'e'};
    if(typeof applyCharacterDeathConsequences==='function')
     applyCharacterDeathConsequences(c,ent.p);
   }
  }
 }
 if(typeof addLog==='function')
  addLog('death',"Maldição de Malice: todos receberam "+dmg+" de death!");
 if(typeof toast==='function')toast('Malice QTE falhou (−'+dmg+' death)','death');
 return hit;
}
function maliceRenderMinigame(c,now){
 const el=maliceMinigameElement();if(!el||!c||!c.malice)return;
 const st=c.malice,trash=maliceTrashMobs(c);
 const qte=st.qtePhase==='active'?`labirinto ${Math.max(0,Math.ceil((st.qteUntil-now)/1000))}s`:
  ('próximo QTE '+Math.max(0,Math.ceil((st.nextQteAt-now)/1000))+'s');
 const key=[trash.length,qte,st.qtePhase].join('|');
 if(st.renderKey===key)return;st.renderKey=key;
 el.style.display='block';
 el.innerHTML=`<div class="malice-title">GOSHNAR'S MALICE</div>
  <div class="malice-row"><span>Trash</span><b>${trash.length}/${MALICE_MAX_TRASH}</b></div>
  <div class="malice-row"><span>Maze QTE</span><b>${qte}</b></div>
  <small>Azul→vermelho (posição aleatória) · barras cima/baixo · falha = 6000 death</small>`;
}
function maliceUsesOnlineAuth(){
 return typeof onlineAuthorityCombat==='function'&&onlineAuthorityCombat()&&
  typeof accountInstanceActive==='function'&&accountInstanceActive();
}
function maliceQueueOnlineMove(c,nx,ny,now){
 if(!c)return;
 c._malicePendingMoves=Array.isArray(c._malicePendingMoves)?c._malicePendingMoves:[];
 c._malicePendingMoves.push({x:nx,y:ny});
 if(c._malicePendingMoves.length>48)c._malicePendingMoves.splice(0,c._malicePendingMoves.length-48);
 c._malicePendingMoveAt=now||Date.now();
}
function maliceBindKeys(c){
 if(typeof document==='undefined')return;
 if(document._maliceKeyHandler){
  document.removeEventListener('keydown',document._maliceKeyHandler,true);
  document.removeEventListener('keydown',document._maliceKeyHandler,false);
 }
 document._maliceKeyHandler=function(ev){
  if(!c||!c.malice||c.malice.qtePhase!=='active')return;
  if(ev.target&&(ev.target.tagName==='INPUT'||ev.target.tagName==='TEXTAREA'||ev.target.tagName==='SELECT'))return;
  const map={ArrowUp:'n',ArrowDown:'s',ArrowLeft:'w',ArrowRight:'e',
   w:'n',W:'n',s:'s',S:'s',a:'w',A:'w',d:'e',D:'e'};
  const dir=map[ev.key];if(!dir)return;
  ev.preventDefault();
  if(typeof ev.stopImmediatePropagation==='function')ev.stopImmediatePropagation();
  maliceMoveDir(c,dir,Date.now());
 };
 // capture: antes do walk handler de game.js (AUTO off / SQM).
 document.addEventListener('keydown',document._maliceKeyHandler,true);
}
function malicePaintCellClass(st,x,y){
 let cls='malice-cell';
 if(st.start&&x===st.start.x&&y===st.start.y)cls+=' start';
 if(st.goal&&x===st.goal.x&&y===st.goal.y)cls+=' goal';
 if(x===st.px&&y===st.py)cls+=' player';
 if(maliceCellBlocked(st,x,y))cls+=' block';
 return cls;
}
function maliceRenderQte(c,now){
 const el=maliceQteElement();if(!el||!c||!c.malice||c.malice.qtePhase!=='active'){maliceHideQte();return;}
 const st=c.malice,left=Math.max(0,Math.ceil((st.qteUntil-now)/1000));
 const N=MALICE_QTE_SIZE;
 const blockKey=(st.blocks||[]).map((b)=>b.x+','+b.y+','+(b.len||1)).join(';');
 const key=[st.px,st.py,left,blockKey].join('|');
 const board=el.querySelector('.malice-qte-board');
 const title=el.querySelector('.malice-qte-title');
 // Atualização incremental: não recrie 900 botões a cada slide (quebrava clique/WASD).
 if(st.qteRenderKey&&board&&el.className.indexOf('active')!==-1&&
    board.children.length===N*N){
  if(title)title.textContent='LABIRINTO DA MALÍCIA — '+left+'s';
  if(st.qteRenderKey!==key){
   for(let i=0;i<board.children.length;i++){
    const node=board.children[i];
    const x=Number(node.getAttribute('data-mx')),y=Number(node.getAttribute('data-my'));
    node.className=malicePaintCellClass(st,x,y);
   }
   st.qteRenderKey=key;
  }
  maliceBindKeys(c);return;
 }
 st.qteRenderKey=key;
 el.style.display='block';el.className='malice-qte active';
 let cells='';
 for(let y=0;y<N;y++){
  for(let x=0;x<N;x++){
   cells+=`<button type="button" class="${malicePaintCellClass(st,x,y)}" data-mx="${x}" data-my="${y}"></button>`;
  }
 }
 el.innerHTML=`<div class="malice-qte-title">LABIRINTO DA MALÍCIA — ${left}s</div>
  <div class="malice-qte-board" style="grid-template-columns:repeat(${N},1fr)">${cells}</div>
  <div class="malice-qte-help">Clique (passo) ou WASD/setas · azul → vermelho (aleatório) · barras cima/baixo</div>`;
 el.querySelectorAll('[data-mx]').forEach((node)=>{
  node.onclick=function(ev){
   ev.preventDefault();
   maliceMoveTo(c,Number(node.getAttribute('data-mx')),Number(node.getAttribute('data-my')),Date.now());
  };
 });
 maliceBindKeys(c);
}
function maliceStartQte(c,now,randomFn){
 if(!maliceBossFight(c)||!c.malice)return false;
 const st=c.malice,rnd=randomFn||st.randomFn||Math.random;
 const maze=maliceBuildMaze(rnd);
 st.qtePhase='active';st.qteUntil=now+MALICE_QTE_DURATION;
 st.start=maze.start;st.goal=maze.goal;st.px=maze.px;st.py=maze.py;
 st.blocks=maze.blocks;st.nextSlideAt=now+MALICE_SLIDE_MS;
 st.randomFn=rnd;
 maliceRenderQte(c,now);maliceRenderMinigame(c,now);
 if(typeof addLog==='function')addLog('death',"Malice: alcance o quadrado vermelho!");
 if(c.events)c.events.push({t:'malice-qte',phase:'start',screen:true});
 return true;
}
function maliceResolveQte(c,success,now){
 const st=c&&c.malice;if(!st||st.qtePhase!=='active')return;
 st.qtePhase='idle';st.nextQteAt=(now||Date.now())+MALICE_QTE_INTERVAL;
 st.blocks=[];delete st.qteUntil;delete st.nextSlideAt;
 if(success){
  if(typeof addLog==='function')addLog('level','Labirinto concluído — sem explosão.');
  if(typeof toast==='function')toast('Malice QTE sucesso!','level');
 }else{
  maliceApplyCurseExplosion(c,now||Date.now());
 }
 maliceHideQte();maliceRenderMinigame(c,now||Date.now());
 if(c.events)c.events.push({t:'malice-qte',result:success?'success':'fail',screen:true});
}
function maliceTryMove(c,nx,ny,now){
 const st=c&&c.malice;if(!st||st.qtePhase!=='active')return false;
 const N=MALICE_QTE_SIZE;
 nx=Math.floor(Number(nx));ny=Math.floor(Number(ny));
 if(!Number.isFinite(nx)||!Number.isFinite(ny))return false;
 if(nx<0||ny<0||nx>=N||ny>=N)return false;
 if(Math.abs(nx-st.px)+Math.abs(ny-st.py)!==1)return false;
 if(maliceCellBlocked(st,nx,ny))return false;
 now=now||Date.now();
 // Sempre aplica local (feedback imediato). Online: enfileira intents adjacentes.
 if(maliceUsesOnlineAuth())maliceQueueOnlineMove(c,nx,ny,now);
 st.px=nx;st.py=ny;
 if(st.goal&&nx===st.goal.x&&ny===st.goal.y){maliceResolveQte(c,true,now);return true;}
 maliceRenderQte(c,now);return true;
}
function maliceMoveTo(c,x,y,now){
 const st=c&&c.malice;if(!st||st.qtePhase!=='active')return false;
 x=Math.floor(Number(x));y=Math.floor(Number(y));
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 if(x===st.px&&y===st.py)return false;
 if(Math.abs(x-st.px)+Math.abs(y-st.py)===1)return maliceTryMove(c,x,y,now);
 // Clique longe: um passo guloso em direção ao alvo (células minúsculas no 30×30).
 const dx=Math.sign(x-st.px),dy=Math.sign(y-st.py);
 const opts=Math.abs(x-st.px)>=Math.abs(y-st.py)
  ?[[st.px+dx,st.py],[st.px,st.py+dy]]:[[st.px,st.py+dy],[st.px+dx,st.py]];
 for(const step of opts){
  if(maliceCellBlocked(st,step[0],step[1]))continue;
  if(maliceTryMove(c,step[0],step[1],now))return true;
 }
 return false;
}
function maliceMoveDir(c,dir,now){
 const st=c&&c.malice;if(!st||st.qtePhase!=='active')return false;
 const d={n:[0,-1],s:[0,1],w:[-1,0],e:[1,0]}[dir];if(!d)return false;
 return maliceTryMove(c,st.px+d[0],st.py+d[1],now);
}
function maliceBossInit(c,player,randomFn,now){
 if(!maliceBossFight(c))return c;
 now=now||Date.now();const rnd=randomFn||Math.random;
 const boss=maliceBossMob(c);
 c.malice={qtePhase:'idle',nextQteAt:now+MALICE_QTE_INTERVAL,
  pendingRespawns:[],blocks:[],randomFn:rnd,startedAt:now};
 if(boss){
  boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
 }
 maliceFillTrash(c,rnd,now);maliceRenderMinigame(c,now);
 if(typeof addLog==='function')
  addLog('death',"Goshnar's Malice: prepare-se para o labirinto a cada 30s.");
 return c;
}
function maliceBossHandleKill(c,mob,now){
 if(!maliceBossFight(c)||!c.malice||!mob||!mob.maliceTrash)return false;
 now=now||Date.now();
 c.malice.pendingRespawns=c.malice.pendingRespawns||[];
 c.malice.pendingRespawns.push({at:now+MALICE_TRASH_RESPAWN_MS});
 maliceRenderMinigame(c,now);return true;
}
function maliceBossTick(c,now){
 now=now||Date.now();if(!maliceBossFight(c)||!c.malice)return true;
 const st=c.malice,boss=maliceBossMob(c);
 if(!boss||boss.hp<=0){
  if(typeof arenaBossSpawnPending==='function'&&arenaBossSpawnPending(c)){
   maliceRenderMinigame(c,now);return true;
  }
  maliceHideMinigame();maliceHideQte();return true;
 }
 st.pendingRespawns=(st.pendingRespawns||[]).filter((job)=>{
  if(now<job.at)return true;
  if(maliceTrashMobs(c).length<MALICE_MAX_TRASH)
   maliceCreateTrash(c,maliceRandomTrashSlug(st.randomFn),st.randomFn,now);
  return false;
 });
 if(maliceTrashMobs(c).length<MALICE_MAX_TRASH&&!(st.pendingRespawns||[]).length)
  maliceFillTrash(c,st.randomFn,now);
 if(st.qtePhase==='active'){
  if(now>=st.qteUntil)maliceResolveQte(c,false,now);
  else{
   while(st.nextSlideAt&&now>=st.nextSlideAt){
    st.nextSlideAt+=MALICE_SLIDE_MS;
    if(maliceSlideBlocks(st)){maliceResolveQte(c,false,now);break;}
   }
   if(st.qtePhase==='active')maliceRenderQte(c,now);
  }
 }else if(now>=st.nextQteAt)maliceStartQte(c,now,st.randomFn);
 maliceRenderMinigame(c,now);return true;
}
function maliceBossCleanup(c){
 if(c){
  delete c.malice;delete c._malicePendingMove;delete c._malicePendingMoves;
  delete c._malicePendingMoveAt;
 }
 maliceHideMinigame();maliceHideQte();
}
function maliceRenderOnline(c){
 if(!c||!c.malice){maliceHideMinigame();maliceHideQte();return;}
 const now=Date.now();
 if(c.malice.qtePhase==='active')maliceRenderQte(c,now);else maliceHideQte();
 maliceRenderMinigame(c,now);
}

/* ------------------------------------------------ Goshnar's Megalomania
 * Boss final Soul War (lobby 1–5). Boss nasce 15s após o start.
 * QTE pessoal a cada 10–25s (Scarlett / Spite). Falha = 3000–6000 death.
 * Bag You Desire: 0.15% (+50% vs mini-bosses). */
const GOSHNAR_MEGA_ID='goshnar-s-megalomania';
const MEGA_BOSS_SPAWN_MS=15000;
const MEGA_PERSONAL_MIN_MS=10000;
const MEGA_PERSONAL_MAX_MS=25000;
const MEGA_QTE_TYPES=['scarlett','spite'];
const MEGA_SCARLETT_KEYS=['up','down','left','right'];
const MEGA_SCARLETT_LEAD_MS=1000;
const MEGA_SCARLETT_NOTE_GAP=560;
const MEGA_SCARLETT_WINDOW_MS=520;
const MEGA_SPITE_BUBBLES=5;
const MEGA_SPITE_QTE_MS=5000;
const MEGA_FAIL_DMG_MIN=3000;
const MEGA_FAIL_DMG_MAX=6000;
const MEGA_FORM={
 purple:'goshnar-s-megalomania-purple',
 green:'goshnar-s-megalomania-green',
 blue:'goshnar-s-megalomania-blue',
};
const MEGA_KEY_ICON={up:'↑',down:'↓',left:'←',right:'→'};

function megaBossFight(c){return !!(c&&c.boss&&c.boss.id===GOSHNAR_MEGA_ID);}
function megaBossMob(c){return c&&c.mobs?c.mobs.find((m)=>m&&m.boss):null;}
function megaAspectMobs(){return [];}
function megaMinigameElement(){return typeof document!=='undefined'?document.getElementById('mega-minigame'):null;}
function megaQteElement(){return typeof document!=='undefined'?document.getElementById('mega-qte'):null;}
function megaHideMinigame(){const el=megaMinigameElement();if(el){el.style.display='none';el.innerHTML='';}}
function megaHideQte(){
 const el=megaQteElement();if(el){el.style.display='none';el.innerHTML='';el.className='mega-qte';}
 if(typeof document!=='undefined'){
  if(document._megaKeyHandler){document.removeEventListener('keydown',document._megaKeyHandler);document._megaKeyHandler=null;}
  if(document._megaKeyUpHandler){document.removeEventListener('keyup',document._megaKeyUpHandler);document._megaKeyUpHandler=null;}
 }
}
function megaFailDmg(rnd){
 const r=rnd||Math.random;
 return MEGA_FAIL_DMG_MIN+Math.floor(r()*(MEGA_FAIL_DMG_MAX-MEGA_FAIL_DMG_MIN+1));
}
function megaNextPersonalAt(now,rnd){
 const r=rnd||Math.random;
 return now+MEGA_PERSONAL_MIN_MS+Math.floor(r()*(MEGA_PERSONAL_MAX_MS-MEGA_PERSONAL_MIN_MS+1));
}
function megaPlayerEntities(c){
 if(typeof malicePlayerEntities==='function')return malicePlayerEntities(c);
 if(c&&c.players&&c.players.length)return c.players;
 return c&&c.player?[c.player]:[];
}
function megaLocalPlayerId(c){
 if(typeof sessionCharId==='function'){
  const id=sessionCharId();if(id!=null&&id!=='')return String(id);
 }
 if(c&&c.player&&c.player.id!=null)return String(c.player.id);
 if(c&&c.player&&c.player.p&&c.player.p.id!=null)return String(c.player.p.id);
 return 'player';
}
function megaPersonalSlot(c,playerId){
 const st=c&&c.mega;if(!st)return null;
 st.personal=st.personal||{};
 const id=String(playerId||megaLocalPlayerId(c));
 if(!st.personal[id])st.personal[id]={nextAt:0,active:null};
 return st.personal[id];
}
function megaFormDef(form){
 const slug=MEGA_FORM[form]||MEGA_FORM.green;
 const base=typeof GAMEDATA!=='undefined'&&GAMEDATA.monsters&&GAMEDATA.monsters[slug];
 if(!base)return null;
 return Object.assign({},base,{name:"Goshnar's Megalomania"});
}
function megaApplyForm(c,form,now){
 const st=c&&c.mega,boss=megaBossMob(c);if(!st||!boss)return;
 const def=megaFormDef(form);if(!def)return;
 const hpPct=boss.maxHp?boss.hp/boss.maxHp:1;
 boss.slug=MEGA_FORM[form]||MEGA_FORM.green;
 boss.def=Object.assign({},def,{hp:boss.maxHp||def.hp,exp:def.exp});
 boss.hp=Math.max(1,Math.floor((boss.maxHp||def.hp)*hpPct));
 st.phase=form;st.immune=false;
 boss.qteImmune=false;boss.megaImmune=false;boss.megaPendingSpawn=false;
 if(c.events)c.events.push({t:'effect',x:boss.x,y:boss.y,screen:true,fx:'magic-green'});
}
function megaEnsurePersonalSchedulers(c,now,rnd){
 const st=c&&c.mega;if(!st)return;
 st.personal=st.personal||{};
 for(const ent of megaPlayerEntities(c)){
  const id=String(ent.id!=null?ent.id:(ent.p&&ent.p.id)||'player');
  if(!st.personal[id])st.personal[id]={nextAt:megaNextPersonalAt(now,rnd),active:null};
 }
}
function megaSpawnBoss(c,now){
 const st=c&&c.mega;if(!st||st.bossSpawned)return;
 let boss=megaBossMob(c);
 if(!boss&&st.pendingBoss){
  boss=st.pendingBoss;delete st.pendingBoss;
  c.mobs=c.mobs||[];c.mobs.unshift(boss);
 }
 if(!boss){
  // Offline/local: reconstrói green se pending sumiu — nunca marque spawned vazio.
  const slug=(typeof MEGA_FORM!=='undefined'&&MEGA_FORM.green)||'goshnar-s-megalomania-green';
  const def=typeof GAMEDATA!=='undefined'&&GAMEDATA.monsters&&GAMEDATA.monsters[slug];
  if(!def)return;
  const seed=st._pendingSeed||{};
  boss={id:String(seed.id||'mega-boss'),slug,boss:true,def:Object.assign({},def,{name:"Goshnar's Megalomania"}),
   hp:Number(seed.hp)||def.hp||620000,maxHp:Number(seed.maxHp)||def.hp||620000,
   cx:Number(seed.cx),cy:Number(seed.cy),x:Number(seed.x),y:Number(seed.y)};
  if(!Number.isFinite(boss.cx)||!Number.isFinite(boss.cy)){
   const mob=(c.huntMap&&c.huntMap.mob&&c.huntMap.mob[0])||null;
   boss.cx=mob?Number(mob.x):15;boss.cy=mob?Number(mob.y):8;
   const gw=Number(c.gridW)||30,gh=Number(c.gridH)||30;
   boss.x=(boss.cx+.5)/gw;boss.y=(boss.cy+.5)/gh;
  }
  boss.sx=boss.x;boss.sy=boss.y;
  boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
  c.mobs=c.mobs||[];c.mobs.unshift(boss);
 }
 if(!boss)return;
 boss.maxHp=boss.maxHp||boss.hp||620000;
 megaApplyForm(c,'green',now);
 st.bossSpawned=true;st.immune=false;delete st._pendingSeed;
 if(typeof addLog==='function')addLog('death',"Goshnar's Megalomania surgiu!");
 if(typeof toast==='function')toast("Megalomania surgiu!",'level');
 if(c.events)c.events.push({t:'spawn',slug:boss.slug,x:boss.x,y:boss.y,screen:true});
}
function megaDamagePlayer(c,ent,dmg,now){
 if(!ent||!ent.p||ent.p.hp<=0||ent.permadead||ent.downUntil)return;
 ent.p.hp=Math.max(0,ent.p.hp-dmg);
 const x=Number(ent.x),y=Number(ent.y);
 if(c.events)c.events.push({t:'taken',dmg,el:'death',fx:'mort-area',screen:true,
  x:Number.isFinite(x)?x:.5,y:Number.isFinite(y)?y:.5,
  targetId:String(ent.id!=null?ent.id:(ent.p.id!=null?ent.p.id:'player'))});
 if(ent.p.hp<=0){
  if(ent===c.player&&typeof playerDeath==='function')playerDeath(c,ent.p);
  else if(c.boss){
   ent.downedAt=now;ent.permadead=true;ent.reviveAt=0;
   ent.deathPos={x:ent.x,y:ent.y,dir:ent.dir||'e'};
   if(typeof applyCharacterDeathConsequences==='function')applyCharacterDeathConsequences(c,ent.p);
  }
 }
}
function megaFindEntity(c,playerId){
 const id=String(playerId);
 return megaPlayerEntities(c).find((e)=>String(e.id)!=null&&String(e.id)===id)||
  megaPlayerEntities(c).find((e)=>e.p&&String(e.p.id)===id)||null;
}
function megaBuildScarlett(now,rnd){
 const r=rnd||Math.random;
 const sequence=Array.from({length:5},()=>MEGA_SCARLETT_KEYS[Math.min(3,Math.floor(r()*4))]);
 return{
  type:'scarlett',until:now+MEGA_SCARLETT_LEAD_MS+4*MEGA_SCARLETT_NOTE_GAP+MEGA_SCARLETT_WINDOW_MS+400,
  sequence,index:0,
  notes:sequence.map((dir,i)=>({dir,due:now+MEGA_SCARLETT_LEAD_MS+i*MEGA_SCARLETT_NOTE_GAP,hit:false})),
 };
}
function megaBuildSpite(now,rnd){
 const r=rnd||Math.random;
 const bubbles=Array.from({length:MEGA_SPITE_BUBBLES},(_,i)=>({
  i,x:8+Math.floor(r()*84),y:12+Math.floor(r()*70),popped:false,
 }));
 return{type:'spite',until:now+MEGA_SPITE_QTE_MS,bubbles,bubblesLeft:MEGA_SPITE_BUBBLES};
}
function megaStartPersonal(c,playerId,now,randomFn){
 const st=c&&c.mega;if(!st)return null;
 const slot=megaPersonalSlot(c,playerId);if(!slot||slot.active)return null;
 const rnd=randomFn||st.randomFn||Math.random;
 const type=MEGA_QTE_TYPES[Math.min(MEGA_QTE_TYPES.length-1,Math.floor(rnd()*MEGA_QTE_TYPES.length))];
 const active=type==='scarlett'?megaBuildScarlett(now,rnd):megaBuildSpite(now,rnd);
 slot.active=active;slot.nextAt=0;
 delete st._qteRenderKey;
 if(c.events)c.events.push({t:'mega-qte',phase:'start',kind:type,playerId:String(playerId),screen:true});
 if(String(playerId)===megaLocalPlayerId(c)){
  if(typeof addLog==='function')addLog('death',"Megalomania: mecânica pessoal ("+type+")!");
  megaRenderQte(c,now);
 }
 return active;
}
function megaResolvePersonal(c,playerId,success,now){
 const st=c&&c.mega;if(!st)return;
 const slot=megaPersonalSlot(c,playerId);if(!slot||!slot.active)return;
 const kind=slot.active.type;slot.active=null;
 delete st._qteRenderKey;
 slot.nextAt=megaNextPersonalAt(now||Date.now(),st.randomFn);
 if(success){
  if(String(playerId)===megaLocalPlayerId(c)){
   if(typeof addLog==='function')addLog('level','Mecanica Megalomania concluída.');
   if(typeof toast==='function')toast('Megalomania QTE sucesso!','level');
  }
 }else{
  now=now||Date.now();
  const dmg=megaFailDmg(st.randomFn);
  const ent=megaFindEntity(c,playerId);
  if(ent)megaDamagePlayer(c,ent,dmg,now);
  if(String(playerId)===megaLocalPlayerId(c)){
   if(typeof addLog==='function')addLog('death',"Mecanica falhou (−"+dmg+" death)!");
   if(typeof toast==='function')toast('Megalomania QTE falhou (−'+dmg+' death)','death');
  }
 }
 if(c.events)c.events.push({t:'mega-qte',result:success?'success':'fail',kind,playerId:String(playerId),screen:true});
 if(String(playerId)===megaLocalPlayerId(c)){megaHideQte();megaRenderMinigame(c,now||Date.now());}
}
function megaOnlineAuthority(){
 return typeof onlineAuthorityCombat==='function'&&onlineAuthorityCombat();
}
function megaInputScarlett(c,dir,now){
 const id=megaLocalPlayerId(c),slot=megaPersonalSlot(c,id);
 if(!slot||!slot.active||slot.active.type!=='scarlett')return false;
 if(megaOnlineAuthority()){
  c._megaPendingIntent={kind:'scarlett',dir:String(dir),pressAuth:now};return true;
 }
 const act=slot.active,note=act.notes&&act.notes[act.index];
 if(!note){megaResolvePersonal(c,id,false,now);return false;}
 if(String(dir)!==String(note.dir)||Math.abs(now-note.due)>MEGA_SCARLETT_WINDOW_MS){
  megaResolvePersonal(c,id,false,now);return false;
 }
 note.hit=true;act.index=(act.index||0)+1;
 if(act.index>=(act.sequence||[]).length)megaResolvePersonal(c,id,true,now);
 else megaRenderQte(c,now);
 return true;
}
function megaInputSpite(c,index,now){
 const id=megaLocalPlayerId(c),slot=megaPersonalSlot(c,id);
 if(!slot||!slot.active||slot.active.type!=='spite')return false;
 if(megaOnlineAuthority()){
  const bubble=(slot.active.bubbles||[])[index];
  if(!bubble||bubble.popped)return false;
  // Otimista local: evita rebuild apagar o clique e acumula intents.
  bubble.popped=true;
  slot.active.bubblesLeft=Math.max(0,(slot.active.bubblesLeft||1)-1);
  c._megaPendingIntents=Array.isArray(c._megaPendingIntents)?c._megaPendingIntents:[];
  c._megaPendingIntents.push({kind:'spite',bubble:Number(index)});
  if(c._megaPendingIntents.length>16)c._megaPendingIntents.splice(0,c._megaPendingIntents.length-16);
  c._megaPendingIntent={kind:'spite',bubble:Number(index)};
  delete c.mega._qteRenderKey;
  megaRenderQte(c,now||Date.now());
  return true;
 }
 const bubble=(slot.active.bubbles||[])[index];
 if(!bubble||bubble.popped)return false;
 bubble.popped=true;slot.active.bubblesLeft=Math.max(0,(slot.active.bubblesLeft||1)-1);
 if(slot.active.bubblesLeft<=0)megaResolvePersonal(c,id,true,now);
 else megaRenderQte(c,now);
 return true;
}
function megaBindKeys(c){
 if(typeof document==='undefined')return;
 if(document._megaKeyHandler)document.removeEventListener('keydown',document._megaKeyHandler);
 if(document._megaKeyUpHandler){
  document.removeEventListener('keyup',document._megaKeyUpHandler);
  document._megaKeyUpHandler=null;
 }
 document._megaKeyHandler=function(ev){
  const id=megaLocalPlayerId(c),slot=megaPersonalSlot(c,id);
  if(!slot||!slot.active)return;
  const act=slot.active;
  if(act.type==='scarlett'){
   const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',
    w:'up',W:'up',s:'down',S:'down',a:'left',A:'left',d:'right',D:'right'};
   const dir=map[ev.key];if(!dir)return;
   ev.preventDefault();megaInputScarlett(c,dir,Date.now());
  }
 };
 document.addEventListener('keydown',document._megaKeyHandler);
}
function megaRenderMinigame(c,now){
 const el=megaMinigameElement();if(!el||!c||!c.mega)return;
 const st=c.mega;
 const spawnLeft=st.bossSpawned?0:Math.max(0,Math.ceil(((st.bossSpawnAt||0)-now)/1000));
 const slot=megaPersonalSlot(c,megaLocalPlayerId(c));
 let qte='—';
 if(slot&&slot.active)qte=slot.active.type+' '+Math.max(0,Math.ceil(((slot.active.until||0)-now)/1000))+'s';
 else if(slot)qte='próximo '+Math.max(0,Math.ceil(((slot.nextAt||0)-now)/1000))+'s';
 const key=[st.bossSpawned?'up':'wait',spawnLeft,qte].join('|');
 if(st.renderKey===key)return;st.renderKey=key;
 el.style.display='block';
 el.innerHTML=`<div class="mega-title">GOSHNAR'S MEGALOMANIA</div>
  <div class="mega-row"><span>Boss</span><b>${st.bossSpawned?'ATIVO':('nasce em '+spawnLeft+'s')}</b></div>
  <div class="mega-row"><span>Sua mecânica</span><b>${qte}</b></div>
  <small>QTE pessoal 10–25s · Scarlett / Spite · falha 3k–6k death</small>`;
}
function megaRenderQte(c,now){
 const el=megaQteElement();if(!el||!c||!c.mega){megaHideQte();return;}
 const slot=megaPersonalSlot(c,megaLocalPlayerId(c));
 if(!slot||!slot.active){megaHideQte();return;}
 const act=slot.active,left=Math.max(0,Math.ceil(((act.until||0)-now)/1000));
 // Evita recriar o DOM a cada frame (cliques em bolhas morriam no rebuild).
 const poppedMask=(act.bubbles||[]).map((b)=>b&&b.popped?1:0).join('');
 const qteKey=[act.type,left,act.index||0,act.bubblesLeft||0,poppedMask].join('|');
 if(c.mega._qteRenderKey===qteKey&&el.classList.contains('active'))return;
 c.mega._qteRenderKey=qteKey;
 el.style.display='block';el.className='mega-qte active';
 if(act.type==='scarlett'){
  const notes=(act.notes||[]).map((note,i)=>{
   const cls=note.hit?'hit':(i===act.index?'current':'');
   return `<span class="mega-scarlett-note ${cls}">${MEGA_KEY_ICON[note.dir]||'?'}</span>`;
  }).join('');
  el.innerHTML=`<div class="mega-qte-title">DANÇA — ${act.index||0}/5 · ${left}s</div>
   <div class="mega-scarlett-track">${notes}</div>
   <div class="mega-qte-help">↑ ↓ ← → / WASD no tempo · falha 3k–6k death</div>`;
 }else if(act.type==='spite'){
  const bubbles=(act.bubbles||[]).map((b,i)=>b.popped?'':
   `<button type="button" class="mega-bubble" style="left:${b.x}%;top:${b.y}%" data-bi="${i}"></button>`).join('');
  el.innerHTML=`<div class="mega-qte-title">ESTOURE AS BOLHAS — ${left}s</div>
   <div class="mega-spite-board">${bubbles}</div>
   <div class="mega-qte-help">Clique em todas · falha 3k–6k death</div>`;
  el.querySelectorAll('[data-bi]').forEach((node)=>{
   node.onclick=function(ev){ev.preventDefault();megaInputSpite(c,Number(node.getAttribute('data-bi')),Date.now());};
  });
 }
 megaBindKeys(c);
}
function megaBossInit(c,player,randomFn,now){
 if(!megaBossFight(c))return c;
 now=now||Date.now();const rnd=randomFn||Math.random;
 const boss=megaBossMob(c);
 c.mega={bossSpawnAt:now+MEGA_BOSS_SPAWN_MS,bossSpawned:false,pendingBoss:null,
  phase:'waiting',immune:true,personal:{},randomFn:rnd,startedAt:now};
 if(boss){
  boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
  boss.maxHp=boss.maxHp||boss.hp||620000;
  boss.megaPendingSpawn=true;boss.qteImmune=true;boss.megaImmune=true;
  c.mega.pendingBoss=boss;
  c.mega._pendingSeed={
   id:String(boss.id||'mega-boss'),slug:String(boss.slug||''),
   cx:boss.cx,cy:boss.cy,x:boss.x,y:boss.y,hp:boss.hp,maxHp:boss.maxHp
  };
  c.mobs=(c.mobs||[]).filter((m)=>m!==boss);
 }
 megaEnsurePersonalSchedulers(c,now+MEGA_BOSS_SPAWN_MS,rnd);
 megaRenderMinigame(c,now);
 if(typeof addLog==='function')
  addLog('death',"Megalomania surge em 15s. Mecânicas pessoais a cada 10–25s.");
 return c;
}
function megaBossHandleKill(){return false;}
function megaBossTick(c,now){
 now=now||Date.now();if(!megaBossFight(c)||!c.mega)return true;
 const st=c.mega;
 if(!st.bossSpawned){
  if(now>=(st.bossSpawnAt||0))megaSpawnBoss(c,now);
  else{megaRenderMinigame(c,now);/* QTEs pessoais podem começar antes do boss */}
 }
 const boss=megaBossMob(c);
 if(st.bossSpawned&&(!boss||boss.hp<=0)){megaHideMinigame();megaHideQte();return true;}
 megaEnsurePersonalSchedulers(c,now,st.randomFn);
 for(const pid of Object.keys(st.personal||{})){
  const slot=st.personal[pid];if(!slot)continue;
  if(slot.active){
   if(now>=(slot.active.until||0))megaResolvePersonal(c,pid,false,now);
   else if(String(pid)===megaLocalPlayerId(c))megaRenderQte(c,now);
  }else if(now>=(slot.nextAt||0))megaStartPersonal(c,pid,now,st.randomFn);
 }
 megaRenderMinigame(c,now);return true;
}
function megaBossCleanup(c){
 if(c){
  delete c.mega;delete c._megaPendingMove;delete c._megaPendingMoveAt;delete c._megaPendingIntent;
 }
 megaHideMinigame();megaHideQte();
}
function megaRenderOnline(c){
 if(!c||!c.mega){megaHideMinigame();megaHideQte();return;}
 const now=Date.now();
 const slot=megaPersonalSlot(c,megaLocalPlayerId(c));
 if(slot&&slot.active)megaRenderQte(c,now);else megaHideQte();
 megaRenderMinigame(c,now);
}
