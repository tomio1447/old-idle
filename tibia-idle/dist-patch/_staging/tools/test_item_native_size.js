/* Regressão: itens pequenos do client 15x não podem ser ampliados para
 * preencher slots de 28/32 px. `tam` é apenas o limite máximo. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const game = path.join(__dirname, '..', 'game');

function must(ok, message) { if (!ok) throw Error(message); }
function pngSize(slug) {
  const file = path.join(game, 'assets', 'item', slug + '.png');
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const small = {
  'gold-coin': [9, 9],
  'platinum-coin': [9, 9],
  'crystal-coin': [9, 9],
  'small-emerald': [5, 4],
  'small-topaz': [5, 4],
  'small-ruby': [4, 5],
  'small-sapphire': [5, 4],
  'small-amethyst': [4, 5],
};
for (const [slug, expected] of Object.entries(small)) {
  must(JSON.stringify(pngSize(slug)) === JSON.stringify(expected),
    `${slug}: dimensões nativas inesperadas`);
}

const ctx = {
  window: {},
  ASSET_VERSION: "1",
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(game, 'js', 'gamedata.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(game, 'js', 'weapons.js'), 'utf8'), ctx);

for (const slug of Object.keys(small)) {
  const html = ctx.itemImg(slug, 28);
  const it = ctx.GAMEDATA.items[slug];
  if (it && it.sf > 1) {
    // Stackables usam a tira _stack.png (bbox uniao); nao ampliam alem de `tam`.
    must(html.includes("_stack.png") && !html.includes("animation:item-anim"),
      `${slug}: stackable deveria travar frame (sem GIF)`);
    must(/width:\d+px/.test(html), `${slug}: stack sprite sem width`);
  } else {
    must(html.includes('max-width:28px;max-height:28px;width:auto;height:auto'),
      `${slug}: slot 28px não preserva tamanho/proporção nativos`);
    must(!html.includes('width:28px;height:28px'),
      `${slug}: sprite ainda está sendo esticada para 28×28`);
  }
}

// A mesma regra vale para strips animadas pequenas.
ctx.GAMEDATA.items['small-animated'] = { n: 'small animated', af: 3, aw: 5, ah: 4 };
const animated = ctx.itemImg('small-animated', 28);
must(animated.includes('width:5px;height:4px') &&
     animated.includes('background-size:15px 4px'),
  'Item animado pequeno foi ampliado além dos 5×4 pixels nativos');

const cyclo = fs.readFileSync(path.join(game, 'js', 'cyclopedia-ui.js'), 'utf8');
must(cyclo.includes('itemImg(l.item, 14)') &&
     !cyclo.includes('<img src="assets/item/${l.item}.png"'),
  'Loot direto da Cyclopedia ainda força 14×14');
const city = fs.readFileSync(path.join(game, 'js', 'city-ui.js'), 'utf8');
must(!/<img src="assets\/item\/\$\{(?:e\.slug|s\.sprite|slug|entry\.slug)\}\.png">/.test(city),
  'Loja da cidade ainda cria sprites de item com tamanho forçado pelo CSS');

console.log('OK: moedas e gemas preservam o tamanho nativo 15x dentro dos slots.');
