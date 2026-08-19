/* Regressão do pacote Soul War / Dark Thais:
 *
 * 1. Paladin's Apparition não spawnava na Mirrored Nightmare online: o
 *    spawnPool do engine era montado só com os slugs da 1ª leva do cliente e
 *    ficava congelado — monstro ausente dela nunca mais nascia. Agora o pool
 *    é completado com TODOS os monstros do hunt a cada onda.
 * 2. Autosell: diabolic skull (19000 gp) e infernal robe (1200 gp) estavam
 *    sem preço (sell=0) — Yasir agora precifica os dois.
 * 3. Bag You Desire voltava para a Loot Pouch online: a pouch é protected no
 *    PUT comum e a abertura era 100% local. Agora há API autoritativa
 *    (instância/cidade) que remove a bag e sorteia o item Soul War no Depot.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const engine = require("../server/authoritative_engine");
function must(v, m) { if (!v) throw Error(m); }

const root = path.join(__dirname, "..");
const js = path.join(root, "game", "js");

/* ---------------- 1) spawn pool: paladin-s-apparition sempre no pool ---------------- */
{
  const src = fs.readFileSync(path.join(root, "server", "authoritative_engine.js"), "utf8");
  const wave = src.slice(src.indexOf("function spawnHuntWave"), src.indexOf("function", src.indexOf("function spawnHuntWave") + 10));
  must(wave.includes("hunt.monsters") && wave.includes("auth.spawnPool.push(slug)"),
    "spawnHuntWave não completa o pool com os monstros do hunt");

  // funcional: pool inicial só com many-faces (como ficava após a 1ª leva sem
  // paladin) → após a onda o pool tem os 7 slugs do hunt e a onda nasce.
  const auth = {
    kind: "hunt", huntId: "dark-thais", ended: false,
    mobs: [], pendingSpawns: [], spawnPool: ["many-faces"],
    spawnIds: ["srv-1", "srv-2", "srv-3"], pack: 3, wave: 0,
    gridW: 30, gridH: 30, spawnPoints: [{ cx: 10, cy: 10, x: 0.35, y: 0.35, sx: 0.35, sy: 0.35 }],
    clock: Date.now(), rngState: 123456, fiendishChance: 0, influencedChance: 0,
  };
  engine.spawnHuntWave(auth, Date.now());
  must(auth.spawnPool.length === 7 &&
    auth.spawnPool.includes("paladin-s-apparition") &&
    auth.spawnPool.includes("knight-s-apparition") &&
    auth.spawnPool.includes("distorted-phantom"),
    "pool não completado com os 7 monstros da dark-thais: " + JSON.stringify(auth.spawnPool));
  must(auth.pendingSpawns.length > 0 &&
    auth.pendingSpawns.every((sp) => sp && sp.mob && sp.mob.slug),
    "onda não nasceu com o pool completo");

  // onda seguinte com pool já completo continua completa (idempotente)
  auth.mobs = []; auth.pendingSpawns = [];
  engine.spawnHuntWave(auth, Date.now());
  must(auth.spawnPool.length === 7 && auth.pendingSpawns.length > 0,
    "pool completo não deveria encolher nem a onda falhar");
}

/* ---------------- 2) autosell: infernal-robe 1200 / diabolic-skull 19000 ---------------- */
{
  const ctx = { window: {}, console };
  ctx.window = ctx; // browser: window === global (soulwar.js checa typeof GAMEDATA)
  vm.createContext(ctx);
  for (const f of ["gamedata.js", "soulwar.js", "yasir-prices.js"])
    vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
  const items = vm.runInContext("window.GAMEDATA.items", ctx);
  must(items["infernal-robe"] && items["infernal-robe"].sell === 1200,
    "infernal-robe sem sell 1200: " + JSON.stringify(items["infernal-robe"]));
  must(items["diabolic-skull"] && items["diabolic-skull"].sell === 19000,
    "diabolic-skull sem sell 19000: " + JSON.stringify(items["diabolic-skull"]));
  must((items["infernal-robe"].npcSell || 0) >= 1200 && (items["diabolic-skull"].npcSell || 0) >= 19000,
    "npcSell não acompanhou o sell");
}

/* ---------------- 3) Bag You Desire autoritativa ---------------- */
{
  // funcional do engine: remove da pouch, sorteia no pool, cap de depot
  const p = { lootPouch: { "bag-you-desire": 2 }, depot: ["x"] };
  const r = engine.openAuthBagYouDesire(p);
  must(r.ok && r.item && p.lootPouch["bag-you-desire"] === 1 && p.depot.length === 2,
    "openAuthBagYouDesire não removeu/sorteou corretamente: " + JSON.stringify(r));
  const r2 = engine.openAuthBagYouDesire(p);
  must(r2.ok && !("bag-you-desire" in p.lootPouch) && p.depot.length === 3,
    "segunda abertura não removeu a bag");
  const r3 = engine.openAuthBagYouDesire(p);
  must(!r3.ok, "abrir sem bag deveria falhar");
  const full = { lootPouch: { "bag-you-desire": 1 }, depot: new Array(30).fill("x") };
  const r4 = engine.openAuthBagYouDesire(full);
  must(!r4.ok && full.lootPouch["bag-you-desire"] === 1 && full.depot.length === 30,
    "depot cheio deveria rejeitar sem consumir a bag");

  // estático: rotas + handler no server, cliente com API e menu online
  const srv = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  must(srv.includes("/api/instance/open-bag-you-desire") && srv.includes("/api/pouch/open-bag-you-desire"),
    "rotas da Bag You Desire ausentes no server");
  must(srv.includes("async function openBagYouDesire") && srv.includes('source: "bag-you-desire"'),
    "handler openBagYouDesire ausente");
  const acc = fs.readFileSync(path.join(js, "account-client.js"), "utf8");
  must(acc.includes("function accountOpenBagYouDesire") &&
    acc.includes('"/api/instance/open-bag-you-desire"') &&
    acc.includes('"/api/pouch/open-bag-you-desire"'),
    "accountOpenBagYouDesire ausente/incompleta no cliente");
  const uiSrc = fs.readFileSync(path.join(js, "ui.js"), "utf8");
  const menu = uiSrc.slice(uiSrc.indexOf('slug === "bag-you-desire"'), uiSrc.indexOf("// equipavel?"));
  must(menu.includes("accountOpenBagYouDesire") && menu.includes("openLocal"),
    "menu Abrir da bag sem caminho online");
  const html = fs.readFileSync(path.join(root, "game", "index.html"), "utf8");
  must(html.includes("yasir-prices.js?v=autosell-cprices-v1") &&
    html.includes("ui.js?v=") &&
    html.includes("account-client.js?v="),
    "cache-busts do pacote soulwar ausentes no index");
}

console.log("ok: paladin apparition no spawn pool + autosell claustrophobic + Bag You Desire autoritativa");
