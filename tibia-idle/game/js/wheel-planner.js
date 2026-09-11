/* wheel-planner.js — Visualização da Wheel of Destiny no layout do cliente. */
"use strict";

(function () {
  const WD = window.WHEEL_DATA;
  const size = 522;
  const cx = 261;
  const cy = 261;
  const WHEEL_VOCATIONS = ['knight','druid','paladin','sorcerer','monk'];
  const VOC_ROTATION = { knight: 90, druid: 0, paladin: -90, sorcerer: 180, monk: 90 };
  const VOC_FRONT = { knight: 'knight', druid: 'druid', paladin: 'paladin', sorcerer: 'sorc', monk: 'monk' };

  const svgNS = 'http://www.w3.org/2000/svg';
  const xlinkNS = 'http://www.w3.org/1999/xlink';

  function deg2rad(d) { return d * Math.PI / 180; }
  function rotate(x, y, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return [ c * x + s * y, c * y - s * x ];
  }
  function createArc(r, w, a) {
    const r2 = r + w;
    const [x1, y1] = rotate(r, 0, a);
    const [x2, y2] = rotate(r2, 0, a);
    const big = a > Math.PI ? 1 : 0;
    return `M${r} 0 L${r2} 0 A${r2} ${r2} 0 ${big} 0 ${x2.toFixed(2)} ${y2.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${big} 1 ${r} 0`;
  }
  function iconCircle(i) {
    if (i < 4) return 0;
    if (i < 12) return 1;
    if (i < 24) return 2;
    if (i < 32) return 3;
    return 4;
  }
  function sum(arr) { return (arr || []).reduce((a, b) => a + b, 0); }
  function iconIndexInCircle(i) {
    const c = iconCircle(i);
    const prev = sum(WD.slicesPerCircle.slice(0, c));
    return i - prev;
  }
  function iconSection(i) {
    const c = iconCircle(i);
    const prev = sum(WD.slicesPerCircle.slice(0, c));
    return Math.floor((i - prev) / WD.slicesPerCircle[c] * 4);
  }

  function el(tag, attrs) {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) {
      if (k === 'xlink:href') e.setAttributeNS(xlinkNS, 'href', attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    return e;
  }

  function pattern(id, w, h, img, imgW, x) {
    const p = el('pattern', {
      id: id,
      patternUnits: 'userSpaceOnUse',
      width: w,
      height: h,
    });
    const image = el('image', {
      'xlink:href': img,
      x: x,
      y: 0,
      width: imgW,
      height: h,
    });
    p.appendChild(image);
    return p;
  }

  function makePatterns() {
    const defs = el('defs', {});
    for (let i = 0; i < WD.dedication.length; i++) {
      const d = WD.dedication[i];
      defs.appendChild(pattern('wh-small-' + i, 16, 16, 'assets/wheel/icons-skillwheel-smallperks.png', 208, -d.icon * 16));
    }
    for (let i = 0; i < WD.conviction.length; i++) {
      defs.appendChild(pattern('wh-medium-' + i, 30, 30, 'assets/wheel/icons-skillwheel-mediumperks.png', 1470, -i * 30));
    }
    for (let i = 0; i < WD.revelation.length; i++) {
      defs.appendChild(pattern('wh-large-' + i, 34, 34, 'assets/wheel/icons-skillwheel-largeperks.png', 544, -i * 34));
    }
    return defs;
  }

  function arcColor(section, p, max) {
    const colors = [
      ['#8a4b9c','#5c2d6e'], // 0 purple
      ['#4a9c6a','#2d6e4a'], // 1 green
      ['#c98a2f','#8c6120'], // 2 orange
      ['#4a8a9c','#2d5a6e'], // 3 blue
    ];
    const [outer, inner] = colors[section];
    const opacity = p / max;
    return { outer, inner, opacity };
  }

  function renderSlice(i, vocation, p) {
    const c = iconCircle(i);
    const section = iconSection(i);
    const max = WD.pointsPerCircle[c];
    const pts = (p && p.wheel && Array.isArray(p.wheel.uiSlots) && p.wheel.uiSlots[i]) || 0;
    const indexInCircle = iconIndexInCircle(i);
    const sliceDeg = 360 / WD.slicesPerCircle[c];
    const angle = sliceDeg * (indexInCircle + 1);
    const iconOffset = c === 3 ? (indexInCircle % 2 === 0 ? 0.35 : 0.65) : 0.5;
    const radius = c * 52 + 26;
    const seg = deg2rad(sliceDeg);
    const [ix, iy] = rotate(radius, 0, seg * iconOffset - deg2rad(angle));
    const rArc = c * 52;
    const innerW = 1;
    const outerW = 50 - innerW + 1;
    const inner = createArc(rArc, innerW, seg);
    const outer = createArc(rArc + innerW, outerW, seg);
    const full = pts >= max;
    const colors = arcColor(section, pts, max);

    const g = el('g', { transform: `rotate(${angle} ${cx} ${cy})`, class: 'wheel-slice wheel-slice-clickable section-' + section + (full ? ' full' : ''), 'data-index': i, 'data-vocation': vocation, 'data-kind': 'slice' });

    const pOuter = el('path', { d: outer, fill: colors.outer, opacity: 0.25 + (pts / max) * 0.7, transform: `translate(${cx} ${cy})`, class: 'wheel-slice-outer' });
    const pInner = el('path', { d: inner, fill: full ? '#d4af37' : colors.inner, opacity: full ? 0.9 : 0.1 + (pts / max) * 0.3, transform: `translate(${cx} ${cy})`, class: 'wheel-slice-inner' });
    g.appendChild(pOuter);
    g.appendChild(pInner);

    const iconG = el('g', { transform: `translate(${Math.round(cx + ix)}, ${Math.round(cy + iy)}) rotate(${-angle})` });
    const conIdx = WD.perks.conviction[vocation][i];
    const dedIdx = WD.perks.dedication[i];
    const con = el('rect', { width: 30, height: 30, transform: 'translate(-15,-15)', fill: 'url(#wh-medium-' + conIdx + ')' });
    const ded = el('rect', { width: 16, height: 16, transform: 'translate(-16,1)', fill: 'url(#wh-small-' + dedIdx + ')' });
    iconG.appendChild(con);
    iconG.appendChild(ded);
    g.appendChild(iconG);

    const txt = el('text', { x: Math.round(cx + ix), y: Math.round(cy + iy) + 12, 'text-anchor': 'middle', fill: full ? '#ffe680' : '#aaa', 'font-size': 9, 'pointer-events': 'none', 'font-family': 'monospace' });
    txt.textContent = pts + '/' + max;
    g.appendChild(txt);

    return g;
  }

  function renderRevelation(i, vocation) {
    const idx = WD.perks.revelation[vocation][i];
    const [x, y] = rotate(172, 172, Math.PI / 2 * -i);
    const [iconX, iconY] = rotate(48, 48, Math.PI / 2 * -i);
    const gx = Math.round(x), gy = Math.round(y);
    const g = el('g', { transform: `translate(${gx + 89} ${gy + 89})`, class: 'wheel-revelation wheel-slice-clickable', 'data-index': i, 'data-vocation': vocation, 'data-kind': 'revelation' });
    const img = el('image', { 'xlink:href': 'assets/wheel/backdrop_skillwheel_largebonus_front0_' + ['BR','BL','TL','TR'][i] + '.png', width: 178, height: 178, x: -89, y: -89 });
    g.appendChild(img);
    const iconG = el('g', { transform: `translate(${Math.round(iconX)}, ${Math.round(iconY)})` });
    const rect = el('rect', { width: 34, height: 34, transform: 'translate(-17,-17)', fill: 'url(#wh-large-' + idx + ')' });
    iconG.appendChild(rect);
    g.appendChild(iconG);
    return g;
  }

  function renderWheel(vocation, p) {
    const svg = el('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, class: 'wheel-svg', style: 'max-width:100%;height:auto;' });
    svg.appendChild(makePatterns());

    const bg = el('image', { 'xlink:href': 'assets/wheel/backdrop_skillwheel.png', x: 0, y: 0, width: size, height: size });
    svg.appendChild(bg);

    const wheelG = el('g', { transform: `rotate(${VOC_ROTATION[vocation]} ${cx} ${cy})` });
    for (let i = 0; i < 36; i++) {
      wheelG.appendChild(renderSlice(i, vocation, p));
    }
    for (let i = 0; i < 4; i++) {
      wheelG.appendChild(renderRevelation(i, vocation));
    }
    svg.appendChild(wheelG);

    const front = el('image', { 'xlink:href': 'assets/wheel/backdrop_skillwheel_front_' + VOC_FRONT[vocation] + '.png', x: 0, y: 0, width: size, height: size, class: 'wheel-front' });
    svg.appendChild(front);

    return svg;
  }

  function createPanel(vocation, p) {
    const wrap = document.createElement('div');
    wrap.className = 'wheel-planner';
    const svg = renderWheel(vocation, p);
    wrap.appendChild(svg);
    return wrap;
  }

  window.WheelPlanner = {
    render: createPanel,
    renderWheel: renderWheel,
    vocations: WHEEL_VOCATIONS,
    rotation: VOC_ROTATION,
  };
})();
