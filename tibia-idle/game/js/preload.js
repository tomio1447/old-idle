/* preload.js — preparação visual antes de entrar no jogo. */
"use strict";
let MAP_LOADING_GENERATION = 0;
function currentMapLoadingGeneration(){return MAP_LOADING_GENERATION;}
function showGameLoading(show, text, pct) {
  const el = document.getElementById('game-loading');
  if (!el) return;
  el.style.display = show ? 'flex' : 'none';
  const label = el.querySelector('.gl-text'), fill = el.querySelector('.gl-fill');
  if (label) label.textContent = text || 'Carregando...';
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
}
function beginMapLoading(text) {
  MAP_LOADING_GENERATION++;
  showGameLoading(true, text || 'Carregando mapa...', 0);
  return MAP_LOADING_GENERATION;
}

function markHuntMapReady() {
  if (typeof G === "undefined" || !G) return;
  const wasBlocked = G.huntMapReady === false;
  G.huntMapReady = true;
  if (!wasBlocked || !G.combat) return;
  const now = Date.now();
  for (const sp of G.combat.pendingSpawns || []) {
    if (sp && !sp.done && !(Number(sp.blink) > 0)) sp.startedAt = now;
  }
  if (typeof releaseHeldAuthoritySpawns === "function") releaseHeldAuthoritySpawns(G.combat, now);
}

function finishMapLoading() {
  // Invalida qualquer progresso atrasado da transição anterior. Sem isso,
  // um onload tardio pode reabrir o overlay depois de a hunt já ter iniciado.
  const generation = ++MAP_LOADING_GENERATION;
  const hide = () => {
    if (generation === MAP_LOADING_GENERATION) showGameLoading(false);
  };
  // Mantém os dois frames para uma transição suave, mas não depende deles:
  // DevTools aberto e abas em background podem suspender rAF indefinidamente.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(hide));
    setTimeout(hide, 120);
  } else setTimeout(hide, 0);
  // Última barreira para o caso observado em 184/184. Se algum scheduler ou
  // callback deixou o overlay visível na mesma geração, force o fechamento.
  setTimeout(() => {
    const el = document.getElementById('game-loading');
    if (el && el.style.display !== 'none' && generation === MAP_LOADING_GENERATION) {
      console.warn('[preload] fallback hide forçado');
      showGameLoading(false);
    }
  }, 350);
}

function preloadAssetPaths(paths, label, opts) {
  opts = opts || {};
  const list = [...new Set(paths || [])];
  if (!list.length) return Promise.resolve();
  const text = label || 'Carregando mapa';
  const generation = MAP_LOADING_GENERATION;
  const update = (loaded) => {
    if (generation !== MAP_LOADING_GENERATION) return;
    showGameLoading(true, `${text} ${loaded}/${list.length}`,
      loaded / list.length * 100);
  };
  // Atualiza o estágio antes do primeiro onload. Assim um asset lento não
  // deixa a tela presa visualmente na etapa anterior (fetch do OTBM).
  update(0);
  const timeoutMs = Math.max(1, Number(
    opts.timeoutMs !== undefined ? opts.timeoutMs :
    (typeof window !== 'undefined' && window.MAP_ASSET_TIMEOUT_MS)
  ) || 3000);
  let done = 0;
  return Promise.all(list.map((src) => new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (timedOut) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Não permita que um evento tardio conte a mesma imagem duas vezes.
      img.onload = null;
      img.onerror = null;
      // Libera também a fila de conexões: 184 assets da Cobra não podem
      // continuar pendentes e competir com os tiles visíveis do renderer.
      if (timedOut) {
        try { img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; }
        catch (_) {}
      }
      done++;
      update(done);
      resolve();
    };
    // Browsers podem manter Image pendente indefinidamente quando o servidor
    // local fecha uma conexão. O asset será requisitado novamente pelo
    // renderer, mas nunca poderá bloquear a entrada na hunt.
    const timer = setTimeout(() => finish(true), timeoutMs);
    img.onload = () => finish(false);
    img.onerror = () => finish(false);
    img.src = src;
  }))).then(() => undefined);
}

function addTileMapAssetPaths(paths, map) {
  if (!map || !map.leg) return paths;
  const ids = new Set();
  for (const key in map.leg) {
    const entry = map.leg[key] || {};
    for (const id of entry.v || []) ids.add(id);
    for (const id of entry.g || []) ids.add(id);
  }
  for (const id of ids) {
    paths.add('assets/tiles/' + id + '.png');
    if (typeof TILE_PATTERNS !== 'undefined' && TILE_PATTERNS[id])
      paths.add('assets/tiles/' + id + '_pattern.png');
    else if (typeof TILE_ANIM !== 'undefined' && TILE_ANIM[id])
      paths.add('assets/tiles/' + id + '_anim.png');
  }
  return paths;
}

function resolveHuntMap(hunt) {
  if (!hunt || typeof HUNTMAPS === 'undefined') return null;
  if (hunt.mapa && HUNTMAPS[hunt.mapa]) return HUNTMAPS[hunt.mapa];
  if (hunt.otbm && HUNTMAPS['otbm:' + hunt.otbm]) return HUNTMAPS['otbm:' + hunt.otbm];
  return null;
}

function warmHuntTileSprites(map) {
  if (!map || typeof TileSprites === 'undefined' || !TileSprites.get) return [];
  const ids = new Set();
  if (map.leg) {
    for (const key in map.leg) {
      const entry = map.leg[key] || {};
      for (const id of entry.v || []) ids.add(id);
      for (const id of entry.g || []) ids.add(id);
    }
  }
  const imgs = [];
  for (const id of ids) {
    const img = TileSprites.get(id, 0);
    if (img) imgs.push(img);
    if (typeof TILE_PATTERNS !== 'undefined' && TILE_PATTERNS[id] &&
        typeof TileSprites._patternSource === 'function')
      TileSprites._patternSource(id, 0, 0);
  }
  return imgs;
}

function waitForImages(imgs, timeoutMs) {
  const list = (imgs || []).filter(Boolean);
  if (!list.length) return Promise.resolve();
  const waitMs = Math.max(1, Number(timeoutMs) || 4000);
  return Promise.all(list.map((img) => new Promise((resolve) => {
    if (img.complete && img.naturalWidth) return resolve();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve();
    };
    const timer = setTimeout(finish, waitMs);
    img.onload = finish;
    img.onerror = finish;
  }))).then(() => undefined);
}

function preloadHuntMapAssets(hunt, label) {
  try {
    const paths = new Set();
    const map = resolveHuntMap(hunt);
    addTileMapAssetPaths(paths, map);
    for (const slug of (hunt && hunt.monsters) || []) {
      paths.add('assets/mob/' + slug + '.png');
      if (typeof IDLE_ANIMATIONS !== 'undefined' && IDLE_ANIMATIONS.monsters &&
          IDLE_ANIMATIONS.monsters[slug]) paths.add('assets/mob/' + slug + '.idle.png');
    }
    const huntTimeout = Math.max(6000, Number(
      typeof window !== 'undefined' && window.MAP_ASSET_TIMEOUT_MS
    ) || 3000);
    return preloadAssetPaths(paths, label || 'Preparando arena', { timeoutMs: huntTimeout })
      .then(() => waitForImages(warmHuntTileSprites(map), huntTimeout))
      .catch((error) => {
        console.warn('[preload] arena continuará sem esperar todos os assets:', error);
      });
  } catch (error) {
    console.warn('[preload] falha ao preparar lista de assets:', error);
    return Promise.resolve();
  }
}

function preloadGameAssets(p, label) {
  const paths = new Set([
    'assets/ground/city.png','assets/ground/cave.png','assets/ui/imbuement-machine.png',
    'assets/ui/conditions/cond-magic-shield.png','assets/effects/critical-heal-effect.png'
  ]);
  // Aparência atual + party inicial: evita frames brancos ao entrar.
  if (p && p.outfit && p.outfit.appearance) paths.add('assets/appearance/outfit/' + p.outfit.appearance + '.base.png');
  if (p && p.outfit && p.outfit.mount) paths.add('assets/appearance/mount/' + p.outfit.mount + '.base.png');
  // Sheets idle são separados dos frames de caminhada. Pré-carrega somente
  // os que a aparência atual realmente possui no DAT.
  if (p && typeof currentAppearance === 'function' && typeof idleAnimationMeta === 'function') {
    const appearance = (typeof activeAvatarAppearance === 'function' && activeAvatarAppearance(p)) || currentAppearance(p);
    const idle = appearance && idleAnimationMeta('outfits', appearance.id);
    if (appearance) {
      const addons = appearance.sexo === 'avatar' ? 0 : ((p.outfit && p.outfit.addons) || 0);
      const suffixes = [''];
      if (addons & 1) suffixes.push('-a1');
      if (addons & 2) suffixes.push('-a2');
      for (const suffix of suffixes) {
        paths.add('assets/appearance/outfit/' + appearance.id + suffix + '.base.png');
        if (appearance.sexo !== 'avatar')
          paths.add('assets/appearance/outfit/' + appearance.id + suffix + '.mask.png');
        if (idle) {
          paths.add('assets/appearance/outfit/' + appearance.id + suffix + '.idle.base.png');
          if (appearance.sexo !== 'avatar' && (!Array.isArray(idle.masks) || idle.masks.includes(suffix)))
            paths.add('assets/appearance/outfit/' + appearance.id + suffix + '.idle.mask.png');
        }
      }
    }
    const mount = typeof currentMount === 'function' ? currentMount(p) : null;
    if (mount) {
      paths.add('assets/appearance/mount/' + mount.id + '.base.png');
      if (idleAnimationMeta('mounts', mount.id))
        paths.add('assets/appearance/mount/' + mount.id + '.idle.base.png');
    }
  }
  const hunt = p && typeof GAMEDATA !== 'undefined' && GAMEDATA.hunts && GAMEDATA.hunts[p.hunt];
  if (hunt) for (const slug of hunt.monsters || []) paths.add('assets/mob/' + slug + '.png');
  // O templo é a primeira cena exibida: carregue todos os tiles antes de
  // remover o overlay para o mapa oficial não aparecer aos poucos.
  if (typeof CITY !== 'undefined' && CITY.officialTemple && CITY.map)
    addTileMapAssetPaths(paths, CITY.map);
  return preloadAssetPaths(paths, label || 'Carregando recursos');
}
