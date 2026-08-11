/* Regressão HARD Hunts + Cobra Bastion.
 * Referência Canary verificada em 157e6f9e (monster/humans/cobra_*.lua e
 * scripts/spells/monster/{explosion_wave,death_chain,wave_t}.lua). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
const OTBM = require(path.join(js, 'otbm.js'));
function must(ok, msg) { if (!ok) throw Error(msg); }

const ctx = { window: {}, console, setInterval, clearInterval, Date, Math, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  'gamedata.js', 'weapondata.js', 'weapons.js', 'ammodata.js', 'ammo.js',
  'monsterdata.js', 'monstermovedata.js', 'mobsheetdata.js', 'monsters.js',
  'hard-hunts.js',
]) vm.runInContext(fs.readFileSync(path.join(js, file), 'utf8'), ctx);

const uiSource = fs.readFileSync(path.join(js, 'ui.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
must(uiSource.includes('"hard":               { nome: "💀 HARD" }') &&
     uiSource.includes('${packLabel}</b> criaturas'),
  'Categoria/range HARD não aparece na lista de hunts');
must(indexSource.includes('<script src="js/hard-hunts.js"></script>'),
  'Patch HARD não é carregado pelo jogo');

// No test server, um personagem nível 1 ainda deve conseguir clicar na
// categoria HARD/Cobra; o nível aparece apenas como aviso de risco.
const renderStart=uiSource.indexOf('function renderHunts');
const renderEnd=uiSource.indexOf('\n\n/* ─────────────────',renderStart);
const huntsEl={innerHTML:''};
const lowLevelUi={
  GAMEDATA:{hunts:{'cobra-bastion':{
    name:'Cobra Bastion',cat:'hard',level:250,hidden:false,
    monsters:['cobra-vizier','cobra-scout','cobra-assassin'],
    avgExp:7000,avgDamage:500,pack:10,respawn:1,
  }}},
  $(){return huntsEl;}, $$(){return [];},
  huntRisk(){return {cls:'high',txt:'perigo'};},
  mobImg(){return '';}, fmt(n){return String(n);}, openHuntInfoModal(){},
};
vm.createContext(lowLevelUi);vm.runInContext(uiSource.slice(renderStart,renderEnd),lowLevelUi);
lowLevelUi.renderHunts({level:1,hunt:null});
must(huntsEl.innerHTML.includes('data-hunt="cobra-bastion"') &&
     !huntsEl.innerHTML.includes('hunt-card locked'),
  'Cobra Bastion está bloqueada para conta/personagem de teste');

const hunts = ctx.GAMEDATA.hunts;
for (const id of ['marapur-nagas', 'dt-seal', 'cobra-bastion']) {
  const h = hunts[id];
  must(h && h.cat === 'hard', id + ': fora da categoria HARD');
  must(h.packMin === 6 && h.packMax === 10 && h.pack === 10,
    id + ': faixa de respawn não é 6–10');
}
const cobraHunt = hunts['cobra-bastion'];
must(JSON.stringify(cobraHunt.monsters) ===
  JSON.stringify(['cobra-vizier', 'cobra-scout', 'cobra-assassin']),
  'Cobra Bastion não usa os três monstros solicitados');
must(!cobraHunt.otbmBounds &&
     JSON.stringify(cobraHunt.otbmMobBounds) === JSON.stringify({ x:154,y:160,w:10,h:12,z:2 }) &&
     JSON.stringify(cobraHunt.otbmSpawn) === JSON.stringify({ x:157,y:165,z:2 }),
  'FOV ou coordenadas RME da Cobra Bastion incorretos');

const expected = {
  'cobra-vizier': {
    hp:8500, exp:7650, speed:160, armor:82, defense:82, damage:480, mitigation:2.31,
    targetDistance:1, resist:{physical:10,earth:100,holy:-10},
    loot:[['platinum-coin',85.48,4],['terra-rod',43,1],['snakebite-rod',20.97,1],
      ['cobra-crest',16.13,1],['terra-hood',13.71,1],['cyan-crystal-fragment',10.805,1],
      ['terra-boots',9.68,1],['giant-shimmering-pearl',8.87,1],['red-gem',6.45,1],
      ['emerald-bangle',5.65,1],['gemmed-figurine',4.84,1],
      ['green-crystal-fragment',3.23,1],['red-crystal-fragment',3.23,1],
      ['serpent-sword',2.42,1],['violet-crystal-shard',2.42,1],['green-gem',1.61,1],
      ['onyx-chip',1.61,3]],
  },
  'cobra-scout': {
    hp:8500, exp:7310, speed:150, armor:81, defense:81, damage:500, mitigation:2.16,
    targetDistance:4, resist:{earth:100},
    loot:[['platinum-coin',74,9],['earth-arrow',19.49,28],['stone-skin-amulet',6.8,1],
      ['gold-ingot',5.75,1],['cheesy-figurine',13.8,1],['opal',23.8,5],
      ['cobra-crest',15.45,1],['small-emerald',3,2],['violet-gem',1.3,1],
      ['yellow-gem',3.06,1],['green-gem',1.21,1],['red-gem',4.8,1],
      ['sacred-tree-amulet',5.1,1],['green-crystal-shard',2.13,1],
      ['ring-of-red-plasma',0.74,1]],
  },
  'cobra-assassin': {
    hp:8200, exp:6980, speed:140, armor:81, defense:81, damage:450, mitigation:2.22,
    targetDistance:1, resist:{physical:20,earth:100},
    loot:[['platinum-coin',100,3],['knife',10.5,1],['cobra-crest',7.75,1],
      ['scimitar',7.75,1],['protection-amulet',7.5,1],['heavy-machete',6.5,1],
      ['bone-sword',5,1],['machete',2.25,1],['carlin-sword',2.25,1],
      ['ring-of-red-plasma',1.69,1]],
  },
};

const spriteHashes = new Set();
for (const [slug, e] of Object.entries(expected)) {
  const m = ctx.GAMEDATA.monsters[slug];
  must(m && m.jogavel, slug + ': monstro ausente/não jogável');
  for (const key of ['hp','exp','speed','armor','defense','damage','mitigation','targetDistance'])
    must(m[key] === e[key], `${slug}.${key} = ${m[key]} (esperado ${e[key]})`);
  must(JSON.stringify(m.resist) === JSON.stringify(e.resist), slug + ': fraquezas/resistências divergentes');
  const loot = (m.loot || []).map(l => [l.item,l.chance,l.max]);
  must(JSON.stringify(loot) === JSON.stringify(e.loot), slug + ': loot diverge do Canary');
  for (const [item] of loot) {
    must(ctx.GAMEDATA.items[item], `${slug}: loot sem ficha: ${item}`);
    must(fs.existsSync(path.join(game, 'assets', 'item', item + '.png')),
      `${slug}: loot sem sprite: ${item}`);
  }
  const sheet = path.join(game, 'assets', 'mob', slug + '.png');
  must(fs.existsSync(sheet) && ctx.MOBSHEETS[slug].cols === 9, slug + ': sheet 15x incompleto');
  spriteHashes.add(crypto.createHash('sha256').update(fs.readFileSync(sheet)).digest('hex'));
}
must(spriteHashes.size === 3, 'Vizier/Scout/Assassin ainda usam a mesma aparência');

// Magias nomeadas: elementos e áreas vêm dos scripts separados do Canary.
const skill = (slug, name) => ctx.GAMEDATA.monsters[slug].skills
  .find(s => String(s.n || '').toLowerCase() === name);
let s = skill('cobra-vizier', 'explosion wave');
must(s.el === 'physical' && s.fx === 'explosion-hit' &&
  JSON.stringify(s.areaPattern) === JSON.stringify([[0],[-1,0,1],[-1,0,1]]),
  'Explosion Wave do Vizier incorreta');
s = skill('cobra-vizier', 'death chain');
must(s.el === 'death' && s.chain === 3 && s.range === 3 && s.fx === 'mort-area',
  'Death Chain do Vizier incorreta');
s = skill('cobra-assassin', 'wave t');
must(s.el === 'earth' && s.fx === 'green-rings' &&
  JSON.stringify(s.areaPattern) === JSON.stringify([[0],[-1,0,1]]),
  'Wave T do Assassin incorreta');

// Mapa do commit f366081 publicado integralmente no runtime, com zonas.
const source = fs.readFileSync(path.join(game, 'beta-maps', 'cobra_bastion.otbm'));
const runtime = fs.readFileSync(path.join(game, 'maps', 'cobra_bastion.otbm'));
must(source.equals(runtime), 'cobra_bastion beta não foi publicado em maps/');
let map = OTBM.read(runtime);
must(map.z === 2 && map.w === 24 && map.h === 17 &&
     map.sourceBounds.minX === 146 && map.sourceBounds.minY === 155,
  'Fonte Canary da Cobra Bastion inesperada');
// Não aplica crop: o mapa inteiro é renderizado e o canvas limita o FOV.
const zonesSource = fs.readFileSync(path.join(js, 'otbmhunt.js'), 'utf8');
const start = zonesSource.indexOf('function applyHuntOtbmZones');
const end = zonesSource.indexOf('\n\n/* Garante', start);
vm.runInContext(zonesSource.slice(start, end), ctx);
ctx.applyHuntOtbmZones(map, cobraHunt);
must(map.w === 24 && map.h === 17 && map.spawn.x === 11 && map.spawn.y === 10 && map.mob.length === 120,
  'Mapa integral ou zonas absolutas da Cobra Bastion foram alterados');

vm.runInContext(fs.readFileSync(path.join(js, 'tileflags.js'), 'utf8'), ctx);
const hm = OTBM.huntMapFromOtbm(map, ctx.TILEFLAGS);
must(hm.rows.length === 17 && hm.rows.every(row => row.length === 24),
  'Mapa integral da Cobra Bastion não ficou 24×17');
must(hm.spawn.x === 11 && hm.spawn.y === 10 && hm.mob.length === 120,
  'Runtime alterou spawn/zonas do mapa integral');
must(!hm.leg[hm.rows[hm.spawn.y][hm.spawn.x]].bloc &&
     !hm.footprintBlocked[hm.spawn.x + ':' + hm.spawn.y],
  'Player nasce em parede/objeto bloqueante');
const freeMobCells = hm.mob.filter(p => {
  const entry = hm.leg[hm.rows[p.y][p.x]];
  return entry && !entry.bloc && !hm.footprintBlocked[p.x + ':' + p.y];
});
must(freeMobCells.length >= 10, 'Área de respawn não comporta uma onda HARD completa');
const visualIds = new Set();
Object.values(hm.leg).forEach(e => {
  (e.v || []).forEach(id => visualIds.add(id));
  (e.g || []).forEach(id => visualIds.add(id));
});
must(!visualIds.has(16249), 'Marcador invisível 16249 ainda gera request de sprite');
for (const id of visualIds)
  must(fs.existsSync(path.join(game, 'assets', 'tiles', id + '.png')), 'Sprite runtime ausente: ' + id);

const used = new Set();
Object.values(OTBM.read(runtime).cells).forEach(c => {
  if (c.g) used.add(c.g); (c.items || []).forEach(id => used.add(id));
});
const missing = [...used].filter(id => id !== 16249 &&
  !fs.existsSync(path.join(game, 'assets', 'tiles', id + '.png')));
must(!missing.length, 'Mapa Cobra com sprites ausentes: ' + missing.join(','));

// Grounds com patterns X/Y usam a variação da coordenada, em vez de repetir
// xp=0/yp=0 em todo SQM (a repetição formava o quadriculado visível).
vm.runInContext(fs.readFileSync(path.join(js, 'tilepatterndata.js'), 'utf8'), ctx);
for (const id of visualIds) if (ctx.TILE_PATTERNS[id])
  must(fs.existsSync(path.join(game, 'assets', 'tiles', id + '_pattern.png')),
    'Preloader da Cobra requisitaria pattern ausente: ' + id);
const stonePattern = ctx.TILE_PATTERNS[1128];
const floorPattern = ctx.TILE_PATTERNS[10113];
must(stonePattern && stonePattern.px === 4 && stonePattern.py === 4 &&
     stonePattern.aw === 64 && stonePattern.ah === 64,
  'Pattern 4x4 do ground 1128 ausente');
must(floorPattern && floorPattern.px === 2 && floorPattern.py === 2 && floorPattern.af === 4,
  'Pattern/frames do ground 10113 ausentes');
for (const id of [1128,10113,10605]) {
  const meta = ctx.TILE_PATTERNS[id];
  const png = fs.readFileSync(path.join(game, 'assets', 'tiles', id + '_pattern.png'));
  must(meta && png.readUInt32BE(16) === meta.aw * meta.px * meta.py * meta.af &&
       png.readUInt32BE(20) === meta.ah,
    'Strip de pattern inválido: ' + id);
}
const tilemapSrc = fs.readFileSync(path.join(js, 'tilemap.js'), 'utf8');
must(tilemapSrc.includes('_patternSource(id, cx, cy)') &&
     tilemapSrc.includes('x * tw, y * th, tw, x, y'),
  'Renderer não seleciona pattern por coordenada');
const patternCtx = {
  window:{}, performance:{now:() => 0}, ASSET_VERSION:'test', TILE_ANIM:{},
  Image:function(){ this.complete=true; this.naturalWidth=4096; },
};
patternCtx.window = patternCtx;
vm.createContext(patternCtx);
vm.runInContext(fs.readFileSync(path.join(js, 'tilepatterndata.js'), 'utf8'), patternCtx);
vm.runInContext(tilemapSrc, patternCtx);
const patternOffsets = vm.runInContext(`[
  TileSprites._patternSource(1128,0,0).sx,
  TileSprites._patternSource(1128,1,0).sx,
  TileSprites._patternSource(1128,0,1).sx,
  TileSprites._patternSource(1128,4,4).sx
]`, patternCtx);
must(JSON.stringify(patternOffsets) === JSON.stringify([0,64,256,0]),
  'Pattern 4x4 não varia/repete corretamente pelas coordenadas');

// Regra da categoria: extremos e faixa inteira 6–10.
vm.runInContext(fs.readFileSync(path.join(js, 'combat.js'), 'utf8'), ctx);
const caster = {cx:5,cy:5}, target = {cx:5,cy:1};
const explosionCells = ctx.skillPatternCells(caster, target, [[0],[-1,0,1],[-1,0,1]])
  .map(q => q.cx + ':' + q.cy);
must(JSON.stringify(explosionCells) ===
  JSON.stringify(['5:4','4:3','5:3','6:3','4:2','5:2','6:2']),
  'Engine não reproduz a matriz direcional da Explosion Wave');
must(ctx.skillPatternHas(caster, target, [[0],[-1,0,1]], 4, 3) &&
     !ctx.skillPatternHas(caster, target, [[0],[-1,0,1]], 4, 4),
  'Engine aplica dano fora da matriz da Wave T');
must(ctx.huntWaveSize({cat:'hard'}, 0) === 6 &&
     ctx.huntWaveSize({cat:'hard'}, .999999) === 10,
  'Categoria HARD não sorteia entre 6 e 10');
const seen = new Set(Array.from({length:100}, (_,i) => ctx.huntWaveSize({cat:'hard'}, i/100)));
must([6,7,8,9,10].every(n => seen.has(n)), 'Faixa HARD não alcança todos os tamanhos 6–10');

console.log('OK: HARD Hunts, Cobra Bastion, 3 Cobras, loot, stats, magias, sprites e zonas validados.');
