/* Combate online autoritativo e determinístico (browser + worker). */
"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto"),vm=require("vm");
const DATA=path.join(__dirname,"..","game","data");
let WAND_SHOOT={};
try{WAND_SHOOT=require(path.join(__dirname,"..","game","js","wandshootdata.js"))||{};}
catch(e){WAND_SHOOT={};}
function read(name){return JSON.parse(fs.readFileSync(path.join(DATA,name),"utf8"));}
const MONSTERS=Object.assign({},read("monsters.json"),read("canarymonsters.json"));
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
    "exevo-fur-frigo":{blockWalls:1,needTarget:1,nome:"Forked Glacier",range:5,words:"exevo fur frigo"},
    "exevo-fur-tera":{blockWalls:1,needTarget:1,nome:"Forked Thorns",range:5,words:"exevo fur tera"},
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
  escala("exevo-mas-san",160/140);
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
      premium:true,needTarget:true,param:false,group:"attack",element:"ice",chain:7,range:5,
      fx:"forked-glacier-effect",missile:"ice",
      f:{modo:"magic",lvlMin:0.2,mlMin:3,flatMin:78,lvlMax:0.2,mlMax:4.5,flatMax:116},aggr:true},
    "exevo-fur-tera":{id:"exevo-fur-tera",sid:303,name:"Forked Thorns",words:"exevo fur tera",type:"attack",
      lvl:80,mana:180,soul:0,ml:0,icon:196,vocs:["druid"],cd:6000,grupos:{"1":2000},gcd:2000,
      premium:true,needTarget:true,param:false,group:"attack",element:"earth",chain:6,range:5,
      fx:"forked-thorns-effect",missile:"earth",
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
    "utito tempo":{fx:"stance-blood-rage"},"utamo tempo":{fx:"stance-protector"},
    "utori con":{fx:"stance-sharpshooter"},"utori hur":{fx:"stance-divine-defiance"},
    "uteta flam":{fx:"stance-master-flames"},"uteta vis":{fx:"stance-master-thunder"},
    "uteta mort":{fx:"stance-master-decay"},
    "exori kor tempo":{fx:"stance-sapped-strength"},"exori moe tempo":{fx:"stance-exposed-weakness"},
    "utura sio":{fx:"stance-shared-conservation"},"utito dru":{fx:"stance-elemental-synthesis"},
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
if(MONKSPELLDATA["exori-med-pug"])MONKSPELLDATA["exori-med-pug"].chain={alvos:6,dist:4};
if(MONKSPELLDATA["exori-gran-mas-nia"]){
  MONKSPELLDATA["exori-gran-mas-nia"].chain={alvos:8,dist:2};
  MONKSPELLDATA["exori-gran-mas-nia"].echo=0.5;
}
if(MONKSPELLDATA["exura-mas-nia"])delete MONKSPELLDATA["exura-mas-nia"].monk;
delete MONKSPELLDATA["uteta-tio"];
MONKSPELLDATA["exori-mas-amp-pug"]={
  cd:12000,element:"physical",fx:"thousand-fist-effect",gcd:2000,lvl:120,mana:145,
  monk:"builder",nome:"Thousand Fist Blows",pow:62,range:1,area:{raio:1,sqm:9},words:"exori mas amp pug"};
if(ALL_SPELLS["exori-med-pug"]&&MONKSPELLDATA["exori-med-pug"]&&MONKSPELLDATA["exori-med-pug"].chain){
  ALL_SPELLS["exori-med-pug"].chain=MONKSPELLDATA["exori-med-pug"].chain.alvos;
  ALL_SPELLS["exori-med-pug"].chainDist=MONKSPELLDATA["exori-med-pug"].chain.dist;
}
if(ALL_SPELLS["exori-gran-mas-nia"]&&MONKSPELLDATA["exori-gran-mas-nia"]){
  const md=MONKSPELLDATA["exori-gran-mas-nia"];
  if(md.chain){ALL_SPELLS["exori-gran-mas-nia"].chain=md.chain.alvos;ALL_SPELLS["exori-gran-mas-nia"].chainDist=md.chain.dist;}
  if(md.echo)ALL_SPELLS["exori-gran-mas-nia"].echo=md.echo;
}
Object.assign(POTIONS,{
  "supreme-health-potion":POTIONS["supreme-health-potion"]||{hp:[800,1000],mp:null,lvl:200,tipo:"hp",vocs:["knight"]},
  "ultimate-health-potion":POTIONS["ultimate-health-potion"]||{hp:[650,850],mp:null,lvl:130,tipo:"hp",vocs:["knight"]},
  "ultimate-spirit-potion":POTIONS["ultimate-spirit-potion"]||{hp:[420,580],mp:[250,350],lvl:130,tipo:"hpmp",vocs:["paladin","monk"]},
  "great-spirit-potion":POTIONS["great-spirit-potion"]||{hp:[250,350],mp:[100,200],lvl:80,tipo:"hpmp",vocs:["paladin","monk"]},
  "superior-mana-potion":POTIONS["superior-mana-potion"]||{mp:[240,360],lvl:100,tipo:"mp",vocs:["sorcerer","druid","paladin","monk"]},
  "distilled-superior-mana-potion":POTIONS["distilled-superior-mana-potion"]||{mp:[240,360],lvl:100,tipo:"mp",
    vocs:["sorcerer","druid","paladin","knight","monk"]},
  "distilled-ultimate-mana-potion":POTIONS["distilled-ultimate-mana-potion"]||{mp:[425,575],lvl:200,tipo:"mp",
    vocs:["sorcerer","druid","paladin","knight","monk"]},
});
// 15.25.3a4a52: great mana potion passou a ser de todas as vocações (EK incluso).
if(POTIONS["great-mana-potion"]){
  POTIONS["great-mana-potion"].vocs=["sorcerer","druid","paladin","knight","monk"];
}
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
  vm.runInNewContext(fs.readFileSync(path.join(js,"weapondata.js"),"utf8"),sandbox);
  sandbox.WEAPONDATA=sandbox.window.WEAPONDATA;
  vm.runInNewContext(fs.readFileSync(path.join(js,"weapons.js"),"utf8"),sandbox);
  if(typeof sandbox.fundirWeaponData==="function")sandbox.fundirWeaponData();
  vm.runInNewContext(fs.readFileSync(path.join(js,"accessorydata.js"),"utf8"),sandbox);
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
  it.s=it.s||"ammo";it.type=it.type||"ammo";it.slot=it.slot||"ammo";
}
if(ITEMS["diamond-arrow"])ITEMS["diamond-arrow"].areaFx="blue-electricity";
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
  "timira-room":{monsters:["timira-the-many-headed"]},
  "library-fire":{monsters:["burning-book","rage-squid","biting-book"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "library-energy":{monsters:["energetic-book","biting-book"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "library-ice":{monsters:["icecold-book","squid-warden","ink-blob"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "library-earth":{monsters:["cursed-book","biting-book"],cat:"hardcore",pack:12,packMin:10,packMax:12},
  "dark-thais":{monsters:["many-faces","knight-s-apparition","paladin-s-apparition","sorcerer-s-apparition","druid-s-apparition","monk-s-apparition","distorted-phantom"],cat:"hardcore",pack:10,packMin:8,packMax:10},
  "rotten-wasteland":{monsters:["rotten-golem","branchy-crawler","mould-phantom"],cat:"hardcore",pack:10,packMin:8,packMax:10},
  "goshnars-greed-room":{monsters:["goshnar-s-greed","dreadful-harvester","soulsnatcher","greedbeast","powerful-soul"]},
  "goshnars-hatred-room":{monsters:["goshnar-s-hatred","dreadful-harvester","hateful-soul"]},
  "scarlett-room":{monsters:["scarlett-etzel"]},
});
for(const slug of ["marapur-nagas","dt-seal"]){
  if(HUNTS[slug])Object.assign(HUNTS[slug],{cat:"hard",pack:10,packMin:6,packMax:10});
}
const VOC={none:{hp:5,mp:5,magic:3.0},knight:{hp:15,mp:5,magic:3.0},paladin:{hp:10,mp:15,magic:1.4},
  druid:{hp:5,mp:30,magic:1.1},sorcerer:{hp:5,mp:30,magic:1.1},monk:{hp:10,mp:10,magic:1.3}};
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
/* Cada monstro conserva o alvo enquanto ele estiver vivo. O cliente recebe o
 * mesmo targetId e anima a perseguição da vítima que realmente toma o dano;
 * antes o servidor sorteava outra pessoa a cada golpe enquanto a imagem
 * perseguia o mais próximo, deixando o combate visualmente sem causa/efeito. */
function authorityMobTarget(auth,mob){
  const alive=(auth.players||[]).filter((item)=>item&&item.p&&item.p.hp>0&&!item.downUntil);
  if(!alive.length)return null;
  const now=Number(auth.clock)||0;
  // Exeta Res / Amp Res: o monstro marcado ataca o knight que lançou, não o
  // membro que estava mais perto quando o alvo grudou.
  if(mob&&Number(mob.challengedUntil||0)>now){
    const knight=alive.find((item)=>String(item.id)===String(mob.challengeTargetId||""));
    if(knight){mob.targetId=String(knight.id);return knight;}
  }
  let target=alive.find((item)=>String(item.id)===String(mob.targetId||""));
  if(!target){target=alive.slice().sort((a,b)=>authorityVisualDistance(mob,a,auth)-authorityVisualDistance(mob,b,auth)||
      String(a.id).localeCompare(String(b.id)))[0];mob.targetId=String(target.id);}
  return target;
}
/* Cada personagem escolhe o próprio alvo pelo Helper: o mais próximo da
 * posição DELE, com as mesmas exceções de boss/imunidade do cliente. Sem
 * isso a party inteira disparava o combo no living[0] ao mesmo tempo. */
function authorityPlayerTarget(auth,item,living){
  const list=(living||auth.mobs||[]).filter((mob)=>mob&&mob.hp>0);
  if(!list.length)return null;
  if(auth.greed&&auth.greed.immune){
    const add=list.find((mob)=>!mob.boss);if(add)return add;
  }
  if(auth.hatred&&auth.hatred.active){
    const hateful=list.find((mob)=>mob.slug==="hateful-soul");
    const summon=hateful||list.find((mob)=>mob.hatredSummon);
    if(summon)return summon;
  }
  const boss=list.find((mob)=>mob.boss);
  if(boss&&!(auth.greed&&auth.greed.immune)&&!boss.greedImmune&&!boss.qteImmune)return boss;
  return list.slice().sort((a,b)=>authorityVisualDistance(item,a,auth)-authorityVisualDistance(item,b,auth)||
    String(a.id).localeCompare(String(b.id)))[0];
}
/* O payload visual não altera dano, chance, HP ou recompensa; ele só alinha
 * posição e seleção do alvo mais próximo. Limites e faixas impedem snapshots
 * arbitrariamente grandes ou coordenadas não renderizáveis. */
function sanitizeCombo(raw){
  const out=[];
  for(const slot of Array.isArray(raw)?raw.slice(0,6):[]){
    if(!slot||!slot.id){out.push(null);continue;}
    const kind=slot.kind==="rune"?"rune":"spell",id=String(slot.id).slice(0,80);
    if(kind==="spell"&&!ALL_SPELLS[id]){out.push(null);continue;}
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
  raw=raw&&typeof raw==="object"?raw:{};return{players:normalize(raw.players,8),mobs:normalize(raw.mobs,64)};
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
    if(combo){item.p=item.p||{};item.p.config=item.p.config||{};item.p.config.combo=combo;}
    if(stances){item.p=item.p||{};item.p.stances=sanitizeStances(stances,item.p);}
    if(typeof pos.autoWalk==="boolean"){item.p=item.p||{};item.p.config=item.p.config||{};item.p.config.autoWalk=pos.autoWalk;}
    if(pos.walkIntent)item.walkIntent=pos.walkIntent;else delete item.walkIntent;
    if(challenge){item.p=item.p||{};item.p.config=item.p.config||{};
      item.p.config.exetaRes=!!challenge.res;item.p.config.exetaAmpRes=!!challenge.amp;
      const mode=challenge.huntMode||(challenge.box?"box":"");
      if(mode==="box"||mode==="safe"||mode==="kiting")item.p.config.attackMode=mode;
      if(challenge.kiteDistance)item.p.config.kiteDistance=challenge.kiteDistance;
      if(mode==="box"||mode==="safe")auth.huntMode=mode;}
  }}
  const clock=Number(auth.clock)||0;
  for(const mob of auth.mobs||[]){
    const pos=mobs.get(String(mob.id));if(!pos)continue;
    // Enquanto o Challenge puxa o bicho para o knight, a predição ranged do
    // cliente não pode devolver o alvo à distância de tiro a cada tick.
    if((Number(mob.challengedUntil)||0)>clock||(Number(mob.forceMeleeUntil)||0)>clock)continue;
    applyPose(mob,pos);
  }
  return visual;
}
function expForLevel(level){return Math.floor((50/3)*(level**3-6*level**2+17*level-12));}
function maxStats(p){const level=Math.max(1,Number(p.level)||1),v=VOC[p.voc]||VOC.none;
  const rook=Math.min(level-1,7),voc=Math.max(0,level-1-rook);let hp=START_HP+rook*5+voc*v.hp,mp=START_MP+rook*5+voc*v.mp;
  for(const slot of Object.keys(p.equip||{})){const e=p.equip[slot],it=e&&ITEMS[e.item];if(it){hp+=Number(it.hp)||0;mp+=Number(it.mp)||0;}}
  if(WHEEL_FN&&typeof WHEEL_FN.wheelTotals==="function"){
    const w=WHEEL_FN.wheelTotals(p);hp+=Number(w&&w.hp)||0;mp+=Number(w&&w.mp)||0;
  }
  return {hp:Math.max(1,Math.floor(hp)),mp:Math.max(0,Math.floor(mp))};}
function blessingPrice(level){level=Math.max(1,Math.floor(Number(level)||1));return level*(level<=120?500:level<400?700:1000);}
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
  wound:{tipo:"dano",elemento:"physical",valor:5},enflame:{tipo:"dano",elemento:"fire",valor:5},
  poison:{tipo:"dano",elemento:"earth",valor:5},freeze:{tipo:"dano",elemento:"ice",valor:5},
  zap:{tipo:"dano",elemento:"energy",valor:5},curse:{tipo:"dano",elemento:"death",valor:5},
  cripple:{tipo:"utilidade"},parry:{tipo:"defesa",valor:5},dodge:{tipo:"defesa",valor:4},
  vampiric:{tipo:"defesa",valor:3},
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
const MONK_BUILDERS=["exori-infir-pug","exori-pug","exori-amp-pug","exori-mas-pug","exori-med-pug","exori-gran-mas-pug","exori-gran-pug","exori-mas-amp-pug"];
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
function addManaSpent(p,mana){
  if(!p)return false;
  const rate=serverMagicRate(Number(p.ml)||0);
  p.manaSpent=(Number(p.manaSpent)||0)+Math.max(0,Math.floor((Number(mana)||0)*rate));
  let up=false,need=mlTriesNeeded(p);
  while(p.manaSpent>=need){p.manaSpent-=need;p.ml=(Number(p.ml)||0)+1;up=true;need=mlTriesNeeded(p);}
  return up;
}
function progressWeaponSkill(p){
  const which=attackSkillName(p);
  if(which==="magic")return false;
  return addSkillTries(p,which,1);
}
function progressAttack(p){return progressWeaponSkill(p);}
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
  }else{
    let fis=it?Math.floor((Number(it.atk!==undefined?it.atk:it.attack)||0)*1.2):7;
    if(p.voc==="knight")fis=Math.floor(fis*1.3);
    const elDmg=(it&&it.el&&it.el!=="physical")?(Number(it.elDmg)||0):0;
    const d=meleeDamage(playerSkill(p),fis+elDmg,1,level);
    dmg=d.max<=d.min?d.min:roll(auth,d.min,d.max);
  }
  dmg=Math.max(1,Math.floor(dmg));
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
  if(mob&&(mob.greedImmune||mob.qteImmune))return 0;
  return applyMonsterMitigation(mob,element,applyResist(dmg,mob,element,0,now));
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
    return {element:el,type:"distance",projectile:true,missile:throwW?(e.item||"spear"):((ammo&&ammo.item)||"arrow")};
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
  if(pow>0){
    const skill=stanceSkill(p,spellSkillFor(p,s)),atk=spellAttackValue(p,s);
    const base=pow*(skill/100)*(atk/10)+Math.floor((Number(p.level)||1)/5);
    return{min:Math.floor(base-base/10),max:Math.floor(base+base/10)};
  }
  const f=s&&s.f;if(!f){const base=Math.max(4,(s&&s.mana?s.mana:20)*.9);return{min:Math.floor(base*.7),max:Math.floor(base*1.3)};}
  const level=Number(p.level)||1;let lo,hi;
  if(f.modo==="magic"){const ml=stanceMLBonus(p,s,(Number(p.ml)||0)+gearSkillBonus(p,"mag"));
    lo=(f.lvlMin||0)*level+(f.mlMin||0)*ml+(f.flatMin||0);
    hi=(f.lvlMax||0)*level+(f.mlMax||0)*ml+(f.flatMax||0);
  }else{const skill=stanceSkill(p,spellSkillFor(p,s));const atk=spellAttackValue(p,s);const sa=skill*atk;
    lo=(f.saMin||0)*sa+(f.skMin||0)*skill+(f.atMin||0)*atk+(f.lvlMin||0)*level+(f.flatMin||0);
    hi=(f.saMax||0)*sa+(f.skMax||0)*skill+(f.atMax||0)*atk+(f.lvlMax||0)*level+(f.flatMax||0);}
  lo=Math.max(0,lo);hi=Math.max(lo,hi);
  return{min:Math.floor(lo),max:Math.floor(hi)};
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
  const dx=target.cx-origin.cx,dy=target.cy-origin.cy;
  if(Math.abs(dx)>Math.abs(dy))return dx>=0?"e":"w";
  if(dy!==0)return dy>0?"s":"n";
  return dx>=0?"e":"w";
}
function spellAreaName(s){
  if(typeof(s&&s.area)==="string"&&s.area)return s.area;
  const meta=SPELL_TARGET[String(s&&s.id||"")]||{};
  return meta.areaNome||null;
}
function spellAreaFromCaster(name,s){
  const meta=SPELL_TARGET[String(s&&s.id||"")]||{};
  if(meta.self)return true;
  if(meta.needTarget||s&&s.needTarget)return false;
  if(AREA_ANCHORED_ON_TARGET.has(name))return false;
  const area=AREA_DATA[name],north=area&&area.n;
  return Array.isArray(north)&&!north.some((cell)=>Number(cell&&cell[1])>0);
}
/* Geometria oficial importada do register_spells.lua. A autoridade usa as
 * mesmas células do cliente: ondas/feixes nascem no caster e círculos self
 * ficam ao redor dele; áreas com target são ancoradas no alvo. */
function spellAreaCells(auth,s,caster,target){
  const name=spellAreaName(s),area=name&&AREA_DATA[name];
  if(!area||!caster||!target)return[];
  const origin=entityGridCell(caster,auth),aim=entityGridCell(target,auth),dir=spellAreaDirection(origin,aim),
    offsets=area[dir]||area.n;if(!Array.isArray(offsets))return[];
  const fromCaster=spellAreaFromCaster(name,s),base=fromCaster?origin:aim,
    skipOrigin=fromCaster&&/(WAVE|BEAM)/i.test(name),w=Number(auth&&auth.gridW)||30,h=Number(auth&&auth.gridH)||30,
    seen=new Set(),cells=[];
  for(const offset of offsets){
    const dx=Number(offset&&offset[0])||0,dy=Number(offset&&offset[1])||0;
    if(skipOrigin&&dx===0&&dy===0)continue;
    const cx=base.cx+dx,cy=base.cy+dy,key=cx+":"+cy;
    if(cx<0||cy<0||cx>=w||cy>=h||seen.has(key))continue;
    seen.add(key);cells.push({cx,cy});
  }
  return cells;
}
/* Chain genérica 15.25 (Lightning, Forked Glacier/Thorns): alvo + N-1
 * saltos para o vizinho mais próximo, sem janela de distância (diferente
 * da chain do Monk). Só vale quando não há matriz de área. */
function spellChainTargets(auth,s,target,living){
  const cap=Math.max(1,Math.floor(Number(s&&s.chain)||1));
  const maxDist=Number(s&&s.chainDist)||0;
  const lista=[],vistos=new Set();
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
    if(md&&md.chain)return spellChainTargets(auth,{chain:md.chain.alvos,chainDist:md.chain.dist},target,living);
    if(Number(s&&s.chain)>1)return spellChainTargets(auth,s,target,living);
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
 * Retorna as candidatas válidas para a escolha autoritativa. */
function playerSpellList(p){
  const config=p.config||{},legacy=config.spells||{},voc=p.voc,out=[],ids=[];
  if(config.spellAttack===false)return out;
  // Mesma configuração usada pelo Helper/barra de combo do browser. O mapa
  // `config.spells` é mantido apenas para saves antigos.
  for(const slot of Array.isArray(config.combo)?config.combo:[])if(slot&&slot.kind==="spell"&&slot.id)ids.push(slot.id);
  for(const id of Array.isArray(config.attackSpells)?config.attackSpells:[])ids.push(id);
  if(config.shooterType==="spell"&&config.shooterSpell)ids.push(config.shooterSpell);
  for(const id of Object.keys(legacy))if(legacy[id])ids.push(id);
  for(const id of [...new Set(ids)]){
    const s=ALL_SPELLS[id];if(!s)continue;
    if(s.type!=="attack"&&!s.aggr)continue;
    if(s.vocs&&s.vocs.length&&!s.vocs.includes(voc))continue;
    if(Number(s.lvl||0)>Number(p.level||1))continue;
    if(Number(s.mana||0)>Number(p.mp||0))continue;
    out.push(s);
  }
  // sem spells marcadas: usa a spell de ataque padrão da vocação
  if(!out.length){
    const defaults={knight:"exori",paladin:"exori-san",sorcerer:"exori-mort",druid:"exori-frigo",monk:"exori-pug"};
    const sid=defaults[voc];if(sid&&ALL_SPELLS[sid]){const s=ALL_SPELLS[sid];if(Number(s.lvl||0)<=Number(p.level||1))out.push(s);}
  }
  return out;
}
const DEFAULT_HEAL={knight:"exura-med-ico",paladin:"exura-gran-san",druid:"exura-vita",sorcerer:"exura-vita",monk:"exura-gran"};
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
function nextComboSpell(auth,item,p,now,primary,living){
  const config=p.config||{};
  const combo=Array.isArray(config.combo)?config.combo:[];
  const usable=(s)=>{
    if(!s)return false;
    if(s.type!=="attack"&&!s.aggr)return false;
    if(s.stance)return false;
    if(s.vocs&&s.vocs.length&&!s.vocs.includes(p.voc))return false;
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
  if(combo.some((slot)=>slot&&slot.id)){
    const livingN=(living||[]).filter((m)=>m&&m.hp>0).length;
    const multi=livingN>1,hasArea=combo.some((x)=>x&&Number(x.min)>1);
    const spellFits=(slot)=>{
      if(!slot||!slot.id||slot.kind==="rune")return false;
      if(slot.kind&&slot.kind!=="spell")return false;
      if(config.spellAttack===false)return false;
      if(multi&&hasArea&&Number(slot.min||1)<=1)return false;
      const s=ALL_SPELLS[slot.id];if(!usable(s))return false;
      if(Number(slot.min)>1&&(s.area||Number(s.chain)>1)&&primary){
        const n=spellAreaTargets(auth,s,item,primary,living).length;
        if(n<slot.min)return false;
      }
      return s;
    };
    const spellReady=combo.some((slot)=>!!spellFits(slot));
    for(const slot of combo){
      if(!slot||!slot.id)continue;
      if(slot.kind==="rune"){
        if(spellReady)continue;
        if(runeUsable(p,slot.id,now))return {rune:true,id:slot.id};
        continue;
      }
      const s=spellFits(slot);if(s)return s;
    }
    return null;
  }
  if(config.spellAttack===false)return null;
  const list=playerSpellList(p).filter(usable);
  if(!list.length)return null;
  let best=list[0],bestDmg=-1;
  for(const s of list){
    const sv=spellValues(auth,p,s),avg=(sv.min+sv.max)/2;
    if(avg>bestDmg){best=s;bestDmg=avg;}
  }
  return best;
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
function charmTotals(p){
  const t={dano:{},reflete:0,esquiva:0,vampirismo:0};
  if(!p||!p.charms||typeof p.charms!=="object")return t;
  for(const id of Object.keys(p.charms)){
    if(!p.charms[id])continue;const c=CHARMS[id];if(!c)continue;
    if(c.tipo==="dano"&&c.elemento)t.dano[c.elemento]=(t.dano[c.elemento]||0)+c.valor;
    else if(id==="parry")t.reflete+=c.valor;
    else if(id==="dodge")t.esquiva+=c.valor;
    else if(id==="vampiric")t.vampirismo+=c.valor;
  }
  return t;
}
function applyCharmDamage(p,element,dmg){
  const pc=charmTotals(p).dano[element]||0;
  if(!pc)return dmg;
  return Math.max(0,Math.floor(dmg*(1+pc/100)));
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
function rollPlayerCrit(auth,p,spellId){
  let chance=playerCritChancePct(p),extra=playerCritExtraPct(p);
  if(spellId){
    const aug=augmentTotals(p,spellId),wh=wheelApplySpellBoost(p,spellId);
    chance+=Number(aug.critChance)||0;chance+=Number(wh.critChance)||0;
    extra+=Number(aug.critDmg)||0;extra+=Number(wh.critDamage)||0;
  }
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
function applyOutgoingLeech(p,dmg){
  if(!p||!(dmg>0))return;
  const leech=imbLeechTotals(p),max=maxStats(p);
  if(leech.life>0)p.hp=Math.min(max.hp,p.hp+Math.max(1,Math.floor(dmg*leech.life/100)));
  if(leech.mana>0)p.mp=Math.min(max.mp,p.mp+Math.max(1,Math.floor(dmg*leech.mana/100)));
  if(WHEEL_FN){
    const wl=WHEEL_FN.wheelLeechTotals(p);
    if(wl.lifeLeech)p.hp=Math.min(max.hp,p.hp+Math.max(1,Math.floor(dmg*wl.lifeLeech/100)));
    if(wl.manaLeech)p.mp=Math.min(max.mp,p.mp+Math.max(1,Math.floor(dmg*wl.manaLeech/100)));
  }
  const vamp=charmTotals(p).vampirismo;
  if(vamp>0)p.hp=Math.min(max.hp,p.hp+Math.max(1,Math.floor(dmg*vamp/100)));
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
function accessoryChargesLedger(p){
  if(!p.ringCharges||typeof p.ringCharges!=="object")p.ringCharges={};
  return p.ringCharges;
}
function accessoryChargesOnEquip(p,slug){
  const it=ITEMS[slug];if(!it||!it.charges)return null;
  const resto=parseInt(accessoryChargesLedger(p)[slug],10);
  return resto>0?Math.min(resto,it.charges):it.charges;
}
function rememberAccessoryCharges(p,slug,charges){
  if(!slug)return;const ledger=accessoryChargesLedger(p);
  if(parseInt(charges,10)>0)ledger[slug]=parseInt(charges,10);else delete ledger[slug];
}
function takeInventoryCount(p,slug){
  if(!p||!slug)return false;
  p.bag=p.bag||{};p.lootPouch=p.lootPouch||{};p.supplies=p.supplies||{};
  if((Number(p.bag[slug])||0)>0){p.bag[slug]--;if(!p.bag[slug])delete p.bag[slug];return true;}
  if((Number(p.lootPouch[slug])||0)>0){p.lootPouch[slug]--;if(!p.lootPouch[slug])delete p.lootPouch[slug];return true;}
  if((Number(p.supplies[slug])||0)>0){p.supplies[slug]--;if(!p.supplies[slug])delete p.supplies[slug];return true;}
  return false;
}
function stashAccessoryToBag(p,slot){
  const e=p.equip&&p.equip[slot];if(!e||!e.item)return;
  rememberAccessoryCharges(p,e.item,e.charges);
  p.bag=p.bag||{};p.bag[e.item]=(Number(p.bag[e.item])||0)+1;
  delete p.equip[slot];
}
function accessoryEquipConfigured(p,slot,slug){
  const cur=p.equip&&p.equip[slot]&&p.equip[slot].item||"";
  if(!slug){if(cur)stashAccessoryToBag(p,slot);return true;}
  if(cur===slug)return true;
  const it=ITEMS[slug];if(!it||!accessoryVocOk(p,it))return false;
  if(!takeInventoryCount(p,slug))return false;
  if(cur)stashAccessoryToBag(p,slot);
  const charges=accessoryChargesOnEquip(p,slug);
  p.equip=p.equip||{};p.equip[slot]={item:slug};
  if(charges!=null){p.equip[slot].charges=charges;p.equip[slot].maxCharges=it.charges||charges;}
  return true;
}
function accessoryBreak(auth,p,slot,now){
  const e=p.equip&&p.equip[slot];if(!e||!e.item)return;
  const slug=e.item,it=ITEMS[slug],nome=(it&&it.n)||slug;
  delete accessoryChargesLedger(p)[slug];delete p.equip[slot];
  if(auth){const pos=playerPosition(auth,p);
    auth.events.push({t:"break",item:slug,name:nome,slot,targetId:String(p.id||""),x:pos.x,y:pos.y,screen:true,ts:now||auth.clock});}
  tryAccessoryHelper(auth,p,now||(auth&&auth.clock)||0);
}
function accessoryConsumeCharge(auth,p,slot,now){
  const e=p.equip&&p.equip[slot];if(!e||!e.item)return false;
  const it=ITEMS[e.item];if(!it||!it.charges)return false;
  if(e.charges===undefined)e.charges=it.charges;
  if(e.maxCharges===undefined)e.maxCharges=it.charges;
  e.charges=Math.max(0,parseInt(e.charges,10)-1);
  if(e.charges<=0){accessoryBreak(auth,p,slot,now);return true;}
  return true;
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
  if(!p||!p.equip||!dt)return;
  for(const slot of ["ring","amulet"]){
    const e=p.equip[slot];if(!e||!e.item)continue;
    const it=ITEMS[e.item];if(!it||!it.charges||it.chargeMode!=="time")continue;
    if(e.charges===undefined)e.charges=it.charges;
    if(e.maxCharges===undefined)e.maxCharges=it.charges;
    e._chargeAcc=(Number(e._chargeAcc)||0)+dt;
    while(e._chargeAcc>=3000){
      e._chargeAcc-=3000;
      e.charges=Math.max(0,parseInt(e.charges,10)-1);
      if(e.charges<=0){accessoryBreak(auth,p,slot,now);break;}
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
  const dodge=charmTotals(p).esquiva+(WHEEL_FN?Number(WHEEL_FN.wheelTotals(p).dodge)||0:0);
  if(dodge>0&&random(auth)*100<dodge){
    auth.events.push({t:"miss",x:pos.x,y:pos.y,reason:"dodge",targetId:String(item.id),screen:true,ts:now});
    return 0;
  }
  const dazzle=p&&p.buffs&&Number(p.buffs["exana-amp-res"])>now?0.35:0;
  if(dazzle&&random(auth)<dazzle){
    auth.events.push({t:"miss",x:pos.x,y:pos.y,reason:"dazzle",targetId:String(item.id),screen:true,ts:now});
    return 0;
  }
  if(dmg>0)consumeAccessoryHitCharge(auth,p,now);
  const st=stanceTotals(p);
  if(st.dmgReceived!==1)dmg=Math.max(0,Math.floor(dmg*st.dmgReceived));
  if(auth.hatred&&mob&&(mob.boss||mob.slug==="hateful-soul")){
    const n=Number(auth.hatred.counters&&auth.hatred.counters[String(item.id)])||0;
    if(n>0)dmg=Math.max(0,Math.floor(dmg*(1+n*0.10)));
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
  if(p.supplies&&Object.prototype.hasOwnProperty.call(p.supplies,slug))return true;
  const cfg=p.config||{};
  if(cfg.healSupply===slug||cfg.manaSupply===slug||cfg.shooterRune===slug)return true;
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

/* ---------- forge buffs (15.25) ---------- */
/* Momentum: 10% chance a cada kill de ganhar +25% dano por 10s.
 * Transcendence: 8% chance a cada kill de ganhar +50% dano por 8s.
 * Onslaught (Fatal): 5% chance a cada kill de ganhar crit garantido por 6s.
 * Ruse: 12% chance ao errar de ganhar +15% dano no próximo acerto. */
function forgeTryMomentum(p,now){
  if(!p.config||!p.config.forgeMomentum)return false;
  if(Math.random()<.10){p._momentumUntil=(now||Date.now())+10000;return true;}
  return false;
}
function forgeTryTranscendence(p,now){
  if(!p.config||!p.config.forgeTranscendence)return false;
  if(Math.random()<.08){p._transcendenceUntil=(now||Date.now())+8000;return true;}
  return false;
}
function forgeTryOnslaught(p){
  if(!p.config||!p.config.forgeOnslaught)return false;
  if(Math.random()<.05){p._onslaughtUntil=(Date.now())+6000;return true;}
  return false;
}
function forgeDamageMult(p,now){
  let m=1;
  if(p._momentumUntil&&(now||Date.now())<p._momentumUntil)m*=1.25;
  if(p._transcendenceUntil&&(now||Date.now())<p._transcendenceUntil)m*=1.50;
  return m;
}
function forgeGuaranteedCrit(p,now){
  return !!(p._onslaughtUntil&&(now||Date.now())<p._onslaughtUntil);
}

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
    alvo.hp=0;alvo.blessed=false;item.downUntil=now+30000;
    auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(item.id),screen:true,ts:now});
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
  if(p&&!stanceTotals(p).noBlock)addSkillTries(p,"shield",1);
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
function skillWaveDir(mob,pl){
  const dx=(Number(pl.cx)||0)-(Number(mob.cx)||0),dy=(Number(pl.cy)||0)-(Number(mob.cy)||0);
  if(Math.abs(dx)>Math.abs(dy))return dx>=0?{dx:1,dy:0}:{dx:-1,dy:0};
  return dy>=0?{dx:0,dy:1}:{dx:0,dy:-1};
}
function skillWaveCells(mob,pl,len,spread){
  const out=[];len=Math.max(1,len|0);spread=spread|0;
  const d=skillWaveDir(mob,pl),cols=spread>0?Math.floor((len-(len%spread))/spread)*2+1:1,
    centro=Math.floor(cols/2);let colSpread=cols;
  for(let y=1;y<=len;y++){
    const minOff=cols-colSpread-centro,maxOff=colSpread-1-centro;
    for(let h=minOff;h<=maxOff;h++)out.push({
      cx:(Number(mob.cx)|0)+d.dx*y+(d.dy!==0?h:0),cy:(Number(mob.cy)|0)+d.dy*y+(d.dx!==0?h:0)});
    if(spread>0&&y%spread===0)colSpread--;
  }
  return out;
}
function skillPatternCells(mob,pl,pattern){
  const out=[],d=skillWaveDir(mob,pl);
  for(let step=0;step<(pattern||[]).length;step++)for(const side of pattern[step]||[])
    out.push({cx:(Number(mob.cx)|0)+d.dx*(step+1)+(d.dy!==0?side:0),
      cy:(Number(mob.cy)|0)+d.dy*(step+1)+(d.dx!==0?side:0)});
  return out;
}
function mobSkillRangeSQM(sk){
  if((sk.range||0)>0)return Math.min(7,sk.range);
  if(sk.areaPattern&&sk.areaPattern.length)return sk.areaPattern.length;
  if(sk.length)return sk.length;
  if(sk.range===undefined||sk.range===null)return 99;
  if(sk.radius)return Math.max(1,sk.radius);
  return 1;
}
function mobSkillCells(mob,sk,victim){
  if(sk.areaPattern&&sk.areaPattern.length)return skillPatternCells(mob,victim,sk.areaPattern);
  if(sk.length)return skillWaveCells(mob,victim,sk.length,sk.spread||0);
  if(sk.radius){
    const centro=sk.alvo&&(sk.range||1)>1?victim:mob;
    return skillRadiusCells(Number(centro.cx)||0,Number(centro.cy)||0,sk.radius);
  }
  return [];
}
function mobSkillHitsTarget(mob,sk,victim){
  const cells=mobSkillCells(mob,sk,victim);
  if(!cells.length)return true;
  const key=(Number(victim.cx)|0)+":"+(Number(victim.cy)|0);
  return cells.some((cell)=>cell.cx+":"+cell.cy===key);
}
function runMobSkills(auth,mob,victim,now,stepTs,mobHitIdx){
  const def=mob.def||{},skills=Array.isArray(def.skills)?def.skills:[],defS=Array.isArray(def.defSkills)?def.defSkills:[];
  if(!skills.length&&!defS.length)return;
  mob.skillCds=mob.skillCds||{};
  const dist=authorityVisualDistance(mob,victim,auth);
  const pushFx=(sk)=>{
    const cells=mobSkillCells(mob,sk,victim),el=inferSkillElement(sk),fx=sk.fx||ELEMENT_FX[el]||ELEMENT_FX.physical;
    if(cells.length>1){auth.events.push({t:"areafx",cells,fx,screen:true,sourceId:String(mob.id),ts:stepTs+mobHitIdx*200});return;}
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
    if(item.p.hp<=0){item.p.hp=0;item.p.blessed=false;item.downUntil=now+30000;
      auth.events.push({t:"death",x:pos.x,y:pos.y,targetId:String(item.id),screen:true,ts:stepTs+mobHitIdx*200});}
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
        if(dist>mobSkillRangeSQM(sk))continue;
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
    if(dist>mobSkillRangeSQM(sk))continue;
    if(random(auth)*100>=(sk.ch===undefined?15:sk.ch))continue;
    mob.skillCds[key]=now+(sk.int||2000);
    const el=inferSkillElement(sk);
    pushFx(sk);
    if(!((sk.max||0)>0)){
      const tipo=sk.campo||sk.cond;
      if(tipo&&mobSkillHitsTarget(mob,sk,victim)){
        const danoC=sk.condDano||Math.max(1,Math.round((Number(mob.damage)||10)*.1));
        applyCondition(victim.p,tipo,danoC,4,auth,victim);
      }
      continue;
    }
    const raw=sk.min<sk.max?roll(auth,Number(sk.min)||0,Number(sk.max)||0):Number(sk.min)||0;
    const cells=mobSkillCells(mob,sk,victim);
    const victims=cells.length?(auth.players||[]).filter((item)=>item.p&&item.p.hp>0&&!item.downUntil&&mobSkillHitsTarget(mob,sk,item)):[victim];
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
function canonicalPlayer(member){const p=clone(member&&member.p||{});p.id=String(member.id);syncPlayerProgress(p);
  p.gold=Math.max(0,Number(p.gold)||0);p.skills=p.skills||{fist:10,sword:10,axe:10,club:10,dist:10,shield:10};
  p.skillTries=p.skillTries||{};p.supplies=p.supplies||{};p.lootPouch=p.lootPouch||{};p.ammo=p.ammo||{};p.kills=p.kills||{};p.bosses=p.bosses||{};p.stamina=FULL_STAMINA;
  p.conditions=p.conditions&&typeof p.conditions==="object"?p.conditions:{};
  rewardChestEnsure(p);
  const max=maxStats(p);p.hp=Math.min(max.hp,Math.max(1,Number(p.hp)||max.hp));p.mp=Math.min(max.mp,Math.max(0,Number(p.mp)||max.mp));return p;}
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
  const mob={id:id||("srv-"+sequence),slug:String(slug),boss:!!boss,influenced,fiendish,sinisterStacks:stacks,
    hp,maxHp:hp,armor:greedAdd?0:Math.max(0,Math.floor((Number(def.armor)||0)*(stacks?1+stacks*.05:1))),
    damage:Math.max(0,Math.floor((Number(def.damage)||0)*(stacks?1+stacks*.08:1))),
    exp:Math.max(0,Math.floor((Number(def.exp)||0)*(stacks?1+stacks*.25:1))),
    attackSpeed:Math.max(500,Number(def.attackSpeed)||2000),attackAcc:0,def};
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
function finalExp(p,mobExp,mobSlug){
  let exp=Math.max(0,Math.floor(Number(mobExp)||0));
  // Stage multiplier (rates.js)
  exp=Math.floor(exp*expStage(Number(p.level)||1));
  // Prey EXP bonus
  const prey=preyExpBonus(p,mobSlug);
  if(prey>0)exp=Math.floor(exp*(1+prey/100));
  // VIP EXP bonus
  exp=Math.floor(exp*vipExpBonus(p));
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
function isSupplyItem(slug){return !!(POTIONS[slug]||RUNES[slug]);}
function isAmmoItem(slug){
  const it=ITEMS[slug];
  return !!(AMMO[slug]||(it&&(it.s==="ammo"||it.type==="ammo"||it.slot==="ammo")));
}
function creditHuntLoot(p,slug,count){
  if(!p||!slug)return;
  count=Math.max(1,Math.floor(Number(count)||1));
  const unit=CURRENCY_GOLD[slug];
  if(unit){p.gold=(Number(p.gold)||0)+unit*count;return;}
  if(isSupplyItem(slug)){p.supplies=p.supplies||{};p.supplies[slug]=(Number(p.supplies[slug])||0)+count;return;}
  if(isAmmoItem(slug)){p.ammo=p.ammo||{};p.ammo[slug]=(Number(p.ammo[slug])||0)+count;return;}
  p.lootPouch=p.lootPouch||{};p.lootPouch[slug]=(Number(p.lootPouch[slug])||0)+count;
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
const SOULWAR_TAINT_BOSSES=["goshnar-s-malice","goshnar-s-spite","goshnar-s-greed","goshnar-s-hatred","goshnar-s-cruelty"];
function soulwarGrantBossTaint(p,bossId,now){
  if(!p||SOULWAR_TAINT_BOSSES.indexOf(String(bossId||""))===-1)return 0;
  p.soulWarTaints=p.soulWarTaints||{level:0,firstAt:0,bosses:{}};
  const st=p.soulWarTaints;st.bosses=st.bosses||{};
  if(st.bosses[bossId])return st.level||0;
  st.bosses[bossId]=true;if(!st.firstAt)st.firstAt=Number(now)||Date.now();
  st.level=Math.min(5,(Number(st.level)||0)+1);
  return st.level;
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
    const share=finalExp(item.p,portion,mob.slug);
    totalShare+=share;
    const beforeLevel=Number(item.p.level)||1;
    addExp(item.p,share);item.p.totalKills=(Number(item.p.totalKills)||0)+1;item.p.kills[mob.slug]=(Number(item.p.kills[mob.slug])||0)+1;
    bestiaryKill(item.p,mob.slug,1);
    if(mob.boss||(mob.def&&mob.def.boss))bosstiaryKill(item.p,mob.slug,1);
    shares.push({id:String(item.id),exp:share,level:item.p.level,leveled:item.p.level>beforeLevel});
    if(auth.huntId){item.p.missions=item.p.missions||{};const mission=item.p.missions[auth.huntId]||(item.p.missions[auth.huntId]={progress:{},claimed:{},completeClaimed:false});
      mission.progress=mission.progress||{};mission.progress[mob.slug]=(Number(mission.progress[mob.slug])||0)+1;}}
  auth._lastKillExp=shares[0]?shares[0].exp:0;auth._lastKillShares=shares;
  const leader=players[0]&&players[0].p;if(!leader)return [];
  const lootDrops=[];
  // Rate idle global (mesmo SERVER_LOOT_RATE=2.5 do cliente). NÃO é o 2.5×
  // extra do reward chest — boss chest só muda o destino (chest vs pouch).
  const lootRate=2.5;
  const preyLoot=preyLootBonus(leader,mob.slug);
  const chanceMult=lootRate*(1+preyLoot/100);
  if(!auth.rewardBundleId&&mob.boss)
    auth.rewardBundleId=String(auth.bossId||mob.slug)+"-"+String(auth.clock||stepTs||Date.now());
  const bossMeta=monsterDef(auth.bossId||mob.slug)||mob.def||{};
  const rewardSource=mob.boss?{
    bundleId:auth.rewardBundleId,bossId:auth.bossId||mob.slug,
    name:bossMeta.name||auth.bossId||mob.slug,sprite:auth.bossId||mob.slug}:null;
  for(const entry of mob.def.loot||[]){
    const chance=Math.min(100,(Number(entry.chance)||0)*chanceMult);
    if(random(auth)*100>chance)continue;
    const min=Math.max(1,Number(entry.min)||1),max=Math.max(min,Number(entry.max)||1),count=roll(auth,min,max);
    lootDrops.push({item:entry.item,count});
    if(mob.boss)rewardChestAdd(leader,entry.item,count,rewardSource);
    else creditHuntLoot(leader,entry.item,count);
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
      p._potionCd=now+1000;return true;
    }
    const rune=runeAsSpell(slug);
    if(rune&&rune.type==="heal"){
      if(Number(rune.lvl||0)>Number(p.level||1))return false;
      if(rune.ml&&Number(p.ml||0)<Number(rune.ml))return false;
      if(!consumeSupply(auth,p,slug))return false;
      p.hp=Math.min(max.hp,p.hp+Math.max(1,rollSpell(auth,p,rune)));
      p._potionCd=now+1000;return true;
    }
    return false;
  };
  if(!cfg.noHealthPotions&&!cfg.noPotions&&hpPct<=itemAt){
    for(const slug of orderOf(cfg.healSupply,HEALTH_POTION_ORDER))if(drink(slug))return true;
  }
  if(magicShieldActive(p,now))return false;
  if(!cfg.noManaPotions&&!cfg.noPotions&&mpPct<=manaAt){
    const selected=cfg.manaSupply;
    if(selected){
      const selectedOk=potionAllowed(p,selected,POTIONS[selected]||{});
      const manaOrder=selectedOk?orderOf(selected,MANA_POTION_ORDER)
        :MANA_POTION_ORDER.filter((slug)=>potionAllowed(p,slug,POTIONS[slug]));
      for(const slug of manaOrder)if(drink(slug))return true;
    }else{
      for(const slug of orderOf(null,MANA_POTION_ORDER))if(drink(slug))return true;
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
    item.mpRegenAcc=(Number(item.mpRegenAcc)||0)+max.mp*0.015*dt/1000;
    const regen=Math.floor(item.mpRegenAcc);
    if(regen>0){p.mp=Math.min(max.mp,p.mp+regen);item.mpRegenAcc-=regen;}
    const spellAt=Math.max(1,Math.min(99,Number(p.config&&(p.config.healSpellAt!==undefined?p.config.healSpellAt:p.config.healAt))||90));
    const hpPct=max.hp?(p.hp/max.hp)*100:100;
    item.healAcc=(Number(item.healAcc)||0)+dt;
    if(item.healAcc>=1000&&hpPct<=spellAt){
      const sid=(p.config&&p.config.healSpell)||DEFAULT_HEAL[p.voc],s=sid&&ALL_SPELLS[sid];
      const friendOnly=/sio$/.test(String(sid||""));
      if(s&&s.type==="heal"&&!friendOnly&&Number(s.lvl||0)<=Number(p.level||1)&&p.mp>=Number(s.mana||0)&&
         !((p._spellCd&&p._spellCd[s.id])>now)&&!spellGroupBusy(p,s,now)){
        const amount=boostHealAmount(auth,p,s,stanceHealAmount(p,rollSpell(auth,p,s)));
        let manaCost=Number(s.mana||0);
        const wh=wheelApplySpellBoost(p,s.id);
        if(wh.manaPct)manaCost=Math.max(0,Math.round(manaCost*(1-wh.manaPct/100)));
        p.mp=Math.max(0,p.mp-manaCost);
        addManaSpent(p,manaCost);
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
    const order=["exura-gran-mas-res","exura-gran-tio-sio","exura-gran-sio","exura-tio-sio","exura-sio"];
    healer.friendHealAcc=(Number(healer.friendHealAcc)||0)+Math.max(1,Number(auth._stepDt)||AUTH_STEP_MS);if(healer.friendHealAcc<1000)continue;
    const living=auth.players.filter((x)=>x.p.hp>0&&!x.downUntil);
    for(const sid of order){
      const rule=spells[sid];
      const enabled=rule?rule.enabled!==false:sid==="exura-gran-mas-res"||sid==="exura-sio"||sid==="exura-tio-sio";
      if(!enabled)continue;
      const s=ALL_SPELLS[sid];if(!s||Number(s.lvl||0)>Number(healer.p.level||1)||healer.p.mp<Number(s.mana||0))continue;
      if((healer.p._spellCd&&healer.p._spellCd[sid])>now||spellGroupBusy(healer.p,s,now))continue;
      const below=Number(rule&&(rule.hpBelow!==undefined?rule.hpBelow:rule.at))||70;
      const hurt=living.filter((x)=>x!==healer&&(x.p.hp/maxStats(x.p).hp)*100<below)
        .sort((a,b)=>a.p.hp/maxStats(a.p).hp-b.p.hp/maxStats(b.p).hp);
      const mass=sid==="exura-gran-mas-res";
      if(!hurt.length||(mass&&hurt.length<(Number(rule&&rule.minTargets)||2)))continue;
      const amount=Math.max(1,rollSpell(auth,healer.p,s));
      healer.p.mp-=Number(s.mana||0);
      addManaSpent(healer.p,s.mana);
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
  while(auth.mobs.filter((m)=>!m.boss&&m.hp>0).length<6){const r=random(auth),slug=r<.30?"greedbeast":choices[Math.min(2,Math.floor(((r-.30)/.70)*3))];
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
  if(!boss){auth.hatred=null;return;}
  st.counters=st.counters||{};
  for(const item of auth.players||[])if(st.counters[String(item.id)]===undefined)st.counters[String(item.id)]=0;
  while(st.active&&now>=st.nextCounterAt){
    for(const item of auth.players||[])if(item.p&&item.p.hp>0&&!item.downUntil)
      st.counters[String(item.id)]=(Number(st.counters[String(item.id)])||0)+1;
    fillHatred(auth);st.nextCounterAt+=5000;
  }
  fillHatred(auth);
}
function tickScarlett(auth,now){
  if(!auth.scarlett)return;
  const st=auth.scarlett,boss=(auth.mobs||[]).find((m)=>m.boss);
  if(!boss||boss.hp<=0){auth.scarlett=null;return;}
  if(st.phase==="waiting"&&now>=st.nextAt){st.phase="qte";st.immune=true;st.qteUntil=now+5500;}
  if(st.phase==="qte"&&now>=(Number(st.qteUntil)||0)){st.phase="vulnerable";st.immune=false;}
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
    if(!m.boss){m.greedImmune=false;m.qteImmune=false;continue;}
    m.greedImmune=!!(auth.greed&&auth.greed.immune);
    m.qteImmune=!!(auth.scarlett&&auth.scarlett.immune);
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
const AUTH_SPAWN_BLINK_MS=1000,AUTH_SPAWN_BLINKS=3;
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
function fullWipe(auth){const pvp=auth.instanceMode==="pvp";if(pvp)for(const item of auth.players)applyPvpLoss(item.p,auth.lastDamageSource||"monster");
  const cost=auth.players.reduce((sum,item)=>sum+blessingPrice(item.p.level),0),leader=auth.players[0]&&auth.players[0].p;
  if(leader&&leader.gold>=cost){leader.gold-=cost;for(const item of auth.players){const max=maxStats(item.p);item.p.hp=max.hp;item.p.mp=max.mp;item.p.blessed=true;item.downUntil=0;}
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
  if(nx<0||ny<0||nx>=w||ny>=h||occ.has(nx+":"+ny))return false;
  if(dir.diag&&(occ.has(nx+":"+cy)||occ.has(cx+":"+ny)))return false;
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
function boxTargetCell(auth,item,occ){
  const p=item&&item.p;if(!p)return null;
  const voc=String(p.voc||""),centro=boxCenter(auth),knight=boxKnightEnt(auth);
  const base=knight?entityGridCell(knight,auth):centro;
  if(/knight/.test(voc))return boxKnightSpot(auth,occ,base);
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
      }
      continue;
    }
    const goal=livingMobs.slice().sort((a,b)=>authorityVisualDistance(item,a,auth)-authorityVisualDistance(item,b,auth))[0];
    if(!goal)continue;
    const alcance=playerAttackRangeSQM(item.p);
    const here=entityGridCell(item,auth),to=entityGridCell(goal,auth),dist=chebyshevCells(here,to);
    if(mode==="kiting"&&alcance>1){
      const querido=Math.max(1,Math.min(alcance,Number(item.p.config&&item.p.config.kiteDistance)||3));
      if(dist!==querido)walkToward(item,to.cx,to.cy,querido,true);
    }else if(dist>alcance)walkToward(item,to.cx,to.cy,alcance,true);
  }
  for(const mob of livingMobs){
    const victim=authorityMobTarget(auth,mob);if(!victim)continue;
    const to=entityGridCell(victim,auth);
    walkToward(mob,to.cx,to.cy,authorityTargetDistance(mob,now),false);
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
  if(s.vocs&&s.vocs.length&&s.vocs.indexOf(p.voc)===-1)return null;
  if(Number(s.lvl||0)>Number(p.level||1))return null;
  if(Number(s.mana||0)>Number(p.mp||0))return null;
  if((p._spellCd&&p._spellCd[id])>now)return null;
  if(spellGroupBusy(p,s,now))return null;
  p.mp=Math.max(0,p.mp-Number(s.mana||0));
  addManaSpent(p,s.mana);
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
  let hitN=0;
  for(const tgt of targets){
    if(!tgt||tgt.hp<=0||tgt.greedImmune||tgt.qteImmune)continue;
    const dmg=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,Math.max(1,roll(auth,Math.floor(lo),Math.floor(hi))),now),now);
    if(dmg>0){tgt.hp-=dmg;applyOutgoingLeech(p,dmg);
      const pos=entityPosition(tgt,.5,.5);
      auth.events.push({t:"hit",dmg,el,fx,projectile:tgt===primary,missile:tgt===primary?missile:null,rune:rd.nome||id,
        x:pos.x,y:pos.y,race:tgt.def&&tgt.def.race||"blood",mobId:String(tgt.id),targetId:String(tgt.id),
        mobSlug:tgt.slug,whoId:String(item.id),sx:source.x,sy:source.y,ts:visualTs+hitN*20});}
    if(rd.cond)applyCondition(tgt,rd.cond.tipo||rd.cond,rd.cond.dano||Math.max(1,Math.floor(lo*.1)),rd.cond.golpes||4);
    stanceApplyDebuffs(p,tgt,now);hitN++;
  }
  if(areaCells.length>1)auth.events.push({t:"areafx",cells:areaCells,fx,spell:rd.nome||id,screen:true,ts:visualTs+20});
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
  tickHatred(auth,now);tickScarlett(auth,now);syncBossImmunityFlags(auth);
  tickDelayedHits(auth,now);
  for(const item of auth.players){
    const p=item.p;p.stamina=FULL_STAMINA;
    if(item.downUntil&&now>=item.downUntil){const max=maxStats(p);p.hp=max.hp;p.mp=max.mp;item.downUntil=0;p.conditions={};}
    usePotion(auth,p);
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
  }
  const living=auth.mobs.filter((m)=>m.hp>0);

  /* ---------- ATAQUE DOS PLAYERS ---------- */
  if(living.length)for(const item of auth.players){
    if(item.p.hp<=0||item.downUntil)continue;
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
      let acted=false;
      const s=nextComboSpell(auth,item,p,now,primaryTarget,living);
      if(s&&s.rune){
        acted=tryUseRune(auth,item,p,now,s.id,primaryTarget,living,visualTs);
      }else if(s){
            const originalEl=s.element||"physical";
            let el=monkSpellElement(p,s,originalEl);el=stanceConvert(p,el);
            const kind=monkSpellKind(s.id);let monkMult=1;
            if(kind==="spender")monkMult=harmonyBonus(p);
            let dmg=boostSpellDamage(p,s,Math.max(1,Math.floor(rollSpell(auth,p,s)*monkMult)));
            const stOut=stanceTotals(p);
            if(stOut.dmgDealt!==1)dmg=Math.max(1,Math.floor(dmg*stOut.dmgDealt));
            const elPct=stOut.elemPct[el]||0;
            if(elPct)dmg=Math.max(1,Math.floor(dmg*(1+elPct/100)));
            const areaName=spellAreaName(s);
            const areaCells=areaName?spellAreaCells(auth,s,item,primaryTarget):[];
            const md=MONKSPELLDATA[s.id];
            const echoFrac=Number(s.echo)||Number(md&&md.echo)||0;
            const targets=(areaName||Number(s.chain)>1||(md&&md.chain)||(md&&md.area))?spellAreaTargets(auth,s,item,primaryTarget,living):[primaryTarget];
            const forgeMult=forgeDamageMult(p,now);
            const guaranteedCrit=forgeGuaranteedCrit(p,now);
            const stanceExtra=stanceCritExtra(auth,p,el);
            const rolled=rollPlayerCrit(auth,p,s.id);
            let extraPct=stanceExtra,isCrit=!!(guaranteedCrit||stanceExtra||rolled.crit);
            if(rolled.crit)extraPct+=rolled.extraPct;
            if(guaranteedCrit)extraPct=Math.max(extraPct,playerCritExtraPct(p));
            const isFatal=isCrit&&random(auth)<0.05;
            const source=playerPosition(auth,p),visual=spellVisual(s);
            let fx=visual.fx||ELEMENT_FX[el]||ELEMENT_FX.physical;
            fx=stanceDamageFx(p,s,originalEl,el,fx);fx=monkFx(p,fx);fx=knightSpellFx(s,fx);
            const converted=el!==originalEl;
            const magical=!s.f||s.f.modo==="magic",
              missile=converted? (magical?(ELEMENT_MISSILE[el]||"energy"):null)
                :(visual.missile||(magical?(ELEMENT_MISSILE[el]||"energy"):null)),
              projectile=!!missile&&spellReach(s)>1,castVisualTs=visualTs;
            for(const tgt of targets){
              if(tgt.greedImmune||tgt.qteImmune){
                if(!auth._immuneFx||now-auth._immuneFx>500){
                  auth._immuneFx=now;const blocked=entityPosition(tgt,.5,.5);
                  auth.events.push({t:"block",x:blocked.x,y:blocked.y,screen:true,
                    greedImmune:!!tgt.greedImmune,qteImmune:!!tgt.qteImmune,ts:visualTs});
                }
                continue;
              }
              let finalDmg=Math.floor(dmg*forgeMult);
              if(extraPct)finalDmg=Math.floor(finalDmg*(1+extraPct/100));
              if(isFatal)finalDmg=Math.floor(finalDmg*1.5);
              const armaEl=spellWeaponElement(p,s);
              const target=entityPosition(tgt,.5,.5);
              const hitBase={x:target.x,y:target.y,race:tgt.def&&tgt.def.race||"blood",crit:isCrit,fatal:isFatal,
                mobId:String(tgt.id),targetId:String(tgt.id),mobSlug:tgt.slug,whoId:String(item.id),
                sx:source.x,sy:source.y,spell:s.name,spellId:s.id,ts:visualTs,
                exori:KNIGHT_EXORI.has(s.id)?1:0};
              if(armaEl&&!elementalBond(p)){
                const parts=splitDualParts(finalDmg,armaEl.propFisica);
                const fisFinal=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,parts.fis,now),now);
                const eleFinal=applyOutgoingDamage(tgt,armaEl.el,scalePlayerDamage(p,tgt,armaEl.el,parts.ele,now),now);
                const dealt=fisFinal+eleFinal;tgt.hp-=dealt;if(dealt>0)applyOutgoingLeech(p,dealt);
                if(fisFinal>0)auth.events.push(Object.assign({t:"hit",dmg:fisFinal,el,fx,projectile,missile:projectile?missile:null},hitBase));
                if(eleFinal>0)auth.events.push(Object.assign({t:"hit",dmg:eleFinal,el:armaEl.el,fx:ELEMENT_FX[armaEl.el]||fx,dual:1,projectile:false,missile:null},hitBase));
                if(echoFrac&&dealt>0){auth.delayedHits=auth.delayedHits||[];auth.delayedHits.push({at:now+1000,mobId:tgt.id,dmg:Math.max(1,Math.floor(dealt*echoFrac)),el,fx,whoId:item.id});}
              }else{
                finalDmg=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,finalDmg,now),now);
                if(finalDmg>0){tgt.hp-=finalDmg;applyOutgoingLeech(p,finalDmg);
                  auth.events.push(Object.assign({t:"hit",dmg:finalDmg,el,fx,projectile,missile:projectile?missile:null},hitBase));
                  if(echoFrac){auth.delayedHits=auth.delayedHits||[];auth.delayedHits.push({at:now+1000,mobId:tgt.id,dmg:Math.max(1,Math.floor(finalDmg*echoFrac)),el,fx,whoId:item.id});}}
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
            auth.events.push({t:"say",text:s.words||String(s.name||"").toLowerCase(),whoId:String(item.id),
              x:source.x,y:source.y,screen:true,ts:visualTs+40});
            if(s.mana){p.mp=Math.max(0,p.mp-s.mana);addManaSpent(p,s.mana);}
            if(!p._spellCd)p._spellCd={};
            p._spellCd[s.id]=(now||Date.now())+(s.cd||2000);
            p._lastSpellAt=now||Date.now();
            p._offensiveCd=(now||Date.now())+2000;
            if(s.grupos){p._groupCd=p._groupCd||{};
              for(const g of Object.keys(s.grupos))p._groupCd[g]=(now||Date.now())+Number(s.grupos[g]||s.cd||2000);}
            acted=true;
      }
      if(!acted&&!comboOn&&(p.config||{}).useRunes){
        const autoRune=(p.config&&p.config.shooterType==="rune"&&p.config.shooterRune)||null;
        if(autoRune)acted=tryUseRune(auth,item,p,now,autoRune,primaryTarget,living,visualTs);
        else{
          for(const slug of Object.keys(p.supplies||{})){
            if(runeUsable(p,slug,now)&&tryUseRune(auth,item,p,now,slug,primaryTarget,living,visualTs)){acted=true;break;}
          }
        }
      }

      // ATAQUE BÁSICO: independente do group CD de magia/runa (Tibia auto-attack).
      if(!acted){
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
          auth.events.push({t:"miss",x:missPos.x,y:missPos.y,reason:"ammo",whoId:String(item.id),screen:true,ts:visualTs});
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
        const forgeMult=forgeDamageMult(p,now);
        const guaranteedCrit=forgeGuaranteedCrit(p,now);
        const rolled=rollPlayerCrit(auth,p);
        const isCrit=guaranteedCrit||rolled.crit;
        const isFatal=isCrit&&random(auth)<0.05;
        let finalDmg=Math.floor(dmg*forgeMult);
        if(isCrit)finalDmg=Math.floor(finalDmg*(1+(guaranteedCrit?Math.max(rolled.extraPct,playerCritExtraPct(p)):rolled.extraPct)/100));
        if(isFatal)finalDmg=Math.floor(finalDmg*1.5);
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
          auth.events.push({t:"miss",x:target.x,y:target.y,whoId:String(item.id),screen:true,ts:visualTs});
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
              const dealt=fisFinal+eleFinal;tgt.hp-=dealt;if(dealt>0)applyOutgoingLeech(p,dealt);
              if(fisFinal>0)auth.events.push(Object.assign({t:"hit",dmg:fisFinal,el:"physical",fx:physicalHitFx(tgt.def&&tgt.def.race),
                projectile:!!profile.projectile&&!splash,missile:splash?null:(profile.missile||null)},base));
              if(eleFinal>0)auth.events.push(Object.assign({t:"hit",dmg:eleFinal,el:convEl,fx:ELEMENT_FX[convEl]||ELEMENT_FX.physical,
                dual:1,projectile:false,missile:null},base));
            }else{
              raw=applyOutgoingDamage(tgt,el,scalePlayerDamage(p,tgt,el,raw,now),now);
              if(raw>0){tgt.hp-=raw;applyOutgoingLeech(p,raw);
                auth.events.push(Object.assign({t:"hit",dmg:raw,el,fx:basicHitFx(p,profile,tgt,el,ammoIt),
                  projectile:!!profile.projectile&&!splash,missile:splash?null:(profile.missile||null)},base));}
            }
            stanceApplyDebuffs(p,tgt,now);
            if(!splash&&ammoIt&&ammoIt.poison)applyCondition(tgt,"poison",ammoIt.poison.dmg||ammoIt.poison,ammoIt.poison.turns||5);
          };
          if(landed){
            strike(primaryTarget,false);
            if(perfect>0&&primaryTarget.hp>0){
              primaryTarget.hp-=perfect;applyOutgoingLeech(p,perfect);
              const tpos=entityPosition(primaryTarget,.5,.5);
              auth.events.push(Object.assign({t:"hit",dmg:perfect,el:"physical",fx:physicalHitFx(primaryTarget.def&&primaryTarget.def.race),
                perfect:1,projectile:false},hitBase,{x:tpos.x,y:tpos.y}));
            }
          }
          else auth.events.push({t:"miss",x:target.x,y:target.y,whoId:String(item.id),screen:true,ts:visualTs});
          for(const extra of areaMobs)if(extra!==primaryTarget||!landed)strike(extra,extra!==primaryTarget);
          if(ammoIt&&ammoIt.areaMatrix){
            const cells=ammoMatrixCells(auth,ammoIt.areaMatrix,primaryTarget);
            if(cells.length)auth.events.push({t:"areafx",cells,fx:ammoIt.areaFx||"explosion-area",el,screen:true,ts:visualTs+20});
          }
        }
        progressAttack(p);
      }
      hitIdx++;
    }
  }

  /* ---------- MORTE DE MONSTROS ---------- */
  const dead=auth.mobs.filter((m)=>m.hp<=0);auth.mobs=auth.mobs.filter((m)=>m.hp>0);
  for(const mob of dead){
    if(auth.greed&&auth.greed.immune&&mob.slug==="greedbeast"){
      auth.greed.greedbeastKills++;if(auth.greed.greedbeastKills>=5){auth.greed.immune=false;auth.greed.greedbeastKills=0;auth.greed.vulnerableUntil=now+40000;}}
    if(auth.hatred&&mob.hatredSummon){
      const counters=auth.hatred.counters||(auth.hatred.counters={});
      if(mob.slug==="hateful-soul"){for(const key of Object.keys(counters))counters[key]=0;}
      else{for(const key of Object.keys(counters))counters[key]=Math.max(0,(Number(counters[key])||0)-1);}
    }
    // Forge buffs on kill
    const leader=auth.players[0],leaderPos=entityPosition(leader,.13,.6);
    if(leader&&leader.p.hp>0){
      if(forgeTryMomentum(leader.p,now))auth.events.push({t:"buff",nome:"Momentum",x:leaderPos.x,y:leaderPos.y,whoId:String(leader.id),screen:true,ts:stepTs+800});
      if(forgeTryTranscendence(leader.p,now))auth.events.push({t:"buff",nome:"Transcendence",x:leaderPos.x,y:leaderPos.y,whoId:String(leader.id),screen:true,ts:stepTs+800});
      if(forgeTryOnslaught(leader.p))auth.events.push({t:"buff",nome:"Onslaught",x:leaderPos.x,y:leaderPos.y,whoId:String(leader.id),screen:true,ts:stepTs+800});
    }
    // Evento de kill para o cliente
    const lootDrops=reward(auth,mob,auth.players,stepTs),deadPos=entityPosition(mob,.5,.5);
    auth.events.push({t:"kill",mob:mob.slug,mobId:String(mob.id),targetId:String(mob.id),name:mob.def?mob.def.name:mob.slug,
      exp:Number(auth._lastKillExp)||0,gained:Number(auth._lastKillExp)||0,shares:auth._lastKillShares||[],
      loot:lootDrops,x:deadPos.x,y:deadPos.y,
      screen:true,boss:!!mob.boss,influenced:!!mob.influenced,fiendish:!!mob.fiendish,
      ts:stepTs+800});
    if(mob.boss){auth.ended=true;auth.terminalReason="boss-defeated";auth.bossDefeated=true;
      if(leader){leader.p.bosses[auth.bossId]=leader.p.bosses[auth.bossId]||{};leader.p.bosses[auth.bossId].kills=(leader.p.bosses[auth.bossId].kills||0)+1;}
      for(const item of auth.players)soulwarGrantBossTaint(item.p,auth.bossId||mob.slug,now);}
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
          auth.events.push({t:"miss",x:missPos.x,y:missPos.y,targetId:String(victim.id),dodge:true,screen:true,ts:mobVisualTs});
        }else{
        let damage=mobDamage(auth,mob,victim.p);
        if(auth.greed&&auth.greed.immune&&mob.boss)damage=Math.floor(damage*.7);
        const target=entityPosition(victim,.13,.6),source=entityPosition(mob,.5,.5);
        const el=mob.def&&mob.def.element||"physical";
        const ranged=(Number(mob.def&&mob.def.targetDistance)||1)>1;
        damage=absorbIncomingDamage(auth,victim,victim.p,damage,now,target,el,mob);
        victim.p.hp-=damage;
        auth.events.push({t:"taken",dmg:damage,x:target.x,y:target.y,targetId:String(victim.id),
          sx:source.x,sy:source.y,sourceId:String(mob.id),el,fx:ELEMENT_FX[el]||ELEMENT_FX.physical,
          projectile:ranged,missile:ranged?(ELEMENT_MISSILE[el]||"small-stone"):null,
          screen:true,ts:mobVisualTs});
        applyMonsterMeleeCondition(auth,victim,victim.p,mob);
        if(victim.p.hp<=0){victim.p.hp=0;victim.p.blessed=false;victim.downUntil=now+30000;
          auth.events.push({t:"death",x:target.x,y:target.y,targetId:String(victim.id),screen:true,ts:mobVisualTs});
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
  if(!auth.ended&&auth.kind==="hunt")spawnHuntWave(auth,stepTs);
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
    const item={id,p:canonicalPlayer(m),attackAcc:0,downUntil:0};
    for(const key of ["cx","cy","x","y","sx","sy"])if(old[key]!==undefined)item[key]=old[key];return item;});
  const auth={v:2,rngState:seedFor(instanceId),nextMobId:1,clock:Number(now)||Date.now(),carryMs:0,kind:descriptor.kind,
    huntId:descriptor.huntId||null,bossId:descriptor.bossId||null,instanceMode:descriptor.instanceMode||"non-pvp",
    huntMode:(players[0]&&players[0].p&&players[0].p.config&&players[0].p.config.attackMode)||"",players,mobs:[],spawnPool:[],spawnPoints:[],
    pendingSpawns:[],
    influencedChance:Math.max(0,Number(combat.influencedChance)||
      (INFLUENCED_BASE_CHANCE+(descriptor.instanceMode==="pvp"?INFLUENCED_PVP_BONUS:0))),
    fiendishChance:Math.max(0,Number(combat.fiendishChance)||
      (FIENDISH_BASE_CHANCE+(descriptor.instanceMode==="pvp"?FIENDISH_PVP_BONUS:0))),
    gridW:Number(combat.gridW)||30,gridH:Number(combat.gridH)||30,
    pack:Math.max(1,visual.length||pendingIn.length||Number((HUNTS[descriptor.huntId]||{}).pack)||3),
    wave:visual.length||pendingIn.length?1:0,
    stats:{startedAt:Number(now)||Date.now(),time:0,kills:0,exp:0,rawExp:0,rawHp:0,loot:{},monsters:{},
      supplyUsed:{},supplyCost:0,supplyBought:{}},wipes:0,ended:false,terminalReason:null,lastDamageSource:"monster"};
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
  if(descriptor.kind==="boss"){const boss=auth.mobs.find((m)=>m.boss)||auth.mobs[0];if(boss)boss.boss=true;const leader=players[0]&&players[0].p;
    if(leader&&auth.bossId){leader.bosses[auth.bossId]=leader.bosses[auth.bossId]||{};leader.bosses[auth.bossId].lastFight=auth.clock;}
    if(auth.bossId==="goshnar-s-greed"){auth.greed={immune:true,greedbeastKills:0,vulnerableUntil:0};fillGreed(auth);}
    if(auth.bossId==="goshnar-s-hatred"){
      auth.hatred={active:true,nextCounterAt:auth.clock+5000,counters:{}};
      for(const item of players)auth.hatred.counters[String(item.id)]=0;
      const initial=3+Math.min(2,Math.floor(random(auth)*3));
      let first=true;
      while(auth.mobs.filter((m)=>m.hatredSummon).length<initial){
        const slug=first?"hateful-soul":(random(auth)<.10?"hateful-soul":"dreadful-harvester");
        first=false;if(!hatredMakeSummon(auth,slug))break;
      }
    }
    if(auth.bossId==="scarlett-etzel"){
      auth.scarlett={immune:true,phase:"waiting",nextAt:auth.clock+5000+Math.floor(random(auth)*5001),
        thresholdIndex:0,thresholds:[0.75,0.50,0.25]};
      if(boss)boss.qteImmune=true;
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
    {id:item.id,p:clonePlayerState(item.p),hp:item.p.hp,mp:item.p.mp,reviveAt:item.downUntil||0})));
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
      qteImmune:!!(auth.scarlett&&auth.scarlett.immune&&m.boss),hatredSummon:!!m.hatredSummon,
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
    nextCounterAt:Number(auth.hatred.nextCounterAt)||0}:null;
  descriptor.state.scarlett=auth.scarlett?{immune:!!auth.scarlett.immune,phase:auth.scarlett.phase||"waiting",
    nextAt:Number(auth.scarlett.nextAt)||0,qteUntil:Number(auth.scarlett.qteUntil)||0,
    thresholdIndex:Number(auth.scarlett.thresholdIndex)||0,thresholds:auth.scarlett.thresholds||[0.75,0.50,0.25]}:null;
  descriptor.state.stats=Object.assign({},descriptor.state.stats||{},auth.stats);descriptor.state.bossDefeated=!!auth.bossDefeated;descriptor.state.dead=auth.ended&&auth.terminalReason==="party-wipe";
  // Grid dimensions: o renderer usa combat.gridW/gridH para calcular o
  // viewport e converter posições normalizadas (0-1) em pixels. Sem isso,
  // o renderer cai no fallback GRID_W=21 e os floaters saem na posição
  // errada (o grid real pode ser 30x30).
  descriptor.state.gridW=Number(auth.gridW)||30;descriptor.state.gridH=Number(auth.gridH)||30;
  descriptor.state.wave=Number(auth.wave)||0;
  descriptor.state.huntMode=auth.huntMode||"";
  descriptor.state.authClock=Number(auth.clock)||0;
  descriptor.state.pendingSpawns=(auth.pendingSpawns||[]).map((sp)=>({
    cx:sp.cx,cy:sp.cy,startedAt:sp.startedAt,blink:sp.blink,
    mob:sp.mob?{id:sp.mob.id,slug:sp.mob.slug,hp:sp.mob.hp,maxHp:sp.mob.maxHp}:null
  }));
  // Eventos de combate (dano/cura) gerados pelo step() desde o último tick.
  // O cliente drena esses eventos via drainEvents() para mostrar floaters e
  // logs de dano no modo online. Corta o lote: área × vocações ainda pode
  // gerar dezenas de hits/areafx por segundo e travar a aba.
  const MAX_AUTH_EVENTS=120;
  let events=Array.isArray(auth.events)?auth.events:[];
  if(events.length>MAX_AUTH_EVENTS){
    const keep=new Set(["taken","hit","kill","death","heal","heal-friend","say","dust","areafx","mobheal","spawn","spawn-blink","buff","cured","break"]);
    events=events.filter((e)=>keep.has(e&&e.t)).concat(events.filter((e)=>!keep.has(e&&e.t))).slice(0,MAX_AUTH_EVENTS);
  }
  descriptor.state.events=events;
  auth.events=[];
  descriptor.savedAt=auth.clock;return descriptor;
}
function advanceAuthorityState(serialized,elapsed,checkpointAt,visualState){let descriptor=typeof serialized==="string"?JSON.parse(serialized):clone(serialized);
  const auth=descriptor.authority;if(!auth)return null;
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
  normalizeVisualState,blessingPrice,partyCanShareExp,partyExpBonusPct,partyExpShare,MONSTERS,ITEMS,ALL_SPELLS,
  AREA_DATA,SPELL_TARGET,spellAreaCells,spellAreaTargets,spellChainTargets,
  authorityStepDuration,advanceAuthorityMovement,
  applyCondition,applyResist,applyMonsterMitigation,playerWeaponProfile,CONDITIONS,
  stanceTotals,stanceConvert,monkSpellElement,mantraAbsorve,mantraTotal,elementalBond,sanitizeStances,
  imbAllowedCats,imbCombatTotals,tryChallenge,playerAttackInterval,addExp,syncPlayerProgress,
  consumeDistanceAmmo,tryUseRune,RUNEDATA,
  meleeDamage,distanceDamage,addSkillTries,addManaSpent,playerDamage,playerSkill,attackSkillName,
  skillTriesNeeded,mlTriesNeeded,SKILL_MUL,VOC,gearSkillBonus,progressAttack,progressWeaponSkill,
  weaponAmmoKind,ammoCompatibleWithWeapon,ammoMatrixTargets,ammoMatrixCells,quiverPerfectShot,wandPerfectShot,weaponPerfectShot,distanceHitChance,
  rewardChestEnsure,rewardChestAdd,rewardChestClaimOne,rewardChestClaimBundle,rewardChestClaimAll,
  mobHasExtractedMelee,skillUsesMeleeBlock,creditHuntLoot,
  tryHaste,tryBuff,tryCureCondition,hasteActive,HASTEDATA,BUFFS,CHARMS,
  playerCritChancePct,playerCritExtraPct,rollPlayerCrit,imbCombatTotals,charmTotals,applyCharmDamage,
  bestiaryKill,bosstiaryKill,bosstiaryDamageBonus,boostSpellDamage,boostHealAmount,scalePlayerDamage,
  tickDelayedHits,wheelApplySpellBoost,playerResistPct,augmentTotals,authoritySpeedPts,
  huntModeOf,boxTargetCell,safeTargetCell,playerAttackRangeSQM,
  wandMissileOf,physicalHitFx,basicHitFx,WAND_SHOOT,
  tickAccessoryCharges,tryAccessoryHelper,consumeAccessoryHitCharge,energyRingOn,
  nextComboSpell,spellValues,spellVisual,absorbIncomingDamage,authorityPlayerTarget,
  spellAreaFromCaster,spellAreaName,knightSpellFx,KNIGHT_EXORI,isMagicWeapon};
