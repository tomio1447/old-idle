/*
 * forge-ui.js -- UI da Exaltation Forge e Depot
 */
"use strict";

function renderForgeModal() {
  var p=G.p; if(!p)return '';
  ensureForge(p); var eqs=forgeEquipables(p);
  if(!eqs.length) return '<div class="panel-title">Exaltation Forge</div><div class="panel-body"><p class="small dim">Nenhum equipamento com classificacao equipado.</p><button class="sm" id="forge-close">Fechar</button></div>';
  if(!eqs.some(function(e){return e.slot===FORGE_UI.slot;})) FORGE_UI.slot=eqs[0].slot;
  var cur=eqs.find(function(e){return e.slot===FORGE_UI.slot;}); if(!cur)return'';
  var next=cur.currentTier+1, ok=next<=cur.maxTier, cost=ok?FORGE_COSTS[next]:null;
  var left='<div class="imb-eqlist">';
  for(var i=0;i<eqs.length;i++){var e=eqs[i];
    left+='<div class="imb-eq'+(e.slot===FORGE_UI.slot?' sel':'')+'" data-forge-slot="'+e.slot+'">'+itemImg(e.item,30)+'<div class="imb-eq-meta"><b>'+e.it.n+'</b><span class="tiny dim">'+e.slot+' · cls '+e.cls+' · '+(e.currentTier>0?'T'+e.currentTier:'sem forja')+' / T'+e.maxTier+'</span></div></div>';
  }
  left+='</div>';
  var center='<div class="imb-cat">Tiers</div>';
  for(var t=1;t<=cur.maxTier;t++){
    var cs=FORGE_COSTS[t];
    center+='<div class="imb-row'+(t===next?' sel':'')+'" data-forge-tier="'+t+'"><span class="forge-tier-num">T'+t+'</span><span>'+cs.pct+'% · '+fmtFull(cs.gold)+' gp</span>'+(t<=cur.currentTier?'<span class="tiny" style="color:#9ce84a"> done</span>':'')+'</div>';
  }
  var right;
  if(!ok){right='<p class="small dim">Tier maximo T'+cur.maxTier+' atingido.</p>';}
  else{
    var ef=FORGE_EFFECTS[cur.slot], eff=ef?ef.fmt(ef.perTier(next)):'', prev=cur.currentTier>0&&ef?ef.fmt(ef.perTier(cur.currentTier)):'';
    var dusts='', pode=true;
    for(var d=0;d<cost.dust.length;d++){var dd=cost.dust[d], have=p.dusts[dd.type]||0, enuf=have>=dd.qty; if(!enuf)pode=false; dusts+='<div class="imb-mat"><span class="'+(enuf?'':'txt-red')+'">'+have+'/'+dd.qty+'</span> '+FORGE_DUSTS[dd.type].name+'</div>';}
    if(cost.cores>0){var ec=p.exaltedCores>=cost.cores; if(!ec)pode=false; dusts+='<div class="imb-mat"><span class="'+(ec?'':'txt-red')+'">'+p.exaltedCores+'/'+cost.cores+'</span> Exalted Core</div>';}
    if(p.gold<cost.gold)pode=false;
    right='<div class="row" style="gap:8px"><div class="forge-tier-big">T'+next+'</div><div><b>Forjar Tier '+next+'</b><div class="tiny dim">'+eff+'</div></div></div>'+(prev?'<div class="tiny dim mt4">Atual: '+prev+'</div>':'')+'<div class="tiny imb-eff">'+(eff?'Efeito: <b>'+eff+'</b>':'')+'</div><div class="tiny dim">Custo:</div><div class="imb-mats">'+dusts+'</div><div class="row small" style="justify-content:space-between"><span>Chance: <b class="'+(cost.pct>=80?'txt-good':cost.pct>=50?'':'txt-red')+'">'+cost.pct+'%</b></span><span>Gold: <b class="gold-txt">'+fmtFull(cost.gold)+' gp</b></span></div>'+(cost.downgrade?'<div class="tiny dim mt4">Falha: perde 1 tier.</div>':'')+(cost.break?'<div class="tiny txt-red mt4">Falha: item DESTRUIDO!</div>':'')+'<button class="primary wide" id="forge-apply"'+(pode?'':' disabled')+'>FORJAR</button>'+(pode?'':'<div class="tiny txt-red">Faltam recursos.</div>');
  }
  return '<div class="panel-title">Exaltation Forge <span class="spacer"></span><span class="tiny dim">cls1-T3 cls2-T5 cls3-T7 cls4-T10</span></div><div class="imb-grid"><div class="imb-col-left">'+left+'</div><div class="imb-col-center">'+center+'</div><div class="imb-col-right">'+right+'</div></div><div class="row" style="justify-content:flex-end;margin-top:6px;gap:8px"><button class="sm" id="forge-dust-btn">Dusts & Cores</button><button class="sm" id="forge-close">Fechar</button></div>';
}

function openForgeModal(){
  var p=G.p; if(!p)return; ensureForge(p);
  var eqs=forgeEquipables(p);
  if(!FORGE_UI.slot||!eqs.some(function(e){return e.slot===FORGE_UI.slot;})) FORGE_UI.slot=eqs.length?eqs[0].slot:null;
  document.body.style.setProperty('--modal-w','min(960px,97vw)');
  document.body.dataset.modalWide2='1';
  document.body.classList.add('modal-wide2','wide');
  document.body.style.setProperty('--modal-w2','min(960px,97vw)');
  document.body.style.setProperty('--modal-w','min(960px,97vw)');
  document.body.classList.add('modal-wide2','wide');
  .classList.add('wide','modal-wide2');
  document.body.style.setProperty('--modal-w','min(960px,97vw)');
  document.body.dataset.modalWide2='1';
  document.body.style.setProperty('--modal-w2','min(960px,97vw)');
  .classList.add('wide','modal-wide2');
  .innerHTML=renderForgeModal();
  .classList.add('show');
  .classList.add('wide','modal-wide2');
  document.body.style.setProperty('--modal-w','min(960px,97vw)');
  document.body.dataset.modalWide2='1';
  document.body.style.setProperty('--modal-w2','min(960px,97vw)');
  bindForgeModal();
}

function bindForgeModal(){
  var b=;
  b.querySelectorAll('[data-forge-slot]').forEach(function(el){el.addEventListener('click',function(){FORGE_UI.slot=el.dataset.forgeSlot;openForgeModal();});});
  b.querySelectorAll('[data-forge-tier]').forEach(function(el){el.addEventListener('click',function(){FORGE_UI.targetTier=+el.dataset.forgeTier;openForgeModal();});});
  var btn=b.querySelector('#forge-apply');
  if(btn)btn.addEventListener('click',function(){
    var cur=forgeEquipables(G.p).find(function(e){return e.slot===FORGE_UI.slot;});
    if(!cur)return;
    var r=forgeAttempt(G.p,cur.item);
    if(typeof toast==='function')toast(r.msg,r.ok?'ok':'err');
    if(typeof renderAll==='function')renderAll();
    openForgeModal();
  });
  var close=b.querySelector('#forge-close');
  if(close)close.addEventListener('click',function(){.classList.remove('show');.classList.remove('wide','modal-wide2');document.body.dataset.modalWide2='';});
  var dust=b.querySelector('#forge-dust-btn');
  if(dust)dust.addEventListener('click',function(){openDustModal();});
}

/* ========== DUST MODAL ========== */
function renderDustModal(){
  var p=G.p; ensureForge(p);
  var rows=''; var order=['dust-basic','dust-refined','dust-pristine','dust-exalted'];
  for(var i=0;i<order.length;i++){var d=order[i],info=FORGE_DUSTS[d],have=p.dusts[d]||0;
    rows+='<div class="shop-row"><span class="small">'+info.name+'</span><span class="gold-txt">'+fmtFull(have)+'</span>';
    if(FORGE_FUSION[d]){var rule=FORGE_FUSION[d],need=rule.need,can=have>=need;
      rows+='<button class="sm" data-fuse="'+d+'"'+(can?'':' disabled')+'>Fuse '+need+' -> 1 '+FORGE_DUSTS[rule.to].name+'</button>';}
    rows+='</div>';
  }
  rows+='<div class="shop-row"><span class="small">Exalted Core</span><span class="gold-txt">'+fmtFull(p.exaltedCores||0)+'</span>';
  var can=p.dusts['dust-exalted']>=EXALTED_CORE.costDust;
  rows+='<button class="sm primary" data-to-core="1"'+(can?'':' disabled')+'>'+EXALTED_CORE.costDust+' Exalted Dust -> 1 Core</button></div>';
  return '<div class="panel-title">Dusts & Cores</div><div class="panel-body">'+rows+'<div class="tiny dim mt8">Dusts dropam de monstros fiendish/influenced. Use na Exaltation Forge.</div><button class="sm" id="dust-close">Fechar</button></div>';
}

function openDustModal(){
  .innerHTML=renderDustModal();
  .classList.add('show');
  var b=;
  b.querySelectorAll('[data-fuse]').forEach(function(el){el.addEventListener('click',function(){var r=dustFuse(G.p,el.dataset.fuse);if(typeof toast==='function')toast(r.msg,r.ok?'ok':'err');if(typeof renderAll==='function')renderAll();openDustModal();});});
  var tc=b.querySelector('[data-to-core]');
  if(tc)tc.addEventListener('click',function(){var r=dustToCore(G.p);if(typeof toast==='function')toast(r.msg,r.ok?'ok':'err');if(typeof renderAll==='function')renderAll();openDustModal();});
  var close=b.querySelector('#dust-close');
  if(close)close.addEventListener('click',function(){.classList.remove('show');});
}

/* ========== DEPOT MODAL ========== */
function renderDepotModal(){
  var p=G.p; ensureForge(p);
  var cells=''; var total=30;
  for(var i=0;i<total;i++){
    var slug=p.depot[i]; if(slug){cells+='<div class="inv-item" data-depot-idx="'+i+'" data-depot-slug="'+slug+'">'+itemImg(slug)+'</div>';}
    else{cells+='<div class="inv-item empty" title="Slot vazio"></div>';}
  }
  var exa=''; var eb=p.exaltationBox||[];
  for(var j=0;j<eb.length;j++){var s=eb[j]; exa+='<div class="inv-item" data-exa-idx="'+j+'" data-exa-slug="'+s+'" title="Item forjado">'+itemImg(s)+(p.forge&&p.forge[s]?'<span class="cnt" style="color:#ffe680">T'+p.forge[s]+'</span>':'')+'</div>';}
  return '<div class="panel-title">Depot <span class="spacer"></span><span class="tiny dim">'+eb.length+' exaltation / '+(p.depot||[]).length+'/30 slots</span></div><div class="panel-body"><div class="tabs"><div class="tab'+(DEPOT_UI.tab==="depot"?" active":"")+'" id="depot-tab-depot">Depot ('+(p.depot||[]).length+'/'+total+')</div><div class="tab'+(DEPOT_UI.tab==="exaltation"?" active":"")+'" id="depot-tab-exa">Exaltation Box ('+eb.length+')'+(p.depotNotification?' <b style="color:#d4af37">'+p.depotNotification+'</b>':'')+'</div></div><div id="depot-body">'+((DEPOT_UI.tab==='depot')?('<div class="inv-grid">'+cells+'</div>'):('<div class="inv-grid">'+exa+'</div>'+(eb.length?'<div class="tiny dim mt4">Itens forjados na Exaltation Forge aparecem aqui.</div>':'')))+'</div><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="sm" id="depot-close">Fechar</button></div></div>';
}

function openDepotModal(){
  var p=G.p; if(!p)return; ensureForge(p);
  p.depotNotification=0;
  .innerHTML=renderDepotModal();
  .classList.add('show');
  bindDepotModal();
}

function bindDepotModal(){
  var b=;
  var dt=b.querySelector('#depot-tab-depot'); if(dt)dt.addEventListener('click',function(){DEPOT_UI.tab='depot';openDepotModal();});
  var dx=b.querySelector('#depot-tab-exa'); if(dx)dx.addEventListener('click',function(){DEPOT_UI.tab='exaltation';openDepotModal();});
  b.querySelectorAll('[data-depot-slug]').forEach(function(el){
    el.addEventListener('click',function(){var slug=el.dataset.depotSlug;openDepotItemMenu(G.p,slug,el);});
    el.addEventListener('contextmenu',function(e){e.preventDefault();openDepotItemMenu(G.p,slug,el);});
    el.addEventListener('mouseenter',function(){if(typeof showTip==='function')showTip(itemTip(el.dataset.depotSlug,'Clique para opcoes'));});
    el.addEventListener('mouseleave',function(){if(typeof hideTip==='function')hideTip();});
  });
  b.querySelectorAll('[data-exa-slug]').forEach(function(el){
    el.addEventListener('click',function(){var slug=el.dataset.exaSlug;openExaItemMenu(G.p,slug);});
    el.addEventListener('contextmenu',function(e){e.preventDefault();openExaItemMenu(G.p,slug);});
    el.addEventListener('mouseenter',function(){if(typeof showTip==='function')showTip(itemTip(el.dataset.exaSlug,'Item forjado na Exaltation Forge'));});
    el.addEventListener('mouseleave',function(){if(typeof hideTip==='function')hideTip();});
  });
  var close=b.querySelector('#depot-close'); if(close)close.addEventListener('click',function(){.classList.remove('show');});
}

function openDepotItemMenu(p,slug,el){
  var it=GAMEDATA.items[slug]; if(!it)return;
  var opts=[{label:'Equipar',action:function(){var r=depotEquip(p,slug);if(typeof toast==='function')toast(r.msg,r.ok?'ok':'err');if(typeof renderAll==='function')renderAll();openDepotModal();}},
    {label:'Retirar para mochila',action:function(){var r=depotRetrieve(p,slug);if(typeof toast==='function')toast(r.msg,r.ok?'ok':'err');if(typeof renderAll==='function')renderAll();openDepotModal();}}];
  if(typeof showContextMenu==='function') showContextMenu(el.getBoundingClientRect().left,el.getBoundingClientRect().top,it.n,opts);
}

function openExaItemMenu(p,slug){
  var it=GAMEDATA.items[slug]; if(!it)return;
  var opts=[{label:'Equipar',action:function(){var r=exaltationEquip(p,slug);if(typeof toast==='function')toast(r.msg,r.ok?'ok':'err');if(typeof renderAll==='function')renderAll();openDepotModal();}},
    {label:'Retirar para mochila',action:function(){var r=exaltationRetrieve(p,slug);if(typeof toast==='function')toast(r.msg,r.ok?'ok':'err');if(typeof renderAll==='function')renderAll();openDepotModal();}}];
  var rect=document.querySelector('[data-exa-slug="'+slug+'"]');
  if(rect&&typeof showContextMenu==='function') showContextMenu(rect.getBoundingClientRect().left,rect.getBoundingClientRect().top,it.n,opts);
}

function renderForgeTopbar(){
  var p=G.p; if(!p)return'';
  var note=p.depotNotification||0;
  return '<button class="sm" id="btn-forge" title="Exaltation Forge">FORGE</button><button class="sm" id="btn-depot" title="Depot">DEPOT'+(note?' <b style="color:#d4af37">'+note+'</b>':'')+'</button>';
}
