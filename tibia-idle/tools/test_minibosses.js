/* Regressão: 8 minibosses a 0,01% por slot (1/10001, padrão mawhawk).
 * burster e sir-leopold são fichas novas (fora do dump Canary); os demais
 * vêm do dump. Pale Count/Vampires Edron adiado (hunt inexistente). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');
const js = path.join(game, 'js');
function must(ok, msg) { if (!ok) throw Error(msg); }

const ctx = { window: {}, console, setInterval, clearInterval, Date, Math, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  'gamedata.js', 'weapondata.js', 'weapons.js', 'ammodata.js', 'ammo.js',
  'monsterdata.js', 'monstermovedata.js', 'mobsheetdata.js', 'monsters.js',
  'hard-hunts.js', 'lizardstown.js', 'draken-walls.js', 'elf-yalahar.js',
  'banuta-deeper.js', 'elder-wyrm-darashia.js', 'the-void.js',
  'radiant-skyhold.js', 'proficiency-catalysts.js', 'book-world.js',
  'sir-leonard.js',
]) vm.runInContext(fs.readFileSync(path.join(js, file), 'utf8'), ctx);

const CASES = {
  'lizardstown':          'battlemaster-zunzu',
  'the-void':             'burster',
  'draken-walls':         'chizzoron-the-distorter',
  'elf-yalahar':          'dharalion',
  'mota-extension':       'furyosa',
  'book-world':           'sir-leopold',
  'banuta-deeper':        'the-welter',
  'elder-wyrm-darashia':  'tyrn',
};

const E = require(path.join(__dirname, '..', 'server', 'authoritative_engine'));
const hunts = ctx.GAMEDATA.hunts;

for (const [huntId, boss] of Object.entries(CASES)) {
  const h = hunts[huntId];
  must(h, huntId + ': hunt ausente no cliente');
  must(JSON.stringify(h.bossMobs) === JSON.stringify([boss]),
    huntId + ': bossMobs divergente -> ' + JSON.stringify(h.bossMobs));
  must(h.spawnWeights && h.spawnWeights[boss] === 1,
    huntId + ': peso do miniboss deve ser 1');
  const total = h.monsters.concat(h.bossMobs)
    .reduce((s, k) => s + (h.spawnWeights[k] || 0), 0);
  must(total === 10001,
    huntId + ': pesos somam ' + total + ' (esperado 10001 = 0,01%/slot)');
  // todos os regulares com peso positivo
  for (const slug of h.monsters)
    must(h.spawnWeights[slug] > 0, huntId + ': ' + slug + ' sem peso');

  // Ficha cliente + engine
  const m = ctx.GAMEDATA.monsters[boss];
  const em = E.MONSTERS[boss];
  must(m, boss + ': sem ficha no cliente');
  must(em && em.hp === m.hp && em.exp === m.exp,
    boss + ': ficha cliente×engine divergente');
  must(m.hp > 0 && m.exp > 0, boss + ': hp/exp inválidos');

  // Sprite + MOBSHEETS
  const sheet = path.join(game, 'assets', 'mob', boss + '.png');
  must(fs.existsSync(sheet), boss + ': sem sheet');
  must(ctx.MOBSHEETS[boss] && ctx.MOBSHEETS[boss].cols >= 3 &&
       ctx.MOBSHEETS[boss].rows === 4,
    boss + ': MOBSHEETS ausente/incompleto');

  // Loot: todo item com ficha no cliente e no engine, com ícone
  const loot = (em.loot || []).map(l => l.item || l.i);
  must(loot.length > 0, boss + ': sem loot');
  for (const slug of loot) {
    must(ctx.GAMEDATA.items[slug], boss + ': loot sem ficha cliente: ' + slug);
    must(E.ITEMS[slug], boss + ': loot sem ficha engine: ' + slug);
    must(fs.existsSync(path.join(game, 'assets', 'item', slug + '.png')),
      boss + ': loot sem ícone: ' + slug);
  }
}

// Paridade engine: as duas hunts estáticas em HUNTS
must(JSON.stringify(E.HUNTS['book-world'].bossMobs) === '["sir-leopold"]' &&
     E.HUNTS['book-world'].spawnWeights['sir-leopold'] === 1,
  'engine: book-world sem paridade');
must(JSON.stringify(E.HUNTS['mota-extension'].bossMobs) === '["furyosa"]' &&
     E.HUNTS['mota-extension'].spawnWeights['furyosa'] === 1,
  'engine: mota-extension sem paridade');
for (const id of ['book-world', 'mota-extension']) {
  const w = E.HUNTS[id].spawnWeights;
  must(Object.values(w).reduce((a, b) => a + b, 0) === 10001,
    'engine: ' + id + ' pesos divergem de 10001');
}
// As outras 6 hunts hidratam via descriptor (captureAuthHuntDef) — não
// devem constar estáticas no HUNTS (senão duplicariam sem o boss).
for (const id of ['lizardstown', 'the-void', 'draken-walls', 'elf-yalahar',
  'banuta-deeper', 'elder-wyrm-darashia'])
  must(!E.HUNTS[id] || JSON.stringify(E.HUNTS[id].bossMobs) ===
    JSON.stringify([CASES[id]]), 'engine: ' + id + ' estática divergente');

// Seção do modal: banuta-deeper reinserida, todas as 8 hunts listadas
const sectionsSource = fs.readFileSync(path.join(js, 'hunt-sections.js'), 'utf8');
const sec = /title:\s*"HUNTS 100–250",\s*ids:\s*\[([^\]]*)\]/.exec(sectionsSource);
must(sec && sec[1].includes('"banuta-deeper"'),
  'banuta-deeper ausente da seção HUNTS 100–250 do modal');
const ui = fs.readFileSync(path.join(js, 'ui.js'), 'utf8');
must(ui.includes('MINI BOSSES'), 'modal sem a seção MINI BOSSES');

// Sorteio real do engine: ~0,01% por pick (estática + descriptor-hidratada)
{
  const hunts2 = {
    'mota-extension': { huntId: 'mota-extension' },
    'the-void': {
      huntMonsters: hunts['the-void'].monsters.slice(),
      huntBossMobs: hunts['the-void'].bossMobs.slice(),
      huntSpawnWeights: Object.assign({}, hunts['the-void'].spawnWeights),
    },
  };
  const boss2 = { 'mota-extension': 'furyosa', 'the-void': 'burster' };
  for (const [id, auth] of Object.entries(hunts2)) {
    const picks = {}; const N = 200000;
    for (let i = 0; i < N; i++) {
      const s = E.pickHuntSpawnSlug(auth);
      picks[s] = (picks[s] || 0) + 1;
    }
    const pct = (picks[boss2[id]] || 0) / N * 100;
    must(pct > 0.002 && pct < 0.03,
      id + ': taxa observada ' + pct.toFixed(4) + '% fora de ~0,01%');
  }
}

// Itens novos: colourful-quill (Sir Leopold) precificado com ícone
const quill = ctx.GAMEDATA.items['colourful-quill'];
must(quill && quill.cid === 51421 && quill.npcSell === 110000,
  'colourful-quill: ficha/preço divergente (oficial 110k Yasir/Fiona)');
must(fs.existsSync(path.join(game, 'assets', 'item', 'colourful-quill.png')),
  'colourful-quill sem ícone');

console.log('test_minibosses: OK — 8 hunts/minibosses validados');
