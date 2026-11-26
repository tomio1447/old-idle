/* Regressão: remodel da sala do Ratmiral Blackwhiskers (BOSSES 250+).
 *
 * Mapa novo publicado byte-igual de beta-maps/bossesroom/ratmiral_room.otbm
 * (52×38, z=7, bounds 1013..1064 × 1017..1054, 1738 cells / 89 ids — todos
 * com sprite+RME já importados; área caminhável 272 sqm em
 * 1024..1052 × 1028..1040):
 *   playerspawn {1038,1037,7} → local (25,20)
 *   bossspawn  {1038,1031,7} → local (25,14)
 * `otbmBounds` removido da hunt def (o .otbm novo já é o recorte da sala —
 * otbmhunt.js:154 cropparia o mapa se o campo existisse).
 * A mecânica de adds (4 Elite Pirat + 1 Mister Catkiller a cada ~12s via
 * ratmiralBossTick) não muda.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const OTBM = require(path.join(js, "otbm.js"));

/* ---------------- dados do cliente (vm mínimo) ---------------- */
const ctx = { console, Math, Date, Map, Set };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext("var BOSS_DEFS={}, MOBSHEETS={}, MONSTERDATA={}, GAMEDATA={items:{},monsters:{},hunts:{}};", ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "tileflags.js",
                 "ratmiral-boss.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);

/* ---------------- mapa publicado = byte-igual do beta-maps ---------------- */
const beta = fs.readFileSync(path.join(game, "beta-maps", "bossesroom", "ratmiral_room.otbm"));
const pub = fs.readFileSync(path.join(game, "maps", "ratmiral_room.otbm"));
must(pub.equals(beta), "ratmiral_room.otbm publicado difere do beta-maps");

const ab = pub.buffer.slice(pub.byteOffset, pub.byteOffset + pub.byteLength);
const m = OTBM.read(ab, { z: 7 });
must(m.z === 7 && m.w === 52 && m.h === 38, "mapa deve ser 52×38 z=7");
const bb = m.sourceBounds;
must(bb.minX === 1013 && bb.minY === 1017 && bb.maxX === 1064 && bb.maxY === 1054,
  "bounds devem ser 1013..1064 × 1017..1054");

/* ---------------- spawns caminháveis + conectados ---------------- */
vm.runInContext("addEventListener=function(){};", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "otbmhunt.js"), "utf8"), ctx);
const rt = OTBM.huntMapFromOtbm(m, ctx.TILEFLAGS);
const W = (x, y) => rt.rows[y] && rt.rows[y][x] && !rt.leg[rt.rows[y][x]].bloc &&
  !(rt.footprintBlocked && rt.footprintBlocked[x + ":" + y]);
const sx = 1038 - bb.minX, sy = 1037 - bb.minY;
const bx = 1038 - bb.minX, by = 1031 - bb.minY;
must(W(sx, sy), "playerspawn {1038,1037,7} não é caminhável");
must(W(bx, by), "bossspawn {1038,1031,7} não é caminhável");
const R = new Set(), q = [{ x: sx, y: sy }];
while (q.length) {
  const { x, y } = q.pop(), k = x + "," + y;
  if (R.has(k) || !W(x, y)) continue;
  R.add(k);
  for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push({ x: x + a, y: y + c });
}
must(R.has(bx + "," + by), "bossspawn desconectado do playerspawn");
must(R.size === 203, "componente do playerspawn deve ter 203 sqm (achou " + R.size + ")");

/* Todos os tiles usados têm sprite importado. */
const used = new Set();
for (const c of Object.values(m.cells)) {
  if (c.g) used.add(c.g);
  for (const i of c.items || []) used.add(i);
}
const missing = [...used].filter((id) =>
  !fs.existsSync(path.join(game, "assets", "tiles", id + ".png")));
must(missing.length === 0, "tiles sem sprite: " + missing.join(","));

/* ---------------- hunt def ---------------- */
const hu = ctx.GAMEDATA.hunts["ratmiral-room"];
must(hu && hu.hidden === true && hu.cat === "boss-room", "hunt ratmiral-room ausente");
must(hu.otbm === "ratmiral_room" && hu.otbmFloor === 7, "hunt deve usar ratmiral_room z=7");
must(!hu.otbmBounds, "otbmBounds deve ter sido removido (crop obsoleto)");
must(hu.otbmSpawn && hu.otbmSpawn.x === 1038 && hu.otbmSpawn.y === 1037 && hu.otbmSpawn.z === 7,
  "otbmSpawn deve ser {1038,1037,7}");
must(hu.otbmMobBounds && hu.otbmMobBounds.x === 1038 && hu.otbmMobBounds.y === 1031 &&
     hu.otbmMobBounds.w === 1 && hu.otbmMobBounds.h === 1,
  "otbmMobBounds deve ser 1×1 em {1038,1031,7}");
must(hu.monsters[0] === "ratmiral-blackwhiskers" && hu.pack === 1, "monstro/pack errados");

/* ---------------- boss + adds intactos ---------------- */
const b = ctx.BOSS_DEFS["ratmiral-blackwhiskers"];
must(b && b.hunt === "ratmiral-room" && b.cooldown === 16 * 60 * 60 * 1000,
  "BOSS_DEFS ratmiral quebrado");
must(ctx.GAMEDATA.monsters["mister-catkiller"] && ctx.MOBSHEETS["mister-catkiller"],
  "Mister Catkiller (monstro/sheet) ausente");
must(typeof ctx.ratmiralBossInit === "function" && typeof ctx.ratmiralBossTick === "function",
  "mecânica de adds (ratmiralBossInit/Tick) ausente");
must(fs.existsSync(path.join(game, "assets", "mob", "ratmiral-blackwhiskers.png")),
  "sprite do ratmiral ausente");

/* ---------------- index.html ---------------- */
const idx = fs.readFileSync(path.join(game, "index.html"), "utf8");
must(/js\/ratmiral-boss\.js\?v=/.test(idx), "index.html sem tag do ratmiral-boss.js");

console.log("ok: Ratmiral Blackwhiskers — sala ratmiral_room 52×38 publicada (playerspawn {1038,1037,7}, bossspawn {1038,1031,7}, 203 sqm conectados), otbmBounds removido, mecânica Elite Pirat + Mister Catkiller intacta");
