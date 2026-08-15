#!/usr/bin/env node
/* Migra server/data/*.json → MySQL (preserva IDs). Uso:
 *   cd tibia-idle/server
 *   node ../tools/migrate_json_to_mysql.js
 * Requer MYSQL_HOST no .env (ou no ambiente). */
"use strict";

const fs = require("fs");
const path = require("path");

const serverDir = path.join(__dirname, "..", "server");
require("dotenv").config({ path: path.join(serverDir, ".env") });

if (!process.env.MYSQL_HOST) {
  console.error("[migrate] MYSQL_HOST vazio — abortando (não misturar com JSON).");
  process.exit(1);
}

const { getDb } = require(path.join(serverDir, "db"));

function loadJson(name, fallback) {
  const file = path.join(serverDir, "data", name);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function toMysqlDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 23).replace("T", " ");
}

async function main() {
  const db = await getDb();
  if (typeof db.run !== "function") {
    console.error("[migrate] getDb() não retornou MysqlStore. Confira MYSQL_HOST.");
    process.exit(1);
  }

  const accounts = loadJson("accounts.json", []);
  const characters = loadJson("characters.json", []);
  const partyData = loadJson("parties.json", { parties: [], invites: [] });
  const instances = loadJson("instances.json", []);
  const market = loadJson("market.json", { offers: [], marketStats: {}, marketHistoryArr: [] });

  console.log("[migrate] accounts=%d characters=%d parties=%d instances=%d",
    accounts.length, characters.length,
    (partyData.parties || []).length, (instances || []).length);

  for (const a of accounts) {
    const id = Number(a.id);
    const existing = await db.findAccountByLogin(a.login);
    const missionsJson = JSON.stringify(a.missions && typeof a.missions === "object" ? a.missions : {});
    const missionsDoneJson = JSON.stringify(
      a.missionsDone && typeof a.missionsDone === "object" ? a.missionsDone : {});
    if (existing) {
      await db.run(
        `UPDATE accounts SET password_hash=?, role=?, coins=?, gold=?, gold_migrated=?,
           vip_until=?, market_gold=?, missions=?, missions_done=? WHERE id=?`,
        [
          a.password_hash, a.role || "user", Number(a.coins) || 0,
          Math.max(0, Math.floor(Number(a.gold) || 0)),
          a.gold_migrated ? 1 : 0,
          Math.max(0, Math.floor(Number(a.vip_until) || 0)),
          Math.max(0, Math.floor(Number(a.market_gold) || 0)),
          missionsJson, missionsDoneJson,
          Number(existing.id),
        ]);
      if (Number(existing.id) !== id) {
        console.warn("[migrate] conta login=%s MySQL id=%s != JSON id=%s (mantido MySQL)",
          a.login, existing.id, id);
      } else {
        console.log("[migrate] account upsert id=%s login=%s", id, a.login);
      }
    } else {
      await db.run(
        `INSERT INTO accounts (id, login, password_hash, role, coins, gold, gold_migrated, vip_until, market_gold, missions, missions_done)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, a.login, a.password_hash, a.role || "user", Number(a.coins) || 0,
          Math.max(0, Math.floor(Number(a.gold) || 0)),
          a.gold_migrated ? 1 : 0,
          Math.max(0, Math.floor(Number(a.vip_until) || 0)),
          Math.max(0, Math.floor(Number(a.market_gold) || 0)),
          missionsJson, missionsDoneJson,
        ]);
      console.log("[migrate] account insert id=%s login=%s", id, a.login);
    }
  }

  // Mapa login→id real no MySQL (caso ids divergissem)
  const accountIdByLogin = new Map();
  for (const a of accounts) {
    const row = await db.findAccountByLogin(a.login);
    if (row) accountIdByLogin.set(a.login, Number(row.id));
  }
  const jsonIdToMysql = new Map();
  for (const a of accounts) {
    jsonIdToMysql.set(Number(a.id), accountIdByLogin.get(a.login));
  }

  for (const c of characters) {
    const jsonAcc = Number(c.account_id);
    const accountId = jsonIdToMysql.get(jsonAcc) || jsonAcc;
    const data = typeof c.data === "string" ? c.data : JSON.stringify(c.data || {});
    const existing = await db.findCharacter(c.id);
    const fields = [
      accountId, c.name, c.voc || "none", Number(c.level) || 1, data,
      Math.max(1, Number(c.save_version) || 1),
      c.zone || "unknown",
      Number(c.hp) || 0, Number(c.mp) || 0,
      Number(c.max_hp) || 0, Number(c.max_mp) || 0,
    ];
    if (existing) {
      await db.run(
        `UPDATE characters SET account_id=?, name=?, voc=?, level=?, data=?, save_version=?,
           zone=?, hp=?, mp=?, max_hp=?, max_mp=? WHERE id=?`,
        fields.concat([Number(c.id)]));
      console.log("[migrate] character update id=%s name=%s", c.id, c.name);
    } else {
      await db.run(
        `INSERT INTO characters
           (id, account_id, name, voc, level, data, save_version, zone, hp, mp, max_hp, max_mp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [Number(c.id)].concat(fields));
      console.log("[migrate] character insert id=%s name=%s", c.id, c.name);
    }
  }

  // Parties: limpa e reimporta (IDs estáveis do JSON)
  await db.run("DELETE FROM party_invites");
  await db.run("DELETE FROM party_members");
  await db.run("DELETE FROM parties");
  for (const p of partyData.parties || []) {
    const owner = jsonIdToMysql.get(Number(p.owner_account_id)) || Number(p.owner_account_id);
    await db.run(
      `INSERT INTO parties
         (id, owner_account_id, roster_version, leader_id, leader_name, leader_zone,
          leader_hunt, leader_instance, leader_otbm, leader_boss)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(p.id), owner, Number(p.roster_version) || 1, Number(p.leader_id),
        p.leader_name, p.leader_zone || "unknown",
        p.leader_hunt || null, p.leader_instance || null,
        p.leader_otbm || null, p.leader_boss || null,
      ]);
    for (const m of p.members || []) {
      await db.run(
        `INSERT INTO party_members
           (party_id, character_id, position, follow_nonce, follow_hunt, follow_instance,
            follow_otbm, follow_boss, follow_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(p.id), Number(m.character_id), Number(m.position) || 1,
          m.follow_nonce || null, m.follow_hunt || null, m.follow_instance || null,
          m.follow_otbm || null, m.follow_boss || null, toMysqlDate(m.follow_at),
        ]);
    }
    console.log("[migrate] party id=%s members=%d", p.id, (p.members || []).length);
  }
  // uq_invite_pending = (invitee_id, status): só um 'accepted'/'pending' por
  // personagem. Histórico duplicado do JSON é ignorado; só pending importa.
  let inviteSkipped = 0;
  for (const inv of partyData.invites || []) {
    if (String(inv.status || "") !== "pending") { inviteSkipped++; continue; }
    try {
      await db.run(
        `INSERT INTO party_invites
           (id, party_id, leader_id, invitee_id, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          Number(inv.id), Number(inv.party_id), Number(inv.leader_id),
          Number(inv.invitee_id), "pending",
          toMysqlDate(inv.expires_at),
        ]);
    } catch (e) {
      inviteSkipped++;
      console.warn("[migrate] invite skip id=%s: %s", inv.id, e.message);
    }
  }
  if (inviteSkipped) console.log("[migrate] invites históricos ignorados=%d", inviteSkipped);

  // Instâncias ativas (lease expirado não importa)
  for (const inst of instances || []) {
    const accountId = jsonIdToMysql.get(Number(inst.account_id)) || Number(inst.account_id);
    const state = typeof inst.state === "string" ? inst.state : JSON.stringify(inst.state || {});
    const savedAt = toMysqlDate(inst.saved_at) || toMysqlDate(new Date().toISOString());
    const startedAt = toMysqlDate(inst.started_at || inst.startedAt) || savedAt;
    await db.run("DELETE FROM account_instances WHERE account_id=?", [accountId]);
    await db.run(
      `INSERT INTO account_instances
         (account_id, instance_id, version, status, kind, hunt_id, boss_id, instance_mode,
          party_id, party_version, active_character_id, state, saved_at, started_at,
          worker_cursor_at, worker_total_ms, ended_at, terminal_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId, String(inst.instance_id), Number(inst.version) || 1,
        inst.status || "active", inst.kind || "hunt",
        inst.hunt_id || null, inst.boss_id || null,
        inst.instance_mode || "non-pvp",
        inst.party_id != null ? Number(inst.party_id) : null,
        inst.party_version != null ? Number(inst.party_version) : null,
        Number(inst.active_character_id) || 0, state, savedAt, startedAt,
        toMysqlDate(inst.worker_cursor_at) || savedAt,
        Number(inst.worker_total_ms) || 0,
        toMysqlDate(inst.ended_at), inst.terminal_reason || null,
      ]);
    console.log("[migrate] instance account=%s status=%s", accountId, inst.status || "active");
  }

  // Market (opcional)
  await db.run("DELETE FROM market_offers");
  await db.run("DELETE FROM market_history");
  await db.run("DELETE FROM market_stats");
  for (const o of market.offers || []) {
    await db.run(
      `INSERT INTO market_offers
         (id, seller_id, seller_name, kind, slug, tier, data, qty, price, price_tc, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(o.id), Number(o.seller_id), o.seller_name || "",
        o.kind || "item", o.slug || null, Number(o.tier) || 0,
        o.data != null ? (typeof o.data === "string" ? o.data : JSON.stringify(o.data)) : null,
        Number(o.qty) || 1, Number(o.price) || 0, o.price_tc ? 1 : 0,
        o.status || "active",
      ]);
  }

  // Ajusta AUTO_INCREMENT
  const maxAcc = accounts.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0);
  const maxChar = characters.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
  if (maxAcc) await db.run("ALTER TABLE accounts AUTO_INCREMENT = ?", [maxAcc + 1]);
  if (maxChar) await db.run("ALTER TABLE characters AUTO_INCREMENT = ?", [maxChar + 1]);

  console.log("[migrate] OK — JSON → MySQL concluído (inclui missions/missionsDone por conta)");
  if (typeof db.end === "function") await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
