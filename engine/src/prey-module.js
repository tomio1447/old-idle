/**
 * prey-module.js — Prey System module for engine (Canary protocol)
 * 3 slots, 4 bonuses, 10 rarities, auto-reroll, lock, wildcards, timer
 */
"use strict";
const PREY_SLOT_COUNT=3,PREY_LIST_SIZE=9,PREY_BONUS_TIME_SEC=2*3600,PREY_FREE_REROLL_SEC=20*3600;
const PREY_REROLL_PRICE_PER_LEVEL=200,PREY_SELECT_LIST_PRICE=5,PREY_BONUS_REROLL_PRICE=1,PREY_PERMANENT_SLOT_COST=250000;
const PreySlot={One:0,Two:1,Three:2};
const PreyDataState={Locked:0,Inactive:1,Active:2,Selection:3,SelectionChangeMonster:4,ListSelection:5,WildcardSelection:6};
const PreyBonus={Damage:0,Defense:1,Experience:2,Loot:3,None:4};
const PreyOption={None:0,AutomaticReroll:1,Locked:2};
const PreyAction={ListReroll:0,BonusReroll:1,MonsterSelection:2,ListAllCards:3,ListAllSelection:4,Option:5};
function bonusValue(type,rarity){if(type===PreyBonus.Damage)return 2*rarity+5;if(type===PreyBonus.Defense)return 2*rarity+10;return 3*rarity+10;}
class PreySlotData{constructor(id){this.id=id;this.bonus=PreyBonus.None;this.state=PreyDataState.Locked;this.option=PreyOption.None;this.raceIdList=[];this.bonusRarity=1;this.selectedRaceId=0;this.bonusPercentage=0;this.bonusTimeLeft=0;this.freeRerollTimeStamp=0;}
isOccupied(){return this.selectedRaceId!==0&&this.bonusTimeLeft>0;}
eraseBonus(maintainBonus=false){if(!maintainBonus){this.bonus=PreyBonus.None;this.bonusPercentage=5;this.bonusRarity=1;}this.state=PreyDataState.Selection;this.option=PreyOption.None;this.selectedRaceId=0;this.bonusTimeLeft=0;}
reloadBonusType(){if(this.bonusRarity===10){const old=this.bonus;let n;do{n=Math.floor(Math.random()*4)}while(n===old);this.bonus=n;}else{this.bonus=Math.floor(Math.random()*4);}}
reloadBonusValue(){if(this.bonusRarity>=9)this.bonusRarity=10;else this.bonusRarity=this.bonusRarity+1+Math.floor(Math.random()*(10-this.bonusRarity));this.bonusPercentage=bonusValue(this.bonus,this.bonusRarity);}}
class PreyManager{constructor(){this.slots=[];this.wildcards=0;for(let i=0;i<PREY_SLOT_COUNT;i++){const s=new PreySlotData(i);if(i===0||i===1){s.state=PreyDataState.Inactive;s.freeRerollTimeStamp=Date.now()+PREY_FREE_REROLL_SEC*1000;}this.slots.push(s);}}
toJSON(){return{slots:this.slots.map(s=>({id:s.id,bonus:s.bonus,state:s.state,option:s.option,raceIdList:s.raceIdList,bonusRarity:s.bonusRarity,selectedRaceId:s.selectedRaceId,bonusPercentage:s.bonusPercentage,bonusTimeLeft:s.bonusTimeLeft,freeRerollTimeStamp:s.freeRerollTimeStamp})),wildcards:this.wildcards};}
static fromJSON(data){const pm=new PreyManager();if(!data||!data.slots)return pm;pm.wildcards=data.wildcards||0;for(let i=0;i<PREY_SLOT_COUNT&&i<data.slots.length;i++)Object.assign(pm.slots[i],data.slots[i]);return pm;}
handleAction(player,slotIdx,action,optOrIdx,raceId){const slot=this.slots[slotIdx];if(!slot)return{ok:false,msg:"Slot inválido."};const agora=Date.now();switch(action){
case PreyAction.ListReroll:{const free=slot.freeRerollTimeStamp<=agora;const cost=player.level*PREY_REROLL_PRICE_PER_LEVEL;if(!free){if(player.gold<cost)return{ok:false,msg:"Gold insuficiente."};player.gold-=cost;}slot.freeRerollTimeStamp=agora+PREY_FREE_REROLL_SEC*1000;slot.state=PreyDataState.Selection;slot.selectedRaceId=0;return{ok:true,free,cost:free?0:cost};}
case PreyAction.BonusReroll:{if(slot.state!==PreyDataState.Active)return{ok:false,msg:"Prey não ativa."};if(this.wildcards<PREY_BONUS_REROLL_PRICE)return{ok:false,msg:"Wildcards insuficientes."};this.wildcards-=PREY_BONUS_REROLL_PRICE;slot.reloadBonusType();slot.reloadBonusValue();slot.bonusTimeLeft=PREY_BONUS_TIME_SEC;return{ok:true,bonus:slot.bonus,rarity:slot.bonusRarity,value:slot.bonusPercentage};}
case PreyAction.MonsterSelection:{if(optOrIdx<0||optOrIdx>=slot.raceIdList.length)return{ok:false,msg:"Índice inválido."};slot.selectedRaceId=slot.raceIdList[optOrIdx];slot.reloadBonusType();slot.reloadBonusValue();slot.bonusTimeLeft=PREY_BONUS_TIME_SEC;slot.state=PreyDataState.Active;return{ok:true,raceId:slot.selectedRaceId,bonus:slot.bonus,rarity:slot.bonusRarity,value:slot.bonusPercentage};}
case PreyAction.ListAllCards:{if(this.wildcards<PREY_SELECT_LIST_PRICE)return{ok:false,msg:"Wildcards insuficientes."};this.wildcards-=PREY_SELECT_LIST_PRICE;slot.state=PreyDataState.ListSelection;return{ok:true,wildcardsLeft:this.wildcards};}
case PreyAction.ListAllSelection:{if(slot.state!==PreyDataState.ListSelection)return{ok:false,msg:"Slot não está em lista completa."};slot.selectedRaceId=raceId;slot.reloadBonusType();slot.reloadBonusValue();slot.bonusTimeLeft=PREY_BONUS_TIME_SEC;slot.state=PreyDataState.Active;return{ok:true,raceId,};}
case PreyAction.Option:{if(slot.state!==PreyDataState.Active)return{ok:false,msg:"Opção só com prey ativa."};if(optOrIdx===PreyOption.Locked){if(this.wildcards<PREY_SELECT_LIST_PRICE)return{ok:false,msg:"Wildcards insuficientes."};this.wildcards-=PREY_SELECT_LIST_PRICE;}slot.option=optOrIdx;return{ok:true,option:slot.option};}
default:return{ok:false,msg:"Ação desconhecida."};}}
tick(dt){const events=[],sec=dt/1000;for(let i=0;i<PREY_SLOT_COUNT;i++){const slot=this.slots[i];if(!slot.isOccupied())continue;slot.bonusTimeLeft=Math.max(0,slot.bonusTimeLeft-sec);if(slot.bonusTimeLeft<=0){if(slot.option===PreyOption.AutomaticReroll&&this.wildcards>=PREY_BONUS_REROLL_PRICE){this.wildcards-=PREY_BONUS_REROLL_PRICE;slot.reloadBonusType();slot.reloadBonusValue();slot.bonusTimeLeft=PREY_BONUS_TIME_SEC;events.push({slot:i,type:"auto-reroll"});}else if(slot.option===PreyOption.Locked&&this.wildcards>=PREY_SELECT_LIST_PRICE){this.wildcards-=PREY_SELECT_LIST_PRICE;slot.bonusTimeLeft=PREY_BONUS_TIME_SEC;events.push({slot:i,type:"lock-renewed"});}else{slot.eraseBonus();events.push({slot:i,type:"expired"});}}}return events;}}
module.exports={PreyManager,PreySlotData,PREY_SLOT_COUNT,PREY_LIST_SIZE,PREY_BONUS_TIME_SEC,PREY_FREE_REROLL_SEC,PREY_REROLL_PRICE_PER_LEVEL,PREY_SELECT_LIST_PRICE,PREY_BONUS_REROLL_PRICE,PREY_PERMANENT_SLOT_COST,PreySlot,PreyDataState,PreyBonus,PreyOption,PreyAction,bonusValue};
