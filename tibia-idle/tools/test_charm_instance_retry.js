"use strict";
/* test_charm_instance_retry.js — Modal de Charms em rede lenta.
 *
 * Cenário do report: durante caçada online o version da instância sobe a
 * cada tick (~1/s). O expected_version do clique chega velho → o patch sem
 * retry devolvia INSTANCE_VERSION_CONFLICT → o cliente revertia a opção
 * (buy/upgrade/assign "não respondiam"). O fix replica o retry do equip:
 * servidor re-resolve a row e reenvia com o version fresco (4x); cliente
 * retenta 1x com a instância do 409.
 *
 * Cobre:
 *  - charmInstanceOp com retry (resolve + version fresco a cada tentativa)
 *  - accountSelectInstanceCharm com retry client-side
 *  - JsonStore: stale → conflito; retry com version fresco → aplica
 *
 * Uso: node tools/test_charm_instance_retry.js
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
const clientSource = fs.readFileSync(path.join(__dirname, "..", "game", "js", "account-client.js"), "utf8");

function must(ok, msg) { if (!ok) throw Error(msg); }

// ---------------------------------------------------------------- estrutura
const charmFn = serverSource.slice(serverSource.indexOf("async function charmInstanceOp"),
  serverSource.indexOf("async function clearInstanceLootPouch"));
must(charmFn.length > 200, "charmInstanceOp não encontrado");
must(/for\(let attempt=0;attempt<4;attempt\+\+/.test(charmFn),
  "charmInstanceOp sem loop de retry (buy/upgrade/assign revertiam em INSTANCE_VERSION_CONFLICT)");
must(/resolveInstanceRow\(db,acc,charId\)/.test(charmFn),
  "retry não re-resolve a row a cada tentativa");
must(/instancePatchState\(current\.account_id,acc\.id,instanceId,Number\(current\.version\)/.test(charmFn),
  "retry não reenvia com o version fresco da row");
must(/INSTANCE_VERSION_CONFLICT"\)break/.test(charmFn),
  "retry não para em erro não-conflito");

const charmClient = clientSource.slice(clientSource.indexOf("function accountSelectInstanceCharm"),
  clientSource.indexOf("async function clearInstanceLootPouch").length ? clientSource.length : 0);
const charmCall = clientSource.slice(clientSource.indexOf("function accountSelectInstanceCharm"),
  clientSource.indexOf("function accountSelectInstanceCharm") + 2500);
must(/for\(let attempt=0;attempt<2;attempt\+\+/.test(charmCall),
  "accountSelectInstanceCharm sem retry client-side de INSTANCE_VERSION_CONFLICT");

// ---------------------------------------------------------------- funcional
// JsonStore real: simula o cenário — expected stale conflita; re-resolve e
// repete com row.version (o que o retry faz) aplica a mutação.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gi-charm-retry-"));
process.env.GLOBAL_IDLE_DATA_DIR = tmp;
delete process.env.MYSQL_HOST;
const { getDb } = require("../server/db");

async function main() {
  const store = await getDb();
  store.accounts = [{ id: 5, token: "t" }];
  const descriptor = { v: 1, kind: "hunt", authority: { players: [{ id: "7", accountId: 5,
    p: { charmPoints: 100, charms: {}, charmRace: {} } }] }, state: { events: [] } };
  store.instances = [{ account_id: 5, instance_id: "i".repeat(64), version: 10, status: "active",
    kind: "hunt", state: JSON.stringify(descriptor) }];

  const applyAssign = (ser) => {
    const d = JSON.parse(ser);
    d.authority.players[0].p.charmRace = { "wound-prism": "squid-warden" };
    return JSON.stringify(d);
  };

  // O clique chega com expected velho (um tick bumpou version no caminho).
  const stale = store.instancePatchState(5, 5, "i".repeat(64), 9, applyAssign, null);
  must(!stale.ok && stale.error === "INSTANCE_VERSION_CONFLICT",
    "expected stale não conflitou (contrato do patch mudou)");

  // O retry re-resolve e reenvia com o version fresco → aplica.
  const current = store.instanceGet(5);
  const fresh = store.instancePatchState(5, 5, "i".repeat(64), Number(current.version), applyAssign, null);
  must(fresh.ok && Number(fresh.instance.version) === 11,
    "retry com version fresco não aplicou o assign");
  const saved = JSON.parse(store.instances[0].state);
  must(saved.authority.players[0].p.charmRace["wound-prism"] === "squid-warden",
    "assign do charm não persistiu no descritor");

  // Segunda tentativa de clique repetido (double-fire) também passa a valer —
  // a mutação é quem valida o estado vivo.
  const cur2 = store.instanceGet(5);
  const again = store.instancePatchState(5, 5, "i".repeat(64), Number(cur2.version), applyAssign, null);
  must(again.ok, "re-clique idempotente com version fresco falhou");

  console.log("OK: charmInstanceOp com retry (4x, version fresco), cliente com retry (1x), " +
    "stale→conflito→fresh→aplica verificado no JsonStore.");
}
main().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
