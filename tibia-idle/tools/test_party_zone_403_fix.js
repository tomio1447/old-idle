"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const party = fs.readFileSync(path.join(root, "game/js/party.js"), "utf8");
const mega = fs.readFileSync(path.join(root, "game/js/megalomania-lobby.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server/party.js"), "utf8");
const lobby = fs.readFileSync(path.join(root, "server/megalomania_lobby.js"), "utf8");
const html = fs.readFileSync(path.join(root, "game/index.html"), "utf8");
function must(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log("ok:", msg);
}
must(party.includes("World Boss") && party.includes("worldBoss"), "partyCurrentZone ignores world boss");
must(party.includes("Sincroniza leader_zone") && party.includes("leader_zone=unknown"),
  "create/invite sync zone before invite");
must(party.includes('info.zone === "boss"'), "boss 403 toast only for boss zone");
must(mega.includes("megaLobbyEnsureNotInParty"), "mega lobby syncs party before create");
must(server.includes("WORLD_BOSS_ISOLATED"), "server ignores world-boss zone reports");
must(lobby.includes('code: 409') && lobby.includes("Saia da Party antes de abrir"),
  "mega lobby party conflict is 409 not 403");
must(html.includes("js/party.js?v="), "cache bust party.js");
must(html.includes("js/megalomania-lobby.js?v=mega-shared-v2")||
  html.includes("js/megalomania-lobby.js?v=mega-lobby-always-v1"), "cache bust megalomania");
must(html.includes("js/game.js?v=mega-lobby-always-v1"), "cache bust game.js lobby");
must(!mega.includes("const MEGA_TEST_BYPASS"),
  "mega lobby must not redeclare MEGA_TEST_BYPASS (breaks script load)");
must(mega.includes("megaTestBypass") && mega.includes("window.megaLobbyOpenFromBoss"),
  "mega lobby exposes open helper on window");
must(mega.includes("megaLobbyBindWhenReady") && mega.includes("resumeIdleInstance"),
  "mega guests resume shared instance");
console.log("all party-403 checks passed");
