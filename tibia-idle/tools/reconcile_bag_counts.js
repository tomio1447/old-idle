/* reconcile_bag_counts.js — cura divergência bag[slug] × itemInstances.
 *
 * O invariante: para slugs instanciados, bag[slug] = nº de instâncias
 * loc:"bag". Um bug em moveBagToPouchAuth removia a instância sem baixar
 * o count → contagens-fantasma invisíveis no inventário (item "sumido").
 * Este script roda o mesmo authSyncBagCountsFromInstances da autoridade
 * sobre o shared_inventory de cada conta.
 *
 * Uso:
 *   MYSQL_HOST=.. MYSQL_USER=.. MYSQL_PASS=.. MYSQL_DB=.. node tools/reconcile_bag_counts.js
 */
"use strict";
const path = require("path");
const mysql = require(path.join(__dirname, "..", "server", "node_modules", "mysql2", "promise"));
const engine = require(path.join(__dirname, "..", "server", "authoritative_engine.js"));

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASS || "admin",
    database: process.env.MYSQL_DB || "global_idle",
  });

  const [rows] = await conn.query("SELECT id, shared_inventory FROM accounts");
  let fixed = 0, checked = 0;
  for (const row of rows) {
    let shared = row.shared_inventory;
    try { shared = typeof shared === "string" ? JSON.parse(shared) : shared; } catch (e) { continue; }
    if (!shared || typeof shared !== "object") continue;
    checked++;
    const fakeP = { bag: shared.bag || {}, itemInstances: Array.isArray(shared.itemInstances) ? shared.itemInstances : [] };
    const beforeBag = JSON.stringify(fakeP.bag);
    const beforeInsts = JSON.stringify(fakeP.itemInstances);
    engine.authSyncBagCountsFromInstances(fakeP);
    if (JSON.stringify(fakeP.bag) === beforeBag && JSON.stringify(fakeP.itemInstances) === beforeInsts) continue;
    shared.bag = fakeP.bag;
    shared.itemInstances = fakeP.itemInstances;
    await conn.query("UPDATE accounts SET shared_inventory=? WHERE id=?", [JSON.stringify(shared), row.id]);
    console.log(`acc ${row.id}: bag ${beforeBag} -> ${JSON.stringify(fakeP.bag)}`);
    fixed++;
  }
  console.log(`OK: ${checked} contas verificadas, ${fixed} corrigidas`);
  await conn.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
