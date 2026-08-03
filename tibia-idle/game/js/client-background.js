/**
 * client-background.js — OTClient client_background module
 * Fundo + partículas alternando a cada 5s + label de versão
 */
"use strict";
const BG={el:null,versionLabel:null,particlesEl:null,_loopId:null,_toggle:true,LOOP_MS:5000,PARTICLE_COUNT:28,PARTICLE_DUR_MS:9000,
init(){this._buildDOM();this.versionLabel=document.getElementById("client-version-label");if(this.versionLabel)this.versionLabel.textContent="Global-Idle v1.0 · "+new Date().toISOString().slice(0,10);if(!this._isGameActive())setTimeout(()=>{if(this.versionLabel)this.versionLabel.classList.add("show")},400);this._hookGameLifecycle();this._startEffectLoop()},
terminate(){this._stopEffectLoop();if(this.el)this.el.remove();if(this.versionLabel)this.versionLabel.remove();if(this.particlesEl)this.particlesEl.remove();this.el=this.versionLabel=this.particlesEl=null},
hide(){if(this.el)this.el.style.display="none";if(this.versionLabel)this.versionLabel.classList.remove("show");this._stopEffectLoop()},
show(){if(this.el)this.el.style.display="";setTimeout(()=>{if(this.versionLabel)this.versionLabel.classList.add("show")},400);this._startEffectLoop()},
_buildDOM(){const bg=document.createElement("div");bg.id="login-bg";const grid=document.createElement("div");grid.className="bg-grid";const particles=document.createElement("div");particles.id="bg-particles";const overlay=document.createElement("div");overlay.id="login-overlay";document.body.prepend(overlay);document.body.prepend(particles);document.body.prepend(grid);document.body.prepend(bg);this.el=bg;this.particlesEl=particles},
_startEffectLoop(){this._stopEffectLoop();this._spawnWave();this._loopId=setInterval(()=>this._spawnWave(),this.LOOP_MS)},
_stopEffectLoop(){if(this._loopId){clearInterval(this._loopId);this._loopId=null}},
_spawnWave(){if(!this.particlesEl)return;const cls=this._toggle?"fire":"arcane";this._toggle=!this._toggle;const existentes=this.particlesEl.querySelectorAll(".bg-particle");if(existentes.length>80)for(let i=0;i<20;i++)if(existentes[i])existentes[i].remove();const frag=document.createDocumentFragment();for(let i=0;i<this.PARTICLE_COUNT;i++){const p=document.createElement("div");p.className="bg-particle "+cls;p.style.left=(Math.random()*94+3)+"%";p.style.top=(88+Math.random()*12)+"%";p.style.animationDuration=(this.PARTICLE_DUR_MS+Math.random()*6000)+"ms";p.style.animationDelay=(Math.random()*5000)+"ms";const sz=2.5+Math.random()*3.5;p.style.width=sz+"px";p.style.height=sz+"px";frag.appendChild(p)}this.particlesEl.appendChild(frag);setTimeout(()=>{const all=this.particlesEl.querySelectorAll(".bg-particle");for(const p of all){const s=getComputedStyle(p);if(parseFloat(s.opacity)<0.05)p.remove()}},this.PARTICLE_DUR_MS+6000)},
_isGameActive(){return!!(typeof G!=="undefined"&&G&&(G.combat||G.training||G.inCity))},
_hookGameLifecycle(){this._onGameStart=()=>this.hide();this._onGameEnd=()=>setTimeout(()=>this.show(),300);if(typeof window!=="undefined"){window.addEventListener("bg-game-start",this._onGameStart);window.addEventListener("bg-game-end",this._onGameEnd)}},
};
if(typeof document!=="undefined"&&document.readyState!=="loading")BG.init();else if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>BG.init());
if(typeof window!=="undefined")window.ClientBackground=BG;
