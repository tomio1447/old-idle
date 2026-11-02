/* refill_stamina.js — enche a stamina de TODAS as contas (pool + espelhos).
 *
 * A stamina é da CONTA (shared_inventory.stamina {v,at}); os personagens
 * carregam espelhos (data.stamina/staminaAt) e instâncias ativas guardam
 * cópias dentro do state JSON. Este script zera a diferença: pool=15h e
 * todos os espelhos=15h.
 *
 * Uso:
 *   node tools/refill_stamina.js
 *   MYSQL_HOST=.. MYSQL_USER=.. MYSQL_PASS=.. MYSQL_DB=.. node tools/refill_stamina.js
 */
"use strict";
const path = require("path");
const mysql = require(path.join(__dirname, "..", "server", "node_modules", "mysql2", "promise"));

const FULL = 15 * 3600; // 54000s = SHARED_STAMINA_FULL

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASS || "admin",
    database: process.env.MYSQL_DB || "global_idle",
  });
  const now = Date.now();

  const [r1] = await conn.query(
    `UPDATE accounts SET shared_inventory =
       JSON_MERGE_PATCH(COALESCE(shared_inventory,'{}'), ?)`,
    [JSON.stringify({ stamina: { v: FULL, at: now } })]);

  const [r2] = await conn.query(
    `UPDATE characters SET data =
       JSON_SET(data,'$.stamina',?,'$.staminaAt',?)`, [FULL, now]);

  let patchedInstances = 0;
  const [rows] = await conn.query(
    "SELECT account_id,state FROM account_instances WHERE status='active'");
  for (const row of rows) {
    let st = row.state;
    try { st = typeof st === "string" ? JSON.parse(st) : st; } catch (e) { continue; }
    if (!st || typeof st !== "object") continue;
    const auth = st.authority && typeof st.authority === "object" ? st.authority : st;
    if (auth.accountStamina && typeof auth.accountStamina === "object") {
      for (const k of Object.keys(auth.accountStamina))
        auth.accountStamina[k] = { v: FULL, at: now };
    }
    for (const it of (Array.isArray(auth.players) ? auth.players : [])) {
      if (it && it.p) { it.p.stamina = FULL; it.p.staminaAt = now; }
    }
    for (const m of (Array.isArray(st.members) ? st.members : [])) {
      if (m && m.p) { m.p.stamina = FULL; m.p.staminaAt = now; }
    }
    await conn.query("UPDATE account_instances SET state=? WHERE account_id=?",
      [JSON.stringify(st), row.account_id]);
    patchedInstances++;
  }

  console.log(`accounts: ${r1.affectedRows} | characters: ${r2.affectedRows} | instances: ${patchedInstances}`);
  await conn.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
