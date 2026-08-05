/* Teste da API de PARTY (convites assíncronos + follow + anti-exploit).
 *
 * Cobre as regras do pedido:
 *   1) líder só convida em Safe Zone (cidade) ou Área de Treino;
 *   2) convite fica PENDENTE (inbox) e pode ser aceito DEPOIS, com outro
 *      personagem da conta do convidado;
 *   3) follow: líder entra em hunt -> membro recebe nonce e teleporta;
 *   4) segurança: conta errada não aceita convite, nonce não reusa, membro
 *      não pode reportar zona nem forçar teleporte.
 *
 * Roda contra o servidor local (PORT=3456 MYSQL_HOST= node server.js):
 *   API_URL=http://127.0.0.1:3456 node test_party_api.js
 */
"use strict";
const API = process.env.API_URL || "http://127.0.0.1:3456";
// sufixo único por execução (nomes não podem colidir com execuções anteriores)
const RUN = String(Date.now()).slice(-6);
let P = 0; // contador p/ logins únicos

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(API + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { code: r.status, data };
}

async function reg() {
  P += 1;
  const login = "party" + RUN + "_" + P;
  const pass = "x";
  await api("POST", "/api/register", { login, password: pass });
  const r = await api("POST", "/api/login", { login, password: pass });
  return r.data;   // { token, account, characters }
}

async function createChar(token, name, voc) {
  const r = await api("POST", "/api/characters", {
    token, name, voc: voc || "knight",
    data: JSON.stringify({ name, voc: voc || "knight", level: 1 }),
  });
  return r.data.character;
}

const errors = [];
function check(cond, msg) {
  if (!cond) { errors.push(msg); console.log("  FAIL:", msg); }
  else console.log("  ok:", msg);
}

(async () => {
  console.log("== 1. contas + personagens ==");
  const a1 = await reg();                       // líder
  const a2 = await reg();                       // convidado
  const c1 = await createChar(a1.token, "LiderTeste" + RUN, "knight");
  const c2 = await createChar(a2.token, "MembroTeste" + RUN, "paladin");
  const c2b = await createChar(a2.token, "OutroChar" + RUN, "druid");
  check(!!c1 && !!c2 && !!c2b, "chars criados");

  console.log("== 2. criar party ==");
  let r = await api("POST", "/api/party/create", { token: a1.token, char_id: c1.id });
  check(r.code === 201 && r.data.state && r.data.state.isLeader, "party criada (líder)");

  r = await api("POST", "/api/party/create", { token: a1.token, char_id: c1.id });
  check(r.code === 409, "não cria party duplicada (409)");

  console.log("== 3. zona inicial = unknown -> convite BLOQUEADO ==");
  r = await api("POST", "/api/party/invite", { token: a1.token, char_id: c1.id, invitee_name: c2.name });
  check(r.code === 403 && /Cidade|Treino/.test(r.data.msg), "convite bloqueado fora de cidade/treino");

  console.log("== 4. líder vai para a cidade -> convite ok ==");
  r = await api("POST", "/api/party/zone", { token: a1.token, char_id: c1.id, zone: "city" });
  check(r.code === 200 && r.data.zone === "city", "zona city reportada");

  r = await api("POST", "/api/party/invite", { token: a1.token, char_id: c1.id, invitee_name: c2.name });
  check(r.code === 201 && r.data.invite && r.data.invite.id, "convite enviado da cidade");
  const inviteId = r.data.invite.id;

  r = await api("POST", "/api/party/invite", { token: a1.token, char_id: c1.id, invitee_name: c2.name });
  check(r.code === 409, "convite duplicado pendente bloqueado (409)");

  r = await api("POST", "/api/party/invite", { token: a1.token, char_id: c1.id, invitee_name: "NaoExiste" + P });
  check(r.code === 404, "personagem inexistente -> 404");

  console.log("== 5. líder entra na HUNT -> convite BLOQUEADO (regra de zona) ==");
  r = await api("POST", "/api/party/zone", { token: a1.token, char_id: c1.id, zone: "hunt", hunt: "rats", instance: "non-pvp" });
  check(r.code === 200 && r.data.followed === 0, "zona hunt reportada (sem membros ainda)");

  r = await api("POST", "/api/party/invite", { token: a1.token, char_id: c1.id, invitee_name: c2b.name });
  check(r.code === 403 && /Cidade|Treino/.test(r.data.msg), "convite bloqueado durante hunt");

  console.log("== 6. volta pra cidade -> convite p/ 2º char da conta 2 ==");
  await api("POST", "/api/party/zone", { token: a1.token, char_id: c1.id, zone: "city" });
  r = await api("POST", "/api/party/invite", { token: a1.token, char_id: c1.id, invitee_name: c2b.name });
  check(r.code === 201, "2º convite enviado (cidade)");
  const inviteId2 = r.data.invite.id;

  console.log("== 7. inbox: convites pendentes visíveis p/ a conta 2 ==");
  r = await api("GET", "/api/party/inbox", null, a2.token);
  check(r.code === 200 && r.data.invites.length === 2, "inbox com 2 convites pendentes");

  console.log("== 8. aceitar com conta errada -> 403 ==");
  const a3 = await reg();
  r = await api("POST", "/api/party/accept", { token: a3.token, invite_id: inviteId });
  check(r.code === 403, "conta errada não aceita convite");

  console.log("== 8b. aceitar em zona proibida (hunt) -> 403 ==");
  await api("POST", "/api/party/zone", { token: a2.token, char_id: c2.id, zone: "hunt", hunt: "rats" });
  r = await api("POST", "/api/party/accept", { token: a2.token, invite_id: inviteId });
  check(r.code === 403, "aceite bloqueado fora de cidade/treino (nova regra)");
  await api("POST", "/api/party/zone", { token: a2.token, char_id: c2.id, zone: "city" });

  console.log("== 9. aceitar o convite do char c2 (depois de trocar de char) ==");
  r = await api("POST", "/api/party/accept", { token: a2.token, invite_id: inviteId });
  check(r.code === 200, "convite aceito com o personagem convidado");

  r = await api("GET", "/api/party/state?char_id=" + c1.id, null, a1.token);
  check(r.code === 200 && r.data.state && r.data.state.members.length === 1 &&
        r.data.state.members[0].name === c2.name, "estado mostra o membro novo");
  const partyId = r.data.state.id;

  console.log("== 10. aceitar o 2º convite (mesma conta, outro char) ==");
  await api("POST", "/api/party/zone", { token: a2.token, char_id: c2b.id, zone: "city" });
  r = await api("POST", "/api/party/accept", { token: a2.token, invite_id: inviteId2 });
  check(r.code === 200, "2º char da conta também entrou");

  console.log("== 11. membro não lidera: zone report é no-op ==");
  r = await api("POST", "/api/party/zone", { token: a2.token, char_id: c2.id, zone: "hunt", hunt: "rats" });
  check(r.code === 200 && r.data.ignored === true, "membro não muda a zona (ignored)");

  console.log("== 12. follow: líder entra em hunt -> membros recebem nonce ==");
  r = await api("POST", "/api/party/zone", { token: a1.token, char_id: c1.id, zone: "hunt", hunt: "amazon-camp", instance: "pvp" });
  check(r.code === 200 && r.data.followed === 2, "2 membros com follow pendente");

  r = await api("GET", "/api/party/state?char_id=" + c2.id, null, a2.token);
  const f = r.data.state && r.data.state.follow;
  check(!!f && f.hunt === "amazon-camp" && f.instance === "pvp" && !!f.nonce, "membro recebeu follow (hunt+instância+nonce)");

  console.log("== 13. follow: consumir nonce -> ok; replay -> 409 ==");
  r = await api("POST", "/api/party/follow", { token: a2.token, char_id: c2.id, nonce: f.nonce });
  check(r.code === 200, "follow confirmado (nonce consumido)");

  r = await api("POST", "/api/party/follow", { token: a2.token, char_id: c2.id, nonce: f.nonce });
  check(r.code === 409, "replay do nonce bloqueado (409)");

  r = await api("POST", "/api/party/follow", { token: a2.token, char_id: c2.id, nonce: "fake" });
  check(r.code === 409, "nonce falso bloqueado");

  console.log("== 14. estado do membro: follow limpo após consumir ==");
  r = await api("GET", "/api/party/state?char_id=" + c2.id, null, a2.token);
  check(!(r.data.state && r.data.state.follow), "follow consumido não aparece mais");

  console.log("== 15. líder volta pra cidade -> follow de RETORNO gerado p/ membros ==");
  await api("POST", "/api/party/zone", { token: a1.token, char_id: c1.id, zone: "city" });
  r = await api("GET", "/api/party/state?char_id=" + c2b.id, null, a2.token);
  const fb = r.data.state && r.data.state.follow;
  check(!!fb && fb.returnHome === true, "follow de retorno (returnHome) gerado ao voltar p/ cidade");
  // consome o follow de retorno (membro volta p/ cidade)
  if (fb && fb.nonce) {
    r = await api("POST", "/api/party/follow", { token: a2.token, char_id: c2b.id, nonce: fb.nonce });
    check(r.code === 200, "follow de retorno consumido");
  }
  r = await api("GET", "/api/party/state?char_id=" + c2b.id, null, a2.token);
  check(!(r.data.state && r.data.state.follow), "follow limpo após consumir o retorno");

  console.log("== 16. kick e sair ==");
  r = await api("POST", "/api/party/kick", { token: a1.token, char_id: c1.id, member_id: c2.id });
  check(r.code === 200, "líder removeu membro");

  r = await api("POST", "/api/party/leave", { token: a2.token, char_id: c2b.id });
  check(r.code === 200, "membro saiu");

  r = await api("POST", "/api/party/leave", { token: a1.token, char_id: c1.id });
  check(r.code === 200, "líder dissolveu a party");

  r = await api("GET", "/api/party/state?char_id=" + c1.id, null, a1.token);
  check(r.data.state === null, "sem party após dissolver");

  if (errors.length) {
    console.log("\nERROS (" + errors.length + "):");
    for (const e of errors) console.log("  - " + e);
    process.exit(1);
  }
  console.log("\nPARTY API OK — convites assíncronos, follow e anti-exploit validados");
  process.exit(0);
})().catch((e) => { console.error("FALHA:", e); process.exit(1); });
