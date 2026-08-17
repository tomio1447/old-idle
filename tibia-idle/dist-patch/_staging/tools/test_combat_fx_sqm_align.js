/* Impact FX / areafx devem cair no centro do SQM alvo (não no caster, não
 * meio tile ao sul por âncora centrada em strips 64px). */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const root = path.join(__dirname, "..");
const game = path.join(root, "game");
const renderSrc = fs.readFileSync(path.join(game, "js", "render.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(game, "js", "game.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(game, "index.html"), "utf8");

must(renderSrc.includes("function effectTileOrigin"),
  "effectTileOrigin ausente — 64px FX ainda centralizam e derrapam ao sul");
must(renderSrc.includes("effectTileOrigin(e.x * W, e.y * H, drawW, drawH, tile)"),
  "draw de efeitos não usa effectTileOrigin");
must(!/e\.x \* W - fw \* sc \/ 2, e\.y \* H - img\.naturalHeight \* sc \/ 2/.test(renderSrc),
  "draw ainda centraliza FX em Y (regressão half-tile sul)");
must(gameSrc.includes("cellToScreen(Number(cel.cx), Number(cel.cy), gw, gh)"),
  "areafx deve usar cellToScreen do SQM absoluto");
must(!gameSrc.includes('(target||caster)'),
  "areafx não pode cair no caster quando o alvo some");
must(gameSrc.includes("const x = ex(e), y = ey(e);") ||
  gameSrc.includes("const x = ex(e), y = ey(e)"),
  "impacto/crit não deve herdar o offset dual do floater");
must(indexSrc.includes("js/render.js?v=fx-sqm-align-v1") &&
  indexSrc.includes("js/game.js?v=fx-sqm-align-v1"),
  "cache-bust fx-sqm-align-v1 ausente");

// Geometria: 32px = mesmo que centro; 64px sobe 0.5 tile (pé no fundo do SQM).
const start = renderSrc.indexOf("function effectTileOrigin");
const end = renderSrc.indexOf("\nfunction markMonsterAnchor", start);
must(start >= 0 && end > start, "não isolou effectTileOrigin");
const geo = {};
vm.createContext(geo);
vm.runInContext(renderSrc.slice(start, end), geo);
const tile = 40, cx = 100, cy = 100;
const o32 = geo.effectTileOrigin(cx, cy, tile, tile, tile);
must(o32.x === cx - tile / 2 && o32.y === cy - tile / 2,
  "32px deveria coincidir com o top-left do SQM: " + JSON.stringify(o32));
const o64 = geo.effectTileOrigin(cx, cy, tile * 2, tile * 2, tile);
must(o64.x === cx - tile && o64.y === cy - tile * 1.5,
  "64px deveria ancorar no chão (não no centro): " + JSON.stringify(o64));
must(o64.y + tile * 2 === cy + tile / 2,
  "base do FX 64px deve coincidir com o fundo do SQM");

// exevo dir san: areafx no ALVO (não no caster), células absolutas.
function clone(v) { return JSON.parse(JSON.stringify(v)); }
const paladin = {
  id: 1, name: "RP", voc: "paladin", level: 100, exp: engine.expForLevel(100),
  hp: 2000, mp: 2000, gold: 0, ml: 30,
  skills: { fist: 10, sword: 10, axe: 10, club: 10, dist: 70, shield: 40 },
  equip: { weapon: { item: "royal-crossbow" }, ammo: { item: "diamond-arrow" } },
  supplies: {}, lootPouch: {}, kills: {}, bosses: {},
  config: { spellAttack: true, combo: [{ kind: "spell", id: "exevo-dir-san", min: 1 }] },
};
const member = { id: "1", p: clone(paladin) };
const desc = {
  v: 1, savedAt: 1000, kind: "hunt", huntId: "rats", instanceMode: "non-pvp",
  activeCharacterId: "1", members: [member],
  state: {
    gridW: 30, gridH: 30, events: [],
    players: [{ id: "1", p: member.p, cx: 10, cy: 10, x: 10.5 / 30, y: 10.5 / 30 }],
    mobs: [{ id: "tgt", slug: "rat", cx: 15, cy: 12, x: 15.5 / 30, y: 12.5 / 30,
      hp: 999999, maxHp: 999999 }],
  },
};
const live = engine.initializeAuthority(desc, "a".repeat(64), 1000);
for (const mob of live.authority.mobs || []) {
  mob.hp = 999999; mob.maxHp = 999999; mob.damage = 0; mob.attackAcc = -1e9;
  mob.def = Object.assign({}, mob.def, { skills: [] });
}
live.authority.players[0].attackAcc = 8000;
const after = JSON.parse(engine.advanceAuthorityState(JSON.stringify(live), 1000, 2000).state);
const area = (after.state.events || []).find((e) => e.t === "areafx" &&
  (e.fx === "divine-barrage-effect" || e.spell === "Divine Barrage"));
must(area && Array.isArray(area.cells) && area.cells.length >= 9,
  "exevo dir san sem areafx de barrage: " + JSON.stringify(area));
must(area.anchor === "target",
  "barrage deve ancorar no alvo, não no caster");
must(area.cells.some((c) => c.cx === 15 && c.cy === 12),
  "areafx deve incluir o SQM do alvo (15,12)");
must(!area.cells.some((c) => c.cx === 10 && c.cy === 10),
  "areafx não deve pintar o SQM do caster");

// Simula drain areafx sem o mob vivo: cellToScreen ainda centra no tile.
const drainStart = gameSrc.indexOf('case "areafx"');
const drainEnd = gameSrc.indexOf('case "chain"', drainStart);
must(drainStart >= 0 && drainEnd > drainStart, "bloco areafx ausente");
const areafxBlock = gameSrc.slice(drainStart, drainEnd);
must(areafxBlock.includes("cellToScreen(Number(cel.cx), Number(cel.cy), gw, gh)"),
  "drain areafx sem cellToScreen absoluto");
must(!areafxBlock.includes("target||caster"),
  "drain areafx ainda faz fallback para caster");

console.log("OK: combat FX alinhados ao SQM do alvo (areafx + âncora 64px).");
