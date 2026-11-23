/* Regressão: qualquer personagem da CONTA DONA da party pode iniciar/trocar
 * hunt e boss — a instância compartilhada pertence à conta, o "líder" é só
 * a ordem do roster. Convidado de outra conta segue sem controle.
 *
 * Cobertura:
 *  - partyReportZone: membro da conta dona dirige a PT (leader_zone +
 *    follows para os demais membros, sem self-follow; zonas do líder e dos
 *    chars da mesma conta espelhadas para o healStaleZone não reverter).
 *  - convidado de outra conta: reporte ignorado, leader_zone intacto.
 *  - POST /api/instance: create de membro da dona não fica "pending".
 *  - endInstance: membro da dona encerra de verdade (só row de outra conta
 *    desprende via sharedDetached).
 *  - cliente: partyBlocksHunt só bloqueia party de outra conta;
 *    maybeLoadPartyCombat ancora c.player no char ativo (não só no líder);
 *    câmera segue o player em todas as instâncias.
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const partySource = fs.readFileSync(path.join(__dirname, "..", "server", "party.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
const clientPartySource = fs.readFileSync(path.join(__dirname, "..", "game", "js", "party.js"), "utf8");
const combatSource = fs.readFileSync(path.join(__dirname, "..", "game", "js", "combat.js"), "utf8");
const gameSource = fs.readFileSync(path.join(__dirname, "..", "game", "js", "game.js"), "utf8");
const gridSource = fs.readFileSync(path.join(__dirname, "..", "game", "js", "grid.js"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gi-party-drive-"));
process.env.GLOBAL_IDLE_DATA_DIR = tmp;
delete process.env.MYSQL_HOST;
const party = require("../server/party");
const { getDb } = require("../server/db");
function must(ok, msg) { if (!ok) throw Error(msg); }

// ---------------------------------------------------------------- estrutura
must(partySource.includes("drivesParty"),
  "partyReportZone sem a regra drivesParty (membro da conta dona)");
must(/membersForFollow[\s\S]*?Number\(m\.id\)\s*!==\s*Number\(char\.id\)/.test(partySource),
  "follows sem exclusão do char que dirige (self-follow)");
must(/drivesParty[\s\S]*?setCharacterZone\(party\.leader_id/.test(partySource),
  "reporte de membro não espelha a zona no líder");
// POST /api/instance: create de membro da conta dona não pode ficar pending.
must(/leader_id\)!==activeId[\s\S]{0,200}owner_account_id\)!==Number\(acc\.id\)[\s\S]{0,120}pending/.test(serverSource),
  "create de instância ainda trava membro da conta dona em pending");
// endInstance: 'sair' só desprende quando a row é de OUTRA conta.
must(/leader_id\)[\s\S]{0,120}resolved\.shared[\s\S]{0,60}sharedDetached/.test(serverSource),
  "endInstance ainda desprende membro da conta dona em vez de encerrar");
// cliente: partyBlocksHunt compara a conta dona com a conta da sessão.
must(clientPartySource.includes("st.leader.account_id") &&
     clientPartySource.includes("accountLeaseAccountId"),
  "partyBlocksHunt sem checagem de conta dona");
// cliente: maybeLoadPartyCombat aceita membro e ancora c.player no ativo.
must(combatSource.includes("partyIsMemberLocal(player)") &&
     combatSource.includes("c.player = c.players[idx]"),
  "maybeLoadPartyCombat sem suporte a membro dirigindo");
// cliente: câmera segue o personagem em TODAS as instâncias.
must(/let focus = combat \? combat\.player : null/.test(gridSource) &&
     !gridSource.includes("followPlayer"),
  "combatViewport não segue o player em hunts normais");
// cliente: modal "Enquanto você esteve fora" — baseline + diff + exibição.
must(gameSource.includes("awayBaseline") && gameSource.includes("computeAwayDiff") &&
     gameSource.includes("showAwayModal") && gameSource.includes("resumeResult.away"),
  "modal 'Enquanto você esteve fora' sem baseline/diff/exibição");

// ------------------------------------------------------------- funcionais
async function main() {
  const store = await getDb();
  store.accounts = [{ id: 1 }, { id: 2 }];
  store.sessions = [{ account_id: 1, token: "tokA" }, { account_id: 2, token: "tokB" }];
  store.characters = [
    { id: 101, account_id: 1, name: "Lider", voc: "knight", level: 100, zone: "city", data: "{}" },
    { id: 102, account_id: 1, name: "Druida", voc: "druid", level: 100, zone: "city", data: "{}" },
    { id: 104, account_id: 1, name: "Pala", voc: "paladin", level: 100, zone: "city", data: "{}" },
    { id: 103, account_id: 2, name: "Guest", voc: "sorcerer", level: 100, zone: "city", data: "{}" },
  ];
  const p = store.partyCreate(store.characters[0]); // líder = 101 (conta 1)
  store.partyAddMember(p.id, 102);                  // membro da conta dona
  store.partyAddMember(p.id, 104);                  // membro da conta dona
  store.partyAddMember(p.id, 103);                  // convidado de outra conta

  // A) Membro da conta dona inicia a hunt — dirige a PT inteira.
  {
    const r = await party.partyReportZone(store, {
      token: "tokA", char_id: 102, zone: "hunt", hunt: "rats", instance: "non-pvp",
    });
    must(r.code === 200 && r.body.ok && !r.body.ignored,
      "membro da conta dona foi ignorado ao dirigir a party");
    const pr = store.parties[0];
    must(pr.leader_zone === "hunt" && pr.leader_hunt === "rats",
      "leader_zone/leader_hunt não atualizaram com o reporte do membro");
    const m102 = pr.members.find((m) => m.character_id === 102);
    const m104 = pr.members.find((m) => m.character_id === 104);
    const m103 = pr.members.find((m) => m.character_id === 103);
    must(!m102.follow_nonce, "o char que dirigiu recebeu follow do próprio destino");
    must(m104.follow_nonce && m104.follow_hunt === "rats",
      "outro membro da conta dona ficou sem follow");
    must(m103.follow_nonce && m103.follow_hunt === "rats",
      "convidado de outra conta ficou sem follow");
    // Zonas espelhadas só nos chars da conta dona (o convidado reporta a dele).
    must(store.findCharacter(101).zone === "hunt",
      "zona do líder não foi espelhada (healStaleZone reverteria a PT)");
    must(store.findCharacter(104).zone === "hunt",
      "zona do outro membro da conta não foi espelhada");
    must(store.findCharacter(102).zone === "hunt", "zona do driver não gravada");
    must(store.findCharacter(103).zone === "city",
      "zona do convidado foi sobrescrita pela conta dona");
  }

  // B) O mesmo membro sai da hunt — recall de todos, exceto ele mesmo.
  {
    const r = await party.partyReportZone(store, { token: "tokA", char_id: 102, zone: "city" });
    must(r.code === 200 && r.body.ok, "retorno do membro para a cidade falhou");
    const pr = store.parties[0];
    must(pr.leader_zone === "city", "leader_zone não voltou para city");
    const m102 = pr.members.find((m) => m.character_id === 102);
    const m104 = pr.members.find((m) => m.character_id === 104);
    const m103 = pr.members.find((m) => m.character_id === 103);
    must(m103.follow_boss === "__RETURN_HOME__" && m103.follow_nonce,
      "convidado não recebeu follow de retorno");
    must(m104.follow_boss === "__RETURN_HOME__" && m104.follow_nonce,
      "membro da conta dona não recebeu follow de retorno");
    must(!m102.follow_nonce, "driver recebeu follow de retorno para si mesmo");
    must(store.findCharacter(101).zone === "city", "zona do líder não voltou");
  }

  // C) Convidado de outra conta tenta dirigir — ignorado, nada muda.
  {
    const r = await party.partyReportZone(store, {
      token: "tokB", char_id: 103, zone: "hunt", hunt: "orcs", instance: "non-pvp",
    });
    must(r.code === 200 && r.body.ok && r.body.ignored,
      "convidado de outra conta conseguiu dirigir a party");
    must(store.parties[0].leader_zone === "city",
      "leader_zone mudou por reporte de convidado");
    must(store.findCharacter(103).zone === "hunt",
      "a zona própria do convidado deveria ser registrada");
    const m104 = store.parties[0].members.find((m) => m.character_id === 104);
    must(!m104 || !m104.follow_hunt || m104.follow_hunt !== "orcs",
      "convidado gerou follow para os demais");
  }

  console.log("test_party_member_drive: OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
