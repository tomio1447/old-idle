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

function otbmHuntLoadTimeoutMs() {
  return Math.max(1, Number(
    typeof window !== "undefined" && window.OTBM_HUNT_TIMEOUT_MS
  ) || 6000);
}

function reportOtbmLoading(hunt, stage, pct) {
  if (typeof showGameLoading !== "function") return;
  const name = (hunt && hunt.name) || (hunt && hunt.otbm) || "arena";
  showGameLoading(true, `${stage} ${name}...`, pct);
}

/* Converte zonas absolutas informadas pela hunt para coordenadas locais do
 * recorte OTBM. Isso permite usar coordenadas do RME/Canary sem modificar o
 * arquivo beta nem depender dos marcadores proprietários S/G. */
function applyHuntOtbmZones(map, hunt) {
  if (!map || !hunt) return map;
  const bounds = map.sourceBounds || {};
  const ox = Number(bounds.x !== undefined ? bounds.x : bounds.minX) || 0;
  const oy = Number(bounds.y !== undefined ? bounds.y : bounds.minY) || 0;
  const sameFloor = (z) => z === undefined || map.z === undefined || Number(z) === Number(map.z);
  const local = (point) => point && sameFloor(point.z)
    ? { x: Number(point.x) - ox, y: Number(point.y) - oy } : null;

  const spawn = local(hunt.otbmSpawn);
  if (spawn && spawn.x >= 0 && spawn.y >= 0 && spawn.x < map.w && spawn.y < map.h)
    map.spawn = spawn;

  const zone = hunt.otbmMobBounds;
  if (zone && sameFloor(zone.z)) {
    const start = local(zone);
    const width = Math.max(0, Math.floor(Number(zone.w) || 0));
    const height = Math.max(0, Math.floor(Number(zone.h) || 0));
    map.mob = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const px = start.x + x, py = start.y + y;
      if (px >= 0 && py >= 0 && px < map.w && py < map.h)
        map.mob.push({ x: px, y: py });
    }
  }
  return map;
}

/* Garante o huntMap da hunt carregado; chama done() SEMPRE (assincrono so
 * quando ainda nao tem cache). */
function huntMapFromOtbmAsync(hunt, done) {
  if (!hunt || !hunt.otbm) { done(); return; }
  const key = "otbm:" + hunt.otbm;
  // Fast-path: o mapa pré-compilado da Cobra já foi registrado por
  // cobra-bastion-map.js. Não exija nem execute fetch/OTBM.read nesse caso.
  if (typeof HUNTMAPS !== "undefined" && HUNTMAPS[key]) {
    hunt.mapa = key;
    done();
    return;
  }
  if (typeof OTBM === "undefined" || typeof fetch === "undefined") {
    done();
    return;
  }

  const loadingGeneration = () => typeof currentMapLoadingGeneration === "function"
    ? currentMapLoadingGeneration()
    : (typeof MAP_LOADING_GENERATION !== "undefined" ? MAP_LOADING_GENERATION : null);
  const entryGen = loadingGeneration();
  const reportGuarded = (stage, pct) => {
    if (loadingGeneration() === entryGen) reportOtbmLoading(hunt, stage, pct);
  };

  if (OTBM_HUNT_CACHE[hunt.otbm] === "loading") {
    reportGuarded("Aguardando mapa", 3);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (typeof HUNTMAPS !== "undefined" && HUNTMAPS[key]) {
        clearInterval(iv);
        hunt.mapa = key;
        done();
      } else if (OTBM_HUNT_CACHE[hunt.otbm] !== "loading" ||
                 Date.now() - t0 > otbmHuntLoadTimeoutMs()) {
        clearInterval(iv);
        done();
      }
    }, 60);
    return;
  }
  OTBM_HUNT_CACHE[hunt.otbm] = "loading";
  reportGuarded("Baixando mapa", 5);
  // Cache-busting: usa Date.now() para que CADA fetch bypass o cache HTTP
  // do navegador. Assim, ao editar o mapa no RME e dar F5, a versão
  // mais recente é sempre baixada. Para forçar reload sem F5, use
  // window.reloadMaps() ou Ctrl+Shift+R.
  var _otbmV = Date.now();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId;
  const timedOut = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error("timeout ao carregar OTBM"));
    }, otbmHuntLoadTimeoutMs());
  });
  const request = Promise.resolve().then(() => fetch(
    "maps/" + encodeURIComponent(hunt.otbm) + ".otbm?v=" + _otbmV,
    controller ? { signal:controller.signal } : undefined));
  // Nem fetch pendente nem parser/arquivo inválido podem deixar o overlay e
  // OTBM_HUNT_CACHE eternamente em "loading".
  Promise.race([request, timedOut])
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    })
    .then((buf) => {
      // Mesmo stale, continue a conversão e popule HUNTMAPS silenciosamente;
      // somente a atualização visual pertence à geração que iniciou a carga.
      reportGuarded("Montando mapa", 12);
      let mapa = OTBM.read(buf);
      if (hunt.otbmBounds && typeof OTBM.crop === "function") mapa = OTBM.crop(mapa, hunt.otbmBounds);
      applyHuntOtbmZones(mapa, hunt);
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
    })
    .finally(() => clearTimeout(timeoutId));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { huntMapFromOtbmAsync, applyHuntOtbmZones };
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
