/* seed.js — cria/atualiza as contas do test server: 1/1 e 2/2. */
"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");

async function upsert(db, login, password) {
  const hash = bcrypt.hashSync(password, 10);
  const exist = await db.findAccountByLogin(login);
  if (exist) {
    if (typeof db.run === "function") {
      await db.run("UPDATE accounts SET password_hash = ?, role = 'admin' WHERE id = ?",
        [hash, exist.id]);
    } else {
      exist.password_hash = hash;
      exist.role = "admin";
      exist.coins = Math.max(1000, exist.coins || 0);
      db._save();
    }
    console.log(`[seed] conta ${login}/${password} atualizada como admin (id=${exist.id})`);
    return exist;
  }
  const created = await db.createAccount(login, hash, "admin", 1000);
  console.log(`[seed] conta ${login}/${password} criada como admin (id=${created.id})`);
  return created;
}

async function main() {
  const db = await getDb();
  await upsert(db, "1", "1");
  await upsert(db, "2", "2");
  if (typeof db.end === "function") await db.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
