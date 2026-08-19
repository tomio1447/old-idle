"use strict";
/**
 * Static checks for the party invite UNIQUE fix:
 *   - uq_invite_pending must only cover pending invites (generated column)
 *   - accept must be idempotent when already in the party
 *   - inbox must drop stale invites for current members
 *   - client must map Duplicate entry to a friendly message
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log("ok:", msg);
}

const db = read("server/db.js");
const sql = read("server/database.sql");
const party = read("server/party.js");
const ui = read("game/js/party-ui.js");
const client = read("game/js/account-client.js");
const html = read("game/index.html");

must(
  !/UNIQUE KEY uq_invite_pending \(invitee_id, status\)/.test(db) &&
    /UNIQUE KEY uq_invite_pending \(pending_invitee_id\)/.test(db) &&
    /IF\(status = 'pending', invitee_id, NULL\)/.test(db),
  "db.js pending-only unique via pending_invitee_id"
);
must(
  /DROP INDEX uq_invite_pending/.test(db) &&
    /INFORMATION_SCHEMA\.STATISTICS/.test(db),
  "db.js migrates old (invitee_id, status) unique"
);
must(
  /UNIQUE KEY uq_invite_pending \(pending_invitee_id\)/.test(sql) &&
    /pending_invitee_id INT UNSIGNED/.test(sql),
  "database.sql matches pending-only unique"
);
must(
  /já está na party de/.test(party) &&
    /isInviteUniqueConflict/.test(party) &&
    /Convite stale/.test(party),
  "party.js idempotent accept + stale inbox cleanup"
);
must(
  /partyFilterStaleInbox/.test(ui) &&
    /el\.disabled = true/.test(ui) &&
    /já foi processado/.test(ui),
  "party-ui filters stale inbox and debounces accept"
);
must(
  /partyInviteClientMsg/.test(client) &&
    /Este convite já foi processado/.test(client),
  "account-client maps Duplicate entry to friendly msg"
);
must(
  html.includes("js/party.js?v=party-invite-uq-v1") &&
    html.includes("js/party-ui.js?v=party-invite-uq-v1") &&
    (html.includes("js/account-client.js?v=")),
  "index.html cache-bust for party invite fix"
);

console.log("all party-invite-unique checks passed");
