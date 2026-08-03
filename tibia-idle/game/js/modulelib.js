/**
 * modulelib.js — Module Library System (OTClient modulelib/)
 * ModuleEvents, WatchList, ModuleController — cross-module communication.
 */
"use strict";
const ModuleEvents={_listeners:{},on(e,f){if(!this._listeners[e])this._listeners[e]=[];this._listeners[e].push(f);return()=>this.off(e,f)},off(e,f){const ls=this._listeners[e];if(!ls)return;const i=ls.indexOf(f);if(i>=0)ls.splice(i,1)},emit(e,...a){const ls=this._listeners[e];if(!ls)return;for(const f of ls.slice()){try{f(...a)}catch(ex){console.warn("[mod]",e,ex)}}},clear(e){if(e)delete this._listeners[e];else this._listeners={}}};
const WatchList={_watchers:[],watch(getter,fn,ms){let last;const id=setInterval(()=>{const cur=getter();if(cur!==last){fn(cur,last);last=cur}},ms||500);this._watchers.push(id);return id},unwatch(id){clearInterval(id);this._watchers=this._watchers.filter(w=>w!==id)},clear(){for(const id of this._watchers)clearInterval(id);this._watchers=[]}};
class ModuleController{constructor(name){this.name=name;this._hooks=[]}onGameStart(f){ModuleEvents.on("game:start",f);this._hooks.push(()=>ModuleEvents.off("game:start",f))}onGameEnd(f){ModuleEvents.on("game:end",f);this._hooks.push(()=>ModuleEvents.off("game:end",f))}destroy(){for(const h of this._hooks)h();this._hooks=[]}}
function moduleLifecycleStart(){ModuleEvents.emit("game:start")}
function moduleLifecycleEnd(){ModuleEvents.emit("game:end")}
if(typeof window!=="undefined"){window.ModuleLib={ModuleEvents,WatchList,ModuleController,moduleLifecycleStart,moduleLifecycleEnd}}
