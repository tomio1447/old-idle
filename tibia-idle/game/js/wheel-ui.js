/* =========================================================================
 * wheel-ui.js — interface visual da Wheel of Destiny
 *
 * Desenha a roda real do Tibia: usa o fundo oficial (backdrop_skillwheel.png),
 * as linhas de conexao entre nos (SVG baseado nas conexoes do cliente) e os
 * 36 nos posicionados nas coordenadas exatas do otclient (buttons.lua).
 * ========================================================================= */
"use strict";

var WHEEL_SIZE = 522;          // canvas da roda (coincide com o backdrop)

/* Cor CSS por quadrante. */
function wheelColorCss(c) {
  return { green: "#4ade80", red: "#f87171", blue: "#60a5fa", purple: "#c084fc" }[c];
}

/* Fundo da wheel por vocacao (assets/wheel/vocations/backdrop_skillwheel_<voc>.png).
 * Mapeamento do otclient (wheelclass.lua): knight/paladin/sorcerer/druid/monk. */
function wheelBackgroundImg(voc) {
  var map = { knight: "knight", paladin: "paladin", sorcerer: "sorcerer",
              druid: "druid", monk: "monk" };
  var v = map[voc] || "knight";
  return "assets/wheel/vocations/backdrop_skillwheel_" + v + ".png";
}
function wheelSvgConnections() {
  var lines = [], seen = {};
  for (var id in WHEEL_CONNECTED) {
    var p = WHEEL_POS[id];
    var conn = WHEEL_CONNECTED[id];
    for (var i = 0; i < conn.length; i++) {
      var c = conn[i];
      var key = [id, c].sort().join("|");
      if (seen[key]) continue;
      seen[key] = 1;
      var q = WHEEL_POS[c];
      lines.push('<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '" />');
    }
  }
  return '<svg class="wheel-links" viewBox="0 0 522 522" preserveAspectRatio="none">' + lines.join("") + '</svg>';
}

/* Descricao curta do bonus de um no para a vocacao. */
function wheelSlotLabel(spec, voc) {
  var parts = [];
  if (spec.hp) parts.push("+" + WHEEL_HP[voc] + " HP/pt");
  if (spec.mana) parts.push("+" + WHEEL_MP[voc] + " Mana/pt");
  if (spec.cap) parts.push("+" + WHEEL_CAP[voc] + " Cap/pt");
  if (spec.mit) parts.push("+3% Mitig/pt");
  // leech: o valor ja e a porcentagem real (0.75 = 0.75%, 0.25 = 0.25%)
  if (spec.leech) parts.push("+" + wheelPct(WHEEL_LEECH[spec.leech]) + " " +
    (spec.leech === "life" ? "Life" : "Mana") + " leech (max)");
  if (spec.skill) parts.push("+" + (WHEEL_SKILL[voc] === "distance" ? "Dist" : WHEEL_SKILL[voc]) + " (max)");
  if (spec.spell) {
    var sid = spec.spell[voc];
    var nm = sid === "__focus__" ? "Focus Spells" : (SPELLS[sid] ? SPELLS[sid].name : sid);
    parts.push(nm + " (max)");
  }
  if (spec.instant && spec.instant[voc]) parts.push(spec.instant[voc] + " (max)");
  return parts.join(" · ");
}

/* Formata um valor de porcentagem que ja vem em % (0.75 -> "0,75%"). */
function wheelPct(v) {
  var n = Math.round(v * 100) / 100;
  return String(n).replace(".", ",") + "%";
}

/* HTML de um no interativo da roda. */
function wheelNodeHtml(p, slotId) {
  var spec = WHEEL_SLOTS[slotId];
  var voc = p.voc || "knight";
  var pts = wheelSlotPoints(p, slotId);
  var can = wheelCanAllocate(p, slotId);
  var full = pts >= spec.max;
  var pos = WHEEL_POS[slotId];
  var title = slotId + " — " + wheelSlotLabel(spec, voc);
  var cls = "wheel-node w-" + spec.color + (full ? " full" : "") + (can ? " can" : " locked");
  // posicoes em % da roda 522x522 para escalar com o fundo em qualquer tamanho
  var left = (pos[0] / WHEEL_SIZE * 100) + "%";
  var top = (pos[1] / WHEEL_SIZE * 100) + "%";
  return '<div class="' + cls + '" data-slot="' + slotId + '" title="' + title + '"' +
    ' style="left:' + left + ';top:' + top + ';">' +
    '<span class="wn-pts">' + pts + '/' + spec.max + '</span>' +
    (full ? '<span class="wn-full">✓</span>' : '') +
    '</div>';
}

function wheelNodeCss() {
  return '' +
    '<style>' +
    '.wheel-stage{position:relative;width:' + WHEEL_SIZE + 'px;height:' + WHEEL_SIZE + 'px;margin:0 auto;}' +
    '.wheel-stage .wheel-bg{position:absolute;inset:0;width:100%;height:100%;}' +
    '.wheel-links{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}' +
    '.wheel-links line{stroke:rgba(255,255,255,.14);stroke-width:2;}' +
    '.wheel-node{position:absolute;transform:translate(-50%,-50%);border-radius:50%;' +
    '  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
    '  font-size:9px;color:#fff;cursor:pointer;border:2px solid;line-height:1.05;' +
    '  width:42px;height:42px;min-width:34px;min-height:34px;' +
    '  text-shadow:1px 1px 0 #000,0 0 3px #000;z-index:2;}' +
    '.wheel-node.w-green{border-color:#4ade80;background:radial-gradient(circle,#16a34a55,#064e3b88);}' +
    '.wheel-node.w-red{border-color:#f87171;background:radial-gradient(circle,#dc262655,#7f1d1d88);}' +
    '.wheel-node.w-blue{border-color:#60a5fa;background:radial-gradient(circle,#2563eb55,#1e3a8a88);}' +
    '.wheel-node.w-purple{border-color:#c084fc;background:radial-gradient(circle,#9333ea55,#581c8788);}' +
    '.wheel-node.full{border-color:#fff;background:radial-gradient(circle,#ffffffcc,#ffffff33);box-shadow:0 0 14px #fff8;}' +
    '.wheel-node.full.w-green{border-color:#4ade80;background:radial-gradient(circle,#4ade80,#15803d);}' +
    '.wheel-node.full.w-red{border-color:#f87171;background:radial-gradient(circle,#f87171,#b91c1c);}' +
    '.wheel-node.full.w-blue{border-color:#60a5fa;background:radial-gradient(circle,#60a5fa,#1d4ed8);}' +
    '.wheel-node.full.w-purple{border-color:#c084fc;background:radial-gradient(circle,#c084fc,#7e22ce);}' +
    '.wheel-node.locked{opacity:.4;cursor:not-allowed;}' +
    '.wheel-node.can:not(.locked):hover{transform:translate(-50%,-50%) scale(1.15);border-color:#ffe680;}' +
    '.wheel-node .wn-pts{font-weight:bold;}' +
    '.wheel-node .wn-full{font-size:10px;color:#111;}' +
    '</style>';
}

/* Resumo de bonus da wheel. */
function wheelSummaryHtml(p) {
  var t = wheelTotals(p);
  var voc = p.voc || "knight";
  var rows = [];
  rows.push(["HP extra", "+" + t.hp]);
  rows.push(["Mana extra", "+" + t.mp]);
  rows.push(["Capacidade", "+" + t.cap]);
  rows.push(["Mitigação", "+" + Math.round(t.mitigation * 100) + "%"]);
  if (t.melee) rows.push(["Skill Melee", "+" + t.melee]);
  if (t.distance) rows.push(["Skill Distância", "+" + t.distance]);
  if (t.magic) rows.push(["Magic Level", "+" + t.magic]);
  if (t.fist) rows.push(["Skill Punho", "+" + t.fist]);
  // leech: t.lifeLeech/manaLeech ja sao a porcentagem real (0.75 = 0.75%)
  rows.push(["Life leech", "+" + wheelPct(t.lifeLeech)]);
  rows.push(["Mana leech", "+" + wheelPct(t.manaLeech)]);
  rows.push(["Dano (Revelation)", "+" + t.damagePct + "%"]);
  rows.push(["Cura (Revelation)", "+" + t.healPct + "%"]);

  var html = '<div class="wheel-sections">';
  html += '<div class="wheel-sec"><div class="wheel-sec-title">Bonus ativos</div><div class="wheel-stats">' +
    rows.map(function (r) { return '<div class="stat-row"><span class="k">' + r[0] + '</span><span class="v" style="color:#9ce84a">' + r[1] + '</span></div>'; }).join("") +
    '</div></div>';

  var upgrades = WHEEL_SPELL_UPGRADES[voc] || [];
  html += '<div class="wheel-sec"><div class="wheel-sec-title">Magias da Wheel</div>';
  for (var i = 0; i < upgrades.length; i++) {
    var u = upgrades[i];
    var st = wheelSpellUpgrade(p, u.name);
    var nm = SPELLS[u.name] ? SPELLS[u.name].name : u.spell;
    html += '<div class="stat-row"><span class="k">' + nm + '</span>' +
      '<span class="v" style="color:' + (st && st.grade ? "#ffe680" : "#8a8270") + '">' + (st && st.grade ? "G" + st.grade : "—") + '</span></div>';
  }
  html += '</div>';

  var colors = ["green", "red", "blue", "purple"];
  html += '<div class="wheel-sec"><div class="wheel-sec-title">Estágios (Revelation)</div>';
  for (var c = 0; c < colors.length; c++) {
    var col = colors[c];
    var stg = wheelStage(p, col);
    var ab = t.stageAbilities[col] || null;
    html += '<div class="stat-row"><span class="k" style="color:' + wheelColorCss(col) + '">' + WHEEL_COLORS[col].nome + ' · pts ' + wheelColorPoints(p, col) + '</span>' +
      '<span class="v">' + (stg > 0 ? "Estágio " + stg + (ab ? " · " + ab : "") : "—") + '</span></div>';
  }
  html += '</div>';

  html += '<div class="wheel-sec"><div class="wheel-sec-title">Avatar (estágio roxo)</div>' +
    '<div class="stat-row"><span class="k">Nível Avatar</span><span class="v" style="color:#c084fc">' + t.avatarLevel + '</span></div>' +
    '<div class="tiny dim">O estágio roxo concede o Avatar da vocação (' + (t.stageAbilities.purple || "Avatar") + ').</div></div>';

  if (t.instants.length) {
    html += '<div class="wheel-sec"><div class="wheel-sec-title">Habilidades instantâneas</div>' +
      t.instants.map(function (n) { return '<div class="stat-row"><span class="k">' + n + '</span><span class="v" style="color:#9ce84a">desbloqueada</span></div>'; }).join("") +
      '</div>';
  }
  html += '</div>';
  return html;
}

function wheelScrollPrice(scroll) {
  return Math.floor(5000 * Math.pow(2, WHEEL_CONFIG.scrolls.indexOf(scroll)));
}

function openWheelModal() {
  var p = G.p;
  if (!p) return;
  ensureWheel(p);
  var modal = $("#modal"), body = $("#modal-body");
  if (!modal || !body) return;
  body.innerHTML = renderWheelModal(p);
  modal.classList.add("show", "wide");
  bindWheelModal();
}

function renderWheelModal(p) {
  var locked = p.level < WHEEL_CONFIG.minLevel;
  var avail = wheelAvail(p);
  var spent = wheelSpent(p);
  var total = wheelPoints(p);

  var nodesHtml = "";
  for (var id in WHEEL_SLOTS) nodesHtml += wheelNodeHtml(p, id);

  var scrollHtml = "";
  for (var i = 0; i < WHEEL_CONFIG.scrolls.length; i++) {
    var sc = WHEEL_CONFIG.scrolls[i];
    var done = !!p.wheel.scrolls[sc.id];
    var price = wheelScrollPrice(sc);
    scrollHtml += '<div class="stat-row"><span class="k">' + sc.item + '</span>' +
      '<span class="v">' + (done
        ? '<span style="color:#9ce84a">decifrado</span>'
        : '<button class="sm" data-buy-scroll="' + sc.id + '" ' + (locked ? "disabled" : "") + '>+ ' + sc.pontos + ' pts · ' + fmtFull(price) + ' gp</button>') +
      '</span></div>';
  }

  var legend = '<div class="wheel-legend">' +
    ["green", "red", "blue", "purple"].map(function (c) {
      return '<span style="color:' + wheelColorCss(c) + '"><i class="dot" style="background:' + wheelColorCss(c) + '"></i>' + WHEEL_COLORS[c].nome + '</span>';
    }).join("") +
    '<span style="color:#ffe680">Clique=gastar · Clique dir=remover</span></div>';

  return '<div class="wheel-modal">' +
    '<div class="panel-title">☸ Wheel of Destiny' +
    '<span style="flex:1"></span><button class="sm" id="wheel-close">✕</button></div>' +
    '<div class="wheel-top">' +
      '<div class="wheel-avail">Pontos: <b>' + fmtFull(avail) + '</b> disponíveis de <b>' + fmtFull(total) + '</b> (gastos ' + fmtFull(spent) + ')</div>' +
      legend +
      '<div class="tiny dim">' + (locked
        ? 'Liberada a partir do <b>nível ' + WHEEL_CONFIG.minLevel + '</b>. Você está no nível ' + p.level + '.'
        : 'Ganhe <b>1 ponto</b> por nível acima de 50.') + '</div>' +
    '</div>' +
    '<div class="wheel-body">' +
      '<div class="wheel-stage">' +
        '<img class="wheel-bg" src="' + wheelBackgroundImg(p.voc) + '?v=1" alt="">' +
        wheelSvgConnections() +
        nodesHtml +
      '</div>' +
      '<div class="wheel-right">' + wheelSummaryHtml(p) +
        '<div class="wheel-sec"><div class="wheel-sec-title">Promotion Scrolls</div>' + scrollHtml +
        '<div class="tiny dim mt4">Scrolls dão pontos extras permanentes (requerem nível 51+).</div></div>' +
      '</div>' +
    '</div>' +
    wheelNodeCss() +
    '</div>';
}

function bindWheelModal() {
  var body = $("#modal-body");
  if (!body) return;
  var close = $("#wheel-close");
  if (close) close.addEventListener("click", function () { $("#modal").classList.remove("show"); });
  body.querySelectorAll("[data-slot]").forEach(function (el) {
    var slotId = el.dataset.slot;
    el.addEventListener("click", function () {
      if (wheelAllocate(G.p, slotId)) renderWheelModalToDom();
    });
    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      if (wheelRemove(G.p, slotId)) renderWheelModalToDom();
    });
  });
  body.querySelectorAll("[data-buy-scroll]").forEach(function (el) {
    el.addEventListener("click", function () {
      var id = parseInt(el.dataset.buyScroll, 10);
      var sc = WHEEL_CONFIG.scrolls.filter(function (x) { return x.id === id; })[0];
      if (!sc || G.p.wheel.scrolls[id]) return;
      var price = wheelScrollPrice(sc);
      if (G.p.level < WHEEL_CONFIG.minLevel + 1) { toast("Requer nível 51+ para decifrar."); return; }
      if (!spendGold(G.p, price)) { toast("Ouro insuficiente."); return; }
      G.p.wheel.scrolls[id] = 1;
      toast("Decifrou o <b>" + sc.item + "</b>: +" + sc.pontos + " pontos!");
      save();
      renderWheelModalToDom();
    });
  });
}

function renderWheelModalToDom() {
  var body = $("#modal-body");
  if (!body) return;
  body.innerHTML = renderWheelModal(G.p);
  bindWheelModal();
}
