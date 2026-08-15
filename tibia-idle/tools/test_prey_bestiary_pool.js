/* Prey pool = bestiário Canary (ioprey.cpp), não o catálogo inteiro. */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");

function must(c, msg) { assert.ok(c, msg); }

const monsterSrc = fs.readFileSync(path.join(js, "monsterdata.js"), "utf8");
const MONSTERDATA = JSON.parse(
  monsterSrc.replace(/^[\s\S]*?window\.MONSTERDATA\s*=\s*/, "").replace(/;\s*$/, "")
);

const preySrc = fs.readFileSync(path.join(js, "prey.js"), "utf8");
const vm = require("vm");
const ctx = { MONSTERDATA, GAMEDATA: { monsters: MONSTERDATA, hunts: {} }, console, Math, Date };
vm.createContext(ctx);
vm.runInContext(preySrc, ctx);

const {
  preyMonsterPool, preyIsEligible, preyIsEligibleSlug, ensurePrey, preyRerollList,
} = ctx;

const pool = preyMonsterPool();
const poolSet = new Set(pool);
const total = Object.keys(MONSTERDATA).length;
const bosses = Object.keys(MONSTERDATA).filter((s) => MONSTERDATA[s].boss);
const exclusive = Object.keys(MONSTERDATA).filter((s) => MONSTERDATA[s].isPreyExclusive);

must(pool.length > 200, "pool muito pequeno: " + pool.length);
must(pool.length < total * 0.7, "pool ainda parece o catálogo inteiro: " +
  pool.length + "/" + total);
must(pool.length < 900, "pool acima da ordem de grandeza do bestiário Canary");

for (const b of bosses) {
  must(!poolSet.has(b), "boss no pool: " + b);
  must(!preyIsEligible(MONSTERDATA[b]), "boss elegível: " + b);
}

for (const slug of ["rat", "dragon", "cyclops", "demon", "hydra", "rotworm"]) {
  must(MONSTERDATA[slug], "faltando monstro de hunt: " + slug);
  must(preyIsEligibleSlug(slug), "hunt monstro deveria ser elegível: " + slug);
  must(poolSet.has(slug), "hunt monstro fora do pool: " + slug);
}

for (const slug of exclusive) {
  const m = MONSTERDATA[slug];
  if (!m.best || !(m.exp > 0) || m.boss) continue;
  must(!poolSet.has(slug), "isPreyExclusive no reroll: " + slug);
}

must(!preyIsEligible({ name: "X", best: { stars: 1 }, exp: 0 }), "exp 0");
must(!preyIsEligible({ name: "X", exp: 10 }), "sem bestiário");
must(!preyIsEligible({ name: "X", best: {}, exp: 10, boss: 1 }), "flag boss");
must(!preyIsEligible({ name: "X", best: {}, exp: 10, isPreyable: 0 }), "não preyable");
must(preyIsEligible({ name: "X", best: { stars: 2 }, exp: 50 }), "normal ok");

const p = { level: 50, gold: 0, prey: { slots: [
  { unlocked: true, creatures: ["the-monster", "rat"], rerollAt: 0,
    selected: { creature: "the-monster", bonus: "exp", step: 0, until: Date.now() + 999999 } },
  { unlocked: true, creatures: [], rerollAt: 0, selected: null },
  { unlocked: false, creatures: [], rerollAt: 0, selected: null },
] } };
ensurePrey(p);
must(!p.prey.slots[0].selected, "selected boss deve ser limpo");
must(p.prey.slots[0].creatures.length === 9, "slot rerolado após limpar boss");
must(p.prey.slots[0].creatures.every(preyIsEligibleSlug), "lista pós-ensure só elegíveis");

const lista = preyRerollList(p, 1);
must(lista.length === 9, "reroll gera 9");
must(lista.every(preyIsEligibleSlug), "reroll só elegíveis");
must(!lista.some((s) => MONSTERDATA[s] && MONSTERDATA[s].boss), "reroll sem bosses");

const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
must(html.includes("js/prey.js?v=prey-bestiary-v1"), "cache-bust prey.js");
must(html.includes("js/prey-ui.js?v=prey-bestiary-v1"), "cache-bust prey-ui.js");

console.log("OK: prey pool Canary — total=%d pool=%d bosses=%d exclusive=%d",
  total, pool.length, bosses.length, exclusive.length);
