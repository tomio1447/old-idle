/**
 * modulelib.js — Module Library System (OTClient modulelib/)
 *
 * Fornece a infraestrutura que os módulos OTClient usam:
 *   - controller.lua  → event-driven controller pattern
 *   - watchlist.lua   → reactive data watching
 *   - eventcontroller → centralized event dispatch
 *
 * No OTClient, esses sistemas permitem que módulos se comuniquem sem
 * acoplamento direto. Aqui implementamos o núcleo necessário para:
 *   - conectar/desconectar callbacks em eventos do jogo
 *   - assistir mudanças em dados do personagem
 *   - despachar eventos entre módulos (cross-module)
 */
"use strict";

/** Event Controller: registro central de callbacks */
const ModuleEvents = {
  _listeners: {},

  /** Registra um callback para um evento */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  },

  /** Remove um callback */
  off(event, fn) {
    const ls = this._listeners[event];
    if (!ls) return;
    const i = ls.indexOf(fn);
    if (i >= 0) ls.splice(i, 1);
  },

  /** Dispara evento para todos os ouvintes */
  emit(event, ...args) {
    const ls = this._listeners[event];
    if (!ls) return;
    for (const fn of ls.slice()) {
      try { fn(...args); } catch (e) { console.warn("[modulelib] event error:", event, e); }
    }
  },

  /** Limpa todos os listeners de um evento */
  clear(event) {
    if (event) delete this._listeners[event];
    else this._listeners = {};
  },
};

/** WatchList: observa mudanças em objetos */
const WatchList = {
  _watchers: [],

  /** Cria um watcher que chama fn quando o valor muda */
  watch(getter, fn, intervalMs) {
    let last = undefined;
    const id = setInterval(() => {
      const cur = getter();
      if (cur !== last) {
        fn(cur, last);
        last = cur;
      }
    }, intervalMs || 500);
    this._watchers.push(id);
    return id;
  },

  /** Remove um watcher */
  unwatch(id) {
    clearInterval(id);
    this._watchers = this._watchers.filter((w) => w !== id);
  },

  clear() {
    for (const id of this._watchers) clearInterval(id);
    this._watchers = [];
  },
};

/** Controller: base para módulos MVC */
class ModuleController {
  constructor(name) {
    this.name = name;
    this._hooks = [];
  }

  /** Registra callbacks de ciclo de vida */
  onGameStart(fn) {
    ModuleEvents.on("game:start", fn);
    this._hooks.push(() => ModuleEvents.off("game:start", fn));
  }

  onGameEnd(fn) {
    ModuleEvents.on("game:end", fn);
    this._hooks.push(() => ModuleEvents.off("game:end", fn));
  }

  onPlayerChange(fn) {
    ModuleEvents.on("player:change", fn);
    this._hooks.push(() => ModuleEvents.off("player:change", fn));
  }

  /** Remove todos os hooks deste controller */
  destroy() {
    for (const unhook of this._hooks) unhook();
    this._hooks = [];
  }
}

/** Integração com o ciclo de vida do jogo */
function moduleLifecycleStart() {
  ModuleEvents.emit("game:start");
}

function moduleLifecycleEnd() {
  ModuleEvents.emit("game:end");
}

function modulePlayerChange(player) {
  ModuleEvents.emit("player:change", player);
}

// ── Export
if (typeof window !== "undefined") {
  window.ModuleLib = { ModuleEvents, WatchList, ModuleController,
    moduleLifecycleStart, moduleLifecycleEnd, modulePlayerChange };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { ModuleEvents, WatchList, ModuleController,
    moduleLifecycleStart, moduleLifecycleEnd, modulePlayerChange };
}
