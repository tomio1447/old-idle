/* Regressão: templo multijogador (presença compartilhada na cidade).
 *
 * Servidor: heartbeat/leave/prune do registro de presença + snapshot por
 * conta (look/nível/vocação vêm do personagem salvo, nunca do cliente).
 * Cliente: snapshot aplicado no G.templePlayers, throttle do heartbeat,
 * remoção por misses/TTL, menu de interação (convite p/ lobby + /pm) e
 * renderização/hit-test dos jogadores remotos no mapa da cidade.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

/* ---------------- servidor ---------------- */
const { createTemplePresence, PRESENCE_TTL_MS } = require("../server/temple.js");

function fakeChar(id, accountId, over) {
  const outfit = Object.assign({ type: "knight", appearance: "", colors: [40, 60, 80, 90], addons: 1, mount: "" }, (over && over.outfit) || {});
  const extra = Object.assign({ sex: "male", outfit }, over || {});
  return {
    id, account_id: accountId,
    name: "Char" + id, voc: extra.voc || "knight", level: 123,
    zone: extra.zone || "unknown",
    updated_at: extra.updatedAt || new Date(id * 1000).toISOString(),
    data: JSON.stringify(extra),
  };
}
{
  const published = [];
  const db = {
    chars: [
      fakeChar(1, 11),
      fakeChar(2, 22, { sex: "female", outfit: { type: "druid", appearance: "x", colors: [1, 2], addons: 99, mount: "m" } }),
      fakeChar(3, 33, { zone: "city", updatedAt: "2026-01-01T00:00:00Z" }),
      fakeChar(4, 33, { zone: "hunt", updatedAt: "2026-01-02T00:00:00Z" }),
    ],
    charactersOf(accountId) { return this.chars.filter((c) => c.account_id === Number(accountId)); },
    findCharacter(id) { return this.chars.find((c) => c.id === Number(id)); },
  };
  const tp = createTemplePresence({ getDb: () => db, publishAccount: (aid, type, data) => published.push({ aid, type, data }) });

  const r1 = tp.heartbeat(db, { id: 11 }, { char_id: 1, x: 5, y: 6, dir: "e", moving: true });
  must(r1.code === 200 && r1.body.ok && r1.body.players.length === 0, "primeiro heartbeat deveria ver templo vazio");
  const r2 = tp.heartbeat(db, { id: 22 }, { char_id: 2, x: 9, y: 9, dir: "n", moving: false });
  must(r2.body.players.length === 1 && r2.body.players[0].name === "Char1" &&
       r2.body.players[0].x === 5 && r2.body.players[0].dir === "e" &&
       r2.body.players[0].level === 123 && r2.body.players[0].voc === "knight",
    "snapshot do templo sem o outro jogador/posição/level");
  const snap1 = tp.snapshotFor(22);
  must(snap1.length === 1 && snap1[0].name === "Char1", "snapshotFor não exclui o viewer");
  const snap2 = tp.snapshotFor(11);
  must(snap2.length === 1 && snap2[0].name === "Char2" && snap2[0].sex === "female" &&
       snap2[0].outfit.type === "druid" && snap2[0].outfit.addons === 3 &&
       snap2[0].outfit.colors.length === 2,
    "look do personagem não veio sanitizado do banco");

  // throttle
  const r3 = tp.heartbeat(db, { id: 11 }, { char_id: 1, x: 5, y: 6, dir: "e", moving: true });
  must(r3.body.throttled === true, "heartbeat repetido deveria ser throttled");

  // char_id de OUTRA conta: nunca 403 — resolve pelo personagem da PRÓPRIA
  // conta (o token é quem manda). A presença da conta 11 continua Char1.
  const r4 = tp.heartbeat(db, { id: 11 }, { char_id: 2, x: 1, y: 1, dir: "s", moving: false });
  must(r4.code === 200 && r4.body.ok, "char_id de outra conta deveria resolver pela própria conta (sem 403)");
  must(tp.snapshotFor(22).length === 1 && tp.snapshotFor(22)[0].name === "Char1",
    "fallback vazou personagem de outra conta");

  // char_id ausente (caso VM: sessão vazia) -> personagem da conta
  const rMissing = tp.heartbeat(db, { id: 22 }, { x: 3, y: 3, dir: "n", moving: false });
  must(rMissing.code === 200 && rMissing.body.ok, "heartbeat sem char_id deveria resolver pela conta");

  // fallback por zona: conta 33 tem Char3 (city) e Char4 (hunt)
  const rCity = tp.heartbeat(db, { id: 33 }, { x: 2, y: 2, dir: "w", moving: false });
  must(rCity.code === 200 && rCity.body.ok, "heartbeat da conta 33 falhou");
  const snap11 = tp.snapshotFor(11);
  const char33 = snap11.find((pl) => pl.name && pl.name.indexOf("Char") === 0 && (pl.name === "Char3" || pl.name === "Char4"));
  must(char33 && char33.name === "Char3", "fallback deveria preferir o personagem na zona cidade");

  // conta sem personagens -> 404 (nunca 403 para conta válida)
  const r5 = tp.heartbeat(db, { id: 99 }, { char_id: 3, x: 2, y: 2, dir: "w", moving: false });
  must(r5.code === 404 && !r5.body.ok, "conta sem personagens deveria dar 404, não 403");

  // publish: broadcast para os presentes
  published.length = 0;
  tp.publish();
  must(published.length === 3 && published.every((p) => p.type === "temple" && Array.isArray(p.data.players)),
    "publish não mandou snapshot para todos os presentes");
  const to11 = published.find((p) => p.aid === 11).data.players;
  must(to11.some((pl) => pl.name === "Char2"), "publish vazou o jogador da conta 22");

  // leave
  tp.leave(11);
  must(tp.size() === 2 && tp.snapshotFor(22).length === 1, "leave não removeu a presença");
}

/* ---------------- cliente: arquivos e marcação ---------------- */
const templeSrc = fs.readFileSync(path.join(js, "temple-mp.js"), "utf8");
const citySrc = fs.readFileSync(path.join(js, "city-render.js"), "utf8");
const renderSrc = fs.readFileSync(path.join(js, "render.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const accountSrc = fs.readFileSync(path.join(js, "account-client.js"), "utf8");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
const css = fs.readFileSync(path.join(game, "css", "layout.css"), "utf8");

must(accountSrc.includes('if(type==="temple"){accountSyncDispatch("temple",data);return;}') &&
     accountSrc.includes('"mega-lobby","pale-lobby","temple","snapshot-required"'),
  "SSE do tipo temple não registrado no account-client");
must(html.includes('js/temple-mp.js?v=temple-mp-v') && html.includes("css/layout.css?v="),
  "temple-mp.js ou cache-bust do CSS ausente no index");
must(citySrc.includes("this.templeHit = []") && citySrc.includes("G.templePlayers.forEach") &&
     citySrc.includes("OutfitRenderer.forPlayer(fake"),
  "renderização dos jogadores remotos ausente no city-render");
must(citySrc.includes("templeMpVocName(rp.voc)") && citySrc.includes("templeMpLerp(rp, frameNow)"),
  "label voc/nível ou lerp dos remotos ausente");
must(renderSrc.includes("Renderer.prototype.templePlayerAt"),
  "hit-test templePlayerAt ausente no renderer");
must(gameSrc.includes("G.renderer.templePlayerAt(mx, my)") &&
     gameSrc.includes("templeMpOpenMenu(pid, e.clientX, e.clientY)"),
  "clique no canvas da cidade não abre o menu do jogador");
must(templeSrc.includes('"/api/temple/presence"') && templeSrc.includes('"/api/temple/leave"') &&
     templeSrc.includes("tibia-idle-sync-temple"),
  "heartbeat/leave/SSE ausentes no temple-mp");
must(css.includes(".temple-player-menu {") && css.includes(".temple-player-menu-item:hover"),
  "CSS do menu de interação ausente");

/* ---------------- cliente: lógica real em vm ---------------- */
const calls = [];
const timers = [];
let templeListener = null;
let fetchMode = "ok"; // "ok" | "denied"
let tokenMode = "tok";
let sessionCharMode = "";
const ctx = {
  window: {
    location: { origin: "http://x" },
    addEventListener(name, fn) { if (name === "tibia-idle-sync-temple") templeListener = fn; },
  },
  document: undefined,
  setInterval(fn, ms) { timers.push(fn); return timers.length; },
  clearInterval() {},
  fetch: async (url, opts) => {
    calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (fetchMode === "denied") return { json: async () => ({ ok: false, code: 403, msg: "Personagem inválido" }) };
    // primeira resposta devolve um jogador; as seguintes, templo vazio
    const players = calls.length === 1
      ? [{ charId: 2, name: "Char2", voc: "druid", level: 90, sex: "female", outfit: { type: "druid" }, x: 4, y: 4, dir: "n", moving: false }]
      : [];
    return { json: async () => ({ ok: true, players }) };
  },
  sessionToken: () => tokenMode,
  // Simula a VM: sessão vazia (auto-resume/troca de char) — o char_id cai
  // para o personagem carregado (G.p.id) e o servidor resolve pela conta.
  sessionCharId: () => sessionCharMode,
  accountApiUrl: () => "http://x",
  G: { inCity: true, p: { id: 1 }, walker: { px: 160, py: 160, dir: "s", moving: false }, combat: null, training: null },
  CITY: {},
  console,
};
vm.createContext(ctx);
vm.runInContext(templeSrc, ctx, { filename: "temple-mp.js" });

(async () => {
const flush = () => new Promise((r) => setTimeout(r, 0));

must(ctx.G.templePlayers && vm.runInContext("G.templePlayers instanceof Map", ctx),
  "G.templePlayers não é o Map de presença");
must(!!templeListener, "listener do SSE temple não registrado");
// aplica snapshot via evento (boot escuta tibia-idle-sync-temple)
templeListener({ detail: { players: [{ charId: 2, name: "Char2", voc: "druid", level: 90, sex: "female", outfit: { type: "druid" }, x: 3, y: 3, dir: "n", moving: true }] } });
must(ctx.G.templePlayers.size === 1 && ctx.G.templePlayers.get("2").tx === 3 &&
     ctx.G.templePlayers.get("2").name === "Char2",
  "snapshot não aplicado no G.templePlayers");
ctx.G.templePlayers.get("2").moveAt = Date.now() - 190;
const pos = vm.runInContext("templeMpLerp(G.templePlayers.get('2'), Date.now())", ctx);
must(pos.x >= 3 && pos.x <= 4, "lerp deveria caminhar até o alvo");

// heartbeat via tick manual — char_id vem de G.p.id (sessão vazia, caso VM)
timers.forEach((fn) => fn()); // roda templeMpTick (inTemple)
await flush();
must(calls.length === 1 && calls[0].url === "http://x/api/temple/presence" &&
     calls[0].body.token === "tok" &&
     calls[0].body.x === 5 && calls[0].body.y === 5 && calls[0].body.dir === "s" &&
     calls[0].body.char_id === 1,
  "heartbeat não enviou token/posição/char corretos (char_id = G.p.id, tile 160/32=5)");

// sessão presente (entrada online OK) tem prioridade sobre G.p.id
sessionCharMode = "7";
ctx.G.walker.px = 256;
vm.runInContext("TEMPLE_MP.lastHbAt = Date.now() - 2000", ctx);
timers.forEach((fn) => fn());
await flush();
must(calls.length === 2 && calls[1].body.char_id === "7",
  "com sessão presente o char_id deveria vir da sessão");

// sem token (pré-login) o heartbeat nem chama — nada de 401 em loop
tokenMode = "";
sessionCharMode = "";
ctx.G.walker.px = 288;
vm.runInContext("TEMPLE_MP.lastHbAt = Date.now() - 2000", ctx);
timers.forEach((fn) => fn());
await flush();
must(calls.length === 2, "sem token o heartbeat não pode chamar o servidor");
tokenMode = "tok";
sessionCharMode = "";

// 403 (Personagem inválido): backoff — não fica batendo a cada tick
const beforeDenied = calls.length;
fetchMode = "denied";
ctx.G.walker.px = 192; // move (tile 6) para o heartbeat disparar
vm.runInContext("TEMPLE_MP.lastHbAt = Date.now() - 2000", ctx);
timers.forEach((fn) => fn()); // tenta e falha (403)
await flush();
const afterDenied = calls.length;
must(afterDenied === beforeDenied + 1, "403 não gerou nova tentativa de heartbeat");
must(vm.runInContext("TEMPLE_MP.errorBackoffUntil > Date.now()", ctx),
  "403 não ativou o backoff");
ctx.G.walker.px = 224;
vm.runInContext("TEMPLE_MP.lastHbAt = Date.now() - 2000", ctx);
timers.forEach((fn) => fn());
await flush();
timers.forEach((fn) => fn());
await flush();
must(calls.length === afterDenied, "403 sem backoff — heartbeat continuou batendo");
vm.runInContext("TEMPLE_MP.errorBackoffUntil = 0", ctx); // backoff expira
fetchMode = "ok";
vm.runInContext("TEMPLE_MP.lastHbAt = Date.now() - 2000", ctx);
timers.forEach((fn) => fn());
await flush();
must(calls.length === afterDenied + 1, "heartbeat não voltou após o backoff");

// sair do templo -> leave + limpa
ctx.G.inCity = false;
timers.forEach((fn) => fn());
must(calls.some((c) => c.url === "http://x/api/temple/leave"), "sair da cidade não chamou /api/temple/leave");
must(ctx.G.templePlayers.size === 0, "players não limpos ao sair do templo");

// misses: 2 snapshots sem o jogador -> removido
ctx.G.inCity = true;
templeListener({ detail: { players: [{ charId: 2, name: "Char2", voc: "druid", level: 90, sex: "female", outfit: {}, x: 1, y: 1, dir: "s", moving: false }] } });
must(ctx.G.templePlayers.size === 1, "sanity: jogador presente");
templeListener({ detail: { players: [] } });
must(ctx.G.templePlayers.size === 1, "1 miss não pode remover");
templeListener({ detail: { players: [] } });
must(ctx.G.templePlayers.size === 0, "2 misses deveriam remover o jogador");

// voc name
must(vm.runInContext('templeMpVocName("druid")', ctx) === "Druid" &&
     vm.runInContext('templeMpVocName("knight")', ctx) === "Knight" &&
     vm.runInContext('templeMpVocName("monk")', ctx) === "Monk",
  "templeMpVocName errado");

})().catch((e) => { console.error(e && e.message); process.exit(1); });

console.log("ok: templo multijogador — heartbeat/leave/prune no servidor, snapshot->G.templePlayers, lerp e menu no cliente");
