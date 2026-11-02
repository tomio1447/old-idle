/*
 * admin-spectate.js — modo espectador do GM (WATCH / FOLLOW / RAID).
 *
 * O servidor devolve o estado vivo da instância alvo (players + mobs +
 * grid) e um Renderer próprio desenha a cena num canvas do painel. O GM
 * NUNCA entra no estado autoritativo: não ataca, não recebe dano, não
 * bloqueia caminhos e não pode ser alvo — para o servidor ele não existe.
 *
 * WATCH/FOLLOW/RAID: o avatar do GM é um fantasma client-side (ghost) que
 * anda pela cena com WASD/setas/clique — posição local, nunca enviada.
 * No WATCH ele aparece como espectador ao lado do alvo.
 */
"use strict";

const ADMIN_SPEC = {
  active: false,
  mode: "watch",            // "watch" | "follow" | "raid"
  charName: "",
  instanceId: "",
  targetId: "",
  combat: null,
  renderer: null,
  canvas: null,
  pollTimer: 0,
  rafId: 0,
  lastPollAt: 0,
  error: "",
  ghost: null,              // {p,x,y,dir,tx,ty}
  keys: Object.create(null),
};

/* Estado da instância -> objeto no formato que Renderer.draw entende. */
function adminSpecBuildCombat(instance, ghostP) {
  const state = instance && instance.state;
  if (!state || typeof state !== "object") return null;
  const players = (Array.isArray(state.players) ? state.players : [])
    .filter((e) => e && e.p)
    .map((e) => ({
      id: e.id, p: e.p, hp: e.hp, mp: e.mp,
      x: Number(e.x) || 0.5, y: Number(e.y) || 0.5,
      cx: e.cx, cy: e.cy, dir: e.dir || "e",
      reviveAt: e.reviveAt, permadead: e.permadead,
    }));
  const mobs = (Array.isArray(state.mobs) ? state.mobs : [])
    .filter((m) => m && m.hp > 0)
    .map((m) => Object.assign({}, m));
  const combat = {
    spectate: true,
    players, mobs,
    gridW: Number(state.gridW) || 30,
    gridH: Number(state.gridH) || 30,
    huntId: instance.huntId || null,
    bossId: instance.bossId || null,
    hunt: (state.hunt && typeof state.hunt === "object" && state.hunt.scene)
      ? state.hunt : (instance.huntId && typeof GAMEDATA !== "undefined"
        && GAMEDATA.hunts && GAMEDATA.hunts[instance.huntId]
        ? GAMEDATA.hunts[instance.huntId] : null),
    huntMap: (state.huntMap && typeof state.huntMap === "object") ? state.huntMap : null,
    boss: instance.bossId ? { slug: instance.bossId, worldBoss: !!instance.worldBoss } : null,
    events: [],
  };
  // Fantasma do GM — client-side apenas. Renderiza como aliado, some do
  // servidor: não ataca, não toma dano, não bloqueia, não é alvo.
  if (ghostP && ADMIN_SPEC.ghost) {
    const g = ADMIN_SPEC.ghost;
    combat.players.push({ id: "gm-ghost", p: ghostP, x: g.x, y: g.y,
      cx: Math.round(g.x * combat.gridW), cy: Math.round(g.y * combat.gridH),
      dir: g.dir, ghost: true, moving: g.moving, frame: g.frame });
  }
  return combat;
}

function adminSpecGhostP() {
  // Clone leve do char admin — o Renderer precisa de outfit/sex/voc e de
  // hp>0 para desenhar; o objeto original NÃO é tocado.
  const src = (typeof G !== "undefined" && G && G.p) || {};
  const ghostP = {
    id: "gm-ghost", name: src.name || "ADM", voc: src.voc || "knight",
    level: Number(src.level) || 8, exp: 0, sex: src.sex || "male",
    outfit: src.outfit ? JSON.parse(JSON.stringify(src.outfit)) : null,
    wardrobe: null, promoted: !!src.promoted,
    hp: 1, mp: 1, skills: Object.assign({}, src.skills || {}),
    ml: 0, conditions: {}, gamemaster: true, specGhost: true,
  };
  // Barra de HP cheia no espectador (1/x ficaria visualmente "morrendo").
  const mx = (typeof maxStats === "function") ? maxStats(ghostP) : null;
  ghostP.hp = Math.max(1, Math.floor((mx && mx.hp) || 100));
  ghostP.mp = Math.max(0, Math.floor((mx && mx.mp) || 0));
  return ghostP;
}

async function adminSpecFetch() {
  if (!ADMIN_SPEC.active) return;
  const token = typeof sessionToken === "function" ? sessionToken() : "";
  if (!token) return;
  let url = "/api/admin/spectate?";
  if (ADMIN_SPEC.charName) url += "char=" + encodeURIComponent(ADMIN_SPEC.charName);
  else url += "instance=" + encodeURIComponent(ADMIN_SPEC.instanceId);
  try {
    const r = await _api("GET", url, null, token);
    if (!r.data || !r.data.ok) {
      ADMIN_SPEC.error = (r.data && r.data.msg) || "Combate não encontrado";
      const info = document.getElementById("spec-info");
      if (info) info.textContent = ADMIN_SPEC.error;
      return;
    }
    ADMIN_SPEC.error = "";
    const inst = r.data.instance;
    const ghostP = ADMIN_SPEC.ghost ? adminSpecGhostP() : null;
    ADMIN_SPEC.combat = adminSpecBuildCombat(inst, ghostP);
    if (r.data.target) ADMIN_SPEC.targetId = String(r.data.target.id);
    // Spawn do espectador: primeira resposta boa coloca o fantasma do GM
    // ao lado do alvo (ou do primeiro player) — depois ele anda livre.
    const g = ADMIN_SPEC.ghost;
    if (g && !g.placed && ADMIN_SPEC.combat) {
      const ent = ADMIN_SPEC.combat.players.find((p) => String(p.id) === String(ADMIN_SPEC.targetId))
        || ADMIN_SPEC.combat.players.find((p) => !p.ghost);
      if (ent) {
        g.x = Math.max(0, Math.min(1, (Number(ent.x) || 0.5) + 0.03));
        g.y = Math.max(0, Math.min(1, Number(ent.y) || 0.5));
      }
      g.placed = true;
    }
    adminSpecRenderInfo(inst, r.data.target);
  } catch (e) { /* rede — mantém o último frame */ }
  ADMIN_SPEC.lastPollAt = Date.now();
}

function adminSpecRenderInfo(instance, target) {
  const el = document.getElementById("spec-info");
  if (!el || !ADMIN_SPEC.combat) return;
  const c = ADMIN_SPEC.combat;
  const boss = c.bossId ? (" · boss " + c.bossId) : "";
  const hunt = c.huntId || boss || "instância";
  const t = target ? target.name : (ADMIN_SPEC.charName || "—");
  const lines = [
    `<b>${t}</b> — ${hunt}`,
    `players: ${c.players.filter((p) => !p.ghost).length} · mobs: ${c.mobs.length}`,
  ];
  const tEnt = c.players.find((p) => String(p.id) === String(ADMIN_SPEC.targetId));
  if (tEnt && tEnt.p) {
    lines.push(`<span class="dim">${tEnt.p.name} · nv ${tEnt.p.level} · HP ${Math.floor(tEnt.p.hp)}/${(typeof maxStats === "function" ? maxStats(tEnt.p).hp : "?")}</span>`);
  }
  el.innerHTML = lines.join("<br>");
}

/* Loop de desenho: rAF próprio, sem tocar no render principal do jogo. */
function adminSpecFrame() {
  if (!ADMIN_SPEC.active) return;
  ADMIN_SPEC.rafId = requestAnimationFrame(adminSpecFrame);
  const r = ADMIN_SPEC.renderer, c = ADMIN_SPEC.combat;
  if (!r || !c) return;
  adminSpecTickGhost(16);
  const tEnt = c.players.find((p) => String(p.id) === String(ADMIN_SPEC.targetId));
  try { r.draw(c, (tEnt && tEnt.p) || null, 16); } catch (e) { /* frame ruim não derruba */ }
}

/* Movimento do fantasma: WASD/setas contínuo ou clique para destino. */
function adminSpecTickGhost(dt) {
  const g = ADMIN_SPEC.ghost, c = ADMIN_SPEC.combat;
  if (!g || !c) return;
  const speed = 0.008;                 // fração do mapa por frame (~0.5/s)
  let dx = 0, dy = 0;
  const k = ADMIN_SPEC.keys;
  if (k.ArrowLeft || k.a) dx -= 1;
  if (k.ArrowRight || k.d) dx += 1;
  if (k.ArrowUp || k.w) dy -= 1;
  if (k.ArrowDown || k.s) dy += 1;
  if (dx || dy) {
    g.tx = g.ty = null;
    g.x = Math.max(0, Math.min(1, g.x + dx * speed));
    g.y = Math.max(0, Math.min(1, g.y + dy * speed));
    g.dir = dx < 0 ? "w" : dx > 0 ? "e" : dy < 0 ? "n" : "s";
    g.moving = true; g.frame = (g.frame === 1) ? 2 : 1;
    return;
  }
  if (g.tx != null) {
    const ddx = g.tx - g.x, ddy = g.ty - g.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < speed) { g.x = g.tx; g.y = g.ty; g.tx = g.ty = null; g.moving = false; }
    else {
      g.x += (ddx / dist) * speed; g.y += (ddy / dist) * speed;
      g.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? "w" : "e") : (ddy < 0 ? "n" : "s");
      g.moving = true; g.frame = (g.frame === 1) ? 2 : 1;
    }
  } else g.moving = false;
  // re-anexa posição do fantasma na entidade do combat atual
  const ent = c.players.find((p) => p.ghost);
  if (ent) { ent.x = g.x; ent.y = g.y; ent.dir = g.dir; ent.moving = g.moving; ent.frame = g.frame; }
}

function adminSpecOpen(opts) {
  opts = opts || {};
  adminSpecClose();
  ADMIN_SPEC.active = true;
  ADMIN_SPEC.mode = opts.mode || "watch";
  ADMIN_SPEC.charName = opts.charName || "";
  ADMIN_SPEC.instanceId = opts.instanceId || "";
  ADMIN_SPEC.targetId = "";
  ADMIN_SPEC.combat = null;
  ADMIN_SPEC.error = "";
  // O GM sempre vira espectador-fantasma na cena (client-side). No WATCH
  // ele surge ao lado do alvo; nos demais modos começa no centro.
  ADMIN_SPEC.ghost = { x: 0.5, y: 0.5, dir: "s", tx: null, ty: null,
    moving: false, frame: 1, placed: false };

  const old = document.getElementById("spec-modal");
  if (old) old.remove();
  const bg = document.createElement("div");
  bg.id = "spec-modal";
  bg.className = "spec-modal-bg";
  const title = ADMIN_SPEC.mode === "watch" ? "👁 WATCH" : ADMIN_SPEC.mode === "raid" ? "⚔ RAID" : "➤ FOLLOW";
  bg.innerHTML =
    '<div class="spec-modal panel">' +
      '<div class="spec-head"><b>' + title + '</b>' +
        '<span id="spec-info" class="tiny dim">conectando…</span>' +
        '<span style="flex:1"></span>' +
        '<button class="sm" id="spec-close">✕</button></div>' +
      '<canvas id="spec-canvas" width="840" height="520"></canvas>' +
      '<div class="tiny dim spec-foot">' +
        (ADMIN_SPEC.ghost ? "WASD/setas ou clique: move o GM espectador (fantasma — invisível e intangível para o servidor)."
          : "Visão somente leitura do combate do personagem.") +
      '</div>' +
    '</div>';
  document.body.appendChild(bg);
  document.getElementById("spec-close").addEventListener("click", adminSpecClose);
  bg.addEventListener("click", (ev) => { if (ev.target === bg) adminSpecClose(); });
  ADMIN_SPEC.canvas = document.getElementById("spec-canvas");
  if (typeof Renderer === "function") ADMIN_SPEC.renderer = new Renderer(ADMIN_SPEC.canvas);
  // clique = mover o fantasma (fração do canvas → fração do mapa)
  ADMIN_SPEC.canvas.addEventListener("click", (ev) => {
    const g = ADMIN_SPEC.ghost;
    if (!g) return;
    const rect = ADMIN_SPEC.canvas.getBoundingClientRect();
    g.tx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    g.ty = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
  });
  window.addEventListener("keydown", adminSpecKey);
  window.addEventListener("keyup", adminSpecKey);
  adminSpecFetch();
  ADMIN_SPEC.pollTimer = setInterval(adminSpecFetch, 1500);
  ADMIN_SPEC.rafId = requestAnimationFrame(adminSpecFrame);
}

function adminSpecKey(ev) {
  if (!ADMIN_SPEC.active) return;
  ADMIN_SPEC.keys[ev.key] = ev.type === "keydown";
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(ev.key) !== -1) ev.preventDefault();
}

function adminSpecClose() {
  ADMIN_SPEC.active = false;
  if (ADMIN_SPEC.pollTimer) { clearInterval(ADMIN_SPEC.pollTimer); ADMIN_SPEC.pollTimer = 0; }
  if (ADMIN_SPEC.rafId) { cancelAnimationFrame(ADMIN_SPEC.rafId); ADMIN_SPEC.rafId = 0; }
  window.removeEventListener("keydown", adminSpecKey);
  window.removeEventListener("keyup", adminSpecKey);
  const el = document.getElementById("spec-modal");
  if (el) el.remove();
}
window.adminSpecOpen = adminSpecOpen;
window.adminSpecClose = adminSpecClose;
