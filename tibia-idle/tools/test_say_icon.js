/* Cast say icon: runas e potions mostram o ÍCONE do item subindo
 * (tamanho da fonte) no lugar do nome/"Aahhh...". */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const js=path.join(__dirname,"..","game","js");
function must(ok,msg){if(!ok)throw Error(msg);}

const renderSrc=fs.readFileSync(path.join(js,"render.js"),"utf8");
const combatSrc=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const gameSrc=fs.readFileSync(path.join(js,"game.js"),"utf8");
const accSrc=fs.readFileSync(path.join(js,"accessories.js"),"utf8");
const engSrc=fs.readFileSync(path.join(__dirname,"..","server","authoritative_engine.js"),"utf8");

/* ---------------- estrutural ---------------- */
must(/function creatureSay\(dono, texto, tipo, icon\)/.test(renderSrc),
  "creatureSay sem parâmetro icon");
must(renderSrc.includes("icon: icon || null"),"speech entry não guarda icon");
must(renderSrc.includes("function sayIconSprite")&&renderSrc.includes("sp.icon"),
  "drawCreatureSpeech não trata sp.icon");
must(renderSrc.includes('"magic-shield-potion": "assets/item/magic-shield-potion.webp"'),
  "sayIconSprite sem override webp da magic potion");
must(renderSrc.includes("addSpeech = function (text, color, tipo, icon)"),
  "addSpeech não repassa icon");

// Handler do say: supply só desenha quando tem ícone.
must(gameSrc.includes("const sayIcon = String(e.icon || \"\")"),
  "handler do say não lê e.icon");
must(gameSrc.includes("(supplyLike && !sayIcon)"),
  "supply sem ícone ainda deve ser filtrado");
must(gameSrc.includes('creatureSay(alvo, sayIcon ? "" : text, TALK.SPELL, sayIcon)'),
  "handler não passa o ícone pro bubble");

// Emissores client-side com ícone.
must(combatSrc.includes('supply: true, icon: best }'),"rune attack say sem icon");
must(combatSrc.includes('supply: true, drunk: 1, icon: best }'),"heal potion say sem icon");
must(combatSrc.includes('icon: s.kind === "food" ? null : slug'),"mana potion say sem icon");
must(accSrc.includes('supply: true, icon: "magic-shield-potion"'),
  "magic shield potion say sem icon");

// Engine: rune say com icon, potion say novo, paralyze + magic potion.
must(engSrc.includes('icon:id,whoId:String(item.id)'),"tryUseRune say sem icon");
must(engSrc.includes('icon:"paralyze-rune"'),"paralyze rune say sem icon");
must(engSrc.includes('icon:"magic-shield-potion"'),"engine magic potion say sem icon");
must(engSrc.includes("function authSayUseIcon")&&
  /authSayUseIcon\(auth,p,slug,now\)[\s\S]{0,40}return true/.test(engSrc),
  "usePotion não emite say com ícone");

/* ---------------- funcional (vm) ---------------- */
const ctx={console,Math,Date,JSON,document:undefined,TALK_MAX_LIFE_MS:2000};
vm.createContext(ctx);
ctx.hudFont=(px,s,b)=>`bold ${px*(s||1)}px Tibia`;
ctx.textSprite=()=>null;ctx.drawTextSprite=()=>{};
ctx.Sprites={get:(p)=>({complete:true,naturalWidth:32,path:p})};
// Bloco contíguo: TALK → helpers → sayIconSprite → creatureSay →
// ageCreatureSpeech → drawCreatureSpeech.
const cut=(a,b)=>{const i=renderSrc.indexOf(a),j=renderSrc.indexOf(b,i+1);
  must(i>=0&&j>i,"trecho ausente: "+a);return renderSrc.slice(i,j);};
vm.runInContext(cut("const TALK = {","/* Compatibilidade"),ctx);

// Bubble de ícone: texto vazio + slug → entry guarda icon e o draw emite drawImage.
ctx.dono={speech:[]};
vm.runInContext(`creatureSay(dono,"",TALK.SPELL,"sudden-death-rune")`,ctx);
must(ctx.dono.speech.length===1&&ctx.dono.speech[0].icon==="sudden-death-rune"&&
  ctx.dono.speech[0].text==="","creatureSay não guardou o ícone da runa");
const calls=[];
ctx.fakeCtx={textAlign:"",globalAlpha:1,drawImage:(img,x,y,w,h)=>calls.push({img,x,y,w,h})};
vm.runInContext(`drawCreatureSpeech(fakeCtx,dono,100,100,16,1)`,ctx);
must(calls.length===1&&calls[0].img.path==="assets/item/sudden-death-rune.png",
  "ícone da runa não foi desenhado no caminho do png padrão");
must(calls[0].w>=10&&calls[0].w===calls[0].h,
  "ícone não saiu quadrado no tamanho da fonte");
must(calls[0].y<100,"ícone não nasceu acima do caster");

// Magic potion usa o .webp mapeado.
vm.runInContext(`dono.speech=[];creatureSay(dono,"",TALK.SPELL,"magic-shield-potion")`,ctx);
calls.length=0;
vm.runInContext(`drawCreatureSpeech(fakeCtx,dono,100,100,16,1)`,ctx);
must(calls.length===1&&/magic-shield-potion\.webp$/.test(calls[0].img.path),
  "magic shield potion não usou o sprite webp");

// Texto continua funcionando (spell sem ícone desenha via stroke/fill).
ctx.dono2={speech:[]};
vm.runInContext(`creatureSay(dono2,"exura sio",TALK.SPELL)`,ctx);
must(ctx.dono2.speech[0].icon===null&&ctx.dono2.speech[0].text==="exura sio",
  "say de spell comum perdeu o texto");

console.log("ok: say icon — runas/potions sobem como ícone (png/webp), texto intacto");
