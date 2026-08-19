/* Forked Glacier / Forked Thorns (15.25): cadeia, FX, say e vocação.
 * Execute: node tibia-idle/tools/test_forked_druid_spells.js */
"use strict";
const fs = require("fs");
const path = require("path");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

const game = path.join(__dirname, "..", "game");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(html.includes("js/combat.js?v=")
  && html.includes("js/game.js?v=")
  && html.includes("js/spelldata_1525.js?v=forked-chain-v1")
  && html.includes("js/patch_clientfx.js?v=forked-chain-v1")
  && html.includes("js/core.js?v=forked-chain-v1")
  && html.includes("js/combo.js?v=forked-chain-v1")
  && html.includes("js/render.js?v=chain-path-v1"),
  "cache-bust chain-path-v1 ausente no index.html");

const gameJs = fs.readFileSync(path.join(game, "js", "game.js"), "utf8");
must(gameJs.includes("event.chain&&event.fromId")
  && gameJs.includes("case \"chain\"")
  && gameJs.includes("e.impactFx")
  && gameJs.includes("chainPath"),
  "cliente sem hops fromId / chain links / impactFx / chainPath");
const combatJs = fs.readFileSync(path.join(game, "js", "combat.js"), "utf8");
must(combatJs.includes("s.chainDist") && combatJs.includes("fromId")
  && combatJs.includes("spellChainVisualPath") && combatJs.includes("chainPath"),
  "cliente sem chainDist / fromId / caminho visual da cadeia");

const glacier = engine.ALL_SPELLS["exevo-fur-frigo"];
const thorns = engine.ALL_SPELLS["exevo-fur-tera"];
must(glacier && glacier.words === "exevo fur frigo" && glacier.vocs.indexOf("druid") >= 0
  && glacier.chain === 7 && glacier.chainDist === 4 && glacier.range === 7
  && glacier.mana === 180 && glacier.cd === 6000 && glacier.grupos && glacier.grupos["1"] === 2000
  && glacier.element === "ice",
  "Forked Glacier fora do Canary 15.25: " + JSON.stringify({
    words: glacier && glacier.words, chain: glacier && glacier.chain,
    dist: glacier && glacier.chainDist, mana: glacier && glacier.mana
  }));
must(thorns && thorns.words === "exevo fur tera" && thorns.vocs.indexOf("druid") >= 0
  && thorns.chain === 6 && thorns.chainDist === 4 && thorns.range === 7
  && thorns.mana === 180 && thorns.element === "earth",
  "Forked Thorns fora do Canary 15.25");
must(engine.spellAllowedForVoc(glacier, "druid")
  && engine.spellAllowedForVoc(glacier, "elder druid")
  && !engine.spellAllowedForVoc(glacier, "sorcerer")
  && !engine.spellAllowedForVoc(glacier, "monk"),
  "Forked Glacier deve ser só de druid");
must(engine.spellVisual(glacier).fx === "forked-glacier-effect"
  && engine.spellVisual(glacier).missile === "ice"
  && engine.spellVisual(thorns).fx === "forked-thorns-effect"
  && engine.spellVisual(thorns).missile === "earth",
  "FX/míssil oficial das Forked ausente");

function druid(id, extra) {
  return Object.assign({
    id, name: "ED" + id, voc: "druid", level: 100, exp: 500000,
    hp: 1500, mp: 2000, gold: 5000, ml: 40,
    skills: { sword: 10, axe: 10, club: 10, dist: 10, fist: 10, shield: 20 },
    equip: { weapon: { item: "hailstorm-rod" } }, supplies: {}, lootPouch: {},
    kills: {}, bosses: {},
    config: { spellAttack: true, combo: [{ kind: "spell", id: "exevo-fur-frigo", min: 1 }] }
  }, extra || {});
}
function cellMob(id, cx, cy) {
  return { id: String(id), slug: "rat", cx: cx, cy: cy, x: (cx + 0.5) / 30, y: (cy + 0.5) / 30 };
}
function descriptor(players, mobs) {
  const members = (players || []).map((p) => ({ id: String(p.id), p: clone(p) }));
  return {
    v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
    activeCharacterId: String(players[0].id), members,
    state: {
      gridW: 30, gridH: 30, events: [],
      players: members.map((m, i) => ({
        id: m.id, p: m.p, cx: 10 + i, cy: 10,
        x: (10.5 + i) / 30, y: 10.5 / 30
      })),
      mobs: mobs || [cellMob("near", 11, 10)]
    }
  };
}
function prep(auth) {
  for (const item of auth.authority.players) item.attackAcc = 2000;
  for (const mob of auth.authority.mobs) {
    mob.hp = mob.maxHp = 999999;
    mob.damage = 0;
    mob.walkAcc = -1e9;
    mob.def = Object.assign({}, mob.def, { skills: [], defSkills: [] });
  }
  return auth;
}
function swing(p, extraMobs) {
  const desc = descriptor([p], extraMobs);
  const live = prep(engine.initializeAuthority(desc, String(p.id).repeat(32), 1000));
  return JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 1000, 2000).state);
}

const line = [cellMob("p", 12, 10), cellMob("m1", 13, 10), cellMob("m2", 14, 10),
  cellMob("m3", 15, 10), cellMob("m4", 16, 10), cellMob("m5", 17, 10), cellMob("m6", 18, 10)];

const ice = swing(druid(1), line);
const iceHits = (ice.state.events || []).filter((e) => e.t === "hit" && e.spellId === "exevo-fur-frigo");
must(iceHits.length === 7, "Forked Glacier online deveria acertar 7 alvos, obteve " + iceHits.length);
must(iceHits.every((e) => e.fx === "forked-glacier-effect" && e.el === "ice" && e.missile === "ice"),
  "hits de Glacier sem forked-glacier-effect/ice: " + JSON.stringify(iceHits.map((e) => ({ fx: e.fx, el: e.el, miss: e.missile }))));
must(iceHits[0].chain !== 1 && iceHits.slice(1).every((e) => e.chain === 1 && e.fromId),
  "hops de Glacier sem chain/fromId: " + JSON.stringify(iceHits.map((e) => ({ chain: e.chain, fromId: e.fromId, id: e.targetId }))));
must(iceHits[1].fromId === iceHits[0].targetId,
  "primeiro salto não saiu do primário");
must(iceHits[0].projectile && iceHits[1].projectile,
  "míssil da cadeia deve voar no primário e em cada salto");
must((ice.state.events || []).some((e) => e.t === "say" && e.text === "exevo fur frigo"),
  "say exevo fur frigo ausente");
const iceChain = (ice.state.events || []).find((e) => e.t === "chain" && e.spellId === "exevo-fur-frigo");
must(iceChain && iceChain.n === 7 && Array.isArray(iceChain.links) && iceChain.links.length === 7
  && iceChain.fx === "forked-glacier-effect" && iceChain.impactFx === "forked-glacier-effect"
  && iceChain.chainFx === "chain-effect-blue",
  "evento chain de Glacier incompleto: " + JSON.stringify(iceChain));
must(Array.isArray(iceChain.path) && iceChain.path.length >= 1,
  "Glacier deveria pintar ao menos o SQM vazio caster→primário, obteve " + (iceChain.path && iceChain.path.length));
const icePathFx = (ice.state.events || []).filter((e) => e.t === "areafx" && e.chainPath && e.spellId === "exevo-fur-frigo");
must(icePathFx.length >= 1 && icePathFx.every((e) => e.fx === "chain-effect-blue"),
  "areafx chainPath do Glacier ausente/errado: " + JSON.stringify(icePathFx));
must(ice.state.players[0].p.mp === 2000 - 180, "mana 180 não foi cobrada no Glacier");

const earth = swing(druid(2, { config: { spellAttack: true, combo: [{ kind: "spell", id: "exevo-fur-tera", min: 1 }] } }), line);
const earthHits = (earth.state.events || []).filter((e) => e.t === "hit" && e.spellId === "exevo-fur-tera");
must(earthHits.length === 6, "Forked Thorns online deveria acertar 6 alvos, obteve " + earthHits.length);
must(earthHits.every((e) => e.fx === "forked-thorns-effect" && e.el === "earth"),
  "hits de Thorns sem forked-thorns-effect/earth");
must((earth.state.events || []).some((e) => e.t === "say" && e.text === "exevo fur tera"),
  "say exevo fur tera ausente");
const earthChain = (earth.state.events || []).find((e) => e.t === "chain" && e.spellId === "exevo-fur-tera");
must(earthChain && earthChain.n === 6 && earthChain.fx === "forked-thorns-effect"
  && earthChain.chainFx === "chain-effect-green",
  "evento chain de Thorns incompleto: " + JSON.stringify(earthChain));
must(Array.isArray(earthChain.path) && earthChain.path.length >= 1
  && (earth.state.events || []).some((e) => e.t === "areafx" && e.chainPath && e.fx === "chain-effect-green"),
  "Thorns sem path/areafx nos SQMs vazios");

/* Caster (10,10) → alvo longe (14,10): distância 4 → 3 SQMs vazios no meio (N>2). */
const gap = swing(druid(10), [cellMob("far", 14, 10)]);
const gapHits = (gap.state.events || []).filter((e) => e.t === "hit" && e.spellId === "exevo-fur-frigo");
must(gapHits.length === 1 && gapHits[0].dmg > 0, "dano do salto longo não deve mudar");
const gapChain = (gap.state.events || []).find((e) => e.t === "chain" && e.spellId === "exevo-fur-frigo");
must(gapChain && Array.isArray(gapChain.path) && gapChain.path.length > 2,
  "caminho caster→alvo dist4 deveria ter N>2 SQMs vazios, obteve " + (gapChain && gapChain.path && gapChain.path.length)
  + " path=" + JSON.stringify(gapChain && gapChain.path));
must(gapChain.path.length === 3 && gapChain.path.every((c) => c.cy === 10 && c.cx >= 11 && c.cx <= 13),
  "SQMs do caminho fora da linha horizontal: " + JSON.stringify(gapChain.path));
const gapAreafx = (gap.state.events || []).filter((e) => e.t === "areafx" && e.chainPath);
must(gapAreafx.length >= 1 && gapAreafx.reduce((n, e) => n + (e.cells || []).length, 0) === 3,
  "areafx chainPath dist4 deveria cobrir 3 células");

const solo = swing(druid(3), [cellMob("only", 12, 10)]);
const soloHits = (solo.state.events || []).filter((e) => e.t === "hit" && e.spellId === "exevo-fur-frigo");
must(soloHits.length === 1 && soloHits[0].fx === "forked-glacier-effect" && soloHits[0].dmg > 0,
  "com 1 mob o Glacier ainda deve acertar o primário com FX: " + JSON.stringify(soloHits));
const soloChain = (solo.state.events || []).find((e) => e.t === "chain");
must(soloChain && soloChain.n === 1 && soloChain.links && soloChain.links.length === 1,
  "com 1 mob ainda deve emitir chain+links");

const tooFar = swing(druid(4), [cellMob("p", 12, 10), cellMob("far", 17, 10)]);
const farHits = (tooFar.state.events || []).filter((e) => e.t === "hit" && e.spellId === "exevo-fur-frigo");
must(farHits.length === 1, "salto de 5 SQM não deveria encadear, obteve " + farHits.length);

const mage = swing(Object.assign(druid(5, {
  voc: "sorcerer",
  config: { spellAttack: true, combo: [{ kind: "spell", id: "exevo-fur-frigo", min: 1 }] }
})), line);
must(!(mage.state.events || []).some((e) => e.spellId === "exevo-fur-frigo"),
  "sorcerer não pode lançar Forked Glacier");

console.log("OK: Forked Glacier/Thorns — cadeia Canary, FX, say, vocação druid.");
