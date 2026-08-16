/* Exori / exori gran: self-AoE 3x3 ao redor do knight, NÃO no alvo.
 * Execute: node tibia-idle/tools/test_exori_self_aoe.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../server/authoritative_engine");

function must(ok, msg) { if (!ok) throw Error(msg); }

const auth = { gridW: 30, gridH: 30 };
function cell(cx, cy, extra) {
  return Object.assign({
    cx, cy, hp: 100,
    x: (cx + 0.5) / 30, y: (cy + 0.5) / 30,
  }, extra || {});
}

/* --- SPELL_TARGET / fromCaster --- */
for (const id of ["exori", "exori-gran", "exori-mas", "exori-min", "exori-scu"]) {
  must(engine.SPELL_TARGET[id] && engine.SPELL_TARGET[id].self === 1,
    id + " sem self:1 no SPELL_TARGET");
  must(engine.spellAreaFromCaster(engine.ALL_SPELLS[id].area, engine.ALL_SPELLS[id]),
    id + " spellAreaFromCaster deveria ser true");
}

const caster = cell(10, 10, { id: "knight" });
const far = cell(20, 20, { id: "far" });
const adj = cell(11, 10, { id: "adj" });
const diag = cell(11, 11, { id: "diag" });
const out2 = cell(12, 10, { id: "out2" });

/* --- exori: 9 células do 3x3 no caster --- */
const exori = engine.ALL_SPELLS.exori;
must(exori && exori.area === "AREA_SQUARE1X1", "exori sem AREA_SQUARE1X1");
const exoriCells = engine.spellAreaCells(auth, exori, caster, far);
must(exoriCells.length === 9, "exori deveria cobrir 9 SQM, obteve " + exoriCells.length);
must(exoriCells.some((c) => c.cx === 10 && c.cy === 10), "exori deve incluir o SQM do caster");
must(!exoriCells.some((c) => c.cx === 20 && c.cy === 20), "exori NÃO pode ancorar no alvo longe");
must(exoriCells.every((c) => Math.abs(c.cx - 10) <= 1 && Math.abs(c.cy - 10) <= 1),
  "exori cells fora da box 3x3 do caster: " + JSON.stringify(exoriCells));

const exoriHits = engine.spellAreaTargets(auth, exori, caster, far, [far, adj, diag, out2]);
const exoriIds = (exoriHits || []).map((m) => m.id).sort();
must(exoriIds.join(",") === "adj,diag",
  "exori deveria acertar só adj+diag ao redor do caster, obteve " + exoriIds.join(","));

/* --- exori gran: mesma box 3x3 no caster --- */
const gran = engine.ALL_SPELLS["exori-gran"];
must(gran && gran.area === "AREA_SQUARE1X1", "exori-gran sem AREA_SQUARE1X1");
const granCells = engine.spellAreaCells(auth, gran, caster, far);
must(granCells.length === 9, "exori gran deveria cobrir 9 SQM, obteve " + granCells.length);
must(granCells.some((c) => c.cx === 10 && c.cy === 10), "exori gran deve incluir o SQM do caster");
must(!granCells.some((c) => c.cx === 20 && c.cy === 20), "exori gran NÃO pode ancorar no alvo");
must(granCells.every((c) => Math.abs(c.cx - 10) <= 1 && Math.abs(c.cy - 10) <= 1),
  "exori gran cells fora da box do caster");

const granHits = engine.spellAreaTargets(auth, gran, caster, far, [far, adj, out2]);
must((granHits || []).map((m) => m.id).join(",") === "adj",
  "exori gran deveria acertar só o adjacente: " + JSON.stringify((granHits || []).map((m) => m.id)));

/* --- cliente: areaCells / areaSaiDoConjurador --- */
const game = path.join(__dirname, "..", "game", "js");
const ctx = { window: {}, console };
ctx.globalThis = ctx.window;
for (const f of ["areadata.js", "spelltargetdata.js", "spelldata_1525.js", "patch_clientfx.js", "area.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(game, f), "utf8"), ctx, { filename: f });
}
must(typeof ctx.areaSaiDoConjurador === "function" && typeof ctx.areaCells === "function",
  "area.js não carregou no sandbox");
must(ctx.areaSaiDoConjurador("AREA_SQUARE1X1", "exori") === true,
  "cliente areaSaiDoConjurador(exori) deveria ser true");
must(ctx.areaSaiDoConjurador("AREA_SQUARE1X1", "exori-gran") === true,
  "cliente areaSaiDoConjurador(exori-gran) deveria ser true");

const clientExori = ctx.areaCells("AREA_SQUARE1X1", caster, far, "exori");
must(clientExori.length === 9 && clientExori.every((c) => Math.abs(c.cx - 10) <= 1 && Math.abs(c.cy - 10) <= 1),
  "cliente exori cells não centraram no caster: " + JSON.stringify(clientExori));
const clientGran = ctx.areaCells("AREA_SQUARE1X1", caster, far, "exori-gran");
must(clientGran.length === 9 && !clientGran.some((c) => c.cx === 20 && c.cy === 20),
  "cliente exori-gran ancorou no alvo");

/* Contraste: explosion rune / AREA_SQUARE1X1 sem self continua no alvo */
must(ctx.areaSaiDoConjurador("AREA_SQUARE1X1", null) === false,
  "AREA_SQUARE1X1 sem spellId deve continuar ancorada no alvo (runas)");

console.log("OK: exori / exori gran ancoram 3x3 no caster (server + client).");
