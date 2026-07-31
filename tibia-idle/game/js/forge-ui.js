/*
 * forge-ui.js — UI da Exaltation Forge e Depot
 *
 * Refactor completo do subsistema visual para:
 *   - corrigir o arquivo quebrado/sintaticamente inválido;
 *   - separar Forge e Depot;
 *   - refletir as regras oficiais (Fusion / Transfer / Convergence);
 *   - manter compatibilidade com a Exaltation Box legada sem acoplar a Forge.
 */
"use strict";

function forgeModalRoot() { return $("#modal"); }
function forgeModalBody() { return $("#modal-body"); }

function forgeOpenModal(html, wide2) {
  var modal = forgeModalRoot();
  var body = forgeModalBody();
  if (!modal || !body) return;
  body.innerHTML = html;
  if (wide2) {
    document.body.classList.add("modal-wide2", "wide");
    document.body.dataset.modalWide2 = "1";
  } else {
    document.body.classList.remove("modal-wide2");
    document.body.dataset.modalWide2 = "";
  }
  modal.classList.add("show");
  modal.classList.toggle("wide", !!wide2);
}

function forgeCloseModal() {
  var modal = forgeModalRoot();
  if (!modal) return;
  modal.classList.remove("show", "wide");
  document.body.classList.remove("modal-wide2", "wide");
  document.body.dataset.modalWide2 = "";
}

function forgeResourceSummaryHtml(p) {
  ensureForge(p);
  var cap = p.dustLimit || 100;
  return '<div class="row small" style="gap:8px;flex-wrap:wrap">'
    + '<span class="imb-mat"><b>Dust</b> ' + fmtFull(p.dust || 0) + ' / ' + fmtFull(cap) + '</span>'
    + '<span class="imb-mat"><b>Slivers</b> ' + fmtFull(p.slivers || 0) + '</span>'
    + '<span class="imb-mat"><b>Exalted Cores</b> ' + fmtFull(p.exaltedCores || 0) + '</span>'
    + '</div>';
}

function renderForgeItemList(p) {
  var items = forgeBagItems(p);
  if (!items.length) {
    return '<div class="small dim">Nenhum item elegível na mochila.<br>Coloque o equipamento na backpack para usar a Forge.</div>';
  }
  if (!FORGE_UI.slug || !items.some(function(e) { return e.ref === FORGE_UI.slug; })) {
    FORGE_UI.slug = items[0].ref;
  }
  var html = '<div class="imb-eqlist">';
  for (var i = 0; i < items.length; i++) {
    var e = items[i];
    var sel = e.ref === FORGE_UI.slug ? ' sel' : '';
    html += '<div class="imb-eq' + sel + '" data-forge-ref="' + e.ref + '">'
      + itemImg(e.slug, 30)
      + '<div class="imb-eq-meta"><b>' + e.it.n + '</b>'
      + '<span class="tiny dim">' + e.slot + ' · cls ' + e.cls + ' · instância · ' + (e.currentTier ? ('T' + e.currentTier) : 'sem tier') + ' / T' + e.maxTier + '</span>'
      + '</div></div>';
  }
  html += '</div>';
  return html;
}

function renderForgeModeTabs() {
  return '<div class="tabs">'
    + '<div class="tab' + (FORGE_UI.mode === 'fusion' ? ' active' : '') + '" id="forge-mode-fusion">Fusion</div>'
    + '<div class="tab' + (FORGE_UI.mode === 'transfer' ? ' active' : '') + '" id="forge-mode-transfer">Transferência</div>'
    + '</div>';
}

function renderForgeFusionPanel(p, slug) {
  var info = forgeItemSummary(p, slug);
  if (!info) return '<div class="small dim">Selecione um item válido.</div>';
  var effect = forgeEffectForSlot(info.slot, Math.min(info.tier + 1, info.maxTier), p);
  var useCore = !!FORGE_UI.useCore;
  var chk = forgeCanFuse(p, slug, useCore);
  var gold = forgeFusionGoldCost(info.slug, info.tier);
  var next = info.tier + 1;
  var chance = useCore ? FORGE_FUSION.successPctCore : FORGE_FUSION.successPct;
  var canUpgrade = next <= info.maxTier;
  var coreTxt = useCore ? 'ON' : 'OFF';
  var notes = '';
  if (info.bagCount > 2) {
    notes += '<div class="tiny txt-red mt4">Como o inventário ainda agrupa itens por slug, esta fusão exige exatamente 2 cópias na mochila.</div>';
  }
  if (info.hasImbue) {
    notes += '<div class="tiny txt-red mt4">Remova imbuements do item equipado antes de forjar este slug.</div>';
  }
  return ''
    + '<div class="imb-cat">Fusion</div>'
    + '<div class="row" style="gap:8px;align-items:flex-start">'
    +   '<div class="forge-tier-big">T' + (canUpgrade ? next : info.maxTier) + '</div>'
    +   '<div>'
    +     '<b>' + info.name + '</b>'
    +     '<div class="tiny dim">Atual: ' + (info.tier ? ('T' + info.tier) : 'sem tier') + ' · Máximo: T' + info.maxTier + '</div>'
    +     '<div class="tiny imb-eff mt4">' + (effect ? ('Próximo efeito: <b>' + effect.text + '</b><br><span class="dim">' + effect.desc + '</span>') : 'Sem efeito disponível.') + '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="imb-cat">Regras</div>'
    + '<div class="small">2 itens idênticos e do mesmo tier. 100 Dust por tentativa. O Exalted Core é opcional e aumenta a chance de sucesso de 50% para 65%.</div>'
    + '<div class="row mt8" style="gap:6px;flex-wrap:wrap">'
    +   '<button class="sm' + (useCore ? ' primary' : '') + '" id="forge-toggle-core">Exalted Core: ' + coreTxt + '</button>'
    +   '<span class="imb-mat">Chance <b>' + chance + '%</b></span>'
    +   '<span class="imb-mat">Gold <b class="gold-txt">' + fmtFull(gold) + ' gp</b></span>'
    +   '<span class="imb-mat">Dust <b>' + FORGE_FUSION.dustCost + '</b></span>'
    +   '<span class="imb-mat">Cópias <b>' + info.bagCount + '/2</b></span>'
    + '</div>'
    + (useCore ? '<div class="tiny dim mt4">Na falha, o Exalted Core reduz para 50% a penalidade do item remanescente.</div>' : '<div class="tiny dim mt4">Na falha sem core: item T0 perde a cópia sacrificada; item com tier pode perder 1 tier.</div>')
    + notes
    + (chk.ok
    ? '<button class="primary wide" id="forge-fuse-apply">FUNDIR</button>'
    : '<div class="tiny txt-red mt8">' + chk.msg + '</div><button class="primary wide" id="forge-fuse-apply" disabled>FUNDIR</button>');
}

function renderForgeTransferPanel(p, donorSlug) {
  var donor = forgeItemSummary(p, donorSlug);
  if (!donor) return '<div class="small dim">Selecione um item doador.</div>';
  var targets = forgeTransferTargets(p, donorSlug);
  if (!FORGE_UI.targetSlug || !targets.some(function(t) { return t.ref === FORGE_UI.targetSlug; })) {
    FORGE_UI.targetSlug = targets.length ? targets[0].ref : null;
  }
  var targetInfo = FORGE_UI.targetSlug ? forgeItemSummary(p, FORGE_UI.targetSlug) : null;
  var chk = targetInfo ? forgeCanTransfer(p, donorSlug, FORGE_UI.targetSlug) : { ok: false, msg: 'Nenhum alvo válido disponível.' };
  var gold = donor ? forgeTransferGoldCost(donor.slug, donor.tier) : 0;
  var list = '<div class="imb-cat">Alvos válidos</div>';
  if (!targets.length) {
    list += '<div class="small dim">Nenhum alvo elegível. O item alvo precisa ter a mesma classificação, estar sem tier e existir como 1 única cópia na mochila.</div>';
  } else {
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      list += '<div class="imb-row' + (FORGE_UI.targetSlug === t.ref ? ' sel' : '') + '" data-transfer-target="' + t.ref + '">'
        + itemImg(t.slug, 28)
        + '<span><b>' + t.it.n + '</b><br><span class="tiny dim">cls ' + t.cls + ' · sem tier · ' + t.count + 'x</span></span>'
        + '</div>';
    }
  }
  return ''
    + '<div class="imb-cat">Transferência</div>'
    + '<div class="small">O item doador precisa ser no mínimo T2. O alvo precisa estar sem tier e ter a mesma classificação. O alvo recebe o tier do doador menos 1.</div>'
    + '<div class="row mt8" style="gap:6px;flex-wrap:wrap">'
    +   '<span class="imb-mat">Doador <b>' + donor.name + ' T' + donor.tier + '</b></span>'
    +   '<span class="imb-mat">Resultado <b>T' + Math.max(0, donor.tier - 1) + '</b></span>'
    +   '<span class="imb-mat">Gold <b class="gold-txt">' + fmtFull(gold) + ' gp</b></span>'
    +   '<span class="imb-mat">Dust <b>' + FORGE_TRANSFER.dustCost + '</b></span>'
    +   '<span class="imb-mat">Core <b>' + FORGE_TRANSFER.coreCost + '</b></span>'
    + '</div>'
    + list
    + (chk.ok
      ? '<button class="primary wide" id="forge-transfer-apply">TRANSFERIR</button>'
      : '<div class="tiny txt-red mt8">' + chk.msg + '</div><button class="primary wide" id="forge-transfer-apply" disabled>TRANSFERIR</button>');
}

function renderForgeModal() {
  var p = G.p;
  if (!p) return '';
  ensureForge(p);
  var bag = forgeBagItems(p);
  if (!FORGE_UI.slug && bag.length) FORGE_UI.slug = bag[0].ref;
  var right = '';
  if (FORGE_UI.mode === 'transfer') right = renderForgeTransferPanel(p, FORGE_UI.slug);
  else right = renderForgeFusionPanel(p, FORGE_UI.slug);
  return ''
    + '<div class="panel-title">Exaltation Forge <span class="spacer"></span><span class="tiny dim">Fusion / Transfer / Convergence</span></div>'
    + '<div class="panel-body">'
    +   forgeResourceSummaryHtml(p)
    +   '<div class="tiny dim mt4">Somente itens na mochila entram na Forge. O Depot foi desacoplado deste fluxo.</div>'
    +   '<div class="imb-grid mt8">'
    +     '<div class="imb-col-left">' + renderForgeItemList(p) + '</div>'
    +     '<div class="imb-col-center">' + renderForgeModeTabs() + '</div>'
    +     '<div class="imb-col-right">' + right + '</div>'
    +   '</div>'
    +   '<div class="row" style="justify-content:flex-end;margin-top:6px;gap:8px">'
    +     '<button class="sm" id="forge-dust-btn">Resources</button>'
    +     '<button class="sm" id="forge-close">Fechar</button>'
    +   '</div>'
    + '</div>';
}

function openForgeModal() {
  var p = G.p;
  if (!p) return;
  ensureForge(p);
  forgeOpenModal(renderForgeModal(), true);
  bindForgeModal();
}

function bindForgeModal() {
  var body = forgeModalBody();
  if (!body) return;

  body.querySelectorAll('[data-forge-ref]').forEach(function(el) {
    el.addEventListener('click', function() {
      FORGE_UI.slug = el.dataset.forgeRef;
      if (FORGE_UI.mode !== 'transfer') FORGE_UI.targetSlug = null;
      openForgeModal();
    });
  });

  var modeFusion = body.querySelector('#forge-mode-fusion');
  if (modeFusion) modeFusion.addEventListener('click', function() {
    FORGE_UI.mode = 'fusion';
    FORGE_UI.targetSlug = null;
    openForgeModal();
  });

  var modeTransfer = body.querySelector('#forge-mode-transfer');
  if (modeTransfer) modeTransfer.addEventListener('click', function() {
    FORGE_UI.mode = 'transfer';
    openForgeModal();
  });

  body.querySelectorAll('[data-transfer-target]').forEach(function(el) {
    el.addEventListener('click', function() {
      FORGE_UI.targetSlug = el.dataset.transferTarget;
      openForgeModal();
    });
  });

  var toggleCore = body.querySelector('#forge-toggle-core');
  if (toggleCore) toggleCore.addEventListener('click', function() {
    FORGE_UI.useCore = !FORGE_UI.useCore;
    openForgeModal();
  });

  var fuseBtn = body.querySelector('#forge-fuse-apply');
  if (fuseBtn) fuseBtn.addEventListener('click', function() {
    var r = forgeFuse(G.p, FORGE_UI.slug, !!FORGE_UI.useCore);
    if (typeof toast === 'function') toast(r.msg, r.ok && r.success !== false ? 'ok' : (r.ok ? '' : 'err'));
    if (typeof renderAll === 'function') renderAll();
    openForgeModal();
  });

  var transferBtn = body.querySelector('#forge-transfer-apply');
  if (transferBtn) transferBtn.addEventListener('click', function() {
    var r = forgeTransfer(G.p, FORGE_UI.slug, FORGE_UI.targetSlug);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openForgeModal();
  });

  var dustBtn = body.querySelector('#forge-dust-btn');
  if (dustBtn) dustBtn.addEventListener('click', function() { openDustModal(); });

  var close = body.querySelector('#forge-close');
  if (close) close.addEventListener('click', forgeCloseModal);
}

/* ========== Resources / Convergence ========== */
function renderDustModal() {
  var p = G.p;
  ensureForge(p);
  var canDust = (p.dust || 0) >= FORGE_CONVERGENCE.dustToSlivers.dust;
  var canCore = (p.slivers || 0) >= FORGE_CONVERGENCE.sliversToCore.slivers;
  var capCost = typeof forgeDustLimitCost === 'function' ? forgeDustLimitCost(p) : 0;
  var canCap = capCost > 0 && (p.dust || 0) >= capCost;
  return ''
    + '<div class="panel-title">Resources & Convergence</div>'
    + '<div class="panel-body">'
    +   forgeResourceSummaryHtml(p)
    +   '<div class="shop-row mt8"><span class="small">Increase Dust Limit</span>'
    +     '<button class="sm' + (canCap ? ' primary' : '') + '" id="forge-inc-cap"' + (canCap ? '' : ' disabled') + '>'
    +       (capCost ? ('+' + 1 + ' limit por ' + capCost + ' Dust') : 'Limite máximo atingido')
    +     '</button></div>'
    +   '<div class="shop-row mt8"><span class="small">Dust → Slivers</span>'
    +     '<button class="sm' + (canDust ? ' primary' : '') + '" id="forge-conv-dust"' + (canDust ? '' : ' disabled') + '>'
    +       FORGE_CONVERGENCE.dustToSlivers.dust + ' Dust → ' + FORGE_CONVERGENCE.dustToSlivers.slivers + ' Slivers'
    +     '</button></div>'
    +   '<div class="shop-row"><span class="small">Slivers → Exalted Core</span>'
    +     '<button class="sm' + (canCore ? ' primary' : '') + '" id="forge-conv-core"' + (canCore ? '' : ' disabled') + '>'
    +       FORGE_CONVERGENCE.sliversToCore.slivers + ' Slivers → 1 Core'
    +     '</button></div>'
    +   '<div class="tiny dim mt8">Influenced/Fiendish geram Dust automaticamente. Slivers vêm de Fiendish e de conversão.</div>'
    +   '<button class="sm mt8" id="dust-close">Fechar</button>'
    + '</div>';
}

function openDustModal() {
  forgeOpenModal(renderDustModal(), false);
  var body = forgeModalBody();
  if (!body) return;
  var incCap = body.querySelector('#forge-inc-cap');
  if (incCap) incCap.addEventListener('click', function() {
    var r = forgeIncreaseDustLimit(G.p);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openDustModal();
  });
  var convDust = body.querySelector('#forge-conv-dust');
  if (convDust) convDust.addEventListener('click', function() {
    var r = forgeConvergenceDustToSlivers(G.p);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openDustModal();
  });
  var convCore = body.querySelector('#forge-conv-core');
  if (convCore) convCore.addEventListener('click', function() {
    var r = forgeConvergenceSliversToCore(G.p);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openDustModal();
  });
  var close = body.querySelector('#dust-close');
  if (close) close.addEventListener('click', forgeCloseModal);
}

/* ========== DEPOT ========== */
function renderDepotStoreList(p) {
  var rows = '';
  var equipables = [];
  if (typeof ensureItemInstances === 'function') ensureItemInstances(p);
  var insts = p && p.itemInstances ? p.itemInstances : [];
  for (var i = 0; i < insts.length; i++) {
    var inst = insts[i];
    if (!inst || inst.loc !== 'bag') continue;
    var itInst = GAMEDATA.items[inst.slug];
    if (!itInst || !itInst.s) continue;
    equipables.push({ ref: inst.id, slug: inst.slug, count: 1, tier: inst.tier || 0, it: itInst });
  }
  var bag = p && p.bag ? p.bag : {};
  for (var slug in bag) {
    if (!bag[slug] || (typeof itemUsesInstances === 'function' && itemUsesInstances(slug))) continue;
    var it = GAMEDATA.items[slug];
    if (!it || !it.s) continue;
    equipables.push({ ref: slug, slug: slug, count: bag[slug], tier: 0, it: it });
  }
  equipables.sort(function(a, b) { return a.it.n < b.it.n ? -1 : 1; });
  if (!equipables.length) return '<div class="tiny dim mt8">Nenhum equipamento na mochila para guardar.</div>';
  for (var j = 0; j < equipables.length && j < 12; j++) {
    var e = equipables[j];
    rows += '<div class="shop-row">'
      + '<span class="small">' + e.it.n + ' <span class="dim">' + (e.tier ? ('T' + e.tier) : ('x' + e.count)) + '</span></span>'
      + '<button class="sm" data-depot-store="' + e.ref + '">Guardar 1x</button>'
      + '</div>';
  }
  return '<div class="imb-cat">Guardar no Depot</div>' + rows;
}

function renderDepotGrid(p) {
  var total = 30;
  var html = '<div class="inv-grid">';
  for (var i = 0; i < total; i++) {
    var ref = p.depot[i];
    var slug = forgeStoredSlug(p, ref);
    var tierTxt = typeof forgeTierTextForInstance === 'function' ? forgeTierTextForInstance(ref) : '';
    if (slug) html += '<div class="inv-item" data-depot-ref="' + ref + '">' + itemImg(slug) + (tierTxt ? '<span class="cnt" style="color:#ffe680">' + tierTxt + '</span>' : '') + '</div>';
    else html += '<div class="inv-item empty" title="Slot vazio"></div>';
  }
  html += '</div>';
  return html;
}

function renderLegacyExaGrid(p) {
  var eb = p.exaltationBox || [];
  if (!eb.length) return '<div class="tiny dim">Nenhum item legado na Exaltation Box.</div>';
  var html = '<div class="inv-grid">';
  for (var i = 0; i < eb.length; i++) {
    var ref = eb[i];
    var slug = forgeStoredSlug(p, ref);
    var tierTxt = typeof forgeTierTextForInstance === 'function' ? forgeTierTextForInstance(ref) : '';
    html += '<div class="inv-item" data-exa-ref="' + ref + '">' + itemImg(slug) + (tierTxt ? '<span class="cnt" style="color:#ffe680">' + tierTxt + '</span>' : '') + '</div>';
  }
  html += '</div><div class="tiny dim mt4">Caixa legada de saves antigos. A Forge nova não envia itens para cá.</div>';
  return html;
}

function renderDepotModal() {
  var p = G.p;
  if (!p) return '';
  ensureForge(p);
  var hasLegacy = (p.exaltationBox || []).length > 0;
  var tabs = '<div class="tabs">'
    + '<div class="tab' + (DEPOT_UI.tab === 'depot' ? ' active' : '') + '" id="depot-tab-depot">Depot (' + p.depot.length + '/30)</div>'
    + (hasLegacy ? '<div class="tab' + (DEPOT_UI.tab === 'legacy' ? ' active' : '') + '" id="depot-tab-legacy">Exaltation Box Legada (' + p.exaltationBox.length + ')</div>' : '')
    + '</div>';
  var body = DEPOT_UI.tab === 'legacy' ? renderLegacyExaGrid(p) : (renderDepotGrid(p) + renderDepotStoreList(p));
  return ''
    + '<div class="panel-title">Depot <span class="spacer"></span><span class="tiny dim">Forge e Depot agora estão desacoplados</span></div>'
    + '<div class="panel-body">'
    + tabs
    + body
    + '<div class="row" style="justify-content:flex-end;margin-top:6px;gap:8px"><button class="sm" id="depot-close">Fechar</button></div>'
    + '</div>';
}

function openDepotModal() {
  var p = G.p;
  if (!p) return;
  ensureForge(p);
  if (DEPOT_UI.tab !== 'legacy') DEPOT_UI.tab = 'depot';
  forgeOpenModal(renderDepotModal(), false);
  bindDepotModal();
}

function bindDepotModal() {
  var body = forgeModalBody();
  if (!body) return;

  var dt = body.querySelector('#depot-tab-depot');
  if (dt) dt.addEventListener('click', function() { DEPOT_UI.tab = 'depot'; openDepotModal(); });
  var dl = body.querySelector('#depot-tab-legacy');
  if (dl) dl.addEventListener('click', function() { DEPOT_UI.tab = 'legacy'; openDepotModal(); });

  body.querySelectorAll('[data-depot-store]').forEach(function(el) {
    el.addEventListener('click', function() {
      var r = depotStore(G.p, el.dataset.depotStore);
      if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
      if (typeof renderAll === 'function') renderAll();
      openDepotModal();
    });
  });

  body.querySelectorAll('[data-depot-ref]').forEach(function(el) {
    el.addEventListener('click', function() {
      openDepotItemMenu(G.p, el.dataset.depotRef, el);
    });
    el.addEventListener('contextmenu', function(ev) {
      ev.preventDefault();
      openDepotItemMenu(G.p, el.dataset.depotRef, el);
    });
    el.addEventListener('mouseenter', function() {
      if (typeof showTip === 'function') showTip(itemTip(forgeStoredSlug(G.p, el.dataset.depotRef), 'Clique para opções'));
    });
    el.addEventListener('mouseleave', function() {
      if (typeof hideTip === 'function') hideTip();
    });
  });

  body.querySelectorAll('[data-exa-ref]').forEach(function(el) {
    el.addEventListener('click', function() {
      openLegacyExaItemMenu(G.p, el.dataset.exaRef, el);
    });
    el.addEventListener('contextmenu', function(ev) {
      ev.preventDefault();
      openLegacyExaItemMenu(G.p, el.dataset.exaRef, el);
    });
    el.addEventListener('mouseenter', function() {
      if (typeof showTip === 'function') showTip(itemTip(forgeStoredSlug(G.p, el.dataset.exaRef), 'Item legado da antiga Exaltation Box'));
    });
    el.addEventListener('mouseleave', function() {
      if (typeof hideTip === 'function') hideTip();
    });
  });

  var close = body.querySelector('#depot-close');
  if (close) close.addEventListener('click', forgeCloseModal);
}

function openDepotItemMenu(p, ref, el) {
  var slug = forgeStoredSlug(p, ref);
  var it = GAMEDATA.items[slug];
  if (!it) return;
  var opts = [
    { label: 'Equipar', action: function() {
      var r = depotEquip(p, ref);
      if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
      if (typeof renderAll === 'function') renderAll();
      openDepotModal();
    }},
    { label: 'Retirar para mochila', action: function() {
      var r = depotRetrieve(p, ref);
      if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
      if (typeof renderAll === 'function') renderAll();
      openDepotModal();
    }},
  ];
  if (typeof showContextMenu === 'function') {
    var rect = el.getBoundingClientRect();
    showContextMenu(rect.left, rect.top, it.n, opts);
  }
}

function openLegacyExaItemMenu(p, ref, el) {
  var slug = forgeStoredSlug(p, ref);
  var it = GAMEDATA.items[slug];
  if (!it) return;
  var opts = [
    { label: 'Equipar', action: function() {
      var r = exaltationEquip(p, ref);
      if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
      if (typeof renderAll === 'function') renderAll();
      openDepotModal();
    }},
    { label: 'Retirar para mochila', action: function() {
      var r = exaltationRetrieve(p, ref);
      if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
      if (typeof renderAll === 'function') renderAll();
      openDepotModal();
    }},
  ];
  if (typeof showContextMenu === 'function') {
    var rect = el.getBoundingClientRect();
    showContextMenu(rect.left, rect.top, it.n, opts);
  }
}

function renderForgeTopbar() {
  return '<button class="sm" id="btn-forge" title="Exaltation Forge">FORGE</button>'
    + '<button class="sm" id="btn-depot" title="Depot">DEPOT</button>';
}
