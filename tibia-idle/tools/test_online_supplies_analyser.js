/* Supplies do motor autoritativo + sprites de Dust/Sliver no loot analyser. */
"use strict";
const fs=require("fs"),path=require("path");
const engine=require("../server/authoritative_engine");
const game=path.join(__dirname,"..","game");

function must(ok,msg){if(!ok)throw Error(msg);}
function clone(v){return JSON.parse(JSON.stringify(v));}

function desc(p,mob){
  const member={id:String(p.id),p:clone(p)};
  return {v:1,savedAt:1000,kind:"hunt",huntId:"rats",instanceMode:"non-pvp",
    activeCharacterId:String(p.id),members:[member],
    state:{players:[{id:String(p.id),p:member.p,cx:10,cy:10,x:10.5/30,y:10.5/30}],
      mobs:[Object.assign({id:"rat-1",slug:"rat",hp:999999,maxHp:999999,damage:0,cx:12,cy:10,x:12.5/30,y:12.5/30},mob||{})],
      events:[]}};
}
function silence(auth){
  for(const mob of auth.authority.mobs||[]){mob.damage=0;mob.attackSpeed=Number.MAX_SAFE_INTEGER;mob.attackAcc=0;}
}
function advance(auth,ms,clock){
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth),ms,clock).state);
}

const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const analyzers=fs.readFileSync(path.join(game,"js","analyzers.js"),"utf8");
must(html.includes("js/analyzers.js?v=loot-supply-v1"),"analyzers.js sem cache-bust loot-supply");
must(/js\/game\.js\?v=/.test(html),"game.js sem cache-bust");
must(analyzers.includes('dust: "assets/item/dust.gif"')&&analyzers.includes('slivers: "assets/item/sliver.gif"'),
  "loot analyser não mapeia Dust/Slivers para os gifs oficiais");
must(fs.existsSync(path.join(game,"assets","item","dust.gif")),"assets/item/dust.gif ausente");
must(fs.existsSync(path.join(game,"assets","item","sliver.gif")),"assets/item/sliver.gif ausente");

const potionPlayer={
  id:1,name:"Knight",voc:"knight",level:50,exp:engine.expForLevel(50),
  hp:80,mp:0,gold:20000,ml:10,
  skills:{sword:40,axe:10,club:10,dist:10,fist:10,shield:30},
  equip:{weapon:{item:"sword"}},
  supplies:{"health-potion":5},lootPouch:{},kills:{},bosses:{},
  config:{healSpell:"exura-ico",healSpellAt:90,healItemAt:80,manaAt:10,
    noHealthPotions:false,noManaPotions:true,spellAttack:false,
    healSupply:"health-potion",manaSupply:""},
};
const potionStart=engine.initializeAuthority(desc(potionPlayer),"c".repeat(64),1000);
silence(potionStart);
const beforeHp=potionStart.authority.players[0].p.supplies["health-potion"];
const potionAfter=advance(potionStart,2000,3000);
const pp=potionAfter.authority.players[0].p;
const pStats=potionAfter.authority.stats||potionAfter.state.stats||{};
must(pp.supplies["health-potion"]<beforeHp,"health potion não foi bebida (estoque intacto)");
must((pStats.supplyUsed&&pStats.supplyUsed["health-potion"])>=1,"stats.supplyUsed não registrou a potion");
must((Number(pStats.supplyCost)||0)>=45,"stats.supplyCost não contabilizou a potion");

const paladin={
  id:2,name:"Pally",voc:"paladin",level:50,exp:engine.expForLevel(50),
  hp:engine.maxStats({voc:"paladin",level:50}).hp,mp:200,gold:20000,ml:20,
  skills:{sword:10,axe:10,club:10,dist:80,fist:10,shield:40},
  equip:{weapon:{item:"bow"},shield:{item:"quiver"},ammo:{item:"arrow"}},
  supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:false,noHealthPotions:true,noManaPotions:true,healItemAt:10,manaAt:10},
};
const ammoStart=engine.initializeAuthority(desc(paladin),"d".repeat(64),1000);
silence(ammoStart);
const goldBefore=ammoStart.authority.players[0].p.gold;
const ammoAfter=advance(ammoStart,4000,5000);
const ap=ammoAfter.authority.players[0].p;
const aStats=ammoAfter.authority.stats||ammoAfter.state.stats||{};
must((aStats.supplyUsed&&aStats.supplyUsed.arrow)>=1,"paladino com arco não contabilizou flecha como supply");
must(ap.gold<goldBefore,"ataque à distância não cobrou a flecha");
must((Number(aStats.supplyCost)||0)>=3,"stats.supplyCost não somou a flecha");

const runePlayer={
  id:3,name:"Sorc",voc:"sorcerer",level:80,exp:engine.expForLevel(80),
  hp:engine.maxStats({voc:"sorcerer",level:80}).hp,mp:2000,gold:50000,ml:40,
  skills:{sword:10,axe:10,club:10,dist:10,fist:10,shield:20},
  equip:{weapon:{item:"wand-of-vortex"}},
  supplies:{"sudden-death-rune":8},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:true,combo:[{kind:"rune",id:"sudden-death-rune",min:1},null,null,null,null,null],
    noHealthPotions:true,noManaPotions:true,healItemAt:10,manaAt:10},
};
const runeStart=engine.initializeAuthority(desc(runePlayer),"e".repeat(64),1000);
silence(runeStart);
const runeStock=runeStart.authority.players[0].p.supplies["sudden-death-rune"];
const runeAfter=advance(runeStart,4000,5000);
const rp=runeAfter.authority.players[0].p;
const rStats=runeAfter.authority.stats||runeAfter.state.stats||{};
must(rp.supplies["sudden-death-rune"]<runeStock,"runa do combo não foi consumida");
must((rStats.supplyUsed&&rStats.supplyUsed["sudden-death-rune"])>=1,"stats.supplyUsed não registrou a runa");

const ekMax=engine.maxStats({voc:"knight",level:200,equip:{}});
const ek={
  id:4,name:"Kina",voc:"knight",level:200,exp:engine.expForLevel(200),
  hp:ekMax.hp,mp:Math.floor(ekMax.mp*0.1),gold:80000,ml:10,
  skills:{sword:80,axe:10,club:10,dist:10,fist:10,shield:70},
  equip:{weapon:{item:"sword"}},
  supplies:{},lootPouch:{},kills:{},bosses:{},
  config:{spellAttack:false,noHealthPotions:true,noManaPotions:false,healItemAt:10,manaAt:80,
    healSupply:"",manaSupply:"great-mana-potion"},
};
const ekStart=engine.initializeAuthority(desc(ek),"f".repeat(64),1000);
silence(ekStart);
const ekAfter=advance(ekStart,2000,3000);
const ekStats=ekAfter.authority.stats||ekAfter.state.stats||{};
must((ekStats.supplyUsed&&ekStats.supplyUsed["great-mana-potion"])>=1,
  "EK não bebeu great mana potion (15.25, todas as vocações)");

const ekWrong=Object.assign({},ek,{id:5,name:"Kina2",
  config:Object.assign({},ek.config,{manaSupply:"ultimate-mana-potion"})});
const ekWStart=engine.initializeAuthority(desc(ekWrong),"g".repeat(64),1000);
silence(ekWStart);
const ekWAfter=advance(ekWStart,2000,3000);
const ekWStats=ekWAfter.authority.stats||ekWAfter.state.stats||{};
const ekManaUsed=Object.keys(ekWStats.supplyUsed||{}).filter((k)=>/mana-potion/.test(k));
must(ekManaUsed.length>=1 && !ekWStats.supplyUsed["ultimate-mana-potion"],
  "EK com potion de vocação errada precisa cair no fallback de mana");

const gameSrc=fs.readFileSync(path.join(game,"js","game.js"),"utf8");
must(gameSrc.includes("previous.stats.supplyUsed")&&gameSrc.includes("supplyCost"),
  "applyOnlineAuthorityState não copia supplyUsed/supplyCost");

console.log("OK: potions/runas/ammo entram em supplyUsed+supplyCost e Dust/Sliver usam os gifs.");
