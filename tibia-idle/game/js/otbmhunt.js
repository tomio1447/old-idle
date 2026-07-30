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
  fetch("maps/" + encodeURIComponent(hunt.otbm) + ".otbm")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const mapa = OTBM.read(buf);
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
