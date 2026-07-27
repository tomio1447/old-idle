/*
 * render.js — desenha a cena de caca (chao, monstros, player, dano flutuante)
 */
"use strict";

/* escala do sprite do jogador na cena de caca (monstro comum usa 2.0) */
const PLAYER_SCALE = 1.8;

const Sprites = {
  cache: {},
  get(path) {
    if (this.cache[path] !== undefined) return this.cache[path];
    const img = new Image();
    img.src = path;
    img.onerror = () => { this.cache[path] = null; };
    this.cache[path] = img;
    return img;
  },
  mob(slug, dir) { return this.get(`assets/mob/${slug}_${dir || "s"}.png`); },
  item(slug) { return this.get(`assets/item/${slug}.png`); },
  outfit(name, dir) { return this.get(`assets/outfit/${name}_${dir || "s"}.png`); },
  ground(scene) { return this.get(`assets/ground/${scene}.png`); },
  fx(name) { return this.get(`assets/fx/${name}.png`); },
  npc(name, dir) { return this.get(`assets/npc/${name}_${dir || "s"}.png`); },
  deco(name) { return this.get(`assets/npc/deco-${name}.png`); },
  /* frame de caminhada: f=0 parado, f=1|2 passos */
  walk(name, dir, f) {
    const suf = f ? `${dir}${f}` : dir;
    return this.get(`assets/outfit/${name}_${suf}.png`);
  },
};

const FX_FRAMES = {
  "draw-blood": 3, "lose-energy": 3, "poff": 3, "block-hit": 3,
  "explosion-area": 3, "explosion-hit": 3, "fire-area": 3, "yellow-rings": 3,
  "green-rings": 3, "hit-area": 3, "teleport": 3, "energy-damage": 3,
  "magic-blue": 3, "magic-red": 3, "magic-green": 3, "hit-by-fire": 3,
  "hit-by-poison": 3, "mort-area": 3, "sound-green": 3, "sound-red": 3,
  "poison-area": 3, "sound-yellow": 3, "sound-purple": 3, "sound-blue": 3,
  "sound-white": 3,
};

function Renderer(canvas) {
  this.c = canvas;
  this.ctx = canvas.getContext("2d");
  this.ctx.imageSmoothingEnabled = false;
  this.floaters = [];       // numeros de dano
  this.effects = [];        // animacoes de efeito
  this.projectiles = [];    // projeteis/distance shots
  this.corpses = [];
  this.shake = 0;
  this.playerFlash = 0;
  this.scale = 2;
}

Renderer.prototype.resize = function () {
  const w = this.c.parentElement.clientWidth;
  // câmera reduzida e com mais visão: 21 × 13 SQMs.
  const h = Math.round(w * (13 / 21));
  if (this.c.width !== w || this.c.height !== h) {
    this.c.width = w;
    this.c.height = h;
    this.ctx.imageSmoothingEnabled = false;
  }
};

Renderer.prototype.addFloater = function (x, y, text, color, big) {
  const life = big ? 2400 : 1900;
  this.floaters.push({
    x: x, y: y, text: text, color: color,
    life: life, max: life,
    big: !!big,
    // hits/range sobem devagar, como no client: legível e sem sumir rápido.
    vy: -0.005 - Math.random() * 0.004,
    vx: (Math.random() - 0.5) * 0.008,
  });
  if (this.floaters.length > 60) this.floaters.shift();
};

/* Fala do personagem (magias e supplies), estilo client do Tibia:
 * texto amarelo acima da cabeca, some sozinho. */
Renderer.prototype.addSpeech = function (text, color) {
  this.speech = this.speech || [];
  // empurra as falas antigas para cima, como no client original
  for (const sp of this.speech) sp.slot = (sp.slot || 0) + 1;
  this.speech.push({ text: text, color: color || "#ffe680",
                     life: 3000, max: 3000, slot: 0 });
  if (this.speech.length > 4) this.speech.shift();
};

Renderer.prototype.drawSpeech = function (ctx, x, y, dt) {
  if (!this.speech || !this.speech.length) return;
  ctx.textAlign = "center";
  ctx.font = "bold 11px Verdana";
  for (let i = this.speech.length - 1; i >= 0; i--) {
    const sp = this.speech[i];
    sp.life -= dt;
    if (sp.life <= 0) { this.speech.splice(i, 1); continue; }
    const a = Math.min(1, sp.life / 700);
    const ty = y - 34 - (sp.slot || 0) * 13;
    ctx.globalAlpha = a;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(sp.text, x, ty);
    ctx.fillStyle = sp.color;
    ctx.fillText(sp.text, x, ty);
    ctx.globalAlpha = 1;
  }
};

Renderer.prototype.addEffect = function (x, y, name) {
  if (!FX_FRAMES[name]) name = "draw-blood";
  this.effects.push({ x: x, y: y, name: name, t: 0,
                      frames: FX_FRAMES[name], dur: 360 });
  if (this.effects.length > 20) this.effects.shift();
};

Renderer.prototype.addProjectile = function (sx, sy, tx, ty, color) {
  this.projectiles.push({ sx: sx, sy: sy, tx: tx, ty: ty,
                          color: color || "#ffe680", t: 0, dur: 260 });
  if (this.projectiles.length > 30) this.projectiles.shift();
};

function drawNameText(ctx, x, y, name) {
  ctx.font = "bold 10px Verdana";
  ctx.textAlign = "center";
  const tw = ctx.measureText(name).width + 10;
  ctx.fillStyle = "rgba(0,0,0,.78)";
  ctx.fillRect(x - tw / 2, y - 10, tw, 13);
  ctx.strokeStyle = "rgba(120,110,90,.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - tw / 2, y - 10, tw, 13);
  ctx.fillStyle = "#f0e8c8";
  ctx.fillText(name, x, y);
}

function drawNameBars(ctx, x, y, name, hpPct, mpPct) {
  drawNameText(ctx, x, y, name);
  const w = 74, h = 4;
  const bx = x - w / 2;
  const hpY = y + 6, mpY = y + 12;
  ctx.fillStyle = "#050505";
  ctx.fillRect(bx - 1, hpY - 1, w + 2, h + 2);
  ctx.fillRect(bx - 1, mpY - 1, w + 2, h + 2);
  ctx.fillStyle = hpPct > 0.5 ? "#37d747" : hpPct > 0.25 ? "#e8c84a" : "#e04040";
  ctx.fillRect(bx, hpY, w * Math.max(0, Math.min(1, hpPct)), h);
  ctx.fillStyle = "#3c66ff";
  ctx.fillRect(bx, mpY, w * Math.max(0, Math.min(1, mpPct)), h);
}

function drawStatusArcs(ctx, x, y, name, hpPct, mpPct, radius) {
  drawNameText(ctx, x, y - radius - 18, name);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  // HP à esquerda
  ctx.strokeStyle = "rgba(0,0,0,.78)";
  ctx.beginPath(); ctx.arc(x, y, radius, Math.PI * 0.72, Math.PI * 1.28); ctx.stroke();
  ctx.strokeStyle = hpPct > 0.5 ? "#37d747" : hpPct > 0.25 ? "#e8c84a" : "#e04040";
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
  ctx.fillStyle = "#ffe680";
  ctx.fillText(boss.def.name, W / 2, y + 11);
  ctx.font = "bold 10px Verdana";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.ceil(boss.hp)} / ${boss.maxHp}`, W / 2, y + 31);
  ctx.restore();
}

function drawRookgaardSewer(ctx, W, H) {
  const cols = 21, rows = 13;
  const tw = W / cols, th = H / rows;
  const tile = (x, y, fill, stroke) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x * tw, y * th, tw + 1, th + 1);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x * tw + 0.5, y * th + 0.5, tw, th);
    }
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
      if (c === "#") tile(x, y, "#1a1a18", "#080808");
      else if (c === "~") {
        const g = ctx.createLinearGradient(0, y * th, 0, (y + 1) * th);
        g.addColorStop(0, "#244629"); g.addColorStop(0.5, "#13311f"); g.addColorStop(1, "#081d14");
        tile(x, y, g, "#06110c");
      } else if (c === "=") tile(x, y, "#66543d", "#2b2115");
      else tile(x, y, "#333633", "#1b1e1b");

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

Renderer.prototype.addCorpse = function (x, y, slug) {
  this.corpses.push({ x: x, y: y, slug: slug, life: 2000 });
  if (this.corpses.length > 8) this.corpses.shift();
};

Renderer.prototype.drawAcademy = function (training, player, dt) {
  const ctx = this.ctx;
  const W = this.c.width, H = this.c.height;
  ctx.clearRect(0, 0, W, H);

  const gr = Sprites.ground("temple") || Sprites.ground("city");
  if (gr && gr.complete && gr.naturalWidth) {
    const s = 2;
    const tw = gr.naturalWidth * s, th = gr.naturalHeight * s;
    for (let y = 0; y < H; y += th)
      for (let x = 0; x < W; x += tw)
        ctx.drawImage(gr, x, y, tw, th);
  } else {
    ctx.fillStyle = "#1d2018";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(40,80,40,.32)";
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

  // Sala de treino estilo OTServer: paredes, tochas, racks, barris e caixas.
  ctx.fillStyle = "rgba(28,22,16,.88)";
  ctx.fillRect(0, 0, W, H * 0.18);
  ctx.fillStyle = "rgba(58,45,32,.75)";
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

  ctx.textAlign = "left";
  ctx.font = "bold 14px Verdana";
  ctx.fillStyle = "#9ce84a";
  ctx.fillText("Academia Safezone", 12, 24);
  ctx.font = "10px Verdana";
  ctx.fillStyle = "#c8c0a8";
  ctx.fillText("Treiner padrão · +200% ticks/hit · conjure disponível", 12, 40);

  const pimg = OutfitRenderer.forPlayer(player, "e", 0);
  const px = W * 0.28, py = H * 0.64;
  if (spriteReady(pimg)) {
    const sc = PLAYER_SCALE + 0.1;
    const w = spriteW(pimg) * sc, h = spriteH(pimg) * sc;
    const top = py - h / 2 + Math.sin(Date.now() / 340) * 2;
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(px, py + h * 0.42, w * 0.34, h * 0.1, 0, 0, 7); ctx.fill();
    ctx.drawImage(pimg, px - w / 2, top, w, h);
    drawPlayerStatus(ctx, px, top - 14, py, player, player.config.barMode, Math.max(26, w * 0.42));
    this.drawSpeech(ctx, px, top - 14, dt);
  }

  const trainer = Sprites.mob("monk", "w") || Sprites.mob("monk", "s");
  const tx = W * 0.70, ty = H * 0.62;
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
  ctx.fillStyle = "#ffe680";
  ctx.fillText("Treiner", tx, ty - 65);

  // barra do Treiner: nunca morre
  ctx.fillStyle = "#000";
  ctx.fillRect(tx - 42, ty - 55, 84, 7);
  ctx.fillStyle = "#4ec84e";
  ctx.fillRect(tx - 41, ty - 54, 82, 5);

  ctx.textAlign = "left";
  ctx.font = "11px Verdana";
  ctx.fillStyle = "rgba(0,0,0,.72)";
  ctx.fillRect(12, H - 58, 250, 44);
  ctx.strokeStyle = "rgba(156,232,74,.45)";
  ctx.strokeRect(12, H - 58, 250, 44);
  ctx.fillStyle = "#c8c0a8";
  const sk = training.skill ? (SKILL_NAMES[training.skill] || training.skill) : "—";
  ctx.fillText("Skill: " + sk, 22, H - 38);
  ctx.fillText("Hits: " + fmtFull(training.stats.hits) + " · Dano: " + fmtFull(training.stats.damage || 0) + " · Shielding ativo", 22, H - 22);

  // efeitos/números flutuantes
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    e.t += dt;
    if (e.t >= e.dur) { this.effects.splice(i, 1); continue; }
    const img = Sprites.fx(e.name);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const fw = img.naturalWidth / e.frames;
    const f = Math.min(e.frames - 1, Math.floor((e.t / e.dur) * e.frames));
    const sc = 2;
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
    ctx.font = (f.big ? "bold 15px" : "bold 12px") + " Verdana";
    ctx.lineWidth = 3;
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
  if (scene === "sewer") {
    drawRookgaardSewer(ctx, W, H);
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
  if (this.shake > 0) {
    ctx.translate((Math.random() - 0.5) * this.shake,
                  (Math.random() - 0.5) * this.shake);
    this.shake = Math.max(0, this.shake - dt * 0.02);
  }

  // --- corpses
  for (let i = this.corpses.length - 1; i >= 0; i--) {
    const c = this.corpses[i];
    c.life -= dt;
    if (c.life <= 0) { this.corpses.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, c.life / 1200) * 0.5;
    const img = Sprites.mob(c.slug, "s");
    if (img && img.complete && img.naturalWidth) {
      const sc = 2;
      ctx.save();
      ctx.translate(c.x * W, c.y * H);
      ctx.scale(1, 0.4);
      ctx.drawImage(img, -img.naturalWidth * sc / 2, -img.naturalHeight * sc / 2,
                    img.naturalWidth * sc, img.naturalHeight * sc);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // --- player
  const pl = combat && combat.player ? combat.player : { x: 0.13, y: 0.62, dir: "e", moving: false, frame: 0 };
  const px = pl.x, py = pl.y;
  const pimg = OutfitRenderer.forPlayer(player, pl.dir || "e",
                                        pl.moving ? (pl.frame || 1) : 0);
  const bob = pl.moving ? 0 : Math.sin(Date.now() / 340) * 2;
  if (spriteReady(pimg)) {
    const sc = PLAYER_SCALE;
    const w = spriteW(pimg) * sc, h = spriteH(pimg) * sc;
    const atkPush = (pl.attackAnim || 0) > 0 ? (pl.dir === "w" ? -5 : pl.dir === "e" ? 5 : 0) : 0;
    // sombra
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.ellipse(px * W, py * H + h * 0.42, w * 0.34, h * 0.1, 0, 0, 7);
    ctx.fill();
    if (this.playerFlash > 0) {
      ctx.save();
      ctx.filter = "brightness(2.2) saturate(0.4)";
      this.playerFlash -= dt;
    }
    const drawX = px * W - w / 2 + atkPush;
    const drawY = py * H - h / 2 + bob;
    ctx.drawImage(pimg, drawX, drawY, w, h);
    if (this.playerFlash > 0) ctx.restore();
    drawPlayerStatus(ctx, px * W, drawY - 14, py * H, player, player.config.barMode, Math.max(26, w * 0.42));
    this.drawSpeech(ctx, px * W, drawY - 14, dt);
  }

  // --- monstros
  if (combat && !combat.dead) {
    const mobs = combat.mobs.slice().sort((a, b) => a.y - b.y);
    for (const m of mobs) {
      const img = Sprites.mob(m.slug, m.dir || "w");
      const mx = m.x * W;
      const my = m.y * H + Math.sin(Date.now() / 400 + m.x * 9) * 2;
      if (img && img.complete && img.naturalWidth) {
        const sc = m.def.hp > 1500 ? 2.6 : m.def.hp > 500 ? 2.2 : 2.0;
        const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
        const atkPush = (m.attackAnim || 0) > 0 ? (m.dir === "w" ? -5 : m.dir === "e" ? 5 : 0) : 0;
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath();
        ctx.ellipse(mx, my + h * 0.42, w * 0.32, h * 0.09, 0, 0, 7);
        ctx.fill();
        if (combat.mobs[0] === m) {
          drawTargetSquare(ctx, mx - w * 0.43, my - h * 0.48,
                           w * 0.86, h * 0.92);
        }
        if (m.influenced) {
          ctx.save();
          ctx.shadowColor = "#39a8ff";
          ctx.shadowBlur = 18;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(img, mx - w / 2 + atkPush, my - h / 2, w, h);
          ctx.restore();
        }
        ctx.drawImage(img, mx - w / 2 + atkPush, my - h / 2, w, h);
        // barra de vida
        const bw = Math.max(30, w * 0.75), bh = 4;
        const bx = mx - bw / 2, by = my - h / 2 - 9;
        ctx.fillStyle = "#000";
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        const pct = Math.max(0, m.hp / m.maxHp);
        ctx.fillStyle = pct > 0.5 ? "#4ec84e" : pct > 0.25 ? "#e8c84a" : "#e04040";
        ctx.fillRect(bx, by, bw * pct, bh);
        // nome + range visual quando está chegando perto
        ctx.font = m.influenced ? "bold 18px Verdana" : "9px Verdana";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,0,0,.9)";
        const mobName = typeof displayMonsterName === "function" ? displayMonsterName(m.def.name) : String(m.def.name || "").replace(/^Influenced\s+/i, "");
        ctx.fillText(mobName, mx + 1, by - 4);
        ctx.fillStyle = m.influenced ? "#7ad2ff" : m.raider ? "#ff9a6a" : "#d8d0b8";
        ctx.fillText(mobName, mx, by - 5);
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

  // --- efeitos
  for (let i = this.effects.length - 1; i >= 0; i--) {
    const e = this.effects[i];
    e.t += dt;
    if (e.t >= e.dur) { this.effects.splice(i, 1); continue; }
    const img = Sprites.fx(e.name);
    if (!img || !img.complete || !img.naturalWidth) continue;
    const fw = img.naturalWidth / e.frames;
    const f = Math.min(e.frames - 1, Math.floor((e.t / e.dur) * e.frames));
    const sc = 2;
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
    ctx.font = (f.big ? "bold 15px" : "bold 12px") + " Verdana";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(f.text, fx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha = 1;
  }

  // --- tela de morte
  if (combat && combat.dead) {
    ctx.fillStyle = "rgba(70,0,0,.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 22px Verdana";
    ctx.fillStyle = "#ff6060";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
    ctx.strokeText("VOCÊ MORREU", W / 2, H / 2 - 6);
    ctx.fillText("VOCÊ MORREU", W / 2, H / 2 - 6);
    const left = Math.max(0, Math.ceil((combat.deadUntil - Date.now()) / 1000));
    ctx.font = "12px Verdana";
    ctx.fillStyle = "#e8b0b0";
    ctx.fillText("Voltando ao templo em " + left + "s", W / 2, H / 2 + 16);
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
