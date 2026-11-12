"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../game/js/account-client.js"), "utf8");
function setup() {
  const storage = new Map();
  const ctx = { console, G: { p: { id: "1", depot: ["a"], bag: {} } },
    sessionStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    ACCOUNT_SYNC: { charRefresh: null }, accountSyncDispatch() {}, onlineAuthorityCombat: () => false };
  vm.createContext(ctx);
  vm.runInContext('var ONLINE_CHARACTER_CACHE_KEY="test-cache", ACCOUNT_SAVE_QUEUE=Promise.resolve(true), ACCOUNT_LAST_SAVE_PROMISE=ACCOUNT_SAVE_QUEUE, ACCOUNT_INVENTORY_EPOCH=0, ACCOUNT_SAVE_PENDING=0;', ctx);
  vm.runInContext(source.slice(source.indexOf("function accountCharacterCacheWrite("), source.indexOf("function accountCharacterCacheClear(")), ctx);
  vm.runInContext(source.slice(source.indexOf("function accountQueueSave("), source.indexOf("function accountLastSavePromise(")), ctx);
  vm.runInContext(source.slice(source.indexOf("async function accountSyncRefreshCharacters("), source.indexOf("function accountSyncFallback(")), ctx);
  ctx.accountApplySharedInventory = (shared) => Object.assign(ctx.G.p, shared);
  return ctx;
}
test("a delayed poll cannot undo a confirmed depot withdrawal or regress character revision", async () => {
  const c = setup();
  c.accountCharacterCacheWrite([{ id: "1", saveVersion: 1 }]);
  let resolvePoll;
  c.accountMe = () => new Promise((resolve) => { resolvePoll = resolve; });
  const poll = c.accountSyncRefreshCharacters("test");
  await c.accountQueueSave(async () => {
    c.G.p.depot = []; c.G.p.bag = { "demon-armor": 1 };
    c.accountCharacterCacheWrite([{ id: "1", saveVersion: 2 }]);
  });
  resolvePoll({ ok: true, characters: [{ id: "1", saveVersion: 1 }], sharedInventory: { depot: ["a"], bag: {} } });
  await poll;
  assert.equal(c.G.p.depot.length, 0);
  assert.equal(c.G.p.bag["demon-armor"], 1);
  assert.equal(c.accountCharacterCacheRead()[0].saveVersion, 2);
  c.accountMe = async () => ({ ok: true, characters: [{ id: "1", saveVersion: 3 }], sharedInventory: { depot: [], bag: { "demon-armor": 2 } } });
  await c.accountSyncRefreshCharacters("test");
  assert.equal(c.G.p.bag["demon-armor"], 2);
  assert.equal(c.accountCharacterCacheRead()[0].saveVersion, 3);
});
