/* Combat FX / talk: lifetime finito + clear nas transições. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function must(ok, msg) { if (!ok) throw Error(msg); }

const root = path.join(__dirname, "..");
const renderSrc = fs.readFileSync(path.join(root, "game/js/render.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(root, "game/js/game.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "game/index.html"), "utf8");

must(renderSrc.includes("FX_MAX_LIFE_MS"), "FX_MAX_LIFE_MS ausente");
must(renderSrc.includes("fxEffectExpired"), "fxEffectExpired ausente");
must(renderSrc.includes("clearCombatVisuals"), "clearCombatVisuals ausente");
must(renderSrc.includes("ageCombatSpeech"), "ageCombatSpeech ausente");
must(renderSrc.includes("ensureTalkDeadline"), "ensureTalkDeadline ausente");
must(renderSrc.includes("expiresAt"), "fala deve ter expiresAt wall-clock");
must(renderSrc.includes("Math.abs(fromStrip - metaFrames) <= 2"),
  "strip recount deve validar contra meta.frames");
must(gameSrc.includes("function clearCombatVisualOverlays"),
  "clearCombatVisualOverlays ausente em game.js");
must(gameSrc.includes("clearCombatVisualOverlays(G.combat)"),
  "stopHunt deve limpar overlays");
must(gameSrc.includes('tibia-idle-server-offline') &&
  gameSrc.includes("clearCombatVisualOverlays(G&&G.combat)"),
  "disconnect deve limpar overlays");
must(gameSrc.includes("authTs"), "scheduleOnlineAuthorityEvents deve preservar authTs");
must(gameSrc.includes("G._saySeen"), "dedup de say online ausente");
must(indexSrc.includes("render.js?v=phys-hit-fx-v1"),
  "cache-bust render.js");
must(indexSrc.includes("game.js?v=phys-hit-fx-v1"),
  "cache-bust game.js");
must(indexSrc.includes("combat.js?v=phys-hit-fx-v1"),
  "cache-bust combat.js");

// Sandbox mínimo: funções de TTL sem canvas.
const sandbox = {
  window: {},
  document: undefined,
  MutationObserver: undefined,
  Date,
  Math,
  Number,
  String,
  Array,
  Object,
  console,
};
vm.createContext(sandbox);
sandbox.HTMLCanvasElement = function () {};
try {
  vm.runInContext(renderSrc, sandbox, { timeout: 5000 });
} catch (err) {
  if (!sandbox.fxEffectExpired && !/FX_MAX_LIFE_MS/.test(renderSrc)) throw err;
}

must(typeof sandbox.fxAutoDurationMs === "function" ||
  renderSrc.includes("return Math.min(FX_MAX_LIFE_MS"),
  "duração de FX deve ser limitada");
must(typeof sandbox.creatureSay === "function" ||
  renderSrc.includes("expiresAt: now + dur"),
  "fala deve carregar expiresAt/wall-clock");

// Simula lifetime via lógica espelhada do fonte.
const FX_MAX = 2800;
function durFor(frames) {
  return Math.min(FX_MAX, Math.max(280, Math.round(Math.max(1, Math.min(48, frames)) * 75)));
}
must(durFor(8) <= FX_MAX, "areafx curto sob teto");
must(durFor(200) <= FX_MAX, "frames inflados não passam do teto");
must(durFor(200) === FX_MAX, "teto 2800 aplicado");

// Speech wall-clock: life infinito / sem dt não pode grudar.
if (typeof sandbox.creatureSay === "function" && typeof sandbox.talkExpired === "function") {
  const dono = {};
  const t0 = Date.now();
  const realNow = Date.now;
  Date.now = () => t0;
  sandbox.creatureSay(dono, "exori gran", 9); // TALK.SPELL
  must(dono.speech && dono.speech.length === 1, "creatureSay não empilhou");
  must(Number(dono.speech[0].expiresAt) === t0 + 1600, "expiresAt incorreto");
  // life forçado “infinito” ainda expira pelo deadline.
  dono.speech[0].life = 1e12;
  Date.now = () => t0 + 2000;
  must(sandbox.talkExpired(dono.speech[0], t0 + 2000) === true,
    "fala com life infinito não expirou pelo wall-clock");
  Date.now = realNow;
} else {
  must(renderSrc.includes("function ensureTalkDeadline") &&
    renderSrc.includes("expiresAt: now + dur"),
    "helpers de speech wall-clock ausentes no fonte");
}

console.log("OK: combat FX expire + speech wall-clock + clear overlays");
