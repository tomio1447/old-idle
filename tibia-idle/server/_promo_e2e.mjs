/* E2E real do /api/promote contra o servidor HTTP (JsonStore temporário). */
const BASE = "http://127.0.0.1:3999";
let fails = 0;
const must = (ok, msg, extra) => { console.log((ok ? "  ✔ " : "  ✘ ") + msg + (extra ? " — " + extra : "")); if (!ok) fails++; };
async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({ "content-type": "application/json" }, token ? { authorization: "Bearer " + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { code: res.status, data };
}
const phase = process.argv[2];

if (phase === "A") {
  /* ---- conta + personagem level 1 ---- */
  const reg = await api("POST", "/api/register", { login: "promotest", password: "senha123" });
  must(reg.data.ok, "registro da conta", JSON.stringify(reg.data).slice(0, 60));
  const login = await api("POST", "/api/login", { login: "promotest", password: "senha123" });
  must(login.data.ok && !!login.data.token, "login devolve token");
  const token = login.data.token;
  const created = await api("POST", "/api/characters", { token, name: "DruidE2E", voc: "druid" });
  must(created.data.ok, "personagem criado", JSON.stringify(created.data).slice(0, 80));
  const charId = created.data.character ? created.data.character.id : created.data.id;
  console.log("  charId:", charId);

  const lease = await api("POST", "/api/lease/acquire", { token, holder_id: "tab-e2e-promo-1" });
  must(lease.data.ok && !!lease.data.leaseToken, "lease adquirido");
  const leaseFields = { holder_id: lease.data.holderId, lease_token: lease.data.leaseToken };

  /* ---- level 1: deve bloquear por nível (400 PROMOTION_LEVEL) ---- */
  const tooLow = await api("POST", "/api/promote", Object.assign({ token, char_id: Number(charId) }, leaseFields));
  must(tooLow.code === 400 && tooLow.data.error === "PROMOTION_LEVEL",
    "level 1 bloqueado com PROMOTION_LEVEL", JSON.stringify(tooLow.data));

  /* ---- sem lease: 423 ---- */
  const noLease = await api("POST", "/api/promote", { token, char_id: Number(charId) });
  must(noLease.code === 423 && noLease.data.error === "LEASE_REQUIRED",
    "sem lease responde 423 LEASE_REQUIRED", JSON.stringify(noLease.data));

  /* ---- token inválido: 401 ---- */
  const badTok = await api("POST", "/api/promote", Object.assign({ token: "xxx", char_id: Number(charId) }, leaseFields));
  must(badTok.code === 401, "token inválido responde 401");

  /* grava ids p/ próxima fase */
  const fs = await import("fs");
  fs.writeFileSync("/tmp/gi-promo/state.json", JSON.stringify({ token, charId, leaseFields }, null, 1));
  console.log(fails ? "FASE A FALHOU: " + fails : "FASE A OK");
} else if (phase === "B") {
  /* ---- pós-patch (level 50, gold 30000): promover deve funcionar ---- */
  const fs = await import("fs");
  const st = JSON.parse(fs.readFileSync("/tmp/gi-promo/state.json", "utf8"));
  const { token, charId, leaseFields } = st;
  const lease = await api("POST", "/api/lease/acquire", Object.assign({ token, holder_id: leaseFields.holder_id }, { lease_token: leaseFields.lease_token }));
  must(lease.data.ok, "lease readquirido pós-restart", JSON.stringify(lease.data).slice(0, 60));
  const lf = { holder_id: lease.data.holderId, lease_token: lease.data.leaseToken };

  const promo = await api("POST", "/api/promote", Object.assign({ token, char_id: Number(charId) }, lf));
  must(promo.code === 200 && promo.data.ok && promo.data.promoted === true,
    "promoção OK (200, promoted:true)", JSON.stringify(promo.data).slice(0, 120));

  const me = await api("GET", "/api/me", null, token);
  const sum = (me.data.characters || []).find((c) => String(c.id) === String(charId));
  must(!!sum && sum.promoted === true, "/api/me mostra promoted:true (não some mais)", JSON.stringify(sum).slice(0, 100));

  /* char completo: gold debitado */
  const full = await api("GET", "/api/characters/" + charId, null, token);
  const pdata = full.data.character && full.data.character.data;
  const dataObj = typeof pdata === "string" ? JSON.parse(pdata) : pdata;
  must(!!dataObj && dataObj.promoted === true && Number(dataObj.gold) === 10000,
    "persistido: promoted=true e gold 30000-20000=10000", "gold=" + (dataObj && dataObj.gold));

  /* segunda tentativa: 409 já promovido (sem cobrar de novo) */
  const again = await api("POST", "/api/promote", Object.assign({ token, char_id: Number(charId) }, lf));
  must(again.code === 409 && again.data.error === "ALREADY_PROMOTED",
    "segunda promoção bloqueada (ALREADY_PROMOTED)", JSON.stringify(again.data));
  const me2 = await api("GET", "/api/me", null, token);
  const sum2 = (me2.data.characters || []).find((c) => String(c.id) === String(charId));
  must(sum2 && sum2.promoted === true, " continua promoted após tentativa duplicada");

  console.log(fails ? "FASE B FALHOU: " + fails : "FASE B OK");
}
process.exit(fails ? 1 : 0);
