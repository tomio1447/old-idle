"use strict";

const assert = require("node:assert/strict"), test = require("node:test");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const game = path.join(__dirname, "../game");
const source = fs.readFileSync(path.join(game, "js/game.js"), "utf8");
const ids = ["the-primal-menace", "magma-bubble", "court-warlock", "maior-domus", "phosphorus", "mitmah-vanguard", "bakragore"];
const element = { innerHTML: "" }, messages = [];
const ctx = { BOSS_COOLDOWN: 57600000, MEGA_TEST_BYPASS: false, console, $: () => element, $$: () => [], toast: (message) => messages.push(message),
  bossMobImg: (id) => `<span data-native-sprite="${id}"></span>` };
ctx.window = ctx;
vm.createContext(ctx);
const begin = source.indexOf("const BOSS_DEFS = {"), end = source.indexOf("\n};", begin) + 3;
assert.ok(begin >= 0 && end > begin);
vm.runInContext(source.slice(begin, end), ctx);
const bosses = vm.runInContext("BOSS_DEFS", ctx);
for (const id of Object.keys(bosses)) if (!ids.includes(id) && id !== "vladrukh") delete bosses[id];
const helperStart = source.indexOf("function bossState("), helperEnd = source.indexOf("\nfunction openBossesCatalogModal(", helperStart);
vm.runInContext(source.slice(helperStart, helperEnd), ctx);

function extractFunction(name) {
  const start = source.indexOf("function " + name + "("), end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

test("all seven requested bosses are preview-only and have local portraits", () => {
  for (const id of ids) {
    const boss = bosses[id];
    assert.equal(boss.unavailable, true);
    assert.equal(boss.hunt, undefined);
    assert.equal(ctx.bossReadyInfo({}, boss).ok, false);
    if (boss.portraitImage) {
      const bytes = fs.readFileSync(path.join(game, boss.portraitImage));
      assert.ok(["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()));
      assert.equal(bytes.readUInt16LE(6), 64);
      assert.equal(bytes.readUInt16LE(8), 64);
    } else assert.ok(fs.existsSync(path.join(game, "assets/mob", boss.sprite + ".png")));
  }
});

test("coming-soon section renders GIF portraits and native sheets without fallback placeholders for the new bosses", () => {
  ctx.renderBosses({ level: 100 });
  assert.ok(element.innerHTML.includes("EM BREVE"));
  for (const id of ids) {
    assert.ok(element.innerHTML.includes(`data-boss-info="${id}"`));
    const boss = bosses[id];
    assert.ok(element.innerHTML.includes(boss.portraitImage || `data-native-sprite="${id}"`));
  }
});

test("preview clicks show the correct boss name without opening combat details", () => {
  vm.runInContext(extractFunction("openBossModal"), ctx);
  for (const id of ids) { ctx.openBossModal(id); assert.ok(messages.at(-1).includes(bosses[id].name)); }
});

test("forced starts cannot enter unavailable bosses", () => {
  vm.runInContext(extractFunction("startBoss"), ctx);
  for (const id of ids) { ctx.startBoss(id, true, true); assert.ok(messages.at(-1).includes("em breve")); }
});
