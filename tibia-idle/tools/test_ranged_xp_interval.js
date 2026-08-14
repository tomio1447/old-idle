/* Paladin ammo, rune CD, weapon interval, and XP/level on the authoritative engine. */
"use strict";
const engine=require("../server/authoritative_engine");
function must(ok,msg){if(!ok)throw Error(msg);}
function clone(v){return JSON.parse(JSON.stringify(v));}
function descriptor(p,mobs){
  const member={id:String(p.id),p:clone(p)};
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",activeCharacterId:String(p.id),
    members:[member],state:{gridW:30,gridH:30,players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:(mobs||[{id:"rat-one",slug:"rat",cx:11,cy:10,x:11.5/30,y:10.5/30}]),events:[]}};
}
function silenceMobs(auth){
  for(const mob of auth.mobs||[]){mob.damage=0;mob.attackAcc=-100000;mob.def=Object.assign({},mob.def,{skills:[]});}
}
function playerHits(state){return (state.state.events||[]).filter((e)=>e.t==="hit"&&!e.spellId&&!e.rune);}
function runeHits(state){return (state.state.events||[]).filter((e)=>e.t==="hit"&&e.rune);}

(async()=>{
  must(typeof engine.playerAttackInterval==="function"&&typeof engine.addExp==="function"&&
    typeof engine.syncPlayerProgress==="function"&&typeof engine.consumeDistanceAmmo==="function",
    "helpers de ranged/XP não exportados");
  must(engine.ITEMS.bow&&(engine.ITEMS.bow.type==="distance"||engine.ITEMS.bow.t==="distance"),
    "bow não é distance no catálogo");
  must(engine.ITEMS.arrow&&engine.ITEMS["sniper-arrow"]&&engine.ITEMS.bolt&&engine.ITEMS.quiver,
    "ammo/quiver ausentes no catálogo");
  must(engine.ITEMS["burst-arrow"]&&engine.ITEMS["burst-arrow"].areaMatrix&&
    engine.ITEMS["diamond-arrow"]&&engine.ITEMS["diamond-arrow"].areaMatrix,
    "matrizes de burst/diamond arrow não importadas");
  must(engine.RUNEDATA["light-magic-missile-rune"]||engine.RUNEDATA["heavy-magic-missile-rune"],
    "RUNEDATA sem runa de ataque");

  const paladin={id:1,name:"Ranger",voc:"paladin",level:50,exp:engine.expForLevel(50),hp:800,mp:400,gold:5000,ml:20,
    skills:{fist:10,sword:10,axe:10,club:10,dist:90,shield:40},
    equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"sniper-arrow"}},
    supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}};
  const bowAuth=engine.initializeAuthority(descriptor(paladin),"r".repeat(64),1000);
  silenceMobs(bowAuth.authority);
  bowAuth.authority.mobs[0].hp=bowAuth.authority.mobs[0].maxHp=999999;
  bowAuth.authority.players[0].attackAcc=1200;
  const goldBefore=bowAuth.authority.players[0].p.gold;
  const hpBefore=bowAuth.authority.mobs[0].hp;
  const bowAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(bowAuth),1000,2000).state);
  const bowHit=playerHits(bowAfter).find((e)=>e.projectile);
  must(bowHit&&bowHit.dmg>0&&bowAfter.authority.mobs[0].hp<hpBefore,
    "paladin com bow/quiver/arrow não causou dano ranged");
  must(bowAfter.authority.players[0].p.gold<goldBefore,
    "tiro distance não consumiu gold da munição");
  must(!bowAfter.state.events.some((e)=>e.t==="miss"&&e.reason==="ammo"),
    "bow com quiver e sniper-arrow falhou por munição");

  const xbow=Object.assign({},clone(paladin),{id:2,
    equip:{weapon:{item:"crossbow"},shield:{item:"quiver"},ammo:{item:"bolt"}}});
  const prevBoltMiss=engine.ITEMS.bolt.noMiss;
  engine.ITEMS.bolt.noMiss=1;
  let boltAfter;
  try{
    const boltAuth=engine.initializeAuthority(descriptor(xbow),"b".repeat(64),1000);
    silenceMobs(boltAuth.authority);
    boltAuth.authority.mobs[0].hp=boltAuth.authority.mobs[0].maxHp=999999;
    boltAuth.authority.players[0].attackAcc=1200;
    const boltGold=boltAuth.authority.players[0].p.gold;
    boltAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(boltAuth),1000,2000).state);
    must(playerHits(boltAfter).some((e)=>e.dmg>0)&&boltAfter.authority.players[0].p.gold<boltGold,
      "crossbow+bolt não consumiu munição nem causou dano");
  }finally{
    if(prevBoltMiss===undefined)delete engine.ITEMS.bolt.noMiss;
    else engine.ITEMS.bolt.noMiss=prevBoltMiss;
  }

  const noAmmo=Object.assign({},clone(paladin),{id:3,equip:{weapon:{item:"bow"},ammo:{item:"sniper-arrow"}}});
  const noAmmoAuth=engine.initializeAuthority(descriptor(noAmmo),"n".repeat(64),1000);
  silenceMobs(noAmmoAuth.authority);
  noAmmoAuth.authority.players[0].attackAcc=1200;
  const noAmmoAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(noAmmoAuth),1000,2000).state);
  must(noAmmoAfter.state.events.some((e)=>e.t==="miss"&&e.reason==="ammo")&&!playerHits(noAmmoAfter).length,
    "bow sem quiver ainda disparou");

  const runeId=engine.RUNEDATA["light-magic-missile-rune"]?"light-magic-missile-rune":"heavy-magic-missile-rune";
  const mage={id:4,name:"RuneMage",voc:"sorcerer",level:50,exp:engine.expForLevel(50),hp:400,mp:800,gold:5000,ml:40,
    skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:20},equip:{},
    supplies:{[runeId]:5},lootPouch:{},kills:{},bosses:{},
    config:{spellAttack:false,useRunes:true,combo:[{kind:"rune",id:runeId,min:1}]}};
  const runeAuth=engine.initializeAuthority(descriptor(mage),"u".repeat(64),1000);
  silenceMobs(runeAuth.authority);
  runeAuth.authority.mobs[0].hp=runeAuth.authority.mobs[0].maxHp=999999;
  runeAuth.authority.players[0].attackAcc=1200;
  const runeAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(runeAuth),1000,2000).state);
  const runeHit=runeHits(runeAfter)[0];
  must(runeHit&&runeHit.dmg>0, "runa de ataque não causou dano");
  must(runeAfter.authority.players[0].p.supplies[runeId]===4, "runa não consumiu carga");
  must(Number(runeAfter.authority.players[0].p._runeCd)>Number(runeAfter.authority.clock), "runa não aplicou cooldown");
  must(Number(runeAfter.authority.players[0].p._offensiveCd)>=Number(runeAfter.authority.clock)+1000, "runa não aplicou group CD de 2s");
  runeAfter.authority.players[0].attackAcc=1200;
  const runeAgain=JSON.parse(engine.advanceAuthorityState(JSON.stringify(runeAfter),1000,3000).state);
  must(runeHits(runeAgain).length===0&&runeAgain.authority.players[0].p.supplies[runeId]===4,
    "runa disparou de novo dentro do cooldown");

  const knight={id:5,name:"Slow",voc:"knight",level:20,exp:engine.expForLevel(20),hp:500,mp:50,gold:100,
    skills:{fist:10,sword:40,axe:10,club:10,dist:10,shield:30},equip:{weapon:{item:"sword"}},
    supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}};
  must(engine.playerAttackInterval(knight)===1200, "intervalo padrão da sword não é 1200");
  const waitAuth=engine.initializeAuthority(descriptor(knight),"i".repeat(64),1000);
  silenceMobs(waitAuth.authority);
  waitAuth.authority.mobs[0].hp=waitAuth.authority.mobs[0].maxHp=999999;
  waitAuth.authority.players[0].attackAcc=0;
  const waitAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(waitAuth),1000,2000).state);
  must(playerHits(waitAfter).length===0&&waitAfter.authority.players[0].attackAcc===1000,
    "arma de 1200ms disparou no primeiro segundo com acc 0");
  const readyAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(waitAfter),1000,3000).state);
  must(playerHits(readyAfter).length>=1, "arma de 1200ms não disparou após 2s");

  const prevSpeed=engine.ITEMS.sword.attackSpeed;
  engine.ITEMS.sword.attackSpeed=2000;
  try{
    must(engine.playerAttackInterval(knight)===2000, "attackSpeed da arma não entrou no intervalo");
    const slowAuth=engine.initializeAuthority(descriptor(knight),"s".repeat(64),1000);
    silenceMobs(slowAuth.authority);
    slowAuth.authority.mobs[0].hp=slowAuth.authority.mobs[0].maxHp=999999;
    slowAuth.authority.players[0].attackAcc=0;
    const slow1=JSON.parse(engine.advanceAuthorityState(JSON.stringify(slowAuth),1000,2000).state);
    must(playerHits(slow1).length===0, "arma lenta de 2000ms disparou em 1s");
    const slow2=JSON.parse(engine.advanceAuthorityState(JSON.stringify(slow1),1000,3000).state);
    must(playerHits(slow2).length===1, "arma lenta de 2000ms não disparou exatamente uma vez em 2s");
  }finally{
    if(prevSpeed===undefined)delete engine.ITEMS.sword.attackSpeed;
    else engine.ITEMS.sword.attackSpeed=prevSpeed;
  }

  const pup={id:6,name:"Pup",voc:"knight",level:1,exp:0,hp:185,mp:5,gold:100,
    skills:{fist:10,sword:20,axe:10,club:10,dist:10,shield:10},equip:{weapon:{item:"sword"}},
    supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}};
  const xpAuth=engine.initializeAuthority(descriptor(pup),"x".repeat(64),1000);
  silenceMobs(xpAuth.authority);
  xpAuth.authority.mobs[0].hp=1;xpAuth.authority.players[0].attackAcc=1200;
  const xpBefore=xpAuth.authority.players[0].p.exp;
  const xpAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(xpAuth),1000,2000).state);
  const kill=xpAfter.state.events.find((e)=>e.t==="kill");
  const gained=xpAfter.authority.players[0].p.exp-xpBefore;
  must(gained>0, "matar o rato não escreveu p.exp");
  must(kill&&Number(kill.exp)===gained, "floater de kill usou EXP crua em vez da share concedida");
  must(xpAfter.authority.players[0].p.level>=2, "EXP do rato com stage não subiu de nível");
  must(Array.isArray(kill.shares)&&kill.shares[0]&&kill.shares[0].exp===gained,
    "kill event não trouxe shares por personagem");

  const desynced={id:7,name:"Desync",voc:"knight",level:8,exp:0,hp:185,mp:5,gold:100,
    skills:{fist:10,sword:20,axe:10,club:10,dist:10,shield:10},equip:{weapon:{item:"sword"}},
    supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}};
  const floor=engine.expForLevel(8);
  const synced=engine.syncPlayerProgress(clone(desynced));
  must(synced.exp>=floor&&synced.level>=8, "syncPlayerProgress não ancorou exp no nível persistido");
  const desyncAuth=engine.initializeAuthority(descriptor(desynced),"d".repeat(64),1000);
  must(desyncAuth.authority.players[0].p.exp>=floor,
    "canonicalPlayer deixou level 8 com exp 0");
  silenceMobs(desyncAuth.authority);
  desyncAuth.authority.mobs[0].hp=1;desyncAuth.authority.players[0].attackAcc=1200;
  const desyncBefore=desyncAuth.authority.players[0].p.exp;
  const desyncAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(desyncAuth),1000,2000).state);
  must(desyncAfter.authority.players[0].p.exp>desyncBefore,
    "personagem com level/exp dessincronizados não recebeu EXP no p.exp");

  const a={id:8,name:"A",voc:"knight",level:20,exp:engine.expForLevel(20),hp:500,mp:50,gold:100,
    skills:{sword:20,axe:10,club:10,dist:10,fist:10,shield:20},equip:{weapon:{item:"sword"}},
    supplies:{},lootPouch:{},kills:{},bosses:{},config:{spellAttack:false,combo:[]}};
  const b=Object.assign({},clone(a),{id:9,name:"B",voc:"paladin"});
  const partyDesc=descriptor(a);
  partyDesc.members.push({id:"9",p:b});
  partyDesc.state.players.push({id:"9",p:b,cx:10,cy:11,x:10.5/30,y:11.5/30});
  const partyAuth=engine.initializeAuthority(partyDesc,"p".repeat(64),1000);
  silenceMobs(partyAuth.authority);
  partyAuth.authority.mobs[0].hp=1;
  for(const item of partyAuth.authority.players)item.attackAcc=1200;
  const expA=partyAuth.authority.players[0].p.exp,expB=partyAuth.authority.players[1].p.exp;
  const partyAfter=JSON.parse(engine.advanceAuthorityState(JSON.stringify(partyAuth),1000,2000).state);
  must(partyAfter.authority.players[0].p.exp>expA&&partyAfter.authority.players[1].p.exp>expB,
    "membros vivos da party não receberam EXP no p.exp");

  console.log("test_ranged_xp_interval: ok");
})().catch((err)=>{console.error(err&&err.stack||err);process.exit(1);});
