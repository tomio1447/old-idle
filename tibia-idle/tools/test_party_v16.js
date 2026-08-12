/* Teste da v16 de PARTY: snapshots hp/mp, aceite por zona, requisitos de
 * boss para todos os membros e zona por membro.
 * Roda contra servidor local: API_URL=http://127.0.0.1:3456 node test_party_v16.js */
"use strict";
const API = process.env.API_URL || "http://127.0.0.1:3456";
const RUN = String(Date.now()).slice(-6);
let P = 0;const LEASES=new Map();
async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch (e) {}
  return { code: r.status, data: d };
}
async function reg() {
  P+=1;const l="v16"+RUN+"_"+P;await api("POST","/api/register",{login:l,password:"x"});
  const account=(await api("POST","/api/login",{login:l,password:"x"})).data;
  const lease=await api("POST","/api/lease/acquire",{token:account.token,holder_id:"v16holder"+P+"xxxx"});
  LEASES.set(account.token,{holder_id:lease.data.holderId,lease_token:lease.data.leaseToken});return account;
}
async function createChar(token, name) { const r = await api("POST","/api/characters",{token,name,voc:"knight",data:JSON.stringify({name,voc:"knight",level:50,hp:300,mp:100})}); return r.data.character; }
async function saveChar(token,c,body){
  const r=await api("PUT","/api/characters/"+c.id,Object.assign({token,
    expected_version:c.saveVersion,voc:"knight",level:c.level||50},body,LEASES.get(token)||{}));
  if(r.data.ok)c.saveVersion=r.data.saveVersion;return r;
}

const errors = [];
const check = (c, m) => { if (!c) errors.push(m); else console.log("  ok:", m); };

(async () => {
  const a1 = await reg(), a2 = await reg();
  const c1 = await createChar(a1.token, "LiderV16" + RUN);
  const c2 = await createChar(a2.token, "MembroV16" + RUN);

  console.log("== 1. criar party + convite ==");
  await api("POST","/api/party/create",{token:a1.token,char_id:c1.id});
  // líder vai pra cidade antes de convidar
  await api("POST","/api/party/zone",{token:a1.token,char_id:c1.id,zone:"city"});
  const inv = await api("POST","/api/party/invite",{token:a1.token,char_id:c1.id,invitee_name:c2.name});
  check(inv.code === 201, "convite enviado");

  console.log("== 2. aceitar em zona proibida (hunt) -> 403 ==");
  // convidado está em hunt (zona gravada)
  await api("POST","/api/party/zone",{token:a2.token,char_id:c2.id,zone:"hunt",hunt:"rats"});
  const accBad = await api("POST","/api/party/accept",{token:a2.token,invite_id:inv.data.invite.id});
  check(accBad.code === 403 && /Cidade|Treino/.test(accBad.data.msg), "aceite bloqueado em hunt");

  console.log("== 3. aceitar em cidade -> ok; zona do membro gravada ==");
  await api("POST","/api/party/zone",{token:a2.token,char_id:c2.id,zone:"city"});
  const acc = await api("POST","/api/party/accept",{token:a2.token,invite_id:inv.data.invite.id});
  check(acc.code === 200, "aceite ok em cidade");

  console.log("== 4. state com hp/mp/zona por membro ==");
  // salva o char com snapshots de hp/mp
  await saveChar(a2.token,c2,{level:50,data:"{}",hp:280,mp:95,maxHp:350,maxMp:140});
  const st = await api("GET","/api/party/state?char_id="+c1.id,null,a1.token);
  const membro = st.data.state.members.find(m=>m.id===c2.id);
  check(!!membro && membro.hp === 280 && membro.mp === 95 && membro.maxHp === 350 && membro.maxMp === 140, "hp/mp/max no state");
  check(!!membro && membro.zone === "city", "zona do membro gravada");
  const lider = st.data.state.leader;
  check(!!lider && lider.zone === "city", "zona do líder no state");

  console.log("== 5. membro reporta zona própria (não muda a party) ==");
  await api("POST","/api/party/zone",{token:a2.token,char_id:c2.id,zone:"training"});
  const st2 = await api("GET","/api/party/state?char_id="+c1.id,null,a1.token);
  check(st2.data.state.leader.zone === "city", "zona da party continua city (membro não lidera)");
  const m2 = st2.data.state.members.find(m=>m.id===c2.id);
  check(m2.zone === "training", "zona do membro virou training");

  console.log("== 6. boss com requisitos: membro SEM missão -> recusa ==");
  const zoneBoss = await api("POST","/api/party/zone",{
    token:a1.token, char_id:c1.id, zone:"boss", boss:"timira-the-many-headed",
    cooldownMs: 57600000, mission: "marapur-nagas",
    missionTargets: { "naga-archer": 25, "naga-warrior": 25, "makara": 25 },
  });
  check(zoneBoss.code === 403 && /missão/.test(zoneBoss.data.msg), "boss recusado: membro sem missão");

  console.log("== 7. boss com requisitos: TODOS com missão completa -> ok ==");
  // dá missão completa ao membro e ao líder
  const dataL = JSON.stringify({ level: 300, missions: { "marapur-nagas": { progress: { "naga-archer": 25, "naga-warrior": 25, "makara": 25 }, claimed: {}, completeClaimed: false } } });
  const dataM = JSON.stringify({ level: 300, missions: { "marapur-nagas": { progress: { "naga-archer": 25, "naga-warrior": 25, "makara": 25 }, claimed: {}, completeClaimed: false } } });
  await saveChar(a1.token,c1,{level:300,data:dataL});
  await saveChar(a2.token,c2,{level:300,data:dataM});
  // líder em cidade -> boss
  await api("POST","/api/party/zone",{token:a1.token,char_id:c1.id,zone:"city"});
  const zoneBoss2 = await api("POST","/api/party/zone",{
    token:a1.token, char_id:c1.id, zone:"boss", boss:"timira-the-many-headed",
    cooldownMs: 57600000, mission: "marapur-nagas",
    missionTargets: { "naga-archer": 25, "naga-warrior": 25, "makara": 25 },
  });
  check(zoneBoss2.code === 200 && zoneBoss2.data.followed === 1, "boss ok: follow gerado p/ membro");

  console.log("== 8. boss com membro em COOLDOWN -> recusa ==");
  const dataM2 = JSON.stringify({ level: 300, bosses: { "timira-the-many-headed": { lastFight: Date.now() } },
    missions: { "marapur-nagas": { progress: { "naga-archer": 25, "naga-warrior": 25, "makara": 25 } } } });
  await saveChar(a2.token,c2,{level:300,data:dataM2});
  await api("POST","/api/party/zone",{token:a1.token,char_id:c1.id,zone:"city"});
  const zoneBoss3 = await api("POST","/api/party/zone",{
    token:a1.token, char_id:c1.id, zone:"boss", boss:"timira-the-many-headed",
    cooldownMs: 57600000, mission: "marapur-nagas",
    missionTargets: { "naga-archer": 25, "naga-warrior": 25, "makara": 25 },
  });
  check(zoneBoss3.code === 403 && /cooldown/.test(zoneBoss3.data.msg), "boss recusado: membro em cooldown");

  if (errors.length) { console.log("\nERROS (" + errors.length + "):"); errors.forEach(e=>console.log("  - "+e)); process.exit(1); }
  console.log("\nPARTY V16 OK — hp/mp, zona por membro, aceite por zona e requisitos de boss validados");
  process.exit(0);
})().catch(e=>{console.error("FALHA:",e);process.exit(1);});
