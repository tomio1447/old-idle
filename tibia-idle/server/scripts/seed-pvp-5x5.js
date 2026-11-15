/* seed-pvp-5x5.js — prepara o teste PvP guild-vs-guild 5x5 (test server).
 *
 * Uso:  node scripts/seed-pvp-5x5.js
 *
 *   - Conta 1/1 vira líder da guild "Guardioes Reais"; conta 2/2 vira líder
 *     da guild rival "Legiao Vermelha". Ambas ficam nível 2 com caixa para
 *     apostas (gold + Tibia Coins).
 *   - Cria 6 contas clone por guild (login = senha): pvpa1..pvpa6 e
 *     pvpb1..pvpb6. Cada clone copia personagens (equipamentos, presets,
 *     skills, configs), inventário compartilhado, cosméticos e party da conta 1.
 *   - Idempotente: rodar de novo re-copia os dados da conta 1 nos clones.
 */
"use strict";
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const bcrypt = require("bcryptjs");
const { getDb } = require("../db");

const SOURCE_ACCOUNT = 1;
const GUILD_A = { name: "Guardioes Reais", leaderLogin: "1", prefix: "pvpa" };
const GUILD_B = { name: "Legiao Vermelha", leaderLogin: "2", prefix: "pvpb" };
const CLONES_PER_GUILD = 6;
const GUILD_EXP = 10; // nível 2
const GUILD_BALANCE = 35000000;
const GUILD_COINS = 300;

const SYL1 = ["Ar", "Bel", "Cor", "Dra", "El", "Fen", "Gor", "Hal", "Ith", "Kor", "Lun", "Mor", "Nar", "Ost", "Pyr", "Ral", "Syl", "Tor", "Ul", "Vex", "Wyn", "Zar"];
const SYL2 = ["dan", "rik", "thas", "mir", "gon", "wen", "lor", "vus", "ric", "dor", "nis", "ra", "rim", "zen", "mak", "tos"];
const VOC_TAG = { knight: "Knight", paladin: "Paladin", druid: "Druid", sorcerer: "Sorcerer", monk: "Monk" };

function randomName(taken) {
  for (;;) {
    const n = SYL1[Math.floor(Math.random() * SYL1.length)] + SYL2[Math.floor(Math.random() * SYL2.length)];
    if (!taken.has(n.toLowerCase())) { taken.add(n.toLowerCase()); return n; }
  }
}

async function main() {
  const db = await getDb();
  if (typeof db.query !== "function") throw new Error("Requer MySQL (MYSQL_HOST no .env).");
  const q = (s, p) => db.query(s, p);

  const src = (await q("SELECT * FROM accounts WHERE id=?", [SOURCE_ACCOUNT]))[0];
  if (!src) throw new Error("Conta fonte não encontrada");
  const order = JSON.parse(src.party_order || "[]").map(Number);
  const srcChars = await q("SELECT * FROM characters WHERE account_id=?", [SOURCE_ACCOUNT]);
  srcChars.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  const taken = new Set((await q("SELECT LOWER(name) n FROM characters")).map((r) => r.n));

  async function ensureGuild(name) {
    let g = (await q("SELECT * FROM guilds WHERE name=?", [name]))[0];
    if (!g) {
      const r = await db.run("INSERT INTO guilds (name, level, exp, bonuses, temp_bonuses, icon) VALUES (?, 2, ?, '{}', '{}', 2)", [name, GUILD_EXP]);
      g = { id: r.insertId };
    }
    await db.run("UPDATE guilds SET level=GREATEST(level,2), exp=GREATEST(exp,?), balance=GREATEST(balance,?), coins=GREATEST(coins,?) WHERE id=?",
      [GUILD_EXP, GUILD_BALANCE, GUILD_COINS, g.id]);
    return (await q("SELECT * FROM guilds WHERE id=?", [g.id]))[0];
  }

  async function setMember(guildId, accountId, rank) {
    const chars = await q("SELECT id FROM characters WHERE account_id=? ORDER BY id", [accountId]);
    const po = (await q("SELECT party_order FROM accounts WHERE id=?", [accountId]))[0];
    const first = (JSON.parse((po && po.party_order) || "[]")[0]) || chars[0].id;
    const cur = (await q("SELECT guild_id FROM guild_members WHERE account_id=?", [accountId]))[0];
    if (cur && Number(cur.guild_id) === Number(guildId))
      return db.run("UPDATE guild_members SET `rank`=? WHERE account_id=?", [rank, accountId]);
    await db.run("DELETE FROM guild_members WHERE account_id=?", [accountId]);
    await db.run("INSERT INTO guild_members (guild_id, account_id, character_id, `rank`) VALUES (?, ?, ?, ?)",
      [guildId, accountId, first, rank]);
  }

  async function cloneAccount(login) {
    let acc = (await q("SELECT id FROM accounts WHERE login=?", [login]))[0];
    const hash = bcrypt.hashSync(login, 10);
    if (!acc) {
      const r = await db.run("INSERT INTO accounts (login, password_hash, role) VALUES (?, ?, 'user')", [login, hash]);
      acc = { id: r.insertId };
    }
    const accId = acc.id;
    await db.run(`UPDATE accounts SET password_hash=?, coins=?, market_gold=?, gold=?, gold_migrated=1, vip_until=?,
      missions=?, missions_done=?, email_verified=1, shared_inventory=?, cosmetics=? WHERE id=?`,
      [hash, src.coins, src.market_gold, src.gold, src.vip_until, src.missions, src.missions_done,
       src.shared_inventory, src.cosmetics, accId]);

    const existing = await q("SELECT id, name FROM characters WHERE account_id=? ORDER BY id", [accId]);
    const ids = [];
    for (let i = 0; i < srcChars.length; i++) {
      const sc = srcChars[i];
      const prev = existing[i];
      const name = prev ? prev.name : `${randomName(taken)} ${VOC_TAG[sc.voc] || "Hero"}`.slice(0, 32);
      let id = prev && prev.id;
      if (!id) {
        const r = await db.run("INSERT INTO characters (account_id, name, voc, level, data) VALUES (?, ?, ?, ?, '{}')",
          [accId, name, sc.voc, sc.level]);
        id = r.insertId;
      }
      const d = JSON.parse(sc.data);
      Object.assign(d, { name, id: String(id), accountId: accId, hunt: null,
        party: { members: [], shareExp: false, session: null }, _partyOnline: null, _partyInvites: 0,
        trainingActive: false, lastSeen: Date.now() });
      delete d._lastHitBy;
      await db.run(`UPDATE characters SET name=?, voc=?, level=?, data=?, save_version=save_version+1, zone='city',
        hp=?, mp=?, max_hp=?, max_mp=? WHERE id=?`,
        [name, sc.voc, sc.level, JSON.stringify(d), sc.max_hp, sc.max_mp, sc.max_hp, sc.max_mp, id]);
      ids.push(id);
    }
    const tutorial = Object.assign(JSON.parse(src.tutorial || "{}"), {
      charIds: ids.map(String), helperDone: Object.fromEntries(ids.map((x) => [x, true])) });
    await db.run("UPDATE accounts SET party_order=?, tutorial=? WHERE id=?", [JSON.stringify(ids), JSON.stringify(tutorial), accId]);

    // Party da conta: líder = 1º char, demais em ordem.
    const leader = (await q("SELECT name FROM characters WHERE id=?", [ids[0]]))[0];
    let party = (await q("SELECT id FROM parties WHERE owner_account_id=?", [accId]))[0];
    if (!party) {
      const r = await db.run("INSERT INTO parties (owner_account_id, leader_id, leader_name, leader_zone) VALUES (?, ?, ?, 'city')",
        [accId, ids[0], leader.name]);
      party = { id: r.insertId };
    } else {
      await db.run("UPDATE parties SET leader_id=?, leader_name=?, leader_zone='city', roster_version=roster_version+1 WHERE id=?",
        [ids[0], leader.name, party.id]);
    }
    await db.run("DELETE FROM party_members WHERE party_id=?", [party.id]);
    for (let i = 1; i < ids.length; i++)
      await db.run("INSERT INTO party_members (party_id, character_id, position) VALUES (?, ?, ?)", [party.id, ids[i], i]);
    return { accId, login, chars: (await q("SELECT name, voc, level FROM characters WHERE account_id=? ORDER BY id", [accId])) };
  }

  const out = [];
  for (const spec of [GUILD_A, GUILD_B]) {
    const guild = await ensureGuild(spec.name);
    const leaderAcc = (await q("SELECT id FROM accounts WHERE login=?", [spec.leaderLogin]))[0];
    await setMember(guild.id, leaderAcc.id, "leader");
    const clones = [];
    for (let i = 1; i <= CLONES_PER_GUILD; i++) {
      const c = await cloneAccount(spec.prefix + i);
      await setMember(guild.id, c.accId, "member");
      clones.push(c);
    }
    const members = await db.guildMembers(guild.id);
    const g = (await q("SELECT * FROM guilds WHERE id=?", [guild.id]))[0];
    out.push({ guild: g.name, id: g.id, level: g.level, exp: g.exp, balance: g.balance, coins: g.coins,
      members: members.map((m) => `${m.name} (${m.rank}, acc ${m.account_id})`), clones });
  }
  console.log(JSON.stringify(out, null, 2));
  if (typeof db.end === "function") await db.end();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
