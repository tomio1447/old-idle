/*
 * render.js — desenha a cena de caca (chao, monstros, player, dano flutuante)
 */
"use strict";

/* escala do sprite do jogador na cena de caca (monstro comum usa 2.0) */
const PLAYER_SCALE = 1.8;

/* ---------------------------------------------------- escala por SQM
 *
 * O canvas tem exatamente GRID_W (21) SQMs de largura, entao um tile vale
 * W/21 pixels. As escalas eram numeros fixos (2.0, 2.2, 2.6 conforme o HP
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

/* v33: escala das SPRITES de criaturas (jogador, aliados, monstros) um
 * pouco MAIOR que o tile nativo (1.18x) — o pedido foi aumentar o tamanho
 * das sprites. Efeitos/projéteis continuam no tibiaScale normal. */
function creatureScale(W) { return tibiaScale(W) * 1.18; }

/* Versao dos assets. O navegador cacheia PNG de forma agressiva, entao
 * atualizar uma sprite no repositorio nao chegava em quem ja tinha aberto o
 * jogo — a arte antiga continuava aparecendo ate limpar o cache na mao.
 * Subir esse numero a cada lote de sprites novas forca o download. */
const ASSET_VERSION = "40";

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

/* HTML de uma celula do sheet para as telas (bestiario, lista de caca...).
 *
 * As telas montavam <img src="assets/mob/<slug>_s.png">, mas os quadros
 * soltos deixaram de existir quando cada criatura virou um sheet unico.
 * Como <img> nao recorta, usamos uma div com background-position: o mesmo
 * arquivo serve a tela e o canvas, sem duplicar arte.
 */
function mobImg(slug, tam, extra) {
  const meta = (typeof MOBSHEETS !== "undefined" && MOBSHEETS)
    ? MOBSHEETS[slug] : null;
  const px = tam || 32;
  if (!meta) {
    // criatura sem sheet: espaco vazio, para o grid da tela nao quebrar
    return `<div class="mob-img" style="width:${px}px;height:${px}px;
            ${extra || ""}"></div>`;
  }
  // a celula do sul e a linha 2; escala para caber na caixa pedida
  const k = Math.min(px / meta.cw, px / meta.ch);
  const w = meta.cw * k, h = meta.ch * k;
  const v = typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "1";
  return `<div class="mob-img" style="width:${w.toFixed(1)}px;
      height:${h.toFixed(1)}px;
      background-image:url('assets/mob/${slug}.png?v=${v}');
      background-size:${(meta.cw * meta.cols * k).toFixed(1)}px ${
        (meta.ch * meta.rows * k).toFixed(1)}px;
      background-position:0 -${(2 * h).toFixed(1)}px;
      image-rendering:pixelated;${extra || ""}"></div>`;
}


function fxClientMeta(name) {
  const aliases = (typeof window !== "undefined" && window.FX_OFFICIAL_ALIASES) || {};
  const all = (typeof window !== "undefined" && window.CLIENT_EFFECTS) || {};
  const key = aliases[name] || name;
  return all[key] || null;
}

function fxFrameCount(name) {
  const meta = fxClientMeta(name);
  if (meta && meta.frames) return meta.frames;
  return FX_FRAMES[name] || 0;
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
    if (!sheet.naturalWidth) { this.mobCache[k] = null; return null; }
    const cv = document.createElement("canvas");
    cv.width = meta.cw; cv.height = meta.ch;
    cv.getContext("2d").drawImage(sheet, col * meta.cw, linha * meta.ch,
                                  meta.cw, meta.ch, 0, 0, meta.cw, meta.ch);
    this.mobCache[k] = cv;
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
    const meta = fxClientMeta(name);
    if (meta && meta.path) return this.get(meta.path);
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
  // Impacto em area da Diamond Arrow: a nota oficial do item registra
  // "[Blue Electricity Effects] appears on the damage area". O areaFx
  // importado pelo elemento fisico caiu no "energy-hit" antigo — sprite em
  // assets/fx/blue-electricity.png (Blue_Electricity_Effect.gif do fandom,
  // 18 quadros de 32px).
  "forked-glacier": 13,         // garra eletrica (Effect 324)
  "forked-thorns": 19,          // rajada terrosa (Effect 325)
  "death-echo": 9,              // fantasma roxo (Effect 332)
  "fist-thousand": 8,           // corte sombrio (Effect 321)
  "crit-text": 14,              // "CRIT!" (Effect 341)
  "fatal-text": 4,              // "FATAL!" / Onslaught Effect
  "mana-wisp": 14,              // vivacidades de mana (Effect 337)
  "blue-electricity": 18,       // Blue Electricity Effect (diamond arrow)
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

Renderer.prototype.resize = function () {
  const w = this.c.parentElement.clientWidth;
  // câmera reduzida e com mais visão: 21 × 13 SQMs.
  const h = Math.round(w * (13 / 21));
  // Canvas em DPR (máx. 2x) + desenho nearest: nítido e sem serrilhado.
  // O loop roda em requestAnimationFrame — na taxa do display (60/120/144Hz).
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const nw = Math.max(1, Math.round(w * dpr));
  const nh = Math.max(1, Math.round(h * dpr));
  if (this.c.width !== nw || this.c.height !== nh) {
    this.c.width = nw;
    this.c.height = nh;
    this.ctx.imageSmoothingEnabled = false;
  }
};

Renderer.prototype.addFloater = function (x, y, text, color, big, small, dur, mid) {
  // v37: tempos de exibição reduzidos — dano 1,5s (fonte 3) e cura HP/mana
  // 1,2s (fonte 2) — menos poluição visual no combate. `dur` opcional
  // sobrescreve o default (2,4s big / 1,9s normal).
  const life = dur || (big ? 2400 : 1900);
  this.floaters.push({
    x: x, y: y, text: text, color: color,
    life: life, max: life,
    big: !!big,
    small: !!small,   // fonte 1: textos bem pequenos (v27)
    mid: !!mid,       // fonte 2: cura HP/mana (v37)
    // Sobem em LINHA RETA, exatamente como no client do Tibia: sem drift
    // lateral (vx = 0) e com velocidade vertical constante.
    vy: -0.007,
    vx: 0,
  });
  if (this.floaters.length > 60) this.floaters.shift();
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

/* Duracao da fala na tela. O client mantem por alguns segundos; grito dura
 * um pouco mais, por ser evento raro e chamativo. */
function talkDuracao(tipo) {
  return tipo === TALK.MONSTER_YELL ? 4000 : 3000;
}

/* Empilha uma fala num dono qualquer (jogador ou monstro).
 * `dono` e o objeto da criatura; guardamos a fila nele mesmo para a fala
 * acompanhar quem falou enquanto a criatura anda. */
function creatureSay(dono, texto, tipo) {
  if (!dono || !texto) return;
  tipo = tipo || TALK.SAY;
  dono.speech = dono.speech || [];
  // empurra as falas antigas para cima, como no client
  for (const sp of dono.speech) sp.slot = (sp.slot || 0) + 1;
  const dur = talkDuracao(tipo);
  dono.speech.push({
    // o client mostra o grito em caixa alta
    text: tipo === TALK.MONSTER_YELL ? String(texto).toUpperCase() : texto,
    tipo: tipo, color: TALK_COR[tipo] || "#ffe680",
    life: dur, max: dur, slot: 0,
  });
  if (dono.speech.length > 4) dono.speech.shift();
}

/* Desenha e envelhece a fila de falas de uma criatura. */
function drawCreatureSpeech(ctx, dono, x, y, dt) {
  if (!dono || !dono.speech || !dono.speech.length) return;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  for (let i = dono.speech.length - 1; i >= 0; i--) {
    const sp = dono.speech[i];
    sp.life -= dt;
    if (sp.life <= 0) { dono.speech.splice(i, 1); continue; }
    // o grito e maior, como no client
    ctx.font = (sp.tipo === TALK.MONSTER_YELL ? "bold 12px" : "bold 10px") +
               " Verdana";
    const a = Math.min(1, sp.life / 700);
    const ty = y - 34 - (sp.slot || 0) * 13;
    ctx.globalAlpha = a;
    ctx.lineWidth = 3;
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

Renderer.prototype.drawSpeech = function (ctx, x, y, dt) {
  drawCreatureSpeech(ctx, this.playerTalk, x, y, dt);
};

Renderer.prototype.addEffect = function (x, y, name, customDurMs) {
  let n = fxFrameCount(name);
  if (!n) { name = "draw-blood"; n = fxFrameCount(name) || 4; }
  // Os efeitos oficiais importados da TibiaWiki têm durações diferentes;
  // quando não há duração customizada, usa ~55ms por quadro com teto seguro.
  this.effects.push({ x: x, y: y, name: name, t: 0,
                      frames: n, dur: customDurMs || Math.max(300, Math.min(900, n * 55)) });
  // O teto era 20, o que TRUNCAVA area grande: Hell's Core cobre 45 casas e
  // as primeiras eram descartadas antes de aparecer. 120 cabe a maior
  // matriz do jogo com folga e ainda protege contra vazamento.
  if (this.effects.length > 120) this.effects.shift();
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
function drawNameText(ctx, x, y, name, cor) {
  ctx.font = "bold 9px Verdana";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeText(name, x, y);
  ctx.fillStyle = cor || "#ffffff";
  ctx.fillText(name, x, y);
}

/* Barra de vida do Tibia: 27x4 com 1px de borda preta.
 *
 * O client usa largura FIXA (nao acompanha o tamanho da criatura) e a cor
 * muda em degraus conforme a faixa de vida — nao ha gradiente nem barra
 * proporcional ao sprite. */
const TIBIA_BAR_W = 27;
const TIBIA_BAR_H = 4;

/* Degraus de cor do client: >60 verde, >30 amarelo, >8 laranja/vermelho. */
function tibiaHpColor(pct) {
  const p = pct * 100;
  if (p > 60) return "#00c000";
  if (p > 30) return "#c0c000";
  if (p > 8) return "#c07800";
  if (p > 3) return "#c00000";
  return "#600000";
}

function drawTibiaBar(ctx, x, y, pct, cor) {
  const w = TIBIA_BAR_W, h = TIBIA_BAR_H;
  const bx = Math.round(x - w / 2), by = Math.round(y);
  ctx.fillStyle = "#000";
  ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
  ctx.fillStyle = cor;
  ctx.fillRect(bx, by, Math.round(w * Math.max(0, Math.min(1, pct))), h);
}

/* Cor da barra de HP do personagem na cena — MESMO padrao da healthbar do
 * HUD (hpBarColor, em ui.js): verde > amarelo > laranja > vermelho. Antes o
 * personagem usava tibiaHpColor (paleta diferente/apagada em relacao a barra
 * de vida da interface), por isso parecia sem a cor certa. */
function playerHpBarColor(pct) {
  if (typeof hpBarColor === "function") return hpBarColor(pct).text;
  if (pct > 0.6) return "#4ade80";
  if (pct > 0.3) return "#facc15";
  if (pct > 0.1) return "#fb923c";
  return "#f87171";
}

function drawNameBars(ctx, x, y, name, hpPct, mpPct) {
  // ordem do client: barra de vida logo acima da criatura e o nome acima
  // dela. A mana so aparece para o proprio jogador (o Tibia nao mostra mana
  // de terceiros), entao fica numa terceira linha, mais fina.
  const hpY = y + 2;
  drawNameText(ctx, x, y - 3, name, "#ffffff");
  drawTibiaBar(ctx, x, hpY, hpPct, playerHpBarColor(hpPct));
  if (mpPct !== undefined && mpPct !== null) {
    drawTibiaBar(ctx, x, hpY + TIBIA_BAR_H + 2, mpPct, "#3c66ff");
  }
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
  if (mode === "arcs") drawStatusArcs(ctx, x, centerY, player.name, hpPct, mpPct, radius || 34);
  else drawNameBars(ctx, x, yTop, player.name, hpPct, mpPct);
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

function drawBossBar(ctx, W, combat) {
  if (!combat || !combat.boss || !combat.mobs.length) return;
  const boss = combat.mobs.find((m) => m.boss) || combat.mobs[0];
  if (!boss || boss.hp <= 0) return;
  const pct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  const bw = Math.min(520, W * 0.72), bh = 18;
  const x = (W - bw) / 2, y = 10;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.78)";
  ctx.fillRect(x - 3, y - 3, bw + 6, bh + 24);
  ctx.strokeStyle = "#8b6b2a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 3, y - 3, bw + 6, bh + 24);
  ctx.fillStyle = "#050505";
  ctx.fillRect(x, y + 17, bw, bh);
  const g = ctx.createLinearGradient(0, y + 17, 0, y + 17 + bh);
  g.addColorStop(0, "#ff5656");
  g.addColorStop(1, "#7c0808");
  ctx.fillStyle = g;
  ctx.fillRect(x, y + 17, bw * pct, bh);
  ctx.strokeStyle = "#000";
  ctx.strokeRect(x, y + 17, bw, bh);
  ctx.font = "bold 13px Verdana";
  ctx.textAlign = "center";
  // nome do boss na cor da vida tambem — mesma regra dos monstros da arena
  ctx.fillStyle = tibiaHpColor(pct);
  ctx.fillText(boss.def.name, W / 2, y + 11);
  ctx.font = "bold 10px Verdana";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.ceil(boss.hp)} / ${boss.maxHp}`, W / 2, y + 31);
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
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(8, 8, 178, 22);
  ctx.strokeStyle = "rgba(120,100,60,.6)";
  ctx.strokeRect(8, 8, 178, 22);
  ctx.font = "bold 11px Verdana";
  ctx.textAlign = "left";
  ctx.fillStyle = "#d8c47a";
  ctx.fillText("Bueiro de Rookgaard", 16, 23);
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
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(8, 8, 190, 22);
  ctx.strokeStyle = "rgba(120,100,60,.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, 190, 22);
  ctx.font = "bold 11px Verdana";
  ctx.textAlign = "left";
  ctx.fillStyle = "#c8d87a";
  ctx.fillText("Caverna das Aranhas", 16, 23);
}

Renderer.prototype.addCorpse = function (x, y, slug) {
  this.corpses.push({ x: x, y: y, slug: slug, life: 2000 });
  if (this.corpses.length > 8) this.corpses.shift();
};

Renderer.prototype.drawAcademy = function (training, player, dt) {
  const ctx = this.ctx;
  const W = this.c.width, H = this.c.height;
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
  ctx.font = "bold 14px Verdana";
  ctx.fillStyle = "#d8d8dc";
  ctx.fillText(temMapa ? "Sala de Exercise Weapons" : (isDummy ? "Ferumbras Dummy Safezone" : "Academia Safezone"), 12, 24);
  ctx.font = "10px Verdana";
  ctx.fillStyle = "#999";
  if (isDummy) {
    const w = training.weapon ? (EXERCISE_WEAPONS[training.weapon] || {}).name : "—";
    ctx.fillText("Exercise weapon: " + w + " · 1 carga/golpe · regen stamina 3:1", 12, 40);
  } else {
    ctx.fillText("Treiner padrão · sem custo · regen stamina 1:1 · conjure disponível", 12, 40);
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
  if (training.mode === "dummy" && training.lungeT > 0) {
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
    // SEM bob: sprite fixa no chão, como no client
    const top = pyF - h / 2;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(pxF, pyF + h * 0.42, w * 0.34, h * 0.1, 0, 0, 7); ctx.fill();
    ctx.drawImage(pimgAtk, pxF - w / 2, top, w, h);
    drawPlayerStatus(ctx, pxF, top - 14, pyF, player, player.config.barMode, Math.max(26, w * 0.42));
    this.drawSpeech(ctx, pxF, top - 14, dt);

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
    ctx.font = "bold 12px Verdana";
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.fillText("Ferumbras Exercise Dummy", tx + 1, ty - 90);
    ctx.fillStyle = "#d8d8dc";
    ctx.fillText("Ferumbras Exercise Dummy", tx, ty - 91);

    // cargas da exercise weapon (sem barra de HP — o dummy não leva dano)
    const cargas = (player.exercise && training.weapon)
      ? (player.exercise[training.weapon] || 0) : 0;
    ctx.font = "10px Verdana";
    ctx.fillStyle = "#999";
    ctx.fillText(fmtFull(cargas) + " cargas", tx, ty - 105);
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
    ctx.font = "bold 12px Verdana";
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.fillText("Treiner", tx + 1, ty - 64);
    ctx.fillStyle = "#d8d8dc";
    ctx.fillText("Treiner", tx, ty - 65);

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
  ctx.font = "11px Verdana";
  ctx.fillStyle = "rgba(20,20,24,.80)";
  ctx.fillRect(12, H - 58, 250, 44);
  ctx.strokeStyle = "rgba(100,100,110,.45)";
  ctx.strokeRect(12, H - 58, 250, 44);
  ctx.fillStyle = "#b0b0b8";
  const sk = training.skill ? (SKILL_NAMES[training.skill] || training.skill) : "—";
  ctx.fillText("Skill: " + sk, 22, H - 38);
  ctx.fillText("Hits: " + fmtFull(training.stats.hits) + " · Shielding ativo", 22, H - 22);

  // efeitos/números flutuantes
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    e.t += dt;
    if (e.t >= e.dur) { this.effects.splice(i, 1); continue; }
    const img = Sprites.fx(e.name);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const fw = img.naturalWidth / e.frames;
    const f = Math.min(e.frames - 1, Math.floor((e.t / e.dur) * e.frames));
    // mesma escala do resto do mapa: o efeito do client cobre 1 SQM. Com o
    // "2" fixo que estava aqui a explosao ficava do tamanho de 3 tiles e
    // parecia solta do grid.
    const sc = tibiaScale(W);
    ctx.drawImage(img, f * fw, 0, fw, img.naturalHeight,
                  e.x * W - fw * sc / 2, e.y * H - img.naturalHeight * sc / 2,
                  fw * sc, img.naturalHeight * sc);
  }
  ctx.textAlign = "center";
  for (let i = this.floaters.length - 1; i >= 0; i--) {
    const f = this.floaters[i];
    f.life -= dt;
    if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
    const p = 1 - f.life / f.max;
    const alpha = f.life < 300 ? f.life / 300 : 1;
    ctx.globalAlpha = alpha;
    // v37: escala de 3 fontes — fonte 3 (dano, bold 12px), fonte 2 (cura
    // HP/mana, 9px), fonte 1 (small 5px) / normal 11px. O dano é o maior e
    // a cura fica menor — hierarquia clara e menos poluição visual.
    ctx.font = (f.big ? "bold 12px" : (f.small ? "5px" : (f.mid ? "9px" : "11px"))) + " Verdana";
    ctx.lineWidth = f.small ? 1.5 : 2;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(f.text, (f.x + f.vx * p * 60) * W, (f.y + f.vy * p * 22) * H);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, (f.x + f.vx * p * 60) * W, (f.y + f.vy * p * 22) * H);
    ctx.globalAlpha = 1;
  }
};

Renderer.prototype.draw = function (combat, player, dt) {
  const ctx = this.ctx;
  const W = this.c.width, H = this.c.height;
  ctx.clearRect(0, 0, W, H);

  const hunt = combat ? combat.hunt : null;
  const scene = hunt ? hunt.scene : "cave";

  // --- chao/mapa tileado
  // `combat` pode ser null numa transicao de hunt (stopHunt/startHunt em
  // andamento) — protege o acesso a huntMap para nao estourar o render.
  if (combat && combat.huntMap && typeof drawTileCharMap === "function") {
    /* mapa fechado com tiles oficiais (HUNTMAPS) — paredes reais */
    drawTileCharMap(ctx, combat.huntMap, W, H, GRID_W, GRID_H);
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

  // vinheta
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.72)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  drawBossBar(ctx, W, combat);

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

  // --- player
  const pl = combat && combat.player ? combat.player : { x: 0.13, y: 0.62, dir: "e", moving: false, frame: 0 };
  const px = pl.x, py = pl.y;
  const pimg = OutfitRenderer.forPlayer(player, pl.dir || "e",
                                        pl.moving ? (pl.frame || 1) : 0);
  // Sem flutuação (bob senoidal) e sem animação de ataque no personagem:
  // a sprite fica parada no chão, como no client.
  const bob = 0;
  if (spriteReady(pimg)) {
    // v33: escala das criaturas 1.18x maior (pedido do dono)
    const sc = creatureScale(W);
    const w = spriteW(pimg) * sc, h = spriteH(pimg) * sc;
    const atkPush = 0;
    // Personagem projetado no MEIO do SQM (pedido do dono): a sprite fica
    // centralizada horizontal E verticalmente no tile. Antes a base era
    // ancorada na borda inferior do SQM e o personagem parecia "afundado"
    // no canto inferior do tile.
    const tile = tilePx(W);
    const top = py * H - h / 2;
    // sombra sob os pés, no centro do SQM
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.ellipse(px * W, py * H, w * 0.34, h * 0.1, 0, 0, 7);
    ctx.fill();
    if (this.playerFlash > 0) {
      ctx.save();
      ctx.filter = "brightness(2.2) saturate(0.4)";
      this.playerFlash -= dt;
    }
    const drawX = px * W - w / 2 + atkPush;
    const drawY = top + bob;
    // Avatar Stage 3 (Transcendence) ativo: glow colorido por vocação
    const avatarGlowOn = (typeof window !== "undefined" && window.avatarActive &&
                          player && player.voc && window.avatarActive(player, Date.now()));
    if (avatarGlowOn) {
      const AVATAR_GLOW = {
        knight: "#ff7a3a", paladin: "#ffe680",
        sorcerer: "#c78cff", druid: "#7ae87a",
        monk: "#66c7ff",
      };
      ctx.save();
      ctx.shadowColor = AVATAR_GLOW[player.voc] || "#c78cff";
      ctx.shadowBlur = 22;
      ctx.globalAlpha = 0.92;
    }
    ctx.drawImage(pimg, drawX, drawY, w, h);
    if (avatarGlowOn) ctx.restore();
    if (this.playerFlash > 0) ctx.restore();
    drawPlayerStatus(ctx, px * W, drawY - 14, py * H, player, player.config.barMode, Math.max(26, w * 0.42));
    this.drawSpeech(ctx, px * W, drawY - 14, dt);
    // Tag de PARTY (OTC/Canary) ao lado do nome: estrela amarela no líder,
    // círculo azul nos membros — igual ao client oficial.
    if (combat && combat.players && combat.players.length > 1) {
      const ehLider = (typeof partyIsLeaderLocal === "function" && partyIsLeaderLocal(player)) ||
                      !!(player._partyOnline && player._partyOnline.isLeader);
      const nmW = ctx.measureText(player.name).width;
      drawPartyTagIcon(ctx, px * W - nmW / 2 - 8, drawY - 20, ehLider);
    }
  }

  // --- aliados do PARTY COMBAT (todos os membros na mesma instância) ---
  if (combat && combat.players && combat.players.length > 1) {
    const allies = combat.players.filter((e) => e !== combat.player && e.p);
    for (const ent of allies) {
      const pp = ent.p;
      const knocked = pp.hp <= 0;
      const img = OutfitRenderer.forPlayer(pp, ent.dir || "e",
                                           ent.moving ? (ent.frame || 1) : 0);
      if (!spriteReady(img)) continue;
      const sc = creatureScale(W);   // v33: aliados 1.18x
      const w2 = spriteW(img) * sc, h2 = spriteH(img) * sc;
      const tile = tilePx(W);
      // aliados também centralizados no SQM (mesma regra do personagem ativo)
      const top = ent.y * H - h2 / 2;
      ctx.save();
      if (knocked) ctx.globalAlpha = 0.35;
      // sombra sob os pés, no centro do SQM
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(ent.x * W, ent.y * H, w2 * 0.34, h2 * 0.1, 0, 0, 7);
      ctx.fill();
      const atkPush2 = (ent.attackAnim || 0) > 0 ? (ent.dir === "w" ? -5 : ent.dir === "e" ? 5 : 0) : 0;
      ctx.drawImage(img, ent.x * W - w2 / 2 + atkPush2, top, w2, h2);
      ctx.restore();
      // nome + barra de vida compacta (como nos monstros)
      const pct = Math.max(0, Math.min(1, pp.hp / (maxStats(pp).hp || 1)));
      drawTibiaBar(ctx, ent.x * W, top - 9, pct, knocked ? "#7a7a7a" : "#6ec9ff");
      ctx.font = "10px Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.lineWidth = 3;
      ctx.strokeText(ent.name + (knocked ? " (inconsciente)" : ""), ent.x * W, top - 15);
      ctx.fillStyle = knocked ? "#9a9a9a" : "#d8ecff";
      ctx.fillText(ent.name + (knocked ? " (inconsciente)" : ""), ent.x * W, top - 15);
      // quadro de alvo azul no aliado ATIVO é desenhado no bloco do player;
      // aqui marca quem está sendo controlado com um leve contorno dourado
      if (!knocked) {
        ctx.strokeStyle = "rgba(214,175,55,.9)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ent.x * W - tile / 2 + 1, ent.y * H - tile / 2 + 1, tile - 2, tile - 2);
      }
      // Tag de PARTY ao lado do nome (membro = círculo azul) + fala do
      // aliado (magia/potion) acima do nome, como nos monstros
      const nmTag = ent.name + (knocked ? " (inconsciente)" : "");
      const nmW2 = ctx.measureText(nmTag).width;
      drawPartyTagIcon(ctx, ent.x * W - nmW2 / 2 - 8, top - 19, false);
      drawCreatureSpeech(ctx, ent, ent.x * W, top - 4, dt);
    }
  }

  // --- monstros
  if (combat && !combat.dead) {
    const mobs = combat.mobs.slice().sort((a, b) => a.y - b.y);
    for (const m of mobs) {
      // O frame vem do passo em andamento (advanceStep mantem ent.frame em
      // 0 parado e 1|2 durante o deslocamento). Antes era derivado de
      // Date.now(), ou seja, o bicho "pedalava" no lugar mesmo sem andar.
      const passo = m.moving ? (m.frame || 1) : 0;
      const anim = passo ? Sprites.mobWalk(m.slug, m.dir || "w", passo) : null;
      // se o passo nao existir, cai na pose parada em vez de sumir com o
      // monstro. spriteReady trata tanto <img> quanto o canvas do sheet.
      const img = spriteReady(anim) ? anim : Sprites.mob(m.slug, m.dir || "w");
      const mx = m.x * W;
      // sem oscilacao senoidal: no Tibia a criatura parada fica imovel no
      // SQM. O balanco daqui somava ao pedalar dos frames e dava a impressao
      // de que o bicho nunca sossegava.
      const my = m.y * H;
      if (spriteReady(img)) {
        // mesma escala do jogador: o porte da criatura vem do tamanho da
        // arte no DAT (32px = 1 SQM, 64px = 2 SQMs). v33: 1.18x maior
        const sc = creatureScale(W);
        const w = spriteW(img) * sc, h = spriteH(img) * sc;
        // Ancoragem do pe no SQM: a base da sprite encosta na borda inferior
        // do tile (o bicho "pisa" no chao), em vez de ficar centrada. Bicho de
        // 64px (2 SQMs) fica com o corpo acima do tile — antes afundava meio
        // tile no chao. A barra/nome acompanham o topo da sprite.
        const tile = tilePx(W);
        const top = my + tile / 2 - h;
        const atkPush = (m.attackAnim || 0) > 0 ? (m.dir === "w" ? -5 : m.dir === "e" ? 5 : 0) : 0;
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath();
        ctx.ellipse(mx, my + tile / 2, w * 0.32, h * 0.09, 0, 0, 7);
        ctx.fill();
        if (combat.mobs[0] === m) {
          // o quadro de alvo do client marca o SQM exato, nao a arte: fica
          // exatamente nos limites do tile onde a criatura esta
          drawTargetSquare(ctx, mx - tile / 2, my - tile / 2, tile, tile);
        }
        if (m.fiendish || m.influenced) {
          ctx.save();
          ctx.shadowColor = m.fiendish ? "#c14bff" : "#39a8ff";
          ctx.shadowBlur = m.fiendish ? 22 : 18;
          ctx.globalAlpha = 0.92;
          ctx.drawImage(img, mx - w / 2 + atkPush, top, w, h);
          ctx.restore();
        }
        ctx.drawImage(img, mx - w / 2 + atkPush, top, w, h);
        // barra de vida: largura fixa de 27px como no client, e nao
        // proporcional ao sprite (um dragao nao tem barra maior que um rato)
        const pct = Math.max(0, m.hp / m.maxHp);
        const by = top - 9;
        drawTibiaBar(ctx, mx, by, pct, tibiaHpColor(pct));
        // nome logo acima da barra, com contorno preto como no client.
        // A cor do TEXTO acompanha os degraus da barra de vida
        // (tibiaHpColor): verde/amarelo/laranja/vermelho dizem o estado do
        // bicho de longe, sem mirar a barra. O influenced continua
        // reconhecivel pelo brilho azul no sprite (m.influenced, acima).
        const mobName = typeof displayMonsterName === "function"
          ? displayMonsterName(m.def.name)
          : String(m.def.name || "").replace(/^Influenced\s+/i, "");
        // --- Ícones de condição da TibiaWiki ao lado do nome, como o
        // client oficial: Sap Strength / Expose Weakness (crippling
        // stances do Sorcerer) e Chivalrous Challenge / Divine Dazzle
        // (m.challengedUntil, reservado para uso futuro).
        const agoraIcon = Date.now();
        const condIcons = [];
        if (m.sapStrUntil && m.sapStrUntil > agoraIcon) condIcons.push("sap-strength");
        if (m.exposeUntil && m.exposeUntil > agoraIcon) condIcons.push("expose-weakness");
        if (m.challengedUntil && m.challengedUntil > agoraIcon) condIcons.push("challenged");
        if (condIcons.length) {
          ctx.font = "bold 9px Verdana";
          const tw = ctx.measureText(mobName).width;
          const isz = 10, gap = 2;
          const rowW = condIcons.length * (isz + gap) - gap;
          let ix = Math.round(mx - tw / 2 - 4 - rowW);
          const iy = Math.round(by - 13); // centro vertical da linha do nome
          for (const slug of condIcons) {
            if (drawWikiIcon(ctx, slug, ix, iy, isz)) ix += isz + gap;
          }
        }
        drawNameText(ctx, mx, by - 4, mobName, tibiaHpColor(pct));
        // Ícone de TIPO DE ATAQUE (OTC): ranged (🏹 flecha) ou melee (⚔
        // espadas) — MENOR (9px) e na lateral DIREITA da sprite, no meio
        // dela, logo abaixo do nome (pedido do dono: antes ficava grudado
        // no lado esquerdo do nome com 12px).
        if (typeof monsterAttackRange === "function") {
          const isRange = monsterAttackRange(m) > 0.16;
          const iszAtk = 9;
          const atkX = Math.round(mx + w / 2 + 3);
          const atkY = Math.round(top + h * 0.35);
          drawWikiIcon(ctx, isRange ? "range-atk" : "melee-atk", atkX, atkY, iszAtk);
        }
        // Marca de Fiendish/Influenced na LATERAL DIREITA da sprite (como o
        // client): ícone oficial + número de poeiras/stacks, longe da barra
        // de HP e do nome.
        const markX = Math.round(mx + w / 2 + 4);
        const markY = Math.round(top + h * 0.38);
        if (m.fiendish) {
          const num = String(m.sinisterStacks || 15);
          drawWikiIcon(ctx, "fiendish-creature", markX, markY - 12, 12);
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#000";
          ctx.fillStyle = "#d79cff";
          ctx.strokeText(num, markX + 14, markY - 6);
          ctx.fillText(num, markX + 14, markY - 6);
        } else if (m.influenced) {
          const stacks = String(m.sinisterStacks || 1);
          const ic = wikiIcon("influenced-creature");
          if (ic && ic.complete && ic.naturalWidth) {
            ctx.save();
            ctx.drawImage(ic, markX, markY - 12, 12, 12);
            ctx.font = "bold 10px monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#000";
            ctx.fillStyle = "#66c7ff";
            ctx.strokeText(stacks, markX + 14, markY - 6);
            ctx.fillText(stacks, markX + 14, markY - 6);
            ctx.restore();
          } else {
            drawNameText(ctx, markX + 8, markY, "✦ " + stacks, "#66c7ff");
          }
        }
        // fala da criatura (monster.voices do Canary), acima do nome
        drawCreatureSpeech(ctx, m, mx, by - 4, dt);
      }
    }
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
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    e.t += dt;
    if (e.t >= e.dur) { this.effects.splice(i, 1); continue; }
    const img = Sprites.fx(e.name);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const fw = img.naturalWidth / e.frames;
    const f = Math.min(e.frames - 1, Math.floor((e.t / e.dur) * e.frames));
    // mesma escala do resto do mapa: o efeito do client cobre 1 SQM. Com o
    // "2" fixo que estava aqui a explosao ficava do tamanho de 3 tiles e
    // parecia solta do grid.
    const sc = tibiaScale(W);
    ctx.drawImage(img, f * fw, 0, fw, img.naturalHeight,
                  e.x * W - fw * sc / 2, e.y * H - img.naturalHeight * sc / 2,
                  fw * sc, img.naturalHeight * sc);
  }

  ctx.restore();

  // --- numeros flutuantes
  ctx.textAlign = "center";
  for (let i = this.floaters.length - 1; i >= 0; i--) {
    const f = this.floaters[i];
    f.life -= dt;
    if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
    const p = 1 - f.life / f.max;
    const alpha = f.life < 300 ? f.life / 300 : 1;
    const fx = (f.x + f.vx * p * 60) * W;
    const fy = (f.y + f.vy * p * 22) * H;
    ctx.globalAlpha = alpha;
    // v37: escala de 3 fontes — fonte 3 (dano, bold 12px), fonte 2 (cura
    // HP/mana, 9px), fonte 1 (small 5px) / normal 11px.
    ctx.font = (f.big ? "bold 12px" : (f.small ? "5px" : (f.mid ? "9px" : "11px"))) + " Verdana";
    ctx.lineWidth = f.small ? 1.5 : 2;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(f.text, fx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha = 1;
  }

  // --- DEBUG: contadores de procs da Exaltation Forge (temporário)
  const forgeCounts = (typeof window !== "undefined" && window.FORGE_DEBUG_COUNT) || null;
  if (forgeCounts) {
    ctx.textAlign = "left";
    ctx.font = "bold 14px Verdana";
    ctx.lineWidth = 3;
    const lines = [
      { label: "FATAL", n: forgeCounts.fatal || 0, color: "#ff4a4a" },
      { label: "MOMENTUM", n: forgeCounts.momentum || 0, color: "#ffe680" },
      { label: "RUSE", n: forgeCounts.ruse || 0, color: "#66c7ff" },
      { label: "AVATAR", n: forgeCounts.transcendence || 0, color: "#c78cff" },
    ];
    let y = 64;
    for (const ln of lines) {
      if (ln.n <= 0) continue;
      const txt = `${ln.label}: ${ln.n}`;
      ctx.strokeStyle = "#000";
      ctx.strokeText(txt, 12, y);
      ctx.fillStyle = ln.color;
      ctx.fillText(txt, 12, y);
      y += 20;
    }
  }

  // --- tela de morte (corpse + contador)
  if (combat && combat.dead) {
    const dp = combat.deathPos || { x: 0.18, y: 0.62, dir: "e" };
    const px = dp.x * W, py = dp.y * H;
    // Desenha corpse do jogador (sprite semi-transparente)
    const pimg = OutfitRenderer.forPlayer(player, dp.dir || "e", 0);
    if (spriteReady(pimg)) {
      const sc = creatureScale(W);   // v33
      const w = spriteW(pimg) * sc, h = spriteH(pimg) * sc;
      ctx.globalAlpha = 0.45;
      ctx.save();
      // Rotaciona o corpse (deitado)
      ctx.translate(px, py - h * 0.2);
      ctx.rotate(Math.PI / 2 * (dp.dir === "w" ? -1 : 1) * 0.15);
      ctx.drawImage(pimg, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.globalAlpha = 1.0;
      // Sombra no chão
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath();
      ctx.ellipse(px, py + h * 0.35, w * 0.4, h * 0.12, 0, 0, 7);
      ctx.fill();
    }
    // Escurecimento da tela
    ctx.fillStyle = "rgba(70,0,0,.35)";
    ctx.fillRect(0, 0, W, H);
    // Contador acima do corpse
    const left = Math.max(0, Math.ceil((combat.deadUntil - Date.now()) / 1000));
    ctx.font = "bold 16px Verdana";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    const labelY = py - (spriteReady(pimg) ? spriteH(pimg) * tibiaScale(W) * 0.5 + 24 : 40);
    ctx.strokeText(left + "s", px, labelY);
    ctx.fillStyle = left <= 5 ? "#ff6060" : "#ffe680";
    ctx.fillText(left + "s", px, labelY);
    // Texto "VOCÊ MORREU" centralizado
    ctx.font = "bold 22px Verdana";
    ctx.strokeText("VOCÊ MORREU", W / 2, H / 2 - 6);
    ctx.fillStyle = "#ff6060";
    ctx.fillText("VOCÊ MORREU", W / 2, H / 2 - 6);
    // Subtexto
    ctx.font = "12px Verdana";
    ctx.fillStyle = "#e8b0b0";
    ctx.fillText("Renascer em " + left + "s" + (isVip() ? " (VIP)" : ""), W / 2, H / 2 + 16);
  }

  // --- sem hunt
  if (!combat) {
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 14px Verdana";
    ctx.fillStyle = "#c8c0a8";
    ctx.textAlign = "center";
    ctx.fillText("Escolha uma caçada para começar", W / 2, H / 2);
  }
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
