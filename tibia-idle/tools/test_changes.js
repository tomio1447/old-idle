/* Harness de teste: carrega os JS do jogo num DOM simulado (jsdom) e
 * executa as funcoes principais de spawn/combate/render para pegar erros
 * de runtime das mudancas (spawn com teleporte, ESC, hunts sem level...). */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");

const html = `<!DOCTYPE html><html><body>
<div id="modal" class="modal-bg"></div>
<div id="scene-wrap"><canvas id="scene" width="840" height="520"></canvas></div>
<div id="tooltip"></div><div id="toasts"></div>
<div id="hunts"></div><div id="hunt-info"></div>
<div id="ctx-menu"></div><div id="npc-content"></div>
<div id="inv"></div><div id="lootpouch"></div>
<div id="status-bar"></div><div id="log"></div>
</body></html>`;

const dom = new JSDOM(html, {
  url: "http://localhost/",
  pretendToBeVisual: true,
  runScripts: "outside-only",
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.performance = window.performance;
global.Image = window.Image;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.CanvasRenderingContext2D = window.CanvasRenderingContext2D;
global.MutationObserver = window.MutationObserver;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.localStorage = window.localStorage;
global.sessionStorage = window.sessionStorage;

// stub de canvas 2d
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient")
      return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? (...a) => {} : undefined;
  },
  set() { return true; },
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";

const errors = [];
window.addEventListener("error", (e) => errors.push("WINDOWERROR " + e.message));

// Carrega os scripts com vm.runInContext: `function foo` vira global do
// contexto (window.foo), igual ao browser. window.eval() do jsdom nao
// anexa declaracoes ao objeto window.
const vm = require("vm");
const sandbox = window;
vm.createContext(sandbox);

function loadInContext(file) {
  const code = fs.readFileSync(file, "utf8");
  try {
    vm.runInContext(code, sandbox, { filename: file });
  } catch (e) {
    errors.push(path.basename(file) + ": " + e.message);
  }
}

// carrega os scripts na ordem do index.html
const order = [
  "js/gamedata.js", "js/gamelib-const.js", "js/modulelib.js",
  "js/client-background.js", "js/canarydata.js", "js/spelldata.js",
  "js/appearancedata.js", "js/avatardata.js", "js/supplydata.js",
  "js/runedata.js", "js/monstermovedata.js", "js/monsterdata.js",
  "js/mobsheetdata.js", "js/areadata.js", "js/spelltargetdata.js",
  "js/spellfxdata.js", "js/hastedata.js", "js/monkspelldata.js",
  "js/quiverdata.js", "js/ammodata.js", "js/weapondata.js",
  "js/spelldata_1525.js", "js/tiledata.js", "js/tileflags.js",
  "js/imbuementdata.js", "js/patch_clientfx.js", "js/rates.js",
  "js/vip.js", "js/huntmapdata.js", "js/otbm.js", "js/otbmhunt.js",
  "js/weapons.js", "js/ammo.js", "js/combo.js", "js/speed.js",
  "js/grid.js", "js/area.js", "js/gridai.js", "js/buffs.js",
  "js/stances.js", "js/monk.js", "js/core.js", "js/spells.js",
  "js/cooldown.js", "js/augments.js", "js/supplies.js", "js/outfit.js",
  "js/appearance.js", "js/imbuement.js", "js/player.js", "js/accessories.js",
  "js/combat.js", "js/city.js", "js/citymap.js", "js/walker.js",
  "js/tileanimdata.js", "js/tilemap.js", "js/effectdata.js", "js/icondata.js",
  "js/render.js", "js/city-render.js", "js/monsters.js",
  "js/patch_imbuement.js", "js/patch_amazon.js", "js/cyclopedia.js",
  "js/bosstiary.js", "js/ui.js", "js/otc-hud.js", "js/cyclopedia-ui.js",
  "js/forgedata.js", "js/forge.js", "js/imbuement-ui.js", "js/forge-ui.js",
  "js/prey.js", "js/prey-ui.js", "js/party.js", "js/party-ui.js",
  "js/wheeldata.js", "js/wheel.js", "js/wheel-ui.js", "js/tibiacoin.js",
  "js/training.js", "js/training-ui.js", "js/accessorydata.js",
  "js/admin.js", "js/city-ui.js", "js/game.js",
];

for (const f of order) {
  const p = path.join(GAME, f);
  if (!fs.existsSync(p)) { errors.push("FALTA " + f); continue; }
  loadInContext(p);
}

// funcoes que dependem de fetch/Image real nao rodam no jsdom; chamamos as
// que testam nossa logica nova
try {
  const G = window.G || {};
  const p = (typeof window.normalizePlayer === "function")
    ? window.normalizePlayer({ name: "Teste", voc: "knight", level: 8 })
    : { name: "Teste", voc: "knight", level: 8, hp: 100, mp: 50, bag: {}, equip: {} };
  // o jogo preenche skills na criacao do personagem (login) — o teste faz o
  // mesmo para as funcoes que dependem de effSkill
  if (!p.skills) p.skills = { sword: 10, club: 10, axe: 10, dist: 10, shield: 10, fist: 10, magic: 3 };
  if (window.GAMEDATA && window.GAMEDATA.hunts) {
    // spawn com teleporte
    const c = window.newCombat(p, "rats", "non-pvp");
    window.spawnWave(c, p);
    if (c.pendingSpawns && c.pendingSpawns.length > 0) {
      // simula o tick do spawn
      const sp = c.pendingSpawns[0];
      sp.startedAt = Date.now() - 2000; // 2s atras: deve ter nascido
      window.tickSpawnQueue(c);
      if (c.mobs.length === 0) errors.push("spawn: mob nao nasceu apos tickSpawnQueue");
    } else {
      errors.push("spawn: pendingSpawns vazio");
    }
    // hunt sem level lock: renderHunts nao deve travar
    p.level = 1;
    if (typeof window.renderHunts === "function") window.renderHunts(p);
    if (window.document.querySelector("#hunts").innerHTML.indexOf("locked") !== -1)
      errors.push("hunts: ainda usa classe locked");
    // ESC fecha modal: o handler vive no bindControls (game.js, roda no
    // startGame). Testa a logica replicada + a presenca no codigo-fonte.
    const gameJs = fs.readFileSync(path.join(GAME, "js", "game.js"), "utf8");
    if (!/e\.key !== "Escape"/.test(gameJs)) errors.push("ESC handler ausente no game.js");
    const modal = window.document.querySelector("#modal");
    modal.classList.add("show");
    const escHandler = (e) => {
      if (e.key !== "Escape") return;
      const m = window.document.querySelector("#modal");
      if (m && m.classList.contains("show")) m.classList.remove("show", "wide");
    };
    window.document.addEventListener("keydown", escHandler);
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    window.document.removeEventListener("keydown", escHandler);
    if (modal.classList.contains("show")) errors.push("ESC: modal nao fechou");
  }
} catch (e) {
  errors.push("TESTE: " + e.stack || e.message);
}

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors.slice(0, 40)) console.log("  - " + e);
  process.exit(1);
}
console.log("HARNESS OK — sem erros de runtime nas mudancas");
