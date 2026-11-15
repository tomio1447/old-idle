/* Regressão: imbuement via Tibia Coins — 30/60/90 TC por tier, sem
 * materiais/gold, sucesso garantido; modal no padrão cidade. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, ".."), js = path.join(root, "game", "js");
const store = require("../server/store");
function must(ok, msg) { if (!ok) throw Error(msg); }

// ---- cliente: IMB_TIER_COINS + imbAddTc ----
const ctx = { window: {}, console, Math, Date, JSON };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(js, "imbuementdata.js"), "utf8"), ctx);
ctx.GAMEDATA = { items: {
  sword: { n: "sword", s: "weapon", t: "sword", imbSlots: 2 },
  wand: { n: "wand", s: "weapon", t: "magic", imbSlots: 1 },
}, monsters: {}, hunts: {} };
ctx.fmtFull = (n) => String(n);
ctx.removeLootPouch = () => { throw Error("TC não pode tocar na loot pouch"); };
vm.runInContext(fs.readFileSync(path.join(js, "imbuement.js"), "utf8"), ctx);

const tierCoins = vm.runInContext("IMB_TIER_COINS", ctx);
const imbDuracao = vm.runInContext("IMB_DURACAO_MS", ctx);
must(JSON.stringify(tierCoins) === JSON.stringify(store.IMBUEMENT_TIER_COINS),
  "preços TC divergem entre cliente e servidor");
must(tierCoins[1] === 30 && tierCoins[2] === 60 && tierCoins[3] === 90,
  "preços TC devem ser 30/60/90 por tier");

// Aplica sem materiais, sem gold e sem roll (sucesso garantido).
const p = { equip: { weapon: { item: "sword", instId: 42 } },
            imbuements: {}, lootPouch: {}, gold: 0 };
let r = ctx.imbAddTc(p, "weapon", "Vampirism", 3);
must(r.ok === true && r.failed !== true, "imbAddTc falhou: " + r.msg);
const slot = p.imbuements["inst:42"];
must(slot && slot.length === 1 && slot[0].key === "Vampirism" && slot[0].tier === 3,
  "imbue via TC não foi gravado na instância do item");
must(slot[0].rest === imbDuracao, "duração via TC deve ser a cheia (20h)");
must(p.gold === 0 && Object.keys(p.lootPouch).length === 0,
  "via TC não pode consumir gold nem materiais");

// Mesmas validações do caminho normal.
must(ctx.imbAddTc(p, "weapon", "Vampirism", 1).ok === false,
  "imbue duplicado não pode passar via TC");
r = ctx.imbAddTc(p, "weapon", "Void", 2);
must(r.ok === true, "segundo imbue de categoria diferente deveria aplicar: " + r.msg);
must(ctx.imbAddTc(p, "weapon", "Strike", 1).ok === false,
  "item cheio (2 slots) não pode receber terceiro imbue");
must(ctx.imbAddTc(p, "weapon", "Swiftness", 1).ok === false,
  "categoria de boots não pode ir em arma");
must(ctx.imbAddTc({ equip: { weapon: { item: "wand" } }, imbuements: {}, lootPouch: {} },
  "weapon", "Vampirism", 1).ok === false, "wand não pode levar Vampirism");
must(ctx.imbAddTc({ equip: {}, imbuements: {}, lootPouch: {} },
  "weapon", "Vampirism", 1).ok === false, "slot vazio não pode imbuar");

// Caminho normal (gold+materiais) continua intacto após a refatoração.
const p2 = { equip: { weapon: { item: "sword" } }, imbuements: {},
             lootPouch: { "mat-9685": 25 }, gold: 100000 };
const pouchBefore = Object.assign({}, p2.lootPouch);
r = ctx.imbAddTc(p2, "weapon", "Vampirism", 1);
must(r.ok === true && p2.gold === 100000 &&
  JSON.stringify(p2.lootPouch) === JSON.stringify(pouchBefore),
  "via TC tocou em gold/loot pouch");

// ---- servidor: buyImbuement debita o tier certo e registra o ledger ----
async function main() {
  const ledger = [], debits = [];
  const acc = { id: 7, login: "acc", coins: 100, cosmetics: {} };
  let coins = 100;
  const db = {
    findAccountByToken: async (t) => (t === "tok" ? acc : null),
    debitCoins: async (id, n) => { debits.push(n); if (coins < n) return false; coins -= n; return true; },
    updateCoins: async () => { throw Error("debitCoins disponível — não usar updateCoins"); },
    findAccountById: async () => ({ coins }),
    coinLedgerAdd: async (row) => { ledger.push(row); return row; },
  };

  let res = await store.buyImbuement(db, { token: "tok", tier: 3 });
  must(res.code === 200 && res.body.ok && res.body.price === 90 && res.body.coins === 10,
    "buyImbuement Powerful deveria debitar 90 TC");
  must(debits[0] === 90, "débito atômico deve ser de 90");
  must(ledger.length === 1 && ledger[0].kind === "spend" &&
    ledger[0].delta === -90 && ledger[0].ref === "imbuement:tier3" &&
    ledger[0].coinsAfter === 10, "ledger do imbue via TC incorreto");

  // coins agora é 10 — tier 1 (30) deve falhar sem mudar o saldo:
  res = await store.buyImbuement(db, { token: "tok", tier: 1 });
  must(res.code === 400 && res.body.ok === false && coins === 10 &&
    ledger.length === 1, "compra sem saldo não pode debitar nem registrar");
  res = await store.buyImbuement(db, { token: "tok", tier: 4 });
  must(res.code === 400 && res.body.ok === false, "tier inválido aceito");
  res = await store.buyImbuement(db, { token: "bad", tier: 1 });
  must(res.code === 401, "token inválido deve dar 401");

  // ---- integrações: rota, client API e modal ----
  const srv = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  must(srv.includes('"/api/store/imbuement"') && srv.includes("store.buyImbuement"),
    "rota /api/store/imbuement ausente no server.js");
  const accClient = fs.readFileSync(path.join(js, "account-client.js"), "utf8");
  must(accClient.includes("storeBuyImbuement") && accClient.includes("/api/store/imbuement"),
    "storeBuyImbuement ausente em account-client.js");

  const ui = fs.readFileSync(path.join(js, "imbuement-ui.js"), "utf8");
  for (const needle of ["imb-modal-shell", "cidade-modal-shell", "cidade-modal-title",
    "panel-body", "imb-tc-apply", "imb-tc-btn", "tibia-coins.gif",
    "imbAddTc", "storeBuyImbuement", "imbPrecheck"])
    must(ui.includes(needle), "imbuement-ui.js sem " + needle);
  const city = fs.readFileSync(path.join(js, "city-ui.js"), "utf8");
  must(city.includes('"imb-modal-shell"'), "CITY_MODAL_SHELLS sem imb-modal-shell");
  const css = fs.readFileSync(path.join(root, "game", "css", "layout.css"), "utf8");
  must(css.includes(".modal-bg .modal.imb-modal-shell") && css.includes(".imb-tc-btn"),
    "layout.css sem regras da shell/botão TC");

  console.log("OK — imbuement via Tibia Coins: 30/60/90 por tier, sem mats/gold, " +
    "sucesso garantido, débito atômico + ledger no servidor, modal padrão cidade.");
}
main().then(() => {}, (e) => { console.error(e); process.exit(1); });
