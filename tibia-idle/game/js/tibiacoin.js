/* tibiacoin.js — Tibia Coins (moeda premium do Tibia).
 *
 * No client oficial os Tibia Coins pertencem à CONTA: "Once bought, they
 * are available to all characters of the same account no matter the Game
 * World" (TibiaWiki/Tibia_Coins). Aqui o saldo fica num objeto de conta
 * separado no localStorage, compartilhado por todos os personagens do save.
 */
"use strict";

const ACCOUNT_KEY = "tibia-idle-account-v1";
const COINS_GIF = "assets/ui/coins/tibia-coins.gif";

/* Carrega (ou cria) a conta. Formato: { v: 1, coins: N } */
function accountLoad() {
  let acc = null;
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (raw) acc = JSON.parse(raw);
  } catch (e) { acc = null; }
  if (!acc || typeof acc !== "object" || typeof acc.coins !== "number") {
    acc = { v: 1, coins: 0, gold: 0, goldMigrated: false, lootPouch: {} };
  }
  acc.coins = Math.max(0, Math.floor(acc.coins) || 0);
  /* coinsNt: Tibia Coins NÃO transferíveis — só gastáveis na STORE
   * (nunca market/RMT). O servidor é autoritativo online. */
  acc.coinsNt = Math.max(0, Math.floor(acc.coinsNt) || 0);
  acc.gold = Math.max(0, Math.floor(acc.gold) || 0);
  if (!acc.lootPouch || typeof acc.lootPouch !== "object") acc.lootPouch = {};
  if (!acc.charms || typeof acc.charms !== "object" || Array.isArray(acc.charms)) acc.charms = {};
  acc.charmPoints = Math.max(0, Math.floor(acc.charmPoints) || 0);
  return acc;
}

function accountSave(acc) {
  try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc)); } catch (e) {}
}

/* Saldo total de Tibia Coins da conta. */
function accountCoins() {
  return accountLoad().coins;
}

/* Saldo de Tibia Coins NÃO transferíveis (só STORE; online vem do
 * servidor em toda resposta com `coinsNt`). */
function accountCoinsNt() {
  return accountLoad().coinsNt;
}
function accountSetCoinsNt(n) {
  const acc = accountLoad();
  acc.coinsNt = Math.max(0, Math.floor(Number(n) || 0));
  accountSave(acc);
  return acc.coinsNt;
}

// Gold também pertence à conta, tal como Tibia Coins.
function accountGold() { return accountLoad().gold; }
function accountSetGold(n) {
  const acc = accountLoad(); acc.gold = Math.max(0, Math.floor(Number(n) || 0)); accountSave(acc); return acc.gold;
}
function accountAddGold(n) { return accountSetGold(accountGold() + Math.max(0, Math.floor(Number(n) || 0))); }
function accountSpendGold(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const have = accountGold(); if (have < n) return false; accountSetGold(have - n); return true;
}
function bindAccountGold(p) {
  if (!p || p._accountGoldBound || typeof Object.defineProperty !== "function") return;
  Object.defineProperty(p, "gold", { enumerable: true, configurable: true,
    get: () => accountGold(), set: (v) => accountSetGold(v) });
  p._accountGoldBound = true;
}

// Loot Pouch também é compartilhado por todos os personagens da conta.
function accountLootPouch() {
  return accountLoad().lootPouch;
}
function accountSetLootPouch(pouch) {
  const acc = accountLoad();
  acc.lootPouch = (pouch && typeof pouch === "object") ? pouch : {};
  accountSave(acc);
  return acc.lootPouch;
}
function bindAccountLootPouch(p) {
  if (!p || p._accountPouchBound || typeof Object.defineProperty !== "function") return;
  Object.defineProperty(p, "lootPouch", { enumerable: true, configurable: true,
    get: () => accountLootPouch(), set: (v) => accountSetLootPouch(v) });
  p._accountPouchBound = true;
}

/* Charms são DA CONTA: desbloqueios (major+minor) e charm points ficam no
 * objeto da conta — só o assign (p.charmRace) continua por personagem. */
function migrateAccountCharms(acc) {
  /* Lê o roster BRUTO (sem normalizePlayer — evita reentrância) e semeia
   * a conta com a UNIÃO dos unlocks + SOMA dos pontos não gastos. */
  acc.charmsMigrated = 1;
  try {
    const roster = (typeof readRoster === "function") ? readRoster() : {};
    for (const id of Object.keys(roster || {})) {
      const raw = roster[id] && roster[id].p;
      if (!raw || typeof raw !== "object") continue;
      if (raw.charms && typeof raw.charms === "object" && !Array.isArray(raw.charms)) {
        for (const cid of Object.keys(raw.charms)) if (raw.charms[cid])
          acc.charms[cid] = Math.max(
            Math.min(3, Math.max(1, Math.floor(Number(acc.charms[cid])) || 1)),
            Math.min(3, Math.max(1, Math.floor(Number(raw.charms[cid])) || 1)));
      }
      acc.charmPoints += Math.max(0, Math.floor(Number(raw.charmPoints) || 0));
    }
  } catch (e) {}
  accountSave(acc);
}
function accountCharms() {
  const acc = accountLoad();
  if (!acc.charmsMigrated) migrateAccountCharms(acc);
  return acc.charms;
}
function accountCharmPoints() {
  const acc = accountLoad();
  if (!acc.charmsMigrated) migrateAccountCharms(acc);
  return acc.charmPoints;
}
function bindAccountCharms(p) {
  if (!p || p._accountCharmsBound || typeof Object.defineProperty !== "function") return;
  Object.defineProperty(p, "charms", { enumerable: true, configurable: true,
    get: () => accountCharms(),
    set: (v) => { const a = accountLoad();
      a.charms = (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; accountSave(a); } });
  Object.defineProperty(p, "charmPoints", { enumerable: true, configurable: true,
    get: () => accountCharmPoints(),
    set: (v) => { const a = accountLoad(); a.charmPoints = Math.max(0, Math.floor(Number(v) || 0)); accountSave(a); } });
  p._accountCharmsBound = true;
}

/* Adiciona coins à conta (só valores positivos; retorna o novo saldo). */
function accountAddCoins(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (!n) return accountCoins();
  const acc = accountLoad();
  acc.coins += n;
  accountSave(acc);
  return acc.coins;
}

/* Define o saldo exato (uso administrativo; retorna o novo saldo). */
function accountSetCoins(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const acc = accountLoad();
  acc.coins = n;
  accountSave(acc);
  return acc.coins;
}

/* Gasta coins da conta (não deixa ficar negativo; retorna o novo saldo). */
function accountSpendCoins(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (!n) return accountCoins();
  const acc = accountLoad();
  acc.coins = Math.max(0, acc.coins - n);
  accountSave(acc);
  return acc.coins;
}

/* Atualiza o número de Tibia Coins na topbar. */
function renderCoinBalance() {
  const n = $("#tibia-coins-n");
  if (n) n.textContent = fmtFull(accountCoins());
}
