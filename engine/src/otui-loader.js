/**
 * otui-loader.js — Carregador de módulos OTUI para a engine Node.js
 *
 * Inspirado no sistema de módulos do OTClient (modules/), este carregador
 * permite que a engine leia arquivos .otmod (manifestos) e os scripts Lua
 * correspondentes, traduzindo-os para o contexto JavaScript da engine.
 *
 * Fluxo:
 *   1. Lê o .otmod (manifesto JSON-like) → nome, dependências, scripts
 *   2. Carrega os scripts Lua listados (parse + execute via lua2js)
 *   3. Registra os callbacks do módulo (onLoad/onUnload)
 *   4. Expõe as funções para o protocolo de rede
 *
 * Estrutura de um .otmod:
 *   Module
 *     name: game_prey
 *     description: "Preys..."
 *     sandboxed: true
 *     scripts: [ prey ]
 *     dependencies: [ client_topmenu ]
 *     @onLoad: init()
 *     @onUnload: terminate()
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** Módulos carregados: nome -> { config, exports, loaded } */
const loadedModules = new Map();

/**
 * Registra um módulo manualmente (para módulos sem .otmod, como o prey).
 * @param {string} name - Nome do módulo (ex: "game_prey")
 * @param {object} exports - Funções expostas pelo módulo
 */
function registerModule(name, exports) {
  if (loadedModules.has(name)) {
    console.warn(`[otui] Módulo "${name}" já registrado — substituindo.`);
  }
  loadedModules.set(name, {
    config: { name, description: "", dependencies: [], sandboxed: true },
    exports,
    loaded: true,
  });
  console.log(`[otui] Módulo "${name}" registrado.`);
}

/**
 * Retorna as exportações de um módulo carregado.
 */
function getModule(name) {
  const m = loadedModules.get(name);
  return m ? m.exports : null;
}

/**
 * Lista todos os módulos carregados.
 */
function listModules() {
  const out = [];
  for (const [name, m] of loadedModules) {
    out.push({
      name,
      description: m.config.description,
      dependencies: m.config.dependencies,
      loaded: m.loaded,
    });
  }
  return out;
}

module.exports = {
  registerModule,
  getModule,
  listModules,
  loadedModules,
};
