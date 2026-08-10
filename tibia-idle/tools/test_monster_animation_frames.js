/* Regressão: Soul War/DT Seal/Cobra Bastion/Scarlett possuem frames reais e
 * o runtime percorre esses frames na cena e nas miniaturas da interface. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');

const GAME = path.join(__dirname, '..', 'game');
const JS = path.join(GAME, 'js');
function must(ok, message) { if (!ok) throw Error(message); }

const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(JS, 'mobsheetdata.js'), 'utf8'), ctx);

const groups = {
  'DT Seal': ['vexclaw', 'grimeleech', 'dark-torturer'],
  'Cobra Bastion': ['cobra-vizier', 'cobra-scout', 'cobra-assassin'],
  'Scarlett': ['scarlett-etzel'],
  'Soul War': [
    'many-faces', 'knight-s-apparition', 'paladin-s-apparition',
    'sorcerer-s-apparition', 'druid-s-apparition', 'monk-s-apparition',
    'brachiodemon', 'infernal-demon', 'cloak-of-terror', 'vibrant-phantom',
    'courage-leech', 'dreadful-harvester', 'rotten-golem', 'branchy-crawler',
    'mould-phantom', 'turbulent-elemental',
  ],
};

// Decoder mínimo para os spritesheets PNG RGBA 8-bit do repositório.
function pngRgba(file) {
  const data = fs.readFileSync(file);
  must(data.subarray(1, 4).toString() === 'PNG', file + ': PNG inválido');
  let p = 8, width = 0, height = 0, bit = 0, color = 0, interlace = 0;
  const idat = [];
  while (p < data.length) {
    const len = data.readUInt32BE(p); p += 4;
    const type = data.subarray(p, p + 4).toString(); p += 4;
    const body = data.subarray(p, p + len); p += len + 4;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      bit = body[8]; color = body[9]; interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  must(bit === 8 && color === 6 && interlace === 0,
    file + ': teste espera PNG RGBA 8-bit não entrelaçado');
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4, pixels = Buffer.alloc(stride * height);
  let src = 0;
  const paeth = (a, b, c) => {
    const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
    return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[src++];
    for (let x = 0; x < stride; x++) {
      const raw = packed[src++], left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const ul = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, ul);
      else throw Error(file + ': filtro PNG desconhecido ' + filter);
      pixels[y * stride + x] = value & 255;
    }
  }
  return { width, height, pixels };
}

function framePixels(image, meta, col, row) {
  const frame = Buffer.alloc(meta.cw * meta.ch * 4);
  for (let y = 0; y < meta.ch; y++) {
    const from = ((row * meta.ch + y) * image.width + col * meta.cw) * 4;
    image.pixels.copy(frame, y * meta.cw * 4, from, from + meta.cw * 4);
  }
  return frame;
}
function frameHash(image, meta, col, row) {
  return crypto.createHash('sha256').update(framePixels(image, meta, col, row)).digest('hex');
}
function opaquePixels(image, meta, col, row) {
  const frame = framePixels(image, meta, col, row);
  let count = 0;
  for (let i = 3; i < frame.length; i += 4) if (frame[i]) count++;
  return count;
}

let checked = 0;
for (const [group, slugs] of Object.entries(groups)) {
  for (const slug of slugs) {
    const meta = ctx.MOBSHEETS[slug];
    must(meta && meta.cols >= 3 && meta.rows === 4,
      `${group}/${slug}: spritesheet sem ciclo de movimento`);
    const file = path.join(GAME, 'assets', 'mob', slug + '.png');
    must(fs.existsSync(file), `${group}/${slug}: PNG ausente`);
    const image = pngRgba(file);
    must(image.width === meta.cw * meta.cols && image.height === meta.ch * meta.rows,
      `${group}/${slug}: dimensões do PNG não batem com MOBSHEETS`);
    const hashes = new Set();
    for (let col = 0; col < meta.cols; col++) hashes.add(frameHash(image, meta, col, 2));
    must(hashes.size >= 2, `${group}/${slug}: todos os frames sul são idênticos`);
    if (group === 'Cobra Bastion') {
      // Pattern-y de addon contém só a camada adicional. Sem compor com o
      // pattern base, Scout/Assassin ficam com torso e pernas transparentes.
      must(opaquePixels(image, meta, 0, 2) >= 500,
        `${group}/${slug}: addon foi renderizado sem o corpo base`);
    }
    checked++;
  }
}

// Carrega as funções reais do renderer sem DOM e valida o relógio visual.
vm.runInContext(fs.readFileSync(path.join(JS, 'render.js'), 'utf8'), ctx);
const dtFrames = [0, 160, 320, 480].map(t =>
  vm.runInContext(`monsterIdleFrame('dark-torturer', ${t}, 0)`, ctx));
must(dtFrames.join(',') === '1,2,1,2', 'DT Seal não alterna continuamente os frames 1/2');
const soulFrames = new Set(Array.from({ length: 8 }, (_, i) =>
  vm.runInContext(`monsterIdleFrame('brachiodemon', ${i * 160}, 0)`, ctx)));
must(soulFrames.size === 8 && !soulFrames.has(0),
  'Soul War não percorre os oito frames de movimento');
const thumb = vm.runInContext(`mobImg('vexclaw', 32, '')`, ctx);
must(thumb.includes('mob-img-animated') && thumb.includes('--mob-sheet-frames:9'),
  'Miniatura da DT Seal continua estática');

// Transformações (Mirror Image -> Apparition) devem recalcular o ciclo.
const gridCtx = { console, MOBSHEETS: ctx.MOBSHEETS };
vm.createContext(gridCtx);
vm.runInContext(fs.readFileSync(path.join(JS, 'grid.js'), 'utf8'), gridCtx);
const ent = { slug: 'many-faces', cx: 1, cy: 1, x: .1, y: .1 };
gridCtx.ensureCell(ent);
must(ent.walkFrames === 8, 'Many Faces não recebeu oito frames de caminhada');
ent.slug = 'dark-torturer';
gridCtx.ensureCell(ent);
must(ent.walkFrames === 2, 'Mudança de criatura não recalculou os frames');

const css = fs.readFileSync(path.join(GAME, 'css', 'layout.css'), 'utf8');
must(css.includes('@keyframes mob-sheet-frames') && css.includes('.mob-img-animated'),
  'CSS das miniaturas animadas ausente');

console.log(`OK: ${checked} monstros de Soul War/DT Seal/Cobra Bastion/Scarlett possuem frames distintos e animação contínua.`);
