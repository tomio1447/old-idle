/*
 * otbmhunt.js — instancia de hunts a partir de mapas .otbm criados no
 * editor (game/rme/). O jogador escolhe a arena desenhando ela no editor
 * e salvando em game/maps/<nome>.otbm; a hunt aponta para o nome:
 *
 *     GAMEDATA.hunts["amazon-camp"].otbm = "amazoncamp_venore";
 *
 * O arquivo e baixado UMA vez (fetch), convertido para o formato que o
 * combate ja entende (rows + legenda — ver otbm.js/huntMapFromOtbm) e
 * cacheado em HUNTMAPS["otbm:<nome>"]. hunt.mapa passa a apontar para a
 * chave do cache, entao o resto do motor (paredes colidindo, marcador S
 * de spawn, zona G de monstros) funciona sem saber que veio de um .otbm.
 *
 * Se o arquivo nao existir / falhar, cai no cenario padrao/ascii sem
 * quebrar a hunt (log de aviso no console).
 */
"use strict";

const OTBM_HUNT_CACHE = {};   // nome -> "loading" | chave | null(erro)

/* Garante o huntMap da hunt carregado; chama done() SEMPRE (assincrono so
 * quando ainda nao tem cache). */
function huntMapFromOtbmAsync(hunt, done) {
  if (!hunt || !hunt.otbm || typeof OTBM === "undefined" ||
      typeof fetch === "undefined") { done(); return; }
  const key = "otbm:" + hunt.otbm;
  if (typeof HUNTMAPS !== "undefined" && HUNTMAPS[key]) {
    hunt.mapa = key;
    done();
    return;
  }
  if (OTBM_HUNT_CACHE[hunt.otbm] === "loading") {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (typeof HUNTMAPS !== "undefined" && HUNTMAPS[key]) {
        clearInterval(iv);
        hunt.mapa = key;
        done();
      } else if (OTBM_HUNT_CACHE[hunt.otbm] !== "loading" ||
                 Date.now() - t0 > 8000) {
        clearInterval(iv);
        done();
      }
    }, 60);
    return;
  }
  OTBM_HUNT_CACHE[hunt.otbm] = "loading";
  // Cache-busting: usa Date.now() para que CADA fetch bypass o cache HTTP
  // do navegador. Assim, ao editar o mapa no RME e dar F5, a versão
  // mais recente é sempre baixada. Para forçar reload sem F5, use
  // window.reloadMaps() ou Ctrl+Shift+R.
  var _otbmV = Date.now();
  fetch("maps/" + encodeURIComponent(hunt.otbm) + ".otbm?v=" + _otbmV)
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const mapa = OTBM.read(buf);
      // Alguns itens 2×2 da borda extrapolam visualmente seu SQM. O offset
      // é metadado da hunt (não altera o .otbm editável nem a colisão).
      mapa.idleOffsetX = Number(hunt.otbmOffsetX) || 0;
      mapa.idleOffsetY = Number(hunt.otbmOffsetY) || 0;
      const hm = OTBM.huntMapFromOtbm(mapa,
        (typeof TILEFLAGS !== "undefined") ? TILEFLAGS : {});
      if (typeof HUNTMAPS !== "undefined") HUNTMAPS[key] = hm;
      hunt.mapa = key;
      OTBM_HUNT_CACHE[hunt.otbm] = key;
      done();
    })
    .catch((e) => {
      console.warn("[otbm] falha ao carregar maps/" + hunt.otbm + ".otbm:", e);
      OTBM_HUNT_CACHE[hunt.otbm] = null;
      done();   // fallback: hunt sem cenario (comportamento antigo)
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { huntMapFromOtbmAsync };
}

/* ------------------------------------------------------------ Injector: reload manual de mapas */
/**
 * Limpa o cache de mapas .otbm e recarrega todos os mapas das hunts ativas.
 * Use: window.reloadMaps()  ou  Ctrl+Shift+R
 *
 * Se o jogador está em uma hunt com .otbm, o combate é reiniciado com o
 * mapa atualizado. Se está na cidade, só limpa o cache (a próxima hunt
 * já vai buscar o mapa novo).
 */
window.reloadMaps = function reloadMaps() {
  // Limpa cache de huntmaps OTBM
  const otbmKeys = Object.keys(HUNTMAPS).filter(k => k.startsWith("otbm:"));
  for (const k of otbmKeys) delete HUNTMAPS[k];
  // Limpa cache de loading/estado
  for (const k of Object.keys(OTBM_HUNT_CACHE)) delete OTBM_HUNT_CACHE[k];
  // Limpa cache de sprites de tile
  if (typeof TileSprites !== "undefined" && TileSprites.cache) TileSprites.cache = {};

  // Se o jogador está em hunt com .otbm, reinicia o combate com mapa atualizado
  const p = (typeof G !== "undefined" && G.p) ? G.p : null;
  if (p && p.hunt && G.inCity === false) {
    const hu = (typeof GAMEDATA !== "undefined") ? GAMEDATA.hunts[p.hunt] : null;
    if (hu && hu.otbm) {
      console.log("[injector] recarregando mapa .otbm:", hu.otbm);
      huntMapFromOtbmAsync(hu, () => {
        G.combat = newCombat(p, p.hunt, p.instanceMode);
        spawnWave(G.combat, p);
        if (typeof renderAll === "function") renderAll();
        if (typeof toast === "function") toast("🗺️ Mapa atualizado!");
        console.log("[injector] mapa recarregado com sucesso");
      });
      return;
    }
  }
  console.log("[injector] cache de mapas limpo. Próxima hunt usará o mapa atualizado.");
  if (typeof toast === "function") toast("🗺️ Cache de mapas limpo!");
};

// Atalho Ctrl+Shift+R para recarregar mapas manualmente
window.addEventListener("keydown", function(e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    e.stopPropagation();
    window.reloadMaps();
  }
});
