/* Regressão: recortes de criaturas preservam a âncora DAT no SQM lógico. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
function must(ok, msg) { if (!ok) throw Error(msg); }

const ctx = { window:{} };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['mobsheetdata.js','creatureanchordata.js','idleanimdata.js'])
  vm.runInContext(fs.readFileSync(path.join(js, file), 'utf8'), ctx);

const sheets = ctx.MOBSHEETS;
const anchors = ctx.CREATURE_ANCHORS;
must(Object.keys(anchors).length === Object.keys(sheets).length,
  'nem todo spritesheet de monstro possui âncora');
for (const [slug, meta] of Object.entries(sheets)) {
  const a = anchors[slug];
  must(a && a.sw >= meta.cw && a.sh >= meta.ch,
    'canvas DAT menor que o recorte: ' + slug);
  must(a.ox >= 0 && a.oy >= 0 && a.ox + meta.cw <= a.sw + 0.01 &&
       a.oy + meta.ch <= a.sh + 0.01,
    'offset fora do canvas DAT: ' + slug);
}
must(JSON.stringify(anchors['timira-the-many-headed']) ===
  JSON.stringify({sw:64,sh:64,ox:2,oy:2}),
  'âncora da Timira divergente');
must(JSON.stringify(anchors['cave-rat']) ===
  JSON.stringify({sw:32,sh:32,ox:0,oy:0}),
  'âncora 1x1 do Cave Rat divergente');

const renderSrc = fs.readFileSync(path.join(js, 'render.js'), 'utf8');
const originStart = renderSrc.indexOf('function creatureTileOrigin');
const originEnd = renderSrc.indexOf('\n}\n\nfunction markMonsterAnchor', originStart) + 2;
const geoCtx = {};
vm.createContext(geoCtx);
vm.runInContext(renderSrc.slice(originStart, originEnd), geoCtx);
const tile = 40, scale = tile / 32, centerX = 100, centerY = 100;
const timira = anchors['timira-the-many-headed'];
const origin = geoCtx.creatureTileOrigin(
  centerX, centerY, sheets['timira-the-many-headed'].cw * scale,
  sheets['timira-the-many-headed'].ch * scale, tile, timira, scale);
must(origin.x === 42.5 && origin.y === 42.5,
  'Timira não foi deslocada para a âncora inferior-direita do DAT');
must(origin.x + sheets['timira-the-many-headed'].cw * scale === centerX + tile/2 &&
     origin.y + sheets['timira-the-many-headed'].ch * scale === centerY + tile/2,
  'base da Timira não coincide com o limite do SQM');

const appearanceSrc = fs.readFileSync(path.join(js, 'appearance.js'), 'utf8');
const citySrc = fs.readFileSync(path.join(js, 'city-render.js'), 'utf8');
const html = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
must(html.includes('<script src="js/creatureanchordata.js"></script>'),
  'dados de âncora não são carregados');
must(renderSrc.includes('markMonsterAnchor(cv, slug, meta)') &&
     renderSrc.includes('img._spriteAnchor, sc'),
  'renderer de monstros ignora âncora');
must(appearanceSrc.includes('markSpriteAnchor(cv, renderMeta, 64, 64)') &&
     appearanceSrc.includes('cv._spriteAnchor = { sw:fullW, sh:fullH'),
  'renderer de outfits/mounts ignora âncora');
must((citySrc.match(/creatureTileOrigin\(psx, psy/g) || []).length === 2,
  'cidade/templo não usam a mesma âncora do combate');
must(renderSrc.includes('creatureTileOrigin(pxF, pyF') &&
     renderSrc.includes('const footY = pyF + tile / 2'),
  'academia não usa a mesma âncora do combate');

// Modal estático deve exibir uma célula sem comprimir as demais colunas.
const renderCtx = {
  window:{}, ASSET_VERSION:'test',
  MOBSHEETS:{ test:{cw:40,ch:40,cols:9,rows:4} },
  IDLE_ANIMATIONS:{monsters:{}},
};
renderCtx.window = renderCtx;
vm.createContext(renderCtx);
const idleMetaStart = renderSrc.indexOf('function monsterIdleMeta');
const mobImgEnd = renderSrc.indexOf('\n\nfunction fxClientMeta', idleMetaStart);
vm.runInContext(renderSrc.slice(idleMetaStart, mobImgEnd), renderCtx);
const thumb = renderCtx.mobImg('test', 40, '');
must(!thumb.includes('mob-img-animated') &&
     thumb.includes('background-size:360.0px 160.0px') &&
     thumb.includes('width:40.0px'),
  'modal comprime as 9 colunas do spritesheet numa célula');

console.log('OK: monstros, players, templo, academia e modais usam âncoras/células corretas.');
