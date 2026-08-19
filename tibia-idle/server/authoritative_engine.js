/* Combate online autoritativo e determinístico (browser + worker). */
"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto"),vm=require("vm");
const DATA=path.join(__dirname,"..","game","data");
let WAND_SHOOT={};
try{WAND_SHOOT=require(path.join(__dirname,"..","game","js","wandshootdata.js"))||{};}
catch(e){WAND_SHOOT={};}
const CanaryVocation=require(path.join(__dirname,"..","game","js","canary-vocation.js"));
let HELPER_PRESET_CONFIG_FIELDS=[];
try{const hp=require(path.join(__dirname,"..","game","js","helper-presets.js"));HELPER_PRESET_CONFIG_FIELDS=Array.isArray(hp.HELPER_PRESET_CONFIG_FIELDS)?hp.HELPER_PRESET_CONFIG_FIELDS:[];}catch(e){HELPER_PRESET_CONFIG_FIELDS=[];}
const Loyalty=require(path.join(__dirname,"..","game","js","loyalty.js"));
const loyaltySkillBonus=Loyalty.loyaltySkillBonus;
const loyaltyExpMultiplier=Loyalty.loyaltyExpMultiplier;
const spellAllowedForVoc=CanaryVocation.spellAllowedForVoc;
const vocationRegenSpec=CanaryVocation.vocationRegenSpec;
const applyVocationRegen=CanaryVocation.applyVocationRegen;
const applyVocationRegenTo=CanaryVocation.applyVocationRegenTo;
const friendHealSpellIds=CanaryVocation.friendHealSpellIds;
const selfHealSpellIds=CanaryVocation.selfHealSpellIds;
const sanitizePlayerSpells=(p,spells)=>CanaryVocation.sanitizePlayerSpells(p,spells||ALL_SPELLS);
function read(name){return JSON.parse(fs.readFileSync(path.join(DATA,name),"utf8"));}
const MONSTERS=Object.assign({},read("monsters.json"),read("canarymonsters.json"));
function ensureWorldBossMonster(slug,name,hp){
  const cur=MONSTERS[slug];
  if(cur&&Number(cur.hp)>0)return;
  MONSTERS[slug]=Object.assign({},cur||{},{
    name:name,hp:hp,exp:0,damage:Math.max(80,Math.floor(hp/8000)),
    armor:80,defense:80,attackSpeed:2000,speed:230,loot:[],
  });
}
ensureWorldBossMonster("deathstrike","The Deathstrike",2500000);
ensureWorldBossMonster("gnomevil","Gnomevil",4000000);
ensureWorldBossMonster("abyssador","The Abyssador",6000000);
/* Megalomania: Bag You Desire +50% vs mini-bosses (0.1% → 0.15%). */
for(const slug of ["goshnar-s-megalomania-green","goshnar-s-megalomania-blue"]){
  const m=MONSTERS[slug];if(!m||!Array.isArray(m.loot))continue;
  for(const drop of m.loot)if(drop&&drop.item==="bag-you-desire")drop.chance=0.15;
}
const ITEMS=read("items.json"),AMMO=read("ammo.json"),QUIVER_DATA=read("quivers.json"),QUIVERS=QUIVER_DATA.quivers||{};
const SPELLS_RAW=read("spells.json"),ALL_SPELLS=SPELLS_RAW.spells||SPELLS_RAW,SPELL_FX=read("spellfx.json"),
  AREA_DATA=read("areas.json"),SPELL_TARGET=read("spelltarget.json");
if(ALL_SPELLS["exeta-res"]){ALL_SPELLS["exeta-res"].cd=5000;ALL_SPELLS["exeta-res"].range=7;}
if(ALL_SPELLS["exeta-amp-res"]){ALL_SPELLS["exeta-amp-res"].range=7;ALL_SPELLS["exeta-amp-res"].alvos=9;}
/* 15.25 runtime patches (mesmo contrato do cliente em spelldata_1525.js).
 * O motor lê só JSON estático; AREA_BARRAGE / AREA_ECHO, magias novas e
 * chain não existem no import Canary. Não vm-roda o JS do cliente: ele
 * depende de window.SPELLDATA / SPELLTARGET / AREADATA / MONKSPELLDATA. */
(function applySpellPatch1525(){
  const barr=[];
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    if(Math.abs(dx)===2&&Math.abs(dy)===2)continue;
    barr.push([dx,dy]);
  }
  const echo=[];
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)echo.push([dx,dy]);
  AREA_DATA.AREA_BARRAGE={e:barr,n:barr,s:barr,w:barr,sqm:21};
  AREA_DATA.AREA_ECHO={e:echo,n:echo,s:echo,w:echo,sqm:25};
  Object.assign(SPELL_TARGET,{
    "exevo-dir-san":{areaNome:"AREA_BARRAGE",blockWalls:1,needTarget:1,nome:"Divine Barrage",range:5,words:"exevo dir san"},
    "exevo-dir-moe":{areaNome:"AREA_BARRAGE",blockWalls:1,needTarget:1,nome:"Ethereal Barrage",range:5,words:"exevo dir moe"},
    "exevo-fur-frigo":{blockWalls:1,needTarget:1,nome:"Forked Glacier",range:7,words:"exevo fur frigo"},
    "exevo-fur-tera":{blockWalls:1,needTarget:1,nome:"Forked Thorns",range:7,words:"exevo fur tera"},
    "exevo-mort-ora":{areaNome:"AREA_ECHO",blockWalls:1,needTarget:1,nome:"Death Echo",range:5,words:"exevo mort ora"},
  });
  if(SPELL_TARGET["exori-amp-vis"])SPELL_TARGET["exori-amp-vis"].range=7;
  if(SPELL_TARGET["exevo-gran-frigo-hur"])SPELL_TARGET["exevo-gran-frigo-hur"].areaNome="AREA_WAVE7";
  /* Ondas/feixes Canary: a matriz mora em spells.json, mas spelltarget.json
   * omite areaNome em vis hur / vis lux / gran vis lux. Sem o nome a
   * autoridade ainda resolve s.area; o cliente (areaNameOf) e o FX caem
   * no fallback N-nearest. Length×width = a matriz do register_spells.lua. */
  const CANARY_DIR_AREAS={
    "exevo-flam-hur":"AREA_WAVE4","exevo-frigo-hur":"AREA_WAVE4",
    "exevo-infir-flam-hur":"AREA_WAVE4","exevo-infir-frigo-hur":"AREA_WAVE4",
    "exevo-dis-flam-hur":"AREA_WAVE4","exevo-gran-flam-hur":"AREA_WAVE7",
    "exevo-gran-frigo-hur":"AREA_WAVE7","exevo-vis-hur":"AREA_SQUAREWAVE5",
    "exevo-tera-hur":"AREA_SQUAREWAVE5","exevo-vis-lux":"AREA_BEAM5",
    "exevo-gran-vis-lux":"AREA_BEAM8","exevo-max-mort":"AREA_BEAM6",
    "exori-min":"AREA_WAVE6",
  };
  for(const id of Object.keys(CANARY_DIR_AREAS)){
    const nome=CANARY_DIR_AREAS[id],s=ALL_SPELLS[id],meta=SPELL_TARGET[id]||(SPELL_TARGET[id]={});
    if(s)s.area=nome;
    meta.areaNome=nome;
  }
  function escala(id,fator){
    const s=ALL_SPELLS[id],f=s&&s.f;if(!f)return;
    for(const k of ["mlMin","mlMax","flatMin","flatMax","saMin","saMax","skMin","skMax","atMin","atMax"])
      if(typeof f[k]==="number")f[k]*=fator;
  }
  if(ALL_SPELLS["exori"])ALL_SPELLS["exori"].mana=125;
  if(ALL_SPELLS["exori-gran"])ALL_SPELLS["exori-gran"].mana=360;
  if(ALL_SPELLS["exori-mas"])ALL_SPELLS["exori-mas"].mana=200;
  if(ALL_SPELLS["exura-infir-ico"]){
    const s=ALL_SPELLS["exura-infir-ico"];
    s.f={modo:"magic",lvlMin:0.2,mlMin:1.795,flatMin:15,lvlMax:0.2,mlMax:1.795,flatMax:30};
    s.grupos={"2":2000};s.gcd=2000;
  }
  if(ALL_SPELLS["exura-ico"]){
    const s=ALL_SPELLS["exura-ico"];s.mana=60;
    s.f={modo:"magic",lvlMin:0.2,mlMin:4,flatMin:70,lvlMax:0.2,mlMax:7.95,flatMax:143};
    s.grupos={"2":2000};s.gcd=2000;
  }
  if(ALL_SPELLS["exura-med-ico"]){
    const s=ALL_SPELLS["exura-med-ico"];s.mana=135;
    s.f={modo:"magic",lvlMin:0.4,mlMin:8,flatMin:225,lvlMax:0.4,mlMax:15.9,flatMax:459};
    s.grupos={"2":2000};s.gcd=2000;
  }
  if(ALL_SPELLS["exura-gran-ico"]){
    const s=ALL_SPELLS["exura-gran-ico"];s.mana=300;s.cd=120000;
    s.f={modo:"magic",lvlMin:0.2,mlMin:70,flatMin:500,lvlMax:0.2,mlMax:92,flatMax:620};
    s.grupos={"2":2000};s.gcd=2000;
  }
  for(const [id,r] of [["exori-gran-flam",125/90],["exori-gran-vis",125/90],
    ["exori-gran-tera",115/90],["exori-gran-frigo",115/90],
    ["exori-max-flam",210/150],["exori-max-vis",210/150],
    ["exori-max-tera",195/150],["exori-max-frigo",195/150]]){
    escala(id,r);
    if(ALL_SPELLS[id])ALL_SPELLS[id].range=7;
    if(SPELL_TARGET[id])SPELL_TARGET[id].range=7;
  }
  if(ALL_SPELLS["exori-amp-vis"]){
    const s=ALL_SPELLS["exori-amp-vis"];
    escala("exori-amp-vis",110/70);s.range=7;s.chain=3;
  }
  escala("exevo-mas-san",(160/140)*1.30); // 15.25 base + idle +30%
  escala("exevo-gran-mas-tera",175/150);
  escala("exura-gran-san",500/400);
  escala("exori-min",80/72);
  if(ALL_SPELLS["exevo-max-mort"])ALL_SPELLS["exevo-max-mort"].lvl=66;
  if(ALL_SPELLS["exana-amp-res"])ALL_SPELLS["exana-amp-res"].range=7;
  if(SPELL_TARGET["exana-amp-res"])SPELL_TARGET["exana-amp-res"].range=7;
  if(ALL_SPELLS["utamo-tempo-san"]){
    ALL_SPELLS["utamo-tempo-san"].cd=4000;
    ALL_SPELLS["utamo-tempo-san"].grupos={"3":2000,"7":2000};
  }
  if(ALL_SPELLS["exori-amp-pug"]){ALL_SPELLS["exori-amp-pug"].cd=12000;ALL_SPELLS["exori-amp-pug"].monkPow=85;}
  if(ALL_SPELLS["exura-mas-nia"]){ALL_SPELLS["exura-mas-nia"].mana=400;ALL_SPELLS["exura-mas-nia"].icon=206;}
  if(ALL_SPELLS["utito-tempo"])Object.assign(ALL_SPELLS["utito-tempo"],{
    lvl:20,mana:20,icon:187,stance:1,cd:2000,grupos:{"3":2000,"7":2000},gcd:2000});
  if(ALL_SPELLS["utamo-tempo"])Object.assign(ALL_SPELLS["utamo-tempo"],{
    lvl:20,mana:20,icon:188,stance:1,cd:2000,grupos:{"3":2000,"7":2000},gcd:2000});
  if(ALL_SPELLS["utito-tempo-san"]){
    ALL_SPELLS["utori-con"]=Object.assign({},ALL_SPELLS["utito-tempo-san"],{
      id:"utori-con",words:"utori con",name:"Sharpshooter",
      lvl:20,mana:250,icon:189,stance:1,cd:10000,grupos:{"3":2000,"7":10000},gcd:2000});
    delete ALL_SPELLS["utito-tempo-san"];
  }
  if(ALL_SPELLS["exevo-gran-frigo-hur"]){
    ALL_SPELLS["exevo-gran-frigo-hur"].cd=4000;
    ALL_SPELLS["exevo-gran-frigo-hur"].area="AREA_WAVE7";
    ALL_SPELLS["exevo-gran-frigo-hur"].alvos=17;
  }
  if(ALL_SPELLS["exura-gran-sio"]){
    const s=ALL_SPELLS["exura-gran-sio"];
    escala("exura-gran-sio",2000/650);s.lvl=275;s.cd=15000;
  }
  if(!ALL_SPELLS["exura-gran-tio-sio"]){
    const src=ALL_SPELLS["exura-gran-sio"]||{};
    ALL_SPELLS["exura-gran-tio-sio"]={
      id:"exura-gran-tio-sio",name:"Restore Friend",words:"exura gran tio sio",
      type:"heal",vocs:["druid"],mana:500,lvl:275,cd:30000,needTarget:true,range:7,premium:true,
      f:src.f?Object.assign({},src.f):undefined,
      grupos:src.grupos?Object.assign({},src.grupos):{"2":1000},gcd:src.gcd||1000};
  }else ALL_SPELLS["exura-gran-tio-sio"].cd=30000;
  Object.assign(ALL_SPELLS,{
    "exori-ico-scu":{id:"exori-ico-scu",sid:298,name:"Shield Bash",words:"exori ico scu",type:"attack",
      lvl:18,mana:30,soul:0,ml:0,icon:191,vocs:["knight"],cd:4000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"physical",range:1,
      shieldSpell:1,weakNext:0.5,fx:"shield-bash-effect",
      f:{modo:"skill",saMin:0,skMin:0.35,atMin:0.35,lvlMin:0.2,flatMin:44,saMax:0,skMax:0.6,atMax:0.6,lvlMax:0.2,flatMax:66},aggr:true},
    "exori-scu":{id:"exori-scu",sid:299,name:"Shield Slam",words:"exori scu",type:"attack",
      lvl:30,mana:110,soul:0,ml:0,icon:192,vocs:["knight"],cd:6000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"attack",element:"physical",
      area:"AREA_SQUARE1X1",alvos:8,shieldSpell:1,weakNext:0.5,fx:"shield-bash-effect",
      f:{modo:"skill",saMin:0,skMin:0.3,atMin:0.3,lvlMin:0.2,flatMin:42,saMax:0,skMax:0.5,atMax:0.5,lvlMax:0.2,flatMax:62},aggr:true},
    "exevo-dir-san":{id:"exevo-dir-san",sid:300,name:"Divine Barrage",words:"exevo dir san",type:"attack",
      lvl:70,mana:175,soul:0,ml:0,icon:193,vocs:["paladin"],cd:4000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"holy",
      area:"AREA_BARRAGE",alvos:21,range:5,fx:"divine-barrage-effect",
      f:{modo:"magic",lvlMin:0.2,mlMin:4,flatMin:112,lvlMax:0.2,mlMax:6,flatMax:168},aggr:true},
    "exevo-dir-moe":{id:"exevo-dir-moe",sid:301,name:"Ethereal Barrage",words:"exevo dir moe",type:"attack",
      lvl:60,mana:135,soul:0,ml:0,icon:194,vocs:["paladin"],cd:4000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"physical",
      area:"AREA_BARRAGE",alvos:21,range:5,fx:"ethereal-barrage-effect",
      f:{modo:"skill",saMin:0,skMin:0.33333,atMin:0,lvlMin:0.2,flatMin:32,saMax:0,skMax:1,atMax:0,lvlMax:0.2,flatMax:48},aggr:true},
    "exevo-fur-frigo":{id:"exevo-fur-frigo",sid:302,name:"Forked Glacier",words:"exevo fur frigo",type:"attack",
      lvl:90,mana:180,soul:0,ml:0,icon:195,vocs:["druid"],cd:6000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"ice",chain:7,chainDist:4,range:7,
      fx:"forked-glacier-effect",missile:"ice",chainFx:"chain-effect-blue",
      f:{modo:"magic",lvlMin:0.2,mlMin:3,flatMin:78,lvlMax:0.2,mlMax:4.5,flatMax:116},aggr:true},
    "exevo-fur-tera":{id:"exevo-fur-tera",sid:303,name:"Forked Thorns",words:"exevo fur tera",type:"attack",
      lvl:80,mana:180,soul:0,ml:0,icon:196,vocs:["druid"],cd:6000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"earth",chain:6,chainDist:4,range:7,
      fx:"forked-thorns-effect",missile:"earth",chainFx:"chain-effect-green",
      f:{modo:"magic",lvlMin:0.2,mlMin:3,flatMin:84,lvlMax:0.2,mlMax:4.5,flatMax:126},aggr:true},
    "exevo-mort-ora":{id:"exevo-mort-ora",sid:304,name:"Death Echo",words:"exevo mort ora",type:"attack",
      lvl:120,mana:150,soul:0,ml:0,icon:197,vocs:["sorcerer"],cd:6000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"death",
      area:"AREA_ECHO",alvos:25,range:5,echo:0.5,fx:"death-echo-effect",missile:"death",
      f:{modo:"magic",lvlMin:0.2,mlMin:3,flatMin:68,lvlMax:0.2,mlMax:5,flatMax:102},aggr:true},
    "exori-mas-amp-pug":{id:"exori-mas-amp-pug",sid:305,name:"Thousand Fist Blows",words:"exori mas amp pug",type:"attack",
      lvl:120,mana:145,soul:0,ml:0,icon:205,vocs:["monk"],cd:12000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"physical",range:1,
      monk:"builder",monkPow:62,area:"AREA_SQUARE1X1",alvos:9,fx:"thousand-fist-effect",aggr:true},
    "exori-infir-amp-pug":{id:"exori-infir-amp-pug",sid:306,name:"Lesser Mystic Repulse",words:"exori infir amp pug",type:"attack",
      lvl:6,mana:30,soul:0,ml:0,icon:207,vocs:["monk"],cd:20000,grupos:{"1":2000},gcd:2000,
      premium:false,needTarget:true,param:false,group:"attack",element:"physical",range:7,
      monk:"builder",monkPow:25,fx:"blow-white",aggr:true},
    "utori-hur":{id:"utori-hur",sid:307,name:"Divine Defiance",words:"utori hur",type:"support",
      lvl:20,mana:250,soul:0,ml:0,icon:190,vocs:["paladin"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-divine-defiance",aggr:false},
    "uteta-flam":{id:"uteta-flam",sid:308,name:"Master of Flames",words:"uteta flam",type:"support",
      lvl:20,mana:400,soul:0,ml:0,icon:198,vocs:["sorcerer"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-master-flames",aggr:false},
    "uteta-vis":{id:"uteta-vis",sid:309,name:"Master of Thunder",words:"uteta vis",type:"support",
      lvl:20,mana:400,soul:0,ml:0,icon:199,vocs:["sorcerer"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-master-thunder",aggr:false},
    "uteta-mort":{id:"uteta-mort",sid:310,name:"Master of Decay",words:"uteta mort",type:"support",
      lvl:20,mana:400,soul:0,ml:0,icon:200,vocs:["sorcerer"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-master-decay",aggr:false},
    "exori-kor-tempo":{id:"exori-kor-tempo",sid:311,name:"Aura of Sapped Strength",words:"exori kor tempo",type:"support",
      lvl:175,mana:1500,soul:0,ml:0,icon:201,vocs:["sorcerer"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-sapped-strength",aggr:false},
    "exori-moe-tempo":{id:"exori-moe-tempo",sid:312,name:"Aura of Exposed Weakness",words:"exori moe tempo",type:"support",
      lvl:175,mana:1500,soul:0,ml:0,icon:202,vocs:["sorcerer"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-exposed-weakness",aggr:false},
    "utura-sio":{id:"utura-sio",sid:313,name:"Shared Conservation",words:"utura sio",type:"support",
      lvl:20,mana:400,soul:0,ml:0,icon:203,vocs:["druid"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-shared-conservation",aggr:false},
    "utito-dru":{id:"utito-dru",sid:314,name:"Elemental Synthesis",words:"utito dru",type:"support",
      lvl:20,mana:400,soul:0,ml:0,icon:204,vocs:["druid"],cd:10000,grupos:{"3":2000,"7":10000},gcd:2000,
      premium:true,needTarget:false,param:false,group:"support",stance:1,fx:"stance-elemental-synthesis",aggr:false},
  });
  Object.assign(SPELL_TARGET,{
    "exori-ico-scu":{blockWalls:1,needTarget:1,nome:"Shield Bash",range:1,words:"exori ico scu"},
    "exori-scu":{areaNome:"AREA_SQUARE1X1",self:1,nome:"Shield Slam",words:"exori scu"},
    "exori-mas-amp-pug":{areaNome:"AREA_SQUARE1X1",blockWalls:1,needTarget:1,nome:"Thousand Fist Blows",range:1,words:"exori mas amp pug"},
    "exori-infir-amp-pug":{blockWalls:1,needTarget:1,nome:"Lesser Mystic Repulse",range:7,words:"exori infir amp pug"},
  });
  for(const id of ["exori","exori-gran","exori-mas","exori-min"]){
    SPELL_TARGET[id]=Object.assign({},SPELL_TARGET[id]||{},{self:1});
    const s=ALL_SPELLS[id],meta=SPELL_TARGET[id];
    if(s&&meta&&meta.areaNome)s.area=meta.areaNome;
  }
  for(const id of Object.keys(SPELL_TARGET)){
    const s=ALL_SPELLS[id],meta=SPELL_TARGET[id];
    if(s&&meta&&meta.areaNome&&typeof s.area!=="string")s.area=meta.areaNome;
  }
  SPELL_FX.words=SPELL_FX.words||{};SPELL_FX.names=SPELL_FX.names||{};
  Object.assign(SPELL_FX.words,{
    "exori ico scu":{fx:"shield-bash-effect"},"exori scu":{fx:"shield-bash-effect"},
    "exevo dir san":{fx:"divine-barrage-effect"},"exevo dir moe":{fx:"ethereal-barrage-effect"},
    "exevo tempo mas san":{fx:"divine-grenade-effect"},
    "exevo fur frigo":{fx:"forked-glacier-effect",miss:"ice"},
    "exevo fur tera":{fx:"forked-thorns-effect",miss:"earth"},
    "exevo mort ora":{fx:"death-echo-effect",miss:"death"},
    "exori mas amp pug":{fx:"thousand-fist-effect"},
    // Canary CONST_ANI_ETHEREALSPEAR — never the wooden spear strip.
    "exori con":{fx:"hit-area",miss:"ethereal-spear"},
    "exori gran con":{fx:"hit-area",miss:"ethereal-spear"},
    "exori infir con":{fx:"hit-area",miss:"ethereal-spear"},
    "utito tempo":{fx:"stance-blood-rage"},"utamo tempo":{fx:"stance-protector"},
    "utori con":{fx:"stance-sharpshooter"},"utori hur":{fx:"stance-divine-defiance"},
    "uteta flam":{fx:"stance-master-flames"},"uteta vis":{fx:"stance-master-thunder"},
    "uteta mort":{fx:"stance-master-decay"},
    "exori kor tempo":{fx:"stance-sapped-strength"},"exori moe tempo":{fx:"stance-exposed-weakness"},
    "utura sio":{fx:"stance-shared-conservation"},"utito dru":{fx:"stance-elemental-synthesis"},
  });
  Object.assign(SPELL_FX.names,{
    "forked glacier":{fx:"forked-glacier-effect",miss:"ice"},
    "forked thorns":{fx:"forked-thorns-effect",miss:"earth"},
    "ethereal spear":{fx:"hit-area",miss:"ethereal-spear"},
    "strong ethereal spear":{fx:"hit-area",miss:"ethereal-spear"},
    "lesser ethereal spear":{fx:"hit-area",miss:"ethereal-spear"},
  });
  if(ALL_SPELLS["utito-tempo"])ALL_SPELLS["utito-tempo"].fx="stance-blood-rage";
  if(ALL_SPELLS["utamo-tempo"])ALL_SPELLS["utamo-tempo"].fx="stance-protector";
  if(ALL_SPELLS["utori-con"])ALL_SPELLS["utori-con"].fx="stance-sharpshooter";
  if(ALL_SPELLS["exevo-tempo-mas-san"])ALL_SPELLS["exevo-tempo-mas-san"].fx="divine-grenade-effect";
  delete ALL_SPELLS["exori-dir-san"];
  delete ALL_SPELLS["exori-dir-moe"];
  delete ALL_SPELLS["uteta-tio"];
})();
let POTIONS={},RUNES={};
try{
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","game","js","supplydata.js"),"utf8"),ctx);
  POTIONS=(ctx.window.SUPPLYDATA&&ctx.window.SUPPLYDATA.potions)||{};
  RUNES=(ctx.window.SUPPLYDATA&&ctx.window.SUPPLYDATA.runas)||{};
}catch(e){POTIONS={};RUNES={};}
let RUNEDATA={};
try{
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","game","js","runedata.js"),"utf8"),ctx);
  RUNEDATA=ctx.window.RUNEDATA||{};
}catch(e){RUNEDATA={};}
(function applyRunePatch1525(){
  for(const id of ["avalanche-rune","great-fireball-rune","thunderstorm-rune","stone-shower-rune"]){
    const r=RUNEDATA[id];if(!r||!r.f)continue;
    for(const k of ["mlMin","mlMax","flatMin","flatMax"])if(typeof r.f[k]==="number")r.f[k]*=1.25;
  }
  if(RUNEDATA["explosion-rune"]){
    RUNEDATA["explosion-rune"].area={h:3,raio:1,sqm:9,w:3};
    RUNEDATA["explosion-rune"].areaNome="AREA_SQUARE1X1";
  }
})();
let MONKSPELLDATA={};
try{
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","game","js","monkspelldata.js"),"utf8"),ctx);
  MONKSPELLDATA=ctx.window.MONKSPELLDATA||{};
}catch(e){MONKSPELLDATA={};}
if(MONKSPELLDATA["exori-amp-pug"]){MONKSPELLDATA["exori-amp-pug"].pow=85;MONKSPELLDATA["exori-amp-pug"].cd=12000;}
if(MONKSPELLDATA["exori-med-pug"]){
  MONKSPELLDATA["exori-med-pug"].chain={alvos:16,dist:2,flood:1,seedAdj:1,maxRange:10};
}
if(MONKSPELLDATA["exori-gran-mas-nia"]){
  MONKSPELLDATA["exori-gran-mas-nia"].chain={alvos:8,dist:2};
  MONKSPELLDATA["exori-gran-mas-nia"].echo=0.5;
  MONKSPELLDATA["exori-gran-mas-nia"].lvl=300;
}
if(MONKSPELLDATA["exori-infir-nia"])MONKSPELLDATA["exori-infir-nia"].mana=18;
if(MONKSPELLDATA["exori-mas-nia"])MONKSPELLDATA["exori-mas-nia"].mana=195;
if(MONKSPELLDATA["exura-mas-nia"]){
  delete MONKSPELLDATA["exura-mas-nia"].monk;
  MONKSPELLDATA["exura-mas-nia"].mana=400;
}
if(MONKSPELLDATA["utevo-nia"])MONKSPELLDATA["utevo-nia"].cd=120000;
if(MONKSPELLDATA["utamo-tio"])MONKSPELLDATA["utamo-tio"].cd=600000;
if(MONKSPELLDATA["uteta-res-tio"])MONKSPELLDATA["uteta-res-tio"].cd=7200000;
delete MONKSPELLDATA["uteta-tio"];
MONKSPELLDATA["exori-mas-amp-pug"]={
  cd:12000,element:"physical",fx:"thousand-fist-effect",gcd:2000,lvl:120,mana:145,
  monk:"builder",nome:"Thousand Fist Blows",pow:62,range:1,area:{raio:1,sqm:9},words:"exori mas amp pug"};
MONKSPELLDATA["exori-infir-amp-pug"]={
  cd:20000,element:"physical",fx:"blow-white",gcd:2000,lvl:6,mana:30,
  monk:"builder",nome:"Lesser Mystic Repulse",pow:25,range:7,words:"exori infir amp pug"};
if(ALL_SPELLS["exori-med-pug"]&&MONKSPELLDATA["exori-med-pug"]&&MONKSPELLDATA["exori-med-pug"].chain){
  const ch=MONKSPELLDATA["exori-med-pug"].chain;
  ALL_SPELLS["exori-med-pug"].chain=ch.alvos;
  ALL_SPELLS["exori-med-pug"].chainDist=ch.dist;
  if(ch.flood)ALL_SPELLS["exori-med-pug"].chainFlood=1;
  if(ch.seedAdj)ALL_SPELLS["exori-med-pug"].chainSeedAdj=1;
  if(ch.maxRange)ALL_SPELLS["exori-med-pug"].chainMaxRange=ch.maxRange;
}
if(ALL_SPELLS["exori-gran-mas-nia"]&&MONKSPELLDATA["exori-gran-mas-nia"]){
  const md=MONKSPELLDATA["exori-gran-mas-nia"];
  if(md.chain){ALL_SPELLS["exori-gran-mas-nia"].chain=md.chain.alvos;ALL_SPELLS["exori-gran-mas-nia"].chainDist=md.chain.dist;}
  if(md.echo)ALL_SPELLS["exori-gran-mas-nia"].echo=md.echo;
}
Object.assign(POTIONS,{
  // Fallbacks alinhados ao Canary potions.lua (15.x) — só usados se supplydata falhar.
  "supreme-health-potion":POTIONS["supreme-health-potion"]||{hp:[875,1125],mp:null,lvl:200,tipo:"hp",vocs:["knight"]},
  "ultimate-health-potion":POTIONS["ultimate-health-potion"]||{hp:[650,850],mp:null,lvl:130,tipo:"hp",vocs:["knight"]},
  "ultimate-spirit-potion":POTIONS["ultimate-spirit-potion"]||{hp:[420,580],mp:[250,350],lvl:130,tipo:"hpmp",vocs:["paladin","monk"]},
  "great-spirit-potion":POTIONS["great-spirit-potion"]||{hp:[250,350],mp:[100,200],lvl:80,tipo:"hpmp",vocs:["paladin","monk"]},
  "superior-mana-potion":POTIONS["superior-mana-potion"]||{mp:[240,360],lvl:100,tipo:"mp",vocs:["sorcerer","druid","paladin","monk"]},
  "distilled-superior-mana-potion":POTIONS["distilled-superior-mana-potion"]||{mp:[240,360],lvl:130,tipo:"mp",
    vocs:["sorcerer","druid","paladin","knight","monk"]},
  "distilled-ultimate-mana-potion":POTIONS["distilled-ultimate-mana-potion"]||{mp:[425,575],lvl:200,tipo:"mp",
    vocs:["sorcerer","druid","paladin","knight","monk"]},
});
// 15.25.3a4a52: great mana potion passou a ser de todas as vocações (EK incluso).
if(POTIONS["great-mana-potion"]){
  POTIONS["great-mana-potion"].vocs=["sorcerer","druid","paladin","knight","monk"];
}
// Distilled superior: patch de nível se supplydata antigo ainda tiver lvl 100.
if(POTIONS["distilled-superior-mana-potion"]){
  POTIONS["distilled-superior-mana-potion"].lvl=130;
  POTIONS["distilled-superior-mana-potion"].vocs=["sorcerer","druid","paladin","knight","monk"];
}
const POTION_CD_MS=1000; // Canary EX_ACTIONS / OTC: HP+mana+spirit compartilham 1s
const SUPPLY_PRICE={
  "lightest-missile-rune":5,"lightest-magic-missile-rune":5,"light-stone-shower-rune":5,"light-magic-missile-rune":12,
  "intense-healing-rune":95,"ultimate-healing-rune":175,"stalagmite-rune":12,"heavy-magic-missile-rune":25,
  "fireball-rune":30,"holy-missile-rune":16,"icicle-rune":30,"stone-shower-rune":37,"thunderstorm-rune":37,
  "avalanche-rune":57,"great-fireball-rune":57,"explosion-rune":31,"sudden-death-rune":162,
  "small-health-potion":20,"health-potion":45,"mana-potion":50,"strong-health-potion":100,"strong-mana-potion":80,
  "great-health-potion":190,"great-mana-potion":120,"great-spirit-potion":190,"ultimate-health-potion":310,
  "ultimate-mana-potion":438,"supreme-health-potion":625,"ultimate-spirit-potion":488,"superior-mana-potion":254,
  "distilled-superior-mana-potion":381,"distilled-ultimate-mana-potion":732,
};
const HEALTH_POTION_ORDER=["supreme-health-potion","ultimate-health-potion","ultimate-spirit-potion",
  "great-health-potion","great-spirit-potion","strong-health-potion","health-potion","small-health-potion",
  "ultimate-healing-rune","intense-healing-rune"];
const MANA_POTION_ORDER=["distilled-ultimate-mana-potion","ultimate-mana-potion","distilled-superior-mana-potion",
  "superior-mana-potion","great-mana-potion","strong-mana-potion","mana-potion"];
for(const slug of Object.keys(AMMO)){const raw=AMMO[slug];ITEMS[slug]=Object.assign({},ITEMS[slug]||{},raw,
  {name:raw.n||slug,slot:"ammo",type:"ammo",attack:Number(raw.atk)||0,level:Number(raw.lvl)||0});}
for(const slug of Object.keys(QUIVERS)){const raw=QUIVERS[slug];ITEMS[slug]=Object.assign({},ITEMS[slug]||{},raw,
  {name:raw.nome||slug,slot:"shield",type:"quiver",level:Number(raw.lvl)||0});}
try{
  const js=path.join(__dirname,"..","game","js");
  const sandbox={window:{},console};
  vm.runInNewContext(fs.readFileSync(path.join(js,"gamedata.js"),"utf8"),sandbox);
  sandbox.GAMEDATA=sandbox.window.GAMEDATA;
  // hard-hunts registra loot Cobra/MOTA (preços NPC) ausente do gamedata base —
  // sem isso Sell All online não encontra o item e a pouch “trava”.
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"hard-hunts.js"),"utf8"),sandbox);}catch(_hh){/* opcional */}
  // Materiais de imbue (mat-*): npcSell para VENDER manual; sell=0 + _imbMat
  // para Sell All / autoseller pularem no servidor.
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"patch_imbuement.js"),"utf8"),sandbox);}catch(_imb){/* opcional */}
  // Soul War boss loot stubs (sem preço) + tabela Yasir (TibiaWiki) — Sell All
  // online precisa de greed-s-arm / figurines etc. no catálogo ITEMS.
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"soulwar.js"),"utf8"),sandbox);}catch(_sw){/* opcional */}
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"yasir-prices.js"),"utf8"),sandbox);}catch(_yp){/* opcional */}
  // Secret Library: itens de loot (silken bookmark, book page, glowing rune
  // etc.) — sem isso o Sell All online não precifica e pula esses drops.
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"hardcore-library.js"),"utf8"),sandbox);}catch(_hl){/* opcional */}
  // The Dread Maiden (Feast of Souls): itens do loot oficial + hunt da
  // bossroom — sem isso o Sell All online não precifica esses drops.
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"feast-of-souls.js"),"utf8"),sandbox);}catch(_dm){/* opcional */}
  // Deeplings World Change: itens de loot (broccoli, true book of death) +
  // hunt da bossroom — sem isso o Sell All online não precifica os drops.
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"deepling-bosses.js"),"utf8"),sandbox);}catch(_dp){/* opcional */}
  // Buried Cathedral: itens de loot (ectoplasms, hexagonal ruby etc.) +
  // hunt 250+ — sem isso o Sell All online não precifica os drops.
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"buried-cathedral.js"),"utf8"),sandbox);}catch(_bc){/* opcional */}
  // Faceless Bane: boss simples da Buried Cathedral (acesso pela missão).
  try{vm.runInNewContext(fs.readFileSync(path.join(js,"faceless-bane.js"),"utf8"),sandbox);}catch(_fb){/* opcional */}
  vm.runInNewContext(fs.readFileSync(path.join(js,"weapondata.js"),"utf8"),sandbox);
  sandbox.WEAPONDATA=sandbox.window.WEAPONDATA;
  vm.runInNewContext(fs.readFileSync(path.join(js,"weapons.js"),"utf8"),sandbox);
  if(typeof sandbox.fundirWeaponData==="function")sandbox.fundirWeaponData();
  vm.runInNewContext(fs.readFileSync(path.join(js,"accessorydata.js"),"utf8"),sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(js,"supply-stash-data.js"),"utf8"),sandbox);
  const gd=sandbox.GAMEDATA&&sandbox.GAMEDATA.items||{};
  for(const slug of Object.keys(gd)){
    const src=gd[slug]||{},cur=ITEMS[slug]||{};
    ITEMS[slug]=Object.assign({},cur,src,{
      attack:cur.attack!==undefined?cur.attack:(src.atk||src.attack),
      type:cur.type||src.t||src.type,
    });
  }
}catch(e){/* catalogo Canary opcional: o combate cai nos campos de items.json */}
const WAND_PERFECT_SHOT={"eldritch-wand":{shotDmg:65,shotRange:4},"gilded-eldritch-wand":{shotDmg:65,shotRange:4}};
for(const slug of Object.keys(WAND_PERFECT_SHOT)){
  if(ITEMS[slug])Object.assign(ITEMS[slug],WAND_PERFECT_SHOT[slug]);
}
let WHEEL_SLOTS={},WHEEL_SPELL_UPGRADES={},WHEEL_SKILL_VOC={},WHEEL_LEECH={life:0.75,mana:0.25},WHEEL_FN=null;
try{
  const wd=require(path.join(__dirname,"..","game","js","wheeldata.js"));
  WHEEL_SLOTS=wd.WHEEL_SLOTS||{};WHEEL_SPELL_UPGRADES=wd.WHEEL_SPELL_UPGRADES||{};
  WHEEL_SKILL_VOC=wd.WHEEL_SKILL||{};WHEEL_LEECH=wd.WHEEL_LEECH||WHEEL_LEECH;
  WHEEL_FN=require(path.join(__dirname,"..","game","js","wheel.js"));
}catch(e){/* wheel opcional */}
for(const slug of Object.keys(AMMO)){
  const raw=AMMO[slug],it=ITEMS[slug]||(ITEMS[slug]={});
  if(raw.areaMatrix)it.areaMatrix=raw.areaMatrix;
  if(raw.areaFx)it.areaFx=raw.areaFx;
  if(raw.noMiss)it.noMiss=raw.noMiss;
  if(raw.hit!==undefined)it.hit=raw.hit;
  if(raw.ammoKind)it.ammoKind=raw.ammoKind;
  if(raw.poison)it.poison=raw.poison;
  if(raw.dmgMul!==undefined)it.dmgMul=raw.dmgMul;
  it.s=it.s||"ammo";it.type=it.type||"ammo";it.slot=it.slot||"ammo";
}
if(ITEMS["diamond-arrow"]){
  ITEMS["diamond-arrow"].areaFx="blue-electricity";
  ITEMS["diamond-arrow"].dmgMul=1.15; // idle: +15% no resultado da fórmula
}
for(const slug of Object.keys(ITEMS)){
  const it=ITEMS[slug];if(!it)continue;
  const miss=WAND_SHOOT[it.id]||WAND_SHOOT[String(it.id)];
  if(miss)it.shoot=miss;
}
const QAMMO=QUIVER_DATA.ammo||{};
for(const slug of Object.keys(QAMMO)){
  const raw=QAMMO[slug],it=ITEMS[slug]||(ITEMS[slug]={});
  if(raw.poison)it.poison=raw.poison;
  if(raw.custo&&!it.buy)it.buy=Number(raw.custo)||it.buy;
  if(raw.hit!==undefined&&it.hit===undefined)it.hit=raw.hit;
  if(raw.tipo&&!it.ammoKind)it.ammoKind=raw.tipo;
}
const HUNTS=Object.assign(read("hunts.json"),{
  "mota-extension":{monsters:["floating-savant","retching-horror","fury","hellhound","demon"],cat:"hard",pack:10,packMin:6,packMax:10},
  "cobra-bastion":{monsters:["cobra-vizier","cobra-scout","cobra-assassin"],cat:"hard",pack:10,packMin:6,packMax:10},
  "buried-cathedral":{monsters:["ripper-spectre","gazer-spectre","burster-spectre","arachnophobica"],cat:"hard",pack:10,packMin:6,packMax:10},
  "faceless-bane-room":{monsters:["faceless-bane"]},
  "timira-room":{monsters:["timira-the-many-headed"]},
  "library-fire":{monsters:["burning-book","rage-squid","biting-book"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "library-energy":{monsters:["energetic-book","biting-book"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "library-ice":{monsters:["icecold-book","squid-warden","ink-blob"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "library-earth":{monsters:["cursed-book","biting-book"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "dark-thais":{monsters:["many-faces","knight-s-apparition","paladin-s-apparition","sorcerer-s-apparition","druid-s-apparition","monk-s-apparition","distorted-phantom"],cat:"hardcore",pack:10,packMin:8,packMax:10,soulWarZone:true,soulWarZoneMonster:"many-faces"},
  "rotten-wasteland":{monsters:["rotten-golem","branchy-crawler","mould-phantom"],cat:"hardcore",pack:10,packMin:8,packMax:10,soulWarZone:true,soulWarZoneMonster:"rotten-golem",soulWarRoot:true},
  "claustrophobic-inferno":{monsters:["brachiodemon","infernal-demon","infernal-phantom"],cat:"hardcore",pack:10,packMin:8,packMax:10,soulWarZone:true,soulWarZoneMonster:"brachiodemon"},
  "ebb-and-flow":{monsters:["bony-sea-devil","capricious-phantom","hazardous-phantom","turbulent-elemental"],cat:"hardcore",pack:10,packMin:8,packMax:10,soulWarZone:true,soulWarZoneMonster:"bony-sea-devil",soulWarFear:true},
  "goshnars-greed-room":{monsters:["goshnar-s-greed","dreadful-harvester","soulsnatcher","greedbeast","powerful-soul"],soulWarZone:true,soulWarZoneMonster:"many-faces"},
  "goshnars-hatred-room":{monsters:["goshnar-s-hatred","dreadful-harvester","hateful-soul"],soulWarZone:true,soulWarZoneMonster:"rotten-golem"},
  "goshnars-spite-room":{monsters:["goshnar-s-spite","dreadful-harvester","spiteful-spitter","weeping-soul"],soulWarZone:true,soulWarZoneMonster:"bony-sea-devil"},
  "goshnars-malice-room":{monsters:["goshnar-s-malice","dreadful-harvester","malicious-soul"],soulWarZone:true,soulWarZoneMonster:"dreadful-harvester"},
  "goshnars-megalomania-room":{monsters:["goshnar-s-megalomania-purple","goshnar-s-megalomania-green","goshnar-s-megalomania-blue","aspect-of-power"],soulWarZone:true,soulWarZoneMonster:"aspect-of-power"},
  "scarlett-room":{monsters:["scarlett-etzel"]},
  "the-dread-maiden-room":{monsters:["the-dread-maiden"]},
  "the-fear-feaster-room":{monsters:["the-fear-feaster"]},
  "the-unwelcome-room":{monsters:["the-unwelcome"]},
  "the-pale-worm-room":{monsters:["the-pale-worm"]},
});
for(const slug of ["marapur-nagas","dt-seal"]){
  if(HUNTS[slug])Object.assign(HUNTS[slug],{cat:"hard",pack:10,packMin:6,packMax:10});
}
const VOC={none:{hp:5,mp:5,cap:10,magic:3.0},knight:{hp:15,mp:5,cap:25,magic:3.0},paladin:{hp:10,mp:15,cap:20,magic:1.4},
  druid:{hp:5,mp:30,cap:10,magic:1.1},sorcerer:{hp:5,mp:30,cap:10,magic:1.1},monk:{hp:10,mp:10,cap:25,magic:1.3}};
/* vocations.xml do Canary: menor multiplier = sobe mais rápido.
 * Bases: Vocation::skillBase = fist/club/sword/axe 50, dist 30, shield 100. */
const SKILL_MUL={
  knight:{melee:1.1,dist:1.4,shield:1.1,fist:1.1},
  paladin:{melee:1.2,dist:1.1,shield:1.1,fist:1.2},
  druid:{melee:1.8,dist:1.8,shield:1.5,fist:1.5},
  sorcerer:{melee:2.0,dist:2.0,shield:1.5,fist:1.5},
  monk:{melee:1.5,dist:2.0,shield:1.2,fist:1.1},
  none:{melee:1.5,dist:2.0,shield:1.5,fist:1.5},
};
function serverSkillRate(level){level=Number(level)||10;if(level<=80)return 10;if(level<=100)return 7;if(level<=120)return 4;return 2;}
function serverMagicRate(ml){ml=Number(ml)||0;if(ml<=80)return 10;if(ml<=100)return 7;if(ml<=120)return 4;if(ml<=130)return 3;return 2;}
const START_HP=185,START_MP=5,FULL_STAMINA=42*3600;
const INFLUENCED_BASE_CHANCE=.004,INFLUENCED_PVP_BONUS=.004,
  FIENDISH_BASE_CHANCE=.0012,FIENDISH_PVP_BONUS=.0008;
const ELEMENT_FX={physical:"draw-blood",fire:"hit-by-fire",ice:"ice-attack",energy:"energy-damage",
  earth:"hit-by-poison",death:"mort-area",holy:"holy-damage",drown:"water-splash-effect",
  manadrain:"mana-wisp",lifedrain:"draw-blood",agony:"draw-blood"};
const ELEMENT_MISSILE={physical:"small-stone",fire:"fire",ice:"ice",energy:"energy",earth:"earth",
  death:"death",holy:"holy",drown:"small-stone",manadrain:"energy",lifedrain:"death",agony:"death"};
const SHOOT_TO_MISSILE={energy:"energy",fire:"fire",death:"death",holy:"holy",ice:"ice",earth:"earth",
  poison:"earth",smallice:"small-ice",smallearth:"small-earth",smallholy:"small-holy",
  energyball:"energy-ball",suddendeath:"sudden-death",smallstone:"small-stone"};
const RACE_HIT_FX={blood:"draw-blood",venom:"hit-by-poison",undead:"hit-area",ink:"hit-area",
  fire:"draw-blood",energy:"energy-hit",candy:"hit-area",chocolate:"hit-area"};
function clone(v){return JSON.parse(JSON.stringify(v||{}));}
function clonePlayerState(p){const out=clone(p||{});out.conditions=out.conditions&&typeof out.conditions==="object"?out.conditions:{};return out;}
function finitePosition(value,fallback){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function entityPosition(entity,fallbackX,fallbackY){return{x:finitePosition(entity&&entity.x,fallbackX),y:finitePosition(entity&&entity.y,fallbackY)};}
function entityVisual(entity){const out={};for(const key of ["cx","cy","x","y","sx","sy"])
  if(entity&&entity[key]!==undefined)out[key]=entity[key];return out;}
const TRANSIENT_VISUAL_KEYS=["tx","ty","moving","frame","walkT","stepT","stepDur","nextStepAt","attackAnim",
  "target","path","pathIndex","moveFrom","moveTo","moveProgress"];
function stripStaleVisualStep(entity){
  // O servidor recebe posição/célula, mas não simula o trajeto entre elas.
  // Nunca republique o passo que ficou no checkpoint inicial: numa aba nova
  // ele faria a criatura interpolar de volta para um destino já vencido.
  for(const key of TRANSIENT_VISUAL_KEYS)delete entity[key];
  return entity;
}
function playerPosition(auth,p){const item=(auth.players||[]).find((entry)=>entry.p===p||String(entry.id)===String(p&&p.id));
  return entityPosition(item,.13,.6);}
function authorityVisualDistance(a,b,auth){
  const acx=Number(a&&a.cx),acy=Number(a&&a.cy),bcx=Number(b&&b.cx),bcy=Number(b&&b.cy);
  if([acx,acy,bcx,bcy].every(Number.isFinite))return Math.max(Math.abs(acx-bcx),Math.abs(acy-bcy));
  const ap=entityPosition(a,.5,.5),bp=entityPosition(b,.5,.5),w=Number(auth&&auth.gridW)||30,h=Number(auth&&auth.gridH)||30;
  return Math.max(Math.abs(ap.x-bp.x)*w,Math.abs(ap.y-bp.y)*h);
}
/* Paredes estáticas da instância (otbm/testes). Occupancy de criaturas é
 * montada em authorityOccupancy; isto só marca tiles inatravessáveis. */
function authorityCellBlocked(auth,cx,cy){
  const blocked=auth&&auth.blockedCells;
  if(!blocked)return false;
  const key=cx+":"+cy;
  if(blocked instanceof Set)return blocked.has(key);
  return !!blocked[key];
}
/* A* Canary-lite: destino pode estar ocupado pelo alvo; paredes nunca.
 * Devolve o 1º passo {dx,dy,diag} ou null se não há rota (hasFollowPath=false). */
function authorityFindPathStep(auth,from,gx,gy,occ,ignore){
  const start=entityGridCell(from,auth);
  if(start.cx===gx&&start.cy===gy)return null;
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  const used=occ||authorityOccupancy(auth,ignore||from);
  const blocked=(cx,cy)=>{
    if(cx<0||cy<0||cx>=w||cy>=h)return true;
    if(authorityCellBlocked(auth,cx,cy))return true;
    if(cx===gx&&cy===gy)return false;
    return used.has(cx+":"+cy);
  };
  const corner=(cx,cy,d)=>{
    if(!d.diag)return false;
    return authorityCellBlocked(auth,cx+d.dx,cy)||authorityCellBlocked(auth,cx,cy+d.dy)||
      used.has((cx+d.dx)+":"+cy)||used.has(cx+":"+(cy+d.dy));
  };
  const inicio=start.cx+":"+start.cy;
  const abertos=[{cx:start.cx,cy:start.cy,g:0,f:Math.max(Math.abs(gx-start.cx),Math.abs(gy-start.cy))}];
  const veioDe=new Map(),custo=new Map([[inicio,0]]),fechados=new Set();
  let nos=0;const teto=Math.max(400,w*h);
  while(abertos.length&&nos<teto){
    let melhor=0;
    for(let i=1;i<abertos.length;i++)if(abertos[i].f<abertos[melhor].f)melhor=i;
    const atual=abertos.splice(melhor,1)[0],chave=atual.cx+":"+atual.cy;
    if(fechados.has(chave))continue;
    fechados.add(chave);nos++;
    if(atual.cx===gx&&atual.cy===gy){
      let cur=chave,passo=null;
      while(veioDe.has(cur)){
        const ant=veioDe.get(cur);
        if(ant.chave===inicio){passo=ant.dir;break;}
        cur=ant.chave;
      }
      return passo;
    }
    for(const d of AUTH_STEP_DIRS){
      const nx=atual.cx+d.dx,ny=atual.cy+d.dy,nk=nx+":"+ny;
      if(fechados.has(nk)||blocked(nx,ny)||corner(atual.cx,atual.cy,d))continue;
      const g=atual.g+(d.diag?3:1);
      if(custo.has(nk)&&custo.get(nk)<=g)continue;
      custo.set(nk,g);veioDe.set(nk,{chave,dir:d});
      abertos.push({cx:nx,cy:ny,g,f:g+Math.max(Math.abs(gx-nx),Math.abs(gy-ny))});
    }
  }
  return null;
}
function authorityMobCanAttack(auth,mob,target){
  if(!mob||!target)return false;
  return chebyshevCells(entityGridCell(mob,auth),entityGridCell(target,auth))<=mobMeleeRangeSQM(mob);
}
/* Espelha Monster::hasFollowPath: em alcance de ataque OU há rota A*. */
function authorityMobHasFollowPath(auth,mob,target){
  if(!mob||!target)return false;
  if(authorityMobCanAttack(auth,mob,target))return true;
  const to=entityGridCell(target,auth);
  const from=entityGridCell(mob,auth);
  const key=from.cx+":"+from.cy+">"+to.cx+":"+to.cy+":"+String(target.id);
  const now=Number(auth.clock)||0;
  if(mob._reachKey===key&&now-Number(mob._reachAt||0)<400)return !!mob._hasFollowPath;
  const step=authorityFindPathStep(auth,mob,to.cx,to.cy,null,mob);
  mob._reachKey=key;mob._reachAt=now;mob._hasFollowPath=!!step;
  return !!step;
}
/* Canary Monster::onThink_async + searchTargetImmediate (#3922):
 * melee sem hasFollowPath → searchTarget(NEAREST) excluindo o alvo atual
 * inalcançável; ranged só retargeta se também estiver fora de alcance de
 * ataque. Sticky enquanto o alvo atual for alcançável (anti-flicker).
 * Challenge (Exeta Res) continua forçando o knight. */
function authorityMobTarget(auth,mob){
  const alive=(auth.players||[]).filter((item)=>item&&item.p&&item.p.hp>0&&!item.downUntil);
  if(!alive.length){if(mob)delete mob.targetId;return null;}
  const now=Number(auth.clock)||0;
  if(mob&&Number(mob.challengedUntil||0)>now){
    const knight=alive.find((item)=>String(item.id)===String(mob.challengeTargetId||""));
    if(knight){mob.targetId=String(knight.id);mob._hasFollowPath=true;return knight;}
  }
  const td=authorityTargetDistance(mob,now);
  const byDist=()=>alive.slice().sort((a,b)=>authorityVisualDistance(mob,a,auth)-authorityVisualDistance(mob,b,auth)||
    String(a.id).localeCompare(String(b.id)));
  const pickReachable=(skipId)=>{
    const list=byDist();
    for(const cand of list){
      if(skipId&&String(cand.id)===String(skipId))continue;
      if(authorityMobHasFollowPath(auth,mob,cand))return cand;
    }
    return null;
  };
  let target=alive.find((item)=>String(item.id)===String(mob.targetId||""));
  if(target){
    const hasPath=authorityMobHasFollowPath(auth,mob,target);
    const attackable=authorityMobCanAttack(auth,mob,target);
    // Melee: !hasFollowPath ⇒ retarget. Ranged: só se também unattackable.
    const meleeStuck=td<=1&&!hasPath;
    const rangedStuck=td>1&&!attackable&&!hasPath;
    if(!meleeStuck&&!rangedStuck){mob._pathFailCount=0;return target;}
    // Um incremento por clock (movimento+ataque no mesmo tick não contam 2×).
    if((Number(mob._pathFailAt)||0)!==now){
      mob._pathFailAt=now;
      mob._pathFailCount=(Number(mob._pathFailCount)||0)+1;
    }
    mob._hasFollowPath=false;
    if(mob._pathFailCount<2)return target;
    const alt=pickReachable(target.id);
    if(alt){
      mob.targetId=String(alt.id);mob._pathFailCount=0;mob._hasFollowPath=true;
      delete mob._reachKey;
      return alt;
    }
    // Nenhum outro alcançável: mantém o atual (lista de threat Canary) mas
    // zera o stick de path para o movimento não insistir no greedy.
    return target;
  }
  mob._pathFailCount=0;
  target=pickReachable(null)||byDist()[0];
  if(target)mob.targetId=String(target.id);
  return target||null;
}
/* Densidade de pack: quantos vivos no raio Chebyshev do SQM do monstro. */
const PACK_SEARCH_R=10,PACK_CLUSTER_R=2,PACK_HYSTERESIS=1.25;
function mobClusterDensity(auth,mob,r){
  if(!mob||!(mob.hp>0))return 0;
  const cell=entityGridCell(mob,auth);
  return boxCountMobs(auth,cell.cx,cell.cy,r==null?PACK_CLUSTER_R:r);
}
/* Melhor alvo de hunt: pack denso dentro da tela (~10 SQM), não o singleton
 * adjacente. Histerese evita trocar 3-pack por 4-pack do outro lado. */
function densestPackTarget(auth,item,living,opts){
  const list=(living||auth.mobs||[]).filter((mob)=>mob&&mob.hp>0);
  if(!list.length)return null;
  const search=Number(opts&&opts.searchR)||PACK_SEARCH_R;
  const clusterR=Number(opts&&opts.clusterR)||PACK_CLUSTER_R;
  const scoreOf=(mob)=>{
    const dens=mobClusterDensity(auth,mob,clusterR);
    const dist=authorityVisualDistance(item,mob,auth);
    if(dist>search)return -Infinity;
    return dens*100-dist*4;
  };
  let best=null,bestScore=-Infinity;
  for(const mob of list){
    const sc=scoreOf(mob);
    if(sc>bestScore||(sc===bestScore&&best&&String(mob.id).localeCompare(String(best.id))<0)){
      best=mob;bestScore=sc;
    }
  }
  if(!best)return list.slice().sort((a,b)=>authorityVisualDistance(item,a,auth)-authorityVisualDistance(item,b,auth)||
    String(a.id).localeCompare(String(b.id)))[0];
  const stickyId=item&&item._packTargetId;
  if(stickyId){
    const sticky=list.find((m)=>String(m.id)===String(stickyId));
    if(sticky){
      const stickyScore=scoreOf(sticky);
      if(Number.isFinite(stickyScore)&&bestScore<stickyScore*PACK_HYSTERESIS)best=sticky;
    }
  }
  if(item)item._packTargetId=String(best.id);
  return best;
}
function packOpportunity(auth,item,living){
  const list=(living||auth.mobs||[]).filter((m)=>m&&m.hp>0);
  let density=0,dist=99,mob=null;
  for(const m of list){
    const d=authorityVisualDistance(item,m,auth);
    if(d>PACK_SEARCH_R)continue;
    const dens=mobClusterDensity(auth,m,PACK_CLUSTER_R);
    if(dens>density||(dens===density&&d<dist)){density=dens;dist=d;mob=m;}
  }
  return {density,dist,mob};
}
/* Cada personagem escolhe o próprio alvo pelo Helper: pack mais denso perto
 * DELE (não só o singleton adjacente), com as mesmas exceções de boss/
 * imunidade do cliente. Sem isso a party inteira disparava no living[0].
 * Greed imune → Greedy Beasts primeiro; demais boss fights → boss. */
function authorityPlayerTarget(auth,item,living){
  const list=(living||auth.mobs||[]).filter((mob)=>mob&&mob.hp>0);
  if(!list.length)return null;
  if(auth.hatred&&auth.hatred.active){
    const hateful=list.find((mob)=>mob.slug==="hateful-soul");
    const summon=hateful||list.find((mob)=>mob.hatredSummon);
    if(summon)return summon;
  }
  if(auth.greed&&auth.greed.immune){
    const beasts=list.filter((mob)=>mob.slug==="greedbeast");
    if(beasts.length)return densestPackTarget(auth,item,beasts)||beasts[0];
    const add=list.find((mob)=>!mob.boss);if(add)return add;
    return null;
  }
  const boss=list.find((mob)=>mob.boss);
  const bossFight=!!(auth.kind==="boss"||auth.bossId||auth.worldBoss||boss);
  if(boss&&bossFight&&!boss.greedImmune&&!boss.qteImmune&&!boss.megaImmune)return boss;
  if(boss&&(boss.greedImmune||boss.qteImmune||boss.megaImmune)){
    const adds=list.filter((mob)=>!mob.boss);
    if(adds.length)return densestPackTarget(auth,item,adds)||adds[0];
  }
  return densestPackTarget(auth,item,list);
}
/* O payload visual não altera dano, chance, HP ou recompensa; ele só alinha
 * posição e seleção do alvo mais próximo. Limites e faixas impedem snapshots
 * arbitrariamente grandes ou coordenadas não renderizáveis. */
function sanitizeCombo(raw,voc){
  const out=[];
  for(const slot of Array.isArray(raw)?raw.slice(0,6):[]){
    if(!slot||!slot.id){out.push(null);continue;}
    const kind=slot.kind==="rune"?"rune":"spell";
    let id=String(slot.id).slice(0,80);
    if(kind==="spell"){
      if(id==="exori-dir-san")id="exevo-dir-san";
      else if(id==="exori-dir-moe")id="exevo-dir-moe";
      else if(id==="ethereal-spear"||id==="exori con")id="exori-con";
      else if(id==="strong-ethereal-spear"||id==="exori gran con")id="exori-gran-con";
      const s=ALL_SPELLS[id];
      if(!s||(voc&&!spellAllowedForVoc(s,voc))){out.push(null);continue;}
      const isMulti=spellIsMultiHit(s);
      const min=isMulti?Math.max(1,Math.min(9,Number(slot.min)||1)):1;
      out.push({kind,id,min});
      continue;
    }
    out.push({kind,id,min:Math.max(1,Math.min(9,Number(slot.min)||1))});
  }
  while(out.length<6)out.push(null);
  return out;
}
function normalizeVisualState(raw,auth){
  auth=auth||{};const normalize=(list,limit)=>{const out=[];
    for(const input of Array.isArray(list)?list:[]){if(out.length>=limit)break;
      const id=String(input&&input.id||"");
      if(!id||id.length>128||input.x===null||input.x===undefined||input.y===null||input.y===undefined)continue;
      const x=Number(input.x),y=Number(input.y);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)continue;
      const gw=Number(auth.gridW)||30,gh=Number(auth.gridH)||30;
      const item={id,x,y},cx=input.cx===null||input.cx===undefined?NaN:Number(input.cx),
        cy=input.cy===null||input.cy===undefined?NaN:Number(input.cy);
      // Combate usa SQM. Se o cliente manda x/y interpolados, derive a célula
      // da posição visível para o melee não ficar preso no spawn antigo.
      item.cx=Math.max(0,Math.min(gw-1,Number.isFinite(cx)?Math.round(cx):Math.floor(x*gw)));
      item.cy=Math.max(0,Math.min(gh-1,Number.isFinite(cy)?Math.round(cy):Math.floor(y*gh)));
      if(input.combo)item.combo=sanitizeCombo(input.combo);
      if(input.stances&&typeof input.stances==="object")item.stances=input.stances;
      if(typeof input.autoWalk==="boolean")item.autoWalk=input.autoWalk;
      if(input.cfg&&typeof input.cfg==="object")item.cfg=input.cfg;
      const wdx=Number(input.walkIntent&&input.walkIntent.dx),wdy=Number(input.walkIntent&&input.walkIntent.dy);
      if(Number.isFinite(wdx)&&Number.isFinite(wdy)&&(wdx||wdy)){
        item.walkIntent={dx:Math.max(-1,Math.min(1,Math.round(wdx))),dy:Math.max(-1,Math.min(1,Math.round(wdy)))};
      }
      if(input.challenge&&typeof input.challenge==="object"){
        const hunt=String(input.challenge.huntMode||"");
        item.challenge={
          res:!!input.challenge.res,amp:!!input.challenge.amp,box:!!input.challenge.box,
          huntMode:hunt==="box"||hunt==="safe"||hunt==="kiting"?hunt:(input.challenge.box?"box":""),
          kiteDistance:Math.max(1,Math.min(5,Number(input.challenge.kiteDistance)||0))};
      }
      out.push(item);}
    return out;};
  raw=raw&&typeof raw==="object"?raw:{};
  const scarlettIntent=raw.scarlettIntent&&typeof raw.scarlettIntent==="object"?raw.scarlettIntent:null;
  const intentDir=scarlettIntent?String(scarlettIntent.dir||""):"";
  const rawPress=scarlettIntent?scarlettIntent.pressAuth:null;
  const pressAuth=rawPress==null||rawPress===""?NaN:Number(rawPress);
  const spiteIntent=raw.spiteIntent&&typeof raw.spiteIntent==="object"?raw.spiteIntent:null;
  const bubbleIdx=spiteIntent&&spiteIntent.bubble!==undefined&&spiteIntent.bubble!==null
    ?Number(spiteIntent.bubble):NaN;
  const maliceIntent=raw.maliceIntent&&typeof raw.maliceIntent==="object"?raw.maliceIntent:null;
  const mx=maliceIntent?Number(maliceIntent.x):NaN,my=maliceIntent?Number(maliceIntent.y):NaN;
  let maliceMoves=null;
  if(maliceIntent&&Array.isArray(maliceIntent.moves)){
    maliceMoves=maliceIntent.moves.slice(0,16).map((m)=>({
      x:Math.floor(Number(m&&m.x)),y:Math.floor(Number(m&&m.y))
    })).filter((m)=>Number.isFinite(m.x)&&Number.isFinite(m.y));
    if(!maliceMoves.length)maliceMoves=null;
  }else if(Number.isFinite(mx)&&Number.isFinite(my)){
    maliceMoves=[{x:Math.floor(mx),y:Math.floor(my)}];
  }
  const megaIntent=raw.megaIntent&&typeof raw.megaIntent==="object"?raw.megaIntent:null;
  const sanitizeMegaIntent=(src)=>{
    if(!src||typeof src!=="object")return null;
    const megaKind=String(src.kind||"");
    const megaDir=String(src.dir||"");
    const megaBubble=src.bubble!==undefined&&src.bubble!==null?Number(src.bubble):NaN;
    const megaPress=Number(src.pressAuth);
    const megaPlayerId=src.playerId!=null?String(src.playerId):"";
    if(megaKind==="scarlett"&&(megaDir==="up"||megaDir==="down"||megaDir==="left"||megaDir==="right"))
      return{kind:"scarlett",dir:megaDir,pressAuth:Number.isFinite(megaPress)?megaPress:undefined,playerId:megaPlayerId||undefined};
    if(megaKind==="spite"&&Number.isFinite(megaBubble)&&megaBubble>=0&&megaBubble<32)
      return{kind:"spite",bubble:Math.floor(megaBubble),playerId:megaPlayerId||undefined};
    return null;
  };
  const megaOut=sanitizeMegaIntent(megaIntent);
  const megaIntentsRaw=Array.isArray(raw.megaIntents)?raw.megaIntents:[];
  const megaIntentsOut=[];
  for(const item of megaIntentsRaw){
    const clean=sanitizeMegaIntent(item);
    if(clean)megaIntentsOut.push(clean);
    if(megaIntentsOut.length>=24)break;
  }
  return{players:normalize(raw.players,8),mobs:normalize(raw.mobs,64),
    scarlettIntent:intentDir==="up"||intentDir==="down"||intentDir==="left"||intentDir==="right"
      ?{dir:intentDir,pressAuth:Number.isFinite(pressAuth)&&pressAuth>0?pressAuth:undefined}:null,
    spiteIntent:{
      stomp:!!(spiteIntent&&spiteIntent.stomp),
      bubble:Number.isFinite(bubbleIdx)&&bubbleIdx>=0&&bubbleIdx<32?Math.floor(bubbleIdx):undefined},
    maliceIntent:maliceMoves?{moves:maliceMoves}:null,
    megaIntent:megaOut,
    megaIntents:megaIntentsOut};
}
function snapAuthorityEntityToCell(auth,ent){
  if(!ent)return;
  const w=Number(auth&&auth.gridW)||30,h=Number(auth&&auth.gridH)||30;
  const cell=entityGridCell(ent,auth);
  ent.cx=cell.cx;ent.cy=cell.cy;
  ent.x=(cell.cx+.5)/w;ent.y=(cell.cy+.5)/h;
  ent.sx=ent.x;ent.sy=ent.y;
}
function syncAuthorityVisualState(auth,raw){const visual=normalizeVisualState(raw,auth),players=new Map(visual.players.map((v)=>[v.id,v])),
  mobs=new Map(visual.mobs.map((v)=>[v.id,v]));
  const applyPose=(ent,pos)=>{
    if(!ent||!pos)return;
    if(Number.isFinite(Number(pos.cx)))ent.cx=pos.cx;
    if(Number.isFinite(Number(pos.cy)))ent.cy=pos.cy;
    snapAuthorityEntityToCell(auth,ent);
    const x=Number(pos.x),y=Number(pos.y);
    if(Number.isFinite(x)&&Number.isFinite(y)){ent.x=x;ent.y=y;}
  };
  for(const item of auth.players||[]){const pos=players.get(String(item.id));if(pos){
    const combo=pos.combo,stances=pos.stances,challenge=pos.challenge;
    applyPose(item,pos);
    if(combo){
      item.p=item.p||{};item.p.config=item.p.config||{};
      item.p.config.combo=sanitizeCombo(combo,item.p.voc);
    }
    if(stances){item.p=item.p||{};item.p.stances=sanitizeStances(stances,item.p);}
    if(typeof pos.autoWalk==="boolean"){item.p=item.p||{};item.p.config=item.p.config||{};
      if(accountIsVip(item.p))item.p.config.autoWalk=pos.autoWalk;
      else item.p.config.autoWalk=true;
    }
    if(pos.walkIntent&&accountIsVip(item.p))item.walkIntent=pos.walkIntent;else delete item.walkIntent;
    if(challenge){item.p=item.p||{};item.p.config=item.p.config||{};
      item.p.config.exetaRes=!!challenge.res;item.p.config.exetaAmpRes=!!challenge.amp;
      const mode=challenge.huntMode||(challenge.box?"box":"");
      if(mode==="box"||mode==="safe"||mode==="kiting")item.p.config.attackMode=mode;
      if(challenge.kiteDistance)item.p.config.kiteDistance=challenge.kiteDistance;
      if(mode==="box"||mode==="safe")auth.huntMode=mode;}
    /* Aplica as demais configurações do Helper enviadas pelo cliente no tick.
     * Whitelist evita que campos estranhos entrem na autoridade. */
    if(pos.cfg&&typeof pos.cfg==="object"){
      item.p=item.p||{};item.p.config=item.p.config||{};
      const allowed=new Set(HELPER_PRESET_CONFIG_FIELDS);
      for(const k of Object.keys(pos.cfg)){
        if(!allowed.has(k))continue;
        const v=pos.cfg[k];
        if(v!==undefined)item.p.config[k]=v;
      }
    }
  }}
  const clock=Number(auth.clock)||0;
  for(const mob of auth.mobs||[]){
    const pos=mobs.get(String(mob.id));if(!pos)continue;
    // Enquanto o Challenge puxa o bicho para o knight, a predição ranged do
    // cliente não pode devolver o alvo à distância de tiro a cada tick.
    if((Number(mob.challengedUntil)||0)>clock||(Number(mob.forceMeleeUntil)||0)>clock)continue;
    applyPose(mob,pos);
  }
  if(auth.scarlett&&visual.scarlettIntent&&visual.scarlettIntent.dir){
    const pi={dir:visual.scarlettIntent.dir};
    const pressAuth=Number(visual.scarlettIntent.pressAuth);
    if(Number.isFinite(pressAuth))pi.pressAuth=pressAuth;
    auth.scarlett.pendingIntent=pi;
  }
  if(auth.spite&&visual.spiteIntent){
    if(visual.spiteIntent.stomp)auth.spite.pendingStomp=true;
    if(visual.spiteIntent.bubble!==undefined)auth.spite.pendingBubble=visual.spiteIntent.bubble;
  }
  if(auth.malice&&visual.maliceIntent){
    const moves=Array.isArray(visual.maliceIntent.moves)?visual.maliceIntent.moves:[];
    if(moves.length){
      auth.malice.pendingMoves=Array.isArray(auth.malice.pendingMoves)?auth.malice.pendingMoves:[];
      for(const mv of moves)auth.malice.pendingMoves.push({x:mv.x,y:mv.y});
      if(auth.malice.pendingMoves.length>64)
        auth.malice.pendingMoves.splice(0,auth.malice.pendingMoves.length-64);
    }
  }
  if(auth.mega&&(visual.megaIntent||(Array.isArray(visual.megaIntents)&&visual.megaIntents.length))){
    auth.mega.pendingIntents=auth.mega.pendingIntents||[];
    if(visual.megaIntent)auth.mega.pendingIntents.push(Object.assign({},visual.megaIntent));
    if(Array.isArray(visual.megaIntents)){
      for(const intent of visual.megaIntents)if(intent)auth.mega.pendingIntents.push(Object.assign({},intent));
    }
  }
  return visual;
}
function expForLevel(level){return Math.floor((50/3)*(level**3-6*level**2+17*level-12));}
function maxStats(p){ensurePlayerCapacity(p);const level=Math.max(1,Number(p.level)||1),v=VOC[p.voc]||VOC.none;
  const rook=Math.min(level-1,7),voc=Math.max(0,level-1-rook);let hp=START_HP+rook*5+voc*v.hp,mp=START_MP+rook*5+voc*v.mp;
  let cap=400+rook*10+voc*(Number(v.cap)||10);
  for(const slot of Object.keys(p.equip||{})){const e=p.equip[slot],it=e&&ITEMS[e.item];if(it){hp+=Number(it.hp)||0;mp+=Number(it.mp)||0;}}
  if(WHEEL_FN&&typeof WHEEL_FN.wheelTotals==="function"){
    const w=WHEEL_FN.wheelTotals(p);hp+=Number(w&&w.hp)||0;mp+=Number(w&&w.mp)||0;cap+=Number(w&&w.cap)||0;
  }
  cap=Math.max(cap,ensurePlayerCapacity(p));
  return {hp:Math.max(1,Math.floor(hp)),mp:Math.max(0,Math.floor(mp)),cap:Math.max(0,Math.floor(cap))};}
const DEFAULT_PLAYER_CAP=5000;
function ensurePlayerCapacity(p){
  if(!p)return DEFAULT_PLAYER_CAP;
  const n=Math.floor(Number(p.cap));
  if(!Number.isFinite(n)||n<=0)p.cap=DEFAULT_PLAYER_CAP;
  else p.cap=n;
  return p.cap;
}
function itemUnitWeight(slug){
  const it=ITEMS[slug];
  const w=Number(it&&(it.w!==undefined?it.w:it.weight));
  return Number.isFinite(w)&&w>=0?w:0.1;
}
function containerWeight(map){
  let w=0;for(const slug of Object.keys(map||{})){
    const n=Math.max(0,Math.floor(Number(map[slug])||0));if(!n)continue;
    w+=itemUnitWeight(slug)*n;
  }
  return w;
}
/* Equip + bag + loot pouch + supply stash. Supplies/ammo são contadores idle. */
function carriedWeight(p){
  if(!p)return 0;
  let w=0;
  for(const slot of Object.keys(p.equip||{})){
    const e=p.equip[slot];if(e&&e.item)w+=itemUnitWeight(e.item);
  }
  w+=containerWeight(p.bag);
  w+=containerWeight(p.lootPouch);
  w+=containerWeight(p.supplyStash);
  return w;
}
function freeCapacity(p){
  const max=maxStats(p).cap;
  return Math.max(0,max-carriedWeight(p));
}
function accountIsVip(p){
  const until=Number(p&&p.vipUntil)||0;
  return until>Date.now();
}
function shareAccountGoldWallets(auth){
  if(!auth||!Array.isArray(auth.players))return;
  const wallets=auth.wallets&&typeof auth.wallets==="object"?auth.wallets:{};
  auth.wallets=wallets;
  for(const item of auth.players){
    if(!item||!item.p)continue;
    const aid=String(item.accountId||item.p.accountId||("solo:"+item.id));
    item.accountId=aid.startsWith("solo:")?undefined:Number(aid)||item.accountId;
    item.p.accountId=item.accountId||item.p.accountId;
    if(!wallets[aid])wallets[aid]={gold:Math.max(0,Math.floor(Number(item.p.gold)||0))};
    else{
      // Mantém o maior valor ao reidratar (evita zerar se um snapshot veio atrasado).
      wallets[aid].gold=Math.max(wallets[aid].gold,Math.max(0,Math.floor(Number(item.p.gold)||0)));
    }
    const wallet=wallets[aid];
    try{
      Object.defineProperty(item.p,"gold",{
        configurable:true,enumerable:true,
        get(){return wallet.gold;},
        set(v){wallet.gold=Math.max(0,Math.floor(Number(v)||0));},
      });
    }catch(e){item.p.gold=wallet.gold;}
  }
}
function pouchUnitSellPrice(it){
  if(!it)return 0;
  const npc=Number(it.npcSell);
  if(Number.isFinite(npc)&&npc>0)return Math.floor(npc);
  const sell=Number(it.sell);
  if(Number.isFinite(sell)&&sell>0)return Math.floor(sell);
  return 0;
}
function ensureLootConfig(p){
  if(!p)return {noCollect:[],noSell:[]};
  if(!p.lootConfig||typeof p.lootConfig!=="object"||Array.isArray(p.lootConfig))
    p.lootConfig={noCollect:[],noSell:[]};
  if(!Array.isArray(p.lootConfig.noCollect))p.lootConfig.noCollect=[];
  if(!Array.isArray(p.lootConfig.noSell))p.lootConfig.noSell=[];
  return p.lootConfig;
}
function normalizeLootRule(text){return String(text||"").trim().toLowerCase();}
function itemLootDisplayName(slug){
  const it=ITEMS[slug];
  return it?(it.n||it.name||slug):slug;
}
function lootRuleMatches(slug,rule){
  rule=normalizeLootRule(rule);if(!rule)return false;
  const name=normalizeLootRule(itemLootDisplayName(slug));
  const id=normalizeLootRule(slug);
  return id===rule||name===rule||id.indexOf(rule)!==-1||name.indexOf(rule)!==-1;
}
/** NÃO COLETAR — mesma semântica do cliente (`lootConfig.noCollect`). */
function isAuthNoCollect(p,slug){
  if(!p||!slug)return false;
  return ensureLootConfig(p).noCollect.some((r)=>lootRuleMatches(slug,r));
}
/** NÃO VENDER — lootConfig.noSell + legado config.noSell[slug]. */
function isAuthNoSell(p,slug){
  if(!p||!slug)return false;
  if(p.config&&p.config.noSell&&p.config.noSell[slug])return true;
  return ensureLootConfig(p).noSell.some((r)=>lootRuleMatches(slug,r));
}
/** Substitui a lista completa de regras (patch autoritativo / save). */
function setAuthLootConfig(p,lootConfig){
  if(!p)return false;
  const next=lootConfig&&typeof lootConfig==="object"&&!Array.isArray(lootConfig)?lootConfig:{};
  const noCollect=Array.isArray(next.noCollect)?next.noCollect.map(normalizeLootRule).filter(Boolean):[];
  const noSell=Array.isArray(next.noSell)?next.noSell.map(normalizeLootRule).filter(Boolean):[];
  p.lootConfig={noCollect,noSell};
  return true;
}
function sellAuthPouchItem(p,slug){
  const it=ITEMS[slug],count=Math.max(0,Math.floor(Number(p.lootPouch&&p.lootPouch[slug])||0));
  if(!it||count<=0)return 0;
  if(Number(it.cls)>=3)return 0;
  if(isAuthNoSell(p,slug))return 0;
  const unit=pouchUnitSellPrice(it);
  if(unit<=0)return 0;
  const value=unit*count;
  if(!Number.isFinite(value)||value<=0)return 0;
  p.gold=Math.max(0,(Number(p.gold)||0)+value);
  delete p.lootPouch[slug];
  return value;
}
/** Sell All / autoseller: pula materiais de imbue (VENDER manual usa sellAuthPouchItem). */
function isAuthImbueMat(slug,it){
  if(it&&it._imbMat!=null)return true;
  return typeof slug==="string"&&/^mat-/.test(slug);
}
function sellAuthAllPouch(p){
  let total=0;p.lootPouch=p.lootPouch||{};
  for(const slug of Object.keys(p.lootPouch)){
    if(isAuthImbueMat(slug,ITEMS[slug]))continue;
    total+=sellAuthPouchItem(p,slug);
  }
  return total;
}
/** Reconta bag[slug] a partir de instâncias (espelha syncBagCountsFromInstances do cliente). */
function authSyncBagCountsFromInstances(p){
  if(!p)return;
  p.bag=p.bag||{};
  p.itemInstances=Array.isArray(p.itemInstances)?p.itemInstances:[];
  const nextBag={};
  for(const slug of Object.keys(p.bag)){
    if(!p.bag[slug]||authItemNeedsBagInstance(slug))continue;
    nextBag[slug]=Math.max(0,Math.floor(Number(p.bag[slug])||0));
  }
  const rest=[];
  for(const inst of p.itemInstances){
    if(!inst)continue;
    if(inst.loc!=="bag"){rest.push(inst);continue;}
    const slug=String(inst.slug||"");
    if(!slug)continue;
    // Acessórios com carga parcial ficam só como instância (não entram no stack).
    const it=ITEMS[slug];
    const chargeable=!!(it&&it.charges&&(it.s==="ring"||it.s==="amulet"||it.s==="boots")&&!it.imbSlots);
    if(chargeable){
      const full=Math.floor(Number(it.charges)||0);
      const ch=inst.charges==null?full:Math.floor(Number(inst.charges)||0);
      if(full>0&&ch>0&&ch<full){rest.push(inst);continue;}
      nextBag[slug]=(Number(nextBag[slug])||0)+1;
      continue;
    }
    nextBag[slug]=(Number(nextBag[slug])||0)+1;
    if(authItemNeedsBagInstance(slug))rest.push(inst);
  }
  p.bag=nextBag;
  p.itemInstances=rest;
}
/**
 * Vende um stack/instância da mochila (autoritativo).
 * slug+instId → uma instância; só slug → stack inteiro (ou moeda).
 */
function sellAuthBagItem(p,slug,instId){
  if(!p||!slug)return 0;
  const it=ITEMS[slug];
  if(!it)return 0;
  p.bag=p.bag||{};
  p.itemInstances=Array.isArray(p.itemInstances)?p.itemInstances:[];
  if(instId&&authItemNeedsBagInstance(slug)){
    const idx=p.itemInstances.findIndex((inst)=>inst&&String(inst.id)===String(instId)&&inst.loc==="bag"&&inst.slug===slug);
    if(idx<0)return 0;
    const inst=p.itemInstances[idx];
    const valueOne=Math.max(0,Math.floor(Number(it.sell)||0));
    if(valueOne<=0)return 0;
    if(Number(inst.tier)>0)return 0;
    if(isAuthNoSell(p,slug))return 0;
    p.itemInstances.splice(idx,1);
    authSyncBagCountsFromInstances(p);
    p.gold=Math.max(0,(Number(p.gold)||0)+valueOne);
    return valueOne;
  }
  const count=Math.max(0,Math.floor(Number(p.bag[slug])||0));
  if(count<=0)return 0;
  const face=CURRENCY_GOLD[slug];
  if(face){
    const value=face*count;
    if(!Number.isFinite(value)||value<=0)return 0;
    delete p.bag[slug];
    p.gold=Math.max(0,(Number(p.gold)||0)+value);
    return value;
  }
  if(authItemNeedsBagInstance(slug))return 0;
  const unit=Math.max(0,Math.floor(Number(it.sell)||0));
  if(unit<=0||isAuthNoSell(p,slug))return 0;
  const value=unit*count;
  if(!Number.isFinite(value)||value<=0)return 0;
  delete p.bag[slug];
  p.gold=Math.max(0,(Number(p.gold)||0)+value);
  return value;
}
/** Sell All da mochila: stacks com sell>0 + instâncias bag sem tier; respeita NÃO VENDER. */
function sellAuthAllBag(p){
  if(!p)return 0;
  p.bag=p.bag||{};
  p.itemInstances=Array.isArray(p.itemInstances)?p.itemInstances:[];
  let total=0;
  for(const slug of Object.keys(p.bag)){
    if(authItemNeedsBagInstance(slug))continue;
    const it=ITEMS[slug];
    const count=Math.max(0,Math.floor(Number(p.bag[slug])||0));
    if(!it||count<=0)continue;
    if((Number(it.sell)||0)<=0||isAuthNoSell(p,slug))continue;
    total+=sellAuthBagItem(p,slug,null);
  }
  let instGold=0;
  const rest=[];
  for(const inst of p.itemInstances){
    if(!inst||inst.loc!=="bag"){rest.push(inst);continue;}
    const it=ITEMS[inst.slug];
    if(!it||(Number(it.sell)||0)<=0||Number(inst.tier)>0||isAuthNoSell(p,inst.slug)){
      rest.push(inst);
      continue;
    }
    instGold+=Math.max(0,Math.floor(Number(it.sell)||0));
  }
  p.itemInstances=rest;
  authSyncBagCountsFromInstances(p);
  if(instGold>0)p.gold=Math.max(0,(Number(p.gold)||0)+instGold);
  return total+instGold;
}
/** Remove item da loot pouch (destroy/discard). Retorna qty removida. */
function destroyAuthPouchItem(p,slug){
  if(!p||!slug)return 0;
  p.lootPouch=p.lootPouch||{};
  const count=Math.max(0,Math.floor(Number(p.lootPouch[slug])||0));
  if(count<=0)return 0;
  delete p.lootPouch[slug];
  return count;
}
/** Pool oficial da Bag You Desire — sincronizado com window.soulwarOpenBag do
 * cliente (soulwar.js). */
const SOUL_BAG_POOL=["soulbastion","soulbleeder","soulcrusher","soulcutter","soulhexer",
  "soulmaimer","soulpiercer","soulshredder","soulshroud","soulstrider","soulmantle",
  "pair-of-soulwalkers","soulbiter","soulful-legs","soulshell"];
/** Abre uma Bag You Desire: remove 1 da Loot Pouch e sorteia 1 item Soul War
 * para o Depot (cap de 30 slots). */
function openAuthBagYouDesire(p){
  if(!p)return {ok:false,msg:"Personagem inválido"};
  p.lootPouch=p.lootPouch||{};
  const count=Math.max(0,Math.floor(Number(p.lootPouch["bag-you-desire"])||0));
  if(count<=0)return {ok:false,msg:"Bag You Desire não encontrada na Loot Pouch"};
  p.depot=Array.isArray(p.depot)?p.depot:[];
  if(p.depot.length>=30)return {ok:false,msg:"Depot cheio (30 slots)"};
  if(count<=1)delete p.lootPouch["bag-you-desire"];
  else p.lootPouch["bag-you-desire"]=count-1;
  const item=SOUL_BAG_POOL[Math.floor(Math.random()*SOUL_BAG_POOL.length)];
  p.depot.push(item);
  return {ok:true,item:item};
}
/** Itens que ocupam 1 slot/instância na bag (armas, armaduras…). */
function authItemNeedsBagInstance(slug){
  const it=ITEMS[slug];
  if(!it||!it.s||it.s==="ammo")return false;
  if(it.t==="distance"&&!it.imbSlots)return false;
  if(it.charges&&(it.s==="ring"||it.s==="amulet"||it.s==="boots")&&!it.imbSlots)return false;
  return true;
}
function authBagUsedSlots(p){
  let used=(Array.isArray(p.itemInstances)?p.itemInstances:[]).filter((i)=>i&&i.loc==="bag").length;
  used+=Object.keys(p.bag||{}).filter((s)=>(Number(p.bag[s])||0)>0&&!authItemNeedsBagInstance(s)).length;
  return used;
}
function authBagSlots(p){return Math.max(1,Math.floor(Number(p.bagSlots)||8));}
function authAddItemToBag(p,slug,count){
  if(!p||!slug)return false;
  count=Math.max(1,Math.floor(Number(count)||1));
  p.bag=p.bag||{};p.itemInstances=Array.isArray(p.itemInstances)?p.itemInstances:[];
  const weight=itemUnitWeight(slug)*count;
  if(weight>freeCapacity(p)+1e-9)return false;
  if(authItemNeedsBagInstance(slug)){
    if(authBagUsedSlots(p)+count>authBagSlots(p))return false;
    for(let i=0;i<count;i++){
      p.itemInstances.push({
        id:"srv-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1e6).toString(36)+"-"+i,
        slug,loc:"bag",tier:0,
      });
      p.bag[slug]=(Number(p.bag[slug])||0)+1;
    }
    return true;
  }
  const had=(Number(p.bag[slug])||0)>0;
  if(!had&&authBagUsedSlots(p)>=authBagSlots(p))return false;
  p.bag[slug]=(Number(p.bag[slug])||0)+count;
  return true;
}
/**
 * Move stack da Loot Pouch → backpack (autoritativo).
 * Necessário porque lootPouch é protected no PUT comum — mover só no
 * cliente duplicava o item (bag no save + pouch antiga no servidor).
 */
function moveLootPouchToBag(p,slug,qty){
  if(!p||!slug)return false;
  p.lootPouch=p.lootPouch||{};
  const have=Math.max(0,Math.floor(Number(p.lootPouch[slug])||0));
  if(have<=0)return false;
  const count=qty==null?have:Math.max(1,Math.min(have,Math.floor(Number(qty)||have)));
  p.lootPouch[slug]-=count;
  if(p.lootPouch[slug]<=0)delete p.lootPouch[slug];
  if(!authAddItemToBag(p,slug,count)){
    p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+count;
    return false;
  }
  return true;
}
/** Liga/desliga Auto Supply Stash por item na autoridade. */
function setAuthAutoSupplyStash(p,slug,on){
  if(!p||!slug||!isSupplyStashableItem(slug))return false;
  ensureSupplyStash(p);
  if(on)p.config.autoSupplyStash[slug]=true;
  else delete p.config.autoSupplyStash[slug];
  return true;
}
/* Loot Pouch sem limite de slots: gatilho do autoseller = QUANTIDADE total
 * de itens (soma das contagens), mesma regra do cliente. */
function lootPouchFillPct(p){
  let n=0;for(const slug of Object.keys(p.lootPouch||{}))n+=Math.max(0,Math.floor(Number(p.lootPouch[slug])||0));
  return n;
}
/* Autoseller da Loot Pouch: cooldown entre vendas — 5 min normal, 2 min VIP.
 * O timestamp fica no save do personagem, então o cooldown sobrevive a
 * reload do servidor/reconexão. */
function tryAuthAutoSell(auth,item,now){
  const p=item&&item.p;if(!p||!p.config||!p.config.pouchAutoSell)return;
  const cd=accountIsVip(p)?2*60*1000:5*60*1000;
  if((Number(p._pouchAutoSellAt)||0)+cd>(now||Date.now()))return;
  const pct=lootPouchFillPct(p),need=Math.max(10,Math.min(100,Number(p.config.pouchAutoSellPct)||80));
  if(pct<need)return;
  const gold=sellAuthAllPouch(p);
  if(gold>0){p._pouchAutoSellAt=now||Date.now();auth.events.push({t:"sell",gold,msg:"Autoseller",targetId:String(item.id),ts:now});}
}
function blessingPrice(level){level=Math.max(1,Math.floor(Number(level)||1));return level*(level<=120?500:level<400?700:1000);}
function recordAuthSessionDeath(auth,item){
  if(!auth||!auth.stats||!item)return;
  const p=item.p||{};
  const id=String(item.id!=null?item.id:(p.id!=null?p.id:"player"));
  auth.stats.deaths=(Number(auth.stats.deaths)||0)+1;
  if(!auth.stats.deathTrack||typeof auth.stats.deathTrack!=="object")
    auth.stats.deathTrack={startedAt:Number(auth.clock)||Date.now(),byPlayer:{}};
  if(!auth.stats.deathTrack.byPlayer||typeof auth.stats.deathTrack.byPlayer!=="object")
    auth.stats.deathTrack.byPlayer={};
  const row=auth.stats.deathTrack.byPlayer[id]||(auth.stats.deathTrack.byPlayer[id]={
    id,name:p.name||"Player",voc:p.voc||"none",deaths:0,blessGold:0});
  row.deaths=(Number(row.deaths)||0)+1;
  if(p.name)row.name=p.name;
  if(p.voc)row.voc=p.voc;
}
function recordAuthSessionBless(auth,byPlayer){
  if(!auth||!auth.stats||!byPlayer)return 0;
  if(!auth.stats.deathTrack||typeof auth.stats.deathTrack!=="object")
    auth.stats.deathTrack={startedAt:Number(auth.clock)||Date.now(),byPlayer:{}};
  if(!auth.stats.deathTrack.byPlayer||typeof auth.stats.deathTrack.byPlayer!=="object")
    auth.stats.deathTrack.byPlayer={};
  let total=0;
  for(const key of Object.keys(byPlayer)){
    const amount=Math.max(0,Math.round(Number(byPlayer[key])||0));
    if(!amount)continue;
    const id=String(key);
    const ent=(auth.players||[]).find((e)=>String(e&&e.id)===id);
    const p=(ent&&ent.p)||{};
    const row=auth.stats.deathTrack.byPlayer[id]||(auth.stats.deathTrack.byPlayer[id]={
      id,name:p.name||"Player",voc:p.voc||"none",deaths:0,blessGold:0});
    row.blessGold=(Number(row.blessGold)||0)+amount;
    if(p.name)row.name=p.name;
    if(p.voc)row.voc=p.voc;
    total+=amount;
  }
  if(total)auth.stats.blessCost=(Number(auth.stats.blessCost)||0)+total;
  return total;
}
function seedFor(id){return parseInt(crypto.createHash("sha256").update(String(id)).digest("hex").slice(0,8),16)||1;}
function random(auth){let x=Number(auth.rngState)||1;x^=x<<13;x^=x>>>17;x^=x<<5;auth.rngState=x>>>0;return auth.rngState/4294967296;}
function roll(auth,min,max){return Math.floor(min+random(auth)*(max-min+1));}
function monsterDef(slug){return MONSTERS[String(slug)]||null;}
function weaponAttack(p){const e=p.equip&&p.equip.weapon,it=e&&ITEMS[e.item],a=p.equip&&p.equip.ammo,ammo=a&&ITEMS[a.item];
  const ranged=it&&(it.type==="distance"||it.t==="distance");
  const base=Number(it&&(it.attack!==undefined?it.attack:it.atk))||0,shot=ranged&&ammo?Number(ammo.attack||ammo.atk)||0:0;
  return Math.max(7,base+shot||7);}
function gearSpeedBonus(p){
  let speed=0;for(const slot of Object.keys(p&&p.equip||{})){
    const it=ITEMS[p.equip[slot]&&p.equip[slot].item];speed+=Number(it&&(it.spd||it.speed))||0;}
  return speed;}
/* Intervalo de auto-ataque: mesma base do cliente (combat.js attackInterval).
 * Arma pode declarar attackSpeed (ms); senão 1200. Haste/equip abaixam até 800. */
function playerAttackInterval(p,now){
  const it=ITEMS[p&&p.equip&&p.equip.weapon&&p.equip.weapon.item];
  let base=Math.max(800,Number(it&&it.attackSpeed)||1200);
  if(hasteActive(p,now))base*=0.8;
  base-=Math.min(400,gearSpeedBonus(p)*4);
  return Math.max(800,Math.floor(base));}
function swingVisualTs(stepTs,dt,acc,interval,swing){
  const overshoot=Math.max(0,Number(acc)||0)-Math.max(1,Number(interval)||1200);
  return (Number(stepTs)||0)-Math.min(Math.max(1,Number(dt)||1000),Math.max(0,overshoot))+swing*30;}
function equippedQuiver(p){
  const e=p&&p.equip&&p.equip.shield,it=e&&ITEMS[e.item];
  if(it&&(it.type==="quiver"||it.t==="quiver"||it.s==="quiver"))return e;
  if(e&&QUIVERS[e.item])return e;
  return null;}
function ammoKindOf(it){
  if(!it)return "arrow";
  const explicit=it.ammoKind||it.tipo||it.ammoType||it.ammotype;
  if(explicit){const k=String(explicit).toLowerCase();if(k==="bolt")return "bolt";if(k==="arrow")return "arrow";}
  return /bolt/i.test(String(it.n||it.name||it.sprite||""))?"bolt":"arrow";}
/* Canary items.xml ammotype: bow=arrow, crossbow=bolt. Arremesso (spear/star)
 * não tem ammotype — a arma É a munição e não usa quiver. */
function weaponAmmoKind(wp,slug){
  if(!wp)return null;
  const explicit=wp.ammoKind||wp.ammoType||wp.ammotype;
  if(explicit){const k=String(explicit).toLowerCase();return k==="bolt"?"bolt":k==="arrow"?"arrow":null;}
  const id=String(slug||"");
  if(/crossbow|arbalest|bolter|spitter|ironworker|devileye/.test(id))return "bolt";
  if(/bow/.test(id)&&!/crossbow/.test(id))return "arrow";
  return null;}
function ammoCompatibleWithWeapon(ammoIt,weaponSlug){
  if(!ammoIt||!weaponSlug)return false;
  const need=weaponAmmoKind(ITEMS[weaponSlug],weaponSlug);
  if(!need)return false;
  return ammoKindOf(ammoIt)===need;}
function consumeDistanceAmmo(auth,p){
  const weapon=p&&p.equip&&p.equip.weapon,wp=weapon&&ITEMS[weapon.item];
  if(!wp||(wp.type!=="distance"&&wp.t!=="distance"))return {ok:true,ranged:false};
  const need=weaponAmmoKind(wp,weapon.item);
  if(wp.inf||!need)return {ok:true,ranged:true,infinite:true,throwing:!need};
  if(!equippedQuiver(p))return {ok:false,ranged:true};
  const ammo=p.equip&&p.equip.ammo,it=ammo&&ITEMS[ammo.item];
  if(!it||(it.s!=="ammo"&&it.type!=="ammo"&&it.slot!=="ammo"))return {ok:false,ranged:true};
  if(!ammoCompatibleWithWeapon(it,weapon.item))return {ok:false,ranged:true};
  const needLvl=Number(it.lvl!==undefined?it.lvl:it.level)||0;
  if(needLvl>(Number(p.level)||1))return {ok:false,ranged:true};
  const slug=ammo.item,cost=supplyPriceOf(slug);
  if(cost>0){if((Number(p.gold)||0)<cost)return {ok:false,ranged:true};p.gold=Math.max(0,(Number(p.gold)||0)-cost);}
  recordSupplyUse(auth,slug,cost);
  return {ok:true,ranged:true,ammo:it,slug};}
function ammoMatrixTargets(auth,matrix,center,living){
  if(!Array.isArray(matrix)||!matrix.length||!center)return [];
  const origin=entityGridCell(center,auth);let or=Math.floor(matrix.length/2),oc=Math.floor((matrix[0]||[]).length/2);
  for(let r=0;r<matrix.length;r++)for(let c=0;c<(matrix[r]||[]).length;c++)if(Number(matrix[r][c])===3){or=r;oc=c;}
  const hit=new Set();
  for(let r=0;r<matrix.length;r++)for(let c=0;c<(matrix[r]||[]).length;c++){
    if(!matrix[r][c])continue;hit.add((origin.cx+(c-oc))+":"+(origin.cy+(r-or)));}
  return (living||[]).filter((m)=>{if(!m||!(m.hp>0))return false;const g=entityGridCell(m,auth);return hit.has(g.cx+":"+g.cy);});}
function ammoMatrixCells(auth,matrix,center){
  if(!Array.isArray(matrix)||!matrix.length||!center)return [];
  const origin=entityGridCell(center,auth);let or=Math.floor(matrix.length/2),oc=Math.floor((matrix[0]||[]).length/2);
  for(let r=0;r<matrix.length;r++)for(let c=0;c<(matrix[r]||[]).length;c++)if(Number(matrix[r][c])===3){or=r;oc=c;}
  const w=Number(auth&&auth.gridW)||30,h=Number(auth&&auth.gridH)||30,cells=[],seen=new Set();
  for(let r=0;r<matrix.length;r++)for(let c=0;c<(matrix[r]||[]).length;c++){
    if(!matrix[r][c])continue;
    const cx=origin.cx+(c-oc),cy=origin.cy+(r-or),key=cx+":"+cy;
    if(cx<0||cy<0||cx>=w||cy>=h||seen.has(key))continue;
    seen.add(key);cells.push({cx,cy});
  }
  return cells;
}
function quiverPerfectShot(p,sqm){
  const q=equippedQuiver(p),it=q&&ITEMS[q.item];
  if(!it||!(Number(it.shotDmg)>0))return 0;
  return Number(sqm)===Number(it.shotRange)?Number(it.shotDmg):0;}
function wandPerfectShot(p,sqm){
  const it=ITEMS[p&&p.equip&&p.equip.weapon&&p.equip.weapon.item];
  if(!it||!(Number(it.shotDmg)>0))return 0;
  return Number(sqm)===Number(it.shotRange)?Number(it.shotDmg):0;}
function weaponPerfectShot(p,sqm,profile){
  if(profile&&profile.type==="distance")return quiverPerfectShot(p,sqm);
  if(profile&&profile.type==="magic")return wandPerfectShot(p,sqm);
  return quiverPerfectShot(p,sqm)||wandPerfectShot(p,sqm);}
function distanceHitChance(auth,p,ammoIt,sqm,weaponIt){
  if(ammoIt&&(ammoIt.noMiss||Number(ammoIt.hit)>=100))return true;
  const maxHit=ammoIt?Math.max(1,Number(ammoIt.hit)||90):Math.max(1,Number(weaponIt&&weaponIt.hit)||75);
  const skill=Math.max(0,stanceSkill(p,"dist"));
  const d=Math.max(1,Math.round(Number(sqm)||1));
  const m=Math.min.bind(Math);
  let chance=maxHit;
  if(maxHit>=100){
    switch(d){case 1:case 5:chance=m(skill,73)*1.35+1;break;case 2:chance=m(skill,30)*3.20+4;break;
      case 3:chance=m(skill,48)*2.05+2;break;case 4:chance=m(skill,65)*1.50+2;break;
      case 6:chance=m(skill,87)*1.20-4;break;case 7:chance=m(skill,90)*1.10+1;break;default:chance=maxHit;}
  }else if(maxHit<=75){
    switch(d){case 1:case 5:chance=m(skill,74)+1;break;case 2:chance=m(skill,28)*2.40+8;break;
      case 3:chance=m(skill,45)*1.55+6;break;case 4:chance=m(skill,58)*1.25+3;break;
      case 6:chance=m(skill,90)*0.80+3;break;case 7:chance=m(skill,104)*0.70+2;break;default:chance=maxHit;}
  }else{
    switch(d){case 1:case 5:chance=m(skill,74)*1.20+1;break;case 2:chance=m(skill,28)*3.20;break;
      case 3:chance=m(skill,45)*2;break;case 4:chance=m(skill,58)*1.55;break;
      case 6:case 7:chance=m(skill,90);break;default:chance=90;}
  }
  return (random(auth)*100)<Math.max(1,Math.min(100,chance));}
const HASTEDATA={
  "utamo-tempo-san":{cd:4000,dur:10000,lvl:55,mana:400,maxa:1.8,maxb:72,mina:1.8,minb:72,nome:"Swift Foot"},
  "utani-gran-hur":{cd:2000,dur:22000,lvl:20,mana:100,maxa:1.7,maxb:40,mina:1.7,minb:40,nome:"Strong Haste"},
  "utani-hur":{cd:2000,dur:30000,lvl:14,mana:60,maxa:1.3,maxb:40,mina:1.3,minb:40,nome:"Haste"},
  "utani-tempo-hur":{cd:2000,dur:5000,lvl:25,mana:100,maxa:1.9,maxb:40,mina:1.9,minb:40,nome:"Charge"},
};
const BUFFS={
  "utura-tio":{id:"virtue-sustain",nome:"Virtue of Sustain",grupo:"virtue",voc:"monk",dur:3600000},
  "utito-virtu":{id:"virtue-justice",nome:"Virtue of Justice",grupo:"virtue",voc:"monk",dur:3600000},
  "utori-virtu":{id:"virtue-harmony",nome:"Virtue of Harmony",grupo:"virtue",voc:"monk",dur:3600000},
  "exana-amp-res":{id:"divine-dazzle",nome:"Divine Dazzle",grupo:"support",voc:"paladin",dur:16000,mobMissChance:0.35},
};
const CHARMS={
  wound:{tipo:"ofensivo",elemento:"physical",percent:5,chance:5,custo:240},
  enflame:{tipo:"ofensivo",elemento:"fire",percent:5,chance:5,custo:400},
  poison:{tipo:"ofensivo",elemento:"earth",percent:5,chance:5,custo:240},
  freeze:{tipo:"ofensivo",elemento:"ice",percent:5,chance:5,custo:320},
  zap:{tipo:"ofensivo",elemento:"energy",percent:5,chance:5,custo:320},
  curse:{tipo:"ofensivo",elemento:"death",percent:5,chance:5,custo:360},
  cripple:{tipo:"ofensivo",chance:6,custo:100},
  parry:{tipo:"defesa",chance:5,custo:400},
  dodge:{tipo:"defesa",chance:5,custo:240},
  adrenaline:{tipo:"defesa",chance:6,custo:100},
  numb:{tipo:"defesa",chance:6,custo:100},
  cleanse:{tipo:"defesa",chance:6,custo:100},
  bless:{tipo:"passivo",percent:10,custo:100},
  scavenge:{tipo:"passivo",chance:60,custo:100},
  gut:{tipo:"passivo",percent:20,custo:100},
  lowblow:{tipo:"passivo",chance:4,custo:800},
  divine:{tipo:"ofensivo",elemento:"holy",percent:5,chance:5,custo:600},
  vampiric:{tipo:"passivo",chance:1.6,custo:100},
  voidcall:{tipo:"passivo",chance:0.8,custo:100},
  savage:{tipo:"passivo",chance:20,custo:800},
  fatal:{tipo:"passivo",chance:30,custo:100},
  voidinversion:{tipo:"passivo",chance:20,custo:100},
  carnage:{tipo:"ofensivo",percent:15,chance:10,custo:600},
  overpower:{tipo:"ofensivo",elemento:"physical",percent:5,chance:5,custo:600},
  overflux:{tipo:"ofensivo",elemento:"physical",percent:2.5,chance:5,custo:600},
};
const IMB_SKILL_FX={
  Strike:{crit:[0,15,25,50],critChance:[0,10,10,10]},
  Chop:{axe:[0,1,2,4]},Slash:{sword:[0,1,2,4]},Bash:{club:[0,1,2,4]},
  Precision:{dist:[0,1,2,4]},Punch:{fist:[0,1,2,4]},Epiphany:{magic:[0,1,2,4]},
  Swiftness:{speed:[0,10,15,30]},
};
const CURE_ORDEM=["cursed","fire","energy","bleed","poison","freezing"];
const WHEEL_FOCUS_SPELLS=["exori-flam","exori-mort","exori-frigo","exori-gran-flam","exori-gran-mort","exori-gran-frigo","exori-vis","exori-gran-vis","exevo-flam-hur","exevo-frigo-hur","exevo-vis-hur","exevo-mort-hur","exevo-gran-flam-hur","exevo-gran-frigo-hur","exevo-gran-vis-hur"];
const SERVER_BESTIARY_RATE=2;
const BOSS_CATS={bane:{kills:30,pts:5},archfoe:{kills:10,pts:15},nemesis:{kills:5,pts:50}};
function hasteActive(p,now){
  now=Number(now)||Date.now();if(!p||!p.buffs)return null;
  let best=null,bestDelta=-1;
  for(const id of Object.keys(HASTEDATA)){
    if(!(Number(p.buffs[id])>now)&&!(Number(p.buffs.haste)>now&&id==="utani-hur"))continue;
    const d=hasteDelta(p,id);if(d>bestDelta){bestDelta=d;best=id;}
  }
  if(!best&&Number(p.buffs.haste)>now)best="utani-hur";
  return best;
}
function hasteDelta(p,id){
  const h=HASTEDATA[id];if(!h)return 0;
  const base=200,dif=base-40;
  const lo=h.mina*dif+h.minb,hi=h.maxa*dif+h.maxb;
  return Math.round((lo+hi)/2-base);
}
function swiftFootMul(p,now){
  now=Number(now)||Date.now();
  return (p&&p.buffs&&Number(p.buffs["utamo-tempo-san"])>now)?0.7:1;
}
const STANCES={
  "utito-tempo":{voc:"knight",grupo:"knight",meleePct:25,noBlock:1,dmgReceived:1.15},
  "utamo-tempo":{voc:"knight",grupo:"knight",shieldPct:30,dmgDealt:0.85,dmgReceived:0.85},
  "utori-con":{voc:"paladin",grupo:"paladin",distPct:32,healMul:0.75},
  "utori-hur":{voc:"paladin",grupo:"paladin",defianceML:6,dodgeRanged:0.12},
  "uteta-flam":{voc:"sorcerer",grupo:"sorcelem",elemento:"fire",elemPct:4,convert:"fire"},
  "uteta-vis":{voc:"sorcerer",grupo:"sorcelem",elemento:"energy",elemCrit:4,convert:"energy"},
  "uteta-mort":{voc:"sorcerer",grupo:"sorcelem",elemento:"death",elemCritDmg:30,convert:"death"},
  "exori-kor-tempo":{voc:"sorcerer",grupo:"sorcrip",sapStr:0.10},
  "exori-moe-tempo":{voc:"sorcerer",grupo:"sorcrip",expose:8},
  "utura-sio":{voc:"druid",grupo:"druid",healSelf:0.10},
  "utito-dru":{voc:"druid",grupo:"druid",iceEarthML:10},
};
const MANTRA_SLOTS=["helmet","amulet","armor","legs","boots","ring","extra"];
const MANTRA_ELEMENTOS=["fire","ice","energy","earth"];
const MONK_BUILDERS=["exori-infir-pug","exori-pug","exori-infir-amp-pug","exori-amp-pug","exori-mas-pug","exori-med-pug","exori-gran-mas-pug","exori-gran-pug","exori-mas-amp-pug"];
const MONK_SPENDERS=["exori-infir-nia","exori-nia","exori-mas-nia","exori-gran-nia","exori-gran-mas-nia"];
const MONK_FX_CORES={
  "claw-white":{earth:"claw-green",fire:"claw-pink"},
  "whirlwind-white":{earth:"whirlwind-green",fire:"whirlwind-pink"},
  "pulse-white":{earth:"pulse-green",fire:"pulse-pink"},
  "outburst-white":{earth:"outburst-green",fire:"outburst-pink"},
  "blow-white":{earth:"blow-green",ice:"blow-blue",fire:"blow-pink"},
};
function stanceTotals(p){
  const t={meleePct:0,distPct:0,shieldPct:0,dmgDealt:1,dmgReceived:1,healMul:1,healSelf:0,
    noBlock:false,dodgeRanged:0,defianceML:0,elemPct:{},elemCrit:{},elemCritDmg:{},convert:null,
    sapStr:0,expose:0,iceEarthML:0};
  if(!p||!p.stances)return t;
  for(const id of Object.keys(p.stances)){
    if(!p.stances[id])continue;const st=STANCES[id];if(!st)continue;
    if(st.meleePct)t.meleePct+=st.meleePct;if(st.distPct)t.distPct+=st.distPct;
    if(st.shieldPct)t.shieldPct+=st.shieldPct;if(st.dmgDealt)t.dmgDealt*=st.dmgDealt;
    if(st.dmgReceived)t.dmgReceived*=st.dmgReceived;if(st.healMul)t.healMul*=st.healMul;
    if(st.healSelf)t.healSelf+=st.healSelf;if(st.noBlock)t.noBlock=true;
    if(st.dodgeRanged)t.dodgeRanged=Math.max(t.dodgeRanged,st.dodgeRanged);
    if(st.defianceML)t.defianceML=Math.max(t.defianceML,st.defianceML);
    if(st.elemPct)t.elemPct[st.elemento]=(t.elemPct[st.elemento]||0)+st.elemPct;
    if(st.elemCrit)t.elemCrit[st.elemento]=(t.elemCrit[st.elemento]||0)+st.elemCrit;
    if(st.elemCritDmg)t.elemCritDmg[st.elemento]=(t.elemCritDmg[st.elemento]||0)+st.elemCritDmg;
    if(st.convert)t.convert=st.convert;if(st.sapStr)t.sapStr=Math.max(t.sapStr,st.sapStr);
    if(st.expose)t.expose=Math.max(t.expose,st.expose);
    if(st.iceEarthML)t.iceEarthML=Math.max(t.iceEarthML,st.iceEarthML);
  }
  return t;
}
function sanitizeStances(raw,p){
  const out={},used=new Set();
  if(!raw||typeof raw!=="object")return out;
  for(const id of Object.keys(STANCES)){
    if(!raw[id])continue;const st=STANCES[id];
    if(p&&st.voc!==p.voc)continue;if(used.has(st.grupo))continue;
    used.add(st.grupo);out[id]=true;
  }
  return out;
}
function stanceConvert(p,elemento){const t=stanceTotals(p);return t&&t.convert?t.convert:elemento;}
function sorcererElementalStance(p){
  if(!p||p.voc!=="sorcerer"||!p.stances)return null;
  for(const id of ["uteta-flam","uteta-vis","uteta-mort"])if(p.stances[id])return STANCES[id]||null;
  return null;
}
function spellLooksLikeFire(s,originalElement,baseFx){
  const words=String((s&&s.words)||"").toLowerCase(),name=String((s&&s.name)||"").toLowerCase();
  return originalElement==="fire"||baseFx==="fire-area"||baseFx==="fire-attack"||
    baseFx==="hit-by-fire"||baseFx==="fire-effect"||baseFx==="fireball-effect"||baseFx==="flame-effect"||
    words.indexOf("flam")>=0||name.indexOf("fire")>=0||name.indexOf("flame")>=0||name.indexOf("hell")>=0;
}
function spellLooksLikeDeathEcho(s,baseFx){
  const words=String((s&&s.words)||"").toLowerCase(),name=String((s&&s.name)||"").toLowerCase();
  return baseFx==="death-echo-effect"||baseFx==="death-echo"||words==="exevo mort ora"||name.indexOf("death echo")>=0;
}
function stanceDamageFx(p,s,originalElement,effectiveElement,baseFx){
  const st=sorcererElementalStance(p);if(!st)return baseFx;
  const converted=effectiveElement!==originalElement;
  const fireLike=spellLooksLikeFire(s,originalElement,baseFx),deathEcho=spellLooksLikeDeathEcho(s,baseFx);
  if(deathEcho){
    if(st.elemento==="fire")return "death-echo-effect-orange";
    if(st.elemento==="energy")return "death-echo-effect-purple";
    return baseFx||"death-echo-effect";
  }
  if(fireLike){
    if(st.elemento==="death")return "fire-effect-black";
    if(st.elemento==="energy")return "fire-effect-purple";
    if(st.elemento==="fire")return baseFx||"fire-effect";
  }
  if(!converted)return baseFx;
  if(st.elemento==="death")return "fire-effect-black";
  if(st.elemento==="energy")return "purple-electricity-effect";
  if(st.elemento==="fire")return "fire-effect";
  return baseFx;
}
function stanceApplyDebuffs(p,mob,now){
  const t=stanceTotals(p);if(!t||!mob)return;now=Number(now)||0;
  if(t.sapStr)mob.sapStrUntil=now+10000;
  if(t.expose)mob.exposeUntil=now+10000;
}
function stanceMLBonus(p,s,ml){
  const t=stanceTotals(p);if(!t)return ml;
  if(t.defianceML&&p.voc==="paladin"&&s&&(s.type==="heal"||s.element==="holy"))
    ml+=Math.floor(stanceSkill(p,"dist")*t.defianceML/100);
  if(t.iceEarthML&&s&&(s.element==="ice"||s.element==="earth"))ml+=Math.floor(ml*t.iceEarthML/100);
  return ml;
}
function gearSkillBonus(p,which){
  let n=0;
  for(const slot of Object.keys(p&&p.equip||{})){
    const it=ITEMS[p.equip[slot]&&p.equip[slot].item];if(!it)continue;
    if(which==="mag"){n+=Number(it.mag||it.ml)||0;continue;}
    n+=Number(it[which])||0;
    if(which==="sword"||which==="axe"||which==="club"||which==="fist")n+=Number(it.melee)||0;
  }
  const imb=imbCombatTotals(p);
  if(which==="mag")n+=Number(imb.magic)||0;
  else n+=Number(imb[which])||0;
  n+=wheelSkillBonus(p,which);
  n+=loyaltySkillBonus(p)|0;
  return n;
}
function stanceSkill(p,which){
  let v=(Number(p&&p.skills&&p.skills[which])||10)+gearSkillBonus(p,which);
  const t=stanceTotals(p);
  if(t.meleePct&&["sword","axe","club","fist"].includes(which))v=Math.floor(v*(1+t.meleePct/100));
  if(t.distPct&&which==="dist")v=Math.floor(v*(1+t.distPct/100));
  return v;
}
function stanceHealAmount(p,amount){
  const t=stanceTotals(p);amount=Math.max(1,Math.floor(Number(amount)||0));
  if(t.healMul!==1)amount=Math.max(1,Math.floor(amount*t.healMul));
  if(t.healSelf)amount=Math.max(1,Math.floor(amount*(1+t.healSelf)));
  return amount;
}
function stanceCritExtra(auth,p,element){
  const t=stanceTotals(p),ch=t.elemCrit[element]||0,dg=t.elemCritDmg[element]||0;
  if(ch&&random(auth)<ch/100)return 50;
  if(dg&&random(auth)<0.10)return dg;
  return 0;
}
function mantraTotal(p){
  let total=0;if(!p||!p.equip)return 0;
  for(const slot of MANTRA_SLOTS){const e=p.equip[slot],it=e&&ITEMS[e.item];if(it)total+=Number(it.mantra)||0;}
  return total;
}
function monkSereno(p){return !!(p&&p.voc==="monk"&&p.forceSerene!==false);}
function mantraAbsorve(p,dano,elemento){
  if(!p||p.voc!=="monk")return dano;
  if(MANTRA_ELEMENTOS.indexOf(elemento)===-1)return dano;
  let m=mantraTotal(p);if(m<=0)return dano;
  if(monkSereno(p))m*=2;
  return Math.max(0,dano-m);
}
function elementalBond(p){
  if(!p||p.voc!=="monk")return null;
  const w=p.equip&&p.equip.weapon,it=w&&ITEMS[w.item];
  return (it&&it.bond)||null;
}
function monkSpellElement(p,s,padrao){
  const base=padrao||(s&&s.element)||"physical";
  if(!p||p.voc!=="monk"||(s&&s.type==="heal"))return base;
  return elementalBond(p)||base;
}
function monkFx(p,fx){
  if(!fx||!p||p.voc!=="monk")return fx;
  const tabela=MONK_FX_CORES[fx];if(!tabela)return fx;
  const bond=elementalBond(p);return (bond&&tabela[bond])||fx;
}
function mantraAtaqueBonus(p){
  if(!p||p.voc!=="monk")return 0;
  const estagio=Math.max(0,Math.min(3,Number(p.monkShrines)||0));if(!estagio)return 0;
  const bonus=mantraTotal(p)*estagio;return monkSereno(p)?bonus:Math.floor(bonus/2);
}
function monkSpellKind(id){
  if(MONK_BUILDERS.indexOf(id)!==-1)return "builder";
  if(MONK_SPENDERS.indexOf(id)!==-1)return "spender";
  const md=MONKSPELLDATA[id];
  if(md&&md.monk==="builder")return "builder";
  if(md&&md.monk==="spender")return "spender";
  return null;
}
function harmonyAtual(p){return Math.max(0,Math.min(5,Number(p&&p.harmony)||0));}
function harmonyBonus(p){const h=harmonyAtual(p);return h?1+(8*Math.pow(2,h-1))/100:1;}
function ganhaHarmony(p){if(!p||p.voc!=="monk")return;p.harmony=Math.min(5,harmonyAtual(p)+1);}
function gastaHarmony(p){
  if(!p||p.voc!=="monk")return 0;const tinha=harmonyAtual(p);p.harmony=0;
  if(tinha>0&&p.buffs&&p.buffs["utori-virtu"])p.harmony=1;return tinha;
}
function attackSkillName(p){
  const e=p&&p.equip&&p.equip.weapon,it=e&&ITEMS[e.item],type=itemTypeOf(it);
  if(type==="distance")return "dist";
  if(type==="magic"||type==="wand"||type==="rod")return "magic";
  if(["sword","axe","club"].includes(type))return type;
  return "fist";
}
function playerSkill(p){const which=attackSkillName(p);return which==="magic"?0:stanceSkill(p,which);}
function skillFactorOf(p,which){
  const voc=SKILL_MUL[p&&p.voc]||SKILL_MUL.none;
  if(which==="shield")return voc.shield;if(which==="dist")return voc.dist;if(which==="fist")return voc.fist;return voc.melee;
}
function skillBaseOf(which){if(which==="shield")return 100;if(which==="dist")return 30;return 50;}
function skillTriesNeeded(p,which){
  const lvl=Math.max(10,Number(p&&p.skills&&p.skills[which])||10);
  return Math.max(1,Math.floor(skillBaseOf(which)*Math.pow(skillFactorOf(p,which),lvl-10)));
}
function mlTriesNeeded(p){
  const ml=Math.max(0,Number(p&&p.ml)||0),factor=(VOC[p&&p.voc]||VOC.none).magic||3;
  return Math.max(1,Math.floor(1600*Math.pow(factor,ml)));
}
/* Canary Vocation::getReqSkillTries + stages do idle (rate multiplica tries). */
function addSkillTries(p,which,tries){
  if(!p||!which||which==="magic")return false;
  p.skills=p.skills||{};p.skillTries=p.skillTries||{};
  p.skills[which]=Math.max(10,Number(p.skills[which])||10);
  const rate=serverSkillRate(p.skills[which]);
  p.skillTries[which]=(Number(p.skillTries[which])||0)+Math.max(0,Math.floor((Number(tries)||0)*rate));
  let up=false,need=skillTriesNeeded(p,which);
  while(p.skillTries[which]>=need){p.skillTries[which]-=need;p.skills[which]++;up=true;need=skillTriesNeeded(p,which);}
  return up;
}
/* Canary Vocation::getReqMana: 1600 * manamultiplier^ml. Potions não entram. */
function addManaSpent(p,mana,auth){
  if(!p)return false;
  const gained=Math.max(0,Math.floor((Number(mana)||0)*instanceSkillMul(auth)));
  const rate=serverMagicRate(Number(p.ml)||0);
  p.manaSpent=(Number(p.manaSpent)||0)+Math.max(0,Math.floor(gained*rate));
  let up=false,need=mlTriesNeeded(p);
  while(p.manaSpent>=need){p.manaSpent-=need;p.ml=(Number(p.ml)||0)+1;up=true;need=mlTriesNeeded(p);}
  return up;
}
function progressWeaponSkill(p,auth){
  const which=attackSkillName(p);
  if(which==="magic")return false;
  return addSkillTries(p,which,Math.max(0,Math.floor(1*instanceSkillMul(auth))));
}
function progressAttack(p,auth){return progressWeaponSkill(p,auth);}
/* Weapons::getMaxWeaponDamage (Canary weapons.cpp). */
function meleeDamage(skill,attack,factor,level){
  const f=factor===undefined?1:factor,lv=level||1;
  const max=attack>0?Math.round(0.085*f*attack*skill+Math.floor(lv/5)):0;
  const min=attack>0?Math.floor(lv/5):0;
  return {min:min,max:Math.max(1,max)};
}
function distanceDamage(skill,attack,factor,level,temElemento){
  const f=factor===undefined?1:factor;
  let min=Math.floor((level||1)/5),max=Math.round(0.09*f*skill*attack+min);
  if(temElemento){max=Math.floor(max/2);min=Math.floor(min/2);}
  return {min:Math.max(0,min),max:Math.max(1,max)};
}
function playerDamage(auth,p,mob){
  const level=Number(p.level)||1,profile=playerWeaponProfile(p),it=ITEMS[p&&p.equip&&p.equip.weapon&&p.equip.weapon.item];
  const baseVoc=CanaryVocation.baseVocName(p&&p.voc);
  const idleMul=CanaryVocation.idleBaseDamageMul(p&&p.voc);
  let dmg;
  if(profile.type==="magic"){
    const lv=Math.floor(level/5),mdmg=Number(it&&(it.dmgMin!==undefined?it.dmgMin:(it.mdmg||it.magicDamage)))||10;
    const hi=Number(it&&(it.dmgMax!==undefined?it.dmgMax:(it.mdmg||it.magicDamage)))||mdmg;
    dmg=roll(auth,mdmg+lv,Math.max(mdmg,hi)+lv);
  }else if(profile.type==="distance"){
    const wslug=p.equip&&p.equip.weapon&&p.equip.weapon.item;
    const throwW=!weaponAmmoKind(it,wslug);
    const ammo=(!throwW&&p.equip&&p.equip.ammo),ammoIt=ammo&&ITEMS[ammo.item];
    let atk=(Number(it&&(it.atk!==undefined?it.atk:it.attack))||0)+(ammoIt?Number(ammoIt.atk||ammoIt.attack)||0:0);
    atk=Math.floor(atk*1.2);
    const temEl=!!(ammoIt&&ammoIt.el&&ammoIt.el!=="physical");
    const d=distanceDamage(stanceSkill(p,"dist"),atk,1,level,temEl);
    dmg=d.max<=d.min?d.min:roll(auth,d.min,d.max);
    const ammoMul=Number(ammoIt&&ammoIt.dmgMul);
    if(ammoMul>0&&ammoMul!==1)dmg=Math.max(1,Math.floor(dmg*ammoMul));
  }else{
    let fis=it?Math.floor((Number(it.atk!==undefined?it.atk:it.attack)||0)*1.2):7;
    // Knight / Elite Knight: +30% attack value (pedido do dono) antes da rolagem.
    if(baseVoc==="knight")fis=Math.floor(fis*1.3);
    const elDmg=(it&&it.el&&it.el!=="physical")?(Number(it.elDmg)||0):0;
    const d=meleeDamage(playerSkill(p),fis+elDmg,1,level);
    dmg=d.max<=d.min?d.min:roll(auth,d.min,d.max);
  }
  dmg=Math.max(1,Math.floor(dmg));
  // Idle balance: Knight / Sorcerer +15% no resultado (preview cliente alinhado).
  if(idleMul!==1)dmg=Math.max(1,Math.floor(dmg*idleMul));
  const preyDmg=preyDamageBonus(p,mob&&mob.slug);
  if(preyDmg>0)dmg=Math.floor(dmg*(1+preyDmg/100));
  return dmg;
}

/* ---------- elementos e resistências (Canary) ---------- */
const ELEMENT_KEYS=["physical","fire","energy","earth","ice","holy","death","lifedrain","manadrain","heal"];
function mobResist(mob,element){
  const r=mob.def&&mob.def.resist;
  if(!r)return 0;
  const v=Number(r[element]);
  if(!isFinite(v))return 0;
  return v; // percent: 50 = toma 50% menos; -12 = toma 12% mais
}
function applyResist(dmg,mob,element,piercePct,now){
  dmg=Math.max(0,Math.floor(Number(dmg)||0));
  if(element==="agony")return Math.max(1,dmg);
  const def=mob&&mob.def;
  if(Array.isArray(def&&def.imune)&&def.imune.indexOf(element)!==-1)return 0;
  let pc=mobResist(mob,element);
  if(element!=="physical"&&mob&&mob.exposeUntil&&mob.exposeUntil>(Number(now)||0))pc=(pc||0)-8;
  if(piercePct&&piercePct>0&&pc<0){
    const sens=-pc;let novo;
    if(sens>100)novo=sens+Math.ceil(piercePct/2);
    else{const extra=sens+piercePct;novo=extra>100?100+Math.ceil((extra-100)/2):extra;}
    pc=-Math.min(novo,2*sens);
  }
  if(!pc)return dmg;
  if(pc>=100)return 0;
  return Math.max(pc>0?0:1,Math.floor(dmg*(1-pc/100)));
}
function applyMonsterMitigation(mob,element,dmg){
  dmg=Math.max(0,Math.floor(Number(dmg)||0));
  if(dmg<=0||element==="agony")return dmg;
  const mit=Number(mob&&mob.def&&mob.def.mitigation)||0;
  if(!(mit>0))return dmg;
  return Math.max(1,Math.floor(dmg*(1-mit/100)));
}
function applyOutgoingDamage(mob,element,dmg,now){
  if(mob&&mob._playerEnt){
    let out=Math.max(0,Math.floor(Number(dmg)||0));
    const auth=mob._auth,ent=mob._playerEnt;
    if(auth&&ent&&ent.p){
      if(!canPlayerDamagePlayer(auth,mob._attacker,ent))return 0;
      if((element||"physical")==="physical")out=mitigateIncoming(auth,out,ent.p);
      const pos=entityPosition(ent,.13,.6);
      out=absorbIncomingDamage(auth,ent,ent.p,out,now||auth.clock,pos,element||"physical",null);
      auth.lastDamageSource="player-raid";
    }
    return out;
  }
  if(mob&&(mob.greedImmune||mob.qteImmune))return 0;
  // The Unwelcome: imune a death — cura 200% do dano de death que sofreria
  // (pré-resistência). Espelho do cliente (combat.js unwelcomeAbsorbDeath).
  if(mob&&mob.def&&mob.def.deathAbsorbs&&(element||"physical")==="death"&&dmg>0){
    const cap=Number(mob.def.hp||mob.maxHp)||0;
    const heal=cap>0?Math.min(dmg*2,Math.max(0,cap-mob.hp)):dmg*2;
    if(heal>0){
      mob.hp+=heal;
      const auth=mob._auth||null;
      if(auth){
        auth.events=auth.events||[];
        auth.events.push({t:"mobheal",heal,x:Number(mob.x)||.5,y:Number(mob.y)||.5,
          targetId:String(mob.id||""),screen:true,absorb:1,ts:now||auth.clock||Date.now()});
      }
    }
    return 0;
  }
  let out=applyMonsterMitigation(mob,element,applyResist(dmg,mob,element,0,now));
  if(mob&&mob.boss&&Number(mob.spiteDamageTakenMul)>0&&Number(mob.spiteDamageTakenMul)!==1)
    out=Math.max(1,Math.floor(out*Number(mob.spiteDamageTakenMul)));
  return out;
}
function itemTypeOf(it){return String((it&&(it.t||it.type))||"");}
function isMagicWeapon(it){
  const type=itemTypeOf(it);
  return type==="magic"||type==="wand"||type==="rod";
}
function wandMissileOf(it,element){
  if(it&&it.shoot){
    const k=String(it.shoot).toLowerCase().replace(/[-_]/g,"");
    return SHOOT_TO_MISSILE[k]||it.shoot;
  }
  const id=it&&it.id;
  const mapped=id!==undefined&&id!==null?(WAND_SHOOT[id]||WAND_SHOOT[String(id)]):null;
  if(mapped)return mapped;
  return ELEMENT_MISSILE[element||(it&&it.el)||"energy"]||"energy";
}
function physicalHitFx(race){return RACE_HIT_FX[race]||RACE_HIT_FX.blood;}
function basicHitFx(p,profile,tgt,el,ammoIt){
  if(ammoIt&&ammoIt.areaFx)return ammoIt.areaFx;
  if(profile&&profile.type==="magic")return ELEMENT_FX[el]||ELEMENT_FX.energy;
  const fist=!!(profile&&profile.fist)||(p&&p.voc==="monk"&&attackSkillName(p)==="fist");
  if(fist){
    if(el&&el!=="physical")return ELEMENT_FX[el]||ELEMENT_FX.physical;
    return "whirlwind-blow-white";
  }
  if(el==="physical")return physicalHitFx(tgt&&tgt.def&&tgt.def.race);
  return ELEMENT_FX[el]||ELEMENT_FX.physical;
}
const AMMO_MISSILE={
  "arrow":"arrow","simple-arrow":"arrow","flash-arrow":"flash-arrow",
  "shiver-arrow":"shiver-arrow","flaming-arrow":"flamming-arrow",
  "earth-arrow":"earth-arrow","envenomed-arrow":"poison-arrow",
  "sniper-arrow":"sniper-arrow","tarsal-arrow":"arrow",
  "diamond-arrow":"diamond-arrow","onyx-arrow":"onyx-arrow",
  "crystalline-arrow":"arrow","poison-arrow":"poison-arrow",
  "burst-arrow":"burst-arrow","shatterstorm-arrow":"arrow",
  "firestorm-arrow":"arrow","terrastorm-arrow":"arrow",
  "froststorm-arrow":"arrow","thunderstorm-arrow":"arrow",
  "bolt":"bolt","piercing-bolt":"piercing-bolt","vortex-bolt":"bolt",
  "power-bolt":"power-bolt","drill-bolt":"bolt","prismatic-bolt":"bolt",
  "infernal-bolt":"infernal-bolt","spectral-bolt":"spectral-bolt",
  "spear":"spear","royal-spear":"royal-spear","hunting-spear":"hunting-spear",
};
function ammoMissileOf(slug,fallback){
  if(slug&&AMMO_MISSILE[slug])return AMMO_MISSILE[slug];
  return fallback||slug||"arrow";
}
function playerWeaponProfile(p){
  const e=p&&p.equip&&p.equip.weapon,it=e&&ITEMS[e.item];
  const ammo=p&&p.equip&&p.equip.ammo,ammoIt=ammo&&ITEMS[ammo.item];
  const type=itemTypeOf(it);
  if(it&&isMagicWeapon(it)){
    const el=it.el&&it.el!=="physical"?it.el:"energy";
    return {element:el,type:"magic",projectile:true,missile:wandMissileOf(it,el)};
  }
  if(it&&type==="distance"){
    const throwW=!weaponAmmoKind(it,e.item);
    const shot=(!throwW&&ammoIt);
    const el=(shot&&shot.el&&shot.el!=="physical")?shot.el:((it.el&&it.el!=="physical")?it.el:"physical");
    // CONST_ANI_DIAMONDARROW etc.: map slug → missile strip (never spear/arrow fallback).
    const missile=throwW
      ?ammoMissileOf(e.item,e.item||"spear")
      :ammoMissileOf(ammo&&ammo.item,"arrow");
    return {element:el,type:"distance",projectile:true,missile};
  }
  const fist=attackSkillName(p)==="fist";
  const bond=elementalBond(p);
  if(bond)return {element:bond,type:"melee",projectile:false,missile:null,bond:true,fist:true};
  const elDmg=(it&&it.el&&it.el!=="physical")?(Number(it.elDmg)||0):0;
  const fis=Number(it&&(it.atk!==undefined?it.atk:it.attack))||7;
  const out={element:"physical",type:"melee",projectile:false,missile:null,fist:!!fist};
  if(elDmg>0){const total=fis+elDmg;out.elemento2=it.el;out.propFisica=total>0?fis/total:1;}
  return out;
}
function spellWeaponElement(p,s){
  if(!s||(s.f&&s.f.modo==="magic"))return null;
  if(s.vocs&&s.vocs.includes("paladin"))return null;
  const it=ITEMS[p&&p.equip&&p.equip.weapon&&p.equip.weapon.item];
  if(it&&it.el&&it.el!=="physical"){
    const elDmg=Number(it.elDmg)||0;
    if(elDmg){
      const fis=Number(it.atk!==undefined?it.atk:it.attack)||0,total=fis+elDmg;
      return {el:it.el,propFisica:total>0?fis/total:1};
    }
  }
  return imbElementalConvert(p);
}
function splitDualParts(raw,propFisica){
  const fis=Math.max(1,Math.round(raw*propFisica));
  return {fis,ele:Math.max(1,raw-fis)};
}

/* ---------- spells (Canary formulas) ---------- */
function spellSkillFor(p,s){
  if(s&&s.shieldSpell)return "shield";
  const e=p.equip&&p.equip.weapon,it=e&&ITEMS[e.item],type=it&&String(it.type||it.t||"");
  if(s&&s.range&&s.range>1&&p.voc==="paladin")return "dist";
  if(s&&p.voc==="monk"&&/pug|nia/.test(s.words||""))return "fist";
  return ["sword","axe","club"].includes(type)?type:"fist";
}
function spellAttackValue(p,s){
  if(s&&s.shieldSpell){const e=p.equip&&p.equip.shield,it=e&&ITEMS[e.item];if(!it||it.t==="quiver")return 1;return Math.floor((Number(it.def)||1)*1.3);}
  const w=p.equip&&p.equip.weapon;if(!w)return 7;
  const it=ITEMS[w.item];if(!it)return 7;
  if(it.t==="distance"){const a=p.equip&&p.equip.ammo,am=a&&ITEMS[a.item];return Math.max(7,((it.atk||0)+(am?(am.atk||am.attack||0):0))*1.2)||7;}
  const elDmg=(it.el&&it.el!=="physical")?(it.elDmg||0):0;
  return Math.floor(((it.atk||0)+elDmg)*1.2)||7;
}
function spellValues(auth,p,s){
  const pow=Number(s&&s.monkPow)||0;
  let min,max;
  if(pow>0){
    const skill=stanceSkill(p,spellSkillFor(p,s)),atk=spellAttackValue(p,s);
    const base=pow*(skill/100)*(atk/10)+Math.floor((Number(p.level)||1)/5);
    min=Math.floor(base-base/10);max=Math.floor(base+base/10);
  }else{
    const f=s&&s.f;
    if(!f){const base=Math.max(4,(s&&s.mana?s.mana:20)*.9);min=Math.floor(base*.7);max=Math.floor(base*1.3);}
    else{
      const level=Number(p.level)||1;let lo,hi;
      if(f.modo==="magic"){const ml=stanceMLBonus(p,s,(Number(p.ml)||0)+gearSkillBonus(p,"mag"));
        lo=(f.lvlMin||0)*level+(f.mlMin||0)*ml+(f.flatMin||0);
        hi=(f.lvlMax||0)*level+(f.mlMax||0)*ml+(f.flatMax||0);
      }else{const skill=stanceSkill(p,spellSkillFor(p,s));const atk=spellAttackValue(p,s);const sa=skill*atk;
        lo=(f.saMin||0)*sa+(f.skMin||0)*skill+(f.atMin||0)*atk+(f.lvlMin||0)*level+(f.flatMin||0);
        hi=(f.saMax||0)*sa+(f.skMax||0)*skill+(f.atMax||0)*atk+(f.lvlMax||0)*level+(f.flatMax||0);}
      lo=Math.max(0,lo);hi=Math.max(lo,hi);
      min=Math.floor(lo);max=Math.floor(hi);
    }
  }
  // Idle balance: Knight/Sorcerer +15% e Monk +25% no dano base das magias.
  if(s&&s.type==="attack"){
    const mul=CanaryVocation.idleSpellDamageMul
      ?CanaryVocation.idleSpellDamageMul(p&&p.voc)
      :CanaryVocation.idleBaseDamageMul(p&&p.voc);
    if(mul!==1){min=Math.max(0,Math.floor(min*mul));max=Math.max(1,Math.floor(max*mul));}
  }
  return{min:min,max:max};
}
function rollSpell(auth,p,s){
  const v=spellValues(auth,p,s);
  if(v.max<=v.min)return v.min;
  return v.min+roll(auth,0,v.max-v.min);
}
function spellTargets(s){if(!s.area)return 1;return Math.max(2,Math.min(6,Math.round((s.alvos||8)/3)));}
const AREA_ANCHORED_ON_TARGET=new Set(["AREA_CIRCLE1X1","AREA_CIRCLE2X2","AREA_CIRCLE3X3",
  "AREA_CIRCLE4X4","AREA_CIRCLE5X5","AREA_CIRCLE6X6","AREA_SQUARE1X1","AREA_CROSS1X1"]);
function entityGridCell(entity,auth){
  let cx=Number(entity&&entity.cx),cy=Number(entity&&entity.cy);
  const w=Number(auth&&auth.gridW)||30,h=Number(auth&&auth.gridH)||30;
  if(!Number.isFinite(cx))cx=Math.floor(finitePosition(entity&&entity.x,.5)*w);
  if(!Number.isFinite(cy))cy=Math.floor(finitePosition(entity&&entity.y,.5)*h);
  return{cx:Math.max(0,Math.min(w-1,Math.round(cx))),cy:Math.max(0,Math.min(h-1,Math.round(cy)))};
}
function spellAreaDirection(origin,target){
  /* Sempre caster→alvo. `origin.dir` antigo (spawn "n" / passo sem facing)
   * fazia waves/beams saírem sempre pro norte — coluna vertical de FX. */
  const dx=target.cx-origin.cx,dy=target.cy-origin.cy;
  if(Math.abs(dx)>Math.abs(dy))return dx>=0?"e":"w";
  if(dy!==0)return dy>0?"s":"n";
  return dx>=0?"e":"w";
}
function faceTowardCell(ent,aim,auth){
  if(!ent||!aim)return;
  const from=entityGridCell(ent,auth),to=aim.cx!=null?aim:entityGridCell(aim,auth),
    dx=to.cx-from.cx,dy=to.cy-from.cy;
  if(Math.abs(dx)>Math.abs(dy))ent.dir=dx>=0?"e":"w";
  else if(dy!==0)ent.dir=dy>0?"s":"n";
}
function spellAreaName(s){
  if(typeof(s&&s.area)==="string"&&s.area)return s.area;
  const meta=SPELL_TARGET[String(s&&s.id||"")]||{};
  return meta.areaNome||null;
}
/* Knight self-AoE: box/circulo em volta do caster (Canary isSelfTarget). */
const SPELL_AREA_FROM_CASTER=new Set([
  "exori","exori-gran","exori-mas","exori-min","exori-scu",
  "exori-mas-pug","exori-gran-mas-pug","exori-med-pug",
  "exori-infir-min","exori-mas-nia","exori-gran-mas-nia",
]);
function areaDirecionalDoCaster(name){
  return !!(name&&/(WAVE|BEAM|FLURRY|SWEEPING|SHORTWAVE|SQUAREWAVE|BALANCED_BRAWL|SPIRITUAL_OUTBURST)/i.test(name));
}
function spellAreaFromCaster(name,s){
  const id=String(s&&s.id||"");
  if(SPELL_AREA_FROM_CASTER.has(id))return true;
  if(areaDirecionalDoCaster(name))return true;
  const meta=SPELL_TARGET[id]||{};
  if(meta.self)return true;
  if(meta.needTarget||s&&s.needTarget)return false;
  if(AREA_ANCHORED_ON_TARGET.has(name))return false;
  const area=AREA_DATA[name],north=area&&area.n;
  return Array.isArray(north)&&!north.some((cell)=>Number(cell&&cell[1])>0);
}
/* Geometria oficial importada do register_spells.lua. A autoridade usa as
 * mesmas células do cliente: ondas/feixes começam 1 SQM à frente do caster
 * (centro da matriz = ancora, nunca dano) e círculos self ficam ao redor
 * dele; áreas com target são ancoradas no alvo. */
function spellAreaCells(auth,s,caster,target){
  const name=spellAreaName(s),area=name&&AREA_DATA[name];
  if(!area||!caster||!target)return[];
  const origin=entityGridCell(caster,auth),aim=entityGridCell(target,auth),
    dir=spellAreaDirection(origin,aim),
    offsets=area[dir]||area.n;if(!Array.isArray(offsets))return[];
  const fromCaster=spellAreaFromCaster(name,s),base=fromCaster?origin:aim,
    skipOrigin=fromCaster&&/(WAVE|BEAM)/i.test(name),w=Number(auth&&auth.gridW)||30,h=Number(auth&&auth.gridH)||30,
    seen=new Set(),cells=[];
  for(const offset of offsets){
    const dx=Number(offset&&offset[0])||0,dy=Number(offset&&offset[1])||0;
    if(skipOrigin&&dx===0&&dy===0)continue;
    const cx=base.cx+dx,cy=base.cy+dy,key=cx+":"+cy;
    if(skipOrigin&&cx===origin.cx&&cy===origin.cy)continue;
    if(cx<0||cy<0||cx>=w||cy>=h||seen.has(key))continue;
    seen.add(key);cells.push({cx,cy});
  }
  return cells;
}
/* Linha de grade (Bresenham) entre dois SQMs — usada só para FX da corrente
 * (CONST_ME nos tiles vazios entre saltos), sem alterar dano/alvo. */
function bresenhamCells(x0,y0,x1,y1){
  const cells=[];let x=Math.round(Number(x0)||0),y=Math.round(Number(y0)||0);
  const tx=Math.round(Number(x1)||0),ty=Math.round(Number(y1)||0);
  const dx=Math.abs(tx-x),sx=x<tx?1:-1,dy=-Math.abs(ty-y),sy=y<ty?1:-1;let err=dx+dy;
  for(;;){
    cells.push({cx:x,cy:y});
    if(x===tx&&y===ty)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x+=sx;}
    if(e2<=dx){err+=dx;y+=sy;}
  }
  return cells;
}
/* Células vazias ENTRE A e B (exclui endpoints: impacto já pinta os alvos). */
function spellChainPathCells(fromCell,toCell){
  if(!fromCell||!toCell)return[];
  const line=bresenhamCells(fromCell.cx,fromCell.cy,toCell.cx,toCell.cy);
  if(line.length<=2)return[];
  return line.slice(1,-1);
}
/* Caminho visual caster→1º alvo + cada salto A→B (hop index para stagger). */
function spellChainVisualPath(auth,caster,targets){
  const path=[],nodes=[caster].concat(targets||[]);
  for(let i=0;i<nodes.length-1;i++){
    const a=entityGridCell(nodes[i],auth),b=entityGridCell(nodes[i+1],auth);
    for(const cell of spellChainPathCells(a,b))path.push({cx:cell.cx,cy:cell.cy,hop:i});
  }
  return path;
}
/* Chain 15.25:
 *   - salto ao vizinho mais próximo (Lightning, Forked, Spiritual Outburst);
 *   - flood a partir dos adjacentes ao caster (Chained Penance): seedAdj +
 *     BFS em ≤chainDist de qualquer já incluído, com cap/maxRange.
 * Forked usa chainDist 4 SQM; flood do Penance usa 2. Com 1 alvo a lista
 * ainda contém o primário — a magia nunca "falha" por falta de cadeia. */
function spellChainTargets(auth,s,target,living,caster){
  const cap=Math.max(1,Math.floor(Number(s&&s.chain)||1));
  const maxDist=Number(s&&s.chainDist)||0;
  const flood=!!(s&&s.chainFlood);
  const seedAdj=!!(s&&s.chainSeedAdj);
  const maxRange=Number(s&&s.chainMaxRange)||0;
  const lista=[],vistos=new Set();
  const inCasterRange=(mob)=>{
    if(!maxRange||!caster)return true;
    return authorityVisualDistance(mob,caster,auth)<=maxRange;
  };
  if(flood){
    if(seedAdj&&caster){
      for(const mob of living||[]){
        if(!mob||mob.hp<=0||vistos.has(mob))continue;
        if(authorityVisualDistance(mob,caster,auth)<=1){
          lista.push(mob);vistos.add(mob);
          if(lista.length>=cap)return lista;
        }
      }
    }
    if(!lista.length&&target&&target.hp>0){
      lista.push(target);vistos.add(target);
    }
    let i=0;
    while(i<lista.length&&lista.length<cap){
      const atual=lista[i++];
      for(const mob of living||[]){
        if(!mob||mob.hp<=0||vistos.has(mob))continue;
        if(!inCasterRange(mob))continue;
        const dd=authorityVisualDistance(mob,atual,auth);
        if(maxDist&&dd>maxDist)continue;
        lista.push(mob);vistos.add(mob);
        if(lista.length>=cap)break;
      }
    }
    return lista;
  }
  let atual=target;
  if(atual&&atual.hp>0){lista.push(atual);vistos.add(atual);}
  while(lista.length<cap){
    let perto=null,menor=Infinity;
    for(const mob of living||[]){
      if(!mob||mob.hp<=0||vistos.has(mob))continue;
      const dd=authorityVisualDistance(mob,atual,auth);
      if(maxDist&&dd>maxDist)continue;
      if(dd<menor){menor=dd;perto=mob;}
    }
    if(!perto)break;
    lista.push(perto);vistos.add(perto);atual=perto;
  }
  return lista;
}
function spellAreaTargets(auth,s,caster,target,living){
  const cells=spellAreaCells(auth,s,caster,target);
  if(!cells.length){
    const md=s&&MONKSPELLDATA[s.id];
    if(md&&md.chain){
      const ch=md.chain;
      return spellChainTargets(auth,{
        chain:ch.alvos,chainDist:ch.dist,
        chainFlood:ch.flood?1:0,chainSeedAdj:ch.seedAdj?1:0,
        chainMaxRange:ch.maxRange||0
      },target,living,caster);
    }
    if(Number(s&&s.chain)>1)return spellChainTargets(auth,s,target,living,caster);
    const count=spellTargets(s);
    return [target].concat((living||[]).filter((mob)=>mob!==target&&mob.hp>0)
      .sort((a,b)=>authorityVisualDistance(a,target,auth)-authorityVisualDistance(b,target,auth))
      .slice(0,count-1));
  }
  const covered=new Set(cells.map((cell)=>cell.cx+":"+cell.cy)),inside=(living||[]).filter((mob)=>{
    if(!mob||mob.hp<=0)return false;const cell=entityGridCell(mob,auth);return covered.has(cell.cx+":"+cell.cy);
  });
  const meta=SPELL_TARGET[String(s&&s.id||"")]||{},name=typeof(s&&s.area)==="string"?s.area:meta.areaNome;
  if(meta.self||spellAreaFromCaster(name,s))return inside;
  return inside.includes(target)?inside:[target].concat(inside);
}
function spellReach(s){if(s.range&&s.range>0)return s.range;if(s.area)return 4;return 1;}
const KNIGHT_EXORI=new Set(["exori","exori-gran","exori-min","exori-mas",
  "exori-hur","exori-ico","exori-gran-ico","exori-con","exori-gran-con","exori-amp-kor"]);
function knightSpellFx(s,fx){
  if(!s||!KNIGHT_EXORI.has(s.id))return fx||null;
  if(fx&&fx!=="draw-blood")return fx;
  return s.id==="exori-mas"?"groundshaker":"hit-area";
}
function spellVisual(s){const words=String(s&&s.words||"").toLowerCase(),name=String(s&&s.name||"").toLowerCase(),
  imported=SPELL_FX.words&&SPELL_FX.words[words]||SPELL_FX.names&&SPELL_FX.names[name]||{};
  return{fx:knightSpellFx(s,s&&s.fx||imported.fx||null),missile:s&&s.missile||imported.miss||null};}
function spellAreaAnchor(auth,s,caster,target,cells){
  const meta=SPELL_TARGET[String(s&&s.id||"")]||{},name=typeof(s&&s.area)==="string"?s.area:meta.areaNome;
  const fromCaster=!!(meta.self||spellAreaFromCaster(name,s));
  const origin=fromCaster?caster:target;
  return {fromCaster,base:entityGridCell(origin,auth),cells:cells||[]};
}

/* Lista de spells de ataque habilitadas pelo jogador no Helper/barra de
 * combo, com compatibilidade para attackSpells/shooter/config.spells antigos.
 * Sem seleção explícita do Helper: lista vazia (não injeta spell padrão). */
function playerSpellList(p){
  const config=p.config||{},legacy=config.spells||{},voc=p.voc,out=[],ids=[];
  if(config.spellAttack===false)return out;
  // Mesma configuração usada pelo Helper/barra de combo do browser. O mapa
  // `config.spells` é mantido apenas para saves antigos com magias marcadas.
  for(const slot of Array.isArray(config.combo)?config.combo:[])if(slot&&slot.kind==="spell"&&slot.id)ids.push(slot.id);
  for(const id of Array.isArray(config.attackSpells)?config.attackSpells:[])ids.push(id);
  if(config.shooterType==="spell"&&config.shooterSpell)ids.push(config.shooterSpell);
  for(const id of Object.keys(legacy))if(legacy[id])ids.push(id);
  for(const id of [...new Set(ids)]){
    const s=ALL_SPELLS[id];if(!s)continue;
    if(s.type!=="attack"&&!s.aggr)continue;
    if(!spellAllowedForVoc(s,voc))continue;
    if(Number(s.lvl||0)>Number(p.level||1))continue;
    if(Number(s.mana||0)>Number(p.mp||0))continue;
    out.push(s);
  }
  return out;
}
const IMB_LEECH={Vampirism:[0,5,10,25],Void:[0,3,5,8]};
const IMB_ELEM={Scorch:{el:"fire",tiers:[0,10,25,50]},Venom:{el:"earth",tiers:[0,10,25,50]},
  Frost:{el:"ice",tiers:[0,10,25,50]},Electrify:{el:"energy",tiers:[0,10,25,50]},Reap:{el:"death",tiers:[0,10,25,50]}};
const IMB_PROT={"Lich Shroud":{el:"death",tiers:[0,2,5,10]},"Snake Skin":{el:"earth",tiers:[0,3,8,15]},
  "Dragon Hide":{el:"fire",tiers:[0,3,8,15]},"Quara Scale":{el:"ice",tiers:[0,3,8,15]},
  "Cloud Fabric":{el:"energy",tiers:[0,3,8,15]},"Demon Presence":{el:"holy",tiers:[0,3,8,15]}};
const IMB_CAT={Vampirism:1,Void:2,Scorch:0,Venom:0,Frost:0,Electrify:0,Reap:0,
  "Lich Shroud":4,"Snake Skin":5,"Dragon Hide":6,"Quara Scale":7,"Cloud Fabric":8,"Demon Presence":9};
const IMB_SKILL_CAT={axe:11,sword:12,club:13,distance:15,fist:18};
const IMB_PROT_CAT_EL={4:"death",5:"earth",6:"fire",7:"ice",8:"energy",9:"holy"};
const IMB_STRIKE_MAGIC={
  "falcon-wand":1,"falcon-rod":1,"wand-of-destruction":1,"rod-of-destruction":1,
  "cobra-wand":1,"cobra-rod":1,"lion-wand":1,"lion-rod":1,"naga-wand":1,"naga-rod":1,
  "jungle-wand":1,"jungle-rod":1,"soulhexer":1,"soultainter":1,"eldritch-wand":1,"eldritch-rod":1,
  "gilded-eldritch-wand":1,"gilded-eldritch-rod":1,"amber-wand":1,"amber-rod":1,
  "sanguine-coil":1,"sanguine-rod":1,"grand-sanguine-coil":1,"grand-sanguine-rod":1};
function imbKeyBase(key){return String(key||"").split("|")[0].split(" (")[0];}
function imbAllowedCats(slot,itemSlug){
  const it=ITEMS[itemSlug]||{};
  const t=it.t||it.type||"";
  let cats=[];
  if(slot==="weapon"){
    if(t==="distance")cats=it.th?[0,1,2,3,15]:[1,2,3,15];
    else if(t==="magic"){cats=[2,16];if(IMB_STRIKE_MAGIC[itemSlug])cats.push(3);}
    else cats=[0,1,2,3,IMB_SKILL_CAT[t]||12];
  }else if(slot==="shield"){
    if(t==="spellbook")cats=[4,5,6,7,8,9,14,16];
    else if(t==="quiver")cats=[];
    else cats=[4,5,6,7,8,9,14];
  }else if(slot==="armor")cats=[1,4,5,6,7,8,9];
  else if(slot==="helmet")cats=[2,11,12,13,14,15,16,18];
  else if(slot==="boots")cats=[10,19];
  else if(slot==="backpack")cats=[17];
  const res=it.res||{};
  return cats.filter((cat)=>{
    const el=IMB_PROT_CAT_EL[cat];
    if(el&&Number(res[el])>0)return false;
    if(cat===1&&Number(it.lifeLeech)>0)return false;
    if(cat===2&&Number(it.manaLeech)>0)return false;
    if(cat===0&&(it.el||it.elDmg))return false;
    return true;
  });
}
function imbCombatKeyAllowed(p,slotKey,im){
  const slot=String(slotKey||"").replace(/^equip:/,"");
  const slug=p&&p.equip&&p.equip[slot]&&p.equip[slot].item;
  const cat=IMB_CAT[imbKeyBase(im&&im.key)];
  if(cat===undefined)return true;
  return imbAllowedCats(slot,slug).indexOf(cat)>=0;
}
function runeUsable(p,id,now){
  const rd=RUNEDATA[id];if(!rd)return false;
  const tipo=rd.tipo||(RUNES[id]&&RUNES[id].tipo);
  if(tipo!=="attack"&&tipo!=="ataque")return false;
  if(Number(rd.lvl||0)>Number(p.level||1))return false;
  if(rd.ml&&Number(p.ml||0)<Number(rd.ml))return false;
  if((Number(p._runeCd)||0)>now)return false;
  if((Number(p._offensiveCd)||0)>now)return false;
  p._groupCd=p._groupCd||{};
  const group=String(rd.grupo||rd.group||"1");
  if((p._groupCd[group]||p._groupCd["1"]||0)>now)return false;
  p.supplies=p.supplies||{};p.lootPouch=p.lootPouch||{};
  if((Number(p.supplies[id])||0)>0||(Number(p.lootPouch[id])||0)>0)return true;
  return supplySelected(p,id)&&(Number(p.gold)||0)>=supplyPriceOf(id);
}
function spellIsMultiHit(s){
  if(!s)return false;
  if(spellAreaName(s))return true;
  if(Number(s.chain)>1)return true;
  if(Number(s.alvos)>1&&s.area)return true;
  const md=MONKSPELLDATA[s.id];
  if(md&&(md.area||md.chain))return true;
  return false;
}
function runeIsMultiHit(id){
  const rd=RUNEDATA[id];
  return !!(rd&&(rd.areaNome||(rd.area&&(rd.area.raio||rd.area.sqm>1))));
}
function nextComboSpell(auth,item,p,now,primary,living){
  const config=p.config||{};
  const combo=Array.isArray(config.combo)?config.combo:[];
  const usable=(s)=>{
    if(!s)return false;
    if(s.type!=="attack"&&!s.aggr)return false;
    if(s.stance)return false;
    if(!spellAllowedForVoc(s,p.voc))return false;
    if(Number(s.lvl||0)>Number(p.level||1))return false;
    if(s.ml&&Number(p.ml||0)<Number(s.ml))return false;
    if(Number(s.mana||0)>Number(p.mp||0))return false;
    if(s.needWeapon&&!(p.equip&&p.equip.weapon))return false;
    if(s.shieldSpell){
      const sh=p.equip&&p.equip.shield,it=sh&&ITEMS[sh.item];
      if(!it||it.t==="quiver")return false;
    }
    if((Number(p._offensiveCd)||0)>(now||0))return false;
    if((p._spellCd&&p._spellCd[s.id])>(now||0))return false;
    if(s.grupos){p._groupCd=p._groupCd||{};
      for(const g of Object.keys(s.grupos))if((p._groupCd[g]||0)>(now||0))return false;}
    return true;
  };
  const livingList=(living||[]).filter((m)=>m&&m.hp>0);
  const livingN=livingList.length;
  const multi=livingN>1;
  const opp=packOpportunity(auth,item,livingList);
  const preferPack=multi&&opp.density>=2;
  const hitsForSpell=(s)=>{
    if(!s||!primary)return 0;
    if(spellIsMultiHit(s)||s.area||Number(s.chain)>1)
      return spellAreaTargets(auth,s,item,primary,livingList).length;
    return primary&&primary.hp>0?1:0;
  };
  const hitsForRune=(id)=>{
    if(!primary||!runeIsMultiHit(id))return primary&&primary.hp>0?1:0;
    const rd=RUNEDATA[id];if(!rd)return 0;
    const fake={id,area:rd.areaNome,needTarget:!!rd.needTarget};
    const cells=rd.areaNome?spellAreaCells(auth,fake,item,primary):[];
    if(!cells.length)return 1;
    return spellAreaTargets(auth,fake,item,primary,livingList).length;
  };
  /* Combo: ordem dos slots = prioridade absoluta. Single-target (#1 gran
   * con / exori con / SD / strikes) NÃO é silenciado por pack denso — quem
   * quer AoE no pack coloca a área primeiro com min>=2. Preferência de pack
   * só evita AoE com min=1 quando a matriz atual pega <2 (deixa andar).
   * min>1 em spell single-target NÃO a transforma em AoE (senão hits=1
   * nunca satisfaz need=2 e a magia some da rotação). */
  if(combo.some((slot)=>slot&&slot.id)){
    const spellInRange=(s)=>{
      if(!s||!primary)return false;
      const meta=SPELL_TARGET[String(s.id||"")]||{};
      const areaName=spellAreaName(s);
      const fromCaster=!!(meta.self||(areaName&&spellAreaFromCaster(areaName,s)));
      if(fromCaster)return true; // self-AoE: hitsForSpell decide
      if(!(s.needTarget||meta.needTarget||(Number(s.range)>1&&!areaName)))return true;
      const reach=Math.max(1,spellReach(s));
      return chebyshevCells(entityGridCell(item,auth),entityGridCell(primary,auth))<=reach;
    };
    const spellFits=(slot)=>{
      if(!slot||!slot.id||slot.kind==="rune")return false;
      if(slot.kind&&slot.kind!=="spell")return false;
      if(config.spellAttack===false)return false;
      const s=ALL_SPELLS[slot.id];if(!usable(s))return false;
      if(!spellInRange(s))return false;
      const isMulti=spellIsMultiHit(s);
      const hits=hitsForSpell(s);
      const need=Math.max(1,Number(slot.min)||1);
      if(!isMulti){
        if(need>1&&livingN<need)return false;
        return s;
      }
      // Self-AoE (mas san / UE): 0 monstro na matriz = não castar.
      if(hits<need)return false;
      if(preferPack&&need<=1&&hits<2)return false;
      return s;
    };
    const runeFits=(slot)=>{
      if(!slot||slot.kind!=="rune"||!slot.id)return false;
      if(!runeUsable(p,slot.id,now))return false;
      const isMulti=runeIsMultiHit(slot.id);
      const hits=hitsForRune(slot.id);
      const need=Math.max(1,Number(slot.min)||1);
      if(!isMulti){
        if(need>1&&livingN<need)return false;
        return true;
      }
      if(hits<need)return false;
      if(preferPack&&need<=1&&hits<2)return false;
      return true;
    };
    const spellReady=combo.some((slot)=>!!spellFits(slot));
    for(const slot of combo){
      if(!slot||!slot.id)continue;
      if(slot.kind==="rune"){
        if(spellReady)continue;
        if(runeFits(slot))return {rune:true,id:slot.id};
        continue;
      }
      const s=spellFits(slot);if(s)return s;
    }
    return null;
  }
  if(config.spellAttack===false)return null;
  const list=playerSpellList(p).filter(usable);
  if(!list.length)return null;
  let best=null,bestScore=-1;
  for(const s of list){
    const sv=spellValues(auth,p,s),avg=(sv.min+sv.max)/2;
    const rawHits=hitsForSpell(s);
    const isMulti=spellIsMultiHit(s);
    // Não forçar hits>=1: caldera vazia tem score 0 e sai da disputa.
    if(isMulti&&rawHits<1)continue;
    if(preferPack&&!isMulti)continue;
    if(preferPack&&isMulti&&rawHits<2)continue;
    const hits=Math.max(1,rawHits);
    const score=preferPack?(hits*1000+avg):(avg);
    if(score>bestScore){best=s;bestScore=score;}
  }
  if(best)return best;
  // Sem AoE útil: cai no single-target de maior DPS (último mob / mana).
  let fallback=null,bestDmg=-1;
  for(const s of list){
    if(spellIsMultiHit(s)&&hitsForSpell(s)<1)continue;
    const sv=spellValues(auth,p,s),avg=(sv.min+sv.max)/2;
    if(avg>bestDmg){fallback=s;bestDmg=avg;}
  }
  return fallback;
}
function imbCombatTotals(p){
  const t={life:0,mana:0,elemental:0,elementalType:null,prot:{},crit:0,critChance:0,
    axe:0,sword:0,club:0,dist:0,fist:0,magic:0,speed:0};
  const groups=p&&typeof p.imbuements==="object"&&!Array.isArray(p.imbuements)?p.imbuements:{};
  for(const slot of Object.keys(groups)){
    for(const im of Array.isArray(groups[slot])?groups[slot]:[]){
      if(!im||!im.key)continue;
      if(!imbCombatKeyAllowed(p,slot,im))continue;
      const base=imbKeyBase(im.key),tier=Math.max(0,Math.min(3,Number(im.tier)||0));
      const fromBonus=Number(im.bonus);
      if(base==="Vampirism"||IMB_LEECH[im.key]){
        t.life+=Number.isFinite(fromBonus)&&fromBonus>0?fromBonus/100:(IMB_LEECH[base]||IMB_LEECH[im.key]||[0])[tier]||0;
      }else if(base==="Void"||im.key==="Void"){
        t.mana+=Number.isFinite(fromBonus)&&fromBonus>0?fromBonus/100:(IMB_LEECH.Void[tier]||0);
      }
      const elem=IMB_ELEM[base];
      if(elem){t.elemental+=elem.tiers[tier]||0;t.elementalType=elem.el;}
      const prot=IMB_PROT[base]||IMB_PROT[im.key];
      if(prot)t.prot[prot.el]=(t.prot[prot.el]||0)+(prot.tiers[tier]||0);
      const sk=IMB_SKILL_FX[base];
      if(sk){
        if(sk.crit)t.crit+=sk.crit[tier]||0;
        if(sk.critChance)t.critChance=Math.max(t.critChance,sk.critChance[tier]||0);
        for(const k of ["axe","sword","club","dist","fist","magic","speed"])
          if(sk[k])t[k]+=(sk[k][tier]||0);
      }
    }
  }
  for(const slot of Object.keys(p&&p.equip||{})){
    const it=ITEMS[p.equip[slot]&&p.equip[slot].item];
    if(it){t.life+=Number(it.lifeLeech)||0;t.mana+=Number(it.manaLeech)||0;}
  }
  return t;
}
function charmRaceOf(p,id){
  return p&&p.charmRace&&typeof p.charmRace==="object"?p.charmRace[id]||null:null;
}
function charmUnlocked(p,id){if(!p)return false;ensurePlayerCharms(p);const cid=resolveCharmId(id);return !!(cid&&p.charms[cid]);}
function charmTotals(p,slug){
  const t={dano:{},reflete:0,esquiva:0,vampirismo:0,manaLeech:0,critChance:0,critExtra:0,gut:0};
  if(!p||!p.charms||typeof p.charms!=="object")return t;
  p.charmRace=p.charmRace&&typeof p.charmRace==="object"?p.charmRace:{};
  for(const id of Object.keys(p.charms)){
    if(!p.charms[id])continue;const c=CHARMS[id];if(!c)continue;
    const race=p.charmRace[id];if(!race)continue;
    if(slug&&race!==slug)continue;
    if(id==="parry")t.reflete+=c.chance||5;
    else if(id==="dodge")t.esquiva+=c.chance||5;
    else if(id==="vampiric")t.vampirismo+=c.chance||1.6;
    else if(id==="voidcall")t.manaLeech+=c.chance||0.8;
    else if(id==="lowblow")t.critChance+=c.chance||4;
    else if(id==="savage")t.critExtra+=c.chance||20;
    else if(id==="gut")t.gut+=c.percent||20;
  }
  return t;
}
/* Legado: % passivo removido. Charms ofensivos viram proc em tryCharmOffensive. */
function applyCharmDamage(p,element,dmg,slug){
  return Math.max(0,Math.floor(Number(dmg)||0));
}
function tryCharmOffensive(auth,p,mob,now){
  if(!p||!mob||!mob.slug||mob.hp<=0)return 0;
  p.charmRace=p.charmRace&&typeof p.charmRace==="object"?p.charmRace:{};
  const slug=mob.slug,maxHp=Number(mob.maxHp||mob.hp||(mob.def&&mob.def.hp)||0)||0;
  const level=Number(p.level)||1;let total=0;
  for(const id of Object.keys(p.charmRace||{})){
    if(p.charmRace[id]!==slug||!charmUnlocked(p,id))continue;
    const c=CHARMS[id];if(!c||c.tipo!=="ofensivo"||!c.elemento)continue;
    if(random(auth)*100>=(c.chance||5))continue;
    let dmg;
    if(id==="overpower"){
      const max=maxStats(p).hp;
      dmg=Math.min(Math.ceil(maxHp*0.08),Math.ceil(max*(c.percent||5)/100));
    }else if(id==="overflux"){
      const max=maxStats(p).mp;
      dmg=Math.min(Math.ceil(maxHp*0.08),Math.ceil(max*(c.percent||2.5)/100));
    }else{
      dmg=Math.min(Math.ceil(level*2),Math.ceil(maxHp*(c.percent||5)/100));
    }
    if(!(dmg>0))continue;
    const dealt=applyOutgoingDamage(mob,c.elemento,dmg,now);
    if(dealt>0){mob.hp-=dealt;total+=dealt;}
    const pos=mob.x!=null?{x:mob.x,y:mob.y}:playerPosition(auth,p);
    auth.events.push({t:"charm",id:id,element:c.elemento,dmg:dealt,slug:slug,
      x:pos.x,y:pos.y,screen:true,ts:now});
  }
  return total;
}
function resolveCharmId(raw){
  if(raw==null||raw==="")return null;
  const s=String(raw).trim();if(!s)return null;
  if(CHARMS[s])return s;
  const low=s.toLowerCase();if(CHARMS[low])return low;
  return null;
}
function normalizeCharmUnlockMap(raw){
  const out={};
  if(!raw)return out;
  const put=(key)=>{if(!key)return;const id=resolveCharmId(key);if(id)out[id]=true;};
  if(Array.isArray(raw)){
    for(const item of raw){
      if(typeof item==="string")put(item);
      else if(item&&typeof item==="object")put(item.id||item.slug);
    }
    for(const key of Object.keys(raw)){if(!/^\d+$/.test(key)&&raw[key])put(key);}
    return out;
  }
  if(typeof raw!=="object")return out;
  for(const key of Object.keys(raw)){if(raw[key])put(key);}
  return out;
}
function normalizeCharmRaceMap(raw){
  const out={};
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return out;
  for(const key of Object.keys(raw)){
    const slug=raw[key];if(!slug||typeof slug!=="string")continue;
    const id=resolveCharmId(key);if(id)out[id]=slug;
  }
  return out;
}
function ensurePlayerCharms(p){
  if(!p||typeof p!=="object")return p;
  p.charms=normalizeCharmUnlockMap(p.charms);
  p.charmRace=normalizeCharmRaceMap(p.charmRace);
  p.charmPoints=Math.max(0,Number(p.charmPoints)||0);
  return p;
}
function buyCharm(p,id){
  ensurePlayerCharms(p);
  const cid=resolveCharmId(id);const c=cid&&CHARMS[cid];
  if(!c)return{ok:false,erro:"Charm desconhecido."};
  if(p.charms[cid])return{ok:false,erro:"Você já tem esse charm."};
  if(p.charmPoints<(c.custo||0))return{ok:false,erro:"Charm points insuficientes."};
  p.charmPoints-=c.custo||0;p.charms[cid]=true;return{ok:true,id:cid};
}
function assignCharm(p,id,slug){
  ensurePlayerCharms(p);
  const cid=resolveCharmId(id);const c=cid&&CHARMS[cid];
  if(!c)return{ok:false,erro:"Charm desconhecido."};
  if(!p.charms[cid])return{ok:false,erro:"Desbloqueie o charm primeiro."};
  if(!slug||!monsterDef(slug))return{ok:false,erro:"Criatura inválida."};
  for(const other of Object.keys(p.charmRace)){
    if(p.charmRace[other]===slug&&other!==cid)return{ok:false,erro:"Essa criatura já tem outra runa."};
  }
  p.charmRace[cid]=slug;return{ok:true,id:cid};
}
function clearCharm(p,id){
  ensurePlayerCharms(p);
  const cid=resolveCharmId(id);
  if(!cid||!p.charmRace[cid])return{ok:false,erro:"Charm sem assign."};
  delete p.charmRace[cid];return{ok:true,id:cid};
}
function wheelSkillBonus(p,which){
  if(!p||!p.wheel||!p.wheel.slots)return 0;
  const voc=p.voc||"knight",target=WHEEL_SKILL_VOC[voc];if(!target)return 0;
  let bonus=0;
  for(const id of Object.keys(WHEEL_SLOTS)){
    const spec=WHEEL_SLOTS[id];if(!spec||!spec.skill)continue;
    if((p.wheel.slots[id]||0)<(spec.max||0))continue;
    if(target==="melee"&&["sword","axe","club","fist"].includes(which))bonus++;
    else if(target==="distance"&&which==="dist")bonus++;
    else if(target==="fist"&&which==="fist")bonus++;
    else if(target==="magic"&&which==="mag")bonus++;
  }
  return bonus;
}
function wheelApplySpellBoost(p,spellId){
  if(WHEEL_FN&&typeof WHEEL_FN.wheelApplySpellBoost==="function")return WHEEL_FN.wheelApplySpellBoost(p,spellId);
  const out={damagePct:0,healPct:0,cooldownMs:0,manaPct:0,lifeLeech:0,manaLeech:0,critChance:0,critDamage:0};
  if(!p||!p.wheel||!p.wheel.slots||!spellId)return out;
  const voc=p.voc||"knight";
  let baseId=spellId;
  if(voc==="sorcerer"&&WHEEL_FOCUS_SPELLS.indexOf(spellId)!==-1)baseId="__focus__";
  const list=WHEEL_SPELL_UPGRADES[voc];if(!Array.isArray(list))return out;
  const u=list.find((row)=>row&&row.name===baseId);if(!u)return out;
  let grade=0;
  for(const id of Object.keys(WHEEL_SLOTS)){
    const spec=WHEEL_SLOTS[id];
    if(!spec||!spec.spell||spec.spell[voc]!==baseId)continue;
    if((p.wheel.slots[id]||0)>=(spec.max||0))grade++;
  }
  const bonus={};
  const merge=(src)=>{if(!src)return;for(const k of Object.keys(src))bonus[k]=(bonus[k]||0)+src[k];};
  if(grade>=1)merge(u.g1);if(grade>=2)merge(u.g2);
  out.damagePct=bonus.damage||0;out.healPct=bonus.heal||0;
  out.cooldownMs=(bonus.cooldown||0)*1000;out.manaPct=bonus.manaCost||0;
  out.lifeLeech=bonus.lifeLeech||0;out.manaLeech=bonus.manaLeech||0;
  out.critChance=bonus.criticalChance||0;out.critDamage=bonus.criticalDamage||0;
  return out;
}
function augmentSpellId(raw){
  const n=String(raw||"").toLowerCase().replace(/\s+/g,"-");
  if(ALL_SPELLS[n])return n;
  const plain=String(raw||"").toLowerCase();
  for(const id of Object.keys(ALL_SPELLS)){
    if(String(ALL_SPELLS[id].name||"").toLowerCase()===plain)return id;
  }
  return n;
}
function augmentTotals(p,spellId){
  const t={baseDmg:0,baseHeal:0,critDmg:0,critChance:0,cdReduction:0,lifeLeech:0,manaLeech:0};
  if(!p||!p.equip||!spellId)return t;
  for(const slot of Object.keys(p.equip)){
    const e=p.equip[slot],it=e&&ITEMS[e.item];
    if(!it||!Array.isArray(it.aug))continue;
    for(const a of it.aug){
      if(!a||augmentSpellId(a.s)!==spellId)continue;
      const v=Number(a.v)||0,k=String(a.k||"").toLowerCase();
      if(k==="base damage"||k==="damage"||k==="impact")t.baseDmg+=v;
      else if(k==="base healing"||k==="healing")t.baseHeal+=v;
      else if(k==="critical extra damage")t.critDmg+=v;
      else if(k==="critical hit chance"||k==="crit chance")t.critChance+=v;
      else if(k==="cooldown")t.cdReduction+=v;
      else if(k==="life leech")t.lifeLeech+=v;
      else if(k==="mana leech")t.manaLeech+=v;
    }
  }
  return t;
}
function playerCritChancePct(p){return 5+(imbCombatTotals(p).critChance||0);}
function playerCritExtraPct(p){
  let extra=10+(imbCombatTotals(p).crit||0);
  if(WHEEL_FN)extra+=Number(WHEEL_FN.wheelTotals(p).critDamage)||0;
  return extra;
}
function rollPlayerCrit(auth,p,spellId,slug){
  let chance=playerCritChancePct(p),extra=playerCritExtraPct(p);
  if(spellId){
    const aug=augmentTotals(p,spellId),wh=wheelApplySpellBoost(p,spellId);
    chance+=Number(aug.critChance)||0;chance+=Number(wh.critChance)||0;
    extra+=Number(aug.critDmg)||0;extra+=Number(wh.critDamage)||0;
  }
  const ch=charmTotals(p,slug);
  chance+=Number(ch.critChance)||0;extra+=Number(ch.critExtra)||0;
  if(chance<=0||random(auth)*100>=chance)return {crit:false,extraPct:0};
  return {crit:true,extraPct:extra};
}
function scalePlayerDamage(p,mob,element,dmg,now){
  dmg=applyCharmDamage(p,element,Math.max(0,Math.floor(Number(dmg)||0)));
  if(mob&&(mob.boss||(mob.def&&mob.def.boss)))dmg=Math.max(1,Math.floor(dmg*bosstiaryDamageBonus(p)));
  const swf=swiftFootMul(p,now);if(swf!==1)dmg=Math.max(1,Math.floor(dmg*swf));
  if(WHEEL_FN)dmg=Math.max(1,Math.floor(dmg*WHEEL_FN.wheelDamageMul(p)));
  return dmg;
}
function boostHealAmount(auth,p,s,amount){
  amount=Math.max(1,Math.floor(Number(amount)||0));
  const aug=augmentTotals(p,s&&s.id);
  if(aug.baseHeal)amount=Math.max(1,Math.floor(amount*(1+aug.baseHeal/100)));
  const wh=wheelApplySpellBoost(p,s&&s.id);
  if(wh.healPct)amount=Math.max(1,Math.floor(amount*(1+wh.healPct/100)));
  if(WHEEL_FN)amount=Math.max(1,Math.floor(amount*WHEEL_FN.wheelHealMul(p)));
  if(p&&p.voc==="druid"&&(!p.config||p.config.criticalHeal!==false)){
    const chance=10+Math.max(0,playerCritChancePct(p)-5);
    if(random(auth)*100<chance)amount=Math.max(1,Math.floor(amount*(1+playerCritExtraPct(p)/100)));
  }
  return amount;
}
function boostSpellDamage(p,s,dmg){
  dmg=Math.max(1,Math.floor(Number(dmg)||0));
  const aug=augmentTotals(p,s&&s.id);
  if(aug.baseDmg)dmg=Math.max(1,Math.floor(dmg*(1+aug.baseDmg/100)));
  const wh=wheelApplySpellBoost(p,s&&s.id);
  if(wh.damagePct)dmg=Math.max(1,Math.floor(dmg*(1+wh.damagePct/100)));
  return dmg;
}
function bosstiaryCategory(slug){
  const m=monsterDef(slug);if(!m)return "bane";
  const hp=Number(m.hp)||0;if(hp>=150000)return "nemesis";if(hp>=30000)return "archfoe";return "bane";
}
function bosstiaryLevel(p){return Math.floor(Math.sqrt((Number(p&&p.bossPoints)||0)/25));}
function bosstiaryDamageBonus(p){return 1+Math.min(0.25,bosstiaryLevel(p)*0.01);}
function bestiaryKill(p,slug,n){
  if(!p||!slug)return 0;
  p.bestiary=p.bestiary&&typeof p.bestiary==="object"?p.bestiary:{};
  p.charmsPagos=p.charmsPagos&&typeof p.charmsPagos==="object"?p.charmsPagos:{};
  p.charmPoints=Number(p.charmPoints)||0;
  const kills=Math.floor((n||1)*SERVER_BESTIARY_RATE);
  const antes=Number(p.bestiary[slug])||0,depois=antes+kills;
  p.bestiary[slug]=depois;
  const def=monsterDef(slug),b=def&&def.best,total=Number(b&&b.toKill)||250;
  const u1=Math.max(1,Math.min(Number(b&&b.u1)||Math.ceil(total/10),total));
  const u2=Math.max(u1,Math.min(Number(b&&b.u2)||Math.ceil(total/2),total));
  const marcos=[1,u1,u2,total],charmTotal=Number(b&&b.charm)||25;
  const pontos=[0,Math.round(charmTotal*0.2),Math.round(charmTotal*0.4),charmTotal];
  let ganhos=0;
  for(let i=0;i<marcos.length;i++){
    const chave=slug+":"+i;
    if(depois>=marcos[i]&&!p.charmsPagos[chave]){p.charmsPagos[chave]=1;ganhos+=pontos[i];}
  }
  if(ganhos)p.charmPoints+=ganhos;
  return ganhos;
}
function bosstiaryKill(p,slug,n){
  if(!p||!slug)return 0;
  const def=monsterDef(slug);if(!def||!def.boss)return 0;
  p.bosstiary=p.bosstiary&&typeof p.bosstiary==="object"?p.bosstiary:{};
  p.bossPoints=Number(p.bossPoints)||0;
  const cat=BOSS_CATS[bosstiaryCategory(slug)],antes=Number(p.bosstiary[slug])||0,depois=antes+(n||1);
  p.bosstiary[slug]=depois;
  const pagosAntes=Math.min(antes,cat.kills),pagosAgora=Math.min(depois,cat.kills);
  const ganho=(pagosAgora-pagosAntes)*cat.pts;
  if(ganho>0)p.bossPoints+=ganho;
  return ganho;
}
function imbLeechTotals(p){const t=imbCombatTotals(p);return {life:t.life,mana:t.mana};}
function imbProtectionPct(p,element){return Number(imbCombatTotals(p).prot[element])||0;}
function imbElementalConvert(p){
  const t=imbCombatTotals(p);
  if(!t.elemental||!t.elementalType)return null;
  return {el:t.elementalType,propFisica:1-Math.min(100,t.elemental)/100};
}
function applyOutgoingLeech(p,dmg,slug){
  if(!p||!(dmg>0))return;
  const leech=imbLeechTotals(p),max=maxStats(p);
  if(leech.life>0)p.hp=Math.min(max.hp,p.hp+Math.max(1,Math.floor(dmg*leech.life/100)));
  if(leech.mana>0)p.mp=Math.min(max.mp,p.mp+Math.max(1,Math.floor(dmg*leech.mana/100)));
  if(WHEEL_FN){
    const wl=WHEEL_FN.wheelLeechTotals(p);
    if(wl.lifeLeech)p.hp=Math.min(max.hp,p.hp+Math.max(1,Math.floor(dmg*wl.lifeLeech/100)));
    if(wl.manaLeech)p.mp=Math.min(max.mp,p.mp+Math.max(1,Math.floor(dmg*wl.manaLeech/100)));
  }
  const ch=charmTotals(p,slug);
  if(ch.vampirismo>0)p.hp=Math.min(max.hp,p.hp+Math.max(1,Math.floor(dmg*ch.vampirismo/100)));
  if(ch.manaLeech>0)p.mp=Math.min(max.mp,p.mp+Math.max(1,Math.floor(dmg*ch.manaLeech/100)));
}
function afterPlayerHit(auth,p,tgt,dealt,now){
  if(!(dealt>0)||!p)return;
  applyOutgoingLeech(p,dealt,tgt&&tgt.slug);
  tryCharmOffensive(auth,p,tgt,now);
}
function playerMitigationPct(p){
  const e=p.equip||{},shield=e.shield&&ITEMS[e.shield.item],weapon=e.weapon&&ITEMS[e.weapon.item];
  const temEscudo=!!(shield&&(String(shield.t||shield.type||"")==="shield"||String(shield.t||"")==="spellbook"));
  const duasMaos=!!(weapon&&(weapon.th||weapon.twoHanded));
  let defEquip=0;
  if(temEscudo)defEquip=Number(shield.def||shield.defense)||0;
  else if(weapon)defEquip=(Number(weapon.def||weapon.defense)||0)*(duasMaos?0.6:1);
  const st=stanceTotals(p);
  if(st.noBlock)return Math.min(50,Math.max(0,defEquip*0.2));
  let sh=st.noBlock?0:stanceSkill(p,"shield");
  if(st.shieldPct)sh=Math.floor(sh*(1+st.shieldPct/100));
  let wheelMit=0;
  if(WHEEL_FN){
    const wt=WHEEL_FN.wheelTotals(p);
    wheelMit=(Number(wt.mitigation)||0)*100+(Number(wt.gemMitigation)||0);
  }
  return Math.min(50,Math.max(0,sh*0.04+defEquip*0.2+wheelMit));
}
function applyPlayerMitigation(p,element,dmg){
  dmg=Math.max(0,Math.floor(Number(dmg)||0));
  if(dmg<=0||element==="agony")return dmg;
  const mit=playerMitigationPct(p);if(mit<=0)return dmg;
  return Math.max(1,Math.floor(dmg*(1-mit/100)));
}
function magicShieldCapacity(p){
  const L=Math.max(1,Number(p.level)||1),M=Math.max(0,Number(p.ml)||0);
  return Math.max(1,Math.floor(7*M+7.6*L+Math.max(300,0.4*L)));
}
const MAGIC_SHIELD_POTION_COST=50000,MAGIC_SHIELD_POTION_CD_MS=15000,MAGIC_SHIELD_POTION_LVL=14;
function accessoryVocOk(p,it){
  if(!it||!Array.isArray(it.vocs)||!it.vocs.length)return true;
  const mine=String(p&&p.voc||"").toLowerCase().replace(/[^a-z]/g,"");
  return it.vocs.some((v)=>{
    const want=String(v||"").toLowerCase().replace(/[^a-z]/g,"");
    return mine===want||mine.indexOf(want)>=0||want.indexOf(mine)>=0;
  });
}
function energyRingOn(p){
  const e=p&&p.equip&&p.equip.ring;if(!e||e.item!=="energy-ring")return false;
  return accessoryVocOk(p,ITEMS["energy-ring"]);
}
function isChargeStackableAccessory(slug){
  const it=ITEMS[slug];if(!it||!it.charges)return false;
  if(it.s!=="ring"&&it.s!=="amulet"&&it.s!=="boots")return false;
  if(it.imbSlots)return false;return true;
}
function accessoryCatalogCharges(slug){
  const it=ITEMS[slug];const n=Math.floor(Number(it&&it.charges)||0);return n>0?n:0;
}
function accessoryChargesArePartial(slug,charges){
  const full=accessoryCatalogCharges(slug);if(!full)return false;
  const n=Math.floor(Number(charges));return Number.isFinite(n)&&n>0&&n<full;
}
function accessoryChargesLedger(p){
  if(!p.ringCharges||typeof p.ringCharges!=="object")p.ringCharges={};
  return p.ringCharges;
}
function accessoryChargesOnEquip(p,slug,fromCharges){
  const it=ITEMS[slug];if(!it||!it.charges)return null;
  if(fromCharges!==undefined&&fromCharges!==null){
    return Math.min(it.charges,Math.max(0,Math.floor(Number(fromCharges)||0)));
  }
  const ledger=accessoryChargesLedger(p);
  const resto=parseInt(ledger[slug],10);
  if(resto>0){delete ledger[slug];return Math.min(resto,it.charges);}
  return it.charges;
}
function rememberAccessoryCharges(p,slug,charges){
  if(!slug)return;
  // Chargeables: não usam ledger compartilhado.
  if(isChargeStackableAccessory(slug))return;
  const ledger=accessoryChargesLedger(p);
  if(parseInt(charges,10)>0)ledger[slug]=parseInt(charges,10);else delete ledger[slug];
}
function takeInventoryCount(p,slug){
  if(!p||!slug)return false;
  p.bag=p.bag||{};p.lootPouch=p.lootPouch||{};p.supplies=p.supplies||{};p.supplyStash=p.supplyStash||{};
  const full=accessoryCatalogCharges(slug);
  const ratioOf=(ch)=>{
    if(!full)return 1;
    let n=(ch===undefined||ch===null)?full:Math.floor(Number(ch));
    if(!Number.isFinite(n)||n<0)n=0;
    return Math.min(1,n/full);
  };
  // Helper: prioriza a cópia com MENOS cargas/% restante (time e hits usam charges).
  // Empate: bag instance/stack > pouch > stash > supplies.
  const cands=[];
  if(Array.isArray(p.itemInstances)){
    for(let i=0;i<p.itemInstances.length;i++){
      const inst=p.itemInstances[i];
      if(!inst||inst.loc!=="bag"||inst.slug!==slug)continue;
      const ch=inst.charges!==undefined?Math.floor(Number(inst.charges)):full;
      if(full&&(!Number.isFinite(ch)||ch<=0))continue;
      cands.push({kind:"inst",idx:i,charges:Number.isFinite(ch)?ch:full,ratio:ratioOf(ch),locPri:0});
    }
  }
  if((Number(p.bag[slug])||0)>0)cands.push({kind:"bag",charges:full,ratio:ratioOf(full),locPri:0});
  if((Number(p.lootPouch[slug])||0)>0)cands.push({kind:"pouch",charges:full,ratio:ratioOf(full),locPri:1});
  if((Number(p.supplyStash[slug])||0)>0)cands.push({kind:"stash",charges:full,ratio:ratioOf(full),locPri:2});
  if((Number(p.supplies[slug])||0)>0)cands.push({kind:"supplies",charges:full,ratio:ratioOf(full),locPri:3});
  if(!cands.length)return false;
  cands.sort((a,b)=>a.ratio-b.ratio||(Math.floor(Number(a.charges)||0)-Math.floor(Number(b.charges)||0))||a.locPri-b.locPri||(a.idx||0)-(b.idx||0));
  const best=cands[0];
  if(best.kind==="inst"){
    const inst=p.itemInstances[best.idx];
    p.itemInstances.splice(best.idx,1);
    return{ok:true,charges:inst.charges!==undefined?inst.charges:accessoryCatalogCharges(slug)};
  }
  if(best.kind==="bag"){p.bag[slug]--;if(!p.bag[slug])delete p.bag[slug];return{ok:true,charges:accessoryCatalogCharges(slug)};}
  if(best.kind==="pouch"){p.lootPouch[slug]--;if(!p.lootPouch[slug])delete p.lootPouch[slug];return{ok:true,charges:accessoryCatalogCharges(slug)};}
  if(best.kind==="stash"){p.supplyStash[slug]--;if(!p.supplyStash[slug])delete p.supplyStash[slug];return{ok:true,charges:accessoryCatalogCharges(slug)};}
  if(best.kind==="supplies"){p.supplies[slug]--;if(!p.supplies[slug])delete p.supplies[slug];return{ok:true,charges:accessoryCatalogCharges(slug)};}
  return false;
}
function stashAccessoryToBag(p,slot){
  const e=p.equip&&p.equip[slot];if(!e||!e.item)return;
  const slug=e.item,ch=e.charges,full=accessoryCatalogCharges(slug);
  p.bag=p.bag||{};p.itemInstances=Array.isArray(p.itemInstances)?p.itemInstances:[];
  if(isChargeStackableAccessory(slug)&&accessoryChargesArePartial(slug,ch)){
    // Parcial: instância isolada — NÃO empilha, NÃO grava ledger.
    p.itemInstances.push({
      id:"srv-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1e6).toString(36),
      slug,loc:"bag",tier:0,charges:Math.floor(Number(ch)),maxCharges:full,
    });
  }else{
    // Cheio: empilha. Sem ledger compartilhado.
    p.bag[slug]=(Number(p.bag[slug])||0)+1;
  }
  if(e.instId&&Array.isArray(p.itemInstances)){
    p.itemInstances=p.itemInstances.filter((inst)=>!inst||inst.id!==e.instId);
  }
  delete p.equip[slot];
}
function accessoryEquipConfigured(p,slot,slug){
  const cur=p.equip&&p.equip[slot]&&p.equip[slot].item||"";
  if(!slug){if(cur)stashAccessoryToBag(p,slot);return true;}
  if(cur===slug)return true;
  const it=ITEMS[slug];if(!it||!accessoryVocOk(p,it))return false;
  const taken=takeInventoryCount(p,slug);if(!taken||taken.ok===false)return false;
  if(cur)stashAccessoryToBag(p,slot);
  const fromCh=taken&&taken.charges!==undefined?taken.charges:undefined;
  const charges=accessoryChargesOnEquip(p,slug,fromCh);
  p.equip=p.equip||{};p.equip[slot]={item:slug};
  if(charges!=null){p.equip[slot].charges=charges;p.equip[slot].maxCharges=it.charges||charges;}
  return true;
}
function accessoryNormalizeCharges(e,it){
  let n=Math.floor(Number(e.charges));
  if(!Number.isFinite(n))n=Math.floor(Number(it&&it.charges)||0);
  if(n<0)n=0;
  e.charges=n;return n;
}
function accessoryBreak(auth,p,slot,now){
  const e=p.equip&&p.equip[slot];if(!e||!e.item)return;
  const slug=e.item,it=ITEMS[slug],nome=(it&&it.n)||slug,instId=e.instId||null;
  // Só limpa ledger legado deste slug — NÃO apaga bag/stash/outras cópias.
  delete accessoryChargesLedger(p)[slug];
  const decay=it&&(it.decayToSlug||(typeof it.decayTo==="string"?it.decayTo:""));
  if(decay&&ITEMS[decay]){
    if(instId&&Array.isArray(p.itemInstances))
      p.itemInstances=p.itemInstances.filter((inst)=>!inst||inst.id!==instId);
    p.equip[slot]={item:decay,count:1};
  }else{
    delete p.equip[slot];
    if(instId&&Array.isArray(p.itemInstances))
      p.itemInstances=p.itemInstances.filter((inst)=>!inst||inst.id!==instId);
  }
  if(auth){const pos=playerPosition(auth,p);
    auth.events.push({t:"break",item:slug,name:nome,slot,targetId:String(p.id||""),x:pos.x,y:pos.y,screen:true,ts:now||auth.clock,decayTo:decay||""});}
  tryAccessoryHelper(auth,p,now||(auth&&auth.clock)||0);
}
function accessoryConsumeCharge(auth,p,slot,now){
  const e=p.equip&&p.equip[slot];if(!e||!e.item)return false;
  const it=ITEMS[e.item];if(!it||!it.charges)return false;
  if(e.charges===undefined)e.charges=it.charges;
  if(e.maxCharges===undefined)e.maxCharges=it.charges;
  let n=accessoryNormalizeCharges(e,it);
  n-=1;
  if(n<=0){e.charges=0;accessoryBreak(auth,p,slot,now);return true;}
  e.charges=n;return true;
}
function consumeAccessoryHitCharge(auth,p,now){
  if(!p||!p.equip)return;
  for(const slot of ["ring","amulet"]){
    const e=p.equip[slot];if(!e||!e.item)continue;
    const it=ITEMS[e.item];if(!it||it.chargeMode!=="hits"||!it.charges)continue;
    if(accessoryConsumeCharge(auth,p,slot,now))break;
  }
}
function tickAccessoryCharges(auth,p,dt,now){
  if(!p||!p.equip||!(dt>0))return;
  for(const slot of ["ring","amulet","boots"]){
    const e=p.equip[slot];if(!e||!e.item)continue;
    const it=ITEMS[e.item];if(!it||!it.charges||it.chargeMode!=="time")continue;
    if(e.charges===undefined)e.charges=it.charges;
    if(e.maxCharges===undefined)e.maxCharges=it.charges;
    let n=accessoryNormalizeCharges(e,it);
    if(n<=0){accessoryBreak(auth,p,slot,now);continue;}
    e._chargeAcc=Math.max(0,Number(e._chargeAcc)||0)+dt;
    while(n>0&&e._chargeAcc>=3000){
      e._chargeAcc-=3000;
      n-=1;
    }
    e.charges=n;
    if(n<=0||(n*3000-e._chargeAcc)<=0){
      e.charges=0;e._chargeAcc=0;accessoryBreak(auth,p,slot,now);
    }
  }
}
function tryAccessoryHelper(auth,p,now){
  if(!p)return false;
  const helper=p.config&&p.config.equipHelper;if(!helper)return false;
  const max=maxStats(p),hpPct=max.hp?(p.hp/max.hp)*100:100;
  let swapped=false;
  for(const slot of ["amulet","ring"]){
    const cfg=helper[slot];if(!cfg||cfg.enabled===false)continue;
    const below=Math.max(1,Math.min(99,Number(cfg.equipBelow)||50));
    const above=Math.max(below,Math.min(99,Number(cfg.restoreAbove)||80));
    if(hpPct<=below&&cfg.emergency)swapped=accessoryEquipConfigured(p,slot,cfg.emergency)||swapped;
    else if(hpPct>=above){
      const cur=p.equip&&p.equip[slot]&&p.equip[slot].item||"";
      if(cfg.normal||cur===cfg.emergency)swapped=accessoryEquipConfigured(p,slot,cfg.normal||"")||swapped;
    }
  }
  return swapped;
}
function magicShieldActive(p,now){
  if(energyRingOn(p))return true;
  return ((Number(p.magicShieldUntil)||0)>now)&&((Number(p.magicShieldPool)||0)>0);
}
function applyMagicShieldPool(p,now,source){
  p.magicShieldCap=magicShieldCapacity(p);p.magicShieldPool=p.magicShieldCap;p.magicShieldUntil=now+60000;
  p.magicShieldFrom=source||"spell";
}
function spellGroupBusy(p,s,now){
  if(!s||!s.grupos)return false;p._groupCd=p._groupCd||{};
  for(const g of Object.keys(s.grupos))if((p._groupCd[g]||0)>now)return true;
  return false;
}
function startSpellCooldown(p,s,now){
  if(!s)return;p._spellCd=p._spellCd||{};p._spellCd[s.id]=now+Number(s.cd||1000);
  if(s.grupos){p._groupCd=p._groupCd||{};
    for(const g of Object.keys(s.grupos))p._groupCd[g]=now+Number(s.grupos[g]||s.cd||1000);}
}
function tryMagicShieldPotion(auth,item,p,now){
  const voc=String(p.voc||"");if(!/sorcerer|druid/.test(voc))return false;
  if(Number(p.level||1)<MAGIC_SHIELD_POTION_LVL)return false;
  if((Number(p.magicShieldPotionUntil)||0)>now)return false;
  if((Number(p.gold)||0)<MAGIC_SHIELD_POTION_COST)return false;
  p.gold=Math.max(0,(Number(p.gold)||0)-MAGIC_SHIELD_POTION_COST);
  p.magicShieldPotionUntil=now+MAGIC_SHIELD_POTION_CD_MS;
  applyMagicShieldPool(p,now,"potion");
  const pos=playerPosition(auth,p);
  auth.events.push({t:"say",text:"Aaaah...",supply:true,whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
  auth.events.push({t:"magic-shield-on",cap:p.magicShieldCap,source:"Magic Shield Potion",
    targetId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
  return true;
}
function tryMagicShield(auth,item,p,now){
  const voc=String(p.voc||"");if(!/sorcerer|druid/.test(voc))return false;
  const cfg=(p.config&&p.config.magicShield)||{};
  const forceOnce=!!cfg.forceOnce;if(cfg.forceOnce)cfg.forceOnce=false;
  const mode=cfg.mode||(cfg.enabled?"hp":"off");
  if(mode==="off"&&!forceOnce)return false;
  const max=maxStats(p),hpPct=max.hp?(p.hp/max.hp)*100:100,mpPct=max.mp?(p.mp/max.mp)*100:0;
  if(!forceOnce&&mode==="hp"&&(mpPct<(Number(cfg.mpAbove)||15)||hpPct>(Number(cfg.hpBelow)||45)))return false;
  if(!forceOnce&&magicShieldActive(p,now)){
    const cap=p.magicShieldCap||magicShieldCapacity(p);
    if((p.magicShieldPool||0)>=cap*0.5)return false;
  }
  if(forceOnce)return tryMagicShieldPotion(auth,item,p,now);
  const s=ALL_SPELLS["utamo-vita"];
  if(s&&Number(p.level||1)>=Number(s.lvl||1)&&p.mp>=Number(s.mana||50)&&
     !((p._spellCd&&p._spellCd["utamo-vita"])>now)&&!spellGroupBusy(p,s,now)){
    p.mp-=Number(s.mana)||50;startSpellCooldown(p,s,now);
    applyMagicShieldPool(p,now,"spell");
    const pos=playerPosition(auth,p);
    auth.events.push({t:"say",text:s.words||"utamo vita",whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
    auth.events.push({t:"magic-shield-on",cap:p.magicShieldCap,targetId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
    return true;
  }
  if(cfg.usePotion)return tryMagicShieldPotion(auth,item,p,now);
  return false;
}
function playerResistPct(p,element){
  let total=0;
  for(const slot of Object.keys(p&&p.equip||{})){
    const it=ITEMS[p.equip[slot]&&p.equip[slot].item];
    if(it&&it.res)total+=Number(it.res[element])||0;
  }
  if(WHEEL_FN){
    const r=WHEEL_FN.wheelTotals(p).resist||{};
    total+=Number(r[element])||0;
  }
  return total;
}
function absorbMagicShield(auth,item,p,dmg,now,pos,element){
  if(element==="agony"||dmg<=0||!magicShieldActive(p,now))return dmg;
  if(energyRingOn(p)){
    const mana=Math.min(Math.max(0,Math.floor(p.mp||0)),dmg);if(mana<=0)return dmg;
    p.mp-=mana;const rest=dmg-mana;
    auth.events.push({t:"magic-shield",mana,rest,targetId:String(item.id),x:pos.x,y:pos.y,screen:true,source:"Energy Ring",ts:now});
    return rest;
  }
  const pool=Math.max(0,Math.floor(p.magicShieldPool||0));if(pool<=0)return dmg;
  const absorvido=Math.min(pool,dmg);p.magicShieldPool=pool-absorvido;const rest=dmg-absorvido;
  auth.events.push({t:"magic-shield",mana:absorvido,rest,pool:p.magicShieldPool,cap:p.magicShieldCap||0,
    targetId:String(item.id),x:pos.x,y:pos.y,screen:true,source:"Magic Shield",ts:now});
  if(p.magicShieldPool<=0)p.magicShieldUntil=0;
  return rest;
}
function absorbIncomingDamage(auth,item,p,dmg,now,pos,element,mob){
  dmg=Math.max(0,Math.floor(Number(dmg)||0));
  if(dmg<=0)return 0;
  const attackerSlug=mob&&mob.slug||null;
  const dodge=charmTotals(p,attackerSlug).esquiva+(WHEEL_FN?Number(WHEEL_FN.wheelTotals(p).dodge)||0:0);
  if(dodge>0&&random(auth)*100<dodge){
    auth.events.push({t:"miss",x:pos.x,y:pos.y,reason:"dodge",targetId:String(item.id),screen:true,fx:"poff",ts:now});
    return 0;
  }
  if(forgeTryRuse(auth,p)){
    auth.events.push({t:"miss",x:pos.x,y:pos.y,dodge:true,ruse:true,targetId:String(item.id),screen:true,ts:now});
    return 0;
  }
  const dazzle=p&&p.buffs&&Number(p.buffs["exana-amp-res"])>now?0.35:0;
  if(dazzle&&random(auth)<dazzle){
    auth.events.push({t:"miss",x:pos.x,y:pos.y,reason:"dazzle",targetId:String(item.id),screen:true,fx:"poff",ts:now});
    return 0;
  }
  if(dmg>0)consumeAccessoryHitCharge(auth,p,now);
  const st=stanceTotals(p);
  if(st.dmgReceived!==1)dmg=Math.max(0,Math.floor(dmg*st.dmgReceived));
  {
    const incMul=forgeIncomingDamageMul(p,now);
    if(incMul!==1)dmg=Math.max(0,Math.floor(dmg*incMul));
  }
  if(auth.hatred&&mob&&(mob.boss||mob.slug==="hateful-soul")){
    const n=Number(auth.hatred.counters&&auth.hatred.counters[String(item.id)])||0;
    if(n>0)dmg=Math.max(0,Math.floor(dmg*(1+n*0.10)));
  }
  if(auth.greed&&auth.greed.immune&&mob&&mob.boss)dmg=Math.max(0,Math.floor(dmg*0.7));
  {
    const taintMul=soulwarTaintDamageMultiplier(auth,p);
    if(taintMul!==1)dmg=Math.max(0,Math.floor(dmg*taintMul));
  }
  if(mob&&mob.challengedUntil&&mob.challengedUntil>now)dmg=Math.max(0,Math.floor(dmg*0.8));
  if(mob&&mob.sapStrUntil&&mob.sapStrUntil>now)dmg=Math.max(0,Math.floor(dmg*0.9));
  if(mob&&mob.weakNextUntil){
    if(mob.weakNextUntil>now)dmg=Math.max(0,Math.floor(dmg*0.5));
    delete mob.weakNextUntil;
  }
  if(element!=="agony"){
    const prot=imbProtectionPct(p,element);
    if(prot>0)dmg=Math.max(1,Math.floor(dmg*(1-prot/100)));
    const res=playerResistPct(p,element);
    if(res)dmg=Math.max(1,Math.floor(dmg*(1-res/100)));
    dmg=applyPlayerMitigation(p,element,dmg);
    const def=mob&&preyDefenseBonus(p,mob.slug);
    if(def>0){dmg=Math.max(1,Math.floor(dmg*(1-def/100)));preyDefenseTickOnHit(p,mob.slug);}
    dmg=mantraAbsorve(p,dmg,element);
  }
  return absorbMagicShield(auth,item,p,dmg,now,pos,element);
}
function ensureSupplyStats(auth){
  if(!auth)return;
  auth.stats=auth.stats||{};
  auth.stats.supplyUsed=auth.stats.supplyUsed&&typeof auth.stats.supplyUsed==="object"?auth.stats.supplyUsed:{};
  auth.stats.supplyBought=auth.stats.supplyBought&&typeof auth.stats.supplyBought==="object"?auth.stats.supplyBought:{};
  auth.stats.supplyCost=Number(auth.stats.supplyCost)||0;
}
function supplyPriceOf(slug){
  if(SUPPLY_PRICE[slug])return SUPPLY_PRICE[slug];
  const qAmmo=QUIVER_DATA.ammo&&QUIVER_DATA.ammo[slug];
  if(qAmmo&&Number(qAmmo.custo)>0)return Number(qAmmo.custo);
  const it=ITEMS[slug];
  if(it&&Number(it.shotCost)>0)return Number(it.shotCost);
  if(it&&Number(it.buy)>0)return Number(it.buy);
  const pot=POTIONS[slug];
  if(pot){
    const hp=pot.hp?(Number(pot.hp[0])+Number(pot.hp[1]))/2:0,mp=pot.mp?(Number(pot.mp[0])+Number(pot.mp[1]))/2:0;
    return Math.max(20,Math.round(hp*.4+mp*.6));
  }
  return 0;
}
function supplySelected(p,slug){
  if(!slug||!p)return false;
  const cfg=p.config||{};
  // Helper "USANDO" conta mesmo com CARGAS 0 (auto-compra no use).
  if(cfg.healSupply===slug||cfg.manaSupply===slug||cfg.shooterRune===slug)return true;
  if(p.supplies&&Object.prototype.hasOwnProperty.call(p.supplies,slug))return true;
  return Array.isArray(cfg.combo)&&cfg.combo.some((slot)=>slot&&slot.kind==="rune"&&slot.id===slug);
}
function recordSupplyUse(auth,slug,cost){
  if(!auth||!slug)return;
  ensureSupplyStats(auth);
  auth.stats.supplyUsed[slug]=(Number(auth.stats.supplyUsed[slug])||0)+1;
  if(cost>0)auth.stats.supplyCost+=cost;
}
function consumeSupply(auth,p,slug){
  if(!slug||!p)return false;
  p.supplies=p.supplies||{};p.lootPouch=p.lootPouch||{};
  const cost=supplyPriceOf(slug);
  if((p.supplies[slug]||0)<=0&&(p.lootPouch[slug]||0)<=0){
    if(!supplySelected(p,slug)||cost<=0||(Number(p.gold)||0)<cost)return false;
    p.gold=Math.max(0,(Number(p.gold)||0)-cost);
    p.supplies[slug]=1;
    if(auth){ensureSupplyStats(auth);auth.stats.supplyBought[slug]=(Number(auth.stats.supplyBought[slug])||0)+1;}
  }
  if((p.supplies[slug]||0)>0)p.supplies[slug]--;
  else if((p.lootPouch[slug]||0)>0)p.lootPouch[slug]--;
  else return false;
  recordSupplyUse(auth,slug,cost);
  return true;
}
function ammoCompatible(weaponSlug,ammoIt){return ammoCompatibleWithWeapon(ammoIt,weaponSlug);}
function consumeAmmo(auth,p){
  const shot=consumeDistanceAmmo(auth,p);
  return !!(shot&&shot.ok);
}
function runeAsSpell(slug){
  const raw=Object.assign({},RUNEDATA[slug]||{},RUNES[slug]||{});
  const tipo=raw.tipo;if(!tipo||(tipo!=="attack"&&tipo!=="heal"))return null;
  return {id:slug,name:raw.nome||slug,words:String(raw.nome||slug).toLowerCase(),_rune:true,_runeSlug:slug,
    type:tipo==="heal"?"heal":"attack",element:raw.element||"physical",area:raw.areaNome||raw.area||null,f:raw.f||null,
    cd:raw.cd||2000,needTarget:true,cond:raw.cond,lvl:raw.lvl||1,ml:raw.ml||0,range:6,alvos:raw.area?9:1,
    aggr:tipo==="attack"};
}
function runeReady(p,slug,now){
  const s=runeAsSpell(slug);if(!s||s.type!=="attack")return false;
  if(Number(s.lvl||0)>Number(p.level||1))return false;
  if(s.ml&&Number(p.ml||0)<Number(s.ml))return false;
  if((Number(p._offensiveCd)||0)>now)return false;
  if((Number(p._runeCd)||0)>now)return false;
  if((p.supplies&&p.supplies[slug]||0)>0||(p.lootPouch&&p.lootPouch[slug]||0)>0)return true;
  return supplySelected(p,slug)&&(Number(p.gold)||0)>=supplyPriceOf(slug);
}
function potionAllowed(p,slug,pot){
  if(!pot)return false;
  if((Number(pot.lvl)||1)>Number(p.level||1))return false;
  const vocs=pot.vocs;
  if(Array.isArray(vocs)&&vocs.length&&vocs.indexOf(p.voc)===-1)return false;
  return true;
}

/* ---------- Exaltation Forge (Canary / cliente forge.js) ---------- */
/* Onslaught (Fatal): chance = tabela weapon[tier] (+ Amplification das boots).
 * Sem tier / T0 → chance 0. NÃO vem de crítico base nem de chance flat.
 * Bônus no golpe: +60% (soma com crítico), igual ao cliente. */
const FORGE_PROC_CHANCES={
  armor:{1:0.50,2:1.03,3:1.62,4:2.28,5:3.00,6:3.78,7:4.62,8:5.52,9:6.48,10:7.51},
  helmet:{1:2.00,2:4.05,3:6.20,4:8.45,5:10.80,6:13.25,7:15.80,8:18.45,9:21.20,10:24.05},
  weapon:{1:0.50,2:1.05,3:1.70,4:2.45,5:3.30,6:4.25,7:5.30,8:6.45,9:7.70,10:9.05},
  legs:{1:0.13,2:0.27,3:0.44,4:0.64,5:0.86,6:1.11,7:1.38,8:1.68,9:2.00,10:2.35},
};
const FORGE_AMPLIFICATION={
  1:2.50,2:5.40,3:9.10,4:13.60,5:18.90,6:25.00,7:31.90,8:39.60,9:48.10,10:57.40,
};
const FORGE_ONSLAUGHT_BONUS_PCT=60;
function forgeFindEquippedInstance(p,slot){
  const eq=p&&p.equip&&p.equip[slot];
  if(!eq||eq.instId==null||eq.instId==="")return null;
  const want=String(eq.instId);
  const list=p.itemInstances||[];
  for(let i=0;i<list.length;i++){
    const inst=list[i];
    if(inst&&String(inst.id)===want)return inst;
  }
  return null;
}
function forgeEquippedTier(p,slot){
  /* Paridade forgeProcChanceForEquipped do cliente: só lê tier da INSTÂNCIA
   * equipada (bloqueia vazamento de p.forge[slug] legado). */
  const eq=p&&p.equip&&p.equip[slot];
  if(!eq||!eq.instId)return 0;
  const inst=forgeFindEquippedInstance(p,slot);
  return inst?Math.max(0,Number(inst.tier)||0):0;
}
function forgeBootAmplificationPct(p){
  const tier=forgeEquippedTier(p,"boots");
  return tier?(FORGE_AMPLIFICATION[tier]||0):0;
}
function forgeProcChanceForEquipped(p,slot){
  const tier=forgeEquippedTier(p,slot);
  if(!tier)return 0;
  if(slot==="boots")return FORGE_AMPLIFICATION[tier]||0;
  const base=(FORGE_PROC_CHANCES[slot]&&FORGE_PROC_CHANCES[slot][tier])||0;
  if(!base)return 0;
  return base*(1+forgeBootAmplificationPct(p)/100);
}
function forgeOnslaughtChancePct(p){
  return forgeProcChanceForEquipped(p,"weapon");
}
function forgeRollOnslaught(auth,p){
  const chance=forgeOnslaughtChancePct(p);
  if(!(chance>0))return false;
  return random(auth)*100<chance;
}
function forgeEnsureMeta(p){
  if(!p._forgeMeta||typeof p._forgeMeta!=="object")p._forgeMeta={};
  return p._forgeMeta;
}
function forgeEnsureAvatar(p){
  p._avatar=p._avatar||{active:false,started:0,duration:7000,damageTakenMul:0.85,critBonusPct:15};
  return p._avatar;
}
function forgeAvatarTick(p,now){
  const av=forgeEnsureAvatar(p);
  now=now||Date.now();
  if(av.active&&now-av.started>=av.duration)av.active=false;
}
function forgeAvatarActive(p,now){
  forgeAvatarTick(p,now||Date.now());
  return !!(p&&p._avatar&&p._avatar.active);
}
function forgeTryRuse(auth,p){
  const chance=forgeProcChanceForEquipped(p,"armor");
  if(!(chance>0))return false;
  return random(auth)*100<chance;
}
function forgeReduceMomentumCooldowns(p,amountMs,now){
  now=now||Date.now();
  const cut=(t)=>{const n=Number(t)||0;return n<=now?n:Math.max(now,n-amountMs);};
  if(p._spellCd)for(const id of Object.keys(p._spellCd))p._spellCd[id]=cut(p._spellCd[id]);
  if(p._groupCd)for(const g of Object.keys(p._groupCd))p._groupCd[g]=cut(p._groupCd[g]);
  if(p._runeCd)p._runeCd=cut(p._runeCd);
  if(p._offensiveCd)p._offensiveCd=cut(p._offensiveCd);
}
function forgeTryMomentum(auth,p,now){
  const chance=forgeProcChanceForEquipped(p,"helmet");
  if(!(chance>0))return false;
  const meta=forgeEnsureMeta(p);
  now=now||Date.now();
  if(now-(meta.lastMomentumRollAt||0)<2000)return false;
  meta.lastMomentumRollAt=now;
  if(random(auth)*100>=chance)return false;
  forgeReduceMomentumCooldowns(p,2000,now);
  return true;
}
function forgeRegisterOffensiveAction(p,now){
  forgeEnsureMeta(p).lastOffensiveActionAt=now||Date.now();
}
function forgeTryTranscendence(auth,p,now){
  const chance=forgeProcChanceForEquipped(p,"legs");
  if(!(chance>0))return false;
  now=now||Date.now();
  const meta=forgeEnsureMeta(p);
  forgeAvatarTick(p,now);
  if(forgeAvatarActive(p,now))return false;
  if(now-(meta.lastTransCheckAt||0)<2000)return false;
  if(!meta.lastOffensiveActionAt||meta.lastOffensiveActionAt<=(meta.lastTransCheckAt||0))return false;
  meta.lastTransCheckAt=now;
  if(random(auth)*100>=chance)return false;
  const av=forgeEnsureAvatar(p);
  av.active=true;av.started=now;
  return true;
}
function forgeTranscendenceDamagePct(p,now){
  return forgeAvatarActive(p,now)?(forgeEnsureAvatar(p).critBonusPct||15):0;
}
function forgeIncomingDamageMul(p,now){
  return forgeAvatarActive(p,now)?(forgeEnsureAvatar(p).damageTakenMul||0.85):1;
}
function forgeEmitBuff(auth,item,p,nome,now){
  const pos=playerPosition(auth,p);
  auth.events.push({t:"buff",nome,x:pos.x,y:pos.y,whoId:String(item&&item.id||p&&p.id||""),
    screen:true,ts:now||auth.clock});
}
function forgeNoteCombatAction(auth,item,p,now,opts){
  if(!p)return;
  now=now||Date.now();
  if(opts&&opts.offensive){
    forgeRegisterOffensiveAction(p,now);
    if(forgeTryTranscendence(auth,p,now))forgeEmitBuff(auth,item,p,"Transcendence",now);
  }
  if(forgeTryMomentum(auth,p,now))forgeEmitBuff(auth,item,p,"Momentum",now);
}
/* Canary: Momentum reduz CD (não multiplica dano). Transcendence = avatar
 * (críticos +15% extra, -15% incoming). Onslaught é Fatal por golpe. */
function forgeDamageMult(){return 1;}
function forgeGuaranteedCrit(p,now){return forgeAvatarActive(p,now);}

/* ---------- conditions (Canary CONDITION_* : 2s/tick, MS absorve DOT) ---------- */
const CONDITION_TURN_MS=2000;
const CONDITIONS={
  poison:{el:"earth",fx:"hit-by-poison",cure:"exana-pox"},
  fire:{el:"fire",fx:"hit-by-fire",cure:"exana-flam"},
  energy:{el:"energy",fx:"energy-damage",cure:"exana-vis"},
  bleed:{el:"physical",fx:"draw-blood",cure:"exana-kor"},
  cursed:{el:"death",fx:"mort-area",cure:"exana-mort"},
  freezing:{el:"ice",fx:"ice-attack",cure:null},
  agony:{el:"agony",fx:"draw-blood",cure:null},
};
function normalizeCondition(tipo){
  const t=String(tipo||"").toLowerCase();
  if(t==="curse"||t==="cursed")return "cursed";
  if(t==="bleeding"||t==="bleed")return "bleed";
  if(t==="electrified"||t==="electrify"||t==="energy")return "energy";
  if(t==="poisoned"||t==="poison")return "poison";
  if(t==="burning"||t==="fire")return "fire";
  if(t==="paralyze"||t==="paralyz"||t==="freezing")return "freezing";
  return CONDITIONS[t]?t:null;
}
function applyCondition(alvo,el,dmg,turns,auth,item){
  const tipo=normalizeCondition(el);if(!alvo||!tipo||!CONDITIONS[tipo])return null;
  if(alvo.hp!==undefined&&alvo.hp<=0)return null;
  alvo.conditions=alvo.conditions||{};
  const existing=alvo.conditions[tipo],hit=Math.max(1,Math.floor(Number(dmg)||0)),dur=Math.max(1,Math.floor(Number(turns)||0));
  if(existing){existing.turns=Math.max(existing.turns,dur);existing.dmg=Math.max(existing.dmg,hit);}
  else alvo.conditions[tipo]={dmg:hit,turns:dur,acc:0};
  if(auth&&item)auth.events.push({t:"player-condition",tipo:tipo,targetId:String(item.id||alvo.id||""),screen:true,ts:auth.clock});
  return tipo;
}
function tickEntityConditions(auth,alvo,kind,item){
  if(!alvo||!alvo.conditions||alvo.hp<=0)return;
  if(alvo.conditions.curse&&!alvo.conditions.cursed){alvo.conditions.cursed=alvo.conditions.curse;delete alvo.conditions.curse;}
  if(alvo.conditions.bleeding&&!alvo.conditions.bleed){alvo.conditions.bleed=alvo.conditions.bleeding;delete alvo.conditions.bleeding;}
  const now=auth.clock,pos=kind==="player"?playerPosition(auth,alvo):entityPosition(alvo,.5,.5);
  for(const tipo of Object.keys(alvo.conditions)){
    const def=CONDITIONS[tipo],co=alvo.conditions[tipo];
    if(!def||!co){delete alvo.conditions[tipo];continue;}
    co.acc=(Number(co.acc)||0)+Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);
    while(co.acc>=CONDITION_TURN_MS&&co.turns>0&&alvo.hp>0){
      co.acc-=CONDITION_TURN_MS;co.turns--;
      let dmg=Math.max(1,Math.floor(Number(co.dmg)||0));
      if(kind==="player"&&item&&def.el!=="agony")dmg=absorbMagicShield(auth,item,alvo,dmg,now,pos,def.el);
      if(dmg<=0)continue;
      // The Unwelcome: DoT de death também é absorvido (imune + cura 200%).
      if(kind!=="player"&&alvo&&alvo.def&&alvo.def.deathAbsorbs&&(def.el||"physical")==="death"){
        const cap=Number(alvo.def.hp||alvo.maxHp)||0;
        const heal=cap>0?Math.min(dmg*2,Math.max(0,cap-alvo.hp)):dmg*2;
        if(heal>0){
          alvo.hp+=heal;
          auth.events.push({t:"mobheal",heal,x:pos.x,y:pos.y,
            targetId:String(alvo.id),screen:true,absorb:1,ts:now});
        }
        continue;
      }
      alvo.hp=Math.max(0,alvo.hp-dmg);
      if(kind==="player"){
        auth.events.push({t:"taken",dmg,el:def.el,fx:def.fx,condition:tipo,x:pos.x,y:pos.y,
          targetId:String(item&&item.id||""),screen:true,ts:now});
      }else{
        auth.events.push({t:"hit",dmg,el:def.el,fx:def.fx,condition:tipo,x:pos.x,y:pos.y,
          targetId:String(alvo.id),mobId:String(alvo.id),screen:true,ts:now});
      }
    }
    if(co.turns<=0)delete alvo.conditions[tipo];
  }
  if(kind==="player"&&item&&alvo.hp<=0){
    authMarkPlayerDeath(auth,item,now);
    auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(item.id),
      permadead:!!item.permadead,screen:true,ts:now});
  }
}
function tickPlayerConditions(auth,p,item){
  tickEntityConditions(auth,p,"player",item||{id:p&&p.id,p});
}
function applyMonsterMeleeCondition(auth,item,p,mob){
  const def=mob&&mob.def||{};
  if(def.meleeCond&&def.meleeCond.tipo){
    const tipo=normalizeCondition(def.meleeCond.tipo);
    if(tipo){
      const dmg=def.meleeCond.dano||Math.max(1,Math.round((Number(def.damage||mob.damage)||10)*.08));
      applyCondition(p,tipo,dmg,4,auth,item);return;
    }
  }
  if(def.poison){
    applyCondition(p,"poison",def.poison.dmg||def.poison,def.poison.turns||4,auth,item);return;
  }
  const porElemento={fire:"fire",energy:"energy",ice:"freezing",death:"cursed"};
  const tipo=porElemento[def.element];
  if(!tipo)return;
  if(random(auth)>0.18)return;
  applyCondition(p,tipo,Math.max(1,Math.round((Number(def.damage||mob.damage)||10)*.08)),4,auth,item);
}
function playerArmor(p){let armor=0;for(const slot of Object.keys(p.equip||{})){const e=p.equip[slot],it=e&&ITEMS[e.item];armor+=Number(it&&(it.armor||it.arm))||0;}return armor;}
/* Import: damage = melee OR max(skills) quando o .lua não tem name="melee"
 * (nagas usam name="combat" -- basic_attack). Nesse caso o golpe extra
 * copiava a magia mais forte e somava no mesmo turno. */
function mobHasExtractedMelee(def){
  def=def||{};
  const dmg=Number(def.damage)||0;
  if(dmg<=0)return false;
  const skills=Array.isArray(def.skills)?def.skills:[];
  if(!skills.length)return true;
  let skillMax=0;
  for(const sk of skills)skillMax=Math.max(skillMax,Number(sk.max)||0);
  if(skillMax>0&&dmg===skillMax)return false;
  return true;
}
function skillUsesMeleeBlock(sk){
  if(!sk)return false;
  if((sk.el||"physical")!=="physical")return false;
  if(sk.radius||sk.length||sk.areaPattern)return false;
  const n=String(sk.n||sk.name||"");
  if(n&&n!=="combat")return false;
  return (Number(sk.max)||0)>0;
}
function inferSkillElement(sk){
  const named=String(sk&&(sk.n||sk.name)||"").toLowerCase();
  const el=sk&&sk.el||"physical";
  if(el!=="physical"||!named)return el;
  if(/death|mort/.test(named))return "death";
  if(/water|splash|ice|frost|frigo/.test(named))return "ice";
  if(/fire|flam/.test(named))return "fire";
  if(/energy|electr/.test(named))return "energy";
  if(/earth|poison|stone/.test(named))return "earth";
  if(/holy|holy/.test(named))return "holy";
  return el;
}
function playerMeleeDefense(p){
  let armor=0,defense=0,protection=0;
  const e=p&&p.equip||{};
  for(const slot of Object.keys(e)){
    const it=ITEMS[e[slot]&&e[slot].item];if(!it)continue;
    armor+=Number(it.armor||it.arm)||0;
    protection+=Number(it.prot)||0;
  }
  const shield=e.shield&&ITEMS[e.shield.item],weapon=e.weapon&&ITEMS[e.weapon.item];
  if(shield&&String(shield.t||shield.type||"")!=="quiver"){
    const mag=!!(shield.mag||shield.ml);
    defense+=Math.floor((Number(shield.def||shield.defense)||0)*(mag?1.6:1.3));
  }else if(weapon)defense+=Number(weapon.def||weapon.defense)||0;
  const st=stanceTotals(p);
  let shielding=st.noBlock?0:stanceSkill(p,"shield");
  if(st.shieldPct)shielding=Math.floor(shielding*(1+st.shieldPct/100));
  return {armor,defense,shielding,protection};
}
function mitigateIncoming(auth,raw,p){
  const def=playerMeleeDefense(p);
  const armorRed=def.armor*0.5+random(auth)*def.armor*0.5;
  const blockPower=def.defense*(1+def.shielding/100);
  let dmg=Number(raw)||0;
  dmg-=armorRed;
  if(random(auth)*100<Math.min(65,blockPower*0.6))dmg-=blockPower*(0.4+random(auth)*0.6);
  dmg=Math.max(0,dmg)*(1-Math.min(0.7,def.protection/100));
  if(p&&!stanceTotals(p).noBlock)addSkillTries(p,"shield",Math.max(0,Math.floor(1*instanceSkillMul(auth))));
  return Math.max(0,Math.floor(dmg));
}
function mobMeleeRangeSQM(mob){
  const td=Number(mob&&mob.def&&mob.def.targetDistance)||1;
  if(td>1)return Math.min(7,Math.max(td,4));
  return 1;
}
function mobDamage(auth,mob,p){return mitigateIncoming(auth,(Number(mob.damage)||1)*(.6+random(auth)*.8),p);}
/* Monster spells: geometria Canary (AreaCombat::setupArea) + interval/chance
 * iguais ao combat.js local. Sem isso o servidor spamava skill a cada melee
 * e ignorava onda/explosão/cura de defSkills. */
const SKILL_RADIUS_GRID=[
  [0,0,0,0,0,0,8,0,0,0,0,0,0],[0,0,0,0,8,8,7,8,8,0,0,0,0],[0,0,0,8,7,6,6,6,7,8,0,0,0],
  [0,0,8,7,6,5,5,5,6,7,8,0,0],[0,8,7,6,5,4,4,4,5,6,7,8,0],[0,8,6,5,4,3,2,3,4,5,6,8,0],
  [8,7,6,5,4,2,1,2,4,5,6,7,8],[0,8,6,5,4,3,2,3,4,5,6,8,0],[0,8,7,6,5,4,4,4,5,6,7,8,0],
  [0,0,8,7,6,5,5,5,6,7,8,0,0],[0,0,0,8,7,6,6,6,7,8,0,0,0],[0,0,0,0,8,8,7,8,8,0,0,0,0],
  [0,0,0,0,0,0,8,0,0,0,0,0,0],
];
function skillRadiusValue(dx,dy){const row=SKILL_RADIUS_GRID[dy+6];return row?row[dx+6]||0:0;}
function skillRadiusHas(cx0,cy0,r,px,py){
  const dx=(px|0)-(cx0|0),dy=(py|0)-(cy0|0);
  if(dx<-6||dx>6||dy<-6||dy>6)return false;
  const v=skillRadiusValue(dx,dy);return v>0&&v<=(r|0);
}
function skillRadiusCells(cx0,cy0,r){
  const out=[];r=Math.max(0,r|0);
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(dx<-6||dx>6||dy<-6||dy>6)continue;
    const v=skillRadiusValue(dx,dy);if(v>0&&v<=r)out.push({cx:(cx0|0)+dx,cy:(cy0|0)+dy});
  }
  return out;
}
function skillWaveDir(fromCell,toCell){
  const dx=(Number(toCell&&toCell.cx)||0)-(Number(fromCell&&fromCell.cx)||0),
    dy=(Number(toCell&&toCell.cy)||0)-(Number(fromCell&&fromCell.cy)||0);
  if(Math.abs(dx)>Math.abs(dy))return dx>=0?{dx:1,dy:0}:{dx:-1,dy:0};
  return dy>=0?{dx:0,dy:1}:{dx:0,dy:-1};
}
function skillWaveCells(mob,pl,len,spread,auth){
  const out=[];len=Math.max(1,len|0);spread=spread|0;
  const from=entityGridCell(mob,auth),to=entityGridCell(pl,auth),d=skillWaveDir(from,to),
    cols=spread>0?Math.floor((len-(len%spread))/spread)*2+1:1,
    centro=Math.floor(cols/2);let colSpread=cols;
  for(let y=1;y<=len;y++){
    const minOff=cols-colSpread-centro,maxOff=colSpread-1-centro;
    for(let h=minOff;h<=maxOff;h++)out.push({
      cx:from.cx+d.dx*y+(d.dy!==0?h:0),cy:from.cy+d.dy*y+(d.dx!==0?h:0)});
    if(spread>0&&y%spread===0)colSpread--;
  }
  return out;
}
function skillPatternCells(mob,pl,pattern,auth){
  const out=[],from=entityGridCell(mob,auth),to=entityGridCell(pl,auth),d=skillWaveDir(from,to);
  for(let step=0;step<(pattern||[]).length;step++)for(const side of pattern[step]||[])
    out.push({cx:from.cx+d.dx*(step+1)+(d.dy!==0?side:0),
      cy:from.cy+d.dy*(step+1)+(d.dx!==0?side:0)});
  return out;
}
function mobSkillRangeSQM(sk,mob){
  if((sk.range||0)>0)return Math.min(7,sk.range);
  if(sk.areaPattern&&sk.areaPattern.length)return sk.areaPattern.length;
  if(sk.length)return sk.length;
  if(sk.radius)return Math.max(1,sk.radius);
  // Sem range declarado: usa o alcance de ATAQUE do proprio monstro
  // (melee = 1 SQM). O "range==0 = sem limite" antigo deixava o hit melee
  // basico acertar o jogador de qualquer distancia.
  if(sk.range===undefined||sk.range===null)return mobMeleeRangeSQM(mob);
  return 1;
}
function mobSkillCells(mob,sk,victim,auth){
  if(sk.areaPattern&&sk.areaPattern.length)return skillPatternCells(mob,victim,sk.areaPattern,auth);
  if(sk.length)return skillWaveCells(mob,victim,sk.length,sk.spread||0,auth);
  if(sk.radius){
    const centro=sk.alvo&&(sk.range||1)>1?victim:mob;
    const cell=entityGridCell(centro,auth);
    return skillRadiusCells(cell.cx,cell.cy,sk.radius);
  }
  return [];
}
function mobSkillHitsTarget(mob,sk,victim,auth){
  const cells=mobSkillCells(mob,sk,victim,auth);
  if(!cells.length)return true;
  const cell=entityGridCell(victim,auth),key=cell.cx+":"+cell.cy;
  return cells.some((c)=>c.cx+":"+c.cy===key);
}
function runMobSkills(auth,mob,victim,now,stepTs,mobHitIdx){
  const def=mob.def||{},skills=Array.isArray(def.skills)?def.skills:[],defS=Array.isArray(def.defSkills)?def.defSkills:[];
  if(!skills.length&&!defS.length)return;
  mob.skillCds=mob.skillCds||{};
  const dist=authorityVisualDistance(mob,victim,auth);
  const pushFx=(sk)=>{
    const cells=mobSkillCells(mob,sk,victim,auth),el=inferSkillElement(sk),fx=sk.fx||ELEMENT_FX[el]||ELEMENT_FX.physical;
    if(cells.length>1){
      const origin=entityGridCell(mob,auth);
      auth.events.push({t:"areafx",cells,fx,screen:true,sourceId:String(mob.id),
        base:{cx:origin.cx,cy:origin.cy},ts:stepTs+mobHitIdx*200});return;}
    const noAlvo=!!sk.alvo||(Number(sk.range)||1)>1,onde=noAlvo?victim:mob;
    const pos=entityPosition(onde,noAlvo?.13:.5,noAlvo?.6:.5),src=entityPosition(mob,.5,.5);
    auth.events.push({t:"effect",x:pos.x,y:pos.y,fx,screen:true,projectile:noAlvo,sx:src.x,sy:src.y,
      missile:sk.miss||ELEMENT_MISSILE[el]||null,sourceId:String(mob.id),ts:stepTs+mobHitIdx*200});
  };
  const hitPlayer=(item,sk,raw,el)=>{
    if(!item||!item.p||item.p.hp<=0||item.downUntil)return;
    const nome=String(sk.n||sk.name||"");
    const manaDrain=/mana\s*drain|manadrain/i.test(nome)||el==="manadrain";
    const lifeDrain=/life\s*drain|lifedrain/i.test(nome)||el==="lifedrain";
    const pos=entityPosition(item,.13,.6),source=entityPosition(mob,.5,.5);
    let dmg=Math.max(0,Math.floor(raw||0));
    if(manaDrain){
      const mana=Math.min(Math.max(0,Math.floor(item.p.mp||0)),dmg);
      item.p.mp=Math.max(0,(item.p.mp||0)-mana);
      auth.events.push({t:"taken",dmg:mana,x:pos.x,y:pos.y,targetId:String(item.id),
        sx:source.x,sy:source.y,sourceId:String(mob.id),el:"manadrain",screen:true,fx:sk.fx||ELEMENT_FX.manadrain,
        projectile:!!sk.miss,missile:sk.miss||ELEMENT_MISSILE.manadrain,ts:stepTs+mobHitIdx*200});
      return;
    }
    if(el!=="agony"&&skillUsesMeleeBlock(sk))dmg=mitigateIncoming(auth,dmg,item.p);
    dmg=absorbIncomingDamage(auth,item,item.p,dmg,now,pos,el==="agony"?"agony":el,mob);
    item.p.hp-=dmg;
    if(lifeDrain&&dmg>0)mob.hp=Math.min(mob.maxHp||mob.hp,mob.hp+dmg);
    auth.events.push({t:"taken",dmg:dmg,x:pos.x,y:pos.y,targetId:String(item.id),
      sx:source.x,sy:source.y,sourceId:String(mob.id),el:el,screen:true,fx:sk.fx||ELEMENT_FX[el]||ELEMENT_FX.physical,
      projectile:!!sk.miss,missile:sk.miss||null,ts:stepTs+mobHitIdx*200});
    if(item.p.hp<=0){authMarkPlayerDeath(auth,item,now);
      auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(item.id),
        permadead:!!item.permadead,screen:true,ts:stepTs+mobHitIdx*200});}
  };
  for(let i=0;i<defS.length;i++){
    const sk=defS[i],key="d"+i;
    if((mob.skillCds[key]||0)>now)continue;
    if(random(auth)*100>=(sk.ch===undefined?15:sk.ch))continue;
    if(sk.n==="healing"){
      if(mob.maxHp&&mob.hp>=mob.maxHp)continue;
      const cura=sk.min<sk.max?roll(auth,Number(sk.min)||0,Number(sk.max)||0):Number(sk.min)||0;
      if(!cura)continue;
      mob.hp=Math.min(mob.maxHp||(mob.hp+cura),mob.hp+cura);
      mob.skillCds[key]=now+(sk.int||2000);
      const pos=entityPosition(mob,.5,.5);
      auth.events.push({t:"mobheal",heal:cura,x:pos.x,y:pos.y,targetId:String(mob.id),
        fx:sk.fx||"magic-green",screen:true,ts:stepTs+mobHitIdx*200});
    }
  }
  for(let i=0;i<skills.length;i++){
    const sk=skills[i],key="s"+i,nomeFx=sk.n||"";
    if((mob.skillCds[key]||0)>now)continue;
    if(/invisib/i.test(nomeFx))continue;
    if(/summon/i.test(nomeFx)){
      if(auth.bossId==="ferumbras-mortal-shell"&&mob.boss){
        if(dist>mobSkillRangeSQM(sk,mob))continue;
        if(random(auth)*100>=(sk.ch===undefined?15:sk.ch))continue;
        mob.skillCds[key]=now+(sk.int||2000);
        tryFerumbrasSummon(auth,mob,now,stepTs);
      }
      continue;
    }
    if(/challenge|outfit|skill reducer|cancel invisib/i.test(nomeFx))continue;
    if(!sk.cond&&!sk.campo&&!((sk.max||0)>0)){
      if(/electrif/i.test(nomeFx))sk.cond="energy";
      else if(/paralyz/i.test(nomeFx))sk.cond="freezing";
    }
    if(dist>mobSkillRangeSQM(sk,mob))continue;
    if(random(auth)*100>=(sk.ch===undefined?15:sk.ch))continue;
    mob.skillCds[key]=now+(sk.int||2000);
    // Wave/beam: sprite e geometria apontam para o alvo (não para dir travada).
    if(sk.length||(sk.areaPattern&&sk.areaPattern.length))faceTowardCell(mob,victim,auth);
    const el=inferSkillElement(sk);
    pushFx(sk);
    if(!((sk.max||0)>0)){
      const tipo=sk.campo||sk.cond;
      if(tipo&&mobSkillHitsTarget(mob,sk,victim,auth)){
        const danoC=sk.condDano||Math.max(1,Math.round((Number(mob.damage)||10)*.1));
        applyCondition(victim.p,tipo,danoC,4,auth,victim);
      }
      continue;
    }
    const raw=sk.min<sk.max?roll(auth,Number(sk.min)||0,Number(sk.max)||0):Number(sk.min)||0;
    const cells=mobSkillCells(mob,sk,victim,auth);
    const victims=cells.length?(auth.players||[]).filter((item)=>item.p&&item.p.hp>0&&!item.downUntil&&mobSkillHitsTarget(mob,sk,item,auth)):[victim];
    for(const item of victims)hitPlayer(item,sk,raw,el);
    const campo=sk.campo||sk.cond;
    if(campo&&raw>0)for(const item of victims)applyCondition(item.p,campo,Math.max(1,Math.floor(raw*.1)),4,auth,item);
  }
}
function syncPlayerProgress(p){
  if(!p)return p;
  p.level=Math.max(1,Number(p.level)||1);
  p.exp=Math.max(0,Number(p.exp)||0);
  const floor=expForLevel(p.level);
  if(p.exp<floor)p.exp=floor;
  while(p.exp>=expForLevel(p.level+1))p.level++;
  return p;
}
function addExp(p,amount){
  syncPlayerProgress(p);
  const before=p.level;
  p.exp+=Math.max(0,Math.floor(amount));
  while(p.exp>=expForLevel(p.level+1))p.level++;
  const max=maxStats(p);
  if(p.level>before){p.hp=max.hp;p.mp=max.mp;}
  else{p.hp=Math.min(max.hp,Math.max(0,Number(p.hp)||0));p.mp=Math.min(max.mp,Math.max(0,Number(p.mp)||0));}
}
function applyPvpLoss(p,source){const rate=source==="player-raid"?.08:.03,loss=Math.floor(Math.max(0,Number(p.exp)||0)*rate);p.exp=Math.max(0,(Number(p.exp)||0)-loss);return loss;}
/* Instâncias PVP do idle: +25% EXP/loot/skills, chance extra de Influenced/
 * Fiendish, e raiders reais podem ferir quem não é aliado da party. Non-PVP
 * nunca aplica dano jogador→jogador. Membros da mesma party nunca FF. */
function isPvpInstance(auth){return !!(auth&&(auth.pvp||auth.instanceMode==="pvp"));}
function instanceRewardMul(auth){return isPvpInstance(auth)?1.25:1;}
function instanceSkillMul(auth){return Number(auth&&auth.skillMul)||instanceRewardMul(auth);}
function playerPartyKey(item){
  if(!item)return "";
  if(item.raidHostile||item.hostile)return "raid:"+String(item.id);
  if(item.partyKey!==undefined&&item.partyKey!==null)return String(item.partyKey);
  return "party";
}
function playersAreAllies(a,b){
  if(!a||!b)return true;
  if(String(a.id)===String(b.id))return true;
  if(a.raidHostile||b.raidHostile||a.hostile||b.hostile)return false;
  return playerPartyKey(a)===playerPartyKey(b);
}
function canPlayerDamagePlayer(auth,attacker,victim){
  if(!auth||!attacker||!victim||!victim.p)return false;
  if(String(attacker.id)===String(victim.id))return false;
  if(!(victim.p.hp>0)||victim.downUntil)return false;
  if(!isPvpInstance(auth))return false;
  if(playersAreAllies(attacker,victim))return false;
  return true;
}
function livingHostilePlayers(auth,attacker){
  return (auth.players||[]).filter((item)=>canPlayerDamagePlayer(auth,attacker,item));
}
function playerCombatProxy(item){
  const proxy={
    id:String(item.id),slug:"player",_playerEnt:item,
    cx:item.cx,cy:item.cy,x:item.x,y:item.y,sx:item.sx,sy:item.sy,
    def:{name:(item.p&&item.p.name)||"Player",race:"blood"},
    greedImmune:false,qteImmune:false
  };
  Object.defineProperty(proxy,"hp",{
    get(){return Math.max(0,Number(item.p&&item.p.hp)||0);},
    set(v){
      const next=Math.max(0,Number(v)||0),prev=Math.max(0,Number(item.p&&item.p.hp)||0);
      item.p.hp=next;
      if(proxy._auth&&next<prev)proxy._auth.lastDamageSource="player-raid";
      if(next<=0&&prev>0){
        const at=Number(proxy._auth&&proxy._auth.clock)||Number(item._pvpDeathAt)||Date.now();
        if(proxy._auth)authMarkPlayerDeath(proxy._auth,item,at);
        else{item.p.blessed=false;item.downUntil=at+30000;}
        if(proxy._auth){
          const pos=entityPosition(item,.13,.6);
          proxy._auth.events=proxy._auth.events||[];
          proxy._auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(item.id),
            permadead:!!item.permadead,screen:true,pvp:true,ts:at});
        }
      }
    },
    configurable:true
  });
  Object.defineProperty(proxy,"maxHp",{get(){return maxStats(item.p).hp;},configurable:true});
  return proxy;
}
function combatLivingFor(auth,attacker){
  const mobs=(auth.mobs||[]).filter((m)=>m&&m.hp>0);
  const hostiles=livingHostilePlayers(auth,attacker).map((item)=>{
    const proxy=playerCombatProxy(item);
    proxy._auth=auth;proxy._attacker=attacker;
    item._pvpDeathAt=Number(auth&&auth.clock)||Date.now();
    return proxy;
  });
  return mobs.concat(hostiles);
}
function markPlayerRaidDamage(auth,tgt){
  if(tgt&&tgt._playerEnt)auth.lastDamageSource="player-raid";
}
function applyPlayerPvpDamage(auth,attacker,victim,rawDmg,el,now){
  if(!canPlayerDamagePlayer(auth,attacker,victim))return 0;
  now=Number(now)||Number(auth.clock)||Date.now();
  let dmg=Math.max(0,Math.floor(Number(rawDmg)||0));
  const pos=entityPosition(victim,.13,.6),source=entityPosition(attacker,.13,.6);
  const element=el||"physical";
  if(element==="physical")dmg=mitigateIncoming(auth,dmg,victim.p);
  dmg=absorbIncomingDamage(auth,victim,victim.p,dmg,now,pos,element,null);
  victim.p.hp=Math.max(0,(Number(victim.p.hp)||0)-dmg);
  auth.lastDamageSource="player-raid";
  auth.events=auth.events||[];
  auth.events.push({t:"taken",dmg,x:pos.x,y:pos.y,targetId:String(victim.id),
    sx:source.x,sy:source.y,sourceId:String(attacker.id),el:element,screen:true,pvp:true,ts:now});
  if(victim.p.hp<=0){authMarkPlayerDeath(auth,victim,now);
    auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(victim.id),
      permadead:!!victim.permadead,screen:true,pvp:true,ts:now});}
  return dmg;
}
function canonicalPlayer(member){const p=clone(member&&member.p||{});p.id=String(member.id);syncPlayerProgress(p);
  p.gold=Math.max(0,Number(p.gold)||0);p.skills=p.skills||{fist:10,sword:10,axe:10,club:10,dist:10,shield:10};
  p.skillTries=p.skillTries||{};p.supplies=p.supplies||{};p.lootPouch=p.lootPouch||{};p.ammo=p.ammo||{};p.kills=p.kills||{};p.bosses=p.bosses||{};p.stamina=FULL_STAMINA;
  p.conditions=p.conditions&&typeof p.conditions==="object"?p.conditions:{};
  rewardChestEnsure(p);
  const max=maxStats(p);p.hp=Math.min(max.hp,Math.max(1,Number(p.hp)||max.hp));p.mp=Math.min(max.mp,Math.max(0,Number(p.mp)||max.mp));
  p.config=p.config||{};
  sanitizePlayerSpells(p,ALL_SPELLS);
  if(Array.isArray(p.config.combo))p.config.combo=sanitizeCombo(p.config.combo,p.voc);
  return p;}
function claimSpawnCell(auth,cx,cy){
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  const used=new Set();
  const mark=(ent)=>{if(ent&&Number.isFinite(Number(ent.cx))&&Number.isFinite(Number(ent.cy)))
    used.add(Number(ent.cx)+","+Number(ent.cy));};
  for(const ent of (auth.mobs||[]).concat(auth.players||[]))mark(ent);
  for(const sp of auth.pendingSpawns||[])mark(sp.mob||sp);
  cx=Math.max(0,Math.min(w-1,Math.round(Number(cx)||0)));cy=Math.max(0,Math.min(h-1,Math.round(Number(cy)||0)));
  if(!used.has(cx+","+cy))return {cx,cy};
  const dirs=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1],[2,0],[0,2],[-2,0],[0,-2],
    [2,1],[1,2],[-2,1],[-1,2]];
  for(const [dx,dy] of dirs){
    const nx=Math.max(0,Math.min(w-1,cx+dx)),ny=Math.max(0,Math.min(h-1,cy+dy));
    if(!used.has(nx+","+ny))return {cx:nx,cy:ny};
  }
  return {cx,cy};
}
function makeMob(auth,slug,boss,id,source,slot){const def=monsterDef(slug);if(!def)return null;const greedAdd=["dreadful-harvester","soulsnatcher","greedbeast","powerful-soul"].includes(String(slug));
  const stripGreedDef=!!(auth&&auth.greed&&greedAdd&&!boss);
  const hasSlot=Number.isFinite(Number(slot));
  const sequence=hasSlot?Number(slot)+1:Math.max(1,Number(auth.nextMobId)||1);
  if(!hasSlot)auth.nextMobId=sequence+1;
  const sinisterEligible=auth.kind==="hunt"&&!boss;
  let fiendish=sinisterEligible&&!!(source&&source.fiendish),influenced=!fiendish&&sinisterEligible&&!!(source&&source.influenced),
    stacks=fiendish?15:(influenced?Math.max(1,Math.min(5,Number(source.sinisterStacks)||1)):0);
  if(sinisterEligible&&!fiendish&&!influenced){fiendish=random(auth)<Math.max(0,Number(auth.fiendishChance)||0);
    influenced=!fiendish&&random(auth)<Math.max(0,Number(auth.influencedChance)||0);
    stacks=fiendish?15:(influenced?roll(auth,1,5):0);}
  const mult=stacks?1.35+stacks*.15:1,hp=Math.max(1,Math.floor((Number(def.hp)||1)*mult));
  const useDef=stripGreedDef?Object.assign({},def,{armor:0,defense:0,mitigation:0,resist:{},imune:[]}):def;
  const mob={id:id||("srv-"+sequence),slug:String(slug),boss:!!boss,influenced,fiendish,sinisterStacks:stacks,
    hp,maxHp:hp,armor:stripGreedDef||greedAdd?0:Math.max(0,Math.floor((Number(def.armor)||0)*(stacks?1+stacks*.05:1))),
    damage:Math.max(0,Math.floor((Number(def.damage)||0)*(stacks?1+stacks*.08:1))),
    exp:Math.max(0,Math.floor((Number(def.exp)||0)*(stacks?1+stacks*.25:1))),
    attackSpeed:Math.max(500,Number(def.attackSpeed)||2000),attackAcc:0,def:useDef};
  // Referência ao auth para eventos (mobheal do Unwelcome etc.) — NÃO
  // enumerável: JSON.stringify do estado serializa mobs e um ciclo
  // auth→mob→auth quebraria o save da instância.
  Object.defineProperty(mob,"_auth",{value:auth,enumerable:false,writable:true,configurable:true});
  if(source&&Number(source.maxHp||source.hp)>0){
    const forced=Math.max(1,Math.floor(Number(source.maxHp||source.hp)));
    mob.hp=forced;mob.maxHp=forced;
  }
  // Espalha cada spawn: mobs empilhados no mesmo tile ficam invisíveis uns
  // sob os outros e o pathfinding do cliente não consegue separá-los. Poucos
  // spawnPoints (ou nenhum) precisam de deslocamento próprio por criatura.
  const points=auth.spawnPoints||[],point=points.length?points[(sequence-1)%points.length]:null;
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  const ring=Math.floor((sequence-1)/Math.max(1,points.length||1)),
    spread=[[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]][((sequence-1)+ring)%9];
  let cx,cy;
  if(point){cx=Number(point.cx)+spread[0]*(ring?ring:0);cy=Number(point.cy)+spread[1]*(ring?ring:0);}
  else{cx=Math.floor(w/2)+spread[0]*(1+ring);cy=Math.floor(h/2)+spread[1]*(1+ring);}
  const cell=claimSpawnCell(auth,cx,cy);mob.cx=cell.cx;mob.cy=cell.cy;
  mob.x=(mob.cx+.5)/w;mob.y=(mob.cy+.5)/h;mob.sx=mob.x;mob.sy=mob.y;
  return mob;}
function partyCanShareExp(players){players=Array.isArray(players)?players:[];if(players.length<2)return false;
  const levels=players.map((item)=>Math.max(1,Number(item&&item.p&&item.p.level)||1));
  return Math.min(...levels)*3>=Math.max(...levels)*2;
}
function partyExpBonusPct(players){
  players=Array.isArray(players)?players:[];if(!partyCanShareExp(players))return 0;
  const vocs=new Set(players.map((item)=>String(item&&item.p&&item.p.voc||"none")));
  if(players.length===5&&vocs.size===5&&["knight","paladin","druid","sorcerer","monk"].every((voc)=>vocs.has(voc)))return 102;
  if(vocs.size>=4)return 100;if(vocs.size===3)return 70;if(vocs.size===2)return 35;return 20;
}
function partyExpShare(players,baseExp){const bonus=partyExpBonusPct(players),total=Math.floor(Math.max(0,Number(baseExp)||0)*(1+bonus/100));
  return {bonusPct:bonus,total,each:Math.floor(total/Math.max(1,players.length))};}
/* ---------- multiplicadores de EXP (rates.js do cliente) ---------- */
const SERVER_EXP_STAGES=[
  {min:1,max:8,rate:50},{min:9,max:50,rate:80},{min:51,max:100,rate:60},
  {min:101,max:150,rate:40},{min:151,max:200,rate:30},{min:201,max:300,rate:15},
  {min:301,max:400,rate:12},{min:401,max:500,rate:10},{min:501,max:600,rate:7},
  {min:601,max:700,rate:6},{min:701,max:800,rate:5},{min:801,max:900,rate:4},
  {min:901,max:1000,rate:3},{min:1001,max:1200,rate:2},{min:1201,max:1400,rate:1.5},
  {min:1401,max:Infinity,rate:1.2},
];
function expStage(level){
  for(const s of SERVER_EXP_STAGES)if(level>=s.min&&level<=s.max)return s.rate;
  return 1.2;
}
/* Prey EXP bonus: p.prey.slots[].selected = {creature, bonus, step, until} */
const PREY_BONUSES={exp:{base:13,step:3,max:40},damage:{base:7,step:2,max:25},
  defense:{base:12,step:2,max:30},loot:{base:13,step:3,max:40}};
function preyBonusValue(tipo,step){
  const b=PREY_BONUSES[tipo];if(!b)return 0;
  return Math.min(b.max,b.base+b.step*Math.max(0,Math.min(9,step||0)));
}
function preyForCreature(p,slug){
  if(!p.prey||!Array.isArray(p.prey.slots))return null;
  const now=Date.now();
  for(const slot of p.prey.slots){
    const s=slot.selected;if(!s)continue;
    if(s.until<=now){slot.selected=null;continue;}
    if(s.creature===slug)return s;
  }
  return null;
}
function preyExpBonus(p,slug){
  const s=preyForCreature(p,slug);
  return s&&s.bonus==="exp"?preyBonusValue("exp",s.step):0;
}
function preyDamageBonus(p,slug){
  const s=preyForCreature(p,slug);
  return s&&s.bonus==="damage"?preyBonusValue("damage",s.step):0;
}
function preyDefenseBonus(p,slug){
  const s=preyForCreature(p,slug);
  return s&&s.bonus==="defense"?preyBonusValue("defense",s.step):0;
}
function preyLootBonus(p,slug){
  const s=preyForCreature(p,slug);
  return s&&s.bonus==="loot"?preyBonusValue("loot",s.step):0;
}
function preyDefenseTickOnHit(p,slug){
  const s=preyForCreature(p,slug);
  if(s)s.until=Math.max(Date.now(),s.until-10000);
}
/* VIP EXP bonus (1.10 = +10%) */
function vipExpBonus(p){
  if(!p||!p.vipUntil)return 1;
  return Number(p.vipUntil)>Date.now()?1.10:1;
}
/* Calcula EXP final com todos os multiplicadores */
function finalExp(p,mobExp,mobSlug,expMul){
  let exp=Math.max(0,Math.floor(Number(mobExp)||0));
  // Stage multiplier (rates.js)
  exp=Math.floor(exp*expStage(Number(p.level)||1));
  // Instância PVP do idle: +25% EXP (antes de prey/VIP, como c.expMul).
  const modeMul=Number(expMul);exp=Math.floor(exp*(Number.isFinite(modeMul)&&modeMul>0?modeMul:1));
  // Prey EXP bonus
  const prey=preyExpBonus(p,mobSlug);
  if(prey>0)exp=Math.floor(exp*(1+prey/100));
  // VIP EXP bonus
  exp=Math.floor(exp*vipExpBonus(p));
  // Loyalty EXP bonus (rank %)
  const loyaltyMul=loyaltyExpMultiplier(p);
  if(loyaltyMul>1)exp=Math.floor(exp*loyaltyMul);
  return exp;
}

function rewardChestEnsure(p){
  if(!p)return p;
  p.rewardChestBundles=Array.isArray(p.rewardChestBundles)?p.rewardChestBundles:[];
  if(Array.isArray(p.rewardChest)){
    const rows=p.rewardChest;p.rewardChest={};
    for(const row of rows){
      if(!row||!row.item)continue;
      const n=Math.max(0,Number(row.count)||0);if(!n)continue;
      const bossId=row.bossId||null;
      rewardChestAdd(p,row.item,n,{
        bundleId:row.bundleId||(String(bossId||"boss")+"-migrated"),
        bossId,name:row.name||bossId||"Recompensa de boss",
        sprite:row.sprite||bossId||null});
    }
  }else if(!p.rewardChest||typeof p.rewardChest!=="object")p.rewardChest={};
  return p;
}
function rewardChestAdd(p,slug,count,source){
  if(!p||!slug||!(count>0))return;
  rewardChestEnsure(p);
  p.rewardChest[slug]=(Number(p.rewardChest[slug])||0)+count;
  source=source||{};
  const id=String(source.bundleId||source.id||"unassigned-reward");
  let bundle=p.rewardChestBundles.find((b)=>String(b.id)===id);
  if(!bundle){
    bundle={id,bossId:source.bossId||null,name:source.name||"Recompensa de boss",
      sprite:source.sprite||source.bossId||null,createdAt:Date.now(),items:{}};
    p.rewardChestBundles.push(bundle);
  }
  bundle.items[slug]=(Number(bundle.items[slug])||0)+count;
}
function rewardChestRemoveBundleIfEmpty(p,bundle){
  if(!bundle||Object.keys(bundle.items||{}).some((slug)=>bundle.items[slug]>0))return;
  p.rewardChestBundles=(p.rewardChestBundles||[]).filter((b)=>b!==bundle);
}
function rewardChestAddPouch(p,slug,count){
  if(!p||!slug||!(count>0))return;
  p.lootPouch=p.lootPouch||{};
  p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+count;
}
const CURRENCY_GOLD={"gold-coin":1,"platinum-coin":100,"crystal-coin":10000};
const SUPPLY_STASH_MAX_SLOTS=20;
function isSupplyItem(slug){return !!(POTIONS[slug]||RUNES[slug]);}
function isAmmoItem(slug){
  const it=ITEMS[slug];
  return !!(AMMO[slug]||(it&&(it.s==="ammo"||it.type==="ammo"||it.slot==="ammo")));
}
function isSupplyStashableItem(slug){
  const it=ITEMS[slug];
  if(!it)return false;
  if(it.supplyStashable)return true;
  return !!(it.charges&&(it.s==="ring"||it.s==="amulet"||it.slot==="ring"||it.slot==="necklace"));
}
function ensureSupplyStash(p){
  if(!p.supplyStash||typeof p.supplyStash!=="object"||Array.isArray(p.supplyStash))p.supplyStash={};
  if(!p.config)p.config={};
  if(!p.config.autoSupplyStash||typeof p.config.autoSupplyStash!=="object"||Array.isArray(p.config.autoSupplyStash))
    p.config.autoSupplyStash={};
  return p.supplyStash;
}
function isAutoSupplyStash(p,slug){
  if(!p||!slug||!isSupplyStashableItem(slug))return false;
  ensureSupplyStash(p);
  return !!p.config.autoSupplyStash[slug];
}
function supplyStashSlotsUsed(p){
  ensureSupplyStash(p);
  let n=0;for(const slug of Object.keys(p.supplyStash))if((p.supplyStash[slug]||0)>0)n++;
  return n;
}
function addSupplyStash(p,slug,count,opts){
  if(!p||!slug||!isSupplyStashableItem(slug))return false;
  count=Math.max(1,Math.floor(Number(count)||1));
  const allowOverflow=!(opts&&opts.allowPouchOverflow===false);
  ensureSupplyStash(p);
  const had=(p.supplyStash[slug]||0)>0;
  if(!had&&supplyStashSlotsUsed(p)>=SUPPLY_STASH_MAX_SLOTS){
    if(!allowOverflow)return false;
    p.lootPouch=p.lootPouch||{};p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+count;return true;
  }
  p.supplyStash[slug]=(Number(p.supplyStash[slug])||0)+count;return true;
}
/** Move bag/pouch → supply stash (autoritativo). Remove da origem antes de adicionar. */
function moveItemToSupplyStash(p,payload){
  if(!p||!payload||!payload.slug)return false;
  const slug=String(payload.slug),source=String(payload.source||"");
  if(!isSupplyStashableItem(slug))return false;
  const addOpts={allowPouchOverflow:false};
  if(source==="bag"){
    const count=Math.max(0,Math.floor(Number(p.bag&&p.bag[slug])||0));
    if(count<=0)return false;
    p.bag=p.bag||{};delete p.bag[slug];
    if(!addSupplyStash(p,slug,count,addOpts)){p.bag[slug]=(Number(p.bag[slug])||0)+count;return false;}
    return true;
  }
  if(source==="pouch"){
    const count=Math.max(0,Math.floor(Number(p.lootPouch&&p.lootPouch[slug])||0));
    if(count<=0)return false;
    p.lootPouch=p.lootPouch||{};
    p.lootPouch[slug]-=count;if(p.lootPouch[slug]<=0)delete p.lootPouch[slug];
    if(!addSupplyStash(p,slug,count,addOpts)){
      p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+count;return false;
    }
    return true;
  }
  return false;
}
/** Remove N unidades da Supply Stash (mapa slug→qty de itens cheios). */
function removeSupplyStashCount(p,slug,count){
  if(!p||!slug)return false;
  count=Math.max(1,Math.floor(Number(count)||1));
  ensureSupplyStash(p);
  const have=Math.max(0,Math.floor(Number(p.supplyStash[slug])||0));
  if(have<count)return false;
  p.supplyStash[slug]=have-count;
  if(p.supplyStash[slug]<=0)delete p.supplyStash[slug];
  return true;
}
/**
 * Retira da Supply Stash (autoritativo). dest: "bag" | "pouch" | "destroy".
 * qty null = stack inteira. supplyStash é protected no PUT — sem isto o
 * cliente decrementa e o tick/save restaura o contador fantasma.
 */
function moveItemFromSupplyStash(p,payload){
  if(!p||!payload||!payload.slug)return false;
  const slug=String(payload.slug),dest=String(payload.dest||"bag");
  ensureSupplyStash(p);
  const have=Math.max(0,Math.floor(Number(p.supplyStash[slug])||0));
  if(have<=0)return false;
  const count=payload.qty==null?have:Math.max(1,Math.min(have,Math.floor(Number(payload.qty)||have)));
  if(!removeSupplyStashCount(p,slug,count))return false;
  if(dest==="destroy")return true;
  if(dest==="pouch"){
    p.lootPouch=p.lootPouch||{};
    p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+count;
    return true;
  }
  if(dest==="bag"){
    if(!authAddItemToBag(p,slug,count)){
      p.supplyStash[slug]=(Number(p.supplyStash[slug])||0)+count;
      return false;
    }
    return true;
  }
  p.supplyStash[slug]=(Number(p.supplyStash[slug])||0)+count;
  return false;
}
/**
 * Equipa 1 unidade da Supply Stash no slot do item (ring/amulet).
 * Força origem stash (não prefere bag/pouch). Item anterior vai para a bag.
 */
function equipFromSupplyStash(p,slug,targetSlot){
  if(!p||!slug)return false;
  const it=ITEMS[slug];
  if(!it||!it.s)return false;
  const slot=String(it.s);
  if(targetSlot&&String(targetSlot)!==slot)return false;
  if(slot!=="ring"&&slot!=="amulet")return false;
  if(it.lvl&&(Number(p.level)||1)<Number(it.lvl))return false;
  if(!accessoryVocOk(p,it))return false;
  ensureSupplyStash(p);
  if((Number(p.supplyStash[slug])||0)<=0)return false;
  if(!removeSupplyStashCount(p,slug,1))return false;
  const cur=p.equip&&p.equip[slot]&&p.equip[slot].item||"";
  if(cur)stashAccessoryToBag(p,slot);
  const charges=accessoryChargesOnEquip(p,slug,undefined);
  p.equip=p.equip||{};
  p.equip[slot]={item:slug,count:1};
  if(charges!=null){p.equip[slot].charges=charges;p.equip[slot].maxCharges=it.charges||charges;}
  return true;
}

/* ----------------------------------------------- equip em instância online
 * O PUT da instância protege equip/lootPouch: troca de equipamento durante o
 * combate precisa passar pela autoridade, senão o tick (200ms) restaura o
 * snapshot anterior — era isso que "forçava" o falcon bow de volta no RP.
 * Espelha equipItemFromContainer do cliente sem recriar o modelo completo de
 * instâncias: a instância equipada só muda de `loc` (bag <-> equip:<slot>),
 * preservando id/tier para o cliente não perder a forja ao receber o tick. */

/* Cabe 1 unidade no bag? (mesma regra de authAddItemToBag, sem mexer no p) */
function authCanAddToBag(p,slug){
  if(!p||!slug)return false;
  const weight=itemUnitWeight(slug);
  if(weight>freeCapacity(p)+1e-9)return false;
  if(authItemNeedsBagInstance(slug))return authBagUsedSlots(p)<authBagSlots(p);
  const had=(Number(p.bag&&p.bag[slug])||0)>0;
  return had||authBagUsedSlots(p)<authBagSlots(p);
}

/* Guarda o item equipado no destino. Preserva instância/tier (loc bag) —
 * nunca deleta a instância de um item tierado, igual ao cliente. */
function stashEquippedAuth(p,slot,dest){
  const e=p.equip&&p.equip[slot];
  if(!e||!e.item){if(p.equip)delete p.equip[slot];return true;}
  const inst=e.instId&&Array.isArray(p.itemInstances)
    ?p.itemInstances.find((i)=>i&&String(i.id)===String(e.instId)):null;
  delete p.equip[slot];
  if(inst){
    if(dest==="bag"||Number(inst.tier)>0){
      inst.loc="bag";
      p.bag=p.bag||{};p.bag[e.item]=(Number(p.bag[e.item])||0)+1;
      return true;
    }
    // pouch só aceita sem tier: instância tier 0 vira stack na pouch
    p.itemInstances=p.itemInstances.filter((i)=>i!==inst);
    p.lootPouch=p.lootPouch||{};
    p.lootPouch[e.item]=(Number(p.lootPouch[e.item])||0)+1;
    return true;
  }
  if(dest==="bag"){
    if(!authAddItemToBag(p,e.item,1)){p.equip[slot]=e;return false;}
    return true;
  }
  p.lootPouch=p.lootPouch||{};
  p.lootPouch[e.item]=(Number(p.lootPouch[e.item])||0)+1;
  return true;
}

/* Troca de equipamento com fonte bag/pouch (espelho do equipItemFromContainer).
 * Também aplica a munição automática por tipo de arma (autoAmmoForWeaponAuth). */
function equipFromContainerAuth(p,slug,source,opts){
  opts=opts||{};
  const it=ITEMS[slug];
  if(!p||!it||!it.s)return {ok:false,msg:"Esse item não é equipável"};
  const slot=String(it.s);
  if(slot==="ammo")return {ok:false,msg:"Use a seleção de munição do quiver"};
  const lvl=Number(it.lvl!==undefined?it.lvl:it.level)||0;
  if(lvl>(Number(p.level)||1))return {ok:false,msg:"Nível insuficiente"};
  if(Array.isArray(it.vocs)&&it.vocs.length&&it.vocs.indexOf(String(p.voc))===-1)
    return {ok:false,msg:"Vocação incompatível"};
  if((it.t==="quiver"||it.type==="quiver"||it.s==="quiver")&&String(p.voc)!=="paladin")
    return {ok:false,msg:"Somente paladins podem equipar quiver"};
  if(slot==="shield"&&it.t!=="quiver"){
    const w=p.equip&&p.equip.weapon,wi=w&&ITEMS[w.item];
    if(wi&&wi.th)return {ok:false,msg:"Arma de duas mãos impede escudo/spellbook"};
  }
  // Arma 2H também devolve o escudo (não o quiver) — valida espaço antes.
  const old=p.equip&&p.equip[slot];
  const shieldBack=slot==="weapon"&&it.th&&p.equip&&p.equip.shield&&(()=>{
    const sh=ITEMS[p.equip.shield.item];
    return !sh||(sh.t!=="quiver"&&sh.type!=="quiver"&&sh.s!=="quiver");
  })()?p.equip.shield:null;
  const fromPouch=source==="pouch";
  const toStash=[];
  if(old&&old.item&&old.item!==slug)toStash.push({slot:slot,entry:old});
  if(shieldBack)toStash.push({slot:"shield",entry:shieldBack});
  for(const s of toStash){
    const toBag=!fromPouch||s.entry.instId;
    if(toBag&&!authCanAddToBag(p,s.entry.item))
      return {ok:false,msg:"Mochila cheia para guardar o item anterior"};
  }
  // retira o novo do bag/pouch
  let takenInst=null;
  if(fromPouch){
    const n=Number(p.lootPouch&&p.lootPouch[slug])||0;
    if(n<=0)return {ok:false,msg:"Item não está na Loot Pouch"};
    if(n>1)p.lootPouch[slug]=n-1;else delete p.lootPouch[slug];
  }else{
    const n=Number(p.bag&&p.bag[slug])||0;
    if(n<=0)return {ok:false,msg:"Item não está na mochila"};
    if(authItemNeedsBagInstance(slug)){
      const arr=p.itemInstances||[];
      const idx=arr.findIndex((inst)=>inst&&inst.loc==="bag"&&String(inst.slug)===String(slug)&&
        (!opts.instId||String(inst.id)===String(opts.instId)));
      if(idx<0)return {ok:false,msg:"Item não está na mochila"};
      takenInst=arr[idx];
      p.itemInstances=arr.filter((_,i)=>i!==idx);
    }
    if(n>1)p.bag[slug]=n-1;else delete p.bag[slug];
  }
  for(const s of toStash){
    if(!stashEquippedAuth(p,s.slot,fromPouch?"pouch":"bag")){
      // rollback do item retirado
      if(fromPouch)p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+1;
      else{p.bag[slug]=(Number(p.bag[slug])||0)+1;if(takenInst)p.itemInstances.push(takenInst);}
      return {ok:false,msg:"Não foi possível guardar o item anterior"};
    }
  }
  p.equip=p.equip||{};
  p.equip[slot]={item:slug,count:1};
  if(takenInst){
    takenInst.loc="equip:"+slot;
    p.itemInstances=p.itemInstances||[];
    p.itemInstances.push(takenInst);
    p.equip[slot].instId=takenInst.id;
    p.equip[slot].tier=takenInst.tier||0;
  }
  autoAmmoForWeaponAuth(p,slug,it);
  return {ok:true};
}

function unequipFromContainerAuth(p,slot,dest){
  if(!p||!slot||slot==="backpack"||slot==="ammo")return {ok:false,msg:"Slot não pode ser removido"};
  if(!p.equip||!p.equip[slot])return {ok:false,msg:"Nada equipado neste slot"};
  const ok=stashEquippedAuth(p,String(slot),dest||"bag");
  return {ok:ok,msg:ok?"":"Não foi possível guardar o item"};
}

/* Ao equipar bow/crossbow, seleciona a munição do tipo certo usando a última
 * usada daquele tipo (config.refillArrow / refillBolt — o estado pedido pelo
 * jogador). Sem registro anterior cai na arrow/bolt base. Armas de arremesso
 * e personagens sem quiver não mudam de munição. */
function autoAmmoForWeaponAuth(p,slug,it){
  if(!p||!it)return;
  const kind=weaponAmmoKind(it,slug);
  if(!kind)return;
  if(!equippedQuiver(p))return;
  const cfg=p.config=p.config||{};
  const want=kind==="bolt"?cfg.refillBolt:cfg.refillArrow;
  const ammoSlug=want||(kind==="bolt"?"bolt":"arrow");
  const am=ITEMS[ammoSlug];
  if(!am||!(am.s==="ammo"||am.slot==="ammo"||am.type==="ammo"))return;
  const amLvl=Number(am.lvl!==undefined?am.lvl:am.level)||0;
  if(amLvl>(Number(p.level)||1))return;
  if(!ammoCompatibleWithWeapon(am,slug))return;
  p.equip=p.equip||{};
  p.equip.ammo={item:ammoSlug,count:null};
  if(kind==="arrow"){cfg.refillArrow=ammoSlug;if(!cfg.refillBolt)cfg.refillBolt="";}
  else{cfg.refillBolt=ammoSlug;if(!cfg.refillArrow)cfg.refillArrow="";}
  return ammoSlug;
}
function creditHuntLoot(p,slug,count){
  if(!p||!slug)return {ok:false,discarded:true};
  count=Math.max(1,Math.floor(Number(count)||1));
  // NÃO COLETAR: ignora o drop (não pouch/stash/bag). Moedas/supplies/ammo
  // também respeitam a lista — o jogador pediu skip explícito.
  if(isAuthNoCollect(p,slug))return {ok:true,discarded:false,skipped:true,noCollect:true};
  const unit=CURRENCY_GOLD[slug];
  if(unit){
    const gained=unit*count;
    p.gold=(Number(p.gold)||0)+gained;
    return {ok:true,discarded:false,gold:gained,currency:true};
  }
  if(isSupplyItem(slug)){p.supplies=p.supplies||{};p.supplies[slug]=(Number(p.supplies[slug])||0)+count;return {ok:true,discarded:false};}
  if(isAmmoItem(slug)){p.ammo=p.ammo||{};p.ammo[slug]=(Number(p.ammo[slug])||0)+count;return {ok:true,discarded:false};}
  const weight=itemUnitWeight(slug)*count;
  if(weight>freeCapacity(p)+1e-9)return {ok:false,discarded:true,reason:"cap"};
  if(isAutoSupplyStash(p,slug)){addSupplyStash(p,slug,count);return {ok:true,discarded:false,stash:true};}
  p.lootPouch=p.lootPouch||{};p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+count;
  return {ok:true,discarded:false};
}
function rewardChestClaimOne(p,slug,bundleId){
  if(!p||!slug)return false;
  rewardChestEnsure(p);
  let count=0;
  if(bundleId){
    const bundle=(p.rewardChestBundles||[]).find((b)=>String(b.id)===String(bundleId));
    if(!bundle||!bundle.items||!bundle.items[slug])return false;
    count=Number(bundle.items[slug])||0;if(!count)return false;
    delete bundle.items[slug];rewardChestRemoveBundleIfEmpty(p,bundle);
  }else{
    count=Number(p.rewardChest[slug])||0;if(!count)return false;
    for(const bundle of p.rewardChestBundles||[])if(bundle&&bundle.items)delete bundle.items[slug];
    p.rewardChestBundles=(p.rewardChestBundles||[]).filter((b)=>b&&b.items&&Object.keys(b.items).some((k)=>b.items[k]>0));
  }
  rewardChestAddPouch(p,slug,count);
  p.rewardChest[slug]=Math.max(0,(Number(p.rewardChest[slug])||0)-count);
  if(!p.rewardChest[slug])delete p.rewardChest[slug];
  return true;
}
function rewardChestClaimBundle(p,bundleId){
  rewardChestEnsure(p);
  const bundle=(p.rewardChestBundles||[]).find((b)=>String(b.id)===String(bundleId));
  if(!bundle)return 0;
  let types=0;
  for(const slug of Object.keys(bundle.items||{})){
    const count=Number(bundle.items[slug])||0;if(count<=0)continue;
    rewardChestAddPouch(p,slug,count);
    p.rewardChest[slug]=Math.max(0,(Number(p.rewardChest[slug])||0)-count);
    if(!p.rewardChest[slug])delete p.rewardChest[slug];
    types++;
  }
  bundle.items={};rewardChestRemoveBundleIfEmpty(p,bundle);
  return types;
}
function rewardChestClaimAll(p){
  if(!p)return 0;
  rewardChestEnsure(p);
  let n=0;
  for(const slug of Object.keys(p.rewardChest||{})){
    const count=Number(p.rewardChest[slug])||0;if(count<=0)continue;
    rewardChestAddPouch(p,slug,count);n++;
  }
  p.rewardChest={};p.rewardChestBundles=[];
  return n;
}
/* Goshnar's Taints — port do soulwar.js (idle). Só atuam em Soul War zones /
 * bosses Goshnar e expiram 14 dias após a primeira mácula. */
const SOULWAR_TAINT_DURATION=14*24*60*60*1000;
const SOULWAR_TAINTS=[
  {id:"teleport",name:"Taint of Teleportation",icon:"goshnar-taint-1",exp:1.045},
  {id:"spawn",name:"Taint of Duplication",icon:"goshnar-taint-2",exp:1.092},
  {id:"damage",name:"Taint of Pain",icon:"goshnar-taint-3",exp:1.141},
  {id:"heal",name:"Taint of Renewal",icon:"goshnar-taint-4",exp:1.192},
  {id:"loss",name:"Taint of Loss",icon:"goshnar-taint-5",exp:1.246},
];
const SOULWAR_TAINT_BOSSES=["goshnar-s-malice","goshnar-s-spite","goshnar-s-greed","goshnar-s-hatred","goshnar-s-cruelty"];
function soulwarTaintState(p,now){
  if(!p)return null;
  p.soulWarTaints=p.soulWarTaints||{level:0,firstAt:0,bosses:{}};
  const st=p.soulWarTaints;st.bosses=st.bosses||{};
  const ts=Number(now)||Date.now();
  if(st.firstAt&&ts-Number(st.firstAt)>=SOULWAR_TAINT_DURATION){st.level=0;st.firstAt=0;st.bosses={};}
  return st;
}
function soulwarTaintLevel(p,now){
  const st=soulwarTaintState(p,now);
  return st?Math.max(0,Math.min(5,Number(st.level)||0)):0;
}
function soulwarInTaintZone(auth){
  if(!auth)return false;
  if(auth.bossId&&SOULWAR_TAINT_BOSSES.indexOf(String(auth.bossId))!==-1)return true;
  const hunt=HUNTS[auth.huntId];
  return !!(hunt&&hunt.soulWarZone);
}
function soulwarTaintDamageMultiplier(auth,p){
  return soulwarInTaintZone(auth)&&soulwarTaintLevel(p,auth&&auth.clock)>=3?1.15:1;
}
function soulwarTaintExpMultiplier(auth,p){
  if(!soulwarInTaintZone(auth))return 1;
  const level=soulwarTaintLevel(p,auth&&auth.clock);
  return level?SOULWAR_TAINTS[level-1].exp:1;
}
function soulwarGrantBossTaint(p,bossId,now){
  if(!p||SOULWAR_TAINT_BOSSES.indexOf(String(bossId||""))===-1)return 0;
  const st=soulwarTaintState(p,now);
  if(st.bosses[bossId])return st.level||0;
  st.bosses[bossId]=true;if(!st.firstAt)st.firstAt=Number(now)||Date.now();
  st.level=Math.min(5,(Number(st.level)||0)+1);
  return st.level;
}
function soulwarHasAllBossTaints(p,now){
  // TEMP TEST: remove before release — mesma flag do lobby/client (máculas).
  const MEGA_TEST_BYPASS=true;
  if(MEGA_TEST_BYPASS)return true;
  const st=soulwarTaintState(p,now);
  if(!st||soulwarTaintLevel(p,now)<5)return false;
  for(let i=0;i<SOULWAR_TAINT_BOSSES.length;i++)
    if(!st.bosses[SOULWAR_TAINT_BOSSES[i]])return false;
  return true;
}
function soulwarTaintPreventMonsterDeath(auth,mob,p){
  if(!soulwarInTaintZone(auth)||soulwarTaintLevel(p,auth&&auth.clock)<4||!mob||mob.boss)return false;
  if(random(auth)>=.10)return false;
  mob.hp=mob.maxHp;
  const pos=entityPosition(mob,.5,.5);
  auth.events=auth.events||[];
  auth.events.push({t:"effect",x:pos.x,y:pos.y,screen:true,fx:"magic-green",ts:Number(auth.clock)||Date.now()});
  return true;
}
function soulwarTaintNearCell(auth,item,radius){
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  const px=Number.isFinite(Number(item&&item.cx))?Number(item.cx):Math.floor(w/2);
  const py=Number.isFinite(Number(item&&item.cy))?Number(item.cy):Math.floor(h/2);
  const used=new Set();
  for(const m of auth.mobs||[])if(m&&m.hp>0)used.add(m.cx+","+m.cy);
  for(const pl of auth.players||[])if(pl&&Number.isFinite(Number(pl.cx)))used.add(pl.cx+","+pl.cy);
  const r=Math.max(1,Number(radius)||2);
  const cells=[];
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(!dx&&!dy)continue;
    const cx=Math.max(0,Math.min(w-1,px+dx)),cy=Math.max(0,Math.min(h-1,py+dy));
    if(auth.blockedCells&&auth.blockedCells[cy]&&auth.blockedCells[cy][cx])continue;
    if(used.has(cx+","+cy))continue;
    cells.push({cx,cy});
  }
  if(!cells.length)return null;
  return cells[Math.min(cells.length-1,Math.floor(random(auth)*cells.length))];
}
function soulwarTaintSpawnNearPlayer(auth,item,now){
  if(!soulwarInTaintZone(auth)||!item||!item.p||item.p.hp<=0||item.downUntil)return false;
  if(soulwarTaintLevel(item.p,now)<2)return false;
  auth.soulwarTaintSpawnCd=auth.soulwarTaintSpawnCd||0;
  if(now<auth.soulwarTaintSpawnCd||random(auth)>=.005)return false;
  const hunt=HUNTS[auth.huntId]||{};
  const slug=String(hunt.soulWarZoneMonster||"many-faces");
  if(!monsterDef(slug))return false;
  const cell=soulwarTaintNearCell(auth,item,3);if(!cell)return false;
  const mob=makeMob(auth,slug,false);if(!mob)return false;
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  mob.cx=cell.cx;mob.cy=cell.cy;mob.x=(mob.cx+.5)/w;mob.y=(mob.cy+.5)/h;mob.sx=mob.x;mob.sy=mob.y;
  auth.mobs.push(mob);auth.soulwarTaintSpawnCd=now+30000;
  auth.events=auth.events||[];
  auth.events.push({t:"effect",x:mob.x,y:mob.y,screen:true,fx:"teleport",ts:now});
  return true;
}
function soulwarTaintTick(auth,dt,now){
  if(!soulwarInTaintZone(auth)||auth.ended)return;
  const players=(auth.players||[]).filter((item)=>item&&item.p&&item.p.hp>0&&!item.downUntil);
  if(!players.length)return;
  let maxLevel=0;
  for(const item of players)maxLevel=Math.max(maxLevel,soulwarTaintLevel(item.p,now));
  if(!maxLevel)return;
  if(maxLevel>=1){
    auth.soulwarTeleportAcc=(Number(auth.soulwarTeleportAcc)||0)+dt;
    if(auth.soulwarTeleportAcc>=2000){
      auth.soulwarTeleportAcc=0;
      if(random(auth)<.10){
        const mobs=(auth.mobs||[]).filter((m)=>m&&!m.boss&&m.hp>0);
        if(mobs.length){
          const mob=mobs[Math.min(mobs.length-1,Math.floor(random(auth)*mobs.length))];
          const anchor=players[Math.min(players.length-1,Math.floor(random(auth)*players.length))];
          const cell=soulwarTaintNearCell(auth,anchor,2);
          if(cell){
            const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
            mob.cx=cell.cx;mob.cy=cell.cy;mob.x=(mob.cx+.5)/w;mob.y=(mob.cy+.5)/h;mob.sx=mob.x;mob.sy=mob.y;
            auth.events=auth.events||[];
            auth.events.push({t:"effect",x:mob.x,y:mob.y,screen:true,fx:"teleport",ts:now});
          }
        }
      }
    }
  }
  if(maxLevel>=2){
    for(const item of players)if(soulwarTaintLevel(item.p,now)>=2)soulwarTaintSpawnNearPlayer(auth,item,now);
  }
  if(maxLevel>=5){
    auth.soulwarLossAcc=(Number(auth.soulwarLossAcc)||0)+dt;
    if(auth.soulwarLossAcc>=10000){
      auth.soulwarLossAcc-=10000;
      for(const item of players){
        if(soulwarTaintLevel(item.p,now)<5)continue;
        const p=item.p;
        p.hp=Math.max(0,p.hp-Math.ceil(p.hp*.10));
        p.mp=Math.max(0,p.mp-Math.ceil(p.mp*.10));
        const pos=playerPosition(auth,p);
        auth.events=auth.events||[];
        auth.events.push({t:"effect",x:pos.x,y:pos.y,screen:true,fx:"mort-area",targetId:String(item.id),ts:now});
        if(p.hp<=0){authMarkPlayerDeath(auth,item,now);
          auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(item.id),
            permadead:!!item.permadead,screen:true,ts:now});}
      }
    }
  }
}

function reward(auth,mob,players,stepTs){const alive=players.filter((x)=>x&&x.p&&x.p.hp>0);
  const receivers=alive.length?alive:(players[0]?[players[0]]:[]);
  const eligible=partyCanShareExp(players);
  const baseExp=Number(mob.exp)||0;
  const split=partyExpShare(players,baseExp);
  auth.stats=auth.stats||{};auth.stats.rawExp=(Number(auth.stats.rawExp)||0)+Math.max(0,baseExp);
  auth.stats.rawHp=(Number(auth.stats.rawHp)||0)+Math.max(0,Number(mob.maxHp)||0);auth.stats.monsters=auth.stats.monsters||{};
  const raw=auth.stats.monsters[mob.slug]||(auth.stats.monsters[mob.slug]={name:mob.def.name||mob.slug,kills:0,rawExp:0,rawHp:0});
  raw.kills=(Number(raw.kills)||0)+1;raw.rawExp=(Number(raw.rawExp)||0)+Math.max(0,baseExp);
  raw.rawHp=(Number(raw.rawHp)||0)+Math.max(0,Number(mob.maxHp)||0);
  let totalShare=0;const shares=[];
  for(const item of receivers){
    const portion=eligible?split.each:baseExp;
    let share=finalExp(item.p,portion,mob.slug,auth.expMul||1);
    const taintExp=soulwarTaintExpMultiplier(auth,item.p);
    if(taintExp!==1)share=Math.floor(share*taintExp);
    totalShare+=share;
    const beforeLevel=Number(item.p.level)||1;
    addExp(item.p,share);item.p.totalKills=(Number(item.p.totalKills)||0)+1;item.p.kills[mob.slug]=(Number(item.p.kills[mob.slug])||0)+1;
    bestiaryKill(item.p,mob.slug,1);
    if(mob.boss||(mob.def&&mob.def.boss))bosstiaryKill(item.p,mob.slug,1);
    shares.push({id:String(item.id),exp:share,level:item.p.level,leveled:item.p.level>beforeLevel});
    if(auth.huntId){item.p.missions=item.p.missions||{};const mission=item.p.missions[auth.huntId]||(item.p.missions[auth.huntId]={progress:{},claimed:{},completeClaimed:false});
      mission.progress=mission.progress||{};mission.progress[mob.slug]=(Number(mission.progress[mob.slug])||0)+1;}}
  auth._lastKillExp=shares[0]?shares[0].exp:0;auth._lastKillShares=shares;
  // Loot: UM crédito por kill no líder (players[0]). Nunca por membro da party.
  const leader=players[0]&&players[0].p;if(!leader)return [];
  const lootDrops=[];
  // Rate idle global (mesmo SERVER_LOOT_RATE=2.5 do cliente). NÃO é o 2.5×
  // extra do reward chest — boss chest só muda o destino (chest vs pouch).
  // IMPORTANTE: rate/prey/lootMul multiplicam SÓ a chance (cap 100%).
  // Nunca count*rate — isso gerava Timira com 14*2.5=35 potions / rares qty 2–3.
  const lootRate=2.5;
  const preyLoot=preyLootBonus(leader,mob.slug);
  // idle: l.chance * lootRate * (c.lootMul || 1) — PVP usa lootMul 1.25
  const chanceMult=lootRate*(Number(auth.lootMul)||1)*(1+preyLoot/100);
  if(!auth.rewardBundleId&&mob.boss)
    auth.rewardBundleId=String(auth.bossId||mob.slug)+"-"+String(auth.clock||stepTs||Date.now());
  const bossMeta=monsterDef(auth.bossId||mob.slug)||mob.def||{};
  const rewardSource=mob.boss?{
    bundleId:auth.rewardBundleId,bossId:auth.bossId||mob.slug,
    name:bossMeta.name||auth.bossId||mob.slug,sprite:auth.bossId||mob.slug}:null;
  for(const entry of mob.def.loot||[]){
    const chance=Math.min(100,(Number(entry.chance)||0)*chanceMult);
    if(random(auth)*100>chance)continue;
    // Quantidade = min–max da entrada (Canary/wiki). Sem boost por rate.
    const min=Math.max(1,Number(entry.min)||1),max=Math.max(min,Number(entry.max)||1),count=roll(auth,min,max);
    lootDrops.push({item:entry.item,count});
    if(mob.boss)rewardChestAdd(leader,entry.item,count,rewardSource);
    else{
      const credited=creditHuntLoot(leader,entry.item,count);
      if(credited&&credited.skipped)continue;
      if(credited&&credited.discarded){
        let who="";for(const x of auth.players||[])if(x&&x.p===leader){who=String(x.id);break;}
        auth.events.push({t:"cap-drop",item:entry.item,count,msg:"You cannot carry more.",
          targetId:who,ts:stepTs});
        continue;
      }
      if(credited&&credited.gold)auth.stats.gold=(Number(auth.stats.gold)||0)+credited.gold;
    }
    auth.stats.loot[entry.item]=(Number(auth.stats.loot[entry.item])||0)+count;
  }
  if(mob.influenced||mob.fiendish){
    const stacks=mob.fiendish?15:Math.max(1,Number(mob.sinisterStacks)||1);let dust=0;
    for(let i=0;i<stacks;i++)dust+=roll(auth,1,3);
    leader.dustLimit=Math.max(100,Number(leader.dustLimit)||100);leader.dust=Math.max(0,Number(leader.dust)||0);
    const gained=Math.min(Math.max(0,leader.dustLimit-leader.dust),dust);leader.dust+=gained;
    if(gained)auth.stats.loot.dust=(Number(auth.stats.loot.dust)||0)+gained;
    let sliversGained=0;
    if(mob.fiendish){const stars=Math.max(1,Number(mob.def&&mob.def.best&&mob.def.best.stars)||3);sliversGained=roll(auth,1,stars);
      leader.slivers=(Number(leader.slivers)||0)+sliversGained;auth.stats.loot.slivers=(Number(auth.stats.loot.slivers)||0)+sliversGained;}
    // Evento de dust para o cliente mostrar o floater
    if(gained||sliversGained)auth.events.push({t:"dust",dust:gained,slivers:sliversGained,
      stacks:stacks,x:Number(mob.x)||0.5,y:Number(mob.y)||0.5,targetId:String(mob.id),
      fiendish:!!mob.fiendish,screen:true,ts:stepTs+900});
  }
  auth.stats.exp+=totalShare;auth.stats.partyExpBonusPct=split.bonusPct;auth.stats.kills++;
  return lootDrops;
}
function usePotion(auth,p){
  const now=Number(auth.clock)||Date.now();
  if(!p||p.hp<=0)return false;
  if((Number(p._potionCd)||0)>now)return false;
  const max=maxStats(p),cfg=p.config||{};
  p.supplies=p.supplies||{};
  const hpPct=max.hp?(p.hp/max.hp)*100:100,mpPct=max.mp?(p.mp/max.mp)*100:100;
  const itemAt=Math.max(1,Math.min(99,Number(cfg.healItemAt!==undefined?cfg.healItemAt:cfg.healAt)||60));
  const manaAt=Math.max(1,Math.min(99,Number(cfg.manaAt)||50));
  const orderOf=(selected,fallback)=>{
    if(selected){
      if(!Object.prototype.hasOwnProperty.call(p.supplies,selected))p.supplies[selected]=0;
      return [selected];
    }
    return fallback.filter((slug)=>Object.prototype.hasOwnProperty.call(p.supplies,slug));
  };
  const drink=(slug)=>{
    const pot=POTIONS[slug];
    if(pot&&(pot.hp||pot.mp)){
      if(!Object.prototype.hasOwnProperty.call(p.supplies,slug))p.supplies[slug]=0;
      if(!potionAllowed(p,slug,pot)||!consumeSupply(auth,p,slug))return false;
      if(pot.hp)p.hp=Math.min(max.hp,p.hp+roll(auth,pot.hp[0],pot.hp[1]));
      if(pot.mp)p.mp=Math.min(max.mp,p.mp+roll(auth,pot.mp[0],pot.mp[1]));
      p._potionCd=now+POTION_CD_MS;return true;
    }
    const rune=runeAsSpell(slug);
    if(rune&&rune.type==="heal"){
      if(Number(rune.lvl||0)>Number(p.level||1))return false;
      if(rune.ml&&Number(p.ml||0)<Number(rune.ml))return false;
      if(!consumeSupply(auth,p,slug))return false;
      p.hp=Math.min(max.hp,p.hp+Math.max(1,rollSpell(auth,p,rune)));
      // UH/IH: no Tibia o exhaust de item (1s) e o mesmo das potions.
      p._potionCd=now+POTION_CD_MS;return true;
    }
    return false;
  };
  if(!cfg.noHealthPotions&&!cfg.noPotions&&hpPct<=itemAt){
    for(const slug of orderOf(cfg.healSupply,HEALTH_POTION_ORDER))if(drink(slug))return true;
  }
  // Magic Shield NÃO bloqueia mana potion: a pool do utamo vita não sobe
  // com potion, mas p.mp sim. Sem isso o mage online fica HP cheio + 0 mana.
  // Só 1 potion de mana: a selecionada no Helper. Sem seleção = não bebe
  // (não cair em mana-potion / cascade automático).
  if(!cfg.noManaPotions&&!cfg.noPotions&&mpPct<=manaAt){
    const selected=cfg.manaSupply;
    if(selected){
      if(!Object.prototype.hasOwnProperty.call(p.supplies,selected))p.supplies[selected]=0;
      if(potionAllowed(p,selected,POTIONS[selected]||{}))drink(selected);
    }
  }
  return false;
}
function healPlayers(auth,now){
  now=Number(now)||auth.clock||Date.now();
  for(const item of auth.players){
    const p=item.p;if(p.hp<=0||item.downUntil)continue;const max=maxStats(p);
    tryMagicShield(auth,item,p,now);
    const dt=Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);
    applyVocationRegenTo(item,p,dt,max);
    const spellAt=Math.max(1,Math.min(99,Number(p.config&&(p.config.healSpellAt!==undefined?p.config.healSpellAt:p.config.healAt))||90));
    const hpPct=max.hp?(p.hp/max.hp)*100:100;
    item.healAcc=(Number(item.healAcc)||0)+dt;
    if(item.healAcc>=1000&&hpPct<=spellAt){
      // Só cura com magia se o Helper tiver healSpell marcado — sem fallback
      // de vocação (exura-vita etc. “de graça”).
      const sid=p.config&&p.config.healSpell;
      const s=sid&&ALL_SPELLS[sid];
      const friendOnly=friendHealSpellIds(p.voc).indexOf(String(sid||""))!==-1||/sio$/.test(String(sid||""));
      if(s&&s.type==="heal"&&!friendOnly&&spellAllowedForVoc(s,p.voc)&&Number(s.lvl||0)<=Number(p.level||1)&&p.mp>=Number(s.mana||0)&&
         !((p._spellCd&&p._spellCd[s.id])>now)&&!spellGroupBusy(p,s,now)){
        const amount=boostHealAmount(auth,p,s,stanceHealAmount(p,rollSpell(auth,p,s)));
        let manaCost=Number(s.mana||0);
        const wh=wheelApplySpellBoost(p,s.id);
        if(wh.manaPct)manaCost=Math.max(0,Math.round(manaCost*(1-wh.manaPct/100)));
        p.mp=Math.max(0,p.mp-manaCost);
        addManaSpent(p,manaCost,auth);
        p.hp=Math.min(max.hp,p.hp+amount);
        startSpellCooldown(p,s,now);
        const pos=playerPosition(auth,p);
        auth.events.push({t:"heal",amount,targetId:String(item.id),spell:s.name,x:pos.x,y:pos.y,screen:true,ts:now});
        auth.events.push({t:"say",text:s.words||s.name,whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
        item.healAcc=0;
      }else{
        usePotion(auth,p);item.healAcc=0;
      }
    }else if(hpPct<=Math.max(20,Number(p.config&&p.config.healItemAt)||60))usePotion(auth,p);
  }
  for(const healer of auth.players){
    const voc=String(healer.p.voc||"");
    if(!/druid|monk/.test(voc)||healer.p.hp<=0||healer.downUntil)continue;
    const nested=healer.p.config&&healer.p.config.healFriend&&healer.p.config.healFriend.spells;
    const spells=Object.assign({},nested||{},(healer.p.config&&healer.p.config.healFriendSpells)||{});
    const order=friendHealSpellIds(healer.p.voc);
    if(!order.length)continue;
    healer.friendHealAcc=(Number(healer.friendHealAcc)||0)+Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);if(healer.friendHealAcc<1000)continue;
    const living=auth.players.filter((x)=>x.p.hp>0&&!x.downUntil);
    for(const sid of order){
      const rule=spells[sid];
      // Sem regra habilitada no Helper: não conjura sio “de emergência”.
      if(!rule||rule.enabled!==true)continue;
      const s=ALL_SPELLS[sid];
      if(!s||!spellAllowedForVoc(s,healer.p.voc)||Number(s.lvl||0)>Number(healer.p.level||1)||healer.p.mp<Number(s.mana||0))continue;
      if((healer.p._spellCd&&healer.p._spellCd[sid])>now||spellGroupBusy(healer.p,s,now))continue;
      const below=Number(rule&&(rule.hpBelow!==undefined?rule.hpBelow:rule.at))||70;
      const hurt=living.filter((x)=>x!==healer&&(x.p.hp/maxStats(x.p).hp)*100<below)
        .sort((a,b)=>a.p.hp/maxStats(a.p).hp-b.p.hp/maxStats(b.p).hp);
      const mass=sid==="exura-gran-mas-res";
      if(!hurt.length||(mass&&hurt.length<(Number(rule&&rule.minTargets)||2)))continue;
      const amount=Math.max(1,rollSpell(auth,healer.p,s));
      healer.p.mp-=Number(s.mana||0);
      addManaSpent(healer.p,s.mana,auth);
      startSpellCooldown(healer.p,s,now);
      const targets=mass?hurt:[hurt[0]];
      for(const target of targets){
        target.p.hp=Math.min(maxStats(target.p).hp,target.p.hp+amount);
        const pos=playerPosition(auth,target.p);
        auth.events.push({t:"heal-friend",amount,targetId:String(target.id),spell:s.name,mass,
          x:pos.x,y:pos.y,screen:true,ts:now});
      }
      const src=playerPosition(auth,healer.p);
      const targetName=String((targets[0]&&targets[0].p&&targets[0].p.name)||"").replace(/"/g,"");
      const sayText=mass?(s.words||s.name):`${s.words||s.name} "${targetName}"`;
      auth.events.push({t:"say",text:sayText,whoId:String(healer.id),x:src.x,y:src.y,screen:true,ts:now});
      healer.friendHealAcc=0;break;
    }
  }
}
function fillGreed(auth){if(!auth.greed||!auth.greed.immune||auth.ended)return;const choices=["dreadful-harvester","soulsnatcher","powerful-soul"];
  while(auth.mobs.filter((m)=>!m.boss&&m.hp>0).length<6){const r=random(auth),slug=r<.60?"greedbeast":choices[Math.min(2,Math.floor(((r-.60)/.40)*3))];
    const mob=makeMob(auth,slug,false);if(!mob)break;auth.mobs.unshift(mob);}}
function hatredMakeSummon(auth,slug){
  const mob=makeMob(auth,slug,false);if(!mob)return null;
  mob.hatredSummon=true;mob.hp=mob.maxHp=slug==="hateful-soul"?50000:15000;mob.exp=0;
  mob.def=Object.assign({},mob.def,{loot:[],exp:0,hp:mob.hp});
  auth.mobs.unshift(mob);return mob;
}
function fillHatred(auth){
  if(!auth.hatred||!auth.hatred.active||auth.ended)return;
  while(auth.mobs.filter((m)=>m.hatredSummon&&m.hp>0).length<5){
    const slug=random(auth)<.10?"hateful-soul":"dreadful-harvester";
    if(!hatredMakeSummon(auth,slug))break;
  }
}
function tickHatred(auth,now){
  if(!auth.hatred)return;
  const st=auth.hatred,boss=(auth.mobs||[]).find((m)=>m.boss&&m.hp>0);
  // Durante BOSS_SPAWN_DELAY_MS o boss fica em arenaBossSpawn.pending — não
  // apagar hatred (senão Dread's Torment nunca ativa após o spawn).
  if(!boss){if(arenaBossSpawnPending(auth))return;auth.hatred=null;return;}
  st.counters=st.counters||{};
  for(const item of auth.players||[])if(st.counters[String(item.id)]===undefined)st.counters[String(item.id)]=0;
  if(!st.active&&now>=(Number(st.nextActivationAt)||0)){
    st.active=true;st.nextCounterAt=now+5000;fillHatred(auth);
    auth.events=auth.events||[];
    auth.events.push({t:"effect",x:Number(boss.x)||.5,y:Number(boss.y)||.5,screen:true,fx:"magic-green",ts:now});
  }
  while(st.active&&now>=st.nextCounterAt){
    for(const item of auth.players||[])if(item.p&&item.p.hp>0&&!item.downUntil)
      st.counters[String(item.id)]=(Number(st.counters[String(item.id)])||0)+1;
    fillHatred(auth);st.nextCounterAt+=5000;
  }
  if(st.active)fillHatred(auth);
}
const SPITE_TRASH=["dreadful-harvester","spiteful-spitter","weeping-soul"];
const SPITE_MAX_TRASH=8,SPITE_TRASH_RESPAWN_MS=15000;
const SPITE_FIRE_INTERVAL=14000,SPITE_FIRE_TIMEOUT=5000,SPITE_FIRE_STOMP_CD=56000,SPITE_FIRE_DEFENSE=10;
const SPITE_HEAL_CHANCE=10,SPITE_HEAL_PCT=10;
const SPITE_QTE_INTERVAL=40000,SPITE_QTE_DURATION=5500,SPITE_QTE_BUBBLES=7,SPITE_QTE_FAIL_MUL=.75;
function spiteMakeTrash(auth,slug){
  const mob=makeMob(auth,slug,false);if(!mob)return null;
  mob.spiteTrash=true;auth.mobs.unshift(mob);return mob;
}
function fillSpiteTrash(auth){
  if(!auth.spite||auth.ended)return;
  while(auth.mobs.filter((m)=>m.spiteTrash&&m.hp>0).length<SPITE_MAX_TRASH){
    const slug=SPITE_TRASH[Math.min(2,Math.floor(random(auth)*3))];
    if(!spiteMakeTrash(auth,slug))break;
  }
}
function spiteApplyDefense(auth){
  const boss=(auth.mobs||[]).find((m)=>m.boss);if(!boss||!boss.def||!auth.spite)return;
  if(boss._spiteBaseArmor===undefined)boss._spiteBaseArmor=Number(boss.def.armor)||0;
  if(boss._spiteBaseDefense===undefined)boss._spiteBaseDefense=Number(boss.def.defense)||0;
  const n=Math.max(0,Number(auth.spite.defenseStacks)||0);
  boss.def.armor=boss._spiteBaseArmor+n*SPITE_FIRE_DEFENSE;
  boss.def.defense=boss._spiteBaseDefense+n*SPITE_FIRE_DEFENSE;
  boss.spiteDefenseStacks=n;
  boss.spiteDamageTakenMul=auth.spite.qtePenalty?SPITE_QTE_FAIL_MUL:1;
}
function spiteStartQte(auth,now){
  const st=auth.spite;if(!st)return;
  st.qtePhase="active";st.qteUntil=now+SPITE_QTE_DURATION;st.bubblesLeft=SPITE_QTE_BUBBLES;
  st.bubbles=Array.from({length:SPITE_QTE_BUBBLES},()=>({
    x:8+Math.floor(random(auth)*84),y:10+Math.floor(random(auth)*70),popped:false}));
  delete st.pendingBubble;delete st.pendingStomp;
  auth.events=auth.events||[];
  auth.events.push({t:"spite-qte",phase:"start",screen:true,ts:now});
}
function spiteResolveQte(auth,success,now){
  const st=auth.spite;if(!st||st.qtePhase!=="active")return;
  st.qtePhase="idle";st.nextQteAt=now+SPITE_QTE_INTERVAL;st.bubbles=[];st.bubblesLeft=0;
  delete st.qteUntil;delete st.pendingBubble;
  st.qtePenalty=!success;
  spiteApplyDefense(auth);
  auth.events=auth.events||[];
  auth.events.push({t:"spite-qte",result:success?"success":"fail",screen:true,ts:now});
}
function spiteAcceptIntents(auth,now){
  const st=auth.spite;if(!st)return;
  if(st.pendingStomp&&st.fire){
    if(!(st.stompReadyAt&&now<st.stompReadyAt)){
      st.fire=null;st.stompReadyAt=now+SPITE_FIRE_STOMP_CD;st.nextFireAt=now+SPITE_FIRE_INTERVAL;
    }
    delete st.pendingStomp;
  }
  if(st.qtePhase==="active"&&st.pendingBubble!==undefined&&st.pendingBubble!==null){
    const idx=Number(st.pendingBubble);delete st.pendingBubble;
    const bubble=st.bubbles&&st.bubbles[idx];
    if(bubble&&!bubble.popped){
      bubble.popped=true;st.bubblesLeft=Math.max(0,(Number(st.bubblesLeft)||0)-1);
      if(st.bubblesLeft<=0)spiteResolveQte(auth,true,now);
    }
  }
}
function tickSpite(auth,now){
  if(!auth.spite)return;
  const st=auth.spite,boss=(auth.mobs||[]).find((m)=>m.boss&&m.hp>0);
  if(!boss){if(arenaBossSpawnPending(auth))return;auth.spite=null;return;}
  spiteAcceptIntents(auth,now);
  st.pendingRespawns=(st.pendingRespawns||[]).filter((job)=>{
    if(now<job.at)return true;
    if(auth.mobs.filter((m)=>m.spiteTrash&&m.hp>0).length<SPITE_MAX_TRASH){
      const slug=SPITE_TRASH[Math.min(2,Math.floor(random(auth)*3))];
      spiteMakeTrash(auth,slug);
    }
    return false;
  });
  fillSpiteTrash(auth);
  if(st.fire&&now>=st.fire.expiresAt){
    st.defenseStacks=(Number(st.defenseStacks)||0)+1;st.fire=null;st.nextFireAt=now+SPITE_FIRE_INTERVAL;
    spiteApplyDefense(auth);
  }else if(!st.fire&&now>=(Number(st.nextFireAt)||0)){
    const pads=["N","W","E","S"];
    st.fire={id:pads[Math.min(3,Math.floor(random(auth)*4))],expiresAt:now+SPITE_FIRE_TIMEOUT};
  }
  if(st.qtePhase==="active"){
    if(now>=st.qteUntil)spiteResolveQte(auth,false,now);
  }else if(now>=(Number(st.nextQteAt)||0))spiteStartQte(auth,now);
  spiteApplyDefense(auth);
}
const MALICE_TRASH=["dreadful-harvester","malicious-soul"];
const MALICE_MAX_TRASH=8,MALICE_TRASH_RESPAWN_MS=20000;
const MALICE_QTE_INTERVAL=30000,MALICE_QTE_DURATION=12000,MALICE_QTE_SIZE=30;
const MALICE_QTE_FAIL_DMG=6000,MALICE_SLIDE_MS=140,MALICE_BLOCK_COUNT=10;
const MALICE_GOAL_MIN_DIST=12;
function maliceMakeTrash(auth,slug){
  const mob=makeMob(auth,slug,false);if(!mob)return null;
  mob.maliceTrash=true;auth.mobs.unshift(mob);return mob;
}
function fillMaliceTrash(auth){
  if(!auth.malice||auth.ended)return;
  while(auth.mobs.filter((m)=>m.maliceTrash&&m.hp>0).length<MALICE_MAX_TRASH){
    const slug=MALICE_TRASH[Math.min(1,Math.floor(random(auth)*2))];
    if(!maliceMakeTrash(auth,slug))break;
  }
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
function maliceRandomBoardPoint(auth,N,avoid,minDist){
  const dist=Math.max(1,Number(minDist)||MALICE_GOAL_MIN_DIST);
  let x=1,y=1,guard=0;
  do{
    x=1+Math.floor(random(auth)*(N-2));
    y=1+Math.floor(random(auth)*(N-2));
    guard++;
  }while(guard<80&&avoid&&(Math.abs(x-avoid.x)+Math.abs(y-avoid.y)<dist));
  if(avoid&&(Math.abs(x-avoid.x)+Math.abs(y-avoid.y)<dist)){
    x=Math.max(1,Math.min(N-2,N-1-avoid.x));
    y=Math.max(1,Math.min(N-2,N-1-avoid.y));
  }
  return{x,y};
}
function maliceBuildMaze(auth){
  const N=MALICE_QTE_SIZE;
  const start=maliceRandomBoardPoint(auth,N,null,0);
  const goal=maliceRandomBoardPoint(auth,N,start,MALICE_GOAL_MIN_DIST);
  const blocks=[],used=new Set();
  for(let i=0;i<MALICE_BLOCK_COUNT;i++){
    let x=1+Math.floor(random(auth)*(N-2)),guard=0;
    while((x===start.x||x===goal.x||used.has(x))&&guard++<40)x=1+Math.floor(random(auth)*(N-2));
    used.add(x);
    const len=2+Math.floor(random(auth)*3);
    const fromTop=random(auth)<.5;
    const dy=fromTop?1:-1;
    const y=fromTop?(-len-Math.floor(random(auth)*12)):(N+Math.floor(random(auth)*12));
    blocks.push({x,y,len,dy});
  }
  return {start,goal,px:start.x,py:start.y,blocks};
}
function maliceSlideBlocks(auth,st){
  let hit=false;
  const N=MALICE_QTE_SIZE;
  for(const b of st.blocks||[]){
    const dy=b.dy===-1?-1:1;
    b.dy=dy;
    b.y+=dy;
    if(b.x===st.px&&st.py>=b.y&&st.py<b.y+(b.len||1))hit=true;
  }
  const forbidden=new Set();
  if(st.start)forbidden.add(st.start.x);
  if(st.goal)forbidden.add(st.goal.x);
  if(Number.isFinite(Number(st.px)))forbidden.add(Number(st.px));
  for(const b of st.blocks||[]){
    const dy=b.dy===-1?-1:1;
    const len=b.len||1;
    const exited=dy>0?(b.y>=N):(b.y+len<=0);
    if(!exited)continue;
    b.dy=random(auth)<.5?1:-1;
    b.y=b.dy>0?(-len-Math.floor(random(auth)*8)):(N+Math.floor(random(auth)*8));
    let x=1+Math.floor(random(auth)*(N-2)),guard=0;
    while(forbidden.has(x)&&guard++<40)x=1+Math.floor(random(auth)*(N-2));
    b.x=x;
  }
  return hit;
}
function maliceApplyCurse(auth,now){
  const dmg=MALICE_QTE_FAIL_DMG;
  auth.events=auth.events||[];
  for(const item of auth.players||[]){
    if(!item||!item.p||item.p.hp<=0||item.downUntil||item.permadead)continue;
    item.p.hp=Math.max(0,item.p.hp-dmg);
    const pos=entityPosition(item,.13,.6);
    auth.events.push({t:"taken",dmg,el:"death",fx:"mort-area",screen:true,
      x:pos.x,y:pos.y,targetId:String(item.id),ts:now});
    if(item.p.hp<=0){
      authMarkPlayerDeath(auth,item,now);
      auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(item.id),
        permadead:!!item.permadead,screen:true,ts:now});
    }
  }
}
function maliceStartQte(auth,now){
  const st=auth.malice;if(!st)return;
  const maze=maliceBuildMaze(auth);
  st.qtePhase="active";st.qteUntil=now+MALICE_QTE_DURATION;
  st.start=maze.start;st.goal=maze.goal;st.px=maze.px;st.py=maze.py;
  st.blocks=maze.blocks;st.nextSlideAt=now+MALICE_SLIDE_MS;
  delete st.pendingMove;st.pendingMoves=[];
  auth.events=auth.events||[];
  auth.events.push({t:"malice-qte",phase:"start",screen:true,ts:now});
}
function maliceResolveQte(auth,success,now){
  const st=auth.malice;if(!st||st.qtePhase!=="active")return;
  st.qtePhase="idle";st.nextQteAt=now+MALICE_QTE_INTERVAL;
  st.blocks=[];delete st.qteUntil;delete st.nextSlideAt;delete st.pendingMove;st.pendingMoves=[];
  if(!success)maliceApplyCurse(auth,now);
  auth.events=auth.events||[];
  auth.events.push({t:"malice-qte",result:success?"success":"fail",screen:true,ts:now});
}
function maliceAcceptIntents(auth,now){
  const st=auth.malice;if(!st||st.qtePhase!=="active")return;
  const queue=Array.isArray(st.pendingMoves)?st.pendingMoves:[];
  if(st.pendingMove){
    queue.unshift({x:Number(st.pendingMove.x),y:Number(st.pendingMove.y)});
    delete st.pendingMove;
  }
  st.pendingMoves=queue;
  while(st.pendingMoves.length){
    const mv=st.pendingMoves.shift();
    const nx=Number(mv&&mv.x),ny=Number(mv&&mv.y);
    if(!Number.isFinite(nx)||!Number.isFinite(ny))continue;
    if(Math.abs(nx-st.px)+Math.abs(ny-st.py)!==1)continue;
    if(maliceCellBlocked(st,nx,ny))continue;
    st.px=nx;st.py=ny;
    if(nx===st.goal.x&&ny===st.goal.y){maliceResolveQte(auth,true,now);return;}
  }
}
function tickMalice(auth,now){
  if(!auth.malice)return;
  const st=auth.malice,boss=(auth.mobs||[]).find((m)=>m.boss&&m.hp>0);
  if(!boss){if(arenaBossSpawnPending(auth))return;auth.malice=null;return;}
  maliceAcceptIntents(auth,now);
  st.pendingRespawns=(st.pendingRespawns||[]).filter((job)=>{
    if(now<job.at)return true;
    if(auth.mobs.filter((m)=>m.maliceTrash&&m.hp>0).length<MALICE_MAX_TRASH){
      const slug=MALICE_TRASH[Math.min(1,Math.floor(random(auth)*2))];
      maliceMakeTrash(auth,slug);
    }
    return false;
  });
  fillMaliceTrash(auth);
  if(st.qtePhase==="active"){
    if(now>=st.qteUntil)maliceResolveQte(auth,false,now);
    else{
      while(st.nextSlideAt&&now>=st.nextSlideAt){
        st.nextSlideAt+=MALICE_SLIDE_MS;
        if(maliceSlideBlocks(auth,st)){maliceResolveQte(auth,false,now);break;}
      }
    }
  }else if(now>=(Number(st.nextQteAt)||0))maliceStartQte(auth,now);
}
const MEGA_BOSS_SPAWN_MS=15000;
const BOSS_SPAWN_DELAY_MS=5000;
function bossArenaSpawnDelayMs(bossId){
  if(String(bossId||"")==="goshnar-s-megalomania")return MEGA_BOSS_SPAWN_MS;
  if(/^world-boss-wz[123]$/.test(String(bossId||""))){
    const n=parseInt(process.env.WB_SPAWN_DELAY_MS||"",10);
    return Number.isFinite(n)&&n>0?n:(process.env.TEST_SERVER==="1"?5000:10000);
  }
  return BOSS_SPAWN_DELAY_MS;
}
function arenaBossSpawnPending(auth){
  return !!(auth&&auth.arenaBossSpawn&&!auth.arenaBossSpawn.spawned&&auth.arenaBossSpawn.pending);
}
function arenaBossDeferSpawn(auth,boss,delayMs){
  if(!auth||!boss)return false;
  const wait=Math.max(0,Number(delayMs)||BOSS_SPAWN_DELAY_MS);
  auth.arenaBossSpawn={at:auth.clock+wait,pending:boss,spawned:false,startedAt:auth.clock,mechanicsBound:false};
  auth.mobs=(auth.mobs||[]).filter((m)=>m!==boss);
  auth.events=auth.events||[];
  auth.events.push({t:"boss-spawn-wait",ms:wait,at:auth.arenaBossSpawn.at,screen:true,ts:auth.clock});
  return true;
}
/* Liga mecânicas só com boss vivo em auth.mobs (pós delay). Mega usa caminho próprio. */
function arenaBossBindMechanics(auth,now){
  if(!auth||!auth.bossId)return false;
  const boss=(auth.mobs||[]).find((m)=>m&&m.boss&&m.hp>0);
  if(!boss)return false;
  if(auth.arenaBossSpawn&&auth.arenaBossSpawn.mechanicsBound)return false;
  if(auth.arenaBossSpawn)auth.arenaBossSpawn.mechanicsBound=true;
  now=Number(now)||auth.clock;
  const players=auth.players||[];
  if(auth.bossId==="goshnar-s-greed"&&!auth.greed){
    auth.greed={immune:true,greedbeastKills:0,vulnerableUntil:0};
    boss.greedImmune=true;fillGreed(auth);
  }
  if(auth.bossId==="goshnar-s-hatred"&&!auth.hatred){
    const delay=20000+Math.min(20000,Math.floor(random(auth)*20001));
    auth.hatred={active:false,nextActivationAt:now+delay,nextCounterAt:0,counters:{}};
    for(const item of players)auth.hatred.counters[String(item.id)]=0;
    boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
  }
  if(auth.bossId==="goshnar-s-spite"&&!auth.spite){
    auth.spite={defenseStacks:0,qtePenalty:false,qtePhase:"idle",
      nextFireAt:now+SPITE_FIRE_INTERVAL,nextQteAt:now+SPITE_QTE_INTERVAL,
      fire:null,stompReadyAt:0,pendingRespawns:[],bubbles:[],bubblesLeft:0};
    boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
    boss._spiteBaseArmor=Number(boss.def&&boss.def.armor)||0;
    boss._spiteBaseDefense=Number(boss.def&&boss.def.defense)||0;
    fillSpiteTrash(auth);spiteApplyDefense(auth);
  }
  if(auth.bossId==="goshnar-s-malice"&&!auth.malice){
    auth.malice={qtePhase:"idle",nextQteAt:now+MALICE_QTE_INTERVAL,
      pendingRespawns:[],blocks:[],px:2,py:14,
      start:{x:2,y:14},goal:{x:27,y:14}};
    boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
    fillMaliceTrash(auth);
  }
  if(auth.bossId==="scarlett-etzel"&&!auth.scarlett){
    auth.scarlett={immune:true,phase:"waiting",nextAt:now+5000+Math.floor(random(auth)*5001),
      thresholdIndex:0,thresholds:[0.75,0.50,0.25]};
    boss.qteImmune=true;
  }
  syncBossImmunityFlags(auth);
  return true;
}
function arenaBossSpawnTick(auth,now){
  if(!arenaBossSpawnPending(auth))return false;
  now=Number(now)||auth.clock;
  const st=auth.arenaBossSpawn;
  // Failsafe: se o pending ficou preso (> delay+25s), força o spawn.
  const started=Number(st.startedAt)||0;
  const overdue=started>0&&now>=started+bossArenaSpawnDelayMs(auth.bossId)+25000;
  if(!overdue&&now<(Number(st.at)||0))return false;
  const boss=st.pending;st.pending=null;st.spawned=true;
  if(boss){
    auth.mobs=auth.mobs||[];auth.mobs.unshift(boss);
    auth.events=auth.events||[];
    auth.events.push({t:"spawn",slug:boss.slug,x:Number(boss.x)||.5,y:Number(boss.y)||.5,
      targetId:String(boss.id||""),screen:true,ts:now});
    arenaBossBindMechanics(auth,now);
  }
  return true;
}
const MEGA_PERSONAL_MIN_MS=10000,MEGA_PERSONAL_MAX_MS=25000;
const MEGA_QTE_TYPES=["scarlett","spite"];
const MEGA_SCARLETT_KEYS=["up","down","left","right"];
const MEGA_SCARLETT_LEAD_MS=1000,MEGA_SCARLETT_NOTE_GAP=560,MEGA_SCARLETT_WINDOW_MS=520;
const MEGA_SPITE_BUBBLES=5,MEGA_SPITE_QTE_MS=5000;
const MEGA_FAIL_DMG_MIN=3000,MEGA_FAIL_DMG_MAX=6000;
const MEGA_FORM={purple:"goshnar-s-megalomania-purple",green:"goshnar-s-megalomania-green",blue:"goshnar-s-megalomania-blue"};
function megaFailDmg(auth){
  return MEGA_FAIL_DMG_MIN+Math.floor(random(auth)*(MEGA_FAIL_DMG_MAX-MEGA_FAIL_DMG_MIN+1));
}
function megaNextPersonalAt(auth,now){
  return now+MEGA_PERSONAL_MIN_MS+Math.floor(random(auth)*(MEGA_PERSONAL_MAX_MS-MEGA_PERSONAL_MIN_MS+1));
}
function megaFormDef(form){
  const slug=MEGA_FORM[form]||MEGA_FORM.green,base=monsterDef(slug);if(!base)return null;
  return Object.assign({},base,{name:"Goshnar's Megalomania"});
}
function megaApplyForm(auth,form,now){
  const st=auth.mega,boss=(auth.mobs||[]).find((m)=>m.boss);if(!st||!boss)return;
  const def=megaFormDef(form);if(!def)return;
  const hpPct=boss.maxHp?boss.hp/boss.maxHp:1;
  boss.slug=MEGA_FORM[form]||MEGA_FORM.green;
  boss.def=Object.assign({},def,{hp:boss.maxHp||def.hp});
  boss.hp=Math.max(1,Math.floor((boss.maxHp||def.hp)*hpPct));
  st.phase=form;st.immune=false;
  boss.qteImmune=false;boss.megaImmune=false;boss.megaPendingSpawn=false;
  auth.events=auth.events||[];
  auth.events.push({t:"effect",x:Number(boss.x)||.5,y:Number(boss.y)||.5,screen:true,fx:"magic-green",ts:now||auth.clock});
}
function megaPersonalSlot(auth,playerId){
  const st=auth.mega;if(!st)return null;
  st.personal=st.personal||{};
  const id=String(playerId);
  if(!st.personal[id])st.personal[id]={nextAt:0,active:null};
  return st.personal[id];
}
function megaEnsurePersonalSchedulers(auth,now){
  const st=auth.mega;if(!st)return;
  for(const item of auth.players||[]){
    if(!item)continue;
    const slot=megaPersonalSlot(auth,item.id);
    if(slot&&!slot.nextAt&&!slot.active)slot.nextAt=megaNextPersonalAt(auth,now);
  }
}
function megaSpawnBoss(auth,now){
  const st=auth.mega;if(!st||st.bossSpawned)return;
  let boss=(auth.mobs||[]).find((m)=>m.boss);
  if(!boss&&st.pendingBoss){
    boss=st.pendingBoss;delete st.pendingBoss;
    auth.mobs=auth.mobs||[];auth.mobs.unshift(boss);
  }
  // Cliente remove o boss de mobs antes do PUT (mega.pendingBoss). Se o
  // pending sumiu no roundtrip, reconstrói a forma green no ponto de spawn.
  if(!boss){
    const slug=MEGA_FORM.green,seed=st._pendingSeed||null;
    boss=makeMob(auth,slug,true,String((seed&&seed.id)||"mega-boss"),seed||undefined);
    if(boss){
      const gw=Number(auth.gridW)||30,gh=Number(auth.gridH)||30;
      if(seed){
        for(const key of ["cx","cy","x","y","sx","sy"])if(seed[key]!==undefined)boss[key]=seed[key];
      }else if(auth.spawnPoints&&auth.spawnPoints[0]){
        const p=auth.spawnPoints[0];boss.cx=Number(p.cx);boss.cy=Number(p.cy);
        boss.x=(boss.cx+.5)/gw;boss.y=(boss.cy+.5)/gh;boss.sx=boss.x;boss.sy=boss.y;
      }
      boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
      auth.mobs=auth.mobs||[];auth.mobs.unshift(boss);
    }
  }
  if(!boss)return;
  boss.maxHp=boss.maxHp||boss.hp||620000;
  megaApplyForm(auth,"green",now);
  st.bossSpawned=true;st.immune=false;delete st._pendingSeed;
  auth.events=auth.events||[];
  auth.events.push({t:"spawn",slug:boss.slug,x:Number(boss.x)||.5,y:Number(boss.y)||.5,screen:true,ts:now});
}
function megaBuildScarlett(auth,now){
  const sequence=Array.from({length:5},()=>MEGA_SCARLETT_KEYS[Math.min(3,Math.floor(random(auth)*4))]);
  return{type:"scarlett",until:now+MEGA_SCARLETT_LEAD_MS+4*MEGA_SCARLETT_NOTE_GAP+MEGA_SCARLETT_WINDOW_MS+400,
    sequence,index:0,
    notes:sequence.map((dir,i)=>({dir,due:now+MEGA_SCARLETT_LEAD_MS+i*MEGA_SCARLETT_NOTE_GAP,hit:false}))};
}
function megaBuildSpite(auth,now){
  const bubbles=Array.from({length:MEGA_SPITE_BUBBLES},(_,i)=>({
    i,x:8+Math.floor(random(auth)*84),y:12+Math.floor(random(auth)*70),popped:false}));
  return{type:"spite",until:now+MEGA_SPITE_QTE_MS,bubbles,bubblesLeft:MEGA_SPITE_BUBBLES};
}
function megaStartPersonal(auth,playerId,now){
  const st=auth.mega;if(!st)return;
  const slot=megaPersonalSlot(auth,playerId);if(!slot||slot.active)return;
  const type=MEGA_QTE_TYPES[Math.min(MEGA_QTE_TYPES.length-1,Math.floor(random(auth)*MEGA_QTE_TYPES.length))];
  slot.active=type==="scarlett"?megaBuildScarlett(auth,now):megaBuildSpite(auth,now);
  slot.nextAt=0;
  auth.events=auth.events||[];
  auth.events.push({t:"mega-qte",phase:"start",kind:type,playerId:String(playerId),screen:true,ts:now});
}
function megaResolvePersonal(auth,playerId,success,now){
  const st=auth.mega;if(!st)return;
  const slot=megaPersonalSlot(auth,playerId);if(!slot||!slot.active)return;
  const kind=slot.active.type;slot.active=null;
  slot.nextAt=megaNextPersonalAt(auth,now);
  if(!success){
    const dmg=megaFailDmg(auth);
    const item=(auth.players||[]).find((p)=>String(p.id)===String(playerId));
    if(item&&item.p&&item.p.hp>0&&!item.downUntil&&!item.permadead){
      item.p.hp=Math.max(0,item.p.hp-dmg);
      const pos=entityPosition(item,.5,.5);
      auth.events=auth.events||[];
      auth.events.push({t:"taken",dmg,el:"death",fx:"mort-area",screen:true,
        x:pos.x,y:pos.y,targetId:String(item.id),ts:now});
      if(item.p.hp<=0)authMarkPlayerDeath(auth,item,now,{permadead:true});
    }
  }
  auth.events=auth.events||[];
  auth.events.push({t:"mega-qte",result:success?"success":"fail",kind,playerId:String(playerId),screen:true,ts:now});
}
function megaAcceptIntents(auth,now){
  const st=auth.mega;if(!st)return;
  const queue=st.pendingIntents||[];
  st.pendingIntents=[];
  for(const intent of queue){
    if(!intent)continue;
    const playerId=String(intent.playerId||(auth.players&&auth.players[0]&&auth.players[0].id)||"");
    if(!playerId)continue;
    const slot=megaPersonalSlot(auth,playerId);if(!slot||!slot.active)continue;
    const act=slot.active;
    if(intent.kind==="scarlett"&&act.type==="scarlett"){
      const note=act.notes&&act.notes[act.index];
      const press=Number(intent.pressAuth)||now;
      if(!note||String(intent.dir)!==String(note.dir)||Math.abs(press-note.due)>MEGA_SCARLETT_WINDOW_MS+320){
        megaResolvePersonal(auth,playerId,false,now);continue;
      }
      note.hit=true;act.index=(act.index||0)+1;
      if(act.index>=(act.sequence||[]).length)megaResolvePersonal(auth,playerId,true,now);
    }else if(intent.kind==="spite"&&act.type==="spite"){
      const idx=Number(intent.bubble);const bubble=(act.bubbles||[])[idx];
      if(!bubble||bubble.popped)continue;
      bubble.popped=true;act.bubblesLeft=Math.max(0,(act.bubblesLeft||1)-1);
      if(act.bubblesLeft<=0)megaResolvePersonal(auth,playerId,true,now);
    }
  }
}
function tickMega(auth,now){
  if(!auth.mega)return;
  const st=auth.mega;
  megaAcceptIntents(auth,now);
  if(!st.bossSpawned){
    if(now>=(Number(st.bossSpawnAt)||0))megaSpawnBoss(auth,now);
  }
  const boss=(auth.mobs||[]).find((m)=>m.boss&&m.hp>0);
  if(st.bossSpawned&&!boss){auth.mega=null;return;}
  megaEnsurePersonalSchedulers(auth,now);
  for(const pid of Object.keys(st.personal||{})){
    const slot=st.personal[pid];if(!slot)continue;
    if(slot.active){
      if(now>=(Number(slot.active.until)||0))megaResolvePersonal(auth,pid,false,now);
    }else if(now>=(Number(slot.nextAt)||0))megaStartPersonal(auth,pid,now);
  }
}
function authIsWorldBoss(auth){
  return !!(auth&&(auth.worldBoss||/^world-boss-wz[123]$/.test(String(auth.bossId||""))));
}
function authIsBossFight(auth){
  return !!(auth&&(auth.kind==="boss"||auth.bossId));
}
/* Marca morte autoritativa: hunt = revive 30s; boss = permadead (sem revive).
 * World Boss (warzone): revive 30s enquanto houver alguém vivo; wipe = fail. */
function authMarkPlayerDeath(auth,item,now,opts){
  opts=opts||{};
  if(!item||!item.p)return false;
  const ts=Number(now)||Number(auth&&auth.clock)||Date.now();
  const wasDown=item.p.hp<=0&&(item.permadead||item.downUntil);
  item.p.hp=0;item.p.blessed=false;
  if(opts.permadead||(authIsBossFight(auth)&&!authIsWorldBoss(auth))){
    item.permadead=true;
    item.downUntil=ts+365*86400000;
  }else{
    item.downUntil=ts+30000;
  }
  if(!item.downedAt)item.downedAt=ts;
  if(!item.deathPos)item.deathPos={x:item.x,y:item.y,dir:item.dir||"e"};
  if(!wasDown)recordAuthSessionDeath(auth,item);
  return true;
}
const SCARLETT_KEYS=["up","down","left","right"];
/* Timing alinhado ao cliente (scarlett-boss.js): lead, gap, janela ±ms e
 * folga online (~1.5×AUTH_STEP + RTT). pressAuth julga o instante do tecla,
 * não o atraso do tick — anti-cheat ainda rejeita pressAuth no futuro. */
const SCARLETT_LEAD_MS=1000,SCARLETT_NOTE_GAP=560,SCARLETT_TIMING_WINDOW=520,SCARLETT_ONLINE_SLACK=320;
function scarlettBuildSequence(auth){
  return Array.from({length:5},()=>SCARLETT_KEYS[Math.min(3,Math.floor(random(auth)*4))]);
}
function scarlettAlivePlayers(auth){
  return (auth.players||[]).filter((item)=>item&&item.p&&item.p.hp>0&&!item.downUntil&&!item.permadead);
}
function scarlettPermanentKill(auth,item,now,reason){
  if(!item||!item.p||item.permadead||item.p.hp<=0)return false;
  authMarkPlayerDeath(auth,item,now,{permadead:true});
  auth.events=auth.events||[];
  auth.events.push({t:"death",whoId:String(item.id),name:item.p.name||"Player",
    reason:reason||"scarlett-qte",permadead:true,screen:true,ts:now||auth.clock});
  return true;
}
function scarlettKillLowestMaxHp(auth,now){
  const alive=scarlettAlivePlayers(auth);
  if(!alive.length)return null;
  const hpMax=(e)=>maxStats(e.p).hp;
  const min=Math.min(...alive.map(hpMax));
  const priority=alive.filter((e)=>hpMax(e)===min);
  const victim=priority[Math.min(priority.length-1,Math.floor(random(auth)*priority.length))];
  scarlettPermanentKill(auth,victim,now,"sequência incorreta");
  return victim;
}
function scarlettStartQte(auth,now){
  const st=auth.scarlett;if(!st)return;
  const sequence=scarlettBuildSequence(auth);
  st.phase="qte";st.immune=true;st.sequence=sequence;st.index=0;
  st.notes=sequence.map((dir,i)=>({dir,due:now+SCARLETT_LEAD_MS+i*SCARLETT_NOTE_GAP,hit:false}));
  st.noteDues=st.notes.map((n)=>n.due);
  st.qteStartedAt=now;
  const last=st.notes[st.notes.length-1];
  st.qteUntil=(last?last.due:now)+SCARLETT_TIMING_WINDOW+SCARLETT_ONLINE_SLACK+200;
  delete st.pendingIntent;
}
function scarlettQteSuccess(auth,now){
  const st=auth.scarlett;if(!st)return;
  st.phase="vulnerable";st.immune=false;st.sequence=[];st.notes=[];st.noteDues=[];st.index=0;
  delete st.pendingIntent;delete st.qteUntil;
  auth.events=auth.events||[];
  auth.events.push({t:"scarlett-qte",result:"success",screen:true,ts:now||auth.clock});
}
function scarlettQteFail(auth,now){
  const st=auth.scarlett;if(!st||st.phase!=="qte")return;
  st.phase="waiting";st.immune=true;st.nextAt=(Number(now)||auth.clock)+3500;
  st.sequence=[];st.notes=[];st.noteDues=[];st.index=0;
  delete st.pendingIntent;delete st.qteUntil;
  const victim=scarlettKillLowestMaxHp(auth,now);
  auth.events=auth.events||[];
  auth.events.push({t:"scarlett-qte",result:"fail",victimId:victim?String(victim.id):null,
    screen:true,ts:now||auth.clock});
  if(!scarlettAlivePlayers(auth).length)fullWipe(auth);
}
function scarlettAcceptIntent(auth,now){
  const st=auth.scarlett;if(!st||st.phase!=="qte"||!st.pendingIntent)return;
  const intent=st.pendingIntent;
  const dir=String(intent.dir||"");
  const note=st.notes&&st.notes[st.index];
  if(!note||SCARLETT_KEYS.indexOf(dir)<0){delete st.pendingIntent;scarlettQteFail(auth,now);return;}
  const window=SCARLETT_TIMING_WINDOW+SCARLETT_ONLINE_SLACK;
  const serverNow=Number(now)||0;
  const rawPress=intent.pressAuth;
  const pressAuth=rawPress==null||rawPress===""?NaN:Number(rawPress);
  // pressAuth do cliente: só confia se for número real e não estiver no futuro.
  const usePress=Number.isFinite(pressAuth)&&pressAuth>0&&pressAuth<=serverNow+80;
  const judgeAt=usePress?pressAuth:serverNow;
  const delta=judgeAt-note.due;
  // Intent chegou cedo demais (tick antes da nota): espera a janela abrir.
  if(delta<-window){
    if(!usePress)return;
    delete st.pendingIntent;scarlettQteFail(auth,now);return;
  }
  delete st.pendingIntent;
  if(dir!==note.dir||delta>window){scarlettQteFail(auth,now);return;}
  note.hit=true;st.index=(Number(st.index)||0)+1;
  if(st.index>=st.notes.length)scarlettQteSuccess(auth,now);
}
function tickScarlett(auth,now){
  if(!auth.scarlett)return;
  const st=auth.scarlett,boss=(auth.mobs||[]).find((m)=>m.boss);
  if(!boss||boss.hp<=0){if(arenaBossSpawnPending(auth))return;auth.scarlett=null;return;}
  // Revive automático não ressuscita mortos da dança nesta luta.
  for(const item of auth.players||[]){
    if(item&&item.permadead){item.p.hp=0;item.downUntil=Math.max(Number(item.downUntil)||0,now+1000);}
  }
  if(st.phase==="waiting"&&now>=st.nextAt)scarlettStartQte(auth,now);
  if(st.phase==="qte"){
    scarlettAcceptIntent(auth,now);
    if(st.phase==="qte"){
      const note=st.notes&&st.notes[st.index];
      if(note&&now>note.due+SCARLETT_TIMING_WINDOW+SCARLETT_ONLINE_SLACK)
        scarlettQteFail(auth,now);
    }
  }
  if(st.phase==="vulnerable"&&st.thresholdIndex<st.thresholds.length){
    const gate=st.thresholds[st.thresholdIndex];
    if(boss.hp/boss.maxHp<=gate){
      boss.hp=Math.max(boss.hp,Math.ceil(boss.maxHp*gate));
      st.thresholdIndex++;st.phase="waiting";st.immune=true;st.nextAt=now+650;
    }
  }
}
function syncBossImmunityFlags(auth){
  for(const m of auth.mobs||[]){
    if(!m.boss){m.greedImmune=false;m.qteImmune=false;m.megaImmune=false;continue;}
    m.greedImmune=!!(auth.greed&&auth.greed.immune);
    m.qteImmune=!!(auth.scarlett&&auth.scarlett.immune)||!!(auth.mega&&auth.mega.immune);
    m.megaImmune=!!(auth.mega&&auth.mega.immune);
  }
}
function tryFerumbrasSummon(auth,mob,now,stepTs){
  if(auth.bossId!=="ferumbras-mortal-shell"||!mob||!mob.boss)return false;
  const living=(auth.mobs||[]).filter((m)=>m.ferumbrasSummon&&m.hp>0).length;
  if(living>=3)return true;
  const add=makeMob(auth,"demon",false);if(!add)return true;
  add.ferumbrasSummon=true;auth.mobs.unshift(add);
  const pos=entityPosition(add,.5,.5);
  auth.events.push({t:"spawn",slug:"demon",x:pos.x,y:pos.y,targetId:String(add.id),screen:true,ts:now||stepTs});
  return true;
}
function ensureSpawnIds(auth){
  const pack=Math.max(1,auth.pack||3);
  if(!Array.isArray(auth.spawnIds))auth.spawnIds=[];
  for(const m of auth.mobs||[]){
    const id=String(m&&m.id||"");
    if(id&&!auth.spawnIds.includes(id))auth.spawnIds.push(id);
  }
  for(const sp of auth.pendingSpawns||[]){
    const id=String(sp&&sp.mob&&sp.mob.id||"");
    if(id&&!auth.spawnIds.includes(id))auth.spawnIds.push(id);
  }
  while(auth.spawnIds.length<pack)auth.spawnIds.push("srv-slot-"+auth.spawnIds.length);
}
function huntWaveSize(auth){
  const hunt=HUNTS[auth&&auth.huntId]||{};
  const cat=String(hunt.cat||"");
  const hard=cat==="hard"||cat==="hardcore";
  const minPack=Number(hunt.packMin)||(hard?6:0);
  const maxPack=Number(hunt.packMax)||(hard?(cat==="hardcore"?12:10):0);
  if(minPack&&maxPack)return minPack+roll(auth,0,maxPack-minPack);
  return Math.max(1,Number(hunt.pack)||Number(auth&&auth.pack)||3);
}
function spawnHuntWave(auth,now,opts){
  opts=opts||{};
  if(!auth||auth.kind==="boss"||auth.ended||auth.greed)return;
  // Pool completo a cada onda: o pool inicial era montado só com os slugs da
  // 1ª leva do cliente e ficava CONGELADO pelo resto da instância — monstro
  // ausente da primeira leva (ex.: paladin-s-apparition na Mirrored
  // Nightmare) nunca mais spawnava, mesmo estando na lista do hunt.
  const hunt=HUNTS[auth.huntId];
  if(hunt&&Array.isArray(hunt.monsters)){
    for(const slug of hunt.monsters){
      if(!auth.spawnPool.includes(slug)&&monsterDef(slug))auth.spawnPool.push(slug);
    }
  }
  const living=(auth.mobs||[]).filter((m)=>m&&m.hp>0);
  if(!opts.force&&(living.length||(auth.pendingSpawns&&auth.pendingSpawns.length)))return;
  auth.mobs=living;
  auth.pendingSpawns=auth.pendingSpawns||[];
  auth.wave=(Number(auth.wave)||0)+1;
  if(!opts.keepPack)auth.pack=huntWaveSize(auth);
  ensureSpawnIds(auth);
  const occupied=new Set(auth.mobs.map((m)=>String(m.id)));
  for(const sp of auth.pendingSpawns)if(sp&&sp.mob&&sp.mob.id)occupied.add(String(sp.mob.id));
  const count=Math.max(1,auth.pack||3);
  now=now||auth.clock;
  for(let i=0;i<count;i++){
    const id=auth.spawnIds[i];if(occupied.has(id)||!auth.spawnPool.length)continue;
    const slug=auth.spawnPool[roll(auth,0,auth.spawnPool.length-1)],m=makeMob(auth,slug,false,id,null,i);
    if(!m)break;
    occupied.add(id);
    auth.pendingSpawns.push({mob:m,cx:m.cx,cy:m.cy,startedAt:now,blink:0,done:false});
  }
}
/* 3 piscadas em ~2s (lead de teleporte). */
const AUTH_SPAWN_BLINK_MS=667,AUTH_SPAWN_BLINKS=3;
/* Tempo até o monstro nascer após limpar a onda. Blink começa em T-2s. */
const AUTH_WAVE_CLEAR_RESPAWN_MS=4000;
const AUTH_WAVE_TELEPORT_LEAD_MS=2000;
function tickAuthSpawnQueue(auth,now){
  if(!auth||!Array.isArray(auth.pendingSpawns)||!auth.pendingSpawns.length)return;
  now=Number(now)||auth.clock;
  auth.events=auth.events||[];
  const gw=Number(auth.gridW)||30,gh=Number(auth.gridH)||30;
  for(const sp of auth.pendingSpawns){
    const elapsed=now-(Number(sp.startedAt)||now);
    if(elapsed<0)continue;
    const due=Math.min(AUTH_SPAWN_BLINKS,Math.floor(elapsed/AUTH_SPAWN_BLINK_MS)+1);
    while((Number(sp.blink)||0)<due){
      sp.blink=(Number(sp.blink)||0)+1;
      auth.events.push({t:"spawn-blink",x:(Number(sp.cx)+.5)/gw,y:(Number(sp.cy)+.5)/gh,
        blink:sp.blink,screen:true,ts:now});
    }
    if(elapsed>=AUTH_SPAWN_BLINKS*AUTH_SPAWN_BLINK_MS&&!sp.done){
      sp.done=true;
      const m=sp.mob;
      m.cx=sp.cx;m.cy=sp.cy;m.x=(m.cx+.5)/gw;m.y=(m.cy+.5)/gh;m.sx=m.x;m.sy=m.y;
      auth.mobs.push(m);
      auth.events.push({t:"spawn",slug:m.slug,x:m.x,y:m.y,targetId:String(m.id),screen:true,ts:now});
    }
  }
  auth.pendingSpawns=auth.pendingSpawns.filter((sp)=>!sp.done);
}
function respawn(auth,now){spawnHuntWave(auth,now,{force:true,keepPack:true});}
function fullWipe(auth){
  // World Boss: wipe só se todos estiverem caídos — encerra a warzone (fail).
  if(authIsWorldBoss(auth)){
    auth.ended=true;auth.terminalReason="party-wipe";return;
  }
  // Boss: wipe = falha da tentativa. Sem bless/retorno à sala — encerra instância.
  if(authIsBossFight(auth)){
    for(const item of auth.players||[]){
      if(!item||!item.p)continue;
      if(item.p.hp<=0||item.downUntil||item.permadead){
        item.permadead=true;item.p.hp=0;
        item.downUntil=Math.max(Number(item.downUntil)||0,(Number(auth.clock)||Date.now())+365*86400000);
      }
    }
    auth.ended=true;auth.terminalReason="party-wipe";return;
  }
  const pvp=auth.instanceMode==="pvp";if(pvp)for(const item of auth.players)applyPvpLoss(item.p,auth.lastDamageSource||"monster");
  const byPlayer={};let cost=0;
  for(const item of auth.players||[]){
    if(!item||!item.p)continue;
    const id=String(item.id);
    const price=blessingPrice(item.p.level);
    byPlayer[id]=(Number(byPlayer[id])||0)+price;
    cost+=price;
  }
  const leader=auth.players[0]&&auth.players[0].p;
  if(leader&&leader.gold>=cost){
    leader.gold-=cost;
    for(const item of auth.players){const max=maxStats(item.p);item.p.hp=max.hp;item.p.mp=max.mp;item.p.blessed=true;item.downUntil=0;item.permadead=false;}
    recordAuthSessionBless(auth,byPlayer);
    auth.events.push({t:"bless",gold:cost,byPlayer:Object.assign({},byPlayer),screen:true,ts:auth.clock});
    auth.wipes++;auth.mobs=[];spawnHuntWave(auth,auth.clock,{force:true});return;}
  auth.ended=true;auth.terminalReason="party-wipe";
}
function chebyshevCells(a,b){
  return Math.max(Math.abs((a&&a.cx||0)-(b&&b.cx||0)),Math.abs((a&&a.cy||0)-(b&&b.cy||0)));
}
/* Passo Canary (creature.cpp getStepDuration): beat 50ms, diagonal ×3,
 * monstro colado ×2. Sem loop de 50ms: o tick de 1s gasta walkAcc nisso. */
const AUTH_SPEED_A=857.36,AUTH_SPEED_B=261.29,AUTH_SPEED_C=-4795.01,AUTH_BEAT=50,AUTH_GROUND=150;
const AUTH_STEP_MS=200;
const AUTH_STEP_DIRS=[{dx:0,dy:-1,diag:false},{dx:1,dy:0,diag:false},{dx:0,dy:1,diag:false},{dx:-1,dy:0,diag:false},
  {dx:1,dy:-1,diag:true},{dx:1,dy:1,diag:true},{dx:-1,dy:1,diag:true},{dx:-1,dy:-1,diag:true}];
function authorityStepSpeed(speed){
  if(!(speed>-AUTH_SPEED_B))return 1;
  return Math.max(1,Math.round(AUTH_SPEED_A*Math.log(speed+AUTH_SPEED_B)+AUTH_SPEED_C));
}
function authorityStepDuration(speed,diagonal,nearby){
  const base=Math.floor(1000*AUTH_GROUND/authorityStepSpeed(Number(speed)||110));
  let d=Math.ceil(base/AUTH_BEAT)*AUTH_BEAT;
  if(diagonal)d*=3;else if(nearby)d*=2;
  return Math.max(AUTH_BEAT,d);
}
function authorityOccupancy(auth,ignore){
  const used=new Set(),w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  const mark=(ent)=>{if(!ent||ent===ignore)return;const c=entityGridCell(ent,auth);
    if(c.cx<0||c.cy<0||c.cx>=w||c.cy>=h)return;used.add(c.cx+":"+c.cy);};
  for(const item of auth.players||[])if(item&&item.p&&item.p.hp>0&&!item.downUntil)mark(item);
  for(const mob of auth.mobs||[])if(mob&&mob.hp>0)mark(mob);
  return used;
}
function authorityStepFree(auth,occ,cx,cy,dir){
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30,nx=cx+dir.dx,ny=cy+dir.dy;
  if(nx<0||ny<0||nx>=w||ny>=h||occ.has(nx+":"+ny)||authorityCellBlocked(auth,nx,ny))return false;
  if(dir.diag&&(occ.has(nx+":"+cy)||occ.has(cx+":"+ny)||
    authorityCellBlocked(auth,nx,cy)||authorityCellBlocked(auth,cx,ny)))return false;
  return true;
}
function authorityStepToward(auth,occ,from,gx,gy){
  const cell=entityGridCell(from,auth),dx=gx-cell.cx,dy=gy-cell.cy;
  if(!dx&&!dy)return null;
  const sx=Math.sign(dx),sy=Math.sign(dy),cand=[];
  if(Math.abs(dx)>=Math.abs(dy)){if(sx)cand.push({dx:sx,dy:0,diag:false});if(sy)cand.push({dx:0,dy:sy,diag:false});}
  else{if(sy)cand.push({dx:0,dy:sy,diag:false});if(sx)cand.push({dx:sx,dy:0,diag:false});}
  if(sx&&sy)cand.push({dx:sx,dy:sy,diag:true});
  if(sx){cand.push({dx:sx,dy:1,diag:true});cand.push({dx:sx,dy:-1,diag:true});}
  if(sy){cand.push({dx:1,dy:sy,diag:true});cand.push({dx:-1,dy:sy,diag:true});}
  for(const dir of cand)if(authorityStepFree(auth,occ,cell.cx,cell.cy,dir))return dir;
  return null;
}
function authorityApplyStep(auth,ent,dir,occ){
  const cell=entityGridCell(ent,auth),nx=cell.cx+dir.dx,ny=cell.cy+dir.dy,w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  occ.delete(cell.cx+":"+cell.cy);ent.cx=nx;ent.cy=ny;ent.x=(nx+.5)/w;ent.y=(ny+.5)/h;ent.sx=ent.x;ent.sy=ent.y;
  // Espelha beginStep do cliente: facing acompanha o passo (sprite + legado).
  if(dir){
    if(dir.dx&&!dir.dy)ent.dir=dir.dx>0?"e":"w";
    else if(dir.dy&&!dir.dx)ent.dir=dir.dy>0?"s":"n";
    else if(dir.dx)ent.dir=dir.dx>0?"e":"w";
  }
  occ.add(nx+":"+ny);
}
function authorityTargetDistance(ent,now){
  if(ent&&ent.forceMeleeUntil&&ent.forceMeleeUntil>(Number(now)||0))return 1;
  const td=Number(ent&&ent.def&&ent.def.targetDistance)||1;
  return td>1?Math.min(3,td):1;
}
function authoritySpeedPts(ent,isPlayer,now){
  if(isPlayer){
    const p=ent&&ent.p;
    let spd=200+gearSpeedBonus(p)+(imbCombatTotals(p).speed||0);
    const hid=hasteActive(p,now);if(hid)spd+=hasteDelta(p,hid);
    return Math.max(10,spd);
  }
  return Number(ent&&((ent.def&&ent.def.speed)||ent.speedPts||ent.speed))||110;
}
function playerAttackRangeSQM(p){
  const profile=playerWeaponProfile(p),it=ITEMS[p&&p.equip&&p.equip.weapon&&p.equip.weapon.item];
  if(profile.type==="distance")return (it&&it.range)?Math.min(7,Number(it.range)):6;
  if(profile.type==="magic")return 6;
  return 1;
}
function huntModeOf(auth,item){
  const m=item&&item.p&&item.p.config?String(item.p.config.attackMode||""):"";
  if(m==="box"||m==="safe")return m;
  const party=auth?String(auth.huntMode||""):"";
  if(party==="box"||party==="safe")return party;
  return m==="kiting"?"kiting":"";
}
function boxCenter(auth){
  const pts=auth&&auth.spawnPoints||[];
  if(pts.length)return {cx:Number(pts[0].cx)||0,cy:Number(pts[0].cy)||0};
  return {cx:Math.floor((Number(auth&&auth.gridW)||30)/2),cy:Math.floor((Number(auth&&auth.gridH)||30)/2)};
}
function boxKnightEnt(auth){
  return (auth.players||[]).find((e)=>e&&e.p&&e.p.hp>0&&!e.downUntil&&/knight/.test(String(e.p.voc||"")))||null;
}
function boxCountMobs(auth,cx,cy,r){
  let n=0;
  for(const m of auth.mobs||[]){
    if(!m||m.hp<=0)continue;
    const c=entityGridCell(m,auth);
    if(Math.max(Math.abs(c.cx-cx),Math.abs(c.cy-cy))<=r)n++;
  }
  return n;
}
function boxCellLivre(auth,cx,cy,occ){
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30;
  if(cx<0||cy<0||cx>=w||cy>=h)return false;
  return !(occ&&occ.has(cx+":"+cy));
}
function knightBoxScore(auth,cell,occ,base){
  const n7=boxCountMobs(auth,cell.cx,cell.cy,7),n1=boxCountMobs(auth,cell.cx,cell.cy,1);
  let livres=0;
  for(const d of AUTH_STEP_DIRS)if(boxCellLivre(auth,cell.cx+d.dx,cell.cy+d.dy,occ))livres++;
  return n7*100+n1*65+livres*35-(Math.abs(cell.cx-base.cx)+Math.abs(cell.cy-base.cy));
}
function boxKnightSpot(auth,occ,base){
  base=base||boxCenter(auth);
  let melhor=null,melhorScore=-Infinity;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const cell={cx:base.cx+dx,cy:base.cy+dy};
    if(occ&&!boxCellLivre(auth,cell.cx,cell.cy,occ))continue;
    const score=knightBoxScore(auth,cell,occ,base);
    if(score>melhorScore){melhorScore=score;melhor=cell;}
  }
  return melhor||{cx:base.cx,cy:base.cy};
}
function adjacentMobs(auth,cell){return boxCountMobs(auth,cell.cx,cell.cy,1);}
function waveLineHits(auth,from,knight){
  if(!knight)return 0;
  const horizontal=from.cx!==knight.cx;
  const sign=horizontal?Math.sign(knight.cx-from.cx):Math.sign(knight.cy-from.cy);
  let hits=0;
  for(const m of auth.mobs||[]){
    if(!m||m.hp<=0)continue;
    const c=entityGridCell(m,auth);
    const forward=horizontal?(c.cx-from.cx)*sign:(c.cy-from.cy)*sign;
    const lateral=horizontal?Math.abs(c.cy-from.cy):Math.abs(c.cx-from.cx);
    if(forward>=1&&forward<=7&&lateral<=1)hits++;
  }
  return hits;
}
function mageBoxScore(auth,cell,knight){
  return boxCountMobs(auth,cell.cx,cell.cy,3)*10+waveLineHits(auth,cell,knight)*28-adjacentMobs(auth,cell)*80;
}
function monkFlurryHits(auth,cell,focus){
  if(!cell||!auth)return 0;
  const dx0=(focus&&focus.cx!=null?focus.cx:cell.cx)-cell.cx;
  const dy0=(focus&&focus.cy!=null?focus.cy:cell.cy)-cell.cy;
  let dir="e";
  if(Math.abs(dx0)>Math.abs(dy0))dir=dx0>=0?"e":"w";
  else if(dy0!==0)dir=dy0>0?"s":"n";
  const area=AREA_DATA&&(AREA_DATA.AREA_FLURRY_OF_BLOWS||AREA_DATA.AREA_GREATER_FLURRY_OF_BLOWS);
  const offs=area&&(area[dir]||area.n);
  if(!offs||!offs.length)return boxCountMobs(auth,cell.cx,cell.cy,1);
  const keys=new Set();
  for(const offset of offs)keys.add((cell.cx+(Number(offset&&offset[0])||0))+":"+(cell.cy+(Number(offset&&offset[1])||0)));
  let n=0;
  for(const m of auth.mobs||[]){
    if(!m||m.hp<=0)continue;
    const c=entityGridCell(m,auth);
    if(keys.has(c.cx+":"+c.cy))n++;
  }
  return n;
}
function monkBoxScore(auth,cell,focus){
  const flurry=monkFlurryHits(auth,cell,focus);
  const perto=boxCountMobs(auth,cell.cx,cell.cy,1);
  const medio=boxCountMobs(auth,cell.cx,cell.cy,2);
  return flurry*100+perto*40+medio*8-(Math.abs(cell.cx-focus.cx)+Math.abs(cell.cy-focus.cy));
}
function boxMonkSpot(auth,occ,base){
  base=base||boxCenter(auth);
  let melhor=null,melhorScore=-Infinity;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const cell={cx:base.cx+dx,cy:base.cy+dy};
    if(occ&&!boxCellLivre(auth,cell.cx,cell.cy,occ))continue;
    const score=monkBoxScore(auth,cell,base);
    if(score>melhorScore){melhorScore=score;melhor=cell;}
  }
  return melhor||{cx:base.cx,cy:base.cy};
}
function boxTargetCell(auth,item,occ){
  const p=item&&item.p;if(!p)return null;
  const voc=String(p.voc||""),centro=boxCenter(auth),knight=boxKnightEnt(auth);
  const base=knight?entityGridCell(knight,auth):centro;
  if(/knight/.test(voc))return boxKnightSpot(auth,occ,base);
  if(/monk/.test(voc))return boxMonkSpot(auth,occ,base);
  const distancia=/paladin/.test(voc)?2:3;
  const retas=[
    {cx:base.cx+distancia,cy:base.cy},{cx:base.cx-distancia,cy:base.cy},
    {cx:base.cx,cy:base.cy+distancia},{cx:base.cx,cy:base.cy-distancia}];
  let melhor=null,scoreMelhor=-Infinity;
  for(const r of retas){
    if(!boxCellLivre(auth,r.cx,r.cy,occ))continue;
    const score=distancia===2?boxCountMobs(auth,r.cx,r.cy,6)*12-adjacentMobs(auth,r)*35:mageBoxScore(auth,r,base);
    if(score>scoreMelhor){scoreMelhor=score;melhor=r;}
  }
  return melhor||retas.find((r)=>boxCellLivre(auth,r.cx,r.cy,occ))||base;
}
function boxTargetScore(auth,item,cell,occ){
  if(!cell||!item||!item.p)return -Infinity;
  const knight=boxKnightEnt(auth),base=knight?entityGridCell(knight,auth):boxCenter(auth);
  const voc=String(item.p.voc||"");
  if(/knight/.test(voc))return knightBoxScore(auth,cell,occ,base);
  if(/monk/.test(voc))return monkBoxScore(auth,cell,base);
  if(/paladin/.test(voc))return boxCountMobs(auth,cell.cx,cell.cy,6)*12-adjacentMobs(auth,cell)*35;
  return mageBoxScore(auth,cell,base);
}
function safeTargetCell(auth,item,occ){
  const w=Number(auth.gridW)||30,h=Number(auth.gridH)||30,centro=boxCenter(auth);
  const cantos=[{cx:2,cy:2},{cx:w-3,cy:2},{cx:2,cy:h-3},{cx:w-3,cy:h-3}];
  let melhor=null,melhorN=-1,melhorDist=-1;
  for(const q of cantos){
    if(!boxCellLivre(auth,q.cx,q.cy,occ))continue;
    const n=boxCountMobs(auth,q.cx,q.cy,7);
    const dist=Math.max(Math.abs(q.cx-centro.cx),Math.abs(q.cy-centro.cy));
    if(n>melhorN||(n===melhorN&&dist>melhorDist)){melhorN=n;melhorDist=dist;melhor=q;}
  }
  if(!melhor){
    for(let r=1;r<=4;r++)for(const q of cantos)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
      const cx=q.cx+dx,cy=q.cy+dy;
      if(boxCellLivre(auth,cx,cy,occ))return {cx,cy};
    }
    return {cx:2,cy:2};
  }
  return melhor;
}
function formationReservations(auth){
  if(!auth._formationReservations||typeof auth._formationReservations!=="object"||Array.isArray(auth._formationReservations))
    auth._formationReservations={};
  return auth._formationReservations;
}
function pickFormationCell(auth,item,now,targetFn){
  if(!item._boxAt||now-item._boxAt>1800){
    item._boxAt=now;
    const planning=authorityOccupancy(auth,item);
    const reserved=formationReservations(auth);
    delete reserved[String(item.id)];
    for(const cell of Object.values(reserved))if(cell)planning.add(cell.cx+":"+cell.cy);
    const candidato=targetFn(auth,item,planning);
    const scored=targetFn===boxTargetCell;
    const novo=scored?boxTargetScore(auth,item,candidato,planning):0;
    const atual=scored?boxTargetScore(auth,item,item._boxTarget,planning):-Infinity;
    if(!item._boxTarget||novo>=atual*1.20)item._boxTarget=candidato;
    if(item._boxTarget)reserved[String(item.id)]=item._boxTarget;
  }
  return item._boxTarget;
}
function authorityStepAway(auth,occ,from,awayFrom){
  const cell=entityGridCell(from,auth),other=entityGridCell(awayFrom,auth);
  const dx=Math.sign(cell.cx-other.cx)||1,dy=Math.sign(cell.cy-other.cy)||0;
  const cand=[{dx,dy,diag:!!(dx&&dy)},{dx,dy:0,diag:false},{dx:0,dy,diag:false}];
  for(const dir of cand)if((dir.dx||dir.dy)&&authorityStepFree(auth,occ,cell.cx,cell.cy,dir))return dir;
  return null;
}
/* Perseguição Canary dentro do tick de 1s: monstros rápidos dão mais SQMs
 * que os lentos (stagger por speed), respeitam targetDistance e não entram
 * no mesmo tile. BOX/SAFE posicionam por vocação; kiting mantém a distância. */
function advanceAuthorityMovement(auth,now,opts){
  const livingPlayers=(auth.players||[]).filter((item)=>item&&item.p&&item.p.hp>0&&!item.downUntil);
  const livingMobs=(auth.mobs||[]).filter((m)=>m&&m.hp>0);
  if(!livingPlayers.length)return;
  const occ=authorityOccupancy(auth);
  const walkToward=(ent,gx,gy,td,isPlayer)=>{
    const dt=Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);
    ent.walkAcc=Number(ent.walkAcc)||(Math.abs(Number(ent.id)||0)%180);
    ent.walkAcc+=dt;
    ent.walkStepsWindow=ent.walkStepsWindow&&typeof ent.walkStepsWindow==="object"?ent.walkStepsWindow:{at:0,n:0};
    if(now-ent.walkStepsWindow.at>=1000){ent.walkStepsWindow={at:now,n:0};}
    let steps=0;
    while(ent.walkAcc>=80&&steps<1&&ent.walkStepsWindow.n<1){
      const here=entityGridCell(ent,auth),d=chebyshevCells(here,{cx:gx,cy:gy});
      let dir=null;
      if(d>td)dir=authorityStepToward(auth,occ,ent,gx,gy);
      else if(d<td)dir=authorityStepAway(auth,occ,ent,{cx:gx,cy:gy});
      const nearby=d<=1,dur=authorityStepDuration(authoritySpeedPts(ent,isPlayer,now),!!(dir&&dir.diag),nearby);
      if(!dir){ent.walkAcc=Math.min(ent.walkAcc,dur);break;}
      if(ent.walkAcc<dur)break;
      authorityApplyStep(auth,ent,dir,occ);ent.walkAcc-=dur;steps++;ent.walkStepsWindow.n++;
    }
  };
  if(!(opts&&opts.freezePlayers))for(const item of livingPlayers){
    // Manual SQM/WASD exige VIP; sem VIP a autoridade força AUTO.
    if(item.p&&!accountIsVip(item.p)){
      item.p.config=item.p.config||{};item.p.config.autoWalk=true;delete item.walkIntent;
    }
    const auto=!(item.p&&item.p.config)||item.p.config.autoWalk!==false;
    if(!auto){
      const intent=item.walkIntent,dir=intent&&AUTH_STEP_DIRS.find((d)=>d.dx===intent.dx&&d.dy===intent.dy);
      if(dir){
        const dt=Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);
        item.walkAcc=Number(item.walkAcc)||0;item.walkAcc+=dt;
        const here=entityGridCell(item,auth);
        const dur=authorityStepDuration(authoritySpeedPts(item,true,now),!!dir.diag,false);
        if(authorityStepFree(auth,occ,here.cx,here.cy,dir)&&item.walkAcc>=dur){
          authorityApplyStep(auth,item,dir,occ);item.walkAcc-=dur;
        }else item.walkAcc=Math.min(item.walkAcc,dur);
      }
      continue;
    }
    const mode=huntModeOf(auth,item);
    if(mode==="box"||mode==="safe"){
      const alvo=pickFormationCell(auth,item,now,mode==="box"?boxTargetCell:safeTargetCell);
      if(alvo){
        const here=entityGridCell(item,auth);
        if(here.cx!==alvo.cx||here.cy!==alvo.cy)walkToward(item,alvo.cx,alvo.cy,0,true);
        else{
          // Parado no BOX: facing para o foco da formação (knight/pack),
          // para waves/flurry saírem da frente do caster — não do monstro.
          const knight=boxKnightEnt(auth);
          const focus=knight&&item!==knight?entityGridCell(knight,auth)
            :(authorityPlayerTarget(auth,item,livingMobs)||densestPackTarget(auth,item,livingMobs)||livingMobs[0]);
          if(focus){
            const fc=focus.cx!=null?focus:entityGridCell(focus,auth);
            const dx=fc.cx-here.cx,dy=fc.cy-here.cy;
            if(Math.abs(dx)>Math.abs(dy))item.dir=dx>=0?"e":"w";
            else if(dy!==0)item.dir=dy>0?"s":"n";
          }
        }
      }
      continue;
    }
    const goal=authorityPlayerTarget(auth,item,livingMobs)||densestPackTarget(auth,item,livingMobs)||livingMobs.slice().sort((a,b)=>authorityVisualDistance(item,a,auth)-authorityVisualDistance(item,b,auth))[0];
    if(!goal)continue;
    const alcance=playerAttackRangeSQM(item.p);
    const here=entityGridCell(item,auth),to=entityGridCell(goal,auth),dist=chebyshevCells(here,to);
    if(mode==="kiting"&&alcance>1){
      const querido=Math.max(1,Math.min(alcance,Number(item.p.config&&item.p.config.kiteDistance)||3));
      if(dist!==querido)walkToward(item,to.cx,to.cy,querido,true);
    }else if(dist>alcance)walkToward(item,to.cx,to.cy,alcance,true);
    else{
      // Já no alcance do singleton: se há pack denso a poucos SQMs, anda
      // até a box em vez de queimar CD de SD/exori no isolado.
      const opp=packOpportunity(auth,item,livingMobs);
      if(opp.density>=2&&opp.mob&&opp.dist<=PACK_SEARCH_R){
        const packCell=entityGridCell(opp.mob,auth);
        const packDist=chebyshevCells(here,packCell);
        const hereDens=boxCountMobs(auth,here.cx,here.cy,PACK_CLUSTER_R);
        if(packDist>0&&opp.density>=hereDens+2)walkToward(item,packCell.cx,packCell.cy,Math.min(alcance,1),true);
      }
    }
  }
  for(const mob of livingMobs){
    const victim=authorityMobTarget(auth,mob);if(!victim)continue;
    // Sem rota (hasFollowPath=false) o Canary não insiste no follow — vagueia
    // / espera retarget. Evita softlock no greedy contra parede.
    if(mob._hasFollowPath===false&&!authorityMobCanAttack(auth,mob,victim))continue;
    const to=entityGridCell(victim,auth),td=authorityTargetDistance(mob,now);
    const here=entityGridCell(mob,auth),d=chebyshevCells(here,to);
    if(d>td){
      // Preferir 1º passo do A* (como stepToward do cliente) antes do greedy.
      const via=authorityFindPathStep(auth,mob,to.cx,to.cy,occ,mob);
      if(via){
        const dt=Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);
        mob.walkAcc=Number(mob.walkAcc)||(Math.abs(Number(mob.id)||0)%180);
        mob.walkAcc+=dt;
        mob.walkStepsWindow=mob.walkStepsWindow&&typeof mob.walkStepsWindow==="object"?mob.walkStepsWindow:{at:0,n:0};
        if(now-mob.walkStepsWindow.at>=1000){mob.walkStepsWindow={at:now,n:0};}
        const nearby=d<=1,dur=authorityStepDuration(authoritySpeedPts(mob,false,now),!!via.diag,nearby);
        if(mob.walkStepsWindow.n<1&&mob.walkAcc>=dur&&authorityStepFree(auth,occ,here.cx,here.cy,via)){
          authorityApplyStep(auth,mob,via,occ);mob.walkAcc-=dur;mob.walkStepsWindow.n++;
        }else mob.walkAcc=Math.min(mob.walkAcc,dur);
        continue;
      }
    }
    walkToward(mob,to.cx,to.cy,td,false);
  }
}
function challengeWallUntil(until,clock){
  const left=Number(until)||0,now=Number(clock)||0;
  if(left<=now)return 0;
  return Date.now()+(left-now);
}
function doChallengeCast(auth,item,p,now,id,s,living){
  const amp=id==="exeta-amp-res",range=Number(s.range)||7,origin=entityGridCell(item,auth),pos=playerPosition(auth,p);
  const casterId=String(item.id);
  let marcou=0;
  for(const m of living){
    if(chebyshevCells(origin,entityGridCell(m,auth))>range)continue;
    m.challengedUntil=now+10000;
    m.challengeTargetId=casterId;
    m.targetId=casterId;
    // Chivalrous Challenge força melee em todo marcado, inclusive quem já
    // luta corpo-a-corpo (no-op de distância) e quem só é ranged no MOVDATA.
    if(amp)m.forceMeleeUntil=now+10000;
    const mp=entityPosition(m,.5,.5);
    auth.events.push({t:"challenge-target",x:mp.x,y:mp.y,screen:true,amp:amp,targetId:String(m.id),whoId:casterId,ts:now});
    marcou++;
  }
  if(!marcou)return false;
  p.mp=Math.max(0,p.mp-Number(s.mana||0));
  p._spellCd=p._spellCd||{};p._spellCd[id]=now+Number(s.cd||2000);
  if(s.grupos){p._groupCd=p._groupCd||{};
    for(const g of Object.keys(s.grupos))p._groupCd[g]=now+Number(s.grupos[g]||s.cd||2000);}
  auth.events.push({t:"challenge",x:pos.x,y:pos.y,screen:true,count:marcou,spell:s.name,id:id,whoId:String(item.id),ts:now});
  auth.events.push({t:"say",text:s.words||(amp?"exeta amp res":"exeta res"),whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
  return true;
}
function tryChallenge(auth,item,p,now){
  if(!p||(p.voc!=="knight"&&p.voc!=="elite knight"))return false;
  const cfg=p.config||{},boxForca=cfg.attackMode==="box";
  const useAmp=!!cfg.exetaAmpRes||boxForca,useRes=!!cfg.exetaRes||boxForca;
  if(!useAmp&&!useRes)return false;
  const living=(auth.mobs||[]).filter((m)=>m&&m.hp>0);
  if(!living.length)return false;
  const ids=useAmp?[ "exeta-amp-res", useRes?"exeta-res":null ]:[ "exeta-res" ];
  for(const id of ids){
    if(!id)continue;
    const s=ALL_SPELLS[id];if(!s)continue;
    if(Number(s.lvl||0)>Number(p.level||1))continue;
    if(Number(s.mana||0)>Number(p.mp||0))continue;
    if((p._spellCd&&p._spellCd[id])>now)continue;
    if(s.grupos){p._groupCd=p._groupCd||{};
      let busy=false;for(const g of Object.keys(s.grupos))if((p._groupCd[g]||0)>now)busy=true;
      if(busy)continue;}
    if(doChallengeCast(auth,item,p,now,id,s,living))return true;
  }
  return false;
}
function tryCastSupport(auth,item,p,now,id){
  const s=ALL_SPELLS[id];if(!s)return null;
  if(!spellAllowedForVoc(s,p.voc))return null;
  if(Number(s.lvl||0)>Number(p.level||1))return null;
  if(Number(s.mana||0)>Number(p.mp||0))return null;
  if((p._spellCd&&p._spellCd[id])>now)return null;
  if(spellGroupBusy(p,s,now))return null;
  p.mp=Math.max(0,p.mp-Number(s.mana||0));
  addManaSpent(p,s.mana,auth);
  startSpellCooldown(p,s,now);
  const pos=playerPosition(auth,p);
  auth.events.push({t:"say",text:s.words||s.name,whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
  return s;
}
function tryHaste(auth,item,p,now){
  const cfg=p.config||{};
  if(cfg.autoHaste===false)return false;
  const id=cfg.hasteSpell;if(!id||!HASTEDATA[id]||!ALL_SPELLS[id])return false;
  if(hasteActive(p,now))return false;
  const s=tryCastSupport(auth,item,p,now,id);if(!s)return false;
  p.buffs=p.buffs||{};p.buffs[id]=now+(HASTEDATA[id].dur||30000);
  const pos=playerPosition(auth,p);
  auth.events.push({t:"buff",nome:HASTEDATA[id].nome||s.name,whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
  return true;
}
function tryBuff(auth,item,p,now){
  const id=p.config&&p.config.buff;if(!id||!BUFFS[id])return false;
  if(p.buffs&&Number(p.buffs[id])>now)return false;
  const s=tryCastSupport(auth,item,p,now,id);if(!s)return false;
  const b=BUFFS[id];p.buffs=p.buffs||{};
  if(b.grupo==="virtue"){
    for(const k of Object.keys(BUFFS))if(BUFFS[k].grupo==="virtue"&&k!==id)delete p.buffs[k];
  }
  p.buffs[id]=now+(b.dur||30000);
  const pos=playerPosition(auth,p);
  auth.events.push({t:"buff",nome:b.nome,whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
  return true;
}
function tryCureCondition(auth,item,p,now){
  if(!p.config||!p.config.autoCure)return false;
  if(!p.conditions)return false;
  for(const tipo of CURE_ORDEM){
    if(!p.conditions[tipo])continue;
    const cure=CONDITIONS[tipo]&&CONDITIONS[tipo].cure;if(!cure)continue;
    const s=tryCastSupport(auth,item,p,now,cure);if(!s)continue;
    delete p.conditions[tipo];
    const pos=playerPosition(auth,p);
    auth.events.push({t:"cured",tipo,nome:s.name,whoId:String(item.id),x:pos.x,y:pos.y,screen:true,ts:now});
    return true;
  }
  return false;
}
function tickDelayedHits(auth,now){
  const pending=auth.delayedHits||[];auth.delayedHits=[];
  for(const h of pending){
    if(h.at>now){auth.delayedHits.push(h);continue;}
    const mob=(auth.mobs||[]).find((m)=>String(m.id)===String(h.mobId));
    if(!mob||!(mob.hp>0)||mob.greedImmune||mob.qteImmune)continue;
    const who=(auth.players||[]).find((x)=>String(x.id)===String(h.whoId));
    let dmg=Math.max(1,Number(h.dmg)||0);
    dmg=applyOutgoingDamage(mob,h.el||"death",dmg,now);
    if(dmg>0){
      mob.hp-=dmg;if(who&&who.p)applyOutgoingLeech(who.p,dmg);
      const pos=entityPosition(mob,.5,.5);
      auth.events.push({t:"hit",dmg,el:h.el||"death",fx:h.fx||"death-echo-effect",
        x:pos.x,y:pos.y,race:mob.def&&mob.def.race||"blood",mobId:String(mob.id),targetId:String(mob.id),
        mobSlug:mob.slug,whoId:String(h.whoId||""),echo:1,screen:true,ts:now});
    }
  }
}
function monsterThinkYell(auth,mob,now){
  const v=mob&&mob.def&&mob.def.voices;
  if(!v||!Array.isArray(v.list)||!v.list.length)return;
  const intervalo=Number(v.int)||5000;
  mob.yellTicks=(Number(mob.yellTicks)||0)+Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);
  if(mob.yellTicks<intervalo)return;
  mob.yellTicks=0;
  if((Number(v.ch)||0)<Math.floor(random(auth)*100)+1)return;
  const fala=v.list[Math.floor(random(auth)*v.list.length)];
  if(!fala||!fala.t)return;
  const pos=entityPosition(mob,.5,.5);
  auth.events.push({t:"say",text:String(fala.t),whoId:String(mob.id),yell:!!fala.y,
    x:pos.x,y:pos.y,screen:true,monster:true,ts:now});
}
function tryUseRune(auth,item,p,now,id,primary,living,visualTs){
  if(!runeUsable(p,id,now)||!primary||primary.hp<=0)return false;
  const rd=RUNEDATA[id];if(!rd||!consumeSupply(auth,p,id))return false;
  const cd=Number(rd.cd||rd.gcd||2000);
  p._runeCd=now+cd;p._offensiveCd=now+2000;p._lastRuneId=id;p._groupCd=p._groupCd||{};
  const group=String(rd.grupo||rd.group||"1");p._groupCd[group]=now+Number(rd.gcd||2000);p._groupCd["1"]=Math.max(p._groupCd["1"]||0,now+2000);
  const el=rd.element||"physical",fx=rd.fx||ELEMENT_FX[el]||ELEMENT_FX.physical,missile=rd.missile||ELEMENT_MISSILE[el]||"energy";
  const fake={id,area:rd.areaNome,needTarget:!!rd.needTarget};
  const areaCells=rd.areaNome?spellAreaCells(auth,fake,item,primary):[];
  let targets=areaCells.length?spellAreaTargets(auth,fake,item,primary,living):[primary];
  if(!targets.length)targets=[primary];
  const f=rd.f,level=Number(p.level)||1,ml=(Number(p.ml)||0)+gearSkillBonus(p,"mag");
  let lo=4,hi=8;
  if(f&&f.modo==="magic"){
    lo=(f.lvlMin||0)*level+(f.mlMin||0)*ml+(f.flatMin||0);
    hi=(f.lvlMax||0)*level+(f.mlMax||0)*ml+(f.flatMax||0);
  }else if(f){
    const skill=playerSkill(p);
    lo=(f.saMin||0)*skill*40+(f.lvlMin||0)*level+(f.flatMin||0);
    hi=(f.saMax||0)*skill*40+(f.lvlMax||0)*level+(f.flatMax||0);
  }
  lo=Math.max(0,lo);hi=Math.max(lo,hi);
  const source=playerPosition(auth,p);
  /* Crit/Fatal da runa: um roll por uso — em área (GFB/avalanche…) vale
   * para todos os alvos desta explosão. */
  const rolled=rollPlayerCrit(auth,p);
  const transPct=forgeTranscendenceDamagePct(p,now);
  const isCrit=!!(rolled.crit||transPct);
  const isFatal=forgeRollOnslaught(auth,p);
  let runeExtra=0;
  if(rolled.crit)runeExtra+=rolled.extraPct;
  if(transPct>0)runeExtra+=transPct;
  if(isFatal)runeExtra+=FORGE_ONSLAUGHT_BONUS_PCT;
  let hitN=0;
  for(const tgt of targets){
    if(!tgt||tgt.hp<=0||tgt.greedImmune||tgt.qteImmune)continue;
    let raw=Math.max(1,roll(auth,Math.floor(lo),Math.floor(hi)));
    if(runeExtra)raw=Math.max(1,Math.floor(raw*(1+runeExtra/100)));
    const dmg=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,raw,now),now);
    if(dmg>0){tgt.hp-=dmg;afterPlayerHit(auth,p,tgt,dmg,now);
      const pos=entityPosition(tgt,.5,.5);
      auth.events.push({t:"hit",dmg,el,fx,projectile:tgt===primary,missile:tgt===primary?missile:null,rune:rd.nome||id,
        crit:isCrit,fatal:isFatal,
        x:pos.x,y:pos.y,race:tgt.def&&tgt.def.race||"blood",mobId:String(tgt.id),targetId:String(tgt.id),
        mobSlug:tgt.slug,whoId:String(item.id),sx:source.x,sy:source.y,ts:visualTs+hitN*20});}
    if(rd.cond)applyCondition(tgt,rd.cond.tipo||rd.cond,rd.cond.dano||Math.max(1,Math.floor(lo*.1)),rd.cond.golpes||4);
    stanceApplyDebuffs(p,tgt,now);hitN++;
  }
  if(areaCells.length>1)auth.events.push({t:"areafx",cells:areaCells,fx,spell:rd.nome||id,screen:true,ts:visualTs+20,
    whoId:String(item.id),base:entityGridCell(item,auth)});
  auth.events.push({t:"say",text:String(rd.nome||id).toLowerCase(),whoId:String(item.id),x:source.x,y:source.y,screen:true,ts:visualTs+40});
  return true;
}
function step(auth,now,opts){if(auth.ended)return;
  const dt=Math.max(1,Number(opts&&opts.dt)||AUTH_STEP_MS);
  auth._stepDt=dt;
  auth.stats=auth.stats||{};auth.stats.time=(Number(auth.stats.time)||0)+dt;
  auth.events=auth.events||[];
  // Timestamp base do step: o cliente espaça floaters deste intervalo, não
  // de um segundo inteiro acumulado.
  const stepTs=Number(now)||Date.now();
  if(auth.greed){if(!auth.greed.immune&&now>=auth.greed.vulnerableUntil){auth.greed.immune=true;auth.greed.vulnerableUntil=0;}
    if(auth.greed.immune)fillGreed(auth);}
  // Spawn adiado antes das mecânicas — Hatred/Spite/Malice precisam do boss em mobs.
  arenaBossSpawnTick(auth,now);
  tickHatred(auth,now);tickScarlett(auth,now);tickSpite(auth,now);tickMalice(auth,now);tickMega(auth,now);
  syncBossImmunityFlags(auth);
  soulwarTaintTick(auth,dt,now);
  tickDelayedHits(auth,now);
  for(const item of auth.players){
    const p=item.p;p.stamina=FULL_STAMINA;
    if(item.downUntil&&now>=item.downUntil){
      if(item.permadead||authIsBossFight(auth)){
        item.permadead=true;p.hp=0;
        item.downUntil=now+365*86400000;
      }else{
        const max=maxStats(p);p.hp=max.hp;p.mp=max.mp;item.downUntil=0;p.conditions={};
      }
    }
    if(p.hp>0&&!item.downUntil)usePotion(auth,p);
    tickPlayerConditions(auth,p,item);
  }
  for(const mob of auth.mobs||[])tickEntityConditions(auth,mob,"mob");
  healPlayers(auth,now);
  for(const item of auth.players){
    if(item.p.hp<=0||item.downUntil)continue;
    tryCureCondition(auth,item,item.p,now);
    tryHaste(auth,item,item.p,now);
    tryBuff(auth,item,item.p,now);
    tryChallenge(auth,item,item.p,now);
    tickAccessoryCharges(auth,item.p,dt,now);
    tryAccessoryHelper(auth,item.p,now);
    tryAuthAutoSell(auth,item,now);
  }
  /* ---------- ATAQUE DOS PLAYERS ---------- */
  for(const item of auth.players){
    if(item.p.hp<=0||item.downUntil)continue;
    const living=combatLivingFor(auth,item);
    if(!living.length)continue;
    item.attackAcc+=dt;
    const p=item.p,interval=playerAttackInterval(p,now);
    let hitIdx=0; // index do hit dentro do step (para espaçar floaters)
    const comboOn=Array.isArray(p.config&&p.config.combo)&&p.config.combo.some((slot)=>slot&&slot.id);
    // Combo da barra na ordem, respeitando CD/mana reais — não a spell de maior DPS.
    while(item.attackAcc>=interval){
      const primaryTarget=authorityPlayerTarget(auth,item,living);
      if(!primaryTarget||primaryTarget.hp<=0)break;
      const visualTs=swingVisualTs(stepTs,dt,item.attackAcc,interval,hitIdx);
      item.attackAcc-=interval;
      forgeNoteCombatAction(auth,item,p,now,{offensive:true});
      let acted=false;
      const s=nextComboSpell(auth,item,p,now,primaryTarget,living);
      if(s&&s.rune){
        acted=tryUseRune(auth,item,p,now,s.id,primaryTarget,living,visualTs);
      }else if(s){
            const areaName=spellAreaName(s);
            // Waves/beams/flurry: virar para o alvo antes da matriz (sprite).
            if(areaName&&spellAreaFromCaster(areaName,s))faceTowardCell(item,primaryTarget,auth);
            const areaCells=areaName?spellAreaCells(auth,s,item,primaryTarget):[];
            const md=MONKSPELLDATA[s.id];
            const echoFrac=Number(s.echo)||Number(md&&md.echo)||0;
            const targets=(areaName||Number(s.chain)>1||(md&&md.chain)||(md&&md.area))?spellAreaTargets(auth,s,item,primaryTarget,living):[primaryTarget];
            // Self/caster AoE (mas san, UE, waves…): zero vivo na matriz = não gasta mana/CD.
            const metaCast=SPELL_TARGET[String(s.id||"")]||{};
            const fromCasterAoE=!!(areaName&&(metaCast.self||spellAreaFromCaster(areaName,s)));
            if(fromCasterAoE&&(!targets||!targets.length)){
              // deixa cair em runa Helper / basic attack
            }else{
            const originalEl=s.element||"physical";
            let el=monkSpellElement(p,s,originalEl);el=stanceConvert(p,el);
            const kind=monkSpellKind(s.id);let monkMult=1;
            if(kind==="spender")monkMult=harmonyBonus(p);
            const stOut=stanceTotals(p);
            const elPct=stOut.elemPct[el]||0;
            /* Crit/Fatal: UM roll por cast/swing. Em AoE (wave, caldera,
             * exori gran, chain…), se proc, o bônus e o FX valem para
             * TODOS os alvos desta conjuração — não re-rola por monstro. */
            const stanceExtra=stanceCritExtra(auth,p,el);
            const rolled=rollPlayerCrit(auth,p,s.id);
            const transPct=forgeTranscendenceDamagePct(p,now);
            let extraPct=stanceExtra,isCrit=!!(transPct||stanceExtra||rolled.crit);
            if(rolled.crit)extraPct+=rolled.extraPct;
            if(transPct>0)extraPct+=transPct;
            const isFatal=forgeRollOnslaught(auth,p);
            if(isFatal)extraPct+=FORGE_ONSLAUGHT_BONUS_PCT;
            const source=playerPosition(auth,p),visual=spellVisual(s);
            let fx=visual.fx||ELEMENT_FX[el]||ELEMENT_FX.physical;
            fx=stanceDamageFx(p,s,originalEl,el,fx);fx=monkFx(p,fx);fx=knightSpellFx(s,fx);
            const converted=el!==originalEl;
            const magical=!s.f||s.f.modo==="magic",
              missile=converted? (magical?(ELEMENT_MISSILE[el]||"energy"):null)
                :(visual.missile||(magical?(ELEMENT_MISSILE[el]||"energy"):null)),
              projectile=!!missile&&spellReach(s)>1,castVisualTs=visualTs;
            // Magia com MATRIZ DE AREA nunca encadeia: a area manda nos
            // alvos e no visual (exori/exori gran batem na box sem corrente).
            const ehChain=!areaName&&(Number(s.chain)>1||!!(md&&md.chain));
            const chainFx=(md&&md.chainFx)||s.chainFx||null;
            for(let ti=0;ti<targets.length;ti++){
              const tgt=targets[ti];
              if(tgt.greedImmune||tgt.qteImmune){
                if(!auth._immuneFx||now-auth._immuneFx>500){
                  auth._immuneFx=now;const blocked=entityPosition(tgt,.5,.5);
                  auth.events.push({t:"block",x:blocked.x,y:blocked.y,screen:true,
                    greedImmune:!!tgt.greedImmune,qteImmune:!!tgt.qteImmune,ts:visualTs});
                }
                continue;
              }
              let dmg=boostSpellDamage(p,s,Math.max(1,Math.floor(rollSpell(auth,p,s)*monkMult)));
              if(stOut.dmgDealt!==1)dmg=Math.max(1,Math.floor(dmg*stOut.dmgDealt));
              if(elPct)dmg=Math.max(1,Math.floor(dmg*(1+elPct/100)));
              let finalDmg=dmg;
              if(extraPct)finalDmg=Math.floor(finalDmg*(1+extraPct/100));
              const armaEl=spellWeaponElement(p,s);
              const target=entityPosition(tgt,.5,.5);
              const hop=ehChain&&ti>0,prev=hop?targets[ti-1]:item,prevPos=entityPosition(prev,source.x,source.y);
              const fireProj=!!missile&&(hop||projectile);
              const hitBase={x:target.x,y:target.y,race:tgt.def&&tgt.def.race||"blood",crit:isCrit,fatal:isFatal,
                mobId:String(tgt.id),targetId:String(tgt.id),mobSlug:tgt.slug,whoId:String(item.id),
                sx:hop?prevPos.x:source.x,sy:hop?prevPos.y:source.y,spell:s.name,spellId:s.id,ts:visualTs,
                exori:KNIGHT_EXORI.has(s.id)?1:0,chain:hop?1:0,fromId:hop?String(prev.id):undefined,screen:true};
              if(armaEl&&!elementalBond(p)){
                const parts=splitDualParts(finalDmg,armaEl.propFisica);
                const fisFinal=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,parts.fis,now),now);
                const eleFinal=applyOutgoingDamage(tgt,armaEl.el,scalePlayerDamage(p,tgt,armaEl.el,parts.ele,now),now);
                const dealt=fisFinal+eleFinal;tgt.hp-=dealt;afterPlayerHit(auth,p,tgt,dealt,now);
                auth.events.push(Object.assign({t:"hit",dmg:fisFinal,el,fx,projectile:fireProj,missile:fireProj?missile:null},hitBase));
                if(eleFinal>0)auth.events.push(Object.assign({t:"hit",dmg:eleFinal,el:armaEl.el,fx:ELEMENT_FX[armaEl.el]||fx,dual:1,projectile:false,missile:null},hitBase,{crit:false,fatal:false}));
                if(echoFrac&&dealt>0){auth.delayedHits=auth.delayedHits||[];auth.delayedHits.push({at:now+1000,mobId:tgt.id,dmg:Math.max(1,Math.floor(dealt*echoFrac)),el,fx,whoId:item.id});}
              }else{
                finalDmg=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,finalDmg,now),now);
                if(finalDmg>0){tgt.hp-=finalDmg;afterPlayerHit(auth,p,tgt,finalDmg,now);
                  if(echoFrac){auth.delayedHits=auth.delayedHits||[];auth.delayedHits.push({at:now+1000,mobId:tgt.id,dmg:Math.max(1,Math.floor(finalDmg*echoFrac)),el,fx,whoId:item.id});}}
                auth.events.push(Object.assign({t:"hit",dmg:finalDmg,el,fx,projectile:fireProj,missile:fireProj?missile:null},hitBase));
              }
              if(s.cond)applyCondition(tgt,s.cond.tipo||s.cond,s.cond.dano||Math.max(1,Math.floor(finalDmg*.1)),s.cond.golpes||4);
              stanceApplyDebuffs(p,tgt,now);
              if(s.weakNext)tgt.weakNextUntil=now+10000;
              hitIdx++;
            }
            if(kind==="spender")gastaHarmony(p);else if(kind==="builder")ganhaHarmony(p);
            if(areaName){
              const areaVis=spellAreaAnchor(auth,s,item,primaryTarget,areaCells);
              if(areaVis.cells.length)auth.events.push({t:"areafx",cells:areaVis.cells,fx,spell:s.name,spellId:s.id,
                screen:true,ts:castVisualTs+20,whoId:String(item.id),anchor:areaVis.fromCaster?"caster":"target",
                base:areaVis.base,targetId:String(primaryTarget.id)});
              else{const target=entityPosition(primaryTarget,.5,.5);
                auth.events.push({t:"burst",x:target.x,y:target.y,targetId:String(primaryTarget.id),
                  fx,spell:s.name,spellId:s.id,screen:true,ts:visualTs+20,whoId:String(item.id)});}
            }
            if(ehChain&&targets.length){
              const links=targets.map((t)=>{const pos=entityPosition(t,.5,.5);
                const cell=entityGridCell(t,auth);
                return {x:pos.x,y:pos.y,id:String(t.id),cx:cell.cx,cy:cell.cy};});
              const primaryPos=entityPosition(primaryTarget,.5,.5);
              const pathFx=chainFx||"white-energy-spark";
              const path=spellChainVisualPath(auth,item,targets);
              auth.events.push({t:"chain",n:targets.length,x:primaryPos.x,y:primaryPos.y,links,
                path,fx:fx,impactFx:fx,chainFx:pathFx,
                spell:s.name,spellId:s.id,screen:true,
                ts:castVisualTs+15,whoId:String(item.id)});
              // FX nos SQMs vazios do caminho (Canary CONST_ME), stagger por hop.
              const byHop=new Map();
              for(const cell of path){
                const hop=Number(cell.hop)||0;
                if(!byHop.has(hop))byHop.set(hop,[]);
                byHop.get(hop).push({cx:cell.cx,cy:cell.cy});
              }
              for(const [hop,cells] of byHop){
                if(!cells.length)continue;
                auth.events.push({t:"areafx",cells,fx:pathFx,screen:true,chainPath:1,
                  spell:s.name,spellId:s.id,whoId:String(item.id),
                  ts:castVisualTs+25+hop*45});
              }
            }
            auth.events.push({t:"say",text:s.words||String(s.name||"").toLowerCase(),whoId:String(item.id),
              x:source.x,y:source.y,screen:true,ts:visualTs+40});
            if(s.mana){p.mp=Math.max(0,p.mp-s.mana);addManaSpent(p,s.mana,auth);}
            if(!p._spellCd)p._spellCd={};
            p._spellCd[s.id]=(now||Date.now())+(s.cd||2000);
            p._lastSpellAt=now||Date.now();
            p._offensiveCd=(now||Date.now())+2000;
            if(s.grupos){p._groupCd=p._groupCd||{};
              for(const g of Object.keys(s.grupos))p._groupCd[g]=(now||Date.now())+Number(s.grupos[g]||s.cd||2000);}
            acted=true;
            }
      }
      // Runas só se o Helper apontar (shooterRune ou slot de combo — o combo
      // já saiu acima). Sem “melhor runa da bag” automática.
      if(!acted&&!comboOn&&(p.config||{}).useRunes){
        const autoRune=(p.config&&p.config.shooterType==="rune"&&p.config.shooterRune)||null;
        if(autoRune)acted=tryUseRune(auth,item,p,now,autoRune,primaryTarget,living,visualTs);
      }

      // ATAQUE BÁSICO: independente do group CD de magia/runa (Tibia auto-attack).
      if(!acted){
        // ALCANCE DO MELEE: ataque básico corpo-a-corpo (range 1) NÃO pode
        // acertar de longe — o personagem anda até o alvo antes de bater.
        // Sem este gate o knight derrubava mobs do outro lado da sala.
        const fromGate=entityGridCell(item,auth),toGate=entityGridCell(primaryTarget,auth);
        const sqmGate=Math.max(Math.abs(fromGate.cx-toGate.cx),Math.abs(fromGate.cy-toGate.cy));
        if(sqmGate>playerAttackRangeSQM(p)){hitIdx++;continue;}
        if(primaryTarget.greedImmune||primaryTarget.qteImmune){
          if(!auth._immuneFx||now-auth._immuneFx>500){
            auth._immuneFx=now;const blocked=entityPosition(primaryTarget,.5,.5);
            auth.events.push({t:"block",x:blocked.x,y:blocked.y,screen:true,
              greedImmune:!!primaryTarget.greedImmune,qteImmune:!!primaryTarget.qteImmune,ts:visualTs});
          }
          hitIdx++;continue;
        }
        const ammoShot=consumeDistanceAmmo(auth,p);
        if(!ammoShot.ok){
          const missPos=entityPosition(primaryTarget,.5,.5);
          auth.events.push({t:"miss",x:missPos.x,y:missPos.y,reason:"ammo",whoId:String(item.id),screen:true,fx:"poff",ts:visualTs});
          hitIdx++;continue;
        }
        const stOut=stanceTotals(p);
        let dmg=playerDamage(auth,p,primaryTarget);
        if(stOut.dmgDealt!==1)dmg=Math.max(1,Math.floor(dmg*stOut.dmgDealt));
        if(p.voc==="monk"&&attackSkillName(p)==="fist")dmg+=mantraAtaqueBonus(p);
        const profile=playerWeaponProfile(p);
        const from=entityGridCell(item,auth),to=entityGridCell(primaryTarget,auth);
        const sqm=Math.max(Math.abs(from.cx-to.cx),Math.abs(from.cy-to.cy));
        const ammoIt=ammoShot.ammo;
        const perfect=weaponPerfectShot(p,sqm,profile);
        let landed=true;
        if(ammoShot.ranged&&!perfect&&!distanceHitChance(auth,p,ammoIt,sqm,ITEMS[p.equip&&p.equip.weapon&&p.equip.weapon.item]))landed=false;
        const rolled=rollPlayerCrit(auth,p);
        const transPct=forgeTranscendenceDamagePct(p,now);
        const isCrit=!!(rolled.crit||transPct);
        const isFatal=forgeRollOnslaught(auth,p);
        let finalDmg=dmg;
        let hitExtraPct=0;
        if(rolled.crit)hitExtraPct+=rolled.extraPct;
        if(transPct>0)hitExtraPct+=transPct;
        if(isFatal)hitExtraPct+=FORGE_ONSLAUGHT_BONUS_PCT;
        if(hitExtraPct)finalDmg=Math.floor(finalDmg*(1+hitExtraPct/100));
        const imbConv=(!profile.elemento2&&profile.element==="physical")?imbElementalConvert(p):null;
        const convEl=profile.elemento2||(imbConv&&imbConv.el)||null;
        const convProp=profile.elemento2?profile.propFisica:(imbConv?imbConv.propFisica:1);
        const source=playerPosition(auth,p),target=entityPosition(primaryTarget,.5,.5);
        const el=profile.element||"physical";
        const hitBase={x:target.x,y:target.y,race:primaryTarget.def&&primaryTarget.def.race||"blood",
          crit:isCrit,fatal:isFatal,mobId:String(primaryTarget.id),targetId:String(primaryTarget.id),
          mobSlug:primaryTarget.slug,whoId:String(item.id),sx:source.x,sy:source.y,ts:visualTs};
        const areaMobs=ammoIt&&ammoIt.areaMatrix?ammoMatrixTargets(auth,ammoIt.areaMatrix,primaryTarget,living):[];
        if(!landed&&!areaMobs.length){
          auth.events.push({t:"miss",x:target.x,y:target.y,whoId:String(item.id),screen:true,fx:"poff",ts:visualTs});
        }else{
          const strike=(tgt,splash)=>{
            if(!tgt||tgt.hp<=0||tgt.greedImmune||tgt.qteImmune)return;
            let raw=splash?Math.max(1,Math.floor(finalDmg)):finalDmg;
            const tpos=entityPosition(tgt,.5,.5);
            const base=Object.assign({},hitBase,{x:tpos.x,y:tpos.y,mobId:String(tgt.id),targetId:String(tgt.id),mobSlug:tgt.slug});
            if(convEl&&!profile.bond){
              const parts=splitDualParts(raw,convProp);
              const fisFinal=applyOutgoingDamage(tgt,"physical",scalePlayerDamage(p,tgt,"physical",parts.fis,now),now);
              const eleFinal=applyOutgoingDamage(tgt,convEl,scalePlayerDamage(p,tgt,convEl,parts.ele,now),now);
              const dealt=fisFinal+eleFinal;tgt.hp-=dealt;afterPlayerHit(auth,p,tgt,dealt,now);
              if(fisFinal>0)auth.events.push(Object.assign({t:"hit",dmg:fisFinal,el:"physical",fx:physicalHitFx(tgt.def&&tgt.def.race),
                projectile:!!profile.projectile&&!splash,missile:splash?null:(profile.missile||null)},base));
              if(eleFinal>0)auth.events.push(Object.assign({t:"hit",dmg:eleFinal,el:convEl,fx:ELEMENT_FX[convEl]||ELEMENT_FX.physical,
                dual:1,projectile:false,missile:null},base,{crit:false,fatal:false}));
            }else{
              raw=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,raw,now),now);
              if(raw>0){tgt.hp-=raw;afterPlayerHit(auth,p,tgt,raw,now);
                auth.events.push(Object.assign({t:"hit",dmg:raw,el,fx:basicHitFx(p,profile,tgt,el,ammoIt),
                  projectile:!!profile.projectile&&!splash,missile:splash?null:(profile.missile||null)},base));}
            }
            stanceApplyDebuffs(p,tgt,now);
            if(!splash&&ammoIt&&ammoIt.poison)applyCondition(tgt,"poison",ammoIt.poison.dmg||ammoIt.poison,ammoIt.poison.turns||5);
          };
          if(landed){
            strike(primaryTarget,false);
            if(perfect>0&&primaryTarget.hp>0){
              primaryTarget.hp-=perfect;afterPlayerHit(auth,p,primaryTarget,perfect,now);
              const tpos=entityPosition(primaryTarget,.5,.5);
              auth.events.push(Object.assign({t:"hit",dmg:perfect,el:"physical",fx:physicalHitFx(primaryTarget.def&&primaryTarget.def.race),
                perfect:1,projectile:false},hitBase,{x:tpos.x,y:tpos.y}));
            }
          }
          else auth.events.push({t:"miss",x:target.x,y:target.y,whoId:String(item.id),screen:true,fx:"poff",ts:visualTs});
          for(const extra of areaMobs)if(extra!==primaryTarget||!landed)strike(extra,extra!==primaryTarget);
          if(ammoIt&&ammoIt.areaMatrix){
            const cells=ammoMatrixCells(auth,ammoIt.areaMatrix,primaryTarget);
            if(cells.length)auth.events.push({t:"areafx",cells,fx:ammoIt.areaFx||"explosion-area",el,screen:true,ts:visualTs+20});
          }
        }
        progressAttack(p,auth);
      }
      hitIdx++;
    }
  }

  /* ---------- MORTE DE MONSTROS ---------- */
  const survivors=[],dead=[];
  for(const mob of auth.mobs||[]){
    if(mob.hp>0){survivors.push(mob);continue;}
    const leader=auth.players[0];
    if(leader&&leader.p&&soulwarTaintPreventMonsterDeath(auth,mob,leader.p))survivors.push(mob);
    else dead.push(mob);
  }
  auth.mobs=survivors;
  for(const mob of dead){
    if(auth.greed&&auth.greed.immune&&mob.slug==="greedbeast"){
      auth.greed.greedbeastKills++;if(auth.greed.greedbeastKills>=5){auth.greed.immune=false;auth.greed.greedbeastKills=0;auth.greed.vulnerableUntil=now+40000;}}
    if(auth.hatred&&mob.hatredSummon){
      const counters=auth.hatred.counters||(auth.hatred.counters={});
      if(mob.slug==="hateful-soul"){for(const key of Object.keys(counters))counters[key]=0;}
      else{for(const key of Object.keys(counters))counters[key]=Math.max(0,(Number(counters[key])||0)-1);}
    }
    if(auth.spite&&mob.spiteTrash){
      auth.spite.pendingRespawns=auth.spite.pendingRespawns||[];
      auth.spite.pendingRespawns.push({at:now+SPITE_TRASH_RESPAWN_MS});
      if(mob.slug==="weeping-soul"){
        const boss=(auth.mobs||[]).find((m)=>m.boss&&m.hp>0);
        if(boss&&Math.floor(random(auth)*100)+1<=SPITE_HEAL_CHANCE){
          const heal=Math.floor(boss.maxHp*(SPITE_HEAL_PCT/100));
          boss.hp=Math.min(boss.maxHp,boss.hp+heal);
          auth.events.push({t:"effect",x:Number(boss.x)||.5,y:Number(boss.y)||.5,screen:true,fx:"magic-blue",ts:stepTs+700});
        }
      }
    }
    if(auth.malice&&mob.maliceTrash){
      auth.malice.pendingRespawns=auth.malice.pendingRespawns||[];
      auth.malice.pendingRespawns.push({at:now+MALICE_TRASH_RESPAWN_MS});
    }
    const leader=auth.players[0];
    const lootDrops=reward(auth,mob,auth.players,stepTs),deadPos=entityPosition(mob,.5,.5);
    auth.events.push({t:"kill",mob:mob.slug,mobId:String(mob.id),targetId:String(mob.id),name:mob.def?mob.def.name:mob.slug,
      exp:Number(auth._lastKillExp)||0,gained:Number(auth._lastKillExp)||0,shares:auth._lastKillShares||[],
      loot:lootDrops,x:deadPos.x,y:deadPos.y,
      screen:true,boss:!!mob.boss,influenced:!!mob.influenced,fiendish:!!mob.fiendish,
      ts:stepTs+800});
    if(mob.boss){auth.ended=true;auth.terminalReason="boss-defeated";auth.bossDefeated=true;
      if(leader){leader.p.bosses[auth.bossId]=leader.p.bosses[auth.bossId]||{};leader.p.bosses[auth.bossId].kills=(leader.p.bosses[auth.bossId].kills||0)+1;}
      if(!authIsWorldBoss(auth))for(const item of auth.players)soulwarGrantBossTaint(item.p,auth.bossId||mob.slug,now);}
  }

  /* ---------- ATAQUE DOS MONSTROS (melee + skills) ---------- */
  for(const mob of auth.mobs){
    mob.attackAcc+=dt;
    let mobHitIdx=0;
    const mobInterval=Math.max(500,Number(mob.attackSpeed)||2000);
    while(mob.attackAcc>=mobInterval){
      const mobVisualTs=swingVisualTs(stepTs,dt,mob.attackAcc,mobInterval,mobHitIdx);
      mob.attackAcc-=mobInterval;
      const victim=authorityMobTarget(auth,mob);
      if(!victim)break;
      runMobSkills(auth,mob,victim,now,mobVisualTs,0);

      // 2) Melee extraído do name="melee" do .lua. Sem melee real o import
      // copia max(skills) em damage — naga/makara NÃO devem bater isso extra.
      if(mobHasExtractedMelee(mob.def)&&Number(mob.damage||0)>0&&victim.p.hp>0){
        const dist=authorityVisualDistance(mob,victim,auth);
        if(dist<=mobMeleeRangeSQM(mob)){
        const dodge=stanceTotals(victim.p).dodgeRanged;
        const from=entityGridCell(mob,auth),to=entityGridCell(victim,auth);
        const rangedSqm=Math.max(Math.abs(from.cx-to.cx),Math.abs(from.cy-to.cy));
        if(dodge&&rangedSqm>1&&random(auth)<dodge){
          const missPos=entityPosition(victim,.13,.6);
          auth.events.push({t:"miss",x:missPos.x,y:missPos.y,targetId:String(victim.id),dodge:true,screen:true,fx:"poff",ts:mobVisualTs});
        }else{
        let damage=mobDamage(auth,mob,victim.p);
        const target=entityPosition(victim,.13,.6),source=entityPosition(mob,.5,.5);
        const el=mob.def&&mob.def.element||"physical";
        const ranged=(Number(mob.def&&mob.def.targetDistance)||1)>1;
        const evBefore=auth.events.length;
        damage=absorbIncomingDamage(auth,victim,victim.p,damage,now,target,el,mob);
        if(damage<=0){
          // dodge/dazzle ja emitiu miss; mitigacao total → block (nao taken 0).
          const alreadyMiss=auth.events.slice(evBefore).some((ev)=>ev&&ev.t==="miss");
          if(!alreadyMiss){
            auth.events.push({t:"block",x:target.x,y:target.y,targetId:String(victim.id),
              sx:source.x,sy:source.y,sourceId:String(mob.id),fx:"block-hit",
              projectile:ranged,missile:ranged?(ELEMENT_MISSILE[el]||"small-stone"):null,
              screen:true,ts:mobVisualTs});
          }
        }else{
        victim.p.hp-=damage;
        auth.events.push({t:"taken",dmg:damage,x:target.x,y:target.y,targetId:String(victim.id),
          sx:source.x,sy:source.y,sourceId:String(mob.id),el,fx:ELEMENT_FX[el]||ELEMENT_FX.physical,
          projectile:ranged,missile:ranged?(ELEMENT_MISSILE[el]||"small-stone"):null,
          screen:true,ts:mobVisualTs});
        applyMonsterMeleeCondition(auth,victim,victim.p,mob);
        if(victim.p.hp<=0){authMarkPlayerDeath(auth,victim,now);
          auth.events.push({t:"death",x:target.x,y:target.y,targetId:String(victim.id),
            permadead:!!victim.permadead,screen:true,ts:mobVisualTs});
        }
        }
        }
        }
      }
      mobHitIdx++;
    }
  }

  if(auth.players.every((x)=>x.p.hp<=0||x.downUntil))fullWipe(auth);
  if(!auth.ended)for(const mob of auth.mobs||[])if(mob.hp>0)monsterThinkYell(auth,mob,now);
  if(!auth.ended)advanceAuthorityMovement(auth,now,{freezePlayers:!!(opts&&opts.freezeVisual)});
  // Wave clear: agenda AUTH_WAVE_CLEAR_RESPAWN_MS (4s) até o monstro nascer.
  // Em T-2s (AUTH_WAVE_TELEPORT_LEAD_MS) enfileira pendingSpawns / blink.
  // Também separa kill e makeMob×pack em respostas distintas e evita o custo
  // no step do último kill (catchup incluso).
  if(!auth.ended&&auth.kind==="hunt"){
    const empty=!auth.mobs.length&&!(auth.pendingSpawns&&auth.pendingSpawns.length);
    if(empty){
      if(dead.length)auth._nextWaveAt=stepTs+AUTH_WAVE_CLEAR_RESPAWN_MS;
      else if(auth._nextWaveAt){
        if(stepTs>=auth._nextWaveAt-AUTH_WAVE_TELEPORT_LEAD_MS){
          auth._nextWaveAt=0;spawnHuntWave(auth,stepTs);
        }
      }else spawnHuntWave(auth,stepTs);
    }else auth._nextWaveAt=0;
  }
  if(!auth.ended)tickAuthSpawnQueue(auth,stepTs);
}
function initializeAuthority(descriptor,instanceId,now){
  const combat=descriptor.state||{},active=Array.isArray(combat.mobs)?combat.mobs:[];
  // HARD hunts come in with teleport-blink entries in pendingSpawns. Keep
  // them pending so the Canary 3×/1s preview runs before combat starts.
  const pendingIn=Array.isArray(combat.pendingSpawns)?combat.pendingSpawns.filter((sp)=>sp&&sp.mob):[];
  const seen=new Set(),visual=active.filter((mob)=>{
    const key=String(mob&&mob.id||mob&&mob.slug||"");if(!key||seen.has(key))return false;seen.add(key);return true;});
  const oldPlayers=Array.isArray(combat.players)?combat.players:[];
  const players=(descriptor.members||[]).map((m)=>{const id=String(m.id),old=oldPlayers.find((ent)=>String(ent&&ent.id)===id)||{};
    const item={id,p:canonicalPlayer(m),attackAcc:0,downUntil:0,accountId:m.accountId||(m.p&&m.p.accountId)};
    item.p.accountId=item.accountId;item.p.vipUntil=Math.max(0,Number(item.p.vipUntil)||0);
    for(const key of ["cx","cy","x","y","sx","sy"])if(old[key]!==undefined)item[key]=old[key];return item;});
  const auth={v:2,rngState:seedFor(instanceId),nextMobId:1,clock:Number(now)||Date.now(),carryMs:0,kind:descriptor.kind,
    huntId:descriptor.huntId||null,bossId:descriptor.bossId||null,instanceMode:descriptor.instanceMode||"non-pvp",
    worldBoss:!!(descriptor.worldBoss||combat.worldBoss||/^world-boss-wz[123]$/.test(String(descriptor.bossId||""))),
    pvp:!!(descriptor.instanceMode==="pvp"),
    wallets:{},
    expMul:descriptor.instanceMode==="pvp"?1.25:1,
    lootMul:descriptor.instanceMode==="pvp"?1.25:1,
    skillMul:descriptor.instanceMode==="pvp"?1.25:1,
    huntMode:(players[0]&&players[0].p&&players[0].p.config&&players[0].p.config.attackMode)||"",players,mobs:[],spawnPool:[],spawnPoints:[],
    pendingSpawns:[],
    influencedChance:Math.max(0,Number(combat.influencedChance)||
      (INFLUENCED_BASE_CHANCE+(descriptor.instanceMode==="pvp"?INFLUENCED_PVP_BONUS:0))),
    fiendishChance:Math.max(0,Number(combat.fiendishChance)||
      (FIENDISH_BASE_CHANCE+(descriptor.instanceMode==="pvp"?FIENDISH_PVP_BONUS:0))),
    gridW:Number(combat.gridW)||30,gridH:Number(combat.gridH)||30,
    blockedCells:combat.blockedCells||null,
    pack:Math.max(1,visual.length||pendingIn.length||Number((HUNTS[descriptor.huntId]||{}).pack)||3),
    wave:visual.length||pendingIn.length?1:0,
    stats:{startedAt:Number(now)||Date.now(),time:0,kills:0,exp:0,rawExp:0,rawHp:0,gold:0,loot:{},monsters:{},
      supplyUsed:{},supplyCost:0,supplyBought:{},deaths:0,blessCost:0,
      deathTrack:{startedAt:Number(now)||Date.now(),byPlayer:{}}},wipes:0,ended:false,terminalReason:null,lastDamageSource:"monster",wallets:{}};
  shareAccountGoldWallets(auth);
  for(const old of visual){const slug=String(old.slug||""),m=makeMob(auth,slug,!!old.boss,String(old.id||""),old);if(m){
      for(const key of ["cx","cy","x","y","sx","sy"])if(old[key]!==undefined)m[key]=old[key];
      if(old.cx!==undefined&&old.cy!==undefined&&!auth.spawnPoints.some((p)=>p.cx===old.cx&&p.cy===old.cy))
        auth.spawnPoints.push({cx:Number(old.cx),cy:Number(old.cy),x:Number(old.x),y:Number(old.y),sx:Number(old.sx),sy:Number(old.sy)});
      const cell=claimSpawnCell(auth,m.cx,m.cy),gw=Number(auth.gridW)||30,gh=Number(auth.gridH)||30;
      m.cx=cell.cx;m.cy=cell.cy;m.x=(m.cx+.5)/gw;m.y=(m.cy+.5)/gh;m.sx=m.x;m.sy=m.y;
      auth.mobs.push(m);if(!m.boss&&!auth.spawnPool.includes(slug))auth.spawnPool.push(slug);}}
  const gw=Number(auth.gridW)||30,gh=Number(auth.gridH)||30;
  for(const sp of pendingIn){
    const old=sp.mob,slug=String(old&&old.slug||"");
    if(!monsterDef(slug))continue;
    if(!auth.spawnPool.includes(slug))auth.spawnPool.push(slug);
    const mob=makeMob(auth,slug,!!old.boss,String(old.id||""),old);
    if(!mob)continue;
    if(Number.isFinite(Number(sp.cx)))mob.cx=Number(sp.cx);
    if(Number.isFinite(Number(sp.cy)))mob.cy=Number(sp.cy);
    mob.x=(mob.cx+.5)/gw;mob.y=(mob.cy+.5)/gh;mob.sx=mob.x;mob.sy=mob.y;
    if(!auth.spawnPoints.some((p)=>p.cx===mob.cx&&p.cy===mob.cy))
      auth.spawnPoints.push({cx:mob.cx,cy:mob.cy,x:mob.x,y:mob.y,sx:mob.x,sy:mob.y});
    auth.pendingSpawns.push({
      mob,cx:mob.cx,cy:mob.cy,
      startedAt:Number(sp.startedAt)||Number(now)||auth.clock,
      blink:Number(sp.blink)||0,done:false
    });
  }
  if(!auth.spawnPool.length){const hunt=HUNTS[auth.huntId];for(const slug of (hunt&&hunt.monsters)||[])if(monsterDef(slug))auth.spawnPool.push(slug);}
  if(descriptor.kind==="boss"){
    let boss=auth.mobs.find((m)=>m.boss);
    // Cliente pode ter adiado o boss (arenaBossSpawn.pending) antes do PUT.
    const pend=combat.arenaBossSpawn&&combat.arenaBossSpawn.pending;
    if(!boss&&pend){
      boss=makeMob(auth,String(pend.slug||descriptor.bossId||""),true,String(pend.id||"boss"),pend);
      if(boss){
        for(const key of ["cx","cy","x","y","sx","sy"])if(pend[key]!==undefined)boss[key]=pend[key];
        auth.mobs.unshift(boss);
      }
    }
    if(!boss)boss=auth.mobs[0];
    if(boss)boss.boss=true;
    // The Unwelcome (Feast of Souls): neutro em todos os elementos e imune
    // a death (cura 200% do dano que sofreria) — mesmo def do cliente.
    if(boss&&String(auth.bossId||"")==="the-unwelcome"){
      boss.def=Object.assign({},boss.def,{
        resist:{physical:0,energy:0,earth:0,fire:0,ice:0,holy:0,death:0,lifedrain:0,manadrain:0,drown:0},
        deathAbsorbs:true,
      });
    }
    const leader=players[0]&&players[0].p;
    if(leader&&auth.bossId){leader.bosses[auth.bossId]=leader.bosses[auth.bossId]||{};leader.bosses[auth.bossId].lastFight=auth.clock;}
    if(auth.bossId==="goshnar-s-megalomania"){
      auth.mega={bossSpawnAt:auth.clock+MEGA_BOSS_SPAWN_MS,bossSpawned:false,pendingBoss:null,
        phase:"waiting",immune:true,personal:{},pendingIntents:[]};
      // Cliente (megaBossInit) tira o boss de mobs e guarda em mega.pendingBoss
      // antes do PUT. Sem recuperar daqui a autoridade ficava sem mob e, aos
      // 15s, marcava bossSpawned sem nascer ninguém.
      if(!boss){
        const pend=(combat.mega&&combat.mega.pendingBoss)||
          (combat.arenaBossSpawn&&combat.arenaBossSpawn.pending)||null;
        if(pend){
          boss=makeMob(auth,String(pend.slug||MEGA_FORM.green||descriptor.bossId||""),true,
            String(pend.id||"boss"),pend);
          if(boss){
            for(const key of ["cx","cy","x","y","sx","sy"])if(pend[key]!==undefined)boss[key]=pend[key];
            auth.mobs.unshift(boss);
          }
        }
      }
      if(!boss){
        boss=makeMob(auth,MEGA_FORM.green,true,"mega-boss");
        if(boss){
          const point=(auth.spawnPoints&&auth.spawnPoints[0])||null;
          if(point){
            boss.cx=Number(point.cx);boss.cy=Number(point.cy);
            boss.x=(boss.cx+.5)/gw;boss.y=(boss.cy+.5)/gh;boss.sx=boss.x;boss.sy=boss.y;
          }
          auth.mobs.unshift(boss);
        }
      }
      if(boss){
        boss.boss=true;
        boss.allowBlockedSpawn=true;boss.fixedSpawnCx=boss.cx;boss.fixedSpawnCy=boss.cy;
        boss.maxHp=boss.maxHp||boss.hp||620000;
        boss.megaPendingSpawn=true;boss.qteImmune=true;boss.megaImmune=true;
        auth.mega.pendingBoss=boss;
        auth.mega._pendingSeed={
          id:String(boss.id||"mega-boss"),slug:String(boss.slug||MEGA_FORM.green),
          cx:boss.cx,cy:boss.cy,x:boss.x,y:boss.y,sx:boss.sx,sy:boss.sy,
          hp:boss.hp,maxHp:boss.maxHp
        };
        auth.mobs=(auth.mobs||[]).filter((m)=>m!==boss);
      }
      megaEnsurePersonalSchedulers(auth,auth.clock+MEGA_BOSS_SPAWN_MS);
    }else if(boss&&!(combat.arenaBossSpawn&&combat.arenaBossSpawn.spawned)){
      // Só atraso relativo ao auth.clock. Nunca copie `at` absoluto do cliente
      // (Date.now): relógio desalinhado deixava o boss pending para sempre.
      const delay=bossArenaSpawnDelayMs(auth.bossId);
      let remain=delay;
      if(combat.arenaBossSpawn&&Number(combat.arenaBossSpawn.startedAt)>0&&
         Number(combat.arenaBossSpawn.at)>Number(combat.arenaBossSpawn.startedAt)){
        const waited=Math.max(0,auth.clock-Number(combat.arenaBossSpawn.startedAt));
        const total=Math.max(0,Number(combat.arenaBossSpawn.at)-Number(combat.arenaBossSpawn.startedAt));
        remain=Math.max(0,Math.min(delay,total-waited));
      }
      arenaBossDeferSpawn(auth,boss,remain);
      // Mecânicas (Hatred/Spite/Malice/Greed/Scarlett) ligam em arenaBossSpawnTick.
    }else if(boss){
      // Já spawnado (resume / spawned=true): liga mecânicas agora.
      arenaBossBindMechanics(auth,auth.clock);
    }
    syncBossImmunityFlags(auth);}
  ensureSpawnIds(auth);
  tickAuthSpawnQueue(auth,Number(now)||auth.clock);
  descriptor.authority=auth;return materializeAuthority(descriptor);
}
function materializeAuthority(descriptor){const auth=descriptor.authority;if(!auth)return descriptor;
  descriptor.members=auth.players.map((item)=>({id:item.id,p:clonePlayerState(item.p),hp:item.p.hp,mp:item.p.mp}));descriptor.activeCharacterId=descriptor.activeCharacterId||auth.players[0]&&auth.players[0].id;
  descriptor.state=descriptor.state||{};const oldPlayers=Array.isArray(descriptor.state.players)?descriptor.state.players:[];
  descriptor.state.players=auth.players.map((item)=>stripStaleVisualStep(Object.assign({},
    oldPlayers.find((x)=>String(x.id)===item.id)||{id:item.id},entityVisual(item),
    {id:item.id,p:clonePlayerState(item.p),hp:item.p.hp,mp:item.p.mp,
      reviveAt:item.permadead?0:(item.downUntil||0),
      permadead:!!item.permadead,
      downedAt:item.downedAt||0,
      deathPos:item.deathPos||((item.p.hp<=0||item.downUntil||item.permadead)
        ?{x:item.x,y:item.y,dir:item.dir||"e"}:null)})));
  const oldMobs=Array.isArray(descriptor.state.mobs)?descriptor.state.mobs:[];
  descriptor.state.mobs=auth.mobs.map((m)=>{
    const prev=oldMobs.find((x)=>String(x.id)===String(m.id));
    // Slot reciclado com outra espécie não herda sprite/passo da anterior.
    const inherit=prev&&String(prev.slug||"")===String(m.slug||"")?prev:{};
    return stripStaleVisualStep(Object.assign({},inherit,entityVisual(m),
    {id:m.id,slug:m.slug,boss:m.boss,targetId:m.targetId||null,
      challengeTargetId:m.challengeTargetId||null,
      challengedUntil:challengeWallUntil(m.challengedUntil,auth.clock),
      forceMeleeUntil:challengeWallUntil(m.forceMeleeUntil,auth.clock),
      sapStrUntil:challengeWallUntil(m.sapStrUntil,auth.clock),
      exposeUntil:challengeWallUntil(m.exposeUntil,auth.clock),
      influenced:!!m.influenced,fiendish:!!m.fiendish,
      sinisterStacks:Number(m.sinisterStacks)||0,greedImmune:!!(auth.greed&&auth.greed.immune&&m.boss),
      qteImmune:!!((auth.scarlett&&auth.scarlett.immune&&m.boss)||(auth.mega&&auth.mega.immune&&m.boss)),hatredSummon:!!m.hatredSummon,
      spiteTrash:!!m.spiteTrash,spiteDamageTakenMul:Number(m.spiteDamageTakenMul)||1,
      spiteDefenseStacks:Number(m.spiteDefenseStacks)||0,
      maliceTrash:!!m.maliceTrash,megaAspect:!!m.megaAspect,
      megaImmune:!!(auth.mega&&auth.mega.immune&&m.boss),
      hp:m.hp,maxHp:m.maxHp,atkCd:Math.max(0,m.attackSpeed-m.attackAcc),
      // def compacto: só campos necessários para o cliente renderizar.
      // O def completo (loot, skills, voices) é pesado e já existe no
      // cliente via GAMEDATA.monsters. Enviar tudo a cada tick trava o
      // browser (50KB+ por snapshot com 6 mobs).
      def:{name:m.def?m.def.name:m.slug,race:m.def&&m.def.race||"blood",
           element:m.def&&m.def.element||"physical",looktype:m.def&&m.def.looktype||null}}));
  });
  if(auth.greed)descriptor.state.greed={immune:auth.greed.immune,greedbeastKills:auth.greed.greedbeastKills,
    vulnerableUntil:auth.greed.vulnerableUntil,nextSpawnAt:auth.clock+1500,lastBlockFx:0};
  else descriptor.state.greed=null;
  descriptor.state.hatred=auth.hatred?{active:!!auth.hatred.active,counters:Object.assign({},auth.hatred.counters||{}),
    nextActivationAt:Number(auth.hatred.nextActivationAt)||0,
    nextCounterAt:Number(auth.hatred.nextCounterAt)||0}:null;
  descriptor.state.scarlett=auth.scarlett?{immune:!!auth.scarlett.immune,phase:auth.scarlett.phase||"waiting",
    nextAt:Number(auth.scarlett.nextAt)||0,qteUntil:Number(auth.scarlett.qteUntil)||0,
    qteStartedAt:Number(auth.scarlett.qteStartedAt)||0,
    thresholdIndex:Number(auth.scarlett.thresholdIndex)||0,thresholds:auth.scarlett.thresholds||[0.75,0.50,0.25],
    sequence:Array.isArray(auth.scarlett.sequence)?auth.scarlett.sequence.slice():[],
    noteDues:Array.isArray(auth.scarlett.noteDues)?auth.scarlett.noteDues.map(Number):[],
    index:Number(auth.scarlett.index)||0}:null;
  descriptor.state.spite=auth.spite?{
    defenseStacks:Number(auth.spite.defenseStacks)||0,qtePenalty:!!auth.spite.qtePenalty,
    qtePhase:auth.spite.qtePhase||"idle",nextFireAt:Number(auth.spite.nextFireAt)||0,
    nextQteAt:Number(auth.spite.nextQteAt)||0,qteUntil:Number(auth.spite.qteUntil)||0,
    stompReadyAt:Number(auth.spite.stompReadyAt)||0,bubblesLeft:Number(auth.spite.bubblesLeft)||0,
    fire:auth.spite.fire?{id:String(auth.spite.fire.id||""),expiresAt:Number(auth.spite.fire.expiresAt)||0}:null,
    bubbles:Array.isArray(auth.spite.bubbles)?auth.spite.bubbles.map((b)=>({
      x:Number(b.x)||0,y:Number(b.y)||0,popped:!!b.popped})):[]}:null;
  descriptor.state.malice=auth.malice?{
    qtePhase:auth.malice.qtePhase||"idle",nextQteAt:Number(auth.malice.nextQteAt)||0,
    qteUntil:Number(auth.malice.qteUntil)||0,nextSlideAt:Number(auth.malice.nextSlideAt)||0,
    px:Number(auth.malice.px)||0,py:Number(auth.malice.py)||0,
    start:auth.malice.start?{x:Number(auth.malice.start.x)||0,y:Number(auth.malice.start.y)||0}:null,
    goal:auth.malice.goal?{x:Number(auth.malice.goal.x)||0,y:Number(auth.malice.goal.y)||0}:null,
    blocks:Array.isArray(auth.malice.blocks)?auth.malice.blocks.map((b)=>({
      x:Number(b.x)||0,y:Number(b.y)||0,len:Number(b.len)||1})):[]}:null;
  descriptor.state.mega=auth.mega?{
    bossSpawnAt:Number(auth.mega.bossSpawnAt)||0,bossSpawned:!!auth.mega.bossSpawned,
    phase:auth.mega.phase||"waiting",immune:!!auth.mega.immune,
    pendingBoss:(!auth.mega.bossSpawned&&(auth.mega.pendingBoss||auth.mega._pendingSeed))?{
      id:String((auth.mega.pendingBoss&&auth.mega.pendingBoss.id)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.id)||"mega-boss"),
      slug:String((auth.mega.pendingBoss&&auth.mega.pendingBoss.slug)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.slug)||MEGA_FORM.green),
      boss:true,
      hp:Number((auth.mega.pendingBoss&&auth.mega.pendingBoss.hp)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.hp)||620000),
      maxHp:Number((auth.mega.pendingBoss&&auth.mega.pendingBoss.maxHp)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.maxHp)||620000),
      cx:Number((auth.mega.pendingBoss&&auth.mega.pendingBoss.cx)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.cx)),
      cy:Number((auth.mega.pendingBoss&&auth.mega.pendingBoss.cy)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.cy)),
      x:Number((auth.mega.pendingBoss&&auth.mega.pendingBoss.x)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.x)),
      y:Number((auth.mega.pendingBoss&&auth.mega.pendingBoss.y)||(auth.mega._pendingSeed&&auth.mega._pendingSeed.y))
    }:null,
    personal:(()=>{
      const out={};
      for(const [pid,slot] of Object.entries(auth.mega.personal||{})){
        if(!slot)continue;
        const act=slot.active;
        out[pid]={
          nextAt:Number(slot.nextAt)||0,
          active:act?{
            type:act.type,until:Number(act.until)||0,index:Number(act.index)||0,
            sequence:Array.isArray(act.sequence)?act.sequence.slice():[],
            notes:Array.isArray(act.notes)?act.notes.map((n)=>({dir:n.dir,due:Number(n.due)||0,hit:!!n.hit})):[],
            bubbles:Array.isArray(act.bubbles)?act.bubbles.map((b)=>({
              x:Number(b.x)||0,y:Number(b.y)||0,popped:!!b.popped})): [],
            bubblesLeft:Number(act.bubblesLeft)||0,
            needMs:Number(act.needMs)||0,progress:Number(act.progress)||0,
            needle:Number(act.needle)||.5,zone:Number(act.zone)||.5,zoneW:Number(act.zoneW)||.16,
            hold:!!act.hold,steer:Number(act.steer)||0
          }:null
        };
      }
      return out;
    })()}:null;
  descriptor.state.stats=Object.assign({},descriptor.state.stats||{},auth.stats);descriptor.state.bossDefeated=!!auth.bossDefeated;
  // Hunt wipe mostra corpse+contador; boss wipe só corpses permadead (sem timer).
  descriptor.state.dead=auth.ended&&auth.terminalReason==="party-wipe"&&!authIsBossFight(auth);
  // Grid dimensions: o renderer usa combat.gridW/gridH para calcular o
  // viewport e converter posições normalizadas (0-1) em pixels. Sem isso,
  // o renderer cai no fallback GRID_W=21 e os floaters saem na posição
  // errada (o grid real pode ser 30x30).
  descriptor.state.gridW=Number(auth.gridW)||30;descriptor.state.gridH=Number(auth.gridH)||30;
  descriptor.state.wave=Number(auth.wave)||0;
  descriptor.state.huntMode=auth.huntMode||"";
  descriptor.state.instanceMode=auth.instanceMode||"non-pvp";
  descriptor.state.pvp=!!auth.pvp;
  descriptor.state.expMul=Number(auth.expMul)||1;
  descriptor.state.lootMul=Number(auth.lootMul)||1;
  descriptor.state.skillMul=Number(auth.skillMul)||1;
  descriptor.state.authClock=Number(auth.clock)||0;
  descriptor.state.pendingSpawns=(auth.pendingSpawns||[]).map((sp)=>({
    cx:sp.cx,cy:sp.cy,startedAt:sp.startedAt,blink:sp.blink,
    mob:sp.mob?{id:sp.mob.id,slug:sp.mob.slug,hp:sp.mob.hp,maxHp:sp.mob.maxHp}:null
  }));
  descriptor.state.arenaBossSpawn=auth.arenaBossSpawn?{
    at:Number(auth.arenaBossSpawn.at)||0,spawned:!!auth.arenaBossSpawn.spawned,
    startedAt:Number(auth.arenaBossSpawn.startedAt)||0,
    pending:auth.arenaBossSpawn.pending?{
      id:auth.arenaBossSpawn.pending.id,slug:auth.arenaBossSpawn.pending.slug,
      boss:true,hp:auth.arenaBossSpawn.pending.hp,maxHp:auth.arenaBossSpawn.pending.maxHp,
      cx:auth.arenaBossSpawn.pending.cx,cy:auth.arenaBossSpawn.pending.cy,
      x:auth.arenaBossSpawn.pending.x,y:auth.arenaBossSpawn.pending.y
    }:null}:null;
  // Eventos de combate (dano/cura) gerados pelo step() desde o último tick.
  // O cliente drena esses eventos via drainEvents() para mostrar floaters e
  // logs de dano no modo online. Corta o lote: área × vocações ainda pode
  // gerar dezenas de hits/areafx por segundo e travar a aba.
  const MAX_AUTH_EVENTS=120;
  let events=Array.isArray(auth.events)?auth.events:[];
  if(events.length>MAX_AUTH_EVENTS){
    const keep=new Set(["taken","hit","kill","death","heal","heal-friend","say","dust","areafx","chain","mobheal","spawn","spawn-blink","boss-spawn-wait","buff","cured","break","miss","block","effect","spite-qte","malice-qte","mega-qte"]);
    events=events.filter((e)=>keep.has(e&&e.t)).concat(events.filter((e)=>!keep.has(e&&e.t))).slice(0,MAX_AUTH_EVENTS);
  }
  descriptor.state.events=events;
  auth.events=[];
  descriptor.savedAt=auth.clock;return descriptor;
}
function advanceAuthorityState(serialized,elapsed,checkpointAt,visualState){let descriptor=typeof serialized==="string"?JSON.parse(serialized):clone(serialized);
  const auth=descriptor.authority;if(!auth)return null;
  // Reata wallets de gold por conta após JSON.parse (defineProperty não serializa).
  for(const item of auth.players||[]){
    if(item&&item.p&&item.p.accountId&&!item.accountId)item.accountId=item.p.accountId;
  }
  shareAccountGoldWallets(auth);
  // v2 corrige instâncias criadas com HP/MP antigos do banco no checkpoint de
  // entrada. A migração roda uma única vez também para snapshots já ativos.
  if(Number(auth.v||1)<2){for(const item of auth.players||[]){const max=maxStats(item.p);
      item.p.hp=max.hp;item.p.mp=max.mp;item.p.stamina=FULL_STAMINA;item.downUntil=0;}
    auth.v=2;}
  for(const item of auth.players||[])syncPlayerProgress(item.p);
  if(!Number.isFinite(Number(auth.influencedChance)))auth.influencedChance=Math.max(0,
    Number(descriptor.state&&descriptor.state.influencedChance)||
    (INFLUENCED_BASE_CHANCE+(auth.instanceMode==="pvp"?INFLUENCED_PVP_BONUS:0)));
  if(!Number.isFinite(Number(auth.fiendishChance)))auth.fiendishChance=Math.max(0,
    Number(descriptor.state&&descriptor.state.fiendishChance)||
    (FIENDISH_BASE_CHANCE+(auth.instanceMode==="pvp"?FIENDISH_PVP_BONUS:0)));
  // Snapshots antigos sem mul: reconstroi a partir do instanceMode idle.
  if(!Number.isFinite(Number(auth.expMul))||!Number.isFinite(Number(auth.lootMul))||!Number.isFinite(Number(auth.skillMul))){
    const mul=auth.instanceMode==="pvp"?1.25:1;auth.expMul=mul;auth.lootMul=mul;auth.skillMul=mul;auth.pvp=auth.instanceMode==="pvp";
  }
  // Migra instâncias HARD criadas pela versão que ignorava pendingSpawns.
  if(!auth.spawnPool.length&&descriptor.state&&Array.isArray(descriptor.state.pendingSpawns)){
    const recoverMobs=auth.mobs.length===0;auth.spawnPoints=auth.spawnPoints||[];
    auth.pendingSpawns=auth.pendingSpawns||[];
    auth.gridW=Number(auth.gridW)||Number(descriptor.state.gridW)||30;auth.gridH=Number(auth.gridH)||Number(descriptor.state.gridH)||30;
    for(const sp of descriptor.state.pendingSpawns){const old=sp&&sp.mob,slug=String(old&&old.slug||"");if(!monsterDef(slug))continue;
      if(!auth.spawnPool.includes(slug))auth.spawnPool.push(slug);
      const point={cx:Number(sp.cx),cy:Number(sp.cy),x:(Number(sp.cx)+.5)/auth.gridW,y:(Number(sp.cy)+.5)/auth.gridH};
      if(!auth.spawnPoints.some((p)=>p.cx===point.cx&&p.cy===point.cy))auth.spawnPoints.push(point);
      if(recoverMobs){const mob=makeMob(auth,slug,!!old.boss,String(old.id||""),old);if(mob){
        Object.assign(mob,point);const cell=claimSpawnCell(auth,mob.cx,mob.cy);
        mob.cx=cell.cx;mob.cy=cell.cy;mob.x=(mob.cx+.5)/auth.gridW;mob.y=(mob.cy+.5)/auth.gridH;mob.sx=mob.x;mob.sy=mob.y;
        auth.pendingSpawns.push({mob,cx:mob.cx,cy:mob.cy,startedAt:Number(sp.startedAt)||auth.clock,blink:Number(sp.blink)||0,done:false});}}
    }
    descriptor.state.pendingSpawns=[];auth.pack=Math.max(auth.pack||0,auth.mobs.length||auth.pendingSpawns.length||auth.spawnPool.length||1);
    ensureSpawnIds(auth);
  }
  // Sincroniza a predição visual antes do step. Ela alinha efeitos e a vítima
  // perseguida, sem alterar fórmulas de dano, HP, loot ou recompensas.
  const visual=syncAuthorityVisualState(auth,visualState);
  const freezeVisual=!!((visual.players&&visual.players.length)||(visual.mobs&&visual.mobs.length));
  const total=Math.max(0,Number(elapsed)||0)+(Number(auth.carryMs)||0);
  const requested=Math.floor(total/AUTH_STEP_MS),steps=Math.min(250000,requested);auth.carryMs=total-steps*AUTH_STEP_MS;
  for(let i=0;i<steps;i++){auth.clock+=AUTH_STEP_MS;step(auth,auth.clock,{freezeVisual,dt:AUTH_STEP_MS});if(auth.ended){auth.carryMs=0;break;}}
  auth.clock=Math.max(auth.clock,Number(checkpointAt)||auth.clock);descriptor=materializeAuthority(descriptor);
  return {state:JSON.stringify(descriptor),characters:auth.players.map((item)=>({id:Number(item.id),data:JSON.stringify(item.p),level:item.p.level,voc:item.p.voc,
    hp:item.p.hp,mp:item.p.mp,max_hp:maxStats(item.p).hp,max_mp:maxStats(item.p).mp})),terminalReason:auth.ended?auth.terminalReason:null};
}
function protectedPlayer(descriptor,id){const auth=descriptor&&descriptor.authority;const item=auth&&auth.players.find((x)=>String(x.id)===String(id));return item?clone(item.p):null;}
module.exports={initializeAuthority,materializeAuthority,advanceAuthorityState,protectedPlayer,applyPvpLoss,expForLevel,maxStats,
  normalizeVisualState,blessingPrice,recordAuthSessionDeath,recordAuthSessionBless,partyCanShareExp,partyExpBonusPct,partyExpShare,MONSTERS,ITEMS,ALL_SPELLS,
  spawnHuntWave,openAuthBagYouDesire,
  MONKSPELLDATA,AREA_DATA,SPELL_TARGET,spellAreaCells,spellAreaTargets,spellChainTargets,
  bresenhamCells,spellChainPathCells,spellChainVisualPath,
  authorityStepDuration,advanceAuthorityMovement,
  applyCondition,applyResist,applyMonsterMitigation,applyOutgoingDamage,playerWeaponProfile,CONDITIONS,
  mobSkillRangeSQM,
  stanceTotals,stanceConvert,monkSpellElement,mantraAbsorve,mantraTotal,elementalBond,sanitizeStances,
  imbAllowedCats,imbCombatTotals,tryChallenge,playerAttackInterval,addExp,syncPlayerProgress,
  consumeDistanceAmmo,tryUseRune,RUNEDATA,
  meleeDamage,distanceDamage,addSkillTries,addManaSpent,playerDamage,playerSkill,attackSkillName,
  skillTriesNeeded,mlTriesNeeded,SKILL_MUL,VOC,gearSkillBonus,progressAttack,progressWeaponSkill,
  weaponAmmoKind,ammoCompatibleWithWeapon,ammoMatrixTargets,ammoMatrixCells,quiverPerfectShot,wandPerfectShot,weaponPerfectShot,distanceHitChance,
  rewardChestEnsure,rewardChestAdd,rewardChestClaimOne,rewardChestClaimBundle,rewardChestClaimAll,
  mobHasExtractedMelee,skillUsesMeleeBlock,creditHuntLoot,carriedWeight,freeCapacity,itemUnitWeight,accountIsVip,
  ensurePlayerCapacity,DEFAULT_PLAYER_CAP,
  CURRENCY_GOLD,
  shareAccountGoldWallets,sellAuthAllPouch,sellAuthPouchItem,sellAuthAllBag,sellAuthBagItem,destroyAuthPouchItem,setAuthAutoSupplyStash,setAuthLootConfig,
  ensureLootConfig,isAuthNoCollect,isAuthNoSell,tryAuthAutoSell,
  moveLootPouchToBag,authAddItemToBag,
  tryHaste,tryBuff,tryCureCondition,hasteActive,HASTEDATA,BUFFS,CHARMS,
  playerCritChancePct,playerCritExtraPct,rollPlayerCrit,imbCombatTotals,charmTotals,applyCharmDamage,
  tryCharmOffensive,buyCharm,assignCharm,clearCharm,afterPlayerHit,
  forgeProcChanceForEquipped,forgeOnslaughtChancePct,forgeRollOnslaught,forgeEquippedTier,
  forgeBootAmplificationPct,forgeTryRuse,forgeTryMomentum,forgeTryTranscendence,
  forgeTranscendenceDamagePct,forgeIncomingDamageMul,forgeAvatarActive,forgeNoteCombatAction,
  FORGE_PROC_CHANCES,FORGE_AMPLIFICATION,FORGE_ONSLAUGHT_BONUS_PCT,
  bestiaryKill,bosstiaryKill,bosstiaryDamageBonus,boostSpellDamage,boostHealAmount,scalePlayerDamage,
  tickDelayedHits,wheelApplySpellBoost,playerResistPct,augmentTotals,authoritySpeedPts,
  huntModeOf,boxTargetCell,safeTargetCell,playerAttackRangeSQM,
  wandMissileOf,physicalHitFx,basicHitFx,WAND_SHOOT,
  tickAccessoryCharges,tryAccessoryHelper,consumeAccessoryHitCharge,energyRingOn,
  isAutoSupplyStash,addSupplyStash,ensureSupplyStash,isSupplyStashableItem,moveItemToSupplyStash,
  moveItemFromSupplyStash,equipFromSupplyStash,removeSupplyStashCount,creditHuntLoot,
  equipFromContainerAuth,unequipFromContainerAuth,stashEquippedAuth,authCanAddToBag,autoAmmoForWeaponAuth,
  nextComboSpell,playerSpellList,spellValues,spellVisual,absorbIncomingDamage,authorityPlayerTarget,
  authorityMobTarget,authorityMobHasFollowPath,authorityFindPathStep,authorityCellBlocked,
  densestPackTarget,mobClusterDensity,packOpportunity,spellIsMultiHit,runeIsMultiHit,
  spellAreaFromCaster,spellAreaName,knightSpellFx,KNIGHT_EXORI,isMagicWeapon,
  CanaryVocation,spellAllowedForVoc,vocationRegenSpec,applyVocationRegen,applyVocationRegenTo,
  friendHealSpellIds,selfHealSpellIds,sanitizePlayerSpells,sanitizeCombo,
  isPvpInstance,instanceRewardMul,canPlayerDamagePlayer,playersAreAllies,livingHostilePlayers,
  applyPlayerPvpDamage,combatLivingFor,finalExp,
  soulwarTaintState,soulwarTaintLevel,soulwarInTaintZone,soulwarTaintDamageMultiplier,
  soulwarTaintExpMultiplier,soulwarGrantBossTaint,soulwarHasAllBossTaints,soulwarTaintPreventMonsterDeath,
  soulwarTaintSpawnNearPlayer,soulwarTaintTick,SOULWAR_TAINTS,SOULWAR_TAINT_BOSSES,HUNTS};
