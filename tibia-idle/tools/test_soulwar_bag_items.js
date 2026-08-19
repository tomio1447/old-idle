/* Regressão: itens do Bag You Desire (Soul War) sem 404 de sprite.
 *
 * O pool antigo tinha 3 slugs que não existiam nos assets/catálogo:
 * soul-bastion (Canary: soulbastion), soulwalkers (Canary:
 * pair-of-soulwalkers) e soulcrown (não existe — substituído por
 * soulshell, armor real do Soul War). O itemImg fazia
 * assets/item/<slug>.png -> 404 e o fallback .gif -> 404 de novo.
 *
 * Agora: o pool usa os slugs do Canary (itens reais do WEAPONDATA, com
 * animação af) e os saves antigos continuam renderizando via aliases de
 * sprite + stubs legados com nome bonito.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const src = fs.readFileSync(path.join(js, "soulwar.js"), "utf8");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");
const engine = require("../server/authoritative_engine.js");

/* ---------------- pools do soulwar.js (registro + soulwarOpenBag) ---------------- */
// extrai as duas listas de slugs "soul..."
const lists = [...src.matchAll(/\[([^\]]*soul[^\]]*)\]/g)].map((m) =>
  m[1].split(",").map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean));
must(lists.length >= 2, "pools do soulwar.js não encontrados");
const poolA = lists.find((l) => l.length === 15);
const poolB = lists.filter((l) => l.length === 15)[1];
must(poolA && poolB, "pools de 15 itens não encontrados");
must(JSON.stringify(poolA) === JSON.stringify(poolB), "os dois pools divergem");

const BROKEN = ["soul-bastion", "soulwalkers", "soulcrown"];
for (const slug of poolA) {
  must(BROKEN.indexOf(slug) === -1, "pool ainda tem slug quebrado: " + slug);
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    "pool com item sem sprite: " + slug);
}
must(poolA.indexOf("soulbastion") !== -1 &&
     poolA.indexOf("pair-of-soulwalkers") !== -1 &&
     poolA.indexOf("soulshell") !== -1,
  "pool sem os slugs oficiais do Canary (soulbastion/pair-of-soulwalkers/soulshell)");

/* aliases para depots legados (saves antigos) */
for (const slug of BROKEN)
  must(fs.existsSync(path.join(game, "assets", "item", slug + ".png")),
    "alias legado ausente: " + slug + ".png");

/* staging (deploy) espelha o fix */
const staging = path.join(__dirname, "..", "dist-patch", "_staging", "game", "js", "soulwar.js");
if (fs.existsSync(staging)) {
  const stg = fs.readFileSync(staging, "utf8");
  const stgLists = [...stg.matchAll(/\[([^\]]*soul[^\]]*)\]/g)]
    .map((m) => m[1].split(",").map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean));
  const stgPools = stgLists.filter((l) => l.length === 15 && l.indexOf("soulbleeder") !== -1);
  must(stgPools.length === 2, "staging sem os 2 pools de 15 itens");
  for (const pool of stgPools) {
    for (const slug of BROKEN)
      must(pool.indexOf(slug) === -1, "staging ainda tem slug quebrado no pool: " + slug);
    must(pool.indexOf("soulbastion") !== -1 && pool.indexOf("pair-of-soulwalkers") !== -1,
      "staging sem os slugs oficiais do Canary no pool");
  }
}

/* ---------------- catálogo (ordem real: weapondata -> weapons -> soulwar) ---------------- */
const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ["gamedata.js", "monsterdata.js", "mobsheetdata.js", "monsters.js", "tileflags.js"])
  vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
vm.runInContext("GAMEDATA=window.GAMEDATA;", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "weapondata.js"), "utf8"), ctx, { filename: "weapondata.js" });
vm.runInContext("WEAPONDATA=window.WEAPONDATA;", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "weapons.js"), "utf8"), ctx, { filename: "weapons.js" });
vm.runInContext("fundirWeaponData();", ctx);
vm.runInContext(fs.readFileSync(path.join(js, "soulwar.js"), "utf8"), ctx, { filename: "soulwar.js" });

const items = vm.runInContext("GAMEDATA.items", ctx);
must(items["soulbastion"] && items["soulbastion"].cat === "shield" && items["soulbastion"].def === 42,
  "soulbastion não é o shield real do WEAPONDATA");
must(items["pair-of-soulwalkers"] && items["pair-of-soulwalkers"].cat === "boots",
  "pair-of-soulwalkers não é o boots real do WEAPONDATA");
must(items["soulshell"] && items["soulshell"].cat === "armor",
  "soulshell não é a armor real do WEAPONDATA");
for (const slug of BROKEN)
  must(items[slug] && items[slug].n === slug.replace(/-/g, " ") && items[slug].t === "soulwar",
    "stub legado sem nome bonito: " + slug);
// nenhum item soulwar pode ficar sem sprite (o erro que o jogador viu)
const assets = path.join(game, "assets", "item");
for (const slug of Object.keys(items)) {
  if (items[slug] && items[slug].t === "soulwar" && !fs.existsSync(path.join(assets, slug + ".png")))
    must(false, "item soulwar sem PNG: " + slug);
}

/* ---------------- engine (Sell All online) ---------------- */
must(engine.ITEMS["soulbastion"] && engine.ITEMS["soulbastion"].def === 42,
  "engine: soulbastion sem o shield real");
must(engine.ITEMS["pair-of-soulwalkers"] && engine.ITEMS["pair-of-soulwalkers"].arm === 4,
  "engine: pair-of-soulwalkers sem as boots reais");
must(engine.ITEMS["soulshell"], "engine: soulshell ausente");

/* ---------------- index.html (cache-bust do fix) ---------------- */
must(html.includes("js/soulwar.js?v=soulbag-fix-v1"), "soulwar.js sem cache-bust do fix");

console.log("ok: bag Soul War sem slugs quebrados — pool Canary (soulbastion, pair-of-soulwalkers, soulshell), aliases para depots legados e catálogo/engine completos");
