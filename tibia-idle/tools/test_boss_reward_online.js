/* Reward Chest autoritativo + mecânicas online de Greed/Hatred/Scarlett. */
"use strict";
const fs=require("fs"),path=require("path");
const engine=require("../server/authoritative_engine");
const serverSource=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
const rewardJs=fs.readFileSync(path.join(__dirname,"..","game","js","reward-chest.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}

must(serverSource.includes('url === "/api/reward/claim"')&&serverSource.includes("claimRewardChest"),
  "API de coleta do Reward Chest ausente");
must(serverSource.includes('"rewardChestBundles"')&&!serverSource.includes("rewardChest:[]"),
  "personagem novo ainda inicializa o baú como array");
must(rewardJs.includes("rewardChestEnsureShape")&&rewardJs.includes("accountClaimRewardChest"),
  "cliente não migra o baú array nem chama a API de coleta");

function player(overrides){
  return Object.assign({id:1,name:"BossTester",voc:"knight",level:800,exp:engine.expForLevel(800),
    hp:500000,mp:20000,gold:100000,skills:{sword:120,axe:10,club:10,dist:10,fist:10,shield:100},
    ml:20,equip:{weapon:{item:"sword"}},supplies:{},lootPouch:{},kills:{},bosses:{},config:{}},overrides||{});
}
function bossDesc(p,bossId,slug){
  const member={id:String(p.id),p:JSON.parse(JSON.stringify(p))};
  return {v:1,savedAt:1000,kind:"boss",huntId:null,bossId,instanceMode:"boss",activeCharacterId:String(p.id),
    members:[member],state:{players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:[{id:"boss-1",slug:slug||bossId,boss:true,cx:12,cy:10,x:12.5/30,y:10.5/30}],events:[]}};
}
function silence(auth){
  for(const mob of auth.authority.mobs||[]){mob.damage=0;mob.attackSpeed=Number.MAX_SAFE_INTEGER;mob.attackAcc=0;}
  for(const item of auth.authority.players||[]){item.p.hp=engine.maxStats(item.p).hp;item.p.conditions={};}
}

const migrated=engine.rewardChestEnsure({rewardChest:[{item:"gold-coin",count:5,bossId:"the-monster"}]});
must(!Array.isArray(migrated.rewardChest)&&migrated.rewardChest["gold-coin"]===5&&
  migrated.rewardChestBundles.length===1&&migrated.rewardChestBundles[0].items["gold-coin"]===5,
  "array legado do servidor não virou pacote de boss");
must(engine.rewardChestClaimBundle(migrated,migrated.rewardChestBundles[0].id)===1&&
  migrated.lootPouch["gold-coin"]===5&&!migrated.rewardChest["gold-coin"]&&
  !migrated.rewardChestBundles.length,"coleta autoritativa não moveu o baú para a pouch");

const p=player();
const greedDesc=bossDesc(p,"goshnar-s-greed");
const greed=engine.initializeAuthority(greedDesc,"b".repeat(64),1000);
silence(greed);
const boss=greed.authority.mobs.find((m)=>m.boss);
must(boss&&greed.authority.greed&&greed.authority.greed.immune,"Greed não iniciou imune");
boss.def=Object.assign({},boss.def,{loot:[{item:"bag-you-desire",chance:100,min:1,max:1},{item:"gold-coin",chance:40,min:1,max:1}]});
greed.authority.greed.immune=false;greed.authority.greed.vulnerableUntil=greed.authority.clock+999999;
boss.greedImmune=false;boss.hp=1;
const afterGreed=JSON.parse(engine.advanceAuthorityState(JSON.stringify(greed),2000,3000).state);
const gp=afterGreed.authority.players[0].p;
must(!Array.isArray(gp.rewardChest),"Reward Chest online ainda é array");
must(gp.rewardChest["bag-you-desire"]===1,"Bag You Desire teve a quantidade multiplicada pelo loot rate");
must(gp.rewardChest["gold-coin"]===1,"chance 40%×2.5 deveria dropar 1 gold, sem multiplicar pilha");
must(Array.isArray(gp.rewardChestBundles)&&gp.rewardChestBundles.length===1&&
  gp.rewardChestBundles[0].items["bag-you-desire"]===1,"pacote do boss não foi gravado");
must(afterGreed.authority.players[0].p.soulWarTaints&&
  afterGreed.authority.players[0].p.soulWarTaints.bosses["goshnar-s-greed"],
  "mácula de Soul War não foi concedida no kill online");

const hatred=engine.initializeAuthority(bossDesc(player(),"goshnar-s-hatred"),"c".repeat(64),1000);
silence(hatred);
const summons=hatred.authority.mobs.filter((m)=>m.hatredSummon&&m.hp>0);
must(hatred.authority.hatred&&hatred.authority.hatred.active&&summons.length>=3&&summons.length<=5,
  "Hatred não nasceu com Dread's Torment/summons");
must(summons.some((m)=>m.slug==="hateful-soul")&&summons.every((m)=>m.exp===0&&(!m.def.loot||!m.def.loot.length)),
  "summons de Hatred não foram capados (HP/exp/loot)");
must(hatred.state.hatred&&hatred.state.mobs.some((m)=>m.hatredSummon),"snapshot de Hatred sem summons/contadores");
const afterHatred=JSON.parse(engine.advanceAuthorityState(JSON.stringify(hatred),6000,7000).state);
const counter=afterHatred.authority.hatred.counters["1"];
must(counter>=1,"contador de Dread's Torment não avançou");
afterHatred.authority.hatred.counters["1"]=10;
const hateful=afterHatred.authority.mobs.find((m)=>m.slug==="hateful-soul");
must(hateful,"Hateful Soul desapareceu");
hateful.hp=1;
const afterSoul=JSON.parse(engine.advanceAuthorityState(JSON.stringify(afterHatred),2000,9000).state);
must(afterSoul.authority.hatred&&afterSoul.authority.hatred.counters["1"]===0,
  "matar Hateful Soul não zerou os contadores");

const scarlett=engine.initializeAuthority(bossDesc(player(),"scarlett-etzel"),"d".repeat(64),1000);
silence(scarlett);
const scarlettBoss=scarlett.authority.mobs.find((m)=>m.boss);
const scarlettHp=scarlettBoss.hp;
must(scarlett.authority.scarlett&&scarlett.authority.scarlett.immune&&scarlettBoss.qteImmune,
  "Scarlett não começou imune");
const stillImmune=JSON.parse(engine.advanceAuthorityState(JSON.stringify(scarlett),2000,3000).state);
must(stillImmune.authority.scarlett.immune&&stillImmune.authority.mobs.find((m)=>m.boss).hp===scarlettHp,
  "Scarlett tomou dano durante a imunidade inicial");
const opened=JSON.parse(engine.advanceAuthorityState(JSON.stringify(stillImmune),16000,19000).state);
must(opened.authority.scarlett&&!opened.authority.scarlett.immune&&opened.authority.scarlett.phase==="vulnerable",
  "QTE idle da Scarlett não abriu a janela de vulnerabilidade");
const openedBoss=opened.authority.mobs.find((m)=>m.boss);
openedBoss.hp=Math.floor(openedBoss.maxHp*0.74);
const gated=JSON.parse(engine.advanceAuthorityState(JSON.stringify(opened),1000,20000).state);
const gatedBoss=gated.authority.mobs.find((m)=>m.boss);
must(gated.authority.scarlett.immune&&gatedBoss.hp>=Math.ceil(gatedBoss.maxHp*0.75),
  "gate de 75% da Scarlett não reaplicou imunidade");

must(engine.initializeAuthority(bossDesc(player(),"ferumbras-mortal-shell"),"e".repeat(64),1000).authority.bossId===
  "ferumbras-mortal-shell","Ferumbras não inicializa no engine");

console.log("OK: Reward Chest objeto+pacote, loot por chance, Hatred/Scarlett/Greed online e mácula Soul War.");
