/*
 * render.js — desenha a cena de caca (chao, monstros, player, dano flutuante)
 */
"use strict";

/* escala do sprite do jogador na cena de caca (monstro comum usa 2.0) */
const PLAYER_SCALE = 1.8;

/* ---------------------------------------------------- escala por SQM
 *
 * O canvas exibe GRID_W SQMs de largura (dinâmico nas instâncias OTBM),
 * então um tile vale W/GRID_W pixels. As escalas eram números fixos
 * (2.0, 2.2, 2.6 conforme o HP
 * do monstro) sem nenhuma relacao com isso: em tela larga a criatura ficava
 * menor que o tile, em tela estreita transbordava por cima dos vizinhos.
 *
 * spriteScale() devolve a escala que faz a sprite caber EXATAMENTE em N
 * tiles, e nunca deixa passar disso. No Tibia uma criatura ocupa 1 SQM (as
 * grandes, 2), e a arte de 32px e desenhada dentro dele.
 */
function tilePx(W) { return W / (typeof GRID_W !== "undefined" ? GRID_W : 21); }

function spriteScale(W, img, tiles) {
  if (!img || !img.naturalWidth) return 1;
  const alvo = tilePx(W) * (tiles || 1);
  const maior = Math.max(img.naturalWidth, img.naturalHeight);
  // teto no tamanho do tile: a arte nunca invade o SQM do vizinho
  return Math.max(0.5, alvo / maior);
}

/* Escala do jeito que o Tibia faz de verdade.
 *
 * O client nao redimensiona a arte para "caber" no tile: um sprite mede 32px
 * e um SQM mede 32px, entao a escala e sempre a MESMA para todo mundo
 * (tile/32). Uma criatura grande usa uma arte de 64px e naturalmente ocupa
 * dois tiles, transbordando para cima e para a esquerda — e assim que um
 * dragao parece maior que um rato.
 *
 * O spriteScale() antigo dividia pelo maior lado do recorte, ou seja, cada
 * sprite ganhava uma escala diferente: recorte apertado virava sprite
 * gigante e recorte folgado virava sprite miuda. Era isso que deixava tudo
 * "fora de escala" comparado ao baiak-idle. */
const TIBIA_SPRITE = 32;

function tibiaScale(W) { return tilePx(W) / TIBIA_SPRITE; }

/* Overlay (nomes, healthbars, dano/cura) fica em pixels de tela.
 * FULLHD aumenta o backing store pelo DPR; sem esta escala a fonte 8–10px
 * e a barra 31×4 viram um terço do tamanho CSS e somem na caçada. */
function canvasHudScale(canvas) {
  const dpr = typeof clientDisplayDpr === "function"
    ? clientDisplayDpr()
    : Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  if (!canvas) return Math.max(1, dpr);
  const css = Number(canvas.clientWidth) || 0;
  const backing = Number(canvas.width) || 0;
  if (css > 0 && backing > 0) return Math.max(1, backing / css);
  return Math.max(1, dpr);
}
function hudFontPx(px, s) {
  return Math.max(1, Math.round(Number(px) * Math.max(1, Number(s) || 1)));
}
function hudFont(px, s, bold) {
  return (bold ? "bold " : "") + hudFontPx(px, s) + "px Verdana";
}
function floaterFont(f, s) {
  const spec = (f.kind === "damage" ? "8px" : (f.kind === "restore" ? "8px" : (f.big ? "bold 12px" : (f.small ? "5px" : "11px"))));
  const scale = Math.max(1, Number(s) || 1);
  if (scale === 1) return spec + " Verdana";
  return spec.replace(/(\d+)px/, (_, n) => hudFontPx(n, scale) + "px") + " Verdana";
}

/* O OTClient/Canary desenha outfit na escala nativa do tile: 32 px de arte
 * para 1 SQM. Escalar 1.18x fazia um outfit de 1 tile invadir o tile abaixo
 * e mascarava a âncora real usada pelo client. */
function creatureScale(W) { return tibiaScale(W); }

/* Conversão da nossa coordenada (CENTRO do SQM) para a origem de desenho
 * do OTClient (canto superior esquerdo da sprite). Para 1x1: top-left do
 * tile; para 2x2: desloca meio tile à esquerda e um tile para cima — mesma
 * regra do client: x=(width-1)/2 e y=(height-1). */
function creatureTileOrigin(centerX, centerY, width, height, tile, anchor, scale) {
  if (anchor && scale) {
    return {
      x: centerX + tile / 2 - anchor.sw * scale + anchor.ox * scale,
      y: centerY + tile / 2 - anchor.sh * scale + anchor.oy * scale,
    };
  }
  return { x: centerX - width / 2, y: centerY + tile / 2 - height };
}

/* MagicEffect / CONST_ME: mesma âncora de chão das criaturas (pé no fundo
 * do SQM, centro horizontal). Centralizar em Y fazia strips 64px (divine
 * barrage, critical hit) invadirem o tile SUL e parecerem "no SQM errado";
 * 32px (blood, yellow-rings) coincidia por acaso com o centro. */
function effectTileOrigin(centerX, centerY, drawW, drawH, tile) {
  const t = Math.max(1, Number(tile) || 32);
  return {
    x: centerX - drawW / 2,
    y: centerY + t / 2 - drawH,
  };
}

function markMonsterAnchor(canvas, slug, meta) {
  if (!canvas || !meta) return canvas;
  const all = (typeof CREATURE_ANCHORS !== "undefined" && CREATURE_ANCHORS) || {};
  const source = meta.sw ? meta : all[slug];
  if (source) {
    canvas._spriteAnchor = {
      sw:source.sw, sh:source.sh,
      ox:source.ox, oy:source.oy,
    };
  }
  return canvas;
}

/* Fila única de profundidade. Esta estrutura será a fonte de ordenação para
 * players, aliados e monstros, substituindo os três loops independentes. */
function buildRenderEntities(combat, player) {
  const out = [];
  if (!combat) return out;
  // Jogador inconsciente não é criatura ativa: some da fila e deixa apenas
  // o corpse oficial/contador até o revive.
  if (combat.player && player && player.hp > 0 && (!combat.player.p || combat.player.p.hp > 0)) out.push({ kind: "player", ent: combat.player, p: player,
    footY: combat.player.y || 0, id: "active" });
  if (combat.players && combat.players.length > 1) {
    for (const ent of combat.players) {
      if (ent === combat.player || !ent.p || ent.p.hp <= 0) continue;
      out.push({ kind: "ally", ent: ent, p: ent.p, footY: ent.y || 0, id: String(ent.id) });
    }
  }
  for (const mob of combat.mobs || []) {
    if (mob.hp <= 0) continue;
    out.push({ kind: "monster", ent: mob, p: null, footY: mob.y || 0, id: String(mob.id) });
  }
  // Painter order do Tibia: desenha as linhas de CIMA primeiro e as de BAIXO
  // por último. Assim quem tem os pés mais abaixo cobre corretamente quem
  // está acima — inclusive a parte alta de sprites 2x2 (ex.: cabeça do Demon)
  // não fica soterrada por um outfit cuja base está numa linha anterior.
  const order = { monster: 0, ally: 1, player: 2 };
  return out.sort((a, b) => a.footY - b.footY || order[a.kind] - order[b.kind]);
}

/* A paleta de cada criatura é composta na importação a partir da máscara do
 * DAT e dos lookHead/lookBody/lookLegs/lookFeet do Canary. Não use filtros
 * CSS/canvas: eles tingem sombras e transparências e descaracterizam a arte
 * oficial (em especial Rage Squid e Squid Warden). */
function drawMonsterSprite(ctx, img, x, y, w, h) {
  ctx.drawImage(img, x, y, w, h);
}

/* Versao dos assets. O navegador cacheia PNG de forma agressiva, entao
 * atualizar uma sprite no repositorio nao chegava em quem ja tinha aberto o
 * jogo — a arte antiga continuava aparecendo ate limpar o cache na mao.
 * Subir esse numero a cada lote de sprites novas forca o download. */
const ASSET_VERSION = "52";
/* Teto absoluto de vida visual: strip/meta errado ou dt travado nunca
 * pode deixar magia/areafx/fala grudados no canvas. */
const FX_MAX_LIFE_MS = 2800;
const TALK_MAX_LIFE_MS = 2000;

/* As telas montam HTML com <img src="assets/..."> direto, sem passar pelo
 * Sprites.get. Em vez de carimbar a versao em cada uma das ~30 ocorrencias
 * (e ter que lembrar disso em toda tag nova), um observer aplica o ?v= assim
 * que o elemento entra no DOM. */
if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  const carimbar = (img) => {
    const src = img.getAttribute("src");
    if (!src || src.indexOf("assets/") !== 0 || src.indexOf("?v=") !== -1) return;
    img.setAttribute("src", src + "?v=" + ASSET_VERSION);
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "IMG") carimbar(n);
        else if (n.querySelectorAll) n.querySelectorAll("img").forEach(carimbar);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

/* Linha do spritesheet por direcao, na ordem do client (igual a das outfits) */
const MOB_DIR_ROW = { n: 0, e: 1, s: 2, w: 3 };
/* Parado usa SOMENTE o frame group idle real do DAT. `MOBSHEETS.cols`
 * descreve pose 0 + caminhada e, portanto, nunca pode decidir animação idle.
 * Criaturas com apenas grupo moving ficam travadas corretamente na pose 0. */
function monsterIdleMeta(slug) {
  if (typeof idleAnimationMeta === "function")
    return idleAnimationMeta("monsters", slug);
  const all = (typeof IDLE_ANIMATIONS !== "undefined" && IDLE_ANIMATIONS.monsters) || {};
  return all[slug] && all[slug].frames > 1 ? all[slug] : null;
}

function monsterIdleFrame(slug, now, phase) {
  const meta = monsterIdleMeta(slug);
  if (!meta) return 0;
  const offset = (phase || 0) % (meta.duration || 1);
  return typeof idleAnimationFrame === "function"
    ? idleAnimationFrame(meta, now === undefined ? Date.now() : now, offset)
    : 0;
}

function monsterAnimationPhase(ent) {
  const text = String((ent && (ent.id || ent.slug)) || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
  return hash;
}

/* HTML de uma celula do sheet para as telas (bestiario, lista de caca...).
 *
 * As telas montavam <img src="assets/mob/<slug>_s.png">, mas os quadros
 * soltos deixaram de existir quando cada criatura virou um sheet unico.
 * Como <img> nao recorta, usamos uma div com background-position: o mesmo
 * arquivo serve a tela e o canvas, sem duplicar arte.
 *
 * opts.walkAnim: em cards/modais de boss, percorre o ciclo MOVING sul quando
 * o DAT nao tem idle real (ex.: Goshnar's Malice). Bestiário/caça default
 * permanece estático nestes casos — só anima com grupo idle oficial.
 */
function mobImg(slug, tam, extra, opts) {
  if (extra && typeof extra === "object" && opts == null) {
    opts = extra;
    extra = "";
  }
  opts = opts || {};
  const meta = (typeof MOBSHEETS !== "undefined" && MOBSHEETS)
    ? MOBSHEETS[slug] : null;
  const px = tam || 32;
  if (!meta) {
    // criatura sem sheet: espaco vazio, para o grid da tela nao quebrar
    return `<div class="mob-img" style="width:${px}px;height:${px}px;
            ${extra || ""}"></div>`;
  }
  const idle = monsterIdleMeta(slug);
  const walkAnim = !idle && !!opts.walkAnim && (meta.cols || 0) > 1;
  const visual = idle || meta;
  const frames = idle ? idle.frames : (walkAnim ? Math.max(1, meta.cols || 1) : 1);
  // Mesmo quando estática, a imagem principal continua sendo um sheet com
  // `meta.cols` colunas. Reduzir o background para uma coluna comprimia
  // todas as poses dentro do modal.
  const sourceFrames = idle ? idle.frames : Math.max(1, meta.cols || 1);
  // a celula do sul e a linha 2; escala para caber na caixa pedida
  const k = Math.min(px / visual.cw, px / visual.ch);
  const w = visual.cw * k, h = visual.ch * k;
  const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
  const animated = (idle || walkAnim) ? " mob-img-animated" : "";
  const sheetW = visual.cw * sourceFrames * k;
  const path = `assets/mob/${slug}${idle ? ".idle" : ""}.png?v=${v}`;
  // Idle usa as durações do DAT; walk-anim de modal usa o ritmo moving
  // típico dos Goshnar (300ms/quadro) para o ciclo não parecer corrida.
  const duration = idle ? idle.duration
    : (walkAnim ? Math.max(1, frames) * 300 : 0);
  return `<div class="mob-img${animated}" data-mob="${slug}" style="width:${w.toFixed(1)}px;
      height:${h.toFixed(1)}px;
      background-image:url('${path}');
      background-size:${sheetW.toFixed(1)}px ${(visual.ch * 4 * k).toFixed(1)}px;
      background-position:0 -${(2 * h).toFixed(1)}px;
      --mob-sheet-width:${sheetW.toFixed(1)}px;
      --mob-sheet-frames:${frames};
      --mob-sheet-duration:${duration}ms;
      image-rendering:pixelated;${extra || ""}"></div>`;
}

/* Retrato de boss em modal/card: idle real quando existir; senão walk sul. */
function bossMobImg(slug, tam, extra) {
  return mobImg(slug, tam, extra, { walkAnim: true });
}


/* Skills Canary às vezes pedem "fire-wave"/"ice-wave"; o strip DAT é *-area. */
const FX_NAME_REMAP = { "fire-wave": "fire-area", "ice-wave": "ice-area" };
function resolveFxName(name) {
  return FX_NAME_REMAP[name] || name;
}

function fxClientMeta(name) {
  const aliases = (typeof window !== "undefined" && window.FX_OFFICIAL_ALIASES) || {};
  const all = (typeof window !== "undefined" && window.CLIENT_EFFECTS) || {};
  const key = aliases[resolveFxName(name)] || resolveFxName(name);
  return all[key] || null;
}

/* Sprites que vivem em assets/effects (wiki/DAT) e não no extrator clássico assets/fx. */
const FX_EFFECT_FILES = {
  "chivalrous-challenge": "assets/effects/chivalrous-challenge.png",
  "challenge-effect": "assets/effects/challenge-effect.png",
  "forked-glacier-effect": "assets/effects/forked-glacier-effect.png",
  "forked-thorns-effect": "assets/effects/forked-thorns-effect.png",
  "chain-effect-blue": "assets/effects/chain-effect-blue.png",
  "chain-effect-green": "assets/effects/chain-effect-green.png",
};

function fxFrameCount(name) {
  const meta = fxClientMeta(name);
  if (meta && meta.frames) return meta.frames;
  return FX_FRAMES[name] || 0;
}

/* Duração automática do strip: percorre TODOS os frames na cadência do
 * OTClient (~55–85ms/quadro). O meta.duration da TibiaWiki é o delay médio
 * do GIF — em vários efeitos de combate (blue electricity, explosion-hit
 * white, fire/energy area) ele fica em 120–200ms e a magia parece arrastar
 * ou "truncar" o ritmo. Mantém o ciclo completo; só limita a velocidade. */
function fxPerFrameMs(name, frames) {
  const meta = fxClientMeta(name);
  const n = Math.max(1, frames | 0);
  let per = 75;
  if (meta && meta.duration > 0) {
    const d = Number(meta.duration) || 0;
    // Se duration*frames estoura, duration já é o tempo total do strip.
    if (d > 250 && d * n > 4000) per = d / n;
    else per = d;
  }
  const key = String((meta && meta.slug) || name || "").toLowerCase();
  // Diamond arrow, exori/groundshaker, waves/beams/caldera do RP.
  const combatFx = /blue-electric|hit-area|explosion-hit-white|groundshaker|trembl|holy-cross|holy-effect|holy-area|holy-damage|fire-area|fire-effect|fireball|fire-attack|energy-area|energy-effect|energy-hit|ice-area|ice-attack|icicle|mort-area|death-effect|explosion-area|explosion-effect/.test(key);
  // ~75ms/quadro (OTClient). Wiki GIFs de combate costumam vir mais lentos.
  if (combatFx) return Math.max(55, Math.min(75, per));
  return Math.max(45, Math.min(120, per));
}

function fxAutoDurationMs(name, frames) {
  const n = Math.max(1, Math.min(48, frames | 0));
  return Math.min(FX_MAX_LIFE_MS, Math.max(280, Math.round(n * fxPerFrameMs(name, n))));
}

function fxEffectExpired(e, now) {
  if (!e) return true;
  if ((Number(e.delayUntil) || 0) > now) return false;
  const dur = Math.max(1, Number(e.dur) || FX_MAX_LIFE_MS);
  const born = Number(e.born) || 0;
  if (born && (now - born) > dur + 200) return true;
  const t = Number(e.t);
  return Number.isFinite(t) && t >= dur;
}

function fxStripCellWidth(img, frames, meta) {
  if (meta && meta.width > 0) return meta.width;
  return (img && img.naturalWidth ? img.naturalWidth : 32) / Math.max(1, frames | 0);
}

const Sprites = {
  cache: {},
  get(path) {
    if (this.cache[path] !== undefined) return this.cache[path];
    const img = new Image();
    img.src = path + (path.indexOf("?") === -1 ? "?v=" + ASSET_VERSION : "");
    img.onerror = () => { this.cache[path] = null; };
    this.cache[path] = img;
    return img;
  },
  /* Recorta a celula (direcao, pose) do spritesheet da criatura.
   *
   * Cada monstro virou UM arquivo (3 poses x 4 direcoes) em vez de 12 PNGs
   * soltos: com 1566 criaturas eram 18.760 arquivos, o que estourava o teto
   * do workspace e abria uma requisicao por quadro. O recorte e cacheado,
   * entao o custo existe uma vez por celula usada.
   */
  mobCache: {},
  mobCell(slug, dir, pose) {
    const meta = (typeof MOBSHEETS !== "undefined" && MOBSHEETS)
      ? MOBSHEETS[slug] : null;
    if (!meta) return null;
    const linha = MOB_DIR_ROW[dir] === undefined ? 2 : MOB_DIR_ROW[dir];
    const col = Math.max(0, Math.min((meta.cols || 3) - 1, pose | 0));
    const k = slug + "|" + linha + "|" + col;
    if (this.mobCache[k] !== undefined) return this.mobCache[k];
    const sheet = this.get(`assets/mob/${slug}.png`);
    // enquanto o sheet carrega devolvemos null SEM cachear, senao a
    // criatura ficaria invisivel pelo resto da sessao
    if (!sheet || !sheet.complete) return null;
    // Se naturalWidth ainda 0 pode ser erro temporário de decode; não cacheia
    // null permanente para permitir retry e evitar sumiço definitivo.
    if (!sheet.naturalWidth) return null;
    const cv = document.createElement("canvas");
    cv.width = meta.cw; cv.height = meta.ch;
    cv.getContext("2d").drawImage(sheet, col * meta.cw, linha * meta.ch,
                                  meta.cw, meta.ch, 0, 0, meta.cw, meta.ch);
    markMonsterAnchor(cv, slug, meta);
    this.mobCache[k] = cv;
    return cv;
  },
  mobIdleCache: {},
  mobIdle(slug, dir, frame) {
    const meta = monsterIdleMeta(slug);
    if (!meta) return null;
    const linha = MOB_DIR_ROW[dir] === undefined ? 2 : MOB_DIR_ROW[dir];
    const col = Math.max(0, Math.min(meta.frames - 1, frame | 0));
    const key = slug + "|" + linha + "|" + col;
    if (this.mobIdleCache[key] !== undefined) return this.mobIdleCache[key];
    const sheet = this.get(`assets/mob/${slug}.idle.png`);
    if (!sheet || !sheet.complete) return null;
    if (!sheet.naturalWidth) return null;
    const cv = document.createElement("canvas");
    cv.width = meta.cw; cv.height = meta.ch;
    cv.getContext("2d").drawImage(sheet,
      col * meta.cw, linha * meta.ch, meta.cw, meta.ch,
      0, 0, meta.cw, meta.ch);
    markMonsterAnchor(cv, slug, meta);
    this.mobIdleCache[key] = cv;
    return cv;
  },
  mob(slug, dir) { return this.mobCell(slug, dir || "s", 0); },
  /* Frame de caminhada do monstro. pose 1 e 2 sao os passos do grupo de
   * animacao do DAT; qualquer outro valor cai na pose parada. */
  mobWalk(slug, dir, frame) {
    return this.mobCell(slug, dir || "s", frame || 0);
  },
  item(slug) { return this.get(`assets/item/${slug}.png`); },
  outfit(name, dir) { return this.get(`assets/outfit/${name}_${dir || "s"}.png`); },
  ground(scene) { return this.get(`assets/ground/${scene}.png`); },
  fx(name) {
    name = resolveFxName(name);
    const meta = fxClientMeta(name);
    if (meta && meta.path) return this.get(meta.path);
    if (FX_EFFECT_FILES[name]) return this.get(FX_EFFECT_FILES[name]);
    return this.get(`assets/fx/${name}.png`);
  },
  missile(name, dir) { return this.get(`assets/missile/${name}_${dir || "e"}.png`); },
  npc(name, dir) { return this.get(`assets/npc/${name}_${dir || "s"}.png`); },
  deco(name) { return this.get(`assets/npc/deco-${name}.png`); },
  /* frame de caminhada: f=0 parado, f=1|2 passos */
  walk(name, dir, f) {
    const suf = f ? `${dir}${f}` : dir;
    return this.get(`assets/outfit/${name}_${suf}.png`);
  },
};

const FX_FRAMES = {
  "big-clouds": 14, "block-hit": 3, "blow-blue": 11, "blow-green": 11,
  "blow-pink": 11, "blow-white": 10, "bubbles": 15, "claw-green": 8,
  "claw-pink": 8, "claw-white": 8, "draw-blood": 4, "energy-area": 8,
  "energy-damage": 10, "explosion-area": 6, "explosion-hit": 6,
  "fire-area": 8, "fire-attack": 8, "green-rings": 7, "groundshaker": 7,
  "hearts": 8, "hit-area": 8, "hit-by-fire": 5, "hit-by-poison": 4,
  "holy-damage": 5, "ice-area": 9, "ice-attack": 8, "ice-tornado": 9,
  "lose-energy": 4, "magic-blue": 5, "magic-green": 5, "magic-red": 5,
  "mort-area": 8, "outburst-green": 15, "outburst-pink": 15,
  "outburst-white": 15, "poff": 4, "poison-area": 4, "pulse-green": 11,
  "pulse-pink": 11, "pulse-white": 11, "purple-energy": 10, "sleep": 8,
  "small-clouds": 6, "small-plants": 11, "sound-blue": 10, "sound-green": 10,
  "sound-purple": 10, "sound-red": 10, "sound-white": 10, "sound-yellow": 10,
  "stones": 8, "stun": 9, "teleport": 8, "watercreature": 16,
  "whirlwind-green": 8, "whirlwind-pink": 8, "whirlwind-white": 8,
  "white-energy-spark": 6, "yellow-energy": 10, "yellow-rings": 7,
  // Exeta Amp Res (Chivalrous Challenge, CONST_ME_CHIVALRIOUS_CHALLENGE=219)
  // — anel de energia roxo/azul extraído do DAT 15.x (8 quadros)
  "chivalrous-challenge": 8,
  // Exeta Res (CONST_ME_MAGIC_BLUE no lua; sprite wiki Challenge Effect)
  "challenge-effect": 9,
  // efeitos que algumas magias pedem e nao estavam no extrator antigo
  // (extraidos por tools/extract_fx_faltantes.py)
  "energy-hit": 10, "carniphila": 8, "holy-area": 11,
  "whirlwind-blow-white": 8,
  // ---- efeitos classicos que so existiam como slug nas skills dos
  // monstros do Canary (caiam no fallback draw-blood). GIFs oficiais da
  // TibiaWiki (fandom) -> tira horizontal, mesmo formato dos demais:
  "big-plants": 18,    // Large Plant Effect (CONST_ME_BIGPLANTS), 96px
  "giant-ice": 13,     // Ice Explosion Effect (CONST_ME_GIANTICE), 64px
  "plant-attack": 13,  // Plant Effect (CONST_ME_PLANTATTACK), 64px
  "water-splash": 10,  // Water Splash Effect (CONST_ME_WATERSPLASH), 64px
  "green-smoke": 7,    // Green Smoke Effect (tibiawiki.com.br)
  "purple-smoke": 7,   // Purple Smoke Effect (tibiawiki.com.br)
  // ---- Update 15.25.3a4a52 (Vocation Balancing): efeitos Effect_318 a
  // Effect_349 extraidos da tibiawiki (GIF animado -> tira horizontal).
  // O mapeamento para as magias foi feito pelo aspecto visual do efeito:
  "stance-blood-rage": 11,      // civel vermelho (Effect 334)
  "stance-protector": 11,       // escudo branco (Effect 318)
  "stance-sharpshooter": 12,    // corte teal (Effect 320)
  "stance-divine-defiance": 11, // gesto sagrado (Effect 327)
  "stance-master-flames": 11,   // anel de fogo (Effect 329)
  "stance-master-thunder": 8,   // raio rosa (Effect 333)
  "stance-master-decay": 11,    // civel roxo (Effect 335)
  "stance-sapped-strength": 8,  // anel escuro (Effect 347)
  "stance-exposed-weakness": 8, // anel roxo (Effect 348)
  "stance-shared-conservation": 11, // gesto verde (Effect 328)
  "stance-elemental-synthesis": 11, // gesto brasa (Effect 326)
  "bash-shield": 12,            // corte de fogo (Effect 319)
  "slam-shield": 8,             // golpe laranja (Effect 323)
  // Barrages do 15.25 com o efeito OFICIAL (a numeracao Effect_3xx era
  // chute pelo visual): as cenas da TibiaWiki de Divine/Ethereal Barrage
  // mostram uma chuva de lancas caindo do ceu do tile em toda a area (21
  // sqm) — Divine_Barrage_Effect.gif / Ethereal_Barrage_Effect.gif do
  // fandom, tira de 12 quadros a 64px.
  "barrage-divine": 12,         // chuva sagrada (Divine_Barrage_Effect)
  "barrage-ethereal": 12,       // chuva eteria (Ethereal_Barrage_Effect)
  "divine-barrage-effect": 12,
  "ethereal-barrage-effect": 12,
  "divine-grenade-effect": 7,
  "thousand-fist-effect": 12,
  // Impacto em area da Diamond Arrow: a nota oficial do item registra
  // "[Blue Electricity Effects] appears on the damage area". O areaFx
  // importado pelo elemento fisico caiu no "energy-hit" antigo — sprite em
  // assets/fx/blue-electricity.png (Blue_Electricity_Effect.gif do fandom,
  // 18 quadros de 32px).
  "forked-glacier": 13,         // garra eletrica (Effect 324)
  "forked-glacier-effect": 13,
  "forked-thorns": 19,          // rajada terrosa (Effect 325)
  "forked-thorns-effect": 19,
  "chain-effect-blue": 7,
  "chain-effect-green": 7,
  "death-echo": 9,              // fantasma roxo (Effect 332)
  "fist-thousand": 8,           // corte sombrio (Effect 321)
  "crit-text": 14,              // "CRIT!" (Effect 341)
  "fatal-text": 4,              // "FATAL!" / Onslaught Effect
  "mana-wisp": 14,              // vivacidades de mana (Effect 337)
  "blue-electricity": 18,       // Blue Electricity Effect (diamond arrow)
  "blue-electricity-effect": 18,
};

/* Projeteis do Tibia: cada tipo tem 8 direcoes de voo. */
const MISSILE_DIRS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

function missileDir(sx, sy, tx, ty) {
  // angulo -> uma das 8 direcoes desenhadas
  const ang = Math.atan2(ty - sy, tx - sx);
  const i = Math.round(ang / (Math.PI / 4));
  return MISSILE_DIRS[((i % 8) + 8) % 8];
}
function Renderer(canvas) {
  this.c = canvas;
  this.ctx = canvas.getContext("2d");
  // Upgrade visual (v29): renderiza em devicePixelRatio (máx. 2x) para o
  // canvas ter o DOBRO de resolução do CSS, e desenha com
  // imageSmoothingEnabled=false (nearest) — pixel art NÍTIDO, sem o blur
  // que o bilinear da v27 causava. O navegador faz o downscale 2:1 do
  // canvas para o tamanho CSS (#scene image-rendering:auto), então o
  // resultado é nítido E sem serrilhado (o serrilhado antigo vinha do
  // canvas 1x esticado pelo CSS).
  this.ctx.imageSmoothingEnabled = false;
  this.floaters = [];       // numeros de dano
  this.effects = [];        // animacoes de efeito
  this.projectiles = [];    // projeteis/distance shots
  this.corpses = [];
  this.playerFlash = 0;
  this.scale = 2;
}

function gcdInt(a, b) {
  a = Math.abs(a | 0); b = Math.abs(b | 0);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

Renderer.prototype.resize = function () {
  const parent = this.c.parentElement;
  const parentW = parent ? parent.clientWidth : this.c.clientWidth;
  // A janela mantém a proporção clássica 21×13. Hunts maiores usam essa
  // janela como FOV fixo, sem reduzir o tamanho dos tiles.
  const fullhd = typeof ClientSettings !== "undefined" && !!ClientSettings.fullhd;
  const dpr = typeof clientDisplayDpr === "function"
    ? clientDisplayDpr()
    : Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  let cssW, cssH;
  if (fullhd) {
    // Tile CSS inteiro × DPR inteiro: backing store múltiplo de 21×13.
    // Alinha ao sprite 32px quando cabe, para o blit nearest não “quadricular”.
    let cssTile = Math.max(1, Math.floor(parentW / 21));
    const step = 32 / gcdInt(32, dpr | 0 || 1);
    const aligned = Math.floor(cssTile / step) * step;
    if (aligned >= 1) cssTile = aligned;
    cssW = cssTile * 21;
    cssH = cssTile * 13;
    this.c.style.width = cssW + "px";
    this.c.style.height = cssH + "px";
  } else {
    this.c.style.width = "";
    this.c.style.height = "";
    cssW = parentW;
    cssH = Math.round(parentW * (13 / 21));
  }
  const nw = Math.max(1, Math.round(cssW * dpr));
  const nh = Math.max(1, Math.round(cssH * dpr));
  if (this.c.width !== nw || this.c.height !== nh) {
    this.c.width = nw;
    this.c.height = nh;
  }
  if (typeof setCanvasNearest === "function") setCanvasNearest(this.ctx);
  else this.ctx.imageSmoothingEnabled = false;
};

/* Floating damage — replicando Canary/OTClient AnimatedText
 * Ajustado para hunts de alta densidade como MOTA: duração menor e subida mais rápida
 * para evitar mural de números que polui a tela (print do usuário)
 */
const FLOATER_MAX_LIFE = 1200;
const ANIMATED_TEXT_DURATION = 900;
function floaterAlphaCanary(p, t, tf) {
  const t0 = tf / 1.2;
  if (t <= t0) return 1;
  return Math.max(0, 1 - (t - t0) / (tf - t0));
}
function floaterAlpha(p) {
  return Math.max(0, Math.pow(1 - p, 1.35));
}
function mergeFloaterText(prev, next) {
  const t1 = String(prev || "").trim(), t2 = String(next || "").trim();
  if (!/^[+\-]?\d/.test(t1) || !/^[+\-]?\d/.test(t2)) return null;
  const n1 = parseInt(t1.replace(/[^0-9\-]/g, ""), 10);
  const n2 = parseInt(t2.replace(/[^0-9\-]/g, ""), 10);
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return null;
  const sum = n1 + n2;
  if (t1.startsWith("+") || t2.startsWith("+")) return "+" + Math.abs(sum);
  return "-" + Math.abs(sum);
}

Renderer.prototype.addFloater = function (x, y, text, color, big, small, kind, comboKey) {
  const life = kind === "damage" ? 900 : (kind === "restore" ? 800 : (big ? 1100 : 1000));
  const now = Date.now();
  const tryMerge = (f) => {
    const elapsed = f.max - f.life;
    if (elapsed > f.max / 2.5) return null;
    const merged = mergeFloaterText(f.text, text);
    if (merged == null) return null;
    f.text = merged;
    f.life = Math.max(f.life, life * 0.7);
    return f;
  };
  // Combo Canary: mesmo alvo + mesmo elemento soma o número, mesmo com
  // pequeno deslocamento (parcela dual da arma / dois personagens).
  if (comboKey) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      if (f.comboKey === comboKey && f.kind === kind) {
        const hit = tryMerge(f);
        if (hit) return hit;
      }
    }
  }
  let stackOffsetY = 0;
  for (let i = this.floaters.length - 1; i >= 0; i--) {
    const f = this.floaters[i];
    const dx = Math.abs(f.x - x), dy = Math.abs(f.y - y);
    if (dx > 0.08 || dy > 0.08) continue;
    if (!comboKey && f.color === color && f.kind === kind) {
      const hit = tryMerge(f);
      if (hit) return hit;
    }
    if (!stackOffsetY) {
      const elapsed = f.max - f.life;
      const yOff = 14 - 48 * (elapsed / f.max);
      stackOffsetY = (f.offsetY || 0) + yOff;
    }
  }
  if (stackOffsetY > 48) stackOffsetY = 48;
  if (stackOffsetY < 0) stackOffsetY = 0;

  const floater = {
    x: x, y: y, text: text, color: color,
    life: life, max: life,
    big: !!big,
    small: !!small,
    kind: kind || "",
    comboKey: comboKey || "",
    vx: 0,
    vy: -64,
    spawnTime: now,
    offsetX: (Math.random() - 0.5) * 4,
    offsetY: -stackOffsetY,
  };
  this.floaters.push(floater);
  const limit = kind === "damage" ? 16 : 24;
  while (this.floaters.length > limit) {
    let idx = this.floaters.findIndex(f => f.kind === kind);
    if (idx === -1) idx = 0;
    this.floaters.splice(idx, 1);
  }
  return floater;
};

/* Fala de criatura, no modelo do internalCreatureSay do Canary.
 *
 * O servidor distingue tipos de fala (utils_definitions.hpp):
 *   TALKTYPE_SAY (1)            jogador falando normal
 *   TALKTYPE_SPELL_USE (9)      as palavras magicas
 *   TALKTYPE_MONSTER_SAY (36)   fala comum de monstro
 *   TALKTYPE_MONSTER_YELL (37)  grito, que o client mostra em CAIXA ALTA
 *
 * Antes havia uma unica fila global presa ao jogador: o monstro nao tinha
 * como falar e tudo saia amarelo acima do personagem. Agora cada criatura
 * carrega a propria fila e o texto e desenhado sobre ela.
 */
const TALK = {
  SAY: 1, SPELL: 9, MONSTER_SAY: 36, MONSTER_YELL: 37,
};

/* Cor por tipo, seguindo o client: amarelo para o jogador, laranja para o
 * grito de monstro e branco-cinza para a fala comum de monstro. */
const TALK_COR = {
  1: "#ffe680", 9: "#ffe680", 36: "#c8c8c8", 37: "#ff8a3c",
};

/* Palavras mágicas e falas de combate também são texto flutuante: em idle
 * desaparecem durante a subida e nunca ficam mais de 2 segundos na tela. */
function talkDuracao(tipo) {
  return tipo === TALK.MONSTER_YELL ? TALK_MAX_LIFE_MS : 1600;
}

/* Deadline absoluto (wall-clock). Sem isso, life infinito / dt=0 / entidade
 * fora do FOV deixava "exori gran" grudado no canvas para sempre. */
function ensureTalkDeadline(sp, now) {
  if (!sp || typeof sp !== "object") return 0;
  now = Number(now) || Date.now();
  const max = Math.max(1, Math.min(TALK_MAX_LIFE_MS,
    Number(sp.max) || talkDuracao(sp.tipo)));
  sp.max = max;
  let born = Number(sp.born);
  if (!Number.isFinite(born) || born <= 0) {
    born = now;
    sp.born = born;
  }
  let exp = Number(sp.expiresAt);
  if (!Number.isFinite(exp) || exp <= born) {
    exp = born + max;
    sp.expiresAt = exp;
  }
  const hard = born + TALK_MAX_LIFE_MS + 200;
  if (exp > hard) {
    exp = hard;
    sp.expiresAt = hard;
  }
  return exp;
}

function talkExpired(sp, now) {
  if (!sp || typeof sp !== "object" || !sp.text) return true;
  now = Number(now) || Date.now();
  const exp = ensureTalkDeadline(sp, now);
  if (now >= exp) {
    sp.life = 0;
    return true;
  }
  // life acompanha o relógio — opacity correta mesmo se dt não envelhecer.
  sp.life = Math.max(0, exp - now);
  return sp.life <= 0;
}

function ageTalkEntry(sp, dt, now) {
  // Wall-clock (expiresAt) é a fonte da verdade — dt só existe por compat.
  void dt;
  return talkExpired(sp, now || Date.now());
}

/* Empilha uma fala num dono qualquer (jogador ou monstro).
 * `dono` e o objeto da criatura; guardamos a fila nele mesmo para a fala
 * acompanhar quem falou enquanto a criatura anda. */
function creatureSay(dono, texto, tipo) {
  if (!dono || !texto) return;
  tipo = tipo || TALK.SAY;
  // Uma conjuração = um bubble. Nunca concatena palavras de magias
  // diferentes no mesmo texto (ex.: "exori gran" + "exevo mas san").
  let text = String(texto).replace(/\s+/g, " ").trim();
  if (!text) return;
  if (text.length > 64) text = text.slice(0, 64);
  if (!Array.isArray(dono.speech)) dono.speech = [];
  const now = Date.now();
  // Descarta falas já vencidas antes de empilhar (evita fila zumbi).
  for (let i = dono.speech.length - 1; i >= 0; i--) {
    if (talkExpired(dono.speech[i], now)) dono.speech.splice(i, 1);
  }
  // empurra as falas antigas para cima, como no client
  for (const sp of dono.speech) {
    if (sp && typeof sp === "object") sp.slot = (sp.slot || 0) + 1;
  }
  const dur = talkDuracao(tipo);
  dono.speech.push({
    // o client mostra o grito em caixa alta
    text: tipo === TALK.MONSTER_YELL ? text.toUpperCase() : text,
    tipo: tipo, color: TALK_COR[tipo] || "#ffe680",
    life: dur, max: dur, slot: 0, born: now, expiresAt: now + dur,
  });
  while (dono.speech.length > 2) dono.speech.shift();
}

/* Envelhece falas mesmo se a criatura não for desenhada neste frame
 * (fora do FOV / pause parcial) — senão o texto amarelo fica eterno. */
function ageCreatureSpeech(dono, dt, now) {
  if (!dono || !Array.isArray(dono.speech) || !dono.speech.length) return;
  now = now || Date.now();
  for (let i = dono.speech.length - 1; i >= 0; i--) {
    if (ageTalkEntry(dono.speech[i], dt, now)) dono.speech.splice(i, 1);
  }
}

/* Desenha a fila de falas. Com `dt` numérico envelhece aqui; com `dt == null`
 * assume que ageCombatSpeech / ageCreatureSpeech já consumiu o frame. */
function drawCreatureSpeech(ctx, dono, x, y, dt, hudScale) {
  if (!dono || !Array.isArray(dono.speech) || !dono.speech.length) return;
  const s = Math.max(1, Number(hudScale) || 1);
  const now = Date.now();
  const ageHere = dt != null && Number.isFinite(Number(dt));
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  for (let i = dono.speech.length - 1; i >= 0; i--) {
    const sp = dono.speech[i];
    if (ageHere && ageTalkEntry(sp, dt, now)) { dono.speech.splice(i, 1); continue; }
    if (talkExpired(sp, now)) { dono.speech.splice(i, 1); continue; }
    if (!sp || !sp.text) continue;
    // o grito e maior, como no client
    ctx.font = hudFont(sp.tipo === TALK.MONSTER_YELL ? 12 : 10, s, true);
    const max = Math.max(1, Number(sp.max) || 1);
    const lifeLeft = Math.max(0, Math.min(max, Number(sp.life) || 0));
    const p = Math.max(0, Math.min(1, 1 - lifeLeft / max));
    const a = Math.max(0, Math.pow(1 - p, 1.35));
    if (a <= 0.02) { dono.speech.splice(i, 1); continue; }
    const ty = y - 34 * s - (sp.slot || 0) * 13 * s - p * 10 * s;
    ctx.globalAlpha = a;
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = "rgba(0,0,0,.9)";
    ctx.strokeText(sp.text, x, ty);
    ctx.fillStyle = sp.color;
    ctx.fillText(sp.text, x, ty);
    ctx.globalAlpha = 1;
  }
}

/* Compatibilidade: a fala do jogador continua entrando pelo renderer, mas
 * agora e so um atalho para a fila do proprio jogador. */
Renderer.prototype.addSpeech = function (text, color, tipo) {
  this.playerTalk = this.playerTalk || {};
  creatureSay(this.playerTalk, text, tipo || TALK.SPELL);
  if (color) {
    const ls = this.playerTalk.speech;
    ls[ls.length - 1].color = color;
  }
};

Renderer.prototype.drawSpeech = function (ctx, x, y, dt, hudScale) {
  drawCreatureSpeech(ctx, this.playerTalk, x, y, dt, hudScale);
};

Renderer.prototype.addEffect = function (x, y, name, customDurMs, customScale, comboKey, delayMs) {
  name = resolveFxName(name);
  let n = fxFrameCount(name);
  if (!n) { name = "draw-blood"; n = fxFrameCount(name) || 4; }
  const meta = fxClientMeta(name);
  const metaFrames = Math.max(1, (meta && meta.frames) || n || 1);
  // Se o PNG já carregou, só confia no strip quando bate com o meta.
  // Strip 69×32px com meta 23×96 (ice-crystal) rasgava o quadro no chão e
  // inflava a duração — FX “congelado” / cristalino serrilhado.
  const img = Sprites.fx(name);
  if (img && img.complete && img.naturalWidth && meta && meta.width > 0) {
    const fromStrip = Math.max(1, Math.round(img.naturalWidth / meta.width));
    if (fromStrip > 1 && Math.abs(fromStrip - metaFrames) <= 2) n = fromStrip;
    else n = metaFrames;
  } else {
    n = metaFrames;
  }
  n = Math.max(1, Math.min(48, n | 0));
  const autoDur = fxAutoDurationMs(name, n);
  const custom = Number(customDurMs);
  const dur = Math.min(FX_MAX_LIFE_MS, Math.max(280,
    Number.isFinite(custom) && custom > 0 ? custom : autoDur));
  const now = Date.now();
  // Combo de impacto: mesmo alvo + mesmo FX na janela curta (party /
  // online com ts espaçado) não empilha N draw-blood — um basta.
  if (comboKey) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i];
      if (ef.comboKey === comboKey && (now - (ef.born || 0)) < 380)
        return ef;
    }
  }
  const wait = Math.max(0, Number(delayMs) || 0);
  this.effects.push({ x: x, y: y, name: name, t: 0, born: now + wait,
                      delayUntil: wait ? now + wait : 0,
                      frames: n, dur: dur,
                      scale: Math.max(0.1, Number(customScale) || 1),
                      comboKey: comboKey || "" });
  // O teto era 20, o que TRUNCAVA area grande: Hell's Core cobre 45 casas e
  // as primeiras eram descartadas antes de aparecer. 160 cabe pack denso +
  // areafx; Crit/Fatal NÃO podem ser os primeiros a sair — senão um mas san
  // em 40+ rats apaga o critical-hit-effect dos alvos iniciais e parece
  // que só um monstro “criticou”.
  const FX_CAP = 160;
  // Crit/Fatal e impactos fisicos basicos (hit/block/miss) nao podem ser os
  // primeiros a sair — senão AoE denso apaga sangue/block/poff e parece que
  // o auto-ataque “não anima”.
  const fxPriority = (nm) => nm === "critical-hit-effect" || nm === "fatal-text"
    || nm === "critical-heal-effect"
    || nm === "draw-blood" || nm === "block-hit" || nm === "poff"
    || nm === "hit-area" || nm === "hit-by-poison" || nm === "energy-hit"
    || nm === "whirlwind-blow-white" || nm === "blood-effect"
    || nm === "block-effect" || nm === "poof-effect";
  while (this.effects.length > FX_CAP) {
    let drop = -1;
    for (let i = 0; i < this.effects.length; i++) {
      if (!fxPriority(this.effects[i].name)) { drop = i; break; }
    }
    if (drop < 0) drop = 0;
    this.effects.splice(drop, 1);
  }
};

/* Limpa overlays de combate (FX, fala, floaters, projéteis). Chamado em
 * stopHunt / enterHunt / disconnect / reconnect para nunca herdar magia
 * congelada de uma sessão anterior. */
Renderer.prototype.clearCombatVisuals = function () {
  this.effects = [];
  this.floaters = [];
  this.projectiles = [];
  this.corpses = [];
  this.playerFlash = 0;
  this.playerTalk = { speech: [] };
};

Renderer.prototype.ageCombatSpeech = function (combat, dt) {
  const now = Date.now();
  ageCreatureSpeech(this.playerTalk, dt, now);
  if (!combat) return;
  const seen = new Set();
  const visit = (ent) => {
    if (!ent || seen.has(ent)) return;
    seen.add(ent);
    ageCreatureSpeech(ent, dt, now);
  };
  visit(combat.player);
  for (const ent of combat.players || []) visit(ent);
  for (const ent of combat.mobs || []) visit(ent);
  // pendingSpawns: monstro ainda não nasceu, mas pode herdar fala residual.
  for (const sp of combat.pendingSpawns || []) if (sp && sp.mob) visit(sp.mob);
};

Renderer.prototype.addProjectile = function (sx, sy, tx, ty, color, missile) {
  this.projectiles.push({ sx: sx, sy: sy, tx: tx, ty: ty,
                          color: color || "#ffe680", t: 0, dur: 260,
                          missile: missile || null,
                          dir: missileDir(sx, sy, tx, ty) });
  if (this.projectiles.length > 30) this.projectiles.shift();
};

/* Nome no estilo do client: texto pequeno com contorno preto, SEM caixa.
 * A moldura escura atras do nome era invencao nossa e nao existe no Tibia —
 * la o nome e desenhado direto sobre o mapa, so com outline para continuar
 * legivel em cima de qualquer chao. */
function drawNameText(ctx, x, y, name, cor, hudScale) {
  const s = Math.max(1, Number(hudScale) || 1);
  ctx.font = hudFont(9, s, true);
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = Math.max(2, 2 * s);
  ctx.strokeText(name, x, y);
  ctx.fillStyle = cor || "#ffffff";
  ctx.fillText(name, x, y);
}

/* Barra de vida do Tibia — Creature::drawInformation do OTClient/Canary:
 * backgroundRect 31x4, healthRect expanded(-1) com largura 29, 1px de borda.
 * Nome com minNameBarSpacing = 2. Mana/escudo colados em barsRect.bottom.
 */
const TIBIA_BAR_W = 31;
const TIBIA_BAR_H = 4;
const TIBIA_BAR_INNER_W = 29;
const TIBIA_BAR_INNER_H = 2;
const TIBIA_NAME_H = 9;
const TIBIA_MIN_NAME_BAR = 2;

function creatureInformationPoint(info, hudScale) {
  // OTC: dest interpolado (já com walkOffset) + (16, -2). cx/cy são o
  // centro do SQM; top é a origem da sprite no mesmo frame — a barra
  // viaja com o outfit, não com um HUD ancorado no mundo.
  const s = Math.max(1, Number(hudScale) || 1);
  return { x: info.cx, y: (info.top || 0) - 2 * s };
}
function creatureCropSize() {
  // p.y já é o topo da sprite. OTC usa cropSizeText=12 nesse caso
  // (getExactSize só quando dest é o tile, não o topo do outfit).
  return 12;
}
function creatureInfoExtraBars(info) {
  if (!info || !info.e || info.e.kind === "monster") return 0;
  return (info.shieldPct > 0 ? 1 : 0) + (info.mpPct != null ? 1 : 0);
}
function monsterRenderName(ent) {
  if (!ent) return "";
  const slug = String(ent.slug || "");
  const catalog = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && slug)
    ? GAMEDATA.monsters[slug] : null;
  let raw = catalog && catalog.name;
  if (!raw) {
    const defName = ent.def && ent.def.name;
    const defSlug = String(defName || "").toLowerCase().replace(/\s+/g, "-");
    raw = (defName && (!slug || defSlug === slug)) ? defName
      : (slug ? slug.split("-").filter(Boolean).map((part) =>
        part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : (defName || ""));
  }
  return typeof displayMonsterName === "function" ? displayMonsterName(raw) : raw;
}
/* Layout Canary Creature::drawInformation: p = dest + (16, -2), crop 12,
 * gap 2px, clamp na viewport. O OTC NÃO afasta labels de criaturas vizinhas
 * — nome+HP são da sprite e se sobrepõem no combate denso. */
function layoutCreatureInformation(info, viewW, viewH, hudScale) {
  const s = Math.max(1, Number(hudScale) || 1);
  const barW = TIBIA_BAR_W * s, barH = TIBIA_BAR_H * s, nameH = TIBIA_NAME_H * s;
  const p = creatureInformationPoint(info, s);
  const cropSizeText = creatureCropSize(info) * s;
  const cropSizeBackGround = Math.max(0, cropSizeText - nameH);
  let nameTop = p.y - cropSizeText;
  let barY = p.y - cropSizeBackGround;
  let nameBottom = nameTop + nameH;
  if (barY - nameBottom < TIBIA_MIN_NAME_BAR * s) barY = nameBottom + TIBIA_MIN_NAME_BAR * s;
  const extra = creatureInfoExtraBars(info);
  const barsH = barH * (1 + extra);
  const nameW = Math.max(barW, String(info.name || "").length * 6 * s);
  const box = {
    x: Math.min(p.x - nameW / 2, p.x - barW / 2),
    y: nameTop,
    w: Math.max(nameW, barW),
    h: (barY + barsH) - nameTop
  };
  const vw = Number(viewW), vh = Number(viewH);
  if (vw > 0 && vh > 0) {
    let textX = p.x - nameW / 2, textY = nameTop;
    let bgX = p.x - barW / 2, bgY = barY;
    if (textX < 0) textX = 0;
    if (textX + nameW > vw) textX = vw - nameW;
    if (textY < 0) textY = 0;
    if (textY + nameH > vh) textY = vh - nameH;
    if (bgX < 0) bgX = 0;
    if (bgX + barW > vw) bgX = vw - barW;
    if (bgY < 0) bgY = 0;
    if (bgY + barH > vh) bgY = vh - barH;
    const offset = 12 * s * (info.e && info.e.kind === "player" ? 2 : 1);
    if (textY === 0) bgY = textY + offset;
    if (bgY + barH >= vh) textY = bgY - offset;
    nameTop = textY;
    barY = bgY;
    box.x = Math.min(textX, bgX);
    box.y = Math.min(nameTop, barY);
    box.w = Math.max(textX + nameW, bgX + barW) - box.x;
    box.h = (barY + barsH) - box.y;
    return { nameX: textX + nameW / 2, nameY: nameTop + nameH, barX: bgX + barW / 2, barY: barY, box: box, scale: s };
  }
  return { nameX: p.x, nameY: nameTop + nameH, barX: p.x, barY: barY, box: box, scale: s };
}

/* Degraus de cor do client: >60 verde, >30 amarelo, >8 laranja/vermelho. */
function tibiaHpColor(pct) {
  const p = pct * 100;
  if (p > 60) return "#00c000";
  if (p > 30) return "#c0c000";
  if (p > 8) return "#c07800";
  if (p > 3) return "#c00000";
  return "#600000";
}

function drawTibiaBar(ctx, x, y, pct, cor, hudScale) {
  // Canary: background 31x4 preto, inner 29x2 com 1px borda — escalado no FULLHD
  const s = Math.max(1, Number(hudScale) || 1);
  const w = TIBIA_BAR_W * s, h = TIBIA_BAR_H * s;
  const iw = TIBIA_BAR_INNER_W * s, ih = TIBIA_BAR_INNER_H * s;
  const bx = Math.round(x - w / 2), by = Math.round(y);
  ctx.fillStyle = "#000";
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = cor;
  const fillW = Math.round(iw * Math.max(0, Math.min(1, pct)));
  ctx.fillRect(bx + s, by + s, fillW, ih);
}

/* Cor da barra de HP do personagem na cena — usa a mesma paleta Canary
 * (tibiaHpColor) dos monstros, para nome e healthbar ficarem identicos. */
function playerHpBarColor(pct) {
  return tibiaHpColor(pct);
}

function drawNameBars(ctx, x, nameY, name, hpPct, mpPct, shieldPct, barY, barX, hudScale) {
  const s = Math.max(1, Number(hudScale) || 1);
  const hpColor = playerHpBarColor(hpPct);
  const hpY = (typeof barY === 'number') ? barY : nameY + 12 * s;
  const nY = (typeof barY === 'number') ? nameY : nameY;
  const bx = (typeof barX === 'number') ? barX : x;
  drawNameText(ctx, x, nY, name, hpColor, s);
  drawTibiaBar(ctx, bx, hpY, hpPct, hpColor, s);
  let nextY = hpY + TIBIA_BAR_H * s;
  if (shieldPct !== undefined && shieldPct !== null && shieldPct > 0) {
    drawTibiaBar(ctx, bx, nextY, shieldPct, "#a64dff", s);
    nextY += TIBIA_BAR_H * s;
  }
  if (mpPct !== undefined && mpPct !== null) drawTibiaBar(ctx, bx, nextY, mpPct, "#3c66ff", s);
}

function drawStatusArcs(ctx, x, y, name, hpPct, mpPct, radius) {
  drawNameText(ctx, x, y - radius - 18, name);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  // HP à esquerda
  ctx.strokeStyle = "rgba(0,0,0,.78)";
  ctx.beginPath(); ctx.arc(x, y, radius, Math.PI * 0.72, Math.PI * 1.28); ctx.stroke();
  // mesma paleta da healthbar do HUD (verde > amarelo > laranja > vermelho)
  ctx.strokeStyle = playerHpBarColor(hpPct);
  ctx.beginPath(); ctx.arc(x, y, radius, Math.PI * 1.28, Math.PI * (1.28 - 0.56 * Math.max(0, Math.min(1, hpPct))), true); ctx.stroke();
  // Mana à direita
  ctx.strokeStyle = "rgba(0,0,0,.78)";
  ctx.beginPath(); ctx.arc(x, y, radius, Math.PI * -0.28, Math.PI * 0.28); ctx.stroke();
  ctx.strokeStyle = "#3c66ff";
  ctx.beginPath(); ctx.arc(x, y, radius, Math.PI * -0.28, Math.PI * (-0.28 + 0.56 * Math.max(0, Math.min(1, mpPct)))); ctx.stroke();
  ctx.restore();
}

function drawPlayerStatus(ctx, x, yTop, centerY, player, mode, radius) {
  const max = maxStats(player);
  const hpPct = max.hp ? player.hp / max.hp : 0;
  const mpPct = max.mp ? player.mp / max.mp : 0;
  const shieldPct = (typeof isMagicShieldActive === "function" && isMagicShieldActive(player, Date.now()))
    ? Math.max(0, Math.min(1, (player.magicShieldPool || 0) / (player.magicShieldCap || 1))) : 0;
  if (mode === "arcs") drawStatusArcs(ctx, x, centerY, player.name, hpPct, mpPct, radius || 34);
  else drawNameBars(ctx, x, yTop, player.name, hpPct, mpPct, shieldPct);
}

/* Tag de PARTY ao lado do nome (como o OTC/Canary): estrela amarela no
 * líder, círculo azul nos membros. Desenho vetorial, sem sprite. */
function drawPartyTagIcon(ctx, cx, cy, isLeader) {
  ctx.save();
  if (isLeader) {
    const s = 9;
    ctx.fillStyle = "#ffd65a";
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 === 0) ? s : s * 0.45;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x2 = cx + Math.cos(a) * r, y2 = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    const s = 8;
    ctx.fillStyle = "#6ec9ff";
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawTargetSquare(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = "#ff2020";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(255,0,0,.9)";
  ctx.shadowBlur = 5;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(0,0,0,.85)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  ctx.restore();
}

function drawBossBar(ctx, viewportW, combat, offsetX, offsetY, hudScale) {
  if (!combat || !combat.boss || !combat.mobs.length) return;
  const boss = combat.mobs.find((m) => m.boss) || combat.mobs[0];
  if (!boss || boss.hp <= 0) return;
  const s = Math.max(1, Number(hudScale) || 1);
  offsetX = Number(offsetX) || 0;
  offsetY = Number(offsetY) || 0;
  const pct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  const bw = Math.min(520 * s, viewportW * 0.72), bh = 18 * s;
  const center = offsetX + viewportW / 2;
  const x = center - bw / 2, y = offsetY + 10 * s;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.78)";
  ctx.fillRect(x - 3 * s, y - 3 * s, bw + 6 * s, bh + 24 * s);
  ctx.strokeStyle = "#8b6b2a";
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(x - 3 * s, y - 3 * s, bw + 6 * s, bh + 24 * s);
  ctx.fillStyle = "#050505";
  ctx.fillRect(x, y + 17 * s, bw, bh);
  const g = ctx.createLinearGradient(0, y + 17 * s, 0, y + 17 * s + bh);
  g.addColorStop(0, "#ff5656");
  g.addColorStop(1, "#7c0808");
  ctx.fillStyle = g;
  ctx.fillRect(x, y + 17 * s, bw * pct, bh);
  ctx.strokeStyle = "#000";
  ctx.strokeRect(x, y + 17 * s, bw, bh);
  ctx.font = hudFont(13, s, true);
  ctx.textAlign = "center";
  // nome do boss na cor da vida tambem — mesma regra dos monstros da arena
  ctx.fillStyle = tibiaHpColor(pct);
  ctx.fillText(boss.def.name, center, y + 11 * s);
  ctx.font = hudFont(10, s, true);
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.ceil(boss.hp)} / ${boss.maxHp}`, center, y + 31 * s);
  ctx.restore();
}

function drawRookgaardSewer(ctx, W, H) {
  const cols = 21, rows = 13;
  const tw = W / cols, th = H / rows;
  // Sem stroke por celula: o contorno de cada SQM deixava o chao com cara
  // de "grade" (celulas visiveis). A variacao de cor entre tiles ja da o
  // relevo; as bordas reais (muros, agua) sao desenhadas a parte.
  const tile = (x, y, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x * tw, y * th, tw + 1, th + 1);
  };

  const map = [
    "#####################",
    "#....#.........#....#",
    "#....#..~~~~~..#....#",
    "#.......~~~~~.......#",
    "#..##...~~=~~...##..#",
    "#..#....~~=~~....#..#",
    "#..#..S.~~=~~.G..#..#",
    "#..#....~~=~~....#..#",
    "#..##...~~=~~...##..#",
    "#.......~~~~~.......#",
    "#....#..~~~~~..#....#",
    "#....#.........#....#",
    "#####################",
  ];

  ctx.fillStyle = "#060806";
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = map[y][x];
      if (c === "#") tile(x, y, "#1a1a18");
      else if (c === "~") {
        const g = ctx.createLinearGradient(0, y * th, 0, (y + 1) * th);
        g.addColorStop(0, "#244629"); g.addColorStop(0.5, "#13311f"); g.addColorStop(1, "#081d14");
        tile(x, y, g);
      } else if (c === "=") tile(x, y, "#66543d");
      else tile(x, y, "#333633");

      // pedras rachadas / sujeira no piso
      if (c === "." && (x + y) % 3 === 0) {
        ctx.fillStyle = "rgba(0,0,0,.18)";
        ctx.fillRect(x * tw + tw * 0.15, y * th + th * 0.18, tw * 0.55, 1);
      }
      if (c === "#") {
        ctx.fillStyle = "rgba(255,255,255,.035)";
        ctx.fillRect(x * tw + 1, y * th + 1, tw - 2, 2);
      }
    }
  }

  // água central com brilho/esgoto fluindo
  ctx.strokeStyle = "rgba(120,210,110,.16)";
  ctx.lineWidth = 2;
  for (let y = 2; y <= 10; y += 2) {
    ctx.beginPath();
    ctx.moveTo(8 * tw, (y + 0.5) * th);
    ctx.bezierCurveTo(9 * tw, y * th, 11 * tw, (y + 1) * th, 13 * tw, (y + 0.5) * th);
    ctx.stroke();
  }

  // escada/bueiro de entrada de rookgaard
  const sx = 6 * tw, sy = 6 * th;
  ctx.fillStyle = "#15130f";
  ctx.fillRect(sx + tw * 0.14, sy + th * 0.12, tw * 0.72, th * 0.76);
  ctx.strokeStyle = "#a78b4c";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + tw * 0.14, sy + th * 0.12, tw * 0.72, th * 0.76);
  ctx.fillStyle = "#8a6d32";
  for (let i = 0; i < 4; i++) ctx.fillRect(sx + tw * 0.24, sy + th * (0.23 + i * 0.14), tw * 0.52, 2);

  // grade/ralo
  const gx = 14 * tw, gy = 6 * th;
  ctx.fillStyle = "#070707";
  ctx.fillRect(gx + tw * 0.15, gy + th * 0.15, tw * 0.7, th * 0.7);
  ctx.strokeStyle = "#777";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(gx + tw * (0.15 + i * 0.12), gy + th * 0.18); ctx.lineTo(gx + tw * (0.15 + i * 0.12), gy + th * 0.82); ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(gx + tw * 0.18, gy + th * (0.15 + i * 0.15)); ctx.lineTo(gx + tw * 0.82, gy + th * (0.15 + i * 0.15)); ctx.stroke();
  }

  // canos laterais, poças e musgo
  ctx.strokeStyle = "#5f6257";
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(1.2 * tw, 3.2 * th); ctx.lineTo(5.5 * tw, 3.2 * th); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15.5 * tw, 9.7 * th); ctx.lineTo(19.8 * tw, 9.7 * th); ctx.stroke();
  ctx.fillStyle = "rgba(70,130,52,.28)";
  [[2,2],[3,9],[17,3],[18,10],[5,7],[15,5]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.ellipse((x + .5) * tw, (y + .55) * th, tw * .28, th * .12, 0, 0, 7); ctx.fill();
  });

  // legenda local
  const hudS = typeof canvasHudScale === "function" ? canvasHudScale(ctx.canvas) : 1;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(8 * hudS, 8 * hudS, 178 * hudS, 22 * hudS);
  ctx.strokeStyle = "rgba(120,100,60,.6)";
  ctx.strokeRect(8 * hudS, 8 * hudS, 178 * hudS, 22 * hudS);
  ctx.font = hudFont(11, hudS, true);
  ctx.textAlign = "left";
  ctx.fillStyle = "#d8c47a";
  ctx.fillText("Bueiro de Rookgaard", 16 * hudS, 23 * hudS);
}

/* Caverna das Aranhas: gruta de pedra com teias, ovos e poças de veneno.
 * Mesmo esquema do bueiro — mapa em grid desenhado a mão. */
function drawSpiderCave(ctx, W, H) {
  const cols = 21, rows = 13;
  const tw = W / cols, th = H / rows;
  // Sem stroke por celula — mesma correcao do esgoto: sem "grade" de SQM.
  const tile = (x, y, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x * tw, y * th, tw + 1, th + 1);
  };

  // # rocha  . chão de terra  , terra clara  ~ poça de veneno
  // o ovos   * teia no chão   = ponte de raízes
  const map = [
    "#####################",
    "##...###.......###..#",
    "#..o..##..***..##...#",
    "#..,,..#.*~~~*.#..o.#",
    "#.,,,,.,.*~~~*.,..,.#",
    "##.,,.,,,.***.,,,.,##",
    "#...,..=========..,.#",
    "##.,,.,,,.***.,,,.,##",
    "#.,,,,.,.*~~~*.,..,.#",
    "#..o...#.*~~~*.#.,..#",
    "#..,,..##..***..##o.#",
    "##...###.......###..#",
    "#####################",
  ];

  ctx.fillStyle = "#0a0806";
  ctx.fillRect(0, 0, W, H);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = map[y][x];
      if (c === "#") {
        tile(x, y, "#241f1a");
      } else if (c === "~") {
        const g = ctx.createLinearGradient(0, y * th, 0, (y + 1) * th);
        g.addColorStop(0, "#3f5c22"); g.addColorStop(0.5, "#28401a"); g.addColorStop(1, "#152811");
        tile(x, y, g);
      } else if (c === "=") {
        tile(x, y, "#5a4526");
      } else if (c === ",") {
        tile(x, y, "#443a2e");
      } else {
        tile(x, y, "#37302a");
      }

      // relevo da rocha
      if (c === "#") {
        ctx.fillStyle = "rgba(255,255,255,.045)";
        ctx.fillRect(x * tw + 1, y * th + 1, tw - 2, 2);
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.fillRect(x * tw + 1, (y + 1) * th - 3, tw - 2, 2);
      }
      // cascalho no chão
      if ((c === "." || c === ",") && (x * 3 + y * 7) % 5 === 0) {
        ctx.fillStyle = "rgba(0,0,0,.22)";
        ctx.fillRect(x * tw + tw * 0.2, y * th + th * 0.3, tw * 0.4, 2);
      }
      // teia no chão
      if (c === "*") {
        ctx.strokeStyle = "rgba(230,230,225,.30)";
        ctx.lineWidth = 1;
        const cx = (x + 0.5) * tw, cy = (y + 0.5) * th;
        for (let a = 0; a < 4; a++) {
          const ang = (Math.PI / 4) * a;
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(ang) * tw * 0.42, cy - Math.sin(ang) * th * 0.42);
          ctx.lineTo(cx + Math.cos(ang) * tw * 0.42, cy + Math.sin(ang) * th * 0.42);
          ctx.stroke();
        }
        for (const r of [0.16, 0.3]) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, tw * r, th * r, 0, 0, 7);
          ctx.stroke();
        }
      }
      // casulos de ovos
      if (c === "o") {
        const cx = (x + 0.5) * tw, cy = (y + 0.5) * th;
        ctx.fillStyle = "#d8d2c0";
        for (const [dx, dy, r] of [[-0.18, 0.05, 0.15], [0.16, -0.1, 0.13], [0.02, 0.2, 0.11]]) {
          ctx.beginPath();
          ctx.ellipse(cx + dx * tw, cy + dy * th, tw * r, th * (r + 0.05), 0, 0, 7);
          ctx.fill();
        }
        ctx.strokeStyle = "rgba(120,110,95,.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, tw * 0.34, th * 0.3, 0, 0, 7);
        ctx.stroke();
      }
    }
  }

  // ponte de raízes sobre o poço central
  ctx.strokeStyle = "rgba(30,20,10,.55)";
  ctx.lineWidth = 2;
  for (let x = 7; x <= 15; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tw, 6 * th + th * 0.15);
    ctx.lineTo(x * tw, 7 * th - th * 0.15);
    ctx.stroke();
  }

  // brilho tóxico das poças
  ctx.strokeStyle = "rgba(150,220,90,.18)";
  ctx.lineWidth = 2;
  for (const y of [3, 4, 8, 9]) {
    ctx.beginPath();
    ctx.moveTo(10 * tw, (y + 0.5) * th);
    ctx.bezierCurveTo(10.6 * tw, y * th, 11.4 * tw, (y + 1) * th, 12 * tw, (y + 0.5) * th);
    ctx.stroke();
  }

  // teias penduradas nos cantos superiores
  ctx.strokeStyle = "rgba(235,235,230,.22)";
  ctx.lineWidth = 1;
  for (const [ox, oy] of [[1, 1], [19, 1], [1, 11], [19, 11]]) {
    const cx = ox * tw, cy = oy * th;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (ox < 10 ? 1 : -1) * tw * (0.5 + i * 0.35),
                 cy + (oy < 6 ? 1 : -1) * th * (1.4 - i * 0.2));
      ctx.stroke();
    }
  }

  // estalactites na rocha do topo
  ctx.fillStyle = "#1a1612";
  for (let x = 0; x < cols; x++) {
    if ((x * 5) % 7 > 3) continue;
    const h = th * (0.3 + ((x * 13) % 5) * 0.12);
    ctx.beginPath();
    ctx.moveTo(x * tw + tw * 0.2, th);
    ctx.lineTo(x * tw + tw * 0.5, th + h);
    ctx.lineTo(x * tw + tw * 0.8, th);
    ctx.closePath();
    ctx.fill();
  }

  // legenda local
  const hudS = typeof canvasHudScale === "function" ? canvasHudScale(ctx.canvas) : 1;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(8 * hudS, 8 * hudS, 190 * hudS, 22 * hudS);
  ctx.strokeStyle = "rgba(120,100,60,.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(8 * hudS, 8 * hudS, 190 * hudS, 22 * hudS);
  ctx.font = hudFont(11, hudS, true);
  ctx.textAlign = "left";
  ctx.fillStyle = "#c8d87a";
  ctx.fillText("Caverna das Aranhas", 16 * hudS, 23 * hudS);
}

Renderer.prototype.addCorpse = function (x, y, slug) {
  this.corpses.push({ x: x, y: y, slug: slug, life: 2000 });
  if (this.corpses.length > 8) this.corpses.shift();
};

Renderer.prototype.drawAcademy = function (training, player, dt) {
  const ctx = this.ctx;
  const W = this.c.width, H = this.c.height;
  const hudS = canvasHudScale(this.c);
  ctx.clearRect(0, 0, W, H);

  const isDummy = training.mode === "dummy";
  const temMapa = !!(training.huntMap && training.huntMap.rows);

  if (temMapa) {
    // --- Mapa .otbm da sala de exercise weapons (commit 0553abd): desenha
    // o grid oficial do mapa com as paredes/chão do editor.
    drawTileCharMap(ctx, training.huntMap, W, H, GRID_W, GRID_H);
  } else {
    const gr = Sprites.ground("temple") || Sprites.ground("city");
    if (gr && gr.complete && gr.naturalWidth) {
      const s = 2;
      const tw = gr.naturalWidth * s, th = gr.naturalHeight * s;
      for (let y = 0; y < H; y += th)
        for (let x = 0; x < W; x += tw)
          ctx.drawImage(gr, x, y, tw, th);
    } else {
      ctx.fillStyle = "#1a1a1e";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(50,50,55,.35)";
    ctx.fillRect(0, H * 0.68, W, H * 0.32);

    const drawObj = (path, x, y, sc, alpha) => {
      const img = Sprites.get(path);
      if (!img || !img.complete || !img.naturalWidth) return;
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
      ctx.drawImage(img, x * W - w / 2, y * H - h, w, h);
      ctx.restore();
    };

    // Sala de treino — tema cinza escuro
    ctx.fillStyle = "rgba(30,30,34,.90)";
    ctx.fillRect(0, 0, W, H * 0.18);
    ctx.fillStyle = "rgba(50,50,55,.80)";
    ctx.fillRect(0, H * 0.16, W, 8);
    for (let x = 0.05; x < 1; x += 0.12)
      drawObj("assets/city/wall-brick-h.png", x, 0.19, 1.6, 0.9);
    drawObj("assets/city/torch-wall.png", 0.09, 0.25, 1.8);
    drawObj("assets/city/torch-wall.png", 0.91, 0.25, 1.8);
    drawObj("assets/city/pillar.png", 0.06, 0.73, 1.9, 0.9);
    drawObj("assets/city/pillar.png", 0.94, 0.73, 1.9, 0.9);
    drawObj("assets/city/barrel.png", 0.14, 0.86, 1.7);
    drawObj("assets/city/crate.png", 0.20, 0.87, 1.7);
    drawObj("assets/city/box.png", 0.86, 0.86, 1.7);
    drawObj("assets/city/table.png", 0.49, 0.89, 1.6, 0.85);
    drawObj("assets/city/chair.png", 0.43, 0.88, 1.4, 0.8);
    drawObj("assets/city/sign.png", 0.50, 0.24, 1.5);
    // Rack de armas do lado esquerdo.
    ctx.fillStyle = "rgba(80,55,28,.9)";
    ctx.fillRect(W * 0.315, H * 0.25, 12, H * 0.34);
    ctx.fillRect(W * 0.285, H * 0.30, 70, 8);
    ctx.fillRect(W * 0.285, H * 0.44, 70, 8);
    drawObj("assets/item/sword.png", 0.30, 0.48, 1.35);
    drawObj("assets/item/axe.png", 0.34, 0.48, 1.35);
    drawObj("assets/item/club.png", 0.38, 0.48, 1.35);
    drawObj("assets/item/brass-shield.png", 0.34, 0.62, 1.25);
    // Marcadores das baias de treino.
    ctx.strokeStyle = "rgba(156,232,74,.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.22, H * 0.47, W * 0.18, H * 0.24);
    ctx.strokeRect(W * 0.60, H * 0.47, W * 0.18, H * 0.24);
  }

  ctx.textAlign = "left";
  ctx.font = hudFont(14, hudS, true);
  ctx.fillStyle = "#d8d8dc";
  ctx.fillText(temMapa ? "Sala de Exercise Weapons" : (isDummy ? "Ferumbras Dummy Safezone" : "Academia Safezone"), 12 * hudS, 24 * hudS);
  ctx.font = hudFont(10, hudS);
  ctx.fillStyle = "#999";
  if (isDummy) {
    const w = training.weapon ? (EXERCISE_WEAPONS[training.weapon] || {}).name : "—";
    ctx.fillText("Exercise weapon: " + w + " · 1 carga/golpe · regen stamina 3:1", 12 * hudS, 40 * hudS);
  } else {
    ctx.fillText("Treiner padrão · sem custo · regen stamina 1:1 · conjure disponível", 12 * hudS, 40 * hudS);
  }

  const pimg = OutfitRenderer.forPlayer(player, training.facing || "e", 0);
  // Posição do player: com mapa .otbm ele fica no spawn do mapa; sem mapa
  // usa a baia procedural. playerPos/dummyPos sempre existem no modo dummy
  // (o fallback tem posições fixas), então a animação sempre mira o dummy.
  let px, py;
  if (training.playerPos) {
    px = training.playerPos.x * W;
    py = training.playerPos.y * H;
  } else {
    px = W * 0.28;
    py = H * 0.64;
  }
  // Animação do golpe (como no client/baiakidle):
  //  - SEM flutuação: o personagem fica colado no chão (sem bob senoidal);
  //  - o personagem ENCARA o dummy e avança um passo na direção dele
  //    (lunge) enquanto a exercise weapon é usada (proj voando até lá);
  //  - alterna frames de caminhada 1/2 durante o gesto.
  let lungeX = 0, lungeY = 0, atkFrame = 0;
  if (training.lungeT > 0) {
    const prog = 1 - training.lungeT / 230;
    const mag = W * 0.02 * ((training.proj && training.proj.lunge) || 1);
    const alvo = (training.proj && training.proj.to) ||
      (training.dummyPos || { x: 0.70, y: 0.62 });
    const dx = alvo.x - ((training.playerPos || { x: 0.28 }).x);
    const dy = alvo.y - ((training.playerPos || { y: 0.64 }).y);
    const len = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy));
    lungeX = (dx / len) * mag;
    lungeY = (dy / len) * mag;
    atkFrame = (Math.floor(prog * 6) % 2) + 1;  // alterna frames 1 e 2
    training.lungeT -= dt;
  }
  const pxF = px + lungeX, pyF = py + lungeY;
  const pimgAtk = (atkFrame && spriteReady(pimg))
    ? (OutfitRenderer.forPlayer(player, training.facing || "e", atkFrame) || pimg) : pimg;
  if (spriteReady(pimgAtk)) {
    // mesma escala do combate: tibiaScale(W) = tilePx / 32, assim o
    // personagem tem o MESMO tamanho na sala de treino e nas hunts
    const sc = tibiaScale(W);
    const w = spriteW(pimgAtk) * sc, h = spriteH(pimgAtk) * sc;
    const tile = tilePx(W);
    const origin = creatureTileOrigin(pxF, pyF, w, h, tile, pimgAtk._spriteAnchor, sc);
    const footY = pyF + tile / 2;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(pxF, footY, w * 0.34, Math.max(2, tile * 0.08), 0, 0, 7); ctx.fill();
    ctx.drawImage(pimgAtk, origin.x, origin.y, w, h);
    drawPlayerStatus(ctx, pxF, origin.y - 14, footY, player, player.config.barMode, Math.max(26, w * 0.42));
    this.drawSpeech(ctx, pxF, origin.y - 14, dt);

    // Exercise Shield: durante o gesto de usar a arma no dummy, o escudo
    // fica erguido na frente do personagem (como o uso no client).
    if (training.mode === "dummy" && training.lungeT > 0 &&
        training.weapon === "exercise-shield" && !(training.proj && training.proj.missile)) {
      const simg = Sprites.get("assets/ui/training/exercise-shield.gif");
      if (simg && simg.complete && simg.naturalWidth) {
        const ts = tilePx(W);
        const ws = ts * 0.85, hs = ts * 0.85;
        const sdx = (training.facing === "w") ? -0.5 : ((training.facing === "e") ? 0.45 : 0);
        const sdy = (training.facing === "n") ? -0.7 : 0.15;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(simg, pxF + sdx * ws - ws / 2, pyF + sdy * ws - hs / 2, ws, hs);
        ctx.restore();
      }
    }
  }

  // Posição do dummy: com mapa .otbm usa a célula `mob` marcada no editor;
  // sem mapa usa a baia procedural à direita.
  let tx = W * 0.70, ty = H * 0.62;
  if (training.dummyPos) {
    tx = training.dummyPos.x * W;
    ty = training.dummyPos.y * H;
  }
  if (isDummy) {
    // --- Ferumbras Exercise Dummy.
    // Com mapa .otbm o dummy JÁ ESTÁ no mapa (os itens 28559+53586+54687
    // que o editor desenhou formam a estátua + base) — nada a sobrepor.
    // Sem mapa (fallback) desenha o GIF oficial da TibiaWiki.
    const tile = tilePx(W);
    const dw = 64, dh = 64;
    if (!temMapa) {
      const dimg = Sprites.get("assets/ui/training/ferumbras-dummy.gif");
      const scDummy = 1.5;
      if (dimg && dimg.complete && dimg.naturalWidth) {
        const sc = scDummy;
        const w = dimg.naturalWidth * sc, h = dimg.naturalHeight * sc;
        ctx.fillStyle = "rgba(0,0,0,.4)";
        ctx.beginPath(); ctx.ellipse(tx, ty + 12, w * 0.36, 9, 0, 0, 7); ctx.fill();
        ctx.drawImage(dimg, tx - w / 2, ty - h + 10, w, h);
      } else {
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(tx - 20, ty - 52, 40, 58);
      }
    }

    ctx.textAlign = "center";
    ctx.font = hudFont(12, hudS, true);
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.fillText("Ferumbras Exercise Dummy", tx + 1, ty - 90 * hudS);
    ctx.fillStyle = "#d8d8dc";
    ctx.fillText("Ferumbras Exercise Dummy", tx, ty - 91 * hudS);

    // cargas da exercise weapon (sem barra de HP — o dummy não leva dano)
    const cargas = (player.exercise && training.weapon)
      ? (player.exercise[training.weapon] || 0) : 0;
    ctx.font = hudFont(10, hudS);
    ctx.fillStyle = "#999";
    ctx.fillText(fmtFull(cargas) + " cargas", tx, ty - 105 * hudS);
  } else {
    const trainer = Sprites.mob("monk", "w") || Sprites.mob("monk", "s");
    let trainerBox = { x: tx - 22, y: ty - 52, w: 44, h: 74 };
    if (trainer && trainer.complete && trainer.naturalWidth) {
      const sc = 2.4;
      const w = trainer.naturalWidth * sc, h = trainer.naturalHeight * sc;
      trainerBox = { x: tx - w * 0.43, y: ty - h * 0.48,
                     w: w * 0.86, h: h * 0.92 };
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.beginPath(); ctx.ellipse(tx, ty + h * 0.42, w * 0.34, h * 0.1, 0, 0, 7); ctx.fill();
      drawTargetSquare(ctx, trainerBox.x, trainerBox.y, trainerBox.w, trainerBox.h);
      ctx.drawImage(trainer, tx - w / 2, ty - h / 2, w, h);
    } else {
      drawTargetSquare(ctx, trainerBox.x, trainerBox.y, trainerBox.w, trainerBox.h);
      ctx.fillStyle = "#7b5a2a";
      ctx.fillRect(tx - 18, ty - 52, 36, 70);
    }

    ctx.textAlign = "center";
    ctx.font = hudFont(12, hudS, true);
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.fillText("Treiner", tx + 1, ty - 64 * hudS);
    ctx.fillStyle = "#d8d8dc";
    ctx.fillText("Treiner", tx, ty - 65 * hudS);

    // barra do Treiner: nunca morre
    ctx.fillStyle = "#000";
    ctx.fillRect(tx - 42, ty - 55, 84, 7);
    ctx.fillStyle = "#4ec84e";
    ctx.fillRect(tx - 41, ty - 54, 82, 5);
  }

  // --- Exercise weapon sendo USADA no dummy (useitemid onitemid): o
  // projétil voa do player até o dummy a cada golpe, com a sprite certa
  // para a arma e a direção do voo:
  //   melee  -> whirlwind (espada/machado/maca girando) — sprite 8 direções
  //   ranged -> flecha
  //   cast   -> projétil mágico (gelo pro cajado, energia pra varinha)
  //   shield/fist -> sem projétil: o efeito do golpe sai no dummy
  // Enquanto a ação acontece, o dummy fica marcado com o quadrado de alvo
  // amarelo do client (useitemid onitemid).
  if (training.proj) {
    const pr = training.proj;
    pr.t += dt;
    const p = Math.min(1, pr.t / pr.dur);
    const ex = (pr.from.x + (pr.to.x - pr.from.x) * p) * W;
    const ey = (pr.from.y + (pr.to.y - pr.from.y) * p) * H;

    // quadrado de alvo no dummy enquanto a arma está sendo usada
    const tsAlvo = tilePx(W);
    ctx.strokeStyle = "rgba(255, 225, 90, .95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(tx - tsAlvo * 0.42, ty - tsAlvo * 0.52,
                   tsAlvo * 0.84, tsAlvo * 1.0);

    const hasMissile = !!pr.missile && pr.missile !== "weapon";
    if (hasMissile) {
      // sprite oficial do projetil na direção do voo (como no combate)
      const mimg = Sprites.missile(pr.missile, pr.dir || missileDir(pr.from.x, pr.from.y, pr.to.x, pr.to.y));
      if (mimg && mimg.complete && mimg.naturalWidth) {
        const sc = tibiaScale(W);
        const mw = mimg.naturalWidth * sc, mh = mimg.naturalHeight * sc;
        // melee: a arma gira enquanto voa (whirlwind); ranged/cast voam reto
        ctx.save();
        ctx.translate(ex, ey - mh * 0.25);
        if (pr.kind === "melee") ctx.rotate(Math.sin(p * Math.PI * 3) * 0.9);
        ctx.drawImage(mimg, -mw / 2, -mh / 2, mw, mh);
        ctx.restore();
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.beginPath(); ctx.ellipse(ex, ey + mh * 0.3, mw * 0.22, 4, 0, 0, 7); ctx.fill();
      } else {
        // fallback: risco luminoso
        ctx.strokeStyle = "#ffe680";
        ctx.globalAlpha = 0.35 + (1 - p) * 0.45;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo((pr.from.x + (pr.to.x - pr.from.x) * Math.max(0, p - 0.18)) * W,
                   (pr.from.y + (pr.to.y - pr.from.y) * Math.max(0, p - 0.18)) * H);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.fillStyle = "#ffe680";
        ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (pr.kind === "fist") {
      // soco: um rastro curto de impacto indo até o dummy
      const fpx = (pr.from.x + (pr.to.x - pr.from.x) * Math.max(0, p - 0.25)) * W;
      const fpy = (pr.from.y + (pr.to.y - pr.from.y) * Math.max(0, p - 0.25)) * H;
      ctx.strokeStyle = "rgba(255, 220, 120, .5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fpx, fpy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    // shield: sem projétil — o escudo fica erguido na frente do personagem
    // (desenhado junto ao player) e o bash-shield sai no dummy na chegada.

    // impacto no dummy quando a arma chega (uma vez por golpe)
    if (p >= 1 && !pr.hitFx) {
      pr.hitFx = true;
      this.addEffect(pr.to.x, pr.to.y, pr.fx || "block-hit");
      // some o proj no próximo frame
      training.proj = null;
    }
  }

  ctx.textAlign = "left";
  ctx.font = hudFont(11, hudS);
  ctx.fillStyle = "rgba(20,20,24,.80)";
  ctx.fillRect(12 * hudS, H - 58 * hudS, 250 * hudS, 44 * hudS);
  ctx.strokeStyle = "rgba(100,100,110,.45)";
  ctx.strokeRect(12 * hudS, H - 58 * hudS, 250 * hudS, 44 * hudS);
  ctx.fillStyle = "#b0b0b8";
  const sk = training.skill ? (SKILL_NAMES[training.skill] || training.skill) : "—";
  ctx.fillText("Skill: " + sk, 22 * hudS, H - 38 * hudS);
  ctx.fillText("Hits: " + fmtFull(training.stats.hits) + " · Shielding ativo", 22 * hudS, H - 22 * hudS);

  // efeitos/números flutuantes
  const fxNow = Date.now();
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    if ((Number(e.delayUntil) || 0) > fxNow) continue;
    e.t = (Number(e.t) || 0) + (Number(dt) || 0);
    if (fxEffectExpired(e, fxNow)) { this.effects.splice(i, 1); continue; }
    const img = Sprites.fx(e.name);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const meta = fxClientMeta(e.name);
    const fw = fxStripCellWidth(img, e.frames, meta);
    const f = Math.min(e.frames - 1, Math.floor((e.t / e.dur) * e.frames));
    // mesma escala do resto do mapa: o efeito do client cobre 1 SQM. Com o
    // "2" fixo que estava aqui a explosao ficava do tamanho de 3 tiles e
    // parecia solta do grid.
    const sc = tibiaScale(W) * (e.scale || 1);
    const tile = tilePx(W);
    const drawW = fw * sc, drawH = img.naturalHeight * sc;
    const origin = effectTileOrigin(e.x * W, e.y * H, drawW, drawH, tile);
    ctx.drawImage(img, f * fw, 0, fw, img.naturalHeight,
                  origin.x, origin.y, drawW, drawH);
  }
  ctx.textAlign = "center";
  for (let i = this.floaters.length - 1; i >= 0; i--) {
    const f = this.floaters[i];
    f.life -= dt;
    if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
    const p = 1 - f.life / f.max;
    const alpha = floaterAlpha(p);
    ctx.globalAlpha = alpha;
    // numero de dano do tamanho do client original: menor e fino, nao um
    // texto "gordo" tomando conta da tela. v27: os numeros de CURA/DANO
    // (small) saem com METADE do tamanho — menos poluição visual no idle.
    ctx.font = floaterFont(f, hudS);
    ctx.lineWidth = (f.kind ? 2 : (f.small ? 1.5 : 2)) * hudS;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(f.text, (f.x + f.vx * p * 60) * W, (f.y + f.vy * p * 22) * H);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, (f.x + f.vx * p * 60) * W, (f.y + f.vy * p * 22) * H);
    ctx.globalAlpha = 1;
  }
};

/* Fallback visual de personagem enquanto outfit/sprite ainda carrega.
 * Desenha uma silhueta colorida por vocação + sombra, nunca deixa o tile vazio. */
function drawAcademyMemberFallback(ctx, px, py, tile, p) {
  const w = Math.max(16, tile * 0.45), h = Math.max(26, tile * 0.75);
  const vocColor = { knight: "#c8a070", paladin: "#70c870", sorcerer: "#7070c8", druid: "#c870c8" }[p && p.voc] || "#a8a090";
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.beginPath(); ctx.ellipse(px, py + tile / 2, w * 0.45, Math.max(2, tile * 0.08), 0, 0, 7); ctx.fill();
  ctx.fillStyle = vocColor;
  ctx.fillRect(px - w / 2, py - h / 2, w, h);
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 1;
  ctx.strokeRect(px - w / 2, py - h / 2, w, h);
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(px, py - h * 0.2, w * 0.18, 0, 7); ctx.fill();
  ctx.restore();
}

function drawAcademyMember(renderer, ctx, W, H, tile, hudS, training, member, localPlayer, dt) {
  const m = member;
  const isLocal = m.isLocal || !!(typeof G !== "undefined" && G && G.p && String(G.p.id) === String(m.id));
  const p = isLocal ? (localPlayer || (typeof G !== "undefined" && G.p) || m.p) : m.p;
  if (!p) return;

  const px = m.playerPos.x * W, py = m.playerPos.y * H;
  let lungeX = 0, lungeY = 0, atkFrame = 0;
  if (m.lungeT > 0) {
    const prog = 1 - m.lungeT / 230;
    const mag = W * 0.02 * ((m.proj && m.proj.lunge) || 1);
    const alvo = (m.proj && m.proj.to) || training.dummyPos || { x: 0.5625, y: 0.472222 };
    const fromX = m.playerPos.x, fromY = m.playerPos.y;
    const dx = alvo.x - fromX, dy = alvo.y - fromY;
    const len = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy));
    lungeX = (dx / len) * mag; lungeY = (dy / len) * mag;
    atkFrame = (Math.floor(prog * 6) % 2) + 1;
    m.lungeT = Math.max(0, m.lungeT - dt);
  }
  const pxF = px + lungeX, pyF = py + lungeY;
  const facing = m.facing || "s";
  const pimg = OutfitRenderer.forPlayer(p, facing, 0);
  const pimgAtk = (atkFrame && spriteReady(pimg))
    ? (OutfitRenderer.forPlayer(p, facing, atkFrame) || pimg) : pimg;

  if (spriteReady(pimgAtk)) {
    const sc = tibiaScale(W);
    const w = spriteW(pimgAtk) * sc, h = spriteH(pimgAtk) * sc;
    const origin = creatureTileOrigin(pxF, pyF, w, h, tile, pimgAtk._spriteAnchor, sc);
    const footY = pyF + tile / 2;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(pxF, footY, w * 0.34, Math.max(2, tile * 0.08), 0, 0, 7); ctx.fill();
    ctx.drawImage(pimgAtk, origin.x, origin.y, w, h);
    // Só exibe barras para o personagem local ou quem tenha hp/mp populado.
    if (Number.isFinite(p.hp) && Number.isFinite(p.mp)) {
      drawPlayerStatus(ctx, pxF, origin.y - 14, footY, p, (p.config || {}).barMode, Math.max(26, w * 0.42));
    }
    if (isLocal) renderer.drawSpeech(ctx, pxF, origin.y - 14, dt);

    if (training.mode === "exercise" && m.lungeT > 0 && m.weapon === "exercise-shield" && !(m.proj && m.proj.missile)) {
      const simg = Sprites.get("assets/ui/training/exercise-shield.gif");
      if (simg && simg.complete && simg.naturalWidth) {
        const ws = tile * 0.85, hs = tile * 0.85;
        const sdx = (facing === "w") ? -0.5 : ((facing === "e") ? 0.45 : 0);
        const sdy = (facing === "n") ? -0.7 : 0.15;
        ctx.save(); ctx.globalAlpha = 0.95;
        ctx.drawImage(simg, pxF + sdx * ws - ws / 2, pyF + sdy * ws - hs / 2, ws, hs);
        ctx.restore();
      }
    }
  } else {
    drawAcademyMemberFallback(ctx, pxF, pyF, tile, p);
  }

  ctx.textAlign = "center";
  ctx.font = hudFont(9, hudS, true);
  ctx.fillStyle = "rgba(0,0,0,.85)";
  ctx.fillText(p.name || "Personagem", pxF + 1, pyF - tile * 1.05);
  ctx.fillStyle = isLocal ? "#ffe680" : "#fff";
  ctx.fillText(p.name || "Personagem", pxF, pyF - tile * 1.05 - 1);
}

function drawAcademyDummy(ctx, W, H, tile, hudS, training, dummyPos) {
  const isDummy = training.mode === "dummy" || training.mode === "exercise";
  const temMapa = !!(training.huntMap && training.huntMap.rows);
  const tx = dummyPos.x * W, ty = dummyPos.y * H;
  if (!isDummy) return;
  if (!temMapa) {
    const dimg = Sprites.get("assets/ui/training/ferumbras-dummy.gif");
    const scDummy = 1.5;
    if (dimg && dimg.complete && dimg.naturalWidth) {
      const w = dimg.naturalWidth * scDummy, h = dimg.naturalHeight * scDummy;
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.beginPath(); ctx.ellipse(tx, ty + 12, w * 0.36, 9, 0, 0, 7); ctx.fill();
      ctx.drawImage(dimg, tx - w / 2, ty - h + 10, w, h);
    } else {
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(tx - 20, ty - 52, 40, 58);
    }
  }
  ctx.textAlign = "center";
  ctx.font = hudFont(12, hudS, true);
  ctx.fillStyle = "rgba(0,0,0,.85)";
  ctx.fillText("Statue of Suon", tx + 1, ty - 90 * hudS);
  ctx.fillStyle = "#d8d8dc";
  ctx.fillText("Statue of Suon", tx, ty - 91 * hudS);
}

function drawAcademyProj(renderer, ctx, W, H, tile, member, dt) {
  const pr = member.proj;
  pr.t += dt;
  const p = Math.min(1, pr.t / pr.dur);
  const ex = (pr.from.x + (pr.to.x - pr.from.x) * p) * W;
  const ey = (pr.from.y + (pr.to.y - pr.from.y) * p) * H;
  const tx = pr.to.x * W, ty = pr.to.y * H;

  ctx.strokeStyle = "rgba(255, 225, 90, .95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(tx - tile * 0.42, ty - tile * 0.52, tile * 0.84, tile * 1.0);

  const hasMissile = !!pr.missile && pr.missile !== "weapon";
  if (hasMissile) {
    const mimg = Sprites.missile(pr.missile, pr.dir || missileDir(pr.from.x, pr.from.y, pr.to.x, pr.to.y));
    if (mimg && mimg.complete && mimg.naturalWidth) {
      const sc = tibiaScale(W);
      const mw = mimg.naturalWidth * sc, mh = mimg.naturalHeight * sc;
      ctx.save();
      ctx.translate(ex, ey - mh * 0.25);
      if (pr.kind === "melee") ctx.rotate(Math.sin(p * Math.PI * 3) * 0.9);
      ctx.drawImage(mimg, -mw / 2, -mh / 2, mw, mh);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.ellipse(ex, ey + mh * 0.3, mw * 0.22, 4, 0, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = "#ffe680";
      ctx.globalAlpha = 0.35 + (1 - p) * 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((pr.from.x + (pr.to.x - pr.from.x) * Math.max(0, p - 0.18)) * W,
                 (pr.from.y + (pr.to.y - pr.from.y) * Math.max(0, p - 0.18)) * H);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = "#ffe680";
      ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else if (pr.kind === "fist") {
    const fpx = (pr.from.x + (pr.to.x - pr.from.x) * Math.max(0, p - 0.25)) * W;
    const fpy = (pr.from.y + (pr.to.y - pr.from.y) * Math.max(0, p - 0.25)) * H;
    ctx.strokeStyle = "rgba(255, 220, 120, .5)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fpx, fpy); ctx.lineTo(ex, ey); ctx.stroke();
  }

  if (p >= 1 && !pr.hitFx) {
    pr.hitFx = true;
    renderer.addEffect(pr.to.x, pr.to.y, pr.fx || "block-hit");
    member.proj = null;
  }
}

const drawLegacyAcademy = Renderer.prototype.drawAcademy;
Renderer.prototype.drawAcademy = function(training, player, dt) {
  if (!training || !training.members) return drawLegacyAcademy.call(this, training, player, dt);
  const ctx = this.ctx, W = this.c.width, H = this.c.height;
  const hudS = canvasHudScale(this.c), tile = tilePx(W);
  ctx.clearRect(0, 0, W, H);

  const map = training.huntMap;
  const temMapa = !!(map && map.rows);
  if (temMapa) {
    const cols = Number(map.w) || (typeof GRID_W !== "undefined" ? GRID_W : 21);
    const rows = Number(map.h) || (typeof GRID_H !== "undefined" ? GRID_H : 13);
    drawTileCharMap(ctx, map, W, H, cols, rows);
  } else {
    ctx.fillStyle = "#171719";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.textAlign = "left";
  ctx.font = hudFont(14, hudS, true);
  ctx.fillStyle = "#ffe680";
  ctx.fillText("Área de Treino", 12 * hudS, 24 * hudS);

  const dummyPos = training.dummyPos || { x: 0.5625, y: 0.472222 };
  drawAcademyDummy(ctx, W, H, tile, hudS, training, dummyPos);

  const entities = (training.members || []).slice().sort((a, b) => a.playerPos.y - b.playerPos.y);
  for (const m of entities) drawAcademyMember(this, ctx, W, H, tile, hudS, training, m, player, dt);
  for (const m of entities) {
    if (m.proj) drawAcademyProj(this, ctx, W, H, tile, m, dt);
  }

  const fxNow = Date.now();
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    if ((Number(e.delayUntil) || 0) > fxNow) continue;
    e.t = (Number(e.t) || 0) + (Number(dt) || 0);
    if (fxEffectExpired(e, fxNow)) { this.effects.splice(i, 1); continue; }
    const img = Sprites.fx(e.name);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const meta = fxClientMeta(e.name);
    const fw = fxStripCellWidth(img, e.frames, meta);
    const f = Math.min(e.frames - 1, Math.floor((e.t / e.dur) * e.frames));
    const sc = tibiaScale(W) * (e.scale || 1);
    const o = effectTileOrigin(e.x * W, e.y * H, fw * sc, img.naturalHeight * sc, tile);
    ctx.drawImage(img, f * fw, 0, fw, img.naturalHeight, o.x, o.y, fw * sc, img.naturalHeight * sc);
  }

  ctx.textAlign = "center";
  for (let i = this.floaters.length - 1; i >= 0; i--) {
    const f = this.floaters[i];
    f.life -= dt;
    if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
    const p = 1 - f.life / f.max;
    const alpha = floaterAlpha(p);
    ctx.globalAlpha = alpha;
    ctx.font = floaterFont(f, hudS);
    ctx.lineWidth = (f.kind ? 2 : (f.small ? 1.5 : 2)) * hudS;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(f.text, (f.x + f.vx * p * 60) * W, (f.y + f.vy * p * 22) * H);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, (f.x + f.vx * p * 60) * W, (f.y + f.vy * p * 22) * H);
    ctx.globalAlpha = 1;
  }
};

/* Corpse de player conforme Player::getLookCorpse() do Canary. */
function drawPlayerCorpse(ctx, W, H, ent, p, until, startedAt, permanent) {
  if (!ent || !p || (!until && !permanent)) return;
  const px = (ent.x || 0) * W, py = (ent.y || 0) * H;
  const sex = String(p.sex || p.gender || "").toLowerCase();
  const corpseId = /female|femin|^f$/.test(sex) ? 4247 : 4240;
  const corpse = (typeof TileSprites !== "undefined") ? TileSprites.get(corpseId) : null;
  const ts = tilePx(W);
  if (corpse && corpse.complete && corpse.naturalWidth) {
    const sc = ts / 32, cw = corpse.naturalWidth * sc, ch = corpse.naturalHeight * sc;
    ctx.drawImage(corpse, px - cw / 2, py - ch, cw, ch);
  }
  // Na Scarlett o corpse permanece até o fim da luta, sem contador/revive.
  if (permanent) return;
  const now = Date.now(), left = Math.max(0, Math.ceil((until - now) / 1000));
  const total = Math.max(1, until - (startedAt || now));
  const elapsed = Math.max(0, Math.min(1, 1 - (until - now) / total));
  const hudS = canvasHudScale(ctx.canvas);
  ctx.font = hudFont(16, hudS, true); ctx.textAlign = "center";
  ctx.globalAlpha = Math.max(.35, 1 - elapsed * .55);
  ctx.strokeStyle = "#000"; ctx.lineWidth = 3 * hudS;
  const ly = py - ts * .85 - elapsed * ts * .7;
  ctx.strokeText(left + "s", px, ly); ctx.fillStyle = "#ff3b30"; ctx.fillText(left + "s", px, ly);
  ctx.globalAlpha = 1;
}

/* Poeira permanente dos monstros da Exaltation Forge (Canary). As
 * partículas sobem do lado DIREITO da criatura, com fase derivada do id
 * — portanto animam sem criar arrays/objetos persistentes a cada frame.
 * Fiendish usa mais partículas e brilho roxo; Influenced escala levemente
 * com a quantidade de stacks. */
/* OTC: ranged mostra flecha; Amp Res / force melee troca para espadas. */
function monsterAttackTypeIcon(ent) {
  if (!ent) return "";
  let ranged = !!(ent.def && ent.def.ranged);
  if (typeof monsterAttackRange === "function" && monsterAttackRange(ent) > .16) ranged = true;
  if (typeof moveInfo === "function") {
    const td = Number(moveInfo(ent.slug).targetDistance) || 0;
    if (td > 1) ranged = true;
  }
  if (!ranged) return "";
  if (ent.forceMeleeUntil && ent.forceMeleeUntil > Date.now()) return "melee-atk";
  if (typeof monsterTargetDistance === "function" && monsterTargetDistance(ent) <= 1) return "melee-atk";
  return "range-atk";
}

/* Marcador oficial do client ao lado da barra de vida: triângulo azul para
 * Influenced e vermelho para Fiendish. Poeira/glow não substituem este ícone
 * — ele é a identificação inequívoca mostrada no print do Tibia. */
function drawSinisterCreatureIcon(ctx,ent,cx,barY,hudScale){
  if(!ctx||!ent||(!ent.influenced&&!ent.fiendish)||typeof drawWikiIcon!=="function")return false;
  const s=Math.max(1,Number(hudScale)||1);
  const slug=ent.fiendish?"fiendish-creature":"influenced-creature",size=11*s;
  const iconX=Math.round(cx+TIBIA_BAR_W*s/2+2*s),iconY=Math.round(barY-4*s);
  const ok=drawWikiIcon(ctx,slug,iconX,iconY,size);
  if(!ent.fiendish&&typeof ctx.fillText==="function"){
    const n=Math.max(1,Math.min(5,Number(ent.sinisterStacks)||1));
    ctx.save();
    ctx.font="bold "+Math.max(1,Math.round(8*s))+"px Verdana";
    ctx.textAlign="left";
    ctx.textBaseline="bottom";
    ctx.lineJoin="round";
    ctx.strokeStyle="#000";ctx.lineWidth=2*s;
    const tx=iconX+size+1,ty=iconY+size;
    ctx.strokeText(String(n),tx,ty);
    ctx.fillStyle="#7ec8ff";
    ctx.fillText(String(n),tx,ty);
    ctx.restore();
  }
  return ok;
}

function drawSinisterDust(ctx,ent,cx,cy,tile,now){
  if(!ctx||!ent||(!ent.influenced&&!ent.fiendish))return;
  const fiendish=!!ent.fiendish;
  const stacks=fiendish?15:Math.max(1,Math.min(5,Number(ent.sinisterStacks)||1));
  const count=fiendish?14:Math.max(6,Math.min(10,5+stacks));
  const id=String(ent.id||ent.slug||"sinister");
  let seed=0;
  for(let i=0;i<id.length;i++)seed=(seed*31+id.charCodeAt(i))>>>0;
  const seconds=(Number(now)||Date.now())/1000;
  ctx.save();
  ctx.fillStyle=fiendish?"rgba(229,151,255,.98)":"rgba(139,213,255,.96)";
  ctx.shadowColor=fiendish?"#bd3fff":"#238fd5";
  ctx.shadowBlur=fiendish?8:5;
  for(let i=0;i<count;i++){
    // Canary: partículas no lado DIREITO da sprite
    const phase=((seconds*(fiendish?.5:.4)+i/count+(seed%997)/997)%1+1)%1;
    const spread=.38+((seed+i*37)%7)*.04;
    const drift=Math.sin(seconds*2.1+i*1.73+(seed%17))*.08;
    const x=cx+tile*(spread+drift);
    const y=cy+tile*.35-phase*tile*1.25;
    const size=Math.max(2,Math.round(tile*(fiendish?.09:.07)*(i%3===0?1.35:1)));
    ctx.globalAlpha=(fiendish?.6:.5)+(1-phase)*(fiendish?.4:.35);
    ctx.fillRect(Math.round(x-size/2),Math.round(y-size/2),size,size);
  }
  if(!fiendish&&typeof ctx.fillText==="function"){
    const hs=typeof canvasHudScale==="function"?canvasHudScale(ctx.canvas):1;
    ctx.globalAlpha=1;ctx.shadowBlur=0;
    ctx.font="bold "+Math.max(1,Math.round(9*hs))+"px Verdana";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.lineJoin="round";ctx.strokeStyle="#000";ctx.lineWidth=2*hs;
    const lx=cx+tile*.52,ly=cy-tile*.12,label=String(stacks);
    ctx.strokeText(label,lx,ly);ctx.fillStyle="#7ec8ff";ctx.fillText(label,lx,ly);
  }
  ctx.restore();
}

Renderer.prototype.draw = function (combat, player, dt) {
  const ctx = this.ctx;
  const canvasW = this.c.width, canvasH = this.c.height;
  const gridW = combat && combat.gridW ? combat.gridW
    : (typeof GRID_W !== "undefined" ? GRID_W : 21);
  const gridH = combat && combat.gridH ? combat.gridH
    : (typeof GRID_H !== "undefined" ? GRID_H : 13);
  const mapFov = combat && combat.huntMap;
  const fovW = mapFov && mapFov.fovWidth ? mapFov.fovWidth : undefined;
  const fovH = mapFov && mapFov.fovHeight ? mapFov.fovHeight : undefined;
  const view = (typeof centeredGridViewport === "function")
    ? centeredGridViewport(canvasW, canvasH, gridW, gridH, fovW, fovH)
    : { x: 0, y: 0, width: canvasW, height: canvasH };
  const W = view.width, H = view.height;

  // Fala/FX envelhecem mesmo fora do FOV ou com entidade sem draw neste frame.
  this.ageCombatSpeech(combat, dt);

  // A câmera não segue criaturas: permanece no centro geométrico do mapa.
  // O mundo inteiro é desenhado em escala nativa; o canvas recorta o FOV
  // fixo de 21×13, sem zoom-out em hunts grandes.
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = "#050605";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  const hunt = combat ? combat.hunt : null;
  const scene = hunt ? hunt.scene : "cave";

  // --- chao/mapa tileado
  // `combat` pode ser null numa transicao de hunt (stopHunt/startHunt em
  // andamento) — protege o acesso a huntMap para nao estourar o render.
  if (combat && combat.huntMap && typeof drawTileCharMap === "function") {
    /* mapa fechado com tiles oficiais (HUNTMAPS) — paredes reais.
     * Só o CHÃO aqui; paredes/pilares/objetos são desenhados DEPOIS das
     * criaturas (abaixo) para sobreporem monstros como no client. */
    drawTileCharMap(ctx, combat.huntMap, W, H, gridW, gridH, "ground");
  } else if (scene === "sewer") {
    drawRookgaardSewer(ctx, W, H);
  } else if (hunt && combat.huntId === "spiders") {
    drawSpiderCave(ctx, W, H);
  } else {
    const gr = Sprites.ground(scene);
    if (gr && gr.complete && gr.naturalWidth) {
      const s = 2;
      const tw = gr.naturalWidth * s, th = gr.naturalHeight * s;
      for (let y = 0; y < H; y += th)
        for (let x = 0; x < W; x += tw)
          ctx.drawImage(gr, x, y, tw, th);
    } else {
      ctx.fillStyle = "#1c1a15";
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Iluminação/vinheta dinâmica desativada: o OTC/Canary aplica luz por
  // criatura e por tile. Sem esse sistema completo, a vinheta escurecia
  // artificialmente as bordas e escondia detalhes do mapa idle.

  ctx.save();
  // Vibracao de camera removida a pedido: o translate aleatorio daqui
  // sacudia o mapa inteiro a cada golpe recebido, explosao e morte. O Tibia
  // nao move a camera por dano, e num jogo idle (tela aberta por horas) o
  // tremor constante cansa a vista.

  // --- corpses
  for (let i = this.corpses.length - 1; i >= 0; i--) {
    const c = this.corpses[i];
    c.life -= dt;
    if (c.life <= 0) { this.corpses.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, c.life / 1200) * 0.5;
    const img = Sprites.mob(c.slug, "s");
    if (spriteReady(img)) {
      // o cadaver e a mesma sprite do bicho achatada: precisa da escala do
      // tile, senao fica maior que a criatura viva que acabou de morrer
      const sc = tibiaScale(W);
      const iw = spriteW(img), ih = spriteH(img);
      ctx.save();
      ctx.translate(c.x * W, c.y * H);
      ctx.scale(1, 0.4);
      ctx.drawImage(img, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // --- entidades + paredes intercaladas por SQM (profundidade Tibia/OTC).
  // Antes: todas as criaturas, depois TODAS as paredes → parede à esquerda
  // do player cobria ele. Agora cada célula desenha bloqueantes e depois
  // as criaturas daquele SQM (N→S, O→L).
  const depthEntities = buildRenderEntities(combat, player);
  const entityInfo = [];
  const kindOrder = { monster: 0, ally: 1, player: 2 };
  const depthDrawables = [];

  const paintEntity = (e) => {
    const ent = e.ent;
    let img = null, w = 0, h = 0, name = '', hpPct = 0, mpPct = null, shieldPct = 0;
    if (e.kind === "monster") {
      if (ent.moving) {
        const walk = Sprites.mobWalk(ent.slug, ent.dir || "w", ent.frame || 1);
        img = spriteReady(walk) ? walk : Sprites.mob(ent.slug, ent.dir || "w");
      } else {
        const idleMeta = monsterIdleMeta(ent.slug);
        const idle = idleMeta ? Sprites.mobIdle(ent.slug, ent.dir || "w",
          monsterIdleFrame(ent.slug, Date.now(), monsterAnimationPhase(ent))) : null;
        img = spriteReady(idle) ? idle : Sprites.mob(ent.slug, ent.dir || "w");
      }
      name = monsterRenderName(ent);
      hpPct = Math.max(0, ent.hp / ent.maxHp);
    } else {
      const frame = ent.moving ? (ent.frame || 1) : (typeof appearanceIdleFrame === "function" ? appearanceIdleFrame(e.p, Date.now()) : 0);
      img = OutfitRenderer.forPlayer(e.p, ent.dir || "e", frame);
      name = e.p.name;
      const mx = maxStats(e.p);
      hpPct = Math.max(0, e.p.hp / (mx.hp || 1));
      mpPct = Math.max(0, (e.p.mp || 0) / (mx.mp || 1));
      shieldPct = (typeof isMagicShieldActive === "function" && isMagicShieldActive(e.p, Date.now()))
        ? Math.max(0, Math.min(1, (e.p.magicShieldPool || 0) / (e.p.magicShieldCap || 1))) : 0;
    }
    if (!spriteReady(img)) {
      let fallback = null;
      if (e.kind === "monster") {
        fallback = Sprites.mob(ent.slug, "s") || Sprites.mob(ent.slug, "w") || Sprites.mob(ent.slug, "e") || Sprites.mob(ent.slug, "n");
      }
      if (spriteReady(fallback)) {
        img = fallback;
      } else {
        return;
      }
    }
    const sc = creatureScale(W); w = spriteW(img) * sc; h = spriteH(img) * sc;
    const cx = ent.x * W, cy = ent.y * H, tile = tilePx(W);
    const origin = creatureTileOrigin(cx, cy, w, h, tile, img._spriteAnchor, sc);
    if (e.kind === "monster" && (ent.fiendish || ent.influenced)) {
      ctx.save(); ctx.shadowColor = ent.fiendish ? '#c14bff' : '#39a8ff'; ctx.shadowBlur = ent.fiendish ? 22 : 18;
      ctx.globalAlpha = .92; drawMonsterSprite(ctx, img, origin.x, origin.y, w, h, ent.slug); ctx.restore();
    }
    if (e.kind === "monster") drawMonsterSprite(ctx, img, origin.x, origin.y, w, h, ent.slug);
    else ctx.drawImage(img, origin.x, origin.y, w, h);
    entityInfo.push({ e, ent, cx, cy, top:origin.y, w, h, name, hpPct, mpPct, shieldPct, tile });
  };

  for (const e of depthEntities) {
    const ent = e.ent;
    const tx = Math.max(0, Math.min(gridW - 1,
      Number.isFinite(ent.cx) ? (ent.cx | 0) : Math.floor((ent.x || 0) * gridW)));
    const ty = Math.max(0, Math.min(gridH - 1,
      Number.isFinite(ent.cy) ? (ent.cy | 0) : Math.floor((ent.y || 0) * gridH)));
    depthDrawables.push({
      tx: tx, ty: ty, footY: e.footY, order: kindOrder[e.kind] || 0,
      draw: () => paintEntity(e),
    });
  }

  if (combat && combat.huntMap && typeof drawTileCharMap === "function") {
    drawTileCharMap(ctx, combat.huntMap, W, H, gridW, gridH, "objects",
      { drawables: depthDrawables });
  } else {
    for (const d of (typeof sortTileDepthDrawables === "function"
      ? sortTileDepthDrawables(depthDrawables) : depthDrawables)) {
      if (typeof d.draw === "function") d.draw();
    }
  }
  // --- Poeira da Exaltation Forge (influenced/fiendish) — DEPOIS dos
  // objetos do mapa, igual ao Canary: a poeira fica por cima de paredes
  // e pilares. Antes era desenhada junto com a sprite e os objetos do mapa
  // a cobriam, fazendo a poeira "sumir".
  for (const info of entityInfo) {
    if (info.e.kind === "monster")
      drawSinisterDust(ctx, info.ent, info.cx, info.cy, info.tile, Date.now());
  }

  // Ordem visual solicitada: arena/grounds < bossbar < healthbars dos players.
  // A bossbar vem depois de chão, paredes e sprites, mas antes dos labels.
  drawBossBar(ctx, canvasW, combat, -view.x, -view.y, canvasHudScale(this.c));

  // --- informações: segunda passagem, sempre acima de TODAS as sprites.
  // OTC Creature::drawInformation: nome+HP no dest interpolado da própria
  // criatura, mesma ordem bottom-up das outfits. Sem empilhar labels.
  const hudS = canvasHudScale(this.c);
  for (const info of entityInfo) {
    const layout = layoutCreatureInformation(info, W, H, hudS);
    const barY = layout.barY, nameY = layout.nameY, y = layout.nameY;
    const nameX = layout.nameX, barX = layout.barX;
    if (info.e.kind === 'monster') {
      drawTibiaBar(ctx, barX, barY, info.hpPct, tibiaHpColor(info.hpPct), hudS);
      drawNameText(ctx, nameX, nameY, info.name, tibiaHpColor(info.hpPct), hudS);
      drawSinisterCreatureIcon(ctx,info.ent,barX,barY,hudS);
      const iconSize = 9 * hudS;
      let iconX = Math.round(info.cx + info.w/2 + 3 * hudS);
      const iconY = Math.round(info.top + info.h*.35);
      const atkIcon = typeof monsterAttackTypeIcon === "function" ? monsterAttackTypeIcon(info.ent) : "";
      if (atkIcon) {
        drawWikiIcon(ctx, atkIcon, iconX, iconY, iconSize);
        iconX += iconSize + 2 * hudS;
      }
      const nowHud = Date.now();
      if (info.ent.sapStrUntil && info.ent.sapStrUntil > nowHud) {
        drawWikiIcon(ctx, "sap-strength", iconX, iconY, iconSize);
        iconX += iconSize + 2 * hudS;
      }
      if (info.ent.exposeUntil && info.ent.exposeUntil > nowHud)
        drawWikiIcon(ctx, "expose-weakness", iconX, iconY, iconSize);
    } else {
      drawNameBars(ctx, nameX, nameY, info.name, info.hpPct, info.mpPct, info.shieldPct, barY, barX, hudS);
    }
    if (info.e.kind === 'monster') drawCreatureSpeech(ctx, info.ent, info.cx, y, null, hudS);
    else if (info.e.kind === 'player') {
      // Cada personagem tem a própria fila (creatureSay no caster). O
      // playerTalk do renderer só cobre o fallback addSpeech sem whoId.
      // dt=null: ageCombatSpeech já consumiu o frame (evita half-life).
      drawCreatureSpeech(ctx, info.ent, info.cx, y, null, hudS);
      if (combat && combat.player && info.ent === combat.player) this.drawSpeech(ctx, info.cx, y, null, hudS);
    } else drawCreatureSpeech(ctx, info.ent, info.cx, y, null, hudS);
  }

  // --- projeteis / ataques a distancia
  for (let i = this.projectiles.length - 1; i >= 0; i--) {
    const p = this.projectiles[i];
    p.t += dt;
    if (p.t >= p.dur) { this.projectiles.splice(i, 1); continue; }
    const q = Math.min(1, p.t / p.dur);
    const hx = (p.sx + (p.tx - p.sx) * q) * W;
    const hy = (p.sy + (p.ty - p.sy) * q) * H;

    // sprite real do Tibia, já desenhado na direção do voo
    const img = p.missile ? Sprites.missile(p.missile, p.dir) : null;
    if (img && img.complete && img.naturalWidth) {
      // o projetil e uma sprite de 32px como qualquer outra: usa a escala
      // do tile em vez do 1.6 fixo, senao a flecha fica maior que o monstro
      const sc = tibiaScale(W);
      const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
      ctx.drawImage(img, hx - w / 2, hy - h / 2, w, h);
    } else {
      // fallback: risco luminoso, como antes
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.35 + (1 - q) * 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((p.sx + (p.tx - p.sx) * Math.max(0, q - 0.18)) * W,
                 (p.sy + (p.ty - p.sy) * Math.max(0, q - 0.18)) * H);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // --- efeitos
  const fxNow = Date.now();
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    if ((Number(e.delayUntil) || 0) > fxNow) continue;
    e.t = (Number(e.t) || 0) + (Number(dt) || 0);
    if (fxEffectExpired(e, fxNow)) { this.effects.splice(i, 1); continue; }
    const img = Sprites.fx(e.name);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const meta = fxClientMeta(e.name);
    const fw = fxStripCellWidth(img, e.frames, meta);
    const f = Math.min(e.frames - 1, Math.floor((e.t / Math.max(1, e.dur)) * e.frames));
    // mesma escala do resto do mapa: o efeito do client cobre 1 SQM. Com o
    // "2" fixo que estava aqui a explosao ficava do tamanho de 3 tiles e
    // parecia solta do grid. Âncora de chão (effectTileOrigin): 64px não
    // derrapa para o SQM sul. Usa view.tile (FOV), não GRID_W — senão o
    // FX fica menor/maior que o chão em mapas 30×30.
    const tile = (view && view.tile) || tilePx(W);
    const sc = (tile / TIBIA_SPRITE) * (e.scale || 1);
    const drawW = fw * sc, drawH = img.naturalHeight * sc;
    const origin = effectTileOrigin(e.x * W, e.y * H, drawW, drawH, tile);
    ctx.drawImage(img, f * fw, 0, fw, img.naturalHeight,
                  origin.x, origin.y, drawW, drawH);
  }

  ctx.restore();

  // --- numeros flutuantes — Canary + anti-flood para MOTA.
  // Posicionamento Canary: texto centralizado em cima da sprite e subindo.
  ctx.textAlign = "left";
  const floaterHud = canvasHudScale(this.c);
  for (let i = this.floaters.length - 1; i >= 0; i--) {
    const f = this.floaters[i];
    f.life -= dt;
    if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
    const elapsed = f.max - f.life;
    const tf = f.max;
    const p = elapsed / tf;
    ctx.font = floaterFont(f, floaterHud);
    const textW = ctx.measureText(f.text).width;
    const scale = (typeof tibiaScale !== 'undefined') ? tibiaScale(W) : (typeof tilePx !== 'undefined' ? tilePx(W)/32 : 1);
    const baseX = f.x * W;
    const baseY = f.y * H;
    // f.x/f.y já são o CENTRO normalizado da entidade/SQM (cellToScreen usa
    // +0.5). Somar mais meio tile deslocava todo número para baixo e para a
    // direita. O texto nasce exatamente no alvo e sobe dali, como no Canary.
    let fx = baseX - textW / 2 + (f.offsetX || 0);
    let fy = baseY - 64 * scale * p + (f.offsetY || 0);
    const t0 = tf / 1.2;
    let alpha = 1;
    if (elapsed > t0) {
      alpha = Math.max(0, 1 - (elapsed - t0) / (tf - t0));
    } else if (p > 0.15) {
      // leve fade desde 15% para reduzir poluição em área grande
      alpha = 0.95;
    }
    ctx.globalAlpha = alpha;
    ctx.lineWidth = (f.kind ? 2 : (f.small ? 1.5 : 2)) * floaterHud;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(f.text, fx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "center";

  // Membros inconscientes / permadead: corpse oficial imóvel (sem outfit).
  // Solo em boss também usa o mesmo path (players pode estar ausente).
  if (combat && !combat.dead) {
    const downed = (combat.players && combat.players.length)
      ? combat.players
      : (combat.player ? [combat.player] : []);
    for (const ent of downed) {
      if (!ent || !ent.p || ent.p.hp > 0 || (!ent.reviveAt && !ent.permadead)) continue;
      const pos = ent.deathPos ? Object.assign({}, ent, ent.deathPos) : ent;
      drawPlayerCorpse(ctx, W, H, pos, ent.p, ent.reviveAt, ent.downedAt, !!ent.permadead);
    }
  }

  // --- morte do player (hunt): corpse oficial Canary e contador de respawn.
  // Boss wipe NÃO usa este path (sem contador — só corpses permadead acima).
  if (combat && combat.dead && !combat.boss) {
    const dp = combat.deathPos || { x: 0.18, y: 0.62, dir: "e" };
    const px = dp.x * W, py = dp.y * H;
    // Canary Player::getLookCorpse(): masculino 4240, feminino 4247.
    const sex = String((player && (player.sex || player.gender)) || "").toLowerCase();
    const corpseId = /female|femin|^f$/.test(sex) ? 4247 : 4240;
    const corpse = (typeof TileSprites !== "undefined") ? TileSprites.get(corpseId) : null;
    const ts = tilePx(W);
    if (corpse && corpse.complete && corpse.naturalWidth) {
      const scale = ts / 32;
      const cw = corpse.naturalWidth * scale, ch = corpse.naturalHeight * scale;
      // Item corpse ancora pelo pé/base do SQM, como o client.
      ctx.drawImage(corpse, px - cw / 2, py - ch, cw, ch);
    }
    const now = Date.now();
    const left = Math.max(0, Math.ceil((combat.deadUntil - now) / 1000));
    const total = Math.max(1, combat.deadUntil - (combat.deadAt || now));
    const elapsed = Math.max(0, Math.min(1, 1 - (combat.deadUntil - now) / total));
    // Contador vermelho sobe continuamente sobre o corpo até o respawn.
    const labelY = py - ts * 0.85 - elapsed * ts * 0.7;
    ctx.font = hudFont(16, canvasHudScale(this.c), true);
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.max(.35, 1 - elapsed * .55);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3 * canvasHudScale(this.c);
    ctx.strokeText(left + "s", px, labelY);
    ctx.fillStyle = "#ff3b30";
    ctx.fillText(left + "s", px, labelY);
    ctx.globalAlpha = 1;
  }

  // --- sem hunt
  if (!combat) {
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = hudFont(14, canvasHudScale(this.c), true);
    ctx.fillStyle = "#c8c0a8";
    ctx.textAlign = "center";
    ctx.fillText("Escolha uma caçada para começar", W / 2, H / 2);
  }
  ctx.restore(); // câmera/clip central da instância
};

/* Retorna o id do NPC sob as coordenadas do canvas */
Renderer.prototype.npcAt = function (mx, my) {
  if (!this.npcHit) return null;
  for (const h of this.npcHit) {
    if (mx >= h.x - h.w / 2 && mx <= h.x + h.w / 2 &&
        my >= h.y - h.h / 2 - 18 && my <= h.y + h.h / 2) return h.id;
  }
  return null;
};

/* mantido por compatibilidade: o outfit real vem de playerOutfit() */
Renderer.prototype.outfitFor = function (p) {
  return playerOutfit(p).name;
};
