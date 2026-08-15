/* Rates de loot aumentam chance, nunca quantidade (cliente + servidor). */
const fs = require("fs"), path = require("path");
const combat = fs.readFileSync(path.join(__dirname, "..", "game", "js", "combat.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server", "authoritative_engine.js"), "utf8");

if (!/l\.chance \* lootRate \* \(c\.lootMul \|\| 1\)/.test(combat))
  throw Error("Multiplicadores não aplicados à chance no cliente");
if (/const boosted = count \* lootRate/.test(combat) || /const boosted = count \* c\.lootMul/.test(combat))
  throw Error("Multiplicador ainda altera quantidade no cliente");

if (!/chanceMult\s*=\s*lootRate/.test(server))
  throw Error("Servidor sem chanceMult=lootRate");
if (/finalCount\s*=\s*Math\.max\(1,\s*Math\.floor\(count\s*\*/.test(server))
  throw Error("Servidor ainda multiplica quantidade (finalCount=count*…)");
if (/count\s*\*\s*lootMult|count\s*\*\s*lootRate|count\s*\*\s*chanceMult/.test(server))
  throw Error("Servidor multiplica count por rate/mult");

console.log("OK: loot rate/PvP alteram somente chance (cliente+servidor), não o max do item.");
