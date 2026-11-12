"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const js = path.join(__dirname, "../game/js");
function setup() {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", classList: { add() {}, remove() {} } });
    return nodes.get(id);
  };
  const ctx = { console, document: { readyState: "loading", addEventListener() {} }, G: { p: { id: "1", level: 600, bosses: { vemiath: { kills: 1 } } } },
    $: node, $$: () => [], mobImg: (slug) => `<img data-mob="${slug}">`,
    itemImg: (slug) => `<img data-item="${slug}">`,
    gnompronaHazardUnlock: () => 12, gnompronaHazardActive: () => 4 };
  ctx.window = ctx; vm.createContext(ctx);
  for (const file of ["questdata.js", "quest-ui.js"])
    vm.runInContext(fs.readFileSync(path.join(js, file), "utf8"), ctx, { filename: file });
  return { ctx, body: node("#modal-body") };
}
test("Bosses Quests contains two progress quests, Bloodrotten lives in World Quests", () => {
  const { ctx, body } = setup(); ctx.openQuestsModal();
  const bossSection = body.innerHTML.split("BOSSES QUESTS")[1];
  for (const id of ["soulwar-quest", "primal-ordeal"]) {
    assert.ok(bossSection.includes(`data-quest="${id}"`));
    assert.equal(ctx.QUEST_DEFS[id].playable, false);
  }
  /* The Blood Rotten Quest pertence à seção WORLD QUESTS (worldQuest:
   * true no QUEST_DEFS) — concluída ao derrotar Bakragore no world boss. */
  const worldSection = body.innerHTML.split("WORLD QUESTS")[1].split("BOSSES QUESTS")[0];
  assert.ok(worldSection.includes(`data-quest="bloodrotten-quest"`));
  assert.equal(ctx.QUEST_DEFS["bloodrotten-quest"].playable, false);
  assert.equal(ctx.QUEST_DEFS["bloodrotten-quest"].worldQuest, true);
  assert.ok(body.innerHTML.includes("WORLD QUESTS"));
  assert.ok(body.innerHTML.includes("PARTY QUESTS"));
});
test("boss quest details show recorded victories or account hazard, without creating a lobby", () => {
  const { ctx, body } = setup();
  for (const id of ["soulwar-quest", "primal-ordeal", "bloodrotten-quest"]) {
    ctx.openQuestDetail(id);
    assert.ok(body.innerHTML.includes("PROGRESSO REGISTRADO"));
    assert.ok(!body.innerHTML.includes("CREATE LOBBY"));
    assert.ok(!body.innerHTML.includes("quest-detail-start"));
  }
  ctx.openQuestDetail("bloodrotten-quest");
  assert.match(body.innerHTML, /vemiath[\s\S]*?1\/1/);
  ctx.openQuestDetail("primal-ordeal");
  assert.ok(body.innerHTML.includes("12/12"));
  assert.ok(body.innerHTML.includes("6/6"));
  assert.ok(body.innerHTML.includes("Hazard ativo: <b>4</b>"));
});
