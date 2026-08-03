/**
 * otui-loader.js — Carregador de módulos OTUI para a engine Node.js
 * Inspirado no sistema de módulos do OTClient (modules/).
 * Registra módulos por nome e gerencia dependências.
 */
"use strict";
const loadedModules = new Map();
function registerModule(name, exports) {
  if (loadedModules.has(name)) console.warn(`[otui] Módulo "${name}" já registrado.`);
  loadedModules.set(name, { config: { name, description: "", dependencies: [], sandboxed: true }, exports, loaded: true });
}
function getModule(name) { const m = loadedModules.get(name); return m ? m.exports : null; }
function listModules() { return Array.from(loadedModules.entries()).map(([n,m]) => ({ name: n, description: m.config.description, loaded: m.loaded })); }
module.exports = { registerModule, getModule, listModules, loadedModules };
