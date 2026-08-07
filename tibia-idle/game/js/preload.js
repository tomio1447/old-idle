/* preload.js — preparação visual antes de entrar no jogo. */
"use strict";
function showGameLoading(show, text, pct) {
  const el = document.getElementById('game-loading');
  if (!el) return;
  el.style.display = show ? 'flex' : 'none';
  const label = el.querySelector('.gl-text'), fill = el.querySelector('.gl-fill');
  if (label) label.textContent = text || 'Carregando...';
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
}
function preloadGameAssets(p) {
  const paths = new Set([
    'assets/ground/city.png','assets/ground/cave.png','assets/ui/imbuement-machine.png',
    'assets/ui/conditions/cond-magic-shield.png','assets/effects/critical-heal-effect.png'
  ]);
  // Aparência atual + party inicial: evita frames brancos ao entrar.
  if (p && p.outfit && p.outfit.appearance) paths.add('assets/appearance/outfit/' + p.outfit.appearance + '.base.png');
  if (p && p.outfit && p.outfit.mount) paths.add('assets/appearance/mount/' + p.outfit.mount + '.base.png');
  const hunt = p && typeof GAMEDATA !== 'undefined' && GAMEDATA.hunts && GAMEDATA.hunts[p.hunt];
  if (hunt) for (const slug of hunt.monsters || []) paths.add('assets/mob/' + slug + '.png');
  const list = [...paths];
  if (!list.length) return Promise.resolve();
  let done = 0;
  return Promise.all(list.map((src) => new Promise((resolve) => {
    const img = new Image();
    const finish = () => { done++; showGameLoading(true, `Carregando recursos ${done}/${list.length}`, done/list.length*100); resolve(); };
    img.onload = finish; img.onerror = finish; img.src = src;
  }))).then(() => undefined);
}
