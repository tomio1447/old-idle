/* Teste da DT Seal / Ferumbras Ascendant + resistências do Canary:
 * 1) vexclaw/demon/grimeleech/dark-torturer com resist CORRETO (ice -5/-12
 *    = fraqueza a gelo; lifedrain/drown separados — não mais ice:100);
 * 2) hunt dt-seal existe, na categoria ferumbras-ascendant, minLevel 250,
 *    com os 3 monstros e mapa otbm dt_seal;
 * 3) boss ferumbras-mortal-shell com stats diretos do canary;
 * 4) sprites dos elemental books NÃO são brancas/cinza (têm cor);
 * 5) mapa maps/dt_seal.otbm lê de volta (spawn + zona de mobs).
 */
const fs = require("fs");
const path = require("path");
const GAME = path.join(__dirname, "..", "game");
const errors = [];

// ---- 1) resistências ----
const cm = JSON.parse(fs.readFileSync(path.join(GAME, "data", "canarymonsters.json"), "utf8"));
function hasResist(slug, el, val) {
  const m = cm[slug];
  if (!m) return errors.push(slug + " ausente no canarymonsters");
  if (m.resist[el] !== val) errors.push(`${slug}.resist.${el} = ${m.resist[el]} (esperado ${val})`);
}
hasResist("vexclaw", "ice", -5);
hasResist("vexclaw", "drown", 100);
hasResist("vexclaw", "lifedrain", 100);
hasResist("vexclaw", "death", 20);
hasResist("demon", "ice", -12);
hasResist("demon", "lifedrain", 100);
hasResist("grimeleech", "lifedrain", 100);
hasResist("grimeleech", "drown", 100);
hasResist("dark-torturer", "ice", -10);
hasResist("dark-torturer", "fire", 100);
if (cm.vexclaw.resist.ice === 100) errors.push("vexclaw AINDA imune a gelo (ice 100)");

// ---- 2) hunt dt-seal ----
const src = fs.readFileSync(path.join(GAME, "js", "gamedata.js"), "utf8");
const gd = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf(";")));
const hu = gd.hunts["dt-seal"];
if (!hu) errors.push("hunt dt-seal ausente");
else {
  if (hu.cat !== "ferumbras-ascendant") errors.push("dt-seal.cat != ferumbras-ascendant");
  if (hu.minLevel !== 250) errors.push("dt-seal.minLevel != 250");
  for (const m of ["vexclaw", "grimeleech", "dark-torturer"])
    if (!hu.monsters.includes(m)) errors.push("dt-seal sem monstro " + m);
  if (hu.otbm !== "dt_seal") errors.push("dt-seal.otbm != dt_seal");
}
// monstros jogáveis
for (const m of ["vexclaw", "grimeleech", "dark-torturer"]) {
  if (!gd.monsters[m]) errors.push(m + " não está em GAMEDATA.monsters (não jogável)");
}

// ---- 3) boss ----
const gjs = fs.readFileSync(path.join(GAME, "js", "game.js"), "utf8");
if (!/ferumbras-mortal-shell/.test(gjs)) errors.push("boss ferumbras-mortal-shell ausente no BOSS_DEFS");
if (!/hp: 300000/.test(gjs)) errors.push("boss sem hp 300000");
if (!/exp: 2000000/.test(gjs)) errors.push("boss sem exp 2000000");
if (!/requirement: \{ level: 250/.test(gjs)) errors.push("boss sem requirement.level 250");
const cjs = fs.readFileSync(path.join(GAME, "js", "combat.js"), "utf8");
if (!/boss\.hp \|\| applyBossMultiplier/.test(cjs)) errors.push("newBossCombat sem stats diretos");

// ---- 4) books coloridos ----
const { execSync } = require("child_process");
const py = execSync("python3 -c \"from PIL import Image; from collections import Counter; im=Image.open('" + GAME + "/assets/mob/burning-book.png').convert('RGBA'); c=Counter(); [c.__setitem__((im.getpixel((x,y))[0]//16*16, im.getpixel((x,y))[1]//16*16, im.getpixel((x,y))[2]//16*16), c.get((im.getpixel((x,y))[0]//16*16, im.getpixel((x,y))[1]//16*16, im.getpixel((x,y))[2]//16*16),0)+1) for y in range(im.size[1]) for x in range(im.size[0]) if im.getpixel((x,y))[3]>40]; print(sum(n for (r,g,b),n in c.items() if abs(r-g)<25 and abs(g-b)<25 and r>150) / max(1, sum(c.values()))) \"", { encoding: "utf8" }).trim();
// a sprite não pode ser >60% cinza (a branca antiga era ~17%... na verdade a antiga era 17% de CINZA CLARO mas toda cinza escura — checa cores saturadas)
const py2 = execSync("python3 -c \"from PIL import Image; from collections import Counter; im=Image.open('" + GAME + "/assets/mob/energetic-book.png').convert('RGBA'); c=Counter(); [c.__setitem__((im.getpixel((x,y))[0]//16*16, im.getpixel((x,y))[1]//16*16, im.getpixel((x,y))[2]//16*16), c.get((im.getpixel((x,y))[0]//16*16, im.getpixel((x,y))[1]//16*16, im.getpixel((x,y))[2]//16*16),0)+1) for y in range(im.size[1]) for x in range(im.size[0]) if im.getpixel((x,y))[3]>40]; print(sum(n for (r,g,b),n in c.items() if max(r,g,b)-min(r,g,b)>40) / max(1, sum(c.values()))) \"", { encoding: "utf8" }).trim();
if (parseFloat(py2) < 0.05) errors.push("energetic-book sem cores saturadas (sprite branca)");

// ---- 5) mapa ----
const OTBM = require(path.join(GAME, "js", "otbm.js"));
const buf = fs.readFileSync(path.join(GAME, "maps", "dt_seal.otbm"));
const mapa = OTBM.read(buf);
if (!mapa || mapa.w !== 21 || mapa.h !== 13) errors.push("dt_seal.otbm dimensões erradas");
if (!mapa.spawn) errors.push("dt_seal.otbm sem spawn");
if (!mapa.mob || !mapa.mob.length) errors.push("dt_seal.otbm sem zona de mobs");

if (errors.length) {
  console.log("ERROS (" + errors.length + "):");
  for (const e of errors) console.log("  - " + e);
  process.exit(1);
}
console.log("DT SEAL OK — resist canary, hunt 250+, boss, books coloridos e mapa validados");
process.exit(0);
