/**
 * client-background.js — Módulo client_background (OTClient)
 *
 * Replicação completa do modules/client_background/background.lua:
 *   - Fundo com partículas que alternam entre 2 efeitos a cada 5s
 *   - Label de versão no canto inferior direito com fade-in
 *   - Mostra no login/esconde ao entrar no jogo
 *   - Retorna ao sair do jogo (onGameEnd)
 *
 * Dependências: client-background.css, game.js (lifecycle hooks)
 */
"use strict";

const BG = {
  /** Elemento DOM principal do fundo */
  el: null,
  /** Label de versão */
  versionLabel: null,
  /** Container de partículas */
  particlesEl: null,
  /** ID do timer de alternância de efeito */
  _loopId: null,
  /** Qual efeito está ativo agora (alterna: "fire" ↔ "arcane") */
  _toggle: true,
  /** Intervalo de alternância em ms (equivalente ao timeLoopBackgroundEffect) */
  LOOP_MS: 5000,
  /** Quantas partículas ativas ao mesmo tempo */
  PARTICLE_COUNT: 28,
  /** Duração da animação de cada partícula em ms */
  PARTICLE_DUR_MS: 9000,

  /**
   * init() — equivalente ao init() do background.lua
   * Chamado no carregamento do módulo (@onLoad).
   */
  init() {
    // Cria a camada de fundo (equivalente ao g_ui.displayUI('background'))
    this._buildDOM();

    // Label de versão (clientVersionLabel)
    this.versionLabel = document.getElementById("client-version-label");
    if (this.versionLabel) {
      this.versionLabel.textContent =
        "Global-Idle v1.0\n" +
        "Rev " + (typeof ASSET_VERSION !== "undefined" ? ASSET_VERSION : "?") +
        "\nBuilt on " + new Date().toISOString().slice(0, 10);
    }

    // Fade-in do label (equivalente a g_effects.fadeIn)
    if (!this._isGameActive()) {
      setTimeout(() => {
        if (this.versionLabel) this.versionLabel.classList.add("show");
      }, 400);
    }

    // Conecta aos eventos do jogo (equivalente aos connects do Lua)
    this._hookGameLifecycle();

    // Inicia o loop de efeitos (startBackgroundEffectLoop)
    this._startEffectLoop();

    console.log("[client_background] Módulo carregado — fundo + partículas ativos.");
  },

  /**
   * terminate() — equivalente ao terminate() do Lua
   * Chamado no @onUnload do módulo.
   */
  terminate() {
    this._stopEffectLoop();
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    if (this.versionLabel) {
      this.versionLabel.remove();
      this.versionLabel = null;
    }
    if (this.particlesEl) {
      this.particlesEl.remove();
      this.particlesEl = null;
    }
    this._unhookGameLifecycle();
    console.log("[client_background] Módulo descarregado.");
  },

  /**
   * hide() — esconde ao entrar no jogo (onGameStart)
   */
  hide() {
    if (this.el) this.el.style.display = "none";
    if (this.versionLabel) this.versionLabel.classList.remove("show");
    this._stopEffectLoop();
  },

  /**
   * show() — mostra ao sair do jogo (onGameEnd)
   */
  show() {
    if (this.el) this.el.style.display = "";
    if (!this._isGameActive()) {
      setTimeout(() => {
        if (this.versionLabel) this.versionLabel.classList.add("show");
      }, 400);
    }
    this._startEffectLoop();
  },

  /** Retorna o elemento DOM do fundo (getBackground()) */
  getBackground() { return this.el; },

  // ─── internals ──────────────────────────────────────────────

  _buildDOM() {
    // Panel background (id: background, anchors.fill parent)
    const bg = document.createElement("div");
    bg.id = "login-bg";

    // Grade decorativa
    const grid = document.createElement("div");
    grid.className = "bg-grid";

    // Partículas
    const particles = document.createElement("div");
    particles.id = "bg-particles";

    // Overlay escuro
    const overlay = document.createElement("div");
    overlay.id = "login-overlay";

    document.body.prepend(overlay);
    document.body.prepend(particles);
    document.body.prepend(grid);
    document.body.prepend(bg);

    this.el = bg;
    this.particlesEl = particles;
  },

  _startEffectLoop() {
    this._stopEffectLoop();
    this._spawnWave(); // primeira onda imediata
    this._loopId = setInterval(() => this._spawnWave(), this.LOOP_MS);
  },

  _stopEffectLoop() {
    if (this._loopId) {
      clearInterval(this._loopId);
      this._loopId = null;
    }
  },

  /** Alterna entre os dois efeitos e gera nova onda de partículas */
  _spawnWave() {
    if (!this.particlesEl) return;
    const cls = this._toggle ? "fire" : "arcane";
    this._toggle = !this._toggle; // alterna (como toggleState)

    // Remove partículas antigas demais
    const existentes = this.particlesEl.querySelectorAll(".bg-particle");
    if (existentes.length > 80) {
      for (let i = 0; i < 20; i++) {
        if (existentes[i]) existentes[i].remove();
      }
    }

    // Gera nova onda
    const count = this.PARTICLE_COUNT;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "bg-particle " + cls;
      p.style.left = (Math.random() * 94 + 3) + "%";
      p.style.top = (88 + Math.random() * 12) + "%";
      p.style.animationDuration = (this.PARTICLE_DUR_MS + Math.random() * 6000) + "ms";
      p.style.animationDelay = (Math.random() * 5000) + "ms";
      // variação de tamanho
      const sz = 2.5 + Math.random() * 3.5;
      p.style.width = sz + "px";
      p.style.height = sz + "px";
      frag.appendChild(p);
    }
    this.particlesEl.appendChild(frag);

    // Cleanup após animação
    setTimeout(() => {
      const all = this.particlesEl.querySelectorAll(".bg-particle");
      for (const p of all) {
        const style = getComputedStyle(p);
        if (parseFloat(style.opacity) < 0.05) p.remove();
      }
    }, this.PARTICLE_DUR_MS + 6000);
  },

  /** O jogo está rodando (caçada, treino, ou cidade)? */
  _isGameActive() {
    return !!(typeof G !== "undefined" && G &&
      (G.combat || G.training || G.inCity));
  },

  /** Conecta aos eventos do ciclo de vida do jogo */
  _hookGameLifecycle() {
    // onGameStart → hide()
    this._onGameStart = () => this.hide();
    this._onGameEnd = () => {
      // Pequeno delay para transição suave
      setTimeout(() => this.show(), 300);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("bg-game-start", this._onGameStart);
      window.addEventListener("bg-game-end", this._onGameEnd);
    }
  },

  _unhookGameLifecycle() {
    if (typeof window !== "undefined") {
      window.removeEventListener("bg-game-start", this._onGameStart);
      window.removeEventListener("bg-game-end", this._onGameEnd);
    }
  },
};

// Auto-init se estiver no browser
if (typeof document !== "undefined" && document.readyState !== "loading") {
  BG.init();
} else if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => BG.init());
}

// Exporta para o escopo global e módulo
if (typeof window !== "undefined") window.ClientBackground = BG;
if (typeof module !== "undefined" && module.exports) module.exports = BG;
