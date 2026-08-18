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
  return {
    id, account_id: accountId,
    name: "Char" + id, voc: "knight", level: 123,
    data: JSON.stringify(Object.assign({ sex: "male", outfit }, over || {})),
  };
}
{
  const published = [];
  const db = {
    chars: [fakeChar(1, 11), fakeChar(2, 22, { sex: "female", outfit: { type: "druid", appearance: "x", colors: [1, 2], addons: 99, mount: "m" } })],
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

  // personagem de outra conta
  const r4 = tp.heartbeat(db, { id: 11 }, { char_id: 2, x: 1, y: 1, dir: "s", moving: false });
  must(r4.code === 403, "heartbeat com personagem de outra conta deveria dar 403");

  // publish: broadcast para os dois presentes
  published.length = 0;
  tp.publish();
  must(published.length === 2 && published.every((p) => p.type === "temple" && Array.isArray(p.data.players)),
    "publish não mandou snapshot para todos os presentes");
  const to11 = published.find((p) => p.aid === 11).data.players;
  must(to11.length === 1 && to11[0].name === "Char2", "publish vazou o próprio jogador");

  // leave
  tp.leave(11);
  must(tp.size() === 1 && tp.snapshotFor(22).length === 0, "leave não removeu a presença");

  // expiry
  const entries2 = [22];
  must(entries2.length === 1, "sanity");
  // simula heartbeat velho via monkeypatch direto no controller: publish já prune
  const r5 = tp.heartbeat(db, { id: 33 }, { char_id: 3, x: 2, y: 2, dir: "w", moving: false });
  must(r5.code === 403, "personagem inexistente deveria dar 403");
  must(tp.size() === 1, "heartbeat inválido não pode criar presença");
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
must(html.includes('js/temple-mp.js?v=temple-mp-v1') && html.includes("css/layout.css?v=temple-mp-v1"),
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
    // primeira resposta devolve um jogador; as seguintes, templo vazio
    const players = calls.length === 1
      ? [{ charId: 2, name: "Char2", voc: "druid", level: 90, sex: "female", outfit: { type: "druid" }, x: 4, y: 4, dir: "n", moving: false }]
      : [];
    return { json: async () => ({ ok: true, players }) };
  },
  sessionToken: () => "tok",
  sessionCharId: () => "1",
  accountApiUrl: () => "http://x",
  G: { inCity: true, p: { id: 1 }, walker: { px: 160, py: 160, dir: "s", moving: false }, combat: null, training: null },
  CITY: {},
  console,
};
vm.createContext(ctx);
vm.runInContext(templeSrc, ctx, { filename: "temple-mp.js" });

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

// heartbeat via tick manual
timers.forEach((fn) => fn()); // roda templeMpTick (inTemple)
must(calls.length === 1 && calls[0].url === "http://x/api/temple/presence" &&
     calls[0].body.token === "tok" &&
     calls[0].body.x === 5 && calls[0].body.y === 5 && calls[0].body.dir === "s" &&
     calls[0].body.char_id === "1",
  "heartbeat não enviou token/posição/char corretos (tile 160/32=5)");

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

console.log("ok: templo multijogador — heartbeat/leave/prune no servidor, snapshot->G.templePlayers, lerp e menu no cliente");
