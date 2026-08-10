/* scarlett-boss.js — Scarlett Etzel + desafio direcional da boss fight.
 * Dados do boss: Canary 157e6f9e, scarlett_etzel.lua.
 * Mecânica custom: sequência rítmica de cinco direções com gates em
 * 100/75/50/25% de HP. */
"use strict";

const SCARLETT_ID = "scarlett-etzel";
const SCARLETT_KEYS = ["up", "down", "left", "right"];
const SCARLETT_KEY_ICON = { up: "↑", down: "↓", left: "←", right: "→" };
const SCARLETT_TIMING_WINDOW = 280;
const SCARLETT_NOTE_GAP = 760;
const SCARLETT_TRAVEL_MS = 2200;

(function registerScarlett() {
  if (typeof GAMEDATA === "undefined" || typeof BOSS_DEFS === "undefined") return;
  const items = GAMEDATA.items;
  const mob = GAMEDATA.monsters[SCARLETT_ID];

  // Itens presentes no loot oficial, mas ausentes do recorte antigo.
  if (!items["energy-bar"])
    items["energy-bar"] = { n:"energy bar", s:null, t:"loot", sell:1, w:7.5, cid:23535 };
  if (!items["supreme-health-potion"])
    items["supreme-health-potion"] = { n:"supreme health potion", s:null, t:"loot", sell:1, w:3.5, cid:23375 };
  if (!items["ultimate-spirit-potion"])
    items["ultimate-spirit-potion"] = { n:"ultimate spirit potion", s:null, t:"loot", sell:1, w:3.1, cid:23374 };

  // A importação vê apenas o nome da rune; elemento/efeito/range vivem no
  // script da spell do Canary e precisam ser ligados explicitamente.
  if (mob) {
    const sd = (mob.skills || []).find((s) => String(s.n || "").toLowerCase() === "sudden death rune");
    if (sd) Object.assign(sd, { el:"death", range:7, fx:"mort-area", miss:"sudden-death", alvo:1 });
  }

  // Hunt técnica invisível: fornece arena/colisão para newBossCombat.
  GAMEDATA.hunts["scarlett-room"] = {
    name: "Scarlett's Room", hidden: true, level: 250,
    monsters: [SCARLETT_ID], scene: "palace", otbm: "scarlet_room",
    // Usa o mapa nativo 24×16: as paredes estão ancoradas fora do retângulo
    // interno da arena e desapareciam quando o arquivo era recortado.
    otbmSpawn: { x:176, y:169, z:2 },
    otbmMobBounds: { x:191, y:165, w:1, h:1, z:2 },
    avgHp:130000, avgExp:20000, avgDamage:1200, avgArmor:88,
    avgGold:100, respawn:1, pack:1, cat:"boss-room",
  };

  BOSS_DEFS[SCARLETT_ID] = {
    id: SCARLETT_ID,
    name: "Scarlett Etzel",
    title: "Boss da Cobra Bastion",
    hunt: "scarlett-room",
    baseMonster: SCARLETT_ID,
    sprite: SCARLETT_ID,
    hp: 130000, exp: 20000, damage: 1200, armor: 88, defense: 88,
    speed: 0.000065,
    requirement: { level:250, text:"Requer nível 250+ (Cobra Bastion)" },
    cooldown: typeof BOSS_COOLDOWN !== "undefined" ? BOSS_COOLDOWN : 0,
    mechanic: "direction-qte",
    noRevive: true,
    // Sem lista própria: bossLootReal usa o loot integral do MONSTERDATA.
  };
})();

function scarlettFight(c) {
  return !!(c && c.boss && c.boss.id === SCARLETT_ID);
}

function scarlettParticipants(c) {
  if (!c) return [];
  if (c.players && c.players.length) return c.players;
  return c.player ? [c.player] : [];
}

function scarlettBuildSequence(randomFn) {
  const rnd = randomFn || Math.random;
  return Array.from({ length:5 }, () =>
    SCARLETT_KEYS[Math.min(3, Math.floor(Math.max(0, rnd()) * 4))]);
}

function scarlettOverlay() {
  return typeof document !== "undefined" ? document.getElementById("scarlett-qte") : null;
}

function scarlettBossInit(c, player, randomFn) {
  if (!scarlettFight(c)) return c;
  const rnd = randomFn || Math.random;
  // Single player também vira uma lista de participantes para compartilhar
  // exatamente a mesma regra de corpse/permadeath usada pela party.
  if (!c.players || !c.players.length) {
    c.player.p = player;
    c.player.id = player.id || "scarlett-solo";
    c.player.name = player.name || "Player";
    c.player.maxHp = typeof maxStats === "function" ? maxStats(player).hp : (player.maxHp || player.hp || 1);
    c.players = [c.player];
  }
  c.scarlett = {
    immune: true,
    phase: "waiting",
    nextAt: Date.now() + 5000 + Math.floor(rnd() * 5001),
    thresholdIndex: 0,
    thresholds: [0.75, 0.50, 0.25],
    sequence: [], notes: [], index: 0,
    lastBlockFx: 0, wiped: false, raf: 0,
  };
  const bossMob = c.mobs && c.mobs[0];
  if (bossMob) bossMob.qteImmune = true;
  scarlettOverlayMessage("SCARLETT IMUNE — PREPARE-SE!", "immune");
  return c;
}

function scarlettStartQte(c, now, randomFn) {
  if (!scarlettFight(c) || !c.scarlett || c.scarlett.wiped) return false;
  const st = c.scarlett;
  const sequence = scarlettBuildSequence(randomFn);
  st.phase = "qte";
  st.immune = true;
  st.sequence = sequence;
  st.index = 0;
  st.notes = sequence.map((dir, i) => ({
    dir, due: now + 1400 + i * SCARLETT_NOTE_GAP, hit:false,
  }));
  const bossMob = c.mobs && c.mobs[0];
  if (bossMob) bossMob.qteImmune = true;
  if (typeof addLog === "function")
    addLog("death", "Scarlett está imune! Acerte as <b>5 direções</b> no marcador.");
  scarlettRenderQte(c, now);
  return true;
}

function scarlettRenderQte(c, now) {
  const st = c && c.scarlett;
  const el = scarlettOverlay();
  if (!st || st.phase !== "qte" || !el) return;
  el.style.display = "block";
  el.className = "scarlett-qte active";
  const notes = st.notes.map((note, i) => {
    const left = Math.max(-5, Math.min(105,
      20 + ((note.due - now) / SCARLETT_TRAVEL_MS) * 80));
    const cls = note.hit ? "hit" : i === st.index ? "current" : "";
    return `<span class="scarlett-note ${cls}" style="left:${left.toFixed(2)}%">${SCARLETT_KEY_ICON[note.dir]}</span>`;
  }).join("");
  el.innerHTML = `<div class="scarlett-qte-title">SCARLETT'S DANCE — ${st.index}/5</div>
    <div class="scarlett-track"><i class="scarlett-hit-zone"></i>${notes}</div>
    <div class="scarlett-qte-help">Use ↑ ↓ ← → ou W S A D no momento em que a seta cruzar o marcador</div>`;
  if (typeof cancelAnimationFrame === "function" && st.raf) cancelAnimationFrame(st.raf);
  if (typeof requestAnimationFrame === "function") {
    st.raf = requestAnimationFrame(() => {
      const active = typeof G !== "undefined" ? G.combat : c;
      if (active === c && st.phase === "qte") scarlettRenderQte(c, Date.now());
    });
  }
}

function scarlettOverlayMessage(text, kind) {
  const el = scarlettOverlay();
  if (!el) return;
  el.style.display = "block";
  el.className = "scarlett-qte " + (kind || "");
  el.innerHTML = `<div class="scarlett-qte-result">${text}</div>`;
}

function scarlettHideOverlay() {
  const el = scarlettOverlay();
  if (el) { el.style.display = "none"; el.innerHTML = ""; el.className = "scarlett-qte"; }
}

function scarlettAlive(c) {
  return scarlettParticipants(c).filter((e) => e && e.p && e.p.hp > 0 && !e.permadead);
}

function scarlettPermanentKill(c, ent, reason) {
  if (!ent || !ent.p || ent.permadead) return false;
  const now = Date.now();
  ent.p.hp = 0;
  ent.permadead = true;
  ent.reviveAt = 0;
  ent.downedAt = now;
  ent.deathPos = { x:ent.x, y:ent.y, cx:ent.cx, cy:ent.cy, dir:ent.dir || "e" };
  ent.moving = false;
  c.stats.deaths++;
  ent.p.deaths = (ent.p.deaths || 0) + 1;
  if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
  if (typeof addLog === "function")
    addLog("death", `<b>${ent.name || ent.p.name}</b> morreu para Scarlett${reason ? " — " + reason : ""}. Não poderá renascer nesta luta.`);

  if (c.player === ent) {
    const next = scarlettAlive(c).find((e) => e !== ent);
    if (next) {
      if (typeof partyCombatSwitchTo === "function" && next.id !== undefined)
        partyCombatSwitchTo(next.id);
      else {
        c.player = next;
        if (typeof G !== "undefined") G.p = next.p;
      }
    }
  }
  scarlettCheckWipe(c);
  return true;
}

function scarlettKillLowestMaxHp(c, randomFn) {
  const alive = scarlettAlive(c);
  if (!alive.length) return null;
  const hpMax = (e) => e.maxHp || (typeof maxStats === "function" ? maxStats(e.p).hp : (e.p.maxHp || 1));
  const min = Math.min(...alive.map(hpMax));
  const priority = alive.filter((e) => hpMax(e) === min);
  const rnd = randomFn || Math.random;
  const victim = priority[Math.min(priority.length - 1, Math.floor(Math.max(0, rnd()) * priority.length))];
  scarlettPermanentKill(c, victim, "sequência incorreta");
  return victim;
}

function scarlettCheckWipe(c) {
  if (!c || !c.scarlett || scarlettAlive(c).length) return false;
  const st = c.scarlett;
  if (st.wiped) return true;
  st.wiped = true;
  st.phase = "wiped";
  st.immune = true;
  scarlettOverlayMessage("PARTY DERROTADA", "fail");
  if (typeof addLog === "function") addLog("death", "Toda a party morreu. A luta contra Scarlett terminou.");
  if (typeof setTimeout === "function") setTimeout(() => {
    if (typeof G !== "undefined" && G.combat === c && typeof stopHunt === "function") stopHunt();
  }, 2500);
  return true;
}

function bossHandlePermanentDown(c, fallenP, reason) {
  if (!scarlettFight(c)) return false;
  const ent = scarlettParticipants(c).find((e) => e.p === fallenP) || c.player;
  return scarlettPermanentKill(c, ent, reason || "dano do boss");
}

function scarlettQteSuccess(c) {
  const st = c.scarlett;
  st.phase = "vulnerable";
  st.immune = false;
  const bossMob = c.mobs && c.mobs[0];
  if (bossMob) bossMob.qteImmune = false;
  scarlettOverlayMessage("SEQUÊNCIA PERFEITA — SCARLETT VULNERÁVEL!", "success");
  if (typeof addLog === "function") addLog("level", "Sequência perfeita! Scarlett perdeu a imunidade.");
  if (typeof setTimeout === "function") setTimeout(() => {
    if (c.scarlett === st && st.phase === "vulnerable") scarlettHideOverlay();
  }, 1300);
}

function scarlettQteFail(c, reason, randomFn) {
  const st = c.scarlett;
  if (!st || st.phase !== "qte") return false;
  st.phase = "waiting";
  st.immune = true;
  const victim = scarlettKillLowestMaxHp(c, randomFn);
  if (!st.wiped) {
    scarlettOverlayMessage(`ERRO! ${victim ? (victim.name || victim.p.name) + " MORREU" : "SEQUÊNCIA PERDIDA"}`, "fail");
    st.nextAt = Date.now() + 3500;
  }
  return false;
}

function scarlettDirectionFromKey(key) {
  const k = String(key || "").toLowerCase();
  return ({ arrowup:"up", w:"up", arrowdown:"down", s:"down",
            arrowleft:"left", a:"left", arrowright:"right", d:"right" })[k] || null;
}

function scarlettHandleKey(c, key, now) {
  if (!scarlettFight(c) || !c.scarlett || c.scarlett.phase !== "qte") return null;
  const dir = scarlettDirectionFromKey(key);
  if (!dir) return null;
  const st = c.scarlett;
  const note = st.notes[st.index];
  if (!note || dir !== note.dir || Math.abs(now - note.due) > SCARLETT_TIMING_WINDOW)
    return scarlettQteFail(c, "fora do timing");
  note.hit = true;
  st.index++;
  if (st.index >= st.notes.length) scarlettQteSuccess(c);
  else scarlettRenderQte(c, now);
  return true;
}

function scarlettTriggerGate(c, now) {
  const st = c.scarlett, bossMob = c.mobs && c.mobs[0];
  if (!st || !bossMob || st.thresholdIndex >= st.thresholds.length) return false;
  const gate = st.thresholds[st.thresholdIndex];
  if (bossMob.hp / bossMob.maxHp > gate) return false;
  // Gates não podem ser pulados por um hit muito alto.
  bossMob.hp = Math.max(bossMob.hp, Math.ceil(bossMob.maxHp * gate));
  st.thresholdIndex++;
  st.phase = "waiting";
  st.immune = true;
  st.nextAt = now + 650;
  bossMob.qteImmune = true;
  scarlettOverlayMessage(`GATE DE ${Math.round(gate * 100)}% — PREPARE-SE!`, "immune");
  if (typeof addLog === "function") addLog("death", `Scarlett ativou a imunidade em ${Math.round(gate * 100)}% de vida.`);
  return true;
}

function scarlettBossTick(c, now) {
  if (!scarlettFight(c) || !c.scarlett) return true;
  const st = c.scarlett;
  // Qualquer morte normal do boss também vira permadeath nesta arena.
  for (const ent of scarlettParticipants(c)) {
    if (ent && ent.p && ent.p.hp <= 0 && !ent.permadead)
      scarlettPermanentKill(c, ent, "dano do boss");
  }
  if (scarlettCheckWipe(c)) return false;
  if (st.phase === "vulnerable") scarlettTriggerGate(c, now);
  if (st.phase === "waiting" && now >= st.nextAt) scarlettStartQte(c, now);
  if (st.phase === "qte") {
    const note = st.notes[st.index];
    if (note && now > note.due + SCARLETT_TIMING_WINDOW)
      scarlettQteFail(c, "tecla perdida");
  }
  return !st.wiped;
}

function scarlettBossEnforceThreshold(c, now) {
  if (!scarlettFight(c) || !c.scarlett || c.scarlett.phase !== "vulnerable") return false;
  return scarlettTriggerGate(c, now || Date.now());
}

function bossCanTakePlayerDamage(c, target) {
  if (!scarlettFight(c) || !target || !target.boss || !c.scarlett || !c.scarlett.immune) return true;
  const now = Date.now();
  if (now - c.scarlett.lastBlockFx > 500) {
    c.scarlett.lastBlockFx = now;
    c.events.push({ t:"block", x:target.x, y:target.y, screen:true, qteImmune:true });
  }
  return false;
}

function scarlettBossCleanup(c) {
  if (!c || !c.scarlett) return;
  if (typeof cancelAnimationFrame === "function" && c.scarlett.raf)
    cancelAnimationFrame(c.scarlett.raf);
  // O corpse permanece durante a luta; ao encerrá-la, todos voltam vivos à
  // cidade para não deixar personagens da conta presos com HP zero.
  for (const ent of scarlettParticipants(c)) {
    if (!ent || !ent.p || !ent.permadead) continue;
    const mx = typeof maxStats === "function" ? maxStats(ent.p) : { hp:ent.maxHp || 1, mp:ent.maxMp || 0 };
    ent.p.hp = mx.hp; ent.p.mp = mx.mp;
    ent.permadead = false; ent.reviveAt = 0; ent.deathPos = null;
    if (typeof saveCharacterToRoster === "function") saveCharacterToRoster(ent.p);
  }
  scarlettHideOverlay();
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    const c = typeof G !== "undefined" ? G.combat : null;
    if (!scarlettFight(c) || !c.scarlett || c.scarlett.phase !== "qte") return;
    const dir = scarlettDirectionFromKey(event.key);
    if (!dir) return;
    event.preventDefault();
    if (!event.repeat) scarlettHandleKey(c, event.key, Date.now());
  }, true);
}
