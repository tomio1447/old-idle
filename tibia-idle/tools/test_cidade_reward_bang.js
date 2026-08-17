/* Smoke: notificação "!" de Reward Chest no botão/modal CIDADE. */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
function must(ok, msg) { if (!ok) throw Error(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const city = read("game/js/city-ui.js");
const reward = read("game/js/reward-chest.js");
const game = read("game/js/game.js");
const css = read("game/css/layout.css");
const html = read("game/index.html");

must(city.includes("function renderCidadeRewardNotify"), "renderCidadeRewardNotify ausente");
must(city.includes("function cidadeRewardPendingCount"), "cidadeRewardPendingCount ausente");
must(city.includes("cidade-reward-bang"), "badge DOM ausente em city-ui");
must(city.includes('data-cidade-action="reward"') || city.includes("data-cidade-action=\"${entry.action}\""),
  "card reward do modal CIDADE não referencia action");
must(city.includes("cidadeRewardBangHtml(pending"), "catalogo CIDADE não injeta bang no Reward");
must(reward.includes("renderCidadeRewardNotify"), "reward-chest não dispara notify após claim/add");
must(game.includes("renderRewardButton(p)"), "renderAll não atualiza o bang");
must(css.includes(".cidade-reward-bang"), "CSS do bang ausente");
must(html.includes("cidade-reward-bang-v1"), "cache-bust cidade-reward-bang-v1 ausente no index");

// Simula contagem via rewardChestBundleList (mesma regra do cliente).
const vm = require("vm");
const sandbox = {
  console,
  GAMEDATA: { items: {} },
  document: { getElementById() { return null; } },
};
vm.createContext(sandbox);
vm.runInContext(reward + "\nthis.rewardChestBundleList=rewardChestBundleList;" +
  "\nthis.rewardChestAdd=rewardChestAdd;" +
  "\nthis.rewardChestClaimAll=rewardChestClaimAll;", sandbox);

const p = { rewardChest: {}, rewardChestBundles: [] };
must(sandbox.rewardChestBundleList(p).length === 0, "vazio deveria ser 0");
sandbox.rewardChestAdd(p, "gold-coin", 1, { bundleId: "b1", bossId: "x", name: "Boss A" });
sandbox.rewardChestAdd(p, "platinum-coin", 2, { bundleId: "b2", bossId: "y", name: "Boss B" });
must(sandbox.rewardChestBundleList(p).length === 2, "dois pacotes pendentes");
sandbox.rewardChestClaimAll(p);
must(sandbox.rewardChestBundleList(p).length === 0, "após claim all deve zerar");

console.log("OK: cidade reward bang wired + pending count clear after claim.");
