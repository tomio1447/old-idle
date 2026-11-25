/* Regressão da UI da Convergence Fusion (forge-ui.js):
 * - o item a QUEIMAR é seleção MANUAL no painel "Select Item To Consume";
 * - sem parceiro escolhido o Fuse fica desabilitado (sem auto-pick);
 * - escolha manual aparece como 'sel' + "Consumed:" nos rates;
 * - trocar o item base invalida a seleção anterior (não auto-reescolhe);
 * - topo mostra o preview do item que RECEBE o bônus. */
"use strict";
const fs = require("fs");
const vm = require("vm");
let failures = 0;
function must(ok, msg) { if (ok) console.log("  ok:", msg); else { failures++; console.error("  FAIL:", msg); } }

const sandbox = {
  window: null, console, document: { getElementById: () => null, querySelector: () => null },
  $: () => null,
  GAMEDATA: {
    items: {
      "soulshredder": { n: "soulshredder", cls: 4, s: "weapon" },
      "soulcutter":   { n: "soulcutter",   cls: 4, s: "weapon" },
      "soulbleeder":  { n: "soulbleeder",  cls: 4, s: "weapon" },
      "magic-plate-armor": { n: "magic plate armor", cls: 4, s: "armor" },
      "dust": { n: "dust" },
      "exalted-core": { n: "exalted core" },
    },
  },
  SLOTS: ["weapon", "helmet", "armor", "legs", "boots", "shield", "ring", "amulet", "quiver", "fist"],
  itemImg: (slug) => '<img data-slug="' + slug + '">',
  fmtFull: (n) => String(n),
  findItemInstance: (p, ref) => (p.itemInstances || []).find((i) => i.id === ref) || null,
  itemInstanceTier: (inst) => inst.tier || 0,
};
sandbox.window = sandbox;
for (const f of ["game/js/forgedata.js", "game/js/forge.js", "game/js/forge-ui.js"]) {
  vm.runInNewContext(fs.readFileSync(f, "utf8"), sandbox, { filename: f });
}
const s = sandbox;

function inst(id, slug, tier) { return { id, slug, tier: tier || 0, loc: "bag" }; }
function mkP(instances) {
  return { id: 1, gold: 999999999999, dust: 325, dustLimit: 325, slivers: 0, exaltedCores: 10,
    itemInstances: instances, equip: {}, imbuements: {}, forge: {} };
}

console.log("== Convergence Fusion UI: seleção manual do item a queimar ==");
{
  const p = mkP([inst("a1", "soulshredder", 0), inst("b1", "soulcutter", 0), inst("c1", "soulbleeder", 0)]);
  s.FORGE_UI.mode = "convergence"; s.FORGE_UI.convMode = "fusion";
  s.FORGE_UI.slug = "a1"; s.FORGE_UI.convPartner = null;

  const html = s.renderForgeConvFusionPanel(p);
  must(s.FORGE_UI.convPartner === null, "sem auto-pick: convPartner permanece null");
  must(html.indexOf('id="forge-convfuse-apply" disabled') !== -1, "Fuse desabilitado sem parceiro selecionado");
  must(html.indexOf("Selecione abaixo o item a ser consumido") !== -1, "aviso pede seleção manual");
  must(html.indexOf("Select Item To Consume For Convergence Fusion") !== -1, "seção de consumo presente");
  const nPartnerTiles = (html.match(/data-conv-partner=/g) || []).length;
  must(nPartnerTiles === 2, "grade lista os 2 parceiros elegíveis (soulcutter+soulbleeder), achou " + nPartnerTiles);
  must(html.indexOf("forge-client-tier-preview") !== -1, "topo mostra preview do item receptor");
  must(html.indexOf('data-conv-partner="b1"') !== -1 && html.indexOf('data-conv-partner="c1"') !== -1, "refs b1/c1 clicáveis");

  // Seleção manual habilita o fluxo.
  s.FORGE_UI.convPartner = "b1";
  const html2 = s.renderForgeConvFusionPanel(p);
  must(html2.indexOf('id="forge-convfuse-apply" disabled') === -1, "Fuse habilitado após seleção manual");
  must(/data-conv-partner="b1"[^>]*class="[^"]*sel|class="[^"]*sel[^"]*"[^>]*data-conv-partner="b1"/.test(html2)
       || html2.indexOf('forge-client-slot sel" data-conv-partner="b1"') !== -1
       || html2.indexOf('sel" data-conv-partner="b1"') !== -1
       || html2.indexOf('data-conv-partner="b1"') !== -1 && html2.indexOf(' sel') !== -1,
       "parceiro b1 marcado como selecionado");
  must(html2.indexOf("Consumed:") !== -1 && html2.indexOf("soulcutter T0") !== -1, "Consumed mostra o item escolhido");

  // Trocar o item base para um tier sem parceiro: seleção invalidada, sem re-pick.
  p.itemInstances.push(inst("d1", "magic-plate-armor", 5));
  s.FORGE_UI.slug = "d1"; // T5 armor — sem parceiro elegível
  const html3 = s.renderForgeConvFusionPanel(p);
  must(s.FORGE_UI.convPartner === null, "seleção anterior invalidada ao trocar o item base");
  must(html3.indexOf('id="forge-convfuse-apply" disabled') !== -1, "Fuse desabilitado sem parceiro elegível");
  must(html3.indexOf("mesmo slot e mesmo tier") !== -1, "aviso explica a exigência de parceiro");
}

console.log(failures ? "\n" + failures + " FALHA(S)" : "\nTodos os asserts passaram.");
process.exit(failures ? 1 : 0);
