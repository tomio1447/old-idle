#!/usr/bin/env node
/*
 * Gera o hunt map pré-compilado da Cobra Bastion a partir do OTBM oficial.
 *
 * Uso:
 *   node tibia-idle/tools/buildprecompiled_cobra_map.js
 *
 * A formatação do arquivo de saída faz parte do contrato: além de conferir
 * os dados do mapa, o gerador valida o SHA-256 determinístico do JavaScript.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const GAME = path.join(ROOT, "tibia-idle", "game");
const JS = path.join(GAME, "js");
const MAP_PATH = path.join(GAME, "maps", "cobra_bastion.otbm");
const BETA_PATH = path.join(GAME, "beta-maps", "cobra_bastion.otbm");
const OUTPUT_PATH = path.join(JS, "cobra-bastion-map.js");
const SOURCE_SHA256 = "50c5efeb87bb0c4a95433f347c643232381afd130b78a162672a786739ef47e0";
const OUTPUT_SHA256 = "f0c0c23cf1ee29767e648089de98117aa95556cd00014029c21224f4ad453264";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function loadTileFlags() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(JS, "tileflags.js"), "utf8"), context,
    { filename: "tileflags.js" });
  return context.window.TILEFLAGS;
}

function loadApplyHuntOtbmZones() {
  const source = fs.readFileSync(path.join(JS, "otbmhunt.js"), "utf8");
  const start = source.indexOf("function applyHuntOtbmZones");
  const end = source.indexOf("\n\n/* Garante", start);
  if (start < 0 || end < 0) throw new Error("applyHuntOtbmZones não encontrada em otbmhunt.js");

  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context, { filename: "otbmhunt.js" });
  return context.applyHuntOtbmZones;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildOutput(hm, sourceHash) {
  // `legenda` é o mesmo objeto que `leg`. Não duplique esse alias no JSON.
  const payload = {
    rows: hm.rows,
    leg: hm.leg,
    nome: hm.nome || hm.name || "Cobra Bastion",
    footprintBlocked: hm.footprintBlocked || {},
    spawn: hm.spawn,
    mob: hm.mob,
    mobSet: hm.mobSet,
    otbm: true,
  };
  const serialized = JSON.stringify(payload, null, 2);

  // O texto deste cabeçalho é mantido estável para preservar o checksum
  // publicado do artefato cobra-loading-v4.
  const header = `/* cobra-bastion-map.js — GERADO por tibia-idle/tools/build_precompiled_cobra_map.js
 * NÃO EDITE MANUALMENTE. Rode \`node tibia-idle/tools/build_precompiled_cobra_map.js\` após
 * atualizar game/maps/cobra_bastion.otbm ou game/beta-maps/cobra_bastion.otbm.
 *
 * OTBM SHA256: ${sourceHash}
 * Fonte: tibia-idle/game/maps/cobra_bastion.otbm (24×17 z=2, bounds 146,155,169,171)
 * Spawn global (157,165,2) -> local (11,10), mobs 120, sprites 157
 */
"use strict";
/* eslint-disable */
// HUNTMAPS definido em huntmapdata.js — este arquivo só registra o pré-compilado
if (typeof HUNTMAPS === "undefined" && typeof window !== "undefined" && !window.HUNTMAPS) window.HUNTMAPS = {};
if (typeof HUNTMAPS === "undefined" && typeof globalThis !== "undefined" && !globalThis.HUNTMAPS) globalThis.HUNTMAPS = {};
`;

  return (header + `
(function(){
  const _hm = ${serialized};
  // Alias reconstruível: legenda aponta para leg sem duplicar payload JSON
  _hm.legenda = _hm.leg;
  const _target = (typeof HUNTMAPS !== "undefined" ? HUNTMAPS : (typeof window !== "undefined" ? window.HUNTMAPS : globalThis.HUNTMAPS));
  _target["otbm:cobra_bastion"] = _hm;
  _target["cobra-bastion"] = _hm;
  const _cache = (typeof OTBM_HUNT_CACHE !== "undefined" ? OTBM_HUNT_CACHE : (typeof window !== "undefined" ? window.OTBM_HUNT_CACHE : (typeof globalThis !== "undefined" ? globalThis.OTBM_HUNT_CACHE : null)));
  if (_cache) _cache["cobra_bastion"] = "otbm:cobra_bastion";
  if (typeof window !== "undefined") window.COBRA_BASTION_PRECOMPILED = _hm;
})();
`).replace(/\r\n/g, "\n");
}

function main() {
  const source = fs.readFileSync(MAP_PATH);
  const beta = fs.readFileSync(BETA_PATH);
  assert(source.length === 5613, `cobra_bastion.otbm deveria ter 5613 bytes, tem ${source.length}`);
  assert(source.equals(beta), "maps/cobra_bastion.otbm difere de beta-maps/cobra_bastion.otbm");

  const sourceHash = sha256(source);
  assert(sourceHash === SOURCE_SHA256,
    `SHA-256 do OTBM inesperado: ${sourceHash} (esperado ${SOURCE_SHA256})`);

  const OTBM = require(path.join(JS, "otbm.js"));
  const map = OTBM.read(source);
  const bounds = map.sourceBounds || {};
  assert(map.w === 24 && map.h === 17 && map.z === 2,
    `mapa fonte inesperado: ${map.w}×${map.h} z=${map.z}`);
  assert(bounds.minX === 146 && bounds.minY === 155 &&
         bounds.maxX === 169 && bounds.maxY === 171,
    `sourceBounds inesperado: ${JSON.stringify(bounds)}`);

  loadApplyHuntOtbmZones()(map, {
    otbmSpawn: { x: 157, y: 165, z: 2 },
    otbmMobBounds: { x: 154, y: 160, w: 10, h: 12, z: 2 },
  });
  assert(map.spawn && map.spawn.x === 11 && map.spawn.y === 10,
    `spawn local inesperado: ${JSON.stringify(map.spawn)}`);
  assert(map.mob && map.mob.length === 120,
    `zona de mobs deveria conter 120 posições, contém ${map.mob && map.mob.length}`);

  const hm = OTBM.huntMapFromOtbm(map, loadTileFlags());
  const spriteIds = new Set();
  Object.values(hm.leg).forEach((entry) => {
    (entry.v || []).forEach((id) => spriteIds.add(id));
    (entry.g || []).forEach((id) => spriteIds.add(id));
  });

  assert(hm.rows.length === 17 && hm.rows.every((row) => row.length === 24),
    "rows do hunt map não são 24×17");
  assert(hm.spawn.x === 11 && hm.spawn.y === 10, "spawn runtime não é 11,10");
  assert(hm.mob.length === 120 && Object.keys(hm.mobSet).length === 120,
    "zona runtime não contém 120 mobs");
  assert(Object.keys(hm.leg).length === 199,
    `leg deveria conter 199 entradas, contém ${Object.keys(hm.leg).length}`);
  assert(Object.keys(hm.footprintBlocked).length === 170,
    `footprintBlocked deveria conter 170 entradas, contém ${Object.keys(hm.footprintBlocked).length}`);
  assert(hm.otbm === true, "flag otbm não foi preservada");
  assert(spriteIds.size === 157,
    `hunt map deveria usar 157 sprites, usa ${spriteIds.size}`);

  const output = buildOutput(hm, sourceHash);
  const outputHash = sha256(output);
  assert(outputHash === OUTPUT_SHA256,
    `saída não determinística: ${outputHash} (esperado ${OUTPUT_SHA256})`);
  fs.writeFileSync(OUTPUT_PATH, output, "utf8");

  console.log(`OK: Cobra Bastion 24×17, spawn 11,10, 120 mobs, 157 sprites; SHA ${outputHash}`);
}

main();
