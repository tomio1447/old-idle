"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const game=path.join(__dirname,"..","game");
function must(ok,msg){if(!ok)throw Error(msg);}
const ctx={console,Date,Math,Infinity,SKILL_NAMES:{sword:"Sword",axe:"Axe",club:"Club",dist:"Distance",shield:"Shielding",fist:"Fist"},VOCATIONS:{knight:{attackSpeed:2000}},
  vipExerciseSpeed(){return 1;},cellCenter(c){return{x:(c.x+.5)/20,y:(c.y+.5)/20};},weaponSkill(){return"sword";},academyStatus(){return{ok:true,skill:"sword"};},
  addSkillTries(p,s,n){p.gains=(p.gains||0)+n;return false;},addManaSpent(p,n){p.gains=(p.gains||0)+n;return false;},playerDamage(){return{min:1,max:2};},missileDir(){return"s";},G:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(game,"js","training.js"),"utf8"),ctx,{filename:"training.js"});
vm.runInContext(fs.readFileSync(path.join(game,"js","city.js"),"utf8"),ctx,{filename:"city.js"});
const mk=(id)=>({id:String(id),name:"P"+id,voc:"knight",skills:{fist:10,sword:10,axe:10,club:10,dist:10,shield:10},skillTries:{},ml:0,manaSpent:0,config:{}});
const a=mk(1),b=mk(2);ctx.ensureTraining(a);ctx.ensureTraining(b);
must(a.trainingExercise.activePlan==="free"&&ctx.exerciseCharges(a)===Infinity,"entrada não concede arma grátis infinita");
a.trainingExercise.skill="club";a.trainingExercise.activePlan="exercise";a.trainingExercise.balances.exercise=2;
b.trainingExercise.skill="magic";b.trainingExercise.activePlan="lasting";b.trainingExercise.balances.lasting=2;
const dummy=vm.runInContext("TRAINING_DUMMY_ABS",ctx),queue=vm.runInContext("TRAINING_QUEUE_ABS",ctx),dummyId=vm.runInContext("TRAINING_DUMMY_ITEM_ID",ctx);
const map={sourceBounds:{x:1000,y:1000}},ma=ctx.buildTrainingMember(a,0,map),mb=ctx.buildTrainingMember(b,1,map),tr={members:[ma,mb],dummyPos:ctx.trainingLocalPoint(map,dummy)};
ma.hitCd=mb.hitCd=0;ctx.trainingPartyTick(tr,100,Date.now());
must(a.trainingExercise.balances.exercise===1&&b.trainingExercise.balances.lasting===1,"cargas não são exclusivas por personagem");
must(a.gains===7*1.25*2,"bônus de 125% ou shielding incorreto");
must(b.gains===600*1.5+7*1.5,"bônus de 150% mágico incorreto");
must(ma.facing==="s"&&mb.facing==="s","fila não está virada ao sul");
must(ma.proj&&ma.proj.fx===vm.runInContext('EXERCISE_FX["exercise-club"].fx',ctx),"EXERCISE_FX não reutilizado");
must(dummyId===30616&&dummy.x===1013&&dummy.y===1022,"dummy incorreto");
must(queue.map(p=>p.x).join(",")==="1011,1012,1013,1014"&&queue.every(p=>p.y===1021&&p.z===7),"fila absoluta incorreta");
console.log("OK: treino multi-personagem, planos, cargas, posições e FX.");
