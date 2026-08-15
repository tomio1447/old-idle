/* Regressão completa da Scarlett Etzel e da esteira direcional.
 * Fonte: Canary 157e6f9e, scarlett_etzel.lua. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
const OTBM = require(path.join(js, 'otbm.js'));
function must(ok, msg) { if (!ok) throw Error(msg); }

const ctx = {
  console, BOSS_DEFS:{}, BOSS_COOLDOWN:57600000, Math, Date, Map, Set,
  addEventListener(){},
  maxStats(p){ return { hp:p.maxHp || 1, mp:p.maxMp || 0 }; },
  setTimeout(){ return 1; }, clearTimeout(){},
};
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  'gamedata.js','weapondata.js','weapons.js','ammodata.js','ammo.js',
  'monsterdata.js','mobsheetdata.js','monsters.js','hard-hunts.js',
]) vm.runInContext(fs.readFileSync(path.join(js, file), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(js, 'scarlett-boss.js'), 'utf8'), ctx);

const mob = ctx.GAMEDATA.monsters['scarlett-etzel'];
must(mob && mob.hp === 30000 && mob.exp === 20000 && mob.speed === 120,
  'HP/EXP/speed da Scarlett divergem do Canary');
must(mob.armor === 88 && mob.defense === 88 && mob.damage === 1200,
  'Defesa/armor/melee da Scarlett divergentes');
must(!mob.resist || Object.keys(mob.resist).length === 0,
  'Scarlett deveria ter 0% em todos os elementos');
must(mob.imune.includes('paralyze') && mob.imune.includes('invisible'),
  'Imunidades da Scarlett divergentes');

const expectedLoot = [
  ['energy-bar',100,1],['platinum-coin',87,9],['green-gem',85,1],
  ['supreme-health-potion',53.7,14],['ultimate-mana-potion',48.15,20],
  ['red-gem',42.5,1],['ultimate-spirit-potion',34,6],['yellow-gem',29.6,2],
  ['royal-star',26.6,100],['giant-shimmering-pearl',24,1],['berserk-potion',20.3,10],
  ['blue-gem',18.5,2],['bullseye-potion',18.5,10],['transcendence-potion',18.5,10],
  ['magma-coat',16.6,1],['terra-rod',1.1,1],['crystal-coin',9.2,1],
  ['violet-gem',9,1],['terra-legs',8.5,1],['terra-hood',7.4,1],
  ['terra-mantle',7.25,1],['magma-amulet',5.5,1],['silver-token',6,4],
  ['gold-ingot',5,1],['terra-amulet',4.8,1],['giant-sapphire',4.8,1],
  ['magma-monocle',3.7,1],['cobra-club',0.7,1],['cobra-axe',0.6,1],
  ['cobra-crossbow',0.6,1],['cobra-hood',0.4,1],['cobra-rod',0.65,1],
  ['cobra-sword',0.65,1],['cobra-wand',0.65,1],['cobra-amulet',0.35,1],
  ['cobra-bo',0.6,1],
];
const actualLoot = mob.loot.map(l => [l.item,l.chance,l.max]);
must(JSON.stringify(actualLoot) === JSON.stringify(expectedLoot),
  'Loot da Scarlett diverge do scarlett_etzel.lua');
for (const [item] of actualLoot) {
  must(ctx.GAMEDATA.items[item], 'Loot sem ficha: ' + item);
  must(fs.existsSync(path.join(game, 'assets', 'item', item + '.png')),
    'Loot sem sprite: ' + item);
}

const sd = mob.skills.find(s => s.n === 'sudden death rune');
must(sd.el === 'death' && sd.range === 7 && sd.fx === 'mort-area' && sd.miss === 'sudden-death',
  'Sudden Death da Scarlett não usa death/range/efeitos corretos');
const holy = mob.skills.find(s => s.el === 'holy');
const earth = mob.skills.find(s => s.el === 'earth');
must(holy && holy.min === 450 && holy.max === 640 && holy.length === 7,
  'Holy wave da Scarlett divergente');
must(earth && earth.min === 480 && earth.max === 800 && earth.radius === 5,
  'Earth explosion da Scarlett divergente');

const sheet = ctx.MOBSHEETS['scarlett-etzel'];
must(sheet && sheet.cols === 9 && sheet.rows === 4 &&
  fs.existsSync(path.join(game,'assets','mob','scarlett-etzel.png')),
  'Outfit 1201 da Scarlett incompleta');

const boss = ctx.BOSS_DEFS['scarlett-etzel'];
const room = ctx.GAMEDATA.hunts['scarlett-room'];
must(boss && boss.hunt === 'scarlett-room' && boss.noRevive && boss.mechanic === 'direction-qte',
  'Scarlett não foi registrada como boss QTE sem revive');
must(boss.hp === 130000 && room.avgHp === 130000,
  'HP configurado da boss Scarlett deveria ser 130000');
must(room.hidden && !room.otbmBounds &&
  JSON.stringify(room.otbmSpawn) === JSON.stringify({x:176,y:169,z:2}) &&
  JSON.stringify(room.otbmMobBounds) === JSON.stringify({x:191,y:165,w:1,h:1,z:2}),
  'Coordenadas da arena/spawns da Scarlett incorretas');

// Mapa publicado inteiro: as paredes ficam nas bordas externas 24×16.
const beta = fs.readFileSync(path.join(game,'beta-maps','bossesroom','scarlet_room.otbm'));
const runtime = fs.readFileSync(path.join(game,'maps','scarlet_room.otbm'));
must(beta.equals(runtime), 'scarlet_room beta não foi publicado em maps/');
let map = OTBM.read(runtime);
must(map.w === 24 && map.h === 16 && map.z === 2, 'Mapa fonte Scarlett inesperado');
const zoneSrc = fs.readFileSync(path.join(js,'otbmhunt.js'),'utf8');
const zs = zoneSrc.indexOf('function applyHuntOtbmZones');
const ze = zoneSrc.indexOf('\n\n/* Garante', zs);
vm.runInContext(zoneSrc.slice(zs,ze), ctx);
ctx.applyHuntOtbmZones(map, room);
must(map.spawn.x === 4 && map.spawn.y === 11 && map.mob[0].x === 19 && map.mob[0].y === 7,
  'Coordenadas absolutas não viraram posições locais corretas');
vm.runInContext(fs.readFileSync(path.join(js,'tileflags.js'),'utf8'), ctx);
const hm = OTBM.huntMapFromOtbm(map, ctx.TILEFLAGS);
must(hm.rows.length === 16 && hm.rows.every(r => r.length === 24), 'Arena nativa não é 24×16');
must(hm.spawn.x === 4 && hm.spawn.y === 11 && hm.mob[0].x === 19 && hm.mob[0].y === 7,
  'Runtime alterou spawn de player/boss');
const blocked = p => hm.leg[hm.rows[p.y][p.x]].bloc || hm.footprintBlocked[p.x+':'+p.y];
must(!blocked(hm.spawn) && !blocked(hm.mob[0]), 'Player ou boss nasce em tile bloqueado');
let blockedCount = 0;
for (let y=0; y<hm.rows.length; y++) for (let x=0; x<hm.rows[y].length; x++)
  if (blocked({x,y})) blockedCount++;
must(blockedCount >= 200 && Object.keys(hm.footprintBlocked).length >= 170,
  'Paredes externas da sala não foram renderizadas/colididas');

// Integração real newBossCombat: mapa, player, boss e imunidade inicial.
ctx.HUNTMAPS = { 'otbm:scarlet_room': hm };
room.mapa = 'otbm:scarlet_room';
ctx.huntMapBlocked = (mapa,x,y) => {
  if (!mapa || y<0 || y>=mapa.rows.length || x<0 || x>=mapa.rows[y].length) return true;
  return !!(mapa.footprintBlocked[x+':'+y] || mapa.leg[mapa.rows[y][x]].bloc);
};
vm.runInContext(fs.readFileSync(path.join(js,'grid.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(js,'combat.js'),'utf8'),ctx);
const livePlayer = { id:'solo',name:'Solo',hp:2000,mp:500,maxHp:2000,maxMp:500,
  instanceMode:'boss',config:{attackMode:'kiting'},deaths:0 };
const live = ctx.newBossCombat(livePlayer,boss);
must(live.gridW===24 && live.gridH===16 && live.player.cx===4 && live.player.cy===11,
  'newBossCombat ignorou arena/spawn do player');
must(live.mobs[0].cx===19 && live.mobs[0].cy===7 && live.scarlett.immune,
  'newBossCombat ignorou spawn/imunidade da Scarlett');
must(live.mobs[0].maxHp===130000,
  'newBossCombat não aplicou os 130000 HP da Scarlett');

const used = new Set();
Object.values(OTBM.read(runtime).cells).forEach(c => { if(c.g)used.add(c.g); (c.items||[]).forEach(i=>used.add(i)); });
must(![...used].some(id => !fs.existsSync(path.join(game,'assets','tiles',id+'.png'))),
  'Arena Scarlett possui sprites ausentes');

// Mecânica determinística: 5–10s, cinco inputs, gates e permadeath.
function ent(id,name,maxHp) {
  return { id,name,maxHp,p:{id,name,hp:maxHp,mp:100,maxHp,maxMp:100,deaths:0},
    x:.2+id*.05,y:.6,cx:2+id,cy:8,dir:'e',moving:false };
}
const a=ent(1,'Knight',1200), b=ent(2,'Druid',600), d=ent(3,'Paladin',900);
const fight = { boss, player:a, players:[a,b,d], mobs:[{boss:true,hp:30000,maxHp:30000,x:.8,y:.4}],
  stats:{deaths:0}, events:[] };
const before=Date.now();
ctx.scarlettBossInit(fight,a.p,()=>0);
must(fight.scarlett.immune && fight.scarlett.nextAt >= before+5000 && fight.scarlett.nextAt <= before+10000,
  'Scarlett não começa imune por 5–10s');
ctx.scarlettStartQte(fight,1000,()=>0); // sequência inteira ↑
for (const note of fight.scarlett.notes.slice())
  must(ctx.scarlettHandleKey(fight,'ArrowUp',note.due) === true, 'Input correto rejeitado');
must(!fight.scarlett.immune && fight.scarlett.phase === 'vulnerable', 'Cinco acertos não removeram imunidade');
fight.mobs[0].hp=21000;
ctx.scarlettBossEnforceThreshold(fight,9000);
must(fight.mobs[0].hp===22500 && fight.scarlett.immune && fight.scarlett.thresholdIndex===1,
  'Gate de 75% foi pulado por dano alto');
ctx.scarlettStartQte(fight,10000,()=>0);
ctx.scarlettHandleKey(fight,'ArrowLeft',fight.scarlett.notes[0].due); // esperado ↑
must(b.permadead && b.p.hp===0 && b.reviveAt===0 && b.deathPos,
  'Erro não matou permanentemente o menor HP máximo');
must(a.p.hp>0 && d.p.hp>0, 'Erro matou jogador fora da prioridade de menor HP');
ctx.scarlettBossCleanup(fight);
must(!b.permadead && b.p.hp===600, 'Morto não voltou à vida após finalizar a boss fight');

const combatSrc=fs.readFileSync(path.join(js,'combat.js'),'utf8');
const gameSrc=fs.readFileSync(path.join(js,'game.js'),'utf8');
const renderSrc=fs.readFileSync(path.join(js,'render.js'),'utf8');
const indexSrc=fs.readFileSync(path.join(game,'index.html'),'utf8');
must(combatSrc.includes('bossCanTakePlayerDamage') && combatSrc.includes('bossHandlePermanentDown') &&
  combatSrc.includes('scarlettBossEnforceThreshold'), 'Hooks de imunidade/permadeath/gates ausentes');
must(gameSrc.includes('!ent.permadead && ent.reviveAt'), 'Loop ainda revive mortos da Scarlett');
must(renderSrc.includes('!!ent.permadead'), 'Corpse permanente não é renderizado');
must(indexSrc.includes('id="scarlett-qte"') && indexSrc.includes('js/scarlett-boss.js'),
  'Overlay/script da esteira não estão no jogo');
const scarlettSrc=fs.readFileSync(path.join(js,'scarlett-boss.js'),'utf8');
must(scarlettSrc.includes('SCARLETT_TIMING_WINDOW = 360') &&
  scarlettSrc.includes('SCARLETT_ONLINE_SLACK = 180') &&
  scarlettSrc.includes('SCARLETT_LEAD_MS = 1400'),
  'Constantes de timing da Scarlett divergiram');
must(!scarlettSrc.includes('DANÇA AUTOMÁTICA') && scarlettSrc.includes('scarlettHydrateOnlineNotes'),
  'Online ainda não hidrata a esteira QTE');
must(indexSrc.includes('scarlett-boss.js?v=boss-death-wipe-v1'),
  'Cache-bust do QTE Scarlett ausente');

console.log('OK: Scarlett, loot, outfit, magias, mapa, QTE, gates, permadeath e corpses validados.');
