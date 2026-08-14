/* Treino: ticks do dummy e do Treiner usam as mesmas animações Canary. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game");
function must(ok,msg){if(!ok)throw Error(msg);}

const citySrc=fs.readFileSync(path.join(game,"js","city.js"),"utf8");
const trainSrc=fs.readFileSync(path.join(game,"js","training.js"),"utf8");
const ctx={
  console, SKILL_NAMES:{sword:"Sword",axe:"Axe",club:"Club",
    dist:"Distance",shield:"Shielding",fist:"Fist",magic:"Magic Level"},
  VOCATIONS:{knight:{attackSpeed:2000}},
  academyStatus(){return {ok:true,skill:"sword"};},
  dummyRate(){return 1;}, addSkillTries(){return false;}, addManaSpent(){return false;},
  playerDamage(){return {min:10,max:20};}, stopAcademy(){},
  academyAttackDelay(t,p){return 2000;},
  missileDir(){return "e";}, cellCenter(cell){return {x:(cell.x+0.5)/21,y:(cell.y+0.5)/13};},
  setGridForMap(){}, huntMapFromOtbmAsync(){}, HUNTMAPS:{}, G:{},
  vipExerciseSpeed(){return 1;},
};
vm.createContext(ctx);
vm.runInContext(trainSrc,ctx,{filename:"training.js"});
vm.runInContext(citySrc,ctx,{filename:"city.js"});
ctx.academyStatus=function(){return {ok:true,skill:"sword"};};
ctx.weaponSkill=function(){return "sword";};
ctx.dummyRate=function(){return 1;};
ctx.academyAttackDelay=function(){return 2000;};
ctx.EXERCISE_WEAPONS=ctx.EXERCISE_WEAPONS||{
  "exercise-sword":{skill:"sword"},"exercise-axe":{skill:"axe"},
  "exercise-club":{skill:"club"},"exercise-bow":{skill:"dist"},
  "exercise-rod":{skill:"magic"},"exercise-wand":{skill:"magic"},
  "exercise-shield":{skill:"shield"},"exercise-wraps":{skill:"fist"},
};

must(typeof ctx.trainingWeaponFx==="function","trainingWeaponFx ausente");
must(ctx.trainingWeaponFx({mode:"dummy",weapon:"exercise-sword"}).fx==="hit-area",
  "espada do dummy não usa hit-area Canary");
must(ctx.trainingWeaponFx({mode:"dummy",weapon:"exercise-bow"}).missile==="arrow",
  "arco do dummy não usa flecha Canary");
must(ctx.trainingWeaponFx({mode:"online",skill:"sword"},{voc:"knight"}).fx==="hit-area",
  "treino online não reusa hit-area da exercise sword");
must(ctx.trainingWeaponFx({mode:"online",skill:"magic"},{voc:"druid"}).fx==="ice-attack",
  "druid online não usa ice-attack da rod");

const p={voc:"knight",level:50,ml:10,mp:1000,stamina:42*3600,config:{},
  exercise:{},skills:{sword:10,axe:10,club:10,dist:10,shield:10,fist:10}};
ctx.ensureTraining(p);
for(const id in ctx.EXERCISE_WEAPONS)p.exercise[id]=5000;

const dummy=ctx.newAcademyTraining(p,"dummy","exercise-club",null);
dummy.hitCd=0;
ctx.academyTrainingTick(dummy,p,100,Date.now());
must(dummy.proj&&dummy.proj.fx==="hit-area"&&dummy.proj.missile==="whirlwind-club",
  "tick dummy club sem animação Canary");
must(p.exercise["exercise-club"]===4999,"dummy não consumiu 1 carga");

const online=ctx.newAcademyTraining(p,"online",null,null);
online.hitCd=0;
const charges=p.exercise["exercise-sword"];
ctx.academyTrainingTick(online,p,100,Date.now());
must(online.proj&&online.proj.fx==="hit-area",
  "tick online sem hit-area Canary");
must(online.lungeT>0,"tick online sem lunge");
must(p.exercise["exercise-sword"]===charges,"treino online consumiu carga de dummy");

console.log("OK: treino dummy/online usa hit-area Canary nos ticks.");
