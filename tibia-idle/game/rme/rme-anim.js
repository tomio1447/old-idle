/*
 * rme-anim.js — animacao das sprites no editor de mapas (OTI RME).
 *
 * 1. PALETA: itens com animacao (window.TILE_ANIM / assets/tiles/<id>_anim.png)
 *    piscam na listagem, igual ao client.
 * 2. CANVAS: tiles animados do mapa (chao, agua, lava, fogo, cristais...)
 *    tocam a strip <id>_anim.png a cada frame, no mesmo ritmo do jogo.
 *
 * Carregado depois de rme.js via <script src="rme-anim.js"></script>.
 */
"use strict";

(function () {
  if (typeof window === "undefined") return;
  const TILE_ANIM = window.TILE_ANIM || {};
  const ANIM_DUR = 120; // ms por frame (mesmo do tilemap.js do jogo)

  /* Cache de <img> das strips de animacao */
  const stripCache = {};
  /* ids cuja strip <id>_anim.png NAO existe (404): nao animar e manter o
   * sprite estatico — a lista TILE_ANIM pode conter ids cuja strip ainda
   * nao foi copiada (atualizacao parcial), e o editor nao pode sumir com a
   * paleta nem com o mapa por causa disso. */
  const semStrip = {};
  function stripImg(id) {
    if (stripCache[id] !== undefined) return stripCache[id];
    const img = new Image();
    img.src = "../assets/tiles/" + id + "_anim.png";
    img.onerror = () => { semStrip[id] = true; };
    stripCache[id] = img;
    return img;
  }
  function meta(id) {
    if (semStrip[id]) return null;
    return (typeof TILE_ANIM !== "undefined" && TILE_ANIM[id]) || null;
  }

  /* ------------------------------------------------------------ paleta */
  /* Desenha o frame atual da strip num canvas 32x32 (icone da paleta). */
  function palIconCanvas(id, forcedFrame) {
    const a = meta(id);
    const img = stripImg(id);
    if (!a || !img || !img.complete || !img.naturalWidth) return null;
    const cv = document.createElement("canvas");
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const fr = forcedFrame === undefined ? Math.floor(performance.now() / ANIM_DUR) % a.af : forcedFrame % a.af;
    // conteudo dentro do tile, ancorado na base (como o client)
    const k = 32 / 32;
    const w = a.aw * k, h = a.ah * k;
    ctx.drawImage(img, fr * a.aw, 0, a.aw, a.ah,
                  (32 - w) / 2, 32 - h, w, h);
    return cv;
  }

  /* Paleta viva: a cada frame, os .pal-icon de ids animados ganham o frame
   * atual (via canvas -> dataURL). So roda quando a paleta esta visivel. */
  let palRunning = false;
  let lastPaletteFrame = -1;
  let forcePaletteFrame = true;
  const palFrameUrl = new Map();
  function paletteUrl(id, fr) {
    const key = id + ":" + fr;
    if (palFrameUrl.has(key)) return palFrameUrl.get(key);
    const cv = palIconCanvas(id, fr);
    if (!cv) return null;
    const url = "url(" + cv.toDataURL() + ")";
    palFrameUrl.set(key, url);
    return url;
  }
  function tickPalette() {
    const list = document.getElementById("pal-list");
    if (!list || list.offsetParent === null) { palRunning = false; return; }
    const now = Math.floor(performance.now() / ANIM_DUR);
    // Não percorre a paleta inteira a cada frame do browser. Só troca no
    // frame real da animação (120ms) ou após uma linha virtual ser reciclada.
    if (now !== lastPaletteFrame || forcePaletteFrame) {
      lastPaletteFrame = now;
      forcePaletteFrame = false;
      const icons = list.querySelectorAll(".pal-icon[data-anim]");
      for (const ic of icons) {
        const id = ic.dataset.anim;
        const a = meta(id);
        if (!a) { delete ic.dataset.anim; delete ic.dataset.fr; continue; }
        const fr = now % a.af;
        if (ic.dataset.fr === String(fr)) continue;
        const url = paletteUrl(id, fr);
        if (url) { ic.style.backgroundImage = url; ic.dataset.fr = fr; }
      }
    }
    requestAnimationFrame(tickPalette);
  }
  function ensurePaletteLoop() {
    if (palRunning) return;
    palRunning = true;
    requestAnimationFrame(tickPalette);
  }
  // Chamado pelo virtual scroller depois de trocar os elementos reciclados.
  window.__rmeRefreshPaletteAnims = () => { forcePaletteFrame = true; ensurePaletteLoop(); };

  /* ------------------------------------------------------------ canvas */
  /* Depois de um render() do rme.js, pinta as strips animadas por cima das
   * celulas que contem ids animados. */
  function paintAnims() {
    const cv = document.getElementById("cv");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!window.__rmeState) return;
    const state = window.__rmeState;
    const S = (typeof window.__rmeCellPx === "function")
      ? window.__rmeCellPx() : 64;
    const PS = (typeof window.__rmePadPx === "function")
      ? window.__rmePadPx() : 64;
    const now = Math.floor(performance.now() / ANIM_DUR);
    const seen = new Set();

    for (const key in state.cells) {
      const c = state.cells[key];
      if (!c) continue;
      const ids = [];
      if (c.g) ids.push(c.g);
      for (const it of c.items || []) ids.push(it);
      for (const id of ids) {
        if (seen.has(id)) continue;
        const a = meta(id);
        const img = stripImg(id);
        if (!a || !img || !img.complete || !img.naturalWidth) continue;
        seen.add(id);
        const [x, y] = key.split(",").map(Number);
        const fr = now % a.af;
        const k = S / 32;
        const w = a.aw * k, h = a.ah * k;
        const dx = PS + x * S, dy = PS + y * S;
        // desenha sobre o tile (chao) ou ancorado na base (deco)
        if (c.g === id) {
          ctx.drawImage(img, fr * a.aw, 0, a.aw, a.ah,
                        dx - (w - S), dy - (h - S), w, h);
        } else {
          ctx.drawImage(img, fr * a.aw, 0, a.aw, a.ah,
                        dx + (S - w) / 2, dy + S - h, w, h);
        }
      }
    }
  }

  /* Hook: chama paintAnims() depois de cada render() do rme.js. O rme.js
   * expoe window.__rmeAfterRender (se nao expuser, empilhamos um observer
   * no MutationObserver de status para nao quebrar). */
  function install() {
    if (typeof window.__rmeState === "undefined") {
      // rme.js ainda nao carregou: aguarda
      setTimeout(install, 120);
      return;
    }
    // hook de pos-render
    const orig = window.__rmeAfterRender || function () {};
    window.__rmeAfterRender = function () {
      orig();
      paintAnims();
      ensurePaletteLoop();
    };
    // marca os icones animados da paleta (feito pelo rme.js ao montar as
    // linhas; aqui apenas garantimos o atributo data-anim)
    const marca = () => {
      const list = document.getElementById("pal-list");
      if (!list) return;
      const icons = list.querySelectorAll(".pal-icon");
      for (const ic of icons) {
        if (ic.dataset.anim) continue;
        const id = parseInt(ic.closest(".pal-row").dataset.id, 10);
        if (meta(id)) ic.dataset.anim = id;
      }
      ensurePaletteLoop();
    };
    const obs = new MutationObserver(marca);
    const list = document.getElementById("pal-list");
    if (list) obs.observe(list, { childList: true, subtree: true });
    marca();
    ensurePaletteLoop();
  }
  install();
})();
