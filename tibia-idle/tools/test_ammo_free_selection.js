/* Regressão: arrows/bolts podem ser equipadas sem bow/crossbow. */
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const js=path.join(__dirname,"..","game","js");
const ui=fs.readFileSync(path.join(js,"ui.js"),"utf8");
const combat=fs.readFileSync(path.join(js,"combat.js"),"utf8");
const player=fs.readFileSync(path.join(js,"player.js"),"utf8");
const client=fs.readFileSync(path.join(js,"account-client.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"..","game","index.html"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
const start=ui.indexOf("const AMMO_CATS"),end=ui.indexOf("\nfunction openAmmoPicker",start);
const ctx={
  AMMO_DEFS:{arrow:{kind:"arrow",atk:10,shotCost:2},bolt:{kind:"bolt",atk:20,shotCost:2}},
  GAMEDATA:{items:{arrow:{s:"ammo",lvl:1,n:"arrow"},bolt:{s:"ammo",lvl:1,n:"bolt"}}},
  equippedQuiver:p=>p.equip.shield&&{item:p.equip.shield.item},
  ammoCompatibleWithWeapon:(ammo,weapon)=>{
    if(!weapon)return false;return ammo.n==="bolt"?weapon.item==="crossbow":weapon.item==="bow";
  },
};
vm.createContext(ctx);vm.runInContext(ui.slice(start,end),ctx);
const base={level:100,equip:{shield:{item:"quiver"}}};
must(ctx.ammoUsable(base,"arrow")&&ctx.ammoUsable(base,"bolt"),
  "seleção manual ainda exige bow/crossbow");
const bow={level:100,equip:{shield:{item:"quiver"},weapon:{item:"bow"}}};
must(ctx.ammoUsable(bow,"bolt"),"bolt não pode ser selecionado enquanto bow está equipado");
must(ctx.bestAmmoFor(bow)==="arrow","modo automático deixou de respeitar a arma ao disparar");
must(combat.includes("!ammoCompatibleWithWeapon(it, weapon)"),
  "validação de compatibilidade ao disparar foi removida por engano");
const pickerStart=ui.indexOf("const linhaAmmo"),pickerEnd=ui.indexOf("const linhaQuiver",pickerStart);
const picker=ui.slice(pickerStart,pickerEnd);
must(!picker.includes('a.kind === "bolt" ? "crossbow" : "bow"'),
  "modal ainda exibe requer bow/crossbow");
must(player.includes("accountSelectInstanceAmmo(sessionToken(),p.id,slug")&&
  client.includes('"/api/instance/ammo"')&&ui.includes("setActiveAmmo(p, b.dataset.pickAmmo, true)")&&
  /js\/player\.js\?v=[^"]+/.test(index)&&/js\/ui\.js\?v=[^"]+/.test(index)&&
  /js\/account-client\.js\?v=[^"]+/.test(index),
  "troca de munição online não persiste na autoridade/cache atualizados");
console.log("OK: arrows/bolts têm seleção livre e troca autoritativa durante a instância.");
