"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, ".."), source = fs.readFileSync(path.join(root, "server/authoritative_engine.js"), "utf8");
const ctx = { Date, Number, Object, recordAuthSessionDeath: (auth) => { auth.deaths = (auth.deaths || 0) + 1; } };
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf("function playerReviveDelay("), source.indexOf("function combatLivingFor(")), ctx);
vm.runInContext(source.slice(source.indexOf("function authIsWorldBoss("), source.indexOf("const SCARLETT_KEYS=")), ctx);
const now = Date.now();
for (const [vipUntil, delay] of [[now + 86400000, 15000], [0, 30000], [now - 1, 30000], [now, 30000]]) {
  const auth = { kind: "hunt", clock: now };
  const item = { id: "test", p: { hp: 100, vipUntil }, x: .5, y: .5 };
  assert(ctx.authMarkPlayerDeath(auth, item, now));
  assert.equal(item.downUntil - now, delay);
  assert.equal(item.downedAt, now);
  assert.equal(item.p.hp, 0);
  assert.equal(auth.deaths, 1);
  const proxyItem = { id: "pvp", p: { hp: 100, vipUntil }, _pvpDeathAt: now };
  const proxy = ctx.playerCombatProxy(proxyItem); proxy.hp = 0;
  assert.equal(proxyItem.downUntil - now, delay);
}
for (const vipUntil of [0, now + 86400000]) {
  const boss = { kind: "boss", bossId: "timira" };
  const item = { id: "boss", p: { hp: 100, vipUntil } };
  ctx.authMarkPlayerDeath(boss, item, now);
  assert(item.permadead); assert(item.downUntil - now > 30000);
  const worldBoss = { kind: "boss", worldBoss: true };
  const worldItem = { id: "world", p: { hp: 100, vipUntil } };
  ctx.authMarkPlayerDeath(worldBoss, worldItem, now);
  assert(!worldItem.permadead);
  assert.equal(worldItem.downUntil - now, vipUntil > now ? 15000 : 30000);
}
const uiSource = fs.readFileSync(path.join(root, "game/js/store-ui.js"), "utf8");
const ui = { console, accountCoins: () => 1225, fmtFull: () => "1.225", $$: () => [] };
vm.createContext(ui); vm.runInContext(uiSource, ui);
assert(ui.storeCoinBalanceHtml().includes('alt="Tibia Coin"'));
assert(ui.storeCoinBalanceHtml().includes("1.225"));
assert(!uiSource.includes(String.fromCodePoint(0x1fa99)));
assert.equal((uiSource.match(/cc\.innerHTML = storeCoinBalanceHtml\(\)/g) || []).length, 3);
ui.ensureStoreCatalog = async () => ({ ok: true, mpConfigured: true, packs: [{ id: "tc100", label: "100 Coins", total: 100, brl: 10 }] });
(async () => {
  const main = { innerHTML: "" };
  await ui.renderStoreBuy(main);
  assert(main.innerHTML.includes('class="store-pack-label"><img src="assets/ui/coins/tibia-coins.gif"'));
  assert(fs.existsSync(path.join(root, "game/assets/ui/coins/tibia-coins.gif")));
  console.log("OK: revive VIP 15s, normal/expirado 30s, PvP e World Boss, boss sem revive preservado; saldo e pacotes da Store usam Tibia Coin.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
