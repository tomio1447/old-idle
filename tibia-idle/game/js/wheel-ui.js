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

function wheelBackgroundImg(voc) {
  var map = { knight: "knight", paladin: "paladin", sorcerer: "sorcerer",
              druid: "druid", monk: "monk" };
  return "assets/wheel/vocations/backdrop_skillwheel_" + (map[voc] || "knight") + ".png";
}

function wheelSvgConnections() {
  var lines = [], seen = {};
  for (var id in WHEEL_CONNECTED) {
    var p = WHEEL_POS[id], conn = WHEEL_CONNECTED[id];
    for (var i = 0; i < conn.length; i++) {
      var c = conn[i], key = [id, c].sort().join("|");
      if (seen[key]) continue; seen[key] = 1;
      var q = WHEEL_POS[c];
      lines.push('<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '" />');
    }
  }
  return '<svg class="wheel-svg-links" viewBox="0 0 522 522" preserveAspectRatio="none">' + lines.join("") + '</svg>';
}

function wheelSlotLabel(spec, voc) {
  var parts = [];
  if (spec.hp) parts.push("+" + WHEEL_HP[voc] + " HP/pt");
  if (spec.mana) parts.push("+" + WHEEL_MP[voc] + " Mana/pt");
  if (spec.cap) parts.push("+" + WHEEL_CAP[voc] + " Cap/pt");
  if (spec.mit) parts.push("+3% Mitig/pt");
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

/* As fatias (wheel-colors e border) sao mascaras BRANCAS 522x522 do client —
 * a cor vem de uma camada CSS colorida recortada pelo mask-image. */
var WHEEL_QUAD_FILES = { top_left: "TopLeft", top_right: "TopRight",
  bottom_left: "BottonLeft", bottom_right: "BottonRight" };

function wheelSliceHtml(p, slotId) {
  var spec = WHEEL_SLOTS[slotId];
  if (!spec || !spec.border) return "";
  var dir = spec.border[0], n = spec.border[1];
  var pts = wheelSlotPoints(p, slotId);
  var prog = spec.max > 0 ? Math.min(1, pts / spec.max) : 0;
  var can = wheelCanAllocate(p, slotId);
  var fillUrl = "assets/wheel/wheel-colors/" + dir + "/" +
    (WHEEL_QUAD_FILES[dir] || dir) + "_" + n + ".png?v=wheel-otc-v1";
  var bordUrl = "assets/wheel/border/" + dir + "/" + n + ".png?v=wheel-otc-v1";
  var mask = "-webkit-mask-image:url('" + fillUrl + "');mask-image:url('" + fillUrl + "');";
  var bmask = "-webkit-mask-image:url('" + bordUrl + "');mask-image:url('" + bordUrl + "');";
  return '<div class="wheel-slice-fill w-' + spec.color + '" data-slice="' + slotId + '"' +
    ' style="' + mask + 'opacity:' + (0.22 + 0.78 * prog).toFixed(2) + '"></div>' +
    '<div class="wheel-slice-border' + (can || pts > 0 ? "" : " locked") + '" style="' + bmask + '"></div>';
}

/* Icone do no: magia real (otc), arma para +skill, smallperks para stats. */
function wheelNodeIconHtml(spec, voc) {
  if (spec.spell && spec.spell[voc]) {
    var sid = spec.spell[voc];
    if (sid !== "__focus__") {
      var s = (typeof SPELLS !== "undefined") ? SPELLS[sid] : null;
      var p = s && (typeof spellIconPath === "function") ? spellIconPath(s) : null;
      if (p) return '<img class="wn-icon" src="' + p + '" alt="" draggable="false">';
    }
    return '<span class="wn-glyph">\u2726</span>';
  }
  if (spec.instant && spec.instant[voc]) return '<span class="wn-glyph">\u2605</span>';
  if (spec.skill) {
    var item = { melee: "sword", distance: "bow", magic: "wand-of-might",
      fist: "fists-of-enlightenment" }[WHEEL_SKILL[voc]] || "sword";
    return '<img class="wn-icon" src="assets/item/' + item + '.png" alt="" draggable="false">';
  }
  var cell = -1;
  if (spec.leech) cell = spec.leech === "life" ? 11 : 12;
  else if (spec.hp && spec.mana) cell = 2;
  else if (spec.hp) cell = 0;
  else if (spec.mana) cell = 1;
  else if (spec.cap) cell = 3;
  else if (spec.mit) cell = 5;
  if (cell >= 0)
    return '<span class="wn-icon wn-small" style="background-position:' + (-cell * 22) + 'px 0"></span>';
  return '<span class="wn-glyph">+</span>';
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
  var pts = wheelSlotPoints(p, slotId);
  var can = wheelCanAllocate(p, slotId);
  var full = pts >= spec.max;
  var pos = WHEEL_POS[slotId];
  var sel = (typeof WHEEL_UI !== "undefined" && WHEEL_UI.sel === slotId);
  var cls = "wheel-node w-" + spec.color + (full ? " full" : "") + (can ? " can" : " locked") + (sel ? " sel" : "");
  var left = (pos[0] / WHEEL_SIZE * 100) + "%";
  var top = (pos[1] / WHEEL_SIZE * 100) + "%";
  return '<div class="' + cls + '" data-slot="' + slotId + '" title="' + slotId + ' \u2014 ' + wheelSlotLabel(spec, voc) + '"' +
    ' style="left:' + left + ';top:' + top + '">' +
    '<span class="wn-iconbox">' + wheelNodeIconHtml(spec, voc) + '</span>' +
    '<span class="wn-pts">' + pts + '/' + spec.max + '</span>' +
    '</div>';
}

function wheelSummaryHtml(p) {
  var t = wheelTotals(p), voc = p.voc || "knight";
  var rows = [];
  if (t.hp) rows.push(["HP extra", "+" + t.hp]);
  if (t.mp) rows.push(["Mana extra", "+" + t.mp]);
  if (t.cap) rows.push(["Capacidade", "+" + t.cap]);
  if (t.mitigation > 0) rows.push(["Mitigacao", "+" + Math.round(t.mitigation * 100) + "%"]);
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

function wheelScrollPrice(scroll) {
  return Math.floor(5000 * Math.pow(2, WHEEL_CONFIG.scrolls.indexOf(scroll)));
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
  if (spec.mit) { ded.push("+3% Mitigação por ponto"); acc.push("+" + (Math.round(WHEEL_MIT_PER_POINT * pts * 1000) / 10) + "% Mitigação"); }

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
    '<div class="tiny dim">Clique: +1 ponto · Botão direito: −1 ponto</div>' +
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

    h += '<div class="wheel-top-info">' +
      '<span class="wheel-avail">Available: ' + fmtFull(avail) + ' / ' + fmtFull(total) + ' (' + fmtFull(spent) + ' spent)</span>' +
      '<div class="wheel-legend">' +
        '<span><i class="wl-dot" style="background:#4ade80"></i>Green</span>' +
        '<span><i class="wl-dot" style="background:#f87171"></i>Red</span>' +
        '<span><i class="wl-dot" style="background:#60a5fa"></i>Blue</span>' +
        '<span><i class="wl-dot" style="background:#c084fc"></i>Purple</span>' +
      '</div>' +
      '<span class="tiny dim" style="margin-left:auto">Click=+1pt | RightClick=-1pt</span>' +
      '<button class="sm" id="wheel-reset" title="Remove todos os pontos da roda">Reset</button>' +
      '</div>';

    if (locked) h += '<div class="tiny" style="padding:4px 10px;color:#f87171">Locked until level <b>' + WHEEL_CONFIG.minLevel + '</b>. You are level ' + p.level + '.</div>';

    h += '<div class="wheel-body">' +
      '<div class="wheel-canvas-area">' +
        '<img class="wheel-stage-img" src="' + wheelBackgroundImg(p.voc) + '?v=wheel-otc-v1" alt="">';
    for (var sid0 in WHEEL_SLOTS) h += wheelSliceHtml(p, sid0);
    h += wheelStageOverlays(p) +
        wheelSvgConnections();
    for (var id in WHEEL_SLOTS) h += wheelNodeHtml(p, id);
    h += '</div><div class="wheel-right">';
    if (typeof WHEEL_UI !== "undefined" && WHEEL_UI.sel && WHEEL_SLOTS[WHEEL_UI.sel])
      h += wheelSelectionHtml(p, WHEEL_UI.sel);
    if (showSummary) {
      h += wheelSummaryHtml(p);
      h += '<div class="wheel-summary-toggle"><button class="sm" data-wsummary="0">Hide summary</button></div>';
    } else {
      h += '<div class="wheel-summary-toggle"><button class="sm" data-wsummary="1">Show bonus summary</button></div>';
      h += '<div class="tiny dim" style="padding:10px;text-align:center">Click nodes to allocate points.<br>Green=available | Dim=locked | Full=completed</div>';
    }
    h += renderScrollSection(p);
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

function renderScrollSection(p) {
  var h = '<div class="wheel-sec" style="margin-top:8px"><div class="wheel-sec-title">Promotion Scrolls</div>';
  for (var i = 0; i < WHEEL_CONFIG.scrolls.length; i++) {
    var sc = WHEEL_CONFIG.scrolls[i], done = !!p.wheel.scrolls[sc.id];
    var price = wheelScrollPrice(sc);
    h += '<div class="stat-row"><span class="k">' + sc.item + '</span>' +
      '<span class="v">' + (done
        ? '<span style="color:#9ce84a">deciphered</span>'
        : '<button class="sm" data-buy-scroll="' + sc.id + '">+ ' + sc.pontos + ' pts \u00b7 ' + fmtFull(price) + ' gp</button>') +
      '</span></div>';
  }
  h += '<div class="tiny dim mt4">Scrolls grant extra permanent points (level 51+).</div></div>';
  return h;
}

function bindWheel(root, rerender) {
  var body = root || $("#modal-body"); if (!body) return;
  rerender = rerender || openWheelModal;
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
  body.querySelectorAll("[data-buy-scroll]").forEach(function(el){
    el.addEventListener("click", function(){
      var id = parseInt(el.dataset.buyScroll, 10);
      var sc = WHEEL_CONFIG.scrolls.filter(function(x){return x.id===id;})[0];
      if (!sc || G.p.wheel.scrolls[id]) return;
      var price = wheelScrollPrice(sc);
      if (G.p.level < 51) { toast("Level 51+ required."); return; }
      if (!spendGold(G.p, price)) { toast("Not enough gold."); return; }
      G.p.wheel.scrolls[id] = 1;
      toast("Deciphered <b>" + sc.item + "</b>: +" + sc.pontos + " points!"); save(); rerender();
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
