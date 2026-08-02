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
  if (modal) modal.classList.toggle("forge-modal-shell", String(html || "").indexOf("forge-client") !== -1);
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
  modal.classList.remove("show", "wide", "forge-modal-shell");
  document.body.classList.remove("modal-wide2", "wide");
  document.body.dataset.modalWide2 = "";
}

function forgeResourceSummaryHtml(p) {
  ensureForge(p);
  var cap = p.dustLimit || 100;
  return '<div class="forge-client-res-inline">'
    + '<span>' + forgeResourceImg('dust', 14) + '<b>Dust</b> ' + fmtFull(p.dust || 0) + '/' + fmtFull(cap) + '</span>'
    + '<span>' + forgeResourceImg('sliver', 14) + '<b>Slivers</b> ' + fmtFull(p.slivers || 0) + '</span>'
    + '<span>' + forgeResourceImg('exalted-core', 14) + '<b>Exalted Cores</b> ' + fmtFull(p.exaltedCores || 0) + '</span>'
    + '</div>';
}

function forgeClientTabHtml() {
  var tabs = [
    { id: 'fusion', label: 'Fusion', cls: 'fusion' },
    { id: 'transfer', label: 'Transfer', cls: 'transfer' },
    { id: 'conversion', label: 'Conversion', cls: 'conversion' },
    { id: 'history', label: 'History', cls: 'history' },
  ];
  var html = '<div class="forge-client-tabs">';
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    html += '<button class="forge-client-tab' + (FORGE_UI.mode === t.id ? ' active' : '')
      + '" data-forge-mode="' + t.id + '">'
      + '<span class="forge-client-tab-icon ' + t.cls + '"></span>'
      + '<span>' + t.label + '</span></button>';
  }
  return html + '</div>';
}

function forgeClientItemTile(slug, count, cls, attrs, size) {
  if (!slug) return '<div class="forge-client-slot empty ' + (cls || '') + '" ' + (attrs || '') + '></div>';
  var badge = count ? '<span class="forge-client-count">' + count + '</span>' : '';
  return '<div class="forge-client-slot ' + (cls || '') + '" ' + (attrs || '') + '>'
    + itemImg(slug, size || 34) + badge + '</div>';
}

/* Tile de RECURSO da forja com o sprite OFICIAL animado da TibiaWiki
 * (Dust.gif / Sliver.gif / Exalted_Core.gif) — a versão estática PNG do
 * mystic-dust foi removida com a chegada do Canary. */
function forgeClientResourceTile(slug, count, cls, size) {
  var sz = size || 34;
  var badge = count ? '<span class="forge-client-count">' + count + '</span>' : '';
  return '<div class="forge-client-slot ' + (cls || '') + '" title="' +
    ((GAMEDATA.items[slug] && GAMEDATA.items[slug].n) || slug) + '">'
    + '<img class="item-sprite" src="assets/item/' + slug + '.gif" alt="" '
    + 'style="width:' + sz + 'px;height:' + sz + 'px">' + badge + '</div>';
}

/* <img> pequeno do recurso para as linhas de conversão/carteira. */
function forgeResourceImg(slug, size) {
  var sz = size || 14;
  return '<img class="item-sprite" src="assets/item/' + slug + '.gif" alt="" '
    + 'style="width:' + sz + 'px;height:' + sz + 'px;vertical-align:-3px;margin-right:4px">';
}

function forgeClientItemListHtml(p) {
  var items = forgeBagItems(p);
  if (!items.length) {
    FORGE_UI.slug = null;
    return '<div class="forge-client-empty">No eligible items in backpack.</div>';
  }
  if (!FORGE_UI.slug || !items.some(function(e) { return e.ref === FORGE_UI.slug; })) {
    FORGE_UI.slug = items[0].ref;
  }
  var html = '<div class="forge-client-item-grid">';
  for (var i = 0; i < items.length; i++) {
    var e = items[i];
    var same = forgeBagInstanceRefs(p, e.slug, e.currentTier).length;
    html += forgeClientItemTile(e.slug, same > 1 ? same : '', e.ref === FORGE_UI.slug ? 'sel' : '',
      'data-forge-ref="' + e.ref + '" title="' + e.it.n + ' - ' + (e.currentTier ? ('T' + e.currentTier) : 'T0') + '"', 34);
  }
  return html + '</div>';
}

function forgeClientTierPreview(info) {
  var next = info ? Math.min((info.tier || 0) + 1, info.maxTier || 0) : 0;
  var itemSlug = info ? info.slug : null;
  var tierClass = next ? forgeTierClassForValue(next) : '';
  return '<div class="forge-client-tier-preview">'
    + '<div class="forge-client-equip-slot ' + tierClass + '">'
    + (itemSlug ? itemImg(itemSlug, 38) : '')
    + '</div>'
    + (next ? '<span class="forge-client-tier-badge">' + next + '</span>' : '')
    + '</div>';
}

function forgeClientCostValue(value, cls) {
  return '<span class="forge-client-cost ' + (cls || '') + '">' + value + '</span>';
}

function renderForgeFusionPanel(p, ref) {
  var info = ref ? forgeItemSummary(p, ref) : null;
  var useCore = !!FORGE_UI.useCore;
  var chk = info ? forgeCanFuse(p, ref, useCore) : { ok: false, msg: 'Select an item for fusion.' };
  var gold = info ? forgeFusionGoldCost(info.slug, info.tier) : 0;
  var sameTier = info ? forgeBagInstanceRefs(p, info.slug, info.tier).length : 0;
  var dustOk = (p.dust || 0) >= FORGE_FUSION.dustCost;
  var coreOk = (p.exaltedCores || 0) >= 1;
  var canUpgrade = info && (info.tier || 0) < (info.maxTier || 0);
  var effect = info && canUpgrade ? forgeEffectForSlot(info.slot, info.tier + 1, p) : null;
  var success = useCore ? FORGE_FUSION.successPctCore : FORGE_FUSION.successPct;
  var tierLoss = useCore ? FORGE_FUSION.failPenaltyProtectPct : 100;

  return ''
    + '<div class="forge-client-section-title">Select Item For Fusion</div>'
    + '<div class="forge-client-select-row">'
    +   '<div class="forge-client-item-list">' + forgeClientItemListHtml(p) + '</div>'
    +   '<div class="forge-client-arrows"><span></span><span></span><span></span></div>'
    +   forgeClientTierPreview(info)
    + '</div>'
    + '<div class="forge-client-section-title">Further Items Needed For Fusion</div>'
    + '<div class="forge-client-further">'
    +   '<div class="forge-client-need-icons">'
    +     forgeClientItemTile(info ? info.slug : null, info ? (sameTier + '/2') : '', sameTier >= 2 ? 'ok' : 'bad', '', 38)
    +     forgeClientResourceTile('dust', info ? ((p.dust || 0) + '/' + FORGE_FUSION.dustCost) : '', dustOk ? 'ok' : 'bad', 34)
    +   '</div>'
    +   '<div class="forge-client-rates">'
    +     '<div class="forge-client-rate-row"><span>Success Rate:</span><b class="red">' + success + '%</b></div>'
    +     '<button class="forge-client-mini-btn' + (useCore ? ' active' : '') + '" data-forge-core="1">Improve to 65% ' + forgeResourceImg('exalted-core', 12) + '<span>1</span></button>'
    +     '<div class="forge-client-rate-row"><span>Tier Loss:</span><b class="red">' + tierLoss + '%</b></div>'
    +     '<button class="forge-client-mini-btn' + (useCore ? ' active' : '') + '" data-forge-core="1">Reduce to 50% ' + forgeResourceImg('exalted-core', 12) + '<span>1</span></button>'
    +   '</div>'
    +   '<div class="forge-client-arrows one"><span></span></div>'
    +   '<div class="forge-client-result-box">'
    +     '<div class="forge-client-ghost-icons">'
    +       forgeClientItemTile(info ? info.slug : null, '', '', '', 30)
    +       forgeClientItemTile(info ? info.slug : null, '', '', '', 30)
    +     '</div>'
    +     forgeClientCostValue(fmtFull(gold), 'red')
    +     '<button class="forge-client-action" id="forge-fuse-apply"' + (chk.ok ? '' : ' disabled') + '>Fuse</button>'
    +   '</div>'
    + '</div>'
    + '<div class="forge-client-desc">'
    +   '<p>The aim of a fusion is to increase the tier of an item. <span class="info-dot">i</span></p>'
    +   '<p>The classification of an item defines its maximum tier. <span class="info-dot">i</span></p>'
    +   '<p>If two items are fused, you can spend exaltation cores. <span class="info-dot">i</span></p>'
    +   '<p>Items with a tier grant unique bonuses. <span class="info-dot">i</span></p>'
    +   (effect ? '<p class="forge-client-effect">Next: ' + effect.text + '</p>' : '')
    +   (!chk.ok ? '<p class="forge-client-warning">' + chk.msg + '</p>' : '')
    + '</div>';
}

function renderForgeTransferPanel(p, donorRef) {
  var donor = donorRef ? forgeItemSummary(p, donorRef) : null;
  var targets = donor ? forgeTransferTargets(p, donorRef) : [];
  if (!FORGE_UI.targetSlug || !targets.some(function(t) { return t.ref === FORGE_UI.targetSlug; })) {
    FORGE_UI.targetSlug = targets.length ? targets[0].ref : null;
  }
  var targetInfo = FORGE_UI.targetSlug ? forgeItemSummary(p, FORGE_UI.targetSlug) : null;
  var chk = targetInfo ? forgeCanTransfer(p, donorRef, FORGE_UI.targetSlug) : { ok: false, msg: 'No valid target available.' };
  var gold = donor ? forgeTransferGoldCost(donor.slug, donor.tier) : 0;
  var htmlTargets = '<div class="forge-client-target-grid">';
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    htmlTargets += forgeClientItemTile(t.slug, '', FORGE_UI.targetSlug === t.ref ? 'sel' : '',
      'data-transfer-target="' + t.ref + '" title="' + t.it.n + '"', 34);
  }
  htmlTargets += targets.length ? '</div>' : '<div class="forge-client-empty">No target item without tier.</div>';
  return ''
    + '<div class="forge-client-section-title">Select Item For Transfer</div>'
    + '<div class="forge-client-select-row transfer">'
    +   '<div class="forge-client-item-list">' + forgeClientItemListHtml(p) + '</div>'
    +   '<div class="forge-client-arrows"><span></span><span></span><span></span></div>'
    +   '<div class="forge-client-item-list targets">' + htmlTargets + '</div>'
    + '</div>'
    + '<div class="forge-client-section-title">Further Items Needed For Transfer</div>'
    + '<div class="forge-client-further transfer">'
    +   '<div class="forge-client-need-icons">'
    +     forgeClientResourceTile('dust', (p.dust || 0) + '/' + FORGE_TRANSFER.dustCost, (p.dust || 0) >= FORGE_TRANSFER.dustCost ? 'ok' : 'bad', 34)
    +     forgeClientResourceTile('exalted-core', '1', (p.exaltedCores || 0) >= 1 ? 'ok' : 'bad', 34)
    +   '</div>'
    +   '<div class="forge-client-rates wide">'
    +     '<div class="forge-client-rate-row"><span>Donor:</span><b>' + (donor ? donor.name + ' T' + donor.tier : '-') + '</b></div>'
    +     '<div class="forge-client-rate-row"><span>Target:</span><b>' + (targetInfo ? targetInfo.name : '-') + '</b></div>'
    +     '<div class="forge-client-rate-row"><span>Result Tier:</span><b class="red">T' + (donor ? Math.max(0, donor.tier - 1) : 0) + '</b></div>'
    +   '</div>'
    +   '<div class="forge-client-result-box">'
    +     forgeClientCostValue(fmtFull(gold), 'red')
    +     '<button class="forge-client-action" id="forge-transfer-apply"' + (chk.ok ? '' : ' disabled') + '>Transfer</button>'
    +   '</div>'
    + '</div>'
    + '<div class="forge-client-desc">'
    +   '<p>Transfer moves a tier from the donor to a clean item of the same classification.</p>'
    +   '<p>The target receives donor tier minus one.</p>'
    +   (!chk.ok ? '<p class="forge-client-warning">' + chk.msg + '</p>' : '')
    + '</div>';
}

function renderForgeConversionPanel(p) {
  var capCost = typeof forgeDustLimitCost === 'function' ? forgeDustLimitCost(p) : 0;
  var canCap = capCost > 0 && (p.dust || 0) >= capCost;
  var canDust = (p.dust || 0) >= FORGE_CONVERGENCE.dustToSlivers.dust;
  var canCore = (p.slivers || 0) >= FORGE_CONVERGENCE.sliversToCore.slivers;
  return ''
    + '<div class="forge-client-section-title">Conversion of Dust and Slivers</div>'
    + '<div class="forge-client-conversion">'
    +   '<div class="forge-client-conv-row"><div><b>Increase Dust Limit</b><span>Spend Dust to raise the cap by 1.</span></div>'
    +     '<button class="forge-client-action" id="forge-inc-cap"' + (canCap ? '' : ' disabled') + '>' + (capCost ? capCost + ' Dust' : 'Maximum') + '</button></div>'
    +   '<div class="forge-client-conv-row"><div><b>Dust to Slivers</b><span>Convert forge Dust into Slivers.</span></div>'
    +     '<button class="forge-client-action" id="forge-conv-dust"' + (canDust ? '' : ' disabled') + '>' + forgeResourceImg('dust', 14) + FORGE_CONVERGENCE.dustToSlivers.dust + ' → ' + forgeResourceImg('sliver', 14) + FORGE_CONVERGENCE.dustToSlivers.slivers + '</button></div>'
    +   '<div class="forge-client-conv-row"><div><b>Slivers to Exalted Core</b><span>Create one Exalted Core.</span></div>'
    +     '<button class="forge-client-action" id="forge-conv-core"' + (canCore ? '' : ' disabled') + '>' + forgeResourceImg('sliver', 14) + FORGE_CONVERGENCE.sliversToCore.slivers + ' → ' + forgeResourceImg('exalted-core', 14) + '1</button></div>'
    + '</div>'
    + '<div class="forge-client-desc"><p>Influenced and Fiendish creatures generate Dust automatically. Fiendish creatures can also grant Slivers.</p></div>';
}

function forgeRememberHistory(p, msg) {
  if (!p || !msg) return;
  p.forgeHistory = Array.isArray(p.forgeHistory) ? p.forgeHistory : [];
  p.forgeHistory.unshift({ at: Date.now(), msg: msg });
  if (p.forgeHistory.length > 30) p.forgeHistory.length = 30;
}

function renderForgeHistoryPanel(p) {
  var rows = Array.isArray(p.forgeHistory) ? p.forgeHistory : [];
  var html = '<div class="forge-client-section-title">Your Exaltation Forge History</div>'
    + '<div class="forge-client-history">';
  if (!rows.length) {
    html += '<div class="forge-client-empty">No forge history yet.</div>';
  } else {
    for (var i = 0; i < rows.length; i++) {
      var d = new Date(rows[i].at || Date.now());
      html += '<div class="forge-client-history-row"><span>' + d.toLocaleTimeString() + '</span><b>' + rows[i].msg + '</b></div>';
    }
  }
  return html + '</div>';
}

function renderForgeModal() {
  var p = G.p;
  if (!p) return '';
  ensureForge(p);
  var bag = forgeBagItems(p);
  if (!FORGE_UI.slug && bag.length) FORGE_UI.slug = bag[0].ref;
  if (!FORGE_UI.mode) FORGE_UI.mode = 'fusion';
  var content = '';
  if (FORGE_UI.mode === 'transfer') content = renderForgeTransferPanel(p, FORGE_UI.slug);
  else if (FORGE_UI.mode === 'conversion') content = renderForgeConversionPanel(p);
  else if (FORGE_UI.mode === 'history') content = renderForgeHistoryPanel(p);
  else content = renderForgeFusionPanel(p, FORGE_UI.slug);

  return '<div class="forge-client">'
    + '<div class="forge-client-title">Exaltation Forge</div>'
    + forgeClientTabHtml()
    + '<div class="forge-client-main">' + content + '</div>'
    + '<div class="forge-client-footer">'
    +   '<div class="forge-client-wallet gold"><img class="forge-wallet-icon" src="assets/item/gold-coin.png" alt=""><span>' + fmtFull(p.gold || 0) + '</span></div>'
    +   '<div class="forge-client-wallet dust"><img class="forge-wallet-icon" src="assets/item/dust.gif" alt=""><span>' + fmtFull(p.dust || 0) + '/' + fmtFull(p.dustLimit || 100) + '</span></div>'
    +   '<div class="forge-client-wallet slivers"><img class="forge-wallet-icon" src="assets/item/sliver.gif" alt=""><span>' + fmtFull(p.slivers || 0) + '</span></div>'
    +   '<div class="forge-client-wallet cores"><img class="forge-wallet-icon" src="assets/item/exalted-core.gif" alt=""><span>' + fmtFull(p.exaltedCores || 0) + '</span></div>'
    +   '<button class="forge-client-close" id="forge-close">Close</button>'
    + '</div>'
    + '</div>';
}

function openForgeModal() {
  var p = G.p;
  if (!p) return;
  ensureForge(p);
  forgeOpenModal(renderForgeModal(), false);
  bindForgeModal();
}

function bindForgeModal() {
  var body = forgeModalBody();
  if (!body) return;

  body.querySelectorAll('[data-forge-mode]').forEach(function(el) {
    el.addEventListener('click', function() {
      FORGE_UI.mode = el.dataset.forgeMode;
      if (FORGE_UI.mode !== 'transfer') FORGE_UI.targetSlug = null;
      openForgeModal();
    });
  });

  body.querySelectorAll('[data-forge-ref]').forEach(function(el) {
    el.addEventListener('click', function() {
      FORGE_UI.slug = el.dataset.forgeRef;
      if (FORGE_UI.mode !== 'transfer') FORGE_UI.targetSlug = null;
      openForgeModal();
    });
  });

  body.querySelectorAll('[data-transfer-target]').forEach(function(el) {
    el.addEventListener('click', function() {
      FORGE_UI.targetSlug = el.dataset.transferTarget;
      openForgeModal();
    });
  });

  body.querySelectorAll('[data-forge-core]').forEach(function(el) {
    el.addEventListener('click', function() {
      FORGE_UI.useCore = !FORGE_UI.useCore;
      openForgeModal();
    });
  });

  var fuseBtn = body.querySelector('#forge-fuse-apply');
  if (fuseBtn) fuseBtn.addEventListener('click', function() {
    var r = forgeFuse(G.p, FORGE_UI.slug, !!FORGE_UI.useCore);
    if (r.ok) forgeRememberHistory(G.p, r.msg);
    if (typeof toast === 'function') toast(r.msg, r.ok && r.success !== false ? 'ok' : (r.ok ? '' : 'err'));
    if (typeof renderAll === 'function') renderAll();
    openForgeModal();
  });

  var transferBtn = body.querySelector('#forge-transfer-apply');
  if (transferBtn) transferBtn.addEventListener('click', function() {
    var r = forgeTransfer(G.p, FORGE_UI.slug, FORGE_UI.targetSlug);
    if (r.ok) forgeRememberHistory(G.p, r.msg);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openForgeModal();
  });

  var incCap = body.querySelector('#forge-inc-cap');
  if (incCap) incCap.addEventListener('click', function() {
    var r = forgeIncreaseDustLimit(G.p);
    if (r.ok) forgeRememberHistory(G.p, r.msg);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openForgeModal();
  });
  var convDust = body.querySelector('#forge-conv-dust');
  if (convDust) convDust.addEventListener('click', function() {
    var r = forgeConvergenceDustToSlivers(G.p);
    if (r.ok) forgeRememberHistory(G.p, r.msg);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openForgeModal();
  });
  var convCore = body.querySelector('#forge-conv-core');
  if (convCore) convCore.addEventListener('click', function() {
    var r = forgeConvergenceSliversToCore(G.p);
    if (r.ok) forgeRememberHistory(G.p, r.msg);
    if (typeof toast === 'function') toast(r.msg, r.ok ? 'ok' : 'err');
    if (typeof renderAll === 'function') renderAll();
    openForgeModal();
  });

  var close = body.querySelector('#forge-close');
  if (close) close.addEventListener('click', forgeCloseModal);
}

/* ========== Resources / Convergence ========== */
function renderDustModal() { return renderForgeModal(); }
function openDustModal() { FORGE_UI.mode = 'conversion'; openForgeModal(); }

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
    if (slug) html += '<div class="inv-item" data-depot-ref="' + ref + '">' + itemImg(slug) + (tierTxt ? '<span class="tier-badge ' + (typeof forgeTierClassForValue === 'function' ? forgeTierClassForValue(typeof forgeItemTier === 'function' ? forgeItemTier(G.p, ref) : 0) : '') + '">' + tierTxt + '</span>' : '') + '</div>';
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
    html += '<div class="inv-item" data-exa-ref="' + ref + '">' + itemImg(slug) + (tierTxt ? '<span class="tier-badge ' + (typeof forgeTierClassForValue === 'function' ? forgeTierClassForValue(typeof forgeItemTier === 'function' ? forgeItemTier(G.p, ref) : 0) : '') + '">' + tierTxt + '</span>' : '') + '</div>';
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
