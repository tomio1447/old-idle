"use strict";

const assert = require("node:assert/strict"), test = require("node:test");
const A = require("../server/annihilator"), D = require("../game/js/annihilator-data");
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
