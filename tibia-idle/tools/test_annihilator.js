"use strict";

const assert = require("node:assert/strict"), test = require("node:test");
const A = require("../server/annihilator"), D = require("../game/js/annihilator-data");
const E = require("../server/authoritative_engine");

test("reward room stays active until a survivor steps on the exit teleport", () => {
  const auth = { questId: "annihilator", gridW: 39, gridH: 34, events: [], mobs: [],
    players: chars().map((p) => ({ id: String(p.id), p, cx: 22, cy: 11 })),
    annihilator: { phase: "combat", demonIds: D.demons.map((_, i) => "annihilator-demon-" + i), arrived: [] } };
  E.annihilatorTick(auth, 1000);
  assert.equal(auth.annihilator.phase, "rewards");
  assert.ok(!auth.ended);
  E.annihilatorTick(auth, 2000);
  assert.ok(!auth.ended);
  auth.players[0].cx = 30; auth.players[0].cy = 7;
  E.annihilatorTick(auth, 3000);
  assert.equal(auth.ended, true);
  assert.equal(auth.terminalReason, "quest-completed");
});

test("chests grant exactly one selected reward per living nearby character after the six demons", () => {
  const auth = { questId: "annihilator", events: [], players: chars().map((p) => ({ id: String(p.id), p, cx: 21, cy: 9 })),
    annihilator: { phase: "combat" } };
  assert.equal(E.claimAnnihilatorReward(auth, "1", "demon-armor").ok, false);
  auth.annihilator.phase = "rewards";
  assert.equal(E.claimAnnihilatorReward(auth, "1", "gold-coin").ok, false);
  auth.players[0].cx = 1;
  assert.equal(E.claimAnnihilatorReward(auth, "1", "demon-armor").ok, false);
  auth.players[0].cx = 21;
  assert.equal(E.claimAnnihilatorReward(auth, "1", "demon-armor").ok, true);
  assert.equal(auth.players[0].p.quests.annihilator.reward, "demon-armor");
  assert.equal(E.claimAnnihilatorReward(auth, "1", "magic-sword").ok, false);
  auth.players[1].p.hp = 0;
  assert.equal(E.claimAnnihilatorReward(auth, "2", "demon-armor").ok, false);
  assert.equal(E.claimAnnihilatorReward(auth, "3", "demon-armor", [10, 11, 12, 13]).ok, false);
});

test("map retains the four chests and their rear displays, without prizes stacked on the chests", () => {
  const fs = require("fs"), O = require("../game/js/otbm");
  const b = fs.readFileSync(require("path").join(__dirname, "../game/maps/annihilator.otbm"));
  const map = O.read(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { z: 7 });
  D.prepareMap(map);
  for (const chest of D.chests) {
    assert.deepEqual(map.cells[(chest.x - 1007) + ",8"].items, [2472]);
    assert.ok(map.cells[(chest.x - 1007) + ",7"].items.includes(E.ITEMS[chest.reward].cid));
  }
  assert.deepEqual(D.teleport, { x: 1037, y: 1022, z: 7 });
});

const chars = () => [1, 2, 3, 4].map((id) => ({ id, account_id: 9, level: 100, hp: 1000 }));
const prepared = () => A.create(9, chars());
function win(state, claims = {}) {
  A.confirm(state);
  for (let i = 0; i < 6; i++) A.demonKilled(state, "annihilator-demon-" + i, claims);
  for (const id of state.slots) A.arrived(state, id);
  return state;
}

test("requires four distinct living characters of the same account at level 100+", () => {
  assert.throws(() => A.create(9, chars().slice(1)));
  for (const patch of [{ level: 99 }, { hp: 0 }, { account_id: 8 }, { id: 2 }, { id: "__proto__" }]) {
    const members = chars(); Object.assign(members[0], patch);
    assert.throws(() => A.create(9, members));
  }
  assert.equal(prepared().phase, "preparation");
});

test("slot clicks swap occupants without overlap and persist through serialization", () => {
  const state = prepared();
  A.swap(state, 1, 3);
  assert.deepEqual(state.slots, ["4", "2", "3", "1"]);
  assert.equal(new Set(A.positions(state).map((p) => p.x + ":" + p.y)).size, 4);
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(A.positions(restored), A.positions(state));
  const start = A.confirm(restored);
  assert.equal(restored.phase, "combat");
  assert.equal(start.players[0].id, "4");
  assert.equal(start.players[0].x, 1020);
  assert.deepEqual(start.demons.map(({ x, y, z }) => ({ x, y, z })), D.demons);
  assert.throws(() => A.swap(restored, 1, 0));
  assert.throws(() => A.confirm(restored));
});

test("all six distinct demons must die before moving to the reward area", () => {
  const state = prepared(); A.confirm(state);
  assert.equal(A.demonKilled(state, "fake", {}), false);
  for (let i = 0; i < 5; i++) A.demonKilled(state, "annihilator-demon-" + i, {});
  assert.equal(A.demonKilled(state, "annihilator-demon-0", {}), false);
  assert.equal(state.phase, "combat");
  assert.equal(A.arrived(state, 1), false);
  A.demonKilled(state, "annihilator-demon-5", {});
  assert.equal(state.phase, "exit");
  for (const id of state.slots) A.arrived(state, id);
  assert.equal(state.phase, "rewards");
});

test("dead characters receive no reward, survivors must arrive before choosing", () => {
  const state = prepared(); A.confirm(state); A.die(state, 2);
  for (let i = 0; i < 6; i++) A.demonKilled(state, "annihilator-demon-" + i, {});
  const claims = {};
  assert.throws(() => A.claim(state, claims, 1, "demon-armor"));
  for (const id of state.slots) A.arrived(state, id);
  assert.deepEqual(state.eligible, ["1", "3", "4"]);
  assert.throws(() => A.claim(state, claims, 2, "demon-armor"));
  assert.equal(A.claim(state, claims, 1, "demon-armor").count, 1);
});

test("a party wipe fails and cannot be converted to victory", () => {
  const state = prepared(); A.confirm(state);
  for (const id of state.slots) A.die(state, id);
  assert.equal(state.phase, "failed");
  assert.equal(A.demonKilled(state, "annihilator-demon-0", {}), false);
  assert.throws(() => A.claim(state, {}, 1, "demon-armor"));
});

test("repeat attempts reward only previously unclaimed surviving characters and allow duplicate items", () => {
  const claims = {}, first = prepared(); A.confirm(first); A.die(first, 4);
  for (let i = 0; i < 6; i++) A.demonKilled(first, "annihilator-demon-" + i, claims);
  for (const id of first.slots) A.arrived(first, id);
  for (const id of [1, 2, 3]) A.claim(first, claims, id, "demon-armor");
  const second = win(prepared(), claims);
  assert.deepEqual(second.eligible, ["4"]);
  assert.throws(() => A.claim(second, claims, 1, "magic-sword"));
  A.claim(second, claims, 4, "demon-armor");
  assert.equal(Object.keys(claims).length, 4);
  assert.throws(() => A.claim(second, claims, 4, "demon-armor"));
});

test("the four-per-account cap also applies to a fifth new character", () => {
  const claims = Object.fromEntries([1, 2, 3, 4].map((id) => [id, { reward: "magic-sword" }]));
  const members = chars(); members[3].id = 5;
  const state = win(A.create(9, members), claims);
  assert.throws(() => A.claim(state, claims, 5, "demonbone"));
  assert.equal(Object.keys(claims).length, 4);
});

test("invalid rewards and early claims never alter the claim ledger", () => {
  const state = prepared(), claims = {};
  assert.throws(() => A.claim(state, claims, 1, "magic-sword"));
  win(state);
  assert.throws(() => A.claim(state, claims, 1, "gold-coin"));
  assert.deepEqual(claims, {});
});

test("the exit teleport and all chest fronts are reachable through the real map collision", () => {
  const fs = require("fs"), vm = require("vm"), path = require("path");
  const serverPath = path.join(__dirname, "../server/server.js");
  const source = fs.readFileSync(serverPath, "utf8");
  const ctx = vm.createContext({ fs, vm, path, console, STATIC_DIR: path.join(__dirname, "../game"),
    require: require("module").createRequire(serverPath) });
  vm.runInContext("let questTileFlags=null;" + source.slice(source.indexOf("function questMapBlockedCells("), source.indexOf("async function createQuestSharedInstance(")), ctx);
  const blocked = ctx.questMapBlockedCells(require("../game/js/questdata").QUEST_DEFS.annihilator);
  assert.ok(blocked);
  const seen = new Set(["22:11"]), queue = [[22, 11]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = nx + ":" + ny;
      if (nx < 0 || ny < 0 || nx >= D.bounds.w || ny >= D.bounds.h || blocked[key] || seen.has(key)) continue;
      seen.add(key); queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has("30:7"), "Teleport de saída inacessível");
  for (const chest of D.chests) assert.ok(seen.has((chest.x - D.bounds.x) + ":" + (chest.y - D.bounds.y + 1)), chest.reward + " inacessível");
});

test("exit returns the same party to its lobby without granting the old modal reward", async () => {
  const events = [], ended = [];
  const db = { findAccountByToken: async () => ({ id: 9 }),
    findCharacter: async (id) => ({ id, account_id: 9, data: { level: 100, name: "Player " + id } }),
    updateCharacter: async () => { throw Error("Unexpected automatic quest reward"); } };
  const ctrl = require("../server/quest_controller").createQuestController({ getDb: () => db,
    publishAccount: (id, type, data) => events.push(data),
    endSharedInstance: async (...args) => ended.push(args) });
  const r = await ctrl.apiCreateLobby(db, { token: "test", questId: "annihilator", characterIds: [1, 2, 3, 4] });
  assert.equal(r.code, 200);
  const lobby = ctrl.findLobbyById(r.body.lobbyId);
  lobby.phase = "combat"; lobby.instanceId = "instance";
  await ctrl.onSharedEnded(lobby.id, "quest-completed");
  assert.equal(ctrl.findLobbyById(lobby.id).phase, "lobby");
  assert.equal(lobby.instanceId, null);
  assert.deepEqual(ended, [[9, "instance", "quest-completed"]]);
  assert.equal(events.filter((e) => e.action === "return-lobby").length, 1);
  assert.equal(events.filter((e) => e.action === "reward-choice").length, 0);
  assert.equal(lobby.joins.get(9).chars.length, 4);
});

test("chest endpoint validates ownership, state version and replayed reward claims", async () => {
  const fs = require("fs"), vm = require("vm"), path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "../server/server.js"), "utf8");
  const row = { status: "active", account_id: 9, instance_id: "a".repeat(64), version: 1,
    state: JSON.stringify({ authority: { questId: "annihilator", annihilator: { phase: "rewards" },
      players: [{ id: "1", accountId: 9, cx: 21, cy: 9, p: { hp: 100, accountId: 9 } }] } }) };
  const db = { findAccountByToken: async () => ({ id: 9 }),
    findCharacter: async (id) => ({ id, account_id: id === 1 ? 9 : 8 }), charactersOf: async () => [],
    instancePatchState: async (owner, requester, id, version, patch) => {
      if (version !== row.version) return { ok: false, error: "INSTANCE_VERSION_CONFLICT", instance: row };
      const state = patch(row.state);
      if (!state) return { ok: false, error: "INSTANCE_PATCH_REJECTED", instance: row };
      row.state = state; row.version++;
      return { ok: true, instance: row };
    } };
  const ctx = vm.createContext({ requireLease: async () => null, leaseHash: () => "lease",
    resolveInstanceRow: async () => ({ row }), claimAnnihilatorReward: E.claimAnnihilatorReward,
    annihilatorRewardOffer: E.annihilatorRewardOffer, claimAnnihilatorCart: E.claimAnnihilatorCart,
    materializeAuthority: (d) => d, instanceSummary: (r) => r, publishInstanceForRow: async () => {} });
  vm.runInContext(source.slice(source.indexOf("async function annihilatorLeverPull("), source.indexOf("async function moveToSupplyStash(")), ctx);
  const body = { token: "test", char_id: 1, instance_id: row.instance_id, expected_version: 1, reward: "demon-armor" };
  assert.equal((await ctx.annihilatorLeverPull(db, { ...body, char_id: 2 })).code, 403);
  assert.equal((await ctx.annihilatorLeverPull(db, body)).code, 200);
  assert.equal(JSON.parse(row.state).authority.players[0].p.rewardChest["demon-armor"], 1);
  assert.equal((await ctx.annihilatorLeverPull(db, body)).code, 409);
  assert.equal((await ctx.annihilatorLeverPull(db, { ...body, expected_version: 2 })).code, 409);
  assert.equal(JSON.parse(row.state).authority.players[0].p.rewardChest["demon-armor"], 1);
  row.version = 1; row.state = JSON.stringify({ authority: cartAuthority() });
  const preview = await ctx.annihilatorLeverPull(db, { ...body, reward: undefined, preview: true });
  assert.equal(preview.code, 200); assert.equal(preview.body.count, 4); assert.equal(row.version, 1);
  const cart = { ...body, reward: undefined, quantities: { "magic-sword": 4 } };
  assert.equal((await ctx.annihilatorLeverPull(db, cart)).code, 200);
  assert.equal((await ctx.annihilatorLeverPull(db, cart)).code, 409);
  assert.equal(JSON.parse(row.state).authority.players[0].p.rewardChest["magic-sword"], 4);
});

test("canvas clicks select the chest, not its rear display, and walk to the front", () => {
  const fs = require("fs"), vm = require("vm"), path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "../game/js/game.js"), "utf8");
  const c = { questId: "annihilator", player: { id: "1" } };
  const ctx = vm.createContext({ ANNIHILATOR: D, G: { combat: c, p: { id: "1" } } });
  vm.runInContext(source.slice(source.indexOf("function annihilatorChestClick("), source.indexOf("async function annihilatorPollChest(")), ctx);
  assert.equal(ctx.annihilatorChestClick({ cx: 21, cy: 7 }), false);
  assert.equal(ctx.annihilatorChestClick({ cx: 21, cy: 8 }), true);
  assert.equal(c.annihilatorPendingChest.reward, "demon-armor");
  assert.equal(c.player.walkGoal.cx, 21);
  assert.equal(c.player.walkGoal.cy, 9);
});

test("terminal recovery reuses an existing lobby and recreates it after a server restart", async () => {
  const fs = require("fs"), vm = require("vm"), path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "../game/js/quest-ui.js"), "utf8");
  for (const existing of [true, false]) {
    const calls = [], opened = [];
    const combat = { questId: "annihilator", players: [{ id: "1", p: { accountId: 9 } }] };
    const lobby = { lobbyId: "returned-lobby", phase: "lobby", participants: [{ id: 1 }] };
    const G = { combat, p: { accountId: 9 } };
    const ctx = vm.createContext({ G, setTimeout,
      questReturnToTemple: () => { G.combat = null; }, accountLastInstancePromise: async () => {},
      openQuestLobby: (state) => opened.push(state), questToast: (msg) => { throw Error(msg); },
      questFetch: async (method, url, body) => {
        calls.push({ method, url, body });
        return { status: 200, data: method === "GET" ? { lobbys: existing ? [lobby] : [] } : { ok: true, ...lobby } };
      } });
    vm.runInContext(source.slice(source.indexOf("function annihilatorReturnToLobby("), source.indexOf("function handleQuestEvent(")), ctx);
    assert.equal(ctx.annihilatorReturnToLobby(combat, "quest-fail"), false);
    assert.equal(ctx.annihilatorReturnToLobby(combat, "quest-completed"), true);
    assert.equal(ctx.annihilatorReturnToLobby(combat, "quest-completed"), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(opened.length, 1);
    assert.equal(calls.filter((c) => c.method === "POST").length, existing ? 0 : 1);
  }
});

test("reward tile opens the cart once after the Demons, and can reopen after leaving the tile", () => {
  const fs = require("fs"), vm = require("vm"), path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "../game/js/quest-ui.js"), "utf8");
  const c = { questId: "annihilator", player: { cx: 20, cy: 11, p: { hp: 100 } }, mobs: [{ hp: 100 }] };
  let opened = 0;
  const ctx = vm.createContext({ G: { combat: c }, ANNIHILATOR: D, questToast: () => {},
    openAnnihilatorRewardCart: async () => { opened++; } });
  vm.runInContext(source.slice(source.indexOf("function annihilatorPollRewardCart("), source.indexOf("async function openAnnihilatorRewardCart(")), ctx);
  ctx.annihilatorPollRewardCart();
  assert.equal(opened, 0);
  c.mobs = [];
  ctx.annihilatorPollRewardCart(); ctx.annihilatorPollRewardCart();
  assert.equal(opened, 1);
  c.player.cx = 21; ctx.annihilatorPollRewardCart();
  c.player.cx = 20; ctx.annihilatorPollRewardCart();
  assert.equal(opened, 2);
});

test("cart modal has four item boxes with minus/plus controls, exact total and a single confirmation", async () => {
  const fs = require("fs"), vm = require("vm"), path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "../game/js/quest-ui.js"), "utf8");
  const nodes = { "#anni-cart-close": {}, "#anni-cart-confirm": {} }, sent = [], combat = {};
  const buttons = D.rewards.flatMap((slug) => [-1, 1].map((change) => ({ dataset: { anniItem: slug, anniChange: String(change) } })));
  let closed = 0;
  const body = { innerHTML: "", querySelector: (id) => nodes[id] };
  const ctx = vm.createContext({ G: { combat }, ANNIHILATOR: D,
    GAMEDATA: { items: E.ITEMS }, questRewardImg: (slug) => '<img src="' + slug + '">',
    questPrepareModal: () => ({ body, modal: { classList: { remove: () => { closed++; } } } }),
    $: (id) => nodes[id], $$: () => buttons, questToast: () => {},
    annihilatorCartRequest: async (c, payload) => {
      if (payload.preview) return { count: 4, claimed: 0 };
      sent.push(payload.quantities); return { ok: true };
    } });
  vm.runInContext(source.slice(source.indexOf("async function openAnnihilatorRewardCart("), source.indexOf("function annihilatorReturnToLobby(")), ctx);
  await ctx.openAnnihilatorRewardCart(combat);
  assert.ok(body.innerHTML.includes("ESCOLHA 4 RECOMPENSAS"));
  assert.equal((body.innerHTML.match(/class="quest-reward-choice-card"/g) || []).length, 4);
  assert.ok(body.innerHTML.includes("−1") && body.innerHTML.includes("+1"));
  await nodes["#anni-cart-confirm"].onclick();
  assert.equal(sent.length, 0);
  for (let i = 0; i < 5; i++) buttons[1].onclick();
  assert.ok(body.innerHTML.includes("Selecionadas: 4/4"));
  buttons[0].onclick();
  assert.ok(body.innerHTML.includes("Selecionadas: 3/4"));
  await nodes["#anni-cart-confirm"].onclick();
  assert.equal(sent.length, 0);
  buttons[3].onclick();
  await Promise.all([nodes["#anni-cart-confirm"].onclick(), nodes["#anni-cart-confirm"].onclick()]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]["demon-armor"], 3);
  assert.equal(sent[0]["magic-sword"], 1);
  assert.equal(closed, 1);
});

const cartAuthority = () => ({ questId: "annihilator", annihilator: { phase: "rewards" },
  players: chars().map((p) => ({ id: String(p.id), accountId: 9, p: { ...p, accountId: 9 }, cx: 20, cy: 11 })) });

test("cart grants four freely distributed rewards in one transaction for the account", () => {
  const auth = cartAuthority();
  auth.players[3].p.hp = 0;
  assert.equal(E.annihilatorRewardOffer(auth, "1").count, 4);
  const result = E.claimAnnihilatorCart(auth, "1", { "demon-armor": 2, "magic-sword": 1, "stonecutter-axe": 1 });
  assert.equal(result.ok, true);
  assert.equal(auth.players[0].p.rewardChest["demon-armor"], 2);
  assert.equal(auth.players[0].p.rewardChest["magic-sword"], 1);
  assert.equal(auth.players[0].p.rewardChest["stonecutter-axe"], 1);
  assert.ok(auth.players.every((p) => p.p.quests.annihilator.completed));
  assert.equal(E.annihilatorRewardOffer(auth, "1").count, 0);
  assert.equal(E.claimAnnihilatorCart(auth, "1", { "demon-armor": 4 }).ok, false);
});

test("cart preserves the old individual claim and offers only the three remaining rewards", () => {
  const auth = cartAuthority();
  auth.players[0].p.quests = { annihilator: { completed: true, reward: "demon-armor" } };
  assert.equal(E.annihilatorRewardOffer(auth, "1", ["1"]).count, 3);
  assert.equal(E.claimAnnihilatorCart(auth, "1", { "magic-sword": 4 }, ["1"]).ok, false);
  assert.equal(E.claimAnnihilatorCart(auth, "1", { "magic-sword": 3 }, ["1"]).ok, true);
  assert.equal(auth.players[0].p.quests.annihilator.reward, "demon-armor");
});

test("cart rejects early, distant, malformed, underfilled and overfilled selections without mutation", () => {
  const auth = cartAuthority();
  for (const quantities of [null, [], { "demon-armor": -1 }, { "demon-armor": 1.5 },
    { "demon-armor": 3 }, { "demon-armor": 5 }, { "gold-coin": 4 }])
    assert.equal(E.claimAnnihilatorCart(auth, "1", quantities).ok, false);
  auth.players[0].cx = 21;
  assert.equal(E.claimAnnihilatorCart(auth, "1", { "demon-armor": 4 }).ok, false);
  auth.players[0].cx = 20; auth.annihilator.phase = "combat";
  assert.equal(E.claimAnnihilatorCart(auth, "1", { "demon-armor": 4 }).ok, false);
  assert.equal(auth.players[0].p.quests, undefined);
  assert.equal(auth.players[0].p.rewardChest, undefined);
});
