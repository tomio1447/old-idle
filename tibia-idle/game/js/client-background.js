/**
 * client-background.js — OTClient client_background module
 * Fundo + label de versão (sem partículas — removidas a pedido)
 */
"use strict";
const BG={el:null,versionLabel:null,
init(){this._buildDOM();this.versionLabel=document.getElementById("client-version-label");if(this.versionLabel)this.versionLabel.textContent="Global-Idle Beta v1.0 · "+new Date().toISOString().slice(0,10);if(!this._isGameActive())setTimeout(()=>{if(this.versionLabel)this.versionLabel.classList.add("show")},400);this._hookGameLifecycle()},
terminate(){if(this.el)this.el.remove();if(this.versionLabel)this.versionLabel.remove();this.el=this.versionLabel=null},
hide(){
  // esconde TUDO do fundo de login (bg, overlay e grid) — antes ficavam
  // na tela com z-index acima da UI escurecendo o jogo.
  ["login-bg","login-overlay"].forEach((id)=>{
    const el=document.getElementById(id);
    if(el)el.style.display="none";
  });
  const grid=document.querySelector(".bg-grid");
  if(grid)grid.style.display="none";
  if(this.versionLabel)this.versionLabel.classList.remove("show");
},
show(){
  ["login-bg","login-overlay"].forEach((id)=>{
    const el=document.getElementById(id);
    if(el)el.style.display="";
  });
  const grid=document.querySelector(".bg-grid");
  if(grid)grid.style.display="";
  setTimeout(()=>{if(this.versionLabel)this.versionLabel.classList.add("show")},400);
},
_buildDOM(){const bg=document.createElement("div");bg.id="login-bg";const grid=document.createElement("div");grid.className="bg-grid";const overlay=document.createElement("div");overlay.id="login-overlay";document.body.prepend(overlay);document.body.prepend(grid);document.body.prepend(bg);this.el=bg},
_isGameActive(){return!!(typeof G!=="undefined"&&G&&(G.combat||G.training||G.inCity))},
_hookGameLifecycle(){this._onGameStart=()=>this.hide();this._onGameEnd=()=>setTimeout(()=>this.show(),300);if(typeof window!=="undefined"){window.addEventListener("bg-game-start",this._onGameStart);window.addEventListener("bg-game-end",this._onGameEnd)}},
};
if(typeof document!=="undefined"&&document.readyState!=="loading")BG.init();else if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>BG.init());
if(typeof window!=="undefined")window.ClientBackground=BG;
