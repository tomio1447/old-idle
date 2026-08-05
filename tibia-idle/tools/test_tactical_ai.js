/* Teste sem dependências externas da IA tática de BOX.
 * Execute: node tibia-idle/tools/test_tactical_ai.js */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..", "game", "js");
const ctx = vm.createContext({ console, Math, Map, Set, window: { MONSTERMOVES: {} }, MOBSHEETS: {} });
vm.runInContext(fs.readFileSync(path.join(root, "grid.js"), "utf8"), ctx, { filename: "grid.js" });
vm.runInContext(fs.readFileSync(path.join(root, "gridai.js"), "utf8"), ctx, { filename: "gridai.js" });

vm.runInContext(`
  const fail = (m) => { throw new Error(m); };
  const mob = (cx, cy, id) => ({ cx, cy, id, hp: 100, slug: "rat", def: {} });
  const knight = { cx: 10, cy: 6, p: { voc: "knight", hp: 100 } };
  const mage = { cx: 7, cy: 6, p: { voc: "sorcerer", hp: 100 } };
  const c = { players: [knight, mage], mobs: [
    mob(9, 5, "a"), mob(10, 5, "b"), mob(11, 5, "c"), mob(9, 6, "d"),
    mob(11, 6, "e"), mob(9, 7, "f"), mob(10, 7, "g"), mob(11, 7, "h")
  ] };

  // 1. O knight valoriza adjacência livre: ocupar um dos lados reduz score.
  const center = { cx: 10, cy: 6 };
  const empty = new Map();
  const blocked = new Map([["9:6", true], ["10:5", true], ["11:6", true]]);
  if (knightBoxScore(c, center, empty, center) <= knightBoxScore(c, center, blocked, center))
    fail("Knight não penalizou adjacência bloqueada.");

  // 2. Mage prefere wave alinhada e não fica adjacente à box.
  const line = waveLineHits(c, { cx: 7, cy: 6 }, knight);
  if (line < 2) fail("Wave não reconheceu corredor rumo ao knight.");
  const safe = mageBoxScore(c, { cx: 7, cy: 6 }, knight);
  const unsafe = mageBoxScore(c, { cx: 9, cy: 6 }, knight);
  if (safe <= unsafe) fail("Mage não priorizou distância segura da box.");

  // 3. Posição do mage permanece numa reta a 3 SQMs do knight.
  const pos = boxTargetCell(c, mage, new Map());
  const d = Math.max(Math.abs(pos.cx - knight.cx), Math.abs(pos.cy - knight.cy));
  if (d !== 3 || (pos.cx !== knight.cx && pos.cy !== knight.cy))
    fail("Mage saiu da reta de 3 SQMs: " + JSON.stringify(pos));

  // 4. Reserva bloqueia a mesma posição para o próximo membro planejar.
  const c2 = { players: [], mobs: [], _formationReservations: new Map() };
  const a = { cx: 1, cy: 1, p: { voc: "sorcerer", hp: 100 } };
  const b = { cx: 2, cy: 1, p: { voc: "druid", hp: 100 } };
  const chooser = (combat, ent, occ) => occ.has("5:5") ? { cx: 6, cy: 5 } : { cx: 5, cy: 5 };
  formationThinkStep(c2, a, null, new Map(), 100, chooser);
  formationThinkStep(c2, b, null, new Map(), 100, chooser);
  const ra = c2._formationReservations.get(a), rb = c2._formationReservations.get(b);
  if (!ra || !rb || ra.cx === rb.cx && ra.cy === rb.cy) fail("Reserva não separou posições da formação.");

  // 5. Movimento de monstro é deliberadamente mais estático (mínimo 95%).
  if (monsterStaticChance({ slug: "rat", def: {} }) < 95) fail("Monstro ainda se move demais.");
  console.log("OK: IA tática — segurança, wave, adjacência, reservas e estabilidade.");
`, ctx);
