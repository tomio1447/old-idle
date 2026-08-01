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
    acc = { v: 1, coins: 0 };
  }
  acc.coins = Math.max(0, Math.floor(acc.coins) || 0);
  return acc;
}

function accountSave(acc) {
  try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc)); } catch (e) {}
}

/* Saldo total de Tibia Coins da conta. */
function accountCoins() {
  return accountLoad().coins;
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
