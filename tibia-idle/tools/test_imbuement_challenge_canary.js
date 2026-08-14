/* Imbuement Canary (sem life leech em escudo), Challenge online, prey wall-clock. */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

must(!engine.imbAllowedCats("shield", "falcon-shield").includes(1),
  "Falcon Shield ainda aceita Life Leech");
must(!engine.imbAllowedCats("shield", "falcon-shield").includes(6),
  "Falcon Shield aceita Dragon Hide apesar da proteção nativa de fogo");
must(engine.imbAllowedCats("shield", "falcon-shield").includes(14),
  "Falcon Shield perdeu Blockade");
must(engine.imbAllowedCats("shield", "spellbook").includes(16) &&
  !engine.imbAllowedCats("shield", "spellbook").includes(1),
  "spellbook deveria ter Epiphany e não Vampirism");
must(!engine.imbAllowedCats("weapon", "falcon-wand").includes(1) &&
  engine.imbAllowedCats("weapon", "falcon-wand").includes(2) &&
  engine.imbAllowedCats("weapon", "falcon-wand").includes(16) &&
  engine.imbAllowedCats("weapon", "falcon-wand").includes(3),
  "Falcon Wand fora do padrão Void+Epiphany+Strike");
must(!engine.imbAllowedCats("weapon", "wand-of-starstorm").includes(3) &&
  !engine.imbAllowedCats("weapon", "wand-of-starstorm").includes(1),
  "wand comum não pode levar Strike nem Vampirism");
must(engine.imbAllowedCats("weapon", "falcon-bow").includes(0) &&
  engine.imbAllowedCats("weapon", "falcon-bow").includes(15),
  "arco 2H deveria aceitar elemental + precision");
must(!engine.imbAllowedCats("weapon", "spear").includes(0) &&
  engine.imbAllowedCats("weapon", "spear").includes(15),
  "distância 1H não leva elemental");
must(engine.imbAllowedCats("armor", "falcon-plate").includes(1),
  "armadura perdeu Vampirism");

const shieldP = {
  equip: { shield: { item: "falcon-shield" } },
  imbuements: { "equip:shield": [{ key: "Vampirism", tier: 3 }] },
};
must(engine.imbCombatTotals(shieldP).life === 0,
  "Vampirism ilegal no Falcon Shield ainda entra no combate");

const armorP = {
  equip: { armor: { item: "falcon-plate" } },
  imbuements: { "equip:armor": [{ key: "Vampirism", tier: 3 }] },
};
must(engine.imbCombatTotals(armorP).life === 25,
  "Vampirism Powerful na armadura não aplicou 25%");

function player(overrides) {
  return Object.assign({
    id: 1, name: "T", voc: "knight", level: 200, exp: engine.expForLevel(200),
    hp: 8000, mp: 2000, gold: 0,
    skills: { sword: 80, axe: 10, club: 10, dist: 80, fist: 80, shield: 60 },
    ml: 20, equip: { weapon: { item: "sword" } },
    supplies: {}, lootPouch: {}, kills: {}, bosses: {},
    config: { spellAttack: false, exetaRes: true, exetaAmpRes: false },
  }, overrides || {});
}
function desc(p, mob) {
  const member = { id: String(p.id), p: JSON.parse(JSON.stringify(p)) };
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(p.id), members: [member],
    state: {
      players: [{ id: String(p.id), p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
      mobs: [{ id: "mob-1", slug: mob || "rat", hp: 999999, maxHp: 999999, cx: 11, cy: 10, x: 11.5 / 30, y: 10.5 / 30 }],
      events: [],
    },
  };
}
function stepOnce(p, visual) {
  const auth = engine.initializeAuthority(desc(p), "b".repeat(64), 1000);
  auth.authority.rngState = 12345;
  auth.authority.mobs[0].hp = 999999;
  auth.authority.mobs[0].maxHp = 999999;
  auth.authority.mobs[0].damage = 400;
  auth.authority.mobs[0].attackSpeed = 1000;
  auth.authority.mobs[0].attackAcc = 1000;
  auth.authority.players[0].attackAcc = 0;
  const visualState = visual || {
    players: [{
      id: String(p.id), x: 10.5 / 30, y: 10.5 / 30, cx: 10, cy: 10,
      challenge: { res: !!p.config.exetaRes, amp: !!p.config.exetaAmpRes, box: false },
    }],
    mobs: [{ id: "mob-1", x: 11.5 / 30, y: 10.5 / 30, cx: 11, cy: 10 }],
  };
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth), 1000, 2000, visualState).state);
}

const marked = stepOnce(player());
must((marked.state.events || []).some((e) => e.t === "challenge"),
  "exeta res não foi castado no servidor");
must((marked.state.events || []).some((e) => e.t === "challenge-target"),
  "exeta res não marcou o alvo");
must(marked.authority.mobs[0].challengedUntil > 1000,
  "challengedUntil não persistiu no mob");

const amp = stepOnce(player({
  level: 200, config: { spellAttack: false, exetaRes: false, exetaAmpRes: true },
}));
must((amp.state.events || []).some((e) => e.t === "challenge" && e.id === "exeta-amp-res"),
  "exeta amp res não foi castado");
must((amp.state.events || []).some((e) => e.t === "challenge-target" && e.amp),
  "exeta amp res sem FX de Chivalrous Challenge");
must(amp.authority.mobs[0].forceMeleeUntil > 1000,
  "exeta amp res não forçou melee no servidor");
must(String(amp.authority.mobs[0].targetId) === "1",
  "exeta amp res não focou o knight");
must(Number(amp.state.mobs[0].forceMeleeUntil) > Date.now(),
  "snapshot não enviou forceMeleeUntil em relógio de parede");

function partyAmp() {
  const knight = player({
    id: 1, name: "K", voc: "knight",
    config: { spellAttack: false, exetaRes: false, exetaAmpRes: true },
  });
  const mage = player({
    id: 2, name: "M", voc: "sorcerer",
    config: { spellAttack: false, exetaRes: false, exetaAmpRes: false },
  });
  const d = {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: "1",
    members: [
      { id: "1", p: JSON.parse(JSON.stringify(knight)) },
      { id: "2", p: JSON.parse(JSON.stringify(mage)) },
    ],
    state: {
      players: [
        { id: "1", p: JSON.parse(JSON.stringify(knight)), cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 },
        { id: "2", p: JSON.parse(JSON.stringify(mage)), cx: 14, cy: 12, x: 14.5 / 30, y: 12.5 / 30 },
      ],
      mobs: [{ id: "mob-1", slug: "naga-archer", hp: 999999, maxHp: 999999, cx: 15, cy: 10, x: 15.5 / 30, y: 10.5 / 30 }],
      events: [],
    },
  };
  const auth = engine.initializeAuthority(d, "c".repeat(64), 1000);
  auth.authority.rngState = 12345;
  auth.authority.mobs[0].hp = 999999;
  auth.authority.mobs[0].maxHp = 999999;
  auth.authority.mobs[0].targetId = "2";
  const visualState = {
    players: [
      { id: "1", x: 10.5 / 30, y: 10.5 / 30, cx: 10, cy: 10,
        challenge: { res: false, amp: true, box: false } },
      { id: "2", x: 14.5 / 30, y: 12.5 / 30, cx: 14, cy: 12 },
    ],
    mobs: [{ id: "mob-1", x: 15.5 / 30, y: 10.5 / 30, cx: 15, cy: 10 }],
  };
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(auth), 1000, 2000, visualState).state);
}
const focused = partyAmp();
must(String(focused.authority.mobs[0].targetId) === "1",
  "naga archer não trocou o foco do mage para o knight");
must(String(focused.authority.mobs[0].challengeTargetId) === "1",
  "challengeTargetId não ficou no knight");
must(focused.authority.mobs[0].forceMeleeUntil > 1000,
  "naga archer não recebeu forceMeleeUntil");
must(Number(focused.authority.mobs[0].cx) < 15,
  "naga archer não andou para melee no knight (cx=" + focused.authority.mobs[0].cx + ")");

const off = player({ config: { spellAttack: false, exetaRes: false, exetaAmpRes: false } });
const on = player({ config: { spellAttack: false, exetaRes: true, exetaAmpRes: false } });
function takenOf(state) {
  const ev = (state.state.events || []).find((e) => e.t === "taken");
  return ev ? ev.dmg : 0;
}
const dmgOff = takenOf(stepOnce(off));
const dmgOn = takenOf(stepOnce(on));
must(dmgOff > 0 && dmgOn > 0 && dmgOn < dmgOff,
  "Challenge não reduziu o dano recebido (off=" + dmgOff + " on=" + dmgOn + ")");

const preySrc = fs.readFileSync(path.join(__dirname, "..", "game", "js", "prey.js"), "utf8");
must(preySrc.includes("s.until <= agora") && !preySrc.includes("s.until -= dt"),
  "preyTick ainda drena o timestamp com dt");

const html = fs.readFileSync(path.join(__dirname, "..", "game", "index.html"), "utf8");
must(html.includes("js/imbuement.js?v=imbue-slots-v1") &&
  html.includes("js/imbuement-ui.js?v=imbue-slots-v1") &&
  html.includes("js/prey.js?v=prey-timer-v1") &&
  html.includes("js/spellfxdata.js?v=exeta-fx-v1") &&
  html.includes("js/game.js?v=knight-fx-combo-v2") &&
  html.includes("js/account-client.js?v=sqm-hud-v1") &&
  html.includes("js/combat.js?v=knight-fx-combo-v2") &&
  html.includes("js/party.js?v=challenge-ai-v1") &&
  html.includes("js/reward-chest.js?v=reward-online-v1") &&
  html.includes("js/render.js?v=knight-fx-combo-v1"),
  "cache-bust dos sistemas Canary ausente");

const spellfx = fs.readFileSync(path.join(__dirname, "..", "game", "js", "spellfxdata.js"), "utf8");
must(spellfx.includes("exeta amp res") && spellfx.includes("chivalrous-challenge"),
  "spellfx sem exeta amp res");
const render = fs.readFileSync(path.join(__dirname, "..", "game", "js", "render.js"), "utf8");
must(render.includes("assets/effects/chivalrous-challenge.png"),
  "chivalrous-challenge não aponta para assets/effects");
must(fs.existsSync(path.join(__dirname, "..", "game", "assets", "effects", "chivalrous-challenge.png")),
  "sprite chivalrous-challenge.png ausente");
must(fs.existsSync(path.join(__dirname, "..", "game", "assets", "effects", "challenge-effect.png")),
  "sprite challenge-effect.png ausente");

const css = fs.readFileSync(path.join(__dirname, "..", "game", "css", "layout.css"), "utf8");
must(css.includes("#game-loading{display:none;"),
  "overlay de loading sem display:none padrão");

console.log("OK: imbuements Canary, Challenge online, prey e FX de exeta.");
