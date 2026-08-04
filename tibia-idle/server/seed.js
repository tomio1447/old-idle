/*
 * seed.js — cria a conta de ADMINISTRADOR (login=1, senha=1).
 *
 * Uso: node seed.js
 * (roda antes/depois do server.js; com MySQL aplica o INSERT idempotente)
 */
"use strict";

const bcrypt = require("bcryptjs");
const { getDb } = require("./db");

async function main() {
  const db = await getDb();

  const login = "1";
  const password = "1";
  const hash = bcrypt.hashSync(password, 10);

  // tenta achar; se existir, atualiza o hash e role; senao cria
  const exist = await db.findAccountByLogin(login);
  if (exist) {
    if (typeof db.run === "function") {
      await db.run("UPDATE accounts SET password_hash = ?, role = 'admin' WHERE id = ?",
        [hash, exist.id]);
    } else {
      exist.password_hash = hash;
      exist.role = "admin";
      db._save();
    }
    console.log("[seed] conta admin atualizada (login=1 senha=1, id=" + exist.id + ")");
  } else {
    await db.createAccount(login, hash, "admin", 1000);
    console.log("[seed] conta admin criada (login=1 senha=1, 1000 Tibia Coins)");
  }

  // com MySQL garante tambem o schema completo do database.sql
  if (typeof db.run === "function") {
    const rows = await db.query("SELECT id, login, role, coins FROM accounts WHERE login = ?", [login]);
    console.log("[seed] admin no banco:", rows[0]);
  } else {
    console.log("[seed] admin no storage JSON:", db.findAccountByLogin(login));
  }

  if (typeof db.end === "function") await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
