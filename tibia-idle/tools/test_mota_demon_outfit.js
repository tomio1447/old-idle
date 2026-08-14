/* Demon vs Floating Savant: looktype, slug da sprite e nome da mesma entidade. */
"use strict";
const fs=require("fs"),path=require("path");
function must(ok,msg){if(!ok)throw Error(msg);}
const root=path.join(__dirname,"..");
const monsters=JSON.parse(fs.readFileSync(path.join(root,"game","data","canarymonsters.json"),"utf8"));
const sheets=JSON.parse(fs.readFileSync(path.join(root,"game","data","mobsheets.json"),"utf8"));
const render=fs.readFileSync(path.join(root,"game","js","render.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"server","authoritative_engine.js"),"utf8");
const game=fs.readFileSync(path.join(root,"game","js","game.js"),"utf8");
const html=fs.readFileSync(path.join(root,"game","index.html"),"utf8");

const demon=monsters.demon,savant=monsters["floating-savant"];
must(demon&&savant,"catálogo Canary sem Demon ou Floating Savant");
must(demon.name==="Demon"&&savant.name==="Floating Savant","nomes oficiais invertidos");
must(Number(demon.looktype)>0&&Number(savant.looktype)>0,"looktype ausente");
must(Number(demon.looktype)!==Number(savant.looktype),
  "Demon e Floating Savant compartilham looktype "+demon.looktype);
must(sheets.demon&&sheets["floating-savant"],
  "sheets Demon/Floating Savant ausentes — a arte seria a do fallback errado");
must(render.includes("Sprites.mobWalk(ent.slug")&&render.includes("Sprites.mob(ent.slug")&&
  render.includes("monsterRenderName(ent)"),
  "renderer não desenha sprite e nome a partir do slug da mesma entidade");
must(game.includes('String(local.slug||"")!==String(remote&&remote.slug||"")'),
  "cliente ainda reusa def/posição quando o ID reciclado muda de espécie");
must(engine.includes('String(prev.slug||"")===String(m.slug||"")?prev:{}'),
  "servidor ainda herda o snapshot visual da espécie anterior no slot reciclado");
must(html.includes("js/render.js?v=hd-hud-v1")&&html.includes("js/game.js?v=dust-num-v1"),
  "index.html sem cache-bust de barras/recycle");
console.log("OK: Demon looktype="+demon.looktype+" ≠ Floating Savant looktype="+savant.looktype+
  "; nome/sprite/def seguem o slug.");
