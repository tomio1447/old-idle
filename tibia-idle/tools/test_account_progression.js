/* test_account_progression.js — level/exp da CONTA, display_name, ranking por
 * jogador e bless só no wipe da PT. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const ROOT = path.join(__dirname, "..");
const serverFile = (f) => fs.readFileSync(path.join(ROOT, "server", f), "utf8");
const gameFile = (f) => fs.readFileSync(path.join(ROOT, "game", f), "utf8");
let pass = 0;
function ok(name, fn) { fn(); pass++; console.log("  ok", name); }

// JsonStore real via getDb() com DATA_DIR em temp (sem MySQL, sem disco real).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gi-acc-"));
process.env.GLOBAL_IDLE_DATA_DIR = tmp;
delete process.env.MYSQL_HOST;
const { getDb } = require(path.join(ROOT, "server", "db.js"));

async function main() {
  const s = await getDb();

  ok("createAccount grava display_name e findAccountByDisplayName acha", () => {
    const acc = s.createAccount("acc1", "h", "user", 0, "a@b.c", "Zamba Tester");
    assert.strictEqual(acc.display_name, "Zamba Tester");
    assert.strictEqual(acc.level, 1);
    assert(s.findAccountByDisplayName("zamba tester"), "lookup case-insensitive falhou");
    assert(!s.findAccountByDisplayName("outro"), "falso positivo");
  });

  ok("save de char propaga level/exp para a conta (só avança)", () => {
    const acc = s.createAccount("acc2", "h", "user", 0, "", "Player Dois");
    s.characters = [{ id: 1, account_id: acc.id, name: "Char A", voc: "knight",
      level: 1, data: JSON.stringify({ level: 1, exp: 0 }), save_version: 1 }];
    const r = s.saveCharactersVersioned(acc.id, [{ id: 1, expectedVersion: 1, voc: "knight",
      level: 80, data: JSON.stringify({ level: 80, exp: 12345 }) }], null);
    assert(r.ok, JSON.stringify(r));
    const acc2 = s.findAccountById(acc.id);
    assert.strictEqual(acc2.level, 80);
    assert.strictEqual(acc2.exp, 12345);
    s.characters.push({ id: 2, account_id: acc.id, name: "Char B", voc: "mage",
      level: 80, data: "{}", save_version: 1 });
    const r2 = s.saveCharactersVersioned(acc.id, [{ id: 2, expectedVersion: 1, voc: "mage",
      level: 30, data: JSON.stringify({ level: 30, exp: 5 }) }], null);
    assert(r2.ok);
    assert.strictEqual(s.findAccountById(acc.id).level, 80, "conta regrediu!");
  });

  ok("findCharacter/charactersOf injetam level/exp da conta em TODOS os chars", () => {
    const acc = s.findAccountByDisplayName("player dois");
    const a = s.findCharacter(1), b = s.findCharacter(2);
    assert.strictEqual(a.level, 80); assert.strictEqual(b.level, 80);
    assert.strictEqual(JSON.parse(a.data).exp, 12345);
    s.charactersOf(acc.id).forEach((c) => assert.strictEqual(c.level, 80));
  });

  ok("backfill preenche display_name e level do maior char", () => {
    const s2 = new (Object.getPrototypeOf(s).constructor)();
    s2.accounts = [{ id: 9, login: "oldlogin" }];
    s2.characters = [
      { id: 1, account_id: 9, name: "A", level: 40, data: JSON.stringify({ exp: 77 }) },
      { id: 2, account_id: 9, name: "B", level: 120, data: JSON.stringify({ exp: 500 }) },
    ];
    s2._backfillAccountProgress();
    const a = s2.accounts[0];
    assert.strictEqual(a.display_name, "oldlogin");
    assert.strictEqual(a.level, 120);
    assert.strictEqual(a.exp, 500);
  });

  ok("rankings: 1 linha por conta, nome = display_name, chars embutidos", () => {
    const acc = s.findAccountByDisplayName("player dois");
    const rows = s.rankings("level", 50).filter((r) => Number(r.accountId) === Number(acc.id));
    assert.strictEqual(rows.length, 1, "mais de uma linha pra mesma conta");
    assert.strictEqual(rows[0].name, "Player Dois");
    assert.strictEqual(rows[0].level, 80);
    assert.strictEqual(rows[0].chars.length, 2);
  });

  ok("register exige display_name válido e único (server.js)", () => {
    const sv = serverFile("server.js");
    assert(/BAD_DISPLAY_NAME/.test(sv), "sem validação de nome");
    assert(/NAME_TAKEN/.test(sv), "sem checagem de unicidade");
    assert(/DISPLAY_NAME_RE/.test(sv), "regex de nome ausente");
    assert(/displayName:\s*acc\.display_name/.test(sv), "resposta sem displayName");
    assert(/createAccount\(login, hash, "user", 0, email, displayName\)/.test(sv));
  });

  ok("chat usa display_name da conta como nickname", () => {
    assert(/nickname:String\(acc\.display_name/.test(serverFile("server.js")));
    assert(/displayName:String\(acc\.display_name/.test(serverFile("server.js")),
      "accountPublicView sem displayName");
  });

  ok("ranking por conta no MySQL (display_name + chars por jogador)", () => {
    const d = serverFile("db.js");
    assert(/COALESCE\(a\.display_name, a\.login\)/.test(d), "MySQL ranking sem display_name");
    assert(/persistVersionedRows[\s\S]*UPDATE accounts SET level/.test(d),
      "save MySQL não grava level na conta");
    assert(/ADD COLUMN display_name/.test(d), "migração sem display_name");
    assert(/uq_accounts_display_name/.test(d), "sem unique key");
  });

  ok("bless: morte individual não consome; fullWipe consome de todos", () => {
    const e = serverFile("authoritative_engine.js");
    const i = e.indexOf("function authMarkPlayerDeath");
    const death = e.slice(i, i + 4000);
    assert(!/item\.p\.blessed=false/.test(death.split("stillAlive")[0]),
      "morte individual ainda limpa blessed");
    const w = e.indexOf("function fullWipe");
    assert(/item\.p\.blessed=false/.test(e.slice(w, w + 600)),
      "fullWipe não consome o flag");
  });

  ok("cliente: campo nome no registro e envio do displayName", () => {
    const g = gameFile("js/game.js");
    assert(/id="acc-new-name"/.test(g), "input ausente");
    assert(/accountRegister\(login, pass, email, displayName\)/.test(g));
    assert(/displayName: displayName/.test(gameFile("js/account-client.js")));
  });

  ok("ranking UI: linha de jogador clicável lista personagens", () => {
    const c = gameFile("js/city-ui.js");
    assert(/data-ranking-acc/.test(c));
    assert(/ranking-char-row/.test(c));
    assert(/Ranking de jogadores/.test(c));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`OK: progresso por conta, display_name, ranking e bless (${pass} checks).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
