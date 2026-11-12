/* Regressão: itens do Depot são movíveis por drag & drop como os demais
 * containers (mochila/pouch/stash) e o fluxo via menu continua intacto.
 *
 * Antes, o depot só tinha menu de clique ("Equipar"/"Retirar para mochila")
 * e os itens do grid NÃO eram arrastáveis nem o grid era alvo de drop —
 * ao contrário de mochila/pouch/stash/equip. Agora:
 *   - itens do depot são draggable (payload {source:"depot", slug, ref});
 *   - soltar na mochila → depotRetrieve; no slot de equip → depotEquip;
 *   - soltar item da mochila/equip no grid do depot → depotStore;
 *   - Supply Stash rejeita payload do depot (não é um destino válido);
 *   - forge-ui.js ganhou cache-bust no index (único script sem ?v=).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const forgeUi = fs.readFileSync(path.join(js, "forge-ui.js"), "utf8");
const accessories = fs.readFileSync(path.join(js, "accessories.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");

/* ---------------- estático ---------------- */
must(forgeUi.includes('id="depot-grid"'), "grid do depot sem id para drop");
must(forgeUi.includes("bindItemDrag(el, { source: 'depot'"),
  "itens do depot não são arrastáveis");
must(forgeUi.includes("body.querySelector('#depot-grid')") &&
  forgeUi.includes('depotStore(G.p, payload.instId || payload.slug)'),
  "grid do depot não aceita drop de mochila/equip");
must(accessories.includes('payload.source === "depot"'),
  "moveItemToBag/moveItemToEquip sem branch de depot");
must(accessories.includes('typeof depotRetrieve !== "function"') &&
  accessories.includes('typeof depotEquip !== "function"'),
  "branches de depot sem guard de typeof");
must(uiSrc.includes('payload.source === "depot") return false;'),
  "Supply Stash deveria rejeitar payloads do depot");
must(html.includes("forge-ui.js?v=depot-flow-v3") &&
  html.includes("accessories.js?v=") &&
  html.includes("ui.js?v="),
  "cache-busts do depot drag ausentes no index");

/* ---------------- lógica real das funções em vm ---------------- */
function extractFn(src, name) {
  const i = src.indexOf("function " + name);
  must(i >= 0, name + " não encontrada");
  let depth = 0, start = src.indexOf("{", i), end = -1;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) { end = k + 1; break; }
  }
  must(end > start, name + " sem fim");
  return src.slice(i, end);
}

let toasts = [];
let lastRetrieveRef = null, retrieveResult = null;
let lastEquipRef = null, equipResult = null;
const ctx = {
  window: {}, document: undefined, console, Date, Math, JSON,
  toast: (m) => toasts.push(String(m)),
  depotRetrieve: (p, ref) => { lastRetrieveRef = ref; return retrieveResult; },
  depotEquip: (p, ref) => { lastEquipRef = ref; return equipResult; },
};
vm.createContext(ctx);
vm.runInContext(
  extractFn(accessories, "moveItemToBag") + "\n" +
  extractFn(accessories, "moveItemToEquip"), ctx, { filename: "move-depot" });
const moveItemToBag = vm.runInContext("moveItemToBag", ctx);
const moveItemToEquip = vm.runInContext("moveItemToEquip", ctx);
const P = {};

// depot → bag: sucesso chama depotRetrieve com o ref do payload
retrieveResult = { ok: true, msg: "ok" };
must(moveItemToBag(P, { source: "depot", slug: "x", ref: "R1" }) === true &&
  lastRetrieveRef === "R1", "depot→bag não usou depotRetrieve");
// depot → bag: falha propaga toast e retorna false
toasts = []; retrieveResult = { ok: false, msg: "Mochila cheia." };
must(moveItemToBag(P, { source: "depot", slug: "x", ref: "R1" }) === false &&
  toasts.length === 1 && toasts[0].indexOf("Mochila cheia.") >= 0,
  "falha do depotRetrieve não virou toast/false");
// depot → equip: sucesso e falha
equipResult = { ok: true };
must(moveItemToEquip(P, { source: "depot", slug: "y", ref: "R2" }, "weapon") === true &&
  lastEquipRef === "R2", "depot→equip não usou depotEquip");
toasts = []; equipResult = { ok: false, msg: "Vocação incompatível." };
must(moveItemToEquip(P, { source: "depot", slug: "y", ref: "R2" }, "weapon") === false &&
  toasts.length === 1, "falha do depotEquip não virou toast/false");
// fontes desconhecidas continuam retornando false
must(moveItemToBag(P, { source: "xyz", slug: "z" }) === false, "fonte desconhecida deveria falhar");

const listeners = new Map(), timers = new Map();
let timerId = 0, menu = null;
const doc = {
  getElementById: () => menu,
  createElement: () => ({ style: {}, addEventListener() {},
    remove() { menu = null; }, getBoundingClientRect: () => ({ width: 120, height: 80 }) }),
  body: { appendChild(el) { menu = el; } },
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener(type, fn) { if (listeners.has(type)) listeners.get(type).delete(fn); },
};
const menuCtx = { document: doc, window: { innerWidth: 1024, innerHeight: 768 },
  $$: () => [], setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
  clearTimeout(id) { timers.delete(id); } };
const flushTimers = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
vm.createContext(menuCtx);
vm.runInContext(uiSrc.slice(uiSrc.indexOf('let CONTEXT_MENU_CLEANUP'), uiSrc.indexOf('/* Modal com os atributos')), menuCtx);
for (let i = 0; i < 5; i++) {
  menuCtx.showContextMenu(10, 10, 'Item ' + i, []);
  flushTimers();
  menuCtx.hideContextMenu();
  must([...listeners.values()].every((set) => set.size === 0), 'listeners antigos bloqueiam o próximo item do depot');
  menuCtx.showContextMenu(10, 10, 'Próximo item', []);
  for (const fn of [...(listeners.get('click') || [])]) fn({});
  must(menu !== null, 'clique no próximo item fechou imediatamente seu menu');
  flushTimers();
  for (const fn of [...listeners.get('click')]) fn({});
  must(menu === null, 'clique fora não fecha o menu');
}
menuCtx.showContextMenu(10, 10, 'Fechar antes do timer', []);
menuCtx.hideContextMenu(); flushTimers();
must([...listeners.values()].every((set) => set.size === 0), 'timer atrasado deixou listeners órfãos');
must(forgeUi.includes("body.classList.add('cidade-modal-shell', 'depot-modal-shell')"), 'depot não usa o padrão da cidade');

const pendingRequests = [];
const player = { id: 'equip-test', equip: { weapon: { item: 'old' } }, bag: { next: 1, last: 1 }, itemInstances: [] };
let combat = false, paint = '';
const previewCtx = {
  console, G: { p: player }, GAMEDATA: { items: { old: { n: 'old' }, next: { n: 'next' }, last: { n: 'last' } } },
  accountApiConfigured: () => true, sessionToken: () => 'test', onlineAuthorityCombat: () => combat,
  toast() {}, renderAll() {}, renderInventory() {},
  renderEquip(p) { paint = previewCtx.equipmentPreviewPlayer(p).equip.weapon?.item || ''; },
  accountEquipItem(token, id, opts) { return new Promise((resolve, reject) => pendingRequests.push({ resolve, reject, opts })); },
  equipItemFromContainer(p, slug, source) {
    const container = source === 'stash' ? p.supplyStash : p.bag;
    if (!container[slug]) return false;
    container[slug]--;
    if (p.equip.weapon) p.bag[p.equip.weapon.item] = (p.bag[p.equip.weapon.item] || 0) + 1;
    p.equip.weapon = { item: slug }; return true;
  },
  unequipToContainer(p) {
    if (!p.equip.weapon) return false;
    p.bag[p.equip.weapon.item] = (p.bag[p.equip.weapon.item] || 0) + 1;
    delete p.equip.weapon; return true;
  },
  applyOnlineAuthorityState(state) { player.equip = state.equip; player.bag = state.bag; },
};
vm.createContext(previewCtx);
vm.runInContext(uiSrc.slice(uiSrc.indexOf('const EQUIPMENT_PREVIEWS'), uiSrc.indexOf('/* Equipa 1 item da Supply Stash')), previewCtx);
const equipElement = {};
Object.defineProperty(equipElement, 'innerHTML', { set(value) { paint = (value.match(/data-item="([^"]+)"/) || [])[1] || ''; } });
Object.assign(previewCtx, { $: () => equipElement, $$: () => [], SLOT_ORDER: ['weapon'], SLOT_LABELS: { weapon: 'arma' },
  itemImg: (slug) => '<img src="' + slug + '.png">', itemClsBorder: () => '', forgeTierText: () => '', forgeTierClass: () => '' });
vm.runInContext(extractFn(uiSrc, 'renderEquip'), previewCtx);
(async () => {
  const first = previewCtx.persistEquipFromContainer(player, 'next', 'bag', 'weapon');
  must(paint === 'next' && player.equip.weapon.item === 'old', 'equip deve aparecer antes da rede sem alterar estado autoritativo');
  const second = previewCtx.persistEquipFromContainer(player, 'last', 'bag', 'weapon');
  must(paint === 'last', 'trocas rápidas devem exibir imediatamente o último item');
  player.equip = { weapon: { item: 'next' } }; player.bag = { old: 1, last: 1 };
  pendingRequests.shift().resolve({ ok: true }); await first;
  must(previewCtx.equipmentPreviewPlayer(player).equip.weapon.item === 'last', 'resposta antiga apagou a prévia mais recente');
  player.equip = { weapon: { item: 'last' } }; player.bag = { old: 1, next: 1 };
  pendingRequests.shift().resolve({ ok: true }); await second;
  must(previewCtx.equipmentPreviewPlayer(player) === player, 'preview não encerrou após confirmação');
  const failed = previewCtx.persistEquipFromContainer(player, 'next', 'bag', 'weapon');
  pendingRequests.shift().resolve({ ok: false, msg: 'recusado' }); await failed;
  must(paint === 'last' && previewCtx.equipmentPreviewPlayer(player) === player, 'rejeição não restaurou equipamento confirmado');
  combat = true;
  const online = previewCtx.persistEquipFromContainer(player, 'old', 'bag', 'weapon');
  must(paint === 'old', 'equip em combate aguarda a rede para aparecer');
  player.equip = { weapon: { item: 'last' } };
  must(previewCtx.equipmentPreviewPlayer(player).equip.weapon.item === 'old', 'tick atrasado apagou preview');
  pendingRequests.shift().resolve({ ok: true, state: { equip: { weapon: { item: 'old' } }, bag: { last: 1, next: 1 } } });
  await online;
  const unequip = previewCtx.persistUnequipFromContainer(player, 'weapon', 'bag');
  must(paint === '' && player.equip.weapon.item === 'old', 'desequip não tem resposta visual imediata');
  pendingRequests.shift().reject(Error('offline')); await unequip;
  must(paint === 'old' && previewCtx.equipmentPreviewPlayer(player) === player, 'erro de rede deixou preview preso');
  vm.runInContext(extractFn(uiSrc, 'persistEquipFromSupplyStash'), previewCtx);
  previewCtx.accountEquipFromSupplyStash = previewCtx.accountEquipItem;
  player.supplyStash = { next: 1 };
  const stashEquip = previewCtx.persistEquipFromSupplyStash(player, 'next', 'weapon');
  must(paint === 'next' && player.supplyStash.next === 1, 'Supply Stash deve ter preview sem consumir estado confirmado');
  pendingRequests.shift().reject(Error('offline')); await stashEquip;
  must(paint === 'old' && previewCtx.equipmentPreviewPlayer(player) === player, 'erro da Supply Stash deixou preview preso');
  console.log('OK — depot: drag, menus consecutivos, padrão cidade; equip: preview imediato, trocas rápidas, combate, stash e rollback.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
