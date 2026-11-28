/* Regressão Convergence (WU23) — forge autoritativo (server/forge.js):
 * - Convergence Fusion: 2 itens DIFERENTES do mesmo slot+tier, class 4,
 *   resultado GARANTIDO, 130 Dust, gold da tabela de convergence;
 * - Convergence Transfer: mesmo tier (sem -1), class 4, 160 Dust + core;
 * - Transfer regular segue com perda de 1 tier (espelho do cliente). */
"use strict";
const forge = require("../server/forge.js");
let failures = 0;
function must(ok, msg) { if (ok) console.log("  ok:", msg); else { failures++; console.error("  FAIL:", msg); } }

const ITEMS = {
  "soulshredder": { n: "soulshredder", cls: 4, s: "weapon" },
  "soulcutter":   { n: "soulcutter",   cls: 4, s: "weapon" },
  "soulbleeder":  { n: "soulbleeder",  cls: 4, s: "weapon" },
  "magic-plate-armor": { n: "magic plate armor", cls: 4, s: "armor" },
  "demon-armor":  { n: "demon armor",  cls: 4, s: "armor" },
  "golden-helmet":{ n: "golden helmet", cls: 4, s: "helmet" },
  "royal-helmet": { n: "royal helmet", cls: 3, s: "helmet" },
  "demon-helmet": { n: "demon helmet", cls: 3, s: "helmet" },
};

function inst(id, slug, tier, loc) {
  return { id, slug, tier: tier || 0, loc: loc || "bag" };
}
function mkP(instances, extra) {
  return Object.assign({
    id: 1, gold: 999999999999, dust: 500, slivers: 0, exaltedCores: 10,
    itemInstances: instances, equip: {}, imbuements: {}, forge: {},
  }, extra || {});
}

console.log("== Convergence Fusion: itens diferentes, mesmo slot+tier ==");
{
  const p = mkP([inst("a1", "soulshredder", 2), inst("b1", "soulcutter", 2)]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "b1", ITEMS);
  must(r.ok && r.success === true, "fusão garantida entre itens diferentes do mesmo slot");
  must(p.itemInstances.find((i) => i.id === "a1").tier === 3, "alvo subiu para T3");
  must(!p.itemInstances.find((i) => i.id === "b1"), "parceiro consumido");
  must(p.dust === 500 - 130, "130 Dust cobrado (dust=" + p.dust + ")");
  must(p.gold === 999999999999 - 170000000, "gold da tabela convergence (170M p/ →T3)");
}
{
  // Dois itens IGUAIS também funcionam via convergence (oficial).
  const p = mkP([inst("a1", "soulshredder", 0), inst("a2", "soulshredder", 0)]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "a2", ITEMS);
  must(r.ok && r.success === true, "mesmo item também funde via convergence");
  must(p.itemInstances.find((i) => i.id === "a1").tier === 1, "T0 → T1 garantido");
}
{
  // Tier diferente: sem parceiro elegível.
  const p = mkP([inst("a1", "soulshredder", 2), inst("b1", "soulcutter", 3)]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "b1", ITEMS);
  must(!r.ok, "tiers diferentes não fundem");
  must(p.dust === 500 && p.gold === 999999999999, "nada cobrado na recusa");
}
{
  // Slot diferente: arma + armor não fundem mesmo sendo class 4 e mesmo tier.
  const p = mkP([inst("a1", "soulshredder", 2), inst("c1", "magic-plate-armor", 2)]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "c1", ITEMS);
  must(!r.ok, "slots diferentes não fundem");
}
{
  // Classificação 3: fora da convergence.
  const p = mkP([inst("a1", "royal-helmet", 1), inst("b1", "demon-helmet", 1)]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "b1", ITEMS);
  must(!r.ok && /classificação 4/i.test(r.msg), "class 3 rejeitada na convergence");
}
{
  // Tier máximo.
  const p = mkP([inst("a1", "soulshredder", 10), inst("b1", "soulcutter", 10)]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "b1", ITEMS);
  must(!r.ok && /Tier máximo/i.test(r.msg), "T10 não sobe mais");
}
{
  // Sem gold suficiente.
  const p = mkP([inst("a1", "soulshredder", 2), inst("b1", "soulcutter", 2)], { gold: 100 });
  const r = forge.forgeConvergeFuseAuth(p, "a1", "b1", ITEMS);
  must(!r.ok && /gp/i.test(r.msg), "gold insuficiente rejeitado");
}
{
  // Sem dust suficiente (130 > 100).
  const p = mkP([inst("a1", "soulshredder", 2), inst("b1", "soulcutter", 2)], { dust: 129 });
  const r = forge.forgeConvergeFuseAuth(p, "a1", "b1", ITEMS);
  must(!r.ok && /Dust/i.test(r.msg), "dust insuficiente rejeitado");
}
{
  // Parceiro fora da mochila (depot/equipado) não vale.
  const p = mkP([inst("a1", "soulshredder", 2), inst("b1", "soulcutter", 2, "depot")]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "b1", ITEMS);
  must(!r.ok, "parceiro fora da mochila rejeitado");
}
{
  // Auto-seleção de parceiro quando partner_inst_id vem vazio.
  const p = mkP([inst("a1", "soulshredder", 1), inst("b1", "soulbleeder", 1),
                 inst("b2", "soulcutter", 1)]);
  const r = forge.forgeConvergeFuseAuth(p, "a1", "", ITEMS);
  must(r.ok && r.success === true, "sem partner_inst_id: primeiro parceiro válido é usado");
  must(p.itemInstances.length === 2, "só um parceiro consumido");
}

console.log("== Convergence Transfer: mesmo tier (sem -1) ==");
{
  const p = mkP([inst("d1", "soulshredder", 5), inst("t1", "soulcutter", 0)]);
  const r = forge.forgeTransferAuth(p, "d1", "t1", true, ITEMS);
  must(r.ok && r.success === true, "convergence transfer concluída");
  must(p.itemInstances.find((i) => i.id === "t1").tier === 5, "alvo recebe T5 — SEM perda de tier");
  must(!p.itemInstances.find((i) => i.id === "d1"), "doador consumido");
  must(p.dust === 500 - 160, "160 Dust cobrado (dust=" + p.dust + ")");
  must(p.exaltedCores === 9, "1 Exalted Core cobrado");
  must(p.gold === 999999999999 - 2000000000, "gold da tabela (2B p/ donor T5)");
}
{
  // Donor T1 também transfere (regular exigiria T2+).
  const p = mkP([inst("d1", "soulshredder", 1), inst("t1", "soulcutter", 0)]);
  const r = forge.forgeTransferAuth(p, "d1", "t1", true, ITEMS);
  must(r.ok && p.itemInstances.find((i) => i.id === "t1").tier === 1,
    "donor T1 transfere na convergence (regular exige T2+)");
}
{
  // Class 3 rejeitada mesmo com tier.
  const p = mkP([inst("d1", "royal-helmet", 2), inst("t1", "demon-helmet", 0)]);
  const r = forge.forgeTransferAuth(p, "d1", "t1", true, ITEMS);
  must(!r.ok && /classificação 4/i.test(r.msg), "class 3 rejeitada na convergence transfer");
}
{
  // Alvo com tier não aceita.
  const p = mkP([inst("d1", "soulshredder", 4), inst("t1", "soulcutter", 1)]);
  const r = forge.forgeTransferAuth(p, "d1", "t1", true, ITEMS);
  must(!r.ok && /sem tier/i.test(r.msg), "alvo com tier rejeitado");
}

console.log("== Transfer regular: perda de 1 tier preservada ==");
{
  const p = mkP([inst("d1", "soulshredder", 4), inst("t1", "soulcutter", 0)]);
  const r = forge.forgeTransferAuth(p, "d1", "t1", false, ITEMS);
  must(r.ok && p.itemInstances.find((i) => i.id === "t1").tier === 3,
    "regular: T4 → T3 (perde 1)");
  must(p.dust === 500 - 100, "100 Dust na regular");
  must(p.gold === 999999999999 - 65000000, "gold regular (65M p/ donor T4)");
}
{
  const p = mkP([inst("d1", "soulshredder", 1), inst("t1", "soulcutter", 0)]);
  const r = forge.forgeTransferAuth(p, "d1", "t1", false, ITEMS);
  must(!r.ok && /mínimo T2/i.test(r.msg), "regular exige doador T2+");
}
{
  // Classificações diferentes: mesmo resultado que o cliente (rejeita).
  const p = mkP([inst("d1", "royal-helmet", 2), inst("t1", "soulshredder", 0)]);
  const r = forge.forgeTransferAuth(p, "d1", "t1", false, ITEMS);
  must(!r.ok && /mesma classificação/i.test(r.msg), "classificações diferentes rejeitadas");
}

console.log("\n== Conversion of Dust and Slivers (autoritativo, era só client-side) ==");
{
  // Bug relatado: cap subia 1× no espelho local e o sync do shared revertia.
  const p = mkP([], { dust: 75, dustLimit: 100, slivers: 60, exaltedCores: 0 });
  let r = forge.forgeConversionAuth(p, "cap");
  must(r.ok && p.dustLimit === 101 && p.dust === 50, "cap: 100→101 por 25 Dust (custo = limit−75)");
  r = forge.forgeConversionAuth(p, "cap");
  must(r.ok && p.dustLimit === 102 && p.dust === 24, "cap: 101→102 por 26 Dust — o 2º clique sobe");
  r = forge.forgeConversionAuth(p, "cap");
  must(!r.ok && p.dustLimit === 102 && p.dust === 24, "dust insuficiente nega sem cobrar");
  r = forge.forgeConversionAuth(p, "dust-to-slivers");
  must(!r.ok && p.dust === 24, "dust→slivers exige 60 Dust");
  p.dust = 120;
  r = forge.forgeConversionAuth(p, "dust-to-slivers");
  must(r.ok && p.dust === 60 && p.slivers === 63, "60 Dust → 3 Slivers");
  r = forge.forgeConversionAuth(p, "slivers-to-core");
  must(r.ok && p.slivers === 13 && p.exaltedCores === 1, "50 Slivers → 1 Exalted Core");
  const max = mkP([], { dust: 999, dustLimit: 325 });
  r = forge.forgeConversionAuth(max, "cap");
  must(!r.ok && max.dust === 999 && max.dustLimit === 325, "cap máximo 325 nega sem cobrar");
  r = forge.forgeConversionAuth(max, "bogus");
  must(!r.ok, "ação desconhecida rejeitada");
}

if (failures) { console.error(`\n${failures} FALHA(S)`); process.exit(1); }
console.log("\nALL CONVERGENCE FORGE TESTS PASSED");
