/**
 * otc-hud.js — Complete OTClient HUD systems
 *
 * Implements: Health Circle (healthcircle/), Combat Modes (combatmodes/),
 * Player States (states/), Battle Icons (battle/), Skulls (skulls/),
 * Shields (shields/), Emblems (emblems/), Crosshair (crosshair/),
 * Creature Icons (creatureicons/)
 */
"use strict";

// ═══════════════════════ COMBAT MODES ═══════════════════════
function renderCombatModesStrip(p) {
  const el = document.getElementById('combat-modes-strip');
  if (!el) return;
  const cfg = p.config || {};
  const fightMode = cfg.fightMode || 'attack';
  const chaseMode = cfg.attackMode || 'chase';
  const pvpMode = cfg.pvpMode || 'dove';
  const safeFight = cfg.safeFight || false;

  // PVP mode icons
  const pvpIcons = [
    ['dove', '🕊', 'White Dove — never attack'],  // PVPWhiteDove
    ['hand', '🤍', 'White Hand — defend only'],   // PVPWhiteHand
    ['yellow', '💛', 'Yellow Hand — attack'],     // PVPYellowHand
    ['fist', '👊', 'Red Fist — attack freely'],   // PVPRedFist
  ];

  // Fight mode icons (Offensive=1, Balanced=2, Defensive=3)
  const fightIcons = [
    ['attack', '⚔', 'Full Attack'],
    ['balanced', '⚖', 'Balanced'],
    ['defense', '🛡', 'Full Defense'],
  ];

  // Chase icons
  const chaseIcons = [
    ['stand', '⏸', 'Stand'],    // DontChase
    ['chase', '👣', 'Chase'],   // ChaseOpponent
  ];

  let h = '<div class="hud-row">';

  // PvP modes
  h += '<div class="combat-modes-strip">';
  for (const [id, icon, tt] of pvpIcons) {
    h += `<div class="combat-mode-icon pvp-${id} ${pvpMode===id?'active':''}" data-pvp="${id}" title="${tt}">${icon}</div>`;
  }
  h += '</div>';

  // Fight modes
  h += '<div class="fight-mode-strip">';
  for (const [id, icon, tt] of fightIcons) {
    h += `<div class="fight-mode-btn ${fightMode===id?'active':''}" data-fight="${id}" title="${tt}">${icon}</div>`;
  }
  h += '</div>';

  // Chase modes
  h += '<div class="chase-mode-strip">';
  for (const [id, icon, tt] of chaseIcons) {
    h += `<div class="chase-mode-btn ${chaseMode===id?'active':''}" data-chase="${id}" title="${tt}">${icon}</div>`;
  }
  h += '</div>';

  // Safe Fight
  h += `<div class="safe-fight-btn ${safeFight?'on':''}" data-safefight title="Safe Fight — never attack players">🛡</div>`;

  h += '</div>';
  el.innerHTML = h;

  // Bindings
  el.querySelectorAll('[data-pvp]').forEach(b => b.addEventListener('click', () => {
    cfg.pvpMode = b.dataset.pvp; renderCombatModesStrip(p);
  }));
  el.querySelectorAll('[data-fight]').forEach(b => b.addEventListener('click', () => {
    cfg.fightMode = b.dataset.fight; renderCombatModesStrip(p);
  }));
  el.querySelectorAll('[data-chase]').forEach(b => b.addEventListener('click', () => {
    cfg.attackMode = b.dataset.chase;
    if (typeof renderHelper === 'function') renderHelper(p);
    renderCombatModesStrip(p);
  }));
  const sf = el.querySelector('[data-safefight]');
  if (sf) sf.addEventListener('click', () => {
    cfg.safeFight = !cfg.safeFight; renderCombatModesStrip(p);
  });
}

// ═══════════════════════ PLAYER STATES ═══════════════════════
/** Conditions ficam só em #cond-bar / #status-bar — não no viewport de combate. */
function renderPlayerStates(p) {
  const el = document.getElementById('player-states-strip');
  if (!el) return;
  el.innerHTML = "";
  el.style.display = "none";
  el.setAttribute("hidden", "");
  el.setAttribute("aria-hidden", "true");
}

// ═══════════════════════ SKULL ICONS ═══════════════════════
const SKULL_SYMBOLS = {
  none:   '·',
  yellow: '⚠',
  green:  '✓',
  white:  '◻',
  red:    '☠',
  black:  '✠',
  orange: '⚡',
};

const SKULL_COLORS = {
  none: '#888', yellow: '#fbbf24', green: '#4ade80', white: '#fff',
  red: '#f87171', black: '#333', orange: '#f97316',
};

function skullIcon(skull, size) {
  size = size || 12;
  return `<span class="skull-icon" style="color:${SKULL_COLORS[skull] || '#888'};font-size:${size}px;font-weight:bold" title="Skull: ${skull}">${SKULL_SYMBOLS[skull] || '·'}</span>`;
}

// ═══════════════════════ SHIELD ICONS ═══════════════════════
const SHIELD_SYMBOLS = {
  none: '·', whiteyellow: '👤', whiteblue: '👤', blue: '🔷', yellow: '🔶',
  bluesharedexp: '💠', yellowsharedexp: '🔸',
  bluenoshared: '🔹', yellownoshared: '🔸',
  gray: '⬜',
};

function shieldIcon(shield, size) {
  size = size || 12;
  return `<span class="shield-icon" style="font-size:${size}px" title="Party: ${shield || 'none'}">${SHIELD_SYMBOLS[shield] || '·'}</span>`;
}

// ═══════════════════════ EMBLEM ICONS ═══════════════════════
const EMBLEM_SYMBOLS = {none:'·', green:'🟢', red:'🔴', blue:'🔵', member:'👥', other:'⬜'};

function emblemIcon(emblem, size) {
  size = size || 12;
  return `<span class="emblem-icon" style="font-size:${size}px" title="Emblem: ${emblem || 'none'}">${EMBLEM_SYMBOLS[emblem] || '·'}</span>`;
}

// ═══════════════════════ BATTLE LIST ICONS ═══════════════════════
const BATTLE_VOC_ICON = {
  knight: '🛡', paladin: '🏹', sorcerer: '🔥', druid: '🌿', monk: '☯',
  monster: '👹', npc: '💬', player: '👤', summon: '✦',
};

function battleVocIcon(voc, size) {
  size = size || 14;
  return `<span class="battle-icon" style="font-size:${size}px" title="${voc}">${BATTLE_VOC_ICON[voc] || '·'}</span>`;
}

// ═══════════════════════ CROSSHAIR ═══════════════════════
function initCrosshair() {
  const el = document.createElement('div');
  el.className = 'crosshair';
  el.id = 'crosshair';
  el.style.display = 'none';
  document.body.appendChild(el);

  document.addEventListener('mousemove', (e) => {
    el.style.left = e.clientX + 'px';
    el.style.top = e.clientY + 'px';
  });

  // Show on right-click hold (combat mode), hide otherwise
  document.addEventListener('contextmenu', (e) => {
    el.style.display = 'block';
  });
  document.addEventListener('mouseup', () => {
    if (document.pointerLockElement === null) el.style.display = 'none';
  });
}

// ═══════════════════════ TOP BAR STATS ═══════════════════════
function renderTopBarStats(p) {
  const el = document.getElementById('topbar-stats');
  if (!el) return;
  const max = maxStats(p);
  const hpPct = max.hp ? p.hp / max.hp : 0;
  const mpPct = max.mp ? p.mp / max.mp : 0;
  const expPct = typeof expProgress === 'function' ? expProgress(p) / 100 : 0;

  // HP bar
  let h = '<div class="hud-row" style="gap:4px;font-size:10px">';
  h += '<span style="color:#f87171;width:20px">HP</span>';
  h += `<div class="bar" style="flex:1;max-width:140px;height:8px;margin:0"><div class="fill hp" style="width:${Math.round(hpPct*100)}%"></div></div>`;
  h += `<span style="color:#c0c0c0;font-size:9px">${Math.floor(p.hp)}</span>`;

  // MP bar
  h += '<span style="color:#60a5fa;width:20px;margin-left:8px">MP</span>';
  h += `<div class="bar" style="flex:1;max-width:140px;height:8px;margin:0"><div class="fill mp" style="width:${Math.round(mpPct*100)}%"></div></div>`;
  h += `<span style="color:#c0c0c0;font-size:9px">${Math.floor(p.mp)}</span>`;

  // EXP bar
  h += '<span style="color:#fbbf24;width:20px;margin-left:8px">XP</span>';
  h += `<div class="bar" style="flex:1;max-width:140px;height:8px;margin:0"><div class="fill exp" style="width:${Math.round(expPct*100)}%"></div></div>`;
  h += '<span style="color:#c0c0c0;font-size:9px">' + Math.round(expPct * 100) + '%</span>';

  h += '</div>';
  el.innerHTML = h;
}

// ═══════════════════════ INIT ═══════════════════════
function initOtcHud() {
  initCrosshair();
}

if (typeof document !== 'undefined' && document.readyState !== 'loading') initOtcHud();
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initOtcHud);

if (typeof window !== 'undefined') {
  window.OtcHud = {
    renderCombatModesStrip, renderPlayerStates,
    renderTopBarStats,
    skullIcon, shieldIcon, emblemIcon, battleVocIcon,
    SKULL_SYMBOLS, SKULL_COLORS, SHIELD_SYMBOLS, EMBLEM_SYMBOLS, BATTLE_VOC_ICON,
  };
}
