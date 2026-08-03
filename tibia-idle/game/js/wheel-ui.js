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

function wheelNodeHtml(p, slotId) {
  var spec = WHEEL_SLOTS[slotId], voc = p.voc || "knight";
  var pts = wheelSlotPoints(p, slotId);
  var can = wheelCanAllocate(p, slotId);
  var full = pts >= spec.max;
  var pos = WHEEL_POS[slotId];
  var cls = "wheel-node w-" + spec.color + (full ? " full" : "") + (can ? " can" : " locked");
  var left = (pos[0] / WHEEL_SIZE * 100) + "%";
  var top = (pos[1] / WHEEL_SIZE * 100) + "%";
  return '<div class="' + cls + '" data-slot="' + slotId + '" title="' + slotId + ' \u2014 ' + wheelSlotLabel(spec, voc) + '"' +
    ' style="left:' + left + ';top:' + top + ';">' +
    '<span class="wn-pts">' + pts + '/' + spec.max + '</span>' +
    (full ? '<span class="wn-max">\u2726</span>' : '') +
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

function renderWheelModal(p) {
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
      '</div>';

    if (locked) h += '<div class="tiny" style="padding:4px 10px;color:#f87171">Locked until level <b>' + WHEEL_CONFIG.minLevel + '</b>. You are level ' + p.level + '.</div>';

    h += '<div class="wheel-body">' +
      '<div class="wheel-canvas-area">' +
        '<img class="wheel-stage-img" src="' + wheelBackgroundImg(p.voc) + '?v=1" alt="">' +
        wheelSvgConnections();
    for (var id in WHEEL_SLOTS) h += wheelNodeHtml(p, id);
    h += '</div><div class="wheel-right">';
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
    h += '<div class="wheel-gem-panel">' +
      '<div class="wheel-sec-title">Gem Atelier (WIP)</div>' +
      '<div class="tiny dim">Manage gems socketed into the 4 vessels. Each wheel color has a vessel for one gem granting extra bonuses.</div>' +
      '<div class="wheel-gem-grid" style="margin-top:10px">';
    ["green","red","blue","purple"].forEach(function(c){
      h += '<div class="wheel-gem-card"><div class="wgc-icon" style="width:32px;height:32px;border-radius:50%;margin:0 auto 3px;background:'+wheelColorCss(c)+';opacity:.4"></div><div class="wgc-name">' + WHEEL_COLORS[c].nome + ' Vessel</div></div>';
    });
    h += '</div></div>';
  } else if (tab === "frag") {
    h += '<div class="wheel-frag-panel">' +
      '<div class="wheel-sec-title">Fragment Workshop</div>' +
      '<div class="tiny dim">Lesser & Greater Fragments are used to create and upgrade gems. Obtained from bosses and events.</div>' +
      '<div class="wheel-frag-list" style="margin-top:8px">' +
        '<div class="wheel-frag-row"><div class="wfr-icon" style="text-align:center;font-size:18px">+</div><div class="wfr-name">Lesser Fragment</div><div class="wfr-cost">100 = 1 Greater</div></div>' +
        '<div class="wheel-frag-row"><div class="wfr-icon" style="text-align:center;font-size:18px">*</div><div class="wfr-name">Greater Fragment</div><div class="wfr-cost">10 = 1 Gem</div></div>' +
      '</div></div>';
  }

  h += '<div class="wheel-money-bar">' +
    '<span class="wheel-money-item">Gold: ' + fmtFull(p.gold) + '</span>' +
    '<span class="wheel-money-item" style="color:#66c7ff">Lesser: 0</span>' +
    '<span class="wheel-money-item" style="color:#c084fc">Greater: 0</span>' +
    '<span style="flex:1"></span>' +
    '<span class="tiny dim">Press Apply to save changes</span>' +
    '<div class="wheel-actions-bar">' +
      '<button class="sm" id="wheel-close">Close</button>' +
    '</div></div>';

  h += '</div>';
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

function bindWheelModal() {
  var body = $("#modal-body"); if (!body) return;
  body.querySelectorAll("[data-wtab]").forEach(function(el){
    el.addEventListener("click", function(){
      if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
      WHEEL_UI.tab = el.dataset.wtab; openWheelModal();
    });
  });
  body.querySelectorAll("[data-wsummary]").forEach(function(el){
    el.addEventListener("click", function(){
      if (typeof WHEEL_UI === "undefined") window.WHEEL_UI = {};
      WHEEL_UI.summary = el.dataset.wsummary === "1"; openWheelModal();
    });
  });
  var close = $("#wheel-close");
  if (close) close.addEventListener("click", function(){ $("#modal").classList.remove("show","wide"); });
  body.querySelectorAll("[data-slot]").forEach(function(el){
    var slotId = el.dataset.slot;
    el.addEventListener("click", function(){
      if (wheelAllocate(G.p, slotId)) { save(); openWheelModal(); }
    });
    el.addEventListener("contextmenu", function(e){
      e.preventDefault();
      if (wheelRemove(G.p, slotId)) { save(); openWheelModal(); }
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
      toast("Deciphered <b>" + sc.item + "</b>: +" + sc.pontos + " points!"); save(); openWheelModal();
    });
  });
}
