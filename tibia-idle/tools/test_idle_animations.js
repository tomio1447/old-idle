/* Regressão: parado usa apenas o frame group idle real do DAT. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
function must(ok, msg) { if (!ok) throw Error(msg); }

const ctx = { window:{} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'idleanimdata.js'), 'utf8'), ctx);
const data = ctx.IDLE_ANIMATIONS;
must(Object.keys(data.outfits).length === 42, 'quantidade de outfits idle divergente');
must(Object.keys(data.mounts).length === 54, 'quantidade de mounts idle divergente');
must(Object.keys(data.monsters).length === 115, 'quantidade de monstros idle divergente');

// Estes looktypes têm vários frames, mas apenas grupo MOVING: devem ficar
// totalmente estáticos quando não estão caminhando.
for (const slug of ['cave-parrot','parrot','seagull','fire-elemental','willi-wasp'])
  must(!data.monsters[slug], slug + ' foi classificado incorretamente como idle');
for (const slug of ['jellyfish','pigeon','the-book-of-death','lava-golem'])
  must(data.monsters[slug] && data.monsters[slug].frames > 1,
    slug + ' perdeu a animação idle real');

function pngSize(file) {
  const b = fs.readFileSync(file);
  must(b.subarray(1,4).toString() === 'PNG', 'PNG inválido: ' + file);
  return { w:b.readUInt32BE(16), h:b.readUInt32BE(20) };
}
for (const [slug, meta] of Object.entries(data.monsters)) {
  const size = pngSize(path.join(game, 'assets', 'mob', slug + '.idle.png'));
  must(size.w === meta.cw * meta.frames && size.h === meta.ch * 4,
    'sheet idle de monstro com geometria errada: ' + slug);
  must(meta.duration === meta.durations.reduce((a,b) => a+b, 0),
    'duração idle inconsistente: ' + slug);
}
for (const [id, meta] of Object.entries(data.outfits)) {
  const size = pngSize(path.join(game, 'assets', 'appearance', 'outfit', id + '.idle.base.png'));
  must(size.w === meta.cw * meta.frames && size.h === meta.ch * 4,
    'sheet idle de outfit com geometria errada: ' + id);
}
for (const [id, meta] of Object.entries(data.mounts)) {
  const size = pngSize(path.join(game, 'assets', 'appearance', 'mount', id + '.idle.base.png'));
  must(size.w === meta.cw * meta.frames && size.h === meta.ch * 4,
    'sheet idle de mount com geometria errada: ' + id);
}

const appearanceSrc = fs.readFileSync(path.join(js, 'appearance.js'), 'utf8');
const renderSrc = fs.readFileSync(path.join(js, 'render.js'), 'utf8');
const html = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
must(html.includes('<script src="js/idleanimdata.js"></script>'),
  'metadados idle não são carregados');
must(appearanceSrc.includes('idleAnimationMeta("outfits", a.id)') &&
     appearanceSrc.includes('idleAnimationMeta("mounts", m.id)') &&
     !appearanceSrc.includes('(a.cols || 0) <= 3'),
  'outfit parada ainda usa quantidade de frames de caminhada');
must(renderSrc.includes('monsterIdleMeta(ent.slug)') &&
     renderSrc.includes('Sprites.mobIdle(') &&
     !renderSrc.includes('const animated = meta.cols > 1'),
  'monstro parado ainda usa o sheet moving');
must(renderSrc.indexOf('if (ent.moving)') < renderSrc.indexOf('monsterIdleMeta(ent.slug)'),
  'renderer não separa movimento e idle');

// A seleção de outfit/mount consulta a tabela idle, não a quantidade de
// colunas do sheet moving.
ctx.ensureOutfit = (p) => (p.outfit = p.outfit || {});
ctx.VOC_OUTFIT = { knight:'citizen' };
vm.runInContext(fs.readFileSync(path.join(js, 'appearancedata.js'), 'utf8'), ctx);
vm.runInContext(appearanceSrc, ctx);
const staticPlayer = { voc:'knight', sex:'male', outfit:{appearance:'citizen-m'} };
const idlePlayer = { voc:'knight', sex:'male', outfit:{appearance:'chaos-acolyte-m'} };
const mountedPlayer = { voc:'knight', sex:'male', outfit:{appearance:'citizen-m',mount:'flamesteed'} };
must(ctx.appearanceIdleFrame(staticPlayer, 100) === 0,
  'outfit sem idle real está se mexendo parada');
must(ctx.appearanceIdleFrame(idlePlayer, 100).idle,
  'outfit com idle real ficou estática');
must(ctx.appearanceIdleFrame(mountedPlayer, 100).idle,
  'mount com idle real ficou estática');

// Durações variáveis do DAT são respeitadas no renderer canvas.
const timing = { frames:3, durations:[100,300,200], duration:600 };
must(ctx.idleAnimationFrame(timing, 50, 0) === 0, 'frame 0/duração incorreto');
must(ctx.idleAnimationFrame(timing, 150, 0) === 1, 'frame 1/duração incorreto');
must(ctx.idleAnimationFrame(timing, 450, 0) === 2, 'frame 2/duração incorreto');
must(ctx.idleAnimationFrame(timing, 650, 0) === 0, 'loop idle incorreto');

console.log('OK: idle real em 42 outfits, 54 mounts e 115 monstros; moving-only fica parado.');
