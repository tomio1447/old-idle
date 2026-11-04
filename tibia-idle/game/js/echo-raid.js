/* echo-raid.js — Echo Raid / Echo Warden (port do sistema do crystalserver).
 *
 * Mecânica (data-global/lib/core/echo_warden.lua):
 *  - Ao matar um monstro comum/incomum (bestiário 1–2 estrelas, sem boss,
 *    sem summon, sem stack da forge), rola 100/200000 (0.05%) de chance de
 *    nascer um PORTAL no SQM do cadáver, 30s depois do kill.
 *  - O portal fica 2 min no chão. Qualquer jogador que PISAR nele arma a
 *    Echo Raid: o portal some e a raid fica aguardando 60s.
 *  - Ao fim dos 60s nasce um ECHO WARDEN (mesmo monstro, 4x HP) + 7–12
 *    minions (1.5x HP) ao redor do tile do portal.
 *  - Matar o warden rende charm points uma vez por espécie/personagem
 *    (tabela por estrelas do bestiário, como os minor charm echoes do RL).
 *
 * HELPER → Aba Ataque → "Echo Raid":
 *  - p.config.echoRaid (checkbox): liga o auto-step no portal.
 *  - p.config.echoRaidMode = "auto" | "safe":
 *      AUTO: o personagem corre instantaneamente para pisar na raid;
 *      SAFE: só vai pisar quando não houver monstros vivos.
 */
"use strict";

const ECHO_PORTAL_CHANCE_NUM = 100;      // 100/200000 = 0.05%
const ECHO_PORTAL_CHANCE_DEN = 200000;
const ECHO_PORTAL_DELAY_MS = 30000;      // portal aparece 30s APÓS o kill
const ECHO_PORTAL_TTL_MS = 120000;       // portal some sozinho após 2 min
const ECHO_ARM_DELAY_MS = 60000;         // pisou → raid aguarda 60s
const ECHO_WARDEN_HP_MULT = 4;
const ECHO_MINION_HP_MULT = 1.5;
const ECHO_ADDS_MIN = 7;
const ECHO_ADDS_MAX = 12;
const ECHO_SPAWN_STEP_MS = 400;          // nascimento escalonado dos minions
const ECHO_CHARM_BY_STARS = { 0: 1, 1: 10, 2: 15, 3: 20, 4: 25, 5: 30 };

function echoRaidState(c) {
  if (!c) return null;
  if (!c.echo || typeof c.echo !== "object")
    c.echo = { pending: [], portals: [], armed: [] };
  if (!Array.isArray(c.echo.pending)) c.echo.pending = [];
  if (!Array.isArray(c.echo.portals)) c.echo.portals = [];
  if (!Array.isArray(c.echo.armed)) c.echo.armed = [];
  return c.echo;
}

/* Estrelas do bestiário: o def do mob pode vir de GAMEDATA (sem `best`),
 * então o fallback é o MONSTERDATA (dump Canary completo). */
function echoBestiaryStars(m) {
  const slug = m && m.slug;
  const d = (m && m.def) ||
    (typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug]) ||
    (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters[slug]);
  let s = d && d.best && Number(d.best.stars);
  if (!Number.isFinite(s) && typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug])
    s = MONSTERDATA[slug].best && Number(MONSTERDATA[slug].best.stars);
  return Number.isFinite(s) ? s : 0;
}

/* Guardas do crystalserver: sem summon/master, sem reward boss/bosstiary
 * boss, sem forge stack (fiendish/influenced), só 1–2 estrelas. Mobs da
 * própria raid nunca re-disparam portal. */
function echoRaidEligibleMob(m) {
  if (!m) return false;
  if (m.boss || m.bossHelper || m.summoned) return false;
  if (m.echoSpawned || m.echoWarden || m.echoMinion) return false;
  if (m.fiendish || m.influenced || Number(m.sinisterStacks) > 0) return false;
  const s = echoBestiaryStars(m);
  return s >= 1 && s <= 2;
}

/* Chamado no loop de mortes do combate local. Faz o roll do portal e o
 * pagamento da recompensa quando o morto é o warden. */
function echoRaidOnKill(c, m, now) {
  if (!c || !m) return;
  const st = echoRaidState(c);
  now = now || Date.now();

  if (m.echoWarden) {
    const stars = echoBestiaryStars(m);
    const pts = ECHO_CHARM_BY_STARS[stars] || ECHO_CHARM_BY_STARS[0];
    const ents = (c.players && c.players.length) ? c.players : (c.player ? [c.player] : []);
    for (const ent of ents) {
      const pl = ent && ent.p;
      if (!pl) continue;
      pl.echoWardenFirst = pl.echoWardenFirst && typeof pl.echoWardenFirst === "object"
        ? pl.echoWardenFirst : {};
      if (pl.echoWardenFirst[m.slug]) continue;
      pl.echoWardenFirst[m.slug] = 1;
      pl.charmPoints = (Number(pl.charmPoints) || 0) + pts;
    }
    c.events = c.events || [];
    c.events.push({ t: "echo-reward", points: pts, slug: m.slug, x: m.x, y: m.y });
    return;
  }

  if (!echoRaidEligibleMob(m)) return;
  if (Math.random() * ECHO_PORTAL_CHANCE_DEN >= ECHO_PORTAL_CHANCE_NUM) return;
  const gw = Number(c.gridW) || (typeof GRID_W !== "undefined" ? GRID_W : 30);
  const gh = Number(c.gridH) || (typeof GRID_H !== "undefined" ? GRID_H : 30);
  const cx = Number.isFinite(m.cx) ? m.cx : Math.floor((Number(m.x) || 0.5) * gw);
  const cy = Number.isFinite(m.cy) ? m.cy : Math.floor((Number(m.y) || 0.5) * gh);
  st.pending.push({ slug: String(m.slug), cx: cx, cy: cy, at: now + ECHO_PORTAL_DELAY_MS });
}

function echoRaidMakeMob(c, slug, hpMult, warden, now) {
  const base = (typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && GAMEDATA.monsters[slug]) ||
    (typeof MONSTERDATA !== "undefined" && MONSTERDATA[slug]);
  if (!base) return null;
  const m = Object.assign({}, base);
  m.name = (typeof displayMonsterName === "function") ? displayMonsterName(base.name) : base.name;
  if (hpMult && hpMult !== 1) m.hp = Math.max(1, Math.floor((Number(m.hp) || 1) * hpMult));
  const as = Math.max(500, Number(m.attackSpeed) || 2000);
  const atkMin = Math.floor(as * 0.15);
  return {
    slug: slug, def: m,
    boss: false, influenced: false, fiendish: false,
    echoSpawned: true, echoWarden: !!warden, echoMinion: !warden,
    hp: m.hp, maxHp: m.hp,
    atkCd: atkMin + Math.random() * (as - atkMin),
    id: "echo-" + Math.random().toString(36).slice(2, 8),
    dir: "w", moving: false, attackAnim: 0,
    speed: 0.000045 + Math.random() * 0.000025,
    spawnAt: now,
  };
}

/* Fim da espera de 60s: warden no tile do portal + 7–12 minions em volta.
 * Entram pela fila pendingSpawns (blink de teleporte), escalonados. */
function echoRaidRun(c, ar, now) {
  const slug = String(ar.slug || "");
  const mk = echoRaidMakeMob(c, slug, ECHO_WARDEN_HP_MULT, true, now);
  if (!mk) return;
  const gw = Number(c.gridW) || (typeof GRID_W !== "undefined" ? GRID_W : 30);
  const gh = Number(c.gridH) || (typeof GRID_H !== "undefined" ? GRID_H : 30);
  c.pendingSpawns = c.pendingSpawns || [];
  c.events = c.events || [];
  const occ = (typeof buildOccupancy === "function") ? buildOccupancy(c, null) : null;
  if (occ) {
    for (const sp of c.pendingSpawns) {
      if (sp && Number.isFinite(Number(sp.cx)) && Number.isFinite(Number(sp.cy)))
        occ.set(Number(sp.cx) + ":" + Number(sp.cy), true);
    }
  }
  const total = 1 + ECHO_ADDS_MIN +
    Math.floor(Math.random() * (ECHO_ADDS_MAX - ECHO_ADDS_MIN + 1));
  for (let i = 0; i < total; i++) {
    const mob = i === 0 ? mk
      : echoRaidMakeMob(c, slug, ECHO_MINION_HP_MULT, false, now);
    if (!mob) break;
    const ent = { cx: undefined, cy: undefined };
    if (occ && typeof placeFree === "function") placeFree(ent, occ, ar.cx, ar.cy);
    const cx = Number.isFinite(ent.cx) ? ent.cx : Math.max(0, Math.min(gw - 1, ar.cx));
    const cy = Number.isFinite(ent.cy) ? ent.cy : Math.max(0, Math.min(gh - 1, ar.cy));
    if (occ) occ.set(cx + ":" + cy, true);
    c.pendingSpawns.push({
      mob: mob, cx: cx, cy: cy,
      startedAt: now + i * ECHO_SPAWN_STEP_MS, blink: 0, done: false,
    });
  }
  c.events.push({ t: "echo-spawn", x: ar.x, y: ar.y });
}

/* Tick da mecânica (modo local): nascem portais agendados, jogadores
 * pisando armam a raid, raids armadas disparam após os 60s. */
function echoRaidTick(c, p, dt, now) {
  const st = echoRaidState(c);
  if (!st) return;
  now = now || Date.now();
  c.events = c.events || [];
  const gw = Number(c.gridW) || (typeof GRID_W !== "undefined" ? GRID_W : 30);
  const gh = Number(c.gridH) || (typeof GRID_H !== "undefined" ? GRID_H : 30);

  // 1) Portais agendados nascem no tile do cadáver.
  for (let i = st.pending.length - 1; i >= 0; i--) {
    const pd = st.pending[i];
    if (now < pd.at) continue;
    st.pending.splice(i, 1);
    st.portals.push({
      id: "echo-" + now + "-" + i, slug: pd.slug, cx: pd.cx, cy: pd.cy,
      x: (pd.cx + 0.5) / gw, y: (pd.cy + 0.5) / gh,
      bornAt: now, expiresAt: now + ECHO_PORTAL_TTL_MS,
    });
    c.events.push({ t: "echo-portal", x: (pd.cx + 0.5) / gw, y: (pd.cy + 0.5) / gh });
  }

  // 2) Qualquer jogador pisando no portal arma a raid (portal some).
  const ents = (c.players && c.players.length) ? c.players : (c.player ? [c.player] : []);
  for (let i = st.portals.length - 1; i >= 0; i--) {
    const po = st.portals[i];
    if (now >= po.expiresAt) { st.portals.splice(i, 1); continue; }
    const stepper = ents.find((e2) => e2 && (!e2.p || e2.p.hp > 0) &&
      Number.isFinite(e2.cx) && e2.cx === po.cx && e2.cy === po.cy);
    if (!stepper) continue;
    st.portals.splice(i, 1);
    st.armed.push({
      slug: po.slug, cx: po.cx, cy: po.cy, x: po.x, y: po.y,
      armedAt: now, spawnAt: now + ECHO_ARM_DELAY_MS,
    });
    c.events.push({ t: "echo-armed", x: po.x, y: po.y, at: now + ECHO_ARM_DELAY_MS });
  }

  // 3) Raids armadas: warden + minions após o delay.
  for (let i = st.armed.length - 1; i >= 0; i--) {
    const ar = st.armed[i];
    if (now < ar.spawnAt) continue;
    st.armed.splice(i, 1);
    echoRaidRun(c, ar, now);
  }
}

/* Gancho de movimento do Helper (chamado em playerThinkStep). Devolve
 * true quando o passo foi decidido aqui (o personagem está indo pisar no
 * portal ou já está em cima dele). */
function echoRaidThinkStep(c, p, pl, occ, now) {
  if (!c || !p || !pl) return false;
  const cfg = p.config || {};
  if (!cfg.echoRaid) return false;
  const st = c.echo;
  const portal = st && Array.isArray(st.portals) && st.portals.length ? st.portals[0] : null;
  if (!portal || !Number.isFinite(portal.cx) || !Number.isFinite(portal.cy)) return false;
  // SAFE: só pisa quando não houver monstros vivos.
  if (cfg.echoRaidMode === "safe" &&
      (c.mobs || []).some((m) => m && m.hp > 0)) return false;
  if (pl.cx === portal.cx && pl.cy === portal.cy) {
    pl.nextStepAt = now + 150;
    return true;
  }
  const dir = (typeof stepToward === "function") ? stepToward(pl, portal.cx, portal.cy, occ) : null;
  if (!dir) return false; // sem rota (tile ocupado): volta a lutar, tenta de novo no próximo tick
  pl.speedPts = (typeof playerSpeed === "function")
    ? playerSpeed(p, now)
    : 110 + ((typeof gearStats === "function") ? (gearStats(p).speed || 0) : 0);
  const ok = (typeof beginStep === "function") ? beginStep(pl, dir, occ, false) : false;
  pl.nextStepAt = now + (ok ? pl.stepDur : 200);
  return true;
}
