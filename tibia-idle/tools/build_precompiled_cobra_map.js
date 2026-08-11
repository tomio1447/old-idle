#!/usr/bin/env node
/* build_precompiled_cobra_map.js
 * Gera o mapa pré-compilado da Cobra Bastion a partir do OTBM oficial.
 * Uso: node tibia-idle/tools/build_precompiled_cobra_map.js
 * Saída: tibia-idle/game/js/cobra-bastion-map.js (HUNTMAPS pré-compilado)
 *
 * Preserva exatamente:
 *  - dimensões 24×17, z=2
 *  - source bounds minX=146 minY=155 maxX=169 maxY=171
 *  - spawn global (157,165,2) -> runtime (11,10)
 *  - zona global x=154 y=160 w=10 h=12 z=2 -> 120 posições
 *  - todas as 157 sprites, leg, footprintBlocked, rows, otbm flag
 */
"use strict";
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const GAME = path.join(ROOT, 'tibia-idle', 'game');
const JS = path.join(GAME, 'js');
const OTBM_PATH = path.join(GAME, 'maps', 'cobra_bastion.otbm');
const BETA_PATH = path.join(GAME, 'beta-maps', 'cobra_bastion.otbm');
const TILEFLAGS_PATH = path.join(JS, 'tileflags.js');
const OTBM_JS_PATH = path.join(JS, 'otbm.js');
const OTBHUNT_JS_PATH = path.join(JS, 'otbmhunt.js');

function loadTileflags() {
  const code = fs.readFileSync(TILEFLAGS_PATH, 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.window.TILEFLAGS || ctx.TILEFLAGS;
}
function loadOtbm() {
  // require cache clear for determinism
  delete require.cache[require.resolve(OTBM_JS_PATH)];
  return require(OTBM_JS_PATH);
}

function main() {
  const otbmBuf = fs.readFileSync(OTBM_PATH);
  const betaBuf = fs.readFileSync(BETA_PATH);
  if (!otbmBuf.equals(betaBuf)) {
    console.error('ERRO: beta-maps/cobra_bastion.otbm != maps/cobra_bastion.otbm');
    process.exit(1);
  }
  const sha256 = crypto.createHash('sha256').update(otbmBuf).digest('hex');
  const expected = '50c5efeb87bb0c4a95433f347c643232381afd130b78a162672a786739ef47e0';
  if (sha256 !== expected) {
    console.warn(`[warn] SHA mismatch: got ${sha256} expected ${expected} — OTBM foi atualizado?`);
  }
  console.log(`[gen] OTBM SHA256 ${sha256}`);

  const TILEFLAGS = loadTileflags();
  const OTBM = loadOtbm();

  let map = OTBM.read(otbmBuf);
  console.log(`[gen] OTBM lido: w=${map.w} h=${map.h} z=${map.z} cells=${Object.keys(map.cells).length} sourceBounds=${JSON.stringify(map.sourceBounds)}`);
  if (map.w !== 24 || map.h !== 17 || map.z !== 2) throw new Error(`dimensão/andar inesperado w=${map.w} h=${map.h} z=${map.z}`);
  if (map.sourceBounds.minX !== 146 || map.sourceBounds.minY !== 155 || map.sourceBounds.maxX !== 169 || map.sourceBounds.maxY !== 171) {
    throw new Error(`sourceBounds inesperado ${JSON.stringify(map.sourceBounds)}`);
  }

  const hunt = {
    otbmSpawn: { x: 157, y: 165, z: 2 },
    otbmMobBounds: { x: 154, y: 160, w: 10, h: 12, z: 2 },
  };
  const otbmhuntCode = fs.readFileSync(OTBHUNT_JS_PATH, 'utf8');
  const start = otbmhuntCode.indexOf('function applyHuntOtbmZones');
  const end = otbmhuntCode.indexOf('\n\n/* Garante', start);
  const ctx2 = { console };
  vm.createContext(ctx2);
  vm.runInContext(otbmhuntCode.slice(start, end), ctx2);
  ctx2.applyHuntOtbmZones(map, hunt);
  console.log(`[gen] após zonas: spawn=${JSON.stringify(map.spawn)} mob=${map.mob.length}`);
  if (map.spawn.x !== 11 || map.spawn.y !== 10 || map.mob.length !== 120) throw new Error('spawn/mob inesperado após applyHuntOtbmZones');

  const hm = OTBM.huntMapFromOtbm(map, TILEFLAGS);
  console.log(`[gen] huntMap: ${hm.rows.length}x${hm.rows[0].length} spawn=${JSON.stringify(hm.spawn)} mob=${hm.mob.length} leg=${Object.keys(hm.leg).length} footprint=${Object.keys(hm.footprintBlocked||{}).length}`);
  if (hm.rows.length !== 17 || hm.rows[0].length !== 24) throw new Error('rows 24x17 esperado');
  if (hm.spawn.x !== 11 || hm.spawn.y !== 10) throw new Error('spawn 11,10 esperado');
  if (hm.mob.length !== 120) throw new Error('120 mobs esperado');
  const visualIds = new Set();
  Object.values(hm.leg).forEach(e => {
    (e.v||[]).forEach(id=>visualIds.add(id));
    (e.g||[]).forEach(id=>visualIds.add(id));
  });
  console.log(`[gen] tiles distintos: ${visualIds.size}`);
  if (visualIds.size !== 157) throw new Error(`157 tiles esperado, got ${visualIds.size}`);

  // Gera JS determinístico
  // Remove alias duplicado "legenda" do payload JSON; será reconstruído como _hm.legenda = _hm.leg em JS
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
  // Ordena chaves para determinismo (JSON.stringify já ordena por inserção; leg já determinística)
  // Mas garantimos que rows e leg estejam estáveis
  const serialized = JSON.stringify(payload, null, 2);

  const outPath = path.join(JS, 'cobra-bastion-map.js');
  const header = `/* cobra-bastion-map.js — GERADO por tibia-idle/tools/build_precompiled_cobra_map.js
 * NÃO EDITE MANUALMENTE. Rode \`node tibia-idle/tools/build_precompiled_cobra_map.js\` após
 * atualizar game/maps/cobra_bastion.otbm ou game/beta-maps/cobra_bastion.otbm.
 *
 * OTBM SHA256: ${sha256}
 * Fonte: tibia-idle/game/maps/cobra_bastion.otbm (24×17 z=2, bounds 146,155,169,171)
 * Spawn global (157,165,2) -> local (11,10), mobs 120, sprites 157
 */
"use strict";
/* eslint-disable */
// HUNTMAPS definido em huntmapdata.js — este arquivo só registra o pré-compilado
if (typeof HUNTMAPS === "undefined" && typeof window !== "undefined" && !window.HUNTMAPS) window.HUNTMAPS = {};
if (typeof HUNTMAPS === "undefined" && typeof globalThis !== "undefined" && !globalThis.HUNTMAPS) globalThis.HUNTMAPS = {};
`;

  const content = header + `
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
`;

  // Escreve deterministicamente (LF, sem BOM)
  fs.writeFileSync(outPath, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log(`[gen] escrito ${outPath} (${content.length} bytes) SHA ${sha256}`);
  console.log('OK: pré-compilado gerado determinísticamente');
}

main();
