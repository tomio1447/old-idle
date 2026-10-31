/* =========================================================================
 * wheel-ui.js — Wheel of Destiny (OTClient game_wheel module)
 *
 * Layout matching wheel.otui: 3 tabs (Wheel/Gem/Fragment), money bar,
 * summary toggle, preset bar, Promotion Scrolls section.
 * ========================================================================= */
"use strict";

var WHEEL_SIZE = 522;

function wheelColorCss(c) {
  return { green: "#4ade80", red: "#f87171", blue: "#60a5fa", purple: "#c084fc" }[c];
}

function wheelVocImage(voc) {
  var map = { knight: "knight", paladin: "paladin", sorcerer: "sorcerer",
              druid: "druid", monk: "monk" };
  return "assets/wheel/vocations/backdrop_skillwheel_" + (map[voc] || "knight") + ".png";
}

function wheelSlotLabel(spec, voc) {
  var parts = [];
  if (spec.hp) parts.push("+" + WHEEL_HP[voc] + " HP/pt");
  if (spec.mana) parts.push("+" + WHEEL_MP[voc] + " Mana/pt");
  if (spec.cap) parts.push("+" + WHEEL_CAP[voc] + " Cap/pt");
  if (spec.mit) parts.push("+" + wheelPct(WHEEL_MIT_PER_POINT * 100) + " Mitig/pt");
  if (spec.leech) parts.push("+" + wheelPct(WHEEL_LEECH[spec.leech]) + " " + (spec.leech === "life" ? "Life" : "Mana") + " leech (max)");
  if (spec.skill) parts.push("+" + (WHEEL_SKILL[voc] === "distance" ? "Dist" : WHEEL_SKILL[voc]) + " (max)");
  if (spec.spell) {
    var sid = spec.spell[voc];
    parts.push((sid === "__focus__" ? "Focus Spells" : (SPELLS[sid] ? SPELLS[sid].name : sid)) + " (max)");
  }
  if (spec.instant && spec.instant[voc]) parts.push(spec.instant[voc] + " (max)");
  return parts.join(" \u00b7 ");
}

function wheelPct(v) {
  return String(Math.round(v * 100) / 100).replace(".", ",") + "%";
}

function wheelBorderUrl(spec) {
  if (!spec || !spec.border) return "";
  return "assets/wheel/border/" + spec.border[0] + "/" + spec.border[1] + ".png";
}

/* Composicao identica ao OTClient (game_wheel):
 *   backdrop_skillwheel (base escura)
 *   + fullColorWheel_i: fatia cheia `slot<N>/<frames>.png` a 20% (trilha)
 *   + colorWheel_i: fill progressivo `slot<N>/<frame>.png` a 60%
 *   + vocationWheel (moldura dourada por vocacao) por cima das fatias
 *   + icon_i: celula 30x30 da sheet mediumperks (retangulo por vocacao)
 *   + smallicon_i: celula 16x16 da sheet smallperks
 *   hover -> focusImageBase (wedge highlight), selecao -> wheel-border. */
function wheelSliceHtml(p, slotId) {
  var o = (typeof WHEEL_OTC !== "undefined") ? WHEEL_OTC[slotId] : null;
  if (!o) return "";
  var spec = WHEEL_SLOTS[slotId];
  var pts = wheelSlotPoints(p, slotId);
  var root = WHEEL_ROOTS.indexOf(slotId) >= 0;
  var h = "";
  if (pts > 0 || root)
    h += '<img class="wheel-slice-track" src="assets/wheel/wheel-colors/' + o.color +
      '/' + o.frames + '.png?v=wheel-otc-v1" alt="" draggable="false">';
  if (pts > 0) {
    var frame = pts >= spec.max ? o.frames : Math.max(1, Math.min(o.frames, Math.floor(pts / 10) + 1));
    h += '<img class="wheel-slice-fill" src="assets/wheel/wheel-colors/' + o.color +
      '/' + frame + '.png?v=wheel-otc-v1" alt="" draggable="false">';
  }
  return h;
}

/* Overlay de hover/selecao (uma camada so, trocada via JS). */
function wheelFocusOverlays(p) {
  var h = '<img class="wheel-slice-focus" alt="" style="display:none" draggable="false">';
  if (typeof WHEEL_UI !== "undefined" && WHEEL_UI.sel && WHEEL_OTC[WHEEL_UI.sel])
    h += '<img class="wheel-slice-selb" src="assets/wheel/wheel-border/' +
      WHEEL_OTC[WHEEL_UI.sel].border + '.png?v=wheel-otc-v1" alt="" draggable="false">';
  return h;
}

/* Menor caminho do no ate uma raiz pelo grafo de conexoes (BFS) —
 * retorna [raiz, ..., slotId] ou null. Os nos intermediarios sao a
 * sequencia de fatias que precisam ser completadas para evoluir. */
function wheelPathToRoot(slotId) {
  var prev = {}, queue = [slotId], seen = {};
  seen[slotId] = true;
  while (queue.length) {
    var cur = queue.shift();
    if (WHEEL_ROOTS.indexOf(cur) !== -1) {
      var path = [];
      for (var n = cur; n != null; n = prev[n]) path.push(n);
      return path;
    }
    var nb = WHEEL_CONNECTED[cur] || [];
    for (var i = 0; i < nb.length; i++) {
      if (!seen[nb[i]]) { seen[nb[i]] = true; prev[nb[i]] = cur; queue.push(nb[i]); }
    }
  }
  return null;
}

/* Camadas de sequencia: SVG com as arestas do grafo (trilha da evolucao)
 * + caixas numeradas na ordem que a fatia selecionada exige completar. */
function wheelPathsHtml(p) {
  var sel = (typeof WHEEL_UI !== "undefined") ? WHEEL_UI.sel : null;
  var path = (sel && WHEEL_OTC[sel] && WHEEL_ROOTS.indexOf(sel) === -1) ? wheelPathToRoot(sel) : null;
  var inPath = {};
  if (path) path.forEach(function (id) { inPath[id] = true; });
  var lines = "", seen = {};
  for (var a in WHEEL_CONNECTED) {
    var oa = WHEEL_OTC[a]; if (!oa) continue;
    var nb = WHEEL_CONNECTED[a] || [];
    for (var i = 0; i < nb.length; i++) {
      var b = nb[i], ob = WHEEL_OTC[b]; if (!ob) continue;
      var key = a < b ? a + "|" + b : b + "|" + a;
      if (seen[key]) continue; seen[key] = 1;
      var cls = "wp-edge" + ((inPath[a] && inPath[b]) ? " wp-on" : "");
      lines += '<line x1="' + oa.x + '" y1="' + oa.y + '" x2="' + ob.x + '" y2="' + ob.y + '" class="' + cls + '"/>';
    }
  }
  var h = '<svg class="wheel-paths" viewBox="0 0 ' + WHEEL_SIZE + ' ' + WHEEL_SIZE + '" preserveAspectRatio="none">' + lines + '</svg>';
  if (path) {
    for (var s = 1; s < path.length; s++) {
      var id = path[s], o = WHEEL_OTC[id];
      if (!o) continue;
      h += '<div class="wheel-step' + (wheelIsFull(p, id) ? " done" : "") +
        '" style="left:calc(' + (o.x / WHEEL_SIZE * 100) + '% + 14px);top:calc(' +
        (o.y / WHEEL_SIZE * 100) + '% - 16px)">' + s + '</div>';
    }
  }
  return h;
}

function wheelStageOverlays(p) {
  var quads = [
    { color: "green", q: "TL" },
    { color: "red", q: "TR" },
    { color: "blue", q: "BL" },
    { color: "purple", q: "BR" },
  ];
  var h = "";
  for (var i = 0; i < quads.length; i++) {
    var st = typeof wheelStage === "function" ? wheelStage(p, quads[i].color) : 0;
    var front = Math.max(0, Math.min(3, st));
    h += '<img class="wheel-largebonus" src="assets/wheel/backdrop_skillwheel_largebonus_front' + front + '_' + quads[i].q + '.png?v=wheel-otc-v1" alt="">';
    if (st > 0) {
      h += '<img class="wheel-largebonus wheel-largebonus-light" src="assets/wheel/backdrop_skillwheel_largebonus_light_' + quads[i].q + '.png?v=wheel-otc-v1" alt="">';
    }
    var sockOn = typeof wheelVesselResonance === "function" && wheelVesselResonance(p, quads[i].color) > 0;
    var sockIdx = { green: 0, red: 1, blue: 2, purple: 3 }[quads[i].color];
    h += '<img class="wheel-socket-art ws-' + quads[i].color + '" src="assets/wheel/backdrop_skillwheel_largebonus_socket' +
      (sockOn ? "enabled" : "disabled") + "_" + sockIdx + '.png?v=wheel-otc-v1" alt="">';
  }
  return h;
}

function wheelNodeHtml(p, slotId) {
  var spec = WHEEL_SLOTS[slotId], voc = p.voc || "knight";
  var o = (typeof WHEEL_OTC !== "undefined") ? WHEEL_OTC[slotId] : null;
  if (!o) return "";
  var pts = wheelSlotPoints(p, slotId);
  var can = wheelCanAllocate(p, slotId);
  var full = pts >= spec.max;
  var sel = (typeof WHEEL_UI !== "undefined" && WHEEL_UI.sel === slotId);
  var ic = o.icons[voc] || o.icons.knight || [0, 0];
  var cls = "wheel-node w-" + spec.color + (full ? " full" : "") + (can || pts > 0 ? " can" : " locked") + (sel ? " sel" : "");
  var left = (o.x / WHEEL_SIZE * 100) + "%";
  var top = (o.y / WHEEL_SIZE * 100) + "%";
  return '<div class="' + cls + '" data-slot="' + slotId + '" title="' + wheelNodeTitle(spec, voc) +
    ' \u2014 ' + pts + '/' + spec.max + ' \u2014 ' + wheelSlotLabel(spec, voc) + '"' +
    ' style="left:' + left + ';top:' + top + '">' +
    '<span class="wn-med" style="background-position:' + (-ic[0] * 30) + 'px 0"></span>' +
    '<span class="wn-small" style="left:calc(50% + ' + o.sdx + 'px);top:calc(50% + ' + o.sdy + 'px);' +
      'background-position:' + (-ic[1] * 16) + 'px 0"></span>' +
    '</div>';
}

function wheelSummaryHtml(p) {
  var t = wheelTotals(p), voc = p.voc || "knight";
  var rows = [];
  if (t.hp) rows.push(["HP extra", "+" + t.hp]);
  if (t.mp) rows.push(["Mana extra", "+" + t.mp]);
  if (t.cap) rows.push(["Capacidade", "+" + t.cap]);
  if (t.mitigation > 0) rows.push(["Mitigacao", "+" + wheelPct(t.mitigation * 100)]);
  if (t.melee) rows.push(["Skill Melee", "+" + t.melee]);
  if (t.distance) rows.push(["Skill Distancia", "+" + t.distance]);
  if (t.magic) rows.push(["Magic Level", "+" + t.magic]);
  if (t.fist) rows.push(["Skill Punho", "+" + t.fist]);
  rows.push(["Life leech", "+" + wheelPct(t.lifeLeech)]);
  rows.push(["Mana leech", "+" + wheelPct(t.manaLeech)]);
  rows.push(["Dano (Revelation)", "+" + t.damagePct + "%"]);
  rows.push(["Cura (Revelation)", "+" + t.healPct + "%"]);
  if (t.gemMitigation) rows.push(["Gem mitigation", "+" + (Math.round(t.gemMitigation * 10) / 10) + "%"]);
  if (t.dodge) rows.push(["Dodge", "+" + (Math.round(t.dodge * 100) / 100) + "%"]);
  if (t.momentum) rows.push(["Momentum", "+" + (Math.round(t.momentum * 100) / 100)]);

  var h = '<div class="wheel-sections">' +
    '<div class="wheel-sec"><div class="wheel-sec-title">Bonus ativos</div><div class="wheel-stats">' +
    rows.map(function(r){return '<div class="stat-row"><span class="k">'+r[0]+'</span><span class="v" style="color:#9ce84a">'+r[1]+'</span></div>';}).join("") +
    '</div></div>';

  var upgrades = WHEEL_SPELL_UPGRADES[voc] || [];
  if (upgrades.length) {
    h += '<div class="wheel-sec"><div class="wheel-sec-title">Magias da Wheel</div>';
    for (var i = 0; i < upgrades.length; i++) {
      var u = upgrades[i], st = wheelSpellUpgrade(p, u.name);
      var nm = SPELLS[u.name] ? SPELLS[u.name].name : u.spell;
      h += '<div class="stat-row"><span class="k">' + nm + '</span>' +
        '<span class="v" style="color:' + (st && st.grade ? "#ffe680" : "#555") + '">' + (st && st.grade ? "G" + st.grade : "\u2014") + '</span></div>';
    }
    h += '</div>';
  }

  var colors = ["green", "red", "blue", "purple"];
  h += '<div class="wheel-sec"><div class="wheel-sec-title">Estagios (Revelation)</div>';
  for (var c = 0; c < colors.length; c++) {
    var col = colors[c], stg = wheelStage(p, col);
    var ab = t.stageAbilities[col] || null;
    h += '<div class="stat-row"><span class="k" style="color:' + wheelColorCss(col) + '">' + WHEEL_COLORS[col].nome + ' \u00b7 ' + wheelColorPoints(p, col) + ' pts</span>' +
      '<span class="v">' + (stg > 0 ? "Estagio " + stg + (ab ? " \u00b7 " + ab : "") : "\u2014") + '</span></div>';
  }
  h += '</div>';

  if (t.instants.length) {
    h += '<div class="wheel-sec"><div class="wheel-sec-title">Habilidades instantaneas</div>' +
      t.instants.map(function(n){return '<div class="stat-row"><span class="k">'+n+'</span><span class="v" style="color:#9ce84a">desbloqueada</span></div>';}).join("") + '</div>';
  }
  h += '</div>';
  return h;
}

function openWheelModal() {
  var p = G.p; if (!p) return;
  ensureWheel(p);
  var modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return;
  if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
  if (!WHEEL_UI.tab) WHEEL_UI.tab = "wheel";
  WHEEL_UI.summary = WHEEL_UI.summary || false;
  body.innerHTML = renderWheelModal(p);
  modal.classList.add("show", "wide");
  bindWheelModal();
}

/* Nome amigavel da fatia: prioriza o desbloqueio (magia/habilidade/leech/
 * skill); sem desbloqueio, nomeia pelo bonus por ponto. */
function wheelNodeTitle(spec, voc) {
  if (!spec) return "Fatia";
  if (spec.instant && spec.instant[voc]) return spec.instant[voc];
  if (spec.spell && spec.spell[voc]) {
    var sid = spec.spell[voc];
    return sid === "__focus__" ? "Focus Spells" : (typeof SPELLS !== "undefined" && SPELLS[sid] ? SPELLS[sid].name : sid);
  }
  if (spec.leech) return spec.leech === "life" ? "Life Leech" : "Mana Leech";
  if (spec.skill) {
    var sk = WHEEL_SKILL[voc];
    return "+" + (sk === "melee" ? "Melee" : sk === "distance" ? "Distance" : sk === "magic" ? "Magic Level" : "Fist");
  }
  var parts = [];
  if (spec.hp) parts.push("HP");
  if (spec.mana) parts.push("Mana");
  if (spec.cap) parts.push("Capacidade");
  if (spec.mit) parts.push("Mitigação");
  return parts.length ? "Perk de " + parts.join("/") : "Perk de Dedicação";
}

/* Painel "SELEÇÃO" (padrão Huntera): o que cada ponto da fatia dá e o que
 * ela desbloqueia ao completar, mais o progresso do quadrante para o
 * próximo estágio de Revelation. */
function wheelSelectionHtml(p, slotId) {
  var spec = WHEEL_SLOTS[slotId];
  if (!spec) return "";
  var voc = p.voc || "knight";
  var pts = wheelSlotPoints(p, slotId);
  var color = WHEEL_COLORS[spec.color] || { nome: spec.color };
  var css = wheelColorCss(spec.color) || "#888";

  var ded = [], acc = [];
  if (spec.hp) { ded.push("+" + WHEEL_HP[voc] + " HP por ponto"); acc.push("+" + WHEEL_HP[voc] * pts + " HP"); }
  if (spec.mana) { ded.push("+" + WHEEL_MP[voc] + " Mana por ponto"); acc.push("+" + WHEEL_MP[voc] * pts + " Mana"); }
  if (spec.cap) { ded.push("+" + WHEEL_CAP[voc] + " Cap por ponto"); acc.push("+" + WHEEL_CAP[voc] * pts + " Cap"); }
  if (spec.mit) { ded.push("+" + wheelPct(WHEEL_MIT_PER_POINT * 100) + " Mitigação por ponto"); acc.push("+" + wheelPct(WHEEL_MIT_PER_POINT * pts * 100) + " Mitigação"); }

  var conv = [];
  if (spec.skill) {
    var sk = WHEEL_SKILL[voc];
    conv.push("+1 " + (sk === "melee" ? "sword/axe/club" : sk === "distance" ? "distance" : sk === "magic" ? "magic level" : "fist"));
  }
  if (spec.leech) conv.push("+" + wheelPct(WHEEL_LEECH[spec.leech]) + " " + (spec.leech === "life" ? "Life Leech" : "Mana Leech"));
  if (spec.spell && spec.spell[voc]) {
    var sid = spec.spell[voc];
    conv.push("Desbloqueia " + (sid === "__focus__" ? "Focus Spells" : (typeof SPELLS !== "undefined" && SPELLS[sid] ? SPELLS[sid].name : sid)));
  }
  if (spec.instant && spec.instant[voc]) conv.push("Desbloqueia " + spec.instant[voc]);

  var cpts = wheelColorPoints(p, spec.color);
  var stage = wheelStage(p, spec.color);
  var nextThr = null;
  for (var ti = 0; ti < WHEEL_CONFIG.stageThresholds.length; ti++)
    if (cpts < WHEEL_CONFIG.stageThresholds[ti]) { nextThr = WHEEL_CONFIG.stageThresholds[ti]; break; }
  var ability = (WHEEL_STAGE_ABILITY[spec.color] || {})[voc];
  var revReward = stage > 0 ? WHEEL_CONFIG.revelation[stage - 1] : WHEEL_CONFIG.revelation[0];
  var nextReward = stage < 3 ? WHEEL_CONFIG.revelation[stage] : null;

  var h = '<div class="wheel-sel wsel-' + spec.color + '">' +
    '<div class="wheel-sec-title">Seleção</div>' +
    '<div class="wsel-name" style="color:' + css + '">' + wheelNodeTitle(spec, voc) + '</div>' +
    '<div class="tiny dim">' + color.nome + ' · máx ' + spec.max + ' pts</div>';
  if (ded.length) {
    h += '<div class="wsel-label">Perk de Dedicação</div>' +
      ded.map(function (d) { return '<div class="wsel-line">' + d + '</div>'; }).join("") +
      '<div class="tiny dim">' + pts + ' ponto' + (pts === 1 ? "" : "s") + ' colocado' + (pts === 1 ? "" : "s") +
      (pts > 0 && acc.length ? ' · <span style="color:#9ce84a">' + acc.join(", ") + '</span>' : "") + '</div>';
  }
  if (conv.length) {
    h += '<div class="wsel-label">Perk de Convicção</div>' +
      conv.map(function (d) { return '<div class="wsel-line" style="color:' + (pts >= spec.max ? "#9ce84a" : "#c8c0b0") + '">' + d + '</div>'; }).join("") +
      (pts >= spec.max
        ? '<div class="tiny" style="color:#9ce84a">Desbloqueado.</div>'
        : '<div class="tiny dim">Desbloqueado quando a fatia estiver cheia.</div>');
  }
  h += '<div class="wsel-label">Quadrante ' + color.nome + ' — Estágio ' + stage + '/3</div>' +
    '<div class="tiny dim">' + cpts + ' pts no quadrante' +
      (nextThr ? ' · faltam <b>' + (nextThr - cpts) + '</b> p/ o próximo estágio' : ' · completo') + '</div>';
  if (nextReward)
    h += '<div class="wsel-line">Próximo estágio: +' + nextReward.damage + '% dano e +' + nextReward.healing + '% cura' +
      (ability ? ' · <b>' + ability + '</b>' : '') + '</div>';
  else if (ability) h += '<div class="wsel-line" style="color:#9ce84a">' + ability + ' ativo · +' + revReward.damage + '% dano / +' + revReward.healing + '% cura</div>';
  h += '</div>';
  return h;
}

function renderWheelModal(p, opts) {
  opts = opts || {};
  var locked = p.level < WHEEL_CONFIG.minLevel;
  var avail = wheelAvail(p), spent = wheelSpent(p), total = wheelPoints(p);
  var tab = (typeof WHEEL_UI !== "undefined" && WHEEL_UI.tab) || "wheel";
  var showSummary = (typeof WHEEL_UI !== "undefined" && WHEEL_UI.summary) || false;

  var h = '<div class="wheel-window">' +
    '<div class="wheel-menu-tabs">' +
      '<button class="wheel-menu-tab ' + (tab==="wheel"?"active":"") + '" data-wtab="wheel">Wheel of Destiny</button>' +
      '<button class="wheel-menu-tab ' + (tab==="gem"?"active":"") + '" data-wtab="gem">Gem Atelier</button>' +
      '<button class="wheel-menu-tab ' + (tab==="frag"?"active":"") + '" data-wtab="frag">Fragments</button>' +
    '</div>';

  if (tab === "wheel") {
    h += '<div class="wheel-preset-bar">' +
      '<button class="wheel-preset-btn active">Info</button>' +
      '<button class="wheel-preset-btn">Presets</button>' +
      '<span class="wheel-preset-name">Predefinido</span></div>';

    var selId = (typeof WHEEL_UI !== "undefined") ? WHEEL_UI.sel : null;
    var selSpec = selId && WHEEL_SLOTS[selId] ? WHEEL_SLOTS[selId] : null;
    var selPts = selSpec ? wheelSlotPoints(p, selId) : 0;
    var canAdd = !!(selSpec && wheelCanAllocate(p, selId));
    var canSub = !!(selSpec && selPts > 0);
    var ctl = '<div class="wheel-ctl-col">' +
      '<button class="sm wheel-add-btn" id="wheel-add-sel" title="Adicionar +1 ponto na fatia selecionada"' +
        (canAdd ? '' : ' disabled') + '>' +
        (selSpec ? selPts + '/' + selSpec.max + ' +1' : '+1') + '</button>' +
      '<button class="sm wheel-sub-btn" id="wheel-sub-sel" title="Remover 1 ponto da fatia selecionada"' +
        (canSub ? '' : ' disabled') + '>\u22121</button>' +
      '<button class="sm wheel-max-btn" id="wheel-max-sel" title="Gastar todos os pontos disponíveis nesta fatia até o limite"' +
        (canAdd ? '' : ' disabled') + '>MAX</button>' +
      '</div>';

    h += '<div class="wheel-top-info">' +
      '<span class="wheel-avail">Available: ' + fmtFull(avail) + ' / ' + fmtFull(total) + ' (' + fmtFull(spent) + ' spent)</span>' +
      '<span style="flex:1"></span>' +
      ctl +
      '<button class="sm" id="wheel-reset" title="Remove todos os pontos da roda">Reset</button>' +
      '</div>';

    if (locked) h += '<div class="tiny" style="padding:4px 10px;color:#f87171">Locked until level <b>' + WHEEL_CONFIG.minLevel + '</b>. You are level ' + p.level + '.</div>';

    h += '<div class="wheel-body">' +
      '<div class="wheel-canvas-wrap"><div class="wheel-canvas-area">' +
        '<img class="wheel-stage-img" src="assets/wheel/backdrop_skillwheel.png?v=wheel-otc-v1" alt="" draggable="false">';
    for (var sid0 in WHEEL_SLOTS) h += wheelSliceHtml(p, sid0);
    h += '<img class="wheel-voc-img" src="' + wheelVocImage(p.voc) + '?v=wheel-otc-v1" alt="" draggable="false">' +
        wheelStageOverlays(p) +
        wheelFocusOverlays(p) +
        wheelPathsHtml(p);
    for (var id in WHEEL_SLOTS) h += wheelNodeHtml(p, id);
    h += '</div></div><div class="wheel-right">';
    if (typeof WHEEL_UI !== "undefined" && WHEEL_UI.sel && WHEEL_SLOTS[WHEEL_UI.sel])
      h += wheelSelectionHtml(p, WHEEL_UI.sel);
    if (showSummary) {
      h += wheelSummaryHtml(p);
      h += '<div class="wheel-summary-toggle"><button class="sm" data-wsummary="0">Hide summary</button></div>';
    } else {
      h += '<div class="wheel-summary-toggle"><button class="sm" data-wsummary="1">Show bonus summary</button></div>';
      h += '<div class="tiny dim" style="padding:10px;text-align:center">Select a slice to allocate points.</div>';
    }
    h += '</div></div>';
  } else if (tab === "gem") {
    h += renderGemAtelier(p);
  } else if (tab === "frag") {
    h += renderFragmentWorkshop(p);
  }

  if (typeof ensureWheelGems === "function") ensureWheelGems(p);
  h += '<div class="wheel-money-bar">' +
    '<span class="wheel-money-item">Gold: ' + fmtFull(p.gold) + '</span>' +
    '<span class="wheel-money-item" style="color:#66c7ff"><img src="assets/wheel/fragmentIcon.png" alt=""> Lesser: ' + fmtFull(p.wheel.lesserFrags || 0) + '</span>' +
    '<span class="wheel-money-item" style="color:#c084fc"><img src="assets/wheel/fragmentIcon.png" alt=""> Greater: ' + fmtFull(p.wheel.greaterFrags || 0) + '</span>' +
    '<span style="flex:1"></span>' +
    (opts.embedded ? '' :
    '<div class="wheel-actions-bar">' +
      '<button class="sm" id="wheel-close">Close</button>' +
    '</div>') + '</div>';

  h += '</div>';
  return h;
}

function wheelGemChip(gem) {
  if (!gem) return '<div class="wgc-empty">empty</div>';
  var q = gem.quality || "lesser";
  return '<div class="wgc-gem q-' + q + ' w-' + gem.affinity + '">' +
    '<span class="wgc-q">' + q.charAt(0).toUpperCase() + '</span></div>';
}

function wheelGemModsText(p, gem) {
  if (!gem) return "";
  if (!gem.revealed) return "Unrevealed " + gem.quality + " gem";
  var parts = [];
  if (gem.lesser) parts.push("L: " + wheelModLabel(gem.lesser, false) + (wheelEffectiveSlotGrade(p, gem, "lesser") < 0 ? " (locked)" : " G" + wheelGradeName(wheelEffectiveSlotGrade(p, gem, "lesser"))));
  if (gem.regular) parts.push("R: " + wheelModLabel(gem.regular, false) + (wheelEffectiveSlotGrade(p, gem, "regular") < 0 ? " (locked)" : " G" + wheelGradeName(wheelEffectiveSlotGrade(p, gem, "regular"))));
  if (gem.supreme) parts.push("S: " + wheelModLabel(gem.supreme, true) + (wheelEffectiveSlotGrade(p, gem, "supreme") < 0 ? " (locked)" : " G" + wheelGradeName(wheelEffectiveSlotGrade(p, gem, "supreme"))));
  return parts.join(" · ");
}

function renderGemAtelier(p) {
  ensureWheelGems(p);
  if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
  var selId = WHEEL_UI.gemId;
  var sel = wheelFindGem(p, selId);
  var h = '<div class="wheel-gem-panel">' +
    '<div class="wheel-sec-title">Gem Atelier</div>' +
    '<div class="tiny dim">Socket one revealed gem per colour vessel. Resonance 1/2/3 (maxed vessel nodes) unlocks lesser / regular / supreme mods. Reveal, switch domain, or dismantle for fragments.</div>' +
    '<div class="wheel-gem-grid">';
  WHEEL_GEM_AFFINITIES.forEach(function(c){
    var gid = p.wheel.sockets[c];
    var g = wheelFindGem(p, gid);
    var res = wheelVesselResonance(p, c);
    h += '<div class="wheel-gem-card' + (g ? " equipped" : "") + '" data-vessel="' + c + '">' +
      '<div class="wgc-icon" style="background:' + wheelColorCss(c) + '">' + wheelGemChip(g) + '</div>' +
      '<div class="wgc-name">' + WHEEL_COLORS[c].nome + ' · resonance ' + res + '/3</div>' +
      (g ? '<div class="tiny">' + wheelGemModsText(p, g) + '</div>' : '<div class="tiny dim">no gem</div>') +
      (g ? '<button class="sm" data-unsocket="' + c + '">Remove</button>' : '') +
      '</div>';
  });
  h += '</div>';

  h += '<div class="wheel-sec" style="margin-top:8px"><div class="wheel-sec-title">Buy unrevealed gem</div><div class="wheel-buy-gems">';
  WHEEL_GEM_QUALITIES.forEach(function(q, qi){
    h += '<div class="wheel-buy-row"><span class="k">' + q + '</span>';
    WHEEL_GEM_AFFINITIES.forEach(function(c){
      h += '<button class="sm" data-buy-gem="' + q + '" data-aff="' + c + '" style="border-color:' + wheelColorCss(c) + '">' +
        WHEEL_COLORS[c].nome.charAt(0) + ' · ' + fmtFull(WHEEL_GEM_BUY_PRICE[qi]) + '</button>';
    });
    h += '</div>';
  });
  h += '</div></div>';

  h += '<div class="wheel-sec"><div class="wheel-sec-title">Inventory (' + p.wheel.gems.length + '/' + WHEEL_GEM_MAX + ')</div><div class="wheel-gem-inv">';
  if (!p.wheel.gems.length) h += '<div class="tiny dim">No gems yet.</div>';
  p.wheel.gems.forEach(function(g){
    var active = sel && sel.id === g.id ? " active" : "";
    var sock = wheelGemSocketedColor(p, g.id);
    h += '<div class="wheel-gem-inv-item' + active + '" data-sel-gem="' + g.id + '">' +
      wheelGemChip(g) +
      '<div class="wgi-body"><div class="wgi-title">' + (g.revealed ? "Revealed" : "Unrevealed") + " " + g.quality + " · " + WHEEL_COLORS[g.affinity].nome +
      (sock ? " · socketed" : "") + '</div>' +
      '<div class="tiny dim">' + wheelGemModsText(p, g) + '</div></div></div>';
  });
  h += '</div></div>';

  if (sel) {
    var qi = wheelGemQualityIndex(sel.quality);
    h += '<div class="wheel-sec"><div class="wheel-sec-title">Selected gem #' + sel.id + '</div><div class="wheel-gem-actions">';
    if (!sel.revealed) {
      h += '<button class="sm" data-reveal-gem="' + sel.id + '">Reveal · ' + fmtFull(WHEEL_GEM_REVEAL_PRICE[qi]) + ' gp</button>';
    } else {
      WHEEL_GEM_AFFINITIES.forEach(function(c){
        if (c === sel.affinity) h += '<button class="sm" data-socket-gem="' + sel.id + '" data-aff="' + c + '">Socket ' + WHEEL_COLORS[c].nome + '</button>';
        else h += '<button class="sm" data-switch-gem="' + sel.id + '" data-aff="' + c + '">Switch ' + WHEEL_COLORS[c].nome + ' · ' + fmtFull(WHEEL_GEM_SWITCH_PRICE[qi]) + '</button>';
      });
    }
    h += '<button class="sm danger" data-destroy-gem="' + sel.id + '">Dismantle for fragments</button></div></div>';
  }
  h += '</div>';
  return h;
}

function renderFragmentWorkshop(p) {
  ensureWheelGems(p);
  if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
  var voc = p.voc || "knight";
  var h = '<div class="wheel-frag-panel">' +
    '<div class="wheel-sec-title">Fragment Workshop</div>' +
    '<div class="tiny dim">Upgrade a modifier globally (all gems). Grade IV = +50% over Grade I and +1 wheel point. Later gem slots cannot exceed previous slot grade. Cooldown augments add Momentum instead of extra CD.</div>' +
    '<div class="wheel-buy-row" style="margin:8px 0">' +
      '<button class="sm" data-buy-frag="lesser">Buy 1 Lesser · ' + fmtFull(WHEEL_FRAG_BUY.lesser) + ' gp</button>' +
      '<button class="sm" data-buy-frag="greater">Buy 1 Greater · ' + fmtFull(WHEEL_FRAG_BUY.greater) + ' gp</button>' +
    '</div>';

  function rows(keys, supreme) {
    var html = "";
    keys.forEach(function(k){
      var g = wheelModGrade(p, k, supreme);
      var cost = g >= 3 ? null : (supreme ? WHEEL_GEM_UPGRADE.supreme : WHEEL_GEM_UPGRADE.basic)[g];
      html += '<div class="wheel-frag-row">' +
        '<img class="wfr-icon" src="assets/wheel/icon-modgrade' + (g + 1) + '.png" alt="">' +
        '<div class="wfr-name">' + wheelModLabel(k, supreme) + '</div>' +
        '<div class="wfr-cost">Grade ' + wheelGradeName(g) + '</div>' +
        (cost
          ? '<button class="sm" data-up-mod="' + k + '" data-supreme="' + (supreme ? "1" : "0") + '">Enhance · ' + cost.frag + ' frag + ' + fmtFull(cost.gold) + '</button>'
          : '<span class="tiny" style="color:#9ce84a">MAX</span>') +
        '</div>';
    });
    return html;
  }

  h += '<div class="wheel-sec"><div class="wheel-sec-title">Basic mods</div><div class="wheel-frag-list">' +
    rows(wheelBasicKeys(), false) + '</div></div>';
  h += '<div class="wheel-sec"><div class="wheel-sec-title">Supreme mods (' + voc + ')</div><div class="wheel-frag-list">' +
    rows(wheelSupremeKeysFor(voc), true) + '</div></div></div>';
  return h;
}

/* Escala o canvas 522x522 (transform) para ocupar o espaco livre do
 * container — reduz em telas apertadas e amplia (ate 1.45x) quando ha
 * folga, mantendo a composicao do cliente intacta em qualquer tamanho. */
function wheelFitCanvas(root) {
  var wrap = root && root.querySelector ? root.querySelector(".wheel-canvas-wrap") : null;
  if (!wrap) return;
  var cv = wrap.querySelector(".wheel-canvas-area");
  if (!cv) return;
  var host = wrap.parentElement; // .wheel-body
  var embedded = !!(root.closest && root.closest(".chard-wheel-embed")) ||
    (wrap.closest && wrap.closest(".chard-wheel-embed"));
  var cs = host && typeof getComputedStyle === "function" ? getComputedStyle(host) : null;
  var padX = cs ? (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) || 0 : 0;
  var padY = cs ? (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) || 0 : 0;
  var gapX = cs ? (parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0) : 0;
  // so desconta o painel direito quando ele esta lado a lado (mesma linha)
  var rightW = 0;
  var rp = host && host.querySelector ? host.querySelector(".wheel-right") : null;
  if (rp && Math.abs(rp.offsetTop - wrap.offsetTop) < 10) rightW = rp.offsetWidth + gapX;
  var availW = host && host.clientWidth > 0 ? host.clientWidth - padX - rightW : 0;
  var availH = 0;
  if (embedded) {
    availH = host && host.clientHeight > 0 ? host.clientHeight - padY : 0;
  } else {
    availH = Math.max(0, (window.innerHeight || 900) - 300);
  }
  var s;
  if (embedded) {
    // embutida: a roda e dimensionada pela largura livre; a altura do wrap
    // e clipada no espaco livre -> o scroll aparece so na area da roda e o
    // painel de informacoes permanece fixo
    s = availW > 0 ? availW / 522 : 1;
    s = Math.max(0.45, Math.min(1.6, s));
  } else {
    s = 99;
    if (availW > 0) s = Math.min(s, availW / 522);
    if (availH > 0) s = Math.min(s, availH / 522);
    if (s === 99) s = 1;
    s = Math.max(0.45, Math.min(1.25, s));
  }
  wrap.style.width = Math.round(522 * s) + "px";
  var scaledH = Math.round(522 * s);
  wrap.style.height = (embedded && availH > 0
    ? Math.min(scaledH, availH) : scaledH) + "px";
  cv.style.transform = "scale(" + s + ")";
}

function bindWheel(root, rerender) {
  var body = root || $("#modal-body"); if (!body) return;
  rerender = rerender || openWheelModal;
  wheelFitCanvas(body);
  if (typeof window !== "undefined" && !window._wheelFitBound) {
    window._wheelFitBound = true;
    window.addEventListener("resize", function () {
      var c = document.querySelector(".chard-wheel-embed .wheel-canvas-wrap, #modal-body .wheel-canvas-wrap");
      if (c) wheelFitCanvas(c.parentElement && c.parentElement.parentElement || c);
    });
  }
  body.querySelectorAll("[data-wtab]").forEach(function(el){
    el.addEventListener("click", function(){
      if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
      WHEEL_UI.tab = el.dataset.wtab; rerender();
    });
  });
  body.querySelectorAll("[data-wsummary]").forEach(function(el){
    el.addEventListener("click", function(){
      if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
      WHEEL_UI.summary = el.dataset.wsummary === "1"; rerender();
    });
  });
  var close = $("#wheel-close");
  if (close) close.addEventListener("click", function(){ $("#modal").classList.remove("show","wide"); });
  var addSelBtn = body.querySelector("#wheel-add-sel");
  if (addSelBtn) addSelBtn.addEventListener("click", function(){
    if (typeof WHEEL_UI === "undefined" || !WHEEL_UI.sel) { toast("Selecione uma fatia da roda."); return; }
    if (wheelAllocate(G.p, WHEEL_UI.sel)) save();
    rerender();
  });
  var subSelBtn = body.querySelector("#wheel-sub-sel");
  if (subSelBtn) subSelBtn.addEventListener("click", function(){
    if (typeof WHEEL_UI === "undefined" || !WHEEL_UI.sel) { toast("Selecione uma fatia da roda."); return; }
    if (wheelRemove(G.p, WHEEL_UI.sel)) save();
    else toast("Remoção bloqueada: quebraria o caminho de fatias dependentes.");
    rerender();
  });
  var maxSelBtn = body.querySelector("#wheel-max-sel");
  if (maxSelBtn) maxSelBtn.addEventListener("click", function(){
    if (typeof WHEEL_UI === "undefined" || !WHEEL_UI.sel) { toast("Selecione uma fatia da roda."); return; }
    var n = 0;
    while (wheelAllocate(G.p, WHEEL_UI.sel)) n++;
    if (n > 0) { save(); toast("+" + n + " ponto" + (n === 1 ? "" : "s") + " na fatia."); }
    rerender();
  });
  var resetBtn = body.querySelector("#wheel-reset");
  if (resetBtn) resetBtn.addEventListener("click", function(){
    var p = G.p;
    if (!p || !p.wheel || !p.wheel.slots) { toast("A roda já está vazia."); return; }
    if (!Object.keys(p.wheel.slots).some(function(id){ return (p.wheel.slots[id] || 0) > 0; })) {
      toast("A roda já está vazia."); return;
    }
    p.wheel.slots = {};
    save();
    toast("Pontos da roda removidos — disponíveis para realocar.");
    if (typeof WHEEL_UI !== "undefined") WHEEL_UI.sel = null;
    rerender();
  });
  body.querySelectorAll("[data-slot]").forEach(function(el){
    var slotId = el.dataset.slot;
    var o = (typeof WHEEL_OTC !== "undefined") ? WHEEL_OTC[slotId] : null;
    el.addEventListener("mouseenter", function(){
      var f = body.querySelector(".wheel-slice-focus");
      if (f && o) { f.src = "assets/wheel/wheel-colors/" + o.focus + ".png?v=wheel-otc-v1"; f.style.display = "block"; }
    });
    el.addEventListener("mouseleave", function(){
      var f = body.querySelector(".wheel-slice-focus");
      if (f) f.style.display = "none";
    });
    el.addEventListener("click", function(){
      if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
      WHEEL_UI.sel = slotId;
      if (wheelAllocate(G.p, slotId)) save();
      rerender();
    });
    el.addEventListener("contextmenu", function(e){
      e.preventDefault();
      if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
      WHEEL_UI.sel = slotId;
      if (wheelRemove(G.p, slotId)) save();
      rerender();
    });
  });

  function gemToast(res, okMsg) {
    if (!res || !res.ok) { toast((res && res.err) || "Failed."); return; }
    toast(okMsg); save(); rerender();
  }
  body.querySelectorAll("[data-sel-gem]").forEach(function(el){
    el.addEventListener("click", function(){
      if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
      WHEEL_UI.gemId = parseInt(el.dataset.selGem, 10); rerender();
    });
  });
  body.querySelectorAll("[data-buy-gem]").forEach(function(el){
    el.addEventListener("click", function(){
      gemToast(wheelBuyGem(G.p, el.dataset.buyGem, el.dataset.aff), "Bought unrevealed gem.");
    });
  });
  body.querySelectorAll("[data-reveal-gem]").forEach(function(el){
    el.addEventListener("click", function(){
      gemToast(wheelRevealGem(G.p, parseInt(el.dataset.revealGem, 10)), "Gem revealed.");
    });
  });
  body.querySelectorAll("[data-socket-gem]").forEach(function(el){
    el.addEventListener("click", function(){
      gemToast(wheelSocketGem(G.p, parseInt(el.dataset.socketGem, 10), el.dataset.aff), "Gem socketed.");
    });
  });
  body.querySelectorAll("[data-switch-gem]").forEach(function(el){
    el.addEventListener("click", function(){
      var id = parseInt(el.dataset.switchGem, 10);
      var r = wheelSwitchGemDomain(G.p, id, el.dataset.aff);
      if (!r.ok) { toast(r.err); return; }
      gemToast(wheelSocketGem(G.p, id, el.dataset.aff), "Domain switched and socketed.");
    });
  });
  body.querySelectorAll("[data-unsocket]").forEach(function(el){
    el.addEventListener("click", function(){
      gemToast(wheelUnsocketGem(G.p, el.dataset.unsocket), "Vessel emptied.");
    });
  });
  body.querySelectorAll("[data-destroy-gem]").forEach(function(el){
    el.addEventListener("click", function(){
      var r = wheelDestroyGem(G.p, parseInt(el.dataset.destroyGem, 10));
      if (!r.ok) { toast(r.err); return; }
      if (typeof WHEEL_UI !== "undefined") WHEEL_UI.gemId = null;
      toast("Dismantled: +" + r.amount + " " + r.kind + " fragments."); save(); rerender();
    });
  });
  body.querySelectorAll("[data-buy-frag]").forEach(function(el){
    el.addEventListener("click", function(){
      gemToast(wheelBuyFragments(G.p, el.dataset.buyFrag, 1), "Bought fragment.");
    });
  });
  body.querySelectorAll("[data-up-mod]").forEach(function(el){
    el.addEventListener("click", function(){
      var r = wheelUpgradeMod(G.p, el.dataset.upMod, el.dataset.supreme === "1");
      gemToast(r, r && r.ok ? "Enhanced to Grade " + wheelGradeName(r.grade) + "." : "");
    });
  });
}

function bindWheelModal() {
  bindWheel($("#modal-body"), openWheelModal);
}
