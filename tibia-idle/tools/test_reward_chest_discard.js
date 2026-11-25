/* Reward Chest — descarte de pacote "NOTHING" (boss sem drop).
 *
 * Bug: APAGAR removia o bundle só localmente; como rewardChestBundles é
 * server-owned (shared inventory), o próximo sync o ressuscitava.
 * Fix: discard autoritativo via /api/reward/claim (flag `discard`) aplicado
 * no shared VIVO por chestRemovalDiff/chestRemovalApply.
 */
"use strict";
const fs = require("fs"), path = require("path");
const engine = require("../server/authoritative_engine");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
const rewardJs = fs.readFileSync(path.join(__dirname, "..", "game", "js", "reward-chest.js"), "utf8");
const accountJs = fs.readFileSync(path.join(__dirname, "..", "game", "js", "account-client.js"), "utf8");
function must(ok, msg) { if (!ok) throw Error(msg); }

/* --- engine: discard autoritativo ---------------------------------------- */
must(typeof engine.rewardChestDiscardBundle === "function",
  "rewardChestDiscardBundle não exportada pelo engine");

const p = engine.rewardChestEnsure({ rewardChest: {}, rewardChestBundles: [
  { id: "boss-empty", name: "Tanjis", items: {} },
  { id: "boss-loot", name: "Jaul", items: { "gold-coin": 5 } },
] });

must(engine.rewardChestDiscardBundle(p, "boss-empty") === 1,
  "discard de pacote vazio não retornou 1");
must(p.rewardChestBundles.length === 1 && p.rewardChestBundles[0].id === "boss-loot",
  "pacote vazio não foi removido do array");
must(engine.rewardChestDiscardBundle(p, "boss-empty") === 0,
  "discard de pacote inexistente não retornou 0");
must(engine.rewardChestDiscardBundle(p, "boss-loot") === 0,
  "discard NÃO pode remover pacote com itens (loot seria destruído)");
must(p.rewardChestBundles.length === 1 && p.rewardChestBundles[0].items["gold-coin"] === 5,
  "pacote com loot foi tocado pelo discard");
must(engine.rewardChestDiscardBundle(p, null) === 0 &&
  engine.rewardChestDiscardBundle(null, "x") === 0, "discard sem args deve ser no-op");

/* Bundle com contagem zerada/suja também é descartável (resíduo de claim). */
const p2 = engine.rewardChestEnsure({ rewardChest: {}, rewardChestBundles: [
  { id: "stale", name: "X", items: { "gold-coin": 0 } },
] });
must(engine.rewardChestDiscardBundle(p2, "stale") === 1 && p2.rewardChestBundles.length === 0,
  "pacote com itens zerados deve ser descartável");

/* --- servidor: dispatch /api/reward/claim -------------------------------- */
must(/body&&body\.discard&&bundleId/.test(serverSource),
  "applyRewardChestClaim não trata body.discard");
must(serverSource.includes("rewardChestDiscardBundle(p,bundleId)"),
  "servidor não chama rewardChestDiscardBundle no discard");

/* --- cliente: delete online via API -------------------------------------- */
const deleteIdx = rewardJs.indexOf("function rewardChestDeleteBundle");
const deleteBody = rewardJs.slice(deleteIdx, deleteIdx + 1400);
must(deleteBody.includes("rewardChestIsOnline()") && deleteBody.includes("discard: true"),
  "rewardChestDeleteBundle não vai pela API online (bug: delete local ressuscita)");
must(/bundleId:opts\.bundleId\|\|null,slug:opts\.slug\|\|null,all:!!opts\.all,discard:!!opts\.discard/
  .test(accountJs), "accountClaimRewardChest não envia o flag discard");
must(rewardJs.includes("danger\" : 'danger'") || rewardJs.includes("'danger'"),
  "botão APAGAR não usa o estilo danger");
must(rewardJs.includes("reward-boss-card--empty") && rewardJs.includes("reward-boss-trash"),
  "card vazio não ganhou a marcação visual de descarte");

console.log("test_reward_chest_discard: OK");
