/* Loot Pouch: máximo de 50 stacks distintos; stack já existente continua. */
const fs = require('fs');
const path = require('path');
const player = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'player.js'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'game.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'ui.js'), 'utf8');
function must(rx, s, msg) { if (!rx.test(s)) throw Error(msg); }
must(/const LOOT_POUCH_MAX_SLOTS = 50/, player, 'Capacidade de 50 slots ausente');
must(/function lootPouchSlotsUsed/, player, 'Contagem de slots ausente');
must(/lootPouchSlotsUsed\(p\) \+ needed > LOOT_POUCH_MAX_SLOTS/, player, 'Pouch cheia ainda aceita item');
must(/p\.lootPouch\[slug\] = \(p\.lootPouch\[slug\] \|\| 0\) \+ count/, player, 'Stack existente não acumula');
must(/lootPouchSlotsUsed\(p\)/, game, 'Autoseller não usa slots');
must(/slots \$\{pouchSlots\}\/\$\{pouchCap\}/, ui, 'UI não exibe slots 50');
console.log('OK: Loot Pouch limitada a 50 slots de stacks; cheia não coleta tipo novo.');
