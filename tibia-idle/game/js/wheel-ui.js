/* =========================================================================
 * wheel-ui.js — interface da Wheel of Destiny (Roda do Destino)
 *
 * Desenha a roda com os 36 nos nas 4 cores, permite alocar/remover pontos,
 * mostra o resumo de bonus (stats, skills, leech, mitigation, dano/cura de
 * stage, magias e avatares) e os promotion scrolls.
 * ========================================================================= */
"use strict";

/* Posicao de cada no na roda (coordenadas CSS em px, container 460x460,
 * centro em 230,230). Monta um circulo de 4 quadrantes. */
var WHEEL_UI_CENTER = 230;
var WHEEL_UI_RADIUS = 195;

function wheelNodePos(slotId) {
  var spec = WHEEL_SLOTS[slotId];
  if (!spec) return null;
  // cada cor ocupa 90° (angulo base da "meia-noite" do quadrante)
  var colorAngle = { green: 90, red: 0, blue: 270, purple: 180 }[spec.color];
  var deg2rad = Math.PI / 180;
  var ang, rad;
  var name = slotId;
  var mid = colorAngle;
  if (/_(TOP|BOTTOM)_(75|150)$/.test(name)) {
    var isTop = name.indexOf("_TOP_") !== -1;
    var is150 = name.indexOf("_150") !== -1;
    ang = mid + (isTop ? -28 : 28);
    rad = is150 ? WHEEL_UI_RADIUS * 0.82 : WHEEL_UI_RADIUS * 0.46;
  } else if (/_(TOP|BOTTOM|MIDDLE)_100$/.test(name)) {
    if (name.indexOf("_TOP_") !== -1) { ang = mid - 40; rad = WHEEL_UI_RADIUS * 0.64; }
    else if (name.indexOf("_BOTTOM_") !== -1) { ang = mid + 40; rad = WHEEL_UI_RADIUS * 0.64; }
    else { ang = mid; rad = WHEEL_UI_RADIUS * 0.55; }
  } else if (/_(TOP|BOTTOM)_150$/.test(name)) {
    var t150 = name.indexOf("_TOP_") !== -1;
    ang = mid + (t150 ? -26 : 26);
    rad = WHEEL_UI_RADIUS * 0.82;
  } else if (/_200$/.test(name)) {
    ang = mid; rad = WHEEL_UI_RADIUS * 0.96;
  } else { // _50
    ang = mid; rad = WHEEL_UI_RADIUS * 0.30;
  }
  var x = WHEEL_UI_CENTER + Math.cos(deg2rad * ang) * rad;
  var y = WHEEL_UI_CENTER + Math.sin(deg2rad * ang) * rad;
  return { x: x, y: y, ang: ang, rad: rad };
}

/* Descricao curta do bonus de um no para a vocacao. */
function wheelSlotLabel(spec, voc) {
  var parts = [];
  var vocHp = WHEEL_HP[voc], vocMp = WHEEL_MP[voc], vocCap = WHEEL_CAP[voc];
  if (spec.hp) parts.push("+" + vocHp + " HP/pt");
  if (spec.mana) parts.push("+" + vocMp + " Mana/pt");
  if (spec.cap) parts.push("+" + vocCap + " Cap/pt");
  if (spec.mit) parts.push("+3% Mitig/pt");
  if (spec.leech) parts.push("+" + Math.round(WHEEL_LEECH[spec.leech] * 100) + "% " +
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

/* HTML de um no da roda. */
function wheelNodeHtml(p, slotId) {
  var spec = WHEEL_SLOTS[slotId];
  var voc = p.voc || "knight";
  var pts = wheelSlotPoints(p, slotId);
  var can = wheelCanAllocate(p, slotId);
  var full = pts >= spec.max;
  var pos = wheelNodePos(slotId);
  var title = slotId + " — " + wheelSlotLabel(spec, voc);
  var cls = "wheel-node w-" + spec.color + (full ? " full" : "") + (can ? " can" : " locked");
  var size = Math.max(34, 26 + spec.max / 20);
  return '<div class="' + cls + '" data-slot="' + slotId + '" title="' + title + '"' +
    ' style="left:' + pos.x.toFixed(1) + 'px;top:' + pos.y.toFixed(1) + 'px;width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) + 'px">' +
    '<span class="wn-pts">' + pts + '/' + spec.max + '</span>' +
    '</div>';
}

function wheelNodeCss() {
  return '' +
    '<style>' +
    '.wheel-wrap{position:relative;width:460px;height:460px;margin:0 auto;' +
    '  background:radial-gradient(circle,#14120e 0%,#0a0908 70%);border:1px solid #3a3324;border-radius:50%;}' +
    '.wheel-node{position:absolute;transform:translate(-50%,-50%);border-radius:50%;' +
    '  display:flex;align-items:center;justify-content:center;text-align:center;' +
    '  font-size:9px;color:#e8e0c8;cursor:pointer;border:2px solid;line-height:1.05;}' +
    '.wheel-node .wn-pts{font-weight:bold;text-shadow:1px 1px 0 #000;}' +
    '.wheel-node.w-green{border-color:#4ade80;background:rgba(74,222,128,.12);}' +
    '.wheel-node.w-red{border-color:#f87171;background:rgba(248,113,113,.12);}' +
    '.wheel-node.w-blue{border-color:#60a5fa;background:rgba(96,165,250,.12);}' +
    '.wheel-node.w-purple{border-color:#c084fc;background:rgba(192,132,252,.12);}' +
    '.wheel-node.full{background:rgba(255,255,255,.18);box-shadow:0 0 10px currentColor;}' +
    '.wheel-node.locked{opacity:.45;cursor:not-allowed;}' +
    '.wheel-node.can:hover{transform:translate(-50%,-50%) scale(1.12);}' +
    '</style>';
}

/* Resumo de bonus da wheel para a vocacao. */
function wheelSummaryHtml(p) {
  var t = wheelTotals(p);
  var voc = p.voc || "knight";
  var rows = [];
  rows.push(["HP extra", "+" + t.hp]);
  rows.push(["Mana extra", "+" + t.mp]);
  rows.push(["Capacidade extra", "+" + t.cap]);
  rows.push(["Mitigação", "+" + Math.round(t.mitigation * 100) + "%"]);
  if (t.melee) rows.push(["Skill Melee", "+" + t.melee]);
  if (t.distance) rows.push(["Skill Distância", "+" + t.distance]);
  if (t.magic) rows.push(["Magic Level", "+" + t.magic]);
  if (t.fist) rows.push(["Skill Punho", "+" + t.fist]);
  rows.push(["Life leech", "+" + Math.round(t.lifeLeech * 100) + "%"]);
  rows.push(["Mana leech", "+" + Math.round(t.manaLeech * 100) + "%"]);
  rows.push(["Dano (Revelation)", "+" + t.damagePct + "%"]);
  rows.push(["Cura (Revelation)", "+" + t.healPct + "%"]);

  var html = '<div class="wheel-sections">';

  // --- resumo
  html += '<div class="wheel-sec"><div class="wheel-sec-title">Bonus ativos</div><div class="wheel-stats">' +
    rows.map(function (r) { return '<div class="stat-row"><span class="k">' + r[0] + '</span><span class="v" style="color:#9ce84a">' + r[1] + '</span></div>'; }).join("") +
    '</div></div>';

  // --- magias da wheel
  var upgrades = WHEEL_SPELL_UPGRADES[voc] || [];
  html += '<div class="wheel-sec"><div class="wheel-sec-title">Magias da Wheel</div>';
  for (var i = 0; i < upgrades.length; i++) {
    var u = upgrades[i];
    var st = wheelSpellUpgrade(p, u.name);
    var nm = SPELLS[u.name] ? SPELLS[u.name].name : u.spell;
    var gradeTxt = st && st.grade ? "G" + st.grade : "—";
    html += '<div class="stat-row"><span class="k">' + nm + '</span>' +
      '<span class="v" style="color:' + (st && st.grade ? "#ffe680" : "#8a8270") + '">' + gradeTxt + '</span></div>';
  }
  html += '</div>';

  // --- estagios por cor
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

  // --- avatares
  html += '<div class="wheel-sec"><div class="wheel-sec-title">Avatar (estágio roxo)</div>' +
    '<div class="stat-row"><span class="k">Nível Avatar</span><span class="v" style="color:#c084fc">' + t.avatarLevel + '</span></div>' +
    '<div class="tiny dim">O estágio roxo concede o Avatar da vocação (' +
    (t.stageAbilities.purple || "Avatar") + ').</div></div>';

  // --- instants
  if (t.instants.length) {
    html += '<div class="wheel-sec"><div class="wheel-sec-title">Habilidades instantâneas</div>' +
      t.instants.map(function (n) { return '<div class="stat-row"><span class="k">' + n + '</span><span class="v" style="color:#9ce84a">desbloqueada</span></div>'; }).join("") +
      '</div>';
  }

  html += '</div>';
  return html;
}

function wheelColorCss(c) {
  return { green: "#4ade80", red: "#f87171", blue: "#60a5fa", purple: "#c084fc" }[c];
}

/* Preco de um promotion scroll (regra da casa, escala com a raridade). */
function wheelScrollPrice(scroll) {
  return Math.floor(5000 * Math.pow(2, WHEEL_CONFIG.scrolls.indexOf(scroll)));
}

/* Modal principal da wheel. */
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

  // --- promotion scrolls
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

  return '<div class="wheel-modal">' +
    '<div class="panel-title">☸ Wheel of Destiny' +
    '<span style="flex:1"></span><button class="sm" id="wheel-close">✕</button></div>' +
    '<div class="wheel-top">' +
      '<div class="wheel-avail">Pontos: <b>' + fmtFull(avail) + '</b> disponíveis de <b>' + fmtFull(total) + '</b> (gastos ' + fmtFull(spent) + ')</div>' +
      '<div class="tiny dim">' + (locked
        ? 'Liberada a partir do <b>nível ' + WHEEL_CONFIG.minLevel + '</b>. Você está no nível ' + p.level + '.'
        : 'Ganhe <b>1 ponto</b> por nível acima de 50. Clique num nó para gastar, clique com o botão direito para remover.') + '</div>' +
    '</div>' +
    '<div class="wheel-body">' +
      '<div class="wheel-wrap">' + nodesHtml + '</div>' +
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
  $("#wheel-close").addEventListener("click", function () {
    $("#modal").classList.remove("show");
  });
  body.querySelectorAll("[data-slot]").forEach(function (el) {
    var slotId = el.dataset.slot;
    el.addEventListener("click", function (e) {
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
      var sc = WHEEL_CONFIG.scrolls.find(function (x) { return x.id === id; });
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

/* Re-renderiza o conteudo do modal mantendo-o aberto. */
function renderWheelModalToDom() {
  var body = $("#modal-body");
  if (!body) return;
  body.innerHTML = renderWheelModal(G.p);
  bindWheelModal();
}
