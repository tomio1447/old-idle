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
must(html.includes("forge-ui.js?v=depot-drag-v1") &&
  html.includes("accessories.js?v=depot-drag-v1") &&
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

console.log("ok: depot drag & drop (mochila/equip) + guardas de cache-bust");
