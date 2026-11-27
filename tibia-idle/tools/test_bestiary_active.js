"use strict";
/* test_bestiary_active.js — bestiário/bosstiário listam SÓ criaturas
 * ativas no jogo (hunts + quests + BOSS_DEFS), não o dump Canary inteiro.
 * Cobre:
 *   - activeMonsterSlugs: hunts ativas (monsters + spawnWeights), quests
 *     (waveMonsters + boss), comingSoon excluído
 *   - bestiarySlugs: ativos sem flag boss
 *   - bosstiaryList: boss ativo + sprite (monsterPlayable via MOBSHEETS,
 *     não o flag m.jogavel stale), filtro de categoria
 *   - renderCycloBestiary e bestiarySummary/bestiaryFinishedList usam o set
 * Uso: node tools/test_bestiary_active.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(cond, label, extra) {
  if (cond) { passed++; console.log("  ok:", label); }
  else { failed++; console.log("  FALHOU:", label, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
}
function grab(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(name + " ausente");
  let d = 0;
  const j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}" && !--d) return src.slice(i, k + 1);
  }
  throw new Error(name + " sem fechamento");
}

const cycSrc = fs.readFileSync(path.join(root, "game", "js", "cyclopedia.js"), "utf8");
const bosSrc = fs.readFileSync(path.join(root, "game", "js", "bosstiary.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "game", "js", "cyclopedia-ui.js"), "utf8");

/* ---------- ambiente stub ---------- */
const sandbox = {
  GAMEDATA: {
    monsters: {
      "rat":          { name: "Rat", hp: 20 },
      "cave-rat":     { name: "Cave Rat", hp: 30 },
      "hydra":        { name: "Hydra", hp: 2000 },
      "demon":        { name: "Demon", hp: 8200 },
      "plagueroot":   { name: "Plagueroot", hp: 320000, boss: true },
      "azerus":       { name: "Azerus", hp: 26000, boss: true },
      "patch-boss":   { name: "Patch Boss", hp: 90000, boss: true, jogavel: false },
      "inactive-boss":{ name: "Off Boss", hp: 99000, boss: true, jogavel: true },
      "inactive-mob": { name: "Off Mob", hp: 50 },
      "no-sheet-boss":{ name: "Ghost Boss", hp: 80000, boss: true, jogavel: true },
    },
    hunts: {
      "rats":            { monsters: ["rat", "cave-rat"], spawnWeights: { rat: 1 } },
      "plagueroot-room": { monsters: ["plagueroot"] },
      "patch-room":      { monsters: ["patch-boss"] },
      "soon-hunt":       { monsters: ["inactive-mob"], comingSoon: true },
      "spawn-only":      { spawnWeights: { hydra: 100 } },
    },
  },
  QUEST_DEFS: {
    "dream-scar": { waveMonsters: ["demon"], boss: "azerus" },
  },
  BOSS_DEFS: {
    "the-monster": { baseMonster: "cave-rat", sprite: "cave-rat" },
  },
  /* MOBSHEETS: patch-boss tem sheet registrada por patch (sem flag jogavel);
   * no-sheet-boss é ativo mas não tem arte → fora. */
  MOBSHEETS: {
    "plagueroot": {}, "azerus": {}, "patch-boss": {}, "inactive-boss": {},
  },
};
vm.createContext(sandbox);
vm.runInContext(
  grab(cycSrc, "activeMonsterSlugs") + "\n" + grab(cycSrc, "bestiarySlugs"),
  sandbox);
vm.runInContext(
  grab(bosSrc, "bossCategory") + "\n" + grab(bosSrc, "bosstiaryList"),
  sandbox);
// monsterPlayable real (monsters.js) lê MOBSHEETS
const monSrc = fs.readFileSync(path.join(root, "game", "js", "monsters.js"), "utf8");
vm.runInContext(grab(monSrc, "monsterPlayable"), sandbox);
const r = (code) => vm.runInContext(code, sandbox);

/* ---------- activeMonsterSlugs ---------- */
console.log("\n[1] activeMonsterSlugs");
const ativos = r("[...activeMonsterSlugs()].sort()");
check(JSON.stringify(ativos) === JSON.stringify(
  ["azerus", "cave-rat", "demon", "hydra", "patch-boss", "plagueroot", "rat"]),
  "hunts + spawnWeights + quest waveMonsters/boss; comingSoon fora", ativos);
check(!ativos.includes("inactive-mob") && !ativos.includes("inactive-boss"),
  "monstro/boss de hunt comingSoon não entra", ativos);

/* ---------- bestiarySlugs ---------- */
console.log("\n[2] bestiarySlugs");
const best = r("bestiarySlugs().sort()");
check(JSON.stringify(best) === JSON.stringify(["cave-rat", "demon", "hydra", "rat"]),
  "ativos sem flag boss (plagueroot/azerus/patch-boss fora)", best);
check(!best.includes("inactive-mob"), "monstro inativo fora", best);

/* ---------- bosstiaryList ---------- */
console.log("\n[3] bosstiaryList");
const bosses = r("bosstiaryList().sort()");
check(bosses.includes("plagueroot") && bosses.includes("azerus") && bosses.includes("patch-boss"),
  "bosses de hunt ativa + quest + patch entram", bosses);
check(!bosses.includes("inactive-boss"), "boss sem presença no jogo fica fora", bosses);
check(!bosses.includes("no-sheet-boss"), "boss ativo sem sprite fica fora", bosses);
check(!bosses.includes("rat") && !bosses.includes("demon"), "não-boss nunca entra", bosses);
check(r("bosstiaryList('nemesis').sort()").includes("plagueroot") &&
      !r("bosstiaryList('nemesis')").includes("patch-boss"),
  "filtro de categoria respeitado", r("bosstiaryList('nemesis')"));

/* ---------- integração: UI e summary usam o set ---------- */
console.log("\n[4] integração");
check(uiSrc.includes("bestiarySlugs()") && uiSrc.includes("typeof bestiarySlugs === \"function\""),
  "renderCycloBestiary usa bestiarySlugs");
check(/const todos = bestiarySlugs\(\)/.test(cycSrc), "bestiarySummary conta só ativos");
check(/for \(const s of bestiarySlugs\(\)\)/.test(cycSrc),
  "bestiaryFinishedList itera só ativos");
check(cycSrc.includes("activeMonsterSlugs, bestiarySlugs"),
  "helpers exportados no module.exports");

console.log(`\n${passed} ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);
