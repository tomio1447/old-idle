/* Combate online autoritativo e determinístico (browser + worker). */
"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const DATA=path.join(__dirname,"..","game","data");
function read(name){return JSON.parse(fs.readFileSync(path.join(DATA,name),"utf8"));}
const MONSTERS=Object.assign({},read("monsters.json"),read("canarymonsters.json"));
const ITEMS=read("items.json"),AMMO=read("ammo.json"),QUIVER_DATA=read("quivers.json"),QUIVERS=QUIVER_DATA.quivers||{};
const SPELLS_RAW=read("spells.json"),ALL_SPELLS=SPELLS_RAW.spells||SPELLS_RAW,SPELL_FX=read("spellfx.json"),
  AREA_DATA=read("areas.json"),SPELL_TARGET=read("spelltarget.json");
for(const slug of Object.keys(AMMO)){const raw=AMMO[slug];ITEMS[slug]=Object.assign({},ITEMS[slug]||{},raw,
  {name:raw.n||slug,slot:"ammo",type:"ammo",attack:Number(raw.atk)||0,level:Number(raw.lvl)||0});}
for(const slug of Object.keys(QUIVERS)){const raw=QUIVERS[slug];ITEMS[slug]=Object.assign({},ITEMS[slug]||{},raw,
  {name:raw.nome||slug,slot:"shield",type:"quiver",level:Number(raw.lvl)||0});}
const HUNTS=Object.assign(read("hunts.json"),{
  "mota-extension":{monsters:["floating-savant","retching-horror","fury","hellhound","demon"]},
  "cobra-bastion":{monsters:["cobra-vizier","cobra-scout","cobra-assassin"]},
  "timira-room":{monsters:["timira-the-many-headed"]},
  "library-fire":{monsters:["burning-book","rage-squid","biting-book"]},
  "library-energy":{monsters:["energetic-book","biting-book"]},
  "library-ice":{monsters:["icecold-book","squid-warden","ink-blob"]},
  "library-earth":{monsters:["cursed-book","biting-book"]},
  "dark-thais":{monsters:["many-faces","knight-s-apparition","paladin-s-apparition","sorcerer-s-apparition","druid-s-apparition","monk-s-apparition","distorted-phantom"]},
  "rotten-wasteland":{monsters:["rotten-golem","branchy-crawler","mould-phantom"]},
  "goshnars-greed-room":{monsters:["goshnar-s-greed","dreadful-harvester","soulsnatcher","greedbeast","powerful-soul"]},
  "goshnars-hatred-room":{monsters:["goshnar-s-hatred","dreadful-harvester","hateful-soul"]},
});
const VOC={none:{hp:5,mp:5},knight:{hp:15,mp:5},paladin:{hp:10,mp:15},druid:{hp:5,mp:30},sorcerer:{hp:5,mp:30},monk:{hp:10,mp:10}};
const START_HP=185,START_MP=5,FULL_STAMINA=42*3600;
const INFLUENCED_BASE_CHANCE=.004,INFLUENCED_PVP_BONUS=.004,
  FIENDISH_BASE_CHANCE=.0012,FIENDISH_PVP_BONUS=.0008;
const ELEMENT_FX={physical:"draw-blood",fire:"hit-by-fire",ice:"ice-attack",energy:"energy-damage",
  earth:"hit-by-poison",death:"mort-area",holy:"holy-damage"};
const ELEMENT_MISSILE={physical:"small-stone",fire:"fire",ice:"ice",energy:"energy",earth:"earth",death:"death",holy:"holy"};
function clone(v){return JSON.parse(JSON.stringify(v||{}));}
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
  let target=alive.find((item)=>String(item.id)===String(mob.targetId||""));
  if(!target){target=alive.slice().sort((a,b)=>authorityVisualDistance(mob,a,auth)-authorityVisualDistance(mob,b,auth)||
      String(a.id).localeCompare(String(b.id)))[0];mob.targetId=String(target.id);}
  return target;
}
/* O payload visual não altera dano, chance, HP ou recompensa; ele só alinha
 * posição e seleção do alvo mais próximo. Limites e faixas impedem snapshots
 * arbitrariamente grandes ou coordenadas não renderizáveis. */
function normalizeVisualState(raw,auth){
  auth=auth||{};const normalize=(list,limit)=>{const out=[];
    for(const input of Array.isArray(list)?list:[]){if(out.length>=limit)break;
      const id=String(input&&input.id||"");
      if(!id||id.length>128||input.x===null||input.x===undefined||input.y===null||input.y===undefined)continue;
      const x=Number(input.x),y=Number(input.y);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)continue;
      const item={id,x,y},cx=input.cx===null||input.cx===undefined?NaN:Number(input.cx),
        cy=input.cy===null||input.cy===undefined?NaN:Number(input.cy);
      if(Number.isFinite(cx))item.cx=Math.max(0,Math.min((Number(auth.gridW)||30)-1,Math.round(cx)));
      if(Number.isFinite(cy))item.cy=Math.max(0,Math.min((Number(auth.gridH)||30)-1,Math.round(cy)));
      out.push(item);}
    return out;};
  raw=raw&&typeof raw==="object"?raw:{};return{players:normalize(raw.players,8),mobs:normalize(raw.mobs,64)};
}
function syncAuthorityVisualState(auth,raw){const visual=normalizeVisualState(raw,auth),players=new Map(visual.players.map((v)=>[v.id,v])),
  mobs=new Map(visual.mobs.map((v)=>[v.id,v]));
  for(const item of auth.players||[]){const pos=players.get(String(item.id));if(pos)Object.assign(item,pos);}
  for(const mob of auth.mobs||[]){const pos=mobs.get(String(mob.id));if(pos)Object.assign(mob,pos);}
  return visual;
}
function expForLevel(level){return Math.floor((50/3)*(level**3-6*level**2+17*level-12));}
function maxStats(p){const level=Math.max(1,Number(p.level)||1),v=VOC[p.voc]||VOC.none;
  const rook=Math.min(level-1,7),voc=Math.max(0,level-1-rook);let hp=START_HP+rook*5+voc*v.hp,mp=START_MP+rook*5+voc*v.mp;
  for(const slot of Object.keys(p.equip||{})){const e=p.equip[slot],it=e&&ITEMS[e.item];if(it){hp+=Number(it.hp)||0;mp+=Number(it.mp)||0;}}
  return {hp:Math.max(1,Math.floor(hp)),mp:Math.max(0,Math.floor(mp))};}
function blessingPrice(level){level=Math.max(1,Math.floor(Number(level)||1));return level*(level<=120?500:level<400?700:1000);}
function seedFor(id){return parseInt(crypto.createHash("sha256").update(String(id)).digest("hex").slice(0,8),16)||1;}
function random(auth){let x=Number(auth.rngState)||1;x^=x<<13;x^=x>>>17;x^=x<<5;auth.rngState=x>>>0;return auth.rngState/4294967296;}
function roll(auth,min,max){return Math.floor(min+random(auth)*(max-min+1));}
function monsterDef(slug){return MONSTERS[String(slug)]||null;}
function weaponAttack(p){const e=p.equip&&p.equip.weapon,it=e&&ITEMS[e.item],a=p.equip&&p.equip.ammo,ammo=a&&ITEMS[a.item];
  const base=Number(it&&(it.attack!==undefined?it.attack:it.atk))||0,shot=it&&it.type==="distance"&&ammo?Number(ammo.attack||ammo.atk)||0:0;
  return Math.max(7,base+shot||7);}
function attackSkillName(p){if(p.voc==="paladin")return "dist";if(p.voc==="monk")return "fist";
  const e=p.equip&&p.equip.weapon,it=e&&ITEMS[e.item],type=it&&String(it.type||it.t||"");return ["sword","axe","club"].includes(type)?type:"fist";}
function playerSkill(p){const skills=p.skills||{},which=attackSkillName(p);return Number(skills[which])||10;}
function progressAttack(p){
  if(p.voc==="druid"||p.voc==="sorcerer"){
    p.manaSpent=(Number(p.manaSpent)||0)+5;let need=Math.floor(400*Math.pow(1.18,Number(p.ml)||0));
    while(p.manaSpent>=need){p.manaSpent-=need;p.ml=(Number(p.ml)||0)+1;need=Math.floor(400*Math.pow(1.18,p.ml));}return;
  }
  const which=attackSkillName(p);p.skills=p.skills||{};p.skillTries=p.skillTries||{};p.skills[which]=Number(p.skills[which])||10;
  p.skillTries[which]=(Number(p.skillTries[which])||0)+1;let need=Math.floor(50*Math.pow(1.1,p.skills[which]-10));
  while(p.skillTries[which]>=need){p.skillTries[which]-=need;p.skills[which]++;need=Math.floor(50*Math.pow(1.1,p.skills[which]-10));}
}
function playerDamage(auth,p,mob){const level=Number(p.level)||1,skill=playerSkill(p),magic=p.voc==="druid"||p.voc==="sorcerer";
  const power=magic?level*.45+(Number(p.ml)||0)*2.8+12:level*.25+skill*.72+weaponAttack(p)*1.15;
  let dmg=Math.max(1,Math.floor(power*(.85+random(auth)*.3)-(Number(mob.armor)||0)*.35));
  // Prey damage bonus
  const preyDmg=preyDamageBonus(p,mob.slug);
  if(preyDmg>0)dmg=Math.floor(dmg*(1+preyDmg/100));
  return dmg;}

/* ---------- elementos e resistências (Canary) ---------- */
const ELEMENT_KEYS=["physical","fire","energy","earth","ice","holy","death","lifedrain","manadrain","heal"];
function mobResist(mob,element){
  const r=mob.def&&mob.def.resist;
  if(!r)return 0;
  const v=Number(r[element]);
  if(!isFinite(v))return 0;
  return v; // percent: 50 = toma 50% menos; -12 = toma 12% mais
}
function applyResist(dmg,mob,element){
  const r=mobResist(mob,element);
  if(r===0)return dmg;
  // 100% = imune; >100 heals; negative = weak
  if(r>=100)return 0;
  return Math.max(0,Math.floor(dmg*(1-r/100)));
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
  const f=s&&s.f;if(!f){const base=Math.max(4,(s&&s.mana?s.mana:20)*.9);return{min:Math.floor(base*.7),max:Math.floor(base*1.3)};}
  const level=Number(p.level)||1;let lo,hi;
  if(f.modo==="magic"){const ml=Number(p.ml)||0;
    lo=(f.lvlMin||0)*level+(f.mlMin||0)*ml+(f.flatMin||0);
    hi=(f.lvlMax||0)*level+(f.mlMax||0)*ml+(f.flatMax||0);
  }else{const skill=Number(p.skills&&p.skills[spellSkillFor(p,s)])||10;const atk=spellAttackValue(p,s);const sa=skill*atk;
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
  const meta=SPELL_TARGET[String(s&&s.id||"")]||{},name=typeof(s&&s.area)==="string"?s.area:meta.areaNome,
    area=name&&AREA_DATA[name];
  if(!area||!caster||!target)return[];
  const origin=entityGridCell(caster,auth),aim=entityGridCell(target,auth),dir=spellAreaDirection(origin,aim),
    offsets=area[dir]||area.n;if(!Array.isArray(offsets))return[];
  const fromCaster=spellAreaFromCaster(name,s),base=fromCaster?origin:aim,
    wave=fromCaster&&/WAVE/i.test(name),w=Number(auth&&auth.gridW)||30,h=Number(auth&&auth.gridH)||30,
    seen=new Set(),cells=[];
  for(const offset of offsets){
    const dx=Number(offset&&offset[0])||0,dy=Number(offset&&offset[1])||0;
    if(wave&&dx===0&&dy===0)continue;
    const cx=base.cx+dx,cy=base.cy+dy,key=cx+":"+cy;
    if(cx<0||cy<0||cx>=w||cy>=h||seen.has(key))continue;
    seen.add(key);cells.push({cx,cy});
  }
  return cells;
}
function spellAreaTargets(auth,s,caster,target,living){
  const cells=spellAreaCells(auth,s,caster,target);
  if(!cells.length){
    const count=spellTargets(s);
    return [target].concat((living||[]).filter((mob)=>mob!==target&&mob.hp>0)
      .sort((a,b)=>authorityVisualDistance(a,target,auth)-authorityVisualDistance(b,target,auth))
      .slice(0,count-1));
  }
  const covered=new Set(cells.map((cell)=>cell.cx+":"+cell.cy)),inside=(living||[]).filter((mob)=>{
    if(!mob||mob.hp<=0)return false;const cell=entityGridCell(mob,auth);return covered.has(cell.cx+":"+cell.cy);
  });
  const meta=SPELL_TARGET[String(s&&s.id||"")]||{};
  if(meta.self)return inside;
  return inside.includes(target)?inside:[target].concat(inside);
}
function spellReach(s){if(s.range&&s.range>0)return s.range;if(s.area)return 4;return 1;}
function spellVisual(s){const words=String(s&&s.words||"").toLowerCase(),name=String(s&&s.name||"").toLowerCase(),
  imported=SPELL_FX.words&&SPELL_FX.words[words]||SPELL_FX.names&&SPELL_FX.names[name]||{};
  return{fx:s&&s.fx||imported.fx||null,missile:s&&s.missile||imported.miss||null};}

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

/* ---------- conditions (poison/fire/bleed/energy/curse) ---------- */
/* p.conditions = { poison: {dmg, turns}, fire: {...}, ... }
 * Cada tick (1s) decrementa turns e aplica dmg. */
function tickPlayerConditions(auth,p){
  if(!p.conditions)return;
  const now=auth.clock;
  for(const el of ["poison","fire","energy","bleed","curse"]){
    const c=p.conditions[el];if(!c)continue;
    if(c.turns<=0){delete p.conditions[el];continue;}
    c.turns--;
    const dmg=Math.max(0,Math.floor(Number(c.dmg)||0));
    if(dmg>0){p.hp=Math.max(0,p.hp-dmg);const pos=playerPosition(auth,p);
      auth.events.push({t:"condition",el:el,dmg:dmg,x:pos.x,y:pos.y,targetId:String(p.id||""),screen:true});
    }
    if(c.turns<=0)delete p.conditions[el];
  }
}
function applyCondition(p,el,dmg,turns){
  if(!p.conditions)p.conditions={};
  const existing=p.conditions[el];
  // Canary: refresh duração mas mantém o dano original se maior
  if(existing){existing.turns=Math.max(existing.turns,turns);existing.dmg=Math.max(existing.dmg,dmg);}
  else p.conditions[el]={dmg,turns};
}
function playerArmor(p){let armor=0;for(const slot of Object.keys(p.equip||{})){const e=p.equip[slot],it=e&&ITEMS[e.item];armor+=Number(it&&it.armor)||0;}return armor;}
function mobDamage(auth,mob,p){return Math.max(0,Math.floor((Number(mob.damage)||1)*(.55+random(auth)*.45)-playerArmor(p)*.45));}
function addExp(p,amount){p.exp=Math.max(0,Number(p.exp)||0)+Math.max(0,Math.floor(amount));p.level=Math.max(1,Number(p.level)||1);
  while(p.exp>=expForLevel(p.level+1))p.level++;
  const max=maxStats(p);p.hp=Math.min(max.hp,Math.max(0,Number(p.hp)||0));p.mp=Math.min(max.mp,Math.max(0,Number(p.mp)||0));}
function applyPvpLoss(p,source){const rate=source==="player-raid"?.08:.03,loss=Math.floor(Math.max(0,Number(p.exp)||0)*rate);p.exp=Math.max(0,(Number(p.exp)||0)-loss);return loss;}
function canonicalPlayer(member){const p=clone(member&&member.p||{});p.id=String(member.id);p.level=Math.max(1,Number(p.level)||1);p.exp=Math.max(0,Number(p.exp)||0);
  p.gold=Math.max(0,Number(p.gold)||0);p.skills=p.skills||{fist:10,sword:10,axe:10,club:10,dist:10,shield:10};
  p.skillTries=p.skillTries||{};p.supplies=p.supplies||{};p.lootPouch=p.lootPouch||{};p.kills=p.kills||{};p.bosses=p.bosses||{};p.stamina=FULL_STAMINA;
  const max=maxStats(p);p.hp=Math.min(max.hp,Math.max(1,Number(p.hp)||max.hp));p.mp=Math.min(max.mp,Math.max(0,Number(p.mp)||max.mp));return p;}
function makeMob(auth,slug,boss,id,source){const def=monsterDef(slug);if(!def)return null;const greedAdd=["dreadful-harvester","soulsnatcher","greedbeast","powerful-soul"].includes(String(slug));
  const sequence=Math.max(1,Number(auth.nextMobId)||1);auth.nextMobId=sequence+1;
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
  mob.cx=Math.max(0,Math.min(w-1,Math.round(cx)));mob.cy=Math.max(0,Math.min(h-1,Math.round(cy)));
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
function preyLootBonus(p,slug){
  const s=preyForCreature(p,slug);
  return s&&s.bonus==="loot"?preyBonusValue("loot",s.step):0;
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

function reward(auth,mob,players,stepTs){const alive=players.filter((x)=>x.p.hp>0),eligible=partyCanShareExp(players),
    receivers=eligible?(alive.length?alive:players):[(alive[0]||players[0])];
  // EXP final com stage + prey + VIP (cada receiver pode ter stage/prey diferentes)
  const baseExp=Number(mob.exp)||0;
  // Party split: cada membro recebe uma fração da EXP base, mas com seus
  // próprios multiplicadores (stage por level, prey, VIP).
  const expPerReceiver=eligible?Math.floor(baseExp/Math.max(1,receivers.length)):baseExp;
  const split=partyExpShare(players,baseExp);
  auth.stats=auth.stats||{};auth.stats.rawExp=(Number(auth.stats.rawExp)||0)+Math.max(0,baseExp);
  auth.stats.rawHp=(Number(auth.stats.rawHp)||0)+Math.max(0,Number(mob.maxHp)||0);auth.stats.monsters=auth.stats.monsters||{};
  const raw=auth.stats.monsters[mob.slug]||(auth.stats.monsters[mob.slug]={name:mob.def.name||mob.slug,kills:0,rawExp:0,rawHp:0});
  raw.kills=(Number(raw.kills)||0)+1;raw.rawExp=(Number(raw.rawExp)||0)+Math.max(0,baseExp);
  raw.rawHp=(Number(raw.rawHp)||0)+Math.max(0,Number(mob.maxHp)||0);
  let totalShare=0;
  for(const item of receivers){
    // Aplica stage/prey/VIP individuais na cota do receiver
    const share=eligible?Math.floor(split.each*expStage(Number(item.p.level)||1)):finalExp(item.p,baseExp,mob.slug);
    totalShare+=share;
    addExp(item.p,share);item.p.totalKills=(Number(item.p.totalKills)||0)+1;item.p.kills[mob.slug]=(Number(item.p.kills[mob.slug])||0)+1;
    if(auth.huntId){item.p.missions=item.p.missions||{};const mission=item.p.missions[auth.huntId]||(item.p.missions[auth.huntId]={progress:{},claimed:{},completeClaimed:false});
      mission.progress=mission.progress||{};mission.progress[mob.slug]=(Number(mission.progress[mob.slug])||0)+1;}}
  const leader=players[0]&&players[0].p;if(!leader)return [];
  const lootDrops=[];
  // Loot rate global (SERVER_LOOT_RATE=2.5) + Prey loot bonus do líder
  const lootRate=2.5;
  const preyLoot=preyLootBonus(leader,mob.slug);
  const lootMult=lootRate*(1+preyLoot/100);
  for(const entry of mob.def.loot||[]){if(random(auth)*100>Math.min(100,Number(entry.chance)||0))continue;
    const min=Math.max(1,Number(entry.min)||1),max=Math.max(min,Number(entry.max)||1),count=roll(auth,min,max);
    // Aplica loot rate + prey loot bonus
    const finalCount=Math.max(1,Math.floor(count*lootMult));
    lootDrops.push({item:entry.item,count:finalCount});
    if(mob.boss){leader.rewardChest=Array.isArray(leader.rewardChest)?leader.rewardChest:[];
      leader.rewardChest.push({item:entry.item,count:finalCount,bossId:auth.bossId||mob.slug,source:"server"});}
    else if(entry.item==="gold-coin")leader.gold=(Number(leader.gold)||0)+finalCount;
    else leader.lootPouch[entry.item]=(Number(leader.lootPouch[entry.item])||0)+finalCount;
    auth.stats.loot[entry.item]=(Number(auth.stats.loot[entry.item])||0)+finalCount;
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
      x:Number(mob.x)||0.5,y:Number(mob.y)||0.5,fiendish:!!mob.fiendish,screen:true,ts:stepTs+900});
  }
  auth.stats.exp+=totalShare;auth.stats.partyExpBonusPct=split.bonusPct;auth.stats.kills++;
  return lootDrops;
}
function usePotion(p){const max=maxStats(p),sup=p.supplies||{};
  if(p.hp<max.hp*.45){for(const id of ["supreme-health-potion","ultimate-health-potion","great-health-potion","strong-health-potion","health-potion","small-health-potion"]){
    if((sup[id]||0)>0){sup[id]--;p.hp=Math.min(max.hp,p.hp+Math.floor(max.hp*.35));return;}}}
  if(p.mp<max.mp*.3){for(const id of ["ultimate-mana-potion","great-mana-potion","strong-mana-potion","mana-potion"]){
    if((sup[id]||0)>0){sup[id]--;p.mp=Math.min(max.mp,p.mp+Math.max(50,Math.floor(max.mp*.3)));return;}}}}
function healPlayers(auth){
  for(const item of auth.players){const p=item.p;if(p.hp<=0||item.downUntil)continue;const max=maxStats(p);
    p.mp=Math.min(max.mp,p.mp+Math.max(1,Math.floor(max.mp*.015)));item.healAcc=(Number(item.healAcc)||0)+1000;
    const at=Math.max(20,Math.min(95,Number(p.config&&p.config.healAt)||70));
    if(item.healAcc>=1000&&p.hp<max.hp*at/100){const rate={knight:.12,paladin:.14,druid:.18,sorcerer:.17,monk:.16}[p.voc]||.1,
        mana=Math.max(10,Math.floor((Number(p.level)||1)*.05));
      if(p.mp>=mana){p.mp-=mana;p.hp=Math.min(max.hp,p.hp+Math.max(20,Math.floor(max.hp*rate)));item.healAcc=0;}}
  }
  for(const healer of auth.players){if(!["druid","monk"].includes(healer.p.voc)||healer.p.hp<=0||healer.downUntil)continue;
    healer.friendHealAcc=(Number(healer.friendHealAcc)||0)+1000;if(healer.friendHealAcc<2000)continue;
    const target=auth.players.filter((x)=>x.p.hp>0&&!x.downUntil).sort((a,b)=>a.p.hp/maxStats(a.p).hp-b.p.hp/maxStats(b.p).hp)[0],mana=80;
    if(target&&target!==healer&&target.p.hp<maxStats(target.p).hp*.8&&healer.p.mp>=mana){healer.p.mp-=mana;
      target.p.hp=Math.min(maxStats(target.p).hp,target.p.hp+Math.floor(maxStats(target.p).hp*.2));healer.friendHealAcc=0;}}
}
function fillGreed(auth){if(!auth.greed||!auth.greed.immune||auth.ended)return;const choices=["dreadful-harvester","soulsnatcher","powerful-soul"];
  while(auth.mobs.filter((m)=>!m.boss&&m.hp>0).length<6){const r=random(auth),slug=r<.30?"greedbeast":choices[Math.min(2,Math.floor(((r-.30)/.70)*3))];
    const mob=makeMob(auth,slug,false);if(!mob)break;auth.mobs.unshift(mob);}}
function respawn(auth){if(auth.kind==="boss"||auth.ended)return;const count=Math.max(1,auth.pack||3);
  while(auth.mobs.length<count&&auth.spawnPool.length){const slug=auth.spawnPool[roll(auth,0,auth.spawnPool.length-1)],m=makeMob(auth,slug,false);if(m)auth.mobs.push(m);else break;}}
function fullWipe(auth){const pvp=auth.instanceMode==="pvp";if(pvp)for(const item of auth.players)applyPvpLoss(item.p,auth.lastDamageSource||"monster");
  const cost=auth.players.reduce((sum,item)=>sum+blessingPrice(item.p.level),0),leader=auth.players[0]&&auth.players[0].p;
  if(leader&&leader.gold>=cost){leader.gold-=cost;for(const item of auth.players){const max=maxStats(item.p);item.p.hp=max.hp;item.p.mp=max.mp;item.p.blessed=true;item.downUntil=0;}
    auth.wipes++;auth.mobs=[];respawn(auth);return;}
  auth.ended=true;auth.terminalReason="party-wipe";
}
function step(auth,now){if(auth.ended)return;
  auth.stats=auth.stats||{};auth.stats.time=(Number(auth.stats.time)||0)+1000;
  auth.events=auth.events||[];
  // Timestamp base do step: o cliente usa para espaçar os floaters ao longo
  // de 1s em vez de mostrar todos de uma vez (lag visual).
  const stepTs=Number(now)||Date.now();
  if(auth.greed){if(!auth.greed.immune&&now>=auth.greed.vulnerableUntil){auth.greed.immune=true;auth.greed.vulnerableUntil=0;}
    if(auth.greed.immune)fillGreed(auth);}
  for(const item of auth.players){
    const p=item.p;p.stamina=FULL_STAMINA;
    if(item.downUntil&&now>=item.downUntil){const max=maxStats(p);p.hp=max.hp;p.mp=max.mp;item.downUntil=0;p.conditions={};}
    usePotion(p);
    // Conditions (poison/fire/bleed/energy/curse) tickam a cada 1s
    tickPlayerConditions(auth,p);
  }
  healPlayers(auth);respawn(auth);
  const living=auth.mobs.filter((m)=>m.hp>0),boss=living.find((m)=>m.boss);
  const primaryTarget=auth.greed&&auth.greed.immune?living.find((m)=>!m.boss):(boss||living[0]);

  /* ---------- ATAQUE DOS PLAYERS ---------- */
  if(primaryTarget)for(const item of auth.players){
    if(item.p.hp<=0||item.downUntil)continue;
    item.attackAcc+=1000;
    const p=item.p;
    let hitIdx=0; // index do hit dentro do step (para espaçar floaters)
    // Tenta spells primeiro (maior dano fora de cooldown)
    let spellCdLeft=(p._lastSpellAt||0)+2000-now;
    while(item.attackAcc>=1200&&primaryTarget.hp>0){
      item.attackAcc-=1200;
      let acted=false;

      // SPELLS: usa a melhor spell disponível
      if(spellCdLeft<=0){
        const spells=playerSpellList(p);
        if(spells.length){
          // Escolhe a spell de maior dano
          let best=null,bestDmg=0;
          for(const s of spells){
            if((p._spellCd&&p._spellCd[s.id])>(now||0))continue;
            const sv=spellValues(auth,p,s);
            const avgDmg=Math.floor((sv.min+sv.max)/2);
            const el=s.element||"physical";
            const r=mobResist(primaryTarget,el);
            // Pula spells em que o mob é imune
            if(r>=100)continue;
            const adjusted=Math.floor(avgDmg*(1-r/100));
            if(adjusted>bestDmg){best=s;bestDmg=adjusted;}
          }
          if(best){
            const s=best;
            const el=s.element||"physical";
            let dmg=rollSpell(auth,p,s);
            // Área usa a matriz oficial e as posições/células sincronizadas.
            // Não escolha apenas os primeiros N monstros do array: isso dava
            // dano fora do desenho e deixava criaturas visivelmente dentro
            // da wave/caldeira sem receber o golpe.
            const areaCells=s.area?spellAreaCells(auth,s,item,primaryTarget):[];
            const targets=s.area?spellAreaTargets(auth,s,item,primaryTarget,living):[primaryTarget];
            // Forge buffs
            const forgeMult=forgeDamageMult(p,now);
            const guaranteedCrit=forgeGuaranteedCrit(p,now);
            // Critical (10% base + forge)
            const critChance=0.10+(p.config&&p.config.critBonus||0);
            const isCrit=guaranteedCrit||random(auth)<critChance;
            // Fatal (Onslaught) — 5% chance
            const isFatal=isCrit&&random(auth)<0.05;
            const source=playerPosition(auth,p),visual=spellVisual(s),fx=visual.fx||ELEMENT_FX[el]||ELEMENT_FX.physical,
              magical=!s.f||s.f.modo==="magic",missile=visual.missile||(magical?(ELEMENT_MISSILE[el]||"energy"):null),
              projectile=!!missile&&spellReach(s)>1,castVisualTs=stepTs+hitIdx*200;
            for(const tgt of targets){
              let finalDmg=Math.floor(dmg*forgeMult);
              if(isCrit)finalDmg=Math.floor(finalDmg*1.5);
              if(isFatal)finalDmg=Math.floor(finalDmg*1.5);
              finalDmg=applyResist(finalDmg,tgt,el);
              finalDmg=Math.max(1,finalDmg);
              tgt.hp-=finalDmg;const target=entityPosition(tgt,.5,.5);
              auth.events.push({t:"hit",dmg:finalDmg,x:target.x,y:target.y,
                el:el,race:tgt.def&&tgt.def.race||"blood",crit:isCrit,fatal:isFatal,
                mobId:String(tgt.id),targetId:String(tgt.id),mobSlug:tgt.slug,whoId:String(item.id),
                sx:source.x,sy:source.y,projectile,missile:projectile?missile:null,
                fx,spell:s.name,spellId:s.id,ts:stepTs+hitIdx*200});
              hitIdx++;
            }
            // A fala e o estouro de área fazem parte do mesmo schema visual
            // usado pelo combate local; palavras nunca são chave de missile.
            if(s.area){
              if(areaCells.length>1)auth.events.push({t:"areafx",cells:areaCells,
                fx,spell:s.name,spellId:s.id,screen:true,ts:castVisualTs+20});
              else{const target=entityPosition(primaryTarget,.5,.5);
                auth.events.push({t:"burst",x:target.x,y:target.y,targetId:String(primaryTarget.id),
                  fx,spell:s.name,spellId:s.id,screen:true,ts:stepTs+hitIdx*200+20});}
            }
            auth.events.push({t:"say",text:s.words||String(s.name||"").toLowerCase(),whoId:String(item.id),
              x:source.x,y:source.y,screen:true,ts:stepTs+hitIdx*200+40});
            // Mana cost
            if(s.mana)p.mp=Math.max(0,p.mp-s.mana);
            // Cooldown
            if(!p._spellCd)p._spellCd={};
            p._spellCd[s.id]=(now||Date.now())+(s.cd||2000);
            p._lastSpellAt=now||Date.now();
            spellCdLeft=s.cd||2000;
            progressAttack(p);
            acted=true;
          }
        }
      }

      // ATAQUE BÁSICO (se não castou spell)
      if(!acted){
        const dmg=playerDamage(auth,p,primaryTarget);
        const forgeMult=forgeDamageMult(p,now);
        const guaranteedCrit=forgeGuaranteedCrit(p,now);
        const critChance=0.10+(p.config&&p.config.critBonus||0);
        const isCrit=guaranteedCrit||random(auth)<critChance;
        const isFatal=isCrit&&random(auth)<0.05;
        let finalDmg=Math.floor(dmg*forgeMult);
        if(isCrit)finalDmg=Math.floor(finalDmg*1.5);
        if(isFatal)finalDmg=Math.floor(finalDmg*1.5);
        finalDmg=applyResist(finalDmg,primaryTarget,"physical");
        finalDmg=Math.max(1,finalDmg);
        primaryTarget.hp-=finalDmg;
        // Projectile para distance weapons
        const weapon=p.equip&&p.equip.weapon,it=weapon&&ITEMS[weapon.item],ammo=p.equip&&p.equip.ammo,
          isDist=it&&String(it.type||it.t||"")==="distance",source=playerPosition(auth,p),
          target=entityPosition(primaryTarget,.5,.5);
        auth.events.push({t:"hit",dmg:finalDmg,x:target.x,y:target.y,
          el:"physical",race:primaryTarget.def&&primaryTarget.def.race||"blood",
          crit:isCrit,fatal:isFatal,mobId:String(primaryTarget.id),targetId:String(primaryTarget.id),
          mobSlug:primaryTarget.slug,whoId:String(item.id),sx:source.x,sy:source.y,projectile:isDist,
          missile:isDist&&ammo&&ammo.item?String(ammo.item):(isDist?"arrow":null),
          ts:stepTs+hitIdx*200});
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
      exp:mob.exp||0,loot:lootDrops,x:deadPos.x,y:deadPos.y,
      screen:true,boss:!!mob.boss,influenced:!!mob.influenced,fiendish:!!mob.fiendish,
      ts:stepTs+800});
    if(mob.boss){auth.ended=true;auth.terminalReason="boss-defeated";auth.bossDefeated=true;
      if(leader){leader.p.bosses[auth.bossId]=leader.p.bosses[auth.bossId]||{};leader.p.bosses[auth.bossId].kills=(leader.p.bosses[auth.bossId].kills||0)+1;}}
  }

  /* ---------- ATAQUE DOS MONSTROS (melee + skills) ---------- */
  for(const mob of auth.mobs){
    mob.attackAcc+=1000;
    let mobHitIdx=0;
    while(mob.attackAcc>=mob.attackSpeed){
      mob.attackAcc-=mob.attackSpeed;
      const victim=authorityMobTarget(auth,mob);
      if(!victim)break;

      // 1) Skills do monstro (cada uma rola sua chance)
      const skills=mob.def&&mob.def.skills;
      if(Array.isArray(skills)){
        for(const sk of skills){
          const chance=Number(sk.ch||0)/100;
          if(random(auth)>=chance)continue;
          const el=sk.el||"physical";
          const min=Number(sk.min)||0,max=Number(sk.max)||0;
          let dmg=min<max?roll(auth,min,max):min;
          if(dmg>0){
            dmg=Math.max(0,Math.floor(dmg-playerArmor(victim.p)*.3));
            victim.p.hp-=dmg;const target=entityPosition(victim,.13,.6),source=entityPosition(mob,.5,.5);
            auth.events.push({t:"taken",dmg:dmg,x:target.x,y:target.y,targetId:String(victim.id),
              sx:source.x,sy:source.y,sourceId:String(mob.id),el:el,screen:true,fx:sk.fx,
              projectile:!!sk.miss,missile:sk.miss||null,ts:stepTs+mobHitIdx*200});
          }
          // Conditions aplicadas por skills
          if(sk.campo==="fire"&&dmg>0)applyCondition(victim.p,"fire",Math.floor(dmg*.1),4);
          if(sk.campo==="poison"&&dmg>0)applyCondition(victim.p,"poison",Math.floor(dmg*.1),5);
          if(sk.n==="speed"&&dmg===0){
            // Haste do monstro — sem efeito no idle
          }
          if(sk.n==="healing"){
            // Monstro se cura
            const heal=roll(auth,Number(sk.min)||0,Number(sk.max)||0);
            if(heal>0)mob.hp=Math.min(mob.maxHp,mob.hp+heal);
          }
        }
      }

      // 2) Melee (ataque básico) — roda SEMPRE que tem damage base
      if(Number(mob.damage||0)>0){
        let damage=mobDamage(auth,mob,victim.p);
        if(auth.greed&&auth.greed.immune&&mob.boss)damage=Math.floor(damage*.7);
        victim.p.hp-=damage;const target=entityPosition(victim,.13,.6),source=entityPosition(mob,.5,.5);
        auth.events.push({t:"taken",dmg:damage,x:target.x,y:target.y,targetId:String(victim.id),
          sx:source.x,sy:source.y,sourceId:String(mob.id),
          el:mob.def&&mob.def.element||"physical",screen:true,ts:stepTs+mobHitIdx*200});
        // Conditions do melee (race-based, como no Canary)
        const race=mob.def&&mob.def.race;
        if(race==="poison"&&random(auth)<.15)applyCondition(victim.p,"poison",Math.floor(damage*.1),5);
        if(race==="fire"&&random(auth)<.15)applyCondition(victim.p,"fire",Math.floor(damage*.1),4);
        if(victim.p.hp<=0){victim.p.hp=0;victim.p.blessed=false;victim.downUntil=now+30000;
          auth.events.push({t:"death",x:target.x,y:target.y,targetId:String(victim.id),screen:true,ts:stepTs+mobHitIdx*200});
        }
      }
      mobHitIdx++;
    }
  }

  if(auth.players.every((x)=>x.p.hp<=0||x.downUntil))fullWipe(auth);
  if(!auth.ended&&auth.kind==="hunt"&&!auth.mobs.length)respawn(auth);
}
function initializeAuthority(descriptor,instanceId,now){
  const combat=descriptor.state||{},active=Array.isArray(combat.mobs)?combat.mobs:[];
  // HARD hunts begin with teleport-blink entries in pendingSpawns; the local
  // array `mobs` is still empty when the first server snapshot is created.
  // Promote those pending definitions into the authoritative initial wave.
  const pending=Array.isArray(combat.pendingSpawns)?combat.pendingSpawns.map((sp)=>{
    if(!sp||!sp.mob)return null;const mob=Object.assign({},sp.mob,{cx:sp.cx,cy:sp.cy});
    const w=Number(combat.gridW)||30,h=Number(combat.gridH)||30;
    if(mob.x===undefined)mob.x=(Number(sp.cx)+.5)/w;if(mob.y===undefined)mob.y=(Number(sp.cy)+.5)/h;
    return mob;
  }).filter(Boolean):[];
  const seen=new Set(),visual=active.concat(pending).filter((mob)=>{
    const key=String(mob&&mob.id||mob&&mob.slug||"");if(!key||seen.has(key))return false;seen.add(key);return true;});
  combat.mobs=visual;combat.pendingSpawns=[];
  const oldPlayers=Array.isArray(combat.players)?combat.players:[];
  const players=(descriptor.members||[]).map((m)=>{const id=String(m.id),old=oldPlayers.find((ent)=>String(ent&&ent.id)===id)||{};
    const item={id,p:canonicalPlayer(m),attackAcc:0,downUntil:0};
    for(const key of ["cx","cy","x","y","sx","sy"])if(old[key]!==undefined)item[key]=old[key];return item;});
  const auth={v:2,rngState:seedFor(instanceId),nextMobId:1,clock:Number(now)||Date.now(),carryMs:0,kind:descriptor.kind,
    huntId:descriptor.huntId||null,bossId:descriptor.bossId||null,instanceMode:descriptor.instanceMode||"non-pvp",players,mobs:[],spawnPool:[],spawnPoints:[],
    influencedChance:Math.max(0,Number(combat.influencedChance)||
      (INFLUENCED_BASE_CHANCE+(descriptor.instanceMode==="pvp"?INFLUENCED_PVP_BONUS:0))),
    fiendishChance:Math.max(0,Number(combat.fiendishChance)||
      (FIENDISH_BASE_CHANCE+(descriptor.instanceMode==="pvp"?FIENDISH_PVP_BONUS:0))),
    gridW:Number(combat.gridW)||30,gridH:Number(combat.gridH)||30,pack:Math.max(1,visual.length||3),
    stats:{startedAt:Number(now)||Date.now(),time:0,kills:0,exp:0,rawExp:0,rawHp:0,loot:{},monsters:{}},wipes:0,ended:false,terminalReason:null,lastDamageSource:"monster"};
  for(const old of visual){const slug=String(old.slug||""),m=makeMob(auth,slug,!!old.boss,String(old.id||""),old);if(m){
      for(const key of ["cx","cy","x","y","sx","sy"])if(old[key]!==undefined)m[key]=old[key];
      if(old.cx!==undefined&&old.cy!==undefined&&!auth.spawnPoints.some((p)=>p.cx===old.cx&&p.cy===old.cy))
        auth.spawnPoints.push({cx:Number(old.cx),cy:Number(old.cy),x:Number(old.x),y:Number(old.y),sx:Number(old.sx),sy:Number(old.sy)});
      auth.mobs.push(m);if(!m.boss&&!auth.spawnPool.includes(slug))auth.spawnPool.push(slug);}}
  if(!auth.spawnPool.length){const hunt=HUNTS[auth.huntId];for(const slug of (hunt&&hunt.monsters)||[])if(monsterDef(slug))auth.spawnPool.push(slug);}
  if(descriptor.kind==="boss"){const boss=auth.mobs.find((m)=>m.boss)||auth.mobs[0];if(boss)boss.boss=true;const leader=players[0]&&players[0].p;
    if(leader&&auth.bossId){leader.bosses[auth.bossId]=leader.bosses[auth.bossId]||{};leader.bosses[auth.bossId].lastFight=auth.clock;}
    if(auth.bossId==="goshnar-s-greed"){auth.greed={immune:true,greedbeastKills:0,vulnerableUntil:0};fillGreed(auth);}}
  descriptor.authority=auth;return materializeAuthority(descriptor);
}
function materializeAuthority(descriptor){const auth=descriptor.authority;if(!auth)return descriptor;
  descriptor.members=auth.players.map((item)=>({id:item.id,p:clone(item.p),hp:item.p.hp,mp:item.p.mp}));descriptor.activeCharacterId=descriptor.activeCharacterId||auth.players[0]&&auth.players[0].id;
  descriptor.state=descriptor.state||{};const oldPlayers=Array.isArray(descriptor.state.players)?descriptor.state.players:[];
  descriptor.state.players=auth.players.map((item)=>stripStaleVisualStep(Object.assign({},
    oldPlayers.find((x)=>String(x.id)===item.id)||{id:item.id},entityVisual(item),
    {id:item.id,p:clone(item.p),hp:item.p.hp,mp:item.p.mp,reviveAt:item.downUntil||0})));
  const oldMobs=Array.isArray(descriptor.state.mobs)?descriptor.state.mobs:[];
  descriptor.state.mobs=auth.mobs.map((m)=>stripStaleVisualStep(Object.assign({},
    oldMobs.find((x)=>String(x.id)===String(m.id))||{},entityVisual(m),
    {id:m.id,slug:m.slug,boss:m.boss,targetId:m.targetId||null,influenced:!!m.influenced,fiendish:!!m.fiendish,
      sinisterStacks:Number(m.sinisterStacks)||0,greedImmune:!!(auth.greed&&auth.greed.immune&&m.boss),
      hp:m.hp,maxHp:m.maxHp,atkCd:Math.max(0,m.attackSpeed-m.attackAcc),
      // def compacto: só campos necessários para o cliente renderizar.
      // O def completo (loot, skills, voices) é pesado e já existe no
      // cliente via GAMEDATA.monsters. Enviar tudo a cada tick trava o
      // browser (50KB+ por snapshot com 6 mobs).
      def:{name:m.def?m.def.name:m.slug,race:m.def&&m.def.race||"blood",
           element:m.def&&m.def.element||"physical",looktype:m.def&&m.def.looktype||null}})));
  if(auth.greed)descriptor.state.greed={immune:auth.greed.immune,greedbeastKills:auth.greed.greedbeastKills,
    vulnerableUntil:auth.greed.vulnerableUntil,nextSpawnAt:auth.clock+1500,lastBlockFx:0};
  descriptor.state.stats=Object.assign({},descriptor.state.stats||{},auth.stats);descriptor.state.bossDefeated=!!auth.bossDefeated;descriptor.state.dead=auth.ended&&auth.terminalReason==="party-wipe";
  // Grid dimensions: o renderer usa combat.gridW/gridH para calcular o
  // viewport e converter posições normalizadas (0-1) em pixels. Sem isso,
  // o renderer cai no fallback GRID_W=21 e os floaters saem na posição
  // errada (o grid real pode ser 30x30).
  descriptor.state.gridW=Number(auth.gridW)||30;descriptor.state.gridH=Number(auth.gridH)||30;
  // Eventos de combate (dano/cura) gerados pelo step() desde o último tick.
  // O cliente drena esses eventos via drainEvents() para mostrar floaters e
  // logs de dano no modo online.
  descriptor.state.events=auth.events||[];
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
  if(!Number.isFinite(Number(auth.influencedChance)))auth.influencedChance=Math.max(0,
    Number(descriptor.state&&descriptor.state.influencedChance)||
    (INFLUENCED_BASE_CHANCE+(auth.instanceMode==="pvp"?INFLUENCED_PVP_BONUS:0)));
  if(!Number.isFinite(Number(auth.fiendishChance)))auth.fiendishChance=Math.max(0,
    Number(descriptor.state&&descriptor.state.fiendishChance)||
    (FIENDISH_BASE_CHANCE+(auth.instanceMode==="pvp"?FIENDISH_PVP_BONUS:0)));
  // Migra instâncias HARD criadas pela versão que ignorava pendingSpawns.
  if(!auth.spawnPool.length&&descriptor.state&&Array.isArray(descriptor.state.pendingSpawns)){
    const recoverMobs=auth.mobs.length===0;auth.spawnPoints=auth.spawnPoints||[];
    auth.gridW=Number(auth.gridW)||Number(descriptor.state.gridW)||30;auth.gridH=Number(auth.gridH)||Number(descriptor.state.gridH)||30;
    for(const sp of descriptor.state.pendingSpawns){const old=sp&&sp.mob,slug=String(old&&old.slug||"");if(!monsterDef(slug))continue;
      if(!auth.spawnPool.includes(slug))auth.spawnPool.push(slug);
      const point={cx:Number(sp.cx),cy:Number(sp.cy),x:(Number(sp.cx)+.5)/auth.gridW,y:(Number(sp.cy)+.5)/auth.gridH};
      if(!auth.spawnPoints.some((p)=>p.cx===point.cx&&p.cy===point.cy))auth.spawnPoints.push(point);
      if(recoverMobs){const mob=makeMob(auth,slug,!!old.boss,String(old.id||""),old);if(mob){Object.assign(mob,point);auth.mobs.push(mob);}}}
    descriptor.state.pendingSpawns=[];auth.pack=Math.max(auth.pack||0,auth.mobs.length||auth.spawnPool.length||1);
  }
  // Sincroniza a predição visual antes do step. Ela alinha efeitos e a vítima
  // perseguida, sem alterar fórmulas de dano, HP, loot ou recompensas.
  syncAuthorityVisualState(auth,visualState);
  const total=Math.max(0,Number(elapsed)||0)+(Number(auth.carryMs)||0);
  const requested=Math.floor(total/1000),steps=Math.min(250000,requested);auth.carryMs=total-steps*1000;
  for(let i=0;i<steps;i++){auth.clock+=1000;step(auth,auth.clock);if(auth.ended){auth.carryMs=0;break;}}
  auth.clock=Math.max(auth.clock,Number(checkpointAt)||auth.clock);descriptor=materializeAuthority(descriptor);
  return {state:JSON.stringify(descriptor),characters:auth.players.map((item)=>({id:Number(item.id),data:JSON.stringify(item.p),level:item.p.level,voc:item.p.voc,
    hp:item.p.hp,mp:item.p.mp,max_hp:maxStats(item.p).hp,max_mp:maxStats(item.p).mp})),terminalReason:auth.ended?auth.terminalReason:null};
}
function protectedPlayer(descriptor,id){const auth=descriptor&&descriptor.authority;const item=auth&&auth.players.find((x)=>String(x.id)===String(id));return item?clone(item.p):null;}
module.exports={initializeAuthority,materializeAuthority,advanceAuthorityState,protectedPlayer,applyPvpLoss,expForLevel,maxStats,
  normalizeVisualState,blessingPrice,partyCanShareExp,partyExpBonusPct,partyExpShare,MONSTERS,ITEMS};
