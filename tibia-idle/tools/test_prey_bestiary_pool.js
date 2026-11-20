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

/* Seleção paga por Prey Card: qualquer elegível, mesmo fora da grade de
 * 9 — e isPreyExclusive entra só nesse pool (ListAll_Cards). */
const { preyIsCardEligible, preyIsCardEligibleSlug, preyCardPool, preySelectAny } = ctx;
must(typeof preyIsCardEligible === "function" && typeof preyCardPool === "function" &&
     typeof preySelectAny === "function" && typeof preyIsCardEligibleSlug === "function",
     "funções de seleção paga ausentes em prey.js");
const cardPool = preyCardPool();
const cardSet = new Set(cardPool);
must(cardPool.length >= pool.length, "pool pago deve cobrir o pool grátis");
for (const slug of exclusive) {
  const m = MONSTERDATA[slug];
  if (!m || !m.best || !(m.exp > 0) || m.boss || m.isPreyable === 0 || m.isPreyable === false) continue;
  must(preyIsCardEligible(m), "exclusivo não elegível ao card: " + slug);
  must(cardSet.has(slug), "exclusivo fora do pool pago: " + slug);
}
must(!preyIsCardEligible({ name: "X", best: {}, exp: 10, boss: 1 }), "boss elegível ao card");
must(!preyIsCardEligible({ name: "X", exp: 10 }), "sem bestiário elegível ao card");
must(!preyIsCardEligible({ name: "X", best: {}, exp: 10, isPreyable: 0 }), "não preyable ao card");

const p2 = { level: 50, gold: 0, prey: { slots: [
  { unlocked: true, creatures: ["rat"], rerollAt: 0, selected: null },
  { unlocked: true, creatures: [], rerollAt: 0, selected: null },
  { unlocked: true, creatures: [], rerollAt: 0, selected: null },
] } };
const foraDaGrade = cardPool.find((s) => s !== "rat");
must(foraDaGrade, "nenhuma criatura fora da grade disponível");
const selAny = preySelectAny(p2, 0, foraDaGrade);
must(selAny.ok, "preySelectAny falhou: " + (selAny.msg || ""));
must(p2.prey.slots[0].selected.creature === foraDaGrade, "criatura paga não aplicada");
must(selAny.value > 0, "bônus não rolado na seleção paga");
must(p2.prey.slots[0].selected.until > Date.now(), "timer de 2h ausente");
must(!preySelectAny(p2, 0, "the-monster").ok, "boss não pode entrar via card");
must(!preySelectAny({ level: 1, gold: 0, prey: { slots: [
  { unlocked: true, creatures: [], rerollAt: 0, selected: null },
  { unlocked: true, creatures: [], rerollAt: 0, selected: null },
  { unlocked: false, creatures: [], rerollAt: 0, selected: null }] } }, 2, "rat").ok,
  "slot bloqueado não aceita seleção paga");

/* 3º slot por CONTA (compra da Store): cosmetics.preySlot destrava o
 * slot 2 em ensurePrey; sem a compra ele segue travado. */
ctx.sessionAccount = () => ({ cosmetics: { preySlot: 1 } });
const p3 = { level: 50, gold: 0, prey: { slots: [
  { unlocked: true, creatures: [], rerollAt: 0, selected: null },
  { unlocked: true, creatures: [], rerollAt: 0, selected: null },
  { unlocked: false, creatures: [], rerollAt: 0, selected: null },
] } };
ensurePrey(p3);
must(p3.prey.slots[2].unlocked, "cosmetics.preySlot deveria destravar o slot 3");
ctx.sessionAccount = () => ({ cosmetics: {} });
const p4 = { level: 50, gold: 0, prey: {} };
ensurePrey(p4);
must(p4.prey.slots[2] && !p4.prey.slots[2].unlocked, "sem compra o slot 3 segue travado");
delete ctx.sessionAccount;

const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
must(html.includes("js/prey.js?v="), "cache-bust prey.js");
must(html.includes("js/prey-ui.js?v="), "cache-bust prey-ui.js");

console.log("OK: prey pool Canary — total=%d pool=%d bosses=%d exclusive=%d",
  total, pool.length, bosses.length, exclusive.length);
